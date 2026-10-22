/**
 * PWA del operario.
 *
 * Criterio: una sola cosa en pantalla por vez, el botón de avanzar aparece
 * solamente cuando el paso está completo, y nada de texto libre donde alcance
 * con elegir. Alguien que nunca la vio tiene que terminar sin leer nada.
 *
 * Orden:
 *   Primera vez → ¿quién sos? (nómina) → ¿qué equipo? (con pistas y confirmación)
 *   Apertura    → foto del horómetro con el valor debajo → checklist (una vez por
 *                 equipo y día) → firma → enviar
 *   Cierre      → foto del horómetro con el valor debajo
 *   Quedó abierta por otro → cerrarla yo (foto + valor + motivo) → después abro la mía
 *
 * Funciona sin señal: datos de referencia cacheados (Datos), cargas en cola
 * (API) y estado de la jornada abierta recordado en el celular.
 */

const app = document.getElementById('app');
const colaAviso = document.getElementById('colaAviso');
const hEquipo = document.getElementById('hEquipo');
const hFecha = document.getElementById('hFecha');
const hQuien = document.getElementById('hQuien');
const btnCambiar = document.getElementById('btnCambiar');

const MAX_HORAS = 14;   // mismo valor que CONFIG del servidor (el servidor manda)

let estado = null;      // respuesta de `estado` (o armada desde caché)
let borrador = null;    // lo que el operario viene cargando
let equipo = null;      // equipo elegido (objeto de Datos)
let quien = null;       // identidad {legajo, nombre, manual}

// ---------- utilidades ----------

function pintar(html) { app.innerHTML = html; }
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function aviso(tipo, texto) { return `<div class="aviso ${tipo}">${texto}</div>`; }

function conError(fn) {
  return async (...args) => {
    try { await fn(...args); }
    catch (e) {
      const arriba = document.createElement('div');
      arriba.className = 'aviso error';
      arriba.textContent = e.message;
      app.prepend(arriba);
      window.scrollTo(0, 0);
    }
  };
}

function horaLocal() {
  const d = new Date();
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}
function hoyLocal() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

// Estado de jornada abierta recordado en el celular (para operar sin señal).
function claveAbierta(codigo) { return 'tf_abierta_' + codigo; }
function abiertaLocal(codigo) {
  try { return JSON.parse(localStorage.getItem(claveAbierta(codigo)) || 'null'); } catch (e) { return null; }
}
function guardarAbiertaLocal(codigo, info) { localStorage.setItem(claveAbierta(codigo), JSON.stringify(info)); }
function borrarAbiertaLocal(codigo) { localStorage.removeItem(claveAbierta(codigo)); }

// ---------- cargas guardadas sin señal ----------

function pintarCola(pendientes) {
  if (!pendientes.length) { colaAviso.hidden = true; return; }
  colaAviso.hidden = false;
  const n = pendientes.length;
  colaAviso.innerHTML = `
    <span>${n} carga${n === 1 ? '' : 's'} guardada${n === 1 ? '' : 's'} en el celular, sin enviar todavía.</span>
    <button id="btnEnviarCola">Enviar ahora</button>`;
  document.getElementById('btnEnviarCola').onclick = async (ev) => {
    ev.target.disabled = true;
    ev.target.textContent = 'Enviando…';
    const ok = await API.sincronizar(() => {});
    if (ok) iniciar(); else { ev.target.disabled = false; ev.target.textContent = 'Enviar ahora'; }
  };
}
API.alCambiarCola(pintarCola);

// ---------- arranque ----------

function pintarEncabezado() {
  hQuien.textContent = quien ? quien.nombre : '';
  hQuien.hidden = !quien;
  hEquipo.textContent = equipo ? equipo.codigo : 'Tarja de equipos';
  hFecha.textContent = equipo ? (equipo.descripcion || '') : '';
  btnCambiar.hidden = !equipo;
}

async function iniciar() {
  pintar('<div class="cargando">Cargando…</div>');
  try {
    await Datos.cargar();
  } catch (e) {
    return pintar(aviso('alerta', esc(e.message)) + `<button class="principal" onclick="location.reload()">Reintentar</button>`);
  }

  quien = Identidad.actual();
  if (!quien) return pantallaIdentidad();

  const cod = Selector.actual();
  equipo = cod ? Datos.equipo(cod) : null;
  if (!equipo) return pantallaSelector();
  pintarEncabezado();

  // Antes que nada, mandar lo que haya quedado en cola sin señal.
  await API.sincronizar(() => {});
  const cola = await API.pendientesEnCola();
  pintarCola(cola);

  // Si la carga de este equipo todavía está en cola, el servidor no la conoce.
  const propia = cola.filter((c) => c.equipo === equipo.codigo);
  if (propia.length) return pantallaEnCola(propia);

  try {
    estado = await API.llamar('estado', { equipo: equipo.codigo });
    estado.offline = false;
    if (estado.abierta) guardarAbiertaLocal(equipo.codigo, { tarja_id: estado.abierta.tarja_id, operador: estado.abierta.operador, legajo: estado.abierta.legajo, horom_ini: estado.abierta.horom_ini, ts: estado.abierta.ts_apertura, enviada: true });
    else borrarAbiertaLocal(equipo.codigo);
  } catch (e) {
    estado = estadoDesdeCache();
  }
  pintarEncabezado();
  pantallaInicio();
}

/** Sin señal: lo que el celular sabe del equipo alcanza para operar. */
function estadoDesdeCache() {
  const ab = abiertaLocal(equipo.codigo);
  return {
    offline: true,
    fecha: hoyLocal(),
    equipo: equipo.codigo,
    tipo_rodado: equipo.tipo_rodado,
    abierta: ab ? { tarja_id: ab.tarja_id || '', operador: ab.operador, legajo: ab.legajo, horom_ini: ab.horom_ini, ts_apertura: ab.ts, op_id_apertura: ab.op_id } : null,
    sugerido: (equipo.horom_tarja === '' || equipo.horom_tarja == null) ? null : Number(equipo.horom_tarja),
    origen_horom: equipo.origen_horom || '',
    checklist_pendiente: !(ab && ab.fecha === hoyLocal()) && localStorage.getItem('tf_checklist_' + equipo.codigo) !== hoyLocal(),
    items: Datos.itemsPara(equipo.tipo_rodado),
    motivos_cierre_tercero: ['Se olvidó de cerrar', 'Cambio de turno', 'Otro']
  };
}

function esMia(abierta) {
  if (!abierta) return false;
  if (quien.legajo && abierta.legajo) return String(quien.legajo) === String(abierta.legajo);
  return normalizarTexto_(quien.nombre) === normalizarTexto_(abierta.operador);
}

async function pantallaInicio() {
  const sinSenal = estado.offline ? aviso('alerta', 'Sin señal. Podés cargar igual: se guarda en el celular y se envía solo después.') : '';
  // Cargas que el servidor rechazó: se muestran hasta que el operario las vea.
  const rech = await API.rechazadas();
  if (rech.length) return pantallaRechazadas(rech);
  if (estado.abierta && !esMia(estado.abierta)) return pantallaAbiertaPorOtro(sinSenal);
  if (estado.abierta) return pantallaCierre(sinSenal);
  const horom = estado.sugerido === null
    ? 'Sin horómetro previo registrado: el primero que cargues es el que vale.'
    : `Último horómetro: <strong>${estado.sugerido}</strong>${estado.origen_horom === 'INGECOV' ? ' (según mantenimiento)' : ''}`;
  pintar(`
    ${sinSenal}
    <div class="tarjeta centro">
      <div class="codigo">${esc(equipo.codigo)}</div>
      <div class="desc">${esc(equipo.descripcion || '')}</div>
      <div class="tenue">${horom}</div>
    </div>
    <button class="principal" id="abrir">Empezar la jornada</button>
  `);
  document.getElementById('abrir').onclick = aperturaHorometro;
}

/** El servidor rechazó una carga hecha sin señal. No se pierde en silencio. */
function pantallaRechazadas(rech) {
  const r = rech[0];
  const que = r.action === 'abrir' ? 'la apertura' : 'el cierre';
  const cuando = new Date(r.ts).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  pintar(`
    ${aviso('error', `<strong>No se pudo registrar ${que} de ${esc(r.equipo)}</strong> que cargaste el ${esc(cuando)} sin señal.<br>El sistema respondió: <em>${esc(r.error)}</em>`)}
    <p class="ayuda">Si hace falta, cargala de nuevo. Si tenés dudas, avisá a la oficina con el código del equipo y la hora.</p>
    <button class="principal" id="ok">Entendido</button>
  `);
  document.getElementById('ok').onclick = async () => { await API.descartarRechazada(r.id); iniciar(); };
}

// ---------- identidad y equipo ----------

function pantallaIdentidad() {
  equipo = null; pintarEncabezado();
  Identidad.pantalla(app, (id) => { quien = id; iniciar(); });
}

function pantallaSelector() {
  pintarEncabezado();
  Selector.pantalla(app, (e) => { equipo = e; iniciar(); });
}

btnCambiar.onclick = () => { Selector.borrar(); pantallaSelector(); };
hQuien.onclick = () => { Identidad.borrar(); pantallaIdentidad(); };

// ---------- cámara ----------

function pantallaCamara({ titulo, indicacion, conValor }) {
  pintar(`
    <h2>${titulo}</h2>
    <div class="camara tarjeta" style="padding:0">
      <video id="vid" playsinline muted></video>
      <div class="indicacion">${indicacion}</div>
    </div>
    <button class="principal" id="btnFoto" disabled>Preparando cámara…</button>
    <div style="height:.5rem"></div>
    <button class="secundaria" id="btnVolver">Volver</button>
  `);
  const vid = document.getElementById('vid');
  const btn = document.getElementById('btnFoto');
  document.getElementById('btnVolver').onclick = () => { Camara.cerrarCamara(); pantallaInicio(); };

  Camara.abrirCamara(vid).then(() => {
    btn.disabled = false;
    btn.textContent = 'Sacar la foto';
  }).catch(() => {
    pintar(
      aviso('error', 'No se pudo abrir la cámara. Revisá que le hayas dado permiso a la app.') +
      `<button class="principal" onclick="location.reload()">Reintentar</button>`
    );
  });

  btn.onclick = conError(async () => {
    const foto = Camara.capturar(vid, equipo.codigo, estado.fecha + ' ' + horaLocal());
    Camara.cerrarCamara();
    const volver = () => pantallaCamara({ titulo, indicacion, conValor });
    conValor(foto, volver);
  });
}

// ---------- apertura ----------

function aperturaHorometro() {
  borrador = { checklist: [], confirmo_equipo: false };
  pantallaCamara({
    titulo: 'Foto del horómetro',
    indicacion: 'Que se lean los números completos.',
    conValor: (foto, repetir) => aperturaValor(foto, repetir)
  });
}

/** La foto arriba y el número debajo: se tipea mirando la misma imagen. */
function aperturaValor(foto, repetir) {
  const sinPrevio = estado.sugerido === null || estado.sugerido === undefined;
  const sugerido = sinPrevio ? null : Number(estado.sugerido);
  pintar(`
    <h2>Horómetro</h2>
    <img class="previa" src="${foto}" alt="Foto del horómetro">
    <div style="height:.5rem"></div>
    <button class="secundaria" id="rep">Repetir la foto</button>
    <div class="tarjeta" style="margin-top:.9rem">
      <label>Escribí lo que muestra el horómetro</label>
      <input type="number" id="valor" inputmode="decimal" step="0.1" ${sinPrevio ? 'placeholder="Ej.: 4812.5"' : `value="${sugerido}"`}>
      <div class="tenue" style="margin-top:.5rem">${sinPrevio ? 'Sin horómetro previo registrado en ' + esc(equipo.codigo) + '.' : `Último registrado en ${esc(equipo.codigo)}: <strong>${sugerido}</strong>.`}</div>
      <div id="bloqueMotivo" hidden>
        <label>¿Por qué no coincide?</label>
        <textarea id="motivo" rows="3" placeholder="Ej.: el horómetro se reinició, o el valor anterior se cargó mal"></textarea>
      </div>
    </div>
    <button class="principal" id="seguir">Continuar</button>
  `);

  const valor = document.getElementById('valor');
  const bloque = document.getElementById('bloqueMotivo');
  valor.oninput = () => { bloque.hidden = sinPrevio || Math.abs(Number(valor.value) - sugerido) <= 0.001; };
  document.getElementById('rep').onclick = repetir;

  document.getElementById('seguir').onclick = conError(() => {
    const v = Number(valor.value);
    if (valor.value === '' || !isFinite(v) || v < 0) throw new Error('El valor del horómetro no es válido.');
    const motivo = document.getElementById('motivo').value.trim();
    const corregido = !sinPrevio && Math.abs(v - sugerido) > 0.001;
    if (corregido && !motivo) throw new Error('El número no coincide con el último registrado: hace falta explicar por qué.');
    borrador.foto_horometro = foto;
    borrador.horom_ini = v;
    borrador.motivo_correccion = motivo;
    // Misma regla que el servidor, aplicada antes para no esperar la red.
    if (corregido && diferenciaSospechosa_(v, sugerido, estado.origen_horom, 50) && !borrador.confirmo_equipo) {
      return preguntarEquipo(v, sugerido, () => { borrador.confirmo_equipo = true; siguienteTrasHorometro(); });
    }
    siguienteTrasHorometro();
  });
}

function preguntarEquipo(v, sugerido, alConfirmar) {
  pintar(`
    ${aviso('alerta', `El horómetro que tipeaste (<strong>${v}</strong>) está a <strong>${Math.abs(v - sugerido).toFixed(0)} hs</strong> del último registrado (${sugerido}).`)}
    <h2>¿Seguro que estás en ${esc(equipo.codigo)}?</h2>
    <p class="ayuda">${esc(equipo.descripcion || '')}${equipo.lugar ? ' · ' + esc(equipo.lugar) : ''}</p>
    <button class="principal" id="si">Sí, es ${esc(equipo.codigo)}</button>
    <div style="height:.5rem"></div>
    <button class="secundaria" id="no">No, cambiar equipo</button>
  `);
  document.getElementById('si').onclick = alConfirmar;
  document.getElementById('no').onclick = () => { Selector.borrar(); pantallaSelector(); };
}

function siguienteTrasHorometro() {
  if (estado.checklist_pendiente) return aperturaChecklist();
  aperturaFirma();
}

// ---------- apertura: checklist ----------

function aperturaChecklist() {
  const items = estado.items;
  pintar(`
    <h2>Revisión del equipo</h2>
    <p class="ayuda">Un toque por ítem. Si algo está mal, marcá Falla y sacá una foto.</p>
    <div class="tarjeta">
      ${items.map((i) => `
        <div class="item" data-orden="${i.orden}">
          <div class="texto">${i.orden}. ${esc(i.item)}</div>
          <div class="opciones">
            <button class="ok" data-estado="OK">✓ Bien</button>
            <button class="problema" data-estado="PROBLEMA">✕ Falla</button>
          </div>
          <div class="detalle" hidden></div>
        </div>`).join('')}
    </div>
    <button class="principal" id="seguir" disabled>Falta responder</button>
  `);

  const respuestas = {};
  const btn = document.getElementById('seguir');

  function revisar() {
    const completo = items.every((i) => {
      const r = respuestas[i.orden];
      return r && (r.estado === 'OK' || (r.foto && r.comentario));
    });
    btn.disabled = !completo;
    btn.textContent = completo ? 'Continuar' : `Falta responder (${items.filter((i) => respuestas[i.orden]).length}/${items.length})`;
  }

  function armarDetalle(item, r, detalle) {
    detalle.hidden = false;
    detalle.innerHTML = `
      <label>Foto de la falla</label>
      ${r.foto ? `<img class="previa" src="${r.foto}" alt="">` : ''}
      <div style="height:.5rem"></div>
      <button class="secundaria btn-foto">${r.foto ? 'Repetir la foto' : 'Sacar foto'}</button>
      <label>¿Qué pasa?</label>
      <textarea rows="2" placeholder="Contá brevemente qué viste">${esc(r.comentario || '')}</textarea>`;
    const txt = detalle.querySelector('textarea');
    txt.oninput = () => { r.comentario = txt.value.trim(); revisar(); };
    detalle.querySelector('.btn-foto').onclick = conError(() => {
      pantallaCamara({
        titulo: item.item,
        indicacion: 'Que se vea la falla.',
        conValor: (f) => aperturaChecklistRestaurar(respuestas, f, item.orden)
      });
    });
  }

  app.querySelectorAll('.item').forEach((div) => {
    const orden = Number(div.dataset.orden);
    const item = items.find((i) => i.orden === orden);
    const detalle = div.querySelector('.detalle');
    div.querySelectorAll('.opciones button').forEach((b) => {
      b.onclick = () => {
        div.querySelectorAll('.opciones button').forEach((x) => x.classList.remove('elegido'));
        b.classList.add('elegido');
        if (b.dataset.estado === 'OK') {
          respuestas[orden] = { orden, estado: 'OK' };
          detalle.hidden = true; detalle.innerHTML = '';
          return revisar();
        }
        respuestas[orden] = { orden, estado: 'PROBLEMA', foto: null, comentario: '' };
        armarDetalle(item, respuestas[orden], detalle);
        revisar();
      };
    });
  });

  if (aperturaChecklist._restaurar) {
    const { previas, foto, orden } = aperturaChecklist._restaurar;
    aperturaChecklist._restaurar = null;
    Object.assign(respuestas, previas);
    respuestas[orden].foto = foto;
    items.forEach((i) => {
      const r = respuestas[i.orden];
      if (!r) return;
      const div = app.querySelector(`.item[data-orden="${i.orden}"]`);
      div.querySelector(r.estado === 'OK' ? '.ok' : '.problema').classList.add('elegido');
      if (r.estado === 'PROBLEMA') armarDetalle(i, r, div.querySelector('.detalle'));
    });
    revisar();
  }

  btn.onclick = conError(() => {
    borrador.checklist = items.map((i) => respuestas[i.orden]);
    aperturaFirma();
  });
}

function aperturaChecklistRestaurar(previas, foto, orden) {
  aperturaChecklist._restaurar = { previas: JSON.parse(JSON.stringify(previas)), foto, orden };
  aperturaChecklist();
}

// ---------- apertura: firma y envío ----------

function aperturaFirma() {
  pintar(`
    <h2>Firmá para empezar</h2>
    <p class="ayuda">${esc(quien.nombre)} · ${esc(equipo.codigo)} · horómetro ${borrador.horom_ini}</p>
    <div class="tarjeta">
      <canvas class="firma" id="canvas"></canvas>
      <div style="height:.5rem"></div>
      <button class="secundaria" id="borrar">Borrar la firma</button>
    </div>
    <button class="principal" id="enviar" disabled>Abrir la jornada</button>
  `);
  const canvas = document.getElementById('canvas');
  const enviar = document.getElementById('enviar');
  const ctx = canvas.getContext('2d');
  let firmado = false;

  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr; canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr); ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.strokeStyle = (window.IG && IG.color('tinta')) || '#0f1a3d';

  let dibujando = false;
  const punto = (e) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  canvas.addEventListener('pointerdown', (e) => { e.preventDefault(); dibujando = true; const p = punto(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); });
  canvas.addEventListener('pointermove', (e) => { if (!dibujando) return; e.preventDefault(); const p = punto(e); ctx.lineTo(p.x, p.y); ctx.stroke(); firmado = true; enviar.disabled = false; });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => canvas.addEventListener(ev, () => { dibujando = false; }));
  document.getElementById('borrar').onclick = () => { ctx.clearRect(0, 0, canvas.width, canvas.height); firmado = false; enviar.disabled = true; };

  enviar.onclick = conError(async () => {
    if (!firmado) return;
    enviar.disabled = true; enviar.textContent = 'Enviando…';
    const plano = document.createElement('canvas');
    plano.width = canvas.width; plano.height = canvas.height;
    const c2 = plano.getContext('2d');
    c2.fillStyle = '#ffffff'; c2.fillRect(0, 0, plano.width, plano.height); c2.drawImage(canvas, 0, 0);

    const datos = {
      equipo: equipo.codigo,
      legajo: quien.legajo || '',
      operador: quien.nombre,
      operador_manual: !!quien.manual,
      firma: plano.toDataURL('image/jpeg', 0.8),
      foto_horometro: borrador.foto_horometro,
      horom_ini: borrador.horom_ini,
      motivo_correccion: borrador.motivo_correccion || '',
      confirmo_equipo: !!borrador.confirmo_equipo,
      checklist: borrador.checklist || [],
      ...Camara.gpsParaEnvio()
    };
    let r;
    try {
      r = await API.enviar('abrir', datos, equipo.codigo);
    } catch (e) {
      if (e.code === 'CONFIRMAR_EQUIPO') {
        return preguntarEquipo(borrador.horom_ini, estado.sugerido, () => { borrador.confirmo_equipo = true; aperturaFirma(); });
      }
      enviar.disabled = false; enviar.textContent = 'Abrir la jornada';
      throw e;
    }
    if (borrador.checklist.length) localStorage.setItem('tf_checklist_' + equipo.codigo, hoyLocal());
    if (r.encolado) {
      guardarAbiertaLocal(equipo.codigo, { op_id: r.op_id, operador: quien.nombre, legajo: quien.legajo, horom_ini: borrador.horom_ini, ts: hoyLocal() + ' ' + horaLocal(), fecha: hoyLocal(), enviada: false });
      Datos.actualizarEquipo(equipo.codigo, { ultimo_operador: quien.nombre, ultima_tarja: hoyLocal(), abierta_por: quien.nombre });
      return pantallaGuardadoSinSeñal('La jornada quedó abierta en este celular.');
    }
    Datos.actualizarEquipo(equipo.codigo, { ultimo_operador: quien.nombre, ultima_tarja: hoyLocal(), abierta_por: quien.nombre });
    iniciar();
  });
}

// ---------- jornada abierta por otro ----------

function pantallaAbiertaPorOtro(prefijo) {
  const a = estado.abierta;
  pintar(`
    ${prefijo || ''}
    ${aviso('alerta', `<strong>Quedó abierta por ${esc(a.operador)}</strong> el ${esc(String(a.ts_apertura || '').slice(0, 16))}, con horómetro <strong>${esc(a.horom_ini)}</strong>. Hay que cerrarla antes de empezar la tuya.`)}
    <button class="principal" id="cerrarla">Cerrarla yo</button>
    <div style="height:.5rem"></div>
    <button class="secundaria" id="otro">Elegir otro equipo</button>
  `);
  document.getElementById('cerrarla').onclick = () => pantallaCierre('', true);
  document.getElementById('otro').onclick = () => { Selector.borrar(); pantallaSelector(); };
}

// ---------- cierre ----------

function pantallaCierre(prefijo, tercero) {
  pantallaCamara({
    titulo: 'Foto del horómetro al terminar',
    indicacion: 'Que se lean los números completos.',
    conValor: (foto, repetir) => cierreValor(foto, repetir, tercero)
  });
}

function cierreValor(foto, repetir, tercero) {
  const a = estado.abierta;
  const ini = Number(a.horom_ini);
  const motivos = estado.motivos_cierre_tercero || ['Se olvidó de cerrar', 'Cambio de turno', 'Otro'];
  pintar(`
    <h2>Horómetro al terminar</h2>
    <img class="previa" src="${foto}" alt="Foto del horómetro">
    <div style="height:.5rem"></div>
    <button class="secundaria" id="rep">Repetir la foto</button>
    <div class="tarjeta" style="margin-top:.9rem">
      <label>Escribí lo que muestra el horómetro</label>
      <input type="number" id="valor" inputmode="decimal" step="0.1" placeholder="Ej.: ${(ini + 8).toFixed(1)}">
      <div class="tenue" style="margin-top:.5rem">Al abrir marcaba <strong>${ini}</strong>${tercero ? ` (la abrió ${esc(a.operador)})` : ''}.</div>
      <div id="calc" class="tenue" style="margin-top:.4rem"></div>
      <div id="bloqueExceso" hidden>
        <label>¿Por qué da más de ${MAX_HORAS} horas?</label>
        <textarea id="motivoExceso" rows="2" placeholder="Ej.: quedó abierta desde ayer, se trabajó dos turnos"></textarea>
      </div>
      ${tercero ? `
        <label>¿Por qué la cerrás vos?</label>
        <div class="opciones-col" id="motivos">
          ${motivos.map((m) => `<button class="opcion" data-m="${esc(m)}">${esc(m)}</button>`).join('')}
        </div>` : ''}
    </div>
    <div class="tarjeta">
      <h3 style="margin-top:0">¿Cargaste algo hoy? (litros)</h3>
      <div class="tenue">Dejá vacío lo que no cargaste.</div>
      <label>Combustible</label><input type="number" id="fl_comb" inputmode="decimal" min="0" placeholder="0">
      <label>Aceite de motor</label><input type="number" id="fl_motor" inputmode="decimal" min="0" placeholder="0">
      <label>Aceite hidráulico</label><input type="number" id="fl_hidr" inputmode="decimal" min="0" placeholder="0">
      <label>Aceite de transmisión</label><input type="number" id="fl_trans" inputmode="decimal" min="0" placeholder="0">
      <label>¿Engrasaste?</label>
      <div class="opciones" id="grasa">
        <button class="opcion" data-g="Sí">Sí</button>
        <button class="opcion" data-g="No">No</button>
      </div>
    </div>
    <button class="principal" id="enviar" disabled>Cerrar la jornada</button>
  `);

  const valor = document.getElementById('valor');
  const calc = document.getElementById('calc');
  const enviar = document.getElementById('enviar');
  const bloqueExceso = document.getElementById('bloqueExceso');
  const motivoExceso = document.getElementById('motivoExceso');
  let motivo = '';
  let grasa = '';
  const FLUIDOS = ['fl_comb', 'fl_motor', 'fl_hidr', 'fl_trans'];
  const litros = (id) => Number(document.getElementById(id).value) || 0;
  document.getElementById('rep').onclick = repetir;
  FLUIDOS.forEach((id) => { document.getElementById(id).oninput = () => revisar(); });
  document.querySelectorAll('#grasa .opcion').forEach((b) => {
    b.onclick = () => {
      document.querySelectorAll('#grasa .opcion').forEach((x) => x.classList.remove('elegido'));
      b.classList.add('elegido'); grasa = b.dataset.g; revisar();
    };
  });

  function revisar() {
    const v = Number(valor.value);
    const h = v - ini;
    let ok = true;
    let exceso = false;
    if (!valor.value || !isFinite(v)) { calc.textContent = ''; ok = false; }
    else if (h < 0) { calc.textContent = 'El valor es menor que el de apertura. Revisalo.'; ok = false; }
    else if (h > MAX_HORAS) {
      // Jornada que quedó abierta días: se puede cerrar igual, explicando por qué.
      exceso = true;
      calc.textContent = `Daría ${h.toFixed(1)} h, más de las ${MAX_HORAS} de una jornada. Si el número está bien, explicá por qué.`;
      if (!motivoExceso.value.trim()) ok = false;
    }
    else calc.textContent = `Serían ${h.toFixed(1)} horas de trabajo.`;
    bloqueExceso.hidden = !exceso;
    if (tercero && !motivo) ok = false;
    if (!grasa) ok = false;
    if (FLUIDOS.some((id) => Number(document.getElementById(id).value) < 0)) ok = false;
    enviar.disabled = !ok;
  }
  valor.oninput = revisar;
  motivoExceso.oninput = revisar;
  if (tercero) {
    document.querySelectorAll('#motivos .opcion').forEach((b) => {
      b.onclick = () => {
        document.querySelectorAll('#motivos .opcion').forEach((x) => x.classList.remove('elegido'));
        b.classList.add('elegido'); motivo = b.dataset.m; revisar();
      };
    });
  }

  enviar.onclick = conError(async () => {
    enviar.disabled = true; enviar.textContent = 'Enviando…';
    const datos = {
      foto_horometro: foto,
      horom_fin: Number(valor.value),
      legajo: quien.legajo || '',
      operador: quien.nombre,
      combustible: litros('fl_comb'),
      aceite_motor: litros('fl_motor'),
      aceite_hidr: litros('fl_hidr'),
      aceite_trans: litros('fl_trans'),
      grasa,
      ...Camara.gpsParaEnvio()
    };
    if (tercero) datos.motivo_cierre_tercero = motivo;
    if (Number(valor.value) - ini > MAX_HORAS) { datos.confirmo_exceso = true; datos.motivo_exceso = motivoExceso.value.trim(); }
    if (a.tarja_id) datos.tarja_id = a.tarja_id;
    else datos.op_id_apertura = a.op_id_apertura;
    let r;
    try {
      r = await API.enviar('cerrar', datos, equipo.codigo);
    } catch (e) {
      enviar.disabled = false; enviar.textContent = 'Cerrar la jornada';
      throw e;
    }
    borrarAbiertaLocal(equipo.codigo);
    Datos.actualizarEquipo(equipo.codigo, { horom_tarja: Number(valor.value), origen_horom: 'TARJA', abierta_por: '', ultimo_operador: quien.nombre, ultima_tarja: hoyLocal() });
    if (r.encolado) return pantallaGuardadoSinSeñal('La jornada quedó cerrada en este celular.');
    pintar(aviso('info', `<strong>Jornada cerrada.</strong> ${(Number(valor.value) - ini).toFixed(1)} horas en ${esc(equipo.codigo)}.`) +
      `<button class="principal" id="ok">Listo</button>`);
    document.getElementById('ok').onclick = iniciar;
  });
}

// ---------- pantallas finales ----------

function pantallaGuardadoSinSeñal(extra) {
  pintar(
    aviso('alerta', `<strong>Guardado en el celular.</strong> ${extra || ''} No hay señal, así que se va a enviar solo cuando vuelva. No hace falta cargarlo de nuevo.`) +
    `<button class="principal" id="ok">Entendido</button>`
  );
  document.getElementById('ok').onclick = iniciar;
}

/** Hay cargas de este equipo esperando señal. */
async function pantallaEnCola(items) {
  const rech = await API.rechazadas();
  if (rech.length) return pantallaRechazadas(rech);
  const ultima = items[items.length - 1];
  const ab = abiertaLocal(equipo.codigo);
  let acciones = '';
  estado = estadoDesdeCache();
  // Lo último encolado fue una apertura: se puede cerrar igual, sin señal.
  if (ultima.action === 'abrir' && ab) {
    acciones = `<button class="principal" id="cerrar">Cerrar la jornada</button><div style="height:.5rem"></div>`;
  }
  // Lo último fue un cierre: se puede empezar otra jornada sin esperar la señal.
  if (ultima.action === 'cerrar' && !ab) {
    acciones = `<button class="principal" id="abrir">Empezar otra jornada</button><div style="height:.5rem"></div>`;
  }
  pintar(
    aviso('alerta', `<strong>Hay ${items.length} carga${items.length > 1 ? 's' : ''} de ${esc(equipo.codigo)} sin enviar.</strong> Quedaron guardadas porque no había señal. Se mandan solas cuando vuelva.`) +
    acciones +
    `<button class="secundaria" id="reintentar">Intentar enviar ahora</button>`
  );
  const c = document.getElementById('cerrar');
  if (c) c.onclick = () => pantallaCierre('');
  const ab2 = document.getElementById('abrir');
  if (ab2) ab2.onclick = aperturaHorometro;
  document.getElementById('reintentar').onclick = async (ev) => {
    ev.target.disabled = true; ev.target.textContent = 'Enviando…';
    const ok = await API.sincronizar(() => {});
    if (ok) return iniciar();
    ev.target.disabled = false; ev.target.textContent = 'Intentar enviar ahora';
    app.prepend(Object.assign(document.createElement('div'), { className: 'aviso error', textContent: 'Sigue sin haber señal. Probá más tarde; no se pierde nada.' }));
  };
}

// ---------- ciclo ----------

iniciar();
