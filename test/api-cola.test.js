const assert = require('assert');
const { crearContextoFront } = require('./helpers');

/** IndexedDB falso mínimo: stores en memoria con put/getAll/delete/clear. */
function indexedDBFake() {
  const stores = {};
  const req = (result) => {
    const r = { result };
    setTimeout(() => r.onsuccess && r.onsuccess({ target: r }), 0);
    return r;
  };
  const db = {
    objectStoreNames: { contains: (n) => !!stores[n] },
    createObjectStore: (n) => { stores[n] = new Map(); return {}; },
    transaction: (n) => {
      const tx = {};
      tx.objectStore = () => ({
        put: (v) => { stores[n].set(v.id, v); return req(v.id); },
        getAll: () => req([...stores[n].values()]),
        delete: (id) => { stores[n].delete(id); return req(undefined); },
        clear: () => { stores[n].clear(); return req(undefined); }
      });
      setTimeout(() => tx.oncomplete && tx.oncomplete(), 1);
      return tx;
    }
  };
  return {
    __stores: stores,
    open: (nombre, version) => {
      const r = { result: db };
      setTimeout(() => {
        if (r.onupgradeneeded) r.onupgradeneeded({ oldVersion: 0 });
        r.onsuccess && r.onsuccess();
      }, 0);
      return r;
    }
  };
}

function armar(respuestas) {
  const idb = indexedDBFake();
  let online = true;
  const ctx = crearContextoFront(['docs/cola.js', 'docs/api.js'], {
    TARJA_API_URL: '/api',
    indexedDB: idb,
    fetch: async (url, o) => {
      if (!online) throw new TypeError('Failed to fetch');
      const body = JSON.parse(o.body);
      const r = respuestas(body);
      return { ok: true, json: async () => r };
    },
    setTimeout, clearTimeout
  });
  return { ctx, idb, setOnline: (v) => { online = v; } };
}

module.exports = {
  'C3: un rechazo del servidor sale de la cola pero queda en rechazadas con el mensaje': async () => {
    const { ctx, idb, setOnline } = armar(() => ({ ok: false, error: 'Ya hay una jornada abierta en CF-03.' }));
    setOnline(false);
    const r = await ctx.API.enviar('abrir', { equipo: 'CF-03', horom_ini: 1 }, 'CF-03');
    assert.strictEqual(r.encolado, true);
    setOnline(true);
    await ctx.API.sincronizar(() => {});
    assert.strictEqual((await ctx.API.pendientesEnCola()).length, 0);
    const rech = await ctx.API.rechazadas();
    assert.strictEqual(rech.length, 1);
    assert.strictEqual(rech[0].equipo, 'CF-03');
    assert.ok(/jornada abierta/.test(rech[0].error));
    await ctx.API.descartarRechazada(rech[0].id);
    assert.strictEqual((await ctx.API.rechazadas()).length, 0);
  },
  'C1: "todavía no llegó la apertura" no es rechazo: el cierre se queda en la cola': async () => {
    const { ctx, setOnline } = armar((b) => b.action === 'cerrar'
      ? { ok: false, error: 'Todavía no llegó la apertura de esta jornada. Se va a reintentar cuando llegue.' }
      : { ok: true, data: {} });
    setOnline(false);
    await ctx.API.enviar('cerrar', { op_id_apertura: 'A', horom_fin: 5 }, 'CF-03');
    setOnline(true);
    const ok = await ctx.API.sincronizar(() => {});
    assert.strictEqual(ok, true);
    assert.strictEqual((await ctx.API.pendientesEnCola()).length, 1, 'sigue en cola');
    assert.strictEqual((await ctx.API.rechazadas()).length, 0);
  },
  'sincronizar manda la apertura y el cierre en orden, el cierre con op_id_apertura resuelto en el servidor': async () => {
    const enviados = [];
    const { ctx, setOnline } = armar((b) => { enviados.push(b); return { ok: true, data: b.action === 'abrir' ? { tarja: { id: 'T1' } } : {} }; });
    setOnline(false);
    const a = await ctx.API.enviar('abrir', { equipo: 'CF-03' }, 'CF-03');
    await ctx.API.enviar('cerrar', { op_id_apertura: a.op_id, horom_fin: 5 }, 'CF-03');
    setOnline(true);
    await ctx.API.sincronizar(() => {});
    assert.strictEqual(enviados.map((e) => e.action).join('|'), 'abrir|cerrar');
    assert.strictEqual(enviados[1].tarja_id, 'T1');
    assert.strictEqual((await ctx.API.pendientesEnCola()).length, 0);
  }
};
