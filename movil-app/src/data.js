// Reglas propias del móvil: recorrer el acta ítem por ítem y leer las rutas #/….
// Estados, puntaje, hallazgos y checklist siguen en ../js/domain.js (window.BPAPLUS.domain).

const GUION = /^\s*[-–—]\s*/;
export const clave = (sec, i) => sec.seccion + "::" + i;

// «ALMACÉN — ÁREA DE CUARENTENA/APROBADOS/ALMACENAMIENTO» → «Área de cuarentena / aprobados / almacenamiento»
export function nombreCorto(seccion) {
  const s = seccion.replace(/^ALMACÉN — /, "").replace(/\s*\/\s*/g, " / ").toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// «- Despacho» se lee mejor como «— Despacho» cuando está solo en la pantalla.
export const textoItem = (it) => it.texto.replace(GUION, "— ");

// Un renglón «- Despacho» depende del último enunciado sin guion que tiene arriba en su sección
// («El almacén cuenta con las siguientes áreas…»): se muestra encima para que se entienda solo.
export function contexto(sec, i) {
  if (!GUION.test(sec.items[i].texto)) return null;
  for (let j = i - 1; j >= 0; j--) if (!GUION.test(sec.items[j].texto)) return sec.items[j];
  return null;
}

export const respondidos = (acta, s) =>
  acta.checklist[s].items.filter((_, i) => acta.respuestas[clave(acta.checklist[s], i)]).length;

export const totalItems = (acta) => acta.checklist.reduce((n, x) => n + x.items.length, 0);

// Posición vecina en el orden del acta, cruzando secciones. null al pasar el principio o el final.
export function mover(acta, s, i, paso) {
  const L = acta.checklist;
  i += paso;
  while (s >= 0 && s < L.length) {
    if (i >= 0 && i < L[s].items.length) return { s, i };
    s += paso;
    if (s < 0 || s >= L.length) break;
    i = paso > 0 ? 0 : L[s].items.length - 1;
  }
  return null;
}

// El primer ítem sin responder después de (s, i), dando la vuelta al acta. null si está completa.
export function pendiente(acta, s, i) {
  let p = { s, i };
  for (let n = totalItems(acta); n > 0; n--) {
    p = mover(acta, p.s, p.i, 1) || { s: 0, i: 0 };
    if (!acta.respuestas[clave(acta.checklist[p.s], p.i)]) return p;
  }
  return null;
}

// «Seguir donde quedé»: desde el principio de la sección donde quedó (`paso`, el mismo campo
// que usa el asistente de la web: 1..N es una sección).
export function dondeQuedo(acta) {
  const s = acta.paso >= 1 && acta.paso <= acta.checklist.length ? acta.paso - 1 : 0;
  return pendiente(acta, s, -1);
}

// Al entrar a una sección desde el mapa: su primer ítem sin responder, o el primero.
export function primeroDe(acta, s) {
  const i = acta.checklist[s].items.findIndex((_, k) => !acta.respuestas[clave(acta.checklist[s], k)]);
  return Math.max(0, i);
}

// Tocar la respuesta ya marcada la borra, como en la web. Devuelve un acta nueva, con los
// hallazgos al día (domain.aplicarHallazgos) y `paso` en la sección que se está llenando.
export function responder(acta, s, i, v) {
  const key = clave(acta.checklist[s], i);
  const respuestas = { ...acta.respuestas };
  if ((respuestas[key] || {}).v === v) delete respuestas[key];
  else respuestas[key] = { ...respuestas[key], v };
  const out = { ...acta, respuestas, paso: s + 1 };
  window.BPAPLUS.domain.aplicarHallazgos(out);
  return out;
}

// Archivo vigente + anexos de un documento (lo mismo que drive.archivos, sin cargar drive.js).
export const archivos = (doc) => (doc ? [doc.file].concat(doc.anexos || []).filter(Boolean) : []);
export const urlDrive = (f) => f.driveUrl || (f.driveId ? "https://drive.google.com/file/d/" + encodeURIComponent(f.driveId) + "/view" : "");

// #/… → qué pantalla. Las hojas (droguerías, alertas, ficha) también son rutas: así el botón
// atrás del teléfono las cierra. Los ítems van de 1 en la URL, como se leen.
export function ruta(hash) {
  const p = String(hash || "").replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  if (p[0] === "actas") return { tab: "actas", nueva: p[1] === "nueva", insp: p[1] === "nueva" ? p[2] || "" : "" };
  if (p[0] === "acta" && p[1]) {
    if (p[2] === "datos" || p[2] === "cierre") return { acta: p[1], pantalla: p[2] };
    const s = +p[2] - 1, i = +p[3] - 1;
    if (Number.isInteger(s) && Number.isInteger(i) && s >= 0 && i >= 0) return { acta: p[1], pantalla: "item", s, i };
    return { acta: p[1], pantalla: "mapa" };
  }
  if (p[0] === "documentos") {
    const exp = p[1] === "expediente", r = p.slice(exp ? 2 : 1);
    return { tab: "documentos", vista: exp ? "exp" : "docs", ficha: r[0] === "ficha" ? r[1] || "" : "" };
  }
  return { tab: "panorama", hoja: p[0] === "droguerias" || p[0] === "alertas" ? p[0] : "" };
}
