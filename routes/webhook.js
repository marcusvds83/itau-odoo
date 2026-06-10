/**
 * routes/webhook.js - v6.1
 */
const express = require('express');
const router = express.Router();

router.post('/pix-confirmacao', (req, res) => {
  console.log('[WEBHOOK] PIX confirmacao recebida:', JSON.stringify(req.body, null, 2));
  res.json({ status: 'recebido' });
});

router.post('/bolecode-confirmacao', (req, res) => {
  console.log('[WEBHOOK] BoleCode confirmacao recebida:', JSON.stringify(req.body, null, 2));
  res.json({ status: 'recebido' });
});

module.exports = router;
