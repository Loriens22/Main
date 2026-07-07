// ---------------------------------------------------------------------------
// complex.js — assembles the whole building from the detailed 3D "parts".
// The clean white structural massing (floor slabs, pilasters, spandrels, core,
// parapets) is still built as merged boxes, but every FACADE element is now a
// real 3D part (window units with deep aluminium reveals, glass/slat/perforated
// railings, volumetric green walls, timber louvres & plank cladding), plus
// hero props: furnished terraces, rooftop equipment, lobby entrances.
//
// Facade parts are baked (merged, instancing/vertex-colour preserved) so the
// hundreds of placements stay cheap enough for mobile.
// ---------------------------------------------------------------------------
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PartBaker } from './partsbake.js';
import { createGlassBalustrade, createSlatRailing, createPerforatedRailing } from './parts/railings.js';
import { createWindowUnit, createSlidingDoor } from './parts/windows.js';
import { createWoodLouvre, createWoodCladding } from './parts/louvre.js';
import { createGreenWall, createTrough } from './parts/greenwall.js';
import { createTerraceSet } from './parts/terrace.js';
import { createRooftopCluster } from './parts/rooftop.js';
import { createEntrance } from './parts/entrance.js';
import { createTree, createBench, createBollardLight } from './parts/site.js';

function rng(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x9E3779B9) | 0; let t = Math.imul(a ^ (a >>> 16), 0x21f0aaad); t = Math.imul(t ^ (t >>> 15), 0x735a2d97); return ((t ^ (t >>> 15)) >>> 0) / 4294967296; };
}

export class ComplexBuilder {
  constructor(materials) {
    this.M = materials;
    this.baker = new PartBaker();
    this.reg = new Set();          // which part keys are registered
    this.struct = {};              // structural geometry buckets by material key
    this.group = new THREE.Group();
    this.direct = new THREE.Group(); // hero props placed directly (few instances)
    this.group.add(this.direct);
    this.courtyardTrees = [];
  }

  _sbucket(key, geo) { (this.struct[key] || (this.struct[key] = [])).push(geo); }

  // lazily register a baked part at a given size; returns its key
  _ensure(key, factory) {
    if (!this.reg.has(key)) { this.baker.register(key, factory()); this.reg.add(key); }
    return key;
  }

  // place a facade-mounted baked part in a wing's local frame
  _placeFacade(key, basis, origin, dir, up, facing, along, baseY, out) {
    const P = origin.clone().addScaledVector(dir, along).addScaledVector(up, baseY).addScaledVector(facing, out);
    const m = basis.clone(); m.setPosition(P);
    this.baker.place(key, m);
  }

  // place a hero group directly (footprint centered on X/Z, base y=0)
  _placeDirect(groupObj, basis, origin, dir, up, facing, along, baseY, out) {
    const P = origin.clone().addScaledVector(dir, along).addScaledVector(up, baseY).addScaledVector(facing, out);
    const m = basis.clone(); m.setPosition(P);
    groupObj.applyMatrix4(m);
    this.direct.add(groupObj);
  }

  wing(cfg) {
    const M = this.M;
    const up = new THREE.Vector3(0, 1, 0);
    const dir = cfg.dir.clone().normalize();
    const facing = cfg.facing.clone().normalize();
    const basis = new THREE.Matrix4().makeBasis(dir, up, facing);
    const origin = cfg.origin.clone();
    const rand = rng(cfg.seed || 1);

    const bays = cfg.bays, bw = cfg.bayWidth, floors = cfg.floors;
    const groundH = cfg.groundH ?? 4.2, fh = cfg.floorH ?? 3.25, depth = cfg.depth ?? 12;
    const length = bays * bw;
    const totalH = groundH + (floors - 1) * fh;

    // ---- structural box helper (baked into merged struct meshes) ----
    const box = (key, w, h, d, lx, ly, lz, ry) => {
      const g = new THREE.BoxGeometry(w, h, d);
      if (ry) g.rotateY(ry);
      const m = basis.clone();
      m.setPosition(origin.clone().addScaledVector(dir, lx).addScaledVector(up, ly).addScaledVector(facing, lz));
      g.applyMatrix4(m);
      this._sbucket(key, g);
    };

    // core (windowed back/sides), ground plinth, parapet
    box('coreFacade', length + 0.02, totalH, depth, length / 2, totalH / 2, -0.62 - depth / 2);
    box('darkStone', length, groundH, 0.55, length / 2, groundH / 2, -0.32);
    box('whitePanel', length, 0.55, 1.2, length / 2, totalH + 0.28, 0.08);

    const floorTop = (f) => (f === 0 ? groundH : groundH + f * fh);
    const floorBot = (f) => (f === 0 ? 0 : groundH + (f - 1) * fh);

    // horizontal floor slabs (projecting → crisp shadow banding)
    for (let f = 1; f <= floors; f++) box('whitePanel', length, 0.34, 1.05, length / 2, floorTop(f - 1) + 0.02, 0.0);
    // vertical pilasters
    for (let b = 0; b <= bays; b++) {
      const isEnd = b === 0 || b === bays;
      box('whitePanel', isEnd ? 0.5 : 0.34, totalH - groundH + 0.1, 0.9, b * bw, groundH + (totalH - groundH) / 2, -0.05);
    }

    // choose vertical green-wall columns and wood-louvre columns
    const greenCols = new Set(), woodCols = new Set();
    for (let b = 1; b < bays; b++) if (rand() < 0.22) greenCols.add(b);
    for (let b = 0; b < bays; b++) if (rand() < 0.12 && !greenCols.has(b)) woodCols.add(b);

    // ---- upper-floor facade cells ----
    for (let f = 1; f < floors; f++) {
      const y0 = floorBot(f), yTop = floorTop(f), cellH = yTop - y0;
      for (let b = 0; b < bays; b++) {
        const cx = b * bw + bw / 2;
        const openW = bw - 0.42, openH = cellH - 0.42;

        if (woodCols.has(b)) {
          // timber louvre screen bay
          const lk = this._ensure(`louvre_${openW.toFixed(2)}_${(cellH - 0.2).toFixed(2)}`,
            () => createWoodLouvre(openW, cellH - 0.2, 'v'));
          this._placeFacade(lk, basis, origin, dir, up, facing, cx, y0 + 0.1, 0.02);
          continue;
        }

        // dark spandrel under the glazing
        box('charcoal', openW + 0.12, 0.5, 0.05, cx, y0 + 0.27, -0.42);

        const balcony = (f + b) % 3 === 0 || rand() < 0.18;
        if (balcony) {
          // sliding door + projecting balcony slab + railing (+ sometimes trough)
          const dk = this._ensure(`door_${openW.toFixed(2)}_${(openH + 0.1).toFixed(2)}`,
            () => createSlidingDoor(openW, openH + 0.1));
          this._placeFacade(dk, basis, origin, dir, up, facing, cx, y0 + 0.16, -0.42);
          const bd = 1.65;
          box('whitePanel', bw - 0.1, 0.24, bd, cx, y0 + 0.02, bd / 2 + 0.02);        // balcony slab
          box('charcoal', bw - 0.1, 0.14, bd - 0.1, cx, y0 - 0.09, bd / 2 + 0.02);    // slab soffit
          const style = (b + f) % 3;
          const rw = bw - 0.12;
          const rk = style === 0
            ? this._ensure(`railG_${rw.toFixed(2)}`, () => createGlassBalustrade(rw, 1.12))
            : style === 1
              ? this._ensure(`railS_${rw.toFixed(2)}`, () => createSlatRailing(rw, 1.12))
              : this._ensure(`railP_${rw.toFixed(2)}`, () => createPerforatedRailing(rw, 1.12));
          this._placeFacade(rk, basis, origin, dir, up, facing, cx, y0 + 0.24, bd + 0.02);
          if (rand() < 0.4) {
            const tk = this._ensure(`trough_${(rw - 0.3).toFixed(2)}`, () => createTrough(rw - 0.3));
            this._placeFacade(tk, basis, origin, dir, up, facing, cx, y0 + 0.26, bd - 0.2);
          }
        } else {
          // fixed window unit, recessed
          const cols = openW > 2.6 ? 3 : 2;
          const wk = this._ensure(`win_${openW.toFixed(2)}_${openH.toFixed(2)}_${cols}`,
            () => createWindowUnit(openW, openH, cols, 1));
          this._placeFacade(wk, basis, origin, dir, up, facing, cx, y0 + 0.21, -0.4);
        }
      }
    }

    // ---- full-height green-wall columns ----
    const upperH = totalH - groundH - 0.2;
    greenCols.forEach((b) => {
      const gk = this._ensure(`green_${upperH.toFixed(2)}`, () => createGreenWall(0.92, upperH, 0.26));
      this._placeFacade(gk, basis, origin, dir, up, facing, b * bw, groundH + 0.1, 0.12);
    });

    // ---- ground floor: entrance at centre, glazing elsewhere ----
    const entryBay = Math.floor(bays / 2);
    for (let b = 0; b < bays; b++) {
      const cx = b * bw + bw / 2;
      if (b === entryBay && cfg.entrance) {
        const ek = this._ensure(`entrance_${(bw * 1.6).toFixed(2)}_${groundH.toFixed(2)}`,
          () => createEntrance(bw * 1.6, groundH));
        this._placeFacade(ek, basis, origin, dir, up, facing, cx, 0, 0.0);
      } else {
        const dk = this._ensure(`gdoor_${(bw - 0.5).toFixed(2)}_${(groundH - 1.0).toFixed(2)}`,
          () => createSlidingDoor(bw - 0.5, groundH - 1.0));
        this._placeFacade(dk, basis, origin, dir, up, facing, cx, 0.2, -0.18);
        box('interiorGlow', bw - 0.4, groundH - 1.1, 0.02, cx, 0.2 + (groundH - 1.0) / 2, -0.34);
      }
    }

    // ---- rooftop equipment cluster ----
    const rc = createRooftopCluster(Math.min(length * 0.5, 12), depth - 2.5);
    this._placeDirect(rc, basis, origin, dir, up, facing, length * 0.5, totalH + 0.02, -0.62 - depth / 2 + 1.2);

    // ---- wood-clad cantilevered penthouse + terrace ----
    if (cfg.penthouse) this._penthouse(basis, origin, dir, up, facing, length, totalH, cfg, box);

    return { length, totalH };
  }

  _penthouse(basis, origin, dir, up, facing, length, totalH, cfg, box) {
    const phLen = Math.min(length * 0.42, 13);
    const start = cfg.penthouseAt ?? length * 0.1;
    const cx = start + phLen / 2;
    const phH = 3.4, phDepth = 6.2;
    const y = totalH + phH / 2 + 0.1;
    // wood plank cladding wrap (front + sides) via cladding parts
    const front = this._ensure(`clad_${phLen.toFixed(2)}_${phH.toFixed(2)}`, () => createWoodCladding(phLen, phH));
    this._placeFacade(front, basis, origin, dir, up, facing, cx, totalH + 0.1, 1.15);
    // structural wood box behind the cladding + big glazing + deep soffit
    box('woodH', phLen, phH, phDepth, cx, y, 1.15 - phDepth / 2);
    const dk = this._ensure(`phdoor_${(phLen - 1.0).toFixed(2)}`, () => createSlidingDoor(phLen - 1.0, phH - 0.8));
    this._placeFacade(dk, basis, origin, dir, up, facing, cx, totalH + 0.5, 1.2);
    box('woodH', phLen + 1.0, 0.34, phDepth + 1.2, cx, totalH + phH + 0.2, 1.15 - phDepth / 2);
    // roof terrace on the setback beside the penthouse box
    const terrX = start + phLen + 3.5;
    if (terrX < length - 3) {
      const ts = createTerraceSet(6, 4);
      this._placeDirect(ts, basis, origin, dir, up, facing, terrX, totalH + 0.12, -1.0);
      const rk = this._ensure('railG_terr', () => createGlassBalustrade(6.4, 1.12));
      this._placeFacade(rk, basis, origin, dir, up, facing, terrX, totalH + 0.12, 1.1);
    }
  }

  // hero courtyard trees + a few benches/bollards, baked
  courtyard(points) {
    const rand = rng(9911);
    for (const [x, z, h, kind] of points) {
      const key = `tree_${h}_${kind}`;
      this._ensure(key, () => createTree(h, kind));
      const m = new THREE.Matrix4().makeRotationY(rand() * 6.28);
      m.setPosition(new THREE.Vector3(x, 0, z));
      this.baker.place(key, m);
    }
  }
  benches(list) {
    for (const [x, z, ry] of list) {
      this._ensure('bench', () => createBench(2.0));
      const m = new THREE.Matrix4().makeRotationY(ry); m.setPosition(new THREE.Vector3(x, 0, z));
      this.baker.place('bench', m);
    }
  }
  bollards(list) {
    for (const [x, z] of list) {
      this._ensure('bollard', () => createBollardLight(0.9));
      const m = new THREE.Matrix4(); m.setPosition(new THREE.Vector3(x, 0, z));
      this.baker.place('bollard', m);
    }
  }

  finalize() {
    // merge structural buckets
    for (const key in this.struct) {
      const arr = this.struct[key];
      if (!arr.length) continue;
      const merged = mergeGeometries(arr, false);
      const mesh = new THREE.Mesh(merged, this.M[key]);
      mesh.castShadow = key !== 'interiorGlow';
      mesh.receiveShadow = true;
      this.group.add(mesh);
    }
    // baked parts
    this.group.add(this.baker.finalize());
    return this.group;
  }
}
