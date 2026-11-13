import * as THREE from 'three';
import { Zone } from './Zone';
import { Sky } from '../render/Sky';
import { materials } from '../render/Materials';
import { assets } from '../render/Assets';

/**
 * Developer sandbox (open with ?zone=test or ?model=<name>): a flat pad under the Earth sky used to
 * inspect materials, lighting and individual GLB assets in the real renderer.
 */
export class TestZone extends Zone {
  sky!: Sky;
  private t = 0;

  async load() {
    const g = this.game;
    this.sky = new Sky(g.renderer, g.settings.g.atmosphere);
    this.sky.setSunDirection(new THREE.Vector3(0.45, 0.62, 0.35));
    this.sky.setFog(0.00012, 0.0009, 0);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400, 1, 1).rotateX(-Math.PI / 2), materials.get('gravel'));
    const uv = ground.geometry.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 400, uv.getY(i) * 400);
    ground.receiveShadow = true;
    this.root.add(ground);
    this.phys.addTrimesh([ground]);

    const params = new URLSearchParams(location.search);
    const modelName = params.get('model');
    if (modelName) {
      const m = await assets.load(modelName);
      this.root.add(m.root);
      m.root.updateMatrixWorld(true);
      this.phys.addTrimesh(m.colliders);
    } else {
      const names = ['paint_red', 'metal_bare', 'hull_white', 'hull_black', 'siding_white', 'concrete', 'padding_dark', 'tile_white', 'hull_blanket', 'wood_planks', 'rust', 'tread_plate'];
      names.forEach((n, i) => {
        const geo = new THREE.BoxGeometry(1.6, 1.6, 1.6);
        const u = geo.attributes.uv;
        for (let k = 0; k < u.count; k++) u.setXY(k, u.getX(k) * 1.6, u.getY(k) * 1.6);
        const b = new THREE.Mesh(geo, materials.get(n));
        b.position.set((i % 6) * 2.4 - 6, 0.8, -6 - Math.floor(i / 6) * 2.6);
        b.castShadow = b.receiveShadow = true;
        this.root.add(b);
        const s = new THREE.Mesh(new THREE.SphereGeometry(0.5, 32, 16), materials.get(n));
        s.position.set(b.position.x, 2.2, b.position.z);
        s.castShadow = true;
        this.root.add(s);
      });
      this.root.updateMatrixWorld(true);
      this.phys.addTrimesh(this.root.children.filter((c) => (c as THREE.Mesh).isMesh && c !== ground) as THREE.Mesh[]);
    }
  }

  override enter() {
    super.enter();
    this.game.player.teleport(new THREE.Vector3(0, 0.05, 4), 0);
    this.game.renderer.setLook({ exposure: 1.0 }, true);
  }

  override update(dt: number) {
    this.t += dt;
    const cam = this.game.renderer.camera;
    this.sky.shadowFocus.copy(this.game.player.pos);
    this.sky.update(dt, cam.position, Math.max(2, cam.position.y));
  }
}
