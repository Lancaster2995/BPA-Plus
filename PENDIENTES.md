# Pendientes — BPA Plus

Verificado el **2026-09-06**. Estado completo: [ESTADO.md](ESTADO.md) · encargo:
[ENCARGO-CODEX-1.md](ENCARGO-CODEX-1.md). Esto es sólo lo que queda abierto.

## Estado hoy

- `main` en `f409055` (06/09), árbol **limpio**, **1 commit sin pushear**. Producción
  `https://lancaster2995.github.io/BPA-Plus/` → 200.
- El trabajo del 04-05/09 sobre retiro de mercado —papelería por droguería (logo, sello del
  D.T., pie de página) y el caso de ejemplo pasado a `IMP-0004`— quedó commiteado el 06/09,
  con el harness en **6/6**.
- El Worker de Cloudflare **ya está desplegado** y conectado en `workerUrl`, con KV y secreto.

## Pendiente

1. **`git push origin main`** — y acá eso **es el despliegue**: GitHub Pages publica lo que
   entre en `main`, así que producción todavía no tiene la papelería por droguería.
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
