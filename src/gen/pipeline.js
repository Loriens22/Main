// ---------------------------------------------------------------------------
// Generation pipeline.
//
//   prompt -> NLP (nlp.js) -> entity items -> one Job per item:
//     1. Analysing prompt / planning        (spec synthesis, seeds)
//     2. Generator stages                   (geometry, sculpting, textures,
//                                            rigging, personality...)
//     3. Placement                          (placement.js solver)
//     4. Instantiation                      (registry: colliders, terrain
//                                            footprint, lights, materialize)
//
// Jobs are time-sliced generators (core/jobs.js) so the game keeps running.
// Every job has a hard deadline (settings.maxGenSeconds, <= 5 minutes).
// Generators consult ctx.detail/ctx.mustFinish() to simplify when running
// late; if a generator throws or blows the deadline, a fast fallback
// generator produces a simpler interpretation so the user always gets a
// result. Determinism: every item gets a 32-bit seed; save files store
// (item, seed, transform) and loading re-runs the same generators.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { Job } from '../core/jobs.js';
import { RNG, randomSeed } from '../core/rng.js';
import { G, settings, genPreset } from '../core/context.js';
import { GENERATORS, FALLBACK } from './generators/index.js';
import { resolvePlacement, arrangeMany } from './placement.js';
import { makeEntity } from './registry.js';

const DEFAULT_STAGES = [
  { name: 'analyze', label: 'Analyzing prompt', weight: 0.4 },
  { name: 'plan', label: 'Planning layout', weight: 0.6 },
  { name: 'geometry', label: 'Generating geometry', weight: 5 },
  { name: 'textures', label: 'Baking textures', weight: 1.5 },
  { name: 'optimize', label: 'Optimizing', weight: 0.8 },
  { name: 'place', label: 'Placing in world', weight: 0.7 },
];

function titleFor(item) {
  const c = item.clause || item.concept;
  return (item.count > 1 ? `${item.count} × ` : '') + c.charAt(0).toUpperCase() + c.slice(1);
}

export class Pipeline {
  constructor(jobs, registry) {
    this.jobs = jobs;
    this.registry = registry;
    this.perfFactor = 1;
  }

  // Quick CPU benchmark so time estimates adapt to the device.
  calibrate() {
    const t0 = performance.now();
    let acc = 0;
    for (let i = 0; i < 400000; i++) acc += Math.sqrt(i * 1.37) * Math.sin(i * 0.01);
    const ms = performance.now() - t0;
    this.perfFactor = Math.min(6, Math.max(0.5, ms / 6));
    return acc;
  }

  estimate(item) {
    const gen = GENERATORS[item.gen] || FALLBACK;
    const base = gen.estimate ? gen.estimate(item) : 3;
    return Math.max(1, base * genPreset().estimateMul * this.perfFactor * Math.max(1, Math.sqrt(item.count || 1) * 1.2));
  }

  // Submit a parsed item. ctx: { world, player (snapshot), prev }
  submit(item, placementCtx, opts = {}) {
    const gen = GENERATORS[item.gen] || FALLBACK;
    const stages = [DEFAULT_STAGES[0], DEFAULT_STAGES[1], ...(gen.stages ? gen.stages(item) : DEFAULT_STAGES.slice(2, 5)), DEFAULT_STAGES[5]];
    const seed = opts.seed ?? item.seed ?? randomSeed();
    item.seed = seed;
    const job = new Job((ctx) => this._run(ctx, item, gen, seed, placementCtx, opts), {
      title: opts.title || titleFor(item),
      stages,
      estimateSec: this.estimate(item),
      deadlineSec: Math.min(300, settings.maxGenSeconds || 300),
      meta: { item },
    });
    this.jobs.add(job);
    if (G.ui && !opts.silent) G.ui.trackJob(job);
    return job;
  }

  *_run(ctx, item, gen, seed, pctx, opts) {
    const rng = new RNG(seed);
    ctx.stage('analyze', 'Analyzing prompt');
    const world = pctx.world;
    yield;
    ctx.progress(1);
    ctx.stage('plan', 'Planning layout');
    const count = Math.max(1, Math.min(item.count || 1, gen.maxCount || 24));
    const results = [];
    const created = [];
    try {
      // When restoring a save, only the one saved copy (copyIndex) is rebuilt.
      const first = opts.copyIndex ?? 0, last = opts.copyIndex !== undefined ? opts.copyIndex + 1 : count;
      for (let i = first; i < last; i++) {
        const sub = { ...item, index: i, count };
        const subRng = rng.fork('copy' + i);
        let data = null;
        const t0 = performance.now();
        try {
          // Each copy maps its progress into the generator stages.
          const wrapCtx = Object.create(ctx);
          wrapCtx.progress = (f, text) => ctx.progress((i - first + f) / (last - first), text);
          wrapCtx.stage = (name, text) => { ctx.stage(name, text); ctx.progress((i - first) / (last - first)); };
          data = yield* gen.build(wrapCtx, sub, subRng, { world, index: i, count });
        } catch (err) {
          if (ctx.cancelled) throw err;
          console.warn('[generator failed, using fallback]', item.gen, err);
          data = yield* FALLBACK.build(ctx, sub, subRng, { world, error: err });
        }
        if (!data) continue;
        if (ctx.mustFinish() && i < last - 1) { console.warn('Deadline approaching: stopping after', i + 1, 'copies'); }
        data._genMs = performance.now() - t0;
        data.copyIndex = i;
        results.push(data);
        if (ctx.mustFinish()) break;
      }
    } finally {
      // nothing
    }
    ctx.stage('place', 'Placing in world');
    // Companions ("a man with a dog") wait for their main entity so they can stand next to it.
    if (pctx.waitFor && (pctx.waitFor.status === 'queued' || pctx.waitFor.status === 'running')) {
      ctx.progress(0, 'Waiting for companion');
      const res = yield pctx.waitFor.promise;
      if (res && res.result && res.result.length) pctx.prev = res.result[0];
    } else if (pctx.waitFor && pctx.waitFor.result && pctx.waitFor.result.length) pctx.prev = pctx.waitFor.result[0];
    yield;
    // Placement + registration.
    let base = null, baseYaw = 0;
    const group = [];
    for (let i = 0; i < results.length; i++) {
      const d = results[i];
      const info = {
        radius: d.footprint ? d.footprint.radius : item.radius, height: d.height || 1,
        floating: !!d.floating, floatHeight: d.floatHeight || 0, wantsWater: !!d.wantsWater, isBuilding: !!d.flattenTerrain || item.gen === 'building',
        isCharacter: !!d.isCharacter, sideways: !!d.sideways,
      };
      let pos, yaw;
      if (opts.transform) {
        pos = new THREE.Vector3().fromArray(opts.transform.pos); yaw = opts.transform.yaw;
      } else if (i === 0 || item.placement && item.placement.mode === 'around') {
        const pItem = !item.placement && d.preferPlacement ? { ...item, placement: { mode: d.preferPlacement } } : item;
        const pr = resolvePlacement(pItem, { ...info, radius: info.radius * (results.length > 1 && item.placement?.mode !== 'around' ? 1.4 : 1) }, { ...pctx, registry: this.registry, prev: pctx.prev });
        if (pctx.replaceEntity) { this.registry.remove(pctx.replaceEntity.id); pctx.replaceEntity = null; }
        base = pr.pos; baseYaw = pr.yaw; pos = pr.pos.clone(); yaw = pr.yaw;
        if (results.length > 1 && item.placement && item.placement.mode === 'around') {
          pos = arrangeMany(base, results.length, info, i, rng, 'around', pctx.player);
          yaw = Math.atan2(pctx.player.position.x - pos.x, pctx.player.position.z - pos.z);
        }
      } else {
        pos = arrangeMany(base, results.length, info, i, rng, item.placement ? item.placement.mode : 'front', pctx.player);
        yaw = baseYaw + (info.isBuilding ? 0 : rng.range(-0.6, 0.6));
      }
      if (!opts.transform) {
        if (info.floating) pos.y = Math.max(pos.y, world.heightAt(pos.x, pos.z) + (info.floatHeight || 0));
        else if (i > 0 || item.placement?.mode === 'around') pos.y = info.wantsWater ? Math.max(world.waterLevel, world.heightAt(pos.x, pos.z)) : world.colliders.groundHeight(pos.x, pos.z, 0.2, 1e5, 0);
      }
      d.root.position.copy(pos);
      d.root.rotation.y = yaw;
      const scale = opts.transform?.scale || 1;
      d.root.scale.setScalar(scale);
      d.root.updateMatrixWorld(true);
      const ent = makeEntity(d, {
        id: opts.id && i === 0 ? opts.id : undefined, item: stripItem(item), seed, concept: item.concept, gen: item.gen, category: d.category || item.cat,
        icon: d.icon || item.icon, prompt: item.clause, colorWord: item.attrs && item.attrs.colors.length ? item.attrs.colors[0].word : null, scale,
      });
      this.registry.add(ent, world, { silent: opts.silent });
      if (opts.state && ent.loadState) ent.loadState(opts.state);
      group.push(ent);
      created.push(ent);
      pctx.prev = ent;
      if ((i & 3) === 3) yield;
    }
    this.registry.lastBatch = group;
    ctx.progress(1, 'Done');
    return created;
  }
}

// Keep only JSON-safe data of the parsed item for saving.
function stripItem(item) {
  const { companionOf, ...rest } = item;
  return JSON.parse(JSON.stringify(rest));
}

export { DEFAULT_STAGES };
