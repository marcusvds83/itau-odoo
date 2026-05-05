// ============================================
// ROTA DE SAUDE / STATUS
// ============================================

const express = require('express');
const router = express.Router();
const config = require('../config');
const logger = require('../utils/logger');

/**
 * GET /health
 * Verifica saude do middleware e suas conexoes
 */
router.get('/health', async (req, res) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    ambiente: config.ambiente,
    uptime: process.uptime(),
    services: {
      itau: 'unknown',
      rede: 'unknown',
      odoo: 'unknown',
    },
    mockMode: config.mockMode,
  };

  // Testa conexao com o Itau (token)
  if (config.mockMode) {
    health.services.itau = 'mock';
  } else {
    try {
      const { getToken } = require('../services/itau-auth');
      await getToken();
      health.services.itau = 'ok';
    } catch (e) {
      health.services.itau = 'error: ' + e.message;
      health.status = 'degraded';
    }
  }

  // Testa conexao com a Rede
  try {
    const { getRedeToken } = require('../services/itau-cartao');
    if (config.rede.clientId) {
      await getRedeToken();
      health.services.rede = 'ok';
    } else {
      health.services.rede = 'not_configured';
    }
  } catch (e) {
    health.services.rede = 'error: ' + e.message;
    health.status = 'degraded';
  }

  // Testa conexao com o Odoo
  try {
    const { getOdooClient } = require('../services/odoo-api');
    const odoo = getOdooClient();
    await odoo.authenticate();
    health.services.odoo = 'ok';
  } catch (e) {
    health.services.odoo = 'error: ' + e.message;
    health.status = 'degraded';
  }

  const statusCode = health.status === 'ok' ? 200 : 503;
  res.status(statusCode).json(health);
});

/**
 * GET /
 * Pagina de boas-vindas da API
 */
router.get('/', (req, res) => {
  res.json({
    name: 'Middleware Itau-Odoo',
    version: '4.0.0',
    ambiente: config.ambiente,
    endpoints: {
      api: '/api/*',
      webhook: '/webhook/*',
      health: '/health',
    },
    docs: 'Consulte a documentacao no repositorio.',
  });
});

module.exports = router;
