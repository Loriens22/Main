// Bulgaria Mall and its towers (бул. България / бул. Тодор Каблешков, at the start of line 7, stops 2211 /
// 2212): the mall opened in December 2012 (Wikipedia, Salamanca Group via search summaries), the glass office
// tower beside it in 2014 (Infinity Office Tower, Building of the Year 2014). Footprints and heights are the OSM
// building parts (pack): the mall body (25 m), the round-roofed glazed atrium (30 m), the "South Tower" (22
// storeys, 85 m) and the "North Tower" parts (16 and 14 storeys), all tagged glass. The facade drawing (metal
// cladding and glass bands on the mall, the lettering, the fins on the towers) is estimated.
import { MeshBuilder, orient } from '../LandmarkGeometry.js';
import { ground, done, edgesOf, mat, std, signMat, canopy, doors } from '../LandmarkInstitutionsKit.js';
import { off } from './kit7.js';
import { millMats, tower } from './millennium.js';

function mallMats(M) {
  millMats(M);
  if (M.m.l7mallPanel) return;
  M.panel('l7mallPanel', 'mallPanel', { w: 3.0, h: 1.2, base: '#c9ced1', joint: 'rgba(60,66,70,0.35)', cols: 3, rows: 1, noise: 0.05, seed: 81 });
  M.curtain('l7mallGlass', { bayW: 2.0, floorH: 5.0, bays: 6, floors: 1, glass: '#506776', glass2: '#a7bcc8', mullion: '#bcc3c7', spandrel: '#bcc3c7', sp: 0, lit: 0.85, seed: 82 }, 'mallGlass');
  mat(M, 'l7mallRed', () => std({ color: 0xc8202b, roughness: 0.45 }));
  signMat(M, 'l7mallSign', { w: 1024, h: 160, bg: null, alpha: true, lines: [{ text: 'BULGARIA MALL', size: 120, color: '#ffffff', y: 84, weight: 800 }] });
}

export function buildBulgariaMall({ world, M, replaced }) {
  const parts = replaced.filter((r) => /^Bulgaria Mall/.test(r.entry.note));
  if (!parts.length) return null;
  mallMats(M);
  const b = new MeshBuilder();
  let sx = 0, sz = 0, base = Infinity;
  for (const r of parts) base = Math.min(base, ground(world, r.b.pts).avg);
  for (const r of parts) {
    const Q = orient(Array.from(r.b.pts));
    const g = ground(world, Q);
    sx += r.cx; sz += r.cz;
    const h = r.entry.h, note = r.entry.note;
    b.ring('graniteDark', Q, g.min - 0.6, base + 0.2, { tw: 3, th: 3 });
    if (/tower/.test(note)) {
      b.ring('l7mallGlass', Q, base + 0.2, base + 6, { tw: 12, th: 5, v0: base + 0.2 });
      tower(b, M, off(Q, 0.4), base + 6, base + h, { key: /South/.test(note) ? 'l7mcGlass' : 'l7mcGlass2', band: 3.6 });
    } else if (/atrium/.test(note)) {
      // the glazed atrium under its round roof: glass walls, a barrel vault of glass on steel ribs
      b.ring('l7mallGlass', Q, base + 0.2, base + h - 4, { tw: 12, th: 5, v0: base + 0.2 });
      const E = edgesOf(Q).sort((a, c) => c.L - a.L)[0];
      const cxp = Q.reduce((s2, v, i) => (i % 2 ? s2 : s2 + v), 0) / (Q.length / 2), czp = Q.reduce((s2, v, i) => (i % 2 ? s2 + v : s2), 0) / (Q.length / 2);
      b.push(cxp, base + h - 4, czp, Math.atan2(E.tx, E.tz));
      let area = 0;
      for (let i = 0, n = Q.length / 2; i < n; i++) { const j = (i + 1) % n; area += Q[2 * i] * Q[2 * j + 1] - Q[2 * j] * Q[2 * i + 1]; }
      const L = E.L, R = Math.min(14, Math.abs(area) / 2 / L / 2);
      for (let k = 0; k < 12; k++) {
        const a0 = (k / 12) * Math.PI, a1 = ((k + 1) / 12) * Math.PI;
        const x0 = Math.cos(a0) * R, y0 = Math.sin(a0) * 4, x1 = Math.cos(a1) * R, y1 = Math.sin(a1) * 4;
        b.quad('glass', [x1, y1, -L / 2], [x0, y0, -L / 2], [x0, y0, L / 2], [x1, y1, L / 2]);
      }
      for (let z = -L / 2; z <= L / 2; z += 4) for (let k = 0; k < 12; k++) {
        const a0 = (k / 12) * Math.PI;
        b.box('steel', Math.cos(a0) * R, Math.sin(a0) * 4, z, 0.12, 0.12, 0.12, 0, {});
      }
      b.pop();
    } else {
      // the mall body: metal cladding with glazed bands, a red accent band, the lettering and the entrances
      b.ring('l7mallPanel', Q, base + 0.2, base + h, { tw: 3, th: 1.2, v0: base + 0.2 });
      b.ring('l7mallGlass', off(Q, -0.05), base + 0.2, base + 5.2, { tw: 12, th: 5, v0: base + 0.2 });
      b.ring('l7mallGlass', off(Q, -0.05), base + 11, base + 16, { tw: 12, th: 5, v0: base + 11 });
      b.ring('l7mallRed', off(Q, -0.08), base + h - 2.2, base + h - 1.6, { tw: 4, th: 1 });
      b.cap('roofBitumen', Q, base + h, { s: 6 });
      b.ring('l7mcGrey', off(Q, -0.1), base + h, base + h + 1.0, { tw: 4, th: 1 });
      const E = edgesOf(Q).sort((a, c) => c.L - a.L)[0];
      const mx = (E.ax + E.bx) / 2, mz = (E.az + E.bz) / 2;
      b.push(mx, base, mz, Math.atan2(E.nx, E.nz));
      b.quad('l7mallSign', [-11, h - 7, 0.15], [11, h - 7, 0.15], [11, h - 3.6, 0.15], [-11, h - 3.6, 0.15]);
      b.push(0, 0, 0.2);
      canopy(b, { w: 18, d: 5, y: 5.2, th: 0.45, cols: 4, colR: 0.18, slab: 'l7mcWhite', fascia: 'l7mallRed', colKey: 'steel', lights: true });
      b.pop();
      for (let i = -2; i <= 2; i++) doors(b, { x: i * 3.0, y: 0.2, z: 0.12, w: 2.6, h: 3.2, frame: 'steelDark', glass: 'glassDark' });
      b.pop();
    }
  }
  return done(b, M, sx / parts.length, sz / parts.length);
}
