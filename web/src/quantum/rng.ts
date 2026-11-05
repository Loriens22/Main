// Deterministic, seedable PRNG (xoshiro128**) so every browser experiment can be replayed.

export class Rng {
  private s: Uint32Array;
  constructor(seed = 1) {
    this.s = new Uint32Array(4);
    let x = seed >>> 0 || 0x9e3779b9;
    for (let i = 0; i < 4; i++) {
      // splitmix32
      x = (x + 0x9e3779b9) >>> 0;
      let z = x;
      z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
      z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
      this.s[i] = (z ^ (z >>> 16)) >>> 0;
    }
  }
  nextU32(): number {
    const s = this.s;
    const result = Math.imul(rotl(Math.imul(s[1], 5) >>> 0, 7), 9) >>> 0;
    const t = (s[1] << 9) >>> 0;
    s[2] ^= s[0];
    s[3] ^= s[1];
    s[1] ^= s[2];
    s[0] ^= s[3];
    s[2] ^= t;
    s[3] = rotl(s[3], 11);
    return result;
  }
  random(): number {
    return this.nextU32() / 4294967296;
  }
  int(n: number): number {
    return Math.floor(this.random() * n);
  }
  normal(): number {
    let u = 0;
    while (u === 0) u = this.random();
    const v = this.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
}

function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}
