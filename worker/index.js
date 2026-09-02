/* ==========================================================================
   BPA-Plus — worker/index.js
   El único servidor de la app, y existe por una sola razón: la clave de la
   API de Anthropic no puede vivir en el navegador. Todo lo demás —Firestore,
   Drive, escaneo de documentos, reconocimiento on-device— sigue siendo
   cliente puro.

   Vive en Cloudflare Workers y no en Cloud Functions porque Functions exige
   el plan Blaze de Firebase. El plan gratuito de Workers no pide tarjeta.
   Lo que se paga por mudarse: un callable de Firebase verificaba el token de
   sesión solo, acá hay que verificarlo a mano (`verificarToken`).

   La clave se guarda como secreto de Cloudflare, nunca en el repo:
     npx wrangler secret put ANTHROPIC_API_KEY
   ========================================================================== */
'use strict';

const PROJECT_ID = 'bpa-db';
const JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

const ORIGENES = [
  'https://lancaster2995.github.io',
  'https://bpa-db.web.app',
  'https://bpa-db.firebaseapp.com',
  'http://localhost:8080',
  'http://127.0.0.1:8080'
];

/* Tope por usuario y día. Una sesión robada no puede vaciar la cuenta: a
   ~$0.08 por evaluación, el peor día posible cuesta menos de dos dólares. */
const LIMITE_DIARIO = 20;

const SISTEMA =
  'Sos especialista en Buenas Prácticas de Almacenamiento (BPA) de productos farmacéuticos en el Perú, ' +
  'con dominio del DS 014-2011-SA y del Manual de Buenas Prácticas de Almacenamiento de la DIGEMID. ' +
  'Redactás evaluaciones para el personal de droguerías: preguntas concretas sobre lo que la persona ' +
  'tiene que hacer en su puesto, nunca definiciones de memoria ni preguntas capciosas. ' +
  'Escribís en español peruano, claro y directo. Las cuatro alternativas deben ser plausibles: ' +
  'las incorrectas son errores que la gente comete de verdad, no rellenos absurdos.';

/* Salida garantizada por el esquema: `strict: true` obliga a que la respuesta
   valide exacto, así el cliente nunca recibe un JSON a medias. */
const ESQUEMA = {
  type: 'object',
  properties: {
    preguntas: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          enunciado: { type: 'string' },
          opciones: { type: 'array', items: { type: 'string' } },
          correcta: { type: 'integer', enum: [0, 1, 2, 3] },
          justificacion: { type: 'string' }
        },
        required: ['enunciado', 'opciones', 'correcta', 'justificacion'],
        additionalProperties: false
      }
    }
  },
  required: ['preguntas'],
  additionalProperties: false
};

class ErrorHttp extends Error {
  constructor(status, mensaje) { super(mensaje); this.status = status; }
}

/* ------------------------------ CORS ------------------------------ */
function cors(origin) {
  const permitido = ORIGENES.includes(origin) ? origin : ORIGENES[0];
  return {
    'Access-Control-Allow-Origin': permitido,
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin'
  };
}

/* ------------------------------ Token de Firebase ------------------------------ */
/* Las claves públicas de Google rotan cada pocas horas y vienen con su propio
   `max-age`. Se cachean en el isolate hasta que ese plazo vence. */
let jwksCache = { claves: null, vence: 0 };

async function clavesGoogle() {
  if (jwksCache.claves && Date.now() < jwksCache.vence) return jwksCache.claves;
  const res = await fetch(JWKS_URL);
  if (!res.ok) throw new ErrorHttp(503, 'No se pudieron leer las claves públicas de Google.');
  const { keys } = await res.json();
  const control = res.headers.get('cache-control') || '';
  const maxAge = Number((control.match(/max-age=(\d+)/) || [])[1] || 3600);
  jwksCache = { claves: keys || [], vence: Date.now() + maxAge * 1000 };
  return jwksCache.claves;
}

function b64urlABytes(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '=='.slice(0, (4 - (s.length % 4)) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/* Devuelve el uid, o lanza. Es el límite de confianza del worker: todo lo que
   sigue asume que quien llama es un usuario real de este proyecto de Firebase. */
async function verificarToken(request) {
  const header = request.headers.get('Authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) throw new ErrorHttp(401, 'Iniciá sesión para generar la evaluación.');

  const partes = token.split('.');
  if (partes.length !== 3) throw new ErrorHttp(401, 'La sesión no es válida.');

  let cabecera, cuerpo;
  try {
    cabecera = JSON.parse(new TextDecoder().decode(b64urlABytes(partes[0])));
    cuerpo = JSON.parse(new TextDecoder().decode(b64urlABytes(partes[1])));
  } catch (e) { throw new ErrorHttp(401, 'La sesión no es válida.'); }

  if (cabecera.alg !== 'RS256') throw new ErrorHttp(401, 'La sesión no es válida.');

  const jwk = (await clavesGoogle()).find((k) => k.kid === cabecera.kid);
  if (!jwk) throw new ErrorHttp(401, 'La sesión venció. Volvé a entrar.');

  /* Se rearma el JWK en vez de pasar el de Google tal cual: es lo que hace el worker de
     Organolépticos, que ya corre en producción con este mismo esquema. El de Google trae
     `use` y `kid` de más y no todos los runtimes los aceptan sin chistar. */
  const clave = await crypto.subtle.importKey(
    'jwk', { kty: 'RSA', n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const firmado = new TextEncoder().encode(partes[0] + '.' + partes[1]);
  const valida = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', clave, b64urlABytes(partes[2]), firmado);
  if (!valida) throw new ErrorHttp(401, 'La sesión no es válida.');

  const ahora = Math.floor(Date.now() / 1000);
  if (cuerpo.aud !== PROJECT_ID) throw new ErrorHttp(401, 'La sesión no es de esta app.');
  if (cuerpo.iss !== 'https://securetoken.google.com/' + PROJECT_ID) throw new ErrorHttp(401, 'La sesión no es de esta app.');
  if (!(cuerpo.exp > ahora)) throw new ErrorHttp(401, 'La sesión venció. Volvé a entrar.');
  if (!(cuerpo.iat <= ahora + 60)) throw new ErrorHttp(401, 'La sesión no es válida.');
  if (!cuerpo.sub) throw new ErrorHttp(401, 'La sesión no es válida.');

  return cuerpo.sub;
}

/* ------------------------------ Cupo ------------------------------ */
/* ponytail: lectura-modificación-escritura sin transacción — KV no la tiene. Dos
   pestañas a la vez pueden gastar una evaluación de más; es un tope de costo, no
   dinero. Si alguna vez importa el conteo exacto, un Durable Object lo hace atómico. */
async function consumirCupo(kv, uid) {
  /* Sin KV no hay tope, y un tope de gasto que se desactiva solo no es un tope:
     antes que gastar sin límite, el botón falla. */
  if (!kv) throw new ErrorHttp(500, 'Falta el namespace KV "CUPO" en el worker.');
  const hoy = new Date().toISOString().slice(0, 10);
  const previo = (await kv.get('uso/' + uid, 'json')) || {};
  const n = previo.dia === hoy ? (previo.n || 0) : 0;
  if (n >= LIMITE_DIARIO) {
    throw new ErrorHttp(429, 'Llegaste al límite de ' + LIMITE_DIARIO + ' evaluaciones por día. Volvé mañana.');
  }
  /* Se cae solo a los dos días: el contador del día siguiente arranca de cero igual. */
  await kv.put('uso/' + uid, JSON.stringify({ dia: hoy, n: n + 1 }), { expirationTtl: 172800 });
}

/* ------------------------------ Evaluación ------------------------------ */
async function generarEvaluacion(datos, uid, env) {
  const tema = String(datos.tema || '').trim().slice(0, 300);
  if (!tema) throw new ErrorHttp(400, 'Falta el tema de la capacitación.');
  const area = String(datos.area || '').trim().slice(0, 120);
  /* El material lo extrae el cliente (ya sabe leer PDF/Word/Excel para el
     escaneo de documentos); acá solo se recorta. */
  const material = String(datos.material || '').trim().slice(0, 12000);

  await consumirCupo(env.CUPO, uid);

  const entrada =
    'Tema de la capacitación: ' + tema + '\n' +
    (area ? 'Área dirigida: ' + area + '\n' : '') +
    (material
      ? '\nMaterial que se dictó (extracto):\n"""\n' + material + '\n"""\n\nBasá las preguntas en este material.'
      : '\nNo hay material adjunto: basá las preguntas en la normativa BPA peruana aplicable al tema.') +
    '\n\nRedactá exactamente 5 preguntas de alternativa múltiple, cada una con 4 opciones y una sola correcta.';

  /* Sin el SDK de Anthropic a propósito: una sola llamada no justifica empaquetar
     una dependencia dentro del worker. */
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: 'claude-opus-5',
      max_tokens: 16000,
      output_config: { effort: 'low' },
      system: SISTEMA,
      tools: [{
        name: 'entregar_evaluacion',
        description: 'Entrega las 5 preguntas de la evaluación de la capacitación.',
        strict: true,
        input_schema: ESQUEMA
      }],
      tool_choice: { type: 'tool', name: 'entregar_evaluacion' },
      messages: [{ role: 'user', content: entrada }]
    })
  });

  if (!res.ok) {
    if (res.status === 429) throw new ErrorHttp(429, 'La API está saturada. Probá en un minuto.');
    if (res.status === 401) throw new ErrorHttp(500, 'La clave de API no es válida. Revisá el secreto ANTHROPIC_API_KEY.');
    throw new ErrorHttp(502, 'No se pudo generar la evaluación (Anthropic respondió ' + res.status + ').');
  }

  const respuesta = await res.json();
  const bloque = (respuesta.content || []).find((b) => b.type === 'tool_use');
  const preguntas = ((bloque && bloque.input && bloque.input.preguntas) || []).filter((p) =>
    p && typeof p.enunciado === 'string' && Array.isArray(p.opciones) &&
    p.opciones.length === 4 && p.correcta >= 0 && p.correcta <= 3);
  if (preguntas.length < 5) throw new ErrorHttp(502, 'El modelo devolvió una evaluación incompleta. Intentá de nuevo.');

  return {
    preguntas: preguntas.slice(0, 5),
    generadoEl: Date.now(),
    conMaterial: !!material,
    uso: { entrada: respuesta.usage.input_tokens, salida: respuesta.usage.output_tokens }
  };
}

/* ------------------------------ Entrada ------------------------------ */
const RUTAS = { '/generarEvaluacion': generarEvaluacion };

export default {
  async fetch(request, env) {
    const cabeceras = cors(request.headers.get('Origin') || '');
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cabeceras });

    const json = (body, status) => new Response(JSON.stringify(body), {
      status: status || 200,
      headers: Object.assign({ 'Content-Type': 'application/json' }, cabeceras)
    });

    try {
      if (request.method !== 'POST') throw new ErrorHttp(405, 'Método no permitido.');
      const ruta = RUTAS[new URL(request.url).pathname];
      if (!ruta) throw new ErrorHttp(404, 'No existe esa función.');

      /* El token primero: sin él nadie tiene por qué enterarse de cómo está configurado
         el worker, ni siquiera de si le falta el secreto. */
      const uid = await verificarToken(request);
      if (!env.ANTHROPIC_API_KEY) throw new ErrorHttp(500, 'Falta el secreto ANTHROPIC_API_KEY en el worker.');
      let datos;
      try { datos = await request.json(); } catch (e) { throw new ErrorHttp(400, 'El cuerpo no es JSON.'); }

      return json(await ruta(datos || {}, uid, env));
    } catch (error) {
      const status = error instanceof ErrorHttp ? error.status : 500;
      return json({ error: error.message || 'Error inesperado.' }, status);
    }
  }
};
