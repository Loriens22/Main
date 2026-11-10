// Find clear, flat landing spots near NASA and the farm (forest density, slope, buildings excluded by distance).
export const steps = [
  { js: `await game.startCreative(false); game.cinematic = null; const z = game.zone; const g = z.gen; const out = {};
    const score = (x, zz) => { let f = 0, hmin = 1e9, hmax = -1e9; for (let a = 0; a < 16; a++) for (const r of [0, 10, 20, 30]) { const px = x + Math.cos(a * 0.39) * r, pz = zz + Math.sin(a * 0.39) * r; f = Math.max(f, g.forestDensity(px, pz)); const h = g.height(px, pz); hmin = Math.min(hmin, h); hmax = Math.max(hmax, h); } return { f, relief: +(hmax - hmin).toFixed(2) }; };
    for (const [name, cx, cz, R] of [['nasa', 2900, -3000, 260], ['farm', 250, -250, 300]]) { const c = []; for (let x = cx - R; x <= cx + R; x += 20) for (let zz = cz - R; zz <= cz + R; zz += 20) { const s = score(x, zz); if (s.f < 8 && s.relief < 2.5) c.push({ x, z: zz, ...s, d: Math.round(Math.hypot(x - cx, zz - cz)) }); } c.sort((a, b) => a.relief - b.relief + (a.d - b.d) * 0.004); out[name] = c.slice(0, 6); }
    out.nasaOrigin = z.content.nasa?.origin?.toArray?.(); return out;`, wait: 1000, frames: 2 },
];
