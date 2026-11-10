// Touchdown diagnostics: from 300 m above the site with 30 m/s drift → LAND HERE / POWERED DESCENT terminal → landed.
const MODE = process.env.MODE ?? 'site';
const probe = `const z = game.zone; if (!z) return 0; const c = z.craft; const V3 = game.camera.position.constructor; const up = new V3(0, 1, 0).applyQuaternion(c.quat);
  const low = Math.min(...c.gearPoints.map((g) => g.clone().applyQuaternion(c.quat).y + c.pos[1] - z.gen.field.height(c.pos[0] + g.clone().applyQuaternion(c.quat).x, c.pos[2] + g.clone().applyQuaternion(c.quat).z)));
  return { ap: z.control.autopilot ? z.control.autopilot.phase : null, agl: +(c.pos[1] - z.gen.field.height(c.pos[0], c.pos[2])).toFixed(2), gearLow: +low.toFixed(2), v: c.vel.map((v) => +v.toFixed(2)), contact: c.contact, landed: c.landed, gear: c.gearDown, vtol: +c.vtolLevel.toFixed(2), tilt: +(Math.acos(Math.min(1, up.y)) * 57.3).toFixed(1), off: +Math.hypot(c.pos[0] - z.target[0], c.pos[2] - z.target[2]).toFixed(1), site: !!z.rangerSite, msg: z.control.messages[0] };`;
export const steps = [
  { js: `await game.startCreative(false); game.cinematic = null; const v = game.state.vehicles.ranger1; v.data.surface = { body: 'moon', lat: 0.674, lon: 23.473, name: 'T' }; v.landed = true; await game.goTo('surface', { at: 'landed' }, { fade: 0 }); return 1;`, wait: 1500, frames: 2 },
  { js: `const z = game.zone; const c = z.craft; c.pos[0] = 900; c.pos[1] += 400; c.pos[2] = -300; c.vel[0] = -30; c.vel[1] = -5; c.landed = false; c.contact = false; c.gearDown = false;
    const L = await import('/src/space/Landing.ts'); z.control.setAutopilot('${MODE}' === 'here' ? new L.LandHere(z) : new L.PoweredDescent(z, 'site', 'approach')); return 1;`, frames: 2, probe },
  ...Array.from({ length: 40 }, () => ({ frames: 100, dt: 0.05, chunk: 50, probe })),
];
