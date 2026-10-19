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
  return leer_('EQUIPOS').filter(function (e) { return String(e.activo_tarja).toUpperCase() === 'SI'; });
}

function rutaNomina_() {
  return {
    personas: activos_('PERSONAL').map(function (p) { return { legajo: String(p.legajo), nombre: String(p.nombre) }; }),
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

var RUTAS_PUBLICAS = {
  nomina: rutaNomina_,
  equipos: rutaEquipos_,
  items: rutaItems_,
  estado: estadoDelDia_,
  abrir: abrirTarja_,
  cerrar: cerrarTarja_
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
