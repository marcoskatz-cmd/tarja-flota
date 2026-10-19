const assert = require('assert');
const { crearContexto } = require('./helpers');

module.exports = {
  'Config.gs carga y define MAX_HORAS_JORNADA = 14': () => {
    const ctx = crearContexto({ cargar: ['Config.gs'] });
    assert.strictEqual(ctx.CFG.MAX_HORAS_JORNADA, 14);
  }
};
