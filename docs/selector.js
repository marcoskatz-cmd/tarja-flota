/**
 * ¿Qué equipo manejás hoy? Hay muchos equipos iguales que solo se distinguen
 * por el número: cada tarjeta muestra código grande, descripción, patente,
 * quién lo tarjó por última vez y el horómetro, y al elegir se confirma.
 */
(function () {
  const CLAVE_EQ = 'tf_equipo';
  const CLAVE_LUGAR = 'tf_lugar';

  function actual() { return localStorage.getItem(CLAVE_EQ) || null; }
  function guardar(codigo, lugar) {
    localStorage.setItem(CLAVE_EQ, codigo);
    if (lugar) localStorage.setItem(CLAVE_LUGAR, lugar);
  }
  function borrar() { localStorage.removeItem(CLAVE_EQ); }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function fmtHoras(h) {
    if (h === '' || h == null || !isFinite(Number(h))) return '';
    return Number(h).toLocaleString('es-AR', { maximumFractionDigits: 1 }) + ' hs';
  }

  function tarjeta(e, hoy) {
    const ultima = textoUltimaTarja_(e.ultima_tarja, hoy, e.ultimo_operador);
    const horas = fmtHoras(e.horom_tarja);
    return `
      <button class="equipo-card" data-codigo="${esc(e.codigo)}">
        <div class="codigo">${esc(e.codigo)}</div>
        <div class="desc">${esc(e.descripcion || '')}${e.patente ? ` <span class="tenue">· ${esc(e.patente)}</span>` : ''}</div>
        ${e.lugar ? `<div class="tenue">${esc(e.lugar)}</div>` : ''}
        <div class="pistas">
          ${e.abierta_por ? `<span class="chip alerta">Abierta por ${esc(e.abierta_por)}</span>` : ''}
          ${ultima ? `<span class="chip">${esc(ultima)}</span>` : '<span class="chip">Sin tarjas todavía</span>'}
          ${horas ? `<span class="chip">${esc(horas)}</span>` : ''}
        </div>
      </button>`;
  }

  /** Dibuja el selector en `cont`; alElegir(equipo) tras la confirmación. */
  function pantalla(cont, alElegir) {
    const d = Datos.get();
    const grupos = agruparEquipos_(d.equipos, localStorage.getItem(CLAVE_LUGAR) || '');
    cont.innerHTML = `
      <h2>¿Qué equipo manejás hoy?</h2>
      <p class="ayuda">Fijate el <strong>código pintado en la máquina</strong>. Si hay dos iguales, mirá quién lo usó por última vez y el horómetro.</p>
      <input type="search" id="selBuscar" placeholder="Buscar por código, modelo u obra" autocomplete="off">
      <div id="selGrupos"></div>`;
    const cajas = cont.querySelector('#selGrupos');
    const buscar = cont.querySelector('#selBuscar');

    // Sin listado de entrada: aparecen sugerencias recién al escribir y se
    // achican con cada letra (como un desplegable).
    const MAX = 8;
    function pintar() {
      const q = normalizarTexto_(buscar.value);
      if (!q) {
        cajas.innerHTML = '<div class="tenue" style="padding:.6rem 0">Escribí el código (ej. EXC-08) o el modelo.</div>';
        return;
      }
      const eqs = [];
      grupos.forEach((g) => g.equipos.forEach((e) => {
        if (normalizarTexto_([e.codigo, e.descripcion, e.patente, e.lugar].join(' ')).indexOf(q) >= 0) eqs.push(e);
      }));
      cajas.innerHTML = eqs.length
        ? eqs.slice(0, MAX).map((e) => tarjeta(e, d.hoy)).join('') +
          (eqs.length > MAX ? `<div class="tenue" style="padding:.4rem 0">y ${eqs.length - MAX} más… seguí escribiendo.</div>` : '')
        : '<div class="tenue" style="padding:.6rem 0">Ningún equipo coincide.</div>';
      cajas.querySelectorAll('.equipo-card').forEach((b) => {
        b.onclick = () => confirmar(cont, Datos.equipo(b.dataset.codigo), alElegir, () => pantalla(cont, alElegir));
      });
    }
    buscar.oninput = pintar;
    pintar();
    buscar.focus();
  }

  function confirmar(cont, e, alElegir, volver) {
    cont.innerHTML = `
      <h2>Confirmá el equipo</h2>
      <div class="tarjeta confirmar">
        <div class="codigo">${esc(e.codigo)}</div>
        <div class="desc">${esc(e.descripcion || '')}</div>
        ${e.patente ? `<div class="tenue">${esc(e.patente)}</div>` : ''}
        ${e.lugar ? `<div class="tenue">Obra: ${esc(e.lugar)}</div>` : ''}
        ${e.horom_tarja !== '' && e.horom_tarja != null ? `<div class="tenue">Último horómetro: <strong>${esc(fmtHoras(e.horom_tarja))}</strong></div>` : ''}
        ${e.ultimo_operador ? `<div class="tenue">Último operario: ${esc(e.ultimo_operador)}</div>` : ''}
      </div>
      <p class="ayuda">¿Es este el equipo en el que estás?</p>
      <button class="principal" id="selSi">Sí, es este</button>
      <div style="height:.5rem"></div>
      <button class="secundaria" id="selNo">No, elegir otro</button>`;
    cont.querySelector('#selSi').onclick = () => { guardar(e.codigo, e.lugar); alElegir(e); };
    cont.querySelector('#selNo').onclick = volver;
  }

  window.Selector = { actual, guardar, borrar, pantalla };
})();
