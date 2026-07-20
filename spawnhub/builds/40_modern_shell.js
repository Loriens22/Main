/* =========================================================================
 * 40_modern_shell.js — MODERN MONOLITH shell + carved west facade
 * A single tall white slab. Footprint x216..227 (x216 = WEST front plane,
 * faces -X toward plaza) x z52..80, height y33..86. Symmetric about z=66.
 * The west facade is REAL recessed geometry: a grid of nested carved panels
 * with light-blue glass and sparse honeycomb-gold accents, over a stepped
 * crenellated top — matching reference 8b736400-2831.jpg.
 * ========================================================================= */
(function () {
  SpawnBuilds.register('modern_shell', 40, [200, 44, 268, 120], function (W, B) {
    'use strict';

    var XW = 216, XE = 227;                     // west (front) / east wall planes
    var Z0 = 52, Z1 = 80;                       // north / south wall planes
    var Y0 = 33, YTOP = 82;                     // base / top-of-wall
    var PLATES = [41, 45, 49, 53, 57, 61, 65, 69, 73, 77, 81];

    function hash(x, y, z) {
      var n = (x * 928371 + y * 1299721 + z * 2606459 + 77) | 0;
      n = (n ^ (n >>> 13)) | 0; n = Math.imul(n, 1274126177);
      return ((n ^ (n >>> 16)) >>> 0) % 1000;
    }

    /* ------------------------------------------------------------------ *
     * PLINTH + SOLID SHELL
     * ------------------------------------------------------------------ */
    // Plinth course y33..34: smooth quartz wrap (all four faces + a solid base)
    W.fill(XW, 33, Z0, XE, 34, Z1, B.SMOOTH_QUARTZ);
    // Perimeter walls y35..82 in QUARTZ_BLOCK (west face rebuilt by carving below)
    W.walls(XW, 35, Z0, XE, YTOP, Z1, B.QUARTZ_BLOCK);
    // Corner quoins: chiseled quartz stacks
    var CORNERS = [[XW, Z0], [XW, Z1], [XE, Z0], [XE, Z1]];
    for (var c = 0; c < CORNERS.length; c++) {
      for (var qy = 35; qy <= YTOP; qy++) W.set(CORNERS[c][0], qy, CORNERS[c][1], B.CHISELED_QUARTZ);
    }
    // Quartz-brick bands at plate lines wrapping N/S/E faces
    for (var pb = 0; pb < PLATES.length; pb++) {
      var by = PLATES[pb];
      if (by > YTOP) continue;
      W.fill(XW, by, Z0, XE, by, Z0, B.QUARTZ_BRICKS);
      W.fill(XW, by, Z1, XE, by, Z1, B.QUARTZ_BRICKS);
      W.fill(XE, by, Z0, XE, by, Z1, B.QUARTZ_BRICKS);
    }

    /* ------------------------------------------------------------------ *
     * WEST CARVED FACADE — the star. Solid base then nested panel carving.
     * Column zones: left flank z54..61, centre z63..69, right flank z71..78.
     * Panel rows between major bands (y41,49,57,65,73,81): 42..48, 50..56,
     * 58..64, 66..72, 74..80. Ground (y35..40) is the entrance zone.
     * ------------------------------------------------------------------ */
    // rebuild the whole west plane solid to carve from
    W.fill(XW, 35, Z0, XW, YTOP, Z1, B.QUARTZ_BLOCK);
    // major horizontal quartz-brick bands, full width
    var BANDS = [41, 49, 57, 65, 73, 81];
    for (var mb = 0; mb < BANDS.length; mb++) {
      if (BANDS[mb] <= YTOP) W.fill(XW, BANDS[mb], Z0, XW, BANDS[mb], Z1, B.QUARTZ_BRICKS);
    }
    // vertical pilaster strips (chiseled) between the three column zones
    for (var vy = 35; vy <= YTOP; vy++) {
      for (var _z of [52, 53, 62, 70, 79, 80]) W.set(XW, vy, _z, B.CHISELED_QUARTZ);
    }

    var PANEL_ROWS = [[42, 48], [50, 56], [58, 64], [66, 72], [74, 80]];
    var COLS = [[54, 61], [63, 69], [71, 78]];   // left flank, centre, right flank

    function carveCentrePanel(y0, y1, z0, z1) {
      // recess-1 (QUARTZ_BRICKS at x=217) over the inner field
      W.clear(XW, y0, z0, XW, y1, z1);
      W.fill(XW + 1, y0, z0, XW + 1, y1, z1, B.QUARTZ_BRICKS);
      // recess-2 (SMOOTH_QUARTZ at x=218), tall blue slit at the centre z65..66
      W.fill(XW + 1, y0 + 1, z0 + 1, XW + 1, y1 - 1, z1 - 1, 0);
      W.fill(XW + 2, y0 + 1, z0 + 1, XW + 2, y1 - 1, z1 - 1, B.SMOOTH_QUARTZ);
      W.fill(XW + 2, y0 + 1, 65, XW + 2, y1 - 1, 66, B.GLASS_LIGHTBLUE);
      // honeycomb accents at the panel's top outer corners
      W.set(XW, y1, z0, B.HONEYCOMB_BLOCK);
      W.set(XW, y1, z1, B.HONEYCOMB_BLOCK);
    }

    function carveFlankPanel(y0, y1, z0, z1, accent) {
      // recess-1 field
      W.clear(XW, y0, z0, XW, y1, z1);
      W.fill(XW + 1, y0, z0, XW + 1, y1, z1, B.QUARTZ_BLOCK);
      // one diorite tone course inside the field
      W.fill(XW + 1, y0 + Math.floor((y1 - y0) / 2), z0, XW + 1, y0 + Math.floor((y1 - y0) / 2), z1, B.DIORITE);
      // recess-2 centre: quartz-brick with a 3x4 window cluster + pillar mullion
      W.fill(XW + 1, y0 + 1, z0 + 1, XW + 1, y1 - 1, z1 - 1, 0);
      W.fill(XW + 2, y0 + 1, z0 + 1, XW + 2, y1 - 1, z1 - 1, B.QUARTZ_BRICKS);
      W.fill(XW + 2, y0 + 1, z0 + 2, XW + 2, y1 - 1, z1 - 2, B.GLASS_LIGHTBLUE);
      var zc = Math.floor((z0 + z1) / 2);         // vertical pillar mullion
      W.fill(XW + 2, y0 + 1, zc, XW + 2, y1 - 1, zc, B.QUARTZ_PILLAR);
      if (accent) W.set(XW, y1, z0, B.HONEYCOMB_BLOCK);
    }

    for (var pr = 0; pr < PANEL_ROWS.length; pr++) {
      var row = PANEL_ROWS[pr];
      for (var cz = 0; cz < COLS.length; cz++) {
        var col = COLS[cz];
        if (cz === 1) {
          // centre column: skip the ground-entrance overlap (handled separately)
          carveCentrePanel(row[0], row[1], col[0], col[1]);
        } else {
          carveFlankPanel(row[0], row[1], col[0], col[1], hash(pr, 0, cz) < 400);
        }
      }
    }

    /* ------------------------------------------------------------------ *
     * ENTRANCE OPENING — west face z60..72, y35..40 carved open (air to
     * x=219) with a QUARTZ_BRICKS surround. The fit-out file glazes it.
     * (Ground y33..34 plinth stays; opening sits above it.)
     * ------------------------------------------------------------------ */
    W.clear(XW, 35, 60, XW + 2, 40, 72);
    // reveal jambs + head in quartz brick
    W.fill(XW, 35, 60, XW, 41, 60, B.QUARTZ_BRICKS);
    W.fill(XW, 35, 72, XW, 41, 72, B.QUARTZ_BRICKS);
    W.fill(XW, 41, 60, XW, 41, 72, B.QUARTZ_BRICKS);
    W.fill(XW + 1, 41, 60, XW + 2, 41, 72, B.QUARTZ_BRICKS);  // opening ceiling

    /* ------------------------------------------------------------------ *
     * SIDE (z=52, z=80) + EAST (x=227) faces: pillar striping, slit windows,
     * white AC-box greebles, sparse honeycomb accents.
     * ------------------------------------------------------------------ */
    function detailFace(kind) {
      // kind: 'n' (z=52), 's' (z=80), 'e' (x=227)
      var along = kind === 'e' ? [Z0 + 2, Z1 - 2] : [XW + 1, XE - 1];
      for (var a = along[0]; a <= along[1]; a++) {
        if ((a % 3) === 0) {                     // vertical pillar stripe
          for (var y = 35; y <= YTOP; y++) {
            if (kind === 'e') W.set(XE, y, a, B.QUARTZ_PILLAR);
            else W.set(a, y, kind === 'n' ? Z0 : Z1, B.QUARTZ_PILLAR);
          }
        }
      }
      // slit windows + AC boxes at pseudo-random module positions
      for (var mrow = 0; mrow < 5; mrow++) {
        var wy = 43 + mrow * 8;
        for (var s = along[0] + 1; s <= along[1] - 1; s += 4) {
          var hv = hash(s, wy, kind === 'e' ? 1 : (kind === 'n' ? 2 : 3));
          if (hv < 340) {                        // slit window
            if (kind === 'e') W.fill(XE, wy, s, XE, wy + 2, s, B.GLASS_LIGHTBLUE);
            else W.fill(s, wy, kind === 'n' ? Z0 : Z1, s, wy + 2, kind === 'n' ? Z0 : Z1, B.GLASS_LIGHTBLUE);
          } else if (hv < 470) {                 // white AC box greeble
            var bx, bz;
            if (kind === 'e') { bx = XE + 1; bz = s; }
            else { bx = s; bz = (kind === 'n' ? Z0 - 1 : Z1 + 1); }
            W.set(bx, wy, bz, B.CONCRETE_WHITE);
            W.set(bx, wy + 1, bz, B.CONCRETE_WHITE);
            // iron-bar face outward
            if (kind === 'e') W.set(bx + 1, wy, bz, B.IRON_BARS);
            else W.set(bx, wy, bz + (kind === 'n' ? -1 : 1), B.IRON_BARS);
          } else if (hv < 520) {
            if (kind === 'e') W.set(XE, wy + 2, s, B.HONEYCOMB_BLOCK);
            else W.set(s, wy + 2, kind === 'n' ? Z0 : Z1, B.HONEYCOMB_BLOCK);
          }
        }
      }
    }
    detailFace('n'); detailFace('s'); detailFace('e');

    /* ------------------------------------------------------------------ *
     * STEPPED CRENELLATION TOP (y83..86) — parapet rises in steps toward
     * corners + centre, chiseled caps, honeycomb corner accents, iron rail.
     * ------------------------------------------------------------------ */
    function crenel() {
      // base parapet ring y83
      W.walls(XW, 83, Z0, XE, 83, Z1, B.QUARTZ_BRICKS);
      // stepped merlons along west + east edges
      for (var z = Z0; z <= Z1; z++) {
        var d = Math.min(z - Z0, Z1 - z);        // distance to nearest corner
        var hgt = (z === 66) ? 3 : (d <= 1 ? 3 : (d <= 4 ? 2 : ((z % 2 === 0) ? 1 : 0)));
        for (var s = 1; s <= hgt; s++) {
          W.set(XW, 83 + s, z, s === hgt ? B.CHISELED_QUARTZ : B.QUARTZ_BRICKS);
          W.set(XE, 83 + s, z, s === hgt ? B.CHISELED_QUARTZ : B.QUARTZ_BRICKS);
        }
      }
      for (var x = XW; x <= XE; x++) {
        var dx = Math.min(x - XW, XE - x);
        var h2 = dx <= 1 ? 3 : (dx <= 3 ? 2 : ((x % 2 === 0) ? 1 : 0));
        for (var s2 = 1; s2 <= h2; s2++) {
          W.set(x, 83 + s2, Z0, s2 === h2 ? B.CHISELED_QUARTZ : B.QUARTZ_BRICKS);
          W.set(x, 83 + s2, Z1, s2 === h2 ? B.CHISELED_QUARTZ : B.QUARTZ_BRICKS);
        }
      }
      // honeycomb accents at the two top west corners
      W.set(XW, 86, Z0, B.HONEYCOMB_BLOCK);
      W.set(XW, 86, Z1, B.HONEYCOMB_BLOCK);
      // interior iron-bar safety rail just inside the parapet
      W.walls(XW + 1, 83, Z0 + 1, XE - 1, 83, Z1 - 1, B.IRON_BARS);
    }
    crenel();

    /* ------------------------------------------------------------------ *
     * FLOOR PLATES — SMOOTH_QUARTZ, with the core shaft hole left open at
     * x222..226, z62..68 on every plate. Ground floor y33 is solid base.
     * ------------------------------------------------------------------ */
    W.fill(XW + 1, 33, Z0 + 1, XE - 1, 33, Z1 - 1, B.SMOOTH_QUARTZ);   // ground slab
    for (var pl = 0; pl < PLATES.length; pl++) {
      var py = PLATES[pl];
      if (py > YTOP) continue;
      W.fill(XW + 1, py, Z0 + 1, XE - 1, py, Z1 - 1, B.SMOOTH_QUARTZ);
      W.clear(222, py, 62, 226, py, 68);          // core shaft hole
    }
    // top ceiling/roof floor at y82 (walkable roof deck base), core hole kept
    W.fill(XW + 1, 82, Z0 + 1, XE - 1, 82, Z1 - 1, B.SMOOTH_QUARTZ);
    W.clear(222, 82, 62, 226, 82, 68);

    /* ------------------------------------------------------------------ *
     * EAST RETAINING WALL against the hill terraces.
     * ------------------------------------------------------------------ */
    W.fill(228, 33, Z0, 229, 36, Z1, B.QUARTZ_BRICKS);
    for (var rz = Z0; rz <= Z1; rz++) W.set(229, 37, rz, B.CHISELED_QUARTZ);
  });
})();
