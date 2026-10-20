// Small math helpers shared by the mascot engine. Allocation-free on the hot path.

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smoothstep = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
export const easeOutBack = (t: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
export const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

/** Frame-rate independent exponential approach. */
export const approach = (cur: number, target: number, rate: number, dt: number) =>
  cur + (target - cur) * (1 - Math.exp(-rate * dt));

/** Wrap an angle to [-PI, PI]. */
export const wrapAngle = (a: number) => {
  a = (a + Math.PI) % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return a - Math.PI;
};

/** Critically-damped-ish spring on a scalar (semi-implicit Euler, sub-stepped). */
export class Spring {
  x: number;
  v = 0;
  constructor(x = 0, public freq = 4, public damping = 0.8) {
    this.x = x;
  }
  step(target: number, dt: number) {
    const w = this.freq * Math.PI * 2;
    const steps = dt > 1 / 120 ? Math.ceil(dt / (1 / 120)) : 1;
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      const a = -w * w * (this.x - target) - 2 * this.damping * w * this.v;
      this.v += a * h;
      this.x += this.v * h;
    }
    return this.x;
  }
  set(x: number) {
    this.x = x;
    this.v = 0;
  }
}

/** 2D spring that also reports acceleration (used to drive fur inertia). */
export class Spring2 {
  x: number;
  y: number;
  vx = 0;
  vy = 0;
  ax = 0;
  ay = 0;
  constructor(x = 0, y = 0, public freq = 3, public damping = 0.85) {
    this.x = x;
    this.y = y;
  }
  step(tx: number, ty: number, dt: number) {
    const w = this.freq * Math.PI * 2;
    const steps = dt > 1 / 120 ? Math.ceil(dt / (1 / 120)) : 1;
    const h = dt / steps;
    const vx0 = this.vx;
    const vy0 = this.vy;
    for (let i = 0; i < steps; i++) {
      const ax = -w * w * (this.x - tx) - 2 * this.damping * w * this.vx;
      const ay = -w * w * (this.y - ty) - 2 * this.damping * w * this.vy;
      this.vx += ax * h;
      this.vy += ay * h;
      this.x += this.vx * h;
      this.y += this.vy * h;
    }
    if (dt > 0) {
      this.ax = (this.vx - vx0) / dt;
      this.ay = (this.vy - vy0) / dt;
    }
  }
  set(x: number, y: number) {
    this.x = x;
    this.y = y;
    this.vx = this.vy = this.ax = this.ay = 0;
  }
}

// Cheap 1D value noise for organic CPU-side motion.
const PERM = new Float32Array(256);
{
  let s = 1337;
  for (let i = 0; i < 256; i++) {
    s = (s * 16807) % 2147483647;
    PERM[i] = (s / 2147483647) * 2 - 1;
  }
}
export const noise1 = (x: number) => {
  const i = Math.floor(x);
  const f = x - i;
  const a = PERM[i & 255];
  const b = PERM[(i + 1) & 255];
  const u = f * f * (3 - 2 * f);
  return a + (b - a) * u;
};

/** Deterministic PRNG (mulberry32). */
export const rng = (seed: number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
