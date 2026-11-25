"use strict";
/* Video upload handling, file warnings and the Fast/Accurate hint. */
function updateWarnings(file) {
  const mb = file.size / 1048576, notes = [];
  if (!IS_ANDROID_APP && IS_MOBILE && mb > 300) notes.push("Large video for a phone.");
  else if (!IS_ANDROID_APP && mb > 2000) notes.push("Video is over 2 GB and may fail in the browser.");
  $("#warn").textContent = notes.join(" ");
  $("#warn").hidden = !notes.length;
}
function updateModeHint() {
  $("#mode-hint").textContent = $("#mode").value === "fast"
    ? "Quickest cut; may start a second or two early."
    : "Cuts at the exact timestamp.";
}
function syncImportCompressUI() {
  const c = (typeof loadClipperPrefs === "function" ? loadClipperPrefs().importCompress : null) || { enabled: false, targetHeight: 720, videoBitrate: 2000000, useHevc: true };
  if ($("#import-compress-on")) $("#import-compress-on").checked = !!c.enabled;
  if ($("#import-compress-height")) $("#import-compress-height").value = String(c.targetHeight || 720);
  if ($("#import-compress-bitrate")) $("#import-compress-bitrate").value = String(c.videoBitrate || 2000000);
  if ($("#import-compress-hevc")) $("#import-compress-hevc").checked = c.useHevc !== false;
  const optsEl = $("#import-compress-opts"), sumEl = $("#import-compress-summary");
  if (optsEl) { optsEl.hidden = !c.enabled; optsEl.style.display = c.enabled ? "grid" : "none"; }
  if (sumEl) {
    sumEl.textContent = c.enabled
      ? `${c.targetHeight || 720}p · ${Math.round((c.videoBitrate || 2000000) / 1000000)} Mbps · ${c.useHevc !== false ? "H.265" : "H.264"}`
      : "Off";
  }
}
function saveImportCompressUI() {
  const patch = {
    enabled: !!$("#import-compress-on")?.checked,
    targetHeight: Number($("#import-compress-height")?.value) || 720,
    videoBitrate: Number($("#import-compress-bitrate")?.value) || 2000000,
    useHevc: $("#import-compress-hevc")?.checked !== false,
  };
  if (typeof saveClipperPrefs === "function") saveClipperPrefs({ importCompress: patch });
  syncImportCompressUI();
}
["#import-compress-on", "#import-compress-height", "#import-compress-bitrate", "#import-compress-hevc"].forEach(sel => {
  $(sel)?.addEventListener("change", saveImportCompressUI);
});
syncImportCompressUI();

async function selectFile(file) {
  if (!file) return;
  if (!file.type.startsWith("video/") && !/\.(mp4|mov|m4v|webm|mkv|avi|mpeg|mpg|3gp)$/i.test(file.name)) return toast("Choose a video file.", true);
  const impCfg = (typeof loadClipperPrefs === "function" ? loadClipperPrefs().importCompress : null) || {};
  let sizeLabelNote = "";
  if (impCfg.enabled && typeof compressVideoBlob === "function" && !state.busy) {
    state.cancelled = false;
    state.cancelPromise = new Promise((_, reject) => { state.rejectCancel = () => reject(new Error("Cancelled")); });
    state.cancelPromise.catch(() => {});
    showBusy(true, `Compressing imported video (${impCfg.targetHeight || 720}p)...`);
    setBar(0);
    await keepAwake(true);
    try {
      const origMb = (file.size / 1048576).toFixed(1);
      const cmpBlob = await compressVideoBlob(file, impCfg, p => setBar(p));
      const newName = file.name.replace(/\.[^.]+$/, "") + `-${impCfg.targetHeight || 720}p.mp4`;
      file = new File([cmpBlob], newName, { type: "video/mp4" });
      sizeLabelNote = `${origMb} MB → `;
      toast(`Imported video compressed (${origMb} MB → ${(file.size / 1048576).toFixed(1)} MB).`);
    } catch (err) {
      if (state.cancelled) { toast("Import compression cancelled."); showBusy(false); await keepAwake(false); return; }
      console.warn("Import compression failed, using original file:", err);
      toast("Import compression failed; using original video.", true);
    } finally {
      setBar(0);
      await keepAwake(false);
      showBusy(false);
    }
  }
  if (state.fileUrl) URL.revokeObjectURL(state.fileUrl);
  unmountInput(state.ffmpeg);
  resetOutputs();
  $("#status").textContent = "";
  state.file = file;
  state.duration = 0; state.metaState = "loading";
  state.vw = state.vh = 0; state.lastFrame = null;
  state.fileUrl = URL.createObjectURL(file);
  const size = `${sizeLabelNote}${(file.size / 1048576).toFixed(1)} MB`;
  $("#file-name").textContent = file.name;
  $("#file-meta").textContent = `${size} · unknown`;
  updateWarnings(file);
  const video = document.createElement("video");
  video.preload = "metadata";
  const known = () => Number.isFinite(video.duration) && video.duration > 0;
  let hardTimer = null;
  const finish = () => {
    clearTimeout(hardTimer);
    if (state.file !== file || state.metaState !== "loading") return;
    state.vw = video.videoWidth; state.vh = video.videoHeight;
    if (known()) { state.duration = video.duration; state.metaState = "ready"; $("#file-meta").textContent = `${size} · ${formatTime(state.duration)}`; }
    else { state.duration = 0; state.metaState = "unknown"; $("#file-meta").textContent = `${size} · unknown`; }
    renderDetected();
  };
  hardTimer = setTimeout(finish, 3000);
  video.onloadedmetadata = () => {
    if (known()) return finish();
    const timer = setTimeout(finish, 2500);
    video.ondurationchange = () => { if (known()) { clearTimeout(timer); finish(); } };
    try { video.currentTime = 1e101; } catch { clearTimeout(timer); finish(); }
  };
  video.onerror = () => {
    clearTimeout(hardTimer);
    if (state.metaState === "loading") {
      state.metaState = "unknown";
      $("#file-meta").textContent = `${size} · unknown`;
      renderDetected();
    }
  };
  video.src = state.fileUrl;
  renderDetected();
}
