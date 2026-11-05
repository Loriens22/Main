// Off-main-thread execution for every heavy computation on the site.
import { run } from '../quantum/engine';
import { accuracy, logisticRegression, makeDataset, mlp, trainVQC, vqcProb, vqcProbNoisy } from '../quantum/ml';
import { Rng } from '../quantum/rng';
import { annealing, ansatzHEA, ansatzPC, cutValues, energyHEANoisy, energySV, greedyLocal, nelderMead, qaoaExpect, qaoaState, random3Regular, type PauliTerm } from '../quantum/variational';

type Msg = { id: number; task: string; args: any };
const post = (id: number, type: string, payload: any) => (self as any).postMessage({ id, type, payload });

self.onmessage = (e: MessageEvent<Msg>) => {
  const { id, task, args } = e.data;
  try {
    if (task === 'run') {
      post(id, 'done', run(args.circuit, args.opts));
    } else if (task === 'vqc') {
      const ds = makeDataset(args.dataset, args.seed);
      const gen = trainVQC(ds, args.layers, args.epochs, args.lr, args.seed);
      let r = gen.next();
      while (!r.done) { post(id, 'progress', r.value); r = gen.next(); }
      const th = r.value;
      const grid: number[][] = [];
      for (let j = 0; j < 31; j++) { const row: number[] = []; for (let i = 0; i < 31; i++) row.push(vqcProb([-1 + i / 15, 1 - j / 15], th, args.layers)); grid.push(row); }
      const lr = logisticRegression(ds), nn = mlp(ds, 16, 600, 0.02, args.seed);
      const noise = [0, 0.01, 0.03, 0.1, 0.2, 0.3].map((p2) => {
        const probs = ds.Xte.map((x) => vqcProbNoisy(x, th, args.layers, p2 / 10, p2));
        return { p2, acc: probs.reduce((a, p, i) => a + (+(p > 0.5) === ds.yte[i] ? 1 : 0), 0) / probs.length, margin: probs.reduce((a, p) => a + Math.abs(p - 0.5), 0) / probs.length };
      });
      post(id, 'done', { theta: th, grid, data: ds, baselines: [
        { name: 'Logistic regression', acc: accuracy(lr.predict, ds.Xte, ds.yte), ms: lr.ms, params: lr.params },
        { name: 'MLP (16 tanh units)', acc: accuracy(nn.predict, ds.Xte, ds.yte), ms: nn.ms, params: nn.params },
      ], noise });
    } else if (task === 'qaoa') {
      const g = random3Regular(args.n, args.seed);
      const cuts = cutValues(g);
      let cmax = 0; for (const c of cuts) cmax = Math.max(cmax, c);
      const rng = new Rng(args.seed);
      const t0 = performance.now();
      let best = { x: [] as number[], fx: Infinity };
      const trace: number[] = [];
      for (let r = 0; r < args.restarts; r++) {
        const x0 = [...Array.from({ length: args.p }, () => rng.random() * Math.PI), ...Array.from({ length: args.p }, () => rng.random() * Math.PI / 2)];
        const res = nelderMead((x) => -qaoaExpect(g, cuts, x, args.p), x0, { iters: 250, onIter: (_x, fx, k) => { if (k % 5 === 0) trace.push(-fx / cmax); } });
        if (res.fx < best.fx) best = res;
      }
      const tq = performance.now() - t0;
      const probs = qaoaState(g, cuts, best.x, args.p).probabilities();
      let pOpt = 0, bestIdx = 0, bestP = 0;
      probs.forEach((p, i) => { if (cuts[i] === cmax) pOpt += p; if (p > bestP && cuts[i] === cmax) { bestP = p; bestIdx = i; } });
      const t1 = performance.now(); const gl = Array.from({ length: 20 }, () => greedyLocal(g, rng)); const tg = performance.now() - t1;
      const t2 = performance.now(); const sa = Array.from({ length: 5 }, () => annealing(g, rng)); const ts = performance.now() - t2;
      post(id, 'done', { graph: g, cmax, ratio: -best.fx / cmax, pOpt, params: best.x, bestIdx, tq, trace,
        greedy: { mean: gl.reduce((a, b) => a + b, 0) / gl.length / cmax, ms: tg }, annealing: { mean: sa.reduce((a, b) => a + b, 0) / sa.length / cmax, ms: ts },
        random: g.edges.length / 2 / cmax });
    } else if (task === 'vqe') {
      const H: PauliTerm[] = args.terms;
      const trace: { k: number; E: number }[] = [];
      const t0 = performance.now();
      let res;
      if (args.ansatz === 'pc') {
        res = nelderMead((x) => energySV(ansatzPC(x[0]), H), [0.1], { iters: 200, step: 0.5, onIter: (_x, fx, k) => trace.push({ k, E: fx }) });
      } else {
        const rng = new Rng(args.seed ?? 3);
        let best = { x: [] as number[], fx: Infinity };
        for (let r = 0; r < 3; r++) {
          const x0 = Array.from({ length: 12 }, () => (rng.random() - 0.5) * 2 * Math.PI);
          const f = (x: number[]) => (args.p2 > 0 ? energyHEANoisy(x, H, args.p2 / 10, args.p2) : energySV(ansatzHEA(x), H));
          const rr = nelderMead(f, x0, { iters: args.p2 > 0 ? 500 : 1500, step: 0.6, onIter: (_x, fx, k) => { if (r === 0 || fx < best.fx) trace.push({ k: k + r * 2000, E: fx }); } });
          if (rr.fx < best.fx) best = rr;
        }
        res = best;
      }
      post(id, 'done', { E: res.fx, x: res.x, trace, ms: performance.now() - t0 });
    } else throw new Error(`unknown task ${task}`);
  } catch (err) {
    post(id, 'error', String((err as Error)?.message ?? err));
  }
};
