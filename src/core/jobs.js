// Cooperative, time-sliced job scheduler.
//
// Generation work (SDF sampling, mesh extraction, geometry merging, texture
// baking...) is written as JavaScript generator functions. The scheduler
// resumes each active generator for a small slice of every frame (a few ms)
// so the render loop keeps running at interactive frame rates while a
// request is being generated: the player can keep walking around.
//
// Protocol for generator code:
//   if (ctx.shouldYield()) yield;      // give the frame back when the slice is used up
//   const v = yield somePromise;       // wait for async work (e.g. image decode)
//   ctx.progress(0.5, 'Baking textures');
//   yield* subGenerator(ctx);          // compose
//
// Cancellation calls generator.return(), which runs `finally` blocks, then
// disposes every GPU resource registered with ctx.track().

let JOB_ID = 1;

export class Job {
  constructor(factory, opts = {}) {
    this.id = JOB_ID++;
    this.factory = factory;
    this.title = opts.title || 'Job';
    this.stages = opts.stages || [{ name: 'Working', weight: 1 }];
    this.estimateSec = opts.estimateSec || 5;
    this.deadlineSec = opts.deadlineSec || 300;
    this.status = 'queued';
    this.progressValue = 0;
    this.statusText = 'Queued';
    this.stageIndex = 0;
    this.stageFrac = 0;
    this.result = null;
    this.error = null;
    this.startTime = 0;
    this.endTime = 0;
    this.cancelled = false;
    this.waiting = false;
    this.resumeValue = undefined;
    this.pendingThrow = null;
    this.gen = null;
    this.tracked = new Set();
    this.cleanups = [];
    this.meta = opts.meta || {};
    this._etaSmoothed = this.estimateSec;
    this._lastEtaUpdate = 0;
    this.promise = new Promise((res) => { this._resolve = res; });
    const totalW = this.stages.reduce((s, x) => s + x.weight, 0) || 1;
    let acc = 0;
    this._stageStart = this.stages.map((s) => { const v = acc / totalW; acc += s.weight; return v; });
    this._stageW = this.stages.map((s) => s.weight / totalW);
    this.ctx = this._makeCtx();
  }

  _makeCtx() {
    const job = this;
    return {
      job,
      sliceEnd: 0,
      detail: 1, // 0.25..1, reduced automatically if we risk overrunning the deadline
      get cancelled() { return job.cancelled; },
      shouldYield() { return performance.now() > this.sliceEnd; },
      elapsed() { return (performance.now() - job.startTime) / 1000; },
      timeLeft() { return job.deadlineSec - this.elapsed(); },
      // True when we must wrap up immediately with whatever we have.
      mustFinish() { return this.elapsed() > job.deadlineSec * 0.92; },
      stage(nameOrIndex, text) {
        let idx = typeof nameOrIndex === 'number' ? nameOrIndex : job.stages.findIndex((s) => s.name === nameOrIndex);
        if (idx < 0) idx = Math.min(job.stageIndex + 1, job.stages.length - 1);
        job.stageIndex = idx; job.stageFrac = 0;
        job.statusText = text || job.stages[idx].label || job.stages[idx].name;
        job._updateProgress();
      },
      progress(frac, text) {
        job.stageFrac = Math.min(1, Math.max(job.stageFrac, frac));
        if (text) job.statusText = text;
        job._updateProgress();
      },
      track(obj) { if (obj) job.tracked.add(obj); return obj; },
      untrack(obj) { job.tracked.delete(obj); return obj; },
      onCleanup(fn) { job.cleanups.push(fn); },
    };
  }

  _updateProgress() {
    const i = this.stageIndex;
    this.progressValue = Math.min(0.999, this._stageStart[i] + this._stageW[i] * this.stageFrac);
  }

  // Estimated seconds remaining; blends the up-front estimate with observed throughput.
  eta() {
    if (this.status !== 'running') return this.status === 'queued' ? this.estimateSec : 0;
    const now = performance.now();
    const el = (now - this.startTime) / 1000;
    const p = this.progressValue;
    let raw;
    if (p < 0.04) raw = Math.max(this.estimateSec - el, 1);
    else {
      const observed = el / p * (1 - p);
      const w = Math.min(1, p * 2.5);
      raw = (this.estimateSec - el) * (1 - w) + observed * w;
    }
    raw = Math.max(0.2, Math.min(raw, this.deadlineSec - el));
    // Smooth so the countdown ticks down steadily instead of jumping around.
    const dt = this._lastEtaUpdate ? (now - this._lastEtaUpdate) / 1000 : 0;
    this._lastEtaUpdate = now;
    const predicted = this._etaSmoothed - dt;
    this._etaSmoothed = predicted + (raw - predicted) * Math.min(1, dt * 1.5);
    return Math.max(0, this._etaSmoothed);
  }

  cancel() {
    if (this.status === 'done' || this.status === 'failed' || this.status === 'cancelled') return;
    this.cancelled = true;
  }

  _disposeTracked() {
    for (const o of this.tracked) {
      try {
        if (o.dispose) o.dispose();
        else if (o.isObject3D) disposeObject(o);
      } catch (e) { /* ignore */ }
    }
    this.tracked.clear();
  }

  _finish(status, result, error) {
    this.status = status;
    this.result = result;
    this.error = error;
    this.endTime = performance.now();
    if (status === 'done') this.progressValue = 1;
    if (status !== 'done') this._disposeTracked();
    for (const fn of this.cleanups) { try { fn(status); } catch (e) { /* ignore */ } }
    this._resolve({ status, result, error });
  }
}

export function disposeObject(root) {
  root.traverse((o) => {
    if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) {
      if (m && !m.userData.shared && m.dispose) m.dispose();
    }
  });
}

export class JobScheduler {
  constructor() {
    this.jobs = [];
    this.maxConcurrent = 2;
    this.listeners = new Set();
  }

  add(job) {
    this.jobs.push(job);
    this._emit('add', job);
    return job;
  }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  _emit(type, job) { for (const fn of this.listeners) fn(type, job); }

  get active() { return this.jobs.filter((j) => j.status === 'running' || j.status === 'queued'); }

  tick(budgetMs) {
    const now = performance.now();
    // Start queued jobs up to the concurrency limit.
    let running = this.jobs.filter((j) => j.status === 'running').length;
    for (const j of this.jobs) {
      if (running >= this.maxConcurrent) break;
      if (j.status === 'queued' && !j.cancelled) {
        j.status = 'running';
        j.startTime = performance.now();
        j.statusText = j.stages[0].label || j.stages[0].name;
        try { j.gen = j.factory(j.ctx); } catch (e) { j._finish('failed', null, e); this._emit('end', j); continue; }
        running++;
        this._emit('start', j);
      }
    }
    // Handle cancellations.
    for (const j of this.jobs) {
      if (j.cancelled && (j.status === 'running' || j.status === 'queued')) {
        if (j.gen) { try { j.gen.return(); } catch (e) { /* ignore */ } }
        j._finish('cancelled', null, null);
        this._emit('end', j);
      }
    }
    const runnable = this.jobs.filter((j) => j.status === 'running' && !j.waiting);
    if (runnable.length) {
      const end = now + budgetMs;
      const per = budgetMs / runnable.length;
      for (const j of runnable) {
        const sliceEnd = Math.min(end, performance.now() + per);
        j.ctx.sliceEnd = sliceEnd;
        // Automatic detail reduction when the job risks running past its deadline.
        const el = (performance.now() - j.startTime) / 1000;
        if (el > j.deadlineSec * 0.6) j.ctx.detail = Math.max(0.25, 1 - (el / j.deadlineSec - 0.6) * 2);
        let guard = 0;
        while (performance.now() < sliceEnd && j.status === 'running' && !j.waiting && guard++ < 100000) {
          let step;
          try {
            if (j.pendingThrow) { const e = j.pendingThrow; j.pendingThrow = null; step = j.gen.throw(e); }
            else { const v = j.resumeValue; j.resumeValue = undefined; step = j.gen.next(v); }
          } catch (e) {
            console.error('[job failed]', j.title, e);
            j._finish('failed', null, e);
            this._emit('end', j);
            break;
          }
          if (step.done) {
            j._finish('done', step.value, null);
            this._emit('end', j);
            break;
          }
          const v = step.value;
          if (v && typeof v.then === 'function') {
            j.waiting = true;
            v.then((res) => { j.waiting = false; j.resumeValue = res; },
              (err) => { j.waiting = false; j.pendingThrow = err; });
          }
        }
      }
    }
    // Drop finished jobs after a short grace period (UI reads them for fade-out).
    this.jobs = this.jobs.filter((j) => !(j.endTime && performance.now() - j.endTime > 4000));
  }
}
