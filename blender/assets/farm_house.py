"""
Cooper farmhouse — exterior shell, roofs, porch and trim (realism pass, reference images 1–2).

Measured from the reference photographs (two viewpoints, both from the south-west):
  * Main block: two storeys, 7.5 m wide x 9 m deep, steep 42-degree gable roof whose ridge runs north–south, so the
    gable end faces the front (south). Two tall boarded-up windows in the front gable, a louvred attic vent near the
    apex, dark mottled asphalt shingles with three small box vents near the ridge on the west slope.
  * West wing: one and a half storeys, ridge running east–west (perpendicular to the main block), gable on the west
    end with two windows and a small vent; its front wall is set back 1.4 m from the main block's front. A short
    stovepipe chimney sits behind the ridge, and a tall weathervane (cardinal arms + rooster) near the west end.
  * The long front porch roof continues the wing's south roof plane at a shallower pitch and runs along the whole
    front on ten thin square white posts; the deck is raised with a dark open skirt and drifts of dust against it.
  * Weathered white lap siding (real 3-D courses), corner boards, frieze, water table, boxed eaves with returns,
    rake trim, K-style gutters, a satellite dish under the main west eave, electric service mast and meter.

Blender: X east, Y north, Z up. Origin = centre of the main block at ground level.
"""
import math, random
import bpy, bmesh
import kit, arch
from kit import V, box, cyl, prism, M, empty, merge, finish, set_props

PI = math.pi
# ---- levels
F0, C0, F1, C1 = 0.55, 3.15, 3.35, 6.05
WT0, WT1 = 0.40, 0.60          # water table board (siding starts above it)
# ---- main block
MX0, MX1, MY0, MY1 = -3.75, 3.75, -4.5, 4.5
EAVE = 6.3                      # top of wall plate
PM = math.radians(42.0)
TM = math.tan(PM)
HT = 0.22                       # roof build-up above the plate, measured vertically at the wall line
OV, OG = 0.30, 0.30             # eave / gable overhangs (horizontal)
RIDGE = EAVE + (MX1 - MX0) / 2 * TM
M_EDGE = EAVE + HT - OV * TM    # top of roof deck at the eave edge
M_SOFFIT = M_EDGE - 0.20        # underside of fascia / soffit level
M_FRIEZE = M_SOFFIT - 0.20      # bottom of the frieze board
# ---- west wing
WX0, WX1, WY0, WY1 = -12.25, -3.75, -3.1, 3.3
WRY = (WY0 + WY1) / 2
W_EAVE = 3.7
PW = math.radians(30.0)
TW = math.tan(PW)
W_RIDGE = W_EAVE + (WY1 - WY0) / 2 * TW
W_EDGE = W_EAVE + HT - OV * TW
W_SOFFIT = W_EDGE - 0.20
# ---- porch
PX0, PX1 = -12.25, 5.75
PDY = -7.0                      # deck front edge
PPY = -6.85                     # post line
PBZ, PBT = 2.95, 3.17           # beam bottom / top
PRT = 0.16                      # porch roof build-up (vertical)
PY_OUT = -7.25                  # porch roof front edge
TP = (W_EAVE + HT - PRT - PBT) / (WY0 - PPY)
POSTS_X = [-11.95 + k * (5.55 + 11.95) / 9 for k in range(10)]

# ---- openings: (along, width, sill, head) per wall (along measured from the wall's start point)
G_SILL, G_HEAD = 1.25, 2.85     # ground-floor windows
U_SILL, U_HEAD = 3.95, 5.65     # upper windows (head casing + drip cap stop at the frieze)
DOOR_H = 2.08

# main block walls (CCW). south: x = -3.75 + along ; east: y = -4.5 + along ; north: x = 3.75 - along ; west: y = 4.5 - along
MAIN_S = dict(a=(MX0, MY0), b=(MX1, MY0),
              win=[(4.6, 0.85, G_SILL, G_HEAD, "lr_s1"), (6.2, 0.85, G_SILL, G_HEAD, "lr_s2"),
                   (1.8, 0.95, U_SILL, U_HEAD, "ms_s", "boarded"), (5.7, 0.95, U_SILL, U_HEAD, "rc_s", "boarded")],
              doors=[(2.05, 0.95, F0, F0 + DOOR_H, "front")])
MAIN_E = dict(a=(MX1, MY0), b=(MX1, MY1),
              win=[(2.9, 0.85, G_SILL, G_HEAD, "lr_e"), (8.25, 0.7, G_SILL, G_HEAD, "k_e"),
                   (1.9, 0.85, U_SILL, U_HEAD, "rc_e"), (6.0, 0.85, U_SILL, U_HEAD, "hall_e")],
              doors=[])
MAIN_N = dict(a=(MX1, MY1), b=(MX0, MY1),
              win=[(3.2, 0.85, F0 + 1.05, G_HEAD, "k_n"), (5.65, 0.85, U_SILL, U_HEAD, "ba_n"), (1.85, 0.85, U_SILL, U_HEAD, "hall_n")],
              doors=[(6.15, 0.9, F0, F0 + DOOR_H, "back")])
MAIN_W = dict(a=(MX0, MY1), b=(MX0, MY0),
              win=[(0.6, 0.7, G_SILL, G_HEAD, "k_w"), (0.65, 0.8, U_SILL, U_HEAD, "ba_w1"), (2.9, 0.8, 5.0, U_HEAD, "ba_w2"),
                   (8.0, 0.85, U_SILL, U_HEAD, "ms_w")],
              doors=[(1.95, 0.9, F0, F0 + DOOR_H, "km"), (6.1, 0.95, F0, F0 + DOOR_H, "lw")])
# wing walls. south: x = -12.25 + along ; west: y = 3.3 - along ; north: x = -3.75 - along
WING_S = dict(a=(WX0, WY0), b=(WX1, WY0),
              win=[(1.25, 0.85, G_SILL, G_HEAD, "of_s1"), (5.65, 0.85, G_SILL, G_HEAD, "of_s2")],
              doors=[(4.15, 0.9, F0, F0 + DOOR_H, "wing"), (7.65, 0.9, F0, F0 + DOOR_H, "wing2")])
WING_W = dict(a=(WX0, WY1), b=(WX0, WY0),
              win=[(1.7, 0.85, G_SILL, G_HEAD, "mu_w"), (4.9, 0.85, G_SILL, G_HEAD, "of_w")],
              doors=[])
WING_N = dict(a=(WX1, WY1), b=(WX0, WY1),
              win=[(2.25, 0.85, G_SILL, G_HEAD, "mu_n")],
              doors=[(5.55, 0.9, F0, F0 + DOOR_H, "mud")])


# ------------------------------------------------------------------------------------------------ helpers
def wall_frame(a, b):
    d = V((b[0] - a[0], b[1] - a[1], 0))
    L = d.length
    d /= L
    nout = V((d.y, -d.x, 0))
    return d, nout, L


def wp(a, d, nout, s, t, z):
    """Point on a wall: s along, t outward from the sheathing face, absolute z."""
    return (a[0] + d.x * s + nout.x * t, a[1] + d.y * s + nout.y * t, z)


def obox(name, O, U, Vv, Nn, a0, a1, b0, b1, c0, c1, m):
    """Oriented box from an origin and three axis vectors (need not be orthonormal)."""
    O, U, Vv, Nn = V(O), V(U), V(Vv), V(Nn)
    bm = bmesh.new()
    vs = {}
    for i, a in enumerate((a0, a1)):
        for j, b in enumerate((b0, b1)):
            for k, c in enumerate((c0, c1)):
                vs[i, j, k] = bm.verts.new(O + U * a + Vv * b + Nn * c)
    for f in (((0, 0, 0), (0, 1, 0), (1, 1, 0), (1, 0, 0)), ((0, 0, 1), (1, 0, 1), (1, 1, 1), (0, 1, 1)),
              ((0, 0, 0), (1, 0, 0), (1, 0, 1), (0, 0, 1)), ((0, 1, 0), (0, 1, 1), (1, 1, 1), (1, 1, 0)),
              ((0, 0, 0), (0, 0, 1), (0, 1, 1), (0, 1, 0)), ((1, 0, 0), (1, 1, 0), (1, 1, 1), (1, 0, 1))):
        bm.faces.new([vs[x] for x in f])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return kit.from_bmesh(name, bm, (m,))


def seg_box(name, p0, p1, w, h, m, up=(0, 0, 1)):
    """Board/beam between two points; w across (horizontal-ish), h along `up`."""
    p0, p1 = V(p0), V(p1)
    U = p1 - p0
    L = U.length
    U.normalize()
    upv = V(up)
    if abs(U.dot(upv.normalized())) > 0.98:
        upv = V((1, 0, 0))
    S = U.cross(upv).normalized()
    Up = S.cross(U).normalized()
    return obox(name, p0, U, S, Up, 0, L, -w / 2, w / 2, -h / 2, h / 2, m)


def wbox(P, name, a, d, nout, s, t, z, size, m, rot_extra=(0, 0, 0)):
    """Axis-aligned-to-wall box: size = (along, outward, up)."""
    ang = math.atan2(d.y, d.x)
    o = box(name, size, loc=wp(a, d, nout, s, t, z), rot=(rot_extra[0], rot_extra[1], ang + rot_extra[2]), m=m)
    P.append(o)
    return o


# ------------------------------------------------------------------------------------------------ windows & doors
def vwin(P, G, wall, spec, interior=True, rng=None):
    """Victorian two-over-two double-hung window with flat casings, drip cap, sill and apron; interior casing,
    stool, curtains or a roller blind. spec = (along, width, sill, head, name[, 'boarded'])."""
    rng = rng or random.Random(hash(spec[4]) & 0xffff)
    a = wall["a"]
    d, nout, _ = wall_frame(wall["a"], wall["b"])
    s, W, sill, head, nm = spec[:5]
    boarded = len(spec) > 5 and spec[5] == "boarded"
    H = head - sill
    zc = (sill + head) / 2
    cw = 0.11
    B = lambda n_, sz, ss, tt, zz, m="wood_trim": wbox(P, n_, a, d, nout, s + ss, tt, zz, sz, m)
    # exterior casing
    for sx in (-1, 1):
        B(nm + "_cs", (cw, 0.03, H + 0.01), sx * (W / 2 + cw / 2), 0.015, zc)
    B(nm + "_ch", (W + 2 * cw, 0.03, 0.16), 0, 0.015, head + 0.08)
    B(nm + "_drip", (W + 2 * cw + 0.06, 0.06, 0.03), 0, 0.03, head + 0.175)
    B(nm + "_cap", (W + 2 * cw + 0.1, 0.075, 0.025), 0, 0.0375, head + 0.2025)
    B(nm + "_sill", (W + 2 * cw + 0.06, 0.11, 0.045), 0, 0.035, sill - 0.0225)
    B(nm + "_apron", (W + 2 * cw - 0.04, 0.025, 0.09), 0, 0.0125, sill - 0.09)
    # jamb lining through the wall
    for sx in (-1, 1):
        B(nm + "_jamb", (0.03, 0.2, H), sx * (W / 2 - 0.015), -0.1, zc)
    B(nm + "_hjamb", (W, 0.2, 0.03), 0, -0.1, head - 0.015)
    B(nm + "_sjamb", (W, 0.2, 0.03), 0, -0.1, sill + 0.015)
    # sashes (upper outside, lower inside), lower one sometimes raised a little
    iw = W - 0.06
    sh = (H - 0.06) / 2 + 0.02
    lift = 0.0 if boarded or rng.random() < 0.75 else rng.uniform(0.05, 0.25)
    for (zcen, ly, tr, br, tag) in ((head - 0.03 - sh / 2, -0.05, 0.055, 0.035, "u"), (sill + 0.03 + sh / 2 + lift, -0.095, 0.035, 0.075, "l")):
        for sx in (-1, 1):
            B(nm + "_st" + tag, (0.05, 0.04, sh), sx * (iw / 2 - 0.025), ly, zcen)
        B(nm + "_tr" + tag, (iw, 0.04, tr), 0, ly, zcen + sh / 2 - tr / 2)
        B(nm + "_br" + tag, (iw, 0.04, br), 0, ly, zcen - sh / 2 + br / 2)
        B(nm + "_mu" + tag, (0.02, 0.028, sh - tr - br), 0, ly, zcen + (br - tr) / 2)
        g = wbox([], nm + "_glass", a, d, nout, s, ly, zcen + (br - tr) / 2, (iw - 0.1, 0.006, sh - tr - br), "glass_clear")
        G.append(g)
    if boarded:
        n = 4
        pw = (W + 0.02) / n
        for i in range(n):
            B(nm + "_board", (pw - 0.008, 0.022, H + 0.02 - rng.uniform(0, 0.03)), -W / 2 - 0.01 + pw * (i + 0.5), 0.004, zc - rng.uniform(0, 0.015), "wood_board")
        for zz in (sill + 0.22, head - 0.22):
            B(nm + "_batten", (W - 0.04, 0.02, 0.08), 0, 0.026, zz, "wood_board")
    if not interior:
        return
    # interior casing, stool and apron
    for sx in (-1, 1):
        B(nm + "_ics", (0.075, 0.02, H + 0.075), sx * (W / 2 + 0.0375), -0.21, zc + 0.0375)
    B(nm + "_ich", (W + 0.15, 0.02, 0.075), 0, -0.21, head + 0.0375)
    B(nm + "_stool", (W + 0.14, 0.09, 0.03), 0, -0.235, sill + 0.015)
    B(nm + "_iapron", (W + 0.06, 0.02, 0.08), 0, -0.21, sill - 0.045)
    if boarded:
        return
    r = rng.random()
    if r < 0.55:   # curtains on a rod
        B(nm + "_rod", (W + 0.4, 0.02, 0.02), 0, -0.27, head + 0.12, "metal_dark")
        closed = rng.uniform(0.0, 0.35)
        cm = rng.choice(["fabric_curtain", "fabric_bed", "fabric_curtain", "cloth_khaki"])
        for sx in (-1, 1):
            pw = 0.28 + closed * W * 0.5
            for k in range(3):
                B(nm + "_cur", (pw / 3 + 0.02, 0.025, H + 0.3), sx * (W / 2 + 0.18 - pw / 2 + (k - 1) * pw / 3), -0.28 - (k % 2) * 0.025, zc - 0.03, cm)
    elif r < 0.85:  # roller blind partly drawn
        drop = H * rng.uniform(0.2, 0.6)
        B(nm + "_blind", (iw, 0.006, drop), 0, -0.15, head - 0.03 - drop / 2, rng.choice(["fabric_bed", "console_beige"]))
        B(nm + "_bbar", (iw, 0.015, 0.02), 0, -0.15, head - 0.03 - drop, "wood_trim")
        B(nm + "_broll", (iw + 0.04, 0.04, 0.04), 0, -0.15, head - 0.01, "wood_trim")


def door_casing(P, wall, spec, transom=0.0):
    a = wall["a"]
    d, nout, _ = wall_frame(wall["a"], wall["b"])
    s, W, z0, head, nm = spec
    top = head + transom
    cw = 0.11
    H = top - z0
    B = lambda n_, sz, ss, tt, zz, m="wood_trim": wbox(P, n_, a, d, nout, s + ss, tt, zz, sz, m)
    for sx in (-1, 1):
        B(nm + "_dcs", (cw, 0.03, H), sx * (W / 2 + cw / 2), 0.015, z0 + H / 2)
        B(nm + "_plinth", (cw + 0.01, 0.04, 0.2), sx * (W / 2 + cw / 2), 0.02, z0 + 0.1)
    B(nm + "_dch", (W + 2 * cw, 0.03, 0.18), 0, 0.015, top + 0.09)
    B(nm + "_ddrip", (W + 2 * cw + 0.06, 0.06, 0.03), 0, 0.03, top + 0.195)
    B(nm + "_dcap", (W + 2 * cw + 0.1, 0.075, 0.025), 0, 0.0375, top + 0.2225)
    B(nm + "_thresh", (W + 0.08, 0.26, 0.035), 0, -0.08, z0 + 0.0, "wood_gray")
    for sx in (-1, 1):
        B(nm + "_djamb", (0.03, 0.2, H), sx * (W / 2 - 0.015), -0.1, z0 + H / 2)
    B(nm + "_dhjamb", (W, 0.2, 0.03), 0, -0.1, top - 0.015)
    if transom > 0:
        B(nm + "_tbar", (W, 0.12, 0.06), 0, -0.06, head + 0.03)
        for k in range(3):
            if k:
                B(nm + "_tmun", (0.025, 0.04, transom - 0.08), -W / 2 + W * k / 3, -0.06, head + 0.06 + (transom - 0.06) / 2)
        g = wbox([], nm + "_tglass", a, d, nout, s, -0.06, head + 0.06 + (transom - 0.09) / 2, (W - 0.04, 0.006, transom - 0.09), "glass_clear")
        return g
    return None


def screen_door(name, hinge, w, h, rot, iid, follow, par, z0):
    """Wooden screen door hung on the outside casing; follows its main door (opens outward)."""
    pv = empty(name, loc=(hinge[0], hinge[1], z0), rot=(0, 0, rot), parent=par, interact="door", iid=iid, hinge="z",
               openAngle=-1.75, follow=follow)
    T = 0.03
    parts = []
    for x in (0.045, w - 0.045):
        parts.append(box(name + "_st", (0.09, T, h), loc=(x, 0, h / 2), m="wood_trim", bevel=0.004))
    for (zc, hh) in ((h - 0.05, 0.1), (0.95, 0.11), (0.1, 0.2)):
        parts.append(box(name + "_rl", (w - 0.18, T, hh), loc=(w / 2, 0, zc), m="wood_trim", bevel=0.004))
    for (x, z, sx) in ((0.09, h - 0.1, 1), (w - 0.09, h - 0.1, -1)):
        g = prism(name + "_gus", [(0, 0), (0.16 * sx, 0), (0, -0.16)] if sx > 0 else [(0, 0), (0, -0.16), (0.16 * sx, 0)], -T / 2, T / 2, m="wood_trim")
        g.rotation_euler = (PI / 2, 0, 0)
        g.location = (x, 0, z)
        parts.append(g)
    parts.append(box(name + "_scr_u", (w - 0.18, 0.004, h - 0.1 - 1.005), loc=(w / 2, 0, (1.005 + h - 0.1) / 2), m="screen_mesh"))
    parts.append(box(name + "_scr_l", (w - 0.18, 0.004, 0.895 - 0.2), loc=(w / 2, 0, (0.2 + 0.895) / 2), m="screen_mesh"))
    parts.append(box(name + "_pull", (0.025, 0.05, 0.14), loc=(w - 0.07, -0.04, 1.0), m="metal_dark"))
    parts.append(kit.tube(name + "_spring", [(0.12, 0.03, 1.5), (w * 0.55, 0.03, 1.75)], 0.008, m="metal_gray", seg=5))
    for z in (0.25, h - 0.3):
        parts.append(box(name + "_hinge", (0.06, 0.012, 0.09), loc=(0.0, -0.01, z), m="metal_dark"))
    leaf = merge(parts, name + "_mesh", par=pv)
    leaf.location = (0, 0, 0)
    finish(leaf, 30)
    arch.col_box("COL_" + name, (w / 2, 0, h / 2), (w, 0.04, h), 0, pv, door=iid)
    return pv


# ------------------------------------------------------------------------------------------------ walls
def siding_cuts(wall):
    cuts = []
    for sp in wall["win"]:
        s, W, sill, head = sp[:4]
        cuts.append((s, W + 0.2, sill - 0.12, head + 0.17))
    for sp in wall["doors"]:
        s, W, z0, head = sp[:4]
        tr = 0.42 if sp[4] == "front" else 0.0
        cuts.append((s, W + 0.2, z0 - 0.3, head + tr + 0.19))
    return cuts


def core_ops(wall):
    ops = [(sp[0], sp[1], sp[2], sp[3]) for sp in wall["win"]]
    for sp in wall["doors"]:
        tr = 0.42 if sp[4] == "front" else 0.0
        ops.append((sp[0], sp[1], sp[2], sp[3] + tr))
    return ops


def ext_wall(P, name, wall, z0, z1, siding=(WT1, None), extra=None, core=True, frieze=None, water=True, s_pad=(0, 0)):
    a, b = wall["a"], wall["b"]
    d, nout, L = wall_frame(a, b)
    if core:
        arch.wall(name + "_core", a, b, z0, z1, 0.2, "plaster_wall", core_ops(wall), offset=0.1, parts=P)
    sz1 = siding[1] if siding[1] is not None else z1
    arch.clapboard_wall(name + "_sd", a, b, siding[0], sz1, siding_cuts(wall), P, extra=extra, s_pad=s_pad)
    if water:
        wbox(P, name + "_wt", a, d, nout, L / 2, 0.016, (WT0 + WT1) / 2, (L + 0.06, 0.032, WT1 - WT0), "wood_trim")
        wbox(P, name + "_wtcap", a, d, nout, L / 2, 0.035, WT1 + 0.01, (L + 0.08, 0.05, 0.025), "wood_trim")
    if frieze:
        wbox(P, name + "_frieze", a, d, nout, L / 2, 0.015, (frieze[0] + frieze[1]) / 2, (L + 0.02, 0.03, frieze[1] - frieze[0]), "wood_trim")


def corner_board(P, x, y, sx, sy, z0, z1):
    """L-shaped outside corner board at plan corner (x, y); (sx, sy) point outward."""
    w, t = 0.12, 0.028
    P.append(box("corner", (w, t, z1 - z0), loc=(x + sx * (2 * t - w) / 2, y + sy * t / 2, (z0 + z1) / 2), m="wood_trim"))
    P.append(box("corner", (t, w - t, z1 - z0), loc=(x + sx * t / 2, y - sy * (w - t) / 2, (z0 + z1) / 2), m="wood_trim"))


def roof_plane(Pr, Pd, name, O, U, Vd, Nn, Lu, Lv, mat, grid0=0.0, intervals=None, deck_t=0.06, deck_m="wood_trim"):
    """Shingled roof plane: deck slab (its underside/edges read as soffit and rake trim) + lapped shingle courses
    with course-aligned UVs (texture tile 1.0 m x 8 courses of 0.14 m)."""
    O, U, Vd, Nn = V(O), V(U).normalized(), V(Vd).normalized(), V(Nn).normalized()
    Pd.append(obox(name + "_deck", O, U, Vd, Nn, 0, Lu, 0, Lv, -deck_t, 0.0, deck_m))
    iv = intervals or (lambda v: [(0.0, Lu)])
    Pr.append(arch.lap_surface(name + "_sh", O, U, Vd, Nn, 0.0, Lv, iv, 0.14, 0.011, mat, top=0.002, grid0=grid0, uv=(1.0, 1.12)))


def ridge_cap(Pr, name, p0, p1, n_left, n_right, mat):
    """Cap shingles over a ridge from p0 to p1 (top-of-deck ridge line); n_* = plane normals."""
    p0, p1 = V(p0), V(p1)
    Ud = (p1 - p0)
    L = Ud.length
    Ud.normalize()
    for nn in (V(n_left), V(n_right)):
        down = Ud.cross(nn).normalized()
        # make 'down' point away from the ridge (down the plane)
        if down.z > 0:
            down = -down
        O = p0 + nn * 0.011
        Pr.append(arch.lap_surface(name, O, down, Ud, nn, 0.0, L, lambda v: [(-0.01, 0.17)], 0.15, 0.012, mat, top=0.003, uv=(1.0, 1.12)))


def gable_rakes(P, wall, z_eave, z_apex, inset=0.0, w=0.16, out=0.015):
    """Rake trim boards on the wall face along both rakes of a gable (wall from a to b, apex in the middle)."""
    a = wall["a"]
    d, nout, L = wall_frame(wall["a"], wall["b"])
    A = V(wp(a, d, nout, 0.0, out, z_eave))
    Bp = V(wp(a, d, nout, L, out, z_eave))
    C = V(wp(a, d, nout, L / 2, out, z_apex))
    for (p, q) in ((A, C), (Bp, C)):
        U = (q - p)
        Ln = U.length
        U.normalize()
        Nn = V((nout.x, nout.y, 0))
        S = Nn.cross(U).normalized()      # in-plane perpendicular
        if S.z > 0:
            S = -S                         # point down/in from the roof line
        P.append(obox("rake_trim", p, U, S, Nn, -0.05, Ln + 0.02, 0.0, w, -out, out, "wood_trim"))


def louver(P, wall, s, zc, w, h, name):
    a = wall["a"]
    d, nout, _ = wall_frame(wall["a"], wall["b"])
    B = lambda n_, sz, ss, tt, zz, m="wood_trim", rx=0.0: wbox(P, n_, a, d, nout, s + ss, tt, zz, sz, m, rot_extra=(rx, 0, 0))
    for sx in (-1, 1):
        B(name + "_lf", (0.09, 0.035, h + 0.18), sx * (w / 2 + 0.045), 0.0175, zc)
    B(name + "_lh", (w + 0.18, 0.035, 0.09), 0, 0.0175, zc + h / 2 + 0.045)
    B(name + "_lb", (w + 0.24, 0.07, 0.04), 0, 0.03, zc - h / 2 - 0.02)
    B(name + "_ldark", (w, 0.02, h), 0, -0.06, zc, "frame_black")
    n = int(h / 0.09)
    for k in range(n):
        B(name + "_slat", (w, 0.012, 0.11), 0, -0.01, zc - h / 2 + (k + 0.5) * h / n, "wood_trim", rx=0.7)


# ------------------------------------------------------------------------------------------------ the shell
def build_shell(root, interior=True):
    P, G, L, Pr, lights = [], [], [], [], []
    rng = random.Random(42)
    # ---------------------------------------------------------------- foundations
    P.append(box("found_main", (MX1 - MX0, MY1 - MY0, 0.75), loc=(0, 0, WT0 - 0.375), m="concrete_dark"))
    P.append(box("found_wing", (WX1 - WX0, WY1 - WY0, 0.75), loc=((WX0 + WX1) / 2, (WY0 + WY1) / 2, WT0 - 0.375), m="concrete_dark"))
    for (x, y, rz) in ((MX1, 1.5, PI / 2), (MX1, -2.5, PI / 2), (1.0, MY1, 0), (WX0 + 2.5, WY1, 0)):
        P.append(box("bsmt_win", (0.6, 0.06, 0.25), loc=(x + (0.02 if rz else 0), y + (0.0 if rz else 0.02), 0.2), rot=(0, 0, rz), m="frame_black"))
        P.append(box("bsmt_frame", (0.7, 0.05, 0.33), loc=(x + (0.025 if rz else 0), y + (0.0 if rz else 0.025), 0.2), rot=(0, 0, rz), m="wood_gray"))

    # ---------------------------------------------------------------- main block walls
    ext_wall(P, "m_s", MAIN_S, WT0, EAVE, siding=(WT1, M_FRIEZE), frieze=(M_FRIEZE, M_SOFFIT))
    ext_wall(P, "m_n", MAIN_N, WT0, EAVE, siding=(WT1, M_FRIEZE), frieze=(M_FRIEZE, M_SOFFIT))
    ext_wall(P, "m_e", MAIN_E, WT0, EAVE, siding=(WT1, M_FRIEZE), frieze=(M_FRIEZE, M_SOFFIT))

    def west_extra(z, sp):
        # no siding where the wing sits against the main block (below the wing's roof line)
        y_lo, y_hi = WY0, WY1
        rt = W_EAVE + HT + 0.02
        if z < rt:
            cut = (y_lo, y_hi)
        elif z < W_RIDGE + HT + 0.02:
            dz = (z - rt) / TW
            cut = (y_lo + dz, y_hi - dz)
        else:
            return sp
        # along = 4.5 - y
        return arch.span_cut(sp, 4.5 - cut[1], 4.5 - cut[0])
    ext_wall(P, "m_w", MAIN_W, WT0, EAVE, siding=(WT1, M_FRIEZE), extra=west_extra, frieze=None, water=False)
    d, nout, Lw = wall_frame(MAIN_W["a"], MAIN_W["b"])
    # frieze & water table only on the exposed stretches of the west wall
    for (s0, s1) in ((0.0, 4.5 - WY1), (4.5 - WY0, 9.0)):
        wbox(P, "m_w_wt", MAIN_W["a"], d, nout, (s0 + s1) / 2, 0.016, (WT0 + WT1) / 2, (s1 - s0, 0.032, WT1 - WT0), "wood_trim")
    wbox(P, "m_w_frieze", MAIN_W["a"], d, nout, Lw / 2, 0.015, (M_FRIEZE + M_SOFFIT) / 2, (Lw + 0.02, 0.03, M_SOFFIT - M_FRIEZE), "wood_trim")
    # step flashing along the wing roof line on the main west wall
    for (y0, z0_, y1, z1_) in ((WY0, W_EAVE + HT, WRY, W_RIDGE + HT), (WRY, W_RIDGE + HT, WY1, W_EAVE + HT)):
        P.append(seg_box("flashing", (MX0 - 0.03, y0, z0_ + 0.06), (MX0 - 0.03, y1, z1_ + 0.06), 0.03, 0.14, "metal_gray", up=(1, 0, 0)))

    # gables (south / north): band at the eave line, triangular siding field, rakes, louvred vents
    for wall, nm in ((MAIN_S, "gs"), (MAIN_N, "gn")):
        a, b = wall["a"], wall["b"]
        dd, no, LL = wall_frame(a, b)
        arch.gable_wall(nm + "_core", MX0, MX1, a[1] + (0.1 if nm == "gs" else -0.1), EAVE, RIDGE, 0.2, "plaster_wall", P)
        cuts = [(LL / 2, 0.85, EAVE + 1.0, EAVE + 2.1)]
        rk_e, rk_r = EAVE + HT - 0.06, RIDGE + HT - 0.06
        arch.clapboard_wall(nm + "_sd", a, b, M_SOFFIT, rk_r, cuts, P, gable=(rk_e - 0.25, rk_r - 0.25, 0.0))
        gable_rakes(P, wall, rk_e, rk_r, w=0.26)
        louver(P, wall, LL / 2, EAVE + 1.55, 0.55, 0.75, nm + "_vent")
        # eave returns at both bottom corners of the gable
        for sx in (0, 1):
            s0 = -OV if sx == 0 else LL + OV
            s1 = 0.5 if sx == 0 else LL - 0.5
            sm = (s0 + s1) / 2
            wbox(P, nm + "_ret", a, dd, no, sm, 0.18, M_SOFFIT + 0.1, (abs(s1 - s0), 0.36, 0.2), "wood_trim")
            Ob = V(wp(a, dd, no, min(s0, s1), 0.38, M_SOFFIT + 0.2))
            P.append(obox(nm + "_rettop", Ob, V((dd.x, dd.y, 0)), V((-no.x * 0.38, -no.y * 0.38, 0.22)), V((0, 0, 1)), 0, abs(s1 - s0), 0, 1, 0, 0.03, "shingle_dark"))

    # windows / doors
    for wall in (MAIN_S, MAIN_E, MAIN_N, MAIN_W):
        for sp in wall["win"]:
            vwin(P, G, wall, sp, interior=interior)
    g = door_casing(P, MAIN_S, MAIN_S["doors"][0][:4] + ("front",), transom=0.42)
    G.append(g)
    door_casing(P, MAIN_N, MAIN_N["doors"][0][:4] + ("back",))
    # corner boards (main block)
    for (x, y, sx, sy, z1) in ((MX0, MY0, -1, -1, M_FRIEZE), (MX1, MY0, 1, -1, M_FRIEZE), (MX1, MY1, 1, 1, M_FRIEZE), (MX0, MY1, -1, 1, M_FRIEZE)):
        corner_board(P, x, y, sx, sy, WT0, z1)

    # ---------------------------------------------------------------- wing walls
    ext_wall(P, "w_s", WING_S, WT0, W_EAVE, siding=(WT1, W_EAVE - 0.14), frieze=(W_EAVE - 0.14, W_EAVE + 0.06))
    ext_wall(P, "w_n", WING_N, WT0, W_EAVE, siding=(WT1, W_SOFFIT - 0.2), frieze=(W_SOFFIT - 0.2, W_SOFFIT), s_pad=(0.0, 0.0))
    ext_wall(P, "w_w", WING_W, WT0, W_EAVE, siding=(WT1, W_SOFFIT - 0.2), frieze=(W_SOFFIT - 0.2, W_SOFFIT))
    P.append(kit.prism_yz("wg_core", kit.ccw([(WY0, W_EAVE), (WY1, W_EAVE), (WRY, W_RIDGE)]), WX0, WX0 + 0.2, m="plaster_wall"))
    LLw = WY1 - WY0
    wk_e, wk_r = W_EAVE + HT - 0.06, W_RIDGE + HT - 0.06
    arch.clapboard_wall("wg_sd", WING_W["a"], WING_W["b"], W_SOFFIT, wk_r, [(LLw / 2, 0.6, W_EAVE + 0.45, W_EAVE + 1.35)], P, gable=(wk_e - 0.22, wk_r - 0.22, 0.0))
    gable_rakes(P, WING_W, wk_e, wk_r, w=0.2)
    louver(P, WING_W, LLw / 2, W_EAVE + 0.9, 0.42, 0.6, "wg_vent")
    # wing eave returns (north-west corner only; the south side runs into the porch roof)
    dd, no, _ = wall_frame(WING_W["a"], WING_W["b"])
    wbox(P, "wg_ret", WING_W["a"], dd, no, 0.12, 0.18, W_SOFFIT + 0.1, (0.8, 0.36, 0.2), "wood_trim")
    for wall in (WING_S, WING_W, WING_N):
        for sp in wall["win"]:
            vwin(P, G, wall, sp, interior=interior)
    door_casing(P, WING_S, WING_S["doors"][0][:4] + ("wing",))
    door_casing(P, WING_S, WING_S["doors"][1][:4] + ("wing2",))
    door_casing(P, WING_N, WING_N["doors"][0][:4] + ("mud",))
    for (x, y, sx, sy, z1) in ((WX0, WY0, -1, -1, W_EAVE - 0.14), (WX0, WY1, -1, 1, W_SOFFIT - 0.2)):
        corner_board(P, x, y, sx, sy, WT0, z1)
    # inside corners where the wing meets the main block
    P.append(box("in_corner", (0.06, 0.06, W_SOFFIT - WT0), loc=(MX0 - 0.03, WY1 + 0.03, (W_SOFFIT + WT0) / 2), m="wood_trim"))
    P.append(box("in_corner", (0.06, 0.06, 3.5 - WT0), loc=(MX0 - 0.03, WY0 - 0.03, (3.5 + WT0) / 2), m="wood_trim"))

    # ---------------------------------------------------------------- roofs
    Pd = P
    cM, sM = math.cos(PM), math.sin(PM)
    Lv_m = (3.75 + OV) / cM
    Lu_m = (MY1 - MY0) + 2 * OG
    # west slope (eave edge at x = MX0 - OV)
    roof_plane(Pr, Pd, "mr_w", (MX0 - OV, MY0 - OG, M_EDGE), (0, 1, 0), (cM, 0, sM), (-sM, 0, cM), Lu_m, Lv_m, "shingle_dark")
    roof_plane(Pr, Pd, "mr_e", (MX1 + OV, MY1 + OG, M_EDGE), (0, -1, 0), (-cM, 0, sM), (sM, 0, cM), Lu_m, Lv_m, "shingle_dark")
    ztop = EAVE + HT + 3.75 * TM
    ridge_cap(Pr, "mr_cap", (0, MY0 - OG, ztop), (0, MY1 + OG, ztop), (-sM, 0, cM), (sM, 0, cM), "shingle_dark")
    # fascia, soffit, gutters along the main eaves
    for side in (-1, 1):
        xe = side * (3.75 + OV)
        P.append(box("m_fascia", (0.03, Lu_m, 0.2), loc=(xe + side * 0.015, 0, M_EDGE - 0.1 - 0.03), m="wood_trim"))
        P.append(box("m_soffit", (OV, Lu_m - 0.02, 0.02), loc=(side * (3.75 + OV / 2), 0, M_SOFFIT), m="wood_trim"))
        gut = kit.prism_xz("m_gutter", kit.ccw([(0, 0), (0, -0.11), (0.1, -0.11), (0.125, -0.085), (0.13, 0.0), (0.122, 0.0), (0.117, -0.08), (0.096, -0.1), (0.006, -0.1), (0.006, 0.0)]),
                           MY0 - OG, MY1 + OG, m="steel_galv")
        if side < 0:
            for v in gut.data.vertices:
                v.co.x = -v.co.x
            kit._fix_normals(gut)
        gut.location = (xe + side * 0.03, 0, M_EDGE - 0.05)
        P.append(gut)
        for yy in (MY0 - OG + 0.02, MY1 + OG - 0.02):
            P.append(box("gut_end", (0.13, 0.006, 0.11), loc=(xe + side * 0.095, yy, M_EDGE - 0.105), m="steel_galv"))
        for k in range(8):
            P.append(box("gut_hanger", (0.13, 0.02, 0.006), loc=(xe + side * 0.095, MY0 - OG + 0.4 + k * 1.3, M_EDGE - 0.052), m="steel_galv"))
    # rake fascia on the gable overhangs
    zr0 = M_EDGE - 0.03
    for yy in (MY0 - OG - 0.015, MY1 + OG + 0.015):
        for side in (-1, 1):
            P.append(seg_box("m_rake", (side * (3.75 + OV + 0.03), yy, zr0 - 0.08), (0, yy, ztop - 0.08), 0.03, 0.2, "wood_trim", up=(0, 0, 1)))
    # downspouts: SW lands on the porch roof, others to grade with kick-outs and splash blocks
    def downspout(x, y, gx, gy, zo, zb, kx, ky, splash=True):
        zbend = zo - 0.4
        P.append(seg_box("ds_off", (gx, gy, zo + 0.02), (x, y, zbend), 0.07, 0.07, "steel_galv"))
        P.append(box("ds", (0.07, 0.07, zbend - (zb + 0.3)), loc=(x, y, (zbend + zb + 0.3) / 2), m="steel_galv"))
        P.append(seg_box("ds_kick", (x, y, zb + 0.34), (x + kx * 0.35, y + ky * 0.35, zb + 0.06), 0.07, 0.07, "steel_galv"))
        for zz in (zb + 0.9, (zbend + zb) / 2, zbend - 0.3):
            P.append(box("ds_strap", (0.09, 0.09, 0.02), loc=(x, y, zz), m="steel_galv"))
        if splash:
            P.append(box("splash", (0.3, 0.6, 0.06), loc=(x + kx * 0.6, y + ky * 0.6, 0.03), rot=(0, 0, math.atan2(ky, kx) + PI / 2), m="concrete"))
    zo = M_EDGE - 0.16
    downspout(MX0 - 0.07, MY1 - 0.15, MX0 - OV - 0.095, MY1 - 0.15, zo, 0.0, 0, 1)
    downspout(MX1 + 0.07, MY1 - 0.15, MX1 + OV + 0.095, MY1 - 0.15, zo, 0.0, 0, 1)
    downspout(MX1 + 0.07, MY0 + 0.25, MX1 + OV + 0.095, MY0 + 0.25, zo, 0.0, 1, 0)
    downspout(MX0 - 0.07, MY0 + 0.25, MX0 - OV - 0.095, MY0 + 0.25, zo, porch_top(MY0 + 0.25), -1, 0, splash=False)
    # roof box vents near the ridge (west slope) and a plumbing stack (east slope)
    for yy in (-2.6, 0.4, 3.0):
        vv = Lv_m - 0.75
        p = V((MX0 - OV, yy, M_EDGE)) + V((cM, 0, sM)) * vv
        vb = box("roof_vent", (0.42, 0.42, 0.16), loc=p + V((-sM, 0, cM)) * 0.09, rot=(0, -PM, 0), m="metal_dark", bevel=0.01)
        P.append(vb)
        P.append(box("roof_vent_flash", (0.62, 0.62, 0.012), loc=p + V((-sM, 0, cM)) * 0.012, rot=(0, -PM, 0), m="metal_gray"))
    p = V((MX1 + OV, 1.6, M_EDGE)) + V((-cM, 0, sM)) * (Lv_m - 1.4)
    P.append(cyl("vent_stack", 0.05, 0.6, loc=p + V((0, 0, 0.2)), m="plastic_dark", verts=12))

    # wing roof: north slope, south slope (continues into the porch roof)
    cW, sW = math.cos(PW), math.sin(PW)
    Lu_w = (WX1 - WX0) + OG
    roof_plane(Pr, Pd, "wr_n", (WX1, WY1 + OV, W_EDGE), (-1, 0, 0), (0, -cW, sW), (0, sW, cW), Lu_w, (WY1 - WRY + OV) / cW, "shingle_dusty")
    roof_plane(Pr, Pd, "wr_s", (WX0 - OG, WY0, W_EAVE + HT), (1, 0, 0), (0, cW, sW), (0, -sW, cW), Lu_w, (WRY - WY0) / cW, "shingle_dusty")
    wztop = W_EAVE + HT + (WRY - WY0) * TW
    ridge_cap(Pr, "wr_cap", (WX0 - OG, WRY, wztop), (WX1, WRY, wztop), (0, -sW, cW), (0, sW, cW), "shingle_dusty")
    P.append(box("w_fascia", (Lu_w, 0.03, 0.2), loc=((WX0 - OG + WX1) / 2, WY1 + OV + 0.015, W_EDGE - 0.13), m="wood_trim"))
    P.append(box("w_soffit", (Lu_w - 0.02, OV, 0.02), loc=((WX0 - OG + WX1) / 2, WY1 + OV / 2, W_SOFFIT), m="wood_trim"))
    gut = kit.prism_yz("w_gutter", kit.ccw([(0, 0), (0, -0.11), (0.1, -0.11), (0.125, -0.085), (0.13, 0.0), (0.122, 0.0), (0.117, -0.08), (0.096, -0.1), (0.006, -0.1), (0.006, 0.0)]),
                       WX0 - OG, WX1, m="steel_galv")
    gut.location = (0, WY1 + OV + 0.03, W_EDGE - 0.05)
    P.append(gut)
    downspout(WX0 + 0.18, WY1 + 0.07, WX0 + 0.18, WY1 + OV + 0.095, W_EDGE - 0.16, 0.0, 0, 1)
    # rake fascia on the wing's west gable (south rake runs down into the porch roof line)
    xr = WX0 - OG - 0.015
    P.append(seg_box("w_rake", (xr, WY1 + OV + 0.03, W_EDGE - 0.11), (xr, WRY, wztop - 0.08), 0.03, 0.2, "wood_trim"))
    P.append(seg_box("w_rake", (xr, WY0, W_EAVE + HT - 0.08), (xr, WRY, wztop - 0.08), 0.03, 0.2, "wood_trim"))
    # stovepipe chimney behind the ridge, with storm collar and cap
    cx, cy = -8.8, WRY + 0.55
    zr = wztop - 0.55 * TW
    P.append(cyl("stovepipe", 0.1, 1.25, loc=(cx, cy, zr + 0.5), m="metal_dark", verts=16))
    P.append(cyl("stove_collar", 0.16, 0.06, r2=0.11, loc=(cx, cy, zr + 0.05), m="metal_gray", verts=16))
    P.append(box("stove_flash", (0.55, 0.55, 0.01), loc=(cx, cy, zr - 0.01), rot=(PW, 0, 0), m="metal_gray"))
    P.append(cyl("stove_cap", 0.2, 0.14, r2=0.03, loc=(cx, cy, zr + 1.3), m="metal_dark", verts=16))
    for k in range(3):
        a_ = k * 2 * PI / 3
        P.append(box("stove_cap_leg", (0.012, 0.012, 0.12), loc=(cx + 0.09 * math.cos(a_), cy + 0.09 * math.sin(a_), zr + 1.18), m="metal_dark"))
    weathervane(P, -10.55, WRY, wztop + 0.02)
    satellite_dish(P, MX0, -1.9, M_FRIEZE - 0.35)
    service_entrance(P)

    # ---------------------------------------------------------------- porch
    build_porch(P, Pr, L, lights, root, rng)
    return P, G, L, Pr, lights


def bpy_remove(o):
    import bpy
    bpy.data.objects.remove(o, do_unlink=True)


def weathervane(P, x, y, z):
    """Tall ridge weathervane (images 1–2): bracket, mast, glass ball, cardinal arms with letters, arrow + rooster."""
    m = "metal_dark"
    P.append(box("vane_base", (0.3, 0.12, 0.05), loc=(x, y, z + 0.02), m=m))
    for sy in (-1, 1):
        P.append(seg_box("vane_brace", (x, y + sy * 0.25, z - 0.12), (x, y, z + 0.45), 0.02, 0.02, m, up=(1, 0, 0)))
    P.append(cyl("vane_mast", 0.016, 2.0, loc=(x, y, z + 1.0), m=m, verts=10))
    P.append(kit.sphere("vane_ball", 0.06, loc=(x, y, z + 1.05), m="glass_dark", segs=16, rings=10))
    za = z + 1.35
    for ang in (0.0, PI / 2):
        P.append(box("vane_arm", (0.9, 0.018, 0.018), loc=(x, y, za), rot=(0, 0, ang), m=m))
    # letters N E S W (simple block letter outlines, extruded)
    letters = {
        "N": [(-0.06, -0.08), (-0.035, -0.08), (-0.035, 0.03), (0.035, -0.08), (0.06, -0.08), (0.06, 0.08), (0.035, 0.08), (0.035, -0.03), (-0.035, 0.08), (-0.06, 0.08)],
        "E": [(-0.05, -0.08), (0.05, -0.08), (0.05, -0.055), (-0.025, -0.055), (-0.025, -0.012), (0.035, -0.012), (0.035, 0.012), (-0.025, 0.012), (-0.025, 0.055), (0.05, 0.055), (0.05, 0.08), (-0.05, 0.08)],
        "S": [(-0.05, -0.08), (0.05, -0.08), (0.05, 0.012), (-0.025, 0.012), (-0.025, 0.055), (0.05, 0.055), (0.05, 0.08), (-0.05, 0.08), (-0.05, -0.012), (0.025, -0.012), (0.025, -0.055), (-0.05, -0.055)],
        "W": [(-0.07, 0.08), (-0.045, -0.08), (-0.02, -0.08), (0.0, 0.0), (0.02, -0.08), (0.045, -0.08), (0.07, 0.08), (0.045, 0.08), (0.032, -0.03), (0.012, 0.05), (-0.012, 0.05), (-0.032, -0.03), (-0.045, 0.08)],
    }
    for (lt, dx, dy) in (("N", 0, 1), ("S", 0, -1), ("E", 1, 0), ("W", -1, 0)):
        o = prism("vane_" + lt, kit.ccw(letters[lt]), -0.006, 0.006, m=m)
        face = math.atan2(dy, dx)
        o.rotation_euler = (PI / 2, 0, face + PI / 2)
        o.location = (x + dx * 0.47, y + dy * 0.47, za + 0.1)
        P.append(o)
    ya = 0.75   # current wind heading of the arrow
    arrow = prism("vane_arrow", kit.ccw([(-0.55, -0.012), (0.38, -0.012), (0.38, -0.06), (0.6, 0.0), (0.38, 0.06), (0.38, 0.012), (-0.55, 0.012), (-0.68, 0.16), (-0.42, 0.16), (-0.42, -0.16), (-0.68, -0.16)]), -0.005, 0.005, m=m)
    arrow.rotation_euler = (PI / 2, 0, ya)
    arrow.location = (x, y, za + 0.45)
    P.append(arrow)
    rooster = [(-0.32, 0.0), (0.18, 0.0), (0.22, 0.08), (0.30, 0.16), (0.34, 0.30), (0.30, 0.36), (0.36, 0.40), (0.28, 0.42), (0.24, 0.50),
               (0.16, 0.46), (0.16, 0.36), (0.08, 0.26), (-0.06, 0.24), (-0.16, 0.30), (-0.22, 0.46), (-0.34, 0.56), (-0.30, 0.40),
               (-0.40, 0.42), (-0.34, 0.28), (-0.42, 0.24), (-0.32, 0.14)]
    ro = prism("vane_rooster", kit.ccw(rooster), -0.006, 0.006, m=m)
    ro.rotation_euler = (PI / 2, 0, ya)
    ro.location = (x, y, za + 0.47)
    P.append(ro)


def satellite_dish(P, x, y, z):
    """Offset-fed TV dish on a wall bracket under the west eave, aimed south-west and up."""
    m = "steel_painted_white"
    P.append(box("dish_plate", (0.02, 0.22, 0.3), loc=(x - 0.01, y, z), m="metal_gray"))
    P.append(cyl("dish_arm", 0.025, 0.42, loc=(x - 0.22, y, z), rot=(0, PI / 2, 0), m="metal_gray", verts=10))
    P.append(cyl("dish_mast", 0.024, 0.55, loc=(x - 0.43, y, z + 0.15), m="metal_gray", verts=10))
    aim = V((-0.62, -0.55, 0.56)).normalized()
    q = aim.to_track_quat("Z", "Y")
    dish = kit.lathe("dish", [(0.0, 0.0), (0.12, 0.007), (0.24, 0.028), (0.33, 0.05), (0.335, 0.06), (0.32, 0.058), (0.0, 0.012)], m=m, seg=28)
    dish.scale = (1.0, 0.86, 1.0)
    dish.rotation_mode = "QUATERNION"
    dish.rotation_quaternion = q
    c = V((x - 0.48, y - 0.05, z + 0.42))
    dish.location = c
    P.append(dish)
    lnb = c + aim * 0.45 + V((0, 0, -0.18))
    P.append(kit.tube("dish_feedarm", [c + V((0, 0, -0.25)), lnb], 0.012, m="metal_gray", seg=6))
    P.append(box("dish_lnb", (0.07, 0.07, 0.11), loc=lnb, rot=q.to_euler(), m="plastic_dark"))
    P.append(kit.tube("dish_cable", [(x - 0.43, y, z - 0.12), (x - 0.06, y + 0.05, z - 0.2), (x - 0.03, y + 0.1, 1.2), (x - 0.03, y + 0.4, 0.9)], 0.006, m="rubber_black", seg=5))


def service_entrance(P):
    """Overhead service: weatherhead mast on the east wall, meter base below, drop from the pole."""
    x, y = MX1 + 0.05, 2.0
    P.append(cyl("svc_mast", 0.035, 2.4, loc=(x + 0.04, y, 5.6 + 1.2 - 0.6), m="steel_galv", verts=10))
    P.append(cyl("svc_head", 0.06, 0.1, loc=(x + 0.04, y, 7.45), m="plastic_dark", verts=10))
    P.append(cyl("svc_conduit", 0.025, 2.9, loc=(x + 0.04, y, 3.3), m="steel_galv", verts=8))
    P.append(box("meter_base", (0.1, 0.32, 0.45), loc=(x + 0.05, y, 1.6), m="steel_galv", bevel=0.01))
    P.append(kit.sphere("meter_glass", 0.09, loc=(x + 0.13, y, 1.62), m="glass_clear", segs=16, rings=8, scale=(0.8, 1, 1)))
    P.append(cyl("meter_ground", 0.01, 1.4, loc=(x + 0.05, y - 0.12, 0.7), m="metal_bronze", verts=6))


# ------------------------------------------------------------------------------------------------ porch
def porch_top(y):
    return W_EAVE + HT - (WY0 - y) * TP


def build_porch(P, Pr, L, lights, root, rng):
    # under-deck darkness (seen through the skirt and board gaps)
    P.append(box("porch_void", (WX1 - PX0, PDY * -1 + WY0 - 0.02, 0.5), loc=((PX0 + WX1) / 2, (PDY + WY0) / 2, 0.24), m="frame_black"))
    P.append(box("porch_void", (PX1 - MX0, MY0 - PDY - 0.02, 0.5), loc=((MX0 + PX1) / 2, (PDY + MY0) / 2, 0.24), m="frame_black"))
    # deck boards running front-to-back, slightly irregular
    x = PX0 + 0.05
    while x < PX1 - 0.04:
        yb = WY0 if x < MX0 else MY0
        y0 = PDY
        Lb = yb - y0
        w = 0.088
        m = "wood_gray" if rng.random() < 0.94 else "wood_raw"
        P.append(box("deck_board", (w, Lb - 0.01, 0.026), loc=(x + w / 2, (y0 + yb) / 2, F0 - 0.013 + rng.uniform(-0.003, 0.002)), rot=(rng.uniform(-0.004, 0.004), 0, rng.uniform(-0.002, 0.002)), m=m))
        x += 0.095
    # rim boards
    P.append(box("rim_front", (PX1 - PX0 + 0.06, 0.035, 0.25), loc=((PX0 + PX1) / 2, PDY - 0.0175, F0 - 0.15), m="wood_trim"))
    P.append(box("rim_w", (0.035, WY0 - PDY, 0.25), loc=(PX0 - 0.0175, (PDY + WY0) / 2, F0 - 0.15), m="wood_trim"))
    P.append(box("rim_e", (0.035, MY0 - PDY, 0.25), loc=(PX1 + 0.0175, (PDY + MY0) / 2, F0 - 0.15), m="wood_trim"))
    # skirt: vertical boards with gaps
    def skirt(p0, p1):
        p0, p1 = V(p0), V(p1)
        dv = p1 - p0
        Ls = dv.length
        dv.normalize()
        n = int(Ls / 0.15)
        ang = math.atan2(dv.y, dv.x)
        for k in range(n):
            c = p0 + dv * (0.075 + k * Ls / n)
            hh = 0.36 + rng.uniform(-0.04, 0.0)
            if rng.random() < 0.08:
                continue
            P.append(box("skirt", (0.1, 0.02, hh), loc=(c.x, c.y, 0.30 - hh / 2 + 0.02), rot=(0, rng.uniform(-0.03, 0.03), ang), m="wood_dark"))
    skirt((PX0, PDY - 0.03), (PX1, PDY - 0.03))
    skirt((PX0 - 0.03, WY0), (PX0 - 0.03, PDY))
    skirt((PX1 + 0.03, PDY), (PX1 + 0.03, MY0))
    # posts (plinth, shaft, cap) and the front beam
    posts = [(px, PPY) for px in POSTS_X] + [(5.55, MY0 - 0.12)]
    for (px, py) in posts:
        top = PBZ if py == PPY else porch_top(py) - PRT - 0.22
        P.append(box("post", (0.11, 0.11, top - F0), loc=(px, py, (top + F0) / 2), m="wood_trim", bevel=0.008))
        P.append(box("post_base", (0.15, 0.15, 0.1), loc=(px, py, F0 + 0.05), m="wood_trim", bevel=0.006))
        P.append(box("post_cap", (0.16, 0.16, 0.05), loc=(px, py, top - 0.025), m="wood_trim", bevel=0.006))
    P.append(box("beam", (PX1 - PX0 + 0.1, 0.13, PBT - PBZ), loc=((PX0 + PX1) / 2, PPY, (PBZ + PBT) / 2), m="wood_trim"))
    zb = porch_top(MY0 - 0.12) - PRT
    P.append(box("beam_e", (PX1 - MX1 + 0.05, 0.12, 0.22), loc=((MX1 + PX1) / 2, MY0 - 0.12, zb - 0.11), m="wood_trim"))
    # ledgers along the walls under the porch roof
    P.append(box("ledger_w", (WX1 - PX0, 0.05, 0.2), loc=((PX0 + WX1) / 2, WY0 - 0.025, porch_top(WY0) - PRT - 0.1), m="wood_trim"))
    P.append(box("ledger_m", (MX1 - MX0, 0.05, 0.2), loc=(0, MY0 - 0.025, porch_top(MY0) - PRT - 0.1), m="wood_trim"))
    # porch roof: one plane continuing the wing's south slope, shingled (dusty), rafters exposed below
    cp = 1.0 / math.sqrt(1 + TP * TP)
    sp = TP * cp
    O = V((PX0 - OG, PY_OUT, porch_top(PY_OUT)))
    U = V((1, 0, 0))
    Vd = V((0, cp, sp))
    Nn = V((0, -sp, cp))
    Lv = (WY0 - PY_OUT) / cp
    v_main = (MY0 - PY_OUT) / cp
    Lu = (PX1 + OG) - (PX0 - OG)

    def iv(v):
        if v < v_main:
            return [(0.0, Lu)]
        return [(0.0, MX0 - (PX0 - OG))]
    grid0 = v_main - round(v_main / 0.14) * 0.14
    Pr.append(arch.lap_surface("porch_sh", O, U, Vd, Nn, 0.0, Lv, iv, 0.14, 0.011, "shingle_dusty", top=0.002, grid0=grid0, uv=(1.0, 1.12)))
    P.append(obox("porch_deck_w", O, U, Vd, Nn, 0, MX0 - (PX0 - OG), 0, Lv, -0.05, 0, "wood_gray"))
    P.append(obox("porch_deck_e", O, U, Vd, Nn, MX0 - (PX0 - OG), Lu, 0, v_main, -0.05, 0, "wood_gray"))
    # rafters (2x6 @ 0.6 m) from the wall ledgers to the beam and beyond to the fascia
    xr = PX0 + 0.1
    while xr < PX1:
        yw = WY0 if xr < MX0 else MY0
        if xr > MX1:
            yw = MY0 - 0.12
        p0 = V((xr, yw, porch_top(yw) - 0.05 - 0.07))
        p1 = V((xr, PY_OUT + 0.04, porch_top(PY_OUT + 0.04) - 0.05 - 0.07))
        P.append(seg_box("rafter", p0, p1, 0.045, 0.14, "wood_gray"))
        xr += 0.6
    P.append(box("porch_fascia", (Lu + 0.03, 0.03, 0.18), loc=((PX0 + PX1) / 2, PY_OUT - 0.015, porch_top(PY_OUT) - 0.09), m="wood_trim"))
    for (xe, y1) in ((PX0 - OG - 0.015, WY0), (PX1 + OG + 0.015, MY0)):
        P.append(seg_box("porch_rake", (xe, PY_OUT, porch_top(PY_OUT) - 0.09), (xe, y1, porch_top(y1) - 0.09), 0.03, 0.18, "wood_trim"))
    # steps (main door and wing door), three risers to grade
    for (cx, w) in ((-1.26, 1.5), (-7.1, 1.3)):
        rz = F0 / 3
        for k in range(2):
            zt = F0 - (k + 1) * rz
            P.append(box("step_tread", (w, 0.3, 0.035), loc=(cx, PDY - 0.15 - k * 0.27, zt - 0.0175), m="wood_gray", bevel=0.004))
        for k in range(3):
            zt = F0 - (k + 1) * rz
            P.append(box("step_riser", (w, 0.02, rz - 0.035), loc=(cx, PDY - 0.01 - k * 0.27, zt + (rz - 0.035) / 2), m="wood_gray"))
        for sx in (-1, 1):
            P.append(seg_box("step_stringer", (cx + sx * (w / 2 - 0.02), PDY - 0.02, F0 - 0.16), (cx + sx * (w / 2 - 0.02), PDY - 0.72, -0.02), 0.04, 0.2, "wood_gray"))
    # porch lights: wall lantern by the front door, bare bulb on the wing side
    lx = MX0 + 2.05 + 0.85
    P.append(box("lantern_back", (0.12, 0.03, 0.2), loc=(lx, MY0 - 0.04, 2.2), m="metal_dark"))
    P.append(cyl("lantern_cage", 0.07, 0.2, loc=(lx, MY0 - 0.14, 2.18), m="metal_dark", verts=8))
    L.append(kit.sphere("lampE|porch|lantern", 0.055, loc=(lx, MY0 - 0.14, 2.16), m="emit_warm", segs=12, rings=8, scale=(1, 1, 1.3)))
    lights.append(empty("light_porch_0", loc=(lx, MY0 - 0.6, 2.1), parent=root, light="warm", group="porch", intensity=2.6, distance=8))
    bx_, by_ = -7.6, -5.1
    P.append(cyl("bulb_socket", 0.04, 0.08, loc=(bx_, by_, porch_top(by_) - PRT - 0.04), m="ceramic_white", verts=12))
    L.append(kit.sphere("lampE|porch|bulb", 0.045, loc=(bx_, by_, porch_top(by_) - PRT - 0.12), m="emit_warm", segs=12, rings=8))
    lights.append(empty("light_porch_1", loc=(bx_, by_, porch_top(by_) - PRT - 0.3), parent=root, light="warm", group="porch", intensity=2.2, distance=7))
