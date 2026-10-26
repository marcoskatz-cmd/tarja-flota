/**
 * Copia de cada jornada cerrada en la planilla "PARTES DIARIOS DE EQUIPOS"
 * (la de la app de tarjas anterior). Escribe EXACTAMENTE como lo hacía su
 * guardarCarga() (proyecto 1GkkkXa58…, App.js), para que sigan andando los
 * procesos que leen de ahí (PDF automáticos, sincronización a EQUIPOS, etc.):
 *   - PARTES DIARIOS: una fila por equipo y otra por cada implemento usado.
 *   - CHECKLISTS: una fila por cada parte, con el mismo formato de texto.
 *   - REGISTRO APP: una fila de respaldo por carga.
 *   - Firma en su carpeta "FIRMAS - PARTES DIARIOS DE EQUIPOS" con su nombre.
 * EQUIPO, serie y operario salen de sus mismas listas. OBRA GENERAL y ENLACE
 * quedan vacíos, igual que con su app (los completan sus procesos).
 */

var ESPEJO = {
  ID_DEFECTO: '1e_emRVEUxTaNtLxeC0wXIWKzcKuoulZkFSS9O1e0XHo',
  ID_EQUIPOS: '1EwbNlmBMx3OIviplvHSJM3N4CZ3vVXgVxH208VugG3M',
  ID_OBRAS: '1b-s0K6Cek_9XTr9OJ7BC1XTBSwaee2eKW1qnIAlGENA',
  ID_PERSONAL: '1cld1eFpsRir4RMwNE-h4drsF2fj53DmBzz-FHHbiXdk',
  PARTES: 'PARTES DIARIOS',
  CHECKLISTS: 'CHECKLISTS',
  REGISTRO: 'REGISTRO APP',
  CARPETA_FIRMAS: 'FIRMAS - PARTES DIARIOS DE EQUIPOS',
  VERSION: 'tarja-flota'
};

/**
 * Implementos con parte y checklist propios (copiado de IMPLEMENTOS de su
 * index.html). El front recibe esta misma tabla por la ruta `implementos`.
 */
var IMPLEMENTOS_PD = {
  batea: {
    seccion: 'Batea Patronelli', equipos: ['CMN-11', 'CMN-04'], codigo: 'BAT-01',
    items: ['Estructura y caja de la batea', 'Enganche y seguro a camión', 'Compuerta trasera (cierre y sellado)',
      'Elásticos', 'Palomas', 'Neumáticos y luces de la batea', 'Sistema hidráulico de volteo', 'Frenos de la batea']
  },
  carreton: {
    seccion: 'Carretón', equipos: ['CMN-11', 'CMN-04', 'CMN-27'],
    marcas: ['Marcelini', 'LEO-COR'], codigoPorMarca: { 'Marcelini': 'CRT-01', 'LEO-COR': 'CRT-02' },
    items: ['Estructura y plataforma de carga', 'Enganche y perno de tiro', 'Rampas y sistema de carga',
      'Neumáticos (estado y presión)', 'Elásticos y suspensión', 'Sistema de frenos y luces', 'Amarres y cadenas de sujeción']
  },
  martillo: {
    seccion: 'Martillo hidráulico', equipos: ['RTP-09', 'RTP-10'],
    codigoPorEquipo: { 'RTP-09': 'MRT-01', 'RTP-10': 'MRT-02' },
    nombrePorEquipo: { 'RTP-09': 'Martillo Montabert', 'RTP-10': 'Martillo NPK' },
    items: ['Cuerpo y carcasa del martillo', 'Acople y pasadores de fijación', 'Mangueras y conexiones hidráulicas',
      'Percusión y frecuencia de golpe', 'Cincel / Punta (desgaste y fisuras)', 'Bujes de la herramienta',
      'Engrase / Lubricación', 'Silentblocks / Amortiguación']
  }
};
var CODIGOS_IMPLEMENTO_PD = ['BAT-01', 'CRT-01', 'CRT-02', 'MRT-01', 'MRT-02'];

function esImplemento_(codigo) {
  return CODIGOS_IMPLEMENTO_PD.indexOf(String(codigo || '').trim().toUpperCase()) !== -1;
}

function ssEspejo_() {
  return SpreadsheetApp.openById(prop_('ID_PARTES_DIARIOS') || ESPEJO.ID_DEFECTO);
}

// ---------- listas (las mismas que usa su app) ----------

function conCache_(clave, segundos, fn) {
  var c = CacheService.getScriptCache();
  var v = c.get(clave);
  if (v) return JSON.parse(v);
  var r = fn();
  try { c.put(clave, JSON.stringify(r), segundos); } catch (e) { }
  return r;
}

/** { 'CF-02': { opt: 'CF-02 — Cargador…', patente: '…' } } según su hoja EQUIPOS. */
function equiposPD_() {
  return conCache_('pd_equipos', 600, function () {
    var h = SpreadsheetApp.openById(ESPEJO.ID_EQUIPOS).getSheetByName('EQUIPOS');
    var m = {};
    if (!h || h.getLastRow() < 2) return m;
    h.getRange(2, 1, h.getLastRow() - 1, 5).getValues().forEach(function (r) {
      var cod = String(r[0] || '').trim();
      if (!cod) return;
      var nombre = [r[1], r[2], r[3]].map(function (v) { return String(v || '').trim(); })
        .filter(function (v) { return v && v !== '-'; }).join(' ').replace(/\s+/g, ' ').trim();
      var pat = String(r[4] || '').trim();
      m[cod.toUpperCase()] = {
        opt: (cod + ' — ' + nombre).replace(/\s+—\s+$/, '').trim(),
        patente: pat && pat !== '-' ? pat : ''
      };
    });
    return m;
  });
}

/** Nombres "Nombre Apellido" de su hoja PERSONAL. */
function personalPD_() {
  return conCache_('pd_personal', 600, function () {
    var h = SpreadsheetApp.openById(ESPEJO.ID_PERSONAL).getSheetByName('PERSONAL');
    if (!h || h.getLastRow() < 2) return [];
    return h.getRange(2, 1, h.getLastRow() - 1, 2).getValues().map(function (r) {
      return (String(r[0] || '').trim() + ' ' + String(r[1] || '').trim()).replace(/\s+/g, ' ').trim();
    }).filter(String);
  });
}

/** Lista OBRAS PARTICULAR (la que elegía el operario en su app). */
function obrasParticularPD_() {
  return conCache_('pd_obras_part', 600, function () {
    var h = SpreadsheetApp.openById(ESPEJO.ID_OBRAS).getSheetByName('OBRAS PARTICULAR');
    if (!h || h.getLastRow() < 2) return [];
    return h.getRange(2, 1, h.getLastRow() - 1, 1).getValues()
      .map(function (r) { return String(r[0] || '').trim(); }).filter(String)
      .sort(function (a, b) { return a.localeCompare(b, 'es'); });
  });
}

/**
 * El operario como figura en su PERSONAL. Primero igualdad sin tildes; si no,
 * mismas palabras en cualquier orden ("Gramajo Matías" = "Matías Gramajo").
 */
function operarioPD_(nombre) {
  var lista = [];
  try { lista = personalPD_(); } catch (e) { }
  var n = normalizarTexto_(nombre);
  var palabras = n.split(' ').sort().join(' ');
  for (var i = 0; i < lista.length; i++) if (normalizarTexto_(lista[i]) === n) return lista[i];
  for (var j = 0; j < lista.length; j++) {
    if (normalizarTexto_(lista[j]).split(' ').sort().join(' ') === palabras) return lista[j];
  }
  return String(nombre || '').trim();
}

// ---------- escritura con el mismo formato que su app ----------

function encabezadosPD_(h) {
  return h.getRange(1, 1, 1, h.getLastColumn()).getValues()[0].map(String);
}

/** Fila vacía del ancho de la hoja que se llena por nombre de encabezado (como su _filaPorNombrePD). */
function filaPorNombrePD_(heads) {
  var fila = new Array(heads.length).fill('');
  return {
    fila: fila,
    set: function (nombre, valor) {
      var i = heads.indexOf(nombre);
      if (i === -1 && nombre === 'N° SERIE/PATENTE') i = heads.indexOf('Nº SERIE/PATENTE');
      if (i !== -1) fila[i] = valor;
    }
  };
}

function hipervinculoPD_(url, texto) {
  return '=HYPERLINK("' + String(url).replace(/"/g, '%22') + '";"' + texto + '")';
}

function escribirFechaPD_(celda, fecha) {
  celda.setNumberFormat('dd/mm/yyyy').setValue(fecha);
}

function escribirEnlacePD_(celda, url, texto) {
  if (url) celda.setFormula(hipervinculoPD_(url, texto));
}

function fechaComoDate_(yyyyMMdd) {
  var p = String(yyyyMMdd).split('-');
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
}

function numPD_(v) {
  var n = parseFloat(String(v == null ? '' : v).replace(',', '.'));
  return isNaN(n) ? '' : n;
}

/** Copia la firma a su carpeta, con su nombre "FIRMA - OPERARIO - CÓDIGO - dd/mm/aaaa.png". */
function firmaEnCarpetaPD_(ss, urlFirma, operario, codigo, fechaTxt, idCarga) {
  if (!urlFirma) return '';
  var m = String(urlFirma).match(/[-\w]{25,}/);
  if (!m) return urlFirma;
  var padres = DriveApp.getFileById(ss.getId()).getParents();
  var padre = padres.hasNext() ? padres.next() : DriveApp.getRootFolder();
  var it = padre.getFoldersByName(ESPEJO.CARPETA_FIRMAS);
  var carpeta = it.hasNext() ? it.next() : padre.createFolder(ESPEJO.CARPETA_FIRMAS);
  var nombre = 'FIRMA - ' + (operario || 'operario') + ' - ' + (codigo || 'EQ') + ' - ' + fechaTxt + '.png';
  var ex = carpeta.getFilesByName(nombre);
  while (ex.hasNext()) {
    var f = ex.next();
    if (f.getDescription() === String(idCarga)) return f.getUrl();
  }
  var blob = DriveApp.getFileById(m[0]).getBlob().setName(nombre);
  var nuevo = carpeta.createFile(blob);
  try { nuevo.setDescription(String(idCarga)); } catch (e) { }
  try { nuevo.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) { }
  return nuevo.getUrl();
}

/** ¿Ya está esta carga en REGISTRO APP con estado OK? (mismo ID = id de la tarja). */
function cargaYaRegistradaPD_(hR, idCarga) {
  if (!hR || hR.getLastRow() < 2) return false;
  var heads = encabezadosPD_(hR);
  var iId = heads.indexOf('ID CARGA'), iE = heads.indexOf('ESTADO');
  if (iId === -1) return false;
  var desde = Math.max(2, hR.getLastRow() - 1500);
  var v = hR.getRange(desde, 1, hR.getLastRow() - desde + 1, heads.length).getValues();
  return v.some(function (r) { return String(r[iId]) === String(idCarga) && /^OK/.test(String(r[iE])); });
}

/** Mismo CÓDIGO, OPERARIO y horómetros en las últimas 300 filas (su _buscarParteIgualPD). */
function parteIgualPD_(h, heads, codigo, operario, he, hs) {
  if (he === '' || hs === '' || h.getLastRow() < 2) return 0;
  var last = h.getLastRow(), ini = Math.max(2, last - 299);
  var v = h.getRange(ini, 1, last - ini + 1, heads.length).getValues();
  var iC = heads.indexOf('CÓDIGO'), iO = heads.indexOf('OPERARIO');
  var iHE = heads.indexOf('HORÓMETRO ENTRADA'), iHS = heads.indexOf('HORÓMETRO SALIDA');
  for (var k = v.length - 1; k >= 0; k--) {
    if (String(v[k][iC]).trim() === String(codigo).trim() && String(v[k][iO]).trim() === String(operario).trim() &&
        numPD_(v[k][iHE]) === he && numPD_(v[k][iHS]) === hs) return ini + k;
  }
  return 0;
}

/** Fila de CHECKLISTS con el formato de su app. checklist = [{item, estado:'OK'|'FALLA', detalle}] */
function filaChecklistPD_(hC, fecha, opt, codigo, operario, gpsUrl, checklist, observaciones) {
  var fallas = checklist.filter(function (c) { return c.estado === 'FALLA'; });
  var resumen = fallas.length
    ? fallas.map(function (c) { return c.item + (c.detalle ? ' (' + c.detalle + ')' : ''); }).join(' · ')
    : 'Sin fallas';
  var detalle = checklist.map(function (c) {
    return c.item + ': ' + (c.estado === 'FALLA' ? 'FALLA' : 'OK') + (c.detalle ? ' — ' + c.detalle : '');
  }).join('\n');
  var rC = hC.getLastRow() + 1;
  hC.getRange(rC, 1, 1, 10).setValues([[
    '', opt, codigo, operario, gpsUrl ? '' : 'Ubicación no disponible',
    checklist.length, fallas.length, resumen, detalle, observaciones || ''
  ]]);
  escribirFechaPD_(hC.getRange(rC, 1), fecha);
  if (gpsUrl) escribirEnlacePD_(hC.getRange(rC, 5), gpsUrl, 'Ver ubicación');
  if (fallas.length) hC.getRange(rC, 1, 1, 10).setBackground('#fce8e8');
}

/** Ítems de mi checklist (CHECKLIST_RESP) con el formato de su app. */
function checklistDeTarjaPD_(tarjaId) {
  return leer_('CHECKLIST_RESP').filter(function (r) { return String(r.tarja_id) === String(tarjaId); })
    .sort(function (a, b) { return Number(a.orden) - Number(b.orden); })
    .map(function (r) {
      var falla = String(r.estado).toUpperCase() === 'PROBLEMA';
      return { item: String(r.item), estado: falla ? 'FALLA' : 'OK', detalle: falla ? String(r.comentario || '') : '' };
    });
}

/**
 * Escribe la jornada cerrada `t` en PARTES DIARIOS / CHECKLISTS / REGISTRO APP.
 * Devuelve true si escribió, false si ya estaba.
 */
function espejarParte_(t, equipo) {
  if (!t || String(t.estado) !== 'cerrada') return false;
  void equipo;
  var ss = ssEspejo_();
  var hP = ss.getSheetByName(ESPEJO.PARTES);
  var hC = ss.getSheetByName(ESPEJO.CHECKLISTS);
  var hR = ss.getSheetByName(ESPEJO.REGISTRO);
  if (!hP) throw new Error('No existe la hoja ' + ESPEJO.PARTES);
  if (cargaYaRegistradaPD_(hR, t.id)) return false;

  var codigo = String(t.equipo).trim();
  var eq = equiposPD_()[codigo.toUpperCase()] || { opt: codigo, patente: '' };
  var operario = operarioPD_(t.operador);
  var fecha = fechaComoDate_(t.fecha);
  var fechaTxt = Utilities.formatDate(fecha, CFG.TZ, 'dd/MM/yyyy');
  var gpsOk = gpsValido_(t.lat, t.lon);
  var gpsUrl = gpsOk ? 'https://maps.google.com/?q=' + t.lat + ',' + t.lon : '';
  var he = numPD_(t.horom_ini), hs = numPD_(t.horom_fin);

  var filaLog = 0;
  if (hR) {
    filaLog = hR.getLastRow() + 1;
    hR.getRange(filaLog, 1, 1, 13).setValues([[
      new Date(), String(t.id), ESPEJO.VERSION, fecha, codigo, operario, he, hs,
      '', '', '', 'EN CURSO', 'Desde tarjas.ingecosa.com.ar'
    ]]);
    escribirFechaPD_(hR.getRange(filaLog, 4), fecha);
    hR.getRange(filaLog, 1).setNumberFormat('dd/mm/yyyy hh:mm');
    if (gpsUrl) escribirEnlacePD_(hR.getRange(filaLog, 9), gpsUrl, 'Ver ubicación');
  }

  try {
    return escribirPartePD_(ss, hP, hC, hR, filaLog, t, codigo, eq, operario, fecha, fechaTxt, gpsOk, gpsUrl, he, hs);
  } catch (e) {
    if (hR && filaLog) hR.getRange(filaLog, 12, 1, 2).setValues([['ERROR', String(e && e.stack || e)]]);
    throw e;
  }
}

function escribirPartePD_(ss, hP, hC, hR, filaLog, t, codigo, eq, operario, fecha, fechaTxt, gpsOk, gpsUrl, he, hs) {
  var firmaUrl = '';
  try { firmaUrl = firmaEnCarpetaPD_(ss, t.firma, operario, codigo, fechaTxt, t.id); }
  catch (e) { firmaUrl = String(t.firma || ''); }
  if (hR && firmaUrl) escribirEnlacePD_(hR.getRange(filaLog, 10), firmaUrl, 'Ver firma');

  var heads = encabezadosPD_(hP);
  var rP = parteIgualPD_(hP, heads, codigo, operario, he, hs);
  var yaExistia = !!rP;
  if (!yaExistia) {
    var fp = filaPorNombrePD_(heads);
    fp.set('EQUIPO', eq.opt);
    fp.set('CÓDIGO', codigo);
    fp.set('N° SERIE/PATENTE', eq.patente);
    fp.set('OPERARIO', operario);
    fp.set('UBICACIÓN/OBRA PARTICULAR', t.obra || '');
    fp.set('UBICACIÓN GPS', gpsOk ? '' : 'Ubicación no disponible');
    fp.set('HORÓMETRO ENTRADA', he);
    fp.set('HORÓMETRO SALIDA', hs);
    fp.set('TIEMPO TRABAJO (HR)', numPD_(t.horas));
    fp.set('ACEITE MOTOR (L)', numPD_(t.aceite_motor));
    fp.set('ACEITE HIDRÁULICO (L)', numPD_(t.aceite_hidr));
    fp.set('ACEITE TRANSMISIÓN (L)', numPD_(t.aceite_trans));
    fp.set('COMBUSTIBLE (L)', numPD_(t.combustible));
    fp.set('GRASA', t.grasa || 'No');
    fp.set('OBRA GENERAL', '');
    rP = hP.getLastRow() + 1;
    hP.getRange(rP, 1, 1, heads.length).setValues([fp.fila]);
    escribirFechaPD_(hP.getRange(rP, heads.indexOf('FECHA') + 1), fecha);
    if (gpsUrl) escribirEnlacePD_(hP.getRange(rP, heads.indexOf('UBICACIÓN GPS') + 1), gpsUrl, 'Ver ubicación');
    if (firmaUrl) escribirEnlacePD_(hP.getRange(rP, heads.indexOf('FIRMA') + 1), firmaUrl, 'Ver firma');

    var chkEq = checklistDeTarjaPD_(t.id);
    if (hC && chkEq.length) filaChecklistPD_(hC, fecha, eq.opt, codigo, operario, gpsUrl, chkEq, '');

    // Implementos usados: parte aparte, sin horómetros, con su checklist.
    var imps = [];
    try { imps = JSON.parse(t.implementos || '[]'); } catch (e) { imps = []; }
    imps.forEach(function (imp) {
      if (!imp.codigo) return;
      var opt = (equiposPD_()[String(imp.codigo).toUpperCase()] || {}).opt || (imp.codigo + (imp.nombre ? ' — ' + imp.nombre : ''));
      var fi = filaPorNombrePD_(heads);
      fi.set('EQUIPO', opt);
      fi.set('CÓDIGO', imp.codigo);
      fi.set('OPERARIO', operario);
      fi.set('UBICACIÓN/OBRA PARTICULAR', t.obra || '');
      fi.set('UBICACIÓN GPS', gpsOk ? '' : 'Ubicación no disponible');
      fi.set('GRASA', 'No');
      fi.set('OBRA GENERAL', '');
      var rI = hP.getLastRow() + 1;
      hP.getRange(rI, 1, 1, heads.length).setValues([fi.fila]);
      escribirFechaPD_(hP.getRange(rI, heads.indexOf('FECHA') + 1), fecha);
      if (gpsUrl) escribirEnlacePD_(hP.getRange(rI, heads.indexOf('UBICACIÓN GPS') + 1), gpsUrl, 'Ver ubicación');
      if (firmaUrl) escribirEnlacePD_(hP.getRange(rI, heads.indexOf('FIRMA') + 1), firmaUrl, 'Ver firma');
      if (hC) filaChecklistPD_(hC, fecha, opt, imp.codigo, operario, gpsUrl, imp.checklist || [], '');
    });
  }

  if (hR) {
    hR.getRange(filaLog, 11, 1, 3).setValues([[rP, 'OK', yaExistia
      ? 'Ya estaba cargado en la fila ' + rP + ' (no se duplicó) · Desde tarjas.ingecosa.com.ar'
      : 'Desde tarjas.ingecosa.com.ar']]);
  }
  SpreadsheetApp.flush();
  log_('sistema', 'ESPEJO_OK', codigo + ' ' + t.fecha, 'fila ' + rP);
  return !yaExistia;
}

/**
 * Para correr a mano desde el editor: copia a PARTES DIARIOS las jornadas
 * cerradas desde una fecha (yyyy-MM-dd) que todavía no estén. No duplica.
 */
function reenviarPartes(desde) {
  desde = desde || hoyStr_();
  var anio = desde.slice(0, 4);
  if (!ss_().getSheetByName('TARJAS_' + anio)) return 0;
  var copiadas = 0;
  leer_('TARJAS_' + anio).forEach(function (t) {
    if (String(t.fecha) < desde || String(t.estado) !== 'cerrada') return;
    if (espejarParte_(t, null)) copiadas++;
  });
  Logger.log('Partes copiados: ' + copiadas);
  return copiadas;
}

// ---------- rutas para la app ----------

/** Lo que la app necesita de su planilla: obras e implementos posibles del equipo. */
function rutaListasPD_(p) {
  var cod = String((p && p.equipo) || '').toUpperCase();
  var imps = [];
  Object.keys(IMPLEMENTOS_PD).forEach(function (key) {
    var imp = IMPLEMENTOS_PD[key];
    if (imp.equipos.indexOf(cod) === -1) return;
    imps.push({
      key: key,
      nombre: (imp.nombrePorEquipo && imp.nombrePorEquipo[cod]) || imp.seccion,
      codigo: imp.codigo || (imp.codigoPorEquipo && imp.codigoPorEquipo[cod]) || '',
      marcas: imp.marcas || null, codigoPorMarca: imp.codigoPorMarca || null,
      items: imp.items
    });
  });
  var obras = [];
  try { obras = obrasParticularPD_(); } catch (e) { }
  return { obras: obras, implementos: imps };
}

/** Valida los implementos que manda la app al cerrar y los deja listos para guardar. */
function implementosDe_(p, codigoEquipo) {
  var lista = Array.isArray(p.implementos) ? p.implementos : [];
  var posibles = rutaListasPD_({ equipo: codigoEquipo }).implementos;
  return lista.map(function (u) {
    var def = posibles.filter(function (x) { return x.key === u.key; })[0];
    if (!def) throw new Error('El implemento "' + u.key + '" no corresponde a ' + codigoEquipo + '.');
    var codigo = def.codigo || (def.codigoPorMarca && def.codigoPorMarca[u.marca]) || '';
    if (!codigo) throw new Error('Falta elegir la marca del ' + def.nombre + '.');
    var nombre = def.nombre + (def.marcas && u.marca ? ' (' + u.marca + ')' : '');
    var chk = (u.checklist || []).map(function (c) {
      var falla = c.estado === 'FALLA';
      if (falla && !String(c.detalle || '').trim()) throw new Error('Describí la falla de "' + c.item + '".');
      return { item: String(c.item), estado: falla ? 'FALLA' : 'OK', detalle: falla ? String(c.detalle).trim() : '' };
    });
    if (chk.length !== def.items.length) throw new Error('Falta revisar el ' + def.nombre + '.');
    return { key: u.key, codigo: codigo, nombre: nombre, checklist: chk };
  });
}

// ---------- ubicaciones desde PARTES DIARIOS ----------

/** URL del enlace de una celda: fórmula HYPERLINK o texto con enlace. */
function urlDeCeldaPD_(formula, rt) {
  var m = String(formula || '').match(/HYPERLINK\(\s*"([^"]+)"/i);
  if (m) return m[1];
  if (!rt) return '';
  if (rt.getLinkUrl()) return rt.getLinkUrl();
  var runs = rt.getRuns();
  for (var i = 0; i < runs.length; i++) if (runs[i].getLinkUrl()) return runs[i].getLinkUrl();
  return '';
}

/**
 * Última ubicación de cada equipo según la columna UBICACIÓN GPS (el link
 * "Ver ubicación") de PARTES DIARIOS. Actualiza lat/lon/ts_pos en EQUIPOS solo
 * si la fecha del parte es más nueva que la posición que ya tenía.
 */
function posicionesDesdePartes_() {
  var sh = ssEspejo_().getSheetByName(ESPEJO.PARTES);
  if (!sh || sh.getLastRow() < 2) return 0;
  var heads = encabezadosPD_(sh);
  var ultima = sh.getLastRow();
  var desde = Math.max(2, ultima - 1500);
  var n = ultima - desde + 1;
  var vals = sh.getRange(desde, 1, n, heads.length).getValues();
  var colG = heads.indexOf('UBICACIÓN GPS') + 1;
  var gps = sh.getRange(desde, colG, n, 1).getRichTextValues();
  var formulas = sh.getRange(desde, colG, n, 1).getFormulas();
  var iF = heads.indexOf('FECHA'), iC = heads.indexOf('CÓDIGO'), iO = heads.indexOf('OPERARIO');

  var mejor = {};
  for (var k = 0; k < n; k++) {
    var f = vals[k][iF];
    if (!(f instanceof Date)) continue;
    var url = urlDeCeldaPD_(formulas[k][0], gps[k][0]);
    var m = url && String(url).match(/(-?\d{1,2}\.\d+)\s*(?:,|%2C)\s*(-?\d{1,3}\.\d+)/i);
    if (!m || !gpsValido_(m[1], m[2])) continue;
    var cod = String(vals[k][iC]).trim().toUpperCase();
    var ts = Utilities.formatDate(f, CFG.TZ, 'yyyy-MM-dd') + ' 00:00:00';
    if (!mejor[cod] || ts >= mejor[cod].ts) {
      mejor[cod] = { lat: Number(m[1]), lon: Number(m[2]), ts: ts, op: String(vals[k][iO] || '') };
    }
  }

  var cambiados = 0;
  leer_('EQUIPOS').forEach(function (e) {
    var p = mejor[String(e.codigo).trim().toUpperCase()];
    if (!p || String(e.ts_pos || '') >= p.ts) return;
    var cambios = { lat: p.lat, lon: p.lon, ts_pos: p.ts };
    if (!e.ultimo_operador || String(e.ultima_tarja || '') < p.ts.slice(0, 10)) cambios.ultimo_operador = p.op;
    actualizar_('EQUIPOS', e._fila, cambios);
    cambiados++;
  });
  setProp_('ULTIMO_POS_PARTES', String(Date.now()));
  return cambiados;
}

/** Como mucho una vez cada 15 minutos, al pedir el mapa. */
function posicionesDesdePartesSiToca_() {
  var ult = Number(prop_('ULTIMO_POS_PARTES') || 0);
  if (Date.now() - ult < 15 * 60 * 1000) return;
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try { posicionesDesdePartes_(); }
  catch (e) { log_('sistema', 'POS_PARTES_ERROR', '', String(e && e.message || e)); }
  finally { lock.releaseLock(); }
}

/**
 * PRUEBA (correr a mano desde el editor): hace una copia de PARTES DIARIOS,
 * escribe ahí una jornada de prueba con un implemento y deja el link de la
 * copia en el registro. No toca la planilla real.
 */
function probarEspejoEnCopia() {
  var original = DriveApp.getFileById(ESPEJO.ID_DEFECTO);
  var copia = original.makeCopy('PRUEBA espejo tarja-flota ' + tsStr_());
  var antes = prop_('ID_PARTES_DIARIOS');
  setProp_('ID_PARTES_DIARIOS', copia.getId());
  try {
    var firma = DriveApp.createFile(Utilities.newBlob(Utilities.base64Decode(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='), 'image/png', 'firma-prueba.png'));
    var t = {
      id: 'prueba-' + uuid_(), estado: 'cerrada', equipo: 'CMN-11', fecha: hoyStr_(),
      operador: 'Prueba Sistema', obra: 'Lomas de Tafí', horom_ini: 1500, horom_fin: 1508, horas: 8,
      combustible: 120, aceite_motor: 0, aceite_hidr: 2, aceite_trans: 0, grasa: 'Sí',
      lat: -26.8241, lon: -65.2226, firma: firma.getUrl(),
      implementos: JSON.stringify([{ key: 'carreton', codigo: 'CRT-02', nombre: 'Carretón (LEO-COR)', checklist: [
        { item: 'Estructura y plataforma de carga', estado: 'FALLA', detalle: 'Perno gastado' },
        { item: 'Enganche y perno de tiro', estado: 'OK', detalle: '' }] }])
    };
    espejarParte_(t, null);
    firma.setTrashed(true);
    var padres = original.getParents();
    if (padres.hasNext()) {
      var it = padres.next().getFoldersByName(ESPEJO.CARPETA_FIRMAS);
      if (it.hasNext()) {
        var fs = it.next().searchFiles('title contains "FIRMA - Prueba Sistema"');
        while (fs.hasNext()) fs.next().setTrashed(true);
      }
    }
    Logger.log('Copia con la prueba: ' + copia.getUrl());
    return copia.getUrl();
  } finally {
    if (antes) setProp_('ID_PARTES_DIARIOS', antes); else borrarProp_('ID_PARTES_DIARIOS');
  }
}
