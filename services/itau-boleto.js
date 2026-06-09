const { getAccessToken, invalidateToken } = require('./itau-auth');
const { callBolecode } = require('./itau-api');
const config = require('../config');

let nossoNumeroSeq = 1;

function gerarNossoNumero() {
  const seq = String(nossoNumeroSeq++).padStart(8, '0');
  console.log('[BOLETO] Nosso Numero:', seq);
  return seq;
}

function formatarValorItau(valor) {
  const num = Math.round(parseFloat(valor) * 100);
  return String(num).padStart(15, '0');
}

function getDataHoje() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}

function calcularDataVencimento(dias) {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}

function montaPayloadBolecode(dados) {
  const idBeneficiario = config.banco.idBeneficiario || '776400223389';
  const codigoCarteira = config.banco.codigoCarteira || '109';
  const nossoNumero = dados.nossoNumero || gerarNossoNumero();
  let dataVencimento = dados.dataVencimento || calcularDataVencimento(30);
  if (dados.dataVencimento) {
    const v = new Date(dados.dataVencimento + 'T12:00:00');
    const hj = new Date(); hj.setHours(0,0,0,0);
    if (v <= hj) { console.log('[BOLETO] Vencimento no passado, +30 dias'); dataVencimento = calcularDataVencimento(30); }
  }
  const etapa = dados.etapa || 'Simulacao';
  const cpfCnpj = dados.cpfCnpjPagador || '';
  const tipoPessoa = cpfCnpj.length <= 11 ? 'F' : 'J';
  const campoPessoa = tipoPessoa === 'F' ? 'numero_cadastro_pessoa_fisica' : 'numero_cadastro_nacional_pessoa_juridica';
  return {
    etapa_processo_boleto: etapa,
    beneficiario: { id_beneficiario: idBeneficiario },
    dado_boleto: {
      descricao_instrumento_cobranca: 'boleto_pix',
      tipo_boleto: 'a vista',
      texto_seu_numero: String(dados.numeroPedido || '000001').substring(0, 10),
      codigo_carteira: dados.codigoCarteira || codigoCarteira,
      codigo_especie: '01',
      data_emissao: getDataHoje(),
      valor_abatimento: '00000000000000000',
      pagador: {
        pessoa: {
          nome_pessoa: dados.nomePagador || '',
          tipo_pessoa: { codigo_tipo_pessoa: tipoPessoa }
        },
        endereco: {
          nome_logradouro: dados.logradouro || 'Rua Nao Informada',
          nome_bairro: dados.bairro || 'Nao Informado',
          nome_cidade: dados.cidade || 'Nao Informado',
          sigla_UF: dados.estado || 'SP',
          numero_CEP: String(dados.cep || '00000000').replace(/[^0-9]/g, '')
        }
      },
      dados_individuais_boleto: [{
        numero_nosso_numero: nossoNumero,
        data_vencimento: dataVencimento,
        texto_uso_beneficiario: String(dados.numeroPedido || '000001').substring(0, 25),
        valor_titulo: formatarValorItau(dados.valor),
        texto_seu_numero: String(dados.numeroPedido || '000001').substring(0, 10),
        data_limite_pagamento: dataVencimento
      }]
    },
    dados_qrcode: { chave: config.itau.pixChave || dados.chavePix || '' }
  };
}

async function emitirBoleto(dados) {
  console.log('[BOLETO] Iniciando emissao... Valor:', dados.valor, 'CPF:', dados.cpfCnpjPagador);
  let accessToken;
  try { accessToken = await getAccessToken(); }
  catch (err) { throw new Error('Falha autenticacao: ' + err.message); }
  const payload = montaPayloadBolecode(dados);
  console.log('[BOLETO] Etapa:', payload.etapa_processo_boleto);
  console.log('[BOLETO] Payload:', JSON.stringify(payload, null, 2));
  try {
    const response = await callBolecode(accessToken, '/boletos_pix', payload);
    console.log('[BOLETO] SUCESSO! Resposta:', JSON.stringify(response, null, 2));
    return { sucesso: true, dados: response };
  } catch (error) {
    if (error.message && (error.message.includes('401') || error.message.includes('403'))) {
      console.log('[BOLETO] Token expirado, tentando novamente...');
      invalidateToken();
      try {
        accessToken = await getAccessToken();
        const r = await callBolecode(accessToken, '/boletos_pix', payload);
        console.log('[BOLETO] SUCESSO na 2a tentativa!');
        return { sucesso: true, dados: r };
      } catch (e) { throw e; }
    }
    throw error;
  }
}

module.exports = { emitirBoleto, montaPayloadBolecode };
