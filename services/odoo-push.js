/**
 * services/odoo-push.js - v6.9
 * =============================================
 * Push de PDFs de boletos para Odoo via XML-RPC
 * - Conecta ao Odoo SaaS via xmlrpc/2/common e xmlrpc/2/object
 * - Busca fatura pelo name (record.name)
 * - Cria ir.attachment com PDF base64
 * - Posta mensagem no chatter via mail.message
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

/**
 * Cria cliente XML-RPC para Odoo
 */
function createClient(url) {
  var base = url.replace(/\/+$/, '');
  return {
    common: xmlrpc.createSecureClient({ host: base.replace('https://', ''), path: '/xmlrpc/2/common', port: 443 }),
    models: xmlrpc.createSecureClient({ host: base.replace('https://', ''), path: '/xmlrpc/2/object', port: 443 }),
    baseUrl: base
  };
}

/**
 * Autentica no Odoo via XML-RPC
 * Retorna o uid (user id)
 */
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

/**
 * Executa metodo no modelo Odoo via XML-RPC
 */
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

/**
 * Busca ID da fatura pelo nome
 */
async function findInvoiceId(client, db, uid, pwd, faturaName) {
  if (!faturaName) {
    console.error('[ODOO-PUSH] Sem nome de fatura para buscar');
    return null;
  }
  var ids = await executeKw(client, db, uid, pwd, 'account.move', 'search', [[['name', '=', faturaName]]]);
  if (!ids || ids.length === 0) {
    console.warn('[ODOO-PUSH] Fatura nao encontrada:', faturaName);
    return null;
  }
  console.log('[ODOO-PUSH] Fatura encontrada:', faturaName, 'ID:', ids[0]);
  return ids[0];
}

/**
 * Cria attachment (ir.attachment) no Odoo
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
 * Posta mensagem no chatter da fatura
 */
async function postChatterMessage(client, db, uid, pwd, recordId, bodyHtml) {
  await executeKw(client, db, uid, pwd, 'mail.message', 'create', [{
    model: 'account.move',
    res_id: recordId,
    body: bodyHtml,
    message_type: 'comment',
    subtype_xmlid: 'mail.mt_comment',
  }]);
  console.log('[ODOO-PUSH] Mensagem postada no chatter da fatura', recordId);
}

/**
 * Push completo: busca fatura, cria attachments, posta chatter
 */
async function pushBoletosToOdoo(faturaName, boletos) {
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

  try {
    var client = createClient(odooConfig.url);
    var uid = await authenticate(client, odooConfig.db, odooConfig.user, odooConfig.password);

    // Buscar fatura pelo nome
    var recordId = await findInvoiceId(client, odooConfig.db, uid, odooConfig.password, faturaName);
    if (!recordId) {
      return { pushed: false, reason: 'invoice_not_found' };
    }

    // Gerar PDFs e criar attachments
    var pdfService = require('./pdf-boleto');
    var attachments = 0;

    for (var i = 0; i < boletos.length; i++) {
      var bol = boletos[i];
      var txid = bol.txid;
      var nn = bol.nosso_numero || txid;
      var total = bol.total_parcelas || 1;
      var parc = bol.parcela || 1;

      // Gerar PDF buffer
      var pdfBuf = await pdfService.generatePdf(txid);
      var pdfB64 = pdfBuf.toString('base64');

      // Nome do arquivo
      var filename;
      if (total > 1) {
        filename = 'Boleto_' + faturaName.replace('/', '-') + '_P' + parc + 'de' + total + '_' + nn + '.pdf';
      } else {
        filename = 'Boleto_' + faturaName.replace('/', '-') + '_' + nn + '.pdf';
      }

      // Criar attachment no Odoo
      await createAttachment(client, odooConfig.db, uid, odooConfig.password, recordId, pdfB64, filename);
      attachments++;
    }

    // Postar mensagem no chatter com resumo
    var total = boletos.length;
    var htmlParts = [];
    htmlParts.push('<p><b>' + (total > 1 ? 'Boletos emitidos com sucesso (' + total + ' parcelas):' : 'Boleto emitido com sucesso:') + '</b></p>');

    for (var i = 0; i < boletos.length; i++) {
      var bol = boletos[i];
      var nn = bol.nosso_numero || '';
      var vd = bol.valor_titulo || '0,00';
      var vc = bol.data_vencimento || '';
      var ld = bol.linha_digitavel || '';
      var pix = bol.pix_copia_cola || '';
      var p = bol.parcela || 1;
      var t = bol.total_parcelas || 1;

      if (t > 1) {
        htmlParts.push('<p>Parcela ' + p + '/' + t + ': R$ ' + vd + ' | Venc: ' + vc + ' | NN: ' + nn + '</p>');
      } else {
        htmlParts.push('<p>Valor: R$ ' + vd + ' | Venc: ' + vc + ' | NN: ' + nn + '</p>');
      }
      htmlParts.push('<p>Linha Digitavel: ' + ld + '</p>');
      htmlParts.push('<p>PIX: ' + pix + '</p><br/>');
    }

    htmlParts.push('<p>PDF(s) anexado(s) nesta fatura.</p>');

    await postChatterMessage(client, odooConfig.db, uid, odooConfig.password, recordId, htmlParts.join(''));

    console.log('[ODOO-PUSH] === PUSH COMPLETO: ' + attachments + ' PDFs anexados na fatura ' + faturaName + ' (ID: ' + recordId + ') ===');
    return { pushed: true, attachments: attachments, record_id: recordId };

  } catch (err) {
    console.error('[ODOO-PUSH] Erro no push:', err.message);
    // Nao propagar erro - boletos foram emitidos, push e bonus
    return { pushed: false, reason: err.message };
  }
}

module.exports = { pushBoletosToOdoo, createClient, authenticate, findInvoiceId, createAttachment };
