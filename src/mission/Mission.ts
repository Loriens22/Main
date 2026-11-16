import { bus } from '../core/events';
import { story } from '../core/Story';

export type Phase = 'earth' | 'prep' | 'boarding' | 'countdown' | 'ascent' | 'orbit' | 'docked' | 'transit' | 'saturn' | 'wormhole' | 'gargantua' | 'surface';

/** Launch vehicle data shared by the Blender model, the launch simulation and the mission displays. */
export const LAUNCHER = {
  stage1: { dry: 42000, prop: 560000, thrust: 10.6e6, isp: 285, burn: 0 },
  stage2: { dry: 9000, prop: 108000, thrust: 1.15e6, isp: 440, burn: 0 },
  adapter: 1200,
  ranger: 28000,
};
const G0 = 9.80665;
LAUNCHER.stage1.burn = (LAUNCHER.stage1.prop * LAUNCHER.stage1.isp * G0) / LAUNCHER.stage1.thrust;
LAUNCHER.stage2.burn = (LAUNCHER.stage2.prop * LAUNCHER.stage2.isp * G0) / LAUNCHER.stage2.thrust;

/** Ideal delta-v of each stage of the stack (Tsiolkovsky), m/s. */
export function launcherDeltaV() {
  const L = LAUNCHER;
  const up = L.stage2.dry + L.stage2.prop + L.adapter + L.ranger;
  const m0 = L.stage1.dry + L.stage1.prop + up;
  const dv1 = L.stage1.isp * G0 * Math.log(m0 / (m0 - L.stage1.prop));
  const dv2 = L.stage2.isp * G0 * Math.log(up / (up - L.stage2.prop));
  return { dv1, dv2, total: dv1 + dv2, m0, twr: L.stage1.thrust / (m0 * G0) };
}

export interface WorldBrief {
  id: string; name: string; scout: string; status: string; gravity: number; day: string; dilation: string; surface: string; risk: string; signal: string;
}

/** What the Lazarus probes reported — the data the crew has before leaving Earth. */
export const LAZARUS: WorldBrief[] = [
  { id: 'miller', name: "Miller's planet", scout: 'Dr. Laura Miller', status: 'Beacon: positive — repeating', gravity: 1.3, day: 'Unknown', dilation: '1 hour on the surface ≈ 7 years outside', surface: 'Global shallow ocean, liquid water, organics', risk: 'Deep in Gargantua\'s gravity well: extreme time dilation and tides', signal: 'Positive thumbs-up telemetry, short data set' },
  { id: 'mann', name: "Mann's planet", scout: 'Dr. Hugh Mann', status: 'Beacon: positive — strong', gravity: 0.8, day: '67 hours', dilation: 'Negligible', surface: 'Frozen cloud decks, ammonia-rich air, surface reported below the ice', risk: 'Cold; air not breathable without filtration; long transfer', signal: 'Most complete data set of all twelve — reports a habitable surface' },
  { id: 'edmunds', name: "Edmunds' planet", scout: 'Dr. Wolf Edmunds', status: 'Beacon: positive — stopped three years ago', gravity: 0.95, day: '24 hours 40 minutes', dilation: 'Negligible', surface: 'Dry rocky desert, thin breathable air, sub-surface water traces', risk: 'Transmissions ceased; farthest target', signal: 'Good early data, then silence (equipment failure suspected)' },
];

/**
 * Mission state that survives zone changes: which phase the expedition is in, the commander's decision
 * at the facility, the launch countdown and a running log shown on the mission terminals.
 */
export class Mission {
  phase: Phase = 'earth';
  choice: 'none' | 'earth' | 'endurance' = 'none';
  /** seconds to lift-off while a countdown runs, otherwise -1 */
  countdown = -1;
  hold = false;
  log: { t: number; text: string }[] = [];
  private clock = 0;

  note(text: string) {
    this.log.push({ t: this.clock, text });
    if (this.log.length > 80) this.log.shift();
    bus.emit('mission:log', text);
  }

  setPhase(p: Phase) {
    if (p === this.phase) return;
    this.phase = p;
    bus.emit('mission:phase', p);
  }

  decide(c: 'earth' | 'endurance') {
    this.choice = c;
    story.set('mission_choice', c);
    if (c === 'endurance') {
      story.set('mission_accepted');
      if (this.phase === 'earth') this.setPhase('prep');
      this.note('Commander authorised the Endurance mission. Launch preparation started.');
    } else {
      story.set('mission_accepted', false);
      if (this.phase === 'prep' || this.phase === 'boarding') this.setPhase('earth');
      this.note('Commander elected to continue research on Earth. No departure scheduled.');
    }
    bus.emit('mission:decision', c);
  }

  update(dt: number) { this.clock += dt; }

  serialize() { return { phase: this.phase, choice: this.choice, countdown: this.countdown, log: this.log.slice(-30), clock: this.clock }; }
  deserialize(d: any) {
    if (!d) return;
    this.phase = d.phase ?? 'earth'; this.choice = d.choice ?? 'none'; this.countdown = d.countdown ?? -1; this.log = d.log ?? []; this.clock = d.clock ?? 0;
  }
}

export const mission = new Mission();
