/**
 * services/pdf-boleto.js - v6.4
 * Gera PDF do boleto com QR Code PIX
 */
const PDFDocument = require('pdfkit');
let bwipjs = null;
try {
  bwipjs = require('bwip-js');
} catch (e) {
  console.log('[PDF-BOLETO] bwip-js nao disponivel, barcode sera texto');
}

const store = new Map();

function storeBoleto(txid, dados) {
  store.set(txid, { ...dados, createdAt: Date.now() });
}

function getBoleto(txid) {
  return store.get(txid) || null;
}

function formatCpfCnpj(val) {
  const s = String(val || '').replace(/\D/g, '');
  if (s.length === 14) return s.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  if (s.length === 11) return s.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  return val || '';
}

function formatDate(d) {
  if (!d) return '';
  const p = d.split('-');
  return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : d;
}

function parseValor(v) {
  const s = String(v || '0').padStart(15, '0');
  const centavos = parseInt(s.slice(-2), 10);
  const reais = parseInt(s.slice(0, -2), 10);
  return (reais + centavos / 100).toFixed(2);
}

async function generatePdf(txid) {
  const dados = getBoleto(txid);
  if (!dados) throw new Error('Boleto nao encontrado');

  var barcodePng = null;
  if (bwipjs && dados.codigo_barras) {
    try {
      barcodePng = bwipjs.toBufferSync({
        bcid: 'code128',
        text: dados.codigo_barras,
        scale: 3,
        height: 15,
        includetext: false
      });
    } catch (e) {
      console.log('[PDF-BOLETO] Barcode sync falhou:', e.message);
    }
  }

  return new Promise(function (resolve, reject) {
    try {
      var doc = new PDFDocument({
        size: 'A4',
        margins: { top: 15, bottom: 15, left: 15, right: 15 },
        info: { Title: 'Boleto ' + txid, Author: 'AJL Ferro e Aco' }
      });
      var chunks = [];
      doc.on('data', function (chunk) { chunks.push(chunk); });

      var pw = doc.page.width - 30;
      var y = 15;

      doc.rect(15, y, pw, 50).fill('#EC0000');
      doc.fillColor('#fff').fontSize(16).font('Helvetica-Bold');
      doc.text('BANCO ITAU', 25, y + 8, { width: 200 });
      doc.fontSize(11).font('Helvetica');
      doc.text('341-7', 25, y + 28, { width: 200 });
      doc.fontSize(9);
      doc.text('AJL Comercio Atacadista de Ferragens e Ferramentas LTDA', 240, y + 8, { width: pw - 240 });
      doc.text('CNPJ: 22.603.750/0001-90 | Ag: 7764 | CC: 22338-9', 240, y + 22, { width: pw - 240 });
      doc.fillColor('#000');
      y += 60;

      doc.rect(15, y, pw, 22).fill('#333');
      doc.fillColor('#fff').fontSize(10).font('Helvetica-Bold');
      doc.text('BOLETO BANCARIO / PIX', 25, y + 5, { width: pw - 20, align: 'center' });
      doc.fillColor('#000');
      y += 30;

      function field(label, value, yPos) {
        doc.rect(15, yPos, pw, 20).fill('#f8f8f8').stroke('#ccc');
        doc.fillColor('#666').fontSize(8).font('Helvetica');
        doc.text(label, 20, yPos + 5, { width: 120 });
        doc.fillColor('#222').fontSize(9).font('Helvetica-Bold');
        doc.text(String(value), 145, yPos + 5, { width: pw - 140 });
        doc.font('Helvetica');
      }

      field('Beneficiario', 'AJL COMERCIO ATACADISTA DE FERRAGENS E FERRAMENTAS LTDA', y); y += 22;
      field('CNPJ', '22.603.750/0001-90', y); y += 22;
      field('Pagador', dados.nome_pagador || '', y); y += 22;
      field('CPF/CNPJ', formatCpfCnpj(dados.cpf_cnpj_pagador), y); y += 22;
      field('Endereco', [dados.logradouro, dados.cidade, dados.estado].filter(Boolean).join(' - '), y); y += 22;
      field('Vencimento', formatDate(dados.data_vencimento), y); y += 22;
      field('Valor', 'R$ ' + parseValor(dados.valor_titulo).replace('.', ','), y); y += 22;
      field('Nosso Numero', dados.nosso_numero || '', y); y += 22;
      field('Seu Numero', dados.seu_numero || '', y); y += 22;
      field('TXID', dados.txid || '', y); y += 28;

      if (barcodePng) {
        doc.image(barcodePng, 30, y, { width: pw - 30, height: 55 });
        y += 60;
      } else if (dados.codigo_barras) {
        doc.rect(15, y, pw, 30).fill('#fff').stroke('#ddd');
        doc.fillColor('#000').fontSize(7).font('Courier');
        doc.text(dados.codigo_barras, 20, y + 10, { width: pw - 10, align: 'center' });
        doc.font('Helvetica');
        y += 35;
      }

      doc.rect(15, y, pw, 35).fill('#fffde8').stroke('#ccc');
      doc.fillColor('#333').fontSize(8).font('Helvetica-Bold');
      doc.text('Linha Digitavel:', 20, y + 3, { width: pw - 10 });
      doc.fillColor('#005500').fontSize(14).font('Courier-Bold');
      doc.text(dados.linha_digitavel || '', 20, y + 16, { width: pw - 10 });
      doc.font('Helvetica');
      y += 42;

      doc.moveTo(15, y).lineTo(15 + pw, y).lineWidth(2).dash(4, { space: 3 }).stroke('#EC0000');
      doc.undash();
      y += 10;

      doc.rect(15, y, pw, 22).fill('#333');
      doc.fillColor('#fff').fontSize(10).font('Helvetica-Bold');
      doc.text('PIX - PAGAMENTO INSTANTANEO', 25, y + 5, { width: pw - 20, align: 'center' });
      doc.fillColor('#000');
      y += 32;

      if (dados.qrcode_base64) {
        try {
          var qrBuf = Buffer.from(dados.qrcode_base64, 'base64');
          doc.image(qrBuf, 15, y, { width: 130, height: 130 });
          doc.fillColor('#333').fontSize(9).font('Helvetica-Bold');
          doc.text('Escaneie o QR Code', 160, y + 10, { width: pw - 170 });
          doc.fillColor('#666').fontSize(8).font('Helvetica');
          doc.text('para pagar via PIX', 160, y + 24, { width: pw - 170 });
          doc.text('ou use o codigo abaixo', 160, y + 38, { width: pw - 170 });
        } catch (e) {
          console.log('[PDF] QR embed falhou:', e.message);
        }
        y += 140;
      }

      doc.rect(15, y, pw, 40).fill('#f0f0f0').stroke('#ccc');
      doc.fillColor('#333').fontSize(8).font('Helvetica-Bold');
      doc.text('PIX Copia e Cola:', 20, y + 4, { width: pw - 10 });
      doc.fillColor('#333').fontSize(6).font('Courier');
      doc.text(dados.pix_copia_cola || '', 20, y + 18, { width: pw - 10 });
      doc.font('Helvetica');
      y += 50;

      y = doc.page.height - 45;
      doc.moveTo(15, y).lineTo(15 + pw, y).lineWidth(0.5).stroke('#ccc');
      doc.fillColor('#999').fontSize(7);
      doc.text('AJL Ferro e Aco | ' + (dados.txid || '') + ' | ' + new Date().toISOString().split('T')[0], 20, y + 8, { width: pw - 10, align: 'center' });

      doc.end();
      doc.on('end', function () { resolve(Buffer.concat(chunks)); });
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { storeBoleto, getBoleto, generatePdf };
