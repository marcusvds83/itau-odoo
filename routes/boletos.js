const express = require('express');
const router = express.Router();
const { storeBoleto, getBoleto, generatePdfFromData } = require('../services/pdf-boleto');
router.post('/pdf', async function(req, res) {
  try { var b = await generatePdfFromData(req.body); res.setHeader('Content-Type','application/pdf'); res.setHeader('Content-Disposition','inline; filename=boleto.pdf'); res.send(b); }
  catch(e) { res.status(500).json({erro:e.message}); }
});
router.get('/pdf/:txid', async function(req, res) {
  try { var b = await generatePdf(req.params.txid); res.setHeader('Content-Type','application/pdf'); res.setHeader('Content-Disposition','inline; filename=boleto-'+req.params.txid+'.pdf'); res.send(b); }
  catch(e) { res.status(404).json({erro:'Nao encontrado'}); }
});
module.exports = router;
