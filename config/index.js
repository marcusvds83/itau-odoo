/**
 * config/index.js - v6.1
 */
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
    boletoUrl: process.env.ITAU_BOLETO_URL || 'https://secure.api.itau/pix_recebimentos_conciliacoes/v2/boletos_pix',
    bolecodeBaseUrl: process.env.ITAU_BOLECODE_URL || 'https://secure.api.itau/pix_recebimentos_conciliacoes/v2',
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
  createMtlsConfig() {
    const hasCert = cd ~/itau-odoo(this.mtls.cert && this.mtls.key);
    return { cert: this.mtls.cert, key: this.mtls.key, hasMtls: true };
  },
};


module.exports = config;
