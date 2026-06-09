/**
 * routes/api.js - v6.3
 * Rota compativel com Odoo (/api/pagar)
 * Mapeia campos aninhados do Odoo para o payload BoleCode OFICIAL
 * Retorna campos flat que o Odoo precisa preencher
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

    // Extrai campos relevantes da resposta Itau para Odoo
    const dados = resultado.dados && resultado.dados.data ? resultado.dados.data : {};
    const individuais = (dados.dado_boleto && dados.dado_boleto.dados_individuais_boleto && dados.dado_boleto.dados_individuais_boleto[0]) || {};
    const qrcode = dados.dados_qrcode || {};

    // Retorna no formato flat que o Odoo espera
    res.json({
      sucesso: true,
      mensagem: 'Boleto emitido com sucesso',
      itau_linha_digitavel: individuais.numero_linha_digitavel || '',
      itau_codigo_barras: individuais.codigo_barras || '',
      itau_txid: qrcode.txid || '',
      itau_pix_copia_cola: qrcode.emv || '',
      itau_qrcode_base64: qrcode.base64 || '',
      itau_nosso_numero: individuais.numero_nosso_numero || '',
      itau_data_vencimento: individuais.data_vencimento || '',
      itau_valor_titulo: individuais.valor_titulo || '',
      itau_link_url: qrcode.location || '',
      itau_situacao: dados.etapa_processo_boleto || '',
      dados_completos: resultado.dados
    });
  } catch (error) {
    console.error('Erro middleware:', error.message);
    res.status(500).json({ sucesso: false, erro: error.message });
  }
});

module.exports = router;
