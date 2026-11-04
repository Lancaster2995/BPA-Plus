/* Avisos push de vencimientos, con el mismo enfoque que LogisticS (worker/src/test-reminders.js):
   el teléfono se activa solo si le llega el aviso de prueba, y un cron diario manda lo que toca.
   La lista la arma la app con sus propias reglas (alerts.js + domain.js) y la sincroniza al abrir o
   al cambiar algo, en la web y en el teléfono: el Worker no duplica las reglas ni lee Firestore.
   Todo vive en KV, una clave por cuenta: { subs, items, enviados }. */
import { enviarPush } from './web-push.js';

const DIA = 864e5;
const falla = (status, mensaje) => Object.assign(new Error(mensaje), { status });
const clave = (uid) => 'avisos/' + uid;
const leer = async (kv, uid) => Object.assign({ subs: [], items: [], enviados: {} }, await kv.get(clave(uid), 'json'));
const guardar = (kv, uid, estado) => kv.put(clave(uid), JSON.stringify(estado));

// Perú no cambia de hora: el día de Lima es la hora UTC menos 5.
export const hoyLima = (ahora) => new Date(ahora - 5 * 3600e3).toISOString().slice(0, 10);
const dias = (fecha, hoy) => Math.round((Date.parse(fecha + 'T00:00:00Z') - Date.parse(hoy + 'T00:00:00Z')) / DIA);
// Renovar un documento le cambia la fecha: el aviso se vuelve a armar para la fecha nueva.
const llave = (it) => it.id + '@' + it.fecha;

/* Un aviso por hito y por vencimiento, como LogisticS (uno por recordatorio): a 7 días y el día que
   vence, o el primero en que se lo ve vencido. No insiste todos los días con lo ya avisado. */
export function pendientesDeHoy(items, enviados, hoy) {
  const out = [];
  for (const it of items) {
    const d = dias(it.fecha, hoy), hito = d <= 0 ? '0' : d <= 7 ? '7' : '';
    if (hito && !(enviados[llave(it)] || '').includes(hito)) out.push({ ...it, dias: d, hito });
  }
  return out.sort((a, b) => a.dias - b.dias);
}

const plural = (n, uno, varios) => n + ' ' + (n === 1 ? uno : varios);
const cuando = (d) => (d < 0 ? 'vencido hace ' + -d + ' d' : d === 0 ? 'vence hoy' : 'en ' + plural(d, 'día', 'días'));

/* Lo de un día va en UNA notificación. Corta (Apple admite 4 KB cifrados); `tag` del día, así un
   reintento reemplaza al anterior en pantalla. `url` abre las alertas en la app móvil. */
export function resumenPush(lista, hoy) {
  const venc = lista.filter((x) => x.dias <= 0).length, prox = lista.length - venc;
  const titulo = [venc && plural(venc, 'vence hoy o ya venció', 'vencen hoy o ya vencieron'), prox && plural(prox, 'vence en 7 días', 'vencen en 7 días')]
    .filter(Boolean).join(' · ');
  const lineas = lista.slice(0, 4).map((x) => `${x.titulo} · ${x.dg} · ${cuando(x.dias)}`);
  if (lista.length > 4) lineas.push(`… y ${lista.length - 4} más`);
  return { tag: 'avisos-' + hoy, title: 'BPA Plus · ' + titulo, body: lineas.join('\n'), url: '#/alertas' };
}

const KINDS = ['doc', 'cap', 'insp'];
const texto = (v, max) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : '');

/* La app manda la lista entera cada vez que cambia. Sin teléfonos activados no se guarda nada
   (`activo: false`): la app vuelve a mandarla cuando se active uno. */
export async function sincronizarAvisos(env, uid, datos) {
  if (!env.AVISOS) throw falla(503, 'Los avisos push no están configurados en el servidor.');
  const crudos = Array.isArray(datos && datos.items) ? datos.items : null;
  if (!crudos || crudos.length > 500) throw falla(400, 'Lista de avisos no válida.');
  const items = crudos.map((x) => ({ id: texto(x && x.id, 80), kind: x && x.kind, fecha: x && x.fecha, titulo: texto(x && x.titulo, 120), dg: texto(x && x.dg, 60) }))
    .filter((x) => x.id && x.titulo && KINDS.includes(x.kind) && /^\d{4}-\d{2}-\d{2}$/.test(x.fecha) && Number.isFinite(Date.parse(x.fecha)));
  const estado = await leer(env.AVISOS, uid);
  if (!estado.subs.length) return { activo: false };
  // Lo que ya no está en la lista (renovado, realizado, borrado) deja de contar como avisado.
  const vigentes = new Set(items.map(llave));
  const enviados = Object.fromEntries(Object.entries(estado.enviados).filter(([k]) => vigentes.has(k)));
  // ponytail: leer-modificar-escribir sin transacción (KV no la tiene); dos sincronizaciones a la vez
  // pueden pisarse, y la siguiente lo corrige. Un Durable Object si alguna vez importa.
  await guardar(env.AVISOS, uid, { ...estado, items, enviados });
  return { activo: true, dispositivos: estado.subs.length };
}

// Solo servicios de push conocidos: el Worker hace POST a esta URL, no a una cualquiera. (LogisticS)
const PUSH_HOST = /^https:\/\/([a-z0-9-]+\.)*(push\.apple\.com|fcm\.googleapis\.com|notify\.windows\.com|push\.services\.mozilla\.com)\//;
const b64len = (s, n) => typeof s === 'string' && /^[\w-]+={0,2}$/.test(s) && Math.floor(s.replace(/=+$/, '').length * 3 / 4) === n;

/* Guarda el teléfono SOLO si el aviso de prueba llegó: activar = comprobado de punta a punta. */
export async function guardarSuscripcion(env, uid, body) {
  if (!env.AVISOS || !env.VAPID_PRIVATE_KEY) throw falla(503, 'Los avisos push no están configurados en el servidor.');
  const sub = { endpoint: String((body && body.endpoint) || ''), p256dh: body && body.keys && body.keys.p256dh, auth: body && body.keys && body.keys.auth };
  if (sub.endpoint.length > 1024 || !PUSH_HOST.test(sub.endpoint) || !b64len(sub.p256dh, 65) || !b64len(sub.auth, 16))
    throw falla(400, 'Suscripción de avisos no válida.');
  const status = await enviarPush(sub, { tag: 'activado', title: 'Avisos activados', url: '#/alertas',
    body: 'Aquí te llegarán los vencimientos de tus droguerías: a 7 días y el día que vencen.' }, JSON.parse(env.VAPID_PRIVATE_KEY)).catch(() => 0);
  if (status < 200 || status > 299) throw falla(502, `El servicio de avisos no aceptó este teléfono (${status || 'sin respuesta'}).`);
  const estado = await leer(env.AVISOS, uid);
  estado.subs = estado.subs.filter((s) => s.endpoint !== sub.endpoint).concat(sub).slice(-5);
  await guardar(env.AVISOS, uid, estado);
  return { ok: true };
}

/* Cron diario (wrangler.toml). Un hito queda avisado cuando al menos un teléfono lo recibió; si
   ninguno, se reintenta al día siguiente. 404/410 = ese teléfono ya no existe: se borra. */
export async function enviarAvisos(env, ahora = Date.now()) {
  if (!env.AVISOS || !env.VAPID_PRIVATE_KEY) return { configurado: false, enviados: 0 };
  const jwk = JSON.parse(env.VAPID_PRIVATE_KEY), hoy = hoyLima(ahora);
  let cursor, enviados = 0;
  do {
    const pagina = await env.AVISOS.list({ prefix: 'avisos/', cursor });
    for (const { name } of pagina.keys) {
      const uid = name.slice('avisos/'.length), estado = await leer(env.AVISOS, uid);
      const lista = pendientesDeHoy(estado.items, estado.enviados, hoy);
      if (!estado.subs.length || !lista.length) continue;
      const aviso = resumenPush(lista, hoy), vivas = [];
      let ok = false;
      for (const sub of estado.subs) {
        const status = await enviarPush(sub, aviso, jwk).catch(() => 0);
        if (status === 404 || status === 410) continue;
        vivas.push(sub);
        if (status >= 200 && status < 300) ok = true;
        else console.error('push-delivery-failed', status);
      }
      if (ok) {
        for (const x of lista) estado.enviados[llave(x)] = (estado.enviados[llave(x)] || '') + x.hito;
        enviados++;
      }
      if (ok || vivas.length !== estado.subs.length) await guardar(env.AVISOS, uid, { ...estado, subs: vivas });
    }
    cursor = pagina.list_complete ? null : pagina.cursor;
  } while (cursor);
  return { configurado: true, enviados };
}
