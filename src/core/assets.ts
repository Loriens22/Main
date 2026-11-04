import * as THREE from 'three';
import { GLTFLoader, GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

const MODELS = ['phones', 'crt_tv', 'sofa', 'cake', 'architecture', 'man', 'cave_people', 'dinosaur'] as const;
const TEX: Record<string, string> = {
  walnut: 'pbr/walnut_albedo.jpg', walnutN: 'pbr/walnut_normal.jpg', walnutR: 'pbr/walnut_rough.jpg',
  leather: 'pbr/sofa_leather_albedo.jpg', leatherN: 'pbr/sofa_leather_normal.jpg', leatherR: 'pbr/sofa_leather_rough.jpg',
  plaster: 'pbr/plaster_albedo.jpg', plasterN: 'pbr/plaster_normal.jpg',
  parquet: 'pbr/parquet_albedo.jpg', parquetN: 'pbr/parquet_normal.jpg',
  rugMain: 'pbr/rug_main_albedo.jpg', rugMainN: 'pbr/rug_main_normal.jpg', rugSmall: 'pbr/rug_small_albedo.jpg', rugSmallN: 'pbr/rug_small_normal.jpg',
  knit: 'pbr/knit_albedo.jpg', knitN: 'pbr/knit_normal.jpg', denim: 'pbr/denim_albedo.jpg', denimN: 'pbr/denim_normal.jpg',
  parchment: 'pbr/parchment.jpg', paperGrain: 'pbr/paper_grain.jpg',
  redLeather: 'pbr/redleather_albedo.jpg', redLeatherN: 'pbr/redleather_normal.jpg', redLeatherR: 'pbr/redleather_rough.jpg',
  brocade: 'pbr/brocade_albedo.jpg', brocadeN: 'pbr/brocade_normal.jpg', brocadeORM: 'pbr/brocade_orm.jpg',
  books: 'pbr/book_spines.jpg', sponge: 'pbr/sponge_albedo.jpg', creamN: 'pbr/cream_normal.jpg',
  blossom: 'pbr/blossom_atlas.png', softDot: 'pbr/soft_dot.png', starFlare: 'pbr/star_flare.png',
  bird: 'creatures/bird_warbler.png', plant02: 'creatures/plant_ref02.png',
  w_swallowtail: 'creatures/wing_swallowtail.png', w_crimson: 'creatures/wing_crimson.png', w_goldclear: 'creatures/wing_goldclear.png',
  w_hawkmoth: 'creatures/wing_hawkmoth.png', w_indigo: 'creatures/wing_indigo.png', w_creammoth: 'creatures/wing_creammoth.png',
};
const SCREENS = ['fold1', 'fold2', 'fold3', 'fold4', 'fold5', 'fold6', 'fold7'].flatMap((f) => [`${f}_inner`, `${f}_cover`])
  .concat(['matext_inner', 'matext_cover', 'matext2_inner', 'matext2_cover']);
const NON_COLOR = /N$|R$|ORM$|paperGrain|softDot|starFlare/;

export interface Assets {
  gltf: Record<string, GLTF>;
  tex: Record<string, THREE.Texture>;
  screen: Record<string, THREE.Texture>;
}

export async function loadAssets(base: string, onProgress: (f: number, label: string) => void): Promise<Assets> {
  const gl = new GLTFLoader();
  const tl = new THREE.TextureLoader();
  const total = MODELS.length + Object.keys(TEX).length + SCREENS.length;
  let done = 0;
  const missing: string[] = [];
  const tick = (label: string) => { done++; onProgress(done / total, label); };
  const A: Assets = { gltf: {}, tex: {}, screen: {} };
  const loadTex = (url: string, srgb: boolean) => new Promise<THREE.Texture>((res) => {
    tl.load(url, (t) => { if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; res(t); }, undefined, () => {
      missing.push(url);
      const t = new THREE.DataTexture(new Uint8Array([200, 0, 200, 255]), 1, 1); t.needsUpdate = true; res(t);
    });
  });
  const jobs: Promise<void>[] = [];
  // Models ship as base64 text (.glb.txt) because the artifact host only serves
  // standard web types; fall back to the binary .glb during local development.
  const loadModel = async (m: string) => {
    try {
      const r = await fetch(`${base}assets/models/${m}.glb.txt`);
      if (!r.ok) throw new Error(String(r.status));
      const b64 = (await r.text()).trim();
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return await gl.parseAsync(bytes.buffer, `${base}assets/models/`);
    } catch (e) {
      return gl.loadAsync(`${base}assets/models/${m}.glb`);
    }
  };
  for (const m of MODELS) {
    jobs.push(loadModel(m).then((g) => { A.gltf[m] = g; tick(m); }).catch((e) => { missing.push(m + '.glb'); console.error(e); tick(m); }));
  }
  for (const [k, p] of Object.entries(TEX)) {
    jobs.push(loadTex(`${base}assets/textures/${p}`, !NON_COLOR.test(k)).then((t) => { A.tex[k] = t; tick(k); }));
  }
  for (const s of SCREENS) {
    jobs.push(loadTex(`${base}assets/textures/screens/${s}.jpg`, true).then((t) => { A.screen[s] = t; tick(s); }));
  }
  await Promise.all(jobs);
  if (missing.length) console.warn('Missing assets:', missing);
  (A as any).missing = missing;
  return A;
}

export function rep(t: THREE.Texture, x: number, y: number) {
  const c = t.clone();
  c.wrapS = c.wrapT = THREE.RepeatWrapping;
  c.repeat.set(x, y);
  c.needsUpdate = true;
  return c;
}
