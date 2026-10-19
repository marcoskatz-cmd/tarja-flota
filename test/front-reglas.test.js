const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { crearContextoFront } = require('./helpers');

function front(apiLlamar, store) {
  const ctx = crearContextoFront(['docs/reglas.js', 'docs/datos.js'], { API: { llamar: apiLlamar } });
  Object.assign(ctx.localStorage.__store, store || {});
  return ctx;
}

const EQUIPOS = { hoy: '2026-10-19', equipos: [{ codigo: 'CF-03', lugar: 'Autovías' }] };
const PERSONAS = { personas: [{ legajo: '101', nombre: 'PÉREZ JUAN' }] };
const ITEMS = { items: [{ orden: 1, tipo: '', item: 'Pérdidas' }] };

module.exports = {
  'docs/reglas.js es copia exacta de apps-script/Reglas.gs': () => {
    const a = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Reglas.gs'), 'utf8');
    const b = fs.readFileSync(path.join(__dirname, '..', 'docs', 'reglas.js'), 'utf8');
    assert.strictEqual(a, b, 'correr npm run reglas');
  },
  'Datos.cargar con señal guarda nómina, equipos e ítems en localStorage': async () => {
    const ctx = front(async (a) => ({ nomina: PERSONAS, equipos: EQUIPOS, items: ITEMS })[a]);
    const d = await ctx.Datos.cargar();
    assert.strictEqual(d.equipos.length, 1);
    assert.strictEqual(d.personas.length, 1);
    assert.strictEqual(d.items.length, 1);
    assert.ok(ctx.localStorage.getItem('tf_equipos'));
    assert.ok(ctx.localStorage.getItem('tf_personas'));
    assert.ok(ctx.localStorage.getItem('tf_items'));
  },
  'Datos.cargar sin señal devuelve lo guardado': async () => {
    const ctx = front(async () => { throw new Error('No se pudo conectar con el servidor.'); }, {
      tf_equipos: JSON.stringify(EQUIPOS.equipos), tf_personas: JSON.stringify(PERSONAS.personas), tf_items: JSON.stringify(ITEMS.items)
    });
    const d = await ctx.Datos.cargar();
    assert.strictEqual(d.equipos[0].codigo, 'CF-03');
    assert.strictEqual(d.desdeCache, true);
  },
  'Datos.cargar sin señal y sin nada guardado lanza el texto exacto': async () => {
    const ctx = front(async () => { throw new Error('No se pudo conectar con el servidor.'); });
    await assert.rejects(ctx.Datos.cargar(), /Para la primera vez hace falta señal\./);
  },
  'Datos.equipo busca por código en lo cargado': async () => {
    const ctx = front(async (a) => ({ nomina: PERSONAS, equipos: EQUIPOS, items: ITEMS })[a]);
    await ctx.Datos.cargar();
    assert.strictEqual(ctx.Datos.equipo('cf-03').lugar, 'Autovías');
    assert.strictEqual(ctx.Datos.equipo('XX'), null);
  }
};
