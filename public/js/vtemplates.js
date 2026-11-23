"use strict";
/* Data-driven Vertical Editor templates (6 short-form formats) + 1-tap schematic picker. */
const VTEMPLATES = [
  {
    id: "simple",
    name: "Simple subtitles (1:1)",
    people: 1,
    frame: { square1x1: true, layout: "full", boxesCount: 1, fit: false, divider: false, stage: { enabled: false, style: "classic" } },
    hook: null,
    watermark: { x: 0.2, y: 0.615, w: 0.6, h: 0.05, fontId: "classic_medium", fontSize: 16, color: "#ffffff", bg: "none", fx: "shadow", opacity: 0.6, rule: true, startTime: 0, endTime: null, align: "center" },
    captions: { enabled: true, style: "plain", caps: true, color: "#ffffff", fontSize: 26, y: 0.60 },
    bgmVolume: 0.10,
    silenceSens: "normal",
    stitch: false,
    schematic: [
      { cls: "vt-box", style: "top:22%;height:56%;background:#3d4d68" },
      { cls: "vt-cap", style: "top:60%;color:#fff", text: "CAPS" },
      { cls: "vt-wm", style: "top:67%;border-top:1px solid rgba(255,255,255,.7)" },
    ],
  },
  {
    id: "reaction",
    name: "Full-screen reaction",
    people: 2,
    frame: { square1x1: false, layout: "stack", boxesCount: 2, fit: false, divider: false, stage: { enabled: false, style: "classic" } },
    hook: { x: 0.1, y: 0.50, w: 0.8, h: 0.07, fontId: "headline", fontSize: 22, color: "#000000", bg: "light", fx: "none", opacity: 1, startTime: 0, endTime: 4, align: "center" },
    watermark: { x: 0.2, y: 0.555, w: 0.6, h: 0.04, fontId: "classic_medium", fontSize: 16, color: "#ffffff", bg: "none", fx: "shadow", opacity: 0.6, rule: false, startTime: 0, endTime: null, align: "center" },
    captions: { enabled: true, style: "word", caps: true, color: "#ffffff", fontSize: 44, y: 0.485 },
    bgmVolume: 0.12,
    silenceSens: "normal",
    stitch: false,
    schematic: [
      { cls: "vt-box", style: "top:4%;height:43%;background:#7d6c4c" },
      { cls: "vt-box", style: "top:50%;height:46%;background:#35516b" },
      { cls: "vt-cap", style: "top:47%;color:#fff", text: "CAPS" },
      { cls: "vt-hook-lbl", style: "top:55%", text: "HOOK" },
    ],
  },
  {
    id: "dual",
    name: "Dual-speaker storytelling",
    people: 2,
    frame: { square1x1: false, layout: "full", boxesCount: 1, fit: false, divider: false, stage: { enabled: false, style: "classic" } },
    hook: null,
    watermark: { x: 0.2, y: 0.58, w: 0.6, h: 0.04, fontId: "classic_medium", fontSize: 16, color: "#ffffff", bg: "none", fx: "shadow", opacity: 0.6, rule: false, startTime: 0, endTime: null, align: "center" },
    captions: { enabled: true, style: "highlight", caps: true, color: "#ffd21f", fontSize: 52, y: 0.50 },
    bgmVolume: 0.12,
    silenceSens: "normal",
    stitch: true,
    schematic: [
      { cls: "vt-box", style: "top:12%;height:76%;background:linear-gradient(90deg,#3d4d68 50%,#6a4a68 50%)" },
      { cls: "vt-cap", style: "top:50%;color:#ffd21f", text: "A | B" },
      { cls: "vt-wm", style: "top:60%" },
    ],
  },
  {
    id: "split",
    name: "Split screen",
    people: 1,
    frame: { square1x1: false, layout: "stack", boxesCount: 2, fit: false, divider: false, stage: { enabled: false, style: "classic" } },
    hook: { x: 0.08, y: 0.08, w: 0.84, h: 0.14, fontId: "headline", fontSize: 42, color: "#ffffff", bg: "none", fx: "glow", glowColor: "#e11d2e", opacity: 1, startTime: 0, endTime: 3, align: "center", caps: true },
    watermark: { x: 0.2, y: 0.535, w: 0.6, h: 0.04, fontId: "classic_medium", fontSize: 16, color: "#ffffff", bg: "none", fx: "shadow", opacity: 0.6, rule: false, startTime: 0, endTime: null, align: "center" },
    captions: { enabled: true, style: "word", caps: true, color: "#facc15", fontSize: 44, y: 0.50 },
    bgmVolume: 0.12,
    silenceSens: "normal",
    stitch: false,
    schematic: [
      { cls: "vt-box", style: "top:4%;height:42%;background:#a8973f" },
      { cls: "vt-box", style: "top:49%;height:47%;background:#3d4d68" },
      { cls: "vt-cap", style: "top:14%;color:#fff;text-shadow:0 0 4px #e11d2e", text: "HOOK" },
      { cls: "vt-cap", style: "top:49%;color:#facc15", text: "CAPS" },
    ],
  },
  {
    id: "stage25",
    name: "2.5D stage",
    people: 2,
    frame: { square1x1: false, layout: "stack", boxesCount: 2, fit: false, divider: false, stage: { enabled: true, style: "2.5d", bg: "midnight", activeGlow: true, speakerFocus: "auto" } },
    hook: { x: 0.08, y: 0.04, w: 0.84, h: 0.10, fontId: "headline", fontSize: 34, color: "#ffffff", bg: "none", fx: "glow", glowColor: "#38bdf8", opacity: 1, startTime: 0, endTime: 4, align: "center", caps: true },
    watermark: { x: 0.2, y: 0.755, w: 0.6, h: 0.04, fontId: "classic_medium", fontSize: 16, color: "#ffffff", bg: "none", fx: "shadow", opacity: 0.6, rule: false, startTime: 0, endTime: null, align: "center" },
    captions: { enabled: true, style: "highlight", caps: true, color: "#facc15", fontSize: 40, y: 0.458 },
    bgmVolume: 0.12,
    silenceSens: "normal",
    stitch: false,
    schematic: [
      { cls: "vt-cap", style: "top:9%;color:#38bdf8", text: "HOOK" },
      { cls: "vt-card", style: "top:18%;height:24%;border-color:#38bdf8" },
      { cls: "vt-cap", style: "top:46%;color:#facc15", text: "CAPS" },
      { cls: "vt-card", style: "top:52%;height:24%;opacity:.72" },
    ],
  },
  {
    id: "pip",
    name: "PiP",
    people: 2,
    frame: { square1x1: false, layout: "stack", boxesCount: 2, fit: false, divider: false, stage: { enabled: true, style: "pip", bg: "midnight", activeGlow: true, speakerFocus: "auto" } },
    hook: { x: 0.1, y: 0.065, w: 0.8, h: 0.07, fontId: "headline", fontSize: 22, color: "#000000", bg: "light", fx: "none", opacity: 1, startTime: 0, endTime: 4, align: "center" },
    watermark: { x: 0.2, y: 0.50, w: 0.6, h: 0.04, fontId: "classic_medium", fontSize: 16, color: "#ffffff", bg: "none", fx: "shadow", opacity: 0.6, rule: false, startTime: 0, endTime: null, align: "center" },
    captions: { enabled: true, style: "highlight", caps: true, color: "#facc15", fontSize: 40, y: 0.48 },
    bgmVolume: 0.12,
    silenceSens: "normal",
    stitch: false,
    schematic: [
      { cls: "vt-hook-lbl", style: "top:10%", text: "HOOK" },
      { cls: "vt-card", style: "top:18%;height:57%" },
      { cls: "vt-cap", style: "top:45%;color:#facc15", text: "CAPS" },
      { cls: "vt-pip", style: "top:54%;height:19%;left:63%;right:9%" },
    ],
  },
];

function getVTemplate(id) {
  return VTEMPLATES.find(t => t.id === id) || null;
}

function vtHookTextForClip(item) {
  const raw = String(item?.hook || item?.note || item?.title || "Watch this clip").trim();
  const words = raw.split(/\s+/).filter(Boolean).slice(0, 7).join(" ");
  return words || "Watch this clip";
}

function vtMakeHookLayer(tpl, item) {
  if (!tpl.hook) return null;
  const txt = vtHookTextForClip(item);
  return {
    kind: "text",
    tpl: `tpl:${tpl.id}`,
    tplRole: "hook",
    shared: false,
    text: tpl.hook.caps ? txt.toUpperCase() : txt,
    fontId: tpl.hook.fontId || "headline",
    fontSize: tpl.hook.fontSize || 34,
    color: tpl.hook.color || "#ffffff",
    bg: tpl.hook.bg || "none",
    fx: tpl.hook.fx || "shadow",
    glowColor: tpl.hook.glowColor || null,
    opacity: tpl.hook.opacity ?? 1,
    startTime: tpl.hook.startTime ?? 0,
    endTime: tpl.hook.endTime ?? 4,
    align: tpl.hook.align || "center",
    rule: false,
    x: tpl.hook.x,
    y: tpl.hook.y,
    w: tpl.hook.w,
    h: tpl.hook.h,
  };
}

function vtMakeWatermarkLayer(tpl, wmText) {
  if (!tpl.watermark) return null;
  return {
    kind: "text",
    tpl: `tpl:${tpl.id}`,
    tplRole: "watermark",
    shared: true,
    text: (wmText || "@yourchannel").trim() || "@yourchannel",
    fontId: tpl.watermark.fontId || "classic_medium",
    fontSize: tpl.watermark.fontSize || 16,
    color: tpl.watermark.color || "#ffffff",
    bg: tpl.watermark.bg || "none",
    fx: tpl.watermark.fx || "shadow",
    opacity: tpl.watermark.opacity ?? 0.6,
    rule: !!tpl.watermark.rule,
    startTime: tpl.watermark.startTime ?? 0,
    endTime: tpl.watermark.endTime ?? null,
    align: tpl.watermark.align || "center",
    x: tpl.watermark.x,
    y: tpl.watermark.y,
    w: tpl.watermark.w,
    h: tpl.watermark.h,
  };
}

function vtBuildFrame(baseFrame, tpl) {
  const cur = baseFrame || defaultFrame(tpl.frame.boxesCount);
  const curBoxes = getFrameBoxes(cur);
  const targetCount = tpl.frame.boxesCount || 1;
  const countChanged = curBoxes.length !== targetCount;
  const boxes = countChanged
    ? Array.from({ length: targetCount }, (_, idx) => defaultBoxAt(idx, targetCount))
    : clone(curBoxes);
  const stageBase = typeof normalizeStageConfig === "function" ? normalizeStageConfig(cur.stage) : { enabled: false, style: "classic", bg: "midnight" };
  const stage = {
    ...stageBase,
    enabled: !!tpl.frame.stage?.enabled,
    style: tpl.frame.stage?.style || "classic",
    bg: tpl.frame.stage?.bg || stageBase.bg || "midnight",
    activeGlow: tpl.frame.stage?.activeGlow !== false,
    speakerFocus: tpl.frame.stage?.speakerFocus || "auto",
  };
  return {
    frame: {
      fit: !!tpl.frame.fit,
      square1x1: !!tpl.frame.square1x1,
      divider: !!tpl.frame.divider,
      dividerSize: cur.dividerSize || 6,
      layout: tpl.frame.layout || "full",
      boxes,
      stage,
    },
    countChanged,
  };
}

function vtApplyCaptionsCfg(existingCap, tplCap) {
  const words = Array.isArray(existingCap?.words) ? clone(existingCap.words) : [];
  return {
    enabled: words.length > 0 ? true : !!existingCap?.enabled,
    style: tplCap.style || "highlight",
    caps: tplCap.caps !== false,
    color: tplCap.color || "#facc15",
    fontSize: tplCap.fontSize || 40,
    y: tplCap.y ?? 0.72,
    words,
  };
}

async function applyTemplate(id, scope = ved.scope) {
  const tpl = getVTemplate(id);
  if (!tpl) return;
  const effectiveScope = scope === "individual" ? "individual" : "all";
  const prefs = typeof loadClipperPrefs === "function" ? loadClipperPrefs() : { watermark: "@yourchannel" };
  const wmText = ($("#ved-wm-text")?.value || prefs.watermark || "@yourchannel").trim() || "@yourchannel";
  const curItem = state.outputs[ved.index];

  const { frame: nextFrame, countChanged } = vtBuildFrame(ved.frame, tpl);
  ved.frame = nextFrame;
  ved.activeTemplate = tpl.id;
  ved.silSens = tpl.silenceSens || "normal";
  if (ved.bgm) ved.bgm.volume = tpl.bgmVolume ?? 0.15;

  const userLayers = (ved.layers || []).filter(l => !(l.tpl && String(l.tpl).startsWith("tpl:")));
  const wmLayer = vtMakeWatermarkLayer(tpl, wmText);
  const hookLayer = vtMakeHookLayer(tpl, curItem);
  ved.layers = [
    ...userLayers,
    ...(wmLayer ? [wmLayer] : []),
    ...(hookLayer ? [hookLayer] : []),
  ];
  ved.sel = ved.layers.length - 1;
  ved.captions = vtApplyCaptionsCfg(ved.captions, tpl.captions);

  if (effectiveScope === "all") {
    state.outputs.forEach((out, idx) => {
      const f = idx === ved.index ? clone(ved.frame) : vtBuildFrame(out.vFrame || ved.frame, tpl).frame;
      out.vFrame = f;
      const own = cloneLayers((out.vLayers || []).filter(l => !(l.tpl && String(l.tpl).startsWith("tpl:"))));
      const clipWm = vtMakeWatermarkLayer(tpl, wmText);
      const clipHook = vtMakeHookLayer(tpl, out);
      out.vLayers = [...own, ...(clipWm ? [clipWm] : []), ...(clipHook ? [clipHook] : [])];
      out.vCaptions = vtApplyCaptionsCfg(idx === ved.index ? ved.captions : out.vCaptions, tpl.captions);
      if (out.vBgm) out.vBgm.volume = tpl.bgmVolume ?? 0.15;
    });
  }

  vedSyncControls();
  drawVEditor();

  if (countChanged && ved.video?.videoWidth && typeof vedAutoCenterFaces === "function") {
    try { await vedAutoCenterFaces(); } catch {}
  }
  if (tpl.stitch && !ved.stitch?.blob) {
    toast(`Applied "${tpl.name}". Tap + Stitch clip below to add the second speaker.`);
  } else {
    toast(`Applied "${tpl.name}".`);
  }
}

function renderTemplatePicker() {
  const wrap = $("#ved-tpl-grid");
  if (!wrap) return;
  wrap.innerHTML = VTEMPLATES.map(t => {
    const parts = (t.schematic || []).map(p =>
      `<span class="${p.cls}" style="${p.style || ""}">${p.text ? escapeHTML(p.text) : ""}</span>`
    ).join("");
    const bg = t.frame.stage?.enabled ? "linear-gradient(#090d16,#131c2e)" : "#0b0c10";
    return `<button type="button" class="ved-tpl-card${ved.activeTemplate === t.id ? " on" : ""}" data-vtpl="${t.id}">
      <span class="vt-phone" style="background:${bg}">${parts}</span>
      <span class="vt-meta"><b>${escapeHTML(t.name)}</b><small>${t.people === 2 ? "2 people" : "1 person"}</small></span>
    </button>`;
  }).join("");
}

$("#ved-tpl-grid")?.addEventListener("click", e => {
  const btn = e.target.closest("button[data-vtpl]");
  if (!btn) return;
  applyTemplate(btn.dataset.vtpl, ved.scope);
});

$("#ved-wm-text")?.addEventListener("input", e => {
  const val = e.target.value.slice(0, 40);
  if (typeof saveClipperPrefs === "function") saveClipperPrefs({ watermark: val || "@yourchannel" });
  const txt = val.trim() || "@yourchannel";
  ved.layers.forEach(l => { if (l.tplRole === "watermark") l.text = txt; });
  if (ved.scope === "all") {
    state.outputs.forEach(out => {
      (out.vLayers || []).forEach(l => { if (l.tplRole === "watermark") l.text = txt; });
    });
  }
  drawVEditor();
});
