/**
 * routes/boletos.js - v6.9.4
 * =============================================
 * PDF de Boleto - Download e Regeneracao
 * - POST /boletos/pdf       -> PDF a partir de dados (JSON)
 * - POST /boletos/regen     -> Regenera PDF a partir de campos flat (sem chamar Itau)
 * - GET  /boletos/pdf/:txid -> PDF pelo txid (memoria apenas)
 * - GET  /boletos/pdf/nn/:nosso_numero -> PDF pelo nosso_numero (memoria, mapa reverso)
 * - GET  /boletos/info/:nn  -> Info do boleto (bloqueado - Itau 405)
 *
 * IMPORTANTE: Itau API retorna 405 para GET search por nosso_numero.
 * As rotas GET usam apenas dados em memoria (perdem apos restart).
 * Os PDFs sao anexados ao Odoo automaticamente pelo push (odoo-push.js).
 * =============================================
 */
const express = require('express');
const router = express.Router();
const { storeBoleto, getBoleto, getTxidByNn, generatePdf, generatePdfFromData, generatePdfFromFields } = require('../services/pdf-boleto');

/**
 * POST /boletos/pdf
 * Gera PDF a partir dos dados enviados no corpo da requisicao
 */
router.post('/pdf', async function(req, res) {
  try {
    var b = await generatePdfFromData(req.body);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename=boleto.pdf');
    res.send(b);
  } catch(e) {
    console.error('[BOLETOS] Erro PDF POST:', e.message, e.stack);
    res.status(500).json({ erro: e.message });
  }
});

/**
 * POST /boletos/regen
 * Regenera PDF a partir de campos flat (dados dos campos Odoo)
 * Nao chama Itau - usa dados ja armazenados
 * Retorna: texto plano "OK|<base64_pdf>" ou "ERRO|<mensagem>"
 */
router.post('/regen', async function(req, res) {
  try {
    console.log('[BOLETOS] REGEN - Gerando PDF a partir de campos');
    var pdfBuf = await generatePdfFromFields(req.body);
    var b64 = pdfBuf.toString('base64');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send('OK|' + b64);
  } catch(e) {
    console.error('[BOLETOS] Erro REGEN:', e.message, e.stack);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send('ERRO|' + e.message);
  }
});

/**
 * GET /boletos/pdf/nn/:nosso_numero
 * PDF pelo nosso_numero (usa mapa reverso em memoria)
 * Funciona na mesma sessao (antes do restart do Render)
 * Apos restart, use os PDFs anexados no Odoo (push automatico)
 */
router.get('/pdf/nn/:nosso_numero', async function(req, res) {
  try {
    var nn = req.params.nosso_numero;
    console.log('[BOLETOS] PDF GET nosso_numero:', nn);

    // Buscar txid pelo mapa reverso
    var txid = getTxidByNn(nn);
    if (!txid) {
      return res.status(404).json({
        erro: 'Boleto nao encontrado na memoria (middleware pode ter reiniciado).',
        solucao: 'Os PDFs ja foram anexados automaticamente na fatura Odoo. Verifique os anexos da fatura.',
        nosso_numero: nn
      });
    }

    console.log('[BOLETOS] Nosso numero', nn, '-> txid:', txid);
    var dados = getBoleto(txid);
    if (!dados) {
      return res.status(404).json({
        erro: 'Dados do boleto nao encontrados na memoria.',
        solucao: 'Os PDFs ja foram anexados automaticamente na fatura Odoo. Verifique os anexos da fatura.'
      });
    }

    var b = await generatePdf(txid);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename=boleto-' + nn + '.pdf');
    res.send(b);
  } catch(e) {
    console.error('[BOLETOS] Erro PDF GET nn:', e.message, e.stack);
    res.status(500).json({ erro: e.message });
  }
});

/**
 * GET /boletos/pdf/:txid
 * Gera PDF pelo txid (somente da memoria)
 * NOTA: Nao consulta Itau pois a API retorna 405 para buscas.
 * Os PDFs devem ser gerados no momento da emissao e anexados ao Odoo.
 */
router.get('/pdf/:txid', async function(req, res) {
  try {
    var txid = req.params.txid;
    console.log('[BOLETOS] PDF GET txid:', txid);
    var dados = getBoleto(txid);
    if (!dados) {
      return res.status(404).json({
        erro: 'Boleto nao encontrado na memoria. O middleware pode ter reiniciado.',
        solucao: 'Os PDFs ja foram anexados automaticamente na fatura Odoo. Verifique os anexos da fatura.'
      });
    }
    var b = await generatePdf(txid);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename=boleto-' + txid + '.pdf');
    res.send(b);
  } catch(e) {
    console.error('[BOLETOS] Erro PDF GET:', e.message, e.stack);
    res.status(500).json({ erro: e.message });
  }
});

/**
 * GET /boletos/info/:nosso_numero
 * AVISO: Itau API retorna 405 para GET search por nosso_numero.
 * Este endpoint nao funciona. Use os campos armazenados no Odoo.
 */
router.get('/info/:nosso_numero', async function(req, res) {
  var nn = req.params.nosso_numero;
  console.log('[BOLETOS] INFO GET nosso_numero:', nn, '(bloqueado - Itau 405)');
  res.status(400).json({
    erro: 'Itau API nao suporta busca por nosso_numero (HTTP 405).',
    solucao: 'Os dados do boleto estao nos campos da fatura Odoo. Use POST /boletos/regen para gerar o PDF.',
    campos_odoo: ['x_studio_itau_nosso_numero', 'x_studio_itau_linha_digitavel', 'x_studio_itau_codigo_barras', 'x_studio_itau_pix_copia_cola', 'x_studio_itau_valor_titulo', 'x_studio_itau_data_vencimento']
  });
});

module.exports = router;
