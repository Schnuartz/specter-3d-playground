import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/RoundedBoxGeometry.js';
import { createPhone, createQrCard, createLaptop, phoneScreenCanvas, plastic, metal, roundedRectGeometry } from './objects.js';
import { decodePixels, makeQrCardTexture } from './qr.js';
import { clamp, damp, lerp, easeInOutCubic, seededRandom } from './util.js';

const MODES = {
  hand: {
    cam: new THREE.Vector3(0.16, 0.32, 0.56),
    target: new THREE.Vector3(0, 0.15, 0.03),
    devicePos: new THREE.Vector3(0, 0.235, 0.02),
    deviceRot: new THREE.Euler(0.06, -0.18, 0.03),
    fov: 42,
  },
  desk: {
    cam: new THREE.Vector3(0.20, 0.34, 0.58),
    target: new THREE.Vector3(0, 0.07, 0.03),
    devicePos: new THREE.Vector3(0, 0.052, 0.02),
    deviceRot: new THREE.Euler(-0.08, 0.0, 0.0),
    fov: 42,
  },
  scan: {
    cam: new THREE.Vector3(0, 0.2, 0.62),
    target: new THREE.Vector3(0, 0.18, 0.1),
    fov: 46,
  },
};

function makeDeskTexture() {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 1024;
  const ctx = c.getContext('2d');
  const rnd = seededRandom(42);
  const g = ctx.createLinearGradient(0, 0, 1024, 1024);
  g.addColorStop(0, '#15171b'); g.addColorStop(0.5, '#0d0f12'); g.addColorStop(1, '#090b0d');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 260; i++) {
    ctx.strokeStyle = `rgba(255,255,255,${0.004 + rnd() * 0.012})`;
    ctx.lineWidth = 0.5 + rnd() * 1.2;
    ctx.beginPath();
    const y = rnd() * 1024;
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(300, y + rnd() * 18, 700, y - rnd() * 18, 1024, y + rnd() * 8);
    ctx.stroke();
  }
  for (let i = 0; i < 1400; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.003 + rnd() * 0.008})`;
    ctx.fillRect(rnd() * 1024, rnd() * 1024, 1, 1);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(2, 1);
  t.anisotropy = 8;
  return t;
}

function makeRadialShadowTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(128, 128, 10, 128, 128, 128);
  g.addColorStop(0, 'rgba(0,0,0,.55)');
  g.addColorStop(0.5, 'rgba(0,0,0,.22)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}

function makeGlowTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 512;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(256, 256, 4, 256, 256, 256);
  g.addColorStop(0, 'rgba(31,153,229,.35)');
  g.addColorStop(0.35, 'rgba(31,153,229,.12)');
  g.addColorStop(1, 'rgba(31,153,229,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 512, 512);
  return new THREE.CanvasTexture(c);
}

function createStand() {
  const g = new THREE.Group();
  const mat = metal(0x5b616a, 0.38, 0.9);
  const base = new THREE.Mesh(new RoundedBoxGeometry(0.09, 0.006, 0.06, 5, 0.004), mat);
  base.position.y = 0.003;
  base.receiveShadow = true;
  g.add(base);
  const back = new THREE.Mesh(new RoundedBoxGeometry(0.075, 0.006, 0.05, 5, 0.004), mat);
  back.position.set(0, 0.028, -0.018);
  back.rotation.x = -0.42;
  back.receiveShadow = true;
  g.add(back);
  const lip = new THREE.Mesh(new RoundedBoxGeometry(0.075, 0.008, 0.01, 4, 0.003), mat);
  lip.position.set(0, 0.009, 0.024);
  g.add(lip);
  const pad = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.001, 0.03), plastic(0x14171b, 0.9, 0));
  pad.position.set(0, 0.030, -0.019);
  pad.rotation.x = -0.42;
  g.add(pad);
  g.userData = { kind: 'stand' };
  return g;
}

function createPhoneStand() {
  const g = new THREE.Group();
  const mat = metal(0x4a505a, 0.42, 0.85);
  const base = new THREE.Mesh(new RoundedBoxGeometry(0.11, 0.006, 0.07, 4, 0.004), mat);
  base.position.y = 0.003;
  base.receiveShadow = true;
  g.add(base);
  const back = new THREE.Mesh(new RoundedBoxGeometry(0.10, 0.004, 0.06, 4, 0.003), mat);
  back.position.set(0, 0.048, -0.025);
  back.rotation.x = -0.38;
  g.add(back);
  const lip = new THREE.Mesh(new RoundedBoxGeometry(0.10, 0.006, 0.008, 3, 0.003), mat);
  lip.position.set(0, 0.008, 0.03);
  g.add(lip);
  const pad = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.001, 0.04), new THREE.MeshPhysicalMaterial({ color: 0x111318, roughness: 0.9 }));
  pad.position.set(0, 0.006, 0.005);
  g.add(pad);
  return g;
}

function createCardStand() {
  const g = new THREE.Group();
  const mat = metal(0x30363e, 0.4, 0.8);
  const base = new THREE.Mesh(new RoundedBoxGeometry(0.105, 0.005, 0.035, 4, 0.004), mat);
  base.position.y = 0.0025;
  g.add(base);
  const back = new THREE.Mesh(new RoundedBoxGeometry(0.10, 0.004, 0.03, 4, 0.003), mat);
  back.position.set(0, 0.03, -0.014);
  back.rotation.x = -0.42;
  g.add(back);
  return g;
}

export class World {
  constructor(canvas, { screenCanvas, keeperCanvas } = {}) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor(0x030405, 1);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x030405);
    this.scene.fog = new THREE.FogExp2(0x030405, 0.42);

    this.camera = new THREE.PerspectiveCamera(34, 1, 0.01, 8);
    this.camera.position.copy(MODES.hand.cam);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.copy(MODES.hand.target);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.075;
    this.controls.enablePan = false;
    this.controls.minDistance = 0.22;
    this.controls.maxDistance = 1.25;
    this.controls.minPolarAngle = 0.12;
    this.controls.maxPolarAngle = 1.5;
    this.controls.rotateSpeed = 0.55;
    this.controls.zoomSpeed = 0.8;
    this.controls.enabled = true;
    this.controls.update();

    this.mode = 'hand';
    this.modeTarget = 'hand';
    this.transition = 1;
    this.transitionDuration = 0.75;
    this.modeFrom = {
      cam: this.camera.position.clone(),
      target: this.controls.target.clone(),
      fov: this.camera.fov,
    };

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.dragging = false;
    this.device = null;
    this.hand = null;
    this.stand = null;
    this.screenCanvas = screenCanvas;
    this.keeperCanvas = keeperCanvas;
    this.laptop = null;
    this.laptopScreenCanvas = document.createElement('canvas');
    this.laptopScreenCanvas.width = 1024;
    this.laptopScreenCanvas.height = 640;
    this.phones = [];
    this.qrCards = [];
    this.homeObjects = [];
    this.scanCards = [];
    this.lastScanResult = null;
    this.lastDecode = 0;
    this.onScanResult = null;
    this.scanning = false;

    this.scanCamera = this.camera.clone();
    this.scanCamera.aspect = 1;
    this.scanCamera.updateProjectionMatrix();
    this.decodeTarget = new THREE.WebGLRenderTarget(1024, 1024, {
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      depthBuffer: true,
    });
    this.decodePixelsBuffer = new Uint8Array(1024 * 1024 * 4);
    this.decodeCanvas = document.createElement('canvas');
    this.decodeCanvas.width = 1024;
    this.decodeCanvas.height = 1024;
    this.decodeContext = this.decodeCanvas.getContext('2d', { willReadFrequently: true });

    this._setupEnvironment();
    this._setupLights();
    this._setupDesk();
    this._setupLaptop();
    this._setupPhones();
    this._setupCards();
    this._setupParticles();
    this._setupGlow();

    this.onResize = () => this.resize();
    window.addEventListener('resize', this.onResize);
    this.resize();
  }

  _setupEnvironment() {
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const envScene = new RoomEnvironment();
    const rt = pmrem.fromScene(envScene, 0.04);
    this.scene.environment = rt.texture;
    pmrem.dispose();
  }

  _setupLights() {
    const hemi = new THREE.HemisphereLight(0x8fb8d8, 0x07090c, 0.36);
    this.scene.add(hemi);

    const key = new THREE.DirectionalLight(0xe8f3ff, 2.4);
    key.position.set(0.55, 0.85, 0.65);
    key.target.position.set(0, 0.1, 0.0);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 0.1;
    key.shadow.camera.far = 2.2;
    key.shadow.camera.left = -0.55;
    key.shadow.camera.right = 0.55;
    key.shadow.camera.top = 0.55;
    key.shadow.camera.bottom = -0.55;
    key.shadow.bias = -0.0002;
    key.shadow.normalBias = 0.015;
    this.scene.add(key);
    this.scene.add(key.target);

    const fill = new THREE.PointLight(0x2f7db8, 1.1, 2.2, 2);
    fill.position.set(-0.5, 0.36, 0.42);
    this.scene.add(fill);

    const rim = new THREE.PointLight(0x9fd8ff, 1.2, 1.8, 2);
    rim.position.set(0.34, 0.3, -0.42);
    this.scene.add(rim);

    const warm = new THREE.PointLight(0xffb46a, 0.55, 1.5, 2);
    warm.position.set(-0.38, 0.18, -0.18);
    this.scene.add(warm);

    this.lights = { hemi, key, fill, rim, warm };
  }

  _setupDesk() {
    const desk = new THREE.Mesh(
      new THREE.PlaneGeometry(4, 2.4),
      new THREE.MeshStandardMaterial({ map: makeDeskTexture(), color: 0xffffff, roughness: 0.82, metalness: 0.08 })
    );
    desk.rotation.x = -Math.PI / 2;
    desk.position.y = 0;
    desk.receiveShadow = true;
    this.scene.add(desk);

    const mat = new THREE.Mesh(
      new RoundedBoxGeometry(0.96, 0.004, 0.56, 5, 0.02),
      new THREE.MeshPhysicalMaterial({ color: 0x101318, roughness: 0.92, metalness: 0.02, clearcoat: 0.05 })
    );
    mat.position.set(0, 0.002, 0.02);
    mat.receiveShadow = true;
    this.scene.add(mat);

    const edge = new THREE.Mesh(
      roundedRectGeometry(0.955, 0.555, 0.02),
      new THREE.MeshBasicMaterial({ color: 0x1d2530, transparent: true, opacity: 0.5 })
    );
    edge.rotation.x = -Math.PI / 2;
    edge.position.set(0, 0.0041, 0.02);
    this.scene.add(edge);

    const trayMat = new THREE.MeshPhysicalMaterial({ color: 0x14181d, roughness: 0.55, metalness: 0.25, clearcoat: 0.3, clearcoatRoughness: 0.4 });
    const tray = new THREE.Mesh(new RoundedBoxGeometry(0.3, 0.075, 0.16, 5, 0.012), trayMat);
    tray.position.set(0.06, 0.0375, 0.12);
    tray.castShadow = true;
    tray.receiveShadow = true;
    this.scene.add(tray);
    const trayPad = new THREE.Mesh(new RoundedBoxGeometry(0.285, 0.003, 0.145, 5, 0.012), new THREE.MeshPhysicalMaterial({ color: 0x0a0d11, roughness: 0.95, metalness: 0.02 }));
    trayPad.position.set(0.06, 0.076, 0.12);
    trayPad.receiveShadow = true;
    this.scene.add(trayPad);
    const trayLip = new THREE.Mesh(new RoundedBoxGeometry(0.302, 0.004, 0.162, 5, 0.012), new THREE.MeshBasicMaterial({ color: 0x1f99e5, transparent: true, opacity: 0.18 }));
    trayLip.position.set(0.06, 0.070, 0.12);
    this.scene.add(trayLip);
    const shadowTex = makeRadialShadowTexture();
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 0.55), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, opacity: 0.9, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(0, 0.0043, 0.02);
    this.scene.add(shadow);
    this.deskShadow = shadow;
  }

  _setupLaptop() {
    this.laptop = createLaptop({ screenCanvas: this.laptopScreenCanvas });
    this.laptop.position.set(-0.265, 0.0, 0.02);
    this.laptop.rotation.y = 0.38;
    this.scene.add(this.laptop);
  }

  _setupPhones() {
    const phoneA = createPhone({
      screenCanvas: this.keeperCanvas || phoneScreenCanvas('wallet', 'specter-diy-3d-demo', 'Specter Mobile'),
      frameColor: 0x424750,
    });
    phoneA.position.set(0.215, 0.082, 0.02);
    phoneA.rotation.set(-0.06, -0.55, 0.0);
    phoneA.userData.home = phoneA.position.clone();
    phoneA.userData.homeRot = phoneA.rotation.clone();
    phoneA.userData.bob = 0;
    phoneA.userData.bobPhase = 0.4;
    this.scene.add(phoneA);
    this.phones.push(phoneA);
    const standA = createPhoneStand();
    standA.position.set(0.215, 0, 0.02);
    this.scene.add(standA);

    const phoneB = createPhone({
      screenCanvas: phoneScreenCanvas('seed', 'ghost ghost ghost ghost ghost ghost ghost ghost ghost ghost ghost machine', 'Seed Backup'),
      frameColor: 0x2e3239,
    });
    phoneB.position.set(0.255, 0.082, -0.06);
    phoneB.rotation.set(-0.06, -0.8, 0.0);
    phoneB.userData.home = phoneB.position.clone();
    phoneB.userData.homeRot = phoneB.rotation.clone();
    phoneB.userData.bob = 0;
    phoneB.userData.bobPhase = 1.6;
    this.scene.add(phoneB);
    this.phones.push(phoneB);
    const standB = createPhoneStand();
    standB.position.set(0.255, 0, -0.06);
    this.scene.add(standB);

    this.homeObjects.push(...this.phones);
  }

  _setupCards() {
    const cards = [
      { payload: 'ghost ghost ghost ghost ghost ghost ghost ghost ghost ghost ghost machine', label: 'Ghost seed', accent: 0x47d7d0 },
      { payload: 'cHNidP8BAHECAAAAASIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiAAAAAAD9////AmDqAAAAAAAAFgAUx6q7+sTbbs7TU1rVoghQnTkhKctMmgAAAAAAABYAFOeecUR7lROm99MUyL5extM/T11XAAAAAAABAR+ghgEAAAAAABYAFGLab1CVpSs0DBrqUxM0E2SvvC6OIgYDMe3LFs/Q+FmAUveyh7BwR6EcYJZ8Hn6wJX4CVSU52YQYjCSlEFQAAIABAACAAAAAgAAAAAAAAAAAAAAiAgIlH+LuS8Q3KbCQP/rbz4RtnmrLs6pZOwnWAIVkXL42UxiMJKUQVAAAgAEAAIAAAACAAQAAAAAAAAAA', label: 'PSBT · testnet', accent: 0x1f99e5 },
      { payload: '{"label":"Testnet Ghost + Zoo + Mirror 2-of-3","descriptor":"wsh(sortedmulti(2,[8c24a510/48h/1h/0h/2h]tpubDDzWqfZ5TH48383Byd9PFGxEP1Ws5NVXyYcHTmnHwmhJciowLeBDWNHcpLGocofanSyVHeiNqL4HZkXZfKM7NKm7gZZoPjmA9vTKPpwRSkx/{0,1}/*,[3f635a63/48h/1h/0h/2h]tpubDFPtPArj4GzBEFHohegg1Xatrc1Fi9oSox5LzuSRX91miwQxuUrEpBxpvDRsmZYJKYFhgdK3UStsjC8JKXfUbMinjFqiEM4uNwzVaCaHpys/{0,1}/*,[74d682c3/48h/1h/0h/2h]tpubDFj1hZAYMiqqHgrVQ98sLcStdrnAhNx74ynU6QFDULUhyp1BDeyz6E76HPN16t1fswttuwijEsMnskuZPtCvtdbHt74Rs8Vfk3JsM86wah7/{0,1}/*))#syw6qp8z","address":"tb1qem2p9awpmhyts2rrg7wxnze0qm4znep7zl032qwrh0yy4m36364qhza3rn"}', label: 'Wallet descriptor', accent: 0x52d68a },
    ];
    cards.forEach((c, i) => {
      const card = createQrCard(c.payload, c.label, c.accent);
      const cardPos = [[0.13, 0.082, -0.02], [0.16, 0.082, -0.06], [0.19, 0.082, -0.10]][i];
      card.position.set(...cardPos);
      card.rotation.set(-0.12, -0.28 - i * 0.06, 0.0);
      card.userData.home = card.position.clone();
      card.userData.homeRot = card.rotation.clone();
      card.userData.bob = 0;
      card.userData.bobPhase = i * 1.7;
      this.scene.add(card);
      const cardStand = createCardStand();
      cardStand.position.set(cardPos[0], 0, cardPos[2]);
      this.scene.add(cardStand);
      this.qrCards.push(card);
      this.homeObjects.push(card);
      this.scanCards.push(card);
    });
  }

  _setupParticles() {
    const count = 180;
    const positions = new Float32Array(count * 3);
    const rnd = seededRandom(7);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (rnd() - 0.5) * 1.1;
      positions[i * 3 + 1] = rnd() * 0.55 + 0.02;
      positions[i * 3 + 2] = (rnd() - 0.5) * 0.8;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({ color: 0x7fa8c8, size: 0.0008, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending });
    this.particles = new THREE.Points(geo, mat);
    this.scene.add(this.particles);
  }

  _setupGlow() {
    const tex = makeGlowTexture();
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
    sprite.scale.set(1.1, 0.8, 1);
    sprite.position.set(0, 0.18, -0.5);
    this.scene.add(sprite);
    this.glow = sprite;
  }

  attachDevice(device, hand) {
    this.device = device;
    this.hand = hand;
    device.position.copy(MODES.hand.devicePos);
    device.rotation.copy(MODES.hand.deviceRot);
    this.scene.add(device);
    hand.visible = true;
    device.add(hand);
    this.stand = createStand();
    this.stand.position.set(0, 0, 0.02);
    this.stand.visible = false;
    this.scene.add(this.stand);
    this.deviceBasePos = MODES.hand.devicePos.clone();
    this.deviceBaseRot = MODES.hand.deviceRot.clone();
    this.deviceDrag = new THREE.Quaternion();
  }

  setMode(mode, { immediate = false } = {}) {
    if (!MODES[mode]) return;
    if (mode === 'scan') {
      this.scanning = true;
      this.controls.enabled = false;
    } else {
      this.scanning = false;
    }
    this.modeTarget = mode;
    this.modeFrom.cam.copy(this.camera.position);
    this.modeFrom.target.copy(this.controls.target);
    this.modeFrom.fov = this.camera.fov;
    this.transitionStartedAt = performance.now();
    this.transition = immediate ? 1 : 0;
    if (immediate) {
      this.camera.position.copy(MODES[mode].cam);
      this.controls.target.copy(MODES[mode].target);
      this.camera.fov = MODES[mode].fov;
      this.camera.updateProjectionMatrix();
      this.mode = mode;
      this.controls.enabled = mode !== 'scan';
      this.controls.update();
    }
    if (mode === 'scan') {
      this._arrangeScanObjects();
    } else {
      this._restoreScanObjects();
      this.controls.enabled = true;
    }
    if (mode === 'hand') {
      this.deviceBasePos.copy(MODES.hand.devicePos);
      this.deviceBaseRot.copy(MODES.hand.deviceRot);
      this.deviceDrag.identity();
    }
    if (mode === 'desk') {
      this.deviceBasePos.copy(MODES.desk.devicePos);
      this.deviceBaseRot.copy(MODES.desk.deviceRot);
      this.deviceDrag.identity();
    }
  }

  _arrangeScanObjects() {
    this.focusScanObject(this.scanCards[1]);
  }

  _restoreScanObjects() {
    for (const obj of [...this.scanCards, ...this.phones]) obj.userData.scanning = false;
  }

  update(dt, t) {
    if (this.transition < 1) {
      this.transition = clamp((performance.now() - this.transitionStartedAt) / 1000 / this.transitionDuration, 0, 1);
      const k = easeInOutCubic(this.transition);
      const to = MODES[this.modeTarget];
      this.camera.position.lerpVectors(this.modeFrom.cam, to.cam, k);
      this.controls.target.lerpVectors(this.modeFrom.target, to.target, k);
      this.camera.fov = lerp(this.modeFrom.fov, to.fov, k);
      this.camera.updateProjectionMatrix();
      if (this.transition >= 1) {
        this.mode = this.modeTarget;
        this.controls.enabled = this.mode !== 'scan';
      }
    }

    if (this.device) {
      if (this.modeTarget === 'scan') {
        this.device.visible = false;
        this.stand.visible = false;
      } else {
        this.device.visible = true;
        const target = this.modeTarget === 'hand' ? MODES.hand : MODES.desk;
        this.device.position.x = damp(this.device.position.x, target.devicePos.x, 6, dt);
        this.device.position.y = damp(this.device.position.y, target.devicePos.y, 6, dt);
        this.device.position.z = damp(this.device.position.z, target.devicePos.z, 6, dt);
        const qTarget = new THREE.Quaternion().setFromEuler(target.deviceRot);
        if (this.modeTarget === 'hand') qTarget.multiply(this.deviceDrag);
        this.device.quaternion.slerp(qTarget, 1 - Math.exp(-6 * dt));
        if (this.hand) {
          const hs = damp(this.hand.scale.x, this.modeTarget === 'hand' ? 1 : 0.001, 5, dt);
          this.hand.scale.setScalar(hs);
          this.hand.visible = hs > 0.02;
        }
        if (this.stand) {
          this.stand.visible = this.modeTarget === 'desk';
          this.stand.scale.setScalar(this.modeTarget === 'desk' ? 1 : 1);
        }
      }
    }

    for (const obj of this.homeObjects) {
      if (obj.userData.dragging) continue;
      if (obj.userData.scanning && obj.userData.scanHome) {
        obj.position.lerp(obj.userData.scanHome, 1 - Math.exp(-4 * dt));
        const sr = obj.userData.scanRot || obj.userData.homeRot;
        obj.rotation.x = damp(obj.rotation.x, sr.x, 4, dt);
        obj.rotation.y = damp(obj.rotation.y, sr.y, 4, dt);
        obj.rotation.z = damp(obj.rotation.z, sr.z, 4, dt);
      } else {
        const home = obj.userData.home;
        obj.position.x = damp(obj.position.x, home.x, 2.2, dt);
        obj.position.y = damp(obj.position.y, home.y, 2.2, dt);
        obj.position.z = damp(obj.position.z, home.z, 2.2, dt);
        obj.rotation.x = damp(obj.rotation.x, obj.userData.homeRot.x, 1.8, dt);
        obj.rotation.y = damp(obj.rotation.y, obj.userData.homeRot.y, 1.8, dt);
        obj.rotation.z = damp(obj.rotation.z, obj.userData.homeRot.z, 1.8, dt);
      }
    }

    if (this.particles) {
      this.particles.rotation.y = t * 0.005;
      this.particles.position.y = Math.sin(t * 0.1) * 0.003;
    }
    if (this.glow) this.glow.material.opacity = 0.45 + Math.sin(t * 0.4) * 0.06;
    if (this.deskShadow) this.deskShadow.material.opacity = this.modeTarget === 'scan' ? 0 : 0.85;
    if (this.laptop) this.laptop.visible = this.modeTarget !== 'scan';

    this.controls.update();
    if (this.scanning) this._maybeDecode(t);
  }

  _maybeDecode(t) {
    if (t - this.lastDecode < 140) return;
    this.lastDecode = t;
    const gl = this.renderer;
    const prev = gl.getRenderTarget();
    gl.setRenderTarget(this.decodeTarget);
    this.scanCamera.position.copy(this.camera.position);
    this.scanCamera.quaternion.copy(this.camera.quaternion);
    this.scanCamera.fov = this.camera.fov;
    this.scanCamera.updateProjectionMatrix();
    gl.render(this.scene, this.scanCamera);
    gl.readRenderTargetPixels(this.decodeTarget, 0, 0, 1024, 1024, this.decodePixelsBuffer);
    gl.setRenderTarget(prev);
    const img = this.decodeContext.createImageData(1024, 1024);
    const src = this.decodePixelsBuffer;
    const dst = img.data;
    for (let y = 0; y < 1024; y++) {
      const srcRow = (1023 - y) * 1024 * 4;
      const dstRow = y * 1024 * 4;
      for (let x = 0; x < 1024 * 4; x++) dst[dstRow + x] = src[srcRow + x];
    }
    this.decodeContext.putImageData(img, 0, 0);
    const result = decodePixels(img.data, 1024, 1024);
    if (result && this.onScanResult) {
      const now = performance.now();
      const key = result.text;
      if (!this.lastScanResult || this.lastScanResult.key !== key || now - this.lastScanResult.at > 900) {
        this.lastScanResult = { key, at: now, result };
        this.onScanResult(result);
      }
    }
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  pointerNDC(event) {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    return this.pointer;
  }

  raycast(event, objects) {
    this.raycaster.setFromCamera(this.pointerNDC(event), this.camera);
    return this.raycaster.intersectObjects(objects, true);
  }

  raycastScreen(event) {
    if (!this.device) return null;
    this.raycaster.setFromCamera(this.pointerNDC(event), this.camera);
    const hits = this.raycaster.intersectObject(this.device.userData.screenMesh, false);
    if (!hits.length) return null;
    const hit = hits[0];
    const uv = hit.uv;
    return {
      hit,
      uv,
      x: clamp(Math.floor(uv.x * 480), 0, 479),
      y: clamp(Math.floor((1 - uv.y) * 800), 0, 799),
    };
  }

  screenPointToUv(uv) {
    return { x: clamp(Math.floor(uv.x * 480), 0, 479), y: clamp(Math.floor((1 - uv.y) * 800), 0, 799) };
  }

  rotateDeviceBy(dx, dy) {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(dy * 0.0035, dx * 0.0042, 0, 'XYZ'));
    this.deviceDrag.multiply(q);
  }

  resetDeviceRotation() {
    this.deviceDrag.identity();
  }

  setScanning(active) {
    this.scanning = active;
  }
}

World.prototype.setCardPayload = function setCardPayload(card, payload, label) {
  if (!card) return;
  const canvas = makeQrCardTexture(payload, label || card.userData.label || 'QR');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.userData.payload = String(payload);
  const mat = card.userData.front.material;
  if (mat.map) mat.map.dispose();
  mat.map = tex;
  mat.needsUpdate = true;
  card.userData.payload = String(payload);
  card.userData.label = label || card.userData.label;
};

World.prototype.focusScanCard = function focusScanCard(index = 0) {
  this.focusScanObject(this.scanCards[index]);
};







World.prototype.focusScanObject = function focusScanObject(object) {
  if (!object) return;
  const cardSides = [
    new THREE.Vector3(-0.22, 0.18, 0.36),
    new THREE.Vector3(0.22, 0.18, 0.36),
    new THREE.Vector3(0.0, 0.18, 0.28),
  ];
  const phoneSides = [
    new THREE.Vector3(0.26, 0.16, 0.34),
    new THREE.Vector3(0.30, 0.21, 0.34),
  ];
  this.scanCards.forEach((card, i) => {
    const center = card === object;
    card.userData.scanning = true;
    card.userData.scanRot = new THREE.Euler(0, 0, 0);
    card.userData.scanHome = center ? new THREE.Vector3(0, 0.18, 0.42) : cardSides[i % cardSides.length].clone();
    card.position.copy(card.userData.scanHome);
    card.rotation.copy(card.userData.scanRot);
  });
  this.phones.forEach((phone, i) => {
    const center = phone === object;
    phone.userData.scanning = true;
    phone.userData.scanRot = new THREE.Euler(0, 0, 0);
    phone.userData.scanHome = center ? new THREE.Vector3(0, 0.18, 0.42) : phoneSides[i % phoneSides.length].clone();
    phone.position.copy(phone.userData.scanHome);
    phone.rotation.copy(phone.userData.scanRot);
  });
  if (object.userData) {
    object.userData.scanning = true;
    object.userData.scanRot = new THREE.Euler(0, 0, 0);
    object.userData.scanHome = new THREE.Vector3(0, 0.18, 0.42);
    object.position.copy(object.userData.scanHome);
    object.rotation.copy(object.userData.scanRot);
  }
};




