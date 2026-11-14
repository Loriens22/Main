/**
 * Minimal behaviour-tree runtime. Nodes are small stateful objects built per agent;
 * `sel` is reactive (re-evaluated from the top every tick, so higher-priority branches pre-empt running ones),
 * `seq` remembers its running child.
 */
export type Status = 'ok' | 'fail' | 'run';

export interface BT<C> {
  tick(c: C, dt: number): Status;
  reset(): void;
  /** label of the deepest running/last leaf, for debugging and status displays */
  label?: string;
}

export function cond<C>(f: (c: C) => boolean): BT<C> {
  return { tick: (c) => (f(c) ? 'ok' : 'fail'), reset() {} };
}

export function act<C>(f: (c: C, dt: number) => Status | void, onReset?: () => void): BT<C> {
  return { tick: (c, dt) => f(c, dt) ?? 'ok', reset() { onReset?.(); } };
}

/** Runs once on entry, then reports running until `done` returns true. */
export function task<C>(start: (c: C) => void, done: (c: C, dt: number) => boolean, end?: (c: C) => void): BT<C> {
  let started = false;
  return {
    tick(c, dt) {
      if (!started) { started = true; start(c); }
      if (done(c, dt)) { started = false; end?.(c); return 'ok'; }
      return 'run';
    },
    reset() { started = false; },
  };
}

export function wait<C>(seconds: number | ((c: C) => number)): BT<C> {
  let t = -1;
  return {
    tick(c, dt) {
      if (t < 0) t = typeof seconds === 'number' ? seconds : seconds(c);
      t -= dt;
      if (t <= 0) { t = -1; return 'ok'; }
      return 'run';
    },
    reset() { t = -1; },
  };
}

export function seq<C>(...kids: BT<C>[]): BT<C> {
  let i = 0;
  return {
    tick(c, dt) {
      while (i < kids.length) {
        const s = kids[i].tick(c, dt);
        if (s === 'run') return 'run';
        if (s === 'fail') { i = 0; for (const k of kids) k.reset(); return 'fail'; }
        i++;
      }
      i = 0;
      return 'ok';
    },
    reset() { i = 0; for (const k of kids) k.reset(); },
  };
}

export function sel<C>(...kids: BT<C>[]): BT<C> {
  let running = -1;
  return {
    tick(c, dt) {
      for (let i = 0; i < kids.length; i++) {
        const s = kids[i].tick(c, dt);
        if (s === 'fail') continue;
        if (running >= 0 && running !== i) kids[running].reset();
        running = s === 'run' ? i : -1;
        return s;
      }
      if (running >= 0) kids[running].reset();
      running = -1;
      return 'fail';
    },
    reset() { running = -1; for (const k of kids) k.reset(); },
  };
}

/** Repeat the child forever (always running). */
export function loop<C>(kid: BT<C>): BT<C> {
  return { tick(c, dt) { kid.tick(c, dt); return 'run'; }, reset() { kid.reset(); } };
}

/** Pick one child at random each time the previous one finishes, never the same twice in a row. */
export function shuffle<C>(...kids: BT<C>[]): BT<C> {
  let cur = -1, last = -1;
  return {
    tick(c, dt) {
      if (cur < 0) {
        do cur = Math.floor(Math.random() * kids.length); while (kids.length > 1 && cur === last);
      }
      const s = kids[cur].tick(c, dt);
      if (s !== 'run') { last = cur; cur = -1; }
      return s === 'fail' ? 'ok' : s;
    },
    reset() { if (cur >= 0) kids[cur].reset(); cur = -1; },
  };
}

/** Guard: run the child only while the condition holds; abort (and reset) it when the condition drops. */
export function when<C>(f: (c: C) => boolean, kid: BT<C>): BT<C> {
  return {
    tick(c, dt) {
      if (!f(c)) { kid.reset(); return 'fail'; }
      return kid.tick(c, dt);
    },
    reset() { kid.reset(); },
  };
}
