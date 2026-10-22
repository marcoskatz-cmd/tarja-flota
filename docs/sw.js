/**
 * Service worker: cachea el armazón de la app para que abra sin señal.
 *
 * A la API NO se le hace caché nunca: los datos de referencia se guardan en
 * localStorage (datos.js) y lo que no se puede enviar queda en IndexedDB.
 * Las teselas del mapa (panel) tampoco se cachean.
 */

const CACHE = 'tarja-flota-v6';
// Los assets van con ?v=N igual que en el HTML. Al publicar un cambio hay que
// subir el número acá y en index.html, panel.html y ayuda.html.
const V = '7';
const COMUN = 'https://app.ingecosa.com.ar/ingeco.';
const ARMAZON = [
  './',
  './index.html',
  './ayuda.html',
  './manifest.json',
  './icono.svg',
  './icono-maskable.svg',
  './logos/ingeco.png',
  './estilo.css?v=' + V,
  './reglas.js?v=' + V,
  './cola.js?v=' + V,
  './api.js?v=' + V,
  './datos.js?v=' + V,
  './identidad.js?v=' + V,
  './selector.js?v=' + V,
  './camara.js?v=' + V,
  './app.js?v=' + V
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARMAZON)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.hostname.indexOf('script.google.com') !== -1) return;
  if (url.hostname.indexOf('tile.openstreetmap.org') !== -1 || url.hostname.indexOf('unpkg.com') !== -1) return;

  // Estilo común de la App INGECO (ingeco.css / ingeco.js): red primero, caché solo sin señal.
  // Sin respaldo a index.html: si no hay copia, que falle y quede el respaldo mínimo del <head>.
  if (e.request.url.startsWith(COMUN)) {
    e.respondWith(
      fetch(e.request, { cache: 'no-cache' })
        .then((r) => { if (r && r.ok) { const copia = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copia)); } return r; })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // Red primero (sin caché HTTP de Pages) para tener la última versión; caché como red de seguridad.
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' })
      .then((r) => {
        const copia = r.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copia));
        return r;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('./index.html')))
  );
});
