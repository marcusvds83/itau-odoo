const fs = require('fs');
var old = fs.readFileSync('services/itau-boleto.js', 'utf8');

// Add dados_individuais_boleto array to dado_boleto in montaPayloadBolecode
old = old.replace(
  "aceite: fatura.aceite || 'N',",
  "aceite: fatura.aceite || 'N',\n      dados_individuais_boleto: [{\n        numero_nosso_numero: fatura.nosso_numero || '',\n        data_vencimento: fatura.data_vencimento || '',\n        valor_titulo: String(Math.round((fatura.valor_nominal || 0) * 100)).padStart(17, '0'),\n        texto_uso_beneficiario: '0',\n        texto_seu_numero: fatura.seu_numero || fatura.name || '',\n      }],"
);

fs.writeFileSync('services/itau-boleto.js', old, 'utf8');
console.log('OK - dados_individuais_boleto adicionado');
