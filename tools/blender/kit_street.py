# Street, park, playground and rooftop kit modelled in Blender (src/data/kit_street.glb, placed by
# src/world/CityExtras.js): playground equipment as found in Sofia's housing estates (swings, slide tower,
# spring riders, see-saw, sandbox, carousel, climbing pyramid), park furniture (the wooden gazebo - беседка -,
# pergola, drinking fountain - чешма -, outdoor fitness bars, concrete table-tennis table, raised flower beds,
# park lanterns, bins, a coffee kiosk), the props in front of the shops (cafe sets, parasols, sandwich boards,
# fruit stand, florist's buckets, ATM, the green pharmacy cross, ice-cream freezer, entrance planters) and roof
# garden pieces (planters, pergola with deck chairs).
# Every piece is one object; its colours and the ambient occlusion Cycles bakes for it (with a ground plane)
# are stored as vertex colours, so the game draws all pieces with one material (plus a glow material for the
# lamps and lit signs).
#   blenv/bin/python tools/blender/kit_street.py [--preview out.jpg]
import math
import os
import random
import subprocess
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'hero'))
import bpy
import numpy as np
import herolib as H

ROOT = H.ROOT
OUT = os.path.join(ROOT, 'src', 'data', 'kit_street.glb')
H.reset(32)
PIECES = []

C = {
    'steelRed': (0.72, 0.10, 0.08), 'steelYellow': (0.95, 0.72, 0.08), 'steelBlue': (0.10, 0.30, 0.65), 'steelGreen': (0.12, 0.42, 0.22),
    'steel': (0.55, 0.57, 0.6), 'black': (0.06, 0.06, 0.07), 'dark': (0.16, 0.17, 0.18), 'chain': (0.45, 0.46, 0.48),
    'rubber': (0.08, 0.08, 0.09), 'wood': (0.55, 0.38, 0.22), 'woodDark': (0.36, 0.24, 0.14), 'woodLight': (0.72, 0.56, 0.36),
    'roofTile': (0.55, 0.22, 0.14), 'shingle': (0.30, 0.20, 0.16), 'sand': (0.86, 0.76, 0.56), 'stone': (0.72, 0.70, 0.66),
    'concrete': (0.62, 0.61, 0.58), 'greenPlant': (0.22, 0.42, 0.14), 'greenDark': (0.12, 0.28, 0.10), 'soil': (0.20, 0.14, 0.10),
    'red': (0.85, 0.12, 0.12), 'orange': (0.95, 0.50, 0.08), 'yellow': (0.98, 0.84, 0.15), 'white': (0.92, 0.92, 0.90),
    'pink': (0.92, 0.45, 0.62), 'violet': (0.55, 0.30, 0.75), 'lime': (0.55, 0.78, 0.18), 'blue': (0.18, 0.40, 0.85),
    'plasticRed': (0.85, 0.14, 0.10), 'plasticBlue': (0.12, 0.42, 0.85), 'plasticGreen': (0.20, 0.65, 0.25), 'plasticYellow': (0.98, 0.80, 0.10),
    'canvas': (0.93, 0.92, 0.88), 'canvasRed': (0.75, 0.12, 0.12), 'canvasGreen': (0.15, 0.40, 0.22), 'board': (0.10, 0.12, 0.12),
    'atm': (0.62, 0.64, 0.66), 'freezer': (0.92, 0.93, 0.95), 'kiosk': (0.85, 0.82, 0.74), 'water': (0.30, 0.50, 0.58),
    'cross': (0.10, 0.70, 0.30), 'lampHead': (0.95, 0.9, 0.75), 'screen': (0.20, 0.35, 0.55), 'deck': (0.88, 0.88, 0.86),
}


def col(k):
    return 'c:' + k


def glow(k):
    return 'g:' + k


def piece(name):
    def deco(fn):
        PIECES.append((name, fn))
        return fn
    return deco


# ------------------------------------------------------------------ playground
@piece('swing')
def swing(hb):
    for sx in (-1.7, 1.7):
        for sz in (-0.8, 0.8):
            hb.tube(col('steelRed'), (sx, 0, sz), (sx, 2.25, 0), 0.05, 8)
    hb.tube(col('steelYellow'), (-1.8, 2.25, 0), (1.8, 2.25, 0), 0.06, 8)
    for x in (-0.85, 0.85):
        for dx in (-0.22, 0.22):
            hb.tube(col('chain'), (x + dx, 2.22, 0), (x + dx, 0.5, 0), 0.012, 4, caps=False)
        hb.box(col('rubber'), x, 0.45, 0, 0.5, 0.05, 0.2)


@piece('slide')
def slide(hb):
    for x in (-0.6, 0.6):
        for z in (-0.6, 0.6):
            hb.box(col('wood'), x, 0, z, 0.1, 2.8, 0.1)
    hb.box(col('woodLight'), 0, 1.3, 0, 1.4, 0.08, 1.4)
    for k in range(4):  # rails on three sides
        hb.box(col('wood'), -0.65 + k * 0.43, 1.38, -0.65, 0.05, 0.75, 0.05)
    hb.box(col('wood'), 0, 2.1, -0.65, 1.3, 0.06, 0.06)
    # roof
    hb.face(col('plasticRed'), [(-0.8, 2.75, -0.8), (0.8, 2.75, -0.8), (0, 3.3, 0)][::-1])
    hb.face(col('plasticRed'), [(0.8, 2.75, -0.8), (0.8, 2.75, 0.8), (0, 3.3, 0)][::-1])
    hb.face(col('plasticRed'), [(0.8, 2.75, 0.8), (-0.8, 2.75, 0.8), (0, 3.3, 0)][::-1])
    hb.face(col('plasticRed'), [(-0.8, 2.75, 0.8), (-0.8, 2.75, -0.8), (0, 3.3, 0)][::-1])
    # chute
    for k in range(10):
        t0, t1 = k / 10, (k + 1) / 10
        y0, y1 = 1.3 - 1.12 * t0, 1.3 - 1.12 * t1
        z0, z1 = 0.7 + 2.4 * t0, 0.7 + 2.4 * t1
        for q in ([(-0.3, y0, z0), (-0.3, y1, z1), (0.3, y1, z1), (0.3, y0, z0)],
                  [(-0.3, y0, z0), (-0.3, y0 + 0.25, z0), (-0.3, y1 + 0.25, z1), (-0.3, y1, z1)],
                  [(0.3, y0, z0), (0.3, y1, z1), (0.3, y1 + 0.25, z1), (0.3, y0 + 0.25, z0)]):
            hb.face(col('plasticYellow'), q)
            hb.face(col('plasticYellow'), q[::-1])
    # ladder at the back
    for x in (-0.3, 0.3):
        hb.tube(col('steelBlue'), (x, 0, -1.5), (x, 1.4, -0.7), 0.03, 6)
    for k in range(5):
        t = (k + 0.5) / 5
        hb.tube(col('steelBlue'), (-0.3, 1.4 * t, -1.5 + 0.8 * t), (0.3, 1.4 * t, -1.5 + 0.8 * t), 0.025, 6)


@piece('spring')
def spring(hb):
    hb.box(col('concrete'), 0, 0, 0, 0.5, 0.06, 0.5)
    for k in range(6):
        hb.cyl(col('steel'), 0, 0.06 + k * 0.07, 0, 0.12, 0.03, segs=8)
    hb.box(col('plasticGreen'), 0, 0.5, 0, 0.3, 0.35, 0.8)
    hb.box(col('plasticGreen'), 0, 0.85, 0.32, 0.26, 0.35, 0.22)
    hb.box(col('plasticYellow'), 0, 0.68, 0.28, 0.5, 0.05, 0.05)
    hb.box(col('plasticRed'), 0, 0.85, -0.1, 0.32, 0.05, 0.3)


@piece('seesaw')
def seesaw(hb):
    hb.box(col('steelBlue'), 0, 0, 0, 0.3, 0.45, 0.3)
    hb.beam(col('steelYellow'), (-1.6, 0.25, 0), (1.6, 0.65, 0), 0.25, 0.06)
    for x, y in ((-1.4, 0.27), (1.4, 0.63)):
        hb.box(col('rubber'), x, y + 0.03, 0, 0.35, 0.04, 0.3)
        hb.tube(col('steelRed'), (x + 0.25 * (1 if x < 0 else -1), y, -0.15), (x + 0.25 * (1 if x < 0 else -1), y + 0.35, -0.15), 0.02, 6)


@piece('sandbox')
def sandbox(hb):
    for sx in (-1, 1):
        hb.box(col('wood'), sx * 1.45, 0, 0, 0.12, 0.3, 3.0)
        hb.box(col('wood'), 0, 0, sx * 1.45, 3.0, 0.3, 0.12)
    hb.box(col('sand'), 0, 0, 0, 2.8, 0.22, 2.8)
    hb.box(col('plasticRed'), 0.5, 0.22, 0.4, 0.25, 0.15, 0.25)
    hb.cyl(col('plasticBlue'), -0.6, 0.22, -0.3, 0.12, 0.16, segs=8)


@piece('carousel')
def carousel(hb):
    hb.cyl(col('steelBlue'), 0, 0.15, 0, 1.0, 0.08, segs=20, top=col('steelYellow'))
    hb.cyl(col('steel'), 0, 0, 0, 0.12, 0.2, segs=8)
    hb.cyl(col('steelRed'), 0, 0.23, 0, 0.06, 0.8, segs=8)
    for k in range(4):
        a = k * math.pi / 2
        hb.tube(col('steelRed'), (0, 1.0, 0), (math.cos(a) * 0.85, 0.75, math.sin(a) * 0.85), 0.03, 6)
        hb.tube(col('steelRed'), (math.cos(a) * 0.85, 0.75, math.sin(a) * 0.85), (math.cos(a) * 0.85, 0.23, math.sin(a) * 0.85), 0.03, 6)


@piece('climber')
def climber(hb):
    top = (0, 2.6, 0)
    base = [(-1.5, 0, -1.5), (1.5, 0, -1.5), (1.5, 0, 1.5), (-1.5, 0, 1.5)]
    for p in base:
        hb.tube(col('steelRed'), p, top, 0.05, 8)
    for k in range(1, 5):
        t = k / 5
        ring = [(p[0] * (1 - t), 2.6 * t, p[2] * (1 - t)) for p in base]
        for i in range(4):
            hb.tube(col('rubber'), ring[i], ring[(i + 1) % 4], 0.018, 4, caps=False)
    for i in range(4):
        p, q = base[i], base[(i + 1) % 4]
        hb.tube(col('rubber'), ((p[0] + q[0]) / 2, 0, (p[2] + q[2]) / 2), top, 0.018, 4, caps=False)


# ------------------------------------------------------------------ park furniture
@piece('gazebo')
def gazebo(hb):
    r = 2.0
    pts = [(math.cos(k * math.pi / 3) * r, math.sin(k * math.pi / 3) * r) for k in range(6)]
    hb.cyl(col('stone'), 0, 0, 0, r + 0.25, 0.25, segs=6)
    for x, z in pts:
        hb.box(col('woodDark'), x * 0.95, 0.25, z * 0.95, 0.14, 2.35, 0.14)
    for i in range(6):  # railings and benches on five sides
        a, b = pts[i], pts[(i + 1) % 6]
        if i == 0:
            continue
        hb.beam(col('wood'), (a[0] * 0.95, 1.0, a[1] * 0.95), (b[0] * 0.95, 1.0, b[1] * 0.95), 0.08)
        hb.beam(col('wood'), (a[0] * 0.95, 0.6, a[1] * 0.95), (b[0] * 0.95, 0.6, b[1] * 0.95), 0.05)
        ma = (a[0] * 0.78, a[1] * 0.78); mb = (b[0] * 0.78, b[1] * 0.78)
        hb.beam(col('woodLight'), (ma[0], 0.68, ma[1]), (mb[0], 0.68, mb[1]), 0.36, 0.05)
    hb.cyl(col('woodLight'), 0, 0.25, 0, 0.7, 0.75, segs=6)  # table
    hb.beam(col('woodDark'), (0, 2.6, 0), (0, 2.65, 0), 0.1)
    for i in range(6):
        a, b = pts[i], pts[(i + 1) % 6]
        hb.beam(col('woodDark'), (a[0] * 0.95, 2.6, a[1] * 0.95), (b[0] * 0.95, 2.6, b[1] * 0.95), 0.14)
        hb.face(col('shingle'), [(a[0] * 1.25, 2.6, a[1] * 1.25), (b[0] * 1.25, 2.6, b[1] * 1.25), (0, 3.9, 0)][::-1])
        hb.face(col('woodDark'), [(a[0] * 1.25, 2.58, a[1] * 1.25), (b[0] * 1.25, 2.58, b[1] * 1.25), (0, 3.7, 0)])
    hb.cyl(col('woodDark'), 0, 3.85, 0, 0.08, 0.35, segs=6)


@piece('pergola')
def pergola(hb):
    for x in (-2.0, 2.0):
        for z in (-1.2, 1.2):
            hb.box(col('woodDark'), x, 0, z, 0.15, 2.5, 0.15)
    for z in (-1.2, 1.2):
        hb.box(col('wood'), 0, 2.5, z, 4.6, 0.18, 0.12)
    for k in range(9):
        hb.box(col('woodLight'), -2.0 + k * 0.5, 2.68, 0, 0.08, 0.12, 3.0)
    rnd = random.Random(3)
    for k in range(26):  # climbing plants over the top and down two posts
        hb.sphere(col('greenPlant') if k % 3 else col('greenDark'), (rnd.uniform(-2.2, 2.2), 2.85 + rnd.uniform(-0.1, 0.25), rnd.uniform(-1.4, 1.4)), rnd.uniform(0.3, 0.55), segs=6, rings=4)
    for k in range(5):
        hb.sphere(col('greenPlant'), (-2.0 + rnd.uniform(-0.15, 0.15), 0.4 + k * 0.45, -1.2), 0.28, segs=6, rings=4)
    bench(hb, 0, 0, 0.0)


def bench(hb, x, z, yaw):
    hb.push(x, 0, z, yaw)
    for sx in (-0.75, 0.75):
        hb.box(col('dark'), sx, 0, 0, 0.06, 0.42, 0.45)
        hb.box(col('dark'), sx, 0.42, 0.2, 0.06, 0.45, 0.06)
    for k in range(3):
        hb.box(col('wood'), 0, 0.42, -0.15 + k * 0.14, 1.7, 0.04, 0.11)
    for k in range(2):
        hb.box(col('wood'), 0, 0.6 + k * 0.16, 0.22, 1.7, 0.1, 0.03)
    hb.pop()


@piece('bench')
def bench_piece(hb):
    bench(hb, 0, 0, 0)


@piece('fountainDrink')
def fountain_drink(hb):
    hb.box(col('stone'), 0, 0, 0, 1.2, 0.35, 0.8)
    hb.box(col('water'), 0, 0.35, 0.1, 0.9, 0.02, 0.5)
    hb.box(col('stone'), 0, 0, -0.45, 0.6, 1.3, 0.35)
    hb.box(col('stone'), 0, 1.3, -0.45, 0.75, 0.12, 0.45)
    hb.tube(col('steel'), (0, 0.95, -0.3), (0, 0.9, -0.1), 0.03, 6)


@piece('fitness')
def fitness(hb):
    for x in (-1.2, 0.0, 1.2):
        hb.tube(col('steelGreen'), (x, 0, 0), (x, 2.3, 0), 0.06, 8)
    hb.tube(col('steelYellow'), (-1.2, 2.25, 0), (0, 2.25, 0), 0.03, 6)
    hb.tube(col('steelYellow'), (0, 1.9, 0), (1.2, 1.9, 0), 0.03, 6)
    for z in (-0.3, 0.3):
        hb.tube(col('steelYellow'), (-2.6, 1.1, z), (-1.6, 1.1, z), 0.03, 6)
        for x in (-2.6, -1.6):
            hb.tube(col('steelGreen'), (x, 0, z), (x, 1.1, z), 0.04, 6)


@piece('pingpong')
def pingpong(hb):
    hb.box(col('concrete'), 0, 0, 0, 0.3, 0.7, 1.4)
    hb.box(col('concrete'), 0, 0, 0, 1.0, 0.7, 0.3)
    hb.box(col('steelGreen'), 0, 0.7, 0, 1.52, 0.08, 2.74)
    hb.box(col('white'), 0, 0.781, 0, 0.03, 0.002, 2.74)
    hb.box(col('steel'), 0, 0.78, 0, 1.6, 0.15, 0.04)


@piece('flowerBed')
def flower_bed(hb):
    hb.cyl(col('stone'), 0, 0, 0, 1.6, 0.45, segs=16, top=col('soil'))
    rnd = random.Random(7)
    cols = ['red', 'pink', 'yellow', 'violet', 'white', 'orange']
    for k in range(40):
        a = rnd.uniform(0, 2 * math.pi); r = math.sqrt(rnd.uniform(0, 1)) * 1.35
        x, z = math.cos(a) * r, math.sin(a) * r
        hb.cyl(col('greenPlant'), x, 0.45, z, 0.1, 0.15, segs=5, top=False)
        hb.sphere(col(cols[k % len(cols)] if r > 0.5 else 'red'), (x, 0.66, z), 0.13, segs=6, rings=3)
    hb.sphere(col('greenDark'), (0, 0.9, 0), 0.45, segs=8, rings=5)


@piece('parkLamp')
def park_lamp(hb):
    hb.cyl(col('black'), 0, 0, 0, 0.12, 0.4, segs=8, r1=0.08)
    hb.cyl(col('black'), 0, 0.4, 0, 0.05, 3.2, segs=8, r1=0.04)
    hb.cyl(col('black'), 0, 3.6, 0, 0.12, 0.08, segs=8)
    hb.cyl(glow('lampHead'), 0, 3.68, 0, 0.17, 0.5, segs=6, r1=0.22)
    hb.cyl(col('black'), 0, 4.18, 0, 0.26, 0.06, segs=6, r1=0.05)


@piece('bin')
def bin_piece(hb):
    hb.cyl(col('steelGreen'), 0, 0, 0, 0.04, 0.5, segs=6)
    hb.cyl(col('steelGreen'), 0, 0.5, 0, 0.22, 0.5, segs=10, r1=0.24)
    hb.cyl(col('dark'), 0, 1.0, 0, 0.25, 0.03, segs=10)


@piece('kiosk')
def kiosk(hb):
    hb.box(col('kiosk'), 0, 0, 0, 2.4, 2.5, 2.0)
    hb.box(glow('lampHead'), 0, 1.0, 1.0, 1.6, 1.1, 0.04)
    hb.box(col('woodDark'), 0, 0.95, 1.15, 1.8, 0.06, 0.35)
    hb.box(col('canvasRed'), 0, 2.5, 0.2, 2.8, 0.15, 2.6)
    hb.box(col('canvasRed'), 0, 2.2, 1.45, 2.8, 0.35, 0.05)


# ------------------------------------------------------------------ in front of the shops
def chair(hb, x, z, yaw, c='dark'):
    hb.push(x, 0, z, yaw)
    hb.box(col(c), 0, 0.44, 0, 0.42, 0.04, 0.42)
    hb.box(col(c), 0, 0.48, 0.19, 0.42, 0.4, 0.04)
    for lx in (-0.18, 0.18):
        for lz in (-0.18, 0.18):
            hb.box(col('steel'), lx, 0, lz, 0.025, 0.44, 0.025, top=False)
    hb.pop()


@piece('cafeSet2')
def cafe_set2(hb):
    hb.cyl(col('woodLight'), 0, 0.72, 0, 0.35, 0.03, segs=12)
    hb.cyl(col('steel'), 0, 0, 0, 0.03, 0.72, segs=6, top=False)
    hb.cyl(col('steel'), 0, 0, 0, 0.22, 0.02, segs=8)
    chair(hb, -0.62, 0, -math.pi / 2)
    chair(hb, 0.62, 0, math.pi / 2)


@piece('cafeSet4')
def cafe_set4(hb):
    hb.box(col('woodLight'), 0, 0.72, 0, 0.8, 0.03, 0.8)
    hb.box(col('steel'), 0, 0, 0, 0.05, 0.72, 0.05)
    for k in range(4):
        a = k * math.pi / 2
        chair(hb, math.sin(a) * 0.7, math.cos(a) * 0.7, a + math.pi, c='woodDark')


@piece('parasol')
def parasol(hb):
    hb.cyl(col('dark'), 0, 0, 0, 0.3, 0.1, segs=8)
    hb.cyl(col('woodDark'), 0, 0.1, 0, 0.03, 2.5, segs=6)
    s = 1.4
    rim = [(-s, 2.25, -s), (s, 2.25, -s), (s, 2.25, s), (-s, 2.25, s)]
    for i in range(4):
        a, b = rim[i], rim[(i + 1) % 4]
        hb.face(col('canvas'), [a, b, (0, 2.7, 0)][::-1])
        hb.face(col('canvas'), [a, b, (0, 2.6, 0)])
        hb.face(col('canvas'), [a, (a[0], 2.05, a[2]), (b[0], 2.05, b[2]), b][::-1])
        hb.face(col('canvas'), [a, (a[0], 2.05, a[2]), (b[0], 2.05, b[2]), b])


@piece('aBoard')
def a_board(hb):
    for s in (-1, 1):
        hb.face(col('board'), [(-0.3, 0, s * 0.22), (0.3, 0, s * 0.22), (0.3, 0.95, s * 0.02), (-0.3, 0.95, s * 0.02)][::(1 if s > 0 else -1)])
        hb.face(col('woodLight'), [(-0.3, 0, s * 0.22), (0.3, 0, s * 0.22), (0.3, 0.95, s * 0.02), (-0.3, 0.95, s * 0.02)][::(-1 if s > 0 else 1)])
        hb.face(col('white'), [(-0.2, 0.55, s * 0.12 + s * 0.005), (0.2, 0.55, s * 0.12 + s * 0.005), (0.2, 0.62, s * 0.085 + s * 0.005), (-0.2, 0.62, s * 0.085 + s * 0.005)][::(1 if s > 0 else -1)])
        hb.face(col('yellow'), [(-0.2, 0.35, s * 0.165 + s * 0.005), (0.15, 0.35, s * 0.165 + s * 0.005), (0.15, 0.42, s * 0.15 + s * 0.005), (-0.2, 0.42, s * 0.15 + s * 0.005)][::(1 if s > 0 else -1)])


@piece('fruitStand')
def fruit_stand(hb):
    rnd = random.Random(11)
    fruit = ['red', 'orange', 'yellow', 'lime', 'violet', 'plasticGreen']
    hb.box(col('woodDark'), 0, 0, 0, 2.0, 0.5, 0.9)
    for tier in range(3):
        y = 0.5 + tier * 0.28
        z = 0.25 - tier * 0.25
        for k in range(4):
            x = -0.75 + k * 0.5
            hb.box(col('wood'), x, y, z, 0.46, 0.18, 0.38)
            c = fruit[(tier * 4 + k) % len(fruit)]
            for j in range(6):
                hb.sphere(col(c), (x + rnd.uniform(-0.15, 0.15), y + 0.2, z + rnd.uniform(-0.12, 0.12)), 0.06, segs=6, rings=3)
    hb.box(col('canvasGreen'), 0, 2.1, 0.0, 2.3, 0.08, 1.3)
    for x in (-1.05, 1.05):
        hb.box(col('steel'), x, 0, -0.45, 0.04, 2.1, 0.04)


@piece('flowerBuckets')
def flower_buckets(hb):
    rnd = random.Random(5)
    cols = ['red', 'pink', 'yellow', 'white', 'violet', 'orange']
    for k in range(8):
        x = -1.0 + (k % 4) * 0.62; z = -0.25 + (k // 4) * 0.5
        y0 = 0.35 if k >= 4 else 0.0
        if k >= 4:
            hb.box(col('woodDark'), x, 0, z, 0.55, 0.35, 0.45)
        hb.cyl(col('steel'), x, y0, z, 0.17, 0.35, segs=8, r1=0.2)
        for j in range(7):
            fx, fz = x + rnd.uniform(-0.12, 0.12), z + rnd.uniform(-0.12, 0.12)
            hb.tube(col('greenPlant'), (fx, y0 + 0.3, fz), (fx * 1.0, y0 + 0.75, fz), 0.01, 3, caps=False)
            hb.sphere(col(cols[k % len(cols)]), (fx, y0 + 0.8, fz), 0.07, segs=5, rings=3)


@piece('atm')
def atm(hb):
    hb.box(col('atm'), 0, 0.0, 0.0, 0.9, 1.9, 0.12)
    hb.box(col('dark'), 0, 1.15, 0.12, 0.6, 0.45, 0.12)
    hb.face(glow('screen'), [(-0.2, 1.3, 0.245), (0.2, 1.3, 0.245), (0.2, 1.52, 0.245), (-0.2, 1.52, 0.245)])
    hb.box(col('dark'), 0, 0.95, 0.15, 0.4, 0.12, 0.25)
    hb.box(glow('cross'), 0, 1.72, 0.08, 0.8, 0.14, 0.06)


@piece('pharmacyCross')
def pharmacy_cross(hb):
    hb.box(col('steel'), 0, 0.0, 0.05, 0.08, 0.08, 0.3)
    for w, h in ((0.24, 0.72), (0.72, 0.24)):
        hb.box(glow('cross'), 0, -0.36 + 0.36 - h / 2, 0.55, 0.1, h, w)


@piece('freezer')
def freezer(hb):
    hb.box(col('freezer'), 0, 0.15, 0, 1.4, 0.7, 0.7)
    hb.box(col('steel'), 0, 0, 0, 1.3, 0.15, 0.6)
    hb.face(col('screen'), [(-0.65, 0.86, -0.3), (-0.65, 0.86, 0.3), (0.65, 0.86, 0.3), (0.65, 0.86, -0.3)])
    hb.box(col('plasticRed'), 0, 0.5, 0.36, 1.0, 0.25, 0.01)


@piece('planterBox')
def planter_box(hb):
    hb.box(col('dark'), 0, 0, 0, 0.6, 0.6, 0.6)
    hb.box(col('soil'), 0, 0.6, 0, 0.5, 0.02, 0.5)
    hb.sphere(col('greenPlant'), (0, 1.05, 0), 0.38, segs=8, rings=5)
    hb.sphere(col('greenDark'), (0.1, 1.35, 0.05), 0.25, segs=7, rings=4)


# ------------------------------------------------------------------ roof garden
@piece('roofPlanter')
def roof_planter(hb):
    hb.box(col('concrete'), 0, 0, 0, 3.0, 0.55, 0.7)
    hb.box(col('soil'), 0, 0.55, 0, 2.8, 0.02, 0.5)
    rnd = random.Random(2)
    for k in range(7):
        hb.sphere(col('greenPlant') if k % 2 else col('greenDark'), (-1.2 + k * 0.4, 0.85 + rnd.uniform(0, 0.25), 0), rnd.uniform(0.25, 0.4), segs=6, rings=4)


@piece('deckChair')
def deck_chair(hb):
    hb.beam(col('woodLight'), (0, 0.3, -0.7), (0, 0.3, 0.4), 0.6, 0.05)
    hb.beam(col('woodLight'), (0, 0.32, 0.4), (0, 0.85, 0.75), 0.6, 0.05)
    for x in (-0.28, 0.28):
        hb.box(col('woodDark'), x, 0, -0.6, 0.04, 0.3, 0.04)
        hb.box(col('woodDark'), x, 0, 0.5, 0.04, 0.3, 0.04)
    hb.box(col('canvasRed'), 0, 0.36, -0.1, 0.5, 0.03, 0.9)


@piece('roofPergola')
def roof_pergola(hb):
    for x in (-1.8, 1.8):
        for z in (-1.5, 1.5):
            hb.box(col('white'), x, 0, z, 0.12, 2.6, 0.12)
    for z in (-1.5, 1.5):
        hb.box(col('white'), 0, 2.6, z, 3.9, 0.15, 0.1)
    for k in range(10):
        hb.box(col('white'), -1.8 + k * 0.4, 2.75, 0, 0.06, 0.1, 3.2)
    hb.box(col('woodLight'), 0, 0.4, 0, 1.0, 0.05, 0.6)
    hb.box(col('steel'), 0, 0, 0, 0.06, 0.4, 0.06)
    chair(hb, -0.8, 0, -math.pi / 2, c='white')
    chair(hb, 0.8, 0, math.pi / 2, c='white')


# ------------------------------------------------------------------ build, colour, bake, export
def colourise(ob, hb):
    """Material colours -> vertex colours (corner domain), times the baked ambient occlusion."""
    me = ob.data
    ca = me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
    mats = [m.name for m in me.materials]
    n = len(me.loops)
    cols = np.ones((n, 4), dtype=np.float32)
    for p in me.polygons:
        k = mats[p.material_index][2:]
        rgb = C.get(k, (0.7, 0.7, 0.7))
        for li in p.loop_indices:
            cols[li, :3] = rgb
    # AO into a second attribute
    ao = me.color_attributes.new('AO', 'FLOAT_COLOR', 'CORNER')
    me.color_attributes.active_color = ao
    for o in bpy.context.selected_objects:
        o.select_set(False)
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    sc = bpy.context.scene
    sc.world.light_settings.distance = 1.2
    sc.render.bake.target = 'VERTEX_COLORS'
    bpy.ops.object.bake(type='AO')
    a = np.empty(n * 4, dtype=np.float32)
    ao.data.foreach_get('color', a)
    a = a.reshape(n, 4)[:, :1]
    cols[:, :3] *= np.power(np.clip(a, 0.15, 1.0), 0.75)
    ca.data.foreach_set('color', cols.ravel())
    me.color_attributes.remove(me.color_attributes['AO'])
    me.color_attributes.active_color = me.color_attributes['Col']
    me.color_attributes.render_color_index = 0
    # one material for the colours, one for what glows at night
    keep = {}
    for i, m in enumerate(mats):
        keep[i] = 'kitGlow' if m.startswith('g:') else 'kit'
    names = sorted(set(keep.values()))
    idx = np.array([names.index(keep[p.material_index]) for p in me.polygons])
    me.materials.clear()
    for nm in names:
        m = bpy.data.materials.get(nm) or bpy.data.materials.new(nm)
        me.materials.append(m)
    me.polygons.foreach_set('material_index', idx)
    me.update()


def main():
    objs = []
    ground = None
    for name, fn in PIECES:
        hb = H.HB(name, (0.0, 0.0), 0.0)
        fn(hb)
        ob = hb.build()
        # ground plane for the bake (removed afterwards)
        gme = bpy.data.meshes.new('g')
        gme.from_pydata([(-6, -6, 0), (6, -6, 0), (6, 6, 0), (-6, 6, 0)], [], [(0, 1, 2, 3)])
        g = bpy.data.objects.new('g', gme)
        bpy.context.scene.collection.objects.link(g)
        colourise(ob, hb)
        bpy.data.objects.remove(g)
        objs.append(ob)
        ob.hide_render = True
    for i, ob in enumerate(objs):
        ob.hide_render = False
        ob.location.x = (i % 8) * 7.0
        ob.location.y = -(i // 8) * 7.0
    prev = H.arg('--preview')
    if prev:
        H.preview(prev, (25, 22, 40), (24, 0, 8), lens=30, samples=24)
    for ob in objs:
        ob.location = (0, 0, 0)
    for o in bpy.context.selected_objects:
        o.select_set(False)
    for ob in objs:
        ob.select_set(True)
    tmp = OUT + '.raw.glb'
    bpy.ops.export_scene.gltf(filepath=tmp, export_format='GLB', use_selection=True, export_apply=True, export_tangents=False,
                              export_materials='EXPORT', export_image_format='NONE', export_yup=True, export_texcoords=False,
                              export_normals=True, export_vertex_color='ACTIVE', export_extras=False)
    r = subprocess.run(['node', os.path.join(ROOT, 'tools', 'optimize_glb.mjs'), tmp, OUT], capture_output=True, text=True)
    print(r.stdout.strip(), r.stderr.strip()[-300:])
    os.remove(tmp)
    print(f'{len(objs)} pieces:', ', '.join(n for n, _ in PIECES))


main()
