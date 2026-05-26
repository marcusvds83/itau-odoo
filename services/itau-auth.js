// ============================================
// SERVICO DE AUTENTICACAO ITAU v5.8
// ============================================
// Com scope no OAuth2

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

  var scopes = [
    'openid cob.read cob.write pix.read pix.write',
    'certificado.write boletos.write',
    'boletos',
    '',
  ];

  var tokenUrls = [config.itauTokenUrl];

  var lastError = null;
  for (var u = 0; u < tokenUrls.length; u++) {
    var tokenUrl = tokenUrls[u];
    for (var s = 0; s < scopes.length; s++) {
      var scope = scopes[s];
      // Tenta com e sem mTLS
      var useMtlsList = [true, false];
      for (var m = 0; m < useMtlsList.length; m++) {
        var useMtls = useMtlsList[m];
        try {
          logger.info('Tentando: ' + tokenUrl + ' | scope: ' + (scope || 'vazio') + ' | mTLS: ' + useMtls);
          var params = new URLSearchParams();
          params.append('grant_type', 'client_credentials');
          if (scope) params.append('scope', scope);
          var reqConfig = {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            auth: { username: config.itau.clientId, password: config.itau.clientSecret },
            timeout: 15000,
          };
          if (useMtls) {
            var agent = createMtlsAgent();
            if (agent) reqConfig.httpsAgent = agent;
            else continue;
          }
          var response = await axios.post(tokenUrl, params, reqConfig);
          logger.info('SUCESSO! Token obtido! Scope: ' + (response.data.scope || 'n/a'));
          tokenCache.accessToken = response.data.access_token;
          tokenCache.expiresAt = now + (response.data.expires_in * 1000);
          tokenCache.isLoading = false;
          return response.data.access_token;
        } catch (err) {
          var errMsg = err.response ? err.response.status + ': ' + JSON.stringify(err.response.data).substring(0, 200) : err.message;
          logger.warn('Falhou: ' + errMsg);
          lastError = err;
        }
      }
    }
  }

  tokenCache.isLoading = false;
  var msg = lastError.response ? 'Erro ' + lastError.response.status : lastError.message;
  throw new Error('Falha na autenticacao: ' + msg);
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
