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
    else { state.duration = 0; state.metaState = "unknown"; $("#file-meta").textContent = `${size} · length unknown`; }
    renderDetected();
  };
  video.onloadedmetadata = () => {
    if (known()) return finish();
    // Some files (screen recordings, live captures) store no length. Seeking far ahead makes the browser work it out.
    const timer = setTimeout(finish, 6000);
    video.ondurationchange = () => { if (known()) { clearTimeout(timer); finish(); } };
    try { video.currentTime = 1e101; } catch { clearTimeout(timer); finish(); }
  };
  video.onerror = () => { if (state.metaState === "loading") { state.metaState = "failed"; $("#file-meta").textContent = "Could not read video info."; } };
  video.src = state.fileUrl;
  renderDetected();
}
