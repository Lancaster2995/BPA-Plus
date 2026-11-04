// node worker/test-avisos.mjs — avisos push sin red: KV y el servicio de push son de mentira.
// El cifrado se compara byte a byte con el vector oficial del RFC 8291 (copiado de LogisticS).
import assert from 'node:assert/strict';
import { cifrar } from './web-push.js';
import { pendientesDeHoy, resumenPush, sincronizarAvisos, guardarSuscripcion, enviarAvisos, hoyLima } from './avisos.js';

// Cifrado Web Push: RFC 8291, sección 5 y apéndice A.
const B = (s) => Buffer.from(s, 'base64url');
const asPub = B('BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8');
const rfcLocal = {
  publicKey: await crypto.subtle.importKey('raw', asPub, { name: 'ECDH', namedCurve: 'P-256' }, true, []),
  privateKey: await crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', d: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
    x: asPub.subarray(1, 33).toString('base64url'), y: asPub.subarray(33).toString('base64url') }, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']),
};
const rfcBody = await cifrar('When I grow up, I want to be a watermelon', { p256dh: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg' }, B('DGv6ra1nlYgDCS1FRnbzlw'), rfcLocal);
assert.equal(Buffer.from(rfcBody).toString('base64url'), 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN');

// El día de Lima: las 8:00 de Lima son las 13:00 UTC; a las 02:00 UTC todavía es el día anterior.
assert.equal(hoyLima(Date.parse('2026-11-03T13:00:00Z')), '2026-11-03');
assert.equal(hoyLima(Date.parse('2026-11-04T02:00:00Z')), '2026-11-03');

// Hitos: a 7 días y el día que vence (o el primero vencido). Uno por hito; renovar re-arma el aviso.
const it = (id, fecha) => ({ id, kind: 'doc', fecha, titulo: id + ' · algo', dg: 'ITC' });
const items = [it('doc:a', '2026-11-10'), it('doc:b', '2026-11-03'), it('doc:c', '2026-10-20'), it('doc:d', '2026-12-30')];
assert.deepEqual(pendientesDeHoy(items, {}, '2026-11-03').map((x) => x.id + x.hito), ['doc:c0', 'doc:b0', 'doc:a7']);
assert.deepEqual(pendientesDeHoy(items, { 'doc:c@2026-10-20': '0', 'doc:b@2026-11-03': '0', 'doc:a@2026-11-10': '7' }, '2026-11-04'), [],
  'lo ya avisado no se repite al día siguiente');
assert.deepEqual(pendientesDeHoy(items, { 'doc:a@2026-11-10': '7' }, '2026-11-10').map((x) => x.id + x.hito).includes('doc:a0'), true,
  'el día que vence avisa otra vez');
assert.deepEqual(pendientesDeHoy([it('doc:a', '2027-11-10')], { 'doc:a@2026-11-10': '70' }, '2027-11-03').map((x) => x.hito), ['7'],
  'renovado (fecha nueva): vuelve a avisar');
const r = resumenPush(pendientesDeHoy(items, {}, '2026-11-03'), '2026-11-03');
assert.equal(r.title, 'BPA Plus · 2 vencen hoy o ya vencieron · 1 vence en 7 días');
assert.match(r.body, /doc:c · algo · ITC · vencido hace 14 d\ndoc:b · algo · ITC · vence hoy\ndoc:a · algo · ITC · en 7 días/);
assert.equal(r.url, '#/alertas');
assert.ok(new TextEncoder().encode(JSON.stringify(resumenPush(Array.from({ length: 500 }, (_, k) => ({ ...it('doc:' + k, '2026-11-03'), titulo: 'x'.repeat(120), dias: 0 })), '2026-11-03'))).length < 3000,
  'con 500 vencimientos el aviso sigue entrando en los 4 KB de Apple');

// KV y servicio de push de mentira
const kv = new Map();
const KV = {
  get: async (k, tipo) => (kv.has(k) ? (tipo === 'json' ? JSON.parse(kv.get(k)) : kv.get(k)) : null),
  put: async (k, v) => { kv.set(k, v); },
  list: async ({ prefix }) => ({ keys: [...kv.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })), list_complete: true }),
};
let pushStatus = 201;
const pushes = [];
globalThis.fetch = async (url, init) => { pushes.push({ url, init }); return new Response(null, { status: pushStatus }); };
const par = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const env = { AVISOS: KV, VAPID_PRIVATE_KEY: JSON.stringify(await crypto.subtle.exportKey('jwk', par.privateKey)) };
const ua = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
const sub = { endpoint: 'https://web.push.apple.com/QH-prueba', keys: {
  p256dh: Buffer.from(await crypto.subtle.exportKey('raw', ua.publicKey)).toString('base64url'),
  auth: Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64url') } };

// Sin teléfono activado, sincronizar no escribe nada
assert.deepEqual(await sincronizarAvisos(env, 'u1', { items }), { activo: false });
assert.equal(kv.size, 0);
await assert.rejects(() => sincronizarAvisos(env, 'u1', { items: 'nada' }), /no válida/);

// Activar: solo servicios conocidos, claves del largo correcto, y solo si el aviso de prueba llegó
await assert.rejects(() => guardarSuscripcion(env, 'u1', { ...sub, endpoint: 'https://evil.test/x' }), /no válida/);
await assert.rejects(() => guardarSuscripcion(env, 'u1', { ...sub, keys: { ...sub.keys, auth: 'corto' } }), /no válida/);
pushStatus = 403;
await assert.rejects(() => guardarSuscripcion(env, 'u1', sub), /403/);
assert.equal(kv.size, 0);
pushStatus = 201;
assert.deepEqual(await guardarSuscripcion(env, 'u1', sub), { ok: true });
assert.equal(pushes.at(-1).url, sub.endpoint);
assert.match(pushes.at(-1).init.headers.Authorization, /^vapid t=.+, k=/);
assert.equal(pushes.at(-1).init.headers['Content-Encoding'], 'aes128gcm');
await guardarSuscripcion(env, 'u1', sub);
assert.equal(JSON.parse(kv.get('avisos/u1')).subs.length, 1, 'el mismo teléfono no se guarda dos veces');

// Con teléfono: se guarda la lista, saneada (lo que no es un vencimiento se descarta)
assert.deepEqual(await sincronizarAvisos(env, 'u1', { items: items.concat({ id: 'x', kind: 'otra', fecha: 'ayer', titulo: 't', dg: '' }) }), { activo: true, dispositivos: 1 });
assert.equal(JSON.parse(kv.get('avisos/u1')).items.length, 4);

// Cron: un solo push con lo del día; al día siguiente no repite; un 410 borra el teléfono
const enviadosAntes = pushes.length;
const ocho = (dia) => Date.parse(dia + 'T13:00:00Z');
assert.deepEqual(await enviarAvisos(env, ocho('2026-11-03')), { configurado: true, enviados: 1 });
assert.equal(pushes.length, enviadosAntes + 1, 'lo de un día sale en una sola notificación');
assert.deepEqual(await enviarAvisos(env, ocho('2026-11-04')), { configurado: true, enviados: 0 });
// Renovado en la web: la sincronización borra lo avisado del vencimiento viejo
await sincronizarAvisos(env, 'u1', { items: [it('doc:c', '2027-10-20'), it('doc:b', '2026-11-03')] });
assert.deepEqual(Object.keys(JSON.parse(kv.get('avisos/u1')).enviados), ['doc:b@2026-11-03']);
pushStatus = 500;
assert.deepEqual(await enviarAvisos(env, ocho('2027-10-14')), { configurado: true, enviados: 0 }, 'si no llegó, se reintenta otro día');
assert.equal(JSON.parse(kv.get('avisos/u1')).subs.length, 1);
pushStatus = 410;
await enviarAvisos(env, ocho('2027-10-14'));
assert.equal(JSON.parse(kv.get('avisos/u1')).subs.length, 0, '410: el teléfono ya no existe');
assert.deepEqual(await enviarAvisos({ AVISOS: KV }, ocho('2027-10-14')), { configurado: false, enviados: 0 }, 'sin clave VAPID no se envía nada');

console.log('OK: avisos push (RFC 8291, VAPID, hitos de 7 días y del día, un push por día, prueba al activar, 410, renovados)');
