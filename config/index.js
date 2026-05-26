// ============================================
// CONFIGURACAO CENTRAL DO MIDDLEWARE v5.5
// ============================================
// Suporta certificados mTLS via env vars (conteudo)
// OU via caminhos de arquivo (filesystem)

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

function createMtlsConfig() {
  let cert = null;
  let key = null;
  const certContent = process.env.ITAU_CERT_CRT || '';
  const keyContent = process.env.ITAU_CERT_KEY || '';
  if (certContent && keyContent) {
    cert = certContent;
    key = keyContent;
  } else {
    const certPath = process.env.ITAU_CERT_PATH;
    const keyPath = process.env.ITAU_KEY_PATH;
    if (certPath && keyPath) {
      try {
        const fs = require('fs');
        cert = fs.readFileSync(certPath, 'utf8');
        key = fs.readFileSync(keyPath, 'utf8');
      } catch (e) {
        console.error('Erro ao ler certificados:', e.message);
      }
    }
  }
  return { cert, key, hasMtls: !!(cert && key) };
}

const mtls = createMtlsConfig();

const config = {
  ambiente: process.env.AMBIENTE || 'sandbox',
  port: parseInt(process.env.PORT) || 3000,
  apiSecretKey: process.env.API_SECRET_KEY || 'changeme',
  mockMode: process.env.MOCK_MODE !== 'false',

  get itauBaseUrl() {
    return this.ambiente === 'sandbox'
      ? process.env.ITAU_SANDBOX_URL
      : process.env.ITAU_PRODUCAO_URL;
  },
  get itauPixUrl() {
    return this.ambiente === 'sandbox'
      ? process.env.ITAU_PIX_SANDBOX_URL
      : process.env.ITAU_PIX_PRODUCAO_URL;
  },
  get itauTokenUrl() {
    return this.ambiente === 'sandbox'
      ? process.env.ITAU_TOKEN_SANDBOX_URL
      : process.env.ITAU_TOKEN_PRODUCAO_URL;
  },
  get redeBaseUrl() {
    return this.ambiente === 'sandbox'
      ? process.env.REDE_SANDBOX_URL
      : process.env.REDE_PRODUCAO_URL;
  },

  itau: {
    clientId: process.env.ITAU_CLIENT_ID,
    clientSecret: process.env.ITAU_CLIENT_SECRET,
    pixChave: process.env.ITAU_PIX_CHAVE,
  },

  mtls,

  rede: {
    clientId: process.env.REDE_CLIENT_ID,
    clientSecret: process.env.REDE_CLIENT_SECRET,
    merchantId: process.env.REDE_MERCHANT_ID,
    softDescriptor: process.env.REDE_SOFT_DESCRIPTOR || 'LOJA',
  },

  linkPagamento: {
    clientId: process.env.LINK_PAG_CLIENT_ID,
    clientSecret: process.env.LINK_PAG_CLIENT_SECRET,
    get apiUrl() {
      return config.ambiente === 'sandbox'
        ? (process.env.LINK_PAG_SANDBOX_URL || process.env.ITAU_SANDBOX_URL)
        : (process.env.LINK_PAG_PRODUCAO_URL || process.env.ITAU_PRODUCAO_URL);
    },
    get tokenUrl() {
      return config.ambiente === 'sandbox'
        ? (process.env.LINK_PAG_TOKEN_SANDBOX_URL || process.env.ITAU_TOKEN_SANDBOX_URL)
        : (process.env.LINK_PAG_TOKEN_PRODUCAO_URL || process.env.ITAU_TOKEN_PRODUCAO_URL);
    },
  },

  odoo: {
    url: process.env.ODOO_URL,
    db: process.env.ODOO_DB,
    username: process.env.ODOO_USERNAME,
    apiKey: process.env.ODOO_API_KEY,
  },

  webhookSecret: process.env.WEBHOOK_SECRET || 'changeme',
};

module.exports = config;
