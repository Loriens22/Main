import * as THREE from 'three';
import type { Contact, Creature, Habitat } from './Creature';
import { hashRand } from './Creature';

/**
 * Decision making, per behavioural archetype. Each brain runs a few times a second on what the animal has sensed
 * (c.sensed) and its needs, and sets a state, a goal point and a wanted speed. Utilities are simple and specific:
 * immediate hazard outranks feeding; attacks need hunger, a suitable target at a reachable range, and energy;
 * defence depends on the nest; failure and injury make it give up.
 */

const _v = new THREE.Vector3(), _w = new THREE.Vector3();

export type Brain = (c: Creature, H: Habitat) => void;

/** wander near a point: a new nearby goal now and then */
function wander(c: Creature, around: THREE.Vector3, radius: number, speed: number, H: Habitat, vertical = 0) {
  if (c.pos.distanceTo(c.goal) < Math.max(0.05, c.length * 0.4) || c.stateT > 25 || c.goal.lengthSq() === 0) {
    const a = hashRand(c.id, Math.floor(H.time * 10)) * Math.PI * 2;
    const r = radius * Math.sqrt(hashRand(c.id, Math.floor(H.time * 10) + 7));
    c.goal.set(around.x + Math.cos(a) * r, around.y + (hashRand(c.id, Math.floor(H.time * 10) + 3) - 0.5) * vertical, around.z + Math.sin(a) * r);
    c.stateT = 0;
  }
  c.speedWant = speed;
}

/** the biggest sensed threat (anything much larger than the animal, moving, or remembered as dangerous) */
function threat(c: Creature, minRatio = 1.2) {
  let best: { c: Contact; d: number; conf: number } | null = null;
  for (const s of c.sensed) {
    const mem = c.memory.get(s.c.id);
    const big = s.c.size > c.length * minRatio;
    const bad = mem ? mem.val < -0.3 : false;
    if ((big && (s.c.vel.length() > 0.2 || s.d < c.length * 3)) || bad) { if (!best || s.d < best.d) best = s; }
  }
  return best;
}

function prey(c: Creature, lo: number, hi: number, range: number) {
  for (const s of c.sensed) {
    if (s.d > range || s.conf < 0.3) continue;
    const r = s.c.size / c.length;
    if (s.c.kind === 'prey' && r <= hi) return s;
    if ((s.c.kind === 'creature' || s.c.kind === 'player') && r >= lo && r <= hi) return s;
  }
  return null;
}

/** flee: away from a point */
function flee(c: Creature, from: THREE.Vector3, speed: number) {
  _v.copy(c.pos).sub(from);
  _v.y *= 0.3;
  if (_v.lengthSq() < 1e-6) _v.set(1, 0, 0);
  c.goal.copy(c.pos).addScaledVector(_v.normalize(), c.length * 8 + 5);
  c.speedWant = speed;
}

/** go to shelter ahead of the hazard; true while doing so */
function seekShelter(c: Creature, H: Habitat, threshold = 2) {
  const hz = H.hazard(c.pos);
  // animals act on what they can feel of the precursors, not on the true schedule
  const felt = hz.state >= threshold && hz.cue > 0.2;
  if (!felt) return false;
  const r = H.refuge(c) ?? c.den ?? c.home;
  c.goal.copy(r);
  c.speedWant = c.pos.distanceTo(r) > c.length ? c.def.speed.cruise * 1.8 : 0;
  c.setState('shelter', 'seeking shelter from the coming wave');
  c.hidden = Math.min(1, c.hidden + 0.2);
  return true;
}

// ============================================================================================= grazer
/** small grazers: forage in slow steps over the film, clamp or hide from flow and from large moving shapes */
export const grazer: Brain = (c, H) => {
  const hz = H.hazard(c.pos);
  if (hz.state >= 2 || hz.cue > 0.55) {
    const r = H.refuge(c);
    if (r && c.pos.distanceTo(r) > 0.05) { c.goal.copy(r); c.speedWant = c.def.speed.burst; }
    else c.speedWant = 0;
    c.hidden = Math.min(1, c.hidden + 0.25);
    c.setState('hide', hz.state >= 2 ? 'retreating into a fissure' : 'clamping down against the current');
    return;
  }
  const t = threat(c, 3);
  if (t) {
    c.stress = Math.min(1, c.stress + 0.3);
    c.speedWant = 0;
    c.hidden = Math.min(1, c.hidden + 0.3);
    c.setState('hide', 'clamped to the rock');
    H.observe(c, 'clamped');
    return;
  }
  c.hidden = Math.max(0, c.hidden - 0.1);
  if (c.state === 'feed' && c.stateT < 6 + hashRand(c.id, Math.floor(H.time / 7)) * 8) { c.speedWant = 0; c.energy = Math.min(1, c.energy + 0.004); return; }
  if (c.state !== 'forage' || c.pos.distanceTo(c.goal) < 0.03) {
    if (c.state === 'forage') { c.setState('feed', 'grazing the microbial film'); c.speedWant = 0; H.observe(c, 'grazing'); return; }
    c.setState('forage', 'moving over the rock');
    c.goal.set(0, 0, 0);
  }
  wander(c, c.home, c.length * 6, c.def.speed.cruise, H);
};

// ============================================================================================= ambush predator
/** waits in cover, aligns with prey, one burst; gives up after a miss; investigates but does not eat vehicles */
export const ambush: Brain = (c, H) => {
  if (c.state === 'attack') return attackStep(c, H);
  if (seekShelter(c, H)) return;
  const den = c.den ?? c.home;
  const hungry = 1 - c.energy;
  // a recent failed strike: recover first (no chasing)
  if (c.state === 'recover' && c.stateT < 8 + c.failures * 4) { c.goal.copy(den); c.speedWant = c.def.speed.cruise * 0.6; return; }
  const p = hungry > 0.35 && c.fatigue < 0.5 && c.injury < 0.6 ? prey(c, 0.04, 0.45, c.length * 4) : null;
  if (p) {
    c.target = p.c;
    // align quietly, then burst from a short range
    if (p.d < c.length * 1.1) { c.setState('attack', 'striking'); c.speedWant = c.def.speed.burst; c.goal.copy(p.c.pos); H.observe(c, 'strike'); return; }
    c.setState('stalk', 'aligning with prey, body tensed');
    c.goal.copy(p.c.pos);
    c.speedWant = c.def.speed.cruise * 0.5;
    return;
  }
  // a vehicle or a large unknown: cautious inspection if bold and not stressed, otherwise hold still
  const big = c.sensed.find((s) => (s.c.kind === 'sub' || s.c.kind === 'player') && s.conf > 0.4);
  if (big) {
    const mem = c.memory.get(big.c.id);
    const nearDen = big.c.pos.distanceTo(den) < c.length * 1.5;
    if (nearDen && (mem?.val ?? 0) < 0.2) {
      // too close to its shelter: threat posture, then a defensive lunge if it keeps coming
      c.goal.copy(big.c.pos); c.speedWant = 0.2;
      if (big.d < c.length * 0.35 && c.stateT > 2.5 && c.state === 'warn') { c.target = big.c; c.setState('attack', 'defending its shelter'); c.speedWant = c.def.speed.burst * 0.7; return; }
      c.setState('warn', 'threat posture: jaws parted, body arched'); H.observe(c, 'warning');
      return;
    }
    if (c.bold > 0.4 && c.stress < 0.5 && big.d > c.length * 1.2 && c.stateT < 30) {
      c.setState('investigate', 'circling a vehicle at a distance');
      _v.copy(big.c.pos).sub(c.pos).normalize();
      _w.crossVectors(_v, new THREE.Vector3(0, 1, 0)).normalize();
      c.goal.copy(big.c.pos).addScaledVector(_w, c.length * 2).addScaledVector(_v, -c.length * 1.2);
      c.speedWant = c.def.speed.cruise;
      return;
    }
  }
  // rest under its overhang most of the time; patrol a little when hungry
  if (hungry > 0.6 && c.state !== 'patrol') c.setState('patrol', 'patrolling its range');
  if (c.state === 'patrol') { wander(c, den, c.length * 12, c.def.speed.cruise, H, 6); if (c.stateT > 60) c.setState('rest', 'holding still in cover'); return; }
  c.setState('rest', 'holding still in cover');
  c.goal.copy(den); c.speedWant = c.pos.distanceTo(den) > c.length * 0.5 ? c.def.speed.cruise * 0.6 : 0;
};

/** the burst: aim at where the target will be, close the jaws on contact, recover either way */
function attackStep(c: Creature, H: Habitat) {
  const t = c.target;
  const timeout = 2.2;
  if (!t) { c.setState('recover', 'recovering'); return; }
  c.goal.copy(t.pos).addScaledVector(t.vel, 0.3);
  c.speedWant = c.def.speed.burst;
  // contact: the mouth (the front of the body) reaches the target
  _v.copy(c.fwd).multiplyScalar(c.length * 0.45).add(c.pos);
  const reach = c.def.threat.reach * Math.max(0.5, c.scale) + t.size * 0.5;
  if (_v.distanceTo(t.pos) < reach) {
    if (t.kind === 'prey') { c.energy = Math.min(1, c.energy + H.feed(c, t)); H.observe(c, 'kill'); }
    else H.strike(c, t, c.def.threat.harm);
    c.failures = 0;
    c.target = null;
    c.setState('recover', 'releasing and turning away');
    return;
  }
  if (c.stateT > timeout || c.fatigue > 0.8) {
    c.failures++;
    c.energy = Math.max(0, c.energy - 0.03);
    c.target = null;
    c.setState('recover', 'missed: recovering');
    H.observe(c, 'miss');
  }
}


// ============================================================================================= trap (buried suction feeder)
/** lies buried; a short-range suction strike at small things that move over it; startled by large ones close by */
export const trap: Brain = (c, H) => {
  const hz = H.hazard(c.pos);
  c.speedWant = 0;
  if (hz.state >= 2 || hz.cue > 0.5) { c.hidden = 1; c.setState('hide', 'burrowed deep against the current'); H.observe(c, 'shelter'); return; }
  if (c.state === 'attack') {
    if (c.stateT > 0.6) {
      const t = c.target;
      if (t && t.pos.distanceTo(c.pos) < c.def.threat.reach * c.scale + t.size * 0.3) {
        if (t.kind === 'prey' || t.kind === 'creature') { c.energy = Math.min(1, c.energy + H.feed(c, t)); H.observe(c, 'kill'); }
        else H.strike(c, t, c.def.threat.harm);
      } else { c.failures++; c.energy = Math.max(0, c.energy - 0.02); H.observe(c, 'miss'); }
      c.target = null;
      c.setState('recover', 'resetting, sand settling');
    }
    return;
  }
  if (c.state === 'recover' && c.stateT < 6) return;
  c.hidden = Math.max(0.85, c.hidden - 0.05);
  for (const s of c.sensed) {
    const reach = c.def.threat.reach * c.scale + s.c.size * 0.3;
    if (s.d > reach * 1.3) continue;
    const moving = s.c.vel.length() > 0.08;
    // too big to take: only a startled snap when something steps right on it
    if (moving && (s.c.size < c.length * 0.5 || s.d < reach * 0.6)) {
      c.target = s.c; c.setState('attack', 'suction strike'); c.jaw = 0; H.observe(c, 'strike');
      return;
    }
  }
  c.setState('hide', 'buried, the mouth rim just under the sand');
  if (c.stateT > 10) H.observe(c, 'buried');
};

// ============================================================================================= lure (cave light predator)
/** holds by a cave wall with its lure lit; strikes at small prey that comes to the light; darkens and retreats when alarmed */
export const lure: Brain = (c, H) => {
  const den = c.den ?? c.home;
  const hz = H.hazard(c.pos);
  if (hz.state >= 2 && hz.cue > 0.2) { c.display = Math.max(0, c.display - 0.3); c.goal.copy(den); c.speedWant = c.def.speed.cruise * 2; c.setState('shelter', 'withdrawn into the recess, lure dark'); return; }
  const t = threat(c, 2.5);
  if (t && t.d < 6) { c.display = Math.max(0, c.display - 0.4); flee(c, t.c.pos, c.def.speed.burst * 0.6); c.goal.lerp(den, 0.5); c.setState('flee', 'darkened and slipping into a crevice'); c.stress = Math.min(1, c.stress + 0.3); return; }
  if (c.state === 'attack') return attackStep(c, H);
  const p = c.energy < 0.85 ? prey(c, 0, 0.3, 1.5) : null;
  if (p && p.d < 0.6) { c.target = p.c; c.setState('attack', 'snap'); c.speedWant = c.def.speed.burst; H.observe(c, 'strike'); return; }
  // hover by the wall, lure glowing (a metabolic cost: dimmer when well fed or nothing comes)
  c.display = Math.min(1, c.display + 0.08) * (c.energy > 0.9 ? 0.5 : 1);
  c.energy = Math.max(0, c.energy - 0.0004);
  c.setState('idle', 'hovering by the rock, lure lit');
  wander(c, den, 1.5, c.def.speed.cruise * 0.4, H, 0.6);
  if (c.stateT > 8) H.observe(c, 'lure');
};

// ============================================================================================= pack (acoustic social hunters)
/** loose group travel with spacing; when one member senses a school, others take flanking positions; one strikes */
export const pack: Brain = (c, H) => {
  const mates = H.group?.(c) ?? [];
  if (seekShelter(c, H)) { c.speedWant = c.def.speed.cruise * 1.4; H.observe(c, 'calls'); return; }
  if (c.state === 'attack') return attackStep(c, H);
  // a school sensed by me or any mate within calling range
  let school: Contact | null = null;
  for (const m of [c, ...mates]) {
    const p = m.sensed.find((s) => s.c.kind === 'prey' && s.d < 60);
    if (p) { school = p.c; break; }
  }
  const hungry = 1 - c.energy;
  if (school && hungry > 0.3 && c.fatigue < 0.6) {
    const idx = mates.length ? [c, ...mates].sort((a, b) => a.id.localeCompare(b.id)).indexOf(c) : 0;
    const d = school.pos.distanceTo(c.pos);
    // the first in order strikes once the others are spread round the school
    const ready = mates.filter((m) => m.state === 'stalk' && m.pos.distanceTo(school!.pos) < 18).length >= Math.min(2, mates.length);
    if (idx === 0 && ready && d < 14) { c.target = school; c.setState('attack', 'driving into the school'); c.speedWant = c.def.speed.burst; H.observe(c, 'flank'); return; }
    if (idx !== 0 && c.stateT > 3 && mates.some((m) => m.state === 'attack') && d < 10) { c.target = school; c.setState('attack', 'taking scattered fish'); c.speedWant = c.def.speed.burst * 0.8; return; }
    const ang = (idx / Math.max(1, mates.length + 1)) * Math.PI * 2;
    c.goal.copy(school.pos).add(_v.set(Math.cos(ang) * 12, (idx % 2 ? 3 : -3), Math.sin(ang) * 12));
    c.speedWant = c.def.speed.cruise * 1.3;
    c.setState('stalk', 'flanking a school, calls quickening');
    H.observe(c, 'calls');
    return;
  }
  // a vehicle: investigate in a loose ring, then lose interest
  const veh = c.sensed.find((s) => s.c.kind === 'sub' && s.conf > 0.3);
  if (veh && c.stress < 0.6 && (c.memory.get(veh.c.id)?.val ?? 0) > -0.4 && c.stateT < 40) {
    _w.copy(c.pos).sub(veh.c.pos).setY(0).normalize();
    c.goal.copy(veh.c.pos).addScaledVector(_w, 9).add(_v.set(0, 2, 0));
    c.speedWant = c.def.speed.cruise;
    c.setState('investigate', 'circling the submersible, clicking');
    H.observe(c, 'investigate');
    return;
  }
  // travel together: follow the group's centre along the canyon with some spacing
  if (mates.length) {
    const ctr = _v.set(0, 0, 0);
    for (const m of mates) ctr.add(m.pos);
    ctr.divideScalar(mates.length);
    const lead = [c, ...mates].sort((a, b) => a.id.localeCompare(b.id))[0];
    if (lead === c) wander(c, c.home, 120, c.def.speed.cruise, H, 30);
    else {
      c.goal.copy(lead.goal).addScaledVector(_w.copy(c.pos).sub(ctr).setY(0).normalize(), 6);
      // keep apart from the nearest mate
      for (const m of mates) if (m.pos.distanceTo(c.pos) < 4) c.goal.addScaledVector(_w.copy(c.pos).sub(m.pos).normalize(), 4);
      c.speedWant = c.def.speed.cruise * (c.pos.distanceTo(ctr) > 20 ? 1.4 : 1);
    }
  } else wander(c, c.home, 120, c.def.speed.cruise, H, 30);
  c.setState('patrol', 'travelling the channel in a loose group');
};

// ============================================================================================= builder (stone-wall nest)
/** forages near the nest, fetches stones and sets them in the wall, repairs it after the wave, defends the eggs */
export const builder: Brain = (c, H) => {
  const nest = H.nest?.(c);
  const den = c.den ?? c.home;
  if (seekShelter(c, H)) return;
  // an intruder close to the eggs: posture, taps; a grab only within reach
  const intr = c.sensed.find((s) => (s.c.kind === 'player' || s.c.kind === 'sub' || (s.c.kind === 'creature' && s.c.size > c.length)) && s.c.pos.distanceTo(den) < c.length * 2.2);
  if (intr) {
    c.goal.copy(den).lerp(intr.c.pos, 0.3); c.speedWant = c.def.speed.cruise;
    c.display = 1;
    if (intr.d < c.def.threat.reach * c.scale + intr.c.size * 0.4 && c.state === 'warn' && c.stateT > 3) { H.strike(c, intr.c, c.def.threat.harm); c.setState('recover', 'grabbed, then backed off'); return; }
    if (c.state !== 'warn') c.setState('warn', 'front raised over the nest, tapping');
    H.observe(c, 'guarding');
    return;
  }
  c.display = Math.max(0, c.display - 0.2);
  if (nest && nest.stones < nest.max && c.energy > 0.3) {
    if (!c.carrying) {
      c.goal.copy(nest.pile); c.speedWant = c.def.speed.cruise;
      c.setState('forage', 'choosing a stone');
      if (c.pos.distanceTo(nest.pile) < c.length * 0.6) { c.carrying = true; c.setState('forage', 'turning a stone, testing it'); }
    } else {
      c.goal.copy(den); c.speedWant = c.def.speed.cruise * 0.8;
      c.setState('nest', 'carrying a stone to the wall');
      if (c.pos.distanceTo(den) < c.length * 0.7) { H.placeStone?.(c); c.carrying = false; H.observe(c, nest.stones > nest.max * 0.6 ? 'repair' : 'building'); }
    }
    return;
  }
  // the wall is whole: graze the mats round the vents, never far
  if (c.state !== 'feed' || c.stateT > 15) { c.setState('feed', 'grazing the microbial mat'); c.goal.set(0, 0, 0); }
  wander(c, den, c.length * 4, c.def.speed.cruise * 0.6, H);
  c.energy = Math.min(1, c.energy + 0.002);
};

// ============================================================================================= defender (armoured shield-back)
/** stays by its eggs; turns its shield to an intruder, braces and knocks; shoves only if the intruder stays close */
export const defender: Brain = (c, H) => {
  const den = c.den ?? c.home;
  const hz = H.hazard(c.pos);
  if (hz.state >= 2 || hz.cue > 0.4) { c.goal.copy(den); c.speedWant = c.pos.distanceTo(den) > 0.5 ? c.def.speed.cruise * 2 : 0; c.setState('shelter', 'lowered into the notch, gripping the rock'); H.observe(c, 'shelter'); return; }
  const intr = c.sensed.find((s) => (s.c.kind === 'player' || s.c.kind === 'creature') && s.c.pos.distanceTo(den) < 6 && s.c.size > 0.5);
  if (intr) {
    // face it, between it and the nest
    c.goal.copy(den).lerp(intr.c.pos, 0.35);
    c.speedWant = c.def.speed.cruise;
    c.display = 1;
    const reach = c.def.threat.reach * c.scale + intr.c.size * 0.4;
    if (c.state === 'warn' && c.stateT > 4 && intr.d < reach) { c.target = intr.c; c.setState('attack', 'shoving forward'); c.speedWant = c.def.speed.burst; return; }
    if (c.state === 'attack') {
      if (intr.d < reach * 0.8) { H.strike(c, intr.c, c.def.threat.harm); c.setState('recover', 'backing to the nest'); }
      else if (c.stateT > 1.5) c.setState('recover', 'stopped short');
      return;
    }
    if (c.state !== 'warn') { c.setState('warn', 'shield raised, knocking on the rock'); H.observe(c, 'warning'); }
    return;
  }
  c.display = Math.max(0, c.display - 0.2);
  if (c.state === 'recover' && c.stateT < 6) { c.goal.copy(den); c.speedWant = c.def.speed.cruise; return; }
  c.setState('feed', 'grazing the rock film near its eggs');
  wander(c, den, 4, c.def.speed.cruise * 0.5, H);
  if (c.stateT > 12) H.observe(c, 'guarding');
};

// ============================================================================================= filter feeder
/** slow passes through the plankton, mouth open; wide turns; steers round vehicles; deep water before the wave */
export const filter: Brain = (c, H) => {
  if (seekShelter(c, H, 2)) { c.speedWant = c.def.speed.cruise; return; }
  const bloom = H.bloom?.(c) ?? null;
  const veh = c.sensed.find((s) => s.c.kind === 'sub' && s.d < c.length * 1.2);
  if (veh) {
    // drift aside: a slow course change away from the hull
    _w.copy(c.pos).sub(veh.c.pos).normalize();
    c.goal.copy(c.pos).addScaledVector(_w, c.length * 2).addScaledVector(c.fwd, c.length);
    c.speedWant = c.def.speed.cruise;
    c.setState('investigate', 'easing away from the vehicle');
    return;
  }
  if (bloom && c.energy < 0.95) {
    const d = bloom.distanceTo(c.pos);
    if (d < 40) {
      // feeding passes back and forth through the bloom
      if (c.pos.distanceTo(c.goal) < c.length || c.state !== 'feed') {
        const a = hashRand(c.id, Math.floor(H.time / 30)) * Math.PI * 2;
        c.goal.copy(bloom).add(_v.set(Math.cos(a) * 30, (hashRand(c.id, Math.floor(H.time / 30) + 1) - 0.5) * 8, Math.sin(a) * 30));
      }
      c.speedWant = c.def.speed.cruise * 0.8;
      c.setState('feed', 'mouth open, filtering the bloom');
      c.energy = Math.min(1, c.energy + 0.0015);
      H.observe(c, 'feeding');
      return;
    }
    c.goal.copy(bloom); c.speedWant = c.def.speed.cruise;
    c.setState('patrol', 'travelling toward a plankton bloom');
    return;
  }
  wander(c, c.home, 200, c.def.speed.cruise, H, 40);
  c.setState('patrol', 'cruising its range');
};

// ============================================================================================= apex
/** long patrols over a large range; inspects vehicles from below; attacks only hungry with a good target or provoked */
export const apex: Brain = (c, H) => {
  if (c.state === 'attack') return attackStep(c, H);
  if (seekShelter(c, H, 3)) return;
  const hungry = 1 - c.energy;
  const p = hungry > 0.55 && c.fatigue < 0.4 && c.injury < 0.5 ? prey(c, 0.12, 0.6, c.length * 3) : null;
  if (p) {
    c.target = p.c;
    if (p.d < c.length * 0.9) { c.setState('attack', 'a short burst at prey'); c.speedWant = c.def.speed.burst; H.observe(c, 'strike'); return; }
    c.goal.copy(p.c.pos); c.speedWant = c.def.speed.cruise; c.setState('stalk', 'turning toward prey');
    return;
  }
  const veh = c.sensed.find((s) => s.c.kind === 'sub' && s.conf > 0.3);
  if (veh) {
    const mem = c.memory.get(veh.c.id);
    // provoked (rammed, chased): threat display, then a single charge if it keeps coming
    if (mem && mem.val < -0.5 && veh.d < c.length * 1.2) {
      if (c.state === 'warn' && c.stateT > 5) { c.target = veh.c; c.setState('attack', 'charging the hull'); c.speedWant = c.def.speed.burst * 0.8; return; }
      c.goal.copy(veh.c.pos); c.speedWant = c.def.speed.cruise * 0.6;
      if (c.state !== 'warn') { c.setState('warn', 'jaws parted, crown raised toward the vehicle'); H.observe(c, 'warning'); }
      return;
    }
    if (c.stateT < 50 && veh.d > c.length * 0.8) {
      // a slow pass below, then away
      c.goal.copy(veh.c.pos).add(_v.set(0, -c.length * 0.8, 0)).addScaledVector(c.fwd, c.length * 2);
      c.speedWant = c.def.speed.cruise;
      c.setState('investigate', 'passing below the vehicle');
      H.observe(c, 'investigate');
      return;
    }
  }
  wander(c, c.home, 400, c.def.speed.cruise, H, 60);
  c.setState('patrol', 'patrolling its range');
  if (c.stateT > 30) H.observe(c, 'patrol');
};

// ============================================================================================= clever (camouflaging crawler)
/** camouflaged by its den; watches; explores nearby; warning display then a grapple only when cornered near its eggs */
export const clever: Brain = (c, H) => {
  const den = c.den ?? c.home;
  const hz = H.hazard(c.pos);
  if (hz.state >= 2 || hz.cue > 0.45) { c.goal.copy(den); c.speedWant = c.def.speed.cruise * 2; c.display = 0; c.hidden = 1; c.setState('hide', 'arms anchored in a crevice'); H.observe(c, 'shelter'); return; }
  const near = c.sensed.find((s) => s.c.kind === 'player' || s.c.kind === 'sub');
  if (near) {
    const mem = c.memory.get(near.c.id);
    const cornered = near.c.pos.distanceTo(den) < 3 && near.d < 2.2;
    if (cornered || (mem && mem.val < -0.4 && near.d < 2.5)) {
      c.display = 1; c.hidden = 0;
      if (c.state === 'warn' && c.stateT > 2.5 && near.d < c.def.threat.reach * c.scale + near.c.size * 0.4) {
        H.strike(c, near.c, c.def.threat.harm); H.observe(c, 'grapple'); c.learn(near.c.id, -0.2, H); c.setState('recover', 'released and backed into the den');
        return;
      }
      if (c.state !== 'warn') { c.setState('warn', 'high-contrast pattern rippling, arms spread'); H.observe(c, 'warning'); }
      c.speedWant = 0;
      return;
    }
    // otherwise: hold still, match the rock, watch
    c.display = 0; c.hidden = 1; c.speedWant = 0;
    c.setState('hide', 'matching the rock, watching');
    if (near.d < 8) H.observe(c, 'camouflage');
    return;
  }
  c.hidden = Math.max(0.3, c.hidden - 0.05);
  if (c.state === 'recover' && c.stateT < 10) { c.goal.copy(den); c.speedWant = c.def.speed.cruise; return; }
  // explore round the den, now and then handling something it finds
  c.setState('forage', 'exploring the crevices');
  wander(c, den, 5, c.def.speed.cruise, H);
  if (hashRand(c.id, Math.floor(H.time / 20)) > 0.85) H.observe(c, 'handling');
};


// ============================================================================================= producer (sessile phototroph)
/** opens its membranes slowly when there is light and water, closes into dormancy without; tears and closes at a touch */
export const producer: Brain = (c, H) => {
  c.speedWant = 0;
  const lit = H.light(c.pos);
  const touch = c.sensed.find((s) => s.d < c.length * 0.45 + s.c.size * 0.3 && s.c.vel.length() > 0.05);
  if (touch) {
    c.display = Math.max(0, c.display - 0.25);
    c.setState('hide', 'membranes torn and closing at the touch');
    H.observe(c, 'retract');
    return;
  }
  // a slow response: seasons, compressed to minutes for the observer
  const want = lit > 0.08 ? 1 : 0.15;
  c.display += (want - c.display) * 0.004;
  if (want > 0.5) { c.setState('feed', 'lamellae open to the light through the ice'); if (c.display > 0.6) H.observe(c, 'growth'); }
  else { c.setState('rest', 'dormant: membranes contracted'); if (c.display < 0.35) H.observe(c, 'dormant'); }
};

// ============================================================================================= colony (anchored mineral colony)
/** draws in its living tips at vibration, wash or a close disturbance; extends them again slowly */
export const colony: Brain = (c, H) => {
  c.speedWant = 0;
  const near = c.sensed.find((s) => s.d < c.length * 0.9 + 1.5 && (s.c.noise > 0.3 || s.c.vel.length() > 0.6));
  if (near) {
    c.display = Math.min(1, c.display + 0.35);
    c.setState('hide', 'living tips drawn in');
    H.observe(c, 'retract');
    return;
  }
  c.display = Math.max(0, c.display - 0.01);
  c.setState('feed', 'tips extended into the seep flow');
  if (c.stateT > 20) H.observe(c, 'feeding');
};

// ============================================================================================= hermit (brief surface excursions)
/** at dawn or dusk it crosses the open ground from one crack to another; curls at vibration, strong sun or cold */
export const hermit: Brain = (c, H) => {
  const a = c.home, b = c.den ?? c.home;
  const hz = H.hazard(c.pos);
  const atA = c.pos.distanceTo(a) < 0.15, atB = c.pos.distanceTo(b) < 0.15;
  const shaken = c.sensed.find((s) => s.c.kind !== 'prey' && s.d < 6 && (s.c.noise > 0.15 || s.c.vel.length() > 0.3));
  if (shaken && !atA && !atB) {
    // curled up where it is: a small rock
    c.hidden = Math.min(1, c.hidden + 0.4); c.speedWant = 0;
    c.setState('hide', 'curled up in its shell');
    c.stress = Math.min(1, c.stress + 0.1);
    H.observe(c, 'curl');
    return;
  }
  if (c.state === 'hide' && c.stateT < 25 && c.stress > 0.2) { c.speedWant = 0; return; }
  c.hidden = Math.max(0, c.hidden - 0.1);
  if (hz.state >= 2 || c.stress > 0.7) {
    // the hours are wrong or it has been frightened: back underground by the nearer crack
    const r = c.pos.distanceTo(a) < c.pos.distanceTo(b) ? a : b;
    c.goal.copy(r); c.speedWant = c.def.speed.burst;
    c.setState('shelter', 'making for the nearest crack');
    if (c.pos.distanceTo(r) < 0.15) { c.hidden = 1; c.speedWant = 0; c.setState('rest', 'underground'); }
    return;
  }
  // a crossing: from whichever crack it is at to the other, slowly, stopping now and then
  if (c.state !== 'patrol') { c.goal.copy(atA || c.pos.distanceTo(a) < c.pos.distanceTo(b) ? b : a); c.setState('patrol', 'crossing the open ground'); }
  c.speedWant = hashRand(c.id, Math.floor(H.time / 4)) > 0.25 ? c.def.speed.cruise : 0;
  if (c.pos.distanceTo(c.goal) < 0.15) { c.setState('rest', 'resting in the crack'); c.hidden = 1; }
  H.observe(c, 'crossing');
};

// ============================================================================================= stalkcam (camouflaged cave ambusher)
/** anchors camouflaged by prey paths; approaches only undetected; a coiled leap and a latch; disengages after a miss */
export const stalkcam: Brain = (c, H) => {
  const den = c.den ?? c.home;
  if (c.state === 'attack') return attackStep(c, H);
  if (c.state === 'recover' && c.stateT < 10 + c.failures * 5) { c.goal.copy(den); c.speedWant = c.def.speed.cruise; c.hidden = Math.max(0.4, c.hidden - 0.05); return; }
  const hungry = 1 - c.energy;
  // a light on it, or a vehicle's lamps: exposed
  const lit = c.sensed.find((s) => s.c.light > 0.5 && s.d < 10);
  const big = c.sensed.find((s) => (s.c.kind === 'player' || s.c.kind === 'sub') && s.conf > 0.3);
  if (big) {
    const mem = c.memory.get(big.c.id);
    if (big.d < c.length * 0.7 && (c.bold > 0.5 || (mem?.val ?? 0) < -0.4)) {
      // cornered or provoked: a hiss and a ground click, then a defensive lunge
      c.hidden = 0; c.display = 1;
      if (c.state === 'warn' && c.stateT > 2) { c.target = big.c; c.setState('attack', 'lunging'); c.speedWant = c.def.speed.burst; H.observe(c, 'leap'); return; }
      if (c.state !== 'warn') { c.setState('warn', 'exposed: hissing, body raised'); H.observe(c, 'warning'); }
      c.speedWant = 0;
      return;
    }
    if (lit) {
      // exposed in a beam: freeze, then slip back to its crevice
      c.learn(big.c.id, -0.05, H);
      c.goal.copy(den); c.speedWant = c.def.speed.cruise * 1.5; c.hidden = Math.max(0.3, c.hidden - 0.1);
      c.setState('flee', 'slipping back into its crevice');
      return;
    }
    // unseen: hold still and let it pass
    c.hidden = Math.min(1, c.hidden + 0.1); c.speedWant = 0;
    c.setState('hide', 'pressed to the rock, matching it');
    if (big.d < 8) H.observe(c, 'camouflage');
    return;
  }
  const p = hungry > 0.3 ? prey(c, 0.05, 0.5, c.length * 4) : null;
  if (p) {
    c.target = p.c;
    c.hidden = Math.min(1, c.hidden + 0.05);
    if (p.d < c.length * 1.2) { c.setState('attack', 'coiled leap'); c.speedWant = c.def.speed.burst; c.goal.copy(p.c.pos); H.observe(c, 'leap'); return; }
    c.goal.copy(p.c.pos); c.speedWant = c.def.speed.cruise * 0.35;
    c.setState('stalk', 'creeping closer under camouflage, toes repositioning');
    H.observe(c, 'stalking');
    return;
  }
  c.hidden = Math.min(1, c.hidden + 0.05);
  if (hungry > 0.6) { c.setState('patrol', 'moving between crevices'); wander(c, den, c.length * 6, c.def.speed.cruise, H); return; }
  c.setState('rest', 'anchored in its crevice, breathing slowly');
  c.goal.copy(den); c.speedWant = c.pos.distanceTo(den) > 0.3 ? c.def.speed.cruise : 0;
};


// ============================================================================================= glider (Jovian skyray)
/** glides on shear lanes in long loops; feeds through aeromite swarms; spirals down away from a hunter */
export const glider: Brain = (c, H) => {
  const t = c.sensed.find((s) => s.c.kind === 'creature' && s.c.size > c.length * 1.1 && (s.c.ref?.def?.threat?.level === 'high') && s.d < 260);
  if (t) {
    // fold and drop away in a descending spiral, banking hard on the shear
    flee(c, t.c.pos, c.def.speed.burst);
    c.goal.y -= 60;
    c.setState('flee', 'wings folded, spiralling down');
    H.observe(c, 'dive');
    return;
  }
  const swarm = c.sensed.find((s) => s.c.kind === 'prey' && s.d < 350);
  if (swarm && c.energy < 0.9) {
    c.goal.copy(swarm.c.pos);
    c.speedWant = c.def.speed.cruise * 0.8;
    c.setState('feed', 'gliding through the swarm, mouth comb open');
    if (swarm.d < c.length) { c.energy = Math.min(1, c.energy + 0.01); H.observe(c, 'feeding'); }
    return;
  }
  wander(c, c.home, 500, c.def.speed.cruise, H, 60);
  c.setState('patrol', 'gliding along the shear lane');
  if (c.stateT > 12) H.observe(c, 'glide');
};

// ============================================================================================= drifter (floating colonies)
/** drifts with the air at its level, bobbing slowly; links with its group; draws in its filaments at a touch */
export const drifter: Brain = (c, H) => {
  const touch = c.sensed.find((s) => s.c.kind !== 'prey' && s.d < c.length * 0.8 + s.c.size * 0.5);
  if (touch) { c.display = Math.min(1, c.display + 0.3); c.setState('hide', 'filaments drawn in'); H.observe(c, 'retract'); c.speedWant = 0.1; return; }
  c.display = Math.max(0, c.display - 0.02);
  const mates = H.group?.(c) ?? [];
  const k = hashRand(c.id, 5) * 6.28;
  _v.copy(c.home);
  if (mates.length) {
    // loose links: drift toward the group's middle, keeping a little apart
    const ctr = new THREE.Vector3();
    for (const m of mates) ctr.add(m.pos);
    ctr.divideScalar(mates.length);
    _v.lerp(ctr, 0.6);
  }
  c.goal.set(_v.x + Math.cos(H.time * 0.01 + k) * 20, _v.y + Math.sin(H.time * 0.02 + k) * 12, _v.z + Math.sin(H.time * 0.01 + k) * 20);
  c.speedWant = c.def.speed.cruise;
  const swarm = c.sensed.find((s) => s.c.kind === 'prey' && s.d < 40);
  if (swarm) { c.energy = Math.min(1, c.energy + 0.002); c.setState('feed', 'collecting aeromites on its filaments'); H.observe(c, 'feeding'); return; }
  c.setState('patrol', 'drifting with the air');
  if (c.stateT > 15) H.observe(c, 'drifting');
};

export const BRAINS: Record<string, Brain> = { grazer, ambush, trap, lure, pack, builder, defender, filter, apex, clever, producer, colony, hermit, stalkcam, glider, drifter };
