/**
 * server.js - v6.9.4
 * Middleware Integracao Itau BoleCode <-> Odoo SaaS
 * v6.9.4 - PRODUCAO (Efetivacao) - Boleto Parcelado - PDF Push Odoo
 * - PDFs gerados na emissao e pushados automaticamente para Odoo
 * - Rota /boletos/pdf/nn/:nn funciona na mesma sessao (mapa reverso)
 * - Apos restart: PDFs disponiveis como anexos no Odoo (push automatico)
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
    versao: '6.9.4',
    empresa: config.empresa.nome,
    status: 'online',
    odoo_push: config.odoo && config.odoo.enabled ? 'ATIVO' : 'DESATIVADO',
    novidades: [
      'PDFs pushados automaticamente para Odoo (attachments + chatter)',
      'PDF gerado na emissao (nao depende de RAM apos restart)',
      'Nosso numero com timestamp (nunca repete)',
      'Boleto parcelado: parse automatico de formas de pagamento'
    ],
    rotas: {
      health: '/health',
      pagar: 'POST /api/pagar',
      pdfTxid: 'GET /boletos/pdf/:txid',
      pdfNossoNumero: 'GET /boletos/pdf/nn/:nosso_numero (mesma sessao)',
      regenPdf: 'POST /api/regen',
      webhookPix: 'POST /webhook/pix-confirmacao'
    }
  });
});

app.use((req, res) => { res.status(404).json({ erro: 'Rota nao encontrada', path: req.path }); });
app.use((err, req, res, next) => { console.error('[SERVER] Erro nao tratado:', err); res.status(500).json({ erro: 'Erro interno do servidor' }); });

const PORT = config.port;
app.listen(PORT, () => {
  const mtls = config.createMtlsConfig();
  console.log('');
  console.log('===========================================================');
  console.log('  Middleware Itau-Odoo v6.9.4 [PRODUCAO - EFETIVACAO]');
  console.log('  Boleto Parcelado + Push PDF Odoo + Timestamp NN');
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
  console.log('  Odoo Push:', config.odoo && config.odoo.enabled ? 'ATIVO' : 'DESATIVADO');
  if (config.odoo && config.odoo.enabled) {
    console.log('  Odoo URL:', config.odoo.url);
  }
  console.log('===========================================================');
  console.log('');
});

module.exports = app;
