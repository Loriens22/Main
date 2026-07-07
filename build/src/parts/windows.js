// ---------------------------------------------------------------------------
// parts/windows.js — aluminium windows / curtain-wall units & sliding doors.
// Facade-mounted: centred on X, base y=0, glass plane ~z=0, frame to +Z,
// interior reveal to -Z. All units METRES, +Y up.
// ---------------------------------------------------------------------------
import { THREE, bevelBox, tube, mat, palette, shadows, optimize } from './kit.js';

// Small helper: a bevelled box mesh placed in WORLD space (flat hierarchy so
// optimize() can bake matrices & merge by material cleanly).
function box(g, material, w, h, d, x, y, z, r = 0.008, seg = 1) {
  const m = new THREE.Mesh(bevelBox(w, h, d, r, seg), material);
  m.position.set(x, y, z);
  g.add(m);
  return m;
}

// A rectangular border (4 box members) of overall size w×h, face-width fw,
// depth fd, centred at (cx,cy,cz).
function border(g, material, w, h, fw, fd, cx, cy, cz, r = 0.008, seg = 1) {
  box(g, material, w, fw, fd, cx, cy + h / 2 - fw / 2, cz, r, seg); // top
  box(g, material, w, fw, fd, cx, cy - h / 2 + fw / 2, cz, r, seg); // bottom
  const vh = h - 2 * fw;
  box(g, material, fw, vh, fd, cx - w / 2 + fw / 2, cy, cz, r, seg); // left
  box(g, material, fw, vh, fd, cx + w / 2 - fw / 2, cy, cz, r, seg); // right
}

// ---------------------------------------------------------------------------
// createWindowUnit — real aluminium window / curtain-wall unit.
// ---------------------------------------------------------------------------
export function createWindowUnit(width = 3.2, height = 2.6, cols = 2, rows = 1) {
  const W = width, H = height;
  cols = Math.max(1, Math.round(cols));
  rows = Math.max(1, Math.round(rows));
  const P = palette();
  const g = new THREE.Group();

  const FW = 0.055;          // frame face width
  const FD = 0.12;           // frame depth (Z)
  const ZF = 0.07;           // frame front-face z
  const cz = ZF - FD / 2;    // frame member centre z
  const GLASS_Z = 0.0;       // glass plane
  const GT = 0.018;          // glass thickness
  const metal = P.darkMetal; // extruded aluminium

  const cyU = H / 2;         // vertical centre of the unit

  // ---- outer frame ------------------------------------------------------
  border(g, metal, W, H, FW, FD, 0, cyU, cz, 0.01, 2);

  // ---- inner pane grid --------------------------------------------------
  const IW = W - 2 * FW, IH = H - 2 * FW;
  const cellW = (IW - (cols - 1) * FW) / cols;
  const cellH = (IH - (rows - 1) * FW) / rows;
  const leftX = -IW / 2, botY = cyU - IH / 2;

  // vertical mullions
  for (let i = 1; i < cols; i++) {
    const x = leftX + i * cellW + (i - 0.5) * FW;
    box(g, metal, FW, IH, FD, x, cyU, cz, 0.008, 2);
  }
  // horizontal transoms
  for (let j = 1; j < rows; j++) {
    const y = botY + j * cellH + (j - 0.5) * FW;
    box(g, metal, IW, FW, FD, 0, y, cz, 0.008, 2);
  }

  // glass panes (transparent — kept individual by optimize)
  const cellCx = c => leftX + cellW / 2 + c * (cellW + FW);
  const cellCy = r => botY + cellH / 2 + r * (cellH + FW);
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      // skip the tilt-turn cell here; its glass is added with the sash
      if (c === 0 && r === 0) continue;
      box(g, P.glass, cellW + FW * 0.7, cellH + FW * 0.7, GT, cellCx(c), cellCy(r), GLASS_Z, 0.002, 1);
    }
  }

  // ---- tilt-turn openable sash (bottom-left cell) -----------------------
  {
    const sx = cellCx(0), sy = cellCy(0);
    const sfw = 0.04, sfd = 0.10;
    const sZF = ZF + 0.022;            // proud of the main frame
    const scz = sZF - sfd / 2;
    const sW = cellW - 0.006, sH = cellH - 0.006;
    border(g, P.charcoal, sW, sH, sfw, sfd, sx, sy, scz, 0.008, 2);
    // its glass, recessed behind the sash face
    box(g, P.glass, sW - sfw * 1.4, sH - sfw * 1.4, GT, sx, sy, GLASS_Z + 0.01, 0.002, 1);
    // lever handle on the opening (inner) stile
    const hx = sx + sW / 2 - sfw, hy = sy;
    const hz = sZF + 0.01;
    box(g, P.steel, 0.05, 0.10, 0.022, hx, hy, hz, 0.012, 2);      // rosette
    box(g, P.steel, 0.11, 0.028, 0.026, hx - 0.06, hy, hz + 0.02, 0.012, 2); // lever
  }

  // ---- exterior sill / drip cap (projects +Z) ---------------------------
  {
    const sill = box(g, metal, W + 0.06, 0.05, 0.17, 0, 0.028, 0.055, 0.014, 2);
    sill.rotation.x = -0.06; // slight outward slope to shed water
  }

  // ---- interior reveal frame (−Z, reads as deep wall opening) ------------
  border(g, P.white, W, H, 0.055, 0.10, 0, cyU, -0.10, 0.006, 1);

  shadows(g);
  return optimize(g);
}

// ---------------------------------------------------------------------------
// createSlidingDoor — floor-to-ceiling sliding glass door.
// ---------------------------------------------------------------------------
export function createSlidingDoor(width = 3.2, height = 2.75, leaves = 3) {
  const W = width, H = height;
  const n = Math.max(2, Math.min(4, Math.round(leaves)));
  const P = palette();
  const g = new THREE.Group();
  const metal = P.darkMetal;

  const TOP_H = 0.09, BOT_H = 0.08;   // track heights
  const GLASS_Z = 0.0, GT = 0.018;

  // ---- tracks (real box profiles) --------------------------------------
  box(g, metal, W + 0.04, BOT_H, 0.20, 0, BOT_H / 2, 0.0, 0.012, 2);          // bottom track (wider/deeper)
  box(g, P.charcoal, W, 0.02, 0.24, 0, BOT_H + 0.011, 0.0, 0.004, 1);          // sill guide rib
  box(g, metal, W + 0.02, TOP_H, 0.16, 0, H - TOP_H / 2, 0.0, 0.012, 2);       // top track

  // ---- leaves ----------------------------------------------------------
  const yBot = BOT_H, yTop = H - TOP_H;
  const leafH = yTop - yBot, leafCy = (yTop + yBot) / 2;
  const lfw = 0.05, lfd = 0.055;
  const leafW = W / n + lfw * 2.2;                // overlapping stiles

  for (let i = 0; i < n; i++) {
    let cx = -W / 2 + (i + 0.5) * (W / n);
    const zRail = (i % 2 === 0) ? 0.028 : -0.028; // front / back sliding rails
    let cz = zRail;
    let gz = zRail + GLASS_Z;
    if (i === 1) { cx += 0.09; cz += 0.015; gz += 0.015; } // one leaf slid ajar

    border(g, metal, leafW, leafH, lfw, lfd, cx, leafCy, cz, 0.01, 2);
    box(g, P.glass, leafW - lfw * 2.2, leafH - lfw * 2.2, GT, cx, leafCy, gz - lfd / 2 + 0.006, 0.002, 1);

    // vertical tubular handle on the front-most first leaf
    if (i === 0) {
      const hx = cx + leafW / 2 - lfw;
      const hz = cz + lfd / 2 + 0.06;
      const hy0 = leafCy - 0.5, hy1 = leafCy + 0.5;
      const geo = tube([[hx, hy0, hz], [hx, leafCy, hz], [hx, hy1, hz]], 0.018, 10).toNonIndexed();
      g.add(new THREE.Mesh(geo, P.steel));
      // standoff brackets
      box(g, P.steel, 0.03, 0.03, 0.07, hx, hy0 + 0.05, hz - 0.035, 0.008, 2);
      box(g, P.steel, 0.03, 0.03, 0.07, hx, hy1 - 0.05, hz - 0.035, 0.008, 2);
    }
  }

  shadows(g);
  return optimize(g);
}
