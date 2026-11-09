import * as THREE from 'three';
import type { Assets } from '../render/Assets';
import type { CharacterDef } from '../data/characters';

const SKIN: Record<string, number> = { skin: 0x9e7563, skin_dark: 0x5c3d2b, skin_pale: 0xc49a86 };
const HAIR: Record<string, number> = { hair_dark: 0x141210, hair_brown: 0x4a301a, hair_gray: 0x8a8884, hair_blond: 0x9c8455 };

/**
 * Animated character instance (skinned GLB + AnimationMixer) with per-character colour variation.
 */
export class Humanoid {
  readonly root = new THREE.Group();
  model!: THREE.Object3D;
  mixer!: THREE.AnimationMixer;
  private actions = new Map<string, THREE.AnimationAction>();
  current = '';
  private head: THREE.Bone | null = null;
  lookTarget: THREE.Vector3 | null = null;
  private headYaw = 0;

  static async create(assets: Assets, def: CharacterDef, outfitOverride?: string): Promise<Humanoid> {
    const h = new Humanoid();
    const outfit = outfitOverride ?? def.look.outfit;
    const name = `human_${outfit}_${def.look.female ? 'f' : 'm'}`;
    const inst = await assets.instance(name);
    h.model = inst.root;
    h.root.add(h.model);
    const s = def.look.height / (def.look.female ? 1.68 : 1.8);
    h.model.scale.setScalar(s * (def.look.female ? 1 : 1));
    h.root.name = `npc_${def.id}`;
    // per-character tints (clone shared library materials once per NPC)
    h.model.traverse((o) => {
      const m = o as THREE.SkinnedMesh;
      if (!m.isMesh) return;
      m.castShadow = true;
      m.receiveShadow = true;
      m.frustumCulled = false;
      const swap = (mat: THREE.Material) => {
        const n = mat.name;
        if (n.startsWith('skin')) {
          const c = (mat as THREE.MeshStandardMaterial).clone();
          c.color.setHex(SKIN[def.look.skin] ?? SKIN.skin);
          return c;
        }
        if (n.startsWith('hair')) {
          const c = (mat as THREE.MeshStandardMaterial).clone();
          c.color.setHex(HAIR[def.look.hair] ?? HAIR.hair_dark);
          return c;
        }
        return mat;
      };
      m.material = Array.isArray(m.material) ? m.material.map(swap) : swap(m.material);
      if ((m as any).isSkinnedMesh) {
        const sk = (m as THREE.SkinnedMesh).skeleton;
        h.head = sk.bones.find((b) => b.name === 'head') ?? null;
      }
    });
    h.mixer = new THREE.AnimationMixer(h.model);
    for (const clip of inst.animations) {
      const a = h.mixer.clipAction(clip);
      h.actions.set(clip.name, a);
    }
    h.play('idle', 0);
    return h;
  }

  play(name: string, fade = 0.3, speed = 1) {
    const next = this.actions.get(name) ?? this.actions.get('idle');
    if (!next) return;
    next.timeScale = speed;
    if (this.current === name) return;
    const prev = this.actions.get(this.current);
    next.reset().setEffectiveWeight(1).play();
    if (prev && fade > 0) prev.crossFadeTo(next, fade, false);
    else if (prev) prev.stop();
    this.current = name;
  }

  setSpeed(speed: number) {
    const a = this.actions.get(this.current);
    if (a) a.timeScale = speed;
  }

  update(dt: number) {
    this.mixer.update(dt);
    // procedural head turn toward the look target
    if (this.head) {
      let target = 0;
      if (this.lookTarget) {
        const hp = this.head.getWorldPosition(new THREE.Vector3());
        const local = this.root.worldToLocal(this.lookTarget.clone());
        const hl = this.root.worldToLocal(hp.clone());
        const d = local.sub(hl);
        target = THREE.MathUtils.clamp(Math.atan2(-d.x, -d.z), -1.1, 1.1);
        void hp;
      }
      this.headYaw = THREE.MathUtils.damp(this.headYaw, target, 5, dt);
      this.head.rotation.y += this.headYaw;
    }
  }

  dispose() {
    this.mixer.stopAllAction();
    this.root.removeFromParent();
  }
}
