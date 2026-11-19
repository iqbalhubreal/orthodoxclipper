"use strict";
/* Video upload handling, file warnings and the Fast/Accurate hint. */
function updateWarnings(file) {
  const mb = file.size / 1048576, notes = [];
  if (IS_MOBILE && mb > 300) notes.push("This is a large video for a phone. The browser may run out of memory. Fast mode helps, or use a computer for long videos.");
  else if (mb > 2000) notes.push("This video is over 2 GB. Browsers often fail on files this large. Consider trimming it first or using Fast mode.");
  if (/\.(mov|m4v)$/i.test(file.name) && IS_MOBILE) notes.push("If cutting fails, the video may be HEVC (H.265). Export it as H.264 MP4.");
  $("#warn").textContent = notes.join(" ");
  $("#warn").hidden = !notes.length;
}
function updateModeHint() {
  $("#mode-hint").textContent = $("#mode").value === "fast"
    ? "Fast mode copies the video without re-encoding, so each clip is ready in seconds and uses little memory. A clip may begin up to a few seconds early (at the nearest keyframe), which the 2-second padding usually hides."
    : "Accurate mode cuts at the exact frame but re-encodes every clip inside your browser. Expect several times the clip length (a 1-minute clip can take 1 to 3 minutes on a computer, much longer on a phone). Use it only if Fast starts a clip too early.";
}
function selectFile(file) {
  if (!file) return;
  if (!file.type.startsWith("video/") && !/\.(mp4|mov|m4v|webm|mkv|avi|mpeg|mpg|3gp)$/i.test(file.name)) return toast("Choose a video file.", true);
  if (state.fileUrl) URL.revokeObjectURL(state.fileUrl);
  unmountInput(state.ffmpeg);
  resetOutputs();
  $("#status").textContent = "";
  state.file = file;
  state.duration = 0; state.metaState = "loading";
  state.vw = state.vh = 0; state.lastFrame = null;
  state.fileUrl = URL.createObjectURL(file);
  $("#file-name").textContent = file.name;
  $("#file-meta").textContent = `${(file.size / 1048576).toFixed(1)} MB · Reading duration...`;
  updateWarnings(file);
  const video = document.createElement("video");
  video.preload = "metadata";
  const size = `${(file.size / 1048576).toFixed(1)} MB`;
  const known = () => Number.isFinite(video.duration) && video.duration > 0;
  const finish = () => {
    if (state.file !== file || state.metaState !== "loading") return;
    state.vw = video.videoWidth; state.vh = video.videoHeight;
    if (known()) { state.duration = video.duration; state.metaState = "ready"; $("#file-meta").textContent = `${size} · ${formatTime(state.duration)} long`; }
    else { state.duration = 0; state.metaState = "unknown"; $("#file-meta").textContent = `${size} · length unknown (this file has no length info). Cutting still works, but clips past the end cannot be checked.`; }
    renderDetected();
  };
  video.onloadedmetadata = () => {
    if (known()) return finish();
    // Some files (screen recordings, live captures) store no length. Seeking far ahead makes the browser work it out.
    const timer = setTimeout(finish, 6000);
    video.ondurationchange = () => { if (known()) { clearTimeout(timer); finish(); } };
    try { video.currentTime = 1e101; } catch { clearTimeout(timer); finish(); }
  };
  video.onerror = () => { if (state.metaState === "loading") { state.metaState = "failed"; $("#file-meta").textContent = "Could not read this video in the browser. Cutting may still work; if it fails, try an MP4 (H.264)."; } };
  video.src = state.fileUrl;
  renderDetected();
}
