"""
Farm machinery (reference image 1-2): old pickup truck, articulated 4WD tractor with duals, combine harvester,
grain cart. All original designs (no manufacturer branding). Blender +Y = vehicle forward.

Node conventions (runtime): wheel_FL/FR/RL/RR (+ wheel_*_dual), steer (steering wheel), door_L/door_R (hinge empties),
front_frame (tractor articulation), reel (combine reel), auger (combine unloading auger pivot), screen_gps,
eye_driver, light_head_L/R, light_tail_L/R, exit_L/exit_R.
"""
import sys, os, math, random
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "lib"))
import kit
from kit import V, box, cyl, prism, M, empty, merge, finish, set_props, loft, lathe
import bmesh

PI = math.pi


def tire(name, r, w, rim_r, par=None, lugs=True, m_rim="steel_painted_white", dual=False):
    """Tire + rim along local X axis (rolls about X)."""
    prof = [(rim_r * 0.98, -w / 2), (r * 0.9, -w / 2 - 0.01), (r * 0.98, -w / 2 * 0.85), (r, -w / 4), (r, w / 4), (r * 0.98, w / 2 * 0.85), (r * 0.9, w / 2 + 0.01), (rim_r * 0.98, w / 2)]
    t = lathe(name + "_tire", prof, m="tire_rubber", seg=36, rot=(0, PI / 2, 0))
    parts = [t]
    if lugs:
        n = int(2 * PI * r / 0.22)
        for k in range(n):
            a = 2 * PI * k / n
            for side in (-1, 1):
                lug = box(name + "_lug", (w * 0.45, 0.08, 0.05), loc=(side * w * 0.24, math.cos(a) * (r + 0.015), math.sin(a) * (r + 0.015)),
                          rot=(a + PI / 2, 0, side * 0.45), m="tire_rubber")
                parts.append(lug)
    rim = lathe(name + "_rim", [(0.0, -w * 0.3), (rim_r * 0.35, -w * 0.32), (rim_r * 0.4, -w * 0.18), (rim_r, -w * 0.35), (rim_r * 1.02, -w * 0.45), (rim_r * 1.02, w * 0.4), (rim_r * 0.95, w * 0.42)], m=m_rim, seg=24, rot=(0, PI / 2, 0))
    parts.append(rim)
    for k in range(8):
        a = 2 * PI * k / 8
        parts.append(cyl(name + "_nut", 0.02, 0.04, loc=(-w * 0.33, math.cos(a) * rim_r * 0.25, math.sin(a) * rim_r * 0.25), rot=(0, PI / 2, 0), m="metal_dark", verts=6))
    o = merge(parts, name, par=par)
    finish(o, 40)
    return o


def wheel(name, par, loc, r, w, rim_r, dual=False, lugs=True, rim_m="steel_painted_white", side=1):
    pv = empty(name, loc=loc, parent=par)
    if dual:
        a = tire(name + "_in", r, w, rim_r, par=pv, lugs=lugs, m_rim=rim_m)
        a.location = (-side * (w / 2 + 0.03), 0, 0)
        b = tire(name + "_out", r, w, rim_r, par=pv, lugs=lugs, m_rim=rim_m)
        b.location = (side * (w / 2 + 0.03), 0, 0)
    else:
        a = tire(name + "_t", r, w, rim_r, par=pv, lugs=lugs, m_rim=rim_m)
        if side < 0:
            a.rotation_euler = (0, 0, PI)
    return pv


# ============================================================================================ pickup
def pickup():
    kit.reset()
    root = empty("Pickup", vehicle="car")
    P = []
    # body side profile (Y along length, Z up), extruded across X
    L0, L1 = -2.75, 2.65   # rear bumper .. front bumper
    prof = [(L0 + 0.05, 0.45), (L0 + 0.05, 1.05), (-0.65, 1.05), (-0.62, 1.12), (-0.55, 1.82), (0.55, 1.82), (1.25, 1.18), (L1 - 0.1, 1.12), (L1, 0.95), (L1, 0.45)]
    body = kit.prism_yz("body", kit.ccw(prof), -0.95, 0.95, m="car_paint_blue")
    kit.add_bevel(body, 0.05, 3, 35)
    kit.bake(body)
    # cut the bed tub, wheel arches, cab windows
    bed = box("bedcut", (1.78, 2.0, 0.7), loc=(0, L0 + 1.1, 1.25), m="car_paint_blue")
    arches = []
    for y in (-1.55, 1.75):
        for sx in (-1, 1):
            arches.append(cyl("arch", 0.47, 0.5, loc=(sx * 0.95, y, 0.42), rot=(0, PI / 2, 0), m="plastic_dark", verts=32))
    kit.boolean(body, [bed] + arches)
    # window cutters (side, rear, windshield)
    wcut = [box("wside", (2.2, 1.0, 0.52), loc=(0, 0.05, 1.47), m="glass_dark"),
            box("wfront", (1.62, 0.5, 0.82), loc=(0, 0.92, 1.5), rot=(-0.83, 0, 0), m="glass_dark"),
            box("wrear", (1.5, 0.3, 0.5), loc=(0, -0.62, 1.48), m="glass_dark")]
    kit.boolean(body, wcut)
    finish(body, 35)
    body.parent = root
    # glass
    P.append(box("glass_side", (1.86, 1.0, 0.5), loc=(0, 0.05, 1.47), m="glass_dark"))
    ws = box("windshield", (1.66, 0.03, 0.86), loc=(0, 0.9, 1.5), rot=(-0.83, 0, 0), m="glass_dark")
    P.append(ws)
    P.append(box("rear_glass", (1.5, 0.03, 0.48), loc=(0, -0.63, 1.48), m="glass_dark"))
    # grille, lights, bumpers, mirrors
    P.append(box("grille", (1.3, 0.05, 0.42), loc=(0, L1 + 0.01, 0.92), m="chrome", bevel=0.01))
    for k in range(5):
        P.append(box("grille_bar", (1.24, 0.06, 0.025), loc=(0, L1 + 0.02, 0.76 + k * 0.08), m="plastic_dark"))
    for sx in (-1, 1):
        P.append(box("headlamp_rim", (0.32, 0.04, 0.2), loc=(sx * 0.8, L1 + 0.0, 0.93), m="chrome", bevel=0.01))
        P.append(box("tail", (0.08, 0.06, 0.3), loc=(sx * 0.93, L0 + 0.06, 0.9), m="warning_red"))
        P.append(box("mirror", (0.08, 0.18, 0.13), loc=(sx * 1.08, 0.75, 1.42), m="chrome", bevel=0.02))
        P.append(box("mirror_arm", (0.15, 0.03, 0.03), loc=(sx * 1.0, 0.75, 1.38), m="metal_dark"))
        P.append(box("running_board", (0.2, 1.4, 0.05), loc=(sx * 0.98, 0.0, 0.42), m="plastic_dark"))
    P.append(box("bumper_f", (2.0, 0.18, 0.22), loc=(0, L1 + 0.05, 0.55), m="chrome", bevel=0.03))
    P.append(box("bumper_r", (2.0, 0.18, 0.2), loc=(0, L0 - 0.02, 0.55), m="chrome", bevel=0.03))
    # bed interior + tailgate
    P.append(box("bed_floor", (1.75, 2.0, 0.04), loc=(0, L0 + 1.1, 0.9), m="metal_gray"))
    for k in range(6):
        P.append(box("bed_rib", (0.04, 2.0, 0.03), loc=(-0.75 + k * 0.3, L0 + 1.1, 0.93), m="metal_gray"))
    P.append(box("tailgate", (1.78, 0.06, 0.55), loc=(0, L0 + 0.1, 1.07), m="car_paint_blue", bevel=0.01))
    # bed clutter
    P.append(box("bed_crate", (0.6, 0.45, 0.4), loc=(0.4, L0 + 1.4, 1.12), m="wood_raw", bevel=0.01))
    P.append(cyl("bed_jerry", 0.12, 0.45, loc=(-0.5, L0 + 0.8, 1.15), m="farm_red", verts=10))
    # interior: bench seat, dash, steering wheel
    P.append(box("bench", (1.7, 0.55, 0.15), loc=(0, -0.2, 0.95), m="leather_brown", bevel=0.04))
    P.append(box("bench_back", (1.7, 0.15, 0.6), loc=(0, -0.5, 1.3), rot=(-0.15, 0, 0), m="leather_brown", bevel=0.05))
    P.append(box("dash", (1.8, 0.4, 0.25), loc=(0, 0.75, 1.15), m="plastic_dark", bevel=0.04))
    P.append(box("floor", (1.8, 1.5, 0.05), loc=(0, 0.2, 0.6), m="rubber_black"))
    P.append(box("gauges", (0.45, 0.02, 0.15), loc=(-0.4, 0.56, 1.25), m="plastic_dark"))
    for k in range(3):
        P.append(cyl("gauge", 0.05, 0.01, loc=(-0.55 + k * 0.15, 0.55, 1.25), rot=(PI / 2, 0, 0), m="emit_screen_amber", verts=12))
    st = merge(P, "pickup_details", par=root)
    finish(st, 35)
    # GPS unit (aftermarket) on the dash centre
    gps_mount = box("gps_mount", (0.24, 0.05, 0.16), loc=(0.05, 0.62, 1.38), rot=(-0.3, 0, 0), m="plastic_dark", par=root, bevel=0.01)
    import importlib
    sc = screen_plane("screen_gps", root, (0.05, 0.59, 1.385), (0.2, 0.13), rot=(-0.3, 0, PI))
    # steering wheel
    sw = empty("steer", loc=(-0.4, 0.42, 1.22), rot=(-0.4, 0, 0), parent=root)
    swp = [kit.torus("sw_rim", 0.19, 0.018, rot=(PI / 2, 0, 0), m="plastic_dark", seg=24, rseg=6)]
    for a in (0, 2 * PI / 3, 4 * PI / 3):
        swp.append(box("sw_spoke", (0.18, 0.02, 0.025), loc=(math.cos(a) * 0.09, 0, math.sin(a) * 0.09), rot=(0, -a, 0), m="plastic_dark"))
    swm = merge(swp, "steer_mesh", par=sw)
    swm.location = (0, 0, 0)
    finish(swm, 40)
    # doors (separate panels hinged at the front edge)
    for sx, nm in ((-1, "L"), (1, "R")):
        dv = empty(f"door_{nm}", loc=(sx * 0.96, 0.85, 0.5), parent=root, interact="cardoor", iid=f"pickup_door_{nm}", side=sx)
        dp = [box("door_panel", (0.06, 1.35, 0.6), loc=(0, -0.68, 0.32), m="car_paint_blue", bevel=0.02),
              box("door_glass", (0.02, 1.0, 0.48), loc=(-sx * 0.01, -0.62, 0.95), m="glass_dark"),
              box("door_handle", (0.03, 0.15, 0.04), loc=(sx * 0.03, -1.15, 0.5), m="chrome")]
        dm = merge(dp, f"door_{nm}_mesh", par=dv)
        dm.location = (0, 0, 0)
        finish(dm, 30)
        empty(f"exit_{nm}", loc=(sx * 1.8, 0.0, 0.0), parent=root)
    # wheels
    for (nm, x, y) in (("FL", -0.84, 1.75), ("FR", 0.84, 1.75), ("RL", -0.84, -1.55), ("RR", 0.84, -1.55)):
        wheel(f"wheel_{nm}", root, (x, y, 0.4), 0.4, 0.27, 0.24, lugs=False, rim_m="steel_painted_white", side=-1 if x < 0 else 1)
    empty("eye_driver", loc=(-0.4, -0.1, 1.55), parent=root)
    for sx, nm in ((-1, "L"), (1, "R")):
        empty(f"light_head_{nm}", loc=(sx * 0.8, L1 + 0.05, 0.93), parent=root)
        empty(f"light_tail_{nm}", loc=(sx * 0.93, L0 - 0.02, 0.9), parent=root)
        L = box(f"lampE_head_{nm}", (0.26, 0.02, 0.15), loc=(sx * 0.8, L1 + 0.03, 0.93), m="emit_white", par=root, lampmesh=1, group="head")
    kit.export_glb(os.path.join(kit.out_dir(), "pickup.glb"), root)
    kit.preview(os.path.join(kit.preview_dir(), "pickup.png"), (5.5, 6, 2.4), (0, 0, 0.9), lens=35, samples=16, world=(0.75, 0.74, 0.65))


def screen_plane(name, par, loc, size, rot=(0, 0, 0), m="emit_screen"):
    w, h = size
    bm = bmesh.new()
    a = bm.verts.new((-w / 2, 0, -h / 2)); b = bm.verts.new((w / 2, 0, -h / 2))
    c = bm.verts.new((w / 2, 0, h / 2)); d = bm.verts.new((-w / 2, 0, h / 2))
    f = bm.faces.new((a, b, c, d))
    uvl = bm.loops.layers.uv.new("UVMap")
    for loop, uv in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
        loop[uvl].uv = uv
    o = kit.from_bmesh(name, bm, (m,), loc=loc, rot=rot, par=par)
    o["screen"] = 1
    o["sw"] = w
    o["sh"] = h
    return o


# ============================================================================================ tractor
def tractor():
    kit.reset()
    root = empty("Tractor", vehicle="tractor")
    P, F = [], []  # rear frame parts, front frame parts
    ff = empty("front_frame", loc=(0, 0.1, 0), parent=root)   # articulation joint at y=0.1
    # rear frame: cab + rear fenders + hitch + fuel tanks
    P.append(box("rear_chassis", (1.3, 2.6, 0.6), loc=(0, -1.3, 1.2), m="metal_dark", bevel=0.04))
    P.append(box("cab_base", (1.9, 1.8, 0.35), loc=(0, -1.0, 1.85), m="farm_red", bevel=0.05))
    # cab: frame pillars + glass box + roof
    cab_z0, cab_z1 = 2.02, 3.55
    for sx in (-0.88, 0.88):
        for sy in (-1.82, -0.2):
            P.append(box("pillar", (0.08, 0.08, cab_z1 - cab_z0), loc=(sx, sy, (cab_z0 + cab_z1) / 2), m="metal_dark"))
    P.append(box("cab_glass", (1.74, 1.56, cab_z1 - cab_z0 - 0.05), loc=(0, -1.01, (cab_z0 + cab_z1) / 2), m="glass_dark"))
    P.append(box("cab_roof", (2.1, 2.0, 0.18), loc=(0, -1.0, cab_z1 + 0.08), m="steel_painted_white", bevel=0.06))
    P.append(box("roof_lights", (1.6, 0.1, 0.08), loc=(0, -0.05, cab_z1 + 0.12), m="emit_warm"))
    P.append(box("seat", (0.55, 0.5, 0.12), loc=(0, -1.25, 2.4), m="fabric_sofa", bevel=0.03))
    P.append(box("seat_back", (0.55, 0.12, 0.6), loc=(0, -1.48, 2.75), m="fabric_sofa", bevel=0.03))
    P.append(box("console", (0.25, 0.8, 0.5), loc=(0.45, -1.2, 2.35), m="plastic_dark", bevel=0.02))
    for sx in (-1, 1):
        P.append(box("rear_fender", (0.25, 2.0, 0.12), loc=(sx * 1.1, -2.0, 2.1), rot=(0.0, sx * 0.3, 0), m="farm_red", bevel=0.03))
        P.append(box("fuel_tank", (0.55, 1.1, 0.6), loc=(sx * 0.95, -0.6, 1.25), m="farm_red", bevel=0.08))
        P.append(box("step", (0.3, 0.45, 0.05), loc=(sx * 1.05, -0.3, 1.0), m="metal_dark"))
        P.append(box("ladder", (0.05, 0.05, 0.8), loc=(sx * 1.05, -0.3, 1.45), m="metal_dark"))
        P.append(box("mirror", (0.05, 0.28, 0.22), loc=(sx * 1.25, -0.1, 3.0), m="chrome"))
    P.append(box("hitch", (0.5, 0.6, 0.3), loc=(0, -2.9, 0.95), m="steel_painted_gray"))
    P.append(box("rear_weights", (1.2, 0.3, 0.45), loc=(0, -2.75, 1.45), m="farm_red", bevel=0.03))
    P.append(cyl("exhaust", 0.08, 1.3, loc=(0.75, 0.3, 3.2), m="metal_dark", verts=12))
    rr = merge(P, "rear_body", par=root)
    finish(rr, 35)
    # front frame: long hood with grille, front fenders, weights
    F.append(box("front_chassis", (1.2, 2.8, 0.55), loc=(0, 1.3, 1.15), m="metal_dark", bevel=0.04))
    F.append(box("hood", (1.35, 2.8, 1.0), loc=(0, 1.35, 1.95), m="farm_red", bevel=0.1, segs=3))
    F.append(box("hood_stripe", (1.37, 2.6, 0.05), loc=(0, 1.35, 2.15), m="frame_black"))
    F.append(box("grille", (1.2, 0.08, 0.85), loc=(0, 2.78, 1.85), m="radiator_black", bevel=0.02))
    for k in range(7):
        F.append(box("grille_bar", (1.16, 0.1, 0.03), loc=(0, 2.8, 1.5 + k * 0.11), m="metal_gray"))
    F.append(box("front_weights", (1.3, 0.35, 0.5), loc=(0, 2.95, 1.2), m="metal_dark", bevel=0.03))
    for sx in (-1, 1):
        F.append(box("front_fender", (0.22, 1.6, 0.1), loc=(sx * 1.15, 1.9, 2.15), rot=(0, sx * 0.25, 0), m="farm_red", bevel=0.03))
        F.append(box("headlight", (0.25, 0.06, 0.16), loc=(sx * 0.48, 2.82, 2.3), m="emit_white"))
    F.append(cyl("joint_pin", 0.2, 0.7, loc=(0, -0.1, 1.2), m="metal_silver"))
    fm = merge(F, "front_body", par=ff)
    fm.location = (0, -0.1, 0)
    finish(fm, 35)
    # wheels: duals front & rear (front wheels belong to the front frame)
    for (nm, x, y, par) in (("FL", -1.35, 2.0, ff), ("FR", 1.35, 2.0, ff), ("RL", -1.35, -1.9, root), ("RR", 1.35, -1.9, root)):
        yy = y - 0.1 if par is ff else y
        wheel(f"wheel_{nm}", par, (x, yy, 0.95), 0.95, 0.5, 0.55, dual=True, rim_m="steel_painted_yellow", side=-1 if x < 0 else 1)
    sw = empty("steer", loc=(0, -0.95, 2.75), rot=(-0.5, 0, 0), parent=root)
    swm = kit.torus("steer_mesh", 0.18, 0.016, rot=(PI / 2, 0, 0), m="plastic_dark", seg=20, rseg=6, par=sw)
    empty("eye_driver", loc=(0, -1.15, 3.05), parent=root)
    empty("exit_L", loc=(-2.4, -0.3, 0.0), parent=root)
    empty("exit_R", loc=(2.4, -0.3, 0.0), parent=root)
    box("door_hit", (0.3, 1.0, 1.6), loc=(-1.0, -1.0, 2.6), m="frame_black", par=root, interact="cardoor", iid="tractor_door").hide_render = True
    kit.export_glb(os.path.join(kit.out_dir(), "tractor.glb"), root)
    kit.preview(os.path.join(kit.preview_dir(), "tractor.png"), (8, 8, 3.5), (0, 0, 1.6), lens=35, samples=16, world=(0.75, 0.74, 0.65))


# ============================================================================================ combine
def combine():
    kit.reset()
    root = empty("Combine", vehicle="combine")
    P = []
    # main body (thresher)
    P.append(box("body", (2.9, 6.2, 2.4), loc=(0, -0.6, 2.25), m="farm_red", bevel=0.12, segs=3))
    P.append(box("body_side_panels", (2.95, 5.8, 0.06), loc=(0, -0.7, 1.4), m="frame_black"))
    for sx in (-1, 1):
        for k in range(5):
            P.append(box("louvre", (0.04, 0.6, 0.08), loc=(sx * 1.47, -2.6 + k * 0.15 + (0 if sx > 0 else 0), 2.6), m="radiator_black"))
    # grain tank (top) with extensions
    P.append(box("tank", (3.1, 3.2, 1.2), loc=(0, -0.2, 4.05), m="farm_red", bevel=0.1))
    P.append(box("tank_ext", (3.3, 3.4, 0.35), loc=(0, -0.2, 4.8), m="steel_painted_gray", bevel=0.03))
    # engine & radiator at the rear
    P.append(box("engine", (2.6, 1.6, 1.4), loc=(0, -3.6, 3.0), m="farm_red", bevel=0.1))
    P.append(box("radiator_screen", (0.06, 1.4, 1.1), loc=(1.33, -3.6, 3.1), m="radiator_black"))
    P.append(cyl("rotary_screen", 0.55, 0.12, loc=(1.38, -3.6, 3.1), rot=(0, PI / 2, 0), m="radiator_black", verts=24))
    P.append(cyl("exhaust", 0.09, 1.2, loc=(-0.9, -3.2, 4.2), m="metal_dark", verts=12))
    P.append(box("spreader", (2.2, 0.5, 0.6), loc=(0, -4.6, 1.7), m="steel_painted_gray"))
    # cab at front-top
    cab_y = 1.9
    for sx in (-0.85, 0.85):
        for sy in (cab_y - 0.75, cab_y + 0.75):
            P.append(box("pillar", (0.07, 0.07, 1.55), loc=(sx, sy, 4.15), m="metal_dark"))
    P.append(box("cab_glass", (1.7, 1.5, 1.5), loc=(0, cab_y, 4.15), m="glass_dark"))
    P.append(box("cab_roof", (2.0, 1.8, 0.16), loc=(0, cab_y, 5.0), m="steel_painted_white", bevel=0.05))
    P.append(box("cab_platform", (2.4, 2.0, 0.12), loc=(0, cab_y, 3.36), m="metal_dark"))
    P.append(box("rail", (2.4, 0.04, 0.04), loc=(0, cab_y + 1.0, 4.0), m="steel_painted_yellow"))
    P.append(box("ladder", (0.5, 0.06, 2.6), loc=(-1.25, cab_y + 0.3, 2.0), rot=(0.15, 0, 0), m="metal_dark"))
    P.append(box("seat", (0.55, 0.5, 0.12), loc=(0, cab_y - 0.2, 3.95), m="fabric_sofa"))
    P.append(box("roof_lights", (1.6, 0.1, 0.08), loc=(0, cab_y + 0.95, 5.0), m="emit_warm"))
    # feederhouse
    P.append(box("feeder", (1.4, 2.2, 1.0), loc=(0, 3.1, 1.6), rot=(-0.35, 0, 0), m="farm_red", bevel=0.05))
    # header (9 m platform)
    hw = 9.0
    P.append(box("header_back", (hw, 0.3, 1.0), loc=(0, 4.3, 1.0), m="farm_red", bevel=0.04))
    P.append(box("header_floor", (hw, 1.6, 0.08), loc=(0, 5.0, 0.55), m="metal_gray"))
    P.append(box("cutter_bar", (hw, 0.1, 0.05), loc=(0, 5.85, 0.52), m="metal_silver"))
    for k in range(int(hw / 0.08)):
        P.append(box("knife", (0.035, 0.12, 0.02), loc=(-hw / 2 + 0.04 + k * 0.08, 5.92, 0.52), m="metal_silver"))
    for sx in (-1, 1):
        P.append(prism("divider", [(-0.15, 0), (0.15, 0), (0.0, 1.0)], 0.4, 1.2, m="farm_red", loc=(sx * hw / 2, 5.4, 0), bevel=0.02))
        P.append(box("header_end", (0.08, 1.5, 0.9), loc=(sx * hw / 2, 4.95, 0.95), m="farm_red"))
        P.append(box("reel_arm", (0.1, 1.6, 0.1), loc=(sx * (hw / 2 - 0.15), 5.1, 2.0), rot=(-0.4, 0, 0), m="farm_red"))
    P.append(cyl("auger_cross", 0.25, hw - 0.2, loc=(0, 4.75, 0.85), rot=(0, PI / 2, 0), m="metal_gray", verts=16))
    body = merge(P, "combine_body", par=root)
    finish(body, 35)
    # reel (rotating bats)
    reel = empty("reel", loc=(0, 5.45, 1.75), parent=root)
    rp = [cyl("reel_shaft", 0.06, hw - 0.4, rot=(0, PI / 2, 0), m="metal_dark", verts=10)]
    for k in range(6):
        a = 2 * PI * k / 6
        rp.append(box("bat", (hw - 0.5, 0.05, 0.12), loc=(0, math.cos(a) * 0.62, math.sin(a) * 0.62), rot=(a, 0, 0), m="steel_painted_yellow"))
        for x in (-3.5, -1.2, 1.2, 3.5):
            rp.append(box("spider", (0.04, 0.04, 0.62), loc=(x, math.cos(a) * 0.31, math.sin(a) * 0.31), rot=(a - PI / 2, 0, 0), m="metal_dark"))
    rm = merge(rp, "reel_mesh", par=reel)
    rm.location = (0, 0, 0)
    finish(rm, 35)
    # unloading auger (pivots out to the left)
    aug = empty("auger", loc=(-1.4, -1.2, 4.2), parent=root)
    ap = [cyl("auger_tube", 0.17, 6.5, loc=(0, 3.1, 0.4), rot=(PI / 2 - 0.12, 0, 0), m="farm_red", verts=14),
          cyl("auger_spout", 0.2, 0.5, loc=(0, 6.3, 0.75), m="metal_dark", verts=12)]
    am = merge(ap, "auger_mesh", par=aug)
    am.location = (0, 0, 0)
    aug.rotation_euler = (0, 0, 0.0)
    finish(am, 35)
    for (nm, x, y, r, w, dual) in (("FL", -1.55, 1.2, 0.9, 0.55, True), ("FR", 1.55, 1.2, 0.9, 0.55, True), ("RL", -1.35, -3.0, 0.62, 0.4, False), ("RR", 1.35, -3.0, 0.62, 0.4, False)):
        wheel(f"wheel_{nm}", root, (x, y, r), r, w, r * 0.55, dual=dual, rim_m="steel_painted_yellow", side=-1 if x < 0 else 1)
    sw = empty("steer", loc=(0, cab_y + 0.35, 4.25), rot=(-0.6, 0, 0), parent=root)
    kit.torus("steer_mesh", 0.17, 0.016, rot=(PI / 2, 0, 0), m="plastic_dark", seg=20, rseg=6, par=sw)
    empty("eye_driver", loc=(0, cab_y - 0.1, 4.6), parent=root)
    empty("exit_L", loc=(-2.6, cab_y + 0.3, 0.0), parent=root)
    empty("exit_R", loc=(2.6, cab_y, 0.0), parent=root)
    box("door_hit", (0.6, 1.0, 2.0), loc=(-1.3, cab_y + 0.3, 2.2), m="frame_black", par=root, interact="cardoor", iid="combine_door").hide_render = True
    kit.export_glb(os.path.join(kit.out_dir(), "combine.glb"), root)
    kit.preview(os.path.join(kit.preview_dir(), "combine.png"), (11, 12, 5), (0, 0.5, 1.8), lens=32, samples=16, world=(0.75, 0.74, 0.65))


def grain_cart():
    kit.reset()
    root = empty("GrainCart", vehicle="cart")
    P = []
    hop = loft("hopper", [
        [V((-1.6, -2.6, 3.0)), V((1.6, -2.6, 3.0)), V((1.6, 2.0, 3.0)), V((-1.6, 2.0, 3.0))],
        [V((-1.5, -2.5, 2.2)), V((1.5, -2.5, 2.2)), V((1.5, 1.9, 2.2)), V((-1.5, 1.9, 2.2))],
        [V((-0.4, -1.4, 1.1)), V((0.4, -1.4, 1.1)), V((0.4, 0.8, 1.1)), V((-0.4, 0.8, 1.1))],
    ], m="farm_red", caps=False)
    P.append(hop)
    P.append(box("frame", (0.5, 5.4, 0.3), loc=(0, -0.5, 1.0), m="metal_dark"))
    P.append(box("tongue", (0.25, 2.5, 0.2), loc=(0, 3.2, 0.8), m="metal_dark"))
    P.append(cyl("auger", 0.18, 4.0, loc=(1.5, 2.3, 3.1), rot=(0.9, 0, -0.5), m="farm_red", verts=12))
    o = merge(P, "cart_body", par=root)
    finish(o, 35)
    for (nm, x) in (("L", -1.75), ("R", 1.75)):
        wheel(f"wheel_{nm}", root, (x, -0.3, 1.0), 1.0, 0.7, 0.6, lugs=True, rim_m="steel_painted_yellow", side=-1 if x < 0 else 1)
    kit.export_glb(os.path.join(kit.out_dir(), "graincart.glb"), root)


if __name__ == "__main__":
    pickup()
    tractor()
    combine()
    grain_cart()
