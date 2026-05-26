const fs = require('fs');
let c = fs.readFileSync('services/itau-api.js', 'utf8');
c = c.replace(
  "'x-itau-apikey': config.itau.clientId,",
  "'x-itau-apikey': config.itau.clientId,\n    'x-itau-flowID': '1',\n    'x-itau-correlationID': String(Date.now()),"
);
fs.writeFileSync('services/itau-api.js', c);
console.log('itau-api.js atualizado com headers');

c = fs.readFileSync('services/itau-boleto.js', 'utf8');
c = c.replace(
  "console.log('[BOLETO] Payload Boleto |",
  "console.log('[BOLETO] Payload completo:', JSON.stringify(payload, null, 2));\n  console.log('[BOLETO] Payload Boleto |"
);
fs.writeFileSync('services/itau-boleto.js', c);
console.log('itau-boleto.js atualizado com log completo');
