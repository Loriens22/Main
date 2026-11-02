// The city between the landmarks, near the route: playgrounds in the OSM playground areas, park furniture in
// the parks and gardens (gazebos, pergolas, drinking fountains, flower beds, fitness bars, table tennis,
// lanterns along the park paths, kiosks), the props in front of the real shops by their kind (cafe terraces,
// sandwich boards, fruit stands, florists' buckets, ATMs at the banks, the green cross at pharmacies), roof
// gardens on some flat roofs, and murals on the blank gable walls of tall slab blocks. The pieces are the
// Blender street kit (tools/blender/kit_street.py -> src/data/kit_street.glb): vertex colours with baked
// occlusion, one InstancedMesh per piece and 256 m tile. The murals are original procedural artwork.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { mulberry32 } from '../core/rng.js';
import { kindOf } from './ShopFronts.js';
import kitGlb from '../data/kit_street.glb';

/** Parses the street kit: { pieces: {name: [{geometry, glow}]}, mat, glow }. */
export async function loadStreetKit() {
  const buf = kitGlb.buffer.slice(kitGlb.byteOffset, kitGlb.byteOffset + kitGlb.byteLength);
  const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(buf, '');
  const pieces = {};
  gltf.scene.updateMatrixWorld(true);
  const toFloat = (a) => {
    const f = new Float32Array(a.count * a.itemSize);
    for (let i = 0; i < a.count; i++) for (let k = 0; k < a.itemSize; k++) f[i * a.itemSize + k] = a.getComponent(i, k);
    return new THREE.BufferAttribute(f, a.itemSize);
  };
  for (const top of gltf.scene.children) {
    const list = [];
    top.traverse((o) => {
      if (!o.isMesh) return;
      // dequantize, then bake the node's (quantization) transform into the geometry
      const g = new THREE.BufferGeometry();
      for (const [name, a] of Object.entries(o.geometry.attributes)) g.setAttribute(name, toFloat(a));
      g.setIndex(o.geometry.index);
      g.applyMatrix4(o.matrixWorld);
      list.push({ geometry: g, glow: /glow/i.test(o.material.name) });
    });
    pieces[top.name] = list;
  }
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0.05, side: THREE.DoubleSide });
  mat.name = 'streetKit';
  const glow = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, emissive: 0xffe2b0, emissiveIntensity: 0 });
  glow.name = 'streetKitGlow';
  return { pieces, mat, glow };
}

// ------------------------------------------------------------------ murals (original procedural artwork)
const MURALS = [];

function muralTexture(style) {
  if (MURALS[style]) return MURALS[style];
  const W = 512, H = 1024;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const rnd = mulberry32(77 + style * 13);
  const R = (a, b) => a + rnd() * (b - a);
  if (style === 0) {
    // folk embroidery (шевица): red and black lozenges and stars on linen
    g.fillStyle = '#efe6d2'; g.fillRect(0, 0, W, H);
    const cell = 64;
    for (let y = 0; y < H; y += cell) {
      for (let x = 0; x < W; x += cell) {
        const cx = x + cell / 2, cy = y + cell / 2, k = ((x / cell) + (y / cell)) % 3;
        g.fillStyle = k === 0 ? '#b3121b' : k === 1 ? '#1d1a18' : '#d9481f';
        g.beginPath(); g.moveTo(cx, cy - 26); g.lineTo(cx + 26, cy); g.lineTo(cx, cy + 26); g.lineTo(cx - 26, cy); g.closePath(); g.fill();
        g.fillStyle = '#efe6d2';
        g.fillRect(cx - 7, cy - 7, 14, 14);
        g.fillStyle = k === 0 ? '#1d1a18' : '#b3121b';
        for (const [dx, dy] of [[-30, -30], [30, -30], [-30, 30], [30, 30]]) g.fillRect(cx + dx - 4, cy + dy - 4, 8, 8);
      }
    }
    g.fillStyle = '#b3121b';
    for (const y of [0, H - 40]) g.fillRect(0, y, W, 40);
  } else if (style === 1) {
    // Vitosha at sunrise over the roofs
    const gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, '#2b4c8c'); gr.addColorStop(0.45, '#f08a4b'); gr.addColorStop(0.7, '#ffd27a'); gr.addColorStop(1, '#f6e7c1');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    g.fillStyle = '#fff1b0'; g.beginPath(); g.arc(W * 0.62, H * 0.52, 70, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#3d4f7a';
    g.beginPath(); g.moveTo(0, H * 0.66); g.lineTo(W * 0.25, H * 0.56); g.lineTo(W * 0.45, H * 0.5); g.lineTo(W * 0.6, H * 0.55); g.lineTo(W * 0.8, H * 0.53); g.lineTo(W, H * 0.6); g.lineTo(W, H); g.lineTo(0, H); g.fill();
    g.fillStyle = '#26344f';
    for (let x = 0; x < W; x += 40) { const h = R(60, 190); g.fillRect(x, H - h, 34, h); }
    g.fillStyle = '#1b1b1f';
    for (let k = 0; k < 7; k++) { const x = R(40, W - 40), y = R(120, 380); g.beginPath(); g.moveTo(x - 18, y); g.quadraticCurveTo(x - 8, y - 10, x, y); g.quadraticCurveTo(x + 8, y - 10, x + 18, y); g.lineWidth = 4; g.strokeStyle = '#1b1b1f'; g.stroke(); }
  } else if (style === 2) {
    // colour blocks and circles
    g.fillStyle = '#f2efe8'; g.fillRect(0, 0, W, H);
    const cols = ['#e63946', '#f4a261', '#2a9d8f', '#264653', '#e9c46a', '#457b9d', '#ff6fa8'];
    for (let k = 0; k < 26; k++) {
      g.fillStyle = cols[k % cols.length];
      if (k % 3 === 0) { g.beginPath(); g.arc(R(0, W), R(0, H), R(40, 140), 0, Math.PI * 2); g.fill(); } else g.fillRect(R(-40, W), R(-40, H), R(60, 220), R(60, 260));
    }
  } else if (style === 3) {
    // the rose: big Bulgarian roses and leaves
    g.fillStyle = '#1f3b2d'; g.fillRect(0, 0, W, H);
    for (let k = 0; k < 9; k++) {
      const x = R(60, W - 60), y = R(80, H - 80), r = R(50, 110);
      g.fillStyle = '#3f7d3a';
      g.beginPath(); g.ellipse(x + r * 0.9, y + r * 0.3, r * 0.6, r * 0.25, 0.6, 0, Math.PI * 2); g.fill();
      for (let p = 5; p > 0; p--) {
        g.fillStyle = ['#7a0c22', '#a3142e', '#c9233f', '#e04563', '#f27a92'][p - 1];
        g.beginPath(); g.arc(x, y, r * p / 5, 0, Math.PI * 2); g.fill();
      }
    }
  } else if (style === 4) {
    // a yellow tram crossing the city at night
    const gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, '#0d1b3d'); gr.addColorStop(1, '#3a2a5a');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    for (let k = 0; k < 60; k++) { g.fillStyle = 'rgba(255,240,200,0.8)'; g.fillRect(R(0, W), R(0, H * 0.5), 2, 2); }
    g.fillStyle = '#1a1730';
    for (let x = 0; x < W; x += 46) { const h = R(200, 480); g.fillRect(x, H * 0.82 - h, 40, h); for (let y = H * 0.82 - h + 12; y < H * 0.8; y += 22) for (let wx = x + 6; wx < x + 36; wx += 12) if (rnd() < 0.5) { g.fillStyle = '#ffd77a'; g.fillRect(wx, y, 6, 10); g.fillStyle = '#1a1730'; } }
    g.fillStyle = '#f6c21c'; g.fillRect(20, H * 0.74, W - 40, 110);
    g.fillStyle = '#e8401c'; g.fillRect(20, H * 0.74 + 80, W - 40, 14);
    g.fillStyle = '#9fd3ff'; for (let x = 40; x < W - 60; x += 70) g.fillRect(x, H * 0.74 + 18, 50, 46);
    g.strokeStyle = '#d8d8d8'; g.lineWidth = 3; g.beginPath(); g.moveTo(0, H * 0.7); g.lineTo(W, H * 0.7); g.stroke();
    g.beginPath(); g.moveTo(W / 2, H * 0.74); g.lineTo(W / 2 - 40, H * 0.7); g.stroke();
  } else {
    // birds over a sky gradient
    const gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, '#9fd6e8'); gr.addColorStop(1, '#f7f1d8');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    for (let k = 0; k < 18; k++) {
      const x = R(40, W - 40), y = R(60, H - 60), s = R(20, 70);
      g.fillStyle = ['#e2574c', '#2b6cb0', '#f2b134', '#3a3a3a'][k % 4];
      g.beginPath(); g.moveTo(x - s, y); g.quadraticCurveTo(x - s / 2, y - s * 0.8, x, y); g.quadraticCurveTo(x + s / 2, y - s * 0.8, x + s, y); g.quadraticCurveTo(x, y + s * 0.3, x - s, y); g.fill();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  MURALS[style] = new THREE.MeshStandardMaterial({ map: t, roughness: 0.88 });
  return MURALS[style];
}

// pieces big enough to cast sun shadows (the rest only receive them: fewer draw calls in the shadow pass)
const SHADOWED = new Set(['gazebo', 'pergola', 'kiosk', 'parasol', 'roofPergola', 'swing', 'slide', 'climber', 'fruitStand', 'fitness']);

// ------------------------------------------------------------------ helpers
function inPoly(p, x, z) {
  let c = false;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    const xi = p[i], zi = p[i + 1], xj = p[j], zj = p[j + 1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi + 1e-12) + xi) c = !c;
  }
  return c;
}

function areaOf(p) {
  let a = 0;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) a += p[j] * p[i + 1] - p[i] * p[j + 1];
  return Math.abs(a / 2);
}

function bbox(p) {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (let i = 0; i < p.length; i += 2) { x0 = Math.min(x0, p[i]); x1 = Math.max(x1, p[i]); z0 = Math.min(z0, p[i + 1]); z1 = Math.max(z1, p[i + 1]); }
  return [x0, z0, x1, z1];
}

/**
 * "Is (x, z) within d of the route?" for many points: the route sampled every 12 m into 64 m cells (Path.nearest
 * scans the whole route for points far from it, which made placement crawl on the long lines).
 */
class RouteNear {
  constructor(route) {
    this.cells = new Map();
    for (const id of ['A', 'B']) {
      const P = route.direction(id).path;
      for (let s = 0; s <= P.length; s += 12) {
        const q = P.at(s);
        const k = `${Math.floor(q.x / 64)},${Math.floor(q.z / 64)}`;
        if (!this.cells.has(k)) this.cells.set(k, []);
        this.cells.get(k).push(q.x, q.z);
      }
    }
  }

  near(x, z, d) {
    const r = Math.ceil(d / 64), ix = Math.floor(x / 64), iz = Math.floor(z / 64), d2 = (d + 6) * (d + 6);
    for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) {
      const c = this.cells.get(`${ix + a},${iz + b}`);
      if (!c) continue;
      for (let i = 0; i < c.length; i += 2) if ((c[i] - x) ** 2 + (c[i + 1] - z) ** 2 < d2) return true;
    }
    return false;
  }
}

/** Occupied circles on a coarse grid. */
class Occ {
  constructor() { this.g = new Map(); }
  key(x, z) { return `${Math.floor(x / 8)},${Math.floor(z / 8)}`; }
  add(x, z, r) { const k = this.key(x, z); if (!this.g.has(k)) this.g.set(k, []); this.g.get(k).push([x, z, r]); }
  free(x, z, r) {
    const ix = Math.floor(x / 8), iz = Math.floor(z / 8);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      for (const [ox, oz, or] of this.g.get(`${ix + a},${iz + b}`) || []) if (Math.hypot(ox - x, oz - z) < r + or) return false;
    }
    return true;
  }
}

// ------------------------------------------------------------------ placement
export class CityExtras {
  constructor({ world, route, routeLine, kit, trees = [], signs = [], quality }) {
    this.world = world;
    this.route = route;
    this.rl = routeLine;
    this.kit = kit;
    this.signs = signs;
    this.quality = quality;
    this.items = new Map(); // tile -> piece -> matrices
    this.muralQuads = new Map(); // tile -> style -> [verts]
    this.occ = new Occ();
    for (const t of trees) this.occ.add(t.x, t.z, 1.2);
    this.routeNear = new RouteNear(route);
    this.stats = {};
  }

  put(piece, x, y, z, yaw = 0, s = 1) {
    if (!this.kit.pieces[piece]) return;
    const key = `${Math.floor(x / 256)},${Math.floor(z / 256)}`;
    if (!this.items.has(key)) this.items.set(key, new Map());
    const t = this.items.get(key);
    if (!t.has(piece)) t.set(piece, []);
    t.get(piece).push(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(s, s, s)));
    this.stats[piece] = (this.stats[piece] || 0) + 1;
  }

  /** A spot inside polygon p, clear of roads, buildings, trees and what was placed. */
  spot(p, r, rnd, tries = 40) {
    const [x0, z0, x1, z1] = bbox(p);
    const w = this.world;
    for (let k = 0; k < tries; k++) {
      const x = x0 + rnd() * (x1 - x0), z = z0 + rnd() * (z1 - z0);
      if (!inPoly(p, x, z)) continue;
      if (w.roads.onRoad(x, z, r + 0.8)) continue;
      if (w.bgrid.pointInAny(x, z) >= 0 || w.bgrid.pointInAny(x + r, z) >= 0 || w.bgrid.pointInAny(x - r, z) >= 0 || w.bgrid.pointInAny(x, z + r) >= 0 || w.bgrid.pointInAny(x, z - r) >= 0) continue;
      if (!this.occ.free(x, z, r)) continue;
      this.occ.add(x, z, r);
      return [x, z];
    }
    return null;
  }

  near(x, z, d) {
    return this.routeNear.near(x, z, d);
  }

  build() {
    const t0 = performance.now();
    const w = this.world, d = w.data, hf = w.hf;
    const rnd = mulberry32(4242);
    // playgrounds
    for (const a of d.areas) {
      if (a.type !== 'playground' || a.pts.length < 6) continue;
      const [x0, z0, x1, z1] = bbox(a.pts);
      if (!this.near((x0 + x1) / 2, (z0 + z1) / 2, 380)) continue;
      const A = areaOf(a.pts);
      const n = Math.max(2, Math.min(8, Math.round(A / 70)));
      const kinds = ['swing', 'slide', 'spring', 'sandbox', 'seesaw', 'carousel', 'spring', 'climber'];
      for (let k = 0; k < n; k++) {
        const piece = kinds[k % kinds.length];
        const r = { swing: 2.2, slide: 2.4, sandbox: 2.0, climber: 2.0, carousel: 1.4 }[piece] || 1.0;
        const p = this.spot(a.pts, r, rnd);
        if (p) this.put(piece, p[0], hf.heightAt(p[0], p[1]), p[1], rnd() * Math.PI * 2);
      }
      for (let k = 0; k < 2; k++) {
        const p = this.spot(a.pts, 1.0, rnd);
        if (p) this.put('bench', p[0], hf.heightAt(p[0], p[1]), p[1], rnd() * Math.PI * 2);
      }
    }
    // parks and gardens
    for (const a of d.areas) {
      if ((a.type !== 'park' && a.type !== 'garden') || a.pts.length < 6) continue;
      const A = areaOf(a.pts);
      if (A < 700) continue;
      const [x0, z0, x1, z1] = bbox(a.pts);
      if (!this.near((x0 + x1) / 2, (z0 + z1) / 2, 300 + Math.sqrt(A) * 0.5)) continue;
      const want = [];
      if (A > 2500) want.push(['gazebo', 3.2]);
      if (A > 12000) want.push(['gazebo', 3.2]);
      if (A > 1500) want.push(['pergola', 3.0]);
      if (A > 1000) want.push(['fountainDrink', 1.0]);
      for (let k = 0; k < Math.min(4, Math.floor(A / 2200)); k++) want.push(['flowerBed', 1.8]);
      if (A > 5000) want.push(['fitness', 3.0]);
      if (A > 3500) want.push(['pingpong', 2.6]);
      if (A > 8000) want.push(['kiosk', 2.0]);
      for (let k = 0; k < Math.min(6, Math.floor(A / 1500)); k++) want.push(['bin', 0.4]);
      for (const [piece, r] of want) {
        const p = this.spot(a.pts, r, rnd);
        if (p) this.put(piece, p[0], hf.heightAt(p[0], p[1]), p[1], rnd() * Math.PI * 2);
      }
    }
    // lanterns along the footways through parks near the route
    const green = d.areas.filter((a) => (a.type === 'park' || a.type === 'garden') && a.pts.length >= 6).map((a) => ({ pts: a.pts, bb: bbox(a.pts) }));
    const inGreen = (x, z) => green.some((a) => x >= a.bb[0] && x <= a.bb[2] && z >= a.bb[1] && z <= a.bb[3] && inPoly(a.pts, x, z));
    for (const r of d.roads) {
      if (!/footway|path|pedestrian/.test(r.cls)) continue;
      const p = r.pts;
      let acc = 11;
      for (let i = 2; i < p.length; i += 2) {
        const ax = p[i - 2], az = p[i - 1], bx = p[i], bz = p[i + 1];
        const L = Math.hypot(bx - ax, bz - az);
        for (let s = acc; s < L; s += 24) {
          const t = s / L, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
          const nx = -(bz - az) / L, nz = (bx - ax) / L;
          const lx = x + nx * 1.6, lz = z + nz * 1.6;
          if (!this.near(lx, lz, 260)) continue;
          if (!inGreen(lx, lz)) continue;
          if (w.roads.onRoad(lx, lz, 0.4) || !this.occ.free(lx, lz, 0.6)) continue;
          this.occ.add(lx, lz, 0.6);
          this.put('parkLamp', lx, hf.heightAt(lx, lz), lz, 0);
        }
        acc = (acc + 24 - (L % 24)) % 24;
      }
    }
    this.shops(rnd);
    this.roofGardens(rnd);
    this.murals(rnd);
    console.info('[city extras]', JSON.stringify(this.stats), `${(performance.now() - t0).toFixed(0)} ms`);
  }

  /** Props in front of the shops, by the kind of shop. */
  shops(rnd) {
    const w = this.world, hf = w.hf;
    for (const s of this.signs) {
      if (s.kiosk || !s.b || !this.near(s.x, s.z, 140)) continue;
      const kind = kindOf(s.text);
      const tx = -s.nz, tz = s.nx; // along the facade
      const yaw = Math.atan2(s.nx, s.nz);
      const at = (along, out) => [s.x + tx * along + s.nx * out, s.z + tz * along + s.nz * out];
      const ok = (x, z, r) => !w.roads.onRoad(x, z, r + 0.3) && w.bgrid.pointInAny(x, z) < 0 && this.occ.free(x, z, r);
      const place = (piece, along, out, r, yw = yaw) => {
        const [x, z] = at(along, out);
        if (!ok(x, z, r)) return false;
        this.occ.add(x, z, r);
        this.put(piece, x, hf.heightAt(x, z), z, yw);
        return true;
      };
      const flor = /цвет|flower|florist|флорист/i.test(s.text);
      const bank = /банк|bank|дск|dsk|обб|ubb|fibank|юробанк|postbank|unicredit|уникредит/i.test(s.text);
      if (kind === 'cafe' || kind === 'bakery') {
        const n = kind === 'cafe' ? 3 : 1;
        for (let k = 0; k < n; k++) {
          const al = (k - (n - 1) / 2) * 2.6;
          if (place(rnd() < 0.5 ? 'cafeSet4' : 'cafeSet2', al, 2.1, 1.0, yaw + (rnd() - 0.5) * 0.4) && kind === 'cafe' && k !== 1) place('parasol', al, 2.1, 0.2, yaw);
        }
        place('aBoard', s.w / 2 + 0.8, 0.9, 0.4, yaw + Math.PI / 2);
      } else if (flor) {
        place('flowerBuckets', 0, 1.0, 1.2, yaw);
      } else if (kind === 'grocery') {
        if (rnd() < 0.55) place('fruitStand', -s.w / 4, 1.3, 1.1, yaw);
        if (rnd() < 0.35) place('freezer', s.w / 3, 0.75, 0.8, yaw);
      } else if (kind === 'pharmacy') {
        const [x, z] = at(s.w / 2 + 0.4, 0.02);
        if (!this.occ.free(x, z, 3.0)) continue; // one per pharmacy (some have two signs)
        this.occ.add(x, z, 0.3);
        this.put('pharmacyCross', x, (s.b._base ?? hf.heightAt(x, z)) + 3.3, z, yaw);
      } else if (kind === 'office' && bank) {
        const [x, z] = at(s.w / 2 + 0.9, 0.0);
        if (!this.occ.free(x, z, 3.0)) continue; // one per bank front
        this.occ.add(x, z, 0.5);
        this.put('atm', x, s.b._base ?? hf.heightAt(x, z), z, yaw);
      } else if (rnd() < 0.45) {
        place('aBoard', s.w / 2 + 0.7, 0.9, 0.4, yaw + Math.PI / 2);
        if (rnd() < 0.4) { place('planterBox', -s.w / 2 - 0.5, 0.45, 0.4); place('planterBox', s.w / 2 + 0.5, 0.45, 0.4); }
      }
    }
  }

  /** Planters, a pergola and deck chairs on some flat roofs of low modern buildings near the route. */
  roofGardens(rnd) {
    const w = this.world, d = w.data, hf = w.hf;
    for (const b of d.buildings) {
      if (!b.pts || b.pts.length < 8 || b.roof !== 'flat' || b.minH > 0 || b.h < 6 || b.h > 32) continue;
      const [x0, z0, x1, z1] = bbox(b.pts);
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      if (!this.near(cx, cz, 160)) continue;
      const A = areaOf(b.pts);
      if (A < 140 || A > 1600) continue;
      const h = Math.abs(Math.sin(b.id * 12.9898) * 43758.5453) % 1;
      if (h > 0.16) continue;
      let sum = 0;
      for (let i = 0; i < b.pts.length; i += 2) sum += hf.heightAt(b.pts[i], b.pts[i + 1]);
      const top = sum / (b.pts.length / 2) + b.h + 0.05;
      const local = mulberry32(b.id);
      const P = b.pts;
      const inner = (x, z) => inPoly(P, x, z) && inPoly(P, x + 2.2, z) && inPoly(P, x - 2.2, z) && inPoly(P, x, z + 2.2) && inPoly(P, x, z - 2.2);
      const e0 = Math.atan2(P[3] - P[1], P[2] - P[0]);
      let n = 0;
      for (let k = 0; k < 30 && n < 5; k++) {
        const x = x0 + local() * (x1 - x0), z = z0 + local() * (z1 - z0);
        if (!inner(x, z)) continue;
        const piece = n === 0 ? 'roofPergola' : n < 3 ? 'roofPlanter' : 'deckChair';
        this.put(piece, x, top, z, -e0 + (n > 2 ? local() * 0.8 : 0));
        n++;
      }
    }
  }

  /** Murals on blank gable walls of tall slab blocks near the route. */
  murals(rnd) {
    const w = this.world, d = w.data, hf = w.hf;
    for (const b of d.buildings) {
      if (!b.pts || b.pts.length < 8 || b.pts.length > 14 || b.h < 14 || b.minH > 0 || b.landmark) continue;
      const P = b.pts, n = P.length / 2;
      const edges = [];
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const ax = P[2 * i], az = P[2 * i + 1], bx = P[2 * j], bz = P[2 * j + 1];
        edges.push({ ax, az, bx, bz, L: Math.hypot(bx - ax, bz - az) });
      }
      const long = Math.max(...edges.map((e) => e.L));
      const [x0, z0, x1, z1] = bbox(P);
      if (!this.near((x0 + x1) / 2, (z0 + z1) / 2, 220)) continue;
      const hsh = Math.abs(Math.sin(b.id * 78.233) * 43758.5453) % 1;
      if (hsh > 0.33) continue;
      // the gable: a short wall (8-18 m) of a long slab (at least 2.2 x as long)
      const cands = edges.filter((e) => e.L >= 8 && e.L <= 18 && long >= 2.2 * e.L);
      if (!cands.length) continue;
      let sum = 0;
      for (let i = 0; i < P.length; i += 2) sum += hf.heightAt(P[i], P[i + 1]);
      const base = sum / n;
      // the gable facing the route most
      const mid = (e) => [(e.ax + e.bx) / 2, (e.az + e.bz) / 2];
      cands.sort((a, c) => this.rl.nearest(...mid(a)).d - this.rl.nearest(...mid(c)).d);
      const e = cands[0];
      const [mx, mz] = mid(e);
      const tx = (e.bx - e.ax) / e.L, tz = (e.bz - e.az) / e.L;
      // outward: the side away from the footprint's centre
      let nx = -tz, nz = tx;
      const ccx = (x0 + x1) / 2, ccz = (z0 + z1) / 2;
      if ((mx - ccx) * nx + (mz - ccz) * nz < 0) { nx = -nx; nz = -nz; }
      if (w.bgrid.pointInAny(mx + nx * 4, mz + nz * 4) >= 0) continue; // a neighbour stands against it
      const style = Math.floor(hsh * 100) % 6;
      const inset = 0.9, y0 = base + 3.0, y1 = base + b.h - 1.2;
      const ox = nx * 0.07, oz = nz * 0.07;
      const ax = e.ax + tx * inset + ox, az = e.az + tz * inset + oz, bx = e.bx - tx * inset + ox, bz = e.bz - tz * inset + oz;
      // facing out: (a, b, b', a') wound so the normal is (nx, nz)
      const quad = [[ax, y0, az], [bx, y0, bz], [bx, y1, bz], [ax, y1, az]];
      const ux = quad[1][0] - quad[0][0], uz = quad[1][2] - quad[0][2];
      const flip = ux * nz - uz * nx < 0; // the quad's normal is (-uz, ux): turn it round if it faces in
      const key = `${Math.floor(mx / 256)},${Math.floor(mz / 256)}`;
      if (!this.muralQuads.has(key)) this.muralQuads.set(key, new Map());
      const t = this.muralQuads.get(key);
      if (!t.has(style)) t.set(style, []);
      t.get(style).push({ quad: flip ? [quad[1], quad[0], quad[3], quad[2]] : quad });
      this.stats.mural = (this.stats.mural || 0) + 1;
    }
  }

  /** Groups to add to the world tiles ('cextra:tx,tz', 'mural:tx,tz'). */
  groups() {
    const out = [];
    for (const [key, pieces] of this.items) {
      const g = new THREE.Group();
      g.name = `cextra:${key}`;
      for (const [piece, ms] of pieces) {
        for (const part of this.kit.pieces[piece]) {
          const im = new THREE.InstancedMesh(part.geometry, part.glow ? this.kit.glow : this.kit.mat, ms.length);
          ms.forEach((m, i) => im.setMatrixAt(i, m));
          im.instanceMatrix.needsUpdate = true;
          im.computeBoundingSphere();
          im.castShadow = !part.glow && SHADOWED.has(piece);
          im.receiveShadow = true;
          im.matrixAutoUpdate = false;
          im.name = `kit_${piece}`;
          g.add(im);
        }
      }
      out.push(g);
    }
    for (const [key, styles] of this.muralQuads) {
      const g = new THREE.Group();
      g.name = `mural:${key}`;
      for (const [style, list] of styles) {
        const pos = [], uv = [], idx = [];
        for (const { quad } of list) {
          const b = pos.length / 3;
          for (const p of quad) pos.push(...p);
          uv.push(0, 0, 1, 0, 1, 1, 0, 1);
          idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
        geo.setIndex(idx);
        geo.computeVertexNormals();
        const m = new THREE.Mesh(geo, muralTexture(style));
        m.receiveShadow = true;
        m.matrixAutoUpdate = false;
        g.add(m);
      }
      out.push(g);
    }
    return out;
  }

  setNight(n) {
    this.kit.glow.emissiveIntensity = n > 0.3 ? 1.8 : 0;
  }
}
