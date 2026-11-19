"use strict";
/* Timestamp parsing, the Gemini prompt, and the live list of recognized clips. */
function formatTime(seconds) {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? `${h}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}` : `${m}:${String(sec).padStart(2,"0")}`;
}
function parseTime(value) {
  const parts = String(value).trim().split(":").map(Number);
  if (parts.some(n => !Number.isInteger(n) || n < 0)) return NaN;
  if (parts.length === 2 && parts[1] < 60) return parts[0] * 60 + parts[1];
  if (parts.length === 3 && parts[1] < 60 && parts[2] < 60) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return NaN;
}
/* Reads Gemini-style text: one clip per line (a time range anywhere near the start), extra lines join the note. */
function parseNotes(text) {
  const clips = [];
  let open = false; // extra lines only continue a note until the next blank line or heading
  const clean = String(text).replace(/\*\*|__|`/g, "").replace(/\r/g, "");
  for (const raw of clean.split("\n")) {
    const line = raw.trim();
    if (!line) { open = false; continue; }
    const m = RANGE_RE.exec(line);
    if (m && m.index <= MAX_BEFORE) {
      const before = line.slice(0, m.index).replace(/^(?:[>#*•\-]+\s*|\d+[.)]\s+)+/, "").replace(/^[\[(\s]+/, "").replace(/[\s([{:|\-–—]+$/, "");
      const after = line.slice(m.index + m[0].length).replace(/^[\s|:;,.\])}>\-–—]+/, "");
      clips.push({ start: parseTime(m[1]), end: parseTime(m[2]), note: [before, after].filter(Boolean).join(": ") });
      open = true;
    } else if (/^#/.test(line)) { open = false;
    } else if (clips.length && open) {
      const last = clips[clips.length - 1];
      last.note += (last.note ? " " : "") + line.replace(/^[-*•]\s+/, "");
    }
  }
  clips.forEach((c, i) => {
    if (!Number.isFinite(c.start) || !Number.isFinite(c.end) || c.end <= c.start) c.error = `Check the timestamp range for clip ${i + 1}.`;
    else if (!c.note) c.error = `Add a short note explaining clip ${i + 1}.`;
  });
  return clips;
}
function validClips() {
  const clips = parseNotes($("#notes").value);
  if (!clips.length) throw new Error("Paste at least one timestamp range, such as 00:12 - 00:48 | your note.");
  if (clips.length > 30) throw new Error("Please keep each batch to 30 clips or fewer.");
  const bad = clips.find(c => c.error);
  if (bad) throw new Error(bad.error);
  return clips.map(({ start, end, note }) => ({ start, end, note }));
}
function findOverlaps(clips) {
  const issues = [];
  for (let i = 0; i < clips.length; i++) for (let j = i + 1; j < clips.length; j++) {
    const a = clips[i], b = clips[j];
    if (a.start < b.end && b.start < a.end) issues.push(`${i + 1} & ${j + 1}`);
  }
  return issues.length ? `Heads up: clips ${issues.slice(0, 4).join(", ")}${issues.length > 4 ? "…" : ""} overlap.` : "";
}

/* Gemini prompt + live preview of recognized clips */
function buildPrompt() {
  const link = $("#yt").value.trim() || "[PASTE YOUTUBE LINK HERE]";
  const mins = $("#maxlen").value;
  return `Watch this YouTube video: ${link}

Find the most iconic, powerful and shareable moments in it that would work as standalone short clips.

Rules:
- Every clip must be ${mins} minute${mins === "1" ? "" : "s"} or shorter, and at least 15 seconds.
- Start at the beginning of a sentence or thought and end at a natural stopping point, so the clip makes sense without extra context.
- Use exact timestamps from the video in MM:SS format (H:MM:SS if the video is over an hour).
- List clips in chronological order and do not let them overlap.
- Pick only genuinely strong moments (usually 5 to 15).
- For each clip, write 2 to 3 detailed sentences explaining the exact claim, argument, question, verse/reference, or sharp exchange that happens—be specific about what was actually said and why it challenges or surprises the listener, so a direct, debate-sparking caption can be written from it.

Output only a plain list, one clip per line, in exactly this format. No bold, no numbering, no headings, no intro or closing text:
00:12 - 00:48 | Detailed note of what is said, the core claim/question, and why it hits hard
01:04 - 02:39 | Detailed note of what is said, the core claim/question, and why it hits hard`;
}
function renderPrompt() { $("#prompt-box").textContent = buildPrompt(); }
function notesChanged() {
  try { localStorage.setItem("clipper.notes", $("#notes").value); } catch {}
  renderDetected();
}
function renderDetected() {
  const box = $("#detected"), text = $("#notes").value;
  const clips = parseNotes(text);
  const ok = clips.length > 0 && !clips.some(c => c.error);
  $("#n2").classList.toggle("done", !!state.file); $("#n2").textContent = state.file ? "✓" : "2";
  $("#n3").classList.toggle("done", ok); $("#n3").textContent = ok ? "✓" : "3";
  // short summaries, shown in the step headers while a step is collapsed
  $("#s2-note").textContent = state.file ? state.file.name : "";
  $("#s3-note").textContent = clips.length ? `${clips.length} clip${clips.length > 1 ? "s" : ""}` : "";
  $("#go").textContent = ok ? `Create ${clips.length} clip${clips.length > 1 ? "s" : ""} & captions` : "Create clips & captions";
  if (!text.trim()) { box.hidden = true; return; }
  box.hidden = false;
  if (!clips.length) { box.innerHTML = `<div class="det-head bad">No timestamps recognized yet. Each clip needs a range like 00:12 - 00:48 near the start of its line.</div>`; return; }
  const max = Number($("#maxlen").value) * 60;
  const overlap = findOverlaps(clips);
  const rows = clips.map(c => {
    const flags = [];
    if (c.error) flags.push(["bad", c.error]);
    else {
      if (c.end - c.start > max + 1) flags.push(["", `Longer than ${$("#maxlen").value} min`]);
      if (state.duration && c.end > state.duration + 0.5) flags.push(["bad", "Ends after your video"]);
    }
    return `<li><div><span class="det-time">${Number.isFinite(c.start) ? formatTime(c.start) : "?"}–${Number.isFinite(c.end) ? formatTime(c.end) : "?"}</span><span class="det-len">${c.end > c.start ? formatTime(c.end - c.start) + " long" : ""}</span></div><div class="det-note">${escapeHTML(c.note) || "(no note)"}</div>${flags.map(([k, t]) => `<div class="det-flag ${k}">⚠ ${escapeHTML(t)}</div>`).join("")}</li>`;
  }).join("");
  box.innerHTML = `<div class="det-head ${ok ? "good" : "bad"}">${clips.length} clip${clips.length > 1 ? "s" : ""} recognized${overlap ? " · " + escapeHTML(overlap) : ""}</div><ul>${rows}</ul>`;
}
