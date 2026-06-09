/**
 * server.js - v6.5
 * Middleware Integracao Itau BoleCode <-> Odoo SaaS
 * v6.5 - PDF FEBRABAN padrao Itau com QR Code PIX
 * - bwip-js callback-based (sem toBufferSync)
 * - POST /boletos/pdf para geracao sob demanda
 */
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const config = require('./config');

const app = express();
app.set('trust proxy', 1);

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(morgan('combined'));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100, standardHeaders: true, legacyHeaders: false });
app.use(limiter);

const healthRoutes = require('./routes/health');
const tokenRoutes = require('./routes/token');
const boletoRoutes = require('./routes/boletos');
const webhookRoutes = require('./routes/webhook');
const apiRoutes = require('./routes/api');

app.use('/health', healthRoutes);
app.use('/token', tokenRoutes);
app.use('/boletos', boletoRoutes);
app.use('/webhook', webhookRoutes);
app.use('/api', apiRoutes);

app.get('/', (req, res) => {
  res.json({
    nome: 'Middleware Itau <-> Odoo',
    versao: '6.5.0',
    empresa: config.empresa.nome,
    status: 'online',
    rotas: { health: '/health', healthDiag: '/health/diag', tokenStatus: '/token/status', tokenGerar: 'POST /token/gerar', boletoEmitir: 'POST /boletos/emitir', boletoConsultar: 'GET /boletos/:txid', webhookPix: 'POST /webhook/pix-confirmacao' },
  });
});

app.use((req, res) => { res.status(404).json({ erro: 'Rota nao encontrada', path: req.path }); });
app.use((err, req, res, next) => { console.error('[SERVER] Erro nao tratado:', err); res.status(500).json({ erro: 'Erro interno do servidor' }); });

const PORT = config.port;
app.listen(PORT, () => {
  const mtls = config.createMtlsConfig();
  console.log('');
  console.log('===========================================================');
  console.log('  Middleware Itau-Odoo v6.5 [PRODUCAO]');
  console.log('  Ambiente:', config.nodeEnv);
  console.log('  Porta:', PORT);
  console.log('  mTLS:', mtls.hasMtls ? 'SIM (' + config.mtls.cert.length + ' chars)' : 'NAO');
  console.log('  Client ID: ***' + config.itau.clientId.substring(config.itau.clientId.length - 4));
  console.log('  Client Secret:', config.itau.clientSecret ? 'SIM' : 'NAO');
  console.log('  Mock Mode:', process.env.MOCK_MODE === 'true' ? 'true' : 'false');
  console.log('  URL Itau:', config.itau.bolecodeBaseUrl);
  console.log('  URL Token:', config.itau.tokenUrl);
  console.log('  Agencia:', config.banco.agencia);
  console.log('  Conta:', config.banco.conta);
  console.log('  ID Beneficiario:', config.banco.idBeneficiario);
  console.log('  Carteira:', config.banco.codigoCarteira);
  console.log('===========================================================');
  console.log('');
});

module.exports = app;
