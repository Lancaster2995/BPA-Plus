# Encargo para Codex — Poner vivo el worker y probar Drive de verdad

La app está desplegada y funcionando. Faltan dos cosas, y las dos comparten la misma
característica: **nunca se han ejecutado contra el servicio real**, sólo contra sustitutos
en el harness.

Leé antes [ESTADO.md](ESTADO.md) entero. Este encargo lo asume.

Contexto que ahorra una hora: el proyecto de Firebase `bpa-db` está en el plan **Spark y
así se queda** — el usuario lo decidió el 31/08. Eso descarta Cloud Functions y Cloud
Storage, y es la razón de que el backend sea un worker de Cloudflare y de que los archivos
vayan al Drive del usuario. No propongas volver a Firebase: ya se evaluó y se descartó.

---

## Lo que ya está verificado — no lo repitas

Verificado el 31/08/2026 contra los servicios reales, no contra la intención:

- **Frontend en producción**: build de Pages `built` sobre el commit de esta rama,
  `https://lancaster2995.github.io/BPA-Plus/sw.js` sirve `bpa-plus-v13`,
  `js/config.js` responde 200 y `storage.rules` responde **404** (borrado).
- **Reglas de Firestore desplegadas**: `released rules firestore.rules to cloud.firestore`.
- **El bucket no existe y no va a existir**:
  `https://firebasestorage.googleapis.com/v0/b/bpa-db.firebasestorage.app/o` → **404**.
  Por eso la biblioteca de documentos no funcionó nunca en producción y **no hay nada que
  migrar**. Si encontrás código que todavía apunte a Storage, es un olvido, no un caso de uso.
- **El worker compila**: `npx wrangler deploy --dry-run` → **9,34 KiB (3,65 gzip)**, con
  `env.CUPO` reconocido como KV Namespace.
- **El harness pasa 6 de 6 corridas seguidas** (`cd ../bpa-plus-test && node regression.js`).
  Si te falla una vez, no es flakiness conocida: era `sleep(250)` en el panel de evaluación
  y se cambió por `hasta(...)` el 31/08. Un fallo ahora es un fallo de verdad.

---

## 1. El namespace KV

```bash
npx wrangler kv namespace create CUPO
```

Pegá el id que imprime en `worker/wrangler.toml`, reemplazando `PEGAR_ID_DE_KV`.

**No lo saltees pensando que es opcional.** Sin el binding el worker responde 500
(`Falta el namespace KV "CUPO"`) y no genera nada: es a propósito, un tope de gasto que
se desactiva solo no es un tope. El cupo es `LIMITE_DIARIO = 20` por usuario y día.

## 2. La API key — no la escribas vos

```bash
npx wrangler secret put ANTHROPIC_API_KEY
```

**Pedísela al usuario y que la escriba él en el prompt.** No la pongas en ningún archivo,
ni en `.dev.vars`, ni la pases por la línea de comandos (queda en el historial del shell).
Regla 5 del portafolio.

## 3. Desplegar

`git status` limpio antes de desplegar — regla 6 del portafolio.

```bash
npx wrangler deploy
```

Criterios de aceptación, con la URL que devuelva (`<W>`):

| Comprobación | Esperado |
|---|---|
| `curl -i -X POST <W>/generarEvaluacion` (sin `Authorization`) | **401**, cuerpo JSON `{"error":"Iniciá sesión para generar la evaluación."}` |
| `curl -i -X POST <W>/generarEvaluacion -H "Authorization: Bearer basura"` | **401** `La sesión no es válida.` |
| `curl -i -X POST <W>/loQueSea` | **404** `No existe esa función.` |
| `curl -i -X OPTIONS <W>/generarEvaluacion -H "Origin: https://lancaster2995.github.io"` | **204** con `Access-Control-Allow-Origin: https://lancaster2995.github.io` |
| `curl -i <W>/generarEvaluacion` (GET) | **405** |

Que el 401 llegue **antes** que cualquier queja de configuración es la parte que importa:
sin token nadie tiene por qué enterarse de cómo está armado el worker.

## 4. Conectar el frontend

Poné la URL del worker en `workerUrl` de [js/config.js](js/config.js) (hoy está vacío,
y con el vacío el botón avisa en vez de romperse). Commiteá, pusheá, y esperá el build de
Pages antes de dar nada por hecho:

```bash
gh api repos/Lancaster2995/BPA-Plus/pages/builds/latest --jq '.status, .commit'
```

Tiene que decir `built` sobre tu commit. **Subí `CACHE` en `sw.js` a `bpa-plus-v14`**: sin
eso los navegadores que ya instalaron la PWA siguen sirviendo el `config.js` viejo, con
`workerUrl` vacío, y el botón va a seguir avisando que falta configurarlo.

Después, en la app: capacitación → **Generar evaluación**. Aceptación:

- Salen **5 preguntas con 4 alternativas** cada una y la correcta marcada.
- `npx wrangler kv key list --binding CUPO` muestra `uso/<uid>` con `{"dia":"AAAA-MM-DD","n":1}`.
- La evaluación queda guardada: al cerrar y reabrir el panel dice *Generada el …* y el
  botón pasa a decir **Regenerar** (no se vuelve a pagar al abrir).

## 5. Drive: la parte que nunca corrió

Esto es lo que menos verificado está de todo el proyecto. El harness **sustituye
`drive.subirArchivo`**, así que la subida resumable, la creación de la carpeta y el permiso
`drive.file` no se ejercitaron nunca contra Google.

Hace falta Chrome con una cuenta de Google real. Si no podés, **decilo y pará acá** — no lo
des por bueno porque el código "se ve bien".

1. **Contá con que el consentimiento se pide de nuevo**: el scope cambió (antes sólo
   `drive.readonly`, ahora también `drive.file`). No es un error.
2. Cargá un PDF real en un documento de una droguería.
3. Aceptación:
   - Aparece una carpeta **`BPA-Plus`** en el Drive del usuario con el archivo adentro,
     nombrado con el estándar (`POE-ALM-001 v1.pdf`, no `llenado.pdf`).
   - El registro guardado tiene **`driveId`**, no `path`. Si ves `path`, quedó código viejo.
   - **Descargar** el archivo desde la app devuelve el mismo PDF.
   - Repetí con un archivo de **más de 5 MB**: ahí es donde `uploadType=multipart` habría
     fallado y por eso la subida es *resumable*. Un PDF de 6–10 MB alcanza.
4. Probá también **Formatos propios** (`formatos.js`): cargá un XLSX en blanco y bajalo con
   el botón de descarga de la ficha. Ese camino llamaba a `cloud.uploadFile` por su cuenta
   y se arregló el 31/08; si algo quedó mal, se rompe acá y no en los documentos.

## 6. Cerrar

- Actualizá [ESTADO.md](ESTADO.md): sacá de **Pendiente** lo que hayas cerrado y anotá lo
  que hayas encontrado. Sin diario de sesiones: git ya guarda el historial.
- Actualizá la fila y la sección 3.8 de `../../HANDOFF.md` (portafolio). Están al día al
  31/08, pero no incluyen el worker desplegado ni Drive verificado.
- Cada cambio no trivial deja su aserción en `../bpa-plus-test/regression.js`. Sin
  frameworks. Ojo: **el harness vive fuera del repo**, no viaja con el código.

---

## Lo que NO tenés que hacer

- **No subas a Blaze**, ni lo sugieras. Es una decisión tomada, no un obstáculo.
- **No vuelvas a meter `functions/`** ni `storage.rules`: se borraron a propósito.
- **No armes carpetas por droguería en Drive.** Es plano dentro de `BPA-Plus` a propósito:
  el nombre estándar ya identifica cada archivo y una jerarquía son llamadas de más.
- **No cambies `ORIGENES` del worker** salvo que cambie la URL de publicación.

## Referencia útil

`../../Organolepticos/worker/` ya corre en producción con **este mismo esquema** de
verificación de token de Firebase (JWKS + RS256 con WebCrypto, `aud`/`iss`/`exp`). Si algo
del token falla, comparalo con `src/worker.js` de ahí antes de reescribir nada. La única
diferencia deliberada: aquel filtra por `ALLOWED_UIDS` porque es de un solo usuario; acá
vale cualquier cuenta del proyecto `bpa-db`, y lo que contiene el gasto es el cupo en KV.
