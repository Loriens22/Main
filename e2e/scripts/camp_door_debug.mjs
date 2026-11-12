// Walk-through check for the camp doorways: stand outside, open the door, hold forward (nothing disabled) and
// report where the player ends up. BODY=edmunds|mann
const BODY = process.env.BODY ?? 'edmunds';
const land = { js: `await game.startCreative(false); game.cinematic = null; game.state.system = 'gargantua';
    const L = await import('/src/data/landing.ts'); const s = L.SURFACES['${BODY}'].sites[0]; const v = game.state.vehicles.ranger1; v.data.surface = { body: '${BODY}', lat: s.lat, lon: s.lon, name: s.name }; v.landed = true;
    await game.goTo('surface', { at: 'landed' }, { fade: 0 }); game.step(2, 1 / 30, false); game.zone.beginEva(true); return !!game.zone.lazarus;`, wait: 1500 };
const doors = BODY === 'edmunds'
  ? [['spot_door', 'spot_inside', 'edmunds_camp:edm_hab', 150], ['spot_cont_out', 'spot_lab', 'edmunds_camp:edm_cont', 210]]
  : [['spot_porch', 'nav_outer', 'mann_camp:mann_outer', 150], ['nav_lock', 'nav_main', 'mann_camp:mann_inner', 120]];
const trace = `const L = game.zone.lazarus; const p = game.player.pos; return { p: [p.x, p.y, p.z].map((v) => +v.toFixed(2)), room: L.camp.roomAt(p) };`;
export const steps = [land];
for (const [from, face, door, frames] of doors) {
  steps.push({ js: `const L = game.zone.lazarus; const a = L.spot('${from}'), f = L.spot('${face}'); game.player.enterFrame(game.zone.ground, new V3(a.x, a.y + 0.05, a.z), Math.atan2(-(f.x - a.x), -(f.z - a.z)), 'walk'); const it = game.interaction.items.get('${door}'); const d = L.camp.doors.get(it.id.split(':')[1]); if (!d.open) it.use(); return '${door}';`, frames: 50 });
  steps.push({ js: `game.input.virtualHold('forward', true); return 1;`, frames });
  steps.push({ js: `game.input.virtualHold('forward', false); ${trace}`, frames: 2 });
}
