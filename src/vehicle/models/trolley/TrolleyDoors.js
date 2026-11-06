// Door leaves and door signals of the line-9 trolleybuses.
//   Solaris (both generations): outward-opening plug doors: the two leaves swing out of the portal and slide
//     apart along the outside of the body. Solaris IV: an LED strip on both edges of every portal (white when
//     released, slow red flashing while moving, green when open). Solaris III: a red lamp inside over each door.
//   Ikarus 280.92F: four narrow folding leaves per door (two pairs folding inwards from the jambs).
import * as THREE from 'three';
import { Parts, M, box } from './geom.js';

const sstep = (t) => t * t * (3 - 2 * t);
const clamp01 = (t) => Math.max(0, Math.min(1, t));

export const DoorsMixin = {
  buildDoors(sec) {
    const D = this.D, G = this.G, hw = D.halfW;
    for (const d of this.spec.doors.filter((q) => q.section === sec)) {
      const width = d.z1 - d.z0, zc = (d.z0 + d.z1) / 2;
      const y0 = G.old ? 0.36 : D.floorY + 0.01, y1 = G.doorTop;
      const group = this.sec(sec);
      if (this.spec.doorType === 'fold') {
        // ---- Ikarus: two pairs of folding leaves
        const wl = width / 4;
        const pairs = [];
        for (const end of [-1, 1]) {
          const hingeZ = end < 0 ? d.z0 : d.z1;
          const a = new THREE.Group();
          a.position.set(hw - 0.06, 0, hingeZ);
          const la = this.foldLeaf(wl, y0, y1, -end);
          a.add(la);
          const b = new THREE.Group();
          b.position.set(0, 0, -end * wl);
          b.add(this.foldLeaf(wl, y0, y1, -end));
          a.add(b);
          group.add(a);
          pairs.push({ a, b, end });
        }
        this.doorAnim[d.id] = { kind: 'fold', pairs };
      } else {
        // ---- Solaris plug doors
        const w = width / 2;
        const leaves = [];
        for (const end of [-1, 1]) {
          const g = new THREE.Group();
          const zClosed = zc + end * w / 2;
          g.position.set(hw - 0.02, 0, zClosed);
          g.add(this.plugLeaf(w, y0, y1, end));
          group.add(g);
          leaves.push({ g, zClosed, end });
        }
        this.doorAnim[d.id] = { kind: 'plug', leaves, w };
      }
      this.doorLeaves[d.id] = [];
      // ---- door signals
      const warn = this.spec.doorWarning || {};
      if (warn.kind === 'led') {
        const mat = new THREE.MeshStandardMaterial({ color: 0x202224, roughness: 0.3, emissive: 0xffffff, emissiveIntensity: 0 });
        const p = new Parts();
        for (const z of [d.z0 - 0.075, d.z1 + 0.075]) {
          p.add('led', box(0.02, 1.25, 0.022), M(hw + 0.036, 1.45, z)); // outside, on the portal surround
          p.add('led', box(0.02, 0.9, 0.02), M(hw - 0.09, 1.5, z + (z < zc ? 0.03 : -0.03))); // inside, on the jamb
        }
        const m = p.build({ led: mat }, { castShadow: false });
        group.add(m);
        this.doorSignals[d.id] = { kind: 'led', mat };
      } else if (warn.kind === 'lamp') {
        const mat = new THREE.MeshStandardMaterial({ color: 0x3a0a08, roughness: 0.3, emissive: 0xff1a0a, emissiveIntensity: 0 });
        const p = new Parts();
        p.add('lamp', box(0.07, 0.07, 0.24, 0.02), M(hw - 0.3, G.doorTop + 0.12, zc));
        p.add('house', box(0.09, 0.03, 0.28), M(hw - 0.3, G.doorTop + 0.165, zc));
        const m = p.build({ lamp: mat, house: this.mats.trim }, { castShadow: false });
        group.add(m);
        this.doorSignals[d.id] = { kind: 'lamp', mat };
      }
    }
  },

  /** One plug-door leaf: black frame, two glass panes, a grab rail inside; origin at the leaf centre line. */
  plugLeaf(w, y0, y1, end) {
    const p = new Parts();
    const h = y1 - y0, yc = (y0 + y1) / 2;
    const fw = 0.05;
    // frame
    p.add('black', box(0.035, fw, w), M(0, y1 - fw / 2, 0));
    p.add('black', box(0.035, 0.24, w), M(0, y0 + 0.12, 0));
    p.add('black', box(0.035, h, fw), M(0, yc, -w / 2 + fw / 2));
    p.add('black', box(0.035, h, fw), M(0, yc, w / 2 - fw / 2));
    p.add('black', box(0.035, 0.05, w), M(0, y0 + 1.0, 0)); // transom between the panes
    // rubber edge where the leaves meet
    p.add('rubber', box(0.045, h, 0.025), M(0, yc, -end * (w / 2 - 0.012)));
    // glass
    for (const [a, b] of [[y0 + 0.24, y0 + 0.975], [y0 + 1.025, y1 - fw]]) {
      const g = new THREE.PlaneGeometry(w - 2 * fw, b - a);
      g.rotateY(Math.PI / 2);
      p.add('glass', g, M(0.004, (a + b) / 2, 0));
    }
    // inside grab rail (vertical) and the rail's stand-offs
    p.add('pole', box(0.03, 0.9, 0.03), M(-0.07, y0 + 1.15, -end * (w / 2 - 0.12)));
    p.add('steel', box(0.06, 0.02, 0.02), M(-0.04, y0 + 0.72, -end * (w / 2 - 0.12)));
    p.add('steel', box(0.06, 0.02, 0.02), M(-0.04, y0 + 1.58, -end * (w / 2 - 0.12)));
    return p.build(this.mats, { castShadow: false });
  },

  /** One narrow folding leaf of the Ikarus doors: aluminium frame, glazed top and bottom; spans dirZ * w. */
  foldLeaf(w, y0, y1, dirZ) {
    const p = new Parts();
    const h = y1 - y0, yc = (y0 + y1) / 2, zc = dirZ * w / 2;
    const fw = 0.04;
    p.add('alu', box(0.03, fw, w - 0.01), M(0, y1 - fw / 2, zc));
    p.add('alu', box(0.03, fw, w - 0.01), M(0, y0 + fw / 2, zc));
    p.add('alu', box(0.03, h, fw), M(0, yc, dirZ * fw / 2));
    p.add('alu', box(0.03, h, fw), M(0, yc, dirZ * (w - fw / 2)));
    p.add('alu', box(0.03, 0.06, w - 0.01), M(0, y0 + 0.62, zc));
    p.add('rubber', box(0.035, h, 0.018), M(0, yc, dirZ * (w - 0.004)));
    for (const [a, b] of [[y0 + fw, y0 + 0.59], [y0 + 0.65, y1 - fw]]) {
      const g = new THREE.PlaneGeometry(w - 2 * fw, b - a);
      g.rotateY(Math.PI / 2);
      p.add('glass', g, M(0.002, (a + b) / 2, zc));
    }
    // the vertical door shaft on the hinge edge (the air engine turns it)
    p.add('steel', box(0.04, h + 0.1, 0.04), M(-0.03, yc, 0));
    return p.build(this.mats, { castShadow: false });
  },

  setDoor(id, openness) {
    const A = this.doorAnim[id];
    if (!A) return;
    const o = clamp01(openness);
    if (A.kind === 'plug') {
      const out = sstep(clamp01(o / 0.28)) * 0.1;
      const slide = sstep(clamp01((o - 0.18) / 0.82)) * A.w * 0.93;
      for (const l of A.leaves) l.g.position.set(this.D.halfW - 0.02 + out, 0, l.zClosed + l.end * slide);
    } else {
      const th = sstep(o) * 1.42;
      for (const q of A.pairs) {
        // leaf A turns inwards about the jamb, leaf B folds back against it
        q.a.rotation.y = q.end * th;
        q.b.rotation.y = -q.end * 2 * th;
      }
    }
  },
};
