const axios = require('axios');
const https = require('https');
const config = require('../config');
const logger = require('../utils/logger');

let tokenCache = {
  accessToken: null,
  expiresAt: null,
  isLoading: false,
  source: null,
};

function createMtlsClient() {
  var clientConfig = { timeout: 30000 };
  if (config.hasMtls) {
    var certContent = null;
    var keyContent = null;
    if (config.certificados.crt && config.certificados.key) {
      certContent = Buffer.from(config.certificados.crt, 'utf8');
      keyContent = Buffer.from(config.certificados.key, 'utf8');
    }
    if (certContent && keyContent) {
      clientConfig.httpsAgent = new https.Agent({
        cert: certContent,
        key: keyContent,
        rejectUnauthorized: false,
      });
      logger.info('mTLS ativo para OAuth2');
    }
  }
  return axios.create(clientConfig);
}

async function getToken() {
  const now = Date.now();
  if (tokenCache.accessToken && tokenCache.expiresAt && now < tokenCache.expiresAt - 60000) {
    logger.debug('Token do cache (fonte: ' + tokenCache.source + ')');
    return tokenCache.accessToken;
  }
  if (tokenCache.isLoading) {
    await new Promise(function(resolve) { setTimeout(resolve, 500); });
    return getToken();
  }
  tokenCache.isLoading = true;
  try {
    if (config.itau.clientId && config.itau.clientSecret) {
      logger.info('Solicitando token via OAuth2 + mTLS...');
      var params = new URLSearchParams();
      params.append('grant_type', 'client_credentials');
      var client = createMtlsClient();
      var response = await client.post(config.itauTokenUrl, params, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        auth: { username: config.itau.clientId, password: config.itau.clientSecret },
        timeout: 30000,
      });
      var data = response.data;
      if (!data.access_token) throw new Error('Token nao retornado');
      tokenCache.accessToken = data.access_token;
      tokenCache.expiresAt = now + (data.expires_in * 1000);
      tokenCache.source = 'oauth2';
      tokenCache.isLoading = false;
      logger.info('Token OAuth2 obtido! Expira em ' + data.expires_in + 's');
      return data.access_token;
    }
    if (config.itau.tempToken) {
      logger.warn('Usando JWT temporario - scope limitada!');
      var parts = config.itau.tempToken.split('.');
      if (parts.length === 3) {
        try {
          var payload = Buffer.from(parts[1], 'base64').toString('utf8');
          var jwtPayload = JSON.parse(payload);
          tokenCache.expiresAt = (jwtPayload.exp || 0) * 1000;
          tokenCache.source = 'temp_jwt';
        } catch (e) { tokenCache.source = 'temp_raw'; }
      }
      tokenCache.accessToken = config.itau.tempToken;
      if (!tokenCache.expiresAt) tokenCache.expiresAt = now + (7*24*60*60*1000);
      tokenCache.isLoading = false;
      return config.itau.tempToken;
    }
    throw new Error('Nenhuma credencial configurada');
  } catch (error) {
    tokenCache.isLoading = false;
    var msg = error.response ? 'Erro ' + error.response.status + ': ' + JSON.stringify(error.response.data) : error.message;
    logger.error('Falha ao obter token: ' + msg);
    throw new Error('Falha na autenticacao: ' + msg);
  }
}

function invalidateToken() {
  tokenCache = { accessToken: null, expiresAt: null, isLoading: false, source: null };
}

async function getAuthHeaders() {
  var token = await getToken();
  return { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json', 'x-itau-api-key': config.itau.clientId || '' };
}

async function getMtlsHeaders() {
  var token = await getToken();
  return { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json', 'client_id': config.itau.clientId || '' };
}

function hasCredentials() {
  return !!(config.itau.tempToken || config.itau.clientId);
}

function getTokenInfo() {
  return {
    hasTempToken: !!config.itau.tempToken,
    hasClientId: !!config.itau.clientId,
    hasClientSecret: !!config.itau.clientSecret,
    hasMtls: config.hasMtls,
    cached: !!tokenCache.accessToken,
    source: tokenCache.source,
    expiresAt: tokenCache.expiresAt ? new Date(tokenCache.expiresAt).toISOString() : null,
  };
}

module.exports = { getToken, invalidateToken, getAuthHeaders, getMtlsHeaders, hasCredentials, getTokenInfo };
