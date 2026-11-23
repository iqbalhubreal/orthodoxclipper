"use strict";
/* 3D Phone Mockup Animator (Three.js r128): wraps the composed 1080x1920 vertical video inside a 3D phone zoom-out/table/zoom-in animation.
   Uses a single shared WebGLRenderer with preserveDrawingBuffer: true so Android WebView neither hits context limits nor drops frames on drawImage(). */
const ANIM_SW = 720, ANIM_SH = 1536, ANIM_VY = 128, ANIM_VH = 1280;
const ANIM_ZO = 1.4, ANIM_REST = 3.5, ANIM_ZI = 1.2;
const ANIM_CAM = { full: [90, 18.47, 0], rest: [90, 31, 0] };
const ANIM_END = [90, 29.8, 0];

const ANIM_SWATCHES = [
  { name: "Silver", color: 0xc5d5e4, ti: false },
  { name: "Blue", color: 0x8faac2, ti: false },
  { name: "Pink", color: 0xf2d4dc, ti: false },
  { name: "Black", color: 0x2a2b30, ti: false },
  { name: "Natural titanium", color: 0xb9b3a9, ti: true },
];

const ANIM_STICKERS = {
  follow:    { name: "Follow",    badge: "Follow",    text: "Follow for more clips",     c1: "#8b7cf6", c2: "#ec4899", icon: "spark" },
  subscribe: { name: "Subscribe", badge: "Subscribe", text: "Subscribe for daily drops", c1: "#ef4444", c2: "#f97316", icon: "play" },
  custom:    { name: "Custom",    badge: "Custom",    text: "Your message here",         c1: "#64748b", c2: "#334155", icon: "text" },
};

const anim = {
  index: 0,
  frame: null,
  returnToEditor: false,
  scope: "all",
  cfg: typeof defaultAnimPrefs === "function" ? defaultAnimPrefs() : { enabled: false, scope: "all", color: 0xc5d5e4, ti: false, surface: "wood", sticker: true, stickerPreset: "follow", stickerText: "Follow for more clips" },
  playing: true,
  sound: false,
  t: 0,
  last: 0,
  raf: 0,
  video: null,
  baseCv: null,
  layers: [],
  engine: null,
};

function animClamp(v, a = 0, b = 1) { return Math.min(b, Math.max(a, v)); }
function animLerp(a, b, k) { return a + (b - a) * k; }
function animEase(k) { k = animClamp(k); return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; }
function animEaseBack(k) { k = animClamp(k); const c = 1.70158; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); }
function animTimeline(duration) {
  const total = Math.max(4, Number(duration) || 10);
  const a = total * 0.4;
  const avail = Math.max(1.5, total - a);
  const rest = Math.min(ANIM_REST, Math.max(0.6, avail - 0.8));
  const rem = Math.max(0.6, avail - rest);
  const ratio = ANIM_ZO + ANIM_ZI;
  const zo = rem >= ratio ? ANIM_ZO : rem * (ANIM_ZO / ratio);
  const zi = rem >= ratio ? ANIM_ZI : rem * (ANIM_ZI / ratio);
  const b = a + zo, c = b + rest, d = c + zi;
  return { a, b, c, d, zo, rest, zi, total };
}
function animRR(ctx, x, y, w, h, r) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, rad);
  else {
    ctx.moveTo(x + rad, y);
    ctx.arcTo(x + w, y, x + w, y + h, rad);
    ctx.arcTo(x + w, y + h, x, y + h, rad);
    ctx.arcTo(x, y + h, x, y, rad);
    ctx.arcTo(x, y, x + w, y, rad);
    ctx.closePath();
  }
}

function getAnimEngine() {
  if (anim.engine) return anim.engine;
  if (!window.THREE) return null;
  const THREE = window.THREE;

  const glCv = document.createElement("canvas");
  glCv.width = 1080; glCv.height = 1920;
  const src = document.createElement("canvas");
  src.width = ANIM_SW; src.height = ANIM_SH;
  const sx = src.getContext("2d");
  const hud = document.createElement("canvas");
  hud.width = 1080; hud.height = 1920;
  const hx = hud.getContext("2d");

  const renderer = new THREE.WebGLRenderer({ canvas: glCv, antialias: true, alpha: false, preserveDrawingBuffer: true });
  renderer.setSize(1080, 1920, false);
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x12131b);
  scene.fog = new THREE.Fog(0x12131b, 60, 130);
  const camera = new THREE.PerspectiveCamera(35, 9 / 16, 0.1, 250);

  {
    const pm = new THREE.PMREMGenerator(renderer), env = new THREE.Scene();
    env.add(new THREE.Mesh(new THREE.SphereGeometry(60, 32, 16), new THREE.MeshBasicMaterial({ color: 0x1d2030, side: THREE.BackSide })));
    const panel = (x, y, z, w, h, c, s) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(s), side: THREE.DoubleSide }));
      m.position.set(x, y, z); m.lookAt(0, 0, 0); env.add(m);
    };
    panel(-24, 34, 22, 34, 22, 0xffffff, 5);
    panel(28, 16, -16, 20, 34, 0xffd9a8, 3);
    panel(0, 46, 0, 44, 44, 0xaab4ff, 2);
    scene.environment = pm.fromScene(env).texture;
    pm.dispose();
  }

  const key = new THREE.DirectionalLight(0xfff0dc, 1.75);
  key.position.set(-10, 26, -12);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -15, right: 15, top: 18, bottom: -18, near: 1, far: 70 });
  key.shadow.bias = -0.0002;
  key.shadow.normalBias = 0.025;
  key.shadow.radius = 5;
  scene.add(key, new THREE.HemisphereLight(0x9fb0ff, 0x2a1d12, 0.52));

  const SURF_CACHE = {};
  function surfTex(k) {
    if (SURF_CACHE[k]) return SURF_CACHE[k];
    const c = document.createElement("canvas"); c.width = c.height = 1024;
    const g = c.getContext("2d"), Q = Math.random;
    if (k === "wood") {
      g.fillStyle = "#6e4c30"; g.fillRect(0, 0, 1024, 1024);
      for (let i = 0; i < 1600; i++) {
        g.fillStyle = `rgba(${Q() < 0.5 ? "32,18,8" : "160,112,66"},${Q() * 0.12})`;
        g.fillRect(Q() * 1024, Q() * 1024, Q() * 520 + 30, Q() * 2.2 + 0.4);
      }
      g.strokeStyle = "rgba(0,0,0,.4)"; g.lineWidth = 3;
      for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(0, i * 256); g.lineTo(1024, i * 256); g.stroke(); }
      const tx = new THREE.CanvasTexture(c);
      tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.repeat.set(6, 6); tx.anisotropy = 4; tx.encoding = THREE.sRGBEncoding;
      return (SURF_CACHE.wood = tx);
    }
    g.fillStyle = k === "marble" ? "#e9e8e6" : "#8b8b8e"; g.fillRect(0, 0, 1024, 1024);
    if (k === "marble") {
      for (let i = 0; i < 16; i++) {
        g.strokeStyle = `rgba(70,75,90,${0.08 + Q() * 0.25})`; g.lineWidth = 0.6 + Q() * 2.4;
        g.beginPath(); let x = Q() * 1024, y = 0; g.moveTo(x, y);
        while (y < 1024) { x += (Q() - 0.5) * 90; y += 30 + Q() * 40; g.lineTo(x, y); }
        g.stroke();
      }
    } else {
      for (let i = 0; i < 5000; i++) {
        g.fillStyle = `rgba(${Q() < 0.5 ? "30,30,34" : "200,200,205"},${Q() * 0.16})`;
        g.fillRect(Q() * 1024, Q() * 1024, Q() * 5 + 1, Q() * 5 + 1);
      }
    }
    const tx = new THREE.CanvasTexture(c);
    tx.wrapS = tx.wrapT = THREE.RepeatWrapping; tx.repeat.set(5, 5); tx.anisotropy = 4; tx.encoding = THREE.sRGBEncoding;
    return (SURF_CACHE[k] = tx);
  }

  const table = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), new THREE.MeshStandardMaterial({ map: surfTex("wood"), roughness: 0.5, metalness: 0 }));
  table.rotation.x = -Math.PI / 2; table.receiveShadow = true; scene.add(table);

  {
    const c = document.createElement("canvas"); c.width = 512; c.height = 1024;
    const g = c.getContext("2d");
    g.shadowColor = "rgba(0,0,0,.34)"; g.shadowBlur = 42; g.shadowOffsetX = 24; g.shadowOffsetY = 32;
    g.fillStyle = "rgba(0,0,0,.10)";
    animRR(g, 78, 118, 356, 780, 58); g.fill();
    const tx = new THREE.CanvasTexture(c); tx.encoding = THREE.sRGBEncoding;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(10.4, 20.2), new THREE.MeshBasicMaterial({ map: tx, transparent: true, opacity: 0.68, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.set(0.34, 0.012, 0.46); scene.add(m);
  }

  function rrShape(w, h, r) {
    const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
    s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r);
    s.quadraticCurveTo(x + w, y + h, x + w - r, y + h); s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
    s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); return s;
  }
  function flatGeo(w, h, r) {
    const g = new THREE.ShapeGeometry(rrShape(w, h, r), 14), p = g.attributes.position, u = g.attributes.uv;
    for (let i = 0; i < p.count; i++) u.setXY(i, p.getX(i) / w + 0.5, p.getY(i) / h + 0.5);
    return g;
  }

  const phone = new THREE.Group(); phone.rotation.order = "YXZ";
  const frameMat = new THREE.MeshStandardMaterial({ color: 0xc5d5e4, metalness: 0.82, roughness: 0.4, envMapIntensity: 0.65 });
  const backMat = new THREE.MeshStandardMaterial({ color: 0xd6e2ed, metalness: 0.08, roughness: 0.55, envMapIntensity: 0.8 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x0a0a0e, metalness: 0.4, roughness: 0.15 });
  const FZ = 0.39;
  const bodyGeo = new THREE.ExtrudeGeometry(rrShape(7.04, 14.64, 1.05), { depth: 0.66, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 4, curveSegments: 16 });
  bodyGeo.translate(0, 0, -0.33);
  const body = new THREE.Mesh(bodyGeo, frameMat); body.castShadow = true;
  const back = new THREE.Mesh(flatGeo(7.0, 14.5, 1.0), backMat); back.rotation.y = Math.PI; back.position.z = -FZ - 0.002;
  const glass = new THREE.Mesh(flatGeo(7.0, 14.5, 1.0), dark); glass.position.z = FZ + 0.002;
  const tex = new THREE.CanvasTexture(src); tex.encoding = THREE.sRGBEncoding; tex.anisotropy = 4;
  const screen = new THREE.Mesh(flatGeo(6.55, 13.973, 0.78), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })); screen.position.z = FZ + 0.008;

  const gc2 = document.createElement("canvas"); gc2.width = gc2.height = 256;
  {
    const g = gc2.getContext("2d"), gr = g.createLinearGradient(0, 0, 256, 256);
    gr.addColorStop(0, "rgba(255,255,255,0)"); gr.addColorStop(0.4, "rgba(255,255,255,0)");
    gr.addColorStop(0.5, "rgba(255,255,255,.9)"); gr.addColorStop(0.6, "rgba(255,255,255,0)"); gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  }
  const gt = new THREE.CanvasTexture(gc2);
  const glare = new THREE.Mesh(flatGeo(6.55, 13.973, 0.78), new THREE.MeshBasicMaterial({ map: gt, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  glare.position.z = FZ + 0.016;
  const island = new THREE.Mesh(flatGeo(2.0, 0.62, 0.31), new THREE.MeshBasicMaterial({ color: 0x000000 })); island.position.set(0, 6.45, FZ + 0.024);
  const lensDot = new THREE.Mesh(new THREE.CircleGeometry(0.1, 20), new THREE.MeshBasicMaterial({ color: 0x0a0c14 })); lensDot.position.set(0.62, 6.45, FZ + 0.03);
  phone.add(body, back, glass, screen, glare, island, lensDot);

  const rs = rrShape(7.0, 14.5, 1.0); rs.holes.push(rrShape(6.88, 14.38, 0.94));
  const rim = new THREE.Mesh(new THREE.ShapeGeometry(rs, 14), new THREE.MeshBasicMaterial({ color: 0x3a3e4c })); rim.position.z = FZ + 0.004;
  const bc = document.createElement("canvas"); bc.width = 560; bc.height = 1160;
  { const g = bc.getContext("2d"); g.shadowColor = "#fff"; g.shadowBlur = 24; g.fillStyle = "#fff"; animRR(g, 18, 21, 524, 1118, 62); g.fill(); }
  const bloom = new THREE.Mesh(flatGeo(7.0, 14.5, 1.0), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(bc), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  bloom.position.z = FZ + 0.005;
  const gloss = new THREE.Mesh(flatGeo(6.55, 13.973, 0.78), new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0, roughness: 0.04, metalness: 0, envMapIntensity: 2.5, depthWrite: false }));
  gloss.position.z = FZ + 0.012;
  phone.add(rim, bloom, gloss);

  const camBox = new THREE.Mesh(new THREE.ExtrudeGeometry(rrShape(3.35, 3.35, 0.75), { depth: 0.1, bevelEnabled: false, curveSegments: 14 }), backMat);
  camBox.rotation.y = Math.PI; camBox.position.set(1.6, 5.4, -FZ - 0.004); phone.add(camBox);
  for (const [lx, ly] of [[2.35, 6.15], [0.85, 4.65]]) {
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.66, 0.66, 0.12, 32), new THREE.MeshStandardMaterial({ color: 0xc9ccd4, metalness: 1, roughness: 0.2 }));
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.14, 32), dark), glint = new THREE.Mesh(new THREE.CircleGeometry(0.14, 16), new THREE.MeshBasicMaterial({ color: 0x3b4a7a }));
    ring.rotation.x = lens.rotation.x = Math.PI / 2; ring.position.set(lx, ly, -FZ - 0.165); lens.position.set(lx, ly, -FZ - 0.175);
    glint.rotation.y = Math.PI; glint.position.set(lx - 0.15, ly + 0.08, -FZ - 0.252); phone.add(ring, lens, glint);
  }
  const flash = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.06, 24), new THREE.MeshStandardMaterial({ color: 0xf1ead2, roughness: 0.4 }));
  flash.rotation.x = Math.PI / 2; flash.position.set(0.85, 6.2, -FZ - 0.12); phone.add(flash);
  for (const [x, y, l, w] of [[-1, 4.95, 0.62, 0.06], [-1, 3.55, 1.35, 0.08], [-1, 1.75, 1.35, 0.08], [1, 3.5, 2.0, 0.08]]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, l, 0.22), frameMat); b.position.set(x * 3.58, y, 0); phone.add(b);
  }
  phone.position.set(0, FZ, 0); phone.rotation.set(-Math.PI / 2, 0, 0);
  scene.add(phone);


  const gcv = document.createElement("canvas"); gcv.width = gcv.height = 256;
  { const g = gcv.getContext("2d"), r = g.createRadialGradient(128, 128, 10, 128, 128, 128); r.addColorStop(0, "rgba(255,255,255,.9)"); r.addColorStop(0.4, "rgba(255,255,255,.3)"); r.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = r; g.fillRect(0, 0, 256, 256); }
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(30, 36), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(gcv), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 }));
  glow.rotation.x = -Math.PI / 2; glow.position.set(0, 0.04, 0); scene.add(glow);
  const sl = new THREE.PointLight(0xffffff, 0, 60, 1.6); sl.position.set(0, 2.5, 0); scene.add(sl);

  const pxc = document.createElement("canvas"); pxc.width = pxc.height = 4;
  const pxg = pxc.getContext("2d", { willReadFrequently: true });

  anim.engine = {
    glCv, src, sx, hud, hx, renderer, scene, camera, table, phone,
    frameMat, backMat, tex, glare, gt, glow, sl, pxc, pxg, FZ, surfTex,
  };
  return anim.engine;
}

function drawAnimChrome(sx) {
  sx.setTransform(1, 0, 0, 1, 0, 0);
  sx.fillStyle = "#000";
  sx.fillRect(0, 0, ANIM_SW, ANIM_VY);
  sx.fillRect(0, ANIM_VY + ANIM_VH, ANIM_SW, ANIM_SH - ANIM_VY - ANIM_VH);
  sx.fillStyle = sx.strokeStyle = "#fff";
  sx.textAlign = "center"; sx.textBaseline = "middle";
  sx.font = "600 28px system-ui, -apple-system, sans-serif";
  sx.fillText("9:41", 118, 62);
  for (let i = 0; i < 4; i++) sx.fillRect(498 + i * 11, 72 - (8 + i * 4), 7, 8 + i * 4);
  sx.lineWidth = 4; sx.lineCap = "round";
  for (let i = 1; i <= 3; i++) { sx.beginPath(); sx.arc(578, 74, i * 7, -2.4, -0.74); sx.stroke(); }
  sx.lineWidth = 2.5; sx.globalAlpha = 0.6;
  animRR(sx, 616, 50, 52, 25, 8); sx.stroke();
  sx.globalAlpha = 1;
  animRR(sx, 620, 54, 38, 17, 5); sx.fill();
  sx.fillRect(671, 58, 4, 9);
  animRR(sx, ANIM_SW / 2 - 120, 1496, 240, 9, 5); sx.fill();
}

function drawAnimStickerIcon(hx, type) {
  hx.fillStyle = "#fff";
  if (type === "spark") {
    hx.beginPath();
    for (let i = 0; i < 8; i++) { const r = i % 2 ? 6.5 : 16, a = i * Math.PI / 4; hx[i ? "lineTo" : "moveTo"](Math.cos(a) * r, Math.sin(a) * r); }
    hx.closePath(); hx.fill();
  } else if (type === "play") {
    hx.beginPath(); hx.moveTo(-7, -11); hx.lineTo(12, 0); hx.lineTo(-7, 11); hx.closePath(); hx.fill();
  } else {
    animRR(hx, -12, -10, 24, 19, 6); hx.fill();
    hx.beginPath(); hx.moveTo(-5, 7); hx.lineTo(-9, 14); hx.lineTo(2, 7); hx.closePath(); hx.fill();
  }
}

function drawAnimSticker(hx, time, L, cfg) {
  hx.setTransform(1, 0, 0, 1, 0, 0);
  hx.clearRect(0, 0, 1080, 1920);
  if (!cfg.sticker) return;
  const inStart = L.b + 0.3, inDur = 0.48, outStart = L.c - 0.05, outDur = 0.35;
  if (inStart >= outStart || time < inStart || time > outStart + outDur) return;
  let p = 1, alpha = 1, sc = 1;
  if (time < inStart + inDur) {
    const u = animClamp((time - inStart) / inDur);
    p = animEaseBack(u); alpha = animClamp(u * 2.2); sc = animLerp(0.9, 1, p);
  } else if (time > outStart) {
    const u = animClamp((time - outStart) / outDur);
    p = 1 - animEase(u); alpha = 1 - u; sc = animLerp(1, 0.92, u);
  }
  const S = ANIM_STICKERS[cfg.stickerPreset] || ANIM_STICKERS.follow;
  const text = (cfg.stickerText || S.text).trim() || S.text;
  hx.save();
  const w = 920, h = 122, cx = 540, y = animLerp(-150, 58, p) + h / 2;
  hx.globalAlpha = animClamp(alpha);
  hx.translate(cx, y); hx.scale(sc, sc);
  hx.shadowColor = "rgba(0,0,0,.5)"; hx.shadowBlur = 32; hx.shadowOffsetY = 12;
  hx.fillStyle = "rgba(18, 18, 26, .92)";
  animRR(hx, -w / 2, -h / 2, w, h, 38); hx.fill();
  hx.shadowColor = "transparent";
  hx.lineWidth = 2.5; hx.strokeStyle = "rgba(255,255,255,.18)"; hx.stroke();
  const pulse = 1 + 0.06 * Math.sin(time * 5);
  const bx = -w / 2 + 60;
  const bg = hx.createLinearGradient(bx - 32, -32, bx + 32, 32);
  bg.addColorStop(0, S.c1); bg.addColorStop(1, S.c2);
  hx.save(); hx.translate(bx, 0); hx.scale(pulse, pulse);
  hx.fillStyle = bg; hx.beginPath(); hx.arc(0, 0, 32, 0, Math.PI * 2); hx.fill();
  drawAnimStickerIcon(hx, S.icon); hx.restore();
  hx.font = "700 28px system-ui, sans-serif";
  const pw = Math.max(132, Math.ceil(hx.measureText(S.badge).width) + 52), ph = 62, px = w / 2 - pw - 24;
  const fGrad = hx.createLinearGradient(px, 0, px + pw, 0);
  fGrad.addColorStop(0, S.c1); fGrad.addColorStop(1, S.c2);
  hx.fillStyle = fGrad; animRR(hx, px, -ph / 2, pw, ph, 31); hx.fill();
  hx.fillStyle = "#fff"; hx.textAlign = "center"; hx.textBaseline = "middle"; hx.fillText(S.badge, px + pw / 2, 2);
  hx.fillStyle = "#f4f4f8"; hx.font = "650 32px system-ui, sans-serif"; hx.textAlign = "left";
  const tx = bx + 48, maxW = px - tx - 20;
  let label = text;
  while (label.length > 4 && hx.measureText(label).width > maxW) label = label.slice(0, -2) + "…";
  hx.fillText(label, tx, 2);
  hx.restore();
}

function applyAnimSceneConfig(eng, cfg) {
  const color = Number.isFinite(Number(cfg.color)) ? Number(cfg.color) : 0xc5d5e4;
  const ti = !!cfg.ti;
  eng.frameMat.color.setHex(color);
  eng.backMat.color.setHex(color);
  eng.frameMat.metalness = ti ? 0.95 : 0.82;
  eng.backMat.metalness = ti ? 0.55 : 0.08;
  eng.backMat.roughness = ti ? 0.4 : 0.55;
  const surf = ["wood", "marble", "concrete"].includes(cfg.surface) ? cfg.surface : "wood";
  eng.table.material.map = eng.surfTex(surf);
  eng.table.material.roughness = { wood: 0.5, marble: 0.22, concrete: 0.85 }[surf];
  eng.table.material.needsUpdate = true;
}

function animatorRenderAt(nowTime, targetCtx, sourceCanvas, cfg, W = 1080, H = 1920, duration = 10) {
  const eng = getAnimEngine();
  if (!eng || !targetCtx || !sourceCanvas) {
    if (targetCtx && sourceCanvas) targetCtx.drawImage(sourceCanvas, 0, 0, W, H);
    return;
  }
  const c = cfg || anim.cfg;
  const L = animTimeline(duration);
  const t = Number(nowTime) || 0;
  let o = 1;
  if (t >= L.a && t < L.d) {
    o = t < L.a + 0.2 ? 1 - (t - L.a) / 0.2 : t < L.d - 0.2 ? 0 : (t - (L.d - 0.2)) / 0.2;
  }
  if (o < 1) {
    applyAnimSceneConfig(eng, c);
    eng.sx.setTransform(1, 0, 0, 1, 0, 0);
    eng.sx.fillStyle = "#000";
    eng.sx.fillRect(0, 0, ANIM_SW, ANIM_SH);
    eng.sx.drawImage(sourceCanvas, 0, ANIM_VY, ANIM_SW, ANIM_VH);
    drawAnimChrome(eng.sx);

    const R = (a, b, k) => a.map((v, i) => animLerp(v, b[i], k));
    let p;
    if (t < L.b) p = R(ANIM_CAM.full, ANIM_CAM.rest, animEase((t - L.a) / Math.max(0.1, L.zo)));
    else if (t < L.c) p = R(ANIM_CAM.rest, ANIM_END, animEase((t - L.b) / Math.max(0.1, L.rest)));
    else p = R(ANIM_END, ANIM_CAM.full, animEase((t - L.c) / Math.max(0.1, L.zi)));
    const el = p[0] * Math.PI / 180, yw = p[2], d = p[1];
    eng.camera.position.set(Math.sin(yw) * Math.cos(el) * d, eng.FZ + Math.sin(el) * d, Math.cos(yw) * Math.cos(el) * d);
    eng.camera.up.set(-Math.sin(yw), 0, -Math.cos(yw));
    eng.camera.lookAt(0, eng.FZ, 0);

    eng.pxg.drawImage(eng.src, 0, ANIM_VY, ANIM_SW, ANIM_VH, 0, 0, 4, 4);
    const data = eng.pxg.getImageData(0, 0, 4, 4).data;
    let r = 0, g = 0, b = 0;
    for (let i = 0; i < 64; i += 4) { r += data[i]; g += data[i + 1]; b += data[i + 2]; }
    eng.glow.material.color.setRGB(r / 4080, g / 4080, b / 4080);

    const w = t < L.a ? 0 : t < L.b ? animEase((t - L.a) / Math.max(0.1, L.zo)) : t < L.c ? 1 : t < L.d ? 1 - animEase((t - L.c) / Math.max(0.1, L.zi)) : 0;
    eng.phone.position.y = eng.FZ;
    eng.phone.rotation.y = 0;
    const ph = ((t - L.b - 0.5) % 3.2) / 1.4, k = 1.1 - 2.2 * animClamp(ph);
    eng.gt.offset.set(k, k);
    const activeRest = t >= L.b + 0.5 && t < L.c && ph >= 0 && ph <= 1 && o < 0.05;
    eng.glare.material.opacity = activeRest ? 0.22 * (1 - Math.abs(2 * ph - 1)) : 0;
    eng.glow.material.opacity = 0.6 * w;
    eng.sl.color.copy(eng.glow.material.color);
    eng.sl.intensity = 1.8 * w;

    eng.tex.needsUpdate = true;
    eng.renderer.render(eng.scene, eng.camera);
    targetCtx.drawImage(eng.glCv, 0, 0, W, H);
  }
  if (o > 0) {
    targetCtx.save();
    targetCtx.globalAlpha = o;
    targetCtx.drawImage(sourceCanvas, 0, 0, W, H);
    targetCtx.restore();
  }
  drawAnimSticker(eng.hx, t, L, c);
  targetCtx.drawImage(eng.hud, 0, 0, W, H);
}

/* ---- Animator Modal UI & Preview ---- */
function animComposeBase(v, ts) {
  const W = 540, H = 960;
  if (!anim.baseCv) anim.baseCv = Object.assign(document.createElement("canvas"), { width: W, height: H });
  const bctx = anim.baseCv.getContext("2d");
  if (anim.frame && v && v.videoWidth && v.videoHeight) {
    const boxes = getFrameBoxes(anim.frame), slots = typeof getFrameSlots === "function" ? getFrameSlots(anim.frame) : getLayoutSlots(boxes.length, anim.frame.layout);
    const sw = v.videoWidth, sh = v.videoHeight;
    const sq = !!anim.frame.square1x1, cY = sq ? Math.round((H - W) / 2) : 0, cH = sq ? W : H;
    bctx.fillStyle = "#000"; bctx.fillRect(0, 0, W, H);
    bctx.save();
    if (sq) { bctx.beginPath(); bctx.rect(0, cY, W, cH); bctx.clip(); }
    if (anim.frame.stage?.enabled && typeof drawStageComposition === "function") {
      if (sq) bctx.translate(0, cY);
      const opts = typeof previewStageOpts === "function" ? previewStageOpts(state.outputs[anim.index], anim.frame, ts) : { energy: 0.55, timestamp: ts };
      drawStageComposition(bctx, v, sw, sh, boxes, anim.frame, W, cH, { ...opts, showGuide: false });
    } else {
      const px = r => ({ x: r.x * sw, y: r.y * sh, w: r.w * sw, h: r.h * sh });
      boxes.forEach((box, idx) => {
        const sl = slots[idx], dx = Math.round(sl.x * W), dy = cY + Math.round(sl.y * cH), dw = Math.round(sl.w * W), dh = Math.round(sl.h * cH);
        const m = mapBox(px(box), dw, dh, anim.frame.fit);
        bctx.drawImage(v, m.sx, m.sy, m.sw, m.sh, dx + m.dx, dy + m.dy, m.dw, m.dh);
      });
      if (typeof drawDividerLines === "function") {
        if (sq) { bctx.translate(0, cY); drawDividerLines(bctx, W, cH, anim.frame); }
        else drawDividerLines(bctx, W, H, anim.frame);
      }
    }
    bctx.restore();
    if (anim.layers.length && typeof drawVerticalLayers === "function") {
      drawVerticalLayers(bctx, anim.baseCv, W, H, anim.layers, ts);
    }
    const capCfg = state.outputs[anim.index]?.vCaptions;
    if (capCfg?.enabled && typeof drawCaptions === "function") {
      drawCaptions(bctx, W, H, capCfg, ts);
    }
  } else {
    bctx.fillStyle = "#0f1018";
    bctx.fillRect(0, 0, W, H);
  }
  return anim.baseCv;
}

function drawAnimPreview() {
  const cv = $("#anim-canvas");
  if (!cv) return;
  const ctx = cv.getContext("2d"), W = cv.width, H = cv.height;
  const v = anim.video;
  const srcCv = animComposeBase(v, anim.t);
  if (!anim.cfg.enabled) {
    ctx.drawImage(srcCv, 0, 0, W, H);
    return;
  }
  animatorRenderAt(anim.t, ctx, srcCv, anim.cfg, W, H, v?.duration || 10);
}

function animBuildBar() {
  const L = animTimeline(anim.video?.duration || 10);
  const parts = [[L.a, "Video"], [L.zo, "Zoom out"], [L.rest, "On table"], [L.zi, "Zoom in"], [Math.max(0, L.total - L.d), "Video"]];
  const bar = $("#anim-bar");
  if (bar) {
    bar.innerHTML = parts.map(([d, n], i) => `<i class="p${i}" style="width:${d / L.total * 100}%">${d / L.total > 0.12 ? n : ""}</i>`).join("") + '<span class="anim-head" id="anim-head"></span>';
  }
  if ($("#anim-scrub")) $("#anim-scrub").max = L.total.toFixed(2);
  if ($("#anim-t-tot")) $("#anim-t-tot").textContent = L.total.toFixed(2) + " s";
}

function animSyncTimelineUI() {
  const L = animTimeline(anim.video?.duration || 10);
  const head = $("#anim-head");
  if (head) head.style.left = (animClamp(anim.t / L.total) * 100) + "%";
  if ($("#anim-scrub")) $("#anim-scrub").value = anim.t;
  if ($("#anim-t-now")) $("#anim-t-now").textContent = anim.t.toFixed(2) + " s";
}

function animSyncControls() {
  const c = anim.cfg;
  const total = state.outputs.length;
  const item = state.outputs[anim.index];
  if ($("#anim-clip-name")) $("#anim-clip-name").textContent = `${anim.index + 1} / ${total} · ${item?.title || `Clip ${anim.index + 1}`}`;
  if ($("#anim-prev-clip")) $("#anim-prev-clip").disabled = total <= 1 || anim.index <= 0;
  if ($("#anim-next-clip")) $("#anim-next-clip").disabled = total <= 1 || anim.index >= total - 1;
  document.querySelectorAll("#anim-scope button").forEach(b => b.classList.toggle("on", b.dataset.scope === anim.scope));
  if ($("#anim-enabled")) $("#anim-enabled").checked = !!c.enabled;
  if ($("#anim-controls-wrap")) $("#anim-controls-wrap").hidden = !c.enabled;
  document.querySelectorAll("#anim-sw button").forEach(b => b.classList.toggle("on", Number(b.dataset.c) === Number(c.color)));
  document.querySelectorAll("#anim-surf button").forEach(b => b.classList.toggle("on", b.dataset.surf === c.surface));
  if ($("#anim-stk-on")) $("#anim-stk-on").checked = !!c.sticker;
  document.querySelectorAll("#anim-stk-presets button").forEach(b => b.classList.toggle("on", b.dataset.stk === c.stickerPreset));
  if ($("#anim-stk-txt") && document.activeElement !== $("#anim-stk-txt")) $("#anim-stk-txt").value = c.stickerText || "";
  if ($("#anim-play")) $("#anim-play").textContent = anim.playing ? "⏸ Pause" : "▶ Play";
  if ($("#anim-sound")) {
    $("#anim-sound").textContent = anim.sound ? "🔊" : "🔇";
    $("#anim-sound").setAttribute("aria-pressed", String(anim.sound));
  }
  animBuildBar();
  animSyncTimelineUI();
}

function animRenderStaticUI() {
  const sw = $("#anim-sw");
  if (sw && !sw.childElementCount) {
    sw.innerHTML = ANIM_SWATCHES.map(s =>
      `<button type="button" title="${s.name}" aria-label="${s.name}" data-c="${s.color}" data-ti="${s.ti ? 1 : 0}" class="ved-color-dot" style="background:#${s.color.toString(16).padStart(6, "0")}"></button>`
    ).join("");
  }
  const stk = $("#anim-stk-presets");
  if (stk && !stk.childElementCount) {
    stk.innerHTML = Object.entries(ANIM_STICKERS).map(([k, v]) =>
      `<button type="button" data-stk="${k}">${v.name}</button>`
    ).join("");
  }
}

function animSeekVideo() {
  const v = anim.video;
  if (v && v.duration) {
    try { v.currentTime = anim.t % v.duration; } catch {}
  }
}

function animSetPlaying(on) {
  anim.playing = !!on;
  if ($("#anim-play")) $("#anim-play").textContent = anim.playing ? "⏸ Pause" : "▶ Play";
  const v = anim.video;
  if (v) {
    v.muted = !anim.sound;
    if (anim.playing) v.play().catch(() => {});
    else v.pause();
  }
}

function animLoop(now) {
  if ($("#animator")?.hidden) { anim.raf = 0; return; }
  const dt = Math.min(0.1, Math.max(0, (now - anim.last) / 1000));
  anim.last = now;
  if (anim.playing) {
    anim.t += dt;
    const L = animTimeline(anim.video?.duration || 10);
    if (anim.t >= L.total) { anim.t = 0; animSeekVideo(); }
  }
  drawAnimPreview();
  animSyncTimelineUI();
  anim.raf = requestAnimationFrame(animLoop);
}

function animSaveToState() {
  const clean = clone(anim.cfg);
  if (typeof saveClipperPrefs === "function") saveClipperPrefs({ anim: clean, animScope: anim.scope });
  if (anim.scope === "individual") {
    if (state.outputs[anim.index]) state.outputs[anim.index].vAnim = clone(clean);
  } else {
    state.outputs.forEach(out => { out.vAnim = clone(clean); });
    if (typeof saveClipperPrefs === "function") saveClipperPrefs({ anim: { ...clean, scope: "all" } });
  }
}

async function loadAnimClip(i) {
  const item = state.outputs[i];
  if (!item) return;
  animSetPlaying(false);
  if (anim.video) { try { anim.video.pause(); anim.video.removeAttribute("src"); } catch {} }
  const v = anim.video = Object.assign(document.createElement("video"), { muted: !anim.sound, loop: true, playsInline: true, preload: "auto", src: item.url });
  await new Promise((res, rej) => { v.onloadedmetadata = res; v.onerror = () => rej(new Error("preview")); });
  anim.index = i;
  const savedPrefs = typeof loadClipperPrefs === "function" ? loadClipperPrefs().anim : defaultAnimPrefs();
  anim.cfg = clone(item.vAnim || savedPrefs);
  anim.layers = typeof preloadLayerImages === "function" ? await preloadLayerImages(cloneLayers(item.vLayers)) : [];
  anim.t = 0;
  animSyncControls();
  animSetPlaying(true);
}

async function switchAnimClip(delta) {
  const next = clamp(anim.index + delta, 0, state.outputs.length - 1);
  if (next === anim.index) return;
  animSaveToState();
  try { await loadAnimClip(next); }
  catch { toast("Could not load that clip.", true); }
}

async function openAnimator(i, opts = {}) {
  if (!IS_ANDROID_APP) {
    toast("Download the Android app for this feature.", true);
    return;
  }
  if (!window.THREE) {
    toast("3D engine is still loading or unavailable offline. Check your connection and try again.", true);
    return;
  }
  const item = state.outputs[i];
  if (!item || state.busy) return;
  try {
    const savedPrefs = typeof loadClipperPrefs === "function" ? loadClipperPrefs().anim : defaultAnimPrefs();
    anim.scope = savedPrefs.scope === "individual" ? "individual" : "all";
    anim.frame = clone(opts.frame || item.vFrame || state.lastFrame || defaultFrame());
    anim.returnToEditor = !!opts.returnToEditor;
    const cv = $("#anim-canvas");
    cv.width = 540; cv.height = 960;
    $("#anim-stage").style.maxWidth = "calc(44dvh * 0.5625)";
    animRenderStaticUI();
    await loadAnimClip(i);
    $("#animator").hidden = false;
    $("#animator").scrollTop = 0;
    document.body.style.overflow = "hidden";
    cancelAnimationFrame(anim.raf);
    anim.last = performance.now();
    anim.raf = requestAnimationFrame(animLoop);
  } catch {
    toast("Could not open this clip in Animator.", true);
  }
}

function closeAnimator(reopenFraming = false) {
  cancelAnimationFrame(anim.raf);
  anim.raf = 0;
  animSetPlaying(false);
  if (anim.video) { try { anim.video.pause(); anim.video.removeAttribute("src"); } catch {} anim.video = null; }
  $("#animator").hidden = true;
  document.body.style.overflow = "";
  const back = reopenFraming && anim.returnToEditor;
  const idx = anim.index;
  anim.returnToEditor = false;
  if (back) openEditor(idx);
}

/* ---- Event Listeners ---- */
$("#anim-prev-clip")?.addEventListener("click", () => switchAnimClip(-1));
$("#anim-next-clip")?.addEventListener("click", () => switchAnimClip(1));
$("#anim-scope")?.addEventListener("click", e => {
  const b = e.target.closest("button[data-scope]");
  if (!b) return;
  anim.scope = b.dataset.scope === "individual" ? "individual" : "all";
  anim.cfg.scope = anim.scope;
  animSaveToState();
  animSyncControls();
});
$("#anim-enabled")?.addEventListener("change", e => {
  anim.cfg.enabled = e.target.checked;
  animSaveToState();
  animSyncControls();
  drawAnimPreview();
});
$("#anim-sw")?.addEventListener("click", e => {
  const b = e.target.closest("button[data-c]");
  if (!b) return;
  anim.cfg.color = Number(b.dataset.c);
  anim.cfg.ti = b.dataset.ti === "1";
  animSaveToState();
  animSyncControls();
  drawAnimPreview();
});
$("#anim-surf")?.addEventListener("click", e => {
  const b = e.target.closest("button[data-surf]");
  if (!b) return;
  anim.cfg.surface = b.dataset.surf;
  animSaveToState();
  animSyncControls();
  drawAnimPreview();
});
$("#anim-stk-on")?.addEventListener("change", e => {
  anim.cfg.sticker = e.target.checked;
  animSaveToState();
  drawAnimPreview();
});
$("#anim-stk-presets")?.addEventListener("click", e => {
  const b = e.target.closest("button[data-stk]");
  if (!b) return;
  const k = b.dataset.stk, S = ANIM_STICKERS[k];
  if (!S) return;
  anim.cfg.stickerPreset = k;
  anim.cfg.stickerText = S.text;
  anim.cfg.sticker = true;
  if ($("#anim-stk-txt")) $("#anim-stk-txt").value = S.text;
  if ($("#anim-stk-on")) $("#anim-stk-on").checked = true;
  animSaveToState();
  animSyncControls();
  drawAnimPreview();
});
$("#anim-stk-txt")?.addEventListener("input", e => {
  anim.cfg.stickerText = e.target.value.slice(0, 48);
  animSaveToState();
  drawAnimPreview();
});
$("#anim-scrub")?.addEventListener("input", e => {
  anim.t = Number(e.target.value);
  animSetPlaying(false);
  animSeekVideo();
  drawAnimPreview();
  animSyncTimelineUI();
});
$("#anim-play")?.addEventListener("click", () => animSetPlaying(!anim.playing));
$("#anim-replay")?.addEventListener("click", () => {
  anim.t = 0;
  animSeekVideo();
  animSetPlaying(true);
});
$("#anim-sound")?.addEventListener("click", () => {
  anim.sound = !anim.sound;
  if (anim.video) anim.video.muted = !anim.sound;
  animSyncControls();
});
$("#anim-back")?.addEventListener("click", () => {
  animSaveToState();
  closeAnimator(true);
});
$("#anim-save")?.addEventListener("click", () => {
  animSaveToState();
  toast(anim.scope === "all"
    ? "Animator settings applied to all clips. Click Move Back to export."
    : `Saved Animator settings to clip ${anim.index + 1}. Click Move Back to export.`);
});
document.addEventListener("keydown", e => {
  if (e.key === "Escape" && $("#animator") && !$("#animator").hidden) closeAnimator(true);
});
