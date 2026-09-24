// Small shared helpers for generators: rotated boxes/cylinders in a
// MeshBuilder, canvas text textures (signs, 3D letters), waving flags,
// per-frame animation hooks and glow sprites.

import * as THREE from 'three';
import { G } from '../../core/context.js';
import { markNoAO } from '../../render/renderer.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();

// Box centred at (x,y,z) with size (sx,sy,sz), rotated by yaw (and optional pitch/roll).
export function obox(b, key, x, y, z, sx, sy, sz, yaw = 0, pitch = 0, roll = 0) {
  const g = new THREE.BoxGeometry(sx, sy, sz);
  boxUV(g, sx, sy, sz);
  _e.set(pitch, yaw, roll, 'YXZ');
  _m.compose(new THREE.Vector3(x, y, z), _q.setFromEuler(_e), new THREE.Vector3(1, 1, 1));
  b.geometry(key, g, _m);
  g.dispose();
}

// Metre-scaled UVs for BoxGeometry faces.
export function boxUV(g, sx, sy, sz) {
  const uv = g.attributes.uv;
  const dims = [[sz, sy], [sz, sy], [sx, sz], [sx, sz], [sx, sy], [sx, sy]];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
    const i = f * 4 + k;
    uv.setXY(i, uv.getX(i) * dims[f][0], uv.getY(i) * dims[f][1]);
  }
  return g;
}

// Vertical cylinder / cone frustum with metre UVs.
export function ocyl(b, key, x, y0, z, r, h, segs = 16, rTop = r, open = false) {
  const g = new THREE.CylinderGeometry(rTop, r, h, segs, 1, open);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * Math.PI * 2 * Math.max(r, rTop), uv.getY(i) * h);
  b.geometry(key, g, _m.makeTranslation(x, y0 + h / 2, z));
  g.dispose();
}

// Cylinder between two points (beams, poles, ropes).
export function beam(b, key, a, c, r, segs = 8) {
  const dir = new THREE.Vector3().subVectors(c, a);
  const len = dir.length();
  const g = new THREE.CylinderGeometry(r, r, len, segs, 1, false);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * Math.PI * 2 * r, uv.getY(i) * len);
  _q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  _m.compose(new THREE.Vector3().addVectors(a, c).multiplyScalar(0.5), _q, new THREE.Vector3(1, 1, 1));
  b.geometry(key, g, _m);
  g.dispose();
}

// Register a per-frame callback on an entity root: fn(time, dt).
export function animate(root, fn) {
  root.userData.animated = root.userData.animated || [];
  root.userData.animated.push(fn);
}

// Canvas-rendered text texture.
export function labelTexture(text, o = {}) {
  const w = o.w || 1024, h = o.h || 256;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  if (o.bg) { g.fillStyle = o.bg; g.fillRect(0, 0, w, h); }
  if (o.border) { g.strokeStyle = o.border; g.lineWidth = h * 0.05; g.strokeRect(h * 0.05, h * 0.05, w - h * 0.1, h - h * 0.1); }
  const fontFamily = o.font || 'Georgia, "Times New Roman", serif';
  let size = o.size || h * 0.56;
  g.font = `${o.weight || 'bold'} ${size}px ${fontFamily}`;
  const maxW = w * 0.9;
  while (g.measureText(text).width > maxW && size > 12) { size *= 0.92; g.font = `${o.weight || 'bold'} ${size}px ${fontFamily}`; }
  g.textAlign = 'center'; g.textBaseline = 'middle';
  if (o.glow) { g.shadowColor = o.glow; g.shadowBlur = h * 0.12; }
  if (o.stroke) { g.strokeStyle = o.stroke; g.lineWidth = size * 0.08; g.strokeText(text, w / 2, h / 2 + size * 0.04); }
  g.fillStyle = o.fg || '#ffffff';
  g.fillText(text, w / 2, h / 2 + size * 0.04);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// Waving cloth flag on a pole (CPU vertex animation, tiny mesh).
export function makeFlag(root, x, y, z, color = '#c02020', w = 1.6, h = 1.0, poleH = 3, opts = {}) {
  const group = new THREE.Group();
  group.position.set(x, y, z);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, poleH, 8), G.materials.get('metal'));
  pole.position.y = poleH / 2; pole.castShadow = true;
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), G.materials.get('gold'));
  knob.position.y = poleH + 0.04;
  const geo = new THREE.PlaneGeometry(w, h, 12, 6);
  geo.translate(w / 2, 0, 0);
  const base = geo.attributes.position.array.slice();
  let map = null;
  if (opts.text) map = labelTexture(opts.text, { bg: color, fg: opts.fg || '#fff', w: 512, h: 320 });
  const mat = new THREE.MeshStandardMaterial({ color: map ? 0xffffff : color, map, side: THREE.DoubleSide, roughness: 0.85 });
  const cloth = new THREE.Mesh(geo, mat);
  cloth.position.y = poleH - h / 2 - 0.05;
  cloth.castShadow = true;
  group.add(pole, knob, cloth);
  root.add(group);
  const phase = Math.random() * 10;
  animate(root, (t) => {
    const p = geo.attributes.position.array;
    for (let i = 0; i < p.length; i += 3) {
      const u = base[i] / w;
      p[i + 2] = Math.sin(base[i] * 2.6 - t * 6 + phase) * 0.14 * u + Math.sin(base[i + 1] * 3 + t * 4) * 0.04 * u;
      p[i] = base[i] - u * u * 0.05;
    }
    geo.attributes.position.needsUpdate = true;
    geo.computeVertexNormals();
  });
  return group;
}

// Soft additive glow sprite (lamps, magic, lanterns).
let glowTex = null;
export function glowTexture() {
  if (glowTex) return glowTex;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const g = cv.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.25, 'rgba(255,255,255,0.45)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  glowTex = new THREE.CanvasTexture(cv);
  glowTex.userData = { shared: true };
  return glowTex;
}
export function glowSprite(color = '#ffcc88', size = 1, opacity = 0.8) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  s.scale.setScalar(size);
  s.userData.noRaycast = true;
  markNoAO(s);
  return s;
}

// Resolve a user colour/material request for the "main" surface of a thing.
export function userMaterial(a, fallbackType, fallbackOpts = {}) {
  const M = G.materials;
  const mat = a.materials && a.materials[0];
  const col = a.primaryColor && a.primaryColor !== 'rainbow' ? a.primaryColor : undefined;
  if (mat) return M.get(mat, { color: mat === 'glass' || mat === 'gold' || mat === 'chrome' ? (col || undefined) : col });
  return M.get(fallbackType, { ...fallbackOpts, color: col || fallbackOpts.color });
}

export function hsl(h, s, l) { return '#' + new THREE.Color().setHSL(((h % 1) + 1) % 1, s, l).getHexString(); }
