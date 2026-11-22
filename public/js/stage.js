"use strict";
/* Stage renderer: Classic, 2.5D Stage, and PiP layouts with 10 studio/visual presets. Keeps top space empty for Instagram and bottom clear for IG Edits AI subtitles. */

const STAGE_STYLES = ["classic", "2.5d", "pip"];
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
    frameScale: 1,
    activeGlow: true,
    nameplates: false,
    names: ["", "", "", ""],
    speakerFocus: "auto",
  };
}

function normalizeStageConfig(raw, item = null) {
  const base = defaultStageConfig(item);
  if (!raw || typeof raw !== "object") return base;
  const legacyPreset = ["versus", "glass", "cinema", "study", "broadcast"].includes(raw.style) ? raw.style : null;
  let style = STAGE_STYLES.includes(raw.style) ? raw.style : (legacyPreset || raw.enabled ? "2.5d" : "classic");
  const enabled = raw.style ? style !== "classic" : !!raw.enabled;
  if (enabled && style === "classic") style = "2.5d";
  const bgRaw = legacyPreset || raw.bg;
  return {
    enabled,
    style,
    bg: STAGE_BG_PRESETS.some(p => p.id === bgRaw) ? bgRaw : base.bg,
    frameScale: Math.min(1.15, Math.max(0.7, Number(raw.frameScale) || 1)),
    activeGlow: raw.activeGlow !== false,
    nameplates: !!raw.nameplates,
    names: Array.from({ length: 4 }, (_, i) => String(Array.isArray(raw.names) ? (raw.names[i] ?? "") : "").slice(0, 28)),
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

function scaleStageRects(rects, W, topY, bottomLimit, scale) {
  if (!scale || Math.abs(scale - 1) < 0.005) return rects;
  return rects.map(r => {
    const nh = Math.round(r.h * scale);
    const ny = Math.round(r.y + (r.h - nh) / 2);
    return { x: r.x, y: ny, w: r.w, h: nh };
  });
}

function getStageLayoutBoxes(count, layoutId, W, H, stage) {
  const s = W / 1080;
  const fScale = Math.min(1.15, Math.max(0.7, Number(stage?.frameScale) || 1));
  const padX = Math.round(64 * s);
  const gap = Math.round(160 * s);
  const smallGap = Math.round(38 * s);
  const topY = Math.round(334 * s);
  const bottomLimit = Math.round(1425 * s);
  const availW = W - padX * 2;
  const availH = Math.max(Math.round(420 * s), bottomLimit - topY);

  if (stage?.style === "pip" && count >= 2) {
    const mainRect = scaleStageRects([{ x: padX, y: topY, w: availW, h: availH }], W, topY, bottomLimit, fScale)[0];
    const pipW = Math.round(300 * s);
    const pipH = Math.round(370 * s * fScale);
    const margin = Math.round(24 * s);
    const rects = [mainRect];
    for (let i = 1; i < count; i++) {
      const col = i - 1;
      rects.push({
        x: Math.round(mainRect.x + mainRect.w - margin - pipW - col * (pipW + Math.round(16 * s))),
        y: Math.round(mainRect.y + mainRect.h - margin - pipH),
        w: pipW,
        h: pipH,
      });
    }
    return { rects, dividerY: mainRect.y + mainRect.h + Math.round(18 * s), topY, bottomLimit };
  }

  if (count === 1) {
    const rects = scaleStageRects([{ x: padX, y: topY, w: availW, h: availH }], W, topY, bottomLimit, fScale);
    return {
      rects,
      dividerY: rects[0].y + rects[0].h + Math.round(18 * s),
      topY,
      bottomLimit,
    };
  }

  if (count === 2) {
    if (layoutId === "cols") {
      const colW = Math.round((availW - smallGap) / 2);
      const colH = Math.round(availH * 0.78);
      const cy = topY + Math.round((availH - colH) / 2);
      const rects = scaleStageRects([{ x: padX, y: cy, w: colW, h: colH }, { x: padX + colW + smallGap, y: cy, w: colW, h: colH }], W, topY, bottomLimit, fScale);
      return {
        rects,
        dividerY: rects[0].y + rects[0].h + Math.round(28 * s),
        topY,
        bottomLimit,
      };
    }
    const cardH = Math.round((availH - gap) / 2);
    const rects = scaleStageRects([{ x: padX, y: topY, w: availW, h: cardH }, { x: padX, y: topY + cardH + gap, w: availW, h: cardH }], W, topY, bottomLimit, fScale);
    return {
      rects,
      dividerY: Math.round((rects[0].y + rects[0].h + rects[1].y) / 2),
      topY,
      bottomLimit,
    };
  }

  const slots = getLayoutSlots(count, layoutId);
  const hasTwoRows = slots.some(sl => Math.abs(sl.y - 0.5) < 0.01) && slots.every(sl => sl.y === 0 || Math.abs(sl.y - 0.5) < 0.01);
  const twoRowH = Math.round((availH - gap) / 2);
  const rects = slots.map(sl => {
    const x = Math.round(padX + sl.x * availW + (sl.x > 0 ? smallGap / 2 : 0));
    const w = Math.round(sl.w * availW - (sl.w < 1 ? smallGap / 2 : 0));
    if (hasTwoRows) {
      const y = sl.y > 0.25 ? topY + twoRowH + gap : topY;
      return { x, y, w, h: twoRowH };
    }
    return {
      x,
      y: Math.round(topY + sl.y * (availH - Math.round(64 * s)) + (sl.y > 0 ? smallGap / 2 : 0)),
      w,
      h: Math.round(sl.h * (availH - Math.round(64 * s)) - (sl.h < 1 ? smallGap / 2 : 0)),
    };
  });
  const scaled = scaleStageRects(rects, W, topY, bottomLimit, fScale);
  return {
    rects: scaled,
    dividerY: Math.max(...scaled.map(r => r.y + r.h)) + Math.round(18 * s),
    topY,
    bottomLimit,
  };
}

function drawStageBackground(ctx, W, H, preset, timestamp, sourceFrame = null) {
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

function drawStageNameplate(ctx, rect, text, accent, isActive, s) {
  const label = String(text || "").trim();
  if (!label) return;
  const padX = Math.round(14 * s);
  const ph = Math.round(34 * s);
  const margin = Math.round(16 * s);
  const maxW = Math.max(40, rect.w - margin * 2);
  ctx.save();
  ctx.font = `600 ${Math.max(9, Math.round(20 * s))}px "Inter", system-ui, sans-serif`;
  const tw = Math.min(maxW - padX * 2, ctx.measureText(label).width);
  const pw = Math.min(maxW, Math.round(tw + padX * 2));
  const px = rect.x + margin;
  const py = rect.y + rect.h - margin - ph;
  stageRoundRectPath(ctx, px, py, pw, ph, ph / 2);
  ctx.fillStyle = "rgba(10, 14, 24, 0.80)";
  ctx.fill();
  ctx.lineWidth = Math.max(1, 1.4 * s);
  ctx.strokeStyle = isActive ? stageRgba(accent, 0.85) : "rgba(255, 255, 255, 0.22)";
  ctx.stroke();
  ctx.beginPath();
  ctx.rect(px + padX / 2, py, pw - padX, ph);
  ctx.clip();
  ctx.fillStyle = "#f8fafc";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(label, px + padX, py + ph / 2 + s * 0.5);
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

  drawStageBackground(ctx, W, H, preset, timestamp, preset.id === "blurred" ? source : null);

  const count = frameBoxes.length;
  let levels = new Array(count).fill(0);
  if (stage.activeGlow) {
    levels = stageFallbackLevels(stage, count, timestamp, energy);
  }
  const anySpeaking = Math.max(0, ...levels) > 0.35 && stage.speakerFocus !== "both";
  const pulse = 0.65 + 0.35 * energy;

  const px = r => ({ x: r.x * sw, y: r.y * sh, w: r.w * sw, h: r.h * sh });
  const radius = Math.round(30 * s);

  const order = style === "pip"
    ? levels.map((_, i) => i)
    : levels.map((_, i) => i).sort((a, b) => levels[a] - levels[b]);

  order.forEach(idx => {
    const base = layoutInfo.rects[idx];
    if (!base) return;
    const L = Math.min(1, Math.max(0, levels[idx] || 0));
    const lift = style === "pip" ? 0 : 0.035 * L;
    const grow = 1 + lift;
    const w2 = Math.round(base.w * grow), h2 = Math.round(base.h * grow);
    const rect = {
      x: Math.round(base.x - (w2 - base.w) / 2),
      y: Math.round(base.y - (h2 - base.h) / 2 - (lift ? 8 * s * L : 0)),
      w: w2, h: h2,
    };
    const m = mapBox(px(frameBoxes[idx]), rect.w, rect.h, frame.fit);

    if (L > 0.02) {
      ctx.save();
      stageRoundRectPath(ctx, rect.x, rect.y, rect.w, rect.h, radius);
      ctx.shadowColor = stageRgba(preset.accent, 0.62 * L * pulse);
      ctx.shadowBlur = Math.round((36 + 34 * energy) * s * L + 4 * s);
      ctx.fillStyle = "#000";
      ctx.fill();
      ctx.restore();
    }

    ctx.save();
    ctx.shadowColor = `rgba(0, 0, 0, ${0.55 + 0.25 * L})`;
    ctx.shadowBlur = Math.round((16 + 24 * L) * s);
    ctx.shadowOffsetY = Math.round((8 + 16 * L) * s);
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
      const dim = 0.34 * (1 - L);
      if (dim > 0.01) { ctx.fillStyle = `rgba(6, 9, 15, ${dim})`; ctx.fillRect(rect.x, rect.y, rect.w, rect.h); }
    }
    if (L > 0.02) {
      const sheen = ctx.createLinearGradient(0, rect.y, 0, rect.y + rect.h * 0.35);
      sheen.addColorStop(0, `rgba(255, 255, 255, ${0.12 * L})`);
      sheen.addColorStop(1, "rgba(255, 255, 255, 0)");
      ctx.fillStyle = sheen;
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h * 0.35);
    }
    ctx.restore();

    ctx.save();
    stageRoundRectPath(ctx, rect.x, rect.y, rect.w, rect.h, radius);
    ctx.lineWidth = Math.max(1, 1.5 * s);
    ctx.strokeStyle = style === "pip" && idx > 0
      ? stageRgba(preset.accent, 0.85)
      : "rgba(148, 163, 184, 0.25)";
    ctx.stroke();

    if (L > 0.02) {
      const rim = ctx.createLinearGradient(0, rect.y, 0, rect.y + rect.h);
      rim.addColorStop(0, stageRgba("#ffffff", 0.9 * L));
      rim.addColorStop(0.5, stageRgba(preset.accent, 0.95 * L));
      rim.addColorStop(1, stageRgba(preset.accent, 0.6 * L));
      ctx.lineWidth = Math.max(1, (1.5 + (2 + 1.5 * energy) * L) * s);
      ctx.strokeStyle = rim;
      ctx.stroke();
    }
    ctx.restore();
    if (stage.nameplates && stage.names && stage.names[idx]) {
      drawStageNameplate(ctx, rect, stage.names[idx], preset.accent, L > 0.35, s);
    }
  });


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
