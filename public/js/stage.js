"use strict";
/* Stage renderer: 2.5D Stage, Versus, Glass, Cinema, Study, PiP, and Broadcast designs. Keeps top space empty for Instagram and bottom clear for IG Edits AI subtitles. */

const STAGE_STYLES = ["classic", "2.5d", "versus", "glass", "cinema", "study", "pip", "broadcast"];
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
    style: "classic",
    bg: "midnight",
    waveform: true,
    activeGlow: true,
    subtitleSafeZone: true,
    hookGuide: true,
    speakerFocus: "auto",
    detectSpeaker: !(typeof IS_MOBILE !== "undefined" && IS_MOBILE),
  };
}

function normalizeStageConfig(raw, item = null) {
  const base = defaultStageConfig(item);
  if (!raw || typeof raw !== "object") return base;
  let style = STAGE_STYLES.includes(raw.style) ? raw.style : (raw.enabled ? "2.5d" : "classic");
  const enabled = raw.style ? style !== "classic" : !!raw.enabled;
  if (enabled && style === "classic") style = "2.5d";
  return {
    enabled,
    style,
    bg: STAGE_BG_PRESETS.some(p => p.id === raw.bg) ? raw.bg : base.bg,
    waveform: raw.waveform !== false,
    activeGlow: raw.activeGlow !== false,
    subtitleSafeZone: raw.subtitleSafeZone !== false,
    hookGuide: raw.hookGuide !== false,
    speakerFocus: ["auto", "top", "bottom", "both"].includes(raw.speakerFocus) ? raw.speakerFocus : "auto",
    detectSpeaker: raw.detectSpeaker === undefined ? base.detectSpeaker : !!raw.detectSpeaker,
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

function getStageLayoutBoxes(count, layoutId, W, H, stage) {
  const s = W / 1080;
  const padX = Math.round(64 * s);
  const gap = Math.round(72 * s);
  const smallGap = Math.round(22 * s);
  const topY = Math.round(334 * s);
  const bottomLimit = stage?.subtitleSafeZone ? Math.round(1425 * s) : Math.round(1790 * s);
  const availW = W - padX * 2;
  const availH = Math.max(Math.round(420 * s), bottomLimit - topY);

  if (stage?.style === "pip" && count >= 2) {
    const pipW = Math.round(300 * s);
    const pipH = Math.round(370 * s);
    const margin = Math.round(24 * s);
    const rects = [{ x: padX, y: topY, w: availW, h: availH }];
    for (let i = 1; i < count; i++) {
      const col = i - 1;
      rects.push({
        x: Math.round(W - padX - margin - pipW - col * (pipW + Math.round(16 * s))),
        y: Math.round(bottomLimit - margin - pipH),
        w: pipW,
        h: pipH,
      });
    }
    return { rects, dividerY: bottomLimit + Math.round(18 * s), topY, bottomLimit };
  }

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

function drawStageBackground(ctx, W, H, preset, stage, timestamp, sourceFrame = null) {
  const style = stage.style || "2.5d";

  if (style === "cinema") {
    ctx.fillStyle = "#0b0c0f";
    ctx.fillRect(0, 0, W, H);
    const vig = ctx.createRadialGradient(W * 0.5, H * 0.45, W * 0.15, W * 0.5, H * 0.45, W * 0.9);
    vig.addColorStop(0, "rgba(255,255,255,0.035)");
    vig.addColorStop(1, "rgba(0,0,0,0.65)");
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);
    return;
  }

  if (style === "study") {
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, "#140c07");
    grad.addColorStop(0.5, "#1f130c");
    grad.addColorStop(1, "#0b0704");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    const spot = ctx.createRadialGradient(W * 0.5, H * 0.12, W * 0.04, W * 0.5, H * 0.36, W * 0.88);
    spot.addColorStop(0, "rgba(251, 191, 36, 0.22)");
    spot.addColorStop(0.5, "rgba(217, 119, 6, 0.08)");
    spot.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = spot;
    ctx.fillRect(0, 0, W, H);
    return;
  }

  if (style === "broadcast") {
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, "#0b1120");
    grad.addColorStop(0.5, "#151f33");
    grad.addColorStop(1, "#090e1a");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    const step = Math.round(W / 16);
    ctx.save();
    ctx.strokeStyle = "rgba(148, 163, 184, 0.045)";
    ctx.lineWidth = Math.max(1, W / 1080);
    ctx.beginPath();
    for (let x = step; x < W; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    ctx.stroke();
    ctx.restore();
    return;
  }

  if (style === "versus") {
    ctx.fillStyle = "#08090f";
    ctx.fillRect(0, 0, W, H);
    const topGlow = ctx.createRadialGradient(W * 0.5, H * 0.30, W * 0.04, W * 0.5, H * 0.30, W * 0.68);
    topGlow.addColorStop(0, "rgba(56, 189, 248, 0.24)");
    topGlow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = topGlow;
    ctx.fillRect(0, 0, W, H);
    const botGlow = ctx.createRadialGradient(W * 0.5, H * 0.62, W * 0.04, W * 0.5, H * 0.62, W * 0.68);
    botGlow.addColorStop(0, "rgba(244, 63, 94, 0.24)");
    botGlow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = botGlow;
    ctx.fillRect(0, 0, W, H);
    return;
  }

  if (style === "glass") {
    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, "#0b1020");
    grad.addColorStop(0.5, "#121830");
    grad.addColorStop(1, "#090d18");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    const t = timestamp * 0.6;
    const orbs = [
      { x: W * (0.28 + 0.12 * Math.sin(t)), y: H * (0.30 + 0.06 * Math.cos(t * 0.8)), r: W * 0.55, c: "rgba(99, 102, 241, 0.24)" },
      { x: W * (0.72 + 0.12 * Math.cos(t * 0.7)), y: H * (0.60 + 0.06 * Math.sin(t * 0.9)), r: W * 0.52, c: "rgba(56, 189, 248, 0.20)" },
    ];
    for (const o of orbs) {
      const og = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, o.r);
      og.addColorStop(0, o.c);
      og.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = og;
      ctx.fillRect(0, 0, W, H);
    }
    return;
  }

  // Default 2.5D / PiP studio background
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

  const rad = ctx.createRadialGradient(W * 0.5, H * 0.42, W * 0.05, W * 0.5, H * 0.42, W * 0.85);
  rad.addColorStop(0, preset.glow);
  rad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = rad;
  ctx.fillRect(0, 0, W, H);

  const step = Math.round(W / 12);
  ctx.save();
  ctx.strokeStyle = preset.grid;
  ctx.lineWidth = Math.max(1, W / 1080);
  ctx.beginPath();
  for (let x = step; x < W; x += step) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
  for (let y = step; y < H; y += step) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
  ctx.stroke();
  ctx.restore();
}

function drawStageDivider(ctx, W, dividerY, preset, energy, style = "2.5d") {
  const s = W / 1080;
  const marginX = Math.round(72 * s);

  if (style === "versus") {
    const grad = ctx.createLinearGradient(marginX, 0, W - marginX, 0);
    grad.addColorStop(0, "rgba(56, 189, 248, 0.15)");
    grad.addColorStop(0.5, `rgba(255, 255, 255, ${0.55 + 0.45 * energy})`);
    grad.addColorStop(1, "rgba(244, 63, 94, 0.15)");
    ctx.save();
    ctx.fillStyle = grad;
    const h = Math.max(2, Math.round((3 + energy * 4) * s));
    stageRoundRectPath(ctx, marginX, dividerY - h / 2, W - marginX * 2, h, h / 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  if (style === "cinema") {
    const totalW = W - marginX * 2;
    const activeW = Math.max(Math.round(32 * s), Math.round(totalW * (0.2 + 0.8 * energy)));
    ctx.save();
    ctx.fillStyle = "rgba(255, 255, 255, 0.14)";
    ctx.fillRect(marginX, dividerY - Math.round(2 * s), totalW, Math.round(4 * s));
    ctx.fillStyle = "rgba(248, 250, 252, 0.78)";
    ctx.fillRect((W - activeW) / 2, dividerY - Math.round(2 * s), activeW, Math.round(4 * s));
    ctx.restore();
    return;
  }

  if (style === "broadcast") {
    const barW = W - marginX * 2;
    const barH = Math.round(10 * s);
    const grad = ctx.createLinearGradient(marginX, 0, W - marginX, 0);
    grad.addColorStop(0, "#1e293b");
    grad.addColorStop(0.5, preset.accent);
    grad.addColorStop(1, "#1e293b");
    ctx.save();
    stageRoundRectPath(ctx, marginX, dividerY - barH / 2, barW, barH, barH / 2);
    ctx.fillStyle = grad;
    ctx.globalAlpha = 0.55 + 0.4 * energy;
    ctx.fill();
    ctx.restore();
    return;
  }

  const bars = 44;
  const totalW = W - marginX * 2;
  const step = totalW / bars;
  const bw = Math.max(2, step * 0.52);
  ctx.save();
  ctx.fillStyle = style === "study" ? "#f59e0b" : preset.accent;
  for (let i = 0; i < bars; i++) {
    const norm = i / (bars - 1);
    const envelope = Math.sin(norm * Math.PI);
    const wave = 0.25 + 0.75 * Math.abs(Math.sin((i + energy * 14) * 0.78));
    const h = Math.max(Math.round(5 * s), Math.round((8 + energy * 42 * envelope * wave) * s));
    const x = marginX + i * step;
    ctx.globalAlpha = 0.35 + 0.6 * energy * envelope;
    stageRoundRectPath(ctx, x, dividerY - h / 2, bw, h, bw / 2);
    ctx.fill();
  }
  ctx.restore();
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

function drawStageHookGuide(ctx, W, H) {
  const s = W / 1080;
  const x = Math.round(72 * s), y = Math.round(24 * s);
  const w = W - x * 2, h = Math.round(334 * s) - y - Math.round(16 * s);
  ctx.save();
  ctx.setLineDash([Math.round(8 * s), Math.round(6 * s)]);
  ctx.strokeStyle = "rgba(251, 191, 36, 0.55)";
  ctx.lineWidth = Math.max(1, 1.5 * s);
  stageRoundRectPath(ctx, x, y, w, h, Math.round(20 * s));
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.font = `600 ${Math.max(7, Math.round(20 * s))}px "Inter", system-ui, sans-serif`;
  ctx.fillStyle = "rgba(252, 211, 77, 0.78)";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("IG HOOK ZONE", W / 2, y + h / 2);
  ctx.restore();
}

function resolveActiveSpeaker(stage, count, timestamp, energy) {
  if (count <= 1) return 0;
  if (stage.speakerFocus === "top") return 0;
  if (stage.speakerFocus === "bottom") return 1;
  if (stage.speakerFocus === "both") return -1;
  if (energy < 0.08) return -1;
  return Math.floor(timestamp / 3.5) % count;
}

function stageFallbackLevels(stage, count, timestamp, energy) {
  if (stage.speakerFocus === "both") return new Array(count).fill(1);
  const idx = resolveActiveSpeaker(stage, count, timestamp, energy);
  return Array.from({ length: count }, (_, i) => (i === idx ? 1 : 0));
}

function stageRgba(hex, alpha) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return `rgba(255, 255, 255, ${alpha})`;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

function drawStageComposition(ctx, source, sw, sh, frameBoxes, frame, W, H, opts = {}) {
  const stage = normalizeStageConfig(frame.stage);
  const style = stage.style || "2.5d";
  const preset = STAGE_BG_PRESETS.find(p => p.id === stage.bg) || STAGE_BG_PRESETS[0];
  const s = W / 1080;
  const energy = Math.min(1, Math.max(0, opts.energy ?? 0.45));
  const timestamp = opts.timestamp ?? 0;
  const layoutInfo = getStageLayoutBoxes(frameBoxes.length, frame.layout, W, H, stage);

  drawStageBackground(ctx, W, H, preset, stage, timestamp, preset.id === "blurred" ? source : null);

  const count = frameBoxes.length;
  let levels = new Array(count).fill(0);
  if (stage.activeGlow) {
    levels = opts.speakerLevels && opts.speakerLevels.length === count
      ? opts.speakerLevels
      : stageFallbackLevels(stage, count, timestamp, energy);
  }
  const anySpeaking = Math.max(0, ...levels) > 0.35 && stage.speakerFocus !== "both";
  const pulse = 0.65 + 0.35 * energy;

  const px = r => ({ x: r.x * sw, y: r.y * sh, w: r.w * sw, h: r.h * sh });
  const radius = Math.round((style === "cinema" ? 10 : style === "broadcast" ? 16 : 30) * s);

  const order = style === "pip"
    ? levels.map((_, i) => i)
    : levels.map((_, i) => i).sort((a, b) => levels[a] - levels[b]);

  order.forEach(idx => {
    const base = layoutInfo.rects[idx];
    if (!base) return;
    const L = Math.min(1, Math.max(0, levels[idx] || 0));
    const lift = (style === "cinema" || style === "pip") ? 0 : 0.035 * L;
    const grow = 1 + lift;
    const w2 = Math.round(base.w * grow), h2 = Math.round(base.h * grow);
    const rect = {
      x: Math.round(base.x - (w2 - base.w) / 2),
      y: Math.round(base.y - (h2 - base.h) / 2 - (lift ? 8 * s * L : 0)),
      w: w2, h: h2,
    };
    const m = mapBox(px(frameBoxes[idx]), rect.w, rect.h, frame.fit);

    const cardAccent = style === "versus"
      ? (idx === 0 ? "#38bdf8" : "#f43f5e")
      : style === "study"
        ? "#fbbf24"
        : preset.accent;

    if (L > 0.02 && style !== "cinema" && style !== "broadcast") {
      ctx.save();
      stageRoundRectPath(ctx, rect.x, rect.y, rect.w, rect.h, radius);
      ctx.shadowColor = stageRgba(cardAccent, 0.62 * L * pulse);
      ctx.shadowBlur = Math.round((36 + 34 * energy) * s * L + 4 * s);
      ctx.fillStyle = "#000";
      ctx.fill();
      ctx.restore();
    }

    ctx.save();
    ctx.shadowColor = `rgba(0, 0, 0, ${style === "glass" ? 0.68 : 0.55 + 0.25 * L})`;
    ctx.shadowBlur = Math.round((style === "glass" ? 36 : 16 + 24 * L) * s);
    ctx.shadowOffsetY = Math.round((style === "glass" ? 14 : 8 + 16 * L) * s);
    stageRoundRectPath(ctx, rect.x, rect.y, rect.w, rect.h, radius);
    ctx.fillStyle = "#000";
    ctx.fill();
    ctx.restore();

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
    if (anySpeaking && style !== "pip") {
      const dim = (style === "cinema" ? 0.22 : 0.34) * (1 - L);
      if (dim > 0.01) { ctx.fillStyle = `rgba(6, 9, 15, ${dim})`; ctx.fillRect(rect.x, rect.y, rect.w, rect.h); }
    }
    if (L > 0.02 && style !== "cinema") {
      const sheen = ctx.createLinearGradient(0, rect.y, 0, rect.y + rect.h * 0.35);
      sheen.addColorStop(0, `rgba(255, 255, 255, ${(style === "glass" ? 0.18 : 0.12) * L})`);
      sheen.addColorStop(1, "rgba(255, 255, 255, 0)");
      ctx.fillStyle = sheen;
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h * 0.35);
    }
    if (style === "broadcast" && L > 0.05) {
      const stripW = Math.round(10 * s);
      ctx.fillStyle = stageRgba(cardAccent, 0.95 * L);
      ctx.fillRect(rect.x, rect.y, stripW, rect.h);
    }
    ctx.restore();

    ctx.save();
    stageRoundRectPath(ctx, rect.x, rect.y, rect.w, rect.h, radius);
    ctx.lineWidth = Math.max(1, (style === "cinema" ? 1 : 1.5) * s);
    ctx.strokeStyle = style === "glass"
      ? "rgba(255, 255, 255, 0.28)"
      : style === "pip" && idx > 0
        ? stageRgba(cardAccent, 0.85)
        : "rgba(148, 163, 184, 0.25)";
    ctx.stroke();

    if (style === "glass") {
      ctx.beginPath();
      ctx.moveTo(rect.x + radius, rect.y + s);
      ctx.lineTo(rect.x + rect.w - radius, rect.y + s);
      ctx.lineWidth = Math.max(1, 1.5 * s);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.55)";
      ctx.stroke();
    } else if (L > 0.02 && style !== "broadcast") {
      const rim = ctx.createLinearGradient(0, rect.y, 0, rect.y + rect.h);
      rim.addColorStop(0, stageRgba("#ffffff", (style === "cinema" ? 0.5 : 0.9) * L));
      rim.addColorStop(0.5, stageRgba(cardAccent, 0.95 * L));
      rim.addColorStop(1, stageRgba(cardAccent, 0.6 * L));
      ctx.lineWidth = Math.max(1, ((style === "cinema" ? 1.5 : 1.5 + (2 + 1.5 * energy) * L)) * s);
      ctx.strokeStyle = rim;
      ctx.stroke();
    }
    ctx.restore();
  });

  if (stage.waveform && style !== "pip") {
    drawStageDivider(ctx, W, layoutInfo.dividerY, preset, energy, style);
  }
  if (opts.showGuide) {
    if (stage.hookGuide) drawStageHookGuide(ctx, W, H);
    if (stage.subtitleSafeZone) drawStageSubtitleGuide(ctx, W, H, true);
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
