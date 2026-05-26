// ============================================
// CLIENTE HTTP PARA API DO ITAU v5.5
// ============================================

const axios = require('axios');
const https = require('https');
const config = require('../config');
const { getAuthHeaders, getMtlsAgent } = require('./itau-auth');
const logger = require('../utils/logger');

function createItauClient() {
  const clientConfig = {
    baseURL: config.itauBaseUrl,
    timeout: 30000,
    headers: { 'Content-Type': 'application/json' },
  };
  if (config.mtls.hasMtls) {
    clientConfig.httpsAgent = new https.Agent({
      cert: config.mtls.cert,
      key: config.mtls.key,
      rejectUnauthorized: false,
    });
    logger.info('mTLS configurado para producao (via env vars)');
  } else if (config.ambiente === 'producao') {
    logger.warn('Certificados mTLS nao encontrados! Producao requer mTLS.');
  }
  return axios.create(clientConfig);
}

let itauClient = null;
function getItauClient() {
  if (!itauClient) itauClient = createItauClient();
  return itauClient;
}

async function callItau(method, path, data, params, retries) {
  if (retries === undefined) retries = 2;
  const client = getItauClient();
  for (var attempt = 1; attempt <= retries; attempt++) {
    try {
      const headers = await getAuthHeaders();
      const requestConfig = { method: method, url: path, headers: headers, params: params, data: data };
      logger.debug('Itau API ' + method + ' ' + path, { attempt: attempt });
      const response = await client.request(requestConfig);
      logger.info('Itau API ' + method + ' ' + path + ' -> ' + response.status);
      return response.data;
    } catch (error) {
      var status = error.response ? error.response.status : null;
      var errorData = error.response ? error.response.data : null;
      logger.error('Itau API ' + method + ' ' + path + ' falhou (' + attempt + '/' + retries + ')', {
        status: status, error: errorData || error.message,
      });
      if (status && status >= 400 && status < 500 && status !== 429) {
        throw {
          status: status,
          message: (errorData && (errorData.value || errorData.description || errorData.message)) || 'Erro na API do Itau',
          detail: errorData,
        };
      }
      if (attempt < retries) {
        var delay = Math.pow(2, attempt) * 1000;
        logger.info('Aguardando ' + delay + 'ms antes de retry...');
        await new Promise(function(resolve) { setTimeout(resolve, delay); });
        continue;
      }
      throw {
        status: status || 502,
        message: (errorData && (errorData.value || errorData.description)) || 'Servico do Itau indisponivel',
        detail: errorData,
      };
    }
  }
}

module.exports = { callItau: callItau, getItauClient: getItauClient };
