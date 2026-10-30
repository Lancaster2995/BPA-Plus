/* ==========================================================================
   BPA-Plus — runner/diapositivas.mjs
   Crea la presentación de una capacitación con el skill slide-maker, usando la
   suscripción de Claude Code de esta PC (no la API). Corre en la PC, no en la
   nube: la app le habla a http://127.0.0.1:8787 y, cuando el .pptx está listo,
   el navegador lo sube al material de la capacitación con su sesión de Drive.

   Iniciar:  node runner/diapositivas.mjs   (o doble clic en runner/iniciar.cmd)
   Requiere: Claude Code con sesión iniciada (`claude`), Python y LibreOffice
             (los del skill slide-maker, instalado en ~/.claude/skills).

   Cada presentación tarda minutos y descuenta del límite de uso de la
   suscripción, así que corren de a una.
   ========================================================================== */
import http from 'node:http';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readdirSync, statSync, readFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';

const PUERTO = 8787;
/* Ruta corta y fuera de Descargas: rutas largas rompen git/Python en Windows, y un
   organizador de Descargas puede mover la carpeta mientras se arma el deck. */
const BASE = join(homedir(), 'BPA-diapositivas');
const ORIGENES = [
  'https://lancaster2995.github.io',
  'https://bpa-db.web.app',
  'https://bpa-db.firebaseapp.com',
  'http://localhost:8080',
  'http://127.0.0.1:8080'
];
const LIMITE_MIN = 90;                  // un deck colgado no bloquea la cola para siempre
const CUERPO_MAX = 15 * 1024 * 1024;    // material en base64 (PDF ~10 MB)
/* Permisos del agente. Modo dontAsk: lo que no está en PERMITIDO se rechaza solo (en -p
   nadie responde). Sin conectores MCP (--strict-mcp-config): el correo o el Drive del
   usuario no tienen nada que hacer en un deck.
   ponytail: en Windows nativo Claude Code no tiene sandbox, y `Bash(python *)` deja correr
   cualquier código Python — el skill lo necesita. Esto frena lo que el agente intenta por
   las herramientas, no a un script decidido. Aislamiento real: correr el runner en WSL2
   con sandbox.enabled, o con un usuario de Windows sin acceso a tus archivos. */
const PERMITIDO = [
  'Skill', 'Read', 'Glob', 'Grep', 'TodoWrite', 'Agent', 'WebSearch',
  'Edit(./**)',                                   // escribir solo dentro de la carpeta del trabajo
  'Bash(python *)', 'Bash(mkdir *)', 'Bash(export *)',
  'WebFetch(domain:gob.pe)', 'WebFetch(domain:*.gob.pe)',
  'WebFetch(domain:elperuano.pe)', 'WebFetch(domain:*.elperuano.pe)',
  'WebFetch(domain:*.wikimedia.org)'
];
const PROHIBIDO = [
  'PowerShell', 'NotebookEdit',
  'Bash(curl *)', 'Bash(wget *)', 'Bash(powershell *)', 'Bash(pwsh *)', 'Bash(cmd *)',
  'Bash(rm *)', 'Bash(git *)', 'Bash(npm *)', 'Bash(npx *)', 'Bash(pip *)', 'Bash(python -m pip *)',
  'Read(~/.claude/.credentials.json)', 'Read(~/.ssh/**)'
];

const trabajos = new Map();
let cola = Promise.resolve();

function prompt(t) {
  return [
    'Usa el skill slide-maker para crear UNA presentación de capacitación (.pptx, 16:9, entre 6 y 8 diapositivas) sobre el tema: «' + t.tema + '».',
    'Público: personal operativo de una droguería en Perú (almacén o distribuidora regulada por DIGEMID)' +
      (t.area ? ', área: ' + t.area : '') + (t.drogueria ? ', droguería: ' + t.drogueria : '') + '.',
    'Corre en MODO AUTOMÁTICO (per-deck AUTO WAIVER): nadie va a responder. No hagas preguntas ni esperes aprobaciones; ' +
      'decide tú la entrevista y publica los checkpoints como FYI en tu salida. Respuestas fijas: idioma español; densidad balanceada; ' +
      'presentada en vivo con notas del orador; sin animaciones; diseña un look limpio; revisión fast; no actualices el skill.',
    t.material
      ? 'El material de la capacitación está en ./' + t.material + ': es la fuente principal; mantente fiel a él.'
      : 'No hay material: usa la normativa peruana vigente y verifica cada cifra o artículo en fuentes primarias oficiales (gob.pe, El Peruano, DIGEMID).',
    'Puedes poner 2 o 3 fotos con licencia abierta de Wikimedia Commons si encuentras buenas y del tema; si no, ninguna.',
    'Guarda el deck en la carpeta de trabajo actual con el nombre deck.pptx (no en Descargas). ' +
      'Corre Python como `python -X utf8 …` (no `python3`). Tus permisos son limitados a propósito: si algo se rechaza, sigue sin eso en vez de buscar otra vía.',
    'Al terminar, imprime solo la ruta absoluta de deck.pptx.'
  ].join('\n');
}

/* El .pptx más nuevo de la carpeta del trabajo, salvo copias de versiones. */
function buscarPptx(dir) {
  let mejor = null;
  (function rec(d) {
    for (const n of readdirSync(d)) {
      const p = join(d, n), s = statSync(p);
      if (s.isDirectory()) { if (n !== '.versions') rec(p); }
      else if (/\.pptx$/i.test(n) && !n.startsWith('~$') && (!mejor || s.mtimeMs > mejor.t)) mejor = { p, t: s.mtimeMs };
    }
  })(dir);
  return mejor && mejor.p;
}

function argsClaude(texto) {
  return ['-p', texto, '--output-format', 'json', '--strict-mcp-config',
    '--permission-mode', 'dontAsk', '--allowedTools', ...PERMITIDO, '--disallowedTools', ...PROHIBIDO];
}

function correr(t) {
  return new Promise((resolve) => {
    t.estado = 'trabajando'; t.inicio = Date.now();
    const log = join(t.dir, 'log.txt');
    const env = Object.assign({}, process.env, {
      CHROME: process.env.CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      PYTHONIOENCODING: 'utf-8'
    });
    /* Con una clave de API en el entorno, `claude` cobra por token en vez de usar la
       suscripción, sin avisar. Este runner existe para usar la suscripción. */
    delete env.ANTHROPIC_API_KEY; delete env.ANTHROPIC_AUTH_TOKEN;
    const p = spawn('claude', argsClaude(prompt(t)), {
      cwd: t.dir,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    });
    const guardar = (b) => appendFileSync(log, b);
    p.stdout.on('data', guardar);
    p.stderr.on('data', guardar);
    const reloj = setTimeout(() => { t.mensaje = 'Pasó el límite de ' + LIMITE_MIN + ' minutos.'; p.kill(); }, LIMITE_MIN * 60000);
    const fin = (codigo) => {
      clearTimeout(reloj);
      t.archivo = buscarPptx(t.dir);
      if (t.archivo) { t.estado = 'listo'; t.mensaje = ''; }
      else {
        t.estado = 'error';
        let ultimo = '';
        try { ultimo = readFileSync(log, 'utf8').slice(-600); } catch (e) { /* sin log */ }
        t.mensaje = t.mensaje || ('Claude terminó (código ' + codigo + ') sin dejar deck.pptx. ' + ultimo);
      }
      resolve();
    };
    p.on('error', (e) => { t.mensaje = 'No se pudo lanzar `claude`: ' + e.message; fin(-1); });
    p.on('close', fin);
  });
}

function leerCuerpo(req) {
  return new Promise((resolve, reject) => {
    let n = 0; const partes = [];
    req.on('data', (c) => { n += c.length; if (n > CUERPO_MAX) { reject(new Error('El material es demasiado grande.')); req.destroy(); } else partes.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(partes).toString('utf8') || '{}')); } catch (e) { reject(new Error('El cuerpo no es JSON.')); } });
    req.on('error', reject);
  });
}

function crear(d) {
  const tema = String(d.tema || '').trim().slice(0, 300);
  if (!tema) throw Object.assign(new Error('Falta el tema de la capacitación.'), { status: 400 });
  const id = randomUUID().slice(0, 8);
  const dir = join(BASE, new Date().toISOString().slice(0, 10) + '-' + id);
  mkdirSync(dir, { recursive: true });
  let material = '';
  if (typeof d.pdf === 'string' && /^[A-Za-z0-9+/]+={0,2}$/.test(d.pdf)) {
    writeFileSync(join(dir, 'material.pdf'), Buffer.from(d.pdf, 'base64')); material = 'material.pdf';
  } else if (String(d.material || '').trim()) {
    writeFileSync(join(dir, 'material.txt'), String(d.material)); material = 'material.txt';
  }
  const t = { id, dir, tema, material, estado: 'en cola', mensaje: '',
    area: String(d.area || '').slice(0, 120), drogueria: String(d.drogueria || '').slice(0, 120) };
  trabajos.set(id, t);
  cola = cola.then(() => correr(t));
  return { id };
}

const servidor = http.createServer(async (req, res) => {
  const origen = req.headers.origin || '';
  const cab = {
    'Access-Control-Allow-Origin': ORIGENES.includes(origen) ? origen : ORIGENES[0],
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    // Chrome pide permiso explícito para que una página pública llame a la red local.
    'Access-Control-Allow-Private-Network': 'true',
    Vary: 'Origin'
  };
  const json = (cuerpo, status) => { res.writeHead(status || 200, Object.assign({ 'Content-Type': 'application/json' }, cab)); res.end(JSON.stringify(cuerpo)); };
  if (req.method === 'OPTIONS') { res.writeHead(204, cab); return res.end(); }
  /* Cualquier página que abras podría pedirle cosas a 127.0.0.1: solo atienden las de BPA-Plus. */
  if (!ORIGENES.includes(origen)) return json({ error: 'Origen no permitido.' }, 403);
  try {
    const url = new URL(req.url, 'http://127.0.0.1');
    const t = trabajos.get(url.searchParams.get('id') || '');
    if (req.method === 'POST' && url.pathname === '/crear') return json(crear(await leerCuerpo(req)));
    if (!t) return json({ error: 'No existe ese trabajo (¿se reinició el runner?).' }, 404);
    if (req.method === 'GET' && url.pathname === '/estado') {
      return json({ estado: t.estado, mensaje: t.mensaje, minutos: t.inicio ? Math.round((Date.now() - t.inicio) / 60000) : 0 });
    }
    if (req.method === 'GET' && url.pathname === '/archivo' && t.estado === 'listo') {
      res.writeHead(200, Object.assign({ 'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation' }, cab));
      return res.end(readFileSync(t.archivo));
    }
    if (req.method === 'POST' && url.pathname === '/entregado') { trabajos.delete(t.id); return json({ ok: true }); }
    return json({ error: 'No existe esa ruta.' }, 404);
  } catch (e) {
    return json({ error: e.message || 'Error inesperado.' }, e.status || 500);
  }
});

/* `node runner/diapositivas.mjs --probar`: lanza claude con los mismos permisos y le pide
   intentar dos cosas permitidas y tres prohibidas. Si alguna prohibida dice OK, los
   permisos no están haciendo su trabajo. Gasta muy poco de la suscripción. */
if (process.argv.includes('--probar')) {
  const dir = join(BASE, 'prueba-permisos');
  mkdirSync(dir, { recursive: true });
  const pedido = 'Prueba de permisos. Intenta cada acción UNA vez, sin buscar alternativas, y responde una línea por acción: ' +
    '"N: OK" o "N: RECHAZADO". 1) Bash: python -c "print(1)". 2) Write: crea ./dentro.txt con el texto x. ' +
    '3) Write: crea ' + join(homedir(), 'fuera-del-trabajo.txt').replace(/\\/g, '/') + ' con el texto x. ' +
    '4) Bash: powershell -c "echo hola". 5) WebFetch: https://example.com';
  const p = spawn('claude', argsClaude(pedido), { cwd: dir, env: (({ ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN, ...r }) => r)(process.env), stdio: ['ignore', 'pipe', 'inherit'] });
  let out = '';
  p.stdout.on('data', (b) => { out += b; });
  p.on('close', () => {
    let r = out; try { r = JSON.parse(out).result; } catch (e) { /* se imprime crudo */ }
    console.log(r);
    console.log('Esperado: 1 y 2 OK · 3, 4 y 5 RECHAZADO.');
  });
} else {
mkdirSync(BASE, { recursive: true });
servidor.listen(PUERTO, '127.0.0.1', () => {
  console.log('Runner de diapositivas en http://127.0.0.1:' + PUERTO + ' · decks en ' + BASE);
  console.log('Dejá esta ventana abierta mientras uses «Crear diapositiva» en BPA-Plus.');
});
}
