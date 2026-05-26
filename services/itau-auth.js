// ============================================
// SERVICO DE AUTENTICACAO ITAU (OAuth2) v5.5
// ============================================

const axios = require('axios');
const https = require('https');
const config = require('../config');
const logger = require('../utils/logger');

let tokenCache = {
  accessToken: null,
  expiresAt: null,
  isLoading: false,
};

function createMtlsAgent() {
  if (!config.mtls.hasMtls) return undefined;
  return new https.Agent({
    cert: config.mtls.cert,
    key: config.mtls.key,
    rejectUnauthorized: false,
  });
}

async function getToken() {
  const now = Date.now();
  if (tokenCache.accessToken && tokenCache.expiresAt && now < tokenCache.expiresAt - 30000) {
    logger.debug('Token obtido do cache');
    return tokenCache.accessToken;
  }
  if (tokenCache.isLoading) {
    logger.debug('Aguardando token em andamento...');
    await new Promise(resolve => setTimeout(resolve, 500));
    return getToken();
  }
  tokenCache.isLoading = true;
  try {
    const tokenUrl = config.itauTokenUrl;
    logger.info('Solicitando novo token do Itau (' + config.ambiente + ')... URL: ' + tokenUrl);
    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    const requestConfig = {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      auth: {
        username: config.itau.clientId,
        password: config.itau.clientSecret,
      },
      timeout: 30000,
    };
    const mtlsAgent = createMtlsAgent();
    if (mtlsAgent) {
      requestConfig.httpsAgent = mtlsAgent;
      logger.info('mTLS ativo na chamada OAuth2');
    } else {
      logger.warn('mTLS nao configurado - chamada sem certificado');
    }
    const response = await axios.post(tokenUrl, params, requestConfig);
    const data = response.data;
    if (!data.access_token) {
      throw new Error('Token nao retornado pela API do Itau');
    }
    tokenCache.accessToken = data.access_token;
    tokenCache.expiresAt = now + (data.expires_in * 1000);
    tokenCache.isLoading = false;
    logger.info('Token obtido com sucesso. Expira em ' + data.expires_in + 's');
    return data.access_token;
  } catch (error) {
    tokenCache.isLoading = false;
    tokenCache.accessToken = null;
    tokenCache.expiresAt = null;
    const msg = error.response
      ? 'Erro ' + error.response.status + ': ' + JSON.stringify(error.response.data)
      : error.message;
    logger.error('Falha ao obter token do Itau: ' + msg);
    throw new Error('Falha na autenticacao com o Itau: ' + msg);
  }
}

function invalidateToken() {
  tokenCache = { accessToken: null, expiresAt: null, isLoading: false };
  logger.info('Cache de token invalidado');
}

async function getAuthHeaders() {
  const token = await getToken();
  return {
    'Authorization': 'Bearer ' + token,
    'Content-Type': 'application/json',
    'x-itau-api-key': config.itau.clientId,
  };
}

function getMtlsAgent() {
  return createMtlsAgent();
}

module.exports = { getToken, invalidateToken, getAuthHeaders, getMtlsAgent };
