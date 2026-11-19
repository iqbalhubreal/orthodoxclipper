"use strict";
/* Pre-vertical editor: add blur rectangles (type + intensity) and image overlays (presets + saved), drag/resize with bottom-right dot, apply to all/selected clips. */
const ved = { index: 0, layers: [], sel: -1, drag: null, k: 1, video: null, baseCv: null, pixCv: null, frame: null, returnToEditor: false };
const VED_HANDLE = [1, 1];

function cloneLayers(layers) {
  return (layers || []).map(l => {
    const copy = { kind: l.kind, x: l.x, y: l.y, w: l.w, h: l.h };
    if (l.kind === "blur") { copy.blurType = l.blurType; copy.amount = l.amount; }
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
function refreshClipVEditLabel(idx) {
  const btn = document.querySelector(`button[data-vedit="${idx}"]`);
  const n = state.outputs[idx]?.vLayers?.length || 0;
  if (btn) btn.textContent = n ? `Blur & Overlays (${n})` : "Blur & Overlays";
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
  const bctx = ved.baseCv.getContext("2d");
  if (ved.frame && v.videoWidth && v.videoHeight) {
    const sw = v.videoWidth, sh = v.videoHeight, half = H / 2;
    const px = r => ({ x: r.x * sw, y: r.y * sh, w: r.w * sw, h: r.h * sh });
    if (ved.frame.fit) { bctx.fillStyle = "#000"; bctx.fillRect(0, 0, W, H); }
    [[ved.frame.a, 0], [ved.frame.b, half]].forEach(([box, dy]) => {
      const m = mapBox(px(box), W, half, ved.frame.fit);
      bctx.drawImage(v, m.sx, m.sy, m.sw, m.sh, m.dx, dy + m.dy, m.dw, m.dh);
    });
  } else {
    bctx.drawImage(v, 0, 0, W, H);
  }
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
    const rad = 9 * u;
    const cx = clamp(x + w, rad + u, W - rad - u);
    const cy = clamp(y + h, rad + u, H - rad - u);
    ctx.beginPath(); ctx.arc(cx, cy, rad, 0, 7); ctx.fillStyle = color; ctx.fill();
    ctx.lineWidth = 2 * u; ctx.strokeStyle = "#fff"; ctx.stroke();
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
function vedCheckedIndices() {
  return [...document.querySelectorAll('#ved-clips input[type="checkbox"]:checked')].map(el => Number(el.value));
}
function vedSyncClipsBtn() {
  const n = vedCheckedIndices().length;
  $("#ved-save").disabled = n === 0;
  $("#ved-render").disabled = n === 0;
  $("#ved-save").textContent = n <= 1 ? "Save edits" : `Save to ${n} clips`;
  $("#ved-render").textContent = n <= 1 ? "Save & make vertical" : `Make ${n} clips vertical`;
}
function vedRenderClips(activeIndex) {
  $("#ved-clips").innerHTML = state.outputs.map((item, idx) =>
    `<label class="ed-clip-opt"><input type="checkbox" value="${idx}"${idx === activeIndex ? " checked" : ""}><span>${idx + 1}. ${escapeHTML(item.title)}</span></label>`
  ).join("");
  vedSyncClipsBtn();
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
async function openVerticalEditor(i, opts = {}) {
  if (!IS_ANDROID_APP) {
    toast("Download the Android app for this feature.", true);
    $("#status").textContent = "Download the Android app to use the Vertical Maker.";
    $("#app-note")?.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  const item = state.outputs[i];
  if (!item?.url || state.busy) return;
  const v = ved.video = Object.assign(document.createElement("video"), { muted: true, playsInline: true, preload: "auto", src: item.url });
  try {
    await new Promise((res, rej) => { v.onloadedmetadata = res; v.onerror = () => rej(new Error("preview")); });
    ved.index = i;
    ved.frame = clone(opts.frame || item.vFrame || state.lastFrame || defaultFrame());
    ved.returnToEditor = !!opts.returnToEditor;
    ved.layers = await preloadLayerImages(cloneLayers(item.vLayers));
    ved.sel = ved.layers.length ? 0 : -1;
    const slider = $("#ved-time");
    slider.min = 0; slider.max = v.duration || 1; slider.step = 0.1; slider.value = Math.min(PAD, (v.duration || 1) / 2);
    $("#ved-title").textContent = `Blur & Overlays: ${item.title}`;
    const cv = $("#ved-canvas");
    cv.width = 540; cv.height = 960;
    $("#ved-stage").style.maxWidth = "calc(50dvh * 0.5625)";
    vedRenderOverlayList();
    vedRenderClips(i);
    vedSyncControls();
    $("#veditor").hidden = false;
    $("#veditor").scrollTop = 0;
    document.body.style.overflow = "hidden";
    await vedSeek(Number(slider.value));
    drawVEditor();
  } catch { toast("Could not open this clip for editing.", true); }
}
function closeVerticalEditor(reopenFraming = false) {
  $("#veditor").hidden = true;
  ved.drag = null;
  document.body.style.overflow = "";
  const back = reopenFraming && ved.returnToEditor;
  const idx = ved.index;
  ved.returnToEditor = false;
  if (back) openEditor(idx);
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
    const ax = l.x * W, ay = l.y * H, aw = l.w * W, ah = l.h * H;
    const cx = clamp(ax + aw, 10, W - 10), cy = clamp(ay + ah, 10, H - 10);
    if (Math.hypot(px.x - cx, px.y - cy) <= r0) {
      return { idx: ved.sel, mode: "resize", hx: VED_HANDLE[0], hy: VED_HANDLE[1], ox: p.x - (l.x + l.w), oy: p.y - (l.y + l.h) };
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
    let L = l.x, T = l.y;
    let R = clamp(p.x - d.ox, L + minW, 1);
    let B = clamp(p.y - d.oy, T + minH, 1);
    if (l.kind === "image" && l.aspect) {
      let nw = R - L;
      let nh = (nw * (9 / 16)) / l.aspect;
      if (T + nh > 1) {
        nh = 1 - T;
        nw = (nh * l.aspect) / (9 / 16);
        R = L + nw;
      }
      B = T + nh;
    }
    l.w = R - L; l.h = B - T;
  }
  drawVEditor();
});
["pointerup", "pointercancel"].forEach(t => vedCanvas.addEventListener(t, () => { ved.drag = null; }));

function applyLayersToIndices(indices, layers) {
  const clean = cloneLayers(layers);
  indices.forEach(idx => {
    const item = state.outputs[idx];
    if (!item) return;
    item.vLayers = cloneLayers(clean);
    refreshClipVEditLabel(idx);
  });
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
$("#ved-clips").addEventListener("change", vedSyncClipsBtn);
$("#ved-pick-all").addEventListener("click", () => {
  const boxes = [...document.querySelectorAll('#ved-clips input[type="checkbox"]')];
  const allOn = boxes.every(b => b.checked);
  boxes.forEach(b => { b.checked = !allOn; });
  vedSyncClipsBtn();
});
$("#ved-apply-all").addEventListener("click", () => {
  const all = state.outputs.map((_, idx) => idx);
  applyLayersToIndices(all, ved.layers);
  document.querySelectorAll('#ved-clips input[type="checkbox"]').forEach(b => { b.checked = true; });
  vedSyncClipsBtn();
  toast(`Applied edits to all ${all.length} clips.`);
});
$("#ved-cancel").addEventListener("click", () => closeVerticalEditor(true));
$("#ved-save").addEventListener("click", () => {
  const list = vedCheckedIndices();
  if (!list.length) return;
  applyLayersToIndices(list, ved.layers);
  toast(`Saved edits to ${list.length} clip${list.length === 1 ? "" : "s"}.`);
  closeVerticalEditor(true);
});
$("#ved-render").addEventListener("click", () => {
  const list = vedCheckedIndices();
  if (!list.length) return;
  applyLayersToIndices(list, ved.layers);
  const frame = clone(ved.frame);
  closeVerticalEditor(false);
  runTask(() => makeVerticalBatch(list, frame), "Preparing...");
});
document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("#veditor").hidden) closeVerticalEditor(true); });
