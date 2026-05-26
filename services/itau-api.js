/**
 * services/itau-api.js - v6.1
 */
const axios = require('axios');
const https = require('https');
const config = require('../config');

async function callBolecode(accessToken, endpoint, payload) {
  const mtls = config.createMtlsConfig();
  const baseUrl = config.itau.bolecodeBaseUrl;
  const httpsAgent = mtls.hasMtls ? new https.Agent({ cert: mtls.cert, key: mtls.key }) : undefined;
  const url = baseUrl + endpoint;

  console.log('[ITAU-API] mTLS configurado para', baseUrl);

  const headers = {
    'Authorization': 'Bearer ' + accessToken,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'x-itau-apikey': config.itau.clientId,

  };

  try {
    console.log('[ITAU-API] BoleCode API POST', endpoint, '| payload keys:', Object.keys(payload).join(', '));
    const response = await axios.post(url, payload, { headers, httpsAgent, timeout: 30000 });
    return response.data;
  } catch (error) {
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;
      const msg = JSON.stringify(data);
      console.error('[ITAU-API] BoleCode ERRO ' + status + ':', msg);
      throw new Error('BoleCode ' + status + ': ' + msg);
    }
    console.error('[ITAU-API] BoleCode ERRO conexao:', error.message);
    throw new Error('BoleCode conexao: ' + error.message);
  }
}

function createItauApiClient(accessToken) {
  const mtls = config.createMtlsConfig();
  const httpsAgent = mtls.hasMtls ? new https.Agent({ cert: mtls.cert, key: mtls.key }) : undefined;
  const client = axios.create({
    baseURL: config.itau.bolecodeBaseUrl,
    headers: {
      'Authorization': 'Bearer ' + accessToken,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'x-itau-apikey': config.itau.clientId,
    },
    httpsAgent,
    timeout: 30000,
  });
  return client;
}

module.exports = { callBolecode, createItauApiClient };
