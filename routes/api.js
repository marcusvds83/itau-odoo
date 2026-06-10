const express = require('express');
const router = express.Router();
const { authenticateApiKey } = require('../middleware/auth');
const { emitirBoleto } = require('../services/itau-boleto');
const { storeBoleto } = require('../services/pdf-boleto');
router.post('/pagar', authenticateApiKey, async function(req, res) {
  try {
    var d = req.body; var fat = d.fatura||{}; var pag = d.pagador||{};
    var payload = { valor: fat.valor_nominal||0, cpfCnpjPagador: pag.cpf_cnpj||'', nomePagador: pag.nome||'', numeroPedido: fat.seu_numero||fat.name||'', dataVencimento: fat.data_vencimento||'', logradouro: pag.street||'', cidade: pag.city||'', estado: pag.state||'', cep: pag.zip||'' };
    var resultado = await emitirBoleto(payload);
    var dados = resultado.dados&&resultado.dados.data?resultado.dados.data:{};
    var ind = (dados.dado_boleto&&dados.dado_boleto.dados_individuais_boleto&&dados.dado_boleto.dados_individuais_boleto[0])||{};
    var qr = dados.dados_qrcode||{}; var txid = qr.txid||('BL'+Date.now());
    storeBoleto(txid, { txid:txid, nosso_numero:ind.numero_nosso_numero||'', linha_digitavel:ind.numero_linha_digitavel||'', codigo_barras:ind.codigo_barras||'', data_vencimento:ind.data_vencimento||'', data_emissao:dados.dado_boleto?dados.dado_boleto.data_emissao:'', valor_titulo:ind.valor_titulo||'', pix_copia_cola:qr.emv||'', qrcode_base64:qr.base64||'', nome_pagador:payload.nomePagador, cpf_cnpj_pagador:payload.cpfCnpjPagador, logradouro:payload.logradouro, cidade:payload.cidade, estado:payload.estado, cep:payload.cep, seu_numero:payload.numeroPedido });
    var vc=parseInt(String(ind.valor_titulo||'0'),10); res.json({ success:true, data:{ pagamentos:[{ tipo:'boleto', nosso_numero:ind.numero_nosso_numero||'', linha_digitavel:ind.numero_linha_digitavel||'', codigo_barras:ind.codigo_barras||'', pix_copia_cola:qr.emv||'', txid:txid, valor_titulo:(vc/100).toFixed(2), pdf_url:'https://itau-odoo.onrender.com/boletos/pdf/'+txid }] } });
  } catch(e) { res.json({ success:false, message:e.message }); }
});
module.exports = router;
