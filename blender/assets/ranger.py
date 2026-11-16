"""Ranger 1 — exterior from references 3, 4 and 5 (cabin from 6 and 7 is built by cabin()).

Frame: Blender +X starboard, +Y forward, +Z up. Stations s run from the rear face (0) to the nose tip (1) over
L = 17.4 m; the origin sits on the centreline at s = S0 with z = 0 on the flat belly (ground is at z = GROUND
when the gear is down). The plan outline, profile and every feature position come from the measurements in
docs/REFERENCE_NOTES.md and the traced top view of reference 3 (window cluster).

Hull reading (reference 3 top/side/rear, reference 5 close-ups):
  * a white rear block (s 0-0.16) carries the rear face: hatch panel between two octagonal thrusters;
  * a black U-frame wraps the radiator (s 0.075-0.18) and continues as two sloped bands whose outer edge drops
    from the rear corners to the apex (s 0.43, 4.55 m out, belly level) while the inner edge stays level beside
    the radiator and only descends from the cross-member (s 0.21);
  * forward of the apex the black edge rises again as a blade whose crest ends 1.12 m up above the nose bracket;
  * between canopy and bands the wing surface is quilted thermal blanket; forward it is black;
  * the canopy carries 28 framed windows in two rows per side; the fore-deck is flat and panelled.
"""
import bisect
import math
import os
import random
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "lib"))
from bl import *  # noqa: E402,F403
from fac import T, RX, RY, RZ  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

L = 17.4
S0 = 0.42
GROUND = -1.10


def Y(s):
    return (s - S0) * L


def S(y):
    return y / L + S0


def lerp(a, b, t):
    return a + (b - a) * t


def clamp(x, a=0.0, b=1.0):
    return max(a, min(b, x))


def pchip(table):
    """Monotone cubic interpolation of a (s, value) table: smooth, never overshoots."""
    xs = [p[0] for p in table]
    ys = [p[1] for p in table]
    n = len(xs)
    h = [xs[i + 1] - xs[i] for i in range(n - 1)]
    d = [(ys[i + 1] - ys[i]) / h[i] for i in range(n - 1)]
    m = [0.0] * n
    m[0], m[-1] = d[0], d[-1]
    for i in range(1, n - 1):
        if d[i - 1] * d[i] <= 0:
            m[i] = 0.0
        else:
            w1, w2 = 2 * h[i] + h[i - 1], h[i] + 2 * h[i - 1]
            m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i])

    def f(x):
        if x <= xs[0]:
            return ys[0]
        if x >= xs[-1]:
            return ys[-1]
        i = bisect.bisect_right(xs, x) - 1
        t = (x - xs[i]) / h[i]
        t2, t3 = t * t, t * t * t
        return ((2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h[i] * m[i]
                + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h[i] * m[i + 1])
    return f


# ----------------------------------------------------------------------------------------------- profile
ZT = pchip([(0.075, 1.92), (0.176, 1.92), (0.181, 2.06), (0.212, 2.06), (0.24, 2.08), (0.33, 2.10), (0.42, 2.0),
            (0.50, 1.82), (0.57, 1.60), (0.63, 1.38), (0.69, 1.15), (0.75, 1.00), (0.85, 0.90), (0.915, 0.84)])
CR = pchip([(0.075, 0.0), (0.181, 0.0), (0.212, 0.03), (0.24, 0.16), (0.33, 0.24), (0.45, 0.24), (0.55, 0.2),
            (0.63, 0.13), (0.72, 0.06), (0.80, 0.04), (0.915, 0.03)])
WT = pchip([(0.075, 2.22), (0.212, 2.22), (0.24, 1.98), (0.33, 2.05), (0.45, 2.05), (0.55, 1.95), (0.63, 1.85),
            (0.72, 1.80), (0.80, 1.84), (0.915, 1.70)])
WS = pchip([(0.075, 2.26), (0.212, 2.26), (0.24, 2.36), (0.33, 2.55), (0.43, 2.62), (0.55, 2.48), (0.65, 2.25),
            (0.72, 1.97), (0.80, 1.99), (0.915, 1.83)])
ZS = pchip([(0.075, 1.99), (0.181, 1.99), (0.212, 2.02), (0.24, 1.86), (0.33, 1.52), (0.43, 1.28), (0.55, 1.02),
            (0.65, 0.82), (0.72, 0.66), (0.80, 0.63), (0.915, 0.64)])
XB = pchip([(0.075, 2.7), (0.43, 2.9), (0.6, 2.7), (0.75, 2.25), (0.85, 1.95), (0.915, 1.8)])
ZB = pchip([(0.075, 0.0), (0.78, 0.0), (0.86, 0.14), (0.915, 0.38)])

S_FRAME_FRONT = 0.212   # front edge of the black cross-member in front of the radiator
S_APEX = 0.43
S_TIP = 0.905


def band_inner(s):
    if s <= S_FRAME_FRONT:
        return 2.30, 2.05
    w = clamp((s - S_FRAME_FRONT) / (0.42 - S_FRAME_FRONT))
    return lerp(2.30, 4.20, w), lerp(2.05, 0.45, w)


def band_outer(s):
    u = clamp((s - 0.075) / (S_APEX - 0.075))
    return lerp(3.0, 4.55, u), lerp(2.0, 0.30, u)


def rail_pts(s):
    """Black edge structure at station s: [trough / wing end, inner top, outer top, outer bottom]."""
    if s <= S_APEX:
        xi, zi = band_inner(s)
        xo, zo = band_outer(s)
        return [(xi - 0.03, zi - 0.07), (xi, zi), (xo, zo), (xo + 0.01, zo - 0.22)]
    v = clamp((s - S_APEX) / (S_TIP - S_APEX))
    xo = lerp(4.55, 2.24, v)
    zc = lerp(0.45, 1.12, v)
    wtb = lerp(0.35, 0.16, v)
    drop = lerp(0.15, 0.02, v)
    g = lerp(0.03, 0.10, v)
    ztr = lerp(0.38, 0.64, v)
    zob = lerp(0.08, 0.66, v) + 0.3 * clamp((v - 0.82) / 0.18) ** 2
    return [(xo - wtb - g, ztr), (xo - wtb, zc), (xo, zc - drop), (xo + 0.01, zob)]


FT = [0.0, 0.18, 0.36, 0.52, 0.66, 0.78, 0.89, 1.0]
N_TOPSIDE = 12          # points 0..11 are the canopy top + shoulder


def section(s):
    """Right half of the hull section at station s, from the top centreline round to the belly centreline.
    Returns points (x, z) and one label per edge."""
    zt, cr, wt, ws, zs = ZT(s), CR(s), WT(s), WS(s), ZS(s)
    pts = [(wt * f, zt - cr * f * f) for f in FT]
    lab = ["top"] * 7
    p0, p2 = Vector(pts[-1]), Vector((ws, zs))
    slope = 2 * cr / max(wt, 1e-3)
    c = Vector((ws, max(zs, p0.y - slope * (ws - wt))))
    for t in (0.25, 0.5, 0.75, 1.0):
        q = p0 * (1 - t) ** 2 + c * (2 * t * (1 - t)) + p2 * (t * t)
        pts.append((q.x, q.y))
    lab += ["side"] * 4
    rail = rail_pts(s)
    w0, w1 = Vector((ws, zs)), Vector(rail[0])
    for t in (0.25, 0.5, 0.75, 1.0):
        q = w0.lerp(w1, t)
        pts.append((q.x, q.y))
    lab += ["wing0", "wing1", "wing2", "wing3"]
    pts += rail[1:]
    lab += ["rail_in", "rail_top", "rail_out"]
    xb, zb = XB(s), ZB(s)
    ob = Vector(rail[3])
    lo = Vector((xb + 0.18, zb + 0.10))
    mid = ob.lerp(lo, 0.5)
    # inside the rear block the flank tucks in so it never fights with the block's own side
    k = clamp((0.17 - s) / 0.03)
    if k > 0:
        mid = mid.lerp(Vector((2.78, ob.y - 0.45)), k)
        lo = lo.lerp(Vector((2.68, 0.10)), k)
    pts += [(mid.x, mid.y), (lo.x, lo.y), (xb, zb), (xb * 0.55, zb), (0.0, zb)]
    lab += ["flank_hi", "flank_lo", "belly", "belly", "belly"]
    return pts, lab


def interp_x(pts, x):
    """z on a polyline that is monotonic in x (clamped at the ends)."""
    x = abs(x)
    for (x0, z0), (x1, z1) in zip(pts[:-1], pts[1:]):
        if x0 <= x <= x1 and x1 > x0:
            return lerp(z0, z1, (x - x0) / (x1 - x0))
    return pts[-1][1] if x > pts[-1][0] else pts[0][1]


def canopy_z(x, s):
    pts, _ = section(s)
    return interp_x(pts[:N_TOPSIDE], x)


def wing_z(x, s):
    pts, _ = section(s)
    return interp_x(pts[N_TOPSIDE - 1:N_TOPSIDE + 4], x)


def band_z(x, s):
    """Height of the black band top (inner top -> outer top) at station s."""
    (xi, zi), (xo, zo) = rail_pts(s)[1], rail_pts(s)[2]
    return lerp(zi, zo, clamp((abs(x) - xi) / max(1e-4, xo - xi)))


def seg_mat(s, lab):
    if lab in ("top", "side"):
        return "hull_white" if s >= S_FRAME_FRONT else "hull_black"
    if lab.startswith("wing"):
        j = int(lab[-1])
        # quilted blanket on the flanks; the boundary to the black forward wing runs diagonally (reference 5)
        return "hull_blanket" if S_FRAME_FRONT < s < 0.665 - 0.035 * j else "hull_black"
    if lab == "flank_hi":
        return "hull_white" if s < 0.225 else "hull_black"
    if lab in ("rail_in", "rail_top", "rail_out", "flank_lo"):
        return "hull_black"
    return "hull_tiles"


# ----------------------------------------------------------------------------------------------- helpers
class MeshAcc:
    """Indexed mesh accumulator with shared vertices, one per material."""

    def __init__(self):
        self.v, self.f, self.idx = [], [], {}

    def vid(self, p):
        k = (round(p[0], 5), round(p[1], 5), round(p[2], 5))
        i = self.idx.get(k)
        if i is None:
            i = self.idx[k] = len(self.v)
            self.v.append(tuple(p))
        return i

    def face(self, pts):
        ids = [self.vid(p) for p in pts]
        if len(set(ids)) >= 3:
            self.f.append(ids)


def emit(P, groups, **kw):
    for mat_name, acc in groups.items():
        if acc.f:
            P.mesh(acc.v, acc.f, mat=mat_name, bevel=0, recalc=False, **kw)


def round_poly(poly, r=0.07, seg=4):
    """Fillet the corners of a closed polygon (counter-clockwise list of (x, y))."""
    n = len(poly)
    out = []
    for i in range(n):
        p0, p1, p2 = Vector(poly[i - 1]), Vector(poly[i]), Vector(poly[(i + 1) % n])
        a, b = (p0 - p1), (p2 - p1)
        la, lb = a.length, b.length
        if la < 1e-6 or lb < 1e-6:
            continue
        a, b = a / la, b / lb
        ang = math.acos(clamp(a.dot(b), -1, 1))
        rr = min(r, la * 0.4 * math.tan(ang / 2), lb * 0.4 * math.tan(ang / 2))
        t = rr / max(1e-6, math.tan(ang / 2))
        q0, q2 = p1 + a * t, p1 + b * t
        for k in range(seg + 1):
            u = k / seg
            q = q0 * (1 - u) ** 2 + p1 * (2 * u * (1 - u)) + q2 * u * u
            out.append((q.x, q.y))
    return out


def area2(poly):
    return sum(poly[i - 1][0] * poly[i][1] - poly[i][0] * poly[i - 1][1] for i in range(len(poly))) * 0.5


def offset_poly(poly, d):
    """Offset a counter-clockwise closed polygon outward by d (miter, clamped)."""
    n = len(poly)
    out = []
    for i in range(n):
        p0, p1, p2 = Vector(poly[i - 1]), Vector(poly[i]), Vector(poly[(i + 1) % n])
        e0, e1 = (p1 - p0), (p2 - p1)
        n0 = Vector((e0.y, -e0.x)).normalized() if e0.length > 1e-7 else Vector((0, 0))
        n1 = Vector((e1.y, -e1.x)).normalized() if e1.length > 1e-7 else n0
        m = (n0 + n1)
        if m.length < 1e-6:
            m = n1
        m.normalize()
        k = 1.0 / max(0.5, m.dot(n1))
        q = p1 + m * d * k
        out.append((q.x, q.y))
    return out


def oct_pts(w, h, c, c2=None):
    """Chamfered rectangle (x, z) centred on 0: c = top chamfer, c2 = bottom chamfer."""
    c2 = c if c2 is None else c2
    return [(w / 2, -h / 2 + c2), (w / 2, h / 2 - c), (w / 2 - c, h / 2), (-w / 2 + c, h / 2), (-w / 2, h / 2 - c),
            (-w / 2, -h / 2 + c2), (-w / 2 + c2, -h / 2), (w / 2 - c2, -h / 2)]


def ring_xz(P, outer, inner, y0, y1, M, mat, mat_in=None):
    """Frame between two closed (x, z) outlines, extruded from y0 (on the face) back to y1 (protruding)."""
    acc = {mat: MeshAcc()}
    a = acc[mat]
    n = len(outer)
    for i in range(n):
        j = (i + 1) % n
        o0, o1, i0, i1 = outer[i], outer[j], inner[i], inner[j]
        a.face([(o0[0], y1, o0[1]), (o1[0], y1, o1[1]), (i1[0], y1, i1[1]), (i0[0], y1, i0[1])])
        a.face([(o0[0], y0, o0[1]), (o1[0], y0, o1[1]), (o1[0], y1, o1[1]), (o0[0], y1, o0[1])])
        b = acc.setdefault(mat_in or mat, MeshAcc())
        b.face([(i0[0], y1, i0[1]), (i1[0], y1, i1[1]), (i1[0], y0, i1[1]), (i0[0], y0, i0[1])])
    for m, ac in acc.items():
        if ac.f:
            P.mesh(ac.v, ac.f, mat=m, M=M, bevel=0, recalc=True)


# ----------------------------------------------------------------------------------------------- windows
# Window outlines traced on the near-orthographic top view of reference 3 (2x crop, offset 380, 330 in the
# 1824 px panel; centreline at cy = 460; 96 px per metre). Port side; the starboard row is the mirror image.
WIN_CROP = [
    [(65, 295), (200, 290), (213, 320), (200, 370), (85, 385), (63, 350)],
    [(283, 245), (440, 255), (555, 320), (572, 395), (545, 415), (325, 378), (288, 315)],
    [(508, 262), (640, 250), (684, 300), (697, 402), (600, 412), (568, 330)],
    [(745, 300), (828, 250), (912, 282), (935, 380), (918, 413), (745, 413)],
    [(712, 265), (790, 262), (742, 296), (716, 300)],
    [(955, 268), (1012, 262), (1098, 365), (1104, 410), (1080, 432), (985, 432), (952, 300)],
    [(1062, 240), (1138, 240), (1148, 330), (1132, 372), (1100, 350), (1062, 275)],
    [(1174, 232), (1325, 190), (1352, 260), (1360, 395), (1335, 410), (1182, 372), (1170, 300)],
    [(1165, 402), (1262, 405), (1270, 438), (1250, 446), (1165, 446)],
    [(172, 45), (420, 42), (442, 88), (428, 128), (192, 132), (170, 95)],
    [(485, 80), (610, 62), (735, 50), (745, 105), (712, 190), (590, 186), (495, 135)],
    [(772, 68), (912, 64), (925, 105), (905, 135), (790, 136), (768, 100)],
    [(1062, 62), (1150, 60), (1165, 140), (1080, 160), (1058, 140)],
    [(1182, 98), (1262, 92), (1285, 132), (1265, 160), (1186, 158)],
]


def window_polys():
    """Plan outlines (x, y) in metres, counter-clockwise, rounded; port and starboard."""
    out = []
    for poly in WIN_CROP:
        pts = []
        for cx, cy in poly:
            s = (cx / 2 + 325.0) / 1670.0
            xp = (230.0 - cy / 2) / 96.0
            pts.append((xp, Y(s)))
        for side in (1, -1):
            pp = [(side * x, y) for x, y in pts]
            if area2(pp) < 0:
                pp.reverse()
            out.append(round_poly(pp, 0.075, 4))
    return out


# ----------------------------------------------------------------------------------------------- body
def stations():
    st = {round(0.075 + k * 0.01, 4) for k in range(0, 85)}
    st |= {0.075, 0.08, 0.176, 0.178, 0.18, 0.182, 0.205, 0.21, 0.212, 0.215, 0.42, 0.425, 0.43, 0.435, 0.70, 0.86,
           0.88, 0.9, 0.905, 0.91, 0.915}
    return sorted(s for s in st if 0.075 <= s <= 0.915)


def body():
    st = stations()
    rings = [(s, section(s)) for s in st]
    hull, canopy = {}, {}
    for i in range(len(rings) - 1):
        sa, (pa, lab) = rings[i]
        sb, (pb, _) = rings[i + 1]
        sm = (sa + sb) / 2
        ya, yb = Y(sa), Y(sb)
        for j in range(len(pa) - 1):
            m = seg_mat(sm, lab[j])
            dest = canopy if (lab[j] in ("top", "side") and S_FRAME_FRONT <= sm <= 0.70) else hull
            acc = dest.setdefault(m, MeshAcc())
            a, b = (pa[j][0], ya, pa[j][1]), (pa[j + 1][0], ya, pa[j + 1][1])
            c, d = (pb[j + 1][0], yb, pb[j + 1][1]), (pb[j][0], yb, pb[j][1])
            acc.face([a, b, c, d])
            ma, mb, mc, md = [(-p[0], p[1], p[2]) for p in (a, b, c, d)]
            acc.face([ma, md, mc, mb])
    # front cap behind the nose bracket
    pf, _ = section(0.915)
    yf = Y(0.915)
    ring = [(x, yf, z) for x, z in pf] + [(-x, yf, z) for x, z in reversed(pf[1:-1])]
    hull.setdefault("hull_black", MeshAcc()).face(ring)
    H = Part("ranger_hull")
    emit(H, hull)
    C = Part("ranger_canopy")
    emit(C, canopy)
    C._slot("padding_dark")
    C._slot("hull_black")
    return H, C


HATCHES = []


def rear_block():
    """White rear block with rounded rear edges, black lower skirt, rear face recesses."""
    P = Part("ranger_rear")

    def sec(inset):
        hw, top, bot = 3.0 - inset, 1.92 - inset * 0.9, inset * 0.4
        r = 0.62 - inset * 0.4
        pts = [(0.0, top), (1.1, top), (hw - r, top)]
        for k in range(1, 6):
            a = math.pi / 2 * (1 - k / 5)
            pts.append((hw - r + math.cos(a) * r, top - r + math.sin(a) * r))
        pts += [(hw, 0.78), (hw, 0.5), (hw - 0.05, 0.24), (hw - 0.24, bot), (1.25, bot), (0.0, bot)]
        return pts

    st = [(0.0, 0.12), (0.003, 0.06), (0.008, 0.02), (0.014, 0.0), (0.06, 0.0), (0.11, 0.0), (0.16, 0.0)]
    rings = [(Y(s), sec(i)) for s, i in st]
    acc = {}
    for (ya, pa), (yb, pb) in zip(rings[:-1], rings[1:]):
        for j in range(len(pa) - 1):
            zm = (pa[j][1] + pa[j + 1][1]) / 2
            m = "hull_white" if zm > 0.62 else "hull_black"
            ac = acc.setdefault(m, MeshAcc())
            a, b = (pa[j][0], ya, pa[j][1]), (pa[j + 1][0], ya, pa[j + 1][1])
            c, d = (pb[j + 1][0], yb, pb[j + 1][1]), (pb[j][0], yb, pb[j][1])
            ac.face([a, b, c, d])
            ac.face([(-a[0], a[1], a[2]), (-d[0], d[1], d[2]), (-c[0], c[1], c[2]), (-b[0], b[1], b[2])])
    # rear face, normal -Y, with the docking passage cut through it
    from mathutils.geometry import tessellate_polygon
    y0, p0 = rings[0]
    outline = [(x, z) for x, z in p0] + [(-x, z) for x, z in reversed(p0[1:-1])]
    hole_c = [(math.cos(a) * 0.61, 0.98 + math.sin(a) * 0.61) for a in [2 * math.pi * i / 40 for i in range(40)]]
    loops = [outline, hole_c]
    flat = [p for l in loops for p in l]
    for t in tessellate_polygon([[Vector((x, z, 0.0)) for x, z in l] for l in loops]):
        tri = [(flat[i][0], y0, flat[i][1]) for i in t]
        # orient each triangle so its normal points -Y
        a, b, c = (Vector(v) for v in tri)
        if (b - a).cross(c - a).y > 0:
            tri = tri[::-1]
        acc.setdefault("hull_gray", MeshAcc()).face(tri)
    emit(P, acc)
    yr = Y(0.0)
    F = Matrix.Identity(4)
    # ---- thrusters: three nested octagonal frames, dark throat with a horizontal vane
    for side in (1, -1):
        cx, cz = side * 1.945, 0.80
        M = T((cx, 0, cz))
        o1, i1 = oct_pts(1.80, 1.02, 0.30, 0.16), oct_pts(1.58, 0.86, 0.24, 0.12)
        o2, i2 = i1, oct_pts(1.40, 0.72, 0.2, 0.1)
        o3, i3 = i2, oct_pts(1.24, 0.60, 0.16, 0.08)
        if side < 0:
            o1, i1, o2, i2, o3, i3 = [[(-x, z) for x, z in p] for p in (o1, i1, o2, i2, o3, i3)]
        ring_xz(P, o1, i1, yr, yr - 0.30, M, "hull_black", "gear_metal")
        ring_xz(P, o2, i2, yr - 0.02, yr - 0.22, M, "gear_metal", "thruster")
        ring_xz(P, o3, i3, yr - 0.02, yr - 0.13, M, "thruster", "engine_dark")
        P.box((1.26, 0.04, 0.62), at=(cx, yr - 0.03, cz), mat="engine_dark", bevel=0.005)
        P.box((0.86, 0.10, 0.07), at=(cx, yr - 0.09, cz), mat="gear_silver", bevel=0.01)
        for k in range(5):
            P.box((0.03, 0.06, 0.5), at=(cx - 0.46 + k * 0.23, yr - 0.06, cz), mat="metal_dark", bevel=0.004)
    # ---- hatch panel, docking ring, hatch door, latches, release handles
    hz = 0.98
    hole = [(math.cos(a) * 0.61, hz + math.sin(a) * 0.61) for a in [2 * math.pi * i / 40 for i in range(40)]]
    rect = lambda w, h: [(-w / 2, 0.90 - h / 2), (w / 2, 0.90 - h / 2), (w / 2, 0.90 + h / 2), (-w / 2, 0.90 + h / 2)]
    # panels with the docking passage through them (prisms extrude +Y from their base plane)
    P.prism(rect(1.96, 1.60), 0.08, plane="XZ", at=(0, yr - 0.08, 0), mat="hull_gray", bevel=0.02, holes=[hole[::-1]])
    P.prism(rect(1.86, 1.50), 0.02, plane="XZ", at=(0, yr - 0.095, 0), mat="hull_white_fine", bevel=0.005, holes=[hole[::-1]])
    ring_prof = [(0.60, 0.0), (0.74, 0.0), (0.74, 0.05), (0.71, 0.13), (0.62, 0.15), (0.60, 0.12)]
    P.lathe(ring_prof, M=T((0, yr - 0.08, hz)) @ RX(90), mat="gear_metal", segs=48)
    # the outer docking hatch: a movable part that slides aside into the rear block once the seals are made
    Hh = Part("ranger_hatch_outer")
    Hh.cyl(0.6, 0.05, M=T((0, -0.02, 0)) @ RX(90), mat="hull_gray", segs=48, bevel=0.01)
    Hh.cyl(0.16, 0.08, M=T((0, -0.06, 0)) @ RX(90), mat="metal_dark", segs=24, bevel=0.01)
    for k in range(8):
        a = k * 45
        Mk = T((0, -0.05, 0)) @ RY(a)
        Hh.box((0.07, 0.05, 0.42), M=Mk @ T((0, 0, 0.36)), mat="gear_metal", bevel=0.01)
        Hh.box((0.13, 0.04, 0.09), M=Mk @ T((0, -0.01, 0.55)), mat="metal_dark", bevel=0.01)
        Hh.cyl(0.035, 0.05, M=Mk @ T((0, -0.03, 0.2)) @ RX(90), mat="metal_bare", segs=10, bevel=0.004)
    Hh.tube(0.40, 0.36, 0.04, M=T((0, -0.05, 0)) @ RX(90), mat="metal_dark", segs=40, bevel=0.004)
    # inner face (seen from the docking tunnel): padded, with a handwheel
    Hh.cyl(0.55, 0.02, M=T((0, 0.015, 0)) @ RX(90), mat="padding_light", segs=40, bevel=0.005)
    Hh.tube(0.2, 0.17, 0.03, M=T((0, 0.04, 0)) @ RX(90), mat="metal_chrome", segs=24, bevel=0.004)
    for k in range(3):
        Hh.box((0.34, 0.02, 0.025), M=T((0, 0.04, 0)) @ RY(60 * k), mat="metal_chrome", bevel=0.004)
    HATCHES.append((Hh, (0, yr - 0.10, hz), dict(id="outer", part="hatch_outer", axis=[1, 0, 0], travel=1.25, label="Docking hatch")))
    for sx, sz in ((-0.78, 1.58), (0.78, 1.58), (-0.78, 0.26), (0.78, 0.26)):
        P.cyl(0.075, 0.05, M=T((sx, yr - 0.1, sz)) @ RX(90), mat="gear_metal", segs=20, bevel=0.01)
        P.tube(0.08, 0.06, 0.055, M=T((sx, yr - 0.1, sz)) @ RX(90), mat="handle_yellow", segs=20, bevel=0.004)
        P.box((0.03, 0.04, 0.09), M=T((sx, yr - 0.13, sz)) @ RY(45), mat="metal_dark", bevel=0.004)
    P.text("RF-31D", size=0.075, M=T((0.62, yr - 0.096, 1.55)) @ RX(90), mat="paint_black", depth=0.002)
    P.box((0.16, 0.004, 0.09), at=(0.62, yr - 0.096, 0.22), mat="paint_red", bevel=0)    # flag decal
    P.box((0.07, 0.006, 0.05), at=(0.585, yr - 0.097, 0.24), mat="paint_blue", bevel=0)
    P.cyl(0.06, 0.004, M=T((-0.62, yr - 0.097, 0.22)) @ RX(90), mat="paint_blue", segs=20, bevel=0)
    # ---- black stepped side panel with three slanted louvres, both sides (reference 3 paint mask)
    prof = [(Y(0.012), 0.42), (Y(0.012), 0.76), (Y(0.034), 0.76), (Y(0.040), 1.04), (Y(0.094), 1.04), (Y(0.100), 0.94),
            (Y(0.114), 0.94), (Y(0.120), 0.84), (Y(0.134), 0.84), (Y(0.158), 0.56), (Y(0.158), 0.42)]
    for side in (1, -1):
        M = T((side * 3.0, 0, 0)) @ (Matrix.Identity(4) if side > 0 else Matrix.Scale(-1, 4, Vector((1, 0, 0))))
        P.prism([(y, z) for y, z in prof], 0.03, plane="YZ", M=M, mat="hull_black", bevel=0.006)
        for k in range(3):
            yy = Y(0.045 + k * 0.022)
            Ml = M @ T((0.031, yy, 0.62)) @ RX(-24)
            P.cyl(0.11, 0.012, M=Ml @ RY(90) @ Matrix.Diagonal((2.1, 1.0, 1.0, 1.0)), mat="engine_dark", segs=20, bevel=0)
            P.tube(0.12, 0.105, 0.02, M=Ml @ RY(90) @ Matrix.Diagonal((2.1, 1.0, 1.0, 1.0)), mat="metal_dark", segs=20, bevel=0)
        Mt = T((side * 3.034, Y(0.12), 1.2)) @ RZ(90 * side) @ RX(90)
        P.text("RF-31D", size=0.13, M=Mt, mat="paint_black", depth=0.002)
        P.cyl(0.09, 0.004, M=T((side * 3.033, Y(0.12), 1.42)) @ RY(90), mat="paint_blue", segs=20, bevel=0)
    # ---- ventral lift engines either side of the keel, near the centre of mass: louvred grilles over the nozzles
    for side in (1, -1):
        cx, cy = side * 1.55, Y(0.395)
        P.box((1.2, 1.5, 0.08), at=(cx, cy, -0.04), mat="hull_black", bevel=0.02)
        P.box((1.04, 1.34, 0.04), at=(cx, cy, -0.085), mat="engine_dark", bevel=0.005)
        for k in range(7):
            P.box((1.0, 0.05, 0.12), at=(cx, cy - 0.6 + k * 0.2, -0.12), rot=(25, 0, 0), mat="gear_metal", bevel=0.005)
        P.cyl(0.42, 0.06, at=(cx, cy, -0.06), mat="thruster", segs=24, bevel=0)
    # ---- keel pod under the rear half
    kp = [(-1.05, Y(0.0)), (1.05, Y(0.0)), (1.05, Y(0.47)), (0.7, Y(0.5)), (-0.7, Y(0.5)), (-1.05, Y(0.47))]
    P.prism(kp, 0.26, at=(0, 0, -0.25), mat="hull_tiles", bevel=0.03)
    return P


def frame_and_radiator():
    P = Part("ranger_frame")
    # radiator: 16 finned slats in the well, plus a lip at the rear
    n = 16
    for k in range(n):
        x = -2.2 + 4.4 * (k + 0.5) / n
        P.box((4.4 / n - 0.012, Y(0.174) - Y(0.082), 0.07), at=(x, (Y(0.082) + Y(0.174)) / 2, 1.955), mat="radiator", bevel=0.004)
    P.box((4.62, 0.10, 0.16), at=(0, Y(0.075) + 0.02, 1.98), mat="hull_black", bevel=0.02)
    P.box((4.62, 0.06, 0.05), at=(0, Y(0.176) + 0.04, 1.99), mat="hull_black", bevel=0.01)
    # stepped slats down the start of each band (reference 5)
    for side in (1, -1):
        for k in range(3):
            s0, s1 = 0.088 + k * 0.012, 0.150 + k * 0.012
            x = 2.5 + k * 0.26
            sm = (s0 + s1) / 2
            z = band_z(x, sm)
            zx = band_z(x + 0.1, sm) - band_z(x - 0.1, sm)
            tilt = math.degrees(math.atan2(zx, 0.2))
            M = T((side * x, (Y(s0) + Y(s1)) / 2, z + 0.03)) @ RY(-tilt * side)
            P.box((0.2, Y(s1) - Y(s0), 0.05), M=M, mat="radiator", bevel=0.004)
            P.box((0.24, Y(s1) - Y(s0) + 0.06, 0.03), M=M @ T((0, 0, -0.03)), mat="hull_black", bevel=0.004)
    return P


def nose():
    P = Part("ranger_nose")
    y0, y1 = Y(0.905), Y(1.0)
    yc = y1 - 0.43
    outer = [(-2.24, y0), (-1.68, y0), (-1.68, yc), (1.68, yc), (1.68, y0), (2.24, y0), (2.24, y1 - 0.16), (2.08, y1),
             (-2.08, y1), (-2.24, y1 - 0.16)]
    holes = []
    for side in (1, -1):
        for k, (yy, rx, ry) in enumerate(((y0 + 0.28, 0.1, 0.16), (y0 + 0.62, 0.11, 0.19), (y0 + 0.98, 0.11, 0.17), (y1 - 0.42, 0.1, 0.12), (y1 - 0.2, 0.07, 0.07))):
            cx = side * 1.96
            h = [(cx + math.cos(a) * rx, yy + math.sin(a) * ry) for a in [2 * math.pi * i / 14 for i in range(14)]]
            holes.append(h)
    P.prism(outer, 0.42, at=(0, 0, 0.42), mat="hull_black", bevel=0.03, holes=holes)
    # deck inside the bracket and the underside
    P.box((3.36, yc - y0 + 0.02, 0.05), at=(0, (y0 + yc) / 2, 0.815), mat="hull_white", bevel=0.01)
    P.box((3.36, yc - y0 + 0.02, 0.05), at=(0, (y0 + yc) / 2, 0.44), mat="hull_black", bevel=0.01)
    # RCS clusters on the bracket corners
    for side in (1, -1):
        for dy in (0.2, 0.5):
            P.box((0.05, 0.16, 0.12), at=(side * 2.255, y1 - dy, 0.63), mat="metal_dark", bevel=0.01)
        P.box((0.16, 0.05, 0.12), at=(side * 1.6, y1 + 0.01, 0.63), mat="metal_dark", bevel=0.01)
    P.text("RF-31D", size=0.16, M=T((-0.32, Y(0.9), 0.0)) @ T((0, 0, ZT(0.9) + 0.006)) @ RZ(90), mat="paint_black", depth=0.002)
    return P


# ----------------------------------------------------------------------------------------------- canopy
def cut_windows(canopy_obj, polys):
    cutter = Part("_wcut")
    for poly in polys:
        cutter.prism(poly, 3.2, at=(0, 0, 0.6), mat="hull_black", bevel=0)
    co = cutter.finish(weighted=False)
    md = canopy_obj.modifiers.new("solid", "SOLIDIFY")
    md.thickness = 0.06
    md.offset = -1.0
    md.use_even_offset = True
    md.material_offset = 1
    md.material_offset_rim = 2
    apply_modifiers(canopy_obj)
    boolean(canopy_obj, co)
    return canopy_obj


def window_details(polys):
    F = Part("ranger_windows")
    G = Part("ranger_glass")
    fw = 0.075
    for poly in polys:
        inner = poly
        outer = offset_poly(poly, fw)
        n = len(inner)
        acc = MeshAcc()
        zi = [canopy_z(x, S(y)) for x, y in inner]
        zo = [canopy_z(x, S(y)) for x, y in outer]
        for i in range(n):
            j = (i + 1) % n
            pi, pj, qi, qj = inner[i], inner[j], outer[i], outer[j]
            it = [(pi[0], pi[1], zi[i] + 0.034), (pj[0], pj[1], zi[j] + 0.034)]
            ot = [(qi[0], qi[1], zo[i] + 0.026), (qj[0], qj[1], zo[j] + 0.026)]
            ob = [(qi[0], qi[1], zo[i] - 0.012), (qj[0], qj[1], zo[j] - 0.012)]
            ib = [(pi[0], pi[1], zi[i] - 0.08), (pj[0], pj[1], zi[j] - 0.08)]
            acc.face([it[0], ot[0], ot[1], it[1]])      # top (normal up for a counter-clockwise outline)
            acc.face([ot[0], ob[0], ob[1], ot[1]])      # outer wall
            acc.face([ib[0], it[0], it[1], ib[1]])      # inner wall, faces the window opening
        F.mesh(acc.v, acc.f, mat="hull_black", bevel=0, recalc=False)
        # bolt studs along the frame centre line
        mid = offset_poly(poly, fw * 0.5)
        pts3 = [Vector(p) for p in mid] + [Vector(mid[0])]
        run, nxt = 0.0, 0.03
        for p, q in zip(pts3[:-1], pts3[1:]):
            seg = (q - p).length
            while nxt <= run + seg:
                c = p.lerp(q, (nxt - run) / max(seg, 1e-6))
                z = canopy_z(c.x, S(c.y)) + 0.034
                F.box((0.014, 0.014, 0.01), at=(c.x, c.y, z + 0.004), mat="gear_silver", bevel=0)
                nxt += 0.065
            run += seg
        # glass, recessed into the reveal
        ga = MeshAcc()
        ga.face([(x, y, canopy_z(x, S(y)) - 0.03) for x, y in inner])
        G.mesh(ga.v, ga.f, mat="glass_cockpit", bevel=0, recalc=False, smooth=False)
    return F, G


def vents():
    """Black vent panels with oval openings and a small service panel on each wing (reference 5)."""
    P = Part("ranger_vents")
    rnd = random.Random(31)
    for side in (1, -1):
        acc = MeshAcc()
        ss = [0.27 + k * 0.01 for k in range(14)]
        rows = []
        for s in ss:
            xi = band_inner(s)[0]
            x0, x1 = max(WS(s) + 0.06, xi - 0.66), xi - 0.08
            rows.append([(lerp(x0, x1, t), s) for t in (0.0, 0.33, 0.66, 1.0)])
        for a, b in zip(rows[:-1], rows[1:]):
            for k in range(3):
                p = [a[k], a[k + 1], b[k + 1], b[k]]
                acc.face([(side * x, Y(s), wing_z(x, s) + 0.035) for x, s in (p if side > 0 else p[::-1])])
        n_r = len(rows)
        border = [rows[i][0] for i in range(n_r)] + [rows[-1][k] for k in (1, 2, 3)] + \
                 [rows[i][3] for i in reversed(range(n_r - 1))] + [rows[0][k] for k in (2, 1)]
        for i in range(len(border)):
            (xa, sa), (xb, sb) = border[i], border[(i + 1) % len(border)]
            q = [(xa, sa, 0.035), (xb, sb, 0.035), (xb, sb, -0.01), (xa, sa, -0.01)]
            acc.face([(side * x, Y(s_), wing_z(x, s_) + dz) for x, s_, dz in q])
        P.mesh(acc.v, acc.f, mat="hull_black", bevel=0, recalc=True)
        # oval openings
        for k, (s, rx, ry) in enumerate(((0.285, 0.10, 0.20), (0.31, 0.13, 0.25), (0.338, 0.12, 0.22), (0.362, 0.1, 0.1), (0.378, 0.09, 0.09), (0.396, 0.06, 0.06))):
            xi = band_inner(s)[0]
            x = (max(WS(s) + 0.06, xi - 0.66) + xi - 0.08) / 2
            z0, z1 = wing_z(x - 0.2, s), wing_z(x + 0.2, s)
            tilt = math.degrees(math.atan2(z1 - z0, 0.4))
            M = T((side * x, Y(s), wing_z(x, s) + 0.037)) @ RY(-tilt * side) @ RZ(rnd.uniform(-10, 10))
            P.cyl(1.0, 0.006, M=M @ Matrix.Diagonal((rx, ry, 1.0, 1.0)), mat="engine_dark", segs=20, bevel=0)
            P.tube(1.0, 0.86, 0.012, M=M @ Matrix.Diagonal((rx * 1.12, ry * 1.08, 1.0, 1.0)), mat="metal_dark", segs=20, bevel=0)
        # service panel inboard of the vents: connectors and dots
        s = 0.298
        x = WS(s) + 0.38
        z0, z1 = wing_z(x - 0.2, s), wing_z(x + 0.2, s)
        tilt = math.degrees(math.atan2(z1 - z0, 0.4))
        M = T((side * x, Y(s), wing_z(x, s) + 0.02)) @ RY(-tilt * side)
        P.box((0.46, 0.52, 0.03), M=M, mat="hull_gray", bevel=0.006)
        for i in range(3):
            P.cyl(0.05, 0.02, M=M @ T((0.13, -0.16 + i * 0.16, 0.02)), mat="metal_dark", segs=16, bevel=0.004)
            for j in range(3):
                P.cyl(0.012, 0.012, M=M @ T((-0.17 + j * 0.06, -0.18 + i * 0.13, 0.02)), mat="paint_black", segs=8, bevel=0)
        P.cyl(0.08, 0.02, M=M @ T((-0.02, 0.17, 0.02)), mat="metal_bare", segs=20, bevel=0.004)
    return P


# ----------------------------------------------------------------------------------------------- gear
def strut(P, a, b, r, mat):
    a, b = Vector(a), Vector(b)
    d = b - a
    q = Vector((0, 0, 1)).rotation_difference(d.normalized()).to_matrix().to_4x4()
    P.cyl(r, d.length, M=T((a + b) / 2) @ q, mat=mat, segs=12, bevel=min(0.01, r * 0.3))


def main_gear(side):
    """Twin-strut main leg splayed out beyond the apex, retraction cylinder, long skid foot. Origin at the hinge.
    Retracts by swinging back and inward about the horizontal axis normal to the leg plane."""
    H = Vector((side * 3.9, Y(0.47), 0.10))
    F = Vector((side * 5.0, Y(0.575), GROUND + 0.16))
    P = Part(f"gear_main_{'r' if side > 0 else 'l'}")
    rel = lambda v: Vector(v) - H  # noqa: E731
    h = Vector((F.x - H.x, F.y - H.y, 0)).normalized()
    across = Vector((-h.y, h.x, 0))
    P.box((0.55, 0.75, 0.16), at=rel((H.x, H.y, H.z - 0.02)), mat="hull_black", bevel=0.03)
    for d in (-0.2, 0.2):
        strut(P, rel(H + across * d), rel(F + across * d * 0.55), 0.07, "gear_metal")
    for t in (0.35, 0.7):
        a, b = H.lerp(F, t) + across * -0.2 * (1 - 0.45 * t), H.lerp(F, t) + across * 0.2 * (1 - 0.45 * t)
        strut(P, rel(a), rel(b), 0.035, "gear_metal")
    R0 = Vector((side * 3.25, Y(0.43), 0.06))
    mid = H.lerp(F, 0.5)
    strut(P, rel(R0), rel(R0.lerp(mid, 0.55)), 0.065, "gear_silver")
    strut(P, rel(R0.lerp(mid, 0.5)), rel(mid), 0.035, "metal_chrome")
    P.box((0.22, 0.32, 0.22), at=rel(R0), mat="metal_dark", bevel=0.02)
    P.box((0.2, 0.2, 0.2), at=rel(mid), mat="metal_dark", bevel=0.02)
    sk = [(-0.95, 0.06), (-0.78, -0.06), (0.78, -0.06), (0.95, 0.06), (0.9, 0.10), (-0.9, 0.10)]
    Mf = T(rel((F.x, F.y, GROUND + 0.06)))
    P.prism([(y, z) for y, z in sk], 0.38, plane="YZ", M=Mf @ T((-0.19, 0, 0)), mat="hull_black", bevel=0.02)
    P.box((0.3, 1.5, 0.03), M=Mf @ T((0, 0, -0.07)), mat="rubber", bevel=0.01)
    P.box((0.24, 0.46, 0.16), M=Mf @ T((0, 0, 0.16)), mat="metal_dark", bevel=0.02)
    ob = P.finish(sharp=40, col=0)
    ob.location = H
    axis = Vector((0, 0, 1)).cross(h).normalized()
    props(ob, kind="gear", id=f"main_{'r' if side > 0 else 'l'}", part=f"gear_main_{'r' if side > 0 else 'l'}", dynamic=1,
          axis=list(axis), angle=132, travel=0)
    return ob


def rear_gear(side):
    H = Vector((side * 1.45, Y(0.06), 0.0))
    P = Part(f"gear_rear_{'r' if side > 0 else 'l'}")
    P.box((0.36, 0.5, 0.12), at=(0, 0, -0.06), mat="hull_black", bevel=0.02)
    strut(P, (0, 0, -0.05), (0, 0, GROUND + 0.16), 0.07, "gear_metal")
    strut(P, (0, 0, GROUND + 0.75), (0, 0, GROUND + 0.16), 0.045, "metal_chrome")
    strut(P, (0, 0.8, -0.05), (0, 0.05, GROUND + 0.62), 0.04, "gear_metal")
    strut(P, (0, -0.55, -0.05), (0, -0.04, GROUND + 0.55), 0.03, "gear_silver")
    P.box((0.5, 0.5, 0.1), at=(0, 0, GROUND + 0.05), mat="hull_black", bevel=0.02)
    P.box((0.44, 0.44, 0.02), at=(0, 0, GROUND + 0.01), mat="rubber", bevel=0.005)
    P.box((0.16, 0.16, 0.14), at=(0, 0, GROUND + 0.16), mat="metal_dark", bevel=0.02)
    ob = P.finish(sharp=40, col=0)
    ob.location = H
    props(ob, kind="gear", id=f"rear_{'r' if side > 0 else 'l'}", part=f"gear_rear_{'r' if side > 0 else 'l'}", dynamic=1,
          axis=[1, 0, 0], angle=88, travel=0)
    return ob


# ----------------------------------------------------------------------------------------------- lights, markers, collision
def fixtures():
    P = Part("ranger_lamps")
    lamps = [
        ("nav_l", (-4.53, Y(0.43), 0.34), "emit_red", (1.0, 0.1, 0.05), 6, 8),
        ("nav_r", (4.53, Y(0.43), 0.34), "emit_green", (0.1, 1.0, 0.3), 6, 8),
        ("strobe_tl", (-2.26, Y(0.905), 1.1), "emit_white", (1, 1, 1), 5, 8),
        ("strobe_tr", (2.26, Y(0.905), 1.1), "emit_white", (1, 1, 1), 5, 8),
        ("tail_l", (-2.7, Y(0.004), 1.62), "emit_white", (1, 1, 1), 4, 6),
        ("tail_r", (2.7, Y(0.004), 1.62), "emit_white", (1, 1, 1), 4, 6),
    ]
    for lid, at_, mat_, col, pw, dist in lamps:
        P.sphere(0.05, at=at_, mat=mat_, segs=12, rings=8)
        light(lid, at=at_, color=col, power=pw, dist=dist, group="ranger_nav")
    # landing lights under the nose and the wings; docking floods at the rear face
    for side in (1, -1):
        for lid, at_, rot in ((f"land_n{side}", (side * 1.1, Y(0.86), 0.12), (30, 0, 0)), (f"land_w{side}", (side * 3.4, Y(0.44), 0.06), (0, 0, 0))):
            P.cyl(0.12, 0.04, at=at_, mat="emit_white", segs=16, bevel=0)
            P.tube(0.15, 0.12, 0.06, at=at_, mat="metal_dark", segs=16, bevel=0)
            light(lid, at=(at_[0], at_[1], at_[2] - 0.1), color=(1.0, 0.97, 0.9), power=110, dist=60, kind="spot", rot=rot, group="ranger_land")
        at_ = (side * 0.62, Y(0.0) - 0.06, 1.86)
        P.box((0.2, 0.06, 0.1), at=at_, mat="emit_white", bevel=0.01)
        light(f"dock{side}", at=(at_[0], at_[1] - 0.1, at_[2]), color=(0.95, 0.97, 1.0), power=60, dist=30, kind="spot", rot=(-90, 0, 0), group="ranger_dock")
    return P


def markers():
    # main engines (exhaust toward -Y), RCS ports with their exhaust directions, docking port, mounting point
    for side, nm in ((-1, "l"), (1, "r")):
        marker("engine", f"main_{nm}", at=(side * 1.945, Y(0.0) - 0.3, 0.80), dir=[0, -1, 0], thrust=180000, w=1.2, h=0.6)
    rcs = []
    y1 = Y(1.0)
    for side in (1, -1):
        rcs += [((side * 2.27, y1 - 0.35, 0.63), (side, 0, 0)), ((side * 1.6, y1 + 0.03, 0.63), (0, 1, 0)),
                ((side * 1.8, y1 - 0.3, 0.86), (0, 0, 1)), ((side * 1.8, y1 - 0.3, 0.40), (0, 0, -1)),
                ((side * 3.02, Y(0.03), 1.0), (side, 0, 0)), ((side * 2.6, Y(0.04), 1.95), (0, 0, 1)),
                ((side * 2.6, Y(0.04), 0.02), (0, 0, -1)), ((side * 2.7, Y(0.0) - 0.02, 1.55), (0, -1, 0)),
                ((side * 4.56, Y(0.43), 0.2), (side, 0, 0))]
    for i, (p, d) in enumerate(rcs):
        marker("rcs", f"r{i}", at=p, dir=list(d))
    for side, nm in ((-1, "l"), (1, "r")):
        marker("engine", f"lift_{nm}", at=(side * 1.55, Y(0.395), -0.30), dir=[0, 0, -1], thrust=190000, w=1.0, h=0.7)
    marker("dock", "rear", at=(0, Y(0.0) - 0.16, 0.98), dir=[0, -1, 0], up=[0, 0, 1], label="Rear docking hatch")
    marker("mount", "launcher", at=(0, Y(0.0) - 0.02, 0.98))
    marker("cog", "ranger", at=(0, 0, 0.9))
    marker("vehicle", "ranger", at=(0, 0, 0), length=L, span=9.1, mass=28000, ground=GROUND, s0=S0)


def collision():
    """Convex pieces (engine builds convex-hull colliders from each)."""
    out = []
    import bmesh as _bm  # noqa: F811

    def hull_obj(name, pts):
        bm = _bm.new()
        for p in pts:
            bm.verts.new(p)
        _bm.ops.convex_hull(bm, input=bm.verts[:])
        me = bpy.data.meshes.new(name)
        bm.to_mesh(me)
        bm.free()
        me.materials.append(mat("hull_black"))
        ob = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(ob)
        props(ob, colonly=1, hull="convex")
        ob.hide_render = True
        out.append(ob)

    core, wl, wr = [], [], []
    for s in [0.075 + k * 0.04 for k in range(22)] + [0.915]:
        pts, lab = section(s)
        for i, (x, z) in enumerate(pts):
            for sx in (1, -1):
                p = (sx * x, Y(s), z)
                if x <= 2.65:
                    core.append(p)
                if x >= 2.35 and i >= N_TOPSIDE - 1:
                    (wr if sx > 0 else wl).append(p)
    hull_obj("col_core", core)
    hull_obj("col_wing_r", wr)
    hull_obj("col_wing_l", wl)
    rb = [(sx * 3.0, Y(s), z) for sx in (1, -1) for s in (0.0, 0.16) for z in (0.0, 1.92)]
    hull_obj("col_rear", rb)
    nb = [(sx * 2.24, y, z) for sx in (1, -1) for y in (Y(0.905), Y(1.0)) for z in (0.42, 0.84)]
    hull_obj("col_nose", nb)
    for side in (1, -1):
        f = [(side * 3.85 + dx, Y(0.465) + dy, GROUND + dz) for dx in (-0.19, 0.19) for dy in (-0.95, 0.95) for dz in (0.0, 0.12)]
        hull_obj(f"col_foot_{side}", f)
        p = [(side * 1.45 + dx, Y(0.06) + dy, GROUND + dz) for dx in (-0.25, 0.25) for dy in (-0.25, 0.25) for dz in (0.0, 1.1)]
        hull_obj(f"col_pad_{side}", p)
    return out


# ----------------------------------------------------------------------------------------------- surface detail
def ribbon(P, path, surf, width=0.014, lift=0.004, mat_name="hull_seam", step=0.08):
    """Thin decal strip draped on a surface: path is a list of (x, s); surf(x, s) gives the height."""
    pts = []
    for (xa, sa), (xb, sb) in zip(path[:-1], path[1:]):
        a, b = Vector((xa, Y(sa))), Vector((xb, Y(sb)))
        n = max(1, int((b - a).length / step))
        for k in range(n):
            pts.append(a.lerp(b, k / n))
    pts.append(Vector((path[-1][0], Y(path[-1][1]))))
    acc = MeshAcc()
    for i in range(len(pts) - 1):
        a, b = pts[i], pts[i + 1]
        d = (b - a)
        if d.length < 1e-5:
            continue
        nrm = Vector((-d.y, d.x)).normalized() * (width / 2)
        quad = [a - nrm, a + nrm, b + nrm, b - nrm]
        q3 = [(q.x, q.y, surf(q.x, S(q.y)) + lift) for q in quad]
        acc.face(q3 if (q3[1][0] - q3[0][0]) * (q3[3][1] - q3[0][1]) - (q3[1][1] - q3[0][1]) * (q3[3][0] - q3[0][0]) > 0 else q3[::-1])
    if acc.f:
        P.mesh(acc.v, acc.f, mat=mat_name, bevel=0, recalc=False, smooth=False)


def rounded_rect(x0, x1, s0, s1, r=0.25, seg=4):
    """Rounded rectangle path in (x, s) with a radius in metres."""
    rs = r / L
    out = []
    for cx, cs, a0 in ((x1 - r, s1 - rs, 0), (x0 + r, s1 - rs, 90), (x0 + r, s0 + rs, 180), (x1 - r, s0 + rs, 270)):
        for k in range(seg + 1):
            a = math.radians(a0 + 90 * k / seg)
            out.append((cx + math.cos(a) * r, cs + math.sin(a) * rs))
    out.append(out[0])
    return out


def surface_details():
    """Panel seams on canopy, deck and flanks; top escape hatch; beacon; stencils (references 3 and 5)."""
    P = Part("ranger_detail")
    P.bevel_segs = 1
    cz = canopy_z
    lines = []
    # canopy: centre seam through the cluster, shoulder seams, transverse joints and the chevron at its front
    lines.append([(0.0, 0.258), (0.0, 0.595)])
    for sx in (1, -1):
        lines.append([(sx * WT(s_) * 0.985, s_) for s_ in [0.24 + k * 0.02 for k in range(20)]])
        lines.append([(sx * 0.0, 0.612), (sx * 0.38, 0.6), (sx * 1.0, 0.598), (sx * 1.55, 0.602)])
        lines.append([(sx * 0.95, 0.214), (sx * 1.05, 0.262), (sx * 1.3, 0.268)])
        lines.append([(sx * 1.25, 0.37), (sx * 1.6, 0.372), (sx * 1.62, 0.43)])
        lines.append([(sx * 0.18, 0.48), (sx * 0.5, 0.49)])
        lines.append([(sx * 1.2, 0.515), (sx * 1.58, 0.52)])
        # fore-deck: long hatches, stringers, transverse joints, the lines converging on the nose
        lines.append([(sx * 0.55, 0.80), (sx * 0.55, 0.905)])
        lines.append([(sx * 1.18, 0.66), (sx * 1.18, 0.905)])
        lines.append([(sx * 1.55, 0.64), (sx * 1.62, 0.90)])
        lines.append([(sx * 0.3, 0.64), (sx * 0.9, 0.78)])
    for s_ in (0.66, 0.72, 0.80, 0.845, 0.88):
        lines.append([(-WT(s_) * 0.98, s_), (WT(s_) * 0.98, s_)])
    lines.append(rounded_rect(-1.5, 1.5, 0.628, 0.79, 0.3))
    lines.append(rounded_rect(-0.42, 0.42, 0.81, 0.9, 0.08))
    for path in lines:
        ribbon(P, path, cz)
    # flank seams across the blanket (where the quilt panels meet) and along the band edge
    for sx in (1, -1):
        for s_ in (0.255, 0.30, 0.35, 0.40, 0.45, 0.50, 0.55):
            x0 = WS(s_) + 0.02
            x1 = rail_pts(s_)[0][0] - 0.02
            if x1 - x0 > 0.15:
                ribbon(P, [(sx * x0, s_), (sx * x1, s_ + 0.004)], wing_z, width=0.018, lift=0.006)
    # top escape hatch (square, s 0.226-0.254) and its frame
    s_h, x_h = 0.24, 0.0
    zh = cz(0.0, s_h)
    P.box((0.56, 0.5, 0.05), at=(0, Y(s_h), zh + 0.01), mat="hull_gray", bevel=0.012)
    P.box((0.66, 0.6, 0.03), at=(0, Y(s_h), zh - 0.002), mat="hull_black", bevel=0.01)
    for sx in (-0.18, 0.18):
        P.box((0.08, 0.05, 0.03), at=(sx, Y(s_h) - 0.12, zh + 0.045), mat="handle_yellow", bevel=0.008)
    # beacon on the centre line (the round marker in reference 3) and stencils
    zb = cz(0.0, 0.27)
    P.cyl(0.11, 0.05, at=(0, Y(0.27), zb + 0.015), mat="hull_black", segs=24, bevel=0.01)
    P.sphere(0.075, at=(0, Y(0.27), zb + 0.04), mat="emit_red", segs=16, rings=8, scale=(1, 1, 0.55))
    light("beacon", at=(0, Y(0.27), zb + 0.18), color=(1.0, 0.15, 0.08), power=4, dist=8, group="ranger_nav")
    for sx in (1, -1):
        zs = cz(sx * 0.42, 0.283)
        P.text("RF-31D", size=0.13, M=T((sx * 0.42, Y(0.283), zs + 0.005)) @ RZ(90 * sx), mat="paint_black", depth=0.002)
    P.text("NO STEP", size=0.07, M=T((1.3, Y(0.73), cz(1.3, 0.73) + 0.005)) @ RZ(90), mat="paint_black", depth=0.0015)
    P.text("NO STEP", size=0.07, M=T((-1.3, Y(0.73), cz(-1.3, 0.73) + 0.005)) @ RZ(-90), mat="paint_black", depth=0.0015)
    P.text("RESCUE", size=0.06, M=T((0.0, Y(0.258), cz(0.0, 0.258) + 0.005)), mat="paint_red", depth=0.0015)
    return P


# ----------------------------------------------------------------------------------------------- cabin
S_REAR, S_FRONT = 0.11, 0.615
XW = 2.22            # side walls
ZA, ZD = 0.03, 0.30  # aisle floor, side deck floor
AW = 0.46            # aisle half width
Z_RAD = 1.86         # ceiling under the radiator


def ceil_z(x, s):
    """Underside of the cabin ceiling at (x, s)."""
    if s < S_FRAME_FRONT + 0.002:
        return Z_RAD
    return canopy_z(x, s) - 0.055


def seat(D, M, pilot=False):
    """Maroon ribbed flight seat (references 6, 7); local frame: origin on the floor, facing +Y."""
    D.box((0.34, 0.36, 0.2), M=M @ T((0, -0.02, 0.1)), mat="metal_dark", bevel=0.02)
    for sx in (-0.13, 0.13):
        D.box((0.05, 0.62, 0.04), M=M @ T((sx, -0.02, 0.02)), mat="metal_gunmetal", bevel=0.008)
    D.box((0.54, 0.54, 0.14), M=M @ T((0, 0.0, 0.33)), mat="metal_dark", bevel=0.02)
    D.box((0.52, 0.52, 0.1), M=M @ T((0, 0.01, 0.44)), mat="seat_leather", bevel=0.04)
    D.box((0.5, 0.12, 0.1), M=M @ T((0, 0.24, 0.46)) @ RX(-20), mat="seat_leather", bevel=0.04)
    Mb = M @ T((0, -0.25, 0.45)) @ RX(-13)
    D.box((0.54, 0.14, 0.9), M=Mb @ T((0, 0, 0.47)), mat="seat_leather", bevel=0.05)
    for sx in (-0.26, 0.26):
        D.box((0.08, 0.2, 0.78), M=Mb @ T((sx, 0.03, 0.44)), mat="seat_leather_dark", bevel=0.03)
    D.box((0.32, 0.17, 0.26), M=Mb @ T((0, -0.01, 1.06)), mat="seat_leather_dark", bevel=0.05)
    D.box((0.56, 0.06, 0.9), M=Mb @ T((0, -0.09, 0.47)), mat="plastic_dark", bevel=0.02)
    for sx in (-0.33, 0.33):
        D.box((0.07, 0.42, 0.05), M=M @ T((sx, 0.02, 0.68)), mat="plastic_black", bevel=0.015)
        D.box((0.05, 0.05, 0.22), M=M @ T((sx, -0.12, 0.57)), mat="metal_dark", bevel=0.01)
        if pilot:
            D.box((0.06, 0.08, 0.04), M=M @ T((sx, 0.2, 0.72)), mat="metal_dark", bevel=0.01)
            D.cyl(0.02, 0.14, M=M @ T((sx, 0.2, 0.8)) @ RX(8), mat="plastic_black", segs=10, bevel=0.005)
            D.box((0.045, 0.06, 0.07), M=M @ T((sx, 0.215, 0.89)) @ RX(8), mat="plastic_black", bevel=0.012)
            D.box((0.012, 0.012, 0.012), M=M @ T((sx, 0.235, 0.93)), mat="emit_red", bevel=0)
    # five-point harness
    for sx in (-0.12, 0.12):
        D.box((0.05, 0.012, 0.62), M=Mb @ T((sx, 0.08, 0.55)) @ RY(sx * 30), mat="cloth_navy", bevel=0)
    D.box((0.05, 0.012, 0.22), M=M @ T((0, 0.18, 0.56)) @ RX(-60), mat="cloth_navy", bevel=0)
    D.cyl(0.05, 0.02, M=M @ T((0, 0.16, 0.6)) @ RX(-70), mat="metal_chrome", segs=12, bevel=0.004)


def console(D, E, M, w=0.9, d=0.5, h=0.78, sid=None, screens=2, tilt=30, body="plastic_beige"):
    """Sloped instrument console; local frame: origin on the floor at the front edge, operator at -Y."""
    D.box((w, d, h - 0.06), M=M @ T((0, d / 2, (h - 0.06) / 2)), mat=body, bevel=0.015)
    Mt = M @ T((0, d * 0.45, h)) @ RX(tilt)
    D.box((w, d * 0.95, 0.05), M=Mt, mat="plastic_dark", bevel=0.01)
    sw = (w - 0.1) / screens
    for i in range(screens):
        x = -w / 2 + 0.05 + sw * (i + 0.5)
        Ms = Mt @ T((x, 0.02, 0.028)) @ RX(-90)
        D.box((sw - 0.05, 0.004, d * 0.62), M=Ms @ T((0, 0.0, 0)), mat="screen", bevel=0)
        if sid:
            loc, rot, _ = (Ms @ T((0, -0.004, 0))).decompose()
            e = rot.to_euler("XYZ")
            marker("screen", f"{sid}{i}", at=loc[:], rot=(math.degrees(e.x), math.degrees(e.y), math.degrees(e.z)), w=sw - 0.06, h=d * 0.6)
    for k in range(6):
        E.box((0.025, 0.012, 0.012), M=Mt @ T((-w / 2 + 0.08 + k * 0.03, -d * 0.42, 0.03)), mat=["emit_green", "emit_amber", "emit_blue"][k % 3], bevel=0)
    for k in range(5):
        D.cyl(0.012, 0.03, M=Mt @ T((w / 2 - 0.08 - k * 0.04, -d * 0.4, 0.04)), mat="metal_chrome", segs=8, bevel=0)


def cabin():
    """Crew cabin from references 6 and 7: a sunken centre aisle between raised side decks, four maroon flight
    seats, beige consoles and equipment lockers, a padded dark ceiling with warm light boxes, the canopy windows
    overhead, and the docking tunnel through the rear block to the rear hatch."""
    C = Part("ranger_cabin")
    D = Part("ranger_cabin_detail")
    E = Part("ranger_cabin_emit")
    D.bevel_segs = 1
    E.bevel_segs = 1
    st = [S_REAR + k * 0.0125 for k in range(int((S_FRONT - S_REAR) / 0.0125) + 1)]
    st = sorted(set(st + [S_FRAME_FRONT - 0.001, S_FRAME_FRONT + 0.002, S_FRONT]))
    # ---- floors: aisle, step walls, side decks
    acc = {}
    for sa, sb in zip(st[:-1], st[1:]):
        ya, yb = Y(sa), Y(sb)
        for (x0, x1, z, m) in ((-AW, AW, ZA, "floor_panel_dark"), (AW, XW, ZD, "floor_panel_tan"), (-XW, -AW, ZD, "floor_panel_tan")):
            acc.setdefault(m, MeshAcc()).face([(x0, ya, z), (x1, ya, z), (x1, yb, z), (x0, yb, z)])
        for sx in (1, -1):
            q = [(sx * AW, ya, ZA), (sx * AW, yb, ZA), (sx * AW, yb, ZD), (sx * AW, ya, ZD)]
            acc.setdefault("floor_panel", MeshAcc()).face(q[::-1] if sx > 0 else q)
        # side walls up to the ceiling
        for sx in (1, -1):
            za, zb = ceil_z(sx * XW, sa) + 0.012, ceil_z(sx * XW, sb) + 0.012
            q = [(sx * XW, ya, ZD), (sx * XW, ya, za), (sx * XW, yb, zb), (sx * XW, yb, ZD)]
            acc.setdefault("padding_light", MeshAcc()).face(q if sx > 0 else q[::-1])
    # ceiling under the radiator, and the header up to the canopy where the cross-member ends
    acc.setdefault("padding_dark", MeshAcc()).face([(-XW, Y(S_REAR), Z_RAD), (-XW, Y(S_FRAME_FRONT), Z_RAD), (XW, Y(S_FRAME_FRONT), Z_RAD), (XW, Y(S_REAR), Z_RAD)])
    xs = [-XW + k * XW / 10 for k in range(21)]
    yh = Y(S_FRAME_FRONT + 0.001)
    for xa, xb in zip(xs[:-1], xs[1:]):
        acc["padding_dark"].face([(xa, yh, Z_RAD), (xb, yh, Z_RAD), (xb, yh, ceil_z(xb, S_FRAME_FRONT + 0.003) + 0.02), (xa, yh, ceil_z(xa, S_FRAME_FRONT + 0.003) + 0.02)])
    # front wall below the canopy, behind the instrument panels
    yf = Y(S_FRONT)
    for xa, xb in zip(xs[:-1], xs[1:]):
        acc.setdefault("padding_dark", MeshAcc()).face([(xa, yf, ZA), (xb, yf, ZA), (xb, yf, ceil_z(xb, S_FRONT) + 0.02), (xa, yf, ceil_z(xa, S_FRONT) + 0.02)])
    emit(C, acc)
    # rear bulkhead with the round hatchway, and the docking tunnel through the rear block
    yr = Y(S_REAR)
    hz, hr = 0.98, 0.52
    circ = [(math.cos(a) * hr, hz + math.sin(a) * hr) for a in [2 * math.pi * i / 32 for i in range(32)]]
    C.prism([(-XW, ZA), (XW, ZA), (XW, Z_RAD), (-XW, Z_RAD)], 0.08, plane="XZ", at=(0, yr - 0.08, 0), mat="padding_gray", bevel=0, holes=[circ])
    C.lathe([(hr + 0.02, 0.0), (hr + 0.02, Y(S_REAR) - Y(0.0) + 0.04)], M=T((0, Y(0.0) - 0.04, hz)) @ RX(-90), mat="padding_light", segs=32, closed=False)
    # inner pressure hatch at the cabin end of the tunnel: slides aside into the bulkhead
    Hi = Part("ranger_hatch_inner")
    Hi.cyl(hr + 0.03, 0.04, M=RX(-90), mat="hull_gray", segs=32, bevel=0.004)
    Hi.cyl(0.11, 0.05, M=T((0, 0.04, 0)) @ RX(-90), mat="metal_dark", segs=20, bevel=0.01)
    for k in range(6):
        Hi.box((0.04, 0.04, 0.36), M=T((0, 0.05, 0)) @ RY(k * 60) @ T((0, 0, 0.24)), mat="gear_metal", bevel=0.005)
    HATCHES.append((Hi, (0, Y(0.0) + 0.24, hz), dict(id="inner", part="hatch_inner", axis=[1, 0, 0], travel=1.1, label="Rear hatch")))
    D.tube(hr + 0.12, hr, 0.1, M=T((0, yr + 0.02, hz)) @ RX(-90), mat="padding_light", segs=32, bevel=0.03)
    for k in range(4):
        a = math.radians(45 + 90 * k)
        D.box((0.1, 0.06, 0.1), M=T((math.cos(a) * (hr + 0.17), yr + 0.04, hz + math.sin(a) * (hr + 0.17))), mat="handle_yellow", bevel=0.01)
    marker("hatch", "rear_inner", at=(0, Y(0.0) + 0.45, hz), label="Rear hatch")
    # ---- aisle rails and floor plates
    for sx in (-0.17, 0.17):
        D.box((0.06, Y(S_FRONT - 0.06) - Y(S_REAR), 0.012), at=(sx, (Y(S_REAR) + Y(S_FRONT - 0.06)) / 2, ZA + 0.006), mat="metal_gunmetal", bevel=0.003)
    for k in range(9):
        s_ = S_REAR + 0.03 + k * 0.05
        for sx in (1, -1):
            D.box((0.62, 0.62, 0.008), at=(sx * 1.2, Y(s_), ZD + 0.004), mat="tread_plate", bevel=0.003)
            for cxy in ((-0.28, -0.28), (0.28, -0.28), (-0.28, 0.28), (0.28, 0.28)):
                D.cyl(0.018, 0.006, at=(sx * 1.2 + cxy[0], Y(s_) + cxy[1], ZD + 0.011), mat="metal_chrome", segs=8, bevel=0)
    # ---- seats: pilots forward, mission specialists aft
    seats = (("pilot_l", -1.02, 0.508, True), ("pilot_r", 1.02, 0.508, True), ("crew_l", -1.02, 0.40, False), ("crew_r", 1.02, 0.40, False))
    for sid, x, s_, pilot in seats:
        M = T((x, Y(s_), ZD))
        seat(D, M, pilot)
        marker("seat", sid, at=(x, Y(s_) - 0.02, ZD + 0.46), eye=0.74, label="Pilot seat" if pilot else "Crew seat", role="pilot" if pilot else "crew")
    # ---- instrument panels across the front, centre pedestal with throttles
    for sx in (1, -1):
        console(D, E, T((sx * 1.02, Y(S_FRONT) - 0.62, ZD)), w=1.1, d=0.55, h=0.66, sid=f"pfd_{'r' if sx > 0 else 'l'}", screens=2, tilt=55, body="plastic_dark")
        D.box((1.2, 0.35, 0.08), M=T((sx * 1.02, Y(S_FRONT) - 0.2, ceil_z(sx * 1.02, S_FRONT - 0.02) - 0.18)) @ RX(-25), mat="plastic_black", bevel=0.02)
    ped = T((0, Y(S_FRONT) - 0.75, ZA))
    D.box((0.62, 0.7, 0.9), M=ped @ T((0, 0.35, 0.45)), mat="plastic_dark", bevel=0.02)
    for k, sx in enumerate((-0.16, -0.05, 0.05, 0.16)):
        D.box((0.04, 0.2, 0.02), M=ped @ T((sx, 0.3, 0.92)), mat="metal_dark", bevel=0.005)
        D.cyl(0.012, 0.16, M=ped @ T((sx, 0.25, 0.99)) @ RX(-25), mat="metal_chrome", segs=8, bevel=0)
        D.box((0.05, 0.05, 0.05), M=ped @ T((sx, 0.22, 1.07)), mat="plastic_black" if k % 3 else "plastic_red", bevel=0.012)
    loc, rot, _ = (ped @ T((0, 0.62, 0.85)) @ RX(-60)).decompose()
    e = rot.to_euler("XYZ")
    marker("screen", "ped0", at=loc[:], rot=(math.degrees(e.x), math.degrees(e.y), math.degrees(e.z)), w=0.48, h=0.3)
    D.box((0.5, 0.01, 0.32), M=ped @ T((0, 0.62, 0.85)) @ RX(-60) @ T((0, 0.006, 0)), mat="screen", bevel=0)
    marker("control", "flight", at=(0, Y(S_FRONT) - 0.5, ZA + 0.95), label="Flight computer")
    # ---- side consoles beside the seats and equipment lockers aft (beige, references 6 and 7)
    for sx in (1, -1):
        for k, (s_, sid) in enumerate(((0.462, "side_a"), (0.36, "side_b"))):
            M = T((sx * (XW - 0.32), Y(s_), ZD)) @ RZ(90 * sx)
            console(D, E, M, w=0.85, d=0.52, h=0.74, sid=f"{sid}_{'r' if sx > 0 else 'l'}", screens=2, tilt=35)
        for k, (s_, h) in enumerate(((0.14, 1.35), (0.175, 1.35), (0.21, 1.2), (0.245, 1.05), (0.28, 0.95))):
            M = T((sx * (XW - 0.3), Y(s_), ZD))
            D.box((0.56, 0.58, h), M=M @ T((0, 0, h / 2)), mat="plastic_beige", bevel=0.03)
            for j in range(int(h / 0.32)):
                D.box((0.012, 0.5, 0.25), M=M @ T((-sx * 0.282, 0, 0.18 + j * 0.32)), mat="plastic_white", bevel=0.01)
                D.box((0.02, 0.1, 0.03), M=M @ T((-sx * 0.29, 0, 0.27 + j * 0.32)), mat="metal_dark", bevel=0.006)
            D.box((0.012, 0.14, 0.06), M=M @ T((-sx * 0.285, 0.16, h - 0.1)), mat="plastic_red", bevel=0.004)
    # ---- ceiling: centre beam aft, conduits, warm light boxes between the windows, hatch well with ladder
    D.box((0.34, Y(0.33) - Y(S_FRAME_FRONT), 0.16), at=(0, (Y(0.33) + Y(S_FRAME_FRONT)) / 2, ceil_z(0, 0.27) - 0.06), mat="plastic_dark", bevel=0.02)
    for sx in (1, -1):
        D.pipe([(sx * 1.55, Y(S_REAR) + 0.1, Z_RAD - 0.06), (sx * 1.55, Y(S_FRAME_FRONT) - 0.05, Z_RAD - 0.06)], 0.025, mat="plastic_blue", segs=8)
        D.pipe([(sx * 2.08, Y(S_REAR) + 0.1, 1.42), (sx * 2.08, Y(0.58), 1.42)], 0.02, mat="plastic_blue", segs=8)
    lamps = [(-1.1, 0.135), (1.1, 0.135), (-1.1, 0.19), (1.1, 0.19), (-1.3, 0.236), (1.3, 0.236), (-1.36, 0.44), (1.36, 0.44), (0.0, 0.50)]
    for i, (x, s_) in enumerate(lamps):
        z = ceil_z(x, s_)
        D.box((0.5, 0.36, 0.08), at=(x, Y(s_), z - 0.03), mat="plastic_dark", bevel=0.02)
        E.box((0.42, 0.28, 0.02), at=(x, Y(s_), z - 0.075), mat="emit_warm", bevel=0.005)
        light(f"cab{i}", at=(x, Y(s_), z - 0.25), color=(1.0, 0.86, 0.66), power=7, dist=5.5, bake=26, group="ranger_cabin", room="cabin")
    for sx in (1, -1):
        for s_ in (0.3, 0.52):
            light(f"glow{sx}{s_}", at=(sx * 1.8, Y(s_), 1.0), color=(0.55, 0.8, 1.0), power=2, dist=3, bake=8, group="ranger_cabin", room="cabin")
    zh = ceil_z(0, 0.24)
    for sx in (-0.33, 0.33):
        D.box((0.04, 0.62, 0.2), at=(sx, Y(0.24), zh - 0.08), mat="plastic_dark", bevel=0.01)
    for k in range(3):
        D.cyl(0.015, 0.6, at=(0, Y(0.24) - 0.26 + k * 0.03, zh - 0.12 - k * 0.12), rot=(0, 90, 0), mat="metal_chrome", segs=8, bevel=0)
    marker("hatch", "top_inner", at=(0, Y(0.24), zh - 0.3), label="Top escape hatch")
    marker("spawn", "cabin", at=(0, Y(0.3), ZA), rot=(0, 0, 0))
    for i, s_ in enumerate((0.14, 0.25, 0.36, 0.47, 0.55)):
        marker("nav", f"aisle{i}", at=(0, Y(s_), ZA), links=f"aisle{i + 1}" if i < 4 else "")
    return C, D, E


# ----------------------------------------------------------------------------------------------- build
def exterior():
    reset()
    polys = window_polys()
    H, C = body()
    hull = H.finish(sharp=34, col=0)
    props(hull, part="hull")
    can = C.finish(sharp=34, col=0)
    props(can, part="canopy")
    cut_windows(can, polys)
    Fw, Gw = window_details(polys)
    wf = Fw.finish(sharp=40, col=0)
    props(wf, part="window_frames")
    gl = Gw.finish(sharp=60, col=0, shadow=0)
    props(gl, part="glass")
    rear = rear_block().finish(sharp=36, col=0)
    props(rear, part="rear")
    fr = frame_and_radiator().finish(sharp=40, col=0)
    props(fr, part="frame")
    no = nose().finish(sharp=40, col=0)
    props(no, part="nose")
    ve = vents().finish(sharp=40, col=0)
    props(ve, part="vents")
    de = surface_details().finish(sharp=40, col=0, shadow=0)
    props(de, part="detail")
    la = fixtures().finish(sharp=40, col=0, shadow=0)
    props(la, part="lamps")
    gears = [main_gear(1), main_gear(-1), rear_gear(1), rear_gear(-1)]
    Cc, Cd, Ce = cabin()
    hatches = []
    for Ph, loc, kw in HATCHES:                          # after cabin(): it adds the inner cabin hatch
        ob = Ph.finish(sharp=40, col=0)
        ob.location = loc
        props(ob, kind="hatch", dynamic=1, **kw)
        hatches.append(ob)
    cab = Cc.finish(sharp=40, col=0)
    props(cab, part="cabin")
    cabd = Cd.finish(sharp=38, col=0)
    props(cabd, part="cabin_detail")
    cabe = Ce.finish(sharp=40, col=0, shadow=0)
    props(cabe, part="cabin_emit")
    markers()
    cols = collision()
    outside = [hull, wf, rear, fr, no, ve, de] + gears + [h for h in hatches if h.get("id") == "outer"]
    bake_ao(outside, rays=16, local_dist=1.4, sky_dist=30.0)
    # the cabin and the canopy shell (whose inner face is the cabin ceiling) get the interior fixtures baked in
    lights_in = [l for l in scene_lights() if l[1] > 0]
    cab_lights = [l for l in lights_in if l[0].z < 2.1 and abs(l[0].x) < 2.3 and Y(S_REAR) - 0.5 < l[0].y < Y(S_FRONT)]
    bake_ao([can, cab, cabd] + [h for h in hatches if h.get("id") == "inner"], rays=16, local_dist=1.2, sky_dist=30.0, lights=cab_lights, light_gain=1.0, fill=0.01)
    return outside + [can, cab, cabd, cabe, gl, la] + [h for h in hatches if h.get("id") == "inner"] + cols


def previews():
    tgt = (0, 0, 0.6)
    preview("ranger_top", eye=(0, 0.6, 40), target=(0, 0.6, 0), ortho=19.5, res=(1000, 1400), samples=24, sun_rot=(25, 0, 30))
    preview("ranger_side", eye=(-40, 0.8, 0.6), target=(0, 0.8, 0.6), ortho=19.5, res=(1600, 600), samples=24)
    preview("ranger_rear", eye=(0, -40, 1.0), target=(0, 0, 0.6), ortho=10.5, res=(1200, 700), samples=24, sun_rot=(50, 0, 160))
    preview("ranger_q_rear", eye=(-15, -21, 13), target=tgt, lens=50, res=(1600, 900), samples=32, sun_rot=(55, 0, 200))
    preview("ranger_q_front", eye=(-16, 21, 8), target=tgt, lens=45, res=(1600, 900), samples=32, sun_rot=(55, 0, 220))
    preview("ranger_cab_fwd", eye=(0, Y(0.16), 1.55), target=(0, Y(0.6), 1.0), lens=18, res=(1600, 900), samples=48, sun_rot=(60, 0, 30))
    preview("ranger_cab_aft", eye=(0.3, Y(0.585), 1.35), target=(0, Y(0.11), 1.0), lens=16, res=(1600, 900), samples=48, sun_rot=(60, 0, 30))


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("-")]
    exterior()
    if "preview" in args:
        previews()
    export_glb("ranger")
    save_blend("ranger")
