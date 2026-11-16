import * as THREE from 'three';
import { bus } from '../../core/events';
import { story } from '../../core/Story';
import { NPC, NPCManager } from '../../npc/NPC';
import { act, BT, sel, seq, wait, when } from '../../npc/bt';
import { goTo, hold, remark } from '../../npc/behaviors';
import { DCtx, DialogueDef, rotate, Topic } from '../../npc/Dialogue';
import type { PoseName } from '../../npc/Humanoid';
import { LAZARUS, launcherDeltaV, mission } from '../../mission/Mission';
import type { EarthZone } from './EarthZone';
import type { NasaSite } from './Nasa';

interface Work { id: string; pos: THREE.Vector3; face: THREE.Vector3; pose: PoseName; role: string; user: NPC | null }

/**
 * The people of the facility: the director, the three astronauts who fly with the player, guards,
 * engineers, scientists and flight controllers. Everyone works their own stations and reacts to the
 * commander's decision; nothing forces the player to leave.
 */
export class NasaStaff {
  id = 'nasa_staff';
  npcs!: NPCManager;
  work: Work[] = [];
  crew: NPC[] = [];
  director!: NPC;

  constructor(private zone: EarthZone, private site: NasaSite) {}

  private station(id: string) { return this.work.find((w) => w.id === id)!; }

  /** Behaviour: keep choosing a free work station for one of `roles`, walk there and work for a while. */
  private rounds(roles: string[], lines: string[] = [], stay: [number, number] = [18, 46]): BT<NPC> {
    let cur: Work | null = null, state = 0, t = 0;
    const release = (n: NPC) => { if (cur && cur.user === n) cur.user = null; cur = null; state = 0; };
    return {
      tick: (n, dt) => {
        if (state === 0) {
          const free = this.work.filter((w) => roles.includes(w.role) && !w.user && w !== cur);
          if (!free.length) return 'run';
          cur = free[Math.floor(Math.random() * free.length)];
          cur.user = n;
          n.idlePose = 'stand'; n.face(null);
          n.state.task = `walking to ${label(cur.id)}`; n.state.destination = label(cur.id);
          n.moveTo(cur.pos, { radius: 0.3 });
          state = 1;
        } else if (state === 1) {
          if (n.moving) return 'run';
          if (n.blocked) { release(n); return 'run'; }
          n.idlePose = cur!.pose; n.face(cur!.face);
          n.state.task = label(cur!.id); n.state.location = this.site.area(n.pos) ?? 'Facility';
          t = stay[0] + Math.random() * (stay[1] - stay[0]);
          state = 2;
        } else {
          t -= dt;
          if (lines.length && Math.random() < dt / 30) n.bark(lines, 'work_' + roles[0], 50);
          if (t <= 0) { const w = cur!; n.idlePose = 'stand'; state = 0; w.user = null; }
        }
        return 'run';
      },
      reset: () => { if (cur) cur.user = null; cur = null; state = 0; },
    };
  }

  private toStation(id: string, label_: string): BT<NPC> {
    return goTo(() => this.station(id).pos, { label: label_, radius: 0.3 });
  }

  async load() {
    const z = this.zone, site = this.site;
    this.npcs = new NPCManager({ game: z.game, phys: z.phys, parent: z.root, nav: site.nav });
    for (const m of [site.complex, site.launch, site.gate]) for (const mk of m.ofKind('work')) {
      const pos = mk.node.getWorldPosition(new THREE.Vector3());
      const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(mk.node.getWorldQuaternion(new THREE.Quaternion()));
      this.work.push({ id: mk.id, pos, face: pos.clone().addScaledVector(dir, 1.5), pose: (mk.data.pose ?? 'stand') as PoseName, role: mk.data.role ?? 'eng', user: null });
    }
    site.actors.push(() => this.npcs.list.map((n) => n.pos));
    const at = (id: string) => this.station(id).pos;
    const prep = () => mission.phase === 'prep' || mission.phase === 'boarding';

    // ---------------------------------------------------------------- director
    this.director = await this.npcs.spawn({
      id: 'hale', name: 'Director Elias Hale', role: 'Mission Director', model: 'char_civilian',
      look: { shirt: 'cloth_navy', pants: 'cloth_khaki', hair: 'hair_gray', hat: null, scale: 1.0 },
      state: { location: 'Crew Briefing Room', emotion: 'focused', knowledge: ['lazarus', 'wormhole', 'plan'], access: ['all'], equipment: ['data slate'] },
      dialogue: this.directorTalk(),
    }, at('brief_head'), 0);
    this.director.brain = sel<NPC>(
      when(prep, seq(this.toStation('mc_director', 'directing launch preparation'), hold('stand', 60, 'directing launch preparation', () => this.station('mc_director').face))),
      this.rounds(['director'], ['Every month we wait, the window gets narrower.'], [40, 90]),
    );

    // ---------------------------------------------------------------- crew of three
    const crewDefs: [string, string, string, string[], any, DialogueDef][] = [
      ['reyes', 'Tomas Reyes', 'Flight Systems Engineer', ['eng', 'crew'], { shirt: 'cloth_khaki', pants: 'cloth_khaki', hair: 'hair_black', skin: 'skin', scale: 1.01 }, this.reyesTalk()],
      ['okoye', 'Dr. Imani Okoye', 'Planetary Scientist', ['sci', 'crew'], { shirt: 'cloth_khaki', pants: 'cloth_khaki', hair: 'hair_black', skin: 'skin_dark', scale: 0.95, width: 0.93 }, this.okoyeTalk()],
      ['hartmann', 'Dr. Lena Hartmann', 'Mission & Medical Specialist', ['med', 'crew', 'ctrl'], { shirt: 'cloth_khaki', pants: 'cloth_khaki', hair: 'hair_blond', skin: 'skin', scale: 0.97, width: 0.94 }, this.hartmannTalk()],
    ];
    const checks = ['hall_stage', 'mc_0_2', 'crew_med'];
    for (let i = 0; i < crewDefs.length; i++) {
      const [id, name, role, roles, look, dlg] = crewDefs[i];
      const n = await this.npcs.spawn({
        id, name, role, model: 'char_astronaut', look: { ...look, helmet: false },
        state: { location: 'Crew Briefing Room', emotion: 'focused', access: ['all'], equipment: ['flight suit'], knowledge: ['mission'] },
        dialogue: dlg, walkSpeed: 1.45,
      }, at(['brief_a', 'brief_b', 'brief_c'][i]), -Math.PI / 2);
      n.human.setHelmet(false);
      n.brain = sel<NPC>(
        // the commander said go: collect equipment, run the assigned check, report to the crew access arm
        when(prep, seq(
          act((c) => { c.state.emotion = 'focused'; }),
          this.toStation('crew_lockers', 'collecting flight equipment'),
          hold('operate', 7 + i * 2, 'collecting flight equipment', () => this.station('crew_lockers').face),
          act((c) => { if (!c.state.equipment.includes('helmet')) c.state.equipment.push('helmet', 'survival pack'); }),
          this.toStation(checks[i], 'running pre-flight checks'),
          hold(i === 0 ? 'inspect' : 'operate', 14, ['checking the upper stage', 'verifying guidance', 'clearing the medical checklist'][i], () => this.station(checks[i]).face),
          remark([['Upper stage is tight. Propellant load confirmed.'], ['Guidance platform aligned. Wind aloft is inside limits.'], ['Everyone is cleared to fly. Including you, Commander.']][i], 'prep_done', 5),
          goTo(() => new THREE.Vector3().copy(at('crew_arm')).add(new THREE.Vector3(0.9 * (i - 1), 0, 0.6 * (i - 1))), { label: 'walking to the crew access arm', dest: 'Crew access arm', radius: 0.5 }),
          act((c) => { c.state.flags.ready = true; c.state.task = 'ready to board'; c.face(site.toWorld(0, 10, 305, new THREE.Vector3())); }),
          wait(1e9),
        )),
        this.rounds(roles, [
          ['The numbers on the second stage keep getting better. I still do not trust them.', 'I would rather find the fault down here than up there.'],
          ['Every spectrum we get back from the far side looks different. That is the exciting part.', 'Three worlds. I would give a great deal to stand on just one.'],
          ['Sleep, calories, radiation dose. Nobody likes my checklists until they need them.', 'Two years out, two years back, if everything is kind to us.'],
        ][i], [22, 50]),
      );
      n.state.flags.ready = false;
      this.crew.push(n);
    }

    // ---------------------------------------------------------------- staff
    const staff: [string, string, string, string[], any, string[], string][] = [
      ['whitlock', 'Sgt. Dana Whitlock', 'Perimeter Security', ['guard'], { shirt: 'cloth_khaki', pants: 'cloth_khaki', hair: 'hair_brown', hat: 'cloth_khaki', longHair: false }, ['Quiet out there. It is always quiet out there.'], 'gate_guard'],
      ['yee', 'Cpl. Marcus Yee', 'Facility Security', ['guard'], { shirt: 'cloth_khaki', pants: 'cloth_khaki', hair: 'hair_black', hat: 'cloth_khaki' }, ['Badge is on file, Commander. Go ahead.'], 'guard_door'],
      ['raman', 'Priya Raman', 'Propulsion Lead', ['eng'], { shirt: 'cloth_white', pants: 'cloth_navy', hair: 'hair_black', skin: 'skin_dark', longHair: true, hat: null, scale: 0.94, width: 0.92 }, ['Chill-down valves are cycling clean today.', 'If that turbopump sings like it did last week I am pulling it.'], 'hall_engine'],
      ['castellan', 'Owen Castellan', 'Ground Systems Engineer', ['eng'], { shirt: 'cloth_plaid', pants: 'cloth_denim', hair: 'hair_red', hat: null, scale: 1.03 }, ['Forty-year-old blast doors and they still seal better than anything we built since.'], 'deck_main_b'],
      ['sato', 'Hana Sato', 'Computer Systems', ['eng', 'ctrl'], { shirt: 'cloth_navy', pants: 'cloth_denim', hair: 'hair_black', longHair: true, hat: null, scale: 0.92, width: 0.9 }, ['We are running a deep-space mission on machines older than I am.'], 'cc_console'],
      ['brandt', 'Dr. Felix Brandt', 'Astrophysicist', ['sci'], { shirt: 'cloth_white', pants: 'cloth_khaki', hair: 'hair_gray', hat: null }, ['It should not be stable. It is. Somebody put it there.'], 'astro_1'],
      ['achebe', 'Dr. Nora Achebe', 'Plant Pathologist', ['sci'], { shirt: 'cloth_white', pants: 'cloth_navy', hair: 'hair_black', skin: 'skin_dark', longHair: true, hat: null, scale: 0.95, width: 0.92 }, ['Bed seven has it now. That was our resistant line.'], 'gh_a'],
      ['marchetti', 'Leo Marchetti', 'Flight Controller', ['ctrl'], { shirt: 'cloth_white', pants: 'cloth_navy', hair: 'hair_brown', hat: null }, ['Telemetry rehearsal is nominal across the board.'], 'mc_0_1'],
      ['park', 'Gwen Park', 'Flight Controller', ['ctrl'], { shirt: 'cloth_navy', pants: 'cloth_khaki', hair: 'hair_black', longHair: true, hat: null, scale: 0.93, width: 0.9 }, ['Range is clear. Range is always clear — nobody knows we are here.'], 'mc_1_3'],
    ];
    for (const [id, name, role, roles, look, lines, start] of staff) {
      const n = await this.npcs.spawn({
        id, name, role, model: 'char_civilian', look,
        state: { location: 'Facility', emotion: 'focused', access: ['facility'], knowledge: roles },
        dialogue: this.staffTalk(roles[0], role),
      }, at(start), 0);
      // the gate sergeant never leaves the perimeter
      n.brain = id === 'whitlock'
        ? seq(hold('stand', 1e9, 'guarding the gate', () => this.station('gate_patrol').pos))
        : sel<NPC>(
          when(() => prep() && roles.includes('ctrl'), this.rounds(['ctrl'], ['Launch support, all stations report.', 'Confirm propellant load complete.'], [60, 120])),
          this.rounds(roles, lines),
        );
    }
    bus.on('zone', (zn: any) => { if (zn === this.zone) this.npcs.rebind(); });
    bus.on('mission:decision', (c: string) => {
      for (const n of this.npcs.list) n.brain?.reset();
      for (const w of this.work) w.user = null;
      for (const n of this.crew) n.state.flags.ready = false;
      if (c === 'endurance') this.director.say('All stations: the commander has given the word. Begin launch preparation.', true);
      else this.director.say('Understood. We keep working. The door stays open, Commander.', true);
    });
  }

  crewReady() { return this.crew.every((n) => n.state.flags.ready === true); }

  // ---------------------------------------------------------------------------------------------- dialogue
  private directorTalk(): DialogueDef {
    const dv = launcherDeltaV();
    return {
      greet: (c) => {
        if (mission.choice === 'endurance') return rotate(c, 'g_go', ['Your crew is preparing. When you are ready, the access arm is on the upper level of the launch cavern.', 'The vehicle is fuelled. There is no clock on this but the one outside.']);
        if (c.n('__greet') === 0) return ['Commander. You found us — I was told you would, eventually.', 'This is what is left of the space programme. Officially we were shut down decades ago. Unofficially, we never stopped.'];
        return rotate(c, 'g', ['Commander. Ask me anything; there is nothing left worth hiding from you.', 'Back to look at the numbers again? Good. So do I, every night.', 'The door is open in both directions. I will not pretend otherwise.']);
      },
      topics: [
        { id: 'why', label: 'What is this place?', say: [
          ['An air-defence command post, built to ride out a war that never came. Rock, steel doors, its own air and water.', 'When the last public budget was cut, we moved in. Nobody looks for a rocket inside a mountain.', 'Everything here has one purpose: getting a crew and a ship to Saturn.'],
          'A bunker that became a launch site. One purpose: Saturn, and what is waiting beside it.',
        ] },
        { id: 'wormhole', label: 'What is at Saturn?', say: [
          ['A wormhole. It appeared near Saturn forty-eight years ago — a stable passage to another galaxy.', 'Things like that do not form by themselves. We do not know who placed it. We decided to stop asking and start using it.', 'Twelve systems are reachable through it. Three of them returned promising signals.'],
          'A stable wormhole, placed by someone, leading to twelve systems. Three look promising.',
        ], effect: () => story.set('knows_wormhole') },
        { id: 'lazarus', label: 'Who sent those signals?', after: 'wormhole', say: [
          () => ['The Lazarus missions. Twelve people, one small ship each, one way. If a world looked viable they set a beacon and waited in long sleep.', ...LAZARUS.map((w) => `${w.scout.split(' ').slice(-1)[0]}: ${w.signal.toLowerCase()}.`), 'All three orbit a black hole we call Gargantua. That is what makes the choice between them so difficult.'],
          () => `Three volunteers still transmitting, or who were: ${LAZARUS.map((w) => w.scout).join(', ')}.`,
        ], effect: () => story.set('knows_lazarus') },
        { id: 'plan', label: 'What exactly is the mission?', after: 'wormhole', say: [
          ['Ranger 1 lifts you and three specialists to low orbit. The Endurance is already there — built in pieces over nine years of launches nobody saw.', 'You dock, spin her up, and fly to Saturn. Through the wormhole. Then you visit the candidates and tell us which one people can live on.', 'After that there are two roads. Bring word back so we can move who we can. Or, if there is no coming back, there are frozen embryos aboard — a colony that does not need us.'],
          'Reach the Endurance, go through the wormhole, survey the three worlds, and send word — or start again there with what the ship carries.',
        ], effect: () => story.set('knows_plan') },
        { id: 'rocket', label: 'Tell me about the launch vehicle.', say: [
          () => [`Two stages. ${Math.round(dv.m0 / 1000)} tonnes on the pad, thrust-to-weight ${dv.twr.toFixed(2)} at lift-off.`, `First stage gives you about ${(dv.dv1 / 1000).toFixed(1)} kilometres per second, the second ${(dv.dv2 / 1000).toFixed(1)}. Enough for orbit with a thin margin.`, 'The flight computer can fly the whole ascent for you. Or you can fly it. Your crew would prefer the computer.'],
          () => `Two stages, ${(dv.total / 1000).toFixed(1)} km/s between them. The autopilot knows the way to orbit.`,
        ] },
        { id: 'risk', label: 'What are the odds?', after: 'plan', say: [
          ['Honestly? Nobody has done any of it before. The ship is sound. The physics on the far side is not fully understood.', 'Time will not pass for you the way it passes here. Near Gargantua an hour can cost years. Whoever you leave behind will age without you.', 'I will not tell you it is safe. I will tell you it is the only plan there is.'],
          'Unknown, and the clock runs differently out there. It is still the only plan.',
        ] },
        { id: 'stay', label: 'And if I am not ready to go?', say: [
          ['Then you are not. There is work here — the vehicle, the data, the crops in the greenhouse. Your crew will keep training.', 'I will not start a countdown behind your back. The decision is yours, and it stays yours until you make it.'],
          'Then we keep working. Nothing launches without your word.',
        ] },
        { id: 'decide', label: 'I have made my decision.', say: [
          'Then tell me formally. The mission authorization is on the table in front of you.',
          'The authorization console is still open. Change your mind as often as you need to — until the engines light.',
        ], effect: (c) => { setTimeout(() => c.game.openPanel('mission', { tab: 'decision' }), 600); }, end: true },
      ],
      bye: (c) => rotate(c, 'b', ['Take your time, Commander.', 'I will be here.', 'Walk the place. See what we built.']),
    };
  }

  private crewCommon(specialty: Topic[]): Topic[] {
    return [
      ...specialty,
      { id: 'ready', label: 'Are you ready to fly?', say: [
        (c) => mission.choice === 'endurance' ? 'Suit is checked and my station is clear. I will meet you at the access arm.' : 'Whenever you say the word. Not before.',
        (c) => mission.choice === 'endurance' ? 'Ready. See you at the hatch.' : 'Ready when you are, Commander.',
      ] },
      { id: 'doing', label: 'What are you working on?', say: [(c) => `Right now? ${cap(c.npc.state.task)}.`] },
      { id: 'farm', label: 'I may go back to the farm for a while.', when: () => mission.choice !== 'endurance', say: [
        'You should. Nobody should leave without saying what needs saying. We will be here.',
        'Go. The rocket is not going anywhere without you.',
      ] },
    ];
  }

  private reyesTalk(): DialogueDef {
    return {
      greet: (c) => rotate(c, 'g', ['Commander. Reyes — I keep the engines honest.', 'Commander. Good, I wanted a second pair of eyes on something.', 'Back again. The stack has not moved, I promise.']),
      topics: this.crewCommon([
        { id: 'ranger', label: 'What should I know about the Ranger?', say: [
          ['She is a lifting body: flies in atmosphere, flies in vacuum, lands on her own legs. Main engines aft, reaction thrusters all round.', 'Inertia is the thing. Nothing stops unless you stop it. Small inputs, then wait.', 'The computer will hold attitude for you and it can fly a docking by itself. Let it, the first time.'],
          'Lifting body, main engines aft, thrusters everywhere. Small inputs. Let the computer help.',
        ] },
        { id: 'fuel', label: 'How far does her fuel go?', say: [
          ['Enough for orbit work and a couple of landings before she needs the Endurance. The mothership carries the real reserve.', 'Refuelling from the Endurance takes about ten seconds once you are hard-docked. I timed it. Twice.'],
          'Orbit work and a landing or two. Top up at the Endurance — ten seconds on the clock.',
        ] },
      ]),
      bye: (c) => rotate(c, 'b', ['Commander.', 'I will be around the vehicle.', 'Back to the checklist.']),
    };
  }

  private okoyeTalk(): DialogueDef {
    return {
      greet: (c) => rotate(c, 'g', ['Commander. Imani Okoye. I read planets for a living, when there are any to read.', 'Commander. Come and look at this spectrum with me.', 'Hello again. Still three worlds, still not enough data.']),
      topics: this.crewCommon([
        ...LAZARUS.map((w): Topic => ({ id: w.id, label: `Tell me about ${w.name}.`, say: [
          [`${w.scout}'s world. ${w.surface}. Gravity about ${w.gravity} g.`, `${w.status}. ${w.signal}.`, `The catch: ${w.risk.toLowerCase()}.`],
          `${w.surface}; ${w.gravity} g; ${w.risk.toLowerCase()}.`,
        ] })),
        { id: 'pick', label: 'Which one would you choose?', after: 'mann', say: [
          ['On data alone? Mann. His set is the most complete and he was the best of them.', 'On instinct... Edmunds went quiet, and quiet is not the same as dead. I keep coming back to that.', 'Miller is closest, but every hour there is seven years here. I would want a very good reason.'],
          'Data says Mann. Instinct says Edmunds. Miller costs the most time.',
        ] },
      ]),
      bye: (c) => rotate(c, 'b', ['Back to the data.', 'Talk soon, Commander.', 'I will have more for you tomorrow.']),
    };
  }

  private hartmannTalk(): DialogueDef {
    return {
      greet: (c) => rotate(c, 'g', ['Commander. Lena Hartmann — mission procedures, and I am also your doctor, so be nice.', 'Commander. Have you slept? You look like you have not slept.', 'There you are. Sit down a moment.']),
      topics: this.crewCommon([
        { id: 'sleep', label: 'How do we survive two years to Saturn?', say: [
          ['Mostly asleep. The Endurance has cryogenic berths: you go under, the ship flies itself, and the clock runs without you.', 'You can also stay awake for any part of the trip. The ship does not mind. I might.'],
          'Long sleep in the cryo berths, or awake if you insist. The ship flies either way.',
        ] },
        { id: 'time', label: 'What does time dilation do to a crew?', say: [
          ['To the body, nothing. Your heart beats the same. It is everyone else who gets older.', 'Near Gargantua I will keep three clocks for you: yours, the ship\'s, and Earth\'s. Watch the third one before you decide to stay anywhere.'],
          'Nothing to you. Everything to the people at home. Three clocks — watch Earth\'s.',
        ] },
        { id: 'gravity', label: 'And living in zero gravity?', say: [
          ['The Endurance spins — a little over five turns a minute gives close to one g at the rim. In the hub you float.', 'If the spin ever stops, tie things down and move slowly. That is the whole procedure.'],
          'She spins for gravity at the rim; you float in the hub.',
        ] },
      ]),
      bye: (c) => rotate(c, 'b', ['Drink some water, Commander.', 'I will be in crew preparation.', 'Get some rest when you can.']),
    };
  }

  private staffTalk(kind: string, role: string): DialogueDef {
    const topics: Record<string, Topic[]> = {
      guard: [
        { id: 'access', label: 'Am I cleared to be here?', say: ['You are on the director\'s list, Commander. Every door opens for you. Go wherever you like.', 'Cleared for the whole facility. Always were.'] },
        { id: 'quiet', label: 'Any trouble out there?', say: [['Dust, mostly. A farmer reported our supply trucks last month. Nothing came of it.', 'People stopped looking up a long time ago. That is the best camouflage we have.'], 'Nothing but dust.'] },
      ],
      eng: [
        { id: 'vehicle', label: 'How is the launch vehicle?', say: [['Fuelled and stable. We keep it topped off; boil-off goes back through the plant.', 'Five engines on the first stage, one vacuum engine on the second. All test-fired in this mountain.'], 'Fuelled, stable, waiting.'] },
        { id: 'place', label: 'How do you keep this place running?', say: [['Carefully. The life-support plant makes our air and reclaims the water. The reactor hall is two levels down and off limits even to me.', 'Spare parts come from everything that was ever mothballed. We are good at making old things work.'], 'Old machines and stubbornness.'] },
      ],
      sci: [
        { id: 'work', label: 'What is your research?', say: [(c) => [`${cap(c.npc.state.task)}, at the moment.`, 'Two problems, really. The blight on this side, and the wormhole on the other. I am not sure which one frightens me more.'], (c) => `${cap(c.npc.state.task)}.`] },
        { id: 'blight', label: 'Can the blight be stopped?', say: [['Not by us. It adapts faster than we can breed resistance. The greenhouse is a holding action.', 'That is why you are here, Commander, and not a better fertiliser.'], 'No. Only outrun.'] },
      ],
      ctrl: [
        { id: 'control', label: 'What does mission control do during launch?', say: [['Watch everything you cannot. Propulsion, guidance, range, the crew\'s vitals. We call the holds; you fly the ship.', 'After orbit insertion you are mostly on your own. The delay only gets worse the farther you go.'], 'Watch, call holds, and then let go.'] },
        { id: 'terminal', label: 'Can I use these consoles?', say: ['The flight director\'s station at the back is open to you — telemetry, trajectories, the countdown, all of it.', 'Flight director\'s console, back of the room.'] },
      ],
    };
    return {
      greet: (c) => rotate(c, 'g', ['Commander.', 'Commander. Something I can do for you?', 'Sir.']),
      topics: [...(topics[kind] ?? topics.eng), { id: 'role', label: 'What is your job here?', say: [`${role}. Have been since before the public shutdown.`, `${role}.`] }],
      bye: (c) => rotate(c, 'b', ['Commander.', 'Good luck up there.', 'Back to work.']),
    };
  }

  fixedUpdate(dt: number) { this.npcs.fixedUpdate(dt); }
  update(dt: number) { this.npcs.update(dt); }
  serialize() { return { npcs: this.npcs.serialize() }; }
  deserialize(d: any) { this.npcs.deserialize(d?.npcs); }
}

const LABELS: Record<string, string> = {
  guard: 'standing guard', sec: 'watching the security monitors', brief: 'reviewing the mission plan', mc: 'monitoring a flight console', cc: 'checking the computers',
  astro: 'analysing wormhole data', util: 'servicing the plant', store: 'checking stores', shop: 'working at the bench', lab: 'examining blight samples', gh: 'tending the crop beds',
  ls: 'monitoring life support', crew: 'preparing equipment', hall: 'inspecting flight hardware', launch: 'running launch support checks', deck: 'inspecting the vehicle', gate: 'guarding the gate',
};
function label(id: string) { return LABELS[id.split('_')[0]] ?? 'working'; }
function cap(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }

void ({} as DCtx);
