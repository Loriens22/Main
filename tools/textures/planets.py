"""Equirectangular surface maps for the worlds of the game, generated procedurally.

Major real features are placed by hand at their approximate positions (longitude east-positive, latitude):
lunar maria and rayed craters, Mercury's Caloris basin, the Martian dichotomy, Tharsis, Olympus Mons,
Valles Marineris, Hellas, Argyre, the polar caps and Gale crater with its central mound, Jupiter's belts,
zones and Great Red Spot, Saturn's polar hexagon, Neptune's dark spot, Iapetus's dark leading hemisphere,
Enceladus's tiger stripes. Fractal noise, crater populations with a power-law size distribution, rays,
lineae and band turbulence fill in everything else. The Lazarus worlds are original designs.

Outputs (public/assets/textures):
  planet_<id>_albedo.webp   RGB, linear-ish sRGB
  planet_<id>_normal.webp   tangent-space relief (x east, y north) for rocky bodies
  planet_<id>_clouds.webp   RGBA cloud deck (Venus, Lazarus worlds)
  ring_saturn.webp          radial ring profile: RGB particle colour, A optical depth / 4
  ring_uranus.webp          narrow dark rings
Usage: python3 tools/textures/planets.py [id ...]
"""
import math
import os
import sys
import time

import numpy as np
from PIL import Image, ImageFilter

sys.path.insert(0, os.path.dirname(__file__))
from earth import lonlat_grid, sphere_xyz, fbm3, vnoise3, smoothstep  # noqa: E402

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "public", "assets", "textures")
RNG = np.random.RandomState


# ============================================================================================ helpers
class Grid:
    def __init__(self, w):
        self.W, self.H = w, w // 2
        self.lon, self.lat = lonlat_grid(self.W, self.H)
        self.X, self.Y, self.Z = sphere_xyz(self.lon, self.lat)
        self.X = self.X.astype(np.float32)
        self.Y = self.Y.astype(np.float32)
        self.Z = self.Z.astype(np.float32)

    def fbm(self, freq, octaves, seed, gain=0.5, ridged=False, warp=0.0):
        X, Y, Z = self.X, self.Y, self.Z
        if warp:
            wx = fbm3(X, Y, Z, freq * 0.5, 3, seed=seed + 101) - 0.5
            wy = fbm3(X, Y, Z, freq * 0.5, 3, seed=seed + 202) - 0.5
            X, Y, Z = X + wx * warp, Y + wy * warp, Z + (wx - wy) * warp * 0.5
        return fbm3(X, Y, Z, freq, octaves, gain=gain, seed=seed, ridged=ridged).astype(np.float32)

    def ang(self, lon0, lat0):
        """Angular distance (deg) of every pixel from a point."""
        x0, y0, z0 = sphere_xyz(np.float32(lon0), np.float32(lat0))
        d = np.clip(self.X * x0 + self.Y * y0 + self.Z * z0, -1, 1)
        return np.degrees(np.arccos(d))

    def blob(self, lon0, lat0, r, soft=0.35):
        """Soft disc of angular radius r (deg)."""
        return smoothstep(r * (1 + soft), r * (1 - soft), self.ang(lon0, lat0)).astype(np.float32)

    def upsample(self, a, w):
        h = w // 2
        if a.ndim == 2:
            return np.asarray(Image.fromarray(a.astype(np.float32), "F").resize((w, h), Image.BICUBIC), dtype=np.float32)
        return np.stack([self.upsample(a[..., i], w) for i in range(a.shape[-1])], -1)


def craters(g, h, alb, n, rmin, rmax, seed, depth=1.0, slope=2.0, bright=0.15, rays=0, ray_set=(), rim=0.35, ejecta=0.12, lat_lim=90, region=None):
    """Stamp n craters (angular radius rmin..rmax deg, power-law) into height h and albedo alb in place.
    region: optional function (lon, lat) -> probability of keeping a crater there."""
    rs = RNG(seed)
    W, H = g.W, g.H
    px = 360.0 / W
    u = rs.random_sample(n)
    a = 1 - slope
    radii = (rmin ** a + u * (rmax ** a - rmin ** a)) ** (1 / a) if slope != 1 else rmin * (rmax / rmin) ** u
    lons = rs.uniform(-180, 180, n)
    lats = np.degrees(np.arcsin(rs.uniform(-1, 1, n)))
    ages = rs.random_sample(n)
    out_rays = []
    for i in range(n):
        lon0, lat0, r, age = lons[i], lats[i], radii[i], ages[i]
        if abs(lat0) > lat_lim:
            continue
        if region is not None and rs.random_sample() > region(lon0, lat0):
            continue
        stamp(g, h, alb, lon0, lat0, r, depth, age, bright, rim, ejecta, px)
    for (lon0, lat0, r, k) in ray_set:
        stamp(g, h, alb, lon0, lat0, r, depth, 1.0, bright * 1.6, rim, ejecta, px)
        out_rays.append((lon0, lat0, r, k))
    for (lon0, lat0, r, k) in out_rays:
        ray_pattern(g, alb, lon0, lat0, r, k, seed + 7)
    return h, alb


def stamp(g, h, alb, lon0, lat0, r, depth, age, bright, rim, ejecta, px):
    W, H = g.W, g.H
    ext = r * 3.2
    r0 = int(max(0, (90 - (lat0 + ext)) / 180 * H) - 1)
    r1 = int(min(H, (90 - (lat0 - ext)) / 180 * H) + 2)
    if r1 <= r0:
        return
    cl = max(np.cos(np.radians(min(89.0, abs(lat0) + ext))), 0.02)
    span = ext / cl
    if span >= 180 or abs(lat0) + ext > 88:
        cols = np.arange(W)
    else:
        c0 = int(((lon0 - span) + 180) / 360 * W) - 1
        c1 = int(((lon0 + span) + 180) / 360 * W) + 2
        cols = np.arange(c0, c1) % W
    sl = (slice(r0, r1),)
    X, Y, Z = g.X[r0:r1][:, cols], g.Y[r0:r1][:, cols], g.Z[r0:r1][:, cols]
    x0, y0, z0 = sphere_xyz(np.float32(lon0), np.float32(lat0))
    d = np.degrees(np.arccos(np.clip(X * x0 + Y * y0 + Z * z0, -1, 1))) / r
    # bowl, raised rim, ejecta blanket; big craters get flat floors and central peaks
    D = depth * r ** 0.65
    bowl = -(1 - np.clip(d, 0, 1) ** 2) * D
    if r > 1.0:
        bowl = np.maximum(bowl, -D * 0.75)
        bowl += np.exp(-(d / 0.16) ** 2) * D * 0.45
    rimh = np.exp(-((d - 1.0) / 0.13) ** 2) * D * rim
    ej = np.where(d > 1, np.clip((d - 1) / 2.0, 0, 1), 0)
    ejh = np.where(d > 1, D * ejecta * np.exp(-(d - 1) * 2.2), 0)
    prof = np.where(d < 3.2, bowl * (d < 1.05) + rimh + ejh, 0)
    hs = h[sl][:, cols]
    h[r0:r1, cols] = hs + prof.astype(np.float32)
    # fresh craters and their blankets are bright; old ones fade into the surroundings
    fresh = (1 - age) ** 3
    b = bright * fresh * (np.exp(-(np.maximum(d - 0.6, 0) / 0.9) ** 2) * (d < 3.2)) - 0.03 * (d < 0.9) * age
    if alb.ndim == 3:
        a = alb[r0:r1][:, cols]
        alb[r0:r1, cols] = a * (1 + b[..., None])
    else:
        alb[r0:r1, cols] = alb[r0:r1][:, cols] * (1 + b)


def ray_pattern(g, alb, lon0, lat0, r, k, seed):
    """Bright ejecta rays radiating up to k crater radii (Tycho, Copernicus...)."""
    d = g.ang(lon0, lat0)
    x0, y0, z0 = sphere_xyz(np.float32(lon0), np.float32(lat0))
    # local east / north to get the azimuth of every pixel
    e = np.array([-np.sin(np.radians(lon0)), np.cos(np.radians(lon0)), 0.0])
    nvec = np.cross(np.array([x0, y0, z0]), e)
    az = np.arctan2(g.X * nvec[0] + g.Y * nvec[1] + g.Z * nvec[2], g.X * e[0] + g.Y * e[1] + g.Z * e[2])
    rs = RNG(seed)
    m = np.zeros_like(d)
    for _ in range(int(14 + k)):
        a0 = rs.uniform(-np.pi, np.pi)
        w = rs.uniform(0.012, 0.05)
        L = r * rs.uniform(0.4, 1.0) * k
        da = np.angle(np.exp(1j * (az - a0)))
        m = np.maximum(m, np.exp(-(da / w) ** 2) * np.clip(1 - d / L, 0, 1) * (d > r))
    m *= 0.6 + 0.4 * vnoise3(g.X * 90, g.Y * 90, g.Z * 90)
    if alb.ndim == 3:
        alb *= (1 + 0.55 * m)[..., None]
    else:
        alb *= 1 + 0.55 * m


def normal_from_height(g, h, k):
    """Tangent-space normal map (x east, y north) from a height field in metres-ish units."""
    lat = np.radians(g.lat)
    gx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) / np.maximum(np.cos(lat), 0.08)
    gy = np.roll(h, -1, 0) - np.roll(h, 1, 0)
    gy[0] = gy[1]
    gy[-1] = gy[-2]
    n = np.stack([-gx * k, gy * k, np.ones_like(gx)], -1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return n


def save_rgb(name, a, q=88):
    Image.fromarray((np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8)).save(os.path.join(OUT, name), quality=q, method=6)


def save_rgba(name, a, q=86):
    Image.fromarray((np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8), "RGBA").save(os.path.join(OUT, name), quality=q, method=6)


def save_normal(name, n):
    Image.fromarray(((n * 0.5 + 0.5) * 255 + 0.5).astype(np.uint8)).save(os.path.join(OUT, name), quality=90, method=6)


def palette(t, stops):
    """Map 0..1 through colour stops [(t, (r, g, b)), ...]."""
    t = np.clip(t, 0, 1)
    out = np.zeros(t.shape + (3,), np.float32)
    for (t0, c0), (t1, c1) in zip(stops[:-1], stops[1:]):
        m = (t >= t0) & (t <= t1)
        f = ((t - t0) / max(t1 - t0, 1e-6))[..., None]
        out = np.where(m[..., None], np.array(c0) * (1 - f) + np.array(c1) * f, out)
    return out


def soften(h, passes=2):
    """Binomial blur (wraps in longitude): keeps crater walls a few texels wide so their shading does not alias."""
    for _ in range(passes):
        h = (np.roll(h, 2, 1) + 4 * np.roll(h, 1, 1) + 6 * h + 4 * np.roll(h, -1, 1) + np.roll(h, -2, 1)) / 16
        v = np.pad(h, ((2, 2), (0, 0)), mode="edge")
        h = (v[:-4] + 4 * v[1:-3] + 6 * v[2:-2] + 4 * v[3:-1] + v[4:]) / 16
    return h


def rocky_out(id_, g, alb, h, k, out_w=None):
    if out_w and out_w != g.W:
        alb = g.upsample(alb, out_w)
        h = g.upsample(h, out_w)
        g = Grid(out_w)
    save_rgb(f"planet_{id_}_albedo.webp", alb)
    save_normal(f"planet_{id_}_normal.webp", normal_from_height(g, soften(h), k))


# ============================================================================================ bodies
def moon():
    g = Grid(4096)
    hl = g.fbm(3.0, 7, 1.0, gain=0.55)
    alb = np.repeat((0.42 + 0.07 * (hl - 0.5))[..., None], 3, -1) * np.array([1.0, 0.985, 0.96], np.float32)
    h = (hl - 0.5) * 3.0
    maria = np.zeros_like(hl)
    for lon, lat, r in [(-15, 33, 9.5), (17.5, 28, 6), (31, 8.5, 7), (59, 17, 4.5), (51, -8, 6), (35, -15, 3.5), (-17, -21, 7), (-39, -24, 3.5),
                        (-55, 10, 12), (-60, 28, 10), (-45, 0, 9), (-48, 35, 7), (4, 13, 3), (-23, -10, 4), (-31, 7, 5), (25, 45, 4),
                        (-10, 56, 4), (5, 57, 4.5), (25, 58, 4), (-30, 55, 4), (147, 27, 2.5), (85, 2, 4), (65, 20, 2), (100, -20, 3)]:
        maria = np.maximum(maria, g.blob(lon, lat, r, 0.25))
    edge = g.fbm(9.0, 4, 3.0)
    maria = smoothstep(0.35, 0.65, maria * (0.75 + 0.5 * edge))
    spa = g.blob(-170, -53, 25, 0.6)
    h += -maria * 1.4 - spa * 3.0
    mare_col = np.array([0.29, 0.285, 0.28], np.float32) * (0.9 + 0.2 * g.fbm(14.0, 4, 5.0))[..., None]
    alb = alb * (1 - maria[..., None]) + mare_col * maria[..., None]
    alb *= (1 - 0.12 * spa)[..., None]
    # crater population: highlands saturated, maria sparse
    keep = lambda lon, lat: 0.35 if (abs(lon) < 70 and abs(lat) < 50) else 1.0  # noqa: E731  (fewer craters on the near-side maria)
    craters(g, h, alb, 9000, 0.18, 1.2, 11, depth=0.9, slope=2.2, bright=0.22, region=keep)
    craters(g, h, alb, 420, 1.2, 7.0, 12, depth=1.3, slope=1.8, bright=0.12)
    craters(g, h, alb, 0, 1, 1, 13, depth=1.2, bright=0.35, ray_set=[(-11.4, -43.3, 1.4, 22), (-20.1, 9.6, 1.5, 9), (-38.0, 8.1, 0.53, 10), (-47.4, 23.7, 0.66, 6), (-91.0, -2.0, 0.6, 7)])
    alb = np.clip(alb, 0, 1)
    rocky_out("moon", g, alb, h, 14.0)


def mercury():
    g = Grid(4096)
    hl = g.fbm(3.0, 7, 21.0, gain=0.55)
    t = 0.5 + (hl - 0.5) * 0.8 + 0.12 * (g.fbm(1.5, 3, 22.0) - 0.5)
    alb = palette(t, [(0, (0.32, 0.30, 0.28)), (0.5, (0.42, 0.40, 0.37)), (1, (0.50, 0.48, 0.45))])
    h = (hl - 0.5) * 3.0
    cal = g.blob(160, 30, 13, 0.15)
    h += -cal * 1.0 + np.exp(-((g.ang(160, 30) - 13) / 1.2) ** 2) * 1.2
    plains = smoothstep(0.55, 0.7, g.fbm(2.2, 4, 23.0))
    alb *= (1 + 0.12 * plains - 0.08 * cal)[..., None]
    craters(g, h, alb, 8500, 0.18, 1.3, 31, depth=0.95, slope=2.1, bright=0.25)
    craters(g, h, alb, 380, 1.3, 6.0, 32, depth=1.2, slope=1.8, bright=0.14)
    craters(g, h, alb, 0, 1, 1, 33, depth=1.1, bright=0.5, ray_set=[(16.8, 57.8, 1.1, 30), (-33, 22, 0.7, 12), (-110, -59, 0.8, 9)])
    rocky_out("mercury", g, np.clip(alb, 0, 1), h, 12.0)


def mars():
    g = Grid(2048)
    lon, lat = g.lon, g.lat
    hl = g.fbm(2.6, 7, 41.0, gain=0.55)
    # topography (km): dichotomy, Tharsis, volcanoes, Valles Marineris, basins
    north = smoothstep(10, 35, lat + 10 * (g.fbm(1.5, 3, 42.0) - 0.5) * 2)
    h = (hl - 0.5) * 2.4 + 1.2 - north * 4.2
    th = g.ang(-105, 2)
    h += np.exp(-(th / 24) ** 2) * 6.5
    for lo, la, r, z in [(-134, 18.6, 3.2, 21.0), (-121, -9, 2.4, 15.0), (-113, 1.5, 2.2, 13.0), (-104, 11, 2.2, 15.0), (147, 25, 2.6, 11.0), (-109, 34, 9.0, 2.5)]:
        d = g.ang(lo, la)
        cone = np.clip(1 - d / r, 0, 1) ** 1.6 * z
        cald = np.exp(-(d / (r * 0.12)) ** 2) * z * 0.15
        h = np.maximum(h, h * 0 + cone - cald) * (d < r) + h * (d >= r)
    om = g.ang(-134, 18.6)
    h += -np.exp(-((om - 3.3) / 0.25) ** 2) * 3.0       # Olympus Mons basal scarp
    # Valles Marineris: a trough along a great-circle-ish path
    vm = np.full(lon.shape, 1e9, np.float32)
    path = [(-95, -6.5), (-85, -8), (-75, -10), (-65, -11), (-55, -9), (-45, -7), (-38, -4)]
    from earth import dist_to_polyline
    vm = dist_to_polyline(lon, lat, path)
    h -= np.exp(-(vm / 1.3) ** 2) * 6.0
    for lo, la, r, z in [(70, -42, 18, 7.0), (-43, -50, 9, 4.5), (88, 13, 8, 3.0), (-110, 9, 1, 0)]:
        b = g.blob(lo, la, r, 0.4)
        h -= b * z
    # albedo: bright dusty regions, dark basaltic ones
    dark = np.zeros_like(hl)
    for lo, la, r in [(70, 9, 9), (72, -2, 7), (-30, 45, 11), (-40, -25, 14), (-145, -20, 14), (-155, -35, 10), (0, -2, 6), (20, -8, 7), (40, -10, 7),
                      (110, -20, 10), (130, -25, 9), (-100, -40, 8), (-60, -15, 6), (160, -15, 8), (-20, -18, 6), (-170, 20, 6)]:
        dark = np.maximum(dark, g.blob(lo, la, r, 0.5))
    irr = g.fbm(5.0, 6, 43.0, warp=1.1)
    irr2 = g.fbm(11.0, 5, 48.0, warp=1.4)
    dark = smoothstep(0.5, 0.72, dark * 0.32 + irr * 0.55 + irr2 * 0.3 - 0.02) * (0.7 + 0.3 * g.fbm(24.0, 4, 47.0))
    # wind streaks and dust: medium-scale variation for close views
    streak = fbm3(g.X * 1.0, g.Y * 1.0, g.Z * 3.0, 14.0, 4, seed=49.0)
    hel = g.blob(70, -42, 16, 0.5)
    dark *= 1 - hel
    t = np.clip(0.55 + (hl - 0.5) * 0.7 + 0.15 * (g.fbm(4.0, 5, 44.0) - 0.5), 0, 1)
    bright = palette(t, [(0, (0.58, 0.38, 0.25)), (0.5, (0.72, 0.50, 0.34)), (1, (0.82, 0.62, 0.46))])
    darkc = bright * np.array([0.60, 0.58, 0.60], np.float32)
    alb = bright * (1 - dark[..., None]) + darkc * dark[..., None]
    alb *= (0.9 + 0.2 * streak)[..., None]
    # polar caps: residual north cap, small offset south cap, seasonal frost fringe
    ncap = smoothstep(81.5, 84.5, lat + 2.5 * (g.fbm(10, 4, 45.0) - 0.5) * 2) * (0.75 + 0.25 * g.fbm(20, 4, 46.0, ridged=True))
    scap = g.blob(-40, -87, 3.5, 0.4) * 0.9
    cap = np.clip(ncap + scap, 0, 1)
    alb = alb * (1 - cap[..., None]) + np.array([0.92, 0.9, 0.88]) * cap[..., None]
    craters(g, h, alb, 2600, 0.25, 1.2, 51, depth=1.1, slope=2.2, bright=0.06, region=lambda lo, la: 0.15 if la > 25 else 1.0)
    craters(g, h, alb, 180, 1.2, 5.0, 52, depth=1.6, slope=1.8, bright=0.04, region=lambda lo, la: 0.2 if la > 25 else 1.0)
    # Gale crater with Aeolis Mons (the landing site)
    gd = g.ang(137.4, -5.4)
    h += np.where(gd < 2.6, -np.clip(1 - (gd / 1.3) ** 2, 0, 1) * 4.5 + np.exp(-((gd - 1.3) / 0.12) ** 2) * 1.5 + np.exp(-(gd / 0.45) ** 2) * 5.0, 0)
    rocky_out("mars", g, np.clip(alb, 0, 1), h, 0.9, out_w=4096)


def jupiter():
    g = Grid(2048)
    lat = g.lat
    # turbulence stretched along longitude: sample noise on a squashed sphere, then shear it
    sx, sy, sz = g.X, g.Y, g.Z * 5.0
    wrp = fbm3(sx, sy, sz, 1.4, 4, seed=61.0) - 0.5
    tb = fbm3(sx + wrp * 1.4, sy - wrp * 1.4, sz, 3.0, 7, gain=0.58, seed=62.0)
    la = lat + (tb - 0.5) * 3.2
    stops = [(-90, 0.36), (-60, 0.40), (-45, 0.55), (-38, 0.45), (-33, 0.62), (-27, 0.40), (-20, 0.78), (-16, 0.34), (-8, 0.70), (0, 0.86), (7, 0.80),
             (10, 0.30), (17, 0.38), (21, 0.82), (25, 0.40), (30, 0.48), (35, 0.70), (40, 0.48), (48, 0.62), (60, 0.44), (90, 0.38)]
    ls = np.array([s[0] for s in stops], np.float32)
    vs = np.array([s[1] for s in stops], np.float32)
    zone = np.interp(la, ls, vs)
    t = np.clip(zone + (tb - 0.5) * 0.35, 0, 1)
    col = palette(t, [(0, (0.45, 0.34, 0.26)), (0.35, (0.64, 0.46, 0.31)), (0.55, (0.80, 0.68, 0.53)), (0.75, (0.91, 0.85, 0.75)), (1, (0.97, 0.94, 0.87))])
    pol = smoothstep(45, 75, np.abs(lat))
    col = col * (1 - 0.35 * pol[..., None]) + np.array([0.42, 0.44, 0.48]) * 0.35 * pol[..., None]
    # Great Red Spot and its hollow, white ovals, festoons on the NEB edge
    dlon = np.angle(np.exp(1j * np.radians(g.lon - 40))) * 180 / np.pi
    e = np.sqrt((dlon / 11.0) ** 2 + ((lat + 22.5) / 6.0) ** 2)
    swirl = fbm3(g.X * 3, g.Y * 3, g.Z * 3 + e[..., None].squeeze() * 0.0, 9.0, 4, seed=63.0)
    grs = smoothstep(1.05, 0.7, e + (swirl - 0.5) * 0.25)
    col = col * (1 - grs[..., None]) + (np.array([0.72, 0.34, 0.20]) * (0.85 + 0.3 * swirl[..., None])) * grs[..., None]
    col *= (1 + 0.18 * np.exp(-((e - 1.15) / 0.12) ** 2))[..., None]
    rs = RNG(64)
    for _ in range(9):
        lo0, la0 = rs.uniform(-180, 180), rs.choice([-41.0, -33.5, 39.0])
        d = np.sqrt((np.angle(np.exp(1j * np.radians(g.lon - lo0))) * 180 / np.pi / 3.0) ** 2 + ((lat - la0) / 1.8) ** 2)
        col = col * (1 - smoothstep(1.0, 0.6, d)[..., None] * 0.6) + np.array([0.95, 0.93, 0.9]) * smoothstep(1.0, 0.6, d)[..., None] * 0.6
    fest = smoothstep(0.62, 0.8, fbm3(g.X * 1, g.Y * 1, g.Z * 2, 14.0, 4, seed=65.0)) * np.exp(-((lat - 7.5) / 2.2) ** 2)
    col = col * (1 - fest[..., None] * 0.5) + np.array([0.30, 0.34, 0.40]) * fest[..., None] * 0.5
    save_rgb("planet_jupiter_albedo.webp", g.upsample(np.clip(col, 0, 1), 4096))


def saturn():
    g = Grid(2048)
    lat = g.lat
    sx, sy, sz = g.X, g.Y, g.Z * 6.0
    wrp = fbm3(sx, sy, sz, 1.2, 4, seed=71.0) - 0.5
    tb = fbm3(sx + wrp, sy - wrp, sz, 2.6, 6, gain=0.55, seed=72.0)
    la = lat + (tb - 0.5) * 2.0
    stops = [(-90, 0.42), (-70, 0.50), (-55, 0.58), (-40, 0.54), (-30, 0.66), (-20, 0.60), (-10, 0.78), (0, 0.84), (10, 0.80), (18, 0.62), (25, 0.70),
             (35, 0.58), (45, 0.64), (55, 0.54), (65, 0.50), (75, 0.44), (90, 0.36)]
    zone = np.interp(la, np.array([s[0] for s in stops], np.float32), np.array([s[1] for s in stops], np.float32))
    t = np.clip(zone + (tb - 0.5) * 0.12, 0, 1)
    col = palette(t, [(0, (0.40, 0.36, 0.30)), (0.5, (0.72, 0.62, 0.45)), (0.8, (0.86, 0.79, 0.62)), (1, (0.93, 0.88, 0.74))])
    # the north polar hexagon (about 78 N) around the blue-grey polar vortex
    phi = np.radians(g.lon)
    hexr = 90 - 78 + 0.0
    rr = (90 - lat) / np.cos(np.pi / 6) * np.cos(((phi + 0.3) % (np.pi / 3)) - np.pi / 6)
    hexband = np.exp(-((rr - hexr) / 1.2) ** 2) * (lat > 60)
    col = col * (1 - 0.35 * hexband[..., None]) + np.array([0.48, 0.47, 0.42]) * 0.35 * hexband[..., None]
    polar = smoothstep(80, 88, lat)
    col = col * (1 - 0.6 * polar[..., None]) + np.array([0.35, 0.40, 0.46]) * 0.6 * polar[..., None]
    save_rgb("planet_saturn_albedo.webp", g.upsample(np.clip(col, 0, 1), 4096))
    # rings: radial profile from 66 900 to 140 220 km
    N = 2048
    r = 66900 + (np.arange(N) + 0.5) / N * (140220 - 66900)
    tau = np.zeros(N)
    col = np.zeros((N, 3))
    rs = RNG(73)
    fine = np.cumsum(rs.normal(0, 1, N))
    fine = (fine - np.convolve(fine, np.ones(31) / 31, mode="same"))
    fine = fine / (np.abs(fine).max() + 1e-9)
    def band(a, b, t0, c):
        m = (r >= a) & (r < b)
        tau[m] = t0
        col[m] = c
    band(66900, 74510, 0.002, (0.45, 0.42, 0.40))
    band(74658, 92000, 0.08, (0.48, 0.44, 0.40))
    for a, b, t0 in [(78900, 80400, 0.18), (84500, 86200, 0.25), (88600, 89300, 0.22), (90200, 91900, 0.15)]:
        m = (r >= a) & (r < b); tau[m] = t0
    band(92000, 99000, 1.1, (0.80, 0.72, 0.58))
    band(99000, 104500, 2.4, (0.86, 0.78, 0.63))
    band(104500, 110000, 3.4, (0.88, 0.80, 0.65))
    band(110000, 117580, 2.0, (0.84, 0.76, 0.61))
    band(117580, 122170, 0.10, (0.42, 0.40, 0.38))
    band(122170, 133423, 0.55, (0.72, 0.66, 0.56))
    band(133745, 136485, 0.45, (0.70, 0.64, 0.54))
    band(136527, 136775, 0.40, (0.70, 0.64, 0.54))
    band(136775, 139380, 0.01, (0.5, 0.48, 0.45))
    for a, b in [(77745, 77895), (87490, 87760), (117680, 118120), (133423, 133745), (136485, 136527)]:
        m = (r >= a) & (r < b); tau[m] = 0.0
    m = np.abs(r - 140180) < 30; tau[m] = 0.6; col[m] = (0.82, 0.78, 0.72)
    # ringlet structure everywhere, strongest in the B ring
    tau *= 1 + fine * np.where((r > 92000) & (r < 117580), 0.35, 0.2)
    tau = np.clip(tau, 0, 4)
    img = np.zeros((8, N, 4), np.float32)
    img[..., :3] = col[None]
    img[..., 3] = (tau / 4.0)[None]
    save_rgba("ring_saturn.webp", img, q=95)


def ice_giant(id_, base, band_amp, spots):
    g = Grid(2048)
    lat = g.lat
    sx, sy, sz = g.X, g.Y, g.Z * 5.0
    tb = fbm3(sx, sy, sz, 2.2, 6, gain=0.55, seed=81.0 + len(id_))
    la = lat + (tb - 0.5) * 3
    bands = 0.5 + band_amp * (np.sin(np.radians(la) * 9) * 0.5 + np.sin(np.radians(la) * 23 + 1) * 0.25)
    col = np.array(base, np.float32)[None, None] * (0.85 + 0.3 * bands[..., None]) * (0.95 + 0.1 * tb[..., None])
    for (lo0, la0, w, h, c, k) in spots:
        d = np.sqrt((np.angle(np.exp(1j * np.radians(g.lon - lo0))) * 180 / np.pi / w) ** 2 + ((lat - la0) / h) ** 2)
        m = smoothstep(1.0, 0.5, d)[..., None] * k
        col = col * (1 - m) + np.array(c) * m
    if id_ == "neptune":
        streak = smoothstep(0.78, 0.9, fbm3(g.X * 1, g.Y * 1, g.Z * 4, 10.0, 4, seed=83.0)) * (np.abs(np.abs(lat) - 25) < 12)
        col = col * (1 - streak[..., None] * 0.8) + 0.95 * streak[..., None] * 0.8
    if id_ == "uranus":
        pol = smoothstep(40, 75, lat)
        col = col * (1 + 0.12 * pol[..., None])
    save_rgb(f"planet_{id_}_albedo.webp", np.clip(col, 0, 1))


def venus():
    g = Grid(2048)
    lat = g.lat
    sx, sy, sz = g.X, g.Y, g.Z * 3.0
    wrp = fbm3(sx, sy, sz, 1.5, 4, seed=91.0) - 0.5
    tb = fbm3(sx + wrp * 1.5, sy, sz - wrp, 3.0, 6, gain=0.55, seed=92.0)
    # the dark 'Y' pattern of the upper cloud layer, faint in visible light
    lonr = np.radians(g.lon)
    ypat = np.exp(-((np.abs(lat) - 18 - 22 * np.cos(lonr)) / 10) ** 2) * 0.5 + np.exp(-((lat) / 8) ** 2) * (np.cos(lonr) > 0.2)
    t = np.clip(0.62 + (tb - 0.5) * 0.35 - 0.1 * ypat, 0, 1)
    col = palette(t, [(0, (0.74, 0.62, 0.42)), (0.5, (0.90, 0.82, 0.62)), (1, (0.98, 0.94, 0.82))])
    save_rgb("planet_venus_albedo.webp", np.clip(col, 0, 1))


def generic_ice_moon(id_, base, dark=None, seed=0, n=2500, lineae=0):
    g = Grid(2048)
    hl = g.fbm(3.0, 6, 100.0 + seed)
    col = np.array(base, np.float32)[None, None] * (0.9 + 0.2 * hl[..., None])
    h = (hl - 0.5) * 1.5
    if dark is not None:
        dmask, dcol = dark(g)
        col = col * (1 - dmask[..., None]) + np.array(dcol) * dmask[..., None]
    rs = RNG(200 + seed)
    if lineae:
        mott = smoothstep(0.5, 0.75, g.fbm(6.0, 5, 210.0 + seed, warp=0.8))
        col = col * (1 - 0.25 * mott[..., None]) + np.array([0.62, 0.45, 0.32]) * 0.25 * mott[..., None]
    for _ in range(lineae):
        # small-circle arcs, broken into segments: thin reddish-brown lineae with a faint bright medial ridge
        p = rs.normal(size=3); p /= np.linalg.norm(p)
        c0 = rs.uniform(-0.7, 0.7)
        d = np.abs(g.X * p[0] + g.Y * p[1] + g.Z * p[2] - c0)
        seg = vnoise3(g.X * 2.5 + rs.uniform(0, 50), g.Y * 2.5, g.Z * 2.5) > rs.uniform(0.45, 0.65)
        w = rs.uniform(0.0012, 0.003)
        m = np.exp(-(d / w) ** 2) * seg
        ridge = np.exp(-(d / (w * 0.25)) ** 2) * seg
        col = col * (1 - 0.28 * m[..., None]) + np.array([0.50, 0.32, 0.22]) * 0.28 * m[..., None]
        col = col * (1 + 0.1 * ridge[..., None])
        h += m * 0.3
    if n:
        craters(g, h, col, n, 0.3, 2.5, 300 + seed, depth=0.8, slope=2.1, bright=0.12)
    rocky_out(id_, g, np.clip(col, 0, 1), h, 6.0)


def io():
    g = Grid(2048)
    hl = g.fbm(3.0, 6, 111.0, warp=0.8)
    t = np.clip(hl + 0.15 * (g.fbm(8.0, 4, 112.0) - 0.5), 0, 1)
    col = palette(t, [(0, (0.62, 0.52, 0.22)), (0.4, (0.86, 0.78, 0.40)), (0.7, (0.92, 0.88, 0.62)), (1, (0.95, 0.93, 0.80))])
    pol = smoothstep(50, 80, np.abs(g.lat))
    col = col * (1 - 0.4 * pol[..., None]) + np.array([0.55, 0.42, 0.32]) * 0.4 * pol[..., None]
    rs = RNG(113)
    h = (hl - 0.5) * 1.0
    for i in range(70):
        lo0, la0 = rs.uniform(-180, 180), np.degrees(np.arcsin(rs.uniform(-0.9, 0.9)))
        r = rs.uniform(0.4, 1.6)
        d = g.ang(lo0, la0)
        core = smoothstep(r, r * 0.4, d)
        col = col * (1 - core[..., None]) + np.array([0.12, 0.08, 0.06]) * core[..., None]
        if i < 6:
            ring = np.exp(-((d - r * 5) / (r * 1.4)) ** 2) * 0.6
            col = col * (1 - ring[..., None]) + np.array([0.75, 0.30, 0.14]) * ring[..., None]
        h += core * 0.4
    rocky_out("io", g, np.clip(col, 0, 1), h, 4.0)


def titan():
    g = Grid(1024)
    hl = g.fbm(2.5, 5, 121.0, warp=0.6)
    t = np.clip(0.55 + (hl - 0.5) * 0.25, 0, 1)
    col = palette(t, [(0, (0.62, 0.40, 0.16)), (1, (0.84, 0.60, 0.28))])
    col *= (1 - 0.1 * smoothstep(60, 85, g.lat))[..., None]
    save_rgb("planet_titan_albedo.webp", np.clip(col, 0, 1))


def iapetus():
    def dark(g):
        # leading hemisphere centred on longitude 90 W: Cassini Regio
        d = g.ang(-90, 0)
        return smoothstep(80, 55, d + 12 * (g.fbm(4, 4, 131.0) - 0.5) * 2) * 0.95, (0.08, 0.06, 0.05)
    generic_ice_moon("iapetus", (0.75, 0.72, 0.66), dark=dark, seed=31, n=1800)


def enceladus():
    def dark(g):
        stripes = np.zeros_like(g.lat)
        for k in range(4):
            stripes = np.maximum(stripes, np.exp(-((g.lat + 80 + k * 3.2 - 3.0 * np.sin(np.radians(g.lon) * 2 + k)) / 0.5) ** 2))
        return stripes * 0.6, (0.55, 0.70, 0.80)
    generic_ice_moon("enceladus", (0.95, 0.96, 0.97), dark=dark, seed=41, n=900)


def lazarus_miller():
    g = Grid(2048)
    hl = g.fbm(2.2, 6, 141.0, warp=0.7)
    col = np.array([0.16, 0.25, 0.33], np.float32)[None, None] * (0.85 + 0.3 * hl[..., None])
    shoal = smoothstep(0.62, 0.78, g.fbm(3.0, 6, 142.0))
    col = col * (1 - shoal[..., None] * 0.35) + np.array([0.33, 0.38, 0.36]) * shoal[..., None] * 0.35
    save_rgb("planet_miller_albedo.webp", np.clip(col, 0, 1))
    # thin streaky cloud and haze bands
    cl = fbm3(g.X, g.Y, g.Z * 2.5, 4.0, 7, gain=0.55, seed=143.0)
    cov = smoothstep(0.55, 0.78, cl) * 0.75 + 0.12
    save_rgba("planet_miller_clouds.webp", np.concatenate([np.ones(cov.shape + (3,), np.float32) * 0.93, cov[..., None]], -1))


def lazarus_mann():
    g = Grid(2048)
    hl = g.fbm(3.0, 7, 151.0, gain=0.58)
    ridges = g.fbm(9.0, 5, 152.0, ridged=True)
    t = np.clip(0.6 + (hl - 0.5) * 0.5 + (ridges - 0.5) * 0.25, 0, 1)
    col = palette(t, [(0, (0.46, 0.50, 0.55)), (0.5, (0.72, 0.75, 0.78)), (1, (0.92, 0.93, 0.95))])
    # crevasse fields: the creases of ridged noise, only where the ice is broken up
    cr = g.fbm(14.0, 4, 153.0, ridged=True, warp=0.6)
    cracks = smoothstep(0.82, 0.95, cr) * smoothstep(0.45, 0.65, g.fbm(3.0, 4, 155.0))
    col *= (1 - 0.35 * cracks)[..., None]
    h = (hl - 0.5) * 2.0 + ridges * 1.2 - cracks * 0.8
    rocky_out("mann", g, np.clip(col, 0, 1), h, 3.0)
    cl = fbm3(g.X, g.Y, g.Z * 2.0, 3.0, 7, gain=0.55, seed=154.0)
    cov = smoothstep(0.42, 0.66, cl) * 0.9
    save_rgba("planet_mann_clouds.webp", np.concatenate([np.ones(cov.shape + (3,), np.float32) * 0.96, cov[..., None]], -1))


def lazarus_edmunds():
    g = Grid(2048)
    hl = g.fbm(2.6, 7, 161.0, gain=0.56)
    mtn = g.fbm(6.0, 6, 162.0, ridged=True)
    basalt = smoothstep(0.58, 0.72, g.fbm(2.0, 5, 163.0, warp=0.8))
    t = np.clip(0.5 + (hl - 0.5) * 0.7 + 0.1 * (g.fbm(10, 4, 164.0) - 0.5), 0, 1)
    sand = palette(t, [(0, (0.46, 0.33, 0.22)), (0.5, (0.66, 0.50, 0.34)), (1, (0.80, 0.66, 0.48))])
    rock = palette(t, [(0, (0.22, 0.18, 0.15)), (1, (0.38, 0.31, 0.25))])
    col = sand * (1 - basalt[..., None]) + rock * basalt[..., None]
    col *= (0.9 + 0.2 * mtn)[..., None]
    pol = smoothstep(72, 82, np.abs(g.lat) + 4 * (g.fbm(8, 3, 165.0) - 0.5))
    col = col * (1 - pol[..., None]) + np.array([0.88, 0.88, 0.86]) * pol[..., None]
    h = (hl - 0.5) * 3.0 + mtn * 2.5 * smoothstep(0.5, 0.7, hl)
    craters(g, h, col, 140, 0.3, 2.0, 166, depth=0.35, slope=2.2, bright=0.02, rim=0.2)
    rocky_out("edmunds", g, np.clip(col, 0, 1), h, 2.2)
    cl = fbm3(g.X, g.Y, g.Z * 2.0, 3.5, 7, gain=0.55, seed=167.0)
    cov = smoothstep(0.62, 0.8, cl) * 0.8
    save_rgba("planet_edmunds_clouds.webp", np.concatenate([np.ones(cov.shape + (3,), np.float32) * 0.97, cov[..., None]], -1))


def uranus_rings():
    N = 512
    r = 41837 + (np.arange(N) + 0.5) / N * (51149 - 41837)
    tau = np.zeros(N)
    for c, w, t0 in [(41837, 4, 0.3), (42234, 5, 0.3), (42571, 4, 0.3), (44718, 8, 0.4), (45661, 8, 0.4), (47176, 6, 0.4), (47627, 6, 0.4), (48300, 10, 0.4), (51149, 40, 0.9)]:
        tau = np.maximum(tau, t0 * np.exp(-((r - c) / max(w * 4, 25)) ** 2))
    img = np.zeros((4, N, 4), np.float32)
    img[..., :3] = 0.12
    img[..., 3] = (tau / 4.0)[None]
    save_rgba("ring_uranus.webp", img, q=95)


JOBS = {
    "moon": moon, "mercury": mercury, "mars": mars, "jupiter": jupiter, "saturn": saturn, "venus": venus, "io": io, "titan": titan,
    "uranus": lambda: ice_giant("uranus", (0.66, 0.84, 0.86), 0.06, []),
    "neptune": lambda: ice_giant("neptune", (0.24, 0.42, 0.82), 0.15, [(-60, -20, 9, 5, (0.12, 0.2, 0.45), 0.8), (40, -55, 4, 2.5, (0.15, 0.25, 0.5), 0.6)]),
    "europa": lambda: generic_ice_moon("europa", (0.88, 0.84, 0.76), seed=1, n=120, lineae=140),
    "ganymede": lambda: generic_ice_moon("ganymede", (0.62, 0.58, 0.52), dark=lambda g: (smoothstep(0.45, 0.6, g.fbm(2.0, 5, 171.0, warp=0.8)) * 0.85, (0.30, 0.27, 0.24)), seed=2, n=2600, lineae=0),
    "callisto": lambda: generic_ice_moon("callisto", (0.32, 0.28, 0.24), seed=3, n=5200),
    "rhea": lambda: generic_ice_moon("rhea", (0.80, 0.79, 0.77), seed=4, n=3800),
    "triton": lambda: generic_ice_moon("triton", (0.78, 0.70, 0.66), dark=lambda g: (smoothstep(-10, -40, g.lat) * 0.5, (0.92, 0.82, 0.78)), seed=5, n=300),
    "iapetus": iapetus, "enceladus": enceladus,
    "miller": lazarus_miller, "mann": lazarus_mann, "edmunds": lazarus_edmunds, "uranus_rings": uranus_rings,
}

if __name__ == "__main__":
    which = sys.argv[1:] or list(JOBS)
    for k in which:
        t0 = time.time()
        JOBS[k]()
        print(f"  {k:12s} {time.time() - t0:6.1f}s", flush=True)
