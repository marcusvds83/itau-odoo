// ============================================
// MIDDLEWARE: Autenticacao de requests do Odoo
// ============================================
// Valida que requests vindos do Odoo tenham a API Key correta

const config = require('../config');
const logger = require('../utils/logger');

/**
 * Middleware que valida a API Key nos headers
 * Uso: Authorization: Bearer <API_SECRET_KEY>
 * ou via header custom: x-api-key: <API_SECRET_KEY>
 */
function authenticateOdoo(req, res, next) {
  // Busca token no header Authorization ou x-api-key
  const authHeader = req.headers['authorization'];
  const apiKey = req.headers['x-api-key'];

  let providedKey = null;

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
    return res.status(403).json({
      success: false,
      message: 'API Key invalida',
    });
  }

  next();
}

/**
 * Middleware de validacao de webhook do Itau
 * Verifica a assinatura do callback para garantir autenticidade
 */
function validateItauWebhook(req, res, next) {
  const signature = req.headers['x-itau-signature'];

  if (!signature && config.ambiente === 'producao') {
    logger.warn('Webhook recebido sem assinatura');
    return res.status(403).json({
      success: false,
      message: 'Assinatura do webhook ausente',
    });
  }

  // Em sandbox, aceita sem validacao rigorosa
  // Em producao, implementar validacao HMAC
  if (config.ambiente === 'producao' && signature) {
    // TODO: Implementar validacao HMAC com WEBHOOK_SECRET
    // const payload = JSON.stringify(req.body);
    // const expected = crypto.createHmac('sha256', config.webhookSecret).update(payload).digest('hex');
    // if (signature !== expected) { return res.status(403)... }
  }

  next();
}

module.exports = {
  authenticateOdoo,
  validateItauWebhook,
};
