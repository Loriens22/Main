import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { Assets } from '../core/assets';
import { rep } from '../core/assets';
import { T, Track, evalTracks, rng, sstep, lin, pulse, clamp, mix, canvasTex } from '../core/util';
import type { Grade } from '../core/post';
import { ManActor } from './man';
import { LogoTexture, crtMaterial } from './crt';

const W = { x0: -3.2, x1: 3.2, z0: -4.0, z1: 4.6, h: 4.2 };
const SUN_DIR = new THREE.Vector3(0.22, -0.44, 0.87).normalize();
const WINDOWS_X = [-1.8, 0, 1.8];

export class ManorScene {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.03, 120);
  man!: ManActor;
  logo: LogoTexture;
  crt!: THREE.ShaderMaterial;
  tvLight!: THREE.PointLight;
  sun!: THREE.DirectionalLight;
  sofaCushion: THREE.Mesh | null = null;
  swayMats: THREE.Material[] = [];
  shaftMat!: THREE.ShaderMaterial;
  dust!: THREE.Points;
  tracks: Track[];
  tvGroup!: THREE.Object3D;

  constructor(private A: Assets, private renderer: THREE.WebGLRenderer, logo: LogoTexture) {
    this.logo = logo;
    const s = this.scene;
    s.background = new THREE.Color(0x1a120c);
    const pm = new THREE.PMREMGenerator(renderer);
    const env = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    // No global IBL (expensive in software rendering): reflective materials get
    // the captured room cube individually (see roomReflect below).
    this.buildRoom();
    this.buildOutside();
    this.buildFurniture();
    this.buildLights();
    this.buildShafts();
    this.buildMan();
    // capture the finished room once for glass reflections (CRT tube, windows)
    const cubeRT = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType });
    const cc = new THREE.CubeCamera(0.05, 60, cubeRT);
    cc.position.set(2.35, 1.12, 0.52);
    this.man.group.visible = false;
    this.scene.add(cc);
    cc.update(renderer, s);
    const roomEnv = pm.fromCubemap(cubeRT.texture).texture;
    const reflect = new Set<THREE.Material>();
    this.scene.traverse((o: any) => {
      if (!o.isMesh) return;
      for (const m of (Array.isArray(o.material) ? o.material : [o.material]) as any[]) {
        if (o.userData.roomReflect || m.userData?.reflect || (m.metalness ?? 0) > 0.5 || (m.clearcoat ?? 0) > 0.3) reflect.add(m);
      }
    });
    reflect.forEach((m: any) => { m.envMap = roomEnv; m.envMapIntensity = m.userData?.envI ?? m.envMapIntensity ?? 1; m.needsUpdate = true; });
    this.tracks = this.cameraTracks();
  }

  /* ----------------------------------------------------------- room shell */
  private std(opts: THREE.MeshStandardMaterialParameters) { return new THREE.MeshStandardMaterial(opts); }

  buildRoom() {
    const A = this.A, s = this.scene;
    const floorMat = this.std({ map: rep(A.tex.parquet, 4, 5.4), normalMap: rep(A.tex.parquetN, 4, 5.4), roughness: 0.42, normalScale: new THREE.Vector2(0.6, 0.6) });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W.x1 - W.x0, W.z1 - W.z0), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, (W.z0 + W.z1) / 2);
    floor.receiveShadow = true;
    s.add(floor);
    const plaster = this.std({ map: rep(A.tex.plaster, 2, 2), normalMap: rep(A.tex.plasterN, 2, 2), roughness: 0.92, color: 0xe8dcc4 });
    // window wall with three arched openings
    const shape = new THREE.Shape();
    shape.moveTo(W.x0, 0); shape.lineTo(W.x1, 0); shape.lineTo(W.x1, W.h); shape.lineTo(W.x0, W.h); shape.closePath();
    for (const wx of WINDOWS_X) {
      const hole = new THREE.Path();
      const hw = 0.65, y0 = 0.65, yr = 0.65 + 2.35;
      hole.moveTo(wx - hw, y0); hole.lineTo(wx + hw, y0); hole.lineTo(wx + hw, yr);
      hole.absarc(wx, yr, hw, 0, Math.PI, false);
      hole.lineTo(wx - hw, y0);
      shape.holes.push(hole);
    }
    const wallG = new THREE.ExtrudeGeometry(shape, { depth: 0.38, bevelEnabled: false, curveSegments: 24 });
    const wall = new THREE.Mesh(wallG, plaster);
    wall.position.set(0, 0, W.z0 - 0.38);
    wall.castShadow = true; wall.receiveShadow = true;
    s.add(wall);
    // side + back walls (mostly hidden by cabinetry)
    const sideG = new THREE.PlaneGeometry(W.z1 - W.z0, W.h);
    for (const sx of [-1, 1]) {
      const m = new THREE.Mesh(sideG, plaster);
      m.rotation.y = -sx * Math.PI / 2;
      m.position.set(sx * W.x1, W.h / 2, (W.z0 + W.z1) / 2);
      m.receiveShadow = true;
      s.add(m);
    }
    const back = new THREE.Mesh(new THREE.PlaneGeometry(W.x1 - W.x0, W.h), plaster);
    back.rotation.y = Math.PI;
    back.position.set(0, W.h / 2, W.z1);
    s.add(back);
    // ceiling with walnut coffer beams
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W.x1 - W.x0, W.z1 - W.z0), this.std({ color: 0xd9c9a8, roughness: 0.95, map: rep(A.tex.plaster, 2, 2) }));
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(0, W.h, (W.z0 + W.z1) / 2);
    s.add(ceil);
    const beamMat = this.std({ map: rep(A.tex.walnut, 1, 4), normalMap: rep(A.tex.walnutN, 1, 4), roughnessMap: rep(A.tex.walnutR, 1, 4), roughness: 1, color: 0x9a7a62 });
    for (let x = -2.4; x <= 2.41; x += 1.6) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.24, W.z1 - W.z0), beamMat);
      b.position.set(x, W.h - 0.12, (W.z0 + W.z1) / 2);
      b.castShadow = true;
      s.add(b);
    }
    for (let z = -3.2; z <= 4.0; z += 1.8) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(W.x1 - W.x0, 0.16, 0.16), beamMat);
      b.position.set(0, W.h - 0.08, z);
      s.add(b);
    }
    // crown + dado on the window wall
    const crownShape = new THREE.Shape();
    crownShape.moveTo(0, 0); crownShape.lineTo(0, 0.28); crownShape.lineTo(-0.2, 0.28); crownShape.quadraticCurveTo(-0.06, 0.18, -0.12, 0.06); crownShape.lineTo(-0.02, 0); crownShape.closePath();
    const crownG = new THREE.ExtrudeGeometry(crownShape, { depth: W.x1 - W.x0, bevelEnabled: false });
    const crown = new THREE.Mesh(crownG, this.std({ color: 0xe9dcc0, roughness: 0.7 }));
    crown.rotation.y = Math.PI / 2;
    crown.position.set(W.x0, W.h - 0.28, W.z0 - 0.0);
    s.add(crown);
    const dado = new THREE.Mesh(new THREE.BoxGeometry(W.x1 - W.x0, 0.62, 0.06), beamMat);
    dado.position.set(0, 0.31, W.z0 + 0.03);
    dado.receiveShadow = true;
    s.add(dado);
    for (let i = 0; i < 8; i++) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.38, 0.03), this.std({ map: rep(A.tex.walnut, 0.5, 0.4), roughness: 0.5, color: 0xb08a6a }));
      p.position.set(W.x0 + 0.42 + i * 0.795, 0.33, W.z0 + 0.07);
      s.add(p);
    }
    // windows (Blender GLB) + reflective glass
    const arch = A.gltf.architecture.scene;
    const winSrc = arch.getObjectByName('Window')!;
    for (const wx of WINDOWS_X) {
      const w = winSrc.clone(true);
      w.position.set(wx, 0.65, W.z0 - 0.17);
      w.traverse((o: any) => {
        if (!o.isMesh) return;
        o.castShadow = true; o.receiveShadow = true;
        if (o.name.includes('glass')) {
          o.material = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.04, transmission: 0, transparent: true, opacity: 0.08, envMapIntensity: 0.8 });
          o.castShadow = false;
          o.userData.roomReflect = true;
        } else if (o.name.includes('surround')) {
          o.material = this.std({ color: 0xcfc0a2, roughness: 0.85, map: rep(A.tex.plaster, 1, 1) });
        } else {
          o.material = this.std({ color: 0xe8e0cc, roughness: 0.55 });
        }
      });
      s.add(w);
    }
    // book-lined cabinetry: left wall, right wall (TV niche at z=0.6)
    const bc = arch.getObjectByName('Bookcase')!;
    const bn = arch.getObjectByName('BookcaseNiche')!;
    const woodMat = this.std({ map: rep(A.tex.walnut, 1, 3), normalMap: rep(A.tex.walnutN, 1, 3), roughnessMap: rep(A.tex.walnutR, 1, 3), roughness: 1, color: 0xc49a78, envMapIntensity: 0.8 });
    const darkMat = this.std({ map: rep(A.tex.walnut, 1, 3), roughness: 0.6, color: 0x6a4a36 });
    const gilt = new THREE.MeshStandardMaterial({ color: 0xcaa25a, metalness: 1, roughness: 0.32 });
    const velvet = new THREE.MeshStandardMaterial({ color: 0x4a0f14, roughness: 0.95 });
    const fitWood = (o: THREE.Object3D) => o.traverse((m: any) => {
      if (!m.isMesh) return;
      m.castShadow = true; m.receiveShadow = true;
      const n = (Array.isArray(m.material) ? m.material : [m.material]).map((mm: any) => {
        if (mm.name.includes('Gilt')) return gilt;
        if (mm.name.includes('Velvet')) return velvet;
        if (mm.name.includes('Dark')) return darkMat;
        return woodMat;
      });
      m.material = Array.isArray(m.material) ? n : n[0];
    });
    const zs = [-3.4, -2.4, -1.4, -0.4, 0.6, 1.6, 2.6, 3.6];
    const R = rng(91);
    const shelfSlots: { pos: THREE.Vector3; rotY: number; y: number; niche: boolean }[] = [];
    for (const side of [-1, 1]) {
      for (const z of zs) {
        const niche = side === 1 && z === 0.6;
        const m = (niche ? bn : bc).clone(true);
        fitWood(m);
        m.traverse((o: any) => { if (o.isMesh) o.castShadow = false; });
        m.position.set(side * (W.x1 - 0.44), 0, z);
        m.rotation.y = -side * Math.PI / 2;
        s.add(m);
        const shelves: number[] = niche ? [0.32, 2.54, 2.98] : [0.32, 0.78, 1.22, 1.66, 2.1, 2.54, 2.98];
        for (const y of shelves) shelfSlots.push({ pos: m.position.clone(), rotY: m.rotation.y, y, niche });
      }
    }
    this.buildBooks(shelfSlots, R);
  }

  buildBooks(slots: { pos: THREE.Vector3; rotY: number; y: number }[], R: ReturnType<typeof rng>) {
    const A = this.A;
    // composed atlas: 16x4 spine cells on top, a paper band and a cover band below
    const img = A.tex.books.image as HTMLImageElement;
    const tex = canvasTex(2048, 1152, (g, w, h) => {
      (g as any).filter = 'brightness(1.45) saturate(1.1)';
      g.drawImage(img, 0, 0, 2048, 1024);
      (g as any).filter = 'none';
      g.fillStyle = '#e4d6b4'; g.fillRect(0, 1024, 1024, 128);
      for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(150,120,80,${0.05 + Math.random() * 0.08})`; g.fillRect(Math.random() * 1024, 1024 + Math.random() * 128, 30, 1); }
      g.fillStyle = '#4a2a1a'; g.fillRect(1024, 1024, 1024, 128);
    });
    tex.flipY = true;
    const V_TOP = 1024 / 1152; // spine cells occupy v in [1-V_TOP, 1]
    const box = new THREE.BoxGeometry(1, 1, 1);
    const bp = box.attributes.position as THREE.BufferAttribute;
    const bn = box.attributes.normal as THREE.BufferAttribute;
    const bu = box.attributes.uv as THREE.BufferAttribute;
    const idx = box.index!.array as ArrayLike<number>;
    const P: number[] = [], N: number[] = [], U: number[] = [], C: number[] = [], I: number[] = [];
    const m4 = new THREE.Matrix4(), nm = new THREE.Matrix3(), v = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
    const addBook = (pos: THREE.Vector3, quat: THREE.Quaternion, size: THREE.Vector3, cell: number, tint: THREE.Color) => {
      m4.compose(pos, quat, size);
      nm.getNormalMatrix(m4);
      const base = P.length / 3;
      const col = (cell * 5) % 16, row = Math.floor(cell / 4) % 4;
      for (let i = 0; i < bp.count; i++) {
        v.fromBufferAttribute(bp, i).applyMatrix4(m4); P.push(v.x, v.y, v.z);
        v.fromBufferAttribute(bn, i).applyMatrix3(nm).normalize(); N.push(v.x, v.y, v.z);
        const face = Math.floor(i / 4); // 0:+x 1:-x 2:+y 3:-y 4:+z(spine) 5:-z
        const u0 = bu.getX(i), v0 = bu.getY(i);
        if (face === 4) U.push((col + 0.04 + u0 * 0.92) / 16, 1 - V_TOP + ((3 - row) + v0) / 4 * V_TOP);
        else if (face === 2 || face === 3) U.push(0.05 + u0 * 0.4, (0.2 + v0 * 0.6) * (1 - V_TOP));
        else U.push(0.55 + u0 * 0.4, (0.2 + v0 * 0.6) * (1 - V_TOP));
        C.push(tint.r, tint.g, tint.b);
      }
      for (let k = 0; k < idx.length; k++) I.push(base + idx[k]);
    };
    for (const sl of slots) {
      let x = -0.43;
      const rq = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, sl.rotY, 0));
      while (x < 0.43) {
        const roll = R();
        if (roll < 0.07) { x += R.range(0.05, 0.14); continue; }
        const lying = roll > 0.93;
        const h = lying ? R.range(0.03, 0.05) : R.range(0.24, 0.38);
        const w = lying ? R.range(0.18, 0.26) : R.range(0.025, 0.065);
        const d = R.range(0.17, 0.25);
        if (x + w > 0.44) break;
        if (lying) {
          const n = 2 + Math.floor(R() * 3);
          for (let k = 0; k < n; k++) {
            p.set(x + w / 2 + R.range(-0.01, 0.01), sl.y + 0.015 + h * (k + 0.5), -0.16).applyQuaternion(rq).add(sl.pos);
            q.copy(rq).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, R.range(-0.08, 0.08), Math.PI / 2)));
            addBook(p.clone(), q.clone(), sc.set(h, w, d).clone(), Math.floor(R() * 16), new THREE.Color().setHSL(0.05 + R() * 0.08, 0.3, 0.55 + R() * 0.4));
          }
          x += w + 0.01;
          continue;
        }
        const lean = R() < 0.06 ? R.range(-0.12, 0.12) : 0;
        p.set(x + w / 2, sl.y + 0.015 + h / 2, -0.2 + (0.22 - d) * 0.5 + R.range(0.0, 0.03)).applyQuaternion(rq).add(sl.pos);
        q.copy(rq).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, lean)));
        addBook(p.clone(), q.clone(), sc.set(w, h, d).clone(), Math.floor(R() * 16), new THREE.Color().setHSL(0.06 + R() * 0.06, 0.15 + R() * 0.2, 0.7 + R() * 0.3));
        x += w + R.range(0.0, 0.004);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
    g.setIndex(I);
    const books = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: tex, vertexColors: true, roughness: 0.48, metalness: 0.12 }));
    books.receiveShadow = true;
    this.scene.add(books);
  }

  /* ------------------------------------------------------- spring outside */
  buildOutside() {
    const A = this.A, s = this.scene;
    const sky = new THREE.Mesh(new THREE.PlaneGeometry(60, 30), new THREE.ShaderMaterial({
      uniforms: {}, depthWrite: false,
      vertexShader: 'varying vec2 vUv; void main(){vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader: 'varying vec2 vUv; void main(){ vec3 a=vec3(1.6,1.45,1.15); vec3 b=vec3(0.7,0.88,1.15); gl_FragColor=vec4(mix(a,b,smoothstep(0.25,0.9,vUv.y)),1.0);}',
    }));
    sky.position.set(0, 8, -22);
    s.add(sky);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 30), new THREE.MeshStandardMaterial({ color: 0x6f8a3a, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, -0.6, -18);
    s.add(ground);
    // trees: trunks + branches (tubes) + instanced blossom/leaf cards
    const R = rng(1234);
    const bark = new THREE.MeshStandardMaterial({ color: 0x3a2a20, roughness: 1 });
    const cards: { p: THREE.Vector3; s: number; r: number; cell: number }[] = [];
    const trees = [[-3.6, -6.2], [-0.6, -7.4], [2.4, -5.8], [4.8, -8.5], [-5.6, -9.5], [1.2, -10.5]];
    for (const [tx, tz] of trees) {
      const base = new THREE.Vector3(tx, -0.6, tz);
      const trunkTop = base.clone().add(new THREE.Vector3(R.range(-0.4, 0.4), 3.2, R.range(-0.3, 0.3)));
      const mkTube = (a: THREE.Vector3, b: THREE.Vector3, r: number) => {
        const mid = a.clone().lerp(b, 0.5).add(new THREE.Vector3(R.range(-0.4, 0.4), R.range(-0.2, 0.3), R.range(-0.3, 0.3)));
        const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
        const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 10, r, 8, false), bark);
        m.castShadow = true;
        s.add(m);
        return curve;
      };
      mkTube(base, trunkTop, 0.2);
      for (let k = 0; k < 6; k++) {
        const end = trunkTop.clone().add(new THREE.Vector3(R.range(-2.6, 2.6), R.range(0.4, 2.8), R.range(-1.6, 1.4)));
        const cv = mkTube(trunkTop.clone().add(new THREE.Vector3(0, R.range(-0.6, 0.3), 0)), end, R.range(0.05, 0.1));
        // blossom clusters along the branch end
        for (let j = 0; j < 34; j++) {
          const u = R.range(0.35, 1.0);
          const pp = cv.getPoint(u).add(new THREE.Vector3(R.range(-1, 1), R.range(-0.8, 0.9), R.range(-1, 1)).multiplyScalar(1.1));
          cards.push({ p: pp, s: R.range(0.7, 1.4), r: R.range(0, Math.PI * 2), cell: R() < 0.22 ? 3 : Math.floor(R() * 3) });
        }
      }
    }
    const mat = new THREE.MeshStandardMaterial({ map: A.tex.blossom, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.9 });
    const SWAY = `#include <begin_vertex>
        float sw = sin(uTime*1.3 + center.x*0.7 + center.y*0.4) * 0.08 + sin(uTime*2.9 + center.z) * 0.03;
        transformed.x += sw * (1.0 + (position.y - center.y)); transformed.y += sw * 0.3;`;
    mat.onBeforeCompile = (sh: any) => { sh.uniforms.uTime = { value: 0 }; (mat as any).userData.shader = sh; sh.vertexShader = 'uniform float uTime; attribute vec3 center;\n' + sh.vertexShader.replace('#include <begin_vertex>', SWAY); };
    const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: A.tex.blossom, alphaTest: 0.45 });
    depth.onBeforeCompile = (sh: any) => { sh.uniforms.uTime = { value: 0 }; (depth as any).userData.shader = sh; sh.vertexShader = 'uniform float uTime; attribute vec3 center;\n' + sh.vertexShader.replace('#include <begin_vertex>', SWAY); };
    this.swayMats.push(mat, depth);
    const build = (list: typeof cards, castShadow: boolean) => {
      const P: number[] = [], Uv: number[] = [], Ce: number[] = [], N: number[] = [], I: number[] = [];
      const q = new THREE.Quaternion(), v = new THREE.Vector3(), nrm = new THREE.Vector3();
      for (const c of list) {
        q.setFromEuler(new THREE.Euler(R.range(-0.4, 0.4), R.range(-0.6, 0.6), c.r));
        nrm.set(0, 0, 1).applyQuaternion(q);
        const uOff = (c.cell % 2) * 0.5, vOff = (1 - Math.floor(c.cell / 2)) * 0.5;
        const base = P.length / 3;
        for (const [x, y, u, vv] of [[-0.5, -0.5, 0, 0], [0.5, -0.5, 1, 0], [0.5, 0.5, 1, 1], [-0.5, 0.5, 0, 1]]) {
          v.set(x * c.s, y * c.s, 0).applyQuaternion(q).add(c.p);
          P.push(v.x, v.y, v.z); N.push(nrm.x, nrm.y, nrm.z); Uv.push(uOff + u * 0.5, vOff + vv * 0.5); Ce.push(c.p.x, c.p.y, c.p.z);
        }
        I.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
      const gg = new THREE.BufferGeometry();
      gg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
      gg.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
      gg.setAttribute('uv', new THREE.Float32BufferAttribute(Uv, 2));
      gg.setAttribute('center', new THREE.Float32BufferAttribute(Ce, 3));
      gg.setIndex(I);
      const mesh = new THREE.Mesh(gg, mat);
      mesh.customDepthMaterial = depth;
      mesh.castShadow = castShadow;
      mesh.frustumCulled = false;
      s.add(mesh);
    };
    // only cards that can throw dappled light through the windows cast shadows
    const shadowing = cards.filter((c) => Math.abs(c.p.x) < 3.2 && c.p.z > -8.5 && c.p.y > 0.5);
    build(shadowing, true);
    build(cards.filter((c) => !shadowing.includes(c)), false);
    // falling petals drifting past the windows
    const N = 500;
    const pos = new Float32Array(N * 3), sd = new Float32Array(N);
    for (let i = 0; i < N; i++) { pos.set([R.range(-6, 6), R.range(0, 6), R.range(-11, -4.6)], i * 3); sd[i] = R(); }
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    pg.setAttribute('seed', new THREE.BufferAttribute(sd, 1));
    const petals = new THREE.Points(pg, new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uPx: { value: 600 } }, transparent: true, depthWrite: false,
      vertexShader: `attribute float seed; uniform float uTime, uPx; varying float vS; void main(){ vec3 p = position; float t = uTime*0.25 + seed*20.0; p.y = mod(p.y - t, 6.0); p.x += sin(t*2.0+seed*9.0)*0.5 + uTime*0.15; p.z += cos(t*1.3)*0.3; vS=seed; vec4 mv = modelViewMatrix*vec4(p,1.0); gl_PointSize = max(1.5, (0.012+seed*0.012) * uPx / -mv.z); gl_Position = projectionMatrix*mv; }`,
      fragmentShader: `varying float vS; void main(){ vec2 d=gl_PointCoord-0.5; float a = smoothstep(0.5,0.2,length(d*vec2(1.0,1.8))); gl_FragColor = vec4(mix(vec3(1.0,0.86,0.9),vec3(1.0),vS)*1.6, a*0.9);} `,
    }));
    petals.frustumCulled = false;
    (petals as any).userData.timeUniform = true;
    this.petals = petals;
    s.add(petals);
  }
  petals!: THREE.Points;

  /* ------------------------------------------------------------ furniture */
  buildFurniture() {
    const A = this.A, s = this.scene;
    // sofa (Blender GLB)
    const sofa = A.gltf.sofa.scene.clone(true);
    const leather = new THREE.MeshPhysicalMaterial({ userData: { reflect: true, envI: 0.45 }, map: rep(A.tex.leather, 2, 2), normalMap: rep(A.tex.leatherN, 2, 2), roughnessMap: rep(A.tex.leatherR, 2, 2), roughness: 1.0, color: 0xc07a58, clearcoat: 0.35, clearcoatRoughness: 0.45, sheen: 0.4, sheenColor: new THREE.Color(0.5, 0.25, 0.15), normalScale: new THREE.Vector2(0.8, 0.8) });
    const brass = new THREE.MeshStandardMaterial({ color: 0xd2a560, metalness: 1, roughness: 0.3 });
    const footWood = new THREE.MeshStandardMaterial({ color: 0x3a1e10, roughness: 0.35, map: A.tex.walnut });
    sofa.traverse((o: any) => {
      if (!o.isMesh) return;
      o.castShadow = o.receiveShadow = true;
      const n = o.material.name || '';
      o.material = n.includes('Brass') ? brass : n.includes('Wood') ? footWood : leather;
      if (o.name.includes('cushion0') || (o.morphTargetDictionary && o.morphTargetDictionary.Sit !== undefined && o.name.includes('0'))) this.sofaCushion = o;
    });
    sofa.position.set(-2.28, 0, 0.6);
    sofa.rotation.y = Math.PI / 2;
    s.add(sofa);
    // rugs with knotted pile + fringe
    const mkRug = (w: number, d: number, alb: THREE.Texture, nrm: THREE.Texture, x: number, z: number, rot: number) => {
      const g = new THREE.BoxGeometry(w, 0.012, d);
      const m = new THREE.MeshStandardMaterial({ map: alb, normalMap: nrm, roughness: 0.96, normalScale: new THREE.Vector2(1.2, 1.2) });
      const side = new THREE.MeshStandardMaterial({ color: 0x3a2018, roughness: 1 });
      const rug = new THREE.Mesh(g, [side, side, m, side, side, side]);
      rug.position.set(x, 0.006, z);
      rug.rotation.y = rot;
      rug.receiveShadow = true;
      s.add(rug);
      // fringe: instanced cotton cords on the short edges
      const n = Math.floor(w / 0.012);
      const fg = new THREE.CylinderGeometry(0.0018, 0.0022, 1, 4);
      fg.rotateX(Math.PI / 2);
      const fm = new THREE.InstancedMesh(fg, new THREE.MeshStandardMaterial({ color: 0xe8dcc2, roughness: 1 }), n * 2);
      const R = rng(Math.floor(x * 100 + z * 10));
      const mm = new THREE.Matrix4();
      for (let i = 0; i < n * 2; i++) {
        const sd = i < n ? 1 : -1;
        const fx = -w / 2 + (i % n + 0.5) * (w / n);
        const L = R.range(0.07, 0.1);
        const p = new THREE.Vector3(fx + R.range(-0.003, 0.003), 0.004, sd * (d / 2 + L / 2));
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(R.range(-0.05, 0.05), R.range(-0.25, 0.25), 0));
        mm.compose(p, q, new THREE.Vector3(1, 1, L));
        fm.setMatrixAt(i, mm);
      }
      fm.position.copy(rug.position); fm.rotation.copy(rug.rotation);
      fm.receiveShadow = true;
      s.add(fm);
    };
    mkRug(3.4, 2.5, A.tex.rugMain, A.tex.rugMainN, 0.15, 0.7, Math.PI / 2);
    mkRug(1.6, 1.0, A.tex.rugSmall, A.tex.rugSmallN, 0.2, 3.25, 0.04);
    mkRug(1.8, 1.1, A.tex.rugSmall, A.tex.rugSmallN, -0.6, -2.6, -0.06);
    // CRT television in the right-wall niche
    const tv = A.gltf.crt_tv.scene.clone(true);
    tv.position.set(2.78, 0.795, 0.6);
    tv.rotation.y = -Math.PI / 2;
    this.tvGroup = tv;
    const tvWood = new THREE.MeshPhysicalMaterial({ map: rep(A.tex.walnut, 1, 1), normalMap: rep(A.tex.walnutN, 1, 1), roughness: 0.32, color: 0xb88a68, clearcoat: 0.6, clearcoatRoughness: 0.25 });
    const btns: THREE.Object3D[] = [];
    this.crt = crtMaterial(this.logo.tex);
    tv.traverse((o: any) => {
      if (!o.isMesh) return;
      o.castShadow = o.receiveShadow = true;
      const n = o.material.name || '';
      if (n.includes('TV_Wood')) o.material = tvWood;
      else if (n.includes('TV_Alu')) o.material = new THREE.MeshStandardMaterial({ color: 0xc8c4bc, metalness: 1, roughness: 0.35 });
      else if (n.includes('TV_Button')) o.material = new THREE.MeshPhysicalMaterial({ color: 0xe8e0cc, roughness: 0.3, clearcoat: 0.5 });
      else if (n.includes('TV_Chrome')) o.material = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: 0.12 });
      else if (n.includes('TV_Glass')) {
        o.material = this.crt;
        o.castShadow = false;
        // glass reflections are computed inside the phosphor shader (see crt.ts)
      } else if (n.includes('TV_Lamp')) o.material = new THREE.MeshStandardMaterial({ color: 0x400806, emissive: 0xff2010, emissiveIntensity: 0 });
      else o.material = new THREE.MeshStandardMaterial({ color: n.includes('Grille') ? 0x241a14 : 0x161210, roughness: 0.55 });
      if (o.name.startsWith('TV_btn')) btns.push(o);
      if (o.name === 'TV_lamp') this.tvLamp = o;
    });
    btns.sort((a, b) => a.name.localeCompare(b.name));
    this.tvButtons = btns;
    s.add(tv);
    // side table + brass lamp + globe + palm
    const lathe = (pts: number[][], mat: THREE.Material, seg = 40) => new THREE.Mesh(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg), mat);
    const tableWood = new THREE.MeshPhysicalMaterial({ map: A.tex.walnut, color: 0x9a6a4a, roughness: 0.3, clearcoat: 0.7 });
    const table = new THREE.Group();
    table.add(lathe([[0, 0], [0.18, 0], [0.18, 0.03], [0.05, 0.06], [0.04, 0.3], [0.06, 0.42], [0.035, 0.55], [0.05, 0.6], [0.32, 0.6], [0.32, 0.64], [0, 0.645]], tableWood));
    const lampBrass = new THREE.MeshStandardMaterial({ color: 0xd6a85a, metalness: 1, roughness: 0.25 });
    const lamp = lathe([[0, 0.645], [0.09, 0.645], [0.07, 0.68], [0.02, 0.72], [0.015, 0.95], [0.03, 0.97], [0, 0.98]], lampBrass);
    const shade = lathe([[0.17, 0.9], [0.09, 1.12], [0.088, 1.12]], new THREE.MeshStandardMaterial({ color: 0xf2dfb4, roughness: 0.8, side: THREE.DoubleSide, emissive: 0xffb860, emissiveIntensity: 0.35 }));
    table.add(lamp, shade);
    table.position.set(-2.25, 0, -0.85);
    table.traverse((o: any) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    s.add(table);
    const lampLight = new THREE.PointLight(0xffb36a, 1.6, 6, 2);
    lampLight.position.set(-2.25, 0.98, -0.85);
    s.add(lampLight);
    const globe = new THREE.Group();
    globe.add(lathe([[0, 0], [0.2, 0], [0.04, 0.06], [0.03, 0.75], [0, 0.76]], tableWood));
    const gtex = canvasTex(512, 256, (g, w, h) => {
      g.fillStyle = '#c9b48a'; g.fillRect(0, 0, w, h);
      const R2 = rng(5);
      g.fillStyle = '#8a6a3a';
      for (let i = 0; i < 9; i++) { g.beginPath(); const cx = R2() * w, cy = h * 0.2 + R2() * h * 0.6; for (let k = 0; k < 14; k++) { const a = (k / 14) * Math.PI * 2; const r = (20 + R2() * 40); g.lineTo(cx + Math.cos(a) * r * 1.5, cy + Math.sin(a) * r); } g.fill(); }
      g.strokeStyle = 'rgba(80,50,20,0.5)'; for (let i = 0; i < 12; i++) { g.beginPath(); g.moveTo(0, i * h / 12); g.lineTo(w, i * h / 12); g.stroke(); g.beginPath(); g.moveTo(i * w / 12, 0); g.lineTo(i * w / 12, h); g.stroke(); }
    });
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.2, 48, 32), new THREE.MeshPhysicalMaterial({ map: gtex, roughness: 0.35, clearcoat: 0.8 }));
    sphere.position.y = 0.97; sphere.rotation.z = 0.41;
    const meridian = new THREE.Mesh(new THREE.TorusGeometry(0.215, 0.006, 8, 64), lampBrass);
    meridian.position.y = 0.97; meridian.rotation.y = Math.PI / 2;
    globe.add(sphere, meridian);
    globe.position.set(2.1, 0, -3.2);
    globe.traverse((o: any) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    s.add(globe);
    // brass chandelier
    const ch = new THREE.Group();
    ch.add(lathe([[0, 0], [0.12, 0.02], [0.16, 0.08], [0.06, 0.16], [0.02, 0.3], [0.02, 0.8], [0, 0.8]], lampBrass, 32));
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const curve = new THREE.CubicBezierCurve3(new THREE.Vector3(0, 0.08, 0), new THREE.Vector3(Math.cos(a) * 0.3, -0.05, Math.sin(a) * 0.3), new THREE.Vector3(Math.cos(a) * 0.5, 0.05, Math.sin(a) * 0.5), new THREE.Vector3(Math.cos(a) * 0.52, 0.16, Math.sin(a) * 0.52));
      ch.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.012, 6), lampBrass));
      const cup = lathe([[0, 0], [0.04, 0.0], [0.035, 0.03], [0, 0.03]], lampBrass, 16);
      cup.position.set(Math.cos(a) * 0.52, 0.16, Math.sin(a) * 0.52);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.025, 12, 8), new THREE.MeshStandardMaterial({ color: 0xfff0d0, emissive: 0xffc880, emissiveIntensity: 1.2 }));
      bulb.scale.y = 1.5; bulb.position.set(Math.cos(a) * 0.52, 0.22, Math.sin(a) * 0.52);
      ch.add(cup, bulb);
    }
    ch.position.set(0, W.h - 1.05, 0.4);
    s.add(ch);
  }
  tvButtons: THREE.Object3D[] = [];
  tvLamp: THREE.Object3D | null = null;

  /* ---------------------------------------------------------------- light */
  buildLights() {
    const s = this.scene;
    const sun = new THREE.DirectionalLight(0xffd9a6, 7.0);
    const tgt = new THREE.Object3D();
    tgt.position.set(0, 0.5, 0);
    s.add(tgt);
    sun.target = tgt;
    sun.position.copy(tgt.position).addScaledVector(SUN_DIR, -26);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera as THREE.OrthographicCamera;
    sc.left = -7; sc.right = 7; sc.top = 7; sc.bottom = -7; sc.near = 4; sc.far = 50;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    s.add(sun);
    this.sun = sun;
    // sky + warm floor bounce (replaces separate fill/bounce point lights)
    s.add(new THREE.HemisphereLight(0xffe2bc, 0x6a4028, 1.45));
    s.add(new THREE.AmbientLight(0xffd8b0, 0.18));
    this.tvLight = new THREE.PointLight(0xcfe0ff, 0, 7, 1.6);
    this.tvLight.position.set(2.45, 1.08, 0.5);
    s.add(this.tvLight);
  }

  /* ----------------------------------------------------- volumetric shafts */
  buildShafts() {
    const s = this.scene;
    this.shaftMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uInt: { value: 1 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: `attribute vec3 loc; varying vec3 vL; varying vec3 vW; void main(){ vL = loc; vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
      fragmentShader: `uniform float uTime, uInt; varying vec3 vL; varying vec3 vW;
        float hash(vec2 p){ p = fract(p*vec2(443.897,441.423)); p += dot(p, p.yx+19.19); return fract((p.x+p.y)*p.x); }
        float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
        void main(){
          // vL.x in [-0.5,0.5] across window, vL.y in [0,1] up the window, vL.z = distance along beam [0,1]
          float edge = (1.0 - smoothstep(0.36, 0.5, abs(vL.x))) * smoothstep(0.0, 0.08, vL.y) * (1.0 - smoothstep(0.86, 1.0, vL.y));
          float along = pow(1.0 - vL.z, 1.6) * smoothstep(0.0, 0.05, vL.z);
          // dappled occlusion by blossoms + drifting motes
          float leaf = vn(vec2(vL.x * 7.0 + uTime * 0.25, vL.y * 6.0 + sin(uTime*0.4)*0.6));
          leaf = smoothstep(0.25, 0.75, leaf);
          float dust = vn(vW.xz * 6.0 + vec2(uTime * 0.08, -uTime * 0.05)) * 0.5 + 0.5;
          float a = edge * along * (0.35 + 0.65 * leaf) * dust;
          gl_FragColor = vec4(vec3(1.0, 0.82, 0.55) * a * 0.075 * uInt, 1.0);
        }`,
    });
    for (const wx of WINDOWS_X) {
      // prism from the window opening along the sun direction
      const L = 8.5;
      const geo = new THREE.BoxGeometry(1, 1, 1, 2, 2, 8);
      const p2 = geo.attributes.position as THREE.BufferAttribute;
      const loc = new Float32Array(p2.count * 3);
      for (let i = 0; i < p2.count; i++) {
        const lx = p2.getX(i), ly = p2.getY(i) + 0.5, lz = p2.getZ(i) + 0.5;
        loc.set([lx, ly, lz], i * 3);
        const base = new THREE.Vector3(wx + lx * 1.25, 0.7 + ly * 2.85, W.z0 - 0.05).addScaledVector(SUN_DIR, lz * L);
        p2.setXYZ(i, base.x, base.y, base.z);
      }
      geo.setAttribute('loc', new THREE.BufferAttribute(loc, 3));
      const shaft = new THREE.Mesh(geo, this.shaftMat);
      shaft.frustumCulled = false;
      shaft.renderOrder = 10;
      s.add(shaft);
    }
    // dust motes concentrated in the beams
    const R = rng(55);
    const N = 3500;
    const pos = new Float32Array(N * 3), sd = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const wx = R.pick(WINDOWS_X);
      const p = new THREE.Vector3(wx + R.range(-0.6, 0.6), R.range(0.7, 3.5), W.z0).addScaledVector(SUN_DIR, R.range(0.2, 7.5));
      if (p.y < 0.05) p.y = R.range(0.2, 1.5);
      pos.set([p.x, p.y, p.z], i * 3);
      sd[i] = R();
    }
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    pg.setAttribute('seed', new THREE.BufferAttribute(sd, 1));
    this.dust = new THREE.Points(pg, new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uPx: { value: 600 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `attribute float seed; uniform float uTime, uPx; varying float vA; void main(){ vec3 p = position; p += vec3(sin(uTime*0.2+seed*30.0), sin(uTime*0.13+seed*17.0)*0.6, cos(uTime*0.17+seed*11.0))*0.12; vA = 0.4 + 0.6*pow(0.5+0.5*sin(uTime*(1.0+seed*2.0)+seed*40.0), 3.0); vec4 mv = modelViewMatrix*vec4(p,1.0); gl_PointSize = max(1.0, (0.0016 + seed*0.0026) * uPx / -mv.z); vA *= min(1.0, ((0.0016 + seed*0.0026) * uPx / -mv.z)); gl_Position = projectionMatrix*mv; }`,
      fragmentShader: `varying float vA; void main(){ vec2 d = gl_PointCoord-0.5; float a = (1.0 - smoothstep(0.0, 0.5, length(d))); gl_FragColor = vec4(vec3(1.0,0.86,0.62)*a*vA*0.9, 1.0); }`,
    }));
    this.dust.frustumCulled = false;
    s.add(this.dust);
  }

  /* ----------------------------------------------------------------- man */
  buildMan() {
    const A = this.A;
    const man = SkeletonUtils.clone(A.gltf.man.scene);
    const knit = new THREE.MeshPhysicalMaterial({ normalMap: rep(A.tex.knitN, 5, 5), normalScale: new THREE.Vector2(0.65, 0.65), roughness: 0.95, color: 0x9e1a20, sheen: 1.0, sheenColor: new THREE.Color(0.9, 0.25, 0.25), sheenRoughness: 0.6 });
    const denim = new THREE.MeshStandardMaterial({ map: rep(A.tex.denim, 5, 5), normalMap: rep(A.tex.denimN, 5, 5), roughness: 0.9 });
    const skin = new THREE.MeshPhysicalMaterial({ vertexColors: true, color: new THREE.Color(0.6, 0.47, 0.42), roughness: 0.52, sheen: 0.5, sheenColor: new THREE.Color(0.75, 0.3, 0.22), sheenRoughness: 0.5, clearcoat: 0.08, clearcoatRoughness: 0.6 });
    const hair = new THREE.MeshStandardMaterial({ color: 0x2a1c14, roughness: 0.7, side: THREE.DoubleSide });
    const shirt = new THREE.MeshStandardMaterial({ color: 0xc6d4e8, roughness: 0.75, side: THREE.DoubleSide });
    const shoes = new THREE.MeshPhysicalMaterial({ color: 0x3a1f10, roughness: 0.35, clearcoat: 0.5 });
    const eye = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.05, clearcoat: 1 });
    man.traverse((o: any) => {
      if (!o.isMesh) return;
      o.castShadow = true; o.receiveShadow = true;
      const map = (mm: any) => {
        const n = mm.name || '';
        if (n.includes('Sweater')) return knit;
        if (n.includes('Jeans')) return denim;
        if (n.includes('Shoes')) return shoes;
        if (n.includes('Shirt')) return shirt;
        if (n.includes('Hair')) return hair;
        if (n.includes('Eye')) return eye;
        return skin;
      };
      o.material = Array.isArray(o.material) ? o.material.map(map) : map(o.material);
    });
    this.scene.add(man);
    this.man = new ManActor(man, (k) => {
      if (this.sofaCushion?.morphTargetInfluences) this.sofaCushion.morphTargetInfluences[0] = k;
    });
    this.man.buttons = this.tvButtons;
    this.man.buttonRest = this.tvButtons.map((b) => b.position.clone());
  }

  /* ------------------------------------------------------------- cameras */
  cameraTracks() {
    const m = T.manor;
    return [
      new Track([{ t: 0, p: [0.18, 1.62, 4.3], l: [-0.1, 1.45, -4], f: 30 }, { t: 11, p: [0.08, 1.6, 3.62], l: [0.12, 1.42, -3.9], f: 30 }], (x) => x),
      new Track([{ t: 11, p: [0.08, 1.6, 3.62], l: [0.12, 1.42, -3.9], f: 30 }, { t: 14.2, p: [0.6, 1.6, 3.2], l: [1.6, 1.25, 0.9], f: 32 }, { t: 17.3, p: [2.5, 1.5, 2.3], l: [2.55, 1.18, 0.78], f: 40 }]),
      new Track([{ t: 17.3, p: [2.5, 1.5, 2.3], l: [2.55, 1.18, 0.78], f: 40 }, { t: 18.2, p: [2.47, 1.3, 1.58], l: [2.72, 1.13, 0.84], f: 50 }, { t: 21.7, p: [2.5, 1.32, 1.52], l: [2.72, 1.13, 0.84], f: 50 }]),
      new Track([{ t: 21.7, p: [2.5, 1.32, 1.52], l: [2.72, 1.13, 0.84], f: 50 }, { t: 22.4, p: [1.55, 1.6, 2.5], l: [2.3, 1.55, 0.78], f: 48 }, { t: 26.6, p: [1.62, 1.59, 2.38], l: [2.3, 1.55, 0.78], f: 50 }]),
      new Track([{ t: 26.6, p: [1.0, 1.44, -0.05], l: [2.7, 1.1, 0.55], f: 36 }, { t: m.turn, p: [0.85, 1.42, -0.2], l: [2.7, 1.08, 0.55], f: 38 }]),
      new Track([{ t: m.turn, p: [0.85, 1.42, -0.2], l: [2.7, 1.08, 0.55], f: 38 }, { t: 35.5, p: [0.5, 1.42, 3.1], l: [-0.6, 1.0, 0.9], f: 32 }, { t: 38.3, p: [-0.2, 1.38, 3.25], l: [-1.9, 0.95, 1.0], f: 34 }]),
      new Track([{ t: 38.3, p: [-2.66, 1.78, 2.2], l: [0.0, 0.92, 0.72], f: 20 }, { t: m.pushStart, p: [-2.6, 1.76, 2.14], l: [0.1, 0.94, 0.72], f: 20 }], (x) => x),
      new Track([{ t: m.pushStart, p: [-2.6, 1.76, 2.14], l: [0.1, 0.94, 0.72], f: 20 }, { t: 42.6, p: [0.1, 1.22, 1.2], l: [2.8, 1.065, 0.52], f: 32 }, { t: 43.7, p: [2.2, 1.068, 0.53], l: [3.4, 1.065, 0.515], f: 35 }, { t: m.glassCross, p: [2.69, 1.065, 0.515], l: [3.6, 1.065, 0.515], f: 35 }], (x) => x * x * (3 - 2 * x) * 0.6 + x * x * 0.4),
    ];
  }

  update(t: number) {
    const m = T.manor;
    const cam = this.camera;
    evalTracks(this.tracks, t, cam);
    cam.updateProjectionMatrix();
    for (const mm of this.swayMats) { const sh = (mm as any).userData.shader; if (sh) sh.uniforms.uTime.value = t; }
    const px = this.renderer.getDrawingBufferSize(new THREE.Vector2()).y / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2));
    (this.petals.material as THREE.ShaderMaterial).uniforms.uTime.value = t;
    (this.petals.material as THREE.ShaderMaterial).uniforms.uPx.value = px;
    (this.dust.material as THREE.ShaderMaterial).uniforms.uPx.value = px;
    this.shaftMat.uniforms.uTime.value = t;
    (this.dust.material as THREE.ShaderMaterial).uniforms.uTime.value = t;
    // television state
    this.logo.update(Math.max(0, t - m.logo));
    const u = this.crt.uniforms;
    u.uTime.value = t;
    const on = t >= m.tvOn;
    u.uPower.value = on ? sstep(t, m.tvOn, m.tvOn + 0.75) : 0;
    const logoOn = t >= m.logo;
    u.uStatic.value = on && !logoOn ? 1 : 0;
    u.uLogo.value = logoOn ? 1 : 0;
    u.uHold.value = on && !logoOn ? 1 : 0;
    u.uBright.value = logoOn ? 1.12 : 0.85;
    if (this.tvLamp) ((this.tvLamp as any).material as THREE.MeshStandardMaterial).emissiveIntensity = on ? 3 : 0;
    const flick = 0.85 + 0.15 * Math.sin(t * 61) * Math.sin(t * 23);
    this.tvLight.intensity = on ? (logoOn ? 1.0 : 0.55 * flick) * sstep(t, m.tvOn, m.tvOn + 0.6) : 0;
    // camera dive: let the shafts dim slightly for the silhouette shot
    this.shaftMat.uniforms.uInt.value = 1 - 0.25 * sstep(t, 38.2, 39.0);
    this.man.update(t);
  }

  grade(t: number): Grade {
    const m = T.manor;
    const dive = sstep(t, m.pushStart + 1.2, m.glassCross);
    return {
      exposure: 1.0 - 0.15 * sstep(t, 38.2, 39.0) + 0.1 * dive,
      lift: [0.018, 0.011, 0.0], gamma: [1.0, 0.985, 0.95], gain: [1.05, 1.0, 0.9],
      sat: 1.06, contrast: 1.07, vignette: 0.42, grain: 0.032, ca: 0.0012, bloom: 0.2, bloomRadius: 0.5, bloomThreshold: 0.98,
    };
  }
}
