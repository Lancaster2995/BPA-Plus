// Los scripts clásicos de la web (window.BPAPLUS.*), en el orden de ../index.html.
// Se importan tal cual: las reglas, el PIN y el acceso a Firebase son los mismos; el móvil
// solo dibuja otra interfaz encima. Firebase llega por CDN desde cloud.js (sin paquete npm).
import "../../js/config.js";
import "../../js/cloud.js";
import "../../js/domain.js";
import "../../js/ui.js";
import "../../js/db.js";
import "../../js/lock.js";
import "../../js/alerts.js";
import "../../js/avisos.js";

const B = window.BPAPLUS;
// Modo demo (npm run demo): sin Firebase, como la web abierta sin cloud.js. db.js cae solo en
// IndexedDB con los datos de ejemplo de ITC. Sirve para probarla sin una cuenta real.
if (import.meta.env.VITE_DEMO === "1") delete B.cloud;
export const D = B.domain;
export const Cloud = B.cloud;
export const DB = B.db;
export const Lock = B.lock;
export const UI = B.ui;
export const Alerts = B.alerts;
export const Avisos = B.avisos;
