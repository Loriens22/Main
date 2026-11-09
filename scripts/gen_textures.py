"""
Procedural, tileable PBR texture generator (numpy + Pillow). Run with the Blender venv python:
    /home/user/blenv/bin/python scripts/gen_textures.py
Spectral synthesis (FFT-filtered noise) makes every texture seamlessly tileable.
Outputs to public/assets/textures/.
"""
import os, sys, json, math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public", "assets", "textures")
os.makedirs(OUT, exist_ok=True)
rng = np.random.default_rng(1977)


def spectral(n, beta=2.0, seed=None, lo=1.0, hi=None):
    r = np.random.default_rng(seed) if seed is not None else rng
    w = r.standard_normal((n, n))
    F = np.fft.fft2(w)
    fx = np.fft.fftfreq(n)[:, None] * n
    fy = np.fft.fftfreq(n)[None, :] * n
    f = np.sqrt(fx * fx + fy * fy)
    f[0, 0] = 1
    amp = 1.0 / f ** (beta / 2)
    amp[f < lo] = 0
    if hi is not None:
        amp[f > hi] = 0
    out = np.real(np.fft.ifft2(F * amp))
    out -= out.min()
    out /= max(out.max(), 1e-9)
    return out


def norm01(a):
    a = a - a.min()
    return a / max(a.max(), 1e-9)


def save_rgb(name, arr, q=90):
    a = np.clip(arr * 255, 0, 255).astype(np.uint8)
    Image.fromarray(a, "RGB").save(os.path.join(OUT, name), quality=q)
    print("wrote", name, a.shape)


def save_rgba(name, arr):
    a = np.clip(arr * 255, 0, 255).astype(np.uint8)
    Image.fromarray(a, "RGBA").save(os.path.join(OUT, name))
    print("wrote", name, a.shape)


def height_to_normal(h, strength=2.0):
    """Tileable normal map from a height field (wrap-around gradients)."""
    dx = (np.roll(h, -1, axis=1) - np.roll(h, 1, axis=1)) * strength
    dy = (np.roll(h, -1, axis=0) - np.roll(h, 1, axis=0)) * strength
    nz = np.ones_like(h)
    n = np.stack([-dx, dy, nz], axis=-1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return n * 0.5 + 0.5


def stack(*ch):
    return np.stack(ch, axis=-1)


N = 1024

# ------------------------------------------------------------------ weathering masks
def grime():
    big = spectral(N, 2.6, 1, lo=1)
    mid = spectral(N, 2.0, 2, lo=3)
    fine = spectral(N, 1.2, 3, lo=8)
    dirt = norm01(np.clip((big * 0.6 + mid * 0.4 - 0.45) * 2.2, 0, 1))
    # scratches: random thin lines
    img = Image.new("L", (N, N), 0)
    d = ImageDraw.Draw(img)
    r = np.random.default_rng(5)
    for _ in range(900):
        x, y = r.uniform(0, N, 2)
        a = r.uniform(0, math.pi)
        L = r.uniform(8, 70)
        for ox in (-N, 0, N):
            for oy in (-N, 0, N):
                d.line([(x + ox, y + oy), (x + ox + math.cos(a) * L, y + oy + math.sin(a) * L)], fill=int(r.uniform(90, 255)), width=1)
    sc = np.asarray(img, dtype=np.float32) / 255
    save_rgb("grime.jpg", stack(dirt, fine, sc))
    # vertical rain streaks + edge-ish blotches
    s = spectral(N, 2.0, 9, lo=2)
    streak = np.zeros((N, N))
    r = np.random.default_rng(11)
    for _ in range(420):
        x = int(r.uniform(0, N)); y0 = int(r.uniform(0, N)); L = int(r.uniform(40, 380)); w = int(r.uniform(1, 4))
        v = r.uniform(0.3, 1.0)
        ys = (np.arange(L) + y0) % N
        fade = np.linspace(1, 0, L) ** 1.5 * v
        for k in range(w):
            streak[ys, (x + k) % N] = np.maximum(streak[ys, (x + k) % N], fade)
    streak = np.asarray(Image.fromarray((streak * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2)), dtype=np.float32) / 255
    save_rgb("streaks.jpg", stack(norm01(streak), s, spectral(N, 1.5, 12, lo=4)))


# ------------------------------------------------------------------ hard-surface detail normals
def panels():
    """Irregular aerospace panel seams + rivet lines (2 m tile)."""
    h = np.zeros((N, N), np.float32)
    img = Image.new("L", (N, N), 255)
    d = ImageDraw.Draw(img)
    r = np.random.default_rng(21)
    # recursive splitting into rectangles
    rects = [(0, 0, N, N)]
    out = []
    while rects:
        x0, y0, x1, y1 = rects.pop()
        w, hh = x1 - x0, y1 - y0
        if (w < 180 and hh < 180) or (w * hh < 30000 and r.random() < 0.4):
            out.append((x0, y0, x1, y1))
            continue
        if w > hh:
            c = int(x0 + w * r.uniform(0.3, 0.7)); rects += [(x0, y0, c, y1), (c, y0, x1, y1)]
        else:
            c = int(y0 + hh * r.uniform(0.3, 0.7)); rects += [(x0, y0, x1, c), (x0, c, x1, y1)]
    for (x0, y0, x1, y1) in out:
        d.rectangle([x0, y0, x1, y1], outline=0, width=3)
        if r.random() < 0.5:
            for t in np.arange(x0 + 12, x1 - 6, 14):
                d.ellipse([t - 2, y0 + 7, t + 2, y0 + 11], fill=170)
                d.ellipse([t - 2, y1 - 11, t + 2, y1 - 7], fill=170)
    seam = np.asarray(img.filter(ImageFilter.GaussianBlur(1.0)), dtype=np.float32) / 255
    h = seam + spectral(N, 2.4, 22, lo=2) * 0.08
    save_rgb("panel_n.jpg", height_to_normal(h, 3.0))
    save_rgb("panel_ao.jpg", stack(seam, seam, seam))


def fabric():
    x = np.arange(N)
    X, Y = np.meshgrid(x, x)
    f = 2 * math.pi * 64 / N
    warp = np.sin(X * f) * (np.sin(Y * f * 0.5) > 0)
    weft = np.sin(Y * f) * (np.sin(X * f * 0.5) <= 0)
    h = (warp + weft) * 0.5 + spectral(N, 1.0, 31, lo=20) * 0.4
    save_rgb("fabric_n.jpg", height_to_normal(norm01(h), 1.2))


def quilt():
    """Diamond-quilted padding (Endurance blue pads / Ranger ceiling tiles)."""
    x = np.arange(N) / N
    X, Y = np.meshgrid(x, x)
    k = 8
    u = (X + Y) * k; v = (X - Y) * k
    du = np.abs(np.fmod(u, 1.0) - 0.5); dv = np.abs(np.fmod(v + 100, 1.0) - 0.5)
    h = np.minimum(du, dv) * 2
    h = np.sqrt(np.clip(h, 0, 1)) + spectral(N, 1.4, 41, lo=8) * 0.1
    save_rgb("quilt_n.jpg", height_to_normal(h, 6.0))


def ribbed():
    y = np.arange(N) / N
    Y = np.tile(y[:, None], (1, N))
    h = np.abs(np.sin(Y * math.pi * 16)) ** 0.5 + spectral(N, 1.2, 51, lo=10) * 0.08
    save_rgb("ribbed_n.jpg", height_to_normal(h, 5.0))


def tiles():
    """Small white ceramic tiles 0.1 m (cryo bay / medical, image 13)."""
    x = np.arange(N) / N
    X, Y = np.meshgrid(x, x)
    k = 16
    fx = np.fmod(X * k, 1.0); fy = np.fmod(Y * k, 1.0)
    gx = np.minimum(fx, 1 - fx); gy = np.minimum(fy, 1 - fy)
    grout = np.clip(np.minimum(gx, gy) / 0.04, 0, 1)
    h = np.sqrt(grout)
    cell = (np.floor(X * k) * 7 + np.floor(Y * k) * 13) % 17 / 17
    dirt = spectral(N, 2.2, 61, lo=1)
    alb = 0.82 + cell * 0.05 - (1 - grout) * 0.35 - dirt * 0.08
    save_rgb("tile_a.jpg", stack(alb, alb, alb * 0.98))
    save_rgb("tile_n.jpg", height_to_normal(h + spectral(N, 1.2, 62, lo=30) * 0.03, 4))


def concrete():
    a = spectral(N, 2.4, 71, lo=1); b = spectral(N, 1.4, 72, lo=6); c = spectral(N, 1.0, 73, lo=40)
    pores = (spectral(N, 0.6, 74, lo=60) > 0.82).astype(np.float32)
    v = 0.48 + (a - 0.5) * 0.14 + (b - 0.5) * 0.08 + (c - 0.5) * 0.05 - pores * 0.12
    # formwork tie holes / board lines
    lines = (np.abs(np.fmod(np.arange(N)[:, None] / N * 4, 1.0) - 0.5) < 0.004).astype(np.float32)
    v = v - np.tile(lines, (1, N)) * 0.05
    save_rgb("concrete_a.jpg", stack(v, v * 0.99, v * 0.96))
    save_rgb("concrete_n.jpg", height_to_normal(b * 0.5 + c * 0.5 - pores * 0.4, 1.5))


def wood_siding():
    """Weathered clapboard: 8 boards per tile (1.6 m), peeling pale paint (images 1-2)."""
    yy = np.arange(N)[:, None] / N
    board = np.fmod(yy * 8, 1.0)
    profile = 1 - board * 0.9           # lap shadow: thick bottom edge
    profile = np.tile(profile, (1, N))
    grain = spectral(N, 1.0, 81, lo=4)
    grain = norm01(np.repeat(spectral(N, 1.6, 82, lo=2)[:, ::8], 8, axis=1)) * 0.5 + grain * 0.5
    peel = spectral(N, 2.2, 83, lo=2)
    peel = (peel > 0.78).astype(np.float32)
    peel = np.asarray(Image.fromarray((peel * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.5)), dtype=np.float32) / 255
    paint = np.array([0.86, 0.85, 0.80]); bare = np.array([0.55, 0.50, 0.43])
    base = paint[None, None, :] * (0.9 + grain[..., None] * 0.12) * (1 - peel[..., None]) + bare[None, None, :] * peel[..., None] * (0.7 + grain[..., None] * 0.5)
    shade = np.clip(0.72 + 0.28 * np.tile(board, (1, N)) ** 0.25, 0, 1)
    dirt = spectral(N, 2.5, 84, lo=1)
    base *= shade[..., None] * (1 - dirt[..., None] * 0.06)
    save_rgb("wood_siding_a.jpg", base)
    save_rgb("wood_siding_n.jpg", height_to_normal(profile * 0.6 + grain * 0.05 + peel * 0.03, 3.0))


def wood_floor():
    x = np.arange(N) / N
    X, Y = np.meshgrid(x, x)
    plank = np.floor(X * 8)
    off = (plank * 0.37) % 1.0
    seg = np.floor(np.fmod(Y + off, 1.0) * 2)
    seed = (plank * 3 + seg) % 9 / 9
    grain = np.sin((X * 8 * 40 + spectral(N, 2.0, 91, lo=2) * 6) * 1.0) * 0.5 + 0.5
    gap = (np.minimum(np.fmod(X * 8, 1.0), 1 - np.fmod(X * 8, 1.0)) < 0.012) | (np.abs(np.fmod(Y + off, 0.5) - 0.0) < 0.003)
    c = np.array([0.45, 0.31, 0.19])
    alb = c[None, None, :] * (0.75 + seed[..., None] * 0.35 + grain[..., None] * 0.12)
    alb[gap] *= 0.4
    save_rgb("wood_floor_a.jpg", alb)
    save_rgb("wood_floor_n.jpg", height_to_normal(grain * 0.1 - gap * 0.6, 2.0))


def brushed():
    s = spectral(N, 1.0, 101, lo=2)
    streak = np.repeat(np.mean(s, axis=0, keepdims=True), N, axis=0) * 0.6 + spectral(N, 1.6, 102, lo=4) * 0.4
    save_rgb("brushed.jpg", stack(norm01(streak), norm01(streak), norm01(streak)))


def rust():
    a = spectral(N, 2.2, 111, lo=1); b = spectral(N, 1.2, 112, lo=8)
    m = np.clip((a * 0.7 + b * 0.3 - 0.35) * 2.5, 0, 1)
    c1 = np.array([0.42, 0.18, 0.07]); c2 = np.array([0.22, 0.10, 0.05]); c3 = np.array([0.55, 0.32, 0.15])
    col = c1[None, None] * (1 - b[..., None]) + c2[None, None] * b[..., None]
    col = col * (1 - a[..., None] * 0.3) + c3[None, None] * (a[..., None] * 0.3)
    save_rgb("rust_a.jpg", col)
    save_rgb("rust_mask.jpg", stack(m, b, a))


def grate():
    x = np.arange(N) / N
    X, Y = np.meshgrid(x, x)
    k = 32
    fx = np.fmod(X * k, 1.0); fy = np.fmod(Y * k, 1.0)
    hole = (np.abs(fx - 0.5) < 0.32) & (np.abs(fy - 0.5) < 0.2)
    a = np.where(hole, 0.0, 1.0)
    rgb = np.ones((N, N, 3)) * 0.8
    save_rgba("grate.png", np.dstack([rgb, a]))


def hexmesh():
    """Purple-gray hex mesh panels (Lander, image 22)."""
    x = np.arange(N) / N
    X, Y = np.meshgrid(x, x)
    s = 24
    q = X * s; r = Y * s / math.sin(math.pi / 3)
    # axial hex distance
    rx = q - r * 0.5
    def hexd(a, b):
        cx = np.round(a); cy = np.round(b)
        dx = a - cx; dy = b - cy
        return np.maximum(np.abs(dx), np.maximum(np.abs(dy), np.abs(dx + dy)))
    d1 = hexd(rx, r)
    h = np.clip(1 - d1 * 2.2, 0, 1) ** 0.5
    save_rgb("hexmesh_n.jpg", height_to_normal(h, 4.0))


def nets():
    x = np.arange(512) / 512
    X, Y = np.meshgrid(x, x)
    k = 10
    u = np.fmod((X + Y) * k, 1.0); v = np.fmod((X - Y + 2) * k, 1.0)
    line = (np.minimum(u, 1 - u) < 0.05) | (np.minimum(v, 1 - v) < 0.05)
    a = line.astype(np.float32)
    rgb = np.ones((512, 512, 3)) * 0.12
    save_rgba("net.png", np.dstack([rgb, a]))


# ------------------------------------------------------------------ terrain detail (≈4 m tiles)
def terrain():
    def mat(name, base, var, seeds, nscale=1.5, rough=None):
        a = spectral(N, 2.2, seeds[0], lo=1); b = spectral(N, 1.2, seeds[1], lo=8); c = spectral(N, 0.8, seeds[2], lo=40)
        v = (a - 0.5) * var[0] + (b - 0.5) * var[1] + (c - 0.5) * var[2]
        col = np.array(base)[None, None, :] * (1 + v[..., None])
        save_rgb(f"{name}_a.jpg", col)
        save_rgb(f"{name}_n.jpg", height_to_normal(a * 0.2 + b * 0.5 + c * 0.6, nscale))
    mat("soil", [0.36, 0.29, 0.21], (0.35, 0.25, 0.2), (201, 202, 203), 2.0)
    mat("drygrass", [0.42, 0.38, 0.24], (0.3, 0.35, 0.3), (211, 212, 213), 2.5)
    mat("rock", [0.40, 0.38, 0.35], (0.4, 0.35, 0.2), (221, 222, 223), 4.0)
    mat("sand", [0.62, 0.52, 0.40], (0.2, 0.15, 0.1), (231, 232, 233), 1.2)
    mat("ice", [0.80, 0.84, 0.88], (0.12, 0.1, 0.05), (241, 242, 243), 1.5)
    mat("seabed", [0.42, 0.42, 0.38], (0.25, 0.2, 0.15), (251, 252, 253), 1.5)
    # gravel: pebbles via voronoi-ish dots
    r = np.random.default_rng(261)
    img = Image.new("L", (N, N), 60)
    d = ImageDraw.Draw(img)
    for _ in range(9000):
        x, y = r.uniform(0, N, 2); rad = r.uniform(2, 7); v = int(r.uniform(90, 230))
        for ox in (-N, 0, N):
            for oy in (-N, 0, N):
                d.ellipse([x + ox - rad, y + oy - rad, x + ox + rad, y + oy + rad * 0.8], fill=v)
    g = np.asarray(img.filter(ImageFilter.GaussianBlur(0.8)), dtype=np.float32) / 255
    col = np.stack([0.30 + g * 0.35, 0.28 + g * 0.32, 0.25 + g * 0.28], -1)
    save_rgb("gravel_a.jpg", col)
    save_rgb("gravel_n.jpg", height_to_normal(g, 3.0))
    # asphalt
    a = spectral(N, 0.8, 271, lo=30); b = spectral(N, 2.0, 272, lo=2)
    v = 0.10 + (a - 0.5) * 0.06 + (b - 0.5) * 0.04
    save_rgb("asphalt_a.jpg", stack(v, v, v * 1.02))
    save_rgb("asphalt_n.jpg", height_to_normal(a, 1.0))
    # corn canopy (top-down, rows) for distant fields
    yy = np.arange(N)[:, None] / N
    rows = 0.5 + 0.5 * np.cos(yy * 2 * math.pi * 16)
    leaves = spectral(N, 1.1, 281, lo=12)
    gcol = np.array([0.24, 0.34, 0.11]); dcol = np.array([0.10, 0.14, 0.05])
    m = np.clip(rows * 0.6 + leaves * 0.7 - 0.3, 0, 1)
    col = dcol[None, None] * (1 - m[..., None]) + gcol[None, None] * m[..., None] * (0.8 + spectral(N, 2.0, 282, lo=2)[..., None] * 0.4)
    save_rgb("corn_canopy_a.jpg", col)


def clapboard():
    """Weathered painted clapboard for real 3D lap boards (farmhouse, images 1-2). Tile = 32 boards x 0.115 m
    exposure = 3.68 m square (large tile so the peel pattern does not visibly repeat); rows are aligned with the geometry's global course grid (z = k * 0.115 m).
    Image rows increase with world height (glTF V flip + three.js flipY), so each board's butt edge is the
    top row of its band. Paint peels along the grain and stops at board edges; bare wood is silver-grey."""
    n = 2048
    K = 32
    R = n / K
    rows = np.arange(n)
    band = np.floor(rows / R).astype(int)
    inband = (rows / R) - band                      # 0 at butt (bottom edge in world), 1 at top
    r = np.random.default_rng(1101)
    board_tone = r.uniform(-0.035, 0.035, K)[band][:, None]
    board_peel = r.uniform(0.0, 1.0, K)[band][:, None]
    # grain: noise stretched strongly along the board (x)
    g1 = spectral(n, 1.4, 1102, lo=2)
    g2 = spectral(n, 1.0, 1103, lo=6)
    grain = norm01(np.repeat(g1[::16, :], 16, axis=0)) * 0.5 + g2 * 0.5
    streak = norm01(np.repeat(spectral(n, 1.2, 1104, lo=3)[::32, :], 32, axis=0))
    # peel mask: horizontally stretched blobs, more on some boards, biased toward the lower half of boards
    pn = spectral(n, 2.0, 1105, lo=2)
    pn = np.asarray(Image.fromarray((pn * 255).astype(np.uint8)).resize((n // 10, n)).resize((n, n), Image.BILINEAR), dtype=np.float32) / 255
    pn2 = spectral(n, 1.6, 1106, lo=6)
    thr = 0.63 - board_peel * 0.2 + (inband[:, None] * 0.05)
    peel = np.clip(((pn * 0.75 + pn2 * 0.25) - thr) * 14, 0, 1)
    peel = np.asarray(Image.fromarray((peel * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8)), dtype=np.float32) / 255
    edge = np.clip(peel * (1 - peel) * 4, 0, 1)    # lifted paint rim
    paint = np.array([0.84, 0.835, 0.79])
    bare = np.array([0.63, 0.61, 0.57])
    p = paint[None, None, :] * (0.93 + grain[..., None] * 0.07 + board_tone[..., None])
    b = bare[None, None, :] * (0.80 + grain[..., None] * 0.30 + streak[..., None] * 0.1)
    # chalky thinning paint: grain shows through as grey streaks before the paint is fully gone
    thin = np.clip((streak * 0.6 + pn2 * 0.4 - 0.4) * 2.0, 0, 1)[..., None] * (0.35 + grain[..., None] * 0.65)
    p = p * (1 - thin * 0.42) + b * thin * 0.42
    col = p * (1 - peel[..., None]) + b * peel[..., None]
    col *= (1 - edge[..., None] * 0.18)
    # dirt in the lap shadow just under each butt (top of each band) and broad grime
    lap = np.exp(-inband * 22)[:, None]
    big = spectral(n, 2.6, 1107, lo=1)
    col *= (1 - lap[..., None] * 0.22) * (1 - big[..., None] * 0.08)
    save_rgb("clapboard_a.jpg", col)
    # normal: grain relief on bare wood, paint thickness step, slight cupping of each board
    cup = (np.sin(inband * math.pi) * 0.25)[:, None] * np.ones((1, n))
    h = cup + (1 - peel) * 0.18 + grain * 0.05 * (0.4 + peel)
    save_rgb("clapboard_n.jpg", height_to_normal(h, 3.0))


def shingles():
    """Three-tab asphalt shingles. Tile = 1.0 m (u) x 8 courses x 0.14 m (v = 1.12 m); the roof generator writes
    explicit UVs u = s / 1.0, v = up-slope / 1.12 so courses line up with geometry. Butt edge = top row of a band.
    Writes a dark weathered variant (main roof) and a dust-covered variant (wing and porch roofs, image 2)."""
    n = 1024
    K = 8
    R = n // K
    r = np.random.default_rng(1201)
    X = np.arange(n)[None, :].repeat(n, 0)
    Y = np.arange(n)[:, None].repeat(n, 1)
    band = Y // R
    vin = (Y - band * R) / R                         # 0 at butt edge, 1 at the top of the exposure
    tabw = n / 3.0
    offs = np.array([(k % 2) * 0.5 + r.uniform(-0.08, 0.08) for k in range(K)]) * tabw
    xs = (X + offs[band]) % n
    tab = np.floor(xs / tabw).astype(int)
    fx = (xs / tabw) - tab
    slot = (np.minimum(fx, 1 - fx) * tabw < 2.6) & (vin < 0.86)
    # one full shingle per metre: a butt joint where the 3rd tab ends (same as a slot)
    tid = band * 7 + tab
    tone = r.uniform(-1, 1, K * 7 + 8)[tid]
    granule = spectral(n, 0.35, 1202, lo=200)
    mott = spectral(n, 2.3, 1203, lo=1)
    mott2 = spectral(n, 1.6, 1204, lo=4)
    base = 0.215 + tone * 0.026 + (mott - 0.5) * 0.10 + (mott2 - 0.5) * 0.05 + (granule - 0.5) * 0.05
    # occasional granule-loss / stained tabs (lighter) and a few missing tabs (black felt)
    stain = r.uniform(0, 1, K * 7 + 8)[tid]
    base = np.where(stain > 0.9, base + 0.05 + (mott - 0.5) * 0.08, base)
    missing = stain < 0.025
    shadow = np.exp(-vin * 18) * 0.55                 # under the course above (at the butt line)
    v = base * (1 - shadow)
    v = np.where(slot, 0.035, v)
    v = np.where(missing & (vin < 0.92), 0.05 + granule * 0.02, v)
    col = np.stack([v * 1.0, v * 0.985, v * 0.96], -1)
    save_rgb("shingle_a.jpg", col)
    # dusty variant: fine sand settles in slots, along butt lines and in broad drifts
    dn = spectral(n, 2.2, 1205, lo=1)
    dust = np.clip(0.55 + (dn - 0.5) * 0.9 + np.exp(-vin * 10) * 0.2 + slot * 0.3 + (granule - 0.5) * 0.25, 0, 1)
    dcol = np.array([0.60, 0.555, 0.48])
    col2 = col * (1 - dust[..., None] * 0.9) + dcol[None, None] * (0.86 + mott2[..., None] * 0.22) * dust[..., None] * 0.9
    col2 *= (1 - np.exp(-vin * 18)[..., None] * 0.25)
    save_rgb("shingle_dusty_a.jpg", col2)
    h = (1 - vin) * 0.35 * (~slot) + granule * 0.08 - slot * 0.2
    save_rgb("shingle_n.jpg", height_to_normal(h.astype(np.float32), 2.5))


def wood_weathered():
    """Silver-grey sun-weathered boards (porch deck, skirt, rafters, steps). Tile 1 m; grain runs along V
    (vertical in the image) — deck boards and rafters run along the box-projected V axis."""
    n = 1024
    r = np.random.default_rng(1301)
    x = np.arange(n)
    plank = (x // (n // 10))                                  # ~0.1 m board widths across U
    ptone = r.uniform(-0.06, 0.06, 12)[plank][None, :]
    g = spectral(n, 1.2, 1302, lo=3)
    grain = norm01(np.repeat(g[:, ::1][::64, :], 64, axis=0))   # stretched along V
    fine = norm01(np.repeat(spectral(n, 0.8, 1303, lo=20)[::16, :], 16, axis=0))
    knots = (spectral(n, 1.0, 1304, lo=30) > 0.86).astype(np.float32)
    knots = np.asarray(Image.fromarray((knots * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(2.0)), dtype=np.float32) / 255
    base = np.array([0.50, 0.48, 0.44])
    v = 0.78 + grain * 0.18 + fine * 0.1 - knots * 0.25 + ptone
    stain = spectral(n, 2.4, 1305, lo=1)
    col = base[None, None, :] * v[..., None] * (1 - stain[..., None] * 0.15)
    col = col * np.array([1.0, 0.99, 0.97])[None, None, :] + np.array([0.02, 0.015, 0.0])[None, None, :] * grain[..., None]
    save_rgb("wood_weathered_a.jpg", col)
    save_rgb("wood_weathered_n.jpg", height_to_normal(grain * 0.4 + fine * 0.25 - knots * 0.3, 2.5))


def _branch_card(name, seed, kind):
    """Needle sprig on transparent background for branch cards. U runs from the trunk (left) to the tip (right),
    V across the branch. Drawn at 2x and downsampled for anti-aliasing."""
    W, H, S = 512, 256, 2
    r = np.random.default_rng(seed)
    img = Image.new("RGBA", (W * S, H * S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    cy = H * S / 2

    def needle_col(dark=False):
        if kind == "pine":
            g = r.uniform(0.24, 0.36); return (int(255 * g * 0.6), int(255 * g), int(255 * g * 0.42), 255)
        g = r.uniform(0.17, 0.30) * (0.7 if dark else 1.0)
        return (int(255 * g * 0.55), int(255 * g), int(255 * g * 0.62), 255)

    def stem_pts(x0, y0, ang, L, curv):
        pts = []
        n = max(4, int(L / 6))
        for i in range(n + 1):
            t = i / n
            a = ang + curv * t
            if i == 0:
                pts.append((x0, y0)); continue
            px, py = pts[-1]
            pts.append((px + math.cos(a) * L / n, py + math.sin(a) * L / n))
        return pts

    def needles_along(pts, nl, spread, step, width, dark=False):
        for i in range(1, len(pts)):
            (ax, ay), (bx, by) = pts[i - 1], pts[i]
            seg = math.hypot(bx - ax, by - ay)
            ang = math.atan2(by - ay, bx - ax)
            k = 0.0
            while k < seg:
                px, py = ax + (bx - ax) * k / seg, ay + (by - ay) * k / seg
                for side in (-1, 1):
                    a = ang + side * spread * r.uniform(0.75, 1.15)
                    L = nl * r.uniform(0.7, 1.15)
                    d.line([(px, py), (px + math.cos(a) * L, py + math.sin(a) * L)], fill=needle_col(dark), width=width)
                k += step * r.uniform(0.7, 1.3)

    main = stem_pts(6, cy, r.uniform(-0.05, 0.05), W * S * 0.96, r.uniform(-0.1, 0.1))
    shoots = []
    x = 30 * S
    side = 1
    while x < W * S * 0.9:
        t = x / (W * S)
        idx = min(len(main) - 1, int(t * (len(main) - 1)))
        bx, by = main[idx]
        L = (1 - t) * H * S * 0.42 + 18 * S
        shoots.append(stem_pts(bx, by, side * r.uniform(0.6, 0.95), L, -side * r.uniform(0.1, 0.4)))
        x += r.uniform(22, 34) * S * (1 - 0.4 * t)
        side = -side
    if kind == "pine":
        # long needles in tufts at the ends of the shoots, bare-ish twigs
        for pts in [main] + shoots:
            d.line(pts, fill=(78, 56, 40, 255), width=3 * S)
        for pts in shoots + [main]:
            for j in range(int(len(pts) * 0.5), len(pts), 2):
                px, py = pts[j]
                for q in range(6):
                    a = r.uniform(0, 2 * math.pi)
                    L = r.uniform(16, 30) * S
                    d.line([(px, py), (px + math.cos(a) * L, py + math.sin(a) * L * 0.8)], fill=needle_col(), width=2 * S)
    else:
        for pts in shoots + [main]:      # dark under-layer for volume
            needles_along(pts, 11 * S, 1.0, 3 * S, 4 * S, dark=True)
        for pts in [main] + shoots:
            d.line(pts, fill=(70, 52, 38, 255), width=3 * S)
        for pts in shoots + [main]:
            needles_along(pts, 10 * S, 0.9, 2.2 * S, 2 * S)
    img = img.resize((W, H), Image.LANCZOS)
    # bleed colour into transparent texels so mipmaps don't darken edges
    a = np.asarray(img, dtype=np.float32) / 255
    rgb = a[..., :3]
    al = a[..., 3:4]
    blur = np.asarray(Image.fromarray((rgb * al * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(6)), dtype=np.float32) / 255
    wb = np.asarray(Image.fromarray((al[..., 0] * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(6)), dtype=np.float32)[..., None] / 255
    fill = blur / np.maximum(wb, 1e-3)
    out = np.concatenate([rgb * al + fill * (1 - al), al], -1)
    save_rgba(name, out)


def trees():
    _branch_card("conifer_branch_rgba.png", 1401, "spruce")
    _branch_card("pine_branch_rgba.png", 1402, "pine")
    # spruce/fir bark: vertical scaly plates (tile 1 m x 2 m)
    n = 512
    x = np.arange(n)
    furrow = spectral(n, 1.6, 1403, lo=3)
    furrow = norm01(np.repeat(furrow[::64, :], 64, axis=0) * 0.7 + spectral(n, 1.2, 1404, lo=10) * 0.3)
    plates = spectral(n, 1.0, 1405, lo=16)
    h = furrow * 0.7 + plates * 0.3
    col = np.array([0.33, 0.27, 0.22])[None, None] * (0.55 + h[..., None] * 0.6)
    save_rgb("bark_a.jpg", col)
    save_rgb("bark_n.jpg", height_to_normal(h, 4.0))
    # ponderosa bark: orange-brown puzzle plates with dark crevices
    cr = spectral(n, 1.4, 1406, lo=6)
    cells = np.abs(np.sin(cr * 18.0))
    crev = (cells < 0.18).astype(np.float32)
    crev = np.asarray(Image.fromarray((crev * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.5)), dtype=np.float32) / 255
    base = np.array([0.46, 0.33, 0.25])[None, None] * (0.8 + spectral(n, 1.6, 1407, lo=4)[..., None] * 0.35)
    col = base * (1 - crev[..., None] * 0.75)
    save_rgb("bark_pine_a.jpg", col)
    save_rgb("bark_pine_n.jpg", height_to_normal(1 - crev + plates * 0.2, 4.0))


def noise_rgba():
    """Generic tileable noise for shaders (clouds, water, dust, terrain variation)."""
    n = 512
    a = spectral(n, 2.4, 301, lo=1); b = spectral(n, 1.8, 302, lo=2); c = spectral(n, 1.2, 303, lo=4); d = spectral(n, 2.0, 304, lo=1)
    save_rgba("noise.png", stack(a, b, c, d))


if __name__ == "__main__":
    only = [a for a in sys.argv[1:]]
    if only:
        for nm in only:
            globals()[nm]()
        sys.exit(0)
    for fn in (clapboard, shingles, wood_weathered, trees, grime, panels, fabric, quilt, ribbed, tiles, concrete, wood_siding, wood_floor, brushed, rust, grate,
               hexmesh, nets, terrain, noise_rgba):
        fn()
