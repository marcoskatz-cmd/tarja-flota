/**
 * Borrado real de una tarja. Existe SOLO para limpiar datos de prueba.
 *
 * El camino normal es anular desde el panel: la fila queda, con motivo y en el
 * LOG, y sale del consolidado. Esto otro elimina la fila y manda las fotos a la
 * papelera, y por eso está detrás de la clave de instalación.
 */

function borrarTarja_(codigo, fecha, aplicar) {
  var equipo = equipoPorCodigo_(codigo);
  var hoja = nombreHojaTarjas_(fecha);
  if (!ss_().getSheetByName(hoja)) throw new Error('No hay tarjas del año ' + String(fecha).slice(0, 4) + '.');
  var tarjas = leer_(hoja).filter(function (x) {
    return String(x.equipo).toUpperCase() === String(equipo.codigo).toUpperCase() && String(x.fecha) === String(fecha);
  });
  if (!tarjas.length) throw new Error('No hay tarja de ' + equipo.codigo + ' con fecha ' + fecha + '.');

  var ids = {};
  tarjas.forEach(function (t) { ids[String(t.id)] = true; });
  var resp = leer_('CHECKLIST_RESP').filter(function (r) { return ids[String(r.tarja_id)]; });
  var pend = leer_('PENDIENTES').filter(function (r) { return ids[String(r.tarja_id)]; });
  var abiertas = leer_('ABIERTAS').filter(function (a) { return ids[String(a.tarja_id)]; });
  var fotos = [];
  tarjas.forEach(function (t) { fotos.push(t.foto_horom_ini, t.foto_horom_fin, t.firma); });
  resp.forEach(function (r) { fotos.push(r.foto); });
  fotos = fotos.filter(function (u) { return String(u || '').trim(); });

  // Valor al que vuelve el horómetro: el sugerido de la primera tarja del día,
  // que es lo que el equipo tenía antes de estas jornadas.
  var previo = tarjas.slice().sort(function (a, b) { return String(a.ts_apertura) < String(b.ts_apertura) ? -1 : 1; })[0];
  var horomPrevio = Number(previo.horom_ini_sugerido || 0);

  var detalle = {
    equipo: equipo.codigo, fecha: String(fecha), tarjas: tarjas.length,
    checklist: resp.length, pendientes: pend.length, abiertas: abiertas.length, fotos: fotos.length,
    horom_a_restaurar: horomPrevio
  };
  if (!aplicar) return { simulacion: true, se_borraria: detalle, tarjas: tarjas.length };

  borrarFilas_('PENDIENTES', pend);
  borrarFilas_('CHECKLIST_RESP', resp);
  borrarFilas_('ABIERTAS', abiertas);
  borrarFilas_(hoja, tarjas);

  var papelera = 0;
  fotos.forEach(function (url) {
    var m = String(url).match(/[-\w]{25,}/);
    if (!m) return;
    try { DriveApp.getFileById(m[0]).setTrashed(true); papelera++; } catch (e) { /* ya no está */ }
  });

  var recalculado = horomSegunTarjas_(equipo.codigo);
  var pos = posicionSegunTarjas_(equipo.codigo);
  var ult = ultimaSegunTarjas_(equipo.codigo);
  actualizar_('EQUIPOS', equipo._fila, {
    horom_tarja: recalculado === null ? horomPrevio : recalculado,
    origen_horom: recalculado === null ? String(equipo.origen_horom || 'TARJA') : 'TARJA',
    // La posición del mapa vuelve a la última tarja que quede con GPS (o se vacía).
    lat: pos ? pos.lat : '', lon: pos ? pos.lon : '', ts_pos: pos ? pos.ts : '',
    ultimo_operador: ult ? ult.operador : '', ultima_tarja: ult ? ult.fecha : ''
  });

  log_('mantenimiento', 'BORRADO_TARJA',
    equipo.codigo + ' ' + String(fecha) + ' (' + tarjas.length + ' tarjas, ' + resp.length + ' respuestas, ' +
    pend.length + ' pendientes, ' + papelera + ' fotos)', 'dato de prueba');

  return { simulacion: false, borrado: detalle, fotos_a_papelera: papelera, tarjas: tarjas.length };
}

/** Último horómetro de cierre registrado para el equipo en cualquier año, o null si no hay. */
function horomSegunTarjas_(codigo) {
  var c = String(codigo).toUpperCase();
  var mejor = null;
  ss_().getSheets().forEach(function (sh) {
    if (!/^TARJAS_\d{4}$/.test(sh.getName())) return;
    leer_(sh.getName()).forEach(function (t) {
      if (String(t.equipo).toUpperCase() !== c || String(t.estado) !== 'cerrada' || t.horom_fin === '') return;
      if (!mejor || String(t.ts_cierre) > String(mejor.ts_cierre)) mejor = t;
    });
  });
  return mejor ? Number(mejor.horom_fin) : null;
}

/** Última posición GPS registrada en las tarjas del equipo, o null. */
function posicionSegunTarjas_(codigo) {
  var c = String(codigo).toUpperCase();
  var mejor = null;
  ss_().getSheets().forEach(function (sh) {
    if (!/^TARJAS_\d{4}$/.test(sh.getName())) return;
    leer_(sh.getName()).forEach(function (t) {
      if (String(t.equipo).toUpperCase() !== c || String(t.estado) === 'anulada') return;
      var cands = [[t.lat_fin, t.lon_fin, t.ts_cierre], [t.lat, t.lon, t.ts_apertura]];
      cands.forEach(function (k) {
        if (!gpsValido_(k[0], k[1]) || !k[2]) return;
        if (!mejor || String(k[2]) > mejor.ts) mejor = { lat: Number(k[0]), lon: Number(k[1]), ts: String(k[2]) };
      });
    });
  });
  return mejor;
}

/** Fecha y operario de la última tarja no anulada del equipo, o null. */
function ultimaSegunTarjas_(codigo) {
  var c = String(codigo).toUpperCase();
  var mejor = null;
  ss_().getSheets().forEach(function (sh) {
    if (!/^TARJAS_\d{4}$/.test(sh.getName())) return;
    leer_(sh.getName()).forEach(function (t) {
      if (String(t.equipo).toUpperCase() !== c || String(t.estado) === 'anulada') return;
      if (!mejor || String(t.ts_apertura) > mejor.ts) mejor = { ts: String(t.ts_apertura), fecha: String(t.fecha), operador: String(t.operador) };
    });
  });
  return mejor;
}

/** Borra de abajo hacia arriba para que no se corran los números de fila. */
function borrarFilas_(nombre, filas) {
  if (!filas.length) return;
  var sh = hoja_(nombre);
  filas.map(function (f) { return f._fila; })
    .sort(function (a, b) { return b - a; })
    .forEach(function (n) { sh.deleteRow(n); });
}

/**
 * Recalcula horom_tarja de los equipos que tienen tarjas cerradas. Los que no
 * tienen ninguna conservan lo que tengan (siembra de INGECOV o vacío).
 */
function recalcularHorometros_(aplicar) {
  var cambios = leer_('EQUIPOS').map(function (e) {
    var correcto = horomSegunTarjas_(e.codigo);
    return { codigo: e.codigo, _fila: e._fila, actual: Number(e.horom_tarja || 0), correcto: correcto };
  }).filter(function (c) { return c.correcto !== null && c.actual !== c.correcto; });

  if (!aplicar) {
    return { simulacion: true, se_corregirian: cambios.map(function (c) { return c.codigo + ': ' + c.actual + ' -> ' + c.correcto; }) };
  }
  cambios.forEach(function (c) {
    actualizar_('EQUIPOS', c._fila, { horom_tarja: c.correcto, origen_horom: 'TARJA' });
    log_('mantenimiento', 'RECALCULO_HOROMETRO', c.codigo + ': ' + c.actual + ' -> ' + c.correcto, 'según tarjas');
  });
  // Posiciones del mapa: cada equipo vuelve a la última que respaldan sus tarjas.
  var posiciones = 0;
  leer_('EQUIPOS').forEach(function (e) {
    var pos = posicionSegunTarjas_(e.codigo);
    var ult = ultimaSegunTarjas_(e.codigo);
    var lat = pos ? pos.lat : '', lon = pos ? pos.lon : '', ts = pos ? pos.ts : '';
    var op = ult ? ult.operador : '', fe = ult ? ult.fecha : '';
    if (String(e.lat) !== String(lat) || String(e.lon) !== String(lon) ||
        String(e.ultimo_operador) !== op || String(e.ultima_tarja) !== fe) {
      actualizar_('EQUIPOS', e._fila, { lat: lat, lon: lon, ts_pos: ts, ultimo_operador: op, ultima_tarja: fe });
      posiciones++;
    }
  });
  return { simulacion: false, corregidos: cambios.length, posiciones: posiciones };
}
