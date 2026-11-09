import * as THREE from 'three';
import type { RoadPath, EarthGen } from './EarthGen';
import type { MaterialLibrary } from '../../render/Materials';
import type { PhysicsWorld } from '../../physics/Physics';

/**
 * Road ribbons: textured strips following the road splines, sitting on the flattened terrain.
 * Edges fade with alpha-hash dithering so the road blends into the shoulder.
 */
export function buildRoads(gen: EarthGen, mats: MaterialLibrary): THREE.Group {
  const g = new THREE.Group();
  g.name = 'roads';
  const bySurface = new Map<string, RoadPath[]>();
  for (const r of gen.roads) {
    const l = bySurface.get(r.surface) ?? [];
    l.push(r);
    bySurface.set(r.surface, l);
  }
  for (const [surface, roads] of bySurface) {
    const geo = ribbonGeometry(roads, gen);
    const tex = surface === 'asphalt' ? 'asphalt_a' : 'gravel_a';
    const nrm = surface === 'asphalt' ? 'asphalt_n' : 'gravel_n';
    const tint = surface === 'gravel' ? new THREE.Color(0.86, 0.8, 0.7) : surface === 'dirt' ? new THREE.Color(0.62, 0.52, 0.4) : new THREE.Color(0.9, 0.9, 0.9);
    const m = new THREE.MeshStandardMaterial({
      color: tint,
      map: mats.tex(tex, true, 1),
      normalMap: mats.tex(nrm, false, 1),
      normalScale: new THREE.Vector2(0.8, 0.8),
      roughness: surface === 'asphalt' ? 0.88 : 0.95,
      alphaHash: true,
      transparent: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    m.onBeforeCompile = (s) => {
      s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nattribute float aEdge;\nvarying float vEdge;').replace('#include <uv_vertex>', '#include <uv_vertex>\nvEdge = aEdge;');
      s.fragmentShader = s.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vEdge;')
        .replace('#include <alphahash_fragment>', `diffuseColor.a *= smoothstep(0.0, 0.35, vEdge);\n#include <alphahash_fragment>`)
        .replace('#include <map_fragment>', `#include <map_fragment>\n${surface === 'asphalt' ? `
          float cl = abs(vMapUv.x - 0.5);
          // faded centre line and edge lines on the facility road
          float line = (1.0 - smoothstep(0.004, 0.012, abs(cl))) * step(0.5, fract(vMapUv.y * 0.12));
          float edge = (1.0 - smoothstep(0.008, 0.02, abs(cl - 0.43)));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.75, 0.62, 0.25), line * 0.55);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.8, 0.8, 0.78), edge * 0.45);` : ''}`);
    };
    const mesh = new THREE.Mesh(geo, m);
    mesh.receiveShadow = true;
    mesh.userData.owned = true;
    mesh.name = 'road_' + surface;
    g.add(mesh);
  }
  return g;
}

function ribbonGeometry(roads: RoadPath[], gen: EarthGen): THREE.BufferGeometry {
  const pos: number[] = [], uv: number[] = [], edge: number[] = [], idx: number[] = [];
  let base = 0;
  for (const r of roads) {
    const half = r.width / 2 + 1.2;
    const lanes = [-1, -0.7, 0, 0.7, 1];
    const p = r.pts;
    for (let i = 0; i < p.length; i++) {
      const a = p[Math.max(0, i - 1)], b = p[Math.min(p.length - 1, i + 1)];
      let dx = b[0] - a[0], dz = b[1] - a[1];
      const l = Math.hypot(dx, dz) || 1;
      dx /= l; dz /= l;
      const nx = -dz, nz = dx;
      for (const s of lanes) {
        const x = p[i][0] + nx * half * s, z = p[i][1] + nz * half * s;
        const y = gen.height(x, z) + 0.035;
        pos.push(x, y, z);
        uv.push((s * 0.5 + 0.5) * (r.width / 4), r.cum[i] / 4);
        edge.push(1 - Math.abs(s));
      }
    }
    const n = lanes.length;
    for (let i = 0; i < p.length - 1; i++) {
      for (let k = 0; k < n - 1; k++) {
        const a = base + i * n + k, b = a + 1, c = a + n, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    base += p.length * n;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aEdge', new THREE.Float32BufferAttribute(edge, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Road surface colliders for the area around a point (keeps the trimesh small). */
export function roadColliders(gen: EarthGen, phys: PhysicsWorld, cx: number, cz: number, radius: number) {
  const out = [];
  for (const r of gen.roads) {
    const half = r.width / 2 + 0.6;
    const verts: number[] = [];
    const idx: number[] = [];
    let n = 0;
    for (let i = 0; i < r.pts.length - 1; i++) {
      const [ax, az] = r.pts[i];
      if (Math.hypot(ax - cx, az - cz) > radius) continue;
      const [bx, bz] = r.pts[i + 1];
      let dx = bx - ax, dz = bz - az;
      const l = Math.hypot(dx, dz) || 1;
      dx /= l; dz /= l;
      const nx = -dz * half, nz = dx * half;
      const ys = [gen.height(ax + nx, az + nz), gen.height(ax - nx, az - nz), gen.height(bx + nx, bz + nz), gen.height(bx - nx, bz - nz)];
      verts.push(ax + nx, ys[0] + 0.02, az + nz, ax - nx, ys[1] + 0.02, az - nz, bx + nx, ys[2] + 0.02, bz + nz, bx - nx, ys[3] + 0.02, bz - nz);
      idx.push(n, n + 2, n + 1, n + 1, n + 2, n + 3);
      n += 4;
    }
    if (n > 0) {
      const c = phys.addTrimesh(new Float32Array(verts), new Uint32Array(idx), { road: r.name });
      if (c) out.push(c);
    }
  }
  return out;
}
