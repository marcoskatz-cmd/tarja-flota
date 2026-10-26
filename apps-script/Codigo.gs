/**
 * API JSON. La PWA del operario y el panel viven en GitHub Pages y hablan con
 * esto por HTTP. No se usa HtmlService: con varias cuentas de Google en el
 * celular, HtmlService rutea por /u/N y la PWA instalada se rompe.
 *
 * El POST llega con Content-Type text/plain para evitar el preflight CORS.
 *
 * Tres niveles de acceso:
 *  - público (PWA del operario): nomina, equipos, items, estado, abrir, cerrar.
 *  - con sesión del shell de App INGECO (panel): ver Panel.gs.
 *  - con clave de instalación (GET, a mano): setup, sync_fuentes, borrar_tarja…
 */

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  var p = (e && e.parameter) || {};
  try {
    if (p.action === 'ping') {
      var instalado = !!prop_('SHEET_ID');
      var r = { ok: true, ts: tsStr_(), instalado: instalado, ultimo_sync: prop_('ULTIMO_SYNC') || '' };
      if (instalado) {
        r.equipos = activosTarja_().length;
        r.personas = activos_('PERSONAL').length;
        r.diagnostico = diagnosticar_().length;
      }
      return json_(r);
    }
    if (p.action === 'setup') {
      exigirBootstrap_(p);
      var res = setupCompleto_();
      res.bootstrap_key = prop_('BOOTSTRAP_KEY');
      return json_({ ok: true, data: res });
    }
    exigirBootstrap_(p);
    var aplicar = String(p.aplicar) === 'si';
    switch (p.action) {
      case 'sync_fuentes': return json_({ ok: true, data: syncFuentes_() });
      case 'sembrar_horometros': return json_({ ok: true, data: sembrarHorometros_() });
      case 'instalar_triggers': return json_({ ok: true, data: instalarTriggers_() });
      case 'borrar_tarja': return json_({ ok: true, data: borrarTarja_(p.equipo, p.fecha, aplicar) });
      case 'recalcular_horometros': return json_({ ok: true, data: recalcularHorometros_(aplicar) });
      case 'diagnostico': return json_({ ok: true, data: diagnosticar_() });
      case 'probar_aviso': {
        var resp = notificarAppIngeco_(CFG.MODULO, {
          destinatarios: [{ con_modulo: CFG.MODULO }], tipo: 'aviso_general', prioridad: 'normal',
          titulo: 'Prueba de avisos de la tarja', cuerpo: 'Enviado desde el backend de la tarja a las ' + tsStr_(),
          url_destino: CFG.URL_PANEL, clave_unica: 'prueba-tarja-' + tsStr_()
        });
        return json_({ ok: true, data: { respuesta: resp, tiene_clave: !!prop_('CLAVE_' + CFG.MODULO) } });
      }
      case 'set_config': {
        // Solo claves que existen en la semilla de CONFIG: nada de inventar claves por URL.
        var conocidas = SEED.CONFIG.map(function (r) { return r[0]; });
        if (conocidas.indexOf(String(p.clave)) < 0) throw new Error('Clave de CONFIG desconocida: ' + p.clave);
        var fila = leer_('CONFIG').filter(function (c) { return String(c.clave) === String(p.clave); })[0];
        if (fila) actualizar_('CONFIG', fila._fila, { valor: String(p.valor == null ? '' : p.valor) });
        else agregar_('CONFIG', { clave: String(p.clave), valor: String(p.valor == null ? '' : p.valor) });
        log_('mantenimiento', 'SET_CONFIG', String(p.clave), '');
        return json_({ ok: true, data: { clave: String(p.clave) } });
      }
      case 'set_clave_avisos':
        // Clave de App INGECO para mandar avisos (CLAVE_TARJAS). Nunca se devuelve.
        if (!p.v) throw new Error('Falta la clave (v).');
        setProp_('CLAVE_' + CFG.MODULO, String(p.v));
        return json_({ ok: true, data: { guardada: true } });
    }
    return json_({ ok: false, error: 'Acción desconocida.' });
  } catch (err) {
    return json_({ ok: false, error: String(err.message || err) });
  }
}

/**
 * La primera llamada de instalación genera y devuelve la clave; a partir de ahí
 * hay que presentarla. La ventana se cierra cuando la planilla existe.
 */
function exigirBootstrap_(p) {
  var k = prop_('BOOTSTRAP_KEY');
  if (!prop_('SHEET_ID')) {
    if (!k) setProp_('BOOTSTRAP_KEY', uuid_());
    return;
  }
  if (!k || String(p.key || '') !== k) throw new Error('Clave de instalación inválida.');
}

// ---------- rutas públicas (PWA del operario) ----------

function activosTarja_() {
  // Los implementos (batea, carretón, martillo) se cargan desde el equipo que los usó.
  return leer_('EQUIPOS').filter(function (e) {
    return String(e.activo_tarja).toUpperCase() === 'SI' && !esImplemento_(e.codigo);
  });
}

function rutaNomina_() {
  return {
    personas: activos_('PERSONAL').map(function (p) {
      return { legajo: String(p.legajo || ''), nombre: String(p.nombre) };
    }),
    ts: tsStr_()
  };
}

/** Equipos que tarjan, con las pistas para que el operario elija bien. */
function rutaEquipos_() {
  var abiertas = {};
  leer_('ABIERTAS').forEach(function (a) { abiertas[String(a.equipo).toUpperCase()] = String(a.operador || ''); });
  return {
    hoy: hoyStr_(),
    equipos: activosTarja_().map(function (e) {
      return {
        codigo: String(e.codigo), descripcion: String(e.descripcion || ''),
        marca: String(e.marca || ''), modelo: String(e.modelo || ''), patente: String(e.patente || ''),
        lugar: String(e.lugar || ''), tipo_rodado: String(e.tipo_rodado || ''),
        horom_tarja: e.horom_tarja === '' ? '' : Number(e.horom_tarja),
        origen_horom: String(e.origen_horom || ''),
        ultimo_operador: String(e.ultimo_operador || ''), ultima_tarja: String(e.ultima_tarja || ''),
        abierta_por: abiertas[String(e.codigo).toUpperCase()] || ''
      };
    }),
    ts: tsStr_()
  };
}

function rutaItems_() {
  return {
    items: activos_('CHECKLIST_ITEMS')
      .sort(function (a, b) { return Number(a.orden) - Number(b.orden); })
      .map(function (i) { return { orden: Number(i.orden), tipo: String(i.tipo || ''), item: String(i.item) }; }),
    ts: tsStr_()
  };
}

/**
 * Para el panel de INGECOV (estático, sin sesión de la tarja): última posición
 * de cada equipo y el historial de tarjas de uno. Solo lectura, sin firmas.
 */
function rutaPublicoMapa_() { return panelMapa_(); }

function rutaPublicoTarjas_(p) {
  var e = equipoPorCodigo_(p.codigo);
  var max = Math.min(Number(p.max) || 30, 100);
  var tarjas = tarjasDe_(e.codigo).filter(function (t) { return String(t.estado) !== 'anulada'; }).slice(0, max)
    .map(function (t) {
      return {
        fecha: String(t.fecha), operador: t.operador, obra: t.obra, estado: t.estado,
        horom_ini: t.horom_ini, horom_fin: t.horom_fin, horas: t.horas,
        ts_apertura: t.ts_apertura, ts_cierre: t.ts_cierre, cierre_tercero: t.cierre_tercero, excepcion: t.excepcion,
        foto_horom_ini: t.foto_horom_ini, foto_horom_fin: t.foto_horom_fin
      };
    });
  var fallas = leer_('PENDIENTES').filter(function (x) {
    return String(x.equipo).toUpperCase() === String(e.codigo).toUpperCase() && String(x.estado) === 'abierto';
  }).map(function (x) { return { fecha: String(x.fecha_apertura), item: x.item, comentario: x.comentario, foto: x.foto }; });
  return {
    codigo: e.codigo, horom_tarja: e.horom_tarja === '' ? null : Number(e.horom_tarja),
    ultima_tarja: String(e.ultima_tarja || ''), ultimo_operador: String(e.ultimo_operador || ''),
    lat: e.lat === '' ? null : Number(e.lat), lon: e.lon === '' ? null : Number(e.lon), ts_pos: String(e.ts_pos || ''),
    tarjas: tarjas, fallas: fallas
  };
}

var RUTAS_PUBLICAS = {
  publico_mapa: rutaPublicoMapa_,
  publico_tarjas: rutaPublicoTarjas_,
  nomina: rutaNomina_,
  equipos: rutaEquipos_,
  items: rutaItems_,
  estado: estadoDelDia_,
  abrir: abrirTarja_,
  cerrar: cerrarTarja_,
  listas_pd: rutaListasPD_
};

function doPost(e) {
  var p;
  try {
    p = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return json_({ ok: false, error: 'No se pudo leer el pedido.' });
  }
  var fn = RUTAS_PUBLICAS[p.action] || (typeof RUTAS_PANEL !== 'undefined' && RUTAS_PANEL[p.action]);
  if (!fn) return json_({ ok: false, error: 'Acción desconocida: ' + p.action });
  try {
    return json_({ ok: true, data: fn(p) });
  } catch (err) {
    // Mensaje en castellano llano: el operario tiene que entender qué hacer.
    var out = { ok: false, error: String(err.message || err) };
    if (err && err.code) out.code = err.code;
    return json_(out);
  }
}
