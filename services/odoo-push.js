/**
 * services/odoo-push.js - v6.9.5
 * =============================================
 * Push de PDFs de boletos para Odoo via XML-RPC
 * - Conecta ao Odoo SaaS via xmlrpc/2/common e xmlrpc/2/object
 * - Busca fatura pelo name (record.name)
 * - Cria ir.attachment com PDF base64 (pre-gerado na emissao)
 * - Posta NOTA INTERNA no chatter com PDFs anexados
 *
 * v6.9.5:
 * - Nota interna (nao visivel ao cliente) com subtype_xmlid='mail.mt_note'
 * - Cada boleto: 1 nota + 1 PDF attachment amarrado a mensagem
 * - Detalhes do boleto no corpo da nota
 * - Fallback: busca fatura mais recente se nome vazio
 *
 * ENV VARS (Render):
 *   ODOO_URL          = https://ajlferroeaco.odoo.com
 *   ODOO_DB           = ajlferroeaco
 *   ODOO_USER         = email@usuario.com
 *   ODOO_PASSWORD     = senha_do_usuario (ou API key)
 *   ODOO_PUSH_ENABLED = true
 * =============================================
 */

var xmlrpc = require('xmlrpc');

function createClient(url) {
  var base = url.replace(/\/+$/, '');
  return {
    common: xmlrpc.createSecureClient({ host: base.replace('https://', ''), path: '/xmlrpc/2/common', port: 443 }),
    models: xmlrpc.createSecureClient({ host: base.replace('https://', ''), path: '/xmlrpc/2/object', port: 443 }),
    baseUrl: base
  };
}

function authenticate(client, db, login, password) {
  return new Promise(function(resolve, reject) {
    client.common.methodCall('authenticate', [db, login, password, {}], function(err, uid) {
      if (err) {
        console.error('[ODOO-PUSH] Erro autenticacao:', err.message || err);
        reject(new Error('Erro ao autenticar no Odoo: ' + (err.message || JSON.stringify(err))));
      } else if (uid === false || uid === null) {
        reject(new Error('Falha na autenticacao Odoo: credenciais invalidas'));
      } else {
        console.log('[ODOO-PUSH] Autenticado com sucesso. UID:', uid);
        resolve(uid);
      }
    });
  });
}

function executeKw(client, db, uid, password, model, method, args, kwargs) {
  return new Promise(function(resolve, reject) {
    var params = [db, uid, password, model, method, args || []];
    if (kwargs) params.push(kwargs || {});
    client.models.methodCall('execute_kw', params, function(err, result) {
      if (err) {
        console.error('[ODOO-PUSH] Erro execute_kw:', model, method, err.message || err);
        reject(new Error('Erro Odoo ' + model + '.' + method + ': ' + (err.message || JSON.stringify(err))));
      } else {
        resolve(result);
      }
    });
  });
}

async function findInvoiceId(client, db, uid, pwd, faturaName) {
  if (!faturaName) {
    console.warn('[ODOO-PUSH] Sem nome de fatura para buscar');
    return null;
  }
  console.log('[ODOO-PUSH] Buscando fatura:', faturaName);
  var ids = await executeKw(client, db, uid, pwd, 'account.move', 'search', [[['name', '=', faturaName]]]);
  if (!ids || ids.length === 0) {
    console.warn('[ODOO-PUSH] Fatura nao encontrada:', faturaName);
    return null;
  }
  console.log('[ODOO-PUSH] Fatura encontrada:', faturaName, 'ID:', ids[0]);
  return ids[0];
}

/**
 * Cria attachment (ir.attachment) vinculado a fatura
 * Retorna o ID do attachment criado
 */
async function createAttachment(client, db, uid, pwd, recordId, pdfBase64, filename) {
  var attachmentId = await executeKw(client, db, uid, pwd, 'ir.attachment', 'create', [{
    name: filename,
    datas: pdfBase64,
    res_model: 'account.move',
    res_id: recordId,
    mimetype: 'application/pdf',
  }]);
  console.log('[ODOO-PUSH] Attachment criado:', filename, 'ID:', attachmentId);
  return attachmentId;
}

/**
 * Posta NOTA INTERNA no chatter com o PDF anexado
 * subtype_xmlid: 'mail.mt_note' = nota interna (nao envia email ao cliente)
 * attachment_ids: amarra o PDF a esta mensagem especifica
 */
async function postNotaInternaComPdf(client, db, uid, pwd, recordId, bodyHtml, attachmentIds) {
  var msgVals = {
    model: 'account.move',
    res_id: recordId,
    body: bodyHtml,
    message_type: 'comment',
    subtype_xmlid: 'mail.mt_note',  // NOTA INTERNA
  };
  // Amarrar attachment(s) a esta mensagem
  if (attachmentIds && attachmentIds.length > 0) {
    msgVals.attachment_ids = [[6, 0, attachmentIds]];
  }
  var msgId = await executeKw(client, db, uid, pwd, 'mail.message', 'create', [msgVals]);
  console.log('[ODOO-PUSH] Nota interna postada, msg ID:', msgId, 'attachments:', attachmentIds.length);
  return msgId;
}

/**
 * Push completo: busca fatura, cria attachments, posta notas internas
 * 
 * @param {Object} pushData - { faturaName, boletos[], pdfsBase64[] }
 */
async function pushBoletosToOdoo(pushData) {
  var config = require('../config');
  var odooConfig = config.odoo;

  if (!odooConfig || !odooConfig.enabled) {
    console.log('[ODOO-PUSH] Desabilitado (ODOO_PUSH_ENABLED nao setado)');
    return { pushed: false, reason: 'disabled' };
  }

  if (!odooConfig.url || !odooConfig.db || !odooConfig.user || !odooConfig.password) {
    console.warn('[ODOO-PUSH] Credenciais Odoo incompletas. Pulando push.');
    console.warn('[ODOO-PUSH] Precisa: ODOO_URL, ODOO_DB, ODOO_USER, ODOO_PASSWORD');
    return { pushed: false, reason: 'missing_credentials' };
  }

  var faturaName = pushData.faturaName || '';
  var boletos = pushData.boletos || [];
  var pdfsBase64 = pushData.pdfsBase64 || [];

  console.log('[ODOO-PUSH] Iniciando push:', boletos.length, 'boleto(s), fatura:', faturaName || 'NAO INFORMADA');

  try {
    var client = createClient(odooConfig.url);
    var uid = await authenticate(client, odooConfig.db, odooConfig.user, odooConfig.password);

    // Buscar fatura
    var recordId;
    if (!faturaName) {
      console.warn('[ODOO-PUSH] Nome da fatura vazio. Buscando fatura mais recente...');
      var recentIds = await executeKw(client, odooConfig.db, uid, odooConfig.password, 'account.move', 'search', [[['move_type', '=', 'out_invoice']]], { order: 'id desc', limit: 3 });
      if (!recentIds || recentIds.length === 0) {
        console.warn('[ODOO-PUSH] Nenhuma fatura de venda encontrada');
        return { pushed: false, reason: 'no_invoices' };
      }
      recordId = recentIds[0];
      console.log('[ODOO-PUSH] Usando fatura mais recente, ID:', recordId);
    } else {
      recordId = await findInvoiceId(client, odooConfig.db, uid, odooConfig.password, faturaName);
      if (!recordId) {
        return { pushed: false, reason: 'invoice_not_found' };
      }
    }

    var faturaNameSafe = faturaName ? faturaName.replace(/[^a-zA-Z0-9\-_]/g, '_') : 'Fatura';
    var totalP = boletos.length;
    var totalAttachments = 0;

    // Para cada boleto: criar PDF attachment + nota interna com detalhes
    for (var i = 0; i < boletos.length; i++) {
      var bol = boletos[i];
      var pdfB64 = pdfsBase64[i];

      if (!pdfB64) {
        console.warn('[ODOO-PUSH] PDF', i + 1, 'nao disponivel, pulando...');
        continue;
      }

      var nn = bol.nosso_numero || '';
      var vd = bol.valor_titulo || '0,00';
      var vc = bol.data_vencimento || '';
      var ld = bol.linha_digitavel || '';
      var pix = bol.pix_copia_cola || '';
      var p = bol.parcela || 1;
      var t = bol.total_parcelas || 1;

      // Nome do arquivo PDF
      var filename;
      if (t > 1) {
        filename = 'Boleto_' + faturaNameSafe + '_P' + p + 'de' + t + '_' + nn + '.pdf';
      } else {
        filename = 'Boleto_' + faturaNameSafe + '_' + nn + '.pdf';
      }

      try {
        // 1. Criar attachment
        var attachId = await createAttachment(client, odooConfig.db, uid, odooConfig.password, recordId, pdfB64, filename);

        // 2. Montar corpo da nota com detalhes do boleto
        var htmlParts = [];
        htmlParts.push('<b>' + (t > 1 ? 'Boleto Parcela ' + p + '/' + t : 'Boleto') + '</b><br/>');
        htmlParts.push('Nosso Numero: ' + nn + '<br/>');
        htmlParts.push('Valor: R$ ' + vd + '<br/>');
        htmlParts.push('Vencimento: ' + vc + '<br/>');
        htmlParts.push('Linha Digitavel: ' + ld + '<br/>');
        if (pix) {
          htmlParts.push('PIX Copia e Cola: ' + pix);
        }

        // 3. Postar nota interna com PDF amarrado
        await postNotaInternaComPdf(client, odooConfig.db, uid, odooConfig.password, recordId, htmlParts.join('<br/>'), [attachId]);
        totalAttachments++;

      } catch (err) {
        console.error('[ODOO-PUSH] Erro ao processar boleto', (i + 1) + ':', err.message);
      }
    }

    console.log('[ODOO-PUSH] === PUSH COMPLETO: ' + totalAttachments + '/' + boletos.length + ' PDFs anexados como nota interna na fatura ' + (faturaName || 'ID:' + recordId) + ' ===');
    return { pushed: totalAttachments > 0, attachments: totalAttachments, record_id: recordId };

  } catch (err) {
    console.error('[ODOO-PUSH] Erro no push:', err.message);
    return { pushed: false, reason: err.message };
  }
}

module.exports = { pushBoletosToOdoo, createClient, authenticate, findInvoiceId, createAttachment };
