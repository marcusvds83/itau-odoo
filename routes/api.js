/**
 * routes/api.js - v6.3
 * Rota compativel com Odoo (/api/pagar)
 * Resposta no formato EXATO que o Odoo espera
 */
const express = require('express');
const router = express.Router();
const { authenticateApiKey } = require('../middleware/auth');
const { emitirBoleto } = require('../services/itau-boleto');

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

    // Extrai campos da resposta Itau
    const dados = resultado.dados && resultado.dados.data ? resultado.dados.data : {};
    const individuais = (dados.dado_boleto && dados.dado_boleto.dados_individuais_boleto && dados.dado_boleto.dados_individuais_boleto[0]) || {};
    const qrcode = dados.dados_qrcode || {};

    // Retorna no formato EXATO que o Odoo espera
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
            txid: qrcode.txid || '',
            qrcode_base64: qrcode.base64 || '',
            data_vencimento: individuais.data_vencimento || '',
            valor_titulo: individuais.valor_titulo || ''
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
