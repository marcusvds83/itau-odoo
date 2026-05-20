// ============================================
// CONFIGURACAO CENTRAL DO MIDDLEWARE v5.0
// ============================================
// Suporta: Token temporario Itau, OAuth2, mTLS
// Ambientes: sandbox (mock) e producao (API real)

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const config = {
  // Ambiente
  versao: '5.0.0',
  ambiente: process.env.AMBIENTE || 'sandbox',
  port: parseInt(process.env.PORT) || 3000,
  apiSecretKey: process.env.API_SECRET_KEY || 'changeme',
  mockMode: process.env.MOCK_MODE !== 'false',

  // =============================================
  // ITAU - CREDENCIAIS PRODUCAO (v5)
  // =============================================
  itau: {
    // Credencial (Client ID) - OBRIGATORIA
    clientId: process.env.ITAU_CLIENT_ID || null,

    // Client Secret - Para OAuth2 (quando disponivel)
    clientSecret: process.env.ITAU_CLIENT_SECRET || null,

    // Token temporario Itau (JWT) - v5: usado direto
    tempToken: process.env.ITAU_TEMP_TOKEN || null,

    // Chave PIX
    pixChave: process.env.ITAU_PIX_CHAVE || null,
  },

  // =============================================
  // ITAU - URLs DE PRODUCAO (v5)
  // =============================================
  get itauTokenUrl() {
    // Sempre producao - o token real vem da API Itau
    return process.env.ITAU_TOKEN_URL || 'https://sts.itau.com.br/api/oauth/token';
  },

  get itauBaseUrl() {
    return process.env.ITAU_BASE_URL || 'https://api.itau.com.br/cash_management/v2';
  },

  get itauPixUrl() {
    return process.env.ITAU_PIX_URL || 'https://secure.api.itau/pix_recebimentos/v2';
  },

  // BoleCode API (boletos com PIX)
  get bolecodeUrl() {
    return process.env.ITAU_BOLECODE_URL || 'https://secure.api.itau/pix_recebimentos_conciliacoes/v2';
  },

  // Link de Pagamento (Shopline)
  get linkPagamentoUrl() {
    return process.env.ITAU_LINK_PAG_URL || 'https://secure.api.itau/pix_recebimentos_conciliacoes/v2';
  },

  // =============================================
  // CERTIFICADOS mTLS (v5)
  // =============================================
  certificados: {
    // Conteudo do certificado (.crt) como string - para Render env var
    crt: process.env.ITAU_CERT_CRT || null,
    // Conteudo da chave privada (.key) como string - para Render env var
    key: process.env.ITAU_CERT_KEY || null,
    // Caminho para arquivo de certificado (alternativa)
    certPath: process.env.ITAU_CERT_PATH || null,
    keyPath: process.env.ITAU_KEY_PATH || null,
  },

  // Verifica se tem mTLS configurado
  get hasMtls() {
    return !!(this.certificados.crt && this.certificados.key) ||
           !!(this.certificados.certPath && this.certificados.keyPath);
  },

  // =============================================
  // CREDENCIAIS REDE ITAU (CARTAO) - futuro
  // =============================================
  rede: {
    clientId: process.env.REDE_CLIENT_ID || null,
    clientSecret: process.env.REDE_CLIENT_SECRET || null,
    merchantId: process.env.REDE_MERCHANT_ID || null,
    softDescriptor: process.env.REDE_SOFT_DESCRIPTOR || 'AJL FERRO',
    get baseUrl() {
      return process.env.REDE_URL || 'https://ecommerce.userede.com.br/decrypt/v1';
    },
  },

  // =============================================
  // ODOO SaaS
  // =============================================
  odoo: {
    url: process.env.ODOO_URL || null,
    db: process.env.ODOO_DB || null,
    username: process.env.ODOO_USERNAME || null,
    apiKey: process.env.ODOO_API_KEY || null,
  },

  // =============================================
  // WEBHOOK
  // =============================================
  webhookSecret: process.env.WEBHOOK_SECRET || 'changeme',

  // URL publica do middleware (para gerar links de PDF, etc)
  midUrl: process.env.MID_URL || null,
};

module.exports = config;
