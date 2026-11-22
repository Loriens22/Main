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
  if (hungry > 0.6 && c.state !== 'patrol') c.setState('patrol', 'patrolling the canyon edge');
  if (c.state === 'patrol') { wander(c, den, c.length * 12, c.def.speed.cruise, H, 6); if (c.stateT > 60) c.setState('rest', 'holding still under an overhang'); return; }
  c.setState('rest', 'holding still under an overhang');
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

export const BRAINS: Record<string, Brain> = { grazer, ambush };
