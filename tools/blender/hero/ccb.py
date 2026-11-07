# Централна кооперативна банка (the former Hotel Pliska, re-clad 2015), бул. „Цариградско шосе“ 87 at the Pliska
# junction (stops 2326 / 2327 of bus line 84, also passed by line 280): one Blender model shared by both lines.
# Massing from the OSM outlines (world84 #5035 tower 36.6 x 18.7 m, 58.6 m; #5036 the two-storey podium, 7.4 m).
# Appearance from the photographs supplied by the user (from the boulevard, from the east, the lettered face):
#   * the slab's long faces: blue reflective curtain wall set inside a grey aluminium frame (a deep top band with
#     the bank's name, narrow side bands, a ledge over a recessed glazed first floor), a few open tilt windows;
#   * the end faces: grey panel cladding with a deep vertical slot;
#   * a dark glass penthouse on the roof with a telecom mast;
#   * the podium: grey stone fascia, a ribbon of dark glass, the ground floor recessed behind square stone piers;
#   * the bank's name in a generic typeface with a plain round emblem (no logo artwork).
# Storey heights (3.2 m) and the frame proportions are estimated from the photographs.
#   blenv/bin/python tools/blender/hero/ccb.py [--preview] [--samples 48] [--size 2048] [--nobake]
import math
import os
import random
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import herolib as H
import herokit as K
from shapely.geometry import Polygon

NAME = 'ccb'
pk = H.Pack('84')
H.reset()

TW = pk.building(630.2, -714.7, 3)
PD = pk.building(645.4, -715.0, 3)
DATUM = 45.0
AX, AZ = 630.2, -714.7
hb = H.HB(NAME, (AX, AZ), DATUM)
rnd = random.Random(87)

hb.mat('cw:ccbBlue', (0.10, 0.22, 0.45), 0.05, 0.85)
hb.mat('cw:ccbDark', (0.06, 0.10, 0.18), 0.05, 0.85)
hb.mat('cw:ccbPodium', (0.08, 0.14, 0.24), 0.05, 0.7)
hb.mat('pn:ccbGrey', (0.62, 0.64, 0.66), 0.4, 0.4)
hb.mat('pn:ccbStone', (0.50, 0.51, 0.52), 0.7)
hb.mat('std:frame', (0.58, 0.60, 0.62), 0.35, 0.6)
hb.mat('std:mull', (0.30, 0.34, 0.40), 0.35, 0.7)
hb.mat('std:slot', (0.10, 0.11, 0.12), 0.6, 0.2)
hb.mat('std:roof', (0.40, 0.40, 0.40), 0.9)
hb.mat('std:plant', (0.66, 0.68, 0.69), 0.5, 0.4)
hb.mat('std:plantDark', (0.22, 0.23, 0.24), 0.6, 0.3)
hb.mat('std:steel', (0.6, 0.62, 0.64), 0.35, 0.8)
hb.mat('std:steelDark', (0.12, 0.13, 0.14), 0.45, 0.6)
hb.mat('std:white', (0.88, 0.88, 0.87), 0.5)
hb.mat('glass:door', (0.5, 0.6, 0.62), 0.05)
hb.mat('glow:ccbNavy', (0.08, 0.12, 0.38), 0.4, emit=(0.6, 0.75, 1.0))
hb.mat('glow:shopLight', (0.95, 0.95, 0.9), 0.4, emit=(1, 0.95, 0.85))
hb.mat('glow:pendant', (0.95, 0.85, 0.6), 0.4, emit=(1, 0.8, 0.5))
hb.mat('glow:screen', (0.15, 0.2, 0.3), 0.3, emit=(0.6, 0.8, 1))
hb.mat('glow:red', (0.85, 0.05, 0.04), 0.4, emit=(1, 0.1, 0.05))
hb.mat('sign:ccbEmblem', (0.1, 0.2, 0.5), 0.4)
for k, c in (('floor', (0.70, 0.68, 0.65)), ('wall', (0.86, 0.86, 0.84)), ('ceiling', (0.9, 0.9, 0.9)), ('wood', (0.45, 0.30, 0.18)),
             ('cloth1', (0.1, 0.1, 0.12)), ('cloth2', (0.75, 0.72, 0.66)), ('cloth3', (0.55, 0.12, 0.15)), ('cloth4', (0.2, 0.3, 0.5)),
             ('skin', (0.9, 0.88, 0.85)), ('chair', (0.15, 0.15, 0.15)), ('menu', (0.1, 0.25, 0.18)), ('white', (0.92, 0.92, 0.92))):
    hb.mat('int:' + k, c, 0.6)

T = H.orient(TW['pts'])
P = H.orient(H.simplify(PD['pts'], 0.2))
POD, TOP, FH = 7.4, 58.6, 3.2
GL0 = POD + 3.4            # the frame's ledge: the glass starts above the recessed first floor
FR_TOP, FR_SIDE, REC = 3.4, 1.3, 0.55
TE = H.edges(T)
# the boulevard face: the long edge facing south-west (outward normal towards -x, +z)
longs = sorted(TE, key=lambda e: -e['L'])[:2]
SW = max(longs, key=lambda e: -e['n'][0] + e['n'][1])
NE = [e for e in longs if e is not SW][0]
ends = [e for e in TE if e not in longs]
lo = min(pk.y(x, z) for x, z in PD['pts']) - DATUM - 0.8

# ------------------------------------------------------------------ the slab
for e in longs:
    L = e['L']
    K.frame(hb, e)
    # the grey frame: top band, side bands (front faces at z = 0), ledge
    hb.face('pn:ccbGrey', [(0, TOP - FR_TOP, 0), (L, TOP - FR_TOP, 0), (L, TOP, 0), (0, TOP, 0)])
    for x0, x1 in ((0, FR_SIDE), (L - FR_SIDE, L)):
        hb.face('pn:ccbGrey', [(x0, GL0, 0), (x1, GL0, 0), (x1, TOP - FR_TOP, 0), (x0, TOP - FR_TOP, 0)])
    hb.box('std:frame', L / 2, GL0 - 0.45, 0.1, L, 0.45, 0.6, bottom=True)
    # the glass recessed in the frame, its reveals
    g0, g1 = FR_SIDE, L - FR_SIDE
    hb.face('cw:ccbBlue', [(g0, GL0, -REC), (g1, GL0, -REC), (g1, TOP - FR_TOP, -REC), (g0, TOP - FR_TOP, -REC)])
    K.oface(hb, 'pn:ccbGrey', [(g0, TOP - FR_TOP, -REC), (g1, TOP - FR_TOP, -REC), (g1, TOP - FR_TOP, 0), (g0, TOP - FR_TOP, 0)], (0, -1, 0))
    K.oface(hb, 'pn:ccbGrey', [(g0, GL0, 0), (g0, GL0, -REC), (g0, TOP - FR_TOP, -REC), (g0, TOP - FR_TOP, 0)], (1, 0, 0))
    K.oface(hb, 'pn:ccbGrey', [(g1, GL0, -REC), (g1, GL0, 0), (g1, TOP - FR_TOP, 0), (g1, TOP - FR_TOP, -REC)], (-1, 0, 0))
    # mullions (1.5 m) and transoms at each floor, slim fins
    n = max(1, round((g1 - g0) / 1.5))
    for i in range(1, n):
        x = g0 + i * (g1 - g0) / n
        hb.box('std:mull', x, GL0, -REC + 0.05, 0.06, TOP - FR_TOP - GL0, 0.1, top=False)
    y = GL0
    while y < TOP - FR_TOP - 0.5:
        hb.box('std:mull', (g0 + g1) / 2, y, -REC + 0.05, g1 - g0, 0.08, 0.12)
        y += FH
    # open tilt windows here and there (the dark squares on the photographs)
    for k in range(9):
        fl = rnd.randrange(1, 14)
        bay = rnd.randrange(1, n - 1)
        x = g0 + (bay + 0.5) * (g1 - g0) / n
        y = GL0 + fl * FH + 0.9
        hb.push(x, y, -REC + 0.02, 0)
        hb.face('std:slot', [(-0.62, 0, 0.02), (0.62, 0, 0.02), (0.62, 1.4, 0.02), (-0.62, 1.4, 0.02)])
        hb.face('cw:ccbDark', [(-0.62, 0, 0.32), (0.62, 0, 0.32), (0.62, 1.4, 0.0), (-0.62, 1.4, 0.0)])
        hb.pop()
    # the recessed glazed first floor under the ledge
    hb.face('cw:ccbDark', [(0, POD, -1.4), (L, POD, -1.4), (L, GL0 - 0.45, -1.4), (0, GL0 - 0.45, -1.4)])
    K.oface(hb, 'std:frame', [(0, GL0 - 0.45, -1.4), (L, GL0 - 0.45, -1.4), (L, GL0 - 0.45, 0.0), (0, GL0 - 0.45, 0.0)], (0, -1, 0))
    for i in range(0, 7):
        hb.box('std:mull', i * L / 6, POD, -1.35, 0.1, GL0 - POD - 0.45, 0.1)
    hb.pop()
for e in ends:
    L = e['L']
    K.frame(hb, e)
    # the deep vertical slot, a third of the way across from the boulevard side
    near_sw = min(math.hypot(e['a'][0] - p[0], e['a'][1] - p[1]) for p in (SW['a'], SW['b'])) < 0.5
    sx = L * 0.36 if near_sw else L * 0.64
    w0 = 0.35
    for x0, x1 in ((0, sx - w0), (sx + w0, L)):
        hb.face('pn:ccbGrey', [(x0, POD, 0), (x1, POD, 0), (x1, TOP, 0), (x0, TOP, 0)])
    hb.face('pn:ccbGrey', [(sx - w0, POD, 0), (sx + w0, POD, 0), (sx + w0, POD + 1.0, 0), (sx - w0, POD + 1.0, 0)])
    hb.face('pn:ccbGrey', [(sx - w0, TOP - 0.3, 0), (sx + w0, TOP - 0.3, 0), (sx + w0, TOP, 0), (sx - w0, TOP, 0)])
    w, d = 0.7, 0.8
    hb.face('std:slot', [(sx - w / 2, POD + 1.0, -d), (sx + w / 2, POD + 1.0, -d), (sx + w / 2, TOP - 0.3, -d), (sx - w / 2, TOP - 0.3, -d)])
    K.oface(hb, 'pn:ccbGrey', [(sx - w / 2, POD + 1.0, 0), (sx - w / 2, POD + 1.0, -d), (sx - w / 2, TOP - 0.3, -d), (sx - w / 2, TOP - 0.3, 0)], (1, 0, 0))
    K.oface(hb, 'pn:ccbGrey', [(sx + w / 2, POD + 1.0, -d), (sx + w / 2, POD + 1.0, 0), (sx + w / 2, TOP - 0.3, 0), (sx + w / 2, TOP - 0.3, -d)], (-1, 0, 0))
    K.oface(hb, 'std:slot', [(sx - w / 2, POD + 1.0, 0), (sx + w / 2, POD + 1.0, 0), (sx + w / 2, POD + 1.0, -d), (sx - w / 2, POD + 1.0, -d)], (0, 1, 0))
    hb.pop()
# roof: coping, the penthouse (dark glass) and the mast
hb.cap('std:roof', T, TOP - 0.2)
K.parapet(hb, T, TOP, 0.25, 'std:frame', w=0.4)
c = np.array(H.centroid(T))
t_ = np.array(SW['t']); n_ = np.array(SW['n'])
pc = c - t_ * 4.0 - n_ * 1.0
PH = H.orient([tuple(pc + t_ * a + n_ * b) for a, b in ((-10, -5), (10, -5), (10, 5), (-10, 5))])
for e in H.edges(PH):
    hb.wall('cw:ccbDark', e['a'], e['b'], TOP - 0.2, TOP + 4.4)
    K.frame(hb, e)
    nn = max(1, int(e['L'] / 1.5))
    for i in range(nn + 1):
        hb.box('std:mull', i * e['L'] / nn, TOP - 0.2, 0.03, 0.08, 4.6, 0.08)
    hb.pop()
hb.prism('std:frame', H.offset(PH, 0.25), TOP + 4.4, TOP + 4.9)
mx, mz = pc + t_ * 5.0
hb.tube('std:steel', (mx, TOP + 4.9, mz), (mx, TOP + 13.0, mz), 0.14, segs=8)
for a in range(3):
    ang = a * 2 * math.pi / 3
    hb.box('std:white', mx + math.cos(ang) * 0.45, TOP + 10.2, mz + math.sin(ang) * 0.45, 0.32, 1.9, 0.12, yaw=ang + math.pi / 2)
    hb.tube('std:steel', (mx, TOP + 8.4 - a * 0.6, mz), (mx + math.cos(ang + 0.6) * 1.1, TOP + 8.4 - a * 0.6, mz + math.sin(ang + 0.6) * 1.1), 0.04, segs=4)
    hb.cyl('std:white', mx + math.cos(ang + 0.6) * 1.15, TOP + 8.1 - a * 0.6, mz + math.sin(ang + 0.6) * 1.15, 0.3, 0.06, segs=10)
hb.box('glow:red', mx, TOP + 13.0, mz, 0.25, 0.25, 0.25)
K.roof_plant(hb, T, TOP - 0.2, 3, 7, inset=2.5, maxw=4.0)
# a window-cleaning rail along the roof edge
for e in longs:
    K.frame(hb, e)
    hb.box('std:steel', e['L'] / 2, TOP + 0.25, -1.2, e['L'] - 2, 0.12, 0.12)
    hb.pop()

# the bank's name on the top band of the boulevard face, the round emblem before it
K.frame(hb, SW)
L = SW['L']
hb.push(0, 0, 0.0, 0)
K.sface(hb, 'sign:ccbEmblem', [(2.6, TOP - FR_TOP + 0.55, 0.06), (5.0, TOP - FR_TOP + 0.55, 0.06), (5.0, TOP - FR_TOP + 2.95, 0.06), (2.6, TOP - FR_TOP + 2.95, 0.06)], (0, 0, 1))
hb.pop()
K.text3d(hb, 'glow:ccbNavy', 'Централна Кооперативна Банка', 5.6, TOP - FR_TOP + 0.85, 0.02, 1.6, 0.2, align='LEFT', side='std:frame', width=L - 7.6)
hb.pop()

# ------------------------------------------------------------------ the podium
TP = Polygon(T)


def podium_face(e, s0, s1, seed):
    """Podium storeys on edge e between s0 and s1: stone base, ground floor set back behind square stone piers
    (rooms behind), a slim cornice, the dark ribbon of the upper floor and the stone fascia."""
    L = s1 - s0
    K.frame(hb, e)
    hb.push(s0, 0, 0, 0)
    hb.face('pn:ccbStone', [(0, lo, 0), (L, lo, 0), (L, 0.0, 0), (0, 0.0, 0)])
    hb.face('pn:ccbStone', [(0, 6.0, 0), (L, 6.0, 0), (L, POD, 0), (0, POD, 0)])
    hb.face('cw:ccbPodium', [(0, 3.9, 0), (L, 3.9, 0), (L, 6.0, 0), (0, 6.0, 0)])
    hb.box('std:frame', L / 2, 3.75, 0.25, L, 0.18, 0.5, bottom=True)
    nn = max(1, int(L / 1.5))
    for i in range(nn + 1):
        hb.box('std:mull', i * L / nn, 3.9, 0.04, 0.07, 2.1, 0.08)
    if L > 4.0:
        R = 1.6
        K.oface(hb, 'pn:ccbStone', [(0, 3.75, 0), (L, 3.75, 0), (L, 3.75, -R), (0, 3.75, -R)], (0, -1, 0))
        hb.face('cw:ccbPodium', [(0, 0.05, -R), (L, 0.05, -R), (L, 3.75, -R), (0, 3.75, -R)])
        nb = max(1, round(L / 6.0))
        for i in range(nb + 1):
            hb.box('pn:ccbStone', i * L / nb + (0.35 if i == 0 else -0.35 if i == nb else 0), 0.0, -0.35, 0.7, 3.75, 0.7)
        for i in range(nb):
            x0, x1 = i * L / nb + 0.4, (i + 1) * L / nb - 0.4
            if x1 - x0 > 2.5:
                hb.push(0, 0, -R, 0)
                K.shop_interior(hb, x0, x1, 3.6, 5.0, 'lobby' if (i + seed) % 3 else 'cafe', 870 + seed * 13 + i)
                hb.pop()
            if i % 2 == 0:
                K.door_set(hb, (x0 + x1) / 2, 2.0, 2.4, glass='glass:door', z=-R + 0.06)
    else:
        hb.face('pn:ccbStone', [(0, 0.0, 0), (L, 0.0, 0), (L, 3.9, 0), (0, 3.9, 0)])
    hb.pop()
    hb.pop()


for e in H.edges(P):
    # skip the edges against the slab
    mx_, mz_ = e['a'][0] + e['t'][0] * e['L'] / 2 + e['n'][0] * 0.6, e['a'][1] + e['t'][1] * e['L'] / 2 + e['n'][1] * 0.6
    if TP.buffer(0.3).contains(Polygon([(mx_ - 0.1, mz_ - 0.1), (mx_ + 0.1, mz_ - 0.1), (mx_ + 0.1, mz_ + 0.1), (mx_ - 0.1, mz_ + 0.1)])):
        continue
    podium_face(e, 0.0, e['L'], e['i'])
# the slab's own ends at street level: the podium storeys wrap round them where no podium stands in front
for e in ends:
    mx_, mz_ = e['a'][0] + e['t'][0] * e['L'] / 2 + e['n'][0] * 1.5, e['a'][1] + e['t'][1] * e['L'] / 2 + e['n'][1] * 1.5
    if not Polygon(P).buffer(0.2).contains(Polygon([(mx_ - 0.1, mz_ - 0.1), (mx_ + 0.1, mz_ - 0.1), (mx_ + 0.1, mz_ + 0.1), (mx_ - 0.1, mz_ + 0.1)])):
        podium_face(e, 0.0, e['L'], 7 + e['i'])
hb.cap('std:roof', P, POD - 0.1)
K.parapet(hb, P, POD, 0.6, 'pn:ccbStone', w=0.3)
podroof = Polygon(P).difference(TP.buffer(2.0))
for g in getattr(podroof, 'geoms', [podroof]):
    if g.area > 120:
        K.roof_plant(hb, H.orient(list(g.exterior.coords)[:-1]), POD - 0.1, max(1, int(g.area / 260)), int(g.area) % 31, inset=2.0, maxw=4.5)

# ------------------------------------------------------------------ build, bake, export
ob = hb.build()
if '--nobake' not in sys.argv:
    H.add_ground(pk, hb, margin=25, step=4.0)
    H.lightmap_uv(ob)
    ao = H.bake_ao(ob, H.arg('--size', 2048, int), 4.0, H.arg('--samples', 48, int))
    H.save_ao(ao, NAME)
    H.export(ob, NAME, {'anchor': [AX, AZ], 'base': DATUM, 'source': 'tools/blender/hero/ccb.py'})
if '--preview' in sys.argv:
    SP = os.environ.get('PREVIEW_DIR', '/tmp')
    if '--nobake' in sys.argv:
        H.add_ground(pk, hb, margin=60, step=4.0)
    rel = lambda x, y, z: (x - AX, y, z - AZ)
    cb = c + n_ * 30 - t_ * 75   # from the boulevard, north-west (photo 5)
    H.preview(f'{SP}/ccb_blvd.jpg', rel(cb[0], 2.0, cb[1]), rel(c[0], 26, c[1]), lens=24)
    cs = c + n_ * 55 + t_ * 10   # the lettered face (photo 6)
    H.preview(f'{SP}/ccb_face.jpg', rel(cs[0], 2.0, cs[1]), rel(c[0], 30, c[1]), lens=20)
    ce = c - n_ * 20 + t_ * 80   # from the east (photo 4)
    H.preview(f'{SP}/ccb_east.jpg', rel(ce[0], 2.0, ce[1]), rel(c[0], 25, c[1]), lens=24)
