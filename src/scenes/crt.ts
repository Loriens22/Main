import * as THREE from 'three';
import { rng, sstep, lin, clamp, T } from '../core/util';

/* ------------------------------------------------------------------------
 * Neural systems L3WR5NCE logo: a brain inside the 3D projection of a
 * rotating 4D hypercube (tesseract), black ink on white, heavy wordmark.
 * --------------------------------------------------------------------- */
const VERTS4: number[][] = [];
for (let i = 0; i < 16; i++) VERTS4.push([(i & 1) ? 1 : -1, (i & 2) ? 1 : -1, (i & 4) ? 1 : -1, (i & 8) ? 1 : -1]);
const EDGES: [number, number][] = [];
for (let i = 0; i < 16; i++) for (let k = 0; k < 4; k++) { const j = i ^ (1 << k); if (i < j) EDGES.push([i, j]); }

function rot4(p: number[], a: number, b: number, c: number) {
  let [x, y, z, w] = p;
  // xw, yw, zw planes -> genuine 4D motion (inner cube turns inside-out)
  let ca = Math.cos(a), sa = Math.sin(a);
  [x, w] = [x * ca - w * sa, x * sa + w * ca];
  ca = Math.cos(b); sa = Math.sin(b);
  [y, w] = [y * ca - w * sa, y * sa + w * ca];
  ca = Math.cos(c); sa = Math.sin(c);
  [z, w] = [z * ca - w * sa, z * sa + w * ca];
  return [x, y, z, w];
}

let brainPaths: { pts: number[][]; w: number }[] | null = null;
/** side-view cerebrum outline (x right = occipital, y down), unit ~1.2 wide */
function brainOutline(u: number) {
  const a = u * Math.PI * 2;
  // base: wider at the back, frontal lobe rounded, temporal lobe dips below
  let rx = 1.18, ry = 0.82;
  const c = Math.cos(a), s = Math.sin(a);
  let r = 1 + 0.07 * Math.cos(2 * a - 0.3) + 0.04 * Math.cos(3 * a + 0.5);
  if (s > 0) { // lower half: flatten under the frontal lobe, temporal bulge, notch before cerebellum
    r *= 0.86 + 0.1 * Math.exp(-((a - 2.25) ** 2) / 0.12) - 0.16 * Math.exp(-((a - 0.95) ** 2) / 0.05);
  }
  return [c * rx * r, s * ry * r];
}
function insideBrain(x: number, y: number) {
  const a = Math.atan2(y / 0.82, x / 1.18);
  const [bx, by] = brainOutline(((a / (Math.PI * 2)) % 1 + 1) % 1);
  return (x * x + y * y) < (bx * bx + by * by) * 0.9;
}
function buildBrain() {
  const R = rng(4242);
  const paths: { pts: number[][]; w: number }[] = [];
  const outline: number[][] = [];
  for (let i = 0; i <= 160; i++) outline.push(brainOutline(i / 160));
  paths.push({ pts: outline, w: 4.2 });
  // gyri: concentric meanders following the cortex at several insets
  for (let ring = 1; ring <= 4; ring++) {
    const inset = 1 - ring * 0.16;
    let seg: number[][] = [];
    const freq = 14 + ring * 5;
    for (let i = 0; i <= 260; i++) {
      const u = i / 260;
      const [bx, by] = brainOutline(u);
      const wob = 0.045 * Math.sin(u * Math.PI * 2 * freq + ring * 1.7) + 0.02 * Math.sin(u * Math.PI * 2 * freq * 2.3);
      const x = bx * (inset + wob), y = by * (inset + wob);
      const gap = Math.sin(u * Math.PI * 2 * (3 + ring) + ring) > 0.72; // broken sulci
      if (gap || !insideBrain(x, y)) { if (seg.length > 6) paths.push({ pts: seg, w: 2.0 }); seg = []; continue; }
      seg.push([x, y]);
    }
    if (seg.length > 6) paths.push({ pts: seg, w: 2.0 });
  }
  // lateral (Sylvian) fissure and central sulcus
  const syl: number[][] = [];
  for (let i = 0; i <= 30; i++) { const t = i / 30; syl.push([-0.62 + t * 1.1, 0.36 - t * 0.3 + Math.sin(t * 8) * 0.025]); }
  paths.push({ pts: syl, w: 3.2 });
  const cen: number[][] = [];
  for (let i = 0; i <= 26; i++) { const t = i / 26; cen.push([0.02 + t * 0.2 + Math.sin(t * 10) * 0.03, -0.78 + t * 0.85]); }
  paths.push({ pts: cen, w: 3.0 });
  void R;
  // cerebellum: small lobe with fine parallel folia
  const cbx = 0.78, cby = 0.62;
  const cb: number[][] = [];
  for (let i = 0; i <= 60; i++) { const a = (i / 60) * Math.PI * 2; cb.push([cbx + Math.cos(a) * 0.36, cby + Math.sin(a) * 0.2]); }
  paths.push({ pts: cb, w: 3.0 });
  for (let k = 1; k <= 5; k++) {
    const f: number[][] = [];
    for (let i = 0; i <= 30; i++) { const a = Math.PI * (0.05 + 0.9 * i / 30); f.push([cbx + Math.cos(a) * 0.34 * (1 - k * 0.15), cby - 0.02 + Math.sin(a) * 0.2 * (1 - k * 0.15) * 0.9]); }
    paths.push({ pts: f, w: 1.4 });
  }
  // brain stem
  paths.push({ pts: [[0.28, 0.58], [0.3, 0.78], [0.36, 1.0]], w: 3.0 });
  paths.push({ pts: [[0.48, 0.64], [0.47, 0.82], [0.5, 1.0]], w: 3.0 });
  return paths;
}

export function drawLogo(g: CanvasRenderingContext2D, W: number, H: number, t: number) {
  if (!brainPaths) brainPaths = buildBrain();
  g.fillStyle = '#fbfaf6';
  g.fillRect(0, 0, W, H);
  const cx = W / 2, cy = H * 0.43, S = H * 0.19;
  // tesseract
  const a = 0.1 + t * 0.09, b = 0.06 + t * 0.05, c = 0.03 + t * 0.03;
  const P = VERTS4.map((v) => {
    const r = rot4(v, a, b, c);
    const k = 1 / (3.2 - r[3]);
    let x = r[0] * k, y = r[1] * k, z = r[2] * k;
    // gentle 3D presentation rotation
    const ry = 0.62 + Math.sin(t * 0.1) * 0.08, rx = -0.42;
    [x, z] = [x * Math.cos(ry) + z * Math.sin(ry), -x * Math.sin(ry) + z * Math.cos(ry)];
    [y, z] = [y * Math.cos(rx) - z * Math.sin(rx), y * Math.sin(rx) + z * Math.cos(rx)];
    const pk = 3.2 / (3.2 - z);
    return [cx + x * S * 2.3 * pk, cy + y * S * 2.3 * pk, z, r[3]];
  });
  g.lineCap = 'round';
  g.strokeStyle = '#0b0b0c';
  const sorted = [...EDGES].sort((e1, e2) => (P[e1[0]][2] + P[e1[1]][2]) - (P[e2[0]][2] + P[e2[1]][2]));
  for (const [i, j] of sorted) {
    const depth = (P[i][2] + P[j][2]) * 0.5;
    const inner = (P[i][3] + P[j][3]) * 0.5;
    g.lineWidth = 2.2 + (depth + 0.6) * 3.2 + (inner > 0 ? 0.8 : 0);
    g.globalAlpha = 0.55 + clamp(depth + 0.5) * 0.45;
    g.beginPath(); g.moveTo(P[i][0], P[i][1]); g.lineTo(P[j][0], P[j][1]); g.stroke();
  }
  g.globalAlpha = 1;
  for (const p of P) { g.beginPath(); g.arc(p[0], p[1], 3.2 + (p[2] + 0.6) * 2, 0, Math.PI * 2); g.fillStyle = '#0b0b0c'; g.fill(); }
  // brain (white body occludes the cube lines behind it slightly)
  const bs = S * 0.78;
  const bx = cx - bs * 0.05, by = cy - bs * 0.02;
  g.save();
  g.translate(bx, by);
  g.beginPath();
  brainPaths[0].pts.forEach((p, i) => (i ? g.lineTo(p[0] * bs, p[1] * bs) : g.moveTo(p[0] * bs, p[1] * bs)));
  g.closePath();
  g.fillStyle = 'rgba(251,250,246,0.92)';
  g.fill();
  g.strokeStyle = '#0b0b0c';
  for (const path of brainPaths) {
    g.lineWidth = path.w * (H / 768);
    g.beginPath();
    path.pts.forEach((p, i) => (i ? g.lineTo(p[0] * bs, p[1] * bs) : g.moveTo(p[0] * bs, p[1] * bs)));
    g.stroke();
  }
  g.restore();
  // wordmark
  const text = 'NEURAL SYSTEMS L3WR5NCE';
  let fs = H * 0.083;
  g.font = `${fs}px "Archivo Black", "Arial Black", Impact, sans-serif`;
  (g as any).letterSpacing = `${fs * 0.06}px`;
  let tw = g.measureText(text).width;
  if (tw > W * 0.86) { fs *= (W * 0.86) / tw; g.font = `${fs}px "Archivo Black", "Arial Black", Impact, sans-serif`; (g as any).letterSpacing = `${fs * 0.06}px`; tw = g.measureText(text).width; }
  g.fillStyle = '#0b0b0c';
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  g.fillText(text, W / 2 + fs * 0.03, H * 0.86);
  g.fillRect(W / 2 - tw / 2, H * 0.885, tw, H * 0.008);
}

export class LogoTexture {
  canvas: HTMLCanvasElement;
  g: CanvasRenderingContext2D;
  tex: THREE.CanvasTexture;
  last = -1;
  constructor(public W = 1024, public H = 768) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = W; this.canvas.height = H;
    this.g = this.canvas.getContext('2d')!;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 8;
    this.update(0);
  }
  update(t: number) {
    const q = Math.round(t * 24) / 24;
    if (q === this.last) return;
    this.last = q;
    drawLogo(this.g, this.W, this.H, q);
    this.tex.needsUpdate = true;
  }
}

/* ------------------------------------------------------------------------
 * CRT phosphor screen shader (power-on, snow, roll, scanlines, curvature)
 * --------------------------------------------------------------------- */
export function crtMaterial(logo: THREE.Texture) {
  return new THREE.ShaderMaterial({
    uniforms: {
      tLogo: { value: logo }, uTime: { value: 0 }, uPower: { value: 0 }, uStatic: { value: 0 }, uLogo: { value: 0 },
      uBright: { value: 1.6 }, uHold: { value: 0 },
    },
    vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv = uv; vec4 wp = modelMatrix*vec4(position,1.0); vN = normalize(mat3(modelMatrix)*normal); vV = normalize(cameraPosition - wp.xyz); gl_Position = projectionMatrix*viewMatrix*wp; }`,
    fragmentShader: `
      uniform sampler2D tLogo; uniform float uTime, uPower, uStatic, uLogo, uBright, uHold;
      varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      float hash(vec2 p){ p = fract(p*vec2(443.897,441.423)); p += dot(p, p.yx+19.19); return fract((p.x+p.y)*p.x); }
      void main(){
        vec2 uvS = vec2(1.0 - vUv.x, vUv.y);   // tube UVs run right-to-left once mounted
        vec2 c = uvS - 0.5;
        // superellipse tube mask
        float tube = pow(abs(c.x)/0.5, 4.5) + pow(abs(c.y)/0.5, 4.5);
        float edge = 1.0 - smoothstep(0.80, 1.0, tube);
        vec2 uv = 0.5 + c * (1.0 + 0.06 * dot(c, c));
        // power-on: horizontal line expanding vertically from the centre
        float hw = smoothstep(0.0, 0.3, uPower), vh = smoothstep(0.22, 1.0, uPower);
        float m = (1.0 - smoothstep(0.5*hw - 0.01, 0.5*hw + 0.002, abs(c.x))) * (1.0 - smoothstep(0.5*max(vh,0.006) - 0.004, 0.5*max(vh,0.006) + 0.004, abs(c.y)));
        // horizontal hold flutter + rolling bar
        float row = floor(uv.y * 260.0);
        float jitter = (hash(vec2(row, floor(uTime * 28.0))) - 0.5) * 0.03 * uStatic + sin(uv.y * 40.0 + uTime * 23.0) * 0.004 * uHold;
        vec2 uvl = vec2(uv.x + jitter, fract(uv.y + uHold * uTime * 0.31));
        vec3 logo;
        logo.r = texture2D(tLogo, uvl + vec2(0.0015, 0.0)).r;
        logo.g = texture2D(tLogo, uvl).g;
        logo.b = texture2D(tLogo, uvl - vec2(0.0015, 0.0)).b;
        float n = hash(floor(uv * vec2(330.0, 250.0)) + floor(uTime * 50.0) * vec2(7.0, 13.0));
        float bar = 0.75 + 0.25 * sin((uv.y + uTime * 0.37) * 6.2831);
        vec3 snow = vec3(n) * bar;
        vec3 col = mix(logo * uLogo, snow, uStatic);
        float sl = sin(uvS.y * 250.0 * 3.14159); col *= 0.8 + 0.2 * sl * sl;
        // phosphor bloom at power-on
        col += vec3(0.8, 0.9, 1.0) * (1.0 - vh) * hw * 2.0 * (1.0 - smoothstep(0.0, 0.02, abs(c.y)));
        col *= m * edge * uBright;
        // dark glass base + reflections of the sunlit windows on the curved tube
        vec3 base = vec3(0.02, 0.024, 0.024) * edge;
        float fres = pow(1.0 - max(dot(vN, vV), 0.0), 3.0);
        vec3 Rf = reflect(-vV, normalize(vN));
        vec3 wdir = normalize(vec3(-0.55, 0.28, -0.79));
        float wl = max(dot(Rf, wdir), 0.0);
        float pane = step(0.08, fract(Rf.y * 9.0)) * step(0.08, fract(Rf.z * 7.0 + Rf.x * 3.0));
        vec3 refl = vec3(1.0, 0.86, 0.66) * pow(wl, 28.0) * (0.25 + 0.75 * pane) * 1.4;
        refl += vec3(0.5, 0.36, 0.24) * fres * 0.25;
        gl_FragColor = vec4(base + col + refl * edge, 1.0);
      }`,
  });
}

/* ------------------------------------------------------------------------
 * Inside the television: the logo on infinite white, scan-lines that grow
 * and break into fine particles, then a white field.
 * --------------------------------------------------------------------- */
export class TvSpace {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.01, 100);
  logoMesh: THREE.Mesh;
  points: THREE.Points;
  mat: THREE.ShaderMaterial;
  constructor(private logo: LogoTexture) {
    this.scene.background = new THREE.Color(0xfbfaf6);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { tLogo: { value: logo.tex }, uDis: { value: 0 }, uTime: { value: 0 } },
      transparent: true,
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
      fragmentShader: `uniform sampler2D tLogo; uniform float uDis, uTime; varying vec2 vUv;
        float hash(vec2 p){ p = fract(p*vec2(443.897,441.423)); p += dot(p, p.yx+19.19); return fract((p.x+p.y)*p.x); }
        float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
        void main(){ vec3 c = texture2D(tLogo, vUv).rgb; float n = vnoise(vUv*vec2(24.0,18.0))*0.6 + vnoise(vUv*80.0)*0.4;
          float k = smoothstep(uDis - 0.08, uDis, n); float sl = sin(vUv.y*260.0*3.14159); float scan = 0.86 + 0.14*sl*sl;
          vec3 col = mix(vec3(0.984,0.98,0.965), c*scan, k); gl_FragColor = vec4(col, 1.0); }`,
    });
    const aspect = 4 / 3;
    this.logoMesh = new THREE.Mesh(new THREE.PlaneGeometry(aspect, 1), this.mat);
    this.scene.add(this.logoMesh);
    // scan-line particles sampled on the logo plane
    const R = rng(77);
    const N = 26000;
    const pos = new Float32Array(N * 3), seed = new Float32Array(N * 4);
    for (let i = 0; i < N; i++) {
      const line = Math.floor(R() * 120);
      const x = (R() - 0.5) * aspect, y = (line / 120 - 0.5);
      pos.set([x, y, 0], i * 3);
      seed.set([R(), R(), R(), R()], i * 4);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('seed', new THREE.BufferAttribute(seed, 4));
    const pm = new THREE.ShaderMaterial({
      uniforms: { uK: { value: 0 }, uTime: { value: 0 }, tLogo: { value: logo.tex } },
      transparent: true, depthWrite: false,
      vertexShader: `attribute vec4 seed; uniform float uK, uTime; varying float vA; varying vec3 vC; uniform sampler2D tLogo;
        void main(){ vec3 p = position; vec2 uv = p.xy/vec2(1.3333,1.0)+0.5; vC = texture2D(tLogo, uv).rgb;
          float k = uK; p.y *= 1.0 + k * 2.6; p.x *= 1.0 + k * 0.6;
          p.z += (seed.x - 0.5) * k * 1.8 + k * k * seed.y * 1.5;
          p.xy += (seed.zw - 0.5) * k * k * 0.9;
          vA = (1.0 - k) * (0.35 + 0.65 * seed.y) * smoothstep(0.0, 0.08, k);
          vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_PointSize = (2.0 + seed.w * 3.0) * (1.0 + k * 2.0) * 200.0 / -mv.z / 100.0 * 4.0; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying float vA; varying vec3 vC; void main(){ vec2 d = gl_PointCoord - 0.5; float a = (1.0 - smoothstep(0.0, 0.5, length(d))); vec3 c = mix(vec3(0.15,0.17,0.2), vec3(0.55,0.75,1.0), step(0.5, vC.r)); gl_FragColor = vec4(c, a * vA); }`,
    });
    this.points = new THREE.Points(g, pm);
    this.points.frustumCulled = false;
    this.scene.add(this.points);
  }
  grade(_t: number) {
    return { exposure: 1.0, gain: [1.22, 1.22, 1.2], sat: 1.0, contrast: 1.0, vignette: 0.12, grain: 0.035, ca: 0.002, bloom: 0.25, bloomThreshold: 0.95 };
  }

  update(t: number) {
    const tc = T.manor.glassCross;
    this.logo.update(t);
    const k = lin(t, tc, tc + 1.2);
    // camera drifts forward through the logo plane
    this.camera.position.set(0, 0, 0.78 - k * 0.55 - lin(t, tc + 1.2, T.interference[1]) * 0.1);
    this.camera.lookAt(0, 0, -1);
    this.camera.fov = 40;
    this.camera.updateProjectionMatrix();
    this.mat.uniforms.uDis.value = sstep(t, tc + 0.35, tc + 1.4) * 1.1;
    (this.points.material as THREE.ShaderMaterial).uniforms.uK.value = sstep(t, tc, tc + 1.5);
  }
}
