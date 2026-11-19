"use strict";
/* Caption editing and the result cards. */
function capBlockHTML(caption, tagsText, src) {
  return `<div class="cap-block" data-src="${src}">
      <div class="caption-label">Caption and hashtags <span style="font-weight:400">(tap to edit)</span></div>
      <div class="cap-view" tabindex="0" role="button" aria-expanded="false"><p class="cap-text">${escapeHTML(caption) || "(no caption)"}</p><p class="cap-tags">${escapeHTML(tagsText)}</p></div>
      <div class="cap-tools" hidden><button class="btn" type="button" data-act="edit">✎ Edit caption</button></div>
      <div class="cap-editor" hidden>
        <textarea class="caption-edit" aria-label="Caption">${escapeHTML(caption)}</textarea>
        <input class="tags-edit" aria-label="Hashtags" value="${escapeHTML(tagsText)}" autocapitalize="off" autocomplete="off">
        <div class="clip-actions"><button class="btn primary" type="button" data-act="save">Save</button><button class="btn" type="button" data-act="cancel">Cancel</button></div>
      </div>
    </div>`;
}
function refreshCapView(block, caption, tagsText) {
  if (!block) return;
  block.querySelector(".cap-text").textContent = caption || "(no caption)";
  block.querySelector(".cap-tags").textContent = tagsText;
  block.querySelector(".caption-edit").value = caption;
  block.querySelector(".tags-edit").value = tagsText;
}
function getCap(src) {
  const [kind, a, b] = src.split(":");
  if (kind === "out") { const o = state.outputs[Number(a)]; return o && { caption: o.caption, tagsText: o.tagsText }; }
  const c = loadHistory().find(x => x.id === a)?.clips?.[Number(b)];
  return c && { caption: c.caption, tagsText: c.tagsText };
}
function setCap(src, caption, tagsText) {
  const [kind, a, b] = src.split(":");
  if (kind === "out") {
    const o = state.outputs[Number(a)]; if (!o) return;
    o.caption = caption; o.tagsText = tagsText; syncHistory();
    return;
  }
  const list = loadHistory(), c = list.find(x => x.id === a)?.clips?.[Number(b)];
  if (!c) return;
  c.caption = caption; c.tagsText = tagsText; saveHistory(list);
  const live = state.historyId === a && state.outputs[Number(b)];
  if (live) { live.caption = caption; live.tagsText = tagsText; refreshCapView(document.querySelector(`#clip-list .cap-block[data-src="out:${b}"]`), caption, tagsText); }
}
function onCaptionClick(e) {
  const block = e.target.closest(".cap-block"); if (!block) return;
  const view = block.querySelector(".cap-view"), tools = block.querySelector(".cap-tools"), editor = block.querySelector(".cap-editor");
  const act = e.target.closest("[data-act]")?.dataset.act;
  if (act === "edit") { view.hidden = true; tools.hidden = true; editor.hidden = false; block.querySelector(".caption-edit").focus(); }
  else if (act === "save") {
    const caption = block.querySelector(".caption-edit").value.trim(), tags = block.querySelector(".tags-edit").value.trim();
    setCap(block.dataset.src, caption, tags); refreshCapView(block, caption, tags);
    editor.hidden = true; view.hidden = false; view.setAttribute("aria-expanded", "false"); toast("Caption saved.");
  } else if (act === "cancel") {
    const cur = getCap(block.dataset.src); if (cur) refreshCapView(block, cur.caption, cur.tagsText);
    editor.hidden = true; view.hidden = false;
  } else if (e.target.closest(".cap-view")) { tools.hidden = !tools.hidden; view.setAttribute("aria-expanded", String(!tools.hidden)); }
}
document.addEventListener("click", onCaptionClick);
document.addEventListener("keydown", e => { if ((e.key === "Enter" || e.key === " ") && e.target.classList?.contains("cap-view")) { e.preventDefault(); onCaptionClick(e); } });

function cardHTML(item, i) {
  return `<article class="clip" data-i="${i}">
      <div class="clip-head"><div class="clip-title">${escapeHTML(item.title || `Clip ${i + 1}`)}</div><div class="clip-time">${formatTime(item.start)}–${formatTime(item.end)} (±${PAD}s)</div></div>
      <video controls playsinline preload="metadata" src="${item.url}"></video>
      <div class="cut-time">Cut in ${item.cutSeconds.toFixed(1)} s</div>
      ${capBlockHTML(item.caption, item.tagsText, `out:${i}`)}
      <div class="clip-actions">
        <button class="btn primary" data-copy="${i}" type="button">Copy caption + hashtags</button>
        <a class="btn" href="${item.url}" download="${escapeHTML(item.name)}">Download MP4</a>
        <button class="btn" data-regen="${i}" type="button">Rewrite caption</button>
        <button class="btn" data-vert="${i}" type="button">Make vertical (optional)</button>
      </div>
      <div class="vbox" id="vbox-${i}" hidden></div>
    </article>`;
}
function updateResultsHeader() {
  $("#results").hidden = !state.outputs.length;
  $("#result-count").textContent = `${state.outputs.length} ready`;
}
function resetOutputs() {
  state.outputs.forEach(item => { URL.revokeObjectURL(item.url); if (item.vUrl) URL.revokeObjectURL(item.vUrl); });
  state.outputs = []; state.historyId = null;
  $("#clip-list").innerHTML = "";
  updateResultsHeader();
}
