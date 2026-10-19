/**
 * Mapa del panel: un marcador por equipo en su última posición conocida.
 * Color por antigüedad del dato (hoy teal, esta semana azul, más viejo ámbar):
 * paleta apta para daltonismo rojo-verde, y además el popup dice la fecha.
 */
(function () {
  const COLOR = { hoy: '#0f766e', semana: '#1e3a8a', viejo: '#b45309' };

  function antiguedad(tsPos, hoy) {
    if (!tsPos) return 'viejo';
    const f = String(tsPos).slice(0, 10);
    const d = Math.round((Date.UTC(+hoy.slice(0, 4), +hoy.slice(5, 7) - 1, +hoy.slice(8, 10)) -
      Date.UTC(+f.slice(0, 4), +f.slice(5, 7) - 1, +f.slice(8, 10))) / 86400000);
    return d <= 0 ? 'hoy' : d <= 7 ? 'semana' : 'viejo';
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  let mapa = null;
  let capa = null;

  /** Dibuja (o redibuja) el mapa dentro de #mapa con los puntos dados. */
  function dibujar(puntos, hoy, alElegirEquipo) {
    if (typeof L === 'undefined') throw new Error('No se pudo cargar el mapa. Revisá la conexión.');
    const cont = document.getElementById('mapa');
    if (!cont) return;
    if (mapa) { mapa.remove(); mapa = null; }
    mapa = L.map(cont, { zoomControl: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18, attribution: '&copy; OpenStreetMap'
    }).addTo(mapa);
    capa = L.layerGroup().addTo(mapa);
    const limites = [];
    puntos.forEach((p) => {
      const ant = antiguedad(p.ts_pos, hoy);
      const icono = L.divIcon({
        className: 'marcador-eq',
        html: `<div class="pin"><span class="punto" style="background:${COLOR[ant]}"></span>${esc(p.codigo)}</div>`,
        iconSize: null, iconAnchor: [10, 10]
      });
      const m = L.marker([p.lat, p.lon], { icon: icono }).addTo(capa);
      m.bindPopup(`
        <strong style="font-size:1.05rem">${esc(p.codigo)}</strong><br>
        ${esc(p.descripcion)}<br>
        ${p.lugar ? 'Obra: ' + esc(p.lugar) + '<br>' : ''}
        ${p.operador ? 'Operario: ' + esc(p.operador) + '<br>' : ''}
        ${p.horom_tarja !== '' ? 'Horómetro: ' + esc(p.horom_tarja) + ' hs<br>' : ''}
        Posición: ${esc(String(p.ts_pos || '').slice(0, 16))}<br>
        <a href="#" data-eq="${esc(p.codigo)}">Ver historial</a>`);
      m.on('popupopen', (ev) => {
        const a = ev.popup.getElement().querySelector('[data-eq]');
        if (a) a.onclick = (e) => { e.preventDefault(); alElegirEquipo(p.codigo); };
      });
      limites.push([p.lat, p.lon]);
    });
    if (limites.length) mapa.fitBounds(limites, { padding: [30, 30], maxZoom: 14 });
    else mapa.setView([-26.83, -65.22], 7);
    setTimeout(() => mapa.invalidateSize(), 50);
  }

  window.PanelMapa = { dibujar, antiguedad, COLOR };
})();
