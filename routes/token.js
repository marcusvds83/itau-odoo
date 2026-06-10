/**
 * routes/token.js - v6.1
 */
const express = require('express');
const router = express.Router();
const { authenticateApiKey } = require('../middleware/auth');
const { getAccessToken, invalidateToken, getTokenStatus } = require('../services/itau-auth');

router.get('/status', authenticateApiKey, (req, res) => {
  res.json(getTokenStatus());
});

router.post('/gerar', authenticateApiKey, async (req, res) => {
  try {
    invalidateToken();
    const token = await getAccessToken();
    res.json({ sucesso: true, token: token });
  } catch (err) {
    res.status(500).json({ sucesso: false, erro: err.message });
  }
});

module.exports = router;
