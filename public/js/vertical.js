"use strict";
/* Vertical split-screen: box data, WebCodecs hardware rendering, and FFmpeg fallback. */
/* ---------- Optional step after cutting: vertical split-screen ---------- */
const ASPECT = 9 / 8; // each half of the output is 9:8, so two stacked halves make a 9:16 video
const clone = o => JSON.parse(JSON.stringify(o));
/* A box is { x, y, w, h } as fractions of the video size; frame = { a: top, b: bottom, fit: bool }. Width and height are independent. */
function defaultFrame() {
  const { vw, vh } = state;
  const w = Math.min(vw / 2, vh * ASPECT), h = w / ASPECT;
  const y = (vh - h) / 2, xa = (vw / 2 - w) / 2, xb = vw / 2 + xa;
  return { a: { x: xa / vw, y: y / vh, w: w / vw, h: h / vh }, b: { x: xb / vw, y: y / vh, w: w / vw, h: h / vh }, fit: false };
}
function verticalFilter(fr) {
  const { vw, vh } = state, W = IS_MOBILE ? 720 : 1080, H = W * 8 / 9;
  const evenSize = n => Math.max(2, Math.floor(n / 2) * 2), evenPos = n => Math.max(0, Math.floor(n / 2) * 2);
  const box = r => {
    const w = Math.min(evenSize(r.w * vw), evenSize(vw)), h = Math.min(evenSize(r.h * vh), evenSize(vh));
    const x = evenPos(Math.min(r.x * vw, vw - w)), y = evenPos(Math.min(r.y * vh, vh - h));
    const fitStep = fr.fit
      ? `scale=${W}:${H}:force_original_aspect_ratio=decrease:flags=bicubic,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:black`
      : `scale=${W}:${H}:force_original_aspect_ratio=increase:flags=bicubic,crop=${W}:${H}`;
    return `crop=${w}:${h}:${x}:${y},${fitStep},setsar=1`;
  };
  return `[0:v]split=2[a][b];[a]${box(fr.a)}[t];[b]${box(fr.b)}[u];[t][u]vstack=inputs=2[v]`;
}
/* Runs a cancellable background task behind the busy overlay. */
async function runTask(fn, message) {
  if (state.busy) return;
  state.cancelled = false;
  state.abort = new AbortController();
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
async function makeVerticalWebCodecs(item, frame, onProgress) {
  const mb = await getMediabunny();
  if (!mb || state.cancelled) return null;
  const { Input, Output, Conversion, ALL_FORMATS, BlobSource, Mp4OutputFormat, BufferTarget } = mb;
  const W = IS_MOBILE ? 720 : 1080, H = W * 8 / 9;
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(item.blob) });
  const output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() });
  let ctx = null, boxes = null;
  try {
    const conversion = await Conversion.init({
      input,
      output,
      video: {
        codec: "avc",
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
          }
          if (frame.fit) { ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H * 2); }
          for (const { m, yOff } of boxes) {
            sample.draw(ctx, m.sx, m.sy, m.sw, m.sh, m.dx, yOff + m.dy, m.dw, m.dh);
          }
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
  let vBlob = await Promise.race([makeVerticalWebCodecs(item, frame, onProgress), state.cancelPromise]);
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
