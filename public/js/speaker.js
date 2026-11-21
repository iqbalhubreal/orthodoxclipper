"use strict";
/* Speaker detection for the 2.5D Debate Stage.
   Plays the clip muted, finds each person's face inside their crop box (MediaPipe Face Landmarker, runs in the browser),
   measures how much each mouth is moving, and combines that with the audio loudness to decide who is talking.
   The result is a smooth per-frame "speaking level" (0..1) for every box, used by stage.js for the 2.5D glow.
   Nothing is uploaded. If anything fails, analyzeSpeakers() returns null and the stage falls back to the simple pulse. */
const MP_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";
const MP_MODEL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const SPK_SAMPLE_STEP = 1 / 12;   // analyse about 12 frames per second of video
const SPK_PLAYBACK_RATE = 3;      // analysis plays the clip faster than real time
let faceLandmarkerPromise = null;

function getFaceLandmarker() {
  if (!faceLandmarkerPromise) {
    faceLandmarkerPromise = (async () => {
      const vision = await import(`${MP_BASE}/vision_bundle.mjs`);
      const files = await vision.FilesetResolver.forVisionTasks(`${MP_BASE}/wasm`);
      const create = delegate => vision.FaceLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: MP_MODEL, delegate },
        runningMode: "IMAGE",
        numFaces: 1,
      });
      try { return await create("GPU"); } catch { return await create("CPU"); }
    })().catch(error => { faceLandmarkerPromise = null; throw error; });
  }
  return faceLandmarkerPromise;
}

/* Gap between the inner lips, relative to face height (landmarks 13/14 = inner lips, 10 = forehead, 152 = chin). */
function lipGap(lm) {
  const faceHeight = Math.abs(lm[152].y - lm[10].y) || 1;
  return Math.abs(lm[14].y - lm[13].y) / faceHeight;
}

/* Returns { fps, frames, levels: Float32Array[] (one per box), speaker: Int8Array } or null. */
async function analyzeSpeakers(blob, frameBoxes, audioEnv, fps = 30, onProgress = null) {
  if (!blob || !frameBoxes || frameBoxes.length < 2) return null;
  const video = document.createElement("video");
  const url = URL.createObjectURL(blob);
  const previousText = onProgress ? "" : ($("#busy-text")?.textContent || "");
  const report = pct => onProgress ? onProgress(pct)
    : setBusyText(pct === null ? "Loading speaker detection (first time only)..." : `Detecting speakers... ${pct}%`);
  try {
    if (typeof video.requestVideoFrameCallback !== "function") return null;
    report(null);
    const landmarker = await getFaceLandmarker();
    if (state.cancelled) return null;

    video.muted = true; video.playsInline = true; video.preload = "auto"; video.src = url;
    await new Promise((resolve, reject) => {
      video.onloadedmetadata = resolve;
      video.onerror = () => reject(new Error("Could not read the clip."));
    });
    const vw = video.videoWidth, vh = video.videoHeight, duration = video.duration;
    if (!vw || !vh || !Number.isFinite(duration) || duration <= 0) return null;

    // One small canvas per box; each is a crop of the source frame, so a face is only searched inside its own box.
    const crops = frameBoxes.map(box => {
      const r = { x: box.x * vw, y: box.y * vh, w: Math.max(2, box.w * vw), h: Math.max(2, box.h * vh) };
      const k = Math.min(1, 384 / Math.max(r.w, r.h));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(2, Math.round(r.w * k)); canvas.height = Math.max(2, Math.round(r.h * k));
      return { r, canvas, ctx: canvas.getContext("2d", { willReadFrequently: false }) };
    });

    const samples = []; // { t, gaps: [gap | null per box] }
    let nextT = 0, lastBeat = Date.now();
    await new Promise((resolve, reject) => {
      let finished = false;
      const finish = () => { if (finished) return; finished = true; clearInterval(watchdog); try { video.pause(); } catch {} resolve(); };
      const watchdog = setInterval(() => { if (state.cancelled || Date.now() - lastBeat > 8000) finish(); }, 1000);
      const onFrame = (now, meta) => {
        if (finished) return;
        lastBeat = Date.now();
        const t = meta.mediaTime;
        if (t >= nextT) {
          nextT = t + SPK_SAMPLE_STEP;
          const gaps = crops.map(c => {
            try {
              c.ctx.drawImage(video, c.r.x, c.r.y, c.r.w, c.r.h, 0, 0, c.canvas.width, c.canvas.height);
              const found = landmarker.detect(c.canvas).faceLandmarks;
              return found && found[0] ? lipGap(found[0]) : null;
            } catch { return null; }
          });
          samples.push({ t, gaps });
          report(Math.min(99, Math.round(t / duration * 100)));
        }
        video.requestVideoFrameCallback(onFrame);
      };
      video.addEventListener("ended", finish);
      video.onerror = () => reject(new Error("Could not play the clip."));
      video.playbackRate = SPK_PLAYBACK_RATE;
      video.play().then(() => video.requestVideoFrameCallback(onFrame)).catch(reject);
    });
    if (state.cancelled || samples.length < 4) return null;
    if (!samples.some(s => s.gaps.some(g => g !== null))) return null; // no faces found at all
    return buildSpeakerTrack(samples, frameBoxes.length, duration, audioEnv, fps);
  } catch (error) {
    console.warn("Speaker detection unavailable:", error);
    if (!state.cancelled) toast("Speaker detection is unavailable, using the simple glow pulse instead.", true);
    return null;
  } finally {
    try { video.pause(); } catch {}
    video.removeAttribute("src"); video.load();
    URL.revokeObjectURL(url);
    if (previousText) setBusyText(previousText);
  }
}

function buildSpeakerTrack(samples, count, duration, audioEnv, fps) {
  const frames = Math.max(1, Math.ceil(duration * fps));

  // 1. Mouth activity per box per sample: average change of the lip gap over the last ~0.33 s.
  const activity = Array.from({ length: count }, () => new Float32Array(samples.length));
  for (let b = 0; b < count; b++) {
    const diffs = new Float32Array(samples.length);
    for (let k = 1; k < samples.length; k++) {
      const a = samples[k].gaps[b], p = samples[k - 1].gaps[b];
      diffs[k] = a !== null && p !== null ? Math.abs(a - p) : 0;
    }
    for (let k = 0; k < samples.length; k++) {
      let sum = 0, n = 0;
      for (let j = Math.max(1, k - 3); j <= k; j++) { sum += diffs[j]; n++; }
      activity[b][k] = n ? sum / n : 0;
    }
  }

  // 2. One shared scale for all boxes, so a quiet mouth never looks as active as a talking one.
  const all = [];
  activity.forEach(arr => arr.forEach(v => { if (v > 0) all.push(v); }));
  all.sort((x, y) => x - y);
  const scale = Math.max(all.length ? all[Math.floor(all.length * 0.95)] : 0, 0.006);

  // 3. Resample to the output frame rate.
  const score = Array.from({ length: count }, () => new Float32Array(frames));
  for (let f = 0; f < frames; f++) {
    const t = f / fps;
    let k = 0;
    while (k < samples.length - 1 && samples[k + 1].t <= t) k++;
    for (let b = 0; b < count; b++) score[b][f] = Math.min(1.5, activity[b][k] / scale);
  }

  // 4. Audio gate: someone is only "speaking" when there is sound (looks 0.5 s around each frame, so short pauses stay open).
  const gate = new Uint8Array(frames).fill(1);
  if (audioEnv && audioEnv.length) {
    const win = Math.round(fps * 0.5);
    for (let f = 0; f < frames; f++) {
      let peak = 0;
      for (let j = Math.max(0, f - win); j <= Math.min(audioEnv.length - 1, f + win); j += 2) peak = Math.max(peak, audioEnv[j]);
      gate[f] = peak > 0.07 ? 1 : 0;
    }
  }

  // 5. Pick the speaker with hysteresis, so the glow never flickers between people.
  const speaker = new Int8Array(frames);
  let cur = -1, lastSwitch = -9, pending = -2, pendingSince = 0;
  for (let f = 0; f < frames; f++) {
    const t = f / fps;
    let best = 0;
    for (let b = 1; b < count; b++) if (score[b][f] > score[best][f]) best = b;
    let target;
    if (!gate[f]) target = -1;
    else if (score[best][f] < 0.25) target = cur;                                    // faces hidden: keep the last speaker
    else if (cur >= 0 && score[cur][f] * 1.35 >= score[best][f]) target = cur;       // current speaker still close enough
    else target = best;
    if (target !== cur) {
      if (target !== pending) { pending = target; pendingSince = t; }
      const need = cur === -1 ? 0.1 : target === -1 ? 0.4 : 0.3;
      if (t - pendingSince >= need && t - lastSwitch >= 0.5) { cur = target; lastSwitch = t; pending = -2; }
    } else pending = -2;
    speaker[f] = cur;
  }

  // 6. Smooth 0..1 levels: quick fade in (~0.12 s), slower fade out (~0.3 s).
  const levels = Array.from({ length: count }, () => new Float32Array(frames));
  const up = 1 - Math.exp(-1 / (fps * 0.12)), down = 1 - Math.exp(-1 / (fps * 0.3));
  for (let b = 0; b < count; b++) {
    let v = 0;
    for (let f = 0; f < frames; f++) {
      const goal = speaker[f] === b ? 1 : 0;
      v += (goal - v) * (goal > v ? up : down);
      levels[b][f] = v;
    }
  }
  return { fps, frames, levels, speaker };
}

/* Speaking levels (array, one value per box) at a time in seconds. */
function speakerLevelsAt(track, seconds) {
  const f = Math.min(track.frames - 1, Math.max(0, Math.round(seconds * track.fps)));
  return track.levels.map(arr => arr[f]);
}

/* True when this frame setup asks for speaker detection (stage on, glow on, "Auto", 2+ boxes). */
function speakerWanted(frame) {
  const st = frame && frame.stage;
  return !!(st && st.enabled && st.activeGlow && st.detectSpeaker && st.speakerFocus === "auto" && getFrameBoxes(frame).length > 1);
}
/* Cache key: the box positions (rounded, so tiny nudges reuse the analysis). */
function speakerKey(frame) {
  return getFrameBoxes(frame).map(b => [b.x, b.y, b.w, b.h].map(n => Math.round(n * 50) / 50).join(",")).join("|");
}
/* Analyse once per clip and box layout; the result is kept on the clip and reused by the preview and the export. */
async function getSpeakerTrack(item, frame, audioEnv, fps = 30, onProgress = null) {
  if (!speakerWanted(frame)) return null;
  const key = speakerKey(frame);
  if (item._spk && item._spk.key === key) return item._spk.track;
  const track = await analyzeSpeakers(item.blob, getFrameBoxes(frame), audioEnv, fps, onProgress);
  if (track) item._spk = { key, track };
  return track;
}
