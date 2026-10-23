// Pneumatic passenger doors with the closing warning of the vehicle type
// (MAN Lion's City G: two beeps; other buses: see doorWarning in their spec):
//   close request -> beep 1 .. beep n -> doors begin closing -> fully closed.
// Pure state machine (time-stepped); audio/animation subscribe to events.

export const DOOR_TIMING = {
  beep1At: 0.0, // s after the close request
  beep2At: 0.42,
  closeStartAt: 0.95, // closing motion starts only after the second beep
  closeDuration: 1.9,
  openDuration: 1.45,
  reopenRetry: 2.5, // s after an obstruction reopen before the next automatic attempt
  maxOpenSpeed: 0.5, // m/s — interlock: doors cannot open above this speed
};

/** Door timing for a vehicle's closing warning {beeps, ms, times?, closeStart?}. */
export function doorTiming(warn) {
  if (!warn) return DOOR_TIMING;
  const len = (warn.ms || 200) / 1000;
  const gap = Math.max(len + 0.14, 0.26);
  const beepTimes = warn.times || Array.from({ length: warn.beeps || 2 }, (_, i) => i * gap);
  const closeStartAt = warn.closeStart ?? beepTimes[beepTimes.length - 1] + len + 0.3;
  return { ...DOOR_TIMING, beepTimes, beep1At: beepTimes[0], beep2At: beepTimes[1] ?? beepTimes[0], closeStartAt };
}

export class Door {
  constructor(id, timing = DOOR_TIMING) {
    this.id = id;
    this.t = timing;
    this.state = 'closed';
    this.openness = 0; // 0 closed .. 1 fully open
    this.timer = 0;
    this.beeps = 0;
    this.obstructed = false;
    this.closeRequested = false;
    this.retryTimer = -1;
    this.listeners = [];
  }

  on(fn) {
    this.listeners.push(fn);
  }

  emit(type, extra = {}) {
    for (const fn of this.listeners) fn({ type, door: this.id, ...extra });
  }

  get isClosed() {
    return this.state === 'closed';
  }

  open() {
    if (this.state === 'open' || this.state === 'opening') return false;
    this.state = 'opening';
    this.closeRequested = false;
    this.retryTimer = -1;
    this.emit('opening');
    return true;
  }

  requestClose() {
    if (this.state === 'closed' || this.state === 'warning' || this.state === 'closing') return false;
    this.closeRequested = true;
    if (this.state === 'open') this.startWarning();
    return true;
  }

  startWarning() {
    this.state = 'warning';
    this.timer = 0;
    this.beeps = 0;
    this.emit('closeRequest');
  }

  update(dt) {
    const t = this.t;
    switch (this.state) {
      case 'opening':
        this.openness = Math.min(1, this.openness + dt / t.openDuration);
        if (this.openness >= 1) {
          this.state = 'open';
          this.emit('opened');
          // a pending close (pressed while opening) runs at once; after an
          // obstruction reopen it waits for the retry timer instead
          if (this.closeRequested && this.retryTimer < 0) this.startWarning();
        }
        break;
      case 'open':
        if (this.retryTimer >= 0) {
          this.retryTimer -= dt;
          if (this.retryTimer < 0 && this.closeRequested && !this.obstructed) this.startWarning();
        }
        break;
      case 'warning': {
        this.timer += dt;
        const bt = t.beepTimes || [t.beep1At, t.beep2At];
        while (this.beeps < bt.length && this.timer >= bt[this.beeps]) {
          this.beeps++;
          this.emit('beep', { n: this.beeps });
        }
        if (this.beeps >= bt.length && this.timer >= t.closeStartAt) {
          this.state = 'closing';
          this.emit('closingStart');
        }
        break;
      }
      case 'closing':
        if (this.obstructed) {
          // safety edge / light barrier: reverse immediately
          this.state = 'opening';
          this.retryTimer = t.reopenRetry;
          this.emit('obstruction');
          break;
        }
        this.openness = Math.max(0, this.openness - dt / t.closeDuration);
        if (this.openness <= 0) {
          this.state = 'closed';
          this.closeRequested = false;
          this.emit('closed');
        }
        break;
      default:
        break;
    }
  }
}

/** All doors of one bus + the interlock with the drivetrain. */
export class DoorSystem {
  constructor(ids = [1, 2, 3, 4], timing = DOOR_TIMING) {
    this.timing = timing;
    this.doors = ids.map((id) => new Door(id, timing));
    this.listeners = [];
    for (const d of this.doors) d.on((e) => this.listeners.forEach((fn) => fn(e)));
  }

  on(fn) {
    this.listeners.push(fn);
  }

  door(id) {
    return this.doors.find((d) => d.id === id);
  }

  get allClosed() {
    return this.doors.every((d) => d.isClosed);
  }

  get anyOpen() {
    return !this.allClosed;
  }

  /** Interlock: opening is refused while the bus moves. */
  open(ids = null, speed = 0) {
    if (Math.abs(speed) > this.timing.maxOpenSpeed) return false;
    let any = false;
    for (const d of this.doors) if (!ids || ids.includes(d.id)) any = d.open() || any;
    return any;
  }

  close(ids = null) {
    let any = false;
    for (const d of this.doors) if (!ids || ids.includes(d.id)) any = d.requestClose() || any;
    return any;
  }

  toggle(speed = 0) {
    if (this.doors.some((d) => d.state === 'open' || d.state === 'opening')) return this.close();
    return this.open(null, speed);
  }

  update(dt) {
    for (const d of this.doors) d.update(dt);
  }

  /** Throttle is cut and the bus-stop brake is held while any door is not closed. */
  get interlockActive() {
    return this.anyOpen;
  }
}
