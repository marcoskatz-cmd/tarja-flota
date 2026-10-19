/**
 * Reglas puras de la cola offline (sin IndexedDB, testeables con Node).
 *
 * Un cierre encolado sin señal no conoce el tarja_id, porque la apertura
 * tampoco se envió: referencia a la apertura por su op_id. Al sincronizar,
 * primero van las aperturas y el cierre toma el tarja_id de la respuesta.
 */

/** Aperturas por ts, después el resto por ts. */
function ordenarCola_(items) {
  const peso = (i) => (i.action === 'abrir' ? 0 : 1);
  return items.slice().sort((a, b) => (peso(a) - peso(b)) || (a.ts - b.ts));
}

/**
 * @param item {action, datos}
 * @param respuestas {op_id_apertura: tarja_id} ya obtenidas en esta sincronización
 * @return {ok:true, datos} | {ok:false, motivo}
 */
function resolverTarjaId_(item, respuestas) {
  const datos = Object.assign({}, item.datos);
  if (item.action !== 'cerrar' || datos.tarja_id) return { ok: true, datos };
  const ref = datos.op_id_apertura;
  if (ref && respuestas[ref]) {
    datos.tarja_id = respuestas[ref];
    delete datos.op_id_apertura;
    return { ok: true, datos };
  }
  return { ok: false, motivo: 'Falta enviar la apertura de esta jornada primero.' };
}

if (typeof window !== 'undefined') window.Cola = { ordenarCola_, resolverTarjaId_ };
