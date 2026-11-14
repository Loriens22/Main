import * as THREE from 'three';
import { Creature, FaunaManager } from './Fauna';
import { AX } from './Rig';
import { Flyer, Sky } from './jupiter';
import { PreySwarm } from './prey';
import { SPECIES_EXPANSION } from '../../data/speciesExpansion';

/**
 * Jupiter — the nine species of the player's 3×3 reference sheet (jupiter_panel_01 … 09; dossiers in
 * data/speciesExpansion.ts, models blender/assets/fauna_jupiter_sheet.py), met from Ranger 1 in the cloud layer.
 * None levitates for free and none lives "in all atmospheric layers": each keeps to a bounded corridor relative to
 * the Ranger's level and loses height where its lift fails. No species eats lightning.
 *   Stormskimmer   strings gliding across shear lanes; a panicked wingtip strike only if you ram the string
 *   Skyjelly       drifting bells; their sticky tendrils foul small intakes if you plough through
 *   Stormbeast     a very rare burst-ambusher at a storm wall: a long telegraph, one pass, gone into the deep
 *   Floating Colony thousands of small units over a wide volume (instanced) — a community, never a 5-km body;
 *                  fly through fast and they foul the intakes and the optics
 *   Voltdrifter    squid near a distant storm cell, reading the field (UI readout), darting for aeromites
 *   Deepdiver      armoured air-swimmer in the dense lower haze, far below the flight level
 *   Gasgrazer      giant comb-mouthed grazer following the aeromite swarm
 *   Aeromite Swarm the golden base of the web (instanced)
 *   Stormhunter    a mobile apex predator: shadows, calls, one telegraphed intercept, then breaks off — and
 *                  never follows out of its altitude envelope
 * Settings → Heroic Jupiter scale shows the poster sizes (Creative); the simulation size is the default.
 */
const TAU = Math.PI * 2;
const _v = new THREE.Vector3();
const _u = new THREE.Vector3();
const _w = new THREE.Vector3();
const clamp = THREE.MathUtils.clamp;
const damp = THREE.MathUtils.damp;

/** codex evidence (flags bio:<id>:<key>) for a species of the sheet */
function note(f: FaunaManager, id: string, key: string) {
  const g = f.game;
  const k = `bio:${id}:${key}`;
  if (g.flag(k)) return false;
  const info = SPECIES_EXPANSION[id];
  const t = info?.evidence[key] ?? key;
  g.flag(k, `${Math.round(g.state.clock.earthTime)}|${t}`);
  g.notify(key === 'sighting' ? `New life form recorded — ${info?.name ?? id}. Codex updated.` : `Codex · ${info?.name ?? id}: ${t}`, 'ok', 5);
  g.log?.('mission', 'computer', `${info?.name ?? id} — ${t}`);
  return true;
}

/** the camera looks at p from within range (through haze the giants are still silhouettes far off) */
function seen(f: FaunaManager, p: THREE.Vector3, range: number, cone = 0.45) {
  const cam = f.game.camera;
  const c = cam.getWorldPosition(_w);
  if (c.distanceTo(p) > range) return false;
  cam.getWorldDirection(_u);
  return _u.dot(_v.subVectors(p, c).normalize()) > Math.cos(cone);
}

/** a Flyer of the sheet: heroic scale, a bounded corridor in height relative to the flight level */
abstract class SheetFlyer extends Flyer {
  abstract readonly id: string;
  /** the corridor (m relative to Ranger 1's altitude) */
  band: [number, number] = [-300, 300];
  readonly wind = new THREE.Vector3();

  get heroicK() {
    return this.f.settings.heroic ? SPECIES_EXPANSION[this.id]?.heroic ?? 1 : 1;
  }

  /** keep within the corridor: outside it, climb or sink back (a lift budget, not free levitation) */
  protected corridor(dt: number, k = 1) {
    const dy = this.pos.y - this.sky.rp.y;
    if (dy > this.band[1]) this.vel.y -= 2 * k * dt;
    if (dy < this.band[0]) this.vel.y += 2 * k * dt;
  }

  /** far behind the flight path: carried ahead again on the wind (a new animal of the string, out of sight) */
  protected recycle(far: number, ahead: number, lat: number, dy: number) {
    if (!this.behind(far)) return false;
    this.sky.ahead(ahead, lat, dy, this.pos);
    this.vel.set(0, 0, 0);
    return true;
  }
}

// ================================================================================================ 01 Stormskimmer
class Stormskimmer extends SheetFlyer {
  readonly species = 'stormskimmer';
  readonly id = 'stormskimmer';
  private laneLat = 0;
  private laneDy = 0;
  private struck = false;

  constructor(f: FaunaManager, sky: Sky, readonly index: number) {
    super(f, sky);
    this.view = 6000;
    this.nearR = 900;
    this.band = [150, 700];
  }

  update(dt: number, near: boolean) {
    const sky = this.sky;
    // a lane across the zonal boundary: the string crosses the flight path slowly, in line
    if (this.laneLat === 0) {
      this.laneLat = (this.index - 1) * 60 + 900;
      this.laneDy = 300 + this.index * 25;
    }
    this.laneLat -= dt * 18;
    if (this.laneLat < -1400) this.laneLat = 1400;
    sky.ahead(1100 + this.index * 140, this.laneLat, this.laneDy, _w);
    // lift from the shear: a slow sinusoidal field — where it fails the glider sinks
    const lift = Math.sin(this.t * 0.05 + this.index) * 3;
    _w.y += lift * 10;
    this.flyTo(_w, 24, 0.25, dt, 2);
    this.vel.y += (lift < 0 ? -1.2 : 0.4) * dt;
    this.corridor(dt);
    this.faceVel(dt, 0.6);
    this.size = this.heroicK;
    // rammed at close range: a panicked wingtip strike, then a descending spiral away
    const d = this.pos.distanceTo(sky.rp);
    if (d < 18 * this.size && !this.struck && sky.craft) {
      this.struck = true;
      this.f.hurtRanger(0.04, 'hull');
      this.game.renderer.fx.shake = Math.max(this.game.renderer.fx.shake, 0.6);
      this.game.notify('A Stormskimmer\'s wingtip struck the hull.', 'warn', 3);
      this.vel.y -= 15;
    }
    if (d > 60) this.struck = false;
    if (seen(this.f, this.pos, 3500)) {
      note(this.f, 'stormskimmer', 'sighting');
      if (lift < -1.5 && seen(this.f, this.pos, 1500)) note(this.f, 'stormskimmer', 'glide');
    }
    this.placeQ();
    if (near) {
      const r = this.rig;
      r.reset();
      // membranes flex with the air, not flapping: a slow travelling ripple, tips lagging
      for (const [s, sx] of [['L', -1], ['R', 1]] as const) {
        r.rot(`wing${s}1`, AX.fwd, sx * 0.06 * Math.sin(this.t * 0.8 + this.index));
        r.rot(`wing${s}2`, AX.fwd, sx * 0.12 * Math.sin(this.t * 0.8 + this.index - 0.8));
        for (let i = 1; i <= 3; i++) r.rot(`tail${s}${i}`, AX.y, 0.12 * Math.sin(this.t * 1.3 - i * 0.7 + sx));
      }
    }
  }
}

// ================================================================================================ 02 Skyjelly
class Skyjelly extends SheetFlyer {
  readonly species = 'skyjelly';
  readonly id = 'skyjelly';
  private stuck = false;

  constructor(f: FaunaManager, sky: Sky, readonly young: boolean) {
    super(f, sky);
    this.view = 3000;
    this.nearR = 400;
    this.band = [-200, 500];
  }

  update(dt: number, near: boolean) {
    const sky = this.sky;
    // drifts with the wind (relative air ~0); the bell's pulse is gentle, no fast self-propulsion
    const pulse = Math.max(0, Math.sin(this.t * 0.9));
    this.vel.lerp(_v.copy(this.wind).add(_u.set(0, 0.25 * pulse - 0.12, 0)), 1 - Math.exp(-0.5 * dt));
    this.pos.addScaledVector(this.vel, dt);
    this.corridor(dt, 0.2);
    this.recycle(2200, 1600 + Math.random() * 1500, (Math.random() - 0.5) * 2000, -100 + Math.random() * 500);
    this.size = (this.young ? 0.35 : 1) * this.heroicK;
    // ploughing through the tendrils: sticky strands in the intakes
    const d = this.pos.distanceTo(sky.rp);
    if (d < 9 * this.size + 6 && sky.craft && !this.stuck) {
      this.stuck = true;
      sky.clog = Math.max(sky.clog, 4);
      this.game.notify('Skyjelly tendrils across the intakes — thrust reduced until they burn off.', 'warn', 4);
    }
    if (d > 40) this.stuck = false;
    if (seen(this.f, this.pos, 1800)) {
      note(this.f, 'skyjelly', 'sighting');
      if (this.t > 30 && seen(this.f, this.pos, 600)) note(this.f, 'skyjelly', 'drift');
    }
    this.q.setFromAxisAngle(AX.y, this.t * 0.03);
    this.placeQ();
    this.root.scale.set(this.size * (1 + 0.04 * pulse), this.size * (1 - 0.05 * pulse), this.size * (1 + 0.04 * pulse));
    if (near) {
      const r = this.rig;
      r.reset();
      for (let b = 0; b < 8; b++) for (let i = 1; i <= 4; i++) r.rot(`tent${b}${i}`, b % 2 ? AX.x : AX.fwd, 0.08 * Math.sin(this.t * 0.7 - i * 0.6 + b));
      for (let k = 0; k < 4; k++) r.rot(`oral${k}1`, AX.x, 0.1 * Math.sin(this.t * 0.5 + k));
    }
  }
}

// ================================================================================================ 03 Stormbeast
class Stormbeast extends SheetFlyer {
  readonly species = 'stormbeast';
  readonly id = 'stormbeast';
  private wall = new THREE.Vector3();
  private ang = 0;
  private jaw = 0;

  constructor(f: FaunaManager, sky: Sky) {
    super(f, sky);
    this.view = 9000;
    this.nearR = 1500;
    this.band = [-600, 200];
    this.setState('cruise');
  }

  update(dt: number, near: boolean) {
    const sky = this.sky;
    if (this.wall.lengthSq() === 0) sky.ahead(2800, -2200, -150, this.wall);
    this.size = this.heroicK;
    const d = this.pos.distanceTo(sky.rp);
    switch (this.state) {
      case 'cruise': {
        // surging along the storm's peripheral shear lane (a wide arc), mostly half-hidden
        this.ang += dt * 0.012;
        _w.set(this.wall.x + Math.cos(this.ang) * 900, this.wall.y + Math.sin(this.ang * 3) * 80, this.wall.z + Math.sin(this.ang) * 900);
        this.flyTo(_w, 45, 0.15, dt, 4);
        this.jaw = damp(this.jaw, 0.1, 1, dt);
        if (d < 320 * this.size && this.cooldown <= 0 && sky.claim(this)) {
          this.setState('telegraph');
          this.f.voice.growl(this.pos, 3, 0.6);
          this.game.notify('Low pressure pulse from the storm wall — something enormous turning toward you.', 'alert', 5);
        }
        break;
      }
      case 'telegraph': {
        // a long, legible build-up: turn, open the maw
        this.flyTo(sky.rp, 20, 0.3, dt, 3);
        this.jaw = damp(this.jaw, 1, 1.2, dt);
        if (this.st > 6) this.setState('pass');
        if (d > 700) {
          sky.done(this, 60);
          this.setState('cruise');
        }
        break;
      }
      case 'pass': {
        this.flyTo(sky.rp, 90, 0.5, dt, 25);
        if (d < 40 * this.size) {
          this.f.hurtRanger(0.12, 'hull');
          this.game.renderer.fx.shake = Math.max(this.game.renderer.fx.shake, 1.4);
          this.game.notify('The Stormbeast\'s pass tore at the hull.', 'alert', 4);
          this.setState('dive');
        }
        if (this.st > 10) this.setState('dive');
        break;
      }
      case 'dive': {
        // gone into the deep, back to the storm's edge much later
        _w.copy(this.pos).add(_v.set(0, -400, 0)).addScaledVector(sky.head, -300);
        this.flyTo(_w, 70, 0.4, dt, 10);
        this.jaw = damp(this.jaw, 0.1, 1, dt);
        if (this.st > 12) {
          sky.done(this, 120);
          this.cooldown = 600;
          this.setState('cruise');
        }
        break;
      }
    }
    if (seen(this.f, this.pos, 5000)) note(this.f, 'stormbeast', 'sighting');
    this.faceVel(dt, 0.4);
    this.placeQ();
    if (near) {
      const r = this.rig;
      r.reset();
      for (let i = 1; i <= 7; i++) r.rot(`sp${i}`, AX.y, 0.12 * (i / 7) * Math.sin(this.t * 0.6 - i * 0.6));
      r.rot('jaw', AX.x, 0.55 * this.jaw);
    }
  }
}

// ================================================================================================ 04 Floating Colony
/** thousands of small units drawn instanced over a wide volume; temporary links, no rigid body */
class FloatingColony extends Creature {
  readonly species = 'colony';
  private mesh: THREE.InstancedMesh[] = [];
  private units: { p: THREE.Vector3; v: THREE.Vector3; s: number; ph: number }[] = [];
  readonly center = new THREE.Vector3();
  private fouled = false;
  private _m = new THREE.Matrix4();
  private _q = new THREE.Quaternion();
  private _s = new THREE.Vector3();

  constructor(f: FaunaManager, readonly sky: Sky, readonly wind: THREE.Vector3, n: number) {
    super(f);
    this.view = 1e9;
    this.nearR = 1e9;
    for (let i = 0; i < n; i++) {
      // clustered sub-colonies inside a ~700 m diffuse region
      const cl = i % 7;
      const ca = (cl / 7) * TAU;
      this.units.push({
        p: new THREE.Vector3(Math.cos(ca) * 220 + (Math.random() - 0.5) * 140, (Math.random() - 0.5) * 120, Math.sin(ca) * 220 + (Math.random() - 0.5) * 140),
        v: new THREE.Vector3(), s: 0.6 + Math.random() * 1.6, ph: Math.random() * TAU,
      });
    }
  }

  async build() {
    const inst = await this.game.assets.instance('jup_colony');
    inst.root.updateMatrixWorld(true);
    inst.root.traverse((o) => {
      const src = o as THREE.Mesh;
      if (!src.isMesh) return;
      const geo = src.geometry.clone();
      geo.applyMatrix4(src.matrixWorld);
      const m = new THREE.InstancedMesh(geo, src.material, this.units.length);
      m.frustumCulled = false;
      m.castShadow = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.mesh.push(m);
      this.root.add(m);
    });
    this.f.root.add(this.root);
    return this;
  }

  update(dt: number) {
    const sky = this.sky;
    if (this.center.lengthSq() === 0) sky.ahead(1800, 500, 80, this.center);
    this.center.addScaledVector(this.wind, dt);
    // far behind: the wind has carried another part of the community into the path ahead
    _v.subVectors(this.center, sky.rp);
    if (_v.length() > 2600 && _v.dot(sky.head) < 0) sky.ahead(2400, (Math.random() - 0.5) * 1600, (Math.random() - 0.5) * 300, this.center);
    let nearest = Infinity;
    this.units.forEach((u, i) => {
      // each unit bobs on its own lift balance; neighbours drift together (soft links), shear pulls them apart
      u.v.y = Math.sin(this.t * 0.2 + u.ph) * 0.4;
      u.p.addScaledVector(u.v, dt);
      _w.copy(u.p).add(this.center);
      nearest = Math.min(nearest, _w.distanceTo(sky.rp));
      this._q.setFromAxisAngle(AX.y, u.ph + this.t * 0.02);
      this._m.compose(_w, this._q, this._s.setScalar(u.s));
      for (const m of this.mesh) m.setMatrixAt(i, this._m);
    });
    for (const m of this.mesh) m.instanceMatrix.needsUpdate = true;
    this.pos.copy(this.center);
    // flown through at speed: units in the intakes and smeared over the optics
    const fast = sky.rv.length() > 40;
    if (nearest < 12 && fast && !this.fouled && sky.craft) {
      this.fouled = true;
      sky.clog = Math.max(sky.clog, 6);
      sky.darkTarget = Math.max(sky.darkTarget, 0.35);
      this.game.notify('Flew through a colony stand — intakes fouled, canopy smeared. Slow down near them.', 'warn', 5);
      setTimeout(() => (sky.darkTarget = 0), 2500);
    }
    if (nearest > 60) this.fouled = false;
    if (seen(this.f, this.center, 4000, 0.6)) note(this.f, 'colony', 'sighting');
  }

  dispose() {
    super.dispose();
    for (const m of this.mesh) m.geometry.dispose();
  }
}

// ================================================================================================ 05 Voltdrifter
class Voltdrifter extends SheetFlyer {
  readonly species = 'voltdrifter';
  readonly id = 'voltdrifter';
  private cell = new THREE.Vector3();
  private read = 0;

  constructor(f: FaunaManager, sky: Sky, readonly index: number, readonly mites: AeromiteSwarm | null) {
    super(f, sky);
    this.view = 3000;
    this.nearR = 400;
    this.band = [-300, 300];
  }

  update(dt: number, near: boolean) {
    const sky = this.sky;
    if (this.cell.lengthSq() === 0) sky.ahead(1700, 1500, 50, this.cell);
    // hovering at a distance from the storm cell (the field gradient tells it where the storm is — and to keep away)
    const dart = this.mites && this.mites.center.distanceTo(this.pos) < 300 && Math.sin(this.t * 0.1 + this.index) > 0.7;
    if (dart) this.flyTo(this.mites!.center, 18, 0.8, dt, 8);
    else {
      _w.copy(this.cell).add(_v.set(Math.cos(this.t * 0.04 + this.index * 2) * 260, Math.sin(this.t * 0.07) * 40, Math.sin(this.t * 0.04 + this.index * 2) * 260));
      this.flyTo(_w, 9, 0.4, dt, 3);
    }
    this.corridor(dt);
    this.faceVel(dt, 0.6);
    this.size = this.heroicK;
    // the electro readout (instrument, not an aura): a rhythmic response in the field sensor when close
    const d = this.pos.distanceTo(sky.rp);
    this.read -= dt;
    if (d < 250 && this.read < 0) {
      this.read = 1.4;
      this.f.voice.clicks(this.pos, 6, 0.18);
      sky.once('volt_field', () => this.game.notify('Field sensor: rhythmic micro-discharges near the squid-like drifter — it is sensing the storm, not feeding on it.', 'info', 6));
    }
    if (seen(this.f, this.pos, 1500)) note(this.f, 'voltdrifter', 'sighting');
    this.placeQ();
    if (near) {
      const r = this.rig;
      r.reset();
      for (let k = 0; k < 10; k++) for (let i = 1; i <= 4; i++) r.rot(`arm${k}${i}`, k % 2 ? AX.x : AX.y, 0.14 * Math.sin(this.t * 1.1 - i * 0.7 + k));
    }
  }
}

// ================================================================================================ 06 Deepdiver
class Deepdiver extends SheetFlyer {
  readonly species = 'deepdiver';
  readonly id = 'deepdiver';
  constructor(f: FaunaManager, sky: Sky) {
    super(f, sky);
    this.view = 4000;
    this.nearR = 600;
    this.band = [-1100, -500];
  }

  update(dt: number, near: boolean) {
    const sky = this.sky;
    // a lower, denser corridor: it cruises far below the flight level and never rises into the cold upper layers
    sky.ahead(900, Math.sin(this.t * 0.02) * 700, -750, _w);
    this.flyTo(_w, 30, 0.2, dt, 3);
    this.corridor(dt, 2);
    this.faceVel(dt, 0.5);
    this.size = this.heroicK;
    if (seen(this.f, this.pos, 2500, 0.6)) note(this.f, 'deepdiver', 'sighting');
    this.placeQ();
    if (near) {
      const r = this.rig;
      r.reset();
      for (let i = 1; i <= 3; i++) r.rot(`sp${i}`, AX.y, 0.06 * i * Math.sin(this.t * 0.9 - i));
      r.rot('finL', AX.fwd, -0.12 * Math.sin(this.t * 0.9));
      r.rot('finR', AX.fwd, 0.12 * Math.sin(this.t * 0.9));
    }
  }
}

// ================================================================================================ 07 Gasgrazer
class Gasgrazer extends SheetFlyer {
  readonly species = 'gasgrazer';
  readonly id = 'gasgrazer';
  private callT = 20;
  constructor(f: FaunaManager, sky: Sky, readonly mites: AeromiteSwarm | null, readonly index: number) {
    super(f, sky);
    this.view = 6000;
    this.nearR = 900;
    this.band = [-400, 300];
  }

  update(dt: number, near: boolean) {
    const sky = this.sky;
    // follows the food front: its comb has to meet the swarm to feed
    const target = this.mites ? this.mites.center : sky.ahead(1500, -600, 0, _w);
    _w.copy(target).add(_v.set(-Math.sin(this.t * 0.01 + this.index) * 120, 10, Math.cos(this.t * 0.01 + this.index) * 120));
    this.flyTo(_w, 11, 0.12, dt, 1.5);
    this.corridor(dt);
    this.faceVel(dt, 0.3);
    this.size = this.heroicK;
    const feeding = !!this.mites && this.pos.distanceTo(this.mites.center) < 160;
    if (feeding && this.mites) this.mites.eat(this.pos, 18 * this.size, dt);
    this.callT -= dt;
    if (this.callT < 0) {
      this.callT = 25 + Math.random() * 25;
      if (this.pos.distanceTo(sky.rp) < 1500) this.f.voice.song(this.pos, 5, 0.35);
    }
    if (seen(this.f, this.pos, 3500)) note(this.f, 'gasgrazer', 'sighting');
    this.placeQ();
    if (near) {
      const r = this.rig;
      r.reset();
      for (let i = 1; i <= 4; i++) r.rot(`sp${i}`, AX.x, 0.04 * Math.sin(this.t * 0.4 - i * 0.7));
      r.rot('comb', AX.x, feeding ? 0.25 + 0.08 * Math.sin(this.t * 1.6) : 0.05);
    }
  }
}

// ================================================================================================ 08 Aeromite Swarm
class AeromiteSwarm extends Creature {
  readonly species = 'aeromite';
  readonly center = new THREE.Vector3();
  readonly P: Float32Array;
  private swarm: PreySwarm;
  private sparkle: THREE.Points;
  private dry = 0;

  constructor(f: FaunaManager, readonly sky: Sky, readonly wind: THREE.Vector3, n: number) {
    super(f);
    this.view = 1e9;
    this.nearR = 1e9;
    sky.ahead(1300, -500, 60, this.center);
    this.P = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) this.P.set([this.center.x + (Math.random() - 0.5) * 120, this.center.y + (Math.random() - 0.5) * 40, this.center.z + (Math.random() - 0.5) * 120], i * 3);
    // 3 cm animals: up close, instanced seeds; at range only their glints (points) — one per animal
    this.swarm = new PreySwarm(f, 'jup_aeromite', this.P, 4, { amp: 0.2, freq: 30, len: 0.02 });
    this.swarm.build().catch(() => undefined);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.P, 3));
    // a soft round glint (a radial falloff sprite), not a square
    const N = 32, px = new Uint8Array(N * N * 4);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const r = Math.hypot(i - N / 2 + 0.5, j - N / 2 + 0.5) / (N / 2);
      const a = Math.max(0, 1 - r) ** 2.2;
      px.set([255, 255, 255, Math.round(a * 255)], (j * N + i) * 4);
    }
    const glint = new THREE.DataTexture(px, N, N);
    glint.needsUpdate = true;
    this.sparkle = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffc860, size: 0.9, map: glint, sizeAttenuation: true, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.sparkle.frustumCulled = false;
    f.root.add(this.sparkle);
  }

  /** a grazer's comb passing through: the animals within r are filtered out (they regrow from the bloom) */
  eat(p: THREE.Vector3, r: number, dt: number) {
    const P = this.P;
    for (let i = 0; i < P.length; i += 3) {
      if (P[i + 1] < -1e5) continue;
      if (Math.hypot(P[i] - p.x, P[i + 1] - p.y, P[i + 2] - p.z) < r && Math.random() < dt * 2) P[i + 1] = -1e6;
    }
  }

  update(dt: number) {
    const sky = this.sky;
    this.center.addScaledVector(this.wind, dt);
    _v.subVectors(this.center, sky.rp);
    if (_v.length() > 2200 && _v.dot(sky.head) < 0) {
      // the wind brings another bloom into the path ahead
      sky.ahead(1600, (Math.random() - 0.5) * 1400, (Math.random() - 0.5) * 200, _w);
      _u.subVectors(_w, this.center);
      for (let i = 0; i < this.P.length; i += 3) {
        this.P[i] += _u.x;
        this.P[i + 1] += _u.y;
        this.P[i + 2] += _u.z;
      }
      this.center.copy(_w);
    }
    const P = this.P;
    this.dry += dt;
    for (let i = 0; i < P.length; i += 3) {
      if (P[i + 1] < -1e5) {
        // regrowth from the bloom
        if (Math.random() < dt * 0.02) P.set([this.center.x + (Math.random() - 0.5) * 60, this.center.y + (Math.random() - 0.5) * 20, this.center.z + (Math.random() - 0.5) * 60], i);
        continue;
      }
      // swirl round the bloom with the wind
      const dx = P[i] - this.center.x, dz = P[i + 2] - this.center.z;
      P[i] += (this.wind.x - dz * 0.03) * dt;
      P[i + 1] += Math.sin(this.dry * 1.3 + i) * 0.4 * dt;
      P[i + 2] += (this.wind.z + dx * 0.03) * dt;
    }
    (this.sparkle.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    const close = this.center.distanceTo(sky.rp) < 250;
    this.swarm.update(dt, close);
    if (seen(this.f, this.center, 1500, 0.6)) note(this.f, 'aeromite', 'sighting');
    this.pos.copy(this.center);
  }

  dispose() {
    super.dispose();
    this.swarm.dispose();
    this.sparkle.geometry.dispose();
    (this.sparkle.material as THREE.PointsMaterial).map?.dispose();
    (this.sparkle.material as THREE.Material).dispose();
    this.sparkle.removeFromParent();
  }
}

// ================================================================================================ 09 Stormhunter
class Stormhunter extends SheetFlyer {
  readonly species = 'stormhunter';
  readonly id = 'stormhunter';
  private homeY = 0;
  private jaw = 0;
  private side = 1;

  constructor(f: FaunaManager, sky: Sky) {
    super(f, sky);
    this.view = 6000;
    this.nearR = 900;
    this.setState('shadow');
    this.cooldown = 90;
  }

  update(dt: number, near: boolean) {
    const sky = this.sky;
    if (this.homeY === 0) this.homeY = sky.rp.y + 100;
    // its envelope: a bounded altitude band (not "all layers") — climb or dive out of it and it breaks off
    const outside = Math.abs(sky.rp.y - this.homeY) > 450;
    const d = this.pos.distanceTo(sky.rp);
    switch (this.state) {
      case 'shadow': {
        // shadowing the corridor off to the side, matching speed
        sky.ahead(150, this.side * 450, this.homeY - sky.rp.y, _w);
        this.flyTo(_w, Math.max(30, sky.rv.length() + 10), 0.35, dt, 8);
        this.jaw = damp(this.jaw, 0.05, 1, dt);
        if (this.cooldown <= 0 && !outside && sky.claim(this)) {
          this.setState('call');
          this.f.voice.screech(this.pos, 0.5);
          this.game.notify('A short resonant call off the beam — the Stormhunter has turned toward you. Climb or dive out of its corridor.', 'alert', 6);
        }
        break;
      }
      case 'call': {
        // the legible warning: it turns in, beak opening, for several seconds
        this.flyTo(sky.rp, 28, 0.4, dt, 6);
        this.jaw = damp(this.jaw, 0.8, 1.5, dt);
        if (outside) this.breakOff();
        else if (this.st > 5) this.setState('intercept');
        break;
      }
      case 'intercept': {
        _w.copy(sky.rp).addScaledVector(sky.rv, 1.5);
        this.flyTo(_w, Math.max(70, sky.rv.length() + 25), 0.9, dt, 20);
        this.jaw = damp(this.jaw, 1, 3, dt);
        if (d < 22 * this.size) {
          this.f.hurtRanger(0.15, 'hull');
          this.game.renderer.fx.shake = Math.max(this.game.renderer.fx.shake, 1.2);
          this.f.voice.screech(this.pos, 0.6);
          this.game.notify('The Stormhunter\'s beak raked the hull.', 'alert', 4);
          this.breakOff();
        } else if (outside || this.st > 14) this.breakOff();
        break;
      }
      case 'recover': {
        sky.ahead(-400, this.side * 900, this.homeY - sky.rp.y, _w);
        this.flyTo(_w, 35, 0.3, dt, 6);
        this.jaw = damp(this.jaw, 0.05, 1, dt);
        if (this.st > 25) this.setState('shadow');
        break;
      }
    }
    this.size = this.heroicK;
    this.faceVel(dt, 0.7);
    if (seen(this.f, this.pos, 3000)) note(this.f, 'stormhunter', 'sighting');
    this.placeQ();
    if (near) {
      const r = this.rig;
      r.reset();
      for (let i = 1; i <= 6; i++) r.rot(`sp${i}`, AX.y, 0.1 * (i / 6) * Math.sin(this.t * 1.0 - i * 0.7));
      r.rot('jaw', AX.x, 0.5 * this.jaw);
    }
  }

  private breakOff() {
    this.sky.done(this, 90);
    this.cooldown = 240;
    this.side = -this.side;
    this.setState('recover');
  }
}

// ================================================================================================ population
/** The sheet's nine in Jupiter's cloud layer (speculative-evolution mode; called by populateJupiter). */
export async function populateJupiterSheet(f: FaunaManager, sky: Sky, R: () => number, wind: THREE.Vector3) {
  const jobs: Promise<unknown>[] = [];
  const safe = (p: Promise<unknown>) => p.catch((e) => console.error('[jupiter sheet] species', e));
  const mites = new AeromiteSwarm(f, sky, wind, f.count(900));
  f.creatures.push(mites);
  for (let i = 0; i < f.count(3); i++) jobs.push(safe(f.add(new Stormskimmer(f, sky, i), 'jup_stormskimmer')));
  for (let i = 0; i < f.count(6); i++) {
    const j = new Skyjelly(f, sky, i > 1);
    sky.ahead(700 + R() * 2500, (R() - 0.5) * 1800, -80 + R() * 400, j.pos);
    j.wind.copy(wind);
    jobs.push(safe(f.add(j, 'jup_skyjelly')));
  }
  const sb = new Stormbeast(f, sky);
  sky.ahead(2800, -2600, -150, sb.pos);
  jobs.push(safe(f.add(sb, 'jup_stormbeast')));
  const col = new FloatingColony(f, sky, wind.clone().multiplyScalar(0.9), f.count(140));
  jobs.push(safe(col.build().then(() => f.creatures.push(col))));
  for (let i = 0; i < f.count(2); i++) {
    const v = new Voltdrifter(f, sky, i, mites);
    sky.ahead(1700, 1300 + i * 120, 40, v.pos);
    jobs.push(safe(f.add(v, 'jup_voltdrifter')));
  }
  const dd = new Deepdiver(f, sky);
  sky.ahead(1200, 400, -750, dd.pos);
  jobs.push(safe(f.add(dd, 'jup_deepdiver')));
  for (let i = 0; i < f.count(1); i++) {
    const g = new Gasgrazer(f, sky, mites, i);
    sky.ahead(1500, -800, 30, g.pos);
    jobs.push(safe(f.add(g, 'jup_gasgrazer')));
  }
  const sh = new Stormhunter(f, sky);
  sky.ahead(-300, 600, 100, sh.pos);
  jobs.push(safe(f.add(sh, 'jup_stormhunter')));
  await Promise.all(jobs);
  // the giants are silhouettes in the haze far more than close: out of the shadow map
  for (const c of f.creatures) if (['stormskimmer', 'skyjelly', 'stormbeast', 'gasgrazer', 'deepdiver', 'stormhunter', 'voltdrifter'].includes(c.species)) c.root.traverse((o) => (o.castShadow = false));
}
