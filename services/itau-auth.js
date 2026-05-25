// ============================================
// SERVICO DE AUTENTICACAO ITAU v5.2
// ============================================
// v5.2: OAuth2 tem prioridade quando Client Secret disponivel
// O JWT temporario so tem scope "certificado.write"
// Para boletos precisa de token OAuth2 com scope correto

const axios = require('axios');
const config = require('../config');
const logger = require('../utils/logger');

let tokenCache = {
  accessToken: null,
  expiresAt: null,
  isLoading: false,
  source: null,
};

async function getToken() {
  const now = Date.now();

  if (tokenCache.accessToken && tokenCache.expiresAt && now < tokenCache.expiresAt - 60000) {
    logger.debug('Token do cache (fonte: ' + tokenCache.source + ')');
    return tokenCache.accessToken;
  }

  if (tokenCache.isLoading) {
    logger.debug('Aguardando token em andamento...');
    await new Promise(function(resolve) { setTimeout(resolve, 500); });
    return getToken();
  }

  tokenCache.isLoading = true;

  try {
    // =============================================
    // PRIORIDADE 1: OAuth2 (Client ID + Secret)
    // =============================================
    // Gera token com scope correto para boletos/PIX
    if (config.itau.clientId && config.itau.clientSecret) {
      logger.info('Solicitando token via OAuth2 (Client Credentials)...');

      var params = new URLSearchParams();
      params.append('grant_type', 'client_credentials');

      var response = await axios.post(config.itauTokenUrl, params, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        auth: {
          username: config.itau.clientId,
          password: config.itau.clientSecret,
        },
        timeout: 30000,
      });

      var data = response.data;
      if (!data.access_token) {
        throw new Error('Token nao retornado pela API do Itau');
      }

      tokenCache.accessToken = data.access_token;
      tokenCache.expiresAt = now + (data.expires_in * 1000);
      tokenCache.source = 'oauth2';
      tokenCache.isLoading = false;

      logger.info('Token OAuth2 obtido com sucesso! Expira em ' + data.expires_in + 's');
      logger.info('Scope do token: ' + (data.scope || 'N/A'));
      return data.access_token;
    }

    // =============================================
    // PRIORIDADE 2: Token Temporario (JWT)
    // =============================================
    // ATENCAO: JWT temporario geralmente tem scope
    // "certificado.write" apenas - NAO serve para boletos!
    if (config.itau.tempToken) {
      logger.warn('Usando TOKEN TEMPORARIO (JWT) - scope pode ser limitada!');

      var parts = config.itau.tempToken.split('.');
      if (parts.length === 3) {
        try {
          var payload = Buffer.from(parts[1], 'base64').toString('utf8');
          var jwtPayload = JSON.parse(payload);
          tokenCache.expiresAt = (jwtPayload.exp || 0) * 1000;
          tokenCache.source = 'temp_jwt';

          logger.info('JWT scope: ' + (jwtPayload.scope || 'N/A') + ' | expira: ' + new Date(tokenCache.expiresAt).toISOString());

          if (jwtPayload.scope && jwtPayload.scope.indexOf('certificado') >= 0 && jwtPayload.scope.indexOf('boleto') < 0) {
            logger.warn('ATENCAO: JWT scope (' + jwtPayload.scope + ') provavelmente NAO inclui boletos! Configure ITAU_CLIENT_SECRET para OAuth2.');
          }
        } catch (parseErr) {
          logger.warn('Nao conseguiu decodificar JWT: ' + parseErr.message);
          tokenCache.source = 'temp_raw';
        }
      }

      tokenCache.accessToken = config.itau.tempToken;
      if (!tokenCache.expiresAt) {
        tokenCache.expiresAt = now + (7 * 24 * 60 * 60 * 1000);
      }
      tokenCache.isLoading = false;
      return config.itau.tempToken;
    }

    // =============================================
    // SEM CREDENCIAIS
    // =============================================
    throw new Error('Nenhuma credencial Itau configurada. Defina (ITAU_CLIENT_ID + ITAU_CLIENT_SECRET) ou ITAU_TEMP_TOKEN.');

  } catch (error) {
    tokenCache.isLoading = false;

    var msg = error.response
      ? 'Erro ' + error.response.status + ': ' + JSON.stringify(error.response.data)
      : error.message;

    logger.error('Falha ao obter token do Itau: ' + msg);
    throw new Error('Falha na autenticacao com o Itau: ' + msg);
  }
}

function invalidateToken() {
  tokenCache = { accessToken: null, expiresAt: null, isLoading: false, source: null };
  logger.info('Cache de token invalidado');
}

async function getAuthHeaders() {
  var token = await getToken();
  return {
    'Authorization': 'Bearer ' + token,
    'Content-Type': 'application/json',
    'x-itau-api-key': config.itau.clientId || '',
  };
}

async function getMtlsHeaders() {
  var token = await getToken();
  return {
    'Authorization': 'Bearer ' + token,
    'Content-Type': 'application/json',
    'client_id': config.itau.clientId || '',
  };
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
