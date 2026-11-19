"use strict";
/* Wires up buttons and inputs. Runs after everything else is defined. */
window.__appHandlesClipDownload = true;
try { $("#notes").value = localStorage.getItem("clipper.notes") || ""; } catch {}
$("#notes").addEventListener("input", notesChanged);
$("#maxlen").addEventListener("change", () => { renderPrompt(); renderDetected(); });
$("#yt").addEventListener("input", renderPrompt);
$("#copy-prompt").addEventListener("click", () => copyText(buildPrompt(), $("#yt").value.trim() ? "Prompt copied. Paste it into Gemini." : "Prompt copied. Replace [PASTE YOUTUBE LINK HERE] with your link."));
$("#paste").addEventListener("click", async () => {
  try {
    const text = await navigator.clipboard.readText();
    if (!text.trim()) return toast("The clipboard is empty.", true);
    $("#notes").value = text; notesChanged(); toast("Pasted.");
  } catch { toast("Clipboard access was blocked. Long-press the box and choose Paste.", true); }
});
$("#clear").addEventListener("click", () => { $("#notes").value = ""; notesChanged(); });
function setMode(value) {
  $("#mode").value = value;
  document.querySelectorAll(".seg-btn").forEach(btn => { const on = btn.dataset.mode === value; btn.classList.toggle("on", on); btn.setAttribute("aria-checked", String(on)); });
  updateModeHint();
}
document.querySelectorAll(".seg-btn").forEach(btn => btn.addEventListener("click", () => setMode(btn.dataset.mode)));
if (IS_ANDROID_APP) {
  setMode("accurate");
  const modeRow = $(".mode-row");
  if (modeRow) modeRow.hidden = true;
  const appNote = $("#app-note");
  if (appNote) appNote.hidden = true;
} else {
  setMode("fast");
}
renderPrompt();
renderDetected();
$("#go").addEventListener("click", run);
$("#cancel").addEventListener("click", cancel);
$("#busy-min").addEventListener("click", () => setBusyMinimized(true));
$("#busy-max").addEventListener("click", () => setBusyMinimized(false));
$("#zip").addEventListener("click", downloadZip);
$("#zip-horiz").addEventListener("click", downloadHorizontalZip);
$("#zip-vert").addEventListener("click", downloadVerticalZip);
$("#file").addEventListener("change", e => selectFile(e.target.files?.[0]));
const drop = $("#drop");
["dragenter","dragover"].forEach(type => drop.addEventListener(type, e => { e.preventDefault(); drop.classList.add("over"); }));
["dragleave","drop"].forEach(type => drop.addEventListener(type, e => { e.preventDefault(); drop.classList.remove("over"); }));
drop.addEventListener("drop", e => selectFile(e.dataTransfer.files?.[0]));
$("#clip-list").addEventListener("click", e => {
  const dl = e.target.closest("a[download]");
  if (dl && window.AndroidDownloader?.startSave) {
    const card = dl.closest(".clip");
    const item = card && state.outputs[Number(card.dataset.i)];
    if (item) {
      e.preventDefault();
      const isVert = !!dl.closest(".vbox");
      download(isVert ? item.vBlob : item.blob, isVert ? item.vName : item.name);
      return;
    }
  }
  const copy = e.target.closest("button[data-copy]");
  if (copy) return copyCaption(state.outputs[Number(copy.dataset.copy)]);
  const vert = e.target.closest("button[data-vert]");
  if (vert) return openEditor(Number(vert.dataset.vert));
  const vedit = e.target.closest("button[data-vedit]");
  if (vedit) return openVerticalEditor(Number(vedit.dataset.vedit), { postVertical: true });
  const regen = e.target.closest("button[data-regen]");
  if (regen) regenerate(Number(regen.dataset.regen), regen);
});
