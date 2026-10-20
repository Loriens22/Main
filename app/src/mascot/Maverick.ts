import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createFurMaterials, createFurUniforms, makeFurGeometries, type FurUniforms } from './fur';
import { evalActions, makeOffsets, type FrameState } from './frame';
import { approach, clamp, noise1, smoothstep } from './util';

/**
 * MAVERICK — a plush six-pointed star with shell fur, a slouchy knit beret,
 * glossy button eyes and a mouth that only appears when he talks or grins.
 * Rig: root → body → 6 arm bones (one per point) + top bone (carries the beret).
 */

/** Upper two points splay outwards (≈52°/128°) so they peek out from under the beret. */
const WARP = 0.22;
export function warpTheta(theta: number) {
  return theta > 0 && theta < Math.PI ? theta + WARP * Math.sin(2 * theta) : theta;
}
/** Inverse of warpTheta for the peak angles (solved numerically once). */
function unwarp(target: number) {
  let a = target;
  for (let i = 0; i < 30; i++) a -= (warpTheta(a) - target) * 0.8;
  return a;
}
const ARM_ANGLES = [0, 1, 2, 3, 4, 5].map((i) => {
  const a = (i * Math.PI) / 3;
  return i === 1 || i === 2 ? unwarp(a) : a;
});

/** Star outline radius as a function of polar angle (points at 0°, 60°, …). */
export function starRadius(theta: number) {
  const c = 0.5 + 0.5 * Math.cos(6 * warpTheta(theta));
  // The crown between the upper points sits a little lower so the beret nestles in.
  const up = Math.max(0, Math.sin(theta));
  const tuck = 1 - 0.2 * smoothstep(0.62, 1.0, up);
  return (0.66 + 0.34 * Math.pow(c, 1.25)) * tuck;
}

const DEPTH = 0.5;
const Z_EXP = 0.58;

/** Map a unit-sphere direction onto the pillow-star surface. */
function starPoint(x: number, y: number, z: number, out: THREE.Vector3) {
  const rho = Math.min(1, Math.sqrt(x * x + y * y));
  const theta = Math.atan2(y, x);
  const R = starRadius(theta);
  const depth = DEPTH * (1 - 0.2 * rho * rho);
  const zs = Math.sign(z) * Math.pow(Math.abs(z), Z_EXP) * depth;
  return out.set(x * R, y * R, zs);
}

/** Z of the front surface at planar point (px, py). */
export function frontZ(px: number, py: number) {
  const theta = Math.atan2(py, px);
  const R = starRadius(theta);
  const rho = Math.min(0.999, Math.sqrt(px * px + py * py) / R);
  const z = Math.sqrt(1 - rho * rho);
  return Math.pow(z, Z_EXP) * DEPTH * (1 - 0.2 * rho * rho);
}

const EYE_X = 0.25;
const EYE_Y = 0.15;
const MOUTH_Y = -0.05;
const EYE_W = 0.07;
const EYE_H = 0.09;
const EYE_D = 0.05;
/** Beret placement relative to the top bone (which sits at y = 0.56). */
const BERET_POS: [number, number, number] = [0.02, 0.14, 0.1];
const BERET_ROT: [number, number, number] = [0.5, 0.1, -0.21];

function buildBodyGeometry() {
  let g: THREE.BufferGeometry = new THREE.SphereGeometry(1, 96, 72);
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  const pos = g.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    starPoint(pos.getX(i), pos.getY(i), pos.getZ(i), v);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g = mergeVertices(g, 1e-5);
  g.computeVertexNormals();

  const p = g.attributes.position as THREE.BufferAttribute;
  const n = p.count;
  const rest = new Float32Array(n * 3);
  const furLen = new Float32Array(n);
  const ao = new Float32Array(n);
  const skinIndex = new Uint16Array(n * 4);
  const skinWeight = new Float32Array(n * 4);
  const eyeL = new THREE.Vector2(-EYE_X, EYE_Y);
  const eyeR = new THREE.Vector2(EYE_X, EYE_Y);
  const mouth = new THREE.Vector2(0, MOUTH_Y);
  const w = new Float32Array(9);
  const order = [0, 1, 2, 3, 4, 5, 6, 7, 8];
  for (let i = 0; i < n; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    rest[i * 3] = x;
    rest[i * 3 + 1] = y;
    rest[i * 3 + 2] = z;
    const theta = Math.atan2(y, x);
    const R = starRadius(theta);
    const r = Math.sqrt(x * x + y * y);
    const rho = r / R;
    const armness = Math.pow(0.5 + 0.5 * Math.cos(6 * warpTheta(theta)), 1.25);

    // Fur length: shorter around the face so eyes/mouth stay readable, fluffier tips.
    let fl = 1 + 0.18 * armness * smoothstep(0.5, 1, rho);
    if (z > 0) {
      const dl = Math.hypot(x - eyeL.x, y - eyeL.y);
      const dr = Math.hypot(x - eyeR.x, y - eyeR.y);
      const dm = Math.hypot((x - mouth.x) * 0.8, y - mouth.y);
      const front = smoothstep(0.05, 0.3, z);
      fl *= 1 - 0.62 * Math.exp(-(dl * dl) / 0.013) * front;
      fl *= 1 - 0.62 * Math.exp(-(dr * dr) / 0.013) * front;
      fl *= 1 - 0.72 * Math.exp(-(dm * dm) / 0.011) * front;
    }
    furLen[i] = fl;
    ao[i] = 1 - (1 - armness) * 0.22 * smoothstep(0.55, 1, rho) - 0.12 * smoothstep(0.1, -0.35, z);

    // Skin weights: body (1) + arms (2..7) + top/beret (8).
    w.fill(0);
    let sum = 0;
    for (let a = 0; a < 6; a++) {
      let d = Math.abs(theta - ARM_ANGLES[a]);
      if (d > Math.PI) d = Math.PI * 2 - d;
      const wa = Math.exp(-((d / 0.4) ** 2)) * smoothstep(0.3, 0.92, rho);
      w[2 + a] = wa;
      sum += wa;
    }
    {
      let d = Math.abs(theta - Math.PI / 2);
      if (d > Math.PI) d = Math.PI * 2 - d;
      const wt = 0.55 * smoothstep(0.32, 0.72, y) * Math.exp(-((d / 0.6) ** 2));
      w[8] = wt;
      sum += wt;
    }
    if (sum > 1) {
      for (let k = 2; k < 9; k++) w[k] /= sum;
      sum = 1;
    }
    w[1] = 1 - sum;
    order.sort((a, b) => w[b] - w[a]);
    let tot = 0;
    for (let k = 0; k < 4; k++) tot += w[order[k]];
    for (let k = 0; k < 4; k++) {
      skinIndex[i * 4 + k] = order[k];
      skinWeight[i * 4 + k] = w[order[k]] / tot;
    }
  }
  g.setAttribute('restPos', new THREE.BufferAttribute(rest, 3));
  g.setAttribute('furLen', new THREE.BufferAttribute(furLen, 1));
  g.setAttribute('aoAttr', new THREE.BufferAttribute(ao, 1));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeight, 4));
  g.computeBoundingSphere();
  return g;
}

/**
 * Beret profile (r, y, bandWeight, crownWeight): underside → rolled headband → puffy
 * overhanging side → soft domed crown. Revolved into a LatheGeometry.
 */
export const BERET_PROFILE: [number, number, number, number][] = [
  [0.0, -0.035, 0, 0],
  [0.22, -0.04, 0, 0],
  [0.36, -0.055, 0.2, 0],
  [0.405, -0.078, 0.8, 0],
  [0.425, -0.102, 1, 0],
  [0.455, -0.12, 1, 0],
  [0.492, -0.115, 1, 0],
  [0.512, -0.094, 1, 0],
  [0.518, -0.066, 0.55, 0],
  [0.54, -0.03, 0.1, 0],
  [0.568, 0.015, 0, 0],
  [0.585, 0.065, 0, 0],
  [0.58, 0.115, 0, 0.05],
  [0.555, 0.16, 0, 0.3],
  [0.505, 0.205, 0, 0.7],
  [0.425, 0.245, 0, 1],
  [0.33, 0.274, 0, 1],
  [0.22, 0.295, 0, 1],
  [0.11, 0.307, 0, 1],
  [0.0, 0.311, 0, 1],
];
export const BERET_TOP = 0.311;

function buildBeretGeometry() {
  const pts = BERET_PROFILE.map(([r, y]) => new THREE.Vector2(r, y));
  const segments = 72;
  const g: THREE.BufferGeometry = new THREE.LatheGeometry(pts, segments);
  // Ensure normals face outward (LatheGeometry winding depends on profile direction).
  g.computeVertexNormals();
  const pos = g.attributes.position as THREE.BufferAttribute;
  const nor = g.attributes.normal as THREE.BufferAttribute;
  let outward = 0;
  for (let i = 0; i < pos.count; i += 7) {
    outward += pos.getX(i) * nor.getX(i) + (pos.getY(i) - 0.1) * nor.getY(i) + pos.getZ(i) * nor.getZ(i);
  }
  if (outward < 0) {
    const idx = g.index!;
    for (let i = 0; i < idx.count; i += 3) {
      const a = idx.getX(i + 1);
      idx.setX(i + 1, idx.getX(i + 2));
      idx.setX(i + 2, a);
    }
    g.computeVertexNormals();
  }
  // Smooth the lathe seam: average normals of coincident vertices.
  const tmp = g.clone();
  tmp.deleteAttribute('uv');
  tmp.deleteAttribute('normal');
  const merged = mergeVertices(tmp, 1e-5);
  merged.computeVertexNormals();
  const key = (x: number, y: number, z: number) => `${x.toFixed(4)},${y.toFixed(4)},${z.toFixed(4)}`;
  const mp = merged.attributes.position as THREE.BufferAttribute;
  const mn = merged.attributes.normal as THREE.BufferAttribute;
  const map = new Map<string, [number, number, number]>();
  for (let i = 0; i < mp.count; i++) map.set(key(mp.getX(i), mp.getY(i), mp.getZ(i)), [mn.getX(i), mn.getY(i), mn.getZ(i)]);
  const nn = g.attributes.normal as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const m = map.get(key(pos.getX(i), pos.getY(i), pos.getZ(i)));
    if (m) nn.setXYZ(i, m[0], m[1], m[2]);
  }
  merged.dispose();
  tmp.dispose();

  const n = pos.count;
  const np = BERET_PROFILE.length;
  const rest = new Float32Array(n * 3);
  const furLen = new Float32Array(n);
  const ao = new Float32Array(n);
  const zone = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const j = i % np; // LatheGeometry: vertex = segment * points + j
    const [, py, band, crown] = BERET_PROFILE[j];
    rest[i * 3] = pos.getX(i) * 1.7;
    rest[i * 3 + 1] = pos.getY(i) * 1.7;
    rest[i * 3 + 2] = pos.getZ(i) * 1.7;
    // Tighter fuzz on the rolled band, fluffier crown.
    furLen[i] = band > 0.5 ? 0.7 : crown > 0.5 ? 1.1 : 1;
    ao[i] = py < -0.05 && band < 0.5 ? 0.45 : band > 0.5 ? 0.82 : 1;
    zone[i * 2] = band;
    zone[i * 2 + 1] = crown;
  }
  g.setAttribute('restPos', new THREE.BufferAttribute(rest, 3));
  g.setAttribute('furLen', new THREE.BufferAttribute(furLen, 1));
  g.setAttribute('aoAttr', new THREE.BufferAttribute(ao, 1));
  g.setAttribute('knitZone', new THREE.BufferAttribute(zone, 2));
  g.computeBoundingSphere();
  return g;
}

function buildMouthShape() {
  // "D" shaped open mouth: gently curved top lip, round bottom.
  const s = new THREE.Shape();
  s.moveTo(-1, 0.15);
  s.quadraticCurveTo(0, 0.32, 1, 0.15);
  s.bezierCurveTo(1.0, -0.75, 0.55, -1.0, 0, -1.0);
  s.bezierCurveTo(-0.55, -1.0, -1.0, -0.75, -1, 0.15);
  return new THREE.ShapeGeometry(s, 24);
}

export interface MaverickResources {
  strandTex: THREE.Texture;
}

interface Eye {
  group: THREE.Group;
  ball: THREE.Mesh;
  glint: THREE.Mesh;
  glint2: THREE.Mesh;
  arc: THREE.Mesh;
  side: number;
}

export class MaverickRig {
  readonly group = new THREE.Group();
  readonly furU: FurUniforms;
  readonly beretU: FurUniforms;
  private bodyGeo: THREE.BufferGeometry;
  private beretGeo: THREE.BufferGeometry;
  private furGeos: { base: THREE.InstancedBufferGeometry; shells: THREE.InstancedBufferGeometry };
  private beretGeos: { base: THREE.InstancedBufferGeometry; shells: THREE.InstancedBufferGeometry };
  private mats: THREE.Material[] = [];
  private geos: THREE.BufferGeometry[] = [];
  private bones: THREE.Bone[] = [];
  private body: THREE.Bone;
  private arms: THREE.Bone[] = [];
  private top: THREE.Bone;
  private beretHolder!: THREE.Group;
  private eyes: Eye[] = [];
  private mouth: THREE.Group;
  private mouthOpen: THREE.Mesh;
  private mouthTongue: THREE.Mesh;
  private mouthSmile: THREE.Mesh;
  readonly baseMesh: THREE.SkinnedMesh;
  readonly shellMesh: THREE.SkinnedMesh;
  readonly beretBase: THREE.Mesh;
  readonly beretShells: THREE.Mesh;
  private off = makeOffsets();
  private smoothLook = new THREE.Vector2();
  private smoothSpeak = 0;
  /** Lift above the ground in model units (for shadow fading). */
  lift = 0;
  /** Head-top position in model space (for particle emitters). */
  readonly headTop = new THREE.Vector3(0, 1.1, 0);
  maxShells: number;
  maxBeretShells: number;
  /** Half-extent of the idle silhouette (beret + fur included) and its vertical centre, model units. */
  readonly fitHalf = 1.13;
  readonly fitCenterY = 0.057;

  constructor(res: MaverickResources, maxShells = 30, maxBeretShells = 12) {
    this.maxShells = maxShells;
    this.maxBeretShells = maxBeretShells;
    this.bodyGeo = buildBodyGeometry();
    this.beretGeo = buildBeretGeometry();
    this.geos.push(this.bodyGeo, this.beretGeo);

    this.furU = createFurUniforms({
      strandTex: res.strandTex,
      density: 1.1,
      furLength: 0.098,
      root: '#1d64dc',
      base: '#3a96ff',
      tip: '#b8dfff',
      sheen: 0.5,
    });
    this.beretU = createFurUniforms({
      strandTex: res.strandTex,
      density: 1.5,
      furLength: 0.042,
      root: '#101016',
      base: '#32323d',
      tip: '#858599',
      sheen: 0.95,
      knitScale: [60, 16],
    });
    this.beretU.uGravity.value.set(0, -0.15, 0);

    const fur = createFurMaterials(this.furU);
    const beret = createFurMaterials(this.beretU, true);
    this.mats.push(fur.base, fur.shells, beret.base, beret.shells);

    this.furGeos = makeFurGeometries(this.bodyGeo, maxShells);
    this.beretGeos = makeFurGeometries(this.beretGeo, maxBeretShells);
    this.geos.push(this.furGeos.base, this.furGeos.shells, this.beretGeos.base, this.beretGeos.shells);

    // ---- skeleton
    const root = new THREE.Bone();
    root.name = 'root';
    const body = new THREE.Bone();
    body.name = 'body';
    root.add(body);
    this.bones.push(root, body);
    for (let i = 0; i < 6; i++) {
      const b = new THREE.Bone();
      b.name = `arm${i}`;
      const a = ARM_ANGLES[i];
      b.position.set(Math.cos(a) * 0.4, Math.sin(a) * 0.4, 0);
      b.rotation.z = a;
      body.add(b);
      this.arms.push(b);
      this.bones.push(b);
    }
    const top = new THREE.Bone();
    top.name = 'top';
    top.position.set(0, 0.56, 0);
    body.add(top);
    this.bones.push(top);
    this.body = body;
    this.top = top;

    this.baseMesh = new THREE.SkinnedMesh(this.furGeos.base, fur.base);
    this.shellMesh = new THREE.SkinnedMesh(this.furGeos.shells, fur.shells);
    for (const m of [this.baseMesh, this.shellMesh]) {
      m.frustumCulled = false;
    }
    this.baseMesh.add(root);
    root.updateMatrixWorld(true);
    const skeleton = new THREE.Skeleton(this.bones);
    this.baseMesh.bind(skeleton);
    this.shellMesh.bind(skeleton);
    this.shellMesh.renderOrder = 10;
    this.group.add(this.baseMesh, this.shellMesh);

    // ---- beret on the top bone
    const beretHolder = new THREE.Group();
    beretHolder.position.set(BERET_POS[0], BERET_POS[1], BERET_POS[2]);
    beretHolder.rotation.set(BERET_ROT[0], BERET_ROT[1], BERET_ROT[2]);
    beretHolder.scale.set(1.0, 1.0, 0.92);
    this.beretHolder = beretHolder;
    this.beretBase = new THREE.Mesh(this.beretGeos.base, beret.base);
    this.beretShells = new THREE.Mesh(this.beretGeos.shells, beret.shells);
    this.beretBase.frustumCulled = this.beretShells.frustumCulled = false;
    this.beretShells.renderOrder = 12;
    // Tiny knitted nub on the crown.
    const nubMat = new THREE.MeshPhysicalMaterial({
      color: 0x1d1d25,
      roughness: 0.85,
      sheen: 1,
      sheenRoughness: 0.5,
      sheenColor: new THREE.Color('#6a6a7a'),
    });
    const nubGeo = new THREE.CapsuleGeometry(0.03, 0.035, 6, 12);
    this.mats.push(nubMat);
    this.geos.push(nubGeo);
    const nub = new THREE.Mesh(nubGeo, nubMat);
    nub.position.set(0, BERET_TOP + 0.03, 0);
    nub.rotation.z = 0.25;
    beretHolder.add(this.beretBase, this.beretShells, nub);
    top.add(beretHolder);

    // ---- eyes
    const eyeMat = new THREE.MeshPhysicalMaterial({
      color: 0x050508,
      roughness: 0.3,
      metalness: 0,
      clearcoat: 1,
      clearcoatRoughness: 0.12,
      envMapIntensity: 0.55,
    });
    const glintMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    // Closed/happy eye arcs: satin black so they read as ink, not gold reflections.
    const arcMat = new THREE.MeshStandardMaterial({ color: 0x050507, roughness: 0.45, metalness: 0, envMapIntensity: 0.3 });
    this.mats.push(eyeMat, glintMat, arcMat);
    const ballGeo = new THREE.SphereGeometry(1, 32, 24);
    const glintGeo = new THREE.SphereGeometry(1, 12, 8);
    const arcGeo = new THREE.TorusGeometry(0.068, 0.021, 10, 28, Math.PI);
    this.geos.push(ballGeo, glintGeo, arcGeo);
    for (const side of [-1, 1]) {
      const gx = side * EYE_X;
      const gz = frontZ(gx, EYE_Y);
      const group = new THREE.Group();
      group.position.set(gx, EYE_Y, gz + 0.012);
      const ball = new THREE.Mesh(ballGeo, eyeMat);
      ball.scale.set(EYE_W, EYE_H, EYE_D);
      const glint = new THREE.Mesh(glintGeo, glintMat);
      glint.scale.setScalar(0.017);
      glint.position.set(-0.022, 0.036, 0.05);
      const glint2 = new THREE.Mesh(glintGeo, glintMat);
      glint2.scale.setScalar(0.0075);
      glint2.position.set(0.024, -0.03, 0.046);
      const arc = new THREE.Mesh(arcGeo, arcMat);
      arc.position.set(0, -0.02, 0.05);
      arc.visible = false;
      group.add(ball, glint, glint2, arc);
      this.body.add(group);
      this.eyes.push({ group, ball, glint, glint2, arc, side });
    }

    // ---- mouth
    const mouthMat = new THREE.MeshStandardMaterial({ color: 0x2a0610, roughness: 0.55 });
    const tongueMat = new THREE.MeshStandardMaterial({ color: 0xff6f8f, roughness: 0.5 });
    const smileMat = new THREE.MeshStandardMaterial({ color: 0x07070a, roughness: 0.45, envMapIntensity: 0.3 });
    this.mats.push(mouthMat, tongueMat, smileMat);
    const mouthGeo = buildMouthShape();
    const tongueGeo = new THREE.CircleGeometry(1, 24);
    const smileGeo = new THREE.TorusGeometry(0.066, 0.017, 10, 28, Math.PI);
    this.geos.push(mouthGeo, tongueGeo, smileGeo);
    this.mouth = new THREE.Group();
    this.mouth.position.set(0, MOUTH_Y, frontZ(0, MOUTH_Y) + 0.04);
    this.mouthOpen = new THREE.Mesh(mouthGeo, mouthMat);
    this.mouthTongue = new THREE.Mesh(tongueGeo, tongueMat);
    this.mouthTongue.position.set(0, -0.62, 0.002);
    this.mouthTongue.scale.set(0.55, 0.36, 1);
    this.mouthOpen.add(this.mouthTongue);
    this.mouthSmile = new THREE.Mesh(smileGeo, smileMat);
    this.mouthSmile.rotation.z = Math.PI;
    this.mouthSmile.position.y = 0.035;
    this.mouth.add(this.mouthOpen, this.mouthSmile);
    this.body.add(this.mouth);

    this.setShells(maxShells, maxBeretShells);
    // Centre the silhouette so it fits its anchor box.
    this.group.position.y = -this.fitCenterY;
  }

  setShells(n: number, beretN: number) {
    n = clamp(Math.round(n), 4, this.maxShells);
    beretN = clamp(Math.round(beretN), 2, this.maxBeretShells);
    this.furGeos.shells.instanceCount = n;
    this.furU.uShellCount.value = n;
    this.beretGeos.shells.instanceCount = beretN;
    this.beretU.uShellCount.value = beretN;
  }

  setOpacity(o: number) {
    this.furU.uOpacity.value = o;
    this.beretU.uOpacity.value = o;
  }

  update(fs: FrameState) {
    const { t, dt, p } = fs;
    const o = evalActions(fs.actions, this.off);
    const reduced = fs.reduced ? 0.35 : 1;

    // ---- body
    const breath = Math.sin(t * 2.1);
    const bounce =
      p.bounceAmp > 0.001 ? Math.abs(Math.sin(t * Math.PI * p.bounceFreq)) * p.bounceAmp * reduced : 0;
    this.smoothSpeak = approach(this.smoothSpeak, fs.speak, 18, dt);
    const speak = this.smoothSpeak;
    const talkBob = speak * 0.03 * Math.abs(Math.sin(t * 9));
    const lift = bounce + o.lift + talkBob;
    this.lift = lift + fs.travelHop * 0.6;

    let squash = breath * 0.012 + o.squash + speak * 0.03 * Math.sin(t * 13);
    // stretch while travelling up, squash on landing feel
    squash += fs.travelHop * 0.08;
    const sy = 1 + squash;
    const sxz = 1 / Math.sqrt(Math.max(0.5, sy));
    this.body.scale.set(sxz, sy, sxz);
    this.body.position.set(o.offX, lift - (1 - sy) * 0.4, 0);

    this.smoothLook.x = approach(this.smoothLook.x, clamp(fs.lookX + p.lookBiasX, -1.2, 1.2), 6, dt);
    this.smoothLook.y = approach(this.smoothLook.y, clamp(fs.lookY + p.lookBiasY, -1.2, 1.2), 6, dt);
    const lx = this.smoothLook.x;
    const ly = this.smoothLook.y;

    const sway = Math.sin(t * 0.9) * p.sway * reduced + noise1(t * 0.35) * 0.03 * reduced;
    const dragTilt = fs.dragging ? clamp(-fs.velX * 0.08, -0.5, 0.5) : clamp(-fs.velX * 0.03, -0.25, 0.25);
    this.body.rotation.set(
      p.lean + ly * 0.12 + o.rotX + (fs.dragging ? 0.1 : 0),
      lx * 0.28 + o.rotY,
      sway + p.tilt * Math.cos(t * (fs.emotion === 'confused' ? 1.4 : 0.6)) + o.rotZ + dragTilt,
    );

    // ---- arms
    const armRaise = p.armRaise + o.armUp;
    const typing = p.armType;
    for (let i = 0; i < 6; i++) {
      const b = this.arms[i];
      const base = ARM_ANGLES[i];
      const wig = noise1(t * 0.8 + i * 17.3) * 0.06 * (0.4 + p.energy) * reduced;
      let swing = wig;
      let curl = 0;
      let stretch = 1;
      // Raise: side arms lift, lower arms swing outwards, upper arms open.
      const sideSign = Math.cos(base) >= 0 ? 1 : -1;
      if (i === 0) swing += armRaise * 0.5;
      if (i === 3) swing -= armRaise * 0.5;
      // Upper points splay outwards (away from the beret) when raised.
      if (i === 1) swing -= armRaise * 0.15;
      if (i === 2) swing += armRaise * 0.15;
      if (i === 4) swing += -armRaise * 0.1;
      if (i === 5) swing += armRaise * 0.1;
      // Typing: lower arms alternate quickly and curl forward.
      if (i === 4 || i === 5) {
        const ph = i === 4 ? 0 : Math.PI;
        curl += typing * (0.25 + 0.2 * Math.sin(t * 16 + ph)) * reduced;
        swing += typing * 0.08 * Math.sin(t * 16 + ph) * sideSign;
      }
      // Waving: upper-right point swings outwards and curls toward the viewer like a hand.
      const wave = Math.max(p.armWave * 0.6, o.wave);
      if (i === 1 && wave > 0.001) {
        swing -= wave * (0.38 + 0.32 * Math.sin(t * 11)) * reduced;
        curl -= wave * (0.18 + 0.22 * Math.sin(t * 11 + 0.6)) * reduced;
      }
      if (i === 2 && p.armWave > 0.5) {
        swing += (p.armWave - 0.5) * (0.3 + 0.3 * Math.sin(t * 11 + 1.3)) * reduced;
        curl -= (p.armWave - 0.5) * 0.3 * (0.5 + 0.5 * Math.sin(t * 11 + 2)) * reduced;
      }
      // Dangle when dragged.
      if (fs.dragging) {
        swing += Math.sin(t * 7 + i) * 0.12;
        stretch += 0.06;
      }
      if (fs.emotion === 'celebrate' || fs.emotion === 'excited') stretch += 0.04 * Math.sin(t * 10 + i);
      // Never let the upper points swing inwards/up into the beret.
      if (i === 1) {
        swing = Math.min(swing, 0.05);
        stretch = Math.min(stretch, 1.03);
      } else if (i === 2) {
        swing = Math.max(swing, -0.05);
        stretch = Math.min(stretch, 1.03);
      }
      b.rotation.set(0, curl, base + swing);
      b.scale.set(stretch, 1, 1);
    }

    // ---- beret
    // The beret is worn tilted down to the right; it may only lift/straighten from there
    // (never tilt further into the right upper point), so nothing pokes through.
    const beretRoll =
      p.beretTilt + Math.sin(t * 1.3) * 0.025 * p.energy * reduced + Math.abs(o.rotZ) * 0.25 + (fs.dragging ? Math.abs(Math.sin(t * 6)) * 0.06 : 0);
    this.top.rotation.set(0, 0, clamp(beretRoll, -0.03, 0.3));

    // ---- eyes
    const happy = Math.max(p.eyeHappy, o.happy);
    const open = clamp(p.eyeOpen + o.eyeWide, 0.05, 1.6);
    const blink = fs.blink;
    for (const e of this.eyes) {
      const ex = e.side * EYE_X + clamp(lx, -1, 1) * 0.03;
      const ey = EYE_Y - clamp(ly, -1, 1) * 0.026;
      e.group.position.x = ex;
      e.group.position.y = ey;
      e.group.position.z = frontZ(ex, ey) + 0.012;
      e.group.rotation.z = -e.side * p.eyeTilt * 0.5;
      const ballY = clamp(open * (1 - blink) * (1 - happy), 0.04, 1.6);
      e.ball.visible = ballY > 0.06;
      e.ball.scale.set(EYE_W * (0.92 + 0.08 * open), EYE_H * ballY, EYE_D);
      e.ball.position.y = (1 - ballY) * -0.01;
      const showGlint = ballY > 0.45;
      e.glint.visible = e.glint2.visible = showGlint;
      e.glint.position.set(-0.022, 0.036 * ballY, 0.05);
      e.glint2.position.set(0.024, -0.03 * ballY, 0.046);
      e.arc.visible = happy > 0.35;
      const as = smoothstep(0.35, 1, happy);
      e.arc.scale.set(1, 0.85 + 0.15 * as, 1);
      e.arc.scale.multiplyScalar(as);
    }

    // ---- mouth
    const openAmt = clamp(p.mouthOpen + speak * 1.1, 0, 1.2);
    const smile = p.smile;
    if (openAmt > 0.06) {
      this.mouthOpen.visible = true;
      this.mouthSmile.visible = false;
      const round = fs.emotion === 'surprised' ? 1 : 0;
      const wx = 0.075 * (1 - round * 0.35) + Math.max(0, smile) * 0.014;
      const wy = 0.02 + openAmt * 0.075;
      this.mouthOpen.scale.set(wx, wy, 1);
      this.mouthTongue.visible = openAmt > 0.25;
    } else if (Math.abs(smile) > 0.3 || happy > 0.4) {
      this.mouthOpen.visible = false;
      this.mouthSmile.visible = true;
      const s = Math.max(Math.abs(smile), happy);
      this.mouthSmile.rotation.z = smile >= 0 ? Math.PI : 0;
      this.mouthSmile.position.y = smile >= 0 ? 0.035 : -0.045;
      this.mouthSmile.scale.set(0.75 + 0.35 * s, 0.6 + 0.4 * s, 1);
    } else {
      this.mouthOpen.visible = false;
      this.mouthSmile.visible = false;
    }

    // ---- fur grading
    const u = this.furU;
    u.uTime.value = t;
    u.uTint.value.setRGB(p.tintR, p.tintG, p.tintB);
    u.uSaturation.value = p.saturation;
    u.uBrightness.value = p.brightness;
    const b = this.beretU;
    b.uTime.value = t;
    b.uBrightness.value = 0.85 + 0.15 * p.brightness;
  }

  /** Model-space anchor for particle emitters. */
  getHeadTop(out: THREE.Vector3) {
    return out.set(-0.05, 1.12 + this.lift - this.fitCenterY, 0.1);
  }

  dispose() {
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
    this.baseMesh.skeleton.dispose();
  }
}
