# The administrative tower of the NDK (OSM: „Административна сграда на НДК“, 54.6 m) at бул. „Пенчо
# Славейков“ / бул. „Витоша“, home of bTV Media Group, whose lettering stands on its roof. Footprint from the
# OSM outline (world7 pack). Appearance from the user's street-level photographs (August 2024, June 2022): a
# late-1970s office tower of precast concrete - every storey a deep beige parapet band over a ribbon of
# windows with air-conditioning units, the floors stepping out and in so that the corners read serrated, a
# recessed glazed ground floor, and on the roof an open frame of beams carrying the two blue "b" squares and
# "Media Group". Storey heights and the band profile are estimated.
import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import herolib as H
import herokit as K

NAME = 'btv'
pk = H.Pack('7')
H.reset()

FP = H.orient(H.simplify(pk.building(-2968.0, -1591.0, 3)['pts'], 0.3))
DATUM = 43.3
GF = 4.2         # ground floor
FL = 3.3         # storey
N = 14           # storeys over the ground floor
ROOF = GF + N * FL
cx, cz = H.centroid(FP)
hb = H.HB(NAME, (cx, cz), DATUM)

hb.mat('lf:concrete:#cbbfa6', (0.78, 0.74, 0.65), 0.85)
hb.mat('std:concreteDark', (0.55, 0.52, 0.47), 0.85)
hb.mat('cw:btvRibbon', (0.25, 0.3, 0.33), 0.1, 0.5)
hb.mat('std:alu', (0.62, 0.64, 0.66), 0.4, 0.7)
hb.mat('std:steel', (0.55, 0.57, 0.6), 0.4, 0.7)
hb.mat('std:steelDark', (0.15, 0.16, 0.17), 0.5, 0.5)
hb.mat('std:ac', (0.86, 0.86, 0.84), 0.6)
hb.mat('std:roof', (0.48, 0.48, 0.47), 0.95)
hb.mat('std:plinth', (0.4, 0.4, 0.41), 0.85)
hb.mat('std:btvBlue', (0.08, 0.2, 0.42), 0.4)
hb.mat('std:white', (0.9, 0.9, 0.89), 0.45)
hb.mat('std:plant', (0.62, 0.64, 0.66), 0.5, 0.4)
hb.mat('std:plantDark', (0.2, 0.21, 0.22), 0.6, 0.3)
hb.mat('glass:door', (0.5, 0.6, 0.62), 0.05)
hb.mat('glow:white', (0.95, 0.95, 0.95), 0.4, emit=(1, 1, 1))
hb.mat('glow:btvNavy', (0.12, 0.22, 0.45), 0.4, emit=(0.4, 0.6, 1))
hb.mat('glow:shopLight', (0.95, 0.95, 0.9), 0.4, emit=(1, 0.95, 0.85))
for k, c in (('floor', (0.7, 0.68, 0.64)), ('wall', (0.86, 0.84, 0.8)), ('ceiling', (0.9, 0.9, 0.9)), ('wood', (0.45, 0.32, 0.2)), ('white', (0.9, 0.9, 0.9))):
    hb.mat('int:' + k, c, 0.6)

rnd = random.Random(7)


def gy(x, z):
    return pk.y(x, z) - DATUM


def chamfer(pts, c):
    """Corners cut at 45 degrees by c metres."""
    out = []
    E = H.edges(pts)
    for i, e in enumerate(E):
        a, b = e['a'], e['b']
        out.append((a[0] + e['t'][0] * c, a[1] + e['t'][1] * c))
        out.append((b[0] - e['t'][0] * c, b[1] - e['t'][1] * c))
    return out


# ------------------------------------------------------------------ the storeys
lo = min(gy(*p) for p in FP) - 0.6
core = H.offset(FP, -1.2)
hb.ring('std:plinth', FP, lo, 0.3)
# ground floor: recessed glass behind the columns of the floor above
G = H.offset(FP, -2.2)
for e in H.edges(G):
    K.frame(hb, e)
    hb.face('glass:door', [(0, 0.3, 0), (e['L'], 0.3, 0), (e['L'], GF, 0), (0, GF, 0)])
    K.shop_interior(hb, 0.3, e['L'] - 0.3, GF - 0.3, 5.0, 'lobby', 11 + e['i'])
    hb.pop()
for e in H.edges(FP):
    n = max(2, round(e['L'] / 6.2))
    for k in range(n + 1):
        s = e['L'] * k / n
        x = e['a'][0] + e['t'][0] * s - e['n'][0] * 1.0
        z = e['a'][1] + e['t'][1] * s - e['n'][1] * 1.0
        hb.box('lf:concrete:#cbbfa6', x, 0.3, z, 0.7, GF - 0.3, 0.7, yaw=math.atan2(*e['n']))
hb.cap('std:concreteDark', G, GF, down=True)
hb.cap('std:concreteDark', FP, GF - 0.01, down=True)
for f in range(N):
    y0 = GF + f * FL
    out = 0.0 if f % 2 == 0 else 0.55       # every second storey steps out
    cut = 3.2 if f % 2 == 0 else 1.6        # and its corners are cut less
    P = chamfer(H.offset(FP, out), cut)
    W = chamfer(H.offset(FP, out - 0.7), cut + 0.3)  # the window line, behind the band
    # parapet band (precast, with a groove), the ribbon window, the slab edge over it
    hb.ring('lf:concrete:#cbbfa6', P, y0, y0 + 1.15)
    hb.ring('std:concreteDark', H.offset(P, -0.06), y0 + 0.55, y0 + 0.62)
    hb.cap('lf:concrete:#cbbfa6', P, y0 + 1.15, holes=[W[::-1]])
    hb.cap('std:concreteDark', P, y0, down=True, holes=[W[::-1]])
    for e in H.edges(W):
        hb.wall('cw:btvRibbon', e['a'], e['b'], y0 + 1.15, y0 + FL - 0.35)
        K.mullions(hb, e, y0 + 1.15, y0 + FL - 0.35, 1.25, 'std:alu', depth=0.08, w=0.06)
        hb.wall('lf:concrete:#cbbfa6', e['a'], e['b'], y0 + FL - 0.35, y0 + FL)
        # air-conditioning units on the band
        if e['L'] > 6:
            for k in range(int(e['L'] / 5.0)):
                if rnd.random() < 0.45:
                    s = rnd.uniform(1.0, e['L'] - 1.0)
                    K.frame(hb, e)
                    hb.box('std:ac', s, 1.15, 0.45, 0.8, 0.55, 0.3)
                    hb.pop()
# the roof and its frame
R = chamfer(H.offset(FP, 0.0), 3.2)
hb.cap('std:roof', R, ROOF)
K.parapet(hb, R, ROOF, 0.9, 'lf:concrete:#cbbfa6', w=0.35)
K.roof_plant(hb, FP, ROOF, 3, 9, inset=6.0, maxw=5.0)
hb.prism('std:concreteDark', H.offset(FP, -8.0), ROOF, ROOF + 3.4)
F = chamfer(H.offset(FP, 0.3), 3.0)
FH = 3.6
for e in H.edges(F):
    hb.beam('std:steel', (e['a'][0], ROOF + FH, e['a'][1]), (e['b'][0], ROOF + FH, e['b'][1]), 0.35, 0.5)
    n = max(1, round(e['L'] / 3.0))
    for k in range(n + 1):
        s = e['L'] * k / n
        x = e['a'][0] + e['t'][0] * s; z = e['a'][1] + e['t'][1] * s
        hb.beam('std:steel', (x, ROOF, z), (x, ROOF + FH, z), 0.22)
        # the frame's cross beams towards the middle
        ix = x - e['n'][0] * 4.0; iz = z - e['n'][1] * 4.0
        hb.beam('std:steel', (x, ROOF + FH, z), (ix, ROOF + FH, iz), 0.18, 0.3)
    hb.beam('std:steel', (e['a'][0] - e['n'][0] * 4, ROOF + FH, e['a'][1] - e['n'][1] * 4), (e['b'][0] - e['n'][0] * 4, ROOF + FH, e['b'][1] - e['n'][1] * 4), 0.25, 0.35)
# the lettering on the roof, towards бул. „Витоша“ / „България“ (north-west) and down Пенчо Славейков
def logo(e, s, size):
    K.frame(hb, e, out=0.6)
    for k in range(2):
        x = s + k * (size + 0.4)
        hb.box('std:btvBlue', x, ROOF + FH + 0.4, 0.0, size, size, 0.35)
        K.text3d(hb, 'glow:white', 'b', x, ROOF + FH + 0.4 + size * 0.2, 0.2, size * 0.62, 0.08, font='sans')
    K.text3d(hb, 'glow:btvNavy', 'Media Group', s + 2 * (size + 0.4) - size / 2 + 0.6, ROOF + FH + 0.55, -0.05, size * 0.33, 0.15, align='LEFT', back=True)
    hb.pop()


faces = sorted(H.edges(F), key=lambda e: e['n'][0] * -0.8 + e['n'][1] * -0.6, reverse=True)
logo(faces[0], 2.5, 3.0)
logo(faces[1], 2.0, 2.4)

# ------------------------------------------------------------------ build, bake, export
ob = hb.build()
if '--nobake' not in sys.argv:
    H.add_ground(pk, hb, margin=20, step=3.0)
    H.lightmap_uv(ob)
    ao = H.bake_ao(ob, H.arg('--size', 1024, int), 3.0, H.arg('--samples', 48, int))
    H.save_ao(ao, NAME)
    H.export(ob, NAME, {'anchor': [round(cx, 2), round(cz, 2)], 'base': DATUM, 'source': 'tools/blender/hero/btv.py'})
if '--preview' in sys.argv:
    SP = os.environ.get('PREVIEW_DIR', '/tmp')
    if '--nobake' in sys.argv:
        H.add_ground(pk, hb, margin=50, step=4.0)
    rel = lambda x, h, z: (x - cx, gy(x, z) + h, z - cz)
    H.preview(f'{SP}/btv_a.jpg', rel(-3030, 1.8, -1625), rel(-2968, 30, -1591), lens=18)
    H.preview(f'{SP}/btv_b.jpg', rel(-2990, 1.8, -1545), rel(-2968, 30, -1591), lens=18)
