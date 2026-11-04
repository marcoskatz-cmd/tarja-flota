const assert = require('assert');
const { crearContexto, cargarHoja, spreadsheetFake } = require('./helpers');

const PD_ID = '1e_emRVEUxTaNtLxeC0wXIWKzcKuoulZkFSS9O1e0XHo';
const HEADS = ['FECHA', 'EQUIPO', 'CÓDIGO', 'N° SERIE/PATENTE', 'OPERARIO', 'UBICACIÓN/OBRA PARTICULAR', 'UBICACIÓN GPS',
  'HORÓMETRO ENTRADA', 'HORÓMETRO SALIDA', 'TIEMPO TRABAJO (HR)', 'ACEITE MOTOR (L)', 'ACEITE HIDRÁULICO (L)',
  'ACEITE TRANSMISIÓN (L)', 'COMBUSTIBLE (L)', 'GRASA', 'FIRMA', 'OBRA GENERAL', 'ENLACE'];

function armar(partes, equipos, checklists) {
  const ctx = crearContexto({ cargar: ['Config.gs', 'Reglas.gs', 'Planillas.gs', 'Fotos.gs', 'Fuentes.gs', 'Tarjas.gs', 'Espejo.gs', 'Sesion.gs', 'Panel.gs', 'Triggers.gs', 'Mantenimiento.gs', 'Codigo.gs'], hoy: '2026-11-04' });
  ctx.setupCompleto_();
  cargarHoja(ctx.ss_(), 'EQUIPOS', ctx.HOJAS.EQUIPOS, equipos || [
    { codigo: 'CF-03', descripcion: 'Cargadora', tipo_rodado: 'rodante', activo_tarja: 'SI', horom_tarja: 4800, origen_horom: 'TARJA', ultima_tarja: '2026-10-20' },
    { codigo: 'RTP-11', descripcion: 'Retro', tipo_rodado: 'rodante', activo_tarja: 'SI', horom_tarja: '', origen_horom: '' }
  ]);
  const pd = spreadsheetFake(PD_ID, 'PARTES DIARIOS DE EQUIPOS');
  ctx.__planillas[PD_ID] = pd;
  cargarHoja(pd, 'PARTES DIARIOS', HEADS, partes);
  cargarHoja(pd, 'CHECKLISTS', ['FECHA', 'EQUIPO', 'CÓDIGO', 'OPERARIO', 'UBICACIÓN GPS', 'ÍTEMS VERIFICACIÓN', 'N° FALLAS', 'RESUMEN DE FALLAS', 'DETALLE COMPLETO', 'OBSERVACIONES'], checklists || []);
  return ctx;
}

function parte(fecha, cod, op, he, hs, extra) {
  const f = { FECHA: fecha, EQUIPO: cod + ' — equipo', 'CÓDIGO': cod, OPERARIO: op, 'UBICACIÓN/OBRA PARTICULAR': 'Autovías',
    'UBICACIÓN GPS': '=HYPERLINK("https://maps.google.com/?q=-26.81,-65.21";"Ver ubicación")',
    'HORÓMETRO ENTRADA': he, 'HORÓMETRO SALIDA': hs, 'TIEMPO TRABAJO (HR)': hs - he, 'COMBUSTIBLE (L)': 120, GRASA: 'Sí' };
  Object.assign(f, extra || {});
  return HEADS.map((c) => (f[c] === undefined ? '' : f[c]));
}

module.exports = {
  'importarPartes_ trae a TARJAS_<año> los partes que no están y actualiza EQUIPOS': () => {
    const ctx = armar([
      parte(new Date(2026, 10, 2), 'CF-03', 'Pérez Juan', 4800, 4807),
      parte(new Date(2026, 10, 3), 'RTP-11', 'Concha Alfredo', 1200, 1206.5),
      parte(new Date(2026, 10, 3), 'BAT-01', 'Pérez Juan', '', ''),          // implemento: no es jornada
      parte(new Date(2026, 10, 3), 'ZZ-99', 'Nadie', 1, 2),                  // equipo desconocido
      parte('texto', 'CF-03', 'Pérez Juan', 1, 2)                            // sin fecha válida
    ]);
    assert.strictEqual(ctx.importarPartes_(), 2);
    const t = ctx.leer_('TARJAS_2026');
    assert.strictEqual(t.length, 2);
    const cf = t.find((x) => x.equipo === 'CF-03');
    assert.strictEqual(String(cf.fecha), '2026-11-02');
    assert.strictEqual(cf.estado, 'cerrada');
    assert.strictEqual(Number(cf.horas), 7);
    assert.strictEqual(Number(cf.lat), -26.81);
    assert.strictEqual(Number(cf.combustible), 120);
    assert.strictEqual(cf.obra, 'Autovías');
    assert.ok(/^PD:2026-11-02:CF-03:/.test(cf.op_id));
    const eq = ctx.leer_('EQUIPOS');
    const cfe = eq.find((e) => e.codigo === 'CF-03');
    assert.strictEqual(Number(cfe.horom_tarja), 4807);
    assert.strictEqual(cfe.origen_horom, 'PARTES');
    assert.strictEqual(cfe.ultima_tarja, '2026-11-02');
    assert.strictEqual(cfe.ultimo_operador, 'Pérez Juan');
    const rtp = eq.find((e) => e.codigo === 'RTP-11');
    assert.strictEqual(Number(rtp.horom_tarja), 1206.5);
  },
  'importarPartes_ no duplica: ni al repetir ni los partes que nacieron en la app': () => {
    const ctx = armar([parte(new Date(2026, 10, 2), 'CF-03', 'Pérez Juan', 4800, 4807)]);
    ctx.hojaTarjas_(2026);
    // Jornada cargada desde la app (misma fecha y horómetros, ya espejada a PARTES DIARIOS)
    ctx.agregar_('TARJAS_2026', { id: 'app-1', equipo: 'CF-03', fecha: '2026-11-02', estado: 'cerrada', operador: 'PÉREZ JUAN', horom_ini: 4800, horom_fin: 4807, horas: 7 });
    assert.strictEqual(ctx.importarPartes_(), 0);
    assert.strictEqual(ctx.importarPartes_(), 0);
    assert.strictEqual(ctx.leer_('TARJAS_2026').length, 1);
  },
  'importarPartes_ no pisa un horómetro más nuevo que el del parte': () => {
    const ctx = armar([parte(new Date(2026, 9, 10), 'CF-03', 'Pérez Juan', 4700, 4705)]);
    assert.strictEqual(ctx.importarPartes_(), 1);
    const cfe = ctx.leer_('EQUIPOS').find((e) => e.codigo === 'CF-03');
    assert.strictEqual(Number(cfe.horom_tarja), 4800);
    assert.strictEqual(cfe.ultima_tarja, '2026-10-20');
  },
  'el panel y el consolidado ven las jornadas importadas': () => {
    const ctx = armar([parte(new Date(2026, 10, 4), 'CF-03', 'Pérez Juan', 4800, 4809)]);
    ctx.importarPartes_();
    const hoy = ctx.panelHoy_({});
    const cf = hoy.equipos.find((e) => e.codigo === 'CF-03');
    assert.strictEqual(Number(cf.horas_hoy || cf.horas), 9);
    const cons = ctx.panelConsolidado_({ anio: 2026, mes: 11 });
    assert.strictEqual(cons.filas.length, 1);
    assert.strictEqual(cons.filas[0].horas, 9);
  },
  'importarFallas_ crea PROBLEMA en CHECKLIST_RESP y pendiente abierto, sin duplicar': () => {
    const detalle = ['Luces: OK', 'Frenos: FALLA — pierde líquido', 'Neumáticos: FALLA', 'Bocina: OK'].join('\n');
    const ctx = armar([parte(new Date(2026, 10, 3), 'CF-03', 'Pérez Juan', 4800, 4807)], null, [
      [new Date(2026, 10, 3), 'CF-03 — equipo', 'CF-03', 'Pérez Juan', '', 4, 2, 'Frenos (pierde líquido) · Neumáticos', detalle, ''],
      [new Date(2026, 10, 3), 'BAT-01', 'BAT-01', 'Pérez Juan', '', 3, 1, 'x', 'Compuerta: FALLA', ''],
      [new Date(2026, 10, 2), 'RTP-11', 'RTP-11', 'Concha', '', 5, 0, 'Sin fallas', 'Luces: OK', '']
    ]);
    assert.strictEqual(ctx.importarPartes_(), 1);
    const resp = ctx.leer_('CHECKLIST_RESP');
    assert.strictEqual(resp.length, 2);
    assert.strictEqual(resp[0].item, 'Frenos');
    assert.strictEqual(resp[0].comentario, 'pierde líquido');
    assert.strictEqual(resp[0].estado, 'PROBLEMA');
    assert.strictEqual(resp[0].tarja_id, ctx.leer_('TARJAS_2026')[0].id);
    assert.strictEqual(resp[1].item, 'Neumáticos');
    const pend = ctx.leer_('PENDIENTES');
    assert.strictEqual(pend.length, 2);
    assert.strictEqual(pend[0].estado, 'abierto');
    assert.strictEqual(String(pend[0].fecha_apertura), '2026-11-03');
    ctx.importarPartes_();
    assert.strictEqual(ctx.leer_('CHECKLIST_RESP').length, 2);
    assert.strictEqual(ctx.leer_('PENDIENTES').length, 2);
    assert.strictEqual(ctx.panelPendientes_().pendientes.length, 2);
  },
  'panelHoy_ marca trabajando al equipo que cargó combustible hoy': () => {
    const ctx = armar([]);
    const cfg = ctx.ss_().getSheetByName('CONFIG');
    cfg.filas.forEach((f) => { if (f[0] === 'SHEET_CASARES_ID') f[1] = 'casares1'; });
    ctx.CONFIG_CACHE_ = null;
    const cas = spreadsheetFake('casares1', 'Casares');
    ctx.__planillas.casares1 = cas;
    cargarHoja(cas, 'ENTREGAS', ['FECHA', 'OPERARIO', 'CÓDIGO'], [['03/11/2026', 'Otro', 'RTP-11'], ['04/11/2026', 'Pérez Juan', 'CF-03']]);
    const hoy = ctx.panelHoy_({});
    const cf = hoy.equipos.find((e) => e.codigo === 'CF-03');
    assert.strictEqual(cf.estado, 'trabajando');
    assert.strictEqual(cf.operador, 'Pérez Juan');
    assert.notStrictEqual(hoy.equipos.find((e) => e.codigo === 'RTP-11').estado, 'trabajando');
  }
};
