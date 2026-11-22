"use strict";
/* Vertical split-screen (1-4 cropping boxes + flexible layouts + 2.5D Debate Stage + 3D Phone Animator): Web uses WebCodecs/ffmpeg.wasm; Android app uses WebCodecs hardware rendering (1080x1920) with FFmpeg fallback. */
const ASPECT = 9 / 8;
const clone = o => JSON.parse(JSON.stringify(o));
const LAYOUT_PRESETS = {
  1: [
    { id: "full", label: "Full", slots: [{ x: 0, y: 0, w: 1, h: 1 }] },
  ],
  2: [
    { id: "stack", label: "2 Rows", slots: [{ x: 0, y: 0, w: 1, h: 0.5 }, { x: 0, y: 0.5, w: 1, h: 0.5 }] },
    { id: "cols", label: "2 Cols", slots: [{ x: 0, y: 0, w: 0.5, h: 1 }, { x: 0.5, y: 0, w: 0.5, h: 1 }] },
  ],
  3: [
    { id: "stack", label: "3 Rows", slots: [{ x: 0, y: 0, w: 1, h: 1 / 3 }, { x: 0, y: 1 / 3, w: 1, h: 1 / 3 }, { x: 0, y: 2 / 3, w: 1, h: 1 / 3 }] },
    { id: "top2", label: "2 Top + 1", slots: [{ x: 0, y: 0, w: 0.5, h: 0.5 }, { x: 0.5, y: 0, w: 0.5, h: 0.5 }, { x: 0, y: 0.5, w: 1, h: 0.5 }] },
    { id: "bot2", label: "1 + 2 Bot", slots: [{ x: 0, y: 0, w: 1, h: 0.5 }, { x: 0, y: 0.5, w: 0.5, h: 0.5 }, { x: 0.5, y: 0.5, w: 0.5, h: 0.5 }] },
    { id: "cols", label: "3 Cols", slots: [{ x: 0, y: 0, w: 1 / 3, h: 1 }, { x: 1 / 3, y: 0, w: 1 / 3, h: 1 }, { x: 2 / 3, y: 0, w: 1 / 3, h: 1 }] },
  ],
  4: [
    { id: "grid", label: "2×2 Grid", slots: [{ x: 0, y: 0, w: 0.5, h: 0.5 }, { x: 0.5, y: 0, w: 0.5, h: 0.5 }, { x: 0, y: 0.5, w: 0.5, h: 0.5 }, { x: 0.5, y: 0.5, w: 0.5, h: 0.5 }] },
    { id: "stack", label: "4 Rows", slots: [{ x: 0, y: 0, w: 1, h: 0.25 }, { x: 0, y: 0.25, w: 1, h: 0.25 }, { x: 0, y: 0.5, w: 1, h: 0.25 }, { x: 0, y: 0.75, w: 1, h: 0.25 }] },
    { id: "top3", label: "3 Top + 1", slots: [{ x: 0, y: 0, w: 1 / 3, h: 0.5 }, { x: 1 / 3, y: 0, w: 1 / 3, h: 0.5 }, { x: 2 / 3, y: 0, w: 1 / 3, h: 0.5 }, { x: 0, y: 0.5, w: 1, h: 0.5 }] },
    { id: "bot3", label: "1 + 3 Bot", slots: [{ x: 0, y: 0, w: 1, h: 0.5 }, { x: 0, y: 0.5, w: 1 / 3, h: 0.5 }, { x: 1 / 3, y: 0.5, w: 1 / 3, h: 0.5 }, { x: 2 / 3, y: 0.5, w: 1 / 3, h: 0.5 }] },
  ],
};
function getLayoutPresets(count) {
  return LAYOUT_PRESETS[count] || LAYOUT_PRESETS[2];
}
function getLayoutSlots(count, layoutId) {
  const presets = getLayoutPresets(count);
  return (presets.find(p => p.id === layoutId) || presets[0]).slots;
}
function getFrameSlots(frame) {
  const boxes = getFrameBoxes(frame);
  const base = getLayoutSlots(boxes.length, frame?.layout);
  return base.map((s, idx) => {
    const b = boxes[idx] || {};
    const ox = Number(b.ox) || 0, oy = Number(b.oy) || 0;
    return {
      x: Math.min(Math.max(s.x + ox, -0.5), 1.5 - s.w),
      y: Math.min(Math.max(s.y + oy, -0.5), 1.5 - s.h),
      w: s.w,
      h: s.h,
    };
  });
}
/* Optional red divider line at the junction(s) of the split screen. frame.divider (bool) turns it on; frame.dividerSize is the thickness in px on a 1080-wide video. */
const DIVIDER_COLOR = "#e11d2e";
function dividerThickness(f) { return Math.min(16, Math.max(2, Math.round(Number(f?.dividerSize) || 6))); }
/* Lines between neighbouring slots, as normalized segments { x1, y1, x2, y2 } in 0..1 video space. */
function getDividerSegments(count, layoutId) {
  if (count < 2) return [];
  const slots = getLayoutSlots(count, layoutId), seen = new Set(), out = [], e = 0.002, r = n => Math.round(n * 1000) / 1000;
  const add = (x1, y1, x2, y2) => { const k = [x1, y1, x2, y2].map(r).join("_"); if (!seen.has(k)) { seen.add(k); out.push({ x1, y1, x2, y2 }); } };
  for (const s of slots) {
    if (s.x + s.w < 1 - e) add(s.x + s.w, s.y, s.x + s.w, s.y + s.h);
    if (s.y + s.h < 1 - e) add(s.x, s.y + s.h, s.x + s.w, s.y + s.h);
  }
  return out;
}
function drawDividerLines(ctx, W, H, frame) {
  if (!frame?.divider) return;
  const segs = getDividerSegments(getFrameBoxes(frame).length, frame.layout);
  if (!segs.length) return;
  const t = Math.max(1, Math.round(dividerThickness(frame) * W / 1080));
  ctx.save();
  ctx.fillStyle = DIVIDER_COLOR;
  for (const g of segs) {
    if (g.y1 === g.y2) ctx.fillRect(Math.round(g.x1 * W), Math.round(g.y1 * H - t / 2), Math.round((g.x2 - g.x1) * W), t);
    else ctx.fillRect(Math.round(g.x1 * W - t / 2), Math.round(g.y1 * H), t, Math.round((g.y2 - g.y1) * H));
  }
  ctx.restore();
}
function getFrameBoxes(f) {
  if (Array.isArray(f?.boxes) && f.boxes.length) return f.boxes;
  if (f?.a && f?.b) return [f.a, f.b];
  return defaultFrame().boxes;
}
function defaultBoxAt(idx, count) {
  const vw = state.vw || 16, vh = state.vh || 9;
  const stripAspect = 1080 / (1920 / count);
  const h = count === 1 ? 0.88 : 0.86;
  const w = Math.min(0.47, h * stripAspect * vh / vw);
  const xs = count === 1 ? [Math.max(0, (1 - w) / 2)] : [0.03, Math.max(0, 0.97 - w), 0.25, Math.max(0, 0.75 - w)];
  return { x: xs[idx % xs.length], y: 0.07, w, h };
}
function defaultFrame(count = 2) {
  const vw = state.vw || 16, vh = state.vh || 9;
  const h = 0.86, w = Math.min(0.47, h * ASPECT * vh / vw);
  const stage = typeof defaultStageConfig === "function" ? defaultStageConfig() : { enabled: false };
  if (count === 2) {
    return { fit: false, layout: "stack", boxes: [{ x: 0.03, y: 0.07, w, h }, { x: Math.max(0, 0.97 - w), y: 0.07, w, h }], stage };
  }
  return { fit: false, layout: getLayoutPresets(count)[0].id, boxes: Array.from({ length: count }, (_, idx) => defaultBoxAt(idx, count)), stage };
}
function verticalFilter(f) {
  const boxes = getFrameBoxes(f), slots = getFrameSlots(f), W = 1080, TOTAL_H = 1920;
  const even = n => Math.max(2, Math.round(n / 2) * 2);
  const parts = boxes.map((r, idx) => {
    const slot = slots[idx], sw = even(slot.w * W), sh = even(slot.h * TOTAL_H), tag = `b${idx}`;
    const iw = `iw*${r.w.toFixed(4)}`, ih = `ih*${r.h.toFixed(4)}`, ix = `iw*${r.x.toFixed(4)}`, iy = `ih*${r.y.toFixed(4)}`;
    const crop = `crop=w='max(2,${iw})':h='max(2,${ih})':x='${ix}':y='${iy}'`;
    if (f.fit) return `[0:v]${crop},scale=${sw}:${sh}:force_original_aspect_ratio=decrease,pad=${sw}:${sh}:(ow-iw)/2:(oh-ih)/2:black,setsar=1[${tag}]`;
    return `[0:v]${crop},scale=${sw}:${sh}:force_original_aspect_ratio=increase,crop=${sw}:${sh},setsar=1[${tag}]`;
  });
  if (boxes.length === 1) return parts[0].replace("[b0]", "[v]");
  const inputs = boxes.map((_, idx) => `[b${idx}]`).join("");
  const layout = slots.map(s => `${Math.max(0, even(s.x * W))}_${Math.max(0, even(s.y * TOTAL_H))}`).join("|");
  const stack = `${parts.join(";")};${inputs}xstack=inputs=${boxes.length}:layout=${layout}`;
  if (!f.divider) return `${stack}[v]`;
  const t = even(dividerThickness(f)), segs = getDividerSegments(boxes.length, f.layout);
  const draws = segs.map(g => g.y1 === g.y2
    ? `drawbox=x=${Math.round(g.x1 * W)}:y=${Math.max(0, Math.round(g.y1 * TOTAL_H - t / 2))}:w=${Math.round((g.x2 - g.x1) * W)}:h=${t}:color=0xe11d2e:t=fill`
    : `drawbox=x=${Math.max(0, Math.round(g.x1 * W - t / 2))}:y=${Math.round(g.y1 * TOTAL_H)}:w=${t}:h=${Math.round((g.y2 - g.y1) * TOTAL_H)}:color=0xe11d2e:t=fill`);
  return draws.length ? `${stack}[vs];[vs]${draws.join(",")}[v]` : `${stack}[v]`;
}
async function runTask(fn, message) {
  if (state.busy) return;
  state.cancelled = false;
  state.cancelPromise = new Promise((_, reject) => { state.rejectCancel = () => reject(new Error("Cancelled")); });
  state.cancelPromise.catch(() => {});
  showBusy(true, message);
  await keepAwake(true);
  try { await fn(); toast("Vertical clips ready."); }
  catch (error) {
    if (state.cancelled) toast("Cancelled.");
    else { console.error(error); toast(error.message || String(error), true); }
  } finally {
    state.progressMessage = ""; state.clipTotal = 0; setBar(0);
    await keepAwake(false);
    showBusy(false);
  }
}
async function makeVerticalWebCodecs(item, frame, onProgress, preEnv = null, animCfg = null) {
  const mb = await getMediabunny();
  if (!mb || state.cancelled) return null;
  const { Input, Output, Conversion, ALL_FORMATS, BlobSource, Mp4OutputFormat, BufferTarget } = mb;
  const W = 1080, TOTAL_H = 1920, FPS = 30;
  const frameBoxes = getFrameBoxes(frame);
  const slots = getFrameSlots(frame);
  const layers = item.vLayers?.length ? await preloadLayerImages(item.vLayers) : [];
  const stageEnabled = !!(frame.stage?.enabled && typeof drawStageComposition === "function");
  const animEnabled = !!(animCfg?.enabled && typeof animatorRenderAt === "function");
  const audioEnv = preEnv || (stageEnabled && frame.stage.activeGlow
    ? await extractAudioEnvelope(item.blob, FPS)
    : null);
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(item.blob) });
  let clipDuration = Math.max(1, (Number(item.end) - Number(item.start) || 10) + 2 * PAD);
  if (animEnabled) {
    try { const d = await input.computeDuration(); if (Number.isFinite(d) && d > 0) clipDuration = d; } catch {}
  }
  const output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() });
  let ctx = null, baseCv = null, baseCtx = null, animSrcCv = null, animSrcCtx = null, boxes = null, sw = 0, sh = 0, frameCount = 0;
  try {
    const conversion = await Conversion.init({
      input,
      output,
      video: {
        codec: "avc",
        bitrate: 5_000_000,
        hardwareAcceleration: "prefer-hardware",
        processedWidth: W,
        processedHeight: TOTAL_H,
        process: (sample) => {
          if (!ctx) {
            sw = sample.displayWidth; sh = sample.displayHeight;
            const px = r => ({ x: r.x * sw, y: r.y * sh, w: r.w * sw, h: r.h * sh });
            boxes = frameBoxes.map((box, idx) => {
              const s = slots[idx];
              const dx = Math.round(s.x * W), dy = Math.round(s.y * TOTAL_H);
              const dw = Math.round(s.w * W), dh = Math.round(s.h * TOTAL_H);
              return { m: mapBox(px(box), dw, dh, frame.fit), xOff: dx, yOff: dy };
            });
            const canvas = typeof OffscreenCanvas !== "undefined"
              ? new OffscreenCanvas(W, TOTAL_H)
              : Object.assign(document.createElement("canvas"), { width: W, height: TOTAL_H });
            ctx = canvas.getContext("2d", { alpha: false });
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = "medium";
            if (layers.length) {
              baseCv = typeof OffscreenCanvas !== "undefined"
                ? new OffscreenCanvas(W, TOTAL_H)
                : Object.assign(document.createElement("canvas"), { width: W, height: TOTAL_H });
              baseCtx = baseCv.getContext("2d", { alpha: false });
              baseCtx.imageSmoothingEnabled = true;
              baseCtx.imageSmoothingQuality = "medium";
            }
            if (animEnabled) {
              animSrcCv = Object.assign(document.createElement("canvas"), { width: W, height: TOTAL_H });
              animSrcCtx = animSrcCv.getContext("2d", { alpha: false });
              animSrcCtx.imageSmoothingEnabled = true;
              animSrcCtx.imageSmoothingQuality = "medium";
            }
          }
          const ts = typeof sample.timestamp === "number" ? sample.timestamp : frameCount / FPS;
          const compCtx = animEnabled ? animSrcCtx : ctx;
          const targetCtx = baseCtx || compCtx;
          if (stageEnabled) {
            const envIdx = audioEnv ? Math.min(audioEnv.length - 1, Math.max(0, Math.floor(ts * FPS))) : 0;
            const energy = audioEnv ? audioEnv[envIdx] : (0.28 + 0.2 * Math.abs(Math.sin(ts * 4)));
            drawStageComposition(targetCtx, sample, sw, sh, frameBoxes, frame, W, TOTAL_H, {
              energy,
              timestamp: ts,
            });
          } else {
            targetCtx.fillStyle = "#000"; targetCtx.fillRect(0, 0, W, TOTAL_H);
            for (const { m, xOff, yOff } of boxes) {
              sample.draw(targetCtx, m.sx, m.sy, m.sw, m.sh, xOff + m.dx, yOff + m.dy, m.dw, m.dh);
            }
            drawDividerLines(targetCtx, W, TOTAL_H, frame);
          }
          if (layers.length) {
            compCtx.drawImage(baseCv, 0, 0, W, TOTAL_H);
            drawVerticalLayers(compCtx, baseCv, W, TOTAL_H, layers);
          }
          if (animEnabled) {
            animatorRenderAt(ts, ctx, animSrcCv, animCfg, W, TOTAL_H, clipDuration);
          }
          frameCount++;
          return ctx.canvas;
        },
      },
      audio: { codec: "aac" },
    });
    if (!conversion.isValid) return null;
    if (onProgress) conversion.onProgress = onProgress;
    state.activeConversion = conversion;
    await conversion.execute();
    return new Blob([output.target.buffer], { type: "video/mp4" });
  } catch (error) {
    if (state.cancelled) throw error;
    console.warn("WebCodecs vertical unavailable, falling back to FFmpeg:", error);
    return null;
  } finally {
    state.activeConversion = null;
    try { input.dispose?.(); } catch {}
  }
}
async function makeVertical(ff, i, frame, onProgress) {
  const item = state.outputs[i];
  const clipFrame = clone(frame);
  item.vFrame = clone(clipFrame);
  const _allPrefs = typeof loadClipperPrefs === "function" ? loadClipperPrefs() : { anim: { enabled: false } };
  const animCfg = clone(item.vAnim || _allPrefs.anim || { enabled: false });
  const useWebCodecs = IS_ANDROID_APP || !!clipFrame.stage?.enabled || !!animCfg.enabled;
  let vBlob = useWebCodecs
    ? await Promise.race([makeVerticalWebCodecs(item, clipFrame, onProgress, null, animCfg), state.cancelPromise])
    : null;
  if (!vBlob) {
    const engine = ff || await Promise.race([getFFmpeg(), state.cancelPromise]);
    showBusy(true, state.progressMessage);
    const tmpIn = `vin_${i}.mp4`, tmpOut = `vout_${i}.mp4`;
    await engine.writeFile(tmpIn, new Uint8Array(await item.blob.arrayBuffer()));
    const fc = verticalFilter(clipFrame);
    const args = ["-i", tmpIn, "-filter_complex", fc, "-map", "[v]", "-map", "0:a?"];
    args.push("-c:v", "libx264", "-preset", "ultrafast", "-crf", "23", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", tmpOut);
    const code = await Promise.race([engine.exec(args), state.cancelPromise]);
    if (code !== 0) throw new Error(`Could not make clip ${i + 1} vertical.`);
    const bytes = await engine.readFile(tmpOut);
    try { await engine.deleteFile(tmpIn); await engine.deleteFile(tmpOut); } catch {}
    vBlob = new Blob([bytes], { type: "video/mp4" });
  }
  if (item.vUrl) URL.revokeObjectURL(item.vUrl);
  item.vBlob = vBlob;
  item.vUrl = URL.createObjectURL(item.vBlob);
  item.vName = item.name.replace(/\.mp4$/, "") + "-vertical.mp4";
  const box = $(`#vbox-${i}`);
  box.hidden = false;
  box.innerHTML = `<div class="caption-label">Vertical version</div><video class="vertical" controls playsinline preload="metadata" src="${item.vUrl}"></video><div class="clip-actions"><a class="btn primary" href="${item.vUrl}" download="${escapeHTML(item.vName)}">Download vertical MP4</a></div>`;
  const btn = document.querySelector(`button[data-vert="${i}"]`);
  if (btn) btn.textContent = "Redo vertical";
  updateResultsHeader();
  if (typeof syncHistory === "function") await syncHistory(true);
}
async function makeVerticalBatch(indices, frame) {
  state.lastFrame = clone(frame);
  state.clipTotal = indices.length;
  for (let n = 0; n < indices.length; n++) {
    state.clipIndex = n;
    state.progressMessage = `Making clip ${indices[n] + 1} vertical (${n + 1} of ${indices.length})...`;
    showBusy(true, state.progressMessage); setBar(n / indices.length);
    await makeVertical(state.ffmpeg, indices[n], frame, p => setBar((n + p) / indices.length));
  }
  setBar(1);
}
