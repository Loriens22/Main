import * as THREE from 'three';
import { Zone } from '../Zone';
import { Sky } from '../../render/Sky';
import { assets, Model } from '../../render/Assets';
import { Terrain } from '../terrain/Terrain';
import { earthMap } from '../terrain/sources';
import { buildRoad } from './Road';
import { FARM } from './EarthMap';
import { wait } from '../../core/Game';
import { Corn } from './Corn';
import { W } from '../../render/patch';

/** House origin (south-west corner of the main block on the front wall line) in zone coordinates. */
export const HOUSE = { x: FARM.x - 3, z: FARM.z - 12 };

/**
 * The dying Earth: the farm, six kilometres of county road and the concealed NASA facility,
 * all in one continuous streamed world.
 */
export class EarthZone extends Zone {
  map = earthMap();
  sky!: Sky;
  terrain!: Terrain;
  house!: Model;
  corn!: Corn;
  private tmp = new THREE.Vector3();

  async load(progress?: (f: number, label: string) => void) {
    const g = this.game;
    progress?.(0.05, 'Atmosphere');
    this.sky = new Sky(g.renderer, g.settings.g.atmosphere);
    this.sky.setSunDirection(new THREE.Vector3(-0.55, 0.52, 0.65));
    this.sky.setParams({ cloudCoverage: 0.3, cirrus: 0.8 });
    this.sky.setFog(0.00016, 0.0011, this.map.farmY);
    this.sky.groundColor.setRGB(0.3, 0.29, 0.17);

    progress?.(0.15, 'Terrain');
    this.terrain = new Terrain(this.phys, {
      source: 'earth',
      layers: {
        sets: ['dirt', 'grass_dry', 'soil_rows', 'gravel', 'rock'],
        tiles: [4, 5, 3.04, 3, 7],
        tints: [[1, 0.98, 0.94], [1.02, 1.0, 0.9], [0.95, 0.92, 0.88], [0.92, 0.88, 0.8], [1, 0.98, 0.95]],
        aux: 'crop',
        cropColor: [0.2, 0.31, 0.085],
      },
    });
    this.terrain.setDetail(g.settings.g.viewDistance);
    this.root.add(this.terrain.group);
    this.root.add(buildRoad(this.map));

    progress?.(0.3, 'Farmhouse');
    this.house = await assets.load('farmhouse');
    this.house.root.position.set(HOUSE.x, this.map.farmY, HOUSE.z);
    this.root.add(this.house.root);
    this.root.updateMatrixWorld(true);
    this.phys.addTrimesh(this.house.colliders);

    progress?.(0.36, 'Crops');
    this.corn = new Corn(this.map, await assets.load('corn'), g.settings.g.vegetation);
    this.corn.castShadows = g.settings.g.shadowQuality >= 3;
    this.root.add(this.corn.group);

    // stream the terrain around the spawn point before revealing the world
    const spawn = this.spawnPoint();
    for (let i = 0; i < 400 && !this.terrain.ready; i++) {
      this.terrain.update(spawn);
      progress?.(0.4 + 0.55 * Math.min(1, i / 120), 'Terrain');
      await wait(16);
    }
    this.terrain.ensureCollision(spawn.x, spawn.z, 60);
  }

  spawnPoint(out = new THREE.Vector3()) {
    const p = this.house.markerPose('spawn', 'farm');
    if (p) out.copy(p.pos); else out.set(HOUSE.x, 0, HOUSE.z + 10);
    out.y = this.map.height(out.x, out.z) + 0.05;
    return out;
  }

  override enter() {
    super.enter();
    this.game.renderer.setLook({ exposure: 1.0 }, true);
  }

  override fixedUpdate(_dt: number) {
    const p = this.game.player.pos;
    this.terrain.ensureCollision(p.x, p.z, 26);
  }

  override update(dt: number) {
    const cam = this.game.renderer.camera;
    cam.getWorldPosition(this.tmp);
    this.terrain.update(this.tmp);
    this.corn.update(this.tmp);
    W.uWind.value.z += dt;
    W.uPlayer.value.copy(this.game.player.pos);
    this.sky.shadowFocus.copy(this.game.player.pos);
    const ground = this.map.height(this.tmp.x, this.tmp.z);
    this.sky.update(dt, this.tmp, Math.max(2, this.tmp.y - ground + 600));
  }

  override groundHeight(x: number, z: number) { return this.map.height(x, z); }
  override locationName() { return 'Earth'; }
}
