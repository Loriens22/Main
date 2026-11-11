import type { DialogueTree } from '../npc/Dialogue';
import type { Game } from '../core/Game';

/**
 * Dialogue for the Lazarus explorers found on the Gargantua worlds (original writing for this game's timeline).
 * Effects set the flags the site logic reads (world/surface/LazarusSites.ts).
 */
const follow = (id: string) => (g: Game) => {
  const n = g.state.npcs[id];
  if (n) n.following = true;
};
const waveSoon = (g: Game) => {
  const z = g.zone as unknown as { waves?: { next(x: number, z: number, t: number): { tta: number } | null }; time: number } | null;
  const nx = z?.waves?.next(g.player.pos.x, g.player.pos.z, z.time);
  return !!nx && nx.tta < 330;
};

export const LAZARUS_DIALOGUES: Record<string, DialogueTree> = {
  miller: {
    start: {
      id: 'start', who: 'miller',
      text: (g) => (g.state.npcs.miller.following
        ? 'Keep moving. I’m right behind you — the water’s easier to walk in than it looks.'
        : g.state.npcs.miller.memory.includes('met')
          ? 'Still here. Still counting waves.'
          : 'You’re real. I stopped trusting that beacon a few of my hours ago — I kept hearing engines in the surf. Tell me the ship is still up there.'),
      options: [
        { text: 'The Endurance is in orbit. We’re taking you home.', next: 'recorder', cond: (g) => !g.state.npcs.miller.following },
        { text: 'How long have you been down here?', next: 'time' },
        { text: 'There’s another wave coming.', next: 'wave', cond: waveSoon },
        { text: 'What did you find?', next: 'found' },
        { text: '[Leave]' },
      ],
    },
    time: {
      id: 'time', who: 'miller',
      text: 'By my watch, a little over three hours. By yours… don’t tell me yet. I stopped counting the waves at four. The first one took the antenna array and most of my water.',
      options: [{ text: 'Back.', next: 'start' }],
    },
    found: {
      id: 'found', who: 'miller',
      text: 'An ocean that is mostly tide. No shore, no floor deeper than your knees, and every few minutes the black hole lifts a mountain of it and walks it round the planet. Chemistry’s rich. Nothing could hold still long enough to live here.',
      options: [{ text: 'Back.', next: 'start' }],
    },
    wave: {
      id: 'wave', who: 'miller',
      text: 'Then we don’t have long. They come every eleven or twelve minutes and they don’t care how brave you are.',
      options: [{ text: 'Let’s go.', next: 'recorder' }],
    },
    recorder: {
      id: 'recorder', who: 'miller',
      text: (g) => (g.flag('miller_recorder')
        ? 'You found it. Good. Then get me out of this water — I’ll follow you to your ship.'
        : 'Not without the recorder. Every reading I’ve taken of this ocean is on it — tides, chemistry, all of it. It’s strapped inside the capsule behind the port hatch. I can’t climb back in on this ankle.'),
      options: [
        { text: 'Stay close. The Ranger’s this way.', cond: (g) => !!g.flag('miller_recorder'), effect: follow('miller') },
        { text: 'I’ll get it.', cond: (g) => !g.flag('miller_recorder') },
        { text: 'We don’t have time for that.', next: 'insist', cond: (g) => !g.flag('miller_recorder') },
      ],
    },
    insist: {
      id: 'insist', who: 'miller',
      text: 'Then make time. If I go home with nothing but a story, I stayed here for nothing — and so did the years it cost.',
      options: [{ text: 'All right. The port hatch.' }],
    },
  },
  mann: {
    start: {
      id: 'start', who: 'mann',
      text: (g) => (g.state.npcs.mann.following
        ? 'Lead on. I’ve been walking in circles on this glacier for a long time; it’s nice to walk somewhere.'
        : g.state.npcs.mann.memory.includes('met')
          ? 'Still deciding what to do with me?'
          : '…Someone came. I set the shelter for a century, and someone actually came. Forgive me — my voice hasn’t been used in a while.'),
      options: [
        { text: 'Dr. Mann. We followed your beacon.', next: 'data' },
        { text: 'Your raw logs say there’s nothing here.', next: 'confront', cond: (g) => !!g.flag('mann_logs_read') && !g.state.npcs.mann.following },
        { text: 'Take your time.', next: 'slow' },
        { text: '[Leave]' },
      ],
    },
    slow: {
      id: 'slow', who: 'mann',
      text: 'Time. Yes. I have rather a lot of that, and nothing to spend it on. You can’t imagine how loud the quiet gets.',
      options: [{ text: 'Back.', next: 'start' }],
    },
    data: {
      id: 'data', who: 'mann',
      text: 'And you were right to. Water under the ice, a workable chemistry — I sent everything I had. Everything that mattered.',
      options: [
        { text: 'Then show us.', next: 'show' },
        { text: 'Come aboard. We’ll go over it in orbit.', next: 'aboard', cond: (g) => !g.state.npcs.mann.following },
        { text: 'Back.', next: 'start' },
      ],
    },
    show: {
      id: 'show', who: 'mann',
      text: 'The records are on the terminal by the hab. All of them. Read them — and then I think you’ll understand why I’m so tired.',
      options: [{ text: '[Leave]' }],
    },
    confront: {
      id: 'confront', who: 'mann',
      text: 'Yes. I sent the good numbers. You wake every few years to the same white nothing, and you choose between the truth and the chance that somebody, someday, might come. I chose the chance. And here you are.',
      options: [
        { text: 'You brought us here on a lie.', next: 'lie' },
        { text: 'Come with us. You can tell the crew yourself.', next: 'aboard' },
        { text: 'We’ll leave you supplies. Not a seat.', next: 'leave' },
      ],
    },
    lie: {
      id: 'lie', who: 'mann',
      text: 'I gave you a reason to come. Whether that was a lie depends on what you find out there — Edmunds’ world, perhaps. Please. Don’t leave me with the ice.',
      options: [
        { text: 'Get your things.', next: 'aboard' },
        { text: 'I’m sorry. You’ll have supplies.', next: 'leave' },
      ],
    },
    aboard: {
      id: 'aboard', who: 'mann',
      text: 'Thank you. I’ll be no trouble — I’ve had a great deal of practice at being no trouble to anyone.',
      effect: follow('mann'),
      options: [{ text: '[Lead him to the Ranger]' }],
    },
    leave: {
      id: 'leave', who: 'mann',
      text: 'Supplies. Of course. Leave them by the hab and I’ll make them last; I’m good at that. Keep the light on for me, would you? In your logs, I mean. Somewhere.',
      effect: (g) => g.flag('mann_left', true),
      options: [{ text: '[Leave]' }],
    },
  },
};
