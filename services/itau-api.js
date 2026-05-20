// ============================================
// CLIENTE HTTP PARA API DO ITAU v5.0
// ============================================
// Gerencia chamadas HTTP com retry, timeout e mTLS
// v5: Suporta certificado via env var (string)

const axios = require('axios');
const https = require('https');
const config = require('../config');
const { getAuthHeaders, getMtlsHeaders } = require('./itau-auth');
const logger = require('../utils/logger');

/**
 * Cria uma instancia do axios configurada para o Itau
 * Inclui mTLS em producao quando certificados estao disponiveis
 */
function createItauClient(options = {}) {
  var clientConfig = {
    baseURL: options.baseUrl || config.itauBaseUrl,
    timeout: options.timeout || 30000,
    headers: {
      'Content-Type': 'application/json',
    },
  };

  // =============================================
  // mTLS: Certificado para comunicacao segura
  // =============================================
  // v5: Suporta certificado via conteudo (env var) ou arquivo
  if (config.hasMtls) {
    var certContent = null;
    var keyContent = null;

    // Opcao 1: Conteudo do certificado via variavel de ambiente
    if (config.certificados.crt && config.certificados.key) {
      certContent = Buffer.from(config.certificados.crt, 'utf8');
      keyContent = Buffer.from(config.certificados.key, 'utf8');
      logger.info('mTLS configurado via variaveis de ambiente');
    }
    // Opcao 2: Arquivos de certificado
    else if (config.certificados.certPath && config.certificados.keyPath) {
      var fs = require('fs');
      certContent = fs.readFileSync(config.certificados.certPath);
      keyContent = fs.readFileSync(config.certificados.keyPath);
      logger.info('mTLS configurado via arquivos');
    }

    if (certContent && keyContent) {
      clientConfig.httpsAgent = new https.Agent({
        cert: certContent,
        key: keyContent,
        rejectUnauthorized: true,
      });
      logger.info('mTLS ativo para chamadas a API Itau');
    }
  } else {
    logger.warn('mTLS NAO configurado. Endpoints que exigem mTLS (boletos) podem falhar.');
  }

  return axios.create(clientConfig);
}

// Instancia singleton para API principal
let itauClient = null;

function getItauClient() {
  if (!itauClient) {
    itauClient = createItauClient();
  }
  return itauClient;
}

// Instancia para BoleCode API (mTLS obrigatoria)
let bolecodeClient = null;

function getBolecodeClient() {
  if (!bolecodeClient) {
    bolecodeClient = createItauClient({
      baseUrl: config.bolecodeUrl,
    });
  }
  return bolecodeClient;
}

// Instancia para PIX API
let pixClient = null;

function getPixClient() {
  if (!pixClient) {
    pixClient = createItauClient({
      baseUrl: config.itauPixUrl,
    });
  }
  return pixClient;
}

// Instancia para Link de Pagamento API
let linkClient = null;

function getLinkClient() {
  if (!linkClient) {
    linkClient = createItauClient({
      baseUrl: config.linkPagamentoUrl,
    });
  }
  return linkClient;
}

/**
 * Faz chamada a API principal do Itau (cash management)
 */
async function callItau(method, path, data = null, params = null, retries = 2) {
  var client = getItauClient();
  var headers = await getAuthHeaders();
  return _doRequest(client, method, path, headers, data, params, retries, 'Itau');
}

/**
 * Faz chamada a API de PIX
 */
async function callPix(method, path, data = null, params = null, retries = 2) {
  var client = getPixClient();
  var headers = await getAuthHeaders();
  return _doRequest(client, method, path, headers, data, params, retries, 'PIX');
}

/**
 * Faz chamada a API BoleCode (mTLS obrigatorio)
 */
async function callBolecode(method, path, data = null, params = null, retries = 2) {
  if (!config.hasMtls) {
    throw {
      status: 403,
      message: 'BoleCode API requer mTLS. Configure ITAU_CERT_CRT e ITAU_CERT_KEY.',
    };
  }
  var client = getBolecodeClient();
  var headers = await getMtlsHeaders();
  return _doRequest(client, method, path, headers, data, params, retries, 'BoleCode');
}

/**
 * Faz chamada a API de Link de Pagamento
 */
async function callLink(method, path, data = null, params = null, retries = 2) {
  var client = getLinkClient();
  var headers = await getAuthHeaders();
  return _doRequest(client, method, path, headers, data, params, retries, 'Link');
}

/**
 * Funcao interna de request com retry e tratamento de erros
 */
async function _doRequest(client, method, url, headers, data, params, retries, serviceName) {
  for (var attempt = 1; attempt <= retries; attempt++) {
    try {
      var requestConfig = {
        method: method,
        url: url,
        headers: headers,
        params: params,
        data: data,
      };

      logger.debug(serviceName + ' API ' + method + ' ' + url, { attempt: attempt });
      var response = await client.request(requestConfig);

      logger.info(serviceName + ' API ' + method + ' ' + url + ' -> ' + response.status);
      return response.data;

    } catch (error) {
      var status = error.response?.status;
      var errorData = error.response?.data;

      logger.error(
        serviceName + ' API ' + method + ' ' + url +
        ' falhou (tentativa ' + attempt + '/' + retries + ')', {
          status: status,
          error: errorData || error.message,
        }
      );

      // Nao retry para erros 4xx (exceto 429 rate limit)
      if (status && status >= 400 && status < 500 && status !== 429) {
        throw {
          status: status,
          message: errorData?.value || errorData?.description || errorData?.message ||
            'Erro na API do Itau (' + serviceName + ')',
          detail: errorData,
        };
      }

      // Retry para erros de rede ou 5xx
      if (attempt < retries) {
        var delay = Math.pow(2, attempt) * 1000;
        logger.info('Aguardando ' + delay + 'ms antes de retry...');
        await new Promise(function(resolve) { setTimeout(resolve, delay); });
        continue;
      }

      throw {
        status: status || 502,
        message: errorData?.value || errorData?.description || 'Servico ' + serviceName + ' indisponivel',
        detail: errorData,
      };
    }
  }
}

module.exports = {
  callItau,
  callPix,
  callBolecode,
  callLink,
  getItauClient,
  getPixClient,
  getBolecodeClient,
  getLinkClient,
};
