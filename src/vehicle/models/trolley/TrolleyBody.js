// Sides and roof of the line-9 trolleybuses, laid out from the reference photographs (designs.js):
//   Solaris IV / III: the blue skirt panel (cut round the wheel arches) under the orange / yellow panel band, whose
//     arch cut-outs are wider so the blue shows as a broad surround round every arch (ref02, ref09, ref13, ref17);
//     the black glazed band with flush panes and dark top-light bars; the sky-blue band over the windows and the
//     roof; long lofted roof fairings, the silver air-conditioning units, the tubular pole catcher frame.
//   Ikarus 280.92F: yellow body, the blue lower band up to the arch tops with a black rub strip on its edge and
//     louvred equipment grilles in it; separate windows in black rubber between yellow pillars, sliding top vents
//     (ref07, ref11, ref18); the grey louvred box on the roof, roof hatches, the amber marker lamps.
import * as THREE from 'three';
import { Parts, M, box, gaps, panelShape, sidePanel, loftSection, roofEdge, frameRect, extrude, rectShape, rectPath, fairingGeom, shroudGeom, shroudInsert, fenderShape } from './geom.js';

export const BodyMixin = {
  /** z extent of a section's straight sides (the ends own the rounded corners). */
  sideRange(sec) {
    const F = this.F, r = this.G.bodyR;
    return sec === 'front' ? [F.frontZ + r, F.frontEnd] : [F.rearStart, F.rearZ - r];
  },

  buildSides(p, sec) {
    const D = this.D, G = this.G;
    const [zA, zB] = this.sideRange(sec);
    const hw = D.halfW, skirt = D.skirtY, belt = D.beltY, wtop = D.windowTopY, R = D.wheelR;
    const axles = sec === 'front' ? [-D.wb1, 0] : [0];
    const doors = this.spec.doors.filter((d) => d.section === sec);
    for (const side of [1, -1]) {
      const name = side > 0 ? 'right' : 'left';
      const dr = side > 0 ? doors : [];
      const holes = dr.map((d) => [d.z0 - 0.06, d.z1 + 0.06]);
      // ---- lower body: the base panel and the coloured band over it
      for (const [a, b] of gaps(zA, zB, holes)) {
        if (b - a < 0.08) continue;
        if (!G.old) {
          // Solaris: blue skirt panel to the belt, the orange / yellow band laid over it from bandTop with wider
          // arch cut-outs (the blue surround of the arches)
          p.add('blue', sidePanel(panelShape(a, b, skirt, belt, axles, G.archR, R), side, hw, 0.03, 0.004));
          if (G.archCut) {
            // Solaris IV (ref02): the raised blue fender round every arch reaches the window line, so the orange band
            // is broken into separate panels between the fenders and the doors
            const AC = G.archCut;
            const y0 = G.bandTop, y1 = belt - 0.005;
            const cuts = axles.map((ax) => ({ f0: ax - AC.front0, f1: ax - AC.front1, r: ax + AC.rear })).sort((u, v) => u.r - v.r);
            const pieces = [];
            let L = [a, a];
            for (const c of cuts) {
              if (c.r <= a) continue;
              if (Math.min(c.f0, c.f1) >= b) break;
              pieces.push([L, [Math.min(c.f0, b), Math.min(c.f1, b)]]);
              L = [Math.max(c.r, a), Math.max(c.r, a)];
            }
            pieces.push([L, [b, b]]);
            for (const [[l0, l1], [r0, r1]] of pieces) {
              if (Math.max(r0 - l0, r1 - l1) < 0.04) continue;
              const sh = new THREE.Shape();
              sh.moveTo(l0, y0); sh.lineTo(Math.max(l0, r0), y0); sh.lineTo(Math.max(l1, r1), y1); sh.lineTo(l1, y1); sh.closePath();
              p.add('band', sidePanel(sh, side, hw + 0.0045, 0.006));
            }
          } else {
            p.add('band', sidePanel(panelShape(a, b, G.bandTop, belt - 0.005, axles, G.archR + G.archBand, R), side, hw + 0.0045, 0.006));
          }
        } else {
          // Ikarus: yellow body, the blue band up to the arch tops, the black rub strip on its upper edge
          p.add('paint', sidePanel(panelShape(a, b, skirt, belt, axles, G.archR, R), side, hw, 0.03, 0.004));
          p.add('blue', sidePanel(panelShape(a, b, skirt, G.bandTop, axles, G.archR, R), side, hw + 0.0045, 0.006));
          for (const [c, e] of gaps(a, b, axles.map((x) => [x - G.archR - 0.05, x + G.archR + 0.05]))) {
            if (e - c > 0.05) p.add('rubber', box(0.022, 0.045, e - c), M(side * (hw + 0.012), G.bandTop + 0.01, (c + e) / 2));
          }
        }
        // sill under the panels between the arches
        for (const [c, e] of gaps(a, b, axles.map((x) => [x - G.archR, x + G.archR]))) {
          if (e - c > 0.05) p.add('underbody', box(0.4, 0.1, e - c), M(side * (hw - 0.22), skirt - 0.04, (c + e) / 2));
        }
      }
      // Ikarus: louvred grilles of the electrical equipment in the blue band (ref18)
      if (G.old) {
        const grilles = sec === 'front' ? [-4.2, -1.55] : [-1.55];
        for (const gz of grilles) {
          if (holes.some(([u, v]) => gz + 0.35 > u && gz - 0.35 < v)) continue;
          p.add('grille', box(0.012, 0.36, 0.5), M(side * (hw + 0.008), 0.66, gz));
          for (let k = 0; k < 7; k++) p.add('blue', box(0.02, 0.018, 0.48), M(side * (hw + 0.014), 0.52 + k * 0.045, gz));
        }
      }
      // ---- wheel arches: (Solaris IV raised blue fenders,) black lips and liners
      if (G.archCut) {
        for (const az of axles) p.add('blue', sidePanel(fenderShape(az, G.archR, R, skirt, G.bandTop, belt, G.archCut), side, hw + 0.006, 0.012, 0.006));
      }
      for (const az of axles) {
        const n = 24, A = G.archR;
        const phi = Math.asin(Math.min(1, (R - skirt) / A));
        const pts = [];
        for (let i = 0; i <= n; i++) {
          const t = -phi + (i / n) * (Math.PI + 2 * phi);
          pts.push(new THREE.Vector3(side * (hw + (G.archCut ? 0.016 : 0.006)), R + Math.sin(t) * (A + 0.005), az + Math.cos(t) * (A + 0.005)));
        }
        p.add('rubber', new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 32, 0.016, 6, false));
        const liner = new THREE.CylinderGeometry(A - 0.01, A - 0.01, 0.55, 28, 1, true, -phi, Math.PI + 2 * phi);
        liner.rotateZ(Math.PI / 2);
        p.add('underbody', liner, M(side * (hw - 0.29), R, az));
        const disc = new THREE.CircleGeometry(A - 0.01, 28, -phi, Math.PI + 2 * phi);
        disc.rotateY(Math.PI / 2);
        p.add('underbody', disc, M(side * (hw - 0.56), R, az));
      }
      // ---- glazed band
      const panes = G.panes[sec][name];
      const paneY = (kind) => [kind === 'cab' && !G.old ? belt - 0.16 : belt + (G.old ? 0.06 : 0.03), wtop - (G.old ? 0.08 : 0.04)];
      for (const [a, b] of gaps(zA, zB, holes)) {
        if (b - a < 0.06) continue;
        const sh = rectShape(a, belt, b, wtop);
        for (const [p0, p1, kind] of panes) {
          const q0 = Math.max(p0, a + 0.02), q1 = Math.min(p1, b - 0.02);
          if (q1 - q0 < 0.2) continue;
          const [y0, y1] = paneY(kind);
          sh.holes.push(rectPath(q0, y0, q1, y1, G.paneR));
        }
        // Solaris: the black frit band the panes sit in; Ikarus: yellow pillars between rubber-set windows
        p.add(G.old ? 'paint' : 'black', sidePanel(sh, side, hw - G.tumble, G.old ? 0.012 : 0.035));
      }
      for (const [p0raw, p1raw, kind] of panes) {
        const p0 = Math.max(p0raw, zA + 0.02), p1 = Math.min(p1raw, zB - 0.02);
        if (p1 - p0 < 0.2) continue;
        const [y0, y1] = paneY(kind);
        const w = p1 - p0, h = y1 - y0, zc = (p0 + p1) / 2, yc = (y0 + y1) / 2;
        const x = side * (hw - G.tumble + 0.004);
        const out = new THREE.PlaneGeometry(w, h);
        out.rotateY(side > 0 ? Math.PI / 2 : -Math.PI / 2);
        p.add('glassOut', out, M(x - side * (G.old ? 0.012 : 0), yc, zc));
        const inn = new THREE.PlaneGeometry(w, h);
        inn.rotateY(side > 0 ? Math.PI / 2 : -Math.PI / 2);
        p.add('glassIn', inn, M(x - side * 0.03, yc, zc));
        if (G.old) {
          // black rubber gasket round the window
          const fr = frameRect(p0 - 0.03, y0 - 0.03, p1 + 0.03, y1 + 0.03, 0.05, G.paneR + 0.03, 0.025);
          p.add('rubber', fr, side > 0
            ? new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0)).setPosition(hw - G.tumble - 0.012, 0, 0)
            : new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0), new THREE.Vector3(-1, 0, 0)).setPosition(-hw + G.tumble + 0.012, 0, 0));
        }
        if (G.hopper > 0 && kind !== 'cab') {
          // top light / sliding vent: a frame bar across the pane (and the vent's centre stile on the Ikarus)
          const yb = y1 - G.hopper;
          p.add(G.old ? 'alu' : 'satin', box(0.03, G.old ? 0.03 : 0.022, w), M(side * (hw - G.tumble + 0.008), yb, zc));
          if (G.old) p.add('alu', box(0.025, G.hopper - 0.02, 0.03), M(side * (hw - G.tumble + 0.01), (yb + y1) / 2, zc));
        }
        if (kind === 'cab' && !G.old) {
          // driver's sliding window: a vertical frame bar
          p.add('satin', box(0.03, h, 0.03), M(side * (hw - G.tumble + 0.01), yc, p0 + w * 0.45));
        }
      }
      // ---- door portals: rubber surrounds, the header over the door, the threshold
      for (const d of dr) {
        const top = G.doorTop;
        const fr = frameRect(d.z0 - 0.07, skirt - 0.02, d.z1 + 0.07, top + 0.06, G.old ? 0.04 : 0.07, 0.05, 0.04);
        const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0), new THREE.Vector3(-1, 0, 0)).setPosition(hw + 0.012, 0, 0);
        p.add(G.old ? 'paint' : 'black', fr, m);
        if (wtop - top - 0.06 > 0.02) p.add(G.old ? 'paint' : 'black', box(0.035, wtop - top - 0.06, d.z1 - d.z0 + 0.14), M(hw - 0.015, (wtop + top + 0.06) / 2, (d.z0 + d.z1) / 2));
        p.add('yellowEdge', box(0.08, 0.025, d.z1 - d.z0), M(hw - 0.04, G.old ? 0.37 : D.floorY + 0.005, (d.z0 + d.z1) / 2));
        p.add('steel', box(0.12, 0.02, d.z1 - d.z0), M(hw - 0.1, G.old ? 0.345 : D.floorY - 0.008, (d.z0 + d.z1) / 2));
      }
      // ---- fleet number on the side (small black digits: on the panel band of the Solaris, under the windows
      // of the Ikarus)
      const dz = sec === 'front' ? (G.old ? -2.75 : -3.2) : (G.old ? 1.6 : 1.4);
      const dg = new THREE.PlaneGeometry(0.64, 0.16);
      dg.rotateY(side > 0 ? Math.PI / 2 : -Math.PI / 2);
      p.add('decals', dg, M(side * (hw + 0.012), G.old ? 1.32 : 0.92, dz));
    }
    // ---- the band over the windows and the roof (sky blue on the Solaris, yellow on the Ikarus); the Solaris IV
    // has its tall roof shroud with the slanted glass panels instead, and black glazing up to the roof behind it
    const SH = G.shroud;
    const part = SH && SH.parts.find((q) => q.sec === sec);
    if (part) {
      const s0 = Math.max(zA, part.z0), s1 = Math.min(zB, part.z1);
      // over the rear section the sides behind the pole-base box are black glass, its top edge rising rearwards
      const bf = part.blackFrom, br = part.blackRise;
      const cut = bf == null ? null : (z, h) => (z < bf ? wtop : wtop + (h - wtop) * (br[0] + (br[1] - br[0]) * Math.min(1, (z - bf) / Math.max(0.1, s1 - bf))));
      const { geom, lower } = shroudGeom(s0, s1, wtop, hw - G.tumble, SH.top, D.roofY, { rampF: part.rampF, rampR: part.rampR, capF: part.capF ?? true, capR: part.capR ?? true, cut, breaks: bf == null ? [] : [bf] });
      p.add('paint', geom);
      if (lower) p.add('darkGlass', lower);
      if (sec === 'front') {
        for (const [side, zb0, zb1, lean] of SH.inserts) {
          p.add('darkGlass', shroudInsert(side, zb0, zb1, wtop + SH.insertY[0], wtop + SH.insertY[1], lean, wtop, SH.top, hw - G.tumble));
        }
      }
      for (const [a, b] of gaps(zA, zB, [[s0, s1]])) {
        if (b - a > 0.02) p.add('paint', loftSection(roofEdge(hw, wtop, D.roofY, G.roofEdgeR, 8, G.tumble), a, b));
      }
    } else {
      p.add('paint', loftSection(roofEdge(hw, wtop, D.roofY, G.roofEdgeR, 8, G.tumble), zA, zB));
    }
    for (const side of [1, -1]) p.add('satin', box(0.02, 0.015, zB - zA), M(side * (hw - G.tumble + 0.005), wtop + 0.01, (zA + zB) / 2));
    // ---- underfloor: dark tray between the axles (seen from outside under the skirt)
    p.add('underbody', box(hw * 2 - 0.3, 0.05, zB - zA), M(0, skirt - 0.06, (zA + zB) / 2));
    if (G.old) for (const side of [1, -1]) p.add('underbody', box(0.12, 0.25, zB - zA - 1.2), M(side * 0.45, 0.5, (zA + zB) / 2));
  },

  /** Roof equipment: lofted fairings, air-conditioning units with their louvres, the pole catcher frame. */
  buildRoof(p, sec) {
    const D = this.D, G = this.G;
    for (const f of G.fairings.filter((q) => q.sec === sec)) {
      const y0 = D.roofY - 0.02 + (f.y || 0);
      p.add(f.mat, fairingGeom(f.z0, f.z1, f.w, f.h + 0.02, f.r, y0, { rampF: f.rampF ?? 0.05, rampR: f.rampR ?? 0.05 }));
      if (f.louvres) {
        // louvres: dark grilles with slats on both sides (and the front of the Solaris III cab pod)
        const len = f.z1 - f.z0;
        const n = Math.max(1, Math.floor(len / 0.45));
        for (const sx of [-1, 1]) {
          for (let k = 0; k < n; k++) {
            const zc = f.z0 + (len * (k + 0.5)) / n;
            p.add('grille', box(0.012, f.h * 0.5, len / n - 0.08), M(sx * (f.w / 2 + 0.002), y0 + f.h * 0.45, zc));
            for (let j = 0; j < 4; j++) p.add(f.mat, box(0.02, 0.012, len / n - 0.1), M(sx * (f.w / 2 + 0.008), y0 + f.h * 0.27 + j * f.h * 0.12, zc));
          }
        }
        if (G.gen === 3 && sec === 'front' && f.z0 < -7) {
          for (let k = 0; k < 4; k++) p.add('grille', box(0.26, f.h * 0.42, 0.02), M(-0.48 + k * 0.32, y0 + f.h * 0.48, f.z0 + 0.06));
        }
      }
    }
    if (sec === 'rear') {
      // anti-slip walkway strip along the poles
      p.add('satin', box(0.5, 0.01, 2.6), M(0, D.roofY + 0.006, this.spec.trolley.base[0][2] + 1.6));
      // the tubular pole catcher frame over the rear end, with its two cane hooks (Solaris, ref08 / ref09)
      const H = G.hookFrame;
      if (H) {
        const y = D.roofY + H.h, r = 0.022;
        const loop = [[-0.72, H.z0], [0.72, H.z0], [0.78, H.z0 + 0.12], [0.78, H.z1 - 0.12], [0.72, H.z1], [-0.72, H.z1], [-0.78, H.z1 - 0.12], [-0.78, H.z0 + 0.12]];
        const pts = loop.map(([x, z]) => new THREE.Vector3(x, y, z));
        p.add('satin', new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.1), 48, r, 6, true));
        for (const [x, z] of [[-0.7, H.z0 + 0.05], [0.7, H.z0 + 0.05], [-0.7, H.z1 - 0.05], [0.7, H.z1 - 0.05]]) {
          p.add('satin', new THREE.CylinderGeometry(r, r * 1.3, H.h, 8), M(x, D.roofY + H.h / 2, z));
        }
        for (const b of this.spec.trolley.base) {
          const x = b[0], zh = H.z0 + 0.08;
          const hook = [new THREE.Vector3(x, y, zh), new THREE.Vector3(x, y + 0.22, zh - 0.02), new THREE.Vector3(x, y + 0.3, zh + 0.08), new THREE.Vector3(x, y + 0.22, zh + 0.16)];
          p.add('satin', new THREE.TubeGeometry(new THREE.CatmullRomCurve3(hook), 16, 0.02, 6, false));
          p.add('rubber', box(0.06, 0.03, 0.12), M(x, y + 0.1, zh + 0.02));
        }
      }
    }
    // Ikarus: amber marker lamps along the front roof edge (ref18)
    if (G.markers && sec === 'front') {
      for (let k = 0; k < 5; k++) p.add('marker', box(0.09, 0.05, 0.06, 0.015), M(-0.6 + k * 0.3, D.roofY + 0.02, this.F.frontZ + 0.18));
    }
  },

  /** Frame closing the body at the bellows end. */
  buildBellowsFrame(p, sec) {
    const D = this.D, F = this.F, HW = D.halfW;
    const z = sec === 'front' ? F.frontEnd : F.rearStart;
    const dir = sec === 'front' ? 1 : -1;
    const outer = rectShape(-HW, D.skirtY, HW, D.roofY, this.G.old ? 0.12 : 0.22);
    outer.holes.push(rectPath(-HW + 0.1, Math.max(0.42, D.floorY - 0.2) + 0.02, HW - 0.1, D.roofY - 0.12, this.G.old ? 0.1 : 0.2));
    p.add('matteBlack', extrude(outer, 0.05, 0), M(0, 0, dir > 0 ? z - 0.05 : z));
  },
};
