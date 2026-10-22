// Tracks a bus's progress through the ordered stops of one direction and
// emits stop events. Pure logic (no rendering) so it can be unit-tested.
export const STOP_EVENTS = ['approach', 'arrived', 'served', 'departed', 'passed', 'terminal'];

export class StopManager {
  /**
   * @param {object} dir   direction object from Route280.direction()
   * @param {object} opts  tuning
   */
  constructor(dir, opts = {}) {
    this.dir = dir;
    this.opts = {
      arriveWindow: 14, // |frontS - stop.frontS| (m) counted as "at the stop"
      departDistance: 12, // m travelled past the stop target to count as departed
      passDistance: 22, // m past an unserved stop => passed/skipped
      stoppedSpeed: 0.35, // m/s
      approachDistance: 160,
      ...opts,
    };
    this.listeners = [];
    this.reset(0);
  }

  on(fn) {
    this.listeners.push(fn);
    return () => (this.listeners = this.listeners.filter((f) => f !== fn));
  }

  emit(type, index, extra = {}) {
    const ev = { type, index, stop: this.dir.stops[index], ...extra };
    this.log.push(ev);
    for (const fn of this.listeners) fn(ev);
  }

  reset(startIndex = 0) {
    this.next = startIndex; // index of the next stop to serve
    this.atStop = -1;
    this.served = new Set();
    this.approached = new Set();
    this.finished = false;
    this.log = [];
    this.dwell = 0;
  }

  get nextStop() {
    return this.dir.stops[this.next] || null;
  }

  distanceToNext(frontS) {
    const st = this.nextStop;
    return st ? st.frontS - frontS : Infinity;
  }

  /**
   * @param {object} st {frontS, speed, doorsOpen, dt}
   */
  update({ frontS, speed, doorsOpen, dt = 0 }) {
    if (this.finished) return;
    const stops = this.dir.stops;
    const o = this.opts;
    const st = stops[this.next];
    if (!st) return;
    const d = st.frontS - frontS;

    if (!this.approached.has(this.next) && d < o.approachDistance && d > -o.arriveWindow) {
      this.approached.add(this.next);
      this.emit('approach', this.next, { distance: d });
    }

    const inWindow = Math.abs(d) <= o.arriveWindow;
    const stopped = Math.abs(speed) < o.stoppedSpeed;
    if (inWindow && stopped && this.atStop !== this.next) {
      this.atStop = this.next;
      this.dwell = 0;
      this.emit('arrived', this.next, { error: -d });
    }
    if (this.atStop === this.next) {
      this.dwell += dt;
      if (doorsOpen && !this.served.has(this.next)) {
        this.served.add(this.next);
        this.emit('served', this.next);
        if (st.isLast) {
          this.finished = true;
          this.emit('terminal', this.next);
          return;
        }
      }
      if (!inWindow || (-d > o.departDistance)) {
        // left the stop area
        const idx = this.next;
        this.atStop = -1;
        if (this.served.has(idx)) {
          this.next++;
          this.emit('departed', idx);
        } else if (-d > o.passDistance || -d > o.departDistance) {
          this.next++;
          this.emit('passed', idx);
        }
        return;
      }
    }
    if (this.atStop !== this.next && -d > o.passDistance) {
      const idx = this.next;
      this.next++;
      if (this.served.has(idx)) this.emit('departed', idx);
      else this.emit('passed', idx);
      if (stops[idx].isLast) {
        this.finished = true;
        this.emit('terminal', idx, { overshot: true });
      }
    }
  }
}
