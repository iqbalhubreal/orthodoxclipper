"use strict";
/* Play / pause preview for the Vertical Maker and the Vertical Editor.
   Plays the clip with the real audio level driving the waveform and glow. If speaker detection is on, the first Play
   analyses the clip once (the result is cached on the clip and reused when you export). */
const pv = { playing: false, raf: 0, token: 0, cfg: null, sound: true };

/* Energy (audio level) and speaker levels to draw at time t. Used by editor.js and veditor.js. */
function previewStageOpts(item, frame, t) {
  const env = item && item._env;
  const energy = env && env.length ? env[Math.min(env.length - 1, Math.max(0, Math.round(t * 30)))] : 0.55;
  const track = item && item._spk && typeof speakerWanted === "function" && speakerWanted(frame) && item._spk.key === speakerKey(frame)
    ? item._spk.track : null;
  return { energy, timestamp: t, speakerLevels: track ? speakerLevelsAt(track, t) : null };
}

function previewSyncButtons() {
  document.querySelectorAll("[data-pv-sound]").forEach(b => { b.textContent = pv.sound ? "🔊" : "🔇"; b.setAttribute("aria-pressed", String(pv.sound)); });
  document.querySelectorAll("[data-pv-play]").forEach(b => { b.textContent = pv.playing ? "⏸ Pause" : "▶ Play"; });
}

function previewStop() {
  pv.token++;
  cancelAnimationFrame(pv.raf);
  const was = pv.playing, cfg = pv.cfg;
  pv.playing = false; pv.cfg = null;
  if (cfg) { try { cfg.video().pause(); cfg.video().muted = true; } catch {} }
  previewSyncButtons();
  if (was && cfg) cfg.draw();
}

function previewLoop() {
  const cfg = pv.cfg;
  if (!pv.playing || !cfg) return;
  const v = cfg.video();
  cfg.slider.value = v.currentTime;
  cfg.draw();
  if (v.ended || (v.duration && v.currentTime >= v.duration - 0.03)) return previewStop();
  pv.raf = requestAnimationFrame(previewLoop);
}

/* cfg = { video(), item(), frame(), slider, button, draw() } */
async function previewToggle(cfg) {
  if (pv.playing) return previewStop();
  const token = ++pv.token, item = cfg.item(), frame = cfg.frame(), st = frame.stage;
  if (!item) return;
  cfg.button.disabled = true;
  try {
    if (st?.enabled && !item._env && (st.waveform || st.activeGlow) && typeof extractAudioEnvelope === "function") {
      cfg.button.textContent = "Reading audio...";
      item._env = await extractAudioEnvelope(item.blob, 30);
    }
    if (typeof speakerWanted === "function" && speakerWanted(frame)) {
      await getSpeakerTrack(item, frame, item._env, 30, p => { cfg.button.textContent = p === null ? "Loading detector..." : `Detecting ${p}%`; });
    }
  } finally { cfg.button.disabled = false; previewSyncButtons(); }
  if (token !== pv.token) return;
  const v = cfg.video();
  if (v.ended || (v.duration && v.currentTime >= v.duration - 0.05)) v.currentTime = 0;
  v.muted = !pv.sound;
  try { await v.play(); } catch { toast("Your browser blocked playback. Tap Play again.", true); return; }
  if (token !== pv.token) { v.pause(); return; }
  pv.playing = true; pv.cfg = cfg;
  previewSyncButtons();
  pv.raf = requestAnimationFrame(previewLoop);
}

document.addEventListener("click", e => {
  const sound = e.target.closest("[data-pv-sound]");
  if (!sound) return;
  pv.sound = !pv.sound;
  if (pv.playing && pv.cfg) pv.cfg.video().muted = !pv.sound;
  previewSyncButtons();
});

$("#ed-play").addEventListener("click", () => previewToggle({
  video: () => state.edVideo, item: () => state.outputs[ed.index], frame: () => ed.frame,
  slider: $("#ed-time"), button: $("#ed-play"), draw: drawEditor,
}));
$("#ved-play").addEventListener("click", () => previewToggle({
  video: () => ved.video, item: () => state.outputs[ved.index], frame: () => ved.frame,
  slider: $("#ved-time"), button: $("#ved-play"), draw: drawVEditor,
}));
previewSyncButtons();
