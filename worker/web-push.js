/* Web Push sin dependencias, solo Web Crypto: cifrado aes128gcm (RFC 8291) y firma VAPID (RFC 8292).
   Copiado tal cual de LogisticS (LogisticS/worker/src/web-push.js); solo cambia el contacto VAPID.
   Apple, Google y Microsoft reciben lo mismo. La prueba con el vector del RFC está en
   worker/test-avisos.mjs. */

// Contacto VAPID: Apple exige una URL o un mailto:. La URL de la app no expone ningún correo.
const SUJETO = 'https://bpa-db.web.app';
const te = new TextEncoder();

export const b64urlABytes = (s) => {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};
const bytesAB64url = (b) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unir = (...partes) => {
  const out = new Uint8Array(partes.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const p of partes) { out.set(p, i); i += p.length; }
  return out;
};
async function hkdf(salt, ikm, info, bytes) {
  const k = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, k, bytes * 8));
}

/* `salt` y `local` solo los fija la prueba (vector del RFC 8291); en uso son nuevos en cada aviso. */
export async function cifrar(texto, { p256dh, auth }, salt = crypto.getRandomValues(new Uint8Array(16)), local) {
  local ||= await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const ua = b64urlABytes(p256dh), as = new Uint8Array(await crypto.subtle.exportKey('raw', local.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', ua, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, local.privateKey, 256));
  const ikm = await hkdf(b64urlABytes(auth), ecdh, unir(te.encode('WebPush: info\0'), ua, as), 32);
  const cek = await crypto.subtle.importKey('raw', await hkdf(salt, ikm, te.encode('Content-Encoding: aes128gcm\0'), 16), 'AES-GCM', false, ['encrypt']);
  const nonce = await hkdf(salt, ikm, te.encode('Content-Encoding: nonce\0'), 12);
  // 0x02: delimitador del último (y único) registro
  const cifrado = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, cek, unir(te.encode(texto), [2])));
  // cabecera de 86 bytes: salt · tamaño de registro 4096 · largo de la clave (65) · clave pública efímera
  return unir(salt, [0, 0, 16, 0, 65], as, cifrado);
}

/* Apple pide no renovar el JWT más de una vez por hora: vale 12 h y se reutiliza mientras le quede
   más de una. La caché vive lo que viva el isolate del Worker. */
const jwts = new Map();
async function vapid(endpoint, jwk) {
  const aud = new URL(endpoint).origin, ahora = Math.floor(Date.now() / 1000), c = jwts.get(aud);
  if (c && c.x === jwk.x && c.exp - ahora > 3600) return c.cabecera;
  const exp = ahora + 12 * 3600, json = (o) => bytesAB64url(te.encode(JSON.stringify(o)));
  const datos = `${json({ typ: 'JWT', alg: 'ES256' })}.${json({ aud, exp, sub: SUJETO })}`;
  // solo las coordenadas: un JWK exportado trae key_ops que chocarían con el uso 'sign'
  const clave = await crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y, d: jwk.d },
    { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  // Web Crypto entrega la firma ECDSA como r‖s (64 bytes), justo el formato de ES256
  const firma = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, clave, te.encode(datos)));
  const publica = bytesAB64url(unir([4], b64urlABytes(jwk.x), b64urlABytes(jwk.y)));
  const cabecera = `vapid t=${datos}.${bytesAB64url(firma)}, k=${publica}`;
  jwts.set(aud, { x: jwk.x, exp, cabecera });
  return cabecera;
}

/* Devuelve el estado HTTP del servicio de avisos: 2xx entregado; 404/410 la suscripción ya no existe.
   TTL de 7 días por si el teléfono está apagado (Apple guarda hasta 30). */
export async function enviarPush(sub, aviso, jwk) {
  const r = await fetch(sub.endpoint, {
    method: 'POST', signal: AbortSignal.timeout(15000),
    headers: { Authorization: await vapid(sub.endpoint, jwk), 'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream', TTL: String(7 * 24 * 3600), Urgency: 'high' },
    body: await cifrar(JSON.stringify(aviso), sub),
  });
  return r.status;
}
