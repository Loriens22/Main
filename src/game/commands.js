// Executes parsed text commands: creation requests go to the generation
// pipeline; everything else (talking, NPC orders, deleting, modifying,
// time/weather, player modes, gravity, teleporting, undo...) is handled here.

import * as THREE from 'three';
import { G, settings } from '../core/context.js';
import { parseCommand } from '../gen/nlp.js';
import { switchWorld } from './worlds.js';

const NPC_ACTIONS = { follow: 'follow', come: 'come', stop: 'stay', stay: 'stay', wait: 'stay', dance: 'dance', sit: 'sit', wave: 'wave', jump: 'jump', cheer: 'cheer', clap: 'clap', go: 'goaway', scatter: 'goaway' };

// Snapshot of the player used for placement (so "in front of me" means where
// you stood when you pressed Enter, even if you walk away while it generates).
export function playerSnapshot() {
  const P = G.player;
  const yaw = P.yaw;
  return {
    position: P.position.clone(), yaw, eyePos: P.eyePos,
    forward: (out = new THREE.Vector3()) => out.set(-Math.sin(yaw), 0, -Math.cos(yaw)),
    lookDir: (out = new THREE.Vector3()) => P.lookDir(out),
  };
}

function worldNPCs(world = G.world) { return [...world.entities].filter((e) => e.isCharacter && e.brain); }

function nearestNPC(maxDist = 12) {
  let best = null, bd = maxDist;
  for (const e of worldNPCs()) { const d = e.root.position.distanceTo(G.player.position); if (d < bd) { bd = d; best = e; } }
  return best;
}

function refCtx() {
  return { world: G.world, player: G.player, lookedAt: G.interaction ? G.interaction.lookedAt : null, prev: G.lastCreated };
}

function plural(n, w) { return `${n} ${w}${n === 1 ? '' : 's'}`; }

export function executeCommand(text, talkTarget) {
  const ui = G.ui;
  const npcs = worldNPCs();
  const cmd = parseCommand(text, { npcNames: npcs.map((e) => e.name), talking: !!talkTarget, hasNearbyNPC: !!nearestNPC(10) });
  switch (cmd.type) {
    case 'empty': return;
    case 'create': return create(cmd);
    case 'talk': return talk(cmd, talkTarget, npcs);
    case 'npc': return npcCommand(cmd, npcs);
    case 'undo': {
      const e = G.registry.undo();
      ui.toast(e ? `Removed ${e.name}` : 'Nothing to undo');
      return;
    }
    case 'clear': {
      const n = [...G.registry.entities.values()].filter((e) => e.worldId === G.world.id).length;
      G.registry.clear(G.world.id);
      ui.toast(n ? `Cleared ${plural(n, 'object')}` : 'Nothing to clear');
      return;
    }
    case 'help': ui.showHelp(); G.hooks.pause(true); return;
    case 'save': G.persistence.save('slot1'); return;
    case 'time': return setTime(cmd);
    case 'weather': return setWeather(cmd.value);
    case 'player': return playerAction(cmd.action);
    case 'gravity': return setGravity(cmd.value);
    case 'teleport': return teleport(cmd);
    case 'delete': return del(cmd);
    case 'modify': return modify(cmd);
    default:
      ui.toast(`I couldn't turn “${text}” into something. Try “a red car”, “a wizard”, “make it night”…`, 'bad', 5000);
      if (G.audio) G.audio.play('error');
  }
}

// ---------------- Create ----------------
function create(cmd) {
  const ui = G.ui;
  const jobsByItem = new Map();
  const shared = { world: G.world, player: playerSnapshot(), prev: G.lastCreated, lookedAt: G.interaction ? G.interaction.lookedAt : null, sideSign: 1 };
  const notes = [];
  for (const item of cmd.items) {
    const pctx = { ...shared };
    if (item.placement && item.placement.mode === 'replace' && item.placement.ref) {
      const found = G.registry.findRef(item.placement.ref, refCtx());
      if (found.length) pctx.replaceEntity = found[0];
      else notes.push(`nothing called “${item.placement.ref.text}” to replace`);
    }
    if (item.companionOf) {
      const mainJob = jobsByItem.get(item.companionOf);
      if (mainJob) pctx.waitFor = mainJob;
      shared.sideSign = -shared.sideSign;
    }
    if (item.fuzzy) notes.push(`“${item.fuzzy.from}” → ${item.fuzzy.to}`);
    if (item.attrs && item.attrs.unknownNoun) notes.push(`I don't know “${item.attrs.unknownNoun}” yet, so I'll sculpt an interpretation`);
    const job = G.pipeline.submit(item, pctx);
    jobsByItem.set(item, job);
    job.promise.then((res) => {
      if (res.status === 'done' && res.result && res.result.length) {
        const e = res.result[res.result.length - 1];
        G.lastCreated = e;
        if (G.audio) G.audio.play('materialize', e.root.position);
        if (e.isCharacter && e.say && e.personality && !e.creature) setTimeout(() => { if (G.registry.get(e.id)) e.say(e.personality.intro(), 3.5); }, 1600);
      } else if (res.status === 'failed') ui.toast(`Could not create ${item.concept}: ${res.error && res.error.message}`, 'bad');
    });
  }
  if (G.audio) G.audio.play('submit');
  if (notes.length) ui.toast(notes.join(' · '), '', 4500);
}

// ---------------- Talk & NPC orders ----------------
function talk(cmd, talkTarget, npcs) {
  let target = talkTarget;
  if (cmd.target) target = npcs.find((e) => e.name.toLowerCase() === cmd.target) || target;
  if (!target || !G.registry.get(target.id)) { G.ui.toast('Nobody to talk to. Look at a character and press E.'); return; }
  if (!G.ui.talkTarget || G.ui.talkTarget !== target) G.ui.startTalk(target);
  G.ui.bubble(G.avatar || { name: 'You', root: G.avatar.root }, cmd.text, 3, { player: true });
  if (G.avatar) G.avatar.talk(Math.min(4, cmd.text.length * 0.05));
  // Small delay so the reply feels like a reply.
  setTimeout(() => { if (G.registry.get(target.id)) target.talk(cmd.text); }, 350 + Math.min(900, cmd.text.length * 12));
}

function npcCommand(cmd, npcs) {
  const action = NPC_ACTIONS[cmd.action] || cmd.action;
  let targets = [];
  if (cmd.target === 'all') targets = npcs.filter((e) => e.root.position.distanceTo(G.player.position) < 40);
  else { const n = G.ui.talkTarget || nearestNPC(12); if (n) targets = [n]; }
  if (!targets.length) { G.ui.toast('No characters nearby.'); return; }
  for (const e of targets) {
    e.brain.command(action);
    if (e.personality && e.say) e.say(e.personality.ack ? e.personality.ack(action) : 'Okay!', 2);
  }
}

// ---------------- World state ----------------
function setTime(cmd) {
  const at = G.world.atmosphere;
  if (!at || G.world.kind !== 'overworld') { G.ui.toast('Time does not flow here.'); return; }
  if (cmd.freeze) { settings.dayCycle = false; G.ui.toast('Time frozen'); return; }
  if (cmd.resume) { settings.dayCycle = true; G.ui.toast('Time flows again'); return; }
  if (cmd.speed === 'fast') { settings.dayLengthMin = 2; settings.dayCycle = true; G.ui.toast('Time-lapse'); return; }
  if (cmd.speed === 'normal') { settings.dayLengthMin = 30; G.ui.toast('Normal time'); return; }
  const from = at.timeOfDay;
  let to = cmd.hours;
  if (to < from) to += 24;
  // Animate the sun quickly rather than jumping.
  G.timeTween = { from, to, t: 0, dur: Math.min(3.5, 0.8 + (to - from) * 0.15) };
  const hh = Math.floor(cmd.hours) % 24, mm = Math.round((cmd.hours % 1) * 60);
  G.ui.toast(`Time → ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`);
}

function setWeather(value) {
  const w = G.world.weather;
  if (!w) { G.ui.toast('This dimension has its own weather.'); return; }
  w.set(value);
  G.ui.toast({ clear: 'Skies clearing', cloudy: 'Clouds rolling in', rain: 'Rain is coming', storm: 'A storm is brewing ⚡', snow: 'Snow begins to fall ❄', fog: 'Fog rolls in' }[value] || value);
}

function setGravity(v) {
  const map = { low: 3.2, moon: 1.62, mars: 3.71, zero: 0.35, off: 0.35, no: 0.35, normal: 9.81, high: 18 };
  const g = map[v] ?? Number(v);
  if (!Number.isFinite(g)) return;
  G.world.rules.gravity = g;
  G.world.rules.jump = g < 5 ? 1.4 : 1;
  G.ui.toast(`Gravity set to ${g.toFixed(2)} m/s²`);
}

function playerAction(action) {
  const P = G.player, A = G.avatar;
  switch (action) {
    case 'fly': P.flying = true; G.ui.toast('Flying: Space up, C down, Shift fast'); break;
    case 'nofly': P.flying = false; G.ui.toast('Walking'); break;
    case 'third': if (P.cameraMode !== 'third') P.toggleCamera(); break;
    case 'first': if (P.cameraMode !== 'first') P.toggleCamera(); break;
    case 'sit': G.hooks.sitDown(); break;
    default: if (A) A.gesture(action === 'dance' ? 'dance' : action, action === 'dance' ? 8 : 2.4);
  }
}

// ---------------- Teleport ----------------
function teleport(cmd) {
  if (cmd.home) {
    const ow = G.overworld;
    if (G.world !== ow) switchWorld(ow, ow.spawn.pos.clone().add(new THREE.Vector3(0, 0.5, 0)), ow.spawn.yaw);
    else G.player.teleport(ow.spawn.pos.clone().add(new THREE.Vector3(0, 0.5, 0)), ow.spawn.yaw);
    return;
  }
  const found = G.registry.findRef(cmd.ref, refCtx());
  if (!found.length) {
    // Maybe the entity lives in another world.
    const all = [...G.registry.entities.values()].filter((e) => (cmd.ref.concept && e.concept === cmd.ref.concept) || (cmd.ref.name && e.name.toLowerCase() === cmd.ref.name));
    if (all.length) { G.hooks.teleportTo(all[0].id); return; }
    G.ui.toast(`Couldn't find “${cmd.ref.text}”.`); return;
  }
  G.hooks.teleportTo(found[0].id);
}

// ---------------- Delete ----------------
function del(cmd) {
  const found = G.registry.findRef(cmd.ref, refCtx());
  if (!found.length) { G.ui.toast(`Couldn't find “${cmd.ref.text || 'that'}” to delete.`); return; }
  for (const e of found) G.registry.remove(e.id);
  G.ui.toast(found.length === 1 ? `Deleted ${found[0].name}` : `Deleted ${plural(found.length, 'object')}`);
}

// ---------------- Modify ----------------
function modify(cmd) {
  const found = G.registry.findRef(cmd.ref, refCtx());
  if (!found.length) { G.ui.toast('Nothing to change — look at something or name it.'); return; }
  const c = cmd.changes;
  const P = G.player;
  for (const e of found) {
    const root = e.root;
    let terrain = false;
    if (c.scale) {
      const ns = THREE.MathUtils.clamp(e.scale * c.scale, 0.05, 40);
      e.scale = ns; root.scale.setScalar(ns); terrain = true;
    }
    if (c.scaleY) root.scale.y *= c.scaleY;
    if (c.rotate !== undefined) {
      if (c.rotate === 'face') root.rotation.y = Math.atan2(P.position.x - root.position.x, P.position.z - root.position.z);
      else root.rotation.y += c.rotate;
      terrain = true;
    }
    if (c.spin) { root.userData.animated = root.userData.animated || []; root.userData.animated.push((t, dt) => { root.rotation.y += dt * 0.8; }); }
    if (c.move) {
      const m = c.move, d = m.dist;
      const toPlayer = P.position.clone().sub(root.position).setY(0).normalize();
      const right = new THREE.Vector3(-P.forward().z, 0, P.forward().x);
      if (m.dir === 'closer') root.position.addScaledVector(toPlayer, Math.min(d, Math.max(0, root.position.distanceTo(P.position) - 1.5)));
      else if (m.dir === 'away') root.position.addScaledVector(toPlayer, -d);
      else if (m.dir === 'up') root.position.y += d;
      else if (m.dir === 'down') root.position.y -= d;
      else if (m.dir === 'left') root.position.addScaledVector(right, -d);
      else if (m.dir === 'right') root.position.addScaledVector(right, d);
      if (m.dir !== 'up' && m.dir !== 'down' && !e.floating) root.position.y = G.world.colliders.groundHeight(root.position.x, root.position.z, 0.2, root.position.y + 50, 100, e.id);
      terrain = true;
    }
    if (c.color || c.material || c.glow) recolor(e, c);
    if (c.float) {
      e.floating = true;
      const y0 = root.position.y + 1.5;
      root.position.y = y0;
      root.userData.animated = root.userData.animated || [];
      root.userData.animated.push((t) => { root.position.y = y0 + Math.sin(t * 1.2) * 0.15; });
    }
    if (c.hide) root.visible = false;
    if (c.show) root.visible = true;
    G.registry.refresh(e, { terrain: terrain && !!e.flattenTerrain });
  }
  G.ui.toast(found.length === 1 ? `Changed ${found[0].name}` : `Changed ${plural(found.length, 'object')}`);
}

// Recolour / re-material an entity. Library materials are shared, so they
// are cloned per entity before being tinted (clones are disposed with it).
function recolor(e, c) {
  const M = G.materials;
  const newMat = c.material ? M.get(c.material, { color: c.color || undefined }) : null;
  e.root.traverse((o) => {
    if (!o.isMesh || o.userData.noRecolor) return;
    const swap = (m) => {
      if (!m || m.isShaderMaterial || m.transparent && m.opacity < 0.5) return m;
      if (newMat && !o.isSkinnedMesh) return newMat;
      const k = m.clone();
      k.defines = { ...(m.defines || {}) };
      k.userData = {};
      if (c.color && k.color) {
        // Keep the texture's detail but shift its overall colour.
        k.color.set(c.color);
        if (k.map) k.color.multiplyScalar(1.35);
      }
      if (c.glow && k.emissive) { k.emissive.set(c.color || (k.color ? k.color.getStyle() : '#ffffff')); k.emissiveIntensity = 1.2; }
      return k;
    };
    o.material = Array.isArray(o.material) ? o.material.map(swap) : swap(o.material);
  });
  if (c.color) e.colorWord = null;
  if (c.glow && G.world.lightPool) {
    const req = { getPosition: (out) => out.copy(e.root.position).add(new THREE.Vector3(0, (e.height || 1) * e.scale * 0.6, 0)), color: c.color || '#ffe8c0', intensity: 2.5, distance: 10 * e.scale, enabled: true };
    e.lightReqs.push(req);
    G.world.lightPool.add(req);
  }
}
