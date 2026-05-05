// ============================================
// SERVER.JS - Aplicacao Principal
// ============================================
// Middleware de integracao entre Odoo 19 SaaS e Itau
// Tecnologias: Node.js + Express + Axios
// Deploy: Render.com (free tier)

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const config = require('./config');
const logger = require('./utils/logger');

// Inicializa Express
const app = express();

// =============================================
// MIDDLEWARES
// =============================================

// Seguridad basica
app.use(helmet({
  contentSecurityPolicy: false, // Desabilita CSP para permitir requests de qualquer origem
}));

// CORS - Permite requests do Odoo SaaS
app.use(cors({
  origin: function (origin, callback) {
    // Permite requests sem origin (server-to-server)
    if (!origin) return callback(null, true);
    // Permite qualquer origem (configurar lista branca em producao)
    const allowedOrigins = [
      /.*\.odoo\.com$/,
      /.*\.odoo\.com\.br$/,
    ];
    if (allowedOrigins.some(regex => regex.test(origin))) {
      return callback(null, true);
    }
    // Permite qualquer origem se nao configurado
    return callback(null, true);
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key', 'x-itau-signature'],
}));

// Body parser
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Logging HTTP
app.use(morgan('combined'));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 200, // Max 200 requests por janela
  message: { success: false, message: 'Muitas requisicoes. Tente novamente em 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// Rate limit mais restrito para endpoints sensiveis
const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
});
app.use('/api/cartao/', strictLimiter);
app.use('/api/pix/', strictLimiter);

// =============================================
// ROTAS
// =============================================

// Health check e info
app.use('/', require('./routes/health'));

// API principal (protegida por API Key)
app.use('/api', require('./routes/odoo'));

// Webhooks recebidos do Itau (validacao de assinatura)
app.use('/webhook', require('./routes/webhook'));

// =============================================
// ERROR HANDLER
// =============================================

app.use((err, req, res, next) => {
  logger.error('Erro nao tratado: ' + err.message, { stack: err.stack });
  res.status(500).json({
    success: false,
    message: 'Erro interno do servidor',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

// =============================================
// INICIALIZACAO
// =============================================

const PORT = config.port;

app.listen(PORT, () => {
  logger.info('='.repeat(60));
  logger.info('  Middleware Itau-Odoo v1.0.0');
  logger.info(`  Ambiente: ${config.ambiente}`);
  logger.info(`  Porta: ${PORT}`);
  logger.info(`  URL: http://localhost:${PORT}`);
  logger.info('='.repeat(60));
  logger.info('Endpoints disponiveis:');
  logger.info('  GET  /           - Info da API');
  logger.info('  GET  /health     - Status dos servicos');
  logger.info('  POST /api/boleto/emitir          - Emitir boleto');
  logger.info('  GET  /api/boleto/consultar        - Consultar boletos');
  logger.info('  POST /api/boleto/:id/baixa        - Baixar boleto');
  logger.info('  POST /api/boleto/:id/vencimento   - Alterar vencimento');
  logger.info('  POST /api/pix/criar               - Criar cobranca PIX');
  logger.info('  GET  /api/pix/consultar/:txid     - Consultar PIX');
  logger.info('  POST /api/pix/devolver            - Devolver PIX');
  logger.info('  POST /api/cartao/autorizar        - Pagar com cartao');
  logger.info('  POST /api/cartao/cancelar         - Cancelar cartao');
  logger.info('  POST /webhook/boleto              - Webhook boleto pago');
  logger.info('  POST /webhook/pix                 - Webhook PIX recebido');
  logger.info('  POST /webhook/cartao              - Webhook cartao');
  logger.info('='.repeat(60));
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM recebido. Encerrando servidor...');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT recebido. Encerrando servidor...');
  process.exit(0);
});

module.exports = app;
