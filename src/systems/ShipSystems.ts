import type { Game } from '../core/Game';
import type { SystemState } from '../core/State';

export const SYSTEM_LABELS: Record<string, string> = {
  comms: 'Communications',
  nav: 'Navigation computer',
  engines: 'Propulsion',
  sensors: 'Sensor suite',
  environment: 'Environmental control',
  docking: 'Docking system',
  power: 'Power distribution',
  cryo: 'Cryogenic systems',
  rotation: 'Ring rotation drive',
  rcs: 'Reaction control',
  avionics: 'Avionics',
  lifesupport: 'Life support',
  gear: 'Landing gear',
  cargo: 'Cargo clamps',
};

export interface RepairJob {
  key: string; // vehicle.system
  t: number; // elapsed
  dur: number;
  by: string;
  stage: string;
}

/**
 * Damage, diagnostics and repair for every ship subsystem (GameState.systems).
 * Repairs are visible processes: diagnostics → isolation → repair → verification.
 * Creative "automatic repair" schedules jobs as soon as faults appear; "REPAIR NOW" starts one immediately.
 */
export class ShipSystems {
  jobs: RepairJob[] = [];

  constructor(private game: Game) {}

  get(vehicle: string, sys: string): SystemState | null {
    return this.game.state.systems[`${vehicle}.${sys}`] ?? null;
  }

  ok(vehicle: string, sys: string): boolean {
    const s = this.get(vehicle, sys);
    return !s || (s.online && s.integrity > 0.3);
  }

  integrity(vehicle: string, sys: string): number {
    return this.get(vehicle, sys)?.integrity ?? 1;
  }

  list(vehicle: string): [string, SystemState][] {
    const out: [string, SystemState][] = [];
    for (const [k, v] of Object.entries(this.game.state.systems)) {
      if (k.startsWith(vehicle + '.')) out.push([k.slice(vehicle.length + 1), v]);
    }
    return out;
  }

  damage(vehicle: string, sys: string, amount: number, fault: string, cause = 'unknown') {
    const key = `${vehicle}.${sys}`;
    const s = this.game.state.systems[key];
    if (!s) return;
    if (this.game.state.creative.damageProtection && cause !== 'sabotage:mann' && cause !== 'wear') amount *= 0.35;
    s.integrity = Math.max(0, s.integrity - amount);
    s.fault = fault;
    s.faultCause = cause;
    s.since = this.game.state.clock.earthTime;
    if (s.integrity < 0.3) s.online = false;
    this.game.events.emit('systemDamaged', { vehicle, system: sys, cause });
    this.game.log('maintenance', 'SYSTEM', `${vehicle.toUpperCase()} ${SYSTEM_LABELS[sys] ?? sys}: ${fault}`);
    this.game.notify(`${this.game.state.vehicles[vehicle]?.name ?? vehicle}: ${SYSTEM_LABELS[sys] ?? sys} fault — ${fault}`, s.online ? 'warn' : 'alert');
  }

  /** Start a visible repair job. */
  repair(vehicle: string, sys: string, by = 'auto', fast = true): RepairJob | null {
    const key = `${vehicle}.${sys}`;
    const s = this.game.state.systems[key];
    if (!s) return null;
    if (s.integrity >= 0.999 && !s.fault) return null;
    const existing = this.jobs.find((j) => j.key === key);
    if (existing) return existing;
    const dur = fast ? 4 + (1 - s.integrity) * 4 : 20 + (1 - s.integrity) * 60;
    const job: RepairJob = { key, t: 0, dur, by, stage: 'Running diagnostics' };
    this.jobs.push(job);
    this.game.log('maintenance', by.toUpperCase(), `Repair started: ${vehicle.toUpperCase()} ${SYSTEM_LABELS[sys] ?? sys}`);
    this.game.audio.ui('confirm');
    return job;
  }

  repairAll(vehicle: string, by = 'auto') {
    for (const [sys, s] of this.list(vehicle)) if (s.integrity < 0.999 || s.fault) this.repair(vehicle, sys, by);
  }

  faults(vehicle?: string): [string, SystemState][] {
    return Object.entries(this.game.state.systems).filter(([k, s]) => (!vehicle || k.startsWith(vehicle + '.')) && (s.fault || s.integrity < 0.999));
  }

  update(dt: number) {
    const st = this.game.state;
    if (st.creative.autoRepair) {
      for (const [key, s] of Object.entries(st.systems)) {
        if ((s.fault || s.integrity < 0.95) && !this.jobs.find((j) => j.key === key)) {
          const [v, sys] = key.split('.');
          // auto repair does not silently fix the derelict lander: that is a deliberate player task
          if (v === 'oldlander') continue;
          this.repair(v, sys, 'auto');
        }
      }
    }
    for (const j of [...this.jobs]) {
      j.t += dt;
      const f = j.t / j.dur;
      j.stage = f < 0.3 ? 'Running diagnostics' : f < 0.5 ? 'Isolating fault' : f < 0.9 ? 'Repairing' : 'Verifying';
      if (f >= 1) {
        const s = st.systems[j.key];
        const [v, sys] = j.key.split('.');
        if (s) {
          const cause = s.faultCause;
          s.integrity = 1;
          s.online = true;
          s.fault = null;
          s.faultCause = null;
          this.game.log('maintenance', j.by.toUpperCase(), `Repair complete: ${v.toUpperCase()} ${SYSTEM_LABELS[sys] ?? sys}${cause?.startsWith('sabotage') ? ' (anomaly: connector deliberately disengaged)' : ''}`);
          this.game.events.emit('systemRepaired', { vehicle: v, system: sys, by: j.by });
          this.game.notify(`${SYSTEM_LABELS[sys] ?? sys} restored (${v})`, 'ok', 3.5);
        }
        this.jobs.splice(this.jobs.indexOf(j), 1);
      }
    }
  }
}
