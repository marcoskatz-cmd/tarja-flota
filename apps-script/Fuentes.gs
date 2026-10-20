/**
 * Importación de fuentes externas. Nada se carga a mano dos veces:
 *  - EQUIPOS  ← LISTA DE EQUIPOS de INGECOV (pestaña EQUIPOS), solo pesados.
 *  - PERSONAL ← hoja PERSONAL de Ropa INGECO (ya cruzada con RRHH por legajo).
 *  - horómetro inicial ← SVC_PANELPROG del snapshot de INGECOV (una sola vez por equipo).
 *
 * Si a una fuente le falta una columna, NO se toca la caché: se deja el
 * detalle en Script Properties (lo muestra el panel vía diagnosticar_()) y se
 * avisa a los administradores por App INGECO una vez por día.
 */

/** Índice de columna por sinónimos, normalizando acentos y símbolos. -1 si no está. */
function idx_(header, sinonimos) {
  var h = header.map(function (c) { return normalizarTexto_(c).replace(/ /g, ''); });
  for (var i = 0; i < sinonimos.length; i++) {
    var k = h.indexOf(normalizarTexto_(sinonimos[i]).replace(/ /g, ''));
    if (k >= 0) return k;
  }
  return -1;
}

/** Lee una pestaña ajena como {header, filas}. null si no existe. */
function leerPestana_(sheetId, nombres) {
  if (!sheetId) return null;
  var ss;
  try { ss = SpreadsheetApp.openById(sheetId); } catch (e) { return null; }
  for (var i = 0; i < nombres.length; i++) {
    var sh = ss.getSheetByName(nombres[i]);
    if (sh && sh.getLastRow() >= 1) {
      var datos = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
      return { header: datos[0].map(String), filas: datos.slice(1) };
    }
  }
  return null;
}

function at_(fila, i) { return i < 0 ? '' : String(fila[i] == null ? '' : fila[i]).trim(); }

// ---------- diagnóstico y aviso de fuente ----------

function fuenteFallo_(propDiag, texto, titulo) {
  setProp_(propDiag, texto);
  var hoy = hoyStr_();
  if (prop_(propDiag + '_AVISADO') !== hoy) {
    setProp_(propDiag + '_AVISADO', hoy);
    notificarAppIngeco_(CFG.MODULO, {
      destinatarios: [{ admin: true }],
      tipo: 'aviso_general', prioridad: 'critica',
      titulo: titulo, cuerpo: texto + ' La tarja sigue usando la última lista buena.',
      url_destino: CFG.URL_PANEL,
      clave_unica: propDiag + '-' + hoy
    });
  }
}

function fuenteOk_(propDiag) {
  if (prop_(propDiag)) borrarProp_(propDiag);
}

// ---------- equipos ----------

/** Lee la LISTA DE EQUIPOS. {filas:[...], faltan:[nombres de columnas]} */
function leerListaEquipos_() {
  var t = leerPestana_(config_('SHEET_LISTA_EQUIPOS_ID'), ['EQUIPOS', 'LISTA DE EQUIPOS']);
  if (!t) return { filas: [], faltan: ['PESTAÑA EQUIPOS'] };
  var h = t.header;
  var iCod = idx_(h, ['CÓDIGO', 'CODIGO', 'CODIGO INTERNO', 'CODIO INTERNO']);
  var iCla = idx_(h, ['CLASIFICACIÓN', 'CLASIFICACION', 'TIPO']);
  var iMar = idx_(h, ['MARCA']);
  var iMod = idx_(h, ['MODELO']);
  var iPat = idx_(h, ['PATENTE/SERIE', 'PATENTE', 'N° SERIE/PATENTE', 'N SERIE N PATENTE', 'N° SERIE - N° PATENTE', 'SERIE', 'DOMINIO']);
  var iUbi = idx_(h, ['UBICACIÓN', 'UBICACION', 'LUGAR']);
  var faltan = [];
  if (iCod < 0) faltan.push('CODIGO');
  if (iCla < 0) faltan.push('CLASIFICACION');
  if (faltan.length) return { filas: [], faltan: faltan, opcionales: [] };
  // Columnas opcionales: si faltan, se importa igual pero sin pisar esos campos.
  var opcionales = [];
  if (iMar < 0) opcionales.push('MARCA');
  if (iMod < 0) opcionales.push('MODELO');
  if (iPat < 0) opcionales.push('PATENTE');
  if (iUbi < 0) opcionales.push('UBICACION');
  var filas = t.filas.map(function (f) {
    var codigo = at_(f, iCod);
    if (!codigo) return null;
    var clasif = at_(f, iCla), marca = at_(f, iMar), modelo = at_(f, iMod);
    var o = { codigo: codigo.toUpperCase(), clasificacion: clasif };
    if (iMar >= 0) o.marca = marca;
    if (iMod >= 0) o.modelo = modelo;
    if (iPat >= 0) o.patente = at_(f, iPat);
    if (iUbi >= 0) o.lugar = at_(f, iUbi);
    if (iMar >= 0 && iMod >= 0) o.descripcion = [clasif, marca, modelo].filter(Boolean).join(' ');
    return o;
  }).filter(Boolean);
  return { filas: filas, faltan: [], opcionales: opcionales };
}

/** Deja en el objeto solo los campos que la fuente trajo (no pisa con vacío lo que falta). */
function soloPresentes_(f, claves) {
  var out = {};
  claves.forEach(function (k) { if (f[k] !== undefined) out[k] = f[k]; });
  return out;
}

/** Upsert de EQUIPOS por código. Respeta tipo_rodado y activo_tarja editados a mano. */
function syncEquipos_() {
  var fuente = leerListaEquipos_();
  if (fuente.faltan.length) {
    fuenteFallo_('DIAG_EQUIPOS', 'A la LISTA DE EQUIPOS le falta la columna ' + fuente.faltan.join(', ') + '.',
      'La LISTA DE EQUIPOS cambió');
    return { altas: 0, actualizados: 0, faltan: fuente.faltan };
  }
  if (fuente.opcionales.length) {
    fuenteFallo_('DIAG_EQUIPOS', 'A la LISTA DE EQUIPOS le falta la columna ' + fuente.opcionales.join(', ') +
      ' (se importa igual, sin actualizar esos datos).', 'La LISTA DE EQUIPOS cambió');
  } else {
    fuenteOk_('DIAG_EQUIPOS');
  }
  var actuales = {};
  leer_('EQUIPOS').forEach(function (e) { actuales[String(e.codigo).toUpperCase()] = e; });
  var ts = tsStr_(), altas = 0, actualizados = 0, bajas = 0;
  var vistos = {};
  var CAMPOS = ['descripcion', 'marca', 'modelo', 'patente', 'clasificacion', 'lugar'];
  fuente.filas.forEach(function (f) {
    if (!esPesado_(f.clasificacion, f.codigo)) return;
    vistos[f.codigo] = true;
    var e = actuales[f.codigo];
    if (!e) {
      agregar_('EQUIPOS', Object.assign({
        codigo: f.codigo, descripcion: '', marca: '', modelo: '', patente: '', clasificacion: '',
        tipo_rodado: inferirTipoRodado_(f.clasificacion, f.modelo || ''),
        lugar: '', activo_tarja: 'SI',
        horom_tarja: '', origen_horom: '', ultimo_operador: '', ultima_tarja: '',
        lat: '', lon: '', ts_pos: '', ts_sync: ts
      }, soloPresentes_(f, CAMPOS)));
      altas++;
    } else {
      actualizar_('EQUIPOS', e._fila, Object.assign({ ts_sync: ts }, soloPresentes_(f, CAMPOS)));
      actualizados++;
    }
  });
  // Equipos que ya no están en la LISTA (vendidos, dados de baja): dejan de tarjar.
  // No se reactivan solos si vuelven: activo_tarja es decisión del panel.
  Object.keys(actuales).forEach(function (c) {
    var e = actuales[c];
    if (!vistos[c] && String(e.activo_tarja).toUpperCase() === 'SI') {
      actualizar_('EQUIPOS', e._fila, { activo_tarja: 'NO', ts_sync: ts });
      log_('sync', 'BAJA_EQUIPO', c + ' ya no está en la LISTA DE EQUIPOS', '');
      bajas++;
    }
  });
  return { altas: altas, actualizados: actualizados, bajas: bajas, faltan: [] };
}

// ---------- personal ----------

function syncPersonal_() {
  var id = config_('SHEET_ROPA_ID');
  if (!id) {
    fuenteFallo_('DIAG_PERSONAL', 'Falta cargar SHEET_ROPA_ID en la hoja CONFIG.', 'La nómina no está conectada');
    return { total: 0, faltan: ['SHEET_ROPA_ID'] };
  }
  var t = leerPestana_(id, ['PERSONAL']);
  if (!t) {
    fuenteFallo_('DIAG_PERSONAL', 'No se pudo leer la hoja PERSONAL de Ropa INGECO.', 'La nómina no se pudo leer');
    return { total: 0, faltan: ['PESTAÑA PERSONAL'] };
  }
  var h = t.header;
  var iLeg = idx_(h, ['LEGAJO']);
  var iNom = idx_(h, ['NOMBRE', 'APELLIDO Y NOMBRE', 'NOMBRE Y APELLIDO']);
  var iAct = idx_(h, ['ACTIVO', 'ESTADO']);
  var faltan = [];
  if (iLeg < 0) faltan.push('LEGAJO');
  if (iNom < 0) faltan.push('NOMBRE');
  if (faltan.length) {
    fuenteFallo_('DIAG_PERSONAL', 'A la hoja PERSONAL de Ropa le falta la columna ' + faltan.join(', ') + '.', 'La nómina cambió');
    return { total: 0, faltan: faltan };
  }
  fuenteOk_('DIAG_PERSONAL');
  var ts = tsStr_();
  var activos = t.filas.filter(function (f) {
    // Ropa escribe "SÍ" con tilde: comparar normalizado.
    var a = normalizarTexto_(at_(f, iAct));
    return at_(f, iLeg) && at_(f, iNom) && (iAct < 0 || a === 'SI' || a === 'ACTIVO' || a === 'TRUE' || a === '1');
  }).map(function (f) {
    return { legajo: at_(f, iLeg), nombre: at_(f, iNom), activo: 'SI', ts_sync: ts };
  });
  // Reemplazo completo en una sola escritura: la matriz se arma entera antes
  // de tocar la hoja, así un corte a mitad no deja la nómina vacía.
  var sh = hoja_('PERSONAL');
  var enc = HOJAS.PERSONAL;
  var matriz = [enc].concat(activos.map(function (p) { return enc.map(function (c) { return p[c] === undefined ? '' : p[c]; }); }));
  sh.clearContents();
  sh.getRange(1, 1, matriz.length, enc.length).setValues(matriz);
  return { total: activos.length, faltan: [] };
}

// ---------- horómetro inicial ----------

/** Lee SVC_PANELPROG del snapshot de INGECOV como {codigo: ult_hrkm}. */
function horometrosIngecov_() {
  var out = {};
  var filas = null, header = null;
  var url = config_('INGECOV_SNAPSHOT_URL');
  if (url) {
    try {
      var j = JSON.parse(UrlFetchApp.fetch(url, { muteHttpExceptions: true }).getContentText());
      var tab = j && (j.SVC_PANELPROG || (j.tabs && j.tabs.SVC_PANELPROG));
      if (tab && tab.length) { header = tab[0].map(String); filas = tab.slice(1); }
    } catch (e) { /* cae al plan B */ }
  }
  if (!filas) {
    var t = leerPestana_(config_('SNAPSHOT_SHEET_ID'), ['SVC_PANELPROG']);
    if (!t) return out;
    header = t.header; filas = t.filas;
  }
  var iCod = idx_(header, ['CODIGO']);
  var iHr = idx_(header, ['ULT HRKM', 'ULTHRKM', 'ACTUAL']);
  if (iCod < 0 || iHr < 0) return out;
  filas.forEach(function (f) {
    var c = at_(f, iCod).toUpperCase(), v = Number(at_(f, iHr));
    if (c && isFinite(v) && v > 0) out[c] = v;
  });
  return out;
}

/** Siembra horom_tarja desde INGECOV para los equipos que todavía no tienen. */
function sembrarHorometros_() {
  var ref = horometrosIngecov_();
  var sembrados = 0;
  leer_('EQUIPOS').forEach(function (e) {
    if (String(e.horom_tarja) !== '' && e.horom_tarja != null) return;
    var v = ref[String(e.codigo).toUpperCase()];
    if (v === undefined) return;
    actualizar_('EQUIPOS', e._fila, { horom_tarja: v, origen_horom: 'INGECOV' });
    sembrados++;
  });
  return { sembrados: sembrados };
}

/** Horómetro actual según INGECOV para un equipo (para comparar en el panel). */
function horometroIngecovDe_(codigo) {
  var v = horometrosIngecov_()[String(codigo).toUpperCase()];
  return v === undefined ? null : v;
}

// ---------- todo junto ----------

function syncFuentes_() {
  var r = { equipos: syncEquipos_(), personal: syncPersonal_() };
  r.horometros = sembrarHorometros_();
  setProp_('ULTIMO_SYNC', tsStr_());
  return r;
}

/** Punto de entrada del trigger horario. */
function syncFuentes() { return syncFuentes_(); }
