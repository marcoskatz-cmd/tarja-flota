const assert = require('assert');
const { crearContexto, cargarHoja, spreadsheetFake } = require('./helpers');

const LISTA_ID = '1EwbNlmBMx3OIviplvHSJM3N4CZ3vVXgVxH208VugG3M';
const CASARES_ID = 'casares1';
const SNAP_ID = 'snap1';

function armar(opciones) {
  opciones = opciones || {};
  const ctx = crearContexto({ cargar: ['Config.gs', 'Reglas.gs', 'Planillas.gs', 'Fuentes.gs'], hoy: '2026-10-19' });
  ctx.setupCompleto_();
  // Fuente INGECOV
  const lista = spreadsheetFake(LISTA_ID, 'LISTA DE EQUIPOS');
  ctx.__planillas[LISTA_ID] = lista;
  const header = opciones.header || ['CÓDIO INTERNO', 'CLASIFICACIÓN', 'MARCA', 'MODELO', 'N° SERIE - N° PATENTE', 'UBICACIÓN'];
  cargarHoja(lista, 'EQUIPOS', header, opciones.filas || [
    ['CF-03', 'CARGADORA FRONTAL', 'CATERPILLAR', '950H', 'AB123', 'Autovías'],
    ['EX-01', 'EXCAVADORA HIDRAULICA', 'KOMATSU', 'PC200', 'S/N 1', 'Corrientes'],
    ['CMN-03', 'CAMION VOLCADOR', 'IVECO', 'TECTOR', 'AC456', 'Autovías']
  ]);
  // Fuente Casares (combustible pesados): OPERARIO + CÓDIGO de cada carga
  const cas = spreadsheetFake(CASARES_ID, 'Casares');
  ctx.__planillas[CASARES_ID] = cas;
  cargarHoja(cas, 'ENTREGAS', ['FECHA', 'OPERARIO', 'EQUIPO/SECTOR', 'CÓDIGO', 'N° SERIE/PATENTE'], opciones.cargas || [
    ['15/05/2026', 'Ariel Gómez', 'CF-03 — Cargador', 'CF-03', ''],
    ['10/10/2026', 'Ariel Gómez', 'CF-03 — Cargador', 'CF-03', ''],
    ['12/10/2026', 'ariel gomez', 'EX-01 — Excavadora', 'EX-01', ''],
    ['11/10/2026', 'Leandro Casares', 'CMN-03 — Camión', 'CMN-03', ''],
    ['01/02/2026', 'Juan Viejo', 'CF-03 — Cargador', 'CF-03', ''],
    ['09/10/2026', 'Matías Martín', 'Camión batea', '', 'HYG-770']
  ]);
  // Snapshot INGECOV (planilla)
  const snap = spreadsheetFake(SNAP_ID, 'snapshot');
  ctx.__planillas[SNAP_ID] = snap;
  cargarHoja(snap, 'SVC_PANELPROG', ['CODIGO', 'DESCRIPCION', 'PATENTE', 'ULT FECHA', 'ULT HRKM', 'HRKM ACTUAL', 'EST HRKM', 'OPERATIVIDAD', 'FRECUENCIA', 'ESTADO'],
    [['CF-03', 'Cargadora', 'AB123', '2026-10-01', 4700, 4812, 4950, 'ok', 250, 'ok']]);
  // CONFIG
  const cfg = ctx.ss_().getSheetByName('CONFIG');
  cfg.filas.forEach((f) => {
    if (f[0] === 'SHEET_CASARES_ID') f[1] = CASARES_ID;
    if (f[0] === 'SNAPSHOT_SHEET_ID') f[1] = SNAP_ID;
  });
  return ctx;
}

module.exports = {
  'syncEquipos_ importa solo pesados con header renombrado de INGECOV': () => {
    const ctx = armar();
    const r = ctx.syncEquipos_();
    const eq = ctx.leer_('EQUIPOS');
    assert.strictEqual(r.altas, 2);
    assert.strictEqual(eq.map((e) => e.codigo).sort().join('|'), 'CF-03|EX-01');
    const cf = eq.find((e) => e.codigo === 'CF-03');
    assert.strictEqual(cf.tipo_rodado, 'rodante');
    assert.strictEqual(cf.activo_tarja, 'SI');
    assert.strictEqual(cf.lugar, 'Autovías');
    assert.strictEqual(cf.patente, 'AB123');
    assert.strictEqual(eq.find((e) => e.codigo === 'EX-01').tipo_rodado, 'oruga');
  },
  'syncEquipos_ no pisa tipo_rodado ni activo_tarja editados a mano': () => {
    const ctx = armar();
    ctx.syncEquipos_();
    const cf = ctx.leer_('EQUIPOS').find((e) => e.codigo === 'CF-03');
    ctx.actualizar_('EQUIPOS', cf._fila, { tipo_rodado: 'oruga', activo_tarja: 'NO' });
    ctx.syncEquipos_();
    const cf2 = ctx.leer_('EQUIPOS').find((e) => e.codigo === 'CF-03');
    assert.strictEqual(cf2.tipo_rodado, 'oruga');
    assert.strictEqual(cf2.activo_tarja, 'NO');
    assert.strictEqual(ctx.leer_('EQUIPOS').length, 2, 'no duplica');
  },
  'syncEquipos_ sin columna de código: no toca EQUIPOS, deja diagnóstico y avisa una vez': () => {
    const ctx = armar();
    ctx.syncEquipos_();
    ctx.__planillas[LISTA_ID].getSheetByName('EQUIPOS').filas[0][0] = 'OTRA COSA';
    const r = ctx.syncEquipos_();
    assert.ok(r.faltan.indexOf('CODIGO') >= 0);
    assert.strictEqual(ctx.leer_('EQUIPOS').length, 2);
    assert.ok(/CODIGO/.test(ctx.prop_('DIAG_EQUIPOS')));
    ctx.syncEquipos_();
    assert.strictEqual(ctx.__avisos.length, 1, 'un solo aviso por día');
    assert.strictEqual(ctx.__avisos[0].aviso.prioridad, 'critica');
  },
  'syncEquipos_ exitoso limpia el diagnóstico anterior': () => {
    const ctx = armar();
    ctx.setProp_('DIAG_EQUIPOS', 'viejo');
    ctx.syncEquipos_();
    assert.strictEqual(ctx.prop_('DIAG_EQUIPOS'), null);
  },
  'syncPersonal_ toma solo los nombres de OPERARIO de Casares (últimos 120 días), sin cruzar con equipos': () => {
    const ctx = armar();
    const r = ctx.syncPersonal_();
    const p = ctx.leer_('PERSONAL');
    // Ariel Gómez (dos grafías = una persona), Leandro Casares y Matías Martín entran aunque su carga no sea de un pesado.
    // Fuera: Juan Viejo (hace más de 120 días).
    assert.strictEqual(r.total, 3);
    assert.strictEqual(p.map((x) => x.nombre).join('|'), 'Ariel Gómez|Leandro Casares|Matías Martín');
    assert.strictEqual(p[0].equipo_habitual, undefined, 'no se guarda ningún equipo');
    assert.strictEqual(String(p[0].legajo), '');
  },
  'syncPersonal_ sin SHEET_CASARES_ID deja diagnóstico': () => {
    const ctx = armar();
    ctx.ss_().getSheetByName('CONFIG').filas.forEach((f) => { if (f[0] === 'SHEET_CASARES_ID') f[1] = ''; });
    const r = ctx.syncPersonal_();
    assert.ok(r.faltan.length > 0);
    assert.ok(ctx.prop_('DIAG_PERSONAL'));
  },
  'sembrarHorometros_ toma HRKM ACTUAL (no el del último service) del snapshot solo para equipos sin horómetro': () => {
    const ctx = armar();
    ctx.syncEquipos_();
    const r = ctx.sembrarHorometros_();
    assert.strictEqual(r.sembrados, 1);
    const cf = ctx.leer_('EQUIPOS').find((e) => e.codigo === 'CF-03');
    assert.strictEqual(Number(cf.horom_tarja), 4812);
    assert.strictEqual(cf.origen_horom, 'INGECOV');
    ctx.actualizar_('EQUIPOS', cf._fila, { horom_tarja: 5000, origen_horom: 'TARJA' });
    ctx.sembrarHorometros_();
    assert.strictEqual(Number(ctx.leer_('EQUIPOS').find((e) => e.codigo === 'CF-03').horom_tarja), 5000);
  }
};

module.exports['I4: columna opcional renombrada no pisa lugar/marca con vacío y deja diagnóstico'] = () => {
  const ctx = armar();
  ctx.syncEquipos_();
  ctx.__planillas[LISTA_ID].getSheetByName('EQUIPOS').filas[0][5] = 'SITIO RARO';
  const r = ctx.syncEquipos_();
  assert.strictEqual(r.faltan.length, 0, 'sigue importando');
  assert.strictEqual(ctx.leer_('EQUIPOS').find((e) => e.codigo === 'CF-03').lugar, 'Autovías');
  assert.ok(/UBICACION/.test(ctx.prop_('DIAG_EQUIPOS')));
};
module.exports['I5: syncPersonal_ escribe de una sola vez (no depende de appendRow fila por fila)'] = () => {
  const ctx = armar();
  ctx.hoja_('PERSONAL').appendRow = () => { throw new Error('appendRow no debe usarse'); };
  const r = ctx.syncPersonal_();
  assert.strictEqual(r.total, 3);
  assert.strictEqual(ctx.leer_('PERSONAL').length, 3);
};
module.exports['I7: equipo que desaparece de la LISTA queda activo_tarja = NO'] = () => {
  const ctx = armar();
  ctx.syncEquipos_();
  const sh = ctx.__planillas[LISTA_ID].getSheetByName('EQUIPOS');
  sh.filas.splice(2, 1); // saca EX-01
  const r = ctx.syncEquipos_();
  assert.strictEqual(r.bajas, 1);
  assert.strictEqual(ctx.leer_('EQUIPOS').find((e) => e.codigo === 'EX-01').activo_tarja, 'NO');
  assert.strictEqual(ctx.leer_('EQUIPOS').find((e) => e.codigo === 'CF-03').activo_tarja, 'SI');
};

module.exports['syncEquipos_ reinfiere tipo_rodado solo cuando quedó vacío'] = () => {
  const ctx = armar();
  ctx.syncEquipos_();
  const cf = ctx.leer_('EQUIPOS').find((e) => e.codigo === 'CF-03');
  ctx.actualizar_('EQUIPOS', cf._fila, { tipo_rodado: '' });
  ctx.syncEquipos_();
  assert.strictEqual(ctx.leer_('EQUIPOS').find((e) => e.codigo === 'CF-03').tipo_rodado, 'rodante');
};
