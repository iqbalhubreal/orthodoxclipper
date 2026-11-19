"use strict";
/* Post-vertical editor: add blur rectangles (type + intensity) and image overlays (presets + saved), drag/resize, export 1080x1920. */
const ved = { index: 0, layers: [], sel: -1, drag: null, scale: 1, k: 1, video: null, baseCv: null, pixCv: null };
const VED_HANDLES = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];

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
function drawVerticalLayers(ctx, baseCv, W, H, layers) {
  const s = W / 540;
  for (const l of layers) {
    const rx = Math.round(l.x * W), ry = Math.round(l.y * H);
    const rw = Math.max(2, Math.round(l.w * W)), rh = Math.max(2, Math.round(l.h * H));
    if (l.kind === "blur") {
      if (l.blurType === "pixel") {
        const block = Math.max(4, Math.round(l.amount * s));
        const pw = Math.max(1, Math.round(rw / block)), ph = Math.max(1, Math.round(rh / block));
        if (!ved.pixCv) ved.pixCv = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(pw, ph) : Object.assign(document.createElement("canvas"), { width: pw, height: ph });
        ved.pixCv.width = pw; ved.pixCv.height = ph;
        const pctx = ved.pixCv.getContext("2d");
        pctx.drawImage(baseCv, rx, ry, rw, rh, 0, 0, pw, ph);
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
    }
  }
}
function drawVEditor() {
  const v = ved.video, cv = $("#ved-canvas"), ctx = cv.getContext("2d");
  if (!v || !cv) return;
  ved.k = cv.getBoundingClientRect().width / cv.width || 1;
  const u = 1 / ved.k, W = cv.width, H = cv.height;
  if (!ved.baseCv) ved.baseCv = Object.assign(document.createElement("canvas"), { width: W, height: H });
  ved.baseCv.width = W; ved.baseCv.height = H;
  ved.baseCv.getContext("2d").drawImage(v, 0, 0, W, H);
  ctx.drawImage(ved.baseCv, 0, 0, W, H);
  drawVerticalLayers(ctx, ved.baseCv, W, H, ved.layers);

  ved.layers.forEach((l, idx) => {
    const on = idx === ved.sel;
    const x = l.x * W, y = l.y * H, w = l.w * W, h = l.h * H;
    const color = l.kind === "blur" ? "#f0b35a" : "#8b79ff";
    ctx.lineWidth = (on ? 2.5 : 1.5) * u;
    ctx.strokeStyle = color;
    ctx.setLineDash(on ? [] : [5 * u, 4 * u]);
    ctx.strokeRect(x, y, w, h);
    ctx.setLineDash([]);
    if (!on) return;
    for (const [hx, hy] of VED_HANDLES) {
      const rad = (hx && hy ? 8 : 6.5) * u;
      const cx = clamp(x + (hx + 1) * w / 2, rad + u, W - rad - u);
      const cy = clamp(y + (hy + 1) * h / 2, rad + u, H - rad - u);
      ctx.beginPath(); ctx.arc(cx, cy, rad, 0, 7); ctx.fillStyle = color; ctx.fill();
      ctx.lineWidth = 2 * u; ctx.strokeStyle = "#fff"; ctx.stroke();
    }
  });
}
function vedSyncControls() {
  const l = ved.layers[ved.sel];
  $("#ved-layer-tools").hidden = !l;
  if (!l) return;
  const isBlur = l.kind === "blur";
  $("#ved-blur-opts").hidden = !isBlur;
  if (isBlur) {
    document.querySelectorAll("#ved-btype button").forEach(b => b.classList.toggle("on", b.dataset.btype === l.blurType));
    $("#ved-amount").value = l.amount;
    $("#ved-amount-val").textContent = l.amount;
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
function vedAddBlur() {
  ved.layers.push({ kind: "blur", blurType: "smooth", amount: 18, x: 0.15, y: 0.43, w: 0.7, h: 0.14 });
  ved.sel = ved.layers.length - 1;
  vedSyncControls();
  drawVEditor();
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
async function openVerticalEditor(i) {
  if (!IS_ANDROID_APP) {
    toast("Download the Android app for this feature.", true);
    return;
  }
  const item = state.outputs[i];
  if (!item?.vUrl || state.busy) return;
  const v = ved.video = Object.assign(document.createElement("video"), { muted: true, playsInline: true, preload: "auto", src: item.vUrl });
  try {
    await new Promise((res, rej) => { v.onloadedmetadata = res; v.onerror = () => rej(new Error("preview")); });
    ved.index = i;
    ved.layers = [];
    ved.sel = -1;
    const slider = $("#ved-time");
    slider.min = 0; slider.max = v.duration || 1; slider.step = 0.1; slider.value = Math.min(2, (v.duration || 1) / 2);
    $("#ved-title").textContent = `Edit vertical: ${item.title}`;
    const cv = $("#ved-canvas");
    cv.width = 540; cv.height = 960;
    $("#ved-stage").style.maxWidth = "calc(50dvh * 0.5625)";
    vedRenderOverlayList();
    vedSyncControls();
    $("#veditor").hidden = false;
    $("#veditor").scrollTop = 0;
    document.body.style.overflow = "hidden";
    await vedSeek(Number(slider.value));
    drawVEditor();
  } catch { toast("Could not open this vertical clip for editing.", true); }
}
const closeVerticalEditor = () => { $("#veditor").hidden = true; ved.drag = null; document.body.style.overflow = ""; };

function vedPos(e) {
  const cv = $("#ved-canvas"), b = cv.getBoundingClientRect();
  ved.k = b.width / cv.width;
  return { x: (e.clientX - b.left) / (ved.k * cv.width), y: (e.clientY - b.top) / (ved.k * cv.height) };
}
function vedHit(p) {
  const cv = $("#ved-canvas"), W = cv.width, H = cv.height;
  const px = { x: p.x * W, y: p.y * H };
  const r0 = 24 / ved.k;
  if (ved.sel >= 0 && ved.layers[ved.sel]) {
    const l = ved.layers[ved.sel];
    const ax = l.x * W, ay = l.y * H, aw = l.w * W, ah = l.h * H;
    let best = null;
    for (const [hx, hy] of VED_HANDLES) {
      const cx = clamp(ax + (hx + 1) * aw / 2, 10, W - 10), cy = clamp(ay + (hy + 1) * ah / 2, 10, H - 10);
      const d = Math.hypot(px.x - cx, px.y - cy);
      if (d <= r0 && (!best || d < best.d)) best = { d, hx, hy };
    }
    if (best) return { idx: ved.sel, mode: "resize", hx: best.hx, hy: best.hy, ox: best.hx ? p.x - (best.hx < 0 ? l.x : l.x + l.w) : 0, oy: best.hy ? p.y - (best.hy < 0 ? l.y : l.y + l.h) : 0 };
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
  if (!hit) { ved.sel = -1; vedSyncControls(); drawVEditor(); return; }
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
  } else {
    const minW = 0.06, minH = 0.035;
    let L = l.x, T = l.y, R = l.x + l.w, B = l.y + l.h;
    if (d.hx < 0) L = clamp(p.x - d.ox, 0, R - minW); else if (d.hx > 0) R = clamp(p.x - d.ox, L + minW, 1);
    if (d.hy < 0) T = clamp(p.y - d.oy, 0, B - minH); else if (d.hy > 0) B = clamp(p.y - d.oy, T + minH, 1);
    if (l.kind === "image" && l.aspect) {
      const nw = R - L, nh = (nw * (9 / 16)) / l.aspect;
      if (T + nh <= 1) { B = T + nh; }
    }
    l.x = L; l.y = T; l.w = R - L; l.h = B - T;
  }
  drawVEditor();
});
["pointerup", "pointercancel"].forEach(t => vedCanvas.addEventListener(t, () => { ved.drag = null; }));

async function exportEditedVertical(i, layers) {
  const item = state.outputs[i];
  const mb = await getMediabunny();
  if (!mb) throw new Error("Hardware video editor is unavailable on this device.");
  const { Input, Output, Conversion, ALL_FORMATS, BlobSource, Mp4OutputFormat, BufferTarget } = mb;
  const W = 1080, H = 1920;
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
            canvas = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(W, H) : Object.assign(document.createElement("canvas"), { width: W, height: H });
            ctx = canvas.getContext("2d", { alpha: false });
            baseCv = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(W, H) : Object.assign(document.createElement("canvas"), { width: W, height: H });
            baseCtx = baseCv.getContext("2d", { alpha: false });
          }
          sample.draw(baseCtx, 0, 0, W, H);
          ctx.drawImage(baseCv, 0, 0, W, H);
          drawVerticalLayers(ctx, baseCv, W, H, layers);
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
  } finally {
    state.activeConversion = null;
    try { input.dispose?.(); } catch {}
  }
}

$("#ved-time").addEventListener("input", async e => { await vedSeek(Number(e.target.value)); drawVEditor(); });
$("#ved-add-blur").addEventListener("click", vedAddBlur);
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
$("#ved-cancel").addEventListener("click", closeVerticalEditor);
$("#ved-save").addEventListener("click", () => {
  if (!ved.layers.length) return closeVerticalEditor();
  const i = ved.index, layers = ved.layers.map(l => ({ ...l }));
  closeVerticalEditor();
  state.clipTotal = 1;
  runTask(() => exportEditedVertical(i, layers), "Rendering vertical edits...");
});
document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("#veditor").hidden) closeVerticalEditor(); });
