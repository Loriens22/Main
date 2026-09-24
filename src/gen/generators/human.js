// Human / humanoid generator: prompt attributes -> humanoid spec -> SDF
// character -> living NPC (or a frozen statue when asked for a statue).

import * as THREE from 'three';
import { Humanoid } from '../../characters/humanoid.js';
import { buildHumanSpec } from '../../characters/specs.js';
import { makeNPC } from '../../characters/npc.js';
import { G } from '../../core/context.js';

const STATUE_MATS = { marble: 'marble', bronze: 'bronze', gold: 'gold', stone: 'stone', chrome: 'chrome', plastic: 'plastic', rock: 'stone', wood: 'wood', ice: 'ice', crystal: 'crystal', granite: 'granite', copper: 'copper', iron: 'iron', steel: 'steel' };

export const humanGen = {
  maxCount: 12,
  estimate: (item) => (item.params && item.params.height > 4 ? 9 : 6),
  stages: () => [
    { name: 'body', label: 'Sculpting body & clothes', weight: 4 },
    { name: 'face', label: 'Sculpting face & hair', weight: 3 },
    { name: 'rig', label: 'Rigging & skinning', weight: 1 },
    { name: 'mind', label: 'Building personality', weight: 0.5 },
  ],
  *build(ctx, item, rng, env) {
    const spec = buildHumanSpec(item, rng);
    const statue = !!(item.params && item.params.statue) || !!spec.statue || !!spec.stone;
    ctx.stage('body', 'Sculpting body & clothes');
    const h = new Humanoid(spec, rng.nextU32());
    let faceStage = false;
    yield* h.build(ctx, (f, text) => {
      if (f < 0.44) ctx.progress(f / 0.44, text);
      else if (f < 0.8) { if (!faceStage) { faceStage = true; ctx.stage('face', text); } ctx.progress((f - 0.44) / 0.36, text); }
      else ctx.progress(Math.min(1, (f - 0.8) / 0.2), text);
    });
    ctx.stage('rig', 'Rigging & skinning');
    yield;
    const root = new THREE.Group();
    root.add(h.root);
    const data = {
      root, name: spec.name, category: statue ? 'statue' : 'character', icon: statue ? '🗿' : item.icon,
      height: spec.height, footprint: { radius: Math.max(0.45, spec.height * 0.22) },
      spec,
    };
    if (statue) {
      // One material for every part, frozen in a pose on a plinth.
      const matKey = STATUE_MATS[spec.statueMaterial] || (item.attrs.materials && STATUE_MATS[item.attrs.materials[0]]) || 'marble';
      const mat = G.materials.get(matKey, { color: item.attrs.primaryColor && item.attrs.primaryColor !== 'rainbow' ? item.attrs.primaryColor : undefined, world: 0.6 });
      h.root.traverse((o) => { if (o.isMesh) o.material = Array.isArray(o.material) ? o.material.map(() => mat) : mat; });
      const pose = rng.pick(['wave', 'point', 'think', 'cheer', 'bow', 'thumbsup']);
      h.gesture(pose, 1e9);
      for (let i = 0; i < 40; i++) h.update(0.05, { speed: 0, grounded: true });
      const plinthH = 0.5 * Math.max(1, spec.height / 1.8);
      const plinth = new THREE.Mesh(new THREE.BoxGeometry(spec.height * 0.55, plinthH, spec.height * 0.55), G.materials.get('granite'));
      plinth.position.y = plinthH / 2; plinth.castShadow = plinth.receiveShadow = true;
      root.add(plinth);
      h.root.position.y = plinthH;
      data.colliderDefs = [{ type: 'box', x: 0, z: 0, y0: 0, y1: plinthH, hx: spec.height * 0.275, hz: spec.height * 0.275 }, { type: 'cyl', x: 0, z: 0, y0: plinthH, y1: plinthH + spec.height, r: spec.height * 0.15 }];
      data.name = `Statue of ${spec.sex === 'female' ? 'a woman' : 'a man'}`;
      data.footprint = { radius: spec.height * 0.4 };
      data.dispose = () => h.dispose();
      return data;
    }
    ctx.stage('mind', 'Building personality');
    yield;
    const traits = spec.personality && spec.personality.length ? spec.personality : null;
    const subtitle = [spec.profession ? spec.profession[0].toUpperCase() + spec.profession.slice(1) : null, traits ? traits[0] : null].filter(Boolean).join(' · ');
    makeNPC(data, {
      humanoid: h, rng: rng.fork('mind'), seed: rng.nextU32(),
      personalityInfo: { name: spec.name, sex: spec.sex, age: spec.age, profession: spec.profession, traits },
      radius: Math.max(0.25, 0.3 * spec.height / 1.8),
      brainOpts: {
        walkSpeed: (spec.zombie ? 0.6 : spec.age > 70 ? 0.95 : 1.35) * Math.sqrt(spec.height / 1.75), runSpeed: (spec.zombie ? 1.2 : spec.age > 70 ? 2 : 4.6) * Math.sqrt(spec.height / 1.75),
        radius: Math.max(0.25, 0.3 * spec.height / 1.8), wanderRadius: 6, lazy: traits && traits.includes('lazy'),
      },
      subtitle: subtitle || (spec.age < 13 ? 'Child' : ''),
    });
    return data;
  },
};
