// Wraps a generated character (humanoid, creature or robot) into a living
// NPC entity: behaviour brain, personality/dialogue, speech bubbles,
// optional speech synthesis, interaction prompt and save/load state.

import * as THREE from 'three';
import { G, settings } from '../core/context.js';
import { Brain } from './brain.js';
import { Personality } from './personality.js';

let voicesCache = null;
function pickVoice(sex, seed) {
  if (!('speechSynthesis' in window)) return null;
  if (!voicesCache || !voicesCache.length) voicesCache = window.speechSynthesis.getVoices().filter((v) => /^en/i.test(v.lang));
  if (!voicesCache.length) return null;
  const fem = voicesCache.filter((v) => /female|woman|zira|susan|samantha|victoria|karen|moira|tessa|fiona|allison|ava|serena/i.test(v.name));
  const mal = voicesCache.filter((v) => /male|man|david|mark|daniel|alex|fred|george|rishi|tom|aaron|arthur/i.test(v.name) && !/female/i.test(v.name));
  const pool = sex === 'female' && fem.length ? fem : sex === 'male' && mal.length ? mal : voicesCache;
  return pool[seed % pool.length];
}

export function speak(text, voice, sex, seed) {
  if (!settings.tts || !('speechSynthesis' in window)) return;
  try {
    const clean = text.replace(/\*[^*]*\*/g, '').trim();
    if (!clean) return;
    const u = new SpeechSynthesisUtterance(clean);
    const v = pickVoice(sex, seed);
    if (v) u.voice = v;
    u.pitch = voice ? voice.pitch : 1; u.rate = voice ? voice.rate : 1;
    u.volume = settings.volume;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch (e) { /* ignore */ }
}

// data: base entity data (root, height...). opts: { humanoid, creature, personalityInfo, brainOpts }
export function makeNPC(data, opts) {
  const e = data;
  e.isCharacter = true;
  e.humanoid = opts.humanoid || null;
  e.creature = opts.creature || null;
  e.personality = new Personality(opts.personalityInfo, opts.rng);
  e.subtitle = opts.subtitle || '';
  e.body = { x: 0, z: 0, y: 0, r: opts.radius || 0.32 };
  e.footprint = e.footprint || { radius: (opts.radius || 0.32) + 0.3 };
  const seed = opts.seed || 1;
  e.say = (text, seconds = 4) => {
    if (G.ui) G.ui.bubble(e, text, Math.max(2.5, seconds, text.length * 0.07));
    if (e.humanoid) e.humanoid.talk(Math.min(6, 0.6 + text.length * 0.055));
    if (e.creature && e.creature.vocalize) e.creature.vocalize();
    if (G.audio && !settings.tts) G.audio.voiceBlip(e.personality.voice.pitch, text.length, e.root.position, !!e.creature);
    if (G.world && G.world.id === e.worldId && e.root.position.distanceTo(G.player.position) < 14) speak(text, e.personality.voice, opts.personalityInfo.sex, seed);
  };
  e.dialogueCtx = () => {
    const world = G.worlds.get(e.worldId);
    const nearby = [];
    if (world) for (const o of world.entities) if (o !== e && o.root.position.distanceTo(e.root.position) < 40) nearby.push(o.concept || o.name);
    const at = world && world.atmosphere;
    return { time: world && world.kind === 'overworld' && at ? at.timeOfDay : null, weather: world && world.weather ? world.weather.type : world && world.meta.weather, worldName: world ? world.name : 'this world', nearby };
  };
  e.talk = (text) => {
    const r = e.personality.respond(text, e.dialogueCtx());
    e.brain.talkWith(10);
    e.say(r.text, 4);
    if (r.action) e.brain.command(r.action);
    else if (r.gesture && e.humanoid) e.humanoid.gesture(r.gesture, r.gesture === 'dance' ? 8 : 2.2);
    return r;
  };
  e.brain = new Brain(e, opts.brainOpts || {});
  e.interact = { label: () => (e.creature ? `Pet ${e.name}` : `Talk to ${e.name}`), action: () => {
    if (e.creature) { e.say(e.personality.animalLine(), 2.5); e.brain.talkWith(5); if (e.creature.happy) e.creature.happy(); return; }
    if (G.ui) G.ui.startTalk(e);
    e.brain.talkWith(20);
    e.say(e.personality.greet(e.dialogueCtx()), 3.5);
    if (e.humanoid) e.humanoid.gesture('wave', 1.6);
    if (G.ui) setTimeout(() => G.ui.focusCommand(), 60);
  } };
  const tmpV = new THREE.Vector3();
  const prevUpdate = e.update;
  e.update = (dt, t, dist) => {
    const world = G.worlds.get(e.worldId);
    if (!world) return;
    if (e.frozen) return;
    e.brain.update(dt, world);
    if (e.humanoid) {
      const root = e.root;
      const yaw = root.rotation.y, c = Math.cos(yaw), s = Math.sin(yaw);
      const scale = e.scale || 1;
      let look = null;
      if (e.brain.lookTarget) {
        tmpV.copy(e.brain.lookTarget).sub(root.position);
        look = new THREE.Vector3(tmpV.x * c - tmpV.z * s, tmpV.y, tmpV.x * s + tmpV.z * c).multiplyScalar(1 / scale);
      }
      const groundAt = dist < 25 ? (lx, lz) => {
        const wx = root.position.x + (lx * c + lz * s) * scale, wz = root.position.z + (-lx * s + lz * c) * scale;
        return (world.colliders.groundHeight(wx, wz, 0.08, root.position.y + 0.5 * scale, 0.5) - root.position.y) / scale;
      } : null;
      e.humanoid.update(dt, { speed: e.brain.speed / scale, moveAngle: 0, grounded: true, look, groundAt, yawRate: e.brain.yawRate, crouch: false });
    }
    if (e.creature) e.creature.update(dt, { speed: e.brain.speed / (e.scale || 1), yawRate: e.brain.yawRate, look: e.brain.lookTarget, world, root: e.root, dist });
    if (prevUpdate) prevUpdate(dt, t, dist);
  };
  e.onAdded = (world) => {
    e.brain.home.copy(e.root.position);
    e.body.x = e.root.position.x; e.body.z = e.root.position.z; e.body.y = e.root.position.y;
  };
  e.saveState = () => ({ personality: e.personality.save(), brain: e.brain.save() });
  e.loadState = (s) => { if (!s) return; e.personality.load(s.personality); e.brain.load(s.brain); };
  const prevDispose = e.dispose;
  e.dispose = () => { if (e.humanoid) e.humanoid.dispose(); if (e.creature && e.creature.dispose) e.creature.dispose(); if (prevDispose) prevDispose(); };
  return e;
}
