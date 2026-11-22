import * as THREE from 'three';
import { assets, Model } from '../../render/Assets';
import { materials } from '../../render/Materials';
import { Building } from '../Building';
import type { RAPIER } from '../../physics/Physics';
import type { Interactable } from '../../player/Interaction';
import { NPC, NPCManager } from '../../npc/NPC';
import type { DialogueDef } from '../../npc/Dialogue';
import { story } from '../../core/Story';
import { bus } from '../../core/events';
import { ui } from '../../ui/store';
import { mission } from '../../mission/Mission';
import { LAZARUS_SITE, MANN_RIDGE } from '../terrain/sites';
import type { SurfaceZone } from './SurfaceZone';
import type { Flight } from '../../vehicles/Flight';
import type { ReaderAction, ReaderEntry } from '../../ui/panels/ReaderPanel';

const _v = new THREE.Vector3(), _w = new THREE.Vector3();

/** Blender (x, y, z) in a model's own frame -> three.js local (x, z, -y) */
const B = (x: number, y: number, z: number) => new THREE.Vector3(x, z, -y);

type MannStage = 'cryo' | 'waking' | 'idle' | 'walk' | 'ridge' | 'reveal' | 'flee' | 'hatch' | 'leave' | 'gone';

/** oxygen left in a cracked suit: enough to reach shelter at a run, not at a walk */
const BREACH_O2 = 120;

/**
 * The Lazarus scouts' sites on the three worlds of Gargantua, and what happens there:
 *
 *   Miller   the wreck of her lander in the shallows, the flight recorder still strobing beside it.
 *   Mann     his shelter on the glacier (walk-in), Mann himself in the cryo casket, his log at the desk, the survey
 *            robot with its data core. Wake him and he tells the crew what they came to hear; follow him to the ridge
 *            and the truth comes with a cracked visor. The robot's core is wired to its power cell.
 *   Edmunds  his camp among the boulders: dark, the beacon silent, the greenhouse mostly dead, his log in the
 *            quarters. Power can be reconnected, the beacon restarted, seeds collected, a cairn raised.
 *
 * Story facts (core/Story) carry what has been done across saves and visits.
 */
export class LazarusSites {
  world: string | null = null;
  private gen = 0;
  private root = new THREE.Group();
  private models: Model[] = [];
  private colliders: RAPIER.Collider[] = [];
  private buildings: Building[] = [];
  private inter: Interactable[] = [];
  npcs: NPCManager | null = null;
  mann: NPC | null = null;
  private stage: MannStage = 'cryo';
  private stageT = 0;
  private line = 0;
  private shelter: Model | null = null;
  private camp: Model | null = null;
  private lid: THREE.Object3D | null = null;
  private lidQ0 = new THREE.Quaternion();
  private lidT = 0;
  private cryoAnchor: THREE.Object3D | null = null;
  private strobeT = 0;
  /** seconds of oxygen left in a cracked suit (null: the suit is whole) */
  breach: number | null = null;
  private heldNote = false;
  private waitNag = 0;

  constructor(private zone: SurfaceZone) { this.root.name = 'lazarus'; }

  private get game() { return this.zone.game; }
  private ground(x: number, z: number) { return this.zone.terrain ? this.zone.terrain.source.height(x, z) : 0; }

  /** Show the camp of world `id` (or nothing, for every other world). */
  setWorld(id: string) {
    if (id === this.world) return;
    this.unload();
    if (!LAZARUS_SITE[id]) return;
    this.world = id;
    const gen = ++this.gen;
    void this.load(id, gen);
  }

  private async load(id: string, gen: number) {
    const names = id === 'miller' ? ['miller_wreck'] : id === 'mann' ? ['mann_shelter', 'survey_robot', 'lazarus_lander'] : ['edmunds_base', 'lazarus_lander'];
    const ms = await Promise.all(names.map((n) => assets.load(n)));
    if (gen !== this.gen) return;
    if (!this.root.parent) this.zone.root.add(this.root);
    const s = LAZARUS_SITE[id];
    const dx = -s.x, dz = -s.z;
    if (id === 'miller') this.setupMiller(ms[0], s.x, s.z, s.yaw);
    if (id === 'mann') await this.setupMann(ms[0], ms[1], ms[2], s.x, s.z, Math.atan2(dx, dz) + s.yaw, gen);
    if (id === 'edmunds') this.setupEdmunds(ms[0], ms[1], s.x, s.z, Math.atan2(dz, -dx) + s.yaw);
  }

  private unload() {
    this.gen++;
    const I = this.game.interactions;
    for (const i of this.inter) I.remove(i);
    this.inter = [];
    for (const b of this.buildings) for (const f of b.fixtures) this.zone.lights.remove(f);
    this.buildings = [];
    this.zone.phys.remove(this.colliders);
    this.colliders = [];
    for (const m of this.models) m.root.removeFromParent();
    this.models = [];
    if (this.npcs) for (const n of [...this.npcs.list]) this.npcs.release(n);
    this.npcs = null;
    this.mann = null;
    this.shelter = null; this.camp = null; this.lid = null; this.cryoAnchor = null;
    this.world = null;
    this.root.removeFromParent();
  }

  /** put a model on the ground at (x, z), turned by yaw; its meshes become static collision */
  private put(m: Model, x: number, z: number, yaw: number, y?: number) {
    m.root.position.set(x, y ?? this.ground(x, z), z);
    m.root.rotation.set(0, yaw, 0);
    this.root.add(m.root);
    m.root.updateMatrixWorld(true);
    this.models.push(m);
    this.colliders.push(...this.zone.phys.addTrimesh(m.colliders));
    return m;
  }

  private building(name: string, m: Model, lightsOn: boolean) {
    const b = new Building(name, m, this.zone.phys, this.game.interactions, this.zone.lights, { lightsOn, actors: () => this.actors() });
    this.buildings.push(b);
    return b;
  }

  private actors() {
    const out = [this.game.player.pos];
    if (this.mann && this.mann.root.visible) out.push(this.mann.pos);
    return out;
  }

  /** an interaction at a node (or a fixed local point of a model), scoped to the surface zone */
  private spot(at: THREE.Object3D | (() => THREE.Vector3), radius: number, label: () => string, use: () => void, range = 2.6) {
    const pos = typeof at === 'function' ? (out: THREE.Vector3) => out.copy(at()) : (out: THREE.Vector3) => at.getWorldPosition(out);
    const i = this.game.interactions.add({ position: pos, radius, range, label, use });
    (i as any).__scope = 'surface';
    this.inter.push(i);
    return i;
  }

  private read(title: string, sub: string, entries: ReaderEntry[], actions?: ReaderAction[]) {
    bus.emit('ui:click');
    this.game.openPanel('reader', { title, sub, entries, actions });
  }

  // ============================================================================================== Miller
  private setupMiller(wreck: Model, x: number, z: number, yaw: number) {
    this.put(wreck, x, z, yaw);
    this.building('miller_wreck', wreck, true);
    const rec = wreck.node('pickup', 'recorder');
    if (rec && story.has('miller_recorder')) rec.visible = false;
    if (story.has('miller_recorder')) this.zone.lights.setRoom('recorder', false, 'miller_wreck');
    this.spot(() => wreck.root.localToWorld(_w.copy(B(0, 0, 2.2))), 3.2, () => 'Examine the wreck', () => this.read("Dr. Miller's lander", 'Lazarus 1 · wreck', [
      { text: 'The lander lies on its side in knee-deep water, the roof torn away and lying upside down twenty metres off, three of its four legs snapped. Panels and struts are strewn away from it in one direction: the way the waves go.' },
      { text: 'The breaks are bright and clean. By this planet\'s clock the lander went over less than an hour ago. By the Endurance\'s, more than seven years.' },
      { text: 'There is no one aboard.' },
    ]), 4.5);
    if (rec) this.spot(rec, 0.7, () => (story.has('miller_recorder') ? '' : "Recover Dr. Miller's flight recorder"), () => this.takeRecorder(rec));
  }

  private takeRecorder(rec: THREE.Object3D) {
    if (story.has('miller_recorder')) return;
    story.set('miller_recorder');
    rec.visible = false;
    this.zone.lights.setRoom('recorder', false, 'miller_wreck');
    bus.emit('sfx', { id: 'clamp', ui: true });
    mission.note("Recovered Dr. Miller's flight recorder from the wreck of Lazarus 1.");
    ui.toast('Flight recorder recovered', 'good', 4);
    this.read("Dr. Miller's flight recorder", 'Lazarus 1 · last data set', [
      { head: '+00:00:00', text: 'Touchdown. Sea depth 0.5 m. Beacon set: POSITIVE (liquid water, organic chemistry).' },
      { head: '+00:06:12', text: 'Sea samples: amino acids and lipids in solution. Chemistry compatible with life. No organisms found.' },
      { head: '+00:41:30', text: 'Swell observed on the horizon. Height not determined: the horizon is mountains. Mountains do not move.' },
      { head: '+01:07:48', text: 'Accelerometers saturate. Hull pressure lost. Recorder ejected.' },
      { head: 'What it means', text: 'Her whole mission lasted sixty-eight minutes of her own time. The beacon has been repeating its first good news ever since: at this depth in Gargantua\'s well, that is nearly eight years outside. The waves are not weather. They are the planet.' },
    ]);
  }

  // ============================================================================================== Mann
  private async setupMann(sh: Model, robot: Model, lander: Model, x: number, z: number, yaw: number, gen: number) {
    this.shelter = sh;
    this.put(sh, x, z, yaw);
    const b = this.building('mann_shelter', sh, !story.has('robot_blast'));
    const door = b.slides.get('shelter');
    if (door && story.has('mann_sealed')) door.enabled = false;
    // the robot where Mann left it, at the far end of the room; his lander beside the shelter
    const rs = sh.marker('robot', 'spot');
    rs?.node.getWorldPosition(_v);
    const ry = yaw + (rs ? rs.node.rotation.y : 0);
    this.put(robot, _v.x, _v.z, ry, _v.y);
    sh.root.localToWorld(_v.copy(B(11, -6, 0)));
    this.put(lander, _v.x, _v.z, yaw + 0.5);
    this.building('mann_lander', lander, false);
    // the cryo lid (opens) and the place in the casket where Mann lies
    this.lid = sh.node('lid', 'cryo') ?? null;
    if (this.lid) this.lidQ0.copy(this.lid.quaternion);
    const cm = sh.marker('cryo', 'mann')!;
    this.cryoAnchor = new THREE.Object3D();
    this.cryoAnchor.position.copy(cm.node.position).add(new THREE.Vector3(0, 0.1, -0.88));
    this.cryoAnchor.rotation.x = Math.PI / 2;
    cm.node.parent!.add(this.cryoAnchor);

    // the log and the robot's data core
    const log = sh.node('log', 'mann');
    if (log) this.spot(log, 0.5, () => "Read Dr. Mann's log", () => this.mannLog());
    const core = robot.node('core', 'robot');
    if (core) this.spot(core, 0.45, () => (story.has('robot_core') || story.has('robot_blast') ? 'Examine the survey robot' : 'Examine the survey robot\'s data core'), () => this.robotCore());
    this.spot(() => lander.root.localToWorld(_w.copy(B(-2.6, -0.4, 1.9))), 1.2, () => 'Inspect the Lazarus lander', () => this.read("Dr. Mann's lander", 'Lazarus 7', [
      { text: 'A one-way craft: there is no ascent stage, and there never was. The batteries are flat; frost has filled the cockpit strip.' },
      { text: 'The hatch log shows one opening, the day it landed, and none since.' },
    ]), 3.5);

    // Dr. Mann
    if (story.has('mann_gone')) return;
    this.npcs = new NPCManager({ game: this.game, phys: this.zone.phys, parent: this.zone.root, ground: (px, pz) => this.ground(px, pz) });
    const n = await this.npcs.spawn({
      id: 'mann', name: 'Dr. Hugh Mann', role: 'Lazarus scout', model: 'char_astronaut',
      look: { hair: 'hair_gray', skin: 'skin', scale: 1.0, helmet: true },
      state: { location: "Mann's shelter", emotion: 'calm', knowledge: ['lazarus'] },
      dialogue: this.mannTalk(), walkSpeed: 2.0,
    }, _v.set(x, this.ground(x, z), z), 0);
    if (gen !== this.gen) { this.npcs?.release(n); return; }
    this.mann = n;
    n.human.setHelmet(false);
    if (story.has('mann_awake')) {
      this.setStage('idle');
      if (this.lid) { this.lidT = 1; this.poseLid(); }
      n.place(this.local(-0.75, -1.0, 0.3), yaw);
    } else {
      this.setStage('cryo');
      n.attach(this.cryoAnchor, 'lie');
      n.dialogue = null;
      this.spot(cm.node, 0.7, () => (this.stage === 'cryo' ? 'Open the cryo casket' : ''), () => this.wakeMann());
    }
  }

  /** a point of the shelter (Blender coordinates of the model) in the zone */
  private local(x: number, y: number, z: number) { return this.shelter!.root.localToWorld(B(x, y, z)); }

  private setStage(s: MannStage) { this.stage = s; this.stageT = 0; this.line = 0; }

  private poseLid() {
    if (!this.lid) return;
    const e = this.lidT * this.lidT * (3 - 2 * this.lidT);
    // hinged along the casket's long side (Blender +Y = three -Z): swing up and over
    this.lid.quaternion.copy(this.lidQ0).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, -1), 1.75 * e));
  }

  private wakeMann() {
    if (this.stage !== 'cryo' || !this.mann) return;
    story.set('mann_awake');
    bus.emit('sfx', { id: 'cryo', ui: true });
    this.setStage('waking');
  }

  private mannTalk(): DialogueDef {
    const go = () => this.startWalk();
    return {
      greet: (c) => (c.n('__greet') === 0
        ? ['...Are you real? Sorry. Sorry. The sleep plays tricks on you.', 'You came. After all this time, somebody actually came.']
        : this.stage === 'idle' ? 'Still here. Still real. What do you need?' : 'Not now. Keep moving.'),
      topics: [
        {
          id: 'alone', label: 'How long were you alone?',
          say: [['Long enough to stop counting days and start counting sleeps. I would wake, check the beacon, check the data, check the beacon again.', 'You cannot imagine what it is to listen for years and hear nothing back. Not a carrier wave. Nothing.']],
        },
        {
          id: 'world', label: 'What did you find here?',
          say: [['The clouds are frozen and the air up here would kill you, yes. But the cloud is a lid. Under the ice sheet there is ground, warm ground, and organics in the meltwater.', 'Everything I sent is in my archive. It can work. With the colony module, it can work.']],
          effect: (c) => { c.npc.state.emotion = 'deceptive'; },
        },
        {
          id: 'robot', label: 'What happened to your survey robot?',
          say: [['It failed in the first long winter. The cold got into its joints, then into its memory: it began writing garbage over good data.', 'I powered it down before it could ruin the archive. Leave it alone. There is nothing in it you need, and its power cell is not stable.']],
          effect: () => story.set('mann_robot_warned'),
        },
        {
          id: 'show', label: 'Show us the survey site.', after: 'world', when: () => this.stage === 'idle',
          say: [['Gladly. Gladly! It is up on the ridge, a few hundred metres. In this gravity you will hardly feel the climb.', 'Seal your helmet and stay close to me. The crevasses do not always show.']],
          end: true, effect: go,
        },
        {
          id: 'lie', label: 'Your own log says the data was faked.', when: () => story.has('mann_log') && this.stage === 'idle',
          say: [['...You read it.', 'Then you know what it was like. Twelve of us went out to die alone, and I was the one who could not. Every day the beacon said come, I lived another day.', 'I am sorry. I cannot stay here. I will not.']],
          end: true, effect: () => { this.setStage('reveal'); this.line = 3; this.stageT = 9.5; },
        },
      ],
      bye: () => 'Do not go far.',
    };
  }

  private startWalk() {
    if (!this.mann) return;
    this.mann.human.setHelmet(true);
    this.setStage('walk');
    ui.toast('Follow Dr. Mann to the survey site', 'info', 5);
  }

  private mannLog() {
    story.set('mann_log');
    this.read("Dr. Mann's log", 'Lazarus 7 · personal entries', [
      { head: 'Day 1', text: 'Down safe. The cloud deck is frozen solid four kilometres up: like standing under a ceiling of glass.' },
      { head: 'Day 40', text: 'The robot has finished its survey of the basin. Ammonia in the air, chlorides in the ice. No liquid water within drilling depth. Nothing organic. Nothing.' },
      { head: 'Day 212', text: 'Sent the summary. Then sat watching the send light for an hour.' },
      { head: 'Day 213', text: 'Sent it again, edited. The numbers that matter say what they need to say now. The beacon says: come.' },
      { head: 'Day 590', text: 'The robot flagged the difference between its archive and the beacon. I have shut it down, and wired its core to the power cell so that no one reads it but me.' },
      { head: 'Day 1460', text: 'Going under again. If they come I will tell them what they need to hear. I am not a bad man. I am a frightened one.' },
    ]);
  }

  private robotCore() {
    if (story.has('robot_blast')) {
      this.read('The survey robot', 'Lazarus 7 · survey unit', [{ text: 'The data core housing is a blackened hole. Whatever it held is gone.' }]);
      return;
    }
    if (story.has('robot_core')) { this.robotTruth(); return; }
    const knows = story.has('mann_log');
    this.read('The survey robot', 'Lazarus 7 · survey unit', [
      { text: 'A low four-legged walker, folded down on its belly, its sensor mast bowed. The orange data core housing sits behind the mast.' },
      { text: 'The housing\'s seals have been cut and taped shut again. A cable runs out from under the tape and into the power cell at the back.' + (knows ? ' Mann\'s log said he wired the core to it.' : '') },
    ], [
      { label: 'Open the data core', run: () => this.robotBlast() },
      { label: 'Cut the cable to the power cell, then open it', run: () => { story.set('robot_core'); bus.emit('sfx', { id: 'repair', ui: true }); setTimeout(() => this.robotTruth(), 300); } },
    ]);
  }

  private robotTruth() {
    mission.note("The survey robot's own data: Mann's world is dead. His reports were false.");
    this.read('Survey robot · data core', 'Lazarus 7 · archive', [
      { text: 'The charge comes away with the cable. The core is intact.' },
      { head: 'Survey of the basin', text: 'Surface temperature −58 °C, no seasonal melt. Atmosphere: nitrogen, ammonia, traces of chlorine. No liquid water to 120 m. No organic compounds in any sample.' },
      { head: 'Last record', text: 'Discrepancy: beacon payload does not match survey archive. Reporting to mission control... transmission blocked. Unit powered down by operator.' },
    ]);
  }

  private robotBlast() {
    story.set('robot_blast');
    bus.emit('sfx', { id: 'explosion', ui: true, gain: 1 });
    this.game.renderer.shake = 0.05;
    setTimeout(() => { this.game.renderer.shake = 0; }, 900);
    this.zone.lights.setRoom('shelter', false, 'mann_shelter');
    this.crackVisor('The data core blows apart: the blast throws you into the crates and cracks your visor.');
    mission.note('The survey robot\'s data core was booby-trapped. The blast destroyed it and the shelter\'s power.');
  }

  /** inside the shelter's sealed room */
  private inShelter(p: THREE.Vector3) {
    if (!this.shelter) return false;
    _v.copy(p);
    this.shelter.root.worldToLocal(_v);
    return Math.abs(_v.x) < 1.95 && _v.y > -0.5 && _v.y < 3.2 && _v.z > -7.4 && _v.z < 9.7;
  }

  /** an injury out on the surface (wildlife): a cracked visor */
  harm(why: string) { this.crackVisor(why); }

  /** another pressurised cabin the crew member is in (the submersible) */
  cabin: (() => boolean) | null = null;

  private crackVisor(why: string) {
    if (this.breach !== null) return;
    this.breach = BREACH_O2;
    this.heldNote = false;
    bus.emit('sfx', { id: 'ice_crack', ui: true, gain: 1 });
    bus.emit('sfx', { id: 'alarm', ui: true, gain: 0.6 });
    ui.set({ visor: 1 });
    ui.toast(why, 'warn', 6);
    ui.toast('SUIT BREACH · get to a pressurised cabin', 'warn', 6);
    this.zone.warp = 1;
  }

  /** Mann's part, step by step */
  private mannUpdate(dt: number) {
    const n = this.mann;
    if (!n) return;
    this.stageT += dt;
    const p = this.game.player.pos;
    const dist = n.pos.distanceTo(p);
    switch (this.stage) {
      case 'waking': {
        this.lidT = Math.min(1, this.lidT + dt / 1.8);
        this.poseLid();
        if (this.stageT > 3.2 && n.attached) {
          n.detach(this.local(-0.75, -1.0, 0.3), 0);
          n.face(p);
        }
        if (this.stageT > 3.6) {
          n.dialogue = this.mannTalk();
          this.setStage('idle');
          if (dist < 6) bus.emit('npc:talk', n);
        }
        break;
      }
      case 'idle':
        if (!n.talking) n.face(p);
        break;
      case 'walk': {
        // out through the airlock, then east to the ridge; waits when the crew falls behind
        const path = [this.local(0, -7.0, 0.3), this.local(0, -12.5, 0.15), this.ridge()];
        const i = Math.min(this.line, path.length - 1);
        if (dist > 28 && this.line >= 1) {
          if (n.moving) n.stop();
          n.face(p);
          this.waitNag -= dt;
          if (this.waitNag <= 0) { this.waitNag = 25; n.say('Keep up! Stay on my tracks.', true); }
          break;
        }
        if (!n.moving) {
          if (n.pos.distanceTo(path[i]) < 1.2) {
            if (i === path.length - 1) { this.setStage('ridge'); break; }
            this.line++;
          }
          n.moveTo(path[Math.min(this.line, path.length - 1)], { direct: true, radius: 0.8 });
        }
        break;
      }
      case 'ridge':
        n.face(p);
        if (dist < 20) this.setStage('reveal');
        else if (this.stageT > 30) { this.stageT = 0; n.say('Over here. Come and see.', true); }
        break;
      case 'reveal': {
        const lines = ['There. Look at it. Clean, white, endless.', 'There is no warm ground under it. No meltwater. There is only this.', 'I am sorry. I need your ship more than you do.'];
        const at = [0, 4.5, 9.5];
        while (this.line < lines.length && this.stageT >= at[this.line]) n.say(lines[this.line++], true);
        if (this.stageT > 10.5) {
          if (dist > 35) { this.flee(); break; }
          n.moveTo(p, { direct: true, radius: 1.0, speed: 3.4 });
          if (dist < 1.6) {
            story.set('mann_attack');
            this.crackVisor('Dr. Mann smashes his helmet into your visor. It cracks across.');
            mission.note('Dr. Mann attacked the commander and cracked a helmet visor. His data was false: there is nothing here.');
            this.flee();
          }
        }
        break;
      }
      case 'flee':
        if (!n.moving) {
          const r = this.zone.ranger.root.position;
          if (n.pos.distanceTo(r) < 9) { this.setStage('hatch'); n.idlePose = 'operate'; n.face(r); if (dist < 20) n.say('Locked. Of course it is locked.', true); }
          else n.moveTo(_w.set(r.x + 5, this.ground(r.x + 5, r.z + 5), r.z + 5), { direct: true, radius: 2, speed: 3.0 });
        }
        break;
      case 'hatch':
        if (this.stageT > 7) {
          n.idlePose = 'stand';
          this.setStage('leave');
          n.moveTo(this.local(0, -12.0, 0.15), { direct: true, radius: 1.0, speed: 2.4 });
        }
        break;
      case 'leave':
        if (!n.moving) {
          // into the shelter, and the airlock sealed behind him
          n.root.visible = false;
          n.dialogue = null;
          story.set('mann_sealed');
          story.set('mann_gone');
          const door = this.buildings.find((b) => b.name === 'mann_shelter')?.slides.get('shelter');
          if (door) { door.setOpen(false); door.enabled = false; }
          mission.note('Dr. Mann has sealed himself inside his shelter.');
          this.setStage('gone');
        }
        break;
    }
  }

  private flee() {
    if (!this.mann) return;
    this.mann.dialogue = null;
    this.mann.ignorePlayer = true;
    this.setStage('flee');
  }

  private ridge() {
    const y = this.ground(MANN_RIDGE.x, MANN_RIDGE.z);
    return new THREE.Vector3(MANN_RIDGE.x, y, MANN_RIDGE.z);
  }

  // ============================================================================================== Edmunds
  private setupEdmunds(camp: Model, lander: Model, x: number, z: number, yaw: number) {
    this.camp = camp;
    this.put(camp, x, z, yaw);
    this.building('edmunds_camp', camp, false);
    const ls = camp.marker('lander', 'spot');
    ls?.node.getWorldPosition(_v);
    this.put(lander, _v.x, _v.z, yaw + (ls ? ls.node.rotation.y : 0));
    this.building('edmunds_lander', lander, false);
    const cairn = camp.node('cairn', 'edmunds');
    if (cairn) cairn.visible = story.has('edmunds_cairn');
    this.applyPower();
    const at = (k: string) => camp.node(k, 'edmunds')!;
    this.spot(at('log'), 0.5, () => "Read Dr. Edmunds' log", () => this.edmundsLog());
    this.spot(at('power'), 0.5, () => (story.has('edmunds_power') ? '' : 'Reconnect the power feed'), () => {
      story.set('edmunds_power');
      bus.emit('sfx', { id: 'switch', ui: true });
      this.applyPower();
      mission.note("Edmunds' camp: power feed reconnected to the solar array.");
      ui.toast('Power restored: the camp lights come on', 'good', 4);
    });
    this.spot(at('beacon'), 0.6, () => (story.has('edmunds_beacon') ? '' : 'Restart the beacon'), () => {
      if (!story.has('edmunds_power')) { bus.emit('sfx', { id: 'ui_deny', ui: true }); ui.toast('No power: the beacon\'s battery is flat. The feed comes from the junction box under the container.', 'warn', 5); return; }
      story.set('edmunds_beacon');
      bus.emit('sfx', { id: 'beep', ui: true });
      this.applyPower();
      mission.note("Edmunds' beacon is transmitting again.");
      ui.toast("Edmunds' beacon is transmitting", 'good', 4);
    }, 3);
    this.spot(at('seeds'), 0.9, () => (story.has('edmunds_seeds') ? '' : 'Collect seed samples'), () => {
      story.set('edmunds_seeds');
      bus.emit('sfx', { id: 'button', ui: true });
      mission.note("Collected seed samples from Edmunds' greenhouse: a few seedlings of the hardy strain are still alive.");
      ui.toast('Seed samples collected · a few seedlings are still alive', 'good', 5);
    });
    this.spot(at('grave'), 1.2, () => (story.has('edmunds_log') && !story.has('edmunds_cairn') ? 'Raise a cairn for Dr. Edmunds' : ''), () => {
      story.set('edmunds_cairn');
      if (cairn) cairn.visible = true;
      bus.emit('sfx', { id: 'thud', ui: true });
      mission.note('Dr. Wolf Edmunds laid to rest under a cairn by the flag, facing the hills.');
      ui.toast('You lay Dr. Edmunds to rest', 'info', 5);
    }, 4);
    this.spot(() => lander.root.localToWorld(_w.copy(B(-2.6, -0.4, 1.9))), 1.2, () => 'Inspect the Lazarus lander', () => this.read("Dr. Edmunds' lander", 'Lazarus 9', [
      { text: 'A one-way craft like the others: no ascent stage. Its batteries fed the camp until the first dust season; the cables still run from its belly to the junction box.' },
      { text: 'Sand has drifted against the legs on the windward side.' },
    ]), 3.5);
  }

  private applyPower() {
    const on = story.has('edmunds_power');
    this.zone.lights.setRoom('camp', on, 'edmunds_camp');
    this.zone.lights.setRoom('camp_beacon', on && story.has('edmunds_beacon'), 'edmunds_camp');
    // the tents glow from inside when the lamps are on
    for (const m of materials.all()) if (m.name === 'tent_white') (m as THREE.MeshStandardMaterial).emissiveIntensity = on ? 0.45 : 0;
  }

  private edmundsLog() {
    story.set('edmunds_log');
    this.read("Dr. Edmunds' log", 'Lazarus 9 · camp journal', [
      { head: 'Day 3', text: 'The air is thin but it can be breathed at rest: fifteen per cent oxygen. I took my helmet off for a minute today just to feel the wind. Cold, dry, wonderful.' },
      { head: 'Day 31', text: 'Water nine metres down under the dry wash. Nitrates in the soil. The first seeds are up in the greenhouse.' },
      { head: 'Day 412', text: 'The rover\'s drive motor has seized. I walk now. The beacon reports positive.' },
      { head: 'Day 893', text: 'Dust season. The panels are buried every other day and the batteries sag.' },
      { head: 'Day 1104', text: 'The beacon lost power last night. I will fix it when the wind drops.' },
      { head: 'Day 1112', text: 'The cough is worse. If you are reading this: the beacon\'s feed is at the junction box under the container. The seeds in the greenhouse are the hardy strain; some will still sprout. Put me under the stones by the flag, facing the hills. It is good here. Plant them.' },
    ]);
  }

  // ============================================================================================== per frame
  fixedUpdate(dt: number) { this.npcs?.fixedUpdate(dt); }

  update(dt: number) {
    for (const b of this.buildings) b.update(dt);
    this.npcs?.update(dt);
    if (this.world === 'mann') this.mannUpdate(dt);
    if (this.world === 'miller' && !story.has('miller_recorder')) {
      // the recorder's strobe: one flash a second
      this.strobeT = (this.strobeT + dt) % 1;
      this.zone.lights.setRoom('recorder', this.strobeT < 0.12, 'miller_wreck');
    }
    if (this.world === 'edmunds' && story.has('edmunds_beacon')) {
      this.strobeT = (this.strobeT + dt) % 2;
      this.zone.lights.setRoom('camp_beacon', this.strobeT < 0.25, 'edmunds_camp');
    }
    this.updateBreach(dt);
  }

  private updateBreach(dt: number) {
    if (this.breach === null) return;
    const g = this.game;
    const flight = g.services.flight as Flight;
    if (flight.craft === this.zone.ranger || this.cabin?.()) {
      this.breach = null;
      ui.set({ visor: 0 });
      mission.note(flight.craft === this.zone.ranger ? 'Visor patched in Ranger 1\'s cabin.' : 'Visor patched inside the submersible\'s sphere.');
      ui.toast('Safe in the cabin · visor patched', 'good', 4);
      return;
    }
    if (this.inShelter(g.player.pos) && !story.has('robot_blast')) return;   // the sealed room holds air
    this.breach -= dt * this.zone.warp;
    ui.set({ visor: Math.min(1, 0.4 + (1 - this.breach / BREACH_O2) * 0.6) });
    if (this.breach <= 0) {
      if (g.settings.creative.damageProtection) {
        this.breach = 0.01;
        if (!this.heldNote) { this.heldNote = true; ui.toast('Creative Mode: suit oxygen held at reserve', 'info', 4); }
        return;
      }
      this.breach = null;
      ui.set({ visor: 0 });
      this.zone.board();
      mission.note('The commander blacked out from hypoxia and was dragged back into Ranger 1 by the crew.');
      ui.toast('You black out... and wake in Ranger 1\'s cabin', 'warn', 6);
    }
  }

  /** extra HUD clocks (suit oxygen while the visor is cracked) */
  hud(): { label: string; value: string }[] {
    if (this.breach === null) return [];
    return [{ label: 'SUIT O2', value: `${Math.max(0, Math.ceil(this.breach))} s` }];
  }

  /** nearest site interaction for the HUD's 'board' prompt check: true while a site interaction is in reach */
  busy() { const c = this.game.interactions.current; return !!c && this.inter.includes(c); }
}
