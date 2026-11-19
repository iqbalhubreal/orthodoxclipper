"use strict";
/* Vertical framing editor (1 to 4 adjustable cropping boxes, flexible layouts, canvas, drag handles, preview, mobile layout). */
const clamp = (n, lo, hi) => Math.min(Math.max(n, lo), hi);
const BOX_COLORS = ["#8b79ff", "#42c98b", "#f0b35a", "#38bdf8"];
const ed = { index: 0, frame: null, drag: null, scale: 1, k: 1, sel: 0 };

function boxLabel(idx, count) {
  if (count === 1) return "Full";
  if (count === 2) return idx === 0 ? "Top" : "Bottom";
  return `Box ${idx + 1}`;
}
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
  const boxes = getFrameBoxes(ed.frame);
  ed.sel = clamp(ed.sel, 0, boxes.length - 1);
  $("#ed-box-count").textContent = boxes.length;
  $("#ed-add-box").disabled = boxes.length >= 4;
  $("#ed-del-box").disabled = boxes.length <= 1;
  $("#ed-swap").disabled = boxes.length <= 1;
  $("#ed-sel").innerHTML = boxes.map((_, idx) =>
    `<button type="button" data-sel="${idx}" class="${idx === ed.sel ? "on" : ""}">${boxLabel(idx, boxes.length)}</button>`
  ).join("");
  const presets = getLayoutPresets(boxes.length);
  if (!presets.some(p => p.id === ed.frame.layout)) ed.frame.layout = presets[0].id;
  $("#ed-layout-wrap").hidden = boxes.length < 2;
  $("#ed-layout").innerHTML = presets.map(p =>
    `<button type="button" data-layout="${p.id}" class="${p.id === ed.frame.layout ? "on" : ""}">${p.label}</button>`
  ).join("");
  document.querySelectorAll("#ed-fit button").forEach(b => b.classList.toggle("on", (b.dataset.fit === "fit") === !!ed.frame.fit));
}
function edCheckedIndices() {
  return [...document.querySelectorAll('#ed-clips input[type="checkbox"]:checked')].map(el => Number(el.value));
}
function edSyncClipsBtn() {
  const n = edCheckedIndices().length;
  const done = $("#ed-done");
  done.disabled = n === 0;
  done.textContent = n <= 1 ? "Make this clip vertical" : `Make ${n} clips vertical`;
}
function edRenderClips(activeIndex) {
  const prev = new Set(edCheckedIndices());
  $("#ed-clips").innerHTML = state.outputs.map((item, idx) => {
    const checked = prev.size ? prev.has(idx) : idx === activeIndex;
    const n = item.vLayers?.length || 0;
    const badge = n ? `<span class="ed-clip-tag">${n} edit${n === 1 ? "" : "s"}</span>` : "";
    return `<label class="ed-clip-opt"><input type="checkbox" value="${idx}"${checked ? " checked" : ""}><span>${idx + 1}. ${escapeHTML(item.title)}</span>${badge}</label>`;
  }).join("");
  edSyncClipsBtn();
}
function edFitStage() {
  $("#ed-stage").style.maxWidth = `calc(52vh * ${state.vw / state.vh})`;
  if (window.CSS && CSS.supports("height", "1dvh")) $("#ed-stage").style.maxWidth = `calc(52dvh * ${state.vw / state.vh})`;
}
async function openEditor(i) {
  if (!IS_ANDROID_APP) {
    toast("Download the Android app for this feature.", true);
    $("#status").textContent = "Download the Android app to use the Vertical Maker.";
    $("#app-note")?.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  const item = state.outputs[i];
  if (!item || state.busy) return;
  const v = state.edVideo = Object.assign(document.createElement("video"), { muted: true, playsInline: true, preload: "auto", src: item.url });
  try {
    await new Promise((res, rej) => { v.onloadedmetadata = res; v.onerror = () => rej(new Error("preview")); });
    state.vw = v.videoWidth; state.vh = v.videoHeight;
    ed.index = i; ed.sel = 0;
    const rawFrame = clone(item.vFrame || state.lastFrame || defaultFrame());
    ed.frame = { fit: !!rawFrame.fit, layout: rawFrame.layout || "stack", boxes: getFrameBoxes(rawFrame) };
    const slider = $("#ed-time");
    slider.min = 0; slider.max = v.duration || 1; slider.step = 0.1; slider.value = Math.min(PAD, (v.duration || 1) / 2);
    $("#ed-title").textContent = `Vertical Maker: ${item.title}`;
    const cv = $("#ed-canvas");
    cv.width = Math.min(960, state.vw); cv.height = Math.round(cv.width * state.vh / state.vw);
    ed.scale = cv.width / state.vw;
    edFitStage(); edSyncUI();
    $("#ed-clips").innerHTML = "";
    edRenderClips(i);
    $("#editor").hidden = false;
    $("#editor").scrollTop = 0;
    document.body.style.overflow = "hidden";
    await edSeek(Number(slider.value)); drawEditor();
  } catch { toast("This clip can't be previewed in your browser, so vertical framing isn't available for it.", true); }
}
const closeEditor = () => { $("#editor").hidden = true; ed.drag = null; document.body.style.overflow = ""; };
const rectPx = r => ({ x: r.x * state.vw, y: r.y * state.vh, w: r.w * state.vw, h: r.h * state.vh });

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
  const u = 1 / ed.k;
  const boxes = getFrameBoxes(ed.frame);
  const pxBoxes = boxes.map(rectPx);
  ctx.drawImage(v, 0, 0, cv.width, cv.height);
  ctx.fillStyle = "rgba(0,0,0,.55)"; ctx.fillRect(0, 0, cv.width, cv.height);
  for (const r of pxBoxes) ctx.drawImage(v, r.x, r.y, r.w, r.h, r.x * s, r.y * s, r.w * s, r.h * s);

  const order = boxes.map((_, idx) => idx).sort((a, b) => (a === ed.sel) - (b === ed.sel));
  order.forEach(idx => {
    const r = pxBoxes[idx], color = BOX_COLORS[idx % BOX_COLORS.length], label = boxLabel(idx, boxes.length);
    const on = idx === ed.sel, x = r.x * s, y = r.y * s, w = r.w * s, h = r.h * s;
    ctx.lineWidth = (on ? 3 : 2) * u; ctx.strokeStyle = color; ctx.setLineDash(on ? [] : [6 * u, 4 * u]); ctx.strokeRect(x, y, w, h); ctx.setLineDash([]);
    ctx.font = `bold ${13 * u}px system-ui, sans-serif`;
    const text = `${label} ${Math.round(r.w)}×${Math.round(r.h)}`, tw = ctx.measureText(text).width + 12 * u, th = 20 * u;
    ctx.fillStyle = color; ctx.fillRect(x, y, Math.min(tw, w), th);
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, th); ctx.clip(); ctx.fillStyle = "#0b0c10"; ctx.fillText(text, x + 6 * u, y + 14.5 * u); ctx.restore();
    if (!on) return;
    for (const [hx, hy] of HANDLES) {
      const rad = (hx && hy ? 9 : 7) * u, cx = clamp(x + (hx + 1) * w / 2, rad + u, cv.width - rad - u), cy = clamp(y + (hy + 1) * h / 2, rad + u, cv.height - rad - u);
      ctx.beginPath(); ctx.arc(cx, cy, rad, 0, 7); ctx.fillStyle = color; ctx.fill();
      ctx.lineWidth = 2 * u; ctx.strokeStyle = "#fff"; ctx.stroke();
    }
  });

  const P = $("#ed-prev"), p = P.getContext("2d"), slots = getLayoutSlots(boxes.length, ed.frame.layout);
  p.fillStyle = "#000"; p.fillRect(0, 0, P.width, P.height);
  pxBoxes.forEach((r, idx) => {
    const sl = slots[idx], dx = Math.round(sl.x * P.width), dy = Math.round(sl.y * P.height), dw = Math.round(sl.w * P.width), dh = Math.round(sl.h * P.height);
    const m = mapBox(r, dw, dh, ed.frame.fit);
    p.drawImage(v, m.sx, m.sy, m.sw, m.sh, dx + m.dx, dy + m.dy, m.dw, m.dh);
    p.strokeStyle = "rgba(255,255,255,.25)"; p.strokeRect(dx, dy, dw, dh);
  });
}
function edPos(e) {
  const cv = $("#ed-canvas"), b = cv.getBoundingClientRect();
  ed.k = b.width / cv.width;
  return { x: (e.clientX - b.left) / ed.k / ed.scale, y: (e.clientY - b.top) / ed.k / ed.scale };
}
function edHit(p) {
  const boxes = getFrameBoxes(ed.frame);
  const r0 = 26 / (ed.k * ed.scale);
  const a = rectPx(boxes[ed.sel]);
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
  const order = [ed.sel, ...boxes.map((_, idx) => idx).filter(idx => idx !== ed.sel)];
  for (const which of order) {
    const r = rectPx(boxes[which]);
    if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) return { which, mode: "move", dx: p.x - r.x, dy: p.y - r.y };
  }
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
  const boxes = getFrameBoxes(ed.frame);
  const p = edPos(e), f = boxes[ed.drag.which], { vw, vh } = state, d = ed.drag;
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
$("#ed-sel").addEventListener("click", e => {
  const b = e.target.closest("button[data-sel]"); if (!b) return;
  ed.sel = Number(b.dataset.sel); edSyncUI(); drawEditor();
});
$("#ed-layout").addEventListener("click", e => {
  const b = e.target.closest("button[data-layout]"); if (!b) return;
  ed.frame.layout = b.dataset.layout; edSyncUI(); drawEditor();
});
$("#ed-add-box").addEventListener("click", () => {
  const boxes = getFrameBoxes(ed.frame);
  if (boxes.length >= 4) return;
  boxes.push(defaultBoxAt(boxes.length, boxes.length + 1));
  ed.sel = boxes.length - 1;
  edSyncUI(); drawEditor();
});
$("#ed-del-box").addEventListener("click", () => {
  const boxes = getFrameBoxes(ed.frame);
  if (boxes.length <= 1) return;
  boxes.splice(ed.sel, 1);
  ed.sel = clamp(ed.sel, 0, boxes.length - 1);
  edSyncUI(); drawEditor();
});
$("#ed-fit").addEventListener("click", e => { const b = e.target.closest("button[data-fit]"); if (!b) return; ed.frame.fit = b.dataset.fit === "fit"; edSyncUI(); drawEditor(); });
$("#ed-swap").addEventListener("click", () => {
  const boxes = getFrameBoxes(ed.frame);
  if (boxes.length < 2) return;
  const next = (ed.sel + 1) % boxes.length;
  [boxes[ed.sel], boxes[next]] = [boxes[next], boxes[ed.sel]];
  drawEditor();
});
$("#ed-reset").addEventListener("click", () => { ed.frame = defaultFrame(); ed.sel = 0; edSyncUI(); drawEditor(); });
$("#ed-overlays").addEventListener("click", () => {
  const frame = clone(ed.frame), idx = ed.index;
  if (state.outputs[idx]) state.outputs[idx].vFrame = clone(frame);
  $("#editor").hidden = true;
  document.body.style.overflow = "";
  openVerticalEditor(idx, { frame, returnToEditor: true });
});
$("#ed-clips").addEventListener("change", edSyncClipsBtn);
$("#ed-pick-all").addEventListener("click", () => {
  const boxes = [...document.querySelectorAll('#ed-clips input[type="checkbox"]')];
  const allOn = boxes.every(b => b.checked);
  boxes.forEach(b => { b.checked = !allOn; });
  edSyncClipsBtn();
});
$("#ed-cancel").addEventListener("click", closeEditor);
$("#ed-done").addEventListener("click", () => {
  const list = edCheckedIndices();
  if (!list.length) return;
  const frame = clone(ed.frame);
  closeEditor();
  runTask(() => makeVerticalBatch(list, frame), "Preparing...");
});
$("#ed-all").addEventListener("click", () => { const frame = clone(ed.frame); closeEditor(); runTask(() => makeVerticalBatch(state.outputs.map((_, i) => i), frame), "Preparing..."); });
document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("#editor").hidden) closeEditor(); });
window.addEventListener("resize", () => { if (!$("#editor").hidden && state.edVideo) drawEditor(); });
window.addEventListener("orientationchange", () => setTimeout(() => { if (!$("#editor").hidden && state.edVideo) drawEditor(); }, 250));
