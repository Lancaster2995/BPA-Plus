# BPA-Plus — Gestión de Buenas Prácticas de Almacenamiento

Aplicación personal para llevar el control de documentos, capacitaciones y
autoinspecciones bajo Buenas Prácticas de Almacenamiento (BPA) en una o
varias droguerías. Pensada para una sola persona: vos.

**100 % local. Sin cuentas, sin backend, sin nube.** Todo se guarda en el
navegador del dispositivo donde la uses (con IndexedDB). Funciona sin
conexión una vez instalada.

## Qué hace

- **Panorama** — puntaje de cumplimiento (el "faro"), vencimientos próximos
  e indicadores clave de un vistazo.
- **Documentos** — POE, formatos, instructivos, registros y manuales, con
  código, versión, área y fecha de próxima revisión. El estado
  (vigente / por vencer / vencido) se calcula solo. Se agrupan por criterio
  de clasificación, editable por droguería.
- **Capacitaciones** — cronograma anual con participantes, estado
  pendiente / realizada / vencida, y acta de asistencia imprimible.
- **Autoinspecciones** — cronograma, registro de resultados y hallazgos, y
  actas de inspección con el checklist oficial **REGISTRO_004 (DIGEMID)**:
  15 secciones, 291 ítems, cada uno con su severidad (crítico / mayor /
  menor / informativo) tal como en el formato original, respuesta Sí/No
  con observación, y acta imprimible o exportable a PDF desde el diálogo
  de impresión del navegador.
- **Varias droguerías** — cambiá entre ellas desde la barra lateral; cada
  una tiene sus propios documentos, capacitaciones e inspecciones.
- **Buscador de comandos** — `Ctrl K` (o `⌘K`) para saltar a cualquier
  vista o documento sin usar el mouse.
- **Alertas de todas las droguerías** — la campanita en la barra lateral
  (o arriba en el celular) junta lo que vence en los próximos 30 días de
  **todas** las droguerías a la vez, no solo la que tenés abierta, para
  que no se te pase nada por estar mirando otro cliente.
- **Google Drive** — importá documentos directo desde tu Drive (recorre
  subcarpetas, lee el código, tipo y fecha de revisión del archivo cuando
  puede, y fusiona automáticamente el mismo código si aparece repetido en
  carpetas distintas) o vinculá un documento existente a su archivo
  original para abrirlo con un clic. Ver la sección de abajo para conectarlo.
- **Inicio de sesión con PIN** — en la primera apertura se crea y confirma
  un PIN de 4 a 6 dígitos; luego se pide al abrir la app. El PIN (salteado y
  con hash SHA-256) vive solo en este dispositivo. Se cambia desde la barra
  lateral y “Cerrar sesión” vuelve a bloquear la app.
- **Tema claro / oscuro**, atajos de teclado, deshacer al eliminar.

## Cómo usarla

No requiere instalación ni servidor para probarla:

- **Rápido:** abrí `index.html` directamente en el navegador.
- **Como app instalada (recomendado):** serví la carpeta por HTTP y
  agregala a la pantalla de inicio (Android) o instalala desde la barra de
  direcciones (Windows/Chrome/Edge). Servida por HTTP se activa el
  *service worker* y la app queda disponible sin conexión.

  ```bash
  python3 -m http.server 8080
  # abrí http://localhost:8080
  ```

### Ponerla en línea gratis (para usarla desde el celular)

Como es una aplicación 100 % estática (sin backend), cualquier hosting
gratuito de archivos estáticos alcanza. Subís la carpeta y listo:

- **GitHub Pages** — subí la carpeta a un repositorio y activá Pages en
  la configuración del repo.
- **Cloudflare Pages** / **Netlify** / **Vercel** — arrastrá la carpeta al
  panel de "Deploy" de cualquiera de los tres (todos tienen plan gratuito).

Una vez publicada, instalala como app — te queda un ícono en la pantalla
de inicio, abre sin la barra de Chrome, funciona sin conexión, y a
diferencia de un APK envuelto, el login de Google Drive funciona sin
problema porque por dentro sigue siendo Chrome real.

**En el celular (Android + Chrome):**
1. Abrí la URL publicada en Chrome.
2. Tocá los tres puntos (⋮) arriba a la derecha.
3. Tocá **"Instalar aplicación"** (o "Agregar a pantalla de inicio").
4. Confirmá. Queda un ícono de BPA-Plus como cualquier otra app.

**En la laptop (Windows + Chrome o Edge):**
1. Abrí la URL publicada.
2. En la barra de direcciones aparece un ícono de instalar (⊕ o pantalla
   con flecha) — hacé clic.
3. "Instalar". Queda como programa en el menú de inicio, en su propia
   ventana.

Como no hay backend ni autenticación, cualquiera con el enlace podría
abrirla — al ser una URL que solo vos conocés, alcanza para uso personal.
El acceso con PIN protege los datos en cada dispositivo. No es una cuenta
en línea: los datos siguen siendo locales y no se sincronizan entre equipos.

## Conectar Google Drive

La app se conecta directo a tu cuenta desde el navegador — no hay servidor
propio en el medio, así que necesitás tu propio "Client ID" de OAuth
(gratis, se crea una sola vez).

> Esto funciona instalando BPA-Plus como PWA (ver arriba). Un APK nativo que
> envuelva la página en un WebView **no** puede usar este login — Google
> bloquea el inicio de sesión dentro de WebViews embebidos por seguridad.
> Por eso la app se instala como PWA y no como APK.

1. Andá a [Google Cloud Console](https://console.cloud.google.com/) y
   creá un proyecto nuevo (o usá uno que ya tengas).
2. **APIs y servicios → Biblioteca** → buscá "Google Drive API" → **Habilitar**.
3. **APIs y servicios → Pantalla de consentimiento OAuth** → tipo
   "Externo" → completá nombre de la app y tu correo → en "Usuarios de
   prueba" agregá tu propia cuenta de Gmail (así solo vos podés conectarte).
4. **APIs y servicios → Credenciales → Crear credenciales → ID de cliente
   de OAuth** → tipo "Aplicación web" → en "Orígenes de JavaScript
   autorizados" agregá la URL donde publicaste la app (por ejemplo
   `https://tuusuario.github.io`) — y `http://localhost:8080` si la
   probás en tu máquina.
5. Copiá el Client ID (termina en `.apps.googleusercontent.com`) y pegalo
   en la app cuando te lo pida, la primera vez que uses "Importar de
   Google Drive" o "Vincular a Google Drive".

El token de acceso vive solo en la memoria de la pestaña — se pierde al
cerrarla y no se guarda en ningún lado; solo el Client ID (que no es
secreto) queda guardado en este dispositivo para no tener que pegarlo
cada vez.

## Datos y respaldo

Los datos viven únicamente en el dispositivo (IndexedDB). La primera vez
se cargan datos de ejemplo para explorar la app; borralos y cargá los
tuyos cuando quieras.

- **Exportar respaldo** — genera un `.json` con toda la información.
- **Importar respaldo** — reemplaza los datos actuales por los del archivo.

Usá el respaldo para mover la información entre el celular y la laptop, o
como copia de seguridad — no hay sincronización automática entre
dispositivos porque no hay servidor.

## Estructura

```
BPA-Plus/
├─ index.html            Shell de la app
├─ styles.css             Sistema de diseño (tokens, claro/oscuro, impresión)
├─ manifest.json          Manifiesto PWA
├─ sw.js                  Service worker (cache-first, offline)
├─ icons/                 Iconos de la app
└─ js/
   ├─ domain.js           Lógica de negocio pura (estados, fechas, clasificación, puntaje)
   ├─ db.js               Persistencia IndexedDB + datos de ejemplo + exportar/importar
   ├─ ui.js                Componentes (notas, diálogos, panel, hoja de acciones, buscador)
   ├─ actas.js             Generación de actas imprimibles
   ├─ views.js             Vistas y formularios
   └─ app.js               Estado, enrutado, chrome, arranque
```

Los scripts se cargan con `<script>` clásicos (sin módulos ES), así que
funciona igual abriendo el archivo local o servida como PWA.

## Privacidad

Por defecto no se envía información a ningún servidor: solo carga las
tipografías (Google Fonts) la primera vez que abrís la app con conexión.

Si activás **Google Drive**, la app habla directo con la API de Google
desde tu navegador (nunca pasa por un servidor de BPA-Plus, porque no
existe uno) para leer los archivos que elijas, y carga dos librerías de
lectura (mammoth.js y SheetJS) desde CDN la primera vez que las necesita.
El token de acceso vive solo en la memoria de la pestaña.
