// Trams of another line on the tracks a line shares with it. On line 7 these are the trams of line 12 between
// пл. Македония and Триъгълника (Христо Ботев, Пиротска, Сливница, Клокотница, Централна гара, Пета градска
// болница): they run on line 12's own track lines with its own stops, destinations and vehicles (Schindler,
// T6M-700), enter the shared stretch, serve its stops and are taken off again where line 12 leaves it (the
// world of line 7 is not built further along line 12).
import { createVehicle } from './VehicleFactory.js';
import { AITramDriver } from './AITramDriver.js';
import { dispatchVehicle, fleetFor } from '../vehicle/Vehicles.js';

const LEAD_IN = 160, LEAD_OUT = 90; // metres of line 12 track before / after the shared stretch that are drawn

export class SharedTrams {
  /** game: the Game; route: the other line (Route280 object). */
  constructor(game, route) {
    this.game = game;
    this.route = route;
    this.trams = [];
    this.serial = 0;
    const own = ['A', 'B'].map((d) => game.route.direction(d).path);
    // the stretch of each direction of the other line that lies on this line's tracks (the longest run)
    this.ranges = {};
    for (const id of ['A', 'B']) {
      const P = route.direction(id).path;
      let best = null, cur = null;
      for (let s = 0; s <= P.length; s += 10) {
        const q = P.at(s);
        const on = own.some((O) => O.nearest(q.x, q.z).d < 6);
        if (on) { if (!cur) cur = [s, s]; cur[1] = s; } else if (cur) { if (!best || cur[1] - cur[0] > best[1] - best[0]) best = cur; cur = null; }
      }
      if (cur && (!best || cur[1] - cur[0] > best[1] - best[0])) best = cur;
      if (best && best[1] - best[0] > 300) this.ranges[id] = [Math.max(0, best[0] - LEAD_IN), Math.min(P.length - 1, best[1] + LEAD_OUT)];
    }
    // first trams already on their way, then one per direction every 5-8 minutes (line 12's headway)
    this.timers = { A: 20, B: 90 };
  }

  get active() {
    return Object.keys(this.ranges).length > 0;
  }

  reset() {
    for (const b of this.trams) this.remove(b);
    this.trams.length = 0;
    this.timers = { A: 20, B: 90 };
  }

  remove(b) {
    if (this.game.peds) this.game.peds.detachBus(b);
    b.dispose();
  }

  spawn(dirId) {
    const g = this.game, [s0] = this.ranges[dirId];
    // not into a tram that has just started
    if (this.trams.some((b) => b.dirId === dirId && b.phys.s - s0 < 60)) return false;
    const n = this.serial++;
    const vehicle = dispatchVehicle(this.route.line, 1000 + n, 7);
    const bus = createVehicle({ scene: g.scene, world: g.world, route: this.route, dirId, vehicle, fleet: fleetFor(vehicle, n).fleet, quality: g.quality, serviceNo: 1000 + n });
    bus.placeAt(s0);
    bus.routeS = s0;
    bus.foreign = true;
    bus.lights.head = g.sky.night > 0.3;
    bus.phys.engineOn = true;
    bus.phys.pantoUp = true;
    bus.phys.pantoH = 1;
    bus.phys.parkingBrake = false;
    bus.phys.selector = 'D';
    bus.phys.v = 7;
    bus.driver = new AITramDriver(bus, { traffic: g.traffic, signals: g.traffic && g.traffic.signals, peds: g.peds, others: () => g.allBuses() });
    if (g.peds) g.peds.attachBus(bus);
    this.trams.push(bus);
    return true;
  }

  update(dt) {
    if (!this.active) return;
    for (const id of Object.keys(this.ranges)) {
      this.timers[id] -= dt;
      if (this.timers[id] <= 0) this.timers[id] = this.spawn(id) ? 300 + Math.random() * 180 : 15;
    }
    for (let i = this.trams.length - 1; i >= 0; i--) {
      const b = this.trams[i];
      b.update(dt, b.driver.update(dt));
      b.syncVisual();
      for (const e of b.events.splice(0)) if (this.game.onStopEvent) this.game.onStopEvent(b, e);
      if (b.phys.s > this.ranges[b.dirId][1]) {
        this.remove(b);
        this.trams.splice(i, 1);
      }
    }
  }
}
