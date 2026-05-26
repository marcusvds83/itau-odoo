/**
 * routes/boletos.js - v6.1
 */
const express = require('express');
const router = express.Router();
const { authenticateApiKey } = require('../middleware/auth');
const { emitirBoleto, consultarBoleto } = require('../services/itau-boleto');

router.post('/emitir', authenticateApiKey, async (req, res) => {
  try {
    const dados = req.body;
    const resultado = await emitirBoleto(dados);
    res.json({ sucesso: true, mensagem: 'Boleto emitido com sucesso', dados: resultado.dados });
  } catch (error) {
    console.error('[ROTA /boletos/emitir] Erro:', error.message);
    res.status(500).json({ sucesso: false, erro: error.message });
  }
});

router.get('/:txid', authenticateApiKey, async (req, res) => {
  try {
    const { txid } = req.params;
    const resultado = await consultarBoleto(txid);
    res.json({ sucesso: true, dados: resultado.dados });
  } catch (error) {
    console.error('[ROTA /boletos/:txid] Erro:', error.message);
    res.status(500).json({ sucesso: false, erro: error.message });
  }
});

module.exports = router;
