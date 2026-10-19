const assert = require('assert');
const { crearContexto, cargarHoja } = require('./helpers');

function armar() {
  const ctx = crearContexto({ hoy: '2026-10-19' });
  ctx.setupCompleto_();
  cargarHoja(ctx.ss_(), 'EQUIPOS', ctx.HOJAS.EQUIPOS, [
    { codigo: 'CF-03', descripcion: 'Cargadora', tipo_rodado: 'rodante', lugar: 'Autovías', activo_tarja: 'SI', horom_tarja: 4800, origen_horom: 'TARJA', ultimo_operador: 'PÉREZ JUAN', ultima_tarja: '2026-10-18' },
    { codigo: 'EX-01', descripcion: 'Excavadora', tipo_rodado: 'oruga', lugar: 'Corrientes', activo_tarja: 'NO', horom_tarja: 100, origen_horom: 'INGECOV' }
  ]);
  cargarHoja(ctx.ss_(), 'PERSONAL', ctx.HOJAS.PERSONAL, [{ legajo: '101', nombre: 'PÉREZ JUAN', activo: 'SI' }, { legajo: '102', nombre: 'GÓMEZ ANA', activo: 'NO' }]);
  return ctx;
}

function post(ctx, body) {
  const out = ctx.doPost({ postData: { contents: JSON.stringify(body) } });
  return JSON.parse(out.__texto);
}
function get(ctx, params) {
  const out = ctx.doGet({ parameter: params });
  return JSON.parse(out.__texto);
}

module.exports = {
  'equipos devuelve solo activo_tarja = SI con las pistas': () => {
    const ctx = armar();
    const r = post(ctx, { action: 'equipos' });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.data.equipos.length, 1);
    const e = r.data.equipos[0];
    assert.strictEqual(e.codigo, 'CF-03');
    assert.strictEqual(e.ultimo_operador, 'PÉREZ JUAN');
    assert.strictEqual(e.ultima_tarja, '2026-10-18');
    assert.strictEqual(e.abierta_por, '');
    assert.ok(r.data.hoy === '2026-10-19');
  },
  'equipos informa abierta_por cuando hay jornada abierta': () => {
    const ctx = armar();
    ctx.agregar_('ABIERTAS', { tarja_id: 'x', equipo: 'CF-03', legajo: '101', operador: 'PÉREZ JUAN', ts_apertura: '2026-10-19 07:00:00', anio: '2026' });
    const r = post(ctx, { action: 'equipos' });
    assert.strictEqual(r.data.equipos[0].abierta_por, 'PÉREZ JUAN');
  },
  'nomina devuelve solo activos': () => {
    const ctx = armar();
    const r = post(ctx, { action: 'nomina' });
    assert.strictEqual(r.data.personas.length, 1);
    assert.strictEqual(String(r.data.personas[0].legajo), '101');
  },
  'items devuelve los activos con tipo': () => {
    const ctx = armar();
    const r = post(ctx, { action: 'items' });
    assert.strictEqual(r.data.items.length, 7);
    assert.ok(r.data.items.some((i) => i.tipo === 'oruga'));
  },
  'acción desconocida responde ok:false con texto llano': () => {
    const ctx = armar();
    const r = post(ctx, { action: 'nada' });
    assert.strictEqual(r.ok, false);
    assert.ok(/desconocida/.test(r.error));
  },
  'rutas viejas de Corrientes ya no existen': () => {
    const ctx = armar();
    ['vincular', 'login', 'certificacion'].forEach((a) => assert.strictEqual(post(ctx, { action: a }).ok, false, a));
  },
  'ping sin planilla informa instalado:false; con planilla cuenta equipos y personas': () => {
    const ctx0 = crearContexto({ hoy: '2026-10-19' });
    assert.strictEqual(get(ctx0, { action: 'ping' }).instalado, false);
    const ctx = armar();
    const r = get(ctx, { action: 'ping' });
    assert.strictEqual(r.instalado, true);
    assert.strictEqual(r.equipos, 1);
    assert.strictEqual(r.personas, 1);
  },
  'sync_fuentes por GET exige la clave de instalación': () => {
    const ctx = armar();
    ctx.setProp_('BOOTSTRAP_KEY', 'k');
    assert.strictEqual(get(ctx, { action: 'sync_fuentes', key: 'mal' }).ok, false);
    const r = get(ctx, { action: 'sync_fuentes', key: 'k' });
    assert.strictEqual(r.ok, true);
    assert.ok(r.data.equipos);
  },
  'error CONFIRMAR_EQUIPO viaja con code en la respuesta': () => {
    const ctx = armar();
    const FOTO = 'data:image/jpeg;base64,AAAA';
    const items = post(ctx, { action: 'estado', equipo: 'CF-03' }).data.items.map((i) => ({ orden: i.orden, estado: 'OK' }));
    const r = post(ctx, { action: 'abrir', equipo: 'CF-03', legajo: '101', operador: 'PÉREZ JUAN', firma: FOTO, foto_horometro: FOTO, horom_ini: 10, motivo_correccion: 'x', checklist: items, op_id: 'o1' });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.code, 'CONFIRMAR_EQUIPO');
  },
  'borrar_tarja informa sin aplicar y borra con aplicar=si devolviendo el horómetro previo': () => {
    const ctx = armar();
    ctx.setProp_('BOOTSTRAP_KEY', 'k');
    const FOTO = 'data:image/jpeg;base64,AAAA';
    const items = post(ctx, { action: 'estado', equipo: 'CF-03' }).data.items.map((i) => ({ orden: i.orden, estado: 'OK' }));
    const a = post(ctx, { action: 'abrir', equipo: 'CF-03', legajo: '101', operador: 'PÉREZ JUAN', firma: FOTO, foto_horometro: FOTO, horom_ini: 4800, checklist: items, op_id: 'o1' });
    post(ctx, { action: 'cerrar', tarja_id: a.data.tarja.id, foto_horometro: FOTO, horom_fin: 4805, legajo: '101', op_id: 'c1' });
    const info = get(ctx, { action: 'borrar_tarja', key: 'k', equipo: 'CF-03', fecha: '2026-10-19' });
    assert.strictEqual(info.data.tarjas, 1);
    assert.strictEqual(ctx.leer_('TARJAS_2026').length, 1);
    get(ctx, { action: 'borrar_tarja', key: 'k', equipo: 'CF-03', fecha: '2026-10-19', aplicar: 'si' });
    assert.strictEqual(ctx.leer_('TARJAS_2026').length, 0);
    assert.strictEqual(Number(ctx.leer_('EQUIPOS').find((e) => e.codigo === 'CF-03').horom_tarja), 4800);
  }
};

module.exports['set_clave_avisos guarda CLAVE_TARJAS solo con la clave de instalación'] = () => {
  const ctx = armar();
  ctx.setProp_('BOOTSTRAP_KEY', 'k');
  assert.strictEqual(get(ctx, { action: 'set_clave_avisos', key: 'mal', v: 'abc' }).ok, false);
  assert.strictEqual(ctx.prop_('CLAVE_TARJAS'), null);
  const r = get(ctx, { action: 'set_clave_avisos', key: 'k', v: 'abc' });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(ctx.prop_('CLAVE_TARJAS'), 'abc');
  assert.strictEqual(JSON.stringify(r).indexOf('abc'), -1, 'la clave no vuelve en la respuesta');
};
