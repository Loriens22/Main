import * as THREE from 'three';
import type { Game, System } from '../core/Game';
import { WheeledVehicle } from './WheeledVehicle';
import { ui } from '../ui/store';
import { bus } from '../core/events';
import { clamp, damp } from '../core/math';

const _v = new THREE.Vector3(), _f = new THREE.Vector3(), _t = new THREE.Vector3();

/** Player control of wheeled vehicles: entering/leaving, input mapping, cabin and chase cameras, HUD. */
export class Driving implements System {
  vehicle: WheeledVehicle | null = null;
  cam: 'cabin' | 'chase' = 'cabin';
  private orbitYaw = 0;
  private orbitPitch = 0.22;
  private idle = 0;
  private camPos = new THREE.Vector3();
  private camInit = false;
  /** called when the player leaves the vehicle (the farm uses it to hand a machine back to its autopilot) */
  onExit: ((v: WheeledVehicle) => void) | null = null;

  constructor(private game: Game) {}

  enter(v: WheeledVehicle, label = 'Vehicle') {
    if (this.vehicle) return;
    const seat = v.model.marker('seat', 'driver');
    if (!seat) return;
    const door = v.kind === 'pickup' ? 'fl' : 'cab';
    v.setDoor(door, true);
    setTimeout(() => v.setDoor(door, false), 900);
    this.vehicle = v;
    v.occupied = true;
    v.engineOn = true;
    v.handbrake = false;
    v.setMode('dynamic');
    this.game.player.sit({ node: seat.node, eye: seat.data.eye ?? 1.1, yawLimit: 2.5 });
    this.cam = 'cabin';
    this.camInit = false;
    bus.emit('vehicle:enter', v);
    bus.emit('sfx', { id: 'engine_start', node: v.root });
    const skip = v.kind === 'pickup' && this.game.settings.creative.fastTravel ? ['K  skip the drive (fast travel)'] : [];
    ui.set({ mode: 'drive', hints: ['W / S  accelerate · brake', 'A / D  steer', 'SPACE  handbrake', 'H  lights   V  camera', 'F  leave vehicle', ...skip] });
    ui.toast(`${label}: engine running`, 'info', 2.5);
  }

  exit() {
    const v = this.vehicle;
    if (!v) return;
    if (Math.abs(v.speed) > 1.6) { ui.toast('Stop the vehicle before getting out', 'warn', 2); return; }
    v.occupied = false;
    v.throttle = 0;
    v.steerInput = 0;
    v.handbrake = true;
    v.engineOn = false;
    const door = v.kind === 'pickup' ? 'fl' : 'cab';
    v.setDoor(door, true);
    setTimeout(() => v.setDoor(door, false), 1200);
    v.markerWorld('exit', 'driver', _v);
    const gh = this.game.zone?.groundHeight(_v.x, _v.z);
    if (gh !== null && gh !== undefined) _v.y = gh + 0.06;
    const yaw = v.yaw;
    this.vehicle = null;
    this.game.cameraDriver = null;
    this.game.player.stand(_v, yaw);
    bus.emit('vehicle:exit', v);
    bus.emit('sfx', { id: 'engine_stop', node: v.root });
    ui.set({ mode: 'foot', hints: [], gauges: [] });
    this.onExit?.(v);
  }

  fixedUpdate(_dt: number) {
    const v = this.vehicle;
    if (!v) return;
    const inp = this.game.input;
    v.throttle = inp.axis('back', 'forward', 'moveY');
    v.steerInput = -inp.axis('left', 'right', 'moveX');
    v.handbrake = inp.down('brake');
  }

  update(dt: number) {
    const v = this.vehicle;
    if (!v) return;
    const g = this.game, inp = g.input;
    if (g.state !== 'playing') return;
    if (inp.pressed('exit')) { this.exit(); return; }
    if (inp.pressed('headlights')) { v.setLights(!v.lightsOn); bus.emit('sfx', { id: 'switch', node: v.root }); }
    if (inp.pressed('camera')) {
      this.cam = this.cam === 'cabin' ? 'chase' : 'cabin';
      this.camInit = false;
    }
    if (this.cam === 'chase') {
      const cam = g.renderer.camera;
      g.player.lookEnabled = false;
      const [dx, dy] = inp.consumeLook();
      if (dx || dy) this.idle = 0; else this.idle += dt;
      this.orbitYaw -= dx;
      this.orbitPitch = clamp(this.orbitPitch + dy, -0.1, 1.2);
      if (this.idle > 2.5 && Math.abs(v.speed) > 2) this.orbitYaw = damp(this.orbitYaw, 0, 1.5, dt);
      const dist = v.kind === 'pickup' ? 8.5 : 14;
      v.forward(_f);
      const heading = Math.atan2(_f.x, _f.z) + this.orbitYaw;
      _t.copy(v.root.position).add(_v.set(0, v.kind === 'pickup' ? 1.6 : 3.0, 0));
      _v.set(-Math.sin(heading) * Math.cos(this.orbitPitch), Math.sin(this.orbitPitch), -Math.cos(heading) * Math.cos(this.orbitPitch)).multiplyScalar(dist).add(_t);
      const gh = g.zone?.groundHeight(_v.x, _v.z);
      if (gh !== null && gh !== undefined && _v.y < gh + 0.6) _v.y = gh + 0.6;
      if (!this.camInit) { this.camPos.copy(_v); this.camInit = true; }
      this.camPos.lerp(_v, 1 - Math.exp(-7 * dt));
      g.cameraDriver = () => {
        cam.position.copy(this.camPos);
        cam.lookAt(_t);
      };
    } else {
      g.cameraDriver = null;
      g.player.lookEnabled = true;
    }
    const kmh = Math.abs(v.speed) * 3.6;
    ui.set({
      gauges: [
        { label: 'km/h', value: kmh.toFixed(0) },
        { label: 'fuel', value: `${Math.round((v.fuel / v.tuning.fuelCapacity) * 100)}%`, warn: v.fuel / v.tuning.fuelCapacity < 0.12 },
        { label: v.speed < -0.3 ? 'reverse' : v.handbrake ? 'brake' : 'drive', value: v.speed < -0.3 ? 'R' : v.handbrake ? 'P' : 'D' },
      ],
    });
  }
}
