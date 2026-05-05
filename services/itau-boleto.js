// ============================================
// SERVICO DE INTEGRACAO API BOLETOS ITAU
// ============================================
// Emissao, consulta e instrucoes de boletos

const { callItau } = require('./itau-api');
const logger = require('../utils/logger');

const BOLETO_ENDPOINTS = {
  emissao: '/post/boletos',         // POST - Emitir boleto
  consulta: '/boletos',             // GET  - Consultar boletos
  pdf: (id) => `/boletos/${id}/pdf`,       // GET  - Obter PDF do boleto (base64)
  abatimento: (id) => `/boletos/${id}/abatimento`,
  baixa: (id) => `/boletos/${id}/baixa`,
  vencimento: (id) => `/boletos/${id}/data_vencimento`,
  juros: (id) => `/boletos/${id}/juros`,
  multa: (id) => `/boletos/${id}/multa`,
  valor_nominal: (id) => `/boletos/${id}/valor_nominal`,
  data_limite: (id) => `/boletos/${id}/data_limite_pagamento`,
  seu_numero: (id) => `/boletos/${id}/seu_numero`,
  protesto: (id) => `/boletos/${id}/protesto`,
  negativacao: (id) => `/boletos/${id}/negativacao`,
  desconto: (id) => `/boletos/${id}/desconto`,
  pagador: (id) => `/boletos/${id}/pagador`,
  sacador_avalista: (id) => `/boletos/${id}/sacador_avalista`,
  recebimento_divergente: (id) => `/boletos/${id}/recebimento_divergente`,
};

/**
 * Monta o payload de emissao de boleto
 * Converte dados do Odoo para formato da API do Itau
 */
function montaPayloadBoleto(odooData) {
  const { fatura, empresa, pagador } = odooData;

  return {
    etapa_processo_boleto: fatura.etapa || 'registro',
    codigo_canal_operacao: 'API',
    beneficiario: {
      agencia: empresa.agencia,
      conta: empresa.conta,
      conta_dv: empresa.conta_dv,
      cpf_cnpj: empresa.cpf_cnpj.replace(/\D/g, ''),
      nome: empresa.nome,
      endereco: {
        logradouro: empresa.logradouro || empresa.street || '',
        numero: empresa.numero || '',
        complemento: empresa.complemento || '',
        bairro: empresa.bairro || empresa.district || '',
        cidade: empresa.cidade || empresa.city || '',
        estado: empresa.estado || empresa.state || '',
        cep: empresa.cep || empresa.zip || '',
      },
    },
    dado_boleto: {
      nosso_numero: fatura.nosso_numero || '',
      seu_numero: fatura.seu_numero || fatura.name || '',
      data_vencimento: fatura.data_vencimento,
      data_limite_pagamento: fatura.data_limite_pagamento || null,
      valor_nominal: fatura.valor_nominal.toFixed(2),
      especie_titulo: fatura.especie || 'DSI',
      aceite: fatura.aceite || 'N',
      // Descontos
      desconto1_codigo: fatura.desconto1_codigo || null,
      desconto1_data: fatura.desconto1_data || null,
      desconto1_valor: fatura.desconto1_valor ? fatura.desconto1_valor.toFixed(2) : null,
      desconto2_codigo: fatura.desconto2_codigo || null,
      desconto2_data: fatura.desconto2_data || null,
      desconto2_valor: fatura.desconto2_valor ? fatura.desconto2_valor.toFixed(2) : null,
      desconto3_codigo: fatura.desconto3_codigo || null,
      desconto3_data: fatura.desconto3_data || null,
      desconto3_valor: fatura.desconto3_valor ? fatura.desconto3_valor.toFixed(2) : null,
      // Juros
      juros_tipo: fatura.juros_tipo || 'isento',
      juros_valor: fatura.juros_valor || null,
      // Multa
      multa_tipo: fatura.multa_tipo || 'isento',
      multa_valor: fatura.multa_valor || null,
      multa_data: fatura.multa_data || null,
      // Protesto e Negativacao
      protesto_codigo: fatura.protesto_codigo || 'isento',
      protesto_prazo: fatura.protesto_prazo || null,
      negativacao_codigo: fatura.negativacao_codigo || 'isento',
      negativacao_prazo: fatura.negativacao_prazo || null,
      // Instrucoes
      instrucao_caixa1: fatura.instrucao1 || '',
      instrucao_caixa2: fatura.instrucao2 || '',
      instrucao_caixa3: fatura.instrucao3 || '',
      instrucao_caixa4: fatura.instrucao4 || '',
    },
    pagador: {
      cpf_cnpj: pagador.cpf_cnpj ? pagador.cpf_cnpj.replace(/\D/g, '') : '',
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
 * EMITIR boleto no Itau
 * @param {Object} odooData - Dados da fatura do Odoo
 * @returns {Promise<Object>} Resposta do Itau com dados do boleto
 */
async function emitirBoleto(odooData) {
  logger.info('Emitindo boleto no Itau...');

  const payload = montaPayloadBoleto(odooData);

  // Limpa campos null do payload
  function limparNull(obj) {
    const cleaned = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== null && value !== undefined) {
        if (typeof value === 'object' && !Array.isArray(value)) {
          cleaned[key] = limparNull(value);
        } else {
          cleaned[key] = value;
        }
      }
    }
    return cleaned;
  }

  const cleanPayload = limparNull(payload);
  logger.debug('Payload boleto montado', { etapa: payload.etapa_processo_boleto });

  const resultado = await callItau('POST', BOLETO_ENDPOINTS.emissao, cleanPayload);

  if (resultado.codigo_barras || resultado.data?.codigo_barras) {
    logger.info('Boleto emitido com sucesso');
  } else {
    logger.warn('Boleto processado, mas sem dados de retorno completo');
  }

  return resultado.data || resultado;
}

/**
 * CONSULTAR boletos no Itau
 * @param {Object} filtros - Filtros de consulta
 * @returns {Promise<Array>} Lista de boletos
 */
async function consultarBoletos(filtros = {}) {
  logger.info('Consultando boletos no Itau...', filtros);

  const resultado = await callItau('GET', BOLETO_ENDPOINTS.consulta, null, filtros);

  logger.info(`Consultados ${Array.isArray(resultado) ? resultado.length : '?'} boletos`);
  return resultado;
}

/**
 * BAIXAR boleto (invalidar)
 */
async function baixarBoleto(idBoleto) {
  logger.info(`Baixando boleto ${idBoleto}...`);
  return callItau('PATCH', BOLETO_ENDPOINTS.baixa(idBoleto));
}

/**
 * ALTERAR vencimento do boleto
 */
async function alterarVencimento(idBoleto, novaDataVencimento) {
  logger.info(`Alterando vencimento do boleto ${idBoleto} para ${novaDataVencimento}`);
  return callItau('PATCH', BOLETO_ENDPOINTS.vencimento(idBoleto), {
    data_vencimento: novaDataVencimento,
  });
}

/**
 * ALTERAR valor nominal do boleto
 */
async function alterarValorNominal(idBoleto, novoValor) {
  logger.info(`Alterando valor do boleto ${idBoleto} para ${novoValor}`);
  return callItau('PATCH', BOLETO_ENDPOINTS.valor_nominal(idBoleto), {
    valor_titulo: novoValor.toFixed(2),
  });
}

/**
 * ALTERAR juros do boleto
 */
async function alterarJuros(idBoleto, jurosData) {
  logger.info(`Alterando juros do boleto ${idBoleto}`);
  return callItau('PATCH', BOLETO_ENDPOINTS.juros(idBoleto), jurosData);
}

/**
 * ALTERAR multa do boleto
 */
async function alterarMulta(idBoleto, multaData) {
  logger.info(`Alterando multa do boleto ${idBoleto}`);
  return callItau('PATCH', BOLETO_ENDPOINTS.multa(idBoleto), multaData);
}

/**
 * ALTERAR desconto do boleto
 */
async function alterarDesconto(idBoleto, descontoData) {
  logger.info(`Alterando desconto do boleto ${idBoleto}`);
  return callItau('PATCH', BOLETO_ENDPOINTS.desconto(idBoleto), descontoData);
}

/**
 * ALTERAR pagador do boleto
 */
async function alterarPagador(idBoleto, pagadorData) {
  logger.info(`Alterando pagador do boleto ${idBoleto}`);
  return callItau('PATCH', BOLETO_ENDPOINTS.pagador(idBoleto), pagadorData);
}

/**
 * VALIDAR boleto (etapa validacao antes do registro)
 */
async function validarBoleto(odooData) {
  logger.info('Validando boleto no Itau (simulacao)...');
  const payload = montaPayloadBoleto(odooData);
  payload.etapa_processo_boleto = 'validacao';

  function limparNull(obj) {
    const cleaned = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== null && value !== undefined) {
        if (typeof value === 'object' && !Array.isArray(value)) {
          cleaned[key] = limparNull(value);
        } else {
          cleaned[key] = value;
        }
      }
    }
    return cleaned;
  }

  const resultado = await callItau('POST', BOLETO_ENDPOINTS.emissao, limparNull(payload));
  return resultado.data || resultado;
}

/**
 * OBTER PDF do boleto (base64)
 * @param {string} idBoleto - Codigo de barras ou nosso_numero do boleto
 * @returns {Promise<Object>} { pdf_base64: string, content_type: string }
 */
async function obterPdfBoleto(idBoleto) {
  logger.info(`Obtendo PDF do boleto ${idBoleto}...`);

  try {
    const resultado = await callItau('GET', BOLETO_ENDPOINTS.pdf(idBoleto));

    // O Itau pode retornar base64 direto ou dentro de um campo
    const pdfBase64 = resultado.pdf || resultado.base64 || resultado.data?.pdf
      || resultado.data?.base64 || (typeof resultado === 'string' ? resultado : null);

    if (!pdfBase64) {
      logger.warn('PDF obtido, mas formato nao reconhecido. Retornando resposta bruta.');
      return resultado.data || resultado;
    }

    logger.info(`PDF do boleto ${idBoleto} obtido com sucesso (${(pdfBase64.length * 0.75 / 1024).toFixed(1)} KB)`);
    return {
      pdf_base64: pdfBase64,
      content_type: 'application/pdf',
      tamanho_kb: Math.round(pdfBase64.length * 0.75 / 1024),
    };

  } catch (error) {
    logger.error(`Erro ao obter PDF do boleto: ${error.message}`);
    throw {
      status: error.status || 500,
      message: `Erro ao obter PDF do boleto: ${error.message}`,
      detail: error.detail,
    };
  }
}

/**
 * EMITIR boleto e ja retornar o PDF no mesmo chamada
 * Combina emitir + obter PDF em uma unica operacao
 */
async function emitirBoletoComPdf(odooData) {
  logger.info('Emitindo boleto e obtendo PDF...');

  // Passo 1: Emitir o boleto
  const resultado = await emitirBoleto(odooData);

  // Passo 2: Obter o PDF usando o codigo de barras como ID
  const idBoleto = resultado.codigo_barras || resultado.nosso_numero;
  if (idBoleto) {
    try {
      const pdf = await obterPdfBoleto(idBoleto);
      resultado.pdf_base64 = pdf.pdf_base64 || pdf.base64;
      resultado.pdf_content_type = pdf.content_type;
    } catch (pdfError) {
      logger.warn(`Boleto emitido mas PDF nao disponivel: ${pdfError.message}`);
      resultado.pdf_erro = pdfError.message;
    }
  }

  return resultado;
}

module.exports = {
  emitirBoleto,
  emitirBoletoComPdf,
  consultarBoletos,
  obterPdfBoleto,
  baixarBoleto,
  alterarVencimento,
  alterarValorNominal,
  alterarJuros,
  alterarMulta,
  alterarDesconto,
  alterarPagador,
  validarBoleto,
  BOLETO_ENDPOINTS,
};
