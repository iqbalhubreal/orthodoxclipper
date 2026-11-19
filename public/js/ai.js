"use strict";
/* Clipboard helper and the request to /api/highlights (captions + hashtags). */
async function copyText(text, okMessage) {
  try {
    await navigator.clipboard.writeText(text);
    toast(okMessage);
  } catch {
    const box = document.createElement("textarea");
    box.value = text; document.body.append(box); box.select();
    const ok = document.execCommand("copy"); box.remove();
    toast(ok ? okMessage : "Clipboard access was blocked.", !ok);
  }
}
const copyCaption = item => copyText(shareText(item), "Caption and hashtags copied.");
async function callAI(clips, signal) {
  let response;
  for (let attempt = 0; attempt < 2; attempt++) {
    const limit = new AbortController();
    const timer = setTimeout(() => limit.abort(), AI_TIMEOUT_MS);
    const onAbort = () => limit.abort();
    signal?.addEventListener("abort", onAbort);
    try {
    response = await fetch("/api/highlights", {
      method: "POST", signal: limit.signal,
      headers: { "Content-Type": "application/json", "x-app-password": localStorage.getItem("clipper.password") || "" },
      body: JSON.stringify({ mode: "notes", clips, durationSeconds: state.duration })
    });
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new Error(`The AI service did not respond within ${AI_TIMEOUT_MS / 1000} seconds.`);
    } finally { clearTimeout(timer); signal?.removeEventListener("abort", onAbort); }
    if (response.status === 401 && attempt === 0) {
      const password = prompt("Enter the app password:");
      if (!password) throw new Error("Password required.");
      localStorage.setItem("clipper.password", password);
      continue;
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401) localStorage.removeItem("clipper.password");
      throw new Error(data.error || `AI request failed (HTTP ${response.status}).`);
    }
    return data;
  }
  throw new Error("Unable to reach the AI service.");
}
