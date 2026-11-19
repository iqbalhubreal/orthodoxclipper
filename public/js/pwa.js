"use strict";
/* Service worker registration and the Install app button. */
/* ---------- PWA: service worker + install button ---------- */
if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(error => console.warn("Service worker not registered:", error)));
}
let installEvent = null;
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); installEvent = e; $("#install-btn").hidden = false; });
window.addEventListener("appinstalled", () => { installEvent = null; $("#install-btn").hidden = true; toast("Installed."); });
$("#install-btn").addEventListener("click", async () => { if (!installEvent) return; installEvent.prompt(); await installEvent.userChoice.catch(() => {}); installEvent = null; $("#install-btn").hidden = true; });
