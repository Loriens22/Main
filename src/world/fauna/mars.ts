import * as THREE from 'three';
import { Creature, FaunaManager, ahead } from './Fauna';
import { AX } from './Rig';

/**
 * Mars: striders (herds, a sonic shriek and a scythe charge), stalkers (eyeless burrowing pack hunters that pounce and
 * pin), lancewings (soaring divers) and tether-kites (drifting kites trailing sticky tethers). Models:
 * blender/assets/fauna_mars.py. Rig axes: rot about +X swings a downward bone forward (and an upward one back).
 */
const TAU = Math.PI * 2;
const _v = new THREE.Vector3();
const _u = new THREE.Vector3();
const DUST = new THREE.Color(0.62, 0.42, 0.3);
const DUST_DARK = new THREE.Color(0.42, 0.28, 0.2);

function rnd(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/** A walking creature: turns, walks on the terrain, keeps a gait phase. */
abstract class Walker extends Creature {
  phase = 0;
  protected target = new THREE.Vector3();

  protected groundY(x: number, z: number) {
    return this.f.host.terrainY(x, z);
  }

  /** walk/run toward a point; speed eases toward `v` */
  protected go(p: THREE.Vector3, v: number, turn: number, dt: number) {
    const d = this.turnTo(p, turn, dt);
    const want = Math.abs(d) > 1.2 ? v * 0.35 : v;
    this.speed = THREE.MathUtils.damp(this.speed, want, 3, dt);
    this.pos.addScaledVector(this.fwd(_v), this.speed * dt);
    this.pos.y = this.groundY(this.pos.x, this.pos.z);
  }

  protected brake(dt: number, k = 4) {
    this.speed = THREE.MathUtils.damp(this.speed, 0, k, dt);
    this.pos.addScaledVector(this.fwd(_v), this.speed * dt);
    this.pos.y = this.groundY(this.pos.x, this.pos.z);
  }

  /** pick a wander point within r of home */
  protected wanderPoint(r: number) {
    const a = Math.random() * TAU;
    const d = r * Math.sqrt(Math.random());
    return this.target.set(this.home.x + Math.cos(a) * d, 0, this.home.z + Math.sin(a) * d);
  }

  /** bring a far-off roamer back near the player (out of sight) */
  protected keepNear(maxD: number, minR: number, maxR: number) {
    const pl = this.game.player.pos;
    if (this.distXZ(pl) < maxD) return;
    const cam = this.game.camera;
    const look = cam.getWorldDirection(_u);
    const a = Math.atan2(-look.z, -look.x) + (Math.random() - 0.5) * 1.6; // behind the camera
    const d = minR + Math.random() * (maxR - minR);
    this.home.set(pl.x + Math.cos(a) * d, 0, pl.z + Math.sin(a) * d);
    this.pos.set(this.home.x, this.groundY(this.home.x, this.home.z), this.home.z);
    this.setState('idle');
  }
}

// ================================================================================================ strider
export class Strider extends Walker {
  readonly species = 'strider';
  private herdI = 0;
  private blastT = 0;
  private struck = false;
  private display = 0;
  private callT = Math.random() * 6;

  constructor(f: FaunaManager, i: number) {
    super(f);
    this.herdI = i;
  }

  update(dt: number, near: boolean) {
    const f = this.f;
    const pl = this.game.player.pos;
    const onFoot = f.host.playerOnFoot();
    const d = this.distXZ(pl);
    const hostile = f.hostility > 0;
    this.keepNear(700, 160, 260);
    this.callT -= dt;
    if (this.callT < 0 && d < 220) {
      this.callT = 5 + Math.random() * 8;
      f.voice.chirp(this.head());
    }
    switch (this.state) {
      case 'idle':
      case 'graze': {
        if (this.state === 'idle' || this.distXZ(this.target) < 2 || this.st > 14) {
          this.wanderPoint(35);
          this.setState('graze');
        }
        this.go(this.target, 1.3, 1.2, dt);
        if (onFoot && d < 55 && this.cooldown <= 0) this.setState('alert');
        break;
      }
      case 'alert': {
        // stop, turn to watch; crest up and the light organs quicken
        this.turnTo(pl, 1.5, dt);
        this.brake(dt);
        f.alarm = 2;
        if (!onFoot || d > 70) this.setState('graze');
        else if (d < 30 && this.st > 1.2) {
          this.setState('display');
          f.voice.stridulate(this.head(), 1.6);
        }
        break;
      }
      case 'display': {
        // rear up, flare the crest, strobe the organs, buzz: a warning — leave now
        this.turnTo(pl, 2, dt);
        this.brake(dt);
        f.alarm = 2;
        if (this.st > (f.hostility === 2 ? 1.6 : 2.6)) {
          if (!onFoot || d > 40) this.setState('graze');
          else if (hostile) {
            this.setState('shriek');
            this.blastT = 0;
            f.voice.shriek(this.head(), 1.8, 0.55);
          } else {
            this.setState('graze');
            this.cooldown = 10;
          }
        }
        break;
      }
      case 'shriek': {
        // jaw drops, a cone of sound: rings ahead; anyone in the cone 30 m out has their visor cracked and ears ringing
        this.turnTo(pl, 1.2, dt);
        this.brake(dt);
        f.alarm = 2;
        this.blastT -= dt;
        if (this.st > 0.5 && this.blastT <= 0) {
          this.blastT = 0.22;
          const hp = this.head();
          f.rings.emit(hp, this.fwd(_v).setY(-0.15), 0xcfeaff, 0.9, 26);
          if (onFoot) {
            const to = _u.copy(pl).sub(hp).setY(0);
            const dd = to.length();
            const cos = to.normalize().dot(this.fwd(_v));
            if (dd < 32 && cos > 0.72) {
              f.hurtPlayer(0.035, { cause: 'a strider’s shriek', crack: [0.5 + (Math.random() - 0.5) * 0.3, 0.55], shake: 1.1 });
              f.slow = 3;
              const fx = this.game.renderer.fx;
              fx.warp = Math.max(fx.warp, 0.6);
            }
          }
        }
        if (this.st > 1.9) {
          if (onFoot && d < 30) f.voice.tinnitus(3.5);
          this.setState(onFoot && d < 22 ? 'charge' : 'recover');
          this.struck = false;
        }
        break;
      }
      case 'charge': {
        f.alarm = 2;
        this.go(pl, f.hostility === 2 ? 9.5 : 8, 2.5, dt);
        if (d < 3.4 && !this.struck) {
          this.setState('strike');
          this.struck = true;
        }
        if (this.st > 6 || !onFoot) this.setState('recover');
        break;
      }
      case 'strike': {
        // the folded arms snap open: a scything blow at 0.25 s
        this.turnTo(pl, 3, dt);
        this.brake(dt, 6);
        if (this.st > 0.25 && this.st - dt <= 0.25 && onFoot && d < 4.2) {
          const knock = this.fwd(_v).clone().multiplyScalar(9).setY(0);
          f.hurtPlayer(f.hostility === 2 ? 0.3 : 0.22, { cause: 'a strider’s scythe', crack: [0.62, 0.62], knock, shake: 1.6 });
          f.puffs.burst(ahead(this, 2.5), 20, DUST, { speed: 3, size: 0.7 });
          this.game.audio.thud(this.pos, 0.8, 50);
        }
        if (this.st > 0.9) this.setState('recover');
        break;
      }
      case 'recover': {
        // trot away, then graze again
        const away = _u.copy(this.pos).sub(pl).setY(0).normalize().multiplyScalar(30).add(this.pos);
        this.go(away, 4, 2, dt);
        if (this.st > 4) {
          this.cooldown = f.hostility === 2 ? 6 : 12;
          this.home.copy(this.pos);
          this.setState('graze');
        }
        break;
      }
    }
    // pulse of the light organs
    const k = this.state === 'display' || this.state === 'shriek' ? 3 + 2.5 * Math.sin(this.t * 22) : this.state === 'alert' ? 2 + Math.sin(this.t * 8) : 1.2 + 0.4 * Math.sin(this.t * 1.7 + this.herdI);
    this.setGlow(Math.max(0.2, k));
    if (near) this.pose(dt);
    this.place();
  }

  head(out = new THREE.Vector3()) {
    return this.rig ? this.rig.pos('head', out).add(_v.set(0, 0.1, 0)) : out.copy(this.pos).setY(this.pos.y + 3.5);
  }

  private pose(dt: number) {
    const r = this.rig;
    r.reset();
    const run = THREE.MathUtils.clamp((this.speed - 1.5) / 5, 0, 1);
    const moving = THREE.MathUtils.clamp(this.speed / 1.2, 0, 1);
    this.phase = (this.phase + dt * (0.7 + this.speed * 0.28)) % 1;
    for (const [s, off] of [['L', 0], ['R', 0.5]] as const) {
      const p = TAU * (this.phase + off);
      const swing = Math.sin(p);
      const lift = Math.max(0, Math.cos(p));
      r.pitch(`thigh.${s}`, (0.32 + 0.4 * run) * swing * moving);
      r.pitch(`shin.${s}`, -(0.45 + 0.6 * run) * lift * moving);
      r.pitch(`meta.${s}`, (0.4 + 0.5 * run) * lift * moving);
      r.pitch(`toe.${s}`, 0.5 * lift * moving);
    }
    const bob = Math.abs(Math.sin(TAU * this.phase)) * moving;
    r.pitch('pelvis', -0.12 * run + 0.03 * bob);
    // the S-neck of the reference: leaning forward from the chest, curving back up, the long head pushed ahead
    const lean = 0.75 + 0.25 * run;
    r.pitch('neck1', -0.42 * lean);
    r.pitch('neck2', -0.22 * lean);
    r.pitch('neck3', 0.12 * lean);
    r.pitch('neck4', 0.3 * lean);
    r.pitch('neck5', 0.28 * lean);
    r.pitch('head', 0.05 + 0.04 * Math.sin(TAU * this.phase * 2) * moving);
    r.pitch('tail1', 0.05 * Math.sin(TAU * this.phase * 2) * moving);
    const st = this.state;
    if (st === 'graze' && this.speed < 0.8) {
      // pecking at the ground
      const peck = Math.max(0, Math.sin(this.t * 1.3 + this.herdI)) ** 3;
      for (let i = 1; i <= 5; i++) r.pitch(`neck${i}`, -0.22 * peck);
      r.pitch('head', 0.2 * peck);
    } else if (st === 'display' || st === 'alert') {
      // rear back, head high, crest flared
      const k = st === 'display' ? Math.min(1, this.st * 2) : 0.5;
      r.pitch('pelvis', 0.18 * k);
      for (let i = 1; i <= 5; i++) r.pitch(`neck${i}`, 0.05 * k + 0.03 * Math.sin(this.t * 9 + i) * k);
      for (let i = 1; i <= 4; i++) r.pitch(`crest${i}`, -0.18 * k + 0.08 * Math.sin(this.t * 14 + i) * k);
      for (const s of ['L', 'R']) r.pitch(`fore.${s}`, -0.25 * k);
    } else if (st === 'shriek') {
      const k = Math.min(1, this.st * 3);
      for (let i = 1; i <= 5; i++) r.pitch(`neck${i}`, -0.08 * k);
      r.pitch('head', -0.1 * k + 0.04 * Math.sin(this.t * 40));
      r.pitch('jaw', -0.55 * k);
      for (let i = 1; i <= 4; i++) r.pitch(`crest${i}`, 0.12 * Math.sin(this.t * 30 + i));
    } else if (st === 'strike') {
      // arms unfold forward and down, then sweep
      const k = Math.sin(Math.min(1, this.st / 0.5) * Math.PI);
      for (const s of ['L', 'R']) {
        r.pitch(`arm.${s}`, -1.1 * k);
        r.pitch(`fore.${s}`, -1.3 * k);
        r.pitch(`claw.${s}`, -0.6 * k);
      }
      r.pitch('pelvis', -0.2 * k);
    }
    // the crest bobs with the gait; the arms sway a little
    for (let i = 1; i <= 4; i++) r.pitch(`crest${i}`, 0.06 * Math.sin(TAU * this.phase * 2 - i * 0.7) * moving);
    for (const [s, k] of [['L', 1], ['R', -1]] as const) r.pitch(`fore.${s}`, 0.05 * k * Math.sin(TAU * this.phase) * moving);
  }
}

// ================================================================================================ stalker
export class Stalker extends Walker {
  readonly species = 'stalker';
  private trailT = 0;
  private leap: { from: THREE.Vector3; to: THREE.Vector3; dur: number } | null = null;
  private biteT = 0;
  private clickT = Math.random() * 3;
  private i = 0;

  constructor(f: FaunaManager, i: number) {
    super(f);
    this.i = i;
  }

  /** how far it hears you: running carries, crouching doesn't (it has no eyes) */
  private hearing() {
    const pl = this.game.player;
    const moving = pl.vel.lengthSq() > 0.3;
    const base = pl.sprinting ? 75 : moving ? 34 : 14;
    const crouch = (pl as unknown as { crouch: number }).crouch ?? 0;
    return base * (1 - 0.7 * crouch) * (1 + 0.4 * this.f.night());
  }

  update(dt: number, near: boolean) {
    const f = this.f;
    const pl = this.game.player.pos;
    const onFoot = f.host.playerOnFoot();
    const d = this.distXZ(pl);
    const hostile = f.hostility > 0;
    this.keepNear(600, 120, 200);
    this.clickT -= dt;
    if (this.clickT < 0 && d < 90 && this.state !== 'buried' && this.state !== 'tunnel') {
      this.clickT = 2 + Math.random() * 4;
      f.voice.clicks(this.headPos(), 5 + Math.floor(Math.random() * 6), 0.2);
    }
    const hidden = this.state === 'buried' || this.state === 'tunnel';
    this.inst.root.visible = !hidden;
    switch (this.state) {
      case 'idle':
        this.setState('buried');
        break;
      case 'buried': {
        // waits under the dust; drifts slowly between resting spots
        this.speed = 0;
        if (onFoot && d < this.hearing() && this.cooldown <= 0) this.setState('tunnel');
        break;
      }
      case 'tunnel': {
        // moves under the surface toward the sound: a trail of rising dust
        this.go(pl, 6.5, 3, dt);
        f.alarm = 2;
        this.trailT -= dt;
        if (this.trailT < 0) {
          this.trailT = 0.09;
          f.puffs.burst(this.pos, 3, DUST, { speed: 1.2, up: 0.6, size: 0.45, life: 1.2 });
        }
        if (Math.random() < dt * 2) f.voice.burrow(this.pos);
        if (!onFoot || d > this.hearing() * 1.5) this.setState('buried');
        else if (d < 8) {
          // erupt
          f.puffs.burst(this.pos, 40, DUST, { speed: 4, up: 3, size: 0.9, life: 2.2 });
          f.voice.growl(this.headPos(), 0.8, 0.5);
          this.setState(hostile ? 'crouch' : 'circle');
        }
        break;
      }
      case 'circle': {
        // prowls around you, low, clicking (passive hostility ends here; then it burrows away)
        f.alarm = 2;
        const a = Math.atan2(this.pos.z - pl.z, this.pos.x - pl.x) + dt * 0.5;
        this.target.set(pl.x + Math.cos(a) * 9, 0, pl.z + Math.sin(a) * 9);
        this.go(this.target, 2.2, 2.5, dt);
        if (this.st > 8 || !onFoot) {
          f.puffs.burst(this.pos, 30, DUST, { speed: 3, up: 2, size: 0.8 });
          this.cooldown = 15;
          this.setState('buried');
        } else if (hostile && this.st > 3 && d < 12 && this.cooldown <= 0) this.setState('crouch');
        break;
      }
      case 'crouch': {
        // coils, jaw open: a short hiss, then the leap
        f.alarm = 2;
        this.turnTo(pl, 4, dt);
        this.brake(dt, 8);
        if (this.st > (f.hostility === 2 ? 0.45 : 0.7)) {
          const to = pl.clone();
          to.y = this.groundY(to.x, to.z);
          // lead the target a little
          to.addScaledVector(this.game.player.vel, 0.25);
          this.leap = { from: this.pos.clone(), to, dur: Math.max(0.45, Math.min(0.9, this.distXZ(to) / 12)) };
          f.voice.scream(this.headPos());
          f.puffs.burst(this.pos, 16, DUST, { speed: 2.5, size: 0.6 });
          this.setState('leap');
        }
        break;
      }
      case 'leap': {
        const L = this.leap!;
        const k = Math.min(1, this.st / L.dur);
        this.pos.lerpVectors(L.from, L.to, k);
        this.pos.y += Math.sin(Math.PI * k) * 2.2;
        this.turnTo(L.to, 6, dt);
        if (k >= 1) {
          this.pos.y = this.groundY(this.pos.x, this.pos.z);
          f.puffs.burst(this.pos, 18, DUST, { speed: 2.5, size: 0.6 });
          if (onFoot && this.distXZ(pl) < 2.0) this.pin();
          else {
            this.setState('circle');
            this.cooldown = 3;
          }
        }
        break;
      }
      case 'pin': {
        // on top of you: bites every ~1.1 s until you throw it off
        f.alarm = 2;
        const at = f.hold?.at ?? pl;
        const back = _u.copy(this.pos).sub(at).setY(0);
        if (back.lengthSq() < 1e-4) back.copy(this.fwd(_v)).negate();
        back.normalize();
        this.pos.copy(at).addScaledVector(back, 1.05);
        this.pos.y = this.groundY(this.pos.x, this.pos.z);
        this.turnTo(at, 8, dt);
        this.biteT -= dt;
        if (this.biteT < 0) {
          this.biteT = f.hostility === 2 ? 0.85 : 1.15;
          f.hurtPlayer(f.hostility === 2 ? 0.09 : 0.07, { cause: 'a stalker', crack: [0.5 + (Math.random() - 0.5) * 0.4, 0.5 + (Math.random() - 0.5) * 0.3], shake: 1.3 });
          f.voice.growl(this.headPos(), 0.45, 0.45);
        }
        if (!f.hold) this.setState('retreat');
        break;
      }
      case 'thrown': {
        // flung off: tumbles back
        const away = _u.copy(this.pos).sub(pl).setY(0).normalize();
        this.pos.addScaledVector(away, Math.max(0, 7 - this.st * 12) * dt);
        this.pos.y = this.groundY(this.pos.x, this.pos.z) + Math.max(0, Math.sin(Math.min(1, this.st / 0.5) * Math.PI)) * 0.8;
        if (this.st > 0.6) this.setState('retreat');
        break;
      }
      case 'retreat': {
        const away = _u.copy(this.pos).sub(pl).setY(0).normalize().multiplyScalar(30).add(this.pos);
        this.go(away, 7, 3, dt);
        if (this.st > 3.5) {
          f.puffs.burst(this.pos, 30, DUST, { speed: 3, up: 2, size: 0.8 });
          this.cooldown = f.hostility === 2 ? 8 : 14;
          this.setState('buried');
        }
        break;
      }
    }
    // tail lash at anyone close behind it
    if (hostile && onFoot && !hidden && this.state !== 'pin' && this.cooldown <= 0 && d < 2.6) {
      const to = _u.copy(pl).sub(this.pos).setY(0).normalize();
      if (to.dot(this.fwd(_v)) < -0.4) {
        f.hurtPlayer(0.1, { cause: 'a stalker’s tail', crack: null, knock: to.clone().multiplyScalar(6), shake: 1 });
        f.voice.growl(this.headPos(), 0.5, 0.35);
        this.cooldown = 2;
      }
    }
    if (near && !hidden) this.pose(dt);
    this.place(this.state === 'leap' ? -0.25 : 0);
  }

  private pin() {
    const f = this.f;
    const need = f.hostility === 2 ? 10 : 7;
    const ok = f.grab(this, 'pin', need, () => this.headPos(), (broke) => {
      if (broke) {
        f.voice.scream(this.headPos(), 0.4);
        this.setState('thrown');
        this.game.notify('You threw it off.', 'ok', 3);
      } else if (this.state === 'pin') this.setState('retreat');
    });
    if (ok) {
      this.biteT = 0.4;
      this.setState('pin');
      this.game.renderer.fx.shake = 1.5;
      this.game.notify('A stalker has you pinned — mash E (Interact) to throw it off!', 'alert', 4);
    } else this.setState('circle');
  }

  headPos(out = new THREE.Vector3()) {
    return this.rig ? this.rig.pos('head', out) : out.copy(this.pos).setY(this.pos.y + 1);
  }

  private pose(dt: number) {
    const r = this.rig;
    r.reset();
    const run = THREE.MathUtils.clamp((this.speed - 2) / 4, 0, 1);
    const moving = THREE.MathUtils.clamp(this.speed / 1.5, 0, 1);
    this.phase = (this.phase + dt * (0.9 + this.speed * 0.32)) % 1;
    const legs: [string, string, string, number, boolean][] = [
      ['uarm.L', 'farm.L', 'hand.L', 0.0, true], ['uarm.R', 'farm.R', 'hand.R', run > 0.5 ? 0.12 : 0.5, true],
      ['thigh.L', 'shin.L', 'foot.L', run > 0.5 ? 0.55 : 0.25, false], ['thigh.R', 'shin.R', 'foot.R', run > 0.5 ? 0.67 : 0.75, false],
    ];
    for (const [a, b, c, off, front] of legs) {
      const p = TAU * (this.phase + off);
      const swing = Math.sin(p);
      const lift = Math.max(0, Math.cos(p));
      const A = (0.35 + 0.45 * run) * moving;
      r.pitch(a, A * swing);
      r.pitch(b, (front ? 0.6 : -0.7) * lift * moving * (0.8 + run));
      r.pitch(c, (front ? -0.5 : 0.6) * lift * moving);
    }
    // the spine flexes with a bounding run
    const flex = Math.sin(TAU * this.phase) * run;
    r.pitch('spine1', 0.1 * flex);
    r.pitch('spine2', 0.08 * flex);
    r.pitch('neck', -0.12 * run);
    for (let i = 1; i <= 7; i++) {
      r.yaw(`tail${i}`, 0.12 * Math.sin(this.t * 2.2 - i * 0.7) * (1 - run * 0.6));
      r.pitch(`tail${i}`, -0.03 * run);
    }
    const st = this.state;
    if (st === 'crouch') {
      const k = Math.min(1, this.st * 3);
      r.pitch('thigh.L', -0.35 * k);
      r.pitch('thigh.R', -0.35 * k);
      r.pitch('shin.L', -0.5 * k);
      r.pitch('shin.R', -0.5 * k);
      r.pitch('uarm.L', -0.3 * k);
      r.pitch('uarm.R', -0.3 * k);
      r.pitch('jaw', -0.5 * k);
      r.pitch('head', 0.15 * k);
    } else if (st === 'leap') {
      // forelimbs reach, hind legs trail, jaw wide
      r.pitch('uarm.L', 0.9);
      r.pitch('uarm.R', 0.9);
      r.pitch('farm.L', 0.5);
      r.pitch('farm.R', 0.5);
      r.pitch('thigh.L', -0.7);
      r.pitch('thigh.R', -0.7);
      r.pitch('jaw', -0.6);
    } else if (st === 'pin') {
      const bite = Math.max(0, Math.sin(this.biteT / 1.15 * Math.PI * 2)) ** 2;
      r.pitch('neck', -0.45);
      r.pitch('head', -0.3 + 0.25 * bite);
      r.pitch('jaw', -0.7 * (1 - bite));
      r.pitch('uarm.L', 0.6);
      r.pitch('uarm.R', 0.6);
    } else if (st === 'circle') {
      r.pitch('neck', -0.25);
      r.pitch('head', 0.1);
      r.pitch('jaw', -0.15 - 0.1 * Math.sin(this.t * 6));
    }
  }
}

// ================================================================================================ lancewing
export class Lancewing extends Creature {
  readonly species = 'lancewing';
  private ang = Math.random() * TAU;
  private radius = 55 + Math.random() * 25;
  private alt = 45 + Math.random() * 25;
  private vel = new THREE.Vector3();
  private pitchA = 0;
  private bank = 0;
  private flapT = Math.random() * 5;
  private diveTo = new THREE.Vector3();
  private hit = false;

  update(dt: number, near: boolean) {
    const f = this.f;
    const pl = this.game.player.pos;
    const onFoot = f.host.playerOnFoot();
    const hostile = f.hostility > 0;
    const dxz = this.distXZ(pl);
    const ground = f.host.terrainY(this.pos.x, this.pos.z);
    // stay in the player's sky
    if (Math.hypot(this.home.x - pl.x, this.home.z - pl.z) > 400) this.home.set(pl.x + (Math.random() - 0.5) * 200, 0, pl.z + (Math.random() - 0.5) * 200);
    let want = new THREE.Vector3();
    let sp = 14;
    let fold = 0;
    switch (this.state) {
      case 'idle':
      case 'soar': {
        this.ang += dt * sp / this.radius;
        want.set(this.home.x + Math.cos(this.ang) * this.radius, f.host.terrainY(this.home.x, this.home.z) + this.alt + 6 * Math.sin(this.t * 0.3), this.home.z + Math.sin(this.ang) * this.radius);
        if (hostile && onFoot && dxz < 150 && this.cooldown <= 0 && this.st > 4) {
          this.setState('mark');
          f.voice.screech(this.pos, 0.45);
        }
        break;
      }
      case 'mark': {
        // a screech; markings blaze; it climbs above you
        f.alarm = 3;
        want.set(pl.x + (this.pos.x - pl.x) * 0.6, pl.y + 85, pl.z + (this.pos.z - pl.z) * 0.6);
        sp = 18;
        if (this.st > 3.2) {
          if (!onFoot) {
            this.setState('soar');
            this.cooldown = 10;
          } else {
            this.setState('dive');
            this.hit = false;
            f.voice.whistle(this.pos, 2.0, 0.45);
          }
        }
        break;
      }
      case 'dive': {
        // fins swept into a dart, straight at where you will be
        f.alarm = 3;
        this.diveTo.copy(pl).addScaledVector(this.game.player.vel, 0.35);
        this.diveTo.y += 0.9;
        want.copy(this.diveTo);
        sp = Math.min(44, 20 + this.st * 22);
        fold = 1;
        const dd = this.pos.distanceTo(this.diveTo);
        if (!this.hit && onFoot && dd < 2.4) {
          this.hit = true;
          const knock = this.vel.clone().setY(0).normalize().multiplyScalar(10);
          f.hurtPlayer(f.hostility === 2 ? 0.32 : 0.24, { cause: 'a lancewing', crack: [0.5, 0.45], knock, shake: 1.8 });
          this.game.audio.thud(pl, 0.9, 45);
          this.setState('pull');
        } else if (this.pos.y - ground < 3 || (dd < 6 && this.vel.dot(_u.copy(this.diveTo).sub(this.pos)) < 0) || this.st > 6 || !onFoot) this.setState('pull');
        break;
      }
      case 'pull': {
        // skims, kicks up a wake of dust, climbs out
        sp = 30;
        fold = Math.max(0, 1 - this.st * 2);
        want.copy(this.pos).addScaledVector(this.vel.clone().setY(0).normalize(), 40).setY(ground + 30 + this.st * 10);
        if (this.st < 0.6 && this.pos.y - ground < 6 && Math.random() < 0.6) f.puffs.burst(_u.copy(this.pos).setY(ground), 4, DUST, { speed: 5, up: 2, size: 0.8 });
        if (this.st > 3) {
          this.cooldown = f.hostility === 2 ? 10 : 18;
          this.setState('soar');
        }
        break;
      }
    }
    // fly: steer the velocity toward the wanted point, bank into turns, pitch along the path
    const to = want.sub(this.pos);
    const desired = to.normalize().multiplyScalar(sp);
    const k = this.state === 'dive' ? 3.5 : 1.2;
    const prevYaw = this.yaw;
    this.vel.lerp(desired, Math.min(1, dt * k));
    this.pos.addScaledVector(this.vel, dt);
    if (this.pos.y < ground + 1.5) this.pos.y = ground + 1.5;
    const hv = Math.hypot(this.vel.x, this.vel.z);
    if (hv > 0.5) this.yaw = Math.atan2(-this.vel.x, -this.vel.z);
    let dy = this.yaw - prevYaw;
    while (dy > Math.PI) dy -= TAU;
    while (dy < -Math.PI) dy += TAU;
    this.bank = THREE.MathUtils.damp(this.bank, THREE.MathUtils.clamp((-dy / Math.max(dt, 1e-3)) * 0.5, -0.9, 0.9), 3, dt);
    this.pitchA = THREE.MathUtils.damp(this.pitchA, Math.atan2(this.vel.y, Math.max(hv, 0.1)), 4, dt);
    this.speed = this.vel.length();
    this.setGlow(this.state === 'mark' || this.state === 'dive' ? 2.5 + 1.5 * Math.sin(this.t * 18) : 0.7);
    // slow wingbeats while soaring
    this.flapT -= dt;
    if (this.flapT < 0 && this.state !== 'dive' && dxz < 120) {
      this.flapT = 2.5 + Math.random() * 3;
      f.voice.wingbeat(this.pos);
    }
    if (near) this.pose(fold);
    this.place(this.pitchA, this.bank);
  }

  private pose(fold: number) {
    const r = this.rig;
    r.reset();
    // fins: a slow scissor beat about the body's long axis; swept back toward the tail in a dive
    const beat = Math.sin(this.t * 2.2) * (1 - fold) * 0.22;
    for (const [n, s] of [['finUL', 1], ['finUR', -1], ['finLL', -1], ['finLR', 1]] as const) {
      r.roll(`${n}1`, beat * s);
      r.roll(`${n}2`, beat * s * 0.6 + 0.08 * Math.sin(this.t * 2.2 - 0.6) * (1 - fold) * s);
      r.rot(`${n}1`, AX.x, -1.0 * fold * (n.includes('U') ? 1 : -1));
    }
    for (let i = 1; i <= 4; i++) {
      r.yaw(`tail${i}`, 0.08 * Math.sin(this.t * 1.6 - i * 0.6) * (1 - fold));
      r.pitch(`tail${i}`, 0.04 * Math.sin(this.t * 2.2 - i * 0.8));
    }
    for (let k = 0; k < 6; k++) r.yaw(`tusk${k}`, 0.04 * Math.sin(this.t * 3 + k));
    r.pitch('whiskL1', 0.15 * Math.sin(this.t * 2));
    r.pitch('whiskR1', 0.15 * Math.sin(this.t * 2 + 1));
  }
}

// ================================================================================================ tether-kite
export class Tetherkite extends Creature {
  readonly species = 'tetherkite';
  private wind = new THREE.Vector2();
  private alt = 24 + Math.random() * 12;
  private rope: THREE.Vector3[] = [];
  private prev: THREE.Vector3[] = [];
  private line!: THREE.Line;
  private readonly N = 32;
  private readonly seg = 1.5;
  private snag = false;
  private lift = 0;
  private hookAt = 0;

  init() {
    for (let i = 0; i < this.N; i++) {
      const p = this.pos.clone().setY(this.pos.y - i * this.seg);
      this.rope.push(p);
      this.prev.push(p.clone());
    }
    const g = new THREE.BufferGeometry().setFromPoints(this.rope);
    this.line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xd9dce4, transparent: true, opacity: 0.8 }));
    this.line.frustumCulled = false;
    this.f.root.add(this.line);
    const a = Math.random() * TAU;
    this.wind.set(Math.cos(a), Math.sin(a)).multiplyScalar(1.2);
  }

  update(dt: number, near: boolean) {
    const f = this.f;
    const pl = this.game.player.pos;
    const onFoot = f.host.playerOnFoot();
    // drift on the wind, bob, stay around the player
    if (this.distXZ(pl) > 450) {
      const a = Math.random() * TAU;
      this.pos.set(pl.x + Math.cos(a) * 220, 0, pl.z + Math.sin(a) * 220);
      this.pos.y = f.host.terrainY(this.pos.x, this.pos.z) + this.alt;
      this.rope.forEach((p, i) => p.copy(this.pos).setY(this.pos.y - i * this.seg));
      this.prev.forEach((p, i) => p.copy(this.rope[i]));
    }
    const ground = f.host.terrainY(this.pos.x, this.pos.z);
    const gust = this.snag ? 1 + this.lift * 2 : 1;
    this.pos.x += this.wind.x * dt * gust;
    this.pos.z += this.wind.y * dt * gust;
    const want = ground + this.alt + 2 * Math.sin(this.t * 0.4) + this.lift * 9;
    this.pos.y = THREE.MathUtils.damp(this.pos.y, want, 1, dt);
    this.yaw = Math.atan2(-this.wind.x, -this.wind.y) + 0.3 * Math.sin(this.t * 0.7);
    // the tether: verlet chain hanging from the tail, dragging on the ground (or hooked on you)
    this.rope[0].copy(this.pos).setY(this.pos.y - 1.6);
    for (let i = 1; i < this.N; i++) {
      const p = this.rope[i], q = this.prev[i];
      const vx = (p.x - q.x) * 0.96, vy = (p.y - q.y) * 0.96, vz = (p.z - q.z) * 0.96;
      q.copy(p);
      p.x += vx;
      p.y += vy - 3.7 * dt * dt * 4;
      p.z += vz;
    }
    for (let it = 0; it < 6; it++) {
      for (let i = 1; i < this.N; i++) {
        const a = this.rope[i - 1], b = this.rope[i];
        const d = _v.copy(b).sub(a);
        const len = d.length() || 1e-4;
        const diff = (len - this.seg) / len;
        if (i === 1) b.addScaledVector(d, -diff);
        else {
          a.addScaledVector(d, diff * 0.5);
          b.addScaledVector(d, -diff * 0.5);
        }
      }
      if (this.snag) {
        // hooked on the suit: the player hangs from the line
        this.rope[this.hookAt].copy(pl).setY(pl.y + 1.4);
      }
      for (let i = 1; i < this.N; i++) {
        const gy = f.host.terrainY(this.rope[i].x, this.rope[i].z) + 0.05;
        if (this.rope[i].y < gy) this.rope[i].y = gy;
      }
    }
    (this.line.geometry as THREE.BufferGeometry).setFromPoints(this.rope);
    this.line.visible = this.root.visible;
    // snag: touching the tether glues it to the suit; a gust lifts you; break free (E) or ride it until it lets go
    if (!this.snag && onFoot && f.hostility > 0 && this.cooldown <= 0 && !f.hold) {
      for (let i = 4; i < this.N; i++) {
        const p = this.rope[i];
        if (Math.hypot(p.x - pl.x, p.z - pl.z) < 0.7 && p.y < pl.y + 1.9) {
          this.snag = true;
          this.hookAt = i;
          this.lift = 0;
          f.voice.twang(pl, 0.3);
          this.game.notify('The tether stuck to your suit — mash E (Interact) to tear free before it lifts you!', 'alert', 4);
          f.grab(this, 'lift', f.hostility === 2 ? 7 : 5, () => this.pos, (broke) => this.letGo(broke));
          break;
        }
      }
    }
    if (this.snag && f.hold?.by === this) {
      this.lift = Math.min(1, this.lift + dt * 0.22);
      const hd = f.hold;
      hd.at.lerp(_u.copy(this.pos).setY(this.pos.y - (this.N - 1 - this.hookAt) * 0.6 - 2.5), dt * 0.35 * this.lift);
      hd.at.y = Math.max(hd.at.y, f.host.terrainY(hd.at.x, hd.at.z));
      f.alarm = 2;
      if (this.lift >= 1 && hd.t > 7) f.release(false);
    }
    this.setGlow(this.snag ? 2.5 : 0.6 + 0.3 * Math.sin(this.t * 2));
    if (near) {
      const r = this.rig;
      r.reset();
      r.roll('k2', 0.15 * Math.sin(this.t * 1.3));
      r.pitch('k2', 0.1 * Math.sin(this.t * 0.9));
      r.pitch('curl1', 0.2 * Math.sin(this.t * 1.1));
    }
    this.place();
  }

  private letGo(broke: boolean) {
    const f = this.f;
    this.snag = false;
    this.cooldown = 12;
    const pl = this.game.player.pos;
    const hgt = pl.y - f.host.terrainY(pl.x, pl.z);
    f.voice.twang(pl, 0.25);
    // the fall
    if (hgt > 2.2) f.hurtPlayer(Math.min(0.5, (hgt - 2) * 0.035), { cause: 'a fall from a tether-kite', crack: null, shake: 1.4 });
    if (broke) this.game.notify(hgt > 2.2 ? `Torn free — dropped ${hgt.toFixed(0)} m.` : 'Torn free.', 'warn', 3);
    else this.game.notify(`The tether let go — dropped ${hgt.toFixed(0)} m.`, 'warn', 3);
    this.lift = 0;
  }

  dispose() {
    super.dispose();
    this.line?.removeFromParent();
    this.line?.geometry.dispose();
  }
}

// ================================================================================================ population
/** Mars population around the player when the zone loads (counts × the density setting), seeded by the site. */
export async function populateMars(f: FaunaManager) {
  const pl = f.game.player.pos.clone();
  const R = rnd(Math.round(pl.x * 13 + pl.z * 7) + 911);
  const host = f.host;
  const at = (a: number, d: number) => new THREE.Vector3(pl.x + Math.cos(a) * d, 0, pl.z + Math.sin(a) * d);
  const jobs: Promise<unknown>[] = [];
  // a herd of striders
  const ha = R() * TAU;
  const herd = at(ha, 120 + R() * 50);
  for (let i = 0; i < f.count(3); i++) {
    const s = new Strider(f, i);
    s.home.copy(herd);
    s.pos.set(herd.x + (R() - 0.5) * 16, 0, herd.z + (R() - 0.5) * 16);
    s.pos.y = host.terrainY(s.pos.x, s.pos.z);
    s.yaw = R() * TAU;
    jobs.push(f.add(s, 'fauna_strider', ['strider_glow']));
  }
  // a stalker pack, buried
  const pa = ha + 2 + R();
  const pack = at(pa, 75 + R() * 30);
  for (let i = 0; i < f.count(2); i++) {
    const s = new Stalker(f, i);
    s.home.copy(pack);
    s.pos.set(pack.x + (R() - 0.5) * 12, 0, pack.z + (R() - 0.5) * 12);
    s.pos.y = host.terrainY(s.pos.x, s.pos.z);
    jobs.push(f.add(s, 'fauna_stalker'));
  }
  // lancewings circling
  for (let i = 0; i < f.count(2); i++) {
    const l = new Lancewing(f);
    l.home.copy(at(R() * TAU, 90 + R() * 60));
    l.pos.set(l.home.x + 60, host.terrainY(l.home.x, l.home.z) + 60, l.home.z);
    l.setState('soar');
    jobs.push(f.add(l, 'fauna_lancewing', ['wing_mark']));
  }
  // tether-kites drifting
  for (let i = 0; i < f.count(4); i++) {
    const k = new Tetherkite(f);
    const p = at(R() * TAU, 60 + R() * 160);
    k.pos.set(p.x, host.terrainY(p.x, p.z) + 28, p.z);
    jobs.push(f.add(k, 'fauna_tetherkite', ['wing_mark']).then((c) => (c as Tetherkite).init()));
  }
  await Promise.all(jobs);
}
