"use strict";
/* Vertical Editor: pre-vertical blur, image overlays, movable/resizable text boxes, clip switcher, and Applies-to-all / Individual toggle (text only in Individual mode). */
const ved = { index: 0, layers: [], sel: -1, drag: null, k: 1, video: null, baseCv: null, pixCv: null, frame: null, returnToEditor: false, guides: null, showIgGuide: true, scope: "all" };

const VED_FONTS = [
  { id: "classic", name: "Classic", weight: 700, family: '"Inter", system-ui, -apple-system, sans-serif' },
  { id: "classic_medium", name: "Classic Med", weight: 500, family: '"Inter", system-ui, -apple-system, sans-serif' },
  { id: "modern", name: "Modern", weight: 500, family: '"Oswald", "Arial Narrow", sans-serif' },
  { id: "modern_bold", name: "Modern Bold", weight: 700, family: '"Oswald", "Arial Narrow", sans-serif' },
  { id: "headline", name: "Headline", weight: 800, family: '"Montserrat", system-ui, sans-serif' },
  { id: "clean", name: "Clean", weight: 700, family: '"Poppins", system-ui, sans-serif' },
  { id: "sharp", name: "Sharp", weight: 700, family: '"Roboto", system-ui, sans-serif' },
  { id: "poster", name: "Poster", weight: 400, family: '"Bebas Neue", "Oswald", sans-serif' },
];
const VED_COLORS = ["#ffffff", "#000000", "#38bdf8", "#f0b35a", "#42c98b", "#ff5a5f"];

function cloneLayers(layers) {
  return (layers || []).map(l => {
    const copy = { kind: l.kind, x: l.x, y: l.y, w: l.w, h: l.h };
    if (l.kind === "blur") { copy.blurType = l.blurType; copy.amount = l.amount; }
    else if (l.kind === "text") { copy.text = l.text; copy.fontId = l.fontId; copy.fontSize = l.fontSize; copy.color = l.color; copy.bg = l.bg; copy.align = l.align || "center"; }
    else { copy.name = l.name; copy.url = l.url; copy.aspect = l.aspect; }
    return copy;
  });
}
function preloadLayerImages(layers) {
  return Promise.all((layers || []).map(l => new Promise(resolve => {
    if (l.kind !== "image" || !l.url) return resolve({ ...l });
    if (l.img && l.img.complete && l.img.naturalWidth) return resolve({ ...l });
    const img = new Image();
    img.onload = () => resolve({ ...l, img });
    img.onerror = () => resolve({ ...l, img: null });
    img.src = l.url;
  })));
}
function vedSeek(t) {
  return new Promise(resolve => {
    const v = ved.video;
    if (Math.abs(v.currentTime - t) < 0.01 && v.readyState >= 2) return resolve();
    const done = () => { v.removeEventListener("seeked", done); clearTimeout(timer); resolve(); };
    const timer = setTimeout(done, 3000);
    v.addEventListener("seeked", done);
    v.currentTime = Math.min(Math.max(0, t), v.duration || t);
  });
}
function ensureCanvas(cur, w, h) {
  if (!cur) return typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(w, h) : Object.assign(document.createElement("canvas"), { width: w, height: h });
  cur.width = w; cur.height = h;
  return cur;
}
function drawTextLayer(ctx, l, rx, ry, rw, rh, s) {
  const font = VED_FONTS.find(f => f.id === l.fontId) || VED_FONTS[0];
  const pxSize = Math.max(10, Math.round((l.fontSize || 32) * s));
  const lineH = Math.round(pxSize * 1.22);
  const align = l.align || "center";
  ctx.save();
  ctx.font = `${font.weight} ${pxSize}px ${font.family}`;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  const padX = Math.round(14 * s);
  const maxW = Math.max(20, rw - padX * 2);
  const words = String(l.text || "").split(/\n/);
  const lines = [];
  for (const para of words) {
    let cur = "";
    for (const word of para.split(/\s+/)) {
      const test = cur ? `${cur} ${word}` : word;
      if (ctx.measureText(test).width <= maxW || !cur) cur = test;
      else { lines.push(cur); cur = word; }
    }
    lines.push(cur);
  }
  if (l.bg === "dark" || l.bg === "light" || l.bg === "accent") {
    ctx.fillStyle = l.bg === "dark" ? "rgba(12, 16, 26, 0.86)" : l.bg === "light" ? "rgba(255, 255, 255, 0.92)" : "rgba(37, 99, 235, 0.90)";
    const r = Math.round(14 * s);
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(rx, ry, rw, rh, r);
    else ctx.rect(rx, ry, rw, rh);
    ctx.fill();
    if (l.bg === "dark") {
      ctx.lineWidth = Math.max(1, 1.5 * s);
      ctx.strokeStyle = "rgba(56, 189, 248, 0.45)";
      ctx.stroke();
    }
  }
  ctx.beginPath();
  ctx.rect(rx, ry, rw, rh);
  ctx.clip();
  ctx.fillStyle = l.color || "#ffffff";
  if (l.bg === "none") {
    ctx.shadowColor = "rgba(0,0,0,0.75)";
    ctx.shadowBlur = Math.round(7 * s);
    ctx.shadowOffsetY = Math.round(2 * s);
  }
  const totalH = lines.length * lineH;
  const startY = ry + (rh - totalH) / 2 + lineH / 2;
  const tx = align === "left" ? rx + padX : align === "right" ? rx + rw - padX : rx + rw / 2;
  lines.forEach((line, idx) => ctx.fillText(line, tx, startY + idx * lineH));
  ctx.restore();
}
function drawVerticalLayers(ctx, baseCv, W, H, layers) {
  const s = W / 540;
  for (const l of layers) {
    const rx = Math.round(l.x * W), ry = Math.round(l.y * H);
    const rw = Math.max(2, Math.round(l.w * W)), rh = Math.max(2, Math.round(l.h * H));
    if (l.kind === "blur") {
      if (l.blurType === "pixel") {
        const block = Math.max(4, Math.round(l.amount * s));
        const pw = Math.max(1, Math.round(rw / block)), ph = Math.max(1, Math.round(rh / block));
        ved.pixCv = ensureCanvas(ved.pixCv, pw, ph);
        ved.pixCv.getContext("2d").drawImage(baseCv, rx, ry, rw, rh, 0, 0, pw, ph);
        ctx.save();
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(ved.pixCv, 0, 0, pw, ph, rx, ry, rw, rh);
        ctx.restore();
      } else {
        ctx.save();
        ctx.beginPath();
        ctx.rect(rx, ry, rw, rh);
        ctx.clip();
        ctx.filter = `blur(${Math.max(1, Math.round(l.amount * s))}px)`;
        ctx.drawImage(baseCv, 0, 0, W, H);
        ctx.filter = "none";
        if (l.blurType === "frosted") {
          ctx.fillStyle = "rgba(15, 16, 24, 0.30)";
          ctx.fillRect(rx, ry, rw, rh);
        }
        ctx.restore();
      }
    } else if (l.kind === "image" && l.img) {
      ctx.drawImage(l.img, rx, ry, rw, rh);
    } else if (l.kind === "text") {
      drawTextLayer(ctx, l, rx, ry, rw, rh, s);
    }
  }
}
function drawVEditor() {
  const v = ved.video, cv = $("#ved-canvas"), ctx = cv.getContext("2d");
  if (!v || !cv) return;
  ved.k = cv.getBoundingClientRect().width / cv.width || 1;
  const u = 1 / ved.k, W = cv.width, H = cv.height;
  ved.baseCv = ensureCanvas(ved.baseCv, W, H);
  const bctx = ved.baseCv.getContext("2d");
  if (ved.frame && v.videoWidth && v.videoHeight) {
    const boxes = getFrameBoxes(ved.frame), slots = getLayoutSlots(boxes.length, ved.frame.layout);
    const sw = v.videoWidth, sh = v.videoHeight;
    if (ved.frame.stage?.enabled && typeof drawStageComposition === "function") {
      drawStageComposition(bctx, v, sw, sh, boxes, ved.frame, W, H, {
        energy: 0.55,
        timestamp: Number($("#ved-time").value) || 0,
        showGuide: false,
      });
    } else {
      const px = r => ({ x: r.x * sw, y: r.y * sh, w: r.w * sw, h: r.h * sh });
      if (ved.frame.fit) { bctx.fillStyle = "#000"; bctx.fillRect(0, 0, W, H); }
      boxes.forEach((box, idx) => {
        const sl = slots[idx], dx = Math.round(sl.x * W), dy = Math.round(sl.y * H), dw = Math.round(sl.w * W), dh = Math.round(sl.h * H);
        const m = mapBox(px(box), dw, dh, ved.frame.fit);
        bctx.drawImage(v, m.sx, m.sy, m.sw, m.sh, dx + m.dx, dy + m.dy, m.dw, m.dh);
      });
    }
  } else {
    bctx.drawImage(v, 0, 0, W, H);
  }
  ctx.drawImage(ved.baseCv, 0, 0, W, H);
  drawVerticalLayers(ctx, ved.baseCv, W, H, ved.layers);

  if (ved.showIgGuide && typeof drawStageSubtitleGuide === "function") {
    drawStageSubtitleGuide(ctx, W, H, true);
  }

  if (ved.guides) {
    ctx.save();
    ctx.strokeStyle = "#38bdf8";
    ctx.lineWidth = 1.5 * u;
    ctx.setLineDash([6 * u, 4 * u]);
    if (ved.guides.x != null) {
      ctx.beginPath(); ctx.moveTo(ved.guides.x * W, 0); ctx.lineTo(ved.guides.x * W, H); ctx.stroke();
    }
    if (ved.guides.y != null) {
      ctx.beginPath(); ctx.moveTo(0, ved.guides.y * H); ctx.lineTo(W, ved.guides.y * H); ctx.stroke();
    }
    ctx.restore();
  }

  ved.layers.forEach((l, idx) => {
    const on = idx === ved.sel;
    const x = l.x * W, y = l.y * H, w = l.w * W, h = l.h * H;
    const color = l.kind === "blur" ? "#f0b35a" : l.kind === "text" ? "#42c98b" : "#8b79ff";
    ctx.lineWidth = (on ? 2.5 : 1.5) * u;
    ctx.strokeStyle = color;
    ctx.setLineDash(on ? [] : [5 * u, 4 * u]);
    ctx.strokeRect(x, y, w, h);
    ctx.setLineDash([]);
    if (!on) return;
    const rad = 9 * u;
    const cx = clamp(x + w, rad + u, W - rad - u);
    const cy = clamp(y + h, rad + u, H - rad - u);
    ctx.beginPath(); ctx.arc(cx, cy, rad, 0, 7); ctx.fillStyle = color; ctx.fill();
    ctx.lineWidth = 2 * u; ctx.strokeStyle = "#fff"; ctx.stroke();
  });
}
function vedSyncClipBar() {
  const total = state.outputs.length;
  const item = state.outputs[ved.index];
  $("#ved-clip-name").textContent = `${ved.index + 1} / ${total} · ${item?.title || `Clip ${ved.index + 1}`}`;
  $("#ved-prev-clip").disabled = total <= 1 || ved.index <= 0;
  $("#ved-next-clip").disabled = total <= 1 || ved.index >= total - 1;
}
function vedSyncControls() {
  const isIndiv = ved.scope === "individual";
  $("#ved-add-text").hidden = !isIndiv;
  document.querySelectorAll("#ved-scope button").forEach(b => b.classList.toggle("on", b.dataset.scope === ved.scope));
  vedSyncClipBar();

  if (!isIndiv && ved.layers[ved.sel]?.kind === "text") ved.sel = -1;
  const l = ved.layers[ved.sel];
  $("#ved-layer-tools").hidden = !l;
  if (!l) return;
  $("#ved-blur-opts").hidden = l.kind !== "blur";
  $("#ved-text-opts").hidden = !(l.kind === "text" && isIndiv);
  if (l.kind === "blur") {
    document.querySelectorAll("#ved-btype button").forEach(b => b.classList.toggle("on", b.dataset.btype === l.blurType));
    $("#ved-amount").value = l.amount;
    $("#ved-amount-val").textContent = l.amount;
  } else if (l.kind === "text" && isIndiv) {
    $("#ved-text-input").value = l.text || "";
    $("#ved-font-size").value = l.fontSize || 32;
    $("#ved-fsize-val").textContent = l.fontSize || 32;
    document.querySelectorAll("#ved-font-grid button").forEach(b => b.classList.toggle("on", b.dataset.font === l.fontId));
    document.querySelectorAll("#ved-text-colors button").forEach(b => b.classList.toggle("on", b.dataset.color === l.color));
    document.querySelectorAll("#ved-text-bg button").forEach(b => b.classList.toggle("on", b.dataset.tbg === l.bg));
    document.querySelectorAll("#ved-text-align button").forEach(b => b.classList.toggle("on", b.dataset.align === (l.align || "center")));
  }
}
function vedRenderFontUI() {
  $("#ved-font-grid").innerHTML = VED_FONTS.map(f =>
    `<button type="button" class="ved-font-btn" data-font="${f.id}" style="font-family:${f.family};font-weight:${f.weight}">${f.name}</button>`
  ).join("");
  $("#ved-text-colors").innerHTML = VED_COLORS.map(c =>
    `<button type="button" class="ved-color-dot" data-color="${c}" style="background:${c}" aria-label="Color ${c}"></button>`
  ).join("");
}
function vedRenderOverlayList() {
  const saved = loadSavedOverlays();
  const html = [
    ...PRESET_OVERLAYS.map(o => `<div class="ved-ov-item"><button type="button" class="ved-ov-pick" data-ov-add="${o.id}"><img src="${o.url}" alt=""><span>${escapeHTML(o.name)}</span></button></div>`),
    ...saved.map(o => `<div class="ved-ov-item"><button type="button" class="ved-ov-pick" data-ov-add="${o.id}"><img src="${o.url}" alt=""><span>${escapeHTML(o.name)}</span></button><button type="button" class="ved-ov-del" data-ov-del="${o.id}" aria-label="Remove overlay">✕</button></div>`)
  ].join("");
  $("#ved-ov-list").innerHTML = html;
  $("#ved-ov-count").textContent = `${saved.length}/${MAX_SAVED_OVERLAYS} saved`;
  $("#ved-import").disabled = saved.length >= MAX_SAVED_OVERLAYS;
}
function vedSaveLayersToState() {
  const clean = cloneLayers(ved.layers);
  if (ved.scope === "individual") {
    if (state.outputs[ved.index]) state.outputs[ved.index].vLayers = clean;
    return;
  }
  const sharedNonText = clean.filter(l => l.kind !== "text");
  const curText = clean.filter(l => l.kind === "text");
  state.outputs.forEach((out, idx) => {
    const existingText = idx === ved.index
      ? curText
      : cloneLayers((out.vLayers || []).filter(l => l.kind === "text"));
    out.vLayers = [...cloneLayers(sharedNonText), ...existingText];
  });
}
function vedAddBlur() {
  ved.layers.push({ kind: "blur", blurType: "smooth", amount: 18, x: 0.15, y: 0.43, w: 0.7, h: 0.14 });
  ved.sel = ved.layers.length - 1;
  vedSyncControls();
  drawVEditor();
}
function vedAddText() {
  if (ved.scope !== "individual") return;
  ved.layers.push({
    kind: "text",
    text: "Your text",
    fontId: "classic",
    fontSize: 32,
    color: "#ffffff",
    bg: "none",
    align: "center",
    x: 0.15,
    y: 0.44,
    w: 0.7,
    h: 0.12,
  });
  ved.sel = ved.layers.length - 1;
  vedSyncControls();
  drawVEditor();
  $("#ved-text-input").focus();
}
function vedAddImageOverlay(id) {
  const all = [...PRESET_OVERLAYS, ...loadSavedOverlays()];
  const ov = all.find(x => x.id === id);
  if (!ov) return;
  const img = new Image();
  img.onload = () => {
    const aspect = (img.naturalWidth || 1) / (img.naturalHeight || 1);
    const w = 0.45;
    const h = Math.min(0.45, (w * (9 / 16)) / aspect);
    ved.layers.push({ kind: "image", name: ov.name, url: ov.url, img, aspect, x: (1 - w) / 2, y: 0.45, w, h });
    ved.sel = ved.layers.length - 1;
    vedSyncControls();
    drawVEditor();
  };
  img.src = ov.url;
}
async function loadVedClip(i) {
  const item = state.outputs[i];
  if (!item) return;
  const v = ved.video = Object.assign(document.createElement("video"), { muted: true, playsInline: true, preload: "auto", src: item.url });
  await new Promise((res, rej) => { v.onloadedmetadata = res; v.onerror = () => rej(new Error("preview")); });
  ved.index = i;
  ved.guides = null;
  ved.layers = await preloadLayerImages(cloneLayers(item.vLayers));
  ved.sel = ved.layers.length ? 0 : -1;
  const slider = $("#ved-time");
  slider.min = 0; slider.max = v.duration || 1; slider.step = 0.1; slider.value = Math.min(PAD, (v.duration || 1) / 2);
  $("#ved-title").textContent = "Vertical Editor";
  vedSyncControls();
  await vedSeek(Number(slider.value));
  drawVEditor();
}
async function switchVedClip(delta) {
  const next = clamp(ved.index + delta, 0, state.outputs.length - 1);
  if (next === ved.index) return;
  vedSaveLayersToState();
  try { await loadVedClip(next); }
  catch { toast("Could not load that clip.", true); }
}
async function openVerticalEditor(i, opts = {}) {
  if (!IS_ANDROID_APP) {
    toast("Download the Android app for this feature.", true);
    $("#status").textContent = "Download the Android app to use the Vertical Maker.";
    $("#app-note")?.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  const item = state.outputs[i];
  if (!item || state.busy) return;
  try {
    ved.frame = clone(opts.frame || item.vFrame || state.lastFrame || defaultFrame());
    ved.returnToEditor = !!opts.returnToEditor;
    ved.showIgGuide = $("#ved-ig-guide") ? $("#ved-ig-guide").checked : true;
    const cv = $("#ved-canvas");
    cv.width = 540; cv.height = 960;
    $("#ved-stage").style.maxWidth = "calc(44dvh * 0.5625)";
    vedRenderFontUI();
    vedRenderOverlayList();
    await loadVedClip(i);
    $("#veditor").hidden = false;
    $("#veditor").scrollTop = 0;
    document.body.style.overflow = "hidden";
  } catch { toast("Could not open this clip in Vertical Editor.", true); }
}
function closeVerticalEditor(reopenFraming = false) {
  $("#veditor").hidden = true;
  ved.drag = null;
  ved.guides = null;
  document.body.style.overflow = "";
  const back = reopenFraming && ved.returnToEditor;
  const idx = ved.index;
  ved.returnToEditor = false;
  if (back) openEditor(idx);
}
function snapOverlay(l, idx) {
  const TH = 0.015;
  const xTargets = [0.5, 0.04, 0.96, 0, 1];
  const yTargets = [0.5, 0.25, 0.75, 0.04, 0.96, 0, 1];
  ved.layers.forEach((other, j) => {
    if (j === idx || other.kind === "blur") return;
    xTargets.push(other.x, other.x + other.w / 2, other.x + other.w);
    yTargets.push(other.y, other.y + other.h / 2, other.y + other.h);
  });
  let bestX = null, bestDx = TH;
  for (const t of xTargets) {
    for (const [val, off] of [[l.x, 0], [l.x + l.w / 2, -l.w / 2], [l.x + l.w, -l.w]]) {
      const d = Math.abs(val - t);
      if (d < bestDx) { bestDx = d; bestX = { target: t, next: clamp(t + off, 0, 1 - l.w) }; }
    }
  }
  let bestY = null, bestDy = TH;
  for (const t of yTargets) {
    for (const [val, off] of [[l.y, 0], [l.y + l.h / 2, -l.h / 2], [l.y + l.h, -l.h]]) {
      const d = Math.abs(val - t);
      if (d < bestDy) { bestDy = d; bestY = { target: t, next: clamp(t + off, 0, 1 - l.h) }; }
    }
  }
  if (bestX) l.x = bestX.next;
  if (bestY) l.y = bestY.next;
  ved.guides = (bestX || bestY) ? { x: bestX ? bestX.target : null, y: bestY ? bestY.target : null } : null;
}

function vedPos(e) {
  const cv = $("#ved-canvas"), b = cv.getBoundingClientRect();
  ved.k = b.width / cv.width;
  return { x: (e.clientX - b.left) / (ved.k * cv.width), y: (e.clientY - b.top) / (ved.k * cv.height) };
}
function vedHit(p) {
  const cv = $("#ved-canvas"), W = cv.width, H = cv.height;
  const px = { x: p.x * W, y: p.y * H };
  const r0 = 26 / ved.k;
  if (ved.sel >= 0 && ved.layers[ved.sel]) {
    const l = ved.layers[ved.sel];
    const cx = clamp((l.x + l.w) * W, 10, W - 10), cy = clamp((l.y + l.h) * H, 10, H - 10);
    if (Math.hypot(px.x - cx, px.y - cy) <= r0) {
      return { idx: ved.sel, mode: "resize", ox: p.x - (l.x + l.w), oy: p.y - (l.y + l.h), baseW: l.w, baseFont: l.fontSize || 32 };
    }
  }
  for (let idx = ved.layers.length - 1; idx >= 0; idx--) {
    const l = ved.layers[idx];
    if (l.kind === "text" && ved.scope !== "individual") continue;
    if (p.x >= l.x && p.x <= l.x + l.w && p.y >= l.y && p.y <= l.y + l.h) {
      return { idx, mode: "move", dx: p.x - l.x, dy: p.y - l.y };
    }
  }
  return null;
}

const vedCanvas = $("#ved-canvas");
vedCanvas.addEventListener("pointerdown", e => {
  const hit = vedHit(vedPos(e));
  if (!hit) { ved.sel = -1; ved.guides = null; vedSyncControls(); drawVEditor(); return; }
  if (hit.idx !== ved.sel) { ved.sel = hit.idx; vedSyncControls(); }
  ved.drag = hit;
  vedCanvas.setPointerCapture(e.pointerId);
  e.preventDefault();
  drawVEditor();
});
vedCanvas.addEventListener("pointermove", e => {
  if (!ved.drag) return;
  const p = vedPos(e), d = ved.drag, l = ved.layers[d.idx];
  if (!l) return;
  if (d.mode === "move") {
    l.x = clamp(p.x - d.dx, 0, 1 - l.w);
    l.y = clamp(p.y - d.dy, 0, 1 - l.h);
    if (l.kind !== "blur") snapOverlay(l, d.idx);
    else ved.guides = null;
  } else {
    ved.guides = null;
    const minW = 0.06, minH = 0.035;
    let L = l.x, T = l.y;
    let R = clamp(p.x - d.ox, L + minW, 1);
    let B = clamp(p.y - d.oy, T + minH, 1);
    if (l.kind === "image" && l.aspect) {
      let nw = R - L, nh = (nw * (9 / 16)) / l.aspect;
      if (T + nh > 1) { nh = 1 - T; nw = (nh * l.aspect) / (9 / 16); R = L + nw; }
      B = T + nh;
    }
    l.w = R - L; l.h = B - T;
  }
  drawVEditor();
});
["pointerup", "pointercancel"].forEach(t => vedCanvas.addEventListener(t, () => { ved.drag = null; ved.guides = null; drawVEditor(); }));

$("#ved-time").addEventListener("input", async e => { await vedSeek(Number(e.target.value)); drawVEditor(); });
$("#ved-prev-clip")?.addEventListener("click", () => switchVedClip(-1));
$("#ved-next-clip")?.addEventListener("click", () => switchVedClip(1));
$("#ved-scope")?.addEventListener("click", e => {
  const b = e.target.closest("button[data-scope]");
  if (!b) return;
  ved.scope = b.dataset.scope === "individual" ? "individual" : "all";
  vedSyncControls();
  drawVEditor();
});
$("#ved-ig-guide")?.addEventListener("change", e => { ved.showIgGuide = e.target.checked; drawVEditor(); });
$("#ved-add-blur").addEventListener("click", vedAddBlur);
$("#ved-add-text").addEventListener("click", vedAddText);
$("#ved-btype").addEventListener("click", e => {
  const b = e.target.closest("button[data-btype]");
  if (!b || !ved.layers[ved.sel]) return;
  ved.layers[ved.sel].blurType = b.dataset.btype;
  vedSyncControls();
  drawVEditor();
});
$("#ved-amount").addEventListener("input", e => {
  const l = ved.layers[ved.sel];
  if (!l) return;
  l.amount = Number(e.target.value);
  $("#ved-amount-val").textContent = l.amount;
  drawVEditor();
});
$("#ved-text-input").addEventListener("input", e => {
  const l = ved.layers[ved.sel];
  if (!l || l.kind !== "text") return;
  l.text = e.target.value;
  drawVEditor();
});
$("#ved-font-size")?.addEventListener("input", e => {
  const l = ved.layers[ved.sel];
  if (!l || l.kind !== "text") return;
  l.fontSize = Number(e.target.value);
  $("#ved-fsize-val").textContent = l.fontSize;
  drawVEditor();
});
$("#ved-font-grid").addEventListener("click", e => {
  const b = e.target.closest("button[data-font]");
  const l = ved.layers[ved.sel];
  if (!b || !l || l.kind !== "text") return;
  l.fontId = b.dataset.font;
  vedSyncControls();
  drawVEditor();
});
$("#ved-text-colors").addEventListener("click", e => {
  const b = e.target.closest("button[data-color]");
  const l = ved.layers[ved.sel];
  if (!b || !l || l.kind !== "text") return;
  l.color = b.dataset.color;
  vedSyncControls();
  drawVEditor();
});
$("#ved-text-bg").addEventListener("click", e => {
  const b = e.target.closest("button[data-tbg]");
  const l = ved.layers[ved.sel];
  if (!b || !l || l.kind !== "text") return;
  l.bg = b.dataset.tbg;
  vedSyncControls();
  drawVEditor();
});
$("#ved-text-align")?.addEventListener("click", e => {
  const b = e.target.closest("button[data-align]");
  const l = ved.layers[ved.sel];
  if (!b || !l || l.kind !== "text") return;
  l.align = b.dataset.align;
  vedSyncControls();
  drawVEditor();
});
$("#ved-nudge")?.addEventListener("click", e => {
  const b = e.target.closest("button[data-nudge]");
  const l = ved.layers[ved.sel];
  if (!b || !l) return;
  const dir = b.dataset.nudge;
  if (dir === "up") l.y = clamp(l.y - 0.03, 0, 1 - l.h);
  else if (dir === "down") l.y = clamp(l.y + 0.03, 0, 1 - l.h);
  else if (dir === "cx") l.x = clamp((1 - l.w) / 2, 0, 1 - l.w);
  drawVEditor();
});
$("#ved-del-layer").addEventListener("click", () => {
  if (ved.sel < 0) return;
  ved.layers.splice(ved.sel, 1);
  ved.sel = ved.layers.length - 1;
  vedSyncControls();
  drawVEditor();
});
$("#ved-import").addEventListener("click", () => $("#ved-file").click());
$("#ved-file").addEventListener("change", async e => {
  const file = e.target.files?.[0];
  e.target.value = "";
  if (!file) return;
  try {
    const item = await addSavedOverlay(file);
    vedRenderOverlayList();
    vedAddImageOverlay(item.id);
    toast("Overlay saved.");
  } catch (err) { toast(err.message || "Could not import image.", true); }
});
$("#ved-ov-list").addEventListener("click", e => {
  const del = e.target.closest("[data-ov-del]");
  if (del) {
    deleteSavedOverlay(del.dataset.ovDel);
    vedRenderOverlayList();
    toast("Overlay removed.");
    return;
  }
  const pick = e.target.closest("[data-ov-add]");
  if (pick) vedAddImageOverlay(pick.dataset.ovAdd);
});
$("#ved-back").addEventListener("click", () => closeVerticalEditor(true));
$("#ved-save").addEventListener("click", () => {
  vedSaveLayersToState();
  toast(ved.scope === "all"
    ? "Blur & overlays applied to all clips (text stays individual). Click Move Back to export."
    : `Saved edits to clip ${ved.index + 1}. Click Move Back to export.`);
});
document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("#veditor").hidden) closeVerticalEditor(true); });
