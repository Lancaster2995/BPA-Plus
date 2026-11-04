// npm run check — la navegación del acta contra el checklist oficial de verdad (../js/domain.js),
// más las dos piezas que la web y el móvil comparten desde domain.js. Sin frameworks: OK o revienta.
import assert from "node:assert/strict";

globalThis.window = globalThis;
await import("../../js/domain.js");
const D = window.BPAPLUS.domain;
const { clave, nombreCorto, textoItem, contexto, mover, pendiente, dondeQuedo, primeroDe, responder, ruta, totalItems } = await import("../src/data.js");

const acta = D.actaNueva({ id: "dg1", nombre: "ITC" });
const L = acta.checklist;
const sec = (nombre) => L.findIndex((s) => s.seccion === nombre);
const ALM = sec("ALMACÉN"), PER = sec("PERSONAL");
assert.equal(totalItems(acta), 291, "el acta trae los 291 ítems del REGISTRO_004");

// Nombres de sección para el teléfono
assert.equal(nombreCorto("ALMACÉN — ÁREA DE CUARENTENA/APROBADOS/ALMACENAMIENTO"), "Área de cuarentena / aprobados / almacenamiento");
assert.equal(nombreCorto("ALMACÉN"), "Almacén");

// Un renglón «- …» muestra el enunciado del que depende; un enunciado no tiene contexto
assert.equal(textoItem(L[ALM].items[7]), "— Despacho");
assert.match(contexto(L[ALM], 7).texto, /^El almacén cuenta con las siguientes áreas/);
assert.equal(contexto(L[ALM], 0), null);
assert.match(contexto(L[PER], L[PER].items.findIndex((it) => it.texto === "- Director Técnico")).texto, /registro de capacitación permanente/);

// Siguiente / anterior cruzan secciones y se detienen en los bordes
assert.deepEqual(mover(acta, 0, L[0].items.length - 1, 1), { s: 1, i: 0 });
assert.deepEqual(mover(acta, 1, 0, -1), { s: 0, i: L[0].items.length - 1 });
assert.equal(mover(acta, 0, 0, -1), null);
assert.equal(mover(acta, L.length - 1, L.at(-1).items.length - 1, 1), null);

// «Seguir donde quedé»: secciones 1-3 completas y 7 de 13 en Almacén → Almacén, ítem 8
let a = acta;
for (let s = 0; s < ALM; s++) L[s].items.forEach((_, i) => { a = responder(a, s, i, "si"); });
for (let i = 0; i < 7; i++) a = responder(a, ALM, i, "si");
assert.equal(a.paso, ALM + 1, "paso queda en la sección que se está llenando, como en la web");
assert.deepEqual(dondeQuedo(a), { s: ALM, i: 7 });
assert.equal(primeroDe(a, ALM), 7);
assert.equal(primeroDe(a, 0), 0, "sección completa: entra por el primer ítem");

// Saltar da la vuelta al acta hasta lo que falta, y null cuando ya no falta nada
let casi = { ...a, respuestas: {} };
L.forEach((s, si) => s.items.forEach((_, i) => { casi.respuestas[clave(s, i)] = { v: "si" }; }));
delete casi.respuestas[clave(L[0], 5)];
assert.deepEqual(pendiente(casi, L.length - 1, 0), { s: 0, i: 5 });
casi = responder(casi, 0, 5, "si");
assert.equal(pendiente(casi, 0, 0), null);
assert.equal(casi.completada, true, "con los 291 respondidos el acta queda completa");

// Responder: «No» en un crítico cuenta; tocarlo otra vez lo borra; la observación sobrevive al cambio
const INS = sec("INSTALACIONES, EQUIPOS E INSTRUMENTOS");
const crit = L[INS].items.findIndex((it) => it.severidad === "critico");
let b = responder(acta, INS, crit, "no");
assert.equal(b.hallCritico, 1);
b = { ...b, respuestas: { ...b.respuestas, [clave(L[INS], crit)]: { v: "no", obs: "Galería comercial" } } };
assert.equal(responder(b, INS, crit, "si").respuestas[clave(L[INS], crit)].obs, "Galería comercial");
b = responder(b, INS, crit, "no");
assert.equal(b.respuestas[clave(L[INS], crit)], undefined);
assert.equal(b.hallCritico, 0);
assert.deepEqual(acta.respuestas, {}, "responder no toca el acta original");

// Rutas
assert.deepEqual(ruta(""), { tab: "panorama", hoja: "" });
assert.deepEqual(ruta("#/alertas"), { tab: "panorama", hoja: "alertas" });
assert.deepEqual(ruta("#/actas/nueva/i_1"), { tab: "actas", nueva: true, insp: "i_1" });
assert.deepEqual(ruta("#/acta/x1"), { acta: "x1", pantalla: "mapa" });
assert.deepEqual(ruta("#/acta/x1/4/8"), { acta: "x1", pantalla: "item", s: 3, i: 7 });
assert.deepEqual(ruta("#/acta/x1/0/0"), { acta: "x1", pantalla: "mapa" }, "posición inválida cae en el mapa");
assert.deepEqual(ruta("#/acta/x1/cierre"), { acta: "x1", pantalla: "cierre" });
assert.deepEqual(ruta("#/documentos/expediente/ficha/d9"), { tab: "documentos", vista: "exp", ficha: "d9" });

// domain.queHacer (Panorama de la web y del móvil): urgente, después pronto, después agenda
const off = D.isoDesdeHoy;
const todo = D.queHacer(
  [{ id: "d1", codigo: "POE-1", nombre: "x", rev: off(-1) }, { id: "d2", codigo: "FOR-2", nombre: "y", rev: off(10) }, { id: "d3", codigo: "MAN-3", nombre: "z", rev: off(400) }],
  [{ id: "c1", tema: "BPA", fecha: off(-3) }, { id: "c2", tema: "Frío", fecha: off(9) }, { id: "c3", tema: "Hecha", fecha: off(-9), est: "realizada" }],
  [{ id: "i1", area: "A", prog: off(-2) }, { id: "i2", area: "B", prog: off(5) }, { id: "i3", area: "C", prog: off(-20), real: off(-18), hall: 2 }]
);
assert.deepEqual(todo.map((t) => t.kind + ":" + t.obj.id + ":" + t.nivel),
  ["doc:d1:urgente", "cap:c1:urgente", "insp:i1:urgente", "insp:i3:urgente", "doc:d2:pronto", "insp:i2:agenda", "cap:c2:agenda"]);
assert.equal(todo[3].titulo, "2 hallazgos sin cerrar");

// domain.docsSeccion (expediente de inspección): alias y secciones heredadas caen donde la web los muestra
const [lis, res, , alm] = D.SECCIONES_INSPECCION;
const ins = [{ id: "p", tipoInspeccion: "planos-drogueria" }, { id: "r", tipoInspeccion: "ficha-ruc", nombre: "Ficha RUC" }, { id: "o", tipoInspeccion: "otro-1", seccion: "listados", nombre: "Vehículos" }];
assert.equal(D.docsSeccion(alm, ins)[0].d.id, "p");
assert.deepEqual(D.docsSeccion(res, ins).map((x) => x.titulo), ["Autorización Sanitaria", "Certificado BPA", "Ficha RUC"]);
assert.deepEqual(D.docsSeccion(lis, ins).map((x) => x.titulo).at(-1), "Vehículos");

// public/push-sw.js: muestra siempre el aviso y, al tocarlo, va a la ventana de la app móvil (no a la web del mismo sitio)
const { readFileSync } = await import("node:fs");
const h = {}, mostrados = [], mensajes = [];
let abierta = null;
const ventana = (url) => ({ url, postMessage: (m) => mensajes.push([url, m]), focus: async () => {} });
let ventanas = [ventana("https://bpa-db.web.app/#/"), ventana("https://bpa-db.web.app/movil/#/actas")];
const self = {
  addEventListener: (t, f) => { h[t] = f; },
  registration: { scope: "https://bpa-db.web.app/movil/", showNotification: async (t, o) => mostrados.push([t, o]) },
  clients: { matchAll: async () => ventanas, openWindow: async (u) => { abierta = u; } },
};
new Function("self", readFileSync(new URL("../public/push-sw.js", import.meta.url), "utf8"))(self);
const esperar = (e) => { let p; e.waitUntil = (x) => { p = x; }; return e; };
let ev = esperar({ data: { json: () => ({ title: "BPA Plus · 1 vence hoy o ya venció", body: "POE…", tag: "avisos-hoy", url: "#/alertas" }) } });
h.push(ev); await ev.waitUntil;
ev = esperar({ data: { json: () => { throw new Error("ilegible"); } } });
h.push(ev);
assert.deepEqual(mostrados.map((m) => m[0]), ["BPA Plus · 1 vence hoy o ya venció", "BPA Plus"], "un push ilegible igual muestra aviso (Safari revoca si no)");
const tocar = async (url) => { let p; h.notificationclick({ notification: { close() {}, data: { url } }, waitUntil: (x) => { p = x; } }); await p; };
await tocar("#/alertas");
assert.deepEqual(mensajes, [["https://bpa-db.web.app/movil/#/actas", { ir: "#/alertas" }]]);
ventanas = [ventana("https://bpa-db.web.app/#/")];
await tocar("#/alertas");
assert.equal(abierta, "./#/alertas", "con solo la web abierta, abre la app móvil");

console.log("OK: acta (contexto, mover, pendiente, donde quedó, responder), rutas, queHacer, expediente y aviso push del SW");
