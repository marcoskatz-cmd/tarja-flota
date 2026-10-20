/**
 * Panel de la tarja: un listado de equipos, nada más.
 *
 * Cada fila dice cómo está el equipo hoy. Tocándola se despliega con sus
 * últimas jornadas, las fallas abiertas y los dos ajustes que existen (rodado
 * y si tarja o no). El mapa vive en el panel de INGECOV.
 *
 * Solo entra quien viene desde la app INGECO (guard.js deja window.INGECO_SESION).
 */

const app = document.getElementById('app');
const hQuien = document.getElementById('hQuien');
const btnActualizar = document.getElementById('btnActualizar');
const APP_INGECO = 'https://marcoskatz-cmd.github.io/app-ingeco/';

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function aviso(tipo, texto) { return `<div class="aviso ${tipo}">${texto}</div>`; }
function num(v, dec) { return v === '' || v == null || !isFinite(Number(v)) ? '—' : Number(v).toLocaleString('es-AR', { maximumFractionDigits: dec == null ? 1 : dec }); }
function norm(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase(); }

function conError(fn) {
  return async (...args) => {
    try { await fn(...args); }
    catch (e) {
      const d = document.createElement('div');
      d.className = 'aviso error';
      d.textContent = e.message;
      app.prepend(d);
      window.scrollTo(0, 0);
    }
  };
}

async function pedir(action, datos = {}) {
  if (!window.INGECO_SESION) throw new Error('La sesión venció. Volvé a abrir el panel desde la app INGECO.');
  return API.llamar(action, { ...datos, sesion: window.INGECO_SESION });
}

// ---------- estado ----------

let datos = null;      // respuesta de `hoy`
let config = null;     // equipos_config (incluye los que no tarjan)
let filtro = '';
let abierto = '';      // código del equipo desplegado

const ESTADO = {
  abierta: { orden: 0, chip: 'azul', texto: (e) => `En curso desde ${esc(e.desde)}` },
  cerrada: { orden: 1, chip: 'ok', texto: (e) => `${num(e.horas)} h hoy` },
  sin_tarja: { orden: 2, chip: 'alerta', texto: () => 'Sin tarja hoy' },
  sin_actividad: { orden: 3, chip: '', texto: () => 'Sin actividad' }
};

// ---------- arranque ----------

function iniciar() {
  if (!window.INGECO_USUARIO || !window.INGECO_SESION) {
    app.innerHTML = `
      <div class="bloqueado">
        <h2>Abrí este panel desde la app INGECO</h2>
        <p class="ayuda">${esc(window.INGECO_MOTIVO || 'El acceso se da desde la app, no por link.')}</p>
        <a href="${APP_INGECO}">Ir a la app INGECO</a>
      </div>`;
    return;
  }
  hQuien.textContent = window.INGECO_USUARIO.nombre_visible || '';
  btnActualizar.hidden = false;
  btnActualizar.onclick = () => cargar();
  cargar();
}

const cargar = conError(async () => {
  app.innerHTML = '<div class="cargando">Cargando…</div>';
  [datos, config] = await Promise.all([pedir('hoy'), pedir('equipos_config')]);
  pintar();
});

// ---------- listado ----------

function pintar() {
  const lista = datos.equipos
    .filter((e) => !filtro || norm([e.codigo, e.descripcion, e.lugar, e.operador].join(' ')).includes(norm(filtro)))
    .sort((a, b) => (ESTADO[a.estado].orden - ESTADO[b.estado].orden) || a.codigo.localeCompare(b.codigo, 'es', { numeric: true }));
  const cuenta = { abierta: 0, cerrada: 0, sin_tarja: 0, sin_actividad: 0 };
  datos.equipos.forEach((e) => { cuenta[e.estado]++; });
  const inactivos = config.equipos.filter((e) => String(e.activo_tarja).toUpperCase() !== 'SI')
    .sort((a, b) => String(a.codigo).localeCompare(String(b.codigo), 'es', { numeric: true }));

  app.innerHTML = `
    ${datos.diagnostico && datos.diagnostico.length ? aviso('alerta', '<strong>Revisar planillas:</strong> ' + datos.diagnostico.slice(0, 2).map((x) => esc(x.detalle)).join(' · ')) : ''}
    <div class="cabecera-lista">
      <input type="search" id="buscar" placeholder="Buscar equipo, obra u operario" value="${esc(filtro)}" autocomplete="off">
      <p class="ayuda">Hoy ${esc(datos.fecha)}: <strong>${cuenta.abierta}</strong> en curso · <strong>${cuenta.cerrada}</strong> cerradas · <strong>${cuenta.sin_tarja}</strong> sin tarja</p>
    </div>
    <div class="lista-eq">
      ${lista.map(fila).join('') || '<div class="tenue" style="padding:1rem">Ningún equipo coincide.</div>'}
    </div>
    ${inactivos.length ? `
      <details class="inactivos">
        <summary>Equipos que no tarjan (${inactivos.length})</summary>
        ${inactivos.map((e) => `
          <div class="fila-inactiva">
            <span><strong>${esc(e.codigo)}</strong> <span class="tenue">${esc(e.descripcion)}</span></span>
            <button class="chip" data-reactivar="${esc(e.codigo)}">Volver a tarjar</button>
          </div>`).join('')}
      </details>` : ''}
    <p class="pie-panel"><a href="#" id="csv">Descargar las horas del mes (CSV)</a></p>
  `;

  const buscar = document.getElementById('buscar');
  buscar.oninput = () => {
    filtro = buscar.value;
    const pos = buscar.selectionStart;
    pintar();
    const b = document.getElementById('buscar');
    b.focus(); b.setSelectionRange(pos, pos);
  };
  app.querySelectorAll('[data-fila]').forEach((el) => {
    el.onclick = () => desplegar(el.dataset.fila);
  });
  app.querySelectorAll('[data-reactivar]').forEach((b) => {
    b.onclick = conError(async () => { await pedir('set_equipo', { codigo: b.dataset.reactivar, activo_tarja: 'SI' }); await cargar(); });
  });
  document.getElementById('csv').onclick = conError(async (ev) => { ev.preventDefault(); await descargarCSV(); });
  if (abierto) desplegar(abierto, true);
}

function fila(e) {
  const est = ESTADO[e.estado];
  const detalle = e.estado === 'sin_actividad' || e.estado === 'sin_tarja'
    ? (e.ultima_tarja ? `Última: ${esc(e.ultima_tarja)}${e.operador ? ' · ' + esc(e.operador) : ''}` : 'Nunca tarjó')
    : esc(e.operador);
  return `
    <div class="eq-fila ${e.estado}" id="eq-${esc(e.codigo)}">
      <button class="eq-cab" data-fila="${esc(e.codigo)}" aria-expanded="false">
        <span class="eq-cod">${esc(e.codigo)}</span>
        <span class="eq-desc">${esc(e.descripcion)}<span class="tenue">${e.lugar ? ' · ' + esc(e.lugar) : ''}</span><br><span class="tenue">${detalle}</span></span>
        <span class="eq-der">
          <span class="chip ${est.chip}">${est.texto(e)}</span>
          ${e.problemas_hoy || e.pendientes_abiertos ? `<span class="chip alerta">${e.pendientes_abiertos} falla${e.pendientes_abiertos === 1 ? '' : 's'}</span>` : ''}
          <span class="tenue eq-horom">${e.horom_tarja === '' ? '' : num(e.horom_tarja) + ' hs'}</span>
        </span>
      </button>
      <div class="eq-det" hidden></div>
    </div>`;
}

// ---------- detalle de un equipo ----------

async function desplegar(codigo, reabrir) {
  const caja = document.getElementById('eq-' + codigo);
  if (!caja) return;
  const det = caja.querySelector('.eq-det');
  const cab = caja.querySelector('.eq-cab');
  if (!reabrir && abierto === codigo && !det.hidden) { det.hidden = true; cab.setAttribute('aria-expanded', 'false'); abierto = ''; return; }
  if (abierto && abierto !== codigo) {
    const prev = document.getElementById('eq-' + abierto);
    if (prev) { prev.querySelector('.eq-det').hidden = true; prev.querySelector('.eq-cab').setAttribute('aria-expanded', 'false'); }
  }
  abierto = codigo;
  det.hidden = false;
  cab.setAttribute('aria-expanded', 'true');
  det.innerHTML = '<div class="cargando">Cargando…</div>';
  try {
    const [h, f] = await Promise.all([pedir('equipo_historial', { codigo, max: 15 }), pedir('pendientes')]);
    const fallas = f.pendientes.filter((p) => String(p.equipo).toUpperCase() === codigo.toUpperCase());
    det.innerHTML = detalle(h, fallas, f.motivos);
    enlazarDetalle(det, codigo);
  } catch (e) {
    det.innerHTML = aviso('error', esc(e.message));
  }
}

function detalle(h, fallas, motivos) {
  return `
    ${h.diferencia_alta ? aviso('alerta', `La tarja dice <strong>${num(h.horom_tarja)} hs</strong> y el service de INGECOV <strong>${num(h.horom_ingecov)} hs</strong>. Conviene revisar cuál está bien.`) : ''}
    ${fallas.length ? `
      <div class="bloque">
        <strong>Fallas abiertas</strong>
        ${fallas.map((p) => `
          <div class="fila">
            <span>${esc(p.item)}<br><span class="tenue">${esc(p.comentario || '')} · ${esc(p.fecha_apertura)}</span>${p.foto ? ` · <a href="${esc(p.foto)}" target="_blank" rel="noopener">foto</a>` : ''}</span>
            <select data-falla="${esc(p.id)}"><option value="">Cerrar como…</option>${motivos.map((m) => `<option>${esc(m)}</option>`).join('')}</select>
          </div>`).join('')}
      </div>` : ''}
    <div class="bloque scroll-x">
      <table>
        <thead><tr><th>Fecha</th><th>Operario</th><th class="num">Horómetro</th><th class="num">Horas</th><th>Fotos</th><th></th></tr></thead>
        <tbody>
          ${h.tarjas.map((t) => `
            <tr class="${t.estado === 'anulada' ? 'anulada' : ''}">
              <td>${esc(t.fecha)}</td>
              <td>${esc(t.operador)}${t.cierre_tercero === 'SI' ? ' <span class="chip alerta">cerró otro</span>' : ''}</td>
              <td class="num">${num(t.horom_ini)} → ${num(t.horom_fin)}</td>
              <td class="num">${t.estado === 'cerrada' ? `<strong>${num(t.horas)}</strong>` : esc(t.estado)}</td>
              <td>${t.foto_horom_ini ? `<a href="${esc(t.foto_horom_ini)}" target="_blank" rel="noopener">inicio</a>` : ''} ${t.foto_horom_fin ? `<a href="${esc(t.foto_horom_fin)}" target="_blank" rel="noopener">fin</a>` : ''}</td>
              <td>${t.estado === 'anulada' ? '' : `<button class="chip" data-anular="${esc(t.id)}">Anular</button>`}</td>
            </tr>`).join('') || '<tr><td colspan="6" class="tenue">Todavía no tiene jornadas.</td></tr>'}
        </tbody>
      </table>
    </div>
    <div class="ajustes">
      <label>Rodado
        <select data-rodado>
          <option value="" ${!h.equipo.tipo_rodado ? 'selected' : ''}>sin definir</option>
          <option value="oruga" ${h.equipo.tipo_rodado === 'oruga' ? 'selected' : ''}>oruga</option>
          <option value="rodante" ${h.equipo.tipo_rodado === 'rodante' ? 'selected' : ''}>rodante</option>
        </select>
      </label>
      <button class="chip" data-no-tarja>Este equipo no tarja</button>
    </div>`;
}

function enlazarDetalle(det, codigo) {
  det.querySelectorAll('[data-falla]').forEach((s) => {
    s.onchange = conError(async () => {
      if (!s.value) return;
      await pedir('cerrar_pendiente', { id: s.dataset.falla, motivo: s.value });
      await cargar();
    });
  });
  det.querySelectorAll('[data-anular]').forEach((b) => {
    b.onclick = () => {
      const fila = b.closest('tr');
      const tr = document.createElement('tr');
      tr.innerHTML = `<td colspan="6"><input type="text" placeholder="Motivo de la anulación" style="width:100%">
        <div style="height:.4rem"></div><button class="principal" disabled>Anular la jornada</button></td>`;
      fila.after(tr);
      b.hidden = true;
      const m = tr.querySelector('input');
      const ok = tr.querySelector('button');
      m.oninput = () => { ok.disabled = !m.value.trim(); };
      m.focus();
      ok.onclick = conError(async () => { ok.disabled = true; await pedir('anular', { tarja_id: b.dataset.anular, motivo: m.value.trim() }); await cargar(); });
    };
  });
  det.querySelector('[data-rodado]').onchange = conError(async (ev) => {
    await pedir('set_equipo', { codigo, tipo_rodado: ev.target.value });
  });
  det.querySelector('[data-no-tarja]').onclick = conError(async () => {
    await pedir('set_equipo', { codigo, activo_tarja: 'NO' });
    abierto = '';
    await cargar();
  });
}

// ---------- CSV ----------

async function descargarCSV() {
  const h = new Date();
  const d = await pedir('consolidado', { anio: h.getFullYear(), mes: h.getMonth() + 1 });
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
