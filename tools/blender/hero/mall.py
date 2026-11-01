# Bulgaria Mall, бул. „България“ 69 / бул. „Тодор Каблешков“ (MYS Architects with Studio 17.5, developer MRPI,
# opened 1 December 2012). Massing from the OSM building parts (world7 pack): the 22-storey South Tower by бул.
# „България“, the 14-storey office slab along Каблешков, the 16-storey North Tower at its east end, the central
# atrium (36 m high inside, glazed roof), the shopping floors and - not mapped as a part, rebuilt from the
# building outline - the glass entrance block at the corner of the two boulevards.
# Appearance from street-level photographs supplied by the user (August 2024) and the published descriptions
# (double-skin glazed entrance with LED lighting, stainless "Bulgaria Mall" letters along Каблешков):
#   * towers and slab: blue reflective curtain walls, a stack of cantilevered terraces with glass balustrades on
#     the slab and on the South Tower, a dark glass strip on the North Tower, telecom masts on the South Tower;
#   * shopping podium along Каблешков: shop windows, "pixel" cladding in four greys, a recessed top floor behind
#     white columns and a white fascia with the TECHNOPOLIS and BILLA letters;
#   * entrance block: a white-framed glass box, the entrance under a dark canopy with BULGARIA MALL letters,
#     a cafe on the ground floor with its terrace; a digital billboard in front.
# Storey heights (podium 17 m, office floors 3.6 m) are estimated from the photographs and the storey counts; the
# OSM heights (slab 45.8 m, North Tower 56 m) are lower than the storey counts imply.
#   blenv/bin/python tools/blender/hero/mall.py [--preview] [--samples 64] [--size 2048] [--nobake]
import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import herolib as H
import herokit as K
from shapely.geometry import Polygon, Point, LineString
from shapely.ops import unary_union

NAME = 'mall'
pk = H.Pack('7')
H.reset()


def fp(x, z, tol=0.2):
    return H.orient(H.simplify(pk.building(x, z, 3)['pts'], tol))


T97 = fp(-5247.1, 541.0)   # South Tower, 22 floors
SLAB = fp(-5146.9, 545.1)  # office slab, 14 floors
T96 = fp(-5117.6, 559.0)   # North Tower, 16 floors
ATR = fp(-5188.2, 550.3, 0.4)  # atrium
B94 = fp(-5150.2, 595.4)
B95 = fp(-5201.8, 576.1)
rem = pk.building(-5198.9, 535.9, 3)
REM = Polygon(rem['pts'], rem['holes'])
BOXP = Polygon([(-5216.1, 546.5), (-5253.9, 519.0), (-5239.4, 498.6), (-5243.4, 494.4), (-5227.4, 481.9),
                (-5221.4, 473.5), (-5190.0, 495.7), (-5205.5, 517.4)]).difference(Polygon(ATR).buffer(1.0))
if BOXP.geom_type != 'Polygon':
    BOXP = max(BOXP.geoms, key=lambda g: g.area)
BOX = H.orient(H.simplify(list(BOXP.exterior.coords)[:-1], 0.3))
RESTG = REM.difference(BOXP.buffer(0.05))
REST = [H.orient(H.simplify(list(g.exterior.coords)[:-1], 0.3)) for g in getattr(RESTG, 'geoms', [RESTG]) if g.area > 60]

DATUM = 75.2          # ground floor = the pavement along Каблешков
POD, FH = 17.0, 3.6   # podium top, office storey
SLAB_TOP, T96_TOP, T97_TOP = POD + 11 * FH, POD + 13 * FH, POD + 19 * FH
BOX_TOP, BODY, ATR_TOP = 29.0, 25.0, 30.5
ALL = [T97, SLAB, T96, ATR, B94, B95, BOX] + REST
U = unary_union([Polygon(p).buffer(0.05) for p in ALL])
cx, cz = U.centroid.x, U.centroid.y
hb = H.HB(NAME, (cx, cz), DATUM)

# ------------------------------------------------------------------ materials (preview colours; game: HeroStyle.js)
hb.mat('cw:mallBlue', (0.16, 0.30, 0.52), 0.05, 0.85)
hb.mat('cw:mallBlueDark', (0.08, 0.13, 0.22), 0.05, 0.85)
hb.mat('cw:mallBox', (0.74, 0.82, 0.80), 0.1, 0.4)
hb.mat('cw:mallPodium', (0.12, 0.15, 0.18), 0.1, 0.6)
hb.mat('std:white', (0.86, 0.87, 0.86), 0.45)
hb.mat('std:alu', (0.62, 0.65, 0.68), 0.35, 0.8)
hb.mat('std:steel', (0.6, 0.62, 0.64), 0.35, 0.8)
hb.mat('std:steelDark', (0.12, 0.13, 0.14), 0.45, 0.6)
hb.mat('std:chk1', (0.90, 0.90, 0.89), 0.5)
hb.mat('std:chk2', (0.66, 0.67, 0.68), 0.5)
hb.mat('std:chk3', (0.42, 0.43, 0.45), 0.5)
hb.mat('std:chk4', (0.22, 0.23, 0.25), 0.5)
hb.mat('std:joint', (0.16, 0.17, 0.18), 0.7)
hb.mat('std:canopy', (0.20, 0.21, 0.23), 0.5, 0.3)
hb.mat('std:plinth', (0.35, 0.35, 0.36), 0.8)
hb.mat('std:roof', (0.45, 0.45, 0.44), 0.95)
hb.mat('std:plant', (0.62, 0.64, 0.66), 0.5, 0.4)
hb.mat('std:plantDark', (0.2, 0.21, 0.22), 0.6, 0.3)
hb.mat('std:skylight', (0.25, 0.38, 0.45), 0.08, 0.7)
hb.mat('std:umbrella', (0.16, 0.14, 0.12), 0.8)
hb.mat('std:cafeTable', (0.3, 0.2, 0.12), 0.6)
hb.mat('std:cafeChair', (0.1, 0.1, 0.1), 0.6)
hb.mat('std:lcwBlue', (0.02, 0.24, 0.62), 0.4)
hb.mat('std:planter', (0.3, 0.31, 0.32), 0.7)
hb.mat('std:hedge', (0.16, 0.30, 0.10), 0.95)
hb.mat('glass:shop', (0.55, 0.65, 0.68), 0.05)
hb.mat('glass:door', (0.5, 0.6, 0.62), 0.05)
hb.mat('glass:rail', (0.18, 0.24, 0.28), 0.05)
hb.mat('glow:red', (0.85, 0.05, 0.04), 0.4, emit=(1, 0.1, 0.05))
hb.mat('glow:yellow', (1.0, 0.78, 0.0), 0.4, emit=(1, 0.8, 0.1))
hb.mat('glow:white', (0.95, 0.95, 0.95), 0.4, emit=(1, 1, 1))
hb.mat('glow:steel', (0.75, 0.78, 0.8), 0.25, emit=(0.8, 0.9, 1))
hb.mat('glow:shopLight', (0.95, 0.95, 0.9), 0.4, emit=(1, 0.95, 0.85))
hb.mat('glow:pendant', (0.95, 0.85, 0.6), 0.4, emit=(1, 0.8, 0.5))
hb.mat('glow:screen', (0.15, 0.2, 0.3), 0.3, emit=(0.6, 0.8, 1))
hb.mat('sign:mallScreen', (0.2, 0.3, 0.5), 0.3)
for k, c in (('floor', (0.75, 0.73, 0.70)), ('wall', (0.88, 0.87, 0.85)), ('ceiling', (0.9, 0.9, 0.9)), ('wood', (0.45, 0.30, 0.18)),
             ('cloth1', (0.1, 0.1, 0.12)), ('cloth2', (0.75, 0.72, 0.66)), ('cloth3', (0.55, 0.12, 0.15)), ('cloth4', (0.2, 0.3, 0.5)),
             ('skin', (0.9, 0.88, 0.85)), ('chair', (0.15, 0.15, 0.15)), ('menu', (0.1, 0.25, 0.18)), ('white', (0.92, 0.92, 0.92))):
    hb.mat('int:' + k, c, 0.6)


# ------------------------------------------------------------------ helpers
def ground_lo(pts):
    """Lowest terrain under an outline (game y relative to the datum), for the plinth."""
    ys = []
    for e in H.edges(pts):
        for t in (0, 0.25, 0.5, 0.75):
            ys.append(pk.y(e['a'][0] + e['t'][0] * e['L'] * t, e['a'][1] + e['t'][1] * e['L'] * t))
    return min(ys) - DATUM - 0.6


def exterior(e, d=1.0):
    mx = e['a'][0] + e['t'][0] * e['L'] / 2 + e['n'][0] * d
    mz = e['a'][1] + e['t'][1] * e['L'] / 2 + e['n'][1] * d
    return not U.contains(Point(mx, mz))


def runs(e, d=1.0, step=1.0, minlen=2.0):
    """Stretches [s0, s1] of edge e whose outside (d metres out) is open, i.e. not against another part."""
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


def edge_near(pts, x, z):
    return min(H.edges(pts), key=lambda e: math.hypot(e['a'][0] + e['t'][0] * e['L'] / 2 - x, e['a'][1] + e['t'][1] * e['L'] / 2 - z))


def s_from(e, x, z):
    """Function s(d) for a position d metres from the end of e nearer (x, z)."""
    near_a = math.hypot(e['a'][0] - x, e['a'][1] - z) < math.hypot(e['b'][0] - x, e['b'][1] - z)
    return (lambda d: d) if near_a else (lambda d: e['L'] - d)


def plinth(pts, only=None):
    lo = ground_lo(pts)
    if lo < 0.15:
        hb.ring('std:plinth', pts, lo, 0.15, only=only)


def roof(pts, y, par=1.1, plant=0, seed=1, par_mat='std:alu'):
    hb.cap('std:roof', pts, y)
    K.parapet(hb, pts, y, par, par_mat, w=0.3)
    if plant:
        K.roof_plant(hb, pts, y, plant, seed)


SHOP_SIGNS = []  # (edge, s, text, mat, y, cap)


def podium_front(e, y0, y1, seed, kinds=('fashion',), s0=0.0, s1=None, colonnade=True):
    """Shopping podium face: shop windows with interiors, pixel cladding, colonnade floor, white fascia."""
    s1 = e['L'] if s1 is None else s1
    L = s1 - s0
    # ground floor: glazing 0.3..5.0 in bays of ~6 m, each bay a shop window with the room behind
    nb = max(1, round(L / 6.2))
    bw = L / nb
    K.frame(hb, e)
    rnd = random.Random(seed)
    for i in range(nb):
        x0, x1 = s0 + i * bw, s0 + (i + 1) * bw
        hb.face('glass:shop', [(x0, 0.3, 0), (x1, 0.3, 0), (x1, 5.0, 0), (x0, 5.0, 0)])
        K.shop_interior(hb, x0 + 0.15, x1 - 0.15, 4.4, 5.5, rnd.choice(kinds), seed * 31 + i)
        hb.box('std:steelDark', x0, 0, 0.05, 0.25, 5.2, 0.3)  # pier
        hb.box('std:steelDark', (x0 + x1) / 2, 2.9, 0.06, bw, 0.08, 0.12)  # transom
        hb.box('std:steelDark', (x0 + x1) / 2, 0.0, 0.05, bw, 0.3, 0.12)  # sill
    hb.box('std:steelDark', s1, 0, 0.05, 0.25, 5.2, 0.3)
    # sign band over the windows
    hb.box('std:joint', (s0 + s1) / 2, 5.0, 0.12, L, 0.6, 0.25)
    # pixel cladding on the two upper shop floors
    hb.face('std:joint', [(s0, 5.6, 0), (s1, 5.6, 0), (s1, 11.4, 0), (s0, 11.4, 0)])
    hb.pop()
    K.checker(hb, e, s0, s1, 5.6, 11.4, 1.55, 1.18, ['std:chk1', 'std:chk2', 'std:chk3', 'std:chk4'], [0.22, 0.32, 0.3, 0.16], seed)
    K.frame(hb, e)
    if colonnade:
        # recessed top floor behind white columns, white fascia above
        hb.face('cw:mallPodium', [(s0, 11.4, -1.6), (s1, 11.4, -1.6), (s1, 14.8, -1.6), (s0, 14.8, -1.6)])
        hb.face('std:white', [(s0, 11.4, 0), (s1, 11.4, 0), (s1, 11.4, -1.6), (s0, 11.4, -1.6)])
        hb.face('std:white', [(s0, 14.8, -1.6), (s1, 14.8, -1.6), (s1, 14.8, 0.6), (s0, 14.8, 0.6)])
        hb.box('std:white', (s0 + s1) / 2, 14.8, 0.6 - 0.45, L, 2.4, 0.9, bottom=True)
        # railing on the loggia
        hb.box('std:alu', (s0 + s1) / 2, 12.45, -0.1, L, 0.05, 0.06)
        hb.face('glass:rail', [(s0, 11.4, -0.1), (s1, 11.4, -0.1), (s1, 12.45, -0.1), (s0, 12.45, -0.1)])
    else:
        hb.face('std:white', [(s0, 11.4, 0), (s1, 11.4, 0), (s1, y1, 0), (s0, y1, 0)])
    hb.pop()
    if colonnade:
        K.colonnade(hb, e, s0 + 1.0, s1 - 1.0, 11.4, 14.8, 6.0, 0.8, 'std:white', out=0.6)


def body_face(e, y1, seed, s0=0.0, s1=None):
    """Back faces of the shopping floors: dark base with service doors, pixel cladding, white top band."""
    s1 = e['L'] if s1 is None else s1
    L = s1 - s0
    K.frame(hb, e)
    hb.face('std:joint', [(s0, 0, 0), (s1, 0, 0), (s1, y1, 0), (s0, y1, 0)])
    hb.box('std:plinth', s0 + L / 2, 0, 0.04, L, 4.6, 0.08, top=True)
    nd = int(L // 28)
    for k in range(nd):
        K.door_set(hb, s0 + (k + 0.5) * L / nd, 2.6, 2.6, glass='glass:door', z=0.1)
    hb.box('std:white', s0 + L / 2, y1 - 3.4, 0.15, L, 3.4, 0.3, bottom=True)
    hb.pop()
    if L > 1.5:
        K.checker(hb, e, s0 + 0.4, s1 - 0.4, 4.9, y1 - 3.6, 1.55, 1.18, ['std:chk1', 'std:chk2', 'std:chk3', 'std:chk4'], [0.2, 0.3, 0.32, 0.18], seed, join=0.35)


# ------------------------------------------------------------------ office slab and North Tower (along Каблешков)
ne = edge_near(SLAB, -5156, 520)  # the Каблешков face
sN = s_from(ne, -5190.0, 495.8)   # distances from its north-west end
plinth(SLAB)
for e in H.edges(SLAB):
    for a, b in runs(e):
        podium_front(e, 0, POD, 11 + e['i'], kinds=('fashion', 'fashion', 'fashion', 'tech') if e['i'] == ne['i'] else ('fashion',), s0=a, s1=b)
hb.cap('std:roof', SLAB, POD - 0.01)
# office floors: blue glass, the darker end bay and the terrace stack near the north-west end
for e in H.edges(SLAB):
    if e['i'] == ne['i']:
        a, b = sorted((sN(0), sN(9.0)))
        c, d = sorted((sN(9.0), e['L'] if sN(0) == 0 else 0))
        K.frame(hb, e)
        hb.face('cw:mallBlueDark', [(a, POD, 0), (b, POD, 0), (b, SLAB_TOP, 0), (a, SLAB_TOP, 0)])
        hb.face('cw:mallBlue', [(c, POD, 0), (d, POD, 0), (d, SLAB_TOP, 0), (c, SLAB_TOP, 0)])
        hb.pop()
        K.mullions(hb, e, POD, SLAB_TOP, 1.5, 'std:alu', rows=[POD + k * FH for k in range(1, 11)])
        s0 = min(sN(11.0), sN(17.5))
        K.balcony_stack(hb, e, s0, 6.5, POD + FH, 10, FH, 1.7, back='cw:mallBlueDark')
    else:
        hb.wall('cw:mallBlue', e['a'], e['b'], POD, SLAB_TOP)
        K.mullions(hb, e, POD, SLAB_TOP, 1.5, 'std:alu', rows=[POD + k * FH for k in range(1, 11)])
roof(SLAB, SLAB_TOP, plant=7, seed=3)

plinth(T96)
for e in H.edges(T96):
    for a, b in runs(e):
        podium_front(e, 0, POD, 21 + e['i'], kinds=('fashion', 'cafe'), s0=a, s1=b)
for e in H.edges(T96):
    hb.wall('cw:mallBlue', e['a'], e['b'], POD, T96_TOP)
    K.mullions(hb, e, POD, T96_TOP, 1.5, 'std:alu', rows=[POD + k * FH for k in range(1, 13)])
    if e['L'] > 20:
        # the dark glass strip down the middle of the long faces
        K.frame(hb, e)
        hb.box('cw:mallBlueDark', e['L'] / 2, POD, 0.1, 3.2, T96_TOP - POD + 1.0, 0.2)
        hb.pop()
roof(T96, T96_TOP, par=1.4, plant=0)
hb.prism('std:plant', H.offset(T96, -4.0), T96_TOP, T96_TOP + 4.2)

# ------------------------------------------------------------------ South Tower (by бул. България)
plinth(T97)
for e in H.edges(T97):
    for a, b in runs(e):
        podium_front(e, 0, POD, 31 + e['i'], kinds=('fashion', 'cafe', 'tech'), s0=a, s1=b)
t97ne = edge_near(T97, -5239, 530)
for e in H.edges(T97):
    hb.wall('cw:mallBlue', e['a'], e['b'], POD, T97_TOP)
    K.mullions(hb, e, POD, T97_TOP, 1.5, 'std:alu', rows=[POD + k * FH for k in range(1, 19)])
sE = s_from(t97ne, -5216.2, 546.5)
K.balcony_stack(hb, t97ne, min(sE(2.0), sE(8.0)), 6.0, POD + 3 * FH, 16, FH, 1.5, back='cw:mallBlueDark')
roof(T97, T97_TOP, par=1.5, plant=0)
hb.prism('std:plant', H.offset(T97, -5.0), T97_TOP, T97_TOP + 4.5)
# telecom masts on the north-west corner
c = min(T97, key=lambda p: p[0] - p[1] * 0.2)
for k, (dx, dz) in enumerate(((3.0, 3.0), (6.5, 2.5), (3.5, 6.5))):
    mx, mz = c[0] + dx, c[1] + dz
    if not H.inside(T97, mx, mz):
        mx, mz = H.centroid(T97)
    hb.tube('std:steel', (mx, T97_TOP, mz), (mx, T97_TOP + 7.5 + k, mz), 0.12)
    for a in range(3):
        ang = a * 2.1
        hb.box('std:white', mx + math.cos(ang) * 0.35, T97_TOP + 4.6 + k, mz + math.sin(ang) * 0.35, 0.3, 1.6, 0.12, yaw=ang + math.pi / 2)

# ------------------------------------------------------------------ the glass entrance block
plinth(BOX)
box_ne = edge_near(BOX, -5206, 484)       # along Каблешков: the cafe
box_nw = edge_near(BOX, -5235.4, 488.2)   # towards the crossing: the entrance
for e in H.edges(BOX):
    if not runs(e):
        continue
    gf = 5.0 if e['i'] in (box_ne['i'], box_nw['i']) else 0.15
    hb.wall('cw:mallBox', e['a'], e['b'], gf, BOX_TOP)
    K.mullions(hb, e, 0.15 if gf < 1 else gf, BOX_TOP, 1.5, 'std:white', depth=0.32, w=0.09, rows=[gf + k * 2.4 for k in range(0, 11)])
hb.cap('std:roof', BOX, BOX_TOP)
K.parapet(hb, BOX, BOX_TOP, 0.9, 'std:white', w=0.35)
# cafe on the Каблешков side: the ground floor open glass with the cafe behind it, its terrace in front
e = box_ne
K.frame(hb, e)
hb.face('glass:shop', [(0.3, 0.15, 0), (e['L'] - 0.3, 0.15, 0), (e['L'] - 0.3, 5.0, 0), (0.3, 5.0, 0)])
K.shop_interior(hb, 0.5, e['L'] - 0.5, 4.6, 7.0, 'cafe', 41)
hb.box('std:white', e['L'] / 2, 4.9, 0.2, e['L'], 0.4, 0.4)
K.text3d(hb, 'glow:white', 'STARBUCKS', e['L'] * 0.35, 3.75, 0.02, 0.55, 0.08)
for k in range(5):
    x = 4.0 + k * (e['L'] - 8.0) / 4
    K.cafe_set(hb, x, 3.2, 50 + k, n=4)
    K.umbrella(hb, x, 3.2, 2.8, 2.55)
hb.face('glass:rail', [(1.5, 0, 6.0), (e['L'] - 1.5, 0, 6.0), (e['L'] - 1.5, 1.0, 6.0), (1.5, 1.0, 6.0)])
hb.pop()
# entrance towards the crossing: lobby glass, doors, dark canopy with the BULGARIA MALL letters
e = box_nw
K.frame(hb, e)
hb.face('glass:door', [(0.3, 0.15, 0), (e['L'] - 0.3, 0.15, 0), (e['L'] - 0.3, 5.0, 0), (0.3, 5.0, 0)])
K.shop_interior(hb, 0.5, e['L'] - 0.5, 4.6, 8.0, 'lobby', 42)
for k in range(3):
    K.door_set(hb, e['L'] / 2 + (k - 1) * 3.6, 3.0, 3.0, z=0.08)
K.canopy(hb, e['L'] / 2, 0.0, 6.6, min(e['L'] - 1.0, 17.0), 4.6, 0.9, 'std:canopy', soffit='std:canopy', lights='glow:shopLight')
K.text3d(hb, 'glow:steel', 'BULGARIA MALL', e['L'] / 2, 6.6, 3.9, 0.95, 0.25, width=min(e['L'] - 2.5, 15.5))
hb.pop()

# ------------------------------------------------------------------ atrium: clerestory and glazed roof
for e in H.edges(ATR):
    hb.wall('cw:mallBox', e['a'], e['b'], BODY - 0.5, ATR_TOP)
    K.mullions(hb, e, BODY - 0.5, ATR_TOP, 1.5, 'std:white', depth=0.2, rows=[ATR_TOP - 0.2])
hb.cap('std:skylight', ATR, ATR_TOP + 0.6)
ag = Polygon(ATR)
x0, z0, x1, z1 = ag.bounds
ang = math.atan2(*H.edges(SLAB)[0]['t'][::-1])
for k in range(-30, 31):
    for dirv in ((math.cos(ang), math.sin(ang)), (-math.sin(ang), math.cos(ang))):
        ox, oz = ag.centroid.x + dirv[1] * k * 3.2, ag.centroid.y - dirv[0] * k * 3.2
        ln = LineString([(ox - dirv[0] * 80, oz - dirv[1] * 80), (ox + dirv[0] * 80, oz + dirv[1] * 80)]).intersection(ag.buffer(-0.3))
        for seg in getattr(ln, 'geoms', [ln]):
            if seg.is_empty or seg.length < 0.5:
                continue
            (ax, az), (bx, bz) = list(seg.coords)[0], list(seg.coords)[-1]
            hb.beam('std:steel', (ax, ATR_TOP + 0.7, az), (bx, ATR_TOP + 0.7, bz), 0.18, 0.3)
for e in H.edges(ATR):
    hb.wall('std:white', e['a'], e['b'], ATR_TOP, ATR_TOP + 0.8)

# ------------------------------------------------------------------ the shopping floors behind
for i, P in enumerate([B94, B95] + REST):
    plinth(P)
    for e in H.edges(P):
        for a, b in runs(e):
            body_face(e, BODY, 60 + i * 7 + e['i'], a, b)
    roof(P, BODY, plant=max(2, int(Polygon(P).area / 260)), seed=70 + i)

# ------------------------------------------------------------------ signs on the podium
K.frame(hb, ne)
for d, text, mat, y, cap in ((24.0, 'BILLA', 'glow:yellow', 15.35, 1.45), (47.0, 'TECHNOPOLIS', 'glow:red', 15.45, 1.2),
                             (40.0, 'terranova', 'glow:white', 8.0, 0.9), (63.0, 'RESERVED', 'glow:white', 8.2, 0.85),
                             (52.0, 'GUESS', 'glow:white', 5.1, 0.42)):
    K.text3d(hb, mat, text, sN(d), y, 0.62 if y > 14 else 0.06, cap, 0.18 if y > 14 else 0.1)
# LC Waikiki box sign on the cladding
x = sN(13.0)
hb.box('std:lcwBlue', x, 8.6, 0.2, 6.2, 1.6, 0.3)
K.text3d(hb, 'glow:white', 'LC WAIKIKI', x, 9.05, 0.35, 0.62, 0.05, width=5.6)
hb.pop()

# freestanding stainless letters along Каблешков and the digital billboard
K.frame(hb, ne)
lx = sN(30.0)
gx = ne['a'][0] + ne['t'][0] * lx + ne['n'][0] * 9.0
gz = ne['a'][1] + ne['t'][1] * lx + ne['n'][1] * 9.0
gy = pk.y(gx, gz) - DATUM
hb.push(lx, gy, 9.0, 0)
hb.box('std:plinth', 0, -0.4, 0, 31.0, 0.7, 1.0)
K.text3d(hb, 'glow:steel', 'BULGARIA MALL', 0, 0.3, -0.25, 2.3, 0.5, width=30.0)
hb.pop()
bx = sN(4.5)
hb.push(bx, pk.y(ne['a'][0] + ne['t'][0] * bx + ne['n'][0] * 5, ne['a'][1] + ne['t'][1] * bx + ne['n'][1] * 5) - DATUM, 5.0, 0)
for lxx in (-1.6, 1.6):
    hb.box('std:steelDark', lxx, -0.5, 0, 0.35, 4.2, 0.35)
hb.box('std:steelDark', 0, 3.4, -0.15, 7.6, 4.0, 0.3)
hb.sign('sign:mallScreen', -3.6, 3.6, 3.6, 7.2, 0.01)
hb.pop()
hb.pop()

# ------------------------------------------------------------------ build, bake, export
ob = hb.build()
if '--nobake' not in sys.argv:
    gr = H.add_ground(pk, hb, margin=30, step=4.0)
    H.lightmap_uv(ob)
    ao = H.bake_ao(ob, H.arg('--size', 2048, int), 4.0, H.arg('--samples', 48, int))
    H.save_ao(ao, NAME)
    H.export(ob, NAME, {'anchor': [round(cx, 2), round(cz, 2)], 'base': DATUM, 'source': 'tools/blender/hero/mall.py'})
if '--preview' in sys.argv:
    SP = os.environ.get('PREVIEW_DIR', '/tmp')
    if '--nobake' in sys.argv:
        H.add_ground(pk, hb, margin=60, step=4.0)
    rel = lambda x, y, z: (x - cx, y, z - cz)
    H.preview(f'{SP}/mall_kab.jpg', rel(-5172, 2.0, 452), rel(-5200, 18, 520), lens=14)
    H.preview(f'{SP}/mall_blvd.jpg', rel(-5262, 3.5, 405), rel(-5190, 20, 515), lens=18)
    H.preview(f'{SP}/mall_air.jpg', rel(-5090, 120, 410), rel(-5185, 20, 540), lens=24)
