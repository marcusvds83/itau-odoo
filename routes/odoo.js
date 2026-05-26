// ============================================
// ROTAS: INTEGRACAO ODOO <-> MIDDLEWARE v5.0
// ============================================

const express = require('express');
const router = express.Router();
var authenticateOdoo = require('../middleware/auth').authenticateOdoo;
const logger = require('../utils/logger');
const boletoService = require('../services/itau-boleto');
const pixService = require('../services/itau-pix');
const paymentService = require('../services/payment-method');
const config = require('../config');
const { getTokenStatus } = require('../services/itau-auth');

router.use(authenticateOdoo);

// =============================================
// ENDPOINTS DE BOLETO
// =============================================

router.post('/boleto/emitir', async function(req, res) {
  try {
    var resultado = await boletoService.emitirBoleto(req.body);
    res.json({ success: true, data: resultado });
  } catch (error) {
    logger.error('Erro ao emitir boleto: ' + error.message);
    res.status(error.status || 500).json({ success: false, message: error.message, detail: error.detail });
  }
});

router.get('/boleto/consultar', async function(req, res) {
  try {
    var resultado = await boletoService.consultarBoletos(req.query);
    res.json({ success: true, data: resultado });
  } catch (error) {
    logger.error('Erro ao consultar boletos: ' + error.message);
    res.status(error.status || 500).json({ success: false, message: error.message });
  }
});

router.post('/boleto/:id/baixa', async function(req, res) {
  try {
    var resultado = await boletoService.baixarBoleto(req.params.id);
    res.json({ success: true, data: resultado });
  } catch (error) {
    logger.error('Erro ao baixar boleto: ' + error.message);
    res.status(error.status || 500).json({ success: false, message: error.message });
  }
});

router.post('/boleto/:id/vencimento', async function(req, res) {
  try {
    if (!req.body.nova_data) return res.status(400).json({ success: false, message: 'nova_data obrigatoria' });
    var resultado = await boletoService.alterarVencimento(req.params.id, req.body.nova_data);
    res.json({ success: true, data: resultado });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, message: error.message });
  }
});

router.get('/boleto/:id/pdf', async function(req, res) {
  try {
    var resultado = await boletoService.obterPdfBoleto(req.params.id);
    res.json({ success: true, data: resultado });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, message: error.message });
  }
});

// =============================================
// ENDPOINTS PIX
// =============================================

router.post('/pix/criar', async function(req, res) {
  try {
    var resultado = await pixService.criarCobrancaPix(req.body);
    res.json({ success: true, data: resultado });
  } catch (error) {
    logger.error('Erro ao criar PIX: ' + error.message);
    res.status(error.status || 500).json({ success: false, message: error.message, detail: error.detail });
  }
});

router.get('/pix/consultar/:txid', async function(req, res) {
  try {
    var resultado = await pixService.consultarCobrancaPix(req.params.txid);
    res.json({ success: true, data: resultado });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, message: error.message });
  }
});

router.post('/pix/configurar-webhook', async function(req, res) {
  try {
    if (!req.body.chave || !req.body.webhook_url) return res.status(400).json({ success: false, message: 'chave e webhook_url obrigatorios' });
    var resultado = await pixService.configurarWebhookPix(req.body.chave, req.body.webhook_url);
    res.json({ success: true, data: resultado });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, message: error.message });
  }
});

// =============================================
// ENDPOINT UNIVERSAL: /api/pagar v5.0
// =============================================

router.get('/pagar/metodos', async function(req, res) {
  try {
    res.json({ success: true, mock: config.mockMode, data: paymentService.listarMetodos() });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/pagar/testar/:forma', async function(req, res) {
  try {
    var parsed = paymentService.parseMethod(req.params.forma);
    res.json({ success: true, mock: config.mockMode, forma: req.params.forma, parsed: parsed });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/pagar', async function(req, res) {
  try {
    var formaPagamento = req.body.forma_pagamento;
    if (!formaPagamento) return res.status(400).json({ success: false, message: 'forma_pagamento e obrigatoria' });
    var resultado = await paymentService.processarPagamento(formaPagamento, req.body);
    res.json({ success: true, data: resultado });
  } catch (error) {
    logger.error('Erro ao processar pagamento: ' + error.message);
    res.status(error.status || 500).json({ success: false, message: error.message, detail: error.detail });
  }
});

// =============================================
// ENDPOINT DE STATUS DAS CREDENCIAIS v5.0
// =============================================

router.get('/status/credenciais', async function(req, res) {
  try {
    var tokenInfo = getTokenStatus();
    res.json({
      success: true,
      versao: config.versao,
      ambiente: config.ambiente,
      mockMode: config.mockMode,
      credenciais: {
        clientId: config.itau.clientId ? config.itau.clientId.substring(0, 8) + '...' : null,
        hasTempToken: !!config.itau.tempToken,
        hasClientSecret: !!config.itau.clientSecret,
        hasPixChave: !!config.itau.pixChave,
        hasMtls: config.hasMtls,
      },
      token: tokenInfo,
      urls: {
        token: config.itauTokenUrl,
        boletos: config.itauBaseUrl,
        pix: config.itauPixUrl,
        bolecode: config.bolecodeUrl,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
