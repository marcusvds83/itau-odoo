// ============================================
// SERVICO DE AUTENTICACAO ITAU (OAuth2)
// ============================================
// Gerencia tokens de acesso ao Itaú com cache
// e renovacao automatica

const axios = require('axios');
const config = require('../config');
const logger = require('../utils/logger');

// Cache do token em memoria
let tokenCache = {
  accessToken: null,
  expiresAt: null,
  isLoading: false,
};

/**
 * Obtem um token de acesso valido do Itau
 * - Retorna do cache se ainda for valido
 * - Solicita novo token se expirado ou inexistente
 * @returns {Promise<string>} access_token
 */
async function getToken() {
  const now = Date.now();

  // Retorna token em cache se ainda valido (com margem de 30s)
  if (tokenCache.accessToken && tokenCache.expiresAt && now < tokenCache.expiresAt - 30000) {
    logger.debug('Token obtido do cache');
    return tokenCache.accessToken;
  }

  // Evita multiplas requisicoes simultaneas de token
  if (tokenCache.isLoading) {
    logger.debug('Aguardando token em andamento...');
    await new Promise(resolve => setTimeout(resolve, 500));
    return getToken();
  }

  tokenCache.isLoading = true;

  try {
    logger.info(`Solicitando novo token do Itau (${config.ambiente})...`);

    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');

    const response = await axios.post(config.itauTokenUrl, params, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      auth: {
        username: config.itau.clientId,
        password: config.itau.clientSecret,
      },
      timeout: 30000,
    });

    const data = response.data;

    if (!data.access_token) {
      throw new Error('Token nao retornado pela API do Itau');
    }

    // Cacheia o token
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
      ? `Erro ${error.response.status}: ${JSON.stringify(error.response.data)}`
      : error.message;

    logger.error('Falha ao obter token do Itau: ' + msg);
    throw new Error('Falha na autenticacao com o Itau: ' + msg);
  }
}

/**
 * Invalida o cache do token (forca renovacao)
 */
function invalidateToken() {
  tokenCache = {
    accessToken: null,
    expiresAt: null,
    isLoading: false,
  };
  logger.info('Cache de token invalidado');
}

/**
 * Retorna headers de autenticacao para chamadas a API
 * @returns {Promise<Object>} headers com Authorization Bearer
 */
async function getAuthHeaders() {
  const token = await getToken();
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    'x-itau-api-key': config.itau.clientId,
  };
}

/**
 * Obtem token do Sandbox simplificado (sem OAuth completo)
 * Usado no Sandbox que tem fluxo diferente de OAuth
 * @returns {Promise<string>} token sandbox
 */
async function getSandboxToken() {
  if (config.ambiente !== 'sandbox') {
    return getToken();
  }

  const now = Date.now();
  if (tokenCache.accessToken && tokenCache.expiresAt && now < tokenCache.expiresAt - 30000) {
    return tokenCache.accessToken;
  }

  if (tokenCache.isLoading) {
    await new Promise(resolve => setTimeout(resolve, 500));
    return getSandboxToken();
  }

  tokenCache.isLoading = true;

  try {
    logger.info('Solicitando token do Sandbox Itau...');

    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');

    const response = await axios.post(config.itauTokenUrl, params, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      auth: {
        username: config.itau.clientId,
        password: config.itau.clientSecret,
      },
      timeout: 30000,
    });

    const data = response.data;

    tokenCache.accessToken = data.access_token;
    tokenCache.expiresAt = now + (data.expires_in * 1000);
    tokenCache.isLoading = false;

    logger.info('Token Sandbox obtido com sucesso');
    return data.access_token;

  } catch (error) {
    tokenCache.isLoading = false;
    logger.error('Falha ao obter token Sandbox: ' + error.message);
    throw error;
  }
}

module.exports = {
  getToken,
  getSandboxToken,
  invalidateToken,
  getAuthHeaders,
};
