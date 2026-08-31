# BPA-Plus — Gestión de Buenas Prácticas de Almacenamiento

Aplicación personal para llevar el control de documentos, capacitaciones y
autoinspecciones bajo Buenas Prácticas de Almacenamiento (BPA) en una o
varias droguerías. Pensada para una sola persona: vos.

Usa **Firebase Authentication + Firestore** para proteger y sincronizar la
información entre dispositivos. Firestore mantiene caché local, por lo que
la app sigue funcionando sin conexión después del primer acceso.

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
- **Sub-programa Autoinspecciones** (`autoinspecciones/`) — una página aparte,
  sin cuenta, sin nube y sin PIN, para llenar el acta donde la app completa no
  entra (una tablet prestada, el almacén del cliente, alguien que no es vos).
  Desde Autoinspecciones → *Sub-programa* se descarga el **formato** de la
  droguería (sus datos, su checklist y su formato propio si cargó uno); el
  sub-programa lo abre, lo deja llenar y devuelve **el mismo formato ya
  llenado**, que se carga de vuelta con "Cargar acta llenada" y aparece como
  un acta más de esa droguería. El archivo es el único puente: el sub-programa
  no ve la base de datos.
- **Formatos propios por droguería** — cargá el formato de asistencia (o el
  de autoinspección) en blanco que ya usa la droguería, en Excel, Word o PDF.
  BPA-Plus lee su título, sus campos de encabezado y las columnas de su tabla,
  te deja elegir qué dato de la app llena cada uno, y desde entonces las actas
  se imprimen **con ese formato ya llenado** en vez del genérico. La
  configuración queda guardada en la droguería, así que viaja con ella. Se
  administra desde el botón "Formato propio" de Capacitaciones y de
  Autoinspecciones.
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
- **Escaneo de carpeta BPA** — seleccioná una carpeta local con PDF editables,
  Word o Excel. BPA-Plus lee el texto, propone código, tipo, versión, área y
  fecha de revisión, fusiona duplicados y pide confirmación antes de guardar.
  Al confirmar, guarda los archivos en la biblioteca privada de Firebase.
- **Control documental** — exige códigos estándar (`POE-ALM-001`,
  `FOR-ALM-011`), renombra el archivo guardado, permite descargarlo o
  reemplazarlo y conserva las versiones anteriores. Las plantillas vacías y
  los formatos llenados se archivan por separado; un registro nunca reemplaza
  la plantilla oficial.
- **Cronogramas Excel** — interpreta encabezados y fechas aunque usen nombres
  como tema/curso, frecuencia/periodicidad o área/unidad; permite revisar cada
  capacitación y autoinspección antes de incorporarla.
- **Cuenta + PIN local** — se inicia sesión con correo y contraseña; después,
  en la primera apertura de cada dispositivo se crea y confirma
  un PIN de 4 a 6 dígitos; luego se pide al abrir la app. El PIN (salteado y
  con hash SHA-256) vive solo en este dispositivo. Se cambia desde la barra
  lateral. “Cerrar sesión” cierra también la cuenta Firebase.
- **Tema claro / oscuro**, atajos de teclado, deshacer al eliminar.

## Cómo usarla

No requiere un servidor propio:

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

El frontend es estático y el backend administrado vive en Firebase, por lo
que cualquier hosting gratuito de archivos estáticos alcanza:

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

Abrir el enlace no expone los datos: cada usuario solo puede leer y escribir
su espacio, según las reglas de Firestore. El PIN agrega una segunda barrera
local en cada dispositivo.

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

Los datos viven en Firestore y se sincronizan automáticamente. La primera vez
se migran los datos locales de la versión anterior, si existen; si no, se
cargan datos de ejemplo para explorar la app.

- **Exportar respaldo** — genera un `.json` con toda la información.
- **Importar respaldo** — reemplaza los datos actuales por los del archivo.

El respaldo JSON sigue disponible como copia adicional o exportación manual.
Los PDF, DOCX y XLSX de hasta 25 MB se guardan en Firebase Storage bajo la
cuenta y droguería correspondientes. El JSON contiene sus referencias, no una
copia binaria de los archivos.

## Estructura

```
BPA-Plus/
├─ index.html            Shell de la app
├─ styles.css             Sistema de diseño (tokens, claro/oscuro, impresión)
├─ manifest.json          Manifiesto PWA
├─ sw.js                  Service worker (cache-first, offline)
├─ icons/                 Iconos de la app
├─ autoinspecciones/       Sub-programa independiente para llenar el acta fuera de la app
└─ js/
   ├─ domain.js           Lógica de negocio pura (estados, fechas, clasificación, puntaje)
   ├─ config.js           Configuración pública del proyecto Firebase
   ├─ cloud.js            Firebase Auth, Firestore, Storage y caché offline
   ├─ auth.js             Pantalla de cuenta y recuperación de contraseña
   ├─ db.js               Datos, migración local y exportar/importar
   ├─ ui.js                Componentes (notas, diálogos, panel, hoja de acciones, buscador)
   ├─ formatos.js         Formatos propios de cada droguería (lectura, configuración, llenado)
   ├─ actas.js             Generación de actas imprimibles
   ├─ views.js             Vistas y formularios
   └─ app.js               Estado, enrutado, chrome, arranque
```

Los scripts se cargan con `<script>` clásicos (sin módulos ES), así que
funciona igual abriendo el archivo local o servida como PWA.

## Privacidad

Los registros se almacenan en el proyecto Firebase `bpa-db`, aislados por el
UID de la cuenta. La configuración web de Firebase es pública por diseño; la
protección real está en Authentication, `firestore.rules` y `storage.rules`.

Si activás **Google Drive**, la app habla directo con la API de Google
desde tu navegador para leer los archivos que elijas, y carga dos librerías de
lectura (Mammoth, SheetJS y PDF.js) desde CDN la primera vez que las necesita.
El token de acceso vive solo en la memoria de la pestaña.
