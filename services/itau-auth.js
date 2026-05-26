/**
 * services/itau-auth.js - v6.0
 * CORREÇÃO CRÍTICA: Token request conforme documentação oficial Itaú
 * - SEM parâmetro "scope" (causava erro C600)
 * - client_id e client_secret NO CORPO da requisição (urlencoded)
 * - SEM Basic Auth header
 * - COM headers obrigatórios: x-itau-flowID, x-itau-correlationID
 * - COM mTLS (certificado + chave privada)
 */

const axios = require('axios');
const config = require('../config');
const https = require('https');

let tokenCache = {
  accessToken: null,
  expiresAt: 0,
};

async function getAccessToken() {
  const now = Date.now();
  if (tokenCache.accessToken && now < tokenCache.expiresAt) {
    console.log('[ITAU-AUTH] Token do cache (expira em ' +
      Math.round((tokenCache.expiresAt - now) / 1000) + 's)');
    return tokenCache.accessToken;
  }

  console.log('[ITAU-AUTH] Solicitando novo token OAuth2...');
  console.log('[ITAU-AUTH] URL:', config.itau.tokenUrl);
  console.log('[ITAU-AUTH] Client ID:', config.itau.clientId.substring(0, 8) + '...');

  const mtls = config.createMtlsConfig();
  console.log('[ITAU-AUTH] mTLS:', mtls.hasMtls ? 'SIM (' + config.mtls.cert.length + ' chars)' : 'NAO');

  const httpsAgent = mtls.hasMtls ? new https.Agent({
    cert: mtls.cert,
    key: mtls.key,
  }) : undefined;

  try {
    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('client_id', config.itau.clientId);
    params.append('client_secret', config.itau.clientSecret);

    const response = await axios.post(config.itau.tokenUrl, params.toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'x-itau-flowID': '1',
        'x-itau-correlationID': String(Date.now()),
        'Accept': 'application/json',
      },
      httpsAgent,
      timeout: 30000,
    });

    if (response.data && response.data.access_token) {
      tokenCache.accessToken = response.data.access_token;
      tokenCache.expiresAt = now + ((response.data.expires_in || 1800) * 1000) - 300000;
      console.log('[ITAU-AUTH] Token obtido com sucesso!');
      console.log('[ITAU-AUTH] Token type:', response.data.token_type);
      console.log('[ITAU-AUTH] Expires in:', response.data.expires_in, 's');
      return response.data.access_token;
    } else {
      throw new Error('Resposta sem access_token: ' + JSON.stringify(response.data));
    }
  } catch (error) {
    console.error('[ITAU-AUTH] ERRO ao obter token:');
    if (error.response) {
      console.error('[ITAU-AUTH] Status:', error.response.status);
      console.error('[ITAU-AUTH] Data:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.error('[ITAU-AUTH] Error:', error.message);
    }
    tokenCache.accessToken = null;
    tokenCache.expiresAt = 0;
    throw new Error('Falha OAuth2 Itau: ' +
      (error.response?.data?.error_description || error.response?.data?.error || error.message));
  }
}

function invalidateToken() {
  tokenCache.accessToken = null;
  tokenCache.expiresAt = 0;
}

function getTokenStatus() {
  const now = Date.now();
  return {
    hasToken: !!tokenCache.accessToken,
    isValid: tokenCache.accessToken && now < tokenCache.expiresAt,
    expiresIn: tokenCache.expiresAt > now ? Math.round((tokenCache.expiresAt - now) / 1000) + 's' : 'expirado',
  };
}

module.exports = { getAccessToken, invalidateToken, getTokenStatus };
