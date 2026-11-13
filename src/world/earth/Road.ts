import * as THREE from 'three';
import { materials } from '../../render/Materials';
import { EarthMap } from './EarthMap';

/**
 * Paved road ribbon generated from the same spline the terrain was graded to.
 * The unpaved farm lane at the start is left to the terrain's gravel layer.
 */
export function buildRoad(map: EarthMap): THREE.Group {
  const group = new THREE.Group();
  group.name = 'road';
  const asphalt = materials.unique('asphalt') as THREE.MeshStandardMaterial;
  asphalt.polygonOffset = true;
  asphalt.polygonOffsetFactor = -2;
  asphalt.polygonOffsetUnits = -4;
  liftWithDistance(asphalt, 0.03);
  const paint = new THREE.MeshStandardMaterial({ color: 0xb9a871, roughness: 0.9, metalness: 0, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 });
  liftWithDistance(paint, 0.045);

  const R = map.road;
  const first = R.findIndex((r) => r.paved > 0.02);
  const CH = 90;
  for (let c0 = Math.max(0, first - 1); c0 < R.length - 1; c0 += CH) {
    const c1 = Math.min(R.length - 1, c0 + CH);
    const n = c1 - c0 + 1;
    const pos = new Float32Array(n * 2 * 3), nor = new Float32Array(n * 2 * 3), uv = new Float32Array(n * 2 * 2);
    const idx: number[] = [];
    for (let k = 0; k < n; k++) {
      const r = R[c0 + k];
      // the lane narrows to nothing where the pavement begins, so the end of the tarmac feathers into gravel
      const hw = (r.w / 2) * Math.min(1, r.paved * 1.4 + 0.25);
      const nx = -r.tz, nz = r.tx;
      const prev = R[Math.max(0, c0 + k - 1)], next = R[Math.min(R.length - 1, c0 + k + 1)];
      const slope = (next.y - prev.y) / Math.max(0.01, next.s - prev.s);
      const ny = 1 / Math.hypot(1, slope);
      for (let side = 0; side < 2; side++) {
        const sg = side ? 1 : -1;
        const o = (k * 2 + side) * 3;
        pos[o] = r.x + nx * hw * sg; pos[o + 1] = r.y; pos[o + 2] = r.z + nz * hw * sg;
        nor[o] = -r.tx * slope * ny; nor[o + 1] = ny; nor[o + 2] = -r.tz * slope * ny;
        uv[(k * 2 + side) * 2] = hw * sg; uv[(k * 2 + side) * 2 + 1] = r.s;
      }
      if (k < n - 1) { const a = k * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    const m = new THREE.Mesh(g, asphalt);
    m.receiveShadow = true;
    group.add(m);
  }
  // worn centre line: 3 m dashes every 9 m, missing in places
  const dp: number[] = [], di: number[] = [];
  let v = 0;
  for (let s = Math.max(360, first * 2); s < map.roadLength - 60; s += 9) {
    if (((Math.sin(s * 12.9898) * 43758.5453) % 1 + 1) % 1 < 0.22) continue;
    const a = map.roadAt(s), b = map.roadAt(s + 3);
    for (const p of [a, b]) {
      const nx = -p.tz, nz = p.tx;
      dp.push(p.x - nx * 0.06, p.y, p.z - nz * 0.06, p.x + nx * 0.06, p.y, p.z + nz * 0.06);
    }
    di.push(v, v + 2, v + 1, v + 1, v + 2, v + 3);
    v += 4;
  }
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.Float32BufferAttribute(dp, 3));
  lg.setIndex(di);
  lg.computeVertexNormals();
  const lines = new THREE.Mesh(lg, paint);
  lines.renderOrder = 2;
  group.add(lines);
  return group;
}

/** Raise a ground decal slightly, more with distance, so coarse terrain LODs never bury it. */
function liftWithDistance(m: THREE.Material, base: number) {
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (shader, r) => {
    prev?.call(m, shader, r);
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>\n{ float dd = length( ( modelViewMatrix * vec4( transformed, 1.0 ) ).xyz ); transformed.y += ${base.toFixed(3)} + clamp( ( dd - 120.0 ) / 1400.0, 0.0, 1.0 ) * 3.0; }`,
    );
  };
  const key = m.customProgramCacheKey?.bind(m);
  m.customProgramCacheKey = () => 'lift' + base + '|' + (key ? key() : '');
}
