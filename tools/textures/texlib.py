"""Procedural, tileable PBR texture synthesis helpers (numpy / scipy / PIL).

Every generator returns float arrays in [0, 1] of shape (n, n) or (n, n, 3).
All noise is periodic, so the results tile seamlessly.
"""
from __future__ import annotations

import math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage
from scipy.spatial import cKDTree

TAU = math.tau


# ----------------------------------------------------------------------------- basic noise
def _norm(x):
    lo, hi = float(x.min()), float(x.max())
    return (x - lo) / (hi - lo + 1e-12)


def fbm(n, beta=2.0, seed=0, fmin=1.0, fmax=None, aniso=(1.0, 1.0)):
    """Spectral 1/f^beta noise. Periodic. aniso stretches features (sx, sy)."""
    rng = np.random.default_rng(seed)
    fy = np.fft.fftfreq(n)[:, None] * n * aniso[1]
    fx = np.fft.fftfreq(n)[None, :] * n * aniso[0]
    f = np.sqrt(fx * fx + fy * fy)
    amp = np.where(f > 0, np.maximum(f, 1e-6) ** (-beta / 2.0), 0.0)
    amp[f < fmin] = 0.0
    if fmax is not None:
        amp[f > fmax] = 0.0
    ph = rng.uniform(0, TAU, (n, n))
    x = np.real(np.fft.ifft2(amp * np.exp(1j * ph)))
    return _norm(x)


def white(n, seed=0):
    return np.random.default_rng(seed).random((n, n))


def blur(x, sigma):
    if sigma <= 0:
        return x
    if x.ndim == 3:
        return np.stack([ndimage.gaussian_filter(x[..., c], sigma, mode="wrap") for c in range(x.shape[2])], -1)
    return ndimage.gaussian_filter(x, sigma, mode="wrap")


def voronoi(n, cells, seed=0, jitter=1.0):
    """Returns (f1, f2, cell_id) distances in units of average cell size. Periodic."""
    rng = np.random.default_rng(seed)
    g = int(round(math.sqrt(cells)))
    gx, gy = np.meshgrid(np.arange(g), np.arange(g))
    pts = np.stack([gx.ravel(), gy.ravel()], 1).astype(np.float64)
    pts += 0.5 + (rng.random(pts.shape) - 0.5) * jitter
    pts /= g
    pts %= 1.0
    tree = cKDTree(pts, boxsize=1.0)
    ys, xs = np.mgrid[0:n, 0:n]
    q = np.stack([(xs.ravel() + 0.5) / n, (ys.ravel() + 0.5) / n], 1)
    d, idx = tree.query(q, k=2)
    f1 = d[:, 0].reshape(n, n) * g
    f2 = d[:, 1].reshape(n, n) * g
    return f1, f2, idx[:, 0].reshape(n, n)


def cell_random(ids, seed=0):
    rng = np.random.default_rng(seed)
    table = rng.random(int(ids.max()) + 1)
    return table[ids]


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0 + 1e-12), 0, 1)
    return t * t * (3 - 2 * t)


def lerp(a, b, t):
    if np.ndim(a) == 3 or np.ndim(b) == 3:
        t = t[..., None] if np.ndim(t) == 2 else t
    return a * (1 - t) + b * t


def remap(x, lo, hi):
    return lo + x * (hi - lo)


def rgb(*c):
    if len(c) == 1 and isinstance(c[0], str):
        h = c[0].lstrip("#")
        c = tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
    return np.array(c, dtype=np.float64)


def solid(n, color):
    return np.ones((n, n, 3)) * rgb(*color) if not isinstance(color, np.ndarray) else np.ones((n, n, 3)) * color


def grid_uv(n):
    ys, xs = np.mgrid[0:n, 0:n]
    return (xs + 0.5) / n, (ys + 0.5) / n


# ----------------------------------------------------------------------------- drawing
def scratches(n, count, seed=0, length=(0.03, 0.25), width=1, angle=None, angle_spread=math.pi, blur_sigma=0.4):
    """Random thin line scratches, periodic. Returns mask in [0,1]."""
    rng = np.random.default_rng(seed)
    big = Image.new("L", (n * 3, n * 3), 0)
    d = ImageDraw.Draw(big)
    for _ in range(count):
        x, y = rng.random(2) * n
        a = (angle if angle is not None else 0.0) + (rng.random() - 0.5) * angle_spread
        ln = remap(rng.random() ** 2, *length) * n
        dx, dy = math.cos(a) * ln, math.sin(a) * ln
        v = int(remap(rng.random(), 90, 255))
        for ox in (0, n, 2 * n):
            for oy in (0, n, 2 * n):
                d.line((x + ox, y + oy, x + ox + dx, y + oy + dy), fill=v, width=width)
    crop = big.crop((n, n, 2 * n, 2 * n))
    m = np.asarray(crop, dtype=np.float64) / 255.0
    return blur(m, blur_sigma)


def draw_mask(n, fn, supersample=2):
    """fn(draw, N) draws white on black at N = n*supersample; returns [0,1] mask."""
    N = n * supersample
    im = Image.new("L", (N, N), 0)
    fn(ImageDraw.Draw(im), N)
    if supersample > 1:
        im = im.resize((n, n), Image.LANCZOS)
    return np.asarray(im, dtype=np.float64) / 255.0


def streaks(n, seed=0, strength=1.0, vertical=True, freq=0.02):
    """Rain/leak streaks: strongly anisotropic noise."""
    # A small aniso factor on an axis packs more high-frequency energy into it, so the
    # features end up elongated along the *other* axis.
    s = fbm(n, 1.8, seed, aniso=(0.035, 1.0) if vertical else (1.0, 0.035))
    return np.clip((s - 0.5) * 2.2 * strength + 0.5, 0, 1)


# ----------------------------------------------------------------------------- patterns
def tiles(n, nx, ny, gap=0.04, bevel=0.06, offset_rows=0.0, seed=0, jitter_color=True):
    """Rectangular tile/brick/panel layout.
    Returns dict(height, mask (1 inside tile, 0 in gap), rnd (per tile random), u, v (local 0..1))."""
    u, v = grid_uv(n)
    fy = v * ny
    row = np.floor(fy)
    fx = u * nx + offset_rows * (row % 2)
    col = np.floor(fx) % nx
    lu, lv = fx - np.floor(fx), fy - row
    du = np.minimum(lu, 1 - lu) * (1.0 / nx) * max(nx, ny)
    dv = np.minimum(lv, 1 - lv) * (1.0 / ny) * max(nx, ny)
    d = np.minimum(du, dv)
    mask = smoothstep(gap * 0.5, gap * 0.5 + 0.004 * max(nx, ny), d)
    height = smoothstep(gap * 0.5, gap * 0.5 + bevel, d)
    ids = (row * nx + col).astype(np.int64)
    rnd = cell_random(ids, seed)
    return dict(height=height, mask=mask, rnd=rnd, u=lu, v=lv, ids=ids, d=d)


def normal_from_height(h, strength=4.0):
    n = h.shape[0]
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 0.5 * n / 1024.0
    dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * 0.5 * n / 1024.0
    nx, ny, nz = -dx * strength, -dy * strength, np.ones_like(h)
    l = np.sqrt(nx * nx + ny * ny + nz * nz)
    # glTF / three.js convention: +Y up (OpenGL). Image rows go down, so flip Y.
    return np.stack([nx / l * 0.5 + 0.5, -ny / l * 0.5 + 0.5, nz / l * 0.5 + 0.5], -1)


def ao_from_height(h, radius=6.0, strength=1.0):
    b = blur(h, radius)
    return np.clip(1.0 - np.clip(b - h, 0, 1) * 4.0 * strength, 0, 1)


def grain(n, seed=0, scale=1.0, horizontal=True, ring=0.0):
    """Wood grain lines."""
    g = fbm(n, 1.1, seed, fmin=3, aniso=(1.0, 0.03 * scale) if horizontal else (0.03 * scale, 1.0))
    g2 = fbm(n, 2.2, seed + 7, aniso=(1.0, 0.12) if horizontal else (0.12, 1.0))
    return _norm(g * 0.55 + g2 * 0.45)


# ----------------------------------------------------------------------------- output
def to_img(x, mode=None):
    x = np.clip(x, 0, 1)
    a = (x * 255.0 + 0.5).astype(np.uint8)
    return Image.fromarray(a, mode) if mode else Image.fromarray(a)


def linear_to_srgb(x):
    x = np.clip(x, 0, 1)
    return np.where(x <= 0.0031308, x * 12.92, 1.055 * np.power(x, 1 / 2.4) - 0.055)


class TexSet:
    """A PBR texture set. albedo is authored directly in sRGB display values."""

    def __init__(self, name, n):
        self.name, self.n = name, n
        self.albedo = np.ones((n, n, 3)) * 0.5
        self.height = np.ones((n, n)) * 0.5
        self.rough = np.ones((n, n)) * 0.6
        self.metal = np.zeros((n, n))
        self.ao = None
        self.alpha = None
        self.emissive = None
        self.normal_strength = 4.0
        self.normal = None

    def save(self, out_dir, quality=86):
        import os
        os.makedirs(out_dir, exist_ok=True)
        n = self.n
        nrm = self.normal if self.normal is not None else normal_from_height(self.height, self.normal_strength)
        ao = self.ao if self.ao is not None else ao_from_height(self.height)
        orm = np.stack([ao, self.rough, self.metal], -1)
        alb = self.albedo
        if self.alpha is not None:
            rgba = np.concatenate([alb, self.alpha[..., None]], -1)
            to_img(rgba, "RGBA").save(f"{out_dir}/{self.name}_albedo.webp", quality=quality, method=4)
        else:
            to_img(alb).save(f"{out_dir}/{self.name}_albedo.webp", quality=quality, method=4)
        to_img(nrm).save(f"{out_dir}/{self.name}_normal.webp", quality=92, method=4)
        to_img(orm).save(f"{out_dir}/{self.name}_orm.webp", quality=quality, method=4)
        if self.emissive is not None:
            to_img(self.emissive).save(f"{out_dir}/{self.name}_emissive.webp", quality=quality, method=4)
        return self
