import * as THREE from 'three';
import { Zone } from '../Zone';
import { Sky } from '../../render/Sky';
import { assets, Model } from '../../render/Assets';
import { Terrain } from '../terrain/Terrain';
import { earthMap } from '../terrain/sources';
import { buildRoad } from './Road';
import { FARM, LANDING_FIELD, NASA } from './EarthMap';
import { wait } from '../../core/Game';
import { Corn } from './Corn';
import { W } from '../../render/patch';
import { LightPool } from '../../render/LightPool';
import { Building } from '../Building';
import { Weather } from './Weather';
import { WheeledVehicle } from '../../vehicles/WheeledVehicle';
import { Driving } from '../../vehicles/Driving';
import { Neighbors } from './Neighbors';
import { NasaSite } from './Nasa';
import type { NasaStaff } from './NasaStaff';
import type { AudioEngine, Soundscape } from '../../audio/Audio';
import { Farm, Machine } from './Farm';
import { ScreenSurface, scr } from '../../render/ScreenSurface';
import { ui } from '../../ui/store';
import { bus } from '../../core/events';
import { clamp, damp, lerp, smoothstep } from '../../core/math';
import { GROUP, groups } from '../../physics/Physics';

/** House origin (south-west corner of the main block on the front wall line) in zone coordinates. */
export const HOUSE = { x: FARM.x - 3, z: FARM.z - 12 };
const SHED = { x: FARM.x + 20, z: FARM.z - 48 };

const RADIO_LINES = [
  'County extension office: blight has now been confirmed in okra across the southern plots. Growers are reminded that corn remains the only certified crop this season.',
  'Dust advisory for the western counties through the weekend. Keep windows closed and check your filters before running any machinery.',
  'Grain cooperative notice: yields are down eleven percent on last year. Every working combine matters. If you have parts, share them.',
  "School board update: the district has four places for university this year. Most of our young people will be needed on the land. That is simply the world we are living in.",
  'Reminder from the co-op: autonomous harvesters must be recalled before dust fronts arrive. Guidance receivers do not like static.',
];

/**
 * The dying Earth: the farm, six kilometres of county road and the concealed NASA facility,
 * all in one continuous streamed world.
 */
export class EarthZone extends Zone {
  map = earthMap();
  sky!: Sky;
  terrain!: Terrain;
  corn!: Corn;
  weather!: Weather;
  lights!: LightPool;
  house!: Model;
  houseB!: Building;
  shedB!: Building;
  farm!: Farm;
  neighbors!: Neighbors;
  nasa!: NasaSite;
  nasaStaff: NasaStaff | null = null;
  /** 0..1: the camera is below the terrain surface (tunnels, the facility) */
  underground = 0;
  pickup!: WheeledVehicle;
  vehicles: WheeledVehicle[] = [];
  private screens: ScreenSurface[] = [];
  private props!: Model;
  private tmp = new THREE.Vector3();
  private indoors = 0;
  private indoorTimer = 0;
  private radioOn = false;
  private radioTimer = 0;
  private radioIdx = 0;
  private radioPos = new THREE.Vector3();
  private refuelT = 0;
  private gpsTimer = 0;
  private cropNear = 0;
  private tint: [number, number, number] = [1, 1, 1];
  /** hooks other modules use to extend the zone (NASA facility, neighbours, crew) */
  extensions: { fixedUpdate?(dt: number): void; update?(dt: number): void; serialize?(): any; deserialize?(d: any): void; id: string }[] = [];

  get driving(): Driving { return this.game.services.driving; }

  async load(progress?: (f: number, label: string) => void) {
    const g = this.game;
    progress?.(0.04, 'Atmosphere');
    this.sky = new Sky(g.renderer, g.settings.g.atmosphere);
    this.sky.groundColor.setRGB(0.3, 0.29, 0.17);
    this.sky.setShadowQuality(g.settings.g.shadowQuality);
    this.weather = new Weather(this.sky, this.root, g.settings.g.volumetrics);
    this.lights = new LightPool(this.root, 8, 3);

    progress?.(0.1, 'Terrain');
    this.terrain = new Terrain(this.phys, {
      source: 'earth',
      layers: {
        sets: ['dirt', 'grass_dry', 'soil_rows', 'gravel', 'rock'],
        tiles: [4, 5, 3.04, 2.2, 7],
        tints: [[1, 0.98, 0.94], [1.02, 1.0, 0.9], [0.95, 0.92, 0.88], [0.8, 0.76, 0.68], [1, 0.98, 0.95]],
        aux: 'crop',
        cropColor: [0.2, 0.31, 0.085],
      },
    });
    this.terrain.setDetail(g.settings.g.viewDistance);
    this.root.add(this.terrain.group);
    this.root.add(buildRoad(this.map));

    progress?.(0.2, 'Farmhouse');
    const [house, shed, props, cornM] = await Promise.all([assets.load('farmhouse'), assets.load('farm_shed'), assets.load('farm_props'), assets.load('corn')]);
    this.props = props;
    this.house = house;
    house.root.position.set(HOUSE.x, this.map.farmY, HOUSE.z);
    shed.root.position.set(SHED.x, this.map.farmY, SHED.z);
    this.root.add(house.root, shed.root);
    this.root.updateMatrixWorld(true);
    this.phys.addTrimesh(house.colliders);
    this.phys.addTrimesh(shed.colliders);
    this.houseB = new Building('farmhouse', house, this.phys, g.interactions, this.lights);
    this.shedB = new Building('shed', shed, this.phys, g.interactions, this.lights);

    progress?.(0.3, 'Crops');
    this.corn = new Corn(this.map, cornM, g.settings.g.vegetation);
    this.corn.castShadows = g.settings.g.shadowQuality >= 3;
    this.root.add(this.corn.group);

    progress?.(0.36, 'Machinery');
    this.farm = new Farm(g, this.map);
    this.farm.onCut = (x0, z0, x1, z1) => this.corn.invalidate(x0, z0, x1, z1);
    this.corn.harvested = this.farm.isHarvested;
    await this.buildVehicles();
    this.buildYard();
    this.buildRoadside();
    this.bindInteractions();
    progress?.(0.42, 'Neighbours');
    const nb = new Neighbors(this);
    await nb.load();
    this.neighbors = nb;
    this.extensions.push(nb);
    progress?.(0.44, 'Facility');
    this.nasa = new NasaSite(this);
    await this.nasa.load();
    this.extensions.push(this.nasa);

    bus.on('weather:storm', (e: any) => this.farm.setStorm(!!e.active));
    const radioNode = house.marker('equip', 'radio')?.node;
    if (radioNode) (g.services.audio as AudioEngine).loop('static', () => ({ on: this.radioOn && g.zone === this ? 1 : 0 }), () => radioNode.getWorldPosition(this.radioPos), { ref: 1.2 });
    bus.on('farm:manual', (m: Machine) => {
      if (this.driving.vehicle) return;
      this.farm.setManual(m, true);
      this.driving.enter(m.vehicle, m.name);
    });

    // stream the terrain around the spawn point before revealing the world
    const spawn = this.spawnPoint();
    for (let i = 0; i < 400 && !this.terrain.ready; i++) {
      this.terrain.update(spawn);
      progress?.(0.45 + 0.5 * Math.min(1, i / 120), 'Terrain');
      await wait(16);
    }
    this.terrain.ensureCollision(spawn.x, spawn.z, 60);
    for (const v of this.vehicles) this.terrain.ensureCollision(v.position.x, v.position.z, 16);
  }

  // ------------------------------------------------------------------------------------ construction
  private async buildVehicles() {
    const y = this.map.farmY;
    const pm = await assets.load('pickup');
    this.pickup = new WheeledVehicle('pickup', 'pickup', pm, this.phys, this.lights);
    this.pickup.place(HOUSE.x + 12.4, y + 0.55, HOUSE.z + 5.2, 0);
    this.root.add(this.pickup.root);
    this.vehicles.push(this.pickup);
    const defs: [string, string, 'tractor' | 'combine', number, number, number][] = [
      ['tractor_a', 'Tractor 1', 'tractor', -19, 27, Math.PI / 2],
      ['combine_a', 'Combine 1', 'combine', -5, 30, Math.PI],
      ['tractor_b', 'Tractor 2', 'tractor', 12, 28, -Math.PI / 2],
      ['combine_b', 'Combine 2', 'combine', 27, 25, -Math.PI / 2],
    ];
    for (const [id, name, kind, dx, dz, yaw] of defs) {
      const m = await assets.load(kind);
      const v = new WheeledVehicle(id, kind, m, this.phys, this.lights);
      this.root.add(v.root);
      this.vehicles.push(v);
      this.farm.add(id, name, kind, v, { x: FARM.x + dx, z: FARM.z + dz, yaw });
    }
    this.farm.extraObstacles.push(this.pickup);
    // engine and tyre sound for every vehicle
    const audio: AudioEngine = this.game.services.audio;
    for (const v of this.vehicles) {
      const base = v.kind === 'pickup' ? 27 : v.kind === 'tractor' ? 19 : 16;
      audio.loop('engine', () => ({ rpm: v.rpm, load: Math.abs(v.throttle), on: v.engineOn && this.game.zone === this ? 1 : 0, base, gain: v.kind === 'pickup' ? 0.8 : 1.15 }), () => v.position, { ref: v.kind === 'pickup' ? 4 : 7 });
      audio.loop('tyres', () => ({ speed: this.game.zone === this ? Math.abs(v.speed) : 0, rough: 1 }), () => v.position, { ref: 4 });
    }
    this.driving.onExit = (v) => { const m = this.farm.machines.find((x) => x.vehicle === v); if (m) this.farm.setManual(m, false); };
    // live instruments in the pickup
    const gps = pm.marker('screen', 'gps');
    if (gps) this.screens.push(new ScreenSurface(gps.node, gps.data.w, gps.data.h, (ctx, Wd, Hd) => this.drawGps(ctx, Wd, Hd), 384, 1.6));
    const cl = pm.marker('screen', 'cluster');
    if (cl) this.screens.push(new ScreenSurface(cl.node, cl.data.w, cl.data.h, (ctx, Wd, Hd) => this.drawCluster(ctx, Wd, Hd), 512, 1.3));
  }

  private placeProp(part: string, x: number, z: number, yaw = 0, collide = true, dy = 0): THREE.Object3D {
    const src = this.props.part(part);
    if (!src) throw new Error(`missing prop ${part}`);
    const o = src.clone(true);
    o.position.set(x, this.map.height(x, z) + dy, z);
    o.rotation.set(0, yaw, 0);
    this.root.add(o);
    if (collide) {
      o.updateMatrixWorld(true);
      const meshes: THREE.Mesh[] = [];
      o.traverse((m) => { if ((m as THREE.Mesh).isMesh && m.userData.__collide) meshes.push(m as THREE.Mesh); });
      this.phys.addTrimesh(meshes);
    }
    return o;
  }

  /** Many copies of a prop as instanced meshes. Each entry: [x, z, yaw]. */
  instanceProp(part: string | THREE.Object3D, items: [number, number, number][]) {
    const src = typeof part === 'string' ? this.props.part(part) : part;
    if (!src || !items.length) return;
    src.updateWorldMatrix(true, true);
    const inv = new THREE.Matrix4().copy(src.matrixWorld).invert();
    const M = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3(), local = new THREE.Matrix4();
    src.traverse((o) => {
      const me = o as THREE.Mesh;
      if (!me.isMesh) return;
      local.multiplyMatrices(inv, me.matrixWorld);
      const im = new THREE.InstancedMesh(me.geometry, me.material, items.length);
      items.forEach(([x, z, yaw], i) => {
        p.set(x, this.map.height(x, z), z);
        q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, yaw);
        im.setMatrixAt(i, M.compose(p, q, s).multiply(local));
      });
      im.castShadow = true;
      im.receiveShadow = true;
      im.computeBoundingSphere();
      this.root.add(im);
    });
  }

  private buildYard() {
    const fx = FARM.x, fz = FARM.z;
    // reference 2: two blue poly tanks and drifted sand left of the house, propane tank and washing line to the right
    this.placeProp('water_tank', HOUSE.x - 14.5, HOUSE.z - 1.5);
    this.placeProp('water_tank', HOUSE.x - 17.2, HOUSE.z - 0.4, 1.1);
    this.placeProp('sand_pile', HOUSE.x - 11.5, HOUSE.z + 5.5, 0.4, false);
    this.placeProp('sand_pile', HOUSE.x + 4.5, HOUSE.z + 6.2, 2.2, false);
    this.placeProp('sand_pile', HOUSE.x + 16.5, HOUSE.z + 1.0, 4.0, false);
    this.placeProp('propane_tank', HOUSE.x + 20, HOUSE.z - 4.5, 0.25);
    this.placeProp('clothesline', HOUSE.x + 24, HOUSE.z + 3, 1.35, false);
    const tank = this.placeProp('fuel_tank', fx + 51, fz - 9, Math.PI / 2);
    tank.traverse((o) => {
      if (o.userData.kind === 'use') {
        this.game.interactions.node(o, 0.6, () => (this.refuelT > 0 ? `Refuelling… ${Math.ceil(this.refuelT)} s` : 'Refuel the pickup'), () => this.startRefuel(), { range: 3 });
      }
    });
    this.placeProp('grain_bin', fx + 55, fz - 30, 0.6);
    this.placeProp('grain_bin', fx + 59, fz - 40, 2.1);
    this.placeProp('steel_tank', fx - 52, fz + 18, 0);
    this.placeProp('old_harrow', fx - 56, fz + 6, 0.8);
    this.placeProp('hay_bale', SHED.x - 4, SHED.z - 3, 0.2);
    this.placeProp('hay_bale', SHED.x - 4.2, SHED.z - 5.2, 0.5);
    this.placeProp('hay_bale', SHED.x - 6.1, SHED.z - 4.0, 1.9);
    // two grain carts parked with the machinery row (reference 1)
    for (const [dx, dz, yaw] of [[-33, 24, Math.PI / 2], [39, 20, -Math.PI / 2]] as [number, number, number][]) {
      assets.load('grain_cart').then((c) => {
        c.root.position.set(fx + dx, this.map.height(fx + dx, fz + dz), fz + dz);
        c.root.rotation.y = yaw;
        this.root.add(c.root);
        c.root.updateMatrixWorld(true);
        this.phys.addTrimesh(solidMeshes(c.root));
      });
    }
  }

  private buildRoadside() {
    const map = this.map;
    // utility line: from the house out along the lane and the county road
    const poles: [number, number, number][] = [[HOUSE.x + 24, HOUSE.z + 9, 0.3], [FARM.x + 44, FARM.z + 44, 0.6]];
    for (let s = 150; s < map.roadLength - 260; s += 82) {
      const r = map.roadAt(s);
      const side = s < 2600 ? -1 : 1;
      poles.push([r.x + -r.tz * side * (r.w / 2 + 6.5), r.z + r.tx * side * (r.w / 2 + 6.5), Math.atan2(-r.tx, -r.tz)]);
    }
    this.instanceProp('pole', poles.filter((_, i) => i % 5 !== 2));
    this.instanceProp('pole_tx', poles.filter((_, i) => i % 5 === 2));
    // wires with a catenary sag
    const wp: number[] = [];
    const top = 8.46;
    for (let i = 0; i < poles.length - 1; i++) {
      const a = poles[i], b = poles[i + 1];
      const ya = map.height(a[0], a[1]) + top, yb = map.height(b[0], b[1]) + top;
      for (const off of [-1.0, 0.35, 1.0]) {
        const ax = a[0] + Math.cos(a[2]) * off, az = a[1] - Math.sin(a[2]) * off, bx = b[0] + Math.cos(b[2]) * off, bz = b[1] - Math.sin(b[2]) * off;
        const N = 8;
        for (let k = 0; k < N; k++) {
          const t0 = k / N, t1 = (k + 1) / N;
          const sag = (t: number) => -1.3 * 4 * t * (1 - t);
          wp.push(lerp(ax, bx, t0), lerp(ya, yb, t0) + sag(t0), lerp(az, bz, t0), lerp(ax, bx, t1), lerp(ya, yb, t1) + sag(t1), lerp(az, bz, t1));
        }
      }
    }
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.Float32BufferAttribute(wp, 3));
    const wires = new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: 0x15140f, transparent: true, opacity: 0.85 }));
    wires.frustumCulled = false;
    this.root.add(wires);
    // wire fence along stretches of the lane and road
    const fence: [number, number, number][] = [];
    for (let s = 70; s < 2300; s += 2.5) {
      const band = Math.floor(s / 260) % 3;
      if (band === 2) continue;
      const r = map.roadAt(s);
      for (const side of band === 0 ? [-1, 1] : [1]) {
        fence.push([r.x + -r.tz * side * (r.w / 2 + 9.5), r.z + r.tx * side * (r.w / 2 + 9.5), Math.atan2(-r.tz * 1, r.tx * 1) + Math.PI / 2 + (side > 0 ? 0 : 0)]);
      }
    }
    for (const f of fence) { const r = map.roadQuery(f[0], f[1]); if (r) { const rs = map.road[r.i]; f[2] = Math.atan2(-rs.tz, rs.tx); } }
    this.instanceProp('fence', fence);
    // lane end: mailbox; facility approach: closed-road sign
    const j = map.roadAt(318);
    this.placeProp('mailbox', j.x + -j.tz * 5.2, j.z + j.tx * 5.2, Math.atan2(-j.tx, -j.tz) + Math.PI / 2);
    const c = map.roadAt(map.roadLength - 520);
    this.placeProp('sign_closed', c.x + -c.tz * 5.4, c.z + c.tx * 5.4, Math.atan2(c.tx, c.tz), false);
    for (const s of [900, 2100, 3300, 4300, 4900]) {
      const r = map.roadAt(s);
      this.placeProp('sign_warning', r.x + -r.tz * -4.6, r.z + r.tx * -4.6, Math.atan2(r.tx, r.tz), false);
    }
    // the neighbouring yards
    for (const st of map.sites) this.buildSite(st.id, st.x, st.z, st.yaw);
  }

  private async buildSite(id: string, x: number, z: number, yaw: number) {
    const rot = (dx: number, dz: number): [number, number] => [x + dx * Math.cos(yaw) + dz * Math.sin(yaw), z - dx * Math.sin(yaw) + dz * Math.cos(yaw)];
    const put = (part: string, dx: number, dz: number, a = 0, col = true) => { const [px, pz] = rot(dx, dz); return this.placeProp(part, px, pz, yaw + a, col); };
    const building = async (model: string, dx: number, dz: number, a = 0) => {
      const m = await assets.load(model);
      const [px, pz] = rot(dx, dz);
      m.root.position.set(px, this.map.height(px, pz), pz);
      m.root.rotation.y = yaw + a;
      // neighbours' buildings are exteriors only: no interior furnishings, simple collision
      const interior = m.part('interior');
      if (interior) interior.visible = false;
      this.root.add(m.root);
      m.root.updateMatrixWorld(true);
      this.phys.addTrimesh(m.colliders);
      return m;
    };
    if (id === 'heller') {
      await building('farmhouse', -4, -6, 0);
      await building('farm_shed', 12, -10, 0);
      put('grain_bin', -22, -8); put('water_tank', -15, 2); put('propane_tank', 14, 6, 0.4); put('hay_bale', 20, 4); put('old_harrow', -24, 10, 0.5);
    } else if (id === 'mill') {
      await building('farm_shed', -30, -14, 0);
      await building('farm_shed', -10, -16, 0);
      await building('farmhouse', 18, -12, 0);
      put('grain_bin', -40, 6); put('grain_bin', -34, 16, 1.0); put('grain_bin', -44, 20, 2.0);
      put('fuel_tank', 4, 2, 1.2); put('steel_tank', 10, 6); put('water_tank', 30, -4); put('hay_bale', -2, 18); put('hay_bale', 0.2, 19.6, 0.8); put('clothesline', 34, 6, 0.3, false);
      const cart = await assets.load('grain_cart');
      const [cx, cz] = rot(-20, 22);
      cart.root.position.set(cx, this.map.height(cx, cz), cz);
      cart.root.rotation.y = yaw + 0.7;
      this.root.add(cart.root);
      cart.root.updateMatrixWorld(true);
      this.phys.addTrimesh(solidMeshes(cart.root));
    } else if (id === 'wreck') {
      put('old_harrow', 0, 0, 0.3); put('old_harrow', 7, 4, 1.9); put('steel_tank', -8, 3); put('hay_bale', 4, -7); put('sand_pile', -3, -5, 0, false); put('sand_pile', 9, -2, 1.0, false);
    }
    bus.emit('site:built', id);
  }

  private bindInteractions() {
    const g = this.game, I = g.interactions;
    // pickup: get in at the driver's door
    const seat = this.pickup.model.marker('seat', 'driver')!;
    I.node(seat.node, 1.25, 'Drive the pickup', () => this.driving.enter(this.pickup, 'Pickup'), { range: 3.4, enabled: () => !this.driving.vehicle });
    // machines: command interface and manual control
    for (const m of this.farm.machines) {
      const v = m.vehicle;
      I.add({
        position: (out) => out.copy(v.root.position).setY(v.root.position.y + 1.7),
        radius: 2.6, range: 6.5,
        label: () => `${m.name} — machine controls`,
        use: () => g.openPanel('farm', { machine: m.id }),
        enabled: () => !this.driving.vehicle,
      });
      const ms = v.model.marker('seat', 'driver');
      if (ms) I.node(ms.node, 1.3, () => `${m.name} — take manual control`, () => bus.emit('farm:manual', m), { range: 5.2, enabled: () => !this.driving.vehicle });
    }
    const term = this.house.marker('terminal', 'farm_office');
    if (term) I.node(term.node, 0.45, 'Farm management computer', () => g.openPanel('farm'), { range: 2.2 });
    const radio = this.house.marker('equip', 'radio');
    if (radio) I.node(radio.node, 0.3, () => (this.radioOn ? 'Switch the radio off' : 'Switch the radio on'), () => { this.radioOn = !this.radioOn; this.radioTimer = 1.5; bus.emit('radio', { on: this.radioOn, node: radio.node }); bus.emit('sfx', { id: 'switch', node: radio.node }); }, { range: 2.2 });
    const tv = this.house.marker('equip', 'tv');
    if (tv) I.node(tv.node, 0.4, 'Television — no signal', () => ui.toast('Nothing but static. The last broadcaster went off the air years ago.', 'info', 4), { range: 2.4 });
    const bed = this.house.marker('bed', 'cooper');
    if (bed) I.node(bed.node, 0.9, 'Rest until morning', () => this.rest(), { range: 2.4 });
  }

  private rest() {
    const g = this.game;
    g.renderer.fadeTo(1, 2.5);
    setTimeout(() => {
      const w = this.weather;
      const dtHours = ((6.6 - w.hours + 24) % 24) || 24;
      w.hours = 6.6;
      w.day += w.hours < 6.6 ? 1 : 0;
      bus.emit('clock:advance', dtHours * 3600);
      this.sky.invalidate();
      g.renderer.fadeTo(0, 0.8);
      ui.toast(`You slept ${dtHours.toFixed(1)} hours. Morning light over the fields.`, 'info', 5);
    }, 1400);
  }

  private startRefuel() {
    if (this.refuelT > 0) return;
    if (this.pickup.position.distanceTo(this.tmp.set(FARM.x + 51, this.pickup.position.y, FARM.z - 9)) > 16) { ui.toast('Bring the pickup alongside the diesel tank first.', 'warn', 3); return; }
    this.refuelT = 10;
    bus.emit('sfx', { id: 'refuel', node: this.pickup.root });
  }

  // ------------------------------------------------------------------------------------ instruments
  /** Distance still to drive to the facility gate along the road, from any position. */
  routeDistance(p: THREE.Vector3) {
    const gateS = this.map.roadLength - 112;
    const q = this.map.roadQuery(p.x, p.z);
    if (q) return Math.max(0, gateS - q.s) + q.d;
    // off the road: nearest road sample by coarse search
    let best = 1e9, bs = 0;
    for (let i = 0; i < this.map.road.length; i += 12) { const r = this.map.road[i]; const d = Math.hypot(r.x - p.x, r.z - p.z); if (d < best) { best = d; bs = r.s; } }
    return Math.max(0, gateS - bs) + best;
  }

  private drawGps(ctx: CanvasRenderingContext2D, Wd: number, Hd: number) {
    const v = this.pickup;
    scr.bg(ctx, Wd, Hd, '#06090a');
    const p = v.position, yaw = v.yaw;
    const scale = Wd / 520; // metres -> px (520 m across)
    ctx.save();
    ctx.translate(Wd / 2, Hd * 0.62);
    ctx.rotate(yaw);
    // route ahead/behind
    const q = this.map.roadQuery(p.x, p.z);
    const i0 = q ? q.i : 0;
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#2a3b3d';
    ctx.beginPath();
    const R = this.map.road;
    for (let i = Math.max(0, i0 - 160); i < Math.min(R.length, i0 + 260); i += 4) {
      const x = (R[i].x - p.x) * scale, y = (R[i].z - p.z) * scale;
      if (i === Math.max(0, i0 - 160)) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#7fd6cf';
    ctx.beginPath();
    for (let i = i0; i < Math.min(R.length, i0 + 260); i += 4) {
      const x = (R[i].x - p.x) * scale, y = (R[i].z - p.z) * scale;
      if (i === i0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
    // vehicle marker
    ctx.fillStyle = '#e2c48a';
    ctx.beginPath(); ctx.moveTo(Wd / 2, Hd * 0.62 - 9); ctx.lineTo(Wd / 2 + 6, Hd * 0.62 + 7); ctx.lineTo(Wd / 2 - 6, Hd * 0.62 + 7); ctx.closePath(); ctx.fill();
    // destination banner
    ctx.fillStyle = 'rgba(6,9,10,0.82)';
    ctx.fillRect(0, 0, Wd, Hd * 0.3);
    const d = this.routeDistance(p);
    scr.text(ctx, 'NASA RESEARCH FACILITY', 10, Hd * 0.1, Hd * 0.085, '#e9e6df', 'left', '600');
    scr.mono(ctx, `${(d / 1000).toFixed(1)} KM`, Wd - 10, Hd * 0.11, Hd * 0.11, '#7fd6cf', 'right');
    scr.text(ctx, d < 60 ? 'ARRIVED — PARK AND PROCEED ON FOOT' : 'FOLLOW COUNTY ROAD', 10, Hd * 0.23, Hd * 0.06, '#9a968d');
    scr.frame(ctx, 0, 0, Wd, Hd);
  }

  private drawCluster(ctx: CanvasRenderingContext2D, Wd: number, Hd: number) {
    const v = this.pickup;
    scr.bg(ctx, Wd, Hd, '#030405');
    if (!v.engineOn) return;
    const kmh = Math.abs(v.speed) * 3.6;
    const dial = (cx: number, f: number, label: string, val: string) => {
      const r = Hd * 0.42, cy = Hd * 0.56;
      ctx.strokeStyle = 'rgba(233,230,223,0.35)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI * 0.8, Math.PI * 2.2); ctx.stroke();
      for (let i = 0; i <= 8; i++) { const a = Math.PI * (0.8 + 1.4 * (i / 8)); ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r * 0.86, cy + Math.sin(a) * r * 0.86); ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); ctx.stroke(); }
      const a = Math.PI * (0.8 + 1.4 * Math.min(1, f));
      ctx.strokeStyle = '#e07b53'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * r * 0.8, cy + Math.sin(a) * r * 0.8); ctx.stroke();
      scr.mono(ctx, val, cx, cy + r * 0.45, Hd * 0.16, '#e9e6df', 'center');
      scr.text(ctx, label, cx, cy - r * 0.35, Hd * 0.09, '#9a968d', 'center');
    };
    dial(Wd * 0.27, kmh / 160, 'KM/H', kmh.toFixed(0));
    dial(Wd * 0.73, v.rpm, 'RPM x1000', (v.rpm * 5).toFixed(1));
    const ff = v.fuel / v.tuning.fuelCapacity;
    scr.text(ctx, 'FUEL', Wd * 0.5, Hd * 0.2, Hd * 0.08, '#9a968d', 'center');
    scr.bar(ctx, Wd * 0.43, Hd * 0.3, Wd * 0.14, Hd * 0.06, ff, ff < 0.15 ? '#e07b53' : '#e2c48a');
    scr.mono(ctx, v.speed < -0.3 ? 'R' : v.handbrake ? 'P' : 'D', Wd * 0.5, Hd * 0.62, Hd * 0.24, '#7fd6cf', 'center');
    if (v.lightsOn) scr.text(ctx, 'LIGHTS', Wd * 0.5, Hd * 0.86, Hd * 0.08, '#8fc7a0', 'center');
  }

  // ------------------------------------------------------------------------------------ zone lifecycle
  spawnPoint(out = new THREE.Vector3()) {
    const p = this.house.markerPose('spawn', 'farm');
    if (p) out.copy(p.pos); else out.set(HOUSE.x, 0, HOUSE.z + 10);
    out.y = this.map.height(out.x, out.z) + 0.05;
    return out;
  }

  /** Ranger 1 back from space, standing on the landing field by the NASA gate (boarding it returns to its cockpit) */
  landedRanger: Model | null = null;
  async showLandedRanger(on: boolean) {
    if (on && !this.landedRanger) {
      const m = await assets.load('ranger');
      const L = LANDING_FIELD;
      m.root.position.set(L.x, this.map.height(L.x, L.z) + 1.1, L.z);
      this.root.add(m.root);
      m.root.updateMatrixWorld(true);
      // the hull pieces and the gear legs it stands on
      const gear: THREE.Mesh[] = [];
      for (const g of m.ofKind('gear')) g.node.traverse((o) => { if ((o as THREE.Mesh).isMesh) gear.push(o as THREE.Mesh); });
      this.phys.addTrimesh([...m.colliders, ...gear]);
      this.game.interactions.node(m.root, 7, 'Board Ranger 1', () => bus.emit('ranger:board', 'earth'), { range: 9 } as any);
      this.landedRanger = m;
    }
    if (this.landedRanger) this.landedRanger.root.visible = on;
  }

  override enter() {
    super.enter();
    this.game.renderer.setLook({ exposure: 1.0 }, true);
    this.game.interactions.occlusion = (o, d, max) => { const h = this.phys.raycast(o, d, max, groups(0xffff, GROUP.WORLD)); return h ? h.dist : null; };
    this.sky.setVisible(true);
  }

  override leave() {
    super.leave();
    this.sky.setVisible(false);
  }

  override fixedUpdate(dt: number) {
    const p = this.game.player.pos;
    this.terrain.ensureCollision(p.x, p.z, 26);
    for (const v of this.vehicles) {
      if (v.mode === 'dynamic') this.terrain.ensureCollision(v.position.x, v.position.z, 14 + Math.abs(v.speed) * 1.2);
      v.fixedUpdate(dt);
    }
    this.farm.fixedUpdate(dt);
    // wading through standing corn slows you down
    const pl = this.game.player;
    const inCrop = pl.mode === 'walk' && this.corn.inCrop(p.x, p.z);
    this.cropNear = damp(this.cropNear, inCrop ? 1 : this.map.cornDensity(p.x + 9, p.z) + this.map.cornDensity(p.x - 9, p.z) + this.map.cornDensity(p.x, p.z + 9) + this.map.cornDensity(p.x, p.z - 9) > 0.5 ? 0.6 : 0, 2, dt);
    pl.speedScale = damp(pl.speedScale, inCrop ? 0.7 : 1, 6, dt);
    pl.surface = inCrop ? 'crop' : this.indoors > 0.5 ? 'wood' : 'dirt';
    if (this.refuelT > 0) {
      this.refuelT -= dt;
      this.pickup.fuel = Math.min(this.pickup.tuning.fuelCapacity, this.pickup.fuel + (this.pickup.tuning.fuelCapacity / 10) * dt);
      if (this.refuelT <= 0) ui.toast('Pickup refuelled.', 'good', 3);
    }
    for (const e of this.extensions) e.fixedUpdate?.(dt);
  }

  override update(dt: number) {
    const g = this.game;
    const cam = g.renderer.camera;
    cam.getWorldPosition(this.tmp);
    const camPos = this.tmp;
    this.terrain.update(camPos);
    this.corn.update(camPos);
    for (const v of this.vehicles) v.update(dt, g.alpha);
    this.houseB.update(dt);
    this.shedB.update(dt);
    // weather vane turns into the wind
    const vane = this.house.part('vane');
    if (vane) vane.rotation.y = damp(vane.rotation.y, Math.atan2(-this.weather.windDir.y, this.weather.windDir.x) + Math.sin(g.time * 0.7) * 0.15 * this.weather.wind, 1.2, dt);
    const ground = this.map.height(camPos.x, camPos.z);
    // indoors? (drives eye adaptation, hides wind-borne dust)
    this.indoorTimer -= dt;
    if (this.indoorTimer <= 0) {
      this.indoorTimer = 0.2;
      const hit = this.phys.raycast({ x: camPos.x, y: camPos.y + 0.1, z: camPos.z }, { x: 0, y: 1, z: 0 }, 9, groups(0xffff, GROUP.WORLD));
      (this as any)._inT = hit ? 1 : 0;
    }
    this.underground = damp(this.underground, camPos.y < ground - 2.5 ? 1 : 0, 3.5, dt);
    this.indoors = Math.max(damp(this.indoors, (this as any)._inT ?? 0, 3, dt), this.underground);
    this.weather.indoors = this.indoors;
    this.weather.update(dt, camPos, ground);
    // no sunlight or weather haze inside the mountain
    this.sky.sunOcclusion *= 1 - this.underground;
    W.uFogP.value.x *= 1 - 0.98 * this.underground;
    const interior = this.house.part('interior');
    if (interior) interior.visible = camPos.distanceTo(this.house.root.position) < 90;
    this.lights.update(camPos, dt);
    W.uWind.value.z += dt;
    W.uPlayer.value.copy(g.player.pos);
    this.sky.shadowFocus.copy(this.driving.vehicle ? this.driving.vehicle.position : g.player.pos);
    this.sky.shadowRange = this.driving.vehicle ? 70 : lerp(55, 26, this.indoors);
    this.sky.update(dt, camPos, Math.max(2, camPos.y - ground + 600));
    // eye adaptation: dim interiors, storm darkness, night
    const night = smoothstep(0.12, -0.08, this.sky.sunDir.y);
    const k = this.weather.intensity;
    this.tint[0] = lerp(1.03, 1.0, k); this.tint[1] = lerp(1.0, 0.8, k); this.tint[2] = lerp(0.93, 0.55, k);
    g.renderer.setLook({ exposure: lerp(this.weather.exposure * lerp(1, 2.3, this.indoors) * lerp(1, 5.5, night), 1.25, this.underground), saturation: lerp(1.2, 1.05, k), contrast: 1.25, tint: this.tint });
    // instruments, radio
    const inTruck = this.driving.vehicle === this.pickup;
    for (const s of this.screens) s.update(dt, camPos.distanceTo(this.pickup.position) < 12);
    this.gpsTimer -= dt;
    if (this.gpsTimer <= 0) {
      this.gpsTimer = 0.25;
      ui.set({ gps: inTruck ? { name: 'NASA Research Facility', dist: this.routeDistance(this.pickup.position) } : null });
    }
    if (this.radioOn) {
      this.radioTimer -= dt;
      if (this.radioTimer <= 0 && camPos.distanceTo(this.house.root.position) < 30) {
        const line = RADIO_LINES[this.radioIdx++ % RADIO_LINES.length];
        this.radioTimer = ui.say('Radio', line) + 9;
      }
    }
    for (const e of this.extensions) e.update?.(dt);
  }

  override groundHeight(x: number, z: number) { return this.map.height(x, z); }

  override soundscape(o: Soundscape) {
    const w = this.weather, p = this.game.player.pos;
    const driving = !!this.driving.vehicle;
    const cabin = driving ? 0.55 : 0;
    o.wind = clamp(w.wind * 0.55 + w.intensity * 0.5, 0, 1);
    o.dust = w.intensity;
    o.indoors = Math.max(this.indoors, cabin);
    o.rustle = this.cropNear * clamp(0.25 + w.wind * 0.6, 0, 1) * 0.6;
    o.hum = 0; o.air = 0; o.water = 0; o.vacuum = 0; o.helmet = 0;
    o.rumble = w.intensity * 0.35;
    o.reverb = this.underground > 0.5 ? 'hall' : this.indoors > 0.5 ? 'room' : 'open';
    if (this.underground > 0.5) { o.wind = 0; o.dust = 0; o.rustle = 0; o.rumble = 0; o.hum = 0.5; o.air = 0.35; }
    const nasa = Math.hypot(p.x - NASA.portal.x, p.z - NASA.portal.z) < 420;
    o.music = w.storm === 'arriving' || w.storm === 'peak' ? 'storm' : nasa ? 'nasa' : driving ? 'road' : 'farm';
    o.intensity = w.storm !== 'none' ? 0.4 + 0.6 * w.intensity : driving ? clamp(Math.abs(this.driving.vehicle!.speed) / 26, 0.2, 0.8) : 0.35;
    return o;
  }

  override locationName() {
    const p = this.driving.vehicle ? this.driving.vehicle.position : this.game.player.pos;
    const area = this.nasa?.area(p);
    if (area) return area;
    if (this.indoors > 0.6 && p.distanceTo(this.house.root.position) < 26) return 'Farmhouse';
    if (Math.hypot(p.x - FARM.x, p.z - FARM.z) < 420) return 'The Farm';
    if (Math.hypot(p.x - NASA.portal.x, p.z - NASA.portal.z) < 260) return 'NASA Research Facility';
    const st = this.map.siteAt(p.x, p.z);
    if (st) return st.name;
    return 'County Road';
  }

  override serialize() {
    const ext: Record<string, any> = {};
    for (const e of this.extensions) if (e.serialize) ext[e.id] = e.serialize();
    return { weather: this.weather.serialize(), farm: this.farm.serialize(), house: this.houseB.serialize(), shed: this.shedB.serialize(), pickup: this.pickup.serialize(), ext };
  }

  override deserialize(d: any) {
    if (!d) return;
    this.weather.deserialize(d.weather);
    this.farm.deserialize(d.farm);
    this.houseB.deserialize(d.house);
    this.shedB.deserialize(d.shed);
    this.pickup.deserialize(d.pickup);
    this.corn.version++;
    for (const e of this.extensions) if (e.deserialize && d.ext?.[e.id]) e.deserialize(d.ext[e.id]);
  }
}

/** every visible mesh of a parked machine (its parts are authored non-colliding for when it is a vehicle) */
function solidMeshes(root: THREE.Object3D) {
  const out: THREE.Mesh[] = [];
  root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && m.visible && !(m.material as THREE.Material).transparent) out.push(m); });
  return out;
}
