/**
 * routes/boletos.js - v6.9
 * =============================================
 * PDF de Boleto - Regeneracao sob demanda via consulta Itau
 * - POST /boletos/pdf  -> PDF a partir de dados enviados no body
 * - GET  /boletos/pdf/:txid -> PDF pelo txid (memoria ou consulta Itau)
 * - GET  /boletos/pdf/nn/:nn -> PDF pelo nosso_numero (consulta Itau)
 * - GET  /boletos/info/:nn -> Dados do boleto pelo nosso_numero (JSON)
 * =============================================
 * v6.9 - Quando Render dorme e acorda, memoria e zerada.
 *   Agora o GET /pdf/:txid tenta consultar o Itaú antes de dar erro.
 *   Novo endpoint /pdf/nn/:nosso_numero para PDF direto pelo nosso_numero.
 */
const express = require('express');
const router = express.Router();
const { storeBoleto, getBoleto, generatePdf, generatePdfFromData } = require('../services/pdf-boleto');
const { consultarBoletoPorNossoNumero } = require('../services/itau-boleto');

/**
 * Mapa txid -> nosso_numero (para fallback de consulta)
 * Quando o POST /api/pagar emite boletos, guarda o mapping aqui.
 * Se o middleware reiniciar, perdemos este mapa - mas o GET /nn/:nn ainda funciona.
 */
var txidMap = new Map();

function setTxidMapping(txid, nossoNumero) {
  txidMap.set(txid, { nosso_numero: nossoNumero, ts: Date.now() });
}

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
 * GET /boletos/pdf/:txid
 * Gera PDF pelo txid. Se nao estiver na memoria (Render dormiu),
 * consulta o Itau para recuperar os dados e regenera o PDF.
 */
router.get('/pdf/:txid', async function(req, res) {
  try {
    var txid = req.params.txid;
    console.log('[BOLETOS] PDF GET txid:', txid);

    // 1) Tenta pegar da memoria
    var dados = getBoleto(txid);
    if (dados) {
      var b = await generatePdf(txid);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'inline; filename=boleto-' + txid + '.pdf');
      res.send(b);
      return;
    }

    // 2) Memoria vazia (Render dormiu) - tenta consulta Itau pelo nosso_numero
    console.log('[BOLETOS] txid', txid, 'nao na memoria. Tentando fallback...');
    var mapping = txidMap.get(txid);
    if (mapping) {
      console.log('[BOLETOS] Encontrou mapping txid->nosso_numero:', mapping.nosso_numero);
      try {
        var resultado = await consultarBoletoPorNossoNumero(mapping.nosso_numero);
        var response = resultado.dados;
        // A resposta pode ser um array ou objeto
        var boletoData = Array.isArray(response) ? response[0] : (response.data || response);
        if (boletoData) {
          var b = await generatePdfFromData(boletoData);
          res.setHeader('Content-Type', 'application/pdf');
          res.setHeader('Content-Disposition', 'inline; filename=boleto-' + txid + '.pdf');
          res.send(b);
          return;
        }
      } catch (e) {
        console.error('[BOLETOS] Falha na consulta Itau para txid', txid, ':', e.message);
      }
    }

    // 3) Se o txid contem o nosso_numero (formato BL...-P1, etc), extrair
    console.log('[BOLETOS] Nenhuma fallback disponivel para txid:', txid);
    res.status(404).json({
      erro: 'Boleto nao encontrado na memoria. O middleware pode ter reiniciado. Use GET /boletos/pdf/nn/:nosso_numero para regenerar pelo nosso_numero.',
      alternatives: [
        'GET /boletos/pdf/nn/<nosso_numero>',
        'Consulte o campo nosso_numero salvo na fatura Odoo'
      ]
    });
  } catch(e) {
    console.error('[BOLETOS] Erro PDF GET:', e.message, e.stack);
    res.status(500).json({ erro: e.message });
  }
});

/**
 * GET /boletos/pdf/nn/:nosso_numero
 * Gera PDF consultando o Itau diretamente pelo nosso_numero.
 * ENDPOINT PRINCIPAL - Funciona SEMPRE, independente de memoria.
 */
router.get('/pdf/nn/:nosso_numero', async function(req, res) {
  try {
    var nn = req.params.nosso_numero;
    console.log('[BOLETOS] PDF GET pelo nosso_numero:', nn);

    var resultado = await consultarBoletoPorNossoNumero(nn);
    var response = resultado.dados;
    // Resposta pode ser array de boletos ou objeto unico
    var boletoData = Array.isArray(response) ? response[0] : (response.data || response);

    if (!boletoData) {
      return res.status(404).json({ erro: 'Boleto nao encontrado no Itau para nosso_numero: ' + nn });
    }

    var b = await generatePdfFromData(boletoData);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename=boleto-nn-' + nn + '.pdf');
    res.send(b);
  } catch(e) {
    console.error('[BOLETOS] Erro PDF GET nn:', e.message, e.stack);
    res.status(500).json({ erro: e.message });
  }
});

/**
 * GET /boletos/info/:nosso_numero
 * Retorna dados do boleto (JSON) consultando o Itau pelo nosso_numero
 */
router.get('/info/:nosso_numero', async function(req, res) {
  try {
    var nn = req.params.nosso_numero;
    console.log('[BOLETOS] INFO GET pelo nosso_numero:', nn);

    var resultado = await consultarBoletoPorNossoNumero(nn);
    var response = resultado.dados;
    var boletoData = Array.isArray(response) ? response[0] : (response.data || response);

    if (!boletoData) {
      return res.status(404).json({ erro: 'Boleto nao encontrado no Itau para nosso_numero: ' + nn });
    }

    // Extrair dados relevantes
    var ind = (boletoData.dado_boleto && boletoData.dado_boleto.dados_individuais_boleto && boletoData.dado_boleto.dados_individuais_boleto[0]) || {};
    var qr = boletoData.dados_qrcode || {};
    var vc = parseInt(String(ind.valor_titulo || '0'), 10);

    res.json({
      success: true,
      data: {
        nosso_numero: ind.numero_nosso_numero || nn,
        linha_digitavel: ind.numero_linha_digitavel || '',
        codigo_barras: ind.codigo_barras || '',
        pix_copia_cola: qr.emv || '',
        txid: qr.txid || '',
        valor_titulo: (vc / 100).toFixed(2),
        data_vencimento: ind.data_vencimento || '',
        data_emissao: boletoData.data_emissao || '',
        pdf_url: 'https://itau-odoo.onrender.com/boletos/pdf/nn/' + nn
      }
    });
  } catch(e) {
    console.error('[BOLETOS] Erro INFO GET:', e.message, e.stack);
    res.status(500).json({ erro: e.message });
  }
});

// Exportar setTxidMapping para uso pelo api.js
router.setTxidMapping = setTxidMapping;

module.exports = router;
