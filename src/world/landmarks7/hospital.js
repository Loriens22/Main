// МБАЛ „Княгиня Клементина“ – София, the former Пета градска болница (Fifth City Hospital), beside the stops
// 1254 / 1255 (shared with line 12). The three blocks are the OSM building parts (pack): the 23 m east-west
// ward slab, the 14 m irregular treatment block and the 23 m south slab; the names come from the place data
// (Overture: "5-та Градска Болница", "МБАЛ Княгиня Клементина - София ЕАД"). Facades estimated (no reachable
// photographs used): socialist-era plastered slabs with long ribbon windows, a glazed entrance with a canopy and
// the hospital's name, the emergency entrance with a ramp.
import { MeshBuilder, orient } from '../LandmarkGeometry.js';
import { ground, done, edgesOf, mat, std, facadeMat, plasterMat, signMat, canopy, doors, ward, steps } from '../LandmarkInstitutionsKit.js';

function hospMats(M) {
  if (M.m.l7hospWard) return;
  facadeMat(M, 'l7hospWard', { bayW: 3.2, floorH: 3.3, bays: 8, floors: 2, ppm: 30, style: 'ribbon', wall: '#e8e2d2', pier: '#d9d1bd', spandrel: '#dcd4c0', win: [2.5, 1.45], sillY: 0.95, mull: 3, lit: 0.55, blind: 0.4, seed: 71, glass: '#4b5d6b', glass2: '#a8b9c5', frame: '#f2f0e8' });
  facadeMat(M, 'l7hospTreat', { bayW: 3.0, floorH: 3.6, bays: 6, floors: 2, ppm: 30, style: 'punched', wall: '#e6dfcb', pier: '#d8cfb8', win: [1.8, 1.6], sillY: 0.9, mull: 2, lit: 0.5, blind: 0.3, seed: 72, glass: '#4b5d6b', glass2: '#a8b9c5', frame: '#f2f0e8', surround: '#d0c6ad', sill: '#cdc2a8' });
  plasterMat(M, 'l7hospEnd', '#b9a48a', 0.12);
  mat(M, 'l7hospLobby', () => { const m = std({ color: 0x6f8898, roughness: 0.12, metalness: 0.35, emissive: 0xffe0b0, emissiveIntensity: 0 }); M.night.push(m); return m; });
  signMat(M, 'l7hospName', { w: 1024, h: 160, bg: '#f4f2ea', lines: [{ text: 'МБАЛ „КНЯГИНЯ КЛЕМЕНТИНА“ – СОФИЯ', size: 52, color: '#1d4f8f', y: 58 }, { text: 'бивша Пета градска болница', size: 34, color: '#4c5560', y: 118 }] });
  signMat(M, 'l7hospEmergency', { w: 512, h: 96, bg: '#b3261e', lines: [{ text: 'СПЕШНО ОТДЕЛЕНИЕ', size: 50, color: '#ffffff', y: 50 }] });
}

export function buildFifthHospital({ world, M, replaced, route }) {
  const parts = replaced.filter((r) => /^Fifth City Hospital/.test(r.entry.note));
  if (!parts.length) return null;
  hospMats(M);
  const b = new MeshBuilder();
  let sx = 0, sz = 0;
  // the tram stop (1254/1255) the entrance faces
  const stop = route ? route.direction('A').stops.find((s) => s.code === '1255') : null;
  let main = null;
  for (const r of parts) {
    const Q = orient(Array.from(r.b.pts));
    sx += r.cx; sz += r.cz;
    const floors = Math.max(3, Math.round(r.entry.h / 3.3));
    const slab = /slab/.test(r.entry.note);
    const res = ward(b, M, world, Q, { facade: slab ? 'l7hospWard' : 'l7hospTreat', floors, minBay: 9, seed: r.b.id, plant: slab ? 5 : 3, antenna: slab, endKey: 'l7hospEnd' });
    if (/main/.test(r.entry.note)) main = { r, Q, res };
  }
  if (main) {
    // the entrance on the long wall nearest the tram stop: glazed lobby, canopy with the name, steps and ramp
    const [px, pz] = stop ? stop.pole : [main.r.cx, main.r.cz];
    const e = edgesOf(main.Q).filter((q) => q.L > 20).sort((a, c) => {
      const da = Math.hypot((a.ax + a.bx) / 2 - px, (a.az + a.bz) / 2 - pz), dc = Math.hypot((c.ax + c.bx) / 2 - px, (c.az + c.bz) / 2 - pz);
      return da - dc;
    })[0];
    if (e) {
      const mx = (e.ax + e.bx) / 2, mz = (e.az + e.bz) / 2, base = main.res.base;
      b.push(mx, base, mz, Math.atan2(e.nx, e.nz));
      b.box('l7hospLobby', 0, 0.3, 0.06, 12, 3.6, 0.12, 0, {});
      for (let i = -1; i <= 1; i++) doors(b, { x: i * 3.2, y: 0.3, z: 0.14, w: 2.2, h: 2.6, frame: 'steelDark', glass: 'glassDark' });
      b.push(0, 0, 0.2);
      canopy(b, { w: 14, d: 4.5, y: 3.9, th: 0.4, cols: 4, colR: 0.15, slab: 'concrete', fascia: 'paint', colKey: 'steel', lights: true });
      b.pop();
      b.quad('l7hospName', [-6.5, 4.35, 4.72], [6.5, 4.35, 4.72], [6.5, 6.38, 4.72], [-6.5, 6.38, 4.72]);
      b.push(-2.5, -0.5, 4.8);
      steps(b, 'graniteLight', { w: 6, n: 5, rise: 0.16, tread: 0.32, z0: 0 });
      b.pop();
      // the ramp beside the steps with its handrail
      b.box('concrete', 4.2, -0.5, 6.8, 1.6, 0.6, 4.0, 0, {});
      b.box('steel', 4.95, 0.1, 6.8, 0.05, 0.9, 4.0, 0, {});
      b.pop();
      // the emergency entrance at the far end of the same wall
      const ex = e.ax + e.tx * e.L * 0.85, ez = e.az + e.tz * e.L * 0.85;
      b.push(ex, base, ez, Math.atan2(e.nx, e.nz));
      b.box('glassDark', 0, 0.3, 0.06, 4, 3.0, 0.12, 0, {});
      b.box('concrete', 0, 3.4, 2.5, 7, 0.35, 5, 0, {});
      for (const x of [-3.2, 3.2]) b.box('steel', x, 0, 4.8, 0.2, 3.4, 0.2, 0, {});
      b.quad('l7hospEmergency', [-2.5, 3.5, 5.02], [2.5, 3.5, 5.02], [2.5, 3.98, 5.02], [-2.5, 3.98, 5.02]);
      b.pop();
    }
  }
  return done(b, M, sx / parts.length, sz / parts.length);
}
