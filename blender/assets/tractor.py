"""
Big articulated four-wheel-drive farm tractor (reference images 1–2). An original, unbadged modern design: long
sloping hood with a rounded nose and side intake screens, four-post glass cab over the articulation joint, vertical
muffler with a hooked stack on the left, intake pre-cleaner on the right, duals on both axles (eight R1W tyres),
suitcase weights, saddle fuel tanks, access ladder and handrails, three-point hitch, drawbar and hydraulic couplers.

Blender +Y = forward, origin on the ground under the articulation joint. Nodes used at runtime: front_frame
(articulation, rotates about Z), wheel_FL/FR (children of front_frame) and wheel_RL/RR, steer (local Z = column
axis), eye_driver, exit_L/R, door_hit (cardoor), light_head_L/R; lamp meshes carry userData.lamp.
"""
import sys, os, math, random
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "lib"))
sys.path.insert(0, HERE)
import bpy, bmesh
import kit
from kit import V, box, cyl, prism, M, empty, merge, finish, set_props, lathe, loft
from farm_house import obox, seg_box

PI = math.pi
FA, RA = 1.95, -1.95                # axle positions
TR = 1.30                           # centre of each dual pair
TIRE_R, TIRE_W, RIM_R = 1.0, 0.52, 0.54
DUAL = 0.32                         # half spacing of a dual pair
RED, DARK = "farm_red", "metal_dark"


# ------------------------------------------------------------------------------------------------ tyres
def ag_tire(name, par, x_off, mirror):
    """R1W radial with chevron lugs on a red rim with a dished centre; rolls about X."""
    r, w, rr = TIRE_R, TIRE_W, RIM_R
    parts = []
    prof = [(rr, -w * 0.46), (0.70, -w * 0.51), (0.86, -w * 0.49), (0.95, -w * 0.43), (0.968, -w * 0.3), (0.968, w * 0.3), (0.95, w * 0.43),
            (0.86, w * 0.49), (0.70, w * 0.51), (rr, w * 0.46)]
    parts.append(lathe(name + "_carcass", prof, m="tire_rubber", seg=64, rot=(0, PI / 2, 0)))
    n = 23
    for k in range(n):
        for side in (-1, 1):
            a = 2 * PI * (k + (0.5 if side > 0 else 0.0)) / n
            rad = V((0, math.cos(a), math.sin(a)))
            tan = V((0, -math.sin(a), math.cos(a)))
            phi = 0.62 * side
            d = V((1, 0, 0)) * math.cos(phi) + tan * math.sin(phi)
            pv = V((1, 0, 0)) * -math.sin(phi) + tan * math.cos(phi)
            c = V((side * w * 0.24, 0, 0)) + rad * 0.955
            parts.append(obox(name + "_lug", c, d, pv, rad, -0.17, 0.17, -0.04, 0.04, 0.0, 0.055, "tire_rubber"))
    # rim: well base + flanges, dished centre disc, hub with nuts
    rim = [(rr + 0.03, -w * 0.47), (rr - 0.01, -w * 0.45), (rr - 0.04, -w * 0.25), (rr - 0.04, w * 0.25), (rr - 0.01, w * 0.45), (rr + 0.03, w * 0.47),
           (rr + 0.03, w * 0.43), (rr - 0.06, w * 0.24), (rr - 0.06, -w * 0.24), (rr + 0.03, -w * 0.43)]
    parts.append(lathe(name + "_rim", rim, m=RED, seg=48, rot=(0, PI / 2, 0)))
    disc = [(0.17, 0.10), (0.30, 0.06), (0.42, -0.02), (rr - 0.05, -0.02), (rr - 0.05, 0.02), (0.42, 0.02), (0.30, 0.10), (0.17, 0.14)]
    parts.append(lathe(name + "_disc", disc, m=RED, seg=40, rot=(0, PI / 2, 0)))
    for k in range(8):
        a = 2 * PI * k / 8
        parts.append(cyl(name + "_hole", 0.05, 0.05, loc=(0.0, math.cos(a) * 0.36, math.sin(a) * 0.36), rot=(0, PI / 2, 0), m="frame_black", verts=12))
    parts.append(cyl(name + "_hub", 0.17, 0.12, loc=(0.16, 0, 0), rot=(0, PI / 2, 0), m=RED, verts=24))
    for k in range(10):
        a = 2 * PI * k / 10
        parts.append(cyl(name + "_nut", 0.018, 0.05, loc=(0.2, math.cos(a) * 0.13, math.sin(a) * 0.13), rot=(0, PI / 2, 0), m="metal_gray", verts=6))
    parts.append(cyl(name + "_valve", 0.008, 0.06, loc=(0.12, 0.42, 0.18), rot=(0, PI / 2, 0), m="metal_gray", verts=6))
    o = merge(parts, name, par=par)
    finish(o, 40)
    o.location = (x_off, 0, 0)
    if mirror:
        o.rotation_euler = (0, 0, PI)
    return o


def wheel(name, par, x, y):
    pv = empty(name, loc=(x, y, TIRE_R), parent=par)
    s = 1 if x > 0 else -1
    ag_tire(name + "_in", pv, -s * DUAL, s < 0)
    ag_tire(name + "_out", pv, s * DUAL, s < 0)
    return pv


# ------------------------------------------------------------------------------------------------ helpers
def rrect(hw, zb, zt, rc, y, n_arc=5, x0=0.0):
    """Rounded-top rectangle section (CCW seen from +Y) at plane y."""
    rc = min(rc, hw * 0.95, (zt - zb) * 0.95)
    pts = [(x0 + hw, zb)]
    for i in range(n_arc + 1):
        a = (PI / 2) * i / n_arc
        pts.append((x0 + hw - rc + rc * math.cos(a), zt - rc + rc * math.sin(a)))
    for i in range(n_arc + 1):
        a = PI / 2 + (PI / 2) * i / n_arc
        pts.append((x0 - hw + rc + rc * math.cos(a), zt - rc + rc * math.sin(a)))
    pts.append((x0 - hw, zb))
    return [(px, y, pz) for (px, pz) in pts]


def arc_slab(name, cx, cy, cz, R, x0, x1, a0, a1, t, m, n=14):
    """Curved fender: a cylindrical shell sector about an X-parallel axis through (cy, cz)."""
    bm = bmesh.new()
    rows = []
    for i in range(n + 1):
        a = math.radians(a0 + (a1 - a0) * i / n)
        ring = []
        for (rad, xx) in ((R, x0), (R, x1), (R + t, x1), (R + t, x0)):
            ring.append(bm.verts.new((xx, cy + rad * math.cos(a), cz + rad * math.sin(a))))
        rows.append(ring)
    for i in range(n):
        A, B = rows[i], rows[i + 1]
        for j in range(4):
            k = (j + 1) % 4
            bm.faces.new((A[j], A[k], B[k], B[j]))
    bm.faces.new(rows[0])
    bm.faces.new(list(reversed(rows[-1])))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return kit.from_bmesh(name, bm, (m,))


def tube(L, name, pts, r, m, seg=10):
    L.append(kit.tube(name, pts, r, m=m, seg=seg))


# ------------------------------------------------------------------------------------------------ front frame
def front_frame(F, Lamps, ff):
    # frame, axle, differential, planetary hubs
    for sx in (-1, 1):
        F.append(box("ff_rail", (0.15, 3.25, 0.45), loc=(sx * 0.38, 1.75, 1.18), m=DARK, bevel=0.02))
    F.append(box("ff_nosecast", (0.95, 0.35, 0.55), loc=(0, 3.45, 1.18), m=DARK, bevel=0.03))
    F.append(cyl("f_axle", 0.17, 1.4, loc=(0, FA, TIRE_R), rot=(0, PI / 2, 0), m=DARK, verts=16))
    F.append(kit.sphere("f_diff", 0.36, loc=(0, FA, TIRE_R - 0.02), m=DARK, segs=20, rings=12, scale=(0.9, 0.75, 0.85)))
    for sx in (-1, 1):
        F.append(cyl("f_planetary", 0.24, 0.22, loc=(sx * 0.62, FA, TIRE_R), rot=(0, PI / 2, 0), m=DARK, verts=20))
        F.append(box("f_axle_pad", (0.3, 0.5, 0.18), loc=(sx * 0.38, FA, TIRE_R + 0.22), m=DARK))
    # engine block, sump and turbo visible under the hood skirt
    F.append(box("engine", (0.82, 2.25, 0.7), loc=(0, 1.55, 1.85), m="metal_gray", bevel=0.05))
    F.append(box("sump", (0.55, 1.6, 0.25), loc=(0, 1.45, 1.42), m=DARK, bevel=0.03))
    for k in range(6):
        F.append(cyl("injector", 0.03, 0.12, loc=(0.18, 0.75 + k * 0.32, 2.25), m="metal_gray", verts=8))
    # hood: lofted sections, sloping top, rounded bull nose
    secs = []
    ys = [0.52, 0.9, 1.4, 1.9, 2.4, 2.8, 3.05]
    ztop = lambda y: 2.80 - (y - 0.52) * 0.115
    for y in ys:
        secs.append(rrect(0.63, 1.62, ztop(y), 0.2, y))
    for i in range(1, 7):
        th = (PI / 2) * i / 6
        sh = 1 - math.cos(th)
        y = 3.05 + 0.42 * math.sin(th)
        secs.append(rrect(0.63 - 0.16 * sh, 1.62 + 0.1 * sh, ztop(3.05) - 0.24 * sh, 0.2 - 0.06 * sh, y))
    F.append(loft("hood", secs, m=RED))
    # hood details: decal bands, side intake screens, top intake grille, seam
    for sx in (-1, 1):
        F.append(box("hood_band", (0.008, 2.2, 0.16), loc=(sx * 0.634, 1.65, 2.28), rot=(-0.115, 0, 0), m="frame_black"))
        F.append(box("hood_pin", (0.008, 2.2, 0.025), loc=(sx * 0.634, 1.65, 2.17), rot=(-0.115, 0, 0), m="plastic_white"))
        F.append(box("screen_frame", (0.03, 0.95, 0.52), loc=(sx * 0.632, 2.55, 1.95), m="frame_black", bevel=0.01))
        for k in range(9):
            F.append(box("screen_slat", (0.025, 0.9, 0.025), loc=(sx * 0.645, 2.55, 1.73 + k * 0.055), rot=(0, sx * 0.6, 0), m="metal_gray"))
        F.append(box("hood_skirt", (0.05, 2.5, 0.12), loc=(sx * 0.6, 1.8, 1.6), m=DARK))
        F.append(box("hood_step", (0.25, 0.4, 0.04), loc=(sx * 0.72, 0.85, 1.6), m="metal_gray"))
    F.append(box("top_intake", (0.7, 0.55, 0.02), loc=(0, 2.85, ztop(2.85) + 0.005), rot=(-0.115, 0, 0), m="frame_black"))
    for k in range(10):
        F.append(box("top_slat", (0.66, 0.025, 0.02), loc=(0, 2.62 + k * 0.05, ztop(2.62 + k * 0.05) + 0.012), rot=(-0.115, 0, 0), m=DARK))
    # nose grille, badge plate, lamps (headlamps in the nose shoulders, work lamps lower)
    F.append(box("nose_grille", (0.86, 0.04, 0.55), loc=(0, 3.465, 1.98), m="frame_black", bevel=0.02))
    for k in range(7):
        F.append(box("nose_bar", (0.82, 0.05, 0.022), loc=(0, 3.475, 1.76 + k * 0.075), m="metal_gray"))
    F.append(box("nose_badge", (0.24, 0.05, 0.08), loc=(0, 3.48, 2.33), m="chrome_dull", bevel=0.01))
    for sx in (-1, 1):
        for k, x in enumerate((0.3, 0.15)):
            F.append(box("hl_housing", (0.13, 0.07, 0.1), loc=(sx * x, 3.36, 2.47), rot=(-0.4, 0, 0), m="frame_black", bevel=0.01))
            Lamps.append(("head", box("hl_lens", (0.11, 0.02, 0.08), loc=(sx * x, 3.395, 2.475), rot=(-0.4, 0, 0), m="lamp_lens")))
        F.append(box("work_housing", (0.16, 0.08, 0.12), loc=(sx * 0.5, 3.3, 1.75), m="frame_black", bevel=0.01))
        Lamps.append(("head", box("work_lens", (0.13, 0.02, 0.09), loc=(sx * 0.5, 3.345, 1.75), m="lamp_lens")))
        empty(f"light_head_{'L' if sx < 0 else 'R'}", loc=(sx * 0.3, 3.45, 2.45), parent=ff)
        F.append(box("flasher", (0.1, 0.08, 0.07), loc=(sx * 0.6, 3.15, 2.45), m="lamp_lens_amber", bevel=0.01))
    # suitcase weights on the front bracket
    F.append(box("weight_bracket", (1.05, 0.25, 0.18), loc=(0, 3.62, 1.43), m=DARK, bevel=0.02))
    for k in range(10):
        x = -0.45 + k * 0.1
        F.append(box("suitcase", (0.085, 0.42, 0.56), loc=(x, 3.75, 1.12), m="steel_painted_gray", bevel=0.012))
        F.append(box("suitcase_handle", (0.04, 0.16, 0.05), loc=(x, 3.98, 1.32), m="steel_painted_gray"))
    F.append(cyl("weight_rod", 0.025, 1.12, loc=(0, 3.75, 1.36), rot=(0, PI / 2, 0), m="metal_gray", verts=8))
    # front fenders over the inner duals, on brackets
    for sx in (-1, 1):
        F.append(arc_slab("f_fender", 0, FA, TIRE_R, 1.12, sx * (TR - DUAL - 0.32), sx * (TR - DUAL + 0.32), 35, 115, 0.012, RED))
        F.append(seg_box("f_fender_arm", (sx * 0.5, FA - 0.3, 1.6), (sx * 0.95, FA - 0.35, 2.08), 0.06, 0.06, DARK))
    # exhaust (left) and intake (right) mounted on the hood rear
    F.append(cyl("muffler", 0.16, 0.95, loc=(-0.68, 0.62, 3.1), m="metal_dark", verts=18))
    F.append(cyl("muffler_shield", 0.17, 0.7, loc=(-0.68, 0.62, 3.1), m="steel_painted_gray", verts=18, cap=False))
    for z in (2.75, 3.45):
        F.append(kit.torus("muffler_band", 0.17, 0.012, loc=(-0.68, 0.62, z), m="metal_gray", seg=18, rseg=4))
    tube(F, "stack", [(-0.68, 0.62, 3.5), (-0.68, 0.62, 4.05), (-0.68, 0.56, 4.16), (-0.68, 0.42, 4.2), (-0.68, 0.32, 4.14)], 0.075, "metal_dark", seg=12)
    tube(F, "intake", [(0.68, 0.62, 2.62), (0.68, 0.62, 3.75)], 0.08, "steel_painted_gray", seg=12)
    for sx in (-1, 1):   # mounting brackets from the hood shoulders
        F.append(box("stack_bracket", (0.3, 0.16, 0.05), loc=(sx * 0.6, 0.62, 2.62), m=DARK))
        F.append(seg_box("stack_stay", (sx * 0.55, 0.62, 2.62), (sx * 0.66, 0.62, 3.3), 0.04, 0.03, DARK))
    F.append(cyl("precleaner", 0.14, 0.2, loc=(0.68, 0.62, 3.85), m="frame_black", verts=16))
    F.append(cyl("precleaner_cap", 0.17, 0.06, r2=0.08, loc=(0.68, 0.62, 3.98), m="frame_black", verts=16))
    # steering cylinders across the articulation
    for sx in (-1, 1):
        F.append(seg_box("steer_cyl", (sx * 0.5, 0.75, 1.25), (sx * 0.5, -0.05, 1.25), 0.12, 0.12, "metal_gray"))
        F.append(seg_box("steer_rod", (sx * 0.5, -0.05, 1.25), (sx * 0.52, -0.55, 1.25), 0.05, 0.05, "chrome_dull"))
    tube(F, "hoses_f", [(-0.25, 0.4, 1.5), (-0.3, 0.0, 1.35), (-0.25, -0.4, 1.5)], 0.025, "rubber_black", seg=6)


# ------------------------------------------------------------------------------------------------ rear frame + cab
def rear_frame(P, Lamps, root):
    for sx in (-1, 1):
        P.append(box("rf_rail", (0.15, 3.1, 0.45), loc=(sx * 0.4, -1.75, 1.18), m=DARK, bevel=0.02))
    # articulation joint: hitch plates and vertical pins
    P.append(box("joint_plate", (0.9, 0.5, 0.1), loc=(0, 0.0, 1.5), m=DARK, bevel=0.02))
    P.append(box("joint_plate", (0.9, 0.5, 0.1), loc=(0, 0.0, 0.9), m=DARK, bevel=0.02))
    for z in (1.5, 0.9):
        P.append(cyl("joint_pin", 0.12, 0.2, loc=(0, 0.0, z), m="metal_silver", verts=16))
    P.append(cyl("r_axle", 0.17, 1.4, loc=(0, RA, TIRE_R), rot=(0, PI / 2, 0), m=DARK, verts=16))
    P.append(kit.sphere("r_diff", 0.38, loc=(0, RA, TIRE_R - 0.02), m=DARK, segs=20, rings=12, scale=(0.9, 0.8, 0.85)))
    for sx in (-1, 1):
        P.append(cyl("r_planetary", 0.24, 0.22, loc=(sx * 0.62, RA, TIRE_R), rot=(0, PI / 2, 0), m=DARK, verts=20))
    P.append(box("transmission", (0.75, 1.6, 0.7), loc=(0, -0.95, 1.4), m="metal_gray", bevel=0.05))
    # saddle fuel tanks under the platform
    for sx in (-1, 1):
        P.append(box("fuel_tank", (0.6, 1.05, 0.62), loc=(sx * 0.8, -0.3, 1.55), m=RED, bevel=0.08, segs=3))
        P.append(cyl("fuel_cap", 0.07, 0.04, loc=(sx * 0.9, 0.0, 1.88), m="frame_black", verts=12))
    # cab platform with tread plate, rear fenders
    P.append(box("platform", (2.1, 2.0, 0.08), loc=(0, -0.48, 2.02), m="steel_painted_gray"))
    P.append(box("platform_edge", (2.12, 0.04, 0.18), loc=(0, 0.53, 1.95), m=DARK))
    for sx in (-1, 1):
        P.append(arc_slab("r_fender", 0, RA, TIRE_R, 1.13, sx * (TR - DUAL - 0.34), sx * (TR - DUAL + 0.34), 55, 150, 0.014, RED))
        P.append(box("r_fender_lamp", (0.12, 0.08, 0.1), loc=(sx * 1.0, RA - 0.95, 1.85), m="lamp_lens_amber", bevel=0.01))
        Lamps.append(("tail", box("tail_lamp", (0.1, 0.03, 0.08), loc=(sx * 0.8, -3.36, 1.65), m="lamp_lens_red")))
        P.append(box("tail_housing", (0.14, 0.06, 0.12), loc=(sx * 0.8, -3.33, 1.65), m="frame_black"))
    # access ladder (left), handrails
    lx = -1.18
    for k, z in enumerate((0.62, 1.0, 1.38, 1.76)):
        P.append(box("ladder_step", (0.34, 0.24, 0.035), loc=(lx + 0.02 * k, -0.45, z), m="steel_painted_gray"))
    for y in (-0.6, -0.3):
        P.append(seg_box("ladder_rail", (lx - 0.1, y, 0.45), (lx + 0.12, y, 2.0), 0.04, 0.04, DARK))
    tube(P, "handrail", [(-1.08, 0.4, 2.06), (-1.08, 0.4, 3.0), (-1.08, -0.25, 3.0), (-1.08, -0.25, 2.06)], 0.022, "steel_painted_yellow", seg=8)
    tube(P, "handrail2", [(-1.25, -0.2, 1.0), (-1.3, -0.25, 1.9), (-1.12, -0.25, 2.3)], 0.02, "steel_painted_yellow", seg=8)
    # cab
    cz0, cz1 = 2.08, 3.48
    fy, ry = 0.32, -1.3
    posts = [((-0.84, fy, cz0), (-0.81, fy - 0.12, cz1)), ((0.84, fy, cz0), (0.81, fy - 0.12, cz1)),
             ((-0.84, ry, cz0), (-0.84, ry, cz1)), ((0.84, ry, cz0), (0.84, ry, cz1))]
    for (a, b) in posts:
        P.append(seg_box("cab_post", a, b, 0.075, 0.075, "frame_black"))
    P.append(box("cab_lower_f", (1.68, 0.06, 0.3), loc=(0, fy + 0.01, cz0 + 0.15), m="frame_black"))
    P.append(box("cab_lower_r", (1.68, 0.06, 0.28), loc=(0, ry, cz0 + 0.14), m="frame_black"))
    for sx in (-1, 1):
        P.append(box("cab_lower_s", (0.06, 1.6, 0.18), loc=(sx * 0.84, (fy + ry) / 2, cz0 + 0.09), m="frame_black"))
    # glass (front raked, sides, rear), door frame on the left
    P.append(obox("cab_glass_f", (-0.80, fy, cz0 + 0.3), (1, 0, 0), (0, -0.12, cz1 - cz0 - 0.3), (0, 1, 0), 0, 1.6, 0, 1, -0.006, 0.006, "glass_dark"))
    P.append(box("cab_glass_r", (1.6, 0.012, cz1 - cz0 - 0.3), loc=(0, ry, (cz0 + 0.28 + cz1) / 2), m="glass_dark"))
    for sx in (-1, 1):
        P.append(obox("cab_glass_s", (sx * 0.84, ry + 0.04, cz0 + 0.18), (0, 1, 0), (0, 0, 1), (1, 0, 0), 0, fy - ry - 0.1, 0, cz1 - cz0 - 0.2, -0.006, 0.006, "glass_dark"))
    P.append(seg_box("door_frame", (-0.85, -0.45, cz0 + 0.18), (-0.85, -0.45, cz1), 0.03, 0.03, "frame_black"))
    P.append(box("door_handle", (0.03, 0.18, 0.04), loc=(-0.87, -0.35, 2.75), m="chrome_dull"))
    P.append(box("door_latch", (0.04, 0.06, 0.1), loc=(-0.87, -0.42, 2.6), m="frame_black"))
    # roof: red shell, dark visor overhang, GPS dome, beacon, work lights, wiper
    roof = loft("cab_roof", [rrect(0.98, cz1, cz1 + 0.2, 0.1, ry - 0.12), rrect(1.0, cz1, cz1 + 0.26, 0.12, (ry + fy) / 2), rrect(0.98, cz1, cz1 + 0.22, 0.1, fy + 0.18)], m=RED)
    P.append(roof)
    P.append(box("roof_liner", (1.9, 1.85, 0.03), loc=(0, (ry + fy) / 2 + 0.03, cz1 + 0.005), m=DARK))
    P.append(obox("visor", (-0.98, fy + 0.18, cz1 + 0.02), (1, 0, 0), (0, 0.22, -0.06), (0, 0, 1), 0, 1.96, 0, 1, 0, 0.05, "frame_black"))
    P.append(kit.lathe("gps_dome", [(0.0, 0.0), (0.12, 0.0), (0.12, 0.04), (0.09, 0.09), (0.0, 0.11)], m="plastic_white", seg=20, loc=(0, -0.2, cz1 + 0.25)))
    P.append(kit.lathe("beacon", [(0.0, 0.0), (0.07, 0.0), (0.07, 0.05), (0.06, 0.13), (0.0, 0.15)], m="lamp_lens_amber", seg=16, loc=(-0.6, -1.0, cz1 + 0.22)))
    for x in (-0.6, -0.25, 0.25, 0.6):
        P.append(box("roof_work", (0.16, 0.1, 0.12), loc=(x, fy + 0.3, cz1 + 0.12), rot=(-0.25, 0, 0), m="frame_black", bevel=0.01))
        Lamps.append(("head", box("roof_work_lens", (0.13, 0.02, 0.09), loc=(x, fy + 0.355, cz1 + 0.112), rot=(-0.25, 0, 0), m="lamp_lens")))
    for x in (-0.55, 0.55):
        P.append(box("rear_work", (0.16, 0.1, 0.12), loc=(x, ry - 0.2, cz1 + 0.12), m="frame_black", bevel=0.01))
        P.append(box("rear_work_lens", (0.13, 0.02, 0.09), loc=(x, ry - 0.255, cz1 + 0.12), m="lamp_lens"))
    P.append(seg_box("wiper", (0.0, fy + 0.01, cz0 + 0.35), (-0.45, fy - 0.06, cz0 + 1.15), 0.015, 0.012, "frame_black"))
    # telescopic mirrors
    for sx in (-1, 1):
        P.append(seg_box("mirror_arm", (sx * 0.84, fy - 0.05, 3.2), (sx * 1.35, fy + 0.15, 3.05), 0.035, 0.035, "frame_black"))
        P.append(box("mirror_head", (0.06, 0.24, 0.36), loc=(sx * 1.38, fy + 0.16, 3.0), rot=(0, 0, -sx * 0.25), m="frame_black", bevel=0.015))
        P.append(box("mirror_glass", (0.006, 0.21, 0.32), loc=(sx * 1.35, fy + 0.15, 3.0), rot=(0, 0, -sx * 0.25), m="glass_dark"))
    # SMV emblem on the cab rear
    P.append(prism("smv", kit.ccw([(-0.18, 0.0), (0.18, 0.0), (0.0, 0.31)]), 0, 0.01, m="lamp_lens_amber", loc=(0.55, ry - 0.02, 2.4), rot=(PI / 2, 0, 0)))
    # rear hitch: 3-point linkage, drawbar, couplers, hose bracket
    for sx in (-1, 1):
        P.append(seg_box("lower_link", (sx * 0.35, -2.7, 0.85), (sx * 0.45, -3.65, 0.7), 0.07, 0.1, "steel_painted_yellow"))
        P.append(seg_box("lift_arm", (sx * 0.38, -2.9, 1.65), (sx * 0.4, -3.45, 1.55), 0.07, 0.1, DARK))
        P.append(seg_box("lift_rod", (sx * 0.4, -3.4, 1.55), (sx * 0.42, -3.4, 0.82), 0.04, 0.04, "steel_painted_yellow"))
        P.append(seg_box("lift_cyl", (sx * 0.5, -2.6, 0.95), (sx * 0.45, -3.2, 1.6), 0.1, 0.1, "metal_gray"))
    P.append(seg_box("top_link", (0, -3.05, 1.6), (0, -3.6, 1.42), 0.08, 0.08, "steel_painted_yellow"))
    P.append(box("drawbar", (0.14, 1.2, 0.06), loc=(0, -3.35, 0.62), m="steel_painted_gray"))
    P.append(cyl("drawbar_pin", 0.03, 0.2, loc=(0, -3.85, 0.65), m="metal_silver", verts=10))
    P.append(box("coupler_plate", (0.9, 0.05, 0.22), loc=(0, -3.3, 1.42), m=DARK))
    cols = ["warning_red", "warning_red", "pipe_blue", "pipe_blue", "steel_painted_yellow", "steel_painted_yellow", "plant_green", "plant_green"]
    for k in range(8):
        x = -0.37 + k * 0.105
        P.append(cyl("coupler", 0.03, 0.08, loc=(x, -3.35, 1.42), rot=(PI / 2, 0, 0), m="metal_silver", verts=10))
        P.append(cyl("coupler_cap", 0.032, 0.02, loc=(x, -3.395, 1.42), rot=(PI / 2, 0, 0), m=cols[k], verts=10))
    P.append(seg_box("hose_bracket", (0.55, -3.0, 2.0), (1.6, -3.05, 2.05), 0.06, 0.06, DARK))
    tube(P, "hose", [(0.2, -3.38, 1.42), (0.5, -3.5, 1.9), (1.0, -3.2, 2.08), (1.55, -3.1, 2.06)], 0.018, "rubber_black", seg=6)
    # under-platform battery box and tool box
    P.append(box("battery_box", (0.4, 0.5, 0.35), loc=(0.85, -1.05, 1.15), m="steel_painted_gray", bevel=0.02))


def cab_interior(P, root):
    cz0 = 2.08
    P.append(box("cab_floor", (1.6, 1.55, 0.03), loc=(0, -0.48, cz0 + 0.015), m="rubber_mat"))
    # air-suspension seat
    P.append(box("seat_base", (0.42, 0.4, 0.22), loc=(0, -0.75, cz0 + 0.25), m=DARK, bevel=0.03))
    P.append(box("seat_cushion", (0.55, 0.52, 0.13), loc=(0, -0.72, cz0 + 0.45), m="fabric_sofa", bevel=0.04, segs=3))
    P.append(box("seat_back", (0.55, 0.14, 0.72), loc=(0, -1.0, cz0 + 0.86), rot=(-0.15, 0, 0), m="fabric_sofa", bevel=0.05, segs=3))
    P.append(box("headrest", (0.32, 0.1, 0.18), loc=(0, -1.07, cz0 + 1.33), m="fabric_sofa", bevel=0.04))
    for sx in (-1, 1):
        P.append(box("armrest", (0.08, 0.38, 0.06), loc=(sx * 0.33, -0.72, cz0 + 0.68), m=DARK, bevel=0.02))
    # right-hand console with joystick, monitor, buttons
    P.append(box("console", (0.24, 0.85, 0.5), loc=(0.48, -0.6, cz0 + 0.45), m=DARK, bevel=0.03))
    P.append(seg_box("joystick", (0.45, -0.45, cz0 + 0.7), (0.45, -0.42, cz0 + 0.86), 0.035, 0.035, "plastic_dark"))
    for k in range(8):
        P.append(box("cbutton", (0.03, 0.03, 0.01), loc=(0.42 + (k % 2) * 0.06, -0.62 - (k // 2) * 0.06, cz0 + 0.705), m=["warning_red", "plastic_white", "steel_painted_yellow", "plastic_dark"][k % 4]))
    P.append(seg_box("monitor_arm", (0.6, -0.2, cz0 + 0.7), (0.62, 0.0, cz0 + 1.05), 0.03, 0.03, DARK))
    P.append(box("monitor", (0.3, 0.04, 0.22), loc=(0.6, 0.02, cz0 + 1.12), rot=(0.2, 0, -0.4), m="plastic_dark", bevel=0.01))
    P.append(box("monitor_screen", (0.26, 0.005, 0.17), loc=(0.592, 0.0, cz0 + 1.12), rot=(0.2, 0, -0.4), m="emit_screen"))
    # steering pod, pedals, trainer seat
    P.append(box("steer_pod", (0.36, 0.22, 0.55), loc=(0, 0.12, cz0 + 0.3), rot=(0.25, 0, 0), m=DARK, bevel=0.04))
    P.append(box("pod_display", (0.2, 0.01, 0.1), loc=(0, 0.0, cz0 + 0.62), rot=(-0.5, 0, 0), m="emit_screen_amber"))
    for x in (-0.12, 0.12, 0.25):
        P.append(box("pedal", (0.08, 0.03, 0.14), loc=(x, 0.18, cz0 + 0.12), rot=(0.6, 0, 0), m="rubber_black"))
    P.append(box("trainer_seat", (0.32, 0.32, 0.06), loc=(-0.6, -0.95, cz0 + 0.5), m="fabric_sofa", bevel=0.02))
    # steering wheel (local Z = column axis)
    phi = 0.6435
    sw = empty("steer", loc=(0, -0.12, cz0 + 0.82), rot=(phi, 0, 0), parent=root)
    swp = [kit.torus("sw_rim", 0.19, 0.016, m="plastic_dark", seg=36, rseg=8)]
    for a in (PI / 2 + 0.5, PI / 2 - 0.5 + PI, -PI / 2):
        swp.append(seg_box("sw_spoke", (0, 0, 0.02), (math.cos(a) * 0.18, math.sin(a) * 0.18, 0.0), 0.03, 0.012, "plastic_dark"))
    swp.append(cyl("sw_hub", 0.06, 0.06, loc=(0, 0, 0.03), m="plastic_dark", verts=20))
    swp.append(cyl("sw_knob", 0.02, 0.08, loc=(0.16, -0.08, 0.05), m="plastic_dark", verts=8))
    swm = merge(swp, "steer_mesh", par=sw)
    swm.location = (0, 0, 0)
    finish(swm, 40)
    col = V((0, math.sin(phi), -math.cos(phi)))
    c0 = V((0, -0.12, cz0 + 0.82))
    P.append(seg_box("column", c0 + col * 0.04, c0 + col * 0.36, 0.08, 0.08, DARK))


def tractor(preview=True):
    kit.reset()
    random.seed(4)
    root = empty("Tractor", vehicle="tractor")
    ff = empty("front_frame", loc=(0, 0, 0), parent=root)
    P, F, Lr, Lf = [], [], [], []
    front_frame(F, Lf, ff)
    rear_frame(P, Lr, root)
    cab_interior(P, root)
    rm = merge(P, "rear_body", par=root)
    finish(rm, 35)
    fm = merge(F, "front_body", par=ff)
    finish(fm, 35)
    for (lst, par, tag) in ((Lf, ff, "f"), (Lr, root, "r")):
        for grp in ("head", "tail"):
            objs = [o for (g, o) in lst if g == grp]
            if objs:
                lm = merge(objs, f"lamps_{grp}_{tag}", par=par, lamp=grp)
                finish(lm, 30)
    for (nm, x, y, par) in (("FL", -TR, FA, ff), ("FR", TR, FA, ff), ("RL", -TR, RA, root), ("RR", TR, RA, root)):
        wheel(f"wheel_{nm}", par, x, y)
    empty("eye_driver", loc=(0, -0.68, 3.2), parent=root)
    empty("exit_L", loc=(-2.4, -0.4, 0.0), parent=root)
    empty("exit_R", loc=(2.4, -0.4, 0.0), parent=root)
    box("door_hit", (0.3, 1.0, 1.6), loc=(-0.95, -0.5, 2.7), m="frame_black", par=root, interact="cardoor", iid="tractor_door").hide_render = True
    kit.export_glb(os.path.join(kit.out_dir(), "tractor.glb"), root)
    if preview:
        pd = kit.preview_dir()
        w = (0.62, 0.66, 0.7)
        kit.preview(os.path.join(pd, "tractor.png"), (-7.5, 7.0, 2.6), (0, 0.2, 1.9), lens=35, samples=24, world=w, sun=(0.4, 0.6, 0.7))
        kit.preview(os.path.join(pd, "tractor_rear.png"), (6.5, -8.0, 3.5), (0, -0.8, 1.7), lens=35, samples=20, world=w, sun=(0.4, 0.6, 0.7))
        kit.preview(os.path.join(pd, "tractor_cab.png"), (0, -0.68, 3.2), (0.0, 3.0, 2.3), lens=22, samples=16, world=w, sun=(0.4, 0.6, 0.7))


if __name__ == "__main__":
    tractor(preview="--nopreview" not in sys.argv)
