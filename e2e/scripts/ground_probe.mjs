// Surface-zone ground model far from the site: for points 30 km above the curved surface at increasing range,
// compare env.altitude with the clearance the contact model sees (craft height along up − env.ground().h).
const BODY = process.env.BODY ?? 'moon';
export const steps = [
  { js: `await game.startCreative(false); game.cinematic = null; const L = await import('/src/data/landing.ts'); const s = L.SURFACES['${BODY}'].sites[0]; const v = game.state.vehicles.ranger1; v.data.surface = { body: '${BODY}', lat: s.lat, lon: s.lon, name: s.name }; v.landed = true; await game.goTo('surface', { at: 'landed' }, { fade: 0 }); return s.name;`, wait: 2000, frames: 5 },
  { js: `const z = game.zone; const R = z.site.R; const out = [];
    for (const d of [0, 50e3, 150e3, 300e3, 500e3, 700e3, 1000e3]) for (const az of [0, 1.2, 2.5]) {
      const a = d / R; const dirx = Math.cos(az), dirz = Math.sin(az);
      const hAlt = 30e3; const rr = R + hAlt;
      const p = [dirx * rr * Math.sin(a), rr * Math.cos(a) - R, dirz * rr * Math.sin(a)];
      const up = z.env.up(p); const ph = p[0] * up[0] + p[1] * up[1] + p[2] * up[2];
      const g = z.env.ground(p); out.push({ d: d / 1000, az, alt: +(z.env.altitude(p) / 1000).toFixed(3), clear: +((ph - g.h) / 1000).toFixed(3), fh: +(z.gen.field.height(p[0], p[2]) / 1000).toFixed(2) });
    } return out;`, frames: 1 },
];
