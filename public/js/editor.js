"use strict";
/* The vertical framing editor (canvas, drag handles, preview, mobile layout). */
const clamp = (n, lo, hi) => Math.min(Math.max(n, lo), hi);
const ed = { index: 0, frame: null, drag: null, scale: 1, k: 1, sel: "a" };
function edSeek(t) {
  return new Promise(resolve => {
    const v = state.edVideo;
    if (Math.abs(v.currentTime - t) < 0.01 && v.readyState >= 2) return resolve();
    const done = () => { v.removeEventListener("seeked", done); clearTimeout(timer); resolve(); };
    const timer = setTimeout(done, 3000);
    v.addEventListener("seeked", done);
    v.currentTime = Math.min(Math.max(0, t), v.duration || t);
  });
}
function edSyncUI() {
  document.querySelectorAll("#ed-sel button").forEach(b => b.classList.toggle("on", b.dataset.sel === ed.sel));
  document.querySelectorAll("#ed-fit button").forEach(b => b.classList.toggle("on", (b.dataset.fit === "fit") === !!ed.frame.fit));
}
function edFitStage() {
  // keep the video frame from getting taller than about half the screen, so the controls stay reachable on phones
  $("#ed-stage").style.maxWidth = `calc(52vh * ${state.vw / state.vh})`;
  if (window.CSS && CSS.supports("height", "1dvh")) $("#ed-stage").style.maxWidth = `calc(52dvh * ${state.vw / state.vh})`;
}
async function openEditor(i) {
  const item = state.outputs[i];
  if (!item || state.busy) return;
  const v = state.edVideo = Object.assign(document.createElement("video"), { muted: true, playsInline: true, preload: "auto", src: item.url });
  try {
    await new Promise((res, rej) => { v.onloadedmetadata = res; v.onerror = () => rej(new Error("preview")); });
    state.vw = v.videoWidth; state.vh = v.videoHeight;
    ed.index = i; ed.sel = "a"; ed.frame = clone(state.lastFrame || defaultFrame());
    const slider = $("#ed-time");
    slider.min = 0; slider.max = v.duration || 1; slider.step = 0.1; slider.value = Math.min(PAD, (v.duration || 1) / 2);
    $("#ed-title").textContent = `Make vertical: ${item.title}`;
    const cv = $("#ed-canvas");
    cv.width = Math.min(960, state.vw); cv.height = Math.round(cv.width * state.vh / state.vw);
    ed.scale = cv.width / state.vw;
    edFitStage(); edSyncUI();
    $("#editor").hidden = false;
    $("#editor").scrollTop = 0;
    document.body.style.overflow = "hidden";
    await edSeek(Number(slider.value)); drawEditor();
  } catch { toast("This clip can't be previewed in your browser, so vertical framing isn't available for it.", true); }
}
const closeEditor = () => { $("#editor").hidden = true; ed.drag = null; document.body.style.overflow = ""; };
const rectPx = r => ({ x: r.x * state.vw, y: r.y * state.vh, w: r.w * state.vw, h: r.h * state.vh });
/* The part of the source box that lands in one half of the output, and where it lands (shared by the live preview and the real render). */
function mapBox(r, dw, dh, fit) {
  const ba = r.w / r.h, da = dw / dh;
  if (!fit) {
    if (ba > da) { const sw = r.h * da; return { sx: r.x + (r.w - sw) / 2, sy: r.y, sw, sh: r.h, dx: 0, dy: 0, dw, dh }; }
    const sh = r.w / da; return { sx: r.x, sy: r.y + (r.h - sh) / 2, sw: r.w, sh, dx: 0, dy: 0, dw, dh };
  }
  if (ba > da) { const h = dw / ba; return { sx: r.x, sy: r.y, sw: r.w, sh: r.h, dx: 0, dy: (dh - h) / 2, dw, dh: h }; }
  const w = dh * ba; return { sx: r.x, sy: r.y, sw: r.w, sh: r.h, dx: (dw - w) / 2, dy: 0, dw: w, dh };
}
const HANDLES = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
function drawEditor() {
  const v = state.edVideo, cv = $("#ed-canvas"), ctx = cv.getContext("2d"), s = ed.scale;
  ed.k = cv.getBoundingClientRect().width / cv.width || 1;
  const u = 1 / ed.k; // 1 screen pixel, in canvas pixels
  const A = rectPx(ed.frame.a), B = rectPx(ed.frame.b);
  ctx.drawImage(v, 0, 0, cv.width, cv.height);
  ctx.fillStyle = "rgba(0,0,0,.55)"; ctx.fillRect(0, 0, cv.width, cv.height);
  for (const r of [A, B]) ctx.drawImage(v, r.x, r.y, r.w, r.h, r.x * s, r.y * s, r.w * s, r.h * s);
  const items = [["a", A, "#8b79ff", "Top"], ["b", B, "#42c98b", "Bottom"]];
  items.sort((p, q) => (p[0] === ed.sel) - (q[0] === ed.sel)); // active box drawn last, on top
  items.forEach(([key, r, color, label]) => {
    const on = key === ed.sel, x = r.x * s, y = r.y * s, w = r.w * s, h = r.h * s;
    ctx.lineWidth = (on ? 3 : 2) * u; ctx.strokeStyle = color; ctx.setLineDash(on ? [] : [6 * u, 4 * u]); ctx.strokeRect(x, y, w, h); ctx.setLineDash([]);
    ctx.font = `bold ${13 * u}px system-ui, sans-serif`;
    const text = `${label} ${Math.round(r.w)}×${Math.round(r.h)}`, tw = ctx.measureText(text).width + 12 * u, th = 20 * u;
    ctx.fillStyle = color; ctx.fillRect(x, y, Math.min(tw, w), th);
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, th); ctx.clip(); ctx.fillStyle = "#0b0c10"; ctx.fillText(text, x + 6 * u, y + 14.5 * u); ctx.restore();
    if (!on) return;
    for (const [hx, hy] of HANDLES) {
      const rad = (hx && hy ? 9 : 7) * u, cx = clamp(x + (hx + 1) * w / 2, rad + u, cv.width - rad - u), cy = clamp(y + (hy + 1) * h / 2, rad + u, cv.height - rad - u); // kept inside the canvas so edge handles stay visible
      ctx.beginPath(); ctx.arc(cx, cy, rad, 0, 7); ctx.fillStyle = color; ctx.fill();
      ctx.lineWidth = 2 * u; ctx.strokeStyle = "#fff"; ctx.stroke();
    }
  });
  const P = $("#ed-prev"), p = P.getContext("2d"), half = P.height / 2;
  p.fillStyle = "#000"; p.fillRect(0, 0, P.width, P.height);
  [[A, 0], [B, half]].forEach(([r, dy]) => {
    const m = mapBox(r, P.width, half, ed.frame.fit);
    p.drawImage(v, m.sx, m.sy, m.sw, m.sh, m.dx, dy + m.dy, m.dw, m.dh);
  });
  p.strokeStyle = "rgba(255,255,255,.25)"; p.beginPath(); p.moveTo(0, half); p.lineTo(P.width, half); p.stroke();
}
function edPos(e) {
  const cv = $("#ed-canvas"), b = cv.getBoundingClientRect();
  ed.k = b.width / cv.width;
  return { x: (e.clientX - b.left) / ed.k / ed.scale, y: (e.clientY - b.top) / ed.k / ed.scale };
}
function edHit(p) {
  const r0 = 26 / (ed.k * ed.scale); // touch radius in source pixels
  const order = [ed.sel, ed.sel === "a" ? "b" : "a"];
  // 1) handles and edges of the active box
  const a = rectPx(ed.frame[ed.sel]);
  let best = null;
  for (const [hx, hy] of HANDLES) {
    const m = 12 / (ed.k * ed.scale), cx = clamp(a.x + (hx + 1) * a.w / 2, m, state.vw - m), cy = clamp(a.y + (hy + 1) * a.h / 2, m, state.vh - m), d = Math.hypot(p.x - cx, p.y - cy);
    if (d <= r0 && (!best || d < best.d)) best = { d, hx, hy };
  }
  if (!best) {
    const t = r0 * 0.55, inX = p.x >= a.x - t && p.x <= a.x + a.w + t, inY = p.y >= a.y - t && p.y <= a.y + a.h + t;
    if (inY && Math.abs(p.x - a.x) <= t) best = { hx: -1, hy: 0 };
    else if (inY && Math.abs(p.x - (a.x + a.w)) <= t) best = { hx: 1, hy: 0 };
    else if (inX && Math.abs(p.y - a.y) <= t) best = { hx: 0, hy: -1 };
    else if (inX && Math.abs(p.y - (a.y + a.h)) <= t) best = { hx: 0, hy: 1 };
  }
  if (best) {
    const ex = best.hx < 0 ? a.x : best.hx > 0 ? a.x + a.w : 0, ey = best.hy < 0 ? a.y : best.hy > 0 ? a.y + a.h : 0;
    return { which: ed.sel, mode: "resize", hx: best.hx, hy: best.hy, ox: best.hx ? p.x - ex : 0, oy: best.hy ? p.y - ey : 0 };
  }
  // 2) body of either box (active one first)
  for (const which of order) { const r = rectPx(ed.frame[which]); if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) return { which, mode: "move", dx: p.x - r.x, dy: p.y - r.y }; }
  return null;
}
const edCanvas = $("#ed-canvas");
edCanvas.addEventListener("pointerdown", e => {
  const hit = edHit(edPos(e)); if (!hit) return;
  if (hit.which !== ed.sel) { ed.sel = hit.which; edSyncUI(); }
  ed.drag = hit; edCanvas.setPointerCapture(e.pointerId); e.preventDefault(); drawEditor();
});
edCanvas.addEventListener("pointermove", e => {
  if (!ed.drag) return;
  const p = edPos(e), f = ed.frame[ed.drag.which], { vw, vh } = state, d = ed.drag;
  const r = rectPx(f);
  if (d.mode === "move") {
    f.x = clamp((p.x - d.dx) / vw, 0, 1 - f.w);
    f.y = clamp((p.y - d.dy) / vh, 0, 1 - f.h);
  } else {
    const mw = Math.min(vw, Math.max(48, vw * 0.06)), mh = Math.min(vh, Math.max(48, vh * 0.06));
    let L = r.x, T = r.y, R = r.x + r.w, Bt = r.y + r.h;
    if (d.hx < 0) L = clamp(p.x - d.ox, 0, R - mw); else if (d.hx > 0) R = clamp(p.x - d.ox, L + mw, vw);
    if (d.hy < 0) T = clamp(p.y - d.oy, 0, Bt - mh); else if (d.hy > 0) Bt = clamp(p.y - d.oy, T + mh, vh);
    f.x = L / vw; f.y = T / vh; f.w = (R - L) / vw; f.h = (Bt - T) / vh;
  }
  drawEditor();
});
["pointerup", "pointercancel"].forEach(t => edCanvas.addEventListener(t, () => { ed.drag = null; }));
$("#ed-time").addEventListener("input", async e => { await edSeek(Number(e.target.value)); drawEditor(); });
$("#ed-sel").addEventListener("click", e => { const b = e.target.closest("button[data-sel]"); if (!b) return; ed.sel = b.dataset.sel; edSyncUI(); drawEditor(); });
$("#ed-fit").addEventListener("click", e => { const b = e.target.closest("button[data-fit]"); if (!b) return; ed.frame.fit = b.dataset.fit === "fit"; edSyncUI(); drawEditor(); });
$("#ed-swap").addEventListener("click", () => { [ed.frame.a, ed.frame.b] = [ed.frame.b, ed.frame.a]; drawEditor(); });
$("#ed-reset").addEventListener("click", () => { ed.frame = defaultFrame(); edSyncUI(); drawEditor(); });
$("#ed-cancel").addEventListener("click", closeEditor);
$("#ed-done").addEventListener("click", () => { const frame = clone(ed.frame), i = ed.index; closeEditor(); runTask(() => makeVerticalBatch([i], frame), "Preparing..."); });
$("#ed-all").addEventListener("click", () => { const frame = clone(ed.frame); closeEditor(); runTask(() => makeVerticalBatch(state.outputs.map((_, i) => i), frame), "Preparing..."); });
document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("#editor").hidden) closeEditor(); });
window.addEventListener("resize", () => { if (!$("#editor").hidden && state.edVideo) drawEditor(); });
window.addEventListener("orientationchange", () => setTimeout(() => { if (!$("#editor").hidden && state.edVideo) drawEditor(); }, 250));
