"use strict";
/* Busy overlay + stopwatch, toasts, downloads, small text helpers, screen wake lock. */
let clockTimer = null, clockStart = 0, stageName = "", busyMin = false;
function clockText(ms) { const t = Math.floor(ms / 100) / 10, m = Math.floor(t / 60); return `${m}:${(t % 60).toFixed(1).padStart(4, "0")}`; }
function tickClock() {
  const ms = Date.now() - clockStart, t = clockText(ms);
  $("#busy-clock").textContent = t;
  $("#busy-mini-clock").textContent = t;
  $("#busy-note").textContent = ms > 60000 ? "Still working. If nothing changes, press Cancel and try again." : "";
}
function setBusyText(message) {
  $("#busy-text").textContent = message;
  $("#busy-mini-text").textContent = message;
}
function setBusyMinimized(min) {
  busyMin = !!min;
  $("#busy").hidden = !state.busy || busyMin;
  $("#busy-mini").hidden = !state.busy || !busyMin;
}
function showBusy(on, message = "Working...") {
  if (on && !state.busy) { busyMin = false; stageName = ""; clearInterval(clockTimer); clockTimer = setInterval(tickClock, 100); }
  if (on && message !== stageName) { stageName = message; clockStart = Date.now(); tickClock(); } // the stopwatch restarts at every new step or clip
  if (!on) { busyMin = false; clearInterval(clockTimer); clockTimer = null; stageName = ""; $("#busy-clock").textContent = "0:00.0"; $("#busy-mini-clock").textContent = "0:00.0"; $("#busy-note").textContent = ""; $("#busy-lap").innerHTML = ""; }
  state.busy = on;
  setBusyMinimized(busyMin);
  setBusyText(message);
  $("#go").disabled = on;
  $("#bar").hidden = !(on && state.clipTotal);
}
function setBar(f) { $("#bar-fill").style.width = `${Math.round(Math.min(1, Math.max(0, f)) * 100)}%`; }
let toastTimer;
function toast(message, error = false) {
  const el = $("#toast");
  el.textContent = message;
  el.className = error ? "error" : "";
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.hidden = true, error ? 6500 : 2800);
}
function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
function slug(text) {
  return String(text || "clip").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,55) || "clip";
}
function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
const tagsText = tags => tags.map(tag => `#${String(tag).replace(/^#/, "")}`).join(" ");
const shareText = item => `${item.caption}\n\n${item.tagsText}`;

/* Keep the screen on while working, so phones do not suspend the tab. */
let wake = null;
async function keepAwake(on) {
  try {
    if (on && "wakeLock" in navigator) wake = await navigator.wakeLock.request("screen");
    else if (!on && wake) { await wake.release(); wake = null; }
  } catch {}
}
document.addEventListener("visibilitychange", () => { if (state.busy && document.visibilityState === "visible") keepAwake(true); });
