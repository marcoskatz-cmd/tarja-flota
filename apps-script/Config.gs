/**
 * Tarja de equipos — INGECO (flota pesada)
 * Configuración central: nombres de hojas, encabezados esperados y constantes.
 *
 * La política editable (umbrales, ítems del checklist, qué equipos tarjan)
 * vive en la planilla (hojas CONFIG, CHECKLIST_ITEMS, EQUIPOS), no acá. Este
 * archivo define la ESTRUCTURA que la app espera, para auto-diagnosticar desvíos.
 */

var PROP = PropertiesService.getScriptProperties();

var CFG = {
  MAX_HORAS_JORNADA: 14,
  TZ: 'America/Argentina/Buenos_Aires',
  MODULO: 'TARJAS',
  URL_PWA: 'https://marcoskatz-cmd.github.io/tarja-flota/',
  URL_PANEL: 'https://marcoskatz-cmd.github.io/tarja-flota/panel.html'
};

/** Columnas de las hojas fijas. El orden ES el contrato. */
var HOJAS = {
  ABIERTAS: ['tarja_id', 'equipo', 'legajo', 'operador', 'ts_apertura', 'anio'],
  EQUIPOS: [
    'codigo', 'descripcion', 'marca', 'modelo', 'patente', 'clasificacion', 'tipo_rodado',
    'lugar', 'activo_tarja', 'horom_tarja', 'origen_horom',
    'ultimo_operador', 'ultima_tarja', 'lat', 'lon', 'ts_pos', 'ts_sync'
  ],
  PERSONAL: ['legajo', 'nombre', 'activo', 'ts_sync'],
  CONFIG: ['clave', 'valor'],
  CHECKLIST_ITEMS: ['orden', 'tipo', 'item', 'activo'],
  CHECKLIST_RESP: [
    'id', 'tarja_id', 'equipo', 'fecha', 'orden', 'item', 'estado',
    'foto', 'comentario', 'ts'
  ],
  PENDIENTES: [
    'id', 'tarja_id', 'equipo', 'fecha_apertura', 'orden', 'item',
    'comentario', 'foto', 'estado', 'fecha_cierre', 'motivo_cierre', 'cerrado_por'
  ],
  OPERADORES_MANUALES: ['nombre', 'legajo_vinculado', 'ts'],
  LOG: ['ts', 'usuario', 'accion', 'detalle', 'motivo']
};

/**
 * Plantilla de las hojas TARJAS_<año>. No está en HOJAS porque el nombre real
 * lleva el año; hojaTarjas_() la crea a demanda con este encabezado.
 */
var COLS_TARJAS = [
  'id', 'equipo', 'fecha', 'estado', 'legajo', 'operador', 'operador_manual', 'obra',
  'horom_ini', 'horom_fin', 'horas',
  'foto_horom_ini', 'foto_horom_fin',
  'horom_ini_sugerido', 'correccion_horom', 'motivo_correccion', 'excepcion',
  'checklist_hecho',
  'firma', 'lat', 'lon', 'lat_fin', 'lon_fin', 'precision_gps',
  'cierre_tercero', 'legajo_cierre', 'motivo_cierre_tercero',
  'ts_apertura', 'ts_cierre', 'ts_firma',
  'anulada_ts', 'anulada_por', 'anulada_motivo',
  'op_id',
  'combustible', 'aceite_motor', 'aceite_hidr', 'aceite_trans', 'grasa',
  'implementos'
];
HOJAS.TARJAS = COLS_TARJAS;

/** Datos semilla. Todo editable después desde la planilla o el panel. */
var SEED = {
  CHECKLIST_ITEMS: [
    [1, '', 'Pérdidas visibles bajo la máquina', 'SI'],
    [2, '', 'Mangueras y conexiones hidráulicas', 'SI'],
    [3, '', 'Dientes, portadientes y cuchilla', 'SI'],
    [4, '', 'Engrase de pluma, brazo y balde', 'SI'],
    [5, 'oruga', 'Tren de rodaje: cadenas, rodillos y zapatas', 'SI'],
    [5, 'rodante', 'Neumáticos y estado de cubiertas', 'SI'],
    [6, '', 'Seguridad de cabina: cinturón, matafuego, alarma de retroceso y luces', 'SI']
  ],
  CONFIG: [
    ['MAX_HORAS_JORNADA', 14],
    ['UMBRAL_CORRECCION_HS', 50],
    ['UMBRAL_DIF_INGECOV_HS', 100],
    ['HORAS_ABIERTA_AVISO', 16],
    ['DIAS_SIN_ACTIVIDAD', 7],
    ['SHEET_ROPA_ID', ''],
    ['SHEET_CASARES_ID', '19eyY8MImPM_-Gyzj8QcqA_yR5KDrkuu-1faJUU48N1A'],
    ['DIAS_NOMINA', 120],
    ['SHEET_LISTA_EQUIPOS_ID', '1EwbNlmBMx3OIviplvHSJM3N4CZ3vVXgVxH208VugG3M'],
    ['INGECOV_SNAPSHOT_URL', ''],
    ['SNAPSHOT_SHEET_ID', '']
  ]
};

var MOTIVO_CIERRE_PENDIENTE = ['Reparado', 'Repuesto pedido', 'Sin acción'];
var MOTIVO_CIERRE_TERCERO = ['Se olvidó de cerrar', 'Cambio de turno', 'Otro'];

// ---------- helpers de propiedades ----------

function prop_(k) { return PROP.getProperty(k); }
function setProp_(k, v) { PROP.setProperty(k, String(v)); }
function borrarProp_(k) { PROP.deleteProperty(k); }

function ss_() {
  var id = prop_('SHEET_ID');
  if (!id) throw new Error('La planilla todavía no fue creada. Ejecutá el setup.');
  return SpreadsheetApp.openById(id);
}

function carpeta_() {
  var id = prop_('DRIVE_FOLDER_ID');
  if (!id) throw new Error('La carpeta de Drive todavía no fue creada. Ejecutá el setup.');
  return DriveApp.getFolderById(id);
}

/** Fecha/hora SIEMPRE del servidor, nunca del dispositivo. */
function ahora_() { return new Date(); }
function hoyStr_() { return Utilities.formatDate(ahora_(), CFG.TZ, 'yyyy-MM-dd'); }
function tsStr_() { return Utilities.formatDate(ahora_(), CFG.TZ, 'yyyy-MM-dd HH:mm:ss'); }
function uuid_() { return Utilities.getUuid(); }

// ---------- CONFIG (hoja) ----------

var CONFIG_CACHE_ = null;

/** Valor de la hoja CONFIG como texto; '' si no está. Cache por ejecución. */
function config_(clave) {
  if (!CONFIG_CACHE_) {
    CONFIG_CACHE_ = {};
    leer_('CONFIG').forEach(function (r) { CONFIG_CACHE_[String(r.clave)] = String(r.valor == null ? '' : r.valor); });
  }
  return CONFIG_CACHE_[clave] === undefined ? '' : CONFIG_CACHE_[clave];
}

function configNum_(clave) {
  var n = Number(config_(clave));
  return isFinite(n) ? n : 0;
}
