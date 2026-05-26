const axios = require('axios');
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
  var urlsToTry = [
    'https://api.itau.com.br/cash_management/v2',
    'https://secure.api.itau/cash_management/v2'
  ];
  var lastError = null;
  for (var ui = 0; ui < urlsToTry.length; ui++) {
    var baseURL = urlsToTry[ui];
    var client = createItauClient(baseURL);
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
        logger.info('Itau API ' + method + ' ' + path + ' | base=' + baseURL + ' (tentativa ' + attempt + ')');
        var response = await client.request(requestConfig);
        logger.info('Itau API ' + method + ' ' + path + ' -> ' + response.status + ' (base=' + baseURL + ')');
        return response.data;
      } catch (error) {
        var status = error.response ? error.response.status : null;
        var errorData = error.response ? error.response.data : null;
        logger.error('Itau API ERRO: ' + method + ' ' + path + ' | base=' + baseURL + ' | status: ' + status + ' | ' + JSON.stringify(errorData));
        lastError = error;
        if (status && status >= 400 && status < 500 && status !== 429) break;
        if (attempt < retries) {
          await new Promise(function(resolve) { setTimeout(resolve, Math.pow(2, attempt) * 1000); });
        }
      }
    }
  }
  throw { status: lastError.response ? lastError.response.status : 502, message: (lastError.response && lastError.response.data && lastError.response.data.message) || lastError.message, detail: lastError.response ? lastError.response.data : null };
}

module.exports = { callItau, callBolecode: callItau, getItauClient: function() { return null; } };
