import * as THREE from 'three';
import type { EarthContent } from './EarthContent';
import { NPC } from '../../npc/NPC';
import { DialogueRunner } from '../../npc/Dialogue';
import { DIALOGUES } from '../../data/dialogues';
import { NEIGHBOURS, NASA } from '../../data/earthLayout';
import type { NpcState } from '../../core/State';
import { CHARACTERS, CREW, type CharacterDef } from '../../data/characters';
import { openCrewWheel, type CrewCommandId } from '../../npc/CrewWheel';

interface SchedStop {
  from: number; // local hour
  to: number;
  at: [number, number]; // x, z (world)
  indoors?: boolean;
  activity?: 'idle' | 'talk' | 'wave';
}

const SCHEDULES: Record<string, SchedStop[]> = {
  walt: [
    { from: 0, to: 6, at: [1330, 690], indoors: true },
    { from: 6, to: 9, at: [1318, 668] },
    { from: 9, to: 12, at: [1245, 640], activity: 'idle' },
    { from: 12, to: 13.5, at: [1330, 690], indoors: true },
    { from: 13.5, to: 16.5, at: [3, 13], activity: 'talk' },
    { from: 16.5, to: 20, at: [1318, 668] },
    { from: 20, to: 24, at: [1330, 690], indoors: true },
  ],
  june: [
    { from: 0, to: 6.5, at: [-1180, -760], indoors: true },
    { from: 6.5, to: 9.5, at: [-1158, -742] },
    { from: 9.5, to: 12, at: [22, -4], activity: 'idle' },
    { from: 12, to: 18, at: [-1158, -742] },
    { from: 18, to: 24, at: [-1180, -760], indoors: true },
  ],
  tomas: [
    { from: 0, to: 6, at: [2420, 420], indoors: true },
    { from: 6, to: 11, at: [2400, 400] },
    { from: 11, to: 15, at: [-40, -14], activity: 'idle' },
    { from: 15, to: 20, at: [2400, 400] },
    { from: 20, to: 24, at: [2420, 420], indoors: true },
  ],
};

const STAFF: { id: string; name: string; female: boolean; station?: string; patrol?: boolean }[] = [
  { id: 'staff1', name: 'Flight controller', female: false, station: 'mc_telemetry' },
  { id: 'staff2', name: 'Trajectory officer', female: true, station: 'mc_orbits' },
  { id: 'staff3', name: 'Propulsion engineer', female: false, station: 'mc_fuel' },
  { id: 'staff4', name: 'Systems engineer', female: true, station: 'mc_config' },
  { id: 'staff5', name: 'Navigation analyst', female: false, station: 'mc_saturn' },
  { id: 'staff6', name: 'Astrophysicist', female: true, station: 'mc_wormhole' },
  { id: 'staff7', name: 'Facility technician', female: false, patrol: true },
  { id: 'staff8', name: 'Security officer', female: true, patrol: true },
];

/**
 * People on Earth: neighbouring farmers with daily schedules, NASA staff, Director Kessler and the crew.
 */
export class EarthPeople {
  readonly npcs: NPC[] = [];
  readonly dialogue: DialogueRunner;
  gathering = false;
  private nasaPatrol: THREE.Vector3[] = [];

  constructor(readonly content: EarthContent) {
    this.dialogue = new DialogueRunner(content.game);
  }

  get game() {
    return this.content.game;
  }

  private nasaLocal(x: number, y: number, z: number) {
    const o = this.content.zone.gen.portalLevel;
    return new THREE.Vector3(NASA.portal.x + x, o + z, NASA.portal.z - y);
  }

  async load() {
    const game = this.game;
    const zone = this.content.zone;
    const nasa = (this.content as any).nasa;
    // farmers
    for (const id of ['walt', 'june', 'tomas']) {
      const st = game.state.npcs[id];
      const n = await new NPC(game, st, zone.ground).init('farmer');
      n.groundMode = 'fn';
      n.groundFn = (p) => zone.height(p.x, p.z);
      const stop = this.stopFor(id);
      if (Math.abs(st.pos[0]) + Math.abs(st.pos[2]) < 1e-3) n.pos.set(stop.at[0], zone.height(stop.at[0], stop.at[1]), stop.at[1]);
      n.think = (npc, dt) => this.farmerBrain(npc, dt);
      this.add(n);
    }
    if (!nasa) return;
    const station = (iid: string) => {
      const node = nasa.site.inst.nodes.get(`station_${iid}`);
      return node ? nasa.site.localPos(node) : null;
    };
    // director
    const ks = game.state.npcs.kessler;
    const kn = await new NPC(game, ks, zone.ground).init('staff');
    const dspot = nasa.site.inst.nodes.get('director_spot');
    if (dspot) kn.pos.copy(nasa.site.localPos(dspot));
    kn.yaw = Math.PI / 2;
    this.add(kn);
    // crew at their stations (if still on Earth)
    const stationOf: Record<string, string> = { ward: 'mc_eng', sato: 'mc_sci', reyes: 'mc_med' };
    for (const id of CREW) {
      const st = game.state.npcs[id];
      if (st.frame !== 'earth') continue;
      const n = await new NPC(game, st, zone.ground).init('jumpsuit');
      const sp = station(stationOf[id]);
      if (sp) {
        n.pos.copy(sp);
        if (game.state.mission.decision !== 'endurance') n.sit(sp, Math.PI / 2, 'type');
      }
      this.add(n);
    }
    // staff (transient)
    for (const s of STAFF) {
      const st: NpcState = { id: s.id, frame: 'earth', pos: [0, 0, 0], yaw: Math.PI / 2, task: 'staff', taskData: {}, mood: 0, stress: 0.2, health: 1, relationship: 0, memory: [], following: false, aboard: null, access: [], alive: true, suit: false };
      const def: CharacterDef = { ...CHARACTERS.capcom, id: s.id, name: s.name, role: 'NASA staff', look: { ...CHARACTERS.capcom.look, female: s.female, hair: s.female ? 'hair_brown' : 'hair_dark', skin: s.id.endsWith('3') || s.id.endsWith('6') ? 'skin_dark' : 'skin', height: s.female ? 1.66 : 1.78 } };
      const n = new NPC(game, st, zone.ground);
      (n as any).def = def;
      await n.init('staff');
      if (s.station) {
        const sp = station(s.station);
        if (sp) n.sit(sp, Math.PI / 2, 'type');
      } else {
        this.nasaPatrol = [this.nasaLocal(0, 40, 0), this.nasaLocal(0, 70, 0), this.nasaLocal(10, 82, 0), this.nasaLocal(40, 82, 0), this.nasaLocal(10, 82, 0), this.nasaLocal(-10, 82, 0), this.nasaLocal(-22, 82, 0), this.nasaLocal(-10, 82, 0), this.nasaLocal(0, 70, 0)];
        const start = s.id === 'staff7' ? 0 : 4;
        n.pos.copy(this.nasaPatrol[start]);
        let idx = start;
        n.think = (npc) => {
          if (!npc.path.length) {
            idx = (idx + 1) % this.nasaPatrol.length;
            npc.goTo(this.nasaPatrol[idx], 1.2);
          }
        };
      }
      this.add(n);
    }
    if (game.state.mission.decision === 'endurance') this.placeCrewAtSilo();
  }

  private add(n: NPC) {
    this.npcs.push(n);
    const game = this.game;
    game.interaction.add({
      id: `npc:${n.state.id}`,
      targets: [n.body.root],
      range: 3.2,
      label: () => (n.visible ? `Talk to ${n.def.name}` : null),
      use: () => this.talk(n),
    });
  }

  talk(n: NPC) {
    const tree = DIALOGUES[n.state.id] ?? DIALOGUES.staff;
    n.faceTo(this.game.player.pos);
    const wasSitting = n.sitting;
    n.talking = 999;
    this.dialogue.start(tree, 'start', () => {
      n.talking = 0;
      if (wasSitting && !n.sitting) n.sit(wasSitting.pos, wasSitting.yaw, wasSitting.anim);
    });
  }

  // -------------------------------------------------------------------------------------------- farmers
  private stopFor(id: string): SchedStop {
    const hrs = this.content.zone.localHours();
    const list = SCHEDULES[id];
    return list.find((s) => hrs >= s.from && hrs < s.to) ?? list[0];
  }

  private farmerBrain(n: NPC, dt: number) {
    const zone = this.content.zone;
    let stop = this.stopFor(n.state.id);
    // dust storms send everyone home
    if (zone.storm > 0.45) {
      const home = NEIGHBOURS.find((nb) => nb.id === ({ walt: 'hollis', june: 'pike', tomas: 'ruiz' } as any)[n.state.id]);
      if (home) stop = { from: 0, to: 24, at: [home.pos[0], home.pos[2]], indoors: true };
    }
    const target = new THREE.Vector3(stop.at[0], 0, stop.at[1]);
    const flat = Math.hypot(n.pos.x - target.x, n.pos.z - target.z);
    const near = this.game.camera.position.distanceTo(n.pos) < 450;
    if (flat > 1.5) {
      if (!near && flat > 30) {
        // off-screen: walk logically along the straight line at walking speed (cheap)
        const step = Math.min(flat, 1.4 * dt);
        n.pos.x += ((target.x - n.pos.x) / flat) * step;
        n.pos.z += ((target.z - n.pos.z) / flat) * step;
        n.pos.y = zone.height(n.pos.x, n.pos.z);
        n.path = [];
      } else if (!n.path.length) {
        target.y = zone.height(target.x, target.z);
        n.goTo(target, zone.storm > 0.45 ? 2.8 : 1.35);
      }
      n.visible = near;
    } else {
      n.path = [];
      n.visible = !stop.indoors && near;
      n.forcedAnim = stop.activity === 'talk' && n.distToPlayer() < 8 ? 'wave' : null;
      if (n.forcedAnim === 'wave' && !n.state.memory.includes('waved')) {
        n.state.memory.push('waved');
        this.game.say(n.state.id, n.state.id === 'walt' ? 'Afternoon! Got a minute?' : 'Hey there!', 3);
      }
    }
  }

  // -------------------------------------------------------------------------------------------- crew
  gatherForLaunch() {
    this.gathering = true;
    const nasa = (this.content as any).nasa;
    if (!nasa) return;
    const elev = this.nasaLocal(0, 98, 0);
    for (const n of this.npcs) {
      if (!CREW.includes(n.state.id)) continue;
      n.stand();
      n.goTo([this.nasaLocal(-18, 82, 0), elev], 1.5, () => {
        // they take the elevator down ahead of the commander
        n.visible = false;
        setTimeout(() => this.placeCrewAtSilo(), 4000);
      });
    }
  }

  private placeCrewAtSilo() {
    const spots = [this.nasaLocal(6, 178, -35), this.nasaLocal(8, 180, -35), this.nasaLocal(10, 178, -35)];
    let i = 0;
    for (const n of this.npcs) {
      if (!CREW.includes(n.state.id)) continue;
      n.stop();
      n.sitting = null;
      n.pos.copy(spots[i++]);
      n.yaw = Math.PI;
      n.visible = true;
      n.state.task = 'await_launch';
    }
  }

  crewNear(radius = 15): NPC[] {
    return this.npcs.filter((n) => CREW.includes(n.state.id) && n.visible && n.distToPlayer() < radius);
  }

  /** Move NPCs standing on a moving platform. */
  carry(nodeW: THREE.Vector3, bounds: THREE.Box3, dy: number) {
    for (const n of this.npcs) {
      const l = n.pos.clone().sub(nodeW);
      if (l.x > bounds.min.x && l.x < bounds.max.x && l.z > bounds.min.z && l.z < bounds.max.z && l.y > -0.8 && l.y < 2.5) n.pos.y += dy;
    }
  }

  update(dt: number) {
    const game = this.game;
    const cam = game.camera.position;
    for (const n of this.npcs) {
      const d = n.pos.distanceTo(cam);
      // far NPCs think at low rate and skip animation
      if (d > 220 && n.think !== null) {
        n.think?.(n, dt);
        n.sync();
        continue;
      }
      if (d > 220) continue;
      n.update(dt);
      // follow command
      if (n.state.following) {
        const pd = n.distToPlayer();
        if (pd > 3 && (!n.path.length || n.path[0].distanceTo(game.player.pos) > 2)) n.goTo(game.player.pos.clone(), pd > 8 ? 3.2 : 1.6);
        if (pd < 2.2) n.stop();
      }
    }
    // crew commands
    if (game.input.pressed('crew') && !game.ui.panelOpen && !game.control) {
      openCrewWheel(game, this.crewNear(), (cmd, npcs) => this.command(cmd, npcs), (c) => ['follow', 'wait', 'console', 'prepare', 'analyze'].includes(c));
    }
  }

  private command(cmd: CrewCommandId, npcs: NPC[]): string | true {
    for (const n of npcs) {
      n.stand();
      n.state.following = cmd === 'follow';
      if (cmd === 'wait') n.stop();
      if (cmd === 'console') {
        const nasa = (this.content as any).nasa;
        const iid = ({ ward: 'mc_eng', sato: 'mc_sci', reyes: 'mc_med' } as any)[n.state.id];
        const node = nasa?.site.inst.nodes.get(`station_${iid}`);
        if (!node) return 'No console available here.';
        const p = nasa.site.localPos(node);
        n.goTo(p, 1.5, () => n.sit(p, Math.PI / 2, 'type'));
      }
      if (cmd === 'prepare') n.state.task = 'prepare';
      if (cmd === 'analyze') this.game.notify(`${n.def.name}: Air quality ${Math.round(40 + this.content.zone.storm * 900)} µg/m³ particulates, ${this.content.zone.storm > 0.3 ? 'storm conditions' : 'clear'}.`, 'info', 5);
    }
    return true;
  }
}
