// ---------------------------------------------------------------------------
// World landmarks, built procedurally at a playable scale (size words or
// "life size" scale them up): Eiffel Tower (tapered lattice), Big Ben (live
// clock faces), Colosseum (three arcaded tiers, partly ruined), Statue of
// Liberty (SDF-sculpted, torch glows at night), Taj Mahal (onion dome,
// minarets, reflecting pool), Leaning Tower of Pisa, a stretch of the Great
// Wall with watchtowers, Arc de Triomphe, Sydney Opera House shells, the
// Golden Gate Bridge and the Great Sphinx (SDF).
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { G } from '../../core/context.js';
import { Kit, solidBounds } from './gadgetkit.js';
import { sdfPart } from './gadgets_fun.js';

const PI = Math.PI, TAU = PI * 2, HALF = PI / 2;
const Z = [HALF, 0, 0], X = [0, 0, HALF];
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

function clockFace(k, pos, r, rot) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 256;
  const g = cv.getContext('2d');
  const draw = () => {
    g.fillStyle = '#f4ecd0'; g.beginPath(); g.arc(128, 128, 124, 0, TAU); g.fill();
    g.strokeStyle = '#2a2010'; g.lineWidth = 10; g.stroke();
    g.fillStyle = '#2a2010'; g.font = 'bold 30px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    ['XII', 'I', 'II', 'III', 'IIII', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'].forEach((n, i) => { const an = i / 12 * TAU; g.fillText(n, 128 + Math.sin(an) * 94, 128 - Math.cos(an) * 94); });
    const d = new Date(), hA = ((d.getHours() % 12) + d.getMinutes() / 60) / 12 * TAU, mA = d.getMinutes() / 60 * TAU;
    g.lineCap = 'round'; g.lineWidth = 10; g.beginPath(); g.moveTo(128, 128); g.lineTo(128 + Math.sin(hA) * 55, 128 - Math.cos(hA) * 55); g.stroke();
    g.lineWidth = 6; g.beginPath(); g.moveTo(128, 128); g.lineTo(128 + Math.sin(mA) * 88, 128 - Math.cos(mA) * 88); g.stroke();
  };
  draw();
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.CircleGeometry(r, 36), new THREE.MeshStandardMaterial({ map: tex, emissive: 0xfff0c0, emissiveMap: tex, emissiveIntensity: 0.35, roughness: 0.5 }));
  k.add(m, pos, rot);
  let acc = 0;
  k.tick((dt) => { acc += dt; if (acc > 20) { acc = 0; draw(); tex.needsUpdate = true; } });
  return m;
}

export const LANDMARKS = {
  eiffel(k, a, r) {
    const H = clamp(70 * (a.sizeMul || 1), 25, 330);
    const B = H * 0.24;
    const iron = k.body('painted', a.primaryColor ? undefined : '#6a5040');
    const hw = (y) => B * Math.pow(1 - y / H, 1.9) + H * 0.012;
    const levels = 26;
    const corner = (y, sx, sz, inset = 0) => [sx * (hw(y) - inset), y, sz * (hw(y) - inset)];
    const legTop = H * 0.2;
    for (let i = 0; i < levels; i++) {
      const y0 = (i / levels) * H, y1 = ((i + 1) / levels) * H;
      const thick = H * 0.004 * (1 - y0 / H * 0.7);
      for (const [sx, sz] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) {
        k.seg(iron, corner(y0, sx, sz), corner(y1, sx, sz), thick * 1.6, thick * 1.5, 6);
        if (y1 <= legTop) { const lw = B * 0.28 * (1 - y0 / legTop * 0.6); k.seg(iron, corner(y0, sx, sz, lw), corner(y1, sx, sz, B * 0.28 * (1 - y1 / legTop * 0.6)), thick, thick, 5); }
      }
      // Cross bracing on each face.
      for (const [ax, az, bx, bz] of [[1, 1, -1, 1], [-1, 1, -1, -1], [-1, -1, 1, -1], [1, -1, 1, 1]]) {
        if (y1 <= legTop) continue;
        k.seg(iron, corner(y0, ax, az), corner(y1, bx, bz), thick * 0.6, thick * 0.6, 4);
        k.seg(iron, corner(y0, bx, bz), corner(y1, ax, az), thick * 0.6, thick * 0.6, 4);
      }
    }
    // Great arches between the legs.
    for (let f = 0; f < 4; f++) {
      const rot = [0, f * HALF, 0];
      const g = k.sub([0, 0, 0], rot);
      const pts = []; for (let i = 0; i <= 16; i++) { const t = i / 16; const x = (t * 2 - 1) * (hw(legTop * 0.3) - B * 0.1); pts.push([x, legTop * 0.55 + Math.cos((t * 2 - 1) * HALF) * legTop * 0.25, hw(legTop * 0.55)]); }
      g.tube(iron, pts, H * 0.004, 24, false, 6);
    }
    // Platforms.
    for (const [y, t] of [[legTop, 0.025], [H * 0.42, 0.02], [H * 0.88, 0.012]]) {
      const w = hw(y) * 2 + H * 0.02;
      k.box(iron, [0, y, 0], [w, H * t, w]);
      k.box('m:#8a7058', [0, y + H * t * 0.7, 0], [w * 0.98, H * t * 0.3, w * 0.98]);
    }
    k.box('m:#5a4030', [0, H * 0.9, 0], [H * 0.03, H * 0.03, H * 0.03]);
    k.seg(iron, [0, H * 0.9, 0], [0, H * 1.05, 0], H * 0.004, H * 0.002, 6);
    k.ball('led', [0, H * 1.05, 0], H * 0.004);
    for (let i = 0; i < 24; i++) { const y = legTop + (H * 0.85 - legTop) * (i / 24); for (const [sx, sz] of [[1, 1], [-1, -1]]) k.ball('warm', corner(y, sx, sz, -H * 0.004), H * 0.0035, null, 6); }
    k.light([0, H * 1.05, 0], '#ffe0a0', 3, H * 0.5, true);
    k.light([0, H * 0.45, 0], '#ffc070', 3, H * 0.6, true);
    for (const [sx, sz] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) k.collideCyl(sx * (hw(0) - B * 0.14), sz * (hw(0) - B * 0.14), 0, legTop, B * 0.14);
    const w1 = hw(legTop); k.collide([-w1, legTop - H * 0.012, -w1], [w1, legTop + H * 0.012, w1]);
    return { name: 'Eiffel Tower', height: H * 1.06 };
  },
  bigBen(k, a, r) {
    const s = clamp(a.sizeMul || 1, 0.5, 4);
    const W = 9 * s, H = 44 * s;
    const stone = k.body('stone', '#c8b890');
    k.box(stone, [0, H / 2, 0], [W, H, W]);
    for (let i = 0; i < 5; i++) for (const f of [0, 1, 2, 3]) { const rot = [0, f * HALF, 0]; const off = new THREE.Vector3(-W / 2 + (i + 0.5) * W / 5, 0, W / 2 + 0.15 * s).applyEuler(new THREE.Euler(0, f * HALF, 0)); k.box('m:#b0a078', [off.x, H * 0.45, off.z], [0.35 * s, H * 0.85, 0.3 * s], rot); }
    for (let i = 0; i < 8; i++) k.box('m:#a89868', [0, 4 * s + i * 4.4 * s, 0], [W + 0.4 * s, 0.35 * s, W + 0.4 * s]);
    // Clock stage.
    const cy = H + 4.5 * s;
    k.box(stone, [0, cy, 0], [W + 1.4 * s, 9 * s, W + 1.4 * s]);
    for (let f = 0; f < 4; f++) {
      const n = new THREE.Vector3(0, 0, (W + 1.4 * s) / 2 + 0.05).applyEuler(new THREE.Euler(0, f * HALF, 0));
      clockFace(k, [n.x, cy, n.z], 3.2 * s, [0, f * HALF, 0]);
      const n2 = n.clone().multiplyScalar(1.01);
      k.torus('gold', [n2.x, cy, n2.z], 3.3 * s, 0.18 * s, [0, f * HALF, 0], TAU, 40);
    }
    // Belfry and spire.
    k.box(stone, [0, cy + 7 * s, 0], [W, 5 * s, W]);
    for (let f = 0; f < 4; f++) for (let i = 0; i < 3; i++) { const o = new THREE.Vector3(-W / 3 + i * W / 3, 0, W / 2 + 0.02).applyEuler(new THREE.Euler(0, f * HALF, 0)); k.box('dark', [o.x, cy + 7 * s, o.z], [1.2 * s, 3.2 * s, 0.1], [0, f * HALF, 0]); }
    k.lathe('m:#2a4a5a', [0, cy + 9.5 * s, 0], [[W * 0.72, 0], [W * 0.5, 4 * s], [W * 0.18, 12 * s], [0.2 * s, 18 * s], [0, 19 * s]], 4, [0, PI / 4, 0]);
    k.seg('gold', [0, cy + 28 * s, 0], [0, cy + 31 * s, 0], 0.2 * s, 0.05 * s, 6);
    for (const [x, z] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) k.cone('m:#2a4a5a', [x * W * 0.5, cy + 12 * s, z * W * 0.5], 0.7 * s, 5 * s, null, 6);
    k.light([0, cy, W], '#fff0c0', 2, 30 * s, true);
    k.collide([-W / 2, 0, -W / 2], [W / 2, H, W / 2]);
    return { name: 'Big Ben', height: cy + 31 * s, interact: { label: () => 'Bong!', action: (e) => { for (let i = 0; i < 4; i++) setTimeout(() => G.audio && G.audio.play('bell', e.root.position, { freq: 110, max: 400, ref: 30 }), i * 1800); } } };
  },
  colosseum(k, a, r) {
    const s = clamp(a.sizeMul || 1, 0.5, 3);
    const A = 30 * s, Bb = 24 * s, TH = 8 * s, N = 56;
    const stone = k.body('stone', '#d8c8a8');
    const ruin = (i, tier) => tier >= 2 && i > N * 0.55 && i < N * 0.85 && !(tier === 2 && i % 7 === 0);
    for (let tier = 0; tier < 4; tier++) {
      const y0 = tier * TH;
      for (let i = 0; i < N; i++) {
        if (ruin(i, tier + (tier === 3 ? 0 : 0))) continue;
        const an = i / N * TAU, an2 = (i + 1) / N * TAU;
        const p = (aa, off = 0) => [Math.cos(aa) * (A + off), 0, Math.sin(aa) * (Bb + off)];
        const [x, , z] = p(an), [x2, , z2] = p(an2);
        const yaw = Math.atan2(x2 - x, z2 - z);
        const seglen = Math.hypot(x2 - x, z2 - z);
        if (tier < 3) {
          k.box(stone, [x, y0 + TH / 2, z], [1.2 * s, TH, 2.2 * s], [0, yaw, 0]);
          k.box(stone, [(x + x2) / 2, y0 + TH - 0.8 * s, (z + z2) / 2], [1.8 * s, 1.6 * s, seglen], [0, yaw, 0]);
          const mx = (x + x2) / 2, mz = (z + z2) / 2;
          k.box('dark', [mx - Math.cos((an + an2) / 2) * 0.6 * s, y0 + TH * 0.42, mz - Math.sin((an + an2) / 2) * 0.6 * s], [0.4 * s, TH * 0.75, seglen - 1.2 * s], [0, yaw, 0]);
        } else {
          k.box(stone, [(x + x2) / 2, y0 + TH * 0.4, (z + z2) / 2], [1.2 * s, TH * 0.8, seglen + 0.1], [0, yaw, 0]);
          if (i % 2 === 0) k.box('dark', [(x + x2) / 2, y0 + TH * 0.4, (z + z2) / 2], [1.25 * s, 1.2 * s, 0.9 * s], [0, yaw, 0]);
        }
        if (tier === 0) k.collide([x - 0.8 * s, 0, z - 0.8 * s], [x + 0.8 * s, TH, z + 0.8 * s]);
      }
    }
    // Seating slopes and arena.
    for (let t = 0; t < 10; t++) {
      const ra = A * 0.95 - t * 1.4 * s, rb = Bb * 0.95 - t * 1.4 * s, y = TH * 2.6 - t * TH * 0.24;
      k.lathe(stone, [0, y - TH * 0.24, 0], [[ra - 1.4 * s, TH * 0.24], [ra, TH * 0.24], [ra, 0], [ra - 1.4 * s, 0]], 48, null, [1, 1, rb / ra]);
    }
    k.cyl('sand', [0, 0.1, 0], A * 0.5, 0.2, null, { segs: 40 });
    return { name: 'Colosseum', height: TH * 3.8, noAutoCollide: true };
  },
  *liberty(k, a, r, item, ctx) {
    const s = clamp(a.sizeMul || 1, 0.4, 5) * 12;
    const copper = a.primaryColor || '#6aaa98';
    k.m('stoneP', 'granite', { color: '#b8b0a4' });
    const star = []; for (let i = 0; i < 22; i++) { const an = i / 22 * TAU; star.push([Math.cos(an) * (i % 2 ? 1.1 : 1.6) * s, Math.sin(an) * (i % 2 ? 1.1 : 1.6) * s]); }
    k.ext('stoneP', star, 0.4 * s, [0, 0.2 * s, 0], [HALF, 0, 0]);
    k.box('stoneP', [0, 1.0 * s, 0], [1.4 * s, 1.2 * s, 1.4 * s]);
    k.box('stoneP', [0, 1.9 * s, 0], [1.1 * s, 0.6 * s, 1.1 * s]);
    const base = 2.2 * s;
    const statue = yield* sdfPart(k, ctx, (d) => {
      d.beginGroup({ op: 'union', defaults: { mat: 'cu' } });
      d.roundCone([0, 0.02, 0], [0, 0.95, 0], 0.26, 0.15);
      d.ellipsoid([0, 1.08, 0.02], [0.15, 0.18, 0.11], { op: 'smooth', k: 0.05 });
      d.sphere([0, 1.36, 0.02], 0.085, { op: 'smooth', k: 0.03 });
      d.capsule([0.13, 1.18, 0.0], [0.2, 1.72, 0.02], 0.045, { op: 'smooth', k: 0.03 });
      d.capsule([-0.12, 1.15, 0.03], [-0.16, 0.95, 0.1], 0.04, { op: 'smooth', k: 0.03 });
      d.box([-0.17, 0.98, 0.1], [0.05, 0.12, 0.03], { rot: [0, 0, 0.3], round: 0.01 });
      for (let i = 0; i < 7; i++) { const an = -1.1 + i * 0.37; d.roundCone([Math.sin(an) * 0.07, 1.43, 0.02 + Math.cos(an) * 0.03], [Math.sin(an) * 0.16, 1.48 + Math.cos(an) * 0.08, 0.02 + Math.cos(an) * 0.05], 0.018, 0.004); }
      d.cylinder([0.21, 1.78, 0.02], 0.03, 0.06, { round: 0.01 });
      d.endGroup();
    }, { cu: ['copper', { color: copper }] }, 0.012, [0, base, 0]);
    // The SDF statue is modelled ~1.85 units tall; scale it onto the pedestal.
    statue.scale.setScalar(s * 1.6);
    const flameY = base + 1.83 * statue.scale.y, flameX = 0.21 * statue.scale.x;
    k.cone('fire', [flameX, flameY + 0.05 * s, 0.02 * statue.scale.z], 0.035 * statue.scale.x, 0.1 * statue.scale.y, null, 10);
    k.glow('#ffb040', [flameX, flameY + 0.06 * s, 0], s * 0.5, 0.8);
    k.light([flameX, flameY + 0.1 * s, 0], '#ffb050', 3, s * 3, true, true);
    k.collide([-0.8 * s, 0, -0.8 * s], [0.8 * s, base, 0.8 * s]);
    return { name: 'Statue of Liberty', height: flameY + 0.2 * s };
  },
  tajMahal(k, a, r) {
    const s = clamp(a.sizeMul || 1, 0.5, 3);
    const marble = k.body('marble', '#f4f0e8');
    const W = 30 * s;
    k.box(marble, [0, 1 * s, 0], [W * 1.8, 2 * s, W * 1.8]);
    const oct = []; for (let i = 0; i < 8; i++) { const an = (i + 0.5) / 8 * TAU; oct.push([Math.cos(an) * W * 0.55, Math.sin(an) * W * 0.55]); }
    k.ext(marble, oct, 16 * s, [0, 2 * s + 8 * s, 0], [HALF, 0, 0]);
    for (let f = 0; f < 4; f++) {
      const n = new THREE.Vector3(0, 0, W * 0.5 + 0.1).applyEuler(new THREE.Euler(0, f * HALF, 0));
      const arch = []; for (let i = 0; i <= 12; i++) { const t = i / 12; const an = PI * t; arch.push([Math.cos(an) * 4 * s, 9 * s + Math.pow(Math.sin(an), 0.7) * 4 * s]); }
      k.ext('dark', [[4 * s, 0], ...arch, [-4 * s, 0]], 0.4, [n.x, 2 * s, n.z], [0, f * HALF, 0]);
      k.ext('m:#e8e0d0', [[5.2 * s, 0], [5.2 * s, 14.5 * s], [-5.2 * s, 14.5 * s], [-5.2 * s, 0]], 0.2, [n.x * 0.995, 2 * s, n.z * 0.995], [0, f * HALF, 0]);
    }
    k.cyl(marble, [0, 18 * s + 2 * s, 0], 9 * s, 4 * s, null, { segs: 32 });
    const prof = []; for (let i = 0; i <= 18; i++) { const t = i / 18; prof.push([10.5 * s * Math.sin(Math.min(1, t * 1.2) * PI * 0.58) * (1 - Math.pow(t, 2.5) * 0.95) + 0.05, t * 18 * s]); }
    k.lathe(marble, [0, 22 * s, 0], prof, 40);
    k.seg('gold', [0, 40 * s, 0], [0, 45 * s, 0], 0.25 * s, 0.05 * s, 8);
    for (const [x, z] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const cx = x * W * 0.36, cz = z * W * 0.36;
      for (let i = 0; i < 6; i++) { const an = i / 6 * TAU; k.seg(marble, [cx + Math.cos(an) * 2.2 * s, 18 * s, cz + Math.sin(an) * 2.2 * s], [cx + Math.cos(an) * 2.2 * s, 22 * s, cz + Math.sin(an) * 2.2 * s], 0.25 * s); }
      k.dome(marble, [cx, 22 * s, cz], 2.6 * s);
      const mx = x * W * 0.85, mz = z * W * 0.85;
      k.cyl(marble, [mx, 2 * s + 14 * s, mz], 1.4 * s, 28 * s, null, { segs: 16, rTop: 1.1 * s });
      for (const y of [12, 21, 29]) k.cyl(marble, [mx, 2 * s + y * s, mz], 1.9 * s, 0.6 * s, null, { segs: 16 });
      k.dome(marble, [mx, 30.5 * s, mz], 1.6 * s);
      k.collideCyl(mx, mz, 0, 30 * s, 1.4 * s);
    }
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(6 * s, 60 * s), G.materials.get('water'));
    pool.rotation.x = -HALF; k.add(pool, [0, 0.35 * s, W * 0.9 + 30 * s]);
    k.box(marble, [0, 0.15 * s, W * 0.9 + 30 * s], [8 * s, 0.3 * s, 62 * s]);
    for (const x of [-7, 7]) for (let i = 0; i < 10; i++) k.cone('m:#1a4a1a', [x * s, 3 * s, W * 0.9 + 3 * s + i * 6 * s], 1.2 * s, 6 * s, null, 8);
    k.collide([-W * 0.9, 0, -W * 0.9], [W * 0.9, 2 * s, W * 0.9]);
    k.collide([-W * 0.5, 2 * s, -W * 0.5], [W * 0.5, 18 * s, W * 0.5]);
    return { name: 'Taj Mahal', height: 45 * s, noAutoCollide: true };
  },
  pisa(k, a, r) {
    const s = clamp(a.sizeMul || 1, 0.5, 4);
    const t = k.sub([0, 0, 0], [0.07, 0, 0]);
    const marble = k.body('marble', '#f0ebe0');
    const R = 5 * s, tiers = 8, TH = 5.5 * s;
    for (let i = 0; i < tiers; i++) {
      const rr = i === tiers - 1 ? R * 0.75 : R;
      const y0 = i * TH;
      t.cyl(marble, [0, y0 + TH / 2, 0], rr * 0.86, TH, null, { segs: 28 });
      t.cyl(marble, [0, y0 + TH - 0.2 * s, 0], rr + 0.35 * s, 0.4 * s, null, { segs: 32 });
      const n = i === 0 ? 15 : 30;
      for (let j = 0; j < n; j++) { const an = j / n * TAU; t.cyl(marble, [Math.cos(an) * rr, y0 + TH * 0.45, Math.sin(an) * rr], 0.2 * s, TH * 0.8, null, { segs: 8 }); }
      for (let j = 0; j < n; j++) { const an = (j + 0.5) / n * TAU; t.box('m:#9a9488', [Math.cos(an) * rr * 0.87, y0 + TH * 0.45, Math.sin(an) * rr * 0.87], [0.1, TH * 0.6, rr * TAU / n * 0.6], [0, -an, 0]); }
    }
    t.cone('m:#b8a890', [0, tiers * TH + 1.2 * s, 0], R * 0.6, 2.4 * s, null, 24);
    k.collideCyl(0, 0, 0, tiers * TH, R);
    return { name: 'Leaning Tower of Pisa', height: tiers * TH + 3 * s };
  },
  greatWall(k, a, r) {
    const L = clamp(120 * (a.sizeMul || 1), 40, 600), W = 5, H = 7;
    const stone = k.body('stone', '#9a8e7a');
    const zAt = (x) => Math.sin(x / 18) * 8 + Math.sin(x / 7) * 1.5;
    const n = Math.round(L / 4);
    for (let i = 0; i < n; i++) {
      const x0 = -L / 2 + i * L / n, x1 = x0 + L / n, z0 = zAt(x0), z1 = zAt(x1);
      const yaw = Math.atan2(x1 - x0, z1 - z0), len = Math.hypot(x1 - x0, z1 - z0) + 0.2;
      const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
      k.box(stone, [mx, (H - 3) / 2, mz], [W, H + 3, len], [0, yaw, 0]);
      for (const sd of [-1, 1]) { const off = new THREE.Vector3(sd * (W / 2 - 0.3), 0, 0).applyEuler(new THREE.Euler(0, yaw, 0)); k.box(stone, [mx + off.x, H + 0.6, mz + off.z], [0.6, 1.2, len * 0.55], [0, yaw, 0]); }
      k.box('m:#8a8070', [mx, H + 0.02, mz], [W - 1.2, 0.05, len], [0, yaw, 0]);
      k.collide([mx - 2.5, 0, mz - 2.5], [mx + 2.5, H, mz + 2.5]);
    }
    for (let x = -L / 2 + 15; x < L / 2; x += 30) { const z = zAt(x); k.box(stone, [x, H / 2 + 2, z], [W + 3, H + 7, W + 3]); for (let i = 0; i < 4; i++) k.box('dark', [x, H + 3, z + (W + 3) / 2], [1, 1.6, 0.1]); k.box(stone, [x, H + 5.8, z], [W + 3.6, 0.6, W + 3.6]); k.collide([x - 4, 0, z - 4], [x + 4, H + 5.5, z + 4]); }
    return { name: 'Great Wall', height: H + 6, noAutoCollide: true, flatten: false };
  },
  arcDeTriomphe(k, a, r) {
    const s = clamp(a.sizeMul || 1, 0.5, 3);
    const W = 30 * s, H = 34 * s, D = 16 * s;
    const stone = k.body('stone', '#e0d6c0');
    const shape = new THREE.Shape([[-W / 2, 0], [W / 2, 0], [W / 2, H], [-W / 2, H]].map(([x, y]) => new THREE.Vector2(x, y)));
    const hole = new THREE.Path(); hole.moveTo(-5.5 * s, 0); hole.lineTo(-5.5 * s, 18 * s); hole.absarc(0, 18 * s, 5.5 * s, PI, 0, true); hole.lineTo(5.5 * s, 0); hole.lineTo(-5.5 * s, 0);
    shape.holes.push(hole);
    k.ext(stone, shape, D, [0, 0, 0]);
    const side = new THREE.Shape([[-D / 2, 0], [D / 2, 0], [D / 2, H], [-D / 2, H]].map(([x, y]) => new THREE.Vector2(x, y)));
    const sh = new THREE.Path(); sh.moveTo(-3 * s, 0); sh.lineTo(-3 * s, 11 * s); sh.absarc(0, 11 * s, 3 * s, PI, 0, true); sh.lineTo(3 * s, 0); sh.lineTo(-3 * s, 0);
    side.holes.push(sh);
    k.ext(stone, side, 1.2 * s, [0, 0, 0], [0, HALF, 0]);
    for (const y of [H * 0.72, H * 0.82]) k.box('m:#d0c6b0', [0, y, 0], [W + 1 * s, 1.2 * s, D + 1 * s]);
    k.box(stone, [0, H + 1.5 * s, 0], [W - 1, 3 * s, D - 1]);
    for (const sx of [-1, 1]) k.box('m:#c8bca4', [sx * W * 0.3, 11 * s, D / 2 + 0.3 * s], [5 * s, 9 * s, 0.6 * s]);
    k.collide([-W / 2, 0, -D / 2], [-5.5 * s, H, D / 2]); k.collide([5.5 * s, 0, -D / 2], [W / 2, H, D / 2]);
    k.collide([-W / 2, 23.5 * s, -D / 2], [W / 2, H + 3 * s, D / 2]);
    return { name: 'Arc de Triomphe', height: H + 3 * s, noAutoCollide: true };
  },
  operaHouse(k, a, r) {
    const s = clamp(a.sizeMul || 1, 0.5, 3);
    const tile = k.body('glossyPlastic', '#f4f2ea');
    k.box('granite', [0, 2 * s, 0], [50 * s, 4 * s, 80 * s]);
    const shells = [[0, -22, 20, 1], [0, -6, 26, 1], [0, 12, 22, 1], [16, 20, 12, 0.6], [16, 32, 10, 0.55], [-16, 24, 11, 0.6]];
    for (const [x, z, h, w] of shells) {
      for (const dir of [1, -1]) {
        const g = new THREE.SphereGeometry(h * s, 24, 12, 0, PI * 0.5, 0, PI * 0.5);
        g.scale(w * 0.5, 1, 1.1);
        k._add(tile, g, [x * s, 4 * s, z * s], [0, dir > 0 ? -HALF * 0.5 - PI / 4 : HALF * 0.5 + PI * 0.75, 0]);
      }
      k.ext('tglass', [[-h * s * 0.3, 0], [h * s * 0.3, 0], [0, h * s * 0.7]], 0.2, [x * s, 4 * s, (z + h * 0.6) * s]);
    }
    k.collide([-25 * s, 0, -40 * s], [25 * s, 4 * s, 40 * s]);
    return { name: 'Sydney Opera House', height: 32 * s, noAutoCollide: true };
  },
  goldenGate(k, a, r) {
    const s = clamp(a.sizeMul || 1, 0.5, 3);
    const L = 160 * s, TH = 55 * s, deck = 14 * s, span = L * 0.3;
    const red = k.body('painted', '#c0442a');
    for (const x of [-span, span]) {
      for (const z of [-5 * s, 5 * s]) k.box(red, [x, TH / 2, z], [3 * s, TH, 3 * s]);
      for (const y of [deck + 4 * s, TH * 0.55, TH * 0.8, TH - 2 * s]) k.box(red, [x, y, 0], [2.6 * s, 3 * s, 10 * s]);
      k.collide([x - 1.5 * s, 0, -6.5 * s], [x + 1.5 * s, TH, -3.5 * s]); k.collide([x - 1.5 * s, 0, 3.5 * s], [x + 1.5 * s, TH, 6.5 * s]);
    }
    k.box(red, [0, deck, 0], [L, 2.5 * s, 11 * s]);
    k.box('asphalt', [0, deck + 1.3 * s, 0], [L, 0.1, 9 * s]);
    for (let i = 0; i < 40; i++) k.box('white', [-L / 2 + i * L / 40, deck + 1.36 * s, 0], [L / 90, 0.02, 0.2 * s]);
    k.collide([-L / 2, deck - 1.2 * s, -5.5 * s], [L / 2, deck + 1.3 * s, 5.5 * s]);
    for (const z of [-5 * s, 5 * s]) {
      const cable = (x0, x1, sag) => { const pts = []; for (let i = 0; i <= 24; i++) { const t = i / 24, x = x0 + (x1 - x0) * t; pts.push([x, TH - 1 * s - sag * 4 * t * (1 - t), z]); } return pts; };
      for (const [x0, x1, sag, drop] of [[-span, span, TH - deck - 4 * s, false], [-L / 2, -span, 0, true], [span, L / 2, 0, true]]) {
        let pts = cable(x0, x1, sag);
        if (drop) pts = pts.map(([x, , zz], i) => [x, x0 < 0 ? deck + 2 + (TH - deck - 3) * (i / 24) : TH - 1 * s - (TH - deck - 3) * (i / 24), zz]);
        k.tube(red, pts, 0.5 * s, 36, false, 8);
        for (let i = 1; i < 24; i++) k.seg(red, [pts[i][0], pts[i][1], z], [pts[i][0], deck + 1.2 * s, z], 0.08 * s, 0.08 * s, 4);
      }
    }
    for (const x of [-span, span]) k.light([x, TH, 0], '#ff4030', 2, 40 * s, true);
    return { name: 'Golden Gate Bridge', height: TH, noAutoCollide: true, flatten: false, preferPlacement: 'far' };
  },
  *sphinx(k, a, r, item, ctx) {
    const s = clamp(a.sizeMul || 1, 0.3, 5) * 10;
    const col = a.primaryColor || '#d8b884';
    const statue = yield* sdfPart(k, ctx, (d) => {
      d.beginGroup({ op: 'union', defaults: { mat: 'st' } });
      d.ellipsoid([0, 0.28, -0.35], [0.32, 0.26, 0.75]);
      d.ellipsoid([0, 0.3, -1.0], [0.3, 0.25, 0.25], { op: 'smooth', k: 0.1 });
      for (const x of [-1, 1]) { d.capsule([x * 0.2, 0.1, 0.1], [x * 0.2, 0.09, 0.75], 0.09, { op: 'smooth', k: 0.05 }); d.ellipsoid([x * 0.2, 0.08, 0.8], [0.1, 0.07, 0.1], { op: 'smooth', k: 0.03 }); d.ellipsoid([x * 0.26, 0.18, -0.85], [0.12, 0.17, 0.3], { op: 'smooth', k: 0.06 }); }
      d.ellipsoid([0, 0.62, 0.22], [0.18, 0.2, 0.2], { op: 'smooth', k: 0.08 });
      d.box([0, 0.68, 0.16], [0.28, 0.2, 0.14], { round: 0.05, op: 'smooth', k: 0.05 });
      d.roundCone([0, 0.55, 0.12], [0, 0.35, 0.18], 0.2, 0.26, { op: 'smooth', k: 0.05 });
      d.ellipsoid([0, 0.63, 0.36], [0.1, 0.13, 0.08], { op: 'smooth', k: 0.04 });
      d.sphere([0, 0.62, 0.43], 0.025, { op: 'smooth', k: 0.02 });
      d.capsule([0, 0.25, -1.15], [0.3, 0.05, -0.9], 0.04, { op: 'smooth', k: 0.03 });
      d.box([0, 0.02, -0.1], [0.45, 0.02, 1.2], { round: 0.01 });
      d.endGroup();
    }, { st: ['sand', { color: col }] }, 0.02, [0, 0, 0]);
    statue.scale.setScalar(s);
    k.collide([-0.4 * s, 0, -1.2 * s], [0.4 * s, 0.5 * s, 0.9 * s]);
    return { name: 'Great Sphinx', height: 0.85 * s, noAutoCollide: true };
  },
};

export const landmarkGen = {
  maxCount: 3,
  estimate: (item) => ({ eiffel: 5, colosseum: 5, liberty: 5, tajMahal: 4, sphinx: 5 }[item.params.kind] || 3),
  stages: () => [{ name: 'geometry', label: 'Raising the landmark', weight: 4 }, { name: 'textures', label: 'Finishing', weight: 1 }],
  *build(ctx, item, rng) {
    const a = item.attrs;
    const kind = LANDMARKS[item.params.kind] ? item.params.kind : 'eiffel';
    const k = new Kit(a, rng);
    ctx.stage('geometry', 'Raising ' + (item.concept || kind));
    yield;
    const res = LANDMARKS[kind](k, a, rng, item, ctx);
    const info = res && typeof res.next === 'function' ? yield* res : res;
    ctx.stage('textures', 'Finishing');
    yield;
    k.finish();
    const box = solidBounds(k.group);
    const hx = Math.max(box.max.x, -box.min.x, 2), hz = Math.max(box.max.z, -box.min.z, 2);
    const data = {
      root: k.group, name: info.name, category: 'landmark', icon: item.icon || '🗼', height: info.height || box.max.y,
      footprint: { radius: Math.hypot(hx, hz) * 0.8, rect: { hw: hx, hd: hz } },
      colliderDefs: k.colliders, lights: k.lights, suppressGrass: false,
      flattenTerrain: info.flatten !== false, flattenFalloff: 6,
    };
    if (info.preferPlacement) data.preferPlacement = info.preferPlacement;
    if (info.interact) data.interact = info.interact;
    if (k.ticks.length) data.update = function (dt, t, dist) { for (const f of k.ticks) f(dt, t, dist ?? 0); };
    return data;
  },
};
