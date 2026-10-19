const assert = require('assert');
const { crearContexto } = require('./helpers');

function ctxConSetup(hoy) {
  const ctx = crearContexto({ cargar: ['Config.gs', 'Reglas.gs', 'Planillas.gs'], hoy: hoy || '2026-10-19' });
  ctx.setupCompleto_();
  return ctx;
}

module.exports = {
  'setupCompleto_ crea todas las hojas fijas más TARJAS del año actual': () => {
    const ctx = ctxConSetup('2026-10-19');
    const ss = ctx.ss_();
    ['ABIERTAS', 'EQUIPOS', 'PERSONAL', 'CONFIG', 'CHECKLIST_ITEMS', 'CHECKLIST_RESP', 'PENDIENTES', 'LOG', 'OPERADORES_MANUALES', 'TARJAS_2026']
      .forEach((n) => assert.ok(ss.getSheetByName(n), 'falta la hoja ' + n));
    assert.strictEqual(ss.getSheetByName('TARJAS'), null, 'no debe existir una hoja TARJAS sin año');
  },
  'nombreHojaTarjas_ deriva el año de la fecha': () => {
    const ctx = ctxConSetup();
    assert.strictEqual(ctx.nombreHojaTarjas_('2025-12-31'), 'TARJAS_2025');
  },
  'hojaTarjas_ crea la hoja del año si no existe, con el encabezado de TARJAS': () => {
    const ctx = ctxConSetup();
    const h = ctx.hojaTarjas_(2025);
    assert.strictEqual(h.getName(), 'TARJAS_2025');
    assert.strictEqual(h.getRange(1, 1, 1, ctx.HOJAS.TARJAS.length).getValues()[0].join(','), ctx.HOJAS.TARJAS.join(','));
  },
  'TARJAS tiene las columnas nuevas y no la foto del monitor': () => {
    const ctx = ctxConSetup();
    ['legajo', 'obra', 'lat_fin', 'lon_fin', 'precision_gps', 'operador_manual', 'cierre_tercero', 'legajo_cierre', 'motivo_cierre_tercero', 'checklist_hecho']
      .forEach((c) => assert.ok(ctx.HOJAS.TARJAS.indexOf(c) >= 0, 'falta columna ' + c));
    assert.strictEqual(ctx.HOJAS.TARJAS.indexOf('foto_monitor'), -1);
  },
  'config_ lee la semilla de CONFIG': () => {
    const ctx = ctxConSetup();
    assert.strictEqual(ctx.config_('MAX_HORAS_JORNADA'), '14');
    assert.strictEqual(ctx.configNum_('UMBRAL_CORRECCION_HS'), 50);
    assert.strictEqual(ctx.config_('SHEET_LISTA_EQUIPOS_ID'), '1EwbNlmBMx3OIviplvHSJM3N4CZ3vVXgVxH208VugG3M');
  },
  'CHECKLIST_ITEMS semilla usa tipo (oruga/rodante) en vez de equipo': () => {
    const ctx = ctxConSetup();
    const items = ctx.leer_('CHECKLIST_ITEMS');
    assert.strictEqual(items.length, 7);
    assert.ok(items.some((i) => i.tipo === 'oruga'));
    assert.ok(items.some((i) => i.tipo === 'rodante'));
    assert.strictEqual(items[0].equipo, undefined);
  },
  'diagnosticar_ reporta fuentes externas desde Script Properties': () => {
    const ctx = ctxConSetup();
    ctx.setProp_('DIAG_EQUIPOS', 'Falta la columna CODIGO');
    const d = ctx.diagnosticar_();
    assert.ok(d.some((x) => x.hoja === 'FUENTE_EQUIPOS' && /CODIGO/.test(x.detalle)));
  }
};
