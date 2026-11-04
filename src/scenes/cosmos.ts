import * as THREE from 'three';
import type { Assets } from '../core/assets';
import { T, sstep, sstep2, lin, pulse, clamp, mix, rng, canvasTex, easeInOut, easeOut } from '../core/util';
import type { Grade } from '../core/post';
import { PhoneRig, SPECS } from '../phones/phoneRig';
import { studioEnv } from './fold';

const C = () => T.cosmos;

/** the same smooth field drives the shader dissolve and the dust emission */
function dissolveField(x: number, y: number, z: number) {
  // starts along the outer edges and the two hinge seams, then breaks inward
  const e = Math.min(1.095 - Math.abs(x), 0.78 - Math.abs(y)) / 0.6;
  const sm = Math.min(Math.abs(x - 0.365), Math.abs(x + 0.365)) / 0.25 + 0.1;
  const st = Math.min(1, Math.max(0, Math.min(e, sm)));
  const qx = x * 2.6, qy = y * 2.6, qz = z * 2.6;
  const n = 0.5 + 0.22 * Math.sin(qx * 7.3 + Math.sin(qy * 5.1)) + 0.18 * Math.sin(qy * 9.7 + qz * 4.3) + 0.1 * Math.sin((qx + qz) * 15.0);
  return 0.6 * st + 0.4 * n;
}
const FIELD_GLSL = `float dField(vec3 p){ float e = min(1.095 - abs(p.x), 0.78 - abs(p.y)) / 0.6; float sm = min(abs(p.x - 0.365), abs(p.x + 0.365)) / 0.25 + 0.1; float st = clamp(min(e, sm), 0.0, 1.0); vec3 q = p * 2.6; float n = 0.5 + 0.22*sin(q.x*7.3 + sin(q.y*5.1)) + 0.18*sin(q.y*9.7 + q.z*4.3) + 0.1*sin((q.x+q.z)*15.0); return 0.6*st + 0.4*n; }`;

export class CosmosScene {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(35, 16 / 9, 0.02, 3000);
  xt: PhoneRig;
  xt2: PhoneRig;
  stars!: THREE.Points;
  nebulae: THREE.Mesh[] = [];
  nebMat!: THREE.ShaderMaterial;
  novae: THREE.Sprite[] = [];
  flares!: THREE.InstancedMesh;
  dust!: THREE.Points;
  disU = { value: -1 };
  dissolveDust!: THREE.Points;
  rimRed!: THREE.DirectionalLight;
  rimViolet!: THREE.DirectionalLight;
  key!: THREE.DirectionalLight;
  text1!: TextParticles;
  text2!: TextParticles;
  cake!: THREE.Object3D;
  cakeBodies: THREE.Mesh[] = [];
  flames: THREE.Mesh[] = [];
  splat!: THREE.Object3D;
  stage!: THREE.Mesh;
  finalCam = { p: new THREE.Vector3(-0.95, 1.85, -7.9), l: new THREE.Vector3(0, -0.3, 0) };

  constructor(private A: Assets, private renderer: THREE.WebGLRenderer) {
    const s = this.scene;
    s.background = new THREE.Color(0x000000);
    this.buildSky();
    const envRed = studioEnv(renderer, new THREE.Color(1.0, 0.82, 0.78), 0.03);
    const envViolet = studioEnv(renderer, new THREE.Color(0.86, 0.8, 1.0), 0.03);
    const src = A.gltf.phones.scene;
    this.xt = new PhoneRig(SPECS.matext, src, A, envRed);
    this.xt2 = new PhoneRig(SPECS.matext2, src, A, envViolet);
    s.add(this.xt.root, this.xt2.root);
    this.patchDissolve(this.xt);
    this.key = new THREE.DirectionalLight(0xfff2e6, 2.4);
    this.key.position.set(3, 4, 6);
    s.add(this.key);
    this.rimRed = new THREE.DirectionalLight(0xff3a30, 0);
    this.rimRed.position.set(-6, 2, -5);
    s.add(this.rimRed);
    this.rimViolet = new THREE.DirectionalLight(0xa070ff, 0);
    this.rimViolet.position.set(6, 3, -5);
    s.add(this.rimViolet);
    s.add(new THREE.HemisphereLight(0x4a3a6a, 0x100810, 0.35));
    this.buildDissolveDust();
    this.text1 = new TextParticles('and everything you waaant', 'italic 500 150px "Cormorant Garamond", Georgia, serif', new THREE.Color(0.86, 0.8, 1.0), 6500, 3.5, A, 11);
    this.text2 = new TextParticles('Happy birthday Matex', '500 150px "Bodoni Moda", Didot, Georgia, serif', new THREE.Color(1.0, 0.87, 0.8), 7000, 3.6, A, 23);
    s.add(this.text1.group, this.text2.group);
    this.buildCake();
  }

  /* ----------------------------------------------------------------- sky */
  buildSky() {
    const s = this.scene;
    const R = rng(1987);
    // stars: dimensionally distributed shell + a soft galactic band
    const N = 16000;
    const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), mag = new Float32Array(N);
    const band = new THREE.Vector3(0.3, 0.8, 0.5).normalize();
    for (let i = 0; i < N; i++) {
      let v = new THREE.Vector3(R.range(-1, 1), R.range(-1, 1), R.range(-1, 1)).normalize();
      if (R() < 0.45) { v.addScaledVector(band, -v.dot(band) * (0.85 + R() * 0.12)).normalize(); }
      const r = R.range(260, 900);
      pos.set([v.x * r, v.y * r, v.z * r], i * 3);
      const temp = R();
      const c = temp < 0.15 ? [1.0, 0.75, 0.6] : temp < 0.7 ? [1, 0.96, 0.92] : [0.75, 0.85, 1.0];
      col.set(c, i * 3);
      mag[i] = Math.pow(R(), 6);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('mag', new THREE.BufferAttribute(mag, 1));
    this.stars = new THREE.Points(g, new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uFade: { value: 1 }, uScale: { value: 1 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `attribute float mag; attribute vec3 color; uniform float uTime, uFade, uScale; varying vec3 vC; varying float vA;
        void main(){ vC = color; float tw = 0.8 + 0.2*sin(uTime*(1.0+mag*3.0) + position.x*0.13);
          vA = (0.25 + mag*3.0) * tw * uFade; vec4 mv = modelViewMatrix*vec4(position,1.0); gl_PointSize = (1.2 + mag*4.0) * uScale; gl_Position = projectionMatrix*mv; }`,
      fragmentShader: `varying vec3 vC; varying float vA; void main(){ vec2 d = gl_PointCoord-0.5; float a = 1.0 - smoothstep(0.0, 0.5, length(d)); gl_FragColor = vec4(vC*a*vA, 1.0); }`,
    }));
    this.stars.frustumCulled = false;
    s.add(this.stars);
    // rare bright stars with diffraction flares
    const fl = new THREE.PlaneGeometry(1, 1);
    this.flares = new THREE.InstancedMesh(fl, new THREE.MeshBasicMaterial({ map: this.A.tex.starFlare, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: new THREE.Color(1.6, 1.5, 1.4) }), 46);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < 46; i++) {
      const v = new THREE.Vector3(R.range(-1, 1), R.range(-0.6, 0.8), R.range(-1, 0.4)).normalize().multiplyScalar(R.range(300, 500));
      const sz = R.range(6, 16);
      m4.compose(v, new THREE.Quaternion(), new THREE.Vector3(sz, sz, sz));
      this.flares.setMatrixAt(i, m4);
    }
    this.flares.frustumCulled = false;
    s.add(this.flares);
    // distant galaxies (procedural spirals & ellipticals)
    for (let i = 0; i < 14; i++) {
      const spiral = i % 3 !== 0;
      const tex = canvasTex(128, 128, (c, w, h) => {
        const gr = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
        gr.addColorStop(0, 'rgba(255,240,220,0.9)'); gr.addColorStop(0.15, 'rgba(220,200,255,0.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = gr; c.fillRect(0, 0, w, h);
        if (spiral) {
          c.strokeStyle = 'rgba(190,200,255,0.25)'; c.lineWidth = 3;
          for (let arm = 0; arm < 2; arm++) { c.beginPath(); for (let k = 0; k < 60; k++) { const a = k * 0.12 + arm * Math.PI, r = k * 0.9; c.lineTo(w / 2 + Math.cos(a) * r, h / 2 + Math.sin(a) * r * 0.9); } c.stroke(); }
        }
      });
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, rotation: R() * 6 }));
      sp.position.set(R.range(-1, 1), R.range(-0.5, 0.7), R.range(-1, -0.2)).normalize().multiplyScalar(R.range(500, 800));
      sp.scale.set(R.range(14, 34), R.range(6, 20), 1);
      s.add(sp);
    }
    // nebula veils (domain-warped fbm), palette moves crimson -> violet
    this.nebMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uPurple: { value: 0 }, uAmt: { value: 0 }, uSeed: { value: 0 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);} ',
      fragmentShader: `uniform float uTime, uPurple, uAmt, uSeed; varying vec2 vUv;
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
        float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
        float fbm(vec2 p){ float a=0.5, s=0.0; for(int i=0;i<5;i++){ s+=a*n(p); p*=2.03; a*=0.5; } return s; }
        void main(){ vec2 p = vUv*3.0 + uSeed; vec2 q = vec2(fbm(p + uTime*0.01), fbm(p + 3.7));
          float f = fbm(p + q*1.8); float fil = pow(1.0 - abs(fbm(p*1.7 + q) - 0.5)*2.0, 6.0);
          float r = length(vUv - 0.5); float m = smoothstep(0.5, 0.12, r) * (1.0 - smoothstep(0.0, 0.5, r) * 0.2);
          vec3 red = mix(vec3(0.5,0.04,0.06), vec3(1.0,0.35,0.25), fil);
          vec3 vio = mix(vec3(0.22,0.06,0.42), vec3(0.75,0.55,1.0), fil);
          vec3 c = mix(red, vio, uPurple);
          float dark = smoothstep(0.55, 0.75, fbm(p*1.3 - q));
          float a = (pow(f, 3.2) * 0.75 + fil * 0.12) * m * (1.0 - dark * 0.8);
          gl_FragColor = vec4(c * a * uAmt, 1.0); }`,
    });
    const R2 = rng(3);
    for (let i = 0; i < 4; i++) {
      const mat = this.nebMat.clone();
      mat.uniforms = THREE.UniformsUtils.clone(this.nebMat.uniforms);
      mat.uniforms.uSeed.value = i * 7.3;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
      const d = new THREE.Vector3(R2.range(-0.8, 0.8), R2.range(-0.3, 0.4), -1).normalize().multiplyScalar(R2.range(220, 330));
      m.position.copy(d);
      m.lookAt(0, 0, 0);
      m.scale.setScalar(R2.range(260, 420));
      m.frustumCulled = false;
      this.nebulae.push(m);
      s.add(m);
    }
    // hypernova blooms: crimson stellar eruptions far away
    const novaTex = canvasTex(256, 256, (c, w, h) => {
      const gr = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.06, 'rgba(255,200,180,0.9)'); gr.addColorStop(0.25, 'rgba(255,60,40,0.35)'); gr.addColorStop(0.62, 'rgba(160,10,20,0.1)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = gr; c.fillRect(0, 0, w, h);
      c.strokeStyle = 'rgba(255,120,90,0.35)'; c.lineWidth = 3; c.beginPath(); c.arc(w / 2, h / 2, w * 0.38, 0, Math.PI * 2); c.stroke();
    });
    const NV = C().novae as number[];
    NV.forEach((_, i) => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: novaTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: new THREE.Color(2.2, 0.9, 0.8) }));
      const a = -1.2 + i * 0.6;
      sp.position.set(Math.sin(a) * 260, R.range(-40, 90), -Math.cos(a) * 260 - 60);
      this.novae.push(sp);
      s.add(sp);
    });
    // near drifting dust for parallax
    const D = 1800;
    const dp = new Float32Array(D * 3), ds = new Float32Array(D);
    for (let i = 0; i < D; i++) { dp.set([R.range(-12, 12), R.range(-7, 7), R.range(-14, 6)], i * 3); ds[i] = R(); }
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.BufferAttribute(dp, 3));
    dg.setAttribute('seed', new THREE.BufferAttribute(ds, 1));
    this.dust = new THREE.Points(dg, new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uPx: { value: 600 }, uCol: { value: new THREE.Color(1, 0.6, 0.6) } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `attribute float seed; uniform float uTime, uPx; varying float vA; void main(){ vec3 p = position + vec3(sin(uTime*0.05+seed*40.0), cos(uTime*0.04+seed*20.0), 0.0)*0.6; vA = 0.25+0.75*seed; vec4 mv = modelViewMatrix*vec4(p,1.0); gl_PointSize = max(1.0, (0.012+seed*0.02)*uPx/-mv.z); gl_Position = projectionMatrix*mv; }`,
      fragmentShader: `uniform vec3 uCol; varying float vA; void main(){ vec2 d=gl_PointCoord-0.5; float a = 1.0 - smoothstep(0.0,0.5,length(d)); gl_FragColor = vec4(uCol*a*vA*0.45, 1.0); }`,
    }));
    this.dust.frustumCulled = false;
    s.add(this.dust);
  }

  /* ------------------------------------------------- Mate XT turns to dust */
  patchDissolve(r: PhoneRig) {
    const seen = new Set<THREE.Material>();
    r.root.traverse((o: any) => {
      if (!o.isMesh) return;
      for (const m of (Array.isArray(o.material) ? o.material : [o.material]) as THREE.Material[]) {
        if (seen.has(m)) continue;
        seen.add(m);
        const prev = m.onBeforeCompile;
        m.onBeforeCompile = (sh: any, rr: any) => {
          prev?.call(m, sh, rr);
          sh.uniforms.uDis = this.disU;
          sh.vertexShader = 'varying vec3 vDisP;\n' + sh.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n vDisP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
          sh.fragmentShader = `uniform float uDis; varying vec3 vDisP; ${FIELD_GLSL}\n` + sh.fragmentShader
            .replace('void main() {', 'void main() {\n float dF = dField(vDisP); if (uDis > -0.5 && dF < uDis) discard;')
            .replace('#include <dithering_fragment>', '#include <dithering_fragment>\n if (uDis > -0.5) { float edge = 1.0 - smoothstep(0.0, 0.05, dF - uDis); gl_FragColor.rgb += vec3(1.6, 0.55, 0.3) * edge * 3.0; }');
        };
        m.needsUpdate = true;
      }
    });
  }

  buildDissolveDust() {
    // particles seeded on the opened Mate XT surface (approximate panel planes)
    const R = rng(66);
    const N = 9000;
    const pos = new Float32Array(N * 3), sd = new Float32Array(N * 4);
    for (let i = 0; i < N; i++) {
      const x = R.range(-1.09, 1.09), y = R.range(-0.78, 0.78), z = R.range(-0.036, 0.0);
      pos.set([x, y, z], i * 3);
      sd.set([dissolveField(x, y, z), R(), R(), R()], i * 4);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('seed', new THREE.BufferAttribute(sd, 4));
    this.dissolveDust = new THREE.Points(g, new THREE.ShaderMaterial({
      uniforms: { uDis: this.disU, uTime: { value: 0 }, uPx: { value: 600 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `attribute vec4 seed; uniform float uDis, uPx; varying float vA;
        void main(){ float born = seed.x; float age = max(0.0, uDis - born) * 3.0; vec3 p = position;
          vec3 dir = normalize(vec3(seed.y - 0.5, seed.z - 0.4, seed.w - 0.3));
          p += dir * age * (0.6 + seed.y) + vec3(0.0, age*age*0.15, 0.0);
          vA = (uDis > born ? 1.0 : 0.0) * exp(-age * 0.9);
          vec4 mv = modelViewMatrix*vec4(p,1.0); gl_PointSize = max(1.0, (0.006 + seed.z*0.01)*uPx/-mv.z); gl_Position = projectionMatrix*mv; }`,
      fragmentShader: `varying float vA; void main(){ vec2 d=gl_PointCoord-0.5; float a = 1.0 - smoothstep(0.0,0.5,length(d)); gl_FragColor = vec4(vec3(1.0,0.62,0.4)*a*vA*1.4, 1.0); }`,
    }));
    this.dissolveDust.frustumCulled = false;
    this.xt.root.add(this.dissolveDust);
  }

  /* ---------------------------------------------------------------- cake */
  buildCake() {
    const A = this.A;
    const ck = A.gltf.cake.scene.clone(true);
    const spongeT = A.tex.sponge;
    spongeT.wrapS = spongeT.wrapT = THREE.RepeatWrapping;
    ck.traverse((o: any) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      const map = (m: any) => {
        const n = m.name || '';
        if (n.includes('Sponge')) return new THREE.MeshPhysicalMaterial({ map: spongeT, color: 0xf0c890, roughness: 0.85, sheen: 0.4, sheenColor: new THREE.Color(1, 0.8, 0.5) });
        if (n.includes('Cream')) return new THREE.MeshPhysicalMaterial({ color: 0xfff6ec, roughness: 0.32, normalMap: A.tex.creamN, normalScale: new THREE.Vector2(0.4, 0.4), clearcoat: 0.6, clearcoatRoughness: 0.35, sheen: 0.3, sheenColor: new THREE.Color(1, 0.9, 0.95) });
        if (n.includes('Cherry')) return new THREE.MeshPhysicalMaterial({ color: 0x9a0814, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05 });
        if (n.includes('Berry')) return new THREE.MeshPhysicalMaterial({ color: 0x2a2a6a, roughness: 0.35, sheen: 0.6, sheenColor: new THREE.Color(0.6, 0.6, 0.9) });
        if (n.includes('Stem')) return new THREE.MeshStandardMaterial({ color: 0x4a5a1a, roughness: 0.6 });
        if (n.includes('Candle')) return new THREE.MeshPhysicalMaterial({ color: 0xf6c8e0, roughness: 0.45, clearcoat: 0.4 });
        if (n.includes('Flame')) return new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 1.8, 0.6) });
        if (n.includes('Gold')) return new THREE.MeshStandardMaterial({ color: 0xe0b060, metalness: 1, roughness: 0.25 });
        if (n.includes('Plate')) return new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.12, clearcoat: 1 });
        return m;
      };
      o.material = Array.isArray(o.material) ? o.material.map(map) : map(o.material);
      if (o.morphTargetDictionary && o.morphTargetDictionary.Squash !== undefined) this.cakeBodies.push(o);
      if (o.name.startsWith('Cake_flame')) { this.flames.push(o); o.castShadow = false; }
      if (o.name === 'Cake_splat') this.splat = o;
    });
    ck.scale.setScalar(3.1);
    this.cake = ck;
    this.scene.add(ck);
    // invisible stage that only catches the cake's shadow + a warm key
    this.stage = new THREE.Mesh(new THREE.CircleGeometry(2.2, 48), new THREE.ShadowMaterial({ opacity: 0.45, color: 0x1a0830 }));
    this.stage.rotation.x = -Math.PI / 2;
    this.stage.receiveShadow = true;
    this.scene.add(this.stage);
    const spot = new THREE.SpotLight(0xffeedd, 9, 20, 0.5, 0.6, 1.5);
    spot.castShadow = true;
    spot.shadow.mapSize.set(1024, 1024);
    spot.shadow.radius = 4;
    this.cakeSpot = spot;
    this.scene.add(spot, spot.target);
  }
  cakeSpot!: THREE.SpotLight;

  /* ------------------------------------------------------------ timeline */
  update(t: number) {
    const c = C();
    const cam = this.camera;
    const H = this.renderer.getDrawingBufferSize(new THREE.Vector2()).y;
    const px = H / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2));
    // ---- sky state
    const starIn = sstep(t, c.start + 0.3, c.start + 4.5);
    const sm = this.stars.material as THREE.ShaderMaterial;
    sm.uniforms.uTime.value = t; sm.uniforms.uFade.value = starIn; sm.uniforms.uScale.value = H / 1080;
    (this.flares.material as THREE.MeshBasicMaterial).opacity = starIn;
    const purple = sstep(t, c.purple[0], c.purple[1]);
    this.nebulae.forEach((m, i) => {
      const u = (m.material as THREE.ShaderMaterial).uniforms;
      u.uTime.value = t; u.uPurple.value = purple;
      u.uAmt.value = 0.42 * sstep(t, c.start + 2, c.start + 9) * (0.55 + 0.45 * sstep(t, c.xt.open2[0], c.xt.orbit[0])) * (0.85 + 0.3 * pulse(t, c.purple[0], c.end, 2));
    });
    const dm = this.dust.material as THREE.ShaderMaterial;
    dm.uniforms.uTime.value = t; dm.uniforms.uPx.value = px;
    (dm.uniforms.uCol.value as THREE.Color).setRGB(mix(1, 0.75, purple), mix(0.55, 0.6, purple), mix(0.5, 1, purple));
    // hypernova blooms during the red orbit
    let novaLight = 0;
    (c.novae as number[]).forEach((tn, i) => {
      const age = t - tn;
      const sp = this.novae[i];
      const k = age < 0 ? 0 : (1 - Math.exp(-age * 4)) * Math.exp(-age * 0.45);
      sp.visible = k > 0.002 && purple < 0.95;
      const sc = (40 + age * 22) * (0.4 + k);
      sp.scale.set(sc, sc, 1);
      (sp.material as THREE.SpriteMaterial).opacity = k * (1 - purple);
      novaLight = Math.max(novaLight, k);
    });
    this.rimRed.intensity = (1.2 + novaLight * 4) * pulse(t, c.xt.t0, c.xt.dissolve[1], 1.5);
    this.rimViolet.intensity = 2.0 * sstep(t, c.purple[0], c.xt2.t0 + 2);
    // ---- Mate XT (red)
    this.updateXT(t);
    // ---- Mate XT 2 (purple)
    this.updateXT2(t);
    // ---- finale: text + cake
    this.updateFinale(t, px);
  }

  private orbitCam(target: THREE.Vector3, dist: number, az: number, el: number, f = 50) {
    const c = this.camera;
    c.position.set(target.x + Math.sin(az) * Math.cos(el) * dist, target.y + Math.sin(el) * dist, target.z + Math.cos(az) * Math.cos(el) * dist);
    c.lookAt(target);
    c.filmGauge = 36; c.setFocalLength(f);
  }

  updateXT(t: number) {
    const c = C().xt;
    const r = this.xt;
    const vis = t >= c.t0 - 0.2 && t < c.dissolve[1] + 0.2;
    r.root.visible = vis;
    this.dissolveDust.visible = false;
    if (!vis) { if (t < C().xt2.t0) this.orbitCam(new THREE.Vector3(0, 0, 0), 7.5, 0, 0.05, 35); return; }
    const o = new THREE.Vector3(0, 0, 0);
    // hinge angles: [C-B outward, B-A inward]
    const thA = mix(Math.PI, 0.0, sstep2(t, c.open1[0], c.open1[1]));   // dual-screen: A swings open
    const thC = mix(Math.PI, 0.0, sstep2(t, c.open2[0], c.open2[1]));   // tri-screen: C unfolds from behind
    r.resetParts();
    r.setFold([thC, thA]);
    const asm = clamp(lin(t, c.t0, c.asmEnd));
    if (asm < 1) r.assemble(asm, 4.2);
    // screen regions: cover (C) lit in single-screen mode, then B+A, then all three
    const single = pulse(t, c.flip[0] - 0.3, c.open1[0] + 0.6, 0.4);
    r.coverMix.value = single;
    r.panelLit.value.set(single + sstep(t, c.open2[0], c.open2[0] + 0.8), sstep(t, c.open1[0] - 0.2, c.open1[0] + 0.6), sstep(t, c.open1[0] - 0.2, c.open1[0] + 0.6));
    r.brightness.value = 1.05;
    // orientation: back (camera) -> flip to cover screen -> back to front for opening
    let ry = mix(-0.5, 0.35, sstep(t, c.t0, c.asmEnd));
    ry = mix(ry, Math.PI - 0.25, sstep(t, c.flip[0], c.flip[1]));
    ry = mix(ry, 0.0, sstep(t, c.open1[0] - 0.4, c.open1[0] + 0.6));
    const hover = Math.sin(t * 0.7) * 0.03;
    r.root.position.set(0, hover, 0);
    r.root.rotation.set(-0.06, ry, 0.02, 'YXZ');
    // camera: macro drifts during assembly, then hero framing, then a full orbit
    if (t < c.asmEnd) {
      const u = lin(t, c.t0, c.asmEnd);
      const az = mix(-0.7, 0.25, u), el = mix(0.2, 0.08, u);
      this.orbitCam(new THREE.Vector3(mix(-0.2, 0, u), mix(0.3, 0, u), 0), mix(3.4, 4.8, easeInOut(u)), az, el, mix(62, 50, u));
    } else if (t < c.orbit[0]) {
      const u = lin(t, c.asmEnd, c.orbit[0]);
      this.orbitCam(o, mix(4.8, 5.4, u), mix(0.25, 0.0, u), 0.08, 45);
    } else {
      const u = easeInOut(lin(t, c.orbit[0], c.dissolve[0] + 0.6));
      this.orbitCam(o, 5.6 - Math.sin(u * Math.PI) * 0.4, u * Math.PI * 2, 0.1 + Math.sin(u * Math.PI) * 0.22, 42);
    }
    // dissolve into fine dust from the seams inward
    const d = lin(t, c.dissolve[0], c.dissolve[1]);
    this.disU.value = d > 0 ? mix(0.0, 1.05, d) : -1;
    if (d > 0) {
      this.dissolveDust.visible = true;
      (this.dissolveDust.material as THREE.ShaderMaterial).uniforms.uPx.value = this.renderer.getDrawingBufferSize(new THREE.Vector2()).y / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2));
      this.dissolveDust.position.copy(r.body.position);
    }
  }

  updateXT2(t: number) {
    const c = C().xt2;
    const r = this.xt2;
    const vis = t >= c.t0 - 0.2;
    r.root.visible = vis;
    if (!vis) return;
    // [P1-P2 outer wing, P2-P3 inner wing]; both fold inward, opening from both sides
    let th1 = mix(Math.PI, 0.0, sstep2(t, c.openP1[0], c.openP1[1]));
    let th3 = mix(Math.PI, 0.0, sstep2(t, c.openP3[0], c.openP3[1]));
    const v = sstep2(t, c.vpose[0], c.vpose[1]);
    th1 = mix(th1, 0.62, v); th3 = mix(th3, 0.62, v);  // final Image-17 wing V
    r.resetParts();
    r.setFold([th1, th3]);
    const asm = clamp(lin(t, c.t0, c.asmEnd));
    if (asm < 1) r.assemble(asm, 4.6);
    r.coverMix.value = 0;
    const lit = sstep(t, c.openP1[0] + 0.4, c.openP3[1]);
    r.panelLit.value.set(lit, lit, lit);
    r.brightness.value = 1.05;
    // the device stays put (screen toward +z); the camera travels around it
    const hover = Math.sin(t * 0.6) * 0.025;
    r.root.position.set(0, hover + v * 0.42, 0);
    r.root.rotation.set(-0.03, 0, 0, 'YXZ');
    if (t < C().purple[0] + 1) return;
    const back = Math.PI - 0.55;
    if (t < c.asmEnd) {
      const u = lin(t, c.t0, c.asmEnd);
      this.orbitCam(new THREE.Vector3(0, mix(0.4, 0, u), 0), mix(1.9, 5.0, easeInOut(u)), mix(Math.PI + 0.7, back, u), mix(0.3, 0.3, u), mix(72, 45, u));
    } else if (t < c.orbit[0]) {
      // wings unfold from behind the centre body, seen from an elevated rear 3/4 (Image 17 family)
      const u = lin(t, c.asmEnd, c.orbit[0]);
      this.orbitCam(new THREE.Vector3(0, 0, 0), mix(5.0, 5.6, u), back, mix(0.3, 0.22, u), 45);
    } else if (t < c.vpose[0]) {
      // gentle 360°: front reveal (Image 19), macro on frame/screen edge, macro on the faceted camera
      const u = lin(t, c.orbit[0], c.vpose[0] - 0.2);
      const e = easeInOut(u);
      const az = back + e * (Math.PI * 2 + 0.55 - 0.55);
      const macroA = pulse(u, 0.36, 0.48, 0.04), macroB = pulse(u, 0.8, 0.93, 0.04);
      const tgt = new THREE.Vector3(0, 0, 0).lerp(new THREE.Vector3(-1.0, -0.25, 0.02), macroA).lerp(new THREE.Vector3(0, 0.48, 0), macroB);
      const dist = mix(5.6, 1.5, macroA) * (1 - macroB) + 1.2 * macroB;
      this.orbitCam(tgt, dist, az, 0.12 + 0.12 * Math.sin(u * Math.PI), mix(45, 68, Math.max(macroA, macroB)));
    } else {
      // final hero: elevated, slightly frontal 3/4 of the BACK (Image 17); wings recede into a V
      const fc = this.finalCam;
      const u = sstep(t, c.vpose[0], c.vpose[1]);
      const from = new THREE.Vector3(Math.sin(back + Math.PI * 2) * 5.6, 0.12 * 5.6, Math.cos(back + Math.PI * 2) * 5.6);
      const p = from.lerp(fc.p, easeInOut(u));
      p.x += Math.sin(t * 0.15) * 0.05 * u;
      const l = new THREE.Vector3(0, 0, 0).lerp(fc.l, u);
      this.camera.position.copy(p);
      this.camera.lookAt(l);
      this.camera.filmGauge = 36; this.camera.setFocalLength(mix(45, 40, u));
    }
  }

  updateFinale(t: number, px: number) {
    const c = C();
    const fc = this.finalCam;
    const textY = -0.52;
    this.text1.update(t, c.text1[0], c.text1[1], new THREE.Vector3(0, textY, -0.5), px, this.camera);
    this.text2.update(t, c.text2, c.end + 5, new THREE.Vector3(0, textY, -0.5), px, this.camera);
    // cake: falls beneath the words, lands on an invisible stage, squashes a little
    const ti = c.cakeImpact, td = c.cakeDrop;
    const vis = t >= td;
    this.cake.visible = vis;
    this.stage.visible = vis;
    this.cakeSpot.visible = vis;
    if (!vis) return;
    const restY = -1.62;
    const g = 2 * 4.2 / Math.pow(ti - td, 2);
    let y = restY;
    if (t < ti) y = restY + 4.2 - 0.5 * g * (t - td) * (t - td);
    else {
      const tau = t - ti;
      y = restY + Math.max(0, Math.sin(Math.min(tau, 0.42) / 0.42 * Math.PI)) * 0.09 * Math.exp(-tau * 2); // little rebound
    }
    this.cake.position.set(-0.02, y, -0.65);
    this.cake.rotation.set(0, Math.PI + 0.35 + (t < ti ? (ti - t) * 0.6 : 0), t < ti ? (ti - t) * 0.08 : 0);
    const tau = Math.max(0, t - ti);
    const squash = t < ti ? 0 : 0.36 + 0.55 * Math.exp(-tau * 5.5) * Math.cos(tau * 17);
    const lean = t < ti ? 0 : 0.5 * Math.exp(-tau * 3) * Math.sin(tau * 11);
    for (const b of this.cakeBodies) {
      const inf = b.morphTargetInfluences!, dict = b.morphTargetDictionary!;
      inf[dict.Squash] = clamp(squash, 0, 1.2);
      inf[dict.Lean] = lean;
    }
    // flames ride the squashed top and flicker
    this.flames.forEach((f, i) => {
      f.position.y = -0.03 * clamp(squash, 0, 1.2) * 1.2;
      const fl = 1 + 0.12 * Math.sin(t * 23 + i * 2) + 0.08 * Math.sin(t * 37 + i);
      f.scale.set(1 / fl, fl, 1 / fl);
    });
    // one comedic cream splat
    const sk = sstep(t, ti, ti + 0.18);
    this.splat.visible = t > ti;
    this.splat.scale.set(0.3 + sk * 0.9, 1, 0.3 + sk * 1.1);
    this.splat.position.set(0.11 + sk * 0.03, 0.002, 0.02);
    this.stage.position.set(-0.02, restY - 0.005, -0.65);
    this.cakeSpot.position.set(-1.2, restY + 4.5, -3.2);
    this.cakeSpot.target.position.set(-0.02, restY, -0.65);
  }

  grade(t: number): Grade {
    const c = C();
    const purple = sstep(t, c.purple[0], c.purple[1]);
    const red = pulse(t, c.xt.t0, c.purple[1], 2);
    return {
      exposure: 1.0, lift: [0.01 + red * 0.012 * (1 - purple), 0.0, 0.012 + purple * 0.012], gamma: [1, 1, 1], gain: [1.02, 0.98, 1.04],
      sat: 1.06, contrast: 1.08, vignette: 0.42, grain: 0.03, ca: 0.0012, bloom: 0.3, bloomRadius: 0.55, bloomThreshold: 0.88,
    };
  }
}

/* --------------------------------------------------------------------------
 * Words made of starlight: particles converge from violet dust into the
 * letterforms, a crisp glyph plate fades in, then it all dissolves to sparks.
 * ----------------------------------------------------------------------- */
class TextParticles {
  group = new THREE.Group();
  points: THREE.Points;
  plate: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  constructor(public text: string, font: string, color: THREE.Color, N: number, width: number, A: Assets, seed: number) {
    const W = 2048, H = 320;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d')!;
    g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
    let fs = 150;
    while (g.measureText(text).width > W * 0.9 && fs > 40) { fs -= 6; g.font = font.replace('150px', `${fs}px`); }
    g.fillStyle = '#fff';
    g.fillText(text, W / 2, H / 2 + 6);
    const data = g.getImageData(0, 0, W, H).data;
    const R = rng(seed);
    const pos = new Float32Array(N * 3), tgt = new Float32Array(N * 3), sd = new Float32Array(N * 4);
    const h = width * (H / W);
    let n = 0, guard = 0;
    while (n < N && guard < N * 60) {
      guard++;
      const x = Math.floor(R() * W), y = Math.floor(R() * H);
      if (data[(y * W + x) * 4 + 3] < 128) continue;
      tgt.set([(x / W - 0.5) * width, -(y / H - 0.5) * h, 0], n * 3);
      const a = R() * Math.PI * 2, rr = R.range(1.2, 4.5);
      pos.set([Math.cos(a) * rr * 1.4, Math.sin(a) * rr * 0.6 + R.range(-0.5, 1.5), R.range(-3, 1.5)], n * 3);
      sd.set([R(), R(), R(), R()], n * 4);
      n++;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('target', new THREE.BufferAttribute(tgt, 3));
    geo.setAttribute('seed', new THREE.BufferAttribute(sd, 4));
    geo.setDrawRange(0, n);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uForm: { value: 0 }, uOut: { value: 0 }, uTime: { value: 0 }, uPx: { value: 600 }, uCol: { value: color } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `attribute vec3 target; attribute vec4 seed; uniform float uForm, uOut, uTime, uPx; varying float vA;
        void main(){ float k = clamp((uForm - seed.x * 0.45) / 0.55, 0.0, 1.0); k = k*k*(3.0-2.0*k);
          vec3 swirl = vec3(sin(uTime*0.6 + seed.y*20.0), cos(uTime*0.5 + seed.z*20.0), sin(uTime*0.4 + seed.w*9.0)) * 0.08 * (1.0 - k);
          vec3 p = mix(position, target, k) + swirl;
          float o = clamp((uOut - seed.y * 0.5) / 0.5, 0.0, 1.0);
          p += vec3(seed.z - 0.5, seed.w - 0.3, seed.y - 0.5) * o * 1.6 + vec3(0.0, o*o*0.4, 0.0);
          vA = (0.35 + 0.65 * k) * (1.0 - o) * smoothstep(0.0, 0.15, uForm) * (0.7 + 0.3*sin(uTime*6.0 + seed.x*40.0));
          vec4 mv = modelViewMatrix*vec4(p,1.0); gl_PointSize = max(1.0, (0.008 + seed.w*0.012) * uPx / -mv.z); gl_Position = projectionMatrix*mv; }`,
      fragmentShader: `uniform vec3 uCol; varying float vA; void main(){ vec2 d = gl_PointCoord-0.5; float a = 1.0 - smoothstep(0.0, 0.5, length(d)); gl_FragColor = vec4(uCol * a * vA * 0.9, 1.0); }`,
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    // crisp glyph plate (soft glow edge) for perfect legibility
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    this.plate = new THREE.Mesh(new THREE.PlaneGeometry(width, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, color: color.clone().multiplyScalar(0.95), opacity: 0 }));
    this.group.add(this.points, this.plate);
  }
  update(t: number, t0: number, t1: number, at: THREE.Vector3, px: number, cam: THREE.Camera) {
    const vis = t >= t0 && t < t1;
    this.group.visible = vis;
    if (!vis) return;
    this.group.position.copy(at);
    this.group.quaternion.copy(cam.quaternion);
    const form = lin(t, t0, t0 + 2.4);
    const out = lin(t, t1 - 1.6, t1 - 0.1);
    this.mat.uniforms.uForm.value = form;
    this.mat.uniforms.uOut.value = out;
    this.mat.uniforms.uTime.value = t;
    this.mat.uniforms.uPx.value = px;
    (this.plate.material as THREE.MeshBasicMaterial).opacity = sstep(t, t0 + 1.7, t0 + 2.8) * (1 - sstep(t, t1 - 1.7, t1 - 0.9));
  }
}
