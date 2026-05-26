// ============================================
// SERVICO DE AUTENTICACAO ITAU v5.7b
// ============================================
// Tenta multiple endpoints de token

const axios = require('axios');
const https = require('https');
const config = require('../config');
const logger = require('../utils/logger');

var tokenCache = { accessToken: null, expiresAt: null, isLoading: false };

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
    return tokenCache.accessToken;
  }
  if (tokenCache.isLoading) {
    await new Promise(function(r) { setTimeout(r, 500); });
    return getToken();
  }
  tokenCache.isLoading = true;

  // Lista de URLs de token para tentar
  var tokenUrls = [
    config.itauTokenUrl,
    'https://secure.api.itau/cash_management/v2/token',
    'https://secure.api.itau/token',
  ];

  var lastError = null;
  for (var i = 0; i < tokenUrls.length; i++) {
    var tokenUrl = tokenUrls[i];
    try {
      logger.info('Tentando token URL (' + (i+1) + '/' + tokenUrls.length + '): ' + tokenUrl);

      var params = new URLSearchParams();
      params.append('grant_type', 'client_credentials');

      // Tenta SEM mTLS primeiro
      try {
        var response = await axios.post(tokenUrl, params, {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          auth: { username: config.itau.clientId, password: config.itau.clientSecret },
          timeout: 15000,
        });
        logger.info('Token obtido SEM mTLS em: ' + tokenUrl);
        return cacheAndReturn(response.data);
      } catch (errNoMtls) {
        logger.warn('Sem mTLS falhou em ' + tokenUrl + ': ' + (errNoMtls.response ? errNoMtls.response.status + ' - ' + JSON.stringify(errNoMtls.response.data) : errNoMtls.message));
      }

      // Tenta COM mTLS
      var agent = createMtlsAgent();
      if (agent) {
        try {
          var response2 = await axios.post(tokenUrl, params, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            auth: { username: config.itau.clientId, password: config.itau.clientSecret },
            httpsAgent: agent,
            timeout: 15000,
          });
          logger.info('Token obtido COM mTLS em: ' + tokenUrl);
          return cacheAndReturn(response2.data);
        } catch (errMtls) {
          logger.warn('Com mTLS falhou em ' + tokenUrl + ': ' + (errMtls.response ? errMtls.response.status + ' - ' + JSON.stringify(errMtls.response.data) : errMtls.message));
          lastError = errMtls;
        }
      }
    } catch (err) {
      lastError = err;
    }
  }

  tokenCache.isLoading = false;
  var msg = lastError ? (lastError.response ? 'Erro ' + lastError.response.status + ': ' + JSON.stringify(lastError.response.data) : lastError.message) : 'Todas URLs falharam';
  logger.error('Nenhuma URL de token funcionou: ' + msg);
  throw new Error('Falha na autenticacao: ' + msg);
}

function cacheAndReturn(data) {
  if (!data.access_token) throw new Error('Token nao retornado');
  tokenCache.accessToken = data.access_token;
  tokenCache.expiresAt = Date.now() + (data.expires_in * 1000);
  tokenCache.isLoading = false;
  logger.info('Token obtido! Scope: ' + (data.scope || 'nao informado') + ' | Expira: ' + data.expires_in + 's');
  return data.access_token;
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
