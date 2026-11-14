import * as THREE from 'three';

/**
 * A live display built into a physical object: a canvas drawn by gameplay code and shown on a quad placed at a
 * `screen` marker (marker frame: +X right, +Y up, +Z out of the glass).
 */
export class ScreenSurface {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
  mesh: THREE.Mesh;
  private timer = 0;
  on = true;
  /** redraw interval in seconds */
  interval = 0.2;

  constructor(parent: THREE.Object3D, w: number, h: number, public draw: (ctx: CanvasRenderingContext2D, W: number, H: number, s: ScreenSurface) => void, px = 512, brightness = 1.5) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = px;
    this.canvas.height = Math.max(16, Math.round((px * h) / w));
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
    const mat = new THREE.MeshBasicMaterial({ map: this.texture, toneMapped: false, color: new THREE.Color(brightness, brightness, brightness) });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    this.mesh.position.z = 0.002;
    parent.add(this.mesh);
    this.redraw();
  }

  redraw() {
    const { ctx, canvas } = this;
    if (!this.on) {
      ctx.fillStyle = '#020303';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    } else this.draw(ctx, canvas.width, canvas.height, this);
    this.texture.needsUpdate = true;
  }

  update(dt: number, visible = true) {
    this.timer -= dt;
    if (this.timer <= 0 && visible) {
      this.timer = this.interval;
      this.redraw();
    }
  }

  setOn(v: boolean) { if (v !== this.on) { this.on = v; this.redraw(); } }

  dispose() {
    this.mesh.parent?.remove(this.mesh);
    this.texture.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.geometry.dispose();
  }
}

/** Shared drawing helpers for the instrument look (thin lines, small caps, amber/cyan on near-black). */
export const scr = {
  bg(ctx: CanvasRenderingContext2D, W: number, H: number, c = '#05090b') { ctx.fillStyle = c; ctx.fillRect(0, 0, W, H); },
  text(ctx: CanvasRenderingContext2D, t: string, x: number, y: number, size = 16, color = '#cfe9e6', align: CanvasTextAlign = 'left', weight = '500') {
    ctx.font = `${weight} ${size}px "Helvetica Neue", Arial, sans-serif`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillText(t, x, y);
  },
  mono(ctx: CanvasRenderingContext2D, t: string, x: number, y: number, size = 16, color = '#cfe9e6', align: CanvasTextAlign = 'left') {
    ctx.font = `${size}px Menlo, Consolas, monospace`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillText(t, x, y);
  },
  bar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, f: number, color = '#7fd6cf', back = 'rgba(255,255,255,0.12)') {
    ctx.fillStyle = back;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w * Math.max(0, Math.min(1, f)), h);
  },
  frame(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color = 'rgba(160,220,215,0.35)') {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  },
};
