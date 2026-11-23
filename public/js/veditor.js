"use strict";
/* Vertical Editor: pre-vertical blur, image overlays, movable/resizable text boxes, clip switcher, and Applies-to-all / Individual toggle (text only in Individual mode). */
const ved = { index: 0, layers: [], sel: -1, drag: null, k: 1, video: null, baseCv: null, pixCv: null, blurCv: null, frame: null, returnToEditor: false, guides: null, scope: "all", silSens: "normal", silence: null, bgm: null, bgmAudio: null, faceLandmarker: null, capModel: "tiny", captions: null, transcribers: {} };

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
const VED_COLORS = ["#ffffff", "#000000", "#facc15", "#e11d2e", "#38bdf8", "#f0b35a", "#42c98b", "#ff5a5f"];

function cloneLayers(layers) {
  return (layers || []).map(l => {
    const copy = {
      kind: l.kind, x: l.x, y: l.y, w: l.w, h: l.h,
      opacity: l.opacity == null ? 1 : clamp(Number(l.opacity) || 1, 0.05, 1),
      startTime: Math.max(0, Number(l.startTime) || 0),
      endTime: (l.endTime !== "" && l.endTime != null && Number(l.endTime) > 0) ? Number(l.endTime) : null,
    };
    if (l.kind === "blur") { copy.blurType = l.blurType; copy.amount = l.amount; }
    else if (l.kind === "text") { copy.text = l.text; copy.fontId = l.fontId; copy.fontSize = l.fontSize; copy.color = l.color; copy.bg = l.bg; copy.fx = l.fx || (l.bg === "none" ? "shadow" : "none"); copy.align = l.align || "center"; }
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

  ctx.save();
  ctx.beginPath();
  ctx.rect(rx, ry, rw, rh);
  ctx.clip();
  ctx.filter = `blur(${blurPx}px)`;
  ctx.drawImage(ved.blurCv, 0, 0, bw, bh, rx - pad, ry - pad, bw, bh);
  ctx.filter = "none";
  if (frosted) {
    ctx.fillStyle = "rgba(15, 16, 24, 0.30)";
    ctx.fillRect(rx, ry, rw, rh);
  }
  ctx.restore();
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
  const fx = l.fx || (l.bg === "none" ? "shadow" : "none");
  const totalH = lines.length * lineH;
  const startY = ry + (rh - totalH) / 2 + lineH / 2;
  const tx = align === "left" ? rx + padX : align === "right" ? rx + rw - padX : rx + rw / 2;
  if (fx === "outline") {
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(2, Math.round(pxSize * 0.14));
    ctx.strokeStyle = "#000000";
    ctx.shadowColor = "rgba(0,0,0,0.65)";
    ctx.shadowBlur = Math.round(6 * s);
    ctx.shadowOffsetY = Math.round(2 * s);
    lines.forEach((line, idx) => ctx.strokeText(line, tx, startY + idx * lineH));
    ctx.shadowColor = "transparent"; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  } else if (fx === "glow") {
    ctx.shadowColor = l.color || "#ffffff";
    ctx.shadowBlur = Math.round(18 * s);
    ctx.shadowOffsetY = 0;
    ctx.fillStyle = l.color || "#ffffff";
    lines.forEach((line, idx) => ctx.fillText(line, tx, startY + idx * lineH));
    ctx.shadowBlur = Math.round(8 * s);
  } else if (fx === "shadow") {
    ctx.shadowColor = "rgba(0,0,0,0.82)";
    ctx.shadowBlur = Math.round(8 * s);
    ctx.shadowOffsetY = Math.round(2.5 * s);
  }
  ctx.fillStyle = l.color || "#ffffff";
  lines.forEach((line, idx) => ctx.fillText(line, tx, startY + idx * lineH));
  ctx.restore();
}
function drawVerticalLayers(ctx, baseCv, W, H, layers, timeSec = null) {
  const s = W / 540;
  for (const l of layers) {
    if (timeSec != null && Number.isFinite(timeSec)) {
      const st = Math.max(0, Number(l.startTime) || 0);
      const hasEnd = l.endTime !== "" && l.endTime != null && Number(l.endTime) > 0;
      const en = hasEnd ? Number(l.endTime) : Infinity;
      if (timeSec < st - 0.001 || timeSec > en + 0.001) continue;
    }
    const alpha = l.opacity == null ? 1 : clamp(Number(l.opacity) || 1, 0.05, 1);
    const rx = Math.round(l.x * W), ry = Math.round(l.y * H);
    const rw = Math.max(2, Math.round(l.w * W)), rh = Math.max(2, Math.round(l.h * H));
    ctx.save();
    ctx.globalAlpha *= alpha;
    if (l.kind === "blur") {
      if (l.blurType === "pixel") {
        const block = Math.max(4, Math.round(l.amount * s));
        const pw = Math.max(1, Math.round(rw / block)), ph = Math.max(1, Math.round(rh / block));
        ved.pixCv = ensureCanvas(ved.pixCv, pw, ph);
        ved.pixCv.getContext("2d").drawImage(baseCv, rx, ry, rw, rh, 0, 0, pw, ph);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(ved.pixCv, 0, 0, pw, ph, rx, ry, rw, rh);
      } else {
        drawEdgePaddedBlur(ctx, baseCv, W, H, rx, ry, rw, rh, Math.max(1, Math.round(l.amount * s)), l.blurType === "frosted");
      }
    } else if (l.kind === "image" && l.img) {
      ctx.drawImage(l.img, rx, ry, rw, rh);
    } else if (l.kind === "text") {
      drawTextLayer(ctx, l, rx, ry, rw, rh, s);
    }
    ctx.restore();
  }
}
function drawCaptions(ctx, W, H, capCfg, timeSec) {
  const words = capCfg?.words;
  if (!capCfg?.enabled || !Array.isArray(words) || !words.length) return;
  const t = Number(timeSec) || 0;
  let activeIdx = -1;
  for (let i = 0; i < words.length; i++) {
    if (t >= words[i].start - 0.04 && t <= words[i].end + 0.08) { activeIdx = i; break; }
  }
  if (activeIdx < 0) return;
  const s = W / 540;
  const style = capCfg.style || "highlight";
  const hlColor = capCfg.color || "#facc15";
  const pxSize = Math.max(14, Math.round((capCfg.fontSize || 40) * s));
  const cy = Math.round(clamp(Number(capCfg.y) || 0.72, 0.1, 0.92) * H);

  ctx.save();
  ctx.font = `800 ${pxSize}px "Montserrat", "Inter", system-ui, sans-serif`;
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(3, Math.round(pxSize * 0.18));
  ctx.strokeStyle = "#000000";
  ctx.shadowColor = "rgba(0,0,0,0.8)";
  ctx.shadowBlur = Math.round(8 * s);
  ctx.shadowOffsetY = Math.round(2 * s);

  if (style === "word") {
    const txt = String(words[activeIdx].word || "").toUpperCase();
    ctx.textAlign = "center";
    ctx.strokeText(txt, W / 2, cy);
    ctx.shadowColor = "transparent";
    ctx.fillStyle = hlColor;
    ctx.fillText(txt, W / 2, cy);
    ctx.restore();
    return;
  }

  const groupSize = 3;
  const gStart = Math.floor(activeIdx / groupSize) * groupSize;
  const group = words.slice(gStart, Math.min(words.length, gStart + groupSize));
  const labels = group.map(w => style === "highlight" ? String(w.word || "").toUpperCase() : String(w.word || ""));
  const spaceW = ctx.measureText(" ").width;
  const widths = labels.map(txt => ctx.measureText(txt).width);
  const totalW = widths.reduce((a, b) => a + b, 0) + spaceW * Math.max(0, labels.length - 1);
  let x = (W - totalW) / 2;
  ctx.textAlign = "left";
  group.forEach((w, idx) => {
    const txt = labels[idx];
    const isCur = (gStart + idx) === activeIdx;
    ctx.strokeText(txt, x, cy);
    ctx.save();
    ctx.shadowColor = "transparent";
    ctx.fillStyle = (style === "highlight" && isCur) ? hlColor : "#ffffff";
    ctx.fillText(txt, x, cy);
    ctx.restore();
    x += widths[idx] + spaceW;
  });
  ctx.restore();
}
function drawVEditor() {
  const v = ved.video, cv = $("#ved-canvas"), ctx = cv.getContext("2d");
  if (!v || !cv) return;
  ved.k = cv.getBoundingClientRect().width / cv.width || 1;
  const u = 1 / ved.k, W = cv.width, H = cv.height;
  ved.baseCv = ensureCanvas(ved.baseCv, W, H);
  const bctx = ved.baseCv.getContext("2d");
  const curTime = Number(v.currentTime) || Number($("#ved-time").value) || 0;
  if (ved.frame && v.videoWidth && v.videoHeight) {
    const boxes = getFrameBoxes(ved.frame), slots = typeof getFrameSlots === "function" ? getFrameSlots(ved.frame) : getLayoutSlots(boxes.length, ved.frame.layout);
    const sw = v.videoWidth, sh = v.videoHeight;
    const sq = !!ved.frame.square1x1, cY = sq ? Math.round((H - W) / 2) : 0, cH = sq ? W : H;
    bctx.fillStyle = "#000"; bctx.fillRect(0, 0, W, H);
    bctx.save();
    if (sq) { bctx.beginPath(); bctx.rect(0, cY, W, cH); bctx.clip(); }
    if (ved.frame.stage?.enabled && typeof drawStageComposition === "function") {
      if (sq) bctx.translate(0, cY);
      drawStageComposition(bctx, v, sw, sh, boxes, ved.frame, W, cH, {
        ...previewStageOpts(state.outputs[ved.index], ved.frame, curTime),
        showGuide: false,
      });
    } else {
      const px = r => ({ x: r.x * sw, y: r.y * sh, w: r.w * sw, h: r.h * sh });
      boxes.forEach((box, idx) => {
        const sl = slots[idx], dx = Math.round(sl.x * W), dy = cY + Math.round(sl.y * cH), dw = Math.round(sl.w * W), dh = Math.round(sl.h * cH);
        const m = mapBox(px(box), dw, dh, ved.frame.fit);
        bctx.drawImage(v, m.sx, m.sy, m.sw, m.sh, dx + m.dx, dy + m.dy, m.dw, m.dh);
      });
      if (sq) { bctx.translate(0, cY); drawDividerLines(bctx, W, cH, ved.frame); }
      else drawDividerLines(bctx, W, H, ved.frame);
    }
    bctx.restore();
  } else {
    bctx.drawImage(v, 0, 0, W, H);
  }
  ctx.drawImage(ved.baseCv, 0, 0, W, H);
  drawVerticalLayers(ctx, ved.baseCv, W, H, ved.layers, curTime);
  if (ved.captions?.enabled) drawCaptions(ctx, W, H, ved.captions, curTime);

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
  const sqOn = !!ved.frame?.square1x1;
  document.querySelectorAll("#ved-aspect button").forEach(b => b.classList.toggle("on", (b.dataset.aspect === "square") === sqOn));
  vedSyncClipBar();
  document.querySelectorAll("#ved-sil-sens button").forEach(b => b.classList.toggle("on", b.dataset.sens === (ved.silSens || "normal")));
  if ($("#ved-sil-status")) {
    $("#ved-sil-status").textContent = ved.silence?.enabled
      ? `Trimmed ${ved.silence.pauseCount} pause${ved.silence.pauseCount === 1 ? "" : "s"} (${ved.silence.savedSec.toFixed(1)}s saved)`
      : "Off";
  }
  if ($("#ved-sil-reset")) $("#ved-sil-reset").hidden = !ved.silence?.enabled;
  if ($("#ved-bgm-name")) $("#ved-bgm-name").textContent = ved.bgm?.blob ? (ved.bgm.name || "Audio track") : "None";
  if ($("#ved-bgm-clear")) $("#ved-bgm-clear").hidden = !ved.bgm?.blob;
  if ($("#ved-bgm-vol-wrap")) $("#ved-bgm-vol-wrap").hidden = !ved.bgm?.blob;
  const volPct = Math.round((ved.bgm?.volume ?? 0.15) * 100);
  if ($("#ved-bgm-vol")) $("#ved-bgm-vol").value = volPct;
  if ($("#ved-bgm-vol-val")) $("#ved-bgm-vol-val").textContent = volPct;
  document.querySelectorAll("#ved-cap-model button").forEach(b => b.classList.toggle("on", b.dataset.cmodel === (ved.capModel || "tiny")));
  const hasCap = !!(ved.captions?.enabled && ved.captions.words?.length);
  if ($("#ved-cap-status") && !$("#ved-cap-gen")?.disabled) {
    $("#ved-cap-status").textContent = hasCap ? `${ved.captions.words.length} words ready` : "Off";
  }
  if ($("#ved-cap-clear")) $("#ved-cap-clear").hidden = !hasCap;
  if ($("#ved-cap-opts")) $("#ved-cap-opts").hidden = !hasCap;
  if (hasCap) {
    document.querySelectorAll("#ved-cap-style button").forEach(b => b.classList.toggle("on", b.dataset.cstyle === (ved.captions.style || "highlight")));
    document.querySelectorAll("#ved-cap-colors button").forEach(b => b.classList.toggle("on", b.dataset.ccolor === (ved.captions.color || "#facc15")));
    const cSz = ved.captions.fontSize || 40;
    if ($("#ved-cap-size")) $("#ved-cap-size").value = cSz;
    if ($("#ved-cap-size-val")) $("#ved-cap-size-val").textContent = cSz;
    const cY = Math.round((ved.captions.y || 0.72) * 100);
    if ($("#ved-cap-y")) $("#ved-cap-y").value = cY;
    if ($("#ved-cap-y-val")) $("#ved-cap-y-val").textContent = cY;
    if ($("#ved-cap-text") && document.activeElement !== $("#ved-cap-text")) {
      $("#ved-cap-text").value = ved.captions.words.map(w => w.word).join(" ");
    }
  }

  if (!isIndiv && ved.layers[ved.sel]?.kind === "text") ved.sel = -1;
  const l = ved.layers[ved.sel];
  $("#ved-layer-tools").hidden = !l;
  if (!l) return;
  $("#ved-blur-opts").hidden = l.kind !== "blur";
  $("#ved-text-opts").hidden = !(l.kind === "text" && isIndiv);
  const opPct = Math.round((l.opacity == null ? 1 : clamp(Number(l.opacity) || 1, 0.05, 1)) * 100);
  if ($("#ved-opacity")) $("#ved-opacity").value = opPct;
  if ($("#ved-opacity-val")) $("#ved-opacity-val").textContent = opPct;
  if ($("#ved-t-start")) $("#ved-t-start").value = l.startTime ? Number(l.startTime) : "";
  if ($("#ved-t-end")) $("#ved-t-end").value = (l.endTime != null && Number(l.endTime) > 0) ? Number(l.endTime) : "";
  if (l.kind === "blur") {
    document.querySelectorAll("#ved-btype button").forEach(b => b.classList.toggle("on", b.dataset.btype === l.blurType));
    $("#ved-amount").value = l.amount;
    $("#ved-amount-val").textContent = l.amount;
  } else if (l.kind === "text" && isIndiv) {
    $("#ved-text-input").value = l.text || "";
    $("#ved-font-size").value = l.fontSize || 32;
    $("#ved-fsize-val").textContent = l.fontSize || 32;
    const fxVal = l.fx || (l.bg === "none" ? "shadow" : "none");
    document.querySelectorAll("#ved-font-grid button").forEach(b => b.classList.toggle("on", b.dataset.font === l.fontId));
    document.querySelectorAll("#ved-text-colors button").forEach(b => b.classList.toggle("on", b.dataset.color === l.color));
    document.querySelectorAll("#ved-text-fx button").forEach(b => b.classList.toggle("on", b.dataset.fx === fxVal));
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
  if ($("#ved-cap-colors")) {
    $("#ved-cap-colors").innerHTML = ["#facc15", "#e11d2e", "#42c98b", "#38bdf8", "#ffffff"].map(c =>
      `<button type="button" class="ved-color-dot" data-ccolor="${c}" style="background:${c}" aria-label="Caption color ${c}"></button>`
    ).join("");
  }
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
function cloneBgm(bgm) {
  return bgm?.blob ? { name: bgm.name || "Audio track", volume: bgm.volume ?? 0.15, blob: bgm.blob } : null;
}
function vedSaveLayersToState() {
  const clean = cloneLayers(ved.layers);
  const sq = !!ved.frame?.square1x1;
  if (state.lastFrame) state.lastFrame.square1x1 = sq;
  if (ved.scope === "individual") {
    const out = state.outputs[ved.index];
    if (out) {
      out.vLayers = clean;
      out.vFrame = clone(ved.frame || out.vFrame || state.lastFrame || defaultFrame());
      out.vFrame.square1x1 = sq;
      out.vSilence = ved.silence ? clone(ved.silence) : null;
      out.vBgm = cloneBgm(ved.bgm);
      out.vCaptions = ved.captions ? clone(ved.captions) : null;
    }
    return;
  }
  const sharedNonText = clean.filter(l => l.kind !== "text");
  const curText = clean.filter(l => l.kind === "text");
  state.outputs.forEach((out, idx) => {
    const existingText = idx === ved.index
      ? curText
      : cloneLayers((out.vLayers || []).filter(l => l.kind === "text"));
    out.vLayers = [...cloneLayers(sharedNonText), ...existingText];
    if (idx === ved.index && ved.frame) out.vFrame = clone(ved.frame);
    else {
      out.vFrame = clone(out.vFrame || ved.frame || state.lastFrame || defaultFrame());
      out.vFrame.square1x1 = sq;
    }
    if (idx === ved.index) { out.vSilence = ved.silence ? clone(ved.silence) : null; out.vCaptions = ved.captions ? clone(ved.captions) : null; }
    out.vBgm = cloneBgm(ved.bgm);
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
    fx: "shadow",
    opacity: 1,
    startTime: 0,
    endTime: null,
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
  previewStop();
  const v = ved.video = Object.assign(document.createElement("video"), { muted: true, playsInline: true, preload: "auto", src: item.url });
  await new Promise((res, rej) => { v.onloadedmetadata = res; v.onerror = () => rej(new Error("preview")); });
  ved.index = i;
  ved.guides = null;
  const baseFrame = item.vFrame || state.lastFrame || defaultFrame();
  ved.frame = clone(baseFrame);
  ved.silence = item.vSilence ? clone(item.vSilence) : null;
  ved.silSens = ved.silence?.sensitivity || "normal";
  ved.bgm = item.vBgm ? { ...item.vBgm } : null;
  ved.captions = item.vCaptions ? clone(item.vCaptions) : null;
  if ($("#ved-face-status")) $("#ved-face-status").textContent = "";
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
    const _vedPrefs = typeof loadClipperPrefs === "function" ? loadClipperPrefs().ved : { scope: "all" };
    ved.scope = _vedPrefs.scope === "individual" ? "individual" : "all";
    ved.frame = clone(opts.frame || item.vFrame || state.lastFrame || defaultFrame());
    ved.returnToEditor = !!opts.returnToEditor;
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
  previewStop();
  if (ved.bgmAudio) { try { ved.bgmAudio.pause(); } catch {} }
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

$("#ved-time").addEventListener("input", async e => { previewStop(); await vedSeek(Number(e.target.value)); drawVEditor(); });
$("#ved-prev-clip")?.addEventListener("click", () => switchVedClip(-1));
$("#ved-next-clip")?.addEventListener("click", () => switchVedClip(1));
$("#ved-scope")?.addEventListener("click", e => {
  const b = e.target.closest("button[data-scope]");
  if (!b) return;
  ved.scope = b.dataset.scope === "individual" ? "individual" : "all";
  if (typeof saveClipperPrefs === "function") saveClipperPrefs({ ved: { scope: ved.scope } });
  vedSyncControls();
  drawVEditor();
});
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
$("#ved-aspect")?.addEventListener("click", e => {
  const b = e.target.closest("button[data-aspect]");
  if (!b || !ved.frame) return;
  ved.frame.square1x1 = b.dataset.aspect === "square";
  vedSyncControls();
  drawVEditor();
});
$("#ved-text-fx")?.addEventListener("click", e => {
  const b = e.target.closest("button[data-fx]");
  const l = ved.layers[ved.sel];
  if (!b || !l || l.kind !== "text") return;
  l.fx = b.dataset.fx;
  vedSyncControls();
  drawVEditor();
});
$("#ved-text-presets")?.addEventListener("click", e => {
  const b = e.target.closest("button[data-tpreset]");
  const l = ved.layers[ved.sel];
  if (!b || !l || l.kind !== "text") return;
  const p = b.dataset.tpreset;
  if (p === "hook") {
    Object.assign(l, { fontId: "headline", fontSize: 42, color: "#e11d2e", bg: "none", fx: "glow", opacity: 1, startTime: 0, endTime: 3, align: "center" });
  } else if (p === "caption") {
    Object.assign(l, { fontId: "headline", fontSize: 36, color: "#facc15", bg: "none", fx: "outline", opacity: 1, startTime: 0, endTime: null, align: "center" });
  } else if (p === "watermark") {
    Object.assign(l, { fontId: "classic_medium", fontSize: 18, color: "#ffffff", bg: "none", fx: "shadow", opacity: 0.55, startTime: 0, endTime: null, align: "center" });
  }
  vedSyncControls();
  drawVEditor();
});
$("#ved-opacity")?.addEventListener("input", e => {
  const l = ved.layers[ved.sel];
  if (!l) return;
  const pct = clamp(Number(e.target.value) || 100, 5, 100);
  l.opacity = pct / 100;
  if ($("#ved-opacity-val")) $("#ved-opacity-val").textContent = pct;
  drawVEditor();
});
$("#ved-t-start")?.addEventListener("input", e => {
  const l = ved.layers[ved.sel];
  if (!l) return;
  l.startTime = Math.max(0, Number(e.target.value) || 0);
  drawVEditor();
});
$("#ved-t-end")?.addEventListener("input", e => {
  const l = ved.layers[ved.sel];
  if (!l) return;
  const val = e.target.value.trim();
  l.endTime = (val !== "" && Number(val) > 0) ? Number(val) : null;
  drawVEditor();
});
$("#ved-t-hook")?.addEventListener("click", () => {
  const l = ved.layers[ved.sel];
  if (!l) return;
  l.startTime = 0; l.endTime = 3;
  vedSyncControls();
  drawVEditor();
});
$("#ved-t-full")?.addEventListener("click", () => {
  const l = ved.layers[ved.sel];
  if (!l) return;
  l.startTime = 0; l.endTime = null;
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
    ? "Edits applied to all clips (text stays individual). Click Move Back to export."
    : `Saved edits to clip ${ved.index + 1}. Click Move Back to export.`);
});
document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("#veditor").hidden) closeVerticalEditor(true); });

/* ---- Phase 2: Auto-face centering, Silence cutting, Background music ---- */
const SILENCE_SENS = {
  gentle: { db: -38, minGap: 0.6 },
  normal: { db: -32, minGap: 0.45 },
  tight:  { db: -26, minGap: 0.3 },
};
async function vedScanSilences(blob, sensKey = "normal") {
  const cfg = SILENCE_SENS[sensKey] || SILENCE_SENS.normal;
  const thresh = Math.pow(10, cfg.db / 20);
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) throw new Error("Audio analysis is not supported in this browser.");
  const ac = new AC();
  let buf;
  try { buf = await ac.decodeAudioData(await blob.arrayBuffer()); }
  finally { try { await ac.close(); } catch {} }
  const sr = buf.sampleRate, len = buf.length, chs = buf.numberOfChannels;
  const win = Math.max(1, Math.round(sr * 0.02));
  const nWin = Math.floor(len / win);
  const active = new Uint8Array(nWin);
  const chData = Array.from({ length: chs }, (_, c) => buf.getChannelData(c));
  for (let w = 0; w < nWin; w++) {
    let sum = 0;
    const base = w * win;
    for (let i = 0; i < win; i++) {
      let s = 0;
      for (let c = 0; c < chs; c++) s += chData[c][base + i];
      s /= chs;
      sum += s * s;
    }
    if (Math.sqrt(sum / win) >= thresh) active[w] = 1;
  }
  const padWin = Math.round(0.12 / 0.02);
  const padded = new Uint8Array(nWin);
  for (let w = 0; w < nWin; w++) {
    if (!active[w]) continue;
    for (let k = Math.max(0, w - padWin); k <= Math.min(nWin - 1, w + padWin); k++) padded[k] = 1;
  }
  const minGapWin = Math.round(cfg.minGap / 0.02);
  let i = 0;
  while (i < nWin) {
    if (padded[i]) { i++; continue; }
    let j = i;
    while (j < nWin && !padded[j]) j++;
    if (i > 0 && j < nWin && (j - i) < minGapWin) {
      for (let k = i; k < j; k++) padded[k] = 1;
    }
    i = j;
  }
  const segments = [];
  i = 0;
  while (i < nWin) {
    if (!padded[i]) { i++; continue; }
    let j = i;
    while (j < nWin && padded[j]) j++;
    const s = i * 0.02, e = Math.min(buf.duration, j * 0.02);
    if (e - s >= 0.15) segments.push({ start: s, end: e });
    i = j;
  }
  if (!segments.length) return { enabled: false, sensitivity: sensKey, segments: [], savedSec: 0, pauseCount: 0, totalDur: buf.duration };
  const kept = segments.reduce((acc, g) => acc + (g.end - g.start), 0);
  const savedSec = Math.max(0, buf.duration - kept);
  const pauseCount = Math.max(0, segments.length - 1) + (segments[0].start > 0.25 ? 1 : 0) + (buf.duration - segments[segments.length - 1].end > 0.25 ? 1 : 0);
  return { enabled: savedSec >= 0.2, sensitivity: sensKey, segments, savedSec, pauseCount, totalDur: buf.duration };
}

async function getVedFaceLandmarker() {
  if (ved.faceLandmarker) return ved.faceLandmarker;
  const mod = await import("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/+esm");
  const { FaceLandmarker, FilesetResolver } = mod;
  const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm");
  ved.faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
      delegate: "GPU",
    },
    runningMode: "IMAGE",
    numFaces: 4,
  });
  return ved.faceLandmarker;
}

async function vedAutoCenterFaces() {
  const v = ved.video;
  if (!v || !v.videoWidth || !ved.frame) return;
  const st = $("#ved-face-status");
  if (st) st.textContent = "Scanning...";
  try {
    const fl = await getVedFaceLandmarker();
    const cv = document.createElement("canvas");
    const scale = Math.min(1, 640 / v.videoWidth);
    cv.width = Math.round(v.videoWidth * scale);
    cv.height = Math.round(v.videoHeight * scale);
    cv.getContext("2d").drawImage(v, 0, 0, cv.width, cv.height);
    const res = fl.detect(cv);
    const faces = (res?.faceLandmarks || []).map(lm => {
      let minX = 1, maxX = 0, minY = 1, maxY = 0;
      for (const p of lm) {
        if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
      }
      return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
    });
    if (!faces.length) {
      if (st) st.textContent = "No face found";
      toast("No face detected at this timestamp.", true);
      return;
    }
    const boxes = getFrameBoxes(ved.frame);
    let moved = 0;
    boxes.forEach(box => {
      const bx = box.x + box.w / 2, by = box.y + box.h / 2;
      let best = faces[0], bestD = Infinity;
      for (const f of faces) {
        const d = Math.hypot(f.cx - bx, f.cy - by);
        if (d < bestD) { bestD = d; best = f; }
      }
      if (best) {
        box.x = clamp(best.cx - box.w / 2, 0, 1 - box.w);
        box.y = clamp(best.cy - box.h * 0.38, 0, 1 - box.h);
        moved++;
      }
    });
    if (st) st.textContent = `Centered ${moved} box${moved === 1 ? "" : "es"}`;
    drawVEditor();
    toast("Centered framing on speaker face.");
  } catch (err) {
    console.warn("Auto-center face failed:", err);
    if (st) st.textContent = "Unavailable";
    toast("Face detector unavailable offline.", true);
  }
}

$("#ved-face-center")?.addEventListener("click", vedAutoCenterFaces);
$("#ved-sil-sens")?.addEventListener("click", e => {
  const b = e.target.closest("button[data-sens]");
  if (!b) return;
  ved.silSens = b.dataset.sens;
  vedSyncControls();
});
$("#ved-sil-scan")?.addEventListener("click", async () => {
  const item = state.outputs[ved.index];
  if (!item?.blob) return;
  const btn = $("#ved-sil-scan");
  btn.disabled = true;
  if ($("#ved-sil-status")) $("#ved-sil-status").textContent = "Scanning...";
  try {
    const res = await vedScanSilences(item.blob, ved.silSens || "normal");
    ved.silence = res.enabled ? res : null;
    vedSyncControls();
    toast(res.enabled
      ? `Found ${res.pauseCount} pause${res.pauseCount === 1 ? "" : "s"} (${res.savedSec.toFixed(1)}s will be trimmed on export).`
      : "No long pauses found.");
  } catch (err) {
    toast(err.message || "Could not scan audio.", true);
  } finally {
    btn.disabled = false;
  }
});
$("#ved-sil-reset")?.addEventListener("click", () => {
  ved.silence = null;
  vedSyncControls();
  toast("Silence trim cleared.");
});
$("#ved-bgm-pick")?.addEventListener("click", () => $("#ved-bgm-file")?.click());
$("#ved-bgm-file")?.addEventListener("change", e => {
  const file = e.target.files?.[0];
  e.target.value = "";
  if (!file) return;
  ved.bgm = { name: file.name, volume: ved.bgm?.volume ?? 0.15, blob: file };
  vedSyncControls();
  toast("Background music added.");
});
$("#ved-bgm-clear")?.addEventListener("click", () => {
  ved.bgm = null;
  vedSyncControls();
  toast("Background music removed.");
});
$("#ved-bgm-vol")?.addEventListener("input", e => {
  if (!ved.bgm) return;
  const pct = clamp(Number(e.target.value) || 15, 2, 60);
  ved.bgm.volume = pct / 100;
  if ($("#ved-bgm-vol-val")) $("#ved-bgm-vol-val").textContent = pct;
});

/* ---- Phase 3: In-browser Auto-Captions (Whisper via Transformers.js) ---- */
async function vedExtract16kMono(blob, silenceCfg) {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) throw new Error("Web Audio is not supported in this browser.");
  const ac = new AC();
  let buf;
  try { buf = await ac.decodeAudioData(await blob.arrayBuffer()); }
  finally { try { await ac.close(); } catch {} }
  const segs = (silenceCfg?.enabled && silenceCfg.segments?.length) ? silenceCfg.segments : [{ start: 0, end: buf.duration }];
  const totalDur = Math.max(0.1, segs.reduce((a, g) => a + Math.max(0, g.end - g.start), 0));
  const off = new OfflineAudioContext(1, Math.ceil(totalDur * 16000), 16000);
  let cursor = 0;
  for (const g of segs) {
    const dur = Math.max(0, g.end - g.start);
    if (dur <= 0) continue;
    const src = off.createBufferSource();
    src.buffer = buf;
    src.connect(off.destination);
    src.start(cursor, g.start, dur);
    cursor += dur;
  }
  const rendered = await off.startRendering();
  return rendered.getChannelData(0);
}

function vedNormalizeWhisperWords(result, totalDur) {
  const out = [];
  const chunks = Array.isArray(result?.chunks) ? result.chunks : [];
  for (const ch of chunks) {
    const raw = String(ch.text || "").trim();
    if (!raw) continue;
    const t0 = Number(ch.timestamp?.[0]) || 0;
    const t1 = Number(ch.timestamp?.[1]);
    const end = (Number.isFinite(t1) && t1 > t0) ? t1 : Math.min(totalDur, t0 + Math.max(0.25, raw.length * 0.06));
    const parts = raw.split(/\s+/).filter(Boolean);
    if (parts.length <= 1) {
      out.push({ word: raw, start: t0, end });
    } else {
      const totalChars = Math.max(1, parts.reduce((a, p) => a + p.length, 0));
      let cur = t0;
      const span = Math.max(0.1, end - t0);
      for (const p of parts) {
        const wDur = span * (p.length / totalChars);
        out.push({ word: p, start: cur, end: cur + wDur });
        cur += wDur;
      }
    }
  }
  if (!out.length && result?.text) {
    const parts = String(result.text).trim().split(/\s+/).filter(Boolean);
    const step = totalDur / Math.max(1, parts.length);
    parts.forEach((p, idx) => out.push({ word: p, start: idx * step, end: (idx + 1) * step }));
  }
  return out;
}

async function vedGenerateCaptions() {
  const item = state.outputs[ved.index];
  if (!item?.blob) return;
  const btn = $("#ved-cap-gen"), st = $("#ved-cap-status");
  btn.disabled = true;
  if (st) st.textContent = "Preparing audio...";
  try {
    const audio16k = await vedExtract16kMono(item.blob, ved.silence);
    const modelId = ved.capModel === "base" ? "onnx-community/whisper-base" : "onnx-community/whisper-tiny";
    if (!ved.transcribers[modelId]) {
      if (st) st.textContent = "Downloading AI model (1st time)...";
      const { pipeline, env } = await import("https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.4.0/+esm");
      env.allowLocalModels = false;
      const device = navigator.gpu ? "webgpu" : "wasm";
      ved.transcribers[modelId] = await pipeline("automatic-speech-recognition", modelId, {
        device,
        dtype: device === "webgpu" ? "fp32" : "q8",
      });
    }
    if (st) st.textContent = "Transcribing...";
    const transcriber = ved.transcribers[modelId];
    const result = await transcriber(audio16k, { return_timestamps: "word", chunk_length_s: 30, stride_length_s: 5 });
    const words = vedNormalizeWhisperWords(result, audio16k.length / 16000);
    if (!words.length) {
      if (st) st.textContent = "No speech found";
      toast("No speech detected in this clip.", true);
      return;
    }
    ved.captions = {
      enabled: true,
      style: ved.captions?.style || "highlight",
      color: ved.captions?.color || "#facc15",
      fontSize: ved.captions?.fontSize || 40,
      y: ved.captions?.y || 0.72,
      words,
    };
    vedSyncControls();
    drawVEditor();
    toast(`Generated ${words.length} timed words.`);
  } catch (err) {
    console.warn("Auto-captions failed:", err);
    if (st) st.textContent = "Failed";
    toast("Could not generate captions. Check connection for 1st-time model download.", true);
  } finally {
    btn.disabled = false;
    vedSyncControls();
  }
}

$("#ved-cap-model")?.addEventListener("click", e => {
  const b = e.target.closest("button[data-cmodel]");
  if (!b) return;
  ved.capModel = b.dataset.cmodel;
  vedSyncControls();
});
$("#ved-cap-gen")?.addEventListener("click", vedGenerateCaptions);
$("#ved-cap-clear")?.addEventListener("click", () => {
  ved.captions = null;
  vedSyncControls();
  drawVEditor();
  toast("Captions removed.");
});
$("#ved-cap-style")?.addEventListener("click", e => {
  const b = e.target.closest("button[data-cstyle]");
  if (!b || !ved.captions) return;
  ved.captions.style = b.dataset.cstyle;
  vedSyncControls();
  drawVEditor();
});
$("#ved-cap-colors")?.addEventListener("click", e => {
  const b = e.target.closest("button[data-ccolor]");
  if (!b || !ved.captions) return;
  ved.captions.color = b.dataset.ccolor;
  vedSyncControls();
  drawVEditor();
});
$("#ved-cap-size")?.addEventListener("input", e => {
  if (!ved.captions) return;
  ved.captions.fontSize = Number(e.target.value) || 40;
  if ($("#ved-cap-size-val")) $("#ved-cap-size-val").textContent = ved.captions.fontSize;
  drawVEditor();
});
$("#ved-cap-y")?.addEventListener("input", e => {
  if (!ved.captions) return;
  const pct = clamp(Number(e.target.value) || 72, 15, 90);
  ved.captions.y = pct / 100;
  if ($("#ved-cap-y-val")) $("#ved-cap-y-val").textContent = pct;
  drawVEditor();
});
$("#ved-cap-text")?.addEventListener("input", e => {
  if (!ved.captions?.words?.length) return;
  const edited = e.target.value.trim().split(/\s+/).filter(Boolean);
  if (!edited.length) return;
  const old = ved.captions.words;
  const totalEnd = old[old.length - 1].end;
  const totalStart = old[0].start;
  ved.captions.words = edited.map((word, idx) => {
    if (idx < old.length) return { word, start: old[idx].start, end: old[idx].end };
    const step = (totalEnd - totalStart) / edited.length;
    return { word, start: totalStart + idx * step, end: totalStart + (idx + 1) * step };
  });
  drawVEditor();
});
