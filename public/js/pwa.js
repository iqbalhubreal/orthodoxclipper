"use strict";
/* Service worker registration. */
if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(error => console.warn("Service worker not registered:", error)));
}
