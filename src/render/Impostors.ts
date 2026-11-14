import * as THREE from 'three';

/**
 * Impostors — the far level of detail (the directive's LOD3): a model is rendered once, from 8 headings × 4
 * elevations, into three small atlases:
 *   colour    the model under a uniform white ambient (albedo plus its own glow)
 *   normals   view-space normals (relit in the shader: the impostor answers to the scene's sun, sky and fog)
 *   glow      emissive only (light organs, embers, glowing rims stay lit at night)
 * At range the animal is drawn as one camera-facing quad that picks the view nearest the camera's direction in the
 * animal's own frame, rolled with the animal (a banking flyer banks), relit with the scene's lights:
 *   colour = albedo · (ambient + sun · max(n·l, 0)) / π + glow
 * One atlas set per species, shared by every animal of it.
 */
const COLS = 8;
const ROWS = 4;
const PITCH = [-50, -15, 15, 50].map((d) => THREE.MathUtils.degToRad(d));

export interface ImpostorLight {
  /** toward the sun (world, unit) */
  dir: THREE.Vector3;
  /** sun irradiance (colour × intensity) */
  sun: THREE.Color;
  /** ambient irradiance (sky/ground average × intensity) */
  ambient: THREE.Color;
}

export class ImpostorAtlas {
  /** per tile: the bake camera's rotation in the model frame (maps the tile's view-space normals to the model) */
  readonly tileQ: THREE.Quaternion[] = [];

  constructor(
    readonly color: THREE.WebGLRenderTarget,
    readonly normal: THREE.WebGLRenderTarget,
    readonly glow: THREE.WebGLRenderTarget,
    /** the model's bounding sphere at scale 1 (model frame) */
    readonly center: THREE.Vector3,
    readonly radius: number,
  ) {}

  /** the tile for a view direction given in the model frame (from the model toward the camera) */
  tile(v: THREE.Vector3) {
    const yaw = Math.atan2(v.x, v.z);
    const col = ((Math.round(yaw / ((Math.PI * 2) / COLS)) % COLS) + COLS) % COLS;
    const pitch = Math.asin(THREE.MathUtils.clamp(v.y / Math.max(v.length(), 1e-6), -1, 1));
    let row = 0;
    for (let r = 1; r < ROWS; r++) if (Math.abs(PITCH[r] - pitch) < Math.abs(PITCH[row] - pitch)) row = r;
    return row * COLS + col;
  }

  dispose() {
    this.color.dispose();
    this.normal.dispose();
    this.glow.dispose();
  }
}

const VERT = /* glsl */ `
uniform vec4 tileRect;
varying vec2 vUv;
#include <fog_pars_vertex>
void main() {
  vUv = tileRect.xy + uv * tileRect.zw;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const FRAG = /* glsl */ `
uniform sampler2D colorMap;
uniform sampler2D normalMap;
uniform sampler2D glowMap;
uniform mat3 toWorld;
uniform vec3 sunDir;
uniform vec3 sunIrr;
uniform vec3 ambIrr;
varying vec2 vUv;
#include <fog_pars_fragment>
void main() {
  vec4 c = texture2D(colorMap, vUv);
  if (c.a < 0.3) discard;
  vec3 glow = texture2D(glowMap, vUv).rgb;
  vec3 albedo = max(c.rgb - glow, 0.0);
  vec3 n = normalize(toWorld * (texture2D(normalMap, vUv).xyz * 2.0 - 1.0));
  vec3 col = albedo * (ambIrr + sunIrr * max(dot(n, sunDir), 0.0)) * 0.3183099 + glow;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _u = new THREE.Vector3();
const _f = new THREE.Vector3();
const _r = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _m3 = new THREE.Matrix3();
const _c = new THREE.Vector3();
const QUAD = new THREE.PlaneGeometry(1, 1);

/** one animal's impostor: a quad sharing its species' atlas */
export class Impostor {
  readonly mesh: THREE.Mesh;
  private mat: THREE.ShaderMaterial;

  constructor(readonly atlas: ImpostorAtlas) {
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      fog: true,
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        {
          tileRect: { value: new THREE.Vector4(0, 0, 1 / COLS, 1 / ROWS) },
          colorMap: { value: null },
          normalMap: { value: null },
          glowMap: { value: null },
          toWorld: { value: new THREE.Matrix3() },
          sunDir: { value: new THREE.Vector3(0, 1, 0) },
          sunIrr: { value: new THREE.Color(1, 1, 1) },
          ambIrr: { value: new THREE.Color(0.5, 0.5, 0.5) },
        },
      ]),
    });
    this.mat.uniforms.colorMap.value = atlas.color.texture;
    this.mat.uniforms.normalMap.value = atlas.normal.texture;
    this.mat.uniforms.glowMap.value = atlas.glow.texture;
    this.mesh = new THREE.Mesh(QUAD, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.mesh.name = 'impostor';
  }

  /**
   * place it for this frame: the animal's world transform (position, rotation, uniform scale), the camera, the
   * scene's light
   */
  update(pos: THREE.Vector3, q: THREE.Quaternion, scale: number, cam: THREE.Camera, light: ImpostorLight) {
    const A = this.atlas;
    // the sphere's centre in world, the view direction in the animal's frame
    _c.copy(A.center).multiplyScalar(scale).applyQuaternion(q).add(pos);
    cam.getWorldPosition(_v);
    _f.subVectors(_v, _c);
    const dist = _f.length();
    if (dist < 1e-3) return;
    _f.divideScalar(dist);
    _q.copy(q).invert();
    const local = _u.copy(_f).applyQuaternion(_q);
    const i = A.tile(local);
    const col = i % COLS, row = Math.floor(i / COLS);
    this.mat.uniforms.tileRect.value.set(col / COLS, row / ROWS, 1 / COLS, 1 / ROWS);
    // the quad faces the camera; its up is the animal's up projected onto the view plane (it rolls with the animal)
    _u.set(0, 1, 0).applyQuaternion(q);
    _u.addScaledVector(_f, -_u.dot(_f));
    if (_u.lengthSq() < 1e-6) _u.set(0, 0, 1).applyQuaternion(q).addScaledVector(_f, -_f.dot(_u.set(0, 0, 1).applyQuaternion(q)));
    _u.normalize();
    _r.crossVectors(_u, _f).normalize();
    _m.makeBasis(_r, _u, _f);
    this.mesh.quaternion.setFromRotationMatrix(_m);
    this.mesh.position.copy(_c);
    const s = A.radius * 2 * scale;
    this.mesh.scale.set(s, s, s);
    // the tile's view-space normals → world: the animal's rotation × the bake camera's rotation for that tile
    _q.copy(q).multiply(A.tileQ[i]);
    this.mat.uniforms.toWorld.value.setFromMatrix4(_m.makeRotationFromQuaternion(_q));
    this.mat.uniforms.sunDir.value.copy(light.dir);
    this.mat.uniforms.sunIrr.value.copy(light.sun);
    this.mat.uniforms.ambIrr.value.copy(light.ambient);
    void _m3;
  }

  dispose() {
    this.mat.dispose();
    this.mesh.removeFromParent();
  }
}

/** bakes and caches one atlas set per species */
export class ImpostorBaker {
  private cache = new Map<string, ImpostorAtlas>();
  private scene = new THREE.Scene();
  private cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 100);
  private amb = new THREE.AmbientLight(0xffffff, Math.PI);
  private normalMat = new THREE.MeshNormalMaterial();

  constructor(readonly gl: THREE.WebGLRenderer, readonly tilePx = 128) {
    this.scene.add(this.amb);
  }

  get(key: string) {
    return this.cache.get(key) ?? null;
  }

  /**
   * render `root` (moved here for the bake, then put back where it was) into the three atlases; `show` makes the
   * finest level of detail visible for the bake and `restore` puts the caller's state back
   */
  bake(key: string, root: THREE.Object3D, show?: () => void, restore?: () => void) {
    const hit = this.cache.get(key);
    if (hit) return hit;
    const gl = this.gl;
    const parent = root.parent;
    const p0 = root.position.clone(), q0 = root.quaternion.clone(), s0 = root.scale.clone(), v0 = root.visible;
    show?.();
    root.position.set(0, 0, 0);
    root.quaternion.identity();
    root.scale.setScalar(1);
    root.visible = true;
    this.scene.add(root);
    root.updateMatrixWorld(true);
    const sphere = new THREE.Box3().setFromObject(root, true).getBoundingSphere(new THREE.Sphere());
    const R = Math.max(1e-3, sphere.radius);
    const W = this.tilePx * COLS, H = this.tilePx * ROWS;
    const mk = (srgb: boolean, w: number, h: number) => {
      const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.UnsignedByteType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, depthBuffer: true });
      rt.texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      return rt;
    };
    const atlas = new ImpostorAtlas(mk(true, W, H), mk(false, W, H), mk(true, W / 2, H / 2), sphere.center.clone(), R);
    const cam = this.cam;
    cam.left = -R;
    cam.right = R;
    cam.top = R;
    cam.bottom = -R;
    cam.near = R * 0.1;
    cam.far = R * 6;
    cam.updateProjectionMatrix();
    const prevRT = gl.getRenderTarget();
    const prevClear = gl.getClearColor(new THREE.Color());
    const prevAlpha = gl.getClearAlpha();
    const prevAuto = gl.autoClear;
    const prevShadow = gl.shadowMap.enabled;
    gl.shadowMap.enabled = false;
    gl.setClearColor(0x000000, 0);
    gl.autoClear = true;
    const views: { pos: THREE.Vector3; q: THREE.Quaternion }[] = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const yaw = (c / COLS) * Math.PI * 2;
        const pitch = PITCH[r];
        const d = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
        cam.position.copy(sphere.center).addScaledVector(d, R * 3);
        cam.up.set(0, 1, 0);
        cam.lookAt(sphere.center);
        cam.updateMatrixWorld(true);
        views.push({ pos: cam.position.clone(), q: cam.quaternion.clone() });
        atlas.tileQ.push(cam.quaternion.clone());
      }
    }
    const pass = (rt: THREE.WebGLRenderTarget, mode: 'color' | 'normal' | 'glow') => {
      const tw = rt.width / COLS, th = rt.height / ROWS;
      gl.setRenderTarget(rt);
      rt.scissorTest = false;
      gl.clear(true, true, true);
      this.amb.intensity = mode === 'color' ? Math.PI : 0;
      this.scene.overrideMaterial = mode === 'normal' ? this.normalMat : null;
      for (let i = 0; i < views.length; i++) {
        const c = i % COLS, r = Math.floor(i / COLS);
        rt.viewport.set(c * tw, r * th, tw, th);
        rt.scissor.set(c * tw, r * th, tw, th);
        rt.scissorTest = true;
        gl.setRenderTarget(rt);
        cam.position.copy(views[i].pos);
        cam.quaternion.copy(views[i].q);
        cam.updateMatrixWorld(true);
        gl.render(this.scene, cam);
      }
      rt.scissorTest = false;
      rt.viewport.set(0, 0, rt.width, rt.height);
    };
    try {
      pass(atlas.color, 'color');
      pass(atlas.normal, 'normal');
      pass(atlas.glow, 'glow');
    } finally {
      this.scene.overrideMaterial = null;
      this.amb.intensity = Math.PI;
      gl.setRenderTarget(prevRT);
      gl.setClearColor(prevClear, prevAlpha);
      gl.autoClear = prevAuto;
      gl.shadowMap.enabled = prevShadow;
      this.scene.remove(root);
      if (parent) parent.add(root);
      root.position.copy(p0);
      root.quaternion.copy(q0);
      root.scale.copy(s0);
      root.visible = v0;
      root.updateMatrixWorld(true);
      restore?.();
    }
    // mipmaps for the minified far view
    for (const rt of [atlas.color, atlas.normal, atlas.glow]) rt.texture.needsUpdate = false;
    this.cache.set(key, atlas);
    return atlas;
  }

  dispose() {
    for (const a of this.cache.values()) a.dispose();
    this.cache.clear();
    this.normalMat.dispose();
  }
}
