// ---------------------------------------------------------------------------
// 3D letters ("giant letters spelling HELLO", "a sign that says ..."):
// each glyph is rasterised to a canvas, its outline is recovered with
// marching squares (contours chained into loops, holes found by
// containment, simplified with Ramer-Douglas-Peucker and smoothed with
// Chaikin), turned into THREE.Shapes and extruded with bevels. No font
// files are needed, so it works fully offline with the system font.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { G } from '../../core/context.js';
import { hsl, glowSprite } from './common.js';

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

function glyphMask(ch, px) {
  const pad = 4;
  const cv = document.createElement('canvas');
  const g0 = cv.getContext('2d');
  const font = `900 ${px}px "Arial Black", Arial, Helvetica, sans-serif`;
  g0.font = font;
  const w = Math.max(8, Math.ceil(g0.measureText(ch).width)) + pad * 2;
  const h = Math.ceil(px * 1.25) + pad * 2;
  cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  g.font = font; g.fillStyle = '#fff'; g.textBaseline = 'alphabetic';
  g.fillText(ch, pad, pad + px);
  const data = g.getImageData(0, 0, w, h).data;
  const a = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) a[i] = data[i * 4 + 3] / 255;
  return { a, w, h, baseline: pad + px, advance: w - pad * 2 };
}

// Marching squares -> closed loops of [x, y] points (pixel units).
function contours(mask) {
  const { a, w, h } = mask;
  const val = (i, j) => (i < 0 || j < 0 || i >= w || j >= h ? 0 : a[i + j * w]);
  const T = 0.5;
  const pts = new Map();
  const adj = new Map();
  const edgePoint = (key, x0, y0, x1, y1, v0, v1) => {
    if (!pts.has(key)) { const t = clamp((T - v0) / ((v1 - v0) || 1e-6), 0, 1); pts.set(key, [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t]); }
    return key;
  };
  const link = (k1, k2) => { if (!adj.has(k1)) adj.set(k1, []); if (!adj.has(k2)) adj.set(k2, []); adj.get(k1).push(k2); adj.get(k2).push(k1); };
  const TABLE = { 1: [[3, 2]], 2: [[2, 1]], 3: [[3, 1]], 4: [[0, 1]], 5: [[0, 3], [2, 1]], 6: [[0, 2]], 7: [[3, 0]], 8: [[3, 0]], 9: [[0, 2]], 10: [[0, 1], [3, 2]], 11: [[0, 1]], 12: [[3, 1]], 13: [[2, 1]], 14: [[3, 2]] };
  for (let j = -1; j < h; j++) {
    for (let i = -1; i < w; i++) {
      const tl = val(i, j), tr = val(i + 1, j), br = val(i + 1, j + 1), bl = val(i, j + 1);
      const c = (tl > T ? 8 : 0) | (tr > T ? 4 : 0) | (br > T ? 2 : 0) | (bl > T ? 1 : 0);
      const segs = TABLE[c];
      if (!segs) continue;
      const E = [
        () => edgePoint(`h${i},${j}`, i, j, i + 1, j, tl, tr),
        () => edgePoint(`v${i + 1},${j}`, i + 1, j, i + 1, j + 1, tr, br),
        () => edgePoint(`h${i},${j + 1}`, i, j + 1, i + 1, j + 1, bl, br),
        () => edgePoint(`v${i},${j}`, i, j, i, j + 1, tl, bl),
      ];
      for (const [e0, e1] of segs) link(E[e0](), E[e1]());
    }
  }
  // Chain into loops.
  const used = new Set();
  const loops = [];
  for (const start of adj.keys()) {
    if (used.has(start)) continue;
    const loop = [];
    let prev = null, cur = start;
    while (cur && !used.has(cur)) {
      used.add(cur);
      loop.push(pts.get(cur));
      const nb = adj.get(cur).filter((k) => k !== prev && !used.has(k));
      prev = cur; cur = nb[0];
    }
    if (loop.length > 6) loops.push(loop);
  }
  return loops;
}

function rdp(points, eps) {
  if (points.length < 3) return points;
  const [ax, ay] = points[0], [bx, by] = points[points.length - 1];
  let idx = -1, dmax = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const [px, py] = points[i];
    const d = Math.abs((by - ay) * px - (bx - ax) * py + bx * ay - by * ax) / (Math.hypot(bx - ax, by - ay) || 1);
    if (d > dmax) { dmax = d; idx = i; }
  }
  if (dmax > eps) return rdp(points.slice(0, idx + 1), eps).slice(0, -1).concat(rdp(points.slice(idx), eps));
  return [points[0], points[points.length - 1]];
}
// RDP on a closed loop: split at the point farthest from the start so
// neither half has coincident endpoints (which would collapse to nothing).
function rdpLoop(loop, eps) {
  const [x0, y0] = loop[0];
  let far = 1, dmax = -1;
  for (let i = 1; i < loop.length; i++) { const d = Math.hypot(loop[i][0] - x0, loop[i][1] - y0); if (d > dmax) { dmax = d; far = i; } }
  const a = rdp(loop.slice(0, far + 1), eps);
  const b = rdp(loop.slice(far).concat([loop[0]]), eps);
  return a.slice(0, -1).concat(b.slice(0, -1));
}
// One Chaikin pass that keeps sharp corners (turns > ~55 deg), so round
// glyphs get smooth while block letters keep crisp corners.
function chaikin(loop) {
  const out = [];
  const n = loop.length;
  for (let i = 0; i < n; i++) {
    const [px, py] = loop[(i - 1 + n) % n], [ax, ay] = loop[i], [bx, by] = loop[(i + 1) % n];
    const ux = ax - px, uy = ay - py, vx = bx - ax, vy = by - ay;
    const cos = (ux * vx + uy * vy) / ((Math.hypot(ux, uy) * Math.hypot(vx, vy)) || 1);
    if (cos < 0.57) out.push([ax, ay]);
    else out.push([px * 0.25 + ax * 0.75, py * 0.25 + ay * 0.75], [ax * 0.75 + bx * 0.25, ay * 0.75 + by * 0.25]);
  }
  return out;
}
function inside(pt, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

function glyphShapes(ch, px) {
  const mask = glyphMask(ch, px);
  let loops = contours(mask).map((l) => { const s = rdpLoop(l, 0.45); return s.length >= 3 ? chaikin(s) : null; }).filter(Boolean);
  // Flip Y (canvas down -> world up), relative to the baseline.
  loops = loops.map((l) => l.map(([x, y]) => [x, mask.baseline - y]));
  const depth = loops.map((l, i) => loops.reduce((n, o, k) => n + (k !== i && inside(l[0], o) ? 1 : 0), 0));
  const shapes = [];
  loops.forEach((l, i) => {
    if (depth[i] % 2 !== 0) return;
    const s = new THREE.Shape(l.map(([x, y]) => new THREE.Vector2(x, y)));
    loops.forEach((h, k) => { if (depth[k] === depth[i] + 1 && inside(h[0], l)) s.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y)))); });
    shapes.push(s);
  });
  return { shapes, advance: mask.advance, w: mask.w };
}

export const textGen = {
  maxCount: 3,
  estimate: (item) => 1 + (item.attrs.label || '').length * 0.2,
  stages: () => [{ name: 'geometry', label: 'Tracing letters', weight: 3 }, { name: 'textures', label: 'Materials', weight: 1 }],
  *build(ctx, item, rng) {
    const a = item.attrs;
    let text = (a.label || a.name || a.text.match(/(?:spelling|spells|saying|says|word|text|name)\s+["']?([a-z0-9 !?]+)/i)?.[1] || 'HELLO').trim();
    text = text.slice(0, 24).toUpperCase();
    const H = (a.dims.height || 2.2) * (a.dims.height ? 1 : clamp(a.sizeMul || 1, 0.2, 12));
    const px = 64;
    const scale = H / (px * 0.72);
    const depthM = H * 0.2;
    const root = new THREE.Group();
    const rainbow = a.primaryColor === 'rainbow' || (!a.primaryColor && !a.materials[0] && rng.chance(0.5));
    const glow = a.flags.glow || a.words.includes('neon');
    const baseMat = a.materials[0] ? G.materials.get(a.materials[0], { color: a.primaryColor && a.primaryColor !== 'rainbow' ? a.primaryColor : undefined }) : null;
    let x = 0;
    const letters = [];
    for (const ch of text) {
      if (ch === ' ') { x += px * 0.45; continue; }
      const { shapes, advance } = glyphShapes(ch, px);
      if (shapes.length) {
        const geo = new THREE.ExtrudeGeometry(shapes, { depth: depthM / scale, bevelEnabled: true, bevelThickness: px * 0.05, bevelSize: px * 0.035, bevelSegments: 3, curveSegments: 4 });
        geo.scale(scale, scale, scale);
        geo.translate(x * scale, 0, -depthM / 2);
        const col = a.primaryColor && a.primaryColor !== 'rainbow' ? a.primaryColor : rainbow ? hsl(letters.length / Math.max(1, text.length) * 0.85, 0.85, 0.55) : '#f4f4f2';
        const mat = baseMat || (glow ? G.materials.get('emissive', { color: col, emissiveIntensity: 2.5 }) : G.materials.get('glossyPlastic', { color: col }));
        const m = new THREE.Mesh(geo, mat);
        m.castShadow = true; m.receiveShadow = true;
        root.add(m);
        letters.push({ m, x0: x * scale, w: advance * scale });
      }
      x += advance + px * 0.1;
      if (ctx.shouldYield()) yield;
    }
    const total = x * scale;
    for (const l of letters) l.m.position.x -= total / 2;
    const bounce = a.words.includes('bouncing') || a.words.includes('dancing') || a.flags.spin;
    if (bounce) root.userData.animated = [(t) => letters.forEach((l, i) => { l.m.position.y = Math.abs(Math.sin(t * 3 + i * 0.5)) * H * 0.2; })];
    const data = {
      root, name: `Letters: ${text}`, category: 'text', icon: '🔤', height: H, footprint: { radius: Math.max(1, total / 2), rect: { hw: total / 2 + 0.3, hd: depthM / 2 + 0.3 } },
      colliderDefs: letters.map((l) => ({ type: 'box', x: l.x0 - total / 2 + l.w / 2, z: 0, y0: 0, y1: H, hx: l.w / 2, hz: depthM / 2 })), suppressGrass: false,
    };
    if (glow) { data.lights = [{ pos: [0, H / 2, 1], color: a.primaryColor || '#ff60c0', intensity: 3, distance: total + 6, nightOnly: false }]; const gs = glowSprite(a.primaryColor || '#ff60c0', total * 1.3, 0.25); gs.position.y = H / 2; root.add(gs); }
    return data;
  },
};
