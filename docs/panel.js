/**
 * Panel de control: módulo TARJAS de App INGECO.
 *
 * Solo entra quien viene desde la app (guard.js canjea el ticket y deja
 * window.INGECO_SESION). Sin eso no se muestra nada: acá sí bloquea, porque el
 * panel es para la oficina, no para los operarios.
 */

const app = document.getElementById('app');
const nav = document.getElementById('nav');
const hQuien = document.getElementById('hQuien');
const btnActualizar = document.getElementById('btnActualizar');

const APP_INGECO = 'https://marcoskatz-cmd.github.io/app-ingeco/';

function pintar(html) { app.innerHTML = html; }
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function aviso(tipo, texto) { return `<div class="aviso ${tipo}">${texto}</div>`; }
function num(v, dec) { return v === '' || v == null || !isFinite(Number(v)) ? '—' : Number(v).toLocaleString('es-AR', { maximumFractionDigits: dec == null ? 1 : dec }); }

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

const PESTANAS = [
  { id: 'hoy', titulo: 'Hoy', ver: verHoy },
  { id: 'mapa', titulo: 'Mapa', ver: verMapa },
  { id: 'equipo', titulo: 'Equipo', ver: verEquipo },
  { id: 'consolidado', titulo: 'Consolidado', ver: verConsolidado },
  { id: 'fallas', titulo: 'Fallas', ver: verFallas },
  { id: 'equipos', titulo: 'Equipos', ver: verEquipos },
  { id: 'diagnostico', titulo: 'Diagnóstico', ver: verDiagnostico }
];
let pestanaActual = 'hoy';

// ---------- arranque ----------

function iniciar() {
  if (!window.INGECO_USUARIO || !window.INGECO_SESION) {
    nav.hidden = true;
    return pintar(`
      <div class="bloqueado">
        <h2>Abrí este panel desde la app INGECO</h2>
        <p class="ayuda">${esc(window.INGECO_MOTIVO || 'El acceso se da desde la app, no por link.')}</p>
        <a href="${APP_INGECO}">Ir a la app INGECO</a>
      </div>`);
  }
  hQuien.textContent = window.INGECO_USUARIO.nombre_visible || '';
  btnActualizar.hidden = false;
  btnActualizar.onclick = () => abrir(pestanaActual);
  nav.hidden = false;
  nav.innerHTML = PESTANAS.map((p) => `<button data-id="${p.id}">${p.titulo}</button>`).join('');
  nav.querySelectorAll('button').forEach((b) => { b.onclick = () => abrir(b.dataset.id); });
  abrir(location.hash.replace('#', '') || 'hoy');
}

function abrir(id, extra) {
  if (!PESTANAS.find((p) => p.id === id)) id = 'hoy';
  pestanaActual = id;
  try { history.replaceState(null, '', '#' + id); } catch (e) { }
  nav.querySelectorAll('button').forEach((b) => b.classList.toggle('activa', b.dataset.id === id));
  pintar('<div class="cargando">Cargando…</div>');
  conError(PESTANAS.find((p) => p.id === id).ver)(extra);
}

function avisoDiagnostico(diag) {
  if (!diag || !diag.length) return '';
  return aviso('alerta',
    '<strong>Hay algo que revisar en las planillas.</strong> ' +
    diag.slice(0, 3).map((x) => `${esc(x.hoja)}: ${esc(x.detalle)}`).join(' · ') +
    (diag.length > 3 ? ` · y ${diag.length - 3} más (ver Diagnóstico)` : ''));
}

// ---------- Hoy ----------

const TEXTO_ESTADO = { cerrada: 'Cerrada', abierta: 'Abierta', sin_tarja: 'Sin tarja', sin_actividad: 'Sin actividad' };
let filtroObra = '';

async function verHoy() {
  const d = await pedir('hoy');
  const obras = [...new Set(d.equipos.map((e) => e.lugar || 'Sin obra'))].sort();
  const resumen = { cerrada: 0, abierta: 0, sin_tarja: 0, sin_actividad: 0 };
  d.equipos.forEach((e) => { resumen[e.estado]++; });
  const visibles = d.equipos.filter((e) => !filtroObra || (e.lugar || 'Sin obra') === filtroObra);
  const orden = ['abierta', 'cerrada', 'sin_tarja', 'sin_actividad'];

  pintar(`
    ${avisoDiagnostico(d.diagnostico)}
    <h2>Hoy — ${esc(d.fecha)}</h2>
    <p class="ayuda">
      <strong>${resumen.abierta}</strong> en curso · <strong>${resumen.cerrada}</strong> cerradas ·
      <strong>${resumen.sin_tarja}</strong> sin tarja · <strong>${resumen.sin_actividad}</strong> sin actividad
    </p>
    ${d.fallas_hoy.length ? `
      <div class="tarjeta" style="border-color:var(--alerta)">
        <strong>Fallas declaradas hoy (${d.fallas_hoy.length})</strong>
        <div class="filas" style="margin-top:.5rem">
          ${d.fallas_hoy.map((f) => `<div class="fila"><span><strong>${esc(f.equipo)}</strong> · ${esc(f.item)}<br><span class="tenue">${esc(f.comentario || 'Sin comentario')}</span></span>
            <span>${f.foto ? `<a href="${esc(f.foto)}" target="_blank" rel="noopener">foto</a>` : ''}</span></div>`).join('')}
        </div>
      </div>` : ''}
    <div class="chips">
      <button data-obra="" class="${filtroObra ? '' : 'activa'}">Todas las obras</button>
      ${obras.map((o) => `<button data-obra="${esc(o)}" class="${filtroObra === o ? 'activa' : ''}">${esc(o)}</button>`).join('')}
    </div>
    ${orden.map((est) => {
      const lista = visibles.filter((e) => e.estado === est);
      if (!lista.length) return '';
      return `<h3 class="grupo">${TEXTO_ESTADO[est]} (${lista.length})</h3>
        <div class="grid">${lista.map(tarjetaHoy).join('')}</div>`;
    }).join('')}
  `);
  app.querySelectorAll('[data-obra]').forEach((b) => { b.onclick = () => { filtroObra = b.dataset.obra; verHoy(); }; });
  app.querySelectorAll('[data-ver]').forEach((b) => { b.onclick = () => abrir('equipo', b.dataset.ver); });
}

function tarjetaHoy(e) {
  const linea = e.estado === 'abierta' ? `Desde las ${esc(e.desde)} · ${esc(e.operador)}`
    : e.estado === 'cerrada' ? `<strong>${num(e.horas)} h</strong> · ${e.jornadas} jornada${e.jornadas === 1 ? '' : 's'} · ${esc(e.operador)}`
    : e.ultima_tarja ? `Última tarja: ${esc(e.ultima_tarja)}${e.operador ? ' · ' + esc(e.operador) : ''}` : 'Nunca tarjó';
  return `
    <div class="eq ${e.estado}">
      <div class="fila" style="border:0;padding:0"><span class="codigo">${esc(e.codigo)}</span>
        <button class="chip" style="border:0;background:#e8eef7;color:#1e3a8a" data-ver="${esc(e.codigo)}">ver</button></div>
      <div class="tenue" style="font-size:.85rem">${esc(e.descripcion)}${e.lugar ? ' · ' + esc(e.lugar) : ''}</div>
      <div style="margin-top:.35rem">${linea}</div>
      <div class="pistas">
        ${e.problemas_hoy ? `<span class="chip alerta">${e.problemas_hoy} falla${e.problemas_hoy === 1 ? '' : 's'} hoy</span>` : ''}
        ${e.pendientes_abiertos ? `<span class="chip alerta">${e.pendientes_abiertos} pendiente${e.pendientes_abiertos === 1 ? '' : 's'}</span>` : ''}
        ${e.cierre_tercero ? '<span class="chip alerta">cerrada por otro</span>' : ''}
        ${e.excepcion ? '<span class="chip alerta">horómetro corregido</span>' : ''}
      </div>
    </div>`;
}

// ---------- Mapa ----------

async function verMapa() {
  const [m, h] = await Promise.all([pedir('mapa'), pedir('hoy')]);
  pintar(`
    <h2>Dónde está cada equipo</h2>
    <p class="ayuda leyenda-mapa">Última posición conocida (GPS de la última foto).
      <span><i class="punto" style="background:${PanelMapa.COLOR.hoy}"></i> hoy</span>
      <span><i class="punto" style="background:${PanelMapa.COLOR.semana}"></i> esta semana</span>
      <span><i class="punto" style="background:${PanelMapa.COLOR.viejo}"></i> más antiguo</span>
    </p>
    <div id="mapa"></div>
    ${m.puntos.length ? '' : aviso('info', 'Todavía ningún equipo mandó una foto con GPS.')}
  `);
  PanelMapa.dibujar(m.puntos, h.fecha, (codigo) => abrir('equipo', codigo));
}

// ---------- Equipo ----------

let equipoActual = '';

async function verEquipo(codigo) {
  if (codigo) equipoActual = codigo;
  const cfg = await pedir('equipos_config');
  const opciones = cfg.equipos.filter((e) => String(e.activo_tarja).toUpperCase() === 'SI').map((e) => e.codigo).sort();
  if (!equipoActual && opciones.length) equipoActual = opciones[0];
  const d = equipoActual ? await pedir('equipo_historial', { codigo: equipoActual }) : null;
  pintar(`
    <div class="fila-form">
      <div><label>Equipo</label>
        <select id="selEq">${opciones.map((c) => `<option ${c === equipoActual ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></div>
    </div>
    ${d ? `
    <div class="tarjeta">
      <div class="codigo">${esc(d.equipo.codigo)}</div>
      <div class="desc">${esc(d.equipo.descripcion)}${d.equipo.patente ? ' · ' + esc(d.equipo.patente) : ''}${d.equipo.lugar ? ' · ' + esc(d.equipo.lugar) : ''}</div>
      <div class="fila" style="margin-top:.6rem"><span class="tenue">Horómetro según tarja</span><span><strong>${num(d.horom_tarja)}</strong>${d.equipo.origen_horom === 'INGECOV' ? ' <span class="chip">sembrado de INGECOV</span>' : ''}</span></div>
      <div class="fila"><span class="tenue">Horómetro según INGECOV</span><span>${num(d.horom_ingecov)}</span></div>
      <div class="fila" style="border:0"><span class="tenue">Diferencia</span>
        <span>${d.diferencia === null ? '—' : `<span class="chip ${d.diferencia_alta ? 'alerta' : 'ok'}">${num(d.diferencia, 0)} hs</span>`}</span></div>
      ${d.diferencia_alta ? aviso('alerta', 'La tarja y el service de INGECOV no coinciden. Conviene revisar cuál está bien antes de usar este horómetro.') : ''}
    </div>
    ${d.pendientes.length ? `<div class="tarjeta" style="border-color:var(--alerta)"><strong>Fallas abiertas (${d.pendientes.length})</strong>
      ${d.pendientes.map((p) => `<div class="fila"><span>${esc(p.item)}<br><span class="tenue">${esc(p.comentario)}</span></span><span>${esc(p.fecha_apertura)}</span></div>`).join('')}</div>` : ''}
    <h2>Últimas jornadas</h2>
    <div class="tarjeta scroll-x">
      <table>
        <thead><tr><th>Fecha</th><th>Operario</th><th class="num">Inicio</th><th class="num">Fin</th><th class="num">Horas</th><th>Fotos</th><th></th></tr></thead>
        <tbody>
          ${d.tarjas.map((t) => `
            <tr>
              <td>${esc(t.fecha)}<br><span class="tenue" style="font-size:.8rem">${esc(String(t.ts_apertura || '').slice(11, 16))}${t.ts_cierre ? '–' + esc(String(t.ts_cierre).slice(11, 16)) : ''}</span></td>
              <td>${esc(t.operador)}${t.operador_manual === 'SI' ? ' <span class="chip alerta">a mano</span>' : ''}${t.cierre_tercero === 'SI' ? ` <span class="chip alerta">cerró ${esc(t.legajo_cierre)}</span>` : ''}</td>
              <td class="num">${num(t.horom_ini)}${t.excepcion === 'SI' ? ' <span class="chip alerta">corr.</span>' : ''}</td>
              <td class="num">${num(t.horom_fin)}</td>
              <td class="num">${t.estado === 'cerrada' ? `<strong>${num(t.horas)}</strong>` : `<span class="chip alerta">${esc(t.estado)}</span>`}</td>
              <td>${t.foto_horom_ini ? `<a href="${esc(t.foto_horom_ini)}" target="_blank" rel="noopener">inicio</a> ` : ''}${t.foto_horom_fin ? `<a href="${esc(t.foto_horom_fin)}" target="_blank" rel="noopener">fin</a>` : ''}</td>
              <td>${t.estado === 'anulada' ? '' : `<button class="chip alerta" style="border:0" data-anular="${esc(t.id)}">Anular</button>`}</td>
            </tr>`).join('') || '<tr><td colspan="7" class="tenue">Sin jornadas registradas.</td></tr>'}
        </tbody>
      </table>
    </div>` : aviso('info', 'No hay equipos activos para la tarja.')}
  `);
  document.getElementById('selEq').onchange = (ev) => verEquipo(ev.target.value);
  app.querySelectorAll('[data-anular]').forEach((b) => { b.onclick = () => formAnular(b, b.dataset.anular); });
}

function formAnular(boton, tarjaId) {
  const fila = boton.closest('tr');
  const cont = document.createElement('tr');
  cont.innerHTML = `<td colspan="7">
    <label>Motivo de la anulación</label>
    <textarea id="m" rows="2" placeholder="Queda registrado en el log" style="width:100%"></textarea>
    <div style="height:.6rem"></div>
    <button class="principal" id="ok" disabled>Confirmar la anulación</button>
    <div style="height:.4rem"></div>
    <button class="secundaria" id="no">Mejor no</button>
  </td>`;
  fila.after(cont);
  boton.hidden = true;
  const m = cont.querySelector('#m');
  const ok = cont.querySelector('#ok');
  m.oninput = () => { ok.disabled = !m.value.trim(); };
  cont.querySelector('#no').onclick = () => { cont.remove(); boton.hidden = false; };
  ok.onclick = conError(async () => {
    ok.disabled = true; ok.textContent = 'Anulando…';
    await pedir('anular', { tarja_id: tarjaId, motivo: m.value.trim() });
    verEquipo();
  });
}

// ---------- Consolidado ----------

let periodo = null;

async function verConsolidado() {
  if (!periodo) { const h = new Date(); periodo = { anio: h.getFullYear(), mes: h.getMonth() + 1 }; }
  const d = await pedir('consolidado', periodo);
  const total = d.filas.reduce((s, f) => s + f.horas, 0);
  pintar(`
    <h2>Consolidado de horas</h2>
    <div class="fila-form">
      <div><label>Año</label><input type="number" id="anio" value="${periodo.anio}" min="2026" max="2100"></div>
      <div><label>Mes</label><select id="mes"><option value="">Todo el año</option>${[...Array(12)].map((_, i) => `<option value="${i + 1}" ${periodo.mes === i + 1 ? 'selected' : ''}>${String(i + 1).padStart(2, '0')}</option>`).join('')}</select></div>
      <button class="secundaria" id="csv" style="width:auto">Descargar CSV</button>
    </div>
    <p class="ayuda">${d.filas.length} fila${d.filas.length === 1 ? '' : 's'} · <strong>${num(total)} h</strong> en total. Solo cuentan jornadas cerradas.</p>
    <div class="tarjeta scroll-x">
      <table>
        <thead><tr><th>Mes</th><th>Equipo</th><th>Descripción</th><th>Obra</th><th class="num">Jornadas</th><th class="num">Horas</th></tr></thead>
        <tbody>${d.filas.map((f) => `<tr><td>${esc(f.mes)}</td><td><strong>${esc(f.codigo)}</strong></td><td>${esc(f.descripcion)}</td><td>${esc(f.lugar)}</td><td class="num">${f.jornadas}</td><td class="num"><strong>${num(f.horas)}</strong></td></tr>`).join('') || '<tr><td colspan="6" class="tenue">Sin jornadas cerradas en el período.</td></tr>'}</tbody>
      </table>
    </div>
  `);
  const recargar = () => { periodo = { anio: Number(document.getElementById('anio').value), mes: Number(document.getElementById('mes').value) || '' }; verConsolidado(); };
  document.getElementById('anio').onchange = recargar;
  document.getElementById('mes').onchange = recargar;
  document.getElementById('csv').onclick = () => descargarCSV(d);
}

function descargarCSV(d) {
  const sep = ';';
  const filas = [['Mes', 'Equipo', 'Descripcion', 'Obra', 'Jornadas', 'Horas']]
    .concat(d.filas.map((f) => [f.mes, f.codigo, f.descripcion, f.lugar, f.jornadas, String(f.horas).replace('.', ',')]));
  const csv = '﻿' + filas.map((r) => r.map((v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"').join(sep)).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `tarjas-${d.anio}${d.mes ? '-' + d.mes : ''}.csv`;
  a.click();
}

// ---------- Fallas ----------

async function verFallas() {
  const d = await pedir('pendientes');
  if (!d.pendientes.length) return pintar(aviso('info', 'No hay fallas abiertas. Todo al día.'));
  pintar(`
    <h2>Fallas abiertas (${d.pendientes.length})</h2>
    <div class="grid">
      ${d.pendientes.map((p) => `
        <div class="tarjeta" style="margin:0">
          <div class="fila" style="border:0;padding-top:0"><strong>${esc(p.equipo)}</strong><span class="tenue">${esc(p.fecha_apertura)}</span></div>
          <div style="font-weight:600;margin:.3rem 0">${esc(p.item)}</div>
          <div class="tenue" style="margin-bottom:.6rem">${esc(p.comentario || 'Sin comentario')}</div>
          ${p.foto ? `<a href="${esc(p.foto)}" target="_blank" rel="noopener">Ver la foto</a>` : ''}
          <div style="height:.8rem"></div>
          <button class="secundaria" data-cerrar="${esc(p.id)}">Cerrar esta falla</button>
        </div>`).join('')}
    </div>
  `);
  app.querySelectorAll('[data-cerrar]').forEach((b) => { b.onclick = () => formCerrarFalla(b, b.dataset.cerrar, d.motivos); });
}

function formCerrarFalla(boton, id, motivos) {
  const cont = document.createElement('div');
  cont.style.marginTop = '.6rem';
  cont.innerHTML = `
    <label>¿Cómo se resolvió?</label>
    <select id="mot" style="width:100%"><option value="">Elegí un motivo</option>${motivos.map((m) => `<option>${esc(m)}</option>`).join('')}</select>
    <div style="height:.6rem"></div>
    <button class="principal" id="ok" disabled>Confirmar el cierre</button>`;
  boton.after(cont);
  boton.hidden = true;
  const mot = cont.querySelector('#mot');
  const ok = cont.querySelector('#ok');
  mot.onchange = () => { ok.disabled = !mot.value; };
  ok.onclick = conError(async () => {
    ok.disabled = true; ok.textContent = 'Cerrando…';
    await pedir('cerrar_pendiente', { id, motivo: mot.value });
    abrir('fallas');
  });
}

// ---------- Equipos (configuración) ----------

async function verEquipos() {
  const [cfg, om] = await Promise.all([pedir('equipos_config'), pedir('operadores_manuales')]);
  pintar(`
    <h2>Equipos que tarjan</h2>
    <p class="ayuda">La lista viene de la LISTA DE EQUIPOS de INGECOV (solo pesados). Acá se destilda lo que no corresponde y se corrige el tipo de rodado, que define el checklist. <button class="chip" id="sync" style="border:0">Sincronizar ahora</button></p>
    <div class="tarjeta scroll-x">
      <table>
        <thead><tr><th>Tarja</th><th>Código</th><th>Descripción</th><th>Obra</th><th>Rodado</th><th class="num">Horómetro</th><th>Última tarja</th></tr></thead>
        <tbody>${cfg.equipos.sort((a, b) => String(a.codigo).localeCompare(String(b.codigo), 'es', { numeric: true })).map((e) => `
          <tr>
            <td><input type="checkbox" data-act="${esc(e.codigo)}" ${String(e.activo_tarja).toUpperCase() === 'SI' ? 'checked' : ''} style="width:auto"></td>
            <td><strong>${esc(e.codigo)}</strong></td>
            <td>${esc(e.descripcion)}${e.patente ? ' · ' + esc(e.patente) : ''}</td>
            <td>${esc(e.lugar)}</td>
            <td><select data-tipo="${esc(e.codigo)}" style="min-width:7rem">
              <option value="" ${!e.tipo_rodado ? 'selected' : ''}>sin definir</option>
              <option value="oruga" ${e.tipo_rodado === 'oruga' ? 'selected' : ''}>oruga</option>
              <option value="rodante" ${e.tipo_rodado === 'rodante' ? 'selected' : ''}>rodante</option></select></td>
            <td class="num">${num(e.horom_tarja)}${e.origen_horom === 'INGECOV' ? ' <span class="chip">INGECOV</span>' : ''}</td>
            <td>${esc(e.ultima_tarja)}</td>
          </tr>`).join('')}</tbody>
      </table>
    </div>
    <h2>Operarios escritos a mano</h2>
    <p class="ayuda">Gente que no se encontró en la nómina y escribió su nombre. Vinculalos a un legajo y sus tarjas quedan corregidas.</p>
    <div class="tarjeta">
      ${om.operadores.length ? om.operadores.map((o) => `
        <div class="fila">
          <span><strong>${esc(o.nombre)}</strong>${o.legajo_vinculado ? ` <span class="chip ok">legajo ${esc(o.legajo_vinculado)}</span>` : ''}</span>
          <span>${o.legajo_vinculado ? '' : `<select data-vinc="${esc(o.nombre)}"><option value="">Vincular con…</option>${om.personas.map((p) => `<option value="${esc(p.legajo)}">${esc(p.nombre)} (${esc(p.legajo)})</option>`).join('')}</select>`}</span>
        </div>`).join('') : '<div class="tenue">Nadie escribió su nombre a mano.</div>'}
    </div>
  `);
  app.querySelectorAll('[data-act]').forEach((c) => {
    c.onchange = conError(async () => { await pedir('set_equipo', { codigo: c.dataset.act, activo_tarja: c.checked ? 'SI' : 'NO' }); });
  });
  app.querySelectorAll('[data-tipo]').forEach((s) => {
    s.onchange = conError(async () => { await pedir('set_equipo', { codigo: s.dataset.tipo, tipo_rodado: s.value }); });
  });
  app.querySelectorAll('[data-vinc]').forEach((s) => {
    s.onchange = conError(async () => {
      if (!s.value) return;
      await pedir('vincular_operador', { nombre: s.dataset.vinc, legajo: s.value });
      verEquipos();
    });
  });
  document.getElementById('sync').onclick = conError(async (ev) => {
    ev.target.textContent = 'Sincronizando…';
    const r = await pedir('sync_ahora');
    alert(`Equipos: ${r.equipos.altas} nuevos, ${r.equipos.actualizados} actualizados. Personal: ${r.personal.total}.` + (r.equipos.faltan.length || r.personal.faltan.length ? ' Hay columnas faltantes: ver Diagnóstico.' : ''));
    verEquipos();
  });
}

// ---------- Diagnóstico ----------

async function verDiagnostico() {
  const d = await pedir('diagnostico');
  pintar(`
    <h2>Diagnóstico</h2>
    <p class="ayuda">Último sync de equipos y nómina: <strong>${esc(d.ultimo_sync || 'nunca')}</strong>.</p>
    ${d.problemas.length ? `
      <div class="tarjeta" style="border-color:var(--alerta)">
        ${d.problemas.map((p) => `<div class="fila"><span><strong>${esc(p.hoja)}</strong> · ${esc(p.tipo)}</span><span>${esc(p.detalle)}</span></div>`).join('')}
      </div>` : aviso('info', 'Las planillas coinciden con lo que la app espera. Las fuentes de INGECOV y de Ropa se leen bien.')}
  `);
}

// ---------- arranque ----------

if (window.INGECO_USUARIO) iniciar();
else {
  // guard.js puede resolver después de cargar; esperamos su evento un instante.
  let listo = false;
  document.addEventListener('ingeco:usuario', () => { if (!listo) { listo = true; iniciar(); } });
  setTimeout(() => { if (!listo) { listo = true; iniciar(); } }, 400);
}
