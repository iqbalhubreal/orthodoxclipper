"use strict";
/* Shared state, constants and the DOM helper. Loaded first; every later file uses these. */
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
