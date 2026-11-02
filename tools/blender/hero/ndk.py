# Национален дворец на културата (НДК), 1978-1981 (Alexander Barov and team; surroundings Atanas Agura): the
# palace and the north half of its park down to бул. „Ген. Скобелев“ and beyond, along the fountain axis.
# Massing from the OSM building parts (world7 pack): the main body (an elongated octagon, 40 m to the roof
# terrace), the south block, the east and west wings and the two terraces flanking the north entrance. The
# fountain basins are the OSM water areas.
# Appearance from the user's photographs (aerial and night views, a rendering of the renovated building):
#   * white stone towers at the turns of the octagon; between them dark bronze curtain walls with tall white
#     fins hanging from the top band, their lower ends stepped; a white ledge band over the ground floor;
#   * on the north face the white square panel with the dark bronze sun (Georgi Chapkanov);
#   * above the top band the roof terrace and the recessed upper storey of dark glass under a dark cornice,
#     white vaulted skylights on the terrace, the green copper roofs of the halls and two stage towers;
#   * the stepped terraces round the base with white parapets and planting; in front the octagonal fountain
#     court, the flags; to the north the long cascade: a water channel with paired jets lit from below,
#     herringbone stone edges, dark planting beds, wide paved walks with orange globe lamps.
# Storey heights, the fin rhythm and the roof shapes are estimated from the photographs.
import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import herolib as H
import herokit as K
from shapely.geometry import Polygon, Point
from shapely.ops import unary_union

NAME = 'ndk'
pk = H.Pack('7')
H.reset()


def fp(x, z, tol=0.3):
    return H.orient(H.simplify(pk.building(x, z, 3)['pts'], tol))


MAIN = fp(-2711.3, -1760.0)
SOUTH = fp(-2717.7, -1696.6)
TERR_W = fp(-2748.1, -1817.0, 0.6)
TERR_E = fp(-2655.8, -1805.3, 0.6)
WING_W = fp(-2767.9, -1729.3)
WING_E = fp(-2662.1, -1711.0)
from shapely.geometry import LineString
CARRIAGEWAYS = unary_union([LineString(r['pts']).buffer(r['w'] / 2 + 1.0) for r in pk.roads
                            if r['cls'] not in ('footway', 'pedestrian', 'path', 'steps', 'cycleway') and len(r['pts']) > 1
                            and any(-2800 < x < -2600 and -2150 < z < -1800 for x, z in r['pts'])])
WATER = []
for a in pk.areas:
    if a['type'] == 'water':
        c = H.centroid(H.orient(a['pts']))
        # the fountain basins; not the one round the crossing of Скобелев (it would sit on the carriageway)
        if -2730 < c[0] < -2650 and -2100 < c[1] < -1840 and not Polygon(a['pts']).buffer(0).intersects(CARRIAGEWAYS):
            WATER.append(H.orient(a['pts']))

DATUM = 42.0
LEDGE = 7.0     # top of the ground floor; the white ledge band 7.0 .. 8.6
TOPB = 31.5     # top band the fins hang from (31.5 .. 33.5)
TERRACE = 33.5  # roof terrace
DRUM = 37.6     # upper storey under the cornice
CORNICE = 38.9
PARTS = [MAIN, SOUTH, TERR_W, TERR_E, WING_W, WING_E]
U = unary_union([Polygon(p).buffer(0.05) for p in PARTS])
cx, cz = H.centroid(MAIN)
hb = H.HB(NAME, (cx, cz), DATUM)
rnd = random.Random(1981)

hb.mat('pn:ndkStone', (0.88, 0.86, 0.82), 0.6)
hb.mat('cw:ndkBronze', (0.16, 0.13, 0.10), 0.08, 0.5)
hb.mat('cw:ndkLobby', (0.2, 0.17, 0.13), 0.08, 0.4)
hb.mat('cw:ndkDrum', (0.15, 0.13, 0.11), 0.06, 0.5)
hb.mat('cw:ndkRibbon', (0.18, 0.16, 0.13), 0.1, 0.4)
hb.mat('std:white', (0.9, 0.89, 0.86), 0.5)
hb.mat('lit:fin', (0.92, 0.91, 0.88), 0.45)
hb.mat('std:cornice', (0.22, 0.17, 0.13), 0.5, 0.3)
hb.mat('std:copper', (0.27, 0.43, 0.36), 0.55, 0.3)
hb.mat('std:bronze', (0.18, 0.13, 0.09), 0.35, 0.8)
hb.mat('std:roof', (0.62, 0.61, 0.58), 0.9)
hb.mat('std:paving', (0.74, 0.72, 0.68), 0.85)
hb.mat('std:pavingDark', (0.42, 0.40, 0.38), 0.85)
hb.mat('lit:pool', (0.42, 0.52, 0.50), 0.6)
hb.mat('std:herring', (0.80, 0.76, 0.72), 0.7)
hb.mat('std:herringDark', (0.36, 0.33, 0.31), 0.7)
hb.mat('std:bed', (0.12, 0.10, 0.08), 0.95)
hb.mat('std:hedge', (0.18, 0.32, 0.12), 0.95)
hb.mat('std:planter', (0.85, 0.84, 0.80), 0.6)
hb.mat('std:steel', (0.55, 0.57, 0.6), 0.4, 0.7)
hb.mat('std:steelDark', (0.12, 0.13, 0.14), 0.45, 0.6)
hb.mat('std:screen', (0.08, 0.08, 0.09), 0.4)
hb.mat('water', (0.35, 0.55, 0.6), 0.05)
hb.mat('glass:jet', (0.95, 0.98, 1.0), 0.05)
hb.mat('glass:door', (0.5, 0.6, 0.62), 0.05)
hb.mat('glow:jet', (0.85, 0.95, 0.9), 0.3, emit=(0.8, 1, 0.9))
hb.mat('glow:globe', (0.95, 0.85, 0.65), 0.3, emit=(1, 0.75, 0.4))
hb.mat('glow:uplight', (0.95, 0.95, 0.9), 0.3, emit=(1, 1, 0.95))
hb.mat('glow:led', (0.9, 0.9, 0.85), 0.3, emit=(1, 0.95, 0.8))
hb.mat('glow:white', (0.95, 0.95, 0.95), 0.4, emit=(1, 1, 1))
hb.mat('glow:shopLight', (0.95, 0.95, 0.9), 0.4, emit=(1, 0.95, 0.85))
hb.mat('glow:pendant', (0.95, 0.85, 0.6), 0.4, emit=(1, 0.8, 0.5))
hb.mat('sign:ndkScreen', (0.2, 0.2, 0.3), 0.4)
for f in ('flagBG', 'flagEU', 'flagSofia'):
    hb.mat('sign:' + f, (0.6, 0.6, 0.6), 0.6)
for k, c in (('floor', (0.66, 0.62, 0.56)), ('wall', (0.86, 0.83, 0.78)), ('ceiling', (0.88, 0.87, 0.84)), ('wood', (0.42, 0.28, 0.17)),
             ('chair', (0.2, 0.15, 0.12)), ('menu', (0.1, 0.1, 0.12)), ('white', (0.92, 0.92, 0.92))):
    hb.mat('int:' + k, c, 0.6)


def gy(x, z):
    return pk.y(x, z) - DATUM


def runs(e, d=1.0, step=1.0, minlen=2.0, shape=U):
    out, cur = [], None
    n = max(2, int(e['L'] / step) + 1)
    for k in range(n):
        s = e['L'] * k / (n - 1)
        q = Point(e['a'][0] + e['t'][0] * s + e['n'][0] * d, e['a'][1] + e['t'][1] * s + e['n'][1] * d)
        if not shape.contains(q):
            cur = [s, s] if cur is None else [cur[0], s]
        elif cur is not None:
            out.append(cur); cur = None
    if cur is not None:
        out.append(cur)
    return [(max(0.0, a - 0.5), min(e['L'], b + 0.5)) for a, b in out if b - a >= minlen]


def lo_of(pts):
    return min(gy(*p) for p in pts) - 0.6


# ------------------------------------------------------------------ the main body
E = H.edges(MAIN)
north = max(E, key=lambda e: -e['n'][1] if e['L'] > 20 else -9)   # the entrance face
ADJ = [(SOUTH, 12.5), (WING_W, 10.5), (WING_E, 10.5), (TERR_W, 4.0), (TERR_E, 4.0)]


def adj_height(e):
    """Height of the annex or terrace standing against edge e (0 = open), from samples along it."""
    hs = []
    for k in range(max(2, int(e['L'] / 2))):
        s = e['L'] * (k + 0.5) / max(2, int(e['L'] / 2))
        q = Point(e['a'][0] + e['t'][0] * s + e['n'][0] * 1.0, e['a'][1] + e['t'][1] * s + e['n'][1] * 1.0)
        hs.append(next((h for P, h in ADJ if Polygon(P).contains(q)), 0.0))
    hs.sort()
    return hs[len(hs) // 2]


low = {e['i']: adj_height(e) for e in E}  # per edge: height of what stands in front of it
hb.ring('pn:ndkStone', MAIN, lo_of(MAIN), 0.3)
for e in E:
    y0 = low[e['i']]
    L = e['L']
    K.frame(hb, e)
    if y0 < 5.0:
        # ground floor (on the terraces: from the terrace up): dark glazing recessed behind the ledge band
        g0 = max(0.3, y0)
        hb.face('cw:ndkLobby', [(0, g0, -1.5), (L, g0, -1.5), (L, LEDGE, -1.5), (0, LEDGE, -1.5)])
        hb.soffit('std:white', 0, L, LEDGE, -1.5, 0)
        if e['i'] == north['i']:
            hb.face('glass:door', [(4, 0.3, -1.45), (L - 4, 0.3, -1.45), (L - 4, LEDGE - 0.4, -1.45), (4, LEDGE - 0.4, -1.45)])
            hb.push(0, 0, -1.5, 0)
            K.shop_interior(hb, 4.2, L - 4.2, LEDGE - 0.6, 9.0, 'cafe', 7)
            for k in range(4):
                K.door_set(hb, L / 2 + (k - 1.5) * 3.4, 2.6, 2.9, z=0.06)
            hb.pop()
        # the white ledge band, proud of the facade
        hb.box('pn:ndkStone', L / 2, LEDGE, 1.0, L, 1.6, 2.6, bottom=True)
    # bronze curtain wall up to the top band
    yb = max(y0, LEDGE + 1.6) if y0 < 5.0 else y0
    hb.face('cw:ndkBronze', [(0, yb, 0), (L, yb, 0), (L, TOPB, 0), (0, TOPB, 0)])
    hb.box('pn:ndkStone', L / 2, TOPB, 0.4, L, TERRACE - TOPB, 0.8, bottom=True)
    if e['i'] == north['i']:
        # the white square panel with the sun, high in the middle of the north face
        pw = min(11.0, L * 0.38)
        hb.box('pn:ndkStone', L / 2, TOPB - pw - 1.0, 0.6, pw, pw + 1.0, 1.2, bottom=True)
        sy = TOPB - pw / 2 - 0.9
        hb.push(L / 2, sy, 1.2, 0)
        R0, R1, NR = pw * 0.17, pw * 0.42, 28
        for k in range(NR):  # rays
            a0 = 2 * math.pi * k / NR
            a1 = a0 + 2 * math.pi / NR * 0.42
            r1 = R1 * (1.0 if k % 2 == 0 else 0.82)
            p0 = (math.cos(a0) * R0, math.sin(a0) * R0, 0.25)
            p1 = (math.cos(a1) * R0, math.sin(a1) * R0, 0.25)
            pt = (math.cos((a0 + a1) / 2) * r1, math.sin((a0 + a1) / 2) * r1, 0.1)
            hb.face('std:bronze', [p0, pt, p1])
            for qa, qb in ((p0, pt), (pt, p1)):  # the ray's edges, both ways (thin)
                side = [(qa[0], qa[1], 0.0), (qb[0], qb[1], 0.0), qb, qa]
                hb.face('std:bronze', side)
                hb.face('std:bronze', side[::-1])
        ring = [(math.cos(2 * math.pi * k / 24) * R0, math.sin(2 * math.pi * k / 24) * R0) for k in range(24)]
        hb.face('std:bronze', [(x, y, 0.45) for x, y in ring])
        for k in range(24):
            a, b = ring[k], ring[(k + 1) % 24]
            hb.face('std:bronze', [(a[0], a[1], 0.0), (b[0], b[1], 0.0), (b[0], b[1], 0.45), (a[0], a[1], 0.45)])
        hb.pop()
        # the screen and the name over the ledge, the cafe sign
        K.text3d(hb, 'glow:white', 'COSTA COFFEE', L * 0.25, LEDGE + 0.35, 2.32, 0.55, 0.06)
    else:
        # white fins hanging from the top band, their lower ends stepped
        nf = max(2, int((L - 8.0) / 3.0))
        for k in range(nf):
            s = 4.0 + (L - 8.0) * (k + 0.5) / nf
            t = abs((k + 0.5) / nf - 0.5) * 2  # 0 in the middle, 1 at the ends
            bot = max(yb + 0.5, TOPB - 13.0 - 9.0 * t + (k % 2) * 1.2)
            hb.box('lit:fin', s, bot, 0.55, 1.5, TOPB - bot, 1.1, bottom=True)
            hb.face('glow:uplight', [(s - 0.5, bot - 0.02, 0.2), (s + 0.5, bot - 0.02, 0.2), (s + 0.5, bot - 0.02, 0.9), (s - 0.5, bot - 0.02, 0.9)])
    hb.pop()
    K.mullions(hb, e, yb, TOPB, 1.8, 'std:cornice', depth=0.1, w=0.07, rows=[yb + k * 4.6 for k in range(1, 6)])

# stone towers at the turns of the octagon (where both faces are open)
for i, e in enumerate(E):
    prev = E[i - 1]
    if low[e['i']] > 0 and low[prev['i']] > 0:
        continue
    vx, vz = e['a']
    bx, bz = e['n'][0] + prev['n'][0], e['n'][1] + prev['n'][1]
    bl = math.hypot(bx, bz) or 1
    yaw = math.atan2(bx / bl, bz / bl)
    hb.push(vx + bx / bl * 1.2, 0, vz + bz / bl * 1.2, yaw)
    hb.box('pn:ndkStone', 0, lo_of([(vx, vz)]) + 0.5, 0, 9.5, CORNICE + 0.6 - lo_of([(vx, vz)]) - 0.5, 9.5)
    hb.box('std:white', 0, CORNICE + 0.6, 0, 10.0, 0.5, 10.0)
    hb.pop()

# roof terrace, the upper storey under the cornice, vaulted skylights
hb.cap('std:roof', MAIN, TERRACE)
D0 = H.offset(MAIN, -5.0)
D1 = H.offset(MAIN, -6.3)
for i in range(len(D0)):
    j = (i + 1) % len(D0)
    a0, b0, a1, b1 = D0[i], D0[j], D1[i], D1[j]
    hb.face('cw:ndkDrum', [(a0[0], TERRACE, a0[1]), (b0[0], TERRACE, b0[1]), (b1[0], DRUM, b1[1]), (a1[0], DRUM, a1[1])])
C0 = H.offset(MAIN, -4.6)
hb.ring('std:cornice', C0, DRUM, CORNICE)
hb.cap('std:cornice', C0, DRUM, down=True)
# the copper roofs: the great hall's hipped roof and the two stage towers
R0 = H.offset(MAIN, -4.6)
R1 = H.offset(MAIN, -16.0)
for i in range(len(R0)):
    j = (i + 1) % len(R0)
    hb.face('std:copper', [(R0[i][0], CORNICE, R0[i][1]), (R0[j][0], CORNICE, R0[j][1]), (R1[j][0], CORNICE + 5.6, R1[j][1]), (R1[i][0], CORNICE + 5.6, R1[i][1])])
hb.cap('std:copper', R1, CORNICE + 5.6)
se = max(E, key=lambda e: e['n'][1] if e['L'] > 20 else -9)  # the south face
for k, (off, w, d, h) in enumerate(((-12.0, 22.0, 16.0, 46.0), (13.0, 18.0, 14.0, 44.5))):
    mx = (se['a'][0] + se['b'][0]) / 2 - se['n'][0] * 14.0 + se['t'][0] * off
    mz = (se['a'][1] + se['b'][1]) / 2 - se['n'][1] * 14.0 + se['t'][1] * off
    hb.push(mx, 0, mz, math.atan2(*se['n']))
    hb.box('pn:ndkStone', 0, CORNICE - 2.0, 0, w, h - CORNICE + 2.0, d)
    Q0 = [(-w / 2 - 0.4, -d / 2 - 0.4), (w / 2 + 0.4, -d / 2 - 0.4), (w / 2 + 0.4, d / 2 + 0.4), (-w / 2 - 0.4, d / 2 + 0.4)]
    Q1 = [(-w / 2 + 3.5, -d / 2 + 3.5), (w / 2 - 3.5, -d / 2 + 3.5), (w / 2 - 3.5, d / 2 - 3.5), (-w / 2 + 3.5, d / 2 - 3.5)]
    Q0 = H.orient(Q0); Q1 = H.orient(Q1)
    for i in range(4):
        j = (i + 1) % 4
        hb.face('std:copper', [(Q0[i][0], h, Q0[i][1]), (Q0[j][0], h, Q0[j][1]), (Q1[j][0], h + 3.2, Q1[j][1]), (Q1[i][0], h + 3.2, Q1[i][1])])
    hb.cap('std:copper', Q1, h + 3.2)
    hb.pop()
# vaulted skylights on the north terrace
K.frame(hb, north, out=-3.0)
for k in range(5):
    x = north['L'] / 2 + (k - 2) * 4.6
    prof = [(math.cos(math.pi * t / 8) * 1.7, math.sin(math.pi * t / 8) * 1.7) for t in range(9)]
    for t in range(8):
        a, b = prof[t], prof[t + 1]
        hb.face('std:white', [(x + a[0], TERRACE + a[1], 1.2), (x + b[0], TERRACE + b[1], 1.2), (x + b[0], TERRACE + b[1], -3.8), (x + a[0], TERRACE + a[1], -3.8)])
    hb.face('std:white', [(x + p[0], TERRACE + p[1], 1.2) for p in prof][::-1] + [(x - 1.7, TERRACE, 1.2)])
hb.pop()
K.parapet(hb, MAIN, TERRACE, 1.1, 'pn:ndkStone', w=0.4)

# ------------------------------------------------------------------ the south block and the wings
for P, h, seed in ((SOUTH, 12.0, 3), (WING_W, 10.0, 4), (WING_E, 10.0, 5)):
    hb.ring('pn:ndkStone', P, lo_of(P), 0.3)
    for e in H.edges(P):
        for a, b in runs(e, shape=unary_union([Polygon(q).buffer(0.05) for q in PARTS if q is not P])):
            K.frame(hb, e)
            hb.face('pn:ndkStone', [(a, 0.3, 0), (b, 0.3, 0), (b, h, 0), (a, h, 0)])
            for yy in (2.0, 6.0):
                if yy + 2.2 < h:
                    hb.face('cw:ndkRibbon', [(a + 1.0, yy, 0.03), (b - 1.0, yy, 0.03), (b - 1.0, yy + 2.0, 0.03), (a + 1.0, yy + 2.0, 0.03)])
                    hb.box('std:white', (a + b) / 2, yy - 0.25, 0.2, b - a - 1.6, 0.25, 0.4)
            hb.pop()
    hb.cap('std:roof', P, h)
    K.parapet(hb, P, h, 1.0, 'pn:ndkStone', w=0.35)

# ------------------------------------------------------------------ the terraces flanking the north entrance
for P, seed in ((TERR_W, 6), (TERR_E, 7)):
    th = 4.0
    hb.ring('pn:ndkStone', P, lo_of(P), th)
    hb.cap('std:paving', P, th)
    # battered white parapet with planting behind it
    Q = H.offset(P, -0.5)
    for e in H.edges(P):
        if not runs(e, shape=unary_union([Polygon(q).buffer(0.05) for q in PARTS if q is not P])):
            continue
        K.frame(hb, e)
        hb.face('std:planter', [(0, th, 0), (e['L'], th, 0), (e['L'], th + 1.1, -0.3), (0, th + 1.1, -0.3)])
        hb.face('std:planter', [(0, th + 1.1, -0.3), (e['L'], th + 1.1, -0.3), (e['L'], th + 1.1, -0.7), (0, th + 1.1, -0.7)])
        if e['L'] > 6:
            hb.box('std:hedge', e['L'] / 2, th, -1.6, e['L'] - 1.2, 0.8, 1.8)
        hb.pop()
    # stairs from the plaza up to the terrace on its longest open side
    oe = max((e for e in H.edges(P) if runs(e)), key=lambda e: e['L'])
    K.frame(hb, oe)
    for k in range(int(th / 0.16)):
        hb.box('std:paving', oe['L'] / 2, k * 0.16, 0.32 * (int(th / 0.16) - k) - 0.16, min(8.0, oe['L'] - 2), 0.16, 0.32)
    hb.pop()

# ------------------------------------------------------------------ the plaza: the octagonal fountain court, flags, screen
def basin(P, rim=0.7, depth=0.35, jets=0, seed=1):
    """Fountain basin on an outline: stone rim with an LED line, water surface, jets lit from below."""
    P = H.orient(P)
    g0 = min(gy(*p) for p in P)
    g1 = max(gy(*p) for p in P)
    top = g1 + rim
    Q = H.offset(P, -0.45)
    hb.ring('std:planter', P, g0 - 0.3, top)
    for e in H.edges(Q):
        hb.wall('std:planter', e['b'], e['a'], top - rim - depth - 0.2, top)
    for i in range(len(P)):
        j = (i + 1) % len(P)
        hb.face('std:planter', [(P[i][0], top, P[i][1]), (P[j][0], top, P[j][1]), (Q[j][0], top, Q[j][1]), (Q[i][0], top, Q[i][1])])
    for e in H.edges(H.offset(P, -0.2)):
        K.frame(hb, e)
        hb.box('glow:led', e['L'] / 2, top, 0, e['L'], 0.03, 0.08)
        hb.pop()
    wy = top - rim * 0.55
    hb.cap('water', Q, wy)
    hb.cap('lit:pool', Q, wy - depth)
    return Q, wy


# the big octagonal court in front of the entrance (the OSM basin nearest the palace), sphere in the middle
front = min(WATER, key=lambda P: math.hypot(H.centroid(P)[0] - cx, H.centroid(P)[1] - cz))
Q, wy = basin(front, rim=0.9, depth=0.6)
fx, fz = H.centroid(front)
for k, r in enumerate((0.78, 0.56, 0.34)):  # stepped tiers inside
    T = H.offset(Q, -(1.0 - r) * 14)
    if Polygon(T).is_valid and Polygon(T).area > 20:
        hb.prism('std:planter', T, wy - 0.6, wy + 0.25 + k * 0.25)
        hb.cap('water', H.offset(T, -0.4), wy + 0.27 + k * 0.25)
hb.sphere('std:bronze', (fx, wy + 2.4, fz), 1.6, segs=18, rings=10)
for k in range(12):
    a = 2 * math.pi * k / 12
    jx, jz = fx + math.cos(a) * 5.0, fz + math.sin(a) * 5.0
    hb.cyl('glass:jet', jx, wy + 1.0, jz, 0.18, 2.6, segs=8, r1=0.04)
    hb.cyl('glow:jet', jx, wy + 0.95, jz, 0.3, 0.06, segs=8)
# the rest of the OSM basins round the crossing and the cascade to the north
casc = [P for P in WATER if P is not front]
for P in casc:
    c = H.centroid(P)
    Q, wy = basin(P, rim=0.45, depth=0.3)
    poly = Polygon(Q)
    mrr = list(poly.minimum_rotated_rectangle.exterior.coords)[:4]
    l1 = math.dist(mrr[0], mrr[1]); l2 = math.dist(mrr[1], mrr[2])
    (a, b) = (mrr[0], mrr[1]) if l1 > l2 else (mrr[1], mrr[2])
    L = max(l1, l2); W = min(l1, l2)
    if W > 12 or L < 15:
        continue
    ax, az = (b[0] - a[0]) / L, (b[1] - a[1]) / L
    nx, nz = -az, ax
    # two rows of jets with lit bases along the channel
    for k in range(int(L / 2.6)):
        s = 1.3 + k * 2.6
        for side in (-1, 1):
            jx = c[0] + ax * (s - L / 2) + nx * side * W * 0.18
            jz = c[1] + az * (s - L / 2) + nz * side * W * 0.18
            if not poly.contains(Point(jx, jz)):
                continue
            hb.box('std:pavingDark', jx, wy - 0.1, jz, 0.7, 0.14, 0.7, yaw=math.atan2(ax, az))
            hb.cyl('glow:jet', jx, wy + 0.02, jz, 0.22, 0.04, segs=8)
            hb.cyl('glass:jet', jx, wy + 0.04, jz, 0.14, 1.2 + 0.3 * (k % 2), segs=6, r1=0.03)
    # herringbone stone strips, dark planting beds, the walks' light stripes beside the channel
    for side in (-1, 1):
        for k in range(int(L / 1.2)):
            s = k * 1.2 - L / 2 + 0.6
            for j in range(2):
                off = W / 2 + 0.45 + 0.6 + j * 1.2
                px = c[0] + ax * s + nx * side * off
                pz = c[1] + az * s + nz * side * off
                yaw = math.atan2(ax, az) + (0.785 if (j + (side > 0)) % 2 else -0.785)
                hb.box('std:herringDark' if (k + j) % 2 else 'std:herring', px, gy(px, pz) + 0.02, pz, 0.32, 0.05, 1.5, yaw=yaw, top=True)
        bo = W / 2 + 0.45 + 2.7
        bx_, bz_ = c[0] + nx * side * (bo + 1.0), c[1] + nz * side * (bo + 1.0)
        hb.push(bx_, gy(bx_, bz_), bz_, math.atan2(ax, az))
        hb.box('std:planter', 0, -0.1, 0, 2.2, 0.35, L, top=False)
        hb.box('std:bed', 0, 0.2, 0, 1.9, 0.06, L - 0.3)
        for k in range(int(L / 1.4)):
            hb.sphere('std:hedge', (rnd.uniform(-0.5, 0.5), 0.35, -L / 2 + 0.7 + k * 1.4), rnd.uniform(0.35, 0.5), segs=6, rings=4)
        hb.pop()
        # orange globe lamps along the walk
        lo_ = W / 2 + 9.0
        for k in range(int(L / 16) + 1):
            s = -L / 2 + 4 + k * 16
            lx, lz = c[0] + ax * s + nx * side * lo_, c[1] + az * s + nz * side * lo_
            ly = gy(lx, lz)
            hb.cyl('std:steelDark', lx, ly, lz, 0.07, 3.8, segs=8, r1=0.05)
            hb.sphere('glow:globe', (lx, ly + 4.05, lz), 0.28, segs=10, rings=6)
            if k % 2 == 0:
                hb.push(lx + nx * side * 1.5, ly, lz + nz * side * 1.5, math.atan2(ax, az))
                hb.box('std:steelDark', 0, 0.42, 0, 0.5, 0.06, 1.8)
                hb.box('std:steelDark', -0.22, 0.48, 0, 0.06, 0.45, 1.8)
                hb.pop()

# flags in an arc on the plaza north-west of the entrance, the three masts to the east
ne = north
nmx = (ne['a'][0] + ne['b'][0]) / 2 + ne['n'][0] * 30
nmz = (ne['a'][1] + ne['b'][1]) / 2 + ne['n'][1] * 30
for k in range(15):
    a = math.pi * 0.55 + k * 0.075
    px = nmx - 32 + math.cos(a) * 18
    pz = nmz - 8 + math.sin(a) * 18
    hb.push(px, gy(px, pz), pz, 0)
    K.flagpole(hb, 0, 0, 10.0, 'sign:' + ('flagBG', 'flagEU', 'flagSofia')[k % 3])
    hb.pop()
for k in range(3):
    px = nmx + 38 + k * 4.5
    pz = nmz - 6 + k * 3.0
    hb.push(px, gy(px, pz), pz, 0)
    K.flagpole(hb, 0, 0, 24.0, 'sign:flagBG')
    hb.pop()
# the big screen by the east terrace
ex, ez = H.centroid(TERR_E)
hb.push(ex + 14, gy(ex + 14, ez - 10), ez - 10, math.atan2(*north['n']))
for lx in (-2.5, 2.5):
    hb.box('std:steelDark', lx, -0.3, 0, 0.4, 3.6, 0.4)
hb.box('std:screen', 0, 3.0, -0.2, 9.0, 5.0, 0.4)
hb.sign('sign:ndkScreen', -4.3, 3.2, 4.3, 7.8, 0.01)
hb.pop()

# ------------------------------------------------------------------ build, bake, export
ob = hb.build()
if '--nobake' not in sys.argv:
    H.add_ground(pk, hb, margin=20, step=4.0)
    H.lightmap_uv(ob)
    ao = H.bake_ao(ob, H.arg('--size', 2048, int), 4.0, H.arg('--samples', 48, int))
    H.save_ao(ao, NAME)
    H.export(ob, NAME, {'anchor': [round(cx, 2), round(cz, 2)], 'base': DATUM, 'source': 'tools/blender/hero/ndk.py'})
if '--preview' in sys.argv:
    SP = os.environ.get('PREVIEW_DIR', '/tmp')
    if '--nobake' in sys.argv:
        H.add_ground(pk, hb, margin=40, step=4.0)
    rel = lambda x, h, z: (x - cx, gy(x, z) + h, z - cz)
    H.preview(f'{SP}/ndk_n.jpg', rel(-2672, 45, -2150), rel(-2705, 15, -1800), lens=45)
    H.preview(f'{SP}/ndk_ne.jpg', rel(-2600, 70, -1900), rel(-2705, 20, -1770), lens=35)
    H.preview(f'{SP}/ndk_nw.jpg', rel(-2850, 60, -1900), rel(-2715, 20, -1770), lens=35)
