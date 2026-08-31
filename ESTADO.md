# Estado del proyecto — BPA-Plus

Qué hace y cómo se usa: [README.md](README.md). Este archivo es el estado para quien
continúe el trabajo (Claude Code, Codex o quien sea).

Repo privado: https://github.com/Lancaster2995/BPA-Plus (rama `main`).
El harness de regresión vive **fuera** del repo, en `../bpa-plus-test/`.

---

## Verificación

```bash
cd ../bpa-plus-test && node regression.js
```

Una sola corrida: arranque, PIN, las cuatro vistas, CRUD de droguería, comportamiento de
los diálogos, cronograma XLSX con meses fusionados y dedupe, y separación
plantilla/registro en la biblioteca. Sin frameworks; termina en `OK: …` o revienta.

Lo que el harness **no** puede ver: es jsdom con `fake-indexeddb`, así que no hay Firestore
ni red. Todo lo que dependa de la nube se prueba sustituyendo `BPAPLUS.cloud`, o se
comprueba leyendo el fuente (hay una aserción así, y dice por qué).

---

## Los tres problemas reportados en Chrome el 2026-08-04

El antiguo `../RESUME.md` los describía como abiertos. Contrastados con el código el
**2026-08-21**:

1. **No se podía eliminar una droguería.** La causa que se sospechaba —el diálogo de
   Editar seguía en el DOM ~200 ms mientras se abría el de confirmar— **ya no existe**:
   `dialog().close()` en [js/ui.js](js/ui.js) quita los nodos de forma síncrona; el
   `setTimeout(…, 220)` sólo quedó en `panel()` y `actionsheet()`, que no participan en
   este flujo. El harness lo cubre («solo un diálogo al confirmar» + la droguería
   desaparece).
2. **No se podía editar.** Nunca se reprodujo, y era la misma causa raíz. Cubierto por el
   harness.
3. **Importar cronograma desde Drive.** **Construido**: `analizarCronograma` /
   `analizarFilasCronograma` en [js/drive.js](js/drive.js), con su panel de revisión,
   encabezados flexibles (tema/curso, frecuencia/periodicidad, área/unidad), meses en
   celdas fusionadas y dedupe al reimportar.

También estaba pendiente el escaneo de Drive que sólo reconocía archivos que **empezaran**
con `POE`/`REGISTRO`/…: `codigoFromName` perdió el ancla `^` y ahora acepta el código en
cualquier parte del nombre, con abreviatura de área (`POE-ALM-001`).

---

## Arreglado el 2026-08-21 — el mismo síntoma, causa nueva

Con sesión iniciada, `DB.del`/`DB.put` no van a IndexedDB sino a **Firestore**, y una
escritura de Firestore **resuelve su promesa cuando el servidor la confirma**. Sin red la
promesa queda pendiente para siempre, aunque la caché persistente ya aplicó el cambio y lo
reenviará sola al reconectar. La app esperaba esa promesa antes de tocar su estado, así
que eliminar o guardar sin conexión **volvía a no hacer nada visible** — el síntoma
original, con otra causa, y uno que el harness jamás iba a reproducir porque ahí no hay
nube.

- [js/cloud.js](js/cloud.js): las escrituras (`put`, `del`, `clear`) se resuelven **al
  quedar encoladas**, no al confirmarlas el servidor. Un rechazo real (permisos, reglas)
  se avisa con una nota cuando llega. Es el único sitio por donde pasan todas.
- [js/app.js](js/app.js): `deleteDg` tenía un `Promise.all(...).then(...)` **sin `.catch`**,
  al revés que sus hermanos `save` y `remove`: un borrado rechazado se perdía en silencio.

Ambos con su aserción en el harness. **No está verificado en Chrome real con sesión
iniciada**: eso exige las credenciales de Firebase del usuario.

---

## Backend (2026-08-30) — `functions/`

Hasta acá la app no tenía servidor propio. Ahora tiene **uno solo**, y existe por una sola
razón: la clave de la API de Anthropic no puede vivir en el navegador. Todo lo demás
—Firestore, Storage, Drive, escaneo de documentos, reconocimiento on-device— sigue siendo
cliente puro.

[functions/index.js](functions/index.js) expone una única Cloud Function *callable*,
`generarEvaluacion`: recibe tema, área y (opcional) el texto del material, y devuelve 5
preguntas de alternativa múltiple. Se eligió *callable* y no `onRequest` porque trae gratis
la verificación del token de Firebase Auth y el CORS.

Tres cosas que no conviene aflojar:

- **La clave va en Secret Manager**, nunca en el repo ni en `config.js`:
  `firebase functions:secrets:set ANTHROPIC_API_KEY`.
- **Cupo diario por usuario** (`LIMITE_DIARIO = 20`) en `uso_ia/{uid}`, escrito por el
  Admin SDK dentro de una transacción. Las reglas de Firestore solo abren `users/{uid}`,
  así que el cliente no puede tocar su propio contador. A ~$0.08 por evaluación, el peor
  día posible de una sesión robada cuesta menos de dos dólares.
- **La salida está forzada por esquema** (`strict: true` + `tool_choice`), y además se
  valida en el servidor: si no llegan 5 preguntas con 4 opciones cada una, se rechaza en
  vez de guardar una evaluación a medias.

Modelo: `claude-opus-5` con `output_config.effort: 'low'`. La evaluación queda guardada en
la capacitación (`cap.evaluacion`), así que solo se paga cuando se pide *Regenerar*.

El harness cubre el contrato del cliente (qué se manda, qué se guarda, que la clave de
respuestas se marque) sustituyendo `cloud.callFn`. **Lo que no cubre**: la función en sí,
que necesita el secreto y despliegue real.

## Escaneo de documentos (2026-08-30)

El panel de revisión era una planilla de 8 inputs por fila dentro de un modal de 620 px —
con 46 documentos no se leía nada. Ahora es triage: fichas por documento, las dudosas
abiertas con el motivo escrito, las reconocidas plegadas bajo un `<details>`, y una línea
de procedencia por ficha ("código del nombre del archivo", "sugerido por el modelo local").

`analizarArchivo` sigue resolviendo con regex; donde falla entra la **Prompt API del
navegador** (Gemini Nano) con salida por esquema. Solo si el modelo ya está descargado —
nunca dispara la descarga. Sin Chrome compatible, todo funciona igual que antes.

---

## Sub-programa Autoinspecciones (2026-08-30) — `autoinspecciones/`

Página aparte (`autoinspecciones/index.html` + `main.js`) para llenar el acta de
inspección **fuera** de la app: sin cuenta, sin Firestore, sin PIN y sin IndexedDB.
Carga `js/domain.js`, `js/ui.js`, `js/formatos.js` y `js/actas.js`, nada más.

El único puente entre los dos es un archivo. `domain.formatoActa(dg, acta)` arma el
sobre `{app, tipo, v, drogueria, acta}` — sale vacío como *formato predeterminado* de
la droguería (con su checklist y su formato propio, si cargó uno) y vuelve con la misma
forma, ya llenado. `domain.leerActa(obj)` lo valida al entrar: es un límite de
confianza, así que descarta toda respuesta que no sea `si`/`no` antes de tocar nada.
En la app: Autoinspecciones → *Sub-programa* → Abrir / Formato / Cargar acta llenada.

Lo que se compartió en vez de duplicarse, porque duplicarlo rompía el puente:
`actas.itemsHtml` (la clave `seccion::índice` se genera en un solo lugar; si no, un
acta llenada afuera no encajaría al volver) y `domain.hallazgos` / `aplicarHallazgos`
(el recuento vivía copiado en `views.js` y en `actas.js`).

Lo que **no** hace: el sub-programa no sincroniza ni ve la base; el archivo se descarga
y se carga a mano. El borrador a medio llenar vive en `localStorage` de ese dispositivo.

## Pendiente

- **Verificación en Chrome real** del borrado y el guardado sin conexión (modo avión con
  sesión iniciada). Es lo único que cierra del todo el reporte del 04/08.
- **Formatos propios por droguería** ([js/formatos.js](js/formatos.js)): la lectura del
  archivo en blanco está probada contra filas armadas a mano, no contra un XLSX ni un DOCX
  real — el harness es jsdom sin red y las librerías (SheetJS, Mammoth, PDF.js) vienen de
  CDN. Falta cargar un formato real de una droguería y ver qué tan bien salen el título,
  los campos y las columnas. Lo que salga mal se corrige en el diálogo de configuración,
  así que el peor caso es tipear, no romperse.
- **Desplegar el backend**: `firebase deploy --only functions` tras cargar el secreto. Sin
  eso, el botón *Evaluación* falla con `internal`.
- **Verificar en Chrome real** el reconocimiento on-device (pide Chrome 138+ con el modelo
  ya descargado) y la evaluación contra la función desplegada.

## Reglas que no conviene romper

1. **Ninguna acción del usuario puede esperar al servidor para verse en pantalla.** La app
   es offline-first: Firestore ya garantiza que la escritura encolada llega.
2. **Un fallo se avisa.** `save`, `remove` y `deleteDg` reportan con `UI.note`; lo que se
   agregue al lado, también.
3. **Cada cambio no trivial deja una aserción en `regression.js`.** Sin frameworks.
4. El PIN local (SHA-256 salteado) es por dispositivo y nunca sale de él; la cuenta de
   Firebase es la que sincroniza.
