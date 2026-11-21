"use strict";
/* 2.5D Debate Stage renderer: studio backgrounds, top debate hook, rounded speaker cards, audio-reactive glow & waveform, center logo badge, and Instagram Edits subtitle safe zone. */

const STAGE_BG_PRESETS = [
  { id: "midnight", name: "Midnight Studio", c1: "#090d16", c2: "#131c2e", accent: "#38bdf8", glow: "rgba(56, 189, 248, 0.20)", grid: "rgba(255, 255, 255, 0.045)" },
  { id: "amber", name: "Warm Podcast", c1: "#120c08", c2: "#24160e", accent: "#f59e0b", glow: "rgba(245, 158, 11, 0.20)", grid: "rgba(255, 224, 180, 0.04)" },
  { id: "emerald", name: "Emerald Debate", c1: "#071310", c2: "#0e261f", accent: "#34d399", glow: "rgba(52, 211, 153, 0.18)", grid: "rgba(180, 255, 225, 0.04)" },
  { id: "crimson", name: "Tension Red", c1: "#14090c", c2: "#291018", accent: "#f43f5e", glow: "rgba(244, 63, 94, 0.20)", grid: "rgba(255, 190, 200, 0.04)" },
  { id: "blurred", name: "Blurred Video", c1: "#0a0c12", c2: "#121622", accent: "#818cf8", glow: "rgba(129, 140, 248, 0.20)", grid: "rgba(255, 255, 255, 0.03)" },
];

function defaultStageConfig(item = null) {
  return {
    enabled: false,
    bg: "midnight",
    hookBadge: "DEBATE CLIP",
    hookText: item?.hook || item?.caption || "",
    hookSub: "",
    centerLogoId: "",
    waveform: true,
    activeGlow: true,
    subtitleSafeZone: true,
    speakerFocus: "auto", // "auto" | "top" | "bottom" | "both"
  };
}

function normalizeStageConfig(raw, item = null) {
  const base = defaultStageConfig(item);
  if (!raw || typeof raw !== "object") return base;
  return {
    enabled: !!raw.enabled,
    bg: STAGE_BG_PRESETS.some(p => p.id === raw.bg) ? raw.bg : base.bg,
    hookBadge: String(raw.hookBadge ?? base.hookBadge).slice(0, 28),
    hookText: String(raw.hookText ?? base.hookText).slice(0, 140),
    hookSub: String(raw.hookSub ?? base.hookSub).slice(0, 100),
    centerLogoId: String(raw.centerLogoId || ""),
    waveform: raw.waveform !== false,
    activeGlow: raw.activeGlow !== false,
    subtitleSafeZone: raw.subtitleSafeZone !== false,
    speakerFocus: ["auto", "top", "bottom", "both"].includes(raw.speakerFocus) ? raw.speakerFocus : "auto",
  };
}

function stageRoundRectPath(ctx, x, y, w, h, r) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(x, y, w, h, rad);
  } else {
    ctx.moveTo(x + rad, y);
    ctx.arcTo(x + w, y, x + w, y + h, rad);
    ctx.arcTo(x + w, y + h, x, y + h, rad);
    ctx.arcTo(x, y + h, x, y, rad);
    ctx.arcTo(x, y, x + w, y, rad);
    ctx.closePath();
  }
}

function wrapStageLines(ctx, text, maxW, maxLines = 3) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const lines = [];
  let cur = "";
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(test).width <= maxW || !cur) {
      cur = test;
    } else {
      lines.push(cur);
      cur = w;
      if (lines.length >= maxLines) break;
    }
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  return lines;
}

function getStageLayoutBoxes(count, layoutId, W, H, stage) {
  const s = W / 1080;
  const padX = Math.round(64 * s);
  const gap = Math.round(76 * s); // divider space for waveform + center logo
  const smallGap = Math.round(22 * s);
  const hasHook = !!(stage?.hookText && stage.hookText.trim());
  const topY = hasHook ? Math.round(316 * s) : Math.round(96 * s);
  const bottomLimit = stage?.subtitleSafeZone ? Math.round(1420 * s) : Math.round(1790 * s);
  const availW = W - padX * 2;
  const availH = Math.max(Math.round(420 * s), bottomLimit - topY);

  if (count === 1) {
    return {
      rects: [{ x: padX, y: topY, w: availW, h: availH }],
      dividerY: bottomLimit + Math.round(18 * s),
      topY,
      bottomLimit,
    };
  }

  if (count === 2) {
    if (layoutId === "cols") {
      const colW = Math.round((availW - smallGap) / 2);
      const colH = Math.round(availH * 0.78);
      const cy = topY + Math.round((availH - colH) / 2);
      return {
        rects: [
          { x: padX, y: cy, w: colW, h: colH },
          { x: padX + colW + smallGap, y: cy, w: colW, h: colH },
        ],
        dividerY: cy + colH + Math.round(28 * s),
        topY,
        bottomLimit,
      };
    }
    const cardH = Math.round((availH - gap) / 2);
    return {
      rects: [
        { x: padX, y: topY, w: availW, h: cardH },
        { x: padX, y: topY + cardH + gap, w: availW, h: cardH },
      ],
      dividerY: topY + cardH + Math.round(gap / 2),
      topY,
      bottomLimit,
    };
  }

  const slots = getLayoutSlots(count, layoutId);
  const rects = slots.map(sl => ({
    x: Math.round(padX + sl.x * availW + (sl.x > 0 ? smallGap / 2 : 0)),
    y: Math.round(topY + sl.y * (availH - Math.round(64 * s)) + (sl.y > 0 ? smallGap / 2 : 0)),
    w: Math.round(sl.w * availW - (sl.w < 1 ? smallGap / 2 : 0)),
    h: Math.round(sl.h * (availH - Math.round(64 * s)) - (sl.h < 1 ? smallGap / 2 : 0)),
  }));
  return {
    rects,
    dividerY: topY + availH - Math.round(28 * s),
    topY,
    bottomLimit,
  };
}

function drawStageBackground(ctx, W, H, preset, sourceFrame = null) {
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, preset.c1);
  grad.addColorStop(0.5, preset.c2);
  grad.addColorStop(1, preset.c1);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  if (preset.id === "blurred" && sourceFrame) {
    ctx.save();
    ctx.globalAlpha = 0.26;
    if ("filter" in ctx) ctx.filter = `blur(${Math.max(8, Math.round(W * 0.025))}px)`;
    ctx.drawImage(sourceFrame, 0, 0, W, H);
    ctx.filter = "none";
    ctx.restore();
    ctx.fillStyle = "rgba(8, 10, 16, 0.52)";
    ctx.fillRect(0, 0, W, H);
  }

  // Subtle radial spotlight
  const rad = ctx.createRadialGradient(W * 0.5, H * 0.42, W * 0.05, W * 0.5, H * 0.42, W * 0.85);
  rad.addColorStop(0, preset.glow);
  rad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = rad;
  ctx.fillRect(0, 0, W, H);

  // Subtle studio grid
  const step = Math.round(W / 12);
  ctx.save();
  ctx.strokeStyle = preset.grid;
  ctx.lineWidth = Math.max(1, W / 1080);
  ctx.beginPath();
  for (let x = step; x < W; x += step) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
  }
  for (let y = step; y < H; y += step) {
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
  }
  ctx.stroke();
  ctx.restore();
}

function drawStageHookBanner(ctx, W, stage, preset) {
  const text = String(stage.hookText || "").trim();
  if (!text) return;
  const s = W / 1080;
  const x = Math.round(56 * s);
  const y = Math.round(58 * s);
  const w = W - x * 2;
  const h = Math.round(234 * s);

  ctx.save();
  stageRoundRectPath(ctx, x, y, w, h, Math.round(28 * s));
  ctx.fillStyle = "rgba(15, 20, 32, 0.88)";
  ctx.fill();
  ctx.lineWidth = Math.max(1, 2 * s);
  ctx.strokeStyle = preset.accent;
  ctx.globalAlpha = 0.55;
  ctx.stroke();
  ctx.globalAlpha = 1;

  // Badge pill
  const badge = String(stage.hookBadge || "DEBATE CLIP").trim().toUpperCase();
  if (badge) {
    const bw = Math.min(w - Math.round(64 * s), Math.round((badge.length * 14 + 48) * s));
    const bh = Math.round(36 * s);
    const bx = W / 2 - bw / 2;
    const by = y + Math.round(22 * s);
    stageRoundRectPath(ctx, bx, by, bw, bh, bh / 2);
    ctx.fillStyle = preset.glow;
    ctx.fill();
    ctx.strokeStyle = preset.accent;
    ctx.lineWidth = Math.max(1, 1.2 * s);
    ctx.stroke();
    ctx.font = `700 ${Math.max(8, Math.round(19 * s))}px "Inter", system-ui, sans-serif`;
    ctx.fillStyle = "#f8fafc";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(badge, W / 2, by + bh / 2 + s);
  }

  // Hook headline
  ctx.font = `700 ${Math.max(11, Math.round(40 * s))}px "Inter", system-ui, sans-serif`;
  ctx.fillStyle = "#f8fafc";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const lines = wrapStageLines(ctx, text, w - Math.round(72 * s), 2);
  const lineH = Math.round(48 * s);
  const textStartY = y + Math.round((lines.length === 1 ? 142 : 122) * s);
  lines.forEach((line, idx) => ctx.fillText(line, W / 2, textStartY + idx * lineH));

  // Optional sub-line
  const sub = String(stage.hookSub || "").trim();
  if (sub) {
    ctx.font = `500 ${Math.max(8, Math.round(24 * s))}px "Inter", system-ui, sans-serif`;
    ctx.fillStyle = "#94a3b8";
    ctx.fillText(sub, W / 2, y + h - Math.round(26 * s));
  }
  ctx.restore();
}

function drawStageDivider(ctx, W, dividerY, preset, energy, logoImg, showWave) {
  const s = W / 1080;
  const marginX = Math.round(68 * s);
  const hasLogo = !!(logoImg && logoImg.complete && logoImg.naturalWidth);
  const badgeW = hasLogo ? Math.round(112 * s) : 0;
  const badgeH = Math.round(62 * s);
  const centerGap = hasLogo ? badgeW + Math.round(28 * s) : 0;

  if (showWave) {
    const bars = 28;
    const totalSideW = (W - marginX * 2 - centerGap) / (hasLogo ? 2 : 1);
    const drawSide = (startX, width, flip) => {
      const step = width / bars;
      const bw = Math.max(2, step * 0.52);
      ctx.save();
      ctx.fillStyle = preset.accent;
      for (let i = 0; i < bars; i++) {
        const norm = (i / (bars - 1));
        const envelope = Math.sin(norm * Math.PI);
        const wave = 0.25 + 0.75 * Math.abs(Math.sin((i + energy * 14) * 0.85));
        const h = Math.max(Math.round(5 * s), Math.round((8 + energy * 42 * envelope * wave) * s));
        const x = flip ? startX + width - (i + 1) * step : startX + i * step;
        ctx.globalAlpha = 0.35 + 0.6 * energy * envelope;
        stageRoundRectPath(ctx, x, dividerY - h / 2, bw, h, bw / 2);
        ctx.fill();
      }
      ctx.restore();
    };
    if (hasLogo) {
      drawSide(marginX, totalSideW, false);
      drawSide(W - marginX - totalSideW, totalSideW, true);
    } else {
      drawSide(marginX, totalSideW, false);
    }
  }

  if (hasLogo) {
    const bx = Math.round(W / 2 - badgeW / 2);
    const by = Math.round(dividerY - badgeH / 2);
    ctx.save();
    stageRoundRectPath(ctx, bx, by, badgeW, badgeH, badgeH / 2);
    ctx.fillStyle = "rgba(15, 20, 32, 0.94)";
    ctx.fill();
    ctx.lineWidth = Math.max(1, 2 * s);
    ctx.strokeStyle = preset.accent;
    ctx.stroke();

    const pad = Math.round(10 * s);
    const maxW = badgeW - pad * 2;
    const maxH = badgeH - pad * 2;
    const aspect = logoImg.naturalWidth / Math.max(1, logoImg.naturalHeight);
    let lw = maxW, lh = lw / aspect;
    if (lh > maxH) { lh = maxH; lw = lh * aspect; }
    ctx.drawImage(logoImg, W / 2 - lw / 2, dividerY - lh / 2, lw, lh);
    ctx.restore();
  }
}

function drawStageSubtitleGuide(ctx, W, H, isPreview = true) {
  if (!isPreview) return;
  const s = W / 1080;
  const x = Math.round(72 * s);
  const y = Math.round(1450 * s);
  const w = W - x * 2;
  const h = Math.round(190 * s);
  ctx.save();
  ctx.setLineDash([Math.round(8 * s), Math.round(6 * s)]);
  ctx.strokeStyle = "rgba(56, 189, 248, 0.55)";
  ctx.lineWidth = Math.max(1, 1.5 * s);
  stageRoundRectPath(ctx, x, y, w, h, Math.round(20 * s));
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.font = `600 ${Math.max(7, Math.round(20 * s))}px "Inter", system-ui, sans-serif`;
  ctx.fillStyle = "rgba(125, 211, 252, 0.78)";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("IG EDITS AI SUBTITLES ZONE", W / 2, y + h / 2);
  ctx.restore();
}

function resolveActiveSpeaker(stage, count, timestamp, energy) {
  if (count <= 1) return 0;
  if (stage.speakerFocus === "top") return 0;
  if (stage.speakerFocus === "bottom") return 1;
  if (stage.speakerFocus === "both") return -1;
  // Auto mode: alternate emphasis cleanly on vocal cadence when energy is active
  if (energy < 0.08) return -1;
  return Math.floor(timestamp / 3.5) % count;
}

function drawStageComposition(ctx, source, sw, sh, frameBoxes, frame, W, H, opts = {}) {
  const stage = normalizeStageConfig(frame.stage);
  const preset = STAGE_BG_PRESETS.find(p => p.id === stage.bg) || STAGE_BG_PRESETS[0];
  const s = W / 1080;
  const energy = Math.min(1, Math.max(0, opts.energy ?? 0.45));
  const timestamp = opts.timestamp ?? 0;
  const layoutInfo = getStageLayoutBoxes(frameBoxes.length, frame.layout, W, H, stage);

  drawStageBackground(ctx, W, H, preset, preset.id === "blurred" ? source : null);
  drawStageHookBanner(ctx, W, stage, preset);

  const activeIdx = stage.activeGlow
    ? resolveActiveSpeaker(stage, frameBoxes.length, timestamp, energy)
    : -1;

  const px = r => ({ x: r.x * sw, y: r.y * sh, w: r.w * sw, h: r.h * sh });
  const radius = Math.round(30 * s);

  frameBoxes.forEach((box, idx) => {
    const rect = layoutInfo.rects[idx];
    if (!rect) return;
    const isActive = activeIdx === idx || activeIdx === -1;
    const m = mapBox(px(box), rect.w, rect.h, frame.fit);

    ctx.save();
    // Soft card drop shadow
    ctx.shadowColor = isActive && stage.activeGlow ? preset.glow : "rgba(0, 0, 0, 0.55)";
    ctx.shadowBlur = Math.round((isActive && stage.activeGlow ? 24 + energy * 18 : 16) * s);
    ctx.shadowOffsetY = Math.round(8 * s);
    stageRoundRectPath(ctx, rect.x, rect.y, rect.w, rect.h, radius);
    ctx.fillStyle = "#000";
    ctx.fill();
    ctx.restore();

    // Clipped video inside rounded card
    ctx.save();
    stageRoundRectPath(ctx, rect.x, rect.y, rect.w, rect.h, radius);
    ctx.clip();
    if (frame.fit) {
      ctx.fillStyle = "#05070c";
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    }
    if (typeof source.draw === "function") {
      source.draw(ctx, m.sx, m.sy, m.sw, m.sh, rect.x + m.dx, rect.y + m.dy, m.dw, m.dh);
    } else {
      ctx.drawImage(source, m.sx, m.sy, m.sw, m.sh, rect.x + m.dx, rect.y + m.dy, m.dw, m.dh);
    }
    if (!isActive && stage.activeGlow && activeIdx >= 0) {
      ctx.fillStyle = "rgba(6, 9, 15, 0.24)";
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    }
    ctx.restore();

    // Card border
    ctx.save();
    stageRoundRectPath(ctx, rect.x, rect.y, rect.w, rect.h, radius);
    ctx.lineWidth = Math.max(1, (isActive && stage.activeGlow ? 3.5 + energy * 2 : 1.5) * s);
    ctx.strokeStyle = isActive && stage.activeGlow ? preset.accent : "rgba(148, 163, 184, 0.25)";
    ctx.stroke();
    ctx.restore();
  });

  if (stage.waveform || opts.logoImg) {
    drawStageDivider(ctx, W, layoutInfo.dividerY, preset, energy, opts.logoImg, stage.waveform);
  }
  if (stage.subtitleSafeZone && opts.showGuide) {
    drawStageSubtitleGuide(ctx, W, H, true);
  }
}

async function extractAudioEnvelope(blob, fps = 30) {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    const actx = new AudioCtx();
    const buf = await actx.decodeAudioData(await blob.arrayBuffer());
    try { await actx.close(); } catch {}
    const ch = buf.getChannelData(0);
    const step = Math.max(1, Math.floor(buf.sampleRate / fps));
    const total = Math.ceil(ch.length / step);
    const env = new Float32Array(total);
    let peak = 0.001;
    for (let i = 0; i < total; i++) {
      let sum = 0;
      const start = i * step;
      const end = Math.min(ch.length, start + step);
      for (let j = start; j < end; j += 4) sum += ch[j] * ch[j];
      const rms = Math.sqrt(sum / Math.max(1, (end - start) / 4));
      env[i] = rms;
      if (rms > peak) peak = rms;
    }
    for (let i = 0; i < total; i++) env[i] = Math.min(1, env[i] / peak);
    return env;
  } catch {
    return null;
  }
}

function getStageLogoById(id) {
  if (!id) return null;
  const all = [...(typeof PRESET_OVERLAYS !== "undefined" ? PRESET_OVERLAYS : []), ...(typeof loadSavedOverlays === "function" ? loadSavedOverlays() : [])];
  const item = all.find(x => x.id === id);
  if (!item?.url) return Promise.resolve(null);
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = item.url;
  });
}
