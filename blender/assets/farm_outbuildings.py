"""Farm outbuildings: workshop/garage, barn, grain bins, tanks, fuel station, power line, clothesline, fence, mailbox."""
import math, random
import kit, arch
from kit import V, box, cyl, prism, M, empty, merge, finish, set_props

PI = math.pi


def metal_building(name, cx, cy, w, d, wall_h, ridge_h, P, door_w=4.5, door_h=4.0, wall_m="roof_metal", roof_m="roof_metal", interior=True, root=None, door_side="s"):
    ops_s = [(w / 2, door_w, 0.0, door_h)] if door_side == "s" else []
    ops_n = [(w / 2, door_w, 0.0, door_h)] if door_side == "n" else []
    x0, x1, y0, y1 = cx - w / 2, cx + w / 2, cy - d / 2, cy + d / 2
    arch.wall(name + "_s", (x0, y0), (x1, y0), 0, wall_h, 0.12, wall_m, ops_s, parts=P)
    arch.wall(name + "_e", (x1, y0), (x1, y1), 0, wall_h, 0.12, wall_m, [(d * 0.3, 1.0, 0.0, 2.1)], parts=P)
    arch.wall(name + "_n", (x1, y1), (x0, y1), 0, wall_h, 0.12, wall_m, ops_n, parts=P)
    arch.wall(name + "_w", (x0, y1), (x0, y0), 0, wall_h, 0.12, wall_m, [], parts=P)
    arch.gable_wall(name + "_gs", x0, x1, y0, wall_h, ridge_h, 0.1, wall_m, P)
    arch.gable_wall(name + "_gn", x0, x1, y1, wall_h, ridge_h, 0.1, wall_m, P)
    arch.gable_roof(name + "_roof", x0, x1, y0, y1, wall_h, ridge_h, over=0.35, ridge_axis="y", m=roof_m, fascia_m="steel_painted_white", parts=P)
    P.append(box(name + "_floor", (w, d, 0.15), loc=(cx, cy, 0.05), m="concrete"))
    for (cxx, cyy) in ((x0, y0), (x1, y0), (x1, y1), (x0, y1)):
        P.append(box(name + "_trim", (0.18, 0.18, wall_h), loc=(cxx, cyy, wall_h / 2), m="steel_painted_white"))
    if root is not None:
        ops_sc = [(w / 2, door_w, 0.0, door_h)] if door_side == "s" else []
        ops_nc = [(w / 2, door_w, 0.0, door_h)] if door_side == "n" else []
        arch.col_wall(name + "cs", (x0, y0), (x1, y0), 0, wall_h, 0.2, ops_sc, root)
        arch.col_wall(name + "ce", (x1, y0), (x1, y1), 0, wall_h, 0.2, [(d * 0.3, 1.0, 0.0, 2.1)], root)
        arch.col_wall(name + "cn", (x1, y1), (x0, y1), 0, wall_h, 0.2, ops_nc, root)
        arch.col_wall(name + "cw", (x0, y1), (x0, y0), 0, wall_h, 0.2, [], root)
        arch.col_box("COL_" + name + "_roof", (cx, cy, wall_h + 0.2), (w, d, 0.2), 0, root)


def outbuildings(root, P, G, L, lights):
    # ---- workshop / garage (enterable) at three (24, -14) → blender (24, 14), door facing south
    gx, gy = 24, 14
    metal_building("garage", gx, gy, 10, 12, 4.5, 6.6, P, door_w=4.8, door_h=4.0, wall_m="steel_painted_gray", roof_m="roof_metal", root=root)
    # workbench + tool wall
    P.append(box("bench_top", (5.0, 0.8, 0.06), loc=(gx, gy + 5.5, 0.95), m="wood_raw", bevel=0.01))
    for sx in (-2.3, 0, 2.3):
        P.append(box("bench_leg", (0.08, 0.7, 0.9), loc=(gx + sx, gy + 5.5, 0.47), m="steel_painted_gray"))
    P.append(box("pegboard", (4.6, 0.03, 1.4), loc=(gx, gy + 5.88, 1.85), m="console_beige"))
    rr = random.Random(9)
    for k in range(28):
        tx = gx - 2.1 + (k % 14) * 0.32
        tz = 1.45 + (k // 14) * 0.6
        if rr.random() < 0.5:
            P.append(box("tool", (0.04, 0.03, rr.uniform(0.2, 0.45)), loc=(tx, gy + 5.84, tz), rot=(0, rr.uniform(-0.3, 0.3), 0), m=rr.choice(["metal_gray", "farm_red", "steel_painted_yellow", "wood_raw"])))
        else:
            P.append(box("wrench", (0.03, 0.02, 0.28), loc=(tx, gy + 5.84, tz), m="metal_brushed"))
    P.append(box("vise", (0.2, 0.25, 0.18), loc=(gx + 2.0, gy + 5.4, 1.07), m="steel_painted_gray", bevel=0.02))
    arch.shelf_unit("gshelf", (gx - 4.5, gy + 2.0, 0.1), PI / 2, w=2.0, h=2.2, parts=P, items="boxes", seed=31)
    for k in range(4):
        P.append(kit.torus("tire_stack", 0.42, 0.14, loc=(gx + 4.2, gy - 3.5, 0.18 + k * 0.28), m="tire_rubber", seg=20, rseg=8))
    for k in range(3):
        P.append(cyl("drum", 0.29, 0.88, loc=(gx + 4.3, gy + 1.0 + k * 0.65, 0.54), m=["farm_red_faded", "steel_painted_yellow", "steel_painted_gray"][k], verts=20))
    # engine hoist
    P.append(box("hoist_base", (0.1, 1.4, 0.1), loc=(gx - 1.5, gy - 1.0, 0.15), m="farm_red"))
    P.append(box("hoist_mast", (0.12, 0.12, 2.0), loc=(gx - 1.5, gy - 0.4, 1.1), m="farm_red"))
    P.append(box("hoist_arm", (0.1, 1.6, 0.1), loc=(gx - 1.5, gy - 1.0, 2.0), rot=(0.2, 0, 0), m="farm_red"))
    P.append(box("compressor", (0.6, 0.4, 0.7), loc=(gx - 4.3, gy + 5.2, 0.45), m="farm_red", bevel=0.03))
    arch.ceiling_lamp("lamp_g1", (gx - 2, gy, 4.4), P, L, lights, "garage", root, kind="pendant")
    arch.ceiling_lamp("lamp_g2", (gx + 2, gy + 3, 4.4), P, L, lights, "garage", root, kind="pendant")
    box("switch_garage", (0.08, 0.02, 0.12), loc=(gx - 2.8, gy - 5.93, 1.3), m="plastic_white", par=root, interact="switch", iid="light_garage", group="garage")
    r = box("ROOM_garage", (9.8, 11.8, 4.4), loc=(gx, gy, 2.2), m="frame_black", par=root, room="garage")
    r.hide_render = True
    arch.col_box("COL_bench", (gx, gy + 5.5, 0.5), (5.0, 0.8, 1.0), 0, root)
    # roll-up door (interactive, slides up)
    rd = empty("rolldoor_garage", loc=(gx, gy - 6.0, 0.0), parent=root, interact="rolldoor", iid="garage_door")
    rparts = [box("rd_slat", (4.8, 0.05, 0.25), loc=(0, 0, 0.125 + k * 0.25), m="steel_painted_white", bevel=0.005) for k in range(16)]
    rm = merge(rparts, "rolldoor_mesh", par=rd)
    rm.location = (0, 0, 0)
    finish(rm, 30)
    arch.col_box("COL_rolldoor", (0, 0, 2.0), (4.8, 0.15, 4.0), 0, rd, door="garage_door")

    # ---- barn at three (-30,-32) → blender (-30, 32), faded red metal, doors to the south
    bx, by = -30, 32
    metal_building("barn", bx, by, 16, 22, 6.0, 9.5, P, door_w=7.0, door_h=5.5, wall_m="farm_red_faded", roof_m="roof_metal", root=root)
    for k in range(10):
        P.append(box("hay", (1.2, 0.5, 0.45), loc=(bx - 6 + (k % 5) * 1.25, by + 9.5, 0.3 + (k // 5) * 0.46), m="corn_tassel", bevel=0.05))
    for k in range(6):
        P.append(box("pallet_sacks", (1.2, 1.0, 0.9), loc=(bx + 5.5, by - 6 + k * 1.6, 0.55), m="fabric_bag", bevel=0.1, segs=2))
    r = box("ROOM_barn", (15.8, 21.8, 5.9), loc=(bx, by, 3.0), m="frame_black", par=root, room="barn")
    r.hide_render = True

    # ---- grain bins (corrugated cylinders + conical roofs), three (-48,-22),(-48,-10) → blender (-48,22),(-48,10)
    for i, (sx, sy) in enumerate(((-48, 22), (-48, 10))):
        P.append(cyl(f"bin{i}", 4.5, 8.0, loc=(sx, sy, 4.0), m="steel_galv", verts=48))
        for k in range(8):
            P.append(kit.torus(f"bin_ring{i}", 4.52, 0.04, loc=(sx, sy, 0.5 + k * 1.0), m="steel_galv", seg=48, rseg=4))
        P.append(cyl(f"bin_roof{i}", 4.7, 2.6, r2=0.6, loc=(sx, sy, 9.3), m="steel_galv", verts=48))
        P.append(cyl(f"bin_vent{i}", 0.6, 0.5, loc=(sx, sy, 10.85), m="steel_galv", verts=16))
        for k in range(18):
            P.append(box(f"bin_rung{i}", (0.4, 0.03, 0.03), loc=(sx + 4.6, sy, 0.4 + k * 0.48), rot=(0, 0, PI / 2), m="steel_galv"))
        for side in (-0.2, 0.2):
            P.append(box(f"bin_rail{i}", (0.04, 0.04, 8.6), loc=(sx + 4.62, sy + side, 4.3), m="steel_galv"))
        P.append(box(f"bin_door{i}", (0.06, 0.9, 1.4), loc=(sx + 4.5, sy - 1.5, 0.9), m="steel_galv"))
        arch.col_box(f"COL_bin{i}", (sx, sy, 4.0), (8.6, 8.6, 8.0), 0, root)
    P.append(kit.tube("auger", [(-43, 16, 0.5), (-46, 16, 10.2)], 0.2, m="steel_galv", seg=10))

    # ---- water tanks (image 1: teal poly tank) & blue tanks (image 2)
    for i, (x, y, r, hh, m) in enumerate(((-38, -6, 1.3, 2.6, "pipe_blue"), (-36, -2.5, 1.1, 2.2, "pipe_blue"))):
        P.append(cyl(f"tank{i}", r, hh, loc=(x, y, hh / 2), m=m, verts=28, bevel=0.05))
        P.append(cyl(f"tank_lid{i}", r * 0.3, 0.1, loc=(x, y, hh + 0.05), m="plastic_dark", verts=16))
        arch.col_box(f"COL_tank{i}", (x, y, hh / 2), (r * 1.8, r * 1.8, hh), 0, root)
    # ---- fuel tank on a stand, three (16, 26) → blender (16, -26): refuelling point for farm vehicles
    fx, fy = 16, -26
    P.append(cyl("fuel_tank", 0.95, 3.2, loc=(fx, fy, 2.3), rot=(0, PI / 2, 0), m="farm_red_faded", verts=28, bevel=0.03))
    for sx in (-1.1, 1.1):
        for sy in (-0.6, 0.6):
            P.append(box("fuel_leg", (0.1, 0.1, 1.4), loc=(fx + sx, fy + sy, 0.7), rot=(0, 0, 0), m="steel_painted_gray"))
    P.append(kit.tube("fuel_hose", [(fx + 1.4, fy - 0.5, 1.7), (fx + 1.6, fy - 0.9, 1.0), (fx + 1.5, fy - 1.1, 1.2)], 0.025, m="rubber_black", seg=8))
    P.append(box("fuel_nozzle", (0.08, 0.25, 0.12), loc=(fx + 1.5, fy - 1.15, 1.25), m="steel_painted_yellow"))
    box("fuel_hit", (1.0, 0.8, 1.2), loc=(fx + 1.5, fy - 1.0, 1.2), m="frame_black", par=root, interact="fuel", iid="farm_fuel").hide_render = True
    arch.col_box("COL_fueltank", (fx, fy, 1.6), (3.4, 2.0, 3.2), 0, root)
    # ---- power poles & lines to the house (three x=30,62,94; z=6 → blender y=-6)
    poles = [(30, -6), (62, -6), (94, -6)]
    tops = []
    for i, (x, y) in enumerate(poles):
        P.append(cyl(f"pole{i}", 0.14, 9.5, r2=0.11, loc=(x, y, 4.75), m="wood_raw", verts=12))
        P.append(box(f"pole_arm{i}", (1.8, 0.1, 0.12), loc=(x, y, 8.9), m="wood_raw"))
        for sx in (-0.75, 0.75):
            P.append(cyl(f"insul{i}", 0.04, 0.14, loc=(x + sx, y, 9.03), m="glass_clear", verts=8))
            tops.append((x + sx, y, 9.1))
        arch.col_box(f"COL_pole{i}", (x, y, 4.75), (0.3, 0.3, 9.5), 0, root)
    for k in range(len(poles) - 1):
        for side in (0, 1):
            a = tops[k * 2 + side]; b = tops[(k + 1) * 2 + side]
            pts = [(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t - 0.7 * math.sin(math.pi * t)) for t in [i / 10 for i in range(11)]]
            P.append(kit.tube("wire", pts, 0.016, m="rubber_black", seg=4))
    # drop to the house east gable
    a = tops[0]
    pts = [(a[0] + (3.8 - a[0]) * t, a[1] + (2.0 - a[1]) * t, a[2] + (7.4 - a[2]) * t - 0.4 * math.sin(math.pi * t)) for t in [i / 10 for i in range(11)]]
    P.append(kit.tube("service_drop", pts, 0.016, m="rubber_black", seg=4))
    # ---- clothesline (image 2) north-east of the house
    for x in (9.0, 16.0):
        P.append(cyl("cl_post", 0.05, 2.2, loc=(x, 7.0, 1.1), m="steel_galv", verts=8))
        P.append(box("cl_bar", (0.05, 1.0, 0.05), loc=(x, 7.0, 2.15), m="steel_galv"))
    for sy in (-0.4, 0.0, 0.4):
        P.append(kit.tube("cl_line", [(9.0, 7.0 + sy, 2.15), (12.5, 7.0 + sy, 2.0), (16.0, 7.0 + sy, 2.15)], 0.004, m="plastic_white", seg=4))
    rr = random.Random(2)
    for k in range(7):
        x = 9.6 + k * 0.85
        sy = rr.choice([-0.4, 0.0, 0.4])
        w, hh = rr.uniform(0.4, 0.8), rr.uniform(0.5, 0.9)
        P.append(box("cloth", (w, 0.01, hh), loc=(x, 7.0 + sy, 2.05 - hh / 2), rot=(0, 0, rr.uniform(-0.08, 0.08)), m=rr.choice(["fabric_bed", "cloth_denim", "cloth_flannel", "fabric_curtain", "cloth_khaki"])))
    # ---- fence posts with wire around the yard (west/north sides)
    for k in range(40):
        x = -62 + k * 3.0
        P.append(box("fence_post", (0.12, 0.12, 1.3), loc=(x, 45.5, 0.6), rot=(0, 0, rr.uniform(-0.05, 0.05)), m="wood_raw"))
    for z in (0.5, 0.9, 1.2):
        P.append(kit.tube("fence_wire", [(-62, 45.5, z), (55, 45.5, z)], 0.004, m="metal_gray", seg=4))
    for k in range(28):
        y = -40 + k * 3.0
        P.append(box("fence_post", (0.12, 0.12, 1.3), loc=(-61.5, y, 0.6), m="wood_raw"))
    for z in (0.5, 0.9, 1.2):
        P.append(kit.tube("fence_wire", [(-61.5, -40, z), (-61.5, 45.5, z)], 0.004, m="metal_gray", seg=4))
    # ---- mailbox at the end of the driveway (three (17, 246) → blender (17,-246))
    P.append(box("mail_post", (0.1, 0.1, 1.1), loc=(18, -244, 0.55), m="wood_raw"))
    P.append(cyl("mailbox", 0.15, 0.5, loc=(18, -244, 1.2), rot=(PI / 2, 0, 0), m="steel_galv", verts=16))
    box("mail_hit", (0.4, 0.7, 0.4), loc=(18, -244, 1.2), m="frame_black", par=root, interact="mailbox", iid="farm_mailbox").hide_render = True
    # ---- dust mounds by the house (image 2) and scrap
    for k in range(6):
        P.append(kit.torus("old_tire", 0.55, 0.18, loc=(-44 + k * 1.3, -12, 0.18), rot=(0, 0, k), m="tire_rubber", seg=20, rseg=8))


