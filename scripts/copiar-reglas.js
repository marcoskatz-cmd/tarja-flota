// Copia apps-script/Reglas.gs a docs/reglas.js: el front y el backend usan las
// mismas reglas puras. El test front-reglas verifica que estén idénticas.
const fs = require('fs');
const path = require('path');
const raiz = path.join(__dirname, '..');
fs.copyFileSync(path.join(raiz, 'apps-script', 'Reglas.gs'), path.join(raiz, 'docs', 'reglas.js'));
console.log('docs/reglas.js actualizado');
