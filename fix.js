const fs = require('fs');
const c = `const axios = require('axios');
const https = require('https');
const config = require('../config');
const { getAccessToken } = require('./itau-auth');
const logger = require('../utils/logger');

function createItauClient(baseURL) {
  var clientConfig = {
    baseURL: baseURL,
    timeout: 30000,
    headers: { 'Content-Type': 'application/json' },
  };
  if (config.mtls && config.mtls.hasMtls) {
    clientConfig.httpsAgent = new https.Agent({
      cert: config.mtls.cert,
      key: config.mtls.key,
      rejectUnauthorized: false,
    });
    logger.info('mTLS configurado para ' + baseURL);
  }
  return axios.create(clientConfig);
}

async function callItau(method, path, data, params, retries) {
  if (retries === undefined) retries = 2;
  var client = createItauClient(config.itauBaseUrl);
  for (var attempt = 1; attempt <= retries; attempt++) {
    try {
      var token = await getAccessToken();
      var headers = {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'x-itau-apikey': config.itau.clientId,
      };
      var requestConfig = { method: method, url: path, headers: headers, params: params, data: data };
      logger.info('Cash Management ' + method + ' ' + path + ' (tentativa ' + attempt + ')');
      var response = await client.request(requestConfig);
      logger.info('Cash Management ' + method + ' ' + path + ' -> ' + response.status);
      return response.data;
    } catch (error) {
      var status = error.response ? error.response.status : null;
      var errorData = error.response ? error.response.data : null;
      logger.error('Cash Management ERRO: ' + method + ' ' + path + ' | status: ' + status + ' | ' + JSON.stringify(errorData));
      if (status && status >= 400 && status < 500 && status !== 429) {
        throw { status: status, message: (errorData && (errorData.message || errorData.value)) || error.message, detail: errorData };
      }
      if (attempt < retries) {
        await new Promise(function(resolve) { setTimeout(resolve, Math.pow(2, attempt) * 1000); });
        continue;
      }
      throw { status: status || 502, message: error.message, detail: errorData };
    }
  }
}

async function callBolecode(method, path, data, params) {
  var token = await getAccessToken();
  var bolecodeBaseURL = 'https://secure.api.itau/pix_recebimentos_conciliacoes/v2';
  var client = createItauClient(bolecodeBaseURL);
  var headers = {
    'Authorization': 'Bearer ' + token,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'x-itau-apikey': config.itau.clientId,
  };
  try {
    logger.info('BoleCode API ' + method + ' /' + path + ' | payload keys: ' + (data ? Object.keys(data).join(', ') : 'null'));
    var response = await client.request({ method: method, url: path, headers: headers, data: data, params: params });
    logger.info('BoleCode API ' + method + ' /' + path + ' -> ' + response.status);
    return response.data;
  } catch (error) {
    var status = error.response ? error.response.status : null;
    var errBody = error.response ? error.response.data : null;
    logger.error('BoleCode ERRO ' + status + ': ' + JSON.stringify(errBody));
    throw new Error('BoleCode ' + status + ': ' + JSON.stringify(errBody));
  }
}

module.exports = { callItau, callBolecode, getItauClient: function() { return null; } };
`;
fs.writeFileSync('services/itau-api.js', c, 'utf8');
console.log('OK');
