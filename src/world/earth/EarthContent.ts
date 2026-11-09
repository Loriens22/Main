import * as THREE from 'three';
import type EarthZone from '../zones/EarthZone';
import { Site } from '../Site';
import { LightPool } from '../../render/LightPool';
import { FARM_SPAWN, NEIGHBOURS, NASA } from '../../data/earthLayout';
import type { Surface } from '../Frame';
import type { MusicMood } from '../../audio/Audio';
import type { SpawnSpec } from '../Zone';
import { FARM_TEXTS } from '../../data/texts';

export interface EarthSubsystem {
  update(dt: number, dtEarth: number): void;
  writeState?(): void;
  dispose?(): void;
  onSettingsChanged?(): void;
}

/**
 * Everything placed on the Earth zone: farmstead, neighbours, NASA facility, vehicles, corn, NPCs, weather.
 */
export class EarthContent {
  farm: Site | null = null;
  neighbours: THREE.Object3D[] = [];
  readonly lightPool: LightPool;
  readonly subsystems: EarthSubsystem[] = [];
  readonly sites: Site[] = [];
  farmY = 0;
  indoorRoom: string | null = null;
  private tvOn = false;

  constructor(readonly zone: EarthZone) {
    this.lightPool = new LightPool(zone.scene, zone.game.settings.graphics.shadowQuality >= 2 ? 8 : 5);
  }

  get game() {
    return this.zone.game;
  }

  async load(progress: (p: number, m: string) => void) {
    const game = this.game;
    const z = this.zone;
    progress(0.05, 'farmstead');
    this.farmY = z.height(0, 0);
    const farmInst = await game.assets.instance('farm');
    const place = new THREE.Matrix4().makeTranslation(0, this.farmY, 0);
    this.farm = new Site(game, farmInst, {
      name: 'farm',
      frame: z.ground,
      parent: z.scene,
      placement: place,
      lightPool: this.lightPool,
      doorSound: 'wood',
      groupsOn: ['kitchen', 'office'],
      handlers: {
        tv: (n) => ({
          id: 'farm_tv', targets: [n], label: () => (this.tvOn ? 'Turn off TV' : 'Watch the news'),
          use: () => {
            this.tvOn = !this.tvOn;
            if (this.tvOn) {
              const t = FARM_TEXTS.news[Math.floor(Math.random() * FARM_TEXTS.news.length)];
              game.say('capcom', t, 10);
            }
          },
        }),
        radio: (n) => ({ id: 'farm_radio', targets: [n], label: () => 'Listen to the farm radio', use: () => game.say('capcom', FARM_TEXTS.radio[Math.floor(Math.random() * FARM_TEXTS.radio.length)], 9) }),
        computer: (n) => ({ id: 'farm_comp', targets: [n], label: () => 'Farm records terminal', use: () => this.openFarmRecords() }),
        inspect: (n) => ({
          id: 'bookshelf', targets: [n], label: () => 'Inspect bookshelf',
          use: () => {
            game.notify(FARM_TEXTS.bookshelf, 'info', 8);
            if (!game.state.discoveries.includes('The bookshelf')) game.state.discoveries.push('The bookshelf');
          },
        }),
        fuel: (n) => ({
          id: 'farm_fuel', targets: [n], label: () => 'Farm diesel tank — refuel nearby vehicles',
          use: () => (this as any).vehicles?.refuelNear(this.farm!.localPos(n), 12),
        }),
        mailbox: (n) => ({ id: 'farm_mail', targets: [n], label: () => 'Check mailbox', use: () => game.notify(FARM_TEXTS.mail, 'info', 9) }),
      },
    });
    this.sites.push(this.farm);
    progress(0.3, 'neighbouring farms');
    for (const nb of NEIGHBOURS) {
      const inst = await game.assets.instance('neighbor_house');
      const y = z.height(nb.pos[0], nb.pos[2]);
      const m = new THREE.Matrix4().compose(new THREE.Vector3(nb.pos[0], y, nb.pos[2]), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), nb.yaw), new THREE.Vector3(1, 1, 1));
      const s = new Site(game, inst, { name: nb.id, frame: z.ground, parent: z.scene, placement: m, groupsOn: nb.id === 'abandoned' ? [] : ['porch'] });
      this.sites.push(s);
    }
    // subsystems are loaded lazily so a missing asset never blocks the zone
    const loaders: [string, () => Promise<EarthSubsystem | null>][] = [
      ['corn', async () => new (await import('./Corn')).CornFields(this)],
      ['vehicles', async () => { const v = new (await import('./GroundVehicles')).GroundVehicles(this); await v.load(); (this as any).vehicles = v; return v; }],
      ['facility', async () => { const n = new (await import('./NasaSite')).NasaSite(this); await n.load(); (this as any).nasa = n; return n; }],
      ['people', async () => { const n = new (await import('./EarthPeople')).EarthPeople(this); await n.load(); (this as any).people = n; return n; }],
      ['weather', async () => new (await import('./Weather')).Weather(this)],
    ];
    let i = 0;
    for (const [name, fn] of loaders) {
      progress(0.35 + (i++ / loaders.length) * 0.6, name);
      try {
        const s = await fn();
        if (s) this.subsystems.push(s);
      } catch (e) {
        console.error(`[earth] subsystem ${name} failed`, e);
      }
    }
  }

  spawnAt(at: string): boolean {
    const p = this.game.player;
    const g = this.zone.ground;
    if (at === 'farm') {
      const s = new THREE.Vector3(...FARM_SPAWN.pos);
      s.y = this.zone.height(s.x, s.z) + 0.05;
      p.enterFrame(g, s, FARM_SPAWN.yaw);
      return true;
    }
    if (at === 'nasa' || at === 'nasa_gate') {
      const nasa = (this as any).nasa;
      if (nasa?.spawn(at)) return true;
      const pos = new THREE.Vector3(NASA.portal.x, 0, NASA.portal.z + 40);
      pos.y = this.zone.height(pos.x, pos.z) + 0.05;
      p.enterFrame(g, pos, 0);
      return true;
    }
    for (const s of this.subsystems) if ((s as any).spawnAt?.(at)) return true;
    return false;
  }

  spawnInFrame(spec: SpawnSpec): boolean {
    for (const s of this.subsystems) if ((s as any).spawnInFrame?.(spec)) return true;
    return false;
  }

  /** Surface type under a frame-local point inside buildings (null outside). */
  interiorSurface(p: THREE.Vector3): Surface | null {
    for (const s of this.sites) {
      const r = s.roomAt(p);
      if (r) return r === 'garage' || r === 'barn' ? 'concrete' : 'wood';
    }
    const n = (this as any).nasa;
    if (n?.contains?.(p)) return n.surfaceAt(p);
    // porch deck
    if (p.y > this.farmY + 0.3 && Math.abs(p.x + 2.7) < 9.6 && p.z > 4.3 && p.z < 7.2) return 'wood';
    return null;
  }

  isIndoors(): boolean {
    return this.indoorRoom !== null;
  }

  interiorExposure(): number {
    if (!this.indoorRoom) return 1;
    return this.indoorRoom.startsWith('nasa') ? 0.35 : 0.55;
  }

  musicMood(): MusicMood {
    const n = (this as any).nasa;
    if (n?.musicMood) {
      const m = n.musicMood();
      if (m) return m;
    }
    return 'earth';
  }

  describeHere(): { name: string; sub: string } | null {
    const n = (this as any).nasa;
    if (n?.describeHere) {
      const d = n.describeHere();
      if (d) return d;
    }
    const pos = this.game.player.pos;
    if (Math.hypot(pos.x, pos.z) < 80) return { name: 'THE FARM', sub: this.indoorRoom ? `Farmhouse · ${this.indoorRoom}` : 'Eastern plains, Colorado' };
    return { name: 'COUNTY ROAD 9', sub: `${(Math.hypot(pos.x - NASA.portal.x, pos.z - NASA.portal.z) / 1000).toFixed(1)} km to the facility` };
  }

  update(dt: number, dtEarth: number) {
    for (const s of this.sites) s.update(dt);
    // indoor detection
    const p = this.game.player;
    this.indoorRoom = null;
    if (p.frame === this.zone.ground) {
      const eye = p.pos.clone().add(new THREE.Vector3(0, 1.2, 0));
      for (const s of this.sites) {
        const r = s.roomAt(eye);
        if (r) {
          this.indoorRoom = r;
          break;
        }
      }
      const n = (this as any).nasa;
      if (!this.indoorRoom && n?.contains?.(eye)) this.indoorRoom = 'nasa';
    }
    for (const s of this.subsystems) {
      try {
        s.update(dt, dtEarth);
      } catch (e) {
        console.error('[earth] subsystem update failed', e);
      }
    }
    this.lightPool.update(dt, this.game.camera.position);
  }

  focusXZ(): THREE.Vector2 | null {
    const v = (this as any).vehicles;
    return v?.focusXZ?.() ?? null;
  }

  onSettingsChanged() {
    for (const s of this.subsystems) s.onSettingsChanged?.();
  }

  writeState() {
    for (const s of this.subsystems) s.writeState?.();
  }

  recover() {
    const v = (this as any).vehicles;
    v?.recover?.();
  }

  computerTabs() {
    const n = (this as any).nasa;
    return n?.computerTabs?.() ?? [];
  }

  objectives(): [string, boolean][] {
    const f = this.game.state.flags;
    return [
      ['Explore the farmhouse', !!f.visitedHouse],
      ['Give a command to an autonomous tractor', !!f.commandedTractor],
      ['Drive to the NASA facility (6 km)', !!f.reachedNasa],
      ['Enter the underground complex', !!f.enteredNasa],
      ['Visit mission control', !!f.visitedMissionControl],
      ['Decide the future of the mission', this.game.state.mission.decision !== 'undecided'],
    ];
  }

  fastTravel(): [string, () => void][] {
    const g = this.game;
    return [
      ['THE FARM', () => g.goTo('earth', { at: 'farm' })],
      ['NASA FACILITY ENTRANCE', () => g.goTo('earth', { at: 'nasa' })],
      ['NASA MISSION CONTROL', () => g.goTo('earth', { at: 'nasa_mc' })],
      ['RANGER 1 (LAUNCH SILO)', () => g.goTo('earth', { at: 'nasa_silo' })],
    ];
  }

  private openFarmRecords() {
    const g = this.game;
    g.input.releaseLock();
    g.ui.openPanel('FARM RECORDS', (b) => {
      const st = g.state;
      const lines = FARM_TEXTS.records.map((r) => `<div style="padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.06)">${r}</div>`).join('');
      const harvest = st.farm.harvest.map((h, i) => `Field ${i + 1}: ${(h * 100).toFixed(0)}% harvested`).join('<br>');
      b.innerHTML = `<div class="grid2"><div class="card"><h3>YIELD LOG</h3>${lines}</div><div class="card"><h3>THIS SEASON</h3><div class="mono" style="font-size:12px;line-height:1.7">${harvest}</div></div></div>`;
    });
  }
}
