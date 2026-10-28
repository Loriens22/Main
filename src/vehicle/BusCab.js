// Driver's cab of the MAN Lion's City G CNG (interior_spec.md section 7, photo 5): raised platform with
// yellow nosing, smoked partition with notices, clear driver screen, console, navy dashboard pad with
// light-grey lower panels, instrument cluster, steering wheel, seat, interior mirror, sun blind.
import * as THREE from 'three';
import { kitMesh } from './BusKit.js';
import { BUS, FRONT_Z } from './BusSpec.js';
import { CAB_Y } from './BusLayout.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { M, box } from './BusGeom.js';
import { texBox, quad, decal, rod, sweep, smooth } from './BusInteriorGeom.js';

const FY = BUS.floorY;
/** z of the partition behind the driver (front frame). */
export const CAB_PARTITION_Z = -5.86;
const HEADER_Y = 2.52;

const DX = -0.74; // driver's x

/** Static cab geometry, added to the front section's merged interior parts (one draw call per material). */
export function addCabParts(p, low) {
  const zf = FRONT_Z;
  // ---- raised platform with yellow nosing
  const pz0 = -7.5, pz1 = CAB_PARTITION_Z;
  p.add('floor', texBox(0.79, CAB_Y - FY, pz1 - pz0), M(-0.795, (CAB_Y + FY) / 2, (pz0 + pz1) / 2));
  p.add('stripYellow', box(0.045, 0.004, pz1 - pz0 - 0.05), M(-0.4225, CAB_Y + 0.002, (pz0 + pz1) / 2));
  p.add('stripYellow', box(0.006, 0.045, pz1 - pz0 - 0.05), M(-0.4, CAB_Y - 0.0225, (pz0 + pz1) / 2));
  // ---- dashboard: solid body, navy soft pad across the full windscreen width, light-grey panels
  p.add('cabPanel', box(2.38, 1.28 - FY, 0.48), M(0, (1.28 + FY) / 2, zf + 0.265));
  p.add('dashPad', box(2.4, 0.12, 0.5), M(0, 1.34, zf + 0.275));
  // driver binnacle with the instrument cluster, hood, side switch panels
  p.add('dash', box(0.64, 0.18, 0.3), M(DX, 1.45, zf + 0.37));
  p.add('dash', box(0.7, 0.03, 0.13), M(DX, 1.575, zf + 0.5));
  p.add('dash', box(0.26, 0.1, 0.44), M(-1.06, 1.33, zf + 0.7));
  p.add('dash', box(0.22, 0.08, 0.3), M(-0.5, 1.32, zf + 0.7));
  if (!low) {
    for (let i = 0; i < 4; i++) p.add(i === 3 ? 'redPlastic' : 'plastic', box(0.035, 0.012, 0.035), M(-1.12 + (i % 2) * 0.06, 1.385, zf + 0.58 + Math.floor(i / 2) * 0.07));
    for (let i = 0; i < 3; i++) p.add('plastic', box(0.03, 0.012, 0.03), M(-0.56 + i * 0.045, 1.365, zf + 0.62));
    p.add('dash', new THREE.SphereGeometry(0.025, 10, 8), M(-0.2, 1.43, zf + 0.35)); // ball knob
    p.add('plastic', rod([-0.2, 1.4, zf + 0.35], [-0.2, 1.43, zf + 0.35], 0.01, 6));
  }
  p.add('plastic', rod([DX, CAB_Y + 0.8 - 0.03, zf + 0.9], [DX, 1.3, zf + 0.5], 0.035, 10));
  // pedals
  p.add('plastic', box(0.09, 0.02, 0.2), new THREE.Matrix4().makeRotationX(-0.9).setPosition(-0.62, CAB_Y + 0.2, zf + 0.75));
  p.add('plastic', box(0.15, 0.02, 0.2), new THREE.Matrix4().makeRotationX(-0.9).setPosition(-0.88, CAB_Y + 0.2, zf + 0.75));
  // ---- driver's seat (air-suspended high back, dark cloth, navy bolsters)
  const sz = zf + 1.5;
  p.add('dash', box(0.3, 0.4, 0.3), M(DX, CAB_Y + 0.2, sz));
  p.add('dash', box(0.52, 0.1, 0.5), M(DX, CAB_Y + 0.45, sz));
  p.add('dash', box(0.5, 0.74, 0.12), new THREE.Matrix4().makeRotationX(-0.14).setPosition(DX, CAB_Y + 0.88, sz + 0.28));
  p.add('dash', box(0.28, 0.2, 0.1), M(DX, CAB_Y + 1.36, sz + 0.34));
  for (const s of [-1, 1]) {
    p.add('dashPad', box(0.07, 0.34, 0.14), new THREE.Matrix4().makeRotationX(-0.14).setPosition(DX + s * 0.22, CAB_Y + 0.8, sz + 0.24));
    p.add('dashPad', box(0.07, 0.06, 0.4), M(DX + s * 0.27, CAB_Y + 0.52, sz));
  }
  // ---- partition behind the driver: lower panel, black frame, smoked glazing, white pillar, notices
  const px0 = -1.19, px1 = -0.45, pzp = CAB_PARTITION_Z;
  p.add('cabPanel', box(px1 - px0, 1.21 - FY, 0.04), M((px0 + px1) / 2, (1.21 + FY) / 2, pzp - 0.02));
  p.add('glassSmoked', quad('z', px0, px1, 1.25, 2.55, pzp - 0.005, true));
  for (const y of [1.23, 2.56]) p.add('frame', box(px1 - px0 + 0.02, 0.05, 0.05), M((px0 + px1) / 2, y, pzp - 0.02));
  p.add('frame', box(0.035, 1.35, 0.05), M(px0 + 0.0175, 1.9, pzp - 0.02));
  p.add('wall', box(0.1, 2.58 - FY, 0.12), M(-0.4, (2.58 + FY) / 2, pzp - 0.04));
  const note = (name, w, h, x, y) => p.add('signs', decal(w, h, name), M(x, y, pzp + 0.001));
  note('banner', 0.3, 0.05, -0.8, 2.42);
  note('a4', 0.21, 0.3, -0.8, 2.12);
  note('wifi', 0.12, 0.05, -0.88, 1.8);
  note('noPhone', 0.05, 0.05, -0.68, 1.8);
  // ---- aisle-side clear driver screen with black post and two curved pull handles; it runs from the
  // partition forward to beside the driver's head, so its post never stands in the forward view
  const sz0 = -6.3;
  p.add('glass', quad('x', sz0, pzp - 0.1, 1.35, 2.55, -0.4, true));
  p.add('frame', box(0.04, 1.25, 0.04), M(-0.4, 1.95, sz0));
  p.add('frame', box(0.04, 0.04, pzp - 0.1 - sz0), M(-0.4, 1.35, (sz0 + pzp - 0.1) / 2));
  for (const [y0, y1] of [[1.5, 1.9], [2.05, 2.35]]) {
    const h = smooth([[-0.37, y0, pzp - 0.05], [-0.32, y0 + 0.08, pzp - 0.05], [-0.32, y1 - 0.08, pzp - 0.05], [-0.37, y1, pzp - 0.05]], 10);
    p.add('pole', sweep(h, 0.015, 6, { caps: true }));
  }
  // ---- console right of the driver: cabinet, navy shelf, terminal on a stalk, yellow step strip
  p.add('cabPanel', box(0.4, 1.0 - FY, 0.6), M(-0.2, (1.0 + FY) / 2, -6.6));
  p.add('dashPad', box(0.42, 0.06, 0.62), M(-0.2, 1.03, -6.6));
  p.add('frame', box(0.12, 0.08, 0.025), new THREE.Matrix4().makeRotationX(-0.4).setPosition(-0.15, 1.28, -6.78));
  p.add('plastic', rod([-0.15, 1.06, -6.78], [-0.15, 1.24, -6.78], 0.008, 6));
  p.add('stripYellow', box(0.4, 0.05, 0.006), M(-0.2, FY + 0.03, -6.297));
  p.add('signs', decal(0.05, 0.05, 'extinguisher'), M(-0.07, 0.9, -6.299));
  // ---- fire extinguisher, bucket and cloth on the light-grey panel
  const exZ = zf + 0.56;
  p.add('redPlastic', new THREE.CylinderGeometry(0.055, 0.055, 0.4, 12), M(0.48, FY + 0.45, exZ));
  p.add('frame', new THREE.CylinderGeometry(0.058, 0.058, 0.03, 12), M(0.48, FY + 0.38, exZ));
  p.add('frame', rod([0.48, FY + 0.65, exZ], [0.48, FY + 0.7, exZ], 0.012, 6));
  p.add('redPlastic', new THREE.CylinderGeometry(0.13, 0.1, 0.2, 14), M(0.2, FY + 0.12, exZ - 0.02));
  p.add('cloth', box(0.2, 0.26, 0.015), M(0.42, FY + 0.72, exZ + 0.001));
  // ---- cab ceiling, closed header behind the destination sign, mirror, sun blind
  const ceil = quad('y', -1.255, 1.255, zf + 0.1, pzp + 0.16, HEADER_Y, false);
  const cu = ceil.attributes.uv;
  for (let i = 0; i < cu.count; i++) cu.setXY(i, cu.getX(i) * 2.0, cu.getY(i) * ((pzp + 0.16 - zf - 0.1) / 1.2));
  p.add('ceiling', ceil);
  p.add('ceiling', box(2.5, 0.3, 0.1), M(0, 2.6, zf + 0.37));
  p.add('wall', box(0.28, 0.1, 0.03), M(-0.05, 2.32, zf + 1.4));
  p.add('mirrorIn', quad('z', -0.18, 0.08, 2.275, 2.365, zf + 1.4 + 0.0155, true));
  for (const dx of [-0.1, 0.0]) p.add('plastic', rod([dx, HEADER_Y, zf + 1.4], [dx, 2.37, zf + 1.4], 0.008, 5));
  p.add('blind', box(1.35, 0.1, 0.012), M(-0.575, 2.37, zf + 0.42)); // sun blind, rolled almost up
  p.add('blind', rod([-1.25, 2.43, zf + 0.42], [0.1, 2.43, zf + 0.42], 0.02, 8));
}

/** Cab parts that are not merged: the instrument-cluster canvas and the steering wheel (rotated by BusModel.setSteer). */
export function buildCabInterior(m) {
  const zf = FRONT_Z;
  m.dashCanvas = document.createElement('canvas');
  m.dashCanvas.width = 512;
  m.dashCanvas.height = 256;
  m.dashTex = new THREE.CanvasTexture(m.dashCanvas);
  m.dashTex.colorSpace = THREE.SRGBColorSpace;
  const clMat = new THREE.MeshBasicMaterial({ map: m.dashTex, toneMapped: false });
  clMat.color.setScalar(0.9);
  const cl = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.21), clMat);
  cl.position.set(DX, 1.47, zf + 0.5185);
  cl.rotation.x = -0.5;
  const cluster = new THREE.Group();
  cluster.add(cl);
  m.front.add(cluster);
  m.cluster = cl;
  // steering wheel: D 0.50, rim 0.032, three spokes, one merged mesh; the plane is tilted 57 degrees from vertical
  const sw = new THREE.Group();
  sw.position.set(DX, CAB_Y + 0.8, zf + 0.88);
  sw.rotation.x = -1.0;
  const pieces = [new THREE.TorusGeometry(0.235, 0.016, 8, 36)];
  for (const a of [Math.PI / 2, (7 * Math.PI) / 6, (11 * Math.PI) / 6]) {
    const sp = new THREE.BoxGeometry(0.03, 0.235, 0.016);
    sp.rotateZ(a - Math.PI / 2);
    sp.translate(Math.cos(a) * 0.117, Math.sin(a) * 0.117, 0);
    pieces.push(sp);
  }
  pieces.push(new THREE.CylinderGeometry(0.055, 0.065, 0.05, 16).rotateX(Math.PI / 2));
  const flat = pieces.map((g) => { const n = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'uv'].includes(k)) n.deleteAttribute(k); return n; });
  // Blender-modelled wheel (kit_bus.glb: leather rim with grips, three spokes, padded hub), else the merged one
  sw.add(kitMesh('steeringWheel') || new THREE.Mesh(mergeGeometries(flat), m.mats.dash));
  m.steeringWheel = sw;
  m.front.add(sw);
  // eye point of the seated driver (head height above the raised platform)
  m.driverEyeLocal = new THREE.Vector3(DX, 1.98, zf + 1.42);
}
