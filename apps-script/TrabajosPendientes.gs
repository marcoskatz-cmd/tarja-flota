/**
 * Tarja de equipos — INGECO
 * Espejo de las fallas (hoja PENDIENTES) en la hoja TRABAJOS PENDIENTES del
 * archivo de TRABAJOS de INGECOV (CONFIG SHEET_TRABAJOS_ID), que es la lista
 * única que el taller va a consultar por equipo.
 *
 *  - Falla abierta en la tarja sin fila en la hoja  → fila nueva, ESTADO "A revisar"
 *    (escalón previo a "Pendiente": nadie del taller la confirmó todavía).
 *  - Fila con ESTADO Realizado/Resuelto o FECHA RESOLUCIÓN cargada y la falla
 *    todavía abierta en la tarja → se cierra la falla (motivo Reparado, "Taller · INGECOV").
 *  - Falla cerrada desde el panel TARJAS y la fila todavía A revisar/Pendiente
 *    → la fila pasa a Realizado con motivo y quién la cerró. Nunca pisa lo que
 *    el taller ya escribió.
 *
 * La columna ID TRABAJO de la hoja guarda el id de la falla: es la llave del cruce.
 * Las columnas se buscan por encabezado (idx_), no por posición.
 */

var TP_ESTADO_NUEVO = 'Pendiente'; // Marcos (4-nov-2026): el desplegable de la hoja no admite "A revisar"; la fila se distingue por origen "Tarja · …"
var TP_ESTADO_RESUELTO = 'Realizado';

function hojaTrabajosPendientes_() {
  var id = config_('SHEET_TRABAJOS_ID');
  if (!id) return null;
  var ss;
  try { ss = SpreadsheetApp.openById(id); } catch (e) { return null; }
  var nombre = config_('HOJA_TRABAJOS_PENDIENTES') || 'TRABAJOS PENDIENTES';
  return ss.getSheetByName(nombre) || null;
}

function tpResuelto_(estado, fechaRes) {
  return /resuel|realiz/i.test(String(estado || '')) || String(fechaRes || '').trim() !== '';
}

/**
 * Fecha como TEXTO 'dd/MM/yyyy' ('' si no se puede). La hoja de Marcos rechaza
 * objetos Date escritos por script en FECHA (4-nov-2026: setValue(Date) no
 * persistía) pero el texto lo toma y lo convierte sola.
 */
function tpFecha_(v) {
  var iso = fechaIso_(v);
  return iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : '';
}
/** Date local a partir de lo que haya en una celda de fecha; null si no se puede. */
function tpFechaDate_(v) {
  var iso = fechaIso_(v);
  return iso ? fechaComoDate_(iso) : null;
}

/**
 * La columna ESTADO tiene validación estricta (hoy: Pendiente, En reparación,
 * Realizado). Me aseguro de que admita "A revisar" sin tocar el resto:
 *  - lista fija (VALUE_IN_LIST): se reemplaza por la misma lista + el valor;
 *  - lista desde rango (VALUE_IN_RANGE): se agrega el valor al final del rango
 *    (primera celda vacía o una fila más, ampliando la regla).
 * Devuelve un texto de diagnóstico.
 */
function tpAdmitirEstado_(sh, col, filaRef) {
  try {
    var cel = sh.getRange(Math.max(2, filaRef), col);
    if (typeof cel.getDataValidation !== 'function') return 'sin soporte';
    var dv = cel.getDataValidation();
    if (!dv) return 'sin validación';
    var tipo = String(dv.getCriteriaType());
    var args = dv.getCriteriaValues();
    var mostrar = args[1] !== false;
    if (tipo === 'VALUE_IN_LIST') {
      var lista = (args[0] || []).map(String);
      if (lista.indexOf(TP_ESTADO_NUEVO) >= 0) return 'lista ya admite';
      lista.push(TP_ESTADO_NUEVO);
      var nueva = SpreadsheetApp.newDataValidation().requireValueInList(lista, mostrar).setAllowInvalid(dv.getAllowInvalid()).build();
      sh.getRange(2, col, Math.max(sh.getMaxRows() - 1, 1), 1).setDataValidation(nueva);
      return 'lista ampliada: ' + lista.join(', ');
    }
    if (tipo === 'VALUE_IN_RANGE') {
      var rng = args[0];
      var vals = rng.getValues();
      var plano = [];
      vals.forEach(function (f) { f.forEach(function (v) { plano.push(String(v == null ? '' : v).trim()); }); });
      if (plano.indexOf(TP_ESTADO_NUEVO) >= 0) return 'rango ya admite';
      var hojaL = rng.getSheet(), f0 = rng.getRow(), c0 = rng.getColumn(), nF = rng.getNumRows();
      var libre = -1;
      for (var i = 0; i < nF; i++) { if (!String(vals[i][0] == null ? '' : vals[i][0]).trim()) { libre = i; break; } }
      if (libre >= 0) {
        hojaL.getRange(f0 + libre, c0).setValue(TP_ESTADO_NUEVO);
        return 'agregado al rango ' + hojaL.getName() + '!' + rng.getA1Notation();
      }
      hojaL.getRange(f0 + nF, c0).setValue(TP_ESTADO_NUEVO);
      var rngNuevo = hojaL.getRange(f0, c0, nF + 1, 1);
      var regla = SpreadsheetApp.newDataValidation().requireValueInRange(rngNuevo, mostrar).setAllowInvalid(dv.getAllowInvalid()).build();
      sh.getRange(2, col, Math.max(sh.getMaxRows() - 1, 1), 1).setDataValidation(regla);
      return 'rango ampliado a ' + hojaL.getName() + '!' + rngNuevo.getA1Notation();
    }
    return 'validación de tipo ' + tipo + ' sin tocar';
  } catch (e) { return 'error: ' + String(e && e.message || e); }
}

/**
 * Sincroniza PENDIENTES ↔ TRABAJOS PENDIENTES en los dos sentidos.
 * Devuelve { agregados, cerrados_en_tarja, cerrados_en_hoja } o { omitido }.
 */
function sincronizarTrabajosPendientes_(soloVer) {
  var sh = hojaTrabajosPendientes_();
  if (!sh) return { omitido: config_('SHEET_TRABAJOS_ID') ? 'no pude abrir la hoja TRABAJOS PENDIENTES' : 'sin SHEET_TRABAJOS_ID' };

  var ultima = sh.getLastRow(), nCols = sh.getLastColumn();
  if (ultima < 1 || nCols < 1) return { omitido: 'hoja vacía, sin encabezado' };
  var vals = sh.getRange(1, 1, ultima, nCols).getValues();
  var head = vals[0].map(String);
  var c = {
    cod: idx_(head, ['CÓDIGO', 'CODIGO']),
    equ: idx_(head, ['EQUIPO']),
    fec: idx_(head, ['FECHA']),
    pat: idx_(head, ['N° SERIE/PATENTE', 'N SERIE/PATENTE', 'PATENTE']),
    des: idx_(head, ['DESCRIPCIÓN TRABAJOS', 'DESCRIPCION TRABAJOS', 'DESCRIPCIÓN', 'DESCRIPCION']),
    res: idx_(head, ['ORIGEN/RESPONSABLE', 'ORIGEN RESPONSABLE', 'RESPONSABLE', 'ORIGEN']),
    est: idx_(head, ['ESTADO']),
    fre: idx_(head, ['FECHA RESOLUCIÓN', 'FECHA RESOLUCION']),
    dre: idx_(head, ['DESCRIPCIÓN RESOLUCIÓN', 'DESCRIPCION RESOLUCION']),
    id: idx_(head, ['ID TRABAJO', 'ID'])
  };
  if (c.cod < 0 || c.est < 0 || c.id < 0) {
    return { omitido: 'faltan columnas en TRABAJOS PENDIENTES: ' + ['cod', 'est', 'id'].filter(function (k) { return c[k] < 0; }).join(', ') };
  }

  // Filas de la hoja por ID de falla. Las filas "rotas" (origen Tarja, sin ID ni
  // ESTADO: quedaron a medio escribir cuando la validación rechazó el estado)
  // se reutilizan para las fallas nuevas, porque la hoja no deja borrar filas por script.
  var porId = {}, rotas = [];
  for (var i = 1; i < vals.length; i++) {
    var id = String(vals[i][c.id] == null ? '' : vals[i][c.id]).trim();
    if (id) { porId[id] = { fila: i + 1, estado: String(vals[i][c.est] || ''), fechaRes: c.fre >= 0 ? vals[i][c.fre] : '' }; continue; }
    if (c.res >= 0 && /^Tarja/.test(String(vals[i][c.res] || '')) && !String(vals[i][c.est] || '').trim()) rotas.push(i + 1);
  }

  var pend = leer_('PENDIENTES');
  var equipos = {};
  leer_('EQUIPOS').forEach(function (e) { equipos[String(e.codigo).trim().toUpperCase()] = e; });
  var operadorDe = {}, hojasVistas = {};
  function operador_(p) {
    var tid = String(p.tarja_id || '');
    if (!tid || tid === 'PD') return '';
    if (operadorDe[tid] !== undefined) return operadorDe[tid];
    var anio = String(p.fecha_apertura || '').slice(0, 4);
    if (anio && !hojasVistas[anio]) {
      hojasVistas[anio] = true;
      if (ss_().getSheetByName('TARJAS_' + anio)) leer_('TARJAS_' + anio).forEach(function (t) {
        operadorDe[String(t.id)] = String(t.operador || '').trim();
      });
    }
    return operadorDe[tid] || '';
  }

  var nuevas = [], cerradosTarja = 0, cerradosHoja = 0, hoy = hoyStr_();
  var validacion = tpAdmitirEstado_(sh, c.est + 1, ultima);

  pend.forEach(function (p) {
    var pid = String(p.id || '').trim();
    if (!pid) return;
    var fila = porId[pid];
    var cod = String(p.equipo || '').trim().toUpperCase();
    var abierta = String(p.estado) === 'abierto';

    if (!fila) {
      if (!abierta) return; // cerrada y nunca estuvo en la hoja: no la inventamos
      var eq = equipos[cod];
      var nombre = eq ? (String(eq.descripcion || '').trim() || [eq.marca, eq.modelo].map(function (v) { return String(v || '').trim(); }).filter(Boolean).join(' ')) : '';
      var desc = String(p.item || '').trim();
      if (String(p.comentario || '').trim()) desc += ': ' + String(p.comentario).trim();
      if (String(p.foto || '').trim()) desc += ' · foto: ' + String(p.foto).trim();
      var op = operador_(p);
      var r = [];
      for (var k = 0; k < nCols; k++) r.push('');
      r[c.cod] = cod;
      if (c.equ >= 0) r[c.equ] = nombre ? cod + ' — ' + nombre : cod;
      if (c.fec >= 0) r[c.fec] = tpFecha_(p.fecha_apertura);
      if (c.pat >= 0 && eq) r[c.pat] = String(eq.patente || '').trim();
      if (c.des >= 0) r[c.des] = desc;
      if (c.res >= 0) r[c.res] = op ? 'Tarja · ' + op : 'Tarja';
      r[c.est] = TP_ESTADO_NUEVO;
      r[c.id] = pid;
      nuevas.push(r);
      return;
    }

    var filaResuelta = tpResuelto_(fila.estado, fila.fechaRes);
    if (abierta && filaResuelta) {
      // El taller la resolvió en la hoja → cerrar en la tarja
      var fRes = tpFechaDate_(fila.fechaRes);
      if (!soloVer) actualizar_('PENDIENTES', p._fila, {
        estado: 'cerrado',
        fecha_cierre: fRes ? Utilities.formatDate(fRes, CFG.TZ, 'yyyy-MM-dd') : hoy,
        motivo_cierre: 'Reparado',
        cerrado_por: 'Taller · INGECOV'
      });
      cerradosTarja++;
      return;
    }
    if (!abierta && !filaResuelta) {
      // Cerrada desde el panel TARJAS → la hoja pasa a Realizado
      if (!soloVer) sh.getRange(fila.fila, c.est + 1).setValue(TP_ESTADO_RESUELTO);
      if (!soloVer && c.fre >= 0) sh.getRange(fila.fila, c.fre + 1).setValue(tpFecha_(p.fecha_cierre) || tpFecha_(hoy));
      if (!soloVer && c.dre >= 0) {
        var txt = [String(p.motivo_cierre || '').trim(), String(p.cerrado_por || '').trim()].filter(Boolean).join(' · ');
        sh.getRange(fila.fila, c.dre + 1).setValue((txt || 'Cerrada') + ' (panel tarjas)');
      }
      cerradosHoja++;
    }
  });

  if (soloVer) return { agregarian: nuevas.length, filas_rotas_a_reusar: rotas, cerrarian_en_tarja: cerradosTarja, cerrarian_en_hoja: cerradosHoja, validacion: validacion, muestra: nuevas.slice(0, 3) };

  // Escritura fila por fila, ESTADO primero: si la validación de la hoja
  // rechaza "A revisar", no queda nada a medio escribir y se corta con aviso.
  var agregados = 0, errorEstado = '';
  var siguiente = sh.getLastRow() + 1;
  for (var n = 0; n < nuevas.length; n++) {
    var filaDestino = rotas.length ? rotas.shift() : siguiente++;
    try {
      sh.getRange(filaDestino, c.est + 1).setValue(TP_ESTADO_NUEVO);
      SpreadsheetApp.flush(); // la validación recién salta acá, no en el setValue
    } catch (eVal) {
      errorEstado = 'La hoja no admite "' + TP_ESTADO_NUEVO + '" en ESTADO (agregar la opción al desplegable de la columna). ' + String(eVal && eVal.message || eVal);
      break;
    }
    sh.getRange(filaDestino, 1, 1, nCols).setValues([nuevas[n]]);
    agregados++;
  }
  if (agregados || cerradosTarja || cerradosHoja) {
    log_('sistema', 'SYNC_TRAB_PEND', agregados + ' nuevas, ' + cerradosTarja + ' cerradas en tarja, ' + cerradosHoja + ' cerradas en hoja', errorEstado);
  } else if (errorEstado) {
    log_('sistema', 'SYNC_TRAB_PEND_ERROR', '', errorEstado);
  }
  setProp_('ULTIMO_SYNC_TRAB_PEND', String(Date.now()));
  var res = { agregados: agregados, pendientes_de_escribir: nuevas.length - agregados, cerrados_en_tarja: cerradosTarja, cerrados_en_hoja: cerradosHoja, validacion: validacion };
  if (errorEstado) res.error_estado = errorEstado;
  return res;
}

/** Versión que nunca tira: para colgar de guardarChecklist_/cerrarPendiente_/sync. */
function sincronizarTrabajosPendientesSeguro_() {
  try { return sincronizarTrabajosPendientes_(); }
  catch (e) {
    try { log_('sistema', 'SYNC_TRAB_PEND_ERROR', '', String(e && e.message || e)); } catch (e2) { }
    return { error: String(e && e.message || e) };
  }
}

/** Como mucho una vez cada 15 minutos (panel / rutas públicas). */
function sincronizarTrabajosPendientesSiToca_() {
  var ult = Number(prop_('ULTIMO_SYNC_TRAB_PEND') || 0);
  if (Date.now() - ult < 15 * 60 * 1000) return;
  sincronizarTrabajosPendientesSeguro_();
}

/** Para correr a mano desde el editor. */
function sincronizarTrabajosPendientes() { return sincronizarTrabajosPendientes_(); }

/** Diagnóstico: regla de validación de ESTADO y últimas filas de la hoja. */
function diagnosticoTrabajosPendientes_() {
  var sh = hojaTrabajosPendientes_();
  if (!sh) return { error: 'sin hoja' };
  var ultima = sh.getLastRow(), nCols = sh.getLastColumn();
  var head = sh.getRange(1, 1, 1, nCols).getValues()[0].map(String);
  var iEst = idx_(head, ['ESTADO']);
  var out = { ultima: ultima, head: head, col_estado: iEst + 1 };
  try {
    var dv = sh.getRange(Math.max(2, ultima), iEst + 1).getDataValidation();
    out.regla = dv ? { tipo: String(dv.getCriteriaType()), args: dv.getCriteriaValues().map(function (a) { return a && a.getA1Notation ? (a.getSheet().getName() + '!' + a.getA1Notation() + ' = ' + JSON.stringify(a.getValues())) : String(a); }), allow_invalid: dv.getAllowInvalid() } : null;
    var dv2 = sh.getRange(ultima + 1, iEst + 1).getDataValidation();
    out.regla_fila_siguiente = dv2 ? { tipo: String(dv2.getCriteriaType()), args: dv2.getCriteriaValues().map(function (a) { return a && a.getA1Notation ? (a.getSheet().getName() + '!' + a.getA1Notation()) : String(a); }) } : null;
  } catch (e) { out.regla_error = String(e && e.message || e); }
  out.ultimas = sh.getRange(Math.max(2, ultima - 4), 1, Math.min(5, ultima), nCols).getValues();
  out.admitir = tpAdmitirEstado_(sh, iEst + 1, ultima);
  return out;
}

/**
 * Borra filas que quedaron a medio escribir (origen "Tarja…" sin ID TRABAJO):
 * pasó cuando la validación de ESTADO rechazó "A revisar" a mitad del setValues.
 * aplicar=false → solo lista.
 */
function limpiarTrabajosPendientesRotos_(aplicar) {
  var sh = hojaTrabajosPendientes_();
  if (!sh) return { error: 'sin hoja' };
  var ultima = sh.getLastRow(), nCols = sh.getLastColumn();
  var vals = sh.getRange(1, 1, ultima, nCols).getValues();
  var head = vals[0].map(String);
  var iRes = idx_(head, ['ORIGEN/RESPONSABLE', 'ORIGEN RESPONSABLE', 'RESPONSABLE', 'ORIGEN']);
  var iId = idx_(head, ['ID TRABAJO', 'ID']), iEst = idx_(head, ['ESTADO']);
  var rotas = [];
  for (var i = 1; i < vals.length; i++) {
    var res = String(vals[i][iRes] || ''), id = String(vals[i][iId] || '').trim(), est = String(vals[i][iEst] || '').trim();
    if (/^Tarja/.test(res) && !id && !est) rotas.push({ fila: i + 1, datos: vals[i] });
  }
  if (aplicar) rotas.slice().reverse().forEach(function (r) { sh.deleteRow(r.fila); });
  return { aplicado: !!aplicar, filas: rotas.map(function (r) { return r.fila; }), datos: rotas.map(function (r) { return r.datos; }) };
}

/** Diagnóstico profundo: protecciones y si los cambios persisten dentro de una misma ejecución. */
function diagnosticoTrabajosPendientes2_(aplicar) {
  var sh = hojaTrabajosPendientes_();
  var out = { owner: '' };
  try { out.owner = sh.getParent().getOwner() ? sh.getParent().getOwner().getEmail() : '(sin owner: unidad compartida)'; } catch (e) { out.owner = 'err ' + e.message; }
  out.protecciones_hoja = sh.getProtections(SpreadsheetApp.ProtectionType.SHEET).map(function (pr) { return { desc: pr.getDescription(), canEdit: pr.canEdit(), warning: pr.isWarningOnly() }; });
  out.protecciones_rango = sh.getProtections(SpreadsheetApp.ProtectionType.RANGE).map(function (pr) { return { rango: pr.getRange().getA1Notation(), desc: pr.getDescription(), canEdit: pr.canEdit(), warning: pr.isWarningOnly() }; });
  var ultima = sh.getLastRow();
  out.ultima_antes = ultima;
  var g = sh.getRange(ultima, 7);
  out.regla_antes = String(g.getDataValidation() && g.getDataValidation().getCriteriaValues()[0]);
  if (aplicar) {
    var regla = SpreadsheetApp.newDataValidation().requireValueInList(['Pendiente', 'En reparación', 'Realizado', 'A revisar'], true).setAllowInvalid(false).build();
    sh.getRange(2, 7, sh.getMaxRows() - 1, 1).setDataValidation(regla);
    SpreadsheetApp.flush();
    out.regla_despues = String(sh.getRange(ultima, 7).getDataValidation().getCriteriaValues()[0]);
    out.regla_fila_siguiente = String(sh.getRange(ultima + 1, 7).getDataValidation() && sh.getRange(ultima + 1, 7).getDataValidation().getCriteriaValues()[0]);
    var r = limpiarTrabajosPendientesRotos_(true);
    SpreadsheetApp.flush();
    out.limpiadas = r.filas;
    out.ultima_despues = sh.getLastRow();
  }
  return out;
}


