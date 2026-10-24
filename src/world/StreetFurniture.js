// Street furniture: lamps (with night light pools), traffic-signal heads,
// benches, bins, recycling bells, waste containers, bollards, hydrants,
// fences/walls/hedges, parked cars, and the Route 280 bus stops (shelters,
// stop poles with name/code plates, real-time departure boards).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry32, hash2 } from '../core/rng.js';
import { carAssets, carPaint } from './CarModels.js';
import { buildStopHardware } from './StopHardware.js';

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

/**
 * Welded "3D" mesh fence panel, the common Sofia fence: 2.5 m wide, 1.6 m high, 200 x 50 mm mesh
 * (drawn a little coarser so it survives mipmapping), two V bends, a 60 mm post at each joint.
 * White wires on a clear canvas; the material colour paints them. Wires average to ~30 %
 * coverage, so a fence far away reads as a thin green veil, not a wall.
 */
function meshFenceTexture() {
  const W = 256, H = 256;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  g.clearRect(0, 0, W, H);
  g.fillStyle = '#fff';
  for (let x = 10; x < W - 6; x += 20.4) g.fillRect(Math.round(x), 6, 2, H - 10); // verticals
  for (let y = 8; y < H - 2; y += 10) g.fillRect(4, y, W - 8, 2); // horizontals
  // V bends: a doubled wire with a shaded lip
  for (const y of [70, 172]) {
    g.fillRect(4, y - 3, W - 8, 3);
    g.fillStyle = '#bbb';
    g.fillRect(4, y, W - 8, 3);
    g.fillStyle = '#fff';
  }
  // posts with cap and a clamp per bend
  g.fillRect(0, 0, 4, H);
  g.fillRect(W - 4, 0, 4, H);
  g.fillStyle = '#ccc';
  for (const y of [28, 120, 214]) g.fillRect(0, y, 7, 6), g.fillRect(W - 7, y, 7, 6);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.anisotropy = 4;
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
    // mesh panels: RAL 6005 green and RAL 7016 anthracite, the two usual powder coats
    const fm = meshFenceTexture();
    const panel = (color) => new S({ color, map: fm, roughness: 0.55, metalness: 0.35, transparent: true, alphaTest: 0.04, side: THREE.DoubleSide });
    this.mats.fenceGreen = panel(0x2f5a3f);
    this.mats.fenceGrey = panel(0x4a5054);
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
    // stops first: shelters, poles and bins reserve their ground in the swept-path index so
    // lamps, bins, parked cars and trees keep clear of them
    out.push(...this.buildStops());
    out.push(...this.buildLamps());
    out.push(...this.buildSmallProps());
    out.push(...this.buildSignals());
    out.push(...this.buildLines());
    out.push(...this.buildParkedCars());
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
      if (!k || this.blocked(x, z, 0.2)) continue;
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
        if (near(x, z, 14) || this.world.bgrid.pointInAny(x, z) >= 0 || this.blocked(x, z, 0.2)) continue;
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
        if (this.blocked(x, z, 0.8)) continue;
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
        if (this.world.bgrid.pointInAny(x, z) >= 0 || this.blocked(x, z, 0.15)) continue;
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
    out.push(...this.buildMeshFences(L.fence || []));
    make(L.wall || [], 1.9, m.plaster, 0.25);
    make(L.retaining_wall || [], 1.2, m.concrete, 0.3);
    make(L.hedge || [], 1.2, m.hedge, 0.8);
    make(L.guard_rail || [], 0.75, m.metal, 0.08);
    return out;
  }

  /** OSM fences as see-through mesh panels: one terrain-following double-sided strip per line. */
  buildMeshFences(lines) {
    const H = 1.6, PANEL = 2.5;
    const sets = { fenceGreen: [], fenceGrey: [] };
    for (const p of lines) {
      if (p.length < 4) continue;
      const key = hash2(Math.round(p[0]), Math.round(p[1])) < 0.62 ? 'fenceGreen' : 'fenceGrey';
      const pos = [], uv = [];
      let u = 0;
      for (let i = 0; i < p.length - 2; i += 2) {
        const ax = p[i], az = p[i + 1], bx = p[i + 2], bz = p[i + 3];
        const len = Math.hypot(bx - ax, bz - az);
        if (len < 0.05) continue;
        const ya = this.y(ax, az) - 0.05, yb = this.y(bx, bz) - 0.05;
        const u1 = u + len / PANEL;
        pos.push(ax, ya, az, bx, yb, bz, bx, yb + H, bz, ax, ya, az, bx, yb + H, bz, ax, ya + H, az);
        uv.push(u, 0, u1, 0, u1, 1, u, 0, u1, 1, u, 1);
        u = u1;
      }
      if (!pos.length) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.computeVertexNormals();
      sets[key].push(g);
    }
    const out = [];
    for (const [k, geos] of Object.entries(sets)) {
      // chunk by 256 m tile so culling and transparent sorting stay local
      const tiles = new Map();
      for (const g of geos) {
        g.computeBoundingSphere();
        const c = g.boundingSphere.center, key = `${Math.floor(c.x / 256)},${Math.floor(c.z / 256)}`;
        let a = tiles.get(key);
        if (!a) tiles.set(key, (a = []));
        a.push(g);
      }
      for (const [key, list] of tiles) {
        const mesh = new THREE.Mesh(mergeGeometries(list), this.mats[k]);
        mesh.receiveShadow = true;
        mesh.name = k;
        const gg = new THREE.Group();
        gg.name = `lines:${key}`;
        gg.add(mesh);
        out.push(gg);
      }
    }
    return out;
  }

  /** A prop at (x, z) would stand in the bus's swept path. */
  blocked(x, z, r) {
    return !!(this.sweep && this.sweep.hits(x, z, r));
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
            if (this.world.bgrid.pointInAny(x, z) >= 0 || this.blocked(x, z, 2.4)) continue;
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

  /** Route 280 stops: shelters, poles, plates, e-boards, bins and benches (see StopHardware.js). */
  buildStops() {
    return buildStopHardware(this);
  }

  /** Live countdown on a stop's departure board (passenger mode). */
  setBoard(code, mins) {
    const b = this.boards && this.boards.get(code);
    if (!b || b.last === mins) return;
    b.last = mins;
    b.draw(mins);
  }

  setNight(n) {
    this.mats.lens.emissiveIntensity = n > 0.3 ? 6 : 0;
    this.glowMat.opacity = Math.max(0, (n - 0.3) / 0.7) * 0.85;
    for (const m of this.adMats || []) m.emissiveIntensity = 0.18 + n * 1.1;
    for (const m of this.stopStrips || []) m.emissiveIntensity = n > 0.3 ? 3 : 0;
  }
}
