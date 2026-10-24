// Driver's cab of the Yutong ZK6126HGA (construction as the BMC Procity's cab, ../procity/ProcityCab.js; the Yutong
// cockpit is a wraparound dark console): raised platform, wide dashboard with a light-grey top and a dark binnacle,
// LCD instrument cluster (drawDash), three-spoke steering wheel, high-back driver's seat, glazed partition behind
// the driver with notices, clear aisle-side screen, ticket terminal on a stalk, lowered header with the interior
// next-stop display and convex mirror, sun blind. No cab photo of the Sofia Yutong was available: the layout follows
// ref06 / ref08 / ref10 (what is visible through the windscreen and over the partition) and bus typology.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { M, box } from '../../BusGeom.js';
import { quad, rod } from '../../BusInteriorGeom.js';
import spec from './spec.js';
import { FY, cabPartitionZ } from './layout.js';
import { frontPatch as facePatch, colsBetween } from './surfaces.js';
import { decal } from './YutongPoles.js';
import { K } from './consts.js';

const FRONT_Z = K.frontZ;

const D = spec.dims;
export const CAB_Y = FY + 0.2; // driver's platform
const DX = -0.74; // driver's x
const HEADER_Y = 2.48;

/** Static cab geometry, merged into the interior parts (one draw call per material). */
export function addCabParts(p, low, model) {
  const zf = FRONT_Z, zp = cabPartitionZ(D);
  // ---- raised platform with yellow nosing
  const pz0 = zf + 0.3;
  p.add('floor', box(0.79, CAB_Y - FY, zp - pz0), M(-0.795, (CAB_Y + FY) / 2, (pz0 + zp) / 2));
  p.add('stripYellow', box(0.045, 0.004, zp - pz0 - 0.05), M(-0.4225, CAB_Y + 0.002, (pz0 + zp) / 2));
  p.add('stripYellow', box(0.006, 0.045, zp - pz0 - 0.05), M(-0.4, CAB_Y - 0.0225, (pz0 + zp) / 2));
  // ---- dashboard: body, light-grey top across the screen width, dark binnacle and side panels
  p.add('dash', box(2.34, 1.16 - FY, 0.52), M(0, (1.16 + FY) / 2, zf + 0.32));
  p.add('dashTop', box(2.34, 0.06, 0.54), M(0, 1.19, zf + 0.33));
  p.add('dashPad', box(0.7, 0.2, 0.3), M(DX, 1.27, zf + 0.38)); // binnacle: the cluster sits on its driver-side face
  p.add('dashPad', box(0.76, 0.03, 0.16), M(DX, 1.4, zf + 0.53)); // hood shading the cluster
  p.add('dashPad', box(0.3, 0.12, 0.4), M(-1.08, 1.27, zf + 0.5)); // left switch pod
  p.add('dashPad', box(0.34, 0.14, 0.34), M(-0.34, 1.27, zf + 0.5)); // right switch pod with the selector buttons
  if (!low) {
    // push-button gear selector and switch rows
    for (let i = 0; i < 5; i++) p.add(i === 0 ? 'redPlastic' : 'plastic', box(0.035, 0.012, 0.035), M(-0.46 + i * 0.045, 1.343, zf + 0.5));
    for (let i = 0; i < 6; i++) p.add('plastic', box(0.03, 0.012, 0.03), M(-1.18 + (i % 3) * 0.05, 1.33, zf + 0.42 + Math.floor(i / 3) * 0.06));
    // central vent grilles and a radio slot
    p.add('plastic', box(0.5, 0.05, 0.02), M(0.35, 1.0, zf + 0.58));
    p.add('plastic', box(0.5, 0.05, 0.02), M(0.35, 0.9, zf + 0.58));
  }
  // steering column
  p.add('plastic', rod([DX, CAB_Y + 0.62, zf + 0.9], [DX, 1.26, zf + 0.5], 0.04, 10));
  // pedals
  p.add('plastic', box(0.09, 0.02, 0.2), new THREE.Matrix4().makeRotationX(-0.9).setPosition(-0.62, CAB_Y + 0.2, zf + 0.75));
  p.add('plastic', box(0.15, 0.02, 0.2), new THREE.Matrix4().makeRotationX(-0.9).setPosition(-0.88, CAB_Y + 0.2, zf + 0.75));
  // ---- driver's seat: air-suspension base, cushion, high back with headrest
  const sz = zf + 1.5;
  p.add('dash', box(0.3, 0.38, 0.3), M(DX, CAB_Y + 0.19, sz));
  p.add('pad', box(0.5, 0.1, 0.5, 0.03), M(DX, CAB_Y + 0.43, sz));
  p.add('pad', box(0.48, 0.74, 0.12, 0.04), new THREE.Matrix4().makeRotationX(-0.14).setPosition(DX, CAB_Y + 0.86, sz + 0.28));
  p.add('pad', box(0.26, 0.2, 0.1, 0.04), M(DX, CAB_Y + 1.36, sz + 0.34));
  for (const s of [-1, 1]) {
    p.add('seat', box(0.07, 0.34, 0.14), new THREE.Matrix4().makeRotationX(-0.14).setPosition(DX + s * 0.22, CAB_Y + 0.8, sz + 0.24));
    p.add('seat', box(0.07, 0.06, 0.4), M(DX + s * 0.27, CAB_Y + 0.52, sz));
  }
  // ---- partition behind the driver: lower panel, black frame, smoked glazing, notices
  const px0 = -1.17, px1 = -0.45;
  p.add('cabPanel', box(px1 - px0, 1.15 - FY, 0.04), M((px0 + px1) / 2, (1.15 + FY) / 2, zp - 0.02));
  p.add('glassSmoked', quad('z', px0, px1, 1.2, 2.5, zp - 0.005, true));
  for (const y of [1.18, 2.52]) p.add('frame', box(px1 - px0 + 0.02, 0.05, 0.05), M((px0 + px1) / 2, y, zp - 0.02));
  p.add('frame', box(0.04, 1.34, 0.05), M(px0 + 0.02, 1.85, zp - 0.02));
  p.add('pillar', box(0.1, 2.52 - FY, 0.12), M(-0.4, (2.52 + FY) / 2, zp - 0.04));
  const note = (name, w, h, x, y) => p.add('signs', decal(w, h, name), M(x, y, zp + 0.001));
  note('notice', 0.24, 0.34, -0.85, 1.9);
  note('yellow', 0.1, 0.14, -0.62, 1.55);
  note('tariff', 0.15, 0.1, -1.05, 1.5);
  // ---- clear driver screen on the aisle side, from the partition to beside the driver's head
  const sz0 = zf + 1.0;
  p.add('glassScreen', quad('x', sz0, zp - 0.1, 1.35, 2.45, -0.4, true));
  p.add('frame', box(0.04, 1.1, 0.04), M(-0.4, 1.9, sz0));
  p.add('frame', box(0.04, 0.04, zp - 0.1 - sz0), M(-0.4, 1.35, (sz0 + zp - 0.1) / 2));
  p.add('frame', box(0.04, 0.04, zp - 0.1 - sz0), M(-0.4, 2.45, (sz0 + zp - 0.1) / 2));
  // ---- ticket terminal on a stalk and a blue cash drawer
  p.add('validator', box(0.2, 0.15, 0.1, 0.012), new THREE.Matrix4().makeRotationX(-0.35).setPosition(-0.2, 1.52, zf + 1.1));
  p.add('validatorBlue', box(0.2, 0.012, 0.09), new THREE.Matrix4().makeRotationX(-0.35).setPosition(-0.2, 1.445, zf + 1.115));
  p.add('plastic', rod([-0.2, 1.22, zf + 1.1], [-0.2, 1.46, zf + 1.1], 0.012, 6));
  p.add('cabPanel', box(0.34, 0.9 - FY, 0.5), M(-0.22, (0.9 + FY) / 2, zf + 1.35));
  p.add('dashPad', box(0.36, 0.05, 0.52), M(-0.22, 0.925, zf + 1.35));
  // ---- cab ceiling, lowered header with the next-stop display and convex mirror, pillar casings
  const ceil = quad('y', -1.25, 1.25, zf + 0.1, zp + 0.2, 2.52, false);
  const cu = ceil.attributes.uv;
  for (let i = 0; i < cu.count; i++) cu.setXY(i, cu.getX(i) * 2.0, cu.getY(i) * ((zp + 0.2 - zf - 0.1) / 1.2));
  p.add('ceiling', ceil);
  p.add('ceiling', box(2.46, 2.66 - HEADER_Y, 0.06), M(0, (2.66 + HEADER_Y) / 2, zp + 0.17));
  const hz = zp + 0.2;
  p.add('wallLight', box(0.95, 0.17, 0.1), new THREE.Matrix4().makeRotationX(0.09).setPosition(0, 2.54, hz));
  p.add('frame', box(0.24, 0.1, 0.07, 0.015), M(0, 2.33, hz - 0.02));
  p.add('mirrorIn', quad('z', -0.1, 0.1, 2.295, 2.37, hz - 0.0545, true));
  p.add('plastic', rod([0, 2.48, hz - 0.02], [0, 2.38, hz - 0.02], 0.008, 5));
  if (!low) {
    // interior dome camera over the partition and a first-aid / extinguisher on the dash side
    p.add('frame', new THREE.SphereGeometry(0.04, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.Matrix4().makeRotationX(Math.PI).setPosition(-0.9, HEADER_Y + 0.01, hz - 0.06));
    p.add('redPlastic', new THREE.CylinderGeometry(0.05, 0.05, 0.36, 12), M(0.52, FY + 0.38, zf + 0.62));
    p.add('frame', rod([0.52, FY + 0.56, zf + 0.62], [0.52, FY + 0.62, zf + 0.62], 0.012, 6));
  }
  void model;
}

export const CabMixin = {
  buildCab() {
    const zf = FRONT_Z;
    this.dashCanvas = document.createElement('canvas');
    this.dashCanvas.width = 512;
    this.dashCanvas.height = 256;
    this.dashTex = new THREE.CanvasTexture(this.dashCanvas);
    this.dashTex.colorSpace = THREE.SRGBColorSpace;
    this.drawDash(this.dashCanvas.getContext('2d'), { w: 512, h: 256, speedKmh: 0, rpm: 0, maxRpm: 2200, selector: 'N', gear: 0, parking: true, stopBrake: false, doorsOpen: false, head: false, indL: false, indR: false, engineOn: false, pressure: 9, retarder: false, kneel: 0, time: 0, hour: 12 });
    const clMat = new THREE.MeshBasicMaterial({ map: this.dashTex, toneMapped: false });
    clMat.color.setScalar(0.92);
    const cl = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.17), clMat);
    cl.position.set(DX, 1.29, zf + 0.545);
    cl.rotation.x = -0.38;
    this.front.add(cl);
    this.cluster = cl;
    // steering wheel: D 0.50, three spokes with a BMC hub, one merged mesh; plane tilted about 57 degrees from vertical
    const sw = new THREE.Group();
    sw.position.set(DX, CAB_Y + 0.86, zf + 0.9);
    sw.rotation.x = -1.0;
    const pieces = [new THREE.TorusGeometry(0.235, 0.017, 8, 40)];
    for (const a of [Math.PI / 2 + Math.PI / 2, -Math.PI / 6, Math.PI + Math.PI / 6]) {
      const sp = new THREE.BoxGeometry(0.034, 0.22, 0.014);
      sp.rotateZ(a - Math.PI / 2);
      sp.translate(Math.cos(a) * 0.115, Math.sin(a) * 0.115, 0);
      pieces.push(sp);
    }
    pieces.push(new THREE.CylinderGeometry(0.06, 0.07, 0.05, 18).rotateX(Math.PI / 2));
    const flat = pieces.map((g) => { const n = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'uv'].includes(k)) n.deleteAttribute(k); return n; });
    sw.add(new THREE.Mesh(mergeGeometries(flat), this.mats.dashPad));
    // silver hub badge
    const badge = new THREE.Mesh(new THREE.CircleGeometry(0.035, 16), this.mats.satinChrome);
    badge.position.z = 0.0265;
    sw.add(badge);
    this.steeringWheel = sw;
    this.front.add(sw);
    // eye point of the seated driver
    this.driverEyeLocal = new THREE.Vector3(DX, CAB_Y + 1.24, zf + 1.45);
    // sun blind: translucent grey roller blind half-way down the upper windscreen (as in all photos)
    const blind = new THREE.Mesh(facePatch({ xs: colsBetween(0.98, -0.98, 12), y0: 2.14, y1: 2.42, nv: 1, off: -0.07 }), this.mats.blind);
    blind.castShadow = false;
    this.front.add(blind);
  },

  buildCabMinimal() {
    this.dashCanvas = document.createElement('canvas');
    this.dashCanvas.width = 512;
    this.dashCanvas.height = 256;
    this.dashTex = new THREE.CanvasTexture(this.dashCanvas);
    this.steeringWheel = new THREE.Group();
    this.driverEyeLocal = new THREE.Vector3(DX, CAB_Y + 1.24, FRONT_Z + 1.45);
  },

  /**
   * LCD instrument cluster (512 x 256): tachometer left, speedometer right, colour LCD in the middle with the gear,
   * big speed, clock and door/kneel symbols; telltale rows above and below. state: see models/README.md.
   */
  drawDash(g, s) {
    const W = 512, H = 256;
    g.fillStyle = '#04060a';
    g.fillRect(0, 0, W, H);
    const arc = (cx, cy, r, a0, a1, w, col) => { g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.arc(cx, cy, r, a0, a1); g.stroke(); };
    const A0 = Math.PI * 0.78, A1 = Math.PI * 2.22;
    const gauge = (cx, cy, r, val, max, majors, minorStep, label, red) => {
      const radial = g.createRadialGradient(cx, cy, r * 0.2, cx, cy, r * 1.05);
      radial.addColorStop(0, '#0b1018');
      radial.addColorStop(1, '#05080c');
      g.fillStyle = radial;
      g.beginPath(); g.arc(cx, cy, r * 1.08, 0, Math.PI * 2); g.fill();
      arc(cx, cy, r, A0, A1, 4, '#2a323a');
      if (red) arc(cx, cy, r, A0 + (red / max) * (A1 - A0), A1, 5, '#c0302a');
      for (let v = 0; v <= max + 1e-6; v += minorStep) {
        const a = A0 + (v / max) * (A1 - A0);
        const major = Math.abs((v / majors) - Math.round(v / majors)) < 1e-6;
        g.strokeStyle = major ? '#e8eef2' : '#6a747c';
        g.lineWidth = major ? 3 : 1.5;
        g.beginPath(); g.moveTo(cx + Math.cos(a) * (r - (major ? 16 : 9)), cy + Math.sin(a) * (r - (major ? 16 : 9))); g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); g.stroke();
        if (major) {
          g.fillStyle = '#dfe6ea';
          g.font = 'bold 15px Arial';
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          const lab = label === 'rpm' ? String(v / 1000) : String(v);
          g.fillText(lab, cx + Math.cos(a) * (r - 29), cy + Math.sin(a) * (r - 29));
        }
      }
      // needle
      const a = A0 + Math.min(1, Math.max(0, val / max)) * (A1 - A0);
      g.strokeStyle = '#ff6a1f';
      g.lineWidth = 4;
      g.lineCap = 'round';
      g.beginPath(); g.moveTo(cx - Math.cos(a) * 12, cy - Math.sin(a) * 12); g.lineTo(cx + Math.cos(a) * (r - 8), cy + Math.sin(a) * (r - 8)); g.stroke();
      g.fillStyle = '#10151a';
      g.beginPath(); g.arc(cx, cy, 10, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#3a444c'; g.lineWidth = 2; g.stroke();
      g.fillStyle = '#7d8890';
      g.font = '12px Arial';
      g.textAlign = 'center';
      g.fillText(label === 'rpm' ? 'x1000 min⁻¹' : 'km/h', cx, cy + r * 0.52);
    };
    gauge(112, 138, 96, s.rpm, 3000, 500, 250, 'rpm', 2200);
    gauge(400, 138, 96, s.speedKmh, 100, 10, 5, 'kmh', 0);
    // centre LCD
    const lx = 196, ly = 36, lw = 120, lh = 190;
    const lg = g.createLinearGradient(0, ly, 0, ly + lh);
    lg.addColorStop(0, '#0a2236');
    lg.addColorStop(1, '#06141f');
    g.fillStyle = lg;
    g.beginPath(); if (g.roundRect) g.roundRect(lx, ly, lw, lh, 10); else g.rect(lx, ly, lw, lh); g.fill();
    g.strokeStyle = '#1f3a50'; g.lineWidth = 2; g.stroke();
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    g.fillStyle = '#5ee0ff';
    g.font = 'bold 56px "Arial Narrow", Arial';
    g.fillText(String(Math.round(s.speedKmh)), lx + lw / 2, ly + 78);
    g.font = '13px Arial';
    g.fillStyle = '#6fb8d0';
    g.fillText('km/h', lx + lw / 2, ly + 96);
    const sel = s.selector === 'D' ? `D${s.gear || ''}` : s.selector;
    g.fillStyle = s.selector === 'R' ? '#ff6a5a' : '#8cf0a8';
    g.font = 'bold 38px Arial';
    g.fillText(sel, lx + lw / 2, ly + 140);
    // clock and pressure
    const hh = Math.floor(s.hour || 0), mm = Math.floor(((s.hour || 0) - hh) * 60);
    g.fillStyle = '#cfe9f2';
    g.font = 'bold 20px Arial';
    g.fillText(`${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`, lx + lw / 2, ly + 170);
    g.font = '11px Arial';
    g.fillStyle = '#6fb8d0';
    g.fillText(`${(s.pressure || 9).toFixed(1)} bar`, lx + lw / 2, ly + 184);
    // gas level bar (CNG) under the gauges
    g.fillStyle = '#10171d';
    g.fillRect(30, 232, 100, 8);
    g.fillStyle = '#4ec06a';
    g.fillRect(30, 232, 78, 8);
    g.fillStyle = '#7d8890';
    g.font = '11px Arial';
    g.textAlign = 'left';
    g.fillText('CNG', 30, 226);
    g.textAlign = 'right';
    g.fillText('ODO 128 406 km', 482, 244);
    // telltales along the top
    const tell = (x, on, col, glyph) => {
      g.fillStyle = on ? col : '#12181d';
      g.font = 'bold 22px Arial';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(glyph, x, 16);
    };
    tell(40, s.indL, '#35d46a', '◀');
    tell(86, s.head, '#2d8cff', '◐');
    tell(150, s.parking, '#ff3b30', 'P');
    tell(206, s.stopBrake, '#ffb020', 'H');
    tell(256, s.doorsOpen, '#ff5a3c', '⇔');
    tell(306, s.kneel > 0.02, '#ffb020', '⇩');
    tell(362, s.retarder, '#ffb020', 'R');
    tell(426, !s.engineOn, '#ff3b30', '⚠');
    tell(472, s.indR, '#35d46a', '▶');
    g.textBaseline = 'alphabetic';
  },
};
