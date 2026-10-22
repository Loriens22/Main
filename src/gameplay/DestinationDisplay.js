// Destination sign logic: the LED signs show "280 <headsign>" for the
// current direction and switch automatically at the terminal.
export class DestinationDisplay {
  constructor(route, dirId) {
    this.route = route;
    this.setDirection(dirId);
    this.mode = 'route'; // 'route' | 'depot' | 'off'
  }

  setDirection(dirId) {
    this.dirId = dirId;
    this.version = (this.version || 0) + 1;
  }

  /** Called on a StopManager 'terminal' event: the sign changes to the return trip. */
  onTerminal() {
    this.setDirection(this.route.other(this.dirId));
  }

  get headsign() {
    return this.route.direction(this.dirId).headsign;
  }

  get frontText() {
    if (this.mode === 'off') return { number: '', text: '' };
    if (this.mode === 'depot') return { number: '', text: 'Не обслужва пътници' };
    return { number: this.route.line, text: this.headsign };
  }
}
