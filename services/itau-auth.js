const axios = require("axios");
const config = require("../config");
const https = require("https");

let tokenCache = {};

async function getAccessToken(scope) {
  var now = Date.now();
  var cacheKey = scope || "default";
  if (tokenCache[cacheKey] && tokenCache[cacheKey].accessToken && now < tokenCache[cacheKey].expiresAt) {
    return tokenCache[cacheKey].accessToken;
  }
  console.log("[ITAU-AUTH] Solicitando novo token OAuth2 scope=" + (scope || "none"));
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
    if (scope) { params.append("scope", scope); }
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
      tokenCache[cacheKey] = {
        accessToken: response.data.access_token,
        expiresAt: now + ((response.data.expires_in || 1800) * 1000) - 300000,
      };
      console.log("[ITAU-AUTH] Token obtido com sucesso! scope=" + (scope || "none"));
      return response.data.access_token;
    } else {
      throw new Error("Resposta sem access_token: " + JSON.stringify(response.data));
    }
  } catch (error) {
    console.error("[ITAU-AUTH] ERRO:", error.response ? error.response.status : "", error.response ? JSON.stringify(error.response.data) : error.message);
    tokenCache[cacheKey] = { accessToken: null, expiresAt: 0 };
    throw new Error("Falha OAuth2: " + (error.response && error.response.data ? error.response.data.error_description || JSON.stringify(error.response.data) : error.message));
  }
}

function invalidateToken(scope) {
  var cacheKey = scope || "default";
  tokenCache[cacheKey] = { accessToken: null, expiresAt: 0 };
}

function getTokenStatus() {
  var now = Date.now();
  var result = {};
  for (var key in tokenCache) {
    result[key] = { hasToken: !!tokenCache[key].accessToken, isValid: tokenCache[key].accessToken && now < tokenCache[key].expiresAt };
  }
  return result;
}

module.exports = { getAccessToken, invalidateToken, getTokenStatus };
