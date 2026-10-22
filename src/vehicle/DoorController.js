// Pneumatic passenger doors of the MAN Lion's City G with the characteristic
// two-beep closing warning:
//   close request -> beep 1 -> beep 2 -> doors begin closing -> fully closed.
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
        const prev = this.timer;
        this.timer += dt;
        if (this.beeps === 0 && this.timer >= t.beep1At) {
          this.beeps = 1;
          this.emit('beep', { n: 1 });
        }
        if (this.beeps === 1 && prev < t.beep2At && this.timer >= t.beep2At) {
          this.beeps = 2;
          this.emit('beep', { n: 2 });
        }
        if (this.beeps === 2 && this.timer >= t.closeStartAt) {
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
