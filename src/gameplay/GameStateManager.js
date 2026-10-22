// Top-level game state machine with validated transitions.
export const TRANSITIONS = {
  boot: ['menu'],
  menu: ['setup', 'loading', 'credits', 'settings'],
  credits: ['menu'],
  settings: ['menu', 'paused'],
  setup: ['menu', 'loading'],
  loading: ['playing', 'menu'],
  playing: ['paused', 'menu', 'tripComplete'],
  paused: ['playing', 'menu', 'settings'],
  tripComplete: ['playing', 'menu'],
};

export class GameStateManager {
  constructor() {
    this.state = 'boot';
    this.listeners = [];
    this.history = ['boot'];
  }

  can(to) {
    return (TRANSITIONS[this.state] || []).includes(to);
  }

  go(to, data) {
    if (!this.can(to)) throw new Error(`invalid transition ${this.state} -> ${to}`);
    const from = this.state;
    this.state = to;
    this.history.push(to);
    for (const fn of this.listeners) fn({ from, to, data });
    return true;
  }

  on(fn) {
    this.listeners.push(fn);
  }
}
