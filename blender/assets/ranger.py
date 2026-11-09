"""
Ranger — compact lifting-body shuttle (reference images 3–7).

Blender frame: +Y = nose, +Z = up. Length 17 m (y -8.5 rear .. +8.5 nose), span 11.5 m across the dark frames.
Hull bottom at z = 0; landing gear extends 1.1 m below.

Exports public/assets/models/ranger.glb with:
  hull (white/dark lofted lifting body, real cut windows & cabin cavity), frames, fences, nose, rear block,
  hatch_rear (docking hatch, hinged), gear_* (retractable legs), interior (cabin per images 6-7),
  screen_* (runtime-driven displays), sw_* (cockpit switches), seat_* (seats), COL_* (collision boxes),
  empties: dock_rear, engine_*, vtol_*, rcs_*, navlight_*, cam_* (camera anchors), light_* (cabin lamps).
"""
import sys, os, math
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "lib"))
import kit
from kit import V, box, cyl, prism, loft, M, empty, merge, finish, set_props
import bmesh

L = 17.0
def Y(u): return -L / 2 + L * u

def lerpk(keys, u):
    """Piecewise-linear interpolation over [(u, value), ...]."""
    if u <= keys[0][0]:
        return keys[0][1]
    for (u0, a), (u1, b) in zip(keys, keys[1:]):
        if u <= u1:
            t = (u - u0) / (u1 - u0)
            return a + (b - a) * t
    return keys[-1][1]

# ---------------- planform / profiles ------------------------------------------------------------
I_K = [(0.17, 3.40), (0.41, 4.70), (0.94, 1.60), (0.955, 1.55)]     # inner frame edge (half width)
O_K = [(0.17, 4.14), (0.41, 5.75), (0.955, 2.45)]                   # outer frame edge
ZEDGE = [(0.17, 2.20), (0.41, 2.05), (0.66, 1.55), (0.94, 0.80), (0.955, 0.78)]
HW = [(0.17, 3.10), (0.20, 3.10), (0.56, 2.90), (0.62, 2.60), (0.66, 2.20), (0.75, 1.90), (0.85, 1.50), (0.93, 1.20), (0.955, 1.10)]
ZSH = [(0.17, 2.40), (0.20, 2.55), (0.24, 2.60), (0.56, 2.60), (0.62, 2.35), (0.66, 2.05), (0.75, 1.75), (0.85, 1.35), (0.93, 0.95), (0.955, 0.88)]
ZTOP = [(0.17, 2.45), (0.20, 2.80), (0.24, 2.95), (0.56, 2.95), (0.62, 2.60), (0.66, 2.30), (0.75, 1.95), (0.85, 1.45), (0.93, 1.00), (0.955, 0.90)]
ZBOT = [(0.17, 0.0), (0.85, 0.0), (0.955, 0.30)]
ZOT = [(0.17, 1.55), (0.41, 1.25), (0.955, 0.55)]   # frame outer top
ZOB = [(0.17, 0.50), (0.41, 0.50), (0.955, 0.40)]   # frame outer bottom


def body_section(u):
    I = lerpk(I_K, u); ze = lerpk(ZEDGE, u); hw = lerpk(HW, u); zs = lerpk(ZSH, u); zt = lerpk(ZTOP, u)
    zb = lerpk(ZBOT, u); y = Y(u)
    pts = [(I, zb), (I, ze), (hw, zs), (hw - 0.45, zt), (-(hw - 0.45), zt), (-hw, zs), (-I, ze), (-I, zb)]
    return [V((x, y, z)) for x, z in pts]


def build_hull():
    us = [0.17, 0.20, 0.24, 0.32, 0.41, 0.48, 0.56, 0.62, 0.66, 0.75, 0.85, 0.93, 0.955]
    secs = [body_section(u) for u in us]
    # slots: 0 white, 1 dark
    def fm(s, i):
        return 1 if i in (0, 6, 7) else 0
    body = loft("hull_body", secs, mats=(M("paint_white_aero"), M("paint_dark_aero")), face_mats=fm)
    # panel-line grooves on the white upper surfaces
    planes = [((0, Y(u), 0), (0, 1, 0)) for u in (0.215, 0.285, 0.36, 0.445, 0.52, 0.60, 0.69, 0.77, 0.845, 0.90)]
    planes += [((x, 0, 0), (1, 0, 0)) for x in (-3.3, -2.25, -1.15, 1.15, 2.25, 3.3)]
    planes += [((0, 0, 0), (1, 0, 0))]
    kit.groove(body, planes, width=0.014, depth=0.01, region=lambda p: p.z > 0.7)

    # rear block (u 0..0.17): full-width box with sloped shoulders (rear view of image 3)
    y0, y1 = Y(0.0), Y(0.172)
    sec = [(4.14, 0.25), (4.14, 1.35), (3.62, 2.28), (3.2, 2.45), (-3.2, 2.45), (-3.62, 2.28), (-4.14, 1.35), (-4.14, 0.25), (-3.9, 0.0), (3.9, 0.0)]
    rear = loft("hull_rear", [[V((x, y0, z)) for x, z in sec], [V((x, y1, z)) for x, z in sec]],
                mats=(M("paint_white_aero"), M("paint_dark_aero")),
                face_mats=lambda s, i: 0 if i in (2, 3, 4) else 1)
    hull = kit.boolean(body, rear, op="UNION")
    hull.name = "hull"
    return hull


def frame_strip(name, side, us):
    """Dark perimeter frame on one side: strip solid between inner and outer polylines."""
    bm = bmesh.new()
    ring = []
    for u in us:
        I = lerpk(I_K, u) - 0.02; O = lerpk(O_K, u); y = Y(u)
        zi_t = lerpk(ZEDGE, u) + 0.02; zo_t = lerpk(ZOT, u); zo_b = lerpk(ZOB, u); zi_b = lerpk(ZBOT, u) + 0.02
        pts = [(I, zi_b), (O - 0.18, zo_b), (O, zo_b + 0.2), (O, zo_t), (I, zi_t)]
        ring.append([bm.verts.new((side * x, y, z)) for x, z in pts])
    n = 5
    for s in range(len(ring) - 1):
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((ring[s][i], ring[s][j], ring[s + 1][j], ring[s + 1][i]))
    bm.faces.new(ring[0]); bm.faces.new(list(reversed(ring[-1])))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = kit.from_bmesh(name, bm, ("paint_dark_aero",))
    kit.add_bevel(o, 0.03, 2, 30)
    return o


def fence(name, side):
    """Thin swept blade along the outer frame edge, high near the widest point, pointed at the nose."""
    us = [0.20, 0.30, 0.41, 0.55, 0.70, 0.85, 0.955]
    ZF = [(0.20, 2.80), (0.955, 0.80)]
    bm = bmesh.new()
    rings = []
    t = 0.07
    for u in us:
        O = lerpk(O_K, u) - 0.12; y = Y(u)
        zb = lerpk(ZOT, u) - 0.05; zt = lerpk(ZF, u)
        rings.append([bm.verts.new((side * (O - t), y, zb)), bm.verts.new((side * (O + t), y, zb)),
                      bm.verts.new((side * (O + t * 0.4), y, zt)), bm.verts.new((side * (O - t * 0.4), y, zt))])
    # pointed tip ahead of the nose
    tip = bm.verts.new((side * (lerpk(O_K, 0.955) - 0.35), Y(1.03), 0.62))
    for s in range(len(rings) - 1):
        for i in range(4):
            j = (i + 1) % 4
            bm.faces.new((rings[s][i], rings[s][j], rings[s + 1][j], rings[s + 1][i]))
    for i in range(4):
        j = (i + 1) % 4
        bm.faces.new((rings[-1][i], rings[-1][j], tip))
    bm.faces.new(list(reversed(rings[0])))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = kit.from_bmesh(name, bm, ("paint_charcoal",))
    kit.add_bevel(o, 0.015, 1, 30)
    # white cap strip along the top inner face
    bm2 = bmesh.new()
    rr = []
    for u in us:
        O = lerpk(O_K, u) - 0.12; y = Y(u); zt = lerpk(ZF, u)
        x_in = side * (O - t * 0.4 - 0.012)
        rr.append([bm2.verts.new((x_in, y, zt - 0.16)), bm2.verts.new((x_in, y, zt - 0.01)),
                   bm2.verts.new((x_in + side * 0.012, y, zt - 0.01)), bm2.verts.new((x_in + side * 0.012, y, zt - 0.16))])
    for s in range(len(rr) - 1):
        for i in range(4):
            j = (i + 1) % 4
            bm2.faces.new((rr[s][i], rr[s][j], rr[s + 1][j], rr[s + 1][i]))
    bmesh.ops.recalc_face_normals(bm2, faces=bm2.faces)
    cap = kit.from_bmesh(name + "_cap", bm2, ("paint_white_aero",))
    return [o, cap]


def nose_block():
    y0, y1 = Y(0.952), Y(1.0)
    w = 2.45
    sec0 = [(w, 0.32), (w, 0.82), (-w, 0.82), (-w, 0.32), (-w + 0.3, 0.12), (w - 0.3, 0.12)]
    sec1 = [(w - 0.15, 0.40), (w - 0.15, 0.70), (-w + 0.15, 0.70), (-w + 0.15, 0.40), (-w + 0.45, 0.30), (w - 0.45, 0.30)]
    o = loft("nose", [[V((x, y0, z)) for x, z in sec0], [V((x, y1, z)) for x, z in sec1]], m="paint_dark_aero")
    kit.add_bevel(o, 0.04, 2, 30)
    kit.bake(o)
    # RCS ports: 3 oval holes per side on top, 2 on the front face
    cut = []
    for side in (-1, 1):
        for k in range(3):
            x = side * (1.25 + 0.38 * k)
            c = cyl("rcs_hole", 0.13, 0.6, loc=(x, (y0 + y1) / 2 + 0.05, 0.8), m="nozzle_inner", verts=16)
            c.scale = (1.0, 1.6, 1.0)
            cut.append(c)
        c = cyl("rcs_hole_f", 0.11, 0.6, loc=(side * 1.6, y1, 0.55), rot=(math.pi / 2, 0, 0), m="nozzle_inner", verts=16)
        c.scale = (1.5, 1, 1)
        cut.append(c)
    for c in cut:
        kit.bake(c)
        c.data.transform(c.matrix_basis); c.matrix_basis.identity()
    kit.boolean(o, cut)
    return o


def rear_details(par):
    objs = []
    y = Y(0.0)
    # central white rear panel with docking ring
    objs.append(box("rear_panel", (2.5, 0.08, 2.05), loc=(0, y - 0.03, 1.34), m="paint_white_aero", bevel=0.02))
    objs.append(kit.torus("dock_ring", 0.86, 0.06, loc=(0, y - 0.09, 1.34), rot=(math.pi / 2, 0, 0), m="metal_gray", seg=48))
    # yellow release handles at the panel corners
    for sx in (-1, 1):
        for sz in (-1, 1):
            objs.append(box("handle", (0.22, 0.05, 0.05), loc=(sx * 1.0, y - 0.09, 1.34 + sz * 0.88), m="warning_yellow", bevel=0.01))
    # black bezels around the thruster bay openings ("Rear Opening Edges BLACK")
    for sx in (-1, 1):
        objs.append(box("bez_t", (2.65, 0.06, 0.12), loc=(sx * 2.58, y - 0.03, 2.03), m="frame_black", bevel=0.01))
        objs.append(box("bez_b", (2.65, 0.06, 0.12), loc=(sx * 2.58, y - 0.03, 0.42), m="frame_black", bevel=0.01))
        objs.append(box("bez_i", (0.12, 0.06, 1.7), loc=(sx * 1.28, y - 0.03, 1.22), m="frame_black", bevel=0.01))
        objs.append(box("bez_o", (0.12, 0.06, 0.95), loc=(sx * 3.88, y - 0.03, 0.85), m="frame_black", bevel=0.01))
        # black paint mask panels on the rear block sides (image 3 "Panel (both sides) BLACK")
        objs.append(box("side_mask", (0.03, 2.2, 0.75), loc=(sx * 4.155, Y(0.07), 0.8), m="paint_dark_aero"))
    # small labels / status lights
    objs.append(box("rear_lbl", (0.4, 0.02, 0.12), loc=(0.85, y - 0.075, 2.15), m="frame_black"))
    # ribbed radiator grille on rear top deck
    for k in range(30):
        yy = Y(0.035) + k * 0.068
        objs.append(box("rib", (7.0, 0.035, 0.07), loc=(0, yy, 2.47), m="radiator_black"))
    objs.append(box("grille_base", (7.3, 2.15, 0.06), loc=(0, Y(0.035) + 0.99, 2.43), m="radiator_black", bevel=0.02))
    # grille side louvres on the sloped shoulders
    for sx in (-1, 1):
        for k in range(3):
            o = box("louvre", (0.6, 2.2, 0.06), loc=(sx * 3.75, Y(0.035) + 0.99, 1.5 + k * 0.22),
                    rot=(0, sx * 0.9, 0), m="radiator_black", bevel=0.01)
            objs.append(o)
    # thruster bay internals: louvred slats + nozzle bells
    for sx in (-1, 1):
        cx = sx * 2.55
        objs.append(box("bay_back", (2.5, 0.1, 1.5), loc=(cx, y + 1.06, 1.22), m="nozzle_inner"))
        for k in range(4):
            objs.append(box("slat", (2.45, 0.9, 0.05), loc=(cx, y + 0.55, 0.65 + k * 0.36), rot=(0.25, 0, 0), m="metal_gray", bevel=0.01))
        for k in range(3):
            n = kit.lathe("nozzle", [(0.22, 0.0), (0.2, 0.1), (0.12, 0.35), (0.14, 0.42)], m="nozzle_inner", seg=20,
                          loc=(cx + (k - 1) * 0.75, y + 1.0, 1.22), rot=(-math.pi / 2, 0, 0))
            objs.append(n)
    o = merge(objs, "rear_details", par=par)
    return o


def window_layout():
    """Top-view window polygons (x, u) for the right side; mirrored. Single centre window separately."""
    right = [
        [(0.25, 0.567), (1.20, 0.567), (1.02, 0.612), (0.32, 0.612)],
        [(0.35, 0.475), (1.45, 0.470), (1.62, 0.510), (1.35, 0.545), (0.40, 0.545)],
        [(0.15, 0.400), (0.75, 0.398), (0.72, 0.452), (0.18, 0.455)],
        [(0.95, 0.395), (1.95, 0.398), (2.05, 0.430), (1.85, 0.460), (1.00, 0.458)],
        [(0.30, 0.330), (1.00, 0.333), (0.95, 0.378), (0.35, 0.380)],
        [(1.20, 0.326), (2.20, 0.330), (2.25, 0.360), (2.05, 0.386), (1.25, 0.383)],
        [(0.50, 0.262), (1.90, 0.258), (1.80, 0.300), (0.55, 0.308)],
        [(2.02, 0.420), (2.38, 0.428), (2.35, 0.470), (2.05, 0.476)],
        [(2.35, 0.300), (2.40, 0.268), (2.12, 0.262), (2.08, 0.300)],
    ]
    out = []
    for p in right:
        out.append([(x, Y(u)) for x, u in p])
        out.append([(-x, Y(u)) for x, u in reversed(p)])
    out.append([(-0.12, Y(0.352)), (0.12, Y(0.352)), (0.12, Y(0.382)), (-0.12, Y(0.382))])
    return out


def build_windows(hull, par):
    """Frames draped on the hull, glass recessed, and cutters for real openings."""
    bm = bmesh.new()
    bm.from_mesh(hull.data)
    bvh = kit.BVHTree.FromBMesh(bm)
    bm.free()

    def zf(x, y):
        hit = bvh.ray_cast(V((x, y, 6.0)), V((0, 0, -1)))
        return hit[0].z if hit[0] is not None else 2.9

    frames, glasses, cutters, rivets = [], [], [], []
    for i, poly in enumerate(window_layout()):
        poly = kit.ccw(poly)
        inner = kit.round_poly(poly, 0.06, 3)
        outer = kit.offset_poly(inner, 0.085)
        # frame: ring draped onto the surface
        fr = kit.poly_ring(f"wframe{i}", outer, inner, 0, 1, m="frame_black")
        for v in fr.data.vertices:
            z = zf(v.co.x, v.co.y)
            v.co.z = z + (0.035 if v.co.z > 0.5 else -0.08)
        frames.append(fr)
        # glass
        gb = bmesh.new()
        vs = [gb.verts.new((x, y, zf(x, y) - 0.045)) for x, y in inner]
        gb.faces.new(vs)
        g = kit.from_bmesh(f"glass{i}", gb, ("glass_dark",))
        glasses.append(g)
        # cutter (only through the top shell)
        c = prism(f"wcut{i}", kit.offset_poly(inner, -0.005), 1.85, 3.8, m="frame_black")
        cutters.append(c)
        rivets.append(kit.rivets_along(f"riv{i}", kit.offset_poly(inner, 0.045), lambda x, y: zf(x, y) + 0.035, spacing=0.09, r=0.011, h=0.008))
    kit.boolean(hull, cutters)
    fo = merge(frames + rivets, "window_frames", par=par)
    go = merge(glasses, "window_glass", par=par)
    return fo, go


def cabin_cutters():
    """Cabin cavity + rear vestibule (boolean cutters; their material becomes the interior shell)."""
    def sec(y, zc):
        pts = [(-2.2, 0.30), (2.2, 0.30), (2.45, 0.6), (2.55, 1.6), (2.25, zc - 0.35), (1.9, zc), (-1.9, zc), (-2.25, zc - 0.35), (-2.55, 1.6), (-2.45, 0.6)]
        return [V((x, y, z)) for x, z in pts]
    stations = [(-7.25, 2.2), (-5.65, 2.2), (-5.0, 2.45), (-4.4, 2.72), (0.95, 2.72), (1.9, 2.38), (2.0, 2.30)]
    cav = loft("cavity", [sec(y, z) for y, z in stations], m="int_panel_dark")
    vest = cyl("vest", 0.70, 1.5, loc=(0, Y(0) + 0.45, 1.34), rot=(math.pi / 2, 0, 0), m="int_panel_mid", verts=40)
    vest2 = box("vest2", (1.5, 0.9, 1.75), loc=(0, -7.45, 1.25), m="int_panel_mid")
    bays = []
    for sx in (-1, 1):
        # trapezoid thruster bay openings (rear view)
        poly = [(sx * 1.32, 0.45), (sx * 3.85, 0.45), (sx * 3.85, 1.25), (sx * 3.35, 2.0), (sx * 1.32, 2.0)]
        b = kit.prism_xz("bay", kit.ccw(poly), Y(0) - 0.2, Y(0) + 1.1, m="nozzle_inner")
        bays.append(b)
    return cav, [vest, vest2], bays


def gear_leg(name, par, hinge, foot_len=0.9, rear=False, side=1):
    """Retractable leg: pivot empty at hinge; children: strut, piston(lower), retraction cylinder, foot."""
    pv = empty(name, loc=hinge, parent=par, interact="none")
    parts = []
    L1 = 1.25
    strut = cyl(name + "_strut", 0.09, L1, loc=(0, 0, -L1 / 2), m="metal_gray", verts=16, bevel=0.01)
    strut.parent = pv
    parts.append(strut)
    low = empty(name + "_lower", loc=(0, 0, -L1 + 0.15), parent=pv)
    pis = cyl(name + "_piston", 0.06, 0.55, loc=(0, 0, -0.1), m="metal_silver", verts=16)
    pis.parent = low
    foot = box(name + "_foot", (0.36, foot_len, 0.07), loc=(0, 0.1 if not rear else -0.05, -0.38), m="rubber_black", bevel=0.02)
    foot.parent = low
    ank = box(name + "_ankle", (0.16, 0.22, 0.16), loc=(0, 0, -0.32), m="metal_dark", bevel=0.02)
    ank.parent = low
    # retraction cylinder (silver) from hull to strut mid
    rc = cyl(name + "_retract", 0.045, 0.95, loc=(0, -0.32, -0.42), rot=(-0.65, 0, 0), m="metal_silver", verts=12)
    rc.parent = pv
    knuckle = box(name + "_knuckle", (0.28, 0.3, 0.22), loc=(0, 0, -0.05), m="metal_dark", bevel=0.03)
    knuckle.parent = pv
    if rear:
        brace = cyl(name + "_brace", 0.06, 1.2, loc=(0, -0.42, -0.6), rot=(0.62, 0, 0), m="metal_gray", verts=12)
        brace.parent = pv
    for o in (strut, pis, foot, ank, rc, knuckle):
        finish(o, 40)
    if rear:
        finish(brace, 40)
    set_props(pv, gear=1, side=side)
    return pv


# ---------------- interior ---------------------------------------------------------------------
def seat(name, par, loc, pilot=False, rot_z=0.0):
    root = empty(name, loc=loc, rot=(0, 0, rot_z), parent=par, interact="seat", iid=name, pilot=1 if pilot else 0)
    parts = []
    # rail base & pedestal
    parts.append(box("ped", (0.42, 0.5, 0.32), loc=(0, 0, 0.16), m="metal_dark", bevel=0.02))
    parts.append(box("rail_l", (0.06, 0.9, 0.05), loc=(-0.24, 0, 0.025), m="metal_gray"))
    parts.append(box("rail_r", (0.06, 0.9, 0.05), loc=(0.24, 0, 0.025), m="metal_gray"))
    # seat pan + ribbed cushion
    parts.append(box("pan", (0.62, 0.58, 0.12), loc=(0, 0.02, 0.42), m="metal_dark", bevel=0.02))
    for k in range(5):
        parts.append(box("cush", (0.56, 0.1, 0.07), loc=(0, -0.2 + k * 0.105, 0.51), m="fabric_red", bevel=0.025, segs=2))
    # backrest, ribbed
    back = empty("back_pivot", loc=(0, -0.28, 0.5), rot=(-0.22, 0, 0), parent=root)
    parts.append(box("back_shell", (0.64, 0.12, 0.95), loc=(0, -0.33, 0.98), rot=(-0.22, 0, 0), m="metal_dark", bevel=0.03))
    for k in range(7):
        z = 0.62 + k * 0.11
        parts.append(box("bcush", (0.56, 0.08, 0.095), loc=(0, -0.27 + (z - 0.5) * 0.22, z), rot=(-0.22, 0, 0), m="fabric_red", bevel=0.025))
    parts.append(box("head", (0.36, 0.14, 0.24), loc=(0, -0.46, 1.58), rot=(-0.22, 0, 0), m="fabric_red", bevel=0.05, segs=3))
    # armrests
    for sx in (-1, 1):
        parts.append(box("arm", (0.1, 0.42, 0.08), loc=(sx * 0.37, 0.03, 0.66), m="console_dark", bevel=0.02))
        parts.append(box("arm_post", (0.06, 0.06, 0.18), loc=(sx * 0.37, -0.12, 0.55), m="metal_gray"))
    # harness straps
    for sx in (-1, 1):
        parts.append(box("strap", (0.06, 0.02, 0.6), loc=(sx * 0.14, -0.2, 0.95), rot=(-0.22, 0, 0), m="plastic_dark"))
    if pilot:
        for sx in (-1, 1):
            parts.append(cyl("stick_base", 0.05, 0.04, loc=(sx * 0.37, 0.18, 0.72), m="metal_dark"))
            parts.append(cyl("stick", 0.022, 0.16, loc=(sx * 0.37, 0.19, 0.8), m="plastic_dark"))
            parts.append(sphere_like("grip", (sx * 0.37, 0.2, 0.9)))
    o = merge(parts, name + "_mesh", par=root)
    o.location = (0, 0, 0)
    for c in list(root.children):
        if c.name.startswith("back_pivot"):
            bpy_remove(c)
    finish(o, 35)
    empty(name + "_eye", loc=(0, -0.05, 1.18), parent=root)       # head/camera anchor while seated
    return root


def sphere_like(name, loc):
    return kit.sphere(name, 0.035, loc=loc, m="plastic_dark", segs=10, rings=6, scale=(1, 1, 1.4))


def bpy_remove(o):
    import bpy
    bpy.data.objects.remove(o, do_unlink=True)


def screen(name, par, loc, size, rot=(0, 0, 0), m="emit_screen", bezel=True):
    """Display surface with 0..1 UVs for runtime CanvasTextures + a bezel."""
    import bpy
    w, h = size
    bm = bmesh.new()
    a = bm.verts.new((-w / 2, 0, -h / 2)); b = bm.verts.new((w / 2, 0, -h / 2))
    c = bm.verts.new((w / 2, 0, h / 2)); d = bm.verts.new((-w / 2, 0, h / 2))
    f = bm.faces.new((a, b, c, d))
    uvl = bm.loops.layers.uv.new("UVMap")
    for loop, uv in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
        loop[uvl].uv = uv
    f.normal_update()
    # normal should face -Y (towards the viewer standing at -Y)
    if f.normal.y > 0:
        f.normal_flip()
        for loop, uv in zip(f.loops, ((0, 0), (0, 1), (1, 1), (1, 0))):
            pass
    o = kit.from_bmesh(name, bm, (m,), loc=loc, rot=rot, par=par)
    o["screen"] = 1
    o["sw"] = w; o["sh"] = h
    out = [o]
    if bezel:
        bz = box(name + "_bezel", (w + 0.06, 0.04, h + 0.06), loc=(0, 0.025, 0), m="console_dark", bevel=0.01, par=None)
        bz.parent = o
        finish(bz, 30)
    return o


def build_interior(par):
    import bpy
    root = empty("interior", parent=par)
    P = []    # static interior parts to merge
    # ---- floor
    P.append(box("floor_base", (4.5, 9.2, 0.06), loc=(0, -2.62, 0.33), m="int_floor", bevel=0.01))
    for k in range(9):
        yy = -6.9 + k * 1.0
        for sx in (-1, 1):
            P.append(box("fplate", (1.15, 0.92, 0.025), loc=(sx * 1.35, yy, 0.375), m="int_floor", bevel=0.008))
    # central walkway: rubber strip between two rails (image 7)
    P.append(box("walk", (0.5, 9.0, 0.03), loc=(0, -2.6, 0.37), m="rubber_black"))
    for sx in (-1, 1):
        P.append(box("rail", (0.07, 9.0, 0.06), loc=(sx * 0.32, -2.6, 0.39), m="metal_gray", bevel=0.01))
    # grates (image 6)
    for (yy, sx) in ((-4.6, -1), (-4.6, 1), (-3.4, -1), (-3.4, 1), (-1.0, -1), (-1.0, 1)):
        P.append(box("grate_frame", (0.95, 0.85, 0.03), loc=(sx * 1.05, yy, 0.39), m="metal_dark", bevel=0.01))
        g = box("grate", (0.85, 0.75, 0.02), loc=(sx * 1.05, yy, 0.40), m="int_grate")
        P.append(g)
    # ---- side walls: beige padded wedge benches along lower walls (image 6)
    for sx in (-1, 1):
        for k in range(4):
            yy = -6.4 + k * 1.05
            poly = [(sx * 2.42, 0.38), (sx * 1.85, 0.38), (sx * 1.85, 0.62), (sx * 2.42, 1.35)]
            w = kit.prism_xz("wedge", kit.ccw(poly), yy - 0.48, yy + 0.48, m="pad_beige")
            kit.add_bevel(w, 0.05, 3, 30)
            P.append(w)
            P.append(box("wedge_lbl", (0.02, 0.18, 0.08), loc=(sx * 1.84, yy, 0.52), m="plastic_dark"))
        # upper side wall panels with ribs
        for k in range(14):
            yy = -6.9 + k * 0.62
            P.append(box("rib", (0.08, 0.06, 1.0), loc=(sx * 2.42, yy, 1.85), rot=(0, sx * 0.25, 0), m="metal_dark", bevel=0.01))
        for k in range(6):
            yy = -6.4 + k * 1.24
            P.append(box("wpanel", (0.06, 1.1, 0.75), loc=(sx * 2.44, yy, 1.8), rot=(0, sx * 0.25, 0), m="int_panel_mid", bevel=0.015))
            # switch / indicator panels
            P.append(box("swp", (0.04, 0.4, 0.22), loc=(sx * 2.38, yy + 0.2, 1.95), rot=(0, sx * 0.25, 0), m="switch_panel", bevel=0.01))
            for j in range(6):
                P.append(box("led", (0.015, 0.03, 0.02), loc=(sx * 2.355, yy + 0.05 + j * 0.06, 2.0), m="emit_warm" if j % 2 else "emit_green"))
        # blue conduit along upper wall/ceiling join (image 6)
        kit_t = kit.tube("conduit", [(sx * 2.1, -7.0, 2.42), (sx * 2.1, 0.8, 2.42), (sx * 1.9, 1.6, 2.2)], 0.025, m="pipe_blue")
        P.append(kit_t)
        P.append(kit.tube("conduit2", [(sx * 2.32, -7.0, 1.42), (sx * 2.32, 1.2, 1.42)], 0.018, m="pipe_blue"))
    # ---- storage lockers at the rear (image 6 right side)
    for sx in (-1, 1):
        for k in range(3):
            P.append(box("locker", (0.6, 0.85, 0.42), loc=(sx * 1.95, -6.65, 0.62 + k * 0.45), m="console_beige", bevel=0.03))
            P.append(box("locker_h", (0.04, 0.3, 0.05), loc=(sx * 1.63, -6.65, 0.68 + k * 0.45), m="metal_gray"))
    # ---- ceiling: frames, padded tiles, light fixtures, overhead switch panels
    for k in range(15):
        yy = -6.95 + k * 0.62
        zc = 2.18 if yy < -5.6 else (2.42 if yy < -4.8 else 2.66)
        if yy > 1.0:
            zc = 2.45
        P.append(box("cframe", (3.9, 0.07, 0.08), loc=(0, yy, zc), m="metal_dark", bevel=0.01))
    for k in range(10):
        yy = -6.6 + k * 0.82
        zc = 2.15 if yy < -5.6 else (2.4 if yy < -4.8 else 2.63)
        for sx in (-1, 1):
            if -4.0 < yy < 1.0 and abs(sx) == 1:
                pass
            P.append(box("ctile", (0.7, 0.7, 0.05), loc=(sx * 1.45, yy, zc + 0.02), m="pad_gray", bevel=0.04))
    lamps = []
    for yy in (-6.3, -4.2, -2.4, -0.6, 1.1):
        for sx in (-1, 1):
            zc = 2.1 if yy < -5.6 else (2.36 if yy < -4.8 else 2.6)
            if yy > 1.0:
                zc = 2.35
            P.append(box("lamp_housing", (0.62, 0.32, 0.08), loc=(sx * 0.75, yy, zc), m="console_dark", bevel=0.015))
            P.append(box("lamp", (0.52, 0.24, 0.02), loc=(sx * 0.75, yy, zc - 0.045), m="emit_warm"))
            lamps.append((sx * 0.75, yy, zc - 0.12))
    for i, p in enumerate(lamps):
        empty(f"light_cabin_{i}", loc=p, parent=root, light="warm", intensity=2.5)
    # overhead switch panels along the centre (image 6 top)
    for yy in (-5.2, -3.3, -1.5):
        P.append(box("oh_panel", (0.9, 0.55, 0.1), loc=(0, yy, 2.58), m="console_dark", bevel=0.02))
        for j in range(4):
            for i2 in range(6):
                P.append(box("oh_sw", (0.05, 0.03, 0.03), loc=(-0.3 + i2 * 0.12, yy - 0.18 + j * 0.12, 2.52), m="emit_cool" if (i2 + j) % 3 == 0 else "metal_gray"))
    # ---- cockpit: front instrument wall + consoles (images 6, 7)
    P.append(box("front_wall", (4.4, 0.25, 1.4), loc=(0, 1.95, 1.05), m="console_dark", bevel=0.02))
    P.append(box("dash", (3.8, 0.75, 0.12), loc=(0, 1.55, 1.1), rot=(-0.25, 0, 0), m="console_dark", bevel=0.02))
    P.append(box("upper_dash", (3.2, 0.12, 0.55), loc=(0, 1.9, 1.95), rot=(0.35, 0, 0), m="console_dark", bevel=0.02))
    # centre pedestal with throttle levers
    P.append(box("pedestal", (0.55, 1.3, 0.75), loc=(0, 0.75, 0.75), m="console_dark", bevel=0.03))
    P.append(box("ped_top", (0.5, 1.1, 0.05), loc=(0, 0.72, 1.14), rot=(-0.1, 0, 0), m="switch_panel"))
    for sx in (-1, 1):
        # side consoles
        P.append(box("side_con", (0.55, 1.6, 0.85), loc=(sx * 1.85, 0.75, 0.8), m="console_dark", bevel=0.03))
        P.append(box("side_con_top", (0.5, 1.4, 0.06), loc=(sx * 1.83, 0.75, 1.24), rot=(0, 0, 0), m="switch_panel"))
        P.append(box("side_tower", (0.5, 0.35, 0.8), loc=(sx * 1.9, 1.5, 1.6), rot=(0, 0, sx * 0.25), m="console_dark", bevel=0.03))
        for j in range(5):
            for i2 in range(4):
                P.append(box("csw", (0.035, 0.05, 0.03), loc=(sx * (1.7 + i2 * 0.1), 0.2 + j * 0.25, 1.28), m="emit_screen_amber" if (j + i2) % 4 == 0 else "metal_gray"))
    # ---- interior pressure door at the rear of the cabin (round window door, image 7)
    P.append(box("rear_bulk_l", (1.5, 0.12, 2.0), loc=(-1.55, -7.28, 1.3), m="int_panel_light", bevel=0.02))
    P.append(box("rear_bulk_r", (1.5, 0.12, 2.0), loc=(1.55, -7.28, 1.3), m="int_panel_light", bevel=0.02))
    P.append(box("rear_bulk_t", (1.6, 0.12, 0.3), loc=(0, -7.28, 2.05), m="int_panel_light", bevel=0.02))
    st = merge(P, "interior_static", par=root, col="none")
    finish(st, 35)

    # ---- interactive parts kept separate
    door = empty("door_cabin", loc=(-0.78, -7.25, 1.1), parent=root, interact="door", iid="ranger_cabin_door", hinge="z", openAngle=-1.75)
    dp = [box("door_leaf", (1.55, 0.09, 1.82), loc=(0.78, 0, 0.1), m="int_panel_light", bevel=0.03),
          kit.torus("door_window_ring", 0.22, 0.035, loc=(0.78, -0.06, 0.45), rot=(math.pi / 2, 0, 0), m="metal_gray"),
          box("door_handle", (0.05, 0.08, 0.25), loc=(1.4, -0.07, 0.1), m="metal_gray")]
    d = merge(dp, "door_cabin_mesh", par=door)
    d.location = (0, 0, 0)
    finish(d, 35)
    dg = kit.cyl("door_cabin_glass", 0.2, 0.02, loc=(0.78, -0.02, 0.45), rot=(math.pi / 2, 0, 0), m="glass_clear", par=door)

    # seats: pilot, co-pilot (front row), two passengers
    seat("seat_pilot", root, (-0.95, 0.15, 0.36), pilot=True)
    seat("seat_copilot", root, (0.95, 0.15, 0.36), pilot=True)
    seat("seat_p1", root, (-0.95, -1.75, 0.36))
    seat("seat_p2", root, (0.95, -1.75, 0.36))

    # screens (runtime canvases)
    screen("screen_main_l", root, (-0.75, 1.82, 1.32), (0.62, 0.42), rot=(-0.25, 0, 0))
    screen("screen_main_c", root, (0.0, 1.82, 1.32), (0.62, 0.42), rot=(-0.25, 0, 0))
    screen("screen_main_r", root, (0.75, 1.82, 1.32), (0.62, 0.42), rot=(-0.25, 0, 0))
    screen("screen_upper_l", root, (-0.55, 1.86, 1.95), (0.5, 0.32), rot=(0.35, 0, 0))
    screen("screen_upper_r", root, (0.55, 1.86, 1.95), (0.5, 0.32), rot=(0.35, 0, 0))
    screen("screen_side_l", root, (-1.83, 1.38, 1.62), (0.36, 0.28), rot=(0, 0, -0.25 + math.pi / 2 - math.pi / 2))
    screen("screen_side_r", root, (1.83, 1.38, 1.62), (0.36, 0.28), rot=(0, 0, 0.25))

    # interactive switches on the centre pedestal (runtime wires these)
    sws = ["sw_engine", "sw_gear", "sw_sas", "sw_rcs", "sw_lights", "sw_autopilot", "sw_dock", "sw_hatch", "sw_lifesupport", "sw_comms"]
    for i, n in enumerate(sws):
        cx = -0.16 + (i % 2) * 0.32
        cy = 0.25 + (i // 2) * 0.2
        s = box(n, (0.11, 0.09, 0.05), loc=(cx, cy, 1.16 + (cy - 0.72) * -0.1), m="plastic_dark", bevel=0.01, par=root,
                interact="switch", iid=n)
        lab = box(n + "_lamp", (0.08, 0.025, 0.012), loc=(0, -0.025, 0.028), m="emit_green", par=s)
    # throttle lever
    th = empty("lever_throttle", loc=(0.0, 0.95, 1.18), parent=root, interact="lever", iid="throttle")
    tl = cyl("lever_throttle_mesh", 0.02, 0.22, loc=(0, 0, 0.11), m="metal_gray", par=th)
    tk = box("lever_throttle_knob", (0.09, 0.05, 0.05), loc=(0, 0, 0.23), m="plastic_dark", par=th)

    # ---- collision boxes (invisible), cabin frame coordinates
    cols = [
        ((4.6, 9.6, 0.3), (0, -2.7, 0.24)),            # floor (top at 0.39)
        ((0.3, 9.6, 2.6), (-2.5, -2.7, 1.5)),          # left wall
        ((0.3, 9.6, 2.6), (2.5, -2.7, 1.5)),           # right wall
        ((4.6, 9.6, 0.3), (0, -2.7, 2.88)),            # ceiling (cockpit)
        ((4.6, 1.7, 0.3), (0, -6.5, 2.35)),            # lower rear ceiling
        ((4.6, 0.4, 2.6), (0, 2.15, 1.4)),             # front wall
        ((1.6, 0.25, 2.2), (-1.55, -7.28, 1.3)),       # rear bulkhead L
        ((1.6, 0.25, 2.2), (1.55, -7.28, 1.3)),        # rear bulkhead R
        ((0.6, 1.3, 0.8), (0, 0.75, 0.8)),             # pedestal
        ((0.6, 1.7, 0.9), (-1.85, 0.75, 0.8)),         # side consoles
        ((0.6, 1.7, 0.9), (1.85, 0.75, 0.8)),
        ((0.7, 1.0, 1.0), (-1.95, -6.65, 0.85)),       # lockers
        ((0.7, 1.0, 1.0), (1.95, -6.65, 0.85)),
        ((0.6, 4.3, 0.6), (-2.15, -4.8, 0.6)),         # benches
        ((0.6, 4.3, 0.6), (2.15, -4.8, 0.6)),
        ((1.6, 1.2, 0.2), (0, -7.9, 0.33)),            # vestibule floor
        ((0.3, 1.2, 2.0), (-0.85, -7.9, 1.3)),
        ((0.3, 1.2, 2.0), (0.85, -7.9, 1.3)),
        ((1.6, 1.2, 0.3), (0, -7.9, 2.25)),
    ]
    for i, (s, l) in enumerate(cols):
        c = box(f"COL_cab{i}", s, loc=l, m="frame_black", par=root, col="box")
        c.hide_render = True
    # door collider (moves with door)
    c = box("COL_door_cabin", (1.55, 0.12, 1.85), loc=(0.78, 0, 0.1), m="frame_black", par=door, col="box", door="ranger_cabin_door")
    # anchors
    empty("spawn_cabin", loc=(0, -4.0, 0.4), parent=root)
    empty("cam_cockpit", loc=(-0.95, 0.15, 1.55), parent=root)
    return root


def build(preview=True):
    import bpy
    kit.reset()
    root = empty("Ranger", props=None) if False else empty("Ranger")
    set_props(root, vehicle="ranger", length=L, gear_height=1.465)
    hull = build_hull()
    cav, vest, bays = cabin_cutters()
    kit.boolean(hull, [cav] + vest + bays)
    fo, go = build_windows(hull, root)
    hull.parent = root
    finish(hull, 32)
    for o in (fo,):
        finish(o, 35)
    finish(go, 10)
    parts = []
    for side, nm in ((1, "R"), (-1, "L")):
        f = frame_strip("frame_" + nm, side, [0.17, 0.24, 0.32, 0.41, 0.55, 0.70, 0.85, 0.955])
        parts.append(f)
        parts.extend(fence("fence_" + nm, side))
        # side vent panel with 3 RCS holes (image 5, left side)
        vp = box("ventpanel", (0.08, 1.3, 0.45), loc=(side * (lerpk(O_K, 0.27) + 0.03), Y(0.27), 0.95),
                 rot=(0, 0, -side * math.atan2(lerpk(O_K, 0.41) - lerpk(O_K, 0.17), Y(0.41) - Y(0.17))), m="radiator_black", bevel=0.01)
        parts.append(vp)
    frames = merge(parts, "frames", par=root)
    finish(frames, 30)
    nose = nose_block()
    nose.parent = root
    finish(nose, 30)
    rd = rear_details(root)
    finish(rd, 35)

    # underside thermal panels & gear bays
    under = []
    for k in range(7):
        under.append(box("tile_row", (6.5 - k * 0.5, 0.95, 0.02), loc=(0, Y(0.2) + k * 1.6, -0.01), m="thermal_tile", bevel=0.01))
    for (x, y) in ((2.6, Y(0.40)), (-2.6, Y(0.40)), (2.9, Y(0.07)), (-2.9, Y(0.07))):
        under.append(box("bay_rim", (0.62, 1.55, 0.03), loc=(x, y, -0.02), m="metal_dark", bevel=0.01))
    uo = merge(under, "underside", par=root)
    finish(uo, 30)

    # hatch (docking), hinged on its left edge; radial relief (image 3 rear view)
    hp = empty("hatch_rear", loc=(-0.78, Y(0) - 0.1, 1.34), parent=root, interact="hatch", iid="ranger_rear_hatch", hinge="z", openAngle=1.9)
    hparts = [kit.cyl("hatch_disc", 0.76, 0.12, loc=(0.78, 0, 0), rot=(math.pi / 2, 0, 0), m="hatch_gray", verts=48, bevel=0.02)]
    for k in range(12):
        a = math.tau * k / 12
        b = box("hatch_vane", (0.08, 0.06, 0.5), loc=(0.78 + math.cos(a) * 0.38, -0.08, math.sin(a) * 0.38),
                rot=(0, -a + math.pi / 2 + 0.35, 0), m="hatch_gray", bevel=0.01)
        hparts.append(b)
    hparts.append(kit.cyl("hatch_hub", 0.14, 0.12, loc=(0.78, -0.1, 0), rot=(math.pi / 2, 0, 0), m="metal_gray"))
    hparts.append(kit.torus("hatch_rim", 0.72, 0.03, loc=(0.78, -0.07, 0), rot=(math.pi / 2, 0, 0), m="metal_gray", seg=48))
    hm = merge(hparts, "hatch_rear_mesh", par=hp)
    hm.location = (0, 0, 0)
    finish(hm, 35)
    box("COL_hatch_rear", (1.5, 0.15, 1.5), loc=(0.78, 0, 0), m="frame_black", par=hp, col="box", door="ranger_rear_hatch").hide_render = True

    # landing gear (pivot at hinge, legs hang along -Z)
    gear_leg("gear_FR", root, (2.6, Y(0.40) + 0.5, 0.05), side=1)
    gear_leg("gear_FL", root, (-2.6, Y(0.40) + 0.5, 0.05), side=-1)
    gear_leg("gear_RR", root, (2.9, Y(0.07) + 0.4, 0.05), rear=True, side=1)
    gear_leg("gear_RL", root, (-2.9, Y(0.07) + 0.4, 0.05), rear=True, side=-1)

    # rear boarding ladder (folds down beneath the hatch)
    lad = empty("ladder_rear", loc=(0, Y(0) - 0.05, 0.42), parent=root, interact="ladder", iid="ranger_ladder")
    lp = [box("lad_rail_l", (0.05, 0.05, 1.6), loc=(-0.3, -0.05, -0.8), m="metal_gray"),
          box("lad_rail_r", (0.05, 0.05, 1.6), loc=(0.3, -0.05, -0.8), m="metal_gray")]
    for k in range(5):
        lp.append(box("rung", (0.6, 0.04, 0.03), loc=(0, -0.05, -0.15 - k * 0.32), m="metal_gray"))
    lm = merge(lp, "ladder_mesh", par=lad)
    lm.location = (0, 0, 0)
    finish(lm, 30)

    build_interior(root)

    # exterior collision (low-poly hull + frames)
    cx = [box("COL_ext_body", (8.3, 11.4, 2.5), loc=(0, Y(0.33), 1.25), m="frame_black", col="box"),
          box("COL_ext_fwd", (5.0, 5.5, 1.3), loc=(0, Y(0.78), 0.7), m="frame_black", col="box"),
          box("COL_ext_wingL", (2.2, 7.0, 1.2), loc=(-4.4, Y(0.47), 0.75), rot=(0, 0, -0.35), m="frame_black", col="box"),
          box("COL_ext_wingR", (2.2, 7.0, 1.2), loc=(4.4, Y(0.47), 0.75), rot=(0, 0, 0.35), m="frame_black", col="box")]
    for c in cx:
        c.parent = root
        c.hide_render = True
        c["exterior"] = 1

    # anchors: docking port frame (+Y of the empty = outward direction of the port = -ship Y)
    empty("dock_rear", loc=(0, Y(0) - 0.12, 1.34), rot=(0, 0, math.pi), parent=root, port="rear")
    for sx, nm in ((-1, "L"), (1, "R")):
        empty("engine_" + nm, loc=(sx * 2.55, Y(0) - 0.1, 1.22), rot=(0, 0, math.pi), parent=root, thrust=1)
        empty("vtol_F" + nm, loc=(sx * 3.9, Y(0.55), 0.3), parent=root)
        empty("vtol_R" + nm, loc=(sx * 3.5, Y(0.2), 0.3), parent=root)
    rcs = [("rcs_nose_up_L", (-1.6, Y(0.975), 0.85), (0, 0, 1)), ("rcs_nose_up_R", (1.6, Y(0.975), 0.85), (0, 0, 1)),
           ("rcs_nose_fwd_L", (-1.6, Y(1.0), 0.55), (0, 1, 0)), ("rcs_nose_fwd_R", (1.6, Y(1.0), 0.55), (0, 1, 0)),
           ("rcs_side_L", (-5.0, Y(0.27), 0.95), (-1, 0, 0)), ("rcs_side_R", (5.0, Y(0.27), 0.95), (1, 0, 0)),
           ("rcs_rear_up_L", (-3.6, Y(0.02), 2.3), (0, 0, 1)), ("rcs_rear_up_R", (3.6, Y(0.02), 2.3), (0, 0, 1)),
           ("rcs_rear_dn_L", (-3.6, Y(0.02), 0.1), (0, 0, -1)), ("rcs_rear_dn_R", (3.6, Y(0.02), 0.1), (0, 0, -1))]
    for n, p, d in rcs:
        empty(n, loc=p, parent=root, dx=d[0], dy=d[1], dz=d[2])
    empty("navlight_red", loc=(-lerpk(O_K, 0.41), Y(0.41), 1.3), parent=root, color="red")
    empty("navlight_green", loc=(lerpk(O_K, 0.41), Y(0.41), 1.3), parent=root, color="green")
    empty("navlight_white_L", loc=(-3.9, Y(0.0), 2.3), parent=root, color="white")
    empty("navlight_white_R", loc=(3.9, Y(0.0), 2.3), parent=root, color="white")
    empty("cam_chase", loc=(0, Y(0) - 22, 7), parent=root)
    empty("exit_rear", loc=(0, Y(0) - 1.6, -1.445), parent=root)   # ground spot behind the ladder (gear down)

    for o in kit.all_children(root, True):
        if o.type == "MESH" and not o.data.uv_layers:
            kit.uv_box(o)

    path = os.path.join(kit.out_dir(), "ranger.glb")
    kit.export_glb(path, root)
    if preview:
        pd = kit.preview_dir()
        kit.preview(os.path.join(pd, "ranger_34.png"), (-14, 16, 9), (0, 0, 0.8), lens=32, samples=20)
        kit.preview(os.path.join(pd, "ranger_top.png"), (-9, -15, 17), (0, 0, 1), lens=35, samples=20)
        kit.preview(os.path.join(pd, "ranger_rear.png"), (0, -24, 2.5), (0, 0, 1.3), lens=50, samples=16)
        kit.preview(os.path.join(pd, "ranger_side.png"), (28, 0, 1.6), (0, 0, 1.2), lens=45, samples=16)
    return root


if __name__ == "__main__":
    build(preview="--nopreview" not in sys.argv)
