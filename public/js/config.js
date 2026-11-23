"use strict";
/* Shared state, constants, persisted preferences, and the DOM helper. Loaded first; every later file uses these. */
const $ = (s) => document.querySelector(s);
const state = { vw: 0, vh: 0, lastFrame: null, edVideo: null, file: null, fileUrl: null, duration: 0, busy: false, ffmpeg: null, input: null, mb: null, activeConversion: null, outputs: [], laps: [], historyId: null, sessionUrl: "", sessionNotes: "", progressMessage: "", cancelled: false, abort: null, cancelPromise: null, rejectCancel: null };
const CORE_BASES = [
  "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm",
  "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm"
];
const MEDIABUNNY_URLS = [
  "https://cdn.jsdelivr.net/npm/mediabunny@1/+esm",
  "https://unpkg.com/mediabunny@1/+esm"
];
const MOUNT = "/input";
const AI_TIMEOUT_MS = 45000;
const ENGINE_STALL_MS = 30000;
const FAST_CUT_TIMEOUT_MS = 120000;
const PAD = 2; // seconds added before and after every clip, to avoid cutting too tight
const IS_MOBILE = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Mac/i.test(navigator.platform));
const IS_DESKTOP_APP = !!window.OrthodoxDesktop;
const IS_ANDROID_APP = !!window.AndroidClipper || IS_DESKTOP_APP || new URLSearchParams(location.search).get("app") === "android";
const TIME = "\\d{1,3}:\\d{2}(?::\\d{2})?";
const SEP = "\\s*(?:-->|->|→|-|–|—|to|until)\\s*";
const RANGE_RE = new RegExp(`(${TIME})${SEP}(${TIME})`, "i");
const MAX_BEFORE = 60;

const PREFS_KEY = "clipper.prefs.v1";
function defaultAnimPrefs() {
  return {
    enabled: false,
    scope: "all",
    color: 0xc5d5e4,
    ti: false,
    surface: "wood",
    sticker: true,
    stickerPreset: "follow",
    stickerText: "Follow for more clips",
  };
}

function defaultClipperPrefs() {
  return {
    maxlen: "3",
    mode: "fast",
    watermark: "@yourchannel",
    frame: null,
    ved: {
      scope: "all",
    },
    anim: defaultAnimPrefs(),
  };
}

function loadClipperPrefs() {
  const base = defaultClipperPrefs();
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY) || "null");
    if (!raw || typeof raw !== "object") return base;
    if (["1", "2", "3"].includes(String(raw.maxlen))) base.maxlen = String(raw.maxlen);
    if (raw.mode === "fast" || raw.mode === "accurate") base.mode = raw.mode;
    if (typeof raw.watermark === "string" && raw.watermark.trim()) base.watermark = raw.watermark.trim().slice(0, 40);
    if (raw.frame && typeof raw.frame === "object") base.frame = raw.frame;
    if (raw.ved && typeof raw.ved === "object") {
      base.ved.scope = raw.ved.scope === "individual" ? "individual" : "all";
    }
    if (raw.anim && typeof raw.anim === "object") {
      base.anim.enabled = !!raw.anim.enabled;
      base.anim.scope = raw.anim.scope === "individual" ? "individual" : "all";
      if (Number.isFinite(Number(raw.anim.color))) base.anim.color = Number(raw.anim.color);
      base.anim.ti = !!raw.anim.ti;
      if (["wood", "marble", "concrete"].includes(raw.anim.surface)) base.anim.surface = raw.anim.surface;
      base.anim.sticker = raw.anim.sticker !== false;
      if (["follow", "subscribe", "custom"].includes(raw.anim.stickerPreset)) base.anim.stickerPreset = raw.anim.stickerPreset;
      if (typeof raw.anim.stickerText === "string") base.anim.stickerText = raw.anim.stickerText.slice(0, 48);
    }
  } catch {}
  return base;
}

function saveClipperPrefs(patch) {
  try {
    const cur = loadClipperPrefs();
    const next = {
      ...cur,
      ...patch,
      ved: { ...cur.ved, ...(patch?.ved || {}) },
      anim: { ...cur.anim, ...(patch?.anim || {}) },
    };
    localStorage.setItem(PREFS_KEY, JSON.stringify(next));
  } catch {}
}
