# Pendientes — BPA Plus

Verificado el **2026-10-03**. Estado completo: [ESTADO.md](ESTADO.md) · encargo:
[ENCARGO-CODEX-1.md](ENCARGO-CODEX-1.md). Esto es sólo lo que queda abierto.

## Estado hoy

- **03/11:** desplegado (Hosting y Worker) y commiteado en `feat/crear-diapositiva`: la app móvil,
  los avisos push y su refactor, y el cambio de `js/actas.js` (evaluaciones impresas sin pies de
  firma, `?v=48`), con el harness en OK y `CACHE` v78. Producción = el árbol. **Falta el push** a
  GitHub, y la rama no es `main`.
- Antes del 03/11: `main` pusheado y producción (`https://bpa-db.web.app/`) igual al árbol,
  desplegado el 03/10. GitHub Pages está desactivado.
- **Push no es despliegue.** Producción se publica aparte con
  `firebase deploy --only hosting --project bpa-db`, subiendo antes el `?v=` del archivo
  tocado en `index.html` y `sw.js`, y el `CACHE` de `sw.js`.
- El Worker de Cloudflare **ya está desplegado** y conectado en `workerUrl`, con KV y secreto.

## App móvil y avisos push (2026-11-03)

**Publicada en https://bpa-db.web.app/movil/** y Worker desplegado (`/avisos/sync`, `/push/subscribe`,
cron `0 13 * * *`, secreto `VAPID_PRIVATE_KEY`). Código en `movil-app/`, compilado en `movil/`
([ESTADO.md](ESTADO.md) § App móvil y § Avisos push). Verificado en producción hasta el acceso de
Firebase, sin errores.

1. **Subir a GitHub** (`git push`) y llevar la rama a `main` cuando corresponda.
2. **Probarla con tu sesión en el teléfono**: instalarla (Chrome › Instalar aplicación; iPhone:
   Compartir › Agregar a inicio), entrar, crear un acta, llenarla en modo avión y ver que llegue a la
   web al volver la señal.
3. **Activar los avisos** en el teléfono: Droguerías › «Activar avisos en este teléfono». Tiene que
   llegar «Avisos activados». Es la primera prueba real contra Apple/Google.
4. **Al cambiar `movil-app/`:** `npm --prefix movil-app run build` antes de `firebase deploy`.

## Pendiente

1. **Generar una evaluación real** con sesión iniciada: comprobar las 5 preguntas, el contador
   KV y el guardado en Firestore.
2. **Probar la subida a Drive de verdad.** El harness sustituye `subirArchivo`, así que la
   subida resumable, la creación de la carpeta y el permiso `drive.file` nunca se ejercitaron
   contra Google. Ojo: el Client ID existente **vuelve a pedir consentimiento** porque el scope
   cambió.
3. **Formatos propios por droguería** ([js/formatos.js](js/formatos.js)): la lectura del archivo
   en blanco está probada contra filas armadas a mano, no contra un XLSX ni un DOCX real. Cargar
   un formato real y ver cómo salen título, campos y columnas. El peor caso es tipear.
4. **Verificar en Chrome real**: (a) borrado y guardado sin conexión con sesión iniciada (modo
   avión) — cierra el reporte del 04/08; (b) el reconocimiento on-device (Chrome 138+ con el
   modelo ya descargado); (c) con sesión, que el arranque lea de la caché de Firestore y que
   `refresh` traiga lo del servidor (ver «Arranque y transiciones» en ESTADO.md).

## Contexto que no hay que reabrir

- **`bpa-db` se queda en el plan Spark** (decisión del 31/08). Eso descarta Cloud Functions y
  Cloud Storage; no volver a proponer Blaze.
- **Firebase Storage nunca funcionó acá**: en Spark, desde el 01/10/2025, no hay bucket. Por eso
  los archivos van al **Drive del usuario** (`js/drive.js`).
- El harness (`cd ../bpa-plus-test && timeout 240 node regression.js`, imprime `OK`) **vive fuera del repo**: sus
  aserciones no viajan con el código. Cada cambio no trivial debe dejar una aserción ahí.
