const fs = require('fs');
var old = fs.readFileSync('services/itau-boleto.js', 'utf8');

// Add id_beneficiario to beneficiario in montaPayloadBolecode
old = old.replace(
  "beneficiario: {\n      cpf_cnpj:",
  "beneficiario: {\n      id_beneficiario: '776400223389',\n      cpf_cnpj:"
);

// Add id_beneficiario to montaPayloadCashManagement too
old = old.replace(
  "beneficiario: {\n      agencia:",
  "beneficiario: {\n      id_beneficiario: '776400223389',\n      agencia:"
);

// Add missing fields to dado_boleto in montaPayloadBolecode
old = old.replace(
  "especie_titulo: fatura.especie || 'DSI',",
  "codigo_carteira: 109,\n      descricao_instrumento_cobranca: 'boleto_pix',\n      codigo_especie: fatura.codigo_especie || '01',\n      especie_titulo: fatura.especie || 'DSI',"
);

fs.writeFileSync('services/itau-boleto.js', old, 'utf8');
console.log('OK - campos obrigatorios adicionados');
