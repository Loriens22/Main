// Street furniture: signal heads, stop poles, signs, bins, benches, fences, lamps, bollards.
import * as THREE from 'three';
import { WM } from './materials.js';
import { mat, roundedBox } from '../util.js';
import { SIGNS, signUV } from './buildings.js';
import * as TX from '../textures.js';

const signTexCache = {};
function roadSignMat(kind) {
  if (!signTexCache[kind]) signTexCache[kind] = new THREE.MeshStandardMaterial({ map: TX.roadSign(kind), transparent: true, alphaTest: 0.4, roughness: 0.5, side: THREE.DoubleSide });
  return signTexCache[kind];
}
const yellowPole = new THREE.MeshStandardMaterial({ color: 0xf2c200, roughness: 0.5, metalness: 0.2, vertexColors: true });
const signalHousing = new THREE.MeshStandardMaterial({ color: 0xe8b800, roughness: 0.45, metalness: 0.15, vertexColors: true });
const black = new THREE.MeshStandardMaterial({ color: 0x111214, roughness: 0.6, vertexColors: true });

/** Vehicle signal head (3 lenses) at world pos facing direction `face` (heading of approaching traffic reversed). */
export function signalHead(cb, x, y, z, faceYaw, mats, { visor = true } = {}) {
  const M = mat(x, y, z, 0, faceYaw);
  const add = (m, g, lm) => cb.add(m, g, M.clone().multiply(lm));
  add(signalHousing, roundedBox(0.34, 1.0, 0.24, 0.05), mat(0, 0, 0));
  add(black, new THREE.BoxGeometry(0.6, 1.25, 0.02), mat(0, 0, -0.12)); // back plate
  const lensG = new THREE.CircleGeometry(0.1, 20);
  [['R', 0.32], ['Y', 0], ['G', -0.32]].forEach(([c, dy]) => {
    add(mats[c], lensG, mat(0, dy, 0.121));
    if (visor) add(black, new THREE.CylinderGeometry(0.125, 0.125, 0.18, 14, 1, true, -Math.PI / 2, Math.PI).rotateX(Math.PI / 2), mat(0, dy + 0.005, 0.2));
  });
}
export function pedHead(cb, x, y, z, faceYaw, mats) {
  const M = mat(x, y, z, 0, faceYaw);
  const add = (m, g, lm) => cb.add(m, g, M.clone().multiply(lm));
  add(signalHousing, roundedBox(0.3, 0.62, 0.2, 0.04), mat(0, 0, 0));
  add(mats.PR, new THREE.PlaneGeometry(0.2, 0.2), mat(0, 0.15, 0.101));
  add(mats.PG, new THREE.PlaneGeometry(0.2, 0.2), mat(0, -0.15, 0.101));
}

/** Signal poles for every approach of an intersection. faceYaw so +z of head faces approaching drivers. */
export function intersectionSignals(cb, route, tl, it) {
  for (const arm of [it.a, it.b]) {
    const st = arm.st;
    const g = it.groups[st.id];
    const mats = tl.mats(it, g);
    for (const dir of [1, -1]) {
      // approaching traffic moves in +dir along the street, located on its right (lateral = dir * 5)
      const sStop = arm.s - dir * 25.5;
      const p = st.poly.at(sStop);
      const hTravel = p.h + (dir < 0 ? Math.PI : 0);
      const rx = -Math.sin(hTravel), rz = Math.cos(hTravel);
      // near-side pole on the right sidewalk edge
      const x = p.x + rx * (st.halfW + 0.9), z = p.z + rz * (st.halfW + 0.9);
      // head faces towards approaching traffic (opposite of travel direction)
      const faceYaw = Math.atan2(-Math.cos(hTravel), -Math.sin(hTravel)); // local +z → towards oncoming traffic
      cb.add(yellowPole, new THREE.CylinderGeometry(0.065, 0.075, 3.6, 10), mat(x, 1.8, z));
      for (let k = 0; k < 4; k++) cb.add(black, new THREE.CylinderGeometry(0.078, 0.078, 0.12, 10), mat(x, 0.25 + k * 0.28, z));
      signalHead(cb, x, 3.0, z, faceYaw, mats);
      // repeater on the far side (left, after the intersection)
      const q = st.poly.at(arm.s + dir * 21);
      const lx = q.x - rx * (st.halfW + 0.9), lz = q.z - rz * (st.halfW + 0.9);
      cb.add(yellowPole, new THREE.CylinderGeometry(0.065, 0.075, 3.9, 10), mat(lx, 1.95, lz));
      signalHead(cb, lx, 3.3, lz, faceYaw, mats);
      // pedestrian heads at the crosswalk (crossing this street) on both ends, facing across
      const pm = mats; // ped heads use this street's group materials (PG lit when the other group runs)
      const cp = st.poly.at(arm.s + dir * 22);
      for (const s2 of [-1, 1]) {
        const px = cp.x + rx * s2 * (st.halfW + 1.2), pz = cp.z + rz * s2 * (st.halfW + 1.2);
        cb.add(yellowPole, new THREE.CylinderGeometry(0.05, 0.06, 2.6, 8), mat(px, 1.3, pz));
        const yawAcross = Math.atan2(rx * -s2, rz * -s2);
        pedHead(cb, px, 2.3, pz, yawAcross, pm);
      }
    }
  }
}

export function trashBin(cb, x, z) {
  cb.add(black, new THREE.CylinderGeometry(0.24, 0.22, 0.75, 14), mat(x, 0.15 + 0.4, z), 0x222426);
  cb.add(yellowPole, new THREE.CylinderGeometry(0.245, 0.245, 0.08, 14), mat(x, 0.15 + 0.62, z));
  cb.add(yellowPole, new THREE.CylinderGeometry(0.235, 0.235, 0.06, 14), mat(x, 0.15 + 0.3, z));
  cb.add(WM.metalDark, new THREE.CylinderGeometry(0.03, 0.03, 0.9, 6), mat(x - 0.26, 0.6, z));
}

export function stopPole(cb, x, z, yaw, name, { display = true } = {}) {
  const M = mat(x, 0, z, 0, yaw);
  const add = (m, g, lm, c) => cb.add(m, g, M.clone().multiply(lm), c);
  add(WM.metal, new THREE.CylinderGeometry(0.045, 0.05, 3.1, 10), mat(0, 1.7, 0));
  add(roadSignMat('busstop'), new THREE.CircleGeometry(0.3, 28), mat(0, 2.95, 0.05));
  add(roadSignMat('busstop'), new THREE.CircleGeometry(0.3, 28), mat(0, 2.95, -0.05, 0, Math.PI));
  const plate = new THREE.PlaneGeometry(0.8, 0.28);
  add(SIGNS.mat, signUV(plate, [name], '#ffffff', '#1b3f8f', 512, 180), mat(0, 2.45, 0.05));
  add(SIGNS.mat, signUV(plate, [name], '#ffffff', '#1b3f8f', 512, 180), mat(0, 2.45, -0.05, 0, Math.PI));
  if (display) {
    add(black, roundedBox(0.6, 0.42, 0.12, 0.03), mat(0, 1.75, 0));
    add(SIGNS.mat, signUV(new THREE.PlaneGeometry(0.5, 0.34), ['9   2 мин', '76  5 мин', '111 9 мин'], '#050505', '#ffa726', 256, 180, { font: TX.FONT_MONO }), mat(0, 1.75, 0.062));
  }
}

export function roadSign(cb, x, z, yaw, kind, h = 2.4) {
  cb.add(WM.metal, new THREE.CylinderGeometry(0.035, 0.035, h, 8), mat(x, 0.15 + h / 2, z));
  cb.add(roadSignMat(kind), new THREE.PlaneGeometry(0.62, 0.62), mat(x, 0.15 + h + 0.1, z, 0, yaw));
}

export function streetNamePlate(cb, x, z, yaw, name) {
  cb.add(WM.metal, new THREE.CylinderGeometry(0.035, 0.035, 2.7, 8), mat(x, 1.5, z));
  const g = new THREE.PlaneGeometry(1.3, 0.32);
  cb.add(SIGNS.mat, signUV(g, [name], '#1d4e9e', '#ffffff', 768, 180), mat(x, 2.75, z, 0, yaw));
  cb.add(SIGNS.mat, signUV(g, [name], '#1d4e9e', '#ffffff', 768, 180), mat(x, 2.75, z, 0, yaw + Math.PI));
}

export function bollardRow(cb, pts) { for (const [x, z] of pts) { cb.add(WM.metalDark, new THREE.CylinderGeometry(0.07, 0.08, 0.9, 10), mat(x, 0.6, z)); cb.add(yellowPole, new THREE.CylinderGeometry(0.075, 0.075, 0.06, 10), mat(x, 0.95, z)); } }

/** Pedestrian barrier (galvanised rails) along a line of points. */
export function barrier(cb, pts) {
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const L = Math.hypot(bx - ax, bz - az), yaw = -Math.atan2(bz - az, bx - ax);
    const cx = (ax + bx) / 2, cz = (az + bz) / 2;
    for (const y of [0.45, 1.05]) cb.add(WM.galv, new THREE.CylinderGeometry(0.025, 0.025, L, 6).rotateZ(Math.PI / 2), mat(cx, 0.15 + y, cz, 0, yaw));
    cb.add(WM.galv, new THREE.CylinderGeometry(0.03, 0.03, 1.05, 6), mat(ax, 0.15 + 0.53, az));
    for (let t = 0.12; t < 1; t += 0.12) cb.add(WM.galv, new THREE.CylinderGeometry(0.01, 0.01, 0.6, 4), mat(ax + (bx - ax) * t, 0.15 + 0.75, az + (bz - az) * t));
    cb.add(yellowPole, new THREE.BoxGeometry(0.05, 0.12, 0.03), mat(ax, 0.15 + 1.0, az, 0, yaw));
  }
}

/** Standalone street lamp (for minor streets & paths). */
export function streetLamp(cb, x, z, yaw, h = 7) {
  cb.add(WM.metal, new THREE.CylinderGeometry(0.07, 0.11, h, 10), mat(x, h / 2, z));
  const ax = Math.cos(-yaw), az = Math.sin(-yaw);
  cb.add(WM.metal, new THREE.CylinderGeometry(0.04, 0.04, 1.4, 8).rotateZ(Math.PI / 2), mat(x + ax * 0.7, h - 0.1, z + az * 0.7, 0, yaw));
  cb.add(WM.metalDark, new THREE.BoxGeometry(0.55, 0.1, 0.25), mat(x + ax * 1.45, h - 0.05, z + az * 1.45, 0, yaw));
}

export function recyclingSet(cb, x, z, yaw) {
  const cols = [0x2e7d32, 0x1565c0, 0xf9a825];
  cols.forEach((c, i) => {
    const px = x + Math.cos(-yaw) * (i - 1) * 1.7, pz = z + Math.sin(-yaw) * (i - 1) * 1.7;
    cb.add(WM.plastic, new THREE.CylinderGeometry(0.7, 0.8, 1.5, 12), mat(px, 0.75, pz), c);
    cb.add(WM.plastic, new THREE.SphereGeometry(0.7, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat(px, 1.5, pz), c);
  });
  cb.add(WM.metal, roundedBox(1.2, 1.3, 1.1, 0.08), mat(x + Math.cos(-yaw) * 3.4, 0.7, z + Math.sin(-yaw) * 3.4, 0, yaw), 0x8a9095);
}

export function trafficMirror(cb, x, z, yaw) {
  cb.add(WM.metal, new THREE.CylinderGeometry(0.04, 0.04, 2.8, 8), mat(x, 1.4, z));
  cb.add(WM.painted, new THREE.TorusGeometry(0.34, 0.05, 8, 24), mat(x, 2.9, z, 0, yaw), 0xd32f2f);
  cb.add(new THREE.MeshStandardMaterial({ color: 0xd0d8e0, metalness: 1, roughness: 0.05 }), new THREE.CircleGeometry(0.33, 24), mat(x, 2.9, z, 0, yaw));
}
