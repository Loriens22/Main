// Drivers' cabs of the two line-84 battery buses (mixed into TrolleyModel; buildCab calls buildEbusCab):
// a wrap-around dashboard with the instrument binnacle, the side console with the door, kneeling and ramp buttons,
// the destination-sign controller with its small amber display, the parking-brake valve, the ticket tray, a
// high-backed driver's seat and the Blender-kit steering wheel. The cluster (drawDash) shows the speed, the motor
// power (traction orange, regeneration green), the battery charge, the range and the cell temperature, READY and
// the warnings; the SOR in the grey bezels of its 2016 dashboard, the Yutong as a full-colour screen. The layout is
// modelled on the usual city-bus cab (no cockpit photographs of either bus were reachable): estimates.
import * as THREE from 'three';
import { Parts, M, box } from '../trolley/geom.js';
import { kitMesh } from '../../BusKit.js';

export const EbusCabMixin = {
  buildEbusCab() {
    const D = this.D, F = this.F, G = this.G;
    const fz = F.frontZ, FY = D.floorY;
    const sor = G.livery === 'sor';
    const CAB_Y = FY + 0.2, DX = -0.66;
    const p = new Parts();
    // platform and the wrap-around dashboard: a centre section before the driver and two wings
    p.add('trim', box(0.95, 0.2, 1.0), M(DX, CAB_Y - 0.1, fz + 1.25));
    p.add('dash', box(0.95, 0.72, 0.5, 0.04), M(DX, CAB_Y + 0.38, fz + 0.55));
    p.add('dashSoft', box(0.98, 0.1, 0.62, 0.04), M(DX, CAB_Y + 0.78, fz + 0.6));
    const wingL = box(0.34, 0.6, 0.5, 0.04); wingL.rotateY(0.45);
    p.add('dash', wingL, M(DX - 0.56, CAB_Y + 0.34, fz + 0.8));
    const wingR = box(0.5, 0.62, 0.55, 0.04); wingR.rotateY(-0.35);
    p.add('dash', wingR, M(DX + 0.6, CAB_Y + 0.35, fz + 0.72));
    p.add('dash', box(1.25, 0.5, 0.42), M(0.48, CAB_Y + 0.5, fz + 0.45)); // the low dash over the door side
    // binnacle hood over the cluster
    p.add('dashSoft', box(0.48, 0.07, 0.24, 0.03), M(DX, CAB_Y + 1.02, fz + 0.72));
    // side console (left of the driver): door 1-3 buttons, kneeling, ramp, hazard; the parking-brake valve
    const cz = fz + 0.98;
    p.add('dash', box(0.2, 0.08, 0.5, 0.03), M(DX - 0.42, CAB_Y + 0.64, cz));
    const btn = [['stopBtn', -0.15], ['doorBtnG', -0.08], ['doorBtnG', -0.01], ['doorBtnG', 0.06], ['yellowEdge', 0.13], ['validatorBlue', 0.2]];
    for (const [k, dz] of btn) p.add(k, box(0.045, 0.02, 0.045, 0.008), M(DX - 0.42, CAB_Y + 0.69, cz + dz));
    p.add('steel', box(0.03, 0.09, 0.03), M(DX - 0.5, CAB_Y + 0.72, cz + 0.2));
    p.add('yellowEdge', box(0.05, 0.035, 0.05, 0.012), M(DX - 0.5, CAB_Y + 0.78, cz + 0.2)); // parking-brake knob
    // right wing: the destination-sign controller with its amber display, the radio, the ticket tray
    p.add('lampBlack', box(0.2, 0.1, 0.03, 0.008), M(DX + 0.52, CAB_Y + 0.72, fz + 0.66));
    p.add('signLcd', box(0.14, 0.04, 0.005), M(DX + 0.52, CAB_Y + 0.73, fz + 0.646));
    p.add('lampBlack', box(0.18, 0.05, 0.03, 0.008), M(DX + 0.55, CAB_Y + 0.6, fz + 0.66));
    p.add('steel', box(0.25, 0.03, 0.28), M(-0.05, CAB_Y + 0.82, fz + 1.18));
    // driver's seat: high back with a headrest, on its sprung pedestal
    p.add('dash', box(0.5, 0.13, 0.5, 0.05), M(DX, CAB_Y + 0.48, fz + 1.6));
    const back = box(0.5, 0.72, 0.13, 0.05); back.rotateX(-0.12);
    p.add('dash', back, M(DX, CAB_Y + 0.9, fz + 1.86));
    p.add('dash', box(0.3, 0.2, 0.11, 0.04), M(DX, CAB_Y + 1.38, fz + 1.93));
    p.add('steel', box(0.12, 0.38, 0.12), M(DX, CAB_Y + 0.2, fz + 1.62));
    p.add('trim', box(0.42, 0.04, 0.42), M(DX, CAB_Y + 0.02, fz + 1.62));
    // steering column
    const col = new THREE.CylinderGeometry(0.045, 0.06, 0.42, 12); col.rotateX(-1.0);
    p.add('dash', col, M(DX, CAB_Y + 0.66, fz + 0.86));
    if (!sor) p.add('cabWhite', box(0.04, 1.0, 0.7), M(-0.2, FY + 0.5, fz + 1.95)); // the E12's white cab door
    const g = p.build(this.mats, { castShadow: false });
    this.front.add(g);
    this.interiorGroups.push(g);
    // instrument cluster canvas (drawDash)
    this.dashCanvas = document.createElement('canvas');
    this.dashCanvas.width = 512;
    this.dashCanvas.height = 256;
    this.dashTex = new THREE.CanvasTexture(this.dashCanvas);
    this.dashTex.colorSpace = THREE.SRGBColorSpace;
    const cl = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.22), new THREE.MeshBasicMaterial({ map: this.dashTex, toneMapped: false }));
    cl.position.set(DX, CAB_Y + 0.92, fz + 0.79);
    cl.rotation.x = -0.45;
    this.front.add(cl);
    this.cluster = cl;
    this.drawDash(this.dashCanvas.getContext('2d'), { w: 512, h: 256, speedKmh: 0, selector: 'N', parking: true, doorsOpen: false, engineOn: false, hour: 12 });
    this.dashTex.needsUpdate = true;
    const sw = new THREE.Group();
    sw.position.set(DX, CAB_Y + 0.78, fz + 0.97);
    sw.rotation.x = -1.0;
    sw.add(kitMesh('steeringWheel') || new THREE.Mesh(new THREE.TorusGeometry(0.235, 0.017, 8, 36), this.mats.dash));
    this.steeringWheel = sw;
    this.front.add(sw);
    this.driverEyeLocal = new THREE.Vector3(DX, CAB_Y + 1.3, fz + 1.5);
  },

  /** Instrument cluster of the battery buses (512 x 256). */
  drawDash(g, s) {
    const W = 512, H = 256, sor = this.G.livery === 'sor';
    const B = this.battery; // BatterySystem, set by BusEntity
    g.fillStyle = sor ? '#0b0c0d' : '#03060b';
    g.fillRect(0, 0, W, H);
    const A0 = Math.PI * 0.78, A1 = Math.PI * 2.22;
    const dial = (cx, cy, r, val, min, max, step, label, zones) => {
      g.fillStyle = sor ? '#151719' : '#07101a';
      g.beginPath(); g.arc(cx, cy, r * 1.08, 0, Math.PI * 2); g.fill();
      g.strokeStyle = sor ? '#8a9095' : '#1f3b52'; g.lineWidth = sor ? 4 : 3;
      g.beginPath(); g.arc(cx, cy, r * 1.08, 0, Math.PI * 2); g.stroke();
      for (const [a, b, col] of zones || []) {
        g.strokeStyle = col; g.lineWidth = 6;
        g.beginPath(); g.arc(cx, cy, r - 3, A0 + ((a - min) / (max - min)) * (A1 - A0), A0 + ((b - min) / (max - min)) * (A1 - A0)); g.stroke();
      }
      for (let v = min; v <= max + 1e-6; v += step) {
        const a = A0 + ((v - min) / (max - min)) * (A1 - A0), major = Math.round(v / step) % 2 === 0;
        g.strokeStyle = major ? '#eef2f4' : '#7c868d'; g.lineWidth = major ? 3 : 1.5;
        g.beginPath(); g.moveTo(cx + Math.cos(a) * (r - (major ? 14 : 8)), cy + Math.sin(a) * (r - (major ? 14 : 8))); g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); g.stroke();
        if (major) {
          g.fillStyle = '#dde3e6'; g.font = 'bold 14px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
          g.fillText(String(Math.round(v)), cx + Math.cos(a) * (r - 27), cy + Math.sin(a) * (r - 27));
        }
      }
      const a = A0 + Math.min(1, Math.max(0, (val - min) / (max - min))) * (A1 - A0);
      g.strokeStyle = sor ? '#f2f2f2' : '#ff7a1a'; g.lineWidth = 4; g.lineCap = 'round';
      g.beginPath(); g.moveTo(cx - Math.cos(a) * 10, cy - Math.sin(a) * 10); g.lineTo(cx + Math.cos(a) * (r - 8), cy + Math.sin(a) * (r - 8)); g.stroke();
      g.fillStyle = '#20262b'; g.beginPath(); g.arc(cx, cy, 9, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#8b959c'; g.font = '12px Arial'; g.textAlign = 'center'; g.fillText(label, cx, cy + r * 0.55);
    };
    dial(104, 136, 92, s.speedKmh || 0, 0, 100, 10, 'km/h');
    const maxKw = B ? B.spec.maxDischarge / 1000 : 200, maxReg = B ? B.spec.maxRegen / 1000 : 100;
    const kw = B ? B.power / 1000 : 0;
    dial(408, 136, 92, kw, -Math.round(maxReg / 20) * 20, Math.round(maxKw / 20) * 20, 20, 'kW', [[-maxReg, 0, '#2ecc71'], [0, maxKw, '#e67e22']]);
    // centre display
    const lx = 196, ly = 30, lw = 120, lh = 200;
    const lg = g.createLinearGradient(0, ly, 0, ly + lh);
    lg.addColorStop(0, sor ? '#1b2a22' : '#0a2236'); lg.addColorStop(1, sor ? '#0f1a14' : '#06141f');
    g.fillStyle = lg;
    g.beginPath(); if (g.roundRect) g.roundRect(lx, ly, lw, lh, 10); else g.rect(lx, ly, lw, lh); g.fill();
    g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    const soc = B ? B.soc : 0.9;
    const tc = sor ? '#b7f0c8' : '#5ee0ff';
    g.fillStyle = tc; g.font = 'bold 40px Arial';
    g.fillText(`${Math.round(soc * 100)}%`, lx + lw / 2, ly + 48);
    // battery bar
    g.strokeStyle = tc; g.lineWidth = 2; g.strokeRect(lx + 14, ly + 58, lw - 32, 16); g.fillRect(lx + lw - 18, ly + 62, 4, 8);
    g.fillStyle = soc < 0.2 ? '#e74c3c' : '#2ecc71'; g.fillRect(lx + 16, ly + 60, (lw - 36) * soc, 12);
    g.fillStyle = '#c8d6de'; g.font = '15px Arial';
    g.fillText(B ? `${Math.round(B.rangeKm)} km` : '', lx + lw / 2, ly + 96);
    g.fillText(B ? `${Math.round(B.temp)} °C  ${B.avg.toFixed(2)}` : '', lx + lw / 2, ly + 116);
    g.font = '11px Arial'; g.fillStyle = '#7f949f'; g.fillText('kWh/km', lx + lw / 2 + 28, ly + 130);
    // selector, READY, charging
    g.font = 'bold 32px Arial';
    g.fillStyle = s.selector === 'R' ? '#ff6a5a' : '#8cf0a8';
    g.fillText(s.selector === 'D' ? 'D' : s.selector || 'N', lx + 34, ly + 172);
    g.font = 'bold 14px Arial';
    g.fillStyle = s.engineOn ? '#2ecc71' : '#3a4a52';
    g.fillText('READY', lx + 84, ly + 166);
    if (B && B.charging) { g.fillStyle = '#ffd34d'; g.fillText('⚡ CHG', lx + 84, ly + 186); }
    // warning lamps
    const lampY = 236;
    const lamps = [['P', s.parking, '#e74c3c'], ['⇕', s.doorsOpen, '#f39c12'], ['🔋', B && B.soc < 0.2, '#e74c3c'], ['REG', B && B.warnings.includes('regenLimited'), '#f1c40f'], ['T', B && B.warnings.includes('hot'), '#e74c3c']];
    lamps.forEach(([t, on, col], i) => {
      g.fillStyle = on ? col : '#1c2226';
      g.font = 'bold 15px Arial'; g.textAlign = 'center';
      g.fillText(t, 150 + i * 52, lampY);
    });
    const hh = Math.floor(s.hour || 0), mm = Math.floor(((s.hour || 0) - hh) * 60);
    g.fillStyle = '#9aa7ae'; g.font = '13px Arial';
    g.fillText(`${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`, lx + lw / 2, ly + 14);
  },
};
