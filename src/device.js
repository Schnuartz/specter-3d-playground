import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/GLTFLoader.js';
import { RoundedBoxGeometry } from 'three/addons/RoundedBoxGeometry.js';
import { metal } from './objects.js';

const loader = new GLTFLoader();

function loadGLB(url) {
  return new Promise((resolve, reject) => loader.load(url, resolve, undefined, reject));
}

function logoTexture() {
  return new THREE.TextureLoader().load('assets/specter-logo.png');
}

function slotFrame(w, h, d, color = 0x24282e) {
  const g = new THREE.Group();
  const frame = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, 0.0006), metal(color, 0.35, 0.9));
  g.add(frame);
  const dark = new THREE.Mesh(new THREE.BoxGeometry(w * 0.82, h * 0.72, d * 1.2), new THREE.MeshBasicMaterial({ color: 0x030405 }));
  g.add(dark);
  return g;
}

export async function createDevice(screenTexture) {
  const gltf = await loadGLB('assets/models/specter2.glb');
  const model = gltf.scene;

  model.rotation.x = Math.PI / 2;
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  model.position.sub(center);
  model.updateMatrixWorld(true);

  const group = new THREE.Group();
  group.add(model);

  const shell = model.getObjectByName('shell');
  const glassMesh = model.getObjectByName('glass');
  const screenMesh = model.getObjectByName('screen_ui');
  const sdcardModel = model.getObjectByName('sdcard');
  const cameraModel = model.getObjectByName('camera');
  const button0 = model.getObjectByName('button_0');
  const button1 = model.getObjectByName('button_1');
  const button2 = model.getObjectByName('button_2');

  if (screenMesh) {
    screenMesh.material = new THREE.MeshBasicMaterial({ map: screenTexture, toneMapped: false });
    screenMesh.userData.kind = 'screen';
    screenMesh.position.z += 0.0105;
  }
  if (glassMesh) {
    glassMesh.material = new THREE.MeshPhysicalMaterial({
      color: 0x0a0c10, metalness: 0.1, roughness: 0.08, transparent: true, opacity: 0.16,
      clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.2, depthWrite: false,
    });
    glassMesh.userData.kind = 'screen';
    glassMesh.renderOrder = 2;
  }
  if (sdcardModel) sdcardModel.visible = false;

  if (button0) {
    button0.userData.kind = 'power';
    button0.castShadow = true;
  }

  const powerPos = new THREE.Vector3();
  if (button0) button0.getWorldPosition(powerPos);
  const powerRing = new THREE.Mesh(new THREE.TorusGeometry(0.0058, 0.0008, 10, 28), metal(0x4b525c, 0.28, 1));
  powerRing.rotation.y = Math.PI / 2;
  powerRing.position.copy(powerPos).add(new THREE.Vector3(0.0008, 0, 0));
  powerRing.userData.kind = 'power';
  group.add(powerRing);
  const powerGlow = new THREE.Mesh(new THREE.TorusGeometry(0.0061, 0.00045, 8, 28), new THREE.MeshBasicMaterial({ color: 0x0a2030, transparent: true, opacity: 0.55 }));
  powerGlow.rotation.y = Math.PI / 2;
  powerGlow.position.copy(powerPos).add(new THREE.Vector3(0.0011, 0, 0));
  powerGlow.userData.kind = 'power';
  group.add(powerGlow);

  const ledMat = new THREE.MeshBasicMaterial({ color: 0x1a1d22 });
  const led = new THREE.Mesh(new THREE.CircleGeometry(0.0008, 18), ledMat);
  led.position.set(0.025, -0.053, 0.0104);
  group.add(led);

  const logo = new THREE.Mesh(new THREE.PlaneGeometry(0.018, 0.006), new THREE.MeshBasicMaterial({
    map: logoTexture(), transparent: true, depthWrite: false, opacity: 0.9,
  }));
  logo.position.set(0, -0.0525, 0.0104);
  group.add(logo);

  const sdSlot = slotFrame(0.014, 0.0024, 0.0042);
  sdSlot.position.set(-0.017, 0.0586, 0.0042);
  sdSlot.userData.kind = 'sd-slot';
  group.add(sdSlot);

  const scSlot = slotFrame(0.0026, 0.058, 0.004);
  scSlot.position.set(0.0348, 0.0, -0.0095);
  scSlot.userData.kind = 'sc-slot';
  group.add(scSlot);

  const screenLight = new THREE.PointLight(0x9fd8ff, 0.12, 0.3, 2);
  screenLight.position.set(0, 0, 0.035);
  group.add(screenLight);

  const resetHole = new THREE.Mesh(new THREE.CircleGeometry(0.0006, 12), new THREE.MeshBasicMaterial({ color: 0x010203 }));
  resetHole.position.set(-0.026, -0.0586, 0.001);
  resetHole.rotation.x = Math.PI / 2;
  group.add(resetHole);

  if (cameraModel) cameraModel.userData.kind = 'camera';

  group.userData = {
    kind: 'device',
    model, shell, glassMesh, screenMesh, screenMat: screenMesh?.material,
    screenTexture, sdcardModel, cameraModel,
    powerCap: button0, powerRing, powerGlow, led, ledMat,
    sdSlot, scSlot, screenLight,
    screenSize: { w: 0.06012, h: 0.10525 },
    caseSize: { w: 0.069, h: 0.117, d: 0.0192 },
  };
  return group;
}

export function setDevicePower(device, on) {
  const u = device.userData;
  u.ledMat.color.set(on ? 0x65c7ff : 0x1a1d22);
  u.powerGlow.material.color.set(on ? 0x1f99e5 : 0x0a2030);
  u.powerGlow.material.opacity = on ? 0.95 : 0.5;
  u.screenLight.intensity = on ? 0.12 : 0;
  if (u.screenMat) u.screenMat.color.set(on ? 0xffffff : 0x111111);
}

export function setPowerPressed(device, pressed) {
  const cap = device.userData.powerCap;
  if (!cap) return;
  cap.position.x = pressed ? 0.0368 : 0.0375;
}
