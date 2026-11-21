"use strict";
/* Saved framing + stage templates (crop boxes, layout, fit, 2.5D stage preset). Stored in this browser only. */
const TPL_KEY = "clipper.templates";
const MAX_TEMPLATES = 20;
const tplClone = o => JSON.parse(JSON.stringify(o));
let tplDelArmed = 0;

function loadTemplates() {
  try {
    const list = JSON.parse(localStorage.getItem(TPL_KEY) || "[]");
    return Array.isArray(list) ? list.filter(t => t && t.name && t.frame) : [];
  } catch { return []; }
}
function saveTemplates(list) {
  try { localStorage.setItem(TPL_KEY, JSON.stringify(list.slice(0, MAX_TEMPLATES))); return true; }
  catch { toast("Could not save the template (browser storage is full or blocked).", true); return false; }
}
function resetTplDelete() {
  clearTimeout(tplDelArmed);
  tplDelArmed = 0;
  const del = $("#ed-tpl-del");
  if (del) del.textContent = "Delete";
}
function renderTemplateList(selectName) {
  const list = loadTemplates(), sel = $("#ed-tpl-list");
  sel.innerHTML = list.length
    ? list.map(t => `<option value="${escapeHTML(t.name)}">${escapeHTML(t.name)}</option>`).join("")
    : `<option value="">No templates yet</option>`;
  if (selectName) sel.value = selectName;
  $("#ed-tpl-apply").disabled = $("#ed-tpl-del").disabled = !list.length;
  resetTplDelete();
}
function closeTplSaveRow() {
  $("#ed-tpl-save-row").hidden = true;
  $("#ed-tpl-name").value = "";
}
function commitTplSave() {
  const name = ($("#ed-tpl-name").value || "").trim().slice(0, 40);
  if (!name) return $("#ed-tpl-name").focus();
  const f = tplClone(ed.frame);
  const entry = { name, savedAt: Date.now(), aspect: state.vw / state.vh, frame: f };
  const list = loadTemplates(), at = list.findIndex(t => t.name.toLowerCase() === name.toLowerCase());
  if (at >= 0) list[at] = entry;
  else if (list.length >= MAX_TEMPLATES) return toast(`You can keep up to ${MAX_TEMPLATES} templates. Delete one first.`, true);
  else list.push(entry);
  if (saveTemplates(list)) {
    closeTplSaveRow();
    renderTemplateList(name);
    toast(at >= 0 ? `Updated "${name}".` : `Saved "${name}".`);
  }
}
$("#ed-tpl-save").addEventListener("click", () => {
  const row = $("#ed-tpl-save-row");
  if (!row.hidden) return closeTplSaveRow();
  resetTplDelete();
  $("#ed-tpl-name").value = $("#ed-tpl-list").value || "";
  row.hidden = false;
  $("#ed-tpl-name").focus();
  $("#ed-tpl-name").select();
});
$("#ed-tpl-save-ok").addEventListener("click", commitTplSave);
$("#ed-tpl-save-cancel").addEventListener("click", closeTplSaveRow);
$("#ed-tpl-name").addEventListener("keydown", e => {
  if (e.key === "Enter") { e.preventDefault(); commitTplSave(); }
  else if (e.key === "Escape") { e.stopPropagation(); closeTplSaveRow(); }
});
$("#ed-tpl-list").addEventListener("change", resetTplDelete);
$("#ed-tpl-apply").addEventListener("click", () => {
  const t = loadTemplates().find(x => x.name === $("#ed-tpl-list").value);
  if (!t) return;
  previewStop();
  const stage = normalizeStageConfig(t.frame.stage || {});
  ed.frame = { fit: !!t.frame.fit, layout: t.frame.layout || "stack", boxes: tplClone(t.frame.boxes || getFrameBoxes(defaultFrame())), stage };
  ed.sel = 0;
  edSyncUI(); drawEditor();
  const now = state.vw / state.vh;
  toast(t.aspect && Math.abs(now / t.aspect - 1) > 0.05
    ? `Applied "${t.name}". This video has a different shape, so check the boxes.`
    : `Applied "${t.name}".`);
});
$("#ed-tpl-del").addEventListener("click", () => {
  const name = $("#ed-tpl-list").value;
  if (!name) return;
  if (!tplDelArmed) {
    $("#ed-tpl-del").textContent = "Confirm?";
    tplDelArmed = setTimeout(resetTplDelete, 3000);
    return;
  }
  resetTplDelete();
  saveTemplates(loadTemplates().filter(t => t.name !== name));
  renderTemplateList();
  toast(`Deleted "${name}".`);
});
renderTemplateList();
