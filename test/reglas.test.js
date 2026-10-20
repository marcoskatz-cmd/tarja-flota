const assert = require('assert');
const { crearContexto } = require('./helpers');

const ctx = crearContexto({ cargar: ['Config.gs', 'Reglas.gs'] });

module.exports = {
  'esPesado_: camión CMN no es pesado': () => {
    assert.strictEqual(ctx.esPesado_('CAMION VOLCADOR', 'CMN-03'), false);
  },
  'esPesado_: camioneta CMT no es pesado': () => {
    assert.strictEqual(ctx.esPesado_('CAMIONETA', 'CMT-10'), false);
  },
  'esPesado_: generador es soporte, no pesado': () => {
    assert.strictEqual(ctx.esPesado_('GRUPO ELECTRÓGENO', 'GE-01'), false);
  },
  'esPesado_: cargadora frontal es pesado': () => {
    assert.strictEqual(ctx.esPesado_('CARGADORA FRONTAL', 'CF-03'), true);
  },
  'inferirTipoRodado_: excavadora → oruga': () => {
    assert.strictEqual(ctx.inferirTipoRodado_('EXCAVADORA HIDRAULICA', 'PC200'), 'oruga');
  },
  'inferirTipoRodado_: motoniveladora → rodante': () => {
    assert.strictEqual(ctx.inferirTipoRodado_('MOTONIVELADORA', '140K'), 'rodante');
  },
  'inferirTipoRodado_: desconocido → vacío': () => {
    assert.strictEqual(ctx.inferirTipoRodado_('PLANTA ASFALTICA', 'X'), '');
  },
  'calcularHoras_: fin menor que inicio rechaza': () => {
    const r = ctx.calcularHoras_(10, 9, 14);
    assert.strictEqual(r.ok, false);
    assert.ok(/menor que el de apertura/.test(r.error));
  },
  'calcularHoras_: más de 14 h rechaza con el máximo en el texto': () => {
    const r = ctx.calcularHoras_(10, 25, 14);
    assert.strictEqual(r.ok, false);
    assert.ok(/14 h/.test(r.error));
  },
  'calcularHoras_: normal devuelve horas': () => {
    assert.strictEqual(JSON.stringify(ctx.calcularHoras_(100, 107.5, 14)), JSON.stringify({ ok: true, horas: 7.5 }));
  },
  'agruparEquipos_: lugar preferido primero, sin obra último': () => {
    const g = ctx.agruparEquipos_([
      { codigo: 'EX-02', lugar: 'Autovías' },
      { codigo: 'CF-03', lugar: '' },
      { codigo: 'EX-01', lugar: 'Autovías' },
      { codigo: 'MN-01', lugar: 'Corrientes' }
    ], 'Corrientes');
    assert.strictEqual(g.map((x) => x.lugar).join('|'), 'Corrientes|Autovías|Sin obra asignada');
    assert.strictEqual(g[1].equipos.map((e) => e.codigo).join('|'), 'EX-01|EX-02');
  },
  'buscarNomina_: ignora acentos y mayúsculas, matchea por palabra': () => {
    const r = ctx.buscarNomina_([{ legajo: '1', nombre: 'PÉREZ JUAN' }, { legajo: '2', nombre: 'GÓMEZ ANA' }], 'perez');
    assert.strictEqual(r.length, 1);
    assert.strictEqual(r[0].legajo, '1');
  },
  'buscarNomina_: texto vacío devuelve todos ordenados, máximo 20': () => {
    const lista = [];
    for (let i = 0; i < 30; i++) lista.push({ legajo: String(i), nombre: 'Z' + (30 - i) });
    assert.strictEqual(ctx.buscarNomina_(lista, '').length, 20);
  },
  'diferenciaSospechosa_: no pregunta si el sugerido vino de INGECOV': () => {
    assert.strictEqual(ctx.diferenciaSospechosa_(100, 4800, 'INGECOV', 50), false);
  },
  'diferenciaSospechosa_: pregunta si supera el umbral con origen tarja': () => {
    assert.strictEqual(ctx.diferenciaSospechosa_(100, 4800, 'TARJA', 50), true);
    assert.strictEqual(ctx.diferenciaSospechosa_(4830, 4800, 'TARJA', 50), false);
  },
  'textoUltimaTarja_: hoy, ayer, hace N días, vacío': () => {
    assert.strictEqual(ctx.textoUltimaTarja_('2026-10-19', '2026-10-19', 'Pérez J.'), 'Hoy · Pérez J.');
    assert.strictEqual(ctx.textoUltimaTarja_('2026-10-18', '2026-10-19', 'Pérez J.'), 'Ayer · Pérez J.');
    assert.strictEqual(ctx.textoUltimaTarja_('2026-10-16', '2026-10-19', 'Pérez J.'), 'Hace 3 días · Pérez J.');
    assert.strictEqual(ctx.textoUltimaTarja_('', '2026-10-19', ''), '');
  }
};

module.exports['inferirTipoRodado_: cargador frontal (masculino) → rodante, terminadora → oruga'] = () => {
  assert.strictEqual(ctx.inferirTipoRodado_('Cargador frontal', 'CAT 938G'), 'rodante');
  assert.strictEqual(ctx.inferirTipoRodado_('Terminadora de asfalto', 'Dynapac F2500C'), 'oruga');
  assert.strictEqual(ctx.inferirTipoRodado_('Retropala', 'CAT 416E'), 'rodante');
};

module.exports['fechaIso_: dd/mm/yyyy, yyyy-mm-dd, Date y basura'] = () => {
  assert.strictEqual(ctx.fechaIso_('15/05/2026'), '2026-05-15');
  assert.strictEqual(ctx.fechaIso_('2026-10-01'), '2026-10-01');
  assert.strictEqual(ctx.fechaIso_(new Date(2026, 9, 3)), '2026-10-03');
  assert.strictEqual(ctx.fechaIso_(''), '');
  assert.strictEqual(ctx.fechaIso_('mañana'), '');
};
