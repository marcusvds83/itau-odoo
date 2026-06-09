/**
 * routes/boletos.js - v6.4
 * Rotas de boletos: GET PDF, consulta
 */
const express = require('express');
const router = express.Router();
const { authenticateApiKey } = require('../middleware/auth');
const { generatePdf } = require('../services/pdf-boleto');

router.get('/pdf/:txid', async (req, res) => {
  try {
    const txid = req.params.txid;
    console.log('[BOLETOS] PDF solicitado TXID:', txid);
    const pdfBuffer = await generatePdf(txid);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="boleto-' + txid + '.pdf"');
    res.send(pdfBuffer);
  } catch (error) {
    console.error('[BOLETOS] Erro PDF:', error.message);
    res.status(404).json({ erro: 'Boleto nao encontrado' });
  }
});

module.exports = router;
