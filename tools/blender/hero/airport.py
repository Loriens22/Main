# Летище София, Терминал 2 (opened December 2006) with its control tower, the multi-storey car park in front and the
# airport metro station: the terminus of bus line 84 (stop 2454 / 2455 at the departures curb).
# Massing from the OSM outlines in the world84 pack: the terminal (#8056) with its pier, the glazed central hall
# (#8052), the curbside canopies (#8032, #8042), the tower (#8030 on its oval base #8031), the car park (#8037,
# #8036, #8038) and the metro station (#8040). The forecourt and apron are levelled at game y 7.0 by
# tools/terrain_pads.py (tools/pads84.json): the 16 m elevation grid slopes 10 m across the site.
# Appearance from the photographs supplied by the user (front view, curbside view with the tower, aerial view):
#   * two check-in halls meeting at about 140 degrees round the forecourt, each fronted by a glass curtain wall
#     under a deep canopy: white striped soffit, a thick rounded white nose, carried by pairs of white tubes that
#     lean out towards the curb (one of each pair also leans sideways towards the centre);
#   * grey standing-seam roofs with a lighter ridge band; white panelled ends;
#   * at the meeting point a white panelled entrance block with the ЛЕТИЩЕ СОФИЯ / ТЕРМИНАЛ 2 and SOFIA AIRPORT /
#     TERMINAL 2 lettering (generic typeface, a plain SA plaque) and a glass vestibule with a hipped glass roof;
#   * behind it the central hall: a curved glass prow whose walls flare outwards towards the ground (the bell-shaped
#     vault of the front view), a white top band and a grey louvred block behind;
#   * the pier with jet bridges and parked airliners (generic white aircraft, no airline markings);
#   * concrete planters with clipped ball trees and red-leaved shrubs along the curb;
#   * the control tower: a shaft with dark glazed slots, a glazed ring, a flared white collar, the glazed cab and
#     masts, on an oval two-storey base;
#   * the car park in front: a beige parapet with a railing towards the terminal and a roof plaza patterned with
#     a Bulgarian embroidery motif (the pattern is drawn here, not copied).
# Heights are estimated from the photographs (canopy nose about 14.5 m, central hall 23.5 m, tower cab 48 m) and
# marked as estimates in data/research/line84/README.md; the OSM heights (6.3 m) are placeholders.
#   blenv/bin/python tools/blender/hero/airport.py [--preview] [--samples 48] [--size 2048] [--nobake]
import math
import os
import random
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import herolib as H
import herokit as K
from shapely.geometry import Polygon, Point, LineString
from shapely.ops import unary_union

NAME = 'airport'
pk = H.Pack('84')
H.reset()

DATUM = 7.0  # the levelled forecourt (tools/pads84.json)
AX, AZ = 5110.0, -2260.0
hb = H.HB(NAME, (AX, AZ), DATUM)
rnd = random.Random(84)


def V(*a):
    return np.array(a, dtype=float)


def unit(v):
    v = np.asarray(v, dtype=float)
    return v / (np.linalg.norm(v) or 1)


def P3(p2, y):
    """World (x, z) + y -> frame point (x, y, z)."""
    return (float(p2[0]), float(y), float(p2[1]))


def gy(x, z):
    return pk.y(x, z) - DATUM


# ------------------------------------------------------------------ materials (preview colours; game: HeroStyle.js)
hb.mat('cw:t2Glass', (0.45, 0.62, 0.64), 0.05, 0.6)
hb.mat('cw:t2Vault', (0.30, 0.50, 0.50), 0.05, 0.6)
hb.mat('cw:t2Pier', (0.30, 0.42, 0.48), 0.05, 0.6)
hb.mat('cw:t2Cab', (0.10, 0.14, 0.17), 0.05, 0.7)
hb.mat('cw:t2Band', (0.35, 0.45, 0.50), 0.05, 0.6)
hb.mat('pn:t2Seam', (0.62, 0.64, 0.66), 0.4, 0.5)
hb.mat('pn:t2Panel', (0.88, 0.89, 0.89), 0.4)
hb.mat('pn:t2Soffit', (0.90, 0.90, 0.89), 0.5)
hb.mat('pn:t2Louvre', (0.55, 0.57, 0.59), 0.45, 0.4)
hb.mat('pn:paving', (0.62, 0.61, 0.58), 0.85)
hb.mat('std:t2White', (0.90, 0.91, 0.91), 0.3, 0.1)
hb.mat('std:t2Tube', (0.92, 0.92, 0.91), 0.35)
hb.mat('std:t2Band', (0.55, 0.57, 0.58), 0.4, 0.3)
hb.mat('std:mull', (0.80, 0.82, 0.83), 0.35, 0.6)
hb.mat('std:mullDark', (0.28, 0.30, 0.32), 0.4, 0.5)
hb.mat('std:ridge', (0.80, 0.82, 0.82), 0.3, 0.3)
hb.mat('std:roofGrey', (0.47, 0.48, 0.48), 0.9)
hb.mat('std:plant', (0.66, 0.68, 0.69), 0.5, 0.4)
hb.mat('std:plantDark', (0.22, 0.23, 0.24), 0.6, 0.3)
hb.mat('std:planter', (0.68, 0.69, 0.69), 0.8)
hb.mat('std:plaque', (0.06, 0.06, 0.07), 0.4)
hb.mat('std:soil', (0.16, 0.12, 0.09), 0.95)
hb.mat('std:topiary', (0.10, 0.25, 0.09), 0.9)
hb.mat('std:redleaf', (0.42, 0.08, 0.06), 0.85)
hb.mat('std:trunk', (0.25, 0.18, 0.12), 0.9)
hb.mat('std:steel', (0.6, 0.62, 0.64), 0.35, 0.8)
hb.mat('std:steelDark', (0.12, 0.13, 0.14), 0.45, 0.6)
hb.mat('std:kerb', (0.55, 0.55, 0.53), 0.85)
hb.mat('std:towerGrey', (0.72, 0.73, 0.73), 0.6)
hb.mat('std:towerWhite', (0.90, 0.90, 0.89), 0.4)
hb.mat('std:beige', (0.78, 0.74, 0.66), 0.85)
hb.mat('std:bridge', (0.80, 0.81, 0.81), 0.45, 0.3)
hb.mat('std:bridgeDark', (0.25, 0.26, 0.27), 0.5, 0.4)
hb.mat('std:planeWhite', (0.92, 0.93, 0.94), 0.3, 0.1)
hb.mat('std:planeGrey', (0.62, 0.64, 0.66), 0.35, 0.4)
hb.mat('std:planeDark', (0.05, 0.06, 0.08), 0.2, 0.3)
hb.mat('std:metroRed', (0.75, 0.06, 0.08), 0.5)
hb.mat('glass:t2', (0.62, 0.74, 0.74), 0.05)
hb.mat('glass:door', (0.5, 0.6, 0.62), 0.05)
hb.mat('glass:rail', (0.55, 0.65, 0.68), 0.05)
hb.mat('glow:t2Navy', (0.07, 0.10, 0.32), 0.4, emit=(0.6, 0.75, 1.0))
hb.mat('glow:white', (0.95, 0.95, 0.95), 0.4, emit=(1, 1, 1))
hb.mat('glow:shopLight', (0.95, 0.95, 0.9), 0.4, emit=(1, 0.95, 0.85))
hb.mat('glow:screen', (0.15, 0.2, 0.3), 0.3, emit=(0.6, 0.8, 1))
hb.mat('glow:red', (0.85, 0.05, 0.04), 0.4, emit=(1, 0.1, 0.05))
hb.mat('glow:led', (0.9, 0.9, 0.85), 0.4, emit=(1, 0.95, 0.8))
hb.mat('sign:t2Emblem', (0.1, 0.2, 0.5), 0.4)
hb.mat('sign:shevitsa', (0.75, 0.45, 0.35), 0.8)
hb.mat('sign:metroM', (0.8, 0.1, 0.1), 0.5)
for k, c in (('floor', (0.78, 0.77, 0.74)), ('wall', (0.86, 0.86, 0.84)), ('ceiling', (0.92, 0.92, 0.92)), ('desk', (0.25, 0.27, 0.30)),
             ('deskTop', (0.75, 0.75, 0.73)), ('belt', (0.12, 0.12, 0.13)), ('column', (0.93, 0.93, 0.92)), ('sign', (0.18, 0.22, 0.30))):
    hb.mat('int:' + k, c, 0.6)

# ------------------------------------------------------------------ the outlines
T2 = pk.building(5094.7, -2255.9, 3)
T2P = Polygon(T2['pts'], T2['holes'])
v0, v1, v2, v3 = (np.array(T2['pts'][i]) for i in (0, 1, 2, 3))
uE = unit(v0 - v1); nE = np.array([-uE[1], uE[0]])      # east wing: along the facade (away from the junction), out
uW = unit(v3 - v2); nW = np.array([uW[1], -uW[0]])      # west wing
if nE[1] < 0:
    nE = -nE
if nW[0] < 0:
    nW = -nW
LE, LW = float(np.linalg.norm(v0 - v1)), float(np.linalg.norm(v3 - v2))
BIS = unit(nE + nW)  # out of the forecourt corner


def cross2(a, b):
    return a[0] * b[1] - a[1] * b[0]


def apex(t):
    """Meeting point of the two facade lines pushed out by t."""
    pE = v1 + nE * t; pW = v2 + nW * t
    # pE + a uE = pW + b uW
    d = pW - pE
    den = cross2(uE, uW)
    a = cross2(d, uW) / den
    return pE + uE * a


class Wing:
    def __init__(self, name, origin, u, n, L, D):
        self.name, self.o, self.u, self.n, self.L, self.D = name, origin, u, n, L, D

    def w(self, s, t):
        p = self.o + self.u * s + self.n * t
        return (float(p[0]), float(p[1]))

    def p(self, s, y, t):
        x, z = self.w(s, t)
        return (x, y, z)

    def up(self):
        return (0.0, 1.0, 0.0)

    def out(self):
        return (float(self.n[0]), 0.0, float(self.n[1]))

    def along(self):
        return (float(self.u[0]), 0.0, float(self.u[1]))


EAST = Wing('east', v1, uE, nE, LE, 66.0)
WEST = Wing('west', v2, uW, nW, LW, 50.0)

# hall section (t: metres out of the facade line, y up from the datum)
GLASS_TOP, SOFF0, SOFF1, NOSE_T, NOSE_TOP = 10.6, 10.9, 12.2, 8.0, 14.6


def roof_y(t, D):
    """Hall roof over the section: up from the canopy nose to a ridge a third of the way back, down to the back."""
    tr = -D * 0.30
    if t >= tr:
        f = (NOSE_T - t) / (NOSE_T - tr)
        return NOSE_TOP + 2.4 * math.sin(f * math.pi / 2)
    f = (tr - t) / (D + tr)
    return NOSE_TOP + 2.4 - 1.2 * f * f


def tsamples(D):
    return [NOSE_T] + [NOSE_T - k * (NOSE_T + D) / 14 for k in range(1, 14)] + [-D]


# ------------------------------------------------------------------ the halls
CAN_S0 = 4.0      # canopy starts this far from the junction
CAN_EXT = 1.6     # and runs past the outer end
GLASS_S0 = 11.8   # curtain wall starts beyond the entrance block


def hall(W):
    L, D = W.L, W.D
    up = (0, 1, 0)

    def s0_of(t):
        s = 0.0
        while s < L * 0.5 and CUT.contains(Point(*W.w(s, t))):
            s += 0.25
        return s
    # curtain wall and its mullions / transoms
    s0, s1 = GLASS_S0, L
    K.oface(hb, 'cw:t2Glass', [W.p(s0, 0.25, 0), W.p(s1, 0.25, 0), W.p(s1, GLASS_TOP, 0), W.p(s0, GLASS_TOP, 0)], W.out(),
            uv=[(s0, 0.25), (s1, 0.25), (s1, GLASS_TOP), (s0, GLASS_TOP)])
    K.oface(hb, 'std:mullDark', [W.p(s0, 0.0, 0.05), W.p(s1, 0.0, 0.05), W.p(s1, 0.25, 0.05), W.p(s0, 0.25, 0.05)], W.out())
    K.oface(hb, 'std:t2White', [W.p(s0, GLASS_TOP, 0), W.p(s1, GLASS_TOP, 0), W.p(s1, SOFF0, 0), W.p(s0, SOFF0, 0)], W.out())
    nb = max(1, round((s1 - s0) / 3.0))
    for i in range(nb + 1):
        s = s0 + i * (s1 - s0) / nb
        K.fin(hb, 'std:mull', W.p(s, 0.25, 0), W.p(s, GLASS_TOP, 0), 0.14, 0.32, W.out())
    for y in (2.9, 5.7, 8.3):
        K.fin(hb, 'std:mull', W.p(s0, y, 0), W.p(s1, y, 0), 0.1, 0.22, W.out())
    # revolving doors with their drums and dark canopies
    for f in (0.32, 0.72):
        s = s0 + (s1 - s0) * f
        x, z = W.w(s, 1.0)
        hb.cyl('glass:door', x, 0.0, z, 1.7, 2.7, segs=16, top=False)
        hb.cyl('std:steelDark', x, 2.7, z, 1.85, 0.35, segs=16)
        hb.cyl('std:steel', x, 0.0, z, 0.06, 2.7, segs=6, top=False)
        for a in range(3):
            ang = a * 2 * math.pi / 3 + 0.4
            hb.box('glass:door', x + math.cos(ang) * 0.8, 0.02, z + math.sin(ang) * 0.8, 1.6, 2.6, 0.04, yaw=-ang)
    # the check-in hall behind the glass
    hall_interior(W, s0, s1)
    # canopy soffit (striped), the nose and the roof
    ca, cb = max(CAN_S0, 0.0), L + CAN_EXT
    soff = lambda t: SOFF0 + (SOFF1 - SOFF0) * (t / NOSE_T)
    ts = [0.0, NOSE_T * 0.5, NOSE_T]
    for k in range(len(ts) - 1):
        ta, tb = ts[k], ts[k + 1]
        K.oface(hb, 'pn:t2Soffit', [W.p(ca, soff(ta), ta), W.p(cb, soff(ta), ta), W.p(cb, soff(tb), tb), W.p(ca, soff(tb), tb)], (0, -1, 0),
                uv=[(ca, ta), (cb, ta), (cb, tb), (ca, tb)])
    # recessed downlights in the soffit
    for k in range(int((cb - ca) / 4.0)):
        s = ca + 2 + k * 4.0
        for t in (2.6, 5.6):
            y = soff(t) - 0.02
            K.oface(hb, 'glow:led', [W.p(s - 0.25, y, t - 0.25), W.p(s + 0.25, y, t - 0.25), W.p(s + 0.25, y, t + 0.25), W.p(s - 0.25, y, t + 0.25)], (0, -1, 0))
    # roof: canopy part (over s ca..cb) and the hall part (s 0..L) share the section
    TS = tsamples(D)
    for k in range(len(TS) - 1):
        ta, tb = TS[k], TS[k + 1]
        sa = ca if ta > 0.01 else 0.0
        sb = cb if ta > 0.01 else L
        if ta > 0.01 and tb < -0.01:
            # the facade line falls inside this strip: split it
            K.oface(hb, 'pn:t2Seam', [W.p(ca, roof_y(ta, D), ta), W.p(cb, roof_y(ta, D), ta), W.p(cb, roof_y(0.0, D), 0.0), W.p(ca, roof_y(0.0, D), 0.0)], (0, 1, 0),
                    uv=[(ca, -ta), (cb, -ta), (cb, 0.0), (ca, 0.0)])
            ta, sa = 0.0, None
        if ta > 0.01:
            K.oface(hb, 'pn:t2Seam', [W.p(ca, roof_y(ta, D), ta), W.p(cb, roof_y(ta, D), ta), W.p(cb, roof_y(tb, D), tb), W.p(ca, roof_y(tb, D), tb)], (0, 1, 0),
                    uv=[(ca, -ta), (cb, -ta), (cb, -tb), (ca, -tb)])
            continue
        a0, a1 = s0_of(ta), s0_of(tb)
        K.oface(hb, 'pn:t2Seam', [W.p(a0, roof_y(ta, D), ta), W.p(L, roof_y(ta, D), ta), W.p(L, roof_y(tb, D), tb), W.p(a1, roof_y(tb, D), tb)], (0, 1, 0),
                uv=[(a0, -ta), (L, -ta), (L, -tb), (a1, -tb)])
        # the inner end wall follows the cut
        K.oface(hb, 'pn:t2Panel', [W.p(a0, 0.0, ta), W.p(a1, 0.0, tb), W.p(a1, roof_y(tb, D), tb), W.p(a0, roof_y(ta, D), ta)], tuple(-c for c in W.along()))
    # the lighter ridge band (rooflights) a third of the way back
    tr = -D * 0.30
    for (t0, t1) in ((tr + 2.2, tr - 2.2),):
        K.oface(hb, 'std:ridge', [W.p(2.0, roof_y(t0, D) + 0.08, t0), W.p(L - 2.0, roof_y(t0, D) + 0.08, t0), W.p(L - 2.0, roof_y(t1, D) + 0.08, t1), W.p(2.0, roof_y(t1, D) + 0.08, t1)], (0, 1, 0))
    # the rounded white nose round the front and both ends of the canopy
    prof = [(-1.7, SOFF1 + 0.02), (-0.5, 11.95), (0.2, 12.05), (0.7, 12.45), (1.0, 13.05), (1.02, 13.65), (0.8, 14.15), (0.35, 14.5), (-0.4, 14.68), (-1.6, 14.62)]
    r = 2.2
    tf = NOSE_T + 0.2
    ends = []
    # left end (s = ca) back -> front, the front, right end (s = cb) front -> back; corners rounded
    path = [(ca, -1.0), (ca, tf - r)] + [(ca + r - r * math.cos(a), tf - r + r * math.sin(a)) for a in np.linspace(0.25, math.pi / 2 - 0.25, 4)] + \
           [(ca + r, tf), (cb - r, tf)] + [(cb - r + r * math.sin(a), tf - r + r * math.cos(a)) for a in np.linspace(0.25, math.pi / 2 - 0.25, 4)] + [(cb, tf - r), (cb, -1.0)]
    # the sweep works in a frame whose x runs along the wing: build that frame (x = s, z = t)
    yaw = math.atan2(W.n[0], W.n[1])
    hb.push(float(W.o[0]), 0, float(W.o[1]), yaw)
    sg = 1.0 if np.dot(W.u, np.array([math.cos(yaw), -math.sin(yaw)])) > 0 else -1.0
    pth = [(sg * s, 0.0, t) for s, t in path]
    if sg < 0:
        pth = pth[::-1]
    hb.sweep('std:t2White', pth, prof)
    hb.pop()
    # ends of the hall (white panels): the section polygon at s = 0 and s = L; the canopy end caps at ca / cb
    for s, o in ((L, 1),):
        sec = [W.p(s, 0.0, -D), W.p(s, 0.0, 0.0), W.p(s, SOFF0, 0.0), W.p(s, roof_y(0.0, D), 0.0)] + [W.p(s, roof_y(t, D), t) for t in TS if t < 0.0]
        K.oface(hb, 'pn:t2Panel', sec, tuple(o * c for c in W.along()))
    a0 = s0_of(0.0)
    K.oface(hb, 'pn:t2Panel', [W.p(a0, 0.0, 0.0), W.p(a0, 0.0, -0.5), W.p(a0, roof_y(0.0, D), -0.5), W.p(a0, roof_y(0.0, D), 0.0)], tuple(-c for c in W.along()))
    for s, o in ((ca, -1), (cb, 1)):
        sec = [W.p(s, SOFF0, 0.0), W.p(s, SOFF1, NOSE_T)] + [W.p(s, roof_y(t, D), t) for t in TS if 0.0 <= t <= NOSE_T]
        if roof_y(0.0, D) > SOFF0:
            sec.append(W.p(s, roof_y(0.0, D), 0.0))
        K.oface(hb, 'pn:t2Panel', sec, tuple(o * c for c in W.along()))
    # back wall
    a0 = s0_of(-D)
    K.oface(hb, 'pn:t2Panel', [W.p(a0, 0, -D), W.p(L, 0, -D), W.p(L, roof_y(-D, D), -D), W.p(a0, roof_y(-D, D), -D)], tuple(-c for c in W.out()))
    # the columns: pairs of white tubes leaning out to the nose, one also leaning towards the centre
    s = 16.0
    while s < L - 3.0:
        for ds, lean in ((0.0, 0.0), (0.9, -2.6)):
            b = W.p(s + ds, 0.0, 6.3)
            tp = W.p(s + ds + lean, soff(NOSE_T - 0.4) - 0.05, NOSE_T - 0.4)
            hb.tube('std:t2Tube', b, tp, 0.29, segs=12)
        x, z = W.w(s + 0.45, 6.3)
        hb.cyl('std:t2Tube', x, 0.0, z, 0.75, 0.32, segs=12)
        s += 16.0
    # sidewalk under the canopy: paving with a granite kerb, and the planters at the kerb
    K.oface(hb, 'pn:paving', [W.p(ca - 2, 0.12, 0.0), W.p(cb, 0.12, 0.0), W.p(cb, 0.12, 6.9), W.p(ca - 2, 0.12, 6.9)], (0, 1, 0),
            uv=[(ca - 2, 0), (cb, 0), (cb, 6.9), (ca - 2, 6.9)])
    K.oface(hb, 'std:kerb', [W.p(ca - 2, -0.05, 6.9), W.p(cb, -0.05, 6.9), W.p(cb, 0.14, 6.9), W.p(ca - 2, 0.14, 6.9)], W.out())
    s = 18.5
    k = 0
    while s < L - 1.0:
        if abs(((s - 16.0) % 16.0) - 0.45) > 1.6:  # not on a column
            planter(W, s, 5.3, k)
            k += 1
        s += 3.3


def planter(W, s, t, k):
    x, z = W.w(s, t)
    yaw = math.atan2(W.n[0], W.n[1])
    hb.push(x, 0.12, z, yaw)
    hb.box('std:planter', 0, 0, 0, 1.3, 0.92, 1.3)
    hb.box('std:soil', 0, 0.92, 0, 1.12, 0.03, 1.12)
    hb.box('std:plaque', 0, 0.42, 0.66, 0.34, 0.34, 0.02)
    if k % 3 != 2:
        K.ball_tree(hb, 0, 0, 2.1 + (k % 2) * 0.35, 0.48, y=0.95)
    for a in range(3 if k % 3 != 2 else 5):
        ang = a * 2.1 + k
        hb.sphere('std:redleaf', (math.cos(ang) * 0.32, 1.12, math.sin(ang) * 0.32), 0.3, segs=7, rings=4)
    hb.pop()


def hall_interior(W, s0, s1):
    """Check-in hall behind the curtain wall: floor, ceiling with light rows, columns, check-in islands, screens."""
    dep = 24.0
    up = (0, 1, 0)
    K.oface(hb, 'int:floor', [W.p(s0, 0.03, 0), W.p(s1, 0.03, 0), W.p(s1, 0.03, -dep), W.p(s0, 0.03, -dep)], up)
    K.oface(hb, 'int:ceiling', [W.p(s0, 10.3, 0), W.p(s1, 10.3, 0), W.p(s1, 10.3, -dep), W.p(s0, 10.3, -dep)], (0, -1, 0))
    K.oface(hb, 'int:wall', [W.p(s0, 0, -dep), W.p(s1, 0, -dep), W.p(s1, 10.3, -dep), W.p(s0, 10.3, -dep)], W.out())
    for s in (s0, s1):
        K.oface(hb, 'int:wall', [W.p(s, 0, 0), W.p(s, 0, -dep), W.p(s, 10.3, -dep), W.p(s, 10.3, 0)], tuple(c * (1 if s == s0 else -1) for c in W.along()))
    # light rows
    for t in (-3.0, -9.0, -15.0, -21.0):
        K.oface(hb, 'glow:shopLight', [W.p(s0 + 1, 10.28, t - 0.3), W.p(s1 - 1, 10.28, t - 0.3), W.p(s1 - 1, 10.28, t + 0.3), W.p(s0 + 1, 10.28, t + 0.3)], (0, -1, 0))
    # columns
    s = s0 + 9.0
    while s < s1 - 2:
        x, z = W.w(s, -8.0)
        hb.cyl('int:column', x, 0, z, 0.45, 10.3, segs=10, top=False)
        s += 18.0
    # check-in islands: desks on both sides of a belt, a back panel with screens
    s = s0 + 4.0
    while s < s1 - 10:
        for side in (-1, 1):
            for k in range(6):
                ds = s + k * 1.8
                x, z = W.w(ds + 0.8, -14.0 + side * 1.4)
                hb.box('int:desk', x, 0, z, 1.5, 1.05, 0.7, yaw=-math.atan2(W.u[1], W.u[0]))
                hb.box('int:deskTop', x, 1.05, z, 1.55, 0.04, 0.75, yaw=-math.atan2(W.u[1], W.u[0]))
                xs, zs = W.w(ds + 0.8, -14.0 + side * 0.35)
                hb.box('glow:screen', xs, 2.1, zs, 0.9, 0.5, 0.05, yaw=-math.atan2(W.u[1], W.u[0]))
        x, z = W.w(s + 5.4, -14.0)
        hb.box('int:belt', x, 0, z, 11.0, 0.45, 0.9, yaw=-math.atan2(W.u[1], W.u[0]))
        hb.box('int:sign', x, 2.6, z, 11.2, 0.9, 0.2, yaw=-math.atan2(W.u[1], W.u[0]))
        s += 16.0
    # hanging flight-information screens near the glass
    s = s0 + 6
    while s < s1 - 4:
        x, z = W.w(s, -3.5)
        hb.box('glow:screen', x, 4.2, z, 2.4, 1.0, 0.08, yaw=-math.atan2(W.u[1], W.u[0]))
        hb.tube('std:steelDark', (x, 5.2, z), (x, 10.3, z), 0.03, segs=4, caps=False)
        s += 12.0



# ------------------------------------------------------------------ the entrance block with the lettering
HW, F = 11.6, 3.6
PE = v1 + uE * HW + nE * F
PW = v2 + uW * HW + nW * F
A = apex(F)
QE = v1 + uE * HW
QW = v2 + uW * HW
J = (v1 + v2) / 2
BLK = H.orient([tuple(QW), tuple(PW), tuple(A), tuple(PE), tuple(QE), tuple(QE - nE * 9), tuple(J - BIS * 14), tuple(QW - nW * 9)])
BTOP = 11.0
for e in H.edges(BLK):
    hb.wall('pn:t2Panel', e['a'], e['b'], 0.0, BTOP - 0.55)
    hb.wall('std:t2Band', e['a'], e['b'], BTOP - 0.55, BTOP)
hb.cap('std:roofGrey', BLK, BTOP)
K.parapet(hb, BLK, BTOP, 0.5, 'std:t2Band', w=0.25)
# the lettering: west face (ЛЕТИЩЕ СОФИЯ / ТЕРМИНАЛ 2) and east face (SOFIA AIRPORT / TERMINAL 2), the plaque at the apex
eW = min(H.edges(BLK), key=lambda e: np.linalg.norm((np.array(e['a']) + np.array(e['b'])) / 2 - (PW + A) / 2))
eE = min(H.edges(BLK), key=lambda e: np.linalg.norm((np.array(e['a']) + np.array(e['b'])) / 2 - (PE + A) / 2))
for e, top, bottom, align in ((eW, 'ЛЕТИЩЕ СОФИЯ', 'ТЕРМИНАЛ 2', 'RIGHT'), (eE, 'SOFIA AIRPORT', 'TERMINAL 2', 'LEFT')):
    K.frame(hb, e)
    near_apex_at_b = np.linalg.norm(np.array(e['b']) - A) < 0.5
    x = e['L'] - 1.9 if near_apex_at_b else 1.9
    al = 'RIGHT' if near_apex_at_b else 'LEFT'
    K.text3d(hb, 'glow:t2Navy', top, x, 7.65, 0.02, 1.0, 0.16, align=al, side='std:t2Band', width=e['L'] - 2.6)
    K.text3d(hb, 'glow:t2Navy', bottom, x - (0.3 if al == 'RIGHT' else -0.3), 6.3, 0.02, 0.85, 0.16, align=al, side='std:t2Band')
    hb.pop()
# the plaque: a navy square across the apex, standing proud
ap = A + BIS * 0.25
side = np.array([BIS[1], -BIS[0]])
pl = [P3(ap - side * 1.15, 6.2), P3(ap + side * 1.15, 6.2), P3(ap + side * 1.15, 8.6), P3(ap - side * 1.15, 8.6)]
K.sface(hb, 'sign:t2Emblem', pl, (BIS[0], 0, BIS[1]))
back = [P3(ap - side * 1.15 - BIS * 0.25, 6.2), P3(ap + side * 1.15 - BIS * 0.25, 6.2), P3(ap + side * 1.15 - BIS * 0.25, 8.6), P3(ap - side * 1.15 - BIS * 0.25, 8.6)]
for i in range(4):
    j = (i + 1) % 4
    K.oface(hb, 'std:t2Band', [back[i], back[j], pl[j], pl[i]], tuple(np.array(pl[i]) + np.array(pl[j]) - 2 * np.array(P3(ap - BIS * 0.12, 7.4))))
# two lamp nozzles on the block top (front view)
for sgn in (-1, 1):
    c = A - BIS * 2.0 + side * sgn * 6.5
    hb.tube('std:plantDark', P3(c, BTOP + 0.6), P3(c + BIS * 1.2, BTOP + 0.6), 0.42, segs=12)

# ------------------------------------------------------------------ the glass vestibule (hipped glass roof)
VF, VB, VW, VH, VR = 9.2, F, 13.2, 4.1, 5.7


def chev(t, s):
    """Point on the forecourt chevron at offset t: s < 0 along the west wing, s > 0 along the east wing (metres
    from the apex line)."""
    a = apex(t)
    return a + (uE * s if s >= 0 else uW * (-s))


def vest_pt(s, t, y):
    return P3(chev(t, s), y)


# walls: front (both faces) and the two ends
for (sa, sb) in ((-VW, 0.0), (0.0, VW)):
    o = nW if sa < 0 else nE
    K.oface(hb, 'glass:t2', [vest_pt(sa, VF, 0.0), vest_pt(sb, VF, 0.0), vest_pt(sb, VF, VH), vest_pt(sa, VF, VH)], (o[0], 0, o[1]))
    n = 6
    for k in range(n + 1):
        s = sa + (sb - sa) * k / n
        K.fin(hb, 'std:t2White', vest_pt(s, VF, 0.0), vest_pt(s, VF, VH), 0.12, 0.12, (o[0], 0, o[1]))
    K.fin(hb, 'std:t2White', vest_pt(sa, VF, 2.7), vest_pt(sb, VF, 2.7), 0.1, 0.1, (o[0], 0, o[1]))
    K.fin(hb, 'std:t2White', vest_pt(sa, VF, VH), vest_pt(sb, VF, VH), 0.2, 0.18, (o[0], 0, o[1]))
    # sliding doors: dark frames
    mid = (sa + sb) / 2
    for dx in (-1.0, 1.0):
        K.fin(hb, 'std:steelDark', vest_pt(mid + dx, VF, 0.0), vest_pt(mid + dx, VF, 2.5), 0.1, 0.16, (o[0], 0, o[1]))
    K.fin(hb, 'std:steelDark', vest_pt(mid - 1.0, VF, 2.5), vest_pt(mid + 1.0, VF, 2.5), 0.12, 0.16, (o[0], 0, o[1]))
for s, u in ((-VW, uW), (VW, uE)):
    pts = [vest_pt(s, VB, 0.0), vest_pt(s, VF, 0.0), vest_pt(s, VF, VH), vest_pt(s, VB, VH)]
    K.oface(hb, 'glass:t2', pts, (u[0], 0, u[1]))
    K.fin(hb, 'std:t2White', pts[1], pts[2], 0.14, 0.12, (u[0], 0, u[1]))
# hipped roof: eaves at VH, ridge along the middle offset at VR, hips at the ends
tm = (VF + VB) / 2
for (sa, sb) in ((-VW, 0.0), (0.0, VW)):
    ra = sa + (2.6 if sa < 0 else 0.0)
    rb = sb - (2.6 if sb > 0 else 0.0)
    o = nW if sa < 0 else nE
    K.oface(hb, 'glass:t2', [vest_pt(sa, VF, VH), vest_pt(sb, VF, VH), vest_pt(rb, tm, VR), vest_pt(ra, tm, VR)], (o[0], 1.2, o[1]))
    K.oface(hb, 'glass:t2', [vest_pt(sa, VB, VH), vest_pt(sb, VB, VH), vest_pt(rb, tm, VR), vest_pt(ra, tm, VR)], (-o[0], 1.2, -o[1]))
    n = 8
    for k in range(n + 1):
        f = k / n
        s_e = sa + (sb - sa) * f
        s_r = ra + (rb - ra) * f
        hb.beam('std:t2White', vest_pt(s_e, VF, VH + 0.05), vest_pt(s_r, tm, VR + 0.05), 0.09, 0.12)
    hb.beam('std:t2White', vest_pt(ra, tm, VR + 0.06), vest_pt(rb, tm, VR + 0.06), 0.16, 0.16)
for s, u in ((-VW, uW), (VW, uE)):
    r = s + (2.6 if s < 0 else -2.6)
    K.oface(hb, 'glass:t2', [vest_pt(s, VF, VH), vest_pt(s, VB, VH), vest_pt(r, tm, VR)], (u[0], 1.0, u[1]))
    hb.beam('std:t2White', vest_pt(s, VF, VH + 0.05), vest_pt(r, tm, VR + 0.05), 0.12, 0.12)
K.oface(hb, 'pn:paving', [vest_pt(-VW, VB, 0.06), vest_pt(0, VB, 0.06), vest_pt(0, VF, 0.06), vest_pt(-VW, VF, 0.06)], (0, 1, 0))
K.oface(hb, 'pn:paving', [vest_pt(0, VB, 0.06), vest_pt(VW, VB, 0.06), vest_pt(VW, VF, 0.06), vest_pt(0, VF, 0.06)], (0, 1, 0))
# forecourt paving between the vestibule and the curb, the pedestrian crossing island
for (sa, sb) in ((-VW - 2, 0.0), (0.0, VW + 2)):
    K.oface(hb, 'pn:paving', [vest_pt(sa, VF, 0.1), vest_pt(sb, VF, 0.1), vest_pt(sb, 13.0, 0.1), vest_pt(sa, 13.0, 0.1)], (0, 1, 0))

# ------------------------------------------------------------------ the central hall: the flaring glass prow
pr = pk.building(5113.3, -2250.2, 3)['pts']
# its two long sides (east: vertices 11-12, west: 17-18 of the OSM outline; found by direction)
def side_line(p, q):
    p = np.array(p); q = np.array(q)
    return p, unit(q - p)


eS = side_line(pr[11], pr[12])   # (5138.2, -2252.8) -> (5132.4, -2209.7)
wS = side_line(pr[18], pr[17])   # (5092.5, -2238.4) -> (5120.2, -2206.3)
# intersection X of the two sides, the prow axis and half-angle
d = wS[0] - eS[0]
den = cross2(eS[1], wS[1])
X = eS[0] + eS[1] * (cross2(d, wS[1]) / den)
AXD = unit(eS[1] + wS[1])                        # towards the tip
TH = math.acos(float(np.clip(np.dot(eS[1], wS[1]), -1, 1))) / 2
LAT = np.array([AXD[1], -AXD[0]])
if np.dot(LAT, eS[1] - wS[1]) < 0:
    LAT = -LAT                                  # towards the east side
# The prow is a family of U outlines: a round tip of radius R(y) and straight sides diverging at half-angle
# TH(y), both growing towards the ground (R 5 -> 21 m, TH 9 -> 40 degrees), so the glass flares like a bell in
# the front view (about 18 m wide at the top, 37 m where it meets the canopies). The OSM outline (#8052, traced
# from above) gives the tip of the roof; the foot of the glass reaches forward to the entrance block.
R_TOP, R_BASE, TH_TOP, TH_BASE, HT, BACK, PW_ = 5.0, 21.0, math.radians(9), math.radians(40), 28.0, 27.0, 1.1
fl = lambda y: (1 - y / HT) ** PW_
Ry = lambda y: R_TOP + (R_BASE - R_TOP) * fl(y)
Ty = lambda y: TH_TOP + (TH_BASE - TH_TOP) * fl(y)
OSM_TIP = np.array(pr[15], dtype=float)
C = OSM_TIP - AXD * R_TOP
N_ARC, N_SIDE = 14, 14


def ushape(y):
    """Outline at height y: points and horizontal outward normals, west back end -> tip -> east back end."""
    R, TH = Ry(y), Ty(y)
    pts, nrm = [], []
    phi = math.pi / 2 - TH
    nW_ = AXD * math.sin(TH) - LAT * math.cos(TH)
    nE_ = AXD * math.sin(TH) + LAT * math.cos(TH)
    bW = -AXD * math.cos(TH) - LAT * math.sin(TH)
    bE = -AXD * math.cos(TH) + LAT * math.sin(TH)
    tW = C + R * nW_
    tE = C + R * nE_
    for k in range(N_SIDE, 0, -1):
        pts.append(tW + bW * (BACK * k / N_SIDE)); nrm.append(nW_)
    for k in range(N_ARC + 1):
        a = -phi + 2 * phi * k / N_ARC
        dvec = AXD * math.cos(a) + LAT * math.sin(a)
        pts.append(C + R * dvec); nrm.append(dvec)
    for k in range(1, N_SIDE + 1):
        pts.append(tE + bE * (BACK * k / N_SIDE)); nrm.append(nE_)
    return pts, nrm


UP, UN = ushape(HT)
NR = 16
rows = [HT * k / NR for k in range(NR + 1)]
rings, uvs = [], []
shapes = [ushape(y) for y in rows]
slant = [0.0]
for k in range(1, NR + 1):
    a0 = np.array(shapes[k - 1][0][N_SIDE + N_ARC // 2]); a1 = np.array(shapes[k][0][N_SIDE + N_ARC // 2])
    slant.append(slant[-1] + math.hypot(rows[k] - rows[k - 1], float(np.linalg.norm(a1 - a0))))
for k, y in enumerate(rows):
    rings.append([P3(p, y) for p in shapes[k][0]])
    uvs.append([(j * 1.5, slant[k] * 1.0) for j in range(len(UP))])
outs = [(float(nv[0]), 0.35, float(nv[1])) for nv in UN]
K.loft(hb, 'cw:t2Vault', rings, outs, uvs=uvs)
# mullions along the rulings and the horizontal transoms (every other row)
for j in range(len(UP)):
    for k in range(NR):
        K.fin(hb, 'std:mull', rings[k][j], rings[k + 1][j], 0.1, 0.16, outs[j])
for k in range(0, NR + 1, 2):
    for j in range(len(UP) - 1):
        K.fin(hb, 'std:mull', rings[k][j], rings[k][j + 1], 0.08, 0.12, outs[j])
# the white band over the top edge, the roof and its terrace railing
TOPL = [p for p in UP]
for j in range(len(TOPL) - 1):
    a, b = TOPL[j], TOPL[j + 1]
    o = (UN[j] + UN[j + 1]) / 2
    K.oface(hb, 'std:t2White', [P3(a, HT), P3(b, HT), P3(b, HT + 1.3), P3(a, HT + 1.3)], (o[0], 0, o[1]))
    K.oface(hb, 'std:t2White', [P3(a, HT + 1.3), P3(b, HT + 1.3), P3(b - o * 0.4, HT + 1.3), P3(a - o * 0.4, HT + 1.3)], (0, 1, 0))
TOPPOLY = H.orient([tuple(p) for p in TOPL])
hb.cap('std:roofGrey', H.offset(TOPPOLY, -0.4), HT + 1.1)
for j in range(0, len(TOPL) - 1):
    a, b = TOPL[j] - UN[j] * 0.6, TOPL[j + 1] - UN[j + 1] * 0.6
    hb.beam('std:steel', P3(a, HT + 2.35), P3(b, HT + 2.35), 0.05, 0.05)
    hb.cyl('std:steel', float(a[0]), HT + 1.3, float(a[1]), 0.03, 1.05, segs=4, top=False)
# rooftop: stair houses and plant on the prow roof
c0 = C - AXD * 14.0
for (dl, da, w, d_, h) in ((-2.6, 0.0, 3.6, 5.0, 3.2), (3.0, -4.0, 3.0, 4.0, 2.6), (0.0, -10.0, 8.0, 4.0, 2.2)):
    p = c0 + LAT * dl + AXD * da
    hb.box('std:plant', float(p[0]), HT + 1.1, float(p[1]), w, h, d_, yaw=-math.atan2(AXD[1], AXD[0]))

# the halls are cut back along the prow's sides (the glass shows between their inner ends, aerial photograph)
CUT = Polygon([tuple(p) for p in ushape(8.0)[0]]).buffer(1.5)
hall(EAST)
hall(WEST)

# ------------------------------------------------------------------ the louvred block behind and the rest of the core
bk0 = C - AXD * 20.0
LOUV = H.orient([tuple(bk0 + LAT * 27), tuple(bk0 - LAT * 27), tuple(bk0 - LAT * 27 - AXD * 30), tuple(bk0 + LAT * 27 - AXD * 30)])
LP = Polygon(LOUV).intersection(T2P.buffer(-0.5))
if LP.geom_type != 'Polygon':
    LP = max(LP.geoms, key=lambda g: g.area)
LOUV = H.orient(H.simplify(list(LP.exterior.coords)[:-1], 0.3))
hb.prism('pn:t2Louvre', LOUV, 0.0, 19.5, top='std:roofGrey')
K.parapet(hb, LOUV, 19.5, 0.8, 'std:t2Band', w=0.3)
K.roof_plant(hb, LOUV, 19.5, 6, 11)

hallE = Polygon([EAST.w(0, 0), EAST.w(EAST.L, 0), EAST.w(EAST.L, -EAST.D), EAST.w(0, -EAST.D)])
hallW = Polygon([WEST.w(0, 0), WEST.w(WEST.L, 0), WEST.w(WEST.L, -WEST.D), WEST.w(0, -WEST.D)])
PIER = Polygon([T2['pts'][i] for i in (12, 13, 14, 15)])
vaultP = Polygon([tuple(p) for p in shapes[0][0]]).buffer(0)
core = T2P.difference(unary_union([hallE.difference(CUT).buffer(0.3), hallW.difference(CUT).buffer(0.3), CUT, PIER.buffer(0.3), vaultP.buffer(-0.5), Polygon(BLK).buffer(0.2), LP.buffer(0.2)]))
for g in getattr(core, 'geoms', [core]):
    if g.area < 150:
        continue
    pts = H.orient(H.simplify(list(g.exterior.coords)[:-1], 0.4))
    holes = [H.simplify(list(h.coords)[:-1], 0.4) for h in g.interiors]
    hb.ring('pn:t2Panel', pts, 0.0, 12.0)
    for h in holes:
        hh = H.orient(h)[::-1]
        for e in H.edges(hh):
            hb.wall('pn:t2Panel', e['a'], e['b'], 0.0, 12.0)
    # a dark ribbon of windows on the core's outer walls
    for e in H.edges(pts):
        if e['L'] > 6:
            K.frame(hb, e)
            hb.face('cw:t2Band', [(0.5, 7.2, 0.02), (e['L'] - 0.5, 7.2, 0.02), (e['L'] - 0.5, 10.2, 0.02), (0.5, 10.2, 0.02)])
            hb.pop()
    hb.cap('std:roofGrey', pts, 12.0, holes=holes)
    K.parapet(hb, pts, 12.0, 0.7, 'std:t2White', w=0.3)
    K.roof_plant(hb, pts, 12.0, max(1, int(g.area / 700)), int(g.area) % 97)

# ------------------------------------------------------------------ the pier, its jet bridges and the aircraft
PP = H.orient([tuple(T2['pts'][i]) for i in (12, 13, 14, 15)])
pe = H.edges(PP)
long_e = sorted(pe, key=lambda e: -e['L'])[:2]
hb.ring('pn:t2Panel', PP, 0.0, 4.6)
for e in H.edges(PP):
    K.frame(hb, e)
    hb.face('cw:t2Pier', [(0.0, 4.6, 0.0), (e['L'], 4.6, 0.0), (e['L'], 10.4, 0.0), (0.0, 10.4, 0.0)])
    hb.box('std:t2White', e['L'] / 2, 10.4, 0.1, e['L'], 1.3, 0.2)
    hb.box('std:t2White', e['L'] / 2, 4.4, 0.25, e['L'], 0.3, 0.5)
    n = max(1, int(e['L'] / 3.0))
    for k in range(n + 1):
        hb.box('std:mull', k * e['L'] / n, 4.6, 0.08, 0.1, 5.8, 0.16)
    # service doors on the apron level
    for k in range(int(e['L'] / 30)):
        hb.box('std:steelDark', 15 + k * 30, 0.0, 0.05, 4.0, 3.6, 0.1)
    hb.pop()
hb.cap('std:roofGrey', PP, 11.7)
K.parapet(hb, PP, 11.7, 0.4, 'std:t2White', w=0.25)
cpl = Polygon(PP).centroid
spine = H.orient([tuple(p) for p in Polygon(PP).buffer(-12.0, join_style=2).exterior.coords[:-1]])
hb.prism('std:plant', spine, 11.7, 13.2)
K.roof_plant(hb, PP, 11.7, 8, 5)


def jet_bridge(e, s, door):
    """Rotunda against the pier wall (3 m out), a telescopic tunnel to the aircraft's forward door at door =
    (along, out) in the edge frame, its drive bogie and the cab."""
    K.frame(hb, e, s=s)
    hb.cyl('std:bridge', 0, 4.0, 3.0, 2.2, 3.4, segs=12)
    hb.box('std:bridgeDark', 0, 0, 3.0, 0.9, 4.0, 0.9)
    dx, dz = door[0], door[1] - 3.0
    L = math.hypot(dx, dz) - 1.4
    ang = math.atan2(dx, dz)
    hb.push(0, 0, 3.0, ang)
    y0, y1 = 4.6, 4.2
    for (a, b, w, h) in ((2.0, L * 0.55, 2.9, 3.1), (L * 0.5, L - 1.2, 2.6, 2.8)):
        ya, yb = y0 + (y1 - y0) * a / L, y0 + (y1 - y0) * b / L
        for (pp, qq, oy) in (((-w / 2, 0), (w / 2, 0), -1), ((-w / 2, h), (w / 2, h), 1)):
            K.oface(hb, 'std:bridge', [(pp[0], ya + pp[1], a), (qq[0], ya + qq[1], a), (qq[0], yb + qq[1], b), (pp[0], yb + pp[1], b)], (0, oy, 0))
        for sx in (-1, 1):
            K.oface(hb, 'std:bridge', [(sx * w / 2, ya, a), (sx * w / 2, yb, b), (sx * w / 2, yb + h, b), (sx * w / 2, ya + h, a)], (sx, 0, 0))
            K.oface(hb, 'cw:t2Band', [(sx * (w / 2 + 0.01), ya + 1.2, a + 1), (sx * (w / 2 + 0.01), yb + 1.2, b - 1), (sx * (w / 2 + 0.01), yb + 2.2, b - 1), (sx * (w / 2 + 0.01), ya + 2.2, a + 1)], (sx, 0, 0))
    hb.box('std:bridgeDark', 0, 0, L * 0.72, 3.0, 0.9, 1.2)
    for sx in (-1, 1):
        hb.box('std:bridgeDark', sx * 0.9, 0.9, L * 0.72, 0.35, y1 - 0.9, 0.35)
    hb.box('std:bridge', 0, y1 - 0.25, L - 0.2, 3.6, 3.3, 2.4)
    hb.box('std:bridgeDark', 0, y1 + 0.3, L + 1.0, 3.2, 2.5, 0.3)
    hb.pop()
    hb.pop()


def aircraft(x, z, yaw):
    """A generic twin-engine narrow-body airliner (about 37.6 m long, 35.8 m span): white, grey belly, no markings."""
    hb.push(x, 0, z, yaw)
    Lf, R0 = 37.6, 1.98
    # fuselage rings along local z (nose at +z)
    zs = [-Lf / 2 + k for k in (0.0, 1.0, 2.5, 4.5, 7.0, 10, 14, 18, 22, 26, 29, 31.5, 33.5, 35.2, 36.6, 37.6)]
    def rad(zz):
        f = (zz + Lf / 2) / Lf
        if f > 0.86:
            return R0 * math.sqrt(max(0.0, 1 - ((f - 0.86) / 0.14) ** 2)) * 0.98 + 0.02
        if f < 0.25:
            return R0 * (0.25 + 0.75 * math.sqrt(f / 0.25))
        return R0
    def cy(zz):
        f = (zz + Lf / 2) / Lf
        return 3.1 + (0.0 if f > 0.25 else (0.25 - f) * 3.2) + (-(f - 0.86) * 2.0 if f > 0.86 else 0)
    segs = 14
    rings_ = []
    for zz in zs:
        r = rad(zz)
        rings_.append([(r * math.cos(2 * math.pi * k / segs), cy(zz) + r * 1.04 * math.sin(2 * math.pi * k / segs), zz) for k in range(segs)])
    for i in range(len(rings_) - 1):
        A_, B_ = rings_[i], rings_[i + 1]
        for k in range(segs):
            k2 = (k + 1) % segs
            ang = 2 * math.pi * (k + 0.5) / segs
            mat = 'std:planeGrey' if math.sin(ang) < -0.55 else 'std:planeWhite'
            K.oface(hb, mat, [A_[k], A_[k2], B_[k2], B_[k]], (math.cos(ang), math.sin(ang), 0), smooth=True)
    # window line and the cockpit windows
    for sx in (-1, 1):
        K.oface(hb, 'std:planeDark', [(sx * (R0 + 0.01), 3.45, -12.0), (sx * (R0 + 0.01), 3.45, 13.5), (sx * (R0 + 0.01), 3.75, 13.5), (sx * (R0 + 0.01), 3.75, -12.0)], (sx, 0, 0))
    K.oface(hb, 'std:planeDark', [(-1.0, 3.95, 16.3), (1.0, 3.95, 16.3), (0.7, 4.35, 15.6), (-0.7, 4.35, 15.6)], (0, 0.5, 1))
    # wings (swept, dihedral), engines on pylons
    for sx in (-1, 1):
        root_le, root_te, tip_le, tip_te = (sx * 1.8, 2.3, 3.5), (sx * 1.8, 2.3, -3.0), (sx * 17.9, 3.6, -6.5), (sx * 17.9, 3.6, -8.2)
        K.oface(hb, 'std:planeGrey', [root_le, tip_le, tip_te, root_te], (0, 1, 0))
        K.oface(hb, 'std:planeGrey', [(root_le[0], root_le[1] - 0.35, root_le[2]), (tip_le[0], tip_le[1] - 0.08, tip_le[2]), (tip_te[0], tip_te[1] - 0.08, tip_te[2]), (root_te[0], root_te[1] - 0.35, root_te[2])], (0, -1, 0))
        K.oface(hb, 'std:planeWhite', [root_le, tip_le, (tip_le[0], tip_le[1] - 0.08, tip_le[2]), (root_le[0], root_le[1] - 0.35, root_le[2])], (0, 0, 1))
        hb.box('std:planeWhite', sx * 17.9, 3.6, -7.4, 0.08, 2.2, 1.6)  # winglet
        ex = sx * 5.75
        hb.tube('std:planeGrey', (ex, 1.75, 2.6), (ex, 1.75, -1.6), 1.0, segs=12)
        hb.beam('std:planeWhite', (ex, 2.4, 0.5), (ex, 2.9, -2.0), 0.3, 0.6)
        # horizontal stabiliser
        K.oface(hb, 'std:planeWhite', [(sx * 0.8, 4.1, -14.6), (sx * 6.2, 4.6, -17.6), (sx * 6.2, 4.6, -18.6), (sx * 0.8, 4.1, -17.9)], (0, 1, 0))
        K.oface(hb, 'std:planeWhite', [(sx * 0.8, 4.0, -14.6), (sx * 6.2, 4.5, -17.6), (sx * 6.2, 4.5, -18.6), (sx * 0.8, 4.0, -17.9)], (0, -1, 0))
        # main gear
        hb.box('std:planeDark', sx * 3.8, 0.0, -1.0, 0.7, 1.15, 1.3)
        hb.box('std:steel', sx * 3.8, 1.1, -1.0, 0.15, 1.3, 0.15)
    # fin
    for sx in (-1, 1):
        K.oface(hb, 'std:planeWhite', [(sx * 0.15, 5.0, -12.6), (sx * 0.15, 5.0, -18.2), (sx * 0.1, 11.6, -19.4), (sx * 0.1, 11.6, -16.8)], (sx, 0, 0))
    hb.box('std:planeDark', 0, 0.0, 12.6, 0.4, 2.0, 0.6)  # nose gear
    hb.pop()


east_side = max(long_e, key=lambda e: e['n'][0])
west_side = min(long_e, key=lambda e: e['n'][0])
DC, LAT_C = 34.0, 8.0   # aircraft centre: out from the wall, along the wall from the rotunda
for e, stands, parked in ((east_side, (28.0, 78.0, 128.0, 178.0), (0, 1, 3)), (west_side, (52.0, 112.0, 172.0), (1,))):
    for k, s in enumerate(stands):
        door = (LAT_C - 2.0, DC - 14.3)
        if k not in parked:
            door = (3.0, 17.0)  # an empty stand: the bridge parked short
        jet_bridge(e, s, door)
        if k in parked:
            q = np.array(e['a']) + np.array(e['t']) * (s + LAT_C) + np.array(e['n']) * DC
            aircraft(float(q[0]), float(q[1]), math.atan2(-e['n'][0], -e['n'][1]))

# ------------------------------------------------------------------ the control tower and its oval base
tw = pk.building(4966.5, -2185.0, 3)
tb = pk.building(4958.6, -2172.6, 3)
TX, TZ = tw['cx'], tw['cz']
TG = min(gy(x, z) for x, z in tb['pts'])
BASEP = H.orient(H.simplify(tb['pts'], 0.15))
hb.ring('std:towerWhite', BASEP, TG - 0.5, TG + 0.9)
for e in H.edges(BASEP):
    hb.wall('cw:t2Band', e['a'], e['b'], TG + 0.9, TG + 3.4)
    hb.wall('std:towerWhite', e['a'], e['b'], TG + 3.4, TG + 4.6)
    hb.wall('cw:t2Band', e['a'], e['b'], TG + 4.6, TG + 7.1)
    hb.wall('std:towerWhite', e['a'], e['b'], TG + 7.1, TG + 8.6)
hb.cap('std:roofGrey', BASEP, TG + 8.6)
K.parapet(hb, BASEP, TG + 8.6, 0.6, 'std:towerWhite', w=0.25)
y = TG + 8.6
# shaft: a pale cylinder with four dark glazed slots
SH = 38.0
hb.cyl('std:towerGrey', TX, y, TZ, 3.9, TG + SH - y, segs=24)
for a in range(4):
    ang = math.pi / 4 + a * math.pi / 2
    x, z = TX + math.cos(ang) * 3.85, TZ - math.sin(ang) * 3.85
    hb.box('cw:t2Cab', x, y + 1.0, z, 1.3, TG + SH - y - 2.0, 0.25, yaw=ang - math.pi / 2)
for k in range(1, 9):
    hb.cyl('std:towerWhite', TX, y + k * (TG + SH - y) / 9, TZ, 3.95, 0.12, segs=24, top=False)
yb = TG + SH
hb.cyl('std:towerWhite', TX, yb, TZ, 5.4, 0.45, segs=28)
hb.cyl('cw:t2Cab', TX, yb + 0.45, TZ, 5.1, 2.4, segs=28, top=False)
for k in range(16):
    ang = 2 * math.pi * k / 16
    hb.box('std:mull', TX + math.cos(ang) * 5.12, yb + 0.45, TZ - math.sin(ang) * 5.12, 0.1, 2.4, 0.1)
yc = yb + 2.85
# the flared collar with grooves
hb.cyl('std:towerWhite', TX, yc, TZ, 5.6, 4.0, segs=32, r1=7.9)
for k in range(1, 4):
    rr = 5.6 + (7.9 - 5.6) * k / 4
    hb.cyl('std:t2Band', TX, yc + 4.0 * k / 4 - 0.06, TZ, rr + 0.03, 0.12, segs=32, top=False)
yd = yc + 4.0
hb.cyl('std:towerWhite', TX, yd, TZ, 7.9, 0.35, segs=32)
# the cab: glazing leaning out, mullions, roof with railing, masts, radar
hb.cyl('cw:t2Cab', TX, yd + 0.35, TZ, 6.9, 3.8, segs=32, r1=7.6, top=False)
for k in range(18):
    ang = 2 * math.pi * k / 18
    hb.beam('std:mull', (TX + math.cos(ang) * 6.95, yd + 0.35, TZ - math.sin(ang) * 6.95), (TX + math.cos(ang) * 7.65, yd + 4.15, TZ - math.sin(ang) * 7.65), 0.1, 0.1)
ye = yd + 4.15
hb.cyl('std:towerWhite', TX, ye, TZ, 7.9, 0.6, segs=32)
for k in range(24):
    ang = 2 * math.pi * k / 24
    hb.cyl('std:steel', TX + math.cos(ang) * 7.5, ye + 0.6, TZ - math.sin(ang) * 7.5, 0.03, 1.1, segs=4, top=False)
for k in range(24):
    a0, a1 = 2 * math.pi * k / 24, 2 * math.pi * (k + 1) / 24
    hb.beam('std:steel', (TX + math.cos(a0) * 7.5, ye + 1.7, TZ - math.sin(a0) * 7.5), (TX + math.cos(a1) * 7.5, ye + 1.7, TZ - math.sin(a1) * 7.5), 0.05, 0.05)
hb.cyl('std:towerWhite', TX, ye + 0.6, TZ, 3.0, 1.6, segs=16)
for (dx, dz, h) in ((1.2, 0.8, 7.0), (-1.5, -0.6, 5.0), (0.2, -1.8, 3.5)):
    hb.tube('std:steel', (TX + dx, ye + 2.2, TZ + dz), (TX + dx, ye + 2.2 + h, TZ + dz), 0.07, segs=6)
    hb.box('glow:red', TX + dx, ye + 2.2 + h, TZ + dz, 0.22, 0.22, 0.22)
hb.box('std:steel', TX + 4.6, ye + 0.6, TZ - 3.0, 0.3, 2.6, 0.3)
hb.box('std:towerWhite', TX + 4.6, ye + 3.2, TZ - 3.0, 2.8, 0.35, 0.55, yaw=0.6)

# ------------------------------------------------------------------ the car park in front: parapet, railing, roof plaza with the embroidery
cp = pk.building(5212.4, -2114.8, 3)
CPP = H.orient(H.simplify(cp['pts'], 0.3))
lo = min(gy(x, z) for x, z in CPP) - 0.4
ROOF = 1.15
hb.ring('std:beige', CPP, lo, ROOF + 1.1)
for e in H.edges(CPP):
    K.frame(hb, e)
    # open decks below the plaza where the ground falls away
    yy = ROOF - 3.0
    while yy > lo + 1.0:
        hb.face('std:plantDark', [(1.0, yy - 1.4, 0.03), (e['L'] - 1.0, yy - 1.4, 0.03), (e['L'] - 1.0, yy, 0.03), (1.0, yy, 0.03)])
        yy -= 3.0
    hb.pop()
    # railing on the parapet
    K.frame(hb, e)
    n = max(1, int(e['L'] / 1.6))
    for k in range(n + 1):
        hb.box('std:steel', k * e['L'] / n, ROOF + 1.1, -0.15, 0.05, 0.9, 0.05)
    hb.box('std:steel', e['L'] / 2, ROOF + 2.0, -0.15, e['L'], 0.06, 0.08)
    hb.box('std:steel', e['L'] / 2, ROOF + 1.55, -0.15, e['L'], 0.03, 0.03)
    hb.pop()
inner = H.offset(CPP, -0.35)
for e in H.edges(inner):
    hb.wall('std:beige', e['b'], e['a'], ROOF, ROOF + 1.1)
hb.cap('pn:paving', inner, ROOF)
# the embroidery: a square on the plaza
cpc = Polygon(CPP).centroid
ce = H.edges(CPP)
ax_ = max(ce, key=lambda e: e['L'])
tt = np.array(ax_['t']); nn = np.array([-tt[1], tt[0]])
S2 = 21.0
c = np.array([cpc.x, cpc.y])
sq = [c - tt * S2 - nn * S2, c + tt * S2 - nn * S2, c + tt * S2 + nn * S2, c - tt * S2 + nn * S2]
K.sface(hb, 'sign:shevitsa', [P3(q, ROOF + 0.03) for q in sq], (0, 1, 0))
# stair and lift pavilion (#8036) and lamp posts
pav = pk.building(5196.8, -2097.0, 3)
PAV = H.orient(pav['pts'])
for e in H.edges(PAV):
    hb.wall('glass:t2', e['a'], e['b'], ROOF, ROOF + 3.2)
hb.prism('std:steelDark', H.offset(PAV, 0.3), ROOF + 3.2, ROOF + 3.6)
for e in H.edges(PAV):
    K.frame(hb, e)
    for k in range(int(e['L'] / 1.8) + 1):
        hb.box('std:steelDark', k * e['L'] / max(1, int(e['L'] / 1.8)), ROOF, 0.0, 0.08, 3.2, 0.08)
    hb.pop()
for q in sq:
    p = c + (q - c) * 1.12
    hb.cyl('std:steelDark', float(p[0]), ROOF, float(p[1]), 0.09, 6.0, segs=6)
    hb.box('glow:led', float(p[0]), ROOF + 6.0, float(p[1]), 0.6, 0.15, 0.3)

# ------------------------------------------------------------------ the metro station (#8040): glass hall under a barrel roof
mt = pk.building(5263.1, -2156.0, 4)
MP = H.orient(H.simplify(mt['pts'], 0.3))
mg = min(gy(x, z) for x, z in MP)
for e in H.edges(MP):
    hb.wall('std:t2Band', e['a'], e['b'], mg - 0.4, mg + 0.6)
    hb.wall('cw:t2Glass', e['a'], e['b'], mg + 0.6, mg + 5.2)
    K.frame(hb, e)
    n = max(1, int(e['L'] / 2.5))
    for k in range(n + 1):
        hb.box('std:mull', k * e['L'] / n, mg + 0.6, 0.06, 0.12, 4.6, 0.14)
    hb.pop()
MPO = Polygon(MP)
mc = MPO.centroid
# barrel roof: slices across the long axis
me = max(H.edges(MP), key=lambda e: e['L'])
mt_ = np.array(me['t']); mn_ = np.array([-mt_[1], mt_[0]])
proj = [float(np.dot(np.array(p) - np.array([mc.x, mc.y]), mt_)) for p in MP]
a0_, a1_ = min(proj), max(proj)
nsl = int((a1_ - a0_) / 3.0)
prev = None
for k in range(nsl + 1):
    a = a0_ + (a1_ - a0_) * k / nsl
    base = np.array([mc.x, mc.y]) + mt_ * a
    ln = LineString([tuple(base - mn_ * 60), tuple(base + mn_ * 60)]).intersection(MPO.buffer(0.6))
    if ln.is_empty or ln.geom_type != 'LineString':
        prev = None
        continue
    p0, p1 = np.array(list(ln.coords)[0]), np.array(list(ln.coords)[-1])
    if np.dot(p1 - p0, mn_) < 0:
        p0, p1 = p1, p0
    w_ = np.linalg.norm(p1 - p0)
    arc = [P3(p0 + (p1 - p0) * (0.5 - 0.5 * math.cos(math.pi * f)), mg + 5.2 + w_ * 0.16 * math.sin(math.pi * f)) for f in np.linspace(0, 1, 9)]
    if prev is not None and len(prev) == len(arc):
        for j in range(len(arc) - 1):
            K.oface(hb, 'std:t2White', [prev[j], prev[j + 1], arc[j + 1], arc[j]], (0, 1, 0))
            K.oface(hb, 'std:t2White', [prev[j], prev[j + 1], arc[j + 1], arc[j]], (0, -1, 0))
    prev = arc
# the M sign on a post at the north end
nend = np.array([mc.x, mc.y]) + mt_ * (a0_ if np.dot(mt_, [0, -1]) > 0 else a1_)
nend = nend + (np.array([0, -1.0]) * 6.0)
hb.cyl('std:steelDark', float(nend[0]), mg, float(nend[1]), 0.12, 5.2, segs=8)
for sg in (-1, 1):
    K.sface(hb, 'sign:metroM', [P3(nend + np.array([sg * 0.75, 0.0]) * 1, mg + 5.2), P3(nend + np.array([-sg * 0.75, 0.0]), mg + 5.2), P3(nend + np.array([-sg * 0.75, 0.0]), mg + 6.7), P3(nend + np.array([sg * 0.75, 0.0]), mg + 6.7)], (0, 0, -sg))

# ------------------------------------------------------------------ build, bake, export
ob = hb.build()
if '--nobake' not in sys.argv:
    gr = H.add_ground(pk, hb, margin=30, step=6.0)
    H.lightmap_uv(ob)
    ao = H.bake_ao(ob, H.arg('--size', 2048, int), 4.0, H.arg('--samples', 40, int))
    H.save_ao(ao, NAME)
    H.export(ob, NAME, {'anchor': [AX, AZ], 'base': DATUM, 'source': 'tools/blender/hero/airport.py'})
if '--preview' in sys.argv:
    SP = os.environ.get('PREVIEW_DIR', '/tmp')
    if '--nobake' in sys.argv:
        H.add_ground(pk, hb, margin=60, step=6.0)
    rel = lambda x, y, z: (x - AX, y, z - AZ)
    cam = J + BIS * 95
    H.preview(f'{SP}/t2_front.jpg', rel(cam[0], 3.0, cam[1]), rel(J[0], 12, J[1]), lens=30)
    c2 = v0 + nE * 12 + uE * 6
    H.preview(f'{SP}/t2_curb.jpg', rel(c2[0], 1.7, c2[1]), rel(J[0] - 30, 16, J[1] + 10), lens=22)
    c3 = J + BIS * 260 + np.array([60.0, 0])
    H.preview(f'{SP}/t2_air.jpg', rel(c3[0], 140, c3[1]), rel(J[0] - 40, 0, J[1] - 90), lens=30)
