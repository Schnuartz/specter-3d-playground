import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/RoundedBoxGeometry.js';
import { qrCanvas, makeQrCardTexture } from './qr.js';

export function metal(color = 0x1a1d21, roughness = 0.32, metalness = 1) {
  return new THREE.MeshPhysicalMaterial({
    color, metalness, roughness,
    envMapIntensity: 1.25,
    clearcoat: 0.25,
    clearcoatRoughness: 0.3,
  });
}

export function plastic(color = 0x101318, roughness = 0.55, metalness = 0.05) {
  return new THREE.MeshPhysicalMaterial({
    color, metalness, roughness,
    envMapIntensity: 0.9,
    clearcoat: 0.18,
    clearcoatRoughness: 0.45,
  });
}

export function glass(opacity = 0.12) {
  return new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 0,
    roughness: 0.06,
    transmission: 0,
    transparent: true,
    opacity,
    envMapIntensity: 1.6,
    clearcoat: 1,
    clearcoatRoughness: 0.03,
    depthWrite: false,
  });
}

export function skin() {
  return new THREE.MeshPhysicalMaterial({
    color: 0xc98f6f,
    roughness: 0.56,
    metalness: 0,
    clearcoat: 0.16,
    clearcoatRoughness: 0.5,
    sheen: 0.45,
    sheenColor: new THREE.Color(0xffb894),
    envMapIntensity: 0.65,
  });
}

export function screenMaterial(texture) {
  return new THREE.MeshBasicMaterial({ map: texture, toneMapped: false });
}

export function roundedRectShape(w, h, r) {
  const x = -w / 2, y = -h / 2;
  r = Math.min(r, w / 2, h / 2);
  const s = new THREE.Shape();
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
  s.lineTo(x + w, y + h - r);
  s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false);
  s.lineTo(x + r, y + h);
  s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(x, y + r);
  s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
  return s;
}

export function roundedRectGeometry(w, h, r, curveSegments = 18) {
  const geo = new THREE.ShapeGeometry(roundedRectShape(w, h, r), curveSegments);
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    uv.setXY(i, (pos.getX(i) - bb.min.x) / (bb.max.x - bb.min.x), (pos.getY(i) - bb.min.y) / (bb.max.y - bb.min.y));
  }
  uv.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

export function createMicroSD() {
  const group = new THREE.Group();
  const w = 0.011, h = 0.015, d = 0.001, notch = 0.0026, r = 0.0008;
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2 + r, -h / 2);
  shape.lineTo(w / 2 - r, -h / 2);
  shape.absarc(w / 2 - r, -h / 2 + r, r, -Math.PI / 2, 0, false);
  shape.lineTo(w / 2, h / 2 - notch);
  shape.lineTo(w / 2 - notch, h / 2 - notch);
  shape.lineTo(w / 2 - notch, h / 2 - r);
  shape.absarc(w / 2 - notch - r, h / 2 - r, r, 0, Math.PI / 2, false);
  shape.lineTo(-w / 2 + r, h / 2);
  shape.absarc(-w / 2 + r, h / 2 - r, r, Math.PI / 2, Math.PI, false);
  shape.lineTo(-w / 2, -h / 2 + r);
  shape.absarc(-w / 2 + r, -h / 2 + r, r, Math.PI, Math.PI * 1.5, false);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: d, bevelEnabled: true, bevelSize: 0.00025, bevelThickness: 0.00025, bevelSegments: 2, curveSegments: 12,
  });
  geo.translate(0, 0, -d / 2);
  const body = new THREE.Mesh(geo, plastic(0x15181d, 0.42, 0.08));
  body.castShadow = true;
  group.add(body);

  const labelCanvas = document.createElement('canvas');
  labelCanvas.width = 256; labelCanvas.height = 256;
  const lc = labelCanvas.getContext('2d');
  lc.fillStyle = '#1b2028'; lc.fillRect(0, 0, 256, 256);
  lc.fillStyle = '#e8edf4'; lc.font = '700 34px -apple-system, Segoe UI, sans-serif'; lc.textAlign = 'center';
  lc.fillText('SPECTER', 128, 92);
  lc.fillStyle = '#65c7ff'; lc.font = '700 52px -apple-system, Segoe UI, sans-serif';
  lc.fillText('8 GB', 128, 154);
  lc.fillStyle = '#8795a6'; lc.font = '400 15px -apple-system, Segoe UI, sans-serif';
  lc.fillText('microSD HC I', 128, 190);
  lc.strokeStyle = '#65c7ff'; lc.lineWidth = 3; lc.beginPath(); lc.arc(128, 220, 16, 0, Math.PI * 2); lc.stroke();
  const labelTex = new THREE.CanvasTexture(labelCanvas);
  labelTex.colorSpace = THREE.SRGBColorSpace;
  const label = new THREE.Mesh(new THREE.PlaneGeometry(0.0085, 0.0105), new THREE.MeshBasicMaterial({ map: labelTex, transparent: true }));
  label.position.set(0, 0.001, d / 2 + 0.0003);
  group.add(label);

  const gold = metal(0xc8a44a, 0.36, 1);
  for (let i = 0; i < 6; i++) {
    const pad = new THREE.Mesh(new THREE.BoxGeometry(0.00055, 0.0032, 0.00018), gold);
    pad.position.set(-0.0038 + i * 0.0015, -0.0048, d / 2 + 0.00028);
    group.add(pad);
  }
  group.userData.kind = 'microsd';
  group.userData.size = { w, h, d };
  return group;
}

export function createSmartcard() {
  const group = new THREE.Group();
  const w = 0.0856, h = 0.054, d = 0.0008;
  const body = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 4, 0.0025), plastic(0xe7ebf0, 0.48, 0.02));
  body.castShadow = true;
  group.add(body);

  const c = document.createElement('canvas');
  c.width = 1024; c.height = 646;
  const ctx = c.getContext('2d');
  const bg = ctx.createLinearGradient(0, 0, 1024, 646);
  bg.addColorStop(0, '#f4f7fa'); bg.addColorStop(1, '#dfe6ee');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, 1024, 646);
  ctx.fillStyle = 'rgba(31,153,229,.12)';
  ctx.beginPath(); ctx.arc(860, 80, 260, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#0d1520'; ctx.font = '800 42px -apple-system, Segoe UI, sans-serif';
  ctx.fillText('SPECTER', 76, 94);
  ctx.fillStyle = '#1f99e5'; ctx.font = '700 20px -apple-system, Segoe UI, sans-serif';
  ctx.fillText('MEMORYCARD', 78, 126);
  ctx.fillStyle = '#7b8896'; ctx.font = '400 16px -apple-system, Segoe UI, sans-serif';
  ctx.fillText('JavaCard secure element simulator', 78, 154);
  const chipX = 82, chipY = 230, chipW = 150, chipH = 112;
  const chipGrad = ctx.createLinearGradient(chipX, chipY, chipX + chipW, chipY + chipH);
  chipGrad.addColorStop(0, '#f1dca0'); chipGrad.addColorStop(.5, '#c9a64e'); chipGrad.addColorStop(1, '#e6cf8b');
  ctx.fillStyle = chipGrad; ctx.beginPath(); ctx.roundRect(chipX, chipY, chipW, chipH, 14); ctx.fill();
  ctx.strokeStyle = 'rgba(60,45,10,.5)'; ctx.lineWidth = 3;
  for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(chipX + 20, chipY + i * chipH / 4); ctx.lineTo(chipX + chipW - 20, chipY + i * chipH / 4); ctx.stroke(); }
  ctx.beginPath(); ctx.moveTo(chipX + chipW / 2, chipY + 14); ctx.lineTo(chipX + chipW / 2, chipY + chipH - 14); ctx.stroke();
  ctx.fillStyle = '#0d1520'; ctx.font = '700 30px -apple-system, Segoe UI, sans-serif';
  ctx.fillText('TEST CARD', 78, 470);
  ctx.fillStyle = '#7b8896'; ctx.font = '400 18px monospace';
  ctx.fillText('CXNk…  ·  slot 1  ·  PIN 1234', 78, 505);
  ctx.fillStyle = 'rgba(13,21,32,.6)'; ctx.font = '700 15px -apple-system, Segoe UI, sans-serif';
  ctx.textAlign = 'right'; ctx.fillText('NEVER USE REAL FUNDS', 946, 610);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const front = new THREE.Mesh(roundedRectGeometry(w - 0.002, h - 0.002, 0.0025), new THREE.MeshBasicMaterial({ map: tex }));
  front.position.z = d / 2 + 0.00025;
  group.add(front);
  group.userData.kind = 'smartcard';
  group.userData.size = { w, h, d };
  return group;
}

export function createQrCard(payload, label = 'QR', accent = 0x1f99e5) {
  const group = new THREE.Group();
  const w = 0.088, h = 0.108, d = 0.0018;
  const back = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 4, 0.004), plastic(0xe9edf2, 0.5, 0.02));
  back.castShadow = true;
  group.add(back);
  const canvas = makeQrCardTexture(payload, label);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.userData.payload = String(payload);
  const front = new THREE.Mesh(roundedRectGeometry(w - 0.002, h - 0.002, 0.0035), new THREE.MeshBasicMaterial({ map: tex }));
  front.position.z = d / 2 + 0.0003;
  group.add(front);
  const edgeMat = new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.45 });
  const edge = new THREE.Mesh(roundedRectGeometry(w + 0.0004, h + 0.0004, 0.0045), edgeMat);
  edge.position.z = -d / 2 - 0.0002;
  edge.rotation.y = Math.PI;
  group.add(edge);
  group.userData = { kind: 'qr', payload: String(payload), label, texture: tex, front };
  return group;
}

export function phoneScreenCanvas(kind = 'wallet', payload = '', title = 'SPECTER') {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 1024;
  const ctx = c.getContext('2d');
  const bg = ctx.createLinearGradient(0, 0, 0, 1024);
  if (kind === 'seed') { bg.addColorStop(0, '#1d1218'); bg.addColorStop(1, '#09070b'); }
  else if (kind === 'psbt') { bg.addColorStop(0, '#101d2a'); bg.addColorStop(1, '#050a10'); }
  else { bg.addColorStop(0, '#0d2031'); bg.addColorStop(1, '#04080d'); }
  ctx.fillStyle = bg; ctx.fillRect(0, 0, 512, 1024);

  ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.font = '600 18px -apple-system, Segoe UI, sans-serif';
  ctx.textAlign = 'left'; ctx.fillText('9:41', 38, 54);
  ctx.textAlign = 'right'; ctx.fillText('5G', 450, 54);
  ctx.fillStyle = 'rgba(255,255,255,.55)';
  ctx.beginPath(); ctx.roundRect(456, 40, 26, 13, 4); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.beginPath(); ctx.roundRect(459, 43, 16, 7, 2); ctx.fill();

  ctx.fillStyle = '#000'; ctx.beginPath(); ctx.roundRect(196, 26, 120, 30, 16); ctx.fill();

  ctx.fillStyle = 'rgba(255,255,255,.45)'; ctx.font = '700 13px -apple-system, Segoe UI, sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(title.toUpperCase(), 256, 104);

  if (kind === 'seed') {
    ctx.fillStyle = '#ffb1b8'; ctx.font = '700 20px -apple-system, Segoe UI, sans-serif';
    ctx.fillText('TEST SEED — NEVER USE', 256, 150);
    ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.font = '400 14px -apple-system, Segoe UI, sans-serif';
    ctx.fillText('Scan with Specter DIY', 256, 176);
    const q = qrCanvas(payload, 340, 'L');
    ctx.imageSmoothingEnabled = false; ctx.drawImage(q, 86, 200, 340, 340); ctx.imageSmoothingEnabled = true;
    ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.font = '400 14px monospace';
    const words = String(payload).split(' ').slice(0, 6).join(' ');
    ctx.fillText(words + ' …', 256, 574);
    ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.font = '400 12px -apple-system, Segoe UI, sans-serif';
    ctx.fillText('ghost ghost ghost … machine', 256, 600);
  } else if (kind === 'psbt') {
    ctx.fillStyle = '#9fd8ff'; ctx.font = '700 22px -apple-system, Segoe UI, sans-serif';
    ctx.fillText('UNSIGNED PSBT', 256, 150);
    ctx.fillStyle = 'rgba(255,255,255,.45)'; ctx.font = '400 14px -apple-system, Segoe UI, sans-serif';
    ctx.fillText('Air-gapped transfer · scan on device', 256, 176);
    const q = qrCanvas(payload, 340, 'L');
    ctx.imageSmoothingEnabled = false; ctx.drawImage(q, 86, 210, 340, 340); ctx.imageSmoothingEnabled = true;
    ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.font = '400 13px monospace';
    ctx.fillText('0.0015 BTC · 142 sats fee', 256, 590);
  } else {
    ctx.fillStyle = 'rgba(255,255,255,.42)'; ctx.font = '600 13px -apple-system, Segoe UI, sans-serif';
    ctx.fillText('TOTAL BALANCE', 256, 156);
    ctx.fillStyle = '#f4f8fc'; ctx.font = '700 48px -apple-system, Segoe UI, sans-serif';
    ctx.fillText('0.0421 BTC', 256, 208);
    ctx.fillStyle = 'rgba(255,255,255,.4)'; ctx.font = '400 14px -apple-system, Segoe UI, sans-serif';
    ctx.fillText('Testnet demo wallet', 256, 236);
    const q = qrCanvas(payload || 'specter-diy-3d-demo', 300, 'M');
    ctx.fillStyle = 'rgba(255,255,255,.06)'; ctx.beginPath(); ctx.roundRect(86, 290, 340, 340, 24); ctx.fill();
    ctx.imageSmoothingEnabled = false; ctx.drawImage(q, 106, 310, 300, 300); ctx.imageSmoothingEnabled = true;
    ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.font = '600 16px -apple-system, Segoe UI, sans-serif';
    ctx.fillText('Receive', 256, 680);
    ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.font = '400 13px monospace';
    ctx.fillText('tb1qem2p9awpmhyts2rrg7wxnze0qm4znep…', 256, 706);
    ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.beginPath(); ctx.roundRect(56, 760, 400, 64, 18); ctx.fill();
    ctx.fillStyle = '#9fd8ff'; ctx.font = '700 18px -apple-system, Segoe UI, sans-serif';
    ctx.fillText('Send', 156, 800);
    ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fillText('Scan', 356, 800);
  }
  ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.font = '400 11px -apple-system, Segoe UI, sans-serif';
  ctx.fillText('SPECTER MOBILE · TESTNET', 256, 984);
  return c;
}

export function createPhone({ screenCanvas, frameColor = 0x3b3f46 } = {}) {
  const group = new THREE.Group();
  const w = 0.074, h = 0.154, d = 0.0085;
  const body = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 8, 0.0075), metal(frameColor, 0.28, 0.9));
  body.castShadow = true;
  group.add(body);

  const bezel = new THREE.Mesh(roundedRectGeometry(w - 0.0025, h - 0.0025, 0.007), new THREE.MeshBasicMaterial({ color: 0x030405 }));
  bezel.position.z = d / 2 + 0.0002;
  group.add(bezel);

  const canvas = screenCanvas || phoneScreenCanvas();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const screen = new THREE.Mesh(roundedRectGeometry(w - 0.006, h - 0.006, 0.006), screenMaterial(tex));
  screen.position.z = d / 2 + 0.00045;
  group.add(screen);

  const glassPlane = new THREE.Mesh(roundedRectGeometry(w - 0.006, h - 0.006, 0.006), glass(0.08));
  glassPlane.position.z = d / 2 + 0.0007;
  group.add(glassPlane);

  const island = new THREE.Mesh(new RoundedBoxGeometry(0.014, 0.0042, 0.001, 3, 0.0018), new THREE.MeshBasicMaterial({ color: 0x000000 }));
  island.position.set(0, h / 2 - 0.012, d / 2 + 0.0009);
  group.add(island);

  const camMat = metal(0x22262c, 0.22, 1);
  const islandBack = new THREE.Mesh(new RoundedBoxGeometry(0.028, 0.03, 0.003, 4, 0.006), camMat);
  islandBack.position.set(0.018, h / 2 - 0.027, -d / 2 - 0.0014);
  group.add(islandBack);
  for (const [x, y] of [[0.011, 0.055], [0.025, 0.055], [0.011, 0.041]]) {
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.0056, 0.0056, 0.002, 24), new THREE.MeshPhysicalMaterial({ color: 0x05070a, metalness: 0.4, roughness: 0.08, clearcoat: 1 }));
    lens.rotation.x = Math.PI / 2;
    lens.position.set(x, y, -d / 2 - 0.003);
    group.add(lens);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.0058, 0.00055, 8, 24), metal(0x3a3f47, 0.25, 1));
    ring.position.set(x, y, -d / 2 - 0.0031);
    group.add(ring);
  }
  const flash = new THREE.Mesh(new THREE.CylinderGeometry(0.0025, 0.0025, 0.001, 12), new THREE.MeshBasicMaterial({ color: 0xfff2cc }));
  flash.rotation.x = Math.PI / 2;
  flash.position.set(0.025, 0.041, -d / 2 - 0.0031);
  group.add(flash);

  const btnMat = metal(frameColor, 0.3, 1);
  for (const [y, len] of [[0.036, 0.018], [0.01, 0.012], [-0.022, 0.026]]) {
    const btn = new THREE.Mesh(new THREE.BoxGeometry(0.0012, len, 0.0022), btnMat);
    btn.position.set(-w / 2 - 0.0004, y, 0);
    group.add(btn);
  }
  const power = new THREE.Mesh(new THREE.BoxGeometry(0.0012, 0.03, 0.0022), btnMat);
  power.position.set(w / 2 + 0.0004, 0.026, 0);
  group.add(power);

  group.userData = { kind: 'phone', screenCanvas: canvas, screenTexture: tex, body, screen };
  return group;
}

export function createLaptopKeyboardCanvas() {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 620;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#17191d'; ctx.fillRect(0, 0, 1024, 620);
  ctx.fillStyle = '#0c0e11'; ctx.beginPath(); ctx.roundRect(0, 0, 1024, 620, 18); ctx.fill();
  const keyW = 58, keyH = 52, gap = 8;
  const startX = 92, startY = 58;
  const rows = [
    ['esc','1','2','3','4','5','6','7','8','9','0','-','=','⌫'],
    ['tab','Q','W','E','R','T','Y','U','I','O','P','[',']','\\'],
    ['caps','A','S','D','F','G','H','J','K','L',';',"'",'↵'],
    ['shift','Z','X','C','V','B','N','M',',','.','/','shift'],
    ['fn','ctrl','alt','⌘','','','','','','','','','',''],
  ];
  ctx.font = '600 15px -apple-system, Segoe UI, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  rows.forEach((row, ri) => {
    let x = startX;
    row.forEach((key, ki) => {
      let w = keyW;
      if (key === '⌫' || key === 'tab' || key === '\\' || key === 'caps' || key === 'shift' || key === '↵') w = keyW * 1.45;
      if (key === '') w = keyW * 6.4;
      if (key === 'fn' || key === 'ctrl' || key === 'alt' || key === '⌘') w = keyW * 1.1;
      ctx.fillStyle = '#262a30';
      ctx.beginPath(); ctx.roundRect(x, startY + ri * (keyH + gap), w, keyH, 8); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.06)'; ctx.lineWidth = 1; ctx.stroke();
      if (key) {
        ctx.fillStyle = 'rgba(230,238,248,.72)';
        ctx.fillText(key, x + w / 2, startY + ri * (keyH + gap) + keyH / 2 + 1);
      }
      x += w + gap;
    });
  });
  ctx.fillStyle = 'rgba(255,255,255,.03)'; ctx.beginPath(); ctx.roundRect(330, 380, 364, 190, 14); ctx.fill();
  return c;
}

export function createLaptop({ screenCanvas } = {}) {
  const group = new THREE.Group();
  const W = 0.33, D = 0.225, T = 0.012;
  const aluminum = metal(0x9aa1aa, 0.36, 0.95);
  const base = new THREE.Mesh(new RoundedBoxGeometry(W, T, D, 6, 0.004), aluminum);
  base.castShadow = true;
  base.position.y = T / 2;
  group.add(base);

  const kbCanvas = createLaptopKeyboardCanvas();
  const kbTex = new THREE.CanvasTexture(kbCanvas);
  kbTex.colorSpace = THREE.SRGBColorSpace;
  kbTex.anisotropy = 8;
  const kb = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.02, D - 0.04), new THREE.MeshBasicMaterial({ map: kbTex }));
  kb.rotation.x = -Math.PI / 2;
  kb.position.set(0, T + 0.0004, 0.008);
  group.add(kb);

  const screenLid = new THREE.Group();
  screenLid.position.set(0, T, -D / 2 + 0.006);
  screenLid.rotation.x = -Math.PI * 0.43;
  const lid = new THREE.Mesh(new RoundedBoxGeometry(W, 0.205, 0.007, 6, 0.003), aluminum);
  lid.position.y = 0.1025;
  lid.castShadow = true;
  screenLid.add(lid);

  const bezel = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.012, 0.195), new THREE.MeshBasicMaterial({ color: 0x05070a }));
  bezel.position.set(0, 0.1025, 0.0036);
  screenLid.add(bezel);

  const c = screenCanvas || document.createElement('canvas');
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const display = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.026, 0.181), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  display.position.set(0, 0.1025, 0.0038);
  display.userData.kind = 'laptop-screen';
  screenLid.add(display);

  const cam = new THREE.Mesh(new THREE.CircleGeometry(0.0012, 12), new THREE.MeshBasicMaterial({ color: 0x0a0b0d }));
  cam.position.set(0, 0.198, 0.004);
  screenLid.add(cam);

  const logoCanvas = document.createElement('canvas');
  logoCanvas.width = 256; logoCanvas.height = 256;
  const lctx = logoCanvas.getContext('2d');
  lctx.clearRect(0, 0, 256, 256);
  lctx.fillStyle = 'rgba(255,255,255,.65)'; lctx.font = '800 34px -apple-system, Segoe UI, sans-serif'; lctx.textAlign = 'center';
  lctx.fillText('SPECTER', 128, 138);
  const logo = new THREE.Mesh(new THREE.PlaneGeometry(0.045, 0.045), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(logoCanvas), transparent: true }));
  logo.position.set(0, 0.105, -0.0036);
  logo.rotation.y = Math.PI;
  screenLid.add(logo);

  const hinge = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, W - 0.03, 18), metal(0x7f858d, 0.4, 0.9));
  hinge.rotation.z = Math.PI / 2;
  hinge.position.set(0, T + 0.002, -D / 2 + 0.006);
  group.add(hinge);

  group.add(screenLid);
  group.userData = { kind: 'laptop', screenCanvas: c, screenTexture: tex, display, screenLid, base, W, D };
  return group;
}
