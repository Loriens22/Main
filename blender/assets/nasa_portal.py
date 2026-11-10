"""
NASA facility exterior (realism pass): a cut-and-cover portal extension with stepped reveals and a rock-fill berm
projecting from the board-formed headwall, wing walls with railings, a detailed security booth with a boom barrier,
forecourt markings, trench drain, wedge vehicle barrier, bollards, signs, kerbs, flagpoles, manholes, wall packs,
cable trays and lighting inside the portal. Separate hill structures (ventilation stacks, antenna mast) are exported
to nasa_hill.glb and placed on the terrain at runtime.

Local frame: origin = centre of the portal opening at forecourt level, +Y = north into the mountain.
"""
import math, random
import bmesh
import kit, arch
from kit import V, box, cyl, prism, M, empty, merge, finish, set_props, lathe

PI = math.pi
R = random.Random(31)
OW, OH = 10.2, 7.6            # opening
EXT_Y0, EXT_Y1 = -12.0, -1.5  # portal extension (front face .. headwall)
EXT_HW, EXT_TOP = 8.0, 10.5


def col(name, c, s, rz=0.0, par=None, **kw):
    return arch.col_box(name, c, s, rz, par, **kw)


def seg(name, p0, p1, w, h, m, up=(0, 0, 1)):
    import farm_house
    return farm_house.seg_box(name, p0, p1, w, h, m, up)


def portal_exterior(root, P, G, L, lights):
    # ------------------------------------------------------------------ headwall (board-formed, battered, stepped coping)
    face_poly = [(-24, 0), (24, 0), (20.5, 18), (-20.5, 18)]
    facade = kit.prism_xz("facade", kit.ccw(face_poly), -1.5, 3.0, m="concrete")
    opening = box("open_cut", (OW, 8, OH), loc=(0, 0.7, OH / 2), m="concrete_dark")
    kit.boolean(facade, opening)
    P.append(facade)
    for k in range(7):   # formwork lift lines
        z = 2.4 + k * 2.2
        hw = 24 - z * 3.5 / 18
        if z > OH + 0.2:
            P.append(box("lift_line", (hw * 2 - 0.4, 0.03, 0.035), loc=(0, -1.515, z), m="concrete_dark"))
        else:
            for sx in (-1, 1):
                P.append(box("lift_line", (hw - OW / 2 - 0.2, 0.03, 0.035), loc=(sx * (OW / 2 + (hw - OW / 2) / 2), -1.515, z), m="concrete_dark"))
    for x in (-16, -8.5, 8.5, 16):   # expansion joints
        P.append(box("exp_joint", (0.05, 0.04, 17.6 - abs(x) * 0.05), loc=(x, -1.52, 8.8), m="frame_black"))
    for k in range(9):
        x = -20 + k * 5
        if abs(x) < 9:
            continue
        P.append(cyl("weep", 0.05, 0.12, loc=(x, -1.52, 0.6), rot=(PI / 2, 0, 0), m="frame_black", verts=8))
    P.append(box("coping", (41.6, 1.2, 0.5), loc=(0, -0.9, 18.25), m="concrete_dark", bevel=0.03))
    for k in range(6):
        P.append(box("vent", (1.4, 0.35, 0.7), loc=(-15 + k * 6, -1.6, 14.0), m="radiator_black"))
        for j in range(5):
            P.append(box("vent_louvre", (1.3, 0.06, 0.03), loc=(-15 + k * 6, -1.79, 13.75 + j * 0.13), rot=(0.6, 0, 0), m="metal_dark"))
    col("COL_facadeL", (-14.6, 0.75, 9), (19, 4.5, 18), 0, root)
    col("COL_facadeR", (14.6, 0.75, 9), (19, 4.5, 18), 0, root)
    col("COL_lintel", (0, 0.75, 12.8), (10.2, 4.5, 10.4), 0, root)
    # ------------------------------------------------------------------ cut-and-cover portal extension
    L_ext = EXT_Y1 - EXT_Y0
    ym = (EXT_Y0 + EXT_Y1) / 2
    for sx in (-1, 1):
        P.append(box("ext_wall", (EXT_HW - OW / 2, L_ext, EXT_TOP), loc=(sx * (OW / 2 + (EXT_HW - OW / 2) / 2), ym, EXT_TOP / 2), m="concrete"))
        P.append(prism("ext_haunch", kit.ccw([(0, 0), (-sx * 0.7, 0), (0, 0.7)]), 0, L_ext, m="concrete", loc=(sx * OW / 2, EXT_Y0, OH), rot=(-PI / 2, 0, 0)))
        col(f"COL_ext_wall{sx}", (sx * (OW / 2 + (EXT_HW - OW / 2) / 2), ym, EXT_TOP / 2), (EXT_HW - OW / 2, L_ext, EXT_TOP), 0, root)
        # interior: cable trays, light boxes, conduit, hydrants, emergency phone
        P.append(box("cable_tray", (0.4, L_ext - 0.4, 0.08), loc=(sx * (OW / 2 - 0.25), ym, 6.4), m="steel_galv"))
        for k in range(6):
            P.append(box("cable", (0.32, L_ext - 0.5, 0.05), loc=(sx * (OW / 2 - 0.25), ym, 6.47), m="rubber_black"))
        for k in range(3):
            yy = EXT_Y0 + 1.8 + k * 3.4
            P.append(box("wall_light", (0.12, 1.2, 0.25), loc=(sx * (OW / 2 - 0.08), yy, 5.4), m="metal_dark"))
            L.append(box("lampE|portal|w", (0.02, 1.1, 0.16), loc=(sx * (OW / 2 - 0.15), yy, 5.4), m="emit_cool"))
        lights.append(empty(f"light_portal_{len(lights)}", loc=(sx * 3.0, ym, 6.0), parent=root, light="cool", group="portal", intensity=8, distance=16))
        P.append(cyl("conduit", 0.05, L_ext - 0.4, loc=(sx * (OW / 2 - 0.08), ym, 3.2), rot=(PI / 2, 0, 0), m="steel_galv", verts=8))
        P.append(box("hydrant_box", (0.12, 0.9, 1.2), loc=(sx * (OW / 2 - 0.08), -7.5, 1.4), m="warning_red", bevel=0.02))
        P.append(box("kerb_in", (0.35, L_ext, 0.18), loc=(sx * (OW / 2 - 0.175), ym, 0.09), m="concrete_dark"))
        P.append(box("hazard_band", (0.06, L_ext, 0.6), loc=(sx * (OW / 2 - 0.03), ym, 0.5), m="warning_yellow"))
    P.append(box("ext_roof", (EXT_HW * 2, L_ext, EXT_TOP - OH), loc=(0, ym, (OH + EXT_TOP) / 2), m="concrete"))
    col("COL_ext_roof", (0, ym, (OH + EXT_TOP) / 2), (EXT_HW * 2, L_ext, EXT_TOP - OH), 0, root)
    for k in range(4):
        P.append(box("roof_rib", (OW, 0.4, 0.3), loc=(0, EXT_Y0 + 1.2 + k * 2.8, OH - 0.15), m="concrete_dark"))
    # stepped reveals on the front face + parapet with railing
    for k in range(3):
        d = 0.35 * (k + 1)
        P.append(box("reveal_top", (OW + 2 * d, 0.3, 0.35), loc=(0, EXT_Y0 - 0.15 - 0.3 * k * 0 + 0.0, OH + d - 0.175), m="concrete_dark" if k % 2 else "concrete"))
        for sx in (-1, 1):
            P.append(box("reveal_side", (0.35, 0.3, OH + d), loc=(sx * (OW / 2 + d - 0.175), EXT_Y0 - 0.15, (OH + d) / 2), m="concrete_dark" if k % 2 else "concrete"))
    P.append(box("headwall", (EXT_HW * 2 + 0.4, 0.6, 1.4), loc=(0, EXT_Y0 + 0.2, EXT_TOP + 0.7), m="concrete", bevel=0.03))
    for k in range(9):
        x = -EXT_HW + k * 2.0
        P.append(cyl("rail_post", 0.03, 1.1, loc=(x, EXT_Y0 + 0.3, EXT_TOP + 1.95), m="steel_galv", verts=8))
    for z in (EXT_TOP + 2.45, EXT_TOP + 1.95):
        P.append(cyl("rail", 0.025, EXT_HW * 2, loc=(0, EXT_Y0 + 0.3, z), rot=(0, PI / 2, 0), m="steel_galv", verts=8))
    P.append(box("portal_number", (2.6, 0.05, 0.6), loc=(0, EXT_Y0 - 0.02, OH + 1.6), m="metal_brushed"))
    P.append(box("portal_number_txt", (2.2, 0.02, 0.3), loc=(0, EXT_Y0 - 0.05, OH + 1.6), m="frame_black"))
    # rock-fill berm over the extension, sloping up to the headwall coping
    bm_ = bmesh.new()
    pts = []
    nx, ny = 10, 7
    for j in range(ny + 1):
        for i in range(nx + 1):
            u, v = i / nx, j / ny
            x = -EXT_HW - 3 + u * (EXT_HW * 2 + 6)
            y = EXT_Y0 + 0.5 + v * (EXT_Y1 - EXT_Y0 + 0.8)
            z = EXT_TOP + 0.5 + v * (18.0 - EXT_TOP - 0.5) * (0.55 + 0.45 * v) - (abs(u - 0.5) * 2) ** 2 * 5.5 + R.uniform(-0.25, 0.25)
            pts.append(bm_.verts.new((x, y, z)))
    for j in range(ny):
        for i in range(nx):
            a = pts[j * (nx + 1) + i]
            bm_.faces.new((a, pts[j * (nx + 1) + i + 1], pts[(j + 1) * (nx + 1) + i + 1], pts[(j + 1) * (nx + 1) + i]))
    bmesh.ops.recalc_face_normals(bm_, faces=bm_.faces)
    berm = kit.from_bmesh("berm", bm_, ("rock_granite",))
    for f in berm.data.polygons:
        if f.normal.z < 0:
            f.flip()
    P.append(berm)
    for k in range(40):   # boulders on the berm
        x = R.uniform(-EXT_HW - 2, EXT_HW + 2)
        y = R.uniform(EXT_Y0 + 1, EXT_Y1)
        v = (y - EXT_Y0) / (EXT_Y1 - EXT_Y0)
        z = EXT_TOP + 0.5 + v * (18.0 - EXT_TOP - 0.5) * (0.55 + 0.45 * v) - (abs((x + EXT_HW + 3) / (EXT_HW * 2 + 6) - 0.5) * 2) ** 2 * 5.5
        P.append(kit.sphere("boulder", R.uniform(0.3, 0.8), loc=(x, y, z), m="rock_granite", segs=8, rings=5, scale=(1, R.uniform(0.7, 1.2), R.uniform(0.5, 0.8))))
    # threshold: trench drain, stop bar, wedge barrier
    P.append(box("trench_drain", (OW + 2, 0.45, 0.06), loc=(0, EXT_Y0 - 1.0, 0.0), m="metal_dark"))
    for k in range(40):
        P.append(box("drain_slot", (0.04, 0.38, 0.065), loc=(-OW / 2 - 0.9 + k * 0.3, EXT_Y0 - 1.0, 0.0), m="frame_black"))
    P.append(box("wedge_plate", (OW - 0.6, 2.2, 0.08), loc=(0, EXT_Y0 - 4.5, 0.01), m="steel_painted_yellow"))
    for k in range(9):
        P.append(box("wedge_stripe", (0.35, 2.2, 0.085), loc=(-OW / 2 + 0.9 + k * 1.05, EXT_Y0 - 4.5, 0.012), rot=(0, 0, 0.6), m="frame_black"))
    for sx in (-1, 1):
        P.append(box("wedge_housing", (0.5, 2.4, 0.5), loc=(sx * (OW / 2 - 0.1), EXT_Y0 - 4.5, 0.25), m="steel_painted_gray", bevel=0.02))
    # ------------------------------------------------------------------ wing walls with railing and drainage
    for sx in (-1, 1):
        rz = sx * 0.55
        c, s = math.cos(rz), math.sin(rz)
        cx, cy = sx * 30, -7
        P.append(box("wingwall", (22, 1.4, 9), loc=(cx, cy, 4.0), rot=(0, 0, rz), m="concrete", bevel=0.05))
        P.append(box("wing_cap", (22.2, 1.7, 0.4), loc=(cx, cy, 8.6), rot=(0, 0, rz), m="concrete_dark"))
        col(f"COL_wing{sx}", (cx, cy, 4.5), (22, 1.6, 9), rz, root)
        for k in range(8):
            t = -10 + k * 2.8
            P.append(cyl("wing_post", 0.03, 1.1, loc=(cx + t * c, cy + t * s, 9.35), m="steel_galv", verts=8))
            P.append(cyl("wing_weep", 0.05, 0.1, loc=(cx + t * c + 0.72 * s, cy + t * s - 0.72 * c, 0.5), rot=(PI / 2, 0, rz), m="frame_black", verts=8))
        for z in (9.85, 9.4):
            P.append(seg("wing_rail", (cx - 10.5 * c, cy - 10.5 * s, z), (cx + 10.5 * c, cy + 10.5 * s, z), 0.05, 0.05, "steel_galv"))
        for k in range(3):
            t = -7 + k * 7
            P.append(box("wing_joint", (0.04, 0.05, 8.6), loc=(cx + t * c + 0.71 * s, cy + t * s - 0.71 * c, 4.2), rot=(0, 0, rz), m="frame_black"))
    # wall packs and floodlights on the headwall, cameras
    for sx in (-1, 1):
        P.append(box("flood_arm", (0.15, 1.6, 0.15), loc=(sx * 10.5, -2.4, 12.5), m="steel_painted_gray"))
        P.append(box("flood", (0.7, 0.45, 0.4), loc=(sx * 10.5, -3.1, 12.4), rot=(0.5, 0, 0), m="steel_painted_gray", bevel=0.03))
        L.append(box("lampE|flood|f", (0.6, 0.02, 0.32), loc=(sx * 10.5, -3.35, 12.27), rot=(0.5, 0, 0), m="emit_white"))
        lights.append(empty(f"light_flood_{len(lights)}", loc=(sx * 10.5, -6, 10), parent=root, light="cool", group="flood", intensity=60, distance=45))
        for x in (sx * 13, sx * 19):
            P.append(box("wallpack", (0.4, 0.25, 0.3), loc=(x, -1.65, 4.5), m="metal_dark", bevel=0.02))
            L.append(box("lampE|flood|wp", (0.32, 0.02, 0.1), loc=(x, -1.78, 4.4), m="emit_warm"))
        P.append(box("cam_body", (0.18, 0.45, 0.18), loc=(sx * (EXT_HW + 0.3), EXT_Y0 - 0.2, EXT_TOP - 0.8), rot=(0.35, 0, -sx * 0.4), m="steel_painted_white", bevel=0.03))
        P.append(box("cam_mount", (0.06, 0.4, 0.06), loc=(sx * (EXT_HW + 0.3), EXT_Y0 + 0.1, EXT_TOP - 0.7), m="metal_dark"))
        P.append(box("cam_led", (0.03, 0.02, 0.03), loc=(sx * (EXT_HW + 0.3), EXT_Y0 - 0.45, EXT_TOP - 0.85), m="emit_red"))

    # ------------------------------------------------------------------ forecourt
    P.append(box("forecourt", (60, 70, 0.1), loc=(0, -35, -0.03), m="asphalt"))
    for sx in (-1, 1):
        P.append(box("kerb", (0.3, 60, 0.2), loc=(sx * 28.5, -40, 0.1), m="concrete"))
    for k in range(10):   # parking bays with wheel stops
        x = -22 + k * 4.8
        P.append(box("parking_line", (0.12, 5.0, 0.012), loc=(x, -58, 0.03), m="paint_white_aero"))
        if k < 9:
            P.append(box("wheel_stop", (1.8, 0.2, 0.12), loc=(x + 2.4, -55.8, 0.06), m="concrete", bevel=0.02))
    for k in range(9):   # centre line dashes, stop bar, crosswalk, keep-clear box
        P.append(box("lane_dash", (0.15, 3.0, 0.012), loc=(0, -24 - k * 5.5, 0.03), m="paint_white_aero"))
    P.append(box("stop_bar", (OW, 0.4, 0.012), loc=(0, EXT_Y0 - 7.5, 0.03), m="paint_white_aero"))
    for k in range(7):
        P.append(box("crosswalk", (0.6, 3.2, 0.012), loc=(-4.8 + k * 1.6, -21.0, 0.03), m="paint_white_aero"))
    for (x0, y0, x1, y1) in ((-5, -13.6, 5, -13.6), (-5, -16.9, 5, -16.9)):
        P.append(box("keep_clear", (x1 - x0, 0.15, 0.012), loc=((x0 + x1) / 2, y0, 0.03), m="warning_yellow"))
    for (x, y) in ((-6, -30), (6, -46)):
        P.append(cyl("manhole", 0.35, 0.02, loc=(x, y, 0.025), m="metal_dark", verts=20))
    for k in range(10):   # bollards along the facade except the lane
        x = -20 + k * 4.4
        if abs(x) < OW / 2 + 3.5:
            continue
        P.append(cyl("bollard", 0.11, 1.0, loc=(x, -14, 0.5), m="steel_painted_yellow", verts=12))
        P.append(cyl("bollard_cap", 0.12, 0.05, loc=(x, -14, 1.02), m="steel_painted_yellow", verts=12))
        P.append(box("bollard_band", (0.23, 0.23, 0.05), loc=(x, -14, 0.85), m="frame_black"))
        col("COL_bollard", (x, -14, 0.5), (0.25, 0.25, 1.0), 0, root)
    for (x, y, r) in ((-8, -26, 0.0), (8, -26, 0.0), (-14, -32, 1.3), (14, -32, -1.3)):
        jb = kit.prism_xz("jersey", [(-0.3, 0), (0.3, 0), (0.12, 0.3), (0.1, 0.81), (-0.1, 0.81), (-0.12, 0.3)], -1.6, 1.6, m="concrete", loc=(x, y, 0))
        jb.rotation_euler = (0, 0, r)
        P.append(jb)
        col("COL_jersey", (x, y, 0.4), (0.6, 3.2, 0.8), r, root)
    for (x, y) in ((-22, -30), (22, -30), (-22, -60), (22, -60)):
        P.append(cyl("lpole", 0.12, 9, loc=(x, y, 4.5), m="steel_galv", verts=10))
        P.append(cyl("lpole_base", 0.35, 0.6, loc=(x, y, 0.3), m="concrete", verts=12))
        P.append(box("lhead", (1.1, 0.5, 0.2), loc=(x + (0.4 if x < 0 else -0.4), y, 9.0), m="steel_painted_gray"))
        L.append(box("lampE|flood|p", (0.9, 0.4, 0.02), loc=(x + (0.4 if x < 0 else -0.4), y, 8.89), m="emit_white"))
        lights.append(empty(f"light_flood_{len(lights)}", loc=(x, y, 8.2), parent=root, light="cool", group="flood", intensity=40, distance=35))
        col("COL_lpole", (x, y, 4.5), (0.3, 0.3, 9), 0, root)
    # signs: stop sign at the booth, speed limit, restricted-area board
    P.append(cyl("sign_post", 0.04, 2.5, loc=(5.6, -27, 1.25), m="steel_galv", verts=8))
    P.append(cyl("stop_sign", 0.38, 0.02, loc=(5.6, -27.03, 2.3), rot=(PI / 2, 0, 0), m="warning_red", verts=8))
    P.append(cyl("stop_rim", 0.34, 0.025, loc=(5.6, -27.04, 2.3), rot=(PI / 2, 0, 0), m="plastic_white", verts=8))
    P.append(cyl("stop_face", 0.32, 0.03, loc=(5.6, -27.05, 2.3), rot=(PI / 2, 0, 0), m="warning_red", verts=8))
    for sx in (-1, 1):
        P.append(cyl("board_post", 0.06, 3.0, loc=(-9 + sx * 1.3, -36, 1.5), m="steel_galv", verts=8))
    P.append(box("board", (3.2, 0.08, 1.6), loc=(-9, -36.05, 2.4), m="plastic_white", bevel=0.01))
    P.append(box("board_band", (3.2, 0.09, 0.4), loc=(-9, -36.06, 3.0), m="warning_red"))
    for k in range(3):
        P.append(box("board_text", (2.6 - k * 0.5, 0.09, 0.12), loc=(-9, -36.08, 2.45 - k * 0.25), m="frame_black"))
    # flagpoles with flags (simple striped flag geometry)
    for k, x in enumerate((-17, -14.5, -12)):
        P.append(cyl("flagpole", 0.06, 11, r2=0.04, loc=(x, -18, 5.5), m="metal_silver", verts=10))
        P.append(kit.sphere("flag_ball", 0.09, loc=(x, -18, 11.05), m="metal_bronze", segs=10, rings=6))
        P.append(cyl("flag_base", 0.3, 0.3, loc=(x, -18, 0.15), m="concrete", verts=12))
        fx = x + 0.06
        if k == 1:
            for j in range(13):
                P.append(box("flag_stripe", (1.9, 0.01, 0.1), loc=(fx + 0.95, -18, 10.7 - j * 0.1 + 0.05), rot=(0, 0, 0.05 * math.sin(j)), m="warning_red" if j % 2 == 0 else "plastic_white"))
            P.append(box("flag_canton", (0.76, 0.012, 0.7), loc=(fx + 0.38, -18, 10.4), m="cloth_navy"))
        else:
            P.append(box("flag", (1.6, 0.01, 1.05), loc=(fx + 0.8, -18, 10.2), rot=(0, 0, 0.06), m="cloth_navy" if k == 0 else "plastic_white"))
    # ------------------------------------------------------------------ security booth with boom barrier (inbound lane)
    security_booth(root, P, G, L, lights, (10.5, -24.0))
    # chain-link fence along the forecourt edge
    for side in (-1, 1):
        for k in range(14):
            P.append(cyl("fpost", 0.04, 2.6, loc=(side * 29.3, -8 - k * 4.5, 1.3), m="steel_galv", verts=8))
        P.append(cyl("ftop", 0.025, 58.5, loc=(side * 29.3, -37.25, 2.55), rot=(PI / 2, 0, 0), m="steel_galv", verts=6))
        P.append(box("fence_mesh", (0.02, 58.5, 2.4), loc=(side * 29.3, -37, 1.25), m="net"))
        for k in range(14):
            P.append(seg("barbed", (side * 29.3, -8 - k * 4.5, 2.6), (side * 29.6, -8 - k * 4.5, 3.0), 0.02, 0.02, "metal_gray"))
        P.append(cyl("barbed_wire", 0.008, 58.5, loc=(side * 29.55, -37.25, 2.95), rot=(PI / 2, 0, 0), m="metal_gray", verts=4))
        col(f"COL_fence{side}", (side * 29.3, -37, 1.3), (0.1, 58.5, 2.6), 0, root)
    # blast panel inside the portal extension
    box("blast_panel", (0.15, 0.5, 0.7), loc=(-OW / 2 + 0.1, -4.0, 1.4), m="console_dark", par=root, interact="blastpanel", iid="nasa_blast_panel", bevel=0.02)
    box("blast_panel_scr", (0.02, 0.36, 0.25), loc=(-OW / 2 + 0.18, -4.0, 1.55), m="emit_green", par=root)


def security_booth(root, P, G, L, lights, pos):
    x0, y0 = pos
    w, d, h = 3.4, 3.0, 2.6
    P.append(box("booth_plinth", (w + 0.6, d + 0.6, 0.25), loc=(x0, y0, 0.125), m="concrete"))
    P.append(box("booth_base", (w, d, 0.9), loc=(x0, y0, 0.7), m="metal_brushed", bevel=0.01))
    for (px, py) in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
        P.append(box("booth_post", (0.1, 0.1, h - 1.15), loc=(x0 + px * (w / 2 - 0.05), y0 + py * (d / 2 - 0.05), 1.15 + (h - 1.15) / 2), m="metal_dark"))
    for (sx, sy, ln, rz) in ((0, -1, w, 0), (0, 1, w, 0), (-1, 0, d, PI / 2), (1, 0, d, PI / 2)):
        cxx, cyy = x0 + sx * (w / 2 - 0.05), y0 + sy * (d / 2 - 0.05)
        G.append(box("booth_glass", (ln - 0.2, 0.02, h - 1.2), loc=(cxx, cyy, 1.15 + (h - 1.2) / 2), rot=(0, 0, rz), m="glass_clear"))
        P.append(box("booth_mullion", (0.05, 0.06, h - 1.2), loc=(cxx, cyy, 1.15 + (h - 1.2) / 2), rot=(0, 0, rz), m="metal_dark"))
    P.append(box("booth_roof", (w + 1.2, d + 1.2, 0.3), loc=(x0, y0, h + 0.15), m="steel_painted_white", bevel=0.02))
    P.append(box("booth_fascia", (w + 1.24, d + 1.24, 0.12), loc=(x0, y0, h + 0.06), m="metal_dark"))
    P.append(box("booth_ac", (0.8, 0.5, 0.55), loc=(x0 + w / 2 + 0.3, y0 + 0.6, 1.7), m="steel_painted_gray", bevel=0.02))
    P.append(box("booth_desk", (w - 0.4, 0.6, 0.06), loc=(x0, y0 - d / 2 + 0.45, 1.05), m="console_beige"))
    for k in range(2):
        P.append(box("booth_mon", (0.45, 0.05, 0.3), loc=(x0 - 0.6 + k * 1.0, y0 - d / 2 + 0.6, 1.3), rot=(0.2, 0, 0), m="plastic_dark"))
        P.append(box("booth_scr", (0.4, 0.01, 0.25), loc=(x0 - 0.6 + k * 1.0, y0 - d / 2 + 0.575, 1.3), rot=(0.2, 0, 0), m="emit_screen"))
    L.append(box("lampE|booth|b", (1.2, 0.6, 0.02), loc=(x0, y0, h - 0.02), m="emit_cool"))
    lights.append(empty(f"light_booth_{len(lights)}", loc=(x0, y0, h - 0.4), parent=root, light="cool", group="booth", intensity=3, distance=7))
    col("COL_booth", (x0, y0, h / 2), (w, d, h), 0, root)
    # intercom pedestal and boom barrier across the inbound lane (lane runs along Y at x≈+2.6)
    P.append(box("intercom", (0.25, 0.25, 1.3), loc=(x0 - w / 2 - 1.0, y0 - 2.0, 0.65), m="steel_painted_gray", bevel=0.02))
    P.append(box("intercom_face", (0.18, 0.02, 0.3), loc=(x0 - w / 2 - 1.0, y0 - 2.13, 1.1), m="console_dark"))
    bx, by = x0 - w / 2 - 0.6, y0 - 1.0
    P.append(box("boom_housing", (0.45, 0.45, 1.1), loc=(bx, by, 0.55), m="steel_painted_white", bevel=0.02))
    P.append(box("boom_stripe", (0.47, 0.47, 0.12), loc=(bx, by, 0.95), m="warning_red"))
    arm_len = 6.0
    for k in range(int(arm_len / 0.5)):
        P.append(box("boom_arm", (0.5, 0.08, 0.1), loc=(bx - 0.25 - k * 0.5, by, 1.0), m="warning_red" if k % 2 == 0 else "plastic_white"))
    P.append(box("boom_rest", (0.1, 0.1, 0.9), loc=(bx - arm_len + 0.1, by, 0.45), m="steel_painted_white"))
    P.append(cyl("booth_campole", 0.06, 4.5, loc=(x0 + 1.5, y0 + 2.2, 2.25), m="steel_galv", verts=8))
    P.append(box("booth_cam", (0.18, 0.45, 0.18), loc=(x0 + 1.5, y0 + 1.95, 4.4), rot=(0.3, 0, 0.6), m="steel_painted_white", bevel=0.03))


# ------------------------------------------------------------------------------------------------ hill structures
def hill_structures():
    """nasa_hill.glb: vent_stack and antenna_mast nodes, each with its origin at ground level."""
    kit.reset()
    root = empty("NasaHill")
    # ventilation stack: concrete box with louvres, cap and bird screen
    vs = empty("vent_stack", parent=root)
    P = [box("vs_body", (3.2, 3.2, 4.2), loc=(0, 0, 2.1), m="concrete", bevel=0.04),
         box("vs_footing", (4.0, 4.0, 0.6), loc=(0, 0, 0.0), m="concrete_dark"),
         box("vs_cap", (3.8, 3.8, 0.35), loc=(0, 0, 4.4), m="concrete_dark", bevel=0.03)]
    for rz in (0, PI / 2, PI, 3 * PI / 2):
        c, s = math.cos(rz), math.sin(rz)
        P.append(box("vs_frame", (2.4, 0.08, 1.8), loc=(1.61 * s * -1 if False else -1.61 * s, 1.61 * c * -1 if False else -1.61 * c, 3.0), rot=(0, 0, rz), m="metal_dark"))
        for k in range(8):
            P.append(box("vs_louvre", (2.3, 0.04, 0.16), loc=(-1.64 * s, -1.64 * c, 2.2 + k * 0.21), rot=(0.7, 0, rz), m="steel_galv"))
    P.append(box("vs_ladder", (0.5, 0.05, 4.0), loc=(0, -1.65, 2.2), m="steel_galv"))
    vm = merge(P, "vent_stack_mesh", par=vs)
    finish(vm, 35)
    arch.col_box("COL_vs", (0, 0, 2.2), (3.4, 3.4, 4.6), 0, vs)
    # antenna mast: 3-leg lattice tower with dishes, panels, aviation light, equipment shelter
    am = empty("antenna_mast", parent=root)
    P = []
    H = 32.0
    legs = [(math.cos(a) * 1.5, math.sin(a) * 1.5) for a in (PI / 2, PI / 2 + 2 * PI / 3, PI / 2 + 4 * PI / 3)]
    top = [(x * 0.35, y * 0.35) for (x, y) in legs]
    for (b, t) in zip(legs, top):
        P.append(seg("mast_leg", (b[0], b[1], 0), (t[0], t[1], H), 0.08, 0.08, "steel_galv"))
    n = 16
    for k in range(n):
        z0, z1 = H * k / n, H * (k + 1) / n
        f0, f1 = 1 - 0.65 * k / n, 1 - 0.65 * (k + 1) / n
        for i in range(3):
            a, b = legs[i], legs[(i + 1) % 3]
            p0 = (a[0] * f0, a[1] * f0, z0)
            p1 = (b[0] * f1, b[1] * f1, z1)
            P.append(seg("mast_brace", p0, p1, 0.035, 0.035, "steel_galv"))
            P.append(seg("mast_horiz", (a[0] * f1, a[1] * f1, z1), (b[0] * f1, b[1] * f1, z1), 0.03, 0.03, "steel_galv"))
    for (z, rz, r) in ((22, 0.4, 0.9), (17, -1.6, 1.2), (26, 2.4, 0.7)):
        c, s = math.cos(rz), math.sin(rz)
        d = lathe("mast_dish", [(0.0, 0.0), (r * 0.5, r * 0.07), (r, r * 0.25), (r * 1.02, r * 0.27), (0.0, 0.05)], m="steel_painted_white", seg=24)
        d.rotation_euler = (PI / 2, 0, rz)
        d.location = (c * 1.0, s * 1.0, z)
        P.append(d)
        P.append(seg("dish_arm", (c * 0.4, s * 0.4, z), (c * 1.0, s * 1.0, z), 0.08, 0.08, "metal_gray"))
    for k in range(3):
        a = PI / 2 + k * 2 * PI / 3 + PI / 3
        P.append(box("mast_panel", (0.35, 0.12, 1.6), loc=(math.cos(a) * 0.65, math.sin(a) * 0.65, H - 2.0), rot=(0, 0, a + PI / 2), m="plastic_white"))
    P.append(cyl("mast_tip", 0.04, 3.0, loc=(0, 0, H + 1.5), m="steel_galv", verts=6))
    P.append(kit.sphere("aviation_light", 0.12, loc=(0, 0, H + 3.1), m="emit_red", segs=10, rings=6))
    P.append(box("shelter", (3.0, 2.4, 2.6), loc=(4.0, 0, 1.3), m="steel_painted_white", bevel=0.03))
    P.append(box("shelter_door", (0.9, 0.05, 2.0), loc=(4.0, -1.22, 1.0), m="steel_painted_gray"))
    P.append(box("shelter_ac", (0.8, 0.5, 0.6), loc=(5.6, 0.4, 1.4), m="steel_painted_gray"))
    P.append(seg("cable_bridge", (3.0, 0, 2.4), (0.6, 0, 3.0), 0.3, 0.05, "steel_galv"))
    for (x, y) in ((-3, -3), (8, -3), (8, 3), (-3, 3)):
        P.append(cyl("mast_fpost", 0.04, 2.4, loc=(x, y, 1.2), m="steel_galv", verts=6))
    for (a, b) in (((-3, -3), (8, -3)), ((8, -3), (8, 3)), ((8, 3), (-3, 3)), ((-3, 3), (-3, -3))):
        P.append(box("mast_fence", (abs(b[0] - a[0]) + 0.02 if a[1] == b[1] else 0.02, abs(b[1] - a[1]) + 0.02 if a[0] == b[0] else 0.02, 2.3), loc=((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 1.15), m="net"))
    mm = merge(P, "antenna_mast_mesh", par=am)
    finish(mm, 35)
    arch.col_box("COL_mast", (0, 0, 2.0), (3.2, 3.2, 4.0), 0, am)
    arch.col_box("COL_shelter", (4.0, 0, 1.3), (3.0, 2.4, 2.6), 0, am)
    import os
    kit.export_glb(os.path.join(kit.out_dir(), "nasa_hill.glb"), root)
