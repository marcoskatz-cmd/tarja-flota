# Tarja diaria de la flota pesada de INGECO — diseño

Fecha: 2026-10-19 · Pedido de: Marcos Katz · Estado: borrador para aprobación

## 1. Intención

Replicar la tarja diaria de la obra de Corrientes (`tarja-corrientes`) para **toda la flota de
equipos pesados de INGECO**: saber por equipo y por día cuántas horas trabajó, en qué estado
está, cuántas horas acumula el horómetro y dónde está físicamente. El sistema debe entrar en la
operación con la menor fricción posible: el operario no debe aprender nada nuevo ni pedir
acceso a nadie.

Lo que respalda cada dato es la **foto del horómetro con GPS**, igual que en Corrientes.

## 2. Decisiones tomadas por Marcos (no re-discutir)

1. Mismo propósito que Corrientes: tarja diaria, horas trabajadas, estado del equipo, horas
   acumuladas. Más un **mapa en el panel** con la última posición de cada equipo, a partir del
   GPS tomado al sacar las fotos.
2. **Los operarios NO entran a App INGECO.** La tarja es una PWA **paralela**, pública, sin
   login. Lo que sí vive dentro de App INGECO es el **panel** de consulta.
3. Todos los operarios tienen celular propio. No hay celular fijo por equipo.
4. El operario se identifica **eligiendo su nombre de la nómina** (sin PIN). Si no está en la
   lista, **puede escribirlo** (decisión del 19-oct tras la revisión).
5. Alcance: **solo equipos pesados con horómetro**. Los camiones (kilómetros) quedan afuera.
6. Hay muchos equipos idénticos que solo se distinguen por el número interno: el selector de
   equipo tiene que dar **pistas para elegir bien** (ver §5.2).

## 3. Decisiones del diseñador presentadas en la conversación (Marcos las leyó, puede corregir)

- Stack: Apps Script + Sheets + Drive, front estático en GitHub Pages hablando con `doPost`
  JSON (`text/plain`, sin preflight). Igual a Corrientes y a App INGECO.
- **Repositorio nuevo `marcoskatz-cmd/tarja-flota`**, partiendo del código de Corrientes.
  `tarja-corrientes` queda intacto (UTE, celulares de terceros, logos de Casella).
- Un solo Apps Script sirve las dos caras: API pública para la PWA del operario y API con
  sesión del shell para el panel.
- Lista de equipos: **importada de la LISTA DE EQUIPOS de INGECOV**, nunca cargada a mano.
- Nómina: **importada de la hoja PERSONAL de Ropa INGECO** (ya cruzada con RRHH por legajo).
- Checklist: ítems de Corrientes, con el ítem de rodado adaptado por tipo (oruga/rodante),
  editable en una hoja sin deploy. Cada ítem Bien/Falla; una falla pide foto y una línea.
- Horas del día = horómetro de cierre menos horómetro de apertura. Varias jornadas por día
  permitidas; nunca dos abiertas a la vez.
- El horómetro de la tarja **no pisa el de INGECOV**. Se muestra al lado como fuente secundaria.
- Avisos por App INGECO: falla de checklist al instante. **Sin aviso nocturno de "equipos sin
  tarja"** (Marcos lo sacó el 19-oct; los equipos sin tarja se ven en la pestaña Hoy del panel).
- **La app tiene que funcionar sin internet** (pedido explícito de Marcos): todo lo que el
  operario hace se guarda en el celular y se envía cuando vuelve la señal (§5.6).
- Coordenadas: `navigator.geolocation` al momento de la foto, no EXIF (la cámara del navegador
  suele borrarlo).
- Mapa: Leaflet + teselas OpenStreetMap, sin clave ni costo.

## 4. Goals, non-goals, anti-goals

**Goals**
- Un operario que nunca vio la app abre y cierra su jornada sin leer nada.
- Cada jornada cerrada tiene: equipo, operario, horómetro inicial y final con foto, horas,
  checklist, coordenadas y hora de servidor.
- El panel responde en una pantalla: qué equipos trabajaron hoy, cuáles no, dónde están,
  qué fallas se reportaron.
- Horas por equipo, por mes y por obra exportables (consolidado).

**Non-goals (esta etapa)**
- Detenciones, horas paradas, imputabilidad (ya descartado en Corrientes).
- Frente de trabajo.
- Checklist semanal, entrada/salida de obra, PDF diario.
- Camiones y livianos.
- Reemplazar el circuito de service de INGECOV.

**Anti-goals (si pasa esto, el sistema fracasó)**
- Que el operario tenga que pedir acceso, recordar un PIN o loguearse con Google.
- Que el operario tarje el equipo equivocado porque dos se llaman igual.
- Que una carga se pierda por falta de señal.
- Que la lista de equipos o de personal haya que mantenerla a mano en dos lados.
- Que un cambio de columna en INGECOV o en Ropa rompa la tarja en silencio.

## 5. La PWA del operario

URL propia en Pages (`marcoskatz-cmd.github.io/tarja-flota/`), instalable, sin login, sin
`guard.js` (los operarios no tienen cuenta). Tres pantallas y nada más.

### 5.1 Primera vez / identidad
- Pantalla "¿Quién sos?": buscador por apellido sobre la nómina (solo activos). Si no aparece,
  un botón "No estoy en la lista" permite escribir nombre y apellido; esa tarja queda con
  `legajo` vacío y `operador_manual = SI`, y el panel los lista aparte para que Marcos los
  vincule a un legajo o los deje así. La nómina se guarda en el celular para que el buscador
  funcione sin señal. El celular recuerda la identidad en `localStorage`. Cambiar de persona:
  toque en el nombre arriba.
- Pantalla "¿Qué equipo manejás hoy?": selector de equipo (§5.2). También recordado; cambiar
  con un toque. Un operario puede tarjar distintos equipos en distintos días o el mismo día.

### 5.2 Selector de equipo con pistas (POKAYOKE)
La lista viene agrupada por **obra/ubicación actual** (columna LUGAR de INGECOV), con la obra
del último uso de este celular primero. Cada tarjeta de equipo muestra:
- **Código interno grande** (`CF-03`), que es lo que está pintado en la máquina.
- Descripción: marca + modelo (`Cargadora frontal Caterpillar 950H`).
- Patente/serie si existe.
- **Quién lo tarjó por última vez y cuándo** (`Ayer · Pérez J.`): si ve otro nombre en "su"
  equipo se da cuenta de que eligió mal.
- Horómetro actual según la tarja (`4.812 hs`): si el que va a tipear está lejos, el equipo
  no es ese.

Confirmación al elegir: "Vas a tarjar **CF-03** · Cargadora 950H · Autovías. ¿Es este?" con
botón grande y "No, elegir otro". Si al abrir el horómetro tipeado difiere del sugerido en más
de un umbral (CONFIG, p. ej. 50 hs), la app pregunta si el equipo es el correcto antes de
aceptar la corrección.

### 5.3 Abrir jornada
Equipo y operario ya resueltos. Una pantalla: **foto del horómetro arriba, número debajo**
(sugerido = último cierre, editable con motivo si se corrige). Firma en canvas como en
Corrientes. GPS capturado con la foto. Se guarda con `op_id` estable.

### 5.4 Checklist
Lista de ítems del tipo de equipo. Cada uno con dos botones grandes: Bien / Falla. Falla abre
foto + comentario de una línea. Se completa en la apertura (ver §7.6), una vez por equipo y día. Envío
inmediato; si no hay señal, a la cola.

### 5.5 Cerrar jornada
Foto del horómetro final arriba, número debajo. Validaciones: no menor al inicial, no más de
`MAX_HORAS_JORNADA` (14) salvo confirmación explícita con motivo. Muestra las horas resultantes
y vuelve al inicio con "Jornada cerrada · 7,5 hs · CF-03".

### 5.6 Sin internet (requisito, no extra)
La app abre y opera completa sin señal: nómina, lista de equipos con pistas y checklist se
guardan en el celular en cada uso con señal y se usan desde ahí. Abrir, checklist y cerrar se
encolan en IndexedDB con `op_id`, con las fotos adentro; reintento al volver a la app y al
recuperar red; barra naranja con la cantidad de cargas pendientes; traducción del `TypeError`
de `fetch` a "sin señal". Si la apertura sigue en cola, la app no vuelve a pedirla. El horómetro
sugerido sin señal es el último que el celular conoce, y el servidor recalcula al recibir.
Idéntico en mecanismo a Corrientes (ya corregido ahí).

### 5.7 Ayuda
`ayuda.html` en lenguaje llano con capturas, enlazada desde el pie. Logo INGECO.

### 5.8 Lo que el operario NO ve
Nada de otros equipos salvo en el selector. Ningún dato de otros operarios salvo "último que
tarjó". Ninguna pantalla de administración.

## 6. El panel (módulo TARJAS dentro de App INGECO)

Página estática `panel.html` en el mismo Pages, con `guard.js` **bloqueante acá sí** (el panel
es solo para administrativos; sin sesión del shell no muestra datos). Módulo `TARJAS` dado de
alta en App INGECO con el patrón de `docs/cargar-un-sistema.md`. Pestañas:

1. **Hoy**: grilla de equipos pesados activos con estado: Cerrada (horas), Abierta (desde hh:mm),
   Sin tarja. Chips por obra. Fallas del día arriba.
2. **Mapa**: Leaflet con un marcador por equipo en su última coordenada conocida (de la última
   foto), color por antigüedad del dato (hoy / esta semana / viejo; paleta azul/teal/ámbar, apta
   para daltonismo). Clic: código, operario, horómetro, fecha, foto.
3. **Equipo**: historial de tarjas con fotos, horómetro actual según tarja vs. INGECOV
   (diferencia resaltada si supera CONFIG), fallas abiertas. Anular tarja (con motivo, queda en
   LOG).
4. **Consolidado**: horas por equipo por mes y por obra, exportable (link a la planilla o CSV).
5. **Fallas**: pendientes de checklist, cerrables con motivo (Reparado / Repuesto pedido /
   Sin acción), como en Corrientes.
6. **Diagnóstico**: resultado de `diagnosticar_()` sobre columnas esperadas en TARJAS, LISTA DE
   EQUIPOS y PERSONAL de Ropa. Si una fuente cambió de nombre de columna, acá se ve.

Quién ve el panel lo decide Marcos en App INGECO (permiso por módulo). Mantenimiento (Bruno)
debería tenerlo.

## 7. Backend (Apps Script)

Un proyecto, deploy por `clasp push` + `clasp update-deployment` con deploymentId estable,
`.clasp.json` versionado. Planilla propia `TARJA FLOTA — Base de datos` y carpeta de Drive para
fotos (subcarpeta por equipo y mes).

### 7.1 Hojas
Herencia de Corrientes con cambios:
- `TARJAS_<año>`: se agregan `legajo`, `cierre_tercero`, `motivo_cierre_tercero`, `legajo_cierre`, `obra` (LUGAR del equipo al momento de abrir), `lat_fin`,
  `lon_fin`, `precision_gps`. `operador` pasa a ser el nombre de nómina (denormalizado).
- `CHECKLIST_RESP`, `PENDIENTES`, `LOG`: iguales.
- `CHECKLIST_ITEMS`: columna `tipo` (`oruga` / `rodante` / vacío = todos) en vez de `equipo`.
- `EQUIPOS` pasa a ser **caché** de la LISTA DE EQUIPOS de INGECOV, refrescada por trigger cada
  hora: `codigo, descripcion, marca, modelo, patente, tipo_rodado, lugar, activo_tarja,
  horom_tarja, ultimo_operador, ultima_tarja, ts_sync`. Solo filas clasificadas como pesadas
  (regla §7.3). `tipo_rodado` y `activo_tarja` son **editables a mano** y el sync no las pisa.
- `PERSONAL`: caché de la nómina de Ropa (`legajo, nombre, activo, ts_sync`), mismo trigger.
- `CONFIG`: umbrales editables (máx horas jornada, umbral de corrección de horómetro, umbral de
  diferencia vs INGECOV, checklist obligatorio sí/no).

### 7.2 API
Pública (PWA): `nomina`, `equipos` (con pistas), `estado` (jornada abierta del equipo,
sugerido, ítems), `abrir`, `checklist`, `cerrar`. Todas con `op_id` idempotente.
Con sesión del shell (`validar_sesion_modulo` TARJAS): `hoy`, `mapa`, `equipo_historial`,
`consolidado`, `pendientes`, `cerrar_pendiente`, `anular`, `diagnostico`.
Mantenimiento con clave de instalación (`?action=...&key=`): `setup`, `sync_fuentes`,
`borrar_tarja`, `recalcular_horometros` (heredados).

### 7.3 Importación de fuentes
- **Equipos**: leer la pestaña `EQUIPOS` de la planilla LISTA DE EQUIPOS
  (`1EwbNlmBMx3OIviplvHSJM3N4CZ3vVXgVxH208VugG3M`) con el mismo mapeo tolerante de columnas que
  usa el builder de INGECOV (`CÓDIGO` / `CODIO INTERNO`, `CLASIFICACIÓN`, `UBICACIÓN`, etc.).
  Pesado = lo que el builder clasifica como `V` (vial) y no es soporte (`S`) ni transporte
  (`L` / `P`). Primera carga: el panel muestra la lista y Marcos destilda lo que no corresponde
  (`activo_tarja`). `tipo_rodado` se infiere por CLASIFICACIÓN/MODELO cuando se puede
  (excavadora/topadora: oruga; cargadora/motoniveladora/rodillo: rodante) y se corrige a mano.
- **Nómina**: leer PERSONAL de la planilla de Ropa INGECO (id de planilla cargado en CONFIG de
  este proyecto). Solo activos.
- Ambas lecturas pasan por `diagnosticar_()`: columna faltante → aviso en el panel y aviso por
  App INGECO a Marcos, y se sigue usando la última caché buena.

### 7.4 Avisos por App INGECO
Snippet `IngecoAvisos.gs` con `CLAVE_TARJAS` cargada con el patrón `deploy_avisos.sh`.
- Falla de checklist: al instante, a Mantenimiento, con equipo, ítem, foto y operario.
- Jornada abierta más de 16 hs: aviso con equipo y operario.
- Falla de fuente (§7.3).

### 7.5 Horómetro vs INGECOV
Solo lectura: el panel compara `horom_tarja` con `ULT HRKM` del snapshot público de INGECOV
(`SVC_PANELPROG`) y marca si la diferencia supera CONFIG. No escribe en INGECOV. Si en unos
meses Marcos decide que la tarja alimente el service, es un cambio en INGECOV, no acá.

## 7.6 Reglas de operación que faltaban (decisiones del diseñador tras la revisión)

- **Jornada que quedó abierta** (de ayer o de otro operario): el siguiente operario la ve al
  entrar al equipo ("Quedó abierta por Pérez J. ayer 14:10, horómetro 4.812") y la **cierra él
  mismo** con foto del horómetro actual y un motivo de una lista (Se olvidó de cerrar / Cambio
  de turno / Otro). Las horas se calculan igual; la tarja queda marcada `cierre_tercero` y se
  resalta en el panel. Después abre la suya. Nada se auto-cierra solo. El aviso de "abierta más
  de 16 hs" sigue existiendo.
- **Checklist pre-operacional**: va en la **apertura**, después del horómetro, como en
  Corrientes. Una vez por equipo y día: si el mismo equipo abre una segunda jornada el mismo
  día, el checklist no se repite. El cierre es solo la foto del horómetro final.
- **Horómetro inicial de cada equipo**: en el primer `sync_fuentes` se siembra `horom_tarja`
  desde `ULT HRKM` del snapshot de INGECOV y se marca `origen = INGECOV`. La primera apertura
  real no dispara la pregunta del umbral; a partir de ahí el valor es de la tarja.
- **Equipos sin tarja**: no hay aviso. En la pestaña Hoy del panel se ven como "Sin tarja", y
  los que llevan más de 7 días sin tarja pasan a un grupo "Sin actividad" para no ensuciar la
  grilla.
- **GPS denegado o sin señal de GPS**: la carga se acepta igual, con `lat/lon` vacíos y
  `precision_gps = sin GPS`; el panel lo marca y el equipo no se mueve en el mapa. Nunca se
  pierde una carga por el GPS.
- **Foto del monitor de cabina** (Corrientes): se saca. Solo fotos de horómetro y de fallas.
- **Destinatarios "Mantenimiento"** en App INGECO: quienes tengan el módulo TARJAS
  (`con_modulo: 'TARJAS'`). Marcos ajusta después quién lo tiene.
- **Volumen**: la hoja `TARJAS` se **particiona por año** (`TARJAS_2026`, `TARJAS_2027`…) y se
  mantiene una hoja chica `ABIERTAS` (una fila por jornada abierta) para que `estado`, `abrir` y
  `cerrar` no lean el histórico. El consolidado lee la hoja del año pedido.

## 8. Restricciones

- Celulares viejos, mala señal: sin frameworks, assets versionados `?v=N` en HTML y `sw.js`.
- Fechas como texto `@` en Sheets (`normalizarFecha_`).
- Sesiones del panel no van en `CacheService`.
- Nunca `clasp create-deployment` sobre el deployment estable.
- Paleta apta para daltonismo rojo-verde (azul/teal/ámbar), logos reales de INGECO, sin modo
  oscuro.
- Todo en español llano; los errores dicen qué pasó y qué hacer.

## 9. Despliegue e inserción

1. Repo `tarja-flota` desde Corrientes; `setup` crea planilla, carpeta y hojas; `sync_fuentes`
   trae equipos y nómina; Marcos revisa `activo_tarja` y `tipo_rodado` en el panel.
2. Módulo TARJAS en App INGECO + clave de avisos.
3. Piloto: una obra, 3 a 5 equipos, una semana. Se mira el consolidado y el mapa.
4. Despliegue al resto: un mensaje a cada operario con el link y una captura. La app lo guía.

## 10. Lo que queda al constructor

- Estructura exacta de `docs/` y del Apps Script (puede reorganizar el código de Corrientes).
- Diseño visual dentro de las restricciones (§8); íconos propios por pantalla.
- Detalle del algoritmo de inferencia de `tipo_rodado`.
- Formato del CSV del consolidado.
- Reglas de agrupación del selector cuando LUGAR está vacío.
