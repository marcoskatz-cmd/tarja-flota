/**
 * Datos de referencia (nómina, equipos, ítems del checklist) con caché en el
 * celular. La app tiene que funcionar sin señal: con señal se refresca y se
 * guarda; sin señal se usa lo guardado. Solo la primera vez hace falta señal.
 */
(function () {
  const CLAVES = { personas: 'tf_personas', equipos: 'tf_equipos', items: 'tf_items' };
  let memoria = { personas: [], equipos: [], items: [], hoy: '', ts: 0, desdeCache: false };

  function leer(k) {
    try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; }
  }
  function guardar(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sin espacio: seguimos en memoria */ }
  }

  async function traer(action, campo) {
    const r = await API.llamar(action);
    return r[campo];
  }

  /**
   * Si ya hay datos guardados, los devuelve al instante y refresca en segundo
   * plano (cada llamada a Apps Script tarda ~3 s). La primera vez espera.
   */
  async function cargar() {
    const p = leer(CLAVES.personas), e = leer(CLAVES.equipos), i = leer(CLAVES.items);
    if (Array.isArray(p) && p.length && Array.isArray(e) && e.length && Array.isArray(i)) {
      memoria.personas = p; memoria.equipos = e; memoria.items = i;
      if (!memoria.hoy) memoria.hoy = new Date().toISOString().slice(0, 10);
      memoria.desdeCache = true;
      memoria.ts = Date.now();
      refrescar().catch(() => { /* sin señal: seguimos con lo guardado */ });
      return memoria;
    }
    return refrescar();
  }

  /** Refresca lo que pueda y completa con caché. Lanza solo si no hay nada de nada. */
  async function refrescar() {
    const pedidos = [
      traer('nomina', 'personas').then((v) => ({ k: 'personas', v })),
      API.llamar('equipos').then((r) => ({ k: 'equipos', v: r.equipos, hoy: r.hoy })),
      traer('items', 'items').then((v) => ({ k: 'items', v }))
    ];
    const res = await Promise.allSettled(pedidos);
    let desdeCache = false;
    res.forEach((r, i) => {
      const k = ['personas', 'equipos', 'items'][i];
      if (r.status === 'fulfilled' && Array.isArray(r.value.v)) {
        memoria[k] = r.value.v;
        if (r.value.hoy) memoria.hoy = r.value.hoy;
        guardar(CLAVES[k], r.value.v);
      } else {
        const c = leer(CLAVES[k]);
        if (c) { memoria[k] = c; desdeCache = true; }
      }
    });
    memoria.desdeCache = desdeCache;
    memoria.ts = Date.now();
    if (!memoria.equipos.length || !memoria.personas.length) {
      throw new Error('Para la primera vez hace falta señal. Conectate a internet, abrí la app y después ya funciona sin señal.');
    }
    if (!memoria.hoy) memoria.hoy = new Date().toISOString().slice(0, 10);
    return memoria;
  }

  function equipo(codigo) {
    const c = String(codigo || '').toUpperCase();
    return memoria.equipos.find((e) => String(e.codigo).toUpperCase() === c) || null;
  }

  function itemsPara(tipoRodado) {
    const t = String(tipoRodado || '').toLowerCase();
    return memoria.items.filter((i) => !i.tipo || String(i.tipo).toLowerCase() === t)
      .sort((a, b) => Number(a.orden) - Number(b.orden));
  }

  /** Actualiza en caché lo que la app aprendió sola (último operario, horómetro, abierta). */
  function actualizarEquipo(codigo, cambios) {
    const e = equipo(codigo);
    if (!e) return;
    Object.assign(e, cambios);
    guardar(CLAVES.equipos, memoria.equipos);
  }

  window.Datos = { cargar, equipo, itemsPara, actualizarEquipo, get: () => memoria };
})();
