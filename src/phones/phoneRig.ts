import * as THREE from 'three';
import type { Assets } from '../core/assets';
import { canvasTex, rng } from '../core/util';

/* ---------------------------------------------------------------------------
 * Hinge sheet (units: 1 = 100 mm). Panel order = FRONT (inner display) view.
 *   Samsung Fold 1-7 : [L | R], one inward hinge, anchor = R (camera half)
 *   Huawei Mate XT   : [C | B | A], C-B OUTWARD (screen wraps outside, C is the
 *                      6.4" cover), B-A INWARD (A carries the cameras); Z/S fold
 *   Huawei Mate XT 2 : [P1 | P2 | P3], both hinges INWARD from both sides
 *                      (P3 folds first, P1 over it with a larger hinge radius),
 *                      P1's back carries the 6.5" cover display
 * ------------------------------------------------------------------------- */
export interface DeviceSpec {
  id: string; H: number; W: number; t: number; panels: number;
  hinges: { kind: 'in' | 'out'; r: number }[];
  anchor: number;
  bezel: [number, number, number]; // side, top, bottom (mm) of the inner display
  corner: number; // display corner radius (mm)
  punch?: [number, number, number]; // u, v, radius(mm) selfie punch-hole on inner display (front view)
  notch?: boolean;
  inner: string; cover?: string;
  palette: Record<string, any>;
}

const mm = (v: number) => v * 0.01;

export const SPECS: Record<string, DeviceSpec> = {
  fold1: { id: 'fold1', H: 160.9, W: 117.9, t: 7.6, panels: 2, hinges: [{ kind: 'in', r: 1.0 }], anchor: 1, bezel: [3.2, 4.0, 4.0], corner: 6, notch: true, inner: 'fold1_inner', cover: 'fold1_cover',
    palette: { frame: [0x2b2c30, 1, 0.28], back: [0x0a0a0c, 0, 0.12, 1], cam: [0x070708, 0, 0.1, 1], ring: [0x9a9ca2, 1, 0.2], cover: [0x050506, 0, 0.08, 1], button: [0x2b2c30, 1, 0.3] } },
  fold2: { id: 'fold2', H: 159.2, W: 128.2, t: 6.9, panels: 2, hinges: [{ kind: 'in', r: 1.5 }], anchor: 1, bezel: [3.0, 3.4, 3.4], corner: 6, punch: [0.86, 0.96, 1.6], inner: 'fold2_inner', cover: 'fold2_cover',
    palette: { frame: [0xb58872, 1, 0.3], back: [0xc89a84, 0.55, 0.38, 0.4], cam: [0xc0927c, 1, 0.22], ring: [0x8a6050, 1, 0.25], cover: [0x050506, 0, 0.08, 1], button: [0xb58872, 1, 0.3] } },
  fold3: { id: 'fold3', H: 158.2, W: 128.1, t: 6.4, panels: 2, hinges: [{ kind: 'in', r: 1.6 }], anchor: 1, bezel: [2.8, 3.0, 3.0], corner: 6, punch: [0.84, 0.965, 1.2], inner: 'fold3_inner', cover: 'fold3_cover',
    palette: { frame: [0xd6d4d8, 1, 0.22], back: [0xebe4e6, 0.15, 0.5, 0.2], cam: [0xdcdbe0, 1, 0.2], ring: [0xcfcfd4, 1, 0.2], cover: [0x050506, 0, 0.08, 1], button: [0xd6d4d8, 1, 0.25] } },
  fold4: { id: 'fold4', H: 155.1, W: 130.1, t: 6.3, panels: 2, hinges: [{ kind: 'in', r: 1.6 }], anchor: 1, bezel: [2.6, 2.8, 2.8], corner: 6, punch: [0.84, 0.965, 1.2], inner: 'fold4_inner', cover: 'fold4_cover',
    palette: { frame: [0xd8c39c, 1, 0.24], back: [0xefe7d6, 0.1, 0.45, 0.2], cam: [0xe0cfac, 1, 0.24], ring: [0xd2bd94, 1, 0.22], cover: [0x050506, 0, 0.08, 1], button: [0xd8c39c, 1, 0.25] } },
  fold5: { id: 'fold5', H: 154.9, W: 129.9, t: 6.1, panels: 2, hinges: [{ kind: 'in', r: 0.6 }], anchor: 1, bezel: [2.5, 2.6, 2.6], corner: 6, punch: [0.84, 0.965, 1.2], inner: 'fold5_inner', cover: 'fold5_cover',
    palette: { frame: [0xa9bcd6, 1, 0.24], back: [0xb6c6de, 0.1, 0.5, 0.15], cam: [0xa9bcd6, 1, 0.22], ring: [0x9fb2cc, 1, 0.22], cover: [0x050506, 0, 0.08, 1], button: [0xa9bcd6, 1, 0.25] } },
  fold6: { id: 'fold6', H: 153.5, W: 132.6, t: 5.6, panels: 2, hinges: [{ kind: 'in', r: 0.45 }], anchor: 1, bezel: [2.3, 2.4, 2.4], corner: 4, punch: [0.84, 0.965, 1.2], inner: 'fold6_inner', cover: 'fold6_cover',
    palette: { frame: [0xb4b6ba, 1, 0.2], back: [0xa9abaf, 0.1, 0.45, 0.2], cam: [0xb4b6ba, 1, 0.2], ring: [0x3a3c40, 1, 0.25], cover: [0x050506, 0, 0.08, 1], button: [0xb4b6ba, 1, 0.22] } },
  fold7: { id: 'fold7', H: 158.4, W: 143.2, t: 4.2, panels: 2, hinges: [{ kind: 'in', r: 0.25 }], anchor: 1, bezel: [2.2, 2.3, 2.3], corner: 5, punch: [0.79, 0.955, 1.5], inner: 'fold7_inner', cover: 'fold7_cover',
    palette: { frame: [0x2b3f7c, 1, 0.26], back: [0x22346e, 0.2, 0.3, 0.6], cam: [0x2b3f7c, 1, 0.24], ring: [0x23356a, 1, 0.24], cover: [0x050506, 0, 0.08, 1], button: [0x2b3f7c, 1, 0.25] } },
  matext: { id: 'matext', H: 156.7, W: 219.0, t: 3.6, panels: 3, hinges: [{ kind: 'out', r: 3.85 }, { kind: 'in', r: 1.2 }], anchor: 1, bezel: [2.4, 2.6, 2.6], corner: 6, punch: [0.075, 0.95, 1.6], inner: 'matext_inner', cover: 'matext_cover',
    palette: { frame: [0xd8ac6c, 1, 0.22], back: 'redleather', cam: [0xd6aa68, 1, 0.18], ring: [0xc9a060, 1, 0.22], emblem: [0xdcb070, 1, 0.2], button: [0xd8ac6c, 1, 0.22] } },
  matext2: { id: 'matext2', H: 157.2, W: 219.2, t: 3.75, panels: 3, hinges: [{ kind: 'in', r: 1.2 + 1.875 + 0.2 }, { kind: 'in', r: 1.2 }], anchor: 1, bezel: [2.4, 2.6, 2.6], corner: 6, punch: [0.06, 0.95, 1.5], inner: 'matext2_inner', cover: 'matext2_cover',
    palette: { frame: [0x9b6ce0, 1, 0.2], back: 'brocade', cam: [0xa77cf0, 1, 0.14], ring: [0x7a58b8, 1, 0.2], cover: [0x050506, 0, 0.08, 1], emblem: [0xb28af0, 1, 0.2], button: [0x9b6ce0, 1, 0.22] } },
};

interface Seg { s0: number; s1: number; k: number; }

/** Analytic hinge spine: flat runs + circular arcs. Arc j has length π·r_j so
 *  a 180° fold bends at exactly radius r_j; curvature = ±θ_j / arcLen. */
export class Spine {
  L: number; segs: Seg[] = []; bounds: number[] = []; arcs: { s0: number; s1: number; len: number; sign: number }[] = [];
  constructor(public spec: DeviceSpec) {
    const w = mm(spec.W) / spec.panels;
    this.L = mm(spec.W);
    for (let j = 0; j < spec.panels - 1; j++) {
      const b = w * (j + 1);
      const len = Math.PI * mm(spec.hinges[j].r);
      this.bounds.push(b);
      this.arcs.push({ s0: b - len / 2, s1: b + len / 2, len, sign: spec.hinges[j].kind === 'in' ? 1 : -1 });
    }
  }
  setAngles(theta: number[]) {
    this.segs = [];
    let s = 0;
    this.arcs.forEach((a, j) => {
      if (a.s0 > s) this.segs.push({ s0: s, s1: a.s0, k: 0 });
      this.segs.push({ s0: a.s0, s1: a.s1, k: (a.sign * theta[j]) / a.len });
      s = a.s1;
    });
    this.segs.push({ s0: s, s1: this.L, k: 0 });
  }
  /** position (x, z) + heading at arc length s (unanchored frame) */
  eval(s: number) {
    let x = 0, z = 0, phi = 0;
    for (const g of this.segs) {
      const ds = Math.min(s, g.s1) - g.s0;
      if (ds <= 0) break;
      if (Math.abs(g.k) < 1e-9) { x += Math.cos(phi) * ds; z += Math.sin(phi) * ds; }
      else {
        const p2 = phi + g.k * ds;
        x += (Math.sin(p2) - Math.sin(phi)) / g.k;
        z += (-Math.cos(p2) + Math.cos(phi)) / g.k;
        phi = p2;
      }
      if (s <= g.s1) break;
    }
    return { x, z, phi };
  }
  frame(s: number, m = new THREE.Matrix4()) {
    const e = this.eval(s);
    const c = Math.cos(e.phi), sn = Math.sin(e.phi);
    // columns: tangent (x), up (y), screen normal (z)
    m.set(c, 0, -sn, e.x, 0, 1, 0, 0, sn, 0, c, e.z, 0, 0, 0, 1);
    return m;
  }
}

function physical(def: any, A: Assets, kind?: string): THREE.MeshPhysicalMaterial {
  if (def === 'redleather') {
    const m = new THREE.MeshPhysicalMaterial({ map: A.tex.redLeather, normalMap: A.tex.redLeatherN, roughnessMap: A.tex.redLeatherR, roughness: 1, color: 0xffffff, sheen: 0.6, sheenColor: new THREE.Color(0.8, 0.2, 0.2), sheenRoughness: 0.5, clearcoat: 0.15, normalScale: new THREE.Vector2(0.7, 0.7) });
    return m;
  }
  if (def === 'brocade') {
    return new THREE.MeshPhysicalMaterial({ map: A.tex.brocade, normalMap: A.tex.brocadeN, roughness: 0.42, metalnessMap: A.tex.brocadeORM, metalness: 1, color: 0xffffff, clearcoat: 0.85, clearcoatRoughness: 0.2, iridescence: 0.35, iridescenceIOR: 1.6, sheen: 0.5, sheenColor: new THREE.Color(0.6, 0.4, 0.9) });
  }
  const [c, metal, rough, coat] = def;
  const m = new THREE.MeshPhysicalMaterial({ color: c, metalness: metal, roughness: rough, clearcoat: coat ?? 0, clearcoatRoughness: 0.08 });
  // (no anisotropy: rail side faces have degenerate UV gradients -> NaN tangents)
  return m;
}

export class PhoneRig {
  root = new THREE.Group();        // world placement (position/rotation by the director)
  body = new THREE.Group();        // recentred holder
  panels: THREE.Object3D[] = [];
  spine: Spine;
  screen: THREE.Mesh;
  screenMat: THREE.MeshPhysicalMaterial;
  hingeBars: THREE.Mesh[] = [];
  angles: number[];
  parts: { o: THREE.Object3D; pos: THREE.Vector3; quat: THREE.Quaternion; scl: THREE.Vector3; order: number; dir: THREE.Vector3; spin: THREE.Vector3; seed: number }[] = [];
  coverMat?: THREE.MeshPhysicalMaterial;
  glow = { value: 1 };
  brightness = { value: 1 };
  panelLit = { value: new THREE.Vector3(1, 1, 1) };
  coverMix = { value: 0 };

  constructor(public spec: DeviceSpec, src: THREE.Object3D, A: Assets, env: THREE.Texture | null) {
    this.root.add(this.body);
    const P = spec.palette;
    const mats: Record<string, THREE.Material> = {
      Frame: physical(P.frame, A), Back: physical(P.back, A), CamIsland: physical(P.cam, A), CamRing: physical(P.cam, A), LensRing: physical(P.ring, A),
      CoverGlass: physical(P.cover ?? [0x050506, 0, 0.08, 1], A), Button: physical(P.button, A), Emblem: physical(P.emblem ?? P.frame, A),
      Bezel: new THREE.MeshPhysicalMaterial({ color: 0x020203, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.05 }),
      LensGlass: new THREE.MeshPhysicalMaterial({ color: 0x050608, roughness: 0.02, metalness: 0, clearcoat: 1, transparent: true, opacity: 0.55, iridescence: 0.6, iridescenceIOR: 1.8 }),
      LensElement: new THREE.MeshPhysicalMaterial({ color: 0x0b1030, roughness: 0.15, metalness: 0.8, iridescence: 1, iridescenceIOR: 2.0, iridescenceThicknessRange: [200, 600] }),
      LensBarrel: new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.4 }),
      CamGlassBlack: new THREE.MeshPhysicalMaterial({ color: 0x030304, roughness: 0.06, clearcoat: 1 }),
      Flash: new THREE.MeshStandardMaterial({ color: 0xf2e6c0, roughness: 0.3, emissive: 0x302810 }),
    };
    for (const m of Object.values(mats)) { if (env && (m as any).isMeshStandardMaterial) { (m as any).envMap = env; } }
    if (spec.cover) {
      this.coverMat = new THREE.MeshPhysicalMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: A.screen[spec.cover], emissiveIntensity: 1.0, roughness: 0.05, clearcoat: 1, envMap: env ?? null });
    }
    const dev = src.getObjectByName(spec.id)!.clone(true);
    for (let i = 0; i < spec.panels; i++) {
      const g = dev.getObjectByName(`${spec.id}_P${i}`)!;
      g.position.set(0, 0, 0); g.quaternion.identity();
      this.panels.push(g);
    }
    dev.traverse((o: any) => {
      if (!o.isMesh) return;
      o.castShadow = true; o.receiveShadow = true;
      const pick = (m: any) => {
        const n: string = m.name || '';
        const key = n.replace(/^(fold\d|matext2|matext|Phone)_/, '');
        if (key === 'CoverDisplay') return this.coverMat ?? mats.CoverGlass;
        return mats[key] ?? mats.Frame;
      };
      o.material = Array.isArray(o.material) ? o.material.map(pick) : pick(o.material);
    });
    this.panels.forEach((p) => this.body.add(p));
    // continuous flexible inner display
    this.spine = new Spine(spec);
    this.screenMat = this.makeScreenMaterial(A, env);
    this.screen = new THREE.Mesh(new THREE.BufferGeometry(), this.screenMat);
    this.screen.receiveShadow = false;
    this.body.add(this.screen);
    // hinge spines (barrels) visible when folded
    spec.hinges.forEach((h, j) => {
      if (h.kind === 'out') return;
      const g = new THREE.CylinderGeometry(1, 1, mm(spec.H) * 0.975, 40, 1, false, Math.PI / 2, Math.PI);
      const bar = new THREE.Mesh(g, mats.Frame);
      bar.castShadow = true;
      this.hingeBars.push(bar);
      bar.userData.j = j;
      this.body.add(bar);
    });
    this.angles = new Array(spec.panels - 1).fill(0);
    this.setFold(this.angles.map(() => Math.PI));
    // record assembly parts (all meshes) in their assembled local transforms
    const R = rng(spec.id.length * 97 + spec.H);
    const order = (n: string) => (/body/.test(n) ? 0 : /back/.test(n) ? 0.35 : /cover/.test(n) ? 0.5 : /cam|flash|emblem/.test(n) ? 0.62 : /btn/.test(n) ? 0.75 : 0.45);
    this.root.traverse((o: any) => {
      if (!o.isMesh || this.hingeBars.includes(o)) return;
      const dir = new THREE.Vector3(R.range(-1, 1), R.range(-1, 1), R.range(-1, 1)).normalize();
      if (/back|cam|cover|flash/.test(o.name)) dir.z = -Math.abs(dir.z) - 0.6;
      this.parts.push({ o, pos: o.position.clone(), quat: o.quaternion.clone(), scl: o.scale.clone(), order: o === this.screen ? 0.42 : order(o.name), dir: dir.normalize(), spin: new THREE.Vector3(R.range(-3, 3), R.range(-3, 3), R.range(-3, 3)), seed: R() });
    });
  }

  makeScreenMaterial(A: Assets, env: THREE.Texture | null) {
    const s = this.spec;
    // rounded-corner / punch-hole mask in display UV space
    const L = mm(s.W), dispW = L - 2 * mm(s.bezel[0]), dispH = mm(s.H) - mm(s.bezel[1]) - mm(s.bezel[2]);
    const mask = canvasTex(1024, Math.round(1024 * dispH / dispW), (g, w, h) => {
      g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
      const r = (mm(s.corner) / dispW) * w;
      g.fillStyle = '#fff';
      g.beginPath(); (g as any).roundRect(0, 0, w, h, r); g.fill();
      g.fillStyle = '#000';
      if (s.punch) { const [u, v, rr] = s.punch; g.beginPath(); g.arc(u * w, (1 - v) * h, (mm(rr) / dispW) * w, 0, Math.PI * 2); g.fill(); }
      if (s.notch) { g.beginPath(); (g as any).roundRect(w * 0.79, 0, w * 0.12, h * 0.03, h * 0.012); g.fill(); }
    }, false);
    const m = new THREE.MeshPhysicalMaterial({
      color: 0x000000, emissive: 0xffffff, emissiveMap: A.screen[s.inner], emissiveIntensity: 1.0,
      roughness: 0.04, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.02, alphaMap: mask, alphaTest: 0.5, envMap: env ?? null, envMapIntensity: 0.25, side: THREE.FrontSide,
    });
    const coverTex = s.cover ? A.screen[s.cover] : null;
    m.onBeforeCompile = (sh: any) => {
      sh.uniforms.uBright = this.brightness;
      sh.uniforms.uLit = this.panelLit;
      sh.uniforms.uCoverMix = this.coverMix;
      sh.uniforms.tCover = { value: coverTex };
      sh.fragmentShader = 'uniform float uBright; uniform vec3 uLit; uniform float uCoverMix; uniform sampler2D tCover;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          float u = vEmissiveMapUv.x;
          float lit = ${s.panels === 3 ? 'u < 0.3333 ? uLit.x : (u < 0.6667 ? uLit.y : uLit.z)' : 'u < 0.5 ? uLit.x : uLit.y'};
          ${s.panels === 3 && coverTex ? 'if (u < 0.3333 && uCoverMix > 0.0) { vec4 cv = texture2D(tCover, vec2(u * 3.0, vEmissiveMapUv.y)); totalEmissiveRadiance = mix(totalEmissiveRadiance, cv.rgb * emissive, uCoverMix); }' : ''}
          totalEmissiveRadiance *= uBright * lit;
        }`);
    };
    return m;
  }

  /** Pose the hinges (radians: 0 = flat open, π = closed) and rebuild the strip. */
  setFold(theta: number[]) {
    const s = this.spec, sp = this.spine;
    this.angles = theta.slice();
    sp.setAngles(theta);
    const w = sp.L / s.panels;
    const anchorM = sp.frame(w * (s.anchor + 0.5));
    const inv = anchorM.clone().invert();
    const m = new THREE.Matrix4();
    this.panels.forEach((p, i) => {
      sp.frame(w * (i + 0.5), m);
      m.premultiply(inv);
      m.decompose(p.position, p.quaternion, p.scale);
    });
    // hinge barrels at arc midpoints, swelling as the hinge closes
    const tRad = mm(s.t);
    this.hingeBars.forEach((bar) => {
      const j = bar.userData.j;
      const a = sp.arcs[j];
      const r = mm(s.hinges[j].r);
      const k = Math.min(1, theta[j] / Math.PI);
      sp.frame((a.s0 + a.s1) / 2, m).premultiply(inv);
      m.decompose(bar.position, bar.quaternion, bar.scale);
      const nrm = new THREE.Vector3(0, 0, 1).applyQuaternion(bar.quaternion);
      bar.position.addScaledVector(nrm, r * k);
      bar.scale.set((r + tRad) * (0.35 + 0.65 * k), 1, (r + tRad) * Math.max(0.02, k));
      bar.visible = k > 0.02;
    });
    // flexible display strip: dense in the arcs
    const s0 = mm(s.bezel[0]), s1 = sp.L - mm(s.bezel[0]);
    const ss: number[] = [];
    const pushRange = (a: number, b: number, n: number) => { for (let i = 0; i < n; i++) ss.push(a + (b - a) * (i / n)); };
    let cur = s0;
    for (const a of sp.arcs) { pushRange(cur, a.s0, 3); pushRange(a.s0, a.s1, 28); cur = a.s1; }
    pushRange(cur, s1, 3); ss.push(s1);
    const yTop = mm(s.H) / 2 - mm(s.bezel[1]), yBot = -mm(s.H) / 2 + mm(s.bezel[2]);
    const P = new Float32Array(ss.length * 2 * 3), N = new Float32Array(ss.length * 2 * 3), U = new Float32Array(ss.length * 2 * 2);
    const idx: number[] = [];
    const v = new THREE.Vector3(), nn = new THREE.Vector3();
    ss.forEach((sv, i) => {
      const e = sp.eval(sv);
      const nx = -Math.sin(e.phi), nz = Math.cos(e.phi);
      for (let k2 = 0; k2 < 2; k2++) {
        v.set(e.x + nx * 0.0006, k2 ? yTop : yBot, e.z + nz * 0.0006).applyMatrix4(inv);
        nn.set(nx, 0, nz).transformDirection(inv);
        const o = (i * 2 + k2);
        P.set([v.x, v.y, v.z], o * 3); N.set([nn.x, nn.y, nn.z], o * 3);
        U.set([(sv - s0) / (s1 - s0), k2], o * 2);
      }
      if (i < ss.length - 1) { const a0 = i * 2, b0 = a0 + 2; idx.push(a0, b0, a0 + 1, a0 + 1, b0, b0 + 1); }
    });
    const g = this.screen.geometry;
    g.setAttribute('position', new THREE.BufferAttribute(P, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(U, 2));
    g.setIndex(idx);
    g.computeBoundingSphere();
    // recentre so the device's visual centre stays put
    const c = new THREE.Vector3();
    this.panels.forEach((p) => c.add(p.position));
    c.multiplyScalar(1 / this.panels.length);
    this.body.position.copy(c).multiplyScalar(-1);
  }

  /** Assembly: u in [0,1]; parts fly in along curved paths with staggered,
   *  physically eased arrivals (slight overshoot = magnetic click). */
  assemble(u: number, spread = 3.2) {
    for (const p of this.parts) {
      const start = p.order * 0.55 + p.seed * 0.12;
      const k = Math.min(1, Math.max(0, (u - start) / 0.33));
      const e = k <= 0 ? 0 : k >= 1 ? 1 : 1 - Math.pow(1 - k, 3) * Math.cos(k * 4.2);
      this.placePart(p, 1 - e, spread, k <= 0 ? 0 : Math.min(1, k * 3));
    }
    this.hingeBars.forEach((b) => { b.visible = b.visible && u > 0.62; });
  }

  /** Disassembly: outer parts leave first, drifting out and shrinking to light. */
  disassemble(u: number, spread = 3.0) {
    for (const p of this.parts) {
      const start = (1 - p.order) * 0.5 + p.seed * 0.15;
      const k = Math.min(1, Math.max(0, (u - start) / 0.35));
      const e = k * k * (3 - 2 * k);
      this.placePart(p, e, spread, 1 - e);
    }
    this.hingeBars.forEach((b) => { b.visible = b.visible && u < 0.3; });
  }

  private placePart(p: PhoneRig['parts'][number], away: number, spread: number, sc: number) {
    p.o.position.copy(p.pos).addScaledVector(p.dir, away * spread * (0.6 + p.seed));
    const ang = away * (2.2 + p.seed * 2);
    const x = p.o.position.x, z = p.o.position.z;
    p.o.position.x = x * Math.cos(ang) - z * Math.sin(ang) * away;
    p.o.position.z = x * Math.sin(ang) * away + z * Math.cos(ang);
    p.o.quaternion.copy(p.quat).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(p.spin.x * away, p.spin.y * away, p.spin.z * away)));
    p.o.scale.copy(p.scl).multiplyScalar(sc);
    p.o.visible = sc > 0.001;
  }

  resetParts() {
    for (const p of this.parts) { p.o.position.copy(p.pos); p.o.quaternion.copy(p.quat); p.o.scale.copy(p.scl); p.o.visible = true; }
  }
}
