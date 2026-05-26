// ============================================
// SERVICO DE AUTENTICACAO ITAU (OAuth2) v5.7
// ============================================
// Token OAuth2 COM mTLS (endpoint exige certificado)

const axios = require('axios');
const https = require('https');
const config = require('../config');
const logger = require('../utils/logger');

var tokenCache = {
  accessToken: null,
  expiresAt: null,
  isLoading: false,
};

function createMtlsAgent() {
  if (!config.mtls || !config.mtls.hasMtls) return undefined;
  return new https.Agent({
    cert: config.mtls.cert,
    key: config.mtls.key,
    rejectUnauthorized: false,
  });
}

async function getToken() {
  var now = Date.now();
  if (tokenCache.accessToken && tokenCache.expiresAt && now < tokenCache.expiresAt - 30000) {
    logger.debug('Token do cache');
    return tokenCache.accessToken;
  }
  if (tokenCache.isLoading) {
    await new Promise(function(r) { setTimeout(r, 500); });
    return getToken();
  }
  tokenCache.isLoading = true;
  try {
    var tokenUrl = config.itauTokenUrl;
    logger.info('Solicitando token OAuth2 com mTLS... URL: ' + tokenUrl);
    var params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    var reqConfig = {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      auth: {
        username: config.itau.clientId,
        password: config.itau.clientSecret,
      },
      timeout: 30000,
    };
    var agent = createMtlsAgent();
    if (agent) {
      reqConfig.httpsAgent = agent;
      logger.info('mTLS ativo na chamada OAuth2');
    } else {
      logger.error('mTLS NAO disponivel para OAuth2!');
    }
    var response = await axios.post(tokenUrl, params, reqConfig);
    var data = response.data;
    if (!data.access_token) throw new Error('Token nao retornado');
    tokenCache.accessToken = data.access_token;
    tokenCache.expiresAt = now + (data.expires_in * 1000);
    tokenCache.isLoading = false;
    logger.info('Token OAuth2 obtido com sucesso! Expira em ' + data.expires_in + 's');
    logger.info('Scope do token: ' + (data.scope || 'nao informado'));
    return data.access_token;
  } catch (error) {
    tokenCache.isLoading = false;
    tokenCache.accessToken = null;
    tokenCache.expiresAt = null;
    var msg = error.response
      ? 'Erro ' + error.response.status + ': ' + JSON.stringify(error.response.data)
      : error.message;
    logger.error('Falha ao obter token: ' + msg);
    throw new Error('Falha na autenticacao: ' + msg);
  }
}

function invalidateToken() {
  tokenCache = { accessToken: null, expiresAt: null, isLoading: false };
}

async function getAuthHeaders() {
  var token = await getToken();
  return {
    'Authorization': 'Bearer ' + token,
    'Content-Type': 'application/json',
    'x-itau-api-key': config.itau.clientId,
  };
}

module.exports = { getToken: getToken, invalidateToken: invalidateToken, getAuthHeaders: getAuthHeaders };
