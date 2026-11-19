"use strict";
/* Vertical split-screen: Web uses ffmpeg.wasm; Android app uses WebCodecs hardware rendering (1080x1920) with FFmpeg fallback. */
/* ---------- Optional step after cutting: vertical split-screen ---------- */
const ASPECT = 9 / 8; // each half of the output is 9:8, so two stacked halves make a 9:16 video
const clone = o => JSON.parse(JSON.stringify(o));
function defaultFrame() {
  const vw = state.vw || 16, vh = state.vh || 9;
  const h = 0.86, w = Math.min(0.47, h * ASPECT * vh / vw);
  return { fit: false, a: { x: 0.03, y: 0.07, w, h }, b: { x: Math.max(0, 0.97 - w), y: 0.07, w, h } };
}
function verticalFilter(f) {
  const W = 1080, H = 960; // each half is 1080x960 -> stacked to 1080x1920
  const half = (r, tag) => {
    const iw = `iw*${r.w.toFixed(4)}`, ih = `ih*${r.h.toFixed(4)}`, ix = `iw*${r.x.toFixed(4)}`, iy = `ih*${r.y.toFixed(4)}`;
    const crop = `crop=w='max(2,${iw})':h='max(2,${ih})':x='${ix}':y='${iy}'`;
    if (f.fit) return `[0:v]${crop},scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:black,setsar=1[${tag}]`;
    return `[0:v]${crop},scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1[${tag}]`;
  };
  return `${half(f.a, "t")};${half(f.b, "b")};[t][b]vstack=inputs=2[v]`;
}
async function runTask(fn, message) {
  if (state.busy) return;
  state.cancelled = false;
  state.abort = new AbortController();
  state.cancelPromise = new Promise((_, reject) => { state.rejectCancel = () => reject(new Error("Cancelled")); });
  state.cancelPromise.catch(() => {});
  showBusy(true, message);
  await keepAwake(true);
  try { await fn(); toast("Vertical clips ready."); $("#status").textContent = "Vertical clips ready."; }
  catch (error) {
    if (state.cancelled) { toast("Cancelled."); $("#status").textContent = "Vertical conversion cancelled."; }
    else { console.error(error); toast(error.message || String(error), true); $("#status").textContent = "Vertical conversion failed."; }
  } finally {
    state.progressMessage = ""; state.clipTotal = 0; setBar(0);
    await keepAwake(false);
    showBusy(false);
  }
}
async function makeVerticalWebCodecs(item, frame, onProgress) {
  const mb = await getMediabunny();
  if (!mb || state.cancelled) return null;
  const { Input, Output, Conversion, ALL_FORMATS, BlobSource, Mp4OutputFormat, BufferTarget } = mb;
  const W = 1080, H = 960;
  const layers = item.vLayers?.length ? await preloadLayerImages(item.vLayers) : [];
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(item.blob) });
  const output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() });
  let ctx = null, baseCv = null, baseCtx = null, boxes = null;
  try {
    const conversion = await Conversion.init({
      input,
      output,
      video: {
        codec: "avc",
        bitrate: 5_000_000,
        hardwareAcceleration: "prefer-hardware",
        processedWidth: W,
        processedHeight: H * 2,
        process: (sample) => {
          if (!ctx) {
            const sw = sample.displayWidth, sh = sample.displayHeight;
            const px = r => ({ x: r.x * sw, y: r.y * sh, w: r.w * sw, h: r.h * sh });
            boxes = [
              { m: mapBox(px(frame.a), W, H, frame.fit), yOff: 0 },
              { m: mapBox(px(frame.b), W, H, frame.fit), yOff: H },
            ];
            const canvas = typeof OffscreenCanvas !== "undefined"
              ? new OffscreenCanvas(W, H * 2)
              : Object.assign(document.createElement("canvas"), { width: W, height: H * 2 });
            ctx = canvas.getContext("2d", { alpha: false });
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = "medium";
            if (layers.length) {
              baseCv = typeof OffscreenCanvas !== "undefined"
                ? new OffscreenCanvas(W, H * 2)
                : Object.assign(document.createElement("canvas"), { width: W, height: H * 2 });
              baseCtx = baseCv.getContext("2d", { alpha: false });
              baseCtx.imageSmoothingEnabled = true;
              baseCtx.imageSmoothingQuality = "medium";
            }
          }
          const targetCtx = baseCtx || ctx;
          if (frame.fit) { targetCtx.fillStyle = "#000"; targetCtx.fillRect(0, 0, W, H * 2); }
          for (const { m, yOff } of boxes) {
            sample.draw(targetCtx, m.sx, m.sy, m.sw, m.sh, m.dx, yOff + m.dy, m.dw, m.dh);
          }
          if (layers.length) {
            ctx.drawImage(baseCv, 0, 0, W, H * 2);
            drawVerticalLayers(ctx, baseCv, W, H * 2, layers);
          }
          return ctx.canvas;
        },
      },
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
  item.vFrame = clone(frame);
  let vBlob = IS_ANDROID_APP
    ? await Promise.race([makeVerticalWebCodecs(item, frame, onProgress), state.cancelPromise])
    : null;
  if (!vBlob) {
    const engine = ff || await Promise.race([getFFmpeg(), state.cancelPromise]);
    showBusy(true, state.progressMessage);
    const tmpIn = `vin_${i}.mp4`, tmpOut = `vout_${i}.mp4`;
    await engine.writeFile(tmpIn, new Uint8Array(await item.blob.arrayBuffer()));
    const code = await Promise.race([engine.exec([
      "-i", tmpIn, "-filter_complex", verticalFilter(frame), "-map", "[v]", "-map", "0:a?",
      "-c:v", "libx264", "-preset", "ultrafast", "-crf", "23", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", tmpOut
    ]), state.cancelPromise]);
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
}
async function makeVerticalBatch(indices, frame) {
  state.lastFrame = clone(frame);
  state.clipTotal = indices.length;
  for (let n = 0; n < indices.length; n++) {
    state.clipIndex = n;
    state.progressMessage = `Making clip ${indices[n] + 1} vertical (${n + 1} of ${indices.length})...`;
    $("#status").textContent = state.progressMessage;
    showBusy(true, state.progressMessage); setBar(n / indices.length);
    await makeVertical(state.ffmpeg, indices[n], frame, p => setBar((n + p) / indices.length));
  }
  setBar(1);
}
