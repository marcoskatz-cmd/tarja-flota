/**
 * Cámara en vivo con sello quemado en el pixel.
 *
 * La galería queda bloqueada a propósito: la foto tiene que ser del momento.
 * El sello (fecha, hora, equipo, coordenadas) se dibuja sobre la imagen antes
 * de subirla, así viaja adentro y no en metadata que se puede discutir o que
 * Drive puede recomprimir.
 *
 * Las coordenadas salen del GPS del celular en el momento de la foto, no del
 * EXIF: la cámara del navegador suele no escribirlo.
 */

const LADO_MAX = 1600;

let stream = null;
let coords = null;

// Estado del GPS para el cartel de la app: 'ok' | 'preguntar' | 'denegado' | 'apagado' | 'sin_gps'.
let gpsEstado = navigator.geolocation ? 'preguntar' : 'sin_gps';
let watchId = null;
const avisosGps = [];

function cambiarEstadoGps(e) {
  if (e === gpsEstado) return;
  gpsEstado = e;
  avisosGps.forEach((fn) => { try { fn(e); } catch (err) { } });
}

function seguirGps() {
  if (!navigator.geolocation) return;
  if (watchId !== null) navigator.geolocation.clearWatch(watchId);
  watchId = navigator.geolocation.watchPosition(
    (p) => {
      coords = { lat: p.coords.latitude, lon: p.coords.longitude, precision: Math.round(p.coords.accuracy || 0) };
      cambiarEstadoGps('ok');
    },
    (err) => {
      coords = null;
      // 1 = permiso rechazado; 2 = ubicación del celular apagada o sin señal; 3 = tardó demasiado.
      if (err && err.code === 1) cambiarEstadoGps('denegado');
      else if (err && err.code === 2) cambiarEstadoGps('apagado');
    },
    { enableHighAccuracy: true, maximumAge: 60000, timeout: 15000 }
  );
}
seguirGps();

// Si el operario cambia el permiso desde los ajustes, el cartel se actualiza solo.
if (navigator.permissions && navigator.permissions.query) {
  navigator.permissions.query({ name: 'geolocation' }).then((st) => {
    const aplicar = () => {
      if (st.state === 'denied') cambiarEstadoGps('denegado');
      else if (st.state === 'granted') { if (gpsEstado !== 'ok') seguirGps(); }
      else if (gpsEstado !== 'ok') cambiarEstadoGps('preguntar');
    };
    aplicar();
    st.onchange = aplicar;
  }).catch(() => { });
}

function estadoGps() { return gpsEstado; }
function alCambiarGps(fn) { avisosGps.push(fn); }
/** Vuelve a pedir la ubicación (dispara el cartel del navegador si todavía no respondió). */
function pedirGps() { seguirGps(); }

/** {lat, lon, precision} o null si el celular no dio GPS. Nunca bloquea la carga. */
function ubicacion() { return coords; }

/** Campos lat/lon/precision_gps para mandar al servidor. */
function gpsParaEnvio() {
  const u = ubicacion();
  return u ? { lat: u.lat, lon: u.lon, precision_gps: u.precision } : { lat: '', lon: '', precision_gps: '' };
}

async function abrirCamara(video) {
  if (stream) cerrarCamara();
  stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 } },
    audio: false
  });
  video.srcObject = stream;
  await video.play();
}

function cerrarCamara() {
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }
}

function capturar(video, equipo, fechaHoraServidor) {
  const w0 = video.videoWidth;
  const h0 = video.videoHeight;
  if (!w0 || !h0) throw new Error('La cámara todavía no está lista.');

  const escala = Math.min(1, LADO_MAX / Math.max(w0, h0));
  const w = Math.round(w0 * escala);
  const h = Math.round(h0 * escala);

  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  ctx.drawImage(video, 0, 0, w, h);

  const u = ubicacion();
  const lineas = [
    `${equipo} — ${fechaHoraServidor}`,
    u ? `${u.lat.toFixed(5)}, ${u.lon.toFixed(5)} (±${u.precision} m)` : 'Sin señal de GPS'
  ];

  const alto = Math.max(14, Math.round(h * 0.032));
  const pad = Math.round(alto * 0.5);
  const cajaAlto = lineas.length * (alto + pad) + pad;

  ctx.fillStyle = 'rgba(0,0,0,0.62)';
  ctx.fillRect(0, h - cajaAlto, w, cajaAlto);
  ctx.font = `600 ${alto}px system-ui, sans-serif`;
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'top';
  lineas.forEach((t, i) => {
    ctx.fillText(t, pad, h - cajaAlto + pad + i * (alto + pad));
  });

  return c.toDataURL('image/jpeg', 0.72);
}

window.Camara = { abrirCamara, cerrarCamara, capturar, ubicacion, gpsParaEnvio, estadoGps, alCambiarGps, pedirGps };
