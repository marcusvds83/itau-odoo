// ============================================
// SERVICO DE PROCESSAMENTO DE PAGAMENTO (v4.0)
// ============================================
// Roteador inteligente - interpreta o nome do
// metodo e processa automaticamente.
//
// v4.0: url_pdf em vez de pdf_base64 para boletos
//
// Categorias:
//   CARTAO   -> Link de Pagamento Itau
//   BOLETO   -> API Boletos Itau
//   PIX      -> API PIX Itau
//   MANUAL   -> Sem integracao API
//   COMPOSTO -> Combina 2+ metodos

const logger = require('../utils/logger');
const dayjs = require('dayjs');
const boletoService = require('./itau-boleto');
const pixService = require('./itau-pix');
const linkService = require('./itau-link-pagamento');
const mockService = require('./mock-itau');
const config = require('../config');

// =============================================
// BANDEIRAS DE CARTAO
// =============================================
const BANDEIRAS = ['VISA', 'MASTER', 'ELO', 'AMEX', 'HIPERCARD', 'HIPER'];

// =============================================
// TIPOS MANUAIS (sem API)
// =============================================
const MANUAIS = [
  'DINHEIRO', 'CHEQUE', 'DEPOSITO SANTANDER', 'DEPOSITO ITAU',
  'DEPOSITO ITAÚ', 'CRÉDITO DE COMPRA', 'CREDITO DE COMPRA',
  'CRÉDITO DE COMPRA', 'TRANSFERENCIA ITAU', 'TRANSFERÊNCIA ITAU',
  'DEPOSITO', 'TRANSFERENCIA', 'TRANSFERÊNCIA',
];

// =============================================
// PARSER INTELIGENTE
// =============================================

/**
 * Parseia o nome do metodo e retorna config de processamento
 */
function parseMethod(nome) {
  var n = nome.trim().toUpperCase();

  // 1) COMPOSTO (entrada + restante)
  if (/^1\s*\+\s*\d+\s*(BOLETO|BOL|CHEQUE)/.test(n) ||
      /^1\s*\+\s*\d+\s*BOLETOS/.test(n) ||
      /^ENTRADA\s*\+/.test(n) ||
      /^DINHEIRO\s*\+/.test(n) ||
      /DIN\s*\+/.test(n)) {
    return parseComposto(n);
  }

  // 2) CARTAO
  for (var i = 0; i < BANDEIRAS.length; i++) {
    var b = BANDEIRAS[i];
    if (n.indexOf(b) === 0 || n.indexOf(b + ' ') === 0) {
      return parseCartao(n, b);
    }
  }

  // 3) BOLETO
  if (n.indexOf('BOLETO') === 0 || n.indexOf('BOL ') === 0 || n.indexOf('BOL.') === 0) {
    return parseBoleto(n);
  }

  // 4) CHEQUE parcelado
  if (n.indexOf('CHEQUE') === 0 || n.indexOf('CHEQ') === 0) {
    return { tipo: 'manual', forma: nome, manual_tipo: 'cheque' };
  }

  // 5) PIX
  if (n.indexOf('PIX') === 0) {
    return { tipo: 'pix' };
  }

  // 6) MANUAL (fallback)
  for (var j = 0; j < MANUAIS.length; j++) {
    if (n.indexOf(MANUAIS[j]) === 0) {
      return { tipo: 'manual', forma: nome, manual_tipo: MANUAIS[j] };
    }
  }

  // 7) Se contem "BOLETO" ou "CHEQUE" em qualquer lugar
  if (n.indexOf('BOLETO') >= 0) return parseBoleto(n);
  if (n.indexOf('CHEQUE') >= 0) return { tipo: 'manual', forma: nome, manual_tipo: 'cheque' };

  // 8) Fallback
  return { tipo: 'manual', forma: nome, manual_tipo: 'desconhecido' };
}

function parseCartao(n, bandeira) {
  var debito = n.indexOf('DÉBITO') >= 0 || n.indexOf('DEBITO') >= 0 || n.indexOf('DEB') >= 0;
  var parcelas = 1;

  var match = n.match(/(\d+)\s*(VEZES|X|VEZ)/);
  if (match) {
    parcelas = parseInt(match[1]);
  } else if (!debito) {
    var credMatch = n.match(/CREDITO|CRÉDITO|VISTA/);
    if (credMatch) parcelas = 1;
  }

  return {
    tipo: 'cartao',
    bandeira: bandeira,
    parcelas: parcelas,
    debito: debito,
  };
}

function parseBoleto(n) {
  var slashMatch = n.match(/(\d+(?:\s*\/\s*\d+)+)/);
  if (slashMatch) {
    var dias = slashMatch[1].split('/').map(function(d) { return parseInt(d.trim()); });
    return { tipo: 'boleto_parcelado', dias: dias };
  }

  var xMatch = n.match(/(\d+)\s*X/);
  if (xMatch) {
    var num = parseInt(xMatch[1]);
    var dias = [];
    for (var i = 0; i < num; i++) dias.push(30 * (i + 1));
    return { tipo: 'boleto_parcelado', dias: dias };
  }

  var dMatch = n.match(/(\d+)\s*D/);
  if (dMatch) {
    return { tipo: 'boleto', dias: [parseInt(dMatch[1])] };
  }

  return { tipo: 'boleto', dias: [30] };
}

function parseComposto(n) {
  var boletoMatch = n.match(/(\d+)\s*BOLETO/);
  if (boletoMatch) {
    var dias = parseInt(boletoMatch[1]);
    return {
      tipo: 'composto',
      entrada_tipo: 'pix',
      restante_tipo: 'boleto',
      dias_restante: [dias],
    };
  }

  var boletosMatch = n.match(/(\d+)\s*BOLETOS/);
  if (boletosMatch) {
    var num = parseInt(boletosMatch[1]);
    var dias = [];
    for (var i = 0; i < num; i++) dias.push(30 * (i + 1));
    return {
      tipo: 'composto',
      entrada_tipo: 'pix',
      restante_tipo: 'boleto_parcelado',
      dias_restante: dias,
    };
  }

  return {
    tipo: 'composto',
    entrada_tipo: 'pix',
    restante_tipo: 'manual',
  };
}

// =============================================
// PROCESSADOR PRINCIPAL
// =============================================

var MID_URL = process.env.MID_URL || 'https://itau-odoo.onrender.com';

async function processarPagamento(formaPagamento, dados) {
  if (!formaPagamento) {
    throw { status: 400, message: 'forma_pagamento obrigatoria' };
  }

  var parsed = parseMethod(formaPagamento);
  logger.info('[v4.0] Processando: "' + formaPagamento + '" -> tipo: ' + parsed.tipo + ' | Mock: ' + (config.mockMode ? 'SIM' : 'NAO'));

  if (config.mockMode) {
    return mockService.gerarResposta(formaPagamento, parsed, dados);
  }

  var resultado = {
    forma_pagamento: formaPagamento,
    tipo: parsed.tipo,
    mock: false,
    valor_total: dados.fatura.valor_nominal,
    pagamentos: [],
    situacao: 'emitido',
  };

  switch (parsed.tipo) {
    case 'pix':
      return await _pix(parsed, dados, resultado);
    case 'boleto':
      return await _boleto(parsed, dados, resultado);
    case 'boleto_parcelado':
      return await _boletoParcelado(parsed, dados, resultado);
    case 'cartao':
      return await _cartao(parsed, dados, resultado);
    case 'composto':
      return await _composto(parsed, dados, resultado);
    case 'manual':
      return await _manual(parsed, dados, resultado);
    default:
      return await _manual(parsed, dados, resultado);
  }
}

// =============================================
// PROCESSADORES POR TIPO
// =============================================

async function _pix(parsed, dados, resultado) {
  var pixDados = {
    valor: dados.fatura.valor_nominal,
    chave: dados.fatura.pix_chave || config.itau.pixChave,
    devedor: dados.pagador,
    expiracao: dados.fatura.expiracao || 3600,
    solicitacaoPagador: dados.fatura.name || dados.fatura.seu_numero || '',
  };
  var pix = await pixService.criarCobrancaPix(pixDados);
  resultado.pagamentos.push({
    parcela: 1, tipo: 'pix',
    txid: pix.txid, pix_copia_cola: pix.pixCopiaECola,
    valor: dados.fatura.valor_nominal,
  });
  return resultado;
}

async function _boleto(parsed, dados, resultado) {
  var dias = parsed.dias || [30];
  var vencimento = dayjs().add(dias[0], 'day').format('YYYY-MM-DD');
  if (dados.fatura.data_vencimento) vencimento = dados.fatura.data_vencimento;

  var bd = Object.assign({}, dados, {
    fatura: Object.assign({}, dados.fatura, { data_vencimento: vencimento }),
  });
  var boleto = await boletoService.emitirBoleto(bd);

  var pg = {
    parcela: 1, tipo: 'boleto',
    nosso_numero: boleto.nosso_numero,
    codigo_barras: boleto.codigo_barras,
    linha_digitavel: boleto.linha_digitavel,
    valor: dados.fatura.valor_nominal,
    vencimento: vencimento,
  };

  // v4.0: gera URL do PDF em vez de embutir base64
  var bId = boleto.codigo_barras || boleto.nosso_numero;
  if (bId) {
    pg.url_pdf = MID_URL + '/boleto/' + bId + '/pdf';
  }

  resultado.pagamentos.push(pg);
  return resultado;
}

async function _boletoParcelado(parsed, dados, resultado) {
  var dias = parsed.dias || [30];
  var n = dias.length;
  var vt = dados.fatura.valor_nominal;
  var vp = Math.floor((vt / n) * 100) / 100;
  var vu = Math.round((vt - vp * (n - 1)) * 100) / 100;
  resultado.parcelas = n;

  for (var i = 0; i < n; i++) {
    var valor = (i === n - 1) ? vu : vp;
    var venc = dayjs().add(dias[i], 'day').format('YYYY-MM-DD');

    var bd = Object.assign({}, dados, {
      fatura: Object.assign({}, dados.fatura, {
        valor_nominal: valor,
        data_vencimento: venc,
        nosso_numero: (dados.fatura.nosso_numero || '') + String(i + 1).padStart(2, '0'),
        seu_numero: (dados.fatura.seu_numero || dados.fatura.name || '') + '/' + (i + 1) + '/' + n,
        instrucao1: 'Parcela ' + (i + 1) + ' de ' + n,
      }),
    });

    try {
      var boleto = await boletoService.emitirBoleto(bd);
      var pg = {
        parcela: i + 1, total_parcelas: n, tipo: 'boleto',
        nosso_numero: boleto.nosso_numero,
        codigo_barras: boleto.codigo_barras,
        linha_digitavel: boleto.linha_digitavel,
        valor: valor, vencimento: venc, dias: dias[i],
      };
      // v4.0: URL do PDF em vez de base64
      var bId = boleto.codigo_barras || boleto.nosso_numero;
      if (bId) {
        pg.url_pdf = MID_URL + '/boleto/' + bId + '/pdf';
      }
      resultado.pagamentos.push(pg);
    } catch (err) {
      resultado.pagamentos.push({ parcela: i + 1, total_parcelas: n, tipo: 'boleto', erro: err.message, valor: valor, vencimento: venc, dias: dias[i] });
      resultado.situacao = 'parcial';
    }
  }
  return resultado;
}

async function _cartao(parsed, dados, resultado) {
  var linkDados = {
    valor: dados.fatura.valor_nominal,
    seu_numero: dados.fatura.seu_numero || dados.fatura.name,
    descricao: dados.fatura.name || dados.fatura.seu_numero,
    parcelas: parsed.parcelas || 1,
    email_pagador: dados.pagador ? dados.pagador.email : null,
    cpf_cnpj_pagador: dados.pagador ? dados.pagador.cpf_cnpj : null,
    nome_pagador: (dados.pagador ? dados.pagador.nome : null) || (dados.pagador ? dados.pagador.name : null),
    webhook_url: dados.webhook_url,
  };

  var link = await linkService.criarLinkPagamento(linkDados);
  resultado.bandeira = parsed.bandeira;
  resultado.parcelas = parsed.parcelas;
  resultado.pagamentos.push({
    parcela: 1,
    tipo: parsed.debito ? 'cartao_debito' : 'cartao_credito',
    bandeira: parsed.bandeira,
    id_link: link.id || link.id_link,
    url_link: link.link || link.url || link.url_link,
    valor: dados.fatura.valor_nominal,
    parcelas: parsed.parcelas,
    debito: !!parsed.debito,
  });
  return resultado;
}

async function _composto(parsed, dados, resultado) {
  var vt = dados.fatura.valor_nominal;
  var pctEntrada = dados.pct_entrada || 0.3;
  var ve = dados.valor_entrada || Math.round(vt * pctEntrada * 100) / 100;
  var vr = Math.round((vt - ve) * 100) / 100;
  resultado.valor_entrada = ve;
  resultado.valor_restante = vr;

  // Entrada via PIX
  try {
    var pixDados = {
      valor: ve,
      chave: config.itau.pixChave,
      devedor: dados.pagador,
      expiracao: 3600,
      solicitacaoPagador: (dados.fatura.name || '') + ' - Entrada',
    };
    var pix = await pixService.criarCobrancaPix(pixDados);
    resultado.pagamentos.push({
      parcela: 'entrada', tipo: 'pix',
      txid: pix.txid, pix_copia_cola: pix.pixCopiaECola,
      valor: ve,
    });
  } catch (err) {
    resultado.pagamentos.push({ parcela: 'entrada', tipo: 'pix', erro: err.message, valor: ve });
    resultado.situacao = 'parcial';
  }

  // Restante
  if (parsed.restante_tipo === 'boleto' || parsed.restante_tipo === 'boleto_parcelado') {
    var dias = parsed.dias_restante || [30];
    var n = dias.length;
    var vpr = Math.floor((vr / n) * 100) / 100;
    var vur = Math.round((vr - vpr * (n - 1)) * 100) / 100;
    resultado.parcelas_restante = n;

    for (var i = 0; i < n; i++) {
      var valor = (i === n - 1) ? vur : vpr;
      var venc = dayjs().add(dias[i], 'day').format('YYYY-MM-DD');
      var bd = Object.assign({}, dados, {
        fatura: Object.assign({}, dados.fatura, {
          valor_nominal: valor, data_vencimento: venc,
          nosso_numero: (dados.fatura.nosso_numero || '') + 'R' + String(i + 1).padStart(2, '0'),
          seu_numero: (dados.fatura.seu_numero || dados.fatura.name || '') + ' - Restante ' + (i + 1) + '/' + n,
          instrucao1: 'Entrada de ' + ve.toFixed(2) + ' via PIX. Restante: ' + vr.toFixed(2),
        }),
      });
      try {
        var boleto = await boletoService.emitirBoleto(bd);
        var pg = {
          parcela: 'restante_' + (i + 1), total_parcelas: n, tipo: 'boleto',
          nosso_numero: boleto.nosso_numero,
          codigo_barras: boleto.codigo_barras,
          linha_digitavel: boleto.linha_digitavel,
          valor: valor, vencimento: venc,
        };
        // v4.0: URL do PDF
        var bId = boleto.codigo_barras || boleto.nosso_numero;
        if (bId) {
          pg.url_pdf = MID_URL + '/boleto/' + bId + '/pdf';
        }
        resultado.pagamentos.push(pg);
      } catch (err) {
        resultado.pagamentos.push({ parcela: 'restante_' + (i + 1), tipo: 'boleto', erro: err.message, valor: valor, vencimento: venc });
        resultado.situacao = 'parcial';
      }
    }
  } else if (parsed.restante_tipo === 'cartao') {
    var linkDados = {
      valor: vr,
      seu_numero: (dados.fatura.seu_numero || '') + '-REST',
      descricao: 'Restante - ' + (dados.fatura.name || ''),
      parcelas: dados.parcelas_restantes || 1,
      email_pagador: dados.pagador ? dados.pagador.email : null,
      cpf_cnpj_pagador: dados.pagador ? dados.pagador.cpf_cnpj : null,
    };
    try {
      var link = await linkService.criarLinkPagamento(linkDados);
      resultado.pagamentos.push({
        parcela: 'restante', tipo: 'cartao_credito',
        id_link: link.id, url_link: link.link || link.url,
        valor: vr, parcelas: dados.parcelas_restantes || 1,
      });
    } catch (err) {
      resultado.pagamentos.push({ parcela: 'restante', tipo: 'cartao_credito', erro: err.message, valor: vr });
      resultado.situacao = 'parcial';
    }
  } else {
    resultado.pagamentos.push({
      parcela: 'restante', tipo: 'manual',
      forma: parsed.restante_tipo || 'manual',
      valor: vr,
      observacao: 'Registrar manualmente no Odoo',
    });
  }

  return resultado;
}

async function _manual(parsed, dados, resultado) {
  resultado.situacao = 'manual';
  resultado.pagamentos.push({
    parcela: 1, tipo: 'manual',
    forma: parsed.forma || parsed.manual_tipo || 'Desconhecido',
    valor: dados.fatura.valor_nominal,
    observacao: 'Pagamento em ' + (parsed.forma || 'manual') + ' - registrar manualmente no Odoo',
  });
  return resultado;
}

// =============================================
// HELPERS
// =============================================

function listarMetodos() {
  return {
    info: 'O middleware aceita qualquer metodo de pagamento. Envie a forma_pagamento exata do Odoo e o sistema processa automaticamente.',
    categorias: {
      cartao: 'Cartao de Credito/Debito (VISA, MASTER, ELO, AMEX, HIPERCARD) -> Link de Pagamento Itau',
      boleto: 'Boleto a Vista ou Parcelado (ex: BOLETO 30D, BOLETO 30/60/90) -> API Boletos Itau',
      pix: 'PIX -> API PIX Itau',
      composto: 'Entrada + Restante (ex: 1 + 30 BOLETO) -> PIX + API Boletos/Cartao',
      manual: 'Dinheiro, Cheque, Deposito, Credito de Compra -> Sem API',
    },
    exemplos: [
      'BOLETO 30D', 'BOLETO 30/60/90', 'BOLETO 28/42/56', 'BOLETO 8X',
      'VISA CREDITO', 'VISA 3 VEZES', 'VISA DÉBITO',
      'MASTER CREDITO', 'MASTER 2 VEZES',
      'ELO CREDITO', 'ELO 3 VEZES', 'ELO DÉBITO',
      'AMEX CREDITO', 'HIPERCARD 4 VEZES',
      'DINHEIRO', 'CHEQUE', 'DEPOSITO ITAÚ',
      'CRÉDITO DE COMPRA', '1 + 30 BOLETO',
    ],
  };
}

module.exports = {
  processarPagamento: processarPagamento,
  parseMethod: parseMethod,
  listarMetodos: listarMetodos,
};
