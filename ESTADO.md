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

## Pendiente

- **Verificación en Chrome real** del borrado y el guardado sin conexión (modo avión con
  sesión iniciada). Es lo único que cierra del todo el reporte del 04/08.
- `icons/options/*.png` (7 archivos) siguen sin trackear: son las variantes que se
  descartaron al elegir el icono. Commitearlas o borrarlas, pero no dejarlas ahí.
- El proyecto lleva sin tocarse desde el 2026-08-10; es el más frío del portafolio.

## Reglas que no conviene romper

1. **Ninguna acción del usuario puede esperar al servidor para verse en pantalla.** La app
   es offline-first: Firestore ya garantiza que la escritura encolada llega.
2. **Un fallo se avisa.** `save`, `remove` y `deleteDg` reportan con `UI.note`; lo que se
   agregue al lado, también.
3. **Cada cambio no trivial deja una aserción en `regression.js`.** Sin frameworks.
4. El PIN local (SHA-256 salteado) es por dispositivo y nunca sale de él; la cuenta de
   Firebase es la que sincroniza.
