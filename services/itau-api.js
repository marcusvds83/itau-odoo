const axios = require('axios');
const https = require('https');
const config = require('../config');

async function callBolecode(accessToken, endpoint, payload) {
  const mtls = config.createMtlsConfig();
  const baseUrl = config.itau.bolecodeBaseUrl;
  const httpsAgent = mtls.hasMtls ? new https.Agent({ cert: mtls.cert, key: mtls.key }) : undefined;
  const url = baseUrl + endpoint;
  console.log('[ITAU-API] BoleCode POST', endpoint);
  const headers = {
    'Authorization': 'Bearer ' + accessToken,
    'Content-Type': 'application/json; charset=utf-8',
    'Accept': 'application/json',
    'x-itau-apikey': config.itau.clientId,
    'x-itau-correlationID': String(Date.now()),
  };
  try {
    const response = await axios.post(url, payload, { headers, httpsAgent, timeout: 30000 });
    return response.data;
  } catch (error) {
    if (error.response) {
      const msg = JSON.stringify(error.response.data);
      console.error('[ITAU-API] ERRO ' + error.response.status + ':', msg);
      throw new Error('BoleCode ' + error.response.status + ': ' + msg);
    }
    throw new Error('BoleCode conexao: ' + error.message);
  }
}

module.exports = { callBolecode };
