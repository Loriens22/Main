# Министерство на външните работи, ул. „Александър Жендов“ 2 (stops 1820 / 1819 of bus line 84 on бул.
# „Цариградско шосе“, across the plaza and the lawn). A square ring of four wings round a courtyard on its OSM
# outline (world84 #5656: 73 x 73 m, courtyard 45 x 45 m), the main front facing the boulevard (south-west).
# Appearance from the photographs supplied by the user (the front with the bull sculpture and the flags, the
# entrance canopy, the corner view):
#   * a white stone body of three storeys wrapped in deep wedge-shaped fins, one per window bay, under a heavy
#     overhanging cornice and a set-back attic storey; air-conditioning units here and there under the windows;
#   * a tall ground zone: on the left of the front the entrance under a projecting canopy block that carries the
#     ministry's name in Bulgarian, English and French and the state arms (drawn plainly), on two square columns,
#     flower boxes along its top; on the right the wing stands on tall square pillars and the courtyard shows
#     through;
#   * the paved plaza with a grid of dark bands, broad steps, flower pots, a low white balustrade, three flagpoles
#     (the flags of NATO, Bulgaria and the EU) and on the lawn the bronze bull (a free rendering) and boulders.
# Storey heights (ground zone 8.4 m, storeys 3.3 m, cornice 1.5 m, attic 2.6 m) and the fin rhythm (31 bays on the
# front) are estimated from the photographs; the OSM height (16.5 m) is lower than the storeys imply.
#   blenv/bin/python tools/blender/hero/mfa.py [--preview] [--samples 48] [--size 2048] [--nobake]
import math
import os
import random
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import herolib as H
import herokit as K
from shapely.geometry import Polygon, Point

NAME = 'mfa'
pk = H.Pack('84')
H.reset()
B = pk.building(170.0, -1299.2, 3)
OUT = H.orient(B['pts'])
HOLE = H.orient(B['holes'][0])
AX, AZ = H.centroid(OUT)
SWE = max(H.edges(OUT), key=lambda e: -e['n'][0] + e['n'][1])   # the front (outward normal towards south-west)
# datum: the ground along the front
DATUM = round(sum(pk.y(SWE['a'][0] + SWE['t'][0] * s, SWE['a'][1] + SWE['t'][1] * s) for s in np.linspace(0, SWE['L'], 9)) / 9, 2)
hb = H.HB(NAME, (AX, AZ), DATUM)
rnd = random.Random(1820)

STONE = 'lf:travertine:#e4dfd3'
hb.mat(STONE, (0.80, 0.78, 0.72), 0.7)
hb.mat('std:fin', (0.84, 0.82, 0.77), 0.65)
hb.mat('std:soffit', (0.82, 0.81, 0.77), 0.8)
hb.mat('cw:mfaWin', (0.10, 0.12, 0.14), 0.1, 0.5)
hb.mat('cw:mfaInner', (0.30, 0.32, 0.33), 0.2, 0.3)
hb.mat('cw:mfaLobby', (0.12, 0.15, 0.17), 0.08, 0.6)
hb.mat('pn:mfaPaving', (0.72, 0.72, 0.70), 0.8)
hb.mat('lf:ashlar:#b8ad98', (0.62, 0.58, 0.50), 0.8)
hb.mat('std:roof', (0.42, 0.42, 0.41), 0.9)
hb.mat('std:door', (0.05, 0.05, 0.05), 0.4, 0.3)
hb.mat('std:ac', (0.88, 0.89, 0.89), 0.5)
hb.mat('std:acGrille', (0.25, 0.26, 0.27), 0.6)
hb.mat('std:bronze', (0.20, 0.17, 0.12), 0.45, 0.8)
hb.mat('std:bronzeGreen', (0.17, 0.21, 0.17), 0.5, 0.7)
hb.mat('std:letter', (0.42, 0.32, 0.20), 0.4, 0.8)
hb.mat('std:pot', (0.92, 0.92, 0.90), 0.5)
hb.mat('std:flowerPink', (0.85, 0.15, 0.55), 0.8)
hb.mat('std:flowerRed', (0.80, 0.08, 0.10), 0.8)
hb.mat('std:leaves', (0.15, 0.32, 0.12), 0.9)
hb.mat('std:rock', (0.55, 0.53, 0.50), 0.95)
hb.mat('std:steel', (0.70, 0.72, 0.74), 0.3, 0.8)
hb.mat('std:dark', (0.10, 0.10, 0.11), 0.6)
hb.mat('glass:door', (0.5, 0.6, 0.62), 0.05)
hb.mat('glow:shopLight', (0.95, 0.95, 0.9), 0.4, emit=(1, 0.95, 0.85))
hb.mat('sign:mfaArms', (0.6, 0.45, 0.2), 0.5)
hb.mat('sign:flagBG', (0.9, 0.9, 0.9), 0.8)
hb.mat('sign:flagEU', (0.1, 0.2, 0.6), 0.8)
hb.mat('sign:flagNATO', (0.1, 0.15, 0.35), 0.8)

GZ, FLH, NFL = 8.4, 3.3, 3
MB = GZ + FLH * NFL          # 18.3: top of the fin storeys
CORN, CORN_OUT = 1.5, 1.3     # cornice fascia and projection
ATT, ATT_IN = 2.6, 2.6        # attic storey: height, set-back
lo = min(pk.y(x, z) for x, z in OUT) - DATUM - 0.6
L = SWE['L']
XE0, XE1 = 0.06 * L, 0.60 * L     # the canopy block on the front, from the west corner
XP = 0.61 * L                     # the front stands on pillars from here to the south corner
SEE = [e for e in H.edges(OUT) if np.linalg.norm(np.array(e['a']) - np.array(SWE['b'])) < 0.5][0]  # south-east face (starts at the south corner)
OPEN = {SWE['i']: (XP, L), SEE['i']: (0.0, 16.0)}   # pilotis spans per outer edge (local x)


def bays(Le):
    n = max(1, round(Le / 2.35))
    return n, Le / n


def fin_storeys(e, x0, x1, inner=False):
    """The three fin storeys of a wing face: stone spandrels and heads, the recessed window ribbon (texture with
    explicit UVs so its panes line up with the fins), wedge fins at every bay (deep at the top of each storey)."""
    Le = x1 - x0
    n, bw = bays(Le)
    K.frame(hb, e)
    for k in range(NFL):
        y0 = GZ + k * FLH
        ys, yw = y0 + 1.0, y0 + 2.9
        hb.face(STONE, [(x0, y0, 0), (x1, y0, 0), (x1, ys, 0), (x0, ys, 0)])
        hb.face(STONE, [(x0, yw, 0), (x1, yw, 0), (x1, y0 + FLH, 0), (x0, y0 + FLH, 0)])
        K.oface(hb, 'cw:mfaWin' if not inner else 'cw:mfaInner', [(x0, ys, -0.28), (x1, ys, -0.28), (x1, yw, -0.28), (x0, yw, -0.28)], (0, 0, 1),
                uv=[(0, 0), (n * 2.35, 0), (n * 2.35, yw - ys), (0, yw - ys)])
        K.oface(hb, STONE, [(x0, ys, 0), (x1, ys, 0), (x1, ys, -0.28), (x0, ys, -0.28)], (0, 1, 0))
        K.oface(hb, STONE, [(x0, yw, 0), (x1, yw, 0), (x1, yw, -0.28), (x0, yw, -0.28)], (0, -1, 0))
        if inner:
            continue
        for i in range(n + 1):
            x = x0 + i * bw
            w = 0.42
            d0, d1 = 0.3, 1.4
            pts_bot = [(x - w / 2, y0, 0), (x + w / 2, y0, 0), (x + w / 2, y0, d0), (x - w / 2, y0, d0)]
            pts_top = [(x - w / 2, y0 + FLH, 0), (x + w / 2, y0 + FLH, 0), (x + w / 2, y0 + FLH, d1), (x - w / 2, y0 + FLH, d1)]
            K.oface(hb, 'std:fin', [pts_bot[3], pts_bot[2], pts_top[2], pts_top[3]], (0, -0.6, 1))   # the sloping front
            K.oface(hb, 'std:fin', [pts_bot[0], pts_bot[3], pts_top[3], pts_top[0]], (-1, 0, 0))
            K.oface(hb, 'std:fin', [pts_bot[2], pts_bot[1], pts_top[1], pts_top[2]], (1, 0, 0))
            K.oface(hb, 'std:fin', pts_top, (0, 1, 0))
            K.oface(hb, 'std:fin', pts_bot, (0, -1, 0))
        # air-conditioning units under some windows
        for i in range(n):
            if rnd.random() < 0.13:
                x = x0 + (i + 0.5) * bw + rnd.uniform(-0.3, 0.3)
                hb.box('std:ac', x, ys - 0.75, 0.16, 0.8, 0.55, 0.3)
                hb.face('std:acGrille', [(x - 0.3, ys - 0.7, 0.32), (x + 0.3, ys - 0.7, 0.32), (x + 0.3, ys - 0.25, 0.32), (x - 0.3, ys - 0.25, 0.32)])
    hb.pop()


def ground_wall(e, x0, x1, recess=0.0, inner=False):
    """Stone ground zone with two rows of recessed windows."""
    Le = x1 - x0
    if Le < 0.3:
        return
    n, bw = bays(Le)
    K.frame(hb, e)
    hb.face(STONE, [(x0, lo, -recess), (x1, lo, -recess), (x1, GZ, -recess), (x0, GZ, -recess)])
    hb.pop()
    K.frame(hb, e)
    for (ya, yb) in ((1.3, 3.6), (4.9, 7.4)):
        for i in range(n):
            if i % 2 == 1 and not inner:
                continue
            cx = x0 + (i + 0.5) * bw
            hb.box('cw:mfaWin', cx, ya, -recess + 0.02, bw * (0.55 if not inner else 0.5), yb - ya, 0.04)
    hb.pop()


# ------------------------------------------------------------------ the outer faces
for e in H.edges(OUT):
    fin_storeys(e, 0.0, e['L'])
    a, b = OPEN.get(e['i'], (None, None))
    if e['i'] == SWE['i']:
        # entrance part: the lobby wall set back under the main body; pilotis part open
        ground_wall(e, 0.0, 1.6)
        K.frame(hb, e)
        R = 3.0
        hb.face('cw:mfaLobby', [(1.6, 0.0, -R), (XP, 0.0, -R), (XP, GZ, -R), (1.6, GZ, -R)])
        K.oface(hb, 'std:soffit', [(1.6, GZ, -R), (XP, GZ, -R), (XP, GZ, 0), (1.6, GZ, 0)], (0, -1, 0))
        K.oface(hb, STONE, [(1.6, 0, 0), (1.6, 0, -R), (1.6, GZ, -R), (1.6, GZ, 0)], (1, 0, 0))
        # rough stone panels beside the doors, the black entrance door in a stone frame
        mid = (XE0 + XE1) / 2
        for (xa, xb) in ((mid - 12.0, mid - 3.2), (mid + 3.2, mid + 9.0)):
            hb.face('lf:ashlar:#b8ad98', [(xa, 0.0, -R + 0.04), (xb, 0.0, -R + 0.04), (xb, 4.2, -R + 0.04), (xa, 4.2, -R + 0.04)])
        hb.box(STONE, mid, 0.0, -R + 0.25, 6.0, 4.4, 0.5)
        hb.face('std:door', [(mid - 2.4, 0.0, -R + 0.52), (mid + 2.4, 0.0, -R + 0.52), (mid + 2.4, 3.7, -R + 0.52), (mid - 2.4, 3.7, -R + 0.52)])
        for dx in (-1.2, 0.0, 1.2):
            hb.box('std:steel', mid + dx, 1.0, -R + 0.56, 0.04, 1.4, 0.04)
        # lobby lights behind the glass
        for i in range(int((XP - 2) / 4)):
            hb.face('glow:shopLight', [(2 + i * 4, GZ - 0.05, -R - 1.0), (3.2 + i * 4, GZ - 0.05, -R - 1.0), (3.2 + i * 4, GZ - 0.05, -R - 4.0), (2 + i * 4, GZ - 0.05, -R - 4.0)][::-1])
        hb.pop()
        # the canopy block: fascia with the lettering and the arms, columns, lit soffit, flower boxes on top
        K.frame(hb, e)
        D, Y0 = 6.8, 4.4
        hb.box(STONE, (XE0 + XE1) / 2, Y0, D / 2, XE1 - XE0, GZ - Y0, D, top=True, bottom=False)
        K.oface(hb, 'std:soffit', [(XE0, Y0, 0), (XE1, Y0, 0), (XE1, Y0, D), (XE0, Y0, D)], (0, -1, 0))
        hb.face('std:dark', [(XE0 + 6, Y0 - 0.01, D * 0.35), (XE1 - 6, Y0 - 0.01, D * 0.35), (XE1 - 6, Y0 - 0.01, D * 0.62), (XE0 + 6, Y0 - 0.01, D * 0.62)][::-1])
        for cx in (XE0 + (XE1 - XE0) * 0.30, XE0 + (XE1 - XE0) * 0.78):
            hb.box(STONE, cx, 0.0, D - 1.2, 1.15, Y0, 1.15, top=False)
        for i in range(int((XE1 - XE0) / 3.2)):
            hb.box('std:dark', XE0 + 1.6 + i * 3.2, Y0 - 0.02, D * 0.2, 0.6, 0.02, 0.6)
        cx = (XE0 + XE1) / 2 + 1.0
        K.text3d(hb, 'std:letter', 'МИНИСТЕРСТВО НА ВЪНШНИТЕ РАБОТИ', cx, 6.05, D, 0.66, 0.08, width=XE1 - XE0 - 7.0)
        K.text3d(hb, 'std:letter', 'MINISTRY OF FOREIGN AFFAIRS · MINISTÈRE DES AFFAIRES ÉTRANGÈRES', cx, 5.25, D, 0.34, 0.06, font='sansR', width=XE1 - XE0 - 7.0)
        K.sface(hb, 'sign:mfaArms', [(cx - 0.7, 7.0, D + 0.04), (cx + 0.7, 7.0, D + 0.04), (cx + 0.7, 8.25, D + 0.04), (cx - 0.7, 8.25, D + 0.04)], (0, 0, 1))
        # flower boxes along the top edge (pink and red petunias)
        x = XE0 + 1.0
        while x < XE1 - 1.0:
            hb.box('std:pot', x + 0.9, GZ, D - 0.45, 1.8, 0.45, 0.55)
            for f in range(5):
                hb.sphere('std:flowerPink' if (int(x) + f) % 3 else 'std:flowerRed', (x + 0.25 + f * 0.33, GZ + 0.55, D - 0.45 + rnd.uniform(-0.12, 0.12)), 0.28, segs=7, rings=4)
            x += 2.6
        hb.pop()
    if a is not None:
        # pilotis: square pillars on the face line and at the courtyard side, the soffit of the wing above
        K.frame(hb, e)
        n, bw = bays(e['L'])
        i0 = int(math.ceil(a / bw)); i1 = int(b / bw)
        for i in range(i0, i1 + 1, 3):
            hb.box(STONE, i * bw - (0.7 if i * bw > e['L'] - 0.5 else 0), 0.0, -0.7, 1.3, GZ, 1.3, top=False)
            hb.box(STONE, i * bw - (0.7 if i * bw > e['L'] - 0.5 else 0), 0.0, -13.6, 1.3, GZ, 1.3, top=False)
        K.oface(hb, 'std:soffit', [(a, GZ, 0), (b, GZ, 0), (b, GZ, -14.6), (a, GZ, -14.6)], (0, -1, 0))
        hb.face(STONE, [(a, lo, 0), (b, lo, 0), (b, 0.0, 0), (a, 0.0, 0)])
        hb.pop()
        if e['i'] != SWE['i']:
            ground_wall(e, 0.0, a)
            ground_wall(e, b, e['L'])
    elif e['i'] != SWE['i']:
        ground_wall(e, 0.0, e['L'])

# ------------------------------------------------------------------ the courtyard
def open_span(e):
    """The span (local x of courtyard edge e) under a pilotis wing: the outer edge facing the other way."""
    oe = min(H.edges(OUT), key=lambda o: o['n'][0] * e['n'][0] + o['n'][1] * e['n'][1])
    if oe['i'] not in OPEN:
        return None
    a, b = OPEN[oe['i']]
    ta, oa = np.array(oe['t']), np.array(oe['a'])
    pa, th = np.array(e['a']), np.array(e['t'])
    s0 = float(np.dot(pa - oa, ta)); k = float(np.dot(th, ta))
    xa, xb = sorted(((a - s0) / k, (b - s0) / k))
    return max(0.0, xa), min(e['L'], xb)


for e in H.edges(HOLE[::-1]):
    fin_storeys(e, 0.0, e['L'], inner=True)
    sp = open_span(e)
    if sp:
        ground_wall(e, 0.0, sp[0], inner=True)
        ground_wall(e, sp[1], e['L'], inner=True)
    else:
        ground_wall(e, 0.0, e['L'], inner=True)

# ------------------------------------------------------------------ cornice, attic and roof
CO = H.offset(OUT, CORN_OUT)
hb.ring(STONE, CO, MB, MB + CORN)
# underside of the projection (ring between the face line and the cornice line), facing down
for i in range(len(OUT)):
    j = (i + 1) % len(OUT)
    K.oface(hb, 'std:soffit', [(OUT[i][0], MB, OUT[i][1]), (OUT[j][0], MB, OUT[j][1]), (CO[j][0], MB, CO[j][1]), (CO[i][0], MB, CO[i][1])], (0, -1, 0))
for e in H.edges(HOLE[::-1]):
    hb.wall(STONE, e['a'], e['b'], MB, MB + CORN)
hb.cap('std:roof', CO, MB + CORN, holes=[HOLE])
AT = H.offset(OUT, -ATT_IN)
AH = H.offset(HOLE[::-1], -ATT_IN)
AH = H.orient(AH)
hb.ring(STONE, AT, MB + CORN, MB + CORN + ATT)
for e in H.edges(AT):
    K.frame(hb, e)
    n, bw = bays(e['L'])
    for i in range(n):
        if i % 2 == 0:
            hb.box('cw:mfaWin', (i + 0.5) * bw, MB + CORN + 0.8, 0.02, 1.4, 1.2, 0.04)
    hb.pop()
for e in H.edges(AH[::-1]):
    hb.wall(STONE, e['a'], e['b'], MB + CORN, MB + CORN + ATT)
hb.cap('std:roof', AT, MB + CORN + ATT, holes=[AH])
K.parapet(hb, AT, MB + CORN + ATT, 0.3, STONE, w=0.3)
K.roof_plant(hb, AT, MB + CORN + ATT, 6, 18, inset=1.0, maxw=4.0)
# the radio mast and the satellite dish on the roof (photo 7)
c = np.array([AX, AZ])
corner = np.array(SWE['b']) - np.array(SWE['n']) * 6 - np.array(SWE['t']) * 5
hb.tube('std:steel', (corner[0], MB + CORN + ATT, corner[1]), (corner[0], MB + CORN + ATT + 6.0, corner[1]), 0.08, segs=6)
for k in range(3):
    hb.tube('std:steel', (corner[0] - 0.8, MB + CORN + ATT + 3 + k, corner[1]), (corner[0] + 0.8, MB + CORN + ATT + 3 + k, corner[1]), 0.04, segs=4)
hb.cyl('std:ac', corner[0] + 3, MB + CORN + ATT + 0.5, corner[1] - 2, 0.6, 0.15, segs=12)

# ------------------------------------------------------------------ the plaza in front
_a, _t, _n = np.array(SWE['a']), np.array(SWE['t']), np.array(SWE['n'])


def gl(x, z):
    """Ground (relative to the datum) under the front frame's local point (x, z)."""
    p = _a + _t * x + _n * z
    return pk.y(float(p[0]), float(p[1])) - DATUM


K.frame(hb, SWE)
PD = 24.0
pl = [(-4.0, 0.0), (L + 4.0, 0.0), (L + 4.0, PD), (-4.0, PD)]
# slab down to the ground (its edge reads as the plinth of the steps)
hb.box('pn:mfaPaving', L / 2, lo, PD / 2, L + 8.0, -lo + 0.05, PD, top=False)
K.oface(hb, 'pn:mfaPaving', [(p[0], 0.05, p[1]) for p in pl], (0, 1, 0), uv=[(p[0], p[1]) for p in pl])
# dark granite bands in a large grid
for k in range(0, 9):
    x = -4.0 + k * (L + 8.0) / 8
    hb.face('std:dark', [(x - 0.25, 0.06, 0.0), (x + 0.25, 0.06, 0.0), (x + 0.25, 0.06, PD), (x - 0.25, 0.06, PD)][::-1])
for zz in (6.0, 12.0, 18.0):
    hb.face('std:dark', [(-4.0, 0.06, zz - 0.25), (L + 4.0, 0.06, zz - 0.25), (L + 4.0, 0.06, zz + 0.25), (-4.0, 0.06, zz + 0.25)][::-1])
# broad steps down from the plaza to the lawn
for k in range(5):
    hb.box(STONE, L * 0.35, -0.16 * (k + 1), PD + 0.45 * k + 0.22, L * 0.62, 0.16 + 0.0, 0.45)
# flower pots along the front
for x in list(np.linspace(XE0 + 1, XE1 - 1, 9)) + list(np.linspace(XP + 2, L - 2, 7)):
    zz = 7.4 if x < XE1 else 1.2
    hb.cyl('std:pot', x, 0.05, zz, 0.36, 0.5, segs=10)
    for f in range(4):
        hb.sphere('std:flowerRed' if f % 2 else 'std:flowerPink', (x + math.cos(f * 1.6) * 0.2, 0.75, zz + math.sin(f * 1.6) * 0.2), 0.22, segs=6, rings=4)
# the low white balustrade on the right of the plaza
for zz in np.arange(2.0, PD, 2.4):
    hb.box(STONE, L + 3.2, 0.05, zz, 0.35, 0.95, 0.35)
hb.box(STONE, L + 3.2, 0.95, PD / 2 + 1.0, 0.45, 0.18, PD - 2.0)
# flagpoles at the front edge: NATO, Bulgaria, the EU
for x, flag in ((L * 0.20, 'sign:flagNATO'), (L * 0.42, 'sign:flagBG'), (L * 0.64, 'sign:flagEU')):
    hb.push(x, gl(x, PD + 3.5) - 0.1, PD + 3.5, 0)
    hb.box(STONE, 0, 0, 0, 0.9, 0.35, 0.9)
    K.flagpole(hb, 0, 0, 14.0, flag)
    hb.pop()
# the bronze bull on its plinth on the lawn, boulders
hb.push(L * 0.86, gl(L * 0.86, PD + 16.0) - 0.1, PD + 16.0, 0.35)
hb.box(STONE, 0, 0, 0, 4.2, 0.35, 2.0)
hb.push(0, 0.35, 0, 0)
BR = 'std:bronzeGreen'


def ellipsoid(mat, c, r, segs=12, rings=8):
    """Ellipsoid with radii r = (rx, ry, rz) in the current frame."""
    idx = []
    for i in range(rings + 1):
        ph = math.pi * i / rings
        idx.append([hb.vtx((c[0] + r[0] * math.sin(ph) * math.cos(2 * math.pi * k / segs), c[1] + r[1] * math.cos(ph),
                            c[2] - r[2] * math.sin(ph) * math.sin(2 * math.pi * k / segs))) for k in range(segs)])
    for i in range(rings):
        for k in range(segs):
            j = (k + 1) % segs
            hb.F.append(([idx[i][k], idx[i + 1][k], idx[i + 1][j], idx[i][j]], mat, True, None))


# a lean, muscular bull with a heavy hump, the head lowered (free rendering of the sculpture on the lawn)
ellipsoid(BR, (0.0, 1.42, 0.0), (1.35, 0.55, 0.46))            # barrel
ellipsoid(BR, (0.78, 1.66, 0.0), (0.72, 0.62, 0.5))            # shoulders and hump
ellipsoid(BR, (-1.12, 1.48, 0.0), (0.55, 0.5, 0.43))           # hindquarters
ellipsoid(BR, (1.55, 1.42, 0.0), (0.5, 0.42, 0.36))            # neck
ellipsoid(BR, (2.05, 1.02, 0.0), (0.4, 0.27, 0.22))            # head, lowered
ellipsoid(BR, (2.38, 0.9, 0.0), (0.18, 0.15, 0.17))            # muzzle
for sz in (-1, 1):
    hb.tube(BR, (1.95, 1.2, sz * 0.18), (2.1, 1.38, sz * 0.55), 0.07, segs=6)   # horns: out, then forward and up
    hb.tube(BR, (2.1, 1.38, sz * 0.55), (2.35, 1.62, sz * 0.5), 0.05, segs=6)
    hb.tube(BR, (1.8, 1.18, sz * 0.2), (1.78, 1.24, sz * 0.36), 0.06, segs=5)   # ears
    for lx, kx, fx, rr in ((0.8, 0.86, 0.95, 0.15), (-1.15, -1.3, -1.2, 0.14)):
        hb.tube(BR, (lx, 1.15, sz * 0.3), (kx, 0.55, sz * 0.32), rr, segs=7)       # upper leg
        hb.tube(BR, (kx, 0.55, sz * 0.32), (fx, 0.08, sz * 0.33), rr * 0.7, segs=7)  # lower leg
        hb.box('std:bronze', fx, 0.0, sz * 0.33, 0.24, 0.1, 0.2)                   # hoof
hb.tube(BR, (-1.7, 1.7, 0.0), (-2.05, 0.7, 0.1), 0.06, segs=5)   # tail
hb.pop()
hb.pop()
for (x, zz, r) in ((L * 0.30, PD + 12.0, 0.7), (L * 0.55, PD + 9.0, 0.5), (L * 1.02, PD + 7.0, 0.8)):
    hb.sphere('std:rock', (x, gl(x, zz) - r * 0.35, zz), r, segs=7, rings=5)
hb.pop()

# ------------------------------------------------------------------ build, bake, export
ob = hb.build()
if '--nobake' not in sys.argv:
    H.add_ground(pk, hb, margin=25, step=4.0)
    H.lightmap_uv(ob)
    ao = H.bake_ao(ob, H.arg('--size', 2048, int), 4.0, H.arg('--samples', 48, int))
    H.save_ao(ao, NAME)
    H.export(ob, NAME, {'anchor': [round(AX, 2), round(AZ, 2)], 'base': DATUM, 'source': 'tools/blender/hero/mfa.py'})
if '--preview' in sys.argv:
    SP = os.environ.get('PREVIEW_DIR', '/tmp')
    if '--nobake' in sys.argv:
        H.add_ground(pk, hb, margin=60, step=4.0)
    rel = lambda x, y, z: (x - AX, y, z - AZ)
    a = np.array(SWE['a']); t = np.array(SWE['t']); nn = np.array(SWE['n'])
    p7 = a + t * (L * 0.95) + nn * 52       # photo 7: from the lawn behind the bull
    q7 = a + t * L * 0.45
    H.preview(f'{SP}/mfa_front.jpg', rel(p7[0], 1.8, p7[1]), rel(q7[0], 9, q7[1]), lens=20)
    p8 = a + t * (L * 0.18) + nn * 30       # photo 8: the canopy from the plaza
    q8 = a + t * (L * 0.55)
    H.preview(f'{SP}/mfa_canopy.jpg', rel(p8[0], 1.6, p8[1]), rel(q8[0], 9, q8[1]), lens=18)
    p9 = a - t * 18 + nn * 40
    H.preview(f'{SP}/mfa_corner.jpg', rel(p9[0], 2.0, p9[1]), rel(a[0] + t[0] * 25, 10, a[1] + t[1] * 25), lens=22)
