import * as THREE from 'three';
import { Creature, FaunaManager } from './Fauna';
import { AX } from './Rig';
import type { Spacecraft } from '../../vehicles/Spacecraft';

/**
 * Jupiter: life in the cloud layer, met from Ranger 1's cockpit.
 *   floaters    — giant pearly gas-bags drifting in herds, singing; their tendril bundles hold static charge and arc
 *                 to a craft that flies too close (electrical surge: engines out, avionics damage, screen flash).
 *   veil rays   — dark mantas that shadow the Ranger from above in the haze, then drop onto the canopy and drape
 *                 their tentacles over the windscreen: darkness, acid on the hull, drag.
 *   maw rays    — stalk from below and behind with sonar pings that quicken as they close, then latch onto the canopy
 *                 with a toothed sucker: the hull is ground and drained, the canopy cracks, the Ranger is dragged down.
 *   spore bulbs — drifting colonies that light up as the Ranger nears, then burst one after another into corrosive
 *                 spore clouds that choke the engine intakes.
 *   hunters     — huge yellow gas-bags waiting above the flight path; the multi-eyed pod hanging under one drops on
 *                 its cords, harpoons the Ranger with barbed lines, reels it in and crushes it with feathered arms.
 * Any grip is a struggle: mash E (Interact), roll hard or burn full thrust; a floater's discharge also throws an
 * attacker off. Models: blender/assets/fauna_jupiter.py.
 */
const TAU = Math.PI * 2;
const _v = new THREE.Vector3();
const _u = new THREE.Vector3();
const _w = new THREE.Vector3();
const _x = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const SPORE = new THREE.Color(0.42, 0.62, 0.22);
const SPORE2 = new THREE.Color(0.72, 0.48, 0.16);
const ACID = new THREE.Color(0.5, 0.55, 0.42);
const SONAR = 0x7fe0d0;
const clamp = THREE.MathUtils.clamp;
const damp = THREE.MathUtils.damp;
const ease = (t: number) => t * t * (3 - 2 * t);

function rnd(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/** A jagged discharge bolt between two points (a glowing ribbon), flickering out. */
class Arc {
  readonly mesh: THREE.Mesh;
  private t = 0;
  private a = new THREE.Vector3();
  private b = new THREE.Vector3();
  private pts = Array.from({ length: 16 }, () => new THREE.Vector3());
  constructor(parent: THREE.Object3D) {
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.6, 3.2), transparent: true, toneMapped: false, depthWrite: false, blending: THREE.AdditiveBlending });
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    parent.add(this.mesh);
  }
  fire(a: THREE.Vector3, b: THREE.Vector3) {
    this.a.copy(a);
    this.b.copy(b);
    this.t = 0.5;
    this.jag();
  }
  private jag() {
    const L = this.a.distanceTo(this.b);
    const n = this.pts.length;
    this.pts.forEach((p, i) => {
      const s = i / (n - 1);
      const j = i === 0 || i === n - 1 ? 0 : L * 0.07 * Math.sin(Math.PI * s);
      p.lerpVectors(this.a, this.b, s).add(_v.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(j));
    });
    this.mesh.geometry.dispose();
    this.mesh.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(this.pts, false, 'catmullrom', 0.1), 40, 0.32, 5, false);
  }
  update(dt: number) {
    this.t -= dt;
    this.mesh.visible = this.t > 0;
    if (this.t > 0) {
      if (Math.random() < 0.5) this.jag();
      (this.mesh.material as THREE.MeshBasicMaterial).opacity = Math.min(1, this.t * 4) * (0.55 + 0.45 * Math.random());
    }
  }
  dispose() {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.removeFromParent();
  }
}

type FreeHow = 'broke' | 'shock' | 'timeout';

/**
 * The shared state of the Jovian sky (a model-less member of the creature list, updated first): where Ranger 1 is,
 * the one creature allowed to attack at a time, the grip struggle, spore clouds in the intakes, the cockpit effects.
 */
export class Sky extends Creature {
  readonly species = 'sky';
  craft: Spacecraft | null = null;
  /** Ranger 1 (world), its orientation, velocity, horizontal heading */
  readonly rp = new THREE.Vector3();
  readonly rq = new THREE.Quaternion();
  readonly rv = new THREE.Vector3();
  readonly head = new THREE.Vector3(1, 0, 0);
  /** the pilot's eye in Ranger 1's frame (creatures settle over the canopy in front of it) */
  readonly eye = new THREE.Vector3(0, 1.4, -5);
  private eyeFound = false;
  attacker: Creature | null = null;
  /** seconds before another attack may begin */
  lull = 14;
  grip: { by: Creature; kind: string; got: number; need: number; t: number; max: number; onFree: (how: FreeHow) => void } | null = null;
  clouds: { p: THREE.Vector3; r: number; t: number }[] = [];
  /** spore-choked intakes (s) */
  clog = 0;
  /** electrical surge: engines out (s) */
  surge = 0;
  private dark = 0;
  darkTarget = 0;
  readonly darkColor = new THREE.Color(0, 0, 0);
  private flashK = 0;
  private fxOn = false;
  private dustOn = false;
  private flicker = 0;
  private told = new Set<string>();
  /** the camera is in the cockpit (effects on the canopy read from inside) */
  cockpit = true;
  readonly arc: Arc;
  /** respawn a spore colony ahead (set by populate) */
  spawnColony: (() => void) | null = null;
  private colonyGone = 0;
  private cloudPuffT = 0;
  private rockArmed = true;
  /** seconds the stick stays with the struggle after a grip ends (so the last jabs do not drop the autopilot) */
  private grace = 0;

  constructor(f: FaunaManager) {
    super(f);
    this.view = 1e9;
    this.nearR = 1e9;
    this.arc = new Arc(f.root);
    this.sync();
  }

  sync() {
    const h = this.f.host;
    this.craft = h.craft();
    const r = h.rangerRoot();
    r.getWorldPosition(this.rp);
    r.getWorldQuaternion(this.rq);
    if (this.craft) this.rv.set(this.craft.vel[0], this.craft.vel[1], this.craft.vel[2]);
    else this.rv.set(0, 0, 0);
    _v.set(this.rv.x, 0, this.rv.z);
    if (_v.lengthSq() > 4) this.head.copy(_v.normalize());
    else this.head.set(0, 0, -1).applyQuaternion(this.rq).setY(0).normalize();
    this.pos.copy(this.rp);
    if (!this.eyeFound) {
      const e = r.getObjectByName('seat_pilot_eye');
      if (e) {
        this.eyeFound = true;
        this.toLocal(e.getWorldPosition(_w), this.eye);
      }
    }
  }

  /** a point `d` ahead along the flight path, `lat` to the right, `dy` above Ranger 1 */
  ahead(d: number, lat: number, dy: number, out = new THREE.Vector3()) {
    return out.copy(this.rp).addScaledVector(this.head, d).add(_x.set(-this.head.z, 0, this.head.x).multiplyScalar(lat)).setY(this.rp.y + dy);
  }

  /** Ranger-local offset → world */
  toWorld(local: THREE.Vector3, out = new THREE.Vector3()) {
    return out.copy(local).applyQuaternion(this.rq).add(this.rp);
  }

  toLocal(world: THREE.Vector3, out = new THREE.Vector3()) {
    return out.copy(world).sub(this.rp).applyQuaternion(_q.copy(this.rq).invert());
  }

  /** this creature may start an attack now */
  claim(c: Creature) {
    if (this.f.hostility === 0 || !this.craft) return false;
    if (this.attacker && this.attacker !== c) return false;
    if (this.attacker !== c && this.lull > 0) return false;
    this.attacker = c;
    return true;
  }

  /** the attack is over; the next one waits `lull` s (half on fierce) */
  done(c: Creature, lull: number) {
    if (this.attacker !== c) return;
    this.attacker = null;
    this.lull = lull * (this.f.hostility === 2 ? 0.5 : 1);
  }

  grab(by: Creature, kind: string, need: number, max: number, onFree: (how: FreeHow) => void) {
    if (this.grip) return false;
    this.grip = { by, kind, got: 0, need, t: 0, max, onFree };
    return true;
  }

  release(how: FreeHow) {
    const gp = this.grip;
    if (!gp) return;
    this.grip = null;
    this.game.ui.countdown(null);
    gp.onFree(how);
  }

  /** a floater's discharge reached Ranger 1 */
  shock(from: THREE.Vector3) {
    const g = this.game;
    this.arc.fire(from, this.rp);
    this.surge = 1.6;
    this.flicker = 1.4;
    this.flashK = 1;
    g.renderer.fx.shake = Math.max(g.renderer.fx.shake, 0.7);
    g.renderer.fx.warp = Math.max(g.renderer.fx.warp, 0.6);
    this.f.voice.zap(undefined, 0.9);
    this.f.voice.tinnitus(2.2, 0.05);
    const av = this.f.hurtRanger(0.07, 'avionics');
    this.f.hurtRanger(0.03, 'hull');
    this.f.flash(0.6);
    g.notify(`Electrical surge — engines tripped, restarting. Avionics ${Math.round(av * 100)} %.`, 'alert', 4);
    if (this.grip) this.release('shock');
  }

  addCloud(p: THREE.Vector3, r: number) {
    this.clouds.push({ p: p.clone(), r, t: 10 });
  }

  /** say something once per `key` */
  once(key: string, fn: () => void) {
    if (this.told.has(key)) return;
    this.told.add(key);
    fn();
  }

  forget(key: string) {
    this.told.delete(key);
  }

  update(dt: number) {
    const g = this.game;
    const fx = g.renderer.fx;
    this.sync();
    this.lull = Math.max(0, this.lull - dt);
    this.cockpit = g.camera.getWorldPosition(_w).distanceTo(this.rp) < 9;
    this.f.cabinView = this.cockpit;
    if (this.attacker && !this.attacker.alive) this.attacker = null;
    // ---- the grip struggle
    const gp = this.grip;
    if (gp) {
      gp.t += dt;
      const c = this.craft;
      let add = 0;
      // rocking the Ranger: every push of the roll control (Q/E, a stick flick, the touch stick) counts once
      const inp = g.input;
      const roll = Math.abs(inp.flight.roll);
      let jab = false;
      if (roll < 0.3) this.rockArmed = true;
      else if (roll > 0.5 && this.rockArmed) {
        this.rockArmed = false;
        jab = true;
      }
      if (jab || inp.pressed('interact') || inp.pressed('jump')) {
        add += 1;
        fx.shake = Math.max(fx.shake, 0.45);
        g.audio.thud(undefined, 0.25, 70);
      }
      if (c) {
        add += dt * Math.max(0, Math.abs(c.angVel.z) + 0.6 * Math.abs(c.angVel.x) - 0.5) * 2.5;
        if (c.mainLevel > 0.85 || inp.flight.throttle > 0.5) add += dt * 0.6;
      }
      gp.got = Math.min(gp.need, gp.got + add);
      const n = Math.floor(gp.got);
      g.ui.countdown(`${gp.kind} — SHAKE IT OFF: ROCK [Q]/[E] · FULL THRUST  ${'▮'.repeat(n)}${'▯'.repeat(Math.max(0, gp.need - n))}`);
      if (!gp.by.alive || !c) this.release('timeout');
      else if (gp.got >= gp.need) this.release('broke');
      else if (gp.t > gp.max) this.release('timeout');
    }
    // the autopilot (CLOUD CRUISE) keeps flying while the pilot fights: the stick is not a manual takeover
    this.grace = this.grip ? 1.5 : Math.max(0, this.grace - dt);
    this.f.host.struggle(this.grace > 0);
    // ---- spore clouds: drift, glow, choke the intakes of a craft flying through
    this.cloudPuffT -= dt;
    let inCloud = false;
    for (const cl of this.clouds) {
      cl.t -= dt;
      cl.p.y += dt * 0.6;
      if (this.cloudPuffT < 0 && cl.t > 1.5) {
        _v.set(Math.random() - 0.5, (Math.random() - 0.5) * 0.6, Math.random() - 0.5).multiplyScalar(cl.r * 1.4).add(cl.p);
        this.f.puffs.burst(_v, 3, Math.random() < 0.6 ? SPORE : SPORE2, { size: cl.r * 0.22, life: 3.5, speed: 3, up: 0.3, alpha: 0.45, spread: cl.r * 0.3 });
      }
      if (cl.t > 0 && cl.p.distanceTo(this.rp) < cl.r) inCloud = true;
    }
    if (this.cloudPuffT < 0) this.cloudPuffT = 0.08;
    this.clouds = this.clouds.filter((c) => c.t > 0);
    if (inCloud && this.craft) {
      if (this.clog <= 0) {
        this.forget('clog');
        this.once('clog', () => g.notify('Spores in the intakes — thrust down to 45 %. Fly clear and they will burn out.', 'alert', 5));
        g.audio.thud(undefined, 0.4, 40);
      }
      this.clog = 7;
      this.f.hurtRanger(0.006 * dt, 'hull');
      this.f.hurtRanger(0.004 * dt, 'engines');
    }
    this.clog = Math.max(0, this.clog - dt);
    this.surge = Math.max(0, this.surge - dt);
    this.f.thrustK = this.surge > 0 ? 0 : this.clog > 0 ? 0.45 : 1;
    if (this.clog > 0 && Math.random() < dt * 1.2) g.audio.thud(undefined, 0.18, 38); // the engines cough
    // spores on the canopy: a green haze while inside, clearing after
    if (inCloud || this.clog > 5) {
      fx.dust = damp(fx.dust, inCloud ? 0.75 : 0.25, 3, dt);
      fx.dustColor.setRGB(0.42, 0.55, 0.24);
      this.dustOn = true;
    } else if (this.dustOn) {
      fx.dust = damp(fx.dust, 0, 2, dt);
      if (fx.dust < 0.01) {
        fx.dust = 0;
        this.dustOn = false;
      }
    }
    // a colony burnt out: another drifts into the flight path later
    if (this.spawnColony && !this.f.creatures.some((c) => c.species === 'sporebulb')) {
      this.colonyGone += dt;
      if (this.colonyGone > 35) {
        this.colonyGone = 0;
        this.spawnColony();
      }
    } else this.colonyGone = 0;
    // ---- the canopy: darkness from a creature over it, the discharge flash, the HUD flickering after a surge
    this.dark = damp(this.dark, this.darkTarget, 3, dt);
    this.darkTarget = 0;
    this.flashK = Math.max(0, this.flashK - dt * 3.5);
    const k = this.dark * (this.cockpit ? 1 : 0.3);
    if (k > 0.004 || this.flashK > 0.004) {
      const fl = this.flashK * 0.75;
      if (fl > k) fx.fadeColor.setRGB(0.75, 0.86, 1.0);
      else fx.fadeColor.copy(this.darkColor);
      fx.fade = Math.max(k, fl);
      this.fxOn = true;
    } else if (this.fxOn) {
      fx.fade = 0;
      this.fxOn = false;
    }
    this.f.cabinCrack = Math.max(0, this.f.cabinCrack - dt * 0.004);
    this.flicker = Math.max(0, this.flicker - dt);
    g.ui.hud.style.opacity = this.flicker > 0 ? String(Math.random() < 0.5 ? 0.15 : 0.85) : '';
    this.arc.update(dt);
  }

  dispose() {
    super.dispose();
    this.arc.dispose();
    const g = this.game;
    g.ui.hud.style.opacity = '';
    if (this.fxOn) g.renderer.fx.fade = 0;
    if (this.dustOn) g.renderer.fx.dust = 0;
    if (this.grip) {
      this.grip = null;
      g.ui.countdown(null);
    }
    this.f.host.struggle(false);
  }
}

/** A creature of the open sky: flies with a velocity, banks into turns, can be fixed to Ranger 1. */
export abstract class Flyer extends Creature {
  readonly vel = new THREE.Vector3();
  readonly q = new THREE.Quaternion();
  size = 1;
  private bank = 0;
  private pitchA = 0;
  /** a scripted approach in Ranger 1's frame (drop / lunge onto the hull) */
  protected from = new THREE.Vector3();
  protected fromQ = new THREE.Quaternion();

  constructor(f: FaunaManager, readonly sky: Sky) {
    super(f);
  }

  /** fly toward p at speed v: the velocity turns at up to `turn` rad/s, speed changes at up to `acc` m/s² */
  protected flyTo(p: THREE.Vector3, v: number, turn: number, dt: number, acc = 6) {
    _v.subVectors(p, this.pos);
    const d = _v.length();
    if (d < 1e-3) return d;
    _v.divideScalar(d);
    const sp = this.vel.length();
    if (sp < 0.1) _u.set(0, 0, -1).applyQuaternion(this.q);
    else _u.copy(this.vel).divideScalar(sp);
    const ang = _u.angleTo(_v);
    if (ang > 1e-4) _u.lerp(_v, Math.min(1, (turn * dt) / ang)).normalize();
    this.vel.copy(_u).multiplyScalar(Math.max(0, sp + clamp(v - sp, -acc * dt, acc * dt)));
    this.pos.addScaledVector(this.vel, dt);
    return d;
  }

  /** orient along the velocity, banking into turns */
  protected faceVel(dt: number, bankK = 1) {
    const sp = this.vel.length();
    if (sp < 0.5) return;
    const yaw = Math.atan2(-this.vel.x, -this.vel.z);
    let dy = yaw - this.yaw;
    while (dy > Math.PI) dy -= TAU;
    while (dy < -Math.PI) dy += TAU;
    this.yaw = yaw;
    this.pitchA = damp(this.pitchA, Math.asin(clamp(this.vel.y / sp, -1, 1)), 3, dt);
    this.bank = damp(this.bank, clamp((dy / Math.max(dt, 1e-3)) * 0.9 * bankK, -0.9, 0.9), 2.5, dt);
    this.q.setFromEuler(_e.set(this.pitchA, this.yaw, this.bank, 'YXZ'));
  }

  /** fixed to Ranger 1 at a local offset and orientation */
  protected stick(local: THREE.Vector3, localQ: THREE.Quaternion) {
    this.sky.toWorld(local, this.pos);
    this.q.copy(this.sky.rq).multiply(localQ);
    this.vel.copy(this.sky.rv);
  }

  /** begin a scripted approach from where the creature is now */
  protected beginApproach() {
    this.sky.toLocal(this.pos, this.from);
    this.fromQ.copy(this.sky.rq).invert().multiply(this.q);
  }

  /** the scripted approach: k 0..1 from the start to `local`, arcing `lift` m above the straight path */
  protected approach(k: number, local: THREE.Vector3, localQ: THREE.Quaternion, lift: number) {
    const e = ease(clamp(k, 0, 1));
    _w.lerpVectors(this.from, local, e);
    _w.y += Math.sin(Math.PI * e) * lift;
    this.sky.toWorld(_w, this.pos);
    _q.slerpQuaternions(this.fromQ, localQ, e);
    this.q.copy(this.sky.rq).multiply(_q);
    this.vel.copy(this.sky.rv);
  }

  /** far behind the flight path and not busy: move it ahead again */
  protected behind(far: number) {
    _v.subVectors(this.pos, this.sky.rp);
    return _v.length() > far && _v.dot(this.sky.head) < 0;
  }

  protected placeQ() {
    this.root.position.copy(this.pos);
    this.root.quaternion.copy(this.q);
    this.root.scale.setScalar(this.size);
  }
}

// ================================================================================================ floater
class Floater extends Flyer {
  readonly species = 'floater';
  charge = 0;
  private spin = (Math.random() - 0.5) * 0.04;
  private songT = 6 + Math.random() * 20;
  private crackleT = 0;
  readonly drift = new THREE.Vector3();
  private seed = Math.random() * 100;

  constructor(f: FaunaManager, sky: Sky) {
    super(f, sky);
    this.view = 12000;
    this.nearR = 3000;
  }

  /** the tendril bundle's middle (world) */
  tendrils(out = new THREE.Vector3()) {
    return out.copy(this.pos).add(_x.set(0, -19 * this.size, 0));
  }

  update(dt: number, near: boolean) {
    const s = this.sky;
    this.pos.addScaledVector(this.drift, dt);
    this.pos.y += Math.sin(this.t * 0.12 + this.seed) * 0.5 * dt * this.size;
    this.yaw += this.spin * dt;
    this.q.setFromEuler(_e.set(0.04 * Math.sin(this.t * 0.2 + this.seed), this.yaw, 0.04 * Math.cos(this.t * 0.17 + this.seed), 'YXZ'));
    if (this.behind(4000) && this.charge < 0.05) {
      s.ahead(3200 + Math.random() * 1500, (Math.random() - 0.5) * 3000, -300 + Math.random() * 900, this.pos);
    }
    // static charge builds in the tendrils as a craft comes near; close enough, it arcs
    const tc = this.tendrils(_u);
    const d = tc.distanceTo(s.rp);
    const reach = 30 * this.size + 14;
    if (s.craft && d < reach * 2.2) this.charge = Math.min(1, this.charge + dt * (d < reach ? 0.85 : 0.3));
    else this.charge = Math.max(0, this.charge - dt * 0.25);
    const fl = 0.55 + 0.45 * Math.sin(this.t * 37) * Math.sin(this.t * 23);
    this.setGlow(this.charge * (0.5 + 1.3 * fl));
    if (this.charge > 0.3) {
      this.crackleT -= dt;
      if (this.crackleT < 0) {
        this.crackleT = 0.25 + Math.random() * 0.6;
        this.f.voice.zap(tc, 0.12 + 0.2 * this.charge);
        s.once('floater-charge', () => this.f.host.say('computer', 'Static field building around that floater — keep clear of its tendrils.'));
      }
    }
    if (this.charge >= 1 && d < reach && this.f.hostility >= 1 && this.cooldown <= 0 && s.craft) {
      this.cooldown = 6;
      this.charge = 0.25;
      _w.copy(tc).add(_x.set((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 6).multiplyScalar(this.size));
      s.shock(_w);
    }
    // song: low, sliding calls carried a long way
    this.songT -= dt;
    if (this.songT < 0) {
      this.songT = 18 + Math.random() * 30;
      if (d < 2500) this.f.voice.song(this.pos, 5, 0.35);
    }
    if (near) this.pose();
    this.placeQ();
  }

  private pose() {
    const r = this.rig;
    r.reset();
    const b = 0.022 * Math.sin(this.t * 0.55 + this.seed);
    r.scale('bag', _v.set(1 + b, 1 - b * 0.6, 1 + b));
    ['tA', 'tB', 'tC'].forEach((c, k) => {
      for (let i = 1; i <= 4; i++) {
        const ph = this.t * 0.5 + i * 0.75 + k * 2.1 + this.seed;
        r.rot(`${c}${i}`, AX.x, 0.09 * Math.sin(ph) + this.charge * 0.05 * Math.sin(this.t * 31 + i));
        r.rot(`${c}${i}`, AX.z, 0.08 * Math.cos(ph * 0.8));
      }
    });
  }
}

// ================================================================================================ veil ray
/** Ranger 1's windows are roof skylights 1.1–1.4 m above the pilot's eye (1.9 m ahead to 4 m behind): the veil ray
 * lies on them (its belly clear of the glass), head aft, its curtain hanging down over the nose */
const VEIL_UP = new THREE.Vector3(0, 2.75, 1.1);
// lying head-aft over the canopy, so its curtain of tentacles hangs forward over the windscreen
const VEIL_Q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.12, Math.PI, 0, 'YXZ'));

class VeilRay extends Flyer {
  readonly species = 'veilray';
  private flap = Math.random() * 10;
  private wrap = 0;
  private slapT = 0;

  constructor(f: FaunaManager, sky: Sky, readonly mate: number) {
    super(f, sky);
    this.view = 6000;
    this.nearR = 1500;
  }

  update(dt: number, near: boolean) {
    const s = this.sky;
    const dR = this.pos.distanceTo(s.rp);
    let flapRate = 0.5;
    let flapAmp = 0.28;
    this.wrap = damp(this.wrap, this.state === 'drape' ? 1 : 0, 3, dt);
    switch (this.state) {
      case 'idle':
      case 'glide': {
        if (dR > 3500 || this.home.lengthSq() === 0) s.ahead(1500 + Math.random() * 1200, (Math.random() - 0.5) * 1600, 80 + Math.random() * 200, this.home);
        this.home.addScaledVector(s.head, dt * 30);
        _w.set(Math.cos(this.t * 0.06 + this.mate * 3) * 260, 30 * Math.sin(this.t * 0.1), Math.sin(this.t * 0.06 + this.mate * 3) * 260).add(this.home);
        this.flyTo(_w, 36, 0.5, dt, 4);
        this.faceVel(dt);
        if (this.cooldown <= 0 && dR < 1200 && s.claim(this)) {
          this.setState('shadow');
          s.once('veil', () => this.f.host.say('computer', 'Contact above us, matching our speed. It is keeping to the haze.'));
        }
        break;
      }
      case 'shadow': {
        // ahead of the Ranger and above it, half hidden in the haze, matching its speed
        s.ahead(170, 30 * Math.sin(this.t * 0.4), 55, _w);
        const d = this.flyTo(_w, s.rv.length() + clamp(this.pos.distanceTo(_w) * 0.5, 0, 90), 1.4, dt, 40);
        this.faceVel(dt, 0.5);
        flapRate = 0.9;
        if (this.st > 4 && d < 45) {
          this.beginApproach();
          this.setState('drop');
          this.f.voice.wingbeat(this.pos, 0.4);
        }
        if (this.st > 30) {
          s.done(this, 8);
          this.cooldown = 25;
          this.setState('glide');
        }
        break;
      }
      case 'drop': {
        // it lets the Ranger catch it: down and back onto the canopy, wings swept
        flapAmp = 0.1;
        this.approach(this.st / 1.7, _x.copy(s.eye).setX(0).add(VEIL_UP), VEIL_Q, 6);
        if (this.st >= 1.7) {
          this.setState('drape');
          this.game.renderer.fx.shake = Math.max(this.game.renderer.fx.shake, 0.8);
          this.game.audio.thud(undefined, 0.6, 45);
          this.game.notify('Something has landed on the canopy! Rock the Ranger — jab Q/E — or burn full thrust.', 'alert', 4);
          const need = this.f.hostility === 2 ? 10 : 7;
          if (!s.grab(this, 'SHROUDED', need, 22, (how) => this.thrown(how))) this.thrown('timeout');
        }
        break;
      }
      case 'drape': {
        this.stick(_x.copy(s.eye).setX(0).add(VEIL_UP), VEIL_Q);
        flapAmp = 0.05;
        s.darkTarget = 0.6 + 0.12 * Math.sin(this.t * 2.2);
        s.darkColor.setRGB(0.012, 0.02, 0.018);
        // acid seeps through: hull eaten, hissing steam at the edges
        this.f.hurtRanger(0.012 * dt, 'hull');
        if (Math.random() < dt * 6) {
          s.toWorld(_w.set((Math.random() - 0.5) * 6, 2.2, -3 + (Math.random() - 0.5) * 6), _u);
          this.f.puffs.burst(_u, 3, ACID, { size: 1.6, life: 1.4, speed: 2, up: 1.5, alpha: 0.35 });
        }
        this.slapT -= dt;
        if (this.slapT < 0) {
          this.slapT = 1.1 + Math.random() * 1.4;
          this.f.voice.hullGrind(0.14);
          this.game.renderer.fx.shake = Math.max(this.game.renderer.fx.shake, 0.25);
        }
        const c = s.craft;
        if (c) {
          // its drag in the airflow and its weight on the nose
          const k = Math.max(0, 1 - 0.16 * dt);
          c.vel[0] *= k;
          c.vel[2] *= k;
          c.angVel.x -= 0.25 * dt;
        }
        break;
      }
      case 'thrown': {
        // tumbling away into the haze
        this.vel.y -= 4 * dt;
        this.pos.addScaledVector(this.vel, dt);
        this.vel.multiplyScalar(1 - dt * 0.3);
        this.q.multiply(_q.setFromAxisAngle(AX.z, dt * 2.5));
        if (this.st > 5) this.setState('glide');
        break;
      }
    }
    if (near) this.pose(flapRate, flapAmp);
    this.placeQ();
  }

  private thrown(how: FreeHow) {
    const s = this.sky;
    this.setState('thrown');
    this.vel.copy(s.rv).multiplyScalar(0.6).add(_v.set((Math.random() - 0.5) * 30, 18, 0));
    this.cooldown = 40;
    s.done(this, 20);
    this.game.notify(how === 'shock' ? 'The discharge burnt it off the canopy.' : how === 'broke' ? 'You shook it off!' : 'It let go and slid off the hull.', how === 'timeout' ? 'info' : 'ok', 3);
  }

  private pose(rate: number, amp: number) {
    const r = this.rig;
    r.reset();
    this.flap += rate * TAU * (1 / 60);
    const f = Math.sin(this.flap) * amp * (1 - this.wrap);
    const w = this.wrap;
    // wings beat; draped, they fold down around the hull
    r.roll('wingL1', f - 0.55 * w);
    r.roll('wingR1', -f + 0.55 * w);
    r.roll('wingL2', Math.sin(this.flap - 0.7) * amp * 0.8 * (1 - w) - 0.6 * w);
    r.roll('wingR2', -Math.sin(this.flap - 0.7) * amp * 0.8 * (1 - w) + 0.6 * w);
    for (let k = 0; k < 8; k++) {
      for (let i = 1; i <= 4; i++) {
        const ph = this.t * 1.3 - i * 0.9 + k * 0.8;
        // trailing: a slow travelling wave; draped: hanging down over the nose, twitching
        r.rot(`tent${k}${i}`, AX.x, (0.12 * Math.sin(ph) + w * (i === 1 ? 0.55 : 0.32)) + w * 0.06 * Math.sin(this.t * 7 + k + i));
        r.rot(`tent${k}${i}`, AX.y, 0.05 * Math.cos(ph * 0.7) * (1 - w * 0.5));
      }
    }
  }
}

// ================================================================================================ maw ray
// lying on the roof skylights, belly (and sucker) down on the glass, wings wrapping the hull
const MAW_Q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.04, 0, 0, 'YXZ'));
/** the sucker's centre in the ray's model frame (blender/assets/fauna_jupiter.py: mouth at y 2.2, z −1.12) */
const MAW_MOUTH = new THREE.Vector3(0, -1.12, -2.2);
/** on the skylight right above the pilot (x: the Ranger's axis) */
const MAW_GLASS = new THREE.Vector3(0, 1.55, -0.5);

class MawRay extends Flyer {
  readonly species = 'mawray';
  private flap = Math.random() * 10;
  private pingT = 0;
  private grindT = 0;
  private beatT = 0;
  private wrap = 0;

  constructor(f: FaunaManager, sky: Sky) {
    super(f, sky);
    this.view = 6000;
    this.nearR = 1500;
  }

  update(dt: number, near: boolean) {
    const s = this.sky;
    const dR = this.pos.distanceTo(s.rp);
    let amp = 0.25;
    this.wrap = damp(this.wrap, this.state === 'latched' ? 1 : 0, 3, dt);
    // the throat glows as it feeds, pulsing with its heartbeat
    this.setGlow(this.state === 'latched' ? 2.2 + 1.8 * Math.sin(this.t * 7.4) : this.state === 'lunge' ? 1.5 : 0);
    switch (this.state) {
      case 'idle':
      case 'cruise': {
        if (dR > 3500 || this.home.lengthSq() === 0) s.ahead(-600 - Math.random() * 900, (Math.random() - 0.5) * 1400, -250 - Math.random() * 150, this.home);
        this.home.addScaledVector(s.head, dt * 60);
        _w.set(Math.cos(this.t * 0.05) * 300, 0, Math.sin(this.t * 0.05) * 300).add(this.home);
        this.flyTo(_w, 45, 0.45, dt, 5);
        this.faceVel(dt);
        if (this.cooldown <= 0 && dR < 1800 && s.claim(this)) {
          this.setState('trail');
          this.pingT = 0;
        }
        break;
      }
      case 'trail': {
        // under and behind, closing slowly; the pings come faster as it closes
        const back = 300 - 200 * Math.min(1, this.st / 16);
        s.ahead(-back, 10 * Math.sin(this.t * 0.5), -70 + 40 * Math.min(1, this.st / 16), _w);
        this.flyTo(_w, s.rv.length() + clamp(this.pos.distanceTo(_w) * 0.6, -20, 110), 1.6, dt, 45);
        this.faceVel(dt, 0.4);
        const close = clamp(1 - (dR - 90) / 420, 0, 1);
        this.pingT -= dt;
        if (this.pingT < 0) {
          this.pingT = 2.6 - 2.2 * close;
          this.f.voice.ping(this.pos, 0.22 + 0.25 * close);
          _v.subVectors(s.rp, this.pos).normalize();
          this.f.rings.emit(this.pos, _v, SONAR, 1.4, 70);
          if (close < 0.2) s.once('maw', () => this.f.host.say('computer', 'Sonar contact — below and behind us, closing. It is pinging our hull.'));
        }
        if (this.st > 9 && dR < 130) {
          this.beginApproach();
          this.setState('lunge');
          this.f.voice.screech(this.pos, 0.35);
        }
        if (this.st > 40) {
          s.done(this, 10);
          this.cooldown = 30;
          this.setState('cruise');
          s.forget('maw');
        }
        break;
      }
      case 'lunge': {
        // up from below and onto the canopy, belly first
        amp = 0.45;
        this.approach(this.st / 1.15, this.mawAt(_x), MAW_Q, -10);
        if (this.st >= 1.15) {
          this.setState('latched');
          const g = this.game;
          g.renderer.fx.shake = Math.max(g.renderer.fx.shake, 1);
          g.audio.thud(undefined, 0.8, 40);
          this.f.voice.crack(0.5);
          this.f.cabinCrack = Math.max(this.f.cabinCrack, 0.2);
          g.renderer.fx.crackP.set(0.5, 0.72);
          g.notify('It has latched onto the canopy — the hull is being ground through!', 'alert', 4);
          if (!s.grab(this, 'LATCHED', this.f.hostility === 2 ? 14 : 10, 26, (how) => this.shaken(how))) this.shaken('timeout');
        }
        break;
      }
      case 'latched': {
        this.stick(this.mawAt(_x), MAW_Q);
        amp = 0.08;
        s.darkTarget = 0.22 + 0.12 * Math.max(0, Math.sin(this.t * 7.4));
        s.darkColor.setRGB(0.06, 0.0, 0.004);
        this.f.hurtRanger(0.022 * dt, 'hull');
        this.f.cabinCrack = Math.min(0.85, this.f.cabinCrack + dt * 0.05);
        this.f.flash(dt * 0.6);
        this.grindT -= dt;
        if (this.grindT < 0) {
          this.grindT = 1.3;
          this.f.voice.hullGrind(0.32);
          this.game.renderer.fx.shake = Math.max(this.game.renderer.fx.shake, 0.35);
        }
        this.beatT -= dt;
        if (this.beatT < 0) {
          this.beatT = 0.85;
          this.f.voice.heartbeat(0.32);
        }
        const c = s.craft;
        if (c) {
          // its weight drags the Ranger down; the wrapped wings kill the airspeed
          c.vel[1] -= 6 * dt;
          const k = Math.max(0, 1 - 0.1 * dt);
          c.vel[0] *= k;
          c.vel[2] *= k;
        }
        break;
      }
      case 'shaken': {
        this.vel.y -= 9 * dt;
        this.pos.addScaledVector(this.vel, dt);
        this.q.multiply(_q.setFromAxisAngle(AX.x, -dt * 1.5));
        if (this.st > 6) this.setState('cruise');
        break;
      }
    }
    if (near) this.pose(amp);
    this.placeQ();
  }

  /** where the ray's origin sits (Ranger frame) so its sucker is on the glass in front of the pilot */
  private mawAt(out: THREE.Vector3) {
    return out.copy(this.sky.eye).setX(0).add(MAW_GLASS).sub(_v.copy(MAW_MOUTH).multiplyScalar(this.size).applyQuaternion(MAW_Q));
  }

  private shaken(how: FreeHow) {
    const s = this.sky;
    this.setState('shaken');
    this.vel.copy(s.rv).multiplyScalar(0.5).add(_v.set(0, -15, 0));
    this.cooldown = 50;
    s.done(this, 25);
    s.forget('maw');
    this.game.notify(how === 'shock' ? 'The discharge blasted it off the canopy!' : how === 'broke' ? 'It tore loose and fell away!' : 'It let go — the hull is badly scored.', how === 'timeout' ? 'alert' : 'ok', 4);
  }

  private pose(amp: number) {
    const r = this.rig;
    r.reset();
    this.flap += (this.state === 'lunge' ? 1.6 : 0.45) * TAU / 60;
    const w = this.wrap;
    const f = Math.sin(this.flap) * amp * (1 - w);
    r.roll('wingL1', f - 0.7 * w);
    r.roll('wingR1', -f + 0.7 * w);
    r.roll('wingL2', Math.sin(this.flap - 0.8) * amp * (1 - w) - 0.8 * w);
    r.roll('wingR2', -Math.sin(this.flap - 0.8) * amp * (1 - w) + 0.8 * w);
    r.rot('pelvL', AX.z, 0.2 * Math.sin(this.t * 2));
    r.rot('pelvR', AX.z, -0.2 * Math.sin(this.t * 2));
    // the sucker pulses when latched
    r.scale('mouth', 1 + w * 0.08 * Math.sin(this.t * 7.4));
    for (let i = 1; i <= 6; i++) r.rot(`tail${i}`, AX.y, (0.18 + 0.2 * w) * Math.sin(this.t * (1.4 + 2 * w) - i * 0.8));
  }
}

// ================================================================================================ spore bulbs
interface Colony {
  bulbs: SporeBulb[];
  /** seconds since it was set off (−1: dormant) */
  armT: number;
}

class SporeBulb extends Flyer {
  readonly species = 'sporebulb';
  popAt = -1;
  private seed = Math.random() * 100;
  readonly drift = new THREE.Vector3();

  constructor(f: FaunaManager, sky: Sky, readonly colony: Colony) {
    super(f, sky);
    this.view = 5000;
    this.nearR = 900;
  }

  update(dt: number, near: boolean) {
    const s = this.sky;
    const col = this.colony;
    this.pos.addScaledVector(this.drift, dt);
    this.pos.y += Math.sin(this.t * 0.4 + this.seed) * 0.35 * dt;
    this.yaw += dt * 0.05;
    this.q.setFromEuler(_e.set(0.05 * Math.sin(this.t * 0.5 + this.seed), this.yaw, 0.05 * Math.cos(this.t * 0.45 + this.seed), 'YXZ'));
    const d = this.pos.distanceTo(s.rp);
    // the colony's lead bulb keeps its clock and recycles it ahead when it falls far behind
    const lead = col.bulbs.find((b) => b.alive) === this;
    if (lead) {
      if (col.armT >= 0) col.armT += dt;
      else if (this.behind(3000)) {
        s.ahead(2600 + Math.random() * 800, (Math.random() - 0.5) * 300, (Math.random() - 0.5) * 80, _w);
        _w.sub(this.pos);
        for (const b of col.bulbs) b.pos.add(_w);
      }
    }
    // set off: the whole colony lights up, then bursts in a chain from the nearest outward
    if (col.armT < 0 && s.craft && !s.grip && d < 160 * this.size && this.f.hostility >= 1) {
      col.armT = 0;
      const order = col.bulbs.filter((b) => b.alive).sort((a, b) => a.pos.distanceTo(this.pos) - b.pos.distanceTo(this.pos));
      order.forEach((b, i) => (b.popAt = 1.3 + i * 0.2));
      this.f.voice.chime(this.pos, 0.35);
      s.once('spores', () => this.f.host.say('computer', 'Those bulbs are lighting up — pull away!'));
    }
    const armed = col.armT >= 0 ? Math.min(1, col.armT / 1.3) : 0;
    this.setGlow(armed * (2 + 2 * Math.abs(Math.sin(this.t * 19 + this.seed))));
    if ((this.popAt >= 0 && col.armT >= this.popAt) || (s.craft && d < 7 * this.size)) this.pop();
    if (near) {
      const r = this.rig;
      r.reset();
      r.scale('bulb', 1 + 0.1 * armed + 0.02 * Math.sin(this.t * 1.1 + this.seed));
      ['sA', 'sB', 'sC'].forEach((c, k) => {
        for (let i = 1; i <= 4; i++) {
          r.rot(`${c}${i}`, AX.x, 0.07 * Math.sin(this.t * 0.9 - i * 0.6 + k * 2 + this.seed) + armed * 0.04 * Math.sin(this.t * 25 + i));
          r.rot(`${c}${i}`, AX.z, 0.07 * Math.cos(this.t * 0.7 - i * 0.5 + k));
        }
      });
    }
    this.placeQ();
  }

  pop() {
    if (!this.alive) return;
    this.alive = false;
    const s = this.sky;
    this.f.voice.pop(this.pos, 0.6);
    _w.copy(this.pos).add(_v.set(0, 3 * this.size, 0));
    this.f.puffs.burst(_w, 55, SPORE, { speed: 22, up: 4, size: 7 * this.size, life: 6, alpha: 0.55, spread: 14 * this.size });
    this.f.puffs.burst(_w, 30, SPORE2, { speed: 15, up: 3, size: 5.5 * this.size, life: 5, alpha: 0.55, spread: 10 * this.size });
    s.addCloud(_w, 40 * this.size);
    if (this.pos.distanceTo(s.rp) < 60) this.game.renderer.fx.shake = Math.max(this.game.renderer.fx.shake, 0.4);
  }
}

// ================================================================================================ balloon hunter
const HOOKS = [new THREE.Vector3(-2.5, 0.4, -5), new THREE.Vector3(2.5, 0.4, -5), new THREE.Vector3(-3.5, 0.6, 2), new THREE.Vector3(3.5, 0.6, 2), new THREE.Vector3(0, 1.8, -1)];

class Hunter extends Flyer {
  readonly species = 'hunter';
  /** how far the pod hangs below its rest place (m, world) */
  drop = 0;
  /** harpoon line length (m) */
  reel = 0;
  cordsLeft = 0;
  private anchors: THREE.Vector3[] = [];
  private podRest = new THREE.Vector3();
  private cords!: THREE.LineSegments;
  private lines!: THREE.LineSegments;
  private shootT = 0;
  private curl = 0;
  private seed = Math.random() * 100;
  private grindT = 0;

  constructor(f: FaunaManager, sky: Sky) {
    super(f, sky);
    this.view = 12000;
    this.nearR = 3500;
  }

  async init() {
    let data: Record<string, string> | null = null;
    this.inst.root.traverse((o) => {
      if (o.userData?.anchors) data = o.userData as Record<string, string>;
    });
    const dd = data as Record<string, string> | null;
    const v3 = (s: string) => new THREE.Vector3(...s.split(',').map(Number));
    this.anchors = dd ? dd.anchors.split(';').map(v3) : [];
    if (dd) this.podRest.copy(v3(dd.pod));
    const mk = (n: number, color: number) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 6), 3));
      const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color }));
      l.frustumCulled = false;
      this.f.root.add(l);
      return l;
    };
    this.cords = mk(this.anchors.length, 0x1c1410);
    this.lines = mk(HOOKS.length, 0x3a1810);
    this.lines.visible = false;
  }

  /** the pod's crown (world): where the cords meet */
  podTop(out = new THREE.Vector3()) {
    return this.rig.pos('pod', out);
  }

  update(dt: number, near: boolean) {
    const s = this.sky;
    const pod = this.podTop(_u);
    const dPod = pod.distanceTo(s.rp);
    _v.subVectors(s.rp, this.pos).setY(0);
    const dH = _v.length();
    switch (this.state) {
      case 'idle':
      case 'drift': {
        // lying in wait high over the flight path, nose into the oncoming craft
        if (this.behind(3500) || dH > 6000) s.ahead(2400 + Math.random() * 600, (Math.random() - 0.5) * 240, 260 + Math.random() * 60, this.pos);
        this.pos.addScaledVector(_w.set(5, 0, 2), dt);
        this.turnTo(s.rp, 0.05, dt);
        this.drop = damp(this.drop, 0, 0.6, dt);
        // the pod comes down to meet a craft heading its way
        _w.subVectors(this.pos, s.rp).setY(0);
        const coming = _w.dot(s.head) > 0;
        if (this.cooldown <= 0 && coming && dH < 900 && s.claim(this)) {
          this.setState('stalk');
          this.f.voice.chime(this.pos, 0.4);
        }
        break;
      }
      case 'stalk': {
        // drifting across to sit over the path; the pod lowered toward the craft's height
        _w.copy(s.rp).addScaledVector(s.head, dH).setY(s.rp.y + 250 * this.size * 0.75);
        _w.sub(this.pos).setY(0);
        if (_w.length() > 1) this.pos.addScaledVector(_w.normalize(), dt * Math.min(35, _w.length()));
        this.turnTo(s.rp, 0.15, dt);
        const want = Math.max(0, this.pos.y + this.podRest.y * this.size - s.rp.y - 25);
        this.drop = Math.min(want, this.drop + dt * (dH < 320 ? 120 : 25));
        if (dPod < 90 && s.craft) {
          this.setState('harpoon');
          this.shootT = 0;
          this.cordsLeft = HOOKS.length;
          this.reel = dPod;
          this.lines.visible = true;
        }
        _w.subVectors(this.pos, s.rp).setY(0);
        if (this.st > 6 && _w.dot(s.head) < -150) {
          // it missed: the craft is past
          s.done(this, 6);
          this.cooldown = 30;
          this.setState('drift');
        }
        break;
      }
      case 'harpoon': {
        // barbed lines shot one after another; the first to bite starts the reel
        this.shootT += dt;
        if (this.shootT < 0.6 && Math.floor(this.shootT / 0.12) !== Math.floor((this.shootT - dt) / 0.12)) this.f.voice.harpoon(pod, 0.5);
        if (this.shootT > 0.6) {
          this.setState('reel');
          this.game.renderer.fx.shake = Math.max(this.game.renderer.fx.shake, 1);
          this.game.audio.thud(undefined, 0.8, 35);
          this.game.notify('Barbed cords in the hull — it is reeling us in!', 'alert', 4);
          if (!s.grab(this, 'SNARED', this.f.hostility === 2 ? 14 : 10, 30, (how) => this.free(how))) this.free('timeout');
        }
        this.holdCraft(dt, 0.4);
        break;
      }
      case 'reel': {
        this.reel = Math.max(14, this.reel - dt * (this.f.hostility === 2 ? 11 : 7.5));
        this.holdCraft(dt, 1);
        // the cords part one by one as the struggle goes
        const gp = s.grip;
        if (gp && gp.by === this) {
          const left = HOOKS.length - Math.floor((gp.got / gp.need) * HOOKS.length);
          if (left < this.cordsLeft) {
            this.cordsLeft = left;
            this.f.voice.twang(s.rp, 0.4);
          }
        }
        if (this.reel <= 15) {
          this.setState('crush');
          this.game.notify('It has us — the arms are closing around the hull!', 'alert', 4);
        }
        break;
      }
      case 'crush': {
        this.holdCraft(dt, 1);
        this.curl = Math.min(1, this.curl + dt * 1.2);
        this.f.hurtRanger(0.06 * dt, 'hull');
        this.f.cabinCrack = Math.min(0.9, this.f.cabinCrack + dt * 0.08);
        s.darkTarget = 0.25;
        s.darkColor.setRGB(0.05, 0.04, 0.035);
        this.game.renderer.fx.shake = Math.max(this.game.renderer.fx.shake, 0.4);
        this.grindT -= dt;
        if (this.grindT < 0) {
          this.grindT = 0.9;
          this.f.voice.hullGrind(0.4);
          this.game.audio.thud(undefined, 0.5, 30);
        }
        if (this.st > 5 && s.grip?.by === this) s.release('timeout');
        break;
      }
      case 'retract': {
        this.drop = Math.max(0, this.drop - dt * 35);
        this.pos.y += dt * 12;
        this.curl = Math.max(0, this.curl - dt);
        if (this.drop <= 0 && this.st > 4) this.setState('drift');
        break;
      }
    }
    this.yawQ();
    if (near || this.drop > 0) this.pose(near);
    this.placeQ();
    this.drawCords(near);
  }

  /** the harpoon lines hold Ranger 1 within `reel` of the pod; k: how hard */
  private holdCraft(dt: number, k: number) {
    const c = this.sky.craft;
    if (!c) return;
    const pod = this.podTop(_w);
    _v.set(c.pos[0], c.pos[1], c.pos[2]);
    _x.subVectors(_v, pod);
    const d = _x.length();
    if (d < 1e-3) return;
    _x.divideScalar(d);
    const vr = c.vel[0] * _x.x + c.vel[1] * _x.y + c.vel[2] * _x.z;
    if (d > this.reel) {
      // outward speed taken away (the jolt when the lines go taut), and a pull back in
      const cut = vr > 0 ? vr * Math.min(1, 6 * dt * k + (this.state === 'harpoon' ? 0 : 0.2)) : 0;
      const pull = Math.min(40, (d - this.reel) * 1.5) * dt * k;
      for (let i = 0; i < 3; i++) c.vel[i] -= _x.getComponent(i) * (cut + pull);
    }
    if (this.state === 'crush') {
      // drawn in under the pod's head and in front of it, where the feathered arms curl closed
      _x.set(0, -12, -8).multiplyScalar(this.size).applyQuaternion(this.q).add(pod).sub(_v);
      for (let i = 0; i < 3; i++) c.vel[i] = damp(c.vel[i], _x.getComponent(i) * 1.5, 4, dt);
    }
    // the bag is dragged along by its catch
    _u.set(c.vel[0], 0, c.vel[2]);
    this.pos.addScaledVector(_u, dt * 0.6);
  }

  private free(how: FreeHow) {
    const s = this.sky;
    this.lines.visible = false;
    this.cordsLeft = 0;
    this.setState('retract');
    this.cooldown = 60;
    s.done(this, 25);
    this.game.notify(how === 'shock' ? 'The discharge cut the cords!' : how === 'broke' ? 'The cords snapped — we are free!' : 'It dropped us. Hull badly crushed.', how === 'timeout' ? 'alert' : 'ok', 4);
  }

  private yawQ() {
    this.q.setFromEuler(_e.set(0.02 * Math.sin(this.t * 0.2 + this.seed), this.yaw, 0.025 * Math.sin(this.t * 0.15), 'YXZ'));
  }

  private pose(near: boolean) {
    const r = this.rig;
    r.reset();
    r.move('pod', _v.set(0, -this.drop / this.size, 0));
    if (!near) return;
    const b = 0.015 * Math.sin(this.t * 0.4 + this.seed);
    r.scale('bag', _v.set(1 + b, 1, 1 + b));
    r.rot('crown', AX.x, 0.04 * Math.sin(this.t * 1.7));
    r.roll('finL', 0.12 * Math.sin(this.t * 0.7));
    r.roll('finR', -0.12 * Math.sin(this.t * 0.7));
    r.rot('pod', AX.x, 0.08 * Math.sin(this.t * 0.5 + this.seed));
    r.rot('pod', AX.z, 0.06 * Math.cos(this.t * 0.43));
    const hunt = this.state === 'stalk' || this.state === 'harpoon' || this.state === 'reel' ? 1 : 0;
    for (let k = 0; k < 6; k++) {
      for (let i = 1; i <= 3; i++) {
        const ph = this.t * (1 + hunt) - i * 0.8 + k * 1.1;
        // feathered arms trail and ripple; reaching forward to strike, wrapped tight when crushing
        // crushing: the arms swing in under the head and close around what it holds
        r.rot(`feat${k}${i}`, AX.x, 0.14 * Math.sin(ph) * (1 - this.curl) - hunt * 0.25 * (i === 1 ? 1 : 0) + this.curl * (i === 1 ? -0.5 : 0.75));
        r.rot(`feat${k}${i}`, AX.z, 0.1 * Math.cos(ph * 0.7) * (k < 3 ? 1 : -1) * (1 - this.curl) + this.curl * (i === 1 ? 0.35 : 0.45) * (k < 3 ? 1 : -1));
      }
    }
    this.setGlow(0.25 + this.f.night() * 1.2 + hunt * 1.5);
  }

  private drawCords(near: boolean) {
    if (!this.cords) return;
    const vis = near && this.root.visible;
    this.cords.visible = vis && this.anchors.length > 0;
    if (!this.cords.visible) {
      this.lines.visible = false;
      return;
    }
    const pod = this.podTop(_w);
    const p = this.cords.geometry.attributes.position as THREE.BufferAttribute;
    this.inst.root.updateWorldMatrix(true, false);
    const s = 1.6 * this.size;
    this.anchors.forEach((a, i) => {
      _v.copy(a).applyMatrix4(this.inst.root.matrixWorld);
      p.setXYZ(i * 2, _v.x, _v.y, _v.z);
      const ang = (i / this.anchors.length) * TAU;
      p.setXYZ(i * 2 + 1, pod.x + Math.cos(ang) * s, pod.y + 0.5 * s, pod.z + Math.sin(ang) * s);
    });
    p.needsUpdate = true;
    const hooked = this.state === 'harpoon' || this.state === 'reel' || this.state === 'crush';
    this.lines.visible = hooked && this.cordsLeft > 0;
    if (this.lines.visible) {
      const q = this.lines.geometry.attributes.position as THREE.BufferAttribute;
      const front = _x.set(0, -0.5 * this.size, -2.8 * this.size).applyQuaternion(this.q).add(pod);
      const grow = this.state === 'harpoon' ? clamp(this.shootT / 0.5, 0, 1) : 1;
      HOOKS.forEach((h, i) => {
        const on = i < this.cordsLeft;
        this.sky.toWorld(h, _v);
        _v.lerpVectors(front, _v, on ? grow : 0);
        q.setXYZ(i * 2, front.x, front.y, front.z);
        q.setXYZ(i * 2 + 1, _v.x, _v.y, _v.z);
      });
      q.needsUpdate = true;
    }
  }

  dispose() {
    super.dispose();
    for (const l of [this.cords, this.lines]) {
      if (!l) continue;
      l.geometry.dispose();
      (l.material as THREE.Material).dispose();
      l.removeFromParent();
    }
  }
}

// ================================================================================================ population
export async function populateJupiter(f: FaunaManager) {
  // Settings → Science mode 'conservative': no complex animals in Jupiter's clouds
  if (f.settings.science === 'conservative') return;
  const sky = new Sky(f);
  f.creatures.unshift(sky);
  const R = rnd(Math.round(sky.rp.x * 3 + sky.rp.z * 7) + 1777);
  const wind = new THREE.Vector3(6 + R() * 4, 0, (R() - 0.5) * 4);
  const jobs: Promise<unknown>[] = [];
  // a herd of floaters across the sky: some ahead, some far off, of every size
  for (let i = 0; i < f.count(5); i++) {
    const fl = new Floater(f, sky);
    fl.size = 1 + R() * 1.8;
    sky.ahead(400 + R() * 3200, (R() - 0.5) * 3600, -350 + R() * 900, fl.pos);
    fl.drift.copy(wind).multiplyScalar(0.8 + R() * 0.4);
    fl.yaw = R() * TAU;
    jobs.push(f.add(fl, 'fauna_floater', ['floater_tendril']));
  }
  // a pair of veil rays and a maw ray, out in the haze
  for (let i = 0; i < f.count(2); i++) {
    const v = new VeilRay(f, sky, i);
    v.size = 1 + R() * 0.3;
    sky.ahead(1500 + R() * 800, (R() - 0.5) * 1500, 120 + R() * 150, v.pos);
    v.cooldown = 20 + i * 15;
    jobs.push(f.add(v, 'fauna_veilray'));
  }
  for (let i = 0; i < f.count(1); i++) {
    const m = new MawRay(f, sky);
    m.size = 1 + R() * 0.2;
    sky.ahead(-900 - R() * 600, (R() - 0.5) * 1200, -300, m.pos);
    m.cooldown = 40;
    jobs.push(f.add(m, 'fauna_mawray', ['maw_throat']));
  }
  // spore bulb colonies drift into the flight path
  const colony = () => {
    const col: Colony = { bulbs: [], armT: -1 };
    const at = sky.ahead(2200 + R() * 800, (R() - 0.5) * 200, (R() - 0.5) * 60);
    const drift = wind.clone().multiplyScalar(0.9);
    const out: Promise<unknown>[] = [];
    for (let i = 0; i < f.count(7); i++) {
      const b = new SporeBulb(f, sky, col);
      b.size = 1 + R() * 0.7;
      b.pos.set(at.x + (R() - 0.5) * 90, at.y + (R() - 0.5) * 50, at.z + (R() - 0.5) * 90);
      b.drift.copy(drift);
      col.bulbs.push(b);
      out.push(f.add(b, 'fauna_sporebulb', ['puff_spore']));
    }
    return out;
  };
  jobs.push(...colony());
  sky.spawnColony = () =>
    void Promise.all(colony()).then((bs) => bs.forEach((b) => (b as Creature).root.traverse((o) => (o.castShadow = false))));
  // the hunter waits over the flight path
  for (let i = 0; i < f.count(1); i++) {
    const h = new Hunter(f, sky);
    h.size = 1.35;
    sky.ahead(2600 + i * 2500, (R() - 0.5) * 300, 270, h.pos);
    h.cooldown = 25;
    jobs.push(f.add(h, 'fauna_hunter', ['hunter_iris']).then(() => h.init()));
  }
  // the reference sheet's nine (world/fauna/jupiterSheet.ts; loaded lazily — it extends the classes above)
  jobs.push(import('./jupiterSheet').then((m) => m.populateJupiterSheet(f, sky, R, wind)).catch((e) => console.error('[jupiter] sheet species', e)));
  await Promise.all(jobs);
  // the giants are seen through haze far more than up close: they stay out of the shadow map (the rays, which ride
  // on the hull, keep casting)
  for (const c of f.creatures) {
    if (c.species === 'floater' || c.species === 'sporebulb' || c.species === 'hunter') c.root.traverse((o) => (o.castShadow = false));
  }
}
