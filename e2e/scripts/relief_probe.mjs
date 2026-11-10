// Height-field statistics around the landing site (relief diagnostics).
export const steps = [
  { js: `await game.startCreative(false); game.cinematic = null; const v = game.state.vehicles.ranger1; v.data.surface = { body: '${process.env.BODY ?? 'moon'}', lat: ${process.env.LAT ?? 0.674}, lon: ${process.env.LON ?? 23.473}, name: 'x' }; v.landed = true; await game.goTo('surface', { at: 'landed' }, { fade: 0 }); return 1;`, wait: 2000, frames: 2 },
  { js: `const g = game.zone.gen; const out = {}; for (const L of [40, 200, 1000, 5000]) { const hs = [], ds = [], ms = []; for (let i = 0; i <= 200; i++) { const x = -L / 2 + L * i / 200; hs.push(g.field.height(x, 0) - g.curvature(x, 0)); ds.push(g.detail(x, 0, 4)); ms.push(g.mapElevation(x, 0)); }
    const st = (a) => { const m = a.reduce((s, v) => s + v, 0) / a.length; return { min: +Math.min(...a).toFixed(1), max: +Math.max(...a).toFixed(1), sd: +Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length).toFixed(2) }; };
    out[L] = { field: st(hs), detail: st(ds), map: st(ms) }; } out.lum = { has: !!game.zone.map.lum, w: game.zone.map.w, at: game.zone.map.lumAt(0.674, 23.473), hl: g.highland }; out.cells = [g.near.cell, g.mid.cell, g.far.cell].map((v) => +v.toFixed(1)); out.density = g.crater.density; return out;` },
];
