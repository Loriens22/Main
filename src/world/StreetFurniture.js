// Street furniture: lamps (with night light pools), traffic-signal heads,
// benches, bins, recycling bells, waste containers, bollards, hydrants,
// fences/walls/hedges, parked cars, and the Route 280 bus stops (shelters,
// stop poles with name/code plates, real-time departure boards).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry32, hash2 } from '../core/rng.js';
import { carAssets, carPaint } from './CarModels.js';

function clean(g) {
  g = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  return g;
}
const T = (g, x, y, z) => (g.translate(x, y, z), g);
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (r1, r2, h, s = 8) => new THREE.CylinderGeometry(r1, r2, h, s);

/** Instanced prop type built from {material: [geometries]} in local space. */
class PropType {
  constructor(parts, mats) {
    this.parts = Object.entries(parts).map(([mk, geos]) => ({ geo: mergeGeometries(geos.map(clean)), mat: mats[mk], mk }));
    this.items = [];
  }

  add(x, y, z, yaw = 0, s = 1) {
    this.items.push([x, y, z, yaw, s]);
  }

  meshes(name) {
    if (!this.items.length) return [];
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    // split per 256 m tile for culling
    const tiles = new Map();
    for (const it of this.items) {
      const k = `${Math.floor(it[0] / 256)},${Math.floor(it[2] / 256)}`;
      let a = tiles.get(k);
      if (!a) tiles.set(k, (a = []));
      a.push(it);
    }
    const out = [];
    for (const [k, items] of tiles) {
      const g = new THREE.Group();
      g.name = `${name}:${k}`;
      for (const p of this.parts) {
        const im = new THREE.InstancedMesh(p.geo, p.mat, items.length);
        items.forEach(([x, y, z, yaw, s], i) => {
          Q.setFromAxisAngle(up, yaw);
          im.setMatrixAt(i, M.compose(P.set(x, y, z), Q, S.set(s, s, s)));
        });
        im.castShadow = p.mk !== 'glow' && p.mk !== 'lens';
        im.receiveShadow = true;
        im.name = p.mk;
        im.computeBoundingSphere();
        g.add(im);
      }
      out.push(g);
    }
    return out;
  }
}

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,214,150,1)');
  grd.addColorStop(0.4, 'rgba(255,190,120,0.45)');
  grd.addColorStop(1, 'rgba(255,170,90,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function textTexture(lines, w = 512, h = 96, bg = '#0b2f6b', fg = '#ffffff') {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.fillStyle = fg;
  g.textBaseline = 'middle';
  lines.forEach((ln, i) => {
    let size = ln.size || 40;
    g.font = `${ln.weight || 700} ${size}px Roboto, Arial, sans-serif`;
    while (g.measureText(ln.text).width > w - 24 && size > 12) {
      size -= 2;
      g.font = `${ln.weight || 700} ${size}px Roboto, Arial, sans-serif`;
    }
    g.fillStyle = ln.color || fg;
    g.textAlign = ln.align || 'left';
    g.fillText(ln.text, ln.align === 'center' ? w / 2 : ln.align === 'right' ? w - 12 : 14, ln.y ?? ((i + 0.5) * h) / lines.length);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function adTexture(seed) {
  // generic city / nature posters (no third-party brands)
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 384;
  const g = c.getContext('2d');
  const r = mulberry32(seed);
  const themes = [
    ['#1d5e8c', '#7fb8d8', 'Витоша', 'Природен парк'], ['#3a7d34', '#a7d48a', 'Борисова градина', 'Зелена София'],
    ['#8c2f1d', '#e8a87c', 'Театър', 'Сезон 2026/27'], ['#2d2d6b', '#9c8be0', 'Музика в парка', 'Всеки петък'],
    ['#0f6b5e', '#7fd8c4', 'Карай колело', 'Велоалеи в София'],
  ];
  const th = themes[Math.floor(r() * themes.length)];
  const grd = g.createLinearGradient(0, 0, 0, 384);
  grd.addColorStop(0, th[1]);
  grd.addColorStop(1, th[0]);
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 384);
  g.fillStyle = 'rgba(255,255,255,0.18)';
  g.beginPath();
  g.moveTo(0, 300);
  for (let x = 0; x <= 256; x += 16) g.lineTo(x, 230 - Math.sin(x * 0.03 + r() * 3) * 40 - r() * 20);
  g.lineTo(256, 384);
  g.lineTo(0, 384);
  g.fill();
  g.fillStyle = '#fff';
  g.font = 'bold 34px Roboto, Arial';
  g.textAlign = 'center';
  g.fillText(th[2], 128, 80);
  g.font = '22px Roboto, Arial';
  g.fillText(th[3], 128, 116);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class StreetFurniture {
  constructor({ scene, world, route, quality }) {
    this.scene = scene;
    this.world = world;
    this.route = route;
    this.quality = quality;
    this.night = { value: 0 };
    const S = THREE.MeshStandardMaterial;
    this.mats = {
      metal: new S({ color: 0x4d5357, roughness: 0.45, metalness: 0.7 }),
      darkMetal: new S({ color: 0x23272a, roughness: 0.5, metalness: 0.6 }),
      green: new S({ color: 0x2e5a3c, roughness: 0.6, metalness: 0.3 }),
      wood: new S({ color: 0x7a5636, roughness: 0.8 }),
      concrete: new S({ color: 0xa9a7a2, roughness: 0.9 }),
      plastic: new S({ color: 0x3a4a3f, roughness: 0.6 }),
      yellow: new S({ color: 0xe8c22a, roughness: 0.5 }),
      blue: new S({ color: 0x2e6fb8, roughness: 0.5 }),
      red: new S({ color: 0xb02020, roughness: 0.5 }),
      white: new S({ color: 0xeeeeea, roughness: 0.6 }),
      glass: new THREE.MeshPhysicalMaterial({ color: 0xc8dde6, roughness: 0.14, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }),
      lens: new S({ color: 0xfff2d8, emissive: 0xffd9a0, emissiveIntensity: 0, roughness: 0.3 }),
      hedge: new S({ color: 0x35582e, roughness: 0.95 }),
      plaster: new S({ color: 0xcfc6b5, roughness: 0.9 }),
      fence: new S({ color: 0x3d4a3f, roughness: 0.6, metalness: 0.4 }),
    };
    this.glowMat = new THREE.MeshBasicMaterial({ map: glowTexture(), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
    this.groups = [];
  }

  y(x, z) {
    return this.world.hf.heightAt(x, z);
  }

  /** Point on the kerb-side of a sidewalk: returns {x,z,dir:[dx,dz],out:[nx,nz]} near (x,z). */
  kerbFrame(x, z) {
    const q = this.world.roads.query(x, z, 25, (p) => !p.minor);
    if (!q) return null;
    const p = q.piece;
    const px = p.pts[q.i] + (p.pts[q.i + 2] - p.pts[q.i]) * q.t, pz = p.pts[q.i + 1] + (p.pts[q.i + 3] - p.pts[q.i + 1]) * q.t;
    let nx = x - px, nz = z - pz;
    const l = Math.hypot(nx, nz) || 1;
    nx /= l; nz /= l;
    return { cx: px, cz: pz, dir: q.dir, out: [nx, nz], hw: p.hw, piece: p, d: q.d };
  }

  build() {
    const out = [];
    out.push(...this.buildLamps());
    out.push(...this.buildSmallProps());
    out.push(...this.buildSignals());
    out.push(...this.buildLines());
    out.push(...this.buildParkedCars());
    out.push(...this.buildStops());
    return out;
  }

  buildLamps() {
    const m = this.mats;
    const tall = new PropType({
      metal: [T(cyl(0.07, 0.13, 10), 0, 5, 0), T(box(0.07, 0.07, 2.2), 0, 9.9, -1.1)],
      darkMetal: [T(box(0.34, 0.12, 0.7), 0, 9.86, -2.2)],
      lens: [T(box(0.28, 0.02, 0.6), 0, 9.79, -2.2)],
      concrete: [T(cyl(0.22, 0.25, 0.4), 0, 0.2, 0)],
    }, m);
    const small = new PropType({
      metal: [T(cyl(0.05, 0.09, 7), 0, 3.5, 0), T(box(0.05, 0.05, 1.2), 0, 6.95, -0.6)],
      darkMetal: [T(box(0.28, 0.1, 0.5), 0, 6.9, -1.2)],
      lens: [T(box(0.22, 0.02, 0.42), 0, 6.84, -1.2)],
    }, m);
    const glow = new PropType({ glow: [T(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), 0, 0, 0)] }, { glow: this.glowMat });
    const placed = [];
    const near = (x, z, r) => placed.some(([a, b]) => Math.abs(a - x) < r && Math.abs(b - z) < r);
    // OSM lamps first
    const L = this.world.data.props.lamp || [];
    for (let i = 0; i < L.length; i += 3) {
      const x = L[i] / 10, z = L[i + 1] / 10;
      const k = this.kerbFrame(x, z);
      if (!k) continue;
      const yaw = Math.atan2(k.out[0], k.out[1]); // arm (-z) points towards the road
      const bigRoad = k.hw > 4.5;
      (bigRoad ? tall : small).add(x, this.y(x, z), z, yaw);
      placed.push([x, z]);
      const gx = x - k.out[0] * (bigRoad ? 2.2 : 1.2), gz = z - k.out[1] * (bigRoad ? 2.2 : 1.2);
      glow.add(gx, this.y(gx, gz) + 0.12, gz, 0, bigRoad ? 16 : 11);
    }
    // generated lamps along pavements
    for (const sw of this.world.roadBuilder.sidewalkInfo) {
      const p = sw.piece;
      if (['service', 'unknown', 'living_street'].includes(p.cls)) continue;
      const spacing = p.hw > 4.5 ? 32 : 36;
      const pts = sw.pts;
      let acc = hash2(p.id, sw.side > 0 ? 3 : 4) * spacing;
      for (let i = 0; i < pts.length - 2; i += 2) {
        acc += Math.hypot(pts[i + 2] - pts[i], pts[i + 3] - pts[i + 1]);
        if (acc < spacing) continue;
        acc = 0;
        // two-way roads: lamps on one side only (alternating), boulevards both sides
        if (!p.oneway && p.hw < 6 && sw.side < 0) continue;
        const k = this.kerbFrame(pts[i], pts[i + 1]);
        if (!k) continue;
        const x = k.cx + k.out[0] * (k.hw + 0.55), z = k.cz + k.out[1] * (k.hw + 0.55);
        if (near(x, z, 14) || this.world.bgrid.pointInAny(x, z) >= 0) continue;
        const bigRoad = k.hw > 4.5;
        const yaw = Math.atan2(k.out[0], k.out[1]);
        (bigRoad ? tall : small).add(x, this.y(x, z), z, yaw);
        placed.push([x, z]);
        const gx = x - k.out[0] * (bigRoad ? 2.2 : 1.2), gz = z - k.out[1] * (bigRoad ? 2.2 : 1.2);
        glow.add(gx, this.y(gx, gz) + 0.12, gz, 0, bigRoad ? 16 : 11);
      }
    }
    this.lampCount = placed.length;
    this.polePositions = placed;
    return [...tall.meshes('lampsT'), ...small.meshes('lampsS'), ...glow.meshes('glow')];
  }

  buildSmallProps() {
    const m = this.mats;
    const P = this.world.data.props;
    const types = {
      bench: new PropType({
        wood: [T(box(1.8, 0.05, 0.12), 0, 0.45, -0.12), T(box(1.8, 0.05, 0.12), 0, 0.45, 0.02), T(box(1.8, 0.05, 0.12), 0, 0.45, 0.16), T(box(1.8, 0.12, 0.04), 0, 0.72, 0.24)],
        darkMetal: [T(box(0.06, 0.45, 0.5), -0.75, 0.22, 0.05), T(box(0.06, 0.45, 0.5), 0.75, 0.22, 0.05)],
      }, m),
      bin: new PropType({ darkMetal: [T(cyl(0.22, 0.2, 0.8, 10), 0, 0.4, 0)], metal: [T(cyl(0.035, 0.035, 0.5), 0, 0.25, 0.25)] }, m),
      recycling: new PropType({ green: [T(new THREE.SphereGeometry(0.75, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0, 0.15, 0), T(cyl(0.75, 0.75, 0.3, 12), 0, 0.15, 0)] }, m),
      container: new PropType({ plastic: [T(box(1.35, 1.1, 1.05), 0, 0.65, 0)], darkMetal: [T(box(1.4, 0.06, 1.1), 0, 1.22, 0)] }, m),
      bollard: new PropType({ darkMetal: [T(cyl(0.07, 0.07, 0.9, 8), 0, 0.45, 0)] }, m),
      hydrant: new PropType({ red: [T(cyl(0.12, 0.12, 0.8, 10), 0, 0.4, 0), T(new THREE.SphereGeometry(0.13, 8, 6), 0, 0.82, 0)] }, m),
    };
    const colors = { recycling: [m.yellow, m.blue, m.green] };
    void colors;
    for (const [key, type] of Object.entries(types)) {
      const arr = P[key] || [];
      for (let i = 0; i < arr.length; i += 3) {
        const x = arr[i] / 10, z = arr[i + 1] / 10;
        let yaw = hash2(i, 5) * Math.PI * 2;
        if (key === 'bench') {
          const k = this.kerbFrame(x, z);
          if (k) yaw = Math.atan2(k.out[0], k.out[1]);
        }
        type.add(x, this.y(x, z), z, yaw);
      }
    }
    return Object.entries(types).flatMap(([k, t]) => t.meshes(k));
  }

  buildSignals() {
    const m = this.mats;
    const pole = new PropType({
      darkMetal: [T(cyl(0.07, 0.08, 3.6), 0, 1.8, 0), T(box(0.32, 0.95, 0.22), 0, 3.0, 0)],
    }, m);
    // lenses: one instanced mesh, colour updated per signal state
    this.signalLenses = [];
    for (const n of this.world.roads.nodes.values()) {
      if (!n.signal || !n.sorted) continue;
      for (const e of n.sorted) {
        const p = e.piece;
        if (p.minor) continue;
        const incoming = p.oneway ? !e.atStart : true;
        if (!incoming) continue;
        const t = (e.trim || 6) + 1.0;
        const lx = e.d[1], lz = -e.d[0];
        const x = n.x + e.d[0] * t + lx * (p.hw + 0.8), z = n.z + e.d[1] * t + lz * (p.hw + 0.8);
        if (this.world.bgrid.pointInAny(x, z) >= 0) continue;
        const yaw = Math.atan2(-e.d[0], -e.d[1]) + Math.PI; // head faces approaching traffic (+d)
        const y = this.y(x, z);
        pole.add(x, y, z, yaw);
        // lens positions (local: head centre at (0, 3.0, -0.12), lenses on its +z?) faces +d
        for (let li = 0; li < 3; li++) {
          const ly = 3.3 - li * 0.3;
          const off = 0.125;
          this.signalLenses.push({ node: n, end: e, light: li, x: x + e.d[0] * off, y: y + ly, z: z + e.d[1] * off });
        }
      }
    }
    const lensGeo = new THREE.CircleGeometry(0.1, 12);
    const lensMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    const im = new THREE.InstancedMesh(lensGeo, lensMat, Math.max(1, this.signalLenses.length));
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), S = new THREE.Vector3(1, 1, 1), Pv = new THREE.Vector3();
    this.signalLenses.forEach((l, i) => {
      const yaw = Math.atan2(l.end.d[0], l.end.d[1]);
      Q.setFromAxisAngle(up, yaw);
      Pv.set(l.x, l.y, l.z);
      im.setMatrixAt(i, M.compose(Pv, Q, S));
      im.setColorAt(i, new THREE.Color(0x111111));
    });
    im.count = this.signalLenses.length;
    im.frustumCulled = false;
    this.signalMesh = im;
    const g = new THREE.Group();
    g.name = 'signalLenses';
    g.add(im);
    return [...pole.meshes('signals'), g];
  }

  /** Called by the traffic signal controller. */
  updateSignals(stateOf) {
    if (!this.signalMesh) return;
    const C = new THREE.Color();
    const on = [new THREE.Color(4, 0.25, 0.15), new THREE.Color(4, 2.4, 0.2), new THREE.Color(0.3, 4, 1.2)];
    const off = new THREE.Color(0.06, 0.06, 0.05);
    this.signalLenses.forEach((l, i) => {
      const s = stateOf(l.node, l.end);
      const lit = (s === 'R' && l.light === 0) || (s === 'Y' && l.light === 1) || (s === 'RY' && l.light < 2) || (s === 'G' && l.light === 2);
      C.copy(lit ? on[l.light] : off);
      this.signalMesh.setColorAt(i, C);
    });
    this.signalMesh.instanceColor.needsUpdate = true;
  }

  buildLines() {
    const m = this.mats;
    const out = [];
    const L = this.world.data.lines;
    const make = (lines, h, mat, thick) => {
      const geos = [];
      for (const p of lines) {
        for (let i = 0; i < p.length - 2; i += 2) {
          const ax = p[i], az = p[i + 1], bx = p[i + 2], bz = p[i + 3];
          const len = Math.hypot(bx - ax, bz - az);
          if (len < 0.3) continue;
          const g = box(thick, h, len);
          g.rotateY(Math.atan2(bx - ax, bz - az));
          const cx = (ax + bx) / 2, cz = (az + bz) / 2;
          g.translate(cx, this.y(cx, cz) + h / 2 - 0.05, cz);
          geos.push(clean(g));
        }
      }
      if (!geos.length) return;
      // chunk to keep bounding spheres useful
      for (let i = 0; i < geos.length; i += 400) {
        const mesh = new THREE.Mesh(mergeGeometries(geos.slice(i, i + 400)), mat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        const gg = new THREE.Group();
        mesh.geometry.computeBoundingSphere();
        const c = mesh.geometry.boundingSphere.center;
        gg.name = `lines:${Math.floor(c.x / 256)},${Math.floor(c.z / 256)}`;
        gg.add(mesh);
        out.push(gg);
      }
    };
    make(L.fence || [], 1.6, m.fence, 0.05);
    make(L.wall || [], 1.9, m.plaster, 0.25);
    make(L.retaining_wall || [], 1.2, m.concrete, 0.3);
    make(L.hedge || [], 1.2, m.hedge, 0.8);
    make(L.guard_rail || [], 0.75, m.metal, 0.08);
    return out;
  }

  buildParkedCars() {
    const { types, bodyMat, trimMat } = carAssets();
    const rand = mulberry32(2026);
    const items = types.map(() => []);
    const route = this.routeLine;
    const stops = this.route ? Object.values(this.route.dirs).flatMap((d) => d.stops) : [];
    for (const p of this.world.roads.pieces) {
      if (!['residential', 'unclassified', 'service', 'living_street'].includes(p.cls) || p.driveway) continue;
      if (p.len < 14) continue;
      const mx = p.pts[Math.floor(p.pts.length / 4) * 2], mz = p.pts[Math.floor(p.pts.length / 4) * 2 + 1];
      if (route) {
        const n = route.nearest(mx, mz);
        if (n.d < 4) continue; // never block the bus route
        if (n.d > 380) continue;
      }
      const pts = p.pts;
      for (const side of p.oneway ? [1] : [1, -1]) {
        let acc = 0;
        let sAcc = 0;
        for (let i = 0; i < pts.length - 2; i += 2) {
          const ax = pts[i], az = pts[i + 1], bx = pts[i + 2], bz = pts[i + 3];
          const len = Math.hypot(bx - ax, bz - az);
          const dx = (bx - ax) / len, dz = (bz - az) / len;
          for (let t = 0; t < len; t += 0.5) {
            acc += 0.5;
            sAcc += 0.5;
            if (acc < 5.8) continue;
            acc = 0;
            if (sAcc < (p.trimA || 0) + 8 || sAcc > p.len - (p.trimB || 0) - 8) continue;
            if (rand() > 0.5) continue;
            const off = Math.max(1.0, p.hw - 0.95);
            const x = ax + dx * t + dz * side * off, z = az + dz * t - dx * side * off;
            if (stops.some((s) => Math.abs(s.pole[0] - x) < 30 && Math.abs(s.pole[1] - z) < 30)) continue;
            if (this.world.bgrid.pointInAny(x, z) >= 0) continue;
            const ti = Math.floor(rand() * (types.length - 0.4));
            const yaw = Math.atan2(-dx, -dz) + (side < 0 ? Math.PI : 0);
            items[ti].push([x, this.y(x, z), z, yaw, carPaint(rand, rand() < 0.04)]);
          }
        }
      }
    }
    this.parkedBoxes = [];
    const out = [];
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);
    types.forEach((t, ti) => {
      const list = items[ti];
      const tiles = new Map();
      for (const it of list) {
        const k = `${Math.floor(it[0] / 256)},${Math.floor(it[2] / 256)}`;
        let a = tiles.get(k);
        if (!a) tiles.set(k, (a = []));
        a.push(it);
        this.parkedBoxes.push({ x: it[0], z: it[2], yaw: it[3], hl: t.L / 2, hw: t.W / 2 });
      }
      for (const [k, arr] of tiles) {
        const g = new THREE.Group();
        g.name = `parked:${k}`;
        const b = new THREE.InstancedMesh(t.geo.body, bodyMat, arr.length);
        const tr = new THREE.InstancedMesh(t.geo.trim, trimMat, arr.length);
        arr.forEach(([x, y, z, yaw, col], i) => {
          Q.setFromAxisAngle(up, yaw);
          M.compose(P.set(x, y, z), Q, S);
          b.setMatrixAt(i, M);
          tr.setMatrixAt(i, M);
          b.setColorAt(i, col);
        });
        b.castShadow = tr.castShadow = true;
        b.receiveShadow = true;
        b.computeBoundingSphere();
        tr.computeBoundingSphere();
        g.add(b, tr);
        out.push(g);
      }
    });
    return out;
  }

  /** Route 280 stops: shelters (where mapped), stop poles and boards. */
  buildStops() {
    const m = this.mats;
    const out = [];
    const seen = new Set();
    const shelterParts = {
      darkMetal: [T(box(0.08, 2.5, 0.08), -2.1, 1.25, -0.65), T(box(0.08, 2.5, 0.08), 2.1, 1.25, -0.65), T(box(0.08, 2.5, 0.08), -2.1, 1.25, 0.65), T(box(0.08, 2.5, 0.08), 2.1, 1.25, 0.65),
        T(box(4.5, 0.12, 1.75), 0, 2.56, 0), T(box(4.4, 0.06, 0.06), 0, 0.1, 0.68)],
      white: [T(box(4.3, 0.02, 1.6), 0, 2.49, 0)],
      metal: [T(box(2.0, 0.05, 0.38), 0.4, 0.46, 0.42), T(box(0.05, 0.45, 0.3), -0.55, 0.23, 0.42), T(box(0.05, 0.45, 0.3), 1.35, 0.23, 0.42)],
    };
    const shelterGeo = Object.fromEntries(Object.entries(shelterParts).map(([k, v]) => [k, mergeGeometries(v.map(clean))]));
    const glassGeo = mergeGeometries([T(box(4.1, 2.0, 0.02), 0, 1.35, 0.64), T(box(0.02, 2.0, 1.2), -2.08, 1.35, 0.0)].map(clean));
    const add = (geo, mat, mx, cast = true) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.applyMatrix4(mx);
      mesh.castShadow = cast;
      mesh.receiveShadow = true;
      return mesh;
    };
    this.stopObjects = [];
    for (const dir of Object.values(this.route.dirs)) {
      for (const st of dir.stops) {
        if (seen.has(st.code)) continue;
        seen.add(st.code);
        const [px, pz] = st.pole;
        const k = this.kerbFrame(px, pz);
        if (!k) continue;
        // orientation: the travel direction of this stop's direction
        const near = dir.path.nearest(px, pz);
        const tg = dir.path.tangent(near.s, 5);
        const fx = tg.tx, fz = tg.tz; // travel direction
        const ox = -fz * -1, oz = fx * -1; // away from road = right of travel => (-tz, tx)
        const rx = -fz, rz = fx;
        void ox; void oz;
        const kerb = Math.max(k.hw + 0.3, near.d);
        const baseX = near.d >= 0 ? dir.path.at(near.s).x : px, baseZ = dir.path.at(near.s).z;
        const g = new THREE.Group();
        g.name = `stop:${Math.floor(px / 256)},${Math.floor(pz / 256)}`;
        // stop pole at the kerb + 0.6 m (position of the OSM node, clamped to the pavement)
        const poleOff = Math.max(kerb + 0.6, near.d);
        const polX = baseX + rx * poleOff, polZ = baseZ + rz * poleOff;
        const yaw = Math.atan2(-fx, -fz);
        const py = this.y(polX, polZ);
        const pole = new THREE.Mesh(cyl(0.04, 0.045, 3.2, 8), m.metal);
        pole.position.set(polX, py + 1.6, polZ);
        g.add(pole);
        const plateTex = textTexture([
          { text: 'А  СПИРКА', size: 34, align: 'center', y: 34, color: '#0b2f6b' },
          { text: st.name, size: 26, align: 'center', y: 86, color: '#111' },
          { text: `${st.code}`, size: 30, align: 'center', y: 128, color: '#0b2f6b' },
          { text: '280', size: 34, align: 'center', y: 172, color: '#c8102e' },
        ], 256, 200, '#f4f4f0', '#111');
        const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.43), new THREE.MeshStandardMaterial({ map: plateTex, roughness: 0.6, side: THREE.DoubleSide }));
        plate.position.set(polX, py + 2.85, polZ);
        plate.rotation.y = yaw + Math.PI / 2;
        g.add(plate);
        // shelter
        if (st.shelter) {
          const sOff = Math.max(kerb + 1.55, poleOff + 0.6);
          const sx = baseX + rx * sOff - fx * 4.5, sz = baseZ + rz * sOff - fz * 4.5;
          const sy = this.y(sx, sz) + Math.max(0, this.y(baseX + rx * kerb, baseZ + rz * kerb) + 0.22 - this.y(sx, sz));
          // local frame: x along the road (travel dir), +z away from the road
          const mx = new THREE.Matrix4().makeBasis(new THREE.Vector3(fx, 0, fz), new THREE.Vector3(0, 1, 0), new THREE.Vector3(rx, 0, rz)).setPosition(sx, sy, sz);
          for (const [k2, geo] of Object.entries(shelterGeo)) g.add(add(geo, m[k2], mx));
          g.add(add(glassGeo, m.glass, mx, false));
          // ad light box at the trailing end
          const ad = new THREE.Mesh(box(0.14, 1.8, 1.25), [m.darkMetal, m.darkMetal, m.darkMetal, m.darkMetal,
            new THREE.MeshStandardMaterial({ map: adTexture(Number(st.code)), emissive: 0xffffff, emissiveMap: adTexture(Number(st.code)), emissiveIntensity: 0.25 }),
            new THREE.MeshStandardMaterial({ map: adTexture(Number(st.code) + 7), emissive: 0xffffff, emissiveMap: adTexture(Number(st.code) + 7), emissiveIntensity: 0.25 })]);
          ad.position.set(2.32, 1.35, 0.05);
          ad.rotation.y = Math.PI / 2;
          ad.applyMatrix4(mx);
          ad.castShadow = true;
          g.add(ad);
          this.adMats = (this.adMats || []).concat([ad.material[4], ad.material[5]]);
          // name board on the roof edge
          const nameTex = textTexture([{ text: st.name, size: 44, y: 34 }, { text: `${st.code} · 280`, size: 28, y: 78, color: '#ffd28a' }], 512, 96);
          const nb = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.48), new THREE.MeshStandardMaterial({ map: nameTex, roughness: 0.5, side: THREE.DoubleSide }));
          nb.position.set(0, 2.9, -0.85);
          nb.rotation.y = Math.PI;
          nb.applyMatrix4(mx);
          g.add(nb);
          // real-time departures LED board (mapped as departures_board=realtime)
          if (st.departuresBoard) {
            const dep = this.departureBoard(st);
            dep.position.set(-1.4, 2.2, 0.55);
            dep.applyMatrix4(mx);
            g.add(dep);
          }
          this.stopObjects.push({ code: st.code, shelter: [sx, sy, sz], dir: [fx, fz], out: [rx, rz] });
        } else this.stopObjects.push({ code: st.code, shelter: null, dir: [fx, fz], out: [rx, rz], pole: [polX, polZ] });
        out.push(g);
      }
    }
    return out;
  }

  departureBoard(st) {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 96;
    const g = c.getContext('2d');
    g.fillStyle = '#050505';
    g.fillRect(0, 0, 256, 96);
    g.fillStyle = '#ffae1a';
    g.font = 'bold 26px "Arial Narrow", Arial';
    g.fillText('280', 10, 38);
    g.fillText(`${2 + (Number(st.code) % 9)} мин`, 170, 38);
    g.font = '20px "Arial Narrow", Arial';
    g.fillText(st.dir === 'A' ? 'Студентски град' : 'СУ Св. Кл. Охридски', 10, 76);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.3), new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(1.6, 1.6, 1.6) }));
    mesh.rotation.y = Math.PI;
    return mesh;
  }

  setNight(n) {
    this.mats.lens.emissiveIntensity = n > 0.3 ? 6 : 0;
    this.glowMat.opacity = Math.max(0, (n - 0.3) / 0.7) * 0.85;
    for (const m of this.adMats || []) m.emissiveIntensity = 0.2 + n * 1.2;
  }
}
