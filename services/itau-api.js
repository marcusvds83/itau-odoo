// ============================================
// CLIENTE HTTP PARA API DO ITAU v6.0
// ============================================

const axios = require("axios");
const https = require("https");
const config = require("../config");
const { getAccessToken } = require("./itau-auth");
const logger = require("../utils/logger");

function createItauClient() {
  var clientConfig = {
    baseURL: config.itauBaseUrl,
    timeout: 30000,
    headers: { "Content-Type": "application/json" },
  };
  if (config.mtls && config.mtls.hasMtls) {
    clientConfig.httpsAgent = new https.Agent({
      cert: config.mtls.cert,
      key: config.mtls.key,
      rejectUnauthorized: false,
    });
    logger.info("mTLS configurado via env vars");
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
      var headers = { "Authorization": "Bearer " + token, "Content-Type": "application/json", "Accept": "application/json" };
      var requestConfig = { method: method, url: path, headers: headers, params: params, data: data };
      logger.info("Itau API " + method + " " + path + " (tentativa " + attempt + "/" + retries + ")");
      var response = await client.request(requestConfig);
      logger.info("Itau API " + method + " " + path + " -> " + response.status);
      return response.data;
    } catch (error) {
      var status = error.response ? error.response.status : null;
      var errorData = error.response ? error.response.data : null;
      var errorMsg = error.message || "erro desconhecido";
      logger.error("Itau API ERRO: " + method + " " + path + " | status: " + status + " | msg: " + errorMsg);
      if (errorData) logger.error("Itau API ERRO DATA: " + JSON.stringify(errorData));
      if (status && status >= 400 && status < 500 && status !== 429) {
        throw { status: status, message: (errorData && (errorData.value || errorData.description || errorData.message)) || errorMsg, detail: errorData };
      }
      if (attempt < retries) {
        await new Promise(function(resolve) { setTimeout(resolve, Math.pow(2, attempt) * 1000); });
        continue;
      }
      throw { status: status || 502, message: errorMsg, detail: errorData };
    }
  }
}

async function callBolecode(method, path, data, params) {
  var token = await getAccessToken();
  var bolecodePayload = data;
  if (data && method === "POST" && path === "boletos_pix") {
    var fatura = data.dado_boleto || {};
    var pagador = data.pagador || {};
    bolecodePayload = {
      calendario: { expiracao: 86400 },
      valor: { original: fatura.valor_nominal || "0.00", modalidadeAlteracao: 0 },
      chave: config.itau.pixChave || "",
      solicitacaoPagador: "Pagamento - " + (fatura.seu_numero || "Boleto"),
    };
    var cpfCnpj = (pagador.cpf_cnpj || "").replace(/D/g, "");
    if (cpfCnpj && (pagador.nome || pagador.name)) {
      bolecodePayload.devedor = {};
      if (cpfCnpj.length <= 11) { bolecodePayload.devedor.cpf = cpfCnpj; }
      else { bolecodePayload.devedor.cnpj = cpfCnpj; }
      bolecodePayload.devedor.nome = pagador.nome || pagador.name || "";
    }
    bolecodePayload.infoAdicionais = [];
    if (fatura.seu_numero || fatura.name) {
      bolecodePayload.infoAdicionais.push({ nome: "Pedido", valor: String(fatura.seu_numero || fatura.name).substring(0, 25) });
    }
    logger.info("Payload BoleCode v2: " + JSON.stringify(bolecodePayload));
  }
  var clientConfig = {
    baseURL: "https://secure.api.itau/pix_recebimentos_conciliacoes/v2",
    timeout: 30000,
    headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json", "Accept": "application/json" },
  };
  if (config.mtls && config.mtls.hasMtls) {
    clientConfig.httpsAgent = new https.Agent({ cert: config.mtls.cert, key: config.mtls.key, rejectUnauthorized: false });
  }
  var client = axios.create(clientConfig);
  logger.info("BoleCode API " + method + " " + path);
  var response = await client.request({ method: method, url: path, data: bolecodePayload, params: params });
  return response.data;
}

module.exports = { callItau, callBolecode, getItauClient };
