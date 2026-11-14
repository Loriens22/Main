import * as THREE from 'three';
import { Creature, FaunaManager } from './Fauna';
import { AX } from './Rig';
import { Flyer, Sky } from './jupiter';
import { PreySwarm } from './prey';
import { SPECIES_EXPANSION } from '../../data/speciesExpansion';
import { JupiterAir, aeroStep, pursue, type AeroBody, type AeroState } from './jupiterAir';
import { siteMemory, type FaunaMemory } from './memory';
import { Impostor, ImpostorBaker } from '../../render/Impostors';

/**
 * Jupiter — the nine species of the player's 3×3 reference sheet (jupiter_panel_01 … 09; dossiers in
 * data/speciesExpansion.ts, models blender/assets/fauna_jupiter_sheet.py), met from Ranger 1 in the cloud layer.
 *
 * They FLY in the air of world/fauna/jupiterAir.ts: weight at 24.8 m/s², partial buoyancy, lift and drag against the
 * relative wind at the body, limited thrust where the species has any. Nothing is scripted to hover:
 *   Stormskimmer    a pure glider (no thrust): glides its lane and sinks; low in its corridor it finds a rising
 *                   convective core and circles in it to climb, then glides on — soaring, not flapping
 *   Skyjelly        near-neutral drifter: goes where the wind goes; a bell pulse is a few newtons. Ploughed through
 *                   at speed it tears, loses its gas and sinks out of the layer (a carcass the Deepdivers take)
 *   Stormbeast      very rare, at a storm wall: a long telegraph, one pass, then down into the deep
 *   Floating Colony a community of instanced units (near ones full detail, far ones the low LOD); each unit floats
 *                   at its own density level and rides the wind — updrafts lift parts of it and shear spreads it;
 *                   soft links pull it back together
 *   Voltdrifter     a jetting squid near a storm cell, reading the field (UI readout); darts for aeromites
 *   Deepdiver       armoured cruiser of a LOWER corridor (500–1100 m below the cruise level): descend to meet it;
 *                   it ambushes carcasses sinking through its corridor
 *   Gasgrazer       a gas-buoyed comb-mouthed grazer following the aeromite swarm
 *   Aeromite Swarm  golden seeds carried on the convection (instanced, with glints)
 *   Stormhunter     shadows, calls, one telegraphed intercept, then breaks off — never out of its altitude
 *                   envelope; it remembers failed intercepts and a craft that never threatens it (memory.ts)
 * Corridors are ABSOLUTE heights about the cloud-cruise level, so climbing or diving really leaves or enters a
 * species' layer. Settings → Heroic Jupiter scale shows the poster sizes (Creative); the simulation size is the default.
 */
const TAU = Math.PI * 2;
const _v = new THREE.Vector3();
const _u = new THREE.Vector3();
const _w = new THREE.Vector3();
const _g = new THREE.Vector3();
const _a = new THREE.Vector3();
const _e = new THREE.Euler();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const clamp = THREE.MathUtils.clamp;
const damp = THREE.MathUtils.damp;

/** codex evidence (flags bio:<id>:<key>) for a species of the sheet */
function note(f: FaunaManager, id: string, key: string, text?: string) {
  const g = f.game;
  const k = `bio:${id}:${key}`;
  if (g.flag(k)) return false;
  const info = SPECIES_EXPANSION[id];
  const t = text ?? info?.evidence[key] ?? key;
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

function hears(f: FaunaManager, p: THREE.Vector3, r: number) {
  return f.game.camera.getWorldPosition(_w).distanceTo(p) < r;
}

/** a Flyer of the sheet: aerodynamic flight in its own corridor of absolute height */
abstract class SheetFlyer extends Flyer {
  abstract readonly id: string;
  /** the corridor (m about the cloud-cruise level — absolute heights) */
  band: [number, number] = [-300, 300];
  abstract readonly body: AeroBody;
  readonly aero: AeroState = { bank: 0, CL: 0, V: 0, rho: 0, w: 0, T: 0 };
  protected aPitch = 0;
  protected aRoll = 0;
  /** seconds to the next call */
  protected callT = 5 + Math.random() * 20;

  constructor(f: FaunaManager, sky: Sky, readonly air: JupiterAir) {
    super(f, sky);
  }

  get heroicK() {
    return this.f.settings.heroic ? SPECIES_EXPANSION[this.id]?.heroic ?? 1 : 1;
  }

  /** the corridor's floor and ceiling (world y) */
  get lo() {
    return this.air.refY + this.band[0];
  }
  get hi() {
    return this.air.refY + this.band[1];
  }

  /**
   * fly toward `goal` at airspeed `wantV` by forces (sub-stepped for stability); the goal's height is held inside
   * the corridor — where the body's lift and thrust allow
   */
  protected fly(goal: THREE.Vector3, wantV: number, dt: number, thrustK = 1) {
    _g.copy(goal);
    _g.y = clamp(_g.y, this.lo, this.hi);
    const n = Math.max(1, Math.ceil(dt / 0.05));
    for (let i = 0; i < n; i++) aeroStep(this.body, this.air, this.pos, this.vel, _g, wantV, dt / n, thrustK, this.aero);
    this.speed = this.aero.V;
    return this.aero;
  }

  /** orient along the airflow, rolled by the bank the flight model used */
  protected faceAir(dt: number, bankK = 1) {
    const w = this.air.wind(this.pos, _a);
    _v.subVectors(this.vel, w);
    const sp = _v.length();
    if (sp < 0.5) return;
    this.yaw = Math.atan2(-_v.x, -_v.z);
    this.aPitch = damp(this.aPitch, Math.asin(clamp(_v.y / sp, -1, 1)), 3, dt);
    this.aRoll = damp(this.aRoll, -this.aero.bank * bankK, 3, dt);
    this.q.setFromEuler(_e.set(this.aPitch, this.yaw, this.aRoll, 'YXZ'));
  }

  /** a point `d` ahead of the Ranger, `lat` to the side, at corridor height y (m about the cruise level) */
  protected at(d: number, lat: number, y: number, out: THREE.Vector3) {
    return this.sky.ahead(d, lat, this.air.refY + y - this.sky.rp.y, out);
  }

  /** far behind the flight path: another animal of the kind is met ahead (carried on the wind, out of sight) */
  protected recycle(far: number, ahead: number, lat: number, y: number, v0: number) {
    if (!this.behind(far)) return false;
    this.at(ahead, lat, y, this.pos);
    this.air.wind(this.pos, this.vel);
    this.vel.addScaledVector(_v.set(-this.sky.head.z, 0, this.sky.head.x).multiplyScalar(Math.sign(lat) || 1), -v0);
    return true;
  }

  /** the Ranger is inside this corridor (with a margin) */
  protected rangerIn(margin = 0) {
    const y = this.sky.rp.y;
    return y > this.lo - margin && y < this.hi + margin;
  }
}

// ================================================================================================ 01 Stormskimmer
class Stormskimmer extends SheetFlyer {
  readonly species = 'stormskimmer';
  readonly id = 'stormskimmer';
  /** a glider: 600 kg on 120 m² — no thrust at all; ~2–3 m/s sink in still air, climbs in cores */
  readonly body: AeroBody = { m: 600, S: 120, CLmax: 1.4, CD0: 0.02, k: 0.04, buoy: 0, T: 0, bank: 0.7 };
  private core = new THREE.Vector3();
  private orbit = Math.random() * TAU;
  private lane = new THREE.Vector3();
  private struck = false;

  constructor(f: FaunaManager, sky: Sky, air: JupiterAir, readonly index: number) {
    super(f, sky, air);
    this.view = 6000;
    this.nearR = 900;
    this.band = [100, 750];
    this.setState('glide');
  }

  update(dt: number, near: boolean) {
    const sky = this.sky;
    const air = this.air;
    if (this.lane.lengthSq() === 0 || this.recycle(2600, 1600 + this.index * 150, 1200 + this.index * 60, 450 + this.index * 30, 40)) {
      if (this.lane.lengthSq() === 0) {
        this.at(1600 + this.index * 150, 1200 + this.index * 60, 450 + this.index * 30, this.pos);
        air.wind(this.pos, this.vel).addScaledVector(_v.set(sky.head.z, 0, -sky.head.x), 40);
      }
      // the lane: across the flight path (a string crossing the zonal boundary)
      this.at(1800, -3000, 500, this.lane);
      this.setState('glide');
    }
    switch (this.state) {
      case 'glide': {
        // along the lane at best-glide speed, holding what height it can: the polar sets the sink (≈2–3 m/s)
        this.fly(_w.copy(this.lane).setY(this.pos.y), 40, dt);
        if (this.pos.y < this.lo + 90) {
          air.core(this.pos.x, this.pos.z, this.core);
          this.setState('seek');
        }
        break;
      }
      case 'seek': {
        // to the nearest rising core
        this.fly(_w.set(this.core.x, this.pos.y, this.core.z), 38, dt);
        if (Math.hypot(this.pos.x - this.core.x, this.pos.z - this.core.z) < 200) this.setState('thermal');
        if (this.st > 90) this.setState('glide');
        break;
      }
      case 'thermal': {
        // circling in the core (a tight banked orbit), gaining height while the air rises faster than it sinks
        this.orbit += dt * 0.32;
        this.fly(_w.set(this.core.x + Math.cos(this.orbit) * 140, this.hi, this.core.z + Math.sin(this.orbit) * 140), 36, dt);
        if (this.aero.w > 2.5 && this.vel.y > 0.3 && seen(this.f, this.pos, 2200)) note(this.f, 'stormskimmer', 'soar', 'Seen circling in a rising cell, climbing without a wingbeat — then gliding on along its lane.');
        if (this.pos.y > this.hi - 60 || this.st > 150) this.setState('glide');
        break;
      }
    }
    this.size = this.heroicK;
    this.faceAir(dt, 1);
    // rammed at close range: a panicked wingtip strike, then a dive away
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
      if (this.state === 'glide' && this.vel.y < -1 && seen(this.f, this.pos, 1500)) note(this.f, 'stormskimmer', 'glide');
    }
    this.callT -= dt;
    if (this.callT < 0) {
      this.callT = 10 + Math.random() * 8;
      if (hears(this.f, this.pos, 700)) this.f.voice.skimmerRush(this.pos, 0.22);
    }
    this.placeQ();
    if (near) {
      const r = this.rig;
      r.reset();
      // the membranes flex with the load (lift coefficient) and a slow travelling ripple; tips lag; the whip sways
      const load = clamp(this.aero.CL / this.body.CLmax, 0, 1);
      for (const [s, sx] of [['L', -1], ['R', 1]] as const) {
        r.rot(`wing${s}1`, AX.fwd, sx * (0.05 * load + 0.04 * Math.sin(this.t * 0.8 + this.index)));
        r.rot(`wing${s}2`, AX.fwd, sx * (0.1 * load + 0.08 * Math.sin(this.t * 0.8 + this.index - 0.8)));
      }
      for (let i = 1; i <= 3; i++) r.rot(`tail${i}`, AX.y, 0.1 * Math.sin(this.t * 1.1 - i * 0.7) + 0.15 * this.aRoll * (i / 3));
    }
  }
}

// ================================================================================================ 02 Skyjelly
class Skyjelly extends SheetFlyer {
  readonly species = 'skyjelly';
  readonly id = 'skyjelly';
  /** near-neutral: 120 kg, all but 0.5 % of it carried by its gas; a bell pulse of a few tens of newtons */
  readonly body: AeroBody = { m: 120, S: 30, CLmax: 0, CD0: 1.2, k: 0, buoy: 0.995, T: 25, bank: 0 };
  private stuck = false;
  /** torn by the Ranger: the gas lost, it sinks out of the layer (s since) */
  torn = -1;
  private homeY = 0;

  constructor(f: FaunaManager, sky: Sky, air: JupiterAir, readonly young: boolean) {
    super(f, sky, air);
    this.view = 3000;
    this.nearR = 400;
    this.band = [-250, 550];
    this.homeY = -100 + Math.random() * 500;
  }

  update(dt: number, near: boolean) {
    const sky = this.sky;
    const pulse = Math.max(0, Math.sin(this.t * 0.9));
    this.size = (this.young ? 0.35 : 1) * this.heroicK;
    if (this.torn >= 0) {
      // a carcass: heavier than the gas round it now; it falls toward the dense lower layers
      this.torn += dt;
      this.body.buoy = 0.85;
      this.body.T = 0;
      _w.copy(this.pos).setY(this.pos.y - 1000);
      const n = Math.max(1, Math.ceil(dt / 0.05));
      for (let i = 0; i < n; i++) aeroStep(this.body, this.air, this.pos, this.vel, _w, 0, dt / n, 0, this.aero);
      if (this.pos.y < this.air.refY - 1500 || this.torn > 240) this.revive();
    } else {
      // it goes where the air goes; the pulse only trims its height toward its preferred level
      const want = this.air.refY + this.homeY;
      this.body.T = 25 * pulse;
      this.fly(_w.copy(this.pos).add(_v.set(0, clamp(want - this.pos.y, -50, 50), 0)).addScaledVector(this.air.wind(this.pos, _a), 10), 0.5, dt);
      this.recycle(2200, 1600 + Math.random() * 1500, (Math.random() - 0.5) * 2000, this.homeY, 0);
      // ploughing through at speed: the bell tears (and its sticky tendrils wrap the intakes)
      const d = this.pos.distanceTo(sky.rp);
      if (d < 9 * this.size + 6 && sky.craft && !this.stuck) {
        this.stuck = true;
        sky.clog = Math.max(sky.clog, 4);
        this.game.notify('Skyjelly tendrils across the intakes — thrust reduced until they burn off.', 'warn', 4);
        if (sky.rv.length() > 50) {
          this.torn = 0;
          this.f.voice.jellyFlutter(this.pos, 0.2);
          if (seen(this.f, this.pos, 600, 1.2)) note(this.f, 'skyjelly', 'torn', 'Torn by the craft at speed: the bell lost its gas and sank out of the layer — food for the Deepdivers below.');
        }
      }
      if (d > 40) this.stuck = false;
    }
    if (seen(this.f, this.pos, 1800)) {
      note(this.f, 'skyjelly', 'sighting');
      if (this.t > 30 && this.torn < 0 && seen(this.f, this.pos, 600)) note(this.f, 'skyjelly', 'drift');
    }
    this.callT -= dt;
    if (this.callT < 0) {
      this.callT = 4 + Math.random() * 4;
      if (this.torn < 0 && hears(this.f, this.pos, 160)) this.f.voice.jellyFlutter(this.pos, 0.05);
    }
    this.q.setFromAxisAngle(AX.y, this.t * 0.03);
    if (this.torn >= 0) this.q.multiply(_q.setFromAxisAngle(AX.x, Math.min(1.2, this.torn * 0.1)));
    this.placeQ();
    const sag = this.torn >= 0 ? Math.min(1, this.torn / 8) : 0;
    this.root.scale.set(this.size * (1 + 0.04 * pulse) * (1 - 0.15 * sag), this.size * (1 - 0.05 * pulse) * (1 - 0.4 * sag), this.size * (1 + 0.04 * pulse) * (1 - 0.15 * sag));
    if (near) {
      const r = this.rig;
      r.reset();
      for (let b = 0; b < 8; b++) for (let i = 1; i <= 4; i++) r.rot(`tent${b}${i}`, b % 2 ? AX.x : AX.fwd, 0.08 * Math.sin(this.t * 0.7 - i * 0.6 + b) + (sag ? 0.35 * sag * (i === 1 ? -1 : 0.3) : 0));
      for (let k = 0; k < 4; k++) for (let i = 1; i <= 3; i++) r.rot(`oral${k}${i}`, AX.x, 0.1 * Math.sin(this.t * 0.5 + k - i * 0.5));
    }
  }

  /** gone below: another young one drifts in ahead (the population is replenished from the layer) */
  private revive() {
    this.torn = -1;
    this.body.buoy = 0.995;
    this.at(2200 + Math.random() * 1200, (Math.random() - 0.5) * 2000, this.homeY, this.pos);
    this.air.wind(this.pos, this.vel);
  }
}

// ================================================================================================ 03 Stormbeast
class Stormbeast extends SheetFlyer {
  readonly species = 'stormbeast';
  readonly id = 'stormbeast';
  /** 6 t, gas-buoyed to 70 %, a long body planing on the storm's winds, strong muscular thrust */
  readonly body: AeroBody = { m: 6000, S: 400, CLmax: 0.8, CD0: 0.04, k: 0.06, buoy: 0.7, T: 60000, bank: 0.6 };
  private wall = new THREE.Vector3();
  private ang = 0;
  private jaw = 0;
  private wave = 0;

  constructor(f: FaunaManager, sky: Sky, air: JupiterAir) {
    super(f, sky, air);
    this.view = 9000;
    this.nearR = 1500;
    this.band = [-700, 250];
    this.setState('cruise');
  }

  update(dt: number, near: boolean) {
    const sky = this.sky;
    if (this.wall.lengthSq() === 0 || (this.state === 'cruise' && this.wall.distanceTo(sky.rp) > 7000)) this.at(2800, -2200, -150, this.wall);
    this.size = this.heroicK;
    const d = this.pos.distanceTo(sky.rp);
    switch (this.state) {
      case 'cruise': {
        // surging along the storm's peripheral shear lane (a wide arc), mostly half-hidden
        this.ang += dt * 0.012;
        _w.set(this.wall.x + Math.cos(this.ang) * 900, this.wall.y + Math.sin(this.ang * 3) * 80, this.wall.z + Math.sin(this.ang) * 900);
        this.fly(_w, 45, dt);
        this.jaw = damp(this.jaw, 0.1, 1, dt);
        if (d < 320 * this.size && this.cooldown <= 0 && this.rangerIn(150) && sky.claim(this)) {
          this.setState('telegraph');
          this.f.voice.beastRumble(this.pos, 0.6, true);
          this.game.notify('Low pressure pulse from the storm wall — something enormous turning toward you.', 'alert', 5);
        }
        break;
      }
      case 'telegraph': {
        // a long, legible build-up: turn, the forebody folds, the maw opens
        this.fly(sky.rp, 22, dt, 0.4);
        this.jaw = damp(this.jaw, 1, 1.2, dt);
        if (this.st > 6) this.setState('pass');
        if (d > 700 || !this.rangerIn(250)) {
          sky.done(this, 60);
          this.setState('cruise');
        }
        break;
      }
      case 'pass': {
        this.fly(_w.copy(sky.rp).addScaledVector(sky.rv, 1), 95, dt, 1);
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
        // gone into the deep, back to the storm's edge much later (its corridor reaches far below the cruise level)
        _w.copy(this.pos).add(_v.set(0, -500, 0)).addScaledVector(sky.head, -300);
        this.fly(_w, 70, dt, 0.6);
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
    this.callT -= dt;
    if (this.callT < 0) {
      this.callT = 25 + Math.random() * 20;
      if (hears(this.f, this.pos, 4000)) this.f.voice.beastRumble(this.pos, 0.4);
    }
    this.faceAir(dt, 0.7);
    this.placeQ();
    if (near) {
      const r = this.rig;
      r.reset();
      // the long body undulates (stronger with speed), the neck folding in the telegraph
      this.wave += dt * (0.5 + this.speed * 0.012);
      for (let i = 1; i <= 7; i++) r.rot(`sp${i}`, AX.y, 0.1 * (i / 7) * Math.sin(this.wave * TAU * 0.25 - i * 0.7));
      if (this.state === 'telegraph') r.rot('sp1', AX.x, -0.15 * Math.min(1, this.st / 3));
      r.rot('jaw', AX.x, 0.5 * this.jaw - 0.25);
    }
  }
}

// ================================================================================================ 04 Floating Colony
/** a static model with its Blender LODs (<mesh>_lod1/2) and a far impostor — for the colony's lobes */
class LodModel {
  readonly lods: THREE.Object3D[][] = [[], [], []];
  impostor: Impostor | null = null;
  level = -1;

  constructor(readonly root: THREE.Object3D, readonly key: string, hide?: (m: THREE.Mesh) => boolean) {
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      if (hide?.(m)) {
        m.visible = false;
        return;
      }
      const lv = /_lod(\d)/.exec(m.name) ?? /_lod(\d)/.exec(m.parent?.name ?? '');
      this.lods[lv ? Math.min(2, Number(lv[1])) : 0].push(m);
      m.castShadow = false;
    });
    this.set(0);
  }

  set(level: number) {
    let l = level === 3 && !this.impostor ? 2 : level;
    if (l < 3) while (l > 0 && !this.lods[l].length) l--;
    if (l === this.level) return;
    this.level = l;
    this.lods.forEach((ms, i) => ms.forEach((m) => (m.visible = i === l)));
    if (this.impostor) this.impostor.mesh.visible = l === 3;
  }

  makeImpostor(baker: ImpostorBaker, parent: THREE.Object3D) {
    if (this.impostor) return;
    const was = this.level;
    const atlas = baker.bake(this.key, this.root, () => this.lods.forEach((ms, i) => ms.forEach((m) => (m.visible = i === 0))), () => {
      this.level = -1;
      this.set(Math.max(0, Math.min(was, 2)));
    });
    this.impostor = new Impostor(atlas);
    parent.add(this.impostor.mesh);
  }
}

/**
 * panel 04's great floating colony — as a COMMUNITY: a cumulus mass ~450 m across built of fourteen lobes, each a
 * separate organism floating at its own density level and riding its own air (a rising core lifts part of the mass,
 * shear leans it), held together by soft links that pull the lobes back toward their places — no rigid body. Long
 * tendrils hang hundreds of metres below. Around it drift small satellite colonies (the instanced units).
 */
class FloatingColony extends Creature {
  readonly species = 'colony';
  /** lobes of the main mass: model, offset from the centre (current / rest), scale */
  private lobes: { m: LodModel; p: THREE.Vector3; rest: THREE.Vector3; s: number; ph: number; q: THREE.Quaternion }[] = [];
  /** satellite units (instanced, three LOD tiers) */
  private tiers: THREE.InstancedMesh[][] = [[], [], []];
  private units: { p: THREE.Vector3; rest: THREE.Vector3; s: number; ph: number }[] = [];
  readonly center = new THREE.Vector3();
  private cv = new THREE.Vector3();
  private fouled = false;
  private hissT = 2;
  /** the radius of the main mass (m) — for the tools and the codex size estimate */
  readonly massR = 230;

  constructor(f: FaunaManager, readonly sky: Sky, readonly air: JupiterAir, n: number) {
    super(f);
    this.view = 1e9;
    this.nearR = 1e9;
    this.bodyR = this.massR;
    // satellite colonies: five small clusters round the mass, and a few loose units
    for (let i = 0; i < n; i++) {
      const cl = i % 6;
      const ca = (cl / 5) * TAU + 0.4;
      const far = cl === 5 ? 380 + Math.random() * 500 : 520 + (cl % 2) * 220;
      const spread = cl === 5 ? 260 : 26;
      const p = new THREE.Vector3(Math.cos(ca) * far + (Math.random() - 0.5) * spread, (cl - 2) * 40 + (Math.random() - 0.5) * spread * 0.6, Math.sin(ca) * far + (Math.random() - 0.5) * spread);
      this.units.push({ p, rest: p.clone(), s: (cl === 5 ? 0.8 : 1.6) + Math.random() * 1.6, ph: Math.random() * TAU });
    }
  }

  /** distance from p to the nearest part of the community (lobes or units), m */
  distTo(p: THREE.Vector3) {
    let d = Infinity;
    for (const l of this.lobes) d = Math.min(d, _w.copy(l.p).add(this.center).distanceTo(p) - 5 * l.s);
    for (const u of this.units) d = Math.min(d, _w.copy(u.p).add(this.center).distanceTo(p) - 2 * u.s);
    return Math.max(0, d);
  }

  async build() {
    // the mass, a cauliflower dome wider than tall: a bottom layer of big lobes trailing the tendrils, then layers
    // of lobes without tendrils, each sitting half-buried in the ones below (a fused surface, not stacked caps)
    const layout: [number, number, number, number, boolean][] = [];
    const ring = (n: number, r: number, y: number, s0: number, s1: number, tendrils: boolean, ph = 0) => {
      for (let k = 0; k < n; k++) layout.push([Math.cos((k / n) * TAU + ph) * r * (0.9 + 0.2 * Math.random()), y + (Math.random() - 0.5) * 14, Math.sin((k / n) * TAU + ph) * r * (0.9 + 0.2 * Math.random()), s0 + Math.random() * (s1 - s0), tendrils]);
    };
    const phone = this.f.lodK < 0.7;
    ring(phone ? 5 : 7, 125, 0, 12, 14, true);
    layout.push([0, 8, 0, 16, true]);
    ring(phone ? 4 : 6, 88, 52, 11.5, 13, false, 0.4);
    ring(phone ? 2 : 4, 48, 100, 10.5, 12, false, 1.1);
    if (!phone) ring(2, 18, 140, 10, 11, false, 2.0);
    layout.push([0, 168, 0, 9.5, false]);
    for (const [x, y, z, s, tendrils] of layout) {
      const inst = await this.game.assets.instance('jup_colony_lobe');
      const m = new LodModel(inst.root, tendrils ? 'jup_colony_lobe' : 'jup_colony_lobe_top', tendrils ? undefined : (mesh) => {
        const mat = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.Material;
        return mat.name.startsWith('co_thread');
      });
      this.root.add(inst.root);
      const p = new THREE.Vector3(x, y, z);
      this.lobes.push({ m, p, rest: p.clone(), s, ph: Math.random() * TAU, q: new THREE.Quaternion().setFromAxisAngle(AX.y, Math.random() * TAU) });
    }
    // the satellite units, instanced in three tiers
    const unit = await this.game.assets.instance('jup_colony');
    unit.root.updateMatrixWorld(true);
    unit.root.traverse((o) => {
      const src = o as THREE.Mesh;
      if (!src.isMesh) return;
      const lv = /_lod(\d)/.exec(src.name) ?? /_lod(\d)/.exec(src.parent?.name ?? '');
      const lod = lv ? Math.min(2, Number(lv[1])) : 0;
      const geo = src.geometry.clone();
      geo.applyMatrix4(src.matrixWorld);
      const im = new THREE.InstancedMesh(geo, src.material, this.units.length);
      im.frustumCulled = false;
      im.castShadow = false;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.tiers[lod].push(im);
      this.root.add(im);
    });
    if (!this.tiers[1].length) this.tiers[1] = this.tiers[0];
    if (!this.tiers[2].length) this.tiers[2] = this.tiers[1];
    this.f.root.add(this.root);
    return this;
  }

  update(dt: number) {
    const sky = this.sky;
    const air = this.air;
    if (this.center.lengthSq() === 0) sky.ahead(2400, 700, air.refY + 60 - sky.rp.y, this.center);
    // the community's centre rides the air (vertical: lifted by a core, pulled back to its level by buoyancy)
    const wc = air.wind(this.center, _a);
    const wcx = wc.x, wcy = wc.y, wcz = wc.z;
    this.cv.set(wcx, 0.35 * wcy + 0.02 * (air.refY + 60 - this.center.y), wcz);
    this.center.addScaledVector(this.cv, dt);
    // far behind: the wind has carried another part of the community into the path ahead
    _v.subVectors(this.center, sky.rp);
    if (_v.length() > 3600 && _v.dot(sky.head) < 0) sky.ahead(3200, (Math.random() - 0.5) * 2200, air.refY + 60 - sky.rp.y, this.center);
    const cam = this.game.camera.getWorldPosition(_s);
    const K = this.f.lodK;
    const light = this.f.host.light?.();
    let nearest = Infinity, reach = 0;
    let baked = false;
    // each lobe floats on its own: shear and updrafts displace it, the soft links (springs to its place) pull back
    for (const l of this.lobes) {
      _w.copy(l.p).add(this.center);
      const wu = air.wind(_w, _a);
      l.p.x += ((wu.x - wcx) * 0.08 + (l.rest.x - l.p.x) * 0.004) * dt;
      l.p.z += ((wu.z - wcz) * 0.08 + (l.rest.z - l.p.z) * 0.004) * dt;
      l.p.y += (0.3 * (wu.y - wcy) + (l.rest.y - l.p.y) * 0.015 + Math.sin(this.t * 0.07 + l.ph) * 0.4) * dt;
      _w.copy(l.p).add(this.center);
      const r = 6 * l.s;
      const dc = _w.distanceTo(cam);
      const dr = _w.distanceTo(sky.rp) - r;
      if (dr < nearest) {
        nearest = dr;
        reach = r;
      }
      const root = l.m.root;
      root.position.copy(_w);
      root.quaternion.copy(l.q).multiply(_q.setFromAxisAngle(AX.y, Math.sin(this.t * 0.01 + l.ph) * 0.1));
      root.scale.setScalar(l.s);
      const lvl = dc < r * 4 * K ? 0 : dc < r * 13 * K ? 1 : dc < r * 40 * K ? 2 : 3;
      if (lvl === 3 && !l.m.impostor && !baked) {
        this.f.impostors ??= new ImpostorBaker(this.game.renderer.gl, K < 0.7 ? 96 : 128);
        l.m.makeImpostor(this.f.impostors, this.f.root);
        baked = true;
      }
      l.m.set(lvl);
      if (l.m.level === 3 && l.m.impostor && light) l.m.impostor.update(root.position, root.quaternion, l.s, this.game.camera, light);
    }
    // the satellites: each tier draws only its own units (packed at the front, instance count set) — hidden
    // instances would still cost their full vertex work
    const filled = [0, 0, 0];
    this.units.forEach((u) => {
      _w.copy(u.p).add(this.center);
      const wu = air.wind(_w, _a);
      u.p.x += ((wu.x - wcx) * 0.1 + (u.rest.x - u.p.x) * 0.003) * dt;
      u.p.z += ((wu.z - wcz) * 0.1 + (u.rest.z - u.p.z) * 0.003) * dt;
      u.p.y += (0.35 * (wu.y - wcy) + (u.rest.y - u.p.y) * 0.02 + Math.sin(this.t * 0.2 + u.ph) * 0.3) * dt;
      _w.copy(u.p).add(this.center);
      const dc = _w.distanceTo(cam);
      _q.setFromAxisAngle(AX.y, u.ph + this.t * 0.02);
      _m.compose(_w, _q, _g.setScalar(u.s));
      let lvl = dc < 40 * u.s * K ? 0 : dc < 160 * u.s * K ? 1 : 2;
      while (lvl > 0 && this.tiers[lvl] === this.tiers[lvl - 1]) lvl--;
      const idx = filled[lvl]++;
      for (const m of this.tiers[lvl]) m.setMatrixAt(idx, _m);
    });
    for (let l = 0; l < 3; l++) {
      if (l > 0 && this.tiers[l] === this.tiers[l - 1]) continue;
      for (const m of this.tiers[l]) {
        m.count = filled[l];
        m.visible = filled[l] > 0;
      }
    }
    for (const set of new Set(this.tiers)) for (const m of set) m.instanceMatrix.needsUpdate = true;
    this.pos.copy(this.center);
    // flown into the mass at speed: lobe tissue in the intakes and smeared over the optics; inside it: slowed
    const fast = sky.rv.length() > 40;
    if (nearest < 0 && fast && !this.fouled && sky.craft) {
      this.fouled = true;
      sky.clog = Math.max(sky.clog, 8);
      sky.darkTarget = Math.max(sky.darkTarget, 0.55);
      this.game.notify('Flew into the colony mass — intakes fouled, canopy smeared. Slow down near it, or go round.', 'warn', 5);
      setTimeout(() => (sky.darkTarget = 0), 3000);
    }
    if (nearest > reach * 0.3) this.fouled = false;
    this.hissT -= dt;
    if (this.hissT < 0) {
      this.hissT = 3 + Math.random() * 3;
      if (nearest < 300) this.f.voice.colonyHiss(this.center, 0.08);
    }
    if (seen(this.f, this.center, 6000, 0.6)) note(this.f, 'colony', 'sighting');
  }

  dispose() {
    super.dispose();
    for (const m of new Set(this.tiers.flat())) m.geometry.dispose();
    for (const l of this.lobes) l.m.impostor?.dispose();
  }
}

// ================================================================================================ 05 Voltdrifter
class Voltdrifter extends SheetFlyer {
  readonly species = 'voltdrifter';
  readonly id = 'voltdrifter';
  /** a jetting squid: 300 kg, 85 % gas-buoyed, fins for steering, a 6 kN jet */
  readonly body: AeroBody = { m: 300, S: 25, CLmax: 0.6, CD0: 0.1, k: 0.1, buoy: 0.85, T: 6000, bank: 0.9 };
  private cell = new THREE.Vector3();
  private read = 0;
  private jet = 0;

  constructor(f: FaunaManager, sky: Sky, air: JupiterAir, readonly index: number, readonly mites: AeromiteSwarm | null) {
    super(f, sky, air);
    this.view = 3000;
    this.nearR = 400;
    this.band = [-300, 300];
  }

  update(dt: number, near: boolean) {
    const sky = this.sky;
    if (this.cell.lengthSq() === 0 || this.cell.distanceTo(sky.rp) > 4500) this.at(1700, 1500, 50, this.cell);
    // keeping a distance from the storm cell (the field gradient tells it where the storm is — and to keep off)
    const dart = this.mites && this.mites.center.distanceTo(this.pos) < 300 && Math.sin(this.t * 0.1 + this.index) > 0.7;
    if (dart) {
      this.fly(this.mites!.center, 22, dt);
      this.jet = 1;
    } else {
      _w.copy(this.cell).add(_v.set(Math.cos(this.t * 0.04 + this.index * 2) * 260, Math.sin(this.t * 0.07) * 40, Math.sin(this.t * 0.04 + this.index * 2) * 260));
      this.fly(_w, 10, dt);
      this.jet = damp(this.jet, this.aero.T / this.body.T, 3, dt);
    }
    if (this.behind(2600)) {
      this.cell.set(0, 0, 0);
      this.at(1500, 1300 + this.index * 120, 40, this.pos);
      this.vel.set(0, 0, 0);
    }
    this.size = this.heroicK;
    // the electro readout (instrument, not an aura): a rhythmic response in the field sensor when close
    const d = this.pos.distanceTo(sky.rp);
    this.read -= dt;
    if (d < 250 && this.read < 0) {
      this.read = 1.4;
      this.f.voice.voltClicks(this.pos, 0.15);
      sky.once('volt_field', () => this.game.notify('Field sensor: rhythmic micro-discharges near the squid-like drifter — it is sensing the storm, not feeding on it.', 'info', 6));
    }
    if (seen(this.f, this.pos, 1500)) note(this.f, 'voltdrifter', 'sighting');
    this.faceAir(dt, 0.6);
    this.placeQ();
    if (near) {
      const r = this.rig;
      r.reset();
      // arms trail and coil; the mantle squeezes on each jet pulse
      for (let k = 0; k < 10; k++) for (let i = 1; i <= 5; i++) r.rot(`arm${k}${i}`, k % 2 ? AX.x : AX.y, 0.12 * Math.sin(this.t * 1.1 - i * 0.7 + k) * (1 - 0.5 * this.jet) - 0.05 * this.jet * i);
      r.scale('mantle', 1 - 0.06 * this.jet * Math.max(0, Math.sin(this.t * 6)));
    }
  }
}

// ================================================================================================ 06 Deepdiver
class Deepdiver extends SheetFlyer {
  readonly species = 'deepdiver';
  readonly id = 'deepdiver';
  /** 4 t of armour and muscle, 55 % gas-buoyed: it must swim fast (≈70 m/s) to hold its height on its fins */
  readonly body: AeroBody = { m: 4000, S: 140, CLmax: 1.0, CD0: 0.05, k: 0.06, buoy: 0.55, T: 30000, bank: 0.5 };
  prey: Skyjelly | null = null;
  private run = { mode: 'in' as 'in' | 'out' };
  private chaseT = 0;
  /** carcasses taken (a count for the field record and the tests) */
  meals = 0;

  constructor(f: FaunaManager, sky: Sky, air: JupiterAir, readonly jellies: Skyjelly[]) {
    super(f, sky, air);
    this.view = 4000;
    this.nearR = 600;
    this.band = [-1100, -500];
  }

  update(dt: number, near: boolean) {
    const sky = this.sky;
    // a carcass sinking through its corridor: a short ambush climb, the grab, a glide back down
    if (!this.prey) this.prey = this.jellies.find((j) => j.torn >= 0 && j.pos.y < this.hi + 150 && j.pos.distanceTo(this.pos) < 1500) ?? null;
    if (this.prey && this.prey.torn < 0) this.prey = null;
    if (this.prey) {
      this.chaseT += dt;
      // the ambush run: a racetrack on the sinking carcass (run in on a lead point, extend out after a miss and
      // come round again) with the three blade-fins spread — more lift, a hard bank, sharp steering near the end;
      // it may follow the carcass a few hundred metres below its usual layer, then climbs back
      const d = this.pos.distanceTo(this.prey.pos);
      pursue(this.run, this.pos, this.vel, this.prey.pos, this.prey.vel, 75, 300, _w);
      this.body.bank = 0.9;
      this.body.CLmax = 1.4;
      this.body.steer = 5;
      this.band = [-1450, -450];
      this.fly(_w, d < 400 ? 85 : 75, dt, d < 400 ? 1.6 : 1);
      if (d < 22 * this.size) {
        if (seen(this.f, this.pos, 2000, 0.8)) note(this.f, 'deepdiver', 'scavenge', 'Took a torn Skyjelly sinking through its corridor — an ambush from below.');
        this.prey.torn = 1e6; // consumed (it is replaced up in the layer)
        this.prey = null;
        this.meals++;
      }
      if (this.prey && (this.prey.pos.y < this.air.refY - 1450 || this.chaseT > 150)) this.prey = null;
      if (!this.prey) {
        this.body.bank = 0.5;
        this.body.CLmax = 1.0;
        this.body.steer = 1.4;
        this.band = [-1100, -500];
        this.run.mode = 'in';
        this.chaseT = 0;
      }
    } else {
      // cruising its lower corridor ahead of the Ranger's track
      this.at(900, Math.sin(this.t * 0.02) * 700, -780, _w);
      this.fly(_w, 70, dt);
      if (this.behind(3000)) {
        this.at(1500, 400, -780, this.pos);
        this.air.wind(this.pos, this.vel).addScaledVector(sky.head, 70);
      }
    }
    this.size = this.heroicK;
    if (seen(this.f, this.pos, 2500, 0.6)) note(this.f, 'deepdiver', 'sighting');
    this.callT -= dt;
    if (this.callT < 0) {
      this.callT = 25 + Math.random() * 15;
      if (hears(this.f, this.pos, 1500)) this.f.voice.diverResonance(this.pos, 0.3);
    }
    this.faceAir(dt, 0.6);
    this.placeQ();
    if (near) {
      const r = this.rig;
      r.reset();
      for (let i = 1; i <= 3; i++) r.rot(`sp${i}`, AX.y, 0.06 * i * Math.sin(this.t * 0.9 - i));
      const flex = 0.1 * Math.sin(this.t * 0.9) + 0.1 * clamp(this.aero.CL, 0, 1);
      r.rot('finL', AX.fwd, -flex);
      r.rot('finR', AX.fwd, flex);
      r.rot('jaw', AX.x, this.prey && this.pos.distanceTo(this.prey.pos) < 60 ? 0.35 : 0.03);
    }
  }
}

// ================================================================================================ 07 Gasgrazer
class Gasgrazer extends SheetFlyer {
  readonly species = 'gasgrazer';
  readonly id = 'gasgrazer';
  /** 9 t, 98 % carried by its gas: a slow swimmer (≈12 m/s); filtering costs drag */
  readonly body: AeroBody = { m: 9000, S: 150, CLmax: 1.0, CD0: 0.06, k: 0.08, buoy: 0.98, T: 15000, bank: 0.35 };

  constructor(f: FaunaManager, sky: Sky, air: JupiterAir, readonly mites: AeromiteSwarm | null, readonly index: number) {
    super(f, sky, air);
    this.view = 6000;
    this.nearR = 900;
    this.band = [-400, 300];
    this.callT = 20;
  }

  update(dt: number, near: boolean) {
    const sky = this.sky;
    // follows the food front: its comb has to meet the swarm to feed
    const target = this.mites ? this.mites.center : this.at(1500, -600, 0, _a);
    _w.copy(target).add(_v.set(-Math.sin(this.t * 0.01 + this.index) * 120, 10, Math.cos(this.t * 0.01 + this.index) * 120));
    const feeding = !!this.mites && this.pos.distanceTo(this.mites.center) < 160;
    // the open comb is a sieve held into the flow: more drag while it feeds
    this.body.CD0 = feeding ? 0.18 : 0.06;
    this.fly(_w, 12, dt);
    if (this.pos.distanceTo(sky.rp) > 3500 && (!this.mites || this.mites.center.distanceTo(this.pos) > 2000)) {
      this.pos.copy(this.mites?.center ?? sky.rp).add(_v.set(150, 0, 0));
      this.air.wind(this.pos, this.vel);
    }
    this.size = this.heroicK;
    if (feeding && this.mites) {
      this.mites.eat(this.pos, 18 * this.size, dt);
      if (seen(this.f, this.pos, 1500)) note(this.f, 'gasgrazer', 'feed', 'Its comb held open into the swarm: aeromites filtered out of the air as it swam through.');
    }
    this.callT -= dt;
    if (this.callT < 0) {
      this.callT = 25 + Math.random() * 25;
      if (hears(this.f, this.pos, 1800)) this.f.voice.combCall(this.pos, 0.35);
    }
    if (seen(this.f, this.pos, 3500)) note(this.f, 'gasgrazer', 'sighting');
    this.faceAir(dt, 0.4);
    this.placeQ();
    if (near) {
      const r = this.rig;
      r.reset();
      for (let i = 1; i <= 4; i++) r.rot(`sp${i}`, AX.x, 0.04 * Math.sin(this.t * 0.4 - i * 0.7));
      r.rot('comb', AX.x, feeding ? 0.18 + 0.06 * Math.sin(this.t * 1.6) : 0.04);
      r.rot('head', AX.x, feeding ? -0.05 : 0);
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
  private level = 0;
  private rustleT = 2;

  constructor(f: FaunaManager, readonly sky: Sky, readonly air: JupiterAir, n: number) {
    super(f);
    this.view = 1e9;
    this.nearR = 1e9;
    this.level = air.refY + 60;
    sky.ahead(1300, -500, this.level - sky.rp.y, this.center);
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
    // carried on the convection: the bloom rises in a core and settles back (a slow fall speed, mild buoyancy)
    const w = this.air.wind(this.center, _a);
    const dx = w.x * dt, dz = w.z * dt;
    const dy = (0.6 * w.y - 0.25 + 0.01 * (this.level - this.center.y)) * dt;
    this.center.x += dx;
    this.center.y += dy;
    this.center.z += dz;
    _v.subVectors(this.center, sky.rp);
    let shift = false;
    if (_v.length() > 2200 && _v.dot(sky.head) < 0) {
      // the wind brings another bloom into the path ahead
      sky.ahead(1600, (Math.random() - 0.5) * 1400, this.level + (Math.random() - 0.5) * 200 - sky.rp.y, _w);
      _u.subVectors(_w, this.center);
      this.center.copy(_w);
      shift = true;
    }
    const P = this.P;
    this.dry += dt;
    for (let i = 0; i < P.length; i += 3) {
      if (P[i + 1] < -1e5) {
        // regrowth from the bloom
        if (Math.random() < dt * 0.02) P.set([this.center.x + (Math.random() - 0.5) * 60, this.center.y + (Math.random() - 0.5) * 20, this.center.z + (Math.random() - 0.5) * 60], i);
        continue;
      }
      if (shift) {
        P[i] += _u.x;
        P[i + 1] += _u.y;
        P[i + 2] += _u.z;
      }
      // swirl round the bloom, carried with it
      const rx = P[i] - this.center.x, rz = P[i + 2] - this.center.z;
      P[i] += dx - rz * 0.03 * dt;
      P[i + 1] += dy + Math.sin(this.dry * 1.3 + i) * 0.4 * dt;
      P[i + 2] += dz + rx * 0.03 * dt;
    }
    (this.sparkle.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    const close = this.center.distanceTo(sky.rp) < 250;
    this.swarm.update(dt, close);
    this.rustleT -= dt;
    if (this.rustleT < 0) {
      this.rustleT = 2 + Math.random() * 2;
      if (hears(this.f, this.center, 120)) this.f.voice.aeromiteRustle(this.center, 0.05);
    }
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
  /** 3 t, 60 % gas-buoyed, wide frills for lift, a 60 kN burst for the intercept (it cannot outrun a craft at 150 m/s) */
  readonly body: AeroBody = { m: 3000, S: 150, CLmax: 1.3, CD0: 0.03, k: 0.05, buoy: 0.6, T: 60000, bank: 0.8 };
  private jaw = 0;
  private side = 1;
  private calmT = 0;
  private wave = 0;
  /** remembered between visits: intercepts that failed (it then assesses longer) and calm encounters */
  private fails = 0;
  private calm = 0;
  private mem: FaunaMemory;

  constructor(f: FaunaManager, sky: Sky, air: JupiterAir) {
    super(f, sky, air);
    this.view = 6000;
    this.nearR = 900;
    this.band = [-350, 450];
    this.setState('shadow');
    this.cooldown = 90;
    this.mem = siteMemory(f.game, 'jupiter');
    this.fails = this.mem.get('hunter.fails', 0);
    this.calm = this.mem.get('hunter.calm', 0);
  }

  update(dt: number, near: boolean) {
    const sky = this.sky;
    // its envelope: a bounded altitude band (not "all layers") — climb or dive out of it and it breaks off
    const outside = !this.rangerIn(60);
    const d = this.pos.distanceTo(sky.rp);
    const wary = Math.min(3, this.fails);
    const habituated = this.calm >= 3;
    switch (this.state) {
      case 'shadow': {
        // shadowing the corridor off to the side, matching speed (further off once it has missed)
        this.at(150, this.side * (450 + 100 * wary), 100, _w);
        this.fly(_w, clamp(sky.rv.length() + 10, 30, 110), dt);
        this.jaw = damp(this.jaw, 0.05, 1, dt);
        // a craft that has never threatened it: each long calm shadowing counts
        this.calmT += dt;
        if (d < 300) this.calmT = 0;
        if (this.calmT > 60) {
          this.calmT = 0;
          this.calm = this.mem.bump('hunter.calm');
          if (this.calm === 3 && seen(this.f, this.pos, 3000, 0.8)) note(this.f, 'stormhunter', 'habituate', 'After repeated calm encounters it shadows the craft without turning in — the probe is learned as neither prey nor threat.');
        }
        if (this.cooldown <= 0 && !outside && !habituated && sky.claim(this)) {
          this.setState('call');
          this.f.voice.hunterCall(this.pos, 0.5);
          this.game.notify('A short resonant call off the beam — the Stormhunter has turned toward you. Climb or dive out of its corridor.', 'alert', 6);
        }
        break;
      }
      case 'call': {
        // the legible warning: fins fold, head pitches, it turns in for several seconds (longer when it has missed before)
        this.fly(sky.rp, 30, dt, 0.4);
        this.jaw = damp(this.jaw, 0.8, 1.5, dt);
        if (outside) this.breakOff(true);
        else if (this.st > 5 + 2 * wary) {
          this.setState('intercept');
          this.f.voice.hunterCall(this.pos, 0.6, true);
        }
        break;
      }
      case 'intercept': {
        _w.copy(sky.rp).addScaledVector(sky.rv, 1.5);
        this.fly(_w, 110, dt, 1);
        this.jaw = damp(this.jaw, 1, 3, dt);
        if (d < 22 * this.size) {
          this.f.hurtRanger(0.15, 'hull');
          this.game.renderer.fx.shake = Math.max(this.game.renderer.fx.shake, 1.2);
          this.f.voice.hunterCall(this.pos, 0.6, true);
          this.game.notify('The Stormhunter\'s beak raked the hull.', 'alert', 4);
          this.breakOff(false);
        } else if (outside || this.st > 14) this.breakOff(true);
        break;
      }
      case 'recover': {
        this.at(-400, this.side * 900, 100, _w);
        this.fly(_w, 40, dt, 0.5);
        this.jaw = damp(this.jaw, 0.05, 1, dt);
        if (this.st > 25) this.setState('shadow');
        break;
      }
    }
    if (this.behind(4000) && this.state !== 'intercept') this.at(-300, this.side * 600, 100, this.pos);
    this.size = this.heroicK;
    if (seen(this.f, this.pos, 3000)) note(this.f, 'stormhunter', 'sighting');
    this.faceAir(dt, 0.8);
    this.placeQ();
    if (near) {
      const r = this.rig;
      r.reset();
      this.wave += dt * (0.6 + this.speed * 0.01);
      for (let i = 1; i <= 6; i++) r.rot(`sp${i}`, AX.y, 0.1 * (i / 6) * Math.sin(this.wave * 1.6 - i * 0.7));
      // the telegraph: the head pitches down, the frills fold back
      if (this.state === 'call' || this.state === 'intercept') r.rot('head', AX.x, 0.12);
      r.rot('jaw', AX.x, 0.5 * this.jaw);
    }
  }

  private breakOff(missed: boolean) {
    this.sky.done(this, 90);
    this.cooldown = 240;
    this.side = -this.side;
    if (missed) {
      this.fails = this.mem.bump('hunter.fails');
      if (seen(this.f, this.pos, 3000, 0.9)) note(this.f, 'stormhunter', 'breakoff', 'It broke off when the craft left its altitude envelope — and kept further off afterwards.');
    }
    this.setState('recover');
  }
}

// ================================================================================================ population
/** The sheet's nine in Jupiter's cloud layer (speculative-evolution mode; called by populateJupiter). */
export async function populateJupiterSheet(f: FaunaManager, sky: Sky, R: () => number, _wind: THREE.Vector3) {
  const jobs: Promise<unknown>[] = [];
  const safe = (p: Promise<unknown>) => p.catch((e) => console.error('[jupiter sheet] species', e));
  // the reference level: the cloud-cruise level at this site (Ranger 1's autopilot holds 1.5 km above the 1-bar level)
  const host = f.host;
  const alt = (f.game.zone as unknown as { altitude?: () => number } | null)?.altitude?.();
  const refY = sky.rp.y - ((alt ?? 1500) - 1500);
  const air = new JupiterAir((p) => host.airDensity?.(p) ?? 0.17 * Math.exp(-(p.y - refY + 1500) / 27000), refY, Math.round(R() * 1000));
  f.air = air;
  siteMemory(f.game, 'jupiter');
  const mites = new AeromiteSwarm(f, sky, air, f.count(900));
  f.creatures.push(mites);
  for (let i = 0; i < f.count(3); i++) jobs.push(safe(f.add(new Stormskimmer(f, sky, air, i), 'jup_stormskimmer')));
  const jellies: Skyjelly[] = [];
  for (let i = 0; i < f.count(6); i++) {
    const j = new Skyjelly(f, sky, air, i > 1);
    sky.ahead(700 + R() * 2500, (R() - 0.5) * 1800, refY - 80 + R() * 400 - sky.rp.y, j.pos);
    air.wind(j.pos, j.vel);
    jellies.push(j);
    jobs.push(safe(f.add(j, 'jup_skyjelly')));
  }
  const sb = new Stormbeast(f, sky, air);
  sky.ahead(2800, -2600, refY - 150 - sky.rp.y, sb.pos);
  jobs.push(safe(f.add(sb, 'jup_stormbeast')));
  const col = new FloatingColony(f, sky, air, f.count(110));
  jobs.push(safe(col.build().then(() => f.creatures.push(col))));
  for (let i = 0; i < f.count(2); i++) {
    const v = new Voltdrifter(f, sky, air, i, mites);
    sky.ahead(1700, 1300 + i * 120, refY + 40 - sky.rp.y, v.pos);
    jobs.push(safe(f.add(v, 'jup_voltdrifter')));
  }
  const dd = new Deepdiver(f, sky, air, jellies);
  sky.ahead(1200, 400, refY - 780 - sky.rp.y, dd.pos);
  air.wind(dd.pos, dd.vel).addScaledVector(sky.head, 70);
  jobs.push(safe(f.add(dd, 'jup_deepdiver')));
  for (let i = 0; i < f.count(1); i++) {
    const g = new Gasgrazer(f, sky, air, mites, i);
    sky.ahead(1500, -800, refY + 30 - sky.rp.y, g.pos);
    jobs.push(safe(f.add(g, 'jup_gasgrazer')));
  }
  const sh = new Stormhunter(f, sky, air);
  sky.ahead(-300, 600, refY + 100 - sky.rp.y, sh.pos);
  air.wind(sh.pos, sh.vel).addScaledVector(sky.head, 40);
  jobs.push(safe(f.add(sh, 'jup_stormhunter')));
  // gliders start with flying speed along the flight path
  await Promise.all(jobs);
  // the giants are silhouettes in the haze far more than close: out of the shadow map
  for (const c of f.creatures) if (['stormskimmer', 'skyjelly', 'stormbeast', 'gasgrazer', 'deepdiver', 'stormhunter', 'voltdrifter'].includes(c.species)) c.root.traverse((o) => (o.castShadow = false));
}
