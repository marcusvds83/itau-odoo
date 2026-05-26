const fs = require('fs');
const c = `const axios = require('axios');
const https = require('https');
const crypto = require('crypto');
const config = require('../config');
const { getAccessToken, invalidateToken } = require('./itau-auth');
const logger = require('../utils/logger');

function createItauClient() {
  var clientConfig = {
    baseURL: config.itauBaseUrl,
    timeout: 30000,
    headers: { 'Content-Type': 'application/json' },
  };
  if (config.mtls && config.mtls.hasMtls) {
    clientConfig.httpsAgent = new https.Agent({
      cert: config.mtls.cert,
      key: config.mtls.key,
      rejectUnauthorized: false,
    });
  }
  return axios.create(clientConfig);
}

var itauClient = null;
function getItauClient() {
  if (!itauClient) itauClient = createItauClient();
  return itauClient;
}

async function callItau(method, path, data, params, retries) {
  if (retries === undefined) retries = 2;
  var client = getItauClient();
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
      logger.info('Itau API ' + method + ' ' + path);
      var response = await client.request(requestConfig);
      return response.data;
    } catch (error) {
      var status = error.response ? error.response.status : null;
      var errorData = error.response ? error.response.data : null;
      logger.error('Itau API ERRO: ' + method + ' ' + path + ' | status: ' + status + ' | ' + JSON.stringify(errorData));
      if (status && status >= 400 && status < 500 && status !== 429) {
        throw { status: status, message: (errorData && (errorData.value || errorData.message)) || error.message, detail: errorData };
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
  var scopesToTry = ['boleto pix', 'boleto_pix', 'boletos_pix', null];
  var token = null;
  var usedScope = null;
  for (var si = 0; si < scopesToTry.length; si++) {
    try {
      usedScope = scopesToTry[si];
      token = await getAccessToken(usedScope);
      logger.info('Token obtido com scope: ' + (usedScope || 'none'));
      break;
    } catch (scopeErr) {
      logger.warn('Scope ' + (usedScope || 'none') + ' falhou: ' + scopeErr.message);
      if (si < scopesToTry.length - 1) continue;
      throw scopeErr;
    }
  }
  var bolecodePayload = data;
  if (data && (method === 'POST' || method === 'PUT') && path === 'boletos_pix') {
    var fatura = data.dado_boleto || {};
    var pagador = data.pagador || {};
    var txid = '' + Date.now() + crypto.randomBytes(4).toString('hex');
    txid = txid.substring(0, 35);
    bolecodePayload = {
      calendario: { expiracao: 86400 },
      valor: { original: String(fatura.valor_nominal || '0.00').replace(',','.'), modalidadeAlteracao: 0 },
      chave: config.itau.pixChave || '',
      solicitacaoPagador: 'Pagamento - ' + (fatura.seu_numero || fatura.name || 'Boleto'),
    };
    var cpfCnpj = (pagador.cpf_cnpj || '').replace(/\\D/g, '');
    if (cpfCnpj && (pagador.nome || pagador.name)) {
      bolecodePayload.devedor = {};
      if (cpfCnpj.length <= 11) { bolecodePayload.devedor.cpf = cpfCnpj; }
      else { bolecodePayload.devedor.cnpj = cpfCnpj; }
      bolecodePayload.devedor.nome = pagador.nome || pagador.name || '';
    }
    bolecodePayload.infoAdicionais = [];
    if (fatura.seu_numero || fatura.name) {
      bolecodePayload.infoAdicionais.push({ nome: 'Pedido', valor: String(fatura.seu_numero || fatura.name).substring(0, 25) });
    }
    logger.info('BoleCode PUT /boletos_pix/' + txid + ' | scope=' + (usedScope || 'none') + ' | x-itau-apikey=' + (config.itau.clientId || '').substring(0,8) + '...');
    path = 'boletos_pix/' + txid;
    method = 'PUT';
  }
  var clientConfig = {
    baseURL: 'https://secure.api.itau/pix_recebimentos_conciliacoes/v2',
    timeout: 30000,
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'x-itau-apikey': config.itau.clientId,
    },
  };
  if (config.mtls && config.mtls.hasMtls) {
    clientConfig.httpsAgent = new https.Agent({ cert: config.mtls.cert, key: config.mtls.key, rejectUnauthorized: false });
  }
  var client = axios.create(clientConfig);
  try {
    var response = await client.request({ method: method, url: path, data: bolecodePayload, params: params });
    return response.data;
  } catch (error) {
    var status = error.response ? error.response.status : null;
    var errBody = error.response ? error.response.data : null;
    logger.error('BoleCode ERRO ' + status + ': ' + JSON.stringify(errBody));
    if (status === 401 || status === 403) { invalidateToken(usedScope); }
    throw new Error('BoleCode ' + status + ': ' + JSON.stringify(errBody));
  }
}

module.exports = { callItau, callBolecode, getItauClient };
`;
fs.writeFileSync('services/itau-api.js', c, 'utf8');
console.log('OK');
