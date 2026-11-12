// Walk-through check for the camp doorways: stand outside, open the door, hold forward and trace the player.
// BODY=edmunds|mann
const BODY = process.env.BODY ?? 'edmunds';
const land = { js: `await game.startCreative(false); game.cinematic = null; game.state.system = 'gargantua';
    const L = await import('/src/data/landing.ts'); const s = L.SURFACES['${BODY}'].sites[0]; const v = game.state.vehicles.ranger1; v.data.surface = { body: '${BODY}', lat: s.lat, lon: s.lon, name: s.name }; v.landed = true;
    await game.goTo('surface', { at: 'landed' }, { fade: 0 }); game.step(2, 1 / 30, false); return !!game.zone.lazarus;`, wait: 1500 };
const [from, face, door] = BODY === 'edmunds' ? ['spot_door', 'spot_inside', 'edmunds_camp:edm_hab'] : ['spot_porch', 'nav_outer', 'mann_camp:mann_outer'];
const trace = `const L = game.zone.lazarus; const p = game.player.pos; const c = game.player.controller; const g = c?.computedGrounded?.(); return { p: [p.x, p.y, p.z].map((v) => +v.toFixed(2)), room: L.camp.roomAt(p), grounded: g, mode: game.player.mode, ctx: game.input.context };`;
export const steps = [
  land,
  { js: `game.zone.beginEva(true); const L = game.zone.lazarus; const a = L.spot('${from}'), f = L.spot('${face}'); game.player.enterFrame(game.zone.ground, new V3(a.x, a.y + 0.05, a.z), Math.atan2(-(f.x - a.x), -(f.z - a.z)), 'walk'); const it = game.interaction.items.get('${door}'); const l = it.label(); it.use(); return [l, game.player.mode, game.input.context];`, frames: 50 },
  { js: `game.input.virtualHold('forward', true); ${trace}`, frames: 15 },
  ...Array.from({ length: 8 }, () => ({ js: trace, frames: 15 })),
  { js: `game.input.virtualHold('forward', false); ${trace}`, frames: 2 },
];
