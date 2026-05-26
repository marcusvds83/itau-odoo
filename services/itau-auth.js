const axios = require("axios");
const config = require("../config");
const https = require("https");

let tokenCache = { accessToken: null, expiresAt: 0 };

async function getAccessToken() {
  var now = Date.now();
  if (tokenCache.accessToken && now < tokenCache.expiresAt) {
    return tokenCache.accessToken;
  }
  console.log("[ITAU-AUTH] Solicitando novo token OAuth2...");
  console.log("[ITAU-AUTH] URL:", config.itauTokenUrl);
  var httpsAgent = config.mtls.hasMtls ? new https.Agent({
    cert: config.mtls.cert,
    key: config.mtls.key,
  }) : undefined;
  try {
    var params = new URLSearchParams();
    params.append("grant_type", "client_credentials");
    params.append("client_id", config.itau.clientId);
    params.append("client_secret", config.itau.clientSecret);
    var response = await axios.post(config.itauTokenUrl, params.toString(), {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "x-itau-flowID": "1",
        "x-itau-correlationID": String(Date.now()),
        "Accept": "application/json",
      },
      httpsAgent: httpsAgent,
      timeout: 30000,
    });
    if (response.data && response.data.access_token) {
      tokenCache.accessToken = response.data.access_token;
      tokenCache.expiresAt = now + ((response.data.expires_in || 1800) * 1000) - 300000;
      console.log("[ITAU-AUTH] Token obtido com sucesso!");
      return response.data.access_token;
    } else {
      throw new Error("Resposta sem access_token");
    }
  } catch (error) {
    console.error("[ITAU-AUTH] ERRO:", error.response ? error.response.status : "", error.response ? JSON.stringify(error.response.data) : error.message);
    tokenCache.accessToken = null;
    tokenCache.expiresAt = 0;
    throw new Error("Falha OAuth2: " + (error.response && error.response.data ? error.response.data.error_description || error.response.data.error : error.message));
  }
}

function invalidateToken() {
  tokenCache.accessToken = null;
  tokenCache.expiresAt = 0;
}

function getTokenStatus() {
  var now = Date.now();
  return { hasToken: !!tokenCache.accessToken, isValid: tokenCache.accessToken && now < tokenCache.expiresAt };
}

module.exports = { getAccessToken, invalidateToken, getTokenStatus };
