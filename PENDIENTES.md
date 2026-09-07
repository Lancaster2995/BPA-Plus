# Pendientes — BPA Plus

Verificado el **2026-09-06**. Estado completo: [ESTADO.md](ESTADO.md) · encargo:
[ENCARGO-CODEX-1.md](ENCARGO-CODEX-1.md). Esto es sólo lo que queda abierto.

## Estado hoy

- `main` en `e868422` (05/09), pusheado. Producción
  `https://lancaster2995.github.io/BPA-Plus/` → 200 (push a `main` **es** el despliegue).
- **Árbol sucio: 6 archivos, ~145 líneas sin commitear** — `js/retiro.js`, `js/views.js`,
  `js/db.js`, `js/actas.js`, `styles.css` y `ESTADO.md`. Es el trabajo del 04-05/09 sobre
  retiro de mercado: papelería por droguería (logo, sello del D.T., pie de página) y el
  cambio del caso de ejemplo a `IMP-0004`. **`ESTADO.md` ya lo describe, también sin commitear.**
- El Worker de Cloudflare **ya está desplegado** y conectado en `workerUrl`, con KV y secreto.

## Pendiente

1. **Commitear el trabajo del árbol** antes de tocar nada más. Está terminado y documentado;
   sólo le falta el commit. Un agente que empiece encima se pisa con esto.
2. **Generar una evaluación real** con sesión iniciada: comprobar las 5 preguntas, el contador
   KV y el guardado en Firestore.
3. **Probar la subida a Drive de verdad.** El harness sustituye `subirArchivo`, así que la
   subida resumable, la creación de la carpeta y el permiso `drive.file` nunca se ejercitaron
   contra Google. Ojo: el Client ID existente **vuelve a pedir consentimiento** porque el scope
   cambió.
4. **Formatos propios por droguería** ([js/formatos.js](js/formatos.js)): la lectura del archivo
   en blanco está probada contra filas armadas a mano, no contra un XLSX ni un DOCX real. Cargar
   un formato real y ver cómo salen título, campos y columnas. El peor caso es tipear.
5. **Verificar en Chrome real**: (a) borrado y guardado sin conexión con sesión iniciada (modo
   avión) — cierra el reporte del 04/08; (b) el reconocimiento on-device (Chrome 138+ con el
   modelo ya descargado).

## Contexto que no hay que reabrir

- **`bpa-db` se queda en el plan Spark** (decisión del 31/08). Eso descarta Cloud Functions y
  Cloud Storage; no volver a proponer Blaze.
- **Firebase Storage nunca funcionó acá**: en Spark, desde el 01/10/2025, no hay bucket. Por eso
  los archivos van al **Drive del usuario** (`js/drive.js`).
- El harness (`cd ../bpa-plus-test && node regression.js`, 6/6) **vive fuera del repo**: sus
  aserciones no viajan con el código. Cada cambio no trivial debe dejar una aserción ahí.
