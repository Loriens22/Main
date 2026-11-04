import * as THREE from 'three';
import type { Assets } from '../core/assets';
import { T, sstep, sstep2, lin, pulse, clamp, mix, rng, easeInOut, easeIn } from '../core/util';
import type { Grade } from '../core/post';
import { PhoneRig, SPECS } from '../phones/phoneRig';

/** Studio environment for crisp product reflections: dark room, big softboxes,
 *  thin strip lights (gives readable highlight lines along rails & glass). */
export function studioEnv(renderer: THREE.WebGLRenderer, tint = new THREE.Color(1, 1, 1), dark = 0.12) {
  const s = new THREE.Scene();
  s.background = new THREE.Color(dark, dark, dark);
  const room = new THREE.Mesh(new THREE.BoxGeometry(30, 16, 30), new THREE.MeshBasicMaterial({ color: new THREE.Color(dark, dark, dark * 1.05), side: THREE.BackSide }));
  s.add(room);
  const panel = (w: number, h: number, x: number, y: number, z: number, ry: number, rx: number, k: number, col = tint) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(k), side: THREE.DoubleSide }));
    m.position.set(x, y, z); m.rotation.set(rx, ry, 0);
    s.add(m);
  };
  panel(12, 8, 0, 7.9, 0, 0, Math.PI / 2, 5.0);           // overhead softbox
  panel(1.2, 12, -9, 2, 2, Math.PI / 2, 0, 7.0);          // left strip
  panel(1.2, 12, 9, 2, -2, -Math.PI / 2, 0, 6.0);          // right strip
  panel(10, 4, 0, 1.0, 14.5, Math.PI, 0, 2.2);             // front fill
  panel(6, 2, 0, -1, -14.5, 0, 0, 1.2);                    // rear kicker
  panel(14, 0.4, 0, 4.5, -10, 0, 0, 9.0);                  // horizon line
  const pm = new THREE.PMREMGenerator(renderer);
  const tex = pm.fromScene(s, 0.02).texture;
  pm.dispose();
  return tex;
}

const F = () => T.fold;
const GEN = (id: string) => F().gens.find((g: any) => g.id === id);

export class FoldScene {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(30, 16 / 9, 0.02, 100);
  rigs: Record<string, PhoneRig> = {};
  frags!: THREE.InstancedMesh;
  fragData: { dir: THREE.Vector3; r: number; spin: number; seed: number }[] = [];
  bfly!: THREE.Group;
  bwings: THREE.Mesh[] = [];
  key!: THREE.DirectionalLight;
  wipe!: THREE.Mesh;

  constructor(private A: Assets, private renderer: THREE.WebGLRenderer) {
    const s = this.scene;
    s.background = new THREE.Color(1.3, 1.3, 1.28);
    const env = studioEnv(renderer);
    this.key = new THREE.DirectionalLight(0xffffff, 2.2);
    this.key.position.set(2.5, 7, 4);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(1536, 1536);
    const sc = this.key.shadow.camera as THREE.OrthographicCamera;
    sc.left = -4; sc.right = 4; sc.top = 4; sc.bottom = -4; sc.near = 1; sc.far = 20;
    this.key.shadow.radius = 6;
    s.add(this.key);
    s.add(new THREE.HemisphereLight(0xffffff, 0xbcbcbc, 0.55));
    const rim = new THREE.DirectionalLight(0xffffff, 1.4);
    rim.position.set(-4, 2, -5);
    s.add(rim);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: 0.14 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.25;
    floor.receiveShadow = true;
    s.add(floor);
    const src = A.gltf.phones.scene;
    for (const id of ['fold1', 'fold2', 'fold3', 'fold4', 'fold5', 'fold6', 'fold7']) {
      const r = new PhoneRig(SPECS[id], src, A, env);
      r.root.visible = false;
      this.rigs[id] = r;
      s.add(r.root);
    }
    this.buildFragments();
    this.buildButterfly();
    // geometric light wipe (Fold6): a bright bar sweeping behind the device
    this.wipe = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 3, 3), transparent: true, opacity: 0 }));
    this.wipe.rotation.z = 0.5;
    this.wipe.position.z = -1.4;
    s.add(this.wipe);
  }

  buildFragments() {
    // screws, flex cables, shield cans, micro-lenses: an exploded "engineering cloud"
    const R = rng(808);
    const g = new THREE.CylinderGeometry(0.012, 0.012, 0.03, 8);
    const N = 140;
    this.frags = new THREE.InstancedMesh(g, new THREE.MeshPhysicalMaterial({ color: 0x8a8c92, metalness: 1, roughness: 0.28 }), N);
    this.frags.frustumCulled = false;
    this.frags.castShadow = true;
    for (let i = 0; i < N; i++) {
      this.fragData.push({ dir: new THREE.Vector3(R.range(-1, 1), R.range(-0.8, 0.8), R.range(-1, 1)).normalize(), r: R.range(1.2, 3.4), spin: R.range(2, 7), seed: R() });
      const kind = i % 4;
      this.frags.setColorAt(i, new THREE.Color(kind === 0 ? 0x9a9ca2 : kind === 1 ? 0xc9963a : kind === 2 ? 0x2a2a2e : 0x3a5a8a));
    }
    this.scene.add(this.frags);
  }

  buildButterfly() {
    const tex = this.A.tex.w_indigo;
    this.bfly = new THREE.Group();
    const g = new THREE.PlaneGeometry(1, 2, 4, 4);
    g.rotateX(-Math.PI / 2); g.translate(0.5, 0, 0);
    const mat = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.7 });
    for (const sd of [1, -1]) {
      const piv = new THREE.Object3D();
      const w = new THREE.Mesh(g, mat);
      w.castShadow = true;
      piv.add(w);
      piv.scale.x = sd;
      this.bfly.add(piv);
      this.bwings.push(piv as any);
    }
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.9, 4, 8), new THREE.MeshStandardMaterial({ color: 0x1a1612 }));
    body.rotation.x = Math.PI / 2; body.scale.setScalar(0.5);
    body.castShadow = true;
    this.bfly.add(body);
    this.bfly.scale.setScalar(0.16);
    this.scene.add(this.bfly);
  }

  /* -------------------------------------------------------------- shots */
  private hideAll() { for (const r of Object.values(this.rigs)) r.root.visible = false; }

  private place(r: PhoneRig, pos: number[], rotY: number, rotX = 0, rotZ = 0) {
    r.root.visible = true;
    r.root.position.set(pos[0], pos[1], pos[2]);
    r.root.rotation.set(rotX, rotY, rotZ, 'YXZ');
  }

  private camAt(p: number[], l: number[], f = 50) {
    const c = this.camera;
    // tighter, product-ad framing: pull the lens in toward the subject
    const k = 0.86;
    c.position.set(l[0] + (p[0] - l[0]) * k, l[1] + (p[1] - l[1]) * k, l[2] + (p[2] - l[2]) * k);
    c.lookAt(l[0], l[1], l[2]);
    c.filmGauge = 36; c.setFocalLength(f);
  }

  /** frame one generation; returns fragment-cloud strength */
  private gen(id: string, t: number) {
    const g = GEN(id);
    const r = this.rigs[id];
    const lt = t - g.t0;
    const asmU = clamp(lt / g.asm);
    const dur = g.t1 - g.t0;
    return { g, r, lt, asmU, dur };
  }

  update(t: number) {
    this.hideAll();
    this.frags.visible = false;
    this.bfly.visible = false;
    (this.wipe.material as THREE.MeshBasicMaterial).opacity = 0;
    const gens = F().gens;
    let cur = null as any;
    for (const g of gens) if (t >= g.t0 && t < g.t1) cur = g;
    if (!cur) { this.camAt([0, 0.2, 5.4], [0, 0, 0], 50); return; } // pure white pauses
    const { r, lt, asmU, dur } = this.gen(cur.id, t);
    const id = cur.id;
    let fold = Math.PI, ry = 0, rx = 0, rz = 0, pos = [0, 0, 0], cam = { p: [0, 0.25, 5.6], l: [0, 0, 0], f: 50 };
    let assembling = asmU < 1, dis = 0;
    const end = cur.t1;
    switch (id) {
      case 'fold1': {
        // levitate parts -> closed 3/4 hero (thick rounded body, narrow cover) -> open -> close briefly -> dissolve
        ry = mix(Math.PI + 0.75, Math.PI - 0.55, sstep(lt, 0, 6.3)) ;
        ry = mix(ry, Math.PI * 2 - 0.3, sstep(lt, 5.4, 6.4));                    // turn to show the cover screen
        ry = mix(ry, Math.PI * 2 + 0.25, sstep(lt, 6.4, 9.0));
        fold = mix(Math.PI, 0.05, sstep2(lt, 6.4, 8.9));                         // open about the real hinge axis
        fold = mix(fold, 1.9, sstep(lt, 9.9, 10.8));                             // close again (mechanism read)
        rx = -0.08 + 0.05 * Math.sin(lt * 0.6);
        pos = [0, 0.02 * Math.sin(lt * 1.3), 0];
        cam = { p: [mix(1.2, 0.2, sstep(lt, 0, 6)), mix(0.9, 0.25, sstep(lt, 0, 6)), mix(6.4, 5.3, sstep(lt, 0, 9))], l: [0, 0, 0], f: mix(42, 50, sstep(lt, 0, 6)) };
        dis = sstep(t, end - 1.3, end - 0.05);
        break;
      }
      case 'fold2': {
        ry = mix(Math.PI - 0.9, Math.PI - 0.35, sstep(lt, 0, 2.4));
        fold = mix(Math.PI, 2.15, sstep(lt, 2.4, 3.2));                          // hinge slightly open
        ry = mix(ry, Math.PI * 2 + 0.2, sstep(lt, 3.2, 5.0));
        fold = mix(fold, 0.05, sstep2(lt, 3.6, 5.0));                            // then wide: purple/teal wings
        rx = -0.06;
        cam = { p: [mix(-0.8, 0.3, sstep(lt, 0, 5)), 0.3, mix(5.8, 5.0, sstep(lt, 0, 6.5))], l: [0, 0, 0], f: 50 };
        dis = sstep(t, end - 0.8, end);
        break;
      }
      case 'fold3': {
        ry = mix(Math.PI - 0.5, Math.PI + 0.4, sstep(lt, 0, 1.6));
        ry = mix(ry, Math.PI * 2 - 0.15, sstep(lt, 1.5, 3.0));
        fold = mix(Math.PI, 0.04, sstep2(lt, 1.6, 3.2));
        rx = -0.05;
        cam = { p: [0.6 - lt * 0.15, 0.3, 5.2], l: [0, 0, 0], f: 52 };
        dis = sstep(t, end - 0.6, end);
        break;
      }
      case 'fold4': {
        ry = mix(Math.PI - 0.95, Math.PI - 0.45, sstep(lt, 0, 1.4));
        fold = mix(Math.PI, Math.PI / 2, sstep(lt, 1.2, 2.6));                    // ~half-open (Flex-style)
        ry = mix(ry, Math.PI + 0.55, sstep(lt, 2.0, 3.2));
        rx = -0.12;
        cam = { p: [mix(1.6, -1.4, sstep(lt, 0.8, 3.6)), 0.55, mix(4.6, 4.2, lt / dur)], l: [0, 0, 0], f: 50 };  // lens orbit
        dis = sstep(t, end - 0.55, end);
        break;
      }
      case 'fold5': {
        ry = mix(Math.PI + 1.25, Math.PI + 0.35, sstep(lt, 0, 2.2));             // slender edge profile -> back
        fold = mix(Math.PI, 0.6, sstep(lt, 1.8, 2.8));
        ry = mix(ry, Math.PI * 2 + 0.3, sstep(lt, 2.0, 3.0));
        rx = -0.05;
        cam = { p: [0.2, 0.25, 4.8], l: [0, 0, 0], f: 52 };
        dis = sstep(t, end - 0.5, end);
        break;
      }
      case 'fold6': {
        ry = mix(Math.PI - 0.7, Math.PI + 0.25, sstep(lt, 0, 2.6));               // squared rails catch the wipe
        fold = Math.PI;
        rx = -0.04;
        cam = { p: [-0.3, 0.2, 4.8], l: [0, 0, 0], f: 52 };
        const w = lin(lt, 0.8, 2.4);
        (this.wipe.material as THREE.MeshBasicMaterial).opacity = Math.sin(w * Math.PI) * 0.9;
        this.wipe.position.x = mix(-2.5, 2.5, w);
        dis = sstep(t, end - 0.5, end);
        break;
      }
      case 'fold7': {
        // dense cluster -> thin hero rotation -> face-on open screen (ref 13) -> book angle -> launch
        ry = mix(Math.PI + 1.4, Math.PI + 0.25, sstep(lt, 0, 2.4));
        ry = mix(ry, Math.PI + 1.45, sstep(lt, 2.2, 4.0));                        // edge-on: 8.9 mm folded
        ry = mix(ry, Math.PI * 2, sstep(lt, 4.0, 5.6));
        fold = mix(Math.PI, 0.0, sstep2(lt, 4.4, 6.4));
        fold = mix(fold, 1.15, sstep(lt, 7.8, 8.6));                              // book-like half-open
        rx = mix(-0.05, 0.0, sstep(lt, 4, 6));
        const launch = T.fold.launch;
        const lk = lin(t, launch, end);
        const glide = sstep(t, launch - 0.7, launch);
        pos = [0, 0, glide * 1.2 + easeIn(lk) * 5.1];
        rz = lk * 0.2;
        cam = { p: [mix(0.9, 0, sstep(lt, 2, 6)), mix(0.35, 0.05, sstep(lt, 2, 6)), mix(5.6, 4.6, sstep(lt, 0, 6))], l: [0, 0, 0], f: 50 };
        break;
      }
    }
    // assemble / perform / disassemble
    r.resetParts();
    r.setFold(r.angles.map((_, j) => fold));
    if (assembling) r.assemble(easeOutSoft(asmU));
    else if (dis > 0) r.disassemble(dis);
    this.place(r, pos, ry, rx, rz);
    r.brightness.value = 1.0;
    this.camAt(cam.p, cam.l, cam.f);
    // engineering fragments converge during assembly
    const fragK = assembling ? asmU : 0;
    if (assembling) {
      this.frags.visible = true;
      const m4 = new THREE.Matrix4();
      this.fragData.forEach((f, i) => {
        const k = clamp((asmU - f.seed * 0.5) / 0.5);
        const away = 1 - k * k * (3 - 2 * k);
        const ang = away * 3 + t * 0.4;
        const p = f.dir.clone().multiplyScalar(f.r * away);
        const x = p.x * Math.cos(ang) - p.z * Math.sin(ang), z = p.x * Math.sin(ang) + p.z * Math.cos(ang);
        const sc = away > 0.02 ? (0.6 + f.seed * 1.6) * Math.min(1, away * 3) : 0;
        m4.compose(new THREE.Vector3(x, p.y, z).add(r.root.position), new THREE.Quaternion().setFromEuler(new THREE.Euler(t * f.spin, f.seed * 6, t * f.spin * 0.7)), new THREE.Vector3(sc * (i % 3 === 1 ? 3 : 1), sc, sc * (i % 3 === 1 ? 0.2 : 1)));
        this.frags.setMatrixAt(i, m4);
      });
      this.frags.instanceMatrix.needsUpdate = true;
    }
    // the single butterfly echo of the painted garden (Fold2)
    const bf = F().butterfly;
    if (t > bf[0] && t < bf[1]) {
      const u = lin(t, bf[0], bf[1]);
      this.bfly.visible = true;
      this.bfly.position.set(mix(-3.2, 3.4, u), 0.4 + Math.sin(u * 9) * 0.25 + u * 0.5, 1.6 - Math.sin(u * 3.1) * 0.8);
      this.bfly.rotation.set(-0.35, Math.PI / 2 + Math.PI + Math.sin(u * 7) * 0.2, Math.sin(u * 9) * 0.3, 'YXZ');
      const a = 0.2 + 1.0 * (0.5 + 0.5 * Math.sin(t * 52));
      this.bwings[0].rotation.z = a; this.bwings[1].rotation.z = a;
    }
    void fragK;
  }

  grade(t: number): Grade {
    return { exposure: 1.0, lift: [0, 0, 0], gamma: [1, 1, 1], gain: [1.13, 1.13, 1.13], sat: 1.06, contrast: 1.08, vignette: 0.1, grain: 0.016, ca: 0.0006, bloom: 0.0, bloomThreshold: 1.5 };
  }
}

function easeOutSoft(x: number) { return x; }
