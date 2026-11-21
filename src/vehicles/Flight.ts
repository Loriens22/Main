import * as THREE from 'three';
import type { Game, System } from '../core/Game';
import { bus } from '../core/events';
import { clamp, damp } from '../core/math';
import { ui } from '../ui/store';
import { ScreenSurface, scr } from '../render/ScreenSurface';
import { FlightEnv, Spacecraft } from './Spacecraft';
import { GROUP, groups } from '../physics/Physics';

const _v = new THREE.Vector3(), _u = new THREE.Vector3(), _f = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
/** a camera looking along +Z of the craft (aft): turn the default -Z view half way round about Y */
const _qf = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);

/** A guidance target shown on the instruments (docking port, landing zone, the Endurance...). */
export interface NavTarget { name: string; pos: (out: THREE.Vector3) => THREE.Vector3; vel?: (out: THREE.Vector3) => THREE.Vector3; up?: THREE.Vector3 }

/** Autopilot programs plug in here; they write the craft's command fields every fixed step. */
export interface Autopilot {
  name: string;
  step(c: Spacecraft, dt: number, env: FlightEnv): boolean | void;
  status?(): string;
  stop?(): void;
  /** keeps running while the craft is carried (analytic coast, docked hand-over) */
  carriedOk?: boolean;
  /** program to chain to when this one completes */
  next?(): Autopilot | null;
}

/** An extra camera a zone or program offers in the camera cycle (launch tracking camera...). */
export interface ExtraCam { id: string; label: string; drive(cam: THREE.PerspectiveCamera, dt: number): void; fov?: number }

/**
 * The pilot's seat: control mapping, cameras, HUD and the live cockpit displays of the craft being flown.
 * Works in any zone; the zone supplies the flight environment (gravity, air, ground).
 */
export class Flight implements System {
  craft: Spacecraft | null = null;
  env: FlightEnv | null = null;
  cam = 'cockpit';
  /** cameras added by the zone or the current program */
  extraCams: ExtraCam[] = [];
  target: NavTarget | null = null;
  autopilot: Autopilot | null = null;
  /** hover assist: lift engines hold a vertical speed (m/s) */
  hover = false;
  vsTarget = 0;
  private orbitYaw = Math.PI;
  private orbitPitch = 0.25;
  private chaseDist = 32;
  private camPos = new THREE.Vector3();
  private camInit = false;
  private screens: ScreenSurface[] = [];
  private seatId = '';
  /** zone hook: can the pilot leave the seat here? returns a reason when not */
  canLeave: ((c: Spacecraft) => string | null) | null = null;
  onLeave: ((c: Spacecraft) => void) | null = null;
  /** when set, the pilot may not fly (launch stack, docked): the seat is only a seat */
  locked = false;
  /** another system owns the HUD gauges (launch director) */
  hudOverride = false;
  /** chase camera keeps the zone's up (a craft standing on a launch vehicle) instead of the craft's */
  chaseWorldUp = false;

  constructor(private game: Game) {}

  enter(c: Spacecraft, env: FlightEnv, seatId = 'pilot_l') {
    const seat = c.model.marker('seat', seatId);
    if (!seat || this.craft) return;
    this.craft = c;
    this.env = env;
    this.seatId = seatId;
    this.game.player.sit({ node: seat.node, eye: seat.data.eye ?? 0.74, yawLimit: 1.9 });
    this.game.interactions.suspended = true;
    this.cam = 'cockpit';
    this.camInit = false;
    this.hover = false;
    c.throttle = 0;
    c.lift = 0;
    this.buildScreens(c);
    ui.set({ mode: 'fly' });
    this.hints();
    bus.emit('flight:enter', c);
  }

  private hints() {
    ui.set({
      hints: this.locked ? ['Seated · mouse to look', 'V  camera', 'F  leave seat'] : [
        'W / S  pitch · A / D  yaw · Q / E  roll', 'SHIFT / CTRL  throttle · Z max · X cut', 'I K J L U O  translate (RCS)',
        'SPACE  hover assist · N  gear · H  lights', 'R  stability mode · Y  autopilot · V  camera · F  leave seat',
      ],
    });
  }

  leave(force = false) {
    const c = this.craft;
    if (!c) return;
    if (!force) {
      const why = this.canLeave?.(c);
      if (why) { ui.toast(why, 'warn', 3); return; }
    }
    this.autopilot?.stop?.();
    this.autopilot = null;
    c.throttle = 0; c.lift = 0; c.rot.set(0, 0, 0); c.trans.set(0, 0, 0);
    this.craft = null;
    this.game.cameraDriver = null;
    this.cam = 'cockpit';
    this.extraCams = [];
    { const cam = this.game.renderer.camera; if (cam.fov !== 70) { cam.fov = 70; cam.updateProjectionMatrix(); } }
    ui.set({ view: '' });
    this.game.player.lookEnabled = true;
    this.game.interactions.suspended = false;
    for (const s of this.screens) s.dispose();
    this.screens = [];
    ui.set({ mode: 'foot', hints: [], gauges: [] });
    this.onLeave?.(c);
    bus.emit('flight:leave', c);
  }

  setLocked(v: boolean) { this.locked = v; if (this.craft) this.hints(); }

  engage(ap: Autopilot | null) {
    this.autopilot?.stop?.();
    this.autopilot = ap;
    if (ap) ui.toast(`Autopilot: ${ap.name}`, 'info', 3);
    bus.emit('sfx', { id: ap ? 'chime' : 'caution', ui: true });
  }

  fixedUpdate(dt: number) {
    const c = this.craft, env = this.env;
    if (!c || !env) return;
    if (c.carried && !this.autopilot?.carriedOk) return;
    const inp = this.game.input;
    if (this.autopilot) {
      const done = this.autopilot.step(c, dt, env);
      if (done) {
        const ap = this.autopilot;
        const nx = ap.next?.() ?? null;
        ui.toast(`${ap.name}: complete`, 'good', 4);
        bus.emit('flight:apdone', ap);
        this.autopilot = nx;
        if (nx) { ui.toast(`Autopilot: ${nx.name}`, 'info', 3); bus.emit('flight:apstart', nx); }
        return;
      }
      if (!this.autopilot) return;
      // any stick input hands control back to the pilot
      if (!this.locked && (Math.abs(inp.axis('back', 'forward')) + Math.abs(inp.axis('left', 'right')) > 0.5)) { this.engage(null); ui.toast('Autopilot disengaged by pilot input', 'warn', 3); }
      return;
    }
    if (this.locked) { c.rot.set(0, 0, 0); c.trans.set(0, 0, 0); return; }
    const inv = this.game.settings.c.invertFlightPitch ? -1 : 1;
    // W pushes the nose down; A yaws left; Q rolls left (right wing up)
    c.rot.set(-inp.axis('back', 'forward', 'moveY') * inv, -inp.axis('left', 'right', 'moveX'), inp.axis('rollRight', 'rollLeft'));
    c.trans.set(inp.axis('transLeft', 'transRight'), 0, inp.axis('transBack', 'transFwd'));
    if (inp.down('throttleUp')) c.throttle = clamp(c.throttle + dt * 0.55, 0, 1);
    if (inp.down('throttleDown')) c.throttle = clamp(c.throttle - dt * 0.55, 0, 1);
    if (inp.pressed('throttleMax')) c.throttle = 1;
    if (inp.pressed('throttleCut')) c.throttle = 0;
    const up = inp.axis('transDown', 'transUp');
    const pos = c.position(_v);
    env.gravity(pos, _f);
    const gmag = _f.length();
    if (this.hover && gmag > 0.05) {
      // lift engines hold the commanded climb rate against gravity
      this.vsTarget = up * 4;
      const vUp = c.velocity(_u).dot(_f.clone().normalize().negate());
      const bodyUp = c.up(_u).dot(_f.clone().normalize().negate());
      const need = c.mass * (gmag + (this.vsTarget - vUp) * 1.2);
      c.lift = clamp(need / (Math.max(0.2, bodyUp) * c.spec.lift.thrust), 0, 1);
      c.trans.y = 0;
    } else {
      c.lift = 0;
      c.trans.y = up;
    }
  }

  update(dt: number) {
    const c = this.craft;
    if (!c) return;
    const g = this.game, inp = g.input;
    if (g.state !== 'playing') return;
    if (inp.pressed('exit')) { this.leave(); if (!this.craft) return; }
    if (inp.pressed('camera')) this.cycleCamera();
    if (!this.locked) {
      if (inp.pressed('gear')) { c.setGear(!c.gearDown); ui.toast(c.gearDown ? 'Gear down' : 'Gear up', 'info', 1.5); }
      if (inp.pressed('headlights')) { c.setLights(!c.lightsOn); bus.emit('sfx', { id: 'switch', ui: true }); }
      if (inp.pressed('sas')) {
        c.sas = c.sas === 'off' ? 'rate' : c.sas === 'rate' ? 'hold' : 'off';
        if (c.sas === 'hold') c.holdQ.copy(c.quaternion(_q));
        ui.toast(`Stability: ${c.sas === 'off' ? 'off (direct)' : c.sas === 'rate' ? 'rate damping' : 'attitude hold'}`, 'info', 2);
        bus.emit('sfx', { id: 'beep', ui: true });
      }
      if (inp.pressed('vtol')) {
        this.hover = !this.hover;
        ui.toast(this.hover ? 'Hover assist on — U / O climb · descend' : 'Hover assist off', 'info', 2.5);
        bus.emit('sfx', { id: 'beep', ui: true });
      }
      if (inp.pressed('autopilot')) bus.emit('flight:autopilot', c);
    }
    // cameras
    const extra = this.extraCams.find((e) => e.id === this.cam);
    if (this.cam === 'dock' && c.model.marker('dock', 'rear')) {
      g.player.lookEnabled = false;
      const n = c.model.node('dock', 'rear')!;
      g.cameraDriver = () => {
        const cam = g.renderer.camera;
        n.getWorldPosition(cam.position);
        const q = c.root.getWorldQuaternion(_q);
        // looking aft along the docking axis from the centre of the ring, craft up is screen up
        cam.position.addScaledVector(_f.set(0, 0, 1).applyQuaternion(q), 0.25);
        cam.quaternion.copy(q).multiply(_qf);
        cam.fov = 46; cam.updateProjectionMatrix();
      };
    } else if (extra) {
      g.player.lookEnabled = false;
      g.cameraDriver = (cdt) => { const cam = g.renderer.camera; if (extra.fov && cam.fov !== extra.fov) { cam.fov = extra.fov; cam.updateProjectionMatrix(); } extra.drive(cam, cdt); };
    } else if (this.cam === 'chase') {
      g.player.lookEnabled = false;
      const [dx, dy] = inp.consumeLook();
      this.orbitYaw -= dx;
      this.orbitPitch = clamp(this.orbitPitch + dy, -1.3, 1.3);
      this.chaseDist = clamp(this.chaseDist * (1 + inp.wheel * 0.001), 12, 400);
      inp.wheel = 0;
      const q = c.quaternion(_q);
      const off = _v.set(Math.sin(this.orbitYaw) * Math.cos(this.orbitPitch), Math.sin(this.orbitPitch), Math.cos(this.orbitYaw) * Math.cos(this.orbitPitch)).multiplyScalar(this.chaseDist).applyQuaternion(q);
      const at = c.root.position;
      const want = _u.copy(at).add(off);
      // keep the camera out of rock and walls (launch silo, hangar): pull it in along the line of sight
      const phys = g.zone?.phys;
      if (phys) {
        const d = off.length();
        const hit = phys.raycast(at, _f.copy(off).divideScalar(d), d, groups(0xffff, GROUP.WORLD));
        if (hit) want.copy(at).addScaledVector(_f, Math.max(2, hit.dist - 0.6));
      }
      if (!this.camInit) { this.camPos.copy(want); this.camInit = true; }
      this.camPos.lerp(want, 1 - Math.exp(-10 * dt));
      const camUp = this.chaseWorldUp ? new THREE.Vector3(0, 1, 0) : c.up(new THREE.Vector3());
      g.cameraDriver = () => {
        const cam = g.renderer.camera;
        cam.position.copy(this.camPos);
        cam.up.copy(camUp);
        cam.lookAt(at);
        cam.up.set(0, 1, 0);
      };
    } else {
      g.cameraDriver = null;
      g.player.lookEnabled = true;
    }
    for (const s of this.screens) s.update(dt, true);
    ui.set({ view: this.cam === 'dock' ? 'dockcam' : '' });
    if (!this.hudOverride) this.hud();
  }

  /** cockpit -> chase -> docking camera (if the craft has one) -> zone cameras -> cockpit */
  cycleCamera(to?: string) {
    const c = this.craft;
    const list = ['cockpit', 'chase'];
    if (c?.model.marker('dock', 'rear')) list.push('dock');
    for (const e of this.extraCams) list.push(e.id);
    const i = list.indexOf(this.cam);
    this.cam = to && list.includes(to) ? to : list[(i + 1) % list.length];
    this.camInit = false;
    const cam = this.game.renderer.camera;
    if (cam.fov !== 70 && this.cam !== 'dock') { cam.fov = 70; cam.updateProjectionMatrix(); }
    const label = this.cam === 'cockpit' ? 'Cockpit' : this.cam === 'chase' ? 'Chase camera' : this.cam === 'dock' ? 'Docking camera' : this.extraCams.find((e) => e.id === this.cam)?.label ?? this.cam;
    ui.toast(label, 'info', 1.2);
  }

  // ------------------------------------------------------------------------------------------- HUD / screens
  readout() {
    const c = this.craft!, env = this.env!;
    const pos = c.position(new THREE.Vector3());
    const vel = env.velocity?.(new THREE.Vector3()) ?? c.velocity(new THREE.Vector3());
    const gvec = env.gravity(pos, new THREE.Vector3());
    const upW = gvec.lengthSq() > 1e-6 ? gvec.clone().normalize().negate() : new THREE.Vector3(0, 1, 0);
    const alt = env.altitude?.(pos) ?? null;
    const q = c.quaternion(new THREE.Quaternion());
    // attitude relative to the local horizon
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(q), upB = new THREE.Vector3(0, 1, 0).applyQuaternion(q), right = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
    const pitch = Math.asin(clamp(fwd.dot(upW), -1, 1));
    const roll = Math.atan2(-right.dot(upW), upB.dot(upW));
    const north = new THREE.Vector3(0, 0, -1).projectOnPlane(upW).normalize();
    const fh = fwd.clone().projectOnPlane(upW);
    const heading = fh.lengthSq() > 1e-6 ? (Math.atan2(fh.clone().cross(north).dot(upW), fh.normalize().dot(north)) * 180 / Math.PI + 360) % 360 : 0;
    let tgt: { dist: number; rate: number; name: string; rel: THREE.Vector3 } | null = null;
    if (this.target) {
      const tp = this.target.pos(new THREE.Vector3());
      const tv = this.target.vel?.(new THREE.Vector3()) ?? new THREE.Vector3();
      const rel = tp.sub(pos);
      const dist = rel.length();
      const rate = -vel.clone().sub(tv).dot(rel.clone().normalize());
      tgt = { dist, rate, name: this.target.name, rel: rel.applyQuaternion(q.clone().invert()) };
    }
    return { pos, vel, speed: vel.length(), vs: vel.dot(upW), alt, pitch, roll, heading, tgt, fuel: c.fuel / c.spec.fuelMax, g: c.gLoad };
  }

  private hud() {
    const c = this.craft!;
    const r = this.readout();
    const gauges = [
      { label: 'm/s', value: r.speed < 1000 ? r.speed.toFixed(1) : (r.speed / 1000).toFixed(2) + 'k' },
      { label: 'alt', value: r.alt === null ? '—' : r.alt < 10000 ? `${r.alt.toFixed(0)} m` : `${(r.alt / 1000).toFixed(1)} km` },
      { label: 'v/s', value: r.vs.toFixed(1) },
      { label: 'thr', value: `${Math.round(c.throttle * 100)}%` },
      { label: 'fuel', value: `${Math.round(r.fuel * 100)}%`, warn: r.fuel < 0.15 },
      { label: 'sas', value: c.sas.toUpperCase() },
    ];
    if (this.hover) gauges.push({ label: 'hover', value: `${this.vsTarget >= 0 ? '+' : ''}${this.vsTarget.toFixed(0)}` });
    if (r.tgt) gauges.push({ label: 'tgt', value: r.tgt.dist < 2000 ? `${r.tgt.dist.toFixed(1)} m` : `${(r.tgt.dist / 1000).toFixed(2)} km` }, { label: 'rate', value: r.tgt.rate.toFixed(2) });
    if (this.autopilot) gauges.push({ label: 'auto', value: this.autopilot.status?.() ?? this.autopilot.name });
    ui.set({ gauges });
  }

  private buildScreens(c: Spacecraft) {
    for (const s of this.screens) s.dispose();
    this.screens = [];
    const add = (id: string, draw: (ctx: CanvasRenderingContext2D, W: number, H: number) => void, px = 512) => {
      const m = c.model.marker('screen', id);
      if (!m) return;
      const s = new ScreenSurface(m.node, m.data.w, m.data.h, draw, px, 1.35);
      s.interval = 0.1;
      this.screens.push(s);
    };
    add('pfd_l0', (x, W, H) => this.drawAdi(x, W, H));
    add('pfd_r0', (x, W, H) => this.drawAdi(x, W, H));
    add('pfd_l1', (x, W, H) => this.drawNav(x, W, H));
    add('pfd_r1', (x, W, H) => this.drawNav(x, W, H));
    add('ped0', (x, W, H) => this.drawProp(x, W, H));
    for (const side of ['l', 'r']) {
      add(`side_a_${side}0`, (x, W, H) => this.drawSys(x, W, H));
      add(`side_a_${side}1`, (x, W, H) => this.drawProp(x, W, H));
      add(`side_b_${side}0`, (x, W, H) => this.drawNav(x, W, H));
      add(`side_b_${side}1`, (x, W, H) => this.drawSys(x, W, H));
    }
  }

  /** Attitude indicator with speed and altitude tapes. */
  private drawAdi(ctx: CanvasRenderingContext2D, W: number, H: number) {
    if (!this.craft) return;
    const r = this.readout();
    const cx = W / 2, cy = H / 2, R = H * 0.42;
    ctx.save();
    scr.bg(ctx, W, H, '#020507');
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip();
    ctx.translate(cx, cy); ctx.rotate(-r.roll);
    const pp = (r.pitch * 180 / Math.PI) * (R / 40);
    ctx.fillStyle = '#1d4f7a'; ctx.fillRect(-W, -H * 2 + pp, W * 2, H * 2);
    ctx.fillStyle = '#5a3d22'; ctx.fillRect(-W, pp, W * 2, H * 2);
    ctx.strokeStyle = '#e9f2f1'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-W, pp); ctx.lineTo(W, pp); ctx.stroke();
    ctx.lineWidth = 1;
    for (let d = -60; d <= 60; d += 10) {
      if (!d) continue;
      const y = pp - d * (R / 40);
      const w = d % 20 === 0 ? R * 0.35 : R * 0.18;
      ctx.beginPath(); ctx.moveTo(-w, y); ctx.lineTo(w, y); ctx.stroke();
      if (d % 20 === 0) scr.mono(ctx, String(Math.abs(d)), w + 6, y, 11, '#e9f2f1');
    }
    ctx.restore();
    ctx.strokeStyle = '#f0b34a'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(cx - R * 0.45, cy); ctx.lineTo(cx - R * 0.15, cy); ctx.lineTo(cx - R * 0.08, cy + 8);
    ctx.moveTo(cx + R * 0.45, cy); ctx.lineTo(cx + R * 0.15, cy); ctx.lineTo(cx + R * 0.08, cy + 8); ctx.stroke();
    ctx.fillStyle = '#f0b34a'; ctx.fillRect(cx - 2, cy - 2, 4, 4);
    ctx.strokeStyle = 'rgba(207,233,230,0.5)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
    // tapes
    scr.mono(ctx, r.speed.toFixed(1), 12, cy, 18, '#cfe9e6');
    scr.text(ctx, 'M/S', 12, cy + 20, 10, 'rgba(207,233,230,0.6)');
    scr.mono(ctx, r.alt === null ? '----' : r.alt < 10000 ? r.alt.toFixed(0) : (r.alt / 1000).toFixed(1) + 'k', W - 12, cy, 18, '#cfe9e6', 'right');
    scr.text(ctx, 'ALT', W - 12, cy + 20, 10, 'rgba(207,233,230,0.6)', 'right');
    scr.mono(ctx, `HDG ${r.heading.toFixed(0).padStart(3, '0')}`, cx, 16, 13, '#cfe9e6', 'center');
    scr.mono(ctx, `V/S ${r.vs >= 0 ? '+' : ''}${r.vs.toFixed(1)}`, cx, H - 14, 13, r.vs < -8 ? '#ff5a43' : '#cfe9e6', 'center');
  }

  /** Target bearing, range and closing rate. */
  private drawNav(ctx: CanvasRenderingContext2D, W: number, H: number) {
    if (!this.craft) return;
    const r = this.readout();
    scr.bg(ctx, W, H, '#03070a');
    scr.text(ctx, 'NAV', 12, 16, 12, '#f0b34a', 'left', '600');
    if (!r.tgt) {
      scr.text(ctx, 'NO TARGET', W / 2, H / 2, 16, 'rgba(207,233,230,0.5)', 'center');
      return;
    }
    const t = r.tgt;
    scr.text(ctx, t.name.toUpperCase(), 52, 16, 12, '#cfe9e6');
    const cx = W * 0.36, cy = H * 0.56, R = H * 0.36;
    ctx.strokeStyle = 'rgba(160,220,215,0.35)';
    for (const k of [0.33, 0.66, 1]) { ctx.beginPath(); ctx.arc(cx, cy, R * k, 0, Math.PI * 2); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy); ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R); ctx.stroke();
    // target direction in the body frame: x right, y up, -z ahead
    const d = t.rel.clone().normalize();
    const ang = Math.acos(clamp(-d.z, -1, 1));
    const k = Math.min(1, ang / (Math.PI / 2));
    const a2 = Math.atan2(d.y, d.x);
    ctx.fillStyle = d.z < 0 ? '#5fe08a' : '#ff5a43';
    ctx.beginPath(); ctx.arc(cx + Math.cos(a2) * R * k, cy - Math.sin(a2) * R * k, 6, 0, Math.PI * 2); ctx.fill();
    const x0 = W * 0.7;
    scr.text(ctx, 'RANGE', x0, H * 0.3, 10, 'rgba(207,233,230,0.6)');
    scr.mono(ctx, t.dist < 2000 ? `${t.dist.toFixed(1)} m` : `${(t.dist / 1000).toFixed(2)} km`, x0, H * 0.3 + 18, 16, '#cfe9e6');
    scr.text(ctx, 'CLOSING', x0, H * 0.55, 10, 'rgba(207,233,230,0.6)');
    scr.mono(ctx, `${t.rate.toFixed(2)} m/s`, x0, H * 0.55 + 18, 16, t.rate > Math.max(0.3, t.dist * 0.02) ? '#ff5a43' : '#5fe08a');
    scr.text(ctx, 'OFFSET', x0, H * 0.8, 10, 'rgba(207,233,230,0.6)');
    scr.mono(ctx, `${Math.hypot(t.rel.x, t.rel.y).toFixed(1)} m`, x0, H * 0.8 + 18, 16, '#cfe9e6');
  }

  /** Engines, fuel and thrust. */
  private drawProp(ctx: CanvasRenderingContext2D, W: number, H: number) {
    const c = this.craft;
    if (!c) return;
    scr.bg(ctx, W, H, '#03070a');
    scr.text(ctx, 'PROPULSION', 12, 16, 12, '#f0b34a', 'left', '600');
    const rows: [string, number, string][] = [
      ['MAIN THROTTLE', c.throttle, `${Math.round(c.throttle * 100)} %`],
      ['LIFT ENGINES', c.lift, `${Math.round(c.lift * 100)} %`],
      ['PROPELLANT', c.fuel / c.spec.fuelMax, `${(c.fuel / 1000).toFixed(2)} t`],
      ['MASS FLOW', Math.min(1, c.mainFlow / 160), `${c.mainFlow.toFixed(1)} kg/s`],
    ];
    rows.forEach(([k, f, v], i) => {
      const y = 44 + i * (H - 60) / 4;
      scr.text(ctx, k, 12, y, 11, 'rgba(207,233,230,0.6)');
      scr.mono(ctx, v, W - 12, y, 13, '#cfe9e6', 'right');
      scr.bar(ctx, 12, y + 12, W - 24, 8, f, i === 2 && f < 0.15 ? '#ff5a43' : '#7fd6cf');
    });
    const dv = c.spec.main.isp * 9.80665 * Math.log(c.mass / c.spec.dryMass);
    scr.mono(ctx, `Δv ${dv.toFixed(0)} m/s   G ${c.gLoad.toFixed(2)}`, 12, H - 12, 12, '#cfe9e6');
  }

  /** Vehicle systems page. */
  private drawSys(ctx: CanvasRenderingContext2D, W: number, H: number) {
    const c = this.craft;
    if (!c) return;
    scr.bg(ctx, W, H, '#03070a');
    scr.text(ctx, 'SYSTEMS', 12, 16, 12, '#f0b34a', 'left', '600');
    const items: [string, string, boolean][] = [
      ['STABILITY', c.sas.toUpperCase(), c.sas !== 'off'], ['GEAR', c.gearT > 0.99 ? 'DOWN · LOCKED' : c.gearT < 0.01 ? 'UP' : 'IN TRANSIT', c.gearT > 0.99 || c.gearT < 0.01],
      ['EXT LIGHTS', c.lightsOn ? 'ON' : 'OFF', true], ['HOVER ASSIST', this.hover ? 'ON' : 'OFF', true], ['CABIN', '101.3 kPa · 21 °C', true],
      ['AUTOPILOT', this.autopilot ? this.autopilot.name.toUpperCase() : 'STANDBY', true],
    ];
    items.forEach(([k, v, ok], i) => {
      const y = 44 + i * (H - 50) / items.length;
      scr.text(ctx, k, 12, y, 11, 'rgba(207,233,230,0.6)');
      scr.mono(ctx, v, W - 12, y, 12, ok ? '#5fe08a' : '#f0b34a', 'right');
    });
  }
}

void damp; void _e;
