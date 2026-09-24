// Seeded, forkable pseudo-random number generation.
//
// Every generated entity carries a 32-bit seed. All randomness used while
// building it is drawn from an RNG derived from that seed, which makes a
// generation fully reproducible: saving a world only needs to store the
// prompt + seed + transform, and loading simply re-runs the generators.
//
// `fork(label)` derives an independent sub-stream so that adding or removing
// random draws in one part of a generator (e.g. hair) does not shift the
// values seen by another part (e.g. face shape).

export function hashString(str) {
  // FNV-1a followed by a murmur3-style avalanche.
  let h = 0x811c9dc5 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

export function hash2(a, b) {
  let h = (Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1)) >>> 0;
  h ^= h >>> 15; h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

export function randomSeed() {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] >>> 0;
  }
  return (Math.random() * 4294967296) >>> 0;
}

export class RNG {
  constructor(seed = 1) {
    // sfc32 state initialised from a single seed via splitmix32.
    let s = (typeof seed === 'string' ? hashString(seed) : seed >>> 0) || 0x9e3779b9;
    this.seed = s;
    const sm = () => {
      s = (s + 0x9e3779b9) >>> 0;
      let z = s;
      z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
      z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
      return (z ^ (z >>> 16)) >>> 0;
    };
    this.a = sm(); this.b = sm(); this.c = sm(); this.d = sm();
    for (let i = 0; i < 12; i++) this.nextU32();
  }
  nextU32() {
    let { a, b, c, d } = this;
    const t = (((a + b) >>> 0) + d) >>> 0;
    d = (d + 1) >>> 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) >>> 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) >>> 0;
    this.a = a; this.b = b; this.c = c; this.d = d;
    return t >>> 0;
  }
  next() { return this.nextU32() / 4294967296; }
  range(a, b) { return a + (b - a) * this.next(); }
  int(a, b) { return a + Math.floor(this.next() * (b - a + 1)); }
  chance(p) { return this.next() < p; }
  sign() { return this.next() < 0.5 ? -1 : 1; }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  normal(mean = 0, sd = 1) {
    let u = 0, v = 0;
    while (u === 0) u = this.next();
    while (v === 0) v = this.next();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  // Normal distribution clamped to [lo, hi].
  gauss(mean, sd, lo = -Infinity, hi = Infinity) {
    return Math.min(hi, Math.max(lo, this.normal(mean, sd)));
  }
  weighted(entries) {
    // entries: [[value, weight], ...]
    let total = 0;
    for (const e of entries) total += e[1];
    let r = this.next() * total;
    for (const e of entries) { r -= e[1]; if (r <= 0) return e[0]; }
    return entries[entries.length - 1][0];
  }
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
  fork(label = '') { return new RNG(hash2(this.seed, hashString(String(label)))); }
  // Jitter a value by +-fraction.
  jitter(v, frac) { return v * (1 + (this.next() * 2 - 1) * frac); }
}
