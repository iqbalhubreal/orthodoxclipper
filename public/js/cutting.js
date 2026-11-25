"use strict";
/* Cutting clips: Web uses ffmpeg.wasm; Android app uses WebCodecs hardware acceleration (with FFmpeg fallback). */
let nativeCutSeq = 0;
const nativeCutPending = new Map();
window.__nativeCutDone = (id, ok, value) => {
  const p = nativeCutPending.get(id);
  if (!p) return;
  nativeCutPending.delete(id);
  if (ok) p.resolve(value);
  else p.reject(new Error(value || "Native cut failed"));
};
async function cutWithAndroidNative(cutStart, cutEnd, outputName) {
  if (!window.AndroidClipper?.cutFast) return null;
  const id = `cut_${++nativeCutSeq}`;
  const fileName = await new Promise((resolve, reject) => {
    nativeCutPending.set(id, { resolve, reject });
    window.AndroidClipper.cutFast(id, cutStart, Number.isFinite(cutEnd) ? cutEnd : -1, outputName);
  });
  const res = await fetch(`/__native_clip__/${encodeURIComponent(fileName)}`, { cache: "no-store" });
  if (!res.ok) throw new Error("Could not read native clip");
  return await res.blob();
}
function syncCutCompressUI() {
  const c = (typeof loadClipperPrefs === "function" ? loadClipperPrefs().cutCompress : null) || { enabled: false, targetHeight: 720, videoBitrate: 2000000, useHevc: true };
  if ($("#cut-compress-on")) $("#cut-compress-on").checked = !!c.enabled;
  if ($("#cut-compress-height")) $("#cut-compress-height").value = String(c.targetHeight || 720);
  if ($("#cut-compress-bitrate")) $("#cut-compress-bitrate").value = String(c.videoBitrate || 2000000);
  if ($("#cut-compress-hevc")) $("#cut-compress-hevc").checked = c.useHevc !== false;
  const optsEl = $("#cut-compress-opts"), sumEl = $("#cut-compress-summary");
  if (optsEl) { optsEl.hidden = !c.enabled; optsEl.style.display = c.enabled ? "grid" : "none"; }
  if (sumEl) {
    sumEl.textContent = c.enabled
      ? `${c.targetHeight || 720}p · ${Math.round((c.videoBitrate || 2000000) / 1000000)} Mbps · ${c.useHevc !== false ? "H.265" : "H.264"}`
      : "Off";
  }
}
function saveCutCompressUI() {
  const patch = {
    enabled: !!$("#cut-compress-on")?.checked,
    targetHeight: Number($("#cut-compress-height")?.value) || 720,
    videoBitrate: Number($("#cut-compress-bitrate")?.value) || 2000000,
    useHevc: $("#cut-compress-hevc")?.checked !== false,
  };
  if (typeof saveClipperPrefs === "function") saveClipperPrefs({ cutCompress: patch });
  syncCutCompressUI();
}
["#cut-compress-on", "#cut-compress-height", "#cut-compress-bitrate", "#cut-compress-hevc"].forEach(sel => {
  $(sel)?.addEventListener("change", saveCutCompressUI);
});
syncCutCompressUI();

async function cutWithWebCodecs(cutStart, cutEnd, onProgress, compressCfg = null) {
  const mb = await getMediabunny();
  if (!mb || state.cancelled) return null;
  const { Input, Output, Conversion, ALL_FORMATS, BlobSource, Mp4OutputFormat, BufferTarget } = mb;
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(state.file) });
  const output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() });
  try {
    const trim = { start: cutStart };
    if (Number.isFinite(cutEnd)) trim.end = cutEnd;
    let videoOpts = { codec: "avc" };
    if (compressCfg?.enabled) {
      const th = [480, 720, 1080].includes(Number(compressCfg.targetHeight)) ? Number(compressCfg.targetHeight) : 720;
      const br = [1_000_000, 2_000_000, 4_000_000].includes(Number(compressCfg.videoBitrate)) ? Number(compressCfg.videoBitrate) : 2_000_000;
      videoOpts = { codec: compressCfg.useHevc !== false ? "hevc" : "avc", bitrate: br, hardwareAcceleration: "prefer-hardware" };
      const trk = await input.getPrimaryVideoTrack();
      const sw = trk?.displayWidth || 0, sh = trk?.displayHeight || 0;
      if (sw > 0 && sh > 0 && sh > th) {
        const even = n => Math.max(2, Math.round(n / 2) * 2);
        videoOpts.height = even(th);
        videoOpts.width = even(sw * (th / sh));
      } else if (!sh) {
        videoOpts.height = th;
      }
    }
    const conversion = await Conversion.init({
      input,
      output,
      trim,
      video: videoOpts,
      audio: { codec: "aac" },
    });
    if (!conversion.isValid) return null;
    if (onProgress) conversion.onProgress = onProgress;
    state.activeConversion = conversion;
    await conversion.execute();
    return new Blob([output.target.buffer], { type: "video/mp4" });
  } catch (error) {
    if (state.cancelled) throw error;
    if (compressCfg?.enabled && compressCfg.useHevc !== false) {
      try { input.dispose?.(); } catch {}
      return await cutWithWebCodecs(cutStart, cutEnd, onProgress, { ...compressCfg, useHevc: false });
    }
    console.warn("WebCodecs cut unavailable, falling back to FFmpeg:", error);
    return null;
  } finally {
    state.activeConversion = null;
    try { input.dispose?.(); } catch {}
  }
}
async function makeClips(highlights, clips) {
  resetOutputs();
  state.sessionUrl = $("#yt").value.trim(); state.sessionNotes = $("#notes").value;
  const fast = $("#mode").value === "fast";
  let ff = null, input = null;
  const ensureFFmpegInput = async () => {
    if (ff && input) return;
    ff = await Promise.race([getFFmpeg(), state.cancelPromise]);
    showBusy(true, "Opening your video...");
    input = await Promise.race([mountInput(ff), state.cancelPromise]);
  };
  if (!IS_ANDROID_APP) await ensureFFmpegInput();
  state.clipTotal = highlights.length; state.laps = [];
  for (let i = 0; i < highlights.length; i++) {
    const h = highlights[i];
    state.progressMessage = `Cutting clip ${i + 1} of ${highlights.length}...`;
    setBar(i / highlights.length);
    showBusy(true, state.progressMessage);
    const began = performance.now();
    const cutStart = Math.max(0, h.start - PAD);
    const cutEnd = Math.min(state.duration || Infinity, h.end + PAD);
    const output = `orthodox_clip_${String(i + 1).padStart(2,"0")}.mp4`;
    const cutCompressCfg = (typeof loadClipperPrefs === "function" ? loadClipperPrefs().cutCompress : null) || { enabled: false };
    let blob = null;
    let compressedAlready = false;
    if (IS_ANDROID_APP || cutCompressCfg.enabled) {
      if (fast && IS_ANDROID_APP && !cutCompressCfg.enabled) {
        blob = await Promise.race([cutWithAndroidNative(cutStart, cutEnd, output), state.cancelPromise]);
      } else if (!fast || cutCompressCfg.enabled) {
        blob = await Promise.race([cutWithWebCodecs(cutStart, cutEnd, p => setBar((i + p) / highlights.length), cutCompressCfg), state.cancelPromise]);
        if (blob && cutCompressCfg.enabled) compressedAlready = true;
      }
      if (blob) showBusy(true, state.progressMessage);
    }
    if (!blob) {
      await ensureFFmpegInput();
      showBusy(true, state.progressMessage);
      const args = ["-ss", cutStart.toFixed(3), "-i", input, "-t", (cutEnd - cutStart).toFixed(3)];
      if (fast && !cutCompressCfg.enabled) {
        args.push("-c", "copy", "-avoid_negative_ts", "make_zero", "-movflags", "+faststart", output);
      } else if (cutCompressCfg.enabled) {
        const th = [480, 720, 1080].includes(Number(cutCompressCfg.targetHeight)) ? Number(cutCompressCfg.targetHeight) : 720;
        const br = [1_000_000, 2_000_000, 4_000_000].includes(Number(cutCompressCfg.videoBitrate)) ? Number(cutCompressCfg.videoBitrate) : 2_000_000;
        const brK = `${Math.max(400, Math.round(br / 1000))}k`;
        args.push("-vf", `scale=-2:'min(ih,${th})'`, "-c:v", "libx264", "-preset", "veryfast", "-b:v", brK, "-maxrate", brK, "-bufsize", `${Math.round(br / 500)}k`, "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", output);
        compressedAlready = true;
      } else {
        args.push("-c:v", "libx264", "-preset", "ultrafast", "-crf", "23", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", output);
      }
      const code = await Promise.race([ff.exec(args, fast && !cutCompressCfg.enabled ? FAST_CUT_TIMEOUT_MS : -1), state.cancelPromise]);
      if (code === 1 && fast && !cutCompressCfg.enabled) throw new Error(`Cutting clip ${i + 1} timed out. This phone may be too slow or low on memory for this video. Try a shorter or smaller H.264 MP4.`);
      if (code !== 0) throw new Error(`Could not cut clip ${i + 1}. Try an MP4 video encoded with H.264.`);
      const bytes = await ff.readFile(output);
      try { await ff.deleteFile(output); } catch {}
      blob = new Blob([bytes], { type: "video/mp4" });
    }
    if (cutCompressCfg.enabled && !compressedAlready && typeof compressVideoBlob === "function") {
      blob = await compressVideoBlob(blob, cutCompressCfg, p => setBar((i + p) / highlights.length));
    }
    const cutSeconds = (performance.now() - began) / 1000;
    state.laps.push(`Clip ${i + 1} cut in ${cutSeconds.toFixed(1)} s`);
    $("#busy-lap").innerHTML = state.laps.slice(-4).map(t => `<div>${escapeHTML(t)}</div>`).join("");
    const title = h.title || `Clip ${i + 1}`;
    const _prefs = loadClipperPrefs();
    const item = { ...h, note: clips[i].note, title, blob, cutSeconds, vAnim: clone(_prefs.anim), tagsText: tagsText(h.tags), name: `${String(i + 1).padStart(2,"0")}-${slug(title)}.mp4`, url: URL.createObjectURL(blob) };
    state.outputs.push(item);
    $("#clip-list").insertAdjacentHTML("beforeend", cardHTML(item, state.outputs.length - 1));
    updateResultsHeader();
  }
  setBar(1);
  state.progressMessage = "";
}
async function run() {
  if (state.busy) return;
  state.cancelled = false;
  state.abort = new AbortController();
  state.cancelPromise = new Promise((_, reject) => { state.rejectCancel = () => reject(new Error("Cancelled")); });
  state.cancelPromise.catch(() => {});
  try {
    if (!state.file) { openStep(2, true); throw new Error("Upload a video first."); }
    if (state.metaState === "loading") throw new Error("The video is still being read. Wait a few seconds and try again.");
    const clips = validClips();
    const invalid = state.duration ? clips.find(clip => clip.end > state.duration + 0.5) : null;
    if (invalid) throw new Error(`Clip ${formatTime(invalid.start)}–${formatTime(invalid.end)} ends after the uploaded video.`);
    const overlap = findOverlaps(clips);
    showBusy(true, "AI is reading your notes and writing captions...");
    await keepAwake(true);
    let result, aiProblem = "";
    try { result = await callAI(clips, state.abort.signal); }
    catch (error) {
      if (state.cancelled) throw error;
      console.error(error);
      aiProblem = error.message || String(error);
      result = { highlights: clips.map((clip, i) => ({ title: `Clip ${i + 1}`, start: clip.start, end: clip.end, caption: clip.note, tags: ["TheOrthodoxMuslim", "Commentary", "Theology", "Islam", "@MuslimOrthodoxy", "@orthodoxmuslim"] })) };
      toast("AI captions unavailable. Cutting the clips anyway.", true);
    }
    if (!result.highlights?.length) throw new Error("The AI did not return any clips. Check the timestamp notes and try again.");
    $("#status").textContent = `${result.highlights.length} timestamp ranges processed. Cutting your clips now...`;
    await makeClips(result.highlights, clips);
    $("#status").textContent = `Finished. ${state.outputs.length} clips are ready.${aiProblem ? " Captions are your own notes because the AI step failed (" + aiProblem + "). Use Rewrite caption to retry." : ""}${overlap ? " " + overlap : ""}`;
    $("#results").scrollIntoView({ behavior: "smooth", block: "start" });
    toast("Your clips are ready.");
  } catch (error) {
    if (state.cancelled) {
      $("#status").textContent = state.outputs.length ? "Cancelled. Clips finished so far are below." : "Cancelled.";
      toast("Cancelled.");
    } else {
      console.error(error);
      toast(error.message || String(error), true);
      $("#status").textContent = "Something needs attention. Check the message above.";
    }
  } finally {
    state.progressMessage = ""; state.clipTotal = 0; setBar(0);
    try { await syncHistory(true); } catch (error) { console.error(error); }
    await keepAwake(false);
    await unmountInput(state.ffmpeg);
    showBusy(false);
  }
}
function cancel() {
  state.cancelled = true;
  state.abort?.abort();
  try { state.activeConversion?.cancel(); } catch {}
  state.activeConversion = null;
  state.rejectCancel?.();
  if (state.ffmpeg) { try { state.ffmpeg.terminate(); } catch {} state.ffmpeg = null; state.input = null; }
}
async function regenerate(i, button) {
  const item = state.outputs[i];
  if (!item || state.busy) return;
  button.disabled = true; button.textContent = "Rewriting...";
  try {
    const result = await callAI([{ start: item.start, end: item.end, note: item.note }]);
    const h = result.highlights?.[0];
    if (!h) throw new Error("The AI did not return a caption.");
    item.caption = h.caption; item.tagsText = tagsText(h.tags);
    const card = document.querySelector(`.clip[data-i="${i}"]`);
    refreshCapView(card.querySelector(".cap-block"), item.caption, item.tagsText);
    syncHistory();
    toast("New caption ready.");
  } catch (error) { toast(error.message || "Could not rewrite the caption.", true); }
  finally { button.disabled = false; button.textContent = "Rewrite caption"; }
}
