import * as THREE from 'three';

/**
 * Jupiter's cloud layer around the flying Ranger: billboard cloud banks in three layers — white ammonia-ice towers
 * around the 1-bar level, tan-brown ammonium-hydrosulfide banks below, thin high haze above — kept around the camera
 * (they wrap as it flies), lit by the zone's daylight, with lightning flickering in the deep.
 */
interface Puff {
  s: THREE.Sprite;
  layer: number;
  base: THREE.Color;
  y: number;
  op: number;
  size: number;
}

type Kind = 'puff' | 'tower' | 'sheet';
const LAYERS: { n: number; y: [number, number]; size: [number, number]; col: [number, number, number]; op: number; kinds: Kind[] }[] = [
  // the white ammonia-ice deck around the 1-bar level: billows, towering convective cells with anvils
  { n: 64, y: [-1600, 2400], size: [500, 1500], col: [0.98, 0.94, 0.86], op: 0.95, kinds: ['puff', 'puff', 'tower', 'sheet'] },
  // tan-brown ammonium-hydrosulfide banks below: broad, flat, darker
  { n: 40, y: [-5000, -2600], size: [1600, 3400], col: [0.66, 0.47, 0.31], op: 0.92, kinds: ['sheet', 'puff', 'sheet'] },
  // thin high haze streaks
  { n: 20, y: [5500, 9000], size: [2600, 5200], col: [0.94, 0.9, 0.82], op: 0.32, kinds: ['sheet'] },
];

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function blob(g: CanvasRenderingContext2D, x: number, y: number, rad: number, k: number, a: number) {
  const gr = g.createRadialGradient(x, y - rad * 0.2, rad * 0.1, x, y, rad);
  gr.addColorStop(0, `rgba(${255 * k | 0},${255 * k | 0},${255 * k | 0},${a})`);
  gr.addColorStop(0.6, `rgba(${235 * k | 0},${235 * k | 0},${235 * k | 0},${a * 0.6})`);
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.beginPath();
  g.arc(x, y, rad, 0, Math.PI * 2);
  g.fill();
}

/** A cloud card: a billowed cumulus, a convective tower with a spreading anvil, or a flat streaky sheet. */
function cloudTexture(seed: number, kind: Kind) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const r = rng(seed);
  if (kind === 'puff') {
    for (let i = 0; i < 52; i++) {
      const a = r() * Math.PI, d = Math.pow(r(), 0.7) * 0.34;
      const x = 128 + Math.cos(a) * d * 256 * (0.9 + r() * 0.4);
      const y = 168 - Math.sin(a) * d * 256 * 0.8 - r() * 10;
      blob(g, x, y, 18 + r() * 40 * (1 - d), 0.8 + r() * 0.2, 0.5);
    }
  } else if (kind === 'tower') {
    // a broad convective column of billows, swelling into a spreading anvil at the top
    for (let i = 0; i < 64; i++) {
      const t = r();
      const y = 238 - t * 160;
      const w = 62 * (1 - t * 0.3) + (t > 0.8 ? (t - 0.8) * 260 : 0);
      blob(g, 128 + (r() - 0.5) * w * 2, y, 22 + r() * 30 * (1 - t * 0.3), 0.8 + r() * 0.2, 0.55);
    }
    for (let i = 0; i < 34; i++) {
      const x = 128 + (r() - 0.5) * 210;
      blob(g, x, 58 + r() * 26 + Math.abs(x - 128) * 0.05, 18 + r() * 22, 0.9 + r() * 0.1, 0.45);
    }
  } else {
    // a sheet: long overlapping lenses drawn as stretched blobs
    g.save();
    g.translate(128, 140);
    g.scale(1, 0.5);
    for (let i = 0; i < 50; i++) blob(g, (r() - 0.5) * 200, (r() - 0.5) * 110, 26 + r() * 36, 0.8 + r() * 0.2, 0.45);
    g.restore();
  }
  // shade the underside
  const sh = g.createLinearGradient(0, kind === 'tower' ? 150 : 110, 0, 240);
  sh.addColorStop(0, 'rgba(60,40,25,0)');
  sh.addColorStop(1, 'rgba(60,40,25,0.4)');
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = sh;
  g.fillRect(0, 0, 256, 256);
  // feather the card's border (billows reaching the edge would otherwise end in a straight cut)
  g.globalCompositeOperation = 'destination-in';
  const fx = g.createLinearGradient(0, 0, 256, 0);
  fx.addColorStop(0, 'rgba(0,0,0,0)');
  fx.addColorStop(0.14, 'rgba(0,0,0,1)');
  fx.addColorStop(0.86, 'rgba(0,0,0,1)');
  fx.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = fx;
  g.fillRect(0, 0, 256, 256);
  const fy = g.createLinearGradient(0, 0, 0, 256);
  fy.addColorStop(0, 'rgba(0,0,0,0)');
  fy.addColorStop(0.12, 'rgba(0,0,0,1)');
  fy.addColorStop(0.9, 'rgba(0,0,0,1)');
  fy.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = fy;
  g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class JovianSky {
  readonly group = new THREE.Group();
  private puffs: Puff[] = [];
  private tex: THREE.Texture[] = [];
  private readonly R = 9000;
  private flash = 0;
  private flashT = 3;
  /** fired with a deep lightning flash (the zone plays thunder) */
  onFlash: ((at: THREE.Vector3) => void) | null = null;

  constructor(seed = 7) {
    const kinds: Kind[] = ['puff', 'tower', 'sheet'];
    const tex = new Map<Kind, THREE.Texture[]>();
    kinds.forEach((k, ki) => {
      const list: THREE.Texture[] = [];
      for (let i = 0; i < 3; i++) list.push(cloudTexture(seed * 31 + ki * 4271 + i * 977, k));
      tex.set(k, list);
      this.tex.push(...list);
    });
    const r = rng(seed * 7919);
    LAYERS.forEach((L, li) => {
      for (let i = 0; i < L.n; i++) {
        const kind = L.kinds[i % L.kinds.length];
        const set = tex.get(kind)!;
        const mat = new THREE.SpriteMaterial({ map: set[i % set.length], transparent: true, depthWrite: false, opacity: L.op, fog: true });
        const sp = new THREE.Sprite(mat);
        const size = L.size[0] + r() * (L.size[1] - L.size[0]);
        if (kind === 'tower') sp.scale.set(size * (1.3 + r() * 0.4), size * (1.5 + r() * 0.6), 1);
        else if (kind === 'sheet') sp.scale.set(size * (2.0 + r() * 1.0), size * (0.75 + r() * 0.3), 1);
        else sp.scale.set(size * (1.2 + r() * 0.6), size * (0.8 + r() * 0.3), 1);
        const a = r() * Math.PI * 2, d = Math.sqrt(r()) * this.R;
        const y = L.y[0] + r() * (L.y[1] - L.y[0]);
        sp.position.set(Math.cos(a) * d, y + sp.scale.y * 0.3, Math.sin(a) * d);
        sp.renderOrder = -1;
        this.group.add(sp);
        this.puffs.push({ s: sp, layer: li, base: new THREE.Color(...L.col).multiplyScalar(0.92 + r() * 0.16), y, op: L.op, size: Math.max(sp.scale.x, sp.scale.y) });
      }
    });
  }

  /** cam: camera position (local); light: daylight brightness 0..1 */
  update(dt: number, cam: THREE.Vector3, light: number) {
    const R = this.R;
    this.flashT -= dt;
    if (this.flashT < 0) {
      this.flashT = 2.5 + Math.random() * 7;
      this.flash = 1;
      const a = Math.random() * Math.PI * 2;
      this.onFlash?.(new THREE.Vector3(cam.x + Math.cos(a) * 4000, -4500, cam.z + Math.sin(a) * 4000));
    }
    this.flash = Math.max(0, this.flash - dt * (3 + Math.random() * 6));
    const fl = this.flash * (0.6 + 0.4 * Math.sin(this.flashT * 90));
    for (const p of this.puffs) {
      const o = p.s.position;
      let dx = o.x - cam.x, dz = o.z - cam.z;
      if (dx > R) o.x -= 2 * R;
      else if (dx < -R) o.x += 2 * R;
      if (dz > R) o.z -= 2 * R;
      else if (dz < -R) o.z += 2 * R;
      dx = o.x - cam.x;
      dz = o.z - cam.z;
      // thin out as the camera flies into it (a card filling the screen reads as a white wall, not as cloud)
      const d = Math.hypot(dx, o.y - cam.y, dz);
      const m = p.s.material as THREE.SpriteMaterial;
      m.opacity = p.op * THREE.MathUtils.smoothstep(d, p.size * 0.25, p.size * 0.8);
      p.s.visible = m.opacity > 0.01;
      const k = p.layer === 1 ? light * 0.85 + fl * 1.6 : p.layer === 0 ? light + fl * 0.25 : light * 1.05;
      m.color.copy(p.base).multiplyScalar(Math.max(0.03, k));
    }
  }

  dispose() {
    for (const p of this.puffs) (p.s.material as THREE.Material).dispose();
    for (const t of this.tex) t.dispose();
    this.group.removeFromParent();
  }
}
