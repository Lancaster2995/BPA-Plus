/* ==========================================================================
   BPA-Plus — functions/index.js
   El único servidor de la app, y existe por una sola razón: la clave de la
   API de Anthropic no puede vivir en el navegador. Todo lo demás —Firestore,
   Storage, Drive, escaneo de documentos— sigue siendo cliente puro.

   La clave se guarda en Secret Manager, nunca en el repo:
     firebase functions:secrets:set ANTHROPIC_API_KEY
   ========================================================================== */
'use strict';

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const Anthropic = require('@anthropic-ai/sdk');

const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY');
initializeApp();

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

async function consumirCupo(uid) {
  const db = getFirestore();
  const ref = db.doc('uso_ia/' + uid);
  const hoy = new Date().toISOString().slice(0, 10);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const previo = snap.exists ? snap.data() : {};
    const n = previo.dia === hoy ? (previo.n || 0) : 0;
    if (n >= LIMITE_DIARIO) {
      throw new HttpsError('resource-exhausted',
        'Llegaste al límite de ' + LIMITE_DIARIO + ' evaluaciones por día. Volvé mañana.');
    }
    tx.set(ref, { dia: hoy, n: n + 1 }, { merge: true });
  });
}

exports.generarEvaluacion = onCall({
  secrets: [ANTHROPIC_API_KEY],
  region: 'us-central1',
  timeoutSeconds: 120,
  memory: '256MiB',
  maxInstances: 5
}, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Iniciá sesión para generar la evaluación.');

  const datos = request.data || {};
  const tema = String(datos.tema || '').trim().slice(0, 300);
  if (!tema) throw new HttpsError('invalid-argument', 'Falta el tema de la capacitación.');
  const area = String(datos.area || '').trim().slice(0, 120);
  /* El material lo extrae el cliente (ya sabe leer PDF/Word/Excel para el
     escaneo de documentos); acá solo se recorta. */
  const material = String(datos.material || '').trim().slice(0, 12000);

  await consumirCupo(request.auth.uid);

  const entrada =
    'Tema de la capacitación: ' + tema + '\n' +
    (area ? 'Área dirigida: ' + area + '\n' : '') +
    (material
      ? '\nMaterial que se dictó (extracto):\n"""\n' + material + '\n"""\n\nBasá las preguntas en este material.'
      : '\nNo hay material adjunto: basá las preguntas en la normativa BPA peruana aplicable al tema.') +
    '\n\nRedactá exactamente 5 preguntas de alternativa múltiple, cada una con 4 opciones y una sola correcta.';

  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY.value() });

  let respuesta;
  try {
    respuesta = await client.messages.create({
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
    });
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) throw new HttpsError('resource-exhausted', 'La API está saturada. Probá en un minuto.');
    if (error instanceof Anthropic.AuthenticationError) throw new HttpsError('failed-precondition', 'La clave de API no es válida. Revisá el secreto ANTHROPIC_API_KEY.');
    throw new HttpsError('internal', 'No se pudo generar la evaluación: ' + (error && error.message || error));
  }

  const bloque = respuesta.content.find((b) => b.type === 'tool_use');
  const preguntas = (bloque && bloque.input && bloque.input.preguntas || []).filter((p) =>
    p && typeof p.enunciado === 'string' && Array.isArray(p.opciones) &&
    p.opciones.length === 4 && p.correcta >= 0 && p.correcta <= 3);
  if (preguntas.length < 5) throw new HttpsError('internal', 'El modelo devolvió una evaluación incompleta. Intentá de nuevo.');

  return {
    preguntas: preguntas.slice(0, 5),
    generadoEl: Date.now(),
    conMaterial: !!material,
    uso: { entrada: respuesta.usage.input_tokens, salida: respuesta.usage.output_tokens }
  };
});
