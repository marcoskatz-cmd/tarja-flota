/**
 * Panel de la tarja (módulo TARJAS de App INGECO), con la piel de la app.
 *
 * Arriba, el resumen del día (tocable para filtrar). Debajo, cuatro pestañas:
 *   Equipos · Mapa · Horas · Fallas
 * Tocar un equipo (en la lista o en el mapa) abre una hoja inferior con su
 * horómetro, sus jornadas, sus fallas y los dos ajustes que existen.
 *
 * Solo entra quien viene desde la app (guard.js deja window.INGECO_SESION).
 */

const app = document.getElementById('app');
const hoja = document.getElementById('hoja');
const hojaCaja = document.getElementById('hojaCaja');
const APP_INGECO = 'https://marcoskatz-cmd.github.io/app-ingeco/';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (v, d) => (v === '' || v == null || !isFinite(Number(v)) ? '—' : Number(v).toLocaleString('es-AR', { maximumFractionDigits: d == null ? 1 : d }));
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
const cmpCod = (a, b) => String(a).localeCompare(String(b), 'es', { numeric: true });

function errorEn(el, e) { el.innerHTML = `<div class="banner">${esc(e.message || e)}</div>`; }

async function pedir(action, datos = {}) {
  if (!window.INGECO_SESION) throw new Error('La sesión venció. Volvé a abrir el panel desde la app INGECO.');
  return API.llamar(action, { ...datos, sesion: window.INGECO_SESION });
}

// ---------- estado ----------

const S = {
  hoy: null,            // respuesta de `hoy`
  config: null,         // equipos_config (todos, incluidos los que no tarjan)
  pend: null,           // pendientes (fallas abiertas) + motivos
  tab: 'equipos',
  kpi: '',              // filtro por número del resumen: '' | abierta | cerrada | sin_tarja | fallas
  buscar: '',
  mes: null             // {anio, mes} de la pestaña Horas
};

const ESTADO = {
  abierta: { orden: 0, txt: (e) => `En curso · ${esc(e.desde)}` },
  cerrada: { orden: 1, txt: (e) => `${num(e.horas)} h hoy` },
  sin_tarja: { orden: 2, txt: () => 'Sin tarja hoy' },
  sin_actividad: { orden: 3, txt: () => 'Sin actividad' }
};

// ---------- arranque ----------

function iniciar() {
  if (!window.INGECO_USUARIO || !window.INGECO_SESION) {
    app.innerHTML = `<div class="bloqueado"><h2>Abrí este panel desde la app INGECO</h2>
      <p class="sub">${esc(window.INGECO_MOTIVO || 'El acceso se da desde la app, no por link.')}</p>
      <a href="${APP_INGECO}">Ir a la app INGECO</a></div>`;
    return;
  }
  cargar();
}

async function cargar() {
  app.innerHTML = '<div class="cargando">Cargando…</div>';
  try {
    [S.hoy, S.config, S.pend] = await Promise.all([pedir('hoy'), pedir('equipos_config'), pedir('pendientes')]);
  } catch (e) { return errorEn(app, e); }
  pintar();
}

function fallasDe(codigo) {
  return S.pend.pendientes.filter((p) => String(p.equipo).toUpperCase() === String(codigo).toUpperCase());
}

// ---------- marco: resumen + pestañas ----------

function pintar() {
  const c = { abierta: 0, cerrada: 0, sin_tarja: 0 };
  S.hoy.equipos.forEach((e) => { if (c[e.estado] != null) c[e.estado]++; });
  const kpi = (id, n, txt) => `<button class="kpi ${id} ${S.kpi === id ? 'activa' : ''}" data-kpi="${id}"><b>${n}</b><span>${txt}</span></button>`;
  const tab = (id, txt, n) => `<button class="${S.tab === id ? 'activa' : ''}" data-tab="${id}">${txt}${n != null ? `<i>${n}</i>` : ''}</button>`;
  const diag = S.hoy.diagnostico || [];

  app.innerHTML = `
    ${diag.length ? `<div class="banner"><b>Revisar planillas:</b> ${diag.slice(0, 2).map((x) => esc(x.detalle)).join(' · ')}</div>` : ''}
    <div class="seccion-t">Hoy · ${esc(fechaLarga(S.hoy.fecha))}</div>
    <div class="kpis">
      ${kpi('abierta', c.abierta, 'en curso')}
      ${kpi('cerrada', c.cerrada, 'cerradas')}
      ${kpi('sin_tarja', c.sin_tarja, 'sin tarja')}
      ${kpi('fallas', S.pend.pendientes.length, 'fallas abiertas')}
    </div>
    <div class="tabs">
      ${tab('equipos', 'Equipos', S.hoy.equipos.length)}
      ${tab('mapa', 'Mapa')}
      ${tab('horas', 'Horas')}
      ${tab('fallas', 'Fallas', S.pend.pendientes.length || null)}
    </div>
    <div id="contenido"></div>`;

  app.querySelectorAll('[data-kpi]').forEach((b) => {
    b.onclick = () => {
      const k = b.dataset.kpi;
      if (k === 'fallas') { S.tab = 'fallas'; S.kpi = ''; }
      else { S.tab = 'equipos'; S.kpi = S.kpi === k ? '' : k; }
      pintar();
    };
  });
  app.querySelectorAll('[data-tab]').forEach((b) => {
    b.onclick = () => { S.tab = b.dataset.tab; if (S.tab !== 'equipos') S.kpi = ''; pintar(); };
  });
  const cont = document.getElementById('contenido');
  ({ equipos: verEquipos, mapa: verMapa, horas: verHoras, fallas: verFallas })[S.tab](cont);
}

function fechaLarga(iso) {
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
}

// ---------- Equipos ----------

function verEquipos(cont) {
  const q = norm(S.buscar);
  const lista = S.hoy.equipos
    .filter((e) => !S.kpi || e.estado === S.kpi)
    .filter((e) => !q || norm([e.codigo, e.descripcion, e.lugar, e.operador].join(' ')).includes(q))
    .sort((a, b) => (ESTADO[a.estado].orden - ESTADO[b.estado].orden) || cmpCod(a.codigo, b.codigo));
  const inactivos = S.config.equipos.filter((e) => String(e.activo_tarja).toUpperCase() !== 'SI').sort((a, b) => cmpCod(a.codigo, b.codigo));

  cont.innerHTML = `
    <div class="fila-acciones">
      <input type="search" id="buscar" placeholder="Buscar equipo, obra u operario" value="${esc(S.buscar)}" autocomplete="off">
    </div>
    ${S.kpi ? `<p class="sub">Mostrando solo: <b>${{ abierta: 'en curso', cerrada: 'cerradas hoy', sin_tarja: 'sin tarja hoy' }[S.kpi]}</b> · <a href="#" id="quitar">ver todos</a></p>` : ''}
    <div class="lista">${lista.map(filaEquipo).join('') || '<div class="vacio">Ningún equipo coincide.</div>'}</div>
    ${!S.kpi && !q && inactivos.length ? `
      <div class="seccion-t">No tarjan (${inactivos.length})</div>
      <div class="lista">${inactivos.map((e) => `
        <button class="fila" data-eq="${esc(e.codigo)}">
          <span class="pt"></span><span class="cod">${esc(e.codigo)}</span>
          <span class="cuerpo"><span class="t">${esc(e.descripcion)}</span></span>
        </button>`).join('')}</div>` : ''}`;

  const b = document.getElementById('buscar');
  b.oninput = () => {
    S.buscar = b.value;
    const pos = b.selectionStart;
    verEquipos(cont);
    const b2 = document.getElementById('buscar'); b2.focus(); b2.setSelectionRange(pos, pos);
  };
  const quitar = document.getElementById('quitar');
  if (quitar) quitar.onclick = (ev) => { ev.preventDefault(); S.kpi = ''; pintar(); };
  cont.querySelectorAll('[data-eq]').forEach((el) => { el.onclick = () => abrirEquipo(el.dataset.eq); });
}

function filaEquipo(e) {
  const fallas = fallasDe(e.codigo).length;
  const meta = e.estado === 'abierta' || e.estado === 'cerrada'
    ? esc(e.operador) + (e.lugar ? ' · ' + esc(e.lugar) : '')
    : (e.ultima_tarja ? `Última ${esc(e.ultima_tarja)}${e.operador ? ' · ' + esc(e.operador) : ''}` : 'Nunca tarjó') + (e.lugar ? ' · ' + esc(e.lugar) : '');
  return `
    <button class="fila" data-eq="${esc(e.codigo)}">
      <span class="pt ${e.estado}"></span>
      <span class="cod">${esc(e.codigo)}</span>
      <span class="cuerpo"><span class="t">${esc(e.descripcion)}</span><span class="m">${meta}</span></span>
      <span class="der">
        <span class="etq ${e.estado}">${ESTADO[e.estado].txt(e)}</span>
        ${fallas ? `<span class="etq falla">${fallas} falla${fallas === 1 ? '' : 's'}</span>` : `<span class="m num">${e.horom_tarja === '' ? '' : num(e.horom_tarja) + ' hs'}</span>`}
      </span>
    </button>`;
}

// ---------- Hoja del equipo ----------

async function abrirEquipo(codigo) {
  hoja.hidden = false;
  hojaCaja.innerHTML = '<div class="cargando">Cargando…</div>';
  let h;
  try { h = await pedir('equipo_historial', { codigo, max: 20 }); }
  catch (e) { return errorEn(hojaCaja, e); }
  const hoyE = S.hoy.equipos.find((x) => x.codigo === h.equipo.codigo);
  const cfg = S.config.equipos.find((x) => x.codigo === h.equipo.codigo) || {};
  const activo = String(cfg.activo_tarja).toUpperCase() === 'SI';
  const fallas = fallasDe(h.equipo.codigo);

  hojaCaja.innerHTML = `
    <div class="cab-eq">
      <div>
        <div class="cod">${esc(h.equipo.codigo)}</div>
        <div>${esc(h.equipo.descripcion)}</div>
        <div class="sub" style="margin:0">${[h.equipo.patente, h.equipo.lugar].filter(Boolean).map(esc).join(' · ')}</div>
      </div>
      <button class="cerrar" id="cerrarHoja" aria-label="Cerrar">✕</button>
    </div>
    <div class="datos">
      <div class="dato"><span>Hoy</span><b>${hoyE ? ESTADO[hoyE.estado].txt(hoyE) : 'No tarja'}</b></div>
      <div class="dato"><span>Horómetro tarja</span><b class="num">${num(h.horom_tarja)}</b></div>
      <div class="dato ${h.diferencia_alta ? 'aviso' : ''}"><span>Horómetro INGECOV</span><b class="num">${num(h.horom_ingecov)}</b></div>
    </div>
    ${h.diferencia_alta ? `<div class="banner">La tarja y el service de INGECOV difieren en <b>${num(h.diferencia, 0)} hs</b>. Conviene revisar cuál está bien.</div>` : ''}
    ${fallas.length ? `
      <div class="seccion-t">Fallas abiertas</div>
      <div class="lista">${fallas.map((f) => filaFalla(f, true)).join('')}</div>` : ''}
    <div class="seccion-t">Últimas jornadas</div>
    <div class="tabla-wrap">
      <table>
        <thead><tr><th>Fecha</th><th>Operario</th><th class="n">Horómetro</th><th class="n">Horas</th><th>Fotos</th><th></th></tr></thead>
        <tbody>${h.tarjas.map((t) => `
          <tr class="${t.estado === 'anulada' ? 'anulada' : ''}">
            <td class="num" style="white-space:nowrap">${esc(String(t.fecha).slice(8, 10) + '/' + String(t.fecha).slice(5, 7))}</td>
            <td>${esc(t.operador)}${t.cierre_tercero === 'SI' ? ' <span class="etq sin_tarja">cerró otro</span>' : ''}${t.excepcion === 'SI' ? ' <span class="etq sin_tarja">corregido</span>' : ''}</td>
            <td class="n">${num(t.horom_ini)} → ${num(t.horom_fin)}</td>
            <td class="n">${t.estado === 'cerrada' ? `<b>${num(t.horas)}</b>` : esc(t.estado)}</td>
            <td>${t.foto_horom_ini ? `<a href="${esc(t.foto_horom_ini)}" target="_blank" rel="noopener">inicio</a>` : ''} ${t.foto_horom_fin ? `<a href="${esc(t.foto_horom_fin)}" target="_blank" rel="noopener">fin</a>` : ''}</td>
            <td>${t.estado === 'anulada' ? '' : `<button class="boton chico" data-anular="${esc(t.id)}">Anular</button>`}</td>
          </tr>`).join('') || '<tr><td colspan="6" class="vacio">Todavía no tiene jornadas.</td></tr>'}
        </tbody>
      </table>
    </div>
    <div class="seccion-t">Ajustes</div>
    <div class="acciones">
      <label style="display:flex;gap:8px;align-items:center">Rodado
        <select id="rodado">
          <option value="" ${!h.equipo.tipo_rodado ? 'selected' : ''}>sin definir</option>
          <option value="oruga" ${h.equipo.tipo_rodado === 'oruga' ? 'selected' : ''}>oruga</option>
          <option value="rodante" ${h.equipo.tipo_rodado === 'rodante' ? 'selected' : ''}>rodante</option>
        </select>
      </label>
      <button class="boton" id="activo">${activo ? 'Este equipo no tarja' : 'Volver a tarjar'}</button>
    </div>`;

  document.getElementById('cerrarHoja').onclick = cerrarHoja;
  enlazarFallas(hojaCaja, () => abrirEquipo(codigo));
  document.getElementById('rodado').onchange = async (ev) => {
    try { await pedir('set_equipo', { codigo, tipo_rodado: ev.target.value }); } catch (e) { alert(e.message); }
  };
  document.getElementById('activo').onclick = async () => {
    try {
      await pedir('set_equipo', { codigo, activo_tarja: activo ? 'NO' : 'SI' });
      cerrarHoja(); await cargar();
    } catch (e) { alert(e.message); }
  };
  hojaCaja.querySelectorAll('[data-anular]').forEach((b) => {
    b.onclick = () => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td colspan="6"><div class="acciones" style="margin:0">
        <input type="text" placeholder="Motivo de la anulación" style="flex:1">
        <button class="boton primario" disabled>Anular</button></div></td>`;
      b.closest('tr').after(tr);
      b.hidden = true;
      const m = tr.querySelector('input'); const ok = tr.querySelector('button');
      m.oninput = () => { ok.disabled = !m.value.trim(); };
      m.focus();
      ok.onclick = async () => {
        ok.disabled = true;
        try { await pedir('anular', { tarja_id: b.dataset.anular, motivo: m.value.trim() }); await recargarSilencioso(); abrirEquipo(codigo); }
        catch (e) { alert(e.message); ok.disabled = false; }
      };
    };
  });
}

function cerrarHoja() { hoja.hidden = true; hojaCaja.innerHTML = ''; }
hoja.onclick = (ev) => { if (ev.target === hoja) cerrarHoja(); };
document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && !hoja.hidden) cerrarHoja(); });

async function recargarSilencioso() {
  [S.hoy, S.config, S.pend] = await Promise.all([pedir('hoy'), pedir('equipos_config'), pedir('pendientes')]);
  pintar();
}

// ---------- Fallas ----------

function filaFalla(p, sinCodigo) {
  return `
    <div class="fila" style="cursor:default">
      <span class="pt sin_tarja"></span>
      ${sinCodigo ? '' : `<span class="cod">${esc(p.equipo)}</span>`}
      <span class="cuerpo"><span class="t">${esc(p.item)}</span>
        <span class="m">${esc(p.comentario || 'Sin comentario')} · ${esc(p.fecha_apertura)}${p.foto ? ` · <a href="${esc(p.foto)}" target="_blank" rel="noopener">foto</a>` : ''}</span></span>
      <span class="der"><select data-falla="${esc(p.id)}" style="width:auto;min-height:36px;font-size:.85rem">
        <option value="">Cerrar como…</option>${S.pend.motivos.map((m) => `<option>${esc(m)}</option>`).join('')}</select></span>
    </div>`;
}

function enlazarFallas(raiz, despues) {
  raiz.querySelectorAll('[data-falla]').forEach((s) => {
    s.onchange = async () => {
      if (!s.value) return;
      s.disabled = true;
      try { await pedir('cerrar_pendiente', { id: s.dataset.falla, motivo: s.value }); await recargarSilencioso(); if (despues) despues(); }
      catch (e) { alert(e.message); s.disabled = false; }
    };
  });
}

function verFallas(cont) {
  const p = S.pend.pendientes;
  cont.innerHTML = p.length
    ? `<p class="sub">Problemas marcados en el checklist que todavía no se resolvieron.</p><div class="lista">${p.map(filaFalla).join('')}</div>`
    : '<div class="vacio">No hay fallas abiertas. Todo al día.</div>';
  enlazarFallas(cont);
}

// ---------- Mapa ----------

let mapa = null;
let capa = null;
const COLOR = { hoy: '#0e8a7a', semana: '#1e3a8a', viejo: '#d98f00' };

function antiguedad(ts) {
  if (!ts) return 'viejo';
  const f = String(ts).slice(0, 10), h = S.hoy.fecha;
  const d = Math.round((Date.UTC(+h.slice(0, 4), +h.slice(5, 7) - 1, +h.slice(8, 10)) - Date.UTC(+f.slice(0, 4), +f.slice(5, 7) - 1, +f.slice(8, 10))) / 86400000);
  return d <= 0 ? 'hoy' : d <= 7 ? 'semana' : 'viejo';
}

async function verMapa(cont) {
  cont.innerHTML = `
    <div id="mapa"></div>
    <div class="leyenda">
      <span><i class="punto" style="background:${COLOR.hoy}"></i> hoy</span>
      <span><i class="punto" style="background:${COLOR.semana}"></i> esta semana</span>
      <span><i class="punto" style="background:${COLOR.viejo}"></i> más antiguo</span>
    </div>
    <p class="sub" id="mapaEstado" style="margin-top:6px">Cargando posiciones…</p>`;
  if (typeof L === 'undefined') { document.getElementById('mapaEstado').textContent = 'No se pudo cargar el mapa.'; return; }
  if (mapa) { mapa.remove(); mapa = null; }
  mapa = L.map('mapa');
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '&copy; OpenStreetMap' }).addTo(mapa);
  capa = L.layerGroup().addTo(mapa);
  mapa.setView([-26.83, -65.22], 8);
  let d;
  try { d = await pedir('mapa'); } catch (e) { document.getElementById('mapaEstado').textContent = e.message; return; }
  const lim = [];
  d.puntos.forEach((p) => {
    const icono = L.divIcon({ className: 'pin-wrap', html: `<div class="pin"><span class="punto" style="background:${COLOR[antiguedad(p.ts_pos)]}"></span>${esc(p.codigo)}</div>`, iconSize: null, iconAnchor: [10, 10] });
    const m = L.marker([p.lat, p.lon], { icon: icono }).addTo(capa);
    m.bindPopup(`<b style="font-size:1rem">${esc(p.codigo)}</b><br>${esc(p.descripcion)}<br>${p.operador ? esc(p.operador) + '<br>' : ''}
      ${p.horom_tarja !== '' ? num(p.horom_tarja) + ' hs · ' : ''}${esc(String(p.ts_pos).slice(0, 16))}<br>
      <a href="#" data-pop="${esc(p.codigo)}">Ver equipo</a>`);
    m.on('popupopen', (ev) => {
      const a = ev.popup.getElement().querySelector('[data-pop]');
      if (a) a.onclick = (e2) => { e2.preventDefault(); abrirEquipo(p.codigo); };
    });
    lim.push([p.lat, p.lon]);
  });
  if (lim.length) mapa.fitBounds(lim, { padding: [30, 30], maxZoom: 14 });
  setTimeout(() => mapa && mapa.invalidateSize(), 60);
  document.getElementById('mapaEstado').textContent = lim.length
    ? `${lim.length} equipo${lim.length === 1 ? '' : 's'} con posición. Sale del GPS de la última foto de horómetro.`
    : 'Todavía ningún equipo mandó una foto con GPS.';
}

// ---------- Horas ----------

async function verHoras(cont) {
  if (!S.mes) { const h = new Date(); S.mes = { anio: h.getFullYear(), mes: h.getMonth() + 1 }; }
  const meses = [];
  const base = new Date();
  for (let i = 0; i < 6; i++) {
    const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
    meses.push({ anio: d.getFullYear(), mes: d.getMonth() + 1, txt: d.toLocaleDateString('es-AR', { month: 'short', year: '2-digit' }) });
  }
  cont.innerHTML = `
    <div class="tabs" style="margin-top:0">${meses.map((m) => `<button class="${m.anio === S.mes.anio && m.mes === S.mes.mes ? 'activa' : ''}" data-mes="${m.anio}-${m.mes}">${esc(m.txt)}</button>`).join('')}</div>
    <div id="horas"><div class="cargando">Cargando…</div></div>`;
  cont.querySelectorAll('[data-mes]').forEach((b) => {
    b.onclick = () => { const [a, m] = b.dataset.mes.split('-'); S.mes = { anio: +a, mes: +m }; verHoras(cont); };
  });
  const box = document.getElementById('horas');
  let d;
  try { d = await pedir('consolidado', S.mes); } catch (e) { return errorEn(box, e); }
  const total = d.filas.reduce((s, f) => s + f.horas, 0);
  const jorn = d.filas.reduce((s, f) => s + f.jornadas, 0);
  box.innerHTML = d.filas.length ? `
    <div class="kpis" style="grid-template-columns:repeat(3,1fr);margin-bottom:10px">
      <div class="kpi"><b>${num(total)}</b><span>horas</span></div>
      <div class="kpi"><b>${jorn}</b><span>jornadas</span></div>
      <div class="kpi"><b>${new Set(d.filas.map((f) => f.codigo)).size}</b><span>equipos</span></div>
    </div>
    <div class="tabla-wrap"><table>
      <thead><tr><th>Equipo</th><th>Obra</th><th class="n">Jornadas</th><th class="n">Horas</th></tr></thead>
      <tbody>${d.filas.slice().sort((a, b) => b.horas - a.horas).map((f) => `
        <tr><td><a href="#" data-eq="${esc(f.codigo)}"><b>${esc(f.codigo)}</b></a> <span class="sub">${esc(f.descripcion)}</span></td>
        <td>${esc(f.lugar)}</td><td class="n">${f.jornadas}</td><td class="n"><b>${num(f.horas)}</b></td></tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="2">Total</td><td class="n">${jorn}</td><td class="n">${num(total)}</td></tr></tfoot>
    </table></div>
    <div class="acciones"><button class="boton" id="csv">Descargar CSV</button></div>`
    : '<div class="vacio">No hay jornadas cerradas en este mes.</div>';
  box.querySelectorAll('[data-eq]').forEach((a) => { a.onclick = (ev) => { ev.preventDefault(); abrirEquipo(a.dataset.eq); }; });
  const csv = document.getElementById('csv');
  if (csv) csv.onclick = () => descargarCSV(d);
}

function descargarCSV(d) {
  const filas = [['Mes', 'Equipo', 'Descripcion', 'Obra', 'Jornadas', 'Horas']]
    .concat(d.filas.map((f) => [f.mes, f.codigo, f.descripcion, f.lugar, f.jornadas, String(f.horas).replace('.', ',')]));
  const csv = '﻿' + filas.map((r) => r.map((v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"').join(';')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `tarjas-${d.anio}-${d.mes}.csv`;
  a.click();
}

// ---------- arranque ----------

if (window.INGECO_USUARIO) iniciar();
else {
  let listo = false;
  document.addEventListener('ingeco:usuario', () => { if (!listo) { listo = true; iniciar(); } });
  setTimeout(() => { if (!listo) { listo = true; iniciar(); } }, 400);
}
