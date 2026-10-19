/**
 * Corre todos los test/*.test.js. Cada archivo exporta { 'nombre': fn }.
 * Las funciones pueden ser async. Uso: node test/run.js [filtro]
 */
const fs = require('fs');
const path = require('path');

const filtro = process.argv[2] || '';
const archivos = fs.readdirSync(__dirname)
  .filter((f) => f.endsWith('.test.js') && f.includes(filtro))
  .sort();

(async () => {
  let ok = 0;
  const fallos = [];
  for (const f of archivos) {
    const tests = require(path.join(__dirname, f));
    for (const nombre of Object.keys(tests)) {
      try {
        await tests[nombre]();
        ok++;
      } catch (e) {
        fallos.push({ test: f + ' › ' + nombre, error: e && e.stack ? e.stack.split('\n').slice(0, 4).join('\n') : String(e) });
      }
    }
  }
  if (fallos.length) {
    fallos.forEach((x) => console.log('FALLÓ ' + x.test + '\n  ' + x.error.replace(/\n/g, '\n  ')));
    console.log('\n' + fallos.length + ' fallo(s), ' + ok + ' ok');
    process.exit(1);
  }
  console.log('OK ' + ok);
})();
