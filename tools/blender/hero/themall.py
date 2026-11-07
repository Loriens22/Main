# The Mall (Дъ Мол), бул. „Цариградско шосе“ 115 (opened 2010), across its car park from the boulevard and bus line
# 84 (stops 1194 / 1196 УМБАЛ „Св. Анна“, 2593 Хермес парк). On the OSM outlines of the world84 pack: the mall
# (#7419, with the glass entrance hall bulging out of the middle of the front), the office tower at its west
# corner (#7455) and the office towers along its south-east side (#7410-#7417, up to 48.6 m).
# Appearance from the photographs supplied by the user (the front from the car park, an older view, the entrance
# axis, an aerial view):
#   * a dark grey panelled box; on the wings a band of vertical colour stripes (blues, lilac, pink and red on the
#     left, reds, oranges and yellow on the right) over glazed shop fronts, a set-back terrace floor with
#     restaurant awnings and a glass balustrade on top;
#   * in the middle a glazed entrance hall under an arched glass roof with the mall's name (generic typeface) over a
#     bar of colour stripes, a glass canopy over the doors, potted trees along the walkway through the car park;
#   * grey sign fields beside the hall with the tenants' names as plain lettering (no logos), BILLA on a steel
#     lattice on the roof, the cinema's АРЕНА letters, the bank's name on the west tower;
#   * blue glass office towers.
# Storey heights (shop floor 4.8 m, stripe band 4.6 m, terrace floor 3.3 m, hall arch 17 m) are estimated from the
# photographs (cars and people for scale); the OSM heights of the mall (9.6 m) and the west tower (24.6 m) are
# lower than the photographs show.
#   blenv/bin/python tools/blender/hero/themall.py [--preview] [--samples 40] [--size 2048] [--nobake]
import math
import os
import random
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import herolib as H
import herokit as K
from shapely.geometry import Polygon, Point, LineString

NAME = 'themall'
pk = H.Pack('84')
H.reset()
MB = pk.building(2513.7, 969.2, 2)
DATUM = 59.05
AX, AZ = 2540.0, 950.0
hb = H.HB(NAME, (AX, AZ), DATUM)
rnd = random.Random(115)

hb.mat('pn:mallGrey', (0.30, 0.31, 0.33), 0.5, 0.3)
hb.mat('pn:mallGreyLight', (0.52, 0.53, 0.55), 0.5, 0.3)
hb.mat('cw:themallShop', (0.12, 0.16, 0.20), 0.08, 0.5)
hb.mat('cw:themallHall', (0.20, 0.30, 0.38), 0.06, 0.6)
hb.mat('cw:themallTerrace', (0.15, 0.20, 0.25), 0.08, 0.5)
hb.mat('cw:themallTower', (0.12, 0.25, 0.48), 0.05, 0.85)
hb.mat('cw:themallTower2', (0.16, 0.30, 0.42), 0.05, 0.85)
hb.mat('std:frame', (0.35, 0.36, 0.38), 0.4, 0.6)
hb.mat('std:mull', (0.55, 0.57, 0.6), 0.35, 0.7)
hb.mat('std:roof', (0.40, 0.40, 0.40), 0.9)
hb.mat('std:plant', (0.62, 0.64, 0.66), 0.5, 0.4)
hb.mat('std:plantDark', (0.2, 0.21, 0.22), 0.6, 0.3)
hb.mat('std:steel', (0.62, 0.64, 0.66), 0.35, 0.8)
hb.mat('std:steelDark', (0.14, 0.15, 0.16), 0.45, 0.6)
hb.mat('std:awning', (0.12, 0.12, 0.13), 0.7)
hb.mat('std:yellowBand', (0.95, 0.75, 0.10), 0.5)
hb.mat('std:pot', (0.08, 0.08, 0.09), 0.5)
hb.mat('std:leaves', (0.22, 0.40, 0.14), 0.9)
hb.mat('std:trunk', (0.30, 0.22, 0.15), 0.9)
hb.mat('glass:canopy', (0.6, 0.7, 0.72), 0.05)
hb.mat('glass:rail', (0.55, 0.65, 0.68), 0.05)
hb.mat('glass:door', (0.5, 0.6, 0.62), 0.05)
hb.mat('glow:yellow', (1.0, 0.78, 0.0), 0.4, emit=(1, 0.8, 0.1))
hb.mat('glow:red', (0.85, 0.05, 0.04), 0.4, emit=(1, 0.1, 0.05))
hb.mat('glow:white', (0.95, 0.95, 0.95), 0.4, emit=(1, 1, 1))
hb.mat('glow:orange', (0.98, 0.50, 0.08), 0.4, emit=(1, 0.55, 0.1))
hb.mat('glow:shopLight', (0.95, 0.95, 0.9), 0.4, emit=(1, 0.95, 0.85))
hb.mat('sign:themallBar', (0.8, 0.4, 0.6), 0.5)
hb.mat('sign:themallSignsL', (0.3, 0.3, 0.3), 0.5)
hb.mat('sign:themallSignsR', (0.3, 0.3, 0.3), 0.5)
hb.mat('sign:themallHallSigns', (0.3, 0.3, 0.3), 0.5)
hb.mat('sign:themallPoster1', (0.5, 0.4, 0.3), 0.5)
hb.mat('sign:themallPoster2', (0.6, 0.5, 0.3), 0.5)
for k, c in (('floor', (0.70, 0.68, 0.65)), ('wall', (0.86, 0.86, 0.84)), ('ceiling', (0.9, 0.9, 0.9)), ('wood', (0.45, 0.30, 0.18)),
             ('cloth1', (0.1, 0.1, 0.12)), ('cloth2', (0.75, 0.72, 0.66)), ('cloth3', (0.55, 0.12, 0.15)), ('cloth4', (0.2, 0.3, 0.5)),
             ('skin', (0.9, 0.88, 0.85)), ('chair', (0.15, 0.15, 0.15)), ('menu', (0.1, 0.25, 0.18)), ('white', (0.92, 0.92, 0.92)),
             ('prod1', (0.8, 0.2, 0.2)), ('prod2', (0.2, 0.5, 0.8)), ('prod3', (0.9, 0.8, 0.2)), ('prod4', (0.3, 0.7, 0.3)), ('prod5', (0.9, 0.9, 0.9)),
             ('shelf', (0.85, 0.85, 0.85)), ('checkout', (0.3, 0.3, 0.32))):
    hb.mat('int:' + k, c, 0.6)

# ------------------------------------------------------------------ the front frame: x from the west corner along the front, z out (SW)
A = np.array(MB['pts'][17]); Bv = np.array(MB['pts'][9])
T = (Bv - A) / np.linalg.norm(Bv - A)
N = np.array([T[1], -T[0]])
if N[1] < 0:
    N = -N
LF = float(np.linalg.norm(Bv - A))
YAW = math.atan2(N[0], N[1])
LX = float(np.dot(np.array([math.cos(YAW), -math.sin(YAW)]), T))   # +1 when the frame's x runs from A to B


def W(x, z):
    p = A + T * x + N * z
    return float(p[0]), float(p[1])


def gl(x, z):
    return pk.y(*W(x, z)) - DATUM


GF, SB, BAND, TER = 4.8, 9.4, 10.0, 13.3     # shop floor top, stripe band top, band top, terrace floor top (parapet)
HALL0, HALL1 = 45.9, 78.8                     # the entrance hall on the front (x)
SL0, SR1 = 31.5, 93.0                         # sign fields beside the hall
ARCH = 17.2
lo = min(pk.y(x, z) for x, z in MB['pts']) - DATUM - 0.6
hb.push(float(A[0]), 0, float(A[1]), YAW)
if LX < 0:
    raise SystemExit('front frame orientation')


def fface(mat, pts, out=(0, 0, 1), uv=None):
    K.oface(hb, mat, pts, out, uv=uv)


# ------------------------------------------------------------------ the wings
def stripes(x0, x1, palette, seed):
    r = random.Random(seed)
    x = x0 + 0.2
    k = 0
    n = len(palette)
    while x < x1 - 0.3:
        w = r.uniform(0.35, 1.15)
        f = (x - x0) / (x1 - x0)
        ci = min(n - 1, max(0, int(f * n + r.uniform(-0.8, 0.8))))
        col = palette[ci]
        hb.box(col, x + w / 2, GF + 0.35, 0.12, w, SB - GF - 0.7, 0.2)
        x += w + r.uniform(0.12, 0.45)
        k += 1


PAL_L = ['std:sBlue1', 'std:sBlue2', 'std:sBlue3', 'std:sBlue4', 'std:sLilac', 'std:sPink', 'std:sRose', 'std:sRed']
PAL_R = ['std:sRed', 'std:sRed2', 'std:sOrange', 'std:sOrange2', 'std:sYellow', 'std:sOrange']
for nm, c in (('sBlue1', (0.12, 0.30, 0.62)), ('sBlue2', (0.22, 0.45, 0.78)), ('sBlue3', (0.42, 0.62, 0.86)), ('sBlue4', (0.70, 0.80, 0.92)),
              ('sLilac', (0.75, 0.60, 0.78)), ('sPink', (0.90, 0.48, 0.62)), ('sRose', (0.88, 0.32, 0.40)), ('sRed', (0.80, 0.14, 0.15)),
              ('sRed2', (0.88, 0.26, 0.14)), ('sOrange', (0.95, 0.45, 0.14)), ('sOrange2', (0.97, 0.60, 0.15)), ('sYellow', (0.97, 0.76, 0.20))):
    hb.mat('std:' + nm, c, 0.45, 0.1)


def wing(x0, x1, palette, seed, kinds):
    L = x1 - x0
    # shop floor: glazing with rooms behind, piers, a dark band over it
    fface('pn:mallGrey', [(x0, lo, 0), (x1, lo, 0), (x1, 0.1, 0), (x0, 0.1, 0)])
    nb = max(1, round(L / 7.5))
    bw = L / nb
    for i in range(nb):
        a, b = x0 + i * bw, x0 + (i + 1) * bw
        fface('cw:themallShop', [(a, 0.1, -0.3), (b, 0.1, -0.3), (b, GF - 0.6, -0.3), (a, GF - 0.6, -0.3)], uv=[(a, 0.1), (b, 0.1), (b, GF - 0.6), (a, GF - 0.6)])
        hb.push(0, 0, -0.3, 0)
        K.shop_interior(hb, a + 0.4, b - 0.4, GF - 0.8, 6.0, kinds[i % len(kinds)], seed * 37 + i)
        hb.pop()
        hb.box('pn:mallGrey', a, 0.0, -0.15, 0.6, GF, 0.5)
        if i % 3 == 1:
            K.door_set(hb, (a + b) / 2, 2.4, 2.6, frame_mat='std:steelDark', glass='glass:door', z=-0.25)
    hb.box('pn:mallGrey', x1, 0.0, -0.15, 0.6, GF, 0.5)
    fface('pn:mallGrey', [(x0, GF - 0.6, 0), (x1, GF - 0.6, 0), (x1, BAND, 0), (x0, BAND, 0)])
    K.oface(hb, 'pn:mallGrey', [(x0, GF - 0.6, 0), (x1, GF - 0.6, 0), (x1, GF - 0.6, -0.3), (x0, GF - 0.6, -0.3)], (0, -1, 0))
    stripes(x0, x1, palette, seed)
    hb.box('pn:mallGreyLight', (x0 + x1) / 2, SB, 0.15, L, BAND - SB, 0.3)
    # terrace floor, set back, with awnings and the glass balustrade at the edge
    R = 2.6
    K.oface(hb, 'std:roof', [(x0, BAND, 0), (x1, BAND, 0), (x1, BAND, -R), (x0, BAND, -R)], (0, 1, 0))
    fface('cw:themallTerrace', [(x0, BAND, -R), (x1, BAND, -R), (x1, TER - 0.6, -R), (x0, TER - 0.6, -R)], uv=[(x0, 0), (x1, 0), (x1, TER - 0.6 - BAND), (x0, TER - 0.6 - BAND)])
    fface('pn:mallGrey', [(x0, TER - 0.6, -R), (x1, TER - 0.6, -R), (x1, TER, -R), (x0, TER, -R)])
    hb.box('pn:mallGrey', (x0 + x1) / 2, TER, -R / 2 + 0.3, L, 0.5, R + 0.6, bottom=True)
    fface('glass:rail', [(x0, BAND, 0.25), (x1, BAND, 0.25), (x1, BAND + 1.05, 0.25), (x0, BAND + 1.05, 0.25)])
    hb.box('std:steel', (x0 + x1) / 2, BAND + 1.05, 0.25, L, 0.05, 0.08)
    x = x0 + 1.0
    while x < x1 - 3.0:
        w = rnd.uniform(3.0, 5.0)
        K.oface(hb, 'std:awning', [(x, TER - 0.9, -R + 0.05), (x + w, TER - 0.9, -R + 0.05), (x + w, TER - 1.6, -R + 1.6), (x, TER - 1.6, -R + 1.6)], (0, 0.6, 1))
        x += w + rnd.uniform(0.3, 1.2)


wing(0.0, SL0 - 1.8, PAL_L, 1, ('fashion', 'fashion', 'cafe'))
wing(SR1 + 1.8, LF, PAL_R, 2, ('fashion', 'tech', 'market'))
# the glazed stair strips at the inner ends of the wings
for (a, b) in ((SL0 - 1.8, SL0), (SR1, SR1 + 1.8)):
    fface('cw:themallTerrace', [(a, 0.1, -0.1), (b, 0.1, -0.1), (b, TER, -0.1), (a, TER, -0.1)], uv=[(a, 0), (b, 0), (b, TER), (a, TER)])
    for y in np.arange(0.1, TER, 1.5):
        hb.box('std:mull', (a + b) / 2, y, -0.05, b - a, 0.06, 0.1)

# ------------------------------------------------------------------ the sign fields beside the hall
for (a, b, mat) in ((SL0, HALL0, 'sign:themallSignsL'), (HALL1, SR1, 'sign:themallSignsR')):
    fface('pn:mallGrey', [(a, lo, 0), (b, lo, 0), (b, TER + 0.5, 0), (a, TER + 0.5, 0)])
    K.sface(hb, mat, [(a + 0.4, 5.2, 0.08), (b - 0.4, 5.2, 0.08), (b - 0.4, 12.6, 0.08), (a + 0.4, 12.6, 0.08)], (0, 0, 1))
    # louvred panel at the top, shop glazing below with entrances
    fface('cw:themallShop', [(a + 0.5, 0.1, 0.02), (b - 0.5, 0.1, 0.02), (b - 0.5, 4.4, 0.02), (a + 0.5, 4.4, 0.02)], uv=[(a, 0), (b, 0), (b, 4.3), (a, 4.3)])
    K.door_set(hb, (a + b) / 2, 3.0, 2.8, frame_mat='std:steelDark', glass='glass:door', z=0.06)
# big posters at the outer ends of the shop floor
K.sface(hb, 'sign:themallPoster1', [(1.5, 0.6, 0.35), (9.0, 0.6, 0.35), (9.0, 7.0, 0.35), (1.5, 7.0, 0.35)], (0, 0, 1))
hb.box('std:frame', 5.25, 0.5, 0.25, 7.8, 6.7, 0.2)
K.sface(hb, 'sign:themallPoster2', [(LF - 9.0, 0.6, 0.35), (LF - 1.5, 0.6, 0.35), (LF - 1.5, 7.0, 0.35), (LF - 9.0, 7.0, 0.35)], (0, 0, 1))
hb.box('std:frame', LF - 5.25, 0.5, 0.25, 7.8, 6.7, 0.2)

# ------------------------------------------------------------------ the entrance hall: glazed front, arched glass roof, canopy
HW = HALL1 - HALL0
HC = (HALL0 + HALL1) / 2
fface('cw:themallHall', [(HALL0, 4.6, -1.0), (HALL1, 4.6, -1.0), (HALL1, TER + 0.5, -1.0), (HALL0, TER + 0.5, -1.0)], uv=[(HALL0, 0), (HALL1, 0), (HALL1, TER - 4.1), (HALL0, TER - 4.1)])
for k in range(int(HW / 2.4) + 1):
    x = HALL0 + k * HW / int(HW / 2.4)
    hb.box('std:mull', x, 4.6, -0.95, 0.12, TER + 0.5 - 4.6, 0.2)
for y in (SB, BAND + 0.2):
    hb.box('pn:mallGreyLight', HC, y - 0.35, -0.6, HW, 0.4, 0.9)          # the floor slabs inside the glass
    hb.box('glass:rail', HC, y + 0.05, -0.5, HW, 1.0, 0.04)
hb.face('glow:shopLight', [(HALL0 + 1, BAND - 0.4, -6.0), (HALL1 - 1, BAND - 0.4, -6.0), (HALL1 - 1, BAND - 0.4, -1.2), (HALL0 + 1, BAND - 0.4, -1.2)][::-1])
hb.face('int:wall', [(HALL0, 0, -18.0), (HALL1, 0, -18.0), (HALL1, ARCH, -18.0), (HALL0, ARCH, -18.0)])
# the arch: glazed lunette over the front, a heavy grey rim, the barrel roof running back
NA = 16
arc = []
for k in range(NA + 1):
    f = k / NA
    x = HALL0 - 0.6 + (HW + 1.2) * f
    y = TER + 0.5 + (ARCH - TER - 0.5) * math.sin(math.pi * f) ** 0.8
    arc.append((x, y))
for k in range(NA):
    (xa, ya), (xb, yb) = arc[k], arc[k + 1]
    fface('cw:themallHall', [(xa, TER + 0.5, -1.0), (xb, TER + 0.5, -1.0), (xb, yb - 0.3, -1.0), (xa, ya - 0.3, -1.0)],
          uv=[(xa, TER - 4.1), (xb, TER - 4.1), (xb, yb - 4.9), (xa, ya - 4.9)])
    hb.beam('std:frame', (xa, ya, -0.4), (xb, yb, -0.4), 0.9, 0.7)
DEP = 34.0
for k in range(NA):
    (xa, ya), (xb, yb) = arc[k], arc[k + 1]
    mat = 'glass:canopy' if 4 <= k < NA - 4 else 'std:roof'
    K.oface(hb, mat, [(xa, ya, -1.0), (xb, yb, -1.0), (xb, yb, -DEP), (xa, ya, -DEP)], (0, 1, 0))
for z in np.arange(-3.0, -DEP, -4.0):
    for k in range(NA):
        (xa, ya), (xb, yb) = arc[k], arc[k + 1]
        hb.beam('std:steel', (xa, ya + 0.15, z), (xb, yb + 0.15, z), 0.18, 0.25)
for (x0, x1) in ((HALL0 - 0.6, HALL0), (HALL1, HALL1 + 0.6)):
    fface('pn:mallGrey', [(x0, TER + 0.5, -1.0), (x1, TER + 0.5, -1.0), (x1, TER + 0.5, -DEP), (x0, TER + 0.5, -DEP)], (0, 1, 0))
# mullions on the lunette
for k in range(1, 8):
    x = HALL0 + k * HW / 8
    f = (x - (HALL0 - 0.6)) / (HW + 1.2)
    yt = TER + 0.5 + (ARCH - TER - 0.5) * math.sin(math.pi * f) ** 0.8 - 0.3
    hb.box('std:mull', x, TER + 0.5, -0.95, 0.1, yt - TER - 0.5, 0.15)
# the mall's name over the stripe bar, the band of tenants' names on the hall front
K.text3d(hb, 'glow:white', 'the', HC - 5.0, TER + 3.0, -0.7, 0.85, 0.12)
K.text3d(hb, 'glow:orange', 'Mall', HC + 0.5, TER - 0.25, -0.7, 3.2, 0.3, width=11.5)
K.sface(hb, 'sign:themallBar', [(HC - 5.8, TER - 1.45, -0.68), (HC + 5.8, TER - 1.45, -0.68), (HC + 5.8, TER - 0.4, -0.68), (HC - 5.8, TER - 0.4, -0.68)], (0, 0, 1))
K.sface(hb, 'sign:themallHallSigns', [(HALL0 + 0.6, BAND - 0.6, -0.5), (HALL1 - 0.6, BAND - 0.6, -0.5), (HALL1 - 0.6, BAND + 0.5, -0.5), (HALL0 + 0.6, BAND + 0.5, -0.5)], (0, 0, 1))
# the ground floor of the hall: the glass entrance pavilion along the OSM bulge, revolving doors
bulge = [np.array(MB['pts'][i]) for i in range(10, 17)]
bl = [(float(np.dot(p - A, T)), float(np.dot(p - A, N))) for p in bulge]
bl = sorted(bl, key=lambda q: q[0])
CAN_H = 4.6
for k in range(len(bl) - 1):
    (xa, za), (xb, zb) = bl[k], bl[k + 1]
    za, zb = max(za, 0.0), max(zb, 0.0)
    fface('glass:canopy', [(xa, 0.1, za), (xb, 0.1, zb), (xb, CAN_H, zb), (xa, CAN_H, za)])
    hb.box('std:steelDark', xa, 0.1, za, 0.12, CAN_H, 0.12)
    K.oface(hb, 'glass:canopy', [(xa, CAN_H, za), (xb, CAN_H, zb), (xb, CAN_H, -1.0), (xa, CAN_H, -1.0)], (0, 1, 0))
    hb.beam('std:steelDark', (xa, CAN_H, za), (xb, CAN_H, zb), 0.2, 0.3)
fface('cw:themallShop', [(HALL0, 0.1, -1.0), (HALL1, 0.1, -1.0), (HALL1, 4.6, -1.0), (HALL0, 4.6, -1.0)], uv=[(HALL0, 0), (HALL1, 0), (HALL1, 4.5), (HALL0, 4.5)])
for x in (HC - 6.0, HC + 6.0):
    hb.cyl('glass:door', x, 0.1, 2.0, 1.6, 2.6, segs=14, top=False)
    hb.cyl('std:steelDark', x, 2.7, 2.0, 1.75, 0.3, segs=14)
K.door_set(hb, HC, 3.6, 2.8, frame_mat='std:steelDark', glass='glass:door', z=max(bl, key=lambda q: q[1])[1] - 0.05)

# ------------------------------------------------------------------ the potted trees along the walkway through the car park
for k in range(14):
    z = 12.0 + k * 4.6
    for sx in (-3.6, 3.6):
        x = HC + sx
        g = gl(x, z)
        hb.cyl('std:pot', x, g, z, 0.55, 0.85, segs=10)
        hb.cyl('std:trunk', x, g + 0.85, z, 0.07, 2.2, segs=5, top=False)
        for j in range(3):
            hb.sphere('std:leaves', (x + math.cos(j * 2.1) * 0.5, g + 3.3 + j * 0.25, z + math.sin(j * 2.1) * 0.5), 0.85 - j * 0.12, segs=8, rings=5)
hb.pop()

# ------------------------------------------------------------------ the rest of the mall box, its roof, the rooftop signs
body = Polygon(MB['pts'])
# the block protruding into the car park at the south corner (under the tallest towers): x > 138, out of the front line
south = body.intersection(Polygon([W(138.0, -0.5), W(400.0, -0.5), W(400.0, 200.0), W(138.0, 200.0)]))
if south.geom_type != 'Polygon':
    south = max(south.geoms, key=lambda g: g.area)
MALLP = body.difference(south.buffer(0.5))
if MALLP.geom_type != 'Polygon':
    MALLP = max(MALLP.geoms, key=lambda g: g.area)
MP = H.orient(H.simplify(list(MALLP.exterior.coords)[:-1], 0.4))
FL = LineString([tuple(A - T * 2), tuple(Bv + T * 2)])
for e in H.edges(MP):
    mid = Point(e['a'][0] + e['t'][0] * e['L'] / 2, e['a'][1] + e['t'][1] * e['L'] / 2)
    if FL.distance(mid) < 1.5 and abs(e['n'][0] * N[0] + e['n'][1] * N[1]) > 0.9:
        continue   # the modelled front
    if abs(float(np.dot(np.array(mid.coords[0]) - A, N))) < 8.5 and HALL0 - 1 < float(np.dot(np.array(mid.coords[0]) - A, T)) < HALL1 + 1:
        continue   # the bulge
    hb.wall('pn:mallGrey', e['a'], e['b'], lo, TER)
    if e['L'] > 20:
        K.frame(hb, e)
        hb.box('pn:mallGreyLight', e['L'] / 2, TER - 1.2, 0.1, e['L'], 0.8, 0.2)
        for k in range(int(e['L'] / 40)):
            K.door_set(hb, 20 + k * 40, 3.2, 3.2, frame_mat='std:steelDark', glass='glass:door', z=0.06)
        hb.pop()
hb.cap('std:roof', MP, TER)
K.parapet(hb, MP, TER, 0.6, 'pn:mallGrey', w=0.3)
K.roof_plant(hb, MP, TER, 14, 23, inset=8.0, maxw=7.0)
# BILLA on a steel lattice over the right wing, АРЕНА on its parapet, the bank's name by the west tower
hb.push(float(A[0]), 0, float(A[1]), YAW)
bx = SR1 + 24.0
for k in range(6):
    x = bx - 7.5 + k * 3.0
    hb.box('std:steel', x, TER, -12.0, 0.2, 6.0, 0.2)
    hb.beam('std:steel', (x, TER, -15.0), (x, TER + 6.0, -12.0), 0.15, 0.15)
    hb.beam('std:steel', (x, TER, -9.0), (x, TER + 6.0, -12.0), 0.15, 0.15)
hb.box('std:steel', bx, TER + 6.0, -12.0, 16.0, 0.3, 0.3)
K.text3d(hb, 'glow:yellow', 'BILLA', bx, TER + 6.3, -12.0, 3.2, 0.5, width=15.0, back=True)
K.text3d(hb, 'glow:red', 'АРЕНА', LF - 12.0, TER - 1.6, -2.3, 1.25, 0.2, width=12.0)
K.text3d(hb, 'glow:white', 'банка ДСК', 18.0, TER + 0.7, -0.3, 1.0, 0.18, width=10.0)
hb.pop()

# ------------------------------------------------------------------ the office towers
def tower(b, y0, y1, preset, band=None, floor=3.6):
    pts = H.orient(H.simplify(b['pts'], 0.3))
    K.curtain(hb, pts, y0, y1, preset, 'std:mull', bay=1.5, floor=floor, depth=0.18)
    hb.cap('std:roof', pts, y1)
    K.parapet(hb, pts, y1, 0.9, 'std:frame', w=0.3)
    if band:
        hb.ring(band, H.offset(pts, 0.05), y0, y0 + 1.0)
    return pts


W7455 = pk.building(2458.2, 904.6, 2)
pw = tower(W7455, TER, 31.0, 'cw:themallTower', band='std:yellowBand')
K.roof_plant(hb, pw, 31.0, 3, 41, inset=3.0, maxw=4.0)
for (cx, cz, h0, h1, preset) in ((2645.6, 905.2, TER, 21.6, 'cw:themallTower2'), (2606.3, 946.1, TER, 21.6, 'cw:themallTower2'),
                                 (2567.8, 987.1, TER, 27.6, 'cw:themallTower'), (2529.0, 1027.4, 0.0, 33.5, 'cw:themallTower')):
    bb = pk.building(cx, cz, 2)
    g0 = h0 if h0 > 0 else lo
    pts = tower(bb, g0, h1, preset)
    K.roof_plant(hb, pts, h1, 2, int(cx) % 17, inset=3.0, maxw=4.0)
for (cx, cz, h0, h1) in ((2606.3, 946.1, 21.6, 24.6), (2529.0, 1027.4, 33.5, 39.6)):
    parts = [b for b in pk.buildings if abs(b['cx'] - cx) < 1.5 and abs(b['cz'] - cz) < 1.5 and b['minH'] > 0]
    for bb in parts:
        tower(bb, h0, h1, 'cw:themallTower')
t17 = pk.building(2520.0, 1035.3, 2)
pts17 = tower(t17, lo, 48.6, 'cw:themallTower')
c17 = H.centroid(pts17)
hb.tube('std:steel', (c17[0], 49.5, c17[1]), (c17[0], 55.0, c17[1]), 0.1, segs=6)
# the south-corner block under the towers: shop glazing and grey cladding
SP_ = H.orient(H.simplify(list(south.exterior.coords)[:-1], 0.3))
for e in H.edges(SP_):
    K.frame(hb, e)
    hb.face('cw:themallShop', [(0, 0.1, 0.02), (e['L'], 0.1, 0.02), (e['L'], GF, 0.02), (0, GF, 0.02)])
    hb.face('pn:mallGrey', [(0, lo, 0), (e['L'], lo, 0), (e['L'], 0.1, 0), (0, 0.1, 0)])
    hb.pop()

# ------------------------------------------------------------------ build, bake, export
ob = hb.build()
if '--nobake' not in sys.argv:
    H.add_ground(pk, hb, margin=25, step=5.0)
    H.lightmap_uv(ob)
    ao = H.bake_ao(ob, H.arg('--size', 2048, int), 4.0, H.arg('--samples', 40, int))
    H.save_ao(ao, NAME)
    H.export(ob, NAME, {'anchor': [AX, AZ], 'base': DATUM, 'source': 'tools/blender/hero/themall.py'})
if '--preview' in sys.argv:
    SP = os.environ.get('PREVIEW_DIR', '/tmp')
    if '--nobake' in sys.argv:
        H.add_ground(pk, hb, margin=80, step=5.0)
    rel = lambda x, y, z: (x - AX, y, z - AZ)
    c13 = W(HC, 115.0); t13 = W(HC, 0.0)
    H.preview(f'{SP}/themall_front.jpg', rel(c13[0], 14.0, c13[1]), rel(t13[0], 9.0, t13[1]), lens=22)
    c15 = W(HC, 75.0)
    H.preview(f'{SP}/themall_axis.jpg', rel(c15[0], 9.0, c15[1]), rel(t13[0], 8.0, t13[1]), lens=26)
    c16 = W(HC - 30, 110.0)
    H.preview(f'{SP}/themall_air.jpg', rel(c16[0], 45.0, c16[1]), rel(t13[0] + 10, 5.0, t13[1]), lens=24)
