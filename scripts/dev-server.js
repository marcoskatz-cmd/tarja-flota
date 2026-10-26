/**
 * Servidor de desarrollo: sirve docs/ y expone el backend de Apps Script en
 * /api corriendo en Node con planillas en memoria (mismo arnés que los tests).
 * Uso: node scripts/dev-server.js [puerto]
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { crearContexto, cargarHoja } = require('../test/helpers');

const PUERTO = Number(process.argv[2] || 8123);
const DOCS = path.join(__dirname, '..', 'docs');

const ctx = crearContexto({
  fetch: (url, o) => {
    try {
      const b = JSON.parse(o.payload);
      if (b.accion === 'validar_sesion_modulo') return { ok: true, legajo: 1, nombre_visible: 'Marcos Katz (dev)', es_admin: true, modulos: ['TARJAS'] };
    } catch (e) { }
    return { ok: true };
  }
});
ctx.setupCompleto_();
ctx.setProp_('BOOTSTRAP_KEY', 'dev');
cargarHoja(ctx.ss_(), 'EQUIPOS', ctx.HOJAS.EQUIPOS, [
  { codigo: 'CF-03', descripcion: 'CARGADORA FRONTAL CATERPILLAR 950H', marca: 'CATERPILLAR', modelo: '950H', patente: 'AB123', clasificacion: 'CARGADORA FRONTAL', tipo_rodado: 'rodante', lugar: 'Autovías', activo_tarja: 'SI', horom_tarja: 4800, origen_horom: 'TARJA', ultimo_operador: 'PÉREZ JUAN', ultima_tarja: '2026-10-18', lat: -26.83, lon: -65.22, ts_pos: '2026-10-18 17:00:00' },
  { codigo: 'CF-04', descripcion: 'CARGADORA FRONTAL CATERPILLAR 950H', marca: 'CATERPILLAR', modelo: '950H', patente: 'AB124', clasificacion: 'CARGADORA FRONTAL', tipo_rodado: 'rodante', lugar: 'Autovías', activo_tarja: 'SI', horom_tarja: 3120, origen_horom: 'INGECOV' },
  { codigo: 'EX-01', descripcion: 'EXCAVADORA HIDRAULICA KOMATSU PC200', marca: 'KOMATSU', modelo: 'PC200', patente: '', clasificacion: 'EXCAVADORA HIDRAULICA', tipo_rodado: 'oruga', lugar: 'Corrientes', activo_tarja: 'SI', horom_tarja: 9800, origen_horom: 'TARJA', ultimo_operador: 'GÓMEZ ANA', ultima_tarja: '2026-10-10', lat: -27.47, lon: -58.83, ts_pos: '2026-10-10 18:00:00' },
  { codigo: 'CMN-11', descripcion: 'CAMION MERCEDES BENZ AXOR', marca: 'MERCEDES BENZ', modelo: 'AXOR', patente: 'AC456', clasificacion: 'CAMION', tipo_rodado: 'rodante', lugar: 'Predio', activo_tarja: 'SI', horom_tarja: 1500, origen_horom: 'TARJA' },
  { codigo: 'MN-02', descripcion: 'MOTONIVELADORA CATERPILLAR 140K', marca: 'CATERPILLAR', modelo: '140K', patente: '', clasificacion: 'MOTONIVELADORA', tipo_rodado: 'rodante', lugar: '', activo_tarja: 'SI', horom_tarja: '', origen_horom: '' }
]);
cargarHoja(ctx.ss_(), 'PERSONAL', ctx.HOJAS.PERSONAL, [
  { legajo: '101', nombre: 'PÉREZ JUAN', activo: 'SI' },
  { legajo: '102', nombre: 'GÓMEZ ANA', activo: 'SI' },
  { legajo: '103', nombre: 'RODRÍGUEZ CARLOS', activo: 'SI' },
  { legajo: '104', nombre: 'PERALTA LUIS', activo: 'SI' }
]);

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpeg': 'image/jpeg', '.jpg': 'image/jpeg' };

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/api') {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      let out;
      if (req.method === 'POST') out = ctx.doPost({ postData: { contents: body } });
      else out = ctx.doGet({ parameter: Object.fromEntries(url.searchParams) });
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(out.__texto);
    });
    return;
  }
  let p = url.pathname === '/' ? '/index.html' : url.pathname;
  const archivo = path.join(DOCS, p);
  if (!archivo.startsWith(DOCS) || !fs.existsSync(archivo) || fs.statSync(archivo).isDirectory()) {
    res.writeHead(404); return res.end('no existe');
  }
  let datos = fs.readFileSync(archivo);
  if (p.endsWith('.html')) datos = Buffer.from(datos.toString('utf8').replace(/PENDIENTE_URL_EXEC|https:\/\/script\.google\.com\/macros\/s\/[^']+/g, '/api'));
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  res.end(datos);
}).listen(PUERTO, () => console.log('dev-server en http://localhost:' + PUERTO + ' (API en /api, key=dev)'));
