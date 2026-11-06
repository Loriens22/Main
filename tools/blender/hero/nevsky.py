# Патриаршеска катедрала „Св. Александър Невски“ (Alexander Pomerantsev, 1882-1912), пл. „Св. Александър
# Невски“ (stop 1264 / 1265 of trolleybus line 9). Neo-Byzantine cross-domed church on its OSM footprint and
# building parts (world9 pack, ways of the cathedral's building:part outlines):
#   * the gilded central dome on a tall drum with twelve arched windows (top of the dome about 45 m), wrapped by
#     a cascade of green copper semi-domes over the arms of the cross;
#   * the bell tower over the west front with its open belfry and gilded dome (about 50.5 m to the dome top);
#   * the barrel-vaulted nave between them, the semicircular east apse, small domes on drums at the east corners
#     and over the west ends of the side galleries;
#   * arcaded porticoes (galleries on columns) along the north and south sides, the triple portal on the west;
#   * cream walls with white stone trim: two tiers of round-arched windows in moulded surrounds, pilasters, a
#     blind arcade frieze under the cornice, a granite plinth and steps; Orthodox crosses on every dome.
# Heights follow the OSM building parts (15, 20, 26, 31, 40, 41.5 and 50.5 m); window rhythm, column spacing,
# mouldings and the dome profiles are estimated from public photographs of the cathedral.
import math
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import herolib as H

NAME = 'nevsky'
pk = H.Pack('9')
H.reset()

CX, CZ = -1570.1, -2978.3          # centre of the building parts (vertex average)
ANG = math.radians(10.3)           # long axis (west -> east) against +x
DATUM = round(pk.y(CX, CZ), 2)
hb = H.HB(NAME, (CX, CZ), DATUM)

STONE, TRIM, ACC = 'lit:nevsky', 'lit:nevskyTrim', 'std:accent'
GOLD, COPPER, WIN, REC = 'lit:nevskyGold', 'std:copper', 'std:winDark', 'std:recess'
hb.mat(STONE, (0.6, 0.47, 0.27), 0.8)  # warm light ochre stone (linear)
hb.mat(TRIM, (0.74, 0.68, 0.56), 0.6)  # pale limestone trim
hb.mat(ACC, (0.47, 0.29, 0.21), 0.7)
hb.mat(GOLD, (1.0, 0.74, 0.32), 0.24, 1.0)
hb.mat(COPPER, (0.16, 0.33, 0.26), 0.55, 0.3)  # green copper patina
hb.mat(WIN, (0.035, 0.04, 0.05), 0.18, 0.4)
hb.mat(REC, (0.17, 0.14, 0.11), 0.9)
hb.mat('std:door', (0.24, 0.14, 0.07), 0.6)
hb.mat('std:bell', (0.55, 0.42, 0.2), 0.35, 0.9)
hb.mat('lf:ashlar:#8e8b84', (0.55, 0.54, 0.51), 0.8)
PLINTH = 'lf:ashlar:#8e8b84'

# local frame: u along the axis (east), v across (south), y up from the datum
hb.push(CX, 0, CZ, -ANG)


# ------------------------------------------------------------------ helpers (current frame)
def newell(pts):
    n = np.zeros(3)
    for i in range(len(pts)):
        a, b = np.array(pts[i]), np.array(pts[(i + 1) % len(pts)])
        n += np.array([(a[1] - b[1]) * (a[2] + b[2]), (a[2] - b[2]) * (a[0] + b[0]), (a[0] - b[0]) * (a[1] + b[1])])
    return n


def oface(mat, pts, out, smooth=False):
    """Face whose normal is turned towards `out` (a direction in the frame)."""
    if np.dot(newell(pts), np.array(out, dtype=float)) < 0:
        pts = pts[::-1]
    hb.face(mat, [tuple(p) for p in pts], smooth=smooth)


def arch_pts(x, y0, w, h, z, n=12):
    """Outline of a round-arched opening (CCW seen from +z): springing at y0 + h - w / 2."""
    r = w / 2
    ys = y0 + h - r
    pts = [(x - r, y0, z), (x + r, y0, z)]
    for k in range(n + 1):
        t = math.pi * k / n
        pts.append((x + r * math.cos(t), ys + r * math.sin(t), z))
    return pts


def arch_window(x, y0, w, h, f=0.22, d=0.14, glass=WIN, trim=TRIM, sill=True, key=False):
    """Arched window on a wall frame (z out): dark glazing, a moulded surround standing proud by d, a sill and
    (key) a contrasting keystone band."""
    r = w / 2
    ys = y0 + h - r
    oface(glass, arch_pts(x, y0, w, h, 0.02), (0, 0, 1))
    # surround: jambs and the arch band, front faces at z = d, outer edges down to the wall
    n = 12
    for side in (-1, 1):
        xa, xb = (x - r - f, x - r) if side < 0 else (x + r, x + r + f)
        oface(trim, [(xa, y0, d), (xb, y0, d), (xb, ys, d), (xa, ys, d)], (0, 0, 1))
        xo = xa if side < 0 else xb
        oface(trim, [(xo, y0, 0), (xo, ys, 0), (xo, ys, d), (xo, y0, d)], (side, 0, 0))
        xi = xb if side < 0 else xa
        oface(trim, [(xi, y0, 0.02), (xi, ys, 0.02), (xi, ys, d), (xi, y0, d)], (-side, 0, 0))
    for k in range(n):
        t0, t1 = math.pi * k / n, math.pi * (k + 1) / n
        pi0 = (x + r * math.cos(t0), ys + r * math.sin(t0)); pi1 = (x + r * math.cos(t1), ys + r * math.sin(t1))
        po0 = (x + (r + f) * math.cos(t0), ys + (r + f) * math.sin(t0)); po1 = (x + (r + f) * math.cos(t1), ys + (r + f) * math.sin(t1))
        mat = ACC if key and k in (n // 2 - 1, n // 2) else trim
        oface(mat, [(pi0[0], pi0[1], d), (po0[0], po0[1], d), (po1[0], po1[1], d), (pi1[0], pi1[1], d)], (0, 0, 1))
        tm = (t0 + t1) / 2
        oface(trim, [(po0[0], po0[1], 0), (po1[0], po1[1], 0), (po1[0], po1[1], d), (po0[0], po0[1], d)], (math.cos(tm), math.sin(tm), 0))
        oface(trim, [(pi0[0], pi0[1], 0.02), (pi1[0], pi1[1], 0.02), (pi1[0], pi1[1], d), (pi0[0], pi0[1], d)], (-math.cos(tm), -math.sin(tm), 0))
    if sill:
        hb.box(trim, x, y0 - 0.16, 0.08, w + 2 * f + 0.2, 0.16, 0.28)


def edge_frame(e, y=0.0, s=0.0, out=0.0):
    nx, nz = e['n']
    tx, tz = e['t']
    hb.push(e['a'][0] + tx * s + nx * out, y, e['a'][1] + tz * s + nz * out, math.atan2(nx, nz))


def walls_with_windows(pts, y0, y1, tiers, pil=True, pil_w=0.6, frieze=True):
    """Prism walls of an outline with arched windows on every edge long enough, pilasters between the bays
    and a blind-arcade frieze under the top. tiers: [(y, h, w)]."""
    pts = H.orient(pts)
    hb.ring(STONE, pts, y0, y1)
    for e in H.edges(pts):
        L = e['L']
        if L < 2.6:
            continue
        nb = max(1, int(L / 4.3))
        bay = L / nb
        edge_frame(e)
        for k in range(nb):
            x = bay * (k + 0.5)
            for (ty, th, tw) in tiers:
                if ty + th <= y1 - 0.6:
                    arch_window(x, ty, min(tw, bay - 1.2), th, key=(th > 3))
            if pil and k > 0:
                hb.box(TRIM, bay * k, y0 + 0.4, pil_w * 0.25, pil_w, y1 - y0 - 1.2, pil_w * 0.5)
        if frieze and L > 3.5:
            # blind arcade under the cornice: small round arches in relief
            na = max(2, int(L / 1.25))
            aw = L / na
            for k in range(na):
                xc = aw * (k + 0.5)
                for side in (-1, 1):
                    hb.box(TRIM, xc + side * (aw / 2 - 0.06), y1 - 1.25, 0.06, 0.12, 0.65, 0.12)
                pts_a = []
                for j in range(9):
                    t = math.pi * j / 8
                    pts_a.append((xc + (aw / 2 - 0.06) * math.cos(t), y1 - 0.6 + (aw / 2 - 0.06) * 0.6 * math.sin(t)))
                for j in range(8):
                    a0, a1 = pts_a[j], pts_a[j + 1]
                    oface(TRIM, [(a0[0], a0[1], 0.12), (a1[0], a1[1], 0.12), (a1[0], a1[1] + 0.1, 0.12), (a0[0], a0[1] + 0.1, 0.12)], (0, 0, 1))
        hb.pop()


def cornice(pts, y, out=0.45, h=0.9, mat=TRIM):
    """Moulded cornice round an outline: plinth, ovolo, corona, cymatium."""
    pts = H.orient(pts)
    prof = [(0.0, -h), (0.12, -h + 0.12), (0.18, -h * 0.55), (out * 0.7, -h * 0.35), (out, -h * 0.25), (out, -0.08), (out * 0.9, 0.0), (0.0, 0.0)]
    path = [(p[0], y, p[1]) for p in pts]
    hb.sweep(mat, path + [path[0]], prof)


def dome(mat, cx, cz, y0, R, rise, segs=48, rings=14, th=(0.0, 2 * math.pi), onion=0.0, smooth=True):
    """Dome (or a sector of one for the semi-domes) over a circle of radius R springing at y0. onion > 0 swells
    the profile past R before it closes (bulbous domes)."""
    full = abs(th[1] - th[0] - 2 * math.pi) < 1e-6
    ns = segs if full else segs + 1
    rows = []
    for i in range(rings + 1):
        t = i / rings
        phi = t * math.pi / 2
        r = R * math.cos(phi) * (1 + onion * math.sin(phi * 2) ** 2)
        y = y0 + rise * math.sin(phi)
        row = []
        for k in range(ns):
            a = th[0] + (th[1] - th[0]) * k / segs
            row.append((cx + r * math.sin(a), y, cz + r * math.cos(a)))
        rows.append(row)
    for i in range(rings):
        for k in range(segs):
            k1 = (k + 1) % ns if full else k + 1
            q = [rows[i][k], rows[i][k1], rows[i + 1][k1], rows[i + 1][k]]
            mid = np.mean(np.array(q), axis=0)
            out = mid - np.array([cx, y0 - R * 0.3, cz])
            if i == rings - 1:
                q = [rows[i][k], rows[i][k1], rows[i + 1][k]]
            oface(mat, q, out, smooth=smooth)
    return rows


def drum(cx, cz, y0, y1, R, nwin, win_h, win_w, segs=48, cornice_out=0.45):
    """Round drum: wall, arched windows round it, pilasters between them, cornice and a base moulding."""
    rows = []
    for y in (y0, y1):
        rows.append([(cx + R * math.sin(2 * math.pi * k / segs), y, cz + R * math.cos(2 * math.pi * k / segs)) for k in range(segs)])
    for k in range(segs):
        k1 = (k + 1) % segs
        q = [rows[0][k], rows[0][k1], rows[1][k1], rows[1][k]]
        a = 2 * math.pi * (k + 0.5) / segs
        oface(STONE, q, (math.sin(a), 0, math.cos(a)), smooth=True)
    for j in range(nwin):
        a = 2 * math.pi * (j + 0.5) / nwin
        hb.push(cx + R * math.sin(a), 0, cz + R * math.cos(a), a)
        yb = y0 + (y1 - y0 - win_h) * 0.45
        arch_window(0, yb, win_w, win_h, f=0.2, d=0.12, sill=True)
        hb.pop()
        a2 = 2 * math.pi * j / nwin
        hb.push(cx + R * math.sin(a2), 0, cz + R * math.cos(a2), a2)
        hb.box(TRIM, 0, y0 + 0.3, 0.12, 0.55, y1 - y0 - 0.6, 0.3)
        hb.pop()
    circ = [(cx + R * math.sin(2 * math.pi * k / segs), cz + R * math.cos(2 * math.pi * k / segs)) for k in range(segs)]
    cornice(circ, y1, out=cornice_out, h=0.7)
    cornice(circ, y0 + 0.5, out=0.25, h=0.5)


def cross(x, y, z, h=3.0, mat=GOLD):
    """Orthodox cross: upright, the main bar, the short top bar and the slanted foot bar; a ball at the base."""
    w = h * 0.045
    hb.sphere(mat, (x, y + 0.25, z), 0.32, segs=12, rings=8)
    hb.beam(mat, (x, y + 0.4, z), (x, y + h, z), w)
    hb.beam(mat, (x - h * 0.28, y + h * 0.68, z), (x + h * 0.28, y + h * 0.68, z), w)
    hb.beam(mat, (x - h * 0.14, y + h * 0.86, z), (x + h * 0.14, y + h * 0.86, z), w * 0.8)
    hb.beam(mat, (x - h * 0.18, y + h * 0.3, z - h * 0.04), (x + h * 0.18, y + h * 0.4, z + h * 0.04), w * 0.8)


def lantern(cx, cz, y0, r, h, mat=GOLD):
    """Small lantern under a cross: a short drum and a cap."""
    hb.cyl(mat, cx, y0, cz, r, h, segs=16, r1=r * 0.85)
    hb.cyl(mat, cx, y0 + h, cz, r * 1.15, 0.12, segs=16)
    dome(mat, cx, cz, y0 + h + 0.12, r * 1.05, r * 1.2, segs=16, rings=6)


def vault(u0, u1, v0, v1, y0, rise, mat=COPPER, n=16):
    """Barrel vault along u over the rectangle [u0, u1] x [v0, v1] springing at y0, with its end lunettes."""
    vc, R = (v0 + v1) / 2, (v1 - v0) / 2
    prof = [(vc - R * math.cos(math.pi * k / n), y0 + rise * math.sin(math.pi * k / n)) for k in range(n + 1)]
    for k in range(n):
        (va, ya), (vb, yb) = prof[k], prof[k + 1]
        tm = math.pi * (k + 0.5) / n
        oface(mat, [(u0, ya, va), (u1, ya, va), (u1, yb, vb), (u0, yb, vb)], (0, math.sin(tm), -math.cos(tm)), smooth=True)
    for u, s in ((u0, -1), (u1, 1)):
        oface(STONE, [(u, y, v) for v, y in prof], (s, 0, 0))
        # the lunette's arched moulding
        for k in range(n):
            (va, ya), (vb, yb) = prof[k], prof[k + 1]
            oface(TRIM, [(u + s * 0.02, ya, va), (u + s * 0.02, yb, vb), (u + s * 0.25, yb + 0.25, vb), (u + s * 0.25, ya + 0.25, va)], (s, 0.3, 0))


def colonnade(u0, u1, v, y0, y1, n, side, r=0.32):
    """Arcade of columns along u at v: bases, shafts, capitals, round arches between them and the entablature."""
    xs = [u0 + (u1 - u0) * k / n for k in range(n + 1)]
    for x in xs:
        hb.box(TRIM, x, y0, v, 0.95, 0.45, 0.95)
        hb.cyl(TRIM, x, y0 + 0.45, v, r, y1 - y0 - 1.6, segs=16, r1=r * 0.88)
        hb.box(TRIM, x, y1 - 1.15, v, 0.9, 0.35, 0.9)  # capital
        hb.box(TRIM, x, y1 - 0.8, v, 1.05, 0.15, 1.05)  # abacus
    for k in range(n):
        xa, xb = xs[k] + 0.5, xs[k + 1] - 0.5
        xc, rr = (xa + xb) / 2, (xb - xa) / 2
        ys = y1 - 0.65
        # arch soffit and face
        for j in range(12):
            t0, t1 = math.pi * j / 12, math.pi * (j + 1) / 12
            p0 = (xc - rr * math.cos(t0), ys + rr * math.sin(t0)); p1 = (xc - rr * math.cos(t1), ys + rr * math.sin(t1))
            oface(TRIM, [(p0[0], p0[1], v - side * 0.45), (p1[0], p1[1], v - side * 0.45), (p1[0], p1[1], v + side * 0.45), (p0[0], p0[1], v + side * 0.45)], (-(p0[0] + p1[0]) / 2 + xc, -1, 0))
            oface(ACC if j in (5, 6) else STONE, [(p0[0], p0[1], v + side * 0.46), (p1[0], p1[1], v + side * 0.46), (p1[0], ys + rr + 1.0, v + side * 0.46), (p0[0], ys + rr + 1.0, v + side * 0.46)], (0, 0, side))


# ------------------------------------------------------------------ plan (local u, v; from the building parts)
def loc(pts):
    ca, sa = math.cos(ANG), math.sin(ANG)
    return [((x - CX) * ca + (z - CZ) * sa, -(x - CX) * sa + (z - CZ) * ca) for x, z in pts]


MAIN = [(-39.6, -7.9), (-34.4, -8.1), (-34.4, -11.0), (-8.5, -11.3), (0.8, -19.1), (15.9, -19.1), (17.3, -16.3), (19.3, -14.2), (20.7, -9.5), (26.0, -6.5),
        (27.7, -4.4), (29.0, -1.5), (28.4, 3.6), (26.0, 7.2), (22.4, 9.5), (19.4, 12.8), (19.0, 17.2), (16.9, 18.9), (10.0, 19.7), (-2.3, 19.7), (-8.7, 11.5),
        (-34.1, 11.3), (-34.1, 8.6), (-39.5, 8.4)]
DRUM_C = (7.1, -0.35)
B0 = 1.0       # top of the plinth / floor of the porticoes
WALL = 15.0    # main cornice

# plinth: the whole footprint with a margin, and steps on the west front and the gallery ends
PL = [(-41.5, -10.5), (-36.5, -10.5), (-36.5, -27.0), (13.5, -27.0), (24.0, -21.0), (33.5, -4.0), (33.5, 4.0), (24.0, 21.0), (13.5, 27.2), (-36.5, 27.2), (-36.5, 10.5), (-41.5, 10.5)]
hb.prism(PLINTH, PL, -0.8, B0)
for k in range(4):
    hb.box(PLINTH, -42.1 - k * 0.45, -0.8, 0, 0.45, B0 + 0.8 - (k + 1) * 0.25, 14.0 + k * 0.6)

# main walls with two tiers of windows, pilasters, frieze and cornice
walls_with_windows(MAIN, B0, WALL, [(3.4, 5.4, 1.7), (10.2, 2.9, 1.15)])
cornice(MAIN, WALL, out=0.55, h=1.0)
hb.cap(COPPER, H.orient(MAIN), WALL + 0.02)

# side galleries (porticoes) on the north and south: arcades on columns under green roofs
for side, (v_in, v_out) in ((1, (19.7, 25.4)), (-1, (-19.2, -25.2))):
    u0, u1 = -31.8, 12.0
    colonnade(u0, u1, v_out, B0, 8.6, 11, side)
    # entablature, roof slab, roof
    hb.box(TRIM, (u0 + u1) / 2, 8.6, v_out, u1 - u0 + 1.2, 0.5, 1.15)
    hb.box(STONE, (u0 + u1) / 2, 9.1, (v_in + v_out) / 2, u1 - u0 + 1.0, 0.45, abs(v_out - v_in) + 1.1)
    oface(COPPER, [(u0 - 0.5, 9.55, v_out + side * 0.55), (u1 + 0.5, 9.55, v_out + side * 0.55), (u1 + 0.5, 10.6, v_in), (u0 - 0.5, 10.6, v_in)], (0, 1, side * 0.3))
    for x in (u0, u1):
        hb.box(STONE, x, B0, (v_in + v_out) / 2, 1.2, 8.1, abs(v_out - v_in))
    # small domes on drums over the west ends of the galleries
    dz = side * 22.3
    hb.cyl(STONE, -28.6, 9.55, dz, 2.9, 2.3, segs=32)
    for j in range(8):
        a = 2 * math.pi * (j + 0.5) / 8
        hb.push(-28.6 + 2.9 * math.sin(a), 0, dz + 2.9 * math.cos(a), a)
        arch_window(0, 10.0, 0.55, 1.4, f=0.1, d=0.06, sill=False)
        hb.pop()
    cornice([(-28.6 + 2.9 * math.sin(2 * math.pi * k / 32), dz + 2.9 * math.cos(2 * math.pi * k / 32)) for k in range(32)], 11.85, out=0.25, h=0.4)
    dome(COPPER, -28.6, dz, 11.85, 3.1, 3.0, segs=32, rings=10)
    cross(-28.6, 14.85, dz, 2.0)

# west portal: three arched doorways under a gable, the steps in front
edge_w = {'a': (-39.6, -7.9), 'b': (-39.55, 8.4), 't': (0.0, 1.0), 'n': (-1.0, 0.0), 'L': 16.3}
edge_frame(edge_w)
for k, x in enumerate((3.3, 8.15, 13.0)):
    big = k == 1
    w, h = (3.2, 7.4) if big else (2.6, 6.0)
    oface('std:door', arch_pts(x, B0, w, h, 0.03), (0, 0, 1))
    arch_window(x, B0, w + 0.2, h + 0.1, f=0.55, d=0.45, glass='std:door', key=True, sill=False)
    # tympanum mosaic over the doors (dark gold)
    oface(GOLD, arch_pts(x, B0 + h - w / 2 + 0.2, w - 0.6, w / 2 - 0.4, 0.05), (0, 0, 1))
hb.box(TRIM, 8.15, 9.6, 0.4, 16.0, 0.6, 0.8)
hb.pop()

# ---- upper massing: the nave (west arm) with its barrel vault towards the bell tower
nave_lo = [(-34.0, -10.4), (-0.7, -10.6), (-0.6, 10.2), (-33.6, 10.6)]
walls_with_windows(nave_lo, WALL, 20.0, [(16.1, 3.0, 1.2)], frieze=False)
cornice(nave_lo, 20.0, out=0.4, h=0.7)
hb.cap(COPPER, H.orient(nave_lo), 20.02)
nave_hi = [(-19.9, -7.6), (2.4, -8.0), (2.6, 6.0), (-19.9, 6.4)]
walls_with_windows(nave_hi, 20.0, 24.0, [(20.8, 2.4, 1.0)], frieze=True)
cornice(nave_hi, 24.0, out=0.35, h=0.6)
vault(-19.9, 2.5, -7.8, 6.2, 24.2, 6.6)

# ---- the crossing: square base, the cascade of semi-domes, the drum and the gilded dome
dcx, dcz = DRUM_C
base = [(dcx - 10.2, dcz - 10.2), (dcx + 10.2, dcz - 10.2), (dcx + 10.2, dcz + 10.2), (dcx - 10.2, dcz + 10.2)]
walls_with_windows(base, WALL, 25.5, [(17.0, 4.2, 1.5)], frieze=True)
cornice(base, 25.5, out=0.5, h=0.9)
hb.cap(COPPER, H.orient(base), 25.52)
# semi-domes on the north, east and south arms (green copper), with their arched window bands below
for (ang, top, R) in ((math.pi / 2, 31.0, 10.4), (math.pi, 31.0, 10.4), (0.0, 26.0, 10.4)):
    ox, oz = dcx + 6.4 * math.sin(ang), dcz + 6.4 * math.cos(ang)
    spring = 21.5 if top > 30 else 19.0
    # half-cylinder wall under the semi-dome (outer face), windows round it
    segs = 18
    rows = []
    for y in (WALL, spring):
        rows.append([(ox + R * math.sin(ang - math.pi / 2 + math.pi * k / segs), y, oz + R * math.cos(ang - math.pi / 2 + math.pi * k / segs)) for k in range(segs + 1)])
    for k in range(segs):
        a = ang - math.pi / 2 + math.pi * (k + 0.5) / segs
        oface(STONE, [rows[0][k], rows[0][k + 1], rows[1][k + 1], rows[1][k]], (math.sin(a), 0, math.cos(a)), smooth=True)
    for j in range(5):
        a = ang - math.pi / 2 + math.pi * (j + 0.5) / 5
        hb.push(ox + R * math.sin(a), 0, oz + R * math.cos(a), a)
        arch_window(0, WALL + 1.2, 1.25, spring - WALL - 2.2, f=0.16, d=0.1)
        hb.pop()
    arc = [(ox + R * math.sin(ang - math.pi / 2 + math.pi * k / segs), oz + R * math.cos(ang - math.pi / 2 + math.pi * k / segs)) for k in range(segs + 1)]
    hb.sweep(TRIM, [(p[0], spring, p[1]) for p in arc], [(0.0, -0.5), (0.35, -0.3), (0.35, 0.0), (0.0, 0.0)])
    dome(COPPER, ox, oz, spring, R, top - spring, segs=36, rings=12, th=(ang - math.pi / 2, ang + math.pi / 2))
# drum with twelve windows and the gilded dome
drum(dcx, dcz, 25.5, 36.0, 9.3, 12, 5.6, 1.5, segs=60, cornice_out=0.6)
hb.cyl(TRIM, dcx, 36.0, dcz, 9.75, 0.35, segs=60)
dome(GOLD, dcx, dcz, 36.35, 9.4, 8.9, segs=72, rings=18)
# vertical gilded ribs on the dome
for j in range(12):
    a = 2 * math.pi * j / 12
    pts = []
    for i in range(13):
        phi = i / 12 * math.pi / 2
        pts.append((dcx + 9.48 * math.cos(phi) * math.sin(a), 36.35 + 8.98 * math.sin(phi), dcz + 9.48 * math.cos(phi) * math.cos(a)))
    for i in range(12):
        hb.beam(GOLD, pts[i], pts[i + 1], 0.16, 0.08)
lantern(dcx, dcz, 45.1, 1.0, 1.6)
cross(dcx, 48.0, dcz, 3.6)

# ---- east apse (semicircular, with a quarter-dome) and the small domes at the east corners
ax_, az_ = 21.9, 0.35
for y0, y1, R in ((WALL, 17.6, 5.6),):
    segs = 20
    rows = [[(ax_ + R * math.cos(-math.pi / 2 + math.pi * k / segs), y, az_ + R * math.sin(-math.pi / 2 + math.pi * k / segs)) for k in range(segs + 1)] for y in (y0, y1)]
    for k in range(segs):
        a = -math.pi / 2 + math.pi * (k + 0.5) / segs
        oface(STONE, [rows[0][k], rows[0][k + 1], rows[1][k + 1], rows[1][k]], (math.cos(a), 0, math.sin(a)), smooth=True)
    dome(COPPER, ax_, az_, y1, R, 4.0, segs=28, rings=10, th=(0.0, math.pi))
for dzc in (16.15, -15.7):
    cxs = 16.4
    drum(cxs, dzc, WALL, 19.0, 4.6, 8, 2.2, 0.8, segs=36, cornice_out=0.35)
    dome(COPPER, cxs, dzc, 19.0, 4.85, 4.4, segs=40, rings=12)
    lantern(cxs, dzc, 23.3, 0.5, 0.9, COPPER)
    cross(cxs, 24.7, dzc, 2.4)

# ---- the bell tower over the west front: shaft, open belfry, zakomara gables, drum and gilded dome
tu, tv = -26.4, -0.8
tw, td = 13.0, 12.4
shaft = [(tu - tw / 2, tv - td / 2), (tu + tw / 2, tv - td / 2), (tu + tw / 2, tv + td / 2), (tu - tw / 2, tv + td / 2)]
walls_with_windows(shaft, 20.0, 31.0, [(23.5, 4.6, 1.5)], frieze=True)
cornice(shaft, 31.0, out=0.45, h=0.8)
# belfry: three tall open arches per side with the bells hanging in them
bel = H.orient(shaft)
hb.ring(STONE, bel, 31.0, 41.5)
for e in H.edges(bel):
    edge_frame(e)
    L = e['L']
    for k in range(3):
        x = L * (k + 0.5) / 3
        oface(REC, arch_pts(x, 32.2, 2.5, 7.4, 0.03), (0, 0, 1))
        arch_window(x, 32.2, 2.5, 7.4, f=0.35, d=0.3, glass=REC, key=True, sill=False)
        # balustrade across the opening
        hb.box(TRIM, x, 32.2, 0.15, 2.4, 0.9, 0.25)
        for b in range(7):
            hb.cyl(TRIM, x - 1.05 + b * 0.35, 32.2, 0.15, 0.06, 0.85, segs=6)
    for k in range(4):
        hb.box(TRIM, L * k / 3, 31.3, 0.18, 0.7, 9.6, 0.36)
    hb.pop()
for k in range(3):
    for j in range(2):
        hb.sphere('std:bell', (tu - 3.5 + k * 3.5, 37.4 - j * 1.3, tv - 1.5 + j * 3.0), 0.8 - j * 0.25, segs=12, rings=8)
cornice(shaft, 41.5, out=0.5, h=0.9)
hb.cap(COPPER, bel, 41.52)
# zakomara gables (semicircular, one per side) round the base of the drum
for e in H.edges(bel):
    edge_frame(e)
    L = e['L']
    pts = [(L / 2 + (L / 2 - 0.5) * math.cos(math.pi * k / 16), 41.5 + 2.4 * math.sin(math.pi * k / 16)) for k in range(17)]
    oface(STONE, [(x, y, -0.6) for x, y in pts], (0, 0, 1))
    for k in range(16):
        a0, a1 = pts[k], pts[k + 1]
        oface(COPPER, [(a0[0], a0[1], -0.6), (a1[0], a1[1], -0.6), (a1[0], a1[1], -3.5), (a0[0], a0[1], -3.5)], (0, 1, 0))
        oface(TRIM, [(a0[0], a0[1], -0.58), (a1[0], a1[1], -0.58), (a1[0], a1[1] - 0.3, -0.45), (a0[0], a0[1] - 0.3, -0.45)], (0, 0, 1))
    hb.pop()
drum(tu, tv, 43.0, 46.2, 4.3, 8, 2.0, 0.7, segs=40, cornice_out=0.35)
dome(GOLD, tu, tv, 46.2, 4.5, 4.3, segs=48, rings=14)
lantern(tu, tv, 50.4, 0.55, 0.9)
cross(tu, 51.8, tv, 2.8)

hb.pop()

# ------------------------------------------------------------------ build, bake, export
ob = hb.build()
if '--nobake' not in sys.argv:
    H.add_ground(pk, hb, margin=20, step=4.0)
    H.lightmap_uv(ob)
    ao = H.bake_ao(ob, H.arg('--size', 2048, int), 4.0, H.arg('--samples', 48, int))
    H.save_ao(ao, NAME)
    H.export(ob, NAME, {'anchor': [CX, CZ], 'base': DATUM, 'source': 'tools/blender/hero/nevsky.py'})
if '--preview' in sys.argv:
    SP = os.environ.get('PREVIEW_DIR', '/tmp')
    if '--nobake' in sys.argv:
        H.add_ground(pk, hb, margin=40, step=4.0)
    ca, sa = math.cos(ANG), math.sin(ANG)
    def rel(u, h, v):
        x = CX + u * ca - v * sa
        z = CZ + u * sa + v * ca
        return (x - CX, pk.y(x, z) - DATUM + h, z - CZ)
    H.preview(f'{SP}/nevsky_w.jpg', rel(-120, 18, -30), rel(-10, 22, 0), lens=32)
    H.preview(f'{SP}/nevsky_se.jpg', rel(70, 30, 90), rel(0, 20, 0), lens=30)
    H.preview(f'{SP}/nevsky_n.jpg', rel(-10, 12, -75), rel(-5, 22, 0), lens=30)
