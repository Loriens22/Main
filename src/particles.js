/* =====================================================================
   PARTICLES  —  CPU-simulated emitters driven by builder markers.
   Packs straight into the additive point-sprite buffer.
   Layout per particle: x, y, z, r, g, b, size
   ===================================================================== */

(function (root) {
  'use strict';

  /* `size` is a radius in blocks — the shader scales it by distance */
  const TYPES = {
    smoke: { rate: 7, life: 3.2, size: 0.34, col: [0.42, 0.40, 0.38] },
    lavaDrip: { rate: 9, life: 1.5, size: 0.15, col: [1.0, 0.44, 0.10] },
    firefly: { rate: 0.9, life: 7.0, size: 0.10, col: [1.0, 0.86, 0.34] },
    spark: { rate: 3.5, life: 0.9, size: 0.07, col: [1.0, 0.66, 0.22] },
    splash: { rate: 5, life: 1.1, size: 0.11, col: [0.55, 0.74, 1.0] },
    bee: { rate: 0, life: 999, size: 0.26, col: [1.0, 0.82, 0.18] },
    glow: { rate: 0, life: 999, size: 2.0, col: [1.0, 0.72, 0.36] },
    ambient: { rate: 2, life: 2.4, size: 0.14, col: [1.0, 0.5, 0.15] },
  };

  function System(max) {
    this.max = max;
    this.buf = new Float32Array(max * 7);
    this.px = new Float32Array(max); this.py = new Float32Array(max); this.pz = new Float32Array(max);
    this.vx = new Float32Array(max); this.vy = new Float32Array(max); this.vz = new Float32Array(max);
    this.life = new Float32Array(max); this.maxLife = new Float32Array(max);
    this.kind = new Uint8Array(max); this.seedv = new Float32Array(max);
    this.ex = new Float32Array(max); this.ey = new Float32Array(max); this.ez = new Float32Array(max);
    this.alive = 0;
    this.free = new Int32Array(max);
    for (let i = 0; i < max; i++) this.free[i] = i;
    this.nFree = max;
    this.active = new Int32Array(max);
    this.nActive = 0;
    this.kinds = Object.keys(TYPES);
    this.emitters = [];
    this.acc = [];
    this.rngS = 12345;
  }
  System.prototype.rand = function () {
    this.rngS = (this.rngS * 1664525 + 1013904223) >>> 0;
    return this.rngS / 4294967296;
  };
  System.prototype.setMarkers = function (markers) {
    this.emitters = [];
    for (const m of markers) {
      const t = TYPES[m.type] ? m.type : 'spark';
      this.emitters.push({
        type: t, ti: this.kinds.indexOf(t),
        x: m.x + 0.5, y: m.y + 0.5, z: m.z + 0.5,
        rate: m.rate !== undefined ? m.rate : TYPES[t].rate,
        r: m.r !== undefined ? m.r : 1.4,
        count: m.count !== undefined ? m.count : 6,
        color: m.color || TYPES[t].col,
        power: m.power !== undefined ? m.power : 1,
        rise: m.rise !== undefined ? m.rise : 1,
        fall: m.fall !== undefined ? m.fall : 1,
        spread: m.spread !== undefined ? m.spread : 1,
        size: m.size,
        acc: 0, spawned: false,
      });
    }
  };
  System.prototype._spawn = function (e, ox, oy, oz, vx, vy, vz, life) {
    if (!this.nFree) return -1;
    const i = this.free[--this.nFree];
    this.px[i] = e.x + ox; this.py[i] = e.y + oy; this.pz[i] = e.z + oz;
    this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz;
    this.life[i] = life; this.maxLife[i] = life;
    this.kind[i] = e.ti; this.seedv[i] = this.rand() * 6.283;
    this.ex[i] = e.x; this.ey[i] = e.y; this.ez[i] = e.z;
    this.active[this.nActive++] = i;
    this._eref = this._eref || [];
    this._eref[i] = e;
    return i;
  };

  /** simulate + fill the GPU buffer; returns particle count to draw */
  System.prototype.update = function (dt, cam, budget) {
    dt = Math.min(dt, 0.05);
    const R2 = (budget && budget.radius || 110); const R2s = R2 * R2;
    const rand = () => this.rand();

    /* ---- emit ---- */
    for (const e of this.emitters) {
      const dx = e.x - cam.x, dy = e.y - cam.y, dz = e.z - cam.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > R2s) { e.acc = 0; continue; }
      const near = 1 - Math.min(1, d2 / R2s);

      if (e.type === 'glow') {
        if (!e.spawned) { e.gi = this._spawn(e, 0, 0, 0, 0, 0, 0, 1e9); e.spawned = true; }
        continue;
      }
      if (e.type === 'bee') {
        if (!e.spawned) {
          e.beeIdx = [];
          for (let k = 0; k < e.count; k++) {
            const i = this._spawn(e, 0, 0, 0, 0, 0, 0, 1e9);
            if (i >= 0) { e.beeIdx.push(i); this.seedv[i] = (k / e.count) * 6.283 + rand(); }
          }
          e.spawned = true;
        }
        continue;
      }
      if (e.type === 'firefly') {
        if (!e.spawned) {
          e.ffIdx = [];
          for (let k = 0; k < (e.count || 6); k++) {
            const i = this._spawn(e, 0, 0, 0, 0, 0, 0, 1e9);
            if (i >= 0) { e.ffIdx.push(i); this.seedv[i] = rand() * 6.283; }
          }
          e.spawned = true;
        }
        continue;
      }

      e.acc += e.rate * dt * (0.35 + 0.65 * near) * (budget && budget.scale || 1);
      while (e.acc >= 1) {
        e.acc -= 1;
        const s = e.spread;
        if (e.type === 'smoke') {
          this._spawn(e, (rand() - .5) * .6 * s, 0, (rand() - .5) * .6 * s,
            (rand() - .5) * .16 * s, (0.5 + rand() * 0.5) * e.rise, (rand() - .5) * .16 * s,
            TYPES.smoke.life * (0.7 + rand() * 0.7));
        } else if (e.type === 'lavaDrip') {
          this._spawn(e, (rand() - .5) * 1.1, 0, (rand() - .5) * 1.1,
            (rand() - .5) * .18, rand() < 0.25 ? 0.7 + rand() : -0.4 - rand() * 1.5 * e.fall, (rand() - .5) * .18,
            TYPES.lavaDrip.life * (0.6 + rand()));
        } else if (e.type === 'splash') {
          this._spawn(e, (rand() - .5) * 1.6, 0, (rand() - .5) * 1.6,
            (rand() - .5) * .5, 0.8 + rand() * 0.9, (rand() - .5) * .5,
            TYPES.splash.life * (0.6 + rand() * 0.8));
        } else {
          this._spawn(e, (rand() - .5) * .35, 0, (rand() - .5) * .35,
            (rand() - .5) * .25, 0.35 + rand() * 0.5, (rand() - .5) * .25,
            TYPES[e.type].life * (0.6 + rand() * 0.8));
        }
      }
    }

    /* ---- integrate + pack ---- */
    const buf = this.buf;
    let n = 0, w = 0;
    const t = (this.t = (this.t || 0) + dt);
    for (let a = 0; a < this.nActive; a++) {
      const i = this.active[a];
      const e = this._eref[i];
      const kd = this.kinds[this.kind[i]];
      let alive = true;

      if (kd === 'glow') {
        this.px[i] = e.x; this.py[i] = e.y; this.pz[i] = e.z;
      } else if (kd === 'bee') {
        const ph = this.seedv[i] + t * 1.35;
        const rr = e.r * (0.75 + 0.25 * Math.sin(ph * 1.7));
        this.px[i] = e.x + Math.cos(ph) * rr;
        this.pz[i] = e.z + Math.sin(ph) * rr;
        this.py[i] = e.y + Math.sin(ph * 2.3) * 0.5;
      } else if (kd === 'firefly') {
        const ph = this.seedv[i] + t * 0.42;
        const rr = (e.r || 5) * (0.5 + 0.5 * Math.sin(ph * 0.7 + this.seedv[i]));
        this.px[i] = e.x + Math.cos(ph * 1.13) * rr;
        this.pz[i] = e.z + Math.sin(ph * 0.87) * rr;
        this.py[i] = e.y + Math.sin(ph * 1.6) * 1.4 + 0.6;
      } else {
        this.life[i] -= dt;
        if (this.life[i] <= 0) alive = false;
        else {
          if (kd === 'smoke') { this.vy[i] += dt * 0.25; this.vx[i] *= 0.985; this.vz[i] *= 0.985; }
          else if (kd === 'lavaDrip') { this.vy[i] -= dt * 5.5; }
          else if (kd === 'splash') { this.vy[i] -= dt * 7.0; }
          else { this.vy[i] -= dt * 1.2; }
          this.px[i] += this.vx[i] * dt; this.py[i] += this.vy[i] * dt; this.pz[i] += this.vz[i] * dt;
        }
      }

      if (!alive) {
        this.free[this.nFree++] = i;
        this.active[a] = this.active[--this.nActive];
        a--;
        continue;
      }

      /* pack */
      const dx = this.px[i] - cam.x, dy = this.py[i] - cam.y, dz = this.pz[i] - cam.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > R2s * 1.3) continue;
      const c = e.color;
      const lf = this.maxLife[i] > 1e8 ? 1 : this.life[i] / this.maxLife[i];
      let r = c[0], g = c[1], b = c[2], sz = e.size || TYPES[kd].size;
      let a2 = 1;
      if (kd === 'smoke') { a2 = Math.min(1, lf * 1.6) * 0.30; sz *= (1.9 - lf * 1.0); }
      else if (kd === 'lavaDrip') { a2 = lf; r *= 1; g *= (0.4 + lf * 0.6); }
      else if (kd === 'firefly') { a2 = (0.30 + 0.55 * Math.abs(Math.sin(t * 1.7 + this.seedv[i] * 3.1))); }
      else if (kd === 'glow') { a2 = e.power * 0.085; sz = (e.r || 8) * 0.34; }
      else if (kd === 'bee') { a2 = 1; }
      else a2 = lf;

      buf[w] = this.px[i]; buf[w + 1] = this.py[i]; buf[w + 2] = this.pz[i];
      buf[w + 3] = r * a2; buf[w + 4] = g * a2; buf[w + 5] = b * a2; buf[w + 6] = sz;
      w += 7; n++;
      if (n >= this.max) break;
    }
    return n;
  };

  root.MCParticles = { System, TYPES };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.MCParticles;
})(typeof globalThis !== 'undefined' ? globalThis : this);
