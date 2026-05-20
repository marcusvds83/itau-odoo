// ============================================
// SERVICO DE AUTENTICACAO ITAU v5.0
// ============================================
// Modo 1: Token temporario JWT (ITAU_TEMP_TOKEN)
// Modo 2: OAuth2 (Client ID + Client Secret)
// Modo 3: Mock (sandbox)
//
// O token temporario e um JWT completo que serve
// como Bearer token nas chamadas a API.

const axios = require('axios');
const config = require('../config');
const logger = require('../utils/logger');

// Cache do token
let tokenCache = {
  accessToken: null,
  expiresAt: null,
  isLoading: false,
  source: null, // 'temp', 'oauth2'
};

/**
 * Obtem um token de acesso valido do Itau
 * Estrategia:
 *   1. Se ITAU_TEMP_TOKEN esta setado -> usa direto (JWT)
 *   2. Se Client ID + Secret -> OAuth2
 *   3. Se mock -> retorna token fake
 */
async function getToken() {
  const now = Date.now();

  // Retorna token em cache se ainda valido (com margem de 60s)
  if (tokenCache.accessToken && tokenCache.expiresAt && now < tokenCache.expiresAt - 60000) {
    logger.debug('Token obtido do cache (fonte: ' + tokenCache.source + ')');
    return tokenCache.accessToken;
  }

  // Evita multiplas requisicoes simultaneas
  if (tokenCache.isLoading) {
    logger.debug('Aguardando token em andamento...');
    await new Promise(resolve => setTimeout(resolve, 500));
    return getToken();
  }

  tokenCache.isLoading = true;

  try {
    // =============================================
    // MODO 1: TOKEN TEMPORARIO (JWT direto)
    // =============================================
    if (config.itau.tempToken) {
      logger.info('Usando TOKEN TEMPORARIO do Itau (JWT)...');

      // O token JWT do Itau deve ser enviado INTEIRO como Bearer token
      // Ele ja contem o Access_Token no payload internamente
      // Decodificamos apenas para log e saber a data de expiracao
      var parts = config.itau.tempToken.split('.');
      if (parts.length === 3) {
        try {
          var payload = Buffer.from(parts[1], 'base64').toString('utf8');
          var jwtPayload = JSON.parse(payload);
          tokenCache.expiresAt = (jwtPayload.exp || 0) * 1000;
          tokenCache.source = 'temp_jwt';

          logger.info('JWT decodificado. Expira em: ' +
            new Date(tokenCache.expiresAt).toISOString() +
            ' | sub: ' + (jwtPayload.sub || 'N/A') +
            ' | tem Access_Token: ' + !!(jwtPayload.Access_Token));
        } catch (parseErr) {
          logger.warn('Nao conseguiu decodificar JWT payload: ' + parseErr.message);
          tokenCache.source = 'temp_raw';
        }
      }

      // USA O JWT COMPLETO como Bearer token
      tokenCache.accessToken = config.itau.tempToken;
      if (!tokenCache.expiresAt) {
        tokenCache.expiresAt = now + (7 * 24 * 60 * 60 * 1000);
      }
      tokenCache.isLoading = false;

      logger.info('Token temporario JWT configurado (token inteiro como Bearer)');
      return config.itau.tempToken;
    }

    // =============================================
    // MODO 2: OAUTH2 (Client ID + Client Secret)
    // =============================================
    if (config.itau.clientId && config.itau.clientSecret) {
      logger.info('Solicitando token via OAuth2 (Client Credentials)...');

      var params = new URLSearchParams();
      params.append('grant_type', 'client_credentials');

      var response = await axios.post(config.itauTokenUrl, params, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
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

      logger.info('Token OAuth2 obtido com sucesso. Expira em ' + data.expires_in + 's');
      return data.access_token;
    }

    // =============================================
    // MODO 3: SEM CREDENCIAIS
    // =============================================
    throw new Error(
      'Nenhuma credencial Itau configurada. Defina ITAU_TEMP_TOKEN ou (ITAU_CLIENT_ID + ITAU_CLIENT_SECRET).'
    );

  } catch (error) {
    tokenCache.isLoading = false;

    if (!config.itau.tempToken && !config.itau.clientSecret) {
      tokenCache.accessToken = null;
      tokenCache.expiresAt = null;
    }

    var msg = error.response
      ? 'Erro ' + error.response.status + ': ' + JSON.stringify(error.response.data)
      : error.message;

    logger.error('Falha ao obter token do Itau: ' + msg);
    throw new Error('Falha na autenticacao com o Itau: ' + msg);
  }
}

/**
 * Invalida o cache do token
 */
function invalidateToken() {
  tokenCache = {
    accessToken: null,
    expiresAt: null,
    isLoading: false,
    source: null,
  };
  logger.info('Cache de token invalidado');
}

/**
 * Retorna headers de autenticacao para chamadas a API
 */
async function getAuthHeaders() {
  var token = await getToken();
  return {
    'Authorization': 'Bearer ' + token,
    'Content-Type': 'application/json',
    'x-itau-api-key': config.itau.clientId || '',
  };
}

/**
 * Retorna headers para endpoints que usam mTLS
 * (inclui client_id no header)
 */
async function getMtlsHeaders() {
  var token = await getToken();
  return {
    'Authorization': 'Bearer ' + token,
    'Content-Type': 'application/json',
    'client_id': config.itau.clientId || '',
  };
}

/**
 * Verifica se o token esta configurado
 */
function hasCredentials() {
  return !!(config.itau.tempToken || config.itau.clientId);
}

/**
 * Info sobre a fonte do token
 */
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

module.exports = {
  getToken,
  invalidateToken,
  getAuthHeaders,
  getMtlsHeaders,
  hasCredentials,
  getTokenInfo,
};
