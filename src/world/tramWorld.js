// Tram line 7 infrastructure: boulevards with a central tram reservation, cross streets, junctions,
// ballasted / embedded narrow-gauge track, overhead line, gantry signals and stop platforms.
import * as THREE from 'three';
import { WM } from './materials.js';
import { stripGeo, polyGeo, hmat } from './common.js';
import { streetPts, openIntervals, addStrip, cornerArc, fanGeo, annulusGeo, wallAlong, fixUV, markRoadOcc, rectGeo } from './roads.js';
import { signalHead, pedHead, trashBin, stopPole, streetLamp } from './props.js';
import { tramShelter, gantry, jerseyBarrier } from './landmarks.js';
import { hedgeLine, meshFence, guardrail } from './buildings2.js';
import { GAUGE, TRACK, RES, CW, SW, PLATFORM_Y } from '../tramRoute.js';
import { mat, rr } from '../util.js';

const Y_WALK = 0.15, Y_PAINT = 0.012, Y_PLANT = 0.12;
const WIRE_Y = 5.9;

/** Road-wear vertex colour across a 3-lane carriageway on each side of the reservation. */
function wearB(l) {
  const a = Math.abs(l); let c = 1;
  for (const lc of [RES + 1.75, RES + 5.25, RES + 8.75]) { const d = a - lc; c -= 0.06 * Math.exp(-((d / 0.4) ** 2)); c += 0.035 * Math.exp(-(((Math.abs(d) - 0.95) / 0.3) ** 2)); }
  return c;
}

export function buildTramInfra(route, cb, occ, reg, tl) {
  const info = { walkPaths: [], crossings: [], junctions: [], platforms: [] };
  const { streets, inters } = route;
  // ---------- junction list per street ----------
  const J = new Map(streets.map((st) => [st, []]));
  for (const it of inters) for (const arm of [it.a, it.b]) { const other = arm === it.a ? it.b : it.a; J.get(arm.st).push({ s: arm.s, H: other.st.halfW, rc: it.rc, it, other }); }
  // stop platform zones (both sides) per street
  const P = new Map(streets.map((st) => [st, []]));
  for (const stp of route.stops) P.get(stp.st).push([stp.sb - 38, stp.sb + 2.5]);

  for (const st of streets) {
    const L = st.poly.length;
    const js = J.get(st);
    const gCar = js.map((j) => [j.s - (j.H + j.rc), j.s + (j.H + j.rc)]);
    const gMed = js.map((j) => [j.s - (j.H + j.rc + 6), j.s + (j.H + j.rc + 6)]);
    if (st.kind === 'boulevard') {
      for (const [a, b] of openIntervals(L, gCar.slice())) {
        const pts = streetPts(st, a, b, 2);
        for (const sd of [1, -1]) {
          addStrip(cb, WM.asphalt, stripGeo(pts, sd > 0 ? RES : -RES - CW, sd > 0 ? RES + CW : -RES, 0, 0, { uvScale: 5, across: 6, vOffset: a, colorFn: wearB }));
          markRoadOcc(occ, pts, 0, 3, sd * RES, sd * (RES + CW));
          // edge line next to the reservation + lane dashes
          addStrip(cb, WM.paint, stripGeo(pts, sd * (RES + 0.25) - 0.06, sd * (RES + 0.25) + 0.06, Y_PAINT));
          for (let s = Math.ceil(a / 9) * 9 + 1; s < b - 3.5; s += 9) {
            const seg = streetPts(st, s, s + 3, 3);
            for (const l of [RES + 3.5, RES + 7]) addStrip(cb, WM.paint, stripGeo(seg, sd * l - 0.06, sd * l + 0.06, Y_PAINT));
          }
          // sidewalk + curbs
          const l0 = sd * (RES + CW), l1 = sd * (RES + CW + SW);
          addStrip(cb, WM.pavers, stripGeo(pts, Math.min(l0, l1), Math.max(l0, l1), Y_WALK, Y_WALK, { uvScale: 2, vOffset: a }));
          addStrip(cb, WM.curb, stripGeo(pts, Math.min(l0, l0 + sd * 0.2), Math.max(l0, l0 + sd * 0.2), Y_WALK + 0.005, Y_WALK + 0.005, { uvScale: 1 }));
          addStrip(cb, WM.curb, stripGeo(pts, l0, l0, 0, Y_WALK + 0.005, { uvScale: 1 }));
          addStrip(cb, WM.curb, stripGeo(pts, l1, l1, -0.06, Y_WALK, { uvScale: 1 }));
          markRoadOcc(occ, pts, 0, 2, l0, l1);
          info.walkPaths.push({ st, side: sd, a, b, lat: sd * (RES + CW + SW * 0.55) });
        }
      }
      // reservation: curbs, planting strips / platforms, ballast core
      const tr = st.tracks || [1e9, 1e9];
      for (const [a, b] of openIntervals(L, gMed.slice())) {
        const pts = streetPts(st, a, b, 2);
        markRoadOcc(occ, pts, 0, 3, -RES, RES);
        for (const sd of [1, -1]) {
          addStrip(cb, WM.curb, stripGeo(pts, sd * RES, sd * RES, 0, Y_PLANT + 0.03, { uvScale: 1 }));
          addStrip(cb, WM.curb, stripGeo(pts, Math.min(sd * RES, sd * (RES - 0.22)), Math.max(sd * RES, sd * (RES - 0.22)), Y_PLANT + 0.03, Y_PLANT + 0.03, { uvScale: 1 }));
          // planting strip except at platforms
          for (const [c0, c1] of openIntervals(b - a, P.get(st).map(([p0, p1]) => [p0 - a, p1 - a]))) {
            const pp = streetPts(st, a + c0, a + c1, 2);
            addStrip(cb, WM.grass, stripGeo(pp, Math.min(sd * (TRACK + 1.55), sd * (RES - 0.22)), Math.max(sd * (TRACK + 1.55), sd * (RES - 0.22)), Y_PLANT, Y_PLANT, { uvScale: 3 }), 0x8a9a5a);
            addStrip(cb, WM.curb, stripGeo(pp, sd * (TRACK + 1.55), sd * (TRACK + 1.55), -0.02, Y_PLANT, { uvScale: 1 }));
            // red barberry hedge + white pedestrian fence along the tracks
            const hedge = streetPts(st, a + c0 + 1, a + c1 - 1, 4).map(([x, z], i, arr) => { const f = st.poly.at(a + c0 + 1 + (i / Math.max(1, arr.length - 1)) * (c1 - c0 - 2)); return [x - Math.sin(f.h) * sd * (RES - 1.2), z + Math.cos(f.h) * sd * (RES - 1.2)]; });
            cb.detail = true;
            if (hedge.length > 1 && st.tracks) hedgeLine(cb, hedge, 0.62, 0.95, 0x6a2430);
            const fence = streetPts(st, a + c0 + 1, a + c1 - 1, 2.6).map(([x, z], i, arr) => { const f = st.poly.at(a + c0 + 1 + (i / Math.max(1, arr.length - 1)) * (c1 - c0 - 2)); return [x - Math.sin(f.h) * sd * (TRACK + 1.85), z + Math.cos(f.h) * sd * (TRACK + 1.85)]; });
            if (fence.length > 1 && st.tracks) whiteFence(cb, fence);
            cb.detail = false;
            // street lamps in the reservation (arm over the carriageway)
            for (let s = Math.ceil((a + c0) / 38) * 38 + 12; s < a + c1 - 4; s += 38) {
              const f = st.poly.at(s); const lx = f.x - Math.sin(f.h) * sd * (RES - 0.5), lz = f.z + Math.cos(f.h) * sd * (RES - 0.5);
              streetLamp(cb, lx, lz, -(f.h + (sd > 0 ? Math.PI / 2 : -Math.PI / 2)), 9);
            }
          }
        }
        // ballast core on the tracked part, grass elsewhere
        for (const [c0, c1] of [[Math.max(a, tr[0]), Math.min(b, tr[1])]]) if (c1 - c0 > 1) {
          const pp = streetPts(st, c0, c1, 2);
          addStrip(cb, WM.ballast, stripGeo(pp, -(TRACK + 1.55), TRACK + 1.55, -0.02, -0.02, { uvScale: 2.2, across: 2 }));
        }
        for (const [c0, c1] of [[a, Math.min(b, tr[0])], [Math.max(a, tr[1]), b]]) if (c1 - c0 > 1) {
          addStrip(cb, WM.grass, stripGeo(streetPts(st, c0, c1, 2), -(RES - 0.2), RES - 0.2, Y_PLANT, Y_PLANT, { uvScale: 3 }), 0x8a9a5a);
        }
      }
    } else {
      // ordinary two-way street
      const hw = st.halfW, sw = st.sidewalk;
      for (const [a, b] of openIntervals(L, gCar.slice())) {
        const pts = streetPts(st, a, b, 2);
        addStrip(cb, WM.asphalt, stripGeo(pts, -hw, hw, 0, 0, { uvScale: 5, across: 8, vOffset: a }));
        markRoadOcc(occ, pts, hw, 3);
        addStrip(cb, WM.paint, stripGeo(pts, -0.19, -0.07, Y_PAINT)); addStrip(cb, WM.paint, stripGeo(pts, 0.07, 0.19, Y_PAINT));
        if (st.lanesPerDir > 1) for (let s = Math.ceil(a / 9) * 9 + 1; s < b - 3.5; s += 9) { const seg = streetPts(st, s, s + 3, 3); for (const l of [-3.5, 3.5]) addStrip(cb, WM.paint, stripGeo(seg, l - 0.06, l + 0.06, Y_PAINT)); }
        else for (const l of [-4.4, 4.4]) addStrip(cb, WM.paint, stripGeo(pts, l - 0.06, l + 0.06, Y_PAINT)); // parking lane edge
        for (const sd of [1, -1]) {
          const l0 = sd * hw, l1 = sd * (hw + sw);
          addStrip(cb, WM.pavers, stripGeo(pts, Math.min(l0, l1), Math.max(l0, l1), Y_WALK, Y_WALK, { uvScale: 2, vOffset: a }));
          addStrip(cb, WM.curb, stripGeo(pts, Math.min(l0, l0 + sd * 0.2), Math.max(l0, l0 + sd * 0.2), Y_WALK + 0.005, Y_WALK + 0.005, { uvScale: 1 }));
          addStrip(cb, WM.curb, stripGeo(pts, l0, l0, 0, Y_WALK + 0.005, { uvScale: 1 }));
          addStrip(cb, WM.curb, stripGeo(pts, l1, l1, -0.06, Y_WALK, { uvScale: 1 }));
          markRoadOcc(occ, pts, 0, 2, l0, l1);
          info.walkPaths.push({ st, side: sd, a, b, lat: sd * (hw + sw * 0.55) });
          for (let s = a + 20; s < b - 5; s += 32) { const f = st.poly.at(s); streetLamp(cb, f.x - Math.sin(f.h) * sd * (hw + 0.6), f.z + Math.cos(f.h) * sd * (hw + 0.6), -(f.h + (sd > 0 ? Math.PI / 2 : -Math.PI / 2)), 8); }
        }
      }
    }
  }

  // ---------- junction boxes ----------
  for (const it of inters) {
    const A = it.a.st, Bs = it.b.st;
    const hA = A.poly.at(it.a.s).h;
    const Ha = A.halfW, Hb = Bs.halfW, rc = it.rc;
    const M = hmat(it.x, 0, it.z, hA);
    const add = (m, g, col) => { g.applyMatrix4(M); fixUV(g); addStrip(cb, m, g, col); };
    // tee: street A (the boulevard) only continues on the +u side, the far side of B is a straight kerb
    const tee = !!it.tee, sws = Bs.sidewalk;
    add(WM.asphalt, rectGeo(tee ? -Hb : -(Hb + rc), Hb + rc, -Ha, Ha, 0));
    add(WM.asphalt, rectGeo(-Hb, Hb, -(Ha + rc), Ha + rc, 0.0005));
    // paved median ends of boulevards (between the zebra and the junction)
    if (A.kind === 'boulevard') for (const su of tee ? [1] : [-1, 1]) add(WM.asphalt, rectGeo(su > 0 ? Hb + rc - 0.01 : -(Hb + rc + 6), su > 0 ? Hb + rc + 6 : -(Hb + rc - 0.01), -RES, RES, 0.001));
    if (Bs.kind === 'boulevard') for (const sv of [-1, 1]) add(WM.asphalt, rectGeo(-RES, RES, sv > 0 ? Ha + rc - 0.01 : -(Ha + rc + 6), sv > 0 ? Ha + rc + 6 : -(Ha + rc - 0.01), 0.001));
    if (tee) {
      // continuous far-side sidewalk of B across the junction, with a level crossing for the tram tracks
      const gap = TRACK + 2.4, u0 = -(Hb + sws), u1 = -Hb;
      for (const [v0, v1] of [[-(Ha + rc) - 0.02, -gap], [gap, Ha + rc + 0.02]]) {
        add(WM.pavers, rectGeo(u0, u1, v0, v1, Y_WALK));
        add(WM.curb, rectGeo(u1 - 0.2, u1, v0, v1, Y_WALK + 0.005));
        const w = wallAlong([[u1, v0], [u1, v1]], 0, Y_WALK + 0.005); add(WM.curb, w);
        for (const v of [v0, v1]) if (Math.abs(v) < Ha) add(WM.curb, wallAlong([[u0, v], [u1, v]], 0, Y_WALK));
      }
      add(WM.concrete, rectGeo(u0, u1, -gap, gap, 0.006), 0x8f8d88);
      occ.markRect(it.x - Math.cos(hA) * (Hb + sws / 2), it.z - Math.sin(hA) * (Hb + sws / 2), hA, sws / 2, Ha + rc, 2);
    }
    for (const su of tee ? [1] : [-1, 1]) for (const sv of [-1, 1]) {
      const fan = cornerArc(su * (Hb + rc), sv * (Ha + rc), rc, su, sv, 16);
      add(WM.asphalt, fanGeo([su * Hb, sv * Ha], fan, 0.0008));
      const inner = cornerArc(su * (Hb + rc), sv * (Ha + rc), rc - 4.5, su, sv, 16);
      add(WM.pavers, annulusGeo(fan, inner, Y_WALK));
      add(WM.curb, wallAlong(fan, 0, Y_WALK + 0.005));
      add(WM.curb, wallAlong(inner, -0.06, Y_WALK));
    }
    // zebra crossings on all four arms (across the full carriageway incl. the paved median)
    const zeb = (u0, u1, v0, v1, alongU) => {
      if (alongU) { for (let v = v0 + 0.3; v <= v1 - 0.3; v += 1.1) add(WM.paint, rectGeo(u0, u1, v - 0.27, v + 0.27, Y_PAINT)); }
      else { for (let u = u0 + 0.3; u <= u1 - 0.3; u += 1.1) add(WM.paint, rectGeo(u - 0.27, u + 0.27, v0, v1, Y_PAINT)); }
    };
    for (const su of tee ? [1] : [-1, 1]) zeb(su > 0 ? Hb + rc + 1 : -(Hb + rc + 5), su > 0 ? Hb + rc + 5 : -(Hb + rc + 1), -Ha, Ha, true);
    for (const sv of [-1, 1]) zeb(-Hb, Hb, sv > 0 ? Ha + rc + 1 : -(Ha + rc + 5), sv > 0 ? Ha + rc + 5 : -(Ha + rc + 1), false);
    // stop lines (right-hand traffic)
    const inA = A.kind === 'boulevard' ? RES + 0.2 : 0.2, inB = Bs.kind === 'boulevard' ? RES + 0.2 : 0.2;
    if (!tee) add(WM.paint, rectGeo(-(Hb + rc + 5.8), -(Hb + rc + 5.4), inA, Ha - 0.2, Y_PAINT));
    add(WM.paint, rectGeo(Hb + rc + 5.4, Hb + rc + 5.8, -(Ha - 0.2), -inA, Y_PAINT));
    add(WM.paint, rectGeo(-(Hb - 0.2), -inB, -(Ha + rc + 5.8), -(Ha + rc + 5.4), Y_PAINT));
    add(WM.paint, rectGeo(inB, Hb - 0.2, Ha + rc + 5.4, Ha + rc + 5.8, Y_PAINT));
    occ.markDisc(it.x, it.z, Math.max(Ha, Hb) + rc + 7, 3);
    info.junctions.push({ it, M, Ha, Hb, rc, hA, tee, sws });
  }

  buildTracks(route, cb, info);
  for (const poly of [route.bus, route.opp]) markRoadOcc(occ, poly.pts, 0, 3, -2.2, 2.2); // keep trees/buildings off the track
  info.cat = buildTramCatenary(route, cb, occ, info);
  buildSignals(route, cb, tl, info);
  buildPlatforms(route, cb, occ, reg, info);
  return info;
}

/** White galvanised pedestrian fence (tram reservation): tube rails, posts and a bar-infill card. */
function whiteFence(cb, pts) {
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const L = Math.hypot(bx - ax, bz - az); if (L < 0.2) continue;
    const yaw = -Math.atan2(bz - az, bx - ax), cx = (ax + bx) / 2, cz = (az + bz) / 2;
    for (const y of [0.25, 1.0]) cb.add(WM.galv, new THREE.CylinderGeometry(0.022, 0.022, L, 5, 1, true).rotateZ(Math.PI / 2), mat(cx, y, cz, 0, yaw), 0xf2f3f3);
    cb.add(WM.galv, new THREE.CylinderGeometry(0.03, 0.03, 1.05, 6, 1, true), mat(ax, 0.55, az), 0xf2f3f3);
    const g = new THREE.PlaneGeometry(L, 0.75); const uv = g.attributes.uv; for (let j = 0; j < uv.count; j++) uv.setX(j, uv.getX(j) * L);
    cb.add(WM.fenceBars, g, mat(cx, 0.62, cz, 0, yaw), 0xf2f3f3);
  }
}

/* ------------------------------------ track ------------------------------------ */
function buildTracks(route, cb, info) {
  const inv = info.junctions.map((j) => new THREE.Matrix4().copy(j.M).invert());
  const inJ = (x, z) => info.junctions.some((j, k) => {
    const v = new THREE.Vector3(x, 0, z).applyMatrix4(inv[k]);
    const uMin = j.tee ? -(j.Hb + j.sws + 0.3) : -(j.Hb + j.rc + 6.5);
    return v.x > uMin && v.x < j.Hb + j.rc + 6.5 && Math.abs(v.z) < j.Ha + j.rc + 6.5;
  });
  const onCore = (x, z) => route.streets.some((st) => { if (st.kind !== 'boulevard' || !st.tracks) return false; const p = st.poly.project(x, z); return Math.abs(p.lat) < TRACK + 0.8 && p.s > st.tracks[0] + 4 && p.s < st.poly.length - 1; });
  const tracks = [route.bus, route.opp];
  const o = {};
  for (const poly of tracks) {
    const L = poly.length, step = 1;
    // classify samples
    const cls = [];
    for (let s = 0; s <= L; s += step) { poly.at(s, o); cls.push(inJ(o.x, o.z) ? 'j' : onCore(o.x, o.z) ? 'c' : 'f'); }
    let k0 = 0;
    for (let k = 1; k <= cls.length; k++) {
      if (k < cls.length && cls[k] === cls[k0]) continue;
      const a = k0 * step, b = Math.min(L, k * step), kind = cls[k0];
      k0 = k;
      if (b - a < 0.5) continue;
      const pts = []; for (let s = a; s <= b + 1e-6; s += Math.min(step, b - a)) { poly.at(s, o); pts.push([o.x, o.z]); if (b - a < step) { poly.at(b, o); pts.push([o.x, o.z]); break; } }
      if (pts.length < 2) continue;
      const g2 = GAUGE / 2;
      if (kind === 'j') {
        addStrip(cb, WM.concrete, stripGeo(pts, -1.25, 1.25, 0.004, 0.004, { uvScale: 3 }), 0x8f8d88);
        cb.detail = true;
        for (const sgn of [-1, 1]) {
          addStrip(cb, WM.railTop, stripGeo(pts, sgn * g2 - 0.03, sgn * g2 + 0.03, 0.013, 0.013, { uvScale: 1 }));
          addStrip(cb, WM.metalDark, stripGeo(pts, sgn * g2 + (sgn > 0 ? -0.075 : 0.03), sgn * g2 + (sgn > 0 ? -0.03 : 0.075), 0.011, 0.011, { uvScale: 1 }), 0x1a1a1a);
        }
      } else {
        if (kind === 'f') addStrip(cb, WM.ballast, stripGeo(pts, -1.55, 1.55, -0.02, -0.02, { uvScale: 2.2, across: 2 }));
        cb.detail = true;
        for (let s = a + 0.35; s < b; s += 0.72) { poly.at(s, o); cb.add(WM.sleeper, new THREE.BoxGeometry(0.22, 0.1, 1.75), mat(o.x, -0.035, o.z, 0, -o.h), 0x8e8a80); }
        for (const sgn of [-1, 1]) {
          addStrip(cb, WM.railTop, stripGeo(pts, sgn * g2 - 0.03, sgn * g2 + 0.03, 0.03, 0.03, { uvScale: 1 }));
          addStrip(cb, WM.rail, stripGeo(pts, sgn * g2 - 0.03, sgn * g2 - 0.03, -0.06, 0.03, { uvScale: 1 }));
          addStrip(cb, WM.rail, stripGeo(pts, sgn * g2 + 0.03, sgn * g2 + 0.03, -0.06, 0.03, { uvScale: 1 }));
          addStrip(cb, WM.rail, stripGeo(pts, sgn * g2 - 0.07, sgn * g2 + 0.07, -0.055, -0.055, { uvScale: 1 }));
        }
      }
      cb.detail = false;
    }
  }
}

/* ------------------------------------ overhead line ------------------------------------ */
function buildTramCatenary(route, cb, occ, info) {
  const lines = [];
  const seg = (a, b) => lines.push(a[0], a[1], a[2], b[0], b[1], b[2]);
  const poles = [];
  const addPole = (x, z, h = 8.6) => {
    for (const p of poles) if (Math.hypot(p.x - x, p.z - z) < 1.2) return p;
    const p = { x, z, h }; poles.push(p);
    cb.add(WM.galv, new THREE.CylinderGeometry(0.11, 0.17, h, 12), mat(x, h / 2, z), 0xb9bec2);
    cb.add(WM.metalDark, new THREE.CylinderGeometry(0.22, 0.24, 0.3, 12), mat(x, 0.15, z));
    cb.add(WM.galv, new THREE.SphereGeometry(0.12, 8, 6), mat(x, h + 0.02, z), 0xb9bec2);
    occ.markDisc(x, z, 1, 1);
    return p;
  };
  const o = {};
  const inJ = (x, z) => info.junctions.find((j) => Math.hypot(x - j.it.x, z - j.it.z) < Math.max(j.Ha, j.Hb) + j.rc + 2);
  const onBoulevard = (x, z) => { for (const st of route.streets) { if (st.kind !== 'boulevard' || !st.tracks) continue; const p = st.poly.project(x, z); if (Math.abs(p.lat) < TRACK + 0.6 && p.s > st.tracks[0] + 6) return { st, p }; } return null; };
  for (const [poly, isMain] of [[route.bus, true], [route.opp, false]]) {
    const sup = [];
    let last = -1e9, lastH = null;
    for (let s = 0; s <= poly.length; s += 1) {
      poly.at(s, o);
      const ah = poly.at(Math.min(poly.length, s + 8), {}).h;
      const curv = Math.abs(Math.atan2(Math.sin(ah - o.h), Math.cos(ah - o.h)));
      const spacing = curv > 0.08 ? 7 : curv > 0.02 ? 16 : 32;
      if (s - last >= spacing || s === 0) { sup.push({ s, x: o.x, z: o.z, h: o.h, k: sup.length, curv: curv > 0.02 }); last = s; lastH = o.h; }
    }
    void lastH;
    poly.at(poly.length, o); sup.push({ s: poly.length, x: o.x, z: o.z, h: o.h, k: sup.length });
    const pts = sup.map((p) => { const zz = p.curv ? 0 : (p.k % 2 ? 0.2 : -0.2); return [p.x - Math.sin(p.h) * zz, WIRE_Y, p.z + Math.cos(p.h) * zz]; });
    for (let i = 0; i < pts.length - 1; i++) seg(pts[i], pts[i + 1]);
    // structures (only once for the main track on boulevards: the centre pole carries both wires)
    for (const p of sup) {
      const rx = -Math.sin(p.h), rz = Math.cos(p.h);
      const cp = [p.x, p.z];
      const j = inJ(p.x, p.z);
      const ob = onBoulevard(p.x, p.z);
      if (j) {
        // cross span between two sidewalk poles of the crossing
        const A = addPole(p.x + rx * 17.4, p.z + rz * 17.4, 9), Bp = addPole(p.x - rx * 17.4, p.z - rz * 17.4, 9);
        span(A, Bp, [cp], seg, cb);
        continue;
      }
      if (ob) {
        if (!isMain) continue;
        // centre pole between the tracks with a double cantilever
        const lat = ob.p.lat, cx = p.x - rx * lat - rx * TRACK * Math.sign(lat || 1), cz = p.z - rz * lat - rz * TRACK * Math.sign(lat || 1);
        const c0x = p.x - rx * TRACK, c0z = p.z - rz * TRACK;
        addPole(c0x, c0z, 8.4);
        void cx; void cz;
        cb.detail = true;
        for (const sd of [-1, 1]) {
          const ex = c0x + rx * sd * (TRACK + 0.5), ez = c0z + rz * sd * (TRACK + 0.5);
          cb.add(WM.galv, tube(c0x, 6.9, c0z, ex, 6.75, ez, 0.035), null, 0xb9bec2);
          cb.add(WM.galv, tube(c0x, 6.2, c0z, ex - rx * sd * 0.3, 6.55, ez - rz * sd * 0.3, 0.03), null, 0xb9bec2);
          cb.add(WM.metalDark, new THREE.CylinderGeometry(0.05, 0.05, 0.35, 8), mat(ex - rx * sd * 0.5, 6.4, ez - rz * sd * 0.5), 0x5a3a2a);
          cb.add(WM.galv, tube(ex - rx * sd * 0.5, 6.25, ez - rz * sd * 0.5, c0x + rx * sd * TRACK, WIRE_Y + 0.03, c0z + rz * sd * TRACK, 0.015), null, 0x9aa0a6);
        }
        cb.detail = false;
        continue;
      }
      // loop / curve: side pole on the outside with a pull-off span
      const ah = poly.at(Math.min(poly.length, p.s + 6), {}).h;
      const turnRight = Math.atan2(Math.sin(ah - p.h), Math.cos(ah - p.h)) > 0;
      const side = turnRight ? -1 : 1;
      const pole = addPole(p.x + rx * side * 4.2, p.z + rz * side * 4.2, 8.2);
      span(pole, { x: p.x - rx * side * 0.8, z: p.z - rz * side * 0.8 }, [cp], seg, cb);
    }
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
  const wires = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x1b1c1e, fog: true }));
  wires.frustumCulled = false; wires.name = 'tramWires';
  return { poles, wires, wireHeightAt: () => WIRE_Y };
}
function tube(x0, y0, z0, x1, y1, z1, r) {
  const a = new THREE.Vector3(x0, y0, z0), b = new THREE.Vector3(x1, y1, z1), d = b.clone().sub(a), L = d.length();
  const g = new THREE.CylinderGeometry(r, r, L, 6);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return g;
}
function span(a, b, contacts, seg, cb) {
  const ya = 7.0, N = 10, pts = [];
  for (let i = 0; i <= N; i++) { const t = i / N; pts.push([a.x + (b.x - a.x) * t, ya - Math.sin(Math.PI * t) * 0.45, a.z + (b.z - a.z) * t]); }
  for (let i = 0; i < N; i++) seg(pts[i], pts[i + 1]);
  for (const c of contacts) {
    const dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz || 1;
    const t = Math.min(1, Math.max(0, ((c[0] - a.x) * dx + (c[1] - a.z) * dz) / L2));
    seg([c[0], ya - Math.sin(Math.PI * t) * 0.45, c[1]], [c[0], WIRE_Y + 0.05, c[1]]);
    cb.add(WM.metalDark, new THREE.BoxGeometry(0.1, 0.06, 0.1), mat(c[0], WIRE_Y + 0.06, c[1]));
  }
}

/* ------------------------------------ signals ------------------------------------ */
function buildSignals(route, cb, tl, info) {
  for (const j of info.junctions) {
    const it = j.it;
    for (const arm of [it.a, it.b]) {
      const st = arm.st, other = arm === it.a ? it.b : it.a;
      const g = it.groups[st.id], mats = tl.mats(it, g);
      const dist = other.st.halfW + it.rc + 5.6;
      for (const dir of [1, -1]) {
        if (arm.s - dir * dist < 0 || arm.s - dir * dist > st.poly.length) continue; // no approach from this side (tee)
        const p = st.poly.at(arm.s - dir * dist);
        const hT = p.h + (dir < 0 ? Math.PI : 0);
        const rx = -Math.sin(hT), rz = Math.cos(hT);
        const faceYaw = Math.atan2(-Math.cos(hT), -Math.sin(hT));
        if (st.kind === 'boulevard') {
          // gantry from the right sidewalk over the three lanes
          const px = p.x + rx * (st.halfW + 1.2), pz = p.z + rz * (st.halfW + 1.2);
          const armYaw = Math.atan2(-rx, -rz);
          gantry(cb, px, pz, armYaw, CW + 1.2, [2.95, 6.45, 9.95], mats, signalHead, faceYaw);
          // median pole: repeater for cars + tram signal
          const mx = p.x + rx * (RES - 0.6), mz = p.z + rz * (RES - 0.6);
          cb.add(WM.painted, new THREE.CylinderGeometry(0.07, 0.08, 3.6, 10), mat(mx, 1.8, mz), 0xf2c200);
          signalHead(cb, mx, 3.0, mz, faceYaw, mats);
          if (st.tracks) signalHead(cb, p.x + rx * (TRACK + 1.3), 3.4, p.z + rz * (TRACK + 1.3), faceYaw, mats, { visor: false });
        } else {
          const px = p.x + rx * (st.halfW + 0.9), pz = p.z + rz * (st.halfW + 0.9);
          cb.add(WM.painted, new THREE.CylinderGeometry(0.065, 0.075, 3.6, 10), mat(px, 1.8, pz), 0xf2c200);
          signalHead(cb, px, 3.0, pz, faceYaw, mats);
          const q = st.poly.at(arm.s + dir * (dist - 4)); const lx = q.x - rx * (st.halfW + 0.9), lz = q.z - rz * (st.halfW + 0.9);
          cb.add(WM.painted, new THREE.CylinderGeometry(0.065, 0.075, 3.9, 10), mat(lx, 1.95, lz), 0xf2c200);
          signalHead(cb, lx, 3.3, lz, faceYaw, mats);
        }
        // pedestrian heads at the zebra of this arm
        const cp = st.poly.at(arm.s - dir * (other.st.halfW + it.rc + 3));
        for (const s2 of [-1, 1]) {
          const px = cp.x + rx * s2 * (st.halfW + 1.2), pz = cp.z + rz * s2 * (st.halfW + 1.2);
          cb.add(WM.painted, new THREE.CylinderGeometry(0.05, 0.06, 2.6, 8), mat(px, 1.3, pz), 0xf2c200);
          pedHead(cb, px, 2.3, pz, Math.atan2(rx * -s2, rz * -s2), mats);
        }
      }
    }
  }
}

/* ------------------------------------ platforms ------------------------------------ */
function buildPlatforms(route, cb, occ, reg, info) {
  for (const stp of route.stops) {
    const st = stp.st, sb = stp.sb;
    const a = sb - 38, b = sb + 2.5;
    const pts = streetPts(st, a, b, 2);
    for (const sd of [1, -1]) {
      const e0 = TRACK + 1.27, e1 = RES - 0.12;
      addStrip(cb, WM.pavers, stripGeo(pts, Math.min(sd * e0, sd * e1), Math.max(sd * e0, sd * e1), PLATFORM_Y, PLATFORM_Y, { uvScale: 2 }), 0xd8d8d2);
      addStrip(cb, WM.painted, stripGeo(pts, Math.min(sd * e0, sd * (e0 + 0.35)), Math.max(sd * e0, sd * (e0 + 0.35)), PLATFORM_Y + 0.003, PLATFORM_Y + 0.003, { uvScale: 1 }), 0xf2c200);
      addStrip(cb, WM.concrete, stripGeo(pts, sd * e0, sd * e0, -0.03, PLATFORM_Y, { uvScale: 1 }), 0x9a978f);
      addStrip(cb, WM.concrete, stripGeo(pts, sd * e1, sd * e1, 0, PLATFORM_Y, { uvScale: 1 }), 0x9a978f);
      for (const [s0, s1] of [[a - 0.01, a + 0.01], [b - 0.01, b + 0.01]]) addStrip(cb, WM.concrete, stripGeo(streetPts(st, s0, s1, 0.02), Math.min(sd * e0, sd * e1), Math.max(sd * e0, sd * e1), 0, PLATFORM_Y, { uvScale: 1 }), 0x9a978f);
      markRoadOcc(occ, pts, 0, 5, sd * (e0 + 0.1), sd * (e1 - 0.1));
      // guardrail + green mesh fence on the road side
      const fl = streetPts(st, a + 1, b - 1, 2.5).map(([x, z], i, arr) => { const f = st.poly.at(a + 1 + (i / Math.max(1, arr.length - 1)) * (b - a - 2)); return [x - Math.sin(f.h) * sd * (RES - 0.3), z + Math.cos(f.h) * sd * (RES - 0.3)]; });
      cb.detail = true;
      guardrail(cb, fl, PLATFORM_Y + 0.55);
      for (let i = 0; i < fl.length - 1; i++) {
        const [ax, az] = fl[i], [bx, bz] = fl[i + 1];
        reg.walkBlockers?.push({ x: (ax + bx) / 2, z: (az + bz) / 2, h: Math.atan2(bz - az, bx - ax), hd: Math.hypot(bx - ax, bz - az) / 2 + 0.05, hw: 0.08 });
      }
      meshFence(cb, fl.map(([x, z]) => [x, z]), 1.35, 0x1f4a32);
      cb.detail = false;
      // shelter, stop pole, bins
      const f = st.poly.at(sb - 16), hh = sd > 0 ? f.h : f.h + Math.PI;
      const sx = f.x - Math.sin(f.h) * sd * (RES - 1.15), sz = f.z + Math.cos(f.h) * sd * (RES - 1.15);
      const shM = hmat(sx, PLATFORM_Y, sz, hh);
      tramShelter(cb, shM, reg, { L: 6, name: stp.name, ad: (stp.s | 0) % 6 });
      const fp = st.poly.at(sd > 0 ? sb + 0.5 : a + 1.5);
      const px = fp.x - Math.sin(fp.h) * sd * (RES - 0.6), pz = fp.z + Math.cos(fp.h) * sd * (RES - 0.6);
      stopPole(cb, px, pz, Math.atan2(Math.sin(f.h) * sd, -Math.cos(f.h) * sd), stp.name);
      const fb = st.poly.at(sb - 6); cb.detail = true; trashBin(cb, fb.x - Math.sin(fb.h) * sd * (RES - 0.5), fb.z + Math.cos(fb.h) * sd * (RES - 0.5)); cb.detail = false;
      if (sd > 0) {
        // waiting passengers along the platform, facing the track
        const wait = [];
        for (let k = 0; k < 12; k++) {
          const s = sb - rr(3, 30), lat = rr(TRACK + 2.0, RES - 0.9); const q = st.poly.at(s);
          wait.push({ p: new THREE.Vector3(q.x - Math.sin(q.h) * lat, PLATFORM_Y, q.z + Math.cos(q.h) * lat), yaw: Math.atan2(Math.sin(q.h), -Math.cos(q.h)) + rr(-0.6, 0.6) });
        }
        reg.stopsInfo.push({ id: stp.id, pole: new THREE.Vector3(px, PLATFORM_Y, pz), wait });
      } else {
        for (let k = 0; k < 3; k++) { const s = a + rr(6, 30), lat = -rr(TRACK + 2.0, RES - 0.9); const q = st.poly.at(s); reg.benches.push({ p: new THREE.Vector3(q.x - Math.sin(q.h) * lat, PLATFORM_Y, q.z + Math.cos(q.h) * lat), yaw: Math.atan2(-Math.sin(q.h), Math.cos(q.h)), stand: true }); }
      }
      info.platforms.push({ st, a, b, sd });
    }
  }
}
export { jerseyBarrier, polyGeo };
