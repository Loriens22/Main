// Sides and roof of the line-9 trolleybuses: painted lower panels with wheel arches, the blue lower band of the
// Sofia livery, the glazed band (black frame with the panes set flush, tilting top lights on the Urbino III
// and sliding vents on the Ikarus), door portals with their rubber surrounds, the painted roof edge, the roof
// fairings over the traction equipment and the frames closing the bodies at the bellows.
import * as THREE from 'three';
import { Parts, M, box, gaps, panelShape, sidePanel, loftSection, roofEdge, frameRect, extrude, rectShape, rectPath } from './geom.js';

export const BodyMixin = {
  /** z extent of a section's straight sides (the ends own the rounded corners). */
  sideRange(sec) {
    const F = this.F, r = this.G.bodyR;
    return sec === 'front' ? [F.frontZ + r, F.frontEnd] : [F.rearStart, F.rearZ - r];
  },

  buildSides(p, sec) {
    const D = this.D, G = this.G, F = this.F;
    const [zA, zB] = this.sideRange(sec);
    const hw = D.halfW, skirt = D.skirtY, belt = D.beltY, wtop = D.windowTopY, R = D.wheelR;
    const axles = sec === 'front' ? [-D.wb1, 0] : [0];
    const doors = this.spec.doors.filter((d) => d.section === sec);
    for (const side of [1, -1]) {
      const name = side > 0 ? 'right' : 'left';
      const dr = side > 0 ? doors : [];
      const holes = dr.map((d) => [d.z0 - 0.06, d.z1 + 0.06]);
      // ---- lower panels (paint) and the blue band
      for (const [a, b] of gaps(zA, zB, holes)) {
        if (b - a < 0.08) continue;
        p.add('paint', sidePanel(panelShape(a, b, skirt, belt, axles, G.archR, R), side, hw, 0.03, 0.004));
        // the blue band stops at the wheel arches (it is lower than the arch tops)
        for (const [c, e] of gaps(a, b, axles.map((x) => [x - G.archR - 0.01, x + G.archR + 0.01]))) {
          if (e - c > 0.04) p.add('blue', sidePanel(panelShape(c, e, skirt, G.bandTop), side, hw + 0.005, 0.006));
        }
        // sill under the panels between the arches
        for (const [c, e] of gaps(a, b, axles.map((x) => [x - G.archR, x + G.archR]))) {
          if (e - c > 0.05) p.add('underbody', box(0.4, 0.1, e - c), M(side * (hw - 0.22), skirt - 0.04, (c + e) / 2));
        }
        if (G.old) {
          // Ikarus: aluminium rub strips at the bumper line and under the windows
          for (const y of [0.78, belt - 0.07]) p.add('alu', box(0.02, 0.05, b - a - 0.04), M(side * (hw + 0.01), y, (a + b) / 2));
        }
      }
      // ---- wheel arches: black lips and liners
      for (const az of axles) {
        const n = 24, A = G.archR;
        const phi = Math.asin(Math.min(1, (R - skirt) / A));
        const pts = [];
        for (let i = 0; i <= n; i++) {
          const t = -phi + (i / n) * (Math.PI + 2 * phi);
          pts.push(new THREE.Vector3(side * (hw + 0.01), R + Math.sin(t) * (A + 0.01), az + Math.cos(t) * (A + 0.01)));
        }
        p.add('rubber', new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 32, 0.02, 6, false));
        const liner = new THREE.CylinderGeometry(A - 0.01, A - 0.01, 0.55, 28, 1, true, -phi, Math.PI + 2 * phi);
        liner.rotateZ(Math.PI / 2);
        p.add('underbody', liner, M(side * (hw - 0.29), R, az));
        const disc = new THREE.CircleGeometry(A - 0.01, 28, -phi, Math.PI + 2 * phi);
        disc.rotateY(Math.PI / 2);
        p.add('underbody', disc, M(side * (hw - 0.56), R, az));
      }
      // ---- glazed band
      const panes = G.panes[sec][name];
      const bandHoles = [...holes];
      for (const [a, b] of gaps(zA, zB, bandHoles)) {
        if (b - a < 0.06) continue;
        const sh = rectShape(a, belt, b, wtop);
        for (const pn of panes) {
          const [p0, p1, kind] = pn;
          if (p0 < a - 1e-3 || p1 > b + 1e-3) continue;
          const y0 = kind === 'cab' && !G.old ? belt - 0.18 : belt + 0.04;
          sh.holes.push(rectPath(p0, y0, p1, wtop - 0.05, G.paneR));
        }
        p.add('black', sidePanel(sh, side, hw - G.tumble, 0.035));
      }
      for (const [p0, p1, kind] of panes) {
        const y0 = kind === 'cab' && !G.old ? belt - 0.18 : belt + 0.04, y1 = wtop - 0.05;
        const w = p1 - p0, h = y1 - y0, zc = (p0 + p1) / 2, yc = (y0 + y1) / 2;
        const x = side * (hw - G.tumble + 0.004);
        const out = new THREE.PlaneGeometry(w, h);
        out.rotateY(side > 0 ? Math.PI / 2 : -Math.PI / 2);
        p.add('glassOut', out, M(x, yc, zc));
        const inn = new THREE.PlaneGeometry(w, h);
        inn.rotateY(side > 0 ? Math.PI / 2 : -Math.PI / 2);
        p.add('glassIn', inn, M(x - side * 0.03, yc, zc));
        if (G.hopper > 0 && kind !== 'cab') {
          // top light / sliding vent: a frame bar across the pane
          const yb = y1 - G.hopper;
          p.add(G.old ? 'alu' : 'black', box(0.03, 0.035, w), M(side * (hw - G.tumble + 0.012), yb, zc));
          if (G.old) {
            // Ikarus: two sliding vent panes in an aluminium frame, rubber-set lower pane
            p.add('alu', box(0.025, 0.025, 0.03), M(side * (hw - G.tumble + 0.014), (yb + y1) / 2, zc));
            p.add('rubber', box(0.02, 0.02, w + 0.02), M(side * (hw - G.tumble + 0.01), y0 - 0.01, zc));
          }
        }
        if (kind === 'cab' && !G.old) {
          // driver's sliding window: a vertical frame bar
          p.add('black', box(0.03, h, 0.03), M(side * (hw - G.tumble + 0.01), yc, p0 + w * 0.45));
        }
      }
      // ---- door portals: rubber surrounds, the header over the door
      for (const d of dr) {
        const top = G.doorTop;
        const fr = frameRect(d.z0 - 0.07, skirt - 0.02, d.z1 + 0.07, top + 0.06, 0.07, 0.05, 0.04);
        const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0), new THREE.Vector3(-1, 0, 0)).setPosition(hw + 0.012, 0, 0);
        p.add('rubber', fr, m);
        // header between the door top and the window top (black glass look on the Solaris, paint on the Ikarus)
        p.add(G.old ? 'paint' : 'black', box(0.035, wtop - top - 0.06, d.z1 - d.z0 + 0.14), M(hw - 0.015, (wtop + top + 0.06) / 2, (d.z0 + d.z1) / 2));
        // door step edge (yellow) and the threshold
        p.add('yellowEdge', box(0.06, 0.012, d.z1 - d.z0), M(hw - 0.06, G.old ? 0.36 : D.floorY + 0.003, (d.z0 + d.z1) / 2));
        p.add('steel', box(0.12, 0.02, d.z1 - d.z0), M(hw - 0.1, G.old ? 0.345 : D.floorY - 0.008, (d.z0 + d.z1) / 2));
      }
      // ---- fleet number and operator lettering on the lower panel
      const dz = sec === 'front' ? -4.7 : 1.2;
      if (sec === 'front' || G.old) {
        const dg = new THREE.PlaneGeometry(1.6, 0.4);
        dg.rotateY(side > 0 ? Math.PI / 2 : -Math.PI / 2);
        p.add('decals', dg, M(side * (hw + 0.009), G.old ? 1.2 : 0.82, dz));
      }
    }
    // ---- painted roof edge and roof over the whole section
    const edge = loftSection(roofEdge(hw, wtop, D.roofY, G.roofEdgeR, 7, G.tumble), zA, zB);
    p.add('paint', edge);
    // gutter line above the windows
    for (const side of [1, -1]) p.add('satin', box(0.02, 0.015, zB - zA), M(side * (hw - G.tumble + 0.005), wtop + 0.01, (zA + zB) / 2));
    // ---- underfloor: dark tray between the axles (seen from outside under the skirt)
    p.add('underbody', box(hw * 2 - 0.3, 0.05, zB - zA), M(0, skirt - 0.06, (zA + zB) / 2));
    if (G.old) {
      // Ikarus: the high floor shows the frame and the equipment boxes under the body
      for (const side of [1, -1]) p.add('underbody', box(0.12, 0.25, zB - zA - 1.2), M(side * 0.45, 0.5, (zA + zB) / 2));
    }
  },

  /** Roof fairings over the traction equipment (rounded boxes). */
  buildRoof(p, sec) {
    const D = this.D;
    for (const f of this.G.fairings.filter((q) => q.sec === sec)) {
      const len = f.z1 - f.z0;
      p.add(f.mat, box(f.w, f.h + 0.04, len, f.r), M(0, D.roofY + f.h / 2 - 0.02, (f.z0 + f.z1) / 2));
      // dark seam where the fairing meets the roof
      p.add('satin', box(f.w + 0.01, 0.02, len + 0.01), M(0, D.roofY + 0.01, (f.z0 + f.z1) / 2));
    }
    if (sec === 'rear') {
      // insulated roof walkway under the poles (anti-slip strip) and the cable duct to the converters
      p.add('satin', box(0.5, 0.01, 2.6), M(0, D.roofY + 0.006, this.spec.trolley.base[0][2] + 1.6));
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
