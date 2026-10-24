// Automatic passenger information announcements, driven by stop events.
//   after departing a stop  -> chime + "Следваща спирка <next>."
//   approaching a stop      -> chime + "Спирка <stop>."
// Pure logic: produces a queue of messages consumed by an audio adapter.

export const DEFAULT_ANNOUNCE = {
  approachBase: 55, // m — arrival trigger = base + speed * lead
  approachLead: 6.5, // s
  approachMax: 220,
  minGapAfterNext: 25, // m — if the bus is this close, a pending "next" is dropped
  terminalSuffix: 'Последна спирка.',
  enableTerminalSuffix: true,
  requestSuffix: 'Спирка по желание.', // the bus stops only on request (STOP button) or for waiting passengers
};

export class AnnouncementManager {
  constructor(dir, opts = {}) {
    this.dir = dir;
    this.opts = { ...DEFAULT_ANNOUNCE, ...opts };
    this.queue = [];
    this.playing = null;
    this.history = [];
    this.nextAnnounced = new Set();
    this.arrivalAnnounced = new Set();
  }

  setDirection(dir) {
    this.dir = dir;
    this.queue = [];
    this.nextAnnounced.clear();
    this.arrivalAnnounced.clear();
  }

  triggerDistance(speed) {
    const o = this.opts;
    return Math.min(o.approachMax, o.approachBase + Math.max(0, speed) * o.approachLead);
  }

  textNext(stop) {
    const t = `Следваща спирка ${stop.speech || stop.name}.`;
    return stop.request ? `${t} ${this.opts.requestSuffix}` : t;
  }

  textArrival(stop) {
    let t = `Спирка ${stop.speech || stop.name}.`;
    if (stop.isLast && this.opts.enableTerminalSuffix) t += ` ${this.opts.terminalSuffix}`;
    return t;
  }

  enqueue(kind, stopIndex) {
    const stop = this.dir.stops[stopIndex];
    if (!stop) return;
    // drop superseded "next" messages for earlier stops
    this.queue = this.queue.filter((m) => m.stopIndex >= stopIndex);
    if (kind === 'arrival') {
      // arrival supersedes a not-yet-played "next" for the same stop
      this.queue = this.queue.filter((m) => !(m.kind === 'next' && m.stopIndex === stopIndex));
    }
    const msg = {
      kind,
      stopIndex,
      code: stop.code,
      text: kind === 'next' ? this.textNext(stop) : this.textArrival(stop),
      display: stop.name,
    };
    this.queue.push(msg);
  }

  /** Handle StopManager events. */
  onStopEvent(ev) {
    const stops = this.dir.stops;
    if (ev.type === 'departed' || ev.type === 'passed') {
      const n = ev.index + 1;
      if (n < stops.length && !this.nextAnnounced.has(n)) {
        this.nextAnnounced.add(n);
        this.enqueue('next', n);
      }
    }
  }

  /**
   * Per-frame update.
   * @param {object} ctx {nextIndex, distanceToNext, speed, doorsOpen}
   */
  update(ctx) {
    const { nextIndex, distanceToNext, speed, doorsOpen } = ctx;
    if (nextIndex == null || nextIndex >= this.dir.stops.length) return;
    // the first stop of a trip is where the bus starts: nothing to announce for it
    if (nextIndex === 0) return;
    if (!doorsOpen && !this.arrivalAnnounced.has(nextIndex) && distanceToNext <= this.triggerDistance(speed) && distanceToNext > -10) {
      this.arrivalAnnounced.add(nextIndex);
      this.nextAnnounced.add(nextIndex);
      if (distanceToNext < this.opts.minGapAfterNext) {
        this.queue = this.queue.filter((m) => !(m.kind === 'next' && m.stopIndex === nextIndex));
      }
      this.enqueue('arrival', nextIndex);
    }
  }

  /** Called by the adapter when idle: returns the next message (or null). */
  pump() {
    if (this.playing || !this.queue.length) return null;
    this.playing = this.queue.shift();
    this.history.push(this.playing);
    return this.playing;
  }

  ended() {
    this.playing = null;
  }

  /** Trip start at a terminal: the bus departs stop 0, the next-stop message follows departure. */
  startTrip() {
    this.queue = [];
    this.playing = null;
    this.nextAnnounced.clear();
    this.arrivalAnnounced.clear();
  }
}
