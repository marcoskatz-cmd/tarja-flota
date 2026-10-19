const assert = require('assert');
const { crearContexto, cargarHoja } = require('./helpers');

const FOTO = 'data:image/jpeg;base64,AAAA';
const USUARIO = { ok: true, legajo: 1, nombre_visible: 'Marcos Katz', es_admin: true, modulos: ['TARJAS'] };

function armar(opciones) {
  opciones = opciones || {};
  const ctx = crearContexto({
    hoy: '2026-10-19',
    fetch: (url, o) => {
      const body = JSON.parse(o.payload);
      if (body.accion === 'validar_sesion_modulo') return body.payload.sesion === 'S1' ? USUARIO : { ok: false, error: 'inválida' };
      return { ok: true };
    }
  });
  ctx.setupCompleto_();
  cargarHoja(ctx.ss_(), 'EQUIPOS', ctx.HOJAS.EQUIPOS, [
    { codigo: 'CF-03', descripcion: 'Cargadora', tipo_rodado: 'rodante', lugar: 'Autovías', activo_tarja: 'SI', horom_tarja: 4800, origen_horom: 'TARJA', ultima_tarja: '2026-10-18', lat: -26.8, lon: -65.2, ts_pos: '2026-10-18 17:00:00' },
    { codigo: 'EX-01', descripcion: 'Excavadora', tipo_rodado: 'oruga', lugar: 'Corrientes', activo_tarja: 'SI', horom_tarja: 100, origen_horom: 'INGECOV', ultima_tarja: '2026-10-05' },
    { codigo: 'MN-02', descripcion: 'Motoniveladora', tipo_rodado: 'rodante', lugar: 'Autovías', activo_tarja: 'SI', horom_tarja: '', origen_horom: '' }
  ]);
  cargarHoja(ctx.ss_(), 'PERSONAL', ctx.HOJAS.PERSONAL, [{ legajo: '101', nombre: 'PÉREZ JUAN', activo: 'SI' }, { legajo: '102', nombre: 'GÓMEZ ANA', activo: 'SI' }]);
  return ctx;
}

function abrir(ctx, extra) {
  const items = ctx.estadoDelDia_({ equipo: (extra && extra.equipo) || 'CF-03' }).items.map((i) => ({ orden: i.orden, estado: 'OK' }));
  return ctx.abrirTarja_(Object.assign({ equipo: 'CF-03', legajo: '101', operador: 'PÉREZ JUAN', firma: FOTO, foto_horometro: FOTO, horom_ini: 4800, checklist: items, lat: -26.81, lon: -65.21, op_id: 'op-' + Math.random() }, extra || {}));
}

const S = { sesion: 'S1' };

module.exports = {
  'sin sesión válida el panel rechaza con texto llano': () => {
    const ctx = armar();
    assert.throws(() => ctx.RUTAS_PANEL.hoy({ sesion: 'MALA' }), /Volvé a abrir desde la app INGECO/);
    assert.throws(() => ctx.RUTAS_PANEL.hoy({}), /app INGECO/);
  },
  'la sesión se cachea en Script Properties, no en CacheService': () => {
    const ctx = armar();
    ctx.RUTAS_PANEL.hoy(S);
    ctx.RUTAS_PANEL.hoy(S);
    assert.strictEqual(ctx.__fetch.length, 1, 'una sola validación remota');
    assert.ok(Object.keys(ctx.__props).some((k) => k.indexOf('SES_') === 0));
  },
  'hoy clasifica cerrada / abierta / sin_tarja / sin_actividad': () => {
    const ctx = armar();
    const a = abrir(ctx);
    ctx.cerrarTarja_({ tarja_id: a.tarja.id, foto_horometro: FOTO, horom_fin: 4806, legajo: '101', op_id: 'c1' });
    abrir(ctx, { op_id: 'op2', horom_ini: 4806, checklist: [] });
    const h = ctx.RUTAS_PANEL.hoy(S);
    const por = {};
    h.equipos.forEach((e) => { por[e.codigo] = e; });
    assert.strictEqual(por['CF-03'].estado, 'abierta');
    assert.strictEqual(por['CF-03'].jornadas, 2);
    assert.strictEqual(por['CF-03'].horas, 6);
    assert.strictEqual(por['EX-01'].estado, 'sin_actividad');
    assert.strictEqual(por['MN-02'].estado, 'sin_actividad', 'sin tarja nunca = sin actividad');
    assert.strictEqual(h.fecha, '2026-10-19');
    assert.ok(Array.isArray(h.diagnostico));
  },
  'hoy: equipo con tarja reciente pero no hoy = sin_tarja': () => {
    const ctx = armar();
    const h = ctx.RUTAS_PANEL.hoy(S);
    assert.strictEqual(h.equipos.find((e) => e.codigo === 'CF-03').estado, 'sin_tarja');
  },
  'mapa devuelve solo equipos con posición': () => {
    const ctx = armar();
    const m = ctx.RUTAS_PANEL.mapa(S);
    assert.strictEqual(m.puntos.length, 1);
    assert.strictEqual(m.puntos[0].codigo, 'CF-03');
    assert.strictEqual(m.puntos[0].lat, -26.8);
  },
  'equipo_historial trae tarjas, horómetro INGECOV y marca diferencia alta': () => {
    const ctx = armar();
    ctx.horometrosIngecov_ = () => ({ 'CF-03': 5000 });
    const a = abrir(ctx);
    ctx.cerrarTarja_({ tarja_id: a.tarja.id, foto_horometro: FOTO, horom_fin: 4806, legajo: '101', op_id: 'c1' });
    const r = ctx.RUTAS_PANEL.equipo_historial(Object.assign({ codigo: 'CF-03' }, S));
    assert.strictEqual(r.tarjas.length, 1);
    assert.strictEqual(r.horom_tarja, 4806);
    assert.strictEqual(r.horom_ingecov, 5000);
    assert.strictEqual(r.diferencia_alta, true);
  },
  'consolidado suma horas por equipo y mes': () => {
    const ctx = armar();
    const a = abrir(ctx);
    ctx.cerrarTarja_({ tarja_id: a.tarja.id, foto_horometro: FOTO, horom_fin: 4806, legajo: '101', op_id: 'c1' });
    const b = abrir(ctx, { op_id: 'op2', horom_ini: 4806, checklist: [] });
    ctx.cerrarTarja_({ tarja_id: b.tarja.id, foto_horometro: FOTO, horom_fin: 4808, legajo: '101', op_id: 'c2' });
    const r = ctx.RUTAS_PANEL.consolidado(Object.assign({ anio: 2026, mes: 10 }, S));
    assert.strictEqual(r.filas.length, 1);
    assert.strictEqual(r.filas[0].codigo, 'CF-03');
    assert.strictEqual(r.filas[0].horas, 8);
    assert.strictEqual(r.filas[0].jornadas, 2);
    assert.strictEqual(r.filas[0].lugar, 'Autovías');
    assert.strictEqual(r.filas[0].mes, '2026-10');
  },
  'anular una abierta la saca de ABIERTAS y queda en LOG con el usuario del shell': () => {
    const ctx = armar();
    const a = abrir(ctx);
    ctx.RUTAS_PANEL.anular(Object.assign({ tarja_id: a.tarja.id, motivo: 'prueba' }, S));
    assert.strictEqual(ctx.leer_('ABIERTAS').length, 0);
    assert.strictEqual(ctx.leer_('TARJAS_2026')[0].estado, 'anulada');
    assert.ok(ctx.leer_('LOG').some((l) => l.accion === 'ANULAR_TARJA' && l.usuario === 'Marcos Katz'));
  },
  'anular la última cerrada recalcula el horómetro del equipo': () => {
    const ctx = armar();
    const a = abrir(ctx);
    ctx.cerrarTarja_({ tarja_id: a.tarja.id, foto_horometro: FOTO, horom_fin: 4806, legajo: '101', op_id: 'c1' });
    ctx.RUTAS_PANEL.anular(Object.assign({ tarja_id: a.tarja.id, motivo: 'error' }, S));
    assert.strictEqual(Number(ctx.leer_('EQUIPOS').find((e) => e.codigo === 'CF-03').horom_tarja), 4800);
  },
  'pendientes y cerrar_pendiente con motivo de la lista': () => {
    const ctx = armar();
    const items = ctx.estadoDelDia_({ equipo: 'CF-03' }).items.map((i) => ({ orden: i.orden, estado: 'OK' }));
    items[0] = { orden: items[0].orden, estado: 'PROBLEMA', foto: FOTO, comentario: 'Pierde' };
    abrir(ctx, { checklist: items });
    const p = ctx.RUTAS_PANEL.pendientes(S);
    assert.strictEqual(p.pendientes.length, 1);
    assert.throws(() => ctx.RUTAS_PANEL.cerrar_pendiente(Object.assign({ id: p.pendientes[0].id, motivo: 'Cualquiera' }, S)), /motivo/i);
    ctx.RUTAS_PANEL.cerrar_pendiente(Object.assign({ id: p.pendientes[0].id, motivo: 'Reparado' }, S));
    assert.strictEqual(ctx.RUTAS_PANEL.pendientes(S).pendientes.length, 0);
  },
  'set_equipo persiste tipo_rodado y activo_tarja': () => {
    const ctx = armar();
    ctx.RUTAS_PANEL.set_equipo(Object.assign({ codigo: 'MN-02', tipo_rodado: 'oruga', activo_tarja: 'NO' }, S));
    const e = ctx.leer_('EQUIPOS').find((x) => x.codigo === 'MN-02');
    assert.strictEqual(e.tipo_rodado, 'oruga');
    assert.strictEqual(e.activo_tarja, 'NO');
    assert.throws(() => ctx.RUTAS_PANEL.set_equipo(Object.assign({ codigo: 'MN-02', tipo_rodado: 'volador' }, S)), /oruga|rodante/);
  },
  'equipos_config devuelve todos incluidos los inactivos': () => {
    const ctx = armar();
    ctx.RUTAS_PANEL.set_equipo(Object.assign({ codigo: 'MN-02', activo_tarja: 'NO' }, S));
    assert.strictEqual(ctx.RUTAS_PANEL.equipos_config(S).equipos.length, 3);
  },
  'vincular_operador reescribe el legajo de las tarjas manuales con ese nombre': () => {
    const ctx = armar();
    abrir(ctx, { legajo: '', operador: 'Carlos Nuevo', operador_manual: true });
    const om = ctx.RUTAS_PANEL.operadores_manuales(S);
    assert.strictEqual(om.operadores.length, 1);
    ctx.RUTAS_PANEL.vincular_operador(Object.assign({ nombre: 'Carlos Nuevo', legajo: '102' }, S));
    const t = ctx.leer_('TARJAS_2026')[0];
    assert.strictEqual(String(t.legajo), '102');
    assert.strictEqual(t.operador, 'GÓMEZ ANA');
    assert.strictEqual(String(ctx.leer_('OPERADORES_MANUALES')[0].legajo_vinculado), '102');
  },
  'diagnostico expone el resultado de diagnosticar_': () => {
    const ctx = armar();
    ctx.setProp_('DIAG_PERSONAL', 'Falta LEGAJO');
    const d = ctx.RUTAS_PANEL.diagnostico(S);
    assert.ok(d.problemas.some((x) => x.hoja === 'FUENTE_PERSONAL'));
  }
};
