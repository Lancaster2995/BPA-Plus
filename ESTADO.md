# Estado del proyecto — BPA-Plus

Qué hace y cómo se usa: [README.md](README.md). Este archivo es el estado para quien
continúe el trabajo (Claude Code, Codex o quien sea).

Repo privado: https://github.com/Lancaster2995/BPA-Plus (rama `main`). GitHub Pages está
desactivado; producción se publica únicamente en https://bpa-db.web.app/ con Firebase Hosting.

El proyecto de Firebase (`bpa-db`) está en el plan **Spark** y así se queda: eso descarta
Cloud Functions y Cloud Storage, y es la razón de la forma que tiene el backend.
El harness de regresión vive **fuera** del repo, en `../bpa-plus-test/`.

---

## Verificación

```bash
cd ../bpa-plus-test && node regression.js
```

Una sola corrida: arranque, PIN, las cuatro vistas, CRUD de droguería, comportamiento de
los diálogos, cronograma XLSX con meses fusionados y dedupe, y separación
plantilla/registro en la biblioteca. Sin frameworks; imprime `OK: …` o revienta.

Ojo: después del `OK` el proceso **no termina solo** (algún timer de la app sigue vivo en
jsdom). No está colgado; `node regression.js | tail` espera para siempre. Correrlo sin pipe
o con `timeout 240 node regression.js` (sale con 124 después de haber impreso el `OK`).

**Si falla una vez, es un fallo de verdad.** El harness espera con `sleep` fijos, y el del
panel de evaluación (250 ms) perdía la carrera con la máquina cargada: fallaba 6 de 6 y
pasaba con 3000 ms. El 31/08 ese punto pasó a `hasta(cond)`, que espera a que la condición
se cumpla en vez de adivinar cuánto tarda. Los otros 30 `sleep` siguen ahí: si alguno
empieza a fallar de a ratos, es el mismo problema y se arregla igual.

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

**2026-09-28:** no leía los nombres que pone su propio `standardName`
(`POE-ALM-001_recepcion-de-productos_V01.pdf`, `FOR-ALM-012_20260928_….xlsx`): el `\b` final
fallaba porque el `_` es carácter de palabra. Los bordes pasaron a
`(?<![A-Za-z0-9])` / `(?![A-Za-z0-9])` —solo el `_` cambia de lado—, así que
«Manual de usuario 2019.pdf» sigue sin dar código. Aserciones en el harness, incluida la
vuelta completa `codigoFromName(standardName(…))`.

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

## Backend (2026-08-31) — `worker/`, no `functions/`

Hasta acá la app no tenía servidor propio. Ahora tiene **uno solo**, y existe por una sola
razón: la clave de la API de Anthropic no puede vivir en el navegador. Todo lo demás
—Firestore, Drive, escaneo de documentos, reconocimiento on-device— sigue siendo cliente
puro.

Empezó siendo una Cloud Function *callable* y **no llegó a desplegarse nunca**: Cloud
Functions exige el plan Blaze de Firebase. Se mudó a **Cloudflare Workers**, cuyo plan
gratuito no pide tarjeta (100k pedidos por día, uso comercial permitido).

[worker/index.js](worker/index.js) expone `POST /generarEvaluacion`: recibe tema, área y
(opcional) el texto del material, y devuelve 5 preguntas de alternativa múltiple.

Lo que costó la mudanza, y es lo único delicado del archivo: **un callable verificaba el
token de sesión gratis; el worker lo verifica a mano**. `verificarToken` baja las claves
públicas de Google (JWKS, cacheadas según su propio `max-age`), valida la firma RS256 con
WebCrypto y exige `aud`, `iss` y `exp`. Eso es todo lo que separa la clave de Anthropic de
cualquiera que tenga la URL, así que ahí no se afloja nada.

Tres cosas más que no conviene aflojar:

- **La clave va en los secretos de Cloudflare**, nunca en el repo:
  `npx wrangler secret put ANTHROPIC_API_KEY`.
- **Cupo diario por usuario** (`LIMITE_DIARIO = 20`) en KV. A ~$0.08 por evaluación, el
  peor día posible de una sesión robada cuesta menos de dos dólares. Si falta el namespace
  KV el worker **falla**: un tope de gasto que se desactiva solo no es un tope.
- **La salida está forzada por esquema** (`strict: true` + `tool_choice`), y además se
  valida en el servidor: si no llegan 5 preguntas con 4 opciones cada una, se rechaza en
  vez de guardar una evaluación a medias.

Modelo: `claude-opus-5` con `output_config.effort: 'low'`. Se llama con `fetch` y no con el
SDK: una sola llamada no justifica empaquetar una dependencia en el worker. La evaluación
queda guardada en la capacitación (`cap.evaluacion`), así que solo se paga al *Regenerar*.

El harness cubre el contrato del cliente (qué se manda, qué se guarda, que la clave de
respuestas se marque) sustituyendo `cloud.callFn`, y lee el fuente del worker para las
cuatro cosas que no puede ejecutar (firma, `aud`/`iss`/`exp`, cupo sin KV, clave desde el
entorno). El **01/09** se verificó el Worker real: KV y `ANTHROPIC_API_KEY` están
configurados y sus cinco respuestas de entrada (401 sin token, 401 con token inválido,
404, OPTIONS/CORS 204 y GET 405) cumplen el contrato. Falta una generación con una sesión
real para comprobar la respuesta de Anthropic, el contador KV y el guardado en Firestore.

## Archivos: del bucket al Drive del usuario (2026-08-31)

Firebase Storage quedó fuera de alcance por lo mismo: desde el **01/10/2025** un proyecto
en Spark no accede a **ningún** bucket, ni siquiera a los que ya existían. En `bpa-db` el
bucket nunca llegó a crearse, así que la biblioteca de documentos no funcionó nunca en
producción y **no hay nada que migrar** — es la única razón por la que este cambio sale
gratis.

Los archivos ahora van al Drive de la droguería, que es de donde salieron. `drive.js` ya
tenía el OAuth y la lectura; se le agregó `drive.file` al scope (el angosto: solo ve lo que
la app creó), una carpeta `BPA-Plus` y una subida *resumable* en un solo PUT —
`uploadType=multipart` corta en 5 MB y acá se admiten 25.

`cloud.uploadFile` y `cloud.fileBlob` desaparecieron, y con ellos `storage.rules`. El
límite de 25 MB y los tipos permitidos que vivían en esas reglas ya estaban validados en
el cliente en los tres puntos de carga; ahora el destino es el Drive del propio usuario,
así que dejaron de ser un límite de confianza y pasaron a ser lo que siempre aparentaron
ser en pantalla: un aviso.

`drive.subirArchivo` es el **único punto de subida**, y se llega a él por el export
(`BPAPLUS.drive`) incluso desde adentro de `drive.js`. No es ceremonia: `formatos.js`
llamaba a `cloud.uploadFile` por su cuenta y se habría quedado subiendo a un bucket
inexistente mientras `downloadStored` buscaba en Drive.

## Escaneo de documentos (2026-08-30)

El panel de revisión era una planilla de 8 inputs por fila dentro de un modal de 620 px —
con 46 documentos no se leía nada. Ahora es triage: fichas por documento, las dudosas
abiertas con el motivo escrito, las reconocidas plegadas bajo un `<details>`, y una línea
de procedencia por ficha ("código del nombre del archivo", "sugerido por el modelo local").

`analizarArchivo` sigue resolviendo con regex; donde falla entra la **Prompt API del
navegador** (Gemini Nano) con salida por esquema. Solo si el modelo ya está descargado —
nunca dispara la descarga. Sin Chrome compatible, todo funciona igual que antes.

**2026-10-02 — siglas propias.** El escaneo solo aceptaba códigos con POE/FOR/REG/INS/MAN…
y obligaba a recodificar como `POE-…` un `PG-ALM-001`. Ahora un código es *siglas y número*
(`isStandardCode` ya no tiene lista de prefijos) y lo que significa cada sigla vive en la
droguería: `dg.siglas = { PG: { s: 'Programa', k: 'tipo' }, DT: { s: 'Dirección Técnica', k: 'area' } }`,
encima de `SIGLAS_BASE` en [js/drive.js](js/drive.js). Si el lote trae siglas que nadie
definió, antes de la revisión aparece `siglasPanel`: significado (sugerido por los nombres
de los documentos) y si es categoría o área. Una sigla de tipo que ningún criterio nombra se
agrega como criterio. Se ven y corrigen en *Criterios de clasificación*, y el detalle de cada
documento muestra qué dice su código.

Lo que no conviene aflojar: una sigla desconocida solo se toma como código si va en
mayúsculas y unida con `-`/`_` (`CODIGO_LIBRE`), y sin área necesita un número de código
(`001`, no `19` ni `2019`): así «COVID-19», «DS-014-2011» o «Manual de usuario 2019» siguen
sin dar código. Cambiar el significado de una sigla **no** reescribe los documentos ya
guardados: solo afecta a los próximos escaneos.

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

## Retiro de mercado (2026-09-04) — `js/retiro.js`

Un simulacro es **un registro** (`retiros`) del que salen **diez documentos**: carta del
fabricante, carta de inmovilización y respuesta por cada destinatario, orden de retiro
(Registro 009) por cada uno, conciliación (Registro 010), comunicación a DIGEMID y
revisión de la eficacia (Registro 011). Con dos destinatarios —un almacén y un cliente—
son exactamente los diez del expediente en papel que se tomó como modelo.

Todo el módulo entra por un archivo. Lo que se tocó afuera es cableado y una sola cosa
que no lo es: `actas.js` ahora **exporta `membrete` y `print`**, porque duplicar el
membrete era garantizar que las hojas del expediente y las actas se separaran solas.

Dos decisiones que no conviene aflojar:

- **Nada se tipea dos veces.** En los formatos llenados a mano la cantidad se escribe en
  la orden de retiro y otra vez en la conciliación, y no coinciden (en el expediente que
  sirvió de modelo, tampoco). Acá la recuperada es el stock declarado, la consumida es
  `entregada − stock`, y el N° de carta y de orden salen de la posición del destinatario:
  un solo lugar cada uno. El harness lo prueba subiendo el stock y mirando las dos hojas.
- **Un simulacro dice que lo es en los diez documentos**, en el título, no solo en el
  asunto. Una comunicación a DIGEMID de un simulacro que no lo diga es un problema, no
  un detalle de formato. Se apaga con el check «Es un simulacro» del formulario, que es
  lo que convierte el mismo registro en un retiro real.

La papelería sale de la droguería, no del código: **logo** del membrete (data URI, así se
imprime sin conexión y viaja con ella), **sello del D.T.** (nombre, cargo y colegiatura) y
**pie de página** (dirección, teléfono, correo, web). Todo se carga desde el formulario de
droguería. El sello reemplaza la línea de firma en las seis hojas donde antes decía
«Director Técnico»; donde firma otro —el fabricante, el destinatario, el representante
legal— sigue siendo una línea. De paso, el membrete tenía una `V` escrita a mano que salía
en el encabezado de cualquier droguería: ahora, sin logo, cae en su inicial.

Los datos de ejemplo (`retiro.ejemplo`, sembrados en `db.ensureSeed`) son reales de punta a
punta: la droguería del seed pasó a ser **ITC** (INTELLIGENCE TECHNOLOGY COMPANY S.A.C.,
RUC 20608966405) y el caso sale de la ficha exportada de **`IMP-0004`** en LogisticS —
proveedor AMPRONIX, monitor médico LG `32HR734S`, serie `409NTHMB2561`, RS `CRS_DB9783E`,
invoice `462079`, guía `T001-27673`, ingreso del 26/08/2026 y salida del 27/08. La causa del
retiro no está inventada: es el evento que trae su propio kardex, la revisión organoléptica
del 01/09 que devolvió el lote a cuarentena.

Esa importación destapó un error de modelo: sumar la columna «entregada» de la conciliación
cuenta **dos veces la misma unidad** —el almacén la recibió por la importación y el cliente
la recibió del almacén—, y la carta a DIGEMID decía «1 de 2». Lo distribuido ahora es un
campo (`distribuida`, las unidades de la importación) y el pie de la conciliación es el del
formato: subtotal de clientes, stock inmovilizado en el almacén, total recuperado.

**2026-10-02 — archivos cargados a mano.** En el panel del simulacro, cada hoja del
expediente tiene un botón para cargar su versión firmada o escaneada (PDF, Word, Excel,
JPG o PNG, < 25 MB), y hay una sección «Otros archivos» para guías, fotos o el acta de
destrucción. Suben por `drive.subirArchivo` y el registro guarda `archivos: [{doc, …meta}]`,
donde `doc` es la `key` del documento (`fab`, `inm-0`, `resp-1`, `conc`…); la de los
destinatarios va por posición, igual que su N° de carta. Si se quita un destinatario, sus
archivos no se esconden: caen en «Otros». «Quitar» solo saca la referencia; el archivo sigue
en Drive. Como el resto de las subidas, no está probado contra Google de verdad.

El formulario ahora ofrece **Traer de LogisticS**. Abre la app, empareja la droguería por
RUC, sigla o razón social normalizada y deja elegir un lote; completa producto, fabricante,
importación, factura, stock y clientes despachados. El intercambio ocurre entre pestañas,
solo en memoria, y LogisticS responde exclusivamente al origen `https://bpa-db.web.app`.

## Scroll y fluidez (2026-09-29)

Reporte: «el scroll con la rueda no funciona, la navegación se siente lenta y floja». El render
en JS mide ~1 ms por vista; lo lento eran los efectos, no el cálculo:

- `.content > *` tenía una animación de entrada de 320 ms que se repetía en **cada** render
  (filtro, tecla del buscador, guardado), no solo al navegar. Quitada.
- `.row`/`.stat`/botones se levantaban con `transform` al pasar el mouse: al hacer scroll con la
  rueda, cada fila bajo el cursor saltaba. Quedan borde y sombra, sin movimiento.
- `.bell-badge` se posicionaba contra la barra superior (a `.icon-btn` le faltaba
  `position: relative`) y desbordaba 4 px en horizontal por debajo de 920 px.
- `overscroll-behavior: contain` en barra lateral, diálogos, paneles y menús: al llegar al final
  ya no arrastran la página de atrás.
- `lock.js` ya no pone `overflow: hidden` en el body (era el único código capaz de dejar la
  página sin scroll) y no arranca la app dos veces si el mismo PIN se valida dos veces.

En local (sin nube) el scroll con rueda ya funcionaba antes del cambio: **no se reprodujo la
falla total**. Si persiste en producción, falta saber en qué pantalla.

Latente, sin tocar: si la sesión de Firebase se cierra y se vuelve a abrir sin recargar,
`auth.js` pone `started = false` y `start()` corre otra vez (listeners duplicados).

## Rediseño de la interfaz (2026-09-29)

Aprobado a partir de un lienzo con tres pantallas (escritorio Inicio y Documentos, móvil). Lo que
cambió y dónde:

- **Estructura** ([js/app.js](js/app.js) `renderChrome`): barra lateral clara agrupada
  (Cumplimiento / Almacén / Herramientas) con buscador Ctrl K arriba y, abajo, el estado de
  conexión y «Mi cuenta» (tema, PIN, respaldo, salir). Los ocho botones sueltos del pie se fueron
  a ese menú y al buscador. El contenido va en un panel blanco con la ruta arriba.
- **«Nuevo»** en la barra superior reemplaza al botón flotante (`#fab` → `#newBtn`), que tapaba el
  final de las listas. En escritorio solo aparece en Inicio; en móvil, en todas las vistas, y ahí
  se oculta el botón de alta de cada vista porque hace lo mismo.
- **Móvil**: la barra inferior sigue con cinco destinos; Retiro, Información del almacén y
  Documentos de inspección pasan al menú «Más».
- **Menús** ([js/ui.js](js/ui.js) `actionsheet(options, anchor)`): con `anchor`, en escritorio es
  un menú flotante junto al botón; en el celular sigue siendo la hoja inferior. Acepta `{sep:true}`.
- **Inicio** ([js/views.js](js/views.js) `vDashboard`): anillo de cumplimiento con un medidor por
  módulo, «Requiere atención» (vencidos, atrasadas y hallazgos, cada uno con su botón) y próximos
  vencimientos. Reemplaza al faro + tarjetas + línea de tiempo, que repetían las mismas cifras.
- **Estilo** ([styles.css](styles.css)): Geist / Geist Mono, navy para la acción principal
  (dorado en modo oscuro), estados como píldoras, filtros como control segmentado, listas como
  una sola superficie con filas.

El documento sigue siendo el que hace scroll: no se agregaron contenedores con scroll propio.

**Vista dividida de Documentos** ([js/views.js](js/views.js)): desde 1200 px de ancho, abrir un
documento lo muestra en una columna a la derecha que queda fija bajo la barra superior mientras
la lista hace scroll; la fila abierta queda marcada y Escape o la X cierran la columna. Por
debajo de 1200 px abre el panel lateral de siempre. El detalle es uno solo (`docDetailHtml` +
`docDetailClick`) montado en uno u otro contenedor. `V.panels.docPanel` ahora es `abrirDoc`:
desde Inicio, alertas o el buscador lleva a Documentos con ese documento seleccionado
(`store.state.selDoc`, que se limpia al cambiar de droguería). En la columna, editar o cargar un
archivo no la cierra: el render del guardado la muestra actualizada. Las filas de documento
ahora se enfocan con Tab y se abren con Enter.

## Pendiente

Lo que queda está encargado en **[ENCARGO-CODEX-1.md](ENCARGO-CODEX-1.md)**, con criterios
de aceptación sobre valores reales. Lo de abajo es el resumen.

- **Verificación en Chrome real** del borrado y el guardado sin conexión (modo avión con
  sesión iniciada). Es lo único que cierra del todo el reporte del 04/08.
- **Formatos propios por droguería** ([js/formatos.js](js/formatos.js)): la lectura del
  archivo en blanco está probada contra filas armadas a mano, no contra un XLSX ni un DOCX
  real — el harness es jsdom sin red y las librerías (SheetJS, Mammoth, PDF.js) vienen de
  CDN. Falta cargar un formato real de una droguería y ver qué tan bien salen el título,
  los campos y las columnas. Lo que salga mal se corrige en el diálogo de configuración,
  así que el peor caso es tipear, no romperse.
- **Generar una evaluación real** con sesión iniciada: el Worker ya está desplegado,
  conectado en `workerUrl`, con KV y secreto configurados. Falta comprobar las 5 preguntas,
  el contador KV y el guardado en Firestore.
- **Probar la subida a Drive de verdad.** El harness sustituye `subirArchivo`: la subida
  resumable, la creación de la carpeta y el permiso `drive.file` nunca se ejercitaron
  contra Google. Ojo con un detalle: el Client ID de OAuth existente pide consentimiento
  otra vez, porque el scope cambió.
- **Verificar en Chrome real** el reconocimiento on-device (pide Chrome 138+ con el modelo
  ya descargado).

## Reglas que no conviene romper

1. **Ninguna acción del usuario puede esperar al servidor para verse en pantalla.** La app
   es offline-first: Firestore ya garantiza que la escritura encolada llega.
2. **Un fallo se avisa.** `save`, `remove` y `deleteDg` reportan con `UI.note`; lo que se
   agregue al lado, también.
3. **Cada cambio no trivial deja una aserción en `regression.js`.** Sin frameworks.
4. El PIN local (SHA-256 salteado) es por dispositivo y nunca sale de él; la cuenta de
   Firebase es la que sincroniza.
