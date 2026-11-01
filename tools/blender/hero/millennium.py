# Millennium Center, бул. „Витоша“ 89Б (architect Amfion; facade system Reynaers; opened 2020): three towers on
# a common base between бул. „Витоша“ / бул. „България“ (the tram) and бул. „Пенчо Славейков“ - the 32-storey
# Grand Hotel Millennium Sofia (112 m, the Ozone sky bar at the top, a rooftop helipad), the office tower with
# the ДЗИ / ОББ crown and the residential tower. Footprints are the OSM building parts (world7 pack).
# Appearance from the user's street-level photographs (August 2024; June 2022) and published descriptions
# (40 000 m² of glass "in geometric forms", grey and white elements):
#   * hotel tower: deep blue glass; up the street face a white frame with a zig-zag of white bars that rises
#     above the roof; short white ledges with beige soffits on the flanks; glazed top floors (sky bar);
#   * base along the boulevard: white stone piers and shop windows (OZONE, GALLERY, VIENNA, SPECTRUM, the
#     casino), the hotel entrance under a white canopy on V-columns with MILLENNIUM SOFIA lettering and the
#     flags; above it a faceted glass front under a white space-frame lattice with ball nodes, dense white fins
#     on one side and white ribbed panels on the other;
#   * office tower: white floor bands over part of each face, white corner frames, the cantilevered white crown
#     with the ДЗИ and ОББ letters; residential tower: stacked white balconies with glass balustrades.
# Storey heights and the lattice geometry are estimated from the photographs.
import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import herolib as H
import herokit as K
from shapely.geometry import Polygon, Point
from shapely.ops import unary_union

NAME = 'millennium'
pk = H.Pack('7')
H.reset()


def fp(x, z, tol=0.25):
    return H.orient(H.simplify(pk.building(x, z, 3)['pts'], tol))


HOTEL = fp(-3056.3, -1463.0)
OFFICE = fp(-3024.1, -1513.3)
RESID = fp(-3105.9, -1439.0)
B80 = fp(-3064.5, -1476.7)   # base along the boulevard, 20 m
B78 = fp(-3081.7, -1435.5)
B79 = fp(-3076.8, -1442.4)
B81 = fp(-3072.8, -1454.9)
B83 = fp(-3052.8, -1480.9)
B84 = fp(-3036.4, -1497.1)
SHAFT_G = unary_union([Polygon(HOTEL), Polygon(B81).buffer(0.1), Polygon(B83).buffer(0.1)]).buffer(0.3, join_style=2).buffer(-0.3, join_style=2)
# above the base the tower is the clean slab round the hotel's parts (its broad face to the boulevard)
SHAFT = H.orient(list(SHAFT_G.minimum_rotated_rectangle.exterior.coords)[:-1])

DATUM = 41.1
POD = 21.0
HOTEL_TOP = 112.0
HFL = (HOTEL_TOP - POD) / 27
OFFICE_TOP = 78.0
OFL = (OFFICE_TOP - POD) / 16
RESID_TOP = 75.0
RFL = 3.1
ALL = [HOTEL, OFFICE, RESID, B80, B78, B79, B81, B83, B84, SHAFT]
U = unary_union([Polygon(p).buffer(0.05) for p in ALL])
cx, cz = U.centroid.x, U.centroid.y
hb = H.HB(NAME, (cx, cz), DATUM)
NW = (-0.8, -0.6)  # towards the boulevard and the tram

hb.mat('cw:millBlue', (0.08, 0.18, 0.45), 0.05, 0.8)
hb.mat('cw:millBlueDark', (0.04, 0.08, 0.2), 0.05, 0.8)
hb.mat('cw:millSky', (0.2, 0.3, 0.45), 0.05, 0.6)
hb.mat('cw:millPodium', (0.12, 0.22, 0.45), 0.05, 0.7)
hb.mat('pn:millRib', (0.82, 0.83, 0.82), 0.5)
hb.mat('std:white', (0.9, 0.9, 0.89), 0.4)
hb.mat('std:beige', (0.82, 0.74, 0.6), 0.5)
hb.mat('std:stone', (0.86, 0.85, 0.82), 0.5)
hb.mat('std:alu', (0.65, 0.67, 0.70), 0.35, 0.8)
hb.mat('std:steel', (0.6, 0.62, 0.64), 0.35, 0.8)
hb.mat('std:steelDark', (0.12, 0.13, 0.14), 0.45, 0.6)
hb.mat('std:plinth', (0.4, 0.4, 0.41), 0.85)
hb.mat('std:roof', (0.5, 0.5, 0.49), 0.95)
hb.mat('std:plant', (0.62, 0.64, 0.66), 0.5, 0.4)
hb.mat('std:plantDark', (0.2, 0.21, 0.22), 0.6, 0.3)
hb.mat('std:signBlue', (0.08, 0.16, 0.55), 0.4)
hb.mat('std:signBlack', (0.05, 0.05, 0.06), 0.4)
hb.mat('std:helipad', (0.25, 0.27, 0.28), 0.8)
hb.mat('std:planter', (0.32, 0.33, 0.34), 0.7)
hb.mat('std:hedge', (0.16, 0.30, 0.10), 0.95)
hb.mat('glass:shop', (0.55, 0.65, 0.68), 0.05)
hb.mat('glass:door', (0.5, 0.6, 0.62), 0.05)
hb.mat('glass:rail', (0.25, 0.35, 0.45), 0.05)
hb.mat('glow:white', (0.95, 0.95, 0.95), 0.4, emit=(1, 1, 1))
hb.mat('glow:millBlue', (0.1, 0.2, 0.75), 0.4, emit=(0.3, 0.5, 1))
hb.mat('glow:gold', (0.85, 0.65, 0.25), 0.3, emit=(1, 0.8, 0.4))
hb.mat('glow:shopLight', (0.95, 0.95, 0.9), 0.4, emit=(1, 0.95, 0.85))
hb.mat('glow:pendant', (0.95, 0.85, 0.6), 0.4, emit=(1, 0.8, 0.5))
for s in ('millLogo', 'flagBG', 'flagEU', 'flagMill', 'helipad'):
    hb.mat('sign:' + s, (0.5, 0.5, 0.6), 0.5)
for k, c in (('floor', (0.62, 0.55, 0.48)), ('wall', (0.86, 0.82, 0.76)), ('ceiling', (0.9, 0.9, 0.88)), ('wood', (0.42, 0.28, 0.17)),
             ('chair', (0.2, 0.15, 0.12)), ('menu', (0.1, 0.1, 0.12)), ('white', (0.92, 0.92, 0.92))):
    hb.mat('int:' + k, c, 0.6)


def gy(x, z):
    return pk.y(x, z) - DATUM


def ground_lo(pts):
    return min(gy(*p) for p in pts) - 0.6


def runs(e, d=1.0, step=1.0, minlen=2.0):
    out, cur = [], None
    n = max(2, int(e['L'] / step) + 1)
    for k in range(n):
        s = e['L'] * k / (n - 1)
        q = Point(e['a'][0] + e['t'][0] * s + e['n'][0] * d, e['a'][1] + e['t'][1] * s + e['n'][1] * d)
        if not U.contains(q):
            cur = [s, s] if cur is None else [cur[0], s]
        elif cur is not None:
            out.append(cur); cur = None
    if cur is not None:
        out.append(cur)
    return [(max(0.0, a - 0.5), min(e['L'], b + 0.5)) for a, b in out if b - a >= minlen]


def facing(pts, d=NW, minL=8):
    """The edge of an outline facing most nearly direction d (and at least minL long)."""
    return max([e for e in H.edges(pts) if e['L'] >= minL], key=lambda e: e['n'][0] * d[0] + e['n'][1] * d[1])


def plinth(pts):
    lo = ground_lo(pts)
    if lo < 0.2:
        hb.ring('std:plinth', pts, lo, 0.2)


def glass_tower(pts, y0, y1, fl, mat='cw:millBlue', mull='std:alu', bay=1.5):
    for e in H.edges(pts):
        hb.wall(mat, e['a'], e['b'], y0, y1)
        K.mullions(hb, e, y0, y1, bay, mull, depth=0.14, w=0.06, rows=[y0 + k * fl for k in range(1, int((y1 - y0) / fl) + 1)])


def white_ribs(e, s0, s1, y0, y1):
    K.frame(hb, e)
    hb.face('pn:millRib', [(s0, y0, 0.02), (s1, y0, 0.02), (s1, y1, 0.02), (s0, y1, 0.02)])
    hb.pop()


def ground_floor(e, s0, s1, seed, kinds=('cafe', 'lobby'), signs=()):
    """Shop windows between white stone piers, interiors behind, sign boxes over them."""
    rnd = random.Random(seed)
    L = s1 - s0
    nb = max(1, round(L / 7.0))
    bw = L / nb
    K.frame(hb, e)
    for i in range(nb):
        x0, x1 = s0 + i * bw, s0 + (i + 1) * bw
        hb.face('glass:shop', [(x0 + 0.6, 0.2, 0), (x1 - 0.6, 0.2, 0), (x1 - 0.6, 4.4, 0), (x0 + 0.6, 4.4, 0)])
        K.shop_interior(hb, x0 + 0.7, x1 - 0.7, 4.2, 6.0, rnd.choice(kinds), seed * 13 + i)
        hb.box('std:stone', x0, 0, 0.1, 1.25, 5.6, 0.85)
        hb.box('std:steelDark', (x0 + x1) / 2, 2.9, 0.04, bw - 1.2, 0.07, 0.08)
    hb.box('std:stone', s1, 0, 0.1, 1.25, 5.6, 0.85)
    hb.box('std:stone', (s0 + s1) / 2, 4.4, 0.05, L, 1.2, 0.6, bottom=True)
    for (d, text, mat, plate, w) in signs:
        x = s0 + d
        hb.box(plate, x, 4.45, 0.42, w, 1.1, 0.12)
        K.text3d(hb, mat, text, x, 4.72, 0.48, 0.5, 0.06, width=w - 0.4)
    hb.pop()


# ------------------------------------------------------------------ the hotel tower
plinth(SHAFT)
glass_tower(SHAFT, POD - 1.0, HOTEL_TOP - 7.0, HFL)
# the glazed top floors (sky bar) and the roof
for e in H.edges(SHAFT):
    hb.wall('cw:millSky', e['a'], e['b'], HOTEL_TOP - 7.0, HOTEL_TOP)
    K.mullions(hb, e, HOTEL_TOP - 7.0, HOTEL_TOP, 2.4, 'std:white', depth=0.25, w=0.12, rows=[HOTEL_TOP - 3.5])
hb.cap('std:roof', SHAFT, HOTEL_TOP)
K.parapet(hb, SHAFT, HOTEL_TOP, 1.2, 'std:white', w=0.35)
# railing frame round the roof edge
for e in H.edges(H.offset(SHAFT, -0.6)):
    hb.beam('std:steel', (e['a'][0], HOTEL_TOP + 2.4, e['a'][1]), (e['b'][0], HOTEL_TOP + 2.4, e['b'][1]), 0.08)
    for k in range(int(e['L'] / 3) + 1):
        x = e['a'][0] + e['t'][0] * k * 3; z = e['a'][1] + e['t'][1] * k * 3
        hb.beam('std:steel', (x, HOTEL_TOP + 1.2, z), (x, HOTEL_TOP + 2.4, z), 0.06)
# rooftop helipad
hx, hz = H.centroid(SHAFT)
hb.push(hx, HOTEL_TOP, hz, math.atan2(*NW))
for px in (-7, 7):
    for pz in (-7, 7):
        hb.box('std:steel', px, 0, pz, 0.3, 2.0, 0.3)
hb.box('std:helipad', 0, 2.0, 0, 16, 0.4, 16)
hb.face('sign:helipad', [(-7.5, 2.42, 7.5), (7.5, 2.42, 7.5), (7.5, 2.42, -7.5), (-7.5, 2.42, -7.5)], uv=[(0, 0), (1, 0), (1, 1), (0, 1)])
hb.pop()

# the white frame with the zig-zag up the street face, rising above the roof
fe = facing(SHAFT)
bw, bc = 12.0, fe['L'] / 2
K.frame(hb, fe)
hb.face('cw:millBlueDark', [(bc - bw / 2, POD, 0.05), (bc + bw / 2, POD, 0.05), (bc + bw / 2, HOTEL_TOP, 0.05), (bc - bw / 2, HOTEL_TOP, 0.05)])
top = HOTEL_TOP + 7.0
for sx in (-1, 1):
    hb.box('std:white', bc + sx * (bw / 2 + 0.6), POD - 2.0, 0.6, 1.2, top - POD + 2.0, 1.1)
hb.box('std:white', bc, top - 0.9, 0.6, bw + 2.4, 0.9, 1.1, bottom=True)
y = POD + 3.0
side = -1
step = 3 * HFL
while y + step <= HOTEL_TOP + 3.5:
    a = (bc + side * bw / 2, y, 0.9)
    b = (bc - side * bw / 2, y + step, 0.9)
    hb.beam('std:white', a, b, 0.55, 0.45, up=(0, 0, 1))
    hb.beam('std:white', a, (bc + side * (bw / 2 - 3.2), y, 0.9), 0.45, 0.4, up=(0, 0, 1))
    side = -side
    y += step
# short white ledges with beige soffits on the flanks, staggered
for k in range(1, 27):
    yy = POD + k * HFL
    for sgn in (-1, 1):
        for j in range(3):
            ln = 2.6 if (k + j) % 2 else 1.3
            x0 = bc + sgn * (bw / 2 + 2.0 + j * 4.2)
            if not (1.0 < x0 < fe['L'] - 1.0):
                continue
            hb.box('std:white', x0 + sgn * ln / 2, yy - 0.16, 0.35, ln, 0.16, 0.7, bottom=False)
            hb.soffit('std:beige', x0, x0 + sgn * ln, yy - 0.16, 0.0, 0.7)
hb.pop()

# ------------------------------------------------------------------ the base along the boulevard
plinth(B80)
be = facing(B80)
for e in H.edges(B80):
    for a, b in runs(e):
        if e['i'] != be['i']:
            ground_floor(e, a, b, 300 + e['i'])
            white_ribs(e, a, b, 5.6, POD)
hb.cap('std:roof', B80, POD)
K.parapet(hb, B80, POD, 1.1, 'std:white', w=0.3)
# the street face: entrance, shops, fins, ribs, lattice front
L = be['L']
sw_end = min((0.0, L), key=lambda s: math.hypot(be['a'][0] + be['t'][0] * s + 3093, be['a'][1] + be['t'][1] * s + 1462))
sS = (lambda d: d) if sw_end == 0.0 else (lambda d: L - d)  # distance from the south-west end
ent0, ent1 = sorted((sS(9.0), sS(23.0)))
shop0, shop1 = sorted((sS(23.0), sS(L - 0.5)))
ground_floor(be, *sorted((sS(0.5), sS(9.0))), 311, kinds=('cafe',))
ground_floor(be, shop0, shop1, 312, kinds=('cafe', 'lobby', 'cafe'),
             signs=[(abs(sS(26.5) - shop0), 'OZONE', 'glow:white', 'std:signBlue', 3.4), (abs(sS(31.0) - shop0), 'GALLERY', 'glow:white', 'std:signBlue', 3.6),
                    (abs(sS(35.5) - shop0), 'VIENNA', 'glow:white', 'std:signBlue', 3.6), (abs(sS(40.0) - shop0), 'SPECTRUM', 'glow:white', 'std:signBlue', 3.6)])
K.frame(hb, be)
# the casino sign over the last bays
cxs = sS(47.0)
hb.box('std:signBlack', cxs, 4.3, 0.5, 8.5, 1.6, 0.2)
K.text3d(hb, 'glow:gold', 'PALMS ROYALE | SOFIA', cxs, 5.35, 0.6, 0.32, 0.05, width=7.6)
K.text3d(hb, 'glow:white', 'CASINO', cxs, 4.45, 0.6, 0.62, 0.06, width=6.0)
# hotel entrance: lobby glass, revolving door, canopy on V-columns, lettering, logo, flags
hb.face('glass:door', [(ent0, 0.2, 0), (ent1, 0.2, 0), (ent1, 5.4, 0), (ent0, 5.4, 0)])
K.shop_interior(hb, ent0 + 0.2, ent1 - 0.2, 5.2, 9.0, 'lobby', 321)
em = (ent0 + ent1) / 2
hb.cyl('glass:door', em, 0.2, 0.9, 1.4, 2.6, segs=16)
hb.cyl('std:steel', em, 2.8, 0.9, 1.5, 0.25, segs=16)
for dx in (-4.0, 4.0):
    K.door_set(hb, em + dx, 2.4, 2.8, z=0.08)
hb.box('std:white', em, 6.0, 3.2, 15.0, 0.55, 6.4, bottom=True)
hb.box('std:white', em, 6.55, 6.1, 15.0, 0.9, 0.3)
K.text3d(hb, 'glow:millBlue', 'MILLENNIUM SOFIA', em, 6.65, 6.25, 0.62, 0.08, width=13.0)
for sx in (-1, 1):  # V columns
    hb.beam('std:white', (em + sx * 5.5, 0.0, 5.2), (em + sx * 4.0, 6.0, 5.9), 0.45, 0.45)
    hb.beam('std:white', (em + sx * 5.5, 0.0, 5.2), (em + sx * 7.2, 6.0, 5.9), 0.45, 0.45)
hb.sign('sign:millLogo', em + 5.2, 1.6, em + 7.0, 3.4, 0.03)
for k, f in enumerate(('flagMill', 'flagBG', 'flagEU')):
    K.flagpole(hb, em + 9.0 + k * 1.6, 7.5 + k * 0.0, 11.0, 'sign:' + f)
for k in range(10):  # bollards along the kerb
    hb.cyl('std:steelDark', em - 12 + k * 3.0, 0, 9.5, 0.12, 0.9, segs=8)
# fins over the shops, white ribs over the south-west part
f0, f1 = sorted((sS(23.0), sS(L)))
for k in range(int((f1 - f0) / 0.55)):
    hb.cyl('std:white', f0 + 0.3 + k * 0.55, 6.2, 1.0, 0.13, POD - 6.2, segs=6)
hb.face('cw:millPodium', [(f0, 5.6, 0), (f1, 5.6, 0), (f1, POD, 0), (f0, POD, 0)])
r0, r1 = sorted((sS(0.0), sS(9.0)))
hb.face('pn:millRib', [(r0, 5.6, 0.02), (r1, 5.6, 0.02), (r1, POD, 0.02), (r0, POD, 0.02)])
# the faceted glass front over the entrance under the white space-frame lattice
l0, l1 = sorted((sS(9.0), sS(23.0)))
hb.face('cw:millPodium', [(l0, 5.6, 0), (l1, 5.6, 0), (l1, POD, 0), (l0, POD, 0)])
hb.pop()
# lattice: diamond grid on the street face over the entrance and on a slope back to the tower
K.frame(hb, be)
nodes = {}
cols, rows = 5, 4
for j in range(rows + 1):
    for i in range(cols + 1):
        if (i + j) % 2:
            continue
        x = l0 + (l1 - l0) * i / cols
        yy = 7.0 + (POD + 9.0 - 7.0) * j / rows
        zz = 1.4 if yy <= POD else 1.4 - (yy - POD) * 1.1
        nodes[(i, j)] = (x, yy, zz)
for (i, j), p in nodes.items():
    hb.sphere('std:white', p, 0.32, segs=8, rings=5)
    for di, dj in ((1, 1), (-1, 1)):
        q = nodes.get((i + di, j + dj))
        if q:
            hb.tube('std:white', p, q, 0.11, segs=6, caps=False)
# the sloped glass between the lattice top and the tower
hb.face('cw:millPodium', [(l0, POD, 0.0), (l1, POD, 0.0), (l1, POD + 9.0, -9.0), (l0, POD + 9.0, -9.0)])
hb.pop()

# ------------------------------------------------------------------ the other base parts
for i, P in enumerate((B78, B79, B81, B83, B84)):
    h = {0: 8.9, 1: 13.8, 2: 17.0, 3: 17.0, 4: 17.0}[i]
    plinth(P)
    for e in H.edges(P):
        for a, b in runs(e):
            ground_floor(e, a, b, 400 + i * 10 + e['i'])
            if h > 6:
                white_ribs(e, a, b, 5.6, h)
    hb.cap('std:roof', P, h)
    K.parapet(hb, P, h, 1.0, 'std:white', w=0.3)
    if Polygon(P).area > 200:
        K.roof_plant(hb, P, h, 2, 40 + i, inset=3.0)

# ------------------------------------------------------------------ the office tower: floor bands, crown, ДЗИ / ОББ
plinth(OFFICE)
for e in H.edges(OFFICE):
    for a, b in runs(e):
        ground_floor(e, a, b, 500 + e['i'], kinds=('lobby', 'cafe'))
        K.frame(hb, e)
        hb.face('cw:millPodium', [(a, 5.6, 0), (b, 5.6, 0), (b, POD - 4, 0), (a, POD - 4, 0)])
        for k in range(int((b - a - 0.6) / 0.6)):
            hb.cyl('std:white', a + 0.3 + k * 0.6, 6.2, 0.9, 0.12, POD - 4 - 6.2, segs=6)
        hb.pop()
glass_tower(OFFICE, POD - 4, OFFICE_TOP, OFL)
for e in H.edges(OFFICE):
    K.frame(hb, e)
    band = 0.42 * e['L']
    for k in range(1, 17):
        yy = POD - 4 + k * OFL
        if yy > OFFICE_TOP - 1:
            break
        hb.box('std:white', band / 2, yy - 0.75, 0.25, band, 0.75, 0.5, bottom=True)
    for x in (0.4, e['L'] - 0.4):
        hb.box('std:white', x, POD - 4, 0.3, 0.8, OFFICE_TOP - POD + 4, 0.6)
    hb.pop()
hb.cap('std:roof', OFFICE, OFFICE_TOP)
K.parapet(hb, OFFICE, OFFICE_TOP, 0.9, 'std:white', w=0.3)
crown = H.offset(OFFICE, 2.2)
for e in H.edges(OFFICE):
    for k in range(int(e['L'] / 6) + 1):
        x = e['a'][0] + e['t'][0] * k * e['L'] / max(1, int(e['L'] / 6)); z = e['a'][1] + e['t'][1] * k * e['L'] / max(1, int(e['L'] / 6))
        hb.box('std:white', x, OFFICE_TOP, z, 0.5, 4.2, 0.5)
hb.prism('std:white', crown, OFFICE_TOP + 4.2, OFFICE_TOP + 5.0, bottom='std:white')
oe = facing(OFFICE, (0.6, -0.8))
K.frame(hb, oe, out=2.2)
K.text3d(hb, 'glow:millBlue', 'ДЗИ', oe['L'] * 0.3, OFFICE_TOP + 5.2, -0.5, 2.0, 0.3, back=True)
K.text3d(hb, 'glow:millBlue', 'ОББ', oe['L'] * 0.72, OFFICE_TOP + 5.2, -0.5, 2.0, 0.3, back=True)
hb.pop()
oe2 = facing(OFFICE, NW, minL=15)
K.frame(hb, oe2, out=2.2)
K.text3d(hb, 'glow:millBlue', 'ОББ', oe2['L'] / 2, OFFICE_TOP + 5.2, -0.5, 2.0, 0.3, back=True)
hb.pop()

# ------------------------------------------------------------------ the residential tower: stacked balconies
plinth(RESID)
for e in H.edges(RESID):
    for a, b in runs(e):
        ground_floor(e, a, b, 600 + e['i'], kinds=('lobby',))
glass_tower(RESID, 5.6, RESID_TOP, RFL)
for e in H.edges(RESID):
    if not runs(e):
        continue
    K.frame(hb, e)
    for k in range(1, int((RESID_TOP - 6) / RFL)):
        yy = 5.6 + k * RFL
        d = 1.8 if k % 2 else 1.2
        # each face's slab runs on round the corner at its far end, so the corners are covered once
        hb.box('std:white', (e['L'] + d) / 2, yy - 0.3, d / 2, e['L'] + d, 0.3, d, bottom=False)
        hb.soffit('std:beige', 0, e['L'] + d, yy - 0.3, 0, d)
        hb.face('glass:rail', [(0, yy, d - 0.05), (e['L'] + d, yy, d - 0.05), (e['L'] + d, yy + 1.0, d - 0.05), (0, yy + 1.0, d - 0.05)])
        hb.box('std:white', (e['L'] + d) / 2, yy + 1.0, d - 0.05, e['L'] + d, 0.06, 0.08)
    hb.pop()
hb.cap('std:roof', RESID, RESID_TOP)
K.parapet(hb, RESID, RESID_TOP, 1.4, 'std:white', w=0.4)
hb.prism('std:white', H.offset(RESID, -3.0), RESID_TOP, RESID_TOP + 3.6)

# ------------------------------------------------------------------ build, bake, export
ob = hb.build()
if '--nobake' not in sys.argv:
    H.add_ground(pk, hb, margin=25, step=4.0)
    H.lightmap_uv(ob)
    ao = H.bake_ao(ob, H.arg('--size', 2048, int), 4.0, H.arg('--samples', 48, int))
    H.save_ao(ao, NAME)
    H.export(ob, NAME, {'anchor': [round(cx, 2), round(cz, 2)], 'base': DATUM, 'source': 'tools/blender/hero/millennium.py'})
if '--preview' in sys.argv:
    SP = os.environ.get('PREVIEW_DIR', '/tmp')
    if '--nobake' in sys.argv:
        H.add_ground(pk, hb, margin=60, step=4.0)
    rel = lambda x, h, z: (x - cx, gy(x, z) + h, z - cz)
    H.preview(f'{SP}/mill_front.jpg', rel(-3118, 1.8, -1510), rel(-3062, 40, -1468), lens=14)
    H.preview(f'{SP}/mill_far.jpg', rel(-3200, 3.0, -1620), rel(-3060, 45, -1470), lens=24)
