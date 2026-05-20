// ============================================
// SERVICO DE INTEGRACAO API BOLETOS ITAU v5.0
// ============================================
// Emissao e consulta de boletos via Cash Management API
// v5: Suporta mTLS para producao

const { callItau } = require('./itau-api');
const logger = require('../utils/logger');

const BOLETO_ENDPOINTS = {
  emissao: '/post/boletos',
  consulta: '/boletos',
  pdf: function(id) { return '/boletos/' + id + '/pdf'; },
  baixa: function(id) { return '/boletos/' + id + '/baixa'; },
  vencimento: function(id) { return '/boletos/' + id + '/data_vencimento'; },
  juros: function(id) { return '/boletos/' + id + '/juros'; },
  multa: function(id) { return '/boletos/' + id + '/multa'; },
  valor_nominal: function(id) { return '/boletos/' + id + '/valor_nominal'; },
  desconto: function(id) { return '/boletos/' + id + '/desconto'; },
  pagador: function(id) { return '/boletos/' + id + '/pagador'; },
};

/**
 * Monta o payload de emissao de boleto
 */
function montaPayloadBoleto(odooData) {
  var fatura = odooData.fatura || {};
  var empresa = odooData.empresa || {};
  var pagador = odooData.pagador || {};

  return {
    etapa_processo_boleto: fatura.etapa || 'registro',
    codigo_canal_operacao: 'API',
    beneficiario: {
      agencia: empresa.agencia,
      conta: empresa.conta,
      conta_dv: empresa.conta_dv,
      cpf_cnpj: (empresa.cpf_cnpj || '').replace(/\D/g, ''),
      nome: empresa.nome || 'AJL Ferro e Aco',
      endereco: {
        logradouro: empresa.logradouro || empresa.street || '',
        numero: empresa.numero || '',
        complemento: empresa.complemento || '',
        bairro: empresa.bairro || empresa.district || '',
        cidade: empresa.cidade || empresa.city || 'Curitiba',
        estado: empresa.estado || empresa.state || 'PR',
        cep: empresa.cep || empresa.zip || '',
      },
    },
    dado_boleto: {
      nosso_numero: fatura.nosso_numero || '',
      seu_numero: fatura.seu_numero || fatura.name || '',
      data_vencimento: fatura.data_vencimento,
      data_limite_pagamento: fatura.data_limite_pagamento || null,
      valor_nominal: (fatura.valor_nominal || 0).toFixed(2),
      especie_titulo: fatura.especie || 'DSI',
      aceite: fatura.aceite || 'N',
      desconto1_codigo: fatura.desconto1_codigo || null,
      desconto1_data: fatura.desconto1_data || null,
      desconto1_valor: fatura.desconto1_valor ? fatura.desconto1_valor.toFixed(2) : null,
      desconto2_codigo: fatura.desconto2_codigo || null,
      desconto2_data: fatura.desconto2_data || null,
      desconto2_valor: fatura.desconto2_valor ? fatura.desconto2_valor.toFixed(2) : null,
      desconto3_codigo: fatura.desconto3_codigo || null,
      desconto3_data: fatura.desconto3_data || null,
      desconto3_valor: fatura.desconto3_valor ? fatura.desconto3_valor.toFixed(2) : null,
      juros_tipo: fatura.juros_tipo || 'isento',
      juros_valor: fatura.juros_valor || null,
      multa_tipo: fatura.multa_tipo || 'isento',
      multa_valor: fatura.multa_valor || null,
      multa_data: fatura.multa_data || null,
      protesto_codigo: fatura.protesto_codigo || 'isento',
      protesto_prazo: fatura.protesto_prazo || null,
      negativizacao_codigo: fatura.negativizacao_codigo || 'isento',
      negativizacao_prazo: fatura.negativizacao_prazo || null,
      instrucao_caixa1: fatura.instrucao1 || '',
      instrucao_caixa2: fatura.instrucao2 || '',
      instrucao_caixa3: fatura.instrucao3 || '',
      instrucao_caixa4: fatura.instrucao4 || '',
    },
    pagador: {
      cpf_cnpj: (pagador.cpf_cnpj || '').replace(/\D/g, ''),
      nome: pagador.nome || pagador.name || '',
      endereco: {
        logradouro: pagador.street || '',
        numero: pagador.street_number || '',
        complemento: pagador.street2 || '',
        bairro: pagador.district || '',
        cidade: pagador.city || '',
        estado: pagador.state || '',
        cep: pagador.zip || '',
      },
    },
  };
}

/**
 * Remove campos null/undefined do payload
 */
function limparNull(obj) {
  var cleaned = {};
  for (var key in obj) {
    if (obj[key] !== null && obj[key] !== undefined) {
      if (typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
        cleaned[key] = limparNull(obj[key]);
      } else {
        cleaned[key] = obj[key];
      }
    }
  }
  return cleaned;
}

/**
 * Emite boleto no Itau
 */
async function emitirBoleto(odooData) {
  logger.info('Emitindo boleto no Itau...');
  var payload = montaPayloadBoleto(odooData);
  var cleanPayload = limparNull(payload);
  logger.debug('Payload boleto montado', { etapa: payload.etapa_processo_boleto });

  var resultado = await callItau('POST', BOLETO_ENDPOINTS.emissao, cleanPayload);

  if (resultado.codigo_barras || resultado.data?.codigo_barras) {
    logger.info('Boleto emitido com sucesso');
  } else {
    logger.warn('Boleto processado, porem sem dados de retorno completo');
  }

  return resultado.data || resultado;
}

/**
 * Consulta boletos
 */
async function consultarBoletos(filtros) {
  logger.info('Consultando boletos no Itau...', filtros);
  var resultado = await callItau('GET', BOLETO_ENDPOINTS.consulta, null, filtros);
  logger.info('Consultados ' + (Array.isArray(resultado) ? resultado.length : '?') + ' boletos');
  return resultado;
}

/**
 * Baixa (cancela) boleto
 */
async function baixarBoleto(idBoleto) {
  logger.info('Baixando boleto ' + idBoleto + '...');
  return callItau('PATCH', BOLETO_ENDPOINTS.baixa(idBoleto));
}

/**
 * Altera vencimento
 */
async function alterarVencimento(idBoleto, novaDataVencimento) {
  logger.info('Alterando vencimento do boleto ' + idBoleto + ' para ' + novaDataVencimento);
  return callItau('PATCH', BOLETO_ENDPOINTS.vencimento(idBoleto), {
    data_vencimento: novaDataVencimento,
  });
}

/**
 * Obtem PDF do boleto
 */
async function obterPdfBoleto(idBoleto) {
  logger.info('Obtendo PDF do boleto ' + idBoleto + '...');
  try {
    var resultado = await callItau('GET', BOLETO_ENDPOINTS.pdf(idBoleto));
    var pdfBase64 = resultado.pdf || resultado.base64 || resultado.data?.pdf ||
      resultado.data?.base64 || (typeof resultado === 'string' ? resultado : null);

    if (!pdfBase64) {
      logger.warn('PDF obtido, mas formato nao reconhecido. Retornando resposta bruta.');
      return resultado.data || resultado;
    }

    logger.info('PDF do boleto ' + idBoleto + ' obtido (' +
      (pdfBase64.length * 0.75 / 1024).toFixed(1) + ' KB)');
    return {
      pdf_base64: pdfBase64,
      content_type: 'application/pdf',
      tamanho_kb: Math.round(pdfBase64.length * 0.75 / 1024),
    };
  } catch (error) {
    logger.error('Erro ao obter PDF do boleto: ' + error.message);
    throw {
      status: error.status || 500,
      message: 'Erro ao obter PDF do boleto: ' + error.message,
      detail: error.detail,
    };
  }
}

module.exports = {
  emitirBoleto,
  consultarBoletos,
  obterPdfBoleto,
  baixarBoleto,
  alterarVencimento,
  BOLETO_ENDPOINTS,
};
