# Българска академия на науките, ул. „15-ти ноември“ 1 (the Academy's main building, Nikola Lazarov, 1920s), near
# the start of bus line 84 (stops 1903 / 1700). On its OSM outlines (world84 #1689 the central block, #1691 and
# #1692 the two wings with their round corner towers).
# Appearance from the photographs supplied by the user (the main front, the corner tower, the aerial view):
#   * pale ochre plaster with white stucco trim: a rusticated ground floor with keyed rectangular windows, a white
#     belt course, tall round-arched windows with balustrade panels on the first floor, a cornice with dentils;
#   * the central block: a three-storey frontispiece with four giant white pilasters (Corinthian capitals), a
#     pediment with the arms in relief, a portico of four white columns carrying a balcony with a balustrade,
#     three wooden doors under round windows, the name БЪЛГАРСКА АКАДЕМИЯ НА НАУКИТЕ on the entablature and two
#     flags on the balcony;
#   * the two round corner towers: balconies with balustrades, arched windows between pilasters, a white drum with
#     round windows, a dark slate bell dome and a crown-like railing on top (a flagpole on one);
#   * red-brown hipped roofs with skylights and brick chimneys.
# Storey heights, bay widths and the dome profile are estimated from the photographs.
#   blenv/bin/python tools/blender/hero/bas.py [--preview] [--samples 48] [--size 2048] [--nobake]
import math
import os
import random
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import herolib as H
import herokit as K
from shapely.geometry import Polygon, Point, MultiPoint, LineString
from shapely.ops import triangulate, unary_union

NAME = 'bas'
pk = H.Pack('84')
H.reset()
BC = pk.building(-1629.0, -2840.6, 2)   # central block
BN = pk.building(-1633.3, -2866.4, 2)   # north wing with the north-east tower
BS = pk.building(-1648.1, -2816.7, 2)   # south wing with the south-east tower
DATUM = 35.3
AX, AZ = -1638.0, -2842.0
hb = H.HB(NAME, (AX, AZ), DATUM)
rnd = random.Random(1869)

WALL, RUST, TRIM = 'lf:plaster:#f1dc9c', 'lf:rustic:#e8cf8e', 'lf:trim:#f4efe2'
hb.mat(WALL, (0.80, 0.62, 0.30), 0.85)
hb.mat(RUST, (0.74, 0.57, 0.28), 0.85)
hb.mat(TRIM, (0.88, 0.85, 0.78), 0.6)
hb.mat('std:win', (0.06, 0.07, 0.08), 0.15, 0.4)
hb.mat('std:winFrame', (0.93, 0.93, 0.91), 0.5)
hb.mat('std:door', (0.30, 0.18, 0.09), 0.55)
hb.mat('std:roofTile', (0.20, 0.07, 0.045), 0.8)
hb.mat('std:slate', (0.10, 0.11, 0.12), 0.45, 0.4)
hb.mat('std:brick', (0.42, 0.18, 0.12), 0.9)
hb.mat('std:metal', (0.18, 0.18, 0.19), 0.5, 0.6)
hb.mat('std:skylight', (0.25, 0.35, 0.42), 0.15, 0.4)
hb.mat('std:steel', (0.62, 0.64, 0.66), 0.35, 0.8)
hb.mat('std:plinth', (0.45, 0.43, 0.40), 0.85)
hb.mat('std:letter', (0.35, 0.30, 0.25), 0.5, 0.3)
hb.mat('std:ac', (0.88, 0.89, 0.89), 0.5)
hb.mat('sign:basRelief', (0.9, 0.85, 0.7), 0.6)
hb.mat('sign:flagBG', (0.9, 0.9, 0.9), 0.8)
hb.mat('sign:flagEU', (0.1, 0.2, 0.6), 0.8)
hb.mat('glow:shopLight', (0.95, 0.95, 0.9), 0.4, emit=(1, 0.95, 0.85))

G0, G1, F1, F2, CORN = 0.0, 5.2, 11.0, 15.6, 1.3     # ground floor, first floor top, second floor top (centre), cornice
WING_EAVE = F1 + CORN
lo = min(min(pk.y(x, z) for x, z in b['pts']) for b in (BC, BN, BS)) - DATUM - 0.6


def oface(mat, pts, out, uv=None):
    K.oface(hb, mat, pts, out, uv=uv)


# ------------------------------------------------------------------ details (in an edge frame: x along, y up, z out)
def arch_window(x, y0, w, h, f=0.2, d=0.14, key=True, n=10):
    """Round-arched window: dark glazing set back, a white moulded surround standing proud, a keystone."""
    r = w / 2
    ys = y0 + h - r
    pts = [(x - r, y0, 0.02), (x + r, y0, 0.02)] + [(x + r * math.cos(math.pi * k / n), ys + r * math.sin(math.pi * k / n), 0.02) for k in range(n + 1)]
    oface('std:win', pts, (0, 0, 1))
    # glazing bars (white): a mullion and a transom at the springing
    hb.box('std:winFrame', x, y0, 0.03, 0.06, h - 0.05, 0.04)
    hb.box('std:winFrame', x, ys - 0.03, 0.03, w, 0.06, 0.04)
    for side in (-1, 1):
        xa, xb = (x - r - f, x - r) if side < 0 else (x + r, x + r + f)
        oface(TRIM, [(xa, y0, d), (xb, y0, d), (xb, ys, d), (xa, ys, d)], (0, 0, 1))
        xo = xa if side < 0 else xb
        oface(TRIM, [(xo, y0, 0), (xo, ys, 0), (xo, ys, d), (xo, y0, d)], (side, 0, 0))
        xi = xb if side < 0 else xa
        oface(TRIM, [(xi, y0, 0.02), (xi, ys, 0.02), (xi, ys, d), (xi, y0, d)], (-side, 0, 0))
    for k in range(n):
        t0, t1 = math.pi * k / n, math.pi * (k + 1) / n
        pi0 = (x + r * math.cos(t0), ys + r * math.sin(t0)); pi1 = (x + r * math.cos(t1), ys + r * math.sin(t1))
        po0 = (x + (r + f) * math.cos(t0), ys + (r + f) * math.sin(t0)); po1 = (x + (r + f) * math.cos(t1), ys + (r + f) * math.sin(t1))
        oface(TRIM, [(pi0[0], pi0[1], d), (po0[0], po0[1], d), (po1[0], po1[1], d), (pi1[0], pi1[1], d)], (0, 0, 1))
        tm = (t0 + t1) / 2
        oface(TRIM, [(po0[0], po0[1], 0), (po1[0], po1[1], 0), (po1[0], po1[1], d), (po0[0], po0[1], d)], (math.cos(tm), math.sin(tm), 0))
        oface(TRIM, [(pi0[0], pi0[1], 0.02), (pi1[0], pi1[1], 0.02), (pi1[0], pi1[1], d), (pi0[0], pi0[1], d)], (-math.cos(tm), -math.sin(tm), 0))
    if key:
        hb.box(TRIM, x, ys + r - 0.05, d / 2, 0.36, 0.55, d + 0.06)
    hb.box(TRIM, x, y0 - 0.14, 0.09, w + 2 * f + 0.25, 0.14, 0.3)


def rect_window(x, y0, w, h, f=0.16, d=0.12, key=False, pedim=False):
    """Rectangular window with a white surround, an optional keystone or a small cornice hood over it."""
    oface('std:win', [(x - w / 2, y0, 0.02), (x + w / 2, y0, 0.02), (x + w / 2, y0 + h, 0.02), (x - w / 2, y0 + h, 0.02)], (0, 0, 1))
    hb.box('std:winFrame', x, y0, 0.03, 0.06, h, 0.04)
    hb.box('std:winFrame', x, y0 + h * 0.68, 0.03, w, 0.06, 0.04)
    for (xa, xb) in ((x - w / 2 - f, x - w / 2), (x + w / 2, x + w / 2 + f)):
        hb.box(TRIM, (xa + xb) / 2, y0, d / 2 - 0.09, xb - xa, h, d + 0.18, top=False)
    hb.box(TRIM, x, y0 + h, d / 2 - 0.09, w + 2 * f, f, d + 0.18)
    hb.box(TRIM, x, y0 - 0.14, 0.08, w + 2 * f + 0.2, 0.14, 0.28)
    if key:
        hb.box(TRIM, x, y0 + h - 0.05, 0.1, 0.34, 0.6, 0.24)
    if pedim:
        hb.box(TRIM, x, y0 + h + f, 0.14, w + 2 * f + 0.4, 0.16, 0.34)


def balustrade(x0, x1, y, h=0.9, z=0.18, n=None, mat=TRIM):
    """Rail, base and turned balusters between x0 and x1 at height y (frame), standing z out."""
    L = x1 - x0
    hb.box(mat, (x0 + x1) / 2, y, z, L, 0.12, 0.34)
    hb.box(mat, (x0 + x1) / 2, y + h - 0.12, z, L + 0.1, 0.12, 0.38)
    n = n or max(2, int(L / 0.26))
    for k in range(n):
        bx = x0 + (k + 0.5) * L / n
        hb.cyl(mat, bx, y + 0.12, z, 0.06, (h - 0.24) * 0.45, segs=6, r1=0.1, top=False)
        hb.cyl(mat, bx, y + 0.12 + (h - 0.24) * 0.45, z, 0.1, (h - 0.24) * 0.55, segs=6, r1=0.055, top=False)


def pilaster(x, y0, y1, w=0.9, d=0.2, cap=True):
    hb.box(TRIM, x, y0, d / 2, w, y1 - y0, d, top=False)
    hb.box(TRIM, x, y0 - 0.3, d / 2 + 0.03, w + 0.2, 0.3, d + 0.1)      # base
    if cap:
        # Corinthian capital: a flaring block with volutes suggested by two rolls
        hb.box(TRIM, x, y1 - 0.75, d / 2 + 0.04, w + 0.06, 0.55, d + 0.12)
        hb.box(TRIM, x, y1 - 0.2, d / 2 + 0.08, w + 0.42, 0.2, d + 0.22)
        for sx in (-1, 1):
            hb.tube(TRIM, (x + sx * (w / 2 + 0.05), y1 - 0.35, 0.02), (x + sx * (w / 2 + 0.05), y1 - 0.35, d + 0.2), 0.12, segs=6)


CORNICE = [(-0.05, 0.0), (0.12, 0.0), (0.12, 0.25), (0.28, 0.35), (0.28, 0.6), (0.55, 0.75), (0.75, 1.0), (0.75, CORN), (-0.05, CORN)]


def cornice(e, y, s0=0.0, s1=None, dentils=True):
    s1 = e['L'] if s1 is None else s1
    K.frame(hb, e)
    hb.sweep(TRIM, [(s0, y, 0.0), (s1, y, 0.0)], CORNICE)
    if dentils:
        k = s0 + 0.2
        while k < s1 - 0.2:
            hb.box(TRIM, k, y + 0.38, 0.38, 0.14, 0.2, 0.18)
            k += 0.36
    hb.pop()


# ------------------------------------------------------------------ the outlines: wings without their towers
def tower_of(b, idx):
    pts = np.array([b['pts'][i] for i in idx])
    c = pts.mean(axis=0)
    r = float(np.mean(np.hypot(pts[:, 0] - c[0], pts[:, 1] - c[1])))
    return c, r


TN = tower_of(BN, range(1, 10))
TS = tower_of(BS, range(5, 14))
TR = 4.6
CPOL = Polygon(BC['pts'])
NPOL = Polygon(BN['pts'], BN['holes']).buffer(0).difference(Point(*TN[0]).buffer(TR - 0.3, 24))
SPOL = Polygon(BS['pts']).buffer(0).difference(Point(*TS[0]).buffer(TR - 0.3, 24))
ROADS = [LineString(r['pts']) for r in pk.roads if r['cls'] not in ('footway', 'steps', 'path') and len(r['pts']) > 1]
ALL = unary_union([CPOL, NPOL, SPOL]).buffer(0.2)


def street_side(e, d=7.0):
    """Edge faces a street: the outside point d metres out is not inside the complex and a road is near."""
    m = Point(e['a'][0] + e['t'][0] * e['L'] / 2 + e['n'][0] * d, e['a'][1] + e['t'][1] * e['L'] / 2 + e['n'][1] * d)
    if ALL.contains(m):
        return False
    return min(r.distance(m) for r in ROADS) < 14.0


def wing_facade(e, front):
    L = e['L']
    K.frame(hb, e)
    hb.face(RUST, [(0, lo, 0), (L, lo, 0), (L, G1, 0), (0, G1, 0)])
    hb.face(WALL, [(0, G1, 0), (L, G1, 0), (L, F1, 0), (0, F1, 0)])
    hb.box(TRIM, L / 2, G1 - 0.2, 0.09, L, 0.42, 0.18)   # belt course
    hb.box('std:plinth', L / 2, lo, 0.06, L, -lo + 0.55, 0.12)
    if front and L > 3.2:
        n = max(1, round(L / 4.4))
        bw = L / n
        for i in range(n):
            x = (i + 0.5) * bw
            rect_window(x, 1.5, 1.35, 2.5, key=True)
            if lo < -0.3:
                hb.box('std:win', x, 0.2, -0.05, 0.9, 0.5, 0.06)   # basement light
            balustrade(x - 1.0, x + 1.0, G1 + 0.35, h=0.95, z=0.1)
            arch_window(x, G1 + 1.45, 1.55, 3.45)
            if rnd.random() < 0.12:
                hb.box('std:ac', x + 0.2, G1 + 1.6, 0.35, 0.8, 0.55, 0.32)
    elif L > 3.0:
        n = max(1, round(L / 4.0))
        bw = L / n
        for i in range(n):
            x = (i + 0.5) * bw
            rect_window(x, 1.5, 1.2, 2.3)
            rect_window(x, G1 + 1.4, 1.25, 2.7)
    hb.pop()
    cornice(e, F1, dentils=front)


for P in (NPOL, SPOL):
    for g in getattr(P, 'geoms', [P]):
        if g.area < 30:
            continue
        ext = H.orient(H.simplify(list(g.exterior.coords)[:-1], 0.25))
        for e in H.edges(ext):
            if CPOL.buffer(0.6).contains(Point(e['a'][0] + e['t'][0] * e['L'] / 2 + e['n'][0] * 0.4, e['a'][1] + e['t'][1] * e['L'] / 2 + e['n'][1] * 0.4)):
                continue
            wing_facade(e, street_side(e))
        for h in g.interiors:
            hh = H.orient(H.simplify(list(h.coords)[:-1], 0.25))[::-1]
            for e in H.edges(hh):
                wing_facade(e, False)


# ------------------------------------------------------------------ hipped roofs from the distance field
def hip_roof(poly, y0, pitch=math.radians(38), hmax=5.6, step=1.1, over=0.45):
    """A hipped roof over any outline: heights from the distance to the eaves (a straight-skeleton approximation)
    on a Delaunay mesh of boundary and interior points; skylights and chimneys added by the caller."""
    P = poly.buffer(over, join_style=2, mitre_limit=1.6)
    pts = []
    for ring in [P.exterior] + list(P.interiors):
        L = ring.length
        for k in range(int(L / 0.9) + 1):
            q = ring.interpolate(k * 0.9)
            pts.append((q.x, q.y))
    x0, z0, x1, z1 = P.bounds
    for x in np.arange(x0, x1, step):
        for z in np.arange(z0, z1, step):
            q = Point(x + (0.5 * step if int(z / step) % 2 else 0), z)
            if P.contains(q) and P.exterior.distance(q) > 0.4 and all(i.distance(q) > 0.4 for i in P.interiors):
                pts.append((q.x, q.y))
    bd = P.boundary
    hgt = lambda x, z: min(bd.distance(Point(x, z)) * math.tan(pitch), hmax)
    for tri in triangulate(MultiPoint(pts)):
        c = tri.centroid
        if not P.buffer(-0.05).contains(c):
            continue
        cs = list(tri.exterior.coords)[:3]
        oface('std:roofTile', [(x, y0 + hgt(x, z), z) for x, z in cs], (0, 1, 0))
    # eaves soffit and gutter
    for ring in [P.exterior]:
        cs = list(ring.coords)
        for i in range(len(cs) - 1):
            a, b = cs[i], cs[i + 1]
            hb.beam('std:metal', (a[0], y0 + 0.05, a[1]), (b[0], y0 + 0.05, b[1]), 0.14, 0.14)
    return hgt


ROOF_PITCH = math.radians(38)
for P in (NPOL, SPOL):
    for g in getattr(P, 'geoms', [P]):
        if g.area < 30:
            continue
        hgt = hip_roof(g, WING_EAVE)
        hb.cap('std:plinth', H.orient(list(g.exterior.coords)[:-1]), WING_EAVE - 0.02, holes=[list(h.coords)[:-1] for h in g.interiors])
        # skylights along the street slopes, chimneys
        ext = H.orient(H.simplify(list(g.exterior.coords)[:-1], 0.25))
        for e in H.edges(ext):
            if not street_side(e) or e['L'] < 6:
                continue
            k = 3.0
            while k < e['L'] - 2.5:
                d_in = 2.6
                x = e['a'][0] + e['t'][0] * k - e['n'][0] * d_in
                z = e['a'][1] + e['t'][1] * k - e['n'][1] * d_in
                y = WING_EAVE + hgt(x, z)
                if min(math.hypot(x - TN[0][0], z - TN[0][1]), math.hypot(x - TS[0][0], z - TS[0][1])) < 8.0:
                    k += 4.4
                    continue
                K.frame(hb, e, y=0, s=k, out=-d_in)
                s_ = math.sin(ROOF_PITCH); c_ = math.cos(ROOF_PITCH)
                corners = [(-0.45, -0.6), (0.45, -0.6), (0.45, 0.6), (-0.45, 0.6)]
                q = [(cx, y + 0.12 + cz * s_, -cz * c_) for cx, cz in corners]
                oface('std:skylight', q, (0, c_, s_))
                hb.pop()
                k += 4.4
        for j in range(2):
            c = g.representative_point()
            cx, cz = c.x + rnd.uniform(-4, 4), c.y + rnd.uniform(-4, 4)
            if g.contains(Point(cx, cz)):
                hb.box('std:brick', cx, WING_EAVE + hgt(cx, cz) - 1.0, cz, 1.0, 2.8 + j * 1.2, 0.7)
                hb.box(TRIM, cx, WING_EAVE + hgt(cx, cz) + 1.8 + j * 1.2, cz, 1.2, 0.15, 0.9)
# the tall brick chimney stack seen over the north wing (photo 11)
cpt = NPOL.representative_point()
hb.box('std:brick', cpt.x - 3.0, WING_EAVE + 2.0, cpt.y + 2.0, 2.2, 6.4, 1.6)
hb.box(TRIM, cpt.x - 3.0, WING_EAVE + 8.4, cpt.y + 2.0, 2.5, 0.2, 1.9)

# ------------------------------------------------------------------ the central block: frontispiece, portico, pediment
CB = H.orient(H.simplify(BC['pts'], 0.2))
ce = H.edges(CB)
FRONT = max(ce, key=lambda e: e['n'][0])            # faces east, onto ул. 15-ти ноември
TOPC = F2 + CORN
for e in ce:
    if e is FRONT:
        continue
    mid = Point(e['a'][0] + e['t'][0] * e['L'] / 2 + e['n'][0] * 0.5, e['a'][1] + e['t'][1] * e['L'] / 2 + e['n'][1] * 0.5)
    hidden = unary_union([NPOL, SPOL]).buffer(0.4).contains(mid)
    K.frame(hb, e)
    if hidden:
        hb.face(WALL, [(0, WING_EAVE, 0), (e['L'], WING_EAVE, 0), (e['L'], TOPC, 0), (0, TOPC, 0)])
    else:
        hb.face(RUST, [(0, lo, 0), (e['L'], lo, 0), (e['L'], G1, 0), (0, G1, 0)])
        hb.face(WALL, [(0, G1, 0), (e['L'], G1, 0), (e['L'], TOPC, 0), (0, TOPC, 0)])
        for i in range(max(1, round(e['L'] / 4.4))):
            x = (i + 0.5) * e['L'] / max(1, round(e['L'] / 4.4))
            rect_window(x, G1 + 1.4, 1.25, 2.9)
            rect_window(x, F1 + 0.9, 1.15, 2.2)
    hb.pop()
    if not hidden:
        cornice(e, F2)
L = FRONT['L']
K.frame(hb, FRONT)
hb.face(RUST, [(0, lo, 0), (L, lo, 0), (L, G1, 0), (0, G1, 0)])
hb.face(WALL, [(0, G1, 0), (L, G1, 0), (L, F2, 0), (0, F2, 0)])
hb.box(TRIM, L / 2, G1 - 0.2, 0.09, L, 0.42, 0.18)
# four giant pilasters (in pairs at the edges, as on the photograph), the bays between them
px = [1.0, 2.25, L - 2.25, L - 1.0]
for x in px:
    pilaster(x, G1 + 0.3, F2 - 0.05, w=0.95)
for x in (L * 0.32, L * 0.5, L * 0.68):
    arch_window(x, G1 + 1.6, 1.5, 3.4)
    rect_window(x, F1 + 0.9, 1.2, 2.3, pedim=True)
for x in (L * 0.11, L * 0.89):
    rect_window(x, G1 + 1.6, 1.0, 2.7)
    rect_window(x, F1 + 0.9, 0.9, 2.1)
# the portico: four white columns, entablature with the name, balcony with balustrade, three doors under oculi
PD_ = 3.0
for x in (L * 0.28, L * 0.40, L * 0.60, L * 0.72):
    hb.cyl(TRIM, x, 0.0, PD_ - 0.5, 0.42, 4.6, segs=16, r1=0.36, top=False)
    hb.box(TRIM, x, 0.0, PD_ - 0.5, 1.0, 0.35, 1.0)
    hb.box(TRIM, x, 4.55, PD_ - 0.5, 0.95, 0.3, 0.95)
hb.box(TRIM, L / 2, 4.85, PD_ / 2 - 0.15, L * 0.55, 1.1, PD_ + 0.3)
K.text3d(hb, 'std:letter', 'БЪЛГАРСКА АКАДЕМИЯ НА НАУКИТЕ', L / 2, 5.05, PD_ + 0.15, 0.42, 0.05, font='serif', width=L * 0.5)
balustrade(L * 0.23, L * 0.77, 5.95, h=1.0, z=PD_ - 0.1)
for sx in (L * 0.23, L * 0.77):
    hb.box(TRIM, sx, 5.95, PD_ / 2, 0.35, 1.0, PD_ - 0.2)
for x in (L * 0.34, L * 0.5, L * 0.66):
    hb.face('std:door', [(x - 0.85, 0.15, 0.03), (x + 0.85, 0.15, 0.03), (x + 0.85, 3.3, 0.03), (x - 0.85, 3.3, 0.03)])
    hb.box(TRIM, x, 3.3, 0.06, 2.0, 0.2, 0.12)
    ring = [(x + 0.62 * math.cos(2 * math.pi * k / 16), 4.15 + 0.62 * math.sin(2 * math.pi * k / 16), 0.04) for k in range(16)]
    oface('std:win', ring, (0, 0, 1))
    for k in range(16):
        a0, a1 = 2 * math.pi * k / 16, 2 * math.pi * (k + 1) / 16
        oface(TRIM, [(x + 0.62 * math.cos(a0), 4.15 + 0.62 * math.sin(a0), 0.12), (x + 0.82 * math.cos(a0), 4.15 + 0.82 * math.sin(a0), 0.12),
                     (x + 0.82 * math.cos(a1), 4.15 + 0.82 * math.sin(a1), 0.12), (x + 0.62 * math.cos(a1), 4.15 + 0.62 * math.sin(a1), 0.12)], (0, 0, 1))
# steps up to the doors
for k in range(3):
    hb.box('std:plinth', L / 2, lo + 0.0, PD_ + 0.4 - k * 0.35, L * 0.5, -lo + 0.15 - k * 0.15 + 0.15 * 0, 0.4)
# flags on the balcony
for x, flag, lean in ((L * 0.45, 'sign:flagBG', -0.5), (L * 0.55, 'sign:flagEU', 0.5)):
    hb.tube('std:steel', (x, 6.4, PD_ - 0.3), (x + lean, 8.4, PD_ + 0.6), 0.03, segs=5)
    tip = (x + lean, 8.4, PD_ + 0.6)
    oface(flag, [(tip[0] - (0 if lean > 0 else 1.2), tip[1] - 0.8, tip[2]), (tip[0] + (1.2 if lean > 0 else 0), tip[1] - 0.8, tip[2]),
                 (tip[0] + (1.2 if lean > 0 else 0), tip[1], tip[2]), (tip[0] - (0 if lean > 0 else 1.2), tip[1], tip[2])], (0, 0, 1),
          uv=[(0, 0), (100, 0), (100, 100), (0, 100)])
# entablature, cornice and the pediment with the arms
hb.pop()
cornice(FRONT, F2)
K.frame(hb, FRONT)
PH = 5.0
tri = [(-0.4, TOPC, 0.2), (L + 0.4, TOPC, 0.2), (L / 2, TOPC + PH, 0.2)]
oface(WALL, tri, (0, 0, 1))
for (a, b) in ((tri[0], tri[2]), (tri[2], tri[1])):
    hb.beam(TRIM, (a[0], a[1] + 0.25, 0.55), (b[0], b[1] + 0.25, 0.55), 0.7, 0.5)
hb.box(TRIM, L / 2, TOPC - 0.05, 0.45, L + 1.0, 0.4, 0.9)
K.sface(hb, 'sign:basRelief', [(L / 2 - 1.6, TOPC + 0.6, 0.26), (L / 2 + 1.6, TOPC + 0.6, 0.26), (L / 2 + 1.6, TOPC + 3.6, 0.26), (L / 2 - 1.6, TOPC + 3.6, 0.26)], (0, 0, 1))
hb.box(TRIM, L / 2, TOPC + 0.6, 0.3, 2.4, 2.6, 0.25)
hb.pop()
# the gable roof behind the pediment (ridge running back from the front)
ft, fn = np.array(FRONT['t']), np.array(FRONT['n'])
fa = np.array(FRONT['a'])
back = max(ce, key=lambda e: -e['n'][0])
depth = abs(float(np.dot(np.array(back['a']) - fa, fn)))
for side in (0, 1):
    s0, s1 = (0.0, L / 2) if side == 0 else (L / 2, L)
    sa = fa + ft * (-0.4 if side == 0 else L + 0.4); sm = fa + ft * (L / 2)
    y_e, y_r = TOPC, TOPC + PH
    pts = [(sa[0], y_e, sa[1]), (sm[0], y_r, sm[1]), (sm[0] - fn[0] * depth, y_r, sm[1] - fn[1] * depth), (sa[0] - fn[0] * depth, y_e, sa[1] - fn[1] * depth)]
    oface('std:roofTile', pts, (0, 1, 0))
hb.cap('std:plinth', CB, TOPC - 0.01)

# ------------------------------------------------------------------ the two corner towers
def tower(c, r):
    cx, cz = float(c[0]), float(c[1])
    seg = 28
    # walls: rusticated base, plaster above, a white drum with oculi, the slate bell dome, the crown railing
    hb.cyl(RUST, cx, lo, cz, r, G1 - lo, segs=seg, top=False)
    hb.cyl(WALL, cx, G1, cz, r, TOPC - G1, segs=seg, top=False)
    hb.cyl(TRIM, cx, G1 - 0.3, cz, r + 0.12, 0.45, segs=seg)                 # belt
    hb.cyl(TRIM, cx, G1 + 0.15, cz, r + 0.75, 0.22, segs=seg)                # balcony slab
    hb.cyl(TRIM, cx, F1 - 0.1, cz, r + 0.55, 0.22, segs=seg)                 # second balcony
    # windows, pilasters and the balustrades round the shaft (on the street-facing half)
    toward = np.array([AX - cx, AZ - cz]); toward /= np.linalg.norm(toward)
    for k in range(10):
        ang = 2 * math.pi * k / 10
        dvec = np.array([math.cos(ang), math.sin(ang)])
        if np.dot(dvec, toward) > 0.55:
            continue   # against the wings
        px, pz = cx + dvec[0] * r, cz + dvec[1] * r
        hb.push(px, 0, pz, math.atan2(dvec[0], dvec[1]))
        arch_window(0, G1 + 1.5, 1.2, 3.2, f=0.16)
        rect_window(0, F1 + 0.8, 1.05, 2.4, pedim=True)
        rect_window(0, 1.6, 1.0, 2.3, key=True)
        hb.pop()
        pa = ang + math.pi / 10
        qx, qz = cx + math.cos(pa) * r, cz + math.sin(pa) * r
        hb.push(qx, 0, qz, math.atan2(math.cos(pa), math.sin(pa)))
        pilaster(0, G1 + 0.6, TOPC - 0.1, w=0.5, d=0.16)
        hb.pop()
    for (yb, rb) in ((G1 + 0.37, r + 0.6), (F1 + 0.12, r + 0.42)):
        n = 40
        for k in range(n):
            a = 2 * math.pi * k / n
            dvec = np.array([math.cos(a), math.sin(a)])
            if np.dot(dvec, toward) > 0.55:
                continue
            hb.cyl(TRIM, cx + dvec[0] * rb, yb, cz + dvec[1] * rb, 0.06, 0.75, segs=5, r1=0.09, top=False)
        hb.cyl(TRIM, cx, yb + 0.75, cz, rb + 0.08, 0.12, segs=seg, top=False)
    # cornice, drum with oculi, dome, lantern railing
    hb.cyl(TRIM, cx, TOPC - 0.2, cz, r + 0.55, 0.6, segs=seg)
    hb.cyl(TRIM, cx, TOPC + 0.4, cz, r - 0.3, 2.3, segs=seg, top=False)
    for k in range(8):
        ang = 2 * math.pi * k / 8
        dvec = np.array([math.cos(ang), math.sin(ang)])
        px, pz = cx + dvec[0] * (r - 0.28), cz + dvec[1] * (r - 0.28)
        hb.push(px, 0, pz, math.atan2(dvec[0], dvec[1]))
        ring = [(0.42 * math.cos(2 * math.pi * j / 14), TOPC + 1.55 + 0.42 * math.sin(2 * math.pi * j / 14), 0.04) for j in range(14)]
        oface('std:win', ring, (0, 0, 1))
        for j in range(14):
            a0, a1 = 2 * math.pi * j / 14, 2 * math.pi * (j + 1) / 14
            oface(TRIM, [(0.42 * math.cos(a0), TOPC + 1.55 + 0.42 * math.sin(a0), 0.1), (0.6 * math.cos(a0), TOPC + 1.55 + 0.6 * math.sin(a0), 0.1),
                         (0.6 * math.cos(a1), TOPC + 1.55 + 0.6 * math.sin(a1), 0.1), (0.42 * math.cos(a1), TOPC + 1.55 + 0.42 * math.sin(a1), 0.1)], (0, 0, 1))
        hb.pop()
    hb.cyl(TRIM, cx, TOPC + 2.7, cz, r - 0.05, 0.3, segs=seg)
    prof = [(r - 0.2, 0.0), (r - 0.15, 0.7), (r - 0.45, 1.6), (r - 1.0, 2.5), (r - 1.9, 3.3), (r - 2.9, 3.85), (1.1, 4.1)]
    yb = TOPC + 3.0
    rings = [[(cx + rr * math.cos(2 * math.pi * k / seg), yb + hh, cz - rr * math.sin(2 * math.pi * k / seg)) for k in range(seg)] for rr, hh in prof]
    outs = [(math.cos(2 * math.pi * k / seg), 0.6, -math.sin(2 * math.pi * k / seg)) for k in range(seg)]
    K.loft(hb, 'std:slate', rings, outs, smooth=True, closed=True)
    yt = yb + 4.1
    hb.cyl('std:slate', cx, yt, cz, 1.1, 0.15, segs=16)
    for k in range(16):
        a = 2 * math.pi * k / 16
        hb.box('std:metal', cx + math.cos(a) * 1.0, yt + 0.15, cz - math.sin(a) * 1.0, 0.08, 0.9 + 0.25 * (k % 2), 0.08)
    hb.cyl('std:metal', cx, yt + 0.95, cz, 1.05, 0.08, segs=16, top=False)
    return yt


ytn = tower(*TN)
yts = tower(*TS)
hb.tube('std:steel', (float(TS[0][0]), yts, float(TS[0][1])), (float(TS[0][0]), yts + 6.5, float(TS[0][1])), 0.05, segs=6)
oface('sign:flagBG', [(float(TS[0][0]), yts + 4.9, float(TS[0][1])), (float(TS[0][0]) + 2.2, yts + 4.9, float(TS[0][1])), (float(TS[0][0]) + 2.2, yts + 6.4, float(TS[0][1])), (float(TS[0][0]), yts + 6.4, float(TS[0][1]))],
      (0, 0, 1), uv=[(0, 0), (100, 0), (100, 100), (0, 100)])
oface('sign:flagBG', [(float(TS[0][0]) + 2.2, yts + 4.9, float(TS[0][1])), (float(TS[0][0]), yts + 4.9, float(TS[0][1])), (float(TS[0][0]), yts + 6.4, float(TS[0][1])), (float(TS[0][0]) + 2.2, yts + 6.4, float(TS[0][1]))],
      (0, 0, -1), uv=[(100, 0), (0, 0), (0, 100), (100, 100)])

# ------------------------------------------------------------------ build, bake, export
ob = hb.build()
if '--nobake' not in sys.argv:
    H.add_ground(pk, hb, margin=25, step=4.0)
    H.lightmap_uv(ob)
    ao = H.bake_ao(ob, H.arg('--size', 2048, int), 3.0, H.arg('--samples', 48, int))
    H.save_ao(ao, NAME)
    H.export(ob, NAME, {'anchor': [AX, AZ], 'base': DATUM, 'source': 'tools/blender/hero/bas.py'})
if '--preview' in sys.argv:
    SP = os.environ.get('PREVIEW_DIR', '/tmp')
    if '--nobake' in sys.argv:
        H.add_ground(pk, hb, margin=60, step=4.0)
    rel = lambda x, y, z: (x - AX, y, z - AZ)
    fa_ = np.array(FRONT['a']) + np.array(FRONT['t']) * FRONT['L'] / 2
    p10 = fa_ + np.array(FRONT['n']) * 22 - np.array(FRONT['t']) * 14
    H.preview(f'{SP}/bas_front.jpg', rel(p10[0], 1.7, p10[1]), rel(fa_[0], 9, fa_[1]), lens=18)
    p11 = np.array(TN[0]) + np.array([30.0, -20.0])
    H.preview(f'{SP}/bas_tower.jpg', rel(p11[0], 1.7, p11[1]), rel(TN[0][0], 12, TN[0][1] + 18), lens=20)
    p12 = fa_ + np.array(FRONT['n']) * 70 + np.array([0.0, 0.0])
    H.preview(f'{SP}/bas_air.jpg', rel(p12[0], 45, p12[1]), rel(fa_[0] - 15, 5, fa_[1]), lens=26)
