"use strict";
/* History stored in this browser (link, notes, captions; never the video). */
/* ---------- History (stored only in this browser; videos are never stored) ---------- */
const HIST_KEY = "clipper.history";
const histOpen = new Set();
function loadHistory() {
  try { const list = JSON.parse(localStorage.getItem(HIST_KEY) || "[]"); return Array.isArray(list) ? list : []; }
  catch { return []; }
}
function saveHistory(list) {
  for (const keep of [100, 40, 10]) {
    try { localStorage.setItem(HIST_KEY, JSON.stringify(list.slice(0, keep))); return true; } catch {}
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
function syncHistory() {
  if (!state.outputs.length) return;
  const list = loadHistory();
  let entry = list.find(x => x.id === state.historyId);
  if (!entry) {
    entry = { id: `h${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, ts: Date.now() };
    state.historyId = entry.id; list.unshift(entry);
  }
  Object.assign(entry, {
    url: state.sessionUrl, videoId: ytId(state.sessionUrl), fileName: state.file?.name || "", notes: state.sessionNotes,
    clips: state.outputs.map(o => ({ title: o.title, start: o.start, end: o.end, note: o.note, caption: o.caption, tagsText: o.tagsText }))
  });
  saveHistory(list); updateHistoryBadge();
}
function updateHistoryBadge() { const n = loadHistory().length; $("#hist-count").textContent = n ? String(n) : ""; }
function previewPlaceholder(vid, start) {
  return vid
    ? `<div class="ph"><button class="btn primary" type="button" data-h="play" data-vid="${vid}" data-start="${Math.floor(start)}">▶ Play from ${formatTime(start)}</button><span>Video not stored. Plays from YouTube.</span></div>`
    : `<div class="ph"><span>Video not stored.</span><span>Add the YouTube link next time to play this moment here.</span></div>`;
}
function entryHTML(e) {
  const open = histOpen.has(e.id), clips = e.clips || [];
  const when = new Date(e.ts).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
  const link = /^https?:\/\//i.test(e.url || "") ? `<a href="${escapeHTML(e.url)}" target="_blank" rel="noopener">${escapeHTML(e.url)}</a>` : escapeHTML(e.url || "No YouTube link saved");
  let body = "";
  if (open) {
    body = `<div class="h-body">
      ${e.fileName ? `<p class="hint">Video file: ${escapeHTML(e.fileName)}</p>` : ""}
      <details><summary>Pasted notes</summary><pre>${escapeHTML(e.notes || "")}</pre></details>
      <div class="clip-actions"><button class="btn" type="button" data-h="reuse">Use these notes again</button></div>
      ${clips.map((c, j) => `<div class="h-clip">
        <div class="clip-head"><div class="clip-title">${escapeHTML(c.title || `Clip ${j + 1}`)}</div><div class="clip-time">${formatTime(c.start)}–${formatTime(c.end)}</div></div>
        <div class="preview">${previewPlaceholder(e.videoId, c.start)}</div>
        ${capBlockHTML(c.caption, c.tagsText, `hist:${e.id}:${j}`)}
        <div class="clip-actions"><button class="btn primary" type="button" data-h="copy">Copy caption + hashtags</button></div>
      </div>`).join("")}
    </div>`;
  }
  return `<article class="h-entry" data-id="${e.id}">
    <div class="h-head"><button class="h-toggle" type="button" data-h="toggle" aria-expanded="${open}"><div class="h-title">${open ? "▾" : "▸"} ${clips.length} clip${clips.length === 1 ? "" : "s"} · ${escapeHTML(when)}</div><div class="h-sub">${link}</div></button><button class="btn del" type="button" data-h="delete">Delete</button></div>
    ${body}
  </article>`;
}
function renderHistory() {
  const list = loadHistory();
  $("#h-clear").hidden = !list.length;
  $("#h-list").innerHTML = list.length ? list.map(entryHTML).join("") : `<p class="h-empty">No history yet. Finished clips will appear here.</p>`;
}
function openHistory() { renderHistory(); $("#history").hidden = false; }
function closeHistory() { $("#history").hidden = true; $("#h-list").innerHTML = ""; } // also stops any playing video
function armed(button, label) { // two-tap confirmation without browser dialogs
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
$("#h-clear").addEventListener("click", e => {
  if (!armed(e.currentTarget, "Tap again to delete all")) return;
  try { localStorage.removeItem(HIST_KEY); } catch {}
  histOpen.clear(); renderHistory(); updateHistoryBadge(); toast("History deleted.");
});
$("#h-list").addEventListener("click", e => {
  const btn = e.target.closest("[data-h]"); if (!btn) return;
  const entryEl = btn.closest(".h-entry"), id = entryEl?.dataset.id, kind = btn.dataset.h;
  if (kind === "toggle") { histOpen.has(id) ? histOpen.delete(id) : histOpen.add(id); renderHistory(); }
  else if (kind === "delete") {
    if (!armed(btn, "Tap again")) return;
    saveHistory(loadHistory().filter(x => x.id !== id)); histOpen.delete(id);
    if (state.historyId === id) state.historyId = null;
    renderHistory(); updateHistoryBadge(); toast("Deleted.");
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
});
