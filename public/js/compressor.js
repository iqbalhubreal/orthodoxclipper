"use strict";
/* Video compressor: shared WebCodecs / FFmpeg / optional Android Media3 bridge + standalone device compressor modal. */
let nativeCompressSeq = 0;
const nativeCompressPending = new Map();
window.__nativeCompressDone = (id, ok, value) => {
  const p = nativeCompressPending.get(id);
  if (!p) return;
  nativeCompressPending.delete(id);
  if (ok) p.resolve(value);
  else p.reject(new Error(value || "Native compress failed"));
};
window.__nativeCompressProgress = (id, pct) => {
  const p = nativeCompressPending.get(id);
  if (p?.onProgress) p.onProgress(clamp(Number(pct) || 0, 0, 100) / 100);
};

async function compressWithAndroidNative(blob, compressCfg, onProgress) {
  if (!window.AndroidClipper?.compressVideo || !window.AndroidClipper?.startCompressInput || !window.AndroidClipper?.appendCompressInput) return null;
  const id = `cmp_${++nativeCompressSeq}`;
  try {
    window.AndroidClipper.startCompressInput(id);
    const CHUNK = 512 * 1024;
    for (let offset = 0; offset < blob.size; offset += CHUNK) {
      window.AndroidClipper.appendCompressInput(id, await blobSliceToBase64(blob.slice(offset, offset + CHUNK)));
    }
    const fileName = await new Promise((resolve, reject) => {
      nativeCompressPending.set(id, { resolve, reject, onProgress });
      window.AndroidClipper.compressVideo(
        id,
        Number(compressCfg.targetHeight) || 720,
        Number(compressCfg.videoBitrate || compressCfg.bitrate) || 2_000_000,
        compressCfg.useHevc !== false
      );
    });
    const res = await fetch(`/__native_clip__/${encodeURIComponent(fileName)}`, { cache: "no-store" });
    if (!res.ok) return null;
    return await res.blob();
  } catch (err) {
    console.warn("Native Media3 compressor unavailable, using WebCodecs/FFmpeg:", err);
    return null;
  }
}

async function compressWithWebCodecs(blob, opts, onProgress) {
  const mb = await getMediabunny();
  if (!mb || state.cancelled) return null;
  const { Input, Output, Conversion, ALL_FORMATS, BlobSource, Mp4OutputFormat, BufferTarget } = mb;
  const targetHeight = [480, 720, 1080].includes(Number(opts.targetHeight)) ? Number(opts.targetHeight) : 720;
  const bitrate = [1_000_000, 2_000_000, 4_000_000].includes(Number(opts.videoBitrate)) ? Number(opts.videoBitrate) : 2_000_000;
  const tryCodecs = opts.useHevc !== false ? ["hevc", "avc"] : ["avc"];

  for (const codec of tryCodecs) {
    const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(blob) });
    const output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() });
    try {
      const trk = await input.getPrimaryVideoTrack();
      const srcW = trk?.displayWidth || 0;
      const srcH = trk?.displayHeight || 0;
      const videoOpts = {
        codec,
        bitrate,
        hardwareAcceleration: "prefer-hardware",
      };
      if (srcW > 0 && srcH > 0 && srcH > targetHeight) {
        const even = n => Math.max(2, Math.round(n / 2) * 2);
        videoOpts.height = even(targetHeight);
        videoOpts.width = even(srcW * (targetHeight / srcH));
      } else if (!srcH) {
        videoOpts.height = targetHeight;
      }
      const conversion = await Conversion.init({
        input,
        output,
        video: videoOpts,
        audio: { codec: "aac", bitrate: 128_000 },
      });
      if (!conversion.isValid) continue;
      if (onProgress) conversion.onProgress = onProgress;
      state.activeConversion = conversion;
      await conversion.execute();
      return new Blob([output.target.buffer], { type: "video/mp4" });
    } catch (err) {
      if (state.cancelled) throw err;
      if (codec === "hevc") continue;
      console.warn("WebCodecs compression unavailable, falling back to FFmpeg:", err);
      return null;
    } finally {
      state.activeConversion = null;
      try { input.dispose?.(); } catch {}
    }
  }
  return null;
}

async function compressWithFFmpeg(blob, opts, onProgress) {
  const ff = await Promise.race([getFFmpeg(), state.cancelPromise]);
  const targetHeight = [480, 720, 1080].includes(Number(opts.targetHeight)) ? Number(opts.targetHeight) : 720;
  const bitrate = [1_000_000, 2_000_000, 4_000_000].includes(Number(opts.videoBitrate)) ? Number(opts.videoBitrate) : 2_000_000;
  const brK = `${Math.max(400, Math.round(bitrate / 1000))}k`;
  const bufK = `${Math.round(bitrate / 500)}k`;
  const uid = Math.random().toString(36).slice(2, 8);
  const inName = `cmp_in_${uid}.mp4`, outName = `cmp_out_${uid}.mp4`;
  await ff.writeFile(inName, new Uint8Array(await blob.arrayBuffer()));
  if (onProgress) onProgress(0.15);
  const args = [
    "-i", inName,
    "-vf", `scale=-2:'min(ih,${targetHeight})'`,
    "-c:v", "libx264", "-preset", "veryfast", "-b:v", brK, "-maxrate", brK, "-bufsize", bufK,
    "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", outName
  ];
  const code = await Promise.race([ff.exec(args), state.cancelPromise]);
  if (code !== 0) {
    try { await ff.deleteFile(inName); } catch {}
    throw new Error("Could not compress this video.");
  }
  const bytes = await ff.readFile(outName);
  try { await ff.deleteFile(inName); await ff.deleteFile(outName); } catch {}
  if (onProgress) onProgress(1);
  return new Blob([bytes], { type: "video/mp4" });
}

async function compressVideoBlob(blob, opts = {}, onProgress = null) {
  const cfg = {
    targetHeight: [480, 720, 1080].includes(Number(opts.targetHeight)) ? Number(opts.targetHeight) : 720,
    videoBitrate: [1_000_000, 2_000_000, 4_000_000].includes(Number(opts.videoBitrate)) ? Number(opts.videoBitrate) : 2_000_000,
    useHevc: opts.useHevc !== false,
  };
  if (window.AndroidClipper?.compressVideo) {
    const nativeBlob = await Promise.race([compressWithAndroidNative(blob, cfg, onProgress), state.cancelPromise]);
    if (nativeBlob) return nativeBlob;
  }
  const wcBlob = await Promise.race([compressWithWebCodecs(blob, cfg, onProgress), state.cancelPromise]);
  if (wcBlob) return wcBlob;
  return await compressWithFFmpeg(blob, cfg, onProgress);
}

/* ---- Standalone Device Video Compressor Modal ---- */
const cmpState = { busy: false, urls: [] };
function cmpSyncUI() {
  const c = (typeof loadClipperPrefs === "function" ? loadClipperPrefs().deviceCompress : null) || { targetHeight: 720, videoBitrate: 2_000_000, useHevc: true };
  if ($("#cmp-height")) $("#cmp-height").value = String(c.targetHeight || 720);
  if ($("#cmp-bitrate")) $("#cmp-bitrate").value = String(c.videoBitrate || 2_000_000);
  if ($("#cmp-hevc")) $("#cmp-hevc").checked = c.useHevc !== false;
}
function cmpSavePrefs() {
  if (typeof saveClipperPrefs !== "function") return;
  saveClipperPrefs({
    deviceCompress: {
      targetHeight: Number($("#cmp-height")?.value) || 720,
      videoBitrate: Number($("#cmp-bitrate")?.value) || 2_000_000,
      useHevc: $("#cmp-hevc")?.checked !== false,
    },
  });
}
function cmpSetProg(pct, label, show) {
  const wrap = $("#cmp-prog");
  if (!wrap) return;
  wrap.hidden = !show;
  const p = clamp(Math.round(pct), 0, 100);
  if ($("#cmp-prog-fill")) $("#cmp-prog-fill").style.width = `${p}%`;
  if ($("#cmp-prog-pct")) $("#cmp-prog-pct").textContent = `${p}%`;
  if ($("#cmp-prog-lbl") && label) $("#cmp-prog-lbl").textContent = label;
}
function openCompressorModal() {
  cmpSyncUI();
  cmpSetProg(0, "", false);
  const modal = $("#compressor-modal");
  if (!modal) return;
  modal.hidden = false;
  document.body.style.overflow = "hidden";
}
function closeCompressorModal() {
  if (cmpState.busy) return;
  const modal = $("#compressor-modal");
  if (modal) modal.hidden = true;
  document.body.style.overflow = "";
}

$("#open-compressor")?.addEventListener("click", openCompressorModal);
$("#cmp-close")?.addEventListener("click", closeCompressorModal);
["#cmp-height", "#cmp-bitrate", "#cmp-hevc"].forEach(sel => {
  $(sel)?.addEventListener("change", cmpSavePrefs);
});
$("#cmp-pick")?.addEventListener("click", () => {
  if (cmpState.busy) return;
  $("#cmp-file")?.click();
});
$("#cmp-file")?.addEventListener("change", async e => {
  const files = [...(e.target.files || [])];
  e.target.value = "";
  if (!files.length || cmpState.busy) return;
  cmpSavePrefs();
  const opts = {
    targetHeight: Number($("#cmp-height")?.value) || 720,
    videoBitrate: Number($("#cmp-bitrate")?.value) || 2_000_000,
    useHevc: $("#cmp-hevc")?.checked !== false,
  };
  cmpState.busy = true;
  state.cancelled = false;
  state.cancelPromise = new Promise((_, reject) => { state.rejectCancel = () => reject(new Error("Cancelled")); });
  state.cancelPromise.catch(() => {});
  if ($("#cmp-pick")) $("#cmp-pick").disabled = true;
  const listEl = $("#cmp-results");
  if (listEl) listEl.innerHTML = "";
  cmpState.urls.forEach(u => { try { URL.revokeObjectURL(u); } catch {} });
  cmpState.urls = [];

  try {
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      cmpSetProg(0, `Compressing ${i + 1}/${files.length}: ${f.name}`, true);
      const outBlob = await compressVideoBlob(f, opts, p => {
        cmpSetProg(((i + p) / files.length) * 100, `Compressing ${i + 1}/${files.length}: ${f.name}`, true);
      });
      const outUrl = URL.createObjectURL(outBlob);
      cmpState.urls.push(outUrl);
      const outName = f.name.replace(/\.[^.]+$/, "") + `-${opts.targetHeight}p.mp4`;
      const origMb = (f.size / 1048576).toFixed(1);
      const newMb = (outBlob.size / 1048576).toFixed(1);
      const savedPct = f.size > 0 ? Math.max(0, Math.round((1 - outBlob.size / f.size) * 100)) : 0;
      if (listEl) {
        const card = document.createElement("div");
        card.className = "stage-card";
        card.style.marginTop = "10px";
        card.innerHTML = `<div class="ed-clips-head" style="margin:0 0 6px"><strong style="font-size:13px;word-break:break-all">${escapeHTML(outName)}</strong><span class="hint" style="margin:0;font-size:11px">${origMb} MB → ${newMb} MB (-${savedPct}%)</span></div><video controls playsinline preload="metadata" src="${outUrl}" style="width:100%;max-height:220px;border-radius:8px;background:#000"></video><div class="clip-actions" style="margin-top:8px"><a class="btn primary" href="${outUrl}" download="${escapeHTML(outName)}">Download MP4</a></div>`;
        listEl.appendChild(card);
      }
    }
    cmpSetProg(100, "Compression complete ✓", true);
    toast("Video compressed.");
  } catch (err) {
    console.error(err);
    cmpSetProg(0, "", false);
    toast(err.message || "Could not compress video.", true);
  } finally {
    cmpState.busy = false;
    if ($("#cmp-pick")) $("#cmp-pick").disabled = false;
  }
});
document.addEventListener("keydown", e => {
  if (e.key === "Escape" && $("#compressor-modal") && !$("#compressor-modal").hidden) closeCompressorModal();
});
