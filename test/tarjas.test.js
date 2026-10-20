const assert = require('assert');
const { crearContexto, cargarHoja } = require('./helpers');

const FOTO = 'data:image/jpeg;base64,AAAA';

function armar(hoy, equipos) {
  const ctx = crearContexto({ cargar: ['Config.gs', 'Reglas.gs', 'Planillas.gs', 'Fotos.gs', 'Tarjas.gs'], hoy: hoy || '2026-10-19' });
  ctx.setupCompleto_();
  cargarHoja(ctx.ss_(), 'EQUIPOS', ctx.HOJAS.EQUIPOS, equipos || [
    { codigo: 'CF-03', descripcion: 'Cargadora', tipo_rodado: 'rodante', lugar: 'Autovías', activo_tarja: 'SI', horom_tarja: 4800, origen_horom: 'TARJA' },
    { codigo: 'EX-01', descripcion: 'Excavadora', tipo_rodado: 'oruga', lugar: 'Corrientes', activo_tarja: 'SI', horom_tarja: 100, origen_horom: 'INGECOV' }
  ]);
  cargarHoja(ctx.ss_(), 'PERSONAL', ctx.HOJAS.PERSONAL, [{ legajo: '101', nombre: 'PÉREZ JUAN', activo: 'SI' }, { legajo: '102', nombre: 'GÓMEZ ANA', activo: 'SI' }]);
  return ctx;
}

function checklistOk(ctx, codigo) {
  return ctx.estadoDelDia_({ equipo: codigo }).items.map((i) => ({ orden: i.orden, estado: 'OK' }));
}

function abrir(ctx, extra) {
  return ctx.abrirTarja_(Object.assign({
    equipo: 'CF-03', legajo: '101', operador: 'PÉREZ JUAN', firma: FOTO, foto_horometro: FOTO,
    horom_ini: 4800, checklist: checklistOk(ctx, 'CF-03'), lat: -26.8, lon: -65.2, precision_gps: 12, op_id: 'op-1'
  }, extra || {}));
}

module.exports = {
  'estadoDelDia_ sin abierta: sugerido, items del tipo y checklist pendiente': () => {
    const ctx = armar();
    const e = ctx.estadoDelDia_({ equipo: 'CF-03' });
    assert.strictEqual(e.abierta, null);
    assert.strictEqual(e.sugerido, 4800);
    assert.strictEqual(e.origen_horom, 'TARJA');
    assert.strictEqual(e.checklist_pendiente, true);
    assert.strictEqual(e.items.length, 6);
    assert.ok(e.items.some((i) => /Neumáticos/.test(i.item)));
    assert.ok(!e.items.some((i) => /cadenas/.test(i.item)));
    assert.strictEqual(e.motivos_cierre_tercero.join('|'), 'Se olvidó de cerrar|Cambio de turno|Otro');
  },
  'abrir crea tarja en TARJAS_2026 y fila en ABIERTAS, actualiza EQUIPOS': () => {
    const ctx = armar();
    const r = abrir(ctx);
    assert.strictEqual(r.ya_existia, false);
    assert.strictEqual(ctx.leer_('TARJAS_2026').length, 1);
    const ab = ctx.leer_('ABIERTAS');
    assert.strictEqual(ab.length, 1);
    assert.strictEqual(ab[0].equipo, 'CF-03');
    assert.strictEqual(String(ab[0].anio), '2026');
    const t = ctx.leer_('TARJAS_2026')[0];
    assert.strictEqual(t.obra, 'Autovías');
    assert.strictEqual(t.checklist_hecho, 'SI');
    assert.strictEqual(String(t.legajo), '101');
    assert.strictEqual(t.estado, 'abierta');
    const eq = ctx.leer_('EQUIPOS').find((x) => x.codigo === 'CF-03');
    assert.strictEqual(eq.ultimo_operador, 'PÉREZ JUAN');
    assert.strictEqual(eq.ultima_tarja, '2026-10-19');
    assert.strictEqual(Number(eq.lat), -26.8);
  },
  'segunda apertura con otro op_id sobre el mismo equipo rechaza': () => {
    const ctx = armar();
    abrir(ctx);
    assert.throws(() => abrir(ctx, { op_id: 'op-2', legajo: '102', operador: 'GÓMEZ ANA' }), /Ya hay una jornada abierta/);
    assert.strictEqual(ctx.leer_('ABIERTAS').length, 1);
  },
  'mismo op_id devuelve la misma tarja sin duplicar': () => {
    const ctx = armar();
    const a = abrir(ctx);
    const b = abrir(ctx);
    assert.strictEqual(b.ya_existia, true);
    assert.strictEqual(b.tarja.id, a.tarja.id);
    assert.strictEqual(ctx.leer_('TARJAS_2026').length, 1);
  },
  'horómetro lejos del sugerido (origen TARJA) sin confirmación pide confirmar el equipo': () => {
    const ctx = armar();
    let err = null;
    try { abrir(ctx, { horom_ini: 100, motivo_correccion: 'cambió' }); } catch (e) { err = e; }
    assert.ok(err);
    assert.strictEqual(err.code, 'CONFIRMAR_EQUIPO');
    assert.ok(/CF-03/.test(err.message));
    assert.strictEqual(ctx.leer_('TARJAS_2026').length, 0);
    const r = abrir(ctx, { horom_ini: 100, motivo_correccion: 'cambió', confirmo_equipo: true });
    assert.strictEqual(r.ya_existia, false);
  },
  'horómetro lejos del sugerido con origen INGECOV no pregunta': () => {
    const ctx = armar();
    const r = ctx.abrirTarja_({ equipo: 'EX-01', legajo: '101', operador: 'PÉREZ JUAN', firma: FOTO, foto_horometro: FOTO,
      horom_ini: 4000, motivo_correccion: 'siembra vieja', checklist: checklistOk(ctx, 'EX-01'), op_id: 'op-x' });
    assert.strictEqual(r.ya_existia, false);
  },
  'corrección del horómetro exige motivo': () => {
    const ctx = armar();
    assert.throws(() => abrir(ctx, { horom_ini: 4810 }), /motivo/);
  },
  'cerrar calcula horas, saca de ABIERTAS y actualiza horom_tarja con origen TARJA': () => {
    const ctx = armar();
    const a = abrir(ctx);
    const r = ctx.cerrarTarja_({ tarja_id: a.tarja.id, foto_horometro: FOTO, horom_fin: 4807.5, legajo: '101', lat: -26.9, lon: -65.3, op_id: 'c-1' });
    assert.strictEqual(r.horas, 7.5);
    assert.strictEqual(ctx.leer_('ABIERTAS').length, 0);
    const eq = ctx.leer_('EQUIPOS').find((x) => x.codigo === 'CF-03');
    assert.strictEqual(Number(eq.horom_tarja), 4807.5);
    assert.strictEqual(eq.origen_horom, 'TARJA');
    assert.strictEqual(Number(eq.lat), -26.9);
    const t = ctx.leer_('TARJAS_2026')[0];
    assert.strictEqual(t.estado, 'cerrada');
    assert.strictEqual(t.cierre_tercero, 'NO');
  },
  'segunda jornada del mismo día no exige checklist': () => {
    const ctx = armar();
    const a = abrir(ctx);
    ctx.cerrarTarja_({ tarja_id: a.tarja.id, foto_horometro: FOTO, horom_fin: 4805, legajo: '101', op_id: 'c-1' });
    const e = ctx.estadoDelDia_({ equipo: 'CF-03' });
    assert.strictEqual(e.checklist_pendiente, false);
    assert.strictEqual(e.sugerido, 4805);
    const r = abrir(ctx, { op_id: 'op-2', horom_ini: 4805, checklist: [] });
    assert.strictEqual(r.ya_existia, false);
    assert.strictEqual(ctx.leer_('TARJAS_2026')[1].checklist_hecho, 'NO');
  },
  'cerrar por otra persona sin motivo rechaza; con motivo marca cierre_tercero': () => {
    const ctx = armar();
    const a = abrir(ctx);
    assert.throws(() => ctx.cerrarTarja_({ tarja_id: a.tarja.id, foto_horometro: FOTO, horom_fin: 4805, legajo: '102', operador: 'GÓMEZ ANA', op_id: 'c-1' }), /motivo/i);
    const r = ctx.cerrarTarja_({ tarja_id: a.tarja.id, foto_horometro: FOTO, horom_fin: 4805, legajo: '102', operador: 'GÓMEZ ANA', motivo_cierre_tercero: 'Cambio de turno', op_id: 'c-2' });
    assert.strictEqual(r.horas, 5);
    const t = ctx.leer_('TARJAS_2026')[0];
    assert.strictEqual(t.cierre_tercero, 'SI');
    assert.strictEqual(String(t.legajo_cierre), '102');
    assert.strictEqual(t.motivo_cierre_tercero, 'Cambio de turno');
  },
  'estadoDelDia_ con abierta por otro informa quién y desde cuándo': () => {
    const ctx = armar();
    abrir(ctx);
    const e = ctx.estadoDelDia_({ equipo: 'CF-03' });
    assert.ok(e.abierta);
    assert.strictEqual(e.abierta.operador, 'PÉREZ JUAN');
    assert.strictEqual(String(e.abierta.legajo), '101');
    assert.strictEqual(Number(e.abierta.horom_ini), 4800);
    assert.ok(e.abierta.ts_apertura);
  },
  'cambio de año: abierta del 31-dic se cierra el 1-ene': () => {
    const ctx = armar('2025-12-31');
    const a = abrir(ctx);
    assert.strictEqual(ctx.leer_('TARJAS_2025').length, 1);
    ctx.hoyStr_ = () => '2026-01-01';
    const r = ctx.cerrarTarja_({ tarja_id: a.tarja.id, foto_horometro: FOTO, horom_fin: 4806, legajo: '101', op_id: 'c-1' });
    assert.strictEqual(r.horas, 6);
    assert.strictEqual(ctx.leer_('ABIERTAS').length, 0);
    assert.strictEqual(ctx.leer_('TARJAS_2025')[0].estado, 'cerrada');
  },
  'cerrar idempotente por op_id y por estado': () => {
    const ctx = armar();
    const a = abrir(ctx);
    ctx.cerrarTarja_({ tarja_id: a.tarja.id, foto_horometro: FOTO, horom_fin: 4805, legajo: '101', op_id: 'c-1' });
    const r = ctx.cerrarTarja_({ tarja_id: a.tarja.id, foto_horometro: FOTO, horom_fin: 4805, legajo: '101', op_id: 'c-1' });
    assert.strictEqual(r.ya_estaba_cerrada, true);
  },
  'falla en checklist crea PENDIENTE y avisa a quienes tienen el módulo TARJAS': () => {
    const ctx = armar();
    const items = checklistOk(ctx, 'CF-03');
    items[0] = { orden: items[0].orden, estado: 'PROBLEMA', foto: FOTO, comentario: 'Pierde aceite' };
    abrir(ctx, { checklist: items });
    assert.strictEqual(ctx.leer_('PENDIENTES').length, 1);
    assert.strictEqual(ctx.__avisos.length, 1);
    assert.strictEqual(ctx.__avisos[0].aviso.prioridad, 'critica');
    assert.strictEqual(JSON.stringify(ctx.__avisos[0].aviso.destinatarios), JSON.stringify([{ con_modulo: 'TARJAS' }]));
  },
  'operador manual queda marcado y en OPERADORES_MANUALES': () => {
    const ctx = armar();
    abrir(ctx, { legajo: '', operador: 'Carlos Nuevo', operador_manual: true });
    const t = ctx.leer_('TARJAS_2026')[0];
    assert.strictEqual(t.operador_manual, 'SI');
    assert.strictEqual(ctx.leer_('OPERADORES_MANUALES').length, 1);
  },
  'sin GPS se acepta igual con precision_gps = sin GPS': () => {
    const ctx = armar();
    abrir(ctx, { lat: '', lon: '', precision_gps: '' });
    const t = ctx.leer_('TARJAS_2026')[0];
    assert.strictEqual(t.precision_gps, 'sin GPS');
    const eq = ctx.leer_('EQUIPOS').find((x) => x.codigo === 'CF-03');
    assert.strictEqual(String(eq.lat), '', 'no pisa la posición con vacío');
  }
};

// ---------- correcciones del review final ----------

module.exports['C1: cerrar acepta op_id_apertura y resuelve la tarja en el servidor'] = () => {
  const ctx = armar();
  abrir(ctx, { op_id: 'ap-77' });
  const r = ctx.cerrarTarja_({ op_id_apertura: 'ap-77', foto_horometro: FOTO, horom_fin: 4805, legajo: '101', op_id: 'c-1' });
  assert.strictEqual(r.horas, 5);
  assert.strictEqual(ctx.leer_('ABIERTAS').length, 0);
};
module.exports['C1: cerrar con op_id_apertura desconocido explica que falta la apertura'] = () => {
  const ctx = armar();
  assert.throws(() => ctx.cerrarTarja_({ op_id_apertura: 'nada', foto_horometro: FOTO, horom_fin: 1, op_id: 'c' }), /apertura/i);
};
module.exports['C2: el 1 de enero se puede consultar estado y abrir aunque no exista la hoja del año'] = () => {
  const ctx = armar('2026-01-01');
  ctx.ss_().deleteSheet(ctx.ss_().getSheetByName('TARJAS_2026'));
  const e = ctx.estadoDelDia_({ equipo: 'CF-03' });
  assert.strictEqual(e.checklist_pendiente, true);
  const r = abrir(ctx);
  assert.strictEqual(r.ya_existia, false);
  assert.strictEqual(ctx.leer_('TARJAS_2026').length, 1);
};
module.exports['I1: checklist inválido no deja nada escrito'] = () => {
  const ctx = armar();
  const items = checklistOk(ctx, 'CF-03');
  items[0] = { orden: items[0].orden, estado: 'PROBLEMA', foto: '', comentario: '' };
  assert.throws(() => abrir(ctx, { checklist: items }), /foto/);
  assert.strictEqual(ctx.leer_('TARJAS_2026').length, 0);
  assert.strictEqual(ctx.leer_('ABIERTAS').length, 0);
};
module.exports['I2: equipo sin horómetro previo acepta cualquier valor sin motivo ni confirmación'] = () => {
  const ctx = armar('2026-10-19', [{ codigo: 'MN-02', descripcion: 'Moto', tipo_rodado: 'rodante', lugar: '', activo_tarja: 'SI', horom_tarja: '', origen_horom: '' }]);
  const e = ctx.estadoDelDia_({ equipo: 'MN-02' });
  assert.strictEqual(e.sugerido, null);
  const r = ctx.abrirTarja_({ equipo: 'MN-02', legajo: '101', operador: 'PÉREZ JUAN', firma: FOTO, foto_horometro: FOTO, horom_ini: 4812, checklist: checklistOk(ctx, 'MN-02'), op_id: 'o' });
  assert.strictEqual(r.ya_existia, false);
  assert.strictEqual(ctx.leer_('TARJAS_2026')[0].excepcion, 'NO');
};
module.exports['I3: cierre con más de MAX horas se acepta solo con confirmación y motivo, y queda como excepción'] = () => {
  const ctx = armar();
  const a = abrir(ctx);
  assert.throws(() => ctx.cerrarTarja_({ tarja_id: a.tarja.id, foto_horometro: FOTO, horom_fin: 4830, legajo: '101', op_id: 'c1' }), /14 h/);
  assert.throws(() => ctx.cerrarTarja_({ tarja_id: a.tarja.id, foto_horometro: FOTO, horom_fin: 4830, legajo: '101', confirmo_exceso: true, op_id: 'c2' }), /motivo/i);
  const r = ctx.cerrarTarja_({ tarja_id: a.tarja.id, foto_horometro: FOTO, horom_fin: 4830, legajo: '101', confirmo_exceso: true, motivo_exceso: 'Quedó abierta dos días', op_id: 'c3' });
  assert.strictEqual(r.horas, 30);
  const t = ctx.leer_('TARJAS_2026')[0];
  assert.strictEqual(t.excepcion, 'SI');
  assert.ok(ctx.leer_('LOG').some((l) => l.accion === 'EXCESO_HORAS'));
};

module.exports['operario de la lista sin legajo (Casares) no queda marcado como manual'] = () => {
  const ctx = armar();
  abrir(ctx, { legajo: '', operador: 'Ariel Gómez' });
  assert.strictEqual(ctx.leer_('TARJAS_2026')[0].operador_manual, 'NO');
  assert.strictEqual(ctx.leer_('OPERADORES_MANUALES').length, 0);
};
