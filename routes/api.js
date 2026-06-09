/**
 * routes/api.js - v6.4
 * Rota compativel com Odoo (/api/pagar)
 * Armazena boleto e retorna PDF URL
 */
const express = require('express');
const router = express.Router();
const { authenticateApiKey } = require('../middleware/auth');
const { emitirBoleto } = require('../services/itau-boleto');
const { storeBoleto } = require('../services/pdf-boleto');

router.post('/pagar', authenticateApiKey, async (req, res) => {
  try {
    const d = req.body;
    console.log('[API] Body recebido:', JSON.stringify(d));

    const fat = d.fatura || {};
    const pag = d.pagador || {};
    const emp = d.empresa || {};

    const payload = {
      valor: fat.valor_nominal || d.valor || d.amount,
      cpfCnpjPagador: pag.cpf_cnpj || d.cpfCnpj || '',
      nomePagador: pag.nome || d.nome || '',
      numeroPedido: fat.seu_numero || fat.name || d.numero_pedido || '',
      dataVencimento: fat.data_vencimento || '',
      descricao: fat.name || fat.seu_numero || 'Pagamento AJL Ferro e Aco',
      logradouro: pag.street || d.logradouro || '',
      bairro: pag.bairro || d.bairro || '',
      cidade: pag.city || d.cidade || '',
      estado: pag.state || d.estado || '',
      cep: pag.zip || d.cep || '',
    };

    console.log('[API] Payload mapeado:', JSON.stringify(payload));
    const resultado = await emitirBoleto(payload);

    const dados = resultado.dados && resultado.dados.data ? resultado.dados.data : {};
    const individuais = (dados.dado_boleto && dados.dado_boleto.dados_individuais_boleto && dados.dado_boleto.dados_individuais_boleto[0]) || {};
    const qrcode = dados.dados_qrcode || {};
    const txid = qrcode.txid || ('BL' + Date.now());

    // Armazena dados do boleto para gerar PDF depois
    storeBoleto(txid, {
      txid: txid,
      nosso_numero: individuais.numero_nosso_numero || '',
      linha_digitavel: individuais.numero_linha_digitavel || '',
      codigo_barras: individuais.codigo_barras || '',
      data_vencimento: individuais.data_vencimento || '',
      valor_titulo: individuais.valor_titulo || '',
      pix_copia_cola: qrcode.emv || '',
      qrcode_base64: qrcode.base64 || '',
      nome_pagador: payload.nomePagador,
      cpf_cnpj_pagador: payload.cpfCnpjPagador,
      logradouro: payload.logradouro,
      cidade: payload.cidade,
      estado: payload.estado,
      seu_numero: payload.numeroPedido,
    });

    const valorCentavos = parseInt(String(individuais.valor_titulo || '0'), 10);
    const valorReais = (valorCentavos / 100).toFixed(2);

    const pdfUrl = 'https://itau-odoo.onrender.com/boletos/pdf/' + txid;

    console.log('[API] Boleto armazenado. PDF URL:', pdfUrl);

    res.json({
      success: true,
      data: {
        pagamentos: [
          {
            tipo: "boleto",
            nosso_numero: individuais.numero_nosso_numero || '',
            linha_digitavel: individuais.numero_linha_digitavel || '',
            codigo_barras: individuais.codigo_barras || '',
            pix_copia_cola: qrcode.emv || '',
            txid: txid,
            valor_titulo: valorReais,
            pdf_url: pdfUrl
          }
        ]
      }
    });
  } catch (error) {
    console.error('Erro middleware:', error.message);
    res.json({ success: false, message: error.message });
  }
});

module.exports = router;
