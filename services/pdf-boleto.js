/**
 * services/pdf-boleto.js - v6.6 FEBRABAN Itau Padrao
 * Layout padrao FEBRABAN com:
 * - Recibo do Sacado + Ficha de Compensacao
 * - Linhas horizontais (sem caixas grandes)
 * - Codigo de barras Code128
 * - Linha digitavel ao lado do barcode
 * - QR Code PIX + Copia e Cola na parte inferior
 * - bwip-js callback-based
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

/* Barcode Code128 - bwip-js callback */
function genBarcode(text) {
  return new Promise(function (resolve) {
    if (!bwipjs) { resolve(null); return; }
    bwipjs.toBuffer({ bcid: 'code128', text: text, scale: 3, height: 20, includetext: false }, function (err, buf) {
      resolve(err ? null : buf);
    });
  });
}

/* QR Code - bwip-js callback */
function genQRCode(text) {
  return new Promise(function (resolve) {
    if (!bwipjs) { resolve(null); return; }
    bwipjs.toBuffer({ bcid: 'qrcode', text: text, scale: 5, includetext: false }, function (err, buf) {
      resolve(err ? null : buf);
    });
  });
}

/* === CONSTANTES DE LAYOUT === */
var LM = 10;       // left margin
var PW = 575;      // page usable width (A4 = 595 - margins)
var RH = 13;       // row height
var F_LABEL = 5.5; // font size label
var F_VAL = 8;     // font size value
var F_BOLD_VAL = 9;
var LINE_W = 0.4;

/* === FUNCOES AUXILIARES === */

function hLine(doc, x, y, w) {
  doc.moveTo(x, y).lineTo(x + w, y).lineWidth(LINE_W).stroke('#333');
}

function vLine(doc, x, y1, y2) {
  doc.moveTo(x, y1).lineTo(x, y2).lineWidth(LINE_W).stroke('#333');
}

function drawLabel(doc, x, y, w, text) {
  doc.fillColor('#333').fontSize(F_LABEL).font('Helvetica-Bold');
  doc.text(text, x, y, { width: w, lineBreak: false });
}

function drawValue(doc, x, y, w, text, opts) {
  var bold = opts && opts.bold;
  var size = opts && opts.size ? opts.size : F_VAL;
  var color = opts && opts.color ? opts.color : '#000';
  doc.fillColor(color).fontSize(size).font(bold ? 'Helvetica-Bold' : 'Helvetica');
  doc.text(text || '', x, y, { width: w, lineBreak: false });
}

/* === HEADER DO BOLETO === */

function drawItauLogo(doc, x, y) {
  // Bloco retangular com 4 faixas coloridas (estilo logo Itau)
  var bw = 8;   // largura do bloco
  var bh = 28;  // altura do bloco
  var faixas = [
    { c: '#003DA5', h: bh * 0.32 },  // azul escuro (topo)
    { c: '#F68B1F', h: bh * 0.22 },  // laranja
    { c: '#009B3A', h: bh * 0.22 },  // verde
    { c: '#ED1C24', h: bh * 0.24 }   // vermelho
  ];
  var fy = y;
  for (var i = 0; i < faixas.length; i++) {
    doc.rect(x, fy, bw, faixas[i].h).fill(faixas[i].c);
    fy += faixas[i].h;
  }

  // Texto "itaú" ao lado do bloco
  doc.fillColor('#003DA5').fontSize(14).font('Helvetica-Bold');
  doc.text('itaú', x + bw + 4, y + 2, { width: 80, lineBreak: false });

  // Texto "Banco Itaú S.A." abaixo em menor
  doc.fillColor('#333').fontSize(6).font('Helvetica');
  doc.text('Banco Itaú S.A.', x + bw + 4, y + 17, { width: 100, lineBreak: false });
}

function drawHeader(doc, x, y, pw, dados) {
  // Linha superior grossa
  doc.moveTo(x, y).lineTo(x + pw, y).lineWidth(1.5).stroke('#333');
  y += 2;

  // Logo Itaú (vetorial)
  drawItauLogo(doc, x + 4, y + 2);

  // Linha vertical separando logo do restante
  vLine(doc, x + 110, y, y + 34);

  // Indicador PARCELA X/N (se boleto parcelado)
  if (dados.parcela && dados.total_parcelas && dados.total_parcelas > 1) {
    doc.fillColor('#CC0000').fontSize(10).font('Helvetica-Bold');
    doc.text('PARCELA ' + dados.parcela + '/' + dados.total_parcelas, x + 116, y + 17, { width: 120, lineBreak: false });
    doc.font('Helvetica');
  }

  // Campo Codigo do Banco
  drawLabel(doc, x + 116, y, 80, 'Codigo do Banco');
  drawValue(doc, x + 116, y + 7, 80, '341-7', { bold: true, size: F_BOLD_VAL });

  // Campo Especie do Documento
  drawLabel(doc, x + 240, y, 80, 'Especie Doc.');
  drawValue(doc, x + 240, y + 7, 80, 'R$');

  // Campo Numero do Documento
  drawLabel(doc, x + 350, y, 100, 'Numero do Documento');
  drawValue(doc, x + 350, y + 7, 100, dados.seu_numero || '');

  // Campo Data Vencimento
  drawLabel(doc, x + 478, y, 95, 'Vencimento');
  drawValue(doc, x + 478, y + 7, 95, fmtData(dados.data_vencimento), { bold: true, size: F_BOLD_VAL, color: '#CC0000' });

  // Linha inferior do header
  y += 36;
  doc.moveTo(x, y).lineTo(x + pw, y).lineWidth(1.5).stroke('#333');
  return y + 3;
}

/* === TABELA DO BOLETO (linhas horizontais, campos lado a lado) === */

function drawTableSacado(doc, x, y, pw, dados) {
  // Linha 1: Local de Pagamento (esq) | Vencimento (dir)
  hLine(doc, x, y, pw);
  drawLabel(doc, x + 2, y + 1, 200, 'Local de Pagamento');
  drawValue(doc, x + 2, y + 6, 350, 'Pagavel em qualquer banco ate o vencimento');
  drawLabel(doc, x + 400, y + 1, 80, 'Vencimento');
  drawValue(doc, x + 400, y + 6, 80, fmtData(dados.data_vencimento), { bold: true });
  y += RH + 1;

  // Linha 2: Cedente (esq) | Agencia/Codigo Cedente (dir)
  hLine(doc, x, y, pw);
  drawLabel(doc, x + 2, y + 1, 50, 'Cedente');
  drawValue(doc, x + 2, y + 6, 350, dados.nome_beneficiario || 'AJL COM. ATAC. FERRAGENS E FERRAMENTAS LTDA');
  drawLabel(doc, x + 400, y + 1, 90, 'Agencia/Codigo Cedente');
  drawValue(doc, x + 400, y + 6, 90, (dados.agencia || '7764') + '/' + (dados.id_beneficiario || '776400223389'));
  y += RH + 1;

  // Linha 3: Data Documento | No Documento | Especie | Aceite | Carteira
  hLine(doc, x, y, pw);
  drawLabel(doc, x + 2, y + 1, 60, 'Data Doc.');
  drawValue(doc, x + 2, y + 6, 55, fmtData(dados.data_emissao || dados.data_vencimento));
  drawLabel(doc, x + 75, y + 1, 50, 'No.Documento');
  drawValue(doc, x + 75, y + 6, 55, dados.seu_numero || '');
  drawLabel(doc, x + 150, y + 1, 40, 'Especie');
  drawValue(doc, x + 150, y + 6, 30, 'R$');
  drawLabel(doc, x + 190, y + 1, 35, 'Aceite');
  drawValue(doc, x + 190, y + 6, 30, 'N/A');
  drawLabel(doc, x + 230, y + 1, 40, 'Carteira');
  drawValue(doc, x + 230, y + 6, 35, dados.carteira || '109');
  // Nosso Numero (direita)
  drawLabel(doc, x + 340, y + 1, 60, 'Nosso Numero');
  drawValue(doc, x + 340, y + 6, 100, dados.nosso_numero || '', { bold: true });
  y += RH + 1;

  // Linha 4: Uso do Banco (esq) | Valor do Documento (dir)
  hLine(doc, x, y, pw);
  drawLabel(doc, x + 2, y + 1, 60, 'Uso do Banco');
  drawValue(doc, x + 2, y + 6, 60, '-', { color: '#999' });
  drawLabel(doc, x + 400, y + 1, 95, '(=) Valor do Documento');
  drawValue(doc, x + 400, y + 5, 95, 'R$ ' + fmtValor(dados.valor_titulo), { bold: true, size: 11, color: '#CC0000' });
  y += RH + 2;
  return y;
}

function drawTableCompensacao(doc, x, y, pw, dados) {
  // Linha 1: Local de Pagamento | Vencimento
  hLine(doc, x, y, pw);
  drawLabel(doc, x + 2, y + 1, 200, 'Local de Pagamento');
  drawValue(doc, x + 2, y + 6, 350, 'Pagavel em qualquer banco ate o vencimento');
  drawLabel(doc, x + 400, y + 1, 80, 'Vencimento');
  drawValue(doc, x + 400, y + 6, 80, fmtData(dados.data_vencimento), { bold: true });
  y += RH + 1;

  // Linha 2: Cedente | Agencia/Codigo
  hLine(doc, x, y, pw);
  drawLabel(doc, x + 2, y + 1, 50, 'Cedente');
  drawValue(doc, x + 2, y + 6, 350, dados.nome_beneficiario || 'AJL COM. ATAC. FERRAGENS E FERRAMENTAS LTDA');
  drawLabel(doc, x + 400, y + 1, 90, 'Agencia/Codigo Cedente');
  drawValue(doc, x + 400, y + 6, 90, (dados.agencia || '7764') + '/' + (dados.id_beneficiario || '776400223389'));
  y += RH + 1;

  // Linha 3: Data Doc | No Doc | Especie | Aceite | Data Proc | Carteira
  hLine(doc, x, y, pw);
  drawLabel(doc, x + 2, y + 1, 45, 'Data Doc.');
  drawValue(doc, x + 2, y + 6, 50, fmtData(dados.data_emissao || dados.data_vencimento));
  drawLabel(doc, x + 60, y + 1, 45, 'No.Documento');
  drawValue(doc, x + 60, y + 6, 50, dados.seu_numero || '');
  drawLabel(doc, x + 120, y + 1, 35, 'Especie');
  drawValue(doc, x + 120, y + 6, 25, 'R$');
  drawLabel(doc, x + 150, y + 1, 30, 'Aceite');
  drawValue(doc, x + 150, y + 6, 25, 'N/A');
  drawLabel(doc, x + 180, y + 1, 50, 'Data Proc.');
  drawValue(doc, x + 180, y + 6, 50, fmtData(dados.data_emissao || ''));
  drawLabel(doc, x + 340, y + 1, 60, 'Nosso Numero');
  drawValue(doc, x + 340, y + 6, 100, dados.nosso_numero || '', { bold: true });
  y += RH + 1;

  // Linha 4: Uso do Banco | Valor
  hLine(doc, x, y, pw);
  drawLabel(doc, x + 2, y + 1, 60, 'Uso do Banco');
  drawValue(doc, x + 2, y + 6, 60, '-', { color: '#999' });
  drawLabel(doc, x + 400, y + 1, 95, '(=) Valor do Documento');
  drawValue(doc, x + 400, y + 5, 95, 'R$ ' + fmtValor(dados.valor_titulo), { bold: true, size: 11, color: '#CC0000' });
  y += RH + 2;
  return y;
}

/* === PAGADOR === */

function drawPagador(doc, x, y, pw, dados) {
  hLine(doc, x, y, pw);
  drawLabel(doc, x + 2, y + 1, 50, 'Pagador');
  drawValue(doc, x + 2, y + 6, pw - 10, dados.nome_pagador || '', { bold: true, size: F_VAL });
  y += RH;

  var docLabel = dados.tipo_pessoa === 'F' ? 'CPF' : 'CNPJ';
  var endParts = [dados.logradouro, dados.cidade, dados.estado, dados.cep].filter(Boolean);
  drawValue(doc, x + 2, y + 2, 250, docLabel + ': ' + formatCnpj(dados.cpf_cnpj_pagador));
  drawValue(doc, x + 260, y + 2, pw - 270, endParts.join(' - '));
  y += RH;
  hLine(doc, x, y, pw);
  return y + 3;
}

/* === SACADOR/AVALISTA === */

function drawAvalista(doc, x, y, pw) {
  hLine(doc, x, y, pw);
  drawLabel(doc, x + 2, y + 1, 80, 'Sacador/Avalista');
  drawValue(doc, x + 2, y + 6, 200, '-', { color: '#999' });
  y += RH;
  hLine(doc, x, y, pw);
  return y + 3;
}

/* === CODIGO DE BARRAS + LINHA DIGITAVEL === */

function drawBarcodeLinha(doc, x, y, pw, barcodeBuf, barcodeText, dados) {
  // Codigo de barras (area maior)
  var bcH = 50;
  doc.rect(x, y, pw, bcH).lineWidth(0.3).stroke('#333');
  if (barcodeBuf) {
    doc.image(barcodeBuf, x + 10, y + 5, { width: pw - 20, height: bcH - 10 });
  } else if (barcodeText) {
    doc.fillColor('#000').fontSize(5).font('Courier');
    doc.text(barcodeText, x + 10, y + 20, { width: pw - 20, align: 'center', lineBreak: false });
    doc.font('Helvetica');
  }
  y += bcH + 3;

  // Linha Digitavel (texto abaixo do barcode)
  hLine(doc, x, y, pw);
  drawLabel(doc, x + 2, y + 1, 80, 'Linha Digitavel');
  drawValue(doc, x + 2, y + 6, pw - 10, dados.linha_digitavel || '', { size: 8, bold: true });
  y += RH;
  hLine(doc, x, y, pw);

  // Autenticacao Mecanica
  y += 3;
  drawLabel(doc, x + 2, y, 200, 'Autenticacao Mecanica - Ficha de Compensacao');

  return y + 10;
}

/* === SECAO PIX (QR Code + Copia e Cola) - so na ficha compensacao === */

function drawPix(doc, x, y, pw, dados, qrBuf) {
  var pix = dados.pix_copia_cola || '';
  var hasPix = pix || qrBuf;
  if (!hasPix) return y;

  hLine(doc, x, y, pw);
  y += 4;

  // QR Code (lado esquerdo)
  if (qrBuf) {
    try {
      doc.image(qrBuf, x + 10, y, { width: 75, height: 75 });
    } catch (e) {}
  }

  // Textos PIX (lado direito do QR)
  doc.fillColor('#333').fontSize(7).font('Helvetica-Bold');
  doc.text('Pagamento via PIX', x + 95, y + 2, { width: 200 });
  doc.font('Helvetica').fontSize(5.5);
  doc.text('Escaneie o QR Code ou copie o codigo abaixo', x + 95, y + 12, { width: 300 });
  doc.text('para pagar instantaneamente com PIX.', x + 95, y + 21, { width: 300 });

  // Caixa do Copia e Cola
  var ccY = y + 30;
  var ccW = pw - 100;
  var ccH = 30;
  doc.rect(x + 95, ccY, ccW, ccH).fill('#f8f8ff').lineWidth(0.3).stroke('#666');
  doc.fillColor('#333').fontSize(5).font('Helvetica-Bold');
  doc.text('PIX Copia e Cola:', x + 100, ccY + 2, { width: ccW - 10 });
  doc.fillColor('#000').fontSize(4.5).font('Courier');
  doc.text(pix, x + 100, ccY + 10, { width: ccW - 15 });
  doc.font('Helvetica');

  // TXID
  doc.fillColor('#999').fontSize(4.5);
  doc.text('TXID: ' + (dados.txid || ''), x + 95, y + 68, { width: 300 });

  return y + 82;
}

/* === SEPARADOR RECIBO / COMPENSACAO === */

function drawCorte(doc, x, y, pw) {
  doc.moveTo(x, y).lineTo(x + pw, y).lineWidth(0.5).dash(4, { space: 2 }).stroke('#666');
  doc.undash();
  return y + 5;
}

/* === MONTAGEM PRINCIPAL === */

async function drawBoleto(doc, dados) {
  var x = LM;
  var y = LM;

  // Pre-gerar barcode e QR code
  var barcodeText = dados.codigo_barras || '';
  var barcodeBuf = await genBarcode(barcodeText);

  var qrBuf = dados.qrcode_base64 ? Buffer.from(dados.qrcode_base64, 'base64') : null;
  if (!qrBuf && (dados.pix_copia_cola || '')) {
    qrBuf = await genQRCode(dados.pix_copia_cola);
  }

  // ===== RECIBO DO SACADO =====
  y = drawHeader(doc, x, y, PW, dados);
  y = drawTableSacado(doc, x, y, PW, dados);
  y = drawPagador(doc, x, y, PW, dados);
  y = drawBarcodeLinha(doc, x, y, PW, barcodeBuf, barcodeText, dados);

  // ===== CORTE =====
  y = drawCorte(doc, x, y, PW);

  // ===== FICHA DE COMPENSACAO =====
  y = drawHeader(doc, x, y, PW, dados);
  y = drawTableCompensacao(doc, x, y, PW, dados);
  y = drawPagador(doc, x, y, PW, dados);
  y = drawAvalista(doc, x, y, PW);
  y = drawBarcodeLinha(doc, x, y, PW, barcodeBuf, barcodeText, dados);
  y = drawPix(doc, x, y, PW, dados, qrBuf);

  // Linha final
  hLine(doc, x, y, PW);

  return y + 5;
}

async function buildPdfBuffer(dados) {
  return new Promise(function (resolve, reject) {
    try {
      var doc = new PDFDocument({
        size: 'A4',
        margins: { top: 5, bottom: 5, left: LM, right: LM },
        info: { Title: 'Boleto ' + (dados.nosso_numero || ''), Author: 'AJL Ferro e Aco' }
      });
      var chunks = [];
      doc.on('data', function (chunk) { chunks.push(chunk); });

      drawBoleto(doc, dados).then(function (finalY) {
        doc.fillColor('#999').fontSize(4);
        doc.text('Emitido por AJL Ferro e Aco | Boleto gerado via API BoleCode Itau', LM, finalY + 4, { width: PW, align: 'center' });
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

module.exports = { storeBoleto, getBoleto, generatePdf, generatePdfFromData, generatePdfFromFields };

/**
 * Gera PDF a partir de campos flat (dados vindos do Odoo)
 * Nao chama Itau - usa os dados ja armazenados nos campos da fatura
 * Formato: { nosso_numero, linha_digitavel, codigo_barras, pix_copia_cola, 
 *           valor_titulo, data_vencimento, nome_pagador, cpf_cnpj_pagador, ... }
 */
async function generatePdfFromFields(data) {
  var vt = data.valor_titulo || '0';
  var vtStr = String(vt).replace(/\D/g, '');
  if (vtStr.length < 15) {
    vtStr = String(Math.round(parseFloat(vt) * 100)).padStart(15, '0');
  }

  var d = {
    txid: data.txid || '',
    nosso_numero: data.nosso_numero || '',
    linha_digitavel: data.linha_digitavel || '',
    codigo_barras: data.codigo_barras || '',
    data_vencimento: data.data_vencimento || '',
    data_emissao: data.data_emissao || '',
    valor_titulo: vtStr,
    pix_copia_cola: data.pix_copia_cola || '',
    qrcode_base64: data.qrcode_base64 || '',
    nome_pagador: data.nome_pagador || '',
    cpf_cnpj_pagador: data.cpf_cnpj_pagador || '',
    logradouro: data.logradouro || '',
    cidade: data.cidade || '',
    estado: data.estado || '',
    cep: data.cep || '',
    seu_numero: data.seu_numero || data.nosso_numero || '',
    parcela: data.parcela || 0,
    total_parcelas: data.total_parcelas || 0,
    agencia: data.agencia || '7764',
    conta: data.conta || '22338-9',
    carteira: data.carteira || '109',
    id_beneficiario: data.id_beneficiario || '776400223389',
    nome_beneficiario: data.nome_beneficiario || 'AJL COMERCIO ATACADISTA DE FERRAGENS E FERRAMENTAS LTDA',
    cnpj_beneficiario: data.cnpj_beneficiario || '22.603.750/0001-90',
  };
  return buildPdfBuffer(d);
}
