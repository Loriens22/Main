import * as THREE from 'three';
import { bus } from '../../core/events';
import { story } from '../../core/Story';
import { ui } from '../../ui/store';
import { NPC, NPCDef, NPCManager } from '../../npc/NPC';
import { act, BT, cond, sel, seq, shuffle, wait, when } from '../../npc/bt';
import { follow, goTo, hold, remark, workAt } from '../../npc/behaviors';
import { DCtx, DialogueDef, rotate } from '../../npc/Dialogue';
import { FARM } from './EarthMap';
import type { EarthZone } from './EarthZone';
import { HOUSE } from './EarthZone';
import type { Machine } from './Farm';

const V = THREE.Vector3;

/**
 * The people who still work this county: the farm's hired hand, the neighbouring family and the co-op
 * operator. They keep their own routines (crops, repairs, hauling, visiting, sheltering from storms),
 * remember what they have told you and react to what happens on the farm.
 */
export class Neighbors {
  id = 'neighbors';
  npcs!: NPCManager;
  private visitTimer = 240;
  private duetT = 0;
  private duetI = 0;

  constructor(private zone: EarthZone) {}

  private P(x: number, z: number) { return new V(x, this.zone.map.height(x, z), z); }
  private storm = () => this.zone.weather.storm !== 'none';
  private night = () => { const h = this.zone.weather.hours; return h > 21.2 || h < 5.4; };
  private faulted = (): Machine | null => this.zone.farm.machines.find((m) => !!m.fault) ?? null;

  async load() {
    const z = this.zone, map = z.map;
    this.npcs = new NPCManager({
      game: z.game, phys: z.phys, parent: z.root,
      ground: (x, zz) => map.height(x, zz),
      hazards: () => z.vehicles.filter((v) => Math.abs(v.speed) > 0.8).map((v) => ({ pos: v.position, vel: v.forward(new V()).multiplyScalar(v.speed), radius: v.kind === 'pickup' ? 1.4 : 2.6 })),
    });
    const porch = z.house.markerPose('spawn', 'porch')!.pos.clone();
    const garage = z.shedB.model.markerPose('park', 'garage')?.pos.clone() ?? this.P(FARM.x + 20, FARM.z - 44);
    garage.y = map.height(garage.x, garage.z);
    const heller = map.sites.find((s) => s.id === 'heller')!, mill = map.sites.find((s) => s.id === 'mill')!;
    const site = (s: typeof heller, dx: number, dz: number) => this.P(s.x + dx * Math.cos(s.yaw) + dz * Math.sin(s.yaw), s.z - dx * Math.sin(s.yaw) + dz * Math.cos(s.yaw));

    // ------------------------------------------------------------------ Walt: the farm's hired hand
    const walt = await this.npcs.spawn({
      id: 'walt', name: 'Walt Renner', role: 'Farmhand', model: 'char_civilian',
      look: { shirt: 'cloth_plaid', pants: 'cloth_denim', hair: 'hair_gray', hat: 'cloth_khaki', scale: 0.985 },
      state: { location: 'The Farm', emotion: 'tired', knowledge: ['machines', 'storms', 'blight'], access: ['farm'], equipment: ['multitool', 'grease gun'] },
      dialogue: this.waltTalk(),
    }, this.P(FARM.x - 12, FARM.z + 14), 2.4);
    const beside = (m: Machine) => { const p = m.vehicle.position, f = m.vehicle.forward(new V()); return this.P(p.x + f.z * 3.4 - f.x * 1.0, p.z - f.x * 3.4 - f.z * 1.0); };
    const machine = (i: number) => () => beside(z.farm.machines[i % z.farm.machines.length]);
    const parked = (i: number) => () => { const m = z.farm.machines[i]; return m.task === 'idle' || m.task === 'stopped' || m.task === 'fault' ? beside(m) : null; };
    walt.brain = sel<NPC>(
      when(this.storm, seq(
        remark(['That wall of dust is coming fast. Get inside!', 'Storm! Leave it — get under cover!'], 'storm_warn', 20),
        goTo(garage, { speed: 3.4, label: 'running for shelter', dest: 'workshop' }),
        hold('stand', 6, 'sheltering from the storm', porch),
        remark(['Third one this month. Filters will be choked solid by morning.', 'You could lose a whole field in an hour of this.'], 'storm_wait', 30),
      )),
      when(() => !!this.zone.farm.machines.find((m) => !!m.fault), seq(
        act((n) => { n.state.emotion = 'worried'; }),
        goTo(() => { const m = this.faulted(); return m ? beside(m) : null; }, { speed: 1.9, label: 'going to the faulted machine' }),
        remark(() => { const m = this.faulted(); return m ? [`${m.name} is down again. ${m.fault}.`, `${m.name} has stopped. I will see what I can do.`] : ['Hm.']; }, 'fault_seen', 15),
        hold('kneel', [16, 22], 'repairing a machine', () => this.faulted()?.vehicle.position ?? null),
        act((n) => {
          const m = this.faulted();
          if (m) { z.farm.command(m, 'repair'); n.state.emotion = 'tired'; n.bark([`Cleared it. ${m.name} should come back up in a moment.`], 'fault_fixed', 5); }
        }),
        wait(9),
      )),
      when(() => walt.state.flags.visitor === true, hold('talk', 4, 'talking with a neighbour', () => this.npcs.get('ines')?.pos ?? null)),
      when(this.night, seq(goTo(() => new V(porch.x - 2.2, porch.y, porch.z + 0.2), { label: 'heading in for the night', dest: 'porch' }), hold('sit', 60, 'resting on the porch', () => this.P(FARM.x, FARM.z + 60)))),
      shuffle<NPC>(
        seq(workAt(() => this.P(FARM.x - 26 + Math.random() * 52, FARM.z + 64.4), 'inspect', [12, 18], 'inspecting the crop', () => this.P(FARM.x, FARM.z + 90)),
          remark(['Leaves are spotting again on this side.', 'Still green. For now.', 'Ears are filling light this year.'], 'crop_look')),
        seq(workAt(parked(0), 'kneel', [14, 20], 'servicing the tractor', () => z.farm.machines[0].vehicle.position),
          remark(['Dust gets into every bearing on this thing.', 'One more season out of you. That is all I ask.'], 'tractor_fix')),
        seq(workAt(parked(1), 'operate', [9, 13], 'cleaning the combine screens', () => z.farm.machines[1].vehicle.position)),
        seq(goTo(garage, { label: 'fetching supplies', dest: 'workshop' }), hold('operate', [5, 8], 'gathering filters and oil'),
          goTo(machine(2), { label: 'carrying supplies', speed: 1.15 }), hold('kneel', [8, 12], 'changing an air filter', () => z.farm.machines[2].vehicle.position)),
        seq(workAt(this.P(HOUSE.x - 12.6, HOUSE.z + 1.2), 'operate', [7, 10], 'checking the water tanks', this.P(HOUSE.x - 14.5, HOUSE.z - 1.5))),
        seq(workAt(this.P(FARM.x - 40, FARM.z + 30), 'stand', [8, 14], 'watching the horizon', this.P(FARM.x - 400, FARM.z + 300)),
          remark(['Sky has that yellow in it again.', 'Wind is turning. I do not like it.'], 'horizon')),
        seq(workAt(this.P(FARM.x + 48.4, FARM.z - 6.4), 'operate', [6, 9], 'dipping the diesel tank', this.P(FARM.x + 51, FARM.z - 9))),
      ),
    );

    // ------------------------------------------------------------------ the Heller place (1.3 km up the road)
    const hollis = await this.npcs.spawn({
      id: 'hollis', name: 'Hollis Heller', role: 'Neighbour · corn grower', model: 'char_civilian',
      look: { shirt: 'cloth_khaki', pants: 'cloth_denim', hair: 'hair_brown', hat: 'cloth_navy', scale: 1.02, width: 1.06 },
      state: { location: 'Heller Place', emotion: 'worried', knowledge: ['harvest', 'rationing'], access: ['heller'], equipment: ['wrench'] },
      dialogue: this.hollisTalk(),
    }, site(heller, 6, 6), 1.0);
    const hShed = site(heller, 15.3, -4.5);
    hollis.brain = sel<NPC>(
      when(this.storm, seq(goTo(hShed, { speed: 3.2, label: 'running for shelter' }), hold('stand', 8, 'sheltering from the storm'))),
      when(this.night, seq(goTo(site(heller, -3, 0)), hold('sit', 60, 'resting'))),
      shuffle<NPC>(
        seq(workAt(site(heller, -22.5, 8.4), 'kneel', [15, 22], 'repairing the harrow', site(heller, -24, 10)), remark(['Welded this frame four times now.', 'They do not make the tines any more. Nobody makes anything any more.'], 'harrow')),
        seq(workAt(site(heller, -13.4, 4.4), 'operate', [6, 10], 'checking the water tank', site(heller, -15, 2))),
        seq(workAt(site(heller, -19, -6), 'inspect', [8, 12], 'checking the grain bin', site(heller, -22, -8))),
        seq(workAt(site(heller, 19, 6.4), 'stand', [8, 12], 'counting hay', site(heller, 20, 4))),
        seq(workAt(site(heller, 2, 16), 'stand', [10, 16], 'watching the road', site(heller, 0, 60))),
      ),
    );

    const ines = await this.npcs.spawn({
      id: 'ines', name: 'Ines Heller', role: 'Neighbour · former plant pathologist', model: 'char_civilian',
      look: { shirt: 'cloth_white', pants: 'cloth_khaki', hair: 'hair_black', hat: null, longHair: true, skin: 'skin_dark', scale: 0.93, width: 0.9 },
      state: { location: 'Heller Place', emotion: 'focused', knowledge: ['blight', 'atmosphere', 'soil'], access: ['heller'], equipment: ['sample case', 'hand lens'] },
      dialogue: this.inesTalk(), walkSpeed: 1.45,
    }, site(heller, -6, 10), 0.4);
    // road shoulder between the two farms
    const shoulder = (s0: number, s1: number) => {
      const pts: THREE.Vector3[] = [];
      const step = s1 > s0 ? 28 : -28;
      for (let s = s0; step > 0 ? s < s1 : s > s1; s += step) { const r = map.roadAt(s); pts.push(new V(r.x - r.tz * 4.3, r.y, r.z + r.tx * 4.3)); }
      return pts;
    };
    const toFarm = () => [...shoulder(heller.s, 30), this.P(FARM.x + 8, FARM.z + 4)];
    const toHome = () => [...shoulder(30, heller.s), site(heller, -6, 10)];
    ines.brain = sel<NPC>(
      when(this.storm, seq(
        goTo((n) => (n.distanceTo(garage) < 140 ? garage : n.distanceTo(hShed) < 140 ? hShed : null), { speed: 3.3, label: 'running for shelter' }),
        hold('stand', 8, 'sheltering from the storm'),
      )),
      when(() => ines.state.flags.visiting === true, seq(
        follow(toFarm, { label: 'walking to the Cooper farm', dest: 'The Farm' }),
        act(() => { walt.state.flags.visitor = true; this.duetT = 2; this.duetI = 0; }),
        goTo(() => new V().copy(walt.pos).add(new V(1.5, 0, 0.6)), { radius: 0.4, label: 'visiting a neighbour' }),
        hold('talk', 52, 'talking with Walt', () => walt.pos),
        act(() => { walt.state.flags.visitor = false; }),
        workAt(() => this.P(FARM.x + 10 + Math.random() * 20, FARM.z + 64.4), 'kneel', [14, 18], 'taking leaf samples', () => this.P(FARM.x + 20, FARM.z + 90)),
        follow(toHome, { label: 'walking home', dest: 'Heller Place' }),
        act((n) => { n.state.flags.visiting = false; n.state.location = 'Heller Place'; }),
      )),
      when(this.night, seq(goTo(site(heller, -1, 1)), hold('sit', 60, 'resting'))),
      shuffle<NPC>(
        seq(workAt(site(heller, -30, 24), 'kneel', [12, 18], 'sampling soil', site(heller, -34, 30)), remark(['Nitrogen is through the roof. It feeds on that.', 'Same lesions. It is in this plot too.'], 'soil')),
        seq(workAt(site(heller, 26, 22), 'inspect', [10, 16], 'examining leaves', site(heller, 30, 30))),
        seq(workAt(site(heller, -8, 8), 'operate', [8, 12], 'logging samples')),
        seq(workAt(site(heller, 10, 14), 'stand', [8, 12], 'reading the wind')),
      ),
    );
    walt.state.flags.visitor = false;

    // ------------------------------------------------------------------ the co-op at the old mill (2.9 km)
    const abe = await this.npcs.spawn({
      id: 'abe', name: 'Abe Mills', role: 'Co-op operator', model: 'char_civilian',
      look: { shirt: 'cloth_navy', pants: 'cloth_khaki', hair: 'hair_gray', hat: null, scale: 1.0, width: 1.12 },
      state: { location: 'County Co-op', emotion: 'calm', knowledge: ['rationing', 'parts', 'fuel'], access: ['coop'], equipment: ['ledger', 'keys'] },
      dialogue: this.abeTalk(),
    }, site(mill, 2, 6), 0);
    abe.brain = sel<NPC>(
      when(this.storm, seq(goTo(site(mill, -6.7, -10.5), { speed: 3.0, label: 'running for shelter' }), hold('stand', 8, 'sheltering from the storm'))),
      when(this.night, seq(goTo(site(mill, 14, -6)), hold('sit', 60, 'resting'))),
      shuffle<NPC>(
        seq(workAt(site(mill, 2.2, 4.6), 'operate', [8, 12], 'metering diesel', site(mill, 4, 2)), remark(['Forty litres a household. Not a drop more.', 'Tanker did not come again this week.'], 'diesel')),
        seq(workAt(site(mill, -36, 9), 'inspect', [8, 12], 'checking a grain bin', site(mill, -40, 6))),
        seq(workAt(site(mill, -17, 19), 'kneel', [10, 14], 'greasing the grain cart', site(mill, -20, 22))),
        seq(workAt(site(mill, 6, 12), 'stand', [10, 16], 'tallying the ledger')),
        seq(workAt(site(mill, -3, 15.6), 'operate', [6, 9], 'stacking bales', site(mill, -2, 18))),
      ),
    );

    for (const n of this.npcs.list) n.state.location = n.state.location || 'County';
    bus.on('zone', (zn: any) => { if (zn === this.zone) this.npcs.rebind(); });
  }

  // ---------------------------------------------------------------------------------------------- dialogue
  private timeWord() { const h = this.zone.weather.hours; return h < 11 ? 'Morning' : h < 17.5 ? 'Afternoon' : 'Evening'; }

  private waltTalk(): DialogueDef {
    const z = this.zone;
    return {
      greet: (c) => {
        if (this.storm()) return 'Not out here! Talk under a roof — move!';
        const f = this.faulted();
        if (f) return `${this.timeWord()}. ${f.name} is down — ${f.fault!.toLowerCase()}. I am on it, unless you get to the office computer first.`;
        if (story.has('mission_accepted') && c.n('goodbye') === 0) return 'So it is true, then. You are going.';
        return rotate(c, 'greet_v', [
          `${this.timeWord()}, Coop. Machines are behaving, more or less.`,
          'Back again. What do you need?',
          `${this.timeWord()}. Dust count is up; I would keep the windows shut tonight.`,
          'There you are. I was about to come and find you.',
        ]);
      },
      topics: [
        { id: 'machines', label: 'How do I direct the machines?', say: [
          ['Walk up to any of them, or use the computer in the office — same control list either way.',
            'Start harvesting sends a combine to its field and it works the rows by itself. Return to farm brings it home. Follow assigned route sends it round the yard loop to keep the batteries up.',
            'If the guidance drifts or something jams, it stops and raises a fault. Repair clears it — takes a few seconds. And you can always climb in and drive it yourself.'],
          ['Controls are on the machine or in the office: harvest, stop, return, route, move to a field, refuel, repair, manual.', 'They head for cover by themselves when a storm warning comes through.'],
        ] },
        { id: 'fault', label: (c) => `What is wrong with ${this.faulted()?.name ?? 'it'}?`, when: () => !!this.faulted(), say: [
          () => { const m = this.faulted()!; return [`${m.fault}. Happens every few hours of work in this dust.`, 'You can clear it from the control list — Repair — or leave it to me.']; },
          () => { const m = this.faulted()!; return `Still ${m.fault!.toLowerCase()}. Repair it from the controls, or give me a few minutes.`; },
        ] },
        { id: 'storms', label: 'What should I do when a storm comes?', say: [
          ['You will see it first — a brown wall on the horizon — and the siren goes.', 'Get indoors, shut every window you opened, and wait it out. Anything left open fills with dust.', 'Machines come home on their own. Do not try to drive in the thick of it; you will not see the hood.'],
          'Indoors, windows shut, wait. The machines look after themselves.',
        ] },
        { id: 'harvest', label: 'How is the harvest looking?', say: [
          () => {
            const fr = [...z.farm.harvest.values()].map((h) => `${h.field.name} ${Math.round(h.fraction * 100)}%`).join(', ');
            return [`Cut so far: ${fr}.`, 'Yield is down again. We plant more acres every year and bring in less.'];
          },
        ] },
        { id: 'truck', label: 'The pickup has a route loaded.', say: [
          ['Those coordinates you worked out. Six kilometres east, up toward the old range road.', 'Nothing out there on any map I ever saw. Fence, mountain, and a lot of nothing.', 'Tank is full. If you go, go before dark — and watch the washouts past the Heller place.'],
          'East road, six kilometres. I still say there is nothing there. Prove me wrong.',
        ], effect: (c) => { story.set('walt_knows_route'); c.npc.learn('route'); } },
        { id: 'shortage', label: 'How are we for supplies?', say: [
          ['Diesel for maybe three weeks at this rate. Abe at the co-op meters it out by household now.', 'Filters are the real trouble. Every storm eats a set, and nobody is making new ones.'],
          'Three weeks of diesel, fewer filters than I would like. Abe might have more if you are passing the co-op.',
        ] },
        { id: 'goodbye', label: 'I am leaving, Walt. For a long time.', when: () => story.has('mission_accepted'), once: true, say: [
          ['...I figured, when the dust came in through your girl\'s window in straight lines.', 'I will keep them running. The machines, the fields. For as long as there is something to cut.', 'You come back and tell me what is out there.'],
        ], effect: (c) => { c.npc.state.emotion = 'grieving'; c.npc.state.relationship += 15; } },
      ],
      bye: (c) => rotate(c, 'bye_v', ['Right. Back to it.', 'Mind the dust.', 'I will be around.']),
    };
  }

  private hollisTalk(): DialogueDef {
    return {
      greet: (c) => {
        if (this.storm()) return 'Get under the shed roof, quick!';
        const e = story.num('errand_belt');
        if (e === 2) return 'You are back. Tell me Abe had one.';
        if (c.n('__greet') === 0) return ['Cooper. Do not see you up this way much.', 'If you are after grain, I have none to spare.'];
        return rotate(c, 'greet_v', ['Cooper.', `${this.timeWord()}. Road still open your side?`, 'Back again. Good — I could use the company.']);
      },
      topics: [
        { id: 'help', label: 'You look like you need a hand.', when: () => story.num('errand_belt') === 0, say: [
          ['I do. Rotor drive belt on my combine has stripped, and I have forty acres standing.', 'Abe keeps a few at the co-op, a mile and a half further east on this road. I cannot leave the place — would you ask him for one?'],
        ], effect: (c) => { story.set('errand_belt', 1); ui.toast('Errand: ask Abe at the County Co-op for a rotor drive belt.', 'info', 6); c.npc.state.emotion = 'hopeful'; } },
        { id: 'belt_wait', label: 'About that belt…', when: () => story.num('errand_belt') === 1, say: [
          'Abe, at the co-op — the old mill, east along the road. Tell him it is for the Heller combine.',
          'Still need it. The co-op is the cluster of bins past the dry creek.',
        ] },
        { id: 'belt_give', label: 'Abe sent this drive belt.', when: () => story.num('errand_belt') === 2, once: true, say: [
          ['That is the one. You have saved me the back forty.', 'Here is something for it: when your combines start faulting on temperature, it is never the engine. Pull the radiator screen and knock the dust out — two minutes — before you let them call for a repair.', 'And Cooper — thank you.'],
        ], effect: (c) => { story.set('errand_belt', 3); c.npc.state.relationship += 30; c.npc.state.emotion = 'relieved'; ui.toast('Errand complete. Hollis will remember that.', 'good', 5); } },
        { id: 'shortage', label: 'How are things holding up here?', say: [
          ['Wheat went seven years back. Okra last season. Now it is corn or nothing, and the corn is going the same way.', 'County cut the fuel ration again. They say grow more and then they give us less to grow it with.'],
          ['Same as everyone. Less every year.', 'My boy tested for university. They told him the world needs farmers, not engineers.'],
          'We are still here. That is the most I can say.',
        ] },
        { id: 'tech', label: 'Any advice for my machines?', after: 'belt_give', say: [
          ['Blow the radiator screens out every morning. Check the feeder chain tension when the stalks are dry — that is when it jams.', 'And do not trust the guidance near the east ridge. Compass spins up there like something is pulling at it.'],
          'Screens, chain tension, and stay clear of the ridge with anything automatic.',
        ], effect: () => story.set('heard_anomaly') },
        { id: 'east', label: 'What is further east on this road?', say: [
          ['The co-op, then the old Voss place — nothing left there but a wrecked harvester. After that the road climbs into the range.', 'There was an air-defence station in that mountain when my father was young. Fenced off. Nobody goes up.'],
          'Co-op, a wreck, then the mountain and its fence.',
        ], effect: () => story.set('heard_station') },
      ],
      bye: (c) => rotate(c, 'bye_v', ['Go careful.', 'Watch the sky.', 'Be seeing you.']),
    };
  }

  private inesTalk(): DialogueDef {
    return {
      greet: (c) => {
        if (this.storm()) return 'Cover your mouth and move — talk later.';
        if (c.npc.state.flags.visiting) return 'Oh — Cooper. I am walking over to see Walt about your south field.';
        return rotate(c, 'greet_v', ['Cooper. Mind the flags, those are sample plots.', 'Hello again. Come to look at dying plants with me?', `${this.timeWord()}. I have results, if you want the bad news.`]);
      },
      topics: [
        { id: 'blight', label: 'What exactly is the blight?', say: [
          ['A fungus-like organism. It does not just kill the plant — it breathes nitrogen and it is very, very good at it.', 'Every crop we lose, it gets a bigger share of the air. The more it grows, the less oxygen the rest of us have.', 'Corn has resistance the others did not. Had. I am seeing lesions on the corn now too.'],
          ['It feeds on nitrogen, which is most of the atmosphere. It is not a pest we can spray; it is a competitor.', 'I give the corn a few more seasons. Fewer here than further north.'],
          'Nitrogen-breathing, spreading, and now in the corn. I wish I had more to tell you.',
        ], effect: (c) => { story.set('knows_blight'); c.npc.state.relationship += 3; } },
        { id: 'air', label: 'And the air?', after: 'blight', say: [
          ['Oxygen fraction has been falling for decades. Slowly. You do not notice until children start coughing through the night.', 'The last people to starve will be the first to suffocate. That is the arithmetic.'],
          'Falling. Slowly, and then not slowly.',
        ], effect: () => story.set('knows_air') },
        { id: 'work', label: 'What are you working on?', say: [
          (c) => [`Right now: ${c.npc.state.task}.`, 'I was a plant pathologist before they closed the university. Now I keep records nobody asks for, in case somebody someday does.'],
          (c) => `${c.npc.state.task.charAt(0).toUpperCase() + c.npc.state.task.slice(1)}. The records matter, even if only to me.`,
        ] },
        { id: 'fix', label: 'Is anyone trying to fix it?', after: 'blight', say: [
          ['Officially there is nobody left to try. No labs, no funding, no armies, no space programme. Just farms.', 'Unofficially... seed stock keeps disappearing from the county vault, and somebody signs for it with an agency that was shut down before I was born.'],
          'If somebody is, they are not telling farmers.',
        ], effect: () => story.set('heard_agency') },
        { id: 'south', label: 'How is my south field?', say: [
          ['Edge rows are spotting. The centre is clean so far.', 'Cut the edges first and keep that grain separate. Do not store it with the rest.'],
          'Edges first, store it apart. That is all you can do.',
        ] },
      ],
      bye: (c) => rotate(c, 'bye_v', ['Take care of that girl of yours.', 'Good luck, Cooper.', 'I should get back to it.']),
    };
  }

  private abeTalk(): DialogueDef {
    return {
      greet: (c) => {
        if (this.storm()) return 'Inside, inside! The shed, go!';
        if (story.num('errand_belt') === 1) return 'Cooper. You have the look of a man sent on an errand.';
        return rotate(c, 'greet_v', ['Co-op is open, such as it is.', `${this.timeWord()}, Cooper. Ration book or just talk?`, 'If it is diesel you want, the answer is forty litres.']);
      },
      topics: [
        { id: 'belt', label: 'Hollis Heller needs a rotor drive belt.', when: () => story.num('errand_belt') === 1, once: true, say: [
          ['For the old Heller combine? I have exactly two that fit, and no more coming, ever.', 'Take one. Tell Hollis it goes on his account — and tell him to tension it properly this time.'],
        ], effect: (c) => { story.set('errand_belt', 2); ui.toast('Received: rotor drive belt. Take it back to Hollis Heller.', 'good', 6); c.npc.state.relationship += 5; } },
        { id: 'ration', label: 'How does the rationing work now?', say: [
          ['Forty litres of diesel a household a week, drawn here. Seed by acreage. Parts by whoever shouts loudest.', 'The tanker used to come Tuesdays. Then alternate Tuesdays. I have not seen it in nineteen days.'],
          ['Forty litres, if I have it. I mostly do not.', 'Your own tank at the farm is better stocked than mine. Look after it.'],
          'Same as before: forty litres, when there is any.',
        ] },
        { id: 'parts', label: 'Where do spare parts come from?', say: [
          ['Other machines. That wreck at the Voss place has given this county six combines\' worth of bearings.', 'Nothing new has been built in twenty years. Every part in the valley is on its third or fourth machine.'],
          'From wrecks. From the dead ones. Same as everything.',
        ] },
        { id: 'trucks', label: 'Seen anything unusual on the road?', say: [
          ['Funny you ask. Unmarked trucks, at night, heading up the range road with their lights off. Twice last month.', 'Road goes nowhere. I reported it. Nobody came to ask me about it, which tells you something.'],
          'Trucks without lights going up the range road. I have stopped reporting it.',
        ], effect: () => story.set('heard_trucks') },
      ],
      bye: (c) => rotate(c, 'bye_v', ['Mind how you go.', 'Shut the gate behind you.', 'Tell Walt he owes me a filter.']),
    };
  }

  // ---------------------------------------------------------------------------------------------- runtime
  fixedUpdate(dt: number) {
    this.npcs.fixedUpdate(dt);
    // Ines walks over to the farm every so often
    const ines = this.npcs.get('ines');
    if (ines && !ines.state.flags.visiting && !this.storm() && !this.night()) {
      this.visitTimer -= dt;
      if (this.visitTimer <= 0) { this.visitTimer = 1500; ines.state.flags.visiting = true; }
    }
    // the two of them talking in the yard
    const walt = this.npcs.get('walt');
    if (walt && ines && walt.state.flags.visitor === true && ines.state.task === 'talking with Walt') {
      this.duetT -= dt;
      if (this.duetT <= 0 && this.duetI < DUET.length) {
        const [who, text] = DUET[this.duetI++];
        const sp = who === 'i' ? ines : walt;
        this.duetT = (sp.say(text) || 3.5) + 0.8;
      }
    }
  }

  update(dt: number) { this.npcs.update(dt); }

  serialize() { return { npcs: this.npcs.serialize(), visit: this.visitTimer }; }
  deserialize(d: any) { this.npcs.deserialize(d.npcs); this.visitTimer = d.visit ?? 240; }
}

const DUET: [string, string][] = [
  ['i', 'Walt. Your south edge rows are spotting — I saw it from the road.'],
  ['w', 'I know it. I walked them this morning.'],
  ['i', 'Cut the edges first. Keep that grain out of the main bin.'],
  ['w', 'And put it where? Every bin in the county is half empty and I still have nowhere clean.'],
  ['i', 'Then burn it. I mean it.'],
  ['w', 'Burning food. My father would have taken a strap to me.'],
  ['i', 'Your father had wheat.'],
  ['w', '...Take your samples. I will get the combine round there by evening.'],
];

void cond; void ({} as DCtx); void ({} as BT<NPC>); void ({} as NPCDef);
