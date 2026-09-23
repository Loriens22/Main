// Instanced articulated humans. Each human = 19 instanced parts driven by a procedural pose.
import * as THREE from 'three';
import { makeRng, clamp, lerp, prepGeo, roundedBox } from '../util.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as TX from '../textures.js';

const PARTS = ['pelvis', 'torso', 'head', 'hairS', 'hairL', 'hairB', 'uaL', 'uaR', 'faL', 'faR', 'hL', 'hR', 'thL', 'thR', 'shL', 'shR', 'ftL', 'ftR', 'skirt', 'hem', 'pack', 'bag'];

/** Lathe from a top-down profile [[r, y], …] (joint at y = 0, limb hanging along −y). */
function lathe(prof, seg = 10, sz = 1) {
  const pts = prof.slice().reverse().map(([r, y]) => new THREE.Vector2(Math.max(r, 1e-4), y));
  return new THREE.LatheGeometry(pts, seg).scale(1, 1, sz);
}
/** Non-indexed geometry with a baked ambient-occlusion vertex colour f(x, y, z). */
function ao(g, f) {
  const geo = prepGeo(g), p = geo.attributes.position, c = geo.attributes.color;
  for (let i = 0; i < p.count; i++) { const v = clamp(f(p.getX(i), p.getY(i), p.getZ(i)), 0, 1); c.setXYZ(i, v, v, v); }
  return geo;
}
const merge = (...arr) => mergeGeometries(arr.map((g) => (g.attributes.color ? g : prepGeo(g))));

function partGeos() {
  const G = {};
  // hips (trousers)
  G.pelvis = ao(new THREE.SphereGeometry(1, 14, 10).scale(0.16, 0.13, 0.108), (x, y) => (y < -0.06 ? 0.72 : 0.92));
  // torso: waist → chest → shoulders, with rounded shoulder caps
  const tor = lathe([[0, 0.552], [0.05, 0.545], [0.085, 0.53], [0.15, 0.5], [0.182, 0.455], [0.19, 0.4], [0.183, 0.33], [0.168, 0.24], [0.155, 0.14], [0.156, 0.06], [0.166, -0.02], [0.17, -0.06], [0.1, -0.065], [0, -0.066]], 14, 0.66);
  const capL = new THREE.SphereGeometry(0.052, 10, 8).scale(1, 0.9, 1.15).translate(-0.186, 0.44, 0);
  const capR = capL.clone().translate(0.372, 0, 0);
  G.torso = ao(merge(tor, capL, capR), (x, y) => {
    let v = 0.74 + 0.26 * smooth(-0.06, 0.26, y);
    if (Math.abs(x) > 0.13 && y > 0.2 && y < 0.4) v *= 0.84; // under the arms
    return v;
  });
  // head + neck + nose + ears (face texture on the sphere front, +z)
  const head = new THREE.SphereGeometry(0.105, 18, 14); head.scale(0.9, 1.1, 1.0); head.rotateY(-Math.PI / 2); head.translate(0, 0.19, 0.01);
  const neck = new THREE.CylinderGeometry(0.047, 0.055, 0.13, 10); neck.translate(0, 0.05, -0.005);
  const nose = new THREE.SphereGeometry(0.016, 8, 6).scale(0.8, 1.35, 1.2).translate(0, 0.182, 0.113);
  const earL = new THREE.SphereGeometry(0.02, 8, 6).scale(0.45, 1.3, 0.9).translate(-0.094, 0.19, 0.0);
  const earR = earL.clone().translate(0.188, 0, 0);
  G.head = ao(merge(head, neck, nose, earL, earR), (x, y) => (y < 0.1 ? 0.8 : 1));
  G.hairS = new THREE.SphereGeometry(0.113, 14, 8, 0, Math.PI * 2, 0, 1.75).scale(0.92, 1.08, 1.02).translate(0, 0.205, -0.008);
  const hl = new THREE.SphereGeometry(0.115, 14, 9, 0, Math.PI * 2, 0, 2.0).scale(0.95, 1.1, 1.06).translate(0, 0.2, -0.012);
  const hlBack = new THREE.CapsuleGeometry(0.08, 0.16, 3, 8).scale(1.25, 1, 0.55).translate(0, 0.1, -0.07);
  G.hairL = merge(hl, hlBack);
  const hb = new THREE.SphereGeometry(0.112, 14, 8, 0, Math.PI * 2, 0, 1.6).scale(0.92, 1.08, 1.02).translate(0, 0.205, -0.008);
  const bun = new THREE.SphereGeometry(0.05, 10, 8).translate(0, 0.27, -0.085);
  G.hairB = merge(hb, bun);
  // tapered limbs
  G.ua = ao(lathe([[0, 0.035], [0.045, 0.022], [0.053, -0.03], [0.05, -0.1], [0.044, -0.2], [0.04, -0.265], [0.03, -0.3], [0, -0.31]]), (x, y) => 0.86 + 0.14 * smooth(-0.3, -0.05, y));
  G.fa = ao(lathe([[0, 0.022], [0.037, 0.012], [0.043, -0.05], [0.04, -0.12], [0.033, -0.22], [0.029, -0.258], [0.02, -0.28], [0, -0.287]]), () => 0.95);
  // hand: flat palm with fingers and a thumb (palm faces the thigh)
  const palm = new THREE.SphereGeometry(1, 10, 8).scale(0.02, 0.078, 0.043).translate(0, -0.07, 0.004);
  const thumb = new THREE.SphereGeometry(1, 8, 6).scale(0.014, 0.036, 0.014).rotateX(-0.45).translate(0, -0.045, 0.04);
  G.h = ao(merge(palm, thumb), () => 1);
  G.th = ao(lathe([[0, 0.045], [0.074, 0.032], [0.088, -0.03], [0.086, -0.12], [0.073, -0.28], [0.06, -0.39], [0.053, -0.44], [0.04, -0.47], [0, -0.478]], 12), (x, y) => 0.8 + 0.2 * smooth(0.02, -0.12, y));
  G.sh = ao(lathe([[0, 0.022], [0.05, 0.012], [0.054, -0.04], [0.058, -0.13], [0.048, -0.25], [0.038, -0.36], [0.034, -0.41], [0.026, -0.44], [0, -0.447]], 12), () => 0.95);
  // shoe with darker sole
  G.ft = ao(roundedBox(0.094, 0.078, 0.262, 0.032).translate(0, -0.022, 0.058), (x, y) => (y < -0.048 ? 0.32 : 1));
  G.skirt = ao(new THREE.CylinderGeometry(0.16, 0.27, 0.5, 14, 1, true).translate(0, -0.24, 0), (x, y) => 0.75 + 0.25 * smooth(-0.48, 0, y));
  // coat / jacket hem covering the hips
  G.hem = ao(new THREE.CylinderGeometry(0.178, 0.198, 0.34, 14, 1, true).scale(1, 1, 0.72).translate(0, -0.12, 0), (x, y) => 0.8 + 0.2 * smooth(-0.29, 0.05, y));
  // backpack (on the torso's back) and hand bag (hanging from the hand)
  const pk = roundedBox(0.27, 0.36, 0.13, 0.045).translate(0, 0.3, -0.172);
  const pkPocket = roundedBox(0.2, 0.14, 0.05, 0.02).translate(0, 0.21, -0.245);
  G.pack = ao(merge(pk, pkPocket), (x, y, z) => (z > -0.12 ? 0.6 : 1));
  const bagBody = roundedBox(0.075, 0.22, 0.3, 0.03).translate(0, -0.3, 0.01);
  const handle = new THREE.TorusGeometry(0.075, 0.009, 5, 12, Math.PI).rotateY(Math.PI / 2).translate(0, -0.19, 0.01);
  G.bag = ao(merge(bagBody, handle), () => 1);
  for (const k of Object.keys(G)) if (!G[k].attributes.color) G[k] = prepGeo(G[k]);
  return G;
}
function smooth(a, b, x) { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }

const SKIN = [0xd9a684, 0xcf9a78, 0xc28a68, 0xb07656, 0xe0b090, 0xc99573, 0x8f5d40];
const HAIR = [0x1c1510, 0x2e2118, 0x4a3322, 0x6d4c2e, 0xb08a52, 0x8a8a88, 0xd7d4cc, 0x3a2a1e];
// muted everyday clothing (Sofia, late spring)
const SHIRT = [0x2e3a4f, 0xe8e6e1, 0x7a2a26, 0x3f5a3a, 0xb89a4a, 0x4f4466, 0x1f1f22, 0x6f7c88, 0xa8552e, 0x2d4f6f, 0xc9c0b0, 0x6a3045, 0x4a5a5e, 0x8fa3b8, 0x5b4636, 0x9a9a96, 0xd8d0c0, 0x33413a];
const COAT = [0x1f2228, 0x3a3f47, 0x5b4636, 0x7d6a55, 0x2b3a52, 0x4b2a2a, 0x57604a, 0x8a8478];
const PANTS = [0x2c3e5c, 0x1d1f22, 0x3d4a5e, 0x57534c, 0xb8a888, 0x2a3348, 0x4a4a4a, 0x39404a];
const SHOES = [0x1a1a1a, 0xe8e8e6, 0x3a2a1e, 0x555555, 0x6a2020, 0x2a2f3a];
const BAGS = [0x1a1a1a, 0x4a3020, 0x7a5a3a, 0x8a1f2a, 0x2a3a5a, 0x3b4a3b, 0xd8d6d0];

export class Humans {
  constructor(scene, max = 420) {
    this.max = max;
    const G = partGeos();
    const faceTex = TX.humanFace();
    const mk = (geo, m) => { const im = new THREE.InstancedMesh(geo, m, max); im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false; scene.add(im); return im; };
    const cloth = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.88, vertexColors: true });
    const skin = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.62, vertexColors: true });
    const headM = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.62, map: faceTex, vertexColors: true });
    const hair = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75, vertexColors: true });
    const skirtM = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.88, side: THREE.DoubleSide, vertexColors: true });
    const gear = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, vertexColors: true });
    this.m = {
      pelvis: mk(G.pelvis, cloth), torso: mk(G.torso, cloth), head: mk(G.head, headM),
      hairS: mk(G.hairS, hair), hairL: mk(G.hairL, hair), hairB: mk(G.hairB, hair),
      uaL: mk(G.ua, cloth), uaR: mk(G.ua, cloth), faL: mk(G.fa, cloth), faR: mk(G.fa, cloth), hL: mk(G.h, skin), hR: mk(G.h, skin),
      thL: mk(G.th, cloth), thR: mk(G.th, cloth), shL: mk(G.sh, cloth), shR: mk(G.sh, cloth), ftL: mk(G.ft, cloth), ftR: mk(G.ft, cloth),
      skirt: mk(G.skirt, skirtM), hem: mk(G.hem, skirtM), pack: mk(G.pack, gear), bag: mk(G.bag, gear),
    };
    this.list = [];
    this.rnd = makeRng(2024);
    this._z = new THREE.Matrix4().makeScale(0, 0, 0);
    this.pool = Array.from({ length: 30 }, () => new THREE.Matrix4());
    this.tmp = { a: new THREE.Matrix4(), b: new THREE.Matrix4(), c: new THREE.Matrix4(), r: new THREE.Matrix4(), e: new THREE.Euler(), q: new THREE.Quaternion(), v: new THREE.Vector3(), s: new THREE.Vector3(1, 1, 1) };
    const white = new THREE.Color(1, 1, 1);
    for (const k of PARTS) { for (let i = 0; i < max; i++) { this.m[k].setMatrixAt(i, this._z); this.m[k].setColorAt(i, white); } this.m[k].count = 0; }
  }
  /** Adds a human; returns its record. opts: {kid, female, scale} */
  add(opts = {}) {
    const i = this.list.length; if (i >= this.max) return null;
    const r = this.rnd;
    const female = opts.female ?? r() < 0.5;
    const kid = !!opts.kid;
    const h = {
      i, female, kid, scale: opts.scale ?? (kid ? 0.58 + r() * 0.12 : (female ? 0.93 : 0.99) + r() * 0.08),
      hair: female ? (r() < 0.6 ? 'hairL' : 'hairB') : (r() < 0.12 ? null : 'hairS'),
      skirt: female && !kid && r() < 0.35,
      shorts: r() < 0.2, shortSleeve: r() < 0.45,
      coat: !kid && r() < 0.3,
      pack: kid ? r() < 0.7 : r() < 0.14,
      bag: !kid && (female ? r() < 0.4 : r() < 0.1),
      pose: {}, anim: 'stand', phase: r() * 10, seed: r(), visible: true,
      pos: new THREE.Vector3(), yaw: 0, parent: null, // parent: Object3D (bus body) for local coordinates
    };
    const c = new THREE.Color();
    h.cols = {};
    const skin = c.set(SKIN[Math.floor(r() * SKIN.length)]).clone();
    const shirt = c.set(h.coat ? COAT[Math.floor(r() * COAT.length)] : SHIRT[Math.floor(r() * SHIRT.length)]).clone();
    if (h.coat) h.shortSleeve = false;
    const pants = c.set(PANTS[Math.floor(r() * PANTS.length)]).clone();
    const hair = c.set(r() < (opts.old ? 0.8 : 0.15) ? 0xc9c7c0 : HAIR[Math.floor(r() * HAIR.length)]).clone();
    const shoes = c.set(SHOES[Math.floor(r() * SHOES.length)]).clone();
    const C = h.cols;
    C.pelvis = pants; C.torso = shirt; C.head = skin;
    for (const k of ['hairS', 'hairL', 'hairB']) C[k] = hair;
    C.uaL = shirt; C.uaR = shirt;
    C.faL = h.shortSleeve ? skin : shirt; C.faR = C.faL;
    C.hL = skin; C.hR = skin;
    C.thL = h.skirt ? skin : pants; C.thR = C.thL;
    C.shL = h.shorts || h.skirt ? skin : pants; C.shR = C.shL;
    C.ftL = shoes; C.ftR = shoes;
    C.skirt = c.set([0x2b2b3a, 0x7a2030, 0x2f4f6f, 0x5a4a3a, 0x1f1f1f][Math.floor(r() * 5)]).clone();
    C.hem = shirt;
    C.pack = c.set(BAGS[Math.floor(r() * BAGS.length)]).clone();
    C.bag = c.set(BAGS[Math.floor(r() * BAGS.length)]).clone();
    this.list.push(h);
    return h;
  }
  /* ------------------------------ poses ------------------------------ */
  static stand(p, t, seed) {
    Humans.zero(p);
    p.pelvisY = 0.95; p.bob = Math.sin(t * 1.3 + seed * 9) * 0.004;
    p.spine = 0.02 + Math.sin(t * 0.4 + seed * 5) * 0.02;
    p.headYaw = Math.sin(t * 0.23 + seed * 13) * 0.5; p.headPitch = 0.05;
    p.shL = [0.05, 0.1]; p.shR = [0.05, 0.1]; p.elL = -0.15; p.elR = -0.15;
    p.hipL = 0.02; p.hipR = -0.02; p.knL = 0.03; p.knR = 0.03;
    p.pelvisRoll = Math.sin(t * 0.3 + seed) * 0.02;
  }
  static walk(p, phase, amp = 1) {
    Humans.zero(p);
    const s = Math.sin(phase), c2 = Math.cos(phase);
    p.pelvisY = 0.95; p.bob = Math.abs(c2) * 0.03 * amp - 0.015;
    p.spine = 0.06 * amp; p.twist = s * 0.08 * amp;
    p.hipL = s * 0.45 * amp; p.hipR = -s * 0.45 * amp;
    p.knL = (0.15 + Math.max(0, -Math.sin(phase + 0.9)) * 0.9) * amp; p.knR = (0.15 + Math.max(0, Math.sin(phase + 0.9)) * 0.9) * amp;
    p.shL = [-s * 0.4 * amp, 0.08]; p.shR = [s * 0.4 * amp, 0.08]; p.elL = -0.3; p.elR = -0.3;
    p.headPitch = 0.04;
  }
  static sit(p, t, seed, seatY) {
    Humans.zero(p);
    p.sit = true;
    p.pelvisY = seatY + 0.08; p.spine = -0.08; p.hipL = -1.45; p.hipR = -1.42; p.knL = 1.45; p.knR = 1.5;
    p.shL = [-0.35, 0.12]; p.shR = [-0.3, 0.12]; p.elL = -1.0; p.elR = -1.05;
    p.headYaw = Math.sin(t * 0.2 + seed * 7) * 0.6; p.headPitch = 0.12 + Math.sin(t * 0.15 + seed) * 0.08;
  }
  static lean(p, t, seed) { // leaning on a balcony railing
    Humans.stand(p, t, seed);
    p.spine = 0.3; p.shL = [-1.0, 0.25]; p.shR = [-1.0, 0.25]; p.elL = -1.2; p.elR = -1.1; p.headPitch = -0.1;
    p.headYaw = Math.sin(t * 0.25 + seed * 3) * 0.7;
  }
  static phone(p, t, seed) {
    Humans.stand(p, t, seed);
    p.shR = [-0.5, 0.15]; p.elR = -2.3; p.headYaw = 0.1; p.headPitch = 0.3;
  }
  static smoke(p, t, seed) {
    Humans.stand(p, t, seed);
    const k = clamp(Math.sin(t * 0.8 + seed * 4) * 3 - 1.6, 0, 1);
    p.shR = [lerp(-0.1, -0.7, k), 0.2]; p.elR = lerp(-0.4, -2.3, k); p.spine = 0.05;
  }
  static wave(p, t, seed) { Humans.stand(p, t, seed); p.shR = [-2.8, 0.3 + Math.sin(t * 8) * 0.25]; p.elR = -0.3; }
  static laundry(p, t, seed) { Humans.stand(p, t, seed); const k = 0.5 + 0.5 * Math.sin(t * 0.7 + seed); p.shL = [-2.2 * k - 0.3, 0.2]; p.shR = [-2.4 * k - 0.2, 0.2]; p.elL = -0.3; p.elR = -0.3; p.headPitch = -0.3 * k; }
  static zero(p) {
    p.sit = false;
    p.pelvisY = 0.95; p.bob = 0; p.spine = 0; p.twist = 0; p.pelvisRoll = 0; p.headYaw = 0; p.headPitch = 0;
    p.shL = [0, 0.08]; p.shR = [0, 0.08]; p.elL = 0; p.elR = 0; p.hipL = 0; p.hipR = 0; p.knL = 0; p.knR = 0;
  }
  /** Writes instance matrices for human h using its current pose. */
  /** Starts a frame: humans are packed into consecutive instance slots (only visible ones are drawn). */
  begin(camera) {
    this.slot = 0;
    if (camera) { camera.updateMatrixWorld(); this._pm = this._pm || new THREE.Matrix4(); this._pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); this.frustum = this.frustum || new THREE.Frustum(); this.frustum.setFromProjectionMatrix(this._pm); }
  }
  write(h) {
    const M = this.m, T = this.tmp;
    if (!h.visible) return;
    // frustum test on the (world) root position
    const wp = this._wp || (this._wp = new THREE.Vector3());
    wp.copy(h.pos); if (h.parent) wp.applyMatrix4(h.parent.matrixWorld);
    if (this.frustum && !this.frustum.intersectsSphere(this._sph || (this._sph = new THREE.Sphere(wp, 1.3)))) { if (!this.shadowNear || wp.distanceToSquared(this.shadowNear) > 3600) return; }
    const i = this.slot++;
    if (i >= this.max) return;
    for (const k of PARTS) M[k].setColorAt(i, h.cols[k]);
    const p = h.pose;
    const root = T.a;
    T.q.setFromAxisAngle(T.v.set(0, 1, 0), h.yaw);
    root.compose(h.pos, T.q, T.s.set(h.scale, h.scale, h.scale));
    if (h.parent) root.premultiply(h.parent.matrixWorld);
    const set = (k, m) => M[k].setMatrixAt(i, m);
    const child = (parent, x, y, z, rx, ry, rz, out) => {
      T.e.set(rx, ry, rz, 'YXZ'); T.r.makeRotationFromEuler(T.e); T.r.setPosition(x, y, z);
      return out.multiplyMatrices(parent, T.r);
    };
    let k = 0; const P = this.pool; const nm = () => P[k++];
    const seated = !!p.sit;
    const pelvis = child(root, 0, p.pelvisY + p.bob, 0, 0, p.twist * 0.5, p.pelvisRoll, nm());
    set('pelvis', pelvis);
    if (h.skirt) set('skirt', child(pelvis, 0, 0.05, 0, 0, 0, 0, nm())); else set('skirt', this._z);
    const torso = child(pelvis, 0, 0.07, 0, p.spine, p.twist, 0, nm());
    set('torso', torso);
    set('hem', h.coat && !seated ? child(torso, 0, 0.02, 0, 0, 0, 0, nm()) : this._z);
    set('pack', h.pack && !seated ? torso : this._z);
    const head = child(torso, 0, 0.52, 0.0, p.headPitch, p.headYaw, 0, nm());
    set('head', head);
    for (const hk of ['hairS', 'hairL', 'hairB']) set(hk, h.hair === hk ? head : this._z);
    // arms (roll > 0 = away from the body)
    for (const [side, sh, el, ua, fa, hd] of [[-1, p.shL, p.elL, 'uaL', 'faL', 'hL'], [1, p.shR, p.elR, 'uaR', 'faR', 'hR']]) {
      const u = child(torso, side * 0.2, 0.45, 0, sh[0], 0, side * sh[1], nm());
      set(ua, u);
      const f = child(u, 0, -0.29, 0, el, 0, 0, nm());
      set(fa, f);
      const hm = child(f, 0, -0.27, 0, 0, 0, 0, nm());
      set(hd, hm);
      if (side < 0) set('bag', h.bag && !seated && sh[0] > -0.8 ? child(hm, 0, 0.06, 0, -(sh[0] + el) * 0.8, 0, -side * sh[1], nm()) : this._z);
    }
    // legs
    for (const [side, hip, kn, th, shn, ft] of [[-1, p.hipL, p.knL, 'thL', 'shL', 'ftL'], [1, p.hipR, p.knR, 'thR', 'shR', 'ftR']]) {
      const t1 = child(pelvis, side * 0.095, -0.03, 0, hip, 0, 0, nm());
      set(th, t1);
      const t2 = child(t1, 0, -0.44, 0, kn, 0, 0, nm());
      set(shn, t2);
      set(ft, child(t2, 0, -0.43, 0, -(hip + kn) * 0.6, 0, 0, nm()));
    }
  }
  flush() {
    const n = Math.min(this.slot || 0, this.max);
    for (const k of PARTS) { const m = this.m[k]; m.count = n; m.visible = n > 0; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
  }
}
