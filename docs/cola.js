/**
 * Reglas puras de la cola offline (sin IndexedDB, testeables con Node).
 *
 * Un cierre encolado sin señal no conoce el tarja_id, porque la apertura
 * tampoco se envió: referencia a la apertura por su op_id. Al sincronizar,
 * primero van las aperturas y el cierre toma el tarja_id de la respuesta.
 */

/**
 * Por orden de carga. En el mismo celular un cierre siempre se encoló después
 * de su apertura, y así dos jornadas del mismo día salen abrir1, cerrar1, abrir2.
 */
function ordenarCola_(items) {
  return items.slice().sort((a, b) => a.ts - b.ts);
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
  }
  // Sin respuesta local (la app se recargó entre medio), viaja con
  // op_id_apertura y el servidor busca la apertura por su op_id.
  return { ok: true, datos };
}

if (typeof window !== 'undefined') window.Cola = { ordenarCola_, resolverTarjaId_ };
