"use strict";
/* Store-only ZIP writer (no library) and Download horizontal / Download vertical / Download all buttons. */
const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf) { let crc = -1; for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buf[i]) & 255]; return (crc ^ -1) >>> 0; }
async function makeZip(files) {
  const enc = new TextEncoder(), entries = [], parts = []; let offset = 0;
  for (const f of files) {
    const data = f.blob ? new Uint8Array(await f.blob.arrayBuffer()) : f.bytes;
    const name = enc.encode(f.name), crc = crc32(data);
    const local = new Uint8Array(30 + name.length), v = new DataView(local.buffer);
    v.setUint32(0, 0x04034b50, true); v.setUint16(4, 20, true); v.setUint16(8, 0, true);
    v.setUint32(14, crc, true); v.setUint32(18, data.length, true); v.setUint32(22, data.length, true);
    v.setUint16(26, name.length, true); local.set(name, 30);
    parts.push(local, data); entries.push({ name, crc, size: data.length, offset });
    offset += local.length + data.length;
  }
  const cdStart = offset;
  for (const e of entries) {
    const cd = new Uint8Array(46 + e.name.length), v = new DataView(cd.buffer);
    v.setUint32(0, 0x02014b50, true); v.setUint16(4, 20, true); v.setUint16(6, 20, true);
    v.setUint32(16, e.crc, true); v.setUint32(20, e.size, true); v.setUint32(24, e.size, true);
    v.setUint16(28, e.name.length, true); v.setUint32(42, e.offset, true); cd.set(e.name, 46);
    parts.push(cd); offset += cd.length;
  }
  const end = new Uint8Array(22), v = new DataView(end.buffer);
  v.setUint32(0, 0x06054b50, true);
  v.setUint16(8, entries.length, true); v.setUint16(10, entries.length, true);
  v.setUint32(12, offset - cdStart, true); v.setUint32(16, cdStart, true);
  parts.push(end);
  return new Blob(parts, { type: "application/zip" });
}
async function downloadZip() {
  if (!state.outputs.length) return;
  const btn = $("#zip"); btn.disabled = true; btn.textContent = "Preparing zip...";
  $("#status").textContent = "Preparing zip file...";
  toast("Preparing zip file...");
  try {
    const files = state.outputs.flatMap(o => [{ name: o.name, blob: o.blob }, ...(o.vBlob ? [{ name: o.vName, blob: o.vBlob }] : [])]);
    const captions = state.outputs.map((o, i) => `Clip ${i + 1}: ${o.title}  (${formatTime(o.start)}-${formatTime(o.end)})\n${shareText(o)}`).join("\n\n---\n\n");
    files.push({ name: "captions.txt", blob: new Blob([captions], { type: "text/plain" }) });
    await download(await makeZip(files), "orthodox-clips.zip");
    $("#status").textContent = "Zip ready.";
  } catch (error) { toast(error.message || "Could not build the zip.", true); $("#status").textContent = "Could not prepare zip."; }
  finally { btn.disabled = false; btn.textContent = "Download all (.zip)"; }
}
async function downloadHorizontalZip() {
  if (!state.outputs.length) return;
  const btn = $("#zip-horiz"); btn.disabled = true; btn.textContent = "Preparing zip...";
  $("#status").textContent = "Preparing horizontal zip file...";
  toast("Preparing horizontal zip file...");
  try {
    const files = state.outputs.map(o => ({ name: o.name, blob: o.blob }));
    const captions = state.outputs.map((o, i) => `Clip ${i + 1}: ${o.title}  (${formatTime(o.start)}-${formatTime(o.end)})\n${shareText(o)}`).join("\n\n---\n\n");
    files.push({ name: "captions.txt", blob: new Blob([captions], { type: "text/plain" }) });
    await download(await makeZip(files), "orthodox-horizontal-clips.zip");
    $("#status").textContent = "Horizontal zip ready.";
  } catch (error) { toast(error.message || "Could not build the zip.", true); $("#status").textContent = "Could not prepare horizontal zip."; }
  finally { btn.disabled = false; btn.textContent = "Download horizontal (.zip)"; }
}
async function downloadVerticalZip() {
  const items = state.outputs.filter(o => o.vBlob);
  if (!items.length) return;
  const btn = $("#zip-vert"); btn.disabled = true; btn.textContent = "Preparing zip...";
  $("#status").textContent = "Preparing vertical zip file...";
  toast("Preparing vertical zip file...");
  try {
    const files = items.map(o => ({ name: o.vName, blob: o.vBlob }));
    const captions = items.map((o, i) => `Clip ${i + 1}: ${o.title}  (${formatTime(o.start)}-${formatTime(o.end)})\n${shareText(o)}`).join("\n\n---\n\n");
    files.push({ name: "captions.txt", blob: new Blob([captions], { type: "text/plain" }) });
    await download(await makeZip(files), "orthodox-vertical-clips.zip");
    $("#status").textContent = "Vertical zip ready.";
  } catch (error) { toast(error.message || "Could not build the zip.", true); $("#status").textContent = "Could not prepare vertical zip."; }
  finally { btn.disabled = false; btn.textContent = "Download vertical (.zip)"; }
}
