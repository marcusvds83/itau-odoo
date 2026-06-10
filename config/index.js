require('dotenv').config();
const config = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  isRender: process.env.RENDER === 'true',
  apiSecretKey: process.env.API_SECRET_KEY || '',
  itau: {
    clientId: process.env.ITAU_CLIENT_ID || '',
    clientSecret: process.env.ITAU_CLIENT_SECRET || '',
    tokenUrl: process.env.ITAU_TOKEN_URL || 'https://sts.itau.com.br/api/oauth/token',
    bolecodeBaseUrl: process.env.ITAU_BOLECODE_URL || 'https://secure.api.itau/pix_recebimentos_conciliacoes/v2',
    pixChave: process.env.ITAU_PIX_CHAVE || '',
  },
  banco: {
    agencia: process.env.ITAU_AGENCIA || '7764',
    conta: process.env.ITAU_CONTA || '22338-9',
    idBeneficiario: process.env.ITAU_ID_BENEFICIARIO || '776400223389',
    codigoCarteira: process.env.ITAU_CARTEIRA || '109',
  },
  empresa: {
    cnpj: process.env.EMPRESA_CNPJ || '22603750000190',
    nome: process.env.EMPRESA_NOME || 'AJL FERRO E ACO LTDA',
  },
  mtls: {
    cert: process.env.ITAU_CERT_CRT || '',
    key: process.env.ITAU_CERT_KEY || '',
  },
  odoo: {
    enabled: process.env.ODOO_PUSH_ENABLED === 'true',
    url: process.env.ODOO_URL || '',
    db: process.env.ODOO_DB || '',
    user: process.env.ODOO_USER || '',
    password: process.env.ODOO_PASSWORD || '',
  },
  createMtlsConfig() {
    const hasCert = !!(this.mtls.cert && this.mtls.key);
    if (!hasCert) return { cert: null, key: null, hasMtls: false };
    return { cert: this.mtls.cert, key: this.mtls.key, hasMtls: true };
  },
};
if (!config.itau.pixChave) console.warn('[CONFIG] ITAU_PIX_CHAVE nao definida!');
module.exports = config;
