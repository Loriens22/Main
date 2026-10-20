import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { evalActions, makeOffsets, type FrameState } from './frame';
import { approach, clamp, noise1 } from './util';

/**
 * SPARKY — a tiny bean-cube buddy with a living flame for hair.
 * Body is soft clearcoat PBR, the face is a canvas decal redrawn only when the
 * expression changes, and the flame is a layered noise shader with additive blending.
 */

const FLAME_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FLAME_FRAG = /* glsl */ `
uniform float uTime;
uniform float uGold;
uniform float uBlue;
uniform float uFlicker;
uniform float uIntensity;
uniform float uOpacity;
varying vec2 vUv;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * vnoise(p);
    p = p * 2.03 + vec2(1.7, 9.2);
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = vUv;
  float t = uTime * (0.9 + 0.6 * uFlicker);
  // Curl the flame sideways more towards the tip.
  float n1 = fbm(vec2(uv.x * 3.2, uv.y * 2.6 - t * 2.4));
  float n2 = fbm(vec2(uv.x * 6.0 + 3.1, uv.y * 4.0 - t * 3.6));
  float x = uv.x - 0.5 + (n1 - 0.5) * 0.42 * uv.y + sin(uv.y * 5.0 - t * 2.0) * 0.04 * uv.y;
  float y = uv.y;
  // Tear-drop body: wide round base, tapering tongue towards the top.
  // Several tongues of different heights, like a tuft of flame hair.
  float tongues = 0.55 + 0.45 * sin(x * 17.0 + n1 * 3.0 + t * 0.8);
  float yy = y / mix(0.62, 1.0, tongues * (1.0 - abs(x) * 1.2) + abs(x) * 0.2);
  float width = mix(0.49, 0.05, pow(clamp(yy, 0.0, 1.0), 0.9));
  float shape = 1.0 - abs(x) / max(width, 1e-3);
  shape = shape * smoothstep(0.0, 0.08, y) - yy * 0.28;
  shape += (n2 - 0.5) * 0.5 * y;
  // Breakaway licks near the top.
  float licks = smoothstep(0.6, 0.92, n2) * smoothstep(0.4, 0.8, y) * 0.35;
  float f = clamp(shape + licks * (1.0 - abs(x) * 3.0), 0.0, 1.0);
  float core = clamp((shape - 0.35) * 2.2, 0.0, 1.0) * (1.0 - y * 0.6);

  vec3 red = vec3(0.95, 0.16, 0.03);
  vec3 orange = vec3(1.0, 0.48, 0.06);
  vec3 yellow = vec3(1.0, 0.82, 0.25);
  vec3 white = vec3(1.0, 0.98, 0.86);
  // Golden boost and cold (error) palettes.
  red = mix(red, vec3(1.0, 0.45, 0.05), uGold * 0.6);
  orange = mix(orange, vec3(1.0, 0.72, 0.1), uGold * 0.6);
  red = mix(red, vec3(0.25, 0.2, 0.95), uBlue);
  orange = mix(orange, vec3(0.35, 0.55, 1.0), uBlue);
  yellow = mix(yellow, vec3(0.7, 0.85, 1.0), uBlue);

  vec3 col = mix(red, orange, smoothstep(0.05, 0.35, f));
  col = mix(col, yellow, smoothstep(0.35, 0.7, f));
  col = mix(col, white, core);
  float a = smoothstep(0.02, 0.22, f) * uOpacity;
  // Additive: premultiply and boost.
  gl_FragColor = vec4(col * a * uIntensity, a);
}
`;

const FACE_W = 256;
const FACE_H = 208;

export interface SparkyFace {
  emotion: string;
  blink: number;
  mouth: number; // 0..1 openness
  lookX: number;
  lookY: number;
  happy: number;
}

export class SparkyRig {
  readonly group = new THREE.Group();
  private bodyPivot = new THREE.Group();
  private body: THREE.Mesh;
  private face: THREE.Mesh;
  private faceCanvas: HTMLCanvasElement;
  private faceCtx: CanvasRenderingContext2D;
  private faceTex: THREE.CanvasTexture;
  private faceKey = '';
  private armL: THREE.Mesh;
  private armR: THREE.Mesh;
  private footL: THREE.Mesh;
  private footR: THREE.Mesh;
  private flame: THREE.Mesh;
  private flameInner: THREE.Mesh;
  readonly flameU: Record<string, THREE.IUniform>;
  private flameInnerU: Record<string, THREE.IUniform>;
  readonly light: THREE.PointLight;
  private mats: THREE.Material[] = [];
  private geos: THREE.BufferGeometry[] = [];
  private off = makeOffsets();
  private smoothSpeak = 0;
  private flameH = 1;
  lift = 0;
  /** Half-extent of the idle silhouette (flame included) and its vertical centre, model units. */
  readonly fitHalf = 0.84;
  readonly fitCenterY = 0.22;
  /** 0..1 current flame strength for emitters/lighting. */
  flamePower = 1;

  constructor() {
    const bodyGeo = new RoundedBoxGeometry(1, 0.9, 0.82, 6, 0.32);
    // Vertical warm gradient through vertex colours.
    const pos = bodyGeo.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const top = new THREE.Color('#ffc287');
    const bottom = new THREE.Color('#ff7a30');
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      c.copy(bottom).lerp(top, clamp((y + 0.45) / 0.9, 0, 1) ** 0.8);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    bodyGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const bodyMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      vertexColors: true,
      roughness: 0.48,
      clearcoat: 0.55,
      clearcoatRoughness: 0.28,
      sheen: 0.6,
      sheenRoughness: 0.6,
      sheenColor: new THREE.Color('#ffd7b0'),
      envMapIntensity: 0.9,
    });
    this.body = new THREE.Mesh(bodyGeo, bodyMat);
    this.geos.push(bodyGeo);
    this.mats.push(bodyMat);

    // Face decal.
    this.faceCanvas = document.createElement('canvas');
    this.faceCanvas.width = FACE_W;
    this.faceCanvas.height = FACE_H;
    this.faceCtx = this.faceCanvas.getContext('2d')!;
    this.faceTex = new THREE.CanvasTexture(this.faceCanvas);
    this.faceTex.colorSpace = THREE.SRGBColorSpace;
    this.faceTex.anisotropy = 4;
    const faceMat = new THREE.MeshBasicMaterial({
      map: this.faceTex,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    const faceGeo = new THREE.PlaneGeometry(0.84, 0.84 * (FACE_H / FACE_W));
    this.face = new THREE.Mesh(faceGeo, faceMat);
    this.face.position.set(0, -0.02, 0.412);
    this.face.renderOrder = 11;
    this.geos.push(faceGeo);
    this.mats.push(faceMat);

    // Limbs.
    const limbMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#ffae6e'),
      roughness: 0.5,
      clearcoat: 0.4,
      clearcoatRoughness: 0.35,
    });
    const armGeo = new THREE.CapsuleGeometry(0.075, 0.15, 6, 12);
    const footGeo = new THREE.CapsuleGeometry(0.08, 0.06, 6, 12);
    this.geos.push(armGeo, footGeo);
    this.mats.push(limbMat);
    this.armL = new THREE.Mesh(armGeo, limbMat);
    this.armR = new THREE.Mesh(armGeo, limbMat);
    this.armL.geometry.translate(0, -0.1, 0);
    this.armL.position.set(-0.5, -0.02, 0.05);
    this.armR.position.set(0.5, -0.02, 0.05);
    this.footL = new THREE.Mesh(footGeo, limbMat);
    this.footR = new THREE.Mesh(footGeo, limbMat);
    this.footL.rotation.z = Math.PI / 2;
    this.footR.rotation.z = Math.PI / 2;
    this.footL.position.set(-0.2, -0.5, 0.08);
    this.footR.position.set(0.2, -0.5, 0.08);

    // Flame (outer + inner core layer).
    const flameGeo = new THREE.PlaneGeometry(1.1, 1.0, 1, 1);
    flameGeo.translate(0, 0.5, 0);
    this.geos.push(flameGeo);
    const mkFlame = (gold: number) => {
      const u: Record<string, THREE.IUniform> = {
        uTime: { value: 0 },
        uGold: { value: gold },
        uBlue: { value: 0 },
        uFlicker: { value: 1 },
        uIntensity: { value: 1.25 },
        uOpacity: { value: 1 },
      };
      const m = new THREE.ShaderMaterial({
        uniforms: u,
        vertexShader: FLAME_VERT,
        fragmentShader: FLAME_FRAG,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        premultipliedAlpha: true,
        side: THREE.DoubleSide,
      });
      this.mats.push(m);
      return { u, m };
    };
    const outer = mkFlame(0);
    const inner = mkFlame(0.8);
    this.flameU = outer.u;
    this.flameInnerU = inner.u;
    this.flame = new THREE.Mesh(flameGeo, outer.m);
    this.flame.position.set(0, 0.33, -0.06);
    this.flame.renderOrder = 20;
    this.flameInner = new THREE.Mesh(flameGeo, inner.m);
    this.flameInner.position.set(0, 0.35, 0.02);
    this.flameInner.scale.set(0.62, 0.62, 1);
    this.flameInner.renderOrder = 21;

    this.light = new THREE.PointLight(0xff8a3d, 2.2, 0, 0);

    this.bodyPivot.add(this.body, this.face, this.armL, this.armR, this.flame, this.flameInner);
    this.group.add(this.bodyPivot, this.footL, this.footR);
    this.group.position.y = -this.fitCenterY;
    this.drawFace({ emotion: 'idle', blink: 0, mouth: 0, lookX: 0, lookY: 0, happy: 0 });
  }

  setOpacity(o: number) {
    this.flameU.uOpacity.value = o;
    this.flameInnerU.uOpacity.value = o;
  }

  update(fs: FrameState) {
    const { t, dt, p } = fs;
    const o = evalActions(fs.actions, this.off);
    const reduced = fs.reduced ? 0.35 : 1;
    this.smoothSpeak = approach(this.smoothSpeak, fs.speak, 18, dt);

    // Hover bob — Sparky floats rather than hops.
    const hover = Math.sin(t * 2.4) * 0.06 * reduced + (fs.dragging ? Math.sin(t * 9) * 0.03 : 0);
    const bounce = p.bounceAmp > 0.001 ? Math.abs(Math.sin(t * Math.PI * p.bounceFreq)) * p.bounceAmp * 1.2 * reduced : 0;
    this.lift = Math.max(0, hover + bounce + o.lift) + 0.25 + fs.travelHop * 0.4;
    const sy = 1 + o.squash + Math.sin(t * 2.4 + 1) * 0.02 + this.smoothSpeak * 0.05 * Math.sin(t * 14);
    const sxz = 1 / Math.sqrt(Math.max(0.5, sy));
    this.bodyPivot.position.set(o.offX, hover + bounce + o.lift, 0);
    this.bodyPivot.scale.set(sxz, sy, sxz);
    const lx = clamp(fs.lookX + p.lookBiasX, -1.2, 1.2);
    const ly = clamp(fs.lookY + p.lookBiasY, -1.2, 1.2);
    this.bodyPivot.rotation.set(
      p.lean + ly * 0.15 + o.rotX,
      lx * 0.35 + o.rotY,
      Math.sin(t * 1.1) * p.sway * 1.4 * reduced + p.tilt * 0.8 + o.rotZ + clamp(-fs.velX * 0.12, -0.6, 0.6),
    );
    // Feet dangle slightly while floating.
    const kick = Math.sin(t * 5) * 0.12 * (0.3 + p.energy);
    this.footL.position.y = -0.5 + hover * 0.6 + bounce * 0.5 + o.lift;
    this.footR.position.y = -0.5 + hover * 0.6 + bounce * 0.5 + o.lift;
    this.footL.rotation.x = kick;
    this.footR.rotation.x = -kick;

    // Arms.
    const raise = p.armRaise + o.armUp;
    const wave = Math.max(p.armWave, o.wave);
    const typing = p.armType;
    this.armL.rotation.z = -0.35 - raise * 1.1 + Math.sin(t * 2.4) * 0.08 * reduced + typing * 0.25 * Math.sin(t * 15);
    this.armR.rotation.z = 0.35 + raise * 1.1 + wave * (0.7 + 0.5 * Math.sin(t * 12)) * reduced - typing * 0.25 * Math.sin(t * 15 + 2);
    this.armL.rotation.x = typing * 0.6;
    this.armR.rotation.x = typing * 0.6;

    // Flame.
    const burst = o.burst;
    const flick = noise1(t * 6 * p.flameFlicker) * 0.12 + noise1(t * 13.7) * 0.05;
    const targetH = Math.min(1.75, p.flameHeight + burst * 0.5 + this.smoothSpeak * 0.25) * (1 + flick);
    this.flameH = approach(this.flameH, targetH, 8, dt);
    const fh = this.flameH;
    this.flame.scale.set(0.85 + 0.25 * fh, 0.78 * fh, 1);
    this.flameInner.scale.set(0.55 + 0.12 * fh, 0.5 * fh, 1);
    this.flame.rotation.z = (noise1(t * 1.7) * 0.12 - clamp(fs.velX * 0.06, -0.5, 0.5)) * reduced;
    this.flameInner.rotation.z = this.flame.rotation.z * 0.8;
    // Billboard-ish: counter the body yaw so the flame plane keeps facing the camera.
    this.flame.rotation.y = -this.bodyPivot.rotation.y;
    this.flameInner.rotation.y = -this.bodyPivot.rotation.y;
    for (const u of [this.flameU, this.flameInnerU]) {
      u.uTime.value = t + (u === this.flameInnerU ? 7.3 : 0);
      u.uBlue.value = p.flameBlue;
      u.uFlicker.value = p.flameFlicker;
    }
    this.flameU.uGold.value = p.flameGold;
    this.flameInnerU.uGold.value = 0.6 + p.flameGold * 0.4;
    this.flamePower = clamp(fh, 0, 2);
    this.light.intensity = (1.4 + fh * 1.2) * (1 - p.flameBlue * 0.5);
    this.light.color.setRGB(1, 0.55 - p.flameBlue * 0.2 + p.flameGold * 0.15, 0.24 + p.flameBlue * 0.7);

    // Face.
    const happy = Math.max(p.eyeHappy, o.happy);
    const mouth = clamp(p.mouthOpen + this.smoothSpeak * 1.2, 0, 1);
    this.drawFace({ emotion: fs.emotion, blink: fs.blink, mouth, lookX: lx, lookY: ly, happy });
  }

  /** Redraw the face decal only when the quantised expression key changes. */
  drawFace(f: SparkyFace) {
    const mq = Math.round(f.mouth * 5);
    const bq = f.blink > 0.5 ? 1 : 0;
    const lxq = Math.round(clamp(f.lookX, -1, 1) * 4);
    const lyq = Math.round(clamp(f.lookY, -1, 1) * 3);
    const hq = f.happy > 0.45 ? 1 : 0;
    const key = `${f.emotion}|${bq}|${mq}|${lxq}|${lyq}|${hq}`;
    if (key === this.faceKey) return;
    this.faceKey = key;
    const g = this.faceCtx;
    g.clearRect(0, 0, FACE_W, FACE_H);
    const cx = FACE_W / 2;
    const eyeY = 86 + lyq * 3;
    const ex = 46;
    const dx = lxq * 3;
    const ink = '#1b0f12';
    g.lineCap = 'round';
    g.lineJoin = 'round';

    // Blush.
    for (const s of [-1, 1]) {
      const bx = cx + s * 78;
      const grd = g.createRadialGradient(bx, 128, 0, bx, 128, 26);
      const strong = f.emotion === 'love' || f.emotion === 'happy' || f.emotion === 'celebrate';
      grd.addColorStop(0, strong ? 'rgba(255,90,120,0.75)' : 'rgba(255,110,120,0.45)');
      grd.addColorStop(1, 'rgba(255,110,120,0)');
      g.fillStyle = grd;
      g.fillRect(bx - 30, 98, 60, 60);
    }

    // Eyes.
    const e = f.emotion;
    for (const s of [-1, 1]) {
      const x = cx + s * ex + dx;
      g.fillStyle = ink;
      g.strokeStyle = ink;
      if (bq || e === 'sleepy') {
        g.lineWidth = 9;
        g.beginPath();
        if (e === 'sleepy') {
          g.moveTo(x - 16, eyeY + 4);
          g.quadraticCurveTo(x, eyeY + 12, x + 16, eyeY + 4);
        } else {
          g.moveTo(x - 16, eyeY);
          g.lineTo(x + 16, eyeY);
        }
        g.stroke();
      } else if (hq || e === 'celebrate') {
        g.lineWidth = 10;
        g.beginPath();
        g.arc(x, eyeY + 8, 16, Math.PI * 1.1, Math.PI * 1.9);
        g.stroke();
      } else if (e === 'love') {
        g.fillStyle = '#ff2d55';
        g.save();
        g.translate(x, eyeY);
        g.beginPath();
        g.moveTo(0, 16);
        g.bezierCurveTo(-26, 0, -16, -22, 0, -9);
        g.bezierCurveTo(16, -22, 26, 0, 0, 16);
        g.fill();
        g.restore();
      } else if (e === 'error') {
        g.lineWidth = 9;
        g.beginPath();
        g.moveTo(x - 13 * s, eyeY - 12);
        g.lineTo(x + 11 * s, eyeY);
        g.lineTo(x - 13 * s, eyeY + 12);
        g.stroke();
      } else {
        const wide = e === 'surprised' ? 1.3 : e === 'listening' ? 1.12 : 1;
        const rx = 14 * wide;
        const ry = (e === 'working' ? 15 : 20) * wide;
        g.beginPath();
        g.ellipse(x, eyeY, rx, ry, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#ffffff';
        g.beginPath();
        g.ellipse(x - rx * 0.32, eyeY - ry * 0.38, rx * 0.36, ry * 0.3, 0, 0, Math.PI * 2);
        g.fill();
        g.beginPath();
        g.arc(x + rx * 0.35, eyeY + ry * 0.35, rx * 0.16, 0, Math.PI * 2);
        g.fill();
        if (e === 'thinking' || e === 'confused') {
          // Brow.
          g.strokeStyle = ink;
          g.lineWidth = 6;
          g.beginPath();
          const lift = e === 'confused' && s > 0 ? -8 : 0;
          g.moveTo(x - 14, eyeY - ry - 10 + lift);
          g.lineTo(x + 14, eyeY - ry - 14 + lift - s * 3);
          g.stroke();
        }
      }
    }
    if (e === 'sad') {
      g.strokeStyle = ink;
      g.lineWidth = 6;
      for (const s of [-1, 1]) {
        const x = cx + s * ex + dx;
        g.beginPath();
        g.moveTo(x - 14 * s, eyeY - 26);
        g.lineTo(x + 12 * s, eyeY - 32);
        g.stroke();
      }
    }

    // Mouth.
    const my = 140;
    g.strokeStyle = ink;
    g.fillStyle = '#5a1020';
    g.lineWidth = 7;
    if (mq > 0) {
      const open = mq / 5;
      const w = e === 'surprised' ? 16 : 26;
      const h = 6 + open * 26;
      g.beginPath();
      g.moveTo(cx - w, my - 4);
      g.quadraticCurveTo(cx, my + 2, cx + w, my - 4);
      g.bezierCurveTo(cx + w, my + h, cx - w, my + h, cx - w, my - 4);
      g.fill();
      g.stroke();
      if (open > 0.4) {
        g.fillStyle = '#ff6f8f';
        g.beginPath();
        g.ellipse(cx, my + h * 0.62, w * 0.55, h * 0.25, 0, 0, Math.PI * 2);
        g.fill();
      }
    } else if (e === 'sad' || e === 'error') {
      g.beginPath();
      g.arc(cx, my + 16, 16, Math.PI * 1.15, Math.PI * 1.85);
      g.stroke();
    } else if (e === 'thinking' || e === 'confused') {
      g.beginPath();
      g.moveTo(cx - 10, my + 2);
      g.quadraticCurveTo(cx + 4, my - 4, cx + 16, my + 4);
      g.stroke();
    } else if (e === 'sleepy') {
      g.beginPath();
      g.ellipse(cx, my + 2, 7, 9, 0, 0, Math.PI * 2);
      g.fill();
    } else {
      const big = hq || e === 'happy' || e === 'love' || e === 'excited';
      g.beginPath();
      g.arc(cx, my - (big ? 8 : 4), big ? 20 : 13, Math.PI * 0.18, Math.PI * 0.82);
      g.stroke();
    }
    this.faceTex.needsUpdate = true;
  }

  getHeadTop(out: THREE.Vector3) {
    return out.set(0, 0.35 + 0.95 * this.flameH + this.lift - this.fitCenterY, 0);
  }

  dispose() {
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
    this.faceTex.dispose();
    this.light.dispose();
  }
}
