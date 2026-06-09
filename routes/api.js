const express = require('express');
const router = express.Router();
const { authenticateApiKey } = require('../middleware/auth');
const { emitirBoleto } = require('../services/itau-boleto');

router.post('/pagar', authenticateApiKey, async (req, res) => {
  try {
    const d = req.body;
    console.log('[API] Body:', JSON.stringify(d));
    const fat = d.fatura || {};
    const pag = d.pagador || {};
    const payload = {
      valor: fat.valor_nominal || d.valor || d.amount,
      cpfCnpjPagador: pag.cpf_cnpj || d.cpfCnpj || '',
      nomePagador: pag.nome || d.nome || '',
      numeroPedido: fat.seu_numero || fat.name || '',
      dataVencimento: fat.data_vencimento || '',
      logradouro: pag.street || '',
      bairro: pag.bairro || '',
      cidade: pag.city || '',
      estado: pag.state || '',
      cep: pag.zip || '',
    };
    console.log('[API] Payload:', JSON.stringify(payload));
    const resultado = await emitirBoleto(payload);
    res.json({ sucesso: true, mensagem: 'Boleto emitido', dados: resultado.dados });
  } catch (error) {
    console.error('Erro middleware:', error.message);
    res.status(500).json({ sucesso: false, erro: error.message });
  }
});

module.exports = router;
