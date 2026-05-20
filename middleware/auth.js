// ============================================
// MIDDLEWARE: Autenticacao v5.0
// ============================================

const config = require('../config');
const logger = require('../utils/logger');

function authenticateOdoo(req, res, next) {
  var authHeader = req.headers['authorization'];
  var apiKey = req.headers['x-api-key'];
  var providedKey = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    providedKey = authHeader.substring(7);
  } else if (apiKey) {
    providedKey = apiKey;
  }

  if (!providedKey) {
    logger.warn('Request sem API Key', { ip: req.ip, path: req.path });
    return res.status(401).json({
      success: false,
      message: 'API Key obrigatoria. Envie no header Authorization: Bearer <key> ou x-api-key: <key>',
    });
  }

  if (providedKey !== config.apiSecretKey) {
    logger.warn('API Key invalida', { ip: req.ip, path: req.path });
    return res.status(403).json({ success: false, message: 'API Key invalida' });
  }

  next();
}

function validateItauWebhook(req, res, next) {
  var signature = req.headers['x-itau-signature'];
  if (!signature && config.ambiente === 'producao') {
    logger.warn('Webhook recebido sem assinatura');
  }
  // Em sandbox/teste, aceita sem validacao rigorosa
  next();
}

module.exports = { authenticateOdoo: authenticateOdoo, validateItauWebhook: validateItauWebhook };
