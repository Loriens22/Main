#!/usr/bin/env python3
"""Derive film textures from the 19 numbered references + procedural PBR maps.

Run:  python3 scripts/refs/prepare_textures.py [--debug]
Outputs into public/assets/textures/.  Deterministic (seeded).
"""
import sys, os, math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont
from scipy import ndimage

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
REF = os.path.join(ROOT, 'references')
OUT = os.path.join(ROOT, 'public', 'assets', 'textures')
DEBUG = '--debug' in sys.argv
rng = np.random.default_rng(20261104)


def ref(n):
    for ext in ('jpg', 'png', 'webp'):
        p = os.path.join(REF, f'reference_{n:02d}.{ext}')
        if os.path.exists(p):
            return Image.open(p).convert('RGBA')
    raise FileNotFoundError(n)


def save(img, rel, q=90):
    p = os.path.join(OUT, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    if rel.endswith('.jpg'):
        img.convert('RGB').save(p, quality=q, optimize=True, progressive=True)
    else:
        img.save(p, optimize=True)
    return p

# ---------------------------------------------------------------------------
# 1. Screen wallpapers / cover displays  (ref number, crop box, output size)
#    Inner display aspect ratios follow the official panel sizes.
# ---------------------------------------------------------------------------
SCREENS = {
    # name: (ref, (l, t, r, b), (w, h))
    'fold1_inner': (4, (34, 40, 368, 588), (768, 1076)),
    'fold1_cover': (3, (394, 26, 628, 730), (420, 1000)),
    'fold2_inner': (6, (262, 82, 1332, 1514), (896, 1120)),
    'fold2_cover': (5, (442, 104, 680, 752), (420, 1000)),
    'fold3_inner': (8, (100, 26, 700, 774), (896, 1110)),
    'fold3_cover': (7, (780, 316, 1102, 1186), (420, 1000)),
    'fold4_cover': (9, (552, 36, 860, 920), (420, 1000)),
    'fold5_cover': (10, (312, 40, 521, 562), (420, 1000)),
    'fold6_cover': (11, (362, 92, 486, 474), (420, 1000)),
    'fold7_cover': (12, (398, 168, 590, 610), (480, 980)),
    'fold7_inner': (13, (110, 56, 890, 950), (960, 1100)),
    'matext_inner': (15, (190, 200, 606, 505), (1400, 1000)),
    'matext2_inner': (19, (84, 174, 716, 626), (1400, 1000)),
    'matext2_cover': (18, (604, 60, 858, 592), (440, 1000)),
    'matext2_brocade_ref': (18, (58, 52, 284, 590), (440, 1040)),
}


def build_screens(dbg):
    for name, (n, box, size) in SCREENS.items():
        im = ref(n)
        if dbg is not None:
            dbg.setdefault(n, []).append((name, box))
        c = im.crop(box).convert('RGB').resize(size, Image.LANCZOS)
        save(c, f'screens/{name}.jpg', q=92)
    m = np.asarray(Image.open(os.path.join(OUT, 'screens/matext_inner.jpg'))).astype(np.float32)
    colmean = m.mean(axis=(0, 2))
    smooth = ndimage.median_filter(colmean, 61)
    bad = colmean < smooth * 0.8
    bad = ndimage.binary_dilation(bad, iterations=10)
    good = np.where(~bad)[0]
    for ch in range(3):
        for y in range(m.shape[0]):
            m[y, bad, ch] = np.interp(np.where(bad)[0], good, m[y, good, ch])
    # remove any near-white background above zig-zag panel tops
    white = m.mean(-1) > 225
    m[white] = np.array([120, 14, 18])
    save(Image.fromarray(m.astype(np.uint8)), 'screens/matext_inner.jpg', q=92)
    # Fold4 / Fold5 / Fold6 inner wallpapers: derive from their cover art
    # (official inner wallpapers mirror the cover art); mirror-extend so the
    # wide inner panel shows a symmetric 'wing' composition like refs 04/06/08.
    for k in ('fold4', 'fold5', 'fold6'):
        c = Image.open(os.path.join(OUT, f'screens/{k}_cover.jpg'))
        w, h = c.size
        wide = Image.new('RGB', (w * 2, h))
        wide.paste(c.transpose(Image.FLIP_LEFT_RIGHT), (0, 0))
        wide.paste(c, (w, 0))
        wide = wide.resize((900, 1100), Image.LANCZOS)
        save(wide, f'screens/{k}_inner.jpg', q=92)
    # Mate XT cover (single 6.4" panel = left third of the continuous display)
    m = Image.open(os.path.join(OUT, 'screens/matext_inner.jpg'))
    save(m.crop((0, 0, m.width // 3, m.height)).resize((440, 1000), Image.LANCZOS), 'screens/matext_cover.jpg')

# ---------------------------------------------------------------------------
# 2. Creature cut-outs from Image 01 (butterflies) and Image 02 (bird, plant)
# ---------------------------------------------------------------------------
BUTTERFLIES = {
    # name: (box, body-axis x within rotated crop as fraction, rotate deg (CCW) to make body vertical, half to keep)
    'swallowtail': ((36, 0, 862, 560), 0.42, 28, 'R'),
    'crimson': ((626, 258, 802, 490), 0.50, 22, 'L'),
    'goldclear': ((662, 128, 1170, 636), 0.50, -38, 'R'),
    'hawkmoth': ((1026, 0, 1484, 300), 0.50, 0, 'L'),
    'indigo': ((1152, 396, 1468, 614), 0.50, 0, 'L'),
    'creammoth': ((1318, 0, 1847, 693), 0.62, 0, 'L'),
}


def cutout(im, bg=None, tol=38, soft=14, largest=True, minpx=0):
    a = np.asarray(im.convert('RGB')).astype(np.float32)
    if bg is None:
        border = np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]])
        bg = np.median(border, axis=0)
    d = np.sqrt(((a - bg) ** 2).sum(-1))
    alpha = np.clip((d - tol) / soft, 0, 1)
    # keep the largest connected blobs, fill holes, soften
    m = alpha > 0.5
    m = ndimage.binary_closing(m, iterations=2)
    m = ndimage.binary_fill_holes(m)
    lab, n = ndimage.label(m)
    if n > 1:
        sizes = ndimage.sum(m, lab, range(1, n + 1))
        keep = (lab == 1 + int(np.argmax(sizes))) if largest else np.isin(lab, 1 + np.where(sizes > minpx)[0])
        m = keep
    alpha = np.maximum(alpha, ndimage.binary_erosion(m, iterations=2)) * m
    alpha = ndimage.gaussian_filter(alpha, 0.8)
    rgba = np.dstack([a, alpha * 255]).astype(np.uint8)
    return Image.fromarray(rgba, 'RGBA')


def build_creatures(dbg):
    r1 = ref(1)
    for name, (box, axis, rot, half) in BUTTERFLIES.items():
        if dbg is not None:
            dbg.setdefault(1, []).append((name, box))
        c = cutout(r1.crop(box), bg=np.array([246, 234, 208]), tol=34, soft=16)
        if name == 'creammoth':  # drop the neighbouring blue butterfly
            ca = np.asarray(c).copy()
            blue = ca[..., 2].astype(int) > ca[..., 0].astype(int) + 6
            ca[blue, 3] = 0
            c = Image.fromarray(ca, 'RGBA')
        if rot:
            c = c.rotate(rot, resample=Image.BICUBIC, expand=True)
        c = c.crop(c.getbbox())
        w, h = c.size
        ax = int(axis * w)
        wing = c.crop((ax, 0, w, h)) if half == 'R' else c.crop((0, 0, ax, h)).transpose(Image.FLIP_LEFT_RIGHT)
        wing = wing.crop(wing.getbbox())
        # right-wing texture: body edge at x=0, 256 x 512 canvas, vertically centred
        W, H = 256, 512
        sc = min(W / wing.width, H / wing.height)
        wg = wing.resize((max(1, int(wing.width * sc)), max(1, int(wing.height * sc))), Image.LANCZOS)
        canvas = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        canvas.paste(wg, (0, (H - wg.height) // 2), wg)
        save(canvas, f'creatures/wing_{name}.png')
    r2 = ref(2)
    bird_box = (388, 232, 694, 410)
    plant_box = (366, 120, 694, 600)
    if dbg is not None:
        dbg.setdefault(2, []).extend([('bird', bird_box), ('plant', plant_box)])
    bird = cutout(r2.crop(bird_box), bg=np.array([236, 232, 222]), tol=30, soft=18)
    ba = np.asarray(bird).copy()
    green = (ba[..., 1].astype(int) > ba[..., 0].astype(int) + 8) & (ba[..., 1].astype(int) > ba[..., 2].astype(int) + 8)
    ba[green, 3] = 0
    bird = Image.fromarray(ba, 'RGBA')
    save(bird.crop(bird.getbbox()), 'creatures/bird_warbler.png')
    plant = cutout(r2.crop(plant_box), bg=np.array([238, 235, 226]), tol=20, soft=14, largest=False, minpx=30)
    pa = np.asarray(plant).copy()
    by0, by1 = bird_box[1] - plant_box[1], bird_box[3] - plant_box[1]
    bx0, bx1 = bird_box[0] - plant_box[0], bird_box[2] - plant_box[0]
    bird_m = np.zeros(pa.shape[:2], bool)
    bm = np.asarray(bird.resize((bx1 - bx0, by1 - by0)))[..., 3] > 40 if False else np.asarray(cutout(r2.crop(bird_box), bg=np.array([236, 232, 222]), tol=30, soft=18))[..., 3] > 40
    bird_m[by0:by1, bx0:bx1] = bm
    bird_m = ndimage.binary_dilation(bird_m, iterations=5)
    pa[bird_m, 3] = 0
    # outside the circular vignette of Image 02 -> transparent
    yy, xx = np.mgrid[0:pa.shape[0], 0:pa.shape[1]]
    cxy = (456 - plant_box[0], 300 - plant_box[1])
    pa[((xx - cxy[0]) ** 2 + (yy - cxy[1]) ** 2) > 262 ** 2, 3] = 0
    save(Image.fromarray(pa, 'RGBA'), 'creatures/plant_ref02.png')

# ---------------------------------------------------------------------------
# 3. Procedural PBR / art textures
# ---------------------------------------------------------------------------

def fbm(h, w, octaves=6, base=4, seed=0, tile=True):
    r = np.random.default_rng(seed)
    out = np.zeros((h, w), np.float32)
    amp, tot = 1.0, 0.0
    for o in range(octaves):
        gy, gx = base * 2 ** o, base * 2 ** o
        g = r.random((gy, gx)).astype(np.float32)
        if tile:
            g = np.pad(g, ((0, 1), (0, 1)), mode='wrap')
            z = ndimage.zoom(g, ((h + h / gy) / (gy + 1), (w + w / gx) / (gx + 1)), order=3, mode='grid-wrap')[:h, :w]
        else:
            z = ndimage.zoom(g, (h / gy, w / gx), order=3)[:h, :w]
        out += z * amp
        tot += amp
        amp *= 0.5
    out /= tot
    return (out - out.min()) / (out.max() - out.min() + 1e-6)


def normal_from_height(hm, strength=2.0):
    gy, gx = np.gradient(hm.astype(np.float32))
    nx, ny = -gx * strength, gy * strength
    nz = np.ones_like(nx)
    l = np.sqrt(nx * nx + ny * ny + nz * nz)
    n = np.dstack([nx / l, ny / l, nz / l])
    return Image.fromarray(((n * 0.5 + 0.5) * 255).astype(np.uint8), 'RGB')


def to_img(a):
    return Image.fromarray(np.clip(a * 255, 0, 255).astype(np.uint8))


def lerp_col(t, stops):
    t = np.clip(t, 0, 1)[..., None]
    cols = np.array([s[1] for s in stops], np.float32) / 255.0
    pos = np.array([s[0] for s in stops], np.float32)
    out = np.zeros(t.shape[:-1] + (3,), np.float32)
    for i in range(len(stops) - 1):
        m = (t[..., 0] >= pos[i]) & (t[..., 0] <= pos[i + 1])
        f = ((t[..., 0] - pos[i]) / (pos[i + 1] - pos[i] + 1e-6))[m][:, None]
        out[m] = cols[i] * (1 - f) + cols[i + 1] * f
    return out


def walnut(S=1024):
    y, x = np.mgrid[0:S, 0:S].astype(np.float32) / S
    warp = fbm(S, S, 5, 3, seed=11)
    # soft figured grain: few low-contrast rings (strong rings read as zebra stripes on camera)
    rings = np.sin((x * 20 + warp * 4.0 + fbm(S, S, 4, 2, seed=12) * 1.2) * math.pi) * 0.5 + 0.5
    fine = fbm(S, S, 6, 64, seed=13)
    streak = ndimage.gaussian_filter(rng.random((S, S)).astype(np.float32), (18, 0.7))
    streak = (streak - streak.mean()) / (streak.std() + 1e-6)
    t = 0.44 + rings ** 1.6 * 0.15 + streak * 0.055 + fine * 0.13
    col = lerp_col(t, [(0, (28, 15, 8)), (0.45, (66, 38, 20)), (0.7, (98, 60, 32)), (1, (128, 84, 48))])
    rough = 0.38 + fine * 0.18 - rings * 0.08
    h = rings * 0.18 + streak * 0.1 + fine * 0.3
    save(to_img(col), 'pbr/walnut_albedo.jpg')
    save(to_img(np.dstack([rough] * 3)), 'pbr/walnut_rough.jpg')
    save(normal_from_height(h, 3.0), 'pbr/walnut_normal.jpg')


def leather(name, base, dark, S=1024, pores=1.0):
    cell = fbm(S, S, 3, 48, seed=21)
    vor = np.abs(ndimage.laplace(ndimage.gaussian_filter(rng.random((S, S)).astype(np.float32), 3.0)))
    vor = vor / vor.max()
    wrinkle = fbm(S, S, 6, 6, seed=22)
    grain = (cell * 0.6 + vor * 0.8 * pores)
    t = wrinkle * 0.6 + grain * 0.4
    col = np.array(dark, np.float32) / 255 * (1 - t[..., None]) + np.array(base, np.float32) / 255 * t[..., None]
    # patina: worn lighter highlights
    patina = fbm(S, S, 4, 3, seed=23) ** 3
    col = col * (1 + patina[..., None] * 0.35)
    save(to_img(col), f'pbr/{name}_albedo.jpg')
    save(normal_from_height(grain * 0.6 + wrinkle * 0.5, 4.0), f'pbr/{name}_normal.jpg')
    save(to_img(np.dstack([0.42 + grain * 0.25 - patina * 0.2] * 3)), f'pbr/{name}_rough.jpg')


def plaster(S=1024):
    a = fbm(S, S, 7, 4, seed=31)
    b = fbm(S, S, 5, 32, seed=32)
    t = a * 0.7 + b * 0.3
    col = lerp_col(t, [(0, (176, 150, 112)), (0.5, (206, 184, 148)), (1, (226, 210, 178))])
    save(to_img(col), 'pbr/plaster_albedo.jpg')
    save(normal_from_height(b * 0.5 + a * 0.5, 2.0), 'pbr/plaster_normal.jpg')


def parquet(S=1024):
    # herringbone-free classic plank parquet with per-plank tint
    y, x = np.mgrid[0:S, 0:S]
    pw = S // 8
    plank = (x // pw)
    off = (plank * 377) % S
    row = ((y + off) // (S // 2))
    pid = plank * 7 + row * 13
    tint = (np.sin(pid * 12.9898) * 43758.5453) % 1.0
    grain = fbm(S, S, 6, 8, seed=41)
    fine = ndimage.gaussian_filter(rng.random((S, S)).astype(np.float32), (10, 0.7))
    fine = (fine - fine.mean()) / (fine.std() + 1e-6)
    t = 0.45 + tint * 0.25 + grain * 0.2 + fine * 0.04
    col = lerp_col(t, [(0, (54, 30, 14)), (0.5, (104, 64, 32)), (1, (150, 100, 56))])
    seam = ((x % pw) < 2) | (((y + off) % (S // 2)) < 2)
    col[seam] *= 0.35
    save(to_img(col), 'pbr/parquet_albedo.jpg')
    hm = grain * 0.3 + fine * 0.05 - seam * 1.0
    save(normal_from_height(ndimage.gaussian_filter(hm, 0.8), 3.0), 'pbr/parquet_normal.jpg')


def persian_rug(name, S=1024, palette=None, seed=0):
    r = np.random.default_rng(seed)
    pal = palette
    y, x = np.mgrid[0:S, 0:S].astype(np.float32)
    u, v = (x / S - 0.5) * 2, (y / S - 0.5) * 2
    img = np.zeros((S, S, 3), np.float32)
    img[:] = np.array(pal['field'], np.float32) / 255
    # border bands
    d = np.minimum(1 - np.abs(u), 1 - np.abs(v))
    def band(lo, hi):
        return (d >= lo) & (d < hi)
    img[band(0.0, 0.035)] = np.array(pal['edge']) / 255
    img[band(0.035, 0.05)] = np.array(pal['accent']) / 255
    mb = band(0.05, 0.17)
    img[mb] = np.array(pal['border']) / 255
    # border motif: repeating rosettes & vines
    ang = np.arctan2(v, u)
    per = (u * (np.abs(v) > np.abs(u)) + v * (np.abs(u) >= np.abs(v)))
    motif = (np.sin(per * 40) * np.sin((d - 0.11) * 90) > 0.35) & mb
    img[motif] = np.array(pal['accent']) / 255
    vine = (np.abs(np.sin(per * 20 + np.sin(per * 60) * 0.6) * 0.04 - (d - 0.11)) < 0.008) & mb
    img[vine] = np.array(pal['ivory']) / 255
    img[band(0.17, 0.185)] = np.array(pal['ivory']) / 255
    img[band(0.185, 0.2)] = np.array(pal['edge']) / 255
    # central medallion (lozenge) with star rosette
    rr = np.abs(u) * 1.3 + np.abs(v) * 0.9
    med = rr < 0.55
    img[med] = np.array(pal['medallion']) / 255
    img[(rr > 0.55) & (rr < 0.58)] = np.array(pal['ivory']) / 255
    star = (np.sqrt(u * u + v * v) < 0.22 + 0.06 * np.cos(ang * 8)) & med
    img[star] = np.array(pal['accent']) / 255
    ring = np.abs(np.sqrt(u * u + v * v) - 0.33 - 0.03 * np.cos(ang * 16)) < 0.012
    img[ring & med] = np.array(pal['ivory']) / 255
    # field: scattered botanical motifs (boteh) in a lattice
    field = (d > 0.2) & ~med & (rr > 0.6)
    lu, lv = (u * 7) % 1 - 0.5, (v * 5) % 1 - 0.5
    bo = (np.sqrt((lu * 1.6) ** 2 + (lv + 0.08 * np.sin(lu * 9)) ** 2) < 0.18) & field
    img[bo] = np.array(pal['accent']) / 255
    bo2 = (np.sqrt(lu ** 2 + lv ** 2) < 0.07) & field
    img[bo2] = np.array(pal['ivory']) / 255
    corner = (np.abs(np.abs(u) - 0.62) < 0.13) & (np.abs(np.abs(v) - 0.62) < 0.13) & field
    img[corner & (((u * 30).astype(int) + (v * 30).astype(int)) % 3 == 0)] = np.array(pal['medallion']) / 255
    # knot-level texture: per-knot jitter, abrash (dye lots), wear
    knots = 260
    kx, ky = (x / S * knots).astype(int), (y / S * knots * 1.3).astype(int)
    jit = (np.sin((kx * 127.1 + ky * 311.7)) * 43758.5453) % 1
    abrash = fbm(S, S, 3, 2, seed=seed + 5)[..., None]
    wear = fbm(S, S, 5, 4, seed=seed + 6)
    img = img * (0.86 + jit[..., None] * 0.18) * (0.9 + abrash * 0.18)
    img = img * (1 - np.clip(wear - 0.72, 0, 1)[..., None] * 0.9) + np.clip(wear - 0.72, 0, 1)[..., None] * 0.35
    pile = ((np.sin(x / S * knots * math.pi * 2) * np.sin(y / S * knots * 1.3 * math.pi * 2)) * 0.5 + 0.5)
    save(to_img(img), f'pbr/{name}_albedo.jpg')
    save(normal_from_height(pile * 0.6 + jit * 0.4, 1.4), f'pbr/{name}_normal.jpg')


def knit(S=512):
    # red cable/stockinette knit: V-shaped loops
    y, x = np.mgrid[0:S, 0:S].astype(np.float32)
    cols, rows = 32, 40
    cu = (x / S * cols) % 1
    cv = (y / S * rows) % 1
    side = np.where(cu < 0.5, cu * 2, (1 - cu) * 2)
    loop = np.exp(-((cv - side * 0.6 - 0.2) ** 2) / 0.04) * np.maximum(np.sin(np.clip(side, 0, 1) * math.pi), 0) ** 0.4
    fuzz = fbm(S, S, 4, 64, seed=51)
    h = loop * 0.85 + fuzz * 0.25
    base = np.array([150, 18, 22], np.float32) / 255
    col = base[None, None, :] * (0.78 + h[..., None] * 0.3)
    save(to_img(col), 'pbr/knit_albedo.jpg')
    save(normal_from_height(ndimage.gaussian_filter(h, 0.9), 3.2), 'pbr/knit_normal.jpg')


def denim(S=512):
    y, x = np.mgrid[0:S, 0:S].astype(np.float32)
    twill = np.sin((x + y) / S * 2 * math.pi * 90) * 0.5 + 0.5
    weft = fbm(S, S, 4, 128, seed=61)
    slub = ndimage.gaussian_filter(rng.random((S, S)).astype(np.float32), (0.6, 18))
    slub = (slub - slub.mean()) / (slub.std() + 1e-6)
    t = twill * 0.5 + weft * 0.3 + slub * 0.06
    col = lerp_col(t, [(0, (18, 30, 58)), (0.6, (42, 64, 104)), (1, (122, 138, 168))])
    save(to_img(col), 'pbr/denim_albedo.jpg')
    save(normal_from_height(twill * 0.5 + weft * 0.4, 3.0), 'pbr/denim_normal.jpg')


def parchment(S=1024):
    a = fbm(S, S, 7, 3, seed=71)
    fib = ndimage.gaussian_filter(rng.random((S, S)).astype(np.float32), (0.7, 6))
    fib = (fib - fib.mean()) / (fib.std() + 1e-6)
    spots = (fbm(S, S, 4, 16, seed=72) > 0.83) * fbm(S, S, 3, 32, seed=73)
    t = 0.55 + a * 0.35 + fib * 0.025 - spots * 0.25
    col = lerp_col(t, [(0, (196, 168, 120)), (0.55, (236, 222, 190)), (1, (248, 240, 220))])
    save(to_img(col), 'pbr/parchment.jpg')
    # paper grain overlay (tileable, grey)
    g = fbm(512, 512, 5, 64, seed=74) * 0.6 + ndimage.gaussian_filter(rng.random((512, 512)).astype(np.float32), 0.6) * 0.4
    save(to_img(np.dstack([g] * 3)), 'pbr/paper_grain.jpg')


def red_leather(S=1024):
    # Huawei 'vegan leather' fine pebble grain, Rui Red
    cell = ndimage.gaussian_filter(rng.random((S, S)).astype(np.float32), 1.6)
    cell = (cell - cell.min()) / (cell.max() - cell.min())
    ridges = np.abs(ndimage.laplace(ndimage.gaussian_filter(rng.random((S, S)).astype(np.float32), 2.2)))
    ridges /= ridges.max()
    mac = fbm(S, S, 4, 6, seed=81)
    h = cell * 0.5 + ridges * 0.8 + mac * 0.2
    col = np.array([132, 14, 20], np.float32) / 255 * (0.82 + cell[..., None] * 0.22 + mac[..., None] * 0.08)
    save(to_img(col), 'pbr/redleather_albedo.jpg')
    save(normal_from_height(h, 3.5), 'pbr/redleather_normal.jpg')
    save(to_img(np.dstack([0.48 + ridges * 0.25] * 3)), 'pbr/redleather_rough.jpg')


def brocade(W=1024, H=2048):
    """Mate XT2 'brocade cloud' rear: dark slate-violet woven base with
    flowing glittering lilac strands (see Image 18)."""
    y, x = np.mgrid[0:H, 0:W].astype(np.float32)
    u, v = x / W, y / H
    weave = (np.sin(x * 0.9) * np.sin(y * 0.9)) * 0.5 + 0.5
    base = np.array([44, 40, 58], np.float32) / 255
    grad = 0.75 + 0.35 * (1 - v)
    img = base[None, None] * grad[..., None] * (0.9 + weave[..., None] * 0.12)
    flow = np.zeros((H, W), np.float32)
    warp = fbm(H // 4, W // 4, 4, 3, seed=91)
    warp = ndimage.zoom(warp, 4, order=1)[:H, :W]
    for k in range(7):
        c = 0.08 + k * 0.145 + rng.normal() * 0.02
        band = v - c - (u - 0.5) * 0.28 - (warp - 0.5) * 0.22 - 0.03 * np.sin(u * 9 + k)
        w = 0.018 + 0.012 * rng.random()
        flow += np.exp(-(band ** 2) / (2 * w * w)) * (0.4 + 0.6 * fbm(H // 8, W // 8, 3, 4, seed=92 + k).repeat(8, 0).repeat(8, 1)[:H, :W])
    glitter = (rng.random((H, W)) > 0.965).astype(np.float32) * rng.random((H, W)).astype(np.float32)
    strands = np.clip(flow, 0, 1)
    sparkle = glitter * (0.15 + strands * 1.6)
    lilac = np.array([196, 150, 236], np.float32) / 255
    img = img * (1 - strands[..., None] * 0.35) + lilac[None, None] * (strands[..., None] * 0.28 + sparkle[..., None] * 0.9)
    save(to_img(img), 'pbr/brocade_albedo.jpg')
    # metalness/roughness: sparkles metallic and smoother
    save(to_img(np.dstack([np.zeros_like(u), 0.55 - sparkle * 0.4, np.clip(sparkle * 2, 0, 1)])), 'pbr/brocade_orm.jpg')
    save(normal_from_height(weave * 0.3 + sparkle * 0.6, 2.0), 'pbr/brocade_normal.jpg')


def book_spines(W=2048, H=1024, n=64):
    """Atlas of gilded leather book spines (8 x 8 cells)."""
    img = Image.new('RGB', (W, H))
    dr = ImageDraw.Draw(img)
    cw, ch = W // 16, H // 4
    leathers = [(92, 22, 18), (36, 50, 30), (70, 40, 20), (26, 30, 52), (110, 70, 34), (54, 18, 30), (40, 32, 26), (120, 92, 54), (18, 40, 44)]
    gold = (206, 168, 92)
    for i in range(64):
        cx, cy = (i % 16) * cw, (i // 16) * ch
        base = leathers[i % len(leathers)]
        jit = rng.integers(-12, 12, 3)
        col = tuple(int(np.clip(base[k] + jit[k], 0, 255)) for k in range(3))
        dr.rectangle([cx, cy, cx + cw - 1, cy + ch - 1], fill=col)
        nb = rng.integers(2, 5)
        for b in range(nb):
            by = cy + int(ch * (0.08 + b * 0.82 / max(1, nb - 1)))
            dr.rectangle([cx + 2, by, cx + cw - 3, by + 5], fill=tuple(int(c * 0.6) for c in col))
            dr.line([cx + 2, by - 3, cx + cw - 3, by - 3], fill=gold, width=2)
            dr.line([cx + 2, by + 8, cx + cw - 3, by + 8], fill=gold, width=2)
        # label panel
        if rng.random() < 0.7:
            ly = cy + int(ch * 0.25)
            lab = (24, 18, 14) if rng.random() < 0.5 else (110, 20, 18)
            dr.rectangle([cx + 6, ly, cx + cw - 7, ly + int(ch * 0.12)], fill=lab, outline=gold, width=2)
            for k in range(3):
                dr.line([cx + 12, ly + 10 + k * 9, cx + cw - 13, ly + 10 + k * 9], fill=gold, width=2)
        # tooled ornament
        oy = cy + int(ch * 0.55)
        dr.ellipse([cx + cw // 2 - 9, oy - 9, cx + cw // 2 + 9, oy + 9], outline=gold, width=2)
    a = np.asarray(img).astype(np.float32) / 255
    wear = fbm(H, W, 5, 8, seed=101)[..., None]
    a = a * (0.75 + wear * 0.4)
    save(to_img(a), 'pbr/book_spines.jpg')


def cake(S=512):
    sp = fbm(S, S, 6, 32, seed=111)
    holes = (ndimage.gaussian_filter(rng.random((S, S)).astype(np.float32), 1.5) < 0.47)
    col = lerp_col(sp * 0.6 + 0.3 - holes * 0.2, [(0, (170, 116, 52)), (0.5, (226, 180, 104)), (1, (246, 214, 150))])
    save(to_img(col), 'pbr/sponge_albedo.jpg')
    cr = fbm(S, S, 5, 8, seed=112)
    save(normal_from_height(cr, 1.5), 'pbr/cream_normal.jpg')


def blossoms(S=1024):
    """Sprite atlas (2x2): blossom clusters & leaves for the garden outside."""
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    dr = ImageDraw.Draw(img)
    cell = S // 2
    for c in range(4):
        ox, oy = (c % 2) * cell, (c // 2) * cell
        for k in range(260 if c < 3 else 160):
            r = cell * 0.42 * math.sqrt(rng.random())
            a = rng.random() * math.tau
            px, py = ox + cell / 2 + math.cos(a) * r, oy + cell / 2 + math.sin(a) * r * 0.8
            if c == 3:  # leaves
                g = rng.integers(70, 140)
                L = rng.uniform(10, 22)
                ang = rng.random() * math.tau
                pts = [(px, py), (px + math.cos(ang + 0.4) * L, py + math.sin(ang + 0.4) * L), (px + math.cos(ang) * L * 1.8, py + math.sin(ang) * L * 1.8), (px + math.cos(ang - 0.4) * L, py + math.sin(ang - 0.4) * L)]
                dr.polygon(pts, fill=(int(g * 0.5), g, int(g * 0.35), 255))
            else:
                pink = (255, rng.integers(196, 236), rng.integers(208, 236)) if c != 1 else (255, 250, 244)
                if rng.random() < 0.15:
                    pink = (int(110 + rng.random() * 40), int(150 + rng.random() * 40), 80)
                rr = rng.uniform(4, 9)
                dr.ellipse([px - rr, py - rr, px + rr, py + rr], fill=tuple(int(v) for v in pink) + (255,))
    img = img.filter(ImageFilter.GaussianBlur(0.6))
    save(img, 'pbr/blossom_atlas.png')


def soft_sprites():
    S = 128
    y, x = np.mgrid[0:S, 0:S].astype(np.float32)
    r = np.sqrt((x - S / 2 + 0.5) ** 2 + (y - S / 2 + 0.5) ** 2) / (S / 2)
    a = np.clip(1 - r, 0, 1) ** 2.2
    save(Image.fromarray((np.dstack([np.ones_like(a), np.ones_like(a), np.ones_like(a), a]) * 255).astype(np.uint8), 'RGBA'), 'pbr/soft_dot.png')
    # star with diffraction spikes
    S = 256
    y, x = np.mgrid[0:S, 0:S].astype(np.float32)
    dx, dy = (x - S / 2 + 0.5) / (S / 2), (y - S / 2 + 0.5) / (S / 2)
    rr = np.sqrt(dx * dx + dy * dy)
    core = np.exp(-rr * rr / 0.004) + 0.35 * np.exp(-rr / 0.08)
    spikes = np.exp(-np.abs(dx) / 0.012) * np.exp(-np.abs(dy) / 0.5) + np.exp(-np.abs(dy) / 0.012) * np.exp(-np.abs(dx) / 0.5)
    a = np.clip(core + spikes * 0.35, 0, 1) * np.clip(1 - rr, 0, 1)
    save(Image.fromarray((np.dstack([np.ones_like(a)] * 3 + [a]) * 255).astype(np.uint8), 'RGBA'), 'pbr/star_flare.png')


def debug_sheet(dbg):
    tiles = []
    for n, items in sorted(dbg.items()):
        im = ref(n).convert('RGB')
        d = ImageDraw.Draw(im)
        for name, box in items:
            d.rectangle(box, outline=(255, 0, 255), width=max(2, im.width // 300))
            d.text((box[0] + 4, box[1] + 4), name, fill=(255, 0, 255))
        im.thumbnail((420, 420))
        tiles.append(im)
    cols = 5
    rows = math.ceil(len(tiles) / cols)
    sheet = Image.new('RGB', (cols * 420, rows * 420), (40, 40, 40))
    for i, t in enumerate(tiles):
        sheet.paste(t, ((i % cols) * 420, (i // cols) * 420))
    p = sys.argv[sys.argv.index('--debug') + 1]
    sheet.save(p)
    print('debug sheet', p)


if __name__ == '__main__':
    dbg = {} if DEBUG else None
    build_screens(dbg)
    build_creatures(dbg)
    if DEBUG:
        debug_sheet(dbg)
        sys.exit(0)
    walnut(); leather('sofa_leather', (150, 74, 40), (52, 20, 12)); plaster(); parquet()
    persian_rug('rug_main', palette=dict(field=(128, 28, 30), edge=(30, 24, 40), accent=(196, 150, 70), border=(28, 38, 70), medallion=(30, 48, 84), ivory=(228, 210, 170)), seed=1)
    persian_rug('rug_small', palette=dict(field=(30, 52, 64), edge=(60, 20, 22), accent=(200, 120, 60), border=(120, 34, 30), medallion=(150, 110, 60), ivory=(232, 214, 176)), seed=2)
    knit(); denim(); parchment(); red_leather(); brocade(); book_spines(); cake(); blossoms(); soft_sprites()
    print('textures done')
