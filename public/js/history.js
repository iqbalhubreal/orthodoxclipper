"use strict";
/* History stored in this browser. On mobile, retains only the most recent session's exported clips locally in IndexedDB and displays them for playback/download. */
const HIST_KEY = "clipper.history";
const MOBILE_CACHE = IS_MOBILE || IS_ANDROID_APP;
const IDB_NAME = "orthodoxclipper_latest";
const IDB_STORE = "clips";
const histOpen = new Set();
let histUrls = [];

function revokeHistUrls() {
  histUrls.forEach(u => { try { URL.revokeObjectURL(u); } catch {} });
  histUrls = [];
}
function openClipsDB() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) return resolve(null);
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE, { keyPath: "key" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function saveLatestMobileClips() {
  if (!MOBILE_CACHE || !state.outputs.length) return;
  try {
    const db = await openClipsDB();
    if (!db) return;
    await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      const store = tx.objectStore(IDB_STORE);
      store.clear();
      state.outputs.forEach((o, i) => {
        if (o.blob) store.put({ key: `h_${i}`, name: o.name, blob: o.blob });
        if (o.vBlob) store.put({ key: `v_${i}`, name: o.vName, blob: o.vBlob });
      });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch {}
}
async function loadLatestMobileClips() {
  const map = new Map();
  if (!MOBILE_CACHE) return map;
  try {
    const db = await openClipsDB();
    if (!db) return map;
    const rows = await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readonly");
      const req = tx.objectStore(IDB_STORE).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
    rows.forEach(r => { if (r && r.key && r.blob) map.set(r.key, r); });
  } catch {}
  return map;
}
async function clearLatestMobileClips() {
  try {
    const db = await openClipsDB();
    if (!db) return;
    await new Promise(resolve => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).clear();
      tx.oncomplete = tx.onerror = resolve;
    });
  } catch {}
}

function loadHistory() {
  try { const list = JSON.parse(localStorage.getItem(HIST_KEY) || "[]"); return Array.isArray(list) ? list : []; }
  catch { return []; }
}
function saveHistory(list) {
  const toSave = MOBILE_CACHE ? list.slice(0, 1) : list;
  for (const keep of [100, 40, 10, 1]) {
    try { localStorage.setItem(HIST_KEY, JSON.stringify(toSave.slice(0, keep))); return true; } catch {}
  }
  return false;
}
function ytId(url) {
  try {
    const u = new URL(String(url).trim()), host = u.hostname.replace(/^(www|m)\./, "");
    let id = "";
    if (host === "youtu.be") id = u.pathname.slice(1).split("/")[0];
    else if (host.endsWith("youtube.com")) id = u.searchParams.get("v") || (u.pathname.match(/^\/(?:embed|shorts|live|v)\/([\w-]{11})/) || [])[1] || "";
    return /^[\w-]{11}$/.test(id) ? id : "";
  } catch { return ""; }
}
async function syncHistory(replaceClips = false) {
  if (!state.outputs.length) return;
  let list = loadHistory();
  let entry = list.find(x => x.id === state.historyId);
  if (!entry) {
    entry = { id: `h${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, ts: Date.now() };
    state.historyId = entry.id;
    list = MOBILE_CACHE ? [entry] : [entry, ...list];
  }
  Object.assign(entry, {
    url: state.sessionUrl, videoId: ytId(state.sessionUrl), fileName: state.file?.name || "", notes: state.sessionNotes,
    clips: state.outputs.map(o => ({ title: o.title, start: o.start, end: o.end, note: o.note, caption: o.caption, tagsText: o.tagsText, hasVert: !!o.vBlob }))
  });
  saveHistory(list);
  updateHistoryBadge();
  if (replaceClips || MOBILE_CACHE) await saveLatestMobileClips();
}
function updateHistoryBadge() { const n = loadHistory().length; $("#hist-count").textContent = n ? String(n) : ""; }
function previewPlaceholder(vid, start) {
  return vid
    ? `<div class="ph"><button class="btn primary" type="button" data-h="play" data-vid="${vid}" data-start="${Math.floor(start)}">▶ Play from ${formatTime(start)}</button><span>Plays from YouTube.</span></div>`
    : `<div class="ph"><span>No YouTube link saved for preview.</span></div>`;
}
function localClipHTML(hRec, vRec) {
  const main = vRec || hRec;
  const mainUrl = URL.createObjectURL(main.blob);
  histUrls.push(mainUrl);
  const hUrl = hRec && vRec ? URL.createObjectURL(hRec.blob) : (hRec ? mainUrl : "");
  if (hRec && vRec) histUrls.push(hUrl);
  const vUrl = vRec ? mainUrl : "";
  const btns = [];
  if (hRec) btns.push(`<a class="btn" href="${hUrl}" download="${escapeHTML(hRec.name || "clip.mp4")}" data-h-dl="h">Download MP4</a>`);
  if (vRec) btns.push(`<a class="btn primary" href="${vUrl}" download="${escapeHTML(vRec.name || "clip-vertical.mp4")}" data-h-dl="v">Download vertical MP4</a>`);
  return `<div class="clip" style="margin-top:10px;padding:0;border:0;background:transparent">
      <video class="${vRec ? "vertical" : ""}" controls playsinline preload="metadata" src="${mainUrl}"></video>
    </div>
    <div class="clip-actions">${btns.join("")}</div>`;
}
function entryHTML(e, idx, localClips) {
  const open = histOpen.has(e.id), clips = e.clips || [];
  const when = new Date(e.ts).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
  const link = /^https?:\/\//i.test(e.url || "") ? `<a href="${escapeHTML(e.url)}" target="_blank" rel="noopener">${escapeHTML(e.url)}</a>` : escapeHTML(e.url || "No YouTube link saved");
  let body = "";
  if (open) {
    body = `<div class="h-body">
      ${e.fileName ? `<p class="hint">Video file: ${escapeHTML(e.fileName)}</p>` : ""}
      <details><summary>Pasted notes</summary><pre>${escapeHTML(e.notes || "")}</pre></details>
      <div class="clip-actions"><button class="btn" type="button" data-h="reuse">Use these notes again</button></div>
      ${clips.map((c, j) => {
        const hRec = idx === 0 ? localClips.get(`h_${j}`) : null;
        const vRec = idx === 0 ? localClips.get(`v_${j}`) : null;
        const media = (hRec || vRec) ? localClipHTML(hRec, vRec) : `<div class="preview">${previewPlaceholder(e.videoId, c.start)}</div>`;
        return `<div class="h-clip" data-hc="${j}">
          <div class="clip-head"><div class="clip-title">${escapeHTML(c.title || `Clip ${j + 1}`)}</div><div class="clip-time">${formatTime(c.start)}–${formatTime(c.end)}</div></div>
          ${media}
          ${capBlockHTML(c.caption, c.tagsText, `hist:${e.id}:${j}`)}
          <div class="clip-actions"><button class="btn primary" type="button" data-h="copy">Copy caption + hashtags</button></div>
        </div>`;
      }).join("")}
    </div>`;
  }
  return `<article class="h-entry" data-id="${e.id}">
    <div class="h-head"><button class="h-toggle" type="button" data-h="toggle" aria-expanded="${open}"><div class="h-title">${open ? "▾" : "▸"} ${clips.length} clip${clips.length === 1 ? "" : "s"} · ${escapeHTML(when)}</div><div class="h-sub">${link}</div></button><button class="btn del" type="button" data-h="delete">Delete</button></div>
    ${body}
  </article>`;
}
async function renderHistory() {
  revokeHistUrls();
  const list = loadHistory();
  if (MOBILE_CACHE && list.length === 1 && !histOpen.size) histOpen.add(list[0].id);
  const localClips = await loadLatestMobileClips();
  const notice = $("#h-notice");
  if (notice) {
    notice.textContent = MOBILE_CACHE
      ? "Mobile storage notice: only clips from your most recent exported session are retained locally. Saving a new session replaces the previous one."
      : "Saved in this browser (videos are not stored).";
  }
  $("#h-clear").hidden = !list.length;
  $("#h-list").innerHTML = list.length ? list.map((e, idx) => entryHTML(e, idx, localClips)).join("") : `<p class="h-empty">No history yet. Finished clips will appear here.</p>`;
}
function openHistory() { $("#history").hidden = false; renderHistory(); }
function closeHistory() { $("#history").hidden = true; $("#h-list").innerHTML = ""; revokeHistUrls(); }
function armed(button, label) {
  if (button.dataset.armed) { clearTimeout(button._timer); return true; }
  const original = button.textContent;
  button.dataset.armed = "1"; button.textContent = label; button.classList.add("danger");
  button._timer = setTimeout(() => { delete button.dataset.armed; button.textContent = original; button.classList.remove("danger"); }, 3500);
  return false;
}
function stopPreviews() {
  document.querySelectorAll("#h-list .preview.playing").forEach(el => { el.classList.remove("playing"); el.innerHTML = el._ph; });
}
$("#open-history").addEventListener("click", openHistory);
$("#h-close").addEventListener("click", closeHistory);
document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("#history").hidden) closeHistory(); });
$("#h-clear").addEventListener("click", async e => {
  if (!armed(e.currentTarget, "Tap again to delete all")) return;
  try { localStorage.removeItem(HIST_KEY); } catch {}
  await clearLatestMobileClips();
  histOpen.clear(); await renderHistory(); updateHistoryBadge(); toast("History deleted.");
});
$("#h-list").addEventListener("click", async e => {
  const dl = e.target.closest("a[data-h-dl]");
  if (dl && window.AndroidDownloader?.startSave) {
    const j = Number(dl.closest(".h-clip")?.dataset.hc);
    const kind = dl.dataset.hDl;
    const localClips = await loadLatestMobileClips();
    const rec = localClips.get(`${kind}_${j}`);
    if (rec?.blob) {
      e.preventDefault();
      download(rec.blob, rec.name || (kind === "v" ? "clip-vertical.mp4" : "clip.mp4"));
      return;
    }
  }
  const btn = e.target.closest("[data-h]"); if (!btn) return;
  const entryEl = btn.closest(".h-entry"), id = entryEl?.dataset.id, kind = btn.dataset.h;
  if (kind === "toggle") { histOpen.has(id) ? histOpen.delete(id) : histOpen.add(id); await renderHistory(); }
  else if (kind === "delete") {
    if (!armed(btn, "Tap again")) return;
    saveHistory(loadHistory().filter(x => x.id !== id)); histOpen.delete(id);
    if (MOBILE_CACHE) await clearLatestMobileClips();
    if (state.historyId === id) state.historyId = null;
    await renderHistory(); updateHistoryBadge(); toast("Deleted.");
  } else if (kind === "reuse") {
    const entry = loadHistory().find(x => x.id === id); if (!entry) return;
    $("#notes").value = entry.notes || ""; $("#yt").value = entry.url || "";
    notesChanged(); renderPrompt(); renderDetected(); closeHistory(); openStep(3); window.scrollTo({ top: 0, behavior: "smooth" });
    toast("Notes and link restored. Upload the video again to cut.");
  } else if (kind === "copy") {
    const cap = getCap(btn.closest(".h-clip").querySelector(".cap-block").dataset.src);
    if (cap) copyText(`${cap.caption}\n\n${cap.tagsText}`, "Caption and hashtags copied.");
  } else if (kind === "play") {
    stopPreviews();
    const box = btn.closest(".preview"); box._ph = box.innerHTML; box.classList.add("playing");
    box.innerHTML = `<iframe src="https://www.youtube.com/embed/${btn.dataset.vid}?start=${Number(btn.dataset.start) || 0}&autoplay=1&rel=0&playsinline=1" title="YouTube video player" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
  }
});
updateHistoryBadge();
window.addEventListener("beforeunload", () => {
  if (state.fileUrl) URL.revokeObjectURL(state.fileUrl);
  state.outputs.forEach(item => URL.revokeObjectURL(item.url));
  revokeHistUrls();
});
