import * as THREE from 'three';
import { Zone, type SpawnSpec } from '../Zone';
import { Frame } from '../Frame';
import { EarthGen } from '../earth/EarthGen';
import { Terrain } from '../terrain/Terrain';
import { earthShading } from '../earth/earthShading';
import { buildRoads, roadColliders } from '../earth/Roads';
import { Sky, ATMOSPHERES } from '../../render/Sky';
import { sunDirection, localSolarHours } from '../../space/astro';
import { EARTH_TERRAIN, FARM_SPAWN, FIELDS, NASA } from '../../data/earthLayout';
import { Loops } from '../../audio/Audio';
import type { Game } from '../../core/Game';
import { EarthContent } from '../earth/EarthContent';
import { CloudLayer } from '../../render/Clouds';
import { LaunchSequence } from '../earth/Launch';
import type { NasaSite } from '../earth/NasaSite';

/**
 * Earth: the dying farmland, the six-kilometre road and the hidden NASA facility.
 */
export default class EarthZone extends Zone {
  readonly id = 'earth' as const;
  gen!: EarthGen;
  terrain!: Terrain;
  sky!: Sky;
  sun!: THREE.DirectionalLight;
  hemi!: THREE.HemisphereLight;
  ground!: Frame;
  harvestTex!: THREE.DataTexture;
  harvestRect = new THREE.Vector4();
  content!: EarthContent;
  private envTimer = 0;
  private roadCols: any[] = [];
  private roadColCenter = new THREE.Vector2(1e9, 1e9);
  private fogColor = new THREE.Color();
  storm = 0; // 0..1 dust storm intensity (driven by Weather)
  clouds!: CloudLayer;
  launch: LaunchSequence | null = null;

  constructor(game: Game) {
    super(game);
    this.music = 'earth';
  }

  async load(progress: (p: number, msg: string) => void) {
    const game = this.game;
    this.gen = new EarthGen();
    this.gen.build((p, m) => progress(p * 0.5, m));
    // harvest mask over the farm fields (2 m texels)
    const minX = Math.min(...FIELDS.map((f) => f.rect[0])) - 10, minZ = Math.min(...FIELDS.map((f) => f.rect[1])) - 10;
    const maxX = Math.max(...FIELDS.map((f) => f.rect[2])) + 10, maxZ = Math.max(...FIELDS.map((f) => f.rect[3])) + 10;
    const hw = Math.ceil((maxX - minX) / 2), hh = Math.ceil((maxZ - minZ) / 2);
    this.harvestTex = new THREE.DataTexture(new Uint8Array(hw * hh), hw, hh, THREE.RedFormat, THREE.UnsignedByteType);
    this.harvestTex.magFilter = THREE.LinearFilter;
    this.harvestTex.minFilter = THREE.LinearFilter;
    this.harvestTex.needsUpdate = true;
    this.harvestRect.set(minX, minZ, hw * 2, hh * 2);

    progress(0.52, 'terrain renderer');
    this.terrain = new Terrain({
      field: this.gen.field,
      rootSize: 131072,
      rootCenter: EARTH_TERRAIN.center,
      leafSize: 64,
      lodBase: 110,
      shading: earthShading(this.gen, game.materials, this.harvestTex, this.harvestRect),
    });
    this.scene.add(this.terrain.mesh);
    this.disposables.push(this.terrain);
    this.scene.add(buildRoads(this.gen, game.materials));

    // atmosphere & light
    this.sky = new Sky(ATMOSPHERES.earth);
    this.scene.add(this.sky.mesh);
    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    const sc = this.sun.shadow.camera as THREE.OrthographicCamera;
    sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.near = 1; sc.far = 600;
    this.scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xb8c4d0, 0x6b5a45, 0.5);
    this.scene.add(this.hemi);
    this.scene.fog = new THREE.FogExp2(0xbfb59c, 0.00012);
    // sparse high cumulus deck the launch punches through
    this.clouds = new CloudLayer(game.materials.tex('noise', false, 1), 4200, 900, 0.36);
    this.scene.add(this.clouds.mesh);
    this.applyShadowQuality();

    // ground physics frame
    this.ground = this.addFrame(new Frame('earth', this.scene, new THREE.Vector3(0, -9.81, 0), 'Earth'));
    this.ground.surfaceFn = (p) => (this.content?.interiorSurface(p) ?? this.gen.surfaceAt(p.x, p.z));

    progress(0.6, 'farm & facility');
    this.content = new EarthContent(this);
    await this.content.load((p, m) => progress(0.6 + p * 0.38, m));
    progress(1, 'ready');
  }

  applyShadowQuality() {
    const q = this.game.settings.graphics.shadowQuality;
    const size = q >= 3 ? 4096 : q >= 2 ? 2048 : 1024;
    this.sun.castShadow = q > 0;
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      this.sun.shadow.map?.dispose();
      (this.sun.shadow as any).map = null;
    }
    const ext = q >= 3 ? 90 : q >= 2 ? 70 : 45;
    const sc = this.sun.shadow.camera as THREE.OrthographicCamera;
    sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext;
    sc.updateProjectionMatrix();
    this.terrain.detailBias = [0.6, 0.8, 1.0, 1.3][this.game.settings.graphics.viewDistance] ?? 1;
  }

  onSettingsChanged() {
    this.applyShadowQuality();
    this.content?.onSettingsChanged();
  }

  describe() {
    const z = this.content?.describeHere();
    if (z) return z;
    return { name: 'EARTH', sub: 'Eastern plains, Colorado' };
  }

  height(x: number, z: number) {
    return this.gen.height(x, z);
  }

  spawn(spec: SpawnSpec) {
    const p = this.game.player;
    if (spec.at === 'menu') {
      // player parked at the farm while the menu cinematic runs
      const s = new THREE.Vector3(...FARM_SPAWN.pos);
      s.y = this.height(s.x, s.z) + 0.05;
      p.enterFrame(this.ground, s, FARM_SPAWN.yaw);
      return;
    }
    if (spec.at && this.content.spawnAt(spec.at)) return;
    if (spec.frame && spec.frame !== 'earth' && this.content.spawnInFrame(spec)) return;
    let pos = spec.pos?.clone();
    if (!pos) {
      pos = new THREE.Vector3(...FARM_SPAWN.pos);
      pos.y = this.height(pos.x, pos.z) + 0.05;
    }
    p.enterFrame(this.ground, pos, spec.yaw ?? FARM_SPAWN.yaw);
  }

  // ------------------------------------------------------------------------- menu & intro
  menuUpdate(dt: number, cam: THREE.PerspectiveCamera, t: number) {
    // slow glide over the corn toward the farmhouse, then a gentle orbit (images 1–2)
    const glide = Math.min(1, t / 26);
    const e = glide * glide * (3 - 2 * glide);
    const ang = -0.25 + t * 0.012;
    const r = THREE.MathUtils.lerp(240, 95, e);
    const x = Math.sin(ang) * r + 6;
    const z = Math.cos(ang) * r + 10;
    const ground = this.height(x, z);
    const y = ground + THREE.MathUtils.lerp(2.6, 3.4, e) + Math.sin(t * 0.21) * 0.25;
    cam.position.set(x, y, z);
    const look = new THREE.Vector3(0, this.height(0, 0) + 5.5, -2);
    cam.lookAt(look);
    cam.updateMatrixWorld();
  }

  /** Smooth hand-off from the menu camera to the player's eyes. */
  introToPlay(): Promise<void> {
    const game = this.game;
    const cam = game.camera;
    const from = { p: cam.position.clone(), q: cam.quaternion.clone() };
    this.spawn({ at: 'farm' });
    game.player.update(0, game.input);
    const to = new THREE.Matrix4().copy(game.player.camWorld);
    const tp = new THREE.Vector3(), tq = new THREE.Quaternion(), ts = new THREE.Vector3();
    to.decompose(tp, tq, ts);
    return new Promise((resolve) => {
      let t = 0;
      game.playCinematic({
        blocking: true,
        update: (dt, c) => {
          t += dt / 3.2;
          const k = Math.min(1, t);
          const e = k * k * (3 - 2 * k);
          c.position.lerpVectors(from.p, tp, e);
          c.position.y += Math.sin(e * Math.PI) * 6;
          c.quaternion.slerpQuaternions(from.q, tq, e);
          c.updateMatrixWorld();
          if (k >= 1) {
            resolve();
            return false;
          }
          return true;
        },
      });
    });
  }

  // ------------------------------------------------------------------------- update
  update(dt: number, dtEarth: number) {
    this.time += dt;
    const game = this.game;
    const cam = game.camera;
    // sun from the real date & site latitude/longitude
    sunDirection(game.state.clock.earthTime, undefined, undefined, this.sky.sunDir);
    const sunUp = this.sky.sunDir.y;
    this.sky.dust = this.storm * 0.85;
    this.sky.update(cam, this.time, Math.max(2, cam.position.y - this.height(cam.position.x, cam.position.z)));
    const sunCol = this.sky.sunColor();
    const sunI = Math.max(0, Math.min(1, (sunUp + 0.04) * 6)) * (1 - this.storm * 0.75);
    this.sun.color.copy(sunCol);
    this.sun.intensity = 3.4 * sunI;
    // shadow camera follows the viewer with texel snapping (no shimmering)
    const focus = cam.position;
    const sc = this.sun.shadow.camera as THREE.OrthographicCamera;
    const texel = (sc.right - sc.left) / this.sun.shadow.mapSize.x;
    const sd = this.sky.sunDir.clone();
    if (sd.y < 0.05) sd.y = 0.05;
    const tgt = focus.clone();
    tgt.x = Math.round(tgt.x / texel) * texel;
    tgt.z = Math.round(tgt.z / texel) * texel;
    this.sun.target.position.copy(tgt);
    this.sun.position.copy(tgt).addScaledVector(sd.normalize(), 250);
    this.sun.target.updateMatrixWorld();
    // ambient from sky model
    const zenith = this.sky.evaluate(new THREE.Vector3(0, 1, 0));
    const horizon = this.sky.evaluate(new THREE.Vector3(Math.sign(this.sky.sunDir.x) * -0.9, 0.08, 0.3).normalize());
    const skyAmb = zenith.clone().multiplyScalar(0.06);
    this.hemi.color.copy(skyAmb.clone().lerp(horizon.clone().multiplyScalar(0.06), 0.5));
    this.hemi.groundColor.setRGB(0.32, 0.26, 0.19).multiplyScalar(0.35 * Math.max(0.05, sunI) + 0.02);
    this.hemi.intensity = 1.0 + this.storm * 0.6;
    // fog colour = horizon radiance in the view direction (aerial perspective approximation)
    const fwd = cam.getWorldDirection(new THREE.Vector3());
    fwd.y = 0.04;
    const fogRad = this.sky.evaluate(fwd.normalize());
    const exposure = 0.075;
    this.fogColor.setRGB(fogRad.r * exposure, fogRad.g * exposure, fogRad.b * exposure);
    const fog = this.scene.fog as THREE.FogExp2;
    fog.color.copy(this.fogColor);
    const vd = [2.2, 1.6, 1.2, 1.0][game.settings.graphics.viewDistance] ?? 1;
    // thinner air with altitude (ascent): fog falls off with the 8.5 km scale height
    const camAlt = Math.max(0, cam.position.y - this.gen.portalLevel);
    fog.density = (0.000085 * vd + this.storm * 0.012) * (1 + Math.max(0, 0.15 - sunUp) * 2) * Math.exp(-camAlt / 8500);
    this.clouds.update(dt, cam, this.sky.sunDir, sunCol, zenith.clone().multiplyScalar(0.05), this.fogColor, this.storm);
    // exposure: daylight vs night vs storm (eye adaptation)
    this.exposure = THREE.MathUtils.clamp(0.95 / Math.max(0.12, sunI * (1 - this.storm * 0.5) + 0.05), 0.8, 6) * (this.content?.interiorExposure() ?? 1);
    // IBL refresh
    this.envTimer -= dt;
    if (this.envTimer <= 0) {
      this.envTimer = 2;
      const env = this.sky.updateEnvironment(game.renderer.pmrem);
      this.scene.environment = env;
      this.scene.environmentIntensity = 0.55 * Math.max(0.08, sunI) + 0.05;
    }
    this.terrain.update(cam);
    this.terrain.uniforms.uDust.value = this.storm;
    this.game.materials.globalUniforms.uDustAccum.value = this.storm * 0.4 + (this.game.state.farm.stormLevel ?? 0) * 0.1;

    // physics streaming: terrain heightfield patch + road colliders near the player
    const pp = game.player.frame === this.ground ? game.player.pos : null;
    const focusXZ = pp ? new THREE.Vector2(pp.x, pp.z) : new THREE.Vector2(cam.position.x, cam.position.z);
    const ctrl = (this.content as any)?.focusXZ?.();
    if (ctrl) focusXZ.copy(ctrl);
    const ph = this.ground.physics;
    if (ph.terrainCenter.distanceTo(focusXZ) > 160) {
      const c = 4;
      const cx = Math.round(focusXZ.x / c) * c, cz = Math.round(focusXZ.y / c) * c;
      ph.setTerrainPatch(cx, cz, 128, c, (x, z) => this.gen.height(x, z));
    }
    if (this.roadColCenter.distanceTo(focusXZ) > 200) {
      for (const c of this.roadCols) ph.world.removeCollider(c, false);
      this.roadCols = roadColliders(this.gen, ph, focusXZ.x, focusXZ.y, 420);
      this.roadColCenter.copy(focusXZ);
    }
    this.content.update(dt, dtEarth);
    this.launch?.update(dt);
    ph.step(dt);
    // ambience
    this.updateAmbience();
  }

  private ambT = 0;
  private updateAmbience() {
    const a = this.game.audio;
    if (!a.ctx) return;
    this.ambT -= 1;
    if (this.ambT > 0) return;
    this.ambT = 15;
    const inside = this.content?.isIndoors() ?? false;
    const wind = a.loop('earth_wind', 'ambience', Loops.wind(), { gain: 0.6 });
    wind?.set('intensity', (inside ? 0.15 : 0.35) + this.storm * 0.65, 0.8);
    wind?.set('gain', inside ? 0.25 : 0.6, 0.8);
    const cam = this.game.camera.position;
    const inField = this.gen.fieldAt(cam.x, cam.z);
    const rustle = a.loop('earth_rustle', 'ambience', Loops.rustle(), { gain: 1 });
    rustle?.set('intensity', inside ? 0 : (inField ? 0.9 : 0.35) * (0.5 + this.storm), 0.6);
    this.game.audio.music?.setMood(this.content?.musicMood() ?? 'earth');
  }

  clockContext() {
    return {};
  }

  maxTimeWarp() {
    return this.game.control ? 1 : 100;
  }

  altitude() {
    return this.game.camera.position.y;
  }

  localHours() {
    return localSolarHours(this.game.state.clock.earthTime);
  }

  computerTabs() {
    return this.content?.computerTabs() ?? [];
  }

  objectives() {
    return this.content?.objectives() ?? [];
  }

  fastTravel() {
    return this.content?.fastTravel() ?? [];
  }

  writeState() {
    this.content?.writeState();
  }

  recoverSpacecraft() {
    this.content?.recover();
  }

  /** Board Ranger 1 in the silo and run the launch (called by NasaSite.board). */
  startLaunch(nasa: NasaSite) {
    if (this.launch && this.launch.phase !== 'aborted') return;
    this.launch = new LaunchSequence(this, nasa);
    this.launch.begin();
  }

  get nasaPortal() {
    return new THREE.Vector3(NASA.portal.x, this.gen.portalLevel, NASA.portal.z);
  }
}

