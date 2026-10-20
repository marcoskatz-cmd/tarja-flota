/**
 * Ciclo de vida de la tarja: apertura (con checklist y firma), cierre, cierre
 * por un tercero.
 *
 * Reglas duras que se aplican acá y en ningún otro lado:
 *  - Varias jornadas por día, pero NUNCA dos abiertas a la vez en el mismo
 *    equipo. La hoja ABIERTAS es el índice: una fila por jornada abierta, así
 *    la app del operario no lee el histórico del año.
 *  - Cada envío trae su op_id. Un reintento devuelve lo ya guardado.
 *  - Delta de horómetro calculado en el servidor. Negativos y > MAX rechazados.
 *  - Fecha y hora del servidor, nunca del dispositivo.
 *  - Tarja cerrada = congelada. Solo se anula desde el panel.
 *  - El checklist es pre-operacional: va en la apertura, una vez por equipo y día.
 *  - Si el horómetro tipeado está lejos del último conocido, probablemente el
 *    operario eligió otro equipo: se le pregunta antes de aceptar la corrección.
 */

function equipoPorCodigo_(codigo) {
  var c = String(codigo || '').toUpperCase().trim();
  var e = leer_('EQUIPOS').filter(function (r) { return String(r.codigo).toUpperCase() === c; })[0];
  if (!e) throw new Error('El equipo ' + codigo + ' no está en la lista.');
  return e;
}

/** Fila de ABIERTAS del equipo, o null. */
function abiertaDe_(codigo) {
  var c = String(codigo).toUpperCase();
  return leer_('ABIERTAS').filter(function (a) { return String(a.equipo).toUpperCase() === c; })[0] || null;
}

/** La tarja (fila de TARJAS_<año>) que referencia una fila de ABIERTAS. */
function tarjaDeAbierta_(ab) {
  return buscarPorId_('TARJAS_' + ab.anio, ab.tarja_id);
}

/** Busca una tarja por id en el año actual y el anterior (cambio de año). */
function tarjaPorId_(id) {
  var anio = Number(hoyStr_().slice(0, 4));
  for (var a = anio; a >= anio - 1; a--) {
    if (!ss_().getSheetByName('TARJAS_' + a)) continue;
    var t = buscarPorId_('TARJAS_' + a, id);
    if (t) { t._hoja = 'TARJAS_' + a; return t; }
  }
  return null;
}

function tarjaPorOpId_(opId) {
  if (!opId) return null;
  var anio = Number(hoyStr_().slice(0, 4));
  for (var a = anio; a >= anio - 1; a--) {
    if (!ss_().getSheetByName('TARJAS_' + a)) continue;
    var t = leer_('TARJAS_' + a).filter(function (x) { return String(x.op_id) === String(opId); })[0];
    if (t) { t._hoja = 'TARJAS_' + a; return t; }
  }
  return null;
}

/** Tarjas de hoy del equipo (no anuladas). */
function tarjasDelDia_(codigo, fecha) {
  var c = String(codigo).toUpperCase();
  // El 1 de enero la hoja del año todavía no existe: no hay tarjas, no un error.
  if (!ss_().getSheetByName(nombreHojaTarjas_(fecha))) return [];
  return leer_(nombreHojaTarjas_(fecha)).filter(function (t) {
    return String(t.equipo).toUpperCase() === c && String(t.fecha) === fecha && String(t.estado) !== 'anulada';
  });
}

function itemsDe_(tipoRodado) {
  var tipo = String(tipoRodado || '').toLowerCase();
  return activos_('CHECKLIST_ITEMS')
    .filter(function (i) { var t = String(i.tipo || '').toLowerCase(); return !t || t === tipo; })
    .sort(function (a, b) { return Number(a.orden) - Number(b.orden); })
    .map(function (i) { return { orden: Number(i.orden), tipo: String(i.tipo || ''), item: String(i.item) }; });
}

function horasEntre_(tsIni, tsFin) {
  var a = new Date(String(tsIni).replace(' ', 'T'));
  var b = new Date(String(tsFin).replace(' ', 'T'));
  return Math.round(((b - a) / 3600000) * 10) / 10;
}

/** Lo que le toca al operario con este equipo. Primera llamada de la PWA. */
function estadoDelDia_(p) {
  var equipo = equipoPorCodigo_(p.equipo);
  var fecha = hoyStr_();
  var ab = abiertaDe_(equipo.codigo);
  var abierta = null;
  if (ab) {
    var t = tarjaDeAbierta_(ab);
    abierta = t ? {
      tarja_id: t.id, operador: t.operador, legajo: t.legajo, fecha: String(t.fecha),
      ts_apertura: t.ts_apertura, horom_ini: t.horom_ini, horas_abierta: horasEntre_(t.ts_apertura, tsStr_())
    } : { tarja_id: ab.tarja_id, operador: ab.operador, legajo: ab.legajo, ts_apertura: ab.ts_apertura, horom_ini: '' };
  }
  var checklistHecho = tarjasDelDia_(equipo.codigo, fecha).some(function (t) { return String(t.checklist_hecho) === 'SI'; });
  return {
    fecha: fecha,
    hora: tsStr_().slice(11, 16),
    equipo: equipo.codigo,
    descripcion: equipo.descripcion,
    tipo_rodado: equipo.tipo_rodado,
    abierta: abierta,
    sugerido: sinHorometro_(equipo) ? null : Number(equipo.horom_tarja),
    origen_horom: String(equipo.origen_horom || ''),
    checklist_pendiente: !checklistHecho,
    items: itemsDe_(equipo.tipo_rodado),
    motivos_cierre_tercero: MOTIVO_CIERRE_TERCERO
  };
}

function tarjaPublica_(t) {
  return {
    id: t.id, equipo: t.equipo, fecha: String(t.fecha), estado: t.estado,
    legajo: t.legajo, operador: t.operador, operador_manual: t.operador_manual, obra: t.obra,
    horom_ini: t.horom_ini, horom_fin: t.horom_fin, horas: t.horas, excepcion: t.excepcion,
    checklist_hecho: t.checklist_hecho,
    foto_horom_ini: t.foto_horom_ini, foto_horom_fin: t.foto_horom_fin,
    lat: t.lat, lon: t.lon, lat_fin: t.lat_fin, lon_fin: t.lon_fin, precision_gps: t.precision_gps,
    cierre_tercero: t.cierre_tercero, legajo_cierre: t.legajo_cierre, motivo_cierre_tercero: t.motivo_cierre_tercero,
    ts_apertura: t.ts_apertura, ts_cierre: t.ts_cierre
  };
}

/** Equipo sin horómetro previo (ni tarja ni siembra): no hay con qué comparar. */
function sinHorometro_(equipo) {
  return equipo.horom_tarja === '' || equipo.horom_tarja == null || !isFinite(Number(equipo.horom_tarja));
}

function gpsValido_(lat, lon) {
  var a = Number(lat), b = Number(lon);
  return lat !== '' && lat != null && lon !== '' && lon != null && isFinite(a) && isFinite(b) && (a !== 0 || b !== 0);
}

/** Actualiza la última posición conocida del equipo solo si llegó GPS. */
function actualizarPosicion_(equipo, lat, lon, cambios) {
  cambios = cambios || {};
  if (gpsValido_(lat, lon)) { cambios.lat = Number(lat); cambios.lon = Number(lon); cambios.ts_pos = tsStr_(); }
  if (Object.keys(cambios).length) actualizar_('EQUIPOS', equipo._fila, cambios);
}

function errorConCodigo_(code, msg) {
  var e = new Error(msg);
  e.code = code;
  return e;
}

// ---------- apertura ----------

function abrirTarja_(p) {
  var equipo = equipoPorCodigo_(p.equipo);
  var fecha = hoyStr_();
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var mismaOp = tarjaPorOpId_(p.op_id);
    if (mismaOp) return { ya_existia: true, tarja: tarjaPublica_(mismaOp) };

    var ab = abiertaDe_(equipo.codigo);
    if (ab) {
      throw new Error('Ya hay una jornada abierta en ' + equipo.codigo + ' (' + ab.operador +
        '). Hay que cerrarla antes de empezar otra.');
    }

    var operador = String(p.operador || '').trim();
    var legajo = String(p.legajo || '').trim();
    var manual = !!p.operador_manual || !legajo;
    if (operador.length < 3) throw new Error('Falta el nombre del operario.');
    if (!p.firma) throw new Error('Falta la firma del operario.');
    if (!p.foto_horometro) throw new Error('Falta la foto del horómetro.');

    var sinPrevio = sinHorometro_(equipo);
    var sugerido = sinPrevio ? '' : Number(equipo.horom_tarja);
    var origen = String(equipo.origen_horom || '');
    var horomIni = Number(p.horom_ini);
    if (!isFinite(horomIni) || horomIni < 0) throw new Error('El valor del horómetro no es un número válido.');
    // Sin valor previo no hay corrección posible: el primero que se tipea es el que vale.
    var corregido = !sinPrevio && Math.abs(horomIni - sugerido) > 0.001;
    if (corregido && diferenciaSospechosa_(horomIni, sugerido, origen, configNum_('UMBRAL_CORRECCION_HS')) && !p.confirmo_equipo) {
      throw errorConCodigo_('CONFIRMAR_EQUIPO',
        'El horómetro que tipeaste (' + horomIni + ') está a ' + Math.abs(horomIni - sugerido).toFixed(0) +
        ' hs del último registrado (' + sugerido + '). ¿Seguro que estás en ' + equipo.codigo + '?');
    }
    if (corregido && !String(p.motivo_correccion || '').trim()) {
      throw new Error('Para corregir el horómetro hay que indicar el motivo.');
    }

    var yaHizoChecklist = tarjasDelDia_(equipo.codigo, fecha).some(function (t) { return String(t.checklist_hecho) === 'SI'; });
    var items = itemsDe_(equipo.tipo_rodado);
    var respuestas = p.checklist || [];
    var conChecklist = !yaHizoChecklist;
    if (conChecklist && respuestas.length !== items.length) {
      throw new Error('El checklist está incompleto: faltan ítems por responder.');
    }
    // Validar TODO antes de escribir nada: si algo falla acá no queda una
    // jornada a medias con el mismo op_id.
    if (conChecklist) validarChecklist_(items, respuestas);

    var id = uuid_();
    var ts = tsStr_();
    var urlHorom = guardarFoto_(p.foto_horometro, equipo.codigo, fecha, 'horometro-ini');
    var urlFirma = guardarFoto_(p.firma, equipo.codigo, fecha, 'firma');
    var conGps = gpsValido_(p.lat, p.lon);

    var hoja = nombreHojaTarjas_(fecha);
    hojaTarjas_(Number(fecha.slice(0, 4)));
    agregar_(hoja, {
      id: id, equipo: equipo.codigo, fecha: fecha, estado: 'abierta',
      legajo: legajo, operador: operador, operador_manual: manual ? 'SI' : 'NO', obra: equipo.lugar || '',
      horom_ini: horomIni, horom_fin: '', horas: '',
      foto_horom_ini: urlHorom, foto_horom_fin: '',
      horom_ini_sugerido: sugerido,
      correccion_horom: corregido ? 'SI' : 'NO',
      motivo_correccion: corregido ? String(p.motivo_correccion).trim() : '',
      excepcion: corregido ? 'SI' : 'NO',
      checklist_hecho: conChecklist ? 'SI' : 'NO',
      firma: urlFirma,
      lat: conGps ? Number(p.lat) : '', lon: conGps ? Number(p.lon) : '', lat_fin: '', lon_fin: '',
      precision_gps: conGps ? String(p.precision_gps || '') : 'sin GPS',
      cierre_tercero: 'NO', legajo_cierre: '', motivo_cierre_tercero: '',
      ts_apertura: ts, ts_cierre: '', ts_firma: ts,
      anulada_ts: '', anulada_por: '', anulada_motivo: '',
      op_id: String(p.op_id || '')
    });
    agregar_('ABIERTAS', { tarja_id: id, equipo: equipo.codigo, legajo: legajo, operador: operador, ts_apertura: ts, anio: fecha.slice(0, 4) });

    if (conChecklist) guardarChecklist_(id, equipo, fecha, operador, items, respuestas);

    if (manual) registrarOperadorManual_(operador);

    actualizarPosicion_(equipo, p.lat, p.lon, { ultimo_operador: operador, ultima_tarja: fecha });

    if (corregido) {
      log_(operador, 'CORRECCION_HOROMETRO', equipo.codigo + ' ' + fecha + ': ' + sugerido + ' -> ' + horomIni,
        String(p.motivo_correccion).trim());
    }

    return {
      ya_existia: false,
      tarja: tarjaPublica_(buscarPorId_(hoja, id)),
      jornada: tarjasDelDia_(equipo.codigo, fecha).length
    };
  } finally {
    lock.releaseLock();
  }
}

function validarChecklist_(items, respuestas) {
  respuestas.forEach(function (r) {
    var item = items.filter(function (i) { return i.orden === Number(r.orden); })[0];
    if (!item) throw new Error('Llegó una respuesta para un ítem que no existe.');
    var estado = String(r.estado).toUpperCase();
    if (estado !== 'OK' && estado !== 'PROBLEMA') throw new Error('El ítem ' + r.orden + ' quedó sin responder.');
    if (estado === 'PROBLEMA') {
      if (!r.foto) throw new Error('El ítem "' + item.item + '" está marcado como falla y necesita foto.');
      if (!String(r.comentario || '').trim()) throw new Error('El ítem "' + item.item + '" está marcado como falla y necesita un comentario.');
    }
  });
}

function guardarChecklist_(tarjaId, equipo, fecha, operador, items, respuestas) {
  respuestas.forEach(function (r) {
    var item = items.filter(function (i) { return i.orden === Number(r.orden); })[0];
    var estado = String(r.estado).toUpperCase();
    var urlFoto = '';
    if (estado === 'PROBLEMA') {
      urlFoto = guardarFoto_(r.foto, equipo.codigo, fecha, 'item-' + item.orden);
    }
    var respId = uuid_();
    agregar_('CHECKLIST_RESP', {
      id: respId, tarja_id: tarjaId, equipo: equipo.codigo, fecha: fecha,
      orden: item.orden, item: item.item, estado: estado,
      foto: urlFoto, comentario: String(r.comentario || '').trim(), ts: tsStr_()
    });
    if (estado === 'PROBLEMA') {
      agregar_('PENDIENTES', {
        id: uuid_(), tarja_id: tarjaId, equipo: equipo.codigo, fecha_apertura: fecha,
        orden: item.orden, item: item.item,
        comentario: String(r.comentario || '').trim(), foto: urlFoto,
        estado: 'abierto', fecha_cierre: '', motivo_cierre: '', cerrado_por: ''
      });
      try {
        notificarAppIngeco_(CFG.MODULO, {
          destinatarios: [{ con_modulo: CFG.MODULO }],
          tipo: 'aviso_general', prioridad: 'critica',
          titulo: 'Falla en ' + equipo.codigo + ': ' + item.item,
          cuerpo: (String(r.comentario || '').trim() || 'Sin comentario') + ' · ' + operador + ' · ' + fecha,
          url_destino: urlFoto || CFG.URL_PANEL,
          clave_unica: 'pendiente-' + respId
        });
      } catch (eAv) { }
    }
  });
}

function registrarOperadorManual_(nombre) {
  var ya = leer_('OPERADORES_MANUALES').some(function (o) { return normalizarTexto_(o.nombre) === normalizarTexto_(nombre); });
  if (!ya) agregar_('OPERADORES_MANUALES', { nombre: nombre, legajo_vinculado: '', ts: tsStr_() });
}

// ---------- cierre ----------

/**
 * Cierra la jornada con la foto del horómetro final. Si quien cierra no es
 * quien abrió, exige un motivo y la tarja queda marcada como cierre de tercero.
 */
function cerrarTarja_(p) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    // Un cierre encolado sin señal no conoce el tarja_id: referencia la apertura por su op_id.
    var t = p.tarja_id ? tarjaPorId_(p.tarja_id) : tarjaPorOpId_(p.op_id_apertura);
    if (!t && !p.tarja_id) throw new Error('Todavía no llegó la apertura de esta jornada. Se va a reintentar cuando llegue.');
    if (!t) throw new Error('No se encontró la jornada. Puede que haya sido anulada desde el panel.');
    if (String(t.estado) === 'anulada') throw new Error('Esta jornada fue anulada desde el panel.');
    if (String(t.estado) !== 'abierta') return { ya_estaba_cerrada: true, tarja: tarjaPublica_(t) };
    if (!p.foto_horometro) throw new Error('Falta la foto del horómetro final.');

    var maxHoras = configNum_('MAX_HORAS_JORNADA') || CFG.MAX_HORAS_JORNADA;
    var calc = calcularHoras_(t.horom_ini, p.horom_fin, maxHoras);
    var exceso = false;
    if (!calc.ok && calc.exceso && p.confirmo_exceso) {
      // Jornada que quedó abierta varios días: se acepta con motivo y queda como excepción.
      var motivoExceso = String(p.motivo_exceso || '').trim();
      if (!motivoExceso) throw new Error('Para cerrar con más de ' + maxHoras + ' h hay que indicar el motivo.');
      calc = { ok: true, horas: Number(p.horom_fin) - Number(t.horom_ini) };
      exceso = true;
    }
    if (!calc.ok) throw new Error(calc.error);

    var legajoCierre = String(p.legajo || '').trim();
    var operadorCierre = String(p.operador || '').trim();
    var mismo = legajoCierre && String(t.legajo) ? legajoCierre === String(t.legajo)
      : normalizarTexto_(operadorCierre) === normalizarTexto_(t.operador);
    var motivo = String(p.motivo_cierre_tercero || '').trim();
    if (!mismo && !motivo) {
      throw new Error('Esta jornada la abrió ' + t.operador + '. Para cerrarla vos hay que indicar el motivo.');
    }

    var fecha = String(t.fecha);
    var urlHorom = guardarFoto_(p.foto_horometro, t.equipo, fecha, 'horometro-fin');
    var conGps = gpsValido_(p.lat, p.lon);
    var horomFin = Number(p.horom_fin);

    actualizar_(t._hoja, t._fila, {
      estado: 'cerrada', horom_fin: horomFin, horas: calc.horas,
      foto_horom_fin: urlHorom, ts_cierre: tsStr_(),
      lat_fin: conGps ? Number(p.lat) : '', lon_fin: conGps ? Number(p.lon) : '',
      cierre_tercero: mismo ? 'NO' : 'SI',
      legajo_cierre: mismo ? '' : (legajoCierre || operadorCierre),
      motivo_cierre_tercero: mismo ? '' : motivo,
      excepcion: exceso ? 'SI' : t.excepcion
    });
    if (exceso) log_(operadorCierre || legajoCierre || t.operador, 'EXCESO_HORAS', t.equipo + ' ' + fecha + ': ' + calc.horas.toFixed(1) + ' h', String(p.motivo_exceso).trim());

    leer_('ABIERTAS').filter(function (a) { return String(a.tarja_id) === String(t.id); })
      .sort(function (a, b) { return b._fila - a._fila; })
      .forEach(function (a) { hoja_('ABIERTAS').deleteRow(a._fila); });

    var equipo = equipoPorCodigo_(t.equipo);
    actualizarPosicion_(equipo, p.lat, p.lon, { horom_tarja: horomFin, origen_horom: 'TARJA' });

    if (!mismo) log_(operadorCierre || legajoCierre, 'CIERRE_TERCERO', t.equipo + ' ' + fecha + ' abierta por ' + t.operador, motivo);

    return { ya_estaba_cerrada: false, tarja: tarjaPublica_(buscarPorId_(t._hoja, t.id)), horas: calc.horas };
  } finally {
    lock.releaseLock();
  }
}
