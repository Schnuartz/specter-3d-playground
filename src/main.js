import * as THREE from 'three';
import { ScreenTexture } from './screen.js';
import { World } from './world.js';
import { FirmwareRuntime } from './firmware.js';
import { createDevice, setDevicePower, setPowerPressed } from './device.js';
import { createHand } from './hand.js';
import { createMicroSD, createSmartcard, createQrCard } from './objects.js';
import { createDemoFiles } from '../runtime/demo-data.js';
import { DEMO_WALLET_FILES } from './demo-wallet.js';
import { UI } from './ui.js';
import { Airgap } from './airgap.js';
import { KeeperApp } from './keeper.js';
import { AudioEngine } from './audio.js';
import { rafLoop, sleep, downloadBytes, pickFiles, truncate, clamp } from './util.js';

const SD_CAPACITY = 8_000_000_000;
const SD_SLOT_LOCAL = new THREE.Vector3(-0.017, 0.055, 0.0042);
const SC_SLOT_LOCAL = new THREE.Vector3(0, 0, -0.0125);
const SC_INSERT_ROT = new THREE.Quaternion();
const SD_TRAY = new THREE.Vector3(-0.04, 0.078, 0.12);
const SD_TRAY_QUAT = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0.28));
const SC_TRAY = [
  new THREE.Vector3(0.05, 0.078, 0.12),
  new THREE.Vector3(0.14, 0.078, 0.12),
  new THREE.Vector3(0.14, 0.079, 0.12),
];
const SC_TRAY_QUATS = [
  new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0.22)),
  new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, -0.16)),
  new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0.06)),
];

const screenTexture = new ScreenTexture();
const keeper = new KeeperApp({ deviceScreenCanvas: screenTexture.canvas, onToast: (msg, type) => ui?.toast(msg, type) });
const world = new World(document.getElementById('scene'), { screenCanvas: screenTexture.canvas, keeperCanvas: keeper.canvas });
keeper.attachPhone(world.phones[0]);
const audio = new AudioEngine();

const state = {
  power: false,
  booting: false,
  sdInserted: true,
  activeCard: 1,
  sdFiles: [],
  sdUsed: 0,
  sdCapacity: SD_CAPACITY,
  cardSlots: [],
  scannerActive: false,
  mode: 'hand',
  modeBeforeScan: 'hand',
  stateFiles: [],
  demoNetwork: 'testnet',
  demoFileNames: new Set(),
  touch: null,
  drag: null,
  rotate: null,
  lastHover: 0,
  usbSocket: null,
  lastPointerSent: 0,
  scanFocusIndex: 0,
};

let device;
let hand;
let sdCard;
let smartcards = [];
let ui;
let airgap;
let runtime;

const demo = createDemoFiles('testnet');
const demoAllNames = new Set([
  ...createDemoFiles('testnet').files.map(f => f.name),
  ...createDemoFiles('mainnet').files.map(f => f.name),
]);

function initDemoState() {
  const files = [];
  for (const f of demo.files) files.push({ path: `sd/${f.name}`, bytes: f.bytes });
  files.push({ path: 'flash/network', bytes: new TextEncoder().encode('test') });
  for (const card of demo.cards) {
    const slot = card.slot;
    const priv = crypto.getRandomValues(new Uint8Array(32));
    files.push({ path: `cards/${slot}/private.key`, bytes: priv });
    files.push({ path: `cards/${slot}/secret.bin`, bytes: card.secret });
    files.push({ path: `cards/${slot}/pin.bin`, bytes: card.pinDigest });
    files.push({ path: `cards/${slot}/attempts`, bytes: new Uint8Array([10]) });
  }
  for (const [path, b64] of Object.entries(DEMO_WALLET_FILES)) {
    files.push({ path, bytes: Uint8Array.from(atob(b64), c => c.charCodeAt(0)) });
  }
  state.stateFiles = files;
  state.demoFileNames = new Set(demo.files.map(f => f.name));
  state.sdFiles = demo.files.map(f => ({ path: f.name, size: f.bytes.byteLength }));
  state.sdUsed = state.sdFiles.reduce((n, f) => n + f.size, 0);
  state.cardSlots = [
    { slot: 1, initialized: true },
    { slot: 2, initialized: true },
    { slot: 3, initialized: false },
  ];
}

initDemoState();

runtime = new FirmwareRuntime({
  onFrame: handleFrame,
  onMessage: handleWorkerMessage,
  onLog: handleLog,
  onStatus: handleStatus,
});

ui = new UI({
  onPowerToggle: togglePower,
  onModeChange: setMode,
  onSdToggle: sdToggle,
  onSdImport: importSdFiles,
  onSdClear: clearSd,
  onSdDelete: deleteSdFile,
  onSdExport: exportSdFile,
  onCardToggle: toggleCard,
  onCardReset: resetCard,
  onDemoLoad: loadDemo,
  onQrCreate: createCustomQr,
  onQrSend: sendQrText,
  onQrPick: pickQr,
  onAirgapOpen: () => airgap?.open(),
  onKeeperOpen: () => keeper.open(),
  onUsbConnect: toggleUsb,
  onRestart: () => restart(false),
  onFactoryReset: () => restart(true),
  onSoundToggle: on => audio.setEnabled(on),
  onScanCancel: cancelScan,
  onScanAuto: autoFocusScan,
});

airgap = new Airgap({
  world,
  runtime,
  getStateFiles,
  onWriteSd,
  onEjectSd: sdToggle,
  onToast: (msg, type) => ui.toast(msg, type),
});

world.onScanResult = result => {
  if (!state.scannerActive) return;
  if (performance.now() < (state.scanArmedAt || 0)) return;
  const loc = result.location;
  if (loc) {
    const cx = (loc.topLeftCorner.x + loc.bottomRightCorner.x) / 2;
    const cy = (loc.topLeftCorner.y + loc.bottomRightCorner.y) / 2;
    if (cx < 0.17 * 1024 || cx > 0.83 * 1024 || cy < 0.17 * 1024 || cy > 0.83 * 1024) return;
  }
  ui.setScanPayload(result.text);
  ui.setScanStatus('QR erkannt · an Firmware gesendet');
  audio.scan();
  const bytes = result.bytes;
  runtime.send('qr', { bytes: bytes.buffer }, [bytes.buffer]);
};

function handleFrame(pixels) {
  if (!state.power) return;
  screenTexture.drawFrame(pixels);
}

function handleWorkerMessage(data) {
  switch (data.type) {
    case 'sd-list':
      state.sdFiles = data.files || [];
      state.sdUsed = data.usedBytes ?? state.sdFiles.reduce((n, f) => n + f.size, 0);
      state.sdCapacity = data.capacityBytes || SD_CAPACITY;
      ui.setSD(state.sdInserted, state.sdFiles, state.sdUsed, state.sdCapacity);
      break;
    case 'sd-state':
      state.sdInserted = Boolean(data.inserted);
      ui.setSD(state.sdInserted, state.sdFiles, state.sdUsed, state.sdCapacity);
      if (state.sdInserted) runtime.send('sd-list');
      break;
    case 'card-state':
      state.activeCard = data.active ?? null;
      state.cardSlots = data.slots || [];
      ui.setCards(state.activeCard, state.cardSlots);
      break;
    case 'scanner-state':
      handleScanner(Boolean(data.active));
      break;
    case 'operation-error':
      ui.log(`OP ERROR ${data.operation}: ${data.message}`);
      ui.toast(`${data.operation}: ${truncate(data.message, 120)}`, 'err');
      if (data.operation?.startsWith('sd-')) runtime.send('sd-list');
      break;
    case 'sd-file':
      downloadBytes(data.bytes, data.name);
      ui.toast(`SD-Datei exportiert: ${data.name}`, 'ok');
      break;
    case 'qr-delivered':
      ui.log(`QR an Firmware geliefert (${data.size} bytes)`);
      break;
    case 'usb-output':
      if (state.usbSocket?.readyState === WebSocket.OPEN) state.usbSocket.send(data.bytes);
      break;
    default:
      if (data.type === 'log') handleLog(data.message);
  }
}

function handleLog(message) {
  ui?.log(message);
}

function handleStatus(kind, detail) {
  if (kind === 'loading') return;
  if (kind === 'running') {
    airgap?.setDeviceState('online');
    keeper.setDeviceState('online');
    runtime.send('sd-list');
    runtime.send('card-list');
    setTimeout(() => {
      if (state.power && screenTexture.frameCount < 2) {
        if (state.activeCard) screenTexture.drawMessage('SMARTCARD READY', 'PIN 1234 eingeben · Testkarte');
        else if (state.sdInserted) screenTexture.drawMessage('SD CARD READY', 'PIN einrichten oder entsperren');
        else screenTexture.drawMessage('NO KEYSTORE', 'microSD oder MemoryCard einsetzen');
      }
    }, 2600);
  } else if (kind === 'error') {
    ui?.toast(`Firmware-Fehler: ${detail?.message || detail}`, 'err', 6000);
    ui?.log(`FIRMWARE ERROR ${detail?.message || detail}`);
    if (state.booting) {
      state.booting = false;
      state.power = false;
      ui?.setPower(false);
      setDevicePower(device, false);
      screenTexture.drawMessage('FIRMWARE ERROR', 'Restart im Workbench');
    }
  }
}

async function powerOn() {
  if (state.power || state.booting) return;
  state.booting = true;
  state.power = true;
  audio.powerOn();
  ui.setPower(true);
  setDevicePower(device, true);
  screenTexture.drawBoot();
  runtime.lastSdInserted = state.sdInserted;
  runtime.lastCardSlot = state.activeCard;
  airgap.setDeviceState('boot');
  keeper.setDeviceState('boot');
  try {
    await runtime.start({
      stateFiles: state.stateFiles,
      sdInserted: state.sdInserted,
      cardSlot: state.activeCard,
    });
    ui.log('Firmware booted (WASM).');
    airgap.setDeviceState('online');
    keeper.setDeviceState('online');
    runtime.send('sd-list');
    runtime.send('card-list');
  } catch (error) {
    state.power = false;
    state.booting = false;
    ui.setPower(false);
    setDevicePower(device, false);
    screenTexture.drawMessage('BOOT FAILED', truncate(error.message, 46));
    ui.toast(`Boot fehlgeschlagen: ${truncate(error.message, 120)}`, 'err', 6000);
    ui.log(`BOOT FAILED ${error.stack || error.message}`);
    airgap.setDeviceState('offline');
    keeper.setDeviceState('offline');
    return;
  }
  state.booting = false;
}

async function powerOff() {
  if (!state.power || state.booting) return;
  state.booting = true;
  audio.powerOff();
  const files = await runtime.powerOff();
  state.stateFiles = files;
  state.power = false;
  state.booting = false;
  screenTexture.drawBlack();
  setDevicePower(device, false);
  ui.setPower(false);
  if (state.scannerActive) handleScanner(false);
  if (world.mode === 'scan') setMode('hand');
  airgap.setDeviceState('offline');
  keeper.setDeviceState('offline');
  updateSdFromStateFiles();
  ui.toast('Gerät ausgeschaltet. Flash/SD/Cards bleiben im Snapshot.', 'info');
}

function togglePower() {
  if (state.booting) return;
  if (state.power) powerOff();
  else powerOn();
}

async function restart(factory = false) {
  if (factory && !confirm('Factory Reset? Der interne Flash wird gelöscht, SD-Karte und MemoryCards bleiben erhalten.')) return;
  if (state.booting) return;
  state.booting = true;
  if (state.power) {
    const files = await runtime.snapshot();
    state.stateFiles = factory
      ? files.filter(f => f.path.startsWith('sd/') || f.path.startsWith('cards/'))
      : files;
    runtime.stopWorker();
  } else if (factory) {
    state.stateFiles = state.stateFiles.filter(f => f.path.startsWith('sd/') || f.path.startsWith('cards/'));
  }
  state.power = false;
  screenTexture.drawBoot();
  await sleep(120);
  state.booting = false;
  await powerOn();
  ui.toast(factory ? 'Factory Reset ausgeführt. Flash gelöscht.' : 'Neustart abgeschlossen.', factory ? 'info' : 'ok');
}

function setMode(mode) {
  if (mode === 'scan' && !state.scannerActive) {
    ui.toast('Der Scanner ist nicht aktiv. Öffne auf dem Gerät „Scan QR code“.', 'info');
    return;
  }
  if (state.scannerActive && mode !== 'scan') {
    ui.toast('Scanner aktiv — zuerst „Abbrechen“ im Scan-HUD.', 'info');
    return;
  }
  state.mode = mode;
  world.setMode(mode);
  ui.setMode(mode);
  if (mode !== 'scan') ui.setScanner(state.scannerActive);
}

function handleScanner(active) {
  state.scanLog = state.scanLog || [];
  state.scanLog.push({ active, at: Date.now(), worldMode: world.mode, hudHidden: document.getElementById('scan-hud').hidden });
  if (active === state.scannerActive) return;
  state.scannerActive = active;
  ui.setScanner(active);
  if (active) {
    state.modeBeforeScan = world.mode === 'scan' ? 'hand' : world.mode;
    state.scanArmedAt = performance.now() + 1800;
    state.scanFocusIndex = 0;
    state.mode = 'scan';
    world.setMode('scan');
    ui.setMode('scan');
    ui.setScanStatus('QR-Karte in den Rahmen ziehen');
    ui.setScanPayload(null);
    audio.click();
    ui.toast('Scanner aktiv. QR-Karte oder Smartphone in den Rahmen ziehen.', 'info');
  } else {
    ui.setScanPayload(null);
    ui.setScanStatus('');
    if (world.mode === 'scan') {
      const back = state.modeBeforeScan || 'hand';
      state.mode = back;
      world.setMode(back);
      ui.setMode(back);
    }
    audio.success();
  }
}

function cancelScan() {
  runtime.send('pointer', { x: 240, y: 735, down: 1 });
  setTimeout(() => runtime.send('pointer', { x: 240, y: 735, down: 0 }), 80);
  setTimeout(() => {
    if (state.scannerActive) {
      runtime.send('pointer', { x: 240, y: 700, down: 1 });
      setTimeout(() => runtime.send('pointer', { x: 240, y: 700, down: 0 }), 80);
    }
  }, 450);
  ui.setScanStatus('Scanner wird abgebrochen…');
}

function autoFocusScan() {
  const targets = [
    world.qrCards[1], world.qrCards[0], world.qrCards[2],
    ...world.phones,
  ].filter(Boolean);
  if (!targets.length) return;
  state.scanFocusIndex = (state.scanFocusIndex + 1) % targets.length;
  const target = targets[state.scanFocusIndex];
  world.focusScanObject(target);
  const label = target.userData?.label || (target.userData?.kind === 'phone' ? 'Smartphone QR' : 'QR-Karte');
  ui.setScanStatus(`Fokus ${state.scanFocusIndex + 1}/${targets.length}: ${label}`);
  audio.click();
}

function sendPointer(x, y, down) {
  runtime.send('pointer', { x: clamp(x, 0, 479), y: clamp(y, 0, 799), down });
}

function startScreenTouch(event, info) {
  if (!state.power) {
    ui.toast('Gerät ist aus. Power-Knopf klicken.', 'info');
    return;
  }
  state.touch = { pointerId: event.pointerId, lastX: info.x, lastY: info.y };
  world.controls.enabled = false;
  canvas.setPointerCapture(event.pointerId);
  sendPointer(info.x, info.y, 1);
  audio.tap();
}

function moveScreenTouch(event) {
  const info = world.raycastScreen(event);
  if (!info) return;
  const now = performance.now();
  if (now - state.lastPointerSent < 15) return;
  state.lastPointerSent = now;
  if (info.x !== state.touch.lastX || info.y !== state.touch.lastY) {
    state.touch.lastX = info.x;
    state.touch.lastY = info.y;
    sendPointer(info.x, info.y, 2);
  }
}

function endScreenTouch() {
  if (!state.touch) return;
  sendPointer(state.touch.lastX, state.touch.lastY, 0);
  state.touch = null;
  if (!state.scannerActive) world.controls.enabled = true;
}

function findKind(object) {
  let o = object;
  while (o) {
    if (o.userData?.kind) return { kind: o.userData.kind, object: o };
    o = o.parent;
  }
  return null;
}

function interactiveRoots() {
  return [
    device,
    hand,
    world.laptop,
    ...world.phones,
    ...world.qrCards,
    sdCard,
    ...smartcards,
    world.stand,
  ].filter(Boolean);
}

function onPointerDown(event) {
  if (event.button !== undefined && event.button !== 0 && event.pointerType === 'mouse') return;
  const hits = world.raycast(event, interactiveRoots());
  const hit = hits[0];
  const found = hit ? findKind(hit.object) : null;
  const kind = found?.kind;

  if (kind === 'power') {
    event.preventDefault();
    setPowerPressed(device, true);
    audio.click();
    setTimeout(() => setPowerPressed(device, false), 140);
    togglePower();
    return;
  }
  if (kind === 'screen') {
    event.preventDefault();
    const info = world.raycastScreen(event);
    if (info) startScreenTouch(event, info);
    return;
  }
  if (kind === 'laptop-screen') {
    event.preventDefault();
    airgap.open();
    if (hit?.uv) airgap.handleScreenClick(hit.uv);
    audio.click();
    return;
  }
  if (kind === 'sd-slot') {
    event.preventDefault();
    sdToggle();
    return;
  }
  if (kind === 'sc-slot') {
    event.preventDefault();
    if (state.activeCard) removeCard();
    else insertCard(1);
    return;
  }
  if (kind === 'microsd') {
    event.preventDefault();
    if (state.sdInserted) sdToggle();
    else startObjectDrag(event, sdCard, 'sd');
    return;
  }
  if (kind === 'smartcard') {
    event.preventDefault();
    const slot = found.object.userData.slot || smartcards.indexOf(found.object) + 1;
    if (state.activeCard === slot) removeCard();
    else startObjectDrag(event, found.object, 'sc', slot);
    return;
  }
  if (kind === 'phone' || kind === 'qr') {
    event.preventDefault();
    startObjectDrag(event, found.object, kind);
    return;
  }
  if (kind === 'device' || kind === 'hand') {
    if (state.mode === 'hand' && state.power) {
      event.preventDefault();
      startDeviceRotate(event);
    }
    return;
  }
}

function startDeviceRotate(event) {
  state.rotate = { pointerId: event.pointerId, lastX: event.clientX, lastY: event.clientY };
  world.controls.enabled = false;
  canvas.setPointerCapture(event.pointerId);
}

function moveDeviceRotate(event) {
  if (!state.rotate) return;
  const dx = event.clientX - state.rotate.lastX;
  const dy = event.clientY - state.rotate.lastY;
  state.rotate.lastX = event.clientX;
  state.rotate.lastY = event.clientY;
  world.rotateDeviceBy(dx, dy);
}

function startObjectDrag(event, object, kind, slot = null) {
  const point = object.position.clone();
  const normal = world.camera.getWorldDirection(new THREE.Vector3()).negate();
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, point);
  const ray = new THREE.Raycaster();
  ray.setFromCamera(world.pointerNDC(event), world.camera);
  const start = new THREE.Vector3();
  if (!ray.ray.intersectPlane(plane, start)) return;
  state.drag = {
    pointerId: event.pointerId,
    object,
    kind,
    slot,
    plane,
    offset: object.position.clone().sub(start),
    startX: event.clientX,
    startY: event.clientY,
    moved: false,
  };
  object.userData.dragging = true;
  world.controls.enabled = false;
  canvas.setPointerCapture(event.pointerId);
  audio.tap();
}

function moveObjectDrag(event) {
  const drag = state.drag;
  if (!drag) return;
  const ray = new THREE.Raycaster();
  ray.setFromCamera(world.pointerNDC(event), world.camera);
  const point = new THREE.Vector3();
  if (!ray.ray.intersectPlane(drag.plane, point)) return;
  drag.object.position.copy(point.add(drag.offset));
  if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 4) drag.moved = true;
  if (world.scanning) {
    drag.object.userData.scanHome = drag.object.position.clone();
    drag.object.userData.scanning = true;
  }
}

function endObjectDrag() {
  const drag = state.drag;
  if (!drag) return;
  drag.object.userData.dragging = false;
  state.drag = null;
  if (!state.scannerActive) world.controls.enabled = true;

  if (drag.kind === 'sd') {
    const slot = device.localToWorld(SD_SLOT_LOCAL.clone());
    const near = drag.object.position.distanceTo(slot) < 0.065 ||
      screenDistance(drag.object.position, slot) < 95;
    if (near) {
      if (!state.sdInserted) sdToggle();
      else drag.object.position.copy(SD_TRAY);
    }
  } else if (drag.kind === 'sc') {
    const slot = device.localToWorld(SC_SLOT_LOCAL.clone());
    const near = drag.object.position.distanceTo(slot) < 0.16 ||
      screenDistance(drag.object.position, slot) < 110;
    if (near) {
      if (state.activeCard !== drag.slot) insertCard(drag.slot);
    }
  } else {
    if (drag.kind === 'phone' && drag.object === world.phones[0] && !drag.moved) keeper.open();
    if (!world.scanning) {
      drag.object.userData.home.copy(drag.object.position);
      drag.object.userData.homeRot.copy(drag.object.rotation);
    }
  }
}

function onPointerMove(event) {
  if (state.touch) { moveScreenTouch(event); return; }
  if (state.rotate) { moveDeviceRotate(event); return; }
  if (state.drag) { moveObjectDrag(event); return; }
  const now = performance.now();
  if (now - state.lastHover < 70) return;
  state.lastHover = now;
  const hits = world.raycast(event, interactiveRoots());
  const hit = hits[0];
  const found = hit ? findKind(hit.object) : null;
  if (found) {
    const labels = {
      power: 'Power — click to toggle',
      screen: 'Specter touchscreen',
      'laptop-screen': 'Specter Desktop — click to open',
      microsd: state.sdInserted ? 'microSD — click to eject' : 'microSD — drag into the slot',
      smartcard: 'MemoryCard — click or drag',
      phone: 'Smartphone — drag into the scanner',
      qr: 'QR card — drag into the scanner',
      device: state.mode === 'hand' ? 'Specter DIY — drag to rotate' : 'Specter DIY',
      hand: 'Hand',
      'sd-slot': 'microSD slot',
      'sc-slot': 'MemoryCard slot',
    };
    ui.tooltip(labels[found.kind] || '', event.clientX, event.clientY - 14);
    const cursor = ['power', 'screen', 'laptop-screen'].includes(found.kind) ? 'pointer'
      : ['microsd', 'smartcard', 'phone', 'qr', 'device', 'hand'].includes(found.kind) ? 'grab' : 'default';
    canvas.style.cursor = cursor;
  } else {
    ui.tooltip('', 0, 0);
    canvas.style.cursor = state.mode === 'scan' ? 'grab' : 'default';
  }
}

function onPointerUp(event) {
  if (state.touch) endScreenTouch();
  if (state.rotate) {
    state.rotate = null;
    if (!state.scannerActive) world.controls.enabled = true;
  }
  if (state.drag) endObjectDrag();
  try { canvas.releasePointerCapture(event.pointerId); } catch {}
}

const canvas = document.getElementById('scene');
canvas.addEventListener('pointerdown', onPointerDown);
canvas.addEventListener('pointermove', onPointerMove);
canvas.addEventListener('pointerup', onPointerUp);
canvas.addEventListener('pointercancel', onPointerUp);
canvas.addEventListener('pointerleave', event => { if (!state.touch && !state.drag) ui.tooltip('', 0, 0); });
canvas.addEventListener('contextmenu', e => e.preventDefault());

function screenDistance(a, b) {
  const pa = a.clone().project(world.camera);
  const pb = b.clone().project(world.camera);
  const w = canvas.clientWidth || window.innerWidth;
  const h = canvas.clientHeight || window.innerHeight;
  const ax = (pa.x * 0.5 + 0.5) * w, ay = (-pa.y * 0.5 + 0.5) * h;
  const bx = (pb.x * 0.5 + 0.5) * w, by = (-pb.y * 0.5 + 0.5) * h;
  return Math.hypot(ax - bx, ay - by);
}

function updateCards(dt) {
  if (!device) return;
  const k = 1 - Math.exp(-12 * dt);
  const q = new THREE.Quaternion();
  if (!sdCard.userData.dragging) {
    const targetPos = state.sdInserted ? device.localToWorld(SD_SLOT_LOCAL.clone()) : SD_TRAY;
    const targetQuat = state.sdInserted ? device.getWorldQuaternion(q) : SD_TRAY_QUAT;
    sdCard.position.lerp(targetPos, k);
    sdCard.quaternion.slerp(targetQuat, k);
  }
  sdCard.visible = !(world.scanning && state.sdInserted);
  smartcards.forEach((card, i) => {
    const slot = i + 1;
    if (!card.userData.dragging) {
      const inserted = state.activeCard === slot;
      const targetPos = inserted ? device.localToWorld(SC_SLOT_LOCAL.clone()) : SC_TRAY[i];
      const targetQuat = inserted ? device.getWorldQuaternion(q) : SC_TRAY_QUATS[i];
      card.position.lerp(targetPos, k);
      card.quaternion.slerp(targetQuat, k);
    }
    card.visible = !(world.scanning && state.activeCard === slot);
  });
}

function updateSdFromStateFiles() {
  const files = state.stateFiles
    .filter(f => f.path.startsWith('sd/'))
    .map(f => ({ path: f.path.slice(3), size: f.bytes.byteLength }));
  state.sdFiles = files;
  state.sdUsed = files.reduce((n, f) => n + f.size, 0);
  ui.setSD(state.sdInserted, files, state.sdUsed, state.sdCapacity);
}

async function sdToggle() {
  if (state.sdInserted) {
    state.sdInserted = false;
    audio.eject();
    runtime.send('sd-eject');
    ui.setSD(false, state.sdFiles, state.sdUsed, state.sdCapacity);
    if (state.power) setTimeout(() => runtime.send('sd-list'), 250);
    ui.toast('microSD ausgeworfen.', 'info');
  } else {
    state.sdInserted = true;
    audio.insert();
    runtime.send('sd-insert');
    ui.setSD(true, state.sdFiles, state.sdUsed, state.sdCapacity);
    if (state.power) setTimeout(() => runtime.send('sd-list'), 250);
    ui.toast('microSD eingesetzt.', 'ok');
  }
}

async function importSdFiles() {
  if (!state.power) { ui.toast('Zuerst das Gerät einschalten.', 'info'); return; }
  const files = await pickFiles();
  if (!files.length) return;
  const imported = await Promise.all(files.map(async file => ({
    path: `sd/${file.name}`,
    bytes: new Uint8Array(await file.arrayBuffer()),
  })));
  runtime.send('state-import', { files: imported }, imported.map(f => f.bytes.buffer));
  ui.toast(`${files.length} Datei(en) auf SD importiert.`, 'ok');
  setTimeout(() => runtime.send('sd-list'), 450);
}

function clearSd() {
  if (!state.power) { ui.toast('Zuerst das Gerät einschalten.', 'info'); return; }
  if (!confirm('Alle Dateien auf der simulierten microSD löschen?')) return;
  runtime.send('sd-clear');
  ui.toast('microSD geleert.', 'info');
  setTimeout(() => runtime.send('sd-list'), 400);
}

function deleteSdFile(name) {
  if (!state.power) return;
  runtime.send('sd-delete', { name });
  setTimeout(() => runtime.send('sd-list'), 300);
}

function exportSdFile(name) {
  if (!state.power) { ui.toast('Zuerst das Gerät einschalten.', 'info'); return; }
  runtime.send('sd-export', { name });
}

function ensureCardFiles(slot) {
  if (state.stateFiles.some(f => f.path === `cards/${slot}/private.key`)) return;
  state.stateFiles.push({ path: `cards/${slot}/private.key`, bytes: crypto.getRandomValues(new Uint8Array(32)) });
  state.stateFiles.push({ path: `cards/${slot}/attempts`, bytes: new Uint8Array([10]) });
}

function insertCard(slot) {
  if (state.activeCard === slot) return;
  ensureCardFiles(slot);
  if (state.activeCard) runtime.send('card-remove');
  state.activeCard = slot;
  audio.insert();
  runtime.send('card-insert', { slot });
  ui.setCards(state.activeCard, state.cardSlots.length ? state.cardSlots : [1, 2, 3].map(s => ({ slot: s, initialized: s < 3 })));
  if (state.power) setTimeout(() => runtime.send('card-list'), 350);
  ui.toast(`MemoryCard ${slot} eingesetzt.`, 'ok');
}

function toggleCard(slot) {
  if (state.activeCard === slot) removeCard();
  else insertCard(slot);
}

function removeCard() {
  if (!state.activeCard) return;
  const slot = state.activeCard;
  state.activeCard = null;
  audio.eject();
  runtime.send('card-remove');
  ui.setCards(null, state.cardSlots.length ? state.cardSlots : [1, 2, 3].map(s => ({ slot: s, initialized: s < 3 })));
  if (state.power) setTimeout(() => runtime.send('card-list'), 300);
  ui.toast(`MemoryCard ${slot} ausgeworfen.`, 'info');
}

function resetCard(slot) {
  if (!state.power) { ui.toast('Zuerst das Gerät einschalten.', 'info'); return; }
  runtime.send('card-reset', { slot });
  ui.toast(`MemoryCard ${slot} zurückgesetzt.`, 'info');
  setTimeout(() => runtime.send('card-list'), 350);
}

async function loadDemo(network) {
  if (!state.power) { ui.toast('Zuerst das Gerät einschalten.', 'info'); return; }
  if (!network) {
    for (const name of state.demoFileNames) runtime.send('sd-delete', { name });
    state.demoFileNames = new Set();
    state.demoNetwork = '';
    ui.toast('Demo-Dateien von der SD entfernt.', 'info');
    setTimeout(() => runtime.send('sd-list'), 500);
    return;
  }
  const next = createDemoFiles(network);
  for (const name of demoAllNames) runtime.send('sd-delete', { name });
  await sleep(220);
  const imported = next.files.map(f => ({ path: `sd/${f.name}`, bytes: f.bytes }));
  runtime.send('state-import', { files: imported }, imported.map(f => f.bytes.buffer));
  state.demoFileNames = new Set(next.files.map(f => f.name));
  state.demoNetwork = network;
  ui.toast(`${network === 'mainnet' ? 'Mainnet' : 'Testnet'}-Demo geladen (${next.files.length} Dateien).`, 'ok');
  setTimeout(() => runtime.send('sd-list'), 650);
}

function getStateFiles() {
  if (state.power) return runtime.snapshot();
  return Promise.resolve(state.stateFiles);
}

function onWriteSd(payload, name = 'airgap-unsigned.psbt') {
  if (!state.power) { ui.toast('Zuerst das Gerät einschalten.', 'info'); return; }
  if (!state.sdInserted) sdToggle();
  const bytes = new TextEncoder().encode(payload);
  runtime.send('state-import', { files: [{ path: `sd/${name}`, bytes }] }, [bytes.buffer]);
  ui.toast(`PSBT auf SD geschrieben: ${name}`, 'ok');
  setTimeout(() => runtime.send('sd-list'), 400);
}

function pickQr(item) {
  if (!world.qrCards.length) return;
  const card = world.qrCards[0];
  world.setCardPayload(card, item.payload, item.label);
  card.position.set(0.06, 0.2, 0.12);
  card.userData.home.copy(card.position);
  card.userData.scanHome = card.position.clone();
  if (state.scannerActive) world.focusScanCard(0);
  ui.toast(`QR-Karte aktualisiert: ${item.label}`, 'ok');
  audio.click();
}

function createCustomQr(text) {
  if (!text || !text.trim()) { ui.toast('QR-Inhalt ist leer.', 'err'); return; }
  if (text.length > 4094) { ui.toast('QR-Inhalt ist zu groß (max. 4094 Bytes).', 'err'); return; }
  const card = createQrCard(text.trim(), 'Custom QR', 0x1f99e5);
  card.position.set(0.17, 0.24, 0.1);
  card.rotation.set(0.04, -0.35, 0.02);
  card.userData.home = card.position.clone();
  card.userData.homeRot = card.rotation.clone();
  card.userData.bob = 0.01;
  card.userData.bobPhase = Math.random() * 6;
  world.scene.add(card);
  world.qrCards.push(card);
  world.homeObjects.push(card);
  world.scanCards.push(card);
  ui.toast('Eigene QR-Karte in der Szene erzeugt.', 'ok');
  audio.insert();
}

function sendQrText(text) {
  if (!state.scannerActive) { ui.toast('Scanner ist nicht aktiv. Auf dem Gerät „Scan QR code“ öffnen.', 'info'); return; }
  if (!text || !text.trim()) return;
  const bytes = new TextEncoder().encode(text.trim());
  if (bytes.length > 4094) { ui.toast('QR-Inhalt ist zu groß.', 'err'); return; }
  runtime.send('qr', { bytes: bytes.buffer }, [bytes.buffer]);
  ui.toast('QR direkt an den Scanner gesendet.', 'ok');
  ui.setScanPayload(text.trim());
}

function toggleUsb(url) {
  if (state.usbSocket) {
    try { state.usbSocket.close(); } catch {}
    state.usbSocket = null;
    ui.setUsbConnected(false, url);
    ui.toast('USB-Brücke getrennt.', 'info');
    return;
  }
  try {
    const ws = new WebSocket(url);
    ws.binaryType = 'arraybuffer';
    ws.onopen = () => {
      state.usbSocket = ws;
      ui.setUsbConnected(true, url);
      ui.toast('USB-Brücke verbunden. Achtung: nicht air-gapped.', 'warn');
    };
    ws.onmessage = event => {
      const bytes = event.data instanceof ArrayBuffer ? new Uint8Array(event.data) : new TextEncoder().encode(String(event.data));
      runtime.send('usb-data', { bytes }, [bytes.buffer]);
    };
    ws.onclose = () => {
      if (state.usbSocket === ws) state.usbSocket = null;
      ui.setUsbConnected(false, url);
      ui.log('USB bridge closed.');
    };
    ws.onerror = () => ui.toast('USB-Brücke konnte nicht verbinden.', 'err');
    state.usbSocket = ws;
  } catch (error) {
    ui.toast(`USB-Fehler: ${error.message}`, 'err');
  }
}

function onWriteSdFromPanel(payload, name) { onWriteSd(payload, name); }

async function init() {
  ui.setPower(false);
  ui.setSD(state.sdInserted, state.sdFiles, state.sdUsed, state.sdCapacity);
  ui.setCards(state.activeCard, state.cardSlots);
  ui.setScanner(false);
  ui.setMode('hand');
  ui.log('Specter DIY 3D Lab initialisiert. Nur Testdaten.');

  try {
    const info = await runtime.loadBuildInfo();
    ui.setFirmware(info);
  } catch (error) {
    ui.log(`Build-Info nicht geladen: ${error.message}`);
  }

  const demoNow = createDemoFiles('testnet');
  const low = demoNow.files.find(f => f.name === 'testnet-ghost-payment-low-fee.psbt');
  const high = demoNow.files.find(f => f.name === 'testnet-ghost-payment-high-fee.psbt');
  const walletJson = demoNow.files.find(f => f.name.endsWith('.json'));
  const items = [
    { label: 'Ghost Seed', kind: 'Seed QR', payload: demoNow.roots.ghost.mnemonic },
    { label: 'PSBT · low fee', kind: 'PSBT QR', payload: new TextDecoder().decode(low.bytes).trim() },
    { label: 'PSBT · high fee', kind: 'PSBT QR', payload: new TextDecoder().decode(high.bytes).trim() },
    { label: 'Wallet descriptor', kind: 'JSON QR', payload: new TextDecoder().decode(walletJson.bytes).trim() },
  ];
  ui.renderQrLibrary(items);

  try {
    device = await createDevice(screenTexture.texture);
    hand = createHand();
    world.attachDevice(device, hand);
    setDevicePower(device, false);

    sdCard = createMicroSD();
    sdCard.position.copy(SD_TRAY);
    sdCard.quaternion.copy(SD_TRAY_QUAT);
    world.scene.add(sdCard);

    smartcards = [1, 2, 3].map(slot => {
      const card = createSmartcard();
      card.userData.slot = slot;
      card.position.copy(SC_TRAY[slot - 1]);
      card.quaternion.copy(SC_TRAY_QUATS[slot - 1]);
      world.scene.add(card);
      return card;
    });

    world.laptop.userData.screenTexture.needsUpdate = true;
    airgap.setDeviceState('offline');
    airgap.draw();
  } catch (error) {
    ui.log(`3D-Assets Fehler: ${error.stack || error.message}`);
    ui.toast('3D-Assets konnten nicht geladen werden.', 'err', 8000);
  }

  document.getElementById('boot-veil').classList.add('hide');
  setTimeout(() => document.getElementById('boot-veil')?.remove(), 900);

  let lastBootRender = 0;
  rafLoop((dt, t) => {
    if (device) updateCards(dt);
    world.update(dt, t);
    if (device && !state.power) {
      const u = device.userData;
      const pulse = 0.35 + (Math.sin(t * 1.8) + 1) * 0.18;
      u.powerGlow.material.opacity = pulse;
      u.powerGlow.material.color.set(0x0a2030);
    }
    if (state.booting) {
      if (t - lastBootRender > 400) {
        screenTexture.drawBoot();
        world.render();
        lastBootRender = t;
      }
    } else {
      world.render();
    }
  });
}

window.addEventListener('beforeunload', () => {
  runtime?.stopWorker();
});

init().catch(error => {
  console.error(error);
  document.getElementById('boot-veil').classList.add('hide');
  ui?.toast(`Initialisierung fehlgeschlagen: ${error.message}`, 'err', 9000);
});

window.__lab = {
  THREE,
  state,
  world,
  runtime,
  screenTexture,
  get device() { return device; },
  get hand() { return hand; },
  get sdCard() { return sdCard; },
  get smartcards() { return smartcards; },
  airgap,
  keeper,
  ui,
  togglePower,
  setMode,
  handleScanner,
  autoFocusScan,
  sdToggle,
  insertCard,
  removeCard,
  restart,
};















