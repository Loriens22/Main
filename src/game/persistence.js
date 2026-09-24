// Save / load. A save stores *recipes*, not meshes: every entity's parsed
// prompt item + seed + transform + runtime state. Loading re-runs the same
// deterministic generators, so saves are tiny (a few KB) and survive engine
// updates. Slots live in localStorage; worlds can also be exported/imported
// as JSON files.

import * as THREE from 'three';
import { G } from '../core/context.js';
import { switchWorld } from './worlds.js';
import { playerSnapshot } from './commands.js';

const PREFIX = 'genesis.save.';
const SLOTS = [['auto', 'Autosave'], ['slot1', 'Slot 1'], ['slot2', 'Slot 2'], ['slot3', 'Slot 3']];
const VERSION = 1;

export class Persistence {
  constructor() {
    this.autosaveTimer = 120;
    this.loading = false;
  }

  snapshot() {
    const P = G.player;
    const ow = G.overworld;
    return {
      version: VERSION, date: new Date().toISOString(),
      time: ow.atmosphere ? ow.atmosphere.timeOfDay : 12, weather: ow.weather ? ow.weather.type : 'clear',
      worldId: G.world.id, player: { pos: P.position.toArray(), yaw: P.yaw, pitch: P.pitch, flying: P.flying, camera: P.cameraMode },
      gravity: ow.rules.gravity,
      entities: G.registry.serialize(),
    };
  }

  getSlots() {
    return SLOTS.map(([id, label]) => {
      let meta = '', empty = true;
      try {
        const raw = localStorage.getItem(PREFIX + id);
        if (raw) { const d = JSON.parse(raw); empty = false; meta = `${new Date(d.date).toLocaleString()} · ${d.entities.length} objects`; }
      } catch (e) { /* ignore */ }
      return { id, label, meta, empty };
    });
  }

  save(slot = 'slot1', quiet = false) {
    try {
      const data = this.snapshot();
      localStorage.setItem(PREFIX + slot, JSON.stringify(data));
      if (!quiet) G.ui.toast(`World saved (${data.entities.length} objects)`, 'good');
      return true;
    } catch (e) {
      if (!quiet) G.ui.toast('Could not save: ' + e.message, 'bad');
      return false;
    }
  }

  load(slot) {
    try {
      const raw = localStorage.getItem(PREFIX + slot);
      if (!raw) { G.ui.toast('That slot is empty.'); return; }
      this.restore(JSON.parse(raw));
    } catch (e) { G.ui.toast('Could not load: ' + e.message, 'bad'); }
  }

  exportFile() {
    const data = this.snapshot();
    const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `genesis-world-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    G.ui.toast('World exported', 'good');
  }

  // Wipe everything the player made (all worlds except the overworld).
  reset() {
    G.registry.clear(null);
    for (const [id, w] of [...G.worlds]) if (id !== G.overworld.id) { if (G.world === w) switchWorld(G.overworld, G.overworld.spawn.pos.clone(), G.overworld.spawn.yaw); w.dispose(); G.worlds.delete(id); }
    G.lastCreated = null;
  }

  async restore(data) {
    if (!data || !Array.isArray(data.entities)) { G.ui.toast('Invalid save data', 'bad'); return; }
    this.loading = true;
    this.reset();
    const ow = G.overworld;
    if (ow.atmosphere && data.time !== undefined) ow.atmosphere.setTime(data.time);
    if (ow.weather && data.weather) ow.weather.set(data.weather);
    if (data.gravity) ow.rules.gravity = data.gravity;
    const P = G.player;
    P.teleport(new THREE.Vector3().fromArray(data.player.pos), data.player.yaw);
    P.pitch = data.player.pitch || 0; P.flying = !!data.player.flying;
    G.ui.toast(`Loading ${data.entities.length} objects…`, '', 3000);
    // Overworld entities first; portals recreate their dimensions, whose old
    // ids are then mapped to the new ones for the entities inside them.
    const idMap = new Map([[0, ow.id]]);
    const pending = data.entities.filter((e) => e.item);
    const submit = (rec, world) => {
      const job = G.pipeline.submit(rec.item, { world, player: playerSnapshot(), prev: null }, {
        seed: rec.seed, copyIndex: rec.copyIndex || 0, transform: { pos: rec.pos, yaw: rec.yaw, scale: rec.scale || 1 }, id: rec.id, state: rec.state, silent: true,
      });
      return job.promise;
    };
    let round = 0;
    let rest = pending;
    while (rest.length && round < 6) {
      const now = rest.filter((r) => idMap.has(r.worldId ?? 0));
      rest = rest.filter((r) => !idMap.has(r.worldId ?? 0));
      const results = await Promise.all(now.map((r) => submit(r, G.worlds.get(idMap.get(r.worldId ?? 0)))));
      results.forEach((res, i) => {
        const rec = now[i];
        const ent = res.result && res.result[0];
        if (ent && ent.dimension && rec.state && rec.state.dimId !== undefined) idMap.set(rec.state.dimId, ent.dimension.id);
      });
      round++;
    }
    const target = G.worlds.get(idMap.get(data.worldId ?? 0)) || ow;
    if (target !== G.world) switchWorld(target, new THREE.Vector3().fromArray(data.player.pos), data.player.yaw);
    this.loading = false;
    G.ui.toast(`World loaded · ${G.registry.entities.size} objects`, 'good');
  }

  update(dt) {
    if (!G.started || this.loading) return;
    this.autosaveTimer -= dt;
    if (this.autosaveTimer <= 0) { this.autosaveTimer = 120; if (G.registry.entities.size) this.save('auto', true); }
  }
}
