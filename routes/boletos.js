const express = require('express');
const router = express.Router();
const { storeBoleto, getBoleto, generatePdf, generatePdfFromData } = require('../services/pdf-boleto');

router.post('/pdf', async function(req, res) {
  try {
    var b = await generatePdfFromData(req.body);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename=boleto.pdf');
    res.send(b);
  } catch(e) {
    console.error('[BOLETOS] Erro PDF POST:', e.message, e.stack);
    res.status(500).json({ erro: e.message });
  }
});

router.get('/pdf/:txid', async function(req, res) {
  try {
    var txid = req.params.txid;
    console.log('[BOLETOS] PDF GET txid:', txid);
    var b = await generatePdf(txid);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename=boleto-' + txid + '.pdf');
    res.send(b);
  } catch(e) {
    console.error('[BOLETOS] Erro PDF GET:', e.message, e.stack);
    res.status(404).json({ erro: e.message });
  }
});

module.exports = router;
