/**
 * services/pdf-boleto.js - v6.5 FEBRABAN
 * Gerador de PDF de Boleto Bancario no layout FEBRABAN padrao Itau
 * - Recibo do Sacado (parte 1)
 * - Ficha de Compensacao (parte 2)
 * - QR Code PIX + Copia e Cola
 * - Barcode Code128 via bwip-js (callback-based, sem toBufferSync)
 */
var PDFDocument = require('pdfkit');
var bwipjs = null;
try { bwipjs = require('bwip-js'); } catch (e) { console.log('[PDF] bwip-js N/D'); }

var store = new Map();

function storeBoleto(txid, dados) {
  store.set(txid, Object.assign({}, dados, { ts: Date.now() }));
}

function getBoleto(txid) {
  return store.get(txid) || null;
}

function formatCnpj(v) {
  var s = String(v || '').replace(/\D/g, '');
  if (s.length === 14) return s.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  if (s.length === 11) return s.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  return v || '';
}

function fmtData(d) {
  if (!d) return '';
  var p = d.split('-');
  return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : d;
}

function fmtValor(v) {
  var s = String(v || '0').padStart(15, '0');
  var c = parseInt(s.slice(-2), 10);
  var r = parseInt(s.slice(0, -2), 10);
  var val = (r + c / 100).toFixed(2);
  var parts = val.split('.');
  return parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + parts[1];
}

/* Barcode Code128 - bwip-js usa callback, NAO toBufferSync */
function genBarcode(text) {
  return new Promise(function (resolve) {
    if (!bwipjs) { resolve(null); return; }
    bwipjs.toBuffer({ bcid: 'code128', text: text, scale: 3, height: 20, includetext: false }, function (err, buf) {
      resolve(err ? null : buf);
    });
  });
}

/* QR Code - bwip-js usa callback */
function genQRCode(text) {
  return new Promise(function (resolve) {
    if (!bwipjs) { resolve(null); return; }
    bwipjs.toBuffer({ bcid: 'qrcode', text: text, scale: 5, includetext: false }, function (err, buf) {
      resolve(err ? null : buf);
    });
  });
}

/* === FUNCOES DE DESENHO FEBRABAN === */

function drawCabecalho(doc, x, y, pw, dados) {
  doc.rect(x, y, pw, 32).fill('#EC0000');
  doc.fillColor('#fff').fontSize(15).font('Helvetica-Bold');
  doc.text('BANCO ITAU S.A.', x + 8, y + 2, { width: 180 });
  doc.fontSize(11).font('Helvetica');
  doc.text('341-7', x + 8, y + 18, { width: 180 });

  doc.fontSize(7).font('Helvetica-Bold');
  doc.text(dados.nome_beneficiario || 'AJL COM. ATAC. FERRAGENS E FERRAMENTAS LTDA', x + 200, y + 3, { width: pw - 215 });
  doc.font('Helvetica').fontSize(6);
  doc.text('CNPJ: ' + (dados.cnpj_beneficiario || '22.603.750/0001-90'), x + 200, y + 13, { width: pw - 215 });
  doc.text('Ag: ' + (dados.agencia || '7764') + '  CC: ' + (dados.conta || '22338-9'), x + 200, y + 21, { width: pw - 215 });

  doc.rect(x, y + 32, pw, 16).fill('#f5f5f5').stroke('#999');
  doc.fillColor('#333').fontSize(6).font('Helvetica-Bold');
  doc.text('Agencia/Codigo Cedente', x + 4, y + 36, { width: 130 });
  doc.fillColor('#000').fontSize(8).font('Helvetica-Bold');
  doc.text((dados.agencia || '7764') + '/' + (dados.id_beneficiario || '776400223389'), x + 140, y + 35, { width: 200 });
  doc.fillColor('#333').fontSize(6).font('Helvetica-Bold');
  doc.text('Nosso Numero', x + 360, y + 36, { width: 100 });
  doc.fillColor('#000').fontSize(8);
  doc.text(dados.nosso_numero || '', x + 460, y + 35, { width: pw - 470 });

  return y + 50;
}

function drawRow(doc, x, y, pw, lbl, val, rLbl, rVal, bg) {
  doc.rect(x, y, pw, 12).fill(bg || '#fff').stroke('#999');
  doc.fillColor('#333').fontSize(6).font('Helvetica-Bold');
  doc.text(lbl, x + 4, y + 3, { width: 120 });
  doc.fillColor('#000').fontSize(7).font('Helvetica');
  doc.text(val || '', x + 4, y + 3, { width: 280 });
  if (rLbl) {
    doc.fillColor('#333').fontSize(6).font('Helvetica-Bold');
    doc.text(rLbl, x + pw - 180, y + 3, { width: 100 });
    var isValor = rLbl.indexOf('Valor') >= 0;
    doc.fillColor(isValor ? '#EC0000' : '#000');
    doc.fontSize(isValor ? 10 : 7);
    if (isValor) doc.font('Helvetica-Bold');
    doc.text(rVal || '', x + pw - 80, y + 2, { width: 75 });
  }
  doc.font('Helvetica');
  doc.fillColor('#000');
  return y + 12;
}

function drawTabelaSacado(doc, x, y, pw, dados) {
  y = drawRow(doc, x, y, pw, 'Local de Pagamento', 'Pagavel em qualquer banco ate o vencimento', 'Vencimento', fmtData(dados.data_vencimento));
  y = drawRow(doc, x, y, pw, 'Cedente', dados.nome_beneficiario || 'AJL COM. ATAC. FERRAGENS E FERRAMENTAS LTDA', 'Agencia/Codigo Cedente', (dados.agencia || '7764') + '/' + (dados.id_beneficiario || '776400223389'), '#fafafa');
  y = drawRow(doc, x, y, pw, 'Data Doc.', fmtData(dados.data_emissao || dados.data_vencimento), 'No. Documento', dados.seu_numero);
  y = drawRow(doc, x, y, pw, 'Especie', 'R$', 'Aceite', 'N/A', '#fafafa');
  y = drawRow(doc, x, y, pw, 'Uso do Banco', '-', null, null);
  y = drawRow(doc, x, y, pw, 'Nosso Numero', (dados.agencia || '7764') + '/' + (dados.carteira || '109') + '/' + (dados.nosso_numero || ''), '(=) Valor do Documento', 'R$ ' + fmtValor(dados.valor_titulo), '#fafafa');
  return y;
}

function drawTabelaCompensacao(doc, x, y, pw, dados) {
  y = drawRow(doc, x, y, pw, 'Local de Pagamento', 'Pagavel em qualquer banco ate o vencimento', 'Vencimento', fmtData(dados.data_vencimento));
  y = drawRow(doc, x, y, pw, 'Cedente', dados.nome_beneficiario || 'AJL COM. ATAC. FERRAGENS E FERRAMENTAS LTDA', 'Agencia/Codigo Cedente', (dados.agencia || '7764') + '/' + (dados.id_beneficiario || '776400223389'), '#fafafa');
  y = drawRow(doc, x, y, pw, 'Data Doc.', fmtData(dados.data_emissao || dados.data_vencimento), 'No. Documento', dados.seu_numero);
  y = drawRow(doc, x, y, pw, 'Especie', 'R$', 'Aceite', 'N/A', '#fafafa');
  y = drawRow(doc, x, y, pw, 'Uso do Banco', '-', 'Data Proc.', fmtData(dados.data_emissao || ''), '#fafafa');
  y = drawRow(doc, x, y, pw, 'Nosso Numero', (dados.agencia || '7764') + '/' + (dados.carteira || '109') + '/' + (dados.nosso_numero || ''), '(=) Valor do Documento', 'R$ ' + fmtValor(dados.valor_titulo), '#fafafa');
  return y;
}

function drawPagador(doc, x, y, pw, dados) {
  var h = 44;
  doc.rect(x, y, pw, h).fill('#fff').stroke('#999');
  doc.fillColor('#333').fontSize(6).font('Helvetica-Bold');
  doc.text('Pagador', x + 4, y + 3, { width: 60 });
  doc.fillColor('#000').fontSize(8).font('Helvetica-Bold');
  doc.text(dados.nome_pagador || '', x + 4, y + 13, { width: pw - 10 });
  doc.fillColor('#000').fontSize(7).font('Helvetica');
  doc.text((dados.tipo_pessoa === 'F' ? 'CPF: ' : 'CNPJ: ') + formatCnpj(dados.cpf_cnpj_pagador), x + 4, y + 24, { width: pw - 10 });
  doc.text([dados.logradouro, dados.cidade, dados.estado, dados.cep].filter(Boolean).join(' - '), x + 4, y + 34, { width: pw - 10 });
  doc.font('Helvetica');
  return y + h + 2;
}

function drawAvalista(doc, x, y, pw) {
  doc.rect(x, y, pw, 14).fill('#fff').stroke('#999');
  doc.fillColor('#333').fontSize(6).font('Helvetica-Bold');
  doc.text('Sacador/Avalista', x + 4, y + 3, { width: 80 });
  doc.fillColor('#999').fontSize(7).font('Helvetica');
  doc.text('-', x + 60, y + 3, { width: 50 });
  doc.font('Helvetica');
  return y + 16;
}

function drawBarcode(doc, x, y, pw, barcodeBuf, barcodeText) {
  var bh = barcodeBuf ? 55 : 26;
  doc.rect(x, y, pw, bh).fill('#fff').stroke('#ccc');
  if (barcodeBuf) {
    doc.image(barcodeBuf, x + 8, y + 3, { width: pw - 16, height: 49 });
  } else if (barcodeText) {
    doc.fillColor('#000').fontSize(6).font('Courier');
    doc.text(barcodeText, x + 4, y + 9, { width: pw - 8, align: 'center', lineBreak: false });
    doc.font('Helvetica');
  }
  return y + bh + 2;
}

function drawLinhaDigitavel(doc, x, y, pw, dados) {
  doc.rect(x, y, pw, 24).fill('#f0fff0').stroke('#00aa00');
  doc.fillColor('#005500').fontSize(6).font('Helvetica-Bold');
  doc.text('Linha Digitavel', x + 4, y + 3);
  doc.fillColor('#005500').fontSize(13).font('Courier-Bold');
  doc.text(dados.linha_digitavel || '', x + 4, y + 10, { width: pw - 8, align: 'center', lineBreak: false });
  doc.font('Helvetica');
  return y + 26;
}

function drawInstrucoes(doc, x, y, pw, dados, qrBuf) {
  var pix = dados.pix_copia_cola || '';
  var hasPix = pix || qrBuf;
  var bh = hasPix ? 125 : 20;

  doc.rect(x, y, pw, bh).fill('#fff').stroke('#999');
  doc.fillColor('#333').fontSize(6).font('Helvetica-Bold');
  doc.text('Instrucoes (Texto de responsabilidade do cedente)', x + 4, y + 3, { width: pw - 10 });

  if (hasPix) {
    if (qrBuf) {
      try { doc.image(qrBuf, x + 8, y + 16, { width: 80, height: 80 }); } catch (e) {}
    }
    doc.fillColor('#EC0000').fontSize(8).font('Helvetica-Bold');
    doc.text('PAGAMENTO VIA PIX', x + 100, y + 16, { width: pw - 115 });
    doc.fillColor('#333').fontSize(6).font('Helvetica');
    doc.text('Escaneie o QR Code ou copie o codigo abaixo', x + 100, y + 28, { width: pw - 115 });
    doc.text('para pagar instantaneamente com PIX.', x + 100, y + 38, { width: pw - 115 });
    doc.rect(x + 100, y + 50, pw - 115, 40).fill('#f5f5ff').stroke('#9999cc');
    doc.fillColor('#333').fontSize(5).font('Helvetica-Bold');
    doc.text('PIX Copia e Cola:', x + 105, y + 53, { width: pw - 125 });
    doc.fillColor('#000').fontSize(5).font('Courier');
    doc.text(pix, x + 105, y + 62, { width: pw - 130 });
    doc.fillColor('#999').fontSize(5);
    doc.text('TXID: ' + (dados.txid || ''), x + 100, y + 95, { width: pw - 115 });
  } else {
    doc.fillColor('#999').fontSize(6).font('Helvetica');
    doc.text('Nao efetuar pagamento apos vencimento.', x + 4, y + 3, { width: pw - 10 });
  }

  doc.font('Helvetica');
  return y + bh + 2;
}

function drawCorte(doc, x, y, pw) {
  doc.moveTo(x, y).lineTo(x + pw, y).lineWidth(0.8).dash(3, { space: 2 }).stroke('#666');
  doc.undash();
  doc.fillColor('#999').fontSize(5).font('Helvetica');
  doc.text('FICHA DE COMPENSACAO - BANCO', x + 4, y + 3, { width: pw - 10, align: 'center' });
  doc.font('Helvetica');
  return y + 12;
}

/* === MONTAGEM DO PDF === */

async function drawBoleto(doc, dados) {
  var W = doc.page.width;
  var M = 18;
  var pw = W - M * 2;
  var x = M;
  var y = M;

  // Pre-gerar barcode e QR code
  var barcodeText = dados.codigo_barras || '';
  var barcodeBuf = await genBarcode(barcodeText);

  var qrBuf = dados.qrcode_base64 ? Buffer.from(dados.qrcode_base64, 'base64') : null;
  if (!qrBuf && (dados.pix_copia_cola || '')) {
    qrBuf = await genQRCode(dados.pix_copia_cola);
  }

  doc.font('Helvetica');
  doc.fontSize(8);

  // RECIBO DO SACADO
  y = drawCabecalho(doc, x, y, pw, dados);
  y = drawTabelaSacado(doc, x, y, pw, dados);
  y = drawPagador(doc, x, y, pw, dados);
  y = drawBarcode(doc, x, y, pw, barcodeBuf, barcodeText);
  y = drawLinhaDigitavel(doc, x, y, pw, dados);
  y = drawInstrucoes(doc, x, y, pw, dados, qrBuf);

  // CORTE
  y = drawCorte(doc, x, y, pw);

  // FICHA DE COMPENSACAO
  y = drawCabecalho(doc, x, y, pw, dados);
  y = drawTabelaCompensacao(doc, x, y, pw, dados);
  y = drawPagador(doc, x, y, pw, dados);
  y = drawAvalista(doc, x, y, pw);
  y = drawBarcode(doc, x, y, pw, barcodeBuf, barcodeText);
  y = drawLinhaDigitavel(doc, x, y, pw, dados);

  return y;
}

async function buildPdfBuffer(dados) {
  return new Promise(function (resolve, reject) {
    try {
      var doc = new PDFDocument({
        size: 'A4',
        margins: { top: 10, bottom: 10, left: 10, right: 10 },
        info: { Title: 'Boleto ' + (dados.nosso_numero || ''), Author: 'AJL Ferro e Aco' }
      });
      var chunks = [];
      doc.on('data', function (chunk) { chunks.push(chunk); });

      drawBoleto(doc, dados).then(function (finalY) {
        doc.moveTo(18, finalY).lineTo(doc.page.width - 18, finalY).lineWidth(0.5).stroke('#ccc');
        doc.fillColor('#999').fontSize(5);
        doc.text('Emitido por AJL Ferro e Aco | Boleto gerado via API BoleCode Itau', 18, finalY + 4, { width: doc.page.width - 36, align: 'center' });
        doc.end();
        doc.on('end', function () { resolve(Buffer.concat(chunks)); });
      }).catch(reject);
    } catch (err) { reject(err); }
  });
}

async function generatePdf(txid) {
  var dados = getBoleto(txid);
  if (!dados) throw new Error('Boleto expirado. Use POST /boletos/pdf');
  return buildPdfBuffer(dados);
}

async function generatePdfFromData(data) {
  var ind = (data.dado_boleto && data.dado_boleto.dados_individuais_boleto && data.dado_boleto.dados_individuais_boleto[0]) || {};
  var qr = data.dados_qrcode || {};
  var d = {
    txid: qr.txid || '',
    nosso_numero: ind.numero_nosso_numero || '',
    linha_digitavel: ind.numero_linha_digitavel || '',
    codigo_barras: ind.codigo_barras || '',
    data_vencimento: ind.data_vencimento || '',
    data_emissao: data.data_emissao || '',
    valor_titulo: ind.valor_titulo || '',
    pix_copia_cola: qr.emv || '',
    qrcode_base64: qr.base64 || '',
    nome_pagador: data.nome_pagador || '',
    cpf_cnpj_pagador: data.cpf_cnpj_pagador || '',
    tipo_pessoa: data.tipo_pessoa || '',
    logradouro: data.logradouro || '',
    cidade: data.cidade || '',
    estado: data.estado || '',
    cep: data.cep || '',
    seu_numero: data.seu_numero || '',
    agencia: data.agencia || '7764',
    conta: data.conta || '22338-9',
    carteira: data.carteira || '109',
    id_beneficiario: data.id_beneficiario || '776400223389',
    nome_beneficiario: data.nome_beneficiario || 'AJL COMERCIO ATACADISTA DE FERRAGENS E FERRAMENTAS LTDA',
    cnpj_beneficiario: data.cnpj_beneficiario || '22.603.750/0001-90',
  };
  return buildPdfBuffer(d);
}

module.exports = { storeBoleto, getBoleto, generatePdf, generatePdfFromData };
