/**
 * ¿Quién sos? Elegir el nombre de la nómina (buscador por apellido). Si no
 * está, se puede escribir: la tarja queda marcada y el panel la vincula después.
 */
(function () {
  const CLAVE = 'tf_identidad';

  function actual() {
    try { return JSON.parse(localStorage.getItem(CLAVE) || 'null'); } catch (e) { return null; }
  }
  function guardar(id) { localStorage.setItem(CLAVE, JSON.stringify(id)); }
  function borrar() { localStorage.removeItem(CLAVE); }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /** Dibuja la pantalla dentro de `cont` y llama a alElegir({legajo, nombre, manual}). */
  function pantalla(cont, alElegir) {
    const personas = Datos.get().personas;
    cont.innerHTML = `
      <h2>¿Quién sos?</h2>
      <p class="ayuda">Buscá tu apellido y tocá tu nombre. El celular lo recuerda.</p>
      <div class="tarjeta">
        <input type="search" id="idBuscar" placeholder="Escribí tu apellido" autocomplete="off" autofocus>
        <div class="lista" id="idLista"></div>
      </div>
      <button class="secundaria" id="idManual">No estoy en la lista</button>
      <div id="idManualBloque" hidden class="tarjeta" style="margin-top:.9rem">
        <label>Nombre y apellido</label>
        <input type="text" id="idNombre" placeholder="Ej.: Carlos Gómez" autocomplete="off">
        <p class="tenue" style="margin:.5rem 0 0">Escribilo completo. La oficina lo va a vincular con tu legajo.</p>
        <div style="height:.6rem"></div>
        <button class="principal" id="idSeguir" disabled>Continuar</button>
      </div>`;

    const buscar = cont.querySelector('#idBuscar');
    const lista = cont.querySelector('#idLista');
    const bloque = cont.querySelector('#idManualBloque');
    const nombre = cont.querySelector('#idNombre');
    const seguir = cont.querySelector('#idSeguir');

    function pintarLista() {
      const q = buscar.value.trim();
      const r = q ? buscarNomina_(personas, q) : [];
      lista.innerHTML = r.length
        ? r.map((p) => `<button class="opcion" data-legajo="${esc(p.legajo)}" data-nombre="${esc(p.nombre)}">${esc(p.nombre)}</button>`).join('')
        : (q ? '<div class="tenue" style="padding:.6rem 0">No aparece nadie con ese apellido. Probá con menos letras o tocá "No estoy en la lista".</div>' : '');
      lista.querySelectorAll('.opcion').forEach((b) => {
        b.onclick = () => {
          const id = { legajo: b.dataset.legajo, nombre: b.dataset.nombre, manual: false };
          guardar(id);
          alElegir(id);
        };
      });
    }
    buscar.oninput = pintarLista;

    cont.querySelector('#idManual').onclick = () => {
      bloque.hidden = false;
      nombre.focus();
    };
    function valido() {
      const v = nombre.value.trim();
      return v.length >= 5 && v.split(/\s+/).length >= 2;
    }
    nombre.oninput = () => { seguir.disabled = !valido(); };
    seguir.onclick = () => {
      if (!valido()) return;
      const id = { legajo: '', nombre: nombre.value.trim(), manual: true };
      guardar(id);
      alElegir(id);
    };
  }

  window.Identidad = { actual, guardar, borrar, pantalla };
})();
