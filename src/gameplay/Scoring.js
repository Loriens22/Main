// Driving evaluation: smoothness (passenger comfort), stopping accuracy,
// punctuality, speed limits, kerb strikes, collisions. No game-over —
// only feedback and a trip summary.
export class Scoring {
  constructor() {
    this.reset();
  }

  reset() {
    this.points = 1000;
    this.items = {};
    this.messages = [];
    this.stops = [];
    this.delays = [];
    this.comfortT = 0;
    this.speedT = 0;
    this.kerbCooldown = 0;
    this.distance = 0;
    this.maxJerkWarn = 0;
    this.lastA = 0;
    this.started = null;
  }

  tripStart(t) {
    this.started = t;
  }

  add(key, pts, text = null, bad = pts < 0) {
    this.points += pts;
    this.items[key] = (this.items[key] || 0) + pts;
    if (text) this.messages.push({ text: `${text} (${pts > 0 ? '+' : ''}${pts})`, bad });
  }

  stopAccuracy(err, lateral) {
    const e = Math.abs(err);
    this.stops.push(e);
    const pts = e < 2 ? 15 : e < 4 ? 8 : e < 8 ? 2 : -5;
    this.add('stops', pts);
    if (lateral > 1.4) this.add('kerbGap', -4, 'Твърде далеч от бордюра');
  }

  punctuality(delay) {
    this.delays.push(delay);
    if (delay < -60) this.add('early', -8, 'Подранихте — изчакайте по разписание');
    else if (Math.abs(delay) < 90) this.add('punctual', 4);
  }

  update(dt, bus, world) {
    const p = bus.phys;
    this.distance += Math.abs(p.v) * dt;
    this.kerbCooldown -= dt;
    // comfort: strong acceleration / braking / cornering
    const along = Math.abs(p.aLong), alat = Math.abs(p.aLat);
    if ((along > 2.2 || alat > 2.4) && Math.abs(p.v) > 1) {
      this.comfortT += dt;
      if (this.comfortT > 0.6) {
        this.comfortT = -2;
        this.add('comfort', -5, along > 2.2 ? (p.aLong < 0 ? 'Рязко спиране — пътниците падат!' : 'Рязко потегляне') : 'Твърде бързо в завоя');
      }
    } else this.comfortT = Math.max(0, this.comfortT - dt);
    // speeding (city limit 50 km/h unless the road says otherwise)
    const q = world.roads.query(p.x, p.z, 15);
    const limit = q && q.piece.speed ? q.piece.speed : 50;
    if (p.speedKmh > limit + 6) {
      this.speedT += dt;
      if (this.speedT > 3) {
        this.speedT = -5;
        this.add('speed', -6, `Превишена скорост (${limit} км/ч)`);
      }
    } else this.speedT = Math.max(0, this.speedT - dt);
    // kerb strikes: front wheels off the carriageway onto a raised kerb
    if (this.kerbCooldown <= 0 && Math.abs(p.v) > 0.8 && q) {
      const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw), rx = -fz, rz = fx;
      for (const side of [1, -1]) {
        const wx = p.x + fx * 5.1 + rx * side * 1.15, wz = p.z + fz * 5.1 + rz * side * 1.15;
        if (!world.roads.onRoad(wx, wz, 0.25) && world.roads.onRoad(wx, wz, 3.0)) {
          this.kerbCooldown = 2.5;
          this.add('kerb', -4, 'Удар в бордюра');
          bus.kerbHit = true;
          break;
        }
      }
    }
  }

  summary() {
    const avgStop = this.stops.length ? this.stops.reduce((a, b) => a + b, 0) / this.stops.length : 0;
    const avgDelay = this.delays.length ? this.delays.reduce((a, b) => a + b, 0) / this.delays.length : 0;
    const fmt = (s) => `${s < 0 ? '−' : '+'}${Math.floor(Math.abs(s) / 60)}:${String(Math.round(Math.abs(s) % 60)).padStart(2, '0')}`;
    const stars = this.points > 1100 ? '★★★★★' : this.points > 1000 ? '★★★★☆' : this.points > 900 ? '★★★☆☆' : this.points > 750 ? '★★☆☆☆' : '★☆☆☆☆';
    return {
      points: this.points,
      rows: [
        ['Оценка', `${stars} (${Math.round(this.points)})`],
        ['Обслужени спирки', String(this.stops.length)],
        ['Средна точност на спиране', `${avgStop.toFixed(1)} м`],
        ['Средно отклонение от графика', fmt(avgDelay)],
        ['Комфорт', String(this.items.comfort || 0)],
        ['Скорост', String(this.items.speed || 0)],
        ['Бордюри / сблъсъци', `${this.items.kerb || 0} / ${this.items.collision || 0}`],
        ['Изминато разстояние', `${(this.distance / 1000).toFixed(2)} км`],
      ],
    };
  }
}
