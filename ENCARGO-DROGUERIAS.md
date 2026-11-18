# Encargo — Registrar varias droguerías en BPA Plus

Pedido del usuario (18/11/2026): «que se pueda registrar múltiples droguerías, actualmente solo
hay ITC».

**Estado:** ya está aplicado en el árbol de trabajo de `feat/crear-diapositiva`, **sin commit ni
despliegue**. Antes de tocar nada, mirar `git diff`: si los cambios de abajo ya están, solo queda
probarlos y publicarlos. Si se perdieron, este archivo alcanza para rehacerlos.

**18/11/2026 — probado** con clics y teclado a 1920 y 375 px (todo lo de «Cómo probarlo» salvo
Drive real) y harness `OK`. En la prueba salió un fallo: editar una droguería sin cambiar el nombre
le recalculaba las siglas (ITC → IT). Arreglado en `dgForm`: conserva `init` si el nombre no
cambió. Por eso `views.js?v=64` y `bpa-plus-v82`. **Publicado el 18/11 (`607eb47`).**

---

## El flujo (lo definió el usuario)

1. **Crear la droguería.**
2. Con esa droguería abierta, **«Escanear carpeta BPA»** de su cliente (la carpeta «BPA Plus» que
   prepara Sentinel, `sn=bpa`).
3. BPA Plus **ordena sus documentos**: POE, formatos, instructivos, etc.

El escaneo guarda en la **droguería activa a propósito**. No cambiarlo para que adivine la
droguería por el nombre del cliente: así lo quiere el usuario.

## Lo que ya existía y no hay que rehacer

La app ya permitía varias droguerías: todo (documentos, capacitaciones, inspecciones, actas,
retiros) cuelga de una droguería por el campo `e`, y existen `store.dg`, `setDg`, `deleteDg`
(`js/app.js`), y `dgSwitcher` y `dgForm` (`js/views.js`). La de ejemplo es ITC (`js/db.js` → `seed`).

**El problema era que no se veía.** En escritorio (≥ 921 px, la pantalla del usuario es de
≈ 1920 px) la barra lateral es un riel de 132 px y el botón `#dgSwitch` quedaba reducido al
logo de la app: sin nombre, sin ⌄, sin nada que dijera «droguería». El menú con
«Nueva droguería…» estaba ahí, pero nadie lo encontraba.

---

## Cambios

### 1. El riel muestra las siglas de la droguería con ⌄ — `js/app.js` → `renderChrome`

Agregar al botón `#dgSwitch` un `title` con el nombre y un `<span class="ws-dg">` con las siglas:

```js
'<button class="ws" id="dgSwitch" aria-label="Cambiar droguería" title="' + esc(dg.nombre) + ' · cambiar o agregar droguería"><img class="ws-logo" src="icons/icon-192.png?v=6" alt="">' +
  '<span class="ws-txt"><span class="ws-name">' + esc(dg.nombre) + '</span><span class="ws-ruc">' + (dg.ruc ? 'RUC ' + esc(dg.ruc) : 'Sin RUC') + '</span></span>' +
  '<span class="ws-dg">' + esc(dg.init || '?') + UI.icon('chevron', 14) + '</span></button>' +
```

`styles.css`: oculto por defecto (en el cajón del celular ya se ven nombre y RUC) y visible en el riel:

```css
.ws-dg { display: none; }

@media (min-width: 921px) {
  .ws { flex-direction: column; align-items: center; gap: 8px; margin-bottom: 14px; }  /* antes: justify-content: center */
  .ws-dg {
    display: flex; align-items: center; justify-content: center; gap: 3px; max-width: 100%; padding: 3px 8px 3px 10px;
    border: 1px solid rgba(255,255,255,.22); border-radius: 999px; font-size: 12px; font-weight: 700; letter-spacing: .04em; color: #FFFFFF;
  }
  .ws:hover .ws-dg { background: rgba(255,255,255,.1); }
}
```

### 2. «Nuevo» ofrece «Nueva droguería» — `js/app.js` → `quickNew`

Al final de la lista general (la del Panorama), después de «Simulacro de retiro»:

```js
{ sep: true },
{ label: 'Nueva droguería', icon: 'building', onClick: function () { V.open.dgForm(null); } }
```

### 3. Ctrl+K encuentra droguerías — `js/app.js` → `buildCmdIndex`

```js
idx.push({ type: 'Acción', name: 'Nueva droguería', run: function () { V.open.dgForm(null); } });
store.data.droguerias.forEach(function (e) { idx.push({ type: 'Droguería', name: e.nombre, run: function () { store.setDg(e.id); } }); });
```

### 4. Tras crear, el aviso ofrece escanear — `js/views.js` → `dgForm` y `js/app.js`

Exponer el escaneo, que vive en `app.js`:

```js
global.BPAPLUS.app = { boot: boot, driveImport: driveImport };
```

En el `.then` del guardado de `dgForm`, el aviso de alta lleva el botón (el de edición no):

```js
m.close(); store.renderChrome();
if (existing) UI.note('Droguería actualizada');
else UI.note('Droguería creada', { actionLabel: 'Escanear carpeta BPA', onAction: global.BPAPLUS.app.driveImport, duration: 10000 });
```

`store.setDg(obj.id)` ya corre antes, así que el panel de escaneo abre con la droguería nueva activa.

### 5. Versiones (si no, el service worker sirve lo viejo)

En `index.html` y `sw.js`: `styles.css?v=56`, `js/app.js?v=48`, `js/views.js?v=64`; en `sw.js`,
`CACHE = 'bpa-plus-v82'`. Si se publica algo antes que esto, subir un número más.

---

## Fuera de alcance

- **App móvil** (`movil-app`): ya lista y cambia droguerías (`HojaDroguerias`); crearlas sigue en
  la web, como todo lo administrativo.
- **Escaneo por cliente**: no tocar `importPanel`. Ver «El flujo».

---

## Cómo probarlo

La web pide cuenta de Firebase. Para probar sin la contraseña del usuario, servir el repo y
abrir una copia de `index.html` **sin** `js/cloud.js` ni `js/auth.js`: así `db.js` usa IndexedDB
y siembra ITC (lo mismo que hace `npm run demo` en `movil-app`). Se pide crear un PIN local.

Con clics y teclado reales:

- **A 1920 px**: el riel muestra «ITC ⌄» → clic → «Nueva droguería…» → Guardar vacío marca la
  razón social como obligatoria («Ingresá la razón social.») → escribir razón social y RUC → Guardar. Debe quedar activa, el riel con
  sus siglas y la droguería sin documentos. Volver a ITC: siguen sus 8 documentos.
- **El aviso**: sale «Droguería creada · Escanear carpeta BPA»; el botón abre «Escanear
  documentos BPA» con la droguería nueva activa. Al editar una droguería, el aviso no trae botón.
- **«Nuevo»** en Panorama → «Nueva droguería» abre el mismo formulario. **Ctrl+K** → escribir
  parte del nombre → Enter cambia a esa droguería.
- **A 375 px**: ☰ → tocar nombre y RUC arriba del cajón → «Nueva droguería…» → crear. Sin
  scroll horizontal; el aviso y su botón entran en pantalla.
- **Sin probar** (necesita la cuenta del usuario): elegir la carpeta del cliente en Drive e
  importar de verdad. Ese tramo no cambió.

### Harness

`cd ../bpa-plus-test && timeout 300 node regression.js` debe imprimir `OK` (el `timeout` corta
el proceso después; salida 124 con `OK` impreso es normal). Las aserciones de este encargo ya
están en `regression.js` (vive fuera del repo). Si hay que rehacerlas:

```js
// Después de click('#newBtn') en Panorama:
assert(qa('.picker-opt').some((o) => o.textContent.includes('Nueva droguería')), '«Nuevo» en Panorama ofrece nueva droguería');
assert.equal(q('#dgSwitch .ws-dg').textContent, 'ITC', 'el selector del riel muestra las siglas de la droguería activa');

// Después de crear «Droguería de prueba»:
assert.equal(q('#dgSwitch .ws-dg').textContent, 'DD', 'la droguería nueva queda activa y sus siglas en el riel');
const escanear = qa('.note .note-act').find((b) => b.textContent === 'Escanear carpeta BPA');
assert(escanear, 'al crear la droguería el aviso ofrece escanear su carpeta BPA');
click(escanear);
await sleep(30);
assert(q('#im_folder'), 'el botón del aviso abre el panel de escaneo');
click('.dialog [data-close]');
await sleep(30);

// Después de «Editar droguería actual» y guardar:
assert(!qa('.note .note-act').some((b) => b.textContent === 'Escanear carpeta BPA'), 'editar no ofrece escanear');
```

---

## Publicar

Solo cuando el usuario diga «publica». Commit en la rama actual y luego
`firebase deploy --only hosting --project bpa-db`, con la salida a un log del scratchpad. Después,
en `https://bpa-db.web.app`, comprobar que `sw.js` sirve `bpa-plus-v82` y que el riel muestra
las siglas. Actualizar `PENDIENTES.md` y la entrada «Droguerías de BPA Plus» de
`Desktop/Claude Core/MAPA.md` (quitar «sin publicar»).
