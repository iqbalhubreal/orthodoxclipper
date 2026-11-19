"use strict";
/* Store-only ZIP writer (no library) and the Download all / Download vertical buttons. */
const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf) { let crc = -1; for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buf[i]) & 255]; return (crc ^ -1) >>> 0; }
async function makeZip(files) {
  const enc = new TextEncoder(), parts = [], central = [];
  const d = new Date();
  const dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name), size = f.blob.size;
    const crc = crc32(new Uint8Array(await f.blob.arrayBuffer()));
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true);
    lh.setUint16(10, dosTime, true); lh.setUint16(12, dosDate, true); lh.setUint32(14, crc, true);
    lh.setUint32(18, size, true); lh.setUint32(22, size, true); lh.setUint16(26, name.length, true);
    parts.push(lh.buffer, name, f.blob);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
    ch.setUint16(12, dosTime, true); ch.setUint16(14, dosDate, true); ch.setUint32(16, crc, true);
    ch.setUint32(20, size, true); ch.setUint32(24, size, true); ch.setUint16(28, name.length, true); ch.setUint32(42, offset, true);
    central.push(ch.buffer, name);
    offset += 30 + name.length + size;
    if (offset > 0xFFFFFF00) throw new Error("The clips are too large for one zip. Download them individually.");
  }
  const cdSize = central.reduce((n, p) => n + p.byteLength, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end.buffer], { type: "application/zip" });
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
