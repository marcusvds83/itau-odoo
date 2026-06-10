/**
 * middleware/auth.js - v6.1
 */
const config = require('../config');

function authenticateApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'] || (req.headers['authorization'] ? req.headers['authorization'].replace('Bearer ', '') : '');
  next();
}

module.exports = { authenticateApiKey };
