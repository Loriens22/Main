// The facade and roof kit modelled in Blender (tools/blender/kit_facade.py -> src/data/kit_facade.glb):
// split-AC units, satellite dishes, downpipes, TV antennas, vent heads, lift machine rooms, shop awnings,
// entrance lamps and chimneys, each a low-poly with a baked atlas (albedo, normals, AO, roughness, metal).
// FacadeDetail.js decides where they go on the buildings along the route; here they become one
// InstancedMesh per piece and 256 m tile.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import kitGlb from '../data/kit_facade.glb';

/** Parses the embedded GLB: { pieces: {name: geometry}, material, glass }. */
export async function loadKit() {
  const buf = kitGlb.buffer.slice(kitGlb.byteOffset, kitGlb.byteOffset + kitGlb.byteLength);
  const gltf = await new GLTFLoader().parseAsync(buf, '');
  const pieces = {};
  let material = null;
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    pieces[o.name] = o.geometry;
    material = material || o.material;
  });
  material.name = 'kit';
  material.envMapIntensity = 0.9;
  // entrance lamps glow at night
  const glass = material.clone();
  glass.name = 'kitGlass';
  glass.emissive = new THREE.Color(1.0, 0.78, 0.5);
  glass.emissiveIntensity = 0;
  return { pieces, material, glass };
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
const _q2 = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0), FWD = new THREE.Vector3(0, 0, 1);

// small pieces: drawn only from nearer tiles and without sun shadows (World.updateVisibility)
const SMALL = new Set(['pipeClamp', 'pipeHead', 'pipeShoe', 'mushroom', 'lamp', 'lampGlass', 'dishMount', 'flowerBox', 'gasPipe', 'gasBox', 'windowGrille']);
// phones ('balanced'): the smallest and most numerous pieces are left out, half the TV masts
const LITE_SKIP = new Set(['pipeClamp', 'mushroom', 'windowGrille', 'gasPipe']);

/** Collects instances per tile and piece while the buildings are generated. */
export class KitPlacer {
  constructor(tileSize = 256, lite = false) {
    this.tileSize = tileSize;
    this.lite = lite;
    this.nAntenna = 0;
    this.tiles = new Map(); // tileKey -> Map(piece -> {m: number[], c: number[] | null})
    this.count = 0;
  }

  /**
   * One instance. Local frame of every piece: +x along the wall, +y up, +z out of the wall (or the facing
   * of a roof item); yaw turns local +z to the world direction (sin yaw, cos yaw) in (x, z).
   * tx, tz = where the instance is binned (the building's centroid, so a building stays in one tile).
   * tilt = rotation about the local +z (wall normal) before the yaw.
   */
  add(tx, tz, piece, x, y, z, yaw, sx = 1, sy = 1, sz = 1, color = null, tilt = 0) {
    if (this.lite && (LITE_SKIP.has(piece) || (piece === 'antenna' && this.nAntenna++ % 2))) return;
    const k = `${Math.floor(tx / this.tileSize)},${Math.floor(tz / this.tileSize)}`;
    let t = this.tiles.get(k);
    if (!t) this.tiles.set(k, (t = new Map()));
    let e = t.get(piece);
    if (!e) t.set(piece, (e = { m: [], c: null }));
    _q.setFromAxisAngle(UP, yaw);
    if (tilt) _q.multiply(_q2.setFromAxisAngle(FWD, tilt)); // turn about the wall normal first (vertical gas risers)
    _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
    for (let i = 0; i < 16; i++) e.m.push(_m.elements[i]);
    if (color) {
      if (!e.c) e.c = new Array(((e.m.length / 16) - 1) * 3).fill(1);
      e.c.push(color[0], color[1], color[2]);
    } else if (e.c) e.c.push(1, 1, 1);
    this.count++;
  }

  /** Groups named bkit:<tile> (and bkits:<tile> for the small pieces) with one InstancedMesh per piece. */
  meshes(kit) {
    const out = [];
    for (const [key, t] of this.tiles) {
      const big = new THREE.Group(), small = new THREE.Group();
      big.name = `bkit:${key}`;
      small.name = `bkits:${key}`;
      for (const [piece, e] of t) {
        const geo = kit.pieces[piece];
        if (!geo) continue;
        const n = e.m.length / 16;
        const im = new THREE.InstancedMesh(geo, piece === 'lampGlass' ? kit.glass : kit.material, n);
        im.instanceMatrix.array.set(e.m);
        im.instanceMatrix.needsUpdate = true;
        if (e.c) im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(e.c), 3);
        im.computeBoundingSphere();
        im.name = `kit_${piece}`;
        im.castShadow = true;
        im.receiveShadow = true;
        im.matrixAutoUpdate = false;
        (SMALL.has(piece) ? small : big).add(im);
      }
      for (const g of [big, small]) {
        if (!g.children.length) continue;
        g.userData.tile = key.split(',').map(Number);
        out.push(g);
      }
    }
    return out;
  }
}
