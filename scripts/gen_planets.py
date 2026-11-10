"""
Solar-system body maps (equirectangular, x: lon −180→180, y: lat +90→−90) for the orbit/flyby renderer.

    /home/user/blenv/bin/python scripts/gen_planets.py [body ...] [--draft]

Real feature layouts where they matter for recognisability (planetocentric latitude / east longitude, approximate):
  Moon — maria (Procellarum, Imbrium, Serenitatis, Tranquillitatis, Crisium, Fecunditatis, Nectaris, Nubium, Humorum,
         Frigoris, …), far-side basins, ray craters Tycho / Copernicus / Kepler / Aristarchus.
  Mars — Syrtis Major, Acidalium, Erythraeum, Meridiani, Cimmerium, Sirenum, Tyrrhenum, Solis Lacus; Hellas, Argyre,
         Tharsis with Olympus/Ascraeus/Pavonis/Arsia Mons, Valles Marineris; polar caps; north/south dichotomy.
  Jupiter — belt/zone latitudes (EZ, NEB, SEB, tropical/temperate belts), Great Red Spot at 22° S, white ovals.
  Saturn — muted belts, north polar hexagon at 78° N.  Uranus/Neptune — haze bands, Neptune's dark spot.
  Io, Europa, Ganymede, Callisto, Titan, Enceladus, Mimas, Triton, Iapetus — signature terrains.
Outputs (public/assets/textures):
  planet_<id>.jpg      albedo (sRGB)
  planet_<id>_aux.jpg  R = height (0.5 = datum, bump), G = specular, B = emissive/glow   (rocky bodies)
  saturn_rings_rgba.png  radial profile 1024×4: RGB colour, A opacity (C ring … F ring)
"""
import os, sys, math
import numpy as np
from PIL import Image
from scipy import ndimage
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gen_earth import vnoise, fbm, smooth, gauss   # noqa: E402

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
OUT = os.path.join(ROOT, "public", "assets", "textures")
DRAFT = "--draft" in sys.argv
RNG = np.random.default_rng(1969)


def grid(w, h):
    if DRAFT:
        w, h = w // 4, h // 4
    lon = (np.arange(w, dtype=np.float32) + 0.5) / w * 2 * np.pi - np.pi
    lat = np.pi / 2 - (np.arange(h, dtype=np.float32) + 0.5) / h * np.pi
    LON, LAT = np.meshgrid(lon, lat)
    cl = np.cos(LAT)
    P = (cl * np.cos(LON), np.sin(LAT), cl * np.sin(LON))
    return LAT, LON, P, w, h


def ell(LAT, LON, lat0, lon0, rlat, rlon, power=2.0):
    """Wrap-aware soft ellipse in degrees (great-circle-ish: longitude scaled by cos(lat0))."""
    dlat = np.degrees(LAT) - lat0
    dlon = (np.degrees(LON) - lon0 + 180.0) % 360.0 - 180.0
    return np.exp(-((np.abs(dlat / rlat)) ** power + (np.abs(dlon / rlon)) ** power))


def warp(LAT, LON, P, seed, amp_deg=6.0, freq=4.0):
    """Domain-warped lat/lon (radians) for ragged, natural feature outlines."""
    a = math.radians(amp_deg)
    wl = (fbm(P, freq, 5, seed) - 0.5) * 2 * a
    wo = (fbm(P, freq, 5, seed + 3) - 0.5) * 2 * a / np.maximum(0.25, np.cos(LAT))
    return LAT + wl, LON + wo


def ang_dist(LAT, LON, lat0, lon0):
    s = np.sin((LAT - lat0) / 2) ** 2 + np.cos(LAT) * math.cos(lat0) * np.sin((LON - lon0) / 2) ** 2
    return 2 * np.arcsin(np.sqrt(np.clip(s, 0, 1)))


def craters(Hm, A, LAT, LON, n, rmin_deg, rmax_deg, seed, depth=1.0, young=0.08, rays=(), albedo_amp=0.06, mare=None):
    """Crater field: bowls with raised rims and ejecta on the height map, darker floors / bright rims on the albedo.
    Sizes follow a cumulative power law N(>r) ∝ r⁻²; 'young' fraction get bright ejecta halos; 'rays' = explicit
    (lat, lon, radius_deg, ray_length_factor) ray craters."""
    rng = np.random.default_rng(seed)
    h, w = Hm.shape
    rmin, rmax = math.radians(rmin_deg), math.radians(rmax_deg)
    lat_px = math.pi / h
    items = []
    for i in range(n):
        u = rng.random()
        r = min(rmax, rmin * (1 - u * (1 - (rmin / rmax) ** 2)) ** -0.5)
        lat0 = math.asin(rng.random() * 2 - 1)
        lon0 = rng.random() * 2 * math.pi - math.pi
        items.append((lat0, lon0, r, rng.random() < young, 0.0))
    for (la, lo, rd, ln) in rays:
        items.append((math.radians(la), math.radians(lo), math.radians(rd), True, ln))
    for (lat0, lon0, r, yng, ray) in items:
        ext = r * (3.2 if not ray else 3.2 + ray)
        y0 = max(0, int((math.pi / 2 - (lat0 + ext)) / lat_px))
        y1 = min(h, int((math.pi / 2 - (lat0 - ext)) / lat_px) + 2)
        if y1 <= y0:
            continue
        cl = max(0.05, math.cos(lat0) - math.sin(min(ext, 1.2)))
        dlon = ext / cl
        if dlon >= math.pi or y0 == 0 or y1 == h:
            xs = np.arange(w)
        else:
            xa = int(((lon0 - dlon) + math.pi) / (2 * math.pi) * w)
            xb = int(((lon0 + dlon) + math.pi) / (2 * math.pi) * w) + 2
            xs = np.arange(xa, xb) % w
        sl = (slice(y0, y1), xs)
        d = ang_dist(LAT[y0:y1][:, xs], LON[y0:y1][:, xs], lat0, lon0)
        x = d / r
        bowl = np.where(x < 1, -(1 - x * x), 0.0) * 0.9
        rim = 0.32 * np.exp(-((x - 1.0) / 0.16) ** 2)
        ejecta = np.where(x > 1, 0.12 * np.exp(-(x - 1.0) * 2.2), 0.0)
        prof = (bowl + rim + ejecta) * depth * (r / rmax) ** 0.55
        if r > math.radians(2.5):   # large craters: flat floor + central peak
            prof = np.where(x < 0.7, -0.55 * depth * (r / rmax) ** 0.55 + 0.25 * depth * np.exp(-(x / 0.12) ** 2) * (r / rmax) ** 0.55, prof)
        Hm[y0:y1, xs] += prof.astype(np.float32)
        a = np.where(x < 1, -albedo_amp * 0.6, 0.0) + albedo_amp * 0.7 * np.exp(-((x - 1.0) / 0.2) ** 2)
        if yng:
            a += albedo_amp * 2.2 * np.exp(-np.maximum(0, x - 0.9) * 1.6) * (x > 0.85)
        if ray > 0:
            # bright ray system: thin streaks radiating to `ray` crater radii
            ang = np.arctan2(np.sin(LON[y0:y1][:, xs] - lon0) * np.cos(LAT[y0:y1][:, xs]),
                             np.cos(lat0) * np.sin(LAT[y0:y1][:, xs]) - math.sin(lat0) * np.cos(LAT[y0:y1][:, xs]) * np.cos(LON[y0:y1][:, xs] - lon0))
            streak = np.zeros_like(ang)
            rr = np.random.default_rng(int(abs(lon0) * 1e4))
            for k in range(26):
                a0 = rr.random() * 2 * math.pi
                wdt = 0.02 + rr.random() * 0.05
                L = 0.4 + rr.random() * 0.6
                da = np.angle(np.exp(1j * (ang - a0)))
                streak = np.maximum(streak, np.exp(-(da / wdt) ** 2) * (x < (1 + ray * L)) * np.exp(-np.maximum(0, x - 1) / (ray * L * 0.6)))
            a += streak * 0.22
        if mare is not None:
            a *= 1.0 - 0.5 * mare[y0:y1, xs]
        A[y0:y1, xs] += a.astype(np.float32)


def save(name, rgb, aux=None):
    rgb = np.clip(rgb, 0, 1)
    Image.fromarray((rgb * 255).astype(np.uint8)).save(os.path.join(OUT, f"planet_{name}.jpg"), quality=90, subsampling=0)
    if aux is not None:
        Image.fromarray((np.clip(aux, 0, 1) * 255).astype(np.uint8)).save(os.path.join(OUT, f"planet_{name}_aux.jpg"), quality=92, subsampling=0)
    print(f"[planets] {name} {rgb.shape[1]}×{rgb.shape[0]}")


def height_aux(Hm, spec=None, glow=None, scale=1.0):
    Hm = Hm - np.median(Hm)
    s = max(1e-6, np.percentile(np.abs(Hm), 99.5))
    hh = 0.5 + 0.5 * np.clip(Hm / s * scale, -1, 1)
    z = np.zeros_like(Hm)
    return np.stack([hh, z if spec is None else spec, z if glow is None else glow], -1)


def C(r, g, b):
    return np.array([r, g, b], np.float32)


def mix(a, b, t):
    t = t[..., None] if np.ndim(t) == 2 else t
    return a * (1 - t) + b * t


# ===================================================================================================== bodies
def moon():
    LAT, LON, P, w, h = grid(2048, 1024)
    hi = C(0.62, 0.6, 0.57)   # highlands
    ma = C(0.27, 0.27, 0.27)  # maria
    maria = [  # (lat, lon, rlat, rlon)
        (18, -57, 20, 22), (5, -45, 14, 14), (33, -16, 11, 14), (28, 17, 8, 9), (8.5, 31, 9, 12), (17, 59, 5, 6.5),
        (-8, 51, 8, 7), (-15, 35, 5, 5), (-21, -17, 8, 11), (-24, -39, 4.5, 5), (56, 5, 4, 38), (13, 4, 3, 4),
        (7, -31, 5, 7), (-10, -23, 4, 4), (27, 148, 3, 3.5), (-20, -95, 3, 3), (-40, -160, 3, 4), (20, 85, 4, 6),
    ]
    m = np.zeros(LAT.shape, np.float32)
    n1 = fbm(P, 5.0, 5, 7)
    WL, WO = warp(LAT, LON, P, 9, amp_deg=7.0, freq=3.5)
    for (la, lo, rl, rn) in maria:
        m = m + ell(WL, WO, la, lo, rl * 1.35, rn * 1.35, 2.0)     # soft union: neighbouring maria merge
    m = smooth(0.22, 0.42, m * (0.8 + 0.6 * (n1 - 0.5)))
    spa = ell(LAT, LON, -53, -169, 22, 30)   # South Pole–Aitken basin (subtle darkening, low)
    A = np.zeros(LAT.shape, np.float32)
    Hm = (-0.35 * m - 0.5 * spa + 0.25 * (fbm(P, 3.0, 5, 11) - 0.5)).astype(np.float32)
    craters(Hm, A, LAT, LON, 2600 if not DRAFT else 600, 0.35, 9.0, 21, depth=1.0, young=0.05, albedo_amp=0.05, mare=m,
            rays=((-43.3, -11.2, 0.75, 14), (9.6, -20.1, 0.8, 7), (8.1, -38.0, 0.25, 6), (23.7, -47.4, 0.35, 5), (-8.9, 15.5, 0.12, 4)))
    det = fbm(P, 40.0, 4, 31)
    base = mix(hi, ma, m * 0.92 + 0.12 * spa)
    rgb = base * (0.86 + 0.28 * det[..., None]) + A[..., None]
    rgb = mix(rgb, rgb * C(1.02, 0.98, 0.93), m * 0.5)
    save("moon", rgb, height_aux(Hm))


def mercury():
    LAT, LON, P, w, h = grid(2048, 1024)
    A = np.zeros(LAT.shape, np.float32)
    Hm = (0.3 * (fbm(P, 3.0, 5, 41) - 0.5)).astype(np.float32)
    caloris = ell(LAT, LON, 30, -170, 11, 13)
    Hm -= 0.25 * caloris
    craters(Hm, A, LAT, LON, 3000 if not DRAFT else 700, 0.3, 9.0, 43, depth=1.1, young=0.12, albedo_amp=0.09,
            rays=((58, 16.8, 0.5, 10), (-44, -32, 0.3, 6), (-21, -60, 0.25, 5)))
    det = fbm(P, 24.0, 4, 47)
    base = C(0.47, 0.45, 0.42) * (0.82 + 0.36 * det[..., None]) * (1 + 0.12 * caloris[..., None])
    rgb = mix(base, base * C(0.9, 0.88, 0.95), smooth(0.55, 0.75, fbm(P, 6.0, 4, 49)) * 0.6) + A[..., None]
    save("mercury", rgb, height_aux(Hm))


def venus():
    """Cloud tops: pale sulphur-yellow with faint dark Y-shaped streaks driven by the 4-day super-rotation."""
    LAT, LON, P, w, h = grid(2048, 1024)
    la = np.degrees(LAT)
    warp = fbm(P, 2.0, 4, 61) - 0.5
    # the Y feature: chevrons pointing west from the equator
    chevron = np.sin(np.radians(np.degrees(LON) + 70 * np.abs(np.sin(LAT)) ** 0.7 + warp * 60) * 2.0)
    streak = fbm((P[0] * 1.0, P[1] * 4.0, P[2] * 1.0), 6.0, 5, 63)
    dark = smooth(0.3, 0.9, 0.5 + 0.35 * chevron * np.exp(-(la / 45) ** 2)) * 0.5 + 0.5 * smooth(0.5, 0.8, streak)
    base = mix(C(0.94, 0.89, 0.74), C(0.74, 0.64, 0.44), dark * 0.55)
    base = mix(base, C(0.97, 0.95, 0.88), smooth(55, 80, np.abs(la)) * 0.6)   # bright polar collars
    save("venus", base * (0.95 + 0.1 * fbm(P, 30.0, 3, 67)[..., None]))


def mars():
    LAT, LON, P, w, h = grid(2048, 1024)
    la, lo = np.degrees(LAT), np.degrees(LON)
    n1, n2 = fbm(P, 4.0, 6, 71), fbm(P, 18.0, 5, 73)
    dark_regions = [(8, 70, 16, 11), (48, -25, 12, 26), (-24, -38, 13, 34), (-3, 2, 6, 18), (-23, 142, 11, 30), (-30, -152, 11, 28),
                    (-15, 102, 10, 22), (-26, -86, 5, 8), (22, 118, 7, 14), (-48, 22, 8, 28), (38, -128, 5, 14), (4, 28, 7, 14),
                    (-20, 175, 10, 18), (-12, 55, 8, 12), (60, 60, 6, 40)]
    dk = np.zeros(LAT.shape, np.float32)
    WL, WO = warp(LAT, LON, P, 79, amp_deg=8.0, freq=3.0)
    for (a, b, c, d) in dark_regions:
        dk = dk + ell(WL, WO, a, b, c * 1.3, d * 1.3, 1.8)
    # the southern dark belt (Erythraeum–Cimmerium–Sirenum–Tyrrhenum) is nearly continuous
    dk = np.maximum(dk, 0.75 * np.exp(-((la + 24 + 6 * np.sin(np.radians(lo) * 2)) / 10) ** 2) * (1 - ell(LAT, LON, -42, 70, 14, 20)))
    dk = smooth(0.28, 0.7, dk * (0.7 + 0.8 * (n1 - 0.5)))
    hellas = ell(LAT, LON, -42, 70, 12, 17)
    argyre = ell(LAT, LON, -50, -43, 6, 8)
    tharsis = ell(LAT, LON, 0, -110, 22, 28)
    # height: south highlands up, Tharsis bulge, giant volcanoes, basins down, Valles Marineris trench
    Hm = (0.35 * np.tanh((-la + 5 + 15 * (n1 - 0.5)) / 18) + 0.7 * tharsis - 0.9 * hellas - 0.5 * argyre).astype(np.float32)
    for (a, b, r, hgt) in ((18.6, -134, 6.5, 2.4), (11.9, -104.5, 3.0, 1.4), (-0.8, -112.9, 3.0, 1.3), (-8.4, -120.1, 3.5, 1.3), (25, 147, 2.5, 0.8)):
        d = np.degrees(ang_dist(LAT, LON, math.radians(a), math.radians(b)))
        Hm += (hgt * np.exp(-(d / r) ** 1.6) - 0.15 * hgt * np.exp(-(d / (r * 0.12)) ** 2)).astype(np.float32)
    vm = np.exp(-(((la + 13) - 2.5 * np.sin(np.radians(lo + 60) * 3)) / 1.6) ** 2) * smooth(-95, -80, lo) * smooth(-30, -42, lo)
    Hm -= 0.8 * vm
    A = np.zeros(LAT.shape, np.float32)
    south = smooth(10, -10, la)
    craters(Hm, A, LAT, LON, 1600 if not DRAFT else 400, 0.35, 6.0, 77, depth=0.6, young=0.02, albedo_amp=0.03)
    light = C(0.7, 0.47, 0.32)
    darkc = C(0.34, 0.25, 0.2)
    rgb = mix(light, darkc, dk * 0.85)
    rgb = mix(rgb, C(0.82, 0.58, 0.38), hellas * 0.6 + argyre * 0.4)
    rgb = mix(rgb, C(0.66, 0.38, 0.22), tharsis * 0.35)
    rgb = mix(rgb, C(0.3, 0.2, 0.15), vm * 0.7)
    rgb *= (0.88 + 0.24 * n2[..., None])
    rgb += A[..., None] * 0.8
    # polar caps: north residual cap with spiral troughs, south cap offset toward −45°
    spiral = np.sin(np.radians(lo) * 1.0 + (90 - la) * 0.55)
    ncap = smooth(78.5, 82, la + 2.5 * (n1 - 0.5)) * (0.75 + 0.25 * smooth(-0.3, 0.3, spiral))
    sd = np.degrees(ang_dist(LAT, LON, math.radians(-87), math.radians(-45)))
    scap = smooth(6.5, 3.5, sd + 2 * (n1 - 0.5))
    frost = smooth(62, 75, np.abs(la)) * 0.25
    caps = np.clip(ncap + scap + frost, 0, 1)
    rgb = mix(rgb, C(0.93, 0.92, 0.9), caps)
    save("mars", rgb, height_aux(Hm, scale=1.2))


def bands_tex(w, h, table, seed, turb=0.04, stretch=9.0, spots=(), polar=None):
    """Gas giant: colour by latitude table [(lat_deg, (r,g,b)), …], advected turbulence stretched along longitude,
    shear at band edges, vortex spots [(lat, lon, rlat, rlon, colour, strength)]."""
    LAT, LON, P, w, h = grid(w, h)
    la = np.degrees(LAT)
    # turbulent latitude displacement (stretched noise) → band edges wave and curl
    q = fbm((P[0] * 1.0, P[1] * stretch, P[2] * 1.0), 3.0, 6, seed)
    q2 = fbm((P[0] * 1.0, P[1] * stretch * 2.0, P[2] * 1.0), 8.0, 5, seed + 1)
    lat_eff = la + (q - 0.5) * turb * 180 + (q2 - 0.5) * turb * 50
    lats = np.array([t[0] for t in table], np.float32)
    cols = np.array([t[1] for t in table], np.float32)
    order = np.argsort(lats)
    lats, cols = lats[order], cols[order]
    rgb = np.stack([np.interp(lat_eff, lats, cols[:, i]) for i in range(3)], -1)
    fine = fbm((P[0], P[1] * stretch * 0.7, P[2]), 22.0, 4, seed + 2)
    rgb *= (0.9 + 0.2 * fine[..., None])
    for (a, b, rl, rn, col, s) in spots:
        e = ell(LAT, LON, a, b, rl, rn, 2.0)
        swirl = 0.85 + 0.3 * fbm(P, 30.0, 3, seed + 9)
        rgb = mix(rgb, np.array(col, np.float32) * swirl[..., None], np.clip(e * s, 0, 1))
        rgb = mix(rgb, rgb * 0.82, ell(LAT, LON, a, b, rl * 1.35, rn * 1.3, 2.0) * (1 - e) * 0.5)   # dark collar
    if polar is not None:
        pc, plat = polar
        pt = smooth(plat, plat + 15, np.abs(la))
        mott = fbm(P, 14.0, 4, seed + 5)
        rgb = mix(rgb, np.array(pc, np.float32) * (0.85 + 0.3 * mott[..., None]), pt)
    return rgb, LAT, LON, P


def jupiter():
    Z, Zc = (0.95, 0.9, 0.8), (0.9, 0.82, 0.68)
    Bb, Br = (0.62, 0.43, 0.3), (0.7, 0.5, 0.36)
    table = [(-90, (0.55, 0.55, 0.6)), (-58, (0.66, 0.62, 0.58)), (-45, Zc), (-40, (0.72, 0.6, 0.48)), (-36, Z), (-31, (0.68, 0.52, 0.4)),
             (-27, Zc), (-21, (0.93, 0.86, 0.74)), (-18, Br), (-12, Bb), (-8, Br), (-5, (0.88, 0.78, 0.6)), (0, (0.93, 0.86, 0.72)),
             (5, (0.88, 0.76, 0.58)), (8, Bb), (13, (0.58, 0.38, 0.26)), (17, Br), (21, Z), (25, (0.72, 0.56, 0.42)), (29, Zc),
             (34, (0.7, 0.58, 0.46)), (38, Z), (45, (0.74, 0.64, 0.54)), (58, (0.66, 0.62, 0.6)), (90, (0.55, 0.56, 0.6))]
    rgb, LAT, LON, P = bands_tex(2048, 1024, table, 101, turb=0.055, stretch=8.0,
                                 spots=((-22.0, 40.0, 5.5, 8.5, (0.82, 0.45, 0.3), 1.2), (-33.5, -70.0, 2.0, 2.6, (0.96, 0.94, 0.9), 1.0),
                                        (-40.0, 120.0, 1.4, 1.8, (0.96, 0.94, 0.9), 0.9), (-40.0, 150.0, 1.4, 1.8, (0.96, 0.94, 0.9), 0.9)),
                                 polar=((0.52, 0.54, 0.6), 60))
    la = np.degrees(LAT)
    # EZ festoons: dark blue-grey plumes trailing from the NEB's southern edge
    fest = smooth(0.62, 0.78, fbm((P[0] * 3.0, P[1] * 0.6, P[2] * 3.0), 6.0, 4, 107)) * np.exp(-((la - 6.5) / 2.0) ** 2)
    rgb = mix(rgb, np.array((0.42, 0.42, 0.48), np.float32), fest * 0.6)
    save("jupiter", rgb)


def saturn():
    table = [(-90, (0.62, 0.62, 0.6)), (-70, (0.72, 0.68, 0.58)), (-55, (0.8, 0.74, 0.6)), (-40, (0.84, 0.77, 0.6)), (-30, (0.82, 0.74, 0.56)),
             (-20, (0.88, 0.8, 0.62)), (-10, (0.86, 0.78, 0.58)), (0, (0.92, 0.85, 0.66)), (10, (0.87, 0.79, 0.58)), (20, (0.9, 0.82, 0.63)),
             (30, (0.83, 0.75, 0.57)), (40, (0.86, 0.79, 0.62)), (55, (0.8, 0.75, 0.62)), (70, (0.66, 0.66, 0.64)), (90, (0.5, 0.56, 0.6))]
    rgb, LAT, LON, P = bands_tex(2048, 1024, table, 131, turb=0.02, stretch=12.0)
    la, lo = np.degrees(LAT), np.degrees(LON)
    # north polar hexagon: a hexagonal jet at ~78° N with a darker interior
    ang = np.radians(lo)
    hexr = 1.0 / np.cos(((ang % (np.pi / 3)) - np.pi / 6))   # radius modulation of a hexagon
    colat = 90 - la
    edge = np.exp(-((colat - 12.0 * hexr / 1.1547) / 0.8) ** 2)
    inside = colat < 12.0 * hexr / 1.1547
    rgb = mix(rgb, np.array((0.48, 0.52, 0.56), np.float32), inside * 0.6)
    rgb = mix(rgb, np.array((0.78, 0.74, 0.66), np.float32), edge * 0.7)
    save("saturn", rgb)


def uranus():
    table = [(-90, (0.62, 0.84, 0.86)), (-40, (0.6, 0.82, 0.86)), (-20, (0.58, 0.8, 0.86)), (0, (0.56, 0.78, 0.85)),
             (20, (0.58, 0.8, 0.86)), (40, (0.62, 0.83, 0.87)), (90, (0.7, 0.88, 0.9))]
    rgb, LAT, LON, P = bands_tex(1024, 512, table, 151, turb=0.01, stretch=12.0)
    save("uranus", rgb)


def neptune():
    table = [(-90, (0.3, 0.42, 0.75)), (-60, (0.24, 0.36, 0.78)), (-45, (0.3, 0.46, 0.86)), (-30, (0.22, 0.36, 0.8)), (-15, (0.26, 0.42, 0.88)),
             (0, (0.24, 0.4, 0.86)), (15, (0.27, 0.43, 0.88)), (35, (0.22, 0.36, 0.8)), (60, (0.26, 0.4, 0.8)), (90, (0.3, 0.42, 0.75))]
    rgb, LAT, LON, P = bands_tex(1024, 512, table, 171, turb=0.02, stretch=10.0,
                                 spots=((-20.0, 30.0, 4.0, 7.0, (0.12, 0.2, 0.5), 1.0), (-55.0, 100.0, 1.2, 2.0, (0.14, 0.22, 0.5), 0.9)))
    la = np.degrees(LAT)
    cirrus = smooth(0.66, 0.8, fbm((P[0], P[1] * 14.0, P[2]), 6.0, 4, 177)) * (np.exp(-((la + 27) / 4) ** 2) + np.exp(-((la - 30) / 5) ** 2) + 0.6 * np.exp(-((la + 18) / 1.5) ** 2))
    rgb = mix(rgb, np.array((0.92, 0.94, 0.98), np.float32), np.clip(cirrus, 0, 1) * 0.9)
    save("neptune", rgb)


def io():
    LAT, LON, P, w, h = grid(1024, 512)
    n1, n2 = fbm(P, 5.0, 6, 201), fbm(P, 16.0, 5, 203)
    rgb = mix(C(0.88, 0.8, 0.42), C(0.92, 0.9, 0.78), smooth(0.45, 0.7, n1))
    rgb = mix(rgb, C(0.72, 0.5, 0.26), smooth(0.6, 0.8, n2) * 0.6)
    rgb = mix(rgb, C(0.62, 0.48, 0.36), smooth(55, 75, np.abs(np.degrees(LAT))) * 0.7)
    rng = np.random.default_rng(205)
    glow = np.zeros(LAT.shape, np.float32)
    for k in range(60):
        la0, lo0 = math.degrees(math.asin(rng.random() * 1.6 - 0.8)), rng.uniform(-180, 180)
        r = rng.uniform(0.6, 2.2)
        d = np.degrees(ang_dist(LAT, LON, math.radians(la0), math.radians(lo0)))
        rgb = mix(rgb, C(0.12, 0.09, 0.07), np.exp(-(d / (r * 0.4)) ** 2))
        if k < 6:   # Pele-style red plume rings
            rgb = mix(rgb, C(0.75, 0.3, 0.16), np.exp(-((d - r * 3.5) / (r * 0.8)) ** 2) * 0.6)
        glow = np.maximum(glow, np.exp(-(d / (r * 0.18)) ** 2) * (k % 3 == 0))
    save("io", rgb, np.stack([0.5 + 0.1 * (n1 - 0.5), np.zeros_like(n1), glow], -1))


def europa():
    LAT, LON, P, w, h = grid(1024, 512)
    n1 = fbm(P, 4.0, 6, 221)
    rgb = mix(C(0.86, 0.82, 0.74), C(0.7, 0.58, 0.44), smooth(0.5, 0.75, n1) * 0.6)
    # lineae: random great-circle arcs (reddish-brown double ridges)
    rng = np.random.default_rng(223)
    X, Y, Z = P
    lin = np.zeros(LAT.shape, np.float32)
    for k in range(70):
        n = rng.normal(size=3)
        n /= np.linalg.norm(n)
        d = np.abs(X * n[0] + Y * n[1] + Z * n[2])
        span = rng.random() * 0.7 + 0.3
        c = rng.normal(size=3)
        c /= np.linalg.norm(c)
        near = (X * c[0] + Y * c[1] + Z * c[2]) > (1 - span)
        lin = np.maximum(lin, np.exp(-(d / rng.uniform(0.0015, 0.005)) ** 2) * near)
    rgb = mix(rgb, C(0.55, 0.36, 0.24), lin * 0.8)
    rgb = mix(rgb, C(0.6, 0.45, 0.35), smooth(0.68, 0.8, fbm(P, 9.0, 4, 225)) * 0.5)   # chaos terrain
    Hm = (lin * 0.4 + 0.2 * (n1 - 0.5)).astype(np.float32)
    save("europa", rgb, height_aux(Hm, scale=0.6))


def ganymede():
    LAT, LON, P, w, h = grid(1024, 512)
    n1 = fbm(P, 3.0, 6, 241)
    dark = smooth(0.5, 0.64, n1 + 0.25 * ell(LAT, LON, 35, -150, 30, 50)) * 0.85   # Galileo Regio
    grooves = smooth(0.45, 0.65, fbm((P[0] * 1.0, P[1] * 3.0, P[2] * 1.0), 20.0, 4, 243))
    rgb = mix(C(0.7, 0.67, 0.62), C(0.4, 0.37, 0.33), dark)
    rgb *= (0.92 + 0.12 * grooves[..., None] * (1 - dark[..., None]))
    A = np.zeros(LAT.shape, np.float32)
    Hm = (0.1 * grooves * (1 - dark)).astype(np.float32)
    craters(Hm, A, LAT, LON, 500 if not DRAFT else 150, 0.4, 4.0, 245, young=0.25, albedo_amp=0.08)
    rgb = mix(rgb, C(0.85, 0.86, 0.9), smooth(65, 80, np.abs(np.degrees(LAT))) * 0.6) + A[..., None]
    save("ganymede", rgb, height_aux(Hm))


def callisto():
    LAT, LON, P, w, h = grid(1024, 512)
    A = np.zeros(LAT.shape, np.float32)
    Hm = np.zeros(LAT.shape, np.float32)
    craters(Hm, A, LAT, LON, 1800 if not DRAFT else 400, 0.3, 3.0, 261, young=0.35, albedo_amp=0.1)
    d = np.degrees(ang_dist(LAT, LON, math.radians(15), math.radians(-57)))
    valhalla = sum(np.exp(-((d - rr) / 0.8) ** 2) * 0.08 for rr in range(4, 28, 3)) + 0.2 * np.exp(-(d / 4) ** 2)
    rgb = C(0.34, 0.31, 0.27) * (0.85 + 0.3 * fbm(P, 12.0, 4, 263)[..., None]) + A[..., None] + valhalla[..., None]
    save("callisto", rgb, height_aux(Hm))


def titan():
    LAT, LON, P, w, h = grid(1024, 512)
    n1 = fbm(P, 3.0, 5, 281)
    dark = smooth(0.4, 0.55, n1 * (0.6 + 0.8 * np.exp(-(np.degrees(LAT) / 25) ** 2)))
    rgb = mix(C(0.86, 0.62, 0.32), C(0.7, 0.5, 0.26), dark * 0.25)
    save("titan", rgb)


def icy(name, seed, base, n=900, rmax=6.0, extra=None):
    LAT, LON, P, w, h = grid(1024, 512)
    A = np.zeros(LAT.shape, np.float32)
    Hm = (0.2 * (fbm(P, 3.0, 4, seed) - 0.5)).astype(np.float32)
    craters(Hm, A, LAT, LON, n if not DRAFT else n // 4, 0.4, rmax, seed + 1, young=0.1, albedo_amp=0.05)
    rgb = np.array(base, np.float32) * (0.88 + 0.24 * fbm(P, 14.0, 4, seed + 2)[..., None]) + A[..., None]
    if extra:
        rgb, Hm = extra(rgb, Hm, LAT, LON, P)
    save(name, rgb, height_aux(Hm))


def _enceladus(rgb, Hm, LAT, LON, P):
    la = np.degrees(LAT)
    stripes = np.zeros(LAT.shape, np.float32)
    for k in range(4):   # tiger stripes near the south pole
        stripes = np.maximum(stripes, np.exp(-(((la + 82) - (k - 1.5) * 2.4 + 1.5 * np.sin(np.radians(LON * 57.3) * 2)) / 0.35) ** 2) * smooth(-72, -76, la))
    rgb = mix(rgb, C(0.5, 0.62, 0.72), stripes)
    return rgb, Hm - 0.3 * stripes


def _mimas(rgb, Hm, LAT, LON, P):
    d = np.degrees(ang_dist(LAT, LON, 0.0, math.radians(-112)))
    x = d / 22.0
    Hm = Hm + (np.where(x < 1, -(1 - x * x) * 1.5, 0) + 0.6 * np.exp(-((x - 1) / 0.12) ** 2) + 0.8 * np.exp(-(x / 0.1) ** 2)).astype(np.float32)
    return rgb * (1 - 0.08 * (x < 1)[..., None]), Hm


def _iapetus(rgb, Hm, LAT, LON, P):
    lead = smooth(0.3, 0.6, np.cos(LON - math.radians(90)) * np.cos(LAT))   # Cassini Regio on the leading hemisphere
    rgb = mix(rgb, C(0.14, 0.1, 0.07), lead)
    ridge = np.exp(-(np.degrees(LAT) / 1.2) ** 2) * lead
    return rgb, Hm + 0.5 * ridge


def _triton(rgb, Hm, LAT, LON, P):
    la = np.degrees(LAT)
    cant = 0.5 + 0.5 * np.sin(fbm(P, 30.0, 3, 301) * 40)
    rgb = mix(rgb, rgb * C(0.92, 0.85, 0.82), cant * smooth(10, -10, -la) * 0.5)
    cap = smooth(-10, -30, la)
    rgb = mix(rgb, C(0.9, 0.82, 0.8), cap * 0.7)
    for k in range(30):
        rr = np.random.default_rng(303 + k)
        lo0 = rr.uniform(-180, 180)
        la0 = rr.uniform(-60, -25)
        d = np.degrees(ang_dist(LAT, LON, math.radians(la0), math.radians(lo0)))
        dlo = (np.degrees(LON) - lo0 + 180) % 360 - 180
        plume = np.exp(-((np.degrees(LAT) - la0) / 0.6) ** 2) * np.exp(-np.maximum(0, dlo) / 4) * (dlo > 0) * (d < 8)
        rgb = mix(rgb, C(0.3, 0.25, 0.24), plume * 0.8)
    return rgb, Hm


def rings():
    """Saturn ring radial profile 66 900 → 141 000 km (D, C, B, Cassini Division, A with Encke/Keeler gaps, F)."""
    n = 1024
    r = np.linspace(66900, 141000, n)
    op = np.zeros(n)
    col = np.zeros((n, 3))
    def band(r0, r1, o, c, ripple=0.0, seed=0):
        m = (r >= r0) & (r < r1)
        rr = np.random.default_rng(seed)
        noise = np.interp(r[m], np.linspace(r0, r1, 400), rr.random(400)) if ripple else 0
        op[m] = np.clip(o * (1 + ripple * (noise - 0.5) * 2), 0, 1)
        col[m] = c
    band(66900, 74490, 0.03, (0.55, 0.52, 0.5))                                   # D ring (very faint)
    band(74490, 91980, 0.16, (0.55, 0.5, 0.44), 0.45, 1)                          # C ring (translucent, greyish)
    band(91980, 117580, 0.92, (0.86, 0.78, 0.64), 0.12, 2)                        # B ring (bright, opaque)
    band(117580, 122170, 0.1, (0.5, 0.47, 0.44), 0.4, 3)                          # Cassini Division
    band(122170, 136775, 0.62, (0.8, 0.74, 0.64), 0.15, 4)                        # A ring
    gap = lambda c, w: np.exp(-((r - c) / w) ** 2)
    op *= 1 - 0.97 * gap(133589, 160) - 0.9 * gap(136505, 25)                     # Encke, Keeler gaps
    op += 0.5 * gap(140180, 90)                                                   # F ring
    col[np.abs(r - 140180) < 300] = (0.85, 0.8, 0.72)
    # Huygens ringlet, inner B edge brightening
    op += 0.3 * gap(117830, 60)
    img = np.zeros((4, n, 4))
    img[:, :, :3] = col[None]
    img[:, :, 3] = np.clip(op, 0, 1)[None]
    Image.fromarray((img * 255).astype(np.uint8), "RGBA").save(os.path.join(OUT, "saturn_rings_rgba.png"))
    print("[planets] saturn rings")


BUILDERS = {
    "moon": moon, "mercury": mercury, "venus": venus, "mars": mars, "jupiter": jupiter, "saturn": saturn, "uranus": uranus,
    "neptune": neptune, "io": io, "europa": europa, "ganymede": ganymede, "callisto": callisto, "titan": titan, "rings": rings,
    "enceladus": lambda: icy("enceladus", 401, (0.95, 0.96, 0.97), n=400, rmax=3.0, extra=_enceladus),
    "mimas": lambda: icy("mimas", 411, (0.78, 0.78, 0.76), n=1200, rmax=4.0, extra=_mimas),
    "dione": lambda: icy("dione", 421, (0.82, 0.82, 0.8), n=900),
    "rhea": lambda: icy("rhea", 431, (0.8, 0.79, 0.77), n=1100),
    "iapetus": lambda: icy("iapetus", 441, (0.8, 0.76, 0.7), n=800, extra=_iapetus),
    "titania": lambda: icy("titania", 451, (0.62, 0.6, 0.58), n=900),
    "triton": lambda: icy("triton", 461, (0.82, 0.76, 0.72), n=200, rmax=2.0, extra=_triton),
    "phobos": lambda: icy("phobos", 471, (0.36, 0.33, 0.3), n=300, rmax=8.0),
    "deimos": lambda: icy("deimos", 481, (0.42, 0.39, 0.35), n=200, rmax=6.0),
}

if __name__ == "__main__":
    names = [a for a in sys.argv[1:] if not a.startswith("--")] or list(BUILDERS)
    for nm in names:
        BUILDERS[nm]()
