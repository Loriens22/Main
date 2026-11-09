/**
 * Fast deterministic 2D/3D simplex noise + fractal helpers (no dependencies).
 */
const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;

export class Noise {
  private perm = new Uint8Array(512);
  private grad = new Float32Array(512 * 2);

  constructor(seed = 1) {
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    let s = seed >>> 0 || 1;
    const rnd = () => {
      s ^= s << 13;
      s ^= s >>> 17;
      s ^= s << 5;
      return (s >>> 0) / 4294967296;
    };
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      const t = p[i];
      p[i] = p[j];
      p[j] = t;
    }
    for (let i = 0; i < 512; i++) {
      this.perm[i] = p[i & 255];
      const a = (this.perm[i] / 256) * Math.PI * 2;
      this.grad[i * 2] = Math.cos(a);
      this.grad[i * 2 + 1] = Math.sin(a);
    }
  }

  /** 2D simplex noise in [-1, 1]. */
  n2(x: number, y: number): number {
    const s = (x + y) * F2;
    const i = Math.floor(x + s);
    const j = Math.floor(y + s);
    const t = (i + j) * G2;
    const x0 = x - (i - t);
    const y0 = y - (j - t);
    const i1 = x0 > y0 ? 1 : 0;
    const j1 = 1 - i1;
    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2;
    const y2 = y0 - 1 + 2 * G2;
    const ii = i & 255;
    const jj = j & 255;
    const P = this.perm, G = this.grad;
    let n = 0;
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 > 0) {
      const g = P[ii + P[jj]] * 2;
      t0 *= t0;
      n += t0 * t0 * (G[g] * x0 + G[g + 1] * y0);
    }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 > 0) {
      const g = P[ii + i1 + P[jj + j1]] * 2;
      t1 *= t1;
      n += t1 * t1 * (G[g] * x1 + G[g + 1] * y1);
    }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 > 0) {
      const g = P[ii + 1 + P[jj + 1]] * 2;
      t2 *= t2;
      n += t2 * t2 * (G[g] * x2 + G[g + 1] * y2);
    }
    return 70 * n;
  }

  fbm(x: number, y: number, oct = 5, lac = 2.0, gain = 0.5): number {
    let a = 1, f = 1, s = 0, norm = 0;
    for (let i = 0; i < oct; i++) {
      s += a * this.n2(x * f, y * f);
      norm += a;
      a *= gain;
      f *= lac;
    }
    return s / norm;
  }

  ridged(x: number, y: number, oct = 5, lac = 2.0, gain = 0.5): number {
    let a = 1, f = 1, s = 0, norm = 0, w = 1;
    for (let i = 0; i < oct; i++) {
      let n = 1 - Math.abs(this.n2(x * f, y * f));
      n *= n;
      n *= w;
      w = Math.min(1, Math.max(0, n * 2));
      s += a * n;
      norm += a;
      a *= gain;
      f *= lac;
    }
    return s / norm;
  }

  /** domain-warped fbm */
  warped(x: number, y: number, warp = 0.5, oct = 5): number {
    const qx = this.fbm(x + 3.1, y + 7.7, 3);
    const qy = this.fbm(x - 5.2, y + 1.3, 3);
    return this.fbm(x + warp * qx, y + warp * qy, oct);
  }
}

export function smoothstep(a: number, b: number, x: number) {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export function clamp(x: number, a: number, b: number) {
  return x < a ? a : x > b ? b : x;
}

/** Seeded PRNG (mulberry32). */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
