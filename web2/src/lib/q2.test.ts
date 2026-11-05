import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { bpDecode, tanner } from './bp';
import { getCode, kOf, logicalZ, syndrome } from './codes';
import { coherenceBudget, maxQubits, type Arch, type HeatParams } from './cryo';
import { mulberry32 } from './rng';

const data = (f: string) => JSON.parse(readFileSync(new URL(`../../public/data/${f}`, import.meta.url), 'utf8'));

describe('codes match the Python construction', () => {
  const py = data('q2_codes.json') as any[];
  for (const c of py) {
    it(`${c.name}: n, k, supports`, () => {
      const code = getCode(c.name);
      expect(code.n).toBe(c.n);
      expect(kOf(code)).toBe(c.k);
      for (let i = 0; i < 3; i++) {
        expect([...code.HX[i]].flatMap((v, j) => (v ? [j] : []))).toEqual(c.hx_support[i]);
        expect([...code.HZ[i]].flatMap((v, j) => (v ? [j] : []))).toEqual(c.hz_support[i]);
      }
      expect(code.HX.reduce((a, r) => a + r.reduce((x, y) => x + y, 0), 0)).toBe(c.hx_weight_total);
    });
  }
  it('stabilisers commute and logical count equals k', () => {
    for (const name of ['bb72', 'gross144', 'bb288', 'surface_d5']) {
      const c = getCode(name);
      for (const x of c.HX) for (const z of c.HZ) { let v = 0; for (let j = 0; j < c.n; j++) v ^= x[j] & z[j]; expect(v).toBe(0); }
      expect(logicalZ(c).length).toBe(kOf(c));
    }
  });
});

describe('BP + OSD-0 decoder', () => {
  it('always returns a correction consistent with the syndrome and fixes low-weight errors', () => {
    const c = getCode('gross144');
    const T = tanner(c.HZ);
    const Lz = logicalZ(c);
    const rng = mulberry32(7);
    let fails = 0;
    for (let t = 0; t < 200; t++) {
      const e = new Uint8Array(c.n);
      for (let j = 0; j < c.n; j++) if (rng() < 0.02) e[j] = 1;
      const s = syndrome(c.HZ, e);
      const res = bpDecode(T, s, 0.02);
      expect([...syndrome(c.HZ, res.correction)]).toEqual([...s]);
      const r = e.map((v, j) => v ^ res.correction[j]);
      if (Lz.some((z) => z.reduce((a, v, j) => a ^ (v & r[j]), 0))) fails++;
    }
    expect(fails).toBeLessThan(10);
  });
  it('a weight-1 error on the surface code is corrected exactly', () => {
    const c = getCode('surface_d5');
    const e = new Uint8Array(c.n); e[12] = 1;
    const res = bpDecode(tanner(c.HZ), syndrome(c.HZ, e), 0.05);
    expect([...res.correction]).toEqual([...e]);
  });
});

describe('cryo model matches Python', () => {
  const py = data('q2_cryo_models.json');
  const P = py.params;
  for (const k of ['conventional', 'aurora']) {
    it(`${k}: coherence budget`, () => {
      const ts = coherenceBudget(P.ARCH[k] as Arch, P.KAPPA_2pi_MHz, P.CHI_2pi_MHz);
      const pv = py.architectures[k];
      expect(ts.nRes).toBeCloseTo(pv.n_readout, 10);
      expect(ts.T1 / pv.T1).toBeCloseTo(1, 9);
      expect(ts.T2 / pv.T2).toBeCloseTo(1, 9);
      for (const key of ['p2', 'p_idle', 'p_idle_meas', 'p_meas', 'p_reset'] as const) expect(ts.noise[key] / pv.noise[key]).toBeCloseTo(1, 9);
    });
  }
  for (const k of ['conventional', 'flex', 'aurora']) {
    it(`${k}: qubits per fridge`, () => {
      const r = maxQubits(P as HeatParams, k);
      expect(r.max).toBe(py.heat[k].max_qubits);
      expect(r.limiting).toBe(py.heat[k].limiting);
    });
  }
});
