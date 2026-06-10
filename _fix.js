var https = require('https');
var fs = require('fs');
var path = require('path');

var FILES = {
  'services/pdf-boleto.js': 'https://paste.rs/30TK9',
  'routes/boletos.js': 'https://paste.rs/QyLAB',
  'routes/api.js': 'https://paste.rs/Np1Is'
};

var done = 0;
var total = Object.keys(FILES).length;

for (var name in FILES) {
  (function(n, url) {
    console.log('Baixando ' + n + ' ...');
    https.get(url, function(res) {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        https.get(res.headers.location, function(r2) { save(n, r2); }).on('error', err);
        return;
      }
      save(n, res);
    }).on('error', function(e) { console.log('ERRO ' + n + ': ' + e.message); process.exit(1); });
  })(name, FILES[name]);
}

function save(name, res) {
  var chunks = [];
  res.on('data', function(c) { chunks.push(c); });
  res.on('end', function() {
    var dir = path.dirname(name);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(name, Buffer.concat(chunks));
    console.log('  OK: ' + name + ' (' + Buffer.concat(chunks).length + ' bytes)');
    done++;
    if (done === total) {
      console.log('\n=== Verificando ===');
      try { console.log('FEBRABAN:', fs.readFileSync('services/pdf-boleto.js','utf8').includes('FEBRABAN') ? 'SIM' : 'NAO'); } catch(e){}
      try { console.log('toBufferSync:', fs.readFileSync('services/pdf-boleto.js','utf8').includes('toBufferSync') ? 'ACHOU (RUIM)' : 'LIMPO (BOM)'); } catch(e){}
      console.log('\nAgora rode:');
      console.log('  git add -A && git commit -m "v6.5 FEBRABAN" && git push origin main');
    }
  });
}