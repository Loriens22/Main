import { describe, it, expect } from 'vitest';
import { checkProgramme, progress, PROGRAMMES } from '../src/world/research/programme';
import { FaunaMemory } from '../src/world/fauna/memory';

/** the slice of Game the programme and the memory use */
function fakeGame(science: 'speculative' | 'conservative' = 'speculative') {
  const notes: string[] = [];
  const g = {
    state: { flags: {} as Record<string, string | number | boolean>, clock: { earthTime: 1e8 } },
    settings: { life: { science } },
    flag(k: string, v?: string | number | boolean) {
      if (v !== undefined) this.state.flags[k] = v;
      return this.state.flags[k];
    },
    notify(t: string) {
      notes.push(t);
    },
    log() {},
  };
  return { g, notes };
}

describe('research programmes', () => {
  it('credits stages strictly in order, and cascades through evidence gathered early', () => {
    const { g, notes } = fakeGame();
    const G = g as never;
    // evidence for stage 3 (the grove) arrives before stages 1–2: nothing is credited yet
    g.flag('bio:ferric:sighting', 1);
    g.flag('bio:ribbon:sighting', 1);
    g.flag('bio:prism:sighting', 1);
    checkProgramme(G, 'mars');
    expect(progress(G, 'mars')).toBe(0);
    expect(notes[0]).toContain('stage 1');
    // stage 1 (a regolith sample) — then stage 2 needs the borehole and the icebloom
    g.flag('sample:mars:regolith', 'x');
    checkProgramme(G, 'mars');
    expect(progress(G, 'mars')).toBe(1);
    g.flag('sample:mars:ice', 'x');
    g.flag('bio:icebloom:sighting', 1);
    checkProgramme(G, 'mars');
    // 2 and the already-held 3 are credited together
    expect(progress(G, 'mars')).toBe(3);
    expect(g.state.flags['prog:mars:3']).toBeTruthy();
    expect(notes.at(-1)).toContain(PROGRAMMES.mars.stages[3].goal);
  });

  it('is suspended in conservative science mode', () => {
    const { g, notes } = fakeGame('conservative');
    g.flag('sample:mars:regolith', 'x');
    checkProgramme(g as never, 'mars');
    expect(progress(g as never, 'mars')).toBe(0);
    expect(notes.length).toBe(0);
  });

  it('Jupiter stage 1 needs both the flight profile and the aeromites', () => {
    const { g } = fakeGame();
    g.flag('bio:aeromite:sighting', 1);
    checkProgramme(g as never, 'jupiter');
    expect(progress(g as never, 'jupiter')).toBe(0);
    g.flag('jupiter:profile', 'x');
    checkProgramme(g as never, 'jupiter');
    expect(progress(g as never, 'jupiter')).toBe(1);
  });
});

describe('fauna memory between visits', () => {
  it('counts visits, measures the time away and keeps values', () => {
    const { g } = fakeGame();
    const m1 = new FaunaMemory(g as never, 'site');
    expect(m1.visits).toBe(1);
    expect(m1.away).toBe(0);
    m1.set('prism.habit', 0.7);
    m1.bump('serpent.shoves');
    m1.bump('serpent.shoves');
    m1.set('young', { diedAt: 12.5, x: 1, z: 2 });
    // 30 hours later, a new visit
    g.state.clock.earthTime += 30 * 3600;
    const m2 = new FaunaMemory(g as never, 'site');
    expect(m2.visits).toBe(2);
    expect(m2.away).toBeCloseTo(30, 1);
    expect(m2.get('prism.habit', 0)).toBeCloseTo(0.7);
    expect(m2.get('serpent.shoves', 0)).toBe(2);
    expect(m2.get<{ diedAt?: number }>('young', {}).diedAt).toBe(12.5);
    expect(m2.get('missing', 'def')).toBe('def');
  });
});
