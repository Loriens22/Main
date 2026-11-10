"""
Earth textures for orbit views, generated from Natural Earth public-domain vector data (coastlines, lakes,
glaciers, Antarctic ice shelves, populated places) plus a procedural climate model for surface colour.

    /home/user/blenv/bin/python scripts/gen_earth.py <natural-earth geojson dir>

Data: https://github.com/nvkelso/natural-earth-vector (public domain), files
  ne_50m_land, ne_50m_lakes, ne_50m_glaciated_areas, ne_50m_antarctic_ice_shelves_polys,
  ne_10m_populated_places_simple, ne_50m_rivers_lake_centerlines   (.geojson)

Outputs (public/assets/textures), equirectangular, x: lon -180→180, y: lat +90→-90:
  earth_day.jpg  4096×2048  surface albedo (biomes, deserts, forests, ice, ocean shelves, sea ice)
  earth_aux.jpg  4096×2048  R = cloud cover, G = water mask (specular), B = city lights
"""
import os, sys, json, math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage

W, H = (1024, 512) if "--draft" in sys.argv else (4096, 2048)
SS = 2                      # supersampling for antialiased polygon edges
ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
OUT = os.path.join(ROOT, "public", "assets", "textures")
RNG = np.random.default_rng(1977)


def load(d, name):
    with open(os.path.join(d, name + ".geojson")) as f:
        return json.load(f)["features"]


def rings_of(geom):
    t = geom["type"]
    if t == "Polygon":
        return [geom["coordinates"]]
    if t == "MultiPolygon":
        return geom["coordinates"]
    return []


def raster(features, w=W, h=H, ss=SS):
    """Rasterize polygons (with holes) to a float mask in [0, 1]."""
    img = Image.new("L", (w * ss, h * ss), 0)
    dr = ImageDraw.Draw(img)
    def px(c):
        return [((lon + 180.0) / 360.0 * w * ss, (90.0 - lat) / 180.0 * h * ss) for lon, lat in c]
    for f in features:
        for poly in rings_of(f["geometry"]):
            dr.polygon(px(poly[0]), fill=255)
            for hole in poly[1:]:
                dr.polygon(px(hole), fill=0)
    img = img.resize((w, h), Image.BOX)
    return np.asarray(img, dtype=np.float32) / 255.0


def lines(features, w=W, h=H, width=1):
    img = Image.new("L", (w, h), 0)
    dr = ImageDraw.Draw(img)
    for f in features:
        g = f["geometry"]
        parts = g["coordinates"] if g["type"] == "MultiLineString" else [g["coordinates"]]
        for p in parts:
            pts = [((lon + 180.0) / 360.0 * w, (90.0 - lat) / 180.0 * h) for lon, lat in p]
            if len(pts) > 1:
                dr.line(pts, fill=255, width=width)
    return np.asarray(img, dtype=np.float32) / 255.0


# ------------------------------------------------------------------------------------------ 3D value noise
def _hash(ix, iy, iz, seed):
    h = (ix * 73856093) ^ (iy * 19349663) ^ (iz * 83492791) ^ (seed * 2654435761)
    h = (h ^ (h >> 13)) * 1274126177
    h = h ^ (h >> 16)
    return (h & 0xFFFFFF).astype(np.float32) / float(0xFFFFFF)


def vnoise(x, y, z, seed=0):
    ix, iy, iz = np.floor(x).astype(np.int64), np.floor(y).astype(np.int64), np.floor(z).astype(np.int64)
    fx, fy, fz = x - ix, y - iy, z - iz
    ux, uy, uz = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy), fz * fz * (3 - 2 * fz)
    out = 0.0
    for dx in (0, 1):
        wx = ux if dx else 1 - ux
        for dy in (0, 1):
            wy = uy if dy else 1 - uy
            for dz in (0, 1):
                wz = uz if dz else 1 - uz
                out = out + wx * wy * wz * _hash(ix + dx, iy + dy, iz + dz, seed)
    return out


def fbm(P, freq, octaves, seed, gain=0.5, lac=2.03):
    x, y, z = P
    amp, tot, norm = 1.0, 0.0, 0.0
    for o in range(octaves):
        tot = tot + amp * vnoise(x * freq, y * freq, z * freq, seed + o * 17)
        norm += amp
        amp *= gain
        freq *= lac
    return tot / norm


def sphere_grid(w, h):
    lon = (np.arange(w, dtype=np.float32) + 0.5) / w * 2 * np.pi - np.pi
    lat = np.pi / 2 - (np.arange(h, dtype=np.float32) + 0.5) / h * np.pi
    LON, LAT = np.meshgrid(lon, lat)
    cl = np.cos(LAT)
    return LAT, LON, (cl * np.cos(LON), np.sin(LAT), cl * np.sin(LON))


def smooth(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def gauss(x, mu, sig):
    return np.exp(-((x - mu) / sig) ** 2)


def ellipse(LATd, LONd, lat0, lon0, rlat, rlon):
    return np.exp(-(((LATd - lat0) / rlat) ** 2 + ((LONd - lon0) / rlon) ** 2))


def wind_distances(lm, km, LAT):
    """Per row: distance (km) from each land pixel to the nearest ocean upwind to the east and to the west."""
    h, w = lm.shape
    d_east = np.zeros((h, w), np.float32)
    d_west = np.zeros((h, w), np.float32)
    xs = np.arange(w)
    for y in range(h):
        row = lm[y]
        sea = np.flatnonzero(~row)
        if sea.size == 0:
            d_east[y] = d_west[y] = 1e5
            continue
        sx = np.concatenate([sea - w, sea, sea + w])
        i = np.searchsorted(sx, xs)                 # first ocean pixel at or east of x
        de = sx[np.minimum(i, sx.size - 1)] - xs
        j = np.searchsorted(sx, xs, side="right") - 1   # last ocean pixel at or west of x
        dw = xs - sx[np.maximum(j, 0)]
        sc = km * max(0.05, math.cos(float(LAT[y, 0])))
        d_east[y] = de * sc
        d_west[y] = dw * sc
    return d_east, d_west


def main(d):
    print("[earth] rasterising Natural Earth polygons")
    land = raster(load(d, "ne_50m_land"))
    lakes = raster(load(d, "ne_50m_lakes"))
    glac = raster(load(d, "ne_50m_glaciated_areas"))
    shelf = raster(load(d, "ne_50m_antarctic_ice_shelves_polys"))
    rivers = lines(load(d, "ne_50m_rivers_lake_centerlines"))
    land_raw = land.copy()
    land = np.clip(land - lakes, 0, 1)
    LAT, LON, P = sphere_grid(W, H)
    LATd, LONd = np.degrees(LAT), np.degrees(LON)
    alat = np.abs(LATd)
    # distances (km): pixel spacing ~ 9.77 km in latitude, scaled by cos(lat) in longitude
    print("[earth] distance fields")
    km = 40075.0 / W
    lm = land > 0.5
    dl = ndimage.distance_transform_edt(lm, sampling=(km, km)).astype(np.float32)     # inland distance (approx)
    ds = ndimage.distance_transform_edt(~lm, sampling=(km, km)).astype(np.float32)    # offshore distance

    print("[earth] climate noise")
    n1 = fbm(P, 3.0, 6, 11)               # continental-scale variation
    n2 = fbm(P, 24.0, 5, 23)              # regional texture
    n3 = fbm(P, 110.0, 3, 37)             # fine speckle
    # mountain-like ridges: normalise the fbm (it clusters around 0.5) before folding it
    rf = fbm(P, 7.0, 5, 41)
    rf = (rf - rf.mean()) / (rf.std() * 2.5)
    ridge = np.clip(1.0 - np.abs(rf), 0, 1) ** 10

    # ---- precipitation and temperature (0..1)
    # moisture arrives with the prevailing winds: trades from the east in the tropics, westerlies at mid-latitudes
    print("[earth] wind-path distances")
    d_east, d_west = wind_distances(land_raw > 0.5, km, LAT)
    d_east = ndimage.gaussian_filter(d_east, (W / 512, W / 1024))
    d_west = ndimage.gaussian_filter(d_west, (W / 512, W / 1024))
    trade = smooth(38.0, 26.0, alat)
    west = smooth(30.0, 40.0, alat) * smooth(70.0, 58.0, alat)
    moist = trade * np.exp(-d_east / 2600.0) + west * np.exp(-d_west / 1500.0)
    base = 0.9 * gauss(LATd, 3.0, 10.0) + 0.35 * gauss(alat, 52.0, 12.0) + 0.12 - 0.45 * gauss(alat, 24.0, 8.0)
    pr = base + 0.75 * moist * (0.55 + 0.45 * gauss(alat, 0.0, 30.0)) + 0.22 * np.exp(-dl / 400.0) + 0.18 * np.exp(-dl / 1100.0)
    pr += (n1 - 0.5) * 0.5
    # regional adjustments (well-known climate features)
    pr += 0.45 * ellipse(LATd, LONd, -4, -62, 10, 16)      # Amazon basin
    pr += 0.40 * ellipse(LATd, LONd, 0, 22, 7, 10)         # Congo basin
    pr += 0.35 * ellipse(LATd, LONd, 5, 105, 12, 22)       # SE Asia / Indonesia
    pr += 0.30 * ellipse(LATd, LONd, 22, 82, 8, 9)         # monsoon India (east)
    pr += 0.25 * ellipse(LATd, LONd, 50, 5, 9, 18)         # western Europe
    pr += 0.25 * ellipse(LATd, LONd, 38, -82, 9, 12)       # eastern USA
    pr += 0.20 * ellipse(LATd, LONd, 30, 112, 8, 10)       # southern China
    pr += 0.20 * ellipse(LATd, LONd, -25, -50, 8, 8)       # SE Brazil
    pr -= 0.55 * ellipse(LATd, LONd, 23, 10, 9, 25)        # Sahara
    pr -= 0.50 * ellipse(LATd, LONd, 23, 47, 8, 12)        # Arabia
    pr -= 0.40 * ellipse(LATd, LONd, -24, 133, 9, 15)      # Australian interior
    pr -= 0.40 * ellipse(LATd, LONd, 42, 103, 6, 16)       # Gobi
    pr -= 0.35 * ellipse(LATd, LONd, 40, 62, 6, 12)        # central Asian deserts
    pr -= 0.40 * ellipse(LATd, LONd, -23, -70, 7, 2.5)     # Atacama
    pr -= 0.35 * ellipse(LATd, LONd, -24, 16, 6, 4)        # Namib / Kalahari
    pr -= 0.30 * ellipse(LATd, LONd, 34, -112, 6, 8)       # US south-west
    pr -= 0.25 * ellipse(LATd, LONd, 26, 71, 4, 4)         # Thar
    pr -= 0.25 * ellipse(LATd, LONd, -46, -68, 6, 4)       # Patagonia
    pr = np.clip(pr, 0, 1.3)
    te = np.clip(1.0 - alat / 72.0 + (n1 - 0.5) * 0.15, 0, 1)
    tibet = ellipse(LATd, LONd, 33, 88, 4.5, 11)            # high plateau: cold and dry
    andes = ellipse(LATd, LONd, -18, -68, 22, 2.2)
    te -= 0.45 * tibet
    pr -= 0.35 * tibet

    # ---- land colours (linear-ish sRGB values, tuned for the orbital look)
    C = lambda r, g, b: np.array([r, g, b], np.float32)
    sand = C(0.80, 0.66, 0.46); sand2 = C(0.72, 0.52, 0.33); steppe = C(0.56, 0.52, 0.34)
    grass = C(0.33, 0.39, 0.20); temperate = C(0.17, 0.26, 0.12); rain = C(0.07, 0.17, 0.06)
    boreal = C(0.11, 0.17, 0.11); tundra = C(0.40, 0.39, 0.32); rock = C(0.38, 0.33, 0.28); ice = C(0.93, 0.95, 0.98)
    pr3, te3 = pr[..., None], te[..., None]
    # dry → wet blend in warm climates
    warm = sand * (1 - smooth(0.08, 0.30, pr3)) + steppe * (smooth(0.08, 0.30, pr3) - smooth(0.30, 0.52, pr3)) \
        + grass * (smooth(0.30, 0.52, pr3) - smooth(0.52, 0.76, pr3)) + temperate * (smooth(0.52, 0.76, pr3) - smooth(0.76, 1.0, pr3)) \
        + rain * smooth(0.76, 1.0, pr3)
    warm = warm * (1 - 0.35 * gauss(n2, 0.75, 0.15)[..., None]) + sand2 * 0.35 * gauss(n2, 0.75, 0.15)[..., None] * (1 - smooth(0.2, 0.5, pr3))
    cold = boreal * smooth(0.25, 0.5, pr3) + tundra * (1 - smooth(0.25, 0.5, pr3))
    land_c = cold + (warm - cold) * smooth(0.18, 0.42, te3)
    sc = smooth(0.0, 0.16, te3)
    land_c = land_c * sc + (tundra * 0.6 + ice * 0.4) * (1 - sc)
    # mountains: rocky streaks, snow on the highest/coldest
    # mountains only along real belts (ridged detail inside them), not everywhere
    belts = (0.9 * andes + 0.8 * tibet + 0.75 * ellipse(LATd, LONd, 29, 84, 2.2, 12)          # Himalaya
             + 0.6 * ellipse(LATd, LONd, 44, -112, 11, 5) + 0.45 * ellipse(LATd, LONd, 58, -128, 8, 6)   # Rockies, Coast Mts
             + 0.5 * ellipse(LATd, LONd, 46, 9, 2.0, 6) + 0.4 * ellipse(LATd, LONd, 33, 51, 4, 8)       # Alps, Zagros/Alborz
             + 0.4 * ellipse(LATd, LONd, 42, 80, 3, 12) + 0.35 * ellipse(LATd, LONd, 60, 60, 8, 2.5)    # Tian Shan, Urals
             + 0.35 * ellipse(LATd, LONd, 9, 39, 5, 3) + 0.35 * ellipse(LATd, LONd, -2, 33, 8, 3)      # Ethiopia, Rift
             + 0.3 * ellipse(LATd, LONd, 62, 150, 8, 18) + 0.3 * ellipse(LATd, LONd, -30, 149, 9, 3)    # NE Siberia, Gt Dividing
             + 0.2 * smooth(0.62, 0.8, n1))
    mt = np.clip(belts * (0.35 + 0.9 * ridge ** 0.35) * (0.7 + 0.6 * n2), 0, 1)[..., None]
    land_c = land_c * (1 - 0.55 * mt) + rock * 0.55 * mt
    snow = np.clip(mt[..., 0] * 1.5 - 0.95 + (1 - te) * 0.6 + 0.5 * tibet * ridge, 0, 1)[..., None] * 0.75
    land_c = land_c * (1 - snow) + ice * snow
    land_c *= (0.86 + 0.28 * n3[..., None]) * (0.9 + 0.2 * n2[..., None])
    land_c -= rivers[..., None] * 0.04 * (pr3 > 0.3)

    # ---- ice: glaciers, Antarctica, Greenland, ice shelves
    icem = np.clip(glac + shelf + smooth(-63.0, -66.0, LATd) * land, 0, 1)[..., None]
    icem = np.maximum(icem, (land * ellipse(LATd, LONd, 74, -41, 10, 18) > 0.35)[..., None] * 0.95)
    land_c = land_c * (1 - icem) + ice * (0.92 + 0.08 * n3[..., None]) * icem

    # ---- ocean: deep blue, continental shelves near coasts, tropical shallows, sea ice
    deep = C(0.010, 0.030, 0.075); mid = C(0.016, 0.050, 0.110); shelfc = C(0.035, 0.120, 0.165); trop = C(0.050, 0.200, 0.220)
    sh = np.exp(-ds / 90.0)[..., None]
    sh2 = np.exp(-ds / 420.0)[..., None]
    ocean = deep * (1 - sh2) + mid * sh2
    tropical = gauss(alat, 0.0, 26.0)[..., None]
    ocean = ocean * (1 - sh) + (shelfc * (1 - tropical) + trop * tropical) * sh
    ocean *= (0.92 + 0.16 * n2[..., None])
    seaice = np.clip(smooth(71.0, 79.0, LATd) * (0.75 + 0.5 * (n2 - 0.5)) + smooth(-64.0, -70.0, LATd) * (0.7 + 0.6 * (n2 - 0.5)), 0, 1)[..., None]
    ocean = ocean * (1 - seaice) + C(0.82, 0.86, 0.9) * seaice
    water = np.clip(1 - land, 0, 1)
    lakes3 = lakes[..., None]
    lakec = C(0.03, 0.07, 0.10)
    col = ocean * water[..., None] + land_c * land[..., None]
    col = col * (1 - lakes3) + lakec * lakes3 * (1 - seaice) + C(0.85, 0.88, 0.92) * lakes3 * seaice
    day = np.clip(col, 0, 1) ** (1 / 1.0)
    lmk = land > 0.5
    print("[earth] dark-land fraction", (day[lmk].max(-1) < 0.1).mean(), "sahara", day[int(H*(90-23)/180), int(W*(190)/360)], land_c[int(H*(90-23)/180), int(W*(190)/360)], warm[int(H*(90-23)/180), int(W*(190)/360)])
    yy, xx = H // 2, int(W * 200 / 360)
    print("[earth] probe Africa", land[yy, xx], land_c[yy, xx], col[yy, xx], day[yy, xx], pr[yy, xx], te[yy, xx], mt[yy, xx], warm[yy, xx], cold[yy, xx])
    print("[earth] stats pr %.2f/%.2f te %.2f ridge %.2f mt %.2f land_c %s" % (pr.mean(), pr.std(), te.mean(), ridge.mean(), mt.mean(), np.round(land_c[land > 0.5].mean(0), 3)))
    if "--draft" in sys.argv:
        dbg = os.path.join(ROOT, "blender", "renders")
        for nm, arr in (("pr", pr / 1.3), ("te", te), ("mt", mt[..., 0]), ("dl", np.clip(dl / 2000, 0, 1)), ("n1", n1), ("ridge", ridge)):
            Image.fromarray((np.clip(arr, 0, 1) * 255).astype(np.uint8)).save(os.path.join(dbg, "earth_dbg_" + nm + ".png"))
    Image.fromarray((day * 255).astype(np.uint8)).save(os.path.join(OUT, "earth_day.jpg"), quality=90, subsampling=0)
    print("[earth] wrote earth_day.jpg")

    # ---- clouds: domain-warped fbm + mid-latitude cyclone spirals + billowy cumulus detail, with latitude structure
    print("[earth] clouds")
    wx = fbm(P, 2.0, 4, 51) - 0.5
    wy = fbm(P, 2.0, 4, 53) - 0.5
    wz = fbm(P, 2.0, 4, 57) - 0.5
    X, Y, Z = P[0] + wx * 0.8, P[1] + wy * 0.45, P[2] + wz * 0.8
    vr = np.random.default_rng(5)
    for k in range(14):
        lat0 = math.radians((1 if k % 2 else -1) * vr.uniform(38, 62)) if k < 10 else math.radians((1 if k % 2 else -1) * vr.uniform(12, 22))
        lon0 = vr.uniform(-math.pi, math.pi)
        c = np.array([math.cos(lat0) * math.cos(lon0), math.sin(lat0), math.cos(lat0) * math.sin(lon0)], np.float32)
        rad = vr.uniform(0.07, 0.13) if k < 10 else vr.uniform(0.04, 0.06)
        dotc = X * c[0] + Y * c[1] + Z * c[2]
        ang = (1 if lat0 > 0 else -1) * vr.uniform(1.4, 2.6) * np.exp(-np.maximum(0, 1 - dotc) / (rad * rad * 0.5))
        ca, sa = np.cos(ang), np.sin(ang)
        # Rodrigues rotation about c
        cx_ = c[1] * Z - c[2] * Y
        cy_ = c[2] * X - c[0] * Z
        cz_ = c[0] * Y - c[1] * X
        X, Y, Z = X * ca + cx_ * sa + c[0] * dotc * (1 - ca), Y * ca + cy_ * sa + c[1] * dotc * (1 - ca), Z * ca + cz_ * sa + c[2] * dotc * (1 - ca)
    Pw = (X, Y, Z)
    c1 = fbm(Pw, 3.6, 7, 61, gain=0.55)
    bill = 1.0 - np.abs(fbm((X * 1.0, Y * 1.6, Z * 1.0), 16.0, 5, 67) * 2 - 1)
    cov = 0.68 * c1 + 0.32 * bill * 0.9
    cov = (cov - cov.mean()) / cov.std()
    band = 0.55 * gauss(LATd, 5.0, 7.0) + 0.6 * gauss(alat, 55.0, 11.0) - 0.75 * gauss(alat, 24.0, 8.0) + 0.3 * smooth(60, 80, alat)
    cl = smooth(0.35 - band, 1.35 - band, cov)
    cl = np.clip(cl * (0.7 + 0.6 * fbm(P, 48.0, 3, 71)), 0, 1)
    # thin the clouds over the coldest deserts a little more
    cl *= 1 - 0.35 * np.clip((0.25 - pr) * 3, 0, 1) * land

    # ---- night lights from populated places
    print("[earth] city lights")
    lights = np.zeros((H, W), np.float32)
    for f in load(d, "ne_10m_populated_places_simple"):
        pp = f["properties"]
        pop = max(pp.get("pop_max") or 0, pp.get("pop_min") or 0, 1000)
        lon, lat = f["geometry"]["coordinates"][:2]
        x = int((lon + 180) / 360 * W) % W
        y = min(H - 1, max(0, int((90 - lat) / 180 * H)))
        lights[y, x] += pop ** 0.75 / 3.0e4
    # electrification: well-lit regions vs dimmer ones (broad approximation of real night imagery)
    elec = 0.55 + 0.45 * np.clip(ellipse(LATd, LONd, 40, -90, 14, 30) + ellipse(LATd, LONd, 49, 10, 12, 22) + ellipse(LATd, LONd, 36, 136, 6, 8)
                                 + ellipse(LATd, LONd, 36, 127, 4, 4) + ellipse(LATd, LONd, 30, 115, 10, 12) + ellipse(LATd, LONd, 27, 50, 6, 10)
                                 + ellipse(LATd, LONd, -27, -50, 8, 10) + ellipse(LATd, LONd, 55, 40, 6, 14), 0, 1)
    elec *= 1 - 0.55 * ellipse(LATd, LONd, 2, 22, 16, 22)
    s_ = W / 4096.0
    glow = ndimage.gaussian_filter(lights, 1.0 * s_ + 0.4) * 5.0 + ndimage.gaussian_filter(lights, 3.0 * s_) * 3.0 + ndimage.gaussian_filter(lights, 9.0 * s_) * 1.2
    dens = ndimage.gaussian_filter(lights, 16.0 * s_) * 40.0
    speck = (fbm(P, 260.0, 2, 81) > 0.64).astype(np.float32) * np.clip(dens, 0, 1) * 0.25
    city = np.clip((glow + speck) * elec * land, 0, 1) ** 0.85
    aux = np.stack([cl, water * (1 - seaice[..., 0]) * 1.0, city], -1)
    Image.fromarray((np.clip(aux, 0, 1) * 255).astype(np.uint8)).save(os.path.join(OUT, "earth_aux.jpg"), quality=90, subsampling=0)
    print("[earth] wrote earth_aux.jpg")
    # small preview for inspection
    prev = Image.fromarray((day * 255).astype(np.uint8)).resize((1024, 512))
    pc = np.asarray(prev, np.float32) / 255
    cc = np.asarray(Image.fromarray((cl * 255).astype(np.uint8)).resize((1024, 512)), np.float32)[..., None] / 255
    Image.fromarray(((pc * (1 - cc) + cc) * 255).astype(np.uint8)).save(os.path.join(ROOT, "blender", "renders", "earth_maps.jpg"), quality=88)


if __name__ == "__main__":
    main([a for a in sys.argv[1:] if not a.startswith("--")][0])
