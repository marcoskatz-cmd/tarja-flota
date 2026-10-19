const assert = require('assert');
const { crearContexto, cargarHoja } = require('./helpers');

function armar() {
  const ctx = crearContexto({ hoy: '2026-10-19' });
  ctx.setupCompleto_();
  ctx.tsStr_ = () => '2026-10-19 20:00:00';
  cargarHoja(ctx.ss_(), 'ABIERTAS', ctx.HOJAS.ABIERTAS, [
    { tarja_id: 'larga', equipo: 'CF-03', legajo: '101', operador: 'PÉREZ JUAN', ts_apertura: '2026-10-19 02:00:00', anio: '2026' },
    { tarja_id: 'corta', equipo: 'EX-01', legajo: '102', operador: 'GÓMEZ ANA', ts_apertura: '2026-10-19 17:00:00', anio: '2026' }
  ]);
  return ctx;
}

module.exports = {
  'avisarAbiertasLargas avisa solo la abierta de más de 16 h, con clave única': () => {
    const ctx = armar();
    const r = ctx.avisarAbiertasLargas();
    assert.strictEqual(r.avisadas, 1);
    assert.strictEqual(ctx.__avisos.length, 1);
    const a = ctx.__avisos[0].aviso;
    assert.ok(/CF-03/.test(a.titulo));
    assert.ok(/PÉREZ JUAN/.test(a.cuerpo));
    assert.strictEqual(a.clave_unica, 'abierta-larga-larga');
    assert.strictEqual(JSON.stringify(a.destinatarios), JSON.stringify([{ con_modulo: 'TARJAS' }]));
  },
  'instalarTriggers_ borra los propios y crea sync y aviso horarios': () => {
    const ctx = armar();
    const creados = [];
    const borrados = [];
    ctx.ScriptApp = {
      getProjectTriggers: () => [{ getHandlerFunction: () => 'syncFuentes', __id: 1 }, { getHandlerFunction: () => 'otraCosa', __id: 2 }],
      deleteTrigger: (t) => borrados.push(t.getHandlerFunction()),
      newTrigger: (fn) => ({ timeBased: () => ({ everyHours: (h) => ({ create: () => creados.push(fn + ':' + h) }) }) })
    };
    const r = ctx.instalarTriggers_();
    assert.strictEqual(borrados.join('|'), 'syncFuentes', 'solo borra los propios');
    assert.strictEqual(creados.sort().join('|'), 'avisarAbiertasLargas:1|syncFuentes:1');
    assert.strictEqual(r.instalados.length, 2);
  }
};
