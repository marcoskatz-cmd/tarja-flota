/**
 * Sesión del panel = sesión del shell de App INGECO.
 *
 * El panel manda `sesion` (window.INGECO_SESION, que guard.js obtiene al
 * canjear el ticket). Acá se verifica contra el backend común con
 * validar_sesion_modulo y se cachea 10 minutos en Script Properties con
 * vencimiento. NO en CacheService: Google lo vacía cuando quiere y la sesión
 * se caía sola en Corrientes.
 */

var SESION_CACHE_MIN_ = 10;

function hashSesion_(s) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(s), Utilities.Charset.UTF_8);
  return bytes.slice(0, 12).map(function (b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('');
}

/** Usuario del shell o error con texto llano. */
function sesionShell_(p) {
  var s = String((p && p.sesion) || '').trim();
  var falla = 'La sesión venció. Volvé a abrir desde la app INGECO.';
  if (!s) throw new Error('Este panel se abre desde la app INGECO.');
  var k = 'SES_' + hashSesion_(s);
  var cached = prop_(k);
  if (cached) {
    try {
      var c = JSON.parse(cached);
      if (c.exp > Date.now()) return c.u;
    } catch (e) { }
  }
  var j;
  try {
    var r = UrlFetchApp.fetch(APP_INGECO_BACKEND_, {
      method: 'post', contentType: 'text/plain;charset=utf-8',
      payload: JSON.stringify({ accion: 'validar_sesion_modulo', payload: { sesion: s, modulo: CFG.MODULO } }),
      muteHttpExceptions: true
    });
    j = JSON.parse(r.getContentText());
  } catch (e) {
    throw new Error('No se pudo validar la sesión con la app INGECO. Probá de nuevo en un momento.');
  }
  if (!j || !j.ok) throw new Error(falla);
  var u = { legajo: j.legajo, nombre: j.nombre_visible || ('Legajo ' + j.legajo), es_admin: !!j.es_admin, modulos: j.modulos || [] };
  setProp_(k, JSON.stringify({ exp: Date.now() + SESION_CACHE_MIN_ * 60000, u: u }));
  purgarSesionesVencidas_();
  return u;
}

/** Borra sesiones vencidas para que las propiedades no crezcan sin fin. */
function purgarSesionesVencidas_() {
  var props = PROP.getProperties();
  Object.keys(props).forEach(function (k) {
    if (k.indexOf('SES_') !== 0) return;
    try { if (JSON.parse(props[k]).exp <= Date.now()) borrarProp_(k); } catch (e) { borrarProp_(k); }
  });
}
