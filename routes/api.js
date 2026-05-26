const express = require('express');
const router = express.Router();
const { authenticateApiKey } = require('../middleware/auth');
const { emitirBoleto } = require('../services/itau-boleto');

router.post('/pagar', authenticateApiKey, async (req, res) => {
  try {
    const d = req.body;
    console.log('[API] Body recebido:', JSON.stringify(d));
    console.log('[API] Processando boleto...');
    const payload = {
      valor: d.valor || d.amount || d.amount_total || d.total || d.valor_total,
      cpfCnpjPagador: d.cpf_cnpj_pagador || d.cpfCnpj || d.cpf_cnpj_pagador_pag || '',
      nomePagador: d.nome_pagador || d.nome || d.partner_name || '',
      numeroPedido: d.numero_pedido || d.invoice_id || d.name || '',
      descricao: d.descricao || 'Pagamento AJL Ferro e Aco'
    };
    console.log('[API] Payload mapeado:', JSON.stringify(payload));
    const resultado = await emitirBoleto(payload);
    res.json({ sucesso: true, mensagem: 'Boleto emitido', dados: resultado.dados });
  } catch (error) {
    console.error('Erro middleware:', error.message);
    res.status(500).json({ sucesso: false, erro: error.message });
  }
});

module.exports = router;
