import * as THREE from 'three';
import { bus } from '../core/events';
import { clamp } from '../core/math';
import { ui } from '../ui/store';
import type { Autopilot } from './Flight';
import type { FlightEnv, SasMode, Spacecraft } from './Spacecraft';
import { rcsAccel, steerAttitude, steerTranslation } from './Guidance';

const blenderDir = (d: number[]) => new THREE.Vector3(d[0], d[2], -d[1]);
const _v = new THREE.Vector3(), _u = new THREE.Vector3(), _w = new THREE.Vector3(), _p = new THREE.Vector3(), _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();

/** Whatever carries docking ports: a station, a ship, another craft. */
export interface DockHost {
  name: string;
  /** world position of the host's rotation centre */
  origin(out: THREE.Vector3): THREE.Vector3;
  /** linear velocity of that centre */
  velocity(out: THREE.Vector3): THREE.Vector3;
  /** angular velocity (world, rad/s) */
  omega(out: THREE.Vector3): THREE.Vector3;
}

/** A docking interface on a host, from a `dock` marker (dir = outward normal, up = clocking reference). */
export class DockPort {
  occupant: Spacecraft | null = null;
  /** craft cleared to approach this port (others are refused) */
  reservedFor: Spacecraft | null = null;
  private dirLocal: THREE.Vector3;
  private upLocal: THREE.Vector3;

  constructor(public id: string, public label: string, public kind: string, public accepts: string, public node: THREE.Object3D, public host: DockHost, data: Record<string, any>) {
    this.dirLocal = blenderDir(data.dir ?? [0, 1, 0]).normalize();
    this.upLocal = blenderDir(data.up ?? [0, 0, 1]).normalize();
  }

  /** world pose: position, outward direction, clocking up */
  pose(pos: THREE.Vector3, dir: THREE.Vector3, up: THREE.Vector3) {
    this.node.updateWorldMatrix(true, false);
    pos.setFromMatrixPosition(this.node.matrixWorld);
    _q.setFromRotationMatrix(_m.extractRotation(this.node.matrixWorld));
    dir.copy(this.dirLocal).applyQuaternion(_q).normalize();
    up.copy(this.upLocal).applyQuaternion(_q).normalize();
  }

  /** velocity of a world point riding on the host */
  pointVelocity(p: THREE.Vector3, out: THREE.Vector3) {
    const w = this.host.omega(_w);
    const r = this.host.origin(_u);
    r.subVectors(p, r);
    this.host.velocity(out);
    return out.add(_v.crossVectors(w, r));
  }

  free(c?: Spacecraft) { return !this.occupant && (!this.reservedFor || this.reservedFor === c); }
}

/** Where a craft's own docking ring is, in its model space. */
interface CraftRing { pos: THREE.Vector3; dir: THREE.Vector3; up: THREE.Vector3 }

export interface DockReadout {
  port: DockPort;
  /** distance from the craft ring to the port along the port axis (m), positive in front of the port */
  axial: number;
  /** offset of the craft ring from the port axis in the port frame (x right, y up) */
  lateral: THREE.Vector2;
  lateralDist: number;
  range: number;
  /** relative velocity of the craft ring w.r.t. the port point, port frame (x, y lateral, z outward) */
  relVel: THREE.Vector3;
  /** closing speed (m/s, positive approaching) */
  closing: number;
  /** angle between the craft docking axis and the port axis (deg) */
  alignErr: number;
  /** roll (clocking) error about the port axis (deg) */
  rollErr: number;
  /** relative roll rate about the port axis (deg/s) */
  rollRate: number;
  /** pitch and yaw components of the alignment error in the port frame (deg) */
  tilt: THREE.Vector2;
  /** everything inside the capture envelope */
  ready: boolean;
  /** what is out of limits */
  issues: string[];
}

/** Capture envelope for the androgynous ring: soft capture happens only inside all of these. */
export const CAPTURE = { axial: 0.3, lateral: 0.22, closingMax: 0.45, closingMin: -0.03, align: 5, roll: 12, rollRate: 3.5 };

type LinkState = 'capture' | 'retract' | 'latch' | 'equalize' | 'docked' | 'release';

/** A craft held by a port. */
export interface DockLink { craft: Spacecraft; port: DockPort; state: LinkState; t: number; from: { pos: THREE.Vector3; quat: THREE.Quaternion }; prevSas: SasMode }

/**
 * Docking mechanics for one zone: knows every port and every craft that can dock, measures the approach,
 * performs soft capture, retraction, latching and pressurisation, and carries docked craft with their host.
 */
export class DockingSystem {
  ports: DockPort[] = [];
  crafts: Spacecraft[] = [];
  links: DockLink[] = [];
  private rings = new Map<Spacecraft, CraftRing>();
  /** messages shown on the cockpit after a successful dock */
  onDocked: ((l: DockLink) => void) | null = null;
  onUndocked: ((c: Spacecraft, p: DockPort) => void) | null = null;
  private time = 0;

  addPort(p: DockPort) { this.ports.push(p); return p; }

  addCraft(c: Spacecraft) {
    if (this.crafts.includes(c)) return;
    const m = c.model.marker('dock', 'rear') ?? c.model.ofKind('dock')[0];
    if (!m) return;
    const pos = c.markerLocal('dock', m.id)!;
    this.rings.set(c, { pos, dir: blenderDir(m.data.dir ?? [0, -1, 0]).normalize(), up: blenderDir(m.data.up ?? [0, 0, 1]).normalize() });
    this.crafts.push(c);
  }

  linkOf(c: Spacecraft) { return this.links.find((l) => l.craft === c) ?? null; }
  isDocked(c: Spacecraft) { return this.linkOf(c)?.state === 'docked'; }

  /** craft ring pose in the world (physics pose) */
  ringPose(c: Spacecraft, pos: THREE.Vector3, dir: THREE.Vector3, up: THREE.Vector3) {
    const r = this.rings.get(c)!;
    c.pointWorld(r.pos, pos);
    c.quaternion(_q);
    dir.copy(r.dir).applyQuaternion(_q);
    up.copy(r.up).applyQuaternion(_q);
  }

  /** Orientation and model-origin position that put the craft ring on the port (clocking aligned). */
  dockedPose(c: Spacecraft, port: DockPort, outPos: THREE.Vector3, outQuat: THREE.Quaternion) {
    const r = this.rings.get(c)!;
    const pp = _p, pd = _v, pu = _u;
    port.pose(pp, pd, pu);
    // craft axes in model space: z = ring direction, y = ring up
    _z.copy(r.dir); _y.copy(r.up); _x.crossVectors(_y, _z);
    _m.makeBasis(_x, _y, _z);
    // the same axes in the world: z opposite the port normal, y along the port up
    _z.copy(pd).negate(); _y.copy(pu).addScaledVector(_z, -pu.dot(_z)).normalize(); _x.crossVectors(_y, _z);
    _m2.makeBasis(_x, _y, _z);
    _m2.multiply(_m.transpose());
    outQuat.setFromRotationMatrix(_m2);
    outPos.copy(r.pos).applyQuaternion(outQuat).negate().add(pp);
    return outPos;
  }

  /** The nearest port this craft may use, or null. */
  nearestPort(c: Spacecraft, accepts = 'ranger') {
    let best: DockPort | null = null, bd = Infinity;
    const rp = this.rings.has(c) ? c.pointWorld(this.rings.get(c)!.pos, new THREE.Vector3()) : c.position(new THREE.Vector3());
    for (const p of this.ports) {
      if (p.accepts !== accepts || !p.free(c)) continue;
      p.pose(_p, _v, _u);
      const d = _p.distanceTo(rp);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  measure(c: Spacecraft, port: DockPort): DockReadout {
    const pp = new THREE.Vector3(), pd = new THREE.Vector3(), pu = new THREE.Vector3();
    port.pose(pp, pd, pu);
    const px = new THREE.Vector3().crossVectors(pu, pd);
    const rp = new THREE.Vector3(), rd = new THREE.Vector3(), ru = new THREE.Vector3();
    this.ringPose(c, rp, rd, ru);
    const rel = rp.clone().sub(pp);
    const axial = rel.dot(pd);
    const lateral = new THREE.Vector2(rel.dot(px), rel.dot(pu));
    const vc = c.pointVelocity(this.rings.get(c)!.pos, new THREE.Vector3());
    // velocity of the port centre (on a spin axis it does not move); measuring against the spinning frame at the
    // craft's own offset instead would make lateral damping push the craft around the axis
    const vp = port.pointVelocity(pp, new THREE.Vector3());
    const dv = vc.sub(vp);
    const relVel = new THREE.Vector3(dv.dot(px), dv.dot(pu), dv.dot(pd));
    const closing = -relVel.z;
    // alignment: craft ring direction should point against the port normal
    const want = pd.clone().negate();
    const alignErr = Math.acos(clamp(rd.dot(want), -1, 1)) / (Math.PI / 180);
    const tilt = new THREE.Vector2(Math.asin(clamp(rd.dot(px), -1, 1)), Math.asin(clamp(rd.dot(pu), -1, 1))).multiplyScalar(180 / Math.PI);
    // clocking: craft up vs port up, measured about the port axis
    const cu = ru.clone().addScaledVector(pd, -ru.dot(pd)).normalize();
    const rollErr = Math.atan2(cu.clone().cross(pu).dot(pd), cu.dot(pu)) / (Math.PI / 180);
    const wc = c.angVel(new THREE.Vector3());
    const wh = port.host.omega(new THREE.Vector3());
    const rollRate = wc.sub(wh).dot(pd) / (Math.PI / 180);
    const lateralDist = lateral.length();
    const issues: string[] = [];
    if (lateralDist > CAPTURE.lateral) issues.push('OFFSET');
    if (closing > CAPTURE.closingMax) issues.push('CLOSING FAST');
    if (alignErr > CAPTURE.align) issues.push('ALIGNMENT');
    if (Math.abs(rollErr) > CAPTURE.roll) issues.push('CLOCKING');
    if (Math.abs(rollRate) > CAPTURE.rollRate) issues.push('SPIN NOT MATCHED');
    return { port, axial, lateral, lateralDist, range: rel.length(), relVel, closing, alignErr, rollErr, rollRate, tilt, ready: issues.length === 0, issues };
  }

  /** Dock a craft at once (vessels that start the game docked, saved games). */
  attachNow(c: Spacecraft, port: DockPort) {
    this.addCraft(c);
    if (!c.carried) c.setCarried(true);
    const pos = new THREE.Vector3(), quat = new THREE.Quaternion();
    this.dockedPose(c, port, pos, quat);
    c.place(pos, quat);
    c.setCarried(true);
    port.occupant = c;
    port.reservedFor = null;
    const l: DockLink = { craft: c, port, state: 'docked', t: 0, from: { pos, quat }, prevSas: c.sas };
    this.links.push(l);
    return l;
  }

  /** Forget a craft's link at once (it is somewhere else entirely, e.g. on a planet's surface). */
  detachNow(c: Spacecraft) {
    const l = this.linkOf(c);
    if (!l) return;
    if (l.port.occupant === c) l.port.occupant = null;
    this.links.splice(this.links.indexOf(l), 1);
  }

  /** Release the latches and push the craft clear of the port at `speed` m/s. */
  undock(c: Spacecraft, speed = 0.15) {
    const l = this.linkOf(c);
    if (!l || l.state !== 'docked') return false;
    l.state = 'release';
    l.t = 0;
    bus.emit('sfx', { id: 'clamp', node: c.root, gain: 0.8 });
    bus.emit('sfx', { id: 'airlock', node: c.root, gain: 0.5 });
    (l as any).speed = speed;
    return true;
  }

  fixedUpdate(dt: number) {
    this.time += dt;
    // ---- soft capture check for free craft near a port
    for (const c of this.crafts) {
      if (c.carried || this.linkOf(c)) continue;
      for (const port of this.ports) {
        if (!port.free(c)) continue;
        port.pose(_p, _v, _u);
        if (c.pointWorld(this.rings.get(c)!.pos, _w).distanceTo(_p) > 1.5) continue;
        const r = this.measure(c, port);
        // a craft moving away from the port (just released, backing off) is never caught again
        if (r.closing < CAPTURE.closingMin) continue;
        if (r.axial > CAPTURE.axial || r.axial < -0.4 || r.lateralDist > 0.6) continue;
        if (!r.ready) {
          if (!(c as any).__capWarn || this.time - (c as any).__capWarn > 2) {
            (c as any).__capWarn = this.time;
            bus.emit('dock:refused', { craft: c, port, issues: r.issues });
          }
          continue;
        }
        this.capture(c, port);
        break;
      }
    }
    // ---- linked craft follow their port
    const pos = new THREE.Vector3(), quat = new THREE.Quaternion();
    for (const l of [...this.links]) {
      l.t += dt;
      const c = l.craft;
      this.dockedPose(c, l.port, pos, quat);
      if (l.state === 'capture' || l.state === 'retract') {
        // the capture ring pulls the craft in and squares it up; interpolate in the port's own (moving) frame
        const k = clamp(l.t / 2.6, 0, 1), e = k * k * (3 - 2 * k);
        const pq = portQuat(l.port, _q2), pp = l.port.node.getWorldPosition(_p);
        const rel = (l as any).rel as { p0: THREE.Vector3; q0: THREE.Quaternion; pf: THREE.Vector3; qf: THREE.Quaternion };
        pos.lerpVectors(rel.p0, rel.pf, e).applyQuaternion(pq).add(pp);
        quat.slerpQuaternions(rel.q0, rel.qf, e).premultiply(pq);
        c.carry(pos, quat);
        if (l.state === 'capture' && l.t > 0.7) { l.state = 'retract'; bus.emit('dock:state', { link: l, state: 'retract' }); }
        if (k >= 1) { l.state = 'latch'; l.t = 0; bus.emit('sfx', { id: 'clamp', node: c.root, gain: 1 }); bus.emit('dock:state', { link: l, state: 'latch' }); }
      } else if (l.state === 'latch') {
        c.carry(pos, quat);
        if (l.t > 0.45 && !(l as any).h2) { (l as any).h2 = 1; bus.emit('sfx', { id: 'clamp', node: c.root, gain: 0.8 }); }
        if (l.t > 0.9 && !(l as any).h3) { (l as any).h3 = 1; bus.emit('sfx', { id: 'clamp', node: c.root, gain: 0.7 }); }
        if (l.t > 1.3) { l.state = 'equalize'; l.t = 0; bus.emit('sfx', { id: 'airlock', node: c.root, gain: 0.9 }); bus.emit('dock:state', { link: l, state: 'equalize' }); }
      } else if (l.state === 'equalize') {
        c.carry(pos, quat);
        if (l.t > 3.2) {
          l.state = 'docked';
          l.t = 0;
          c.sas = l.prevSas;
          bus.emit('sfx', { id: 'chime', ui: true });
          bus.emit('dock:state', { link: l, state: 'docked' });
          this.onDocked?.(l);
        }
      } else if (l.state === 'docked') {
        c.carry(pos, quat);
      } else if (l.state === 'release') {
        c.carry(pos, quat);
        if (l.t > 1.2) {
          // hand the craft back to free flight with the port's motion plus a gentle push along the port's outward
          // axis (its own vectors: pointVelocity works in the module's scratch vectors)
          const speed = (l as any).speed ?? 0.15;
          const pp = new THREE.Vector3(), out = new THREE.Vector3(), pu = new THREE.Vector3();
          l.port.pose(pp, out, pu);
          const vel = l.port.pointVelocity(c.position(new THREE.Vector3()), new THREE.Vector3()).addScaledVector(out, speed);
          const w = l.port.host.omega(new THREE.Vector3());
          c.setCarried(false);
          c.place(pos, quat, vel);
          c.body.setAngvel(w, true);
          l.port.occupant = null;
          this.links.splice(this.links.indexOf(l), 1);
          bus.emit('dock:state', { link: l, state: 'free' });
          this.onUndocked?.(c, l.port);
        }
      }
    }
  }

  private capture(c: Spacecraft, port: DockPort) {
    const pos = new THREE.Vector3(), quat = new THREE.Quaternion();
    this.dockedPose(c, port, pos, quat);
    // current model-origin pose
    const cq = c.quaternion(new THREE.Quaternion());
    const cp = c.position(new THREE.Vector3()).sub(c.comModel.clone().applyQuaternion(cq));
    const prevSas = c.sas;
    c.setCarried(true);
    c.throttle = 0; c.lift = 0; c.rot.set(0, 0, 0); c.trans.set(0, 0, 0);
    port.occupant = c;
    port.reservedFor = null;
    // both poses in the port's frame, so the pull-in keeps turning with a spinning host
    const pq = portQuat(port, new THREE.Quaternion()), pqi = pq.clone().invert(), pp = port.node.getWorldPosition(new THREE.Vector3());
    const rel = {
      p0: cp.clone().sub(pp).applyQuaternion(pqi), q0: cq.clone().premultiply(pqi),
      pf: pos.clone().sub(pp).applyQuaternion(pqi), qf: quat.clone().premultiply(pqi),
    };
    const l: DockLink = { craft: c, port, state: 'capture', t: 0, from: { pos: cp, quat: cq }, prevSas };
    (l as any).rel = rel;
    this.links.push(l);
    bus.emit('sfx', { id: 'contact', node: c.root, gain: 1 });
    bus.emit('dock:state', { link: l, state: 'capture' });
  }
}

function portQuat(port: DockPort, out: THREE.Quaternion) {
  port.node.updateWorldMatrix(true, false);
  return out.setFromRotationMatrix(_m.extractRotation(port.node.matrixWorld));
}

/**
 * Automatic docking from the approach gate: identify a free port, establish relative navigation, null the
 * relative velocity, turn the docking ring toward the port and match its spin and clocking, then fly the final
 * approach along the port axis with a closing-speed profile and let the mechanism capture, latch and seal.
 * Designed to finish inside a minute from a gate 50 m out on the axis.
 */
export class DockAutopilot implements Autopilot {
  name = 'Automatic docking';
  phase: 'acquire' | 'align' | 'approach' | 'final' | 'capture' | 'done' | 'abort' = 'acquire';
  port: DockPort | null = null;
  t = 0;
  private prevSas: SasMode = 'rate';
  private holdAxial = 0;
  private cleared = false;
  reason = '';

  constructor(private dock: DockingSystem, private accepts = 'ranger', private onStep?: (ap: DockAutopilot) => void) {}

  status() {
    const r = this.port ? this.lastReadout : null;
    const what = { acquire: 'acquiring port', align: 'aligning · matching spin', approach: 'approach', final: 'final approach', capture: 'capture · latching', done: 'docked', abort: 'aborted' }[this.phase];
    return r ? `${what} ${r.axial.toFixed(1)} m` : what;
  }

  lastReadout: DockReadout | null = null;

  private craft: Spacecraft | null = null;

  stop() {
    if (this.port && this.port.reservedFor === this.craft && this.phase !== 'done') this.port.reservedFor = null;
    if (this.craft && !this.craft.carried) { this.craft.sas = this.prevSas; this.craft.rot.set(0, 0, 0); this.craft.trans.set(0, 0, 0); }
  }

  step(c: Spacecraft, dt: number, env: FlightEnv) {
    this.t += dt;
    this.craft = c;
    this.onStep?.(this);
    const link = this.dock.linkOf(c);
    if (link) {
      this.phase = link.state === 'docked' ? 'done' : 'capture';
      c.rot.set(0, 0, 0); c.trans.set(0, 0, 0);
      if (this.phase === 'done') { c.sas = this.prevSas; bus.emit('dock:auto', { phase: 'done', port: this.port, t: this.t }); }
      return this.phase === 'done';
    }
    if (this.phase === 'acquire') {
      this.port = this.dock.nearestPort(c, this.accepts);
      if (!this.port) { this.phase = 'abort'; this.reason = 'No free docking port'; ui.toast('Docking autopilot: no free port', 'warn', 4); return true; }
      this.port.reservedFor = c;
      this.prevSas = c.sas;
      c.sas = 'off';
      c.throttle = 0; c.lift = 0;
      this.phase = 'align';
      const r0 = this.dock.measure(c, this.port);
      this.holdAxial = Math.max(r0.axial, 6);
      bus.emit('dock:auto', { phase: 'align', port: this.port });
    }
    const port = this.port!;
    const r = this.dock.measure(c, port);
    this.lastReadout = r;
    // ---- attitude: ring against the port, clocking matched, spinning with the host
    const pos = _p, quat = new THREE.Quaternion();
    this.dock.dockedPose(c, port, pos, quat);
    const w = port.host.omega(new THREE.Vector3());
    const ev = new THREE.Vector3();
    steerAttitude(c, quat, w, { maxRate: [0.16, 0.16, 0.45], errOut: ev });
    // squared up on the axis (pitch / yaw), and separately clocked and spinning with the port (roll)
    const squared = Math.hypot(ev.x, ev.y) < 2.5 * Math.PI / 180;
    const clocked = Math.abs(ev.z) < 4 * Math.PI / 180 && Math.abs(r.rollRate) < 1.5;
    const aligned = squared && clocked;
    // ---- translation in the port frame
    const pp = new THREE.Vector3(), pd = new THREE.Vector3(), pu = new THREE.Vector3();
    port.pose(pp, pd, pu);
    const px = new THREE.Vector3().crossVectors(pu, pd);
    const amax = rcsAccel(c) * 0.85;
    // closing-speed profile along the axis (m/s, toward the port)
    let vWant: number;
    if (this.phase === 'align') {
      // hold station on the axis until squared up, then start in
      vWant = clamp((r.axial - this.holdAxial) * 0.4, -0.6, 0.6);
      if (squared && r.lateralDist < 1.5) { this.phase = 'approach'; this.cleared = true; bus.emit('dock:auto', { phase: 'approach', port }); }
    } else {
      vWant = clamp(0.1 + 0.15 * Math.max(0, r.axial), 0.1, 2.0);
      // a still-misaligned craft does not close in below 8 m
      if (!aligned && r.axial < 8) vWant = Math.min(vWant, Math.max(0, (r.axial - 6) * 0.3));
      if (r.axial < 3 && this.phase === 'approach') { this.phase = 'final'; bus.emit('dock:auto', { phase: 'final', port }); }
    }
    const aAx = clamp((vWant - r.closing) * 1.4, -amax, amax);
    const aX = clamp(-r.lateral.x * 0.35 - r.relVel.x * 1.2, -amax, amax);
    const aY = clamp(-r.lateral.y * 0.35 - r.relVel.y * 1.2, -amax, amax);
    const a = new THREE.Vector3().addScaledVector(pd, -aAx).addScaledVector(px, aX).addScaledVector(pu, aY);
    // cancel the apparent forces of the frame we fly in (orbital relative motion)
    if (env.accel) a.sub(env.accel(c.position(new THREE.Vector3()), c.velocity(new THREE.Vector3()), new THREE.Vector3()));
    const g = env.gravity(c.position(new THREE.Vector3()), new THREE.Vector3());
    a.sub(g);
    steerTranslation(c, a);
    void this.cleared;
    return false;
  }

}
