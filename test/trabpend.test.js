const assert = require('assert');
const { crearContexto, cargarHoja, spreadsheetFake } = require('./helpers');

const TP_ID = '1muXaJvsdAH0q3bXZj3yiDanxT3aCfUL5EhY_ORgvx7o';
// Encabezado real de la hoja (4-nov-2026): el orden y los nombres son los de Marcos.
const HEADS = ['FECHA', 'EQUIPO', 'CÓDIGO', 'N° SERIE/PATENTE', 'DESCRIPCIÓN TRABAJOS', 'ORIGEN/RESPONSABLE', 'ESTADO', 'FECHA RESOLUCIÓN', 'DESCRIPCIÓN RESOLUCIÓN', 'ID TRABAJO'];

function armar(filasTP, pendientes) {
  const ctx = crearContexto({ cargar: ['Config.gs', 'Reglas.gs', 'Planillas.gs', 'Fotos.gs', 'Fuentes.gs', 'Tarjas.gs', 'Espejo.gs', 'TrabajosPendientes.gs', 'Sesion.gs', 'Panel.gs', 'Triggers.gs', 'Mantenimiento.gs', 'Codigo.gs'], hoy: '2026-11-04' });
  ctx.setupCompleto_();
  cargarHoja(ctx.ss_(), 'EQUIPOS', ctx.HOJAS.EQUIPOS, [
    { codigo: 'CF-03', descripcion: 'Cargador frontal John Deere 624K', marca: 'John Deere', modelo: '624K', patente: 'AB123CD', tipo_rodado: 'rodante', activo_tarja: 'SI' },
    { codigo: 'RTP-11', descripcion: 'Retro', tipo_rodado: 'rodante', activo_tarja: 'SI' }
  ]);
  cargarHoja(ctx.ss_(), 'TARJAS_2026', ctx.COLS_TARJAS, [
    { id: 'T1', equipo: 'CF-03', fecha: '2026-11-02', estado: 'cerrada', operador: 'Pérez Juan', operador_manual: 'NO' }
  ]);
  cargarHoja(ctx.ss_(), 'PENDIENTES', ctx.HOJAS.PENDIENTES, pendientes);
  const tp = spreadsheetFake(TP_ID, 'TRABAJOS REALIZADOS EN EQUIPOS');
  ctx.__planillas[TP_ID] = tp;
  cargarHoja(tp, 'TRABAJOS PENDIENTES', HEADS, filasTP);
  return { ctx, tp };
}

const leerTP = (tp) => tp.getSheetByName('TRABAJOS PENDIENTES').getDataRange().getValues().slice(1)
  .map((f) => { const o = {}; HEADS.forEach((c, i) => { o[c] = f[i] === undefined ? '' : f[i]; }); return o; });

module.exports = {
  'una falla abierta de la tarja se escribe en TRABAJOS PENDIENTES como Pendiente con origen Tarja': () => {
    const { ctx, tp } = armar(
      [{ 'CÓDIGO': 'CF-05', EQUIPO: 'CF-05 — Volvo', FECHA: new Date(2026, 6, 27), 'DESCRIPCIÓN TRABAJOS': 'ruido', 'ORIGEN/RESPONSABLE': 'Matías', ESTADO: 'Pendiente' }],
      [{ id: 'P1', tarja_id: 'T1', equipo: 'CF-03', fecha_apertura: '2026-11-02', orden: 3, item: 'Luces', comentario: 'no anda la trasera', foto: 'https://drive/x', estado: 'abierto' }]
    );
    const r = ctx.sincronizarTrabajosPendientes_();
    assert.strictEqual(r.agregados, 1);
    const filas = leerTP(tp);
    assert.strictEqual(filas.length, 2);
    const f = filas[1];
    assert.strictEqual(f['CÓDIGO'], 'CF-03');
    assert.strictEqual(f.EQUIPO, 'CF-03 — Cargador frontal John Deere 624K');
    assert.strictEqual(f.FECHA, '02/11/2026'); // texto: la hoja rechaza Date por script
    assert.ok(/Luces/.test(f['DESCRIPCIÓN TRABAJOS']) && /no anda la trasera/.test(f['DESCRIPCIÓN TRABAJOS']) && /drive\/x/.test(f['DESCRIPCIÓN TRABAJOS']));
    assert.strictEqual(f['ORIGEN/RESPONSABLE'], 'Tarja · Pérez Juan');
    assert.strictEqual(f.ESTADO, 'Pendiente');
    assert.strictEqual(f['N° SERIE/PATENTE'], 'AB123CD');
    assert.strictEqual(f['ID TRABAJO'], 'P1');
    // segunda corrida: nada nuevo
    assert.strictEqual(ctx.sincronizarTrabajosPendientes_().agregados, 0);
    assert.strictEqual(leerTP(tp).length, 2);
  },

  'si el taller la marca Realizado en la hoja, la tarja cierra su pendiente': () => {
    const { ctx } = armar(
      [{ 'CÓDIGO': 'CF-03', EQUIPO: 'x', FECHA: new Date(2026, 10, 2), 'DESCRIPCIÓN TRABAJOS': 'Luces', 'ORIGEN/RESPONSABLE': 'Tarja · Pérez', ESTADO: 'Realizado', 'FECHA RESOLUCIÓN': '03/11/2026', 'DESCRIPCIÓN RESOLUCIÓN': 'Cambio de lámpara', 'ID TRABAJO': 'P1' }],
      [{ id: 'P1', tarja_id: 'T1', equipo: 'CF-03', fecha_apertura: '2026-11-02', orden: 3, item: 'Luces', estado: 'abierto' }]
    );
    const r = ctx.sincronizarTrabajosPendientes_();
    assert.strictEqual(r.cerrados_en_tarja, 1);
    const p = ctx.leer_('PENDIENTES')[0];
    assert.strictEqual(p.estado, 'cerrado');
    assert.strictEqual(p.motivo_cierre, 'Reparado');
    assert.ok(/INGECOV/.test(p.cerrado_por));
    assert.strictEqual(String(p.fecha_cierre), '2026-11-03');
  },

  'si la cierran en el panel de la tarja, la hoja pasa a Realizado': () => {
    const { ctx, tp } = armar(
      [{ 'CÓDIGO': 'CF-03', EQUIPO: 'x', FECHA: new Date(2026, 10, 2), 'DESCRIPCIÓN TRABAJOS': 'Luces', 'ORIGEN/RESPONSABLE': 'Tarja · Pérez', ESTADO: 'Pendiente', 'ID TRABAJO': 'P1' }],
      [{ id: 'P1', tarja_id: 'T1', equipo: 'CF-03', fecha_apertura: '2026-11-02', orden: 3, item: 'Luces', estado: 'cerrado', fecha_cierre: '2026-11-04', motivo_cierre: 'Repuesto pedido', cerrado_por: 'Bruno' }]
    );
    const r = ctx.sincronizarTrabajosPendientes_();
    assert.strictEqual(r.cerrados_en_hoja, 1);
    const f = leerTP(tp)[0];
    assert.strictEqual(f.ESTADO, 'Realizado');
    assert.strictEqual(f['FECHA RESOLUCIÓN'], '04/11/2026');
    assert.ok(/Repuesto pedido/.test(f['DESCRIPCIÓN RESOLUCIÓN']) && /Bruno/.test(f['DESCRIPCIÓN RESOLUCIÓN']));
  },

  'una fila que el taller ya resolvió no se pisa aunque la tarja la cierre con otro motivo': () => {
    const { ctx, tp } = armar(
      [{ 'CÓDIGO': 'CF-03', EQUIPO: 'x', FECHA: new Date(2026, 10, 2), 'DESCRIPCIÓN TRABAJOS': 'Luces', ESTADO: 'Realizado', 'FECHA RESOLUCIÓN': new Date(2026, 10, 3), 'DESCRIPCIÓN RESOLUCIÓN': 'Lo hizo el taller', 'ID TRABAJO': 'P1' }],
      [{ id: 'P1', tarja_id: 'T1', equipo: 'CF-03', fecha_apertura: '2026-11-02', orden: 3, item: 'Luces', estado: 'cerrado', fecha_cierre: '2026-11-04', motivo_cierre: 'Sin acción', cerrado_por: 'Bruno' }]
    );
    ctx.sincronizarTrabajosPendientes_();
    assert.strictEqual(leerTP(tp)[0]['DESCRIPCIÓN RESOLUCIÓN'], 'Lo hizo el taller');
  },

  'una fila rota (origen Tarja sin ID ni ESTADO) se reutiliza en vez de agregar otra': () => {
    const { ctx, tp } = armar(
      [{ 'CÓDIGO': 'CF-05', EQUIPO: 'x', 'DESCRIPCIÓN TRABAJOS': 'basura', 'ORIGEN/RESPONSABLE': 'Tarja · NO', ESTADO: '', 'ID TRABAJO': '' },
       { 'CÓDIGO': 'CF-03', EQUIPO: 'x', 'DESCRIPCIÓN TRABAJOS': 'ruido', 'ORIGEN/RESPONSABLE': 'Ariel', ESTADO: 'Pendiente', 'ID TRABAJO': 'T-1' }],
      [{ id: 'P1', tarja_id: 'T1', equipo: 'CF-03', fecha_apertura: '2026-11-02', item: 'Luces', estado: 'abierto' }]
    );
    assert.strictEqual(ctx.sincronizarTrabajosPendientes_().agregados, 1);
    const filas = leerTP(tp);
    assert.strictEqual(filas.length, 2);
    assert.strictEqual(filas[0]['ID TRABAJO'], 'P1');
    assert.strictEqual(filas[0]['CÓDIGO'], 'CF-03');
    assert.strictEqual(filas[1]['ID TRABAJO'], 'T-1');
  },

  'sin SHEET_TRABAJOS_ID configurado no hace nada ni rompe': () => {
    const { ctx } = armar([], [{ id: 'P1', tarja_id: 'T1', equipo: 'CF-03', fecha_apertura: '2026-11-02', item: 'Luces', estado: 'abierto' }]);
    const fila = ctx.leer_('CONFIG').find((c) => c.clave === 'SHEET_TRABAJOS_ID');
    ctx.actualizar_('CONFIG', fila._fila, { valor: '' });
    assert.strictEqual(JSON.stringify(ctx.sincronizarTrabajosPendientes_()), JSON.stringify({ omitido: 'sin SHEET_TRABAJOS_ID' }));
  },

  'al cerrar una falla desde el panel se espeja en la hoja al instante': () => {
    const { ctx, tp } = armar(
      [{ 'CÓDIGO': 'CF-03', EQUIPO: 'x', FECHA: new Date(2026, 10, 2), 'DESCRIPCIÓN TRABAJOS': 'Luces', ESTADO: 'Pendiente', 'ID TRABAJO': 'P1' }],
      [{ id: 'P1', tarja_id: 'T1', equipo: 'CF-03', fecha_apertura: '2026-11-02', orden: 3, item: 'Luces', estado: 'abierto' }]
    );
    ctx.cerrarPendiente_({ id: 'P1', motivo: 'Reparado' }, { nombre: 'Bruno' });
    assert.strictEqual(leerTP(tp)[0].ESTADO, 'Realizado');
  }
};
