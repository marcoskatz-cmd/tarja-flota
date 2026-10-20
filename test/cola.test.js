const assert = require('assert');
const { crearContextoFront } = require('./helpers');

const ctx = crearContextoFront(['docs/cola.js']);

module.exports = {
  'I6 ordenarCola_: solo por ts, así dos jornadas del mismo día salen abrir1, cerrar1, abrir2': () => {
    const items = [
      { id: 'a2', action: 'abrir', ts: 9, datos: { op_id: 'a2' } },
      { id: 'c1', action: 'cerrar', ts: 5, datos: { op_id: 'c1', op_id_apertura: 'a1' } },
      { id: 'a1', action: 'abrir', ts: 1, datos: { op_id: 'a1' } }
    ];
    assert.strictEqual(ctx.ordenarCola_(items).map((i) => i.id).join('|'), 'a1|c1|a2');
  },
  'resolverTarjaId_: el cierre toma el tarja_id de la respuesta de su apertura': () => {
    const cierre = { action: 'cerrar', datos: { op_id: 'c', op_id_apertura: 'a', horom_fin: 10 } };
    const r = ctx.resolverTarjaId_(cierre, { a: 'T-1' });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.datos.tarja_id, 'T-1');
    assert.strictEqual(r.datos.op_id_apertura, undefined);
  },
  'C1 resolverTarjaId_: sin respuesta local el cierre viaja con op_id_apertura y lo resuelve el servidor': () => {
    const r = ctx.resolverTarjaId_({ action: 'cerrar', datos: { op_id: 'c', op_id_apertura: 'a' } }, {});
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.datos.op_id_apertura, 'a');
    assert.strictEqual(r.datos.tarja_id, undefined);
  },
  'resolverTarjaId_: un cierre con tarja_id directo pasa sin cambios': () => {
    const r = ctx.resolverTarjaId_({ action: 'cerrar', datos: { op_id: 'c', tarja_id: 'T-9' } }, {});
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.datos.tarja_id, 'T-9');
  }
};
