/**
 * services/itau-boleto.js - v6.1
 * CORRECAO: numero_nosso_numero auto-gerado
 */
const { getAccessToken, invalidateToken } = require('./itau-auth');
const { callBolecode } = require('./itau-api');
const config = require('../config');

let nossoNumeroSeq = 1;

function gerarNossoNumero(numeroPedido) {
  let base = '';
  if (numeroPedido) {
    base = String(numeroPedido).replace(/D/g, '');
    base = base.substring(Math.max(0, base.length - 8));
  }
  if (base.length < 8) {
    base = String(Date.now()).substring(base.length < 8 ? 4 : 2, 10 - (8 - base.length)) + base;
    base = base.substring(0, 8);
  }
  const seq = String(nossoNumeroSeq++).padStart(4, '0');
  const nossoNumero = base + seq;
  console.log('[BOLETO] Nosso Numero gerado:', nossoNumero, '(pedido:', numeroPedido || 'N/A', ', seq:', seq + ')');
  return nossoNumero;
}

function calcularDataVencimento(dias) {
  const data = new Date();
  data.setDate(data.getDate() + dias);
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');
  return ano + '-' + mes + '-' + dia;
}

function montaPayloadBolecode(dadosBoleto) {
  const idBeneficiario = config.banco.idBeneficiario || '776400223389';
  const codigoCarteira = config.banco.codigoCarteira || '109';
  const cnpjEmpresa = config.empresa.cnpj || '22603750000190';
  const nossoNumero = dadosBoleto.nossoNumero || gerarNossoNumero(dadosBoleto.numeroPedido);
  const valorOriginal = typeof dadosBoleto.valor === 'string' ? dadosBoleto.valor.replace(',', '.') : String(dadosBoleto.valor);
  const dataVencimento = dadosBoleto.dataVencimento || calcularDataVencimento(30);
  const etapa = dadosBoleto.etapa || 'Simulacao';
  const cpfCnpjPagador = dadosBoleto.cpfCnpjPagador || '';

  const payload = {
    etapa_processo_boleto: etapa,
    codigo_canal_operacao: 'API',
    indicador_continuade: 'N',
    numero_contrato: dadosBoleto.numeroContrato || '00010012345',
    beneficiario: {
      id_beneficiario: idBeneficiario,
      cpf_cnpj: cnpjEmpresa,
      nome: dadosBoleto.nomeBeneficiario || config.empresa.nome || 'AJL FERRO E ACO LTDA',
    },
    dado_boleto: {
      codigo_carteira: dadosBoleto.codigoCarteira || codigoCarteira,
      data_vencimento: dataVencimento,
      valor_titulo: {
        valor_original: valorOriginal,
      },
      dados_individuais_boleto: {
        numero_nosso_numero: nossoNumero,
        tipo_formulario: '3',
        descricao_tipo_servico: dadosBoleto.descricao || 'Pagamento AJL Ferro e Aco',
      },
    },
    pagador: {
      cpf_cnpj: cpfCnpjPagador,
      nome: dadosBoleto.nomePagador || '',
    },
  };

  return payload;
}

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
  const etapa = payload.etapa_processo_boleto;
  console.log('[BOLETO] Emitindo boleto no Itau... etapa:', etapa);
  console.log('[BOLETO] Tentando emissao via BoleCode API (mTLS)...');
  console.log('[BOLETO] Payload Boleto | {"etapa":"' + etapa + '","contrato":"' + payload.numero_contrato + '","valor":"' + payload.dado_boleto.valor_titulo.valor_original + '","nosso_numero":"' + payload.dado_boleto.dados_individuais_boleto.numero_nosso_numero + '"}');

  try {
    const response = await callBolecode(accessToken, '/boletos_pix', payload);
    console.log('[BOLETO] Boleto emitido com sucesso!');
    console.log('[BOLETO] Resposta:', JSON.stringify(response, null, 2));
    return { sucesso: true, dados: response };
  } catch (error) {
    if (error.message && (error.message.includes('401') || error.message.includes('403'))) {
      console.log('[BOLETO] Token pode ter expirado, invalidando cache e tentando novamente...');
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
