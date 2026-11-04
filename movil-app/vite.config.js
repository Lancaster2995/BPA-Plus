import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// BPA Plus móvil (boceto aprobado el 2026-11-02, ../boceto-movil-bpaplus.html).
// Importa tal cual los scripts de ../js (domain.js, cloud.js, lock.js…): por eso el servidor
// de desarrollo puede leer la carpeta de arriba. Compila en ../movil, que Firebase Hosting sirve
// como bpa-db.web.app/movil/ (mismo sitio que la web: misma sesión, PIN y Drive). Base relativa.
export default defineConfig({
  base: "./",
  server: { fs: { allow: [".."] } },
  build: { outDir: "../movil", emptyOutDir: true },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      workbox: {
        globPatterns: ["**/*.{js,css,html,png}"],
        globIgnores: ["**/retiro-*.js"], // solo lo usa el modo demo para sembrar el ejemplo
        importScripts: ["push-sw.js"], // avisos push (public/push-sw.js)
        // En el almacén muchas veces no hay señal. Firebase llega por CDN (js/cloud.js), así que
        // también se guarda: sin esto la app no abriría sin conexión aunque Firestore tenga los datos.
        runtimeCaching: [
          { urlPattern: /^https:\/\/www\.gstatic\.com\/firebasejs\//, handler: "CacheFirst", options: { cacheName: "firebase-sdk", expiration: { maxEntries: 20 } } },
          { urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\//, handler: "StaleWhileRevalidate", options: { cacheName: "fuentes", expiration: { maxEntries: 20 } } },
        ],
      },
      manifest: {
        id: "./",
        name: "BPA Plus móvil",
        short_name: "BPA móvil",
        description: "El acta de autoinspección y los documentos BPA de cada droguería, en el teléfono.",
        lang: "es",
        theme_color: "#173B58",
        background_color: "#EAF1F7",
        display: "standalone",
        orientation: "portrait-primary",
        start_url: "./",
        scope: "./",
        icons: [
          { src: "pwa-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "pwa-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "pwa-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
    }),
  ],
});
