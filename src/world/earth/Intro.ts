import * as THREE from 'three';
import type { Game } from '../../core/Game';
import type { EarthZone } from './EarthZone';
import { FARM } from './EarthMap';
import { HOUSE } from './EarthZone';
import { ui } from '../../ui/store';
import { bus } from '../../core/events';
import { lerp, smoothstep } from '../../core/math';

interface Key { t: number; pos: [number, number, number]; look: [number, number, number]; fov: number }

/**
 * Opening shot: the camera glides low over the corn, the farmhouse comes into view, and the title
 * settles over a slow drift. Choosing Creative Mode carries the same camera down to the player's
 * eyes without a cut.
 */
export class FarmIntro {
  t = 0;
  private keys: Key[];
  private blend = -1;
  private fromPos = new THREE.Vector3();
  private fromQuat = new THREE.Quaternion();
  private fromFov = 30;
  private p = new THREE.Vector3();
  private l = new THREE.Vector3();
  private q = new THREE.Quaternion();
  private m = new THREE.Matrix4();
  private onDone: (() => void) | null = null;

  constructor(private game: Game, private zone: EarthZone) {
    const h = (x: number, z: number) => zone.map.height(x, z);
    const hx = HOUSE.x + 1, hz = HOUSE.z - 4, hy = zone.map.farmY;
    const K = (t: number, x: number, z: number, up: number, lx: number, lz: number, ly: number, fov: number): Key => ({ t, pos: [x, h(x, z) + up, z], look: [lx, ly, lz], fov });
    this.keys = [
      // skimming the tassels, looking down the rows
      K(0, FARM.x - 230, FARM.z + 300, 3.4, FARM.x - 40, FARM.z + 250, h(FARM.x - 40, FARM.z + 250) + 2.0, 34),
      K(9, FARM.x - 150, FARM.z + 255, 4.2, FARM.x - 20, FARM.z + 150, hy + 3.0, 34),
      // the house is revealed
      K(19, FARM.x - 95, FARM.z + 175, 6.0, hx, hz, hy + 4.2, 32),
      K(31, FARM.x - 52, FARM.z + 102, 3.4, hx, hz, hy + 4.4, 30),
      // settles close to the reference-2 framing: across the corn at the yard's edge
      K(44, FARM.x - 34, FARM.z + 72, 2.7, hx, hz, hy + 4.6, 30),
    ];
  }

  private sample(t: number) {
    const k = this.keys;
    let i = 0;
    while (i < k.length - 2 && t > k[i + 1].t) i++;
    const a = k[i], b = k[Math.min(k.length - 1, i + 1)];
    const u = smoothstep(a.t, b.t, t);
    this.p.set(lerp(a.pos[0], b.pos[0], u), lerp(a.pos[1], b.pos[1], u), lerp(a.pos[2], b.pos[2], u));
    this.l.set(lerp(a.look[0], b.look[0], u), lerp(a.look[1], b.look[1], u), lerp(a.look[2], b.look[2], u));
    const end = k[k.length - 1].t;
    if (t > end) {
      // slow lateral drift once the move has settled
      const d = t - end;
      this.p.x += Math.sin(d * 0.05) * 9;
      this.p.z += (1 - Math.cos(d * 0.05)) * 4;
      this.p.y += Math.sin(d * 0.11) * 0.25;
    }
    // never let the lens dip into the canopy
    const ground = this.zone.map.height(this.p.x, this.p.z);
    if (this.p.y < ground + 2.55) this.p.y = ground + 2.55;
    return lerp(a.fov, b.fov, u);
  }

  driver = (dt: number) => {
    const cam = this.game.renderer.camera;
    this.t += dt;
    const fov = this.sample(this.t);
    this.m.lookAt(this.p, this.l, THREE.Object3D.DEFAULT_UP);
    this.q.setFromRotationMatrix(this.m);
    if (this.blend < 0) {
      cam.position.copy(this.p);
      cam.quaternion.copy(this.q);
      cam.fov = fov;
    } else {
      this.blend = Math.min(1, this.blend + dt / 4.2);
      const e = this.blend * this.blend * (3 - 2 * this.blend);
      const pl = this.game.player;
      pl.eyePosition(this.p, 1);
      pl.viewQuaternion(this.q);
      // arc slightly upward so the move reads as a crane shot rather than a straight push
      cam.position.lerpVectors(this.fromPos, this.p, e);
      cam.position.y += Math.sin(e * Math.PI) * 6;
      cam.quaternion.slerpQuaternions(this.fromQuat, this.q, e);
      cam.fov = lerp(this.fromFov, 70, e);
      if (this.blend >= 1) {
        cam.fov = 70;
        cam.updateProjectionMatrix();
        this.game.cameraDriver = null;
        const done = this.onDone;
        this.onDone = null;
        done?.();
        return;
      }
    }
    cam.updateProjectionMatrix();
  };

  /** Hand the camera over to the player. */
  begin(onDone: () => void) {
    if (this.blend >= 0) return;
    const cam = this.game.renderer.camera;
    this.fromPos.copy(cam.position);
    this.fromQuat.copy(cam.quaternion);
    this.fromFov = cam.fov;
    this.blend = 0;
    this.onDone = onDone;
    ui.set({ screen: 'none', mode: 'cinematic' });
    bus.emit('intro:begin');
  }
}
