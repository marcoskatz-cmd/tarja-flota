/**
 * Triggers horarios: sincronizar fuentes y avisar jornadas abiertas demasiado
 * tiempo. Instalación idempotente: borra los propios antes de crearlos.
 */

var TRIGGERS_PROPIOS_ = ['syncFuentes', 'avisarAbiertasLargas'];

function instalarTriggers_() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (TRIGGERS_PROPIOS_.indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t);
  });
  TRIGGERS_PROPIOS_.forEach(function (fn) {
    ScriptApp.newTrigger(fn).timeBased().everyHours(1).create();
  });
  return { instalados: TRIGGERS_PROPIOS_.slice() };
}

/** Para correr a mano desde el editor si hace falta. */
function instalarTriggers() { return instalarTriggers_(); }

/**
 * Jornadas abiertas hace más de HORAS_ABIERTA_AVISO horas: un aviso por tarja
 * (clave_unica) a quienes tienen el módulo. Nada se cierra solo.
 */
function avisarAbiertasLargas() {
  var limite = configNum_('HORAS_ABIERTA_AVISO') || 16;
  var ahora = tsStr_();
  var avisadas = 0;
  leer_('ABIERTAS').forEach(function (a) {
    var horas = horasEntre_(a.ts_apertura, ahora);
    if (horas <= limite) return;
    notificarAppIngeco_(CFG.MODULO, {
      destinatarios: [{ con_modulo: CFG.MODULO }],
      tipo: 'aviso_general', prioridad: 'normal',
      titulo: a.equipo + ' lleva ' + Math.round(horas) + ' h con la jornada abierta',
      cuerpo: 'La abrió ' + a.operador + ' el ' + String(a.ts_apertura).slice(0, 16) + ' y nadie la cerró.',
      url_destino: CFG.URL_PANEL,
      clave_unica: 'abierta-larga-' + a.tarja_id,
      dias_unica: 7
    });
    avisadas++;
  });
  return { avisadas: avisadas };
}
