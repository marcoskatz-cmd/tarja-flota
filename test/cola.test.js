const assert = require('assert');
const { crearContextoFront } = require('./helpers');

const ctx = crearContextoFront(['docs/cola.js']);

module.exports = {
  'ordenarCola_: apertura antes que su cierre aunque el cierre tenga ts menor': () => {
    const items = [
      { id: 'c', action: 'cerrar', ts: 5, datos: { op_id: 'c', op_id_apertura: 'a' } },
      { id: 'a', action: 'abrir', ts: 9, datos: { op_id: 'a' } },
      { id: 'b', action: 'abrir', ts: 1, datos: { op_id: 'b' } }
    ];
    assert.strictEqual(ctx.ordenarCola_(items).map((i) => i.id).join('|'), 'b|a|c');
  },
  'resolverTarjaId_: el cierre toma el tarja_id de la respuesta de su apertura': () => {
    const cierre = { action: 'cerrar', datos: { op_id: 'c', op_id_apertura: 'a', horom_fin: 10 } };
    const r = ctx.resolverTarjaId_(cierre, { a: 'T-1' });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.datos.tarja_id, 'T-1');
    assert.strictEqual(r.datos.op_id_apertura, undefined);
  },
  'resolverTarjaId_: si la apertura todavía no se envió, el cierre espera': () => {
    const r = ctx.resolverTarjaId_({ action: 'cerrar', datos: { op_id: 'c', op_id_apertura: 'a' } }, {});
    assert.strictEqual(r.ok, false);
    assert.ok(/apertura/.test(r.motivo));
  },
  'resolverTarjaId_: un cierre con tarja_id directo pasa sin cambios': () => {
    const r = ctx.resolverTarjaId_({ action: 'cerrar', datos: { op_id: 'c', tarja_id: 'T-9' } }, {});
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.datos.tarja_id, 'T-9');
  }
};
