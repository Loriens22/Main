import { describe, expect, test } from 'vitest';
import { AscentSim } from '../src/mission/Ascent';
import { R_EARTH, MU_EARTH } from '../src/space/Earth';

describe('ascent', () => {
  test('the stack reaches a near-circular parking orbit', () => {
    const s = new AscentSim();
    const log: string[] = [];
    s.onEvent = (e) => log.push(`${e} t=${s.t.toFixed(1)} h=${(s.h / 1000).toFixed(1)}km v=${s.speed.toFixed(0)} q=${(s.q / 1000).toFixed(1)}kPa pitch=${(s.pitch * 57.3).toFixed(1)}`);
    let trace = '';
    for (let i = 0; i < 60 * 900 && !s.done; i++) {
      s.step(1 / 60);
      if (i % (60 * 30) === 0) trace += `\n t=${s.t.toFixed(0)} h=${(s.h / 1000).toFixed(1)} vr=${s.vr.toFixed(0)} vt=${s.vt.toFixed(0)} pitch=${(s.pitch * 57.3).toFixed(1)} m=${(s.m / 1000).toFixed(1)}t`;
    }
    const vc = Math.sqrt(MU_EARTH / s.r);
    const energy = s.speed * s.speed / 2 - MU_EARTH / s.r;
    const a = -MU_EARTH / (2 * energy);
    const hmom = s.r * s.vt;
    const e = Math.sqrt(Math.max(0, 1 - (hmom * hmom) / (MU_EARTH * a)));
    console.log(log.join('\n') + trace + `\nfinal h=${(s.h / 1000).toFixed(1)}km vr=${s.vr.toFixed(1)} vt=${s.vt.toFixed(1)} vc=${vc.toFixed(1)} e=${e.toFixed(4)} peri=${((a * (1 - e) - R_EARTH) / 1000).toFixed(1)}km prop2=${s.stages[1].prop.toFixed(0)}`);
    expect(s.done).toBe(true);
    expect(a * (1 - e) - R_EARTH).toBeGreaterThan(150e3);
  });
});
