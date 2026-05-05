// ============================================
// CONFIGURACAO CENTRAL DO MIDDLEWARE
// ============================================

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const config = {
  // Ambiente
  ambiente: process.env.AMBIENTE || 'sandbox',
  port: parseInt(process.env.PORT) || 3000,
  apiSecretKey: process.env.API_SECRET_KEY || 'changeme',
  mockMode: process.env.MOCK_MODE !== 'false',

  // URLs dinamicas baseadas no ambiente
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

  // Credenciais Itau Boletos
  itau: {
    clientId: process.env.ITAU_CLIENT_ID,
    clientSecret: process.env.ITAU_CLIENT_SECRET,
    pixChave: process.env.ITAU_PIX_CHAVE,
  },

  // Certificados mTLS (producao)
  certificados: {
    certPath: process.env.ITAU_CERT_PATH || null,
    keyPath: process.env.ITAU_KEY_PATH || null,
    caPath: process.env.ITAU_CA_PATH || null,
  },

  // Credenciais Rede Itau (Cartao)
  rede: {
    clientId: process.env.REDE_CLIENT_ID,
    clientSecret: process.env.REDE_CLIENT_SECRET,
    merchantId: process.env.REDE_MERCHANT_ID,
    softDescriptor: process.env.REDE_SOFT_DESCRIPTOR || 'LOJA',
  },

  // Credenciais Link de Pagamento Itau (Cartoes via link)
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

  // Odoo SaaS
  odoo: {
    url: process.env.ODOO_URL,
    db: process.env.ODOO_DB,
    username: process.env.ODOO_USERNAME,
    apiKey: process.env.ODOO_API_KEY,
  },

  // Webhook
  webhookSecret: process.env.WEBHOOK_SECRET || 'changeme',
};

module.exports = config;
