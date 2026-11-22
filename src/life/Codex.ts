import { bus } from '../core/events';
import { ui } from '../ui/store';
import { SPECIES } from './species';

/**
 * The exobiology field database. Research on a species advances through levels:
 *   0 unknown   nothing recorded
 *   1 contact   an unidentified sonar or sensor contact, an anomaly in the water or the substrate
 *   2 sighted   a confirmed visual record: morphology only (first scan or a clear sighting)
 *   3 behaviour repeated behavioural evidence (feeding, refuge, signals, nesting) or further scans
 *   4 studied   several behaviours documented and scanned at close range
 * Codex entries unlock by level; each carries its certainty label.
 */
export interface CodexRecord {
  level: number;
  sightings: number;
  scans: number;
  /** behaviours documented (keys, see BEHAVIOUR) */
  seen: string[];
  /** individuals told apart (ids) */
  individuals: string[];
  /** largest body measured (m) */
  maxSize: number;
}

export const BEHAVIOUR: Record<string, string> = {
  grazing: 'Grazing the microbial film', clamped: 'Clamping to rock when disturbed', shelter: 'Taking shelter before the wave',
  strike: 'Ambush strike', kill: 'Capture of prey', miss: 'Missed strike, recovery and retreat', warning: 'Threat display',
  feeding: 'Filter feeding', lure: 'Luring prey with its light', calls: 'Acoustic contact calls', flank: 'Coordinated flanking',
  building: 'Placing stones on its nest wall', repair: 'Repairing a damaged nest wall', guarding: 'Guarding eggs',
  camouflage: 'Changing colour to match the rock', handling: 'Handling a foreign object', buried: 'Lying buried in the sediment',
  emerging: 'Emerging after the wave', patrol: 'Patrolling its range', investigate: 'Investigating the vehicle', drifting: 'Drifting with the flow',
  growth: 'Membranes opening in favourable conditions', dormant: 'Dormancy', swarm: 'Swarm flow and scattering', glide: 'Gliding on shear and updrafts',
  dive: 'Dive from a stable layer', grapple: 'Grapple and release',
  retract: 'Drawing in its living tissue at a disturbance', crossing: 'Crossing open ground between refuges', curl: 'Curling into its shell',
  stalking: 'Stalking prey under camouflage', leap: 'A coiled leap at prey', territorial: 'Territorial shove',
};

class CodexStore {
  records: Record<string, CodexRecord> = {};

  rec(id: string) {
    return (this.records[id] ??= { level: 0, sightings: 0, scans: 0, seen: [], individuals: [], maxSize: 0 });
  }

  level(id: string) { return this.records[id]?.level ?? 0; }

  private raise(id: string, lv: number) {
    const r = this.rec(id);
    if (lv <= r.level) return;
    const first = r.level === 0;
    r.level = lv;
    const s = SPECIES[id];
    if (!s) return;
    if (lv === 1) ui.toast('Unidentified contact logged in the field codex', 'info', 3);
    else if (lv === 2) ui.toast(`${first ? 'New species' : 'Identified'}: ${s.name} (${s.latin})`, 'good', 5);
    else ui.toast(`Field codex: ${s.name} · ${['', '', '', 'behaviour documented', 'species studied'][lv]}`, 'good', 4);
    bus.emit('sfx', { id: lv >= 2 ? 'chime' : 'beep', ui: true });
    bus.emit('codex', { id, level: lv });
  }

  /** a sensor contact: sonar echo, an anomaly */
  contact(id: string) { this.raise(id, 1); }

  /** a clear visual record of an individual */
  sight(id: string, individual: string, size: number) {
    const r = this.rec(id);
    r.sightings++;
    if (!r.individuals.includes(individual)) r.individuals.push(individual);
    r.maxSize = Math.max(r.maxSize, size);
    this.raise(id, Math.max(r.level, 2));
  }

  /** a completed scan at close range */
  scan(id: string, individual: string, size: number) {
    const r = this.rec(id);
    r.scans++;
    r.maxSize = Math.max(r.maxSize, size);
    if (!r.individuals.includes(individual)) r.individuals.push(individual);
    const lv = r.scans >= 3 && r.seen.length >= 2 ? 4 : r.scans >= 2 || r.seen.length >= 2 ? 3 : 2;
    this.raise(id, Math.max(r.level, lv));
  }

  /** a behaviour seen by the player */
  observe(id: string, what: string) {
    const r = this.rec(id);
    if (!BEHAVIOUR[what] || r.seen.includes(what)) return;
    r.seen.push(what);
    ui.toast(`Observed · ${SPECIES[id]?.name ?? id}: ${BEHAVIOUR[what].toLowerCase()}`, 'info', 4);
    const lv = r.seen.length >= 3 && r.scans >= 1 ? 4 : r.seen.length >= 2 ? 3 : 2;
    this.raise(id, Math.max(r.level, Math.min(lv, r.scans ? 4 : 3)));
  }

  serialize() { return this.records; }
  deserialize(d: any) { this.records = d && typeof d === 'object' ? d : {}; }
}

export const codex = new CodexStore();
