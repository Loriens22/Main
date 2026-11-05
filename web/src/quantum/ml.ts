// Quantum + classical learning models that run in the browser (mirrors backend/aurora/experiments/qml.py).

import { DensityMatrix } from './density';
import { Rng } from './rng';
import { StateVector } from './statevector';
import { matrix1 } from './gates';

export interface Dataset { Xtr: number[][]; ytr: number[]; Xte: number[][]; yte: number[]; name: string }

/** Two moons / concentric circles, scaled to [-1, 1]^2, 70/30 split (seeded). */
export function makeDataset(name: 'moons' | 'circles', seed: number, n = 200): Dataset {
  const rng = new Rng(seed);
  const X: number[][] = [], y: number[] = [];
  for (let i = 0; i < n; i++) {
    const cls = i < n / 2 ? 0 : 1;
    if (name === 'moons') {
      const t = Math.PI * rng.random();
      const x = cls === 0 ? [Math.cos(t), Math.sin(t)] : [1 - Math.cos(t), 0.5 - Math.sin(t)];
      X.push([x[0] + 0.15 * rng.normal(), x[1] + 0.15 * rng.normal()]);
    } else {
      const t = 2 * Math.PI * rng.random();
      const r = cls === 0 ? 1 : 0.45;
      X.push([r * Math.cos(t) + 0.08 * rng.normal(), r * Math.sin(t) + 0.08 * rng.normal()]);
    }
    y.push(cls);
  }
  for (let d = 0; d < 2; d++) {
    const mn = Math.min(...X.map((x) => x[d])), mx = Math.max(...X.map((x) => x[d]));
    X.forEach((x) => (x[d] = -1 + (2 * (x[d] - mn)) / (mx - mn)));
  }
  const idx = X.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) { const j = rng.int(i + 1); [idx[i], idx[j]] = [idx[j], idx[i]]; }
  const cut = Math.round(0.7 * n);
  const pick = (a: number[]) => ({ X: a.map((i) => X[i]), y: a.map((i) => y[i]) });
  const tr = pick(idx.slice(0, cut)), te = pick(idx.slice(cut));
  return { Xtr: tr.X, ytr: tr.y, Xte: te.X, yte: te.y, name };
}

// ------------------------------------------------------------------- VQC (2 qubits)
export function vqcProb(x: number[], th: Float64Array | number[], layers: number): number {
  const sv = new StateVector(2);
  for (let l = 0; l < layers; l++) {
    for (let q = 0; q < 2; q++) {
      sv.apply1(q, matrix1('ry', [Math.PI * x[q % 2]]));
      sv.apply1(q, matrix1('rz', [Math.PI * x[(q + 1) % 2]]));
      sv.apply1(q, matrix1('ry', [th[(l * 2 + q) * 2]]));
      sv.apply1(q, matrix1('rz', [th[(l * 2 + q) * 2 + 1]]));
    }
    sv.applyOp({ name: 'cz', qubits: [0, 1] });
  }
  // parity readout: P(class 1) = (1 - <Z0 Z1>) / 2
  const p = sv.probabilities();
  const zz = p[0] - p[1] - p[2] + p[3];
  return (1 - zz) / 2;
}

export function vqcProbNoisy(x: number[], th: number[], layers: number, p1: number, p2: number): number {
  const dm = new DensityMatrix(2);
  for (let l = 0; l < layers; l++) {
    for (let q = 0; q < 2; q++) {
      const ops: [string, number][] = [['ry', Math.PI * x[q % 2]], ['rz', Math.PI * x[(q + 1) % 2]], ['ry', th[(l * 2 + q) * 2]], ['rz', th[(l * 2 + q) * 2 + 1]]];
      for (const [g, a] of ops) {
        dm.applyOp({ name: g as 'ry', qubits: [q], params: [a] });
        dm.depolarize([q], p1);
      }
    }
    dm.applyOp({ name: 'cz', qubits: [0, 1] });
    dm.depolarize([0, 1], p2);
  }
  const p = dm.probabilities();
  return (1 - (p[0] - p[1] - p[2] + p[3])) / 2;
}

export interface TrainLog { epoch: number; loss: number; trainAcc: number; testAcc: number; evals: number; ms: number }

export function* trainVQC(ds: Dataset, layers: number, epochs: number, lr: number, seed: number, batch = 16): Generator<TrainLog, number[], void> {
  const rng = new Rng(seed);
  const P = layers * 4;
  const th = Array.from({ length: P }, () => 0.5 * rng.normal());
  const m = new Array(P).fill(0), v = new Array(P).fill(0);
  let step = 0, evals = 0;
  const t0 = performance.now();
  for (let ep = 1; ep <= epochs; ep++) {
    const order = ds.Xtr.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) { const j = rng.int(i + 1); [order[i], order[j]] = [order[j], order[i]]; }
    for (let s = 0; s < order.length; s += batch) {
      const g = new Array(P).fill(0);
      const idx = order.slice(s, s + batch);
      for (const i of idx) {
        let p = vqcProb(ds.Xtr[i], th, layers); evals++;
        p = Math.min(Math.max(p, 1e-6), 1 - 1e-6);
        const dl = (p - ds.ytr[i]) / (p * (1 - p));
        for (let k = 0; k < P; k++) {
          // exact parameter-shift rule for rotation gates
          th[k] += Math.PI / 2; const pp = vqcProb(ds.Xtr[i], th, layers);
          th[k] -= Math.PI; const pm = vqcProb(ds.Xtr[i], th, layers);
          th[k] += Math.PI / 2; evals += 2;
          g[k] += dl * 0.5 * (pp - pm);
        }
      }
      step++;
      for (let k = 0; k < P; k++) {
        const gk = g[k] / idx.length;
        m[k] = 0.9 * m[k] + 0.1 * gk;
        v[k] = 0.999 * v[k] + 0.001 * gk * gk;
        th[k] -= (lr * (m[k] / (1 - 0.9 ** step))) / (Math.sqrt(v[k] / (1 - 0.999 ** step)) + 1e-8);
      }
    }
    let loss = 0, acc = 0;
    ds.Xtr.forEach((x, i) => {
      const p = Math.min(Math.max(vqcProb(x, th, layers), 1e-6), 1 - 1e-6);
      loss -= ds.ytr[i] * Math.log(p) + (1 - ds.ytr[i]) * Math.log(1 - p);
      acc += +(p > 0.5) === ds.ytr[i] ? 1 : 0;
    });
    const testAcc = ds.Xte.reduce((a, x, i) => a + (+(vqcProb(x, th, layers) > 0.5) === ds.yte[i] ? 1 : 0), 0) / ds.Xte.length;
    yield { epoch: ep, loss: loss / ds.Xtr.length, trainAcc: acc / ds.Xtr.length, testAcc, evals, ms: performance.now() - t0 };
  }
  return th;
}

// ------------------------------------------------------------- classical baselines
export function logisticRegression(ds: Dataset, epochs = 400, lr = 0.5) {
  const t0 = performance.now();
  let w0 = 0, w1 = 0, b = 0;
  for (let e = 0; e < epochs; e++) {
    let g0 = 0, g1 = 0, gb = 0;
    ds.Xtr.forEach((x, i) => {
      const p = 1 / (1 + Math.exp(-(w0 * x[0] + w1 * x[1] + b)));
      g0 += (p - ds.ytr[i]) * x[0]; g1 += (p - ds.ytr[i]) * x[1]; gb += p - ds.ytr[i];
    });
    const n = ds.Xtr.length;
    w0 -= (lr * g0) / n; w1 -= (lr * g1) / n; b -= (lr * gb) / n;
  }
  const ms = performance.now() - t0;
  const predict = (x: number[]) => 1 / (1 + Math.exp(-(w0 * x[0] + w1 * x[1] + b)));
  return { predict, ms, params: 3 };
}

export function mlp(ds: Dataset, hidden = 16, epochs = 600, lr = 0.02, seed = 0) {
  const rng = new Rng(seed + 99);
  const t0 = performance.now();
  const W1 = Array.from({ length: hidden }, () => [rng.normal() * 0.8, rng.normal() * 0.8]);
  const b1 = new Array(hidden).fill(0);
  const W2 = Array.from({ length: hidden }, () => rng.normal() * 0.3);
  let b2 = 0;
  const params = [W1, b1, W2];
  const mom = { W1: W1.map(() => [0, 0]), vW1: W1.map(() => [0, 0]), b1: new Array(hidden).fill(0), vb1: new Array(hidden).fill(0), W2: new Array(hidden).fill(0), vW2: new Array(hidden).fill(0), b2: 0, vb2: 0 };
  let t = 0;
  const fwd = (x: number[]) => {
    const h = W1.map((w, j) => Math.tanh(w[0] * x[0] + w[1] * x[1] + b1[j]));
    const z = h.reduce((a, hj, j) => a + hj * W2[j], b2);
    return { h, p: 1 / (1 + Math.exp(-z)) };
  };
  const adam = (m: number, v: number, g: number) => {
    const m2 = 0.9 * m + 0.1 * g, v2 = 0.999 * v + 0.001 * g * g;
    return [m2, v2, (lr * (m2 / (1 - 0.9 ** t))) / (Math.sqrt(v2 / (1 - 0.999 ** t)) + 1e-8)];
  };
  for (let e = 0; e < epochs; e++) {
    const gW1 = W1.map(() => [0, 0]), gb1 = new Array(hidden).fill(0), gW2 = new Array(hidden).fill(0);
    let gb2 = 0;
    ds.Xtr.forEach((x, i) => {
      const { h, p } = fwd(x);
      const d = p - ds.ytr[i];
      gb2 += d;
      h.forEach((hj, j) => {
        gW2[j] += d * hj;
        const dh = d * W2[j] * (1 - hj * hj);
        gW1[j][0] += dh * x[0]; gW1[j][1] += dh * x[1]; gb1[j] += dh;
      });
    });
    const n = ds.Xtr.length;
    t++;
    for (let j = 0; j < hidden; j++) {
      for (let k = 0; k < 2; k++) { const [m, v, s] = adam(mom.W1[j][k], mom.vW1[j][k], gW1[j][k] / n); mom.W1[j][k] = m; mom.vW1[j][k] = v; W1[j][k] -= s; }
      { const [m, v, s] = adam(mom.b1[j], mom.vb1[j], gb1[j] / n); mom.b1[j] = m; mom.vb1[j] = v; b1[j] -= s; }
      { const [m, v, s] = adam(mom.W2[j], mom.vW2[j], gW2[j] / n); mom.W2[j] = m; mom.vW2[j] = v; W2[j] -= s; }
    }
    const [m, v, s] = adam(mom.b2, mom.vb2, gb2 / n); mom.b2 = m; mom.vb2 = v; b2 -= s;
  }
  void params;
  return { predict: (x: number[]) => fwd(x).p, ms: performance.now() - t0, params: hidden * 4 + 1 };
}

export function accuracy(predict: (x: number[]) => number, X: number[][], y: number[]) {
  return X.reduce((a, x, i) => a + (+(predict(x) > 0.5) === y[i] ? 1 : 0), 0) / X.length;
}
