// ============================================
// ROTAS: WEBHOOKS DO ITAU v5.0
// ============================================

const express = require('express');
const router = express.Router();
var validateItauWebhook = require('../middleware/auth').validateItauWebhook;
const logger = require('../utils/logger');

// WEBHOOK BOLETO
router.post('/boleto', validateItauWebhook, async function(req, res) {
  try {
    var payload = req.body;
    logger.info('Webhook BOLETO recebido', payload);
    res.status(200).json({ received: true });
    // TODO: Integrar com Odoo quando webhook estiver configurado
    logger.info('Webhook boleto processado (Odoo update pendente)');
  } catch (error) {
    logger.error('Erro webhook boleto: ' + error.message);
    res.status(500).json({ error: error.message });
  }
});

// WEBHOOK PIX
router.post('/pix', validateItauWebhook, async function(req, res) {
  try {
    var payload = req.body;
    logger.info('Webhook PIX recebido', payload);
    res.status(200).json({ received: true });
    logger.info('Webhook PIX processado (Odoo update pendente)');
  } catch (error) {
    logger.error('Erro webhook PIX: ' + error.message);
    res.status(500).json({ error: error.message });
  }
});

// WEBHOOK CARTAO / LINK
router.post('/link', validateItauWebhook, async function(req, res) {
  try {
    var payload = req.body;
    logger.info('Webhook LINK recebido', payload);
    res.status(200).json({ received: true });
    logger.info('Webhook link processado (Odoo update pendente)');
  } catch (error) {
    logger.error('Erro webhook link: ' + error.message);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
