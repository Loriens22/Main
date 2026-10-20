/**
 * Generates displacement maps that make a rounded rectangle behave like a thick convex glass slab:
 * near the rim the backdrop is bent inward (refraction), the flat center is left untouched.
 * Encoded for SVG feDisplacementMap: R = x offset, G = y offset, 128 = no displacement.
 */

const cache = new Map<string, string>();

function sdRoundRect(px: number, py: number, hw: number, hh: number, r: number): number {
  const qx = Math.abs(px) - (hw - r);
  const qy = Math.abs(py) - (hh - r);
  const ox = Math.max(qx, 0);
  const oy = Math.max(qy, 0);
  return Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - r;
}

export function displacementMap(width: number, height: number, radius: number, bezel: number): string {
  const w = Math.max(2, Math.round(width));
  const h = Math.max(2, Math.round(height));
  const r = Math.min(radius, w / 2, h / 2);
  const b = Math.max(2, Math.min(bezel, Math.min(w, h) / 2));
  const key = `${w}x${h}r${Math.round(r)}b${Math.round(b)}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  const d = img.data;
  const hw = w / 2;
  const hh = h / 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const px = x + 0.5 - hw;
      const py = y + 0.5 - hh;
      const sd = sdRoundRect(px, py, hw, hh, r);
      const inside = -sd;
      let dx = 0;
      let dy = 0;
      if (inside > 0 && inside < b) {
        // Outward normal from the SDF gradient.
        const gx = sdRoundRect(px + 0.5, py, hw, hh, r) - sdRoundRect(px - 0.5, py, hw, hh, r);
        const gy = sdRoundRect(px, py + 0.5, hw, hh, r) - sdRoundRect(px, py - 0.5, hw, hh, r);
        const len = Math.hypot(gx, gy) || 1;
        const t = inside / b; // 0 at rim → 1 at inner edge of the bezel
        // Slope of a squircle-profile surface: steep at the rim, flat inside.
        const mag = Math.pow(1 - t, 2.2);
        dx = (-gx / len) * mag;
        dy = (-gy / len) * mag;
      }
      const i = (y * w + x) * 4;
      d[i] = 128 + Math.round(dx * 127);
      d[i + 1] = 128 + Math.round(dy * 127);
      d[i + 2] = 128;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const url = canvas.toDataURL('image/png');
  if (cache.size > 80) cache.delete(cache.keys().next().value as string);
  cache.set(key, url);
  return url;
}
