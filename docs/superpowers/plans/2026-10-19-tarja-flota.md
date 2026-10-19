# Tarja Flota — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tarja diaria (horómetro con foto + checklist + GPS) para toda la flota pesada de INGECO: PWA pública para operarios y panel con mapa dentro de App INGECO.

**Architecture:** Un Apps Script (API JSON por `doPost`, `text/plain`) sobre una planilla propia, que importa equipos de la LISTA DE EQUIPOS de INGECOV y la nómina de Ropa INGECO. Front estático en GitHub Pages: `docs/index.html` (operario, sin login, offline-first) y `docs/panel.html` (solo con sesión del shell de App INGECO). Se parte del código de `tarja-corrientes` y se generaliza.

**Tech Stack:** Google Apps Script V8, Sheets, Drive, clasp; HTML/CSS/JS sin frameworks; IndexedDB; Leaflet 1.9.4 + OpenStreetMap; Node 18+ solo para correr tests de la lógica pura.

**Spec:** `docs/superpowers/specs/2026-10-19-tarja-flota-design.md`

## Global Constraints

- Todo texto visible en español llano; errores dicen qué pasó y qué hacer.
- Operario: sin login, sin PIN, sin `guard.js`. Panel: `guard.js` con `data-modulo="TARJAS"`, bloqueante, y cada pedido lleva `sesion` verificada con `validar_sesion_modulo`.
- La app del operario opera completa sin internet: nómina, equipos y checklist cacheados en el celular; cargas en IndexedDB con `op_id`; `TypeError` de `fetch` = "sin señal".
- Fecha y hora siempre del servidor. Fechas en Sheets como texto `@`, formato `yyyy-MM-dd`.
- Nunca dos jornadas abiertas en el mismo equipo. `MAX_HORAS_JORNADA = 14`.
- Horas de la tarja no escriben en INGECOV.
- Hoja de tarjas particionada por año: `TARJAS_2026`, …; índice `ABIERTAS`.
- Assets con `?v=N` sincronizado en `index.html`, `panel.html`, `ayuda.html` y `sw.js`.
- Paleta apta para daltonismo rojo-verde: azul `#1e3a8a`, teal `#0f766e`, ámbar `#b45309`. Sin modo oscuro. Logo real de INGECO (`docs/logos/ingeco.png`, copiado de Corrientes).
- Deploy: `clasp push` + `clasp update-deployment -d "vN" <deploymentId>`. Nunca `clasp create-deployment` sobre el estable. Nunca copy-paste al editor.
- Sesiones del panel no se guardan en `CacheService`.
- Lógica pura en archivos `.gs` sin llamadas a servicios de Google, para poder testearla con Node (`node test/run.js`).

## Review Focus

1. Operario sin señal desde que abre la app hasta que cierra la jornada: debe poder elegir nombre y equipo, abrir, hacer checklist y cerrar con todo en cola; al volver la señal se envía en orden y sin duplicar. (Test en Tarea 10.)
2. Dos operarios abren el mismo equipo casi a la vez (dos celulares): el segundo recibe "Ya hay una jornada abierta" y no se crean dos filas en `ABIERTAS`. (Test en Tarea 5.)
3. Cambio de año: una jornada abierta el 31-dic se cierra el 1-ene; el cierre tiene que encontrar la fila en `TARJAS_2025` aunque hoy sea 2026. (Test en Tarea 5.)
4. La LISTA DE EQUIPOS renombra o pierde una columna: el sync no borra la caché, marca diagnóstico y avisa; la PWA sigue andando con la última lista buena. (Test en Tarea 4.)
5. El operario elige un equipo y tipea un horómetro a más de 50 hs del sugerido: la app pregunta si el equipo es el correcto antes de aceptar el motivo de corrección; en la primera apertura real tras la siembra desde INGECOV no pregunta. (Test en Tarea 5 y Tarea 9.)

---

### Task 1: Repositorio y arnés de tests

**Files:**
- Create: `C:\Users\Usuario\tarja-flota\` (copiar `apps-script/`, `docs/`, `README.md`, `.gitignore` de `C:\Users\Usuario\tarja-corrientes`)
- Create: `test/run.js`, `test/helpers.js`, `package.json`
- Delete: `docs/logos/casella.*`, bloque `.ute` de `docs/index.html`, `docs/panel.html`, `docs/ayuda.html`
- Modify: `README.md`

**Interfaces:**
- Produces: `test/run.js` carga con `vm` todos los `apps-script/*.gs` listados en `test/helpers.js` (`CARGAR = ['Reglas.gs']` al principio) y corre cada `test/*.test.js`. Helper `assert` nativo de Node. `npm test` = `node test/run.js`.

- [ ] **Step 1: Copiar Corrientes a `tarja-flota`, sacar UTE/Casella, `git init`**

Renombrar en títulos y manifest "Obra Corrientes" → "Tarja Flota INGECO"; `DB_NOMBRE = 'tarja-flota'`; `data-modulo="TARJAS"` solo en `panel.html` (en `index.html` se saca el `<script guard>`). Dejar `.clasp.json` fuera hasta la Tarea 12.

- [ ] **Step 2: Escribir `test/run.js`**

Carga en un `vm.createContext({ console })` cada archivo de `CARGAR` y luego cada test; un test es una función exportada `module.exports = { 'nombre': (ctx) => {...} }`. Salida: `OK n` o lista de fallos y `process.exit(1)`.

- [ ] **Step 3: Test trivial `test/smoke.test.js`** que afirma que `ctx.CFG.MAX_HORAS_JORNADA === 14` (Config.gs se agrega a `CARGAR`; `PropertiesService` se stubea en helpers con un objeto en memoria).

- [ ] **Step 4: Correr `npm test`.** Esperado: `OK 1`.

- [ ] **Step 5: Commit** `chore: tarja-flota a partir de tarja-corrientes, arnés de tests`

---

### Task 2: Reglas puras

**Files:**
- Create: `apps-script/Reglas.gs`
- Test: `test/reglas.test.js`

**Interfaces:**
- Produces:
  - `esPesado_(clasificacion, codigo) -> boolean`: true si no es soporte (`COMPRESOR|GENERADOR|SOLDAD|GRUPOELECTRO`), ni prefijo `CMT`/`CMN`, ni clasificación que contenga `CAMION|CAMIONETA|AUTO|UTILITARIO|TRAILER|ACOPLADO`.
  - `inferirTipoRodado_(clasificacion, modelo) -> 'oruga'|'rodante'|''`: `EXCAVADORA|TOPADORA|RETROEXCAVADORA SOBRE ORUGA|PAVIMENTADORA` → oruga; `CARGADORA|MOTONIVELADORA|RODILLO|COMPACTADOR|RETRO|MINICARGADORA|FRESADORA` → rodante; resto `''`.
  - `calcularHoras_(ini, fin, max) -> {ok:true, horas} | {ok:false, error}` con los textos exactos de Corrientes (`cerrarTarja_`).
  - `agruparEquipos_(equipos, lugarPreferido) -> [{lugar, equipos:[...]}]`: grupos por `lugar` (vacío → "Sin obra asignada", último), `lugarPreferido` primero, resto alfabético; dentro, por `codigo`.
  - `buscarNomina_(personas, texto) -> personas[]`: normaliza acentos/mayúsculas, matchea por cualquier palabra del nombre, orden alfabético, máx 20.
  - `diferenciaSospechosa_(tipeado, sugerido, origen, umbral) -> boolean`: false si `origen === 'INGECOV'`; si no, `Math.abs(tipeado - sugerido) > umbral`.
  - `textoUltimaTarja_(ultima_tarja_yyyy_mm_dd, hoy, ultimo_operador) -> string`: `Hoy · Pérez J.`, `Ayer · …`, `Hace 3 días · …`, `''` si no hay.

- [ ] **Step 1: Escribir `test/reglas.test.js`** con un caso por función, incluidos: `esPesado_('CAMION VOLCADOR','CMN-03') === false`, `esPesado_('CARGADORA FRONTAL','CF-03') === true`, `inferirTipoRodado_('EXCAVADORA HIDRAULICA','PC200') === 'oruga'`, `calcularHoras_(10, 9, 14).ok === false`, `calcularHoras_(10, 25, 14).error` contiene `14 h`, `agruparEquipos_` pone `lugarPreferido` primero y "Sin obra asignada" último, `buscarNomina_([{nombre:'PÉREZ JUAN'}], 'perez')` devuelve 1, `diferenciaSospechosa_(100, 4800, 'INGECOV', 50) === false`, `diferenciaSospechosa_(100, 4800, 'TARJA', 50) === true`.
- [ ] **Step 2: Correr `npm test`.** Esperado: fallos por función no definida.
- [ ] **Step 3: Implementar `apps-script/Reglas.gs`** (solo JS puro, sin `SpreadsheetApp`).
- [ ] **Step 4: `npm test`.** Esperado: `OK`.
- [ ] **Step 5: Commit** `feat: reglas puras de clasificación, horas, agrupación y búsqueda`

---

### Task 3: Esquema de planilla y configuración

**Files:**
- Modify: `apps-script/Config.gs`, `apps-script/Planillas.gs`
- Test: `test/planillas.test.js` (con stub de `SpreadsheetApp` en `test/helpers.js`: hojas en memoria con `getRange/getValues/setValues/getLastRow/appendRow`)

**Interfaces:**
- Produces:
  - `HOJAS` con: `ABIERTAS` `['tarja_id','equipo','legajo','operador','ts_apertura','anio']`; `EQUIPOS` `['codigo','descripcion','marca','modelo','patente','clasificacion','tipo_rodado','lugar','activo_tarja','horom_tarja','origen_horom','ultimo_operador','ultima_tarja','lat','lon','ts_pos','ts_sync']`; `PERSONAL` `['legajo','nombre','activo','ts_sync']`; `CONFIG` `['clave','valor']`; `CHECKLIST_ITEMS` `['orden','tipo','item','activo']`; `TARJAS` (plantilla por año) = columnas de Corrientes menos `foto_monitor`, más `legajo, obra, lat_fin, lon_fin, precision_gps, operador_manual, cierre_tercero, legajo_cierre, motivo_cierre_tercero, checklist_hecho`; `OPERADORES_MANUALES` `['nombre','legajo_vinculado','ts']`.
  - `SEED.CHECKLIST_ITEMS` = los 7 de Corrientes con `tipo` `''`/`'oruga'`/`'rodante'` en vez de equipo. `SEED.CONFIG` = `MAX_HORAS_JORNADA=14`, `UMBRAL_CORRECCION_HS=50`, `UMBRAL_DIF_INGECOV_HS=100`, `HORAS_ABIERTA_AVISO=16`, `SHEET_ROPA_ID=''`, `SHEET_LISTA_EQUIPOS_ID=1EwbNlmBMx3OIviplvHSJM3N4CZ3vVXgVxH208VugG3M`, `INGECOV_SNAPSHOT_URL=''`.
  - `config_(clave) -> string` (lee CONFIG, cache en memoria por ejecución), `configNum_(clave)`.
  - `nombreHojaTarjas_(fecha_yyyy_mm_dd) -> 'TARJAS_2026'`; `hojaTarjas_(anio)` crea la hoja del año con el encabezado `HOJAS.TARJAS` si no existe.
  - `leer_`, `agregar_`, `actualizar_`, `buscarPorId_` siguen igual pero aceptan nombres `TARJAS_<año>`.
  - `diagnosticar_()` devuelve también entradas `{hoja:'FUENTE_EQUIPOS'|'FUENTE_PERSONAL', detalle}` leyendo Script Properties `DIAG_EQUIPOS` / `DIAG_PERSONAL` (las escribe la Tarea 4).

- [ ] **Step 1: Test:** `setupCompleto_()` sobre el stub crea todas las hojas de `HOJAS` más `TARJAS_<añoActual>`; `nombreHojaTarjas_('2025-12-31') === 'TARJAS_2025'`; `config_('MAX_HORAS_JORNADA') === '14'`.
- [ ] **Step 2: `npm test`** → falla.
- [ ] **Step 3: Implementar** en `Config.gs` y `Planillas.gs`. Quitar `SEED.EQUIPOS` (ahora viene del sync).
- [ ] **Step 4: `npm test`** → OK.
- [ ] **Step 5: Commit** `feat: esquema por año, ABIERTAS, EQUIPOS caché, PERSONAL y CONFIG`

---

### Task 4: Importación de fuentes (equipos, nómina, horómetro inicial)

**Files:**
- Create: `apps-script/Fuentes.gs`
- Test: `test/fuentes.test.js`

**Interfaces:**
- Consumes: `esPesado_`, `inferirTipoRodado_`, `leer_/agregar_/actualizar_`, `config_`.
- Produces:
  - `idx_(header, sinonimos) -> number` (copia del `_idx_` del builder de INGECOV: normaliza acentos/símbolos, match exacto).
  - `leerListaEquipos_() -> {filas:[{codigo,descripcion,marca,modelo,patente,clasificacion,lugar}], faltan:[]}`: pestaña `EQUIPOS` de `SHEET_LISTA_EQUIPOS_ID`; sinónimos de columnas exactamente los del builder (`CÓDIGO|CODIGO|CODIGO INTERNO|CODIO INTERNO`, `CLASIFICACIÓN|CLASIFICACION|TIPO`, `MARCA`, `MODELO`, `PATENTE/SERIE|PATENTE|N° SERIE/PATENTE|N SERIE N PATENTE|SERIE|DOMINIO`, `UBICACIÓN|UBICACION|LUGAR`). `descripcion` = `clasificacion + ' ' + marca + ' ' + modelo` recortado.
  - `syncEquipos_() -> {altas, actualizados, faltan}`: upsert por `codigo` en `EQUIPOS` solo si `esPesado_`; **no pisa** `tipo_rodado` ni `activo_tarja` si ya tienen valor; alta nueva: `tipo_rodado = inferirTipoRodado_`, `activo_tarja='SI'`. Si `faltan.length`, no toca filas, escribe `DIAG_EQUIPOS` y llama `notificarAppIngeco_('TARJAS', {destinatarios:[{admin:true}], prioridad:'critica', titulo:'La LISTA DE EQUIPOS cambió', ...})` como mucho una vez por día (Script Property `DIAG_EQUIPOS_AVISADO`).
  - `syncPersonal_() -> {total, faltan}`: hoja `PERSONAL` de `SHEET_ROPA_ID`, columnas `LEGAJO`, `NOMBRE|APELLIDO Y NOMBRE|NOMBRE Y APELLIDO`, `ACTIVO|ESTADO`; mismo contrato de fallo con `DIAG_PERSONAL`.
  - `sembrarHorometros_() -> {sembrados}`: para cada equipo con `horom_tarja` vacío, toma `ULT HRKM` de la pestaña `SVC_PANELPROG` del snapshot de INGECOV (`INGECOV_SNAPSHOT_URL`, JSON; si está vacío, hoja `SVC_PANELPROG` de la planilla snapshot id en CONFIG `SNAPSHOT_SHEET_ID`) y escribe `horom_tarja`, `origen_horom='INGECOV'`.
  - `syncFuentes_()` = las tres; `instalarTriggerSync()` cada hora.

- [ ] **Step 1: Tests** con hojas stub: sync con header renombrado (`CODIO INTERNO`) importa; sin columna de código → `faltan` incluye `CODIGO`, EQUIPOS sigue igual y `DIAG_EQUIPOS` queda escrito; segundo sync no pisa `tipo_rodado='oruga'` editado a mano; camión `CMN-03` no entra.
- [ ] **Step 2: `npm test`** → falla.
- [ ] **Step 3: Implementar `Fuentes.gs`.** `UrlFetchApp` stubeado en helpers.
- [ ] **Step 4: `npm test`** → OK.
- [ ] **Step 5: Commit** `feat: sync de equipos desde INGECOV, nómina desde Ropa y siembra de horómetros`

---

### Task 5: Ciclo de la tarja (abrir, checklist, cerrar, cierre de tercero)

**Files:**
- Modify: `apps-script/Tarjas.gs` (reescritura), `apps-script/Fotos.gs` (subcarpeta `codigo/yyyy-MM`)
- Test: `test/tarjas.test.js`

**Interfaces:**
- Consumes: `hojaTarjas_`, `calcularHoras_`, `diferenciaSospechosa_`, `configNum_`, `guardarFoto_` (stub devuelve `'https://drive/x'`), `LockService` stub.
- Produces:
  - `equipoPorCodigo_(codigo)` (lanza "El equipo X no está en la lista").
  - `abiertaDe_(codigo) -> fila de ABIERTAS | null`; `tarjaDeAbierta_(fila)` abre `TARJAS_<anio>` de la fila.
  - `estadoDelDia_(p{equipo}) -> {fecha, hora, abierta: null|{tarja_id, operador, legajo, ts_apertura, horom_ini, horas_abierta}, sugerido, origen_horom, checklist_pendiente: boolean, items:[...], motivos_cierre_tercero:['Se olvidó de cerrar','Cambio de turno','Otro']}`. `checklist_pendiente` = no hay tarja de hoy con `checklist_hecho='SI'` para el equipo.
  - `abrirTarja_(p{equipo, legajo?, operador, operador_manual?, firma, foto_horometro, horom_ini, motivo_correccion?, confirmo_equipo?, checklist?:[{orden, estado:'OK'|'PROBLEMA', foto?, comentario?}], lat?, lon?, precision_gps?, op_id})`: idempotente por `op_id` (busca en `TARJAS_<añoActual>` y en el anterior); rechaza si `abiertaDe_`; si `diferenciaSospechosa_` y `!p.confirmo_equipo` lanza `{code:'CONFIRMAR_EQUIPO'}` con texto "El horómetro que tipeaste está a N hs del último. ¿Seguro que es CF-03?"; checklist obligatorio solo si `checklist_pendiente`; escribe TARJAS, ABIERTAS, CHECKLIST_RESP, PENDIENTES; actualiza EQUIPOS `ultimo_operador`, `ultima_tarja`, `lat/lon/ts_pos`; si `operador_manual` agrega a OPERADORES_MANUALES; aviso de PROBLEMA a `[{con_modulo:'TARJAS'}]` con `prioridad:'critica'`. **Sin** aviso de "tarja abierta".
  - `cerrarTarja_(p{tarja_id, foto_horometro, horom_fin, lat?, lon?, precision_gps?, legajo?, operador?, motivo_cierre_tercero?, op_id})`: si quien cierra no es el `legajo`/`operador` de apertura exige `motivo_cierre_tercero` y marca `cierre_tercero='SI'`, `legajo_cierre`; borra la fila de ABIERTAS; actualiza EQUIPOS `horom_tarja`, `origen_horom='TARJA'`, `lat/lon/ts_pos`. **Sin** aviso de "tarja cerrada".
  - `tarjaPublica_(t)` incluye `cierre_tercero`.

- [ ] **Step 1: Tests:** abrir sin abierta crea fila en ABIERTAS; segundo `abrirTarja_` con otro `op_id` sobre el mismo equipo lanza "Ya hay una jornada abierta"; mismo `op_id` devuelve `ya_existia`; abierta en `TARJAS_2025` (fecha `2025-12-31`) se cierra con "hoy" `2026-01-01` (stub de `hoyStr_`) y sale de ABIERTAS; cerrar por otro legajo sin motivo lanza error; con motivo marca `cierre_tercero='SI'`; `horom_ini` a 500 hs del sugerido con `origen_horom='TARJA'` y sin `confirmo_equipo` lanza `CONFIRMAR_EQUIPO`; con `origen_horom='INGECOV'` no; segunda apertura del día no exige checklist.
- [ ] **Step 2: `npm test`** → falla.
- [ ] **Step 3: Implementar `Tarjas.gs`.**
- [ ] **Step 4: `npm test`** → OK.
- [ ] **Step 5: Commit** `feat: ciclo de tarja multi-equipo con ABIERTAS, cierre de tercero y partición anual`

---

### Task 6: API pública y mantenimiento

**Files:**
- Modify: `apps-script/Codigo.gs`, `apps-script/Mantenimiento.gs`
- Test: `test/api.test.js`

**Interfaces:**
- Produces (en `RUTAS`, POST):
  - `nomina` → `{personas:[{legajo, nombre}], ts}` solo activos.
  - `equipos` → `{equipos:[{codigo, descripcion, marca, modelo, patente, lugar, tipo_rodado, horom_tarja, origen_horom, ultimo_operador, ultima_tarja, abierta_por}], ts}` solo `activo_tarja='SI'`.
  - `items` → `{items:[{orden, tipo, item}]}` activos (la PWA filtra por tipo).
  - `estado`, `abrir`, `cerrar` (Tarea 5).
- GET con `key`: `setup`, `sync_fuentes`, `sembrar_horometros`, `borrar_tarja&equipo&fecha&aplicar`, `recalcular_horometros&aplicar` (adaptados a `TARJAS_<año>` y `horom_tarja`), `instalar_triggers`, `ping` (`instalado`, `equipos`, `personas`, `ultimo_sync`).
- Se eliminan `vincular`, `set_pin`, `limpiar_operadores`, `login`.

- [ ] **Step 1: Test:** `doPost` con body `{action:'equipos'}` sobre stub con 2 equipos (uno `activo_tarja='NO'`) devuelve 1; `doPost` con acción desconocida → `ok:false`; `doGet` `ping` sin planilla → `instalado:false`.
- [ ] **Step 2: `npm test`** → falla. **Step 3: Implementar.** **Step 4: `npm test`** → OK.
- [ ] **Step 5: Commit** `feat: API pública nomina/equipos/items y mantenimiento por año`

---

### Task 7: API del panel con sesión del shell

**Files:**
- Create: `apps-script/Sesion.gs`
- Modify: `apps-script/Panel.gs` (reescritura; se borra PIN/CACHE)
- Test: `test/panel.test.js`

**Interfaces:**
- Produces:
  - `sesionShell_(p) -> usuario`: `UrlFetchApp.fetch(APP_INGECO_BACKEND_, {accion:'validar_sesion_modulo', payload:{sesion:p.sesion, modulo:'TARJAS'}})`; cache 10 min en Script Properties `SES_<hash>` con vencimiento (no `CacheService`); lanza "La sesión venció. Volvé a abrir desde la app INGECO." si falla.
  - Rutas (todas pasan por `sesionShell_`): `hoy` → `{fecha, equipos:[{codigo, descripcion, lugar, estado:'cerrada'|'abierta'|'sin_tarja'|'sin_actividad', horas, jornadas, operador, desde, problemas_hoy, pendientes_abiertos, cierre_tercero}], fallas_hoy:[...], diagnostico}` (`sin_actividad` = `ultima_tarja` hace más de 7 días o vacía); `mapa` → `{puntos:[{codigo, descripcion, lat, lon, ts_pos, operador, horom_tarja, foto}]}` solo con `lat`; `equipo_historial{codigo, desde?, hasta?}` → `{equipo, tarjas:[tarjaPublica_], pendientes, horom_tarja, horom_ingecov, diferencia_alta: boolean}` (horom_ingecov del snapshot, Tarea 4); `consolidado{anio, mes?}` → `{filas:[{codigo, descripcion, lugar, mes, horas, jornadas}]}`; `pendientes`, `cerrar_pendiente{id, motivo}` (motivos de `MOTIVO_CIERRE_PENDIENTE`), `anular{tarja_id, motivo}` (quita de ABIERTAS si estaba, no toca `horom_tarja` salvo que fuera la última: entonces `recalcularHorometros_` de ese equipo), `diagnostico`, `equipos_config` → todos los EQUIPOS, `set_equipo{codigo, activo_tarja?, tipo_rodado?}`, `operadores_manuales`, `vincular_operador{nombre, legajo}` (reescribe `legajo` en las tarjas con ese `operador` y `operador_manual='SI'` del año actual).
  - Todo lo escrito por el panel va a `LOG` con `usuario = nombre_visible` del shell.

- [ ] **Step 1: Tests:** sin `sesion` → error de sesión; `hoy` clasifica `sin_actividad` con `ultima_tarja` de hace 10 días; `anular` de una abierta la saca de ABIERTAS; `set_equipo` persiste `tipo_rodado`.
- [ ] **Step 2–4:** rojo → implementar → verde.
- [ ] **Step 5: Commit** `feat: API del panel con sesión de App INGECO`

---

### Task 8: Trigger de jornadas abiertas

**Files:**
- Create: `apps-script/Triggers.gs`
- Test: `test/triggers.test.js`

**Interfaces:**
- Produces: `avisarAbiertasLargas()`: por cada fila de ABIERTAS con más de `HORAS_ABIERTA_AVISO` horas, un aviso a `[{con_modulo:'TARJAS'}]`, `clave_unica: 'abierta-larga-' + tarja_id` (una sola vez). `instalarTriggers()` crea: sync cada hora, `avisarAbiertasLargas` cada hora. Idempotente (borra los propios antes).

- [ ] **Step 1: Test:** abierta de hace 17 h genera 1 llamada al stub de `notificarAppIngeco_`; de hace 3 h ninguna.
- [ ] **Step 2–4:** rojo → implementar → verde.
- [ ] **Step 5: Commit** `feat: aviso de jornadas abiertas más de 16 h`

---

### Task 9: PWA del operario — identidad y selector de equipo

**Files:**
- Create: `docs/datos.js` (caché local de nómina/equipos/items), `docs/identidad.js`, `docs/selector.js`
- Modify: `docs/index.html`, `docs/app.js`, `docs/estilo.css`
- Test: `test/front-reglas.test.js` (carga `docs/datos.js` en vm con stub de `localStorage`)

**Interfaces:**
- Consumes: `API.llamar`, `agruparEquipos_`, `buscarNomina_`, `textoUltimaTarja_` (el front carga `apps-script/Reglas.gs` copiado como `docs/reglas.js` por un script `npm run reglas` que lo copia; test afirma que son idénticos).
- Produces:
  - `Datos.cargar() -> {personas, equipos, items, ts}`: intenta `nomina`, `equipos`, `items` en paralelo; lo que llega se guarda en `localStorage` (`tf_personas`, `tf_equipos`, `tf_items`); si falla, devuelve lo guardado; si no hay nada guardado, lanza "Para la primera vez hace falta señal."
  - `Identidad.actual() -> {legajo, nombre, manual}|null`; `Identidad.pantalla(alElegir)`: buscador (input + lista de hasta 20); botón "No estoy en la lista" → input de nombre y apellido (mín. 5 letras, dos palabras) → `{legajo:'', nombre, manual:true}`. Guarda en `localStorage.tf_identidad`.
  - `Selector.actual() -> codigo|null`; `Selector.pantalla(alElegir)`: grupos por obra (`agruparEquipos_` con `localStorage.tf_lugar`), tarjeta con `codigo` grande, `descripcion`, `patente`, `textoUltimaTarja_`, `horom_tarja + ' hs'`, y si `abierta_por`, chip "Abierta por X"; al tocar, confirmación "Vas a tarjar **CF-03** · Cargadora 950H · Autovías. ¿Es este?" con botones "Sí, es este" / "No, elegir otro". Guarda `tf_equipo` y `tf_lugar`.
  - Encabezado: nombre del operario (toque = cambiar) y código del equipo (botón "Cambiar equipo").

- [ ] **Step 1: Test:** `Datos.cargar()` con `API.llamar` que lanza "sin señal" y `localStorage` con `tf_equipos` devuelve esos equipos; sin nada guardado lanza el texto exacto.
- [ ] **Step 2–4:** rojo → implementar → verde. Verificar a mano en el navegador con `python -m http.server` en `docs/` y la API stubeada (`window.TARJA_API_URL` apuntando a un `?action=` falso devuelve error → debe mostrar "Para la primera vez hace falta señal.").
- [ ] **Step 5: Commit** `feat(pwa): identidad desde nómina con nombre manual y selector de equipo con pistas`

---

### Task 10: PWA del operario — apertura, checklist, cierre, cierre de tercero, offline

**Files:**
- Modify: `docs/app.js`, `docs/api.js`, `docs/camara.js`, `docs/sw.js`, `docs/ayuda.html`, `docs/manifest.json`

**Interfaces:**
- Consumes: `estado`, `abrir`, `cerrar` (Tarea 5), `Datos`, `Identidad`, `Selector`.
- Produces: flujo `iniciar()`: identidad → equipo → `estado` (si falla por señal, se arma desde caché: `abierta` = `localStorage.tf_abierta_<codigo>`, `sugerido` = equipo cacheado) → si `abierta` por otra persona → pantalla "Quedó abierta por X el día Y a las HH:MM, horómetro N" con botón "Cerrarla yo" (foto + valor + motivo de `motivos_cierre_tercero`) → `aperturaHorometro` (foto arriba, valor debajo, sugerido prellenado; corrección pide motivo; error `CONFIRMAR_EQUIPO` muestra el texto del servidor con "Sí, es CF-03" → reenvía con `confirmo_equipo:true` / "No, cambiar equipo") → `aperturaChecklist` solo si `checklist_pendiente` (ítems filtrados por `tipo_rodado` del equipo o `''`) → firma → envío con `enviar('abrir', …, codigo)`. Cierre: foto + valor → `enviar('cerrar', …)`. Al encolar una apertura se guarda `tf_abierta_<codigo>` = `{op_id, horom_ini, operador, ts}` y el cierre en cola referencia `op_id_apertura` en vez de `tarja_id`; `sincronizar` resuelve `tarja_id` con la respuesta de la apertura antes de mandar el cierre (orden por `ts`). `camara.js`: `precision_gps` = `p.coords.accuracy` redondeada o `'sin GPS'`.
- `sw.js`: `CACHE='tarja-flota-v1'`, `V='1'`, ARMAZON con los nuevos archivos y `leaflet` NO (solo panel). `ayuda.html`: pasos con capturas, sección "Sin señal".

- [ ] **Step 1: Test (`test/cola.test.js`,** carga `docs/api.js` con `indexedDB` fake mínimo o refactor de la cola a funciones puras `ordenarCola_`, `resolverTarjaId_`): una cola con apertura (`op_id A`) y cierre (`op_id_apertura A`) se envía apertura primero y el cierre sale con `tarja_id` de la respuesta.
- [ ] **Step 2–4:** rojo → implementar → verde. Verificación manual con DevTools en modo offline: elegir nombre y equipo desde caché, abrir, checklist, cerrar; volver online y ver que llegan 2 filas.
- [ ] **Step 5: Commit** `feat(pwa): jornada completa offline, cierre de tercero y confirmación de equipo`

---

### Task 11: Panel dentro de App INGECO

**Files:**
- Modify: `docs/panel.html`, `docs/panel.js` (reescritura), `docs/estilo.css`
- Create: `docs/panel-mapa.js`

**Interfaces:**
- Consumes: rutas de Tarea 7; `window.INGECO_SESION` / `INGECO_USUARIO` de `guard.js`.
- Produces: `panel.html` incluye `guard.js data-modulo="TARJAS"` y Leaflet 1.9.4 desde `unpkg.com/leaflet@1.9.4/dist/leaflet.css|.js`. Si `!window.INGECO_USUARIO` muestra solo "Abrí este panel desde la app INGECO" con link a `https://marcoskatz-cmd.github.io/app-ingeco/` (bloqueante acá). `pedir(action, datos)` agrega `sesion: window.INGECO_SESION`. Pestañas: Hoy (chips por obra, grupos Cerrada/Abierta/Sin tarja/Sin actividad, fallas arriba, aviso de diagnóstico), Mapa (`L.map`, teselas OSM con atribución, marcador por punto, color por antigüedad: hoy teal, semana azul, viejo ámbar; popup con código, operador, horómetro, fecha y link a foto; `fitBounds`), Equipo (buscador por código, historial con fotos, horómetro tarja vs INGECOV con resalte si `diferencia_alta`, botón Anular con motivo, pendientes), Consolidado (selector año/mes, tabla equipo×horas×jornadas por obra, botón "Descargar CSV" generado en el browser), Fallas (como Corrientes), Equipos (tabla con tilde `activo_tarja` y select `tipo_rodado`; operadores manuales con select de legajo para vincular), Diagnóstico.

- [ ] **Step 1:** Implementar shell + Hoy + Fallas + Diagnóstico. Verificar a mano: sin guard → mensaje bloqueante; con `window.INGECO_USUARIO` forzado en consola y API stub → pestañas.
- [ ] **Step 2:** Implementar Mapa. Verificar: 3 puntos stub con fechas distintas → 3 colores, popup abre.
- [ ] **Step 3:** Implementar Equipo + Consolidado + Equipos. Verificar: CSV descargado abre en Excel con separador `;`.
- [ ] **Step 4: Commit** `feat(panel): módulo TARJAS con hoy, mapa, equipo, consolidado, fallas y configuración`

---

### Task 12: Despliegue e inserción

**Files:**
- Create: `.clasp.json` (versionado), `scripts/deploy.sh`, `scripts/deploy_avisos.sh` (copiado del patrón de app-ingeco)
- Modify: `README.md`, `docs/index.html` (`TARJA_API_URL`), `sw.js`/HTML (`?v=`)

- [ ] **Step 1:** `clasp create --type webapp --title "Tarja Flota INGECO" --rootDir apps-script`; restaurar `appsscript.json` desde git si clasp lo pisa; `clasp push -f`; `clasp deploy -d "v1"` una sola vez; guardar `deploymentId` en README y en `scripts/deploy.sh` (`clasp push -f && clasp update-deployment -d "$1" <id>`).
- [ ] **Step 2:** `GET ?action=setup` (toma la `BOOTSTRAP_KEY` de la respuesta y la guarda Marcos); cargar en CONFIG `SHEET_ROPA_ID` (leer de Script Properties de Ropa) e `INGECOV_SNAPSHOT_URL`/`SNAPSHOT_SHEET_ID`; `GET ?action=sync_fuentes&key=`, `?action=sembrar_horometros&key=`, `?action=instalar_triggers&key=`. Verificar `?action=ping` → `equipos > 0`, `personas > 0`.
- [ ] **Step 3:** Pegar la URL `/exec` en `docs/index.html` y `docs/panel.html`; repo GitHub `marcoskatz-cmd/tarja-flota` privado o público según el resto (público como Corrientes), Pages desde `main /docs`. Commit y push por PowerShell.
- [ ] **Step 4:** App INGECO → Admin → Módulos → nuevo `TARJAS` (nombre "Tarja de equipos", URL `…/tarja-flota/panel.html`, embebido) y permiso a Marcos y Bruno. Clave `CLAVE_TARJAS` con `scripts/deploy_avisos.sh`. Probar una falla desde la PWA y ver el aviso en la bandeja.
- [ ] **Step 5:** En el panel → Equipos: revisar `activo_tarja` y `tipo_rodado`. Probar en un celular real: instalar PWA, elegir nombre, elegir equipo, abrir, checklist, cerrar, ver el punto en el mapa. Probar en modo avión.
- [ ] **Step 6:** README con URLs, ids, flujo de deploy y "qué hacer si la LISTA DE EQUIPOS cambia". Commit `docs: despliegue de tarja-flota`.
- [ ] **Step 7:** Piloto: una obra, 3 a 5 equipos, una semana (§9 del diseño). Recién después, mensaje a todos los operarios con el link.
