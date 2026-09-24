// ---------------------------------------------------------------------------
// Portals. "a portal to an underwater city" builds (time-sliced, inside the
// generation job) a complete destination dimension, then opens a ring in
// the current world whose surface shows a *live* view into that dimension:
// every frame the destination scene is rendered from a virtual camera that
// mirrors the player's camera through the portal pair, with a clip plane at
// the exit so nothing behind it leaks in. Walking through the ring swaps
// worlds instantly (same frame), preserving your relative position and
// heading. A return portal waits at the arrival point.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { G } from '../../core/context.js';
import { Job } from '../../core/jobs.js';
import { markNoAO } from '../../render/renderer.js';
import { buildDimension, classifyDestination, DIMENSIONS } from '../../world/dimensions.js';
import { registerWorld, switchWorld } from '../../game/worlds.js';
import { glowSprite, glowTexture } from './common.js';

const TAU = Math.PI * 2;
const FLIP = new THREE.Matrix4().makeRotationY(Math.PI);

const THEMES = {
  crystal: { ring: 'crystal', glow: '#c080ff' }, underwater: { ring: 'copper', glow: '#40d0ff' }, library: { ring: 'darkWood', glow: '#ffc060' },
  nightmare: { ring: 'blackMarble', glow: '#ff2020' }, sky: { ring: 'marble', glow: '#ffffff' }, desert: { ring: 'sand', glow: '#ffd080' },
  frozen: { ring: 'ice', glow: '#80d0ff' }, space: { ring: 'steel', glow: '#6090ff' }, lava: { ring: 'blackMarble', glow: '#ff6010' },
  neon: { ring: 'darkPanels', glow: '#ff30c0' }, candy: { ring: 'stripes', glow: '#ff80c0' }, alien: { ring: 'scales', glow: '#40ffc0' },
};

const SURFACE_VS = /* glsl */`
varying vec2 vUv; varying vec3 vW;
void main() { vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const SURFACE_FS = /* glsl */`
uniform sampler2D uView; uniform vec2 uRes; uniform float uTime; uniform vec3 uGlow; uniform float uReady; uniform float uOpen;
varying vec2 vUv;
float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
void main() {
  vec2 c = vUv - 0.5; float r = length(c) * 2.0;
  if (r > 1.0) discard;
  float a = atan(c.y, c.x);
  float swirl = n(vec2(a * 3.0 + uTime * 0.8 - r * 6.0, r * 4.0 - uTime)) * 0.6 + n(vec2(a * 7.0 - uTime * 1.3, r * 9.0)) * 0.4;
  vec2 suv = gl_FragCoord.xy / uRes;
  float edge = smoothstep(0.62, 1.0, r);
  suv += vec2(cos(a), sin(a)) * edge * edge * 0.04 * (swirl - 0.5);
  vec3 view = texture2D(uView, suv).rgb;
  vec3 energy = uGlow * (0.6 + swirl * 1.4);
  float showView = uReady * smoothstep(1.0, 0.55, r) * uOpen;
  vec3 col = mix(energy * 0.8, view, showView);
  col += uGlow * edge * edge * (1.2 + swirl) * 1.5;
  gl_FragColor = vec4(col, 1.0);
}`;

// One side of a portal pair (lives in `world`, leads to `target`).
class PortalGate {
  constructor(world, group, radius, glow) {
    this.world = world;
    this.group = group;          // Object3D positioned at the gate (front = +Z local)
    this.radius = radius;
    this.target = null;          // PortalGate on the other side
    this.prevZ = null;
    this.rt = null;
    this.cam = new THREE.PerspectiveCamera();
    this.cam.layers.enable(1);   // show the player's head through portals
    this.ready = false;
    this.cooldown = 0;
    const uniforms = { uView: { value: null }, uRes: { value: new THREE.Vector2(1, 1) }, uTime: { value: 0 }, uGlow: { value: new THREE.Color(glow) }, uReady: { value: 0 }, uOpen: { value: 0 } };
    this.uniforms = uniforms;
    this.surface = new THREE.Mesh(new THREE.CircleGeometry(radius, 64), new THREE.ShaderMaterial({ uniforms, vertexShader: SURFACE_VS, fragmentShader: SURFACE_FS, side: THREE.DoubleSide }));
    this.surface.position.y = radius + 0.15;
    this.surface.userData.noRaycast = true;
    markNoAO(this.surface);
    group.add(this.surface);
    this.clip = new THREE.Plane();
  }

  ensureRT() {
    const r = G.renderer.renderer;
    const size = r.getDrawingBufferSize(new THREE.Vector2());
    const s = G.quality.portalScale || 0.5;
    const w = Math.max(64, Math.round(size.x * s)), h = Math.max(64, Math.round(size.y * s));
    if (!this.rt || this.rt.width !== w || this.rt.height !== h) {
      if (this.rt) this.rt.dispose();
      this.rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 0 });
      this.uniforms.uView.value = this.rt.texture;
    }
    this.uniforms.uRes.value.copy(size);
  }

  // Render the view through this gate into its render target.
  render(dt) {
    const T = this.target;
    if (!T || !this.ready) return;
    const cam = G.camera;
    const gw = this.surface.getWorldPosition(new THREE.Vector3());
    const dist = gw.distanceTo(cam.position);
    this.uniforms.uOpen.value = THREE.MathUtils.clamp((90 - dist) / 20, 0, 1);
    if (dist > 90) return;
    // Frustum test.
    const fr = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    if (!fr.intersectsSphere(new THREE.Sphere(gw, this.radius * 1.2))) return;
    // Throttle to every other frame at a distance.
    this._skip = (this._skip || 0) + 1;
    if (dist > 25 && (this._skip & 1)) return;
    this.ensureRT();
    this.group.updateMatrixWorld(); T.group.updateMatrixWorld();
    const M = new THREE.Matrix4().multiplyMatrices(T.group.matrixWorld, FLIP).multiply(new THREE.Matrix4().copy(this.group.matrixWorld).invert());
    const m = new THREE.Matrix4().multiplyMatrices(M, cam.matrixWorld);
    m.decompose(this.cam.position, this.cam.quaternion, this.cam.scale);
    this.cam.scale.set(1, 1, 1);
    this.cam.projectionMatrix.copy(cam.projectionMatrix);
    this.cam.projectionMatrixInverse.copy(cam.projectionMatrixInverse);
    this.cam.updateMatrixWorld(true);
    // Clip everything behind the exit gate.
    const n = new THREE.Vector3(0, 0, 1).applyQuaternion(T.group.getWorldQuaternion(new THREE.Quaternion()));
    this.clip.setFromNormalAndCoplanarPoint(n, T.group.getWorldPosition(new THREE.Vector3()).addScaledVector(n, -0.05));
    const dw = T.world;
    const r = G.renderer.renderer;
    if (dw.atmosphere) { dw.atmosphere.update(0, this.cam); dw.atmosphere.applyGlobals(); }
    if (dw.lightPool) dw.lightPool.update(dt, this.cam.position, dw.atmosphere ? dw.atmosphere.night : 1, G.time);
    if (dw.terrain) dw.terrain.update(this.cam.position);
    const prevTarget = r.getRenderTarget();
    const prevClip = r.clippingPlanes;
    const prevAuto = r.shadowMap.autoUpdate;
    r.clippingPlanes = [this.clip];
    r.shadowMap.autoUpdate = (this._skip & 3) === 0;
    // Hide the exit gate's own surface to avoid recursion artefacts.
    const hid = T.surface.visible; T.surface.visible = false;
    r.setRenderTarget(this.rt);
    r.clear();
    r.render(dw.scene, this.cam);
    r.setRenderTarget(prevTarget);
    T.surface.visible = hid;
    r.clippingPlanes = prevClip;
    r.shadowMap.autoUpdate = prevAuto;
  }

  // Detect the player walking through the ring (front -> back).
  checkCross() {
    const T = this.target;
    if (!T || !this.ready || G.world !== this.world || G.player.vehicle) { this.prevZ = null; return false; }
    this.cooldown = Math.max(0, this.cooldown - G.dt);
    const inv = new THREE.Matrix4().copy(this.group.matrixWorld).invert();
    const eye = G.player.position.clone().add(new THREE.Vector3(0, 1.0, 0)).applyMatrix4(inv);
    const inside = Math.hypot(eye.x, eye.y - (this.radius + 0.15)) < this.radius * 0.95;
    const crossed = this.prevZ !== null && this.prevZ > 0 && eye.z <= 0 && inside;
    this.prevZ = inside || Math.abs(eye.z) < 2 ? eye.z : null;
    if (!crossed || this.cooldown > 0) return false;
    this.traverse(G.player.position.clone().applyMatrix4(inv));
    return true;
  }

  // Move the player to the other side. local = player position in this gate's frame.
  traverse(local) {
    const T = this.target;
    if (!T) return;
    const outLocal = new THREE.Vector3(-local.x, Math.max(0, local.y), 1.4);
    T.group.updateMatrixWorld();
    const pos = outLocal.applyMatrix4(T.group.matrixWorld);
    const g = T.world.colliders.groundHeight(pos.x, pos.z, 0.3, pos.y + 2, 4);
    if (Number.isFinite(g) && g > -1e5) pos.y = Math.max(pos.y, g);
    const srcYaw = new THREE.Euler().setFromQuaternion(this.group.getWorldQuaternion(new THREE.Quaternion()), 'YXZ').y;
    const dstYaw = new THREE.Euler().setFromQuaternion(T.group.getWorldQuaternion(new THREE.Quaternion()), 'YXZ').y;
    const yaw = G.player.yaw + (dstYaw - srcYaw) + Math.PI;
    T.cooldown = 1.0;
    T.prevZ = null;
    switchWorld(T.world, pos, yaw);
  }

  dispose() { if (this.rt) this.rt.dispose(); this.surface.geometry.dispose(); this.surface.material.dispose(); }
}

// Decorative frame around a gate.
function buildFrame(group, radius, theme, glow) {
  const M = G.materials;
  const ringMat = theme.ring === 'stripes' ? M.get('stripes', { color: '#ffffff', color2: '#e01a4a', p: [10, 0.5, 0.5] }) : theme.ring === 'crystal' ? new THREE.MeshPhysicalMaterial({ color: glow, emissive: glow, emissiveIntensity: 0.8, roughness: 0.1, transmission: 0.3, flatShading: true }) : M.get(theme.ring, {});
  const cy = radius + 0.15;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(radius + 0.12, 0.2, 16, 72), ringMat);
  ring.position.y = cy; ring.castShadow = true;
  group.add(ring);
  // Runes / studs around the ring.
  const runeMat = M.get('emissive', { color: glow, emissiveIntensity: 3 });
  for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.09, 0), runeMat); s.position.set(Math.cos(a) * (radius + 0.12), cy + Math.sin(a) * (radius + 0.12), 0.2); group.add(s); }
  // Pedestal steps.
  const base = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.9, radius * 1.05, 0.3, 32), M.get(theme.ring === 'crystal' ? 'blackMarble' : theme.ring === 'stripes' ? 'glossyPlastic' : theme.ring, {}));
  base.scale.z = 0.5; base.position.y = 0.15; base.castShadow = true; base.receiveShadow = true;
  group.add(base);
  const halo = glowSprite(glow, radius * 4, 0.35); halo.position.y = cy; group.add(halo);
  // Swirling motes drawn into the gate.
  const N = 160;
  const g = new THREE.BufferGeometry();
  const p = new Float32Array(N * 3), seeds = Array.from({ length: N }, () => [Math.random() * TAU, Math.random()]);
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  const pts = new THREE.Points(g, new THREE.PointsMaterial({ color: glow, size: 0.08, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, map: glowTexture() }));
  pts.frustumCulled = false; pts.userData.noRaycast = true; markNoAO(pts);
  group.add(pts);
  return (t) => {
    for (let i = 0; i < N; i++) {
      const [a0, s] = seeds[i];
      const life = (s + t * 0.25) % 1;
      const a = a0 + t * 1.5 + life * 4;
      const rr = (radius + 0.6) * (1 - life);
      p[i * 3] = Math.cos(a) * rr; p[i * 3 + 1] = cy + Math.sin(a) * rr; p[i * 3 + 2] = (1 - life) * 0.8 * Math.sin(a * 3);
    }
    g.attributes.position.needsUpdate = true;
    ring.rotation.z = Math.sin(t * 0.5) * 0.05;
    halo.material.opacity = 0.3 + Math.sin(t * 2) * 0.05;
  };
}

export const portalGen = {
  maxCount: 3,
  estimate: () => 14,
  stages: () => [
    { name: 'plan', label: 'Opening a rift', weight: 0.3 },
    { name: 'dimension', label: 'Building the destination dimension', weight: 6 },
    { name: 'geometry', label: 'Forging the gate', weight: 0.8 },
    { name: 'textures', label: 'Stabilising the portal', weight: 0.5 },
  ],
  *build(ctx, item, rng, env) {
    const a = item.attrs;
    const kind = classifyDestination(a.destination || a.text || '', rng);
    const def = DIMENSIONS[kind];
    ctx.stage('dimension', `Building ${def.name}`);
    const dim = yield* buildDimension(kind, rng.nextU32(), (f, text) => ctx.progress(f, text || `Building ${def.name}`));
    registerWorld(dim);
    ctx.stage('geometry', 'Forging the gate');
    yield;
    const theme = THEMES[kind] || THEMES.crystal;
    const radius = 1.55 * Math.min(3, Math.max(0.7, a.sizeMul || 1));
    const glow = a.primaryColor && a.primaryColor !== 'rainbow' ? a.primaryColor : theme.glow;
    const root = new THREE.Group();
    const gateGroup = new THREE.Group();
    root.add(gateGroup);
    const tickA = buildFrame(gateGroup, radius, theme, glow);
    const src = new PortalGate(env.world, gateGroup, radius, glow);
    // Return gate in the dimension, placed at its spawn, facing inward.
    const retGroup = new THREE.Group();
    const sp = dim.spawn.pos.clone();
    retGroup.position.set(sp.x, sp.y, sp.z - 2.5);
    retGroup.rotation.y = 0;
    dim.scene.add(retGroup);
    const tickB = buildFrame(retGroup, radius, THEMES[env.world.kind === 'overworld' ? 'sky' : env.world.kind] || THEMES.sky, env.world.kind === 'overworld' ? '#8ad0ff' : glow);
    const back = new PortalGate(dim, retGroup, radius, env.world.kind === 'overworld' ? '#8ad0ff' : glow);
    src.target = back; back.target = src;
    src.ready = back.ready = true;
    src.uniforms.uReady.value = back.uniforms.uReady.value = 1;
    dim.spawn.pos.set(sp.x, sp.y, sp.z + 0.5);
    dim.spawn.yaw = Math.PI; // face away from the return gate
    dim.colliders.add({ type: 'cyl', x: retGroup.position.x, z: retGroup.position.z, y0: retGroup.position.y, y1: retGroup.position.y + 0.3, r: radius * 0.9, walkable: true });
    // The return gate lives in the dimension: its per-frame logic runs as a world updater.
    const retUpdater = (dt, t) => { tickB(t); back.uniforms.uTime.value = t; back.render(dt); back.checkCross(); };
    dim.addUpdater(retUpdater);
    ctx.stage('textures', 'Stabilising the portal');
    yield;
    const data = {
      root, name: `Portal to the ${def.name}`, category: 'portal', icon: '🌀', height: radius * 2.4, footprint: { radius: radius + 0.6 },
      colliderDefs: [
        { type: 'cyl', x: 0, z: 0, y0: 0, y1: 0.3, r: radius * 0.9, walkable: true },
        // The ring's sides (you walk through the middle).
        { type: 'box', x: -(radius + 0.12), z: 0, y0: 0.3, y1: radius * 2.3, hx: 0.22, hz: 0.25 }, { type: 'box', x: radius + 0.12, z: 0, y0: 0.3, y1: radius * 2.3, hx: 0.22, hz: 0.25 },
      ],
      lights: [{ pos: [0, radius + 0.2, 0.5], color: glow, intensity: 3, distance: 10, nightOnly: false }],
      suppressGrass: undefined, dimension: dim, dimKind: kind,
      interact: { label: () => `Step through to the ${def.name}`, action: () => { G.player.yaw = new THREE.Euler().setFromQuaternion(gateGroup.getWorldQuaternion(new THREE.Quaternion()), 'YXZ').y; src.traverse(new THREE.Vector3(0, 0, 0)); } },
    };
    data.update = function (dt, t) {
      tickA(t);
      src.uniforms.uTime.value = t;
      src.render(dt);
      src.checkCross();
    };
    data.onAdded = function () { src.prevZ = null; if (G.ui) G.ui.toast(`🌀 The portal to the ${def.name} is open — walk through it!`, 'good', 5000); };
    data.onRemove = function () {
      if (G.world === dim) switchWorld(env.world, G.player.position.clone(), G.player.yaw);
      dim.removeUpdater(retUpdater);
      src.dispose(); back.dispose();
      // Entities created inside the dimension go with it.
      for (const e of [...G.registry.entities.values()]) if (e.worldId === dim.id) G.registry.remove(e.id);
      dim.dispose();
      G.worlds.delete(dim.id);
    };
    data.saveState = () => ({ dimId: dim.id });
    return data;
  },
};

// Direct trips (e.g. a rocket reaching orbit): build or reuse a dimension and
// jump there, with a return gate leading back to where you left.
export const dimensionService = {
  cache: new Map(),
  enterKind(kind) {
    const from = G.world;
    const fromPos = G.player.position.clone(), fromYaw = G.player.yaw;
    const go = (dim) => { switchWorld(dim, dim.spawn.pos.clone().add(new THREE.Vector3(0, 0.2, 0)), dim.spawn.yaw); };
    if (this.cache.has(kind)) { go(this.cache.get(kind)); return; }
    const job = new Job(function* (ctx) {
      ctx.stage(0, 'Building ' + DIMENSIONS[kind].name);
      const dim = yield* buildDimension(kind, (Math.random() * 1e9) | 0, (f, t) => ctx.progress(f, t));
      registerWorld(dim);
      // Return gate back to the launch site.
      const radius = 1.55;
      const retGroup = new THREE.Group();
      retGroup.position.copy(dim.spawn.pos).add(new THREE.Vector3(0, 0, -2.5));
      dim.scene.add(retGroup);
      const tick = buildFrame(retGroup, radius, THEMES.sky, '#8ad0ff');
      const back = new PortalGate(dim, retGroup, radius, '#8ad0ff');
      const homeGroup = new THREE.Group();
      homeGroup.position.copy(fromPos); homeGroup.rotation.y = fromYaw;
      from.scene.add(homeGroup);
      const home = new PortalGate(from, homeGroup, radius, '#8ad0ff');
      home.surface.visible = false;
      back.target = home; home.target = back; back.ready = home.ready = true; back.uniforms.uReady.value = 1;
      dim.spawn.yaw = Math.PI;
      dim.addUpdater((dt, t) => { tick(t); back.uniforms.uTime.value = t; back.render(dt); back.checkCross(); });
      return dim;
    }, { title: 'Travelling to ' + DIMENSIONS[kind].name, stages: [{ name: 'build', label: 'Building dimension', weight: 1 }], estimateSec: 12 });
    G.jobs.add(job);
    if (G.ui) G.ui.trackJob(job);
    job.promise.then((res) => { if (res.status === 'done') { this.cache.set(kind, res.result); go(res.result); } });
  },
};
