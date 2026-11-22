"use strict";
/* Play / pause preview for the Vertical Maker and the Vertical Editor.
   Plays the clip with the real audio level driving the waveform and glow. If speaker detection is on, the first Play
   analyses the clip once (the result is cached on the clip and reused when you export). */
const pv = { playing: false, raf: 0, token: 0, cfg: null, sound: true, audioCtx: null };

function ensurePreviewAudioGraph(v) {
  if (v._audioGraph) return v._audioGraph;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  try {
    const ctx = pv.audioCtx || (pv.audioCtx = new AC());
    const src = ctx.createMediaElementSource(v);
    const dry = ctx.createGain();
    const wet = ctx.createGain();
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass"; hp.frequency.value = 85;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -24; comp.knee.value = 12; comp.ratio.value = 4;
    comp.attack.value = 0.005; comp.release.value = 0.15;
    const makeup = ctx.createGain();
    makeup.gain.value = 1.55;
    const lim = ctx.createDynamicsCompressor();
    lim.threshold.value = -1.5; lim.knee.value = 0; lim.ratio.value = 20;
    lim.attack.value = 0.002; lim.release.value = 0.05;
    src.connect(dry); dry.connect(ctx.destination);
    src.connect(hp); hp.connect(comp); comp.connect(makeup); makeup.connect(lim); lim.connect(wet); wet.connect(ctx.destination);
    dry.gain.value = 1; wet.gain.value = 0;
    v._audioGraph = { ctx, dry, wet };
    return v._audioGraph;
  } catch { return null; }
}
function applyPreviewPlayback(v, opts = {}) {
  const speed = typeof clampSpeed === "function" ? clampSpeed(opts.speed) : (Number(opts.speed) || 1);
  v.playbackRate = speed;
  v.preservesPitch = true;
  v.mozPreservesPitch = true;
  v.webkitPreservesPitch = true;
  const boost = !!opts.voiceBoost;
  if (boost || v._audioGraph) {
    const g = ensurePreviewAudioGraph(v);
    if (g) {
      if (g.ctx.state === "suspended") g.ctx.resume().catch(() => {});
      g.dry.gain.value = boost ? 0 : 1;
      g.wet.gain.value = boost ? 1 : 0;
    }
  }
}
function previewApplyLive() {
  if (!pv.playing || !pv.cfg) return;
  applyPreviewPlayback(pv.cfg.video(), {
    speed: pv.cfg.speed ? pv.cfg.speed() : 1,
    voiceBoost: pv.cfg.voiceBoost ? pv.cfg.voiceBoost() : false,
  });
}

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
  applyPreviewPlayback(v, { speed: cfg.speed ? cfg.speed() : 1, voiceBoost: cfg.voiceBoost ? cfg.voiceBoost() : false });
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
  speed: () => ved.speed, voiceBoost: () => ved.voiceBoost,
}));
previewSyncButtons();
