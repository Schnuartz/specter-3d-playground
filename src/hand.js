import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/RoundedBoxGeometry.js';
import { skin, plastic } from './objects.js';

function capsuleBetween(a, b, radius, material, radialSegments = 14) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = Math.max(0.0001, dir.length());
  const geo = new THREE.CapsuleGeometry(radius, Math.max(0.0001, len - radius * 2), 6, radialSegments);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function joint(p, radius, material) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 16, 12), material);
  mesh.position.copy(p);
  mesh.castShadow = true;
  return mesh;
}

export function createHand() {
  const group = new THREE.Group();
  const mat = skin();
  const nailMat = new THREE.MeshPhysicalMaterial({
    color: 0xd8a98e, roughness: 0.35, clearcoat: 0.5, clearcoatRoughness: 0.25, sheen: 0.2,
  });
  const sleeveMat = plastic(0x15181d, 0.85, 0.02);

  const palm = new THREE.Mesh(new RoundedBoxGeometry(0.072, 0.078, 0.027, 6, 0.012), mat);
  palm.position.set(0.004, -0.094, -0.027);
  palm.rotation.set(0.06, -0.04, -0.06);
  palm.castShadow = true;
  palm.receiveShadow = true;
  group.add(palm);

  const knuckleBar = new THREE.Mesh(new RoundedBoxGeometry(0.06, 0.016, 0.022, 4, 0.008), mat);
  knuckleBar.position.set(0.03, -0.057, -0.02);
  knuckleBar.rotation.z = -0.08;
  group.add(knuckleBar);

  const fingerDefs = [
    { y: -0.049, base: 0.041, curl: 0.012, r: 0.0075 },
    { y: -0.028, base: 0.043, curl: 0.011, r: 0.0078 },
    { y: -0.007, base: 0.043, curl: 0.010, r: 0.0076 },
    { y: 0.014, base: 0.041, curl: 0.009, r: 0.0068 },
  ];
  for (const f of fingerDefs) {
    const p0 = new THREE.Vector3(f.base, f.y, -0.032);
    const p1 = new THREE.Vector3(f.base - 0.001, f.y + 0.001, -0.008);
    const p2 = new THREE.Vector3(f.base - 0.006, f.y + 0.002, 0.010);
    const p3 = new THREE.Vector3(f.base - 0.015, f.y + 0.003, f.curl + 0.006);
    group.add(capsuleBetween(p0, p1, f.r, mat));
    group.add(capsuleBetween(p1, p2, f.r * 0.94, mat));
    group.add(capsuleBetween(p2, p3, f.r * 0.86, mat));
    group.add(joint(p1, f.r, mat));
    group.add(joint(p2, f.r * 0.94, mat));
    const nail = new THREE.Mesh(new THREE.SphereGeometry(f.r * 0.55, 12, 8), nailMat);
    nail.scale.set(1.1, 0.35, 1.35);
    nail.position.copy(p3).add(new THREE.Vector3(-0.001, 0.001, 0.004));
    group.add(nail);
  }

  const t0 = new THREE.Vector3(-0.03, -0.085, -0.025);
  const t1 = new THREE.Vector3(-0.039, -0.046, -0.002);
  const t2 = new THREE.Vector3(-0.035, -0.019, 0.014);
  const t3 = new THREE.Vector3(-0.025, -0.011, 0.019);
  group.add(capsuleBetween(t0, t1, 0.0105, mat));
  group.add(capsuleBetween(t1, t2, 0.0092, mat));
  group.add(capsuleBetween(t2, t3, 0.0082, mat));
  group.add(joint(t1, 0.0105, mat));
  group.add(joint(t2, 0.0092, mat));
  const thumbNail = new THREE.Mesh(new THREE.SphereGeometry(0.0048, 12, 8), nailMat);
  thumbNail.scale.set(1.2, 0.4, 1.4);
  thumbNail.position.copy(t3).add(new THREE.Vector3(-0.001, 0.001, 0.004));
  group.add(thumbNail);

  const wrist = capsuleBetween(
    new THREE.Vector3(0.004, -0.13, -0.032),
    new THREE.Vector3(0.0, -0.24, -0.042),
    0.031, mat, 18
  );
  group.add(wrist);

  const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.041, 0.055, 24, 1, true), sleeveMat);
  sleeve.position.set(0.0, -0.185, -0.044);
  sleeve.rotation.z = -0.08;
  sleeve.castShadow = true;
  group.add(sleeve);
  const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.0355, 0.0028, 8, 32), plastic(0x22262d, 0.7, 0.05));
  cuff.position.set(0.0, -0.158, -0.043);
  cuff.rotation.x = Math.PI / 2;
  group.add(cuff);

  group.position.set(0, 0.0, 0);
  group.userData = { kind: 'hand' };
  return group;
}
