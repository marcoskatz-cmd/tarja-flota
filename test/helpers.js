/**
 * Arnés de tests: carga los .gs de Apps Script en un contexto de Node con
 * stubs mínimos de los servicios de Google. Solo lo que la lógica necesita.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RAIZ = path.join(__dirname, '..');

/** Archivos que se cargan en el contexto, en orden. */
const CARGAR = ['Config.gs', 'Reglas.gs', 'Planillas.gs', 'Fotos.gs', 'IngecoAvisos.gs', 'Fuentes.gs', 'Tarjas.gs', 'Sesion.gs', 'Panel.gs', 'Triggers.gs', 'Mantenimiento.gs', 'Codigo.gs'];

// ---------- stub de Sheets en memoria ----------

function hojaFake(nombre) {
  const filas = [];
  const formatos = {};
  const h = {
    nombre,
    filas,
    getName: () => nombre,
    getLastRow: () => filas.length,
    getLastColumn: () => filas.reduce((m, f) => Math.max(m, f.length), 0),
    getMaxRows: () => Math.max(1000, filas.length),
    setFrozenRows: () => h,
    appendRow: (r) => { filas.push(r.slice()); return h; },
    getRange: (fila, col, nFilas, nCols) => rango(fila, col, nFilas == null ? 1 : nFilas, nCols == null ? 1 : nCols),
    getDataRange: () => rango(1, 1, Math.max(filas.length, 1), h.getLastColumn() || 1),
    deleteRow: (n) => { filas.splice(n - 1, 1); return h; },
    clearContents: () => { filas.length = 0; return h; }
  };
  function rango(fila, col, nFilas, nCols) {
    return {
      getValues: () => {
        const out = [];
        for (let i = 0; i < nFilas; i++) {
          const f = filas[fila - 1 + i] || [];
          const r = [];
          for (let j = 0; j < nCols; j++) r.push(f[col - 1 + j] === undefined ? '' : f[col - 1 + j]);
          out.push(r);
        }
        return out;
      },
      setValues: (vals) => {
        vals.forEach((r, i) => {
          while (filas.length < fila + i) filas.push([]);
          const f = filas[fila - 1 + i];
          r.forEach((v, j) => { f[col - 1 + j] = v; });
        });
        return this;
      },
      setValue: (v) => {
        while (filas.length < fila) filas.push([]);
        filas[fila - 1][col - 1] = v;
      },
      getValue: () => (filas[fila - 1] || [])[col - 1] === undefined ? '' : filas[fila - 1][col - 1],
      setNumberFormat: (f) => { formatos[col] = f; return this; },
      setFontWeight: () => this
    };
  }
  return h;
}

function spreadsheetFake(id, nombre) {
  const hojas = [];
  const ss = {
    id, nombre, hojas,
    getId: () => id,
    getUrl: () => 'https://docs.google.com/spreadsheets/d/' + id,
    getName: () => nombre,
    getSheets: () => hojas.slice(),
    getSheetByName: (n) => hojas.find((h) => h.nombre === n) || null,
    insertSheet: (n) => { const h = hojaFake(n); hojas.push(h); return h; },
    deleteSheet: (h) => { const i = hojas.indexOf(h); if (i >= 0) hojas.splice(i, 1); }
  };
  return ss;
}

/** Crea una hoja con encabezado y filas (objetos o arrays) dentro de una planilla fake. */
function cargarHoja(ss, nombre, encabezado, filas) {
  let h = ss.getSheetByName(nombre) || ss.insertSheet(nombre);
  h.clearContents();
  h.appendRow(encabezado);
  (filas || []).forEach((f) => {
    if (Array.isArray(f)) h.appendRow(f);
    else h.appendRow(encabezado.map((c) => (f[c] === undefined ? '' : f[c])));
  });
  return h;
}

// ---------- contexto ----------

function crearContexto(opciones) {
  opciones = opciones || {};
  const props = Object.assign({}, opciones.props || {});
  const planillas = {};
  let contador = 0;
  const llamadasFetch = [];
  const avisos = [];

  const ctx = {
    console,
    Date,
    JSON,
    Math,
    Number,
    String,
    Object,
    Array,
    RegExp,
    Error,
    isFinite,
    parseInt,
    parseFloat,
    encodeURIComponent,
    decodeURIComponent,
    __planillas: planillas,
    __props: props,
    __fetch: llamadasFetch,
    __avisos: avisos,
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (props[k] === undefined ? null : props[k]),
        setProperty: (k, v) => { props[k] = String(v); },
        deleteProperty: (k) => { delete props[k]; },
        getProperties: () => Object.assign({}, props),
        getKeys: () => Object.keys(props)
      })
    },
    SpreadsheetApp: {
      create: (nombre) => { const id = 'ss' + (++contador); planillas[id] = spreadsheetFake(id, nombre); return planillas[id]; },
      openById: (id) => { if (!planillas[id]) throw new Error('Planilla inexistente: ' + id); return planillas[id]; }
    },
    DriveApp: {
      createFolder: () => ({ getId: () => 'carpeta1' }),
      getFolderById: () => ({
        getId: () => 'carpeta1',
        getFoldersByName: () => ({ hasNext: () => false }),
        createFolder: (n) => ({ getId: () => 'sub-' + n, getFoldersByName: () => ({ hasNext: () => false }), createFolder: (m) => ({ getId: () => 'sub-' + m, createFile: () => ({ getUrl: () => 'https://drive/x', setSharing: () => {} }) }), createFile: () => ({ getUrl: () => 'https://drive/x', setSharing: () => {} }) }),
        createFile: () => ({ getUrl: () => 'https://drive/x', setSharing: () => {} })
      }),
      Access: { ANYONE_WITH_LINK: 'ANYONE_WITH_LINK' },
      Permission: { VIEW: 'VIEW' }
    },
    Utilities: {
      formatDate: (d, tz, fmt) => formatear(d, fmt),
      getUuid: () => 'uuid-' + (++contador),
      base64Decode: (s) => Buffer.from(s, 'base64'),
      newBlob: () => ({ setName: () => ({}) }),
      computeDigest: (alg, s) => Array.from(Buffer.from(String(s))).map((b) => (b % 256) - 128),
      DigestAlgorithm: { SHA_256: 'SHA_256' },
      Charset: { UTF_8: 'UTF_8' }
    },
    LockService: { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) },
    ContentService: {
      createTextOutput: (s) => ({ __texto: s, setMimeType: function () { return this; } }),
      MimeType: { JSON: 'JSON' }
    },
    UrlFetchApp: {
      fetch: (url, opts) => {
        llamadasFetch.push({ url, opts });
        const resp = (opciones.fetch || (() => ({ ok: true })))(url, opts);
        return { getContentText: () => JSON.stringify(resp), getResponseCode: () => 200 };
      }
    },
    ScriptApp: {
      getProjectTriggers: () => [],
      deleteTrigger: () => {},
      newTrigger: () => ({ timeBased: () => ({ everyHours: () => ({ create: () => {} }), everyMinutes: () => ({ create: () => {} }) }) })
    }
  };
  vm.createContext(ctx);
  const archivos = opciones.cargar || CARGAR;
  archivos.forEach((f) => {
    const p = path.join(RAIZ, 'apps-script', f);
    if (!fs.existsSync(p)) return;
    vm.runInContext(fs.readFileSync(p, 'utf8'), ctx, { filename: f });
  });
  // El snippet de avisos se reemplaza por un registro: no queremos salir a la red.
  ctx.notificarAppIngeco_ = (modulo, aviso) => { avisos.push({ modulo, aviso }); return { ok: true }; };
  if (opciones.hoy) ctx.hoyStr_ = () => opciones.hoy;
  return ctx;
}

function formatear(d, fmt) {
  const p = (n) => String(n).padStart(2, '0');
  const y = d.getFullYear(), m = p(d.getMonth() + 1), dd = p(d.getDate());
  const hh = p(d.getHours()), mi = p(d.getMinutes()), ss = p(d.getSeconds());
  return fmt.replace('yyyy', y).replace('MM', m).replace('dd', dd).replace('HH', hh).replace('mm', mi).replace('ss', ss);
}

/** Carga un archivo del front (docs/*.js) en un contexto con window/localStorage fake. */
function crearContextoFront(archivos, extra) {
  const store = {};
  const localStorage = {
    getItem: (k) => (store[k] === undefined ? null : store[k]),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    __store: store
  };
  const ctx = Object.assign({ console, JSON, Math, Date, Object, Array, String, Number, Promise, Error, localStorage, crypto: { randomUUID: () => 'op-' + Math.random().toString(36).slice(2) } }, extra || {});
  ctx.window = ctx;
  ctx.document = ctx.document || { addEventListener: () => {}, getElementById: () => null };
  ctx.addEventListener = ctx.addEventListener || (() => {});
  vm.createContext(ctx);
  archivos.forEach((f) => vm.runInContext(fs.readFileSync(path.join(RAIZ, f), 'utf8'), ctx, { filename: f }));
  return ctx;
}

module.exports = { CARGAR, crearContexto, crearContextoFront, cargarHoja, spreadsheetFake, hojaFake };
