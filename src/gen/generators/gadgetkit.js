// ---------------------------------------------------------------------------
// Object construction kit for the gadget generator.
//
// A thin layer over MeshBuilder: every call places one primitive (box,
// rounded box, cylinder, cylinder between two points, sphere, torus, cone,
// lathe profile, tube along a curve, extruded outline) with position,
// rotation and scale, and geometry is merged per material, so a whole
// appliance is a handful of draw calls. Only screens, labels, glows and
// moving parts (sub-kits with their own pivot) become separate objects.
//
// Material keys are resolved lazily: named keys ('chrome', 'rubber',
// 'glass', 'screen'...), library types, plain '#rrggbb' colours (glossy
// plastic) or 'x:#rrggbb' with a type prefix (p plastic, m painted metal,
// e emissive, f fabric, w wood, l leather, c car paint). 'body' and
// 'accent' honour the prompt's colours, material, glow and transparency.
//
// Objects are modelled at real-world size, standing on y = 0, front +Z.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { MeshBuilder } from './buildkit.js';
import { G } from '../../core/context.js';
import { labelTexture, glowSprite, hsl } from './common.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
const V3 = (a) => (a && a.isVector3 ? a.clone() : new THREE.Vector3(a[0], a[1], a[2]));
const TAU = Math.PI * 2;

const NAMED = {
  metal: ['metal', {}], steel: ['steel', {}], chrome: ['chrome', {}], gold: ['gold', {}], brass: ['gold', { color: '#c8a050' }], copper: ['copper', {}], bronze: ['bronze', {}], iron: ['iron', {}], rust: ['rust', {}], alu: ['metal', { color: '#c8ccd2' }],
  black: ['glossyPlastic', { color: '#161618' }], dark: ['plastic', { color: '#2a2b2e' }], gray: ['plastic', { color: '#8a8c90' }], lightgray: ['plastic', { color: '#c8cacc' }], white: ['glossyPlastic', { color: '#f0f0ee' }], cream: ['glossyPlastic', { color: '#ece2cc' }],
  rubber: ['rubber', {}], tire: ['tire', {}], glass: ['glass', { opacity: 0.3 }], tglass: ['tintedGlass', {}], mirror: ['mirror', {}],
  wood: ['wood', {}], darkWood: ['darkWood', {}], lightWood: ['lightWood', {}], planks: ['planks', {}],
  fabric: ['fabric', { color: '#8a3a3a' }], leather: ['leather', { color: '#5a3a22' }], velvet: ['velvet', { color: '#7a1a2a' }], knit: ['knit', { color: '#c8b8a0' }],
  stone: ['stone', {}], marble: ['marble', {}], concrete: ['concrete', {}], brick: ['brick', {}], granite: ['granite', {}], sand: ['sand', {}],
  paper: ['paint', { color: '#f4f0e6' }], screen: ['emissive', { color: '#5aa8ff', emissiveIntensity: 1.1 }], screenOff: ['glossyPlastic', { color: '#0c0e12' }],
  led: ['emissive', { color: '#ff2a2a', emissiveIntensity: 3 }], ledG: ['emissive', { color: '#2aff5a', emissiveIntensity: 3 }], ledB: ['emissive', { color: '#2a8aff', emissiveIntensity: 3 }], ledY: ['emissive', { color: '#ffc02a', emissiveIntensity: 3 }],
  warm: ['emissive', { color: '#ffd9a0', emissiveIntensity: 2.5 }], cyanGlow: ['emissive', { color: '#40f0ff', emissiveIntensity: 3 }], magicGlow: ['emissive', { color: '#b060ff', emissiveIntensity: 3 }], fire: ['emissive', { color: '#ff7a1a', emissiveIntensity: 4 }],
  crystal: ['crystal', {}], ice: ['ice', {}], lava: ['lava', {}], hologram: ['hologram', {}], water: ['water', {}], bone: ['glossyPlastic', { color: '#e8dfc8' }],
};
const PREFIX = { p: 'plastic', g: 'glossyPlastic', m: 'painted', e: 'emissive', f: 'fabric', w: 'wood', l: 'leather', c: 'carPaint', k: 'knit', v: 'velvet', s: 'stone' };

function scaleUV(g, s) {
  const uv = g.attributes.uv;
  if (!uv) return g;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * s, uv.getY(i) * s);
  return g;
}

export class Kit {
  constructor(a, rng, parent = null) {
    this.a = a || { colors: [], materials: [], flags: {}, words: [], dims: {} };
    this.r = rng;
    this.parent = parent;
    this.group = new THREE.Group();
    this.b = new MeshBuilder();
    this.children = [];
    if (!parent) { this.mats = {}; this.colliders = []; this.lights = []; this.ticks = []; }
  }
  get top() { return this.parent ? this.parent.top : this; }

  // ---------------- Materials ----------------
  // Register (or override) a material key.
  m(key, type, opts = {}) { this.top.mats[key] = G.materials.get(type, opts); return key; }
  // The prompt's colour (or the given default).
  color(def) { const a = this.a; if (a.primaryColor === 'rainbow') return hsl(this.r.range(0, 1), 0.8, 0.55); return a.primaryColor || def; }
  color2(def) { return this.a.secondaryColor || def; }
  // Main surface honouring colour / material / glow / transparency requests.
  body(type = 'glossyPlastic', def = '#8a8c90', opts = {}, key = 'body') {
    const a = this.a, M = G.materials;
    const col = this.color(def);
    let mat;
    if (a.flags && a.flags.glow) mat = M.get('emissive', { color: col, emissiveIntensity: 2.2 });
    else if (a.flags && a.flags.transparent) mat = M.get('glass', { color: col, opacity: 0.35 });
    else if (a.materials && a.materials[0]) { const mt = a.materials[0]; mat = M.get(mt, { color: ['glass', 'gold', 'chrome', 'crystal', 'ice', 'lava', 'marble'].includes(mt) && !a.primaryColor ? undefined : col }); }
    else mat = M.get(type, { ...opts, color: col });
    this.top.mats[key] = mat;
    return key;
  }
  accent(type = 'glossyPlastic', def = '#2a2b2e', opts = {}) { this.top.mats.accent = G.materials.get(type, { ...opts, color: this.color2(def) }); return 'accent'; }
  _resolve(key) {
    const T = this.top;
    if (T.mats[key]) return T.mats[key];
    let mat;
    if (NAMED[key]) mat = G.materials.get(NAMED[key][0], NAMED[key][1]);
    else if (/^#[0-9a-f]{6}$/i.test(key)) mat = G.materials.get('glossyPlastic', { color: key });
    else if (/^[a-z]:#[0-9a-f]{6}$/i.test(key)) { const t = PREFIX[key[0]] || 'plastic'; mat = G.materials.get(t, t === 'emissive' ? { color: key.slice(2), emissiveIntensity: 2.5 } : { color: key.slice(2) }); }
    else if (key === 'body') mat = G.materials.get('glossyPlastic', { color: this.color('#8a8c90') });
    else if (key === 'accent') mat = G.materials.get('glossyPlastic', { color: this.color2('#2a2b2e') });
    else { try { mat = G.materials.get(key, {}); } catch (e) { mat = null; } if (!mat) mat = G.materials.get('plastic', { color: '#8a8c90' }); }
    T.mats[key] = mat;
    return mat;
  }
  mat(key) { return this._resolve(key); }

  // ---------------- Primitive placement ----------------
  _add(key, geo, pos, rot, scl) {
    _e.set(rot ? rot[0] : 0, rot ? rot[1] : 0, rot ? rot[2] : 0, 'YXZ');
    _m.compose(_p.set(pos[0], pos[1], pos[2]), _q.setFromEuler(_e), scl ? _s.set(scl[0], scl[1], scl[2]) : _s.set(1, 1, 1));
    this.b.geometry(key, geo, _m);
    geo.dispose();
    return this;
  }
  box(key, pos, size, rot) {
    const g = new THREE.BoxGeometry(size[0], size[1], size[2]);
    const uv = g.attributes.uv;
    const dims = [[size[2], size[1]], [size[2], size[1]], [size[0], size[2]], [size[0], size[2]], [size[0], size[1]], [size[0], size[1]]];
    for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * dims[f][0], uv.getY(i) * dims[f][1]); }
    return this._add(key, g, pos, rot);
  }
  // Rounded box; radius is clamped to half the smallest side.
  rbox(key, pos, size, radius = 0.02, rot, segs) {
    const r = Math.min(radius, size[0] / 2 - 1e-4, size[1] / 2 - 1e-4, size[2] / 2 - 1e-4);
    if (r <= 0.0005) return this.box(key, pos, size, rot);
    // Rounding detail follows the part's size (tiny buttons don't need smooth corners).
    const big = Math.max(size[0], size[1], size[2]);
    const n = segs || (big < 0.05 ? 1 : big < 0.2 ? 2 : 3);
    const g = new RoundedBoxGeometry(size[0], size[1], size[2], n, r);
    scaleUV(g, Math.max(size[0], size[1], size[2]));
    return this._add(key, g, pos, rot);
  }
  // Cylinder centred at pos along local Y. o: { rTop, segs, open, arc, arcStart }
  cyl(key, pos, r, h, rot, o = {}) {
    const g = new THREE.CylinderGeometry(o.rTop ?? r, r, h, o.segs || 20, 1, !!o.open, o.arcStart || 0, o.arc || TAU);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * TAU * r, uv.getY(i) * h);
    return this._add(key, g, pos, rot);
  }
  // Cylinder / cone frustum from point a (radius r0) to point b (radius r1).
  seg(key, a, b, r0, r1 = r0, segs = 12) {
    const A = V3(a), B = V3(b);
    const dir = new THREE.Vector3().subVectors(B, A);
    const len = dir.length();
    if (len < 1e-5) return this;
    const g = new THREE.CylinderGeometry(r1, r0, len, segs, 1, false);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * TAU * Math.max(r0, r1), uv.getY(i) * len);
    _q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    _m.compose(_p.addVectors(A, B).multiplyScalar(0.5), _q, _s.set(1, 1, 1));
    this.b.geometry(key, g, _m);
    g.dispose();
    return this;
  }
  ball(key, pos, r, scl, segs = 18, rot) {
    const g = new THREE.SphereGeometry(r, segs, Math.max(6, Math.round(segs * 0.66)));
    scaleUV(g, r * 3);
    return this._add(key, g, pos, rot, scl);
  }
  // Partial sphere (domes, bowls): phi/theta ranges as in SphereGeometry.
  dome(key, pos, r, rot, o = {}) {
    const g = new THREE.SphereGeometry(r, o.segs || 20, o.rings || 10, 0, TAU, o.t0 || 0, o.t1 ?? Math.PI / 2);
    scaleUV(g, r * 3);
    return this._add(key, g, pos, rot, o.scl);
  }
  torus(key, pos, R, r, rot, arc = TAU, segs = 24) {
    const g = new THREE.TorusGeometry(R, r, Math.max(6, Math.round(segs / 3)), segs, arc);
    scaleUV(g, R * 2);
    return this._add(key, g, pos, rot);
  }
  cone(key, pos, r, h, rot, segs = 16) {
    const g = new THREE.ConeGeometry(r, h, segs);
    scaleUV(g, Math.max(r * 2, h));
    return this._add(key, g, pos, rot);
  }
  // Lathe profile [[radius, y], ...] revolved around local Y.
  lathe(key, pos, profile, segs = 24, rot, scl) {
    const g = new THREE.LatheGeometry(profile.map(([x, y]) => new THREE.Vector2(Math.max(0.0004, x), y)), segs);
    const span = Math.max(...profile.map((p) => p[1])) - Math.min(...profile.map((p) => p[1]));
    scaleUV(g, Math.max(0.1, span));
    return this._add(key, g, pos, rot, scl);
  }
  // Tube through points (world-space within the kit).
  tube(key, pts, r, segs = 24, closed = false, radial = 8) {
    const curve = new THREE.CatmullRomCurve3(pts.map(V3), closed);
    const g = new THREE.TubeGeometry(curve, segs, r, radial, closed);
    scaleUV(g, 1);
    this.b.geometry(key, g, null);
    g.dispose();
    return this;
  }
  // Extruded 2D outline [[x, y], ...] (or THREE.Shape), depth along local Z (centred).
  ext(key, outline, depth, pos, rot, bevel = 0, scl) {
    const shape = outline instanceof THREE.Shape ? outline : new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
    const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 10 });
    g.translate(0, 0, -depth / 2);
    scaleUV(g, 1);
    return this._add(key, g, pos, rot, scl);
  }
  // Flat disc / ring facing +Z.
  disc(key, pos, r, rot, r0 = 0, segs = 28) {
    const g = r0 > 0 ? new THREE.RingGeometry(r0, r, segs) : new THREE.CircleGeometry(r, segs);
    scaleUV(g, r * 2);
    return this._add(key, g, pos, rot);
  }
  quadPlane(key, pos, w, h, rot) {
    const g = new THREE.PlaneGeometry(w, h);
    scaleUV(g, Math.max(w, h));
    return this._add(key, g, pos, rot);
  }

  // ---------------- Separate objects ----------------
  add(obj, pos, rot) {
    if (pos) obj.position.set(pos[0], pos[1], pos[2]);
    if (rot) obj.rotation.set(rot[0], rot[1], rot[2], 'YXZ');
    obj.traverse((o) => { if (o.isMesh) { o.castShadow = o.castShadow !== false; o.receiveShadow = true; } });
    this.group.add(obj);
    return obj;
  }
  // Screen with a canvas texture (drawFn(ctx2d, w, h, t)); animated when fps > 0.
  screen(pos, w, h, rot, drawFn, o = {}) {
    const res = o.res || 256;
    const cv = document.createElement('canvas');
    cv.width = res; cv.height = Math.max(16, Math.round(res * h / w));
    const g2 = cv.getContext('2d');
    drawFn(g2, cv.width, cv.height, 0);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: o.intensity ?? 1.3, roughness: 0.25, metalness: 0 });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    mesh.castShadow = false;
    this.add(mesh, pos, rot);
    if (o.fps) {
      let acc = 0;
      this.top.ticks.push((dt, t, dist) => {
        if (dist > 30) return;
        acc += dt;
        if (acc < 1 / o.fps) return;
        acc = 0;
        drawFn(g2, cv.width, cv.height, t);
        tex.needsUpdate = true;
      });
    }
    mesh.userData.screen = { mat, on: true };
    return mesh;
  }
  label(text, pos, w, h, rot, o = {}) {
    const tex = labelTexture(text, { w: 1024, h: Math.round(1024 * h / w), bg: o.bg, fg: o.fg || '#fff', border: o.border, font: o.font, glow: o.glow, stroke: o.stroke });
    const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: !o.bg, roughness: 0.6, emissive: o.emissive ? 0xffffff : 0x000000, emissiveMap: o.emissive ? tex : null, emissiveIntensity: o.emissive || 0, side: o.double ? THREE.DoubleSide : THREE.FrontSide });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    mesh.castShadow = false;
    return this.add(mesh, pos, rot);
  }
  glow(color, pos, size, opacity = 0.7) { const s = glowSprite(color, size, opacity); s.position.set(pos[0], pos[1], pos[2]); this.group.add(s); return s; }
  light(pos, color = '#ffd9a0', intensity = 2, distance = 6, nightOnly = false, flicker = false) {
    const wp = this._toTop(pos);
    this.top.lights.push({ pos: wp, color, intensity, distance, nightOnly, flicker });
    return this;
  }
  _toTop(pos) {
    // Lights and colliders are expressed in the top kit frame; sub-kits add their pivot offset (rotation ignored).
    let p = [pos[0], pos[1], pos[2]];
    let k = this;
    while (k.parent) { p = [p[0] + k.group.position.x, p[1] + k.group.position.y, p[2] + k.group.position.z]; k = k.parent; }
    return p;
  }
  // Moving part: a child kit whose group sits at `pos` (its local origin is the pivot).
  sub(pos = [0, 0, 0], rot) {
    const k = new Kit(this.a, this.r, this);
    k.group.position.set(pos[0], pos[1], pos[2]);
    if (rot) k.group.rotation.set(rot[0], rot[1], rot[2], 'YXZ');
    this.children.push(k);
    this.group.add(k.group);
    return k;
  }
  collide(min, max, extra = {}) {
    const a = this._toTop(min), b = this._toTop(max);
    this.top.colliders.push({ type: 'box', x: (a[0] + b[0]) / 2, z: (a[2] + b[2]) / 2, y0: Math.min(a[1], b[1]), y1: Math.max(a[1], b[1]), hx: Math.abs(b[0] - a[0]) / 2, hz: Math.abs(b[2] - a[2]) / 2, ...extra });
    return this;
  }
  collideCyl(x, z, y0, y1, r) { const p = this._toTop([x, y0, z]); this.top.colliders.push({ type: 'cyl', x: p[0], z: p[2], y0: p[1], y1: p[1] + (y1 - y0), r }); return this; }
  tick(fn) { this.top.ticks.push(fn); return this; }

  // Build merged meshes (recursively for sub-kits) into the groups.
  finish() {
    const keys = new Set([...this.b.parts.keys(), ...this.b.extra.keys()]);
    const mats = {};
    for (const k of keys) mats[k] = this._resolve(k);
    const built = this.b.build(mats, { castShadow: true });
    for (const c of [...built.children]) this.group.add(c);
    for (const c of this.children) c.finish();
    return this.group;
  }
  // Bounds of the solid geometry only (glow sprites, particles and arcs excluded).
  bounds() { return solidBounds(this.group); }
}

export function solidBounds(obj) {
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3(), tmp = new THREE.Box3();
  obj.traverse((o) => {
    if (!o.isMesh || o.isSprite || !o.geometry || !o.visible) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    tmp.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);
    box.union(tmp);
  });
  return box;
}

// ---------------- Canvas screen painters ----------------
export const SCREENS = {
  desktop(g, w, h, t, o = {}) {
    const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, o.c0 || '#1a3a7a'); gr.addColorStop(1, o.c1 || '#6a2a8a');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.9)'; g.fillRect(w * 0.08, h * 0.12, w * 0.5, h * 0.55);
    g.fillStyle = '#3a6ad8'; g.fillRect(w * 0.08, h * 0.12, w * 0.5, h * 0.07);
    g.fillStyle = '#9aa0aa'; for (let i = 0; i < 6; i++) g.fillRect(w * 0.12, h * (0.24 + i * 0.07), w * (0.2 + ((i * 37) % 20) / 80), h * 0.03);
    g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(0, h * 0.9, w, h * 0.1);
    for (let i = 0; i < 5; i++) { g.fillStyle = ['#ff6a3a', '#3ad86a', '#3aa8ff', '#ffd23a', '#c86aff'][i]; g.fillRect(w * (0.3 + i * 0.08), h * 0.915, h * 0.07, h * 0.07); }
  },
  code(g, w, h, t) {
    g.fillStyle = '#0d1117'; g.fillRect(0, 0, w, h);
    const cols = ['#ff7b72', '#79c0ff', '#d2a8ff', '#a5d6ff', '#7ee787', '#c9d1d9'];
    const lh = h / 18, off = Math.floor(t * 3);
    for (let i = 0; i < 18; i++) {
      let x = w * 0.05 + ((i + off) % 4) * w * 0.04;
      for (let k = 0; k < 4; k++) { const len = w * (0.05 + (((i + off) * 7 + k * 13) % 11) / 60); g.fillStyle = cols[((i + off) * 3 + k) % cols.length]; g.fillRect(x, i * lh + lh * 0.3, len, lh * 0.45); x += len + w * 0.02; }
    }
  },
  tv(g, w, h, t) {
    // A little landscape scene with drifting clouds (reads as "a show").
    const sky = g.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, '#3a8ae0'); sky.addColorStop(1, '#bfe4ff');
    g.fillStyle = sky; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffe070'; g.beginPath(); g.arc(w * 0.8, h * 0.25, h * 0.1, 0, TAU); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.9)'; for (let i = 0; i < 3; i++) { const x = ((i * 0.4 + t * 0.03) % 1.3 - 0.15) * w; g.beginPath(); g.ellipse(x, h * (0.2 + i * 0.08), w * 0.1, h * 0.05, 0, 0, TAU); g.fill(); }
    g.fillStyle = '#3a8a3a'; g.beginPath(); g.moveTo(0, h); g.lineTo(0, h * 0.7); for (let x = 0; x <= w; x += w / 8) g.lineTo(x, h * (0.62 + 0.08 * Math.sin(x / w * 7))); g.lineTo(w, h); g.fill();
    g.fillStyle = '#2a6a2a'; g.beginPath(); g.moveTo(0, h); for (let x = 0; x <= w; x += w / 10) g.lineTo(x, h * (0.8 + 0.05 * Math.sin(x / w * 11 + 2))); g.lineTo(w, h); g.fill();
  },
  bars(g, w, h) { const c = ['#c0c0c0', '#c0c000', '#00c0c0', '#00c000', '#c000c0', '#c00000', '#0000c0']; for (let i = 0; i < 7; i++) { g.fillStyle = c[i]; g.fillRect(i * w / 7, 0, w / 7 + 1, h * 0.75); } g.fillStyle = '#101010'; g.fillRect(0, h * 0.75, w, h * 0.25); },
  static(g, w, h) { const im = g.createImageData(w, h); for (let i = 0; i < im.data.length; i += 4) { const v = Math.random() * 255; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255; } g.putImageData(im, 0, 0); },
  game(g, w, h, t) {
    g.fillStyle = '#101428'; g.fillRect(0, 0, w, h);
    const s = Math.max(2, Math.floor(w / 32));
    g.fillStyle = '#3ad86a'; for (let x = 0; x < w; x += s) g.fillRect(x, h - s * 3, s, s * 3);
    g.fillStyle = '#ffd23a'; const px = ((t * 40) % (w + 40)) - 20; g.fillRect(px, h - s * 6 - Math.abs(Math.sin(t * 5)) * s * 4, s * 2, s * 3);
    g.fillStyle = '#ff4a6a'; for (let i = 0; i < 4; i++) g.fillRect(((i * 0.27 + t * 0.1) % 1) * w, h * 0.3 + i * s * 2, s * 2, s * 2);
    g.fillStyle = '#fff'; g.font = `bold ${s * 2}px monospace`; g.fillText('SCORE ' + String(Math.floor(t * 10) % 10000).padStart(4, '0'), s, s * 3);
  },
  clock(g, w, h, t, o = {}) {
    g.fillStyle = o.bg || '#050805'; g.fillRect(0, 0, w, h);
    const d = new Date(); const s = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    g.fillStyle = o.fg || '#3aff6a'; g.font = `bold ${Math.floor(h * 0.7)}px monospace`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(s, w / 2, h / 2);
  },
  radar(g, w, h, t) {
    g.fillStyle = '#021a08'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#1aff5a'; g.lineWidth = 2; for (let r = 1; r <= 3; r++) { g.beginPath(); g.arc(w / 2, h / 2, Math.min(w, h) * 0.15 * r, 0, TAU); g.stroke(); }
    const a = t * 2; g.beginPath(); g.moveTo(w / 2, h / 2); g.lineTo(w / 2 + Math.cos(a) * w * 0.45, h / 2 + Math.sin(a) * h * 0.45); g.stroke();
    g.fillStyle = '#aaffaa'; for (let i = 0; i < 4; i++) g.fillRect(w * (0.3 + ((i * 37) % 40) / 100), h * (0.3 + ((i * 53) % 40) / 100), 4, 4);
  },
  chart(g, w, h, t) {
    g.fillStyle = '#0a1020'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#3aa8ff'; g.lineWidth = 3; g.beginPath();
    for (let i = 0; i <= 20; i++) { const x = (i / 20) * w, y = h * (0.6 - 0.25 * Math.sin(i * 0.7 + t) - 0.1 * Math.sin(i * 1.9)); if (i) g.lineTo(x, y); else g.moveTo(x, y); }
    g.stroke();
    g.fillStyle = '#ffb23a'; for (let i = 0; i < 8; i++) { const bh = h * (0.1 + 0.25 * Math.abs(Math.sin(i * 1.3 + t * 0.5))); g.fillRect(w * (0.05 + i * 0.11), h - bh, w * 0.07, bh); }
  },
  text(g, w, h, t, o = {}) {
    g.fillStyle = o.bg || '#101010'; g.fillRect(0, 0, w, h);
    g.fillStyle = o.fg || '#ffb030'; g.font = `bold ${Math.floor(h * (o.size || 0.45))}px ${o.font || 'Arial, sans-serif'}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(o.text || '', w / 2, h / 2);
  },
  wave(g, w, h, t) {
    g.fillStyle = '#04100a'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#3aff9a'; g.lineWidth = 3; g.beginPath();
    for (let x = 0; x <= w; x += 4) { const y = h / 2 + Math.sin(x * 0.05 + t * 6) * h * 0.25 * Math.sin(x * 0.01 + t); if (x) g.lineTo(x, y); else g.moveTo(x, y); }
    g.stroke();
  },
  photo(g, w, h) {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#ff9a5a'); gr.addColorStop(0.5, '#ffd08a'); gr.addColorStop(0.51, '#2a4a7a'); gr.addColorStop(1, '#0a1a3a');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = '#fff4c0'; g.beginPath(); g.arc(w / 2, h * 0.5, h * 0.14, Math.PI, TAU); g.fill();
  },
};
