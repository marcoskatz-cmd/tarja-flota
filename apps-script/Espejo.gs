/**
 * Copia de cada jornada cerrada en la planilla "PARTES DIARIOS DE EQUIPOS"
 * (la de la app de tarjas anterior), con su formato, para que sigan andando
 * las conexiones que leen de ahí. Escribe en PARTES DIARIOS y CHECKLISTS.
 * Las columnas se ubican por el texto del encabezado, no por posición.
 */

var ESPEJO = {
  ID_DEFECTO: '1e_emRVEUxTaNtLxeC0wXIWKzcKuoulZkFSS9O1e0XHo',
  PARTES: 'PARTES DIARIOS',
  CHECKLISTS: 'CHECKLISTS'
};

function ssEspejo_() {
  return SpreadsheetApp.openById(prop_('ID_PARTES_DIARIOS') || ESPEJO.ID_DEFECTO);
}

/** Índice (0-based) de cada encabezado, normalizado sin tildes ni mayúsculas. */
function indiceEncabezados_(sh) {
  var enc = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var idx = {};
  enc.forEach(function (h, i) { idx[normalizarTexto_(h)] = i; });
  return { n: enc.length, de: function (nombre) {
    var i = idx[normalizarTexto_(nombre)];
    if (i === undefined) throw new Error('No encuentro la columna "' + nombre + '" en ' + sh.getName());
    return i;
  } };
}

function textoConLink_(texto, url) {
  return SpreadsheetApp.newRichTextValue().setText(texto).setLinkUrl(url).build();
}

function fechaComoDate_(yyyyMMdd) {
  var p = String(yyyyMMdd).split('-');
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
}

/** "CF-02 – Cargador frontal…" y la serie, tal como ya figuran en la planilla de él. */
function nombreEquipoEspejo_(sh, cols, equipo) {
  var ultima = sh.getLastRow();
  if (ultima >= 2) {
    var desde = Math.max(2, ultima - 1500);
    var datos = sh.getRange(desde, 1, ultima - desde + 1, cols.n).getValues();
    for (var i = datos.length - 1; i >= 0; i--) {
      if (String(datos[i][cols.de('CÓDIGO')]).trim() === String(equipo.codigo)) {
        return { nombre: datos[i][cols.de('EQUIPO')], serie: datos[i][cols.de('Nº SERIE/PATENTE')] };
      }
    }
  }
  var desc = [equipo.descripcion, equipo.marca, equipo.modelo].filter(String).join(' ');
  return { nombre: equipo.codigo + ' – ' + desc, serie: equipo.patente || '' };
}

/** ¿Ya hay un parte de ese equipo, ese día, con ese horómetro de entrada? */
function yaEspejado_(sh, cols, fecha, codigo, horomIni) {
  var ultima = sh.getLastRow();
  if (ultima < 2) return false;
  var desde = Math.max(2, ultima - 500);
  var datos = sh.getRange(desde, 1, ultima - desde + 1, cols.n).getValues();
  var buscada = Utilities.formatDate(fechaComoDate_(fecha), CFG.TZ, 'yyyy-MM-dd');
  return datos.some(function (f) {
    var fv = f[cols.de('FECHA')];
    var fs = fv instanceof Date ? Utilities.formatDate(fv, CFG.TZ, 'yyyy-MM-dd') : '';
    return fs === buscada && String(f[cols.de('CÓDIGO')]).trim() === String(codigo) &&
      Number(f[cols.de('HORÓMETRO ENTRADA')]) === Number(horomIni);
  });
}

/** Columnas que en la fila anterior tienen fórmula: se copia la fórmula a la nueva. */
function copiarFormulas_(sh, fila, n) {
  if (fila < 3) return;
  var formulas = sh.getRange(fila - 1, 1, 1, n).getFormulasR1C1()[0];
  formulas.forEach(function (f, i) { if (f) sh.getRange(fila, i + 1).setFormulaR1C1(f); });
}

function espejarParte_(t, equipo) {
  if (!t || String(t.estado) !== 'cerrada') return false;
  var ss = ssEspejo_();
  var sh = ss.getSheetByName(ESPEJO.PARTES);
  if (!sh) throw new Error('No existe la hoja ' + ESPEJO.PARTES);
  var cols = indiceEncabezados_(sh);
  if (yaEspejado_(sh, cols, t.fecha, t.equipo, t.horom_ini)) return false;

  var eq = nombreEquipoEspejo_(sh, cols, equipo || { codigo: t.equipo });
  var conGps = gpsValido_(t.lat, t.lon);
  var urlGps = conGps ? 'https://www.google.com/maps?q=' + t.lat + ',' + t.lon : '';
  var num = function (v) { return v === '' || v == null ? 0 : Number(v); };

  var fila = new Array(cols.n).fill('');
  fila[cols.de('FECHA')] = fechaComoDate_(t.fecha);
  fila[cols.de('EQUIPO')] = eq.nombre;
  fila[cols.de('CÓDIGO')] = t.equipo;
  fila[cols.de('Nº SERIE/PATENTE')] = eq.serie;
  fila[cols.de('OPERARIO')] = t.operador;
  fila[cols.de('UBICACIÓN/OBRA PARTICULAR')] = t.obra || '';
  fila[cols.de('HORÓMETRO ENTRADA')] = num(t.horom_ini);
  fila[cols.de('HORÓMETRO SALIDA')] = num(t.horom_fin);
  fila[cols.de('TIEMPO TRABAJO (HR)')] = num(t.horas);
  fila[cols.de('ACEITE MOTOR (L)')] = num(t.aceite_motor);
  fila[cols.de('ACEITE HIDRÁULICO (L)')] = num(t.aceite_hidr);
  fila[cols.de('ACEITE TRANSMISIÓN (L)')] = num(t.aceite_trans);
  fila[cols.de('COMBUSTIBLE (L)')] = num(t.combustible);
  fila[cols.de('GRASA')] = t.grasa || 'No';

  sh.appendRow(fila);
  var n = sh.getLastRow();
  sh.getRange(n, cols.de('FECHA') + 1).setNumberFormat('dd/MM/yyyy');
  sh.getRange(n, cols.de('UBICACIÓN GPS') + 1).setRichTextValue(
    conGps ? textoConLink_('Ver ubicación', urlGps) : SpreadsheetApp.newRichTextValue().setText('Ubicación no disponible').build());
  if (t.firma) sh.getRange(n, cols.de('FIRMA') + 1).setRichTextValue(textoConLink_('Ver firma', String(t.firma)));
  copiarFormulas_(sh, n, cols.n);

  espejarChecklist_(ss, t, eq.nombre, conGps, urlGps);
  log_('sistema', 'ESPEJO_OK', t.equipo + ' ' + t.fecha, 'fila ' + n);
  return true;
}

function espejarChecklist_(ss, t, nombreEquipo, conGps, urlGps) {
  var resp = leer_('CHECKLIST_RESP').filter(function (r) { return String(r.tarja_id) === String(t.id); })
    .sort(function (a, b) { return Number(a.orden) - Number(b.orden); });
  if (!resp.length) return;
  var sh = ss.getSheetByName(ESPEJO.CHECKLISTS);
  if (!sh) return;
  var cols = indiceEncabezados_(sh);
  var fallas = resp.filter(function (r) { return String(r.estado).toUpperCase() === 'PROBLEMA'; });

  var fila = new Array(cols.n).fill('');
  fila[cols.de('FECHA')] = fechaComoDate_(t.fecha);
  fila[cols.de('EQUIPO')] = nombreEquipo;
  fila[cols.de('CÓDIGO')] = t.equipo;
  fila[cols.de('OPERARIO')] = t.operador;
  fila[cols.de('ÍTEMS VERIFICACIÓN')] = resp.length;
  fila[cols.de('Nº FALLAS')] = fallas.length;
  fila[cols.de('RESUMEN DE FALLAS')] = fallas.length
    ? fallas.map(function (r) { return r.item + (r.comentario ? ' (' + r.comentario + ')' : ''); }).join('; ')
    : 'Sin fallas';
  fila[cols.de('DETALLE COMPLETO')] = resp.map(function (r) {
    return r.item + ': ' + (String(r.estado).toUpperCase() === 'PROBLEMA' ? 'FALLA – ' + (r.comentario || '') : 'OK');
  }).join('\n');

  sh.appendRow(fila);
  var n = sh.getLastRow();
  sh.getRange(n, cols.de('FECHA') + 1).setNumberFormat('dd/MM/yyyy');
  sh.getRange(n, cols.de('UBICACIÓN GPS') + 1).setRichTextValue(
    conGps ? textoConLink_('Ver ubicación', urlGps) : SpreadsheetApp.newRichTextValue().setText('Ubicación no disponible').build());
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
    t._hoja = 'TARJAS_' + anio;
    if (espejarParte_(t, equipoPorCodigo_(t.equipo))) copiadas++;
  });
  Logger.log('Partes copiados: ' + copiadas);
  return copiadas;
}

// ---------- ubicaciones desde PARTES DIARIOS ----------

/**
 * Última ubicación de cada equipo según la columna UBICACIÓN GPS (el link
 * "Ver ubicación") de PARTES DIARIOS. Actualiza lat/lon/ts_pos en EQUIPOS solo
 * si la fecha del parte es más nueva que la posición que ya tenía.
 */
function posicionesDesdePartes_() {
  var sh = ssEspejo_().getSheetByName(ESPEJO.PARTES);
  if (!sh || sh.getLastRow() < 2) return 0;
  var cols = indiceEncabezados_(sh);
  var ultima = sh.getLastRow();
  var desde = Math.max(2, ultima - 1500);
  var n = ultima - desde + 1;
  var vals = sh.getRange(desde, 1, n, cols.n).getValues();
  var gps = sh.getRange(desde, cols.de('UBICACIÓN GPS') + 1, n, 1).getRichTextValues();
  var iF = cols.de('FECHA'), iC = cols.de('CÓDIGO'), iO = cols.de('OPERARIO');

  var mejor = {};
  for (var k = 0; k < n; k++) {
    var f = vals[k][iF];
    if (!(f instanceof Date)) continue;
    var rt = gps[k][0];
    var url = rt && (rt.getLinkUrl() || (rt.getRuns()[0] && rt.getRuns()[0].getLinkUrl()));
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
