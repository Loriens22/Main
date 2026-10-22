// Trees: OSM-mapped trees, tree rows, parks/forests and boulevard street
// trees. Instanced per 256 m tile, alpha-tested leaf-card crowns with wind
// sway, several species and October colours (the game is set in autumn).
import * as THREE from 'three';
import { mulberry32, hash2 } from '../core/rng.js';
import { makeLeafCard, makeBark } from '../render/Textures.js';

const SPECIES = [
  // name, trunk h (m), crown radius, crown height, trunk colour, leaf hue, weight
  { name: 'linden', trunk: 3.2, cr: 3.4, ch: 4.6, bark: 0x6b5c4e, hue: [74, 112, 46], w: 4 },
  { name: 'chestnut', trunk: 2.8, cr: 3.8, ch: 5.0, bark: 0x5a4a3c, hue: [58, 98, 38], w: 3 },
  { name: 'plane', trunk: 4.0, cr: 4.2, ch: 5.6, bark: 0x9b9078, hue: [82, 118, 52], w: 2 },
  { name: 'birch', trunk: 3.5, cr: 2.2, ch: 5.5, bark: 0xd8d6d0, hue: [104, 132, 58], w: 1.5 },
  { name: 'pine', trunk: 4.5, cr: 2.6, ch: 8.0, bark: 0x6a5446, hue: [38, 74, 40], w: 1.5, conifer: true },
  { name: 'poplar', trunk: 3.0, cr: 1.8, ch: 11.0, bark: 0x7c7466, hue: [80, 116, 50], w: 1 },
];
const AUTUMN = [[0.9, 0.82, 0.3], [0.95, 0.62, 0.18], [0.75, 0.5, 0.2], [0.85, 0.75, 0.35]];

function crownGeometry(conifer, cards = 12, seed = 1) {
  const r = mulberry32(seed);
  const geos = [];
  if (conifer) {
    // stacked crossed cards forming a cone
    for (let i = 0; i < 6; i++) {
      const y = 0.15 + i * 0.15;
      const w = 1.0 - i * 0.14;
      for (let k = 0; k < 2; k++) {
        const p = new THREE.PlaneGeometry(w * 2, 0.45);
        p.rotateY((k * Math.PI) / 2 + i * 0.4);
        p.translate(0, y, 0);
        geos.push(p);
      }
    }
  } else {
    for (let i = 0; i < cards; i++) {
      const p = new THREE.PlaneGeometry(1.25, 1.25);
      // random orientation; normals pointing outwards from the crown centre for nicer lighting
      p.rotateX((r() - 0.5) * 1.2);
      p.rotateY(r() * Math.PI * 2);
      const a = r() * Math.PI * 2, e = (r() - 0.3) * 1.2, d = 0.25 + r() * 0.45;
      p.translate(Math.cos(a) * Math.cos(e) * d, 0.5 + Math.sin(e) * d * 0.8, Math.sin(a) * Math.cos(e) * d);
      geos.push(p);
    }
  }
  const pos = [], nrm = [], uv = [];
  for (const g of geos) {
    const gp = g.attributes.position, gu = g.attributes.uv;
    const idx = g.index.array;
    for (const k of idx) {
      const x = gp.getX(k), y = gp.getY(k), z = gp.getZ(k);
      pos.push(x, y, z);
      // spherical normal for soft volumetric shading
      const n = new THREE.Vector3(x, (y - 0.5) * 1.2, z).normalize();
      nrm.push(n.x, n.y, n.z);
      uv.push(gu.getX(k), gu.getY(k));
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return out;
}

export class Vegetation {
  constructor({ scene, world, quality }) {
    this.scene = scene;
    this.world = world;
    this.quality = quality;
    this.time = { value: 0 };
    this.trees = [];
  }

  okSpot(x, z, clearance = 1.6) {
    const w = this.world;
    if (w.bgrid.pointInAny(x, z) >= 0) return false;
    for (const [dx, dz] of [[0, 0], [clearance, 0], [-clearance, 0], [0, clearance], [0, -clearance]])
      if (w.bgrid.pointInAny(x + dx, z + dz) >= 0) return false;
    const q = w.roads.query(x, z, 20);
    if (q && q.d < q.piece.hw + 0.8) return false;
    if (w.splat) {
      const s = w.splat;
      const px = Math.floor((x - w.hf.xMin) / s.mpp), pz = Math.floor((z - w.hf.zMin) / s.mpp);
      if (px >= 0 && pz >= 0 && px < s.W && pz < s.H && s.holeMask[pz * s.W + px] > 128) return false;
    }
    return true;
  }

  add(x, z, species = null, scale = 1) {
    const h = hash2(Math.round(x * 10), Math.round(z * 10));
    let sp = species;
    if (sp == null) {
      let tot = 0;
      for (const s of SPECIES) tot += s.w;
      let v = h * tot;
      sp = 0;
      while (v > SPECIES[sp].w && sp < SPECIES.length - 1) v -= SPECIES[sp++].w;
    }
    this.trees.push({ x, z, sp, s: scale * (0.75 + hash2(Math.round(z * 7), Math.round(x * 3)) * 0.55), rot: h * Math.PI * 2, h });
  }

  place(sidewalks) {
    const w = this.world, d = w.data;
    const density = this.quality === 'balanced' ? 0.5 : this.quality === 'high' ? 0.8 : 1;
    // 1. mapped trees
    for (let i = 0; i < d.trees.length; i += 2) if (this.okSpot(d.trees[i], d.trees[i + 1], 0.8)) this.add(d.trees[i], d.trees[i + 1]);
    // 2. tree rows
    for (const row of d.treeRows) {
      for (let i = 0; i < row.length - 2; i += 2) {
        const ax = row[i], az = row[i + 1], bx = row[i + 2], bz = row[i + 3];
        const L = Math.hypot(bx - ax, bz - az);
        const sp = Math.floor(hash2(i, Math.round(ax)) * 3);
        for (let t = 0; t < L; t += 8) {
          const x = ax + ((bx - ax) * t) / L, z = az + ((bz - az) * t) / L;
          if (this.okSpot(x, z, 0.8)) this.add(x, z, sp);
        }
      }
    }
    // 3. parks, forests, gardens, green residential areas (near the route)
    const route = this.routeLine;
    for (const a of d.areas) {
      const per = { forest: 55, park: 140, garden: 220, cemetery: 90, scrub: 160, residential: 420, university: 380, school: 380, hospital: 300, kindergarten: 300 }[a.type];
      if (!per) continue;
      const p = a.pts;
      let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
      for (let i = 0; i < p.length; i += 2) { x0 = Math.min(x0, p[i]); x1 = Math.max(x1, p[i]); z0 = Math.min(z0, p[i + 1]); z1 = Math.max(z1, p[i + 1]); }
      const step = Math.sqrt(per / density);
      for (let x = Math.ceil(x0 / step) * step; x < x1; x += step)
        for (let z = Math.ceil(z0 / step) * step; z < z1; z += step) {
          const jx = x + (hash2(Math.round(x), Math.round(z)) - 0.5) * step * 0.9;
          const jz = z + (hash2(Math.round(z), Math.round(x) + 7) - 0.5) * step * 0.9;
          if (route && route.nearest(jx, jz).d > (a.type === 'forest' || a.type === 'park' ? 520 : 320)) continue;
          if (!pointInRing(p, jx, jz) || a.holes.some((h) => pointInRing(h, jx, jz))) continue;
          if (!this.okSpot(jx, jz)) continue;
          this.add(jx, jz, a.type === 'forest' && hash2(Math.round(jx), 3) < 0.35 ? 4 : null, a.type === 'forest' ? 1.15 : 1);
        }
    }
    // 4. street trees along wide pavements of main streets
    for (const sw of sidewalks) {
      const cls = sw.piece.cls;
      if (!['primary', 'secondary', 'tertiary', 'trunk'].includes(cls) || sw.width < 3.0) continue;
      const p = sw.pts;
      const sp = Math.floor(hash2(sw.piece.id, 9) * 3);
      let acc = hash2(sw.piece.id, 1) * 10;
      for (let i = 0; i < p.length - 2; i += 2) {
        const L = Math.hypot(p[i + 2] - p[i], p[i + 3] - p[i + 1]);
        acc += L;
        if (acc < 11) continue;
        acc = 0;
        // place nearer to the kerb than the walking line
        const q = this.world.roads.query(p[i], p[i + 1], 14);
        let x = p[i], z = p[i + 1];
        if (q) {
          const px = q.piece.pts[q.i] + (q.piece.pts[q.i + 2] - q.piece.pts[q.i]) * q.t, pz = q.piece.pts[q.i + 1] + (q.piece.pts[q.i + 3] - q.piece.pts[q.i + 1]) * q.t;
          const dx = x - px, dz = z - pz, dl = Math.hypot(dx, dz) || 1;
          x = px + (dx / dl) * (q.piece.hw + 1.1);
          z = pz + (dz / dl) * (q.piece.hw + 1.1);
        }
        if (this.okSpot(x, z, 1.2)) this.add(x, z, sp, 0.9);
      }
    }
    const max = this.quality === 'balanced' ? 9000 : this.quality === 'high' ? 16000 : 24000;
    if (this.trees.length > max) {
      // keep the trees nearest to the route
      this.trees.sort((a, b) => a.h - b.h);
      this.trees.length = max;
    }
    return this.trees.length;
  }

  build() {
    const bark = makeBark(256);
    const tiles = new Map();
    for (const t of this.trees) {
      const k = `${Math.floor(t.x / 256)},${Math.floor(t.z / 256)}`;
      let a = tiles.get(k);
      if (!a) tiles.set(k, (a = []));
      a.push(t);
    }
    const trunkGeo = new THREE.CylinderGeometry(0.11, 0.2, 1, 7, 1);
    trunkGeo.translate(0, 0.5, 0);
    const time = this.time;
    const leafMats = SPECIES.map((sp, i) => {
      const m = new THREE.MeshStandardMaterial({
        map: makeLeafCard(256, 83 + i * 17, sp.hue), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.85, metalness: 0,
      });
      m.onBeforeCompile = (sh) => {
        sh.uniforms.uTime = time;
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', '#include <common>\nuniform float uTime;')
          .replace('#include <begin_vertex>', `#include <begin_vertex>
          {
            vec4 ip = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
            float ph = ip.x * 0.37 + ip.z * 0.21;
            float sway = sin(uTime * 1.3 + ph) * 0.035 + sin(uTime * 2.7 + ph * 2.0) * 0.015;
            transformed.x += sway * position.y;
            transformed.z += sway * 0.6 * position.y;
          }`);
      };
      m.customProgramCacheKey = () => `leaf${i}`;
      return m;
    });
    const crowns = SPECIES.map((sp, i) => crownGeometry(!!sp.conifer, 12, 11 + i));
    const trunkMats = SPECIES.map((sp) => new THREE.MeshStandardMaterial({ map: bark.map, color: sp.bark, roughness: 0.95 }));
    const out = [];
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3(), C = new THREE.Color();
    for (const [k, list] of tiles) {
      const g = new THREE.Group();
      g.name = `trees:${k}`;
      for (let si = 0; si < SPECIES.length; si++) {
        const ts = list.filter((t) => t.sp === si);
        if (!ts.length) continue;
        const sp = SPECIES[si];
        const crown = new THREE.InstancedMesh(crowns[si], leafMats[si], ts.length);
        const trunk = new THREE.InstancedMesh(trunkGeo, trunkMats[si], ts.length);
        ts.forEach((t, i) => {
          const y = this.world.hf.heightAt(t.x, t.z);
          Q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), t.rot);
          S.set(t.s * (sp.conifer ? 1.2 : 1.6), t.s * sp.trunk * 1.25, t.s * (sp.conifer ? 1.2 : 1.6));
          P.set(t.x, y - 0.1, t.z);
          trunk.setMatrixAt(i, M.compose(P, Q, S));
          // crown card cluster spans ~2.6 x 2.3 units
          const sx = t.s * sp.cr / (sp.conifer ? 1.0 : 1.3), sy = t.s * sp.ch / (sp.conifer ? 1.0 : 2.3);
          S.set(sx, sy, sx);
          P.set(t.x, y + t.s * sp.trunk * (sp.conifer ? 0.3 : 0.8) + (sp.conifer ? 0 : sy * 0.55), t.z);
          crown.setMatrixAt(i, M.compose(P, Q, S));
          // colour variation incl. autumn foliage
          const r = t.h;
          if (!sp.conifer && r > 0.62) C.setRGB(...AUTUMN[Math.floor(((r - 0.62) / 0.38) * AUTUMN.length) % AUTUMN.length]);
          else C.setRGB(0.85 + r * 0.25, 0.9 + r * 0.15, 0.85 + (1 - r) * 0.2);
          crown.setColorAt(i, C);
        });
        crown.castShadow = true;
        crown.receiveShadow = true;
        trunk.castShadow = true;
        crown.name = 'treeCrown';
        trunk.name = 'treeTrunk';
        crown.computeBoundingSphere();
        trunk.computeBoundingSphere();
        g.add(trunk, crown);
      }
      out.push(g);
    }
    return out;
  }
}

export function pointInRing(p, x, z) {
  let inside = false;
  const n = p.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = p[2 * i], zi = p[2 * i + 1], xj = p[2 * j], zj = p[2 * j + 1];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
