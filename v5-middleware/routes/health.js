// ============================================
// ROTA DE SAUDE / STATUS v5.0
// ============================================

const express = require('express');
const router = express.Router();
const config = require('../config');
const logger = require('../utils/logger');

router.get('/health', async function(req, res) {
  var health = {
    status: 'ok',
    versao: config.versao,
    timestamp: new Date().toISOString(),
    ambiente: config.ambiente,
    uptime: process.uptime(),
    mockMode: config.mockMode,
    services: {
      itau: 'unknown',
    },
    credenciais: {
      clientId: config.itau.clientId ? 'configurado' : 'nao configurado',
      tempToken: config.itau.tempToken ? 'configurado' : 'nao configurado',
      clientSecret: config.itau.clientSecret ? 'configurado' : 'nao configurado',
      mTLS: config.hasMtls ? 'configurado' : 'nao configurado',
      pixChave: config.itau.pixChave ? 'configurado' : 'nao configurado',
    },
  };

  if (config.mockMode) {
    health.services.itau = 'mock';
  } else {
    try {
      var { getToken } = require('../services/itau-auth');
      await getToken();
      health.services.itau = 'ok';
    } catch (e) {
      health.services.itau = 'error: ' + e.message;
      health.status = 'degraded';
    }
  }

  var statusCode = health.status === 'ok' ? 200 : 503;
  res.status(statusCode).json(health);
});

router.get('/', function(req, res) {
  res.json({
    name: 'Middleware Itau-Odoo',
    version: config.versao,
    ambiente: config.ambiente,
    mockMode: config.mockMode,
    endpoints: {
      api: '/api/*',
      webhook: '/webhook/*',
      health: '/health',
      pdf: '/boleto/:id/pdf',
    },
    credenciais_itau: {
      clientId: config.itau.clientId ? '***' + config.itau.clientId.slice(-4) : 'NAO CONFIGURADO',
      tempToken: config.itau.tempToken ? 'CONFIGURADO' : 'NAO CONFIGURADO',
      clientSecret: config.itau.clientSecret ? 'CONFIGURADO' : 'NAO CONFIGURADO',
      mTLS: config.hasMtls ? 'CONFIGURADO' : 'NAO CONFIGURADO',
    },
  });
});

module.exports = router;
