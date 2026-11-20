"use strict";
/* Vertical Editor: blur boxes with full-strength middle (90%+) and soft 5% edge blending, image overlays, and text boxes (post-vertical only) with 8 Instagram Edits fonts. */
const ved = { index: 0, layers: [], sel: -1, drag: null, k: 1, video: null, baseCv: null, pixCv: null, blurCv: null, blurOutCv: null, maskCv: null, frame: null, returnToEditor: false, postVertical: false, guides: null };

const VED_FONTS = [
  { id: "classic", name: "Classic", weight: 700, family: '"Inter", system-ui, -apple-system, sans-serif' },
  { id: "classic_medium", name: "Classic Medium", weight: 500, family: '"Inter", system-ui, -apple-system, sans-serif' },
  { id: "classic_light", name: "Classic Light", weight: 300, family: '"Inter", system-ui, -apple-system, sans-serif' },
  { id: "modern", name: "Modern", weight: 500, family: '"Oswald", "Arial Narrow", sans-serif' },
  { id: "modern_bold", name: "Modern Bold", weight: 700, family: '"Oswald", "Arial Narrow", sans-serif' },
  { id: "signature", name: "Signature", weight: 600, family: '"Dancing Script", cursive' },
  { id: "editor", name: "Editor", weight: 700, family: '"Courier Prime", ui-monospace, monospace' },
  { id: "poster", name: "Poster", weight: 400, family: '"Alfa Slab One", Georgia, serif' },
];
const VED_COLORS = ["#ffffff", "#000000", "#f0b35a", "#8b79ff", "#42c98b", "#ff5a5f"];

function cloneLayers(layers) {
  return (layers || []).map(l => {
    const copy = { kind: l.kind, x: l.x, y: l.y, w: l.w, h: l.h };
    if (l.kind === "blur") { copy.blurType = l.blurType; copy.amount = l.amount; }
    else if (l.kind === "text") { copy.text = l.text; copy.fontId = l.fontId; copy.fontSize = l.fontSize; copy.color = l.color; copy.bg = l.bg; }
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
function applyFeatherMask(outCtx, rw, rh) {
  const edge = Math.max(3, Math.round(Math.min(rw, rh) * 0.05));
  const blurR = Math.max(2, Math.round(edge * 0.5));
  ved.maskCv = ensureCanvas(ved.maskCv, rw, rh);
  const mctx = ved.maskCv.getContext("2d");
  mctx.clearRect(0, 0, rw, rh);
  mctx.fillStyle = "#fff";
  mctx.filter = `blur(${blurR}px)`;
  mctx.fillRect(blurR, blurR, Math.max(2, rw - blurR * 2), Math.max(2, rh - blurR * 2));
  mctx.filter = "none";
  mctx.fillRect(edge, edge, Math.max(1, rw - edge * 2), Math.max(1, rh - edge * 2));
  outCtx.save();
  outCtx.globalCompositeOperation = "destination-in";
  outCtx.drawImage(ved.maskCv, 0, 0);
  outCtx.restore();
}
function drawEdgePaddedBlur(ctx, baseCv, W, H, rx, ry, rw, rh, blurPx, frosted) {
  const pad = Math.min(220, Math.max(16, Math.ceil(blurPx * 2)));
  const bw = rw + pad * 2, bh = rh + pad * 2;
  ved.blurCv = ensureCanvas(ved.blurCv, bw, bh);
  const bctx = ved.blurCv.getContext("2d");
  bctx.clearRect(0, 0, bw, bh);

  const sx = clamp(rx - pad, 0, W), sy = clamp(ry - pad, 0, H);
  const sx2 = clamp(rx + rw + pad, 0, W), sy2 = clamp(ry + rh + pad, 0, H);
  const sw = Math.max(1, sx2 - sx), sh = Math.max(1, sy2 - sy);
  const dx = pad + (sx - rx), dy = pad + (sy - ry);
  bctx.drawImage(baseCv, sx, sy, sw, sh, dx, dy, sw, sh);

  if (dx > 0) bctx.drawImage(ved.blurCv, dx, dy, 1, sh, 0, dy, dx, sh);
  if (dx + sw < bw) bctx.drawImage(ved.blurCv, dx + sw - 1, dy, 1, sh, dx + sw, dy, bw - (dx + sw), sh);
  if (dy > 0) bctx.drawImage(ved.blurCv, 0, dy, bw, 1, 0, 0, bw, dy);
  if (dy + sh < bh) bctx.drawImage(ved.blurCv, 0, dy + sh - 1, bw, 1, 0, dy + sh, bw, bh - (dy + sh));

  ved.blurOutCv = ensureCanvas(ved.blurOutCv, rw, rh);
  const octx = ved.blurOutCv.getContext("2d");
  octx.clearRect(0, 0, rw, rh);
  octx.filter = `blur(${blurPx}px)`;
  octx.drawImage(ved.blurCv, pad, pad, rw, rh, 0, 0, rw, rh);
  octx.filter = "none";
  if (frosted) {
    octx.fillStyle = "rgba(15, 16, 24, 0.30)";
    octx.fillRect(0, 0, rw, rh);
  }
  applyFeatherMask(octx, rw, rh);
  ctx.drawImage(ved.blurOutCv, rx, ry);
}
function drawTextLayer(ctx, l, rx, ry, rw, rh, s) {
  const font = VED_FONTS.find(f => f.id === l.fontId) || VED_FONTS[0];
  const pxSize = Math.max(10, Math.round((l.fontSize || 32) * s));
  const lineH = Math.round(pxSize * 1.22);
  ctx.save();
  ctx.font = `${font.weight} ${pxSize}px ${font.family}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const padX = Math.round(12 * s);
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
  if (l.bg === "dark" || l.bg === "light") {
    ctx.fillStyle = l.bg === "dark" ? "rgba(12, 13, 18, 0.78)" : "rgba(255, 255, 255, 0.88)";
    const r = Math.round(12 * s);
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(rx, ry, rw, rh, r);
    else ctx.rect(rx, ry, rw, rh);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.rect(rx, ry, rw, rh);
  ctx.clip();
  ctx.fillStyle = l.color || "#ffffff";
  if (l.bg === "none") {
    ctx.shadowColor = "rgba(0,0,0,0.65)";
    ctx.shadowBlur = Math.round(6 * s);
    ctx.shadowOffsetY = Math.round(2 * s);
  }
  const totalH = lines.length * lineH;
  const startY = ry + (rh - totalH) / 2 + lineH / 2;
  const cx = rx + rw / 2;
  lines.forEach((line, idx) => ctx.fillText(line, cx, startY + idx * lineH));
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
        ved.blurOutCv = ensureCanvas(ved.blurOutCv, rw, rh);
        const octx = ved.blurOutCv.getContext("2d");
        octx.clearRect(0, 0, rw, rh);
        octx.imageSmoothingEnabled = false;
        octx.drawImage(ved.pixCv, 0, 0, pw, ph, 0, 0, rw, rh);
        applyFeatherMask(octx, rw, rh);
        ctx.drawImage(ved.blurOutCv, rx, ry);
      } else {
        drawEdgePaddedBlur(ctx, baseCv, W, H, rx, ry, rw, rh, Math.max(1, Math.round(l.amount * s)), l.blurType === "frosted");
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
  if (ved.frame && !ved.postVertical && v.videoWidth && v.videoHeight) {
    const boxes = getFrameBoxes(ved.frame), slots = getLayoutSlots(boxes.length, ved.frame.layout);
    const sw = v.videoWidth, sh = v.videoHeight;
    const px = r => ({ x: r.x * sw, y: r.y * sh, w: r.w * sw, h: r.h * sh });
    if (ved.frame.fit) { bctx.fillStyle = "#000"; bctx.fillRect(0, 0, W, H); }
    boxes.forEach((box, idx) => {
      const sl = slots[idx], dx = Math.round(sl.x * W), dy = Math.round(sl.y * H), dw = Math.round(sl.w * W), dh = Math.round(sl.h * H);
      const m = mapBox(px(box), dw, dh, ved.frame.fit);
      bctx.drawImage(v, m.sx, m.sy, m.sw, m.sh, dx + m.dx, dy + m.dy, m.dw, m.dh);
    });
  } else {
    bctx.drawImage(v, 0, 0, W, H);
  }
  ctx.drawImage(ved.baseCv, 0, 0, W, H);
  drawVerticalLayers(ctx, ved.baseCv, W, H, ved.layers);

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
function vedSyncControls() {
  $("#ved-add-text").hidden = !ved.postVertical;
  const l = ved.layers[ved.sel];
  $("#ved-layer-tools").hidden = !l;
  if (!l) return;
  $("#ved-blur-opts").hidden = l.kind !== "blur";
  $("#ved-text-opts").hidden = !(l.kind === "text" && ved.postVertical);
  if (l.kind === "blur") {
    document.querySelectorAll("#ved-btype button").forEach(b => b.classList.toggle("on", b.dataset.btype === l.blurType));
    $("#ved-amount").value = l.amount;
    $("#ved-amount-val").textContent = l.amount;
  } else if (l.kind === "text" && ved.postVertical) {
    $("#ved-text-input").value = l.text || "";
    document.querySelectorAll("#ved-font-grid button").forEach(b => b.classList.toggle("on", b.dataset.font === l.fontId));
    document.querySelectorAll("#ved-text-colors button").forEach(b => b.classList.toggle("on", b.dataset.color === l.color));
    document.querySelectorAll("#ved-text-bg button").forEach(b => b.classList.toggle("on", b.dataset.tbg === l.bg));
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
function vedCheckedIndices() {
  return [...document.querySelectorAll('#ved-clips input[type="checkbox"]:checked')].map(el => Number(el.value));
}
function vedSyncClipsCount() {
  const boxes = [...document.querySelectorAll('#ved-clips input[type="checkbox"]')];
  const n = boxes.filter(b => b.checked).length;
  $("#ved-clip-count").value = Math.max(1, n);
}
function vedRenderClips(activeIndex) {
  $("#ved-clips-wrap").hidden = ved.postVertical;
  $("#ved-clip-count").max = Math.max(1, state.outputs.length);
  $("#ved-clips").innerHTML = state.outputs.map((item, idx) =>
    `<label class="ed-clip-opt"><input type="checkbox" value="${idx}"${idx === activeIndex ? " checked" : ""}><span>${idx + 1}. ${escapeHTML(item.title)}</span></label>`
  ).join("");
  vedSyncClipsCount();
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
function vedAddBlur() {
  ved.layers.push({ kind: "blur", blurType: "smooth", amount: 18, x: 0.15, y: 0.43, w: 0.7, h: 0.14 });
  ved.sel = ved.layers.length - 1;
  vedSyncControls();
  drawVEditor();
}
function vedAddText() {
  if (!ved.postVertical) return;
  ved.layers.push({ kind: "text", text: "Your text", fontId: "classic", fontSize: 34, color: "#ffffff", bg: "none", x: 0.15, y: 0.44, w: 0.7, h: 0.12 });
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
    const w = 0.6;
    const h = Math.min(0.6, (w * (9 / 16)) / aspect);
    ved.layers.push({ kind: "image", name: ov.name, url: ov.url, img, aspect, x: (1 - w) / 2, y: 0.45, w, h });
    ved.sel = ved.layers.length - 1;
    vedSyncControls();
    drawVEditor();
  };
  img.src = ov.url;
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
  const postVertical = !!opts.postVertical && !!item.vUrl;
  const src = postVertical ? item.vUrl : item.url;
  if (!src) return;
  const v = ved.video = Object.assign(document.createElement("video"), { muted: true, playsInline: true, preload: "auto", src });
  try {
    await new Promise((res, rej) => { v.onloadedmetadata = res; v.onerror = () => rej(new Error("preview")); });
    ved.index = i;
    ved.postVertical = postVertical;
    ved.frame = postVertical ? null : clone(opts.frame || item.vFrame || state.lastFrame || defaultFrame());
    ved.returnToEditor = !!opts.returnToEditor;
    ved.guides = null;
    ved.layers = postVertical ? [] : await preloadLayerImages(cloneLayers(item.vLayers));
    ved.sel = ved.layers.length ? 0 : -1;
    const slider = $("#ved-time");
    slider.min = 0; slider.max = v.duration || 1; slider.step = 0.1; slider.value = Math.min(PAD, (v.duration || 1) / 2);
    $("#ved-title").textContent = `Vertical Editor: ${item.title}`;
    const cv = $("#ved-canvas");
    cv.width = 540; cv.height = 960;
    $("#ved-stage").style.maxWidth = "calc(50dvh * 0.5625)";
    vedRenderFontUI();
    vedRenderOverlayList();
    vedRenderClips(i);
    vedSyncControls();
    $("#veditor").hidden = false;
    $("#veditor").scrollTop = 0;
    document.body.style.overflow = "hidden";
    await vedSeek(Number(slider.value));
    drawVEditor();
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
      return { idx: ved.sel, mode: "resize", ox: p.x - (l.x + l.w), oy: p.y - (l.y + l.h), baseW: l.w, baseFont: l.fontSize || 34 };
    }
  }
  for (let idx = ved.layers.length - 1; idx >= 0; idx--) {
    const l = ved.layers[idx];
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
    if (l.kind === "text" && d.baseW > 0) {
      l.fontSize = clamp(Math.round(d.baseFont * (l.w / d.baseW)), 12, 140);
    }
  }
  drawVEditor();
});
["pointerup", "pointercancel"].forEach(t => vedCanvas.addEventListener(t, () => { ved.drag = null; ved.guides = null; drawVEditor(); }));

async function exportPostVerticalEdits(i, layers) {
  const item = state.outputs[i];
  const mb = await getMediabunny();
  if (!mb) throw new Error("Hardware video editor is unavailable on this device.");
  const { Input, Output, Conversion, ALL_FORMATS, BlobSource, Mp4OutputFormat, BufferTarget } = mb;
  const W = 1080, H = 1920;
  const loaded = await preloadLayerImages(layers);
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(item.vBlob) });
  const output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() });
  let canvas = null, ctx = null, baseCv = null, baseCtx = null;
  try {
    const conversion = await Conversion.init({
      input,
      output,
      video: {
        codec: "avc",
        bitrate: 5_000_000,
        hardwareAcceleration: "prefer-hardware",
        processedWidth: W,
        processedHeight: H,
        process: (sample) => {
          if (!ctx) {
            canvas = ensureCanvas(null, W, H);
            ctx = canvas.getContext("2d", { alpha: false });
            baseCv = ensureCanvas(null, W, H);
            baseCtx = baseCv.getContext("2d", { alpha: false });
          }
          sample.draw(baseCtx, 0, 0, W, H);
          ctx.drawImage(baseCv, 0, 0, W, H);
          drawVerticalLayers(ctx, baseCv, W, H, loaded);
          return canvas;
        },
      },
    });
    if (!conversion.isValid) throw new Error("Could not initialize vertical export.");
    conversion.onProgress = p => setBar(p);
    state.activeConversion = conversion;
    await conversion.execute();
    const vBlob = new Blob([output.target.buffer], { type: "video/mp4" });
    if (item.vUrl) URL.revokeObjectURL(item.vUrl);
    item.vBlob = vBlob;
    item.vUrl = URL.createObjectURL(vBlob);
    const box = $(`#vbox-${i}`);
    const vid = box.querySelector("video");
    const dl = box.querySelector("a[download]");
    if (vid) vid.src = item.vUrl;
    if (dl) dl.href = item.vUrl;
    if (typeof syncHistory === "function") await syncHistory(true);
  } finally {
    state.activeConversion = null;
    try { input.dispose?.(); } catch {}
  }
}

$("#ved-time").addEventListener("input", async e => { await vedSeek(Number(e.target.value)); drawVEditor(); });
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
$("#ved-clips").addEventListener("change", vedSyncClipsCount);
$("#ved-clip-count").addEventListener("input", e => {
  const n = clamp(Number(e.target.value) || 1, 1, state.outputs.length);
  document.querySelectorAll('#ved-clips input[type="checkbox"]').forEach((b, idx) => { b.checked = idx < n; });
});
$("#ved-pick-all").addEventListener("click", () => {
  const boxes = [...document.querySelectorAll('#ved-clips input[type="checkbox"]')];
  const allOn = boxes.every(b => b.checked);
  boxes.forEach(b => { b.checked = !allOn; });
  vedSyncClipsCount();
});
$("#ved-back").addEventListener("click", () => closeVerticalEditor(true));
$("#ved-save").addEventListener("click", () => {
  if (ved.postVertical) {
    if (!ved.layers.length) return closeVerticalEditor(false);
    const i = ved.index, layers = cloneLayers(ved.layers);
    closeVerticalEditor(false);
    state.clipTotal = 1;
    runTask(() => exportPostVerticalEdits(i, layers), "Rendering vertical edits...");
    return;
  }
  const list = vedCheckedIndices();
  if (!list.length) return toast("Select at least one clip to save edits to.", true);
  const clean = cloneLayers(ved.layers);
  list.forEach(idx => {
    if (state.outputs[idx]) state.outputs[idx].vLayers = cloneLayers(clean);
  });
  toast(`Saved edits to ${list.length} clip${list.length === 1 ? "" : "s"}. Click Move Back to export.`);
});
document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("#veditor").hidden) closeVerticalEditor(true); });
