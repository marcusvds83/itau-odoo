// ============================================
// SERVICO DE AUTENTICACAO ITAU (OAuth2) v5.6
// ============================================
// Token: Basic Auth SEM mTLS
// API:   Bearer + mTLS (via itau-api.js)

const axios = require('axios');
const config = require('../config');
const logger = require('../utils/logger');

let tokenCache = {
  accessToken: null,
  expiresAt: null,
  isLoading: false,
};

async function getToken() {
  var now = Date.now();
  if (tokenCache.accessToken && tokenCache.expiresAt && now < tokenCache.expiresAt - 30000) {
    logger.debug('Token obtido do cache');
    return tokenCache.accessToken;
  }
  if (tokenCache.isLoading) {
    logger.debug('Aguardando token em andamento...');
    await new Promise(function(resolve) { setTimeout(resolve, 500); });
    return getToken();
  }
  tokenCache.isLoading = true;
  try {
    var tokenUrl = config.itauTokenUrl;
    logger.info('Solicitando token OAuth2 (' + config.ambiente + ')... URL: ' + tokenUrl);
    var params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    var requestConfig = {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      auth: {
        username: config.itau.clientId,
        password: config.itau.clientSecret,
      },
      timeout: 30000,
    };
    var response = await axios.post(tokenUrl, params, requestConfig);
    var data = response.data;
    if (!data.access_token) {
      throw new Error('Token nao retornado pela API do Itau');
    }
    tokenCache.accessToken = data.access_token;
    tokenCache.expiresAt = now + (data.expires_in * 1000);
    tokenCache.isLoading = false;
    logger.info('Token OAuth2 obtido com sucesso! Expira em ' + data.expires_in + 's');
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
  logger.info('Cache de token invalidado');
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
