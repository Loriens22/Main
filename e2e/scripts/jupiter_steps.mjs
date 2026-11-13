// Jupiter's cloud layer: dive in (cruise), fly with the cloud-cruise hold, views; creatures (PART=2+).
const site = process.env.SITE ?? '0';
const probe = `const z = game.zone; if (!z.gas) return 'not gas'; const c = z.craft; const up = new c.quat.constructor(); const alt = z.env.altitude(c.pos);
  return { alt: Math.round(alt), v: Math.round(Math.hypot(...c.vel)), vy: +c.vel[1].toFixed(1), ap: z.control.autopilot?.name ?? null, hull: +(game.state.vehicles.ranger1.damage.hull ?? 1).toFixed(2), fauna: z.fauna ? z.fauna.creatures.map((k) => k.species[0] + ':' + k.state + '@' + Math.round(k.pos.distanceTo(new k.pos.constructor(...c.pos)))).join(' ') : null };`;
const land = { js: `await game.startCreative(false); game.cinematic = null;
    const L = await import('/src/data/landing.ts'); const s = L.SURFACES.jupiter.sites[${site}]; const v = game.state.vehicles.ranger1; v.data.surface = { body: 'jupiter', lat: s.lat, lon: s.lon, name: s.name }; v.landed = false;
    await game.goTo('surface', { at: 'cruise' }, { fade: 0 }); game.step(2, 1 / 30, false);
    const B = (await import('/src/data/bodies.ts')).BODIES.jupiter; for (let i = 0; i < 30 && game.zone.sunLocal.y < 0.45; i++) { game.state.clock.earthTime += Math.abs(B.rotation) / 24; game.step(1, 1 / 30, false); }
    return { gas: game.zone.gas, sun: +game.zone.sunLocal.y.toFixed(2) };`, wait: 1500, frames: 30, probe };
const view = (name, js) => ({ js: `const z = game.zone; const c = z.craft; const P = new game.camera.position.constructor(...c.pos); const cam = game.camera; game.cinematic = { blocking: true, update: () => true }; cam.fov = 65; cam.updateProjectionMatrix(); ${js}; cam.updateMatrixWorld(true); return 1;`, frames: 2, shot: name, probe });
const free = { js: `game.cinematic = null; return 1;`, frames: 1 };
const J = `const z = game.zone; const F = z.fauna; const sky = F.creatures.find((k) => k.species === 'sky'); const of = (sp) => F.creatures.filter((k) => k.species === sp);
  const c = z.craft; const V = game.camera.position.constructor; const P = new V(...c.pos); const cam = game.camera;`;
const jprobe = `const z = game.zone; const F = z.fauna; if (!F) return 'no fauna'; const sky = F.creatures.find((k) => k.species === 'sky'); const c = z.craft; const d = game.state.vehicles.ranger1.damage;
  const rp = sky ? sky.rp : null;
  return { alt: Math.round(z.env.altitude(c.pos)), v: Math.round(Math.hypot(...c.vel)), hull: +(d.hull ?? 1).toFixed(3), av: +(d.avionics ?? 1).toFixed(3), eng: +(d.engines ?? 1).toFixed(3), thrustK: F.thrustK, grip: sky?.grip ? sky.grip.kind + ' ' + sky.grip.got.toFixed(1) + '/' + sky.grip.need : null, att: sky?.attacker?.species ?? null,
    sp: F.creatures.filter((k) => k.species !== 'sky').map((k) => k.species.slice(0, 2) + ':' + k.state + '@' + Math.round(k.pos.distanceTo(rp))).join(' '), crack: +F.cabinCrack.toFixed(2), fade: +game.renderer.fx.fade.toFixed(2) };`;
const shot = (name, js) => ({ js: `${J} game.cinematic = { blocking: true, update: () => true }; cam.fov = 65; cam.updateProjectionMatrix(); ${js}; cam.updateMatrixWorld(true); return 1;`, frames: 2, shot: name, probe: jprobe });
const calm = { js: `${J} sky.lull = 999; sky.attacker = null; F.creatures.forEach((k) => (k.cooldown = 999)); return 1;`, frames: 1 };
const go = (js, frames = 1) => ({ js: `${J} ${js}; return 1;`, frames, probe: jprobe });
const populatedJ = { untilJs: `game.zone.fauna && game.zone.fauna.creatures.length >= 12`, max: 600, chunk: 30, probe: jprobe };
// rock the Ranger: push the roll control (here the touch stick) and let go, n times
const rock = (n) => Array.from({ length: n }, (_, i) => [{ js: `game.input.virtFlight.roll = ${i % 2 ? 1 : -1}; return 1;`, frames: 2 }, { js: `game.input.virtFlight.roll = 0; return 1;`, frames: 2 }]).flat();
const parts = {
  1: [
    land,
    { frames: 300, chunk: 60, probe },
    view('jup_chase', `cam.position.copy(P).add(new P.constructor(-40, 12, 25)); cam.lookAt(P.x + 60, P.y - 5, P.z)`), free,
    view('jup_wide', `cam.position.copy(P).add(new P.constructor(0, 8, 0)); cam.lookAt(P.x + 3000, P.y - 900, P.z + 1200)`), free,
    view('jup_down', `cam.position.copy(P).add(new P.constructor(0, -6, 0)); cam.lookAt(P.x + 1500, P.y - 3500, P.z - 600)`), free,
    { frames: 300, chunk: 60, probe },
  ],
  // the species, posed for portraits (no attacks)
  2: [
    land, populatedJ, calm,
    go(`const f = of('floater')[0]; f.size = 1.6; sky.ahead(260, -90, 30, f.pos); f.charge = 0`, 3),
    shot('jup_floater', `const f = of('floater')[0]; cam.position.copy(P).add(new V(0, 6, 0)).addScaledVector(sky.head, -20); cam.lookAt(f.pos.x, f.pos.y - 12, f.pos.z)`), free,
    go(`const f = of('floater')[1]; f.size = 2.4; sky.ahead(700, 250, 120, f.pos); const g = of('floater')[2]; g.size = 1.1; sky.ahead(420, -220, -60, g.pos)`, 3),
    shot('jup_floater_herd', `cam.position.copy(P).add(new V(0, 4, 0)).addScaledVector(sky.head, -30); const t = sky.ahead(500, 0, 20); cam.lookAt(t)`), free,
    go(`const v = of('veilray')[0]; v.setState('glide'); sky.ahead(90, 25, 25, v.pos); v.vel.copy(sky.rv)`, 2),
    shot('jup_veilray', `const v = of('veilray')[0]; cam.position.copy(v.pos).add(new V(0, -16, 0)).addScaledVector(sky.head, -26); cam.lookAt(v.pos.x, v.pos.y - 6, v.pos.z)`), free,
    shot('jup_veilray_side', `const v = of('veilray')[0]; const sd = new V(-sky.head.z, 0, sky.head.x); cam.position.copy(v.pos).addScaledVector(sd, 30).add(new V(0, 6, 0)); cam.lookAt(v.pos.x, v.pos.y - 5, v.pos.z)`), free,
    go(`const m = of('mawray')[0]; m.setState('cruise'); sky.ahead(90, -25, -10, m.pos); m.vel.copy(sky.rv)`, 2),
    shot('jup_mawray', `const m = of('mawray')[0]; cam.position.copy(m.pos).add(new V(0, -24, 0)).addScaledVector(sky.head, 8); cam.lookAt(m.pos)`), free,
    shot('jup_mawray_side', `const m = of('mawray')[0]; const sd = new V(-sky.head.z, 0, sky.head.x); cam.position.copy(m.pos).addScaledVector(sd, -26).add(new V(0, 3, 0)).addScaledVector(sky.head, 10); cam.lookAt(m.pos.x, m.pos.y, m.pos.z)`), free,
    go(`const bs = of('sporebulb'); const at = sky.ahead(120, 40, 0); bs.forEach((b, i) => b.pos.set(at.x + (i % 3) * 14 - 14, at.y + ((i * 7) % 5) * 4 - 8, at.z + Math.floor(i / 3) * 14 - 14))`, 2),
    shot('jup_spores', `const at = sky.ahead(120, 40, -3); cam.position.copy(at).add(new V(0, 4, 0)).addScaledVector(sky.head, -55); cam.lookAt(at)`), free,
    go(`const h = of('hunter')[0]; h.setState('drift'); sky.ahead(260, 60, 120, h.pos); h.drop = 0`, 3),
    shot('jup_hunter', `const h = of('hunter')[0]; const sd = new V(-sky.head.z, 0, sky.head.x); cam.position.copy(h.pos).addScaledVector(sd, -170).add(new V(0, -40, 0)).addScaledVector(sky.head, 40); cam.lookAt(h.pos.x, h.pos.y - 25, h.pos.z)`), free,
    shot('jup_hunter_pod', `const h = of('hunter')[0]; const p = h.podTop(new V()); const sd = new V(-sky.head.z, 0, sky.head.x); cam.position.copy(p).addScaledVector(sd, -16).addScaledVector(sky.head, 26).add(new V(0, -3, 0)); cam.lookAt(p.x, p.y - 4, p.z)`), free,
  ],
  // the attacks
  3: [
    land, populatedJ, calm,
    // a floater's discharge
    go(`const f = of('floater')[0]; f.size = 1.4; f.pos.copy(sky.rp).add(new V(0, 19 * f.size + 4, 0)).addScaledVector(sky.head, 30); f.charge = 0.98; f.cooldown = 0`, 2),
    { untilJs: `game.zone.fauna.thrustK === 0`, max: 40, chunk: 1, probe: jprobe },
    { frames: 4 },
    shot('jup_arc', `const f = of('floater')[0]; cam.position.copy(P).add(new V(0, 10, 0)).addScaledVector(sky.head, -45); cam.lookAt(f.pos.x, f.pos.y - 20, f.pos.z)`), free,
    { frames: 60, probe: jprobe },
    // a veil ray drops onto the canopy
    go(`of('floater').forEach((f) => { f.charge = 0; f.cooldown = 999; sky.ahead(-3000, 0, 0, f.pos); }); sky.lull = 0; sky.attacker = null; const v = of('veilray')[0]; v.cooldown = 0; sky.ahead(170, 0, 55, v.pos); v.vel.copy(sky.rv); sky.claim(v); v.setState('shadow'); v.st = 5`, 1),
    { untilJs: `game.zone.fauna.creatures.some((k) => k.species === 'veilray' && k.state === 'drape')`, max: 200, chunk: 2, probe: jprobe },
    { frames: 45, probe: jprobe },
    shot('jup_veil_drape', `cam.position.copy(sky.toWorld(new V(-11, 6, -22))); cam.lookAt(sky.toWorld(new V(0, 1, -4)))`), free,
    { js: `game.zone.control.camMode = 'cockpit'; return 1;`, frames: 3, shot: 'jup_veil_cockpit', probe: jprobe },
    shot('jup_veil_cockpit_up', `const e = sky.toWorld(sky.eye.clone()); cam.position.copy(e); cam.up.copy(new V(0, 0, -1).applyQuaternion(sky.rq)); cam.lookAt(sky.toWorld(new V(-0.6, 4, 0.6))); cam.up.set(0, 1, 0)`), free,
    ...rock(9),
    { frames: 30, probe: jprobe },
    // a maw ray stalks from below and latches on
    go(`sky.lull = 0; sky.attacker = null; const m = of('mawray')[0]; m.cooldown = 0; sky.ahead(-160, 0, -45, m.pos); m.vel.copy(sky.rv); sky.claim(m); m.setState('trail'); m.st = 9`, 1),
    { untilJs: `game.zone.fauna.creatures.some((k) => k.species === 'mawray' && k.state === 'latched')`, max: 300, chunk: 2, probe: jprobe },
    { frames: 75, probe: jprobe },
    shot('jup_maw_latched', `cam.position.copy(sky.toWorld(new V(13, 5, -17))); cam.lookAt(sky.toWorld(new V(0, 2, -4)))`), free,
    { js: `game.zone.control.camMode = 'cockpit'; return 1;`, frames: 3, shot: 'jup_maw_cockpit', probe: jprobe },
    shot('jup_maw_cockpit_up', `const e = sky.toWorld(sky.eye.clone()); cam.position.copy(e); cam.up.copy(new V(0, 0, -1).applyQuaternion(sky.rq)); cam.lookAt(sky.toWorld(new V(0, 4, -0.3))); cam.up.set(0, 1, 0)`), free,
    ...rock(12),
    { frames: 30, probe: jprobe },
    // a spore colony in the flight path
    go(`sky.lull = 999; if (of('sporebulb').length < 5) sky.spawnColony()`, 1),
    { untilJs: `game.zone.fauna.creatures.filter((k) => k.species === 'sporebulb').length >= 5`, max: 120, chunk: 2, probe: jprobe },
    go(`const bs = of('sporebulb'); const at = sky.ahead(330, 0, 0); bs.forEach((b, i) => b.pos.set(at.x + (i % 3) * 16 - 16, at.y + ((i * 7) % 5) * 5 - 10, at.z + Math.floor(i / 3) * 16 - 16)); bs[0].colony.armT = -1`, 1),
    { untilJs: `game.zone.fauna.creatures.filter((k) => k.species === 'sporebulb').length < 5`, max: 200, chunk: 2, probe: jprobe },
    shot('jup_spore_burst', `cam.position.copy(P).add(new V(0, 14, 0)).addScaledVector(sky.head, -60); cam.lookAt(sky.ahead(120, 0, 0))`), free,
    { untilJs: `game.zone.fauna.thrustK < 1`, max: 120, chunk: 2, probe: jprobe },
    { js: `game.zone.control.camMode = 'cockpit'; return 1;`, frames: 3, shot: 'jup_spore_inside', probe: jprobe },
    // the hunter: drop, harpoon, reel, crush
    go(`sky.lull = 0; sky.attacker = null; const h = of('hunter')[0]; h.cooldown = 0; sky.ahead(240, 0, 240, h.pos); sky.claim(h); h.setState('stalk')`, 1),
    { untilJs: `game.zone.fauna.creatures.some((k) => k.species === 'hunter' && k.state === 'reel')`, max: 300, chunk: 2, probe: jprobe },
    { frames: 40, probe: jprobe },
    shot('jup_hunter_reel', `const h = of('hunter')[0]; const p = h.podTop(new V()); const mid = p.clone().lerp(sky.rp, 0.5); const sd = new V(-sky.head.z, 0, sky.head.x); cam.position.copy(mid).addScaledVector(sd, -120).add(new V(0, 10, 0)); cam.lookAt(mid.x, mid.y + 30, mid.z)`), free,
    { untilJs: `game.zone.fauna.creatures.some((k) => k.species === 'hunter' && k.state === 'crush')`, max: 600, chunk: 6, probe: jprobe },
    { frames: 50, probe: jprobe },
    shot('jup_hunter_crush', `const h = of('hunter')[0]; const sd = new V(-sky.head.z, 0, sky.head.x); cam.position.copy(sky.rp).addScaledVector(sd, -40).add(new V(0, 6, 0)); cam.lookAt(sky.rp.x, sky.rp.y + 4, sky.rp.z)`), free,
    ...rock(14),
    { frames: 60, probe: jprobe },
    // Settings → Alien life → Jupiter off: no creatures
    { js: `game.settings.life.jupiter = false; game.applySettings(); return 1;`, frames: 3, probe: jprobe },
    { js: `const F = game.zone.fauna; return { visible: F.root.visible, active: F.active(), thrustK: F.thrustK };`, frames: 1 },
    { js: `game.settings.life.jupiter = true; game.applySettings(); return game.zone.fauna.active();`, frames: 2 },
  ],
};
parts[4] = [
  land, populatedJ, calm,
  { js: `${J} const r = z.ranger.root; const out = {}; const B = new game.camera.position.constructor; r.updateMatrixWorld(true);
    r.traverse((o) => { if (!o.isMesh) return; const ms = Array.isArray(o.material) ? o.material : [o.material]; if (!ms.some((m) => /glass|window|canopy/i.test(m.name))) return;
      const g = o.geometry; g.computeBoundingBox(); const bb = g.boundingBox.clone().applyMatrix4(o.matrixWorld); const a = sky.toLocal(bb.min, new V()), b = sky.toLocal(bb.max, new V());
      out[o.name + ':' + ms.map((m) => m.name).join('/')] = [a, b].map((v) => [v.x, v.y, v.z].map((x) => +x.toFixed(2))); });
    return { eye: [sky.eye.x, sky.eye.y, sky.eye.z].map((x) => +x.toFixed(2)), glass: out };`, frames: 1 },
];
// the maw ray alone (quick iteration)
parts[5] = [
  land, populatedJ, calm,
  go(`sky.lull = 0; sky.attacker = null; const m = of('mawray')[0]; m.cooldown = 0; sky.ahead(-160, 0, -45, m.pos); m.vel.copy(sky.rv); sky.claim(m); m.setState('trail'); m.st = 9`, 1),
  { untilJs: `game.zone.fauna.creatures.some((k) => k.species === 'mawray' && k.state === 'latched')`, max: 300, chunk: 2, probe: jprobe },
  { frames: 60, probe: jprobe },
  shot('jup_maw_latched', `cam.position.copy(sky.toWorld(new V(13, 5, -17))); cam.lookAt(sky.toWorld(new V(0, 2, -4)))`), free,
  { js: `game.zone.control.camMode = 'cockpit'; return 1;`, frames: 3, shot: 'jup_maw_cockpit', probe: jprobe },
  shot('jup_maw_cockpit_up', `const e = sky.toWorld(sky.eye.clone()); cam.position.copy(e); cam.up.copy(new V(0, 0, -1).applyQuaternion(sky.rq)); cam.lookAt(sky.toWorld(new V(0, 4, -0.3))); cam.up.set(0, 1, 0)`), free,
];
const PART = process.env.PART ?? '1';
export const steps = parts[PART];
