import * as THREE from 'three';
import { rng } from '../core/math';

/*
 * Mann's planet's frozen clouds: cloud masses frozen solid and held aloft (in the film the Ranger clips one on its
 * descent). Each is an irregular slab, wide and shallow like the cloud it was, its surface sculpted by 3D noise, in
 * hard rime ice: bright, slightly translucent at its thin edges, with a bluer, glossier underside.
 */

function hash3(x: number, y: number, z: number) {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}
function noise3(x: number, y: number, z: number) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  const c = (dx: number, dy: number, dz: number) => hash3(xi + dx, yi + dy, zi + dz);
  return l(l(l(c(0, 0, 0), c(1, 0, 0), u), l(c(0, 1, 0), c(1, 1, 0), u), v), l(l(c(0, 0, 1), c(1, 0, 1), u), l(c(0, 1, 1), c(1, 1, 1), u), v), w);
}
function fbm3(x: number, y: number, z: number) {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < 5; i++) { s += a * noise3(x * f, y * f, z * f); a *= 0.5; f *= 2.03; }
  return s;
}

export class FrozenClouds {
  group = new THREE.Group();
  private mats: THREE.Material[] = [];

  constructor(seed = 11, count = 38, height: (x: number, z: number) => number) {
    const R = rng(seed);
    const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.86, 0.9, 0.95), roughness: 0.42, metalness: 0.0, envMapIntensity: 1.2, flatShading: false });
    this.mats.push(mat);
    for (let k = 0; k < count; k++) {
      const base = new THREE.IcosahedronGeometry(1, 4);
      const p = base.attributes.position as THREE.BufferAttribute;
      const o = R() * 100;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        // a cloud is lumpy on top and flatter underneath
        let r = 0.72 + 0.55 * fbm3(x * 1.6 + o, y * 1.6, z * 1.6 - o);
        if (y < 0) r *= 0.75 + 0.25 * (1 + y);
        p.setXYZ(i, x * r, y * r * (y > 0 ? 1 : 0.55), z * r);
      }
      base.computeVertexNormals();
      const mesh = new THREE.Mesh(base, mat);
      // wide and shallow, 150-700 m across, held 250-1400 m up, scattered over ~7 km around the site
      const w = 150 + R() * 550, d = w * (0.5 + R() * 0.6), h = 35 + R() * 120;
      const ang = R() * Math.PI * 2, dist = 600 + Math.pow(R(), 0.7) * 6500;
      const x = Math.cos(ang) * dist, z = Math.sin(ang) * dist;
      mesh.position.set(x, height(x, z) + 250 + R() * 1150, z);
      mesh.scale.set(w / 2, h / 2, d / 2);
      mesh.rotation.set((R() - 0.5) * 0.25, R() * Math.PI * 2, (R() - 0.5) * 0.25);
      mesh.castShadow = true;
      mesh.receiveShadow = false;
      this.group.add(mesh);
    }
  }

  dispose() {
    for (const c of this.group.children) (c as THREE.Mesh).geometry.dispose();
    for (const m of this.mats) m.dispose();
    this.group.removeFromParent();
  }
}
