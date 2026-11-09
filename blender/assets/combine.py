"""
Combine harvester with a 12-row corn head, and the big grain cart (reference images 1–2: the red harvest machinery
parked between the corn and the house). Original, unbadged designs.

Combine (Blender +Y forward, origin on the ground): front drive axle y = +1.3 (wide single R1W tyres), rear steer axle
y = -2.9. Runtime nodes: wheel_FL/FR/RL/RR, reel (corn-head cross auger, spins about X), auger (unloading auger, swings
out to the left about Z), steer, eye_driver, exit_L/R, door_hit, light_head_L/R; lamp meshes carry userData.lamp.
"""
import sys, os, math, random
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "lib"))
sys.path.insert(0, HERE)
import bpy, bmesh
import kit
from kit import V, box, cyl, prism, M, empty, merge, finish, set_props, lathe, loft
from farm_house import obox, seg_box
from tractor import rrect, arc_slab

PI = math.pi
RED, DARK = "farm_red", "metal_dark"
FA, RA = 1.3, -2.9


# ------------------------------------------------------------------------------------------------ tyres
def ag_tire(name, par, r, w, rr, x_off=0.0, mirror=False, n=24, rim_m=RED, lug_h=0.05):
    parts = []
    prof = [(rr, -w * 0.46), (rr + (r - rr) * 0.35, -w * 0.51), (rr + (r - rr) * 0.72, -w * 0.49), (r * 0.95, -w * 0.43), (r * 0.968, -w * 0.3),
            (r * 0.968, w * 0.3), (r * 0.95, w * 0.43), (rr + (r - rr) * 0.72, w * 0.49), (rr + (r - rr) * 0.35, w * 0.51), (rr, w * 0.46)]
    parts.append(lathe(name + "_carcass", prof, m="tire_rubber", seg=56, rot=(0, PI / 2, 0)))
    for k in range(n):
        for side in (-1, 1):
            a = 2 * PI * (k + (0.5 if side > 0 else 0.0)) / n
            rad = V((0, math.cos(a), math.sin(a)))
            tan = V((0, -math.sin(a), math.cos(a)))
            phi = 0.62 * side
            d = V((1, 0, 0)) * math.cos(phi) + tan * math.sin(phi)
            pv = V((1, 0, 0)) * -math.sin(phi) + tan * math.cos(phi)
            c = V((side * w * 0.24, 0, 0)) + rad * (r * 0.955)
            L = w * 0.33
            parts.append(obox(name + "_lug", c, d, pv, rad, -L, L, -0.035, 0.035, 0.0, lug_h, "tire_rubber"))
    rim = [(rr + 0.03, -w * 0.47), (rr - 0.01, -w * 0.45), (rr - 0.04, -w * 0.25), (rr - 0.04, w * 0.25), (rr - 0.01, w * 0.45), (rr + 0.03, w * 0.47),
           (rr + 0.03, w * 0.43), (rr - 0.06, w * 0.24), (rr - 0.06, -w * 0.24), (rr + 0.03, -w * 0.43)]
    parts.append(lathe(name + "_rim", rim, m=rim_m, seg=44, rot=(0, PI / 2, 0)))
    disc = [(rr * 0.3, 0.10), (rr * 0.55, 0.06), (rr * 0.78, -0.02), (rr - 0.05, -0.02), (rr - 0.05, 0.02), (rr * 0.78, 0.02), (rr * 0.55, 0.10), (rr * 0.3, 0.14)]
    parts.append(lathe(name + "_disc", disc, m=rim_m, seg=36, rot=(0, PI / 2, 0)))
    for k in range(8):
        a = 2 * PI * k / 8
        parts.append(cyl(name + "_hole", 0.045, 0.05, loc=(0.0, math.cos(a) * rr * 0.66, math.sin(a) * rr * 0.66), rot=(0, PI / 2, 0), m="frame_black", verts=12))
    parts.append(cyl(name + "_hub", rr * 0.3, 0.12, loc=(0.16, 0, 0), rot=(0, PI / 2, 0), m=rim_m, verts=24))
    for k in range(10):
        a = 2 * PI * k / 10
        parts.append(cyl(name + "_nut", 0.017, 0.05, loc=(0.2, math.cos(a) * rr * 0.23, math.sin(a) * rr * 0.23), rot=(0, PI / 2, 0), m="metal_gray", verts=6))
    o = merge(parts, name, par=par)
    finish(o, 40)
    o.location = (x_off, 0, 0)
    if mirror:
        o.rotation_euler = (0, 0, PI)
    return o


def tube(L, name, pts, r, m, seg=10):
    L.append(kit.tube(name, pts, r, m=m, seg=seg))


# ------------------------------------------------------------------------------------------------ combine
def corn_head(P, root):
    """12-row corn head: frame and auger trough, 13 snouts, row units, end shields; the cross auger is the 'reel'."""
    rows, sp = 12, 0.76
    hw = rows * sp / 2 + 0.25
    y0, y1 = 3.75, 6.35
    P.append(box("head_back", (hw * 2, 0.3, 0.9), loc=(0, y0 - 0.1, 1.05), m=RED, bevel=0.03))
    P.append(box("head_beam", (hw * 2, 0.35, 0.3), loc=(0, y0 - 0.25, 1.65), m=RED, bevel=0.03))
    P.append(kit.prism_yz("head_trough", kit.ccw([(y0 - 0.05, 0.55), (y0 + 0.55, 0.55), (y0 + 0.62, 0.75), (y0 + 0.55, 0.62), (y0 + 0.05, 0.62), (y0 - 0.05, 1.3)]), -hw, hw, m=DARK))
    # row units (dark gathering chains / stalk rolls) between the snouts
    for i in range(rows):
        x = -rows * sp / 2 + sp * (i + 0.5)
        P.append(box("row_unit", (0.14, 1.9, 0.16), loc=(x, y0 + 1.05, 0.5), rot=(0.1, 0, 0), m=DARK))
        for sx in (-1, 1):
            P.append(seg_box("stalk_roll", (x + sx * 0.035, y0 + 0.35, 0.62), (x + sx * 0.035, y0 + 1.95, 0.46), 0.03, 0.03, "metal_gray"))
    # snouts (divider points) — tapered hoods with steel tips
    for i in range(rows + 1):
        x = -rows * sp / 2 + sp * i
        wdt = 0.24 if 0 < i < rows else 0.3
        prof = [(y1, 0.32), (y1 - 0.25, 0.45), (y0 + 1.0, 0.95), (y0 + 0.2, 1.22), (y0 + 0.0, 1.22), (y0 + 0.0, 0.6), (y0 + 1.2, 0.5), (y1 - 0.4, 0.3)]
        sn = kit.prism_yz("snout", kit.ccw(prof), x - wdt / 2, x + wdt / 2, m=RED)
        # taper the snout to a point toward the tip
        for v in sn.data.vertices:
            t = max(0.0, min(1.0, (v.co.y - (y0 + 0.4)) / (y1 - y0 - 0.4)))
            v.co.x = x + (v.co.x - x) * (1.0 - 0.75 * t)
        sn.data.update()
        kit.add_bevel(sn, 0.03, 2, 50)
        P.append(sn)
        P.append(kit.prism_yz("snout_tip", kit.ccw([(y1 - 0.2, 0.38), (y1 + 0.05, 0.3), (y1 - 0.18, 0.29)]), x - 0.03, x + 0.03, m="metal_silver"))
    for sx in (-1, 1):
        P.append(kit.prism_yz("end_shield", kit.ccw([(y0 - 0.2, 0.5), (y1 - 0.6, 0.45), (y0 + 0.6, 1.45), (y0 - 0.2, 1.5)]), sx * hw - (0.04 if sx > 0 else 0), sx * hw + (0.04 if sx < 0 else 0), m=RED))
        P.append(box("head_light", (0.12, 0.08, 0.1), loc=(sx * (hw - 0.3), y0 - 0.1, 1.75), m="lamp_lens_amber", bevel=0.01))
        P.append(box("head_skid", (0.12, 1.2, 0.04), loc=(sx * (hw - 0.4), y0 + 0.9, 0.42), m="metal_gray"))
    P.append(box("head_drive", (0.3, 0.6, 0.35), loc=(-hw + 0.4, y0 - 0.4, 1.3), m=DARK, bevel=0.03))
    # cross auger = 'reel' node (helical flighting on a tube)
    reel = empty("reel", loc=(0, y0 + 0.28, 0.85), parent=root)
    rp = [cyl("auger_core", 0.12, hw * 2 - 0.3, rot=(0, PI / 2, 0), m="metal_gray", verts=14)]
    for side in (-1, 1):   # flights converge toward the centre
        pts = []
        n = 160
        for k in range(n + 1):
            t = k / n
            x = side * (0.35 + t * (hw - 0.55))
            a = side * t * 2 * PI * 9
            pts.append((x, math.cos(a) * 0.21, math.sin(a) * 0.21))
        rp.append(kit.tube("flight", pts, 0.025, m="metal_silver", seg=5))
    for k in range(4):   # paddles at the centre
        a = k * PI / 2
        rp.append(box("paddle", (0.6, 0.02, 0.18), loc=(0, math.cos(a) * 0.2, math.sin(a) * 0.2), rot=(a, 0, 0), m="metal_silver"))
    rm = merge(rp, "reel_mesh", par=reel)
    rm.location = (0, 0, 0)
    finish(rm, 35)


def combine(preview=True):
    kit.reset()
    random.seed(5)
    root = empty("Combine", vehicle="combine")
    P, Lm = [], []
    # ---- lower body between the drive wheels, upper body over them
    P.append(box("lower_body", (2.1, 5.2, 1.4), loc=(0, -1.0, 1.25), m=RED, bevel=0.05))
    up = loft("upper_body", [rrect(1.48, 1.9, 3.55, 0.25, y) for y in (-3.55, -2.0, 0.0, 1.55)], m=RED)
    P.append(up)
    for sx in (-1, 1):
        P.append(box("skirt", (0.04, 5.0, 0.18), loc=(sx * 1.06, -1.0, 0.6), m="frame_black"))
        P.append(box("side_band", (0.01, 5.0, 0.12), loc=(sx * 1.485, -1.0, 2.15), m="frame_black"))
        for k, (yc, ln) in enumerate(((-2.6, 1.5), (-0.8, 1.6), (0.85, 1.1))):   # access door seams + latches
            P.append(box("door_seam", (0.01, 0.012, 1.25), loc=(sx * 1.486, yc - ln / 2, 2.85), m="frame_black"))
            P.append(box("door_latch", (0.02, 0.05, 0.08), loc=(sx * 1.49, yc + ln / 2 - 0.12, 2.9), m="metal_dark"))
        for k in range(12):   # cleaning-fan intake louvres low on the sides
            P.append(box("fan_louvre", (0.03, 0.9, 0.03), loc=(sx * 1.07, -1.5, 0.75 + k * 0.06), rot=(0, sx * 0.6, 0), m=DARK))
    # ---- grain tank with folded extensions and cover
    P.append(loft("tank", [rrect(1.52, 3.5, 4.35, 0.12, y) for y in (-1.95, 1.05)], m=RED))
    for sx in (-1, 1):
        P.append(obox("tank_ext", (sx * 1.52, -1.95, 4.33), (0, 3.0, 0), (-sx * 0.12, 0, 0.42), (sx, 0, 0), 0, 1, 0, 1, 0, 0.03, "steel_painted_gray"))
    for yy in (-1.97, 1.07):
        P.append(box("tank_ext_end", (2.9, 0.03, 0.42), loc=(0, yy, 4.55), m="steel_painted_gray"))
    P.append(box("tank_cover", (2.75, 2.95, 0.03), loc=(0, -0.45, 4.78), m="steel_painted_gray"))
    for k in range(5):
        P.append(box("cover_rib", (2.75, 0.04, 0.03), loc=(0, -1.8 + k * 0.7, 4.8), m="steel_painted_gray"))
    P.append(box("tank_window", (0.5, 0.02, 0.3), loc=(0.4, 1.06, 4.0), m="glass_dark"))
    # ---- engine compartment, rotary screen, exhaust, air cleaner
    P.append(loft("engine_bay", [rrect(1.45, 3.5, 4.35, 0.15, y) for y in (-3.65, -2.0)], m=RED))
    P.append(cyl("rotary_screen", 0.62, 0.08, loc=(-1.47, -2.8, 3.0), rot=(0, PI / 2, 0), m="frame_black", verts=32))
    for k in range(10):
        a = k * PI / 5
        P.append(box("screen_spoke", (0.02, 0.04, 1.2), loc=(-1.52, -2.8, 3.0), rot=(a, 0, 0), m="metal_gray"))
    P.append(kit.torus("screen_rim", 0.62, 0.025, loc=(-1.51, -2.8, 3.0), rot=(0, PI / 2, 0), m="metal_gray", seg=32, rseg=5))
    for k in range(9):
        P.append(box("rad_louvre", (0.03, 1.4, 0.03), loc=(1.47, -2.8, 2.55 + k * 0.1), rot=(0, 0.6, 0), m=DARK))
    tube(P, "exhaust", [(0.9, -3.3, 4.3), (0.9, -3.3, 5.05), (0.9, -3.4, 5.15)], 0.09, "metal_dark", seg=12)
    P.append(cyl("air_cleaner", 0.2, 0.55, loc=(-0.7, -3.2, 4.6), m="steel_painted_gray", verts=18))
    # ---- rear: straw chopper and spreader discs, rear lights, ladder to the engine deck
    P.append(box("chopper", (2.2, 0.9, 0.9), loc=(0, -3.95, 1.5), m=DARK, bevel=0.05))
    P.append(box("chopper_hood", (2.3, 1.0, 0.12), loc=(0, -3.95, 2.0), rot=(0.15, 0, 0), m=RED, bevel=0.03))
    for sx in (-1, 1):
        P.append(cyl("spreader_disc", 0.38, 0.04, loc=(sx * 0.5, -4.3, 1.0), m="metal_gray", verts=20))
        for k in range(6):
            a = k * PI / 3
            P.append(box("spreader_paddle", (0.34, 0.02, 0.08), loc=(sx * 0.5 + math.cos(a) * 0.18, -4.3 + math.sin(a) * 0.18, 1.05), rot=(0, 0, a), m="metal_gray"))
        Lm.append(("tail", box("tail_lamp", (0.14, 0.03, 0.1), loc=(sx * 1.2, -3.66, 2.1), m="lamp_lens_red")))
        P.append(box("rear_flasher", (0.12, 0.06, 0.1), loc=(sx * 1.3, -3.66, 3.4), m="lamp_lens_amber"))
    P.append(prism("smv", kit.ccw([(-0.18, 0.0), (0.18, 0.0), (0.0, 0.31)]), 0, 0.01, m="lamp_lens_amber", loc=(-0.6, -3.67, 2.6), rot=(PI / 2, 0, 0)))
    for k in range(7):
        P.append(box("rear_ladder", (0.4, 0.04, 0.03), loc=(1.05, -3.68, 1.2 + k * 0.42), m="metal_gray"))
    # ---- feeder house sloping to the head, cab on the front platform
    P.append(obox("feeder", (-0.8, 1.55, 1.95), (1.6, 0, 0), (0, 2.25, -0.75), (0, 0.32, 0.95), 0, 1, 0, 1, -0.5, 0.25, RED))
    P.append(seg_box("lift_cyl", (-0.6, 1.4, 0.75), (-0.6, 3.1, 1.15), 0.12, 0.12, "metal_gray"))
    P.append(seg_box("lift_cyl", (0.6, 1.4, 0.75), (0.6, 3.1, 1.15), 0.12, 0.12, "metal_gray"))
    P.append(box("platform", (2.6, 1.8, 0.1), loc=(0, 2.05, 3.15), m="steel_painted_gray"))
    P.append(box("cab_base", (1.85, 1.6, 0.25), loc=(0, 2.05, 3.32), m=RED, bevel=0.03))
    cz0, cz1 = 3.45, 4.95
    fy, ry = 2.85, 1.3
    for (a, b) in (((-0.92, fy, cz0), (-0.88, fy - 0.2, cz1)), ((0.92, fy, cz0), (0.88, fy - 0.2, cz1)), ((-0.92, ry, cz0), (-0.92, ry, cz1)), ((0.92, ry, cz0), (0.92, ry, cz1))):
        P.append(seg_box("cab_post", a, b, 0.07, 0.07, "frame_black"))
    P.append(obox("cab_glass_f", (-0.9, fy, cz0), (1, 0, 0), (0, -0.2, cz1 - cz0), (0, 1, 0), 0, 1.8, 0, 1, -0.006, 0.006, "glass_dark"))
    P.append(obox("cab_glass_lowf", (-0.9, fy + 0.02, cz0 - 0.25), (1, 0, 0), (0, -0.02, 0.27), (0, 1, 0), 0, 1.8, 0, 1, -0.006, 0.006, "glass_dark"))
    for sx in (-1, 1):
        P.append(obox("cab_glass_s", (sx * 0.92, ry + 0.04, cz0 + 0.05), (0, 1, 0), (0, 0, 1), (1, 0, 0), 0, fy - ry - 0.15, 0, cz1 - cz0 - 0.08, -0.006, 0.006, "glass_dark"))
    P.append(box("cab_back", (1.84, 0.06, cz1 - cz0), loc=(0, ry, (cz0 + cz1) / 2), m=RED))
    P.append(loft("cab_roof", [rrect(1.02, cz1, cz1 + 0.2, 0.08, ry - 0.08), rrect(1.05, cz1, cz1 + 0.25, 0.1, (ry + fy) / 2), rrect(1.02, cz1, cz1 + 0.2, 0.08, fy + 0.15)], m="steel_painted_white"))
    for x in (-0.75, -0.4, 0.4, 0.75):
        P.append(box("roof_work", (0.16, 0.1, 0.12), loc=(x, fy + 0.18, cz1 + 0.1), rot=(-0.3, 0, 0), m="frame_black", bevel=0.01))
        Lm.append(("head", box("roof_work_lens", (0.13, 0.02, 0.09), loc=(x, fy + 0.235, cz1 + 0.092), rot=(-0.3, 0, 0), m="lamp_lens")))
    for sx in (-1, 1):
        empty(f"light_head_{'L' if sx < 0 else 'R'}", loc=(sx * 0.4, fy + 0.25, cz1 + 0.1), parent=root)
        P.append(seg_box("mirror_arm", (sx * 0.92, fy - 0.1, 4.6), (sx * 1.5, fy + 0.1, 4.4), 0.035, 0.035, "frame_black"))
        P.append(box("mirror_head", (0.06, 0.24, 0.36), loc=(sx * 1.53, fy + 0.12, 4.35), rot=(0, 0, -sx * 0.25), m="frame_black", bevel=0.015))
        Lm.append(("head", box("feeder_lamp", (0.14, 0.03, 0.1), loc=(sx * 0.65, 3.5, 1.7), rot=(-0.35, 0, 0), m="lamp_lens")))
    P.append(kit.lathe("beacon", [(0.0, 0.0), (0.07, 0.0), (0.07, 0.05), (0.06, 0.13), (0.0, 0.15)], m="lamp_lens_amber", seg=16, loc=(0.6, ry + 0.2, cz1 + 0.22)))
    P.append(seg_box("wiper", (0.0, fy - 0.01, cz0 + 0.1), (-0.5, fy - 0.08, cz0 + 0.9), 0.015, 0.012, "frame_black"))
    # handrails and ladder on the left (swing ladder in front of the left drive wheel)
    tube(P, "handrail", [(-1.28, 2.95, 3.2), (-1.28, 2.95, 4.15), (-1.28, 1.15, 4.15), (-1.28, 1.15, 3.2)], 0.022, "steel_painted_yellow", seg=8)
    tube(P, "handrail_f", [(-1.28, 2.95, 4.15), (1.28, 2.95, 4.15)], 0.022, "steel_painted_yellow", seg=8)
    for k in range(7):
        P.append(box("ladder_step", (0.42, 0.22, 0.035), loc=(-1.55 + k * 0.03, 2.62 - k * 0.04, 0.55 + k * 0.4), m="steel_painted_gray"))
    for x in (-1.78, -1.32):
        P.append(seg_box("ladder_rail", (x - 0.02, 2.66, 0.45), (x + 0.18, 2.36, 3.15), 0.04, 0.04, DARK))
    # cab interior
    P.append(box("seat", (0.55, 0.5, 0.13), loc=(0, 1.85, cz0 + 0.45), m="fabric_sofa", bevel=0.04, segs=3))
    P.append(box("seat_back", (0.55, 0.13, 0.7), loc=(0, 1.58, cz0 + 0.85), rot=(-0.15, 0, 0), m="fabric_sofa", bevel=0.05, segs=3))
    P.append(box("console", (0.24, 0.8, 0.5), loc=(0.48, 1.9, cz0 + 0.42), m=DARK, bevel=0.03))
    P.append(seg_box("hydro_handle", (0.45, 2.05, cz0 + 0.68), (0.45, 2.15, cz0 + 0.88), 0.04, 0.04, "plastic_dark"))
    P.append(box("monitor", (0.3, 0.04, 0.22), loc=(0.62, 2.45, cz0 + 1.05), rot=(0.2, 0, -0.4), m="plastic_dark", bevel=0.01))
    P.append(box("monitor_screen", (0.26, 0.005, 0.17), loc=(0.612, 2.43, cz0 + 1.05), rot=(0.2, 0, -0.4), m="emit_screen"))
    P.append(box("steer_pod", (0.36, 0.22, 0.55), loc=(0, 2.55, cz0 + 0.3), rot=(0.25, 0, 0), m=DARK, bevel=0.04))
    phi = 0.6435
    sw = empty("steer", loc=(0, 2.33, cz0 + 0.8), rot=(phi, 0, 0), parent=root)
    swp = [kit.torus("sw_rim", 0.19, 0.016, m="plastic_dark", seg=36, rseg=8)]
    for a in (PI / 2 + 0.5, PI / 2 - 0.5 + PI, -PI / 2):
        swp.append(seg_box("sw_spoke", (0, 0, 0.02), (math.cos(a) * 0.18, math.sin(a) * 0.18, 0.0), 0.03, 0.012, "plastic_dark"))
    swp.append(cyl("sw_hub", 0.06, 0.06, loc=(0, 0, 0.03), m="plastic_dark", verts=20))
    swm = merge(swp, "steer_mesh", par=sw)
    swm.location = (0, 0, 0)
    finish(swm, 40)
    # axles
    P.append(box("drive_axle", (2.4, 0.4, 0.35), loc=(0, FA, 0.93), m=DARK, bevel=0.03))
    for sx in (-1, 1):
        P.append(cyl("final_drive", 0.3, 0.3, loc=(sx * 1.05, FA, 0.93), rot=(0, PI / 2, 0), m=DARK, verts=20))
    P.append(box("steer_axle", (2.3, 0.25, 0.25), loc=(0, RA, 0.68), m=DARK, bevel=0.02))
    P.append(box("steer_axle_pivot", (0.4, 0.4, 0.5), loc=(0, RA, 0.9), m=DARK))
    corn_head(P, root)
    body = merge(P, "combine_body", par=root)
    finish(body, 35)
    for grp in ("head", "tail"):
        objs = [o for (g, o) in Lm if g == grp]
        lm = merge(objs, f"lamps_{grp}", par=root, lamp=grp)
        finish(lm, 30)
    # unloading auger: folded forward along the left side, pivot at the tank's rear-left corner
    aug = empty("auger", loc=(-1.55, -1.75, 4.15), parent=root)
    ap = []
    Lt = 7.2
    tip = V((-0.25, Lt, 0.55))
    ap.append(kit.tube("auger_tube", [(0, 0, 0), (0, 0.6, 0.06), tip], 0.2, m=RED, seg=16))
    for k in range(6):
        p = V((0, 0.6, 0.06)).lerp(tip, k / 5)
        ap.append(kit.torus("auger_band", 0.205, 0.015, loc=p, rot=(PI / 2 - 0.08, 0, 0), m=DARK, seg=16, rseg=4))
    ap.append(cyl("auger_spout", 0.22, 0.5, loc=tip + V((0, 0.12, -0.3)), m=DARK, verts=14))
    ap.append(cyl("auger_pivot", 0.28, 0.4, loc=(0, 0, -0.1), m=DARK, verts=16))
    am = merge(ap, "auger_mesh", par=aug)
    am.location = (0, 0, 0)
    finish(am, 35)
    P2 = [box("auger_cradle", (0.12, 0.12, 1.2), loc=(-1.8, 4.0, 4.0), m=DARK), box("cradle_arm", (0.5, 0.12, 0.12), loc=(-1.55, 4.0, 3.45), m=DARK)]
    cr = merge(P2, "cradle", par=root)
    finish(cr, 35)
    # wheels: wide single drive tyres, smaller steer tyres
    for (nm, x, y, r, w, rr) in (("FL", -1.55, FA, 0.93, 0.8, 0.52), ("FR", 1.55, FA, 0.93, 0.8, 0.52), ("RL", -1.35, RA, 0.65, 0.5, 0.36), ("RR", 1.35, RA, 0.65, 0.5, 0.36)):
        pv = empty(f"wheel_{nm}", loc=(x, y, r), parent=root)
        ag_tire(f"wheel_{nm}_t", pv, r, w, rr, 0.0, x < 0, n=24 if r > 0.8 else 18, lug_h=0.05 if r > 0.8 else 0.035)
    empty("eye_driver", loc=(0, 1.85, cz0 + 1.2), parent=root)
    empty("exit_L", loc=(-2.6, 2.6, 0.0), parent=root)
    empty("exit_R", loc=(2.6, 2.0, 0.0), parent=root)
    box("door_hit", (0.6, 1.0, 2.0), loc=(-1.3, 2.5, 2.2), m="frame_black", par=root, interact="cardoor", iid="combine_door").hide_render = True
    kit.export_glb(os.path.join(kit.out_dir(), "combine.glb"), root)
    if preview:
        pd = kit.preview_dir()
        w = (0.62, 0.66, 0.7)
        kit.preview(os.path.join(pd, "combine.png"), (-11, 11, 4.5), (0, 0.8, 2.0), lens=32, samples=24, world=w, sun=(0.4, 0.6, 0.7))
        kit.preview(os.path.join(pd, "combine_rear.png"), (9, -11, 5.0), (0, -1.0, 2.2), lens=32, samples=20, world=w, sun=(0.4, 0.6, 0.7))


# ------------------------------------------------------------------------------------------------ grain cart
def grain_cart(preview=True):
    kit.reset()
    root = empty("GrainCart", vehicle="cart")
    P = []
    m = "farm_red_faded"
    # hopper: straight upper box over a V hopper down to the floor auger
    zt, zb, zf = 3.45, 2.35, 1.25
    hx, hy0, hy1 = 1.62, -2.55, 2.15
    top = [V((-hx, hy0, zt)), V((hx, hy0, zt)), V((hx, hy1, zt)), V((-hx, hy1, zt))]
    mid = [V((-hx, hy0, zb)), V((hx, hy0, zb)), V((hx, hy1, zb)), V((-hx, hy1, zb))]
    bot = [V((-0.32, hy0 + 0.9, zf)), V((0.32, hy0 + 0.9, zf)), V((0.32, hy1 - 0.25, zf)), V((-0.32, hy1 - 0.25, zf))]
    P.append(loft("hopper", [top, mid, bot], m=m, closed=True, caps=False))
    P.append(loft("hopper_in", [[p + V((0, 0, -0.02)) - V((math.copysign(0.03, p.x), math.copysign(0.03, p.y - (hy0 + hy1) / 2), 0)) for p in sec] for sec in (top, mid, bot)], m="metal_gray", closed=True, caps=False))
    P.append(box("hopper_floor", (0.64, hy1 - hy0 - 1.15, 0.04), loc=(0, (hy0 + 0.9 + hy1 - 0.25) / 2, zf), m="metal_gray"))
    # rolled top rim and vertical stiffener ribs, band at the hopper break
    for (a, b) in ((top[0], top[1]), (top[1], top[2]), (top[2], top[3]), (top[3], top[0])):
        P.append(kit.tube("top_rim", [a, b], 0.04, m=m, seg=8))
    for (a, b) in ((mid[0], mid[1]), (mid[1], mid[2]), (mid[2], mid[3]), (mid[3], mid[0])):
        P.append(kit.tube("break_band", [a, b], 0.03, m=m, seg=6))
    for sx in (-1, 1):
        for k in range(7):
            y = hy0 + 0.3 + k * (hy1 - hy0 - 0.6) / 6
            P.append(box("rib", (0.05, 0.08, zt - zb), loc=(sx * (hx + 0.025), y, (zt + zb) / 2), m=m))
    for yy, s in ((hy0, -1), (hy1, 1)):
        for k in range(5):
            x = -hx + 0.35 + k * (2 * hx - 0.7) / 4
            P.append(box("rib", (0.08, 0.05, zt - zb), loc=(x, yy + s * 0.025, (zt + zb) / 2), m=m))
    P.append(box("sight_glass", (0.55, 0.03, 0.35), loc=(0.6, hy1 + 0.035, 2.95), m="glass_clear"))
    P.append(box("sight_frame", (0.65, 0.02, 0.45), loc=(0.6, hy1 + 0.03, 2.95), m="frame_black"))
    # roll tarp: bows, rolled tarp along the right rim, crank
    for k in range(5):
        y = hy0 + 0.2 + k * (hy1 - hy0 - 0.4) / 4
        P.append(kit.tube("tarp_bow", [(-hx, y, zt), (-hx * 0.5, y, zt + 0.16), (0, y, zt + 0.2), (hx * 0.5, y, zt + 0.16), (hx, y, zt)], 0.015, m="metal_gray", seg=5))
    P.append(cyl("tarp_roll", 0.12, hy1 - hy0, loc=(hx - 0.1, (hy0 + hy1) / 2, zt + 0.12), rot=(PI / 2, 0, 0), m="cloth_navy", verts=14))
    P.append(kit.tube("tarp_crank", [(hx - 0.1, hy0 - 0.02, zt + 0.12), (hx, hy0 - 0.15, zt - 0.4), (hx, hy0 - 0.15, 1.6)], 0.015, m="metal_gray", seg=5))
    # front corner auger: vertical lower tube + upper section folded across the front
    ax, ay = -hx + 0.25, hy1 + 0.3
    P.append(cyl("auger_lower", 0.24, zt + 0.3 - 1.0, loc=(ax, ay, (zt + 0.3 + 1.0) / 2), m=m, verts=16))
    P.append(kit.torus("auger_hinge", 0.26, 0.04, loc=(ax, ay, zt + 0.3), m="metal_dark", seg=16, rseg=5))
    up0 = V((ax, ay, zt + 0.35))
    up1 = V((hx - 0.1, ay + 0.15, zt + 1.15))
    P.append(kit.tube("auger_upper", [up0, up0 + (up1 - up0) * 0.05, up1], 0.22, m=m, seg=16))
    P.append(cyl("auger_spout", 0.25, 0.5, loc=up1 + V((0.1, 0.0, -0.25)), m="metal_dark", verts=14))
    P.append(seg_box("auger_rest", (hx - 0.2, ay + 0.1, zt), (hx - 0.15, ay + 0.15, zt + 0.95), 0.06, 0.06, "metal_dark"))
    for k in range(4):
        P.append(kit.torus("auger_band", 0.245, 0.015, loc=(ax, ay, 1.4 + k * 0.6), m="metal_dark", seg=16, rseg=4))
    P.append(seg_box("auger_cyl", (ax + 0.25, ay - 0.1, zt - 0.4), (ax + 0.9, ay + 0.05, zt + 0.55), 0.07, 0.07, "metal_gray"))
    # chassis: frame, A-frame tongue with hitch eye, PTO driveline, jack, axle, ladder, lights
    P.append(box("frame", (0.5, 4.6, 0.25), loc=(0, -0.2, 1.05), m="metal_dark"))
    for sx in (-1, 1):
        P.append(seg_box("tongue", (sx * 0.6, 1.9, 1.0), (0, 5.4, 0.62), 0.14, 0.16, "metal_dark"))
    P.append(box("hitch_eye", (0.2, 0.3, 0.06), loc=(0, 5.55, 0.6), m="metal_dark"))
    P.append(seg_box("pto_shaft", (0.0, 5.3, 0.75), (ax * 0.3, 2.4, 1.1), 0.07, 0.07, "metal_gray"))
    P.append(seg_box("pto_guard", (0.0, 5.0, 0.76), (ax * 0.27, 2.7, 1.07), 0.12, 0.12, "steel_painted_yellow"))
    P.append(seg_box("gearbox_drive", (ax * 0.3, 2.4, 1.1), (ax, ay, 1.1), 0.08, 0.08, "metal_gray"))
    P.append(cyl("jack", 0.05, 0.8, loc=(0.25, 4.6, 0.45), m="metal_dark", verts=10))
    P.append(box("jack_foot", (0.25, 0.25, 0.03), loc=(0.25, 4.6, 0.04), m="metal_dark"))
    P.append(box("axle", (3.4, 0.25, 0.25), loc=(0, -0.3, 1.0), m="metal_dark"))
    for k in range(7):
        P.append(box("ladder", (0.4, 0.04, 0.03), loc=(1.1, hy0 - 0.06, 0.5 + k * 0.42), m="metal_gray"))
    for sx in (-1, 1):
        P.append(box("tail_lamp", (0.14, 0.04, 0.1), loc=(sx * 1.3, hy0 - 0.04, 2.2), m="lamp_lens_red"))
        P.append(box("flasher", (0.12, 0.08, 0.1), loc=(sx * 1.6, hy0 + 0.1, 3.3), m="lamp_lens_amber"))
    P.append(prism("smv", kit.ccw([(-0.18, 0.0), (0.18, 0.0), (0.0, 0.31)]), 0, 0.01, m="lamp_lens_amber", loc=(-0.6, hy0 - 0.06, 2.6), rot=(PI / 2, 0, 0)))
    o = merge(P, "cart_body", par=root)
    finish(o, 35)
    for (nm, x) in (("L", -1.95), ("R", 1.95)):
        pv = empty(f"wheel_{nm}", loc=(x, -0.3, 1.0), parent=root)
        ag_tire(f"wheel_{nm}_t", pv, 1.0, 0.75, 0.55, 0.0, x < 0, n=24)
    kit.export_glb(os.path.join(kit.out_dir(), "graincart.glb"), root)
    if preview:
        kit.preview(os.path.join(kit.preview_dir(), "graincart.png"), (-7.5, 8.5, 3.5), (0, 0.3, 1.8), lens=35, samples=20, world=(0.62, 0.66, 0.7), sun=(0.4, 0.6, 0.7))


if __name__ == "__main__":
    pv = "--nopreview" not in sys.argv
    combine(pv)
    grain_cart(pv)
