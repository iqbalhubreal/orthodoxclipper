"use strict";
/* The three steps are collapsible (<details>). Step 1 starts closed. Helpers to open one from code. */
function openStep(n, scroll = false) {
  const el = $(`#step${n}`); if (!el) return;
  el.open = true;
  if (scroll) el.scrollIntoView({ behavior: "smooth", block: "start" });
}
