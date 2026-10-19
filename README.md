# Tarja de equipos — INGECO

Tarja diaria (horómetro con foto + checklist + GPS) para toda la flota pesada de INGECO.
PWA pública para operarios (sin login) + panel dentro de App INGECO (módulo `TARJAS`).
Nace del código de `tarja-corrientes`, que queda intacto.

- Diseño: `docs/superpowers/specs/2026-10-19-tarja-flota-design.md`
- Plan: `docs/superpowers/plans/2026-10-19-tarja-flota.md`

## URLs e IDs

- Operario (PWA): https://marcoskatz-cmd.github.io/tarja-flota/
- Panel: https://marcoskatz-cmd.github.io/tarja-flota/panel.html (solo desde App INGECO)
- Apps Script scriptId: `17bkv4zJcmo698zDg7chG3yWswpJ_zWVkN1MuvVepxuVBnkW72vxJhkUx`
- Deployment estable: `AKfycbydf1RDfDnIPZs2uZaiXyZ7uPsmw67gUbQ1C2-NRcZkmg9OO4ZMQe45AyMTc75k0nEv` (URL `/exec` en `.exec_url`)

## Arquitectura

Un Apps Script (API JSON por `doPost`, body `text/plain`) sobre una planilla propia `TARJA FLOTA — Base de datos`:

- `EQUIPOS` es **caché** de la LISTA DE EQUIPOS de INGECOV (solo pesados; `tipo_rodado` y `activo_tarja` se editan en el panel y el sync no los pisa).
- `PERSONAL` es caché de la hoja PERSONAL de Ropa INGECO.
- `TARJAS_<año>` (una hoja por año) + `ABIERTAS` (índice de jornadas abiertas) + `CHECKLIST_RESP`, `PENDIENTES`, `OPERADORES_MANUALES`, `CONFIG`, `LOG`.
- Horómetro inicial sembrado desde `SVC_PANELPROG` del snapshot de INGECOV. La tarja **nunca escribe en INGECOV**.

Front estático en `docs/` (GitHub Pages): `index.html` (operario, offline-first, cola en IndexedDB) y `panel.html` (guard.js bloqueante + Leaflet/OSM). `docs/reglas.js` es copia exacta de `apps-script/Reglas.gs` (`npm run reglas`).

## Tests y desarrollo local

```bash
npm test
```

Servidor de desarrollo con el backend corriendo en Node sobre planillas en memoria (API en `/api`, clave `dev`):

```bash
node scripts/dev-server.js 8123
```

## Deploy

Backend (nunca `clasp create-deployment`, nunca copy-paste al editor):

```bash
scripts/deploy.sh "v2 qué cambió"
```

Front: commit + push a `main`; Pages sirve `docs/`. Al tocar CSS/JS subir `?v=N` en `index.html`, `panel.html`, `ayuda.html` y `sw.js` (`CACHE` y `V`).

## Instalación (una sola vez)

1. Autorizar los permisos del script: abrir el editor, ejecutar cualquier función (p. ej. `instalarTriggers`) y aceptar.
2. `GET <exec>?action=setup` → crea planilla, carpeta de fotos y hojas; devuelve `bootstrap_key` (guardarla, es la clave de mantenimiento).
3. En la hoja `CONFIG`: cargar `SHEET_ROPA_ID` (Script Property `SHEET_ID` del proyecto de Ropa) y `SNAPSHOT_SHEET_ID` o `INGECOV_SNAPSHOT_URL`.
4. `GET <exec>?action=sync_fuentes&key=<clave>` → `?action=sembrar_horometros&key=` → `?action=instalar_triggers&key=`.
5. `?action=ping` debe decir `instalado:true`, `equipos > 0`, `personas > 0`.
6. App INGECO → Admin → Módulos → `TARJAS` (URL del panel, embebido) + permisos; clave `CLAVE_TARJAS` con `scripts/deploy_avisos.sh`.
7. Panel → Equipos: revisar `activo_tarja` y `tipo_rodado`.

## Mantenimiento (GET con `key`)

- `?action=diagnostico` · `?action=sync_fuentes` · `?action=sembrar_horometros` · `?action=instalar_triggers`
- `?action=borrar_tarja&equipo=CF-03&fecha=2026-10-19` (informa) y `&aplicar=si` (borra; solo datos de prueba)
- `?action=recalcular_horometros&aplicar=si`

## Si la LISTA DE EQUIPOS o la nómina cambian de columnas

El sync no toca la caché, deja el detalle en Diagnóstico y avisa a los admins por App INGECO una vez por día. La tarja sigue funcionando con la última lista buena. Arreglar los sinónimos en `apps-script/Fuentes.gs` (`leerListaEquipos_` / `syncPersonal_`) y redeployar.
