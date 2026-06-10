/**
 * routes/api.js - v6.9.4
 * =============================================
 * API de Pagamento - Suporte a boleto parcelado + Push PDF Odoo
 * - Parse forma_pagamento para detectar parcelas
 * - Emite N boletos (um por parcela)
 * - Gera PDFs imediatamente apos emissao (antes de perder RAM)
 * - Push automatico de PDFs para Odoo via XML-RPC (ir.attachment + chatter)
 * - Suporta JSON nested (fatura.name) e flat (fatura_name)
 * =============================================
 */
const express = require('express');
const router = express.Router();
const { authenticateApiKey } = require('../middleware/auth');
const { emitirBoleto, parseFormaPagamento } = require('../services/itau-boleto');
const { storeBoleto, generatePdf, generatePdfFromFields } = require('../services/pdf-boleto');
const { pushBoletosToOdoo } = require('../services/odoo-push');

/**
 * Calcula data de vencimento: base_date + dias
 * Se base_date no passado, usa hoje como base
 */
function calcDataVenc(base, dias) {
  var db = base ? new Date(base + 'T12:00:00') : new Date();
  var hj = new Date(); hj.setHours(0,0,0,0);
  if (db <= hj) db = new Date();
  db.setDate(db.getDate() + dias);
  var a = db.getFullYear();
  var m = String(db.getMonth()+1).padStart(2,'0');
  var d = String(db.getDate()).padStart(2,'0');
  return a+'-'+m+'-'+d;
}

router.post('/pagar', authenticateApiKey, async function(req, res) {
  try {
    var d = req.body;

    // Debug: logar campos relevantes do body
    console.log('[API] === NOVA REQUISICAO DE PAGAMENTO ===');
    console.log('[API] Body keys:', Object.keys(d).join(', '));
    console.log('[API] forma_pagamento:', d.forma_pagamento);
    console.log('[API] fatura:', JSON.stringify(d.fatura || 'MISSING'));
    console.log('[API] fatura_name (flat):', d.fatura_name || 'MISSING');

    // Suportar ambos formatos: nested JSON e flat form-urlencoded
    var fat = d.fatura || {};
    var fatNameFromNested = fat.name || fat.seu_numero || '';
    var fatNameFromFlat = d.fatura_name || d.invoice_name || '';
    var faturaName = fatNameFromNested || fatNameFromFlat;
    var valorTotal = parseFloat(fat.valor_nominal || d.fatura_valor) || 0;
    var dataVencBase = fat.data_vencimento || d.fatura_vencimento || '';

    var pag = d.pagador || {};
    var formaPag = d.forma_pagamento || '';

    console.log('[API] Forma pagamento:', formaPag);
    console.log('[API] Fatura name:', faturaName || 'VAZIO');
    console.log('[API] Valor total: R$ ' + valorTotal.toFixed(2));

    // Parsear forma de pagamento
    var plano = parseFormaPagamento(formaPag);
    console.log('[API] Plano parsed:', JSON.stringify(plano));

    if (plano.tipo !== 'boleto' || plano.parcelas.length === 0) {
      console.log('[API] Forma nao suportada:', formaPag, 'tipo:', plano.tipo);
      return res.json({
        success: false,
        message: 'Forma de pagamento nao suportada para boleto: ' + formaPag
      });
    }

    // Payload base (dados do pagador) - suportar nested e flat
    var basePayload = {
      cpfCnpjPagador: pag.cpf_cnpj || d.pagador_cpf || '',
      nomePagador: pag.nome || d.pagador_nome || '',
      numeroPedido: fat.seu_numero || fat.name || d.fatura_name || '',
      dataVencimento: dataVencBase,
      logradouro: pag.street || d.pagador_street || '',
      cidade: pag.city || d.pagador_city || '',
      estado: pag.state || d.pagador_state || '',
      cep: pag.zip || d.pagador_zip || ''
    };

    var totalP = plano.parcelas.length;
    var pagamentos = [];

    console.log('[API] Emitindo', totalP, 'boleto(s)...');

    for (var i = 0; i < totalP; i++) {
      var parc = plano.parcelas[i];

      // Calcular valor da parcela (ultima recebe resto p/ evitar diferenca de arredondamento)
      var valorParc = Math.round((valorTotal * parc.valor_pct / 100) * 100) / 100;
      if (i === totalP - 1) {
        var soma = 0;
        for (var j = 0; j < totalP - 1; j++) {
          soma += Math.round((valorTotal * plano.parcelas[j].valor_pct / 100) * 100) / 100;
        }
        valorParc = Math.round((valorTotal - soma) * 100) / 100;
      }

      // Calcular data de vencimento: base + dias offset
      var dataVenc = calcDataVenc(dataVencBase, parc.dias);

      // Montar payload desta parcela
      var pPayload = Object.assign({}, basePayload);
      pPayload.valor = valorParc;
      pPayload.dataVencimento = dataVenc;
      pPayload.numeroPedido = basePayload.numeroPedido + (totalP > 1 ? '-P' + parc.numero : '');

      console.log('[API]   Parcela ' + parc.numero + '/' + totalP + ': R$ ' + valorParc.toFixed(2) + ' | Venc: ' + dataVenc + ' | Dias: +' + parc.dias);

      // Emitir boleto via Itau
      var resultado = await emitirBoleto(pPayload);
      var dados = (resultado.dados && resultado.dados.data) ? resultado.dados.data : {};
      var ind = (dados.dado_boleto && dados.dado_boleto.dados_individuais_boleto && dados.dado_boleto.dados_individuais_boleto[0]) || {};
      var qr = dados.dados_qrcode || {};
      var txid = qr.txid || ('BL' + Date.now() + '-' + parc.numero);
      var nossoNumero = ind.numero_nosso_numero || '';

      // Guardar dados do boleto para gerar PDF (memoria - rapido)
      storeBoleto(txid, {
        txid: txid,
        nosso_numero: nossoNumero,
        linha_digitavel: ind.numero_linha_digitavel || '',
        codigo_barras: ind.codigo_barras || '',
        data_vencimento: ind.data_vencimento || dataVenc,
        data_emissao: dados.dado_boleto ? dados.dado_boleto.data_emissao : '',
        valor_titulo: ind.valor_titulo || '',
        pix_copia_cola: qr.emv || '',
        qrcode_base64: qr.base64 || '',
        nome_pagador: basePayload.nomePagador,
        cpf_cnpj_pagador: basePayload.cpfCnpjPagador,
        logradouro: basePayload.logradouro,
        cidade: basePayload.cidade,
        estado: basePayload.estado,
        cep: basePayload.cep,
        seu_numero: pPayload.numeroPedido,
        parcela: parc.numero,
        total_parcelas: totalP
      });

      var vc = parseInt(String(ind.valor_titulo || '0'), 10);

      pagamentos.push({
        tipo: 'boleto',
        parcela: parc.numero,
        total_parcelas: totalP,
        nosso_numero: nossoNumero,
        linha_digitavel: ind.numero_linha_digitavel || '',
        codigo_barras: ind.codigo_barras || '',
        pix_copia_cola: qr.emv || '',
        txid: txid,
        valor_titulo: (vc / 100).toFixed(2),
        data_vencimento: ind.data_vencimento || dataVenc,
        pdf_url_txid: 'https://itau-odoo.onrender.com/boletos/pdf/' + txid,
        pdf_url_nn: 'https://itau-odoo.onrender.com/boletos/pdf/nn/' + nossoNumero
      });

      console.log('[API]   Parcela ' + parc.numero + ' OK: txid=' + txid + ' NN=' + nossoNumero);
    }

    // === GERAR PDFs IMEDIATAMENTE (antes de qualquer restart) ===
    console.log('[API] Gerando', totalP, 'PDF(s) para push...');
    var pdfsBase64 = [];
    for (var i = 0; i < pagamentos.length; i++) {
      try {
        var pdfBuf = await generatePdf(pagamentos[i].txid);
        pdfsBase64.push(pdfBuf.toString('base64'));
        console.log('[API]   PDF', i + 1, '/', totalP, '- OK (' + (pdfBuf.length / 1024).toFixed(0) + 'KB)');
      } catch (pdfErr) {
        console.error('[API]   PDF', i + 1, 'ERRO:', pdfErr.message);
        pdfsBase64.push(null); // null = falhou, pular no push
      }
    }

    console.log('[API] === ' + totalP + ' BOLETO(S) EMITIDO(S) COM SUCESSO ===');

    // === PUSH AUTOMATICO PARA ODOO (nao bloqueia resposta) ===
    var pushData = {
      faturaName: faturaName,
      boletos: pagamentos,
      pdfsBase64: pdfsBase64
    };

    var pushPromise = pushBoletosToOdoo(pushData).catch(function(err) {
      console.error('[API] Push Odoo falhou (nao critico):', err.message);
    });

    res.json({
      success: true,
      data: {
        forma_pagamento: formaPag,
        total_parcelas: totalP,
        valor_total: valorTotal.toFixed(2),
        fatura_name: faturaName || '(nao informado)',
        pagamentos: pagamentos,
        odoo_push: 'automatico'
      }
    });

    // Log resultado do push (async, nao bloqueia)
    pushPromise.then(function(result) {
      if (result.pushed) {
        console.log('[API] Push Odoo OK:', result.attachments, 'attachments, record_id:', result.record_id);
      } else {
        console.log('[API] Push Odoo pulado:', result.reason);
      }
    });

  } catch (e) {
    console.error('[API] ERRO:', e.message, e.stack);
    res.json({ success: false, message: e.message });
  }
});

/**
 * POST /api/gerar
 * =============================================
 * Endpoint simplificado para Odoo Server Actions.
 * Odoo Online bloqueia "import" no safe_eval, entao:
 * - Aceita form-urlencoded (padrao url_open do Odoo)
 * - Retorna texto plano (sem JSON) com PDFs em base64
 * - Odoo nao precisa de import requests, import base64, import json
 *
 * Formato da resposta:
 *   OK|<total_parcelas>
 *   NN=<nosso_numero>|TXID=<txid>|VD=<valor>|VC=<vencimento>|LD=<linha_digitavel>|PIX=<pix_copia_cola>|B64=<pdf_base64>
 *   ...
 *   (ou ERRO|<mensagem>)
 * =============================================
 */
router.post('/gerar', async function(req, res) {
  try {
    var formaPag = req.body.forma_pagamento || '';
    var fatName = req.body.fatura_name || '';
    var fatValor = parseFloat(req.body.fatura_valor) || 0;
    var fatVenc = req.body.fatura_vencimento || '';
    var pagNome = req.body.pagador_nome || '';
    var pagCpf = req.body.pagador_cpf || '';
    var pagStreet = req.body.pagador_street || '';
    var pagCity = req.body.pagador_city || '';
    var pagState = req.body.pagador_state || '';
    var pagZip = req.body.pagador_zip || '';

    console.log('[API/GERAR] === NOVA REQUISICAO (Odoo Server Action) ===');
    console.log('[API/GERAR] Forma pagamento:', formaPag);
    console.log('[API/GERAR] Fatura:', fatName, '| Valor: R$ ' + fatValor.toFixed(2));

    var plano = parseFormaPagamento(formaPag);
    if (plano.tipo !== 'boleto' || plano.parcelas.length === 0) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.send('ERRO|Forma de pagamento nao suportada: ' + formaPag);
      return;
    }

    var basePayload = {
      cpfCnpjPagador: pagCpf,
      nomePagador: pagNome,
      numeroPedido: fatName,
      dataVencimento: fatVenc,
      logradouro: pagStreet,
      cidade: pagCity,
      estado: pagState,
      cep: pagZip
    };

    var totalP = plano.parcelas.length;
    var lines = ['OK|' + totalP];

    console.log('[API/GERAR] Emitindo', totalP, 'boleto(s) com PDF...');

    for (var i = 0; i < totalP; i++) {
      var parc = plano.parcelas[i];
      var valorParc = Math.round((fatValor * parc.valor_pct / 100) * 100) / 100;
      if (i === totalP - 1) {
        var soma = 0;
        for (var j = 0; j < totalP - 1; j++) {
          soma += Math.round((fatValor * plano.parcelas[j].valor_pct / 100) * 100) / 100;
        }
        valorParc = Math.round((fatValor - soma) * 100) / 100;
      }

      var dataVenc = calcDataVenc(fatVenc, parc.dias);
      var pPayload = Object.assign({}, basePayload);
      pPayload.valor = valorParc;
      pPayload.dataVencimento = dataVenc;
      pPayload.numeroPedido = fatName + (totalP > 1 ? '-P' + parc.numero : '');

      console.log('[API/GERAR]   Parcela ' + parc.numero + '/' + totalP + ': R$ ' + valorParc.toFixed(2) + ' | Venc: ' + dataVenc);

      var resultado = await emitirBoleto(pPayload);
      var dados = (resultado.dados && resultado.dados.data) ? resultado.dados.data : {};
      var ind = (dados.dado_boleto && dados.dado_boleto.dados_individuais_boleto && dados.dado_boleto.dados_individuais_boleto[0]) || {};
      var qr = dados.dados_qrcode || {};
      var txid = qr.txid || ('BL' + Date.now() + '-' + parc.numero);
      var nossoNumero = ind.numero_nosso_numero || '';

      // Store in memory for PDF generation
      storeBoleto(txid, {
        txid: txid,
        nosso_numero: nossoNumero,
        linha_digitavel: ind.numero_linha_digitavel || '',
        codigo_barras: ind.codigo_barras || '',
        data_vencimento: ind.data_vencimento || dataVenc,
        data_emissao: dados.dado_boleto ? dados.dado_boleto.data_emissao : '',
        valor_titulo: ind.valor_titulo || '',
        pix_copia_cola: qr.emv || '',
        qrcode_base64: qr.base64 || '',
        nome_pagador: pagNome,
        cpf_cnpj_pagador: pagCpf,
        logradouro: pagStreet,
        cidade: pagCity,
        estado: pagState,
        cep: pagZip,
        seu_numero: pPayload.numeroPedido,
        parcela: parc.numero,
        total_parcelas: totalP
      });

      // Generate PDF buffer and convert to base64
      var pdfBuf = await generatePdf(txid);
      var pdfB64 = pdfBuf.toString('base64');

      var vc = parseInt(String(ind.valor_titulo || '0'), 10);

      lines.push(
        'NN=' + nossoNumero +
        '|TXID=' + txid +
        '|VD=' + (vc / 100).toFixed(2) +
        '|VC=' + (ind.data_vencimento || dataVenc) +
        '|LD=' + (ind.numero_linha_digitavel || '') +
        '|PIX=' + (qr.emv || '') +
        '|B64=' + pdfB64
      );

      console.log('[API/GERAR]   Parcela ' + parc.numero + ' OK: NN=' + nossoNumero + ' PDF=' + (pdfB64.length / 1024).toFixed(0) + 'KB');
    }

    console.log('[API/GERAR] === ' + totalP + ' BOLETO(S) EMITIDO(S) COM PDF ===');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(lines.join('\n'));

  } catch (e) {
    console.error('[API/GERAR] ERRO:', e.message, e.stack);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send('ERRO|' + e.message);
  }
});

/**
 * POST /api/regen
 * Regenera PDF de boleto a partir dos campos Odoo (sem chamar Itau)
 * Aceita form-urlencoded (url_open do Odoo)
 * Retorna texto plano: OK|<base64_pdf> ou ERRO|<mensagem>
 */
router.post('/regen', async function(req, res) {
  try {
    var nn = req.body.nosso_numero || '';
    var ld = req.body.linha_digitavel || '';
    var cb = req.body.codigo_barras || '';
    var pix = req.body.pix_copia_cola || '';
    var vd = req.body.valor_titulo || '';
    var vc = req.body.data_vencimento || '';
    var pn = req.body.nome_pagador || '';
    var pc = req.body.cpf_cnpj_pagador || '';
    var sn = req.body.seu_numero || nn;
    var parc = req.body.parcela || '';
    var tp = req.body.total_parcelas || '';

    console.log('[API/REGEN] Regenerando PDF para NN:', nn, 'VD:', vd);

    if (!nn && !ld) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.send('ERRO|Campos obrigatorios: nosso_numero ou linha_digitavel');
      return;
    }

    var dados = {
      nosso_numero: nn,
      linha_digitavel: ld,
      codigo_barras: cb,
      pix_copia_cola: pix,
      valor_titulo: vd,
      data_vencimento: vc,
      nome_pagador: pn,
      cpf_cnpj_pagador: pc,
      seu_numero: sn,
      parcela: parc ? parseInt(parc) : 0,
      total_parcelas: tp ? parseInt(tp) : 0,
    };

    var pdfBuf = await generatePdfFromFields(dados);
    var b64 = pdfBuf.toString('base64');

    console.log('[API/REGEN] PDF gerado:', (b64.length / 1024).toFixed(0) + 'KB');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send('OK|' + b64);

  } catch(e) {
    console.error('[API/REGEN] ERRO:', e.message, e.stack);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send('ERRO|' + e.message);
  }
});

module.exports = router;
