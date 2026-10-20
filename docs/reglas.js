/**
 * Reglas puras: sin SpreadsheetApp, sin Drive, sin red.
 *
 * Este archivo se carga tal cual en el backend (Apps Script) y también en la
 * PWA (copiado a docs/reglas.js por `npm run reglas`), y se testea con Node.
 * Si una regla necesita un servicio de Google, no va acá.
 */

/** Mayúsculas, sin acentos ni símbolos: para comparar textos de planillas. */
function normalizarTexto_(s) {
  return String(s == null ? '' : s)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Pesado = maquinaria con horómetro. Afuera quedan soporte (compresores,
 * generadores, soldadoras), camionetas (CMT) y camiones (CMN), y cualquier
 * clasificación de transporte. Misma regla que el builder de INGECOV.
 */
function esPesado_(clasificacion, codigo) {
  var c = normalizarTexto_(clasificacion).replace(/ /g, '');
  if (/(COMPRESOR|GENERADOR|SOLDAD|GRUPOELECTRO)/.test(c)) return false;
  if (/(CAMION|CAMIONETA|AUTO|UTILITARIO|TRAILER|ACOPLADO)/.test(c)) return false;
  var pref = String(codigo || '').toUpperCase().split('-')[0].replace(/[^A-Z]/g, '');
  if (pref === 'CMT' || pref === 'CMN') return false;
  return true;
}

/** 'oruga' | 'rodante' | '' cuando no se puede inferir (se corrige a mano en el panel). */
function inferirTipoRodado_(clasificacion, modelo) {
  var c = normalizarTexto_(clasificacion + ' ' + (modelo || ''));
  if (/(EXCAVADORA|TOPADORA|RETROEXCAVADORA SOBRE ORUGA|PAVIMENTADORA)/.test(c)) return 'oruga';
  if (/(CARGADORA|MOTONIVELADORA|RODILLO|COMPACTADOR|RETRO|MINICARGADORA|FRESADORA)/.test(c)) return 'rodante';
  return '';
}

/** Horas de la jornada. Los textos son los que ve el operario. */
function calcularHoras_(ini, fin, max) {
  var horomIni = Number(ini), horomFin = Number(fin);
  if (!isFinite(horomFin)) return { ok: false, error: 'El horómetro final no es un número válido.' };
  var horas = horomFin - horomIni;
  if (horas < 0) {
    return { ok: false, error: 'El horómetro final (' + horomFin + ') es menor que el de apertura (' +
      horomIni + '). Revisá el valor.' };
  }
  if (horas > max) {
    return { ok: false, exceso: true, error: 'La diferencia da ' + horas.toFixed(1) + ' h, más de las ' +
      max + ' h permitidas en una jornada. Revisá el valor.' };
  }
  return { ok: true, horas: horas };
}

var SIN_OBRA_ = 'Sin obra asignada';

/** Grupos por obra: la preferida primero, el resto alfabético, "Sin obra asignada" último. */
function agruparEquipos_(equipos, lugarPreferido) {
  var porLugar = {};
  (equipos || []).forEach(function (e) {
    var l = String(e.lugar || '').trim() || SIN_OBRA_;
    (porLugar[l] = porLugar[l] || []).push(e);
  });
  var lugares = Object.keys(porLugar).sort(function (a, b) {
    if (a === lugarPreferido) return -1;
    if (b === lugarPreferido) return 1;
    if (a === SIN_OBRA_) return 1;
    if (b === SIN_OBRA_) return -1;
    return a.localeCompare(b, 'es');
  });
  return lugares.map(function (l) {
    return {
      lugar: l,
      equipos: porLugar[l].slice().sort(function (a, b) {
        return String(a.codigo).localeCompare(String(b.codigo), 'es', { numeric: true });
      })
    };
  });
}

/** Búsqueda tolerante por cualquier palabra del nombre. Máximo 20, alfabético. */
function buscarNomina_(personas, texto) {
  var q = normalizarTexto_(texto).split(' ').filter(Boolean);
  var out = (personas || []).filter(function (p) {
    var n = normalizarTexto_(p.nombre);
    return q.every(function (palabra) { return n.indexOf(palabra) >= 0; });
  }).sort(function (a, b) { return String(a.nombre).localeCompare(String(b.nombre), 'es'); });
  return out.slice(0, 20);
}

/**
 * Si el horómetro tipeado está lejos del sugerido, probablemente el operario
 * eligió otro equipo. No aplica cuando el sugerido vino de INGECOV (siembra
 * inicial): ese valor puede estar desactualizado y no es culpa del operario.
 */
function diferenciaSospechosa_(tipeado, sugerido, origen, umbral) {
  if (String(origen) === 'INGECOV') return false;
  if (sugerido === null || sugerido === '' || sugerido === undefined) return false;
  var t = Number(tipeado), s = Number(sugerido);
  if (!isFinite(t) || !isFinite(s)) return false;
  return Math.abs(t - s) > Number(umbral);
}

/** 'Hoy · Pérez J.' / 'Ayer · …' / 'Hace N días · …' / ''. Fechas yyyy-MM-dd. */
function textoUltimaTarja_(ultima, hoy, operador) {
  if (!ultima) return '';
  var a = Date.UTC(+ultima.slice(0, 4), +ultima.slice(5, 7) - 1, +ultima.slice(8, 10));
  var b = Date.UTC(+hoy.slice(0, 4), +hoy.slice(5, 7) - 1, +hoy.slice(8, 10));
  var dias = Math.round((b - a) / 86400000);
  var cuando = dias <= 0 ? 'Hoy' : dias === 1 ? 'Ayer' : 'Hace ' + dias + ' días';
  return cuando + (operador ? ' · ' + operador : '');
}
