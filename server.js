// ============================================
// SERVER.JS - Aplicacao Principal
// ============================================
// Middleware de integracao entre Odoo 19 SaaS e Itau
// Tecnologias: Node.js + Express + Axios
// Deploy: Render.com (free tier)
// v4.0: PDF via URL em vez de base64

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const config = require('./config');
const logger = require('./utils/logger');
const dayjs = require('dayjs');

// Inicializa Express
const app = express();

// =============================================
// MIDDLEWARES
// =============================================

app.use(helmet({
  contentSecurityPolicy: false,
}));

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    const allowedOrigins = [
      /.*\.odoo\.com$/,
      /.*\.odoo\.com\.br$/,
    ];
    if (allowedOrigins.some(regex => regex.test(origin))) {
      return callback(null, true);
    }
    return callback(null, true);
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key', 'x-itau-signature'],
}));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('combined'));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { success: false, message: 'Muitas requisicoes. Tente novamente em 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
});
app.use('/api/cartao/', strictLimiter);
app.use('/api/pix/', strictLimiter);

// =============================================
// ROTAS
// =============================================

app.use('/', require('./routes/health'));
app.use('/api', require('./routes/odoo'));
app.use('/webhook', require('./routes/webhook'));

// =============================================
// PDF PUBLICO - v4.0
// =============================================
// Serve PDF do boleto diretamente no navegador
// Em mock mode gera PDF simulado
// Em producao busca do Itau

app.get('/boleto/:id/pdf', async (req, res) => {
  try {
    var id = req.params.id;
    var pdfBase64;

    if (config.mockMode) {
      // Gerar PDF mock on-the-fly
      var content = '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n';
      content += '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n';
      content += '3 0 obj\n<< /Type /Page /MediaBox [0 0 612 792] /Parent 2 0 R /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n';
      content += '4 0 obj\n<< /Length 180 >>\nstream\n';
      content += 'BT\n/F1 18 Tf\n72 700 Td\n(AJL Representacoes) Tj\n0 -30 Td\n(Itau-Odoo v4.0 - MOCK) Tj\n';
      content += '0 -30 Td\n(Boleto: ' + id + ') Tj\n';
      content += '0 -30 Td\n(Data: ' + dayjs().format('DD/MM/YYYY HH:mm') + ') Tj\n';
      content += '0 -30 Td\n(Documento simulado - nao utilizar para pagamento real) Tj\n';
      content += 'ET\nendstream\nendobj\n';
      content += '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n';
      content += 'xref\n0 6\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000284 00000 n \n0000000545 00000 n \n';
      content += 'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n623\n%%EOF';
      pdfBase64 = Buffer.from(content).toString('base64');
    } else {
      // Producao: buscar PDF do Itau
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
  logger.info('  Middleware Itau-Odoo v4.0.0' + (config.mockMode ? ' [MOCK MODE]' : ''));
  logger.info(`  Ambiente: ${config.ambiente}`);
  logger.info(`  Porta: ${PORT}`);
  logger.info(`  URL: http://localhost:${PORT}`);
  logger.info('='.repeat(60));
  logger.info('Endpoints disponiveis:');
  logger.info('  GET  /                       - Info da API');
  logger.info('  GET  /health                 - Status dos servicos');
  logger.info('  GET  /boleto/:id/pdf         - PDF do boleto (download)');
  logger.info('  POST /api/boleto/emitir      - Emitir boleto');
  logger.info('  POST /api/boleto/emitir-pdf  - Emitir boleto + PDF');
  logger.info('  GET  /api/boleto/consultar   - Consultar boletos');
  logger.info('  GET  /api/boleto/:id/pdf     - PDF do boleto (JSON)');
  logger.info('  POST /api/boleto/:id/baixa   - Baixar boleto');
  logger.info('  POST /api/pix/criar          - Criar cobranca PIX');
  logger.info('  GET  /api/pix/consultar/:txid- Consultar PIX');
  logger.info('  POST /api/link/criar         - Criar link de pagamento');
  logger.info('  POST /api/link/criar-com-pdf - Criar link + boleto com PDF');
  logger.info('  GET  /api/link/consultar/:id - Consultar link de pagamento');
  logger.info('  GET  /api/pagar/metodos      - Listar formas de pagamento');
  logger.info('  POST /api/pagar              - Pagar (roteador universal)');
  logger.info('  POST /webhook/boleto         - Webhook boleto pago');
  logger.info('  POST /webhook/pix            - Webhook PIX recebido');
  logger.info('  POST /webhook/link           - Webhook link de pagamento');
  logger.info('='.repeat(60));
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM recebido. Encerrando servidor...');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT recebido. Encerrando servidor...');
  process.exit(0);
});

module.exports = app;
