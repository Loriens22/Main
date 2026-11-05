/// <reference lib="webworker" />
// Code-capacity Monte-Carlo: i.i.d. X errors with probability p on data qubits, perfect syndromes,
// BP (min-sum) + OSD-0 decoding of the Z checks; failure = residual anticommutes with any logical Z.
import { bpDecode, tanner, wilson } from '../lib/bp';
import { getCode, logicalZ, syndrome } from '../lib/codes';
import { mulberry32 } from '../lib/rng';

interface Job { id: number; codes: string[]; ps: number[]; trials: number; seed: number }

self.onmessage = (ev: MessageEvent<Job>) => {
  const { id, codes, ps, trials, seed } = ev.data;
  const t0 = performance.now();
  for (const name of codes) {
    const c = getCode(name);
    const T = tanner(c.HZ);
    const Lz = logicalZ(c);
    const k = Lz.length;
    for (const p of ps) {
      const rng = mulberry32(seed + Math.round(p * 1e6) + name.length * 7919);
      let fails = 0, osd = 0;
      for (let t = 0; t < trials; t++) {
        const e = new Uint8Array(c.n);
        for (let j = 0; j < c.n; j++) if (rng() < p) e[j] = 1;
        const s = syndrome(c.HZ, e);
        let any = false;
        for (let i = 0; i < s.length; i++) if (s[i]) { any = true; break; }
        let corr: Uint8Array;
        if (any) { const r = bpDecode(T, s, p, 40); corr = r.correction; if (r.osd) osd++; } else corr = new Uint8Array(c.n);
        for (const z of Lz) {
          let v = 0;
          for (let j = 0; j < c.n; j++) v ^= z[j] & (e[j] ^ corr[j]);
          if (v) { fails++; break; }
        }
      }
      const w = wilson(fails, trials);
      (self as unknown as Worker).postMessage({ id, type: 'point', code: name, k, n: c.n, p, fails, trials, osd, rate: w.p, lo: w.lo, hi: w.hi, perQubit: 1 - Math.pow(1 - w.p, 1 / k), ms: performance.now() - t0 });
    }
  }
  (self as unknown as Worker).postMessage({ id, type: 'done', ms: performance.now() - t0 });
};
