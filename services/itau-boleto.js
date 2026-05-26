// ============================================
// SERVICO DE INTEGRACAO API BOLETOS ITAU v5.1
// ============================================
// Emissao e consulta de boletos via BoleCode API
// v5.1: Usa callBolecode (mTLS + secure.api.itau)

const { callBolecode, callItau } = require('./itau-api');
const config = require('../config');
const logger = require('../utils/logger');

const BOLECODE_ENDPOINTS = {
  emissao: 'boletos_pix',
  consulta: 'boletos_pix',
  pdf: function(id) { return 'boletos_pix/' + id + '/pdf'; },
};

const BOLETO_ENDPOINTS = {
  emissao: 'post/boletos',
  consulta: 'boletos',
  pdf: function(id) { return 'boletos/' + id + '/pdf'; },
  baixa: function(id) { return 'boletos/' + id + '/baixa'; },
  vencimento: function(id) { return 'boletos/' + id + '/data_vencimento'; },
  juros: function(id) { return 'boletos/' + id + '/juros'; },
  multa: function(id) { return 'boletos/' + id + '/multa'; },
  valor_nominal: function(id) { return 'boletos/' + id + '/valor_nominal'; },
  desconto: function(id) { return 'boletos/' + id + '/desconto'; },
  pagador: function(id) { return 'boletos/' + id + '/pagador'; },
};

function montaPayloadBolecode(odooData) {
  var fatura = odooData.fatura || {};
  var empresa = odooData.empresa || {};
  var pagador = odooData.pagador || {};

  var agencia = empresa.agencia || '7764';
  var conta = (empresa.conta || '223389').replace('-', '');
  var contaSemDv = conta.slice(0, -1);
  var dv = conta.slice(-1);
  var idBeneficiario = agencia + '00' + contaSemDv + dv;

  var payload = {
    etapa_processo_boleto: fatura.etapa || 'Simulacao',
    codigo_canal_operacao: 'API',
    indicador_continuade: 'N',
    numero_contrato: idBeneficiario,
    beneficiario: {
      cpf_cnpj: (empresa.cpf_cnpj || '22603750000190').replace(/\D/g, ''),
      nome: empresa.nome || 'AJL FERRO E ACO',
    },
    dado_boleto: {
      nosso_numero: fatura.nosso_numero || '',
      seu_numero: fatura.seu_numero || fatura.name || '',
      data_vencimento: fatura.data_vencimento,
      valor_nominal: (fatura.valor_nominal || 0).toFixed(2),
      especie_titulo: fatura.especie || 'DSI',
      aceite: fatura.aceite || 'N',
      data_emissao: fatura.data_emissao || new Date().toISOString().split('T')[0],
      data_limite_pagamento: fatura.data_limite_pagamento || null,
      juros_tipo: fatura.juros_tipo || 'ISENTO',
      juros_valor: fatura.juros_valor || null,
      multa_tipo: fatura.multa_tipo || 'ISENTO',
      multa_valor: fatura.multa_valor || null,
      multa_data: fatura.multa_data || null,
      protesto_codigo: fatura.protesto_codigo || 'ISENTO',
      protesto_prazo: fatura.protesto_prazo || null,
      negativacao_codigo: fatura.negativizacao_codigo || 'ISENTO',
      negativizacao_prazo: fatura.negativizacao_prazo || null,
      instrucao_caixa1: fatura.instrucao1 || '',
      instrucao_caixa2: fatura.instrucao2 || '',
    },
    pagador: {
      cpf_cnpj: (pagador.cpf_cnpj || '').replace(/\D/g, ''),
      nome: pagador.nome || pagador.name || '',
    },
  };

  if (pagador.nome || pagador.name) {
    payload.pagador.endereco = {
      logradouro: pagador.street || pagador.logradouro || '',
      numero: pagador.street_number || pagador.numero || '',
      complemento: pagador.street2 || pagador.complemento || '',
      bairro: pagador.district || pagador.bairro || '',
      cidade: pagador.city || pagador.cidade || '',
      estado: pagador.state || pagador.estado || '',
      cep: (pagador.zip || pagador.cep || '').replace(/\D/g, ''),
    };
  }

  return payload;
}

function montaPayloadCashManagement(odooData) {
  var fatura = odooData.fatura || {};
  var empresa = odooData.empresa || {};
  var pagador = odooData.pagador || {};

  return {
    etapa_processo_boleto: fatura.etapa || 'registro',
    codigo_canal_operacao: 'API',
    beneficiario: {
      agencia: empresa.agencia || '7764',
      conta: empresa.conta || '223389',
      conta_dv: empresa.conta_dv || '9',
      cpf_cnpj: (empresa.cpf_cnpj || '22603750000190').replace(/\D/g, ''),
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

async function emitirBoleto(odooData) {
  var fatura = odooData.fatura || {};
  var etapa = fatura.etapa || 'Simulacao';

  logger.info('Emitindo boleto no Itau... etapa: ' + etapa);

  if (config.mtls.hasMtls) {
    try {
      logger.info('Tentando emissao via BoleCode API (mTLS)...');
      var payloadBolecode = montaPayloadBolecode(odooData);
      payloadBolecode.etapa_processo_boleto = etapa;
      var cleanPayload = limparNull(payloadBolecode);

      logger.info('Payload BoleCode', {
        etapa: etapa,
        contrato: payloadBolecode.numero_contrato,
        valor: payloadBolecode.dado_boleto.valor_nominal,
      });

      var resultado = await callBolecode('POST', BOLECODE_ENDPOINTS.emissao, cleanPayload);

      if (resultado.codigo_barras || resultado.data?.codigo_barras) {
        logger.info('Boleto emitido com sucesso via BoleCode');
      } else {
        logger.warn('Boleto processado via BoleCode, sem retorno completo');
      }

      var resp = resultado.data || resultado;
      resp._via = 'bolecode';
      return resp;
    } catch (bolecodeError) {
      logger.warn('BoleCode falhou: ' + bolecodeError.message + ' - tentando Cash Management');
    }
  }

  logger.info('Tentando emissao via Cash Management API...');
  var payloadCash = montaPayloadCashManagement(odooData);
  payloadCash.etapa_processo_boleto = etapa;
  var cleanCash = limparNull(payloadCash);

  var resultadoCash = await callItau('POST', BOLETO_ENDPOINTS.emissao, cleanCash);

  if (resultadoCash.codigo_barras || resultadoCash.data?.codigo_barras) {
    logger.info('Boleto emitido via Cash Management');
  }

  var respCash = resultadoCash.data || resultadoCash;
  respCash._via = 'cash_management';
  return respCash;
}

async function consultarBoletos(filtros) {
  logger.info('Consultando boletos...', filtros);
  if (config.mtls.hasMtls) {
    try {
      return await callBolecode('GET', BOLECODE_ENDPOINTS.consulta, null, filtros);
    } catch (err) {
      logger.warn('Consulta BoleCode falhou: ' + err.message);
    }
  }
  return await callItau('GET', BOLETO_ENDPOINTS.consulta, null, filtros);
}

async function baixarBoleto(idBoleto) {
  logger.info('Baixando boleto ' + idBoleto + '...');
  return callItau('PATCH', BOLETO_ENDPOINTS.baixa(idBoleto));
}

async function alterarVencimento(idBoleto, novaDataVencimento) {
  logger.info('Alterando vencimento boleto ' + idBoleto);
  return callItau('PATCH', BOLETO_ENDPOINTS.vencimento(idBoleto), { data_vencimento: novaDataVencimento });
}

async function obterPdfBoleto(idBoleto) {
  logger.info('Obtendo PDF boleto ' + idBoleto + '...');
  try {
    if (config.mtls.hasMtls) {
      try {
        var r = await callBolecode('GET', BOLECODE_ENDPOINTS.pdf(idBoleto));
        var pdf = r.pdf || r.base64 || r.data?.pdf || r.data?.base64 || (typeof r === 'string' ? r : null);
        if (pdf) return { pdf_base64: pdf, content_type: 'application/pdf', tamanho_kb: Math.round(pdf.length * 0.75 / 1024) };
      } catch (err) { logger.warn('PDF BoleCode falhou: ' + err.message); }
    }
    var rc = await callItau('GET', BOLETO_ENDPOINTS.pdf(idBoleto));
    var pdfc = rc.pdf || rc.base64 || rc.data?.pdf || rc.data?.base64 || (typeof rc === 'string' ? rc : null);
    if (pdfc) return { pdf_base64: pdfc, content_type: 'application/pdf', tamanho_kb: Math.round(pdfc.length * 0.75 / 1024) };
    return rc.data || rc;
  } catch (error) {
    throw { status: error.status || 500, message: 'Erro PDF: ' + error.message, detail: error.detail };
  }
}

module.exports = { emitirBoleto, consultarBoletos, obterPdfBoleto, baixarBoleto, alterarVencimento, BOLETO_ENDPOINTS, BOLECODE_ENDPOINTS };
