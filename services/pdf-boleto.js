var PDFDocument = require('pdfkit');
var bwipjs = null;
try { bwipjs = require('bwip-js'); } catch (e) {}
var store = new Map();
function storeBoleto(t, d) { store.set(t, Object.assign({}, d, { ts: Date.now() })); }
function getBoleto(t) { return store.get(t) || null; }
function fc(v) { var s = String(v||'').replace(/\D/g,''); if(s.length===14) return s.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/,'$1.$2.$3/$4-$5'); if(s.length===11) return s.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})/,'$1.$2.$3-$4'); return v||''; }
function fd(d) { if(!d) return ''; var p=d.split('-'); return p.length===3?p[2]+'/'+p[1]+'/'+p[0]:d; }
function fv(v) { var s=String(v||'0').padStart(15,'0'); var c=parseInt(s.slice(-2),10); var r=parseInt(s.slice(0,-2),10); var val=(r+c/100).toFixed(2); var parts=val.split('.'); return parts[0].replace(/\B(?=(\d{3})+(?!\d))/g,'.')+','+parts[1]; }
function bc(t) { if(!bwipjs) return null; try { return bwipjs.toBufferSync({bcid:'code128',text:t,scale:3,height:20,includetext:false}); } catch(e) { return null; } }
function drawHdr(doc,x,y,pw,d) {
  doc.rect(x,y,pw,32).fill('#EC0000');
  doc.fillColor('#fff').fontSize(15).font('Helvetica-Bold');
  doc.text('BANCO ITAU S.A.',x+8,y+2,{width:180});
  doc.fontSize(11).font('Helvetica').text('341-7',x+8,y+18,{width:180});
  doc.fontSize(7).font('Helvetica-Bold');
  doc.text('AJL COM. ATAC. FERRAGENS E FERRAMENTAS LTDA',x+200,y+3,{width:pw-215});
  doc.font('Helvetica').fontSize(6);
  doc.text('CNPJ: 22.603.750/0001-90',x+200,y+13,{width:pw-215});
  doc.text('Ag: 7764  CC: 22338-9',x+200,y+21,{width:pw-215});
  doc.rect(x,y+32,pw,16).fill('#f5f5f5').stroke('#999');
  doc.fillColor('#333').fontSize(6).font('Helvetica-Bold');
  doc.text('Agencia/Codigo',x+4,y+36,{width:100});
  doc.fillColor('#000').fontSize(8).font('Helvetica-Bold');
  doc.text('7764/776400223389',x+110,y+35,{width:180});
  doc.fillColor('#333').fontSize(6).font('Helvetica-Bold');
  doc.text('Nosso Numero',x+pw-140,y+36,{width:90});
  doc.fillColor('#000').fontSize(8);
  doc.text(d.nosso_numero||'',x+pw-45,y+35,{width:40});
  return y+50;
}
function drawRow(doc,x,y,pw,leftLabel,leftVal,rightLabel,rightVal,bg) {
  doc.rect(x,y,pw,12).fill(bg||'#fff').stroke('#999');
  doc.fillColor('#333').fontSize(6).font('Helvetica-Bold');
  doc.text(leftLabel,x+4,y+3,{width:120});
  doc.fillColor('#000').fontSize(7).font('Helvetica');
  doc.text(leftVal||'',x+4,y+3,{width:280});
  if(rightLabel) {
    doc.fillColor('#333').fontSize(6).font('Helvetica-Bold');
    doc.text(rightLabel,x+pw-180,y+3,{width:100});
    doc.fillColor(rightLabel.indexOf('Valor')>=0?'#EC0000':'#000');
    doc.fontSize(rightLabel.indexOf('Valor')>=0?10:7);
    if(rightLabel.indexOf('Valor')>=0) doc.font('Helvetica-Bold');
    doc.text(rightVal||'',x+pw-80,y+2,{width:75});
  }
  doc.font('Helvetica'); doc.fillColor('#000');
  return y+12;
}
function drawSacado(doc,x,y,pw,d) {
  var h=44;
  doc.rect(x,y,pw,h).fill('#fff').stroke('#999');
  doc.fillColor('#333').fontSize(6).font('Helvetica-Bold').text('Pagador',x+4,y+3,{width:60});
  doc.fillColor('#000').fontSize(8).font('Helvetica-Bold').text(d.nome_pagador||'',x+4,y+13,{width:pw-10});
  doc.fontSize(7).font('Helvetica');
  doc.text((d.tipo_pessoa==='F'?'CPF: ':'CNPJ: ')+fc(d.cpf_cnpj_pagador),x+4,y+24,{width:pw-10});
  doc.text([d.logradouro,d.cidade,d.estado,d.cep].filter(Boolean).join(' - '),x+4,y+34,{width:pw-10});
  doc.font('Helvetica'); return y+h+2;
}
function buildPdf(dados) {
  return new Promise(function(resolve,reject) {
    try {
      var doc = new PDFDocument({size:'A4',margins:{top:10,bottom:10,left:18,right:18}});
      var chunks=[]; doc.on('data',function(c){chunks.push(c);});
      var W=doc.page.width,M=18,pw=W-M*2,x=M,y=M;
      // RECIBO
      y=drawHdr(doc,x,y,pw,dados);
      y=drawRow(doc,x,y,pw,'Local Pagamento','Pagavel em qualquer banco','Vencimento',fd(dados.data_vencimento));
      y=drawRow(doc,x,y,pw,'Cedente','AJL COM. ATAC. FERRAGENS E FERRAMENTAS LTDA','Agencia/Codigo','7764/776400223389','#fafafa');
      y=drawRow(doc,x,y,pw,'Data Doc.',fd(dados.data_emissao),'No.Documento',dados.seu_numero);
      y=drawRow(doc,x,y,pw,'Nosso Numero','7764/109/'+dados.nosso_numero,'(=) Valor','R$ '+fv(dados.valor_titulo),'#fafafa');
      y=drawSacado(doc,x,y,pw,dados);
      var bb=bc(dados.codigo_barras);
      if(bb){doc.rect(x,y,pw,55).fill('#fff').stroke('#ccc');doc.image(bb,x+8,y+3,{width:pw-16,height:49});y+=57;}
      doc.rect(x,y,pw,24).fill('#f0fff0').stroke('#00aa00');
      doc.fillColor('#005500').fontSize(6).font('Helvetica-Bold').text('Linha Digitavel',x+4,y+3);
      doc.fontSize(13).font('Courier-Bold').text(dados.linha_digitavel||'',x+4,y+10,{width:pw-8,align:'center'});y+=26;
      // CORTE
      doc.moveTo(x,y).lineTo(x+pw,y).lineWidth(0.8).dash(3,{space:2}).stroke('#666');doc.undash();
      doc.fillColor('#999').fontSize(5).text('FICHA DE COMPENSACAO',x+4,y+2,{width:pw-8,align:'center'});y+=10;
      // COMPENSACAO
      y=drawHdr(doc,x,y,pw,dados);
      y=drawRow(doc,x,y,pw,'Local Pagamento','Pagavel em qualquer banco','Vencimento',fd(dados.data_vencimento));
      y=drawRow(doc,x,y,pw,'Cedente','AJL COM. ATAC. FERRAGENS E FERRAMENTAS LTDA','Agencia/Codigo','7764/776400223389','#fafafa');
      y=drawRow(doc,x,y,pw,'Data Doc.',fd(dados.data_emissao),'No.Documento',dados.seu_numero);
      y=drawRow(doc,x,y,pw,'Nosso Numero','7764/109/'+dados.nosso_numero,'(=) Valor','R$ '+fv(dados.valor_titulo),'#fafafa');
      y=drawSacado(doc,x,y,pw,dados);
      if(bb){doc.rect(x,y,pw,55).fill('#fff').stroke('#ccc');doc.image(bb,x+8,y+3,{width:pw-16,height:49});y+=57;}
      doc.rect(x,y,pw,24).fill('#f0fff0').stroke('#00aa00');
      doc.fillColor('#005500').fontSize(6).font('Helvetica-Bold').text('Linha Digitavel',x+4,y+3);
      doc.fontSize(13).font('Courier-Bold').text(dados.linha_digitavel||'',x+4,y+10,{width:pw-8,align:'center'});y+=26;
      // PIX QR
      if(dados.qrcode_base64){try{doc.image(Buffer.from(dados.qrcode_base64,'base64'),x,y,{width:100,height:100});}catch(e){}}
      doc.rect(x,y+105,pw,28).fill('#f5f5ff').stroke('#9999cc');
      doc.fillColor('#333').fontSize(5).font('Helvetica-Bold').text('PIX Copia e Cola:',x+105,y+108,{width:pw-115});
      doc.fillColor('#000').fontSize(5).font('Courier').text(dados.pix_copia_cola||'',x+105,y+118,{width:pw-120});
      doc.end(); doc.on('end',function(){resolve(Buffer.concat(chunks));});
    } catch(err){reject(err);}
  });
}
async function generatePdf(txid){var d=getBoleto(txid);if(!d)throw new Error('Expirado');return buildPdf(d);}
async function generatePdfFromData(data){var i=(data.dado_boleto&&data.dado_boleto.dados_individuais_boleto&&data.dado_boleto.dados_individuais_boleto[0])||{};var q=data.dados_qrcode||{};return buildPdf({txid:q.txid||'',nosso_numero:i.numero_nosso_numero||'',linha_digitavel:i.numero_linha_digitavel||'',codigo_barras:i.codigo_barras||'',data_vencimento:i.data_vencimento||'',data_emissao:data.data_emissao||'',valor_titulo:i.valor_titulo||'',pix_copia_cola:q.emv||'',qrcode_base64:q.base64||'',nome_pagador:data.nome_pagador||'',cpf_cnpj_pagador:data.cpf_cnpj_pagador||'',tipo_pessoa:data.tipo_pessoa||'',logradouro:data.logradouro||'',cidade:data.cidade||'',estado:data.estado||'',cep:data.cep||'',seu_numero:data.seu_numero||''});}
module.exports={storeBoleto,getBoleto,generatePdf,generatePdfFromData};
