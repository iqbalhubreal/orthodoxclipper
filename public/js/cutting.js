"use strict";
/* Cutting clips (Native Android / Fast copy / WebCodecs Accurate + FFmpeg fallback), cancel, rewrite caption. */
let nativeCutSeq = 0;
const nativeCutPending = new Map();
window.__nativeCutDone = (id, ok, value) => {
  const cb = nativeCutPending.get(id);
  if (!cb) return;
  nativeCutPending.delete(id);
  cb(ok, value);
};
function cutWithAndroidNative(cutStart, cutEnd, name) {
  if (!window.AndroidClipper?.cutFast) return Promise.resolve(null);
  return new Promise(resolve => {
    const id = String(++nativeCutSeq);
    nativeCutPending.set(id, async (ok, value) => {
      if (!ok) { console.warn("Native cut fallback:", value); return resolve(null); }
      try {
        const res = await fetch(`/__native_clip__/${encodeURIComponent(value)}`);
        if (!res.ok) return resolve(null);
        resolve(await res.blob());
      } catch { resolve(null); }
    });
    window.AndroidClipper.cutFast(id, cutStart, Number.isFinite(cutEnd) ? cutEnd : -1, name);
  });
}
async function cutWithWebCodecs(cutStart, cutEnd, onProgress) {
  const mb = await getMediabunny();
  if (!mb || state.cancelled) return null;
  const { Input, Output, Conversion, ALL_FORMATS, BlobSource, Mp4OutputFormat, BufferTarget } = mb;
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(state.file) });
  const output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() });
  try {
    const trim = { start: cutStart };
    if (Number.isFinite(cutEnd)) trim.end = cutEnd;
    const conversion = await Conversion.init({
      input,
      output,
      trim,
      video: { codec: "avc", hardwareAcceleration: "prefer-hardware" },
      audio: { codec: "aac" },
    });
    if (!conversion.isValid) return null;
    if (onProgress) conversion.onProgress = onProgress;
    state.activeConversion = conversion;
    await conversion.execute();
    return new Blob([output.target.buffer], { type: "video/mp4" });
  } catch (error) {
    if (state.cancelled) throw error;
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
  if (fast && !window.AndroidClipper?.cutFast) await ensureFFmpegInput();
  state.clipTotal = highlights.length; state.laps = [];
  for (let i = 0; i < highlights.length; i++) {
    const h = highlights[i];
    state.progressMessage = `Cutting clip ${i + 1} of ${highlights.length}...`;
    setBar(i / highlights.length);
    showBusy(true, state.progressMessage); // restarts the stopwatch for this clip
    const began = performance.now();
    const cutStart = Math.max(0, h.start - PAD);
    const cutEnd = Math.min(state.duration || Infinity, h.end + PAD);
    const output = `orthodox_clip_${String(i + 1).padStart(2,"0")}.mp4`;
    let blob = null;
    if (fast) {
      blob = await Promise.race([cutWithAndroidNative(cutStart, cutEnd, output), state.cancelPromise]);
    } else {
      blob = await Promise.race([
        cutWithWebCodecs(cutStart, cutEnd, p => setBar((i + p) / highlights.length)),
        state.cancelPromise,
      ]);
      if (blob) showBusy(true, state.progressMessage);
    }
    if (!blob) {
      await ensureFFmpegInput();
      showBusy(true, state.progressMessage);
      const args = ["-ss", cutStart.toFixed(3), "-i", input, "-t", (cutEnd - cutStart).toFixed(3)];
      if (fast) args.push("-c", "copy", "-avoid_negative_ts", "make_zero", "-movflags", "+faststart", output);
      else {
        args.push("-c:v", "libx264", "-preset", "ultrafast", "-crf", "23", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", output);
      }
      const code = await Promise.race([ff.exec(args, fast ? FAST_CUT_TIMEOUT_MS : -1), state.cancelPromise]);
      if (code === 1 && fast) throw new Error(`Cutting clip ${i + 1} timed out. Try a shorter or smaller H.264 MP4.`);
      if (code !== 0) throw new Error(`Could not cut clip ${i + 1}. Try an H.264 MP4.`);
      const bytes = await ff.readFile(output);
      try { await ff.deleteFile(output); } catch {}
      blob = new Blob([bytes], { type: "video/mp4" });
    }
    const cutSeconds = (performance.now() - began) / 1000;
    state.laps.push(`Clip ${i + 1} cut in ${cutSeconds.toFixed(1)} s`);
    $("#busy-lap").innerHTML = state.laps.slice(-4).map(t => `<div>${escapeHTML(t)}</div>`).join("");
    const title = h.title || `Clip ${i + 1}`;
    const item = { ...h, note: clips[i].note, title, blob, cutSeconds, tagsText: tagsText(h.tags), name: `${String(i + 1).padStart(2,"0")}-${slug(title)}.mp4`, url: URL.createObjectURL(blob) };
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
    if (state.metaState === "loading") throw new Error("Reading video info. Try again in a moment.");
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
      result = { highlights: clips.map((clip, i) => ({ title: `Clip ${i + 1}`, start: clip.start, end: clip.end, caption: clip.note, tags: ["TheOrthodoxMuslim"] })) };
      toast("AI captions unavailable. Cutting the clips anyway.", true);
    }
    if (!result.highlights?.length) throw new Error("The AI did not return any clips. Check the timestamp notes and try again.");
    $("#status").textContent = `${result.highlights.length} clips recognized. Cutting now...`;
    await makeClips(result.highlights, clips);
    $("#status").textContent = `Finished. ${state.outputs.length} clips ready.${aiProblem ? " Using your own notes (AI unavailable)." : ""}${overlap ? " " + overlap : ""}`;
    $("#results").scrollIntoView({ behavior: "smooth", block: "start" });
    toast("Your clips are ready.");
  } catch (error) {
    if (state.cancelled) {
      $("#status").textContent = state.outputs.length ? "Cancelled. Finished clips are below." : "Cancelled.";
      toast("Cancelled.");
    } else {
      console.error(error);
      toast(error.message || String(error), true);
      $("#status").textContent = "Something needs attention. Check the message above.";
    }
  } finally {
    state.progressMessage = ""; state.clipTotal = 0; setBar(0);
    try { syncHistory(); } catch (error) { console.error(error); }
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
  nativeCutPending.clear();
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
