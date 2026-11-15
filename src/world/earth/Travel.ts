import * as THREE from 'three';
import type { EarthContent } from './EarthContent';
import { NASA, FARM_VEHICLE_SPOTS } from '../../data/earthLayout';
import type { GroundVehicle } from './GroundVehicles';
import { h } from '../../ui/UI';

/** straight-line distance farm yard → NASA portal (the road is longer) */
const FARM_TO_NASA = Math.hypot(NASA.portal.x, NASA.portal.z);
/** average speed over the gravel county road and the mountain access road */
const ROAD_SPEED = 13.9; // m/s ≈ 50 km/h

export interface TravelOption {
  dest: 'nasa' | 'farm';
  label: string;
  minutes: number;
}

/**
 * Skip the drive between the farm and the NASA base (about 6 km of road), either way, on foot or at the wheel of the
 * pickup (it comes along and is parked at the other end). The clock advances by the time the drive would have taken.
 * Offered while the destination is more than 400 m away: a button on screen (J with a keyboard, a touch button on a
 * phone) and an entry in the pause menu.
 */
export class EarthTravel {
  private busy = false;
  private chip: HTMLButtonElement;
  private chipT = 0;
  private routeLen = 0;

  constructor(readonly content: EarthContent) {
    this.chip = h('button', { class: 'travel-chip interactive', onclick: () => void this.go() }) as HTMLButtonElement;
    this.chip.style.display = 'none';
    content.game.ui.root.append(this.chip);
  }

  get game() {
    return this.content.game;
  }

  /** the ground vehicle you are driving, if any (a type-only import keeps the vehicles in their own lazy chunk) */
  private car(): GroundVehicle | null {
    const list = (this.content as unknown as { vehicles?: { list: GroundVehicle[] } }).vehicles?.list ?? [];
    const c = this.game.control as unknown as GroundVehicle | null;
    return c && list.includes(c) ? c : null;
  }

  /** where a skip would take you from here, or null when it is not offered right now (ignoreUi: the pause menu asks) */
  option(ignoreUi = false): TravelOption | null {
    const game = this.game;
    if (this.busy || game.phase !== 'playing' || game.cinematic || (!ignoreUi && (game.ui.panelOpen || game.ui.dialogueOpen))) return null;
    const z = this.content.zone;
    const car = this.car();
    if (game.control && !car) return null; // flying, or strapped into the launch vehicle
    if (!car && game.player.frame !== z.ground) return null;
    const p = car ? car.root.position : game.player.pos;
    const dFarm = Math.hypot(p.x, p.z);
    const dNasa = Math.hypot(p.x - NASA.portal.x, p.z - NASA.portal.z);
    const dest = dFarm < dNasa ? 'nasa' : 'farm';
    const dist = dest === 'nasa' ? dNasa : dFarm;
    if (dist < 400) return null;
    return { dest, label: dest === 'nasa' ? 'the NASA base' : 'the farm', minutes: Math.max(1, Math.round(this.seconds(dist) / 60)) };
  }

  /** how long the drive takes from a point `straight` metres from the destination */
  private seconds(straight: number) {
    if (!this.routeLen) for (const r of this.content.zone.gen.roads) if (r.route) this.routeLen += r.cum[r.cum.length - 1];
    return ((this.routeLen || FARM_TO_NASA * 1.4) * Math.min(1, straight / FARM_TO_NASA)) / ROAD_SPEED;
  }

  update(dt: number) {
    const game = this.game;
    const opt = this.option();
    if (opt && game.input.pressed('travel')) void this.go();
    // the on-screen button (with a keyboard; the touch layout has its own SKIP DRIVE button)
    this.chipT -= dt;
    if (this.chipT > 0) return;
    this.chipT = 0.25;
    const show = !!opt && !game.input.touchActive;
    this.chip.style.display = show ? '' : 'none';
    if (opt) {
      const txt = `⏩  SKIP THE DRIVE TO ${opt.label.toUpperCase()}  ·  ${opt.minutes} MIN  [J]`;
      if (this.chip.textContent !== txt) this.chip.textContent = txt;
    }
  }

  async go() {
    const opt = this.option();
    if (!opt) return;
    const game = this.game;
    const z = this.content.zone;
    this.busy = true;
    this.chip.style.display = 'none';
    try {
      await game.fadeTo(1, 0.6);
      const car = this.car();
      const from = car ? car.root.position.clone() : game.player.pos.clone();
      game.state.clock.earthTime += this.seconds(opt.dest === 'nasa' ? Math.hypot(from.x - NASA.portal.x, from.z - NASA.portal.z) : Math.hypot(from.x, from.z));
      let at: THREE.Vector3;
      if (opt.dest === 'nasa') {
        game.flag('reachedNasa', true);
        const nasa = (this.content as unknown as { nasa?: { barrierOpen: boolean } }).nasa;
        if (nasa) nasa.barrierOpen = true;
        if (car) {
          // parked on the forecourt facing the portal
          at = new THREE.Vector3(NASA.portal.x + 4, 0, NASA.portal.z + 32);
          at.y = z.height(at.x, at.z) + 0.3;
          this.placeCar(car, at, new THREE.Quaternion());
        } else {
          this.content.spawnAt('nasa');
          at = game.player.pos.clone();
        }
      } else if (car) {
        const spot = FARM_VEHICLE_SPOTS[car.id] ?? FARM_VEHICLE_SPOTS.pickup;
        at = new THREE.Vector3(...spot.pos);
        at.y = z.height(at.x, at.z) + 0.3;
        this.placeCar(car, at, new THREE.Quaternion(...spot.quat));
      } else {
        this.content.spawnAt('farm');
        at = game.player.pos.clone();
      }
      // crew members following you come too
      const people = (this.content as unknown as { people?: { npcs: { state: { following: boolean }; pos: THREE.Vector3; stop(): void }[] } }).people;
      let k = 0;
      for (const n of people?.npcs ?? []) {
        if (!n.state.following) continue;
        n.stop();
        const a = 2.4 + k++ * 0.9;
        n.pos.set(at.x + Math.cos(a) * 2.5, 0, at.z + Math.sin(a) * 2.5);
        n.pos.y = z.height(n.pos.x, n.pos.z);
      }
      // stream the terrain and road colliders around the new spot before anything moves
      z.ground.physics.terrainCenter.set(1e9, 1e9);
      (z as unknown as { roadColCenter: THREE.Vector2 }).roadColCenter.set(1e9, 1e9);
      game.notify(opt.dest === 'nasa' ? `You drove to the NASA base — ${opt.minutes} min on the road.` : `You drove home to the farm — ${opt.minutes} min on the road.`, 'ok', 6);
      await new Promise((r) => setTimeout(r, 350));
      await game.fadeTo(0, 0.8);
    } finally {
      this.busy = false;
    }
  }

  private placeCar(v: GroundVehicle, pos: THREE.Vector3, quat: THREE.Quaternion) {
    v.disablePhysics();
    v.root.position.copy(pos);
    v.root.quaternion.copy(quat);
    v.root.updateMatrixWorld(true);
    v.enablePhysics();
  }

  dispose() {
    this.chip.remove();
  }
}
