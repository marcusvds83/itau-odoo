// ============================================
// SERVER.JS - Middleware Itau-Odoo v5.0
// ============================================
// Integracao real com APIs do Itau
// Suporta: Token temporario, OAuth2, mTLS
// Mock mode: MOCK_MODE=true (padrao para sandbox)
// Producao: MOCK_MODE=false + credenciais reais

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const config = require('./config');
const logger = require('./utils/logger');
const dayjs = require('dayjs');

var app = express();

// =============================================
// MIDDLEWARES
// =============================================

app.use(helmet({ contentSecurityPolicy: false }));

app.use(cors({
  origin: function(origin, callback) {
    if (!origin) return callback(null, true);
    // Odoo SaaS domains
    var allowed = [/.*\.odoo\.com$/, /.*\.odoo\.com\.br$/];
    if (allowed.some(function(r) { return r.test(origin); })) return callback(null, true);
    return callback(null, true); // Permite qualquer origem durante teste
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key', 'x-itau-signature'],
}));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('combined'));

var limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { success: false, message: 'Muitas requisicoes. Tente novamente em 15 minutos.' },
});
app.use('/api/', limiter);

// =============================================
// ROTAS
// =============================================

app.use('/', require('./routes/health'));
app.use('/api', require('./routes/odoo'));
app.use('/webhook', require('./routes/webhook'));

// =============================================
// PDF PUBLICO DO BOLETO
// =============================================

app.get('/boleto/:id/pdf', async function(req, res) {
  try {
    var id = req.params.id;
    var pdfBase64;

    if (config.mockMode) {
      var content = '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n';
      content += '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n';
      content += '3 0 obj\n<< /Type /Page /MediaBox [0 0 612 792] /Parent 2 0 R /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n';
      content += '4 0 obj\n<< /Length 200 >>\nstream\n';
      content += 'BT\n/F1 18 Tf\n72 700 Td\n(AJL Ferro e Aco) Tj\n0 -30 Td\n(Curitiba - PR) Tj\n';
      content += '0 -30 Td\n(Itau-Odoo v5.0 - MOCK) Tj\n';
      content += '0 -30 Td\n(Boleto: ' + id + ') Tj\n';
      content += '0 -30 Td\n(Data: ' + dayjs().format('DD/MM/YYYY HH:mm') + ') Tj\n';
      content += '0 -30 Td\n(Documento simulado - nao utilizar para pagamento real) Tj\n';
      content += 'ET\nendstream\nendobj\n';
      content += '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n';
      content += 'xref\n0 6\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000284 00000 n \n0000000545 00000 n \n';
      content += 'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n623\n%%EOF';
      pdfBase64 = Buffer.from(content).toString('base64');
    } else {
      var boletoService = require('./services/itau-boleto');
      var resultado = await boletoService.obterPdfBoleto(id);
      pdfBase64 = resultado.pdf_base64;
    }

    if (!pdfBase64) {
      return res.status(404).json({ success: false, message: 'PDF nao encontrado para: ' + id });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="boleto_' + id + '.pdf"');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(Buffer.from(pdfBase64, 'base64'));
  } catch (error) {
    logger.error('Erro ao servir PDF: ' + error.message);
    res.status(500).json({ success: false, message: error.message });
  }
});

// =============================================
// ERROR HANDLER
// =============================================

app.use(function(err, req, res, next) {
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

var PORT = config.port;

app.listen(PORT, function() {
  logger.info('='.repeat(60));
  logger.info('  Middleware Itau-Odoo v5.0.0' + (config.mockMode ? ' [MOCK MODE]' : ' [PRODUCAO]'));
  logger.info('  Empresa: AJL Ferro e Aco - Curitiba/PR');
  logger.info('  Ambiente: ' + config.ambiente);
  logger.info('  Porta: ' + PORT);
  logger.info('='.repeat(60));

  // Diagnostico de credenciais
  logger.info('Credenciais Itau:');
  logger.info('  Client ID: ' + (config.itau.clientId ? '***' + config.itau.clientId.slice(-4) : 'NAO'));
  logger.info('  Temp Token: ' + (config.itau.tempToken ? 'SIM' : 'NAO'));
  logger.info('  Client Secret: ' + (config.itau.clientSecret ? 'SIM' : 'NAO'));
  logger.info('  PIX Chave: ' + (config.itau.pixChave || 'NAO'));
  logger.info('  mTLS: ' + (config.hasMtls ? 'SIM' : 'NAO'));

  logger.info('Endpoints:');
  logger.info('  GET  /                       - Info da API');
  logger.info('  GET  /health                 - Status completo');
  logger.info('  GET  /boleto/:id/pdf         - PDF do boleto');
  logger.info('  POST /api/pagar              - Pagar (roteador universal)');
  logger.info('  GET  /api/pagar/metodos      - Formas de pagamento');
  logger.info('  GET  /api/status/credenciais - Status das credenciais');
  logger.info('  POST /api/pix/criar          - Criar cobranca PIX');
  logger.info('  POST /api/boleto/emitir      - Emitir boleto');
  logger.info('  POST /webhook/pix            - Webhook PIX');
  logger.info('  POST /webhook/boleto         - Webhook Boleto');
  logger.info('='.repeat(60));
});

process.on('SIGTERM', function() {
  logger.info('SIGTERM recebido. Encerrando servidor...');
  process.exit(0);
});

process.on('SIGINT', function() {
  logger.info('SIGINT recebido. Encerrando servidor...');
  process.exit(0);
});

module.exports = app;
