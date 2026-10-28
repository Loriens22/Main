// Driver's cab of the Conecto G (Mercedes O 345 era): raised platform, anthracite wrap-around dashboard with a
// binnacle holding the two VDO-style round instruments (drawn into the 512 x 256 dash canvas by drawDash),
// switch panel, ticket desk, three-spoke steering wheel, cloth driver's seat, glazed partition behind the
// driver with a clear screen along the aisle, the white route-number card in the windscreen corner.
import * as THREE from 'three';
import { kitMesh } from '../../BusKit.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { M, box, quad, texBox, rod, tube, smooth, mergeFlat, decal } from './geom.js';
import { canvas, tex } from './ConectoTextures.js';

export const DX = -0.62;
export const PART_Z = -6.45;

export const CabMixin = {
  cabParts(p) {
    const D = this.D, FY = D.floorY, fz = this.F.frontZ;
    const CAB_Y = FY + 0.25;
    this.cabY = CAB_Y;
    const low = this.lite;
    // ---- raised platform with yellow nosing
    p.add('floor', texBox(0.87, CAB_Y - FY, PART_Z - (fz + 0.25)), M(-0.755, (CAB_Y + FY) / 2, (PART_Z + fz + 0.25) / 2));
    p.add('stripYellow', box(0.045, 0.004, PART_Z - fz - 0.3), M(-0.345, CAB_Y + 0.002, (PART_Z + fz + 0.3) / 2));
    p.add('stripYellow', box(0.006, 0.045, PART_Z - fz - 0.3), M(-0.322, CAB_Y - 0.0225, (PART_Z + fz + 0.3) / 2));
    // ---- dashboard: grey body, dark grained top across the full width, raised hood in front of the driver
    // the nose curves back from |x| 0.95 (skin 0.19 m behind the face at |x| 1.17): the outer ends of the dash
    // start further back so they stay inside the body (they showed through the front corners)
    p.add('cabPanel', box(2.06, 1.0 - FY, 0.5), M(0, (1.0 + FY) / 2, fz + 0.32));
    p.add('dashTop', box(2.08, 0.12, 0.62), M(0, 1.06, fz + 0.38));
    for (const sg of [-1, 1]) {
      p.add('cabPanel', box(0.15, 1.0 - FY, 0.3), M(sg * 1.105, (1.0 + FY) / 2, fz + 0.42));
      p.add('dashTop', box(0.15, 0.12, 0.4), M(sg * 1.105, 1.06, fz + 0.49));
    }
    p.add('dash', box(1.96, 0.05, 0.22), M(0, 1.15, fz + 0.16));
    // driver binnacle (hood) with the instrument cluster
    p.add('dash', box(0.7, 0.2, 0.3), M(DX, 1.27, fz + 0.58));
    p.add('dash', box(0.74, 0.035, 0.14), M(DX, 1.385, fz + 0.69));
    // side switch panels (left of the cluster and a tilted bank on the right)
    p.add('dash', box(0.24, 0.1, 0.34), new THREE.Matrix4().makeRotationX(-0.25).setPosition(-1.06, 1.17, fz + 0.62));
    p.add('dashPanel', box(0.34, 0.07, 0.24), new THREE.Matrix4().makeRotationX(-0.25).setPosition(DX + 0.55, 1.15, fz + 0.66));
    if (!low) {
      const cols = [0xc43a30, 0x3a8f46, 0xd9a21e, 0x1f6fb5];
      for (let i = 0; i < 8; i++) {
        const b = box(0.028, 0.012, 0.028);
        p.add(i % 4 === 3 ? 'redPlastic' : 'plastic', b, M(DX + 0.43 + (i % 4) * 0.075, 1.19 + Math.floor(i / 4) * 0.01, fz + 0.62 + Math.floor(i / 4) * 0.06 + 0.02));
      }
      void cols;
      for (let i = 0; i < 4; i++) p.add('plastic', box(0.03, 0.012, 0.03), M(-1.1 + (i % 2) * 0.06, 1.23, fz + 0.58 + Math.floor(i / 2) * 0.07));
    }
    // ticket desk on the dash right of the driver (dark body with a tilted terminal)
    p.add('dash', box(0.36, 0.1, 0.3), M(-0.12, 1.23, fz + 0.5));
    p.add('frame', box(0.18, 0.1, 0.02), new THREE.Matrix4().makeRotationX(-0.5).setPosition(-0.12, 1.36, fz + 0.55));
    // steering column and pedals
    p.add('plastic', rod([DX, this.cabY + 0.8 - 0.03, fz + 0.97], [DX, 1.1, fz + 0.55], 0.04, 10));
    p.add('plastic', box(0.1, 0.02, 0.22), new THREE.Matrix4().makeRotationX(-0.9).setPosition(DX + 0.05, CAB_Y + 0.2, fz + 0.72));
    p.add('plastic', box(0.16, 0.02, 0.22), new THREE.Matrix4().makeRotationX(-0.9).setPosition(DX - 0.22, CAB_Y + 0.2, fz + 0.72));
    // ---- driver's seat: air-sprung, dark cloth, navy bolsters
    const sz = fz + 1.62;
    p.add('dash', box(0.3, 0.3, 0.3), M(DX, CAB_Y + 0.15, sz));
    p.add('seatDark', box(0.5, 0.09, 0.5, 0.03), M(DX, CAB_Y + 0.42, sz));
    p.add('moqCush', box(0.44, 0.05, 0.44, 0.02), M(DX, CAB_Y + 0.485, sz - 0.01));
    p.add('seatDark', box(0.48, 0.66, 0.1, 0.03), new THREE.Matrix4().makeRotationX(-0.13).setPosition(DX, CAB_Y + 0.86, sz + 0.27));
    p.add('moqPad', box(0.38, 0.5, 0.03, 0.02), new THREE.Matrix4().makeRotationX(-0.13).setPosition(DX, CAB_Y + 0.88, sz + 0.205));
    p.add('seatDark', box(0.26, 0.2, 0.09, 0.03), M(DX, CAB_Y + 1.3, sz + 0.33));
    for (const s of [-1, 1]) p.add('seatDark', box(0.06, 0.05, 0.36), M(DX + s * 0.28, CAB_Y + 0.66, sz - 0.04));
    // ---- partition behind the driver: lower panel, black frame, smoked glazing, pillar
    const px0 = -1.19, px1 = -0.32;
    p.add('cabPanel', box(px1 - px0, 1.12 - FY, 0.04), M((px0 + px1) / 2, (1.12 + FY) / 2, PART_Z - 0.02));
    p.add('glassSmoked', quad('z', px0, px1, 1.14, 2.45, PART_Z - 0.005, true));
    for (const y of [1.13, 2.46]) p.add('frame', box(px1 - px0 + 0.02, 0.05, 0.05), M((px0 + px1) / 2, y, PART_Z - 0.02));
    p.add('frame', box(0.035, 1.35, 0.05), M(px0 + 0.0175, 1.8, PART_Z - 0.02));
    p.add('frame', box(0.035, 1.35, 0.05), M(px1 - 0.0175, 1.8, PART_Z - 0.02));
    p.add('signs', decal(0.2, 0.28, this.decalRects.notice), M(-0.88, 1.8, PART_Z + 0.003));
    // ---- clear screen along the aisle side from the partition forward to beside the driver's head
    const sz0 = fz + 1.15;
    p.add('glass', quad('x', sz0, PART_Z - 0.05, 1.3, 2.45, px1, true));
    p.add('frame', box(0.04, 1.2, 0.04), M(px1, 1.9, sz0));
    p.add('frame', box(0.04, 0.04, PART_Z - 0.05 - sz0), M(px1, 1.3, (sz0 + PART_Z - 0.05) / 2));
    // ---- cab ceiling and the header over the windscreen
    const ceil = quad('y', -1.215, 1.215, fz + 0.1, PART_Z + 0.16, 2.46, false);
    p.add('ceiling', ceil);
    p.add('frame', box(2.4, 0.28, 0.1), M(0, 2.6, fz + 0.45));
    p.add('frame', box(1.4, 0.06, 0.012), M(-0.45, 2.42, fz + 0.28)); // sun blind, rolled up
    // ---- fire extinguisher (red) next to door 1
    p.add('redPlastic', new THREE.CylinderGeometry(0.055, 0.055, 0.4, 12), M(0.5, FY + 0.45, fz + 0.64));
    p.add('frame', new THREE.CylinderGeometry(0.058, 0.058, 0.03, 12), M(0.5, FY + 0.38, fz + 0.64));
    // ---- pale route card holder shelf at the right end of the dash
    p.add('dash', box(0.5, 0.015, 0.22), M(0.93, 1.21, fz + 0.3));
  },

  /** Non-merged cab parts: instrument canvas, steering wheel, route-number card, eye point. */
  buildCab() {
    const fz = this.F.frontZ;
    const CAB_Y = this.cabY;
    this.dashCanvas = document.createElement('canvas');
    this.dashCanvas.width = 512;
    this.dashCanvas.height = 256;
    this.dashTex = new THREE.CanvasTexture(this.dashCanvas);
    this.dashTex.colorSpace = THREE.SRGBColorSpace;
    this.dashTex.anisotropy = 4;
    const clMat = new THREE.MeshBasicMaterial({ map: this.dashTex, toneMapped: false });
    clMat.color.setScalar(0.92);
    const cl = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.23), clMat);
    cl.position.set(DX, 1.27, fz + 0.745);
    cl.rotation.x = -0.45;
    this.front.add(cl);
    this.cluster = cl;
    // initial paint so the cluster is never blank
    this.drawDash(this.dashCanvas.getContext('2d'), { w: 512, h: 256, speedKmh: 0, rpm: 0, maxRpm: 2200, selector: 'N', gear: 0, parking: true, stopBrake: false, doorsOpen: false, head: false, indL: false, indR: false, engineOn: false, pressure: 9, retarder: false, kneel: 0, time: 0, hour: 12 });
    this.dashTex.needsUpdate = true;
    // steering wheel: 0.5 m rim, three spokes, dark grey, tilted about 57 degrees from vertical
    const sw = new THREE.Group();
    sw.position.set(DX, CAB_Y + 0.78, fz + 0.97);
    sw.rotation.x = -1.0;
    const pieces = [new THREE.TorusGeometry(0.235, 0.017, 8, 36)];
    for (const a of [Math.PI / 2, (7 * Math.PI) / 6, (11 * Math.PI) / 6]) {
      const sp = new THREE.BoxGeometry(0.032, 0.235, 0.016);
      sp.rotateZ(a - Math.PI / 2);
      sp.translate(Math.cos(a) * 0.117, Math.sin(a) * 0.117, 0);
      pieces.push(sp);
    }
    pieces.push(new THREE.CylinderGeometry(0.06, 0.07, 0.055, 16).rotateX(Math.PI / 2));
    sw.add(kitMesh('steeringWheel') || new THREE.Mesh(mergeGeometries(mergeFlat(pieces), false), this.mats.dash));
    this.steeringWheel = sw;
    this.front.add(sw);
    // route-number card in the lower bus-right corner of the windscreen (white card, black digits)
    const [rc, rg] = canvas(160, 100);
    this.routeCanvas = rc;
    this.routeCtx = rg;
    this.routeTex = tex(rc, { aniso: 4 });
    this.drawRouteCard('');
    const card = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.215), new THREE.MeshStandardMaterial({ map: this.routeTex, roughness: 0.7 }));
    card.position.set(0.9, 1.43, fz + 0.2);
    card.rotation.set(0.08, Math.PI, 0);
    this.front.add(card);
    this.routeCard = card;
    // eye point of the seated driver
    this.driverEyeLocal = new THREE.Vector3(DX, CAB_Y + 1.29, fz + 1.5);
  },

  drawRouteCard(number) {
    const g = this.routeCtx;
    g.fillStyle = '#f4f2e6';
    g.fillRect(0, 0, 160, 100);
    g.strokeStyle = '#2a2a2a';
    g.lineWidth = 3;
    g.strokeRect(2, 2, 156, 96);
    g.fillStyle = '#111';
    g.font = 'bold 82px "Arial Narrow", Arial';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(String(number || ''), 80, 54, 140);
    this.routeTex.needsUpdate = true;
  },

  /** VDO-style instrument cluster: tachometer (left), speedometer (right), telltales, gear display, air pressure. */
  drawDash(g, s) {
    const W = s.w || 512, H = s.h || 256;
    const t = s.time || 0;
    g.clearRect(0, 0, W, H);
    g.fillStyle = '#07080a';
    g.fillRect(0, 0, W, H);
    // bezel shade
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#15171a'); bg.addColorStop(1, '#0b0c0e');
    g.fillStyle = bg;
    g.fillRect(6, 6, W - 12, H - 12);
    const dial = (cx, cy, R, val, max, major, minor, label, fmt, redFrom) => {
      const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
      const fg = g.createRadialGradient(cx, cy - R * 0.2, R * 0.1, cx, cy, R);
      fg.addColorStop(0, '#1b1e22'); fg.addColorStop(1, '#0a0b0d');
      g.fillStyle = fg;
      g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#4a4e53'; g.lineWidth = 3;
      g.beginPath(); g.arc(cx, cy, R - 1, 0, Math.PI * 2); g.stroke();
      if (redFrom != null) {
        g.strokeStyle = '#c4281c'; g.lineWidth = 6;
        g.beginPath(); g.arc(cx, cy, R - 12, a0 + (redFrom / max) * (a1 - a0), a1); g.stroke();
      }
      g.strokeStyle = '#e8eaec';
      g.fillStyle = '#e8eaec';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      for (let v = 0; v <= max + 1e-6; v += minor) {
        const a = a0 + (v / max) * (a1 - a0);
        const isMajor = Math.abs(v / major - Math.round(v / major)) < 1e-6;
        g.lineWidth = isMajor ? 3 : 1.5;
        g.beginPath();
        g.moveTo(cx + Math.cos(a) * (R - 8), cy + Math.sin(a) * (R - 8));
        g.lineTo(cx + Math.cos(a) * (R - (isMajor ? 22 : 15)), cy + Math.sin(a) * (R - (isMajor ? 22 : 15)));
        g.stroke();
        if (isMajor) {
          g.font = `bold ${Math.round(R * 0.17)}px Arial`;
          g.fillText(fmt(v), cx + Math.cos(a) * (R - 38), cy + Math.sin(a) * (R - 38));
        }
      }
      g.fillStyle = '#9aa0a5';
      g.font = `${Math.round(R * 0.13)}px Arial`;
      g.fillText(label, cx, cy + R * 0.42);
      // needle
      const v = Math.max(0, Math.min(max, val));
      const a = a0 + (v / max) * (a1 - a0);
      g.save();
      g.translate(cx, cy);
      g.rotate(a);
      g.fillStyle = 'rgba(0,0,0,0.45)';
      g.beginPath(); g.moveTo(-14, 3); g.lineTo(R - 14, 1); g.lineTo(R - 14, 5); g.closePath(); g.fill();
      g.fillStyle = '#f2f3f4';
      g.beginPath(); g.moveTo(-16, -3); g.lineTo(R - 16, -1); g.lineTo(R - 16, 1); g.lineTo(-16, 3); g.closePath(); g.fill();
      g.fillStyle = '#d6361c';
      g.beginPath(); g.moveTo(R - 40, -1.6); g.lineTo(R - 16, -1); g.lineTo(R - 16, 1); g.lineTo(R - 40, 1.6); g.closePath(); g.fill();
      g.restore();
      g.fillStyle = '#2b2d30';
      g.beginPath(); g.arc(cx, cy, 11, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#6e7378'; g.lineWidth = 2; g.stroke();
    };
    dial(132, 150, 112, (s.rpm || 0) / 1000, 3, 0.5, 0.25, 'x1000 /min', (v) => (v % 1 === 0 ? String(v) : ''), 2.4);
    dial(380, 150, 112, s.speedKmh || 0, 100, 20, 10, 'km/h', (v) => String(v));
    // centre: gear selector box and air pressure bar gauge
    g.fillStyle = '#050607';
    g.fillRect(222, 70, 68, 52);
    g.strokeStyle = '#3a3d41'; g.lineWidth = 2; g.strokeRect(222, 70, 68, 52);
    g.fillStyle = s.engineOn === false ? '#3a3d41' : '#ffb03a';
    g.font = 'bold 40px "Arial Narrow", Arial';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(String(s.selector || 'N') + (s.gear > 0 && s.selector === 'D' ? s.gear : ''), 256, 97);
    const pr = Math.max(0, Math.min(10, s.pressure == null ? 9 : s.pressure));
    g.fillStyle = '#9aa0a5'; g.font = '12px Arial';
    g.fillText('bar', 256, 214);
    for (let i = 0; i < 10; i++) {
      g.fillStyle = i < pr ? (i < 6 ? '#e04a1e' : '#6fd04a') : '#1d1f22';
      g.fillRect(228 + i * 6.2, 190, 5, 16);
    }
    // time
    if (s.hour != null) {
      const hh = Math.floor(s.hour) % 24, mm = Math.floor((s.hour % 1) * 60);
      g.fillStyle = '#e0e3e5'; g.font = '16px "Courier New", monospace';
      g.fillText(`${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`, 256, 240);
    }
    // telltales across the top
    const blink = Math.floor(t * 2) % 2 === 0;
    const arrow = (x, dir, on) => {
      g.fillStyle = on ? '#35e04a' : '#16301a';
      g.beginPath();
      g.moveTo(x + dir * 14, 24); g.lineTo(x - dir * 2, 10); g.lineTo(x - dir * 2, 18); g.lineTo(x - dir * 14, 18); g.lineTo(x - dir * 14, 30); g.lineTo(x - dir * 2, 30); g.lineTo(x - dir * 2, 38);
      g.closePath(); g.fill();
    };
    arrow(150, -1, s.indL);
    arrow(362, 1, s.indR);
    const lamp = (x, label, on, col) => {
      g.fillStyle = on ? col : '#1a1c1f';
      g.beginPath(); g.arc(x, 24, 11, 0, Math.PI * 2); g.fill();
      g.fillStyle = on ? '#0b0b0b' : '#3b3e42';
      g.font = 'bold 12px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(label, x, 24.5);
    };
    lamp(196, 'P', !!s.parking, '#e0301c');
    lamp(222, 'D', !!s.doorsOpen, '#e0301c');
    lamp(250, 'S', !!s.stopBrake, '#f0a020');
    lamp(278, '≡', !!s.head, '#3a82e0');
    lamp(304, 'R', !!s.retarder, '#f0a020');
    lamp(330, '!', s.engineOn === false && blink, '#e0301c');
  },
};
void rod; void tube; void smooth;
