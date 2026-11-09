import * as THREE from 'three';
import type { ModelInstance } from '../render/Assets';
import type { Spacecraft } from './Spacecraft';
import { Plume } from './Plume';

interface RcsJet {
  node: THREE.Object3D;
  dir: THREE.Vector3; // local (craft) outward direction
  mesh: THREE.Mesh;
  t: number;
}

const PLUME_STYLE: Record<string, { core: number; edge: number; r: number; len: number; vr: number; vlen: number; int: number }> = {
  ranger: { core: 0xe8f0ff, edge: 0x4a78ff, r: 0.55, len: 9, vr: 0.32, vlen: 4.5, int: 5 },
  lander: { core: 0xf0f4ff, edge: 0x5a86ff, r: 0.9, len: 12, vr: 0.6, vlen: 7, int: 5 },
  oldlander: { core: 0xfff0d8, edge: 0xff9a4a, r: 0.9, len: 10, vr: 0.6, vlen: 6, int: 4 },
  endurance: { core: 0xf4f8ff, edge: 0x7aa0ff, r: 2.2, len: 40, vr: 0, vlen: 0, int: 7 },
};

/**
 * Binds a spacecraft simulation to its GLB: plumes on engine/vtol empties, RCS puffs on rcs_* empties,
 * landing-gear retraction, blinking navigation lights.
 */
export class CraftModel {
  readonly mains: { node: THREE.Object3D; plume: Plume }[] = [];
  readonly vtols: { node: THREE.Object3D; plume: Plume }[] = [];
  readonly rcs: RcsJet[] = [];
  readonly gear: { node: THREE.Object3D; base: THREE.Euler }[] = [];
  gearT = 1; // 1 = down
  readonly navLights: { node: THREE.Object3D; mesh: THREE.Mesh; kind: string }[] = [];
  private t = 0;
  private rcsMat: THREE.MeshBasicMaterial;

  constructor(readonly inst: ModelInstance, readonly kind: string) {
    const st = PLUME_STYLE[kind] ?? PLUME_STYLE.ranger;
    this.rcsMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false });
    const rcsGeo = new THREE.ConeGeometry(0.18, 1.6, 10, 1, true);
    rcsGeo.translate(0, 0.8, 0);
    for (const [name, n] of inst.nodes) {
      if (name.startsWith('engine_') || name.startsWith('mainengine')) {
        const p = new Plume({ radius: st.r, length: st.len, core: st.core, edge: st.edge, intensity: st.int });
        n.add(p.mesh);
        this.mains.push({ node: n, plume: p });
      } else if (name.startsWith('vtol_') && st.vlen > 0) {
        const p = new Plume({ radius: st.vr, length: st.vlen, core: st.core, edge: st.edge, intensity: st.int * 0.8 });
        p.mesh.rotation.x = -Math.PI / 2; // point down (-Y)
        n.add(p.mesh);
        this.vtols.push({ node: n, plume: p });
      } else if (name.startsWith('rcs_') && n.userData.dx !== undefined) {
        const d = new THREE.Vector3(n.userData.dx, n.userData.dz, -n.userData.dy).normalize();
        const m = new THREE.Mesh(rcsGeo, this.rcsMat);
        m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().applyQuaternion(n.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(inst.root.getWorldQuaternion(new THREE.Quaternion()))));
        m.visible = false;
        m.userData.owned = true;
        n.add(m);
        this.rcs.push({ node: n, dir: d, mesh: m, t: 0 });
      } else if (name.startsWith('gear_') && n.userData.gear) {
        this.gear.push({ node: n, base: n.rotation.clone() });
      } else if (name.startsWith('navlight_')) {
        const color = n.userData.color === 'red' ? 0xff2010 : n.userData.color === 'green' ? 0x20ff40 : 0xffffff;
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshBasicMaterial({ color, toneMapped: false }));
        m.userData.owned = true;
        n.add(m);
        this.navLights.push({ node: n, mesh: m, kind: n.userData.color ?? 'white' });
      }
    }
  }

  update(dt: number, craft: Spacecraft | null, atmo: number, opts: { mainLevel?: number; vtolLevel?: number } = {}) {
    this.t += dt;
    const main = opts.mainLevel ?? craft?.mainLevel ?? 0;
    const vtol = opts.vtolLevel ?? craft?.vtolLevel ?? 0;
    for (const m of this.mains) m.plume.update(dt, main, atmo);
    for (const v of this.vtols) v.plume.update(dt, vtol, atmo);
    // RCS: fire jets whose outward direction opposes the commanded translation / rotation
    if (craft) {
      const tr = craft.rcsFire;
      const rot = craft.rcsRotFire;
      for (const j of this.rcs) {
        const p = j.node.position;
        // translation: jet fires opposite to desired acceleration
        let f = -(j.dir.x * tr.x + j.dir.y * tr.y + j.dir.z * tr.z);
        // rotation: torque = r × F, F = -dir
        const F = j.dir.clone().negate();
        const tq = new THREE.Vector3().crossVectors(p, F);
        f += (tq.x * rot.x + tq.y * rot.y + tq.z * rot.z) / Math.max(1, p.length());
        j.t = f > 0.2 ? 0.12 : Math.max(0, j.t - dt);
        j.mesh.visible = j.t > 0;
        j.mesh.scale.setScalar(0.6 + Math.random() * 0.5);
      }
      // gear animation follows the craft's gear state
      const tgt = craft.gearDown ? 1 : 0;
      this.gearT = THREE.MathUtils.clamp(this.gearT + Math.sign(tgt - this.gearT) * dt / 3.0, 0, 1);
    }
    const e = this.gearT * this.gearT * (3 - 2 * this.gearT);
    for (const g of this.gear) g.node.rotation.set(g.base.x - (1 - e) * (Math.PI / 2), g.base.y, g.base.z);
    // nav lights: steady red/green, white strobe double-flash every 1.4 s
    for (const n of this.navLights) {
      if (n.kind === 'white') {
        const ph = this.t % 1.4;
        n.mesh.visible = ph < 0.06 || (ph > 0.18 && ph < 0.24);
      } else n.mesh.visible = true;
    }
  }

  setGear(down: boolean, instant = false) {
    if (instant) this.gearT = down ? 1 : 0;
  }
}
