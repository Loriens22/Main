// ---------------------------------------------------------------------------
// Building generator. A "wing" is a run of facade bays over N floors. All the
// static opaque geometry is baked into a handful of merged meshes per material
// (few draw calls, crisp shadows). Glass, railings and ivy are separate.
//
// Local frame per wing:  x = along `dir` (length), y = up, z = along `facing`
// (outward). z=0 is the outer white facade plane; glazing sits recessed at
// negative z; balconies project at positive z; the structural core is behind.
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

function rng(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x9E3779B9) | 0; let t = Math.imul(a ^ (a >>> 16), 0x21f0aaad); t = Math.imul(t ^ (t >>> 15), 0x735a2d97); return ((t ^ (t >>> 15)) >>> 0) / 4294967296; };
}

export class Complex {
  constructor(materials) {
    this.M = materials;
    this.group = new THREE.Group();
    // geometry buckets keyed by material name
    this.buckets = {};
    // dynamic sub-groups (things we keep as instances / separate meshes)
    this.glassGroup = new THREE.Group();
    this.group.add(this.glassGroup);
  }

  _bucket(key) { (this.buckets[key] || (this.buckets[key] = [])).push; return (this.buckets[key] || (this.buckets[key] = [])); }

  add(key, geo) { (this.buckets[key] || (this.buckets[key] = [])).push(geo); }

  finalize() {
    for (const key in this.buckets) {
      const arr = this.buckets[key];
      if (!arr.length) continue;
      const merged = mergeGeometries(arr, false);
      const mat = this.M[key];
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      if (key === 'interiorGlow') { mesh.castShadow = false; }
      this.group.add(mesh);
      arr.forEach((g) => g.dispose && g.dispose());
    }
    this.buckets = {};
    return this.group;
  }

  // Build one wing and register all its geometry.
  wing(cfg) {
    const M = this.M;
    const up = new THREE.Vector3(0, 1, 0);
    const dir = cfg.dir.clone().normalize();
    const facing = cfg.facing.clone().normalize();
    const basis = new THREE.Matrix4().makeBasis(dir, up, facing);
    const origin = cfg.origin.clone();
    const rand = rng(cfg.seed || 1);

    const bays = cfg.bays;
    const bw = cfg.bayWidth;
    const floors = cfg.floors;
    const groundH = cfg.groundH != null ? cfg.groundH : 4.0;
    const fh = cfg.floorH != null ? cfg.floorH : 3.2;
    const depth = cfg.depth != null ? cfg.depth : 11;
    const length = bays * bw;
    const totalH = groundH + (floors - 1) * fh;

    const place = (key, geo, lx, ly, lz, ry) => {
      const m = basis.clone();
      if (ry) { const rot = new THREE.Matrix4().makeRotationY(ry); m.multiply(rot); }
      const pos = origin.clone().addScaledVector(dir, lx).addScaledVector(up, ly).addScaledVector(facing, lz);
      m.setPosition(pos);
      geo.applyMatrix4(m);
      this.add(key, geo);
      return geo;
    };
    const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);

    // ---- structural core (windowed back/sides so orbiting never shows a
    //      flat black slab) sits behind the hero glazing ----
    const coreGeo = B(length + 0.02, totalH, depth);
    scaleBoxUV(coreGeo, length + 0.02, totalH, depth, 3.4);
    place('coreFacade', coreGeo, length / 2, totalH / 2, -0.95 - depth / 2);

    // ---- ground floor: darker stone plinth, recessed ----
    place('darkStone', B(length, groundH, 0.5), length / 2, groundH / 2, -0.35);

    const floorY = (f) => (f === 0 ? 0 : groundH + (f - 1) * fh);
    const floorTop = (f) => (f === 0 ? groundH : groundH + f * fh);

    // choose which vertical bay-lines get a full-height ivy strip
    const ivyCols = new Set();
    for (let b = 1; b < bays; b++) if (rand() < 0.28) ivyCols.add(b);
    // choose wood-clad vertical spans (like the vertical louver strips in refs)
    const woodCols = new Set();
    for (let b = 0; b < bays; b++) if (rand() < 0.14) woodCols.add(b);

    // ---- horizontal floor slabs (white picture-frame banding) ----
    for (let f = 1; f <= floors; f++) {
      const y = floorTop(f - 1);
      // slab projects forward, creating the crisp shadow line
      place('whitePanel', B(length, 0.34, 1.05), length / 2, y + 0.02, 0.0);
    }
    // base slab above ground floor already covered; add parapet cap
    place('whitePanel', B(length, 0.5, 1.15), length / 2, totalH + 0.25, 0.05);

    // ---- vertical pilasters between bays ----
    for (let b = 0; b <= bays; b++) {
      const x = b * bw;
      const isEnd = (b === 0 || b === bays);
      const w = isEnd ? 0.5 : 0.34;
      place('whitePanel', B(w, totalH - groundH + 0.1, 0.9), x, groundH + (totalH - groundH) / 2, -0.05);
    }

    // ---- per-cell facade (glazing, mullions, balconies, spandrels) ----
    for (let f = 1; f < floors; f++) {
      const y0 = floorY(f);
      const yTop = floorTop(f);
      const cellH = yTop - y0;
      for (let b = 0; b < bays; b++) {
        const cx = b * bw + bw / 2;
        const openW = bw - 0.42;
        const openH = cellH - 0.42;
        const gy = y0 + cellH / 2;

        const wood = woodCols.has(b) && rand() < 0.7;
        // spandrel below window: sometimes wood, sometimes dark
        const spandrelH = 0.55;
        if (wood) {
          place('woodV', B(bw - 0.1, cellH - 0.1, 0.42), cx, gy, -0.02);
          // narrow windows punched into wood
          const nWin = 2;
          for (let k = 0; k < nWin; k++) {
            const wx = cx + (k - (nWin - 1) / 2) * (openW / nWin);
            place('glass', B(openW / nWin - 0.25, openH - 0.4, 0.06), wx, gy, -0.24);
            frameG(place, B, wx, gy, openW / nWin - 0.25, openH - 0.4, -0.2);
          }
        } else {
          // recessed glazing
          place('glass', B(openW, openH, 0.06), cx, gy, -0.5);
          // interior hint behind a subset
          if (rand() < 0.4) place('interiorGlow', B(openW - 0.1, openH - 0.1, 0.02), cx, gy, -0.62);
          // dark reveal (window box sides) to add depth
          place('blackTrim', B(openW + 0.14, openH + 0.14, 0.02), cx, gy, -0.62);
          // mullions
          frameG(place, B, cx, gy, openW, openH, -0.46);
          // dark spandrel panel at floor
          place('charcoal', B(openW + 0.1, spandrelH, 0.04), cx, y0 + spandrelH / 2 + 0.02, -0.44);
        }

        // ---- balconies ----
        const balcony = !wood && ((f + b) % 3 === 0 || rand() < 0.22);
        if (balcony) {
          const bd = 1.7;
          // balcony floor projecting forward
          place('whitePanel', B(bw - 0.12, 0.24, bd), cx, y0 + 0.02, bd / 2 + 0.05);
          // railing: alternate perforated metal vs glass balustrade
          const railY = y0 + 0.62;
          const railFront = bd + 0.05;
          if ((b + f) % 2 === 0) {
            // perforated metal panel (separate, transparent alpha) -> glassGroup layer
            const rg = new THREE.PlaneGeometry(bw - 0.16, 1.05);
            placeMesh(this.glassGroup, basis, origin, dir, up, facing, M.perfRail, rg, cx, railY, railFront, 0);
            // top rail
            place('darkMetal', B(bw - 0.12, 0.06, 0.06), cx, railY + 0.55, railFront);
          } else {
            const gg = new THREE.PlaneGeometry(bw - 0.16, 1.05);
            placeMesh(this.glassGroup, basis, origin, dir, up, facing, M.railGlass, gg, cx, railY, railFront, 0);
            place('darkMetal', B(bw - 0.12, 0.05, 0.05), cx, railY + 0.55, railFront);
            place('darkMetal', B(0.05, 1.05, 0.05), cx - (bw - 0.16) / 2, railY, railFront);
            place('darkMetal', B(0.05, 1.05, 0.05), cx + (bw - 0.16) / 2, railY, railFront);
          }
          // planter with greenery on some balconies
          if (rand() < 0.5) {
            place('woodH', B(0.5, 0.35, bd * 0.7), cx + (bw / 2 - 0.4), y0 + 0.35, bd / 2);
            place('foliage', B(0.55, 0.5, bd * 0.7), cx + (bw / 2 - 0.4), y0 + 0.75, bd / 2);
          }
        }
      }
    }

    // ---- full-height vertical ivy strips ----
    ivyCols.forEach((b) => {
      const x = b * bw;
      const h = totalH - groundH - 0.2;
      const geo = new THREE.PlaneGeometry(0.7, h, 1, 8);
      placeMesh(this.group, basis, origin, dir, up, facing, M.ivy, geo, x, groundH + h / 2 + 0.1, 0.12, 0, true);
    });

    // ---- ground floor lobby glazing + wood entrance (lit lobbies so the
    //      recessed base never reads as a black void) ----
    for (let b = 0; b < bays; b++) {
      const cx = b * bw + bw / 2;
      const gH = groundH - 1.0;
      const gY = gH / 2 + 0.2;
      // bright lobby interior behind the glass
      place('interiorGlow', B(bw - 0.3, gH + 0.1, 0.02), cx, gY, -0.34);
      if (b === Math.floor(bays / 2) && cfg.entrance) {
        // recessed wood-lined entrance portal
        place('woodH', B(bw * 0.94, groundH - 0.4, 0.3), cx, (groundH - 0.4) / 2, 0.14);
        place('woodH', B(bw * 0.55, groundH - 0.9, 0.25), cx, (groundH - 0.9) / 2, 0.26);
        place('glassClear', B(bw * 0.42, groundH - 1.3, 0.06), cx, (groundH - 1.3) / 2, 0.34);
        place('blackTrim', B(bw * 0.44, groundH - 1.2, 0.04), cx, (groundH - 1.2) / 2, 0.3);
      } else {
        place('glassClear', B(bw - 0.5, gH, 0.06), cx, gY, -0.18);
        place('darkMetal', B(0.14, gH + 0.1, 0.16), cx - (bw - 0.5) / 2, gY, -0.14);
        place('darkMetal', B(0.14, gH + 0.1, 0.16), cx + (bw - 0.5) / 2, gY, -0.14);
        place('darkMetal', B(bw - 0.5, 0.1, 0.16), cx, gY, -0.14); // transom
      }
    }

    // ---- rooftop details ----
    this._roof(place, B, length, totalH, depth, rand, basis, origin, dir, up, facing);

    // ---- optional cantilevered wood penthouse box on top ----
    if (cfg.penthouse) {
      this._penthouse(place, B, length, totalH, rand, basis, origin, dir, up, facing, cfg);
    }

    return { length, totalH };
  }

  _roof(place, B, length, totalH, depth, rand, basis, origin, dir, up, facing) {
    const M = this.M;
    const y = totalH + 0.02;
    // roof deck
    place('roofDeck', B(length - 0.4, 0.1, depth - 0.4), length / 2, y, -0.95 - depth / 2);
    // HVAC units, vents
    const n = Math.max(3, Math.floor(length / 8));
    for (let i = 0; i < n; i++) {
      const lx = 2 + rand() * (length - 4);
      const lz = -0.95 - 1 - rand() * (depth - 3);
      place('hvac', B(1.2 + rand(), 0.7 + rand() * 0.4, 1.0 + rand()), lx, y + 0.45, lz);
      if (rand() < 0.5) place('blackTrim', B(0.35, 0.6, 0.35), lx + 1.2, y + 0.4, lz, 0);
    }
    // solar array on part of roof
    if (rand() < 0.8) {
      const rows = 3, cols = Math.max(2, Math.floor(length / 6));
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const g = new THREE.BoxGeometry(1.6, 0.06, 1.0);
        g.rotateX(-0.35);
        place('solarPanel', g, 2 + c * 1.8, y + 0.35, -0.95 - depth + 1.5 + r * 1.3);
      }
    }
    // parapet ring
    place('whitePanel', B(length, 0.5, 0.25), length / 2, y + 0.25, 0.35);
  }

  _penthouse(place, B, length, totalH, rand, basis, origin, dir, up, facing, cfg) {
    const M = this.M;
    const phLen = Math.min(length * 0.45, 14);
    const phStart = cfg.penthouseAt != null ? cfg.penthouseAt : length * 0.1;
    const cx = phStart + phLen / 2;
    const phH = 3.4;
    const y = totalH + phH / 2 + 0.1;
    // cantilevered wood-clad volume (projects forward past facade)
    place('woodH', B(phLen, phH, 6.5), cx, y, 0.9 - 6.5 / 2 + 1.2);
    // big corner glazing
    place('glass', B(phLen - 1.2, phH - 1.0, 0.08), cx, y, 1.55);
    place('blackTrim', B(phLen - 1.0, phH - 0.8, 0.04), cx, y, 1.5);
    // wood soffit / deep eave
    place('woodH', B(phLen + 1.0, 0.35, 7.6), cx, totalH + phH + 0.2, 0.9 - 6.5 / 2 + 1.2);
    // roof terrace with glass balustrade (on the setback beside the box)
    const terrX = phStart + phLen + 2.5;
    if (terrX < length - 2) {
      place('paving', B(6, 0.12, 4), terrX, totalH + 0.15, -1.5);
      const gg = new THREE.PlaneGeometry(6, 1.1);
      placeMesh(this.glassGroup, basis, origin, dir, up, facing, M.railGlass, gg, terrX, totalH + 0.6, 0.5, 0);
    }
  }
}

// Scale a BoxGeometry's per-face UVs so a tiled texture keeps a constant
// real-world size (tile metres) on every face regardless of face dimensions.
function scaleBoxUV(geo, w, h, d, tile) {
  const uv = geo.attributes.uv;
  const faces = [
    [d, h], [d, h], // +X, -X
    [w, d], [w, d], // +Y, -Y
    [w, h], [w, h]  // +Z, -Z
  ];
  for (let f = 0; f < 6; f++) {
    const su = faces[f][0] / tile, sv = faces[f][1] / tile;
    for (let i = 0; i < 4; i++) {
      const idx = f * 4 + i;
      uv.setXY(idx, uv.getX(idx) * su, uv.getY(idx) * sv);
    }
  }
  uv.needsUpdate = true;
}

// horizontal + vertical window mullions as a small merged frame
function frameG(place, B, cx, cy, w, h, z) {
  place('darkMetal', B(w + 0.08, 0.06, 0.08), cx, cy + h / 2, z);
  place('darkMetal', B(w + 0.08, 0.06, 0.08), cx, cy - h / 2, z);
  place('darkMetal', B(0.06, h, 0.08), cx - w / 2, cy, z);
  place('darkMetal', B(0.06, h, 0.08), cx + w / 2, cy, z);
  place('darkMetal', B(0.05, h, 0.06), cx, cy, z); // centre mullion
}

// place a standalone mesh (kept out of the merge, e.g. transparent panels)
function placeMesh(parent, basis, origin, dir, up, facing, mat, geo, lx, ly, lz, ry, faceOut) {
  const m = basis.clone();
  if (ry) m.multiply(new THREE.Matrix4().makeRotationY(ry));
  const pos = origin.clone().addScaledVector(dir, lx).addScaledVector(up, ly).addScaledVector(facing, lz);
  m.setPosition(pos);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.applyMatrix4(m);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
