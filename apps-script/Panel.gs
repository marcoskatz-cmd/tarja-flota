/**
 * API del panel (módulo TARJAS de App INGECO). Todas las rutas exigen la
 * sesión del shell. Lo que escribe el panel queda en LOG con el nombre de
 * quien lo hizo.
 */

function conSesion_(fn) {
  return function (p) {
    var u = sesionShell_(p);
    return fn(p, u);
  };
}

function diasEntre_(fechaA, fechaB) {
  if (!fechaA || !fechaB) return null;
  var a = Date.UTC(+fechaA.slice(0, 4), +fechaA.slice(5, 7) - 1, +fechaA.slice(8, 10));
  var b = Date.UTC(+fechaB.slice(0, 4), +fechaB.slice(5, 7) - 1, +fechaB.slice(8, 10));
  return Math.round((b - a) / 86400000);
}

// ---------- Hoy ----------

function panelHoy_(p) {
  var fecha = hoyStr_();
  var hoja = nombreHojaTarjas_(fecha);
  hojaTarjas_(Number(fecha.slice(0, 4)));
  var tarjasHoy = leer_(hoja).filter(function (t) { return String(t.fecha) === fecha && String(t.estado) !== 'anulada'; });
  var abiertas = {};
  leer_('ABIERTAS').forEach(function (a) { abiertas[String(a.equipo).toUpperCase()] = a; });
  var pendAbiertos = {};
  leer_('PENDIENTES').forEach(function (x) {
    if (String(x.estado) === 'abierto') pendAbiertos[String(x.equipo).toUpperCase()] = (pendAbiertos[String(x.equipo).toUpperCase()] || 0) + 1;
  });
  var fallasHoy = leer_('CHECKLIST_RESP').filter(function (r) { return String(r.fecha) === fecha && String(r.estado) === 'PROBLEMA'; });
  var diasSinAct = configNum_('DIAS_SIN_ACTIVIDAD') || 7;

  var equipos = activosTarja_().map(function (e) {
    var c = String(e.codigo).toUpperCase();
    var mias = tarjasHoy.filter(function (t) { return String(t.equipo).toUpperCase() === c; })
      .sort(function (a, b) { return String(a.ts_apertura) < String(b.ts_apertura) ? -1 : 1; });
    var horas = mias.reduce(function (s, t) { return s + (Number(t.horas) || 0); }, 0);
    var ab = abiertas[c];
    var estado;
    if (ab) estado = 'abierta';
    else if (mias.length) estado = 'cerrada';
    else {
      var d = diasEntre_(String(e.ultima_tarja || ''), fecha);
      estado = (d === null || d > diasSinAct) ? 'sin_actividad' : 'sin_tarja';
    }
    var ultima = mias[mias.length - 1];
    return {
      codigo: String(e.codigo), descripcion: String(e.descripcion || ''), lugar: String(e.lugar || ''),
      estado: estado, horas: Math.round(horas * 10) / 10, jornadas: mias.length,
      operador: ab ? String(ab.operador) : (ultima ? String(ultima.operador) : String(e.ultimo_operador || '')),
      desde: ab ? String(ab.ts_apertura).slice(11, 16) : '',
      ultima_tarja: String(e.ultima_tarja || ''),
      horom_tarja: e.horom_tarja === '' ? '' : Number(e.horom_tarja),
      problemas_hoy: fallasHoy.filter(function (f) { return String(f.equipo).toUpperCase() === c; }).length,
      pendientes_abiertos: pendAbiertos[c] || 0,
      cierre_tercero: mias.some(function (t) { return String(t.cierre_tercero) === 'SI'; }),
      excepcion: mias.some(function (t) { return String(t.excepcion) === 'SI'; })
    };
  });
  return {
    fecha: fecha,
    equipos: equipos,
    fallas_hoy: fallasHoy.map(function (f) { return { equipo: f.equipo, item: f.item, comentario: f.comentario, foto: f.foto, ts: f.ts }; }),
    diagnostico: diagnosticar_()
  };
}

// ---------- Mapa ----------

function panelMapa_() {
  try { posicionesDesdePartesSiToca_(); } catch (e) { }
  return {
    puntos: activosTarja_().filter(function (e) { return gpsValido_(e.lat, e.lon); }).map(function (e) {
      return {
        codigo: String(e.codigo), descripcion: String(e.descripcion || ''), lugar: String(e.lugar || ''),
        lat: Number(e.lat), lon: Number(e.lon), ts_pos: String(e.ts_pos || ''),
        operador: String(e.ultimo_operador || ''), horom_tarja: e.horom_tarja === '' ? '' : Number(e.horom_tarja)
      };
    })
  };
}

// ---------- Equipo ----------

function tarjasDe_(codigo, desde, hasta) {
  var c = String(codigo).toUpperCase();
  var out = [];
  ss_().getSheets().forEach(function (sh) {
    var n = sh.getName();
    if (!/^TARJAS_\d{4}$/.test(n)) return;
    var anio = n.slice(7);
    if (desde && anio < String(desde).slice(0, 4)) return;
    if (hasta && anio > String(hasta).slice(0, 4)) return;
    leer_(n).forEach(function (t) {
      if (String(t.equipo).toUpperCase() !== c) return;
      var f = String(t.fecha);
      if (desde && f < desde) return;
      if (hasta && f > hasta) return;
      out.push(t);
    });
  });
  return out.sort(function (a, b) { return String(b.ts_apertura) < String(a.ts_apertura) ? -1 : 1; });
}

function panelEquipoHistorial_(p) {
  var e = equipoPorCodigo_(p.codigo);
  var tarjas = tarjasDe_(e.codigo, p.desde, p.hasta).slice(0, Number(p.max) || 60);
  var ingecov = null;
  try { ingecov = horometroIngecovDe_(e.codigo); } catch (err) { ingecov = null; }
  var tarja = e.horom_tarja === '' ? null : Number(e.horom_tarja);
  var dif = (ingecov !== null && tarja !== null) ? Math.abs(ingecov - tarja) : null;
  return {
    equipo: { codigo: e.codigo, descripcion: e.descripcion, lugar: e.lugar, tipo_rodado: e.tipo_rodado, patente: e.patente, origen_horom: e.origen_horom },
    tarjas: tarjas.map(tarjaPublica_),
    pendientes: leer_('PENDIENTES').filter(function (x) { return String(x.equipo).toUpperCase() === String(e.codigo).toUpperCase() && String(x.estado) === 'abierto'; }),
    horom_tarja: tarja,
    horom_ingecov: ingecov,
    diferencia: dif,
    diferencia_alta: dif !== null && dif > configNum_('UMBRAL_DIF_INGECOV_HS')
  };
}

// ---------- Consolidado ----------

function panelConsolidado_(p) {
  var anio = String(p.anio || hoyStr_().slice(0, 4));
  var mes = p.mes ? ('0' + Number(p.mes)).slice(-2) : '';
  var hoja = 'TARJAS_' + anio;
  if (!ss_().getSheetByName(hoja)) return { anio: anio, mes: mes, filas: [] };
  var equipos = {};
  leer_('EQUIPOS').forEach(function (e) { equipos[String(e.codigo).toUpperCase()] = e; });
  var acum = {};
  leer_(hoja).forEach(function (t) {
    if (String(t.estado) !== 'cerrada') return;
    var f = String(t.fecha);
    var m = f.slice(0, 7);
    if (mes && f.slice(5, 7) !== mes) return;
    var c = String(t.equipo).toUpperCase();
    var lugar = String(t.obra || (equipos[c] && equipos[c].lugar) || '');
    var k = c + '|' + m + '|' + lugar;
    if (!acum[k]) acum[k] = { codigo: String(t.equipo), descripcion: String((equipos[c] && equipos[c].descripcion) || ''), lugar: lugar, mes: m, horas: 0, jornadas: 0 };
    acum[k].horas += Number(t.horas) || 0;
    acum[k].jornadas++;
  });
  var filas = Object.keys(acum).map(function (k) { acum[k].horas = Math.round(acum[k].horas * 10) / 10; return acum[k]; })
    .sort(function (a, b) { return (a.mes + a.codigo).localeCompare(b.mes + b.codigo); });
  return { anio: anio, mes: mes, filas: filas };
}

// ---------- Pendientes (fallas) ----------

function panelPendientes_() {
  return {
    pendientes: leer_('PENDIENTES').filter(function (x) { return String(x.estado) === 'abierto'; })
      .sort(function (a, b) { return String(b.fecha_apertura).localeCompare(String(a.fecha_apertura)); }),
    motivos: MOTIVO_CIERRE_PENDIENTE
  };
}

function cerrarPendiente_(p, u) {
  var x = buscarPorId_('PENDIENTES', p.id);
  if (!x) throw new Error('No se encontró la falla.');
  var motivo = String(p.motivo || '').trim();
  if (MOTIVO_CIERRE_PENDIENTE.indexOf(motivo) < 0) throw new Error('Elegí un motivo de la lista: ' + MOTIVO_CIERRE_PENDIENTE.join(', ') + '.');
  actualizar_('PENDIENTES', x._fila, { estado: 'cerrado', fecha_cierre: hoyStr_(), motivo_cierre: motivo, cerrado_por: u.nombre });
  log_(u.nombre, 'CERRAR_PENDIENTE', x.equipo + ' · ' + x.item, motivo);
  return { ok: true };
}

// ---------- Anular ----------

function anularTarja_(p, u) {
  var t = tarjaPorId_(p.tarja_id);
  if (!t) throw new Error('No se encontró la jornada.');
  if (String(t.estado) === 'anulada') return { ya_estaba: true };
  var motivo = String(p.motivo || '').trim();
  if (!motivo) throw new Error('Para anular hay que indicar el motivo.');
  var eraCerrada = String(t.estado) === 'cerrada';
  actualizar_(t._hoja, t._fila, { estado: 'anulada', anulada_ts: tsStr_(), anulada_por: u.nombre, anulada_motivo: motivo });
  borrarFilas_('ABIERTAS', leer_('ABIERTAS').filter(function (a) { return String(a.tarja_id) === String(t.id); }));
  if (eraCerrada) {
    var e = equipoPorCodigo_(t.equipo);
    var rec = horomSegunTarjas_(e.codigo);
    actualizar_('EQUIPOS', e._fila, { horom_tarja: rec === null ? Number(t.horom_ini_sugerido || 0) : rec });
  }
  log_(u.nombre, 'ANULAR_TARJA', t.equipo + ' ' + String(t.fecha) + ' (' + t.operador + ')', motivo);
  return { ok: true };
}

// ---------- Configuración de equipos y operadores manuales ----------

function panelEquiposConfig_() {
  return { equipos: leer_('EQUIPOS').map(function (e) { var o = {}; HOJAS.EQUIPOS.forEach(function (c) { o[c] = e[c]; }); return o; }) };
}

function setEquipo_(p, u) {
  var e = equipoPorCodigo_(p.codigo);
  var cambios = {};
  if (p.tipo_rodado !== undefined) {
    var t = String(p.tipo_rodado || '').toLowerCase();
    if (['oruga', 'rodante', ''].indexOf(t) < 0) throw new Error('El tipo de rodado tiene que ser oruga o rodante.');
    cambios.tipo_rodado = t;
  }
  if (p.activo_tarja !== undefined) cambios.activo_tarja = String(p.activo_tarja).toUpperCase() === 'SI' ? 'SI' : 'NO';
  if (!Object.keys(cambios).length) return { ok: true, sin_cambios: true };
  actualizar_('EQUIPOS', e._fila, cambios);
  log_(u.nombre, 'CONFIG_EQUIPO', e.codigo + ' ' + JSON.stringify(cambios), '');
  return { ok: true };
}

function panelOperadoresManuales_() {
  return { operadores: leer_('OPERADORES_MANUALES'), personas: activos_('PERSONAL').map(function (x) { return { legajo: String(x.legajo), nombre: String(x.nombre) }; }) };
}

/** Vincula un nombre escrito a mano con un legajo y corrige las tarjas del año actual. */
function vincularOperador_(p, u) {
  var nombre = String(p.nombre || '').trim();
  var persona = activos_('PERSONAL').filter(function (x) { return String(x.legajo) === String(p.legajo); })[0];
  if (!nombre || !persona) throw new Error('Falta el nombre o el legajo no está en la nómina.');
  var hoja = nombreHojaTarjas_(hoyStr_());
  var n = 0;
  leer_(hoja).forEach(function (t) {
    if (String(t.operador_manual) === 'SI' && normalizarTexto_(t.operador) === normalizarTexto_(nombre)) {
      actualizar_(hoja, t._fila, { legajo: String(persona.legajo), operador: String(persona.nombre), operador_manual: 'VINCULADO' });
      n++;
    }
  });
  leer_('OPERADORES_MANUALES').forEach(function (o) {
    if (normalizarTexto_(o.nombre) === normalizarTexto_(nombre)) actualizar_('OPERADORES_MANUALES', o._fila, { legajo_vinculado: String(persona.legajo) });
  });
  log_(u.nombre, 'VINCULAR_OPERADOR', nombre + ' -> ' + persona.legajo + ' ' + persona.nombre + ' (' + n + ' tarjas)', '');
  return { ok: true, tarjas: n };
}

function panelDiagnostico_() {
  return { problemas: diagnosticar_(), ultimo_sync: prop_('ULTIMO_SYNC') || '' };
}

var RUTAS_PANEL = {
  hoy: conSesion_(panelHoy_),
  mapa: conSesion_(panelMapa_),
  equipo_historial: conSesion_(panelEquipoHistorial_),
  consolidado: conSesion_(panelConsolidado_),
  pendientes: conSesion_(panelPendientes_),
  cerrar_pendiente: conSesion_(cerrarPendiente_),
  anular: conSesion_(anularTarja_),
  equipos_config: conSesion_(panelEquiposConfig_),
  set_equipo: conSesion_(setEquipo_),
  operadores_manuales: conSesion_(panelOperadoresManuales_),
  vincular_operador: conSesion_(vincularOperador_),
  diagnostico: conSesion_(panelDiagnostico_),
  sync_ahora: conSesion_(function (p, u) { log_(u.nombre, 'SYNC_MANUAL', '', ''); return syncFuentes_(); })
};
