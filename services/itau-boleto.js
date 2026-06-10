/**
 * services/itau-boleto.js - v6.3
 * =============================================
 * Emissao de Boletos via Itau BoleCode API
 * FORMATO OFICIAL Itau (conforme JSON fornecido pelo banco)
 * FIX: CNPJ incluso no campo tipo_pessoa do pagador
 * =============================================
 */
const { getAccessToken, invalidateToken } = require('./itau-auth');
const { callBolecode } = require('./itau-api');
const config = require('../config');

let nossoNumeroSeq = 1;

/**
 * Gera nosso numero com 8 digitos (conforme Itau)
 */
function gerarNossoNumero(numeroPedido) {
  let base = '';
  if (numeroPedido) {
    base = String(numeroPedido).replace(/\D/g, '');
    base = base.substring(Math.max(0, base.length - 4));
  }
  const seq = String(nossoNumeroSeq++).padStart(8, '0');
  console.log('[BOLETO] Nosso Numero gerado:', seq);
  return seq;
}

/**
 * Converte valor para formato Itau (15 digitos, centavos)
 * Ex: 287.10 -> "000000000028710"
 */
function formatarValorItau(valor) {
  const num = Math.round(parseFloat(valor) * 100);
  return String(num).padStart(15, '0');
}

/**
 * Retorna data atual no formato YYYY-MM-DD
 */
function getDataHoje() {
  const d = new Date();
  const ano = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return ano + '-' + mes + '-' + dia;
}

/**
 * Calcula data de vencimento (+dias a partir de hoje)
 */
function calcularDataVencimento(dias) {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  const ano = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return ano + '-' + mes + '-' + dia;
}

/**
 * Monta payload no formato OFICIAL BoleCode Itau
 * Conforme JSON fornecido pelo banco em 26/05/2026
 */
function montaPayloadBolecode(dadosBoleto) {
  const idBeneficiario = config.banco.idBeneficiario || '776400223389';
  const codigoCarteira = config.banco.codigoCarteira || '109';
  const nossoNumero = dadosBoleto.nossoNumero || gerarNossoNumero(dadosBoleto.numeroPedido);

  // Data vencimento (se no passado, ajusta +30 dias)
  let dataVencimento = dadosBoleto.dataVencimento || calcularDataVencimento(30);
  if (dadosBoleto.dataVencimento) {
    const v = new Date(dadosBoleto.dataVencimento + 'T12:00:00');
    const hj = new Date();
    hj.setHours(0, 0, 0, 0);
    if (v <= hj) {
      console.log('[BOLETO] Data vencimento no passado, ajustando +30 dias');
      dataVencimento = calcularDataVencimento(30);
    }
  }

  // Etapa: Simulacao (homologacao) ou Efetivacao (producao)
  const etapa = dadosBoleto.etapa || 'Efetivacao';

  // Determina tipo pessoa (F ou J) baseado no CPF/CNPJ
  const cpfCnpj = dadosBoleto.cpfCnpjPagador || '';
  const tipoPessoa = cpfCnpj.length <= 11 ? 'F' : 'J';
  const campoPessoa = tipoPessoa === 'F' ? 'numero_cadastro_pessoa_fisica' : 'numero_cadastro_nacional_pessoa_juridica';

  // Monta objeto tipo_pessoa com codigo + numero cadastro (CPF ou CNPJ)
  const tipoPessoaObj = {
    codigo_tipo_pessoa: tipoPessoa
  };
  tipoPessoaObj[campoPessoa] = String(cpfCnpj).replace(/\D/g, '');

  const payload = {
    etapa_processo_boleto: etapa,
    beneficiario: {
      id_beneficiario: idBeneficiario
    },
    dado_boleto: {
      descricao_instrumento_cobranca: 'boleto_pix',
      tipo_boleto: 'a vista',
      texto_seu_numero: String(dadosBoleto.numeroPedido || '000001').substring(0, 10),
      codigo_carteira: dadosBoleto.codigoCarteira || codigoCarteira,
      codigo_especie: '01',
      data_emissao: getDataHoje(),
      valor_abatimento: '00000000000000000',
      pagador: {
        pessoa: {
          nome_pessoa: dadosBoleto.nomePagador || '',
          tipo_pessoa: tipoPessoaObj
        },
        endereco: {
          nome_logradouro: dadosBoleto.logradouro || 'Rua Nao Informada',
          nome_bairro: dadosBoleto.bairro || 'Nao Informado',
          nome_cidade: dadosBoleto.cidade || 'Nao Informado',
          sigla_UF: dadosBoleto.estado || 'SP',
          numero_CEP: String(dadosBoleto.cep || '00000000').replace(/\D/g, '')
        }
      },
      dados_individuais_boleto: [
        {
          numero_nosso_numero: nossoNumero,
          data_vencimento: dataVencimento,
          texto_uso_beneficiario: String(dadosBoleto.numeroPedido || '000001').substring(0, 25),
          valor_titulo: formatarValorItau(dadosBoleto.valor),
          texto_seu_numero: String(dadosBoleto.numeroPedido || '000001').substring(0, 10),
          data_limite_pagamento: dataVencimento
        }
      ]
    },
    dados_qrcode: {
      chave: config.itau.pixChave || dadosBoleto.chavePix || ''
    }
  };

  return payload;
}

/**
 * Emite um boleto via BoleCode API
 */
async function emitirBoleto(dadosBoleto) {
  console.log('[BOLETO] Iniciando emissao de boleto...');
  console.log('[BOLETO] Valor:', dadosBoleto.valor);
  console.log('[BOLETO] CPF/CNPJ pagador:', dadosBoleto.cpfCnpjPagador);
  console.log('[BOLETO] Pedido:', dadosBoleto.numeroPedido || 'N/A');

  let accessToken;
  try {
    accessToken = await getAccessToken();
  } catch (err) {
    console.error('[BOLETO] Falha ao obter token:', err.message);
    throw new Error('Falha na autenticacao Itau: ' + err.message);
  }

  const payload = montaPayloadBolecode(dadosBoleto);
  console.log('[BOLETO] Emitindo boleto no Itau... etapa:', payload.etapa_processo_boleto);
  console.log('[BOLETO] Payload BoleCode:', JSON.stringify(payload, null, 2));

  try {
    const response = await callBolecode(accessToken, '/boletos_pix', payload);
    console.log('[BOLETO] Boleto emitido com sucesso!');
    console.log('[BOLETO] Resposta:', JSON.stringify(response, null, 2));
    return { sucesso: true, dados: response };
  } catch (error) {
    if (error.message && (error.message.includes('401') || error.message.includes('403'))) {
      console.log('[BOLETO] Token pode ter expirado, invalidando cache...');
      invalidateToken();
      try {
        accessToken = await getAccessToken();
        const response = await callBolecode(accessToken, '/boletos_pix', payload);
        console.log('[BOLETO] Boleto emitido com sucesso na 2a tentativa!');
        return { sucesso: true, dados: response };
      } catch (retryError) {
        console.error('[BOLETO] Falha na 2a tentativa:', retryError.message);
        throw retryError;
      }
    }
    console.error('[BOLETO] Erro ao processar pagamento:', error.message);
    throw error;
  }
}

async function consultarBoleto(txid) {
  let accessToken;
  try {
    accessToken = await getAccessToken();
  } catch (err) {
    throw new Error('Falha na autenticacao Itau: ' + err.message);
  }
  try {
    const { callBolecode } = require('./itau-api');
    const response = await callBolecode(accessToken, '/boletos_pix/' + txid, {});
    return { sucesso: true, dados: response };
  } catch (error) {
    throw error;
  }
}

module.exports = { emitirBoleto, consultarBoleto, montaPayloadBolecode };
