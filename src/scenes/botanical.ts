import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { Assets } from '../core/assets';
import { T, Track, evalTracks, rng, sstep, lin, pulse, clamp, mix, canvasTex, Rng } from '../core/util';
import type { Grade } from '../core/post';
import { Rig } from '../core/rig';
import { ILLUS, illus, addOutline } from './illus';

const B = () => T.botanical;
const PARCH = new THREE.Color(0xeee2c6);
const DINO_Z = -7.5;

/** dinosaur root x at time t (runs right -> left across the plate) */
function dinoX(t: number) {
  const b = B();
  const v = 52 / (b.dinoExit - b.dinoEnter + 2.2);
  return (b.dinoPass - t) * v;
}

export class BotanicalScene {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.05, 220);
  tracks: Track[];
  timeMats: { uniforms: any }[] = [];
  grass!: THREE.InstancedMesh;
  footU = { value: Array.from({ length: 10 }, () => new THREE.Vector4(0, -100, 0, 0)) };
  shakeU = { value: new Array(16).fill(0) };
  bflies: { species: number; seed: number; c: THREE.Vector3; r: THREE.Vector3; f: number[]; flap: number; size: number; delay: number }[] = [];
  bflyMeshes: THREE.InstancedMesh[] = [];
  bflyBody!: THREE.InstancedMesh;
  birds: { g: THREE.Group; wl: THREE.Object3D; wr: THREE.Object3D; perch: THREE.Vector3; flee: THREE.Vector3; seed: number; flyer: boolean; size: number }[] = [];
  dino!: { root: THREE.Object3D; rig: Rig };
  people: { root: THREE.Object3D; rig: Rig; seed: number; target: THREE.Vector3; start: THREE.Vector3; club?: THREE.Object3D; flower: number }[] = [];
  flowers: { pos: THREE.Vector3; id: number }[] = [];
  petals!: THREE.InstancedMesh;
  petalData: { t0: number; p: THREE.Vector3; v: THREE.Vector3; spin: THREE.Vector3; col: THREE.Color }[] = [];
  prints!: THREE.InstancedMesh;
  printData: { t: number; p: THREE.Vector3; yaw: number }[] = [];
  dust!: THREE.Points;
  cardBird!: THREE.Mesh;

  constructor(private A: Assets, private renderer: THREE.WebGLRenderer) {
    ILLUS.paper.value = A.tex.paperGrain;
    A.tex.paperGrain.wrapS = A.tex.paperGrain.wrapT = THREE.RepeatWrapping;
    const s = this.scene;
    s.background = PARCH.clone();
    s.fog = new THREE.Fog(PARCH.clone(), 16, 70);
    const hemi = new THREE.HemisphereLight(0xfff4dc, 0x8a8a5a, 1.55);
    s.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff0d0, 2.1);
    sun.position.set(-14, 22, 10);
    sun.target.position.set(0, 0, -6);
    s.add(sun.target);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera as THREE.OrthographicCamera;
    sc.left = -24; sc.right = 24; sc.top = 18; sc.bottom = -14; sc.near = 1; sc.far = 80;
    sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.04;
    s.add(sun);
    const R = rng(2077);
    this.buildSky();
    this.buildGround();
    this.buildGrass(R);
    this.buildFerns(R);
    this.buildCycads(R);
    this.buildGinkgos(R);
    this.buildFlowers(R);
    this.buildCards(R);
    this.buildButterflies(R);
    this.buildBirds(R);
    this.buildDino();
    this.buildPeople(R);
    this.buildPetalsAndPrints();
    this.tracks = this.cameraTracks();
  }

  private lam(p: THREE.MeshLambertMaterialParameters, ink = 1) { return illus(new THREE.MeshLambertMaterial(p), ink); }

  buildSky() {
    const A = this.A;
    const m = new THREE.ShaderMaterial({
      uniforms: { tP: { value: A.tex.parchment } }, side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: 'varying vec3 vD; varying vec2 vUv; void main(){ vD = normalize(position); vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);} ',
      fragmentShader: `uniform sampler2D tP; varying vec3 vD; varying vec2 vUv;
        void main(){ vec3 p = texture2D(tP, vUv*vec2(3.0,1.5)).rgb; float h = vD.y;
          vec3 c = mix(vec3(0.95,0.9,0.78), vec3(0.98,0.95,0.86), smoothstep(-0.05,0.5,h));
          // faint printed hills on the horizon
          float hill = 0.035*sin(atan(vD.z,vD.x)*5.0)+0.02*sin(atan(vD.z,vD.x)*13.0)+0.03;
          float band = smoothstep(hill+0.004, hill, h) * smoothstep(-0.05, 0.01, h);
          c = mix(c, vec3(0.74,0.76,0.6), band*0.5);
          gl_FragColor = vec4(c * (0.86 + p*0.16), 1.0); }`,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(150, 48, 24), m);
    this.scene.add(sky);
  }

  buildGround() {
    const A = this.A;
    const g = new THREE.PlaneGeometry(160, 160, 80, 80);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const d = Math.hypot(x, z + 8);
      pos.setY(i, d > 22 ? Math.sin(x * 0.07) * 1.5 * sstep(d, 22, 60) + Math.cos(z * 0.05) * 1.2 * sstep(d, 22, 60) : 0);
    }
    g.computeVertexNormals();
    const tex = canvasTex(1024, 1024, (c, w, h) => {
      c.fillStyle = '#d9cfa4'; c.fillRect(0, 0, w, h);
      const R = rng(9);
      for (let i = 0; i < 1600; i++) {
        const x = R() * w, y = R() * h, r = 6 + R() * 50;
        const hue = 70 + R() * 40, sat = 20 + R() * 25, l = 48 + R() * 22;
        c.fillStyle = `hsla(${hue},${sat}%,${l}%,${0.05 + R() * 0.08})`;
        c.beginPath(); c.ellipse(x, y, r * 1.6, r, R() * 3, 0, Math.PI * 2); c.fill();
      }
      c.fillStyle = 'rgba(60,50,30,0.35)';
      for (let i = 0; i < 9000; i++) { c.fillRect(R() * w, R() * h, 1.2, 1.2); }
    });
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(10, 10);
    const mat = this.lam({ map: tex, color: 0xffffff }, 0.8);
    const prev = mat.onBeforeCompile;
    mat.onBeforeCompile = (sh: any, r: any) => {
      prev.call(mat, sh, r);
      sh.uniforms.uDZ = { value: DINO_Z };
      sh.vertexShader = 'varying vec3 vWP;\n' + sh.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n vWP = (modelMatrix * vec4(transformed,1.0)).xyz;');
      sh.fragmentShader = 'varying vec3 vWP; uniform float uDZ;\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
        float path = 1.0 - smoothstep(0.9, 1.9, abs(vWP.z - uDZ - 0.25*sin(vWP.x*0.2)));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.78,0.66,0.46), path*0.55);`);
    };
    const ground = new THREE.Mesh(g, mat);
    ground.receiveShadow = true;
    this.scene.add(ground);
  }

  buildGrass(R: Rng) {
    const blade = new THREE.BufferGeometry();
    const P = [-0.012, 0, 0, 0.012, 0, 0, -0.008, 0.18, 0, 0.008, 0.18, 0, 0.0, 0.34, 0];
    blade.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    blade.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
    blade.setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4]);
    const N = 9000;
    const mat = this.lam({ color: 0xffffff, side: THREE.DoubleSide }, 0.7);
    const prev = mat.onBeforeCompile;
    mat.onBeforeCompile = (sh: any, r: any) => {
      prev.call(mat, sh, r);
      sh.uniforms.uTime = ILLUS.time;
      sh.uniforms.uFoot = this.footU;
      sh.vertexShader = 'uniform float uTime; uniform vec4 uFoot[10];\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        vec3 ip = (instanceMatrix * vec4(0.0,0.0,0.0,1.0)).xyz;
        float k = position.y / 0.34;
        float w = sin(uTime*1.7 + ip.x*0.6 + ip.z*0.4)*0.05 + sin(uTime*3.1 + ip.x*1.7)*0.02;
        transformed.x += w * k * k * 3.0;
        // trampling by the running dinosaur
        for (int i = 0; i < 10; i++) { vec4 f = uFoot[i]; float d = length(ip.xz - f.xz); float s = f.w * (1.0 - smoothstep(0.25, 1.1, d));
          transformed.y *= 1.0 - 0.75 * s; transformed.xz += normalize(ip.xz - f.xz + 0.001) * s * 0.25 * k; }`);
    };
    this.grass = new THREE.InstancedMesh(blade, mat, N);
    const m4 = new THREE.Matrix4(), c = new THREE.Color();
    for (let i = 0; i < N; i++) {
      const x = R.range(-26, 26), z = R.range(-24, 6);
      const sc = R.range(0.6, 1.5) * (Math.abs(z - DINO_Z) < 1.2 ? 0.6 : 1);
      m4.compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(R.range(-0.25, 0.25), R.range(0, Math.PI), R.range(-0.25, 0.25))), new THREE.Vector3(sc, sc * R.range(0.7, 1.4), sc));
      this.grass.setMatrixAt(i, m4);
      c.setHSL(R.range(0.16, 0.26), R.range(0.25, 0.45), R.range(0.32, 0.5));
      this.grass.setColorAt(i, c);
    }
    this.grass.frustumCulled = false;
    this.grass.receiveShadow = true;
    this.scene.add(this.grass);
  }

  /** merged geometry helper with a per-vertex sway weight */
  private merged(parts: { g: THREE.BufferGeometry; m: THREE.Matrix4; color?: THREE.Color; sway?: number; id?: number }[]) {
    const P: number[] = [], N: number[] = [], C: number[] = [], S: number[] = [], U: number[] = [], I: number[] = [], ID: number[] = [];
    const v = new THREE.Vector3(), nm = new THREE.Matrix3();
    for (const p of parts) {
      const g = p.g.index ? p.g : p.g;
      const pos = g.attributes.position as THREE.BufferAttribute, nor = g.attributes.normal as THREE.BufferAttribute, uv = g.attributes.uv as THREE.BufferAttribute;
      const col = (g.attributes as any).color as THREE.BufferAttribute | undefined;
      const base = P.length / 3;
      nm.getNormalMatrix(p.m);
      let minY = Infinity, maxY = -Infinity;
      for (let i = 0; i < pos.count; i++) { minY = Math.min(minY, pos.getY(i)); maxY = Math.max(maxY, pos.getY(i)); }
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(p.m); P.push(v.x, v.y, v.z);
        v.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize(); N.push(v.x, v.y, v.z);
        if (col) C.push(col.getX(i) * (p.color?.r ?? 1), col.getY(i) * (p.color?.g ?? 1), col.getZ(i) * (p.color?.b ?? 1));
        else C.push(p.color?.r ?? 1, p.color?.g ?? 1, p.color?.b ?? 1);
        S.push((p.sway ?? 1) * clamp((pos.getY(i) - minY) / Math.max(1e-4, maxY - minY)));
        U.push(uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0);
        ID.push(p.id ?? -1);
      }
      if (g.index) { const ix = g.index.array; for (let k = 0; k < ix.length; k++) I.push(base + ix[k]); }
      else for (let k = 0; k < pos.count; k++) I.push(base + k);
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    out.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    out.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
    out.setAttribute('sway', new THREE.Float32BufferAttribute(S, 1));
    out.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    out.setAttribute('fid', new THREE.Float32BufferAttribute(ID, 1));
    out.setIndex(I);
    return out;
  }

  private swayMat(params: THREE.MeshLambertMaterialParameters, amp = 0.08, ink = 1) {
    const mat = this.lam({ vertexColors: true, side: THREE.DoubleSide, ...params }, ink);
    const prev = mat.onBeforeCompile;
    mat.onBeforeCompile = (sh: any, r: any) => {
      prev.call(mat, sh, r);
      sh.uniforms.uTime = ILLUS.time;
      sh.uniforms.uShake = this.shakeU;
      sh.vertexShader = `uniform float uTime; uniform float uShake[16]; attribute float sway; attribute float fid;\n` + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        float sk = 0.0; int id = int(fid + 0.5); for (int i = 0; i < 16; i++) { if (i == id) sk = uShake[i]; }
        vec3 wp0 = (modelMatrix * vec4(position, 1.0)).xyz;
        float w = sin(uTime*1.3 + wp0.x*0.35 + wp0.z*0.2) * ${amp.toFixed(3)} + sin(uTime*2.6 + wp0.z*0.9) * ${(amp * 0.35).toFixed(3)};
        w += sk * (sin(uTime*21.0 + wp0.y*3.0) * 0.12 + sin(uTime*13.0) * 0.08);
        transformed.x += w * sway * sway * (1.0 + sk * 2.0);
        transformed.z += w * 0.5 * sway * sway;`);
    };
    return mat;
  }

  buildFerns(R: Rng) {
    // one frond: rachis + alternating pinnae (each pinna a tapered blade)
    const frond = (len: number) => {
      const parts: { g: THREE.BufferGeometry; m: THREE.Matrix4; color?: THREE.Color }[] = [];
      const rachis = new THREE.CylinderGeometry(0.006, 0.012, len, 4, 1);
      rachis.translate(0, len / 2, 0);
      parts.push({ g: rachis, m: new THREE.Matrix4(), color: new THREE.Color(0.35, 0.4, 0.22) });
      const n = 18;
      for (let i = 1; i < n; i++) {
        const u = i / n;
        const L = len * 0.32 * Math.sin(Math.PI * Math.min(1, u * 1.15)) * (1 - u * 0.4);
        const pin = new THREE.BufferGeometry();
        const w = L * 0.13;
        pin.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, L * 0.5, w, 0, L, 0, 0, L * 0.5, -w * 0.4, 0], 3));
        pin.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
        pin.setIndex([0, 1, 2, 0, 2, 3]);
        for (const sd of [-1, 1]) {
          const m = new THREE.Matrix4().compose(new THREE.Vector3(0, u * len, 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.25, sd < 0 ? Math.PI : 0, sd * 0.35 + (sd < 0 ? 0 : 0))), new THREE.Vector3(1, 1, 1));
          parts.push({ g: pin, m, color: new THREE.Color().setHSL(0.24 + u * 0.05, 0.32, 0.3 + u * 0.12) });
        }
      }
      return parts;
    };
    const all: { g: THREE.BufferGeometry; m: THREE.Matrix4; color?: THREE.Color; sway?: number }[] = [];
    const spots: THREE.Vector3[] = [];
    for (let k = 0; k < 46; k++) {
      let x = R.range(-22, 22), z = R.range(-22, 4);
      if (Math.abs(z - DINO_Z) < 2.2) z += 3.2 * Math.sign(z - DINO_Z || 1);
      if (Math.abs(x) < 1.6 && z > 0) x += 3;
      spots.push(new THREE.Vector3(x, 0, z));
    }
    // a few hero clumps framing the camera path
    spots.push(new THREE.Vector3(-2.6, 0, 2.2), new THREE.Vector3(2.9, 0, 1.4), new THREE.Vector3(-4.2, 0, -2.5), new THREE.Vector3(4.6, 0, -3.6));
    for (const sp of spots) {
      const nf = 7 + Math.floor(R() * 6);
      const len = R.range(0.9, 2.0);
      const tint = new THREE.Color().setHSL(R.range(-0.02, 0.04), 0, 0);
      for (let f = 0; f < nf; f++) {
        const yaw = (f / nf) * Math.PI * 2 + R.range(-0.2, 0.2);
        const pitch = R.range(0.45, 0.95);
        const base = new THREE.Matrix4().compose(sp, new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ')), new THREE.Vector3(1, 1, 1));
        for (const p of frond(len * R.range(0.8, 1.15))) {
          const c = p.color!.clone(); c.offsetHSL(tint.r * 0, 0, 0);
          all.push({ g: p.g, m: base.clone().multiply(p.m), color: c, sway: 1 });
        }
      }
    }
    const geo = this.merged(all);
    const mesh = new THREE.Mesh(geo, this.swayMat({}, 0.06, 0.9));
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    this.scene.add(mesh);
  }

  buildCycads(R: Rng) {
    const all: { g: THREE.BufferGeometry; m: THREE.Matrix4; color?: THREE.Color; sway?: number }[] = [];
    const trunkTex = canvasTex(256, 512, (c, w, h) => {
      c.fillStyle = '#8a7048'; c.fillRect(0, 0, w, h);
      c.strokeStyle = '#3a2a18'; c.lineWidth = 3;
      for (let y = -h; y < h * 2; y += 28) for (let x = -w; x < w * 2; x += 28) { c.beginPath(); c.moveTo(x, y); c.lineTo(x + 14, y + 14); c.lineTo(x, y + 28); c.lineTo(x - 14, y + 14); c.closePath(); c.stroke(); }
    });
    const trunks: THREE.Mesh[] = [];
    const tmat = this.lam({ map: trunkTex }, 1);
    for (const [x, z, h] of [[-7.5, -4.5, 1.6], [8.2, -10, 2.2], [-12, -13, 2.6], [5.4, 0.8, 1.2], [13, -5, 1.8], [-3.2, -12.5, 2.0]]) {
      const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.32, h, 12), tmat);
      tr.position.set(x, h / 2, z); tr.castShadow = true; tr.receiveShadow = true;
      this.scene.add(tr);
      addOutline(tr, 0.02);
      for (let f = 0; f < 16; f++) {
        const L = R.range(1.3, 2.1);
        const yaw = (f / 16) * Math.PI * 2;
        const pitch = R.range(0.6, 1.3);
        const g = new THREE.BufferGeometry();
        const P: number[] = [], I: number[] = [];
        const n = 14;
        for (let i = 0; i <= n; i++) {
          const u = i / n; const w = 0.16 * Math.sin(Math.PI * Math.min(1, u * 1.1)) + 0.01;
          const droop = -u * u * 0.5;
          P.push(-w, u * L, droop, w, u * L, droop);
        }
        for (let i = 0; i < n; i++) I.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
        g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
        g.setIndex(I); g.computeVertexNormals();
        const m = new THREE.Matrix4().compose(new THREE.Vector3(x, h, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ')), new THREE.Vector3(1, 1, 1));
        all.push({ g, m, color: new THREE.Color().setHSL(0.22, 0.38, R.range(0.26, 0.36)), sway: 0.6 });
      }
    }
    const mesh = new THREE.Mesh(this.merged(all), this.swayMat({}, 0.04));
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false;
    this.scene.add(mesh);
  }

  buildGinkgos(R: Rng) {
    const leafTex = canvasTex(128, 128, (c, w, h) => {
      c.clearRect(0, 0, w, h);
      c.fillStyle = '#9aa24a';
      c.beginPath(); c.moveTo(w / 2, h * 0.95);
      c.bezierCurveTo(w * 0.05, h * 0.4, w * 0.1, h * 0.05, w / 2 - 6, h * 0.12);
      c.lineTo(w / 2, h * 0.3); c.lineTo(w / 2 + 6, h * 0.12);
      c.bezierCurveTo(w * 0.9, h * 0.05, w * 0.95, h * 0.4, w / 2, h * 0.95); c.fill();
      c.strokeStyle = 'rgba(70,60,20,0.6)'; c.lineWidth = 1.2;
      for (let i = -5; i <= 5; i++) { c.beginPath(); c.moveTo(w / 2, h * 0.92); c.lineTo(w / 2 + i * 9, h * 0.15 + Math.abs(i) * 4); c.stroke(); }
      c.strokeStyle = '#3a3010'; c.lineWidth = 2; c.stroke();
    });
    const bark = this.lam({ color: 0x6a5238 }, 1);
    const leaves: { p: THREE.Vector3; s: number; r: THREE.Euler; c: THREE.Color }[] = [];
    for (const [x, z, H] of [[-10, -9, 6.5], [11, -16, 8], [-17, -18, 7.5], [3.5, -19, 9], [18, -9, 6]]) {
      const base = new THREE.Vector3(x, 0, z);
      const top = new THREE.Vector3(x + R.range(-0.4, 0.4), H, z + R.range(-0.4, 0.4));
      const trunk = new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(base, base.clone().lerp(top, 0.5).add(new THREE.Vector3(0.5, 0, 0)), top), 12, 0.28, 8), bark);
      trunk.castShadow = true; this.scene.add(trunk);
      for (let b = 0; b < 7; b++) {
        const s = top.clone().add(new THREE.Vector3(0, -R.range(0.5, 3.5), 0));
        const e = s.clone().add(new THREE.Vector3(R.range(-3, 3), R.range(0.5, 2.2), R.range(-2.5, 2.5)));
        const curve = new THREE.QuadraticBezierCurve3(s, s.clone().lerp(e, 0.5).add(new THREE.Vector3(0, 0.4, 0)), e);
        const br = new THREE.Mesh(new THREE.TubeGeometry(curve, 8, 0.07, 5), bark);
        br.castShadow = true; this.scene.add(br);
        for (let k = 0; k < 70; k++) {
          const p = curve.getPoint(R.range(0.2, 1)).add(new THREE.Vector3(R.range(-1.1, 1.1), R.range(-0.7, 0.9), R.range(-1.1, 1.1)));
          leaves.push({ p, s: R.range(0.22, 0.34), r: new THREE.Euler(R.range(0, 6.3), R.range(0, 6.3), R.range(0, 6.3)), c: new THREE.Color().setHSL(R.range(0.13, 0.2), 0.45, R.range(0.42, 0.58)) });
        }
      }
    }
    const g = new THREE.PlaneGeometry(1, 1);
    const im = new THREE.InstancedMesh(g, this.lam({ map: leafTex, alphaTest: 0.5, side: THREE.DoubleSide }, 0.6), leaves.length);
    const m4 = new THREE.Matrix4();
    leaves.forEach((l, i) => { m4.compose(l.p, new THREE.Quaternion().setFromEuler(l.r), new THREE.Vector3(l.s, l.s, l.s)); im.setMatrixAt(i, m4); im.setColorAt(i, l.c); });
    im.castShadow = true; im.frustumCulled = false;
    this.scene.add(im);
  }

  buildFlowers(R: Rng) {
    // archaic flowering silhouettes: magnolia-like cups, lotus stars, banner lilies
    const petalTex = (hue: string, ink: string) => canvasTex(128, 256, (c, w, h) => {
      const gr = c.createLinearGradient(0, h, 0, 0);
      gr.addColorStop(0, '#f3e6c8'); gr.addColorStop(0.35, hue); gr.addColorStop(1, hue);
      c.fillStyle = gr;
      c.beginPath(); c.moveTo(w / 2, h); c.bezierCurveTo(0, h * 0.6, w * 0.05, h * 0.1, w / 2, 0); c.bezierCurveTo(w * 0.95, h * 0.1, w, h * 0.6, w / 2, h); c.fill();
      c.strokeStyle = ink; c.lineWidth = 1.4; c.globalAlpha = 0.7;
      for (let i = -3; i <= 3; i++) { c.beginPath(); c.moveTo(w / 2, h); c.quadraticCurveTo(w / 2 + i * 10, h * 0.5, w / 2 + i * 13, h * 0.08); c.stroke(); }
      c.globalAlpha = 1; c.lineWidth = 2.5; c.strokeStyle = '#2a1d14';
      c.beginPath(); c.moveTo(w / 2, h); c.bezierCurveTo(0, h * 0.6, w * 0.05, h * 0.1, w / 2, 0); c.bezierCurveTo(w * 0.95, h * 0.1, w, h * 0.6, w / 2, h); c.stroke();
    });
    const kinds = [
      { tex: petalTex('#c8462e', '#6a1a10'), n: 7, L: 0.42, cup: 0.9 },
      { tex: petalTex('#3f4f8f', '#141c40'), n: 9, L: 0.34, cup: 0.5 },
      { tex: petalTex('#d79a2c', '#6a4410'), n: 6, L: 0.5, cup: 1.1 },
      { tex: petalTex('#2f8a86', '#0c3a38'), n: 8, L: 0.36, cup: 0.7 },
    ];
    const spots: [number, number, number][] = [
      [-0.6, -3.6, 1.1], [0.9, -4.2, 1.3], [2.2, -3.4, 0.95], [-1.9, -4.6, 1.4], [3.4, -4.8, 1.2], [0.2, -5.4, 1.6],
      [-3.4, -1.2, 0.9], [4.2, -1.8, 1.0], [-5.6, -6.2, 1.5], [6.4, -6.0, 1.3], [-8.5, -2.6, 1.1], [9.0, -2.8, 1.2],
      [-1.2, 0.8, 0.7], [1.6, 1.5, 0.8], [-6.8, 1.0, 1.0], [7.4, 0.6, 0.9],
    ];
    const stemParts: any[] = [];
    const petalGroups: any[][] = kinds.map(() => []);
    spots.forEach(([x, z, h], id) => {
      const kind = id % kinds.length;
      const top = new THREE.Vector3(x + R.range(-0.15, 0.15), h, z + R.range(-0.15, 0.15));
      const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(x, 0, z), new THREE.Vector3(x + R.range(-0.3, 0.3), h * 0.55, z), top);
      stemParts.push({ g: new THREE.TubeGeometry(curve, 10, 0.016, 5), m: new THREE.Matrix4(), color: new THREE.Color(0.34, 0.42, 0.2), sway: 1, id });
      // a couple of broad leaves on the stem
      for (let k = 0; k < 2; k++) {
        const lg = new THREE.PlaneGeometry(0.16, 0.5, 1, 4);
        lg.translate(0, 0.25, 0);
        const pp = curve.getPoint(0.25 + k * 0.25);
        stemParts.push({ g: lg, m: new THREE.Matrix4().compose(pp, new THREE.Quaternion().setFromEuler(new THREE.Euler(0.9, k * 2.5 + id, 0, 'YXZ')), new THREE.Vector3(1, 1, 1)), color: new THREE.Color(0.32, 0.45, 0.22), sway: 1, id });
      }
      const K = kinds[kind];
      for (let p = 0; p < K.n; p++) {
        const pg = new THREE.PlaneGeometry(K.L * 0.5, K.L, 2, 4);
        pg.translate(0, K.L / 2, 0);
        // cup the petal
        const pa = pg.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < pa.count; i++) { const yy = pa.getY(i) / K.L, xx = pa.getX(i); pa.setZ(i, -xx * xx * 3 + yy * yy * 0.06); }
        pg.computeVertexNormals();
        const yaw = (p / K.n) * Math.PI * 2;
        const m = new THREE.Matrix4().compose(top, new THREE.Quaternion().setFromEuler(new THREE.Euler(K.cup + R.range(-0.1, 0.1), yaw, 0, 'YXZ')), new THREE.Vector3(1, 1, 1));
        petalGroups[kind].push({ g: pg, m, color: new THREE.Color(1, 1, 1), sway: 1, id });
      }
      stemParts.push({ g: new THREE.SphereGeometry(0.05, 10, 8), m: new THREE.Matrix4().makeTranslation(top.x, top.y + 0.02, top.z), color: new THREE.Color(0.55, 0.4, 0.12), sway: 1, id });
      this.flowers.push({ pos: top, id });
    });
    const stems = new THREE.Mesh(this.merged(stemParts), this.swayMat({}, 0.05));
    stems.castShadow = true; stems.frustumCulled = false;
    this.scene.add(stems);
    kinds.forEach((K, i) => {
      const pm = new THREE.Mesh(this.merged(petalGroups[i]), this.swayMat({ map: K.tex, alphaTest: 0.4, vertexColors: false }, 0.05, 0.7));
      pm.castShadow = true; pm.frustumCulled = false;
      this.scene.add(pm);
    });
  }

  buildCards(R: Rng) {
    // Image 02's specimen plant as hand-painted cut-out cards in the foreground
    const A = this.A;
    const mat = this.lam({ map: A.tex.plant02, alphaTest: 0.35, side: THREE.DoubleSide }, 0.2);
    const img = A.tex.plant02.image as HTMLImageElement;
    const ar = img.width / img.height;
    for (const [x, z, h, r] of [[-1.7, 1.2, 1.1, 0.4], [1.9, -0.4, 1.3, -0.3], [-4.8, -3.2, 1.2, 0.2], [5.4, -4.4, 1.4, -0.5], [-0.4, -6.4, 1.2, 0.1], [3.0, 2.4, 0.9, -0.2]]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(h * ar, h), mat);
      m.position.set(x, h / 2, z); m.rotation.y = r;
      m.castShadow = true;
      this.scene.add(m);
    }
    // the warbler from Image 02, perched on a foreground specimen
    const bimg = A.tex.bird.image as HTMLImageElement;
    const bar = bimg.width / bimg.height;
    this.cardBird = new THREE.Mesh(new THREE.PlaneGeometry(0.34 * bar, 0.34), this.lam({ map: A.tex.bird, alphaTest: 0.35, side: THREE.DoubleSide }, 0.15));
    this.cardBird.castShadow = true;
    this.scene.add(this.cardBird);
  }

  buildButterflies(R: Rng) {
    const A = this.A;
    const species = ['w_swallowtail', 'w_crimson', 'w_goldclear', 'w_hawkmoth', 'w_indigo', 'w_creammoth'];
    // wing pair geometry: right wing in +x (hinge on z axis), left wing mirrored.
    const mk = () => {
      const g = new THREE.PlaneGeometry(1, 2, 6, 6);
      g.rotateX(-Math.PI / 2); // lie flat, body axis along z
      g.translate(0.5, 0, 0);
      const pa = g.attributes.position as THREE.BufferAttribute, uv = g.attributes.uv as THREE.BufferAttribute;
      const P: number[] = [], U: number[] = [], S: number[] = [], N: number[] = [];
      for (const side of [1, -1]) {
        for (let i = 0; i < pa.count; i++) {
          const x = pa.getX(i), z = pa.getZ(i);
          const y = -0.06 * x * x + 0.04 * Math.sin(z * 2.2); // micro-curved membrane
          P.push(x * side, y, z); U.push(uv.getX(i), uv.getY(i)); S.push(side); N.push(0, 1, 0);
        }
      }
      const idx: number[] = [];
      const ix = g.index!.array;
      for (let k = 0; k < ix.length; k += 3) { idx.push(ix[k], ix[k + 1], ix[k + 2]); idx.push(ix[k] + pa.count, ix[k + 2] + pa.count, ix[k + 1] + pa.count); }
      const out = new THREE.BufferGeometry();
      out.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
      out.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
      out.setAttribute('side', new THREE.Float32BufferAttribute(S, 1));
      out.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
      out.setIndex(idx);
      return out;
    };
    const geo = mk();
    const COUNT = 96;
    for (let i = 0; i < COUNT; i++) {
      const sp = i % species.length;
      const near = i < 40;
      this.bflies.push({
        species: sp, seed: R() * 1000,
        c: near ? new THREE.Vector3(R.range(-4, 4), R.range(0.7, 2.0), R.range(-3.5, 3.8)) : new THREE.Vector3(R.range(-10, 10), R.range(0.6, 2.8), R.range(-14, -2)),
        r: near ? new THREE.Vector3(R.range(0.5, 1.6), R.range(0.15, 0.45), R.range(0.4, 1.4)) : new THREE.Vector3(R.range(0.8, 3.2), R.range(0.25, 0.7), R.range(0.8, 2.6)),
        f: [R.range(0.06, 0.16), R.range(0.12, 0.3), R.range(0.05, 0.14)],
        flap: R.range(7, 12), size: (near ? R.range(0.1, 0.17) : R.range(0.08, 0.14)) * (sp === 0 ? 1.4 : sp === 1 ? 0.75 : 1), delay: 0,
      });
    }
    species.forEach((k, sp) => {
      const n = this.bflies.filter((b) => b.species === sp).length;
      const mat = this.lam({ map: A.tex[k], alphaTest: 0.4, side: THREE.DoubleSide }, 0.25);
      const prev = mat.onBeforeCompile;
      mat.onBeforeCompile = (sh: any, r: any) => {
        prev.call(mat, sh, r);
        sh.vertexShader = 'attribute float side; attribute float flapA;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
          float a = flapA * side; float cx = cos(a), sx = sin(a);
          transformed = vec3(transformed.x * cx - transformed.y * sx, transformed.x * sx + transformed.y * cx, transformed.z);`);
      };
      const g = geo.clone();
      g.setAttribute('flapA', new THREE.InstancedBufferAttribute(new Float32Array(n), 1));
      // per-instance flap: InstancedBufferAttribute needs instanced geometry semantics
      const im = new THREE.InstancedMesh(g, mat, n);
      im.castShadow = true; im.frustumCulled = false;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.bflyMeshes.push(im);
      this.scene.add(im);
    });
    const body = new THREE.CapsuleGeometry(0.06, 0.9, 4, 8);
    body.rotateX(Math.PI / 2);
    this.bflyBody = new THREE.InstancedMesh(body, this.lam({ color: 0x2a2018 }, 0.3), COUNT);
    this.bflyBody.frustumCulled = false;
    this.scene.add(this.bflyBody);
  }

  buildBirds(R: Rng) {
    const tex = canvasTex(256, 128, (c, w, h) => {
      c.fillStyle = '#8a5e3a'; c.fillRect(0, 0, w, h);
      const Rr = rng(31);
      for (let i = 0; i < 420; i++) { c.strokeStyle = `rgba(${40 + Rr() * 30},${25 + Rr() * 20},${15},${0.4 + Rr() * 0.4})`; c.lineWidth = 1 + Rr() * 2; const x = Rr() * w, y = Rr() * h; c.beginPath(); c.moveTo(x, y); c.lineTo(x + 6 + Rr() * 8, y + Rr() * 3); c.stroke(); }
      const gr = c.createLinearGradient(0, h * 0.55, 0, h); gr.addColorStop(0, 'rgba(240,226,196,0)'); gr.addColorStop(1, 'rgba(240,226,196,0.95)'); c.fillStyle = gr; c.fillRect(0, 0, w, h);
    });
    const bodyMat = this.lam({ map: tex }, 0.6);
    const wingMat = this.lam({ map: tex, side: THREE.DoubleSide, color: 0xc8a888 }, 0.6);
    const beakMat = this.lam({ color: 0x3a2a1a }, 0.4);
    const perches = [
      ...this.flowers.slice(0, 10).map((f) => f.pos.clone().add(new THREE.Vector3(0, 0.08, 0))),
    ];
    for (let i = 0; i < 12; i++) {
      const g = new THREE.Group();
      const bodyG = new THREE.SphereGeometry(0.06, 14, 10); bodyG.scale(0.8, 0.75, 1.35);
      const body = new THREE.Mesh(bodyG, bodyMat); g.add(body);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.038, 12, 10), bodyMat); head.position.set(0, 0.045, 0.07); g.add(head);
      const beak = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.045, 6), beakMat); beak.rotation.x = Math.PI / 2; beak.position.set(0, 0.04, 0.115); g.add(beak);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.007, 6, 6), new THREE.MeshBasicMaterial({ color: 0x110a05 }));
      eye.position.set(0.026, 0.055, 0.09); g.add(eye);
      const eye2 = eye.clone(); eye2.position.x = -0.026; g.add(eye2);
      const tailG = new THREE.PlaneGeometry(0.06, 0.14); tailG.rotateX(-Math.PI / 2 + 0.3); tailG.translate(0, 0.0, -0.13);
      g.add(new THREE.Mesh(tailG, wingMat));
      const wingG = new THREE.PlaneGeometry(0.16, 0.09); wingG.rotateX(-Math.PI / 2); wingG.translate(0.08, 0, 0);
      const wr = new THREE.Object3D(); wr.position.set(0.035, 0.02, 0); wr.add(new THREE.Mesh(wingG, wingMat)); g.add(wr);
      const wl = new THREE.Object3D(); wl.position.set(-0.035, 0.02, 0); wl.scale.x = -1; wl.add(new THREE.Mesh(wingG, wingMat)); g.add(wl);
      g.traverse((o: any) => { if (o.isMesh) o.castShadow = true; });
      addOutline(body, 0.004);
      const flyer = i >= perches.length;
      const perch = flyer ? new THREE.Vector3(R.range(-10, 10), R.range(1.5, 4.5), R.range(-14, -3)) : perches[i];
      const flee = new THREE.Vector3(R.range(-1, 1), 1.2, R.range(-1, 0.3)).normalize().multiplyScalar(R.range(6, 12));
      const size = R.range(0.9, 1.25);
      g.scale.setScalar(size);
      this.birds.push({ g, wl, wr, perch, flee, seed: R() * 100, flyer, size });
      this.scene.add(g);
    }
  }

  buildDino() {
    const A = this.A;
    const root = SkeletonUtils.clone(A.gltf.dinosaur.scene);
    const skin = this.lam({ vertexColors: true, color: new THREE.Color(0.62, 0.5, 0.36) }, 1.0);
    root.traverse((o: any) => {
      if (!o.isMesh) return;
      o.castShadow = true; o.receiveShadow = true;
      o.material = (o.material.name || '').includes('Eye') ? new THREE.MeshBasicMaterial({ vertexColors: true }) : skin;
    });
    const sk: any[] = []; root.traverse((o: any) => { if (o.isSkinnedMesh) sk.push(o); });
    sk.forEach((o) => addOutline(o, 0.02));
    root.scale.setScalar(1.15);
    this.scene.add(root);
    this.dino = { root, rig: new Rig(root) };
  }

  buildPeople(R: Rng) {
    const A = this.A;
    const src = A.gltf.cave_people.scene;
    const rigs = src.children.filter((c) => c.name.startsWith('Cave'));
    const furTex = canvasTex(256, 256, (c, w, h) => {
      c.fillStyle = '#8a6a44'; c.fillRect(0, 0, w, h);
      const Rr = rng(8);
      for (let i = 0; i < 2600; i++) { c.strokeStyle = `rgba(${50 + Rr() * 60},${35 + Rr() * 40},${20},${0.5})`; c.lineWidth = 1; const x = Rr() * w, y = Rr() * h; c.beginPath(); c.moveTo(x, y); c.lineTo(x + Rr() * 4 - 2, y + 5 + Rr() * 6); c.stroke(); }
      for (let i = 0; i < 40; i++) { c.fillStyle = 'rgba(40,25,10,0.35)'; c.beginPath(); c.ellipse(Rr() * w, Rr() * h, 6 + Rr() * 12, 4 + Rr() * 8, Rr() * 3, 0, 7); c.fill(); }
    });
    furTex.wrapS = furTex.wrapT = THREE.RepeatWrapping; furTex.repeat.set(4, 4);
    const targets = [0, 1, 2, 3, 4, 5];
    rigs.forEach((r, i) => {
      const root = SkeletonUtils.clone(r);
      root.position.set(0, 0, 0);
      const skin = this.lam({ vertexColors: true, color: new THREE.Color(0.66, 0.5, 0.42) }, 0.9);
      const fur = this.lam({ map: furTex }, 1.0);
      const hair = this.lam({ color: 0x2a1c12, side: THREE.DoubleSide }, 1.0);
      root.traverse((o: any) => {
        if (!o.isMesh) return;
        o.castShadow = true;
        const map = (mm: any) => { const n = mm.name || ''; return n.includes('Fur') ? fur : n.includes('Hair') ? hair : n.includes('Eye') ? new THREE.MeshBasicMaterial({ vertexColors: true }) : skin; };
        o.material = Array.isArray(o.material) ? o.material.map(map) : map(o.material);
      });
      const sk: any[] = []; root.traverse((o: any) => { if (o.isSkinnedMesh) sk.push(o); });
      sk.forEach((o) => addOutline(o, 0.008));
      this.scene.add(root);
      const rig = new Rig(root);
      const fl = this.flowers[targets[i]];
      const target = fl.pos.clone(); target.y = 0;
      const toward = new THREE.Vector3(R.range(-0.6, 0.6), 0, -R.range(0.55, 0.8)); // behind the flower, facing camera
      target.add(toward.normalize().multiplyScalar(0.55));
      const start = new THREE.Vector3(-16 - i * 1.3, 0, -3 + R.range(-2, 2));
      let club: THREE.Object3D | undefined;
      if (i % 2 === 0) {
        club = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.04, 0.85, 6), this.lam({ color: 0x5a3c22 }, 1));
        club.castShadow = true;
        const hand = rig.bones[rig.key('hand.R')];
        hand.add(club);
        club.position.set(0, 0.08, 0);
      }
      this.people.push({ root, rig, seed: R() * 10, target, start, club, flower: targets[i] });
    });
  }

  buildPetalsAndPrints() {
    // petals knocked loose by the comic flower-batting
    const R = rng(404);
    const g = new THREE.PlaneGeometry(0.06, 0.1);
    const mat = this.lam({ side: THREE.DoubleSide, color: 0xffffff }, 0.3);
    const N = 260;
    this.petals = new THREE.InstancedMesh(g, mat, N);
    this.petals.frustumCulled = false;
    this.petals.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const b = B();
    const cols = [0xc8462e, 0x3f4f8f, 0xd79a2c, 0x2f8a86].map((c) => new THREE.Color(c));
    for (let i = 0; i < N; i++) {
      const pi = i % 6;
      const f = this.flowers[pi];
      const t0 = b.strikeStart + 0.3 + R() * (b.whiteout - b.strikeStart - 0.6);
      this.petalData.push({ t0, p: f.pos.clone(), v: new THREE.Vector3(R.range(-1.5, 1.5), R.range(0.5, 2.2), R.range(-1.2, 1.6)), spin: new THREE.Vector3(R.range(-9, 9), R.range(-9, 9), R.range(-9, 9)), col: cols[pi % 4] });
      this.petals.setColorAt(i, cols[pi % 4]);
    }
    this.scene.add(this.petals);
    // footprints pressed into the path
    const fpTex = canvasTex(128, 128, (c, w, h) => {
      c.clearRect(0, 0, w, h); c.fillStyle = 'rgba(60,40,20,0.55)';
      for (const a of [-0.5, 0, 0.5]) { c.save(); c.translate(w / 2, h * 0.8); c.rotate(a); c.beginPath(); c.ellipse(0, -h * 0.35, 9, h * 0.33, 0, 0, Math.PI * 2); c.fill(); c.restore(); }
    });
    const fg = new THREE.PlaneGeometry(0.55, 0.55); fg.rotateX(-Math.PI / 2);
    this.prints = new THREE.InstancedMesh(fg, new THREE.MeshBasicMaterial({ map: fpTex, transparent: true, depthWrite: false, opacity: 0.9 }), 24);
    this.prints.frustumCulled = false;
    this.scene.add(this.prints);
    // footfall dust
    const D = 600;
    const pos = new Float32Array(D * 3), sd = new Float32Array(D * 4);
    const Rr = rng(5);
    for (let i = 0; i < D; i++) { sd.set([Rr(), Rr(), Rr(), Rr()], i * 4); }
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    pg.setAttribute('seed', new THREE.BufferAttribute(sd, 4));
    this.dust = new THREE.Points(pg, new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uPx: { value: 600 } }, transparent: true, depthWrite: false,
      vertexShader: `attribute vec4 seed; uniform float uPx; varying float vA; void main(){ vA = seed.w; vec4 mv = modelViewMatrix*vec4(position,1.0); gl_PointSize = (0.04+seed.x*0.08)*uPx/-mv.z; gl_Position = projectionMatrix*mv; }`,
      fragmentShader: `varying float vA; void main(){ vec2 d=gl_PointCoord-0.5; float a=(1.0-smoothstep(0.2,0.5,length(d))); gl_FragColor=vec4(0.62,0.52,0.36,a*vA*0.5);} `,
    }));
    this.dust.frustumCulled = false;
    this.scene.add(this.dust);
  }

  cameraTracks() {
    const b = B();
    return [
      new Track([
        { t: b.start, p: [-2.4, 0.55, 5.2], l: [-0.8, 0.9, -2], f: 32 },
        { t: 54, p: [-1.2, 0.9, 3.6], l: [0.4, 1.1, -3], f: 34 },
        { t: 58.5, p: [0.6, 1.05, 2.6], l: [1.4, 1.15, -1.6], f: 42 },
        { t: 62, p: [1.6, 1.25, 3.3], l: [-0.6, 1.2, -2.8], f: 38 },
        { t: b.dinoEnter - 0.4, p: [0.4, 1.3, 1.6], l: [0, 1.4, -7.5], f: 28 },
      ]),
      new Track([{ t: b.dinoEnter - 0.4, p: [0.4, 1.3, 1.6], l: [0, 1.4, -7.5], f: 28 }, { t: b.dinoExit + 1.2, p: [0.25, 1.35, 1.9], l: [-1.4, 1.3, -7.5], f: 28 }], (x) => x),
      new Track([{ t: b.dinoExit + 1.2, p: [0.25, 1.35, 1.9], l: [-1.4, 1.3, -7.5], f: 28 }, { t: b.peopleEnter + 1.0, p: [-0.4, 1.45, 4.2], l: [-1.4, 1.0, -3.8], f: 32 }, { t: b.whiteout, p: [0.4, 1.3, 2.1], l: [0.6, 1.0, -4.2], f: 36 }]),
    ];
  }

  /* ---------------------------------------------------------- animation */
  private dinoPose(t: number) {
    const b = B();
    const D = this.dino;
    const R = D.rig;
    R.reset();
    const vis = t > b.dinoEnter - 0.5 && t < b.dinoExit + 1.5;
    D.root.visible = vis;
    if (!vis) return null;
    const x = dinoX(t);
    const speed = 52 / (b.dinoExit - b.dinoEnter + 2.2);
    const stride = 3.1; // m per full cycle (two steps)
    const ph = ((b.dinoPass - t) * speed / stride) * Math.PI * 2;
    const s = Math.sin(ph), c = Math.cos(ph);
    D.root.position.set(x, 0.04 * Math.abs(Math.sin(ph)) - 0.03, DINO_Z + Math.sin(t * 0.7) * 0.3);
    D.root.rotation.set(0, -Math.PI / 2, 0); // faces -x (model faces +z)
    // run cycle (model axes: +z forward). legs swing in pitch about x
    const swing = 0.62;
    R.rot('thigh.L', -swing * s);
    R.rot('thigh.R', swing * s);
    R.rot('shin.L', 0.55 + 0.45 * Math.max(0, Math.cos(ph + 0.4)));
    R.rot('shin.R', 0.55 + 0.45 * Math.max(0, Math.cos(ph + Math.PI + 0.4)));
    R.rot('meta.L', -0.5 * Math.max(0, Math.sin(ph + 1.2)));
    R.rot('meta.R', -0.5 * Math.max(0, Math.sin(ph + Math.PI + 1.2)));
    R.rot('toe.L', 0.4 * Math.max(0, -s));
    R.rot('toe.R', 0.4 * Math.max(0, s));
    R.rot('pelvis', 0.1, 0.06 * s, 0.04 * c);
    R.rot('chest', 0.05, -0.05 * s, 0);
    // counterbalancing tail wave
    ['tail1', 'tail2', 'tail3', 'tail4', 'tail5'].forEach((n, i) => R.rot(n, -0.04, 0.09 * Math.sin(ph - i * 0.5), 0));
    // neck lowered and forward for running; head stabilised
    R.rot('neck1', 0.42, 0.04 * s, 0);
    R.rot('neck2', 0.18, 0, 0);
    R.rot('neck3', -0.1, 0, 0);
    R.rot('neck4', -0.25, 0, 0);
    R.rot('head', -0.2 + 0.03 * c, 0, 0);
    R.rot('arm.L', 0.6, 0, 0.1); R.rot('arm.R', 0.6, 0, -0.1);
    R.rot('farm.L', -1.0); R.rot('farm.R', -1.0);
    // foot contacts -> trampled grass + prints
    return { x, ph, speed };
  }

  update(t: number) {
    const b = B();
    const cam = this.camera;
    evalTracks(this.tracks, t, cam);
    cam.updateProjectionMatrix();
    ILLUS.time.value = t;
    const H = this.renderer.getDrawingBufferSize(new THREE.Vector2()).y;
    ILLUS.res.value = H;
    const px = H / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2));
    // ---- dinosaur
    const dp = this.dinoPose(t);
    // footprints (deterministic: computed from contact times)
    const speed = 52 / (b.dinoExit - b.dinoEnter + 2.2);
    const stepDist = 3.1 / 2;
    const m4 = new THREE.Matrix4();
    let k = 0;
    const foot = this.footU.value;
    foot.forEach((f) => f.set(0, -100, 0, 0));
    let fi = 0;
    for (let n = -20; n <= 20; n++) {
      const xs = n * stepDist; // contact positions along the path
      const tc = b.dinoPass - xs / speed;
      if (t < tc || t > tc + 9) continue;
      const side = n % 2 === 0 ? 1 : -1;
      const p = new THREE.Vector3(xs, 0.012, DINO_Z + side * 0.27 + Math.sin(tc * 0.7) * 0.3);
      const age = t - tc;
      if (k < 24) {
        const sc = 1.15 * (1 - sstep(age, 6, 9));
        m4.compose(p, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0)), new THREE.Vector3(sc, 1, sc));
        this.prints.setMatrixAt(k++, m4);
      }
      if (fi < 10) foot[fi++].set(p.x, 0, p.z, Math.max(0, 1 - age / 2.5));
    }
    for (; k < 24; k++) { m4.makeScale(0, 0, 0); this.prints.setMatrixAt(k, m4); }
    this.prints.instanceMatrix.needsUpdate = true;
    // dust puffs from contacts
    const dpos = this.dust.geometry.attributes.position as THREE.BufferAttribute;
    const dsd = this.dust.geometry.attributes.seed as THREE.BufferAttribute;
    for (let i = 0; i < dpos.count; i++) {
      const n = (i % 30) - 15;
      const xs = n * stepDist, tc = b.dinoPass - xs / speed, age = t - tc;
      const a1 = dsd.getX(i), a2 = dsd.getY(i), a3 = dsd.getZ(i);
      if (age < 0 || age > 2.4) { dpos.setXYZ(i, 0, -50, 0); continue; }
      const e = 1 - Math.exp(-age * 2.2);
      dpos.setXYZ(i, xs + (a1 - 0.5) * 1.6 * e - age * 0.6, 0.05 + a2 * 0.7 * e, DINO_Z + (a3 - 0.5) * 1.4 * e);
      dsd.setW(i, (1 - age / 2.4) * 0.9);
    }
    dpos.needsUpdate = true; dsd.needsUpdate = true;
    (this.dust.material as THREE.ShaderMaterial).uniforms.uPx.value = px;
    // ---- startle field (dinosaur passing beat)
    const startle = (delay: number) => sstep(t - delay, b.dinoPass - 1.8, b.dinoPass - 0.9) * (1 - sstep(t - delay, b.dinoPass + 1.6, b.dinoPass + 6.0));
    const chaos = pulse(t, b.strikeStart - 0.3, b.whiteout + 1, 0.8);
    // ---- butterflies
    const counts = new Array(6).fill(0);
    const q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), p2 = new THREE.Vector3(), sc = new THREE.Vector3();
    this.bflies.forEach((bf, i) => {
      const s0 = bf.seed;
      const pathAt = (tt: number, out: THREE.Vector3) => {
        out.set(
          bf.c.x + Math.sin(tt * bf.f[0] * 6.28 + s0) * bf.r.x + Math.sin(tt * bf.f[0] * 2.3 * 6.28 + s0 * 2) * bf.r.x * 0.3,
          bf.c.y + Math.sin(tt * bf.f[1] * 6.28 + s0 * 3) * bf.r.y + Math.sin(tt * 2.9 + s0) * 0.08,
          bf.c.z + Math.cos(tt * bf.f[2] * 6.28 + s0 * 1.7) * bf.r.z);
        // scatter away from the running dinosaur, then drift back
        const dz = out.z - DINO_Z;
        const st = startle(Math.abs(out.x) / 14 + (s0 % 1) * 0.4);
        out.y += st * (1.6 + (s0 % 1.3));
        out.z += st * Math.sign(dz || 1) * 2.4;
        out.x += st * Math.sin(s0) * 1.5;
        out.addScaledVector(new THREE.Vector3(Math.sin(s0 * 5), 0.6, Math.cos(s0 * 3)), chaos * 0.8);
        return out;
      };
      pathAt(t, p); pathAt(t + 0.05, p2);
      const dir = p2.clone().sub(p);
      const yaw = Math.atan2(dir.x, dir.z) + Math.PI; // forewing (texture top) leads
      const bank = clamp(-dir.x * 3, -0.5, 0.5);
      e.set(clamp(-dir.y * 6, -0.6, 0.6) - 0.3, yaw, bank, 'YXZ');
      q.setFromEuler(e);
      sc.setScalar(bf.size);
      m4.compose(p, q, sc);
      const im = this.bflyMeshes[bf.species];
      const idx = counts[bf.species]++;
      im.setMatrixAt(idx, m4);
      const st = startle(0);
      const flapRate = bf.flap * (1 + st * 0.8 + chaos * 0.5);
      const a = 0.25 + 0.95 * (0.5 + 0.5 * Math.sin(t * flapRate * 6.28 * 0.16 + s0));
      ((im.geometry.attributes as any).flapA as THREE.InstancedBufferAttribute).setX(idx, a);
      this.bflyBody.setMatrixAt(i, new THREE.Matrix4().compose(p, q, new THREE.Vector3(bf.size * 0.5, bf.size * 0.5, bf.size * 0.55)));
    });
    this.bflyMeshes.forEach((im) => { im.instanceMatrix.needsUpdate = true; ((im.geometry.attributes as any).flapA as THREE.BufferAttribute).needsUpdate = true; });
    this.bflyBody.instanceMatrix.needsUpdate = true;
    // ---- birds
    this.birds.forEach((bd, i) => {
      const st = startle(0.15 + (bd.seed % 1) * 0.4);
      const ch = chaos;
      const fly = Math.max(st, ch);
      if (bd.flyer) {
        // crossing birds at depth on looping paths
        const u = (t * 0.06 + bd.seed) % 1;
        p.set(-22 + u * 44, bd.perch.y + Math.sin(u * 12 + bd.seed) * 0.6, bd.perch.z + Math.sin(u * 5) * 2);
        p.y += fly * 2;
        bd.g.position.copy(p);
        bd.g.rotation.set(0, Math.PI / 2, Math.sin(t * 3 + bd.seed) * 0.1);
        const f = Math.sin(t * 22 + bd.seed) * 0.9;
        bd.wr.rotation.z = f; bd.wl.rotation.z = -f;
        return;
      }
      const away = bd.perch.clone().add(bd.flee.clone().multiplyScalar(fly)).add(new THREE.Vector3(Math.sin(t * 2 + bd.seed) * fly, Math.sin(t * 3.1 + bd.seed) * 0.3 * fly, 0));
      bd.g.position.copy(away);
      const look = Math.sin(t * 0.9 + bd.seed * 3) * 0.6 + Math.sin(t * 2.3 + bd.seed) * 0.2;
      bd.g.rotation.set(-0.15 * fly, bd.seed + look * (1 - fly) + fly * Math.atan2(bd.flee.x, bd.flee.z), 0);
      const f = fly > 0.05 ? Math.sin(t * 26 + bd.seed) * 1.0 : -0.1 + Math.sin(t * 0.5 + bd.seed) * 0.02;
      bd.wr.rotation.z = f; bd.wl.rotation.z = -f;
      bd.g.children[1].rotation.z = (1 - fly) * Math.sin(Math.floor(t * 1.3 + bd.seed) * 7.1) * 0.35; // head tilts
    });
    // card bird (Image 02 warbler) hops, then flees on the startle
    {
      const st = startle(0.2);
      const base = new THREE.Vector3(-1.62, 0.92, 1.25);
      const hop = Math.max(0, Math.sin(t * 2.1)) ** 8 * 0.04;
      this.cardBird.position.copy(base).add(new THREE.Vector3(-3 * st, hop + 4 * st * st, -2 * st));
      this.cardBird.rotation.set(0, 0.5, Math.sin(Math.floor(t * 0.8) * 3.7) * 0.08);
      this.cardBird.scale.set(1, 1 - 0.3 * st * Math.abs(Math.sin(t * 30)), 1);
      this.cardBird.visible = st < 0.98;
    }
    // ---- prehistoric people: arrive exactly 6 s after the dinosaur's pass
    const shake = this.shakeU.value;
    for (let i = 0; i < 16; i++) shake[i] = 0;
    this.people.forEach((pp, i) => {
      const R = pp.rig;
      R.reset();
      const t0 = b.peopleEnter + i * 0.18;
      const vis = t > t0 - 0.2;
      pp.root.visible = vis;
      if (!vis) return;
      const arrive = b.strikeStart - 0.2 + i * 0.12;
      const k = sstep(t, t0, arrive);
      const pos = pp.start.clone().lerp(pp.target, k);
      const run = k < 0.999 ? 1 : 0;
      const dir = pp.target.clone().sub(pp.start).normalize();
      const fl = this.flowers[pp.flower].pos;
      const faceFlower = Math.atan2(fl.x - pos.x, fl.z - pos.z);
      const yaw = run ? Math.atan2(dir.x, dir.z) : faceFlower;
      const ph = (pos.distanceTo(pp.start) / 1.25) * Math.PI * 2;
      const sn = Math.sin(ph);
      pp.root.position.copy(pos);
      pp.root.position.y = run * Math.abs(Math.cos(ph)) * 0.05;
      pp.root.rotation.set(0, yaw, 0);
      R.rot('thigh.L', -0.7 * sn * run); R.rot('thigh.R', 0.7 * sn * run);
      R.rot('shin.L', run * (0.15 + 0.9 * Math.max(0, Math.cos(ph + 0.6)) ** 2)); R.rot('shin.R', run * (0.15 + 0.9 * Math.max(0, Math.cos(ph + Math.PI + 0.6)) ** 2));
      R.rot('hips', 0.18 * run, 0.1 * sn * run, 0);
      R.rot('spine', 0.15 * run, 0, 0);
      // flailing arms while running, then batting the flowers
      const strike = sstep(t, arrive, arrive + 0.3) * (1 - sstep(t, b.whiteout - 0.1, b.whiteout + 0.4));
      const bat = Math.sin((t - arrive) * (7 + i) + pp.seed) ;
      R.rot('uparm.L', -0.6 * sn * run - strike * (1.4 + 0.9 * bat), 0, 0.25 + strike * 0.3);
      R.rot('uparm.R', 0.6 * sn * run - strike * (1.5 - 0.9 * bat), 0, -0.25 - strike * 0.4);
      R.rot('farm.L', -0.8 * run - strike * (0.6 + 0.4 * bat));
      R.rot('farm.R', -0.8 * run - strike * (0.7 - 0.5 * bat));
      R.rot('spine', 0.25 * strike * (0.5 + 0.5 * bat), 0.3 * strike * bat, 0);
      R.rot('head', -0.2 * strike, 0.3 * Math.sin(t * 5 + i) * strike, 0);
      // grunt jaw
      R.setMorph('MouthOpen', strike * Math.max(0, Math.sin(t * 9 + i * 2)) + run * 0.3);
      R.setMorph('Brow', 0.8 * strike);
      shake[pp.flower] = Math.max(shake[pp.flower], strike * (0.6 + 0.4 * Math.abs(bat)));
    });
    // ---- petals
    const g = 2.2;
    this.petalData.forEach((pd, i) => {
      const age = t - pd.t0;
      if (age < 0) { m4.makeScale(0, 0, 0); this.petals.setMatrixAt(i, m4); return; }
      const drag = 1 - Math.exp(-age * 1.4);
      p.copy(pd.p).addScaledVector(pd.v, drag / 1.4);
      p.y -= g * 0.5 * age * age * 0.3;
      p.x += Math.sin(age * 3 + i) * 0.15;
      p.y = Math.max(0.02, p.y);
      e.set(pd.spin.x * age, pd.spin.y * age, pd.spin.z * age);
      m4.compose(p, q.setFromEuler(e), sc.setScalar(1));
      this.petals.setMatrixAt(i, m4);
    });
    this.petals.instanceMatrix.needsUpdate = true;
  }

  grade(t: number): Grade {
    const b = B();
    const flare = sstep(t, b.whiteout - 1.0, b.whiteout);
    return { exposure: 1.02 + flare * 0.6, lift: [0.04, 0.03, 0.01], gamma: [1.0, 1.0, 0.97], gain: [1.02, 1.0, 0.94], sat: 0.92, contrast: 0.96, vignette: 0.48, grain: 0.03, ca: 0.0006, bloom: 0.12 + flare * 0.8, bloomThreshold: 0.92, paper: 0.85 };
  }
}
