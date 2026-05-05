// ============================================
// CLIENTE HTTP PARA API DO ITAU
// ============================================
// Gerencia chamadas HTTP com retry, timeout e mTLS

const axios = require('axios');
const fs = require('fs');
const config = require('../config');
const { getAuthHeaders } = require('./itau-auth');
const logger = require('../utils/logger');

/**
 * Cria uma instancia do axios configurada para o Itau
 * Inclui mTLS em producao
 */
function createItauClient() {
  const clientConfig = {
    baseURL: config.itauBaseUrl,
    timeout: 30000,
    headers: {
      'Content-Type': 'application/json',
    },
  };

  // Adiciona mTLS em producao
  if (config.ambiente === 'producao') {
    if (config.certificados.certPath && config.certificados.keyPath) {
      clientConfig.httpsAgent = new (require('https').Agent)({
        cert: fs.readFileSync(config.certificados.certPath),
        key: fs.readFileSync(config.certificados.keyPath),
        ca: config.certificados.caPath
          ? fs.readFileSync(config.certificados.caPath)
          : undefined,
        rejectUnauthorized: true,
      });
      logger.info('mTLS configurado para producao');
    } else {
      logger.warn('Certificados mTLS nao encontrados! Producao requer mTLS.');
    }
  }

  return axios.create(clientConfig);
}

// Instancia singleton do cliente
let itauClient = null;

function getItauClient() {
  if (!itauClient) {
    itauClient = createItauClient();
  }
  return itauClient;
}

/**
 * Faz chamada a API do Itau com auth automatica e retry
 * @param {string} method - GET, POST, PATCH, PUT, DELETE
 * @param {string} path - Caminho do endpoint (ex: /boletos)
 * @param {Object} data - Body da requisicao (POST/PATCH)
 * @param {Object} params - Query params (GET)
 * @param {number} retries - Numero de tentativas
 * @returns {Promise<Object>} Resposta da API
 */
async function callItau(method, path, data = null, params = null, retries = 2) {
  const client = getItauClient();

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const headers = await getAuthHeaders();

      const requestConfig = {
        method,
        url: path,
        headers,
        params,
        data,
      };

      logger.debug(`Itau API ${method} ${path}`, { attempt, data: data ? '...' : null });

      const response = await client.request(requestConfig);

      logger.info(`Itau API ${method} ${path} -> ${response.status}`);
      return response.data;

    } catch (error) {
      const status = error.response?.status;
      const errorData = error.response?.data;

      logger.error(`Itau API ${method} ${path} falhou (tentativa ${attempt}/${retries})`, {
        status,
        error: errorData || error.message,
      });

      // Nao retry para erros 4xx (exceto 429 rate limit)
      if (status && status >= 400 && status < 500 && status !== 429) {
        throw {
          status: status,
          message: errorData?.value || errorData?.description || errorData?.message || 'Erro na API do Itau',
          detail: errorData,
        };
      }

      // Retry para erros de rede ou 5xx
      if (attempt < retries) {
        const delay = Math.pow(2, attempt) * 1000; // Backoff: 2s, 4s
        logger.info(`Aguardando ${delay}ms antes de retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      throw {
        status: status || 502,
        message: errorData?.value || errorData?.description || 'Servico do Itau indisponivel',
        detail: errorData,
      };
    }
  }
}

module.exports = {
  callItau,
  getItauClient,
};
