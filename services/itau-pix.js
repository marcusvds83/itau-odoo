// ============================================
// SERVICO DE INTEGRACAO API PIX ITAU
// ============================================
// Criacao de cobranca PIX, consulta e devolucao
// Segue especificacao BACEN

const axios = require('axios');
const config = require('../config');
const { getAuthHeaders } = require('./itau-auth');
const logger = require('../utils/logger');

/**
 * Emite cobranca PIX no Itau
 * @param {Object} pixData - Dados da cobranca PIX
 * @returns {Promise<Object>} Resposta com dados da cobranca
 */
async function criarCobrancaPix(pixData) {
  logger.info('Criando cobranca PIX...');

  const headers = await getAuthHeaders();

  const payload = {
    calendario: {
      criacao: new Date().toISOString(),
      expiracao: pixData.expiracao || 3600, // Default: 1 hora
    },
    valor: {
      original: pixData.valor.toFixed(2),
      modalidadeAlteracao: pixData.modalidadeAlteracao || null,
    },
    chave: pixData.chave || config.itau.pixChave,
    devedor: pixData.devedor ? {
      cpf: pixData.devedor.cpf || null,
      cnpj: pixData.devedor.cnpj || null,
      nome: pixData.devedor.nome,
    } : undefined,
    infoAdicionais: pixData.infoAdicionais || [],
    solicitaPagador: pixData.solicitaPagador || false,
  };

  const endpoint = pixData.txid
    ? `/v2/cob/${pixData.txid}`
    : '/v2/cob';

  const baseUrl = config.itauPixUrl;

  try {
    let response;

    if (pixData.txid) {
      // PUT - Atualizar cobranca existente
      response = await axios.put(`${baseUrl}${endpoint}`, payload, { headers, timeout: 30000 });
    } else {
      // PUT - Criar cobranca (Itau usa PUT com txid gerado)
      const txid = gerarTxid(pixData);
      response = await axios.put(`${baseUrl}/v2/cob/${txid}`, payload, { headers, timeout: 30000 });
    }

    logger.info(`Cobranca PIX criada: ${response.data?.txid || 'sem txid'}`);
    return response.data;

  } catch (error) {
    const status = error.response?.status;
    const errData = error.response?.data;
    logger.error(`Falha ao criar cobranca PIX: ${status} - ${JSON.stringify(errData)}`);
    throw {
      status: status || 502,
      message: errData?.mensagem || 'Erro ao criar cobranca PIX',
      detail: errData,
    };
  }
}

/**
 * Consulta cobranca PIX pelo txid
 */
async function consultarCobrancaPix(txid) {
  logger.info(`Consultando cobranca PIX ${txid}...`);

  const headers = await getAuthHeaders();
  const baseUrl = config.itauPixUrl;

  const response = await axios.get(`${baseUrl}/v2/cob/${txid}`, { headers, timeout: 30000 });
  return response.data;
}

/**
 * Gera um txid unico para a transacao PIX
 * Formato: 26 caracteres alfanumericos (BACEN)
 * Sugestao: uso do ID do Odoo + timestamp
 */
function gerarTxid(pixData) {
  const { v4: uuidv4 } = require('uuid');
  // Remove hifens do UUID para obter 32 chars, pega os primeiros 26
  const txid = uuidv4().replace(/-/g, '').substring(0, 26).toUpperCase();
  return txid;
}

/**
 * Consulta PIX recebido pelo e2eId
 */
async function consultarPixRecebido(e2eId) {
  logger.info(`Consultando PIX recebido ${e2eId}...`);

  const headers = await getAuthHeaders();
  const baseUrl = config.itauPixUrl;

  const response = await axios.get(`${baseUrl}/v2/pix/${e2eId}`, { headers, timeout: 30000 });
  return response.data;
}

/**
 * Solicita devolucao de um PIX
 */
async function devolverPix(e2eId, devolucaoData) {
  logger.info(`Solicitando devolucao PIX ${e2eId}...`);

  const headers = await getAuthHeaders();
  const baseUrl = config.itauPixUrl;

  const payload = {
    valor: devolucaoData.valor.toFixed(2),
  };

  const response = await axios.put(
    `${baseUrl}/v2/pix/${e2eId}/devolucao/${devolucaoData.idDevolucao}`,
    payload,
    { headers, timeout: 30000 }
  );

  logger.info(`Devolucao PIX solicitada: ${devolucaoData.idDevolucao}`);
  return response.data;
}

/**
 * Consulta webhook de PIX configurado
 */
async function consultarWebhookPix(chave) {
  logger.info(`Consultando webhook PIX para chave ${chave}...`);

  const headers = await getAuthHeaders();
  const baseUrl = config.itauPixUrl;

  try {
    const response = await axios.get(`${baseUrl}/v2/webhook/${chave}`, { headers, timeout: 30000 });
    return response.data;
  } catch (error) {
    if (error.response?.status === 404) {
      return null; // Webhook nao configurado
    }
    throw error;
  }
}

/**
 * Configura webhook para receber notificacoes PIX
 */
async function configurarWebhookPix(chave, webhookUrl) {
  logger.info(`Configurando webhook PIX: ${webhookUrl}`);

  const headers = await getAuthHeaders();
  const baseUrl = config.itauPixUrl;

  const response = await axios.put(
    `${baseUrl}/v2/webhook/${chave}`,
    { webhookUrl },
    { headers, timeout: 30000 }
  );

  logger.info('Webhook PIX configurado com sucesso');
  return response.data;
}

module.exports = {
  criarCobrancaPix,
  consultarCobrancaPix,
  gerarTxid,
  consultarPixRecebido,
  devolverPix,
  consultarWebhookPix,
  configurarWebhookPix,
};
