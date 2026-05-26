const express = require('express');
const router = express.Router();
const { authenticateApiKey } = require('../middleware/auth');
const { emitirBoleto } = require('../services/itau-boleto');

router.post('/pagar', authenticateApiKey, async (req, res) => {
  try {
    const d = req.body;
    console.log('[API] Processando boleto...');
    const payload = {
      valor: d.valor || d.amount,
      cpfCnpjPagador: d.cpf_cnpj_pagador || d.cpfCnpj || '',
      nomePagador: d.nome_pagador || d.nome || '',
      numeroPedido: d.numero_pedido || d.invoiceId || '',
      descricao: d.descricao || 'Pagamento AJL Ferro e Aco'
    };
    const resultado = await emitirBoleto(payload);
    res.json({ sucesso: true, mensagem: 'Boleto emitido', dados: resultado.dados });
  } catch (error) {
    console.error('Erro middleware:', error.message);
    res.status(500).json({ sucesso: false, erro: error.message });
  }
});

module.exports = router;