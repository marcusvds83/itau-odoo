/**
 * routes/health.js - v6.1
 */
const express = require('express');
const router = express.Router();
const { getAccessToken, getTokenStatus } = require('../services/itau-auth');
const config = require('../config');

router.get('/', async (req, res) => {
  try {
    const tokenStatus = getTokenStatus();
    res.json({ status: 'ok', token: tokenStatus });
  } catch (err) {
    res.status(500).json({ status: 'erro', mensagem: err.message });
  }
});

router.get('/diag', async (req, res) => {
  try {
    const token = await getAccessToken();
    const mtls = config.createMtlsConfig();
    res.json({
      status: 'ok',
      token: { temToken: token, tamanho: token ? token.length : 0, prefixo: token ? token.substring(0, 20) + '...' : 'N/A' },
      mtls: { configurado: mtls.hasMtls, certTamanho: config.mtls.cert.length },
      banco: { agencia: config.banco.agencia, conta: config.banco.conta, idBeneficiario: config.banco.idBeneficiario, codigoCarteira: config.banco.codigoCarteira },
    });
  } catch (err) {
    res.status(500).json({ status: 'erro', mensagem: err.message });
  }
});

module.exports = router;
