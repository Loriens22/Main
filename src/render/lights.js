// Point-light pool. Changing the number of lights in a scene forces every
// material to recompile, so each world owns a fixed pool of PointLights and
// the closest light *requests* (lamps, fires, windows at night, glowing
// crystals...) are assigned to them every few frames.

import * as THREE from 'three';

export class LightPool {
  constructor(scene, count) {
    this.lights = [];
    for (let i = 0; i < count; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 10, 2);
      l.castShadow = false;
      l.position.set(0, -1000, 0);
      scene.add(l);
      this.lights.push(l);
    }
    this.requests = new Set();
    this.timer = 0;
    this.scene = scene;
  }

  // req: { getPosition(out) | position, color, intensity, distance, nightOnly, flicker }
  add(req) { this.requests.add(req); return req; }
  remove(req) { this.requests.delete(req); }

  update(dt, camPos, night, time) {
    this.timer -= dt;
    const tmp = new THREE.Vector3();
    if (this.timer <= 0) {
      this.timer = 0.25;
      const list = [];
      for (const r of this.requests) {
        if (r.nightOnly && night < 0.2) continue;
        if (r.enabled === false) continue;
        const p = r.getPosition ? r.getPosition(tmp) : r.position;
        const d = p.distanceTo(camPos) - (r.distance || 10) * 0.5;
        if (d > 120) continue;
        list.push({ r, d });
      }
      list.sort((a, b) => a.d - b.d);
      this.assigned = list.slice(0, this.lights.length).map((x) => x.r);
    }
    const as = this.assigned || [];
    for (let i = 0; i < this.lights.length; i++) {
      const l = this.lights[i];
      const r = as[i];
      if (!r) { l.intensity = 0; continue; }
      if (r.getPosition) r.getPosition(l.position); else l.position.copy(r.position);
      l.color.set(r.color || '#ffd8a0');
      l.distance = r.distance || 10;
      let inten = r.intensity ?? 3;
      if (r.nightOnly) inten *= Math.min(1, night * 1.5);
      if (r.flicker) inten *= 0.8 + 0.2 * Math.sin(time * 17 + i) * Math.sin(time * 7.3 + i * 2);
      l.intensity = inten;
    }
  }
}
