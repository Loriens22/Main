"""Hypersleep pod of the Endurance cryo-lab (references: the film prop, closed, open and in use).

A long white box with chamfered corners in three tiers: a worn white base; two pairs of thin dark flange plates
proud of the body with a diamond-quilted black band between them; and a white lid with deeply chamfered top edges,
round flush latches, recessed grips and slotted grilles. The lid slides toward the foot on rails, uncovering a deep
black tub with a ribbed floor and a tubular stretcher with a net bed and a headrest. The head end is a fixed block
carrying a ring fitting, a knurled dial with a blue LCD readout and a grille; the foot end carries a pneumatic
valve with its hoses. A sheet of crumpled clear film, fixed along the stretcher's side tubes, closes round the
sleeper's body (shape keys: open in the side gaps, raised as two walls, wrapped over the body).

Everything that moves is authored here as one 12 s timeline (exported as a single glTF animation):
   0.0 -  2.5 s  the lid lifts off its seals and slides 1.36 m toward the foot
   2.5 -  6.5 s  the eye (empties `eye:r` and `eye:l`, for a commander standing on the right or the left of the
                 pod) steps over the rim, sits on the stretcher and lies back on the headrest
   6.5 -  9.5 s  the film rises from the side gaps and folds over the body
   9.5 - 12.0 s  the lid slides back and settles
Played forward the commander goes to sleep; played backward the same timeline wakes them and lets them out.

Frame: +Y toward the head, +X right, origin on the floor of the pit the pod stands in (the cryo-lab floor is PIT
above it). Exported as cryo_pod.glb with parts `lid` and `sheet`, empties `eye:r`, `eye:l`, a `lie:crew` marker
(where a sleeping crew member is attached, character space: up toward the head, facing out of the pod) and a
`use:pod` marker for the interaction.
"""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "lib"))
from bl import *  # noqa: E402,F403
from mathutils import Matrix, Quaternion, Vector  # noqa: E402

PIT = 0.32                  # depth of the floor pit (cryo-lab floor above the pod's origin)
L, W, CH = 2.40, 1.00, 0.20  # length and width of the body and lid, plan chamfer at the four corners
HB = 0.36                    # length of the fixed head block
Y_HEAD = L / 2 - HB          # seam between the lid and the head block (also the tub's head wall)
Z_BASE = 0.40
FL_LO = ((0.400, 0.430), (0.445, 0.475))
BAND = (0.475, 0.665)
FL_HI = ((0.665, 0.695), (0.710, 0.740))
Z_LID0, Z_LID1, Z_TOP = 0.740, 0.860, 0.980
TOP_IN = 0.10                # horizontal inset of the lid's top chamfer
FL_OUT = 0.08                # flange plates proud of the body
CAV_X = 0.40                 # half width of the tub
CAV_Y0, CAV_Y1 = -L / 2 + 0.16, Y_HEAD   # (the tub's corners stay inside the chamfered corners of the body)
Z_TUB = 0.26                 # tub floor
Z_BED = 0.37                 # net bed of the stretcher
TUBE_X, TUBE_Z = 0.30, 0.395
SLIDE = 1.36
FPS = 30
F_OPEN, F_IN, F_WRAP, F_CLOSE, F_END = 0, 75, 195, 285, 360


# ----------------------------------------------------------------------------- plan geometry
def outline(l=L, w=W, ch=CH):
    """Plan of the body: rectangle with 45 degree chamfers, counter-clockwise."""
    return [(-w / 2 + ch, -l / 2), (w / 2 - ch, -l / 2), (w / 2, -l / 2 + ch), (w / 2, l / 2 - ch),
            (w / 2 - ch, l / 2), (-w / 2 + ch, l / 2), (-w / 2, l / 2 - ch), (-w / 2, -l / 2 + ch)]


def offset(pts, d):
    """Offset a convex counter-clockwise polygon outward by d (per edge: a list), mitred corners."""
    n = len(pts)
    ds = d if isinstance(d, (list, tuple)) else [d] * n
    lines = []
    for i in range(n):
        a, b = Vector(pts[i]), Vector(pts[(i + 1) % n])
        t = (b - a).normalized()
        nrm = Vector((t.y, -t.x))
        lines.append((a + nrm * ds[i], t))
    out = []
    for i in range(n):
        (p1, t1), (p2, t2) = lines[i - 1], lines[i]
        den = t1.x * t2.y - t1.y * t2.x
        if abs(den) < 1e-9:
            out.append((p2.x, p2.y))
            continue
        s = ((p2.x - p1.x) * t2.y - (p2.y - p1.y) * t2.x) / den
        q = p1 + t1 * s
        out.append((q.x, q.y))
    return out


def rounded(pts, r, res=4):
    """Round every corner of a closed polygon."""
    n = len(pts)
    out = []
    for i in range(n):
        p0, p1, p2 = Vector(pts[i - 1]), Vector(pts[i]), Vector(pts[(i + 1) % n])
        a, b = (p0 - p1), (p2 - p1)
        la, lb = a.length, b.length
        a.normalize()
        b.normalize()
        ang = a.angle(b)
        d = min(r / math.tan(ang / 2), la * 0.45, lb * 0.45)
        s, e = p1 + a * d, p1 + b * d
        for k in range(res + 1):
            t = k / res
            q = s * (1 - t) ** 2 + p1 * 2 * t * (1 - t) + e * t * t
            out.append((q.x, q.y))
    return out


def clip(pts, y0, keep_above):
    """Clip a polygon by the line y = y0 (Sutherland-Hodgman)."""
    inside = (lambda p: p[1] >= y0 - 1e-9) if keep_above else (lambda p: p[1] <= y0 + 1e-9)
    out = []
    n = len(pts)
    for i in range(n):
        a, b = pts[i], pts[(i + 1) % n]
        ia, ib = inside(a), inside(b)
        if ia:
            out.append(a)
        if ia != ib:
            t = (y0 - a[1]) / (b[1] - a[1])
            out.append((a[0] + (b[0] - a[0]) * t, y0))
    # drop duplicates
    res = []
    for p in out:
        if not res or (abs(res[-1][0] - p[0]) > 1e-7 or abs(res[-1][1] - p[1]) > 1e-7):
            res.append(p)
    if len(res) > 2 and abs(res[0][0] - res[-1][0]) < 1e-7 and abs(res[0][1] - res[-1][1]) < 1e-7:
        res.pop()
    return res


def cavity(grow=0.0):
    return [(-CAV_X - grow, CAV_Y0 - grow), (CAV_X + grow, CAV_Y0 - grow), (CAV_X + grow, CAV_Y1 + grow), (-CAV_X - grow, CAV_Y1 + grow)]


def ring_at(poly, z):
    return [Vector((p[0], p[1], z)) for p in poly]


def chamfered_block(P, poly, open_edge_y, z0, z1, z2, mat, keep_above):
    """A block with vertical sides from z0 to z1 and a chamfer to the top z2, except along the straight edge at
    y = open_edge_y (where it meets its neighbour flush)."""
    n = len(poly)
    ds = []
    for i in range(n):
        a, b = poly[i], poly[(i + 1) % n]
        seam = abs(a[1] - open_edge_y) < 1e-6 and abs(b[1] - open_edge_y) < 1e-6
        ds.append(0.0 if seam else -TOP_IN)
    top = offset(poly, ds)
    P.loft([ring_at(poly, z0), ring_at(poly, z1), ring_at(top, z2)], mat=mat, closed=True, bevel=0.006)


# ----------------------------------------------------------------------------- small fittings
def latch(P, x, y, z, s=1.0):
    """Round flush latch: steel ring, dark disc with a turn slot."""
    P.tube(0.064 * s, 0.049 * s, 0.012, at=(x, y, z + 0.004), mat="metal_steel", segs=28, bevel=0.002)
    P.cyl(0.049 * s, 0.006, at=(x, y, z + 0.001), mat="metal_dark", segs=24, bevel=0.0)
    P.box((0.075 * s, 0.014 * s, 0.006), at=(x, y, z + 0.006), rot=(0, 0, 35), mat="metal_bare", bevel=0.002)
    P.cyl(0.012 * s, 0.004, at=(x, y, z + 0.009), mat="metal_bare", segs=12, bevel=0.0)


def grip(P, M):
    """Recessed grip cup on a vertical face (local: face at y = 0, outward -Y, up +Z)."""
    P.box((0.15, 0.012, 0.085), M=M @ xf((0, -0.004, 0)), mat="metal_steel", bevel=0.004)
    P.box((0.128, 0.014, 0.064), M=M @ xf((0, -0.006, 0)), mat="plastic_black", bevel=0.003)
    P.cyl(0.007, 0.11, M=M @ xf((0, -0.012, 0.012), (0, 90, 0)), mat="metal_chrome", segs=10, bevel=0.0)


def grille(P, M, w=0.11, h=0.085, slats=6):
    """Slotted grille on a vertical face (local: face at y = 0, outward -Y)."""
    P.box((w, 0.012, h), M=M @ xf((0, -0.004, 0)), mat="metal_steel", bevel=0.004)
    P.box((w - 0.02, 0.014, h - 0.02), M=M @ xf((0, -0.006, 0)), mat="plastic_black", bevel=0.0)
    for k in range(slats):
        z = -h / 2 + 0.016 + k * (h - 0.032) / (slats - 1)
        P.box((w - 0.024, 0.006, 0.006), M=M @ xf((0, -0.013, z)), mat="metal_bare", bevel=0.0)


SLOPE = math.degrees(math.atan2(TOP_IN, Z_TOP - Z_LID1))


def slope_frame(s, y):
    """A fitting set into the sloped chamfer of a long side (s = +1 right, -1 left) at y."""
    x = s * (W / 2 - TOP_IN / 2 + 0.002)
    return xf((x, y, (Z_LID1 + Z_TOP) / 2 + 0.002), (-SLOPE, 0, 90 * s))


def face_frame(x, y, z, yaw):
    """Matrix for a fitting on a vertical face whose outward normal points at yaw (degrees, 0 = -Y)."""
    return xf((x, y, z), (0, 0, yaw))


# ----------------------------------------------------------------------------- the pod
def body():
    """The fixed body: base, flanges, band, end blocks, head block, tub and stretcher."""
    P = Part("pod_body")
    O = outline()
    hole = [cavity(0.012)[::-1]]
    # ---- base (solid below the tub, a ring around it above)
    base = offset(O, -0.012)
    P.prism(base, Z_TUB - 0.02, mat="pod_white", bevel=0.008)
    P.prism(base, Z_BASE - (Z_TUB - 0.02), M=xf((0, 0, Z_TUB - 0.02)), mat="pod_white", bevel=0.008, holes=hole, exact_holes=True)
    # panel seams on the base sides and ends
    for y in (-0.62, 0.12, 0.78):
        for s in (-1, 1):
            P.box((0.004, 0.006, Z_BASE - 0.05), at=(s * (W / 2 - 0.0095), y, Z_BASE / 2), mat="metal_dark", bevel=0.0)
    for x in (-0.18, 0.18):
        for s in (-1, 1):
            P.box((0.006, 0.004, Z_BASE - 0.05), at=(x, s * (L / 2 - 0.0095), Z_BASE / 2), mat="metal_dark", bevel=0.0)
    for s in (-1, 1):
        # a small access panel with four screws on each side
        P.box((0.004, 0.34, 0.16), at=(s * (W / 2 - 0.009), -0.25, 0.17), mat="pod_white", bevel=0.002)
        for dy in (-0.15, 0.15):
            for dz in (-0.065, 0.065):
                P.cyl(0.007, 0.004, at=(s * (W / 2 - 0.006), -0.25 + dy, 0.17 + dz), rot=(0, 90, 0), mat="metal_bare", segs=8, bevel=0.0)
    # ---- flange plates (proud, rounded), each pair with a thin dark spacer between
    plate = rounded(offset(O, FL_OUT), 0.05, 3)
    for (z0, z1) in FL_LO + FL_HI:
        P.prism(plate, z1 - z0, M=xf((0, 0, z0)), mat="pod_flange", bevel=0.005, holes=hole, exact_holes=True)
    for (a, b) in (FL_LO, FL_HI):
        P.prism(offset(O, FL_OUT - 0.02), b[0] - a[1], M=xf((0, 0, a[1])), mat="plastic_black", bevel=0.0, holes=hole, exact_holes=True)
    # ---- quilted band (between the head and foot blocks)
    band = offset(O, -0.008)
    P.prism(band, BAND[1] - BAND[0], M=xf((0, 0, BAND[0])), mat="pod_quilt", bevel=0.01, holes=hole, exact_holes=True)
    # white end blocks at band level, proud of the quilting: head (full height of the band) and foot
    head_band = clip(offset(O, 0.004), Y_HEAD + 0.014, True)
    P.prism(head_band, BAND[1] - BAND[0], M=xf((0, 0, BAND[0])), mat="pod_white", bevel=0.006)
    # (the foot block wraps round the end of the tub: a U in plan)
    yc = -L / 2 + 0.30
    foot = clip(offset(O, 0.004), yc, False)
    cx, cy = CAV_X + 0.012, CAV_Y0 - 0.012
    k = next(i for i in range(len(foot)) if abs(foot[i][1] - yc) < 1e-6 and abs(foot[(i + 1) % len(foot)][1] - yc) < 1e-6)
    a, b = foot[k], foot[(k + 1) % len(foot)]
    notch = [(cx, yc), (cx, cy), (-cx, cy), (-cx, yc)] if a[0] > b[0] else [(-cx, yc), (-cx, cy), (cx, cy), (cx, yc)]
    foot = foot[:k + 1] + notch + foot[k + 1:]
    P.prism(foot, BAND[1] - BAND[0], M=xf((0, 0, BAND[0])), mat="pod_white", bevel=0.004)
    # ---- head block: chamfered top segment above the upper flanges
    head_top = clip(O, Y_HEAD + 0.003, True)
    chamfered_block(P, head_top, Y_HEAD + 0.003, Z_LID0, Z_LID1, Z_TOP, "pod_white", True)
    # head block fittings: ring latch, dial with its LCD unit, grille on the end face
    latch(P, -0.20, L / 2 - 0.17, Z_TOP)
    dy = L / 2 - 0.17
    P.box((0.16, 0.085, 0.034), at=(0.12, dy, Z_TOP + 0.017), mat="metal_steel", bevel=0.006)
    P.box((0.085, 0.05, 0.004), at=(0.10, dy, Z_TOP + 0.035), mat="plastic_black", bevel=0.0)
    P.box((0.072, 0.038, 0.002), at=(0.10, dy, Z_TOP + 0.0375), mat="pod_lcd", bevel=0.0)
    for k in range(4):
        P.box((0.008, 0.016, 0.0006), at=(0.074 + k * 0.016, dy, Z_TOP + 0.0388), mat="plastic_black", bevel=0.0)
    P.cyl(0.048, 0.05, at=(0.25, dy, Z_TOP + 0.025), mat="metal_chrome", segs=32, bevel=0.004)
    P.cyl(0.05, 0.022, at=(0.25, dy, Z_TOP + 0.02), mat="metal_steel", segs=24, bevel=0.0)
    P.cyl(0.03, 0.006, at=(0.25, dy, Z_TOP + 0.052), mat="metal_dark", segs=20, bevel=0.0)
    grille(P, face_frame(0.12, L / 2 + 0.001, 0.80, 180), w=0.13, h=0.07, slats=5)
    for s in (-1, 1):
        grille(P, slope_frame(s, Y_HEAD + 0.17), w=0.1, h=0.07, slats=5)
    # a row of four toggle switches beside the head grille
    P.box((0.15, 0.012, 0.045), at=(-0.15, L / 2 + 0.003, 0.80), mat="metal_steel", bevel=0.003)
    for k in range(4):
        P.cyl(0.004, 0.025, at=(-0.204 + k * 0.036, L / 2 + 0.018, 0.80), rot=(80, 0, 0), mat="metal_chrome", segs=8, bevel=0.0)
    # ---- tub: open box facing in, ribbed floor, lid rails along the rim
    x0, x1, y0, y1 = -CAV_X, CAV_X, CAV_Y0, CAV_Y1
    zt, zr = Z_TUB, Z_LID0
    P.mesh([(x0, y0, zt), (x1, y0, zt), (x1, y1, zt), (x0, y1, zt),
            (x0, y0, zr), (x1, y0, zr), (x1, y1, zr), (x0, y1, zr)],
           [(0, 1, 2, 3), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)], mat="pod_tub", recalc=False)
    for x in (-0.32, -0.16, 0.0, 0.16, 0.32):
        P.box((0.018, y1 - y0 - 0.02, 0.03), at=(x, (y0 + y1) / 2, zt + 0.015), mat="plastic_black", bevel=0.004)
    ny = 9
    for k in range(ny + 1):
        y = y0 + 0.04 + k * (y1 - y0 - 0.08) / ny
        P.box((2 * CAV_X - 0.02, 0.018, 0.026), at=(0, y, zt + 0.013), mat="plastic_black", bevel=0.004)
    for s in (-1, 1):
        P.cyl(0.011, y1 - y0, at=(s * (CAV_X - 0.02), (y0 + y1) / 2, zr - 0.02), rot=(90, 0, 0), mat="metal_chrome", segs=10, bevel=0.0)
        # the rails continue under the lid's travel on the foot end
    # ---- stretcher: side tubes, end bars, legs, net bed, headrest
    ys0, ys1 = y0 + 0.05, y1 - 0.06
    for s in (-1, 1):
        P.cyl(0.018, ys1 - ys0, at=(s * TUBE_X, (ys0 + ys1) / 2, TUBE_Z), rot=(90, 0, 0), mat="metal_chrome", segs=12, bevel=0.0)
        for y in (ys0 + 0.08, ys0 + 0.62, ys1 - 0.6, ys1 - 0.06):
            P.cyl(0.014, TUBE_Z - zt - 0.02, at=(s * TUBE_X, y, (TUBE_Z + zt) / 2 + 0.01), mat="metal_steel", segs=10, bevel=0.0)
    for y in (ys0, ys1):
        P.cyl(0.016, 2 * TUBE_X, at=(0, y, TUBE_Z), rot=(0, 90, 0), mat="metal_chrome", segs=12, bevel=0.0)
    P.box((2 * TUBE_X - 0.03, ys1 - ys0 - 0.02, 0.012), at=(0, (ys0 + ys1) / 2, Z_BED - 0.006), mat="pod_net", bevel=0.003)
    P.box((0.34, 0.24, 0.05), at=(0, y1 - 0.15, Z_BED + 0.025), mat="seat_leather_dark", bevel=0.02)
    # inside face of the head block: a padded panel with a small vent
    P.box((2 * CAV_X - 0.06, 0.02, 0.3), at=(0, y1 - 0.012, zt + 0.25), mat="seat_leather_dark", bevel=0.01)
    # ---- foot end: pneumatic valve with its hoses (ref. 1)
    vx, vy, vz = 0.16, -L / 2 + 0.012, 0.22
    P.box((0.11, 0.035, 0.04), at=(vx, vy - 0.03, vz), mat="metal_steel", bevel=0.004)
    P.box((0.05, 0.05, 0.06), at=(vx - 0.08, vy - 0.035, vz + 0.01), mat="plastic_black", bevel=0.004)
    P.cyl(0.012, 0.02, at=(vx - 0.08, vy - 0.07, vz + 0.025), rot=(90, 0, 0), mat="metal_brass", segs=10, bevel=0.0)
    for k, dx in enumerate((0.02, 0.05)):
        P.cyl(0.008, 0.025, at=(vx + dx, vy - 0.035, vz - 0.03), mat="metal_brass", segs=8, bevel=0.0)
        path = [Vector((vx + dx, vy - 0.035, vz - 0.04)), Vector((vx + dx + 0.01, vy - 0.05, vz - 0.11)),
                Vector((vx + dx - 0.05 - 0.04 * k, vy - 0.12, 0.06)), Vector((vx - 0.18 - 0.05 * k, vy - 0.14, 0.015)),
                Vector((vx - 0.35, vy - 0.08 - 0.05 * k, 0.012))]
        P.pipe(path, 0.007, mat="rubber", segs=8, bend=0.04)
    P.pipe([Vector((vx - 0.08, vy - 0.08, vz + 0.025)), Vector((vx - 0.1, vy - 0.12, vz - 0.02)), Vector((vx - 0.16, vy - 0.15, 0.05)),
            Vector((vx - 0.06, vy - 0.2, 0.012)), Vector((vx + 0.2, vy - 0.18, 0.012))], 0.006, mat="rubber", segs=8, bend=0.04)
    return P.finish(col=0)


def lid():
    """The sliding lid (origin at the pod's origin, so its keyframes are plain offsets)."""
    P = Part("pod_lid")
    poly = clip(outline(), Y_HEAD - 0.003, False)
    chamfered_block(P, poly, Y_HEAD - 0.003, Z_LID0, Z_LID1, Z_TOP, "pod_white", False)
    # underside liner over the tub and a dim interior light near the head
    P.box((2 * CAV_X - 0.04, Y_HEAD - CAV_Y0 - 0.06, 0.006), at=(0, (Y_HEAD + CAV_Y0) / 2 - 0.01, Z_LID0 - 0.003), mat="pod_tub", bevel=0.0)
    P.box((0.34, 0.03, 0.006), at=(0, Y_HEAD - 0.1, Z_LID0 - 0.007), mat="emit_cool", bevel=0.0)
    # top: round flush latches (ref. 1: staggered pairs) and the foot switch plate
    for (x, y) in ((0.30, Y_HEAD - 0.22), (-0.28, Y_HEAD - 0.62), (0.29, -0.28), (-0.30, -0.78), (0.24, -L / 2 + 0.36)):
        latch(P, x, y, Z_TOP)
    P.box((0.17, 0.07, 0.01), at=(-0.18, -L / 2 + 0.24, Z_TOP + 0.005), mat="metal_steel", bevel=0.003)
    for k in range(4):
        P.cyl(0.005, 0.022, at=(-0.24 + k * 0.04, -L / 2 + 0.24, Z_TOP + 0.018), rot=(15, 0, 0), mat="metal_chrome", segs=8, bevel=0.0)
    # recessed grips and slotted grilles on the sloped chamfers of the long sides (refs. 1, 2, 4)
    for s in (-1, 1):
        for (y, kind) in ((-0.86, "grille"), (-0.66, "grip"), (0.10, "grip"), (0.30, "grille")):
            (grip if kind == "grip" else grille)(P, slope_frame(s, y))
    return P.finish(col=0, part="lid", dynamic=1)


# ----------------------------------------------------------------------------- the film
def body_profile(y):
    """Half width (arms at the sides included) and height above the bed of a sleeper lying head at +Y."""
    pts = [(-1.00, 0.12, 0.20), (-0.92, 0.13, 0.13), (-0.62, 0.15, 0.12), (-0.48, 0.16, 0.15), (-0.22, 0.20, 0.16),
           (-0.05, 0.25, 0.19), (0.10, 0.27, 0.20), (0.30, 0.28, 0.23), (0.44, 0.27, 0.19)]
    if y <= pts[0][0]:
        return pts[0][1], pts[0][2]
    for a, b in zip(pts[:-1], pts[1:]):
        if a[0] <= y <= b[0]:
            t = (y - a[0]) / (b[0] - a[0])
            t = t * t * (3 - 2 * t)
            return a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t
    return pts[-1][1], pts[-1][2]


def resample(path, n):
    """n points evenly spaced by arc length along a 2D polyline."""
    seg = [(path[i + 1] - path[i]).length for i in range(len(path) - 1)]
    total = sum(seg)
    out = []
    for k in range(n):
        d = total * k / (n - 1)
        i = 0
        while i < len(seg) - 1 and d > seg[i]:
            d -= seg[i]
            i += 1
        t = 0 if seg[i] < 1e-9 else min(1.0, d / seg[i])
        out.append(path[i].lerp(path[i + 1], t))
    return out, total


def cut_at(path, length):
    """The start of a polyline, cut where its arc length reaches `length`."""
    acc, out = 0.0, [path[0]]
    for i in range(len(path) - 1):
        seg = (path[i + 1] - path[i]).length
        if acc + seg >= length:
            out.append(path[i].lerp(path[i + 1], (length - acc) / seg))
            return out
        out.append(path[i + 1])
        acc += seg
    return out


def wrap_path(bw, bh):
    """Right half (x > 0) of the wrapped film, from the side tube over the body to just past the centre line."""
    pts = [Vector((TUBE_X, TUBE_Z + 0.012))]
    a, b = bw + 0.03, bh + 0.022
    z0 = Z_BED + 0.012
    pts.append(Vector((min(TUBE_X - 0.004, a + 0.004), z0 + 0.012)))
    p = 2.8
    for k in range(1, 15):
        th = (math.pi / 2) * k / 14
        c, s_ = math.cos(th), math.sin(th)
        pts.append(Vector((a * (c ** (2 / p)), z0 + b * (s_ ** (2 / p)))))
    pts.append(Vector((-0.035, z0 + b - 0.004)))
    return pts


def film():
    NY, NU = 44, 18
    Y0, Y1 = -0.99, 0.44
    verts_open, verts_raised, verts_wrap = [], [], []
    rows = []
    for j in range(NY + 1):
        y = Y0 + (Y1 - Y0) * j / NY
        bw, bh = body_profile(y)
        wrap, length = resample(wrap_path(bw, bh), NU + 1)
        # raised: up from the tube to just under the lid (which covers the foot half while it is open), then
        # leaning in over the body like a tent; from here the film falls onto the body
        tent = [Vector((TUBE_X, TUBE_Z + 0.012)), Vector((TUBE_X - 0.015, Z_LID0 - 0.09)), Vector((TUBE_X - 0.06, Z_LID0 - 0.06)),
                Vector((-0.2, Z_LID0 - 0.05))]
        raised, _ = resample(cut_at(tent, length), NU + 1)
        # open: down past the tube into the gap, along the tub floor and up the tub wall (same length of film)
        down = [Vector((TUBE_X + 0.012, TUBE_Z + 0.012)), Vector((TUBE_X + 0.03, Z_TUB + 0.045)), Vector((CAV_X - 0.035, Z_TUB + 0.04)),
                Vector((CAV_X - 0.012, Z_TUB + 0.07)), Vector((CAV_X - 0.01, Z_LID0 - 0.06)), Vector((CAV_X - 0.06, Z_LID0 - 0.05)),
                Vector((0.1, Z_LID0 - 0.05))]
        opened, _ = resample(cut_at(down, length), NU + 1)
        rows.append((y, opened, raised, wrap))
    # crumple: the same small offsets (along each state's own section normal) in every state
    import random
    rnd = random.Random(7)
    noise = [[(rnd.random() - 0.5) for _ in range(NU + 1)] for _ in range(NY + 1)]

    def crumple(sec, j, side):
        out = []
        for k, p in enumerate(sec):
            a = sec[max(0, k - 1)]
            b = sec[min(len(sec) - 1, k + 1)]
            t = (b - a)
            nrm = Vector((-t.y, t.x)).normalized() if t.length > 1e-9 else Vector((0, 1))
            w = 0.0 if k == 0 else 1.0
            amp = (0.006 * noise[j][k] + 0.008 * math.sin(k * 1.7 + j * 0.9 + side) * math.sin(j * 0.37 + k * 0.5)) * w
            out.append(p + nrm * amp)
        return out

    verts = {0: [], 1: [], 2: []}
    for side in (1, -1):
        for j, (y, opened, raised, wrap) in enumerate(rows):
            for st, sec in enumerate((opened, raised, wrap)):
                sec = crumple(sec, j, side)
                lift = 0.004 if side > 0 else 0.0
                for k, p in enumerate(sec):
                    yy = y + 0.004 * math.sin(k * 2.3 + j * 1.1)
                    verts[st].append((side * p.x, yy, p.y + (lift if st == 2 else 0.0)))
    faces, mats = [], []
    nrow = NU + 1
    for h in range(2):
        base = h * (NY + 1) * nrow
        for j in range(NY):
            for k in range(NU):
                a = base + j * nrow + k
                b, c, d = a + nrow, a + nrow + 1, a + 1
                faces.append((a, b, c, d) if h == 0 else (a, d, c, b))
                yc = Y0 + (Y1 - Y0) * (j + 0.5) / NY
                mats.append(1 if 0.17 <= yc <= 0.25 and k >= 3 else 0)
    me = bpy.data.meshes.new("pod_sheet")
    me.from_pydata(verts[0], [], faces)
    me.update()
    me.materials.append(mat("pod_film"))
    me.materials.append(mat("pod_tape"))
    for p, m in zip(me.polygons, mats):
        p.material_index = m
        p.use_smooth = True
    # UVs in metres: across the section (arc length in the wrapped state) and along the pod
    uvl = me.uv_layers.new(name="UVMap")
    for p in me.polygons:
        for li in p.loop_indices:
            vi = me.loops[li].vertex_index
            h, r = divmod(vi, (NY + 1) * nrow)
            j, k = divmod(r, nrow)
            uvl.data[li].uv = (k * 0.03 + h * 0.5, verts[0][vi][1])
    ob = bpy.data.objects.new("pod_sheet", me)
    link(ob)
    ob.shape_key_add(name="Basis")
    for name, st in (("raised", 1), ("wrap", 2)):
        sk = ob.shape_key_add(name=name)
        for i, v in enumerate(verts[st]):
            sk.data[i].co = v
    props(ob, part="sheet", dynamic=1, shadow=0, col=0)
    return ob


# ----------------------------------------------------------------------------- eye path
def look_quat(fwd, up):
    """Rotation of an empty whose +Y looks along fwd with +Z up (after the glTF Y-up conversion the engine
    sees -Z forward and +Y up, as a camera)."""
    f = Vector(fwd).normalized()
    r = f.cross(Vector(up)).normalized()
    u = r.cross(f).normalized()
    return Matrix((r, f, u)).transposed().to_quaternion()


EYE_KEYS = [
    # frame, position (standing on the +X side), look-at point or ('dir', fwd, up)
    (F_IN, (1.02, 0.32, PIT + 1.62), (0.05, 0.12, 0.55)),
    (F_IN + 28, (0.74, 0.27, PIT + 1.34), (-0.2, -0.35, 0.5)),
    (F_IN + 56, (0.40, 0.22, PIT + 1.12), (-0.05, -0.95, 0.55)),
    (F_IN + 84, (0.03, 0.16, Z_BED + 0.80), (0.0, -1.0, 0.62)),
    (F_IN + 104, (0.0, 0.48, Z_BED + 0.42), ("dir", (0, -1.0, 0.05), (0, 0.1, 1))),
    # lying on the headrest, chin a little down: the body, the film and the lid above it in view (the eyes are in
    # front of the head's centre plane, which lies at the height of the crew marker)
    (F_WRAP, (0.0, Y_HEAD - 0.15, Z_BED + 0.215), ("dir", (0, -1.0, 0.3), (0, 0.3, 1))),
]


def eye(side):
    ob = empty(f"pod_eye_{'r' if side > 0 else 'l'}", kind="eye", id="r" if side > 0 else "l")
    ob.rotation_mode = "QUATERNION"
    prev = None
    for f, pos, tgt in EYE_KEYS:
        p = Vector((pos[0] * side, pos[1], pos[2]))
        if tgt[0] == "dir":
            fwd, up = Vector(tgt[1]), Vector(tgt[2])
            fwd.x *= side
            up.x *= side
        else:
            fwd = Vector((tgt[0] * side, tgt[1], tgt[2])) - p
            up = Vector((0, 0, 1))
        q = look_quat(fwd, up)
        if prev is not None and prev.dot(q) < 0:
            q = -q
        prev = q
        ob.location = p
        ob.rotation_quaternion = q
        ob.keyframe_insert("location", frame=f)
        ob.keyframe_insert("rotation_quaternion", frame=f)
    return ob


def animate(lid_ob, sheet_ob):
    sc = bpy.context.scene
    sc.render.fps = FPS
    sc.frame_start, sc.frame_end = F_OPEN, F_END
    for f, loc in ((F_OPEN, (0, 0, 0)), (F_OPEN + 10, (0, 0, 0.02)), (F_IN, (0, -SLIDE, 0.02)),
                   (F_CLOSE, (0, -SLIDE, 0.02)), (F_END - 10, (0, 0, 0.02)), (F_END, (0, 0, 0))):
        lid_ob.location = loc
        lid_ob.keyframe_insert("location", frame=f)
    keys = sheet_ob.data.shape_keys.key_blocks
    for f, (r, w) in ((F_WRAP, (0, 0)), (F_WRAP + 45, (1, 0)), (F_CLOSE, (0, 1))):
        keys["raised"].value, keys["wrap"].value = r, w
        keys["raised"].keyframe_insert("value", frame=f)
        keys["wrap"].keyframe_insert("value", frame=f)


def crew_marker():
    """Where a sleeping crew member is attached: at the feet, character +Y toward the head, facing up."""
    m = Matrix(((-1, 0, 0), (0, 0, 1), (0, 1, 0))).transposed()
    rot = m.to_euler()
    ob = marker("lie", "crew", at=(0, Y_HEAD - 0.06 - 1.78, Z_BED + 0.115))
    ob.rotation_euler = rot
    return ob


def build():
    reset()
    b = body()
    lo = lid()
    sh = film()
    hull = Part("pod_hull")
    hull.prism(rounded(offset(outline(), FL_OUT), 0.05, 2), Z_TOP + 0.02, mat="concrete", bevel=0.0)
    collider("pod_col", hull)
    eye(1)
    eye(-1)
    crew_marker()
    marker("use", "pod", at=(0, 0.2, Z_TOP + 0.05), label="Hypersleep pod")
    # a soft cold light at the head of the tub (on while the pod is open or in use)
    light("pod", at=(0, Y_HEAD - 0.06, Z_LID0 - 0.05), color=(0.8, 0.88, 1.0), power=14, dist=2.6)
    animate(lo, sh)
    bpy.context.scene.frame_set(0)
    bake_ao([b, lo], ground_z=0.0, local_dist=0.5)
    return b, lo, sh


def mannequin():
    """A lying figure for the preview renders only (never exported)."""
    P = Part("_figure")
    zb = Z_BED + 0.012
    P.box((0.42, 0.55, 0.2), at=(0, 0.12, zb + 0.11), mat="cloth_white", bevel=0.08)
    P.box((0.36, 0.3, 0.18), at=(0, -0.2, zb + 0.1), mat="cloth_white", bevel=0.07)
    for s in (-1, 1):
        P.cyl(0.065, 0.85, at=(s * 0.09, -0.76, zb + 0.07), rot=(90, 0, 0), mat="cloth_white", segs=12)
        P.cyl(0.045, 0.6, at=(s * 0.235, 0.05, zb + 0.06), rot=(90, 0, 0), mat="cloth_white", segs=10)
        P.box((0.09, 0.05, 0.16), at=(s * 0.09, -1.18, zb + 0.08), mat="cloth_white", bevel=0.02)
    return P.finish()


if __name__ == "__main__":
    b, lo, sh = build()
    if "--preview" in sys.argv:
        sc = bpy.context.scene
        sc.frame_set(0)
        preview("cryopod_closed", (2.6, -2.9, 1.7), (0, -0.1, 0.6), res=(1200, 700), lens=40, samples=48, sun_rot=(55, 0, 30), sky=(0.95, 0.95, 0.95))
        sc.frame_set(F_IN)
        preview("cryopod_open", (-2.2, 3.0, 1.9), (0, -0.2, 0.55), res=(1200, 700), lens=40, samples=48, sun_rot=(55, 0, 210), sky=(0.95, 0.95, 0.95))
        fig = mannequin()
        sc.frame_set(F_CLOSE)
        preview("cryopod_wrapped", (1.4, 1.6, 1.8), (0, -0.2, 0.45), res=(1200, 700), lens=35, samples=48, sun_rot=(60, 0, 40), sky=(0.95, 0.95, 0.95))
        # what the commander sees: the film closing over the body, then the lid
        head = [o for o in bpy.data.objects if o.name == "_figure"]
        eye_p = Vector((0.0, Y_HEAD - 0.15, Z_BED + 0.215))
        fwd = Vector((0, -1.0, 0.3)).normalized()
        sc.frame_set(F_WRAP + 30)
        preview("cryopod_pov_raise", tuple(eye_p), tuple(eye_p + fwd), res=(1000, 620), lens=17, samples=40, sun_rot=(60, 0, 40), sky=(0.95, 0.95, 0.95), up=(0, 0.3, 1))
        sc.frame_set(F_CLOSE)
        preview("cryopod_pov_wrapped", tuple(eye_p), tuple(eye_p + fwd), res=(1000, 620), lens=17, samples=40, sun_rot=(60, 0, 40), sky=(0.95, 0.95, 0.95), up=(0, 0.3, 1))
        sc.frame_set(F_CLOSE + 45)
        preview("cryopod_pov_closing", tuple(eye_p), tuple(eye_p + fwd), res=(1000, 620), lens=17, samples=40, sun_rot=(60, 0, 40), sky=(0.95, 0.95, 0.95), up=(0, 0.3, 1))
        sc.frame_set(F_WRAP + 45)
        preview("cryopod_raised", (1.4, 1.6, 1.8), (0, -0.2, 0.45), res=(1200, 700), lens=35, samples=48, sun_rot=(60, 0, 40), sky=(0.95, 0.95, 0.95))
        me = fig.data
        bpy.data.objects.remove(fig)
        bpy.data.meshes.remove(me)
        sc.frame_set(0)
    export_glb("cryo_pod", anim=True)
    save_blend("cryo_pod")
