/**
 * routes/api.js - v6.9
 * =============================================
 * API de Pagamento - Suporte a boleto parcelado
 * - Parse forma_pagamento para detectar parcelas
 * - Emite N boletos (um por parcela)
 * - Retorna array com todos os boletos
 * - URL permanente: /boletos/pdf/nn/:nosso_numero (funciona apos restart)
 * - salva mapping txid->nosso_numero para fallback
 * =============================================
 */
const express = require('express');
const router = express.Router();
const { authenticateApiKey } = require('../middleware/auth');
const { emitirBoleto, parseFormaPagamento } = require('../services/itau-boleto');
const { storeBoleto } = require('../services/pdf-boleto');

/** Reference to boleto routes for txid mapping */
var boletoRoutesRef = null;
function setBoletoRoutesRef(ref) { boletoRoutesRef = ref; }
router.setBoletoRoutesRef = setBoletoRoutesRef;

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
    var fat = d.fatura || {};
    var pag = d.pagador || {};
    var formaPag = d.forma_pagamento || '';
    var valorTotal = parseFloat(fat.valor_nominal) || 0;

    console.log('[API] === NOVA REQUISICAO DE PAGAMENTO ===');
    console.log('[API] Forma pagamento:', formaPag);
    console.log('[API] Valor total: R$', valorTotal.toFixed(2));

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

    // Payload base (dados do pagador)
    var basePayload = {
      cpfCnpjPagador: pag.cpf_cnpj || '',
      nomePagador: pag.nome || '',
      numeroPedido: fat.seu_numero || fat.name || '',
      dataVencimento: fat.data_vencimento || '',
      logradouro: pag.street || '',
      cidade: pag.city || '',
      estado: pag.state || '',
      cep: pag.zip || ''
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
      var dataVenc = calcDataVenc(fat.data_vencimento, parc.dias);

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

      // Salvar mapping txid -> nosso_numero (para fallback no /pdf/:txid)
      if (nossoNumero && boletoRoutesRef && boletoRoutesRef.setTxidMapping) {
        boletoRoutesRef.setTxidMapping(txid, nossoNumero);
      }

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
        pdf_url: 'https://itau-odoo.onrender.com/boletos/pdf/nn/' + nossoNumero,
        info_url: 'https://itau-odoo.onrender.com/boletos/info/' + nossoNumero
      });

      console.log('[API]   Parcela ' + parc.numero + ' OK: txid=' + txid + ' NN=' + nossoNumero);
    }

    console.log('[API] === ' + totalP + ' BOLETO(S) EMITIDO(S) COM SUCESSO ===');

    res.json({
      success: true,
      data: {
        forma_pagamento: formaPag,
        total_parcelas: totalP,
        valor_total: valorTotal.toFixed(2),
        pagamentos: pagamentos
      }
    });

  } catch (e) {
    console.error('[API] ERRO:', e.message);
    res.json({ success: false, message: e.message });
  }
});

module.exports = router;
