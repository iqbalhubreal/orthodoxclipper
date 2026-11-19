"use strict";
/* Loads ffmpeg.wasm and mounts the uploaded video. */
async function getFFmpeg() {
  if (state.ffmpeg) return state.ffmpeg;
  let FFmpeg, toBlobURL;
  try {
    ({ FFmpeg } = await import("/vendor/ffmpeg/index.js"));
    ({ toBlobURL } = await import("/vendor/util/index.js"));
  } catch {
    throw new Error("The video engine is missing. Deploy the full project after running its build step.");
  }
  let lastError;
  for (const base of CORE_BASES) {
    const ff = new FFmpeg();
    ff.on("log", ({ message }) => window.CLIPPER_DEBUG && console.log(message));
    let watchdog;
    try {
      showBusy(true, "Downloading the video engine (first time only)...");
      let lastBytes = Date.now();
      const stalled = new Promise((_, reject) => {
        watchdog = setInterval(() => { if (Date.now() - lastBytes > ENGINE_STALL_MS) reject(new Error("Engine download stalled.")); }, 3000);
      });
      stalled.catch(() => {});
      const onProgress = ({ received, total }) => {
        lastBytes = Date.now();
        const mb = n => (n / 1048576).toFixed(1);
        setBusyText(total > 0 && received <= total
          ? `Downloading the video engine (first time only)... ${mb(received)} of ${mb(total)} MB`
          : `Downloading the video engine (first time only)... ${mb(received)} MB`);
      };
      const coreURL = await Promise.race([toBlobURL(`${base}/ffmpeg-core.js`, "text/javascript"), stalled]);
      const wasmURL = await Promise.race([toBlobURL(`${base}/ffmpeg-core.wasm`, "application/wasm", true, onProgress), stalled]);
      clearInterval(watchdog);
      setBusyText("Starting the video engine...");
      await ff.load({ coreURL, wasmURL });
      state.ffmpeg = ff;
      return ff;
    } catch (error) { lastError = error; clearInterval(watchdog); try { ff.terminate(); } catch {} }
  }
  console.error(lastError);
  throw new Error("Could not download the video engine. Check your connection and try again.");
}
/* Mount the file read-only instead of copying it into memory (falls back to a copy if unsupported). */
async function mountInput(ff) {
  await unmountInput(ff);
  const ext = state.file.name.match(/\.[a-z0-9]{1,5}$/i)?.[0]?.toLowerCase() || ".mp4";
  const safe = new File([state.file], `source${ext}`, { type: state.file.type });
  try {
    await ff.createDir(MOUNT);
    await ff.mount("WORKERFS", { files: [safe] }, MOUNT);
    state.input = { type: "mount", path: `${MOUNT}/${safe.name}` };
  } catch {
    try { await ff.deleteDir(MOUNT); } catch {}
    await ff.writeFile(safe.name, new Uint8Array(await safe.arrayBuffer()));
    state.input = { type: "file", path: safe.name };
  }
  return state.input.path;
}
async function unmountInput(ff) {
  const input = state.input;
  state.input = null;
  if (!input || !ff) return;
  try {
    if (input.type === "mount") { await ff.unmount(MOUNT); await ff.deleteDir(MOUNT); }
    else await ff.deleteFile(input.path);
  } catch {}
}
