// BPA Plus móvil (boceto aprobado el 2026-11-02, ../boceto-movil-bpaplus.html).
// No es la web en pequeño: es el acta REGISTRO_004 en la mano para recorrer el almacén, el
// panorama de la droguería activa y la consulta de documentos. Lo administrativo queda en la web.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alerts, Avisos, Cloud, D, DB, Lock, UI } from "./legacy.js";
import {
  archivos, clave, contexto, dondeQuedo, mover, nombreCorto, pendiente, primeroDe, respondidos, responder, ruta, textoItem, urlDrive,
} from "./data.js";

const WEB_URL = "https://bpa-db.web.app/";
const THEME_KEY = "bpa-plus-theme-v2"; // la misma clave que la web: mismo tema en el mismo sitio
const KINDS = ["droguerias", "documentos", "documentosInspeccion", "capacitaciones", "inspecciones", "actas"];
const NIVEL = { urgente: "Urgente", pronto: "Pronto", agenda: "Agenda" };
const DIAS_CLS = { late: "urgente", soon: "pronto", ok: "ok", muted: "agenda" };
const KIND_LABEL = { doc: "Documento", cap: "Capacitación", insp: "Autoinspección" };

/* ---------- Rutas #/… con pushState: el botón atrás del teléfono cierra hojas y vuelve del ítem al mapa ---------- */
let emitir = () => {};
const nav = {
  push(p) { history.pushState({ d: (history.state?.d || 0) + 1 }, "", "#" + p); emitir(); },
  replace(p) { history.replaceState({ d: history.state?.d || 0 }, "", "#" + p); emitir(); },
  // Atrás dentro de la app; si se entró directo por la URL, a `fallback` sin salir de la app.
  back(fallback = "/") { if ((history.state?.d || 0) > 0) history.back(); else nav.replace(fallback); },
};

/* ---------- Avisos: también los de cloud.js (un rechazo de Firestore llega por UI.note) ---------- */
let avisar = () => {};
UI.note = (msg) => avisar(msg);

const Ico = ({ n, s = 20 }) => <span className="ico" aria-hidden="true" dangerouslySetInnerHTML={{ __html: UI.icon(n, s) }} />;
const Logo = ({ s = 22 }) => (
  <svg width={s} height={s} viewBox="0 0 64 64" aria-hidden="true">
    <rect x="10" y="10" width="6" height="44" rx="2" fill="#173B58" />
    <path d="M16 32a16 16 0 0 1 32 0h-8a8 8 0 0 0-16 0z" fill="#2370A1" />
    <path d="M16 32a16 16 0 0 0 32 0h-8a8 8 0 0 1-16 0z" fill="#173B58" />
  </svg>
);
const plural = (n, uno, varios) => n + " " + (n === 1 ? uno : varios);
const pct = (n, t) => (t ? Math.round((n / t) * 100) : 0) + "%";
const porFecha = (a, b) => String(b.fecha || "").localeCompare(String(a.fecha || ""));
const normalizar = (a) => ({ ...a, checklist: a.checklist || D.checklistOficial(), respuestas: a.respuestas || {} });
const enCurso = (actas) => actas.filter((a) => !a.completada).sort(porFecha);
const urlItem = (id, p) => (p ? `/acta/${id}/${p.s + 1}/${p.i + 1}` : `/acta/${id}/cierre`);

const esOscuro = () => document.documentElement.classList.contains("dark");
function pintarTema() { document.getElementById("themeColor")?.setAttribute("content", esOscuro() ? "#0B1726" : "#173B58"); }
function cambiarTema() {
  const t = esOscuro() ? "light" : "dark";
  document.documentElement.classList.toggle("dark", t === "dark");
  try { localStorage.setItem(THEME_KEY, t); } catch { /* sin almacenamiento: solo esta vez */ }
  pintarTema();
}

export default function App() {
  const [user, setUser] = useState(undefined); // undefined = cargando Firebase, null = sin sesión
  const [errArranque, setErrArranque] = useState("");
  const [abierto, setAbierto] = useState(false); // PIN
  const [data, setData] = useState(null);
  const [errDatos, setErrDatos] = useState("");
  const [dgId, setDgId] = useState("");
  const [r, setR] = useState(() => ruta(location.hash));
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    pintarTema();
    emitir = () => setR(ruta(location.hash));
    const red = () => setOnline(navigator.onLine);
    // Tocar un aviso push con la app abierta: el SW (public/push-sw.js) pide ir a su ruta sin recargar.
    const aviso = (e) => e.data && e.data.ir && nav.push(String(e.data.ir).replace(/^#/, ""));
    addEventListener("popstate", emitir); addEventListener("hashchange", emitir);
    addEventListener("online", red); addEventListener("offline", red);
    navigator.serviceWorker?.addEventListener("message", aviso);
    return () => {
      removeEventListener("popstate", emitir); removeEventListener("hashchange", emitir);
      removeEventListener("online", red); removeEventListener("offline", red);
      navigator.serviceWorker?.removeEventListener("message", aviso);
    };
  }, []);

  // La misma cuenta de Firebase que la web (js/cloud.js).
  useEffect(() => {
    if (!Cloud) { setUser({ demo: true }); return; } // modo demo: sin cuenta, datos en este navegador
    let vivo = true, quitar = () => {}, empezado = false;
    Cloud.init().then(() => {
      if (!vivo) return;
      quitar = Cloud.api().onAuthStateChanged(Cloud.getAuth(), (u) => {
        Cloud.setUid(u && u.uid);
        // Volvió a entrar sin recargar (quizá otra cuenta): lo que hay en memoria es de la anterior.
        if (empezado && u) return location.reload();
        if (u) empezado = true;
        setUser(u || null);
      });
    }).catch((err) => vivo && setErrArranque(err?.message || String(err)));
    return () => { vivo = false; quitar(); };
  }, []);

  const cargar = (cached) =>
    Promise.all(KINDS.map((k) => DB.getAll(k, cached)).concat(DB.getMeta("dgActiva", "", cached)))
      .then((rs) => ({ d: Object.fromEntries(KINDS.map((k, i) => [k, rs[i]])), dg: rs[KINDS.length] }));
  const refrescar = () => cargar(false)
    .then((y) => setData((prev) => (JSON.stringify(prev) === JSON.stringify(y.d) ? prev : y.d)))
    .catch(() => { /* sin red: queda la caché, que Firestore sincroniza sola */ });

  // Primero la caché de Firestore (al instante y sin señal); después el servidor, como loadData/refresh en app.js.
  useEffect(() => {
    if (!user) return;
    let vivo = true;
    // En el modo demo se siembra el ejemplo de la web (db.ensureSeed, que también siembra un retiro).
    const sembrar = Cloud ? Promise.resolve() : import("../../js/retiro.js").then(() => DB.ensureSeed());
    sembrar.then(() => cargar(true)).catch(() => null)
      .then((x) => (x && x.d.droguerias.length ? x : cargar(false)))
      .then((x) => { if (!vivo) return; setData(x.d); setDgId((v) => v || x.dg || ""); refrescar(); })
      .catch((err) => vivo && setErrDatos(err?.message || String(err)));
    return () => { vivo = false; };
  }, [user]);
  useEffect(() => { if (online && data) refrescar(); }, [online]);

  /* Guardar: la pantalla cambia al instante (ninguna acción espera al servidor, regla de la web).
     Lo que se tipea (observaciones, cierre) se junta 600 ms antes de escribir.
     ponytail: cada escritura manda el acta entera (~40 KB), igual que la web; si la cola sin señal
     pesa demasiado, escribir solo la respuesta tocada con setDoc + merge. */
  const pendientes = useRef(new Map());
  const escribir = (kind, obj) => Promise.resolve().then(() => DB.put(kind, obj))
    .catch((err) => avisar("No se pudo guardar: " + (err?.message || err)));
  const guardar = useCallback((kind, obj, diferido) => {
    setData((d) => ({ ...d, [kind]: d[kind].some((x) => x.id === obj.id) ? d[kind].map((x) => (x.id === obj.id ? obj : x)) : d[kind].concat(obj) }));
    const p = pendientes.current.get(obj.id);
    if (p) clearTimeout(p.t);
    if (!diferido) { pendientes.current.delete(obj.id); return escribir(kind, obj); }
    pendientes.current.set(obj.id, { kind, obj, t: setTimeout(() => { pendientes.current.delete(obj.id); escribir(kind, obj); }, 600) });
  }, []);
  useEffect(() => {
    const vaciar = () => { pendientes.current.forEach((p) => { clearTimeout(p.t); escribir(p.kind, p.obj); }); pendientes.current.clear(); };
    const oculto = () => document.visibilityState === "hidden" && vaciar();
    addEventListener("pagehide", vaciar); document.addEventListener("visibilitychange", oculto);
    return () => { removeEventListener("pagehide", vaciar); document.removeEventListener("visibilitychange", oculto); };
  }, []);

  const setDg = (id) => { setDgId(id); Promise.resolve().then(() => DB.setMeta("dgActiva", id)).catch(() => {}); };
  const dg = data && (data.droguerias.find((x) => x.id === dgId) || data.droguerias[0]);
  const byDg = (k) => (data && dg ? data[k].filter((x) => x.e === dg.id) : []);
  // Las alertas de la web (alerts.js): 30 días, todas las droguerías.
  const alertas = useMemo(() => { if (!data) return []; Alerts.setStore({ data }); return Alerts.collect(); }, [data]);
  // Los vencimientos van al Worker para los avisos push (js/avisos.js); solo manda si algo cambió.
  useEffect(() => { if (data && Cloud) Avisos.programar(); }, [data]);

  const llave = r.acta ? r.acta + r.pantalla + r.s + "." + r.i : r.tab + (r.vista || "") + (r.nueva ? "n" : "");
  useEffect(() => { window.scrollTo(0, 0); }, [llave]);

  if (errArranque) return <Aviso titulo="No se pudo abrir BPA Plus" texto={(online ? errArranque : "Sin conexión.") + " La primera vez hace falta señal para cargar Firebase."} />;
  if (user === null) return <><Login /><Toasts /></>;
  if (!abierto && (Lock.isEnabled() || user)) return <Pin crear={!Lock.isEnabled()} onOk={() => setAbierto(true)} />;
  if (errDatos) return <Aviso titulo="No se pudieron cargar tus datos" texto={errDatos + (online ? "" : " · Sin conexión: ábrela una vez con señal.")} />;
  if (!user || !data) return <Cargando />;
  if (!dg) return <Aviso titulo="Todavía no hay droguerías" texto="Créalas en la versión web; aparecen aquí solas." web />;

  const ctx = { data, dg, byDg, guardar, setDg, alertas, online };
  let pantalla, tabs = true, hoja = null;
  if (r.acta) {
    tabs = false;
    const crudo = data.actas.find((a) => a.id === r.acta);
    const a = crudo && normalizar(crudo);
    const insp = byDg("inspecciones");
    if (!a) pantalla = <Aviso titulo="Esa acta ya no está" texto="Quizá se eliminó desde la web." volver />;
    else if (r.pantalla === "item" && a.checklist[r.s]?.items[r.i]) pantalla = <Item a={a} s={r.s} i={r.i} guardar={guardar} online={online} />;
    else if (r.pantalla === "datos") pantalla = <DatosActa acta={a} dg={dg} inspecciones={insp} titulo="Datos generales" boton="Guardar"
      onGuardar={(f) => { guardar("actas", { ...a, ...f }); nav.back(`/acta/${a.id}`); }} />;
    else if (r.pantalla === "cierre") pantalla = <Cierre a={a} insp={insp} guardar={guardar} />;
    else pantalla = <Mapa a={a} insp={insp} />;
  } else if (r.tab === "actas") {
    if (r.nueva) { tabs = false; pantalla = <NuevaActa dg={dg} byDg={byDg} guardar={guardar} insp={r.insp} />; }
    else pantalla = <Actas dg={dg} byDg={byDg} />;
  } else if (r.tab === "documentos") {
    pantalla = <Documentos dg={dg} byDg={byDg} vista={r.vista} ficha={r.ficha} />;
  } else {
    pantalla = <Panorama {...ctx} />;
    if (r.hoja === "droguerias") hoja = <HojaDroguerias {...ctx} />;
    if (r.hoja === "alertas") hoja = <HojaAlertas {...ctx} />;
  }

  return (
    <div className={"app" + (tabs ? " con-tabs" : "")}>
      {pantalla}
      {tabs && <Tabs tab={r.tab} />}
      {hoja}
      <Toasts />
    </div>
  );
}

/* =============================== Panorama =============================== */
function Panorama({ dg, byDg, guardar, alertas, online }) {
  const docs = byDg("documentos"), caps = byDg("capacitaciones"), insp = byDg("inspecciones"), actas = byDg("actas").map(normalizar);
  const sc = D.scoreCumplimiento(docs, caps, insp);
  const todo = D.queHacer(docs, caps, insp);
  const abiertas = enCurso(actas);
  const actual = abiertas[0];

  const iniciar = (i) => {
    const a = abiertas.find((x) => x.inspeccionId === i.id);
    if (a) seguir(a); else nav.push("/actas/nueva/" + i.id);
  };
  const realizada = (c) => {
    guardar("capacitaciones", { ...c, est: "realizada" });
    UI.haptic(10);
    avisar("Capacitación marcada como realizada", { label: "Deshacer", fn: () => guardar("capacitaciones", c) });
  };
  const fila = (t, k) => {
    const o = t.obj;
    let lado = <span className={"tag " + t.nivel}>{NIVEL[t.nivel]}</span>, abrir = null;
    if (t.kind === "doc") abrir = () => nav.push("/documentos/ficha/" + o.id);
    if (t.kind === "cap") lado = <button className="act" onClick={() => realizada(o)}>Realizada</button>;
    if (t.kind === "insp" && !o.real) lado = <button className="act" onClick={() => iniciar(o)}>{abiertas.some((a) => a.inspeccionId === o.id) ? "Seguir acta" : "Iniciar acta"}</button>;
    if (t.kind === "insp" && o.real) {
      const a = actas.filter((x) => x.inspeccionId === o.id).sort(porFecha)[0];
      if (a) abrir = () => nav.push("/acta/" + a.id);
    }
    const txt = <span className="tx"><b>{t.titulo}</b><span className="sub">{t.sub}</span></span>;
    return (
      <div className="todo-row" key={k}>
        {abrir ? <button className="todo-btn" onClick={abrir}>{txt}</button> : txt}
        {lado}
      </div>
    );
  };

  return (
    <>
      <header className="dghead">
        <span className="logo"><Logo /></span>
        <button className="dgname" onClick={() => nav.push("/droguerias")} aria-label="Cambiar droguería">
          <b>{dg.nombre}</b>
          <small><span className={"dot-sync" + (online ? "" : " off")} /><span className="mono">{dg.ruc ? "RUC " + dg.ruc : "Sin RUC"}</span> · {!Cloud ? "Demo local" : online ? "Conectado" : "Sin conexión"} ▾</small>
        </button>
        <button className="bell" onClick={() => nav.push("/alertas")} aria-label={"Alertas" + (alertas.length ? " (" + alertas.length + ")" : "")}>
          <Ico n="bell" />{alertas.length > 0 && <span className="badge">{alertas.length}</span>}
        </button>
      </header>
      <main className="pad cuerpo">
        {actual ? <ActaCta a={actual} insp={insp} /> : (
          <section className="card acta-cta">
            <div className="k">Autoinspección</div>
            <div className="t">Sin acta en curso</div>
            <div className="s">Empieza una desde la autoinspección programada o en blanco.</div>
            <button className="btn pri" onClick={() => nav.push("/actas/nueva")}><Ico n="plus" />Nueva acta</button>
          </section>
        )}
        <section className="card score" aria-label="Cumplimiento">
          <div className="ring">
            <svg viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="15.9" className="r-bg" /><circle cx="18" cy="18" r="15.9" className="r-fg" strokeDasharray={sc.score + " 100"} /></svg>
            <b>{sc.score}%</b>
          </div>
          <div className="meters">
            <Medidor l="Documentos al día" n={sc.docsOK} t={sc.docsTot} />
            <Medidor l="Capacitaciones al día" n={sc.capsOK} t={sc.capsTot} />
            <Medidor l="Autoinspecciones" n={sc.inspOK} t={sc.inspTot} />
          </div>
        </section>
        <h2 className="sec-t">Qué hacer ahora</h2>
        {todo.length ? <section className="card todo">{todo.map(fila)}</section>
          : <section className="card vacio"><Ico n="check" /> Nada vencido ni atrasado en esta droguería.</section>}
      </main>
    </>
  );
}

const Medidor = ({ l, n, t }) => (
  <div><span>{l}</span><span className="mono">{n}/{t}</span><em><i style={{ width: pct(n, t) }} /></em></div>
);

function seguir(a) {
  nav.push("/acta/" + a.id);
  nav.push(urlItem(a.id, dondeQuedo(a)));
}

function ActaCta({ a, insp }) {
  const h = D.hallazgos(a), dq = dondeQuedo(a), L = a.checklist.length;
  const destino = insp.find((i) => i.id === a.inspeccionId);
  return (
    <section className="card acta-cta">
      <div className="k">Acta en curso</div>
      <div className="t">Acta N.° <span className="mono">{a.numActa || "—"}</span> · {destino ? destino.area : a.almacen}</div>
      <div className="s">Sección {dq ? dq.s + 1 : L} de {L} · <span className="mono">{h.evaluados} / {h.total}</span> ítems · {plural(h.critico, "crítico", "críticos")}, {plural(h.mayor, "mayor", "mayores")}</div>
      <div className="bar"><i style={{ width: pct(h.evaluados, h.total) }} /></div>
      <button className="btn pri" onClick={() => seguir(a)}>Seguir el recorrido</button>
    </section>
  );
}

function Tabs({ tab }) {
  const T = [["panorama", "/", "dashboard", "Panorama"], ["actas", "/actas", "clipboard", "Acta"], ["documentos", "/documentos", "doc", "Documentos"]];
  return (
    <nav className="tabs" aria-label="Secciones">
      {T.map(([id, p, ic, l]) => (
        <button key={id} className={"tab" + (tab === id ? " on" : "")} aria-current={tab === id ? "page" : undefined} onClick={() => tab !== id && nav.replace(p)}>
          <span className="ic"><Ico n={ic} /></span>{l}
        </button>
      ))}
    </nav>
  );
}

/* =============================== Actas =============================== */
function Actas({ dg, byDg }) {
  const insp = byDg("inspecciones");
  const actas = byDg("actas").map(normalizar).sort((x, y) => (x.completada ? 1 : 0) - (y.completada ? 1 : 0) || porFecha(x, y));
  return (
    <>
      <header className="ptop"><h1>Actas de inspección</h1><p>REGISTRO_004 · {dg.nombre}</p></header>
      <main className="pad cuerpo">
        <button className="btn pri" onClick={() => nav.push("/actas/nueva")}><Ico n="plus" />Nueva acta</button>
        {actas.length ? (
          <section className="card lista" style={{ marginTop: 14 }}>
            {actas.map((a) => {
              const h = D.hallazgos(a), destino = insp.find((i) => i.id === a.inspeccionId);
              return (
                <button key={a.id} className="arow" onClick={() => nav.push("/acta/" + a.id)}>
                  <span className="tx">
                    <b>Acta N.° <span className="mono">{a.numActa || "—"}</span></b>
                    <span className="sub">{D.fLocal(a.fecha)}{a.auditor ? " · " + a.auditor : ""}{destino ? " · " + destino.area : ""}{h.abiertos ? " · " + plural(h.abiertos, "hallazgo", "hallazgos") : ""}</span>
                    <small className="mini"><i style={{ width: pct(h.evaluados, h.total) }} /></small>
                  </span>
                  <span className={"tag " + (a.completada ? "ok" : "pronto")}>{a.completada ? "Completada" : pct(h.evaluados, h.total)}</span>
                </button>
              );
            })}
          </section>
        ) : <p className="vacio-txt">Todavía no hay actas en esta droguería.</p>}
      </main>
    </>
  );
}

const CAMPOS_MAS = [
  ["ruc", "R.U.C.", "mono"], ["rdAutorizacion", "R.D. autorización sanitaria"], ["planos", "Planos de distribución de las áreas del almacén"],
  ["clientesProveedores", "Relación de clientes y proveedores"], ["productos", "Relación de productos que comercializa"],
  ["poeVerificados", "Lista de procedimientos operativos estándar verificados"],
];

// Los datos generales del acta: los mismos campos que el primer paso del asistente de la web.
function DatosActa({ acta, dg, inspecciones, titulo, boton, onGuardar }) {
  const [f, setF] = useState(() => {
    const o = {};
    ["numActa", "inspeccionId", "fecha", "auditor", "almacen", "resultadosPrevios"].concat(CAMPOS_MAS.map((c) => c[0])).forEach((k) => { o[k] = acta[k] || ""; });
    return o;
  });
  const campo = (k) => ({ value: f[k], onChange: (e) => setF({ ...f, [k]: e.target.value }) });
  const destinos = inspecciones.slice().sort((x, y) => String(y.prog || "").localeCompare(String(x.prog || "")));
  const enviar = (e) => {
    e.preventDefault();
    const o = {};
    Object.keys(f).forEach((k) => { o[k] = String(f[k]).trim(); });
    o.fecha = o.fecha || D.isoHoy();
    o.almacen = o.almacen || dg.nombre;
    const destino = destinos.find((i) => i.id === o.inspeccionId);
    if (destino) o.area = destino.area;
    onGuardar(o);
  };
  return (
    <div className="pantalla">
      <header className="ahead compacto">
        <button className="back" onClick={() => nav.back("/actas")}>‹ Volver</button>
        <h3>{titulo}</h3>
        <div className="meta">REGISTRO_004 · {dg.nombre}</div>
      </header>
      <form className="form pad" onSubmit={enviar}>
        <label>Acta N.°<input className="inp mono" {...campo("numActa")} placeholder="001-2026" /></label>
        <label>Autoinspección destino
          <select className="inp" {...campo("inspeccionId")}>
            <option value="">Sin asignar</option>
            {destinos.map((i) => <option key={i.id} value={i.id}>{i.area} · {D.fLocal(i.prog)} · {i.real ? "Realizada" : "Pendiente"}</option>)}
          </select>
        </label>
        <div className="dos">
          <label>Fecha<input className="inp" type="date" {...campo("fecha")} /></label>
          <label>Auditor<input className="inp" {...campo("auditor")} /></label>
        </div>
        <label>Almacén inspeccionado<input className="inp" {...campo("almacen")} /></label>
        <details className="mas">
          <summary>Más datos del acta (opcional)</summary>
          {CAMPOS_MAS.map(([k, l, m]) => <label key={k}>{l}<input className={"inp" + (m ? " mono" : "")} {...campo(k)} /></label>)}
          <label>Resultados de inspecciones anteriores<textarea className="inp" rows={3} {...campo("resultadosPrevios")} placeholder="Plan de acciones realizadas y su eficacia…" /></label>
        </details>
        <button className="btn pri" type="submit">{boton}</button>
      </form>
    </div>
  );
}

function NuevaActa({ dg, byDg, guardar, insp }) {
  const base = useMemo(() => ({ ...D.actaNueva(dg), inspeccionId: insp || "" }), [dg.id, insp]);
  return (
    <DatosActa acta={base} dg={dg} inspecciones={byDg("inspecciones")} titulo="Nueva acta" boton="Comenzar el recorrido"
      onGuardar={(f) => {
        const a = { ...base, ...f };
        guardar("actas", a);
        nav.replace("/acta/" + a.id);
        nav.push(`/acta/${a.id}/1/1`);
      }} />
  );
}

/* =============================== Acta: mapa de secciones =============================== */
function Mapa({ a, insp }) {
  const h = D.hallazgos(a), L = a.checklist, dq = dondeQuedo(a);
  const destino = insp.find((i) => i.id === a.inspeccionId);
  const ir = (s, i) => nav.push(`/acta/${a.id}/${s + 1}/${i + 1}`);
  return (
    <div className="pantalla">
      <header className="ahead">
        <button className="back" onClick={() => nav.back("/actas")}>‹ Volver</button>
        <h3>Acta N.° <span className="mono">{a.numActa || "—"}</span></h3>
        <div className="meta">REGISTRO_004 · {destino ? destino.area : a.almacen} · {D.fLocal(a.fecha)}{a.auditor ? " · " + a.auditor : ""}</div>
        <div className="bar"><i style={{ width: pct(h.evaluados, h.total) }} /></div>
        <div className="hall">
          <span className="c"><b>{h.critico}</b>Críticos</span><span className="m"><b>{h.mayor}</b>Mayores</span>
          <span><b>{h.menor}</b>Menores</span><span><b>{h.evaluados}</b>de {h.total}</span>
        </div>
      </header>
      <main className="pad cuerpo mapa">
        <section className="card secs">
          <button className="srow" onClick={() => nav.push(`/acta/${a.id}/datos`)}>
            <span className="n"><Ico n="edit" s={14} /></span><span className="tx">Datos generales del acta</span><span className="cnt">›</span>
          </button>
          {L.map((sec, s) => {
            const d = respondidos(a, s), t = sec.items.length;
            return (
              <button key={s} className={"srow" + (d === t ? " done" : dq && dq.s === s ? " cur" : "")} onClick={() => ir(s, primeroDe(a, s))}>
                <span className="n">{d === t ? "✓" : s + 1}</span>
                <span className="tx">{nombreCorto(sec.seccion)}<small><i style={{ width: pct(d, t) }} /></small></span>
                <span className="cnt">{d}/{t}</span>
              </button>
            );
          })}
          <button className="srow" onClick={() => nav.push(`/acta/${a.id}/cierre`)}>
            <span className="n"><Ico n="check" s={14} /></span><span className="tx">Cierre y resultado</span><span className="cnt">›</span>
          </button>
        </section>
      </main>
      <div className="sticky">
        <button className="btn pri" onClick={() => (dq ? ir(dq.s, dq.i) : nav.push(`/acta/${a.id}/cierre`))}>
          {dq ? `Seguir donde quedé · ${nombreCorto(L[dq.s].seccion)}, ítem ${dq.i + 1}` : "Ir al cierre"}
        </button>
      </div>
    </div>
  );
}

/* =============================== Acta: un ítem a la vez =============================== */
function Item({ a, s, i, guardar, online }) {
  const sec = a.checklist[s], it = sec.items[i], key = clave(sec, i), r = a.respuestas[key] || {};
  const ctx = contexto(sec, i);
  const obsRef = useRef(null);
  const ir = (p) => nav.replace(urlItem(a.id, p));
  const marcar = (v) => {
    const b = responder(a, s, i, v);
    guardar("actas", b);
    UI.haptic(10);
    const quedo = b.respuestas[key]?.v;
    if (quedo === "si") setTimeout(() => ir(mover(b, s, i, 1)), 180); // Sí pasa solo al siguiente
    if (quedo === "no") setTimeout(() => obsRef.current?.focus(), 60); // No espera la observación
  };
  const obs = (e) => guardar("actas", { ...a, respuestas: { ...a.respuestas, [key]: { ...r, obs: e.target.value } } }, true);
  const antes = mover(a, s, i, -1);

  return (
    <div className="pantalla item">
      <header className="itop">
        <button className="back" onClick={() => nav.back(`/acta/${a.id}`)}>‹ {nombreCorto(sec.seccion)}</button>
        <span className="pos">ítem {i + 1} / {sec.items.length}</span>
      </header>
      <div className={"ticks" + (sec.items.length > 40 ? " muchos" : "")} aria-hidden="true">
        {sec.items.map((_, k) => <i key={k} className={k === i ? "cur" : a.respuestas[clave(sec, k)]?.v || ""} />)}
      </div>
      {!online && <div className="offline">● Sin conexión · se guarda en el teléfono y se envía al volver</div>}
      <section className="card qcard">
        <div className="qsec">Sección {s + 1} · {nombreCorto(sec.seccion)}</div>
        {ctx && <div className="ctx">{ctx.ref && <b>{ctx.ref}) </b>}{ctx.texto}</div>}
        <h2 className="q">{!ctx && it.ref && <span className="ref">{it.ref}) </span>}{textoItem(it)}</h2>
        {it.severidad && <span className={"sev " + it.severidad}>{D.SEV_LABEL[it.severidad]}</span>}
      </section>
      {r.v === "no" && (
        <div className="obs">
          <label htmlFor="obs">Observación del hallazgo</label>
          <textarea id="obs" ref={obsRef} className="ta" rows={3} value={r.obs || ""} onChange={obs} placeholder="Qué se encontró y dónde…" />
          <div className="hint">🎤 Dicta con el micrófono del teclado · se guarda mientras escribes</div>
        </div>
      )}
      <footer className="ifoot">
        <div className="yn">
          <button className={"si" + (r.v === "si" ? " sel" : "")} aria-pressed={r.v === "si"} onClick={() => marcar("si")}><Ico n="check" s={22} />Sí</button>
          <button className={"no" + (r.v === "no" ? " sel" : "")} aria-pressed={r.v === "no"} onClick={() => marcar("no")}><Ico n="x" s={22} />No</button>
        </div>
        <div className="nav2">
          <button disabled={!antes} onClick={() => ir(antes)}>‹ Anterior</button>
          <button onClick={() => ir(pendiente(a, s, i))}>Saltar</button>
          <button className="next" onClick={() => ir(mover(a, s, i, 1))}>Siguiente ›</button>
        </div>
      </footer>
    </div>
  );
}

/* =============================== Acta: cierre y resultado =============================== */
function Cierre({ a, insp, guardar }) {
  const h = D.hallazgos(a), destino = insp.find((i) => i.id === a.inspeccionId);
  const faltan = a.checklist.map((sec, s) => ({ sec, s, f: sec.items.length - respondidos(a, s) })).filter((x) => x.f > 0);
  const texto = (k) => ({ value: a[k] || "", onChange: (e) => guardar("actas", { ...a, [k]: e.target.value }, true) });
  // Lo que en la web es «Registrar resultado» de la autoinspección, con los datos del acta.
  const registrar = () => {
    guardar("inspecciones", {
      ...destino, real: a.fecha || D.isoHoy(), hall: h.abiertos,
      result: (a.conclusiones || "").trim() || `Acta N.° ${a.numActa || "—"}: ${h.evaluados} de ${h.total} ítems evaluados; ${plural(h.critico, "hallazgo crítico", "hallazgos críticos")}, ${h.mayor} mayor(es), ${h.menor} menor(es).`,
    });
    avisar("Resultado registrado en la autoinspección", { label: "Deshacer", fn: () => guardar("inspecciones", destino) });
  };
  return (
    <div className="pantalla">
      <header className="ahead compacto">
        <button className="back" onClick={() => nav.back(`/acta/${a.id}`)}>‹ Secciones</button>
        <h3>Cierre del acta</h3>
        <div className="meta">Acta N.° {a.numActa || "—"} · {D.fLocal(a.fecha)}</div>
      </header>
      <main className="pad cuerpo form">
        <section className="card resumen">
          <div className="fila-res"><span>Ítems evaluados</span><b className="mono">{h.evaluados} / {h.total} ({pct(h.evaluados, h.total)})</b></div>
          <div className="bar"><i style={{ width: pct(h.evaluados, h.total) }} /></div>
          <div className="chips">
            <span className="sev critico">{plural(h.critico, "crítico", "críticos")}</span>
            <span className="sev mayor">{plural(h.mayor, "mayor", "mayores")}</span>
            <span className="sev menor">{plural(h.menor, "menor", "menores")}</span>
          </div>
          {faltan.length > 4 && <p className="faltan">Faltan {faltan.length} secciones por terminar: sigue el recorrido desde el mapa.</p>}
          {faltan.length > 0 && faltan.length <= 4 && (
            <div className="faltan">
              <span>Secciones sin terminar:</span>
              {faltan.map((x) => <button key={x.s} className="link" onClick={() => nav.push(`/acta/${a.id}/${x.s + 1}/${primeroDe(a, x.s) + 1}`)}>{nombreCorto(x.sec.seccion)} ({x.f})</button>)}
            </div>
          )}
        </section>
        <label>Observaciones adicionales<textarea className="inp" rows={3} {...texto("observAdicionales")} /></label>
        <label>Evaluación y conclusiones<textarea className="inp" rows={3} {...texto("conclusiones")} /></label>
        <label>Propuestas de medidas correctivas<textarea className="inp" rows={3} {...texto("medidas")} /></label>
        <section className="card resultado">
          <h4>Resultado de la autoinspección</h4>
          {!destino && <p>Vincula el acta a una autoinspección en <button className="link" onClick={() => nav.push(`/acta/${a.id}/datos`)}>Datos generales</button> para registrar su resultado.</p>}
          {destino && destino.real && <p><b>{destino.area}</b>: registrado el {D.fLocal(destino.real)} · {plural(destino.hall || 0, "hallazgo abierto", "hallazgos abiertos")}.</p>}
          {destino && !destino.real && (
            <>
              <p><b>{destino.area}</b> · programada el {D.fLocal(destino.prog)}. Se registra con la fecha del acta y {plural(h.abiertos, "hallazgo abierto", "hallazgos abiertos")} (críticos + mayores).{a.completada ? "" : " El acta todavía no está completa."}</p>
              <button className="btn pri" onClick={registrar}><Ico n="check" />Registrar resultado</button>
            </>
          )}
        </section>
        <p className="nota">El acta impresa y el formato propio de la droguería salen desde la versión web.</p>
      </main>
    </div>
  );
}

/* =============================== Documentos y expediente =============================== */
function Documentos({ dg, byDg, vista, ficha }) {
  const [q, setQ] = useState("");
  const docs = byDg("documentos"), ins = byDg("documentosInspeccion");
  const nq = D.normTxt(q);
  const base = vista === "exp" ? "/documentos/expediente" : "/documentos";
  const abrir = (id) => nav.push(base + "/ficha/" + id);

  // Agrupados por criterio y ordenados como en la vista Documentos de la web.
  const crit = dg.criterios && dg.criterios.length ? dg.criterios : D.CRITERIOS_DEFAULT;
  const grupos = new Map(crit.concat(D.MISC_LABEL).map((c) => [c, []]));
  docs.filter((d) => !nq || D.normTxt(d.codigo + " " + d.nombre + " " + d.area).includes(nq)).forEach((d) => {
    const c = D.criterioDeDoc(d, crit);
    if (!grupos.has(c)) grupos.set(c, []);
    grupos.get(c).push(d);
  });
  grupos.forEach((l) => l.sort((x, y) => {
    const nx = D.numeroEnNombre(x.codigo || x.nombre), ny = D.numeroEnNombre(y.codigo || y.nombre);
    return nx !== ny ? nx - ny : (x.codigo || "").localeCompare(y.codigo || "");
  }));

  const secciones = D.SECCIONES_INSPECCION.map((s) => ({ s, filas: D.docsSeccion(s, ins) }));
  const requeridos = secciones.flatMap((x) => x.filas.filter((f) => f.tipo));
  const cargados = requeridos.filter((f) => archivos(f.d).length).length;

  let cuerpo;
  if (vista === "exp") {
    let grupoPrevio = null;
    cuerpo = (
      <>
        <p className="avance">{cargados} de {requeridos.length} requeridos cargados</p>
        {secciones.map(({ s, filas }) => {
          const vis = filas.filter((x) => !nq || D.normTxt(x.titulo).includes(nq));
          const cab = s.grupo && s.grupo !== grupoPrevio ? <h2 className="sec-t">{s.grupo}</h2> : null;
          grupoPrevio = s.grupo || null;
          if (!vis.length && nq) return null;
          return (
            <React.Fragment key={s.id}>
              {cab}
              <h3 className={s.grupo ? "sub-t" : "sec-t"}>{s.titulo}</h3>
              <section className="card dlist">
                {vis.length ? vis.map((x, k) => {
                  const n = archivos(x.d).length;
                  return (
                    <button key={k} className="drow" disabled={!n} onClick={() => abrir(x.d.id)}>
                      <span className="tx"><span className="nm">{x.titulo}</span><span className="sub">{n ? plural(n, "archivo", "archivos") : "Se carga desde la web"}</span></span>
                      <span className={"tag " + (n ? "ok" : "pronto")}>{n ? "Cargado" : "Pendiente"}</span>
                    </button>
                  );
                }) : <p className="vacio-txt">Aún no hay documentos.</p>}
              </section>
            </React.Fragment>
          );
        })}
      </>
    );
  } else {
    const llenos = [...grupos].filter(([, l]) => l.length);
    cuerpo = llenos.length ? llenos.map(([c, l]) => (
      <React.Fragment key={c}>
        <h2 className="sec-t">{c} <span className="cuenta">· {l.length}</span></h2>
        <section className="card dlist">
          {l.map((d) => (
            <button key={d.id} className="drow" onClick={() => abrir(d.id)}>
              <span className="tx"><code>{d.codigo}</code><span className="nm">{d.nombre}</span></span>
              <span className={"tag " + D.edoc(d)}>{D.EST_LABEL[D.edoc(d)]}</span>
            </button>
          ))}
        </section>
      </React.Fragment>
    )) : <p className="vacio-txt">{docs.length ? "Ningún documento coincide con la búsqueda." : "Todavía no hay documentos en esta droguería."}</p>;
  }

  const d = ficha && (vista === "exp" ? ins : docs).find((x) => x.id === ficha);
  return (
    <>
      <header className="ptop">
        <h1>Documentos</h1>
        <label className="search"><Ico n="search" s={18} /><input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={vista === "exp" ? "Buscar en el expediente…" : "Código o nombre…"} aria-label="Buscar" /></label>
        <div className="seg" role="tablist">
          <button role="tab" aria-selected={vista !== "exp"} className={vista !== "exp" ? "on" : ""} onClick={() => nav.replace("/documentos")}>Documentos · {docs.length}</button>
          <button role="tab" aria-selected={vista === "exp"} className={vista === "exp" ? "on" : ""} onClick={() => nav.replace("/documentos/expediente")}>Expediente de inspección</button>
        </div>
      </header>
      <main className="pad cuerpo">{cuerpo}</main>
      {d && (vista === "exp" ? <FichaExpediente d={d} onClose={() => nav.back(base)} /> : <FichaDoc d={d} onClose={() => nav.back(base)} />)}
    </>
  );
}

function FichaDoc({ d, onClose }) {
  const f = D.fDias(D.dias(d.rev));
  return (
    <Hoja onClose={onClose} titulo={d.codigo}>
      <div className="fhead"><code>{d.codigo}</code><span className={"tag " + DIAS_CLS[f.cls]}>{f.txt}</span></div>
      <h4>{d.nombre}</h4>
      <dl className="kv">
        <dt>Tipo</dt><dd>{d.tipo || "—"}</dd>
        <dt>Área</dt><dd>{d.area || "—"}</dd>
        <dt>Versión</dt><dd className="mono">V{String(d.version || 1).padStart(2, "0")}</dd>
        <dt>Próxima revisión</dt><dd>{d.rev ? D.fLocal(d.rev) : "Sin fecha"}</dd>
      </dl>
      <ArchivosDrive lista={archivos(d)} enlace={d.driveUrl} />
    </Hoja>
  );
}

function FichaExpediente({ d, onClose }) {
  return (
    <Hoja onClose={onClose} titulo={d.nombre}>
      <div className="fhead"><span className="tag ok">Expediente de inspección</span></div>
      <h4>{d.nombre}</h4>
      <ArchivosDrive lista={archivos(d)} />
    </Hoja>
  );
}

// Se abren en Google Drive: desde la app de Drive se envían o descargan.
function ArchivosDrive({ lista, enlace }) {
  const ok = lista.filter(urlDrive);
  if (!ok.length && enlace) return <a className="btn pri" href={enlace} target="_blank" rel="noopener noreferrer">Abrir en Drive</a>;
  if (!ok.length) return <p className="nota">Sin archivo cargado. Se carga desde la versión web.</p>;
  return (
    <>
      {ok.map((f, k) => (
        <a key={k} className="file" href={urlDrive(f)} target="_blank" rel="noopener noreferrer">
          <Ico n="doc" s={18} /><span>{f.name || f.originalName || "Archivo"}</span>{k === 0 && ok.length > 1 && <small>vigente</small>}
        </a>
      ))}
      <a className="btn pri" href={urlDrive(ok[0])} target="_blank" rel="noopener noreferrer">Abrir en Drive</a>
    </>
  );
}

/* =============================== Hojas =============================== */
function Hoja({ onClose, titulo, children }) {
  useEffect(() => {
    const k = (e) => e.key === "Escape" && onClose();
    addEventListener("keydown", k);
    return () => removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="hoja">
      <div className="scrim" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label={titulo}>
        <div className="grab" />
        {children}
      </div>
    </div>
  );
}

function HojaDroguerias({ data, dg, setDg, alertas }) {
  const [oscuro, setOscuro] = useState(esOscuro);
  const salir = () => Promise.resolve().then(() => Cloud && Cloud.api().signOut(Cloud.getAuth())).finally(() => location.reload());
  return (
    <Hoja onClose={() => nav.back("/")} titulo="Droguerías">
      <h3 className="sheet-t">Droguerías</h3>
      <div className="dglist">
        {data.droguerias.map((e) => {
          const n = alertas.filter((x) => x.dg.id === e.id).length;
          return (
            <button key={e.id} className={"dgrow" + (e.id === dg.id ? " on" : "")} onClick={() => { setDg(e.id); nav.back("/"); }}>
              <span className="ini">{(e.init || e.nombre || "?").slice(0, 3)}</span>
              <span className="tx"><b>{e.nombre}</b><small className="mono">{e.ruc ? "RUC " + e.ruc : "Sin RUC"}</small></span>
              {n > 0 && <span className="tag pronto" title="Alertas en 30 días">{n}</span>}
              {e.id === dg.id && <Ico n="check" />}
            </button>
          );
        })}
      </div>
      <div className="sheet-acc">
        <AvisosFila />
        <button onClick={() => { cambiarTema(); setOscuro(esOscuro()); }}><Ico n={oscuro ? "sun" : "moon"} />{oscuro ? "Tema claro" : "Tema oscuro"}</button>
        <a href={WEB_URL} target="_blank" rel="noopener noreferrer"><Ico n="dashboard" />Abrir la versión web</a>
        <button className="peligro" onClick={salir}><Ico n="logout" />Cerrar sesión</button>
      </div>
    </Hoja>
  );
}

/* Avisos push en este teléfono (js/avisos.js, como en LogisticS): el Worker manda a las 8:00 lo que
   vence en 7 días o vence hoy, de todas las droguerías. Activar = el aviso de prueba llegó. */
function AvisosFila() {
  const [estado, setEstado] = useState(() => (!Cloud ? "demo" : Avisos.soportado() ? "" : "no-soporta"));
  useEffect(() => { if (estado === "") Avisos.activo().then((a) => setEstado(a ? "activo" : "apagado")); }, []);
  const activar = () => {
    setEstado("activando");
    Avisos.activar()
      .then(() => { setEstado("activo"); avisar("Avisos activados en este teléfono"); })
      .catch((err) => { setEstado("apagado"); avisar(err?.message || String(err)); });
  };
  if (estado === "demo") return <p className="nota">Los avisos push necesitan la sesión de BPA Plus (no hay en el modo demo).</p>;
  if (estado === "no-soporta") return <p className="nota">Este navegador no recibe avisos push. En el iPhone, agrega BPA Plus a la pantalla de inicio y actívalos desde ahí.</p>;
  return (
    <button onClick={activar} disabled={estado !== "apagado"}>
      <Ico n="bell" />{estado === "activo" ? "Avisos activados en este teléfono" : estado === "activando" ? "Activando avisos…" : "Activar avisos en este teléfono"}
    </button>
  );
}

function HojaAlertas({ dg, setDg, alertas }) {
  const abrir = (it) => {
    if (it.dg.id !== dg.id) setDg(it.dg.id);
    if (it.kind === "doc") nav.replace("/documentos/ficha/" + it.obj.id);
    else nav.back("/");
  };
  return (
    <Hoja onClose={() => nav.back("/")} titulo="Alertas">
      <h3 className="sheet-t">Alertas · todas las droguerías</h3>
      {alertas.length ? (
        <div className="alist">
          {alertas.map((it, k) => {
            const f = D.fDias(it.dias);
            return (
              <button key={k} className="alrow" onClick={() => abrir(it)}>
                <span className="tx"><small className="mono">{it.dg.nombre}</small><b>{it.titulo}</b><small>{KIND_LABEL[it.kind]}</small></span>
                <span className={"tag " + DIAS_CLS[f.cls]}>{f.txt}</span>
              </button>
            );
          })}
        </div>
      ) : <p className="vacio-txt">Nada vence en los próximos 30 días en ninguna droguería.</p>}
    </Hoja>
  );
}

/* =============================== Acceso =============================== */
function mensaje(err) {
  const c = (err && err.code) || "";
  if (/invalid-credential|wrong-password|user-not-found/.test(c)) return "Correo o contraseña incorrectos.";
  if (/network-request-failed/.test(c)) return "Sin conexión. Conéctate para iniciar sesión por primera vez.";
  if (/too-many-requests/.test(c)) return "Demasiados intentos. Espera un momento y vuelve a probar.";
  if (/invalid-email/.test(c)) return "Escribe un correo válido.";
  return (err && err.message) || "No se pudo iniciar sesión.";
}

function Login() {
  const [email, setEmail] = useState(""), [clave, setClave] = useState("");
  const [msg, setMsg] = useState(""), [ok, setOk] = useState(false), [ocupado, setOcupado] = useState(false);
  const entrar = (e) => {
    e.preventDefault(); setMsg(""); setOk(false); setOcupado(true);
    Cloud.api().signInWithEmailAndPassword(Cloud.getAuth(), email.trim(), clave).catch((err) => { setMsg(mensaje(err)); setOcupado(false); });
  };
  const olvido = () => {
    if (!email.trim()) { setOk(false); setMsg("Escribe primero tu correo."); return; }
    setOcupado(true);
    Cloud.api().sendPasswordResetEmail(Cloud.getAuth(), email.trim())
      .then(() => { setOk(true); setMsg("Te enviamos un enlace para restablecerla."); })
      .catch((err) => { setOk(false); setMsg(mensaje(err)); })
      .finally(() => setOcupado(false));
  };
  return (
    <div className="acceso">
      <form className="acceso-card" onSubmit={entrar}>
        <span className="logo grande"><Logo s={40} /></span>
        <h1>BPA Plus</h1>
        <p className="lead">El acta y los documentos BPA de tus droguerías, en el teléfono.</p>
        <label>Correo electrónico<input className="inp" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label>Contraseña<input className="inp" type="password" autoComplete="current-password" required minLength={6} value={clave} onChange={(e) => setClave(e.target.value)} /></label>
        {msg && <div className={"acceso-msg" + (ok ? " ok" : "")} role="alert">{msg}</div>}
        <button className="btn pri" disabled={ocupado}>Iniciar sesión</button>
        <button type="button" className="link" onClick={olvido} disabled={ocupado}>Olvidé mi contraseña</button>
        <p className="nota">Es la misma cuenta de BPA Plus en la web. Después se pide el PIN de este teléfono.</p>
      </form>
    </div>
  );
}

// El PIN de js/lock.js (salteado, SHA-256, solo en este dispositivo). En el mismo sitio que la web es el mismo PIN.
function Pin({ crear, onOk }) {
  const [buf, setBuf] = useState(""), [primero, setPrimero] = useState(""), [err, setErr] = useState(""), [temblor, setTemblor] = useState(0);
  const bufRef = useRef("");
  const poner = (b) => { bufRef.current = b; setBuf(b); };
  const fallo = (m) => { setErr(m); poner(""); setTemblor((x) => x + 1); UI.haptic(60); };
  const confirmar = (b) => {
    if (b.length < 4) return;
    if (!crear) return Lock.verify(b).then((ok) => (ok ? onOk() : fallo("PIN incorrecto")));
    if (!primero) { setPrimero(b); poner(""); return; }
    if (b !== primero) { setPrimero(""); return fallo("Los PIN no coinciden. Créalo de nuevo."); }
    Lock.setPin(b).then(onOk);
  };
  const tecla = (k) => {
    setErr("");
    if (k === "del") return poner(bufRef.current.slice(0, -1));
    if (k === "ok") return confirmar(bufRef.current);
    if (bufRef.current.length >= 6) return;
    const b = bufRef.current + k;
    poner(b);
    // Un PIN correcto entra apenas se completa, como en la web; con 6 dígitos se confirma solo.
    if (!crear && b.length >= 4) Lock.verify(b).then((ok) => { if (ok && bufRef.current === b) onOk(); else if (!ok && b.length === 6) fallo("PIN incorrecto"); });
    if (crear && b.length === 6) confirmar(b);
  };
  const teclaRef = useRef(tecla);
  teclaRef.current = tecla;
  useEffect(() => {
    const k = (e) => {
      if (/^[0-9]$/.test(e.key)) teclaRef.current(e.key);
      else if (e.key === "Backspace") teclaRef.current("del");
      else if (e.key === "Enter") teclaRef.current("ok");
    };
    addEventListener("keydown", k);
    return () => removeEventListener("keydown", k);
  }, []);
  const olvido = () => {
    if (!confirm("El PIN no se puede recuperar: no se guarda en ningún servidor. Se borra de este teléfono y se cierra la sesión; vuelves a entrar con tu correo y contraseña y creas uno nuevo.")) return;
    Lock.clearPin();
    Promise.resolve().then(() => Cloud && Cloud.init().then(() => Cloud.api().signOut(Cloud.getAuth()))).catch(() => {}).finally(() => location.reload());
  };
  return (
    <div className="pin">
      <span className="logo grande"><Logo s={40} /></span>
      <h1>{crear ? (primero ? "Confirmar PIN" : "Crear acceso") : "Ingresa tu PIN"}</h1>
      <p>{crear ? (primero ? "Escríbelo una vez más" : "Un PIN de 4 a 6 dígitos para este teléfono") : "BPA Plus · este teléfono"}</p>
      <div className={"dots" + (temblor ? " tiembla" : "")} key={temblor}>
        {Array.from({ length: Math.max(4, buf.length) }, (_, k) => <i key={k} className={k < buf.length ? "on" : ""} />)}
      </div>
      <div className="pin-err" role="alert">{err}</div>
      <div className="teclado">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((k) => <button key={k} onClick={() => tecla(k)}>{k}</button>)}
        <button className="ok" onClick={() => tecla("ok")} disabled={buf.length < 4} aria-label={crear ? "Continuar" : "Entrar"}><Ico n="check" s={24} /></button>
        <button onClick={() => tecla("0")}>0</button>
        <button className="del" onClick={() => tecla("del")} aria-label="Borrar">⌫</button>
      </div>
      {!crear && <button className="link claro" onClick={olvido}>¿Olvidaste el PIN?</button>}
    </div>
  );
}

/* =============================== Estados =============================== */
const Cargando = () => (
  <div className="splash"><span className="logo grande"><Logo s={40} /></span><p>Cargando…</p></div>
);

function Aviso({ titulo, texto, web, volver }) {
  return (
    <div className="splash">
      <span className="logo grande"><Logo s={40} /></span>
      <h2>{titulo}</h2>
      <p>{texto}</p>
      {web && <a className="btn pri" href={WEB_URL} target="_blank" rel="noopener noreferrer">Abrir la versión web</a>}
      {volver ? <button className="btn ghost" onClick={() => nav.replace("/")}>Ir al panorama</button>
        : <button className="btn ghost" onClick={() => location.reload()}>Reintentar</button>}
    </div>
  );
}

function Toasts() {
  const [t, setT] = useState(null);
  useEffect(() => {
    let timer;
    avisar = (msg, accion) => {
      clearTimeout(timer);
      setT({ msg, accion, k: Date.now() });
      timer = setTimeout(() => setT(null), accion ? 6000 : 3500);
    };
    return () => clearTimeout(timer);
  }, []);
  if (!t) return null;
  return (
    <div className="toast" role="status" key={t.k}>
      <span>{t.msg}</span>
      {t.accion && <button onClick={() => { t.accion.fn(); setT(null); }}>{t.accion.label}</button>}
    </div>
  );
}
