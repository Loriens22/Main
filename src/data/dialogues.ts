import type { DialogueTree } from '../npc/Dialogue';
import type { Game } from '../core/Game';

const remember = (id: string, key: string) => (g: Game) => {
  const n = g.state.npcs[id];
  if (n && !n.memory.includes(key)) n.memory.push(key);
};
const trust = (id: string, d: number) => (g: Game) => {
  const n = g.state.npcs[id];
  if (n) n.relationship = Math.max(-1, Math.min(1, n.relationship + d));
};

export const DIALOGUES: Record<string, DialogueTree> = {
  // ------------------------------------------------------------------------------------------ farmers
  walt: {
    start: {
      id: 'start', who: 'walt',
      text: (g) => (g.state.npcs.walt.memory.includes('met') ? 'Back again. Corn’s holding, which is more than I can say for anything else.' : 'Morning. You look like a man with somewhere to be. Or a woman. Hard to tell with all this dust in my eyes.'),
      effect: remember('walt', 'met'),
      options: [
        { text: 'How is the harvest looking?', next: 'harvest' },
        { text: 'Any news from town?', next: 'news' },
        { text: 'Do you need help with anything?', next: 'help' },
        { text: 'Take care, Walt.' },
      ],
    },
    harvest: {
      id: 'harvest', who: 'walt',
      text: 'Better than last year, worse than the year before. Blight took the north quarter in eight days. Corn’s the last thing that grows clean, and nobody wants to say out loud how long that lasts.',
      options: [{ text: 'What happened to the wheat?', next: 'wheat' }, { text: 'Thanks.', next: 'start' }],
    },
    wheat: {
      id: 'wheat', who: 'walt',
      text: 'Same as the okra. Leaves go brown at the edges, then the whole field just lies down. The scientists call it a blight. I call it the end of the menu.',
      options: [{ text: 'Back.', next: 'start' }],
    },
    news: {
      id: 'news', who: 'walt',
      text: 'Co-op cut the rations again. Tomas says they turned away three trucks from the county line. And there’s talk of that old NORAD mountain having its lights on at night. Probably nothing.',
      effect: remember('walt', 'rumour_nasa'),
      options: [{ text: 'Lights in the mountain?', next: 'lights' }, { text: 'Back.', next: 'start' }],
    },
    lights: {
      id: 'lights', who: 'walt',
      text: 'Six miles up the section road, past the old gate. Fence is new, cameras are new. Government work. If you go poking around, take water. Storms come fast up there.',
      options: [{ text: 'Back.', next: 'start' }],
    },
    help: {
      id: 'help', who: 'walt',
      text: 'My combine’s down to one working header. If you could keep yours running on field three, I can borrow it when you’re done. Set it to harvest from the farm computer or just tell it what to do.',
      effect: trust('walt', 0.1),
      options: [{ text: 'I’ll see what I can do.', effect: (g) => g.notify('Optional: harvest field 3 with a combine', 'info', 5) }],
    },
  },
  june: {
    start: {
      id: 'start', who: 'june',
      text: (g) => (g.state.npcs.june.memory.includes('met') ? 'Hey. Anything rattling that shouldn’t be?' : 'You’re the one with the red Steigers, right? Your number two has a hydraulic leak you can hear from my porch.'),
      effect: remember('june', 'met'),
      options: [
        { text: 'Can you check my machines?', next: 'machines' },
        { text: 'How do you keep everything running?', next: 'parts' },
        { text: 'Have you heard about the mountain facility?', next: 'nasa', cond: (g) => !!g.state.flags.reachedNasa },
        { text: 'See you, June.' },
      ],
    },
    machines: {
      id: 'machines', who: 'june',
      text: 'Wear catches up with them. When a machine reports trouble, send it to your workshop — the REPAIR command does the rest. Dust kills radiators first, then bearings. Clean the screens after every storm.',
      options: [{ text: 'Good advice.', next: 'start', effect: trust('june', 0.08) }],
    },
    parts: {
      id: 'parts', who: 'june',
      text: 'Salvage. Every farm that goes under leaves a yard full of parts. I don’t like what that says about the world, but I like having bearings.',
      options: [{ text: 'Back.', next: 'start' }],
    },
    nasa: {
      id: 'nasa', who: 'june',
      text: 'So it’s real. I serviced a flatbed for them once — they paid in diesel and asked me not to talk. Whatever they are building in there, I hope it flies.',
      options: [{ text: 'So do I.', next: 'start' }],
    },
  },
  tomas: {
    start: {
      id: 'start', who: 'tomas',
      text: (g) => (g.state.npcs.tomas.memory.includes('met') ? 'Still here. The road is still here. That counts as good news lately.' : 'Tomas Ruiz. I haul for the co-op. If it’s grain, I’ve moved it. If it’s gossip, I’ve heard it.'),
      effect: remember('tomas', 'met'),
      options: [
        { text: 'What’s the co-op saying?', next: 'coop' },
        { text: 'Seen any storms coming?', next: 'storm' },
        { text: 'See you on the road.' },
      ],
    },
    coop: {
      id: 'coop', who: 'tomas',
      text: 'Quotas up, prices flat, half the trucks parked for lack of tires. They say the cities are worse. People leave and don’t write back.',
      options: [{ text: 'Back.', next: 'start' }],
    },
    storm: {
      id: 'storm', who: 'tomas',
      text: 'There’s always one coming. You see the sky go brown at the western edge, you have maybe twenty minutes. Get the machines in, shut the vents, wet a cloth for your face.',
      options: [{ text: 'Thanks for the warning.', next: 'start', effect: trust('tomas', 0.05) }],
    },
  },
  // ------------------------------------------------------------------------------------------ NASA
  kessler: {
    start: {
      id: 'start', who: 'kessler',
      text: (g) => (g.state.mission.decision === 'endurance' ? 'Your crew is heading to the silo. There is nothing left to say that the work won’t say better.' : g.state.npcs.kessler.memory.includes('met') ? 'Commander. The beacons are still transmitting. Have you made up your mind?' : 'Commander. Thank you for coming. I won’t pretend this is a normal job offer.'),
      effect: remember('kessler', 'met'),
      options: [
        { text: 'Tell me about the mission.', next: 'mission' },
        { text: 'What do we know about the planets?', next: 'planets' },
        { text: 'Why me?', next: 'whyme', cond: (g) => !g.state.npcs.kessler.memory.includes('whyme') },
        { text: 'I need more time. We continue research here.', next: 'research', cond: (g) => g.state.mission.decision !== 'endurance' },
        { text: 'Begin the Endurance mission.', next: 'go', cond: (g) => g.state.mission.decision !== 'endurance' },
        { text: 'Thank you, Director.' },
      ],
    },
    mission: {
      id: 'mission', who: 'kessler',
      text: 'Endurance is in low orbit with one Ranger and both Landers docked. Ranger 1 rides the launch vehicle in our silo to complete her complement. You fly to Saturn, through the anomaly, and evaluate the three most promising worlds the Lazarus volunteers found. You decide where humanity goes next.',
      options: [{ text: 'And the wormhole?', next: 'wormhole' }, { text: 'Back.', next: 'start' }],
    },
    wormhole: {
      id: 'wormhole', who: 'kessler',
      text: 'It appeared near Saturn forty-eight years ago. Our models say it is a stable throat to a distant galaxy. Models. Nobody has come back through it to tell us we were right.',
      options: [{ text: 'Back.', next: 'start' }],
    },
    planets: {
      id: 'planets', who: 'kessler',
      text: 'Miller’s world: an ocean, close to the black hole — every hour there costs years here. Mann’s world: ice, but his data is the strongest. Edmunds’ world: rock and thin air; his beacon went quiet. The data is on the planetary terminal.',
      options: [{ text: 'Back.', next: 'start' }],
    },
    whyme: {
      id: 'whyme', who: 'kessler',
      text: 'Because you can fly anything with a throttle, and because you still believe the future is a place you can go to. We are short on both.',
      effect: remember('kessler', 'whyme'),
      options: [{ text: 'Back.', next: 'start' }],
    },
    research: {
      id: 'research', who: 'kessler',
      text: 'Then we keep working. Use the facility — the labs, the simulators, the greenhouse. There is no countdown on this decision except the one in the dust outside.',
      effect: (g) => (g.zone as any)?.content?.nasa?.decide('research'),
      options: [{ text: 'Understood.' }],
    },
    go: {
      id: 'go', who: 'kessler',
      text: 'Very well. I’ll give the order. Ward, Sato and Reyes will meet you at the silo. Take the elevator north of the atrium down to the hangar level, then the gantry lift to the crew access arm.',
      effect: (g) => (g.zone as any)?.content?.nasa?.decide('endurance'),
      options: [{ text: 'We won’t let you down.' }],
    },
  },
  ward: {
    start: {
      id: 'start', who: 'ward',
      text: (g) => (g.state.mission.decision === 'endurance' ? 'Launch vehicle checks are green. Just say the word, boss.' : 'Commander. I’ve been through Ranger 1 bolt by bolt. She’s tighter than my budget.'),
      options: [
        { text: 'What should I know about the Ranger?', next: 'ranger' },
        { text: 'Any concerns about the launch?', next: 'concern' },
        { text: 'Carry on.' },
      ],
    },
    ranger: {
      id: 'ranger', who: 'ward',
      text: 'Lifting body, rear main engines, ventral thrusters for landing, RCS everywhere. She can get off a low-gravity world by herself; Earth needs the booster. Watch your closing rate when docking — under a quarter metre per second at contact.',
      options: [{ text: 'Back.', next: 'start' }],
    },
    concern: {
      id: 'concern', who: 'ward',
      text: 'The booster is older than me and the paint is older than that. But the engines are new. If the autopilot does its job we’ll be in orbit in eight minutes and docked inside the hour.',
      options: [{ text: 'Back.', next: 'start' }],
    },
  },
  sato: {
    start: {
      id: 'start', who: 'sato',
      text: 'I’ve been modelling the three Lazarus worlds all night. Miller’s ocean is fascinating and terrifying in equal parts.',
      options: [
        { text: 'Terrifying how?', next: 'miller' },
        { text: 'Which planet do you favour?', next: 'favour' },
        { text: 'Get some rest, Doctor.' },
      ],
    },
    miller: {
      id: 'miller', who: 'sato',
      text: 'The tidal forces near Gargantua should raise enormous waves — kilometre-scale. And the time dilation… an hour on the surface is seven years at home. Every minute down there is a birthday you miss.',
      options: [{ text: 'Back.', next: 'start' }],
    },
    favour: {
      id: 'favour', who: 'sato',
      text: 'Edmunds. His early data was clean — liquid water, a carbon cycle, temperatures you could farm in. But science says go where the data is, not where the heart is. I’m trying to listen to science.',
      options: [{ text: 'Back.', next: 'start' }],
    },
  },
  reyes: {
    start: {
      id: 'start', who: 'reyes',
      text: 'Your physical is clean, Commander. The cryo pods are certified for four. I’ve packed enough medical supplies for ten.',
      options: [
        { text: 'How does cryosleep feel?', next: 'cryo' },
        { text: 'Are you ready for this?', next: 'ready' },
        { text: 'Thanks, Doctor.' },
      ],
    },
    cryo: {
      id: 'cryo', who: 'reyes',
      text: 'Like a dreamless night that ends with the worst cold you’ve ever had. You lose the time but not the age — biology slows, it doesn’t stop. I’ll be there when you wake up.',
      options: [{ text: 'Back.', next: 'start' }],
    },
    ready: {
      id: 'ready', who: 'reyes',
      text: 'I left a lot of people behind to be here. I’d like the trip to mean something for them. So yes — I’m ready.',
      effect: trust('reyes', 0.05),
      options: [{ text: 'Back.', next: 'start' }],
    },
  },
  staff: {
    start: {
      id: 'start', who: 'capcom',
      text: 'Sorry, Commander — busy with telemetry. Director Kessler is in the glass office at the back of mission control.',
      options: [{ text: 'Thanks.' }],
    },
  },
};
