const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const config = require('./config');
const logger = require('./utils/logger');

const app = express();

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: function (origin, callback) { callback(null, true); },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key', 'x-itau-signature'],
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('combined'));

var limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { success: false, message: 'Muitas requisicoes.' },
});
app.use('/api/', limiter);

// ROTAS
app.use('/', require('./routes/health'));
app.use('/api', require('./routes/odoo'));
app.use('/webhook', require('./routes/webhook'));

// ERROR HANDLER
app.use(function(err, req, res, next) {
  logger.error('Erro nao tratado: ' + err.message, { stack: err.stack });
  res.status(500).json({ success: false, message: 'Erro interno' });
});

// STARTUP
var PORT = config.port;
app.listen(PORT, function() {
  logger.info('='.repeat(60));
  logger.info('  Middleware Itau-Odoo v5.6 [PRODUCAO]');
  logger.info('  Ambiente: ' + config.ambiente);
  logger.info('  Porta: ' + PORT);
  logger.info('  mTLS: ' + (config.mtls && config.mtls.hasMtls ? 'SIM (' + (config.mtls.cert ? config.mtls.cert.length + ' chars)' : 'VAZIO') : 'NAO'));
  logger.info('  Client ID: ' + (config.itau.clientId ? '***' + config.itau.clientId.slice(-4) : 'NAO'));
  logger.info('  Client Secret: ' + (config.itau.clientSecret ? 'SIM' : 'NAO'));
  logger.info('  Mock Mode: ' + config.mockMode);
  logger.info('  URL Itau: ' + config.itauBaseUrl);
  logger.info('  URL Token: ' + config.itauTokenUrl);
  logger.info('='.repeat(60));
});

process.on('SIGTERM', function() { process.exit(0); });
process.on('SIGINT', function() { process.exit(0); });

module.exports = app;
