"""
Secret NASA facility inside a former NORAD-style mountain bunker (research: Cheyenne Mountain; exterior filmed near
Canmore). Original design.

Local frame (Blender): origin = centre of the portal opening at forecourt level, +Y = north into the mountain.
Levels: z=0 entry/atrium/mission-control/labs; z=-35 hangar level & silo floor.
Exports:
  nasa.glb  — portal facade, forecourt, tunnel, atrium, mission control, labs, elevator, lower corridor, silo hall
  gate.glb  — security gate with guard booth and barrier arm
  rocket.glb — two-stage launch vehicle with payload adapter (Ranger rides on top)
  silo_doors.glb — concealed silo doors (placed at terrain level at runtime)
"""
import sys, os, math, random
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "lib"))
sys.path.insert(0, HERE)
import bpy
import kit, arch
import nasa_portal
from kit import V, box, cyl, prism, M, empty, merge, finish, set_props, lathe
PI = math.pi
LOW = -35.0
SILO_Y = 200.0
SILO_R = 16.0
R = random.Random(12)


def col(name, c, s, rz=0.0, par=None, **kw):
    return arch.col_box(name, c, s, rz, par, **kw)


def light_strip(P, L, lights, par, x, y, z, length, along="y", group="tunnel", every=8, kind="cool", lamp_m="emit_cool"):
    if along == "y":
        P.append(box("strip_housing", (0.35, length, 0.12), loc=(x, y, z + 0.06), m="metal_dark"))
        L.append(box(f"lampE|{group}|s", (0.22, length - 0.1, 0.03), loc=(x, y, z - 0.01), m=lamp_m))
        n = max(1, int(length / every))
        for k in range(n):
            lights.append(empty(f"light_{group}_{len(lights)}", loc=(x, y - length / 2 + (k + 0.5) * length / n, z - 0.6), parent=par, light=kind, group=group, intensity=6, distance=14))
    else:
        P.append(box("strip_housing", (length, 0.35, 0.12), loc=(x, y, z + 0.06), m="metal_dark"))
        L.append(box(f"lampE|{group}|s", (length - 0.1, 0.22, 0.03), loc=(x, y, z - 0.01), m=lamp_m))
        n = max(1, int(length / every))
        for k in range(n):
            lights.append(empty(f"light_{group}_{len(lights)}", loc=(x - length / 2 + (k + 0.5) * length / n, y, z - 0.6), parent=par, light=kind, group=group, intensity=6, distance=14))


def screen(name, par, loc, size, rot=(0, 0, 0), m="emit_screen"):
    import bmesh
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


def console_desk(P, x, y, z, rot, w=2.4):
    c, s = math.cos(rot), math.sin(rot)

    def Q(lx, ly, lz):
        return (x + lx * c - ly * s, y + lx * s + ly * c, z + lz)
    P.append(box("cdesk", (w, 0.9, 0.75), loc=Q(0, 0, 0.375), rot=(0, 0, rot), m="console_dark", bevel=0.02))
    P.append(box("cdesk_top", (w + 0.05, 0.95, 0.04), loc=Q(0, 0.02, 0.77), rot=(0, 0, rot), m="console_beige", bevel=0.01))
    P.append(box("cdesk_back", (w, 0.25, 0.55), loc=Q(0, 0.38, 1.05), rot=(-0.25, 0, rot), m="console_dark", bevel=0.02))
    for k in range(int(w / 0.8)):
        P.append(box("cmon", (0.62, 0.05, 0.42), loc=Q(-w / 2 + 0.4 + k * 0.8, 0.3, 1.1), rot=(-0.25, 0, rot), m="plastic_dark", bevel=0.01))
        P.append(box("cscr", (0.56, 0.01, 0.36), loc=Q(-w / 2 + 0.4 + k * 0.8, 0.27, 1.1), rot=(-0.25, 0, rot), m="emit_screen" if R.random() < 0.7 else "emit_screen_amber"))
        P.append(box("ckey", (0.45, 0.16, 0.03), loc=Q(-w / 2 + 0.4 + k * 0.8, -0.15, 0.8), rot=(0, 0, rot), m="plastic_dark"))
    for k in range(int(w / 0.8)):
        arch.chair("cchair", Q(-w / 2 + 0.4 + k * 0.8, -0.85, 0), rot + PI, "plastic_dark", P)


def nasa():
    kit.reset()
    root = empty("NASA")
    P, G, L, lights = [], [], [], []
    # ================================================================================== exterior: portal & forecourt
    nasa_portal.portal_exterior(root, P, G, L, lights)

    # ================================================================================== blast doors (slide into the piers)
    for sx, nm in ((-1, "L"), (1, "R")):
        dv = empty(f"blast_{nm}", loc=(sx * 2.55, 1.2, 0), parent=root, interact="blastdoor", iid="nasa_blast", side=sx)
        dp = [box("bd_leaf", (5.1, 1.1, 7.5), loc=(0, 0, 3.75), m="metal_gunmetal", bevel=0.04)]
        for k in range(5):
            dp.append(box("bd_rib", (5.0, 1.2, 0.18), loc=(0, 0, 0.9 + k * 1.45), m="metal_dark"))
        for k in range(8):
            dp.append(cyl("bd_bolt", 0.12, 1.25, loc=(-2.2 + k * 0.63, 0, 7.1), rot=(PI / 2, 0, 0), m="metal_brushed", verts=10))
        dp.append(box("bd_stripe", (5.05, 1.15, 0.3), loc=(0, 0, 0.25), m="steel_painted_yellow"))
        dm = merge(dp, f"blast_{nm}_mesh", par=dv)
        dm.location = (0, 0, 0)
        finish(dm, 30)
        col(f"COL_blast_{nm}", (0, 0, 3.75), (5.1, 1.2, 7.5), 0, dv, door="nasa_blast")

    # ================================================================================== entry tunnel y 3..60
    TW, TH = 10.0, 7.5
    for sx in (-1, 1):
        P.append(box("tun_wall", (0.8, 57, TH), loc=(sx * (TW / 2 + 0.4), 31.5, TH / 2), m="concrete", bevel=0.02))
        col(f"COL_tunwall{sx}", (sx * (TW / 2 + 0.4), 31.5, TH / 2), (0.8, 57, TH), 0, root)
        # cable trays and pipes along the walls
        P.append(box("tray", (0.5, 57, 0.08), loc=(sx * (TW / 2 - 0.25), 31.5, 5.9), m="steel_galv"))
        for k in range(3):
            P.append(kit.tube("pipe", [(sx * (TW / 2 - 0.15), 3, 6.4 + k * 0.25), (sx * (TW / 2 - 0.15), 60, 6.4 + k * 0.25)], 0.07 + k * 0.02, m=["pipe_blue", "steel_painted_yellow", "steel_galv"][k], seg=10))
        P.append(box("curb", (0.6, 57, 0.18), loc=(sx * (TW / 2 - 0.3), 31.5, 0.09), m="concrete_dark"))
    # vaulted ceiling (segmented arch)
    for k in range(12):
        a0 = PI * k / 12
        a1 = PI * (k + 1) / 12
        rr = TW / 2 + 0.4
        x0, z0 = math.cos(a0) * rr, math.sin(a0) * 1.8 + TH
        x1, z1 = math.cos(a1) * rr, math.sin(a1) * 1.8 + TH
        cx, cz = (x0 + x1) / 2, (z0 + z1) / 2
        ang = math.atan2(z1 - z0, x1 - x0)
        P.append(box("vault", (math.hypot(x1 - x0, z1 - z0) + 0.05, 57, 0.6), loc=(cx, 31.5, cz + 0.3), rot=(0, -ang, 0), m="concrete"))
    col("COL_tunceil", (0, 31.5, TH + 1.6), (TW + 1.6, 57, 0.5), 0, root)
    P.append(box("tun_floor", (TW, 57, 0.2), loc=(0, 31.5, -0.1), m="concrete_dark"))
    for k in range(10):
        P.append(box("lane", (0.15, 3.0, 0.01), loc=(0, 6 + k * 5.5, 0.01), m="steel_painted_yellow"))
    for k in range(6):
        P.append(box("rib_arch", (TW + 1.7, 0.6, 0.3), loc=(0, 6 + k * 10, TH + 0.2), m="concrete_dark"))
    light_strip(P, L, lights, root, 0, 31.5, TH + 1.55, 55, "y", "tunnel", every=10)
    # checkpoint at y = 40: booth + turnstiles + inner door frame
    P.append(box("chk_booth", (2.4, 3.0, 2.8), loc=(-3.6, 40, 1.4), m="concrete_dark", bevel=0.03))
    P.append(box("chk_glass", (0.05, 2.6, 1.0), loc=(-2.38, 40, 2.0), m="glass_clear"))
    P.append(box("chk_desk", (0.6, 2.4, 0.9), loc=(-2.1, 40, 0.45), m="console_dark"))
    screen("screen_checkpoint", root, (-2.0, 40.2, 1.2), (0.5, 0.32), rot=(0, 0, PI / 2))
    col("COL_booth", (-3.6, 40, 1.4), (2.4, 3.0, 2.8), 0, root)
    for k in range(3):
        P.append(box("turnstile", (0.15, 1.2, 1.0), loc=(-1.2 + k * 1.2, 40, 0.5), m="metal_brushed"))
    P.append(box("inner_frame_l", (2.0, 1.5, TH), loc=(-4.0, 46, TH / 2), m="metal_gunmetal"))
    P.append(box("inner_frame_r", (2.0, 1.5, TH), loc=(4.0, 46, TH / 2), m="metal_gunmetal"))
    P.append(box("inner_frame_t", (10, 1.5, 1.5), loc=(0, 46, TH - 0.75), m="metal_gunmetal"))
    dv = empty("inner_door", loc=(0, 46, 0), parent=root, interact="slidedoor", iid="nasa_inner")
    dp = [box("id_leaf", (6.0, 0.5, 6.0), loc=(0, 0, 3.0), m="metal_gunmetal", bevel=0.03), box("id_stripe", (6.0, 0.55, 0.25), loc=(0, 0, 0.3), m="steel_painted_yellow")]
    dm = merge(dp, "inner_door_mesh", par=dv)
    dm.location = (0, 0, 0)
    finish(dm, 30)
    col("COL_inner", (0, 0, 3.0), (6.0, 0.6, 6.0), 0, dv, door="nasa_inner")
    # signage
    P.append(box("sign_bg", (4, 0.08, 0.8), loc=(0, 45.2, 6.6), m="console_dark"))
    P.append(box("sign_txt", (3.2, 0.02, 0.25), loc=(0, 45.15, 6.65), m="emit_white"))

    # ================================================================================== atrium (circular, 3 levels)
    AC = (0, 82)
    AR = 20.0
    AH = 16.0
    nseg = 36
    openings = {9: "east", 27: "west", 0: None}
    for k in range(nseg):
        a0 = 2 * PI * k / nseg
        a1 = 2 * PI * (k + 1) / nseg
        am = (a0 + a1) / 2
        x0, y0 = AC[0] + math.cos(a0) * AR, AC[1] + math.sin(a0) * AR
        x1, y1 = AC[0] + math.cos(a1) * AR, AC[1] + math.sin(a1) * AR
        # doorways: south (tunnel, a=270°), north (elevator corridor, 90°), east (labs, 0°), west (mission control, 180°)
        deg = math.degrees(am) % 360
        door = any(abs(deg - d) < 6 for d in (0, 90, 180, 270))
        ops = [(math.hypot(x1 - x0, y1 - y0) / 2, math.hypot(x1 - x0, y1 - y0) + 0.05, 0, 6.5 if deg % 180 == 0 or abs(deg - 270) < 6 else 6.5)] if door else []
        arch.wall("atr_wall", (x0, y0), (x1, y1), 0, AH, 0.8, "concrete", ops, parts=P)
        arch.col_wall(f"atr{k}", (x0, y0), (x1, y1), 0, AH, 0.9, ops, root)
        # wall light bands
        if not door:
            L.append(box(f"lampE|atrium|w", (math.hypot(x1 - x0, y1 - y0) * 0.7, 0.05, 0.12), loc=((x0 + x1) / 2 - math.cos(am) * 0.45, (y0 + y1) / 2 - math.sin(am) * 0.45, 4.6), rot=(0, 0, am + PI / 2), m="emit_warm"))
    P.append(cyl("atr_floor", AR + 0.4, 0.2, loc=(AC[0], AC[1], -0.1), m="concrete_dark", verts=48))
    P.append(cyl("atr_floor_inlay", 6, 0.02, loc=(AC[0], AC[1], 0.01), m="metal_brushed", verts=48))
    P.append(kit.torus("atr_inlay_ring", 9, 0.06, loc=(AC[0], AC[1], 0.02), m="metal_brushed", seg=64, rseg=4))
    P.append(cyl("atr_ceil", AR + 0.4, 0.6, loc=(AC[0], AC[1], AH + 0.3), m="concrete", verts=48))
    col("COL_atr_floor", (AC[0], AC[1], -0.1), (2 * AR, 2 * AR, 0.2), 0, root)
    # balconies at 5.5 and 11 (ring walkways 3.2 m wide with railings), circular void in the middle
    for lvl in (5.5, 11.0):
        P.append(lathe("balcony", [(AR - 3.4, lvl - 0.35), (AR, lvl - 0.35), (AR, lvl), (AR - 3.4, lvl), (AR - 3.4, lvl - 0.35)], m="concrete", seg=48, loc=(AC[0], AC[1], 0)))
        P.append(kit.torus("rail_top", AR - 3.35, 0.04, loc=(AC[0], AC[1], lvl + 1.05), m="metal_brushed", seg=64, rseg=6))
        P.append(lathe("rail_glass", [(AR - 3.38, lvl), (AR - 3.38, lvl + 1.0)], m="glass_clear", seg=64, loc=(AC[0], AC[1], 0)))
        L.append(kit.torus(f"lampE|atrium|b{lvl}", AR - 3.5, 0.05, loc=(AC[0], AC[1], lvl - 0.4), m="emit_warm", seg=64, rseg=4))
        for k in range(16):
            a = 2 * PI * k / 16
            P.append(cyl("bal_col", 0.25, lvl - 0.35 if lvl < 6 else 5.15, loc=(AC[0] + math.cos(a) * (AR - 3.0), AC[1] + math.sin(a) * (AR - 3.0), (lvl - 0.35) / 2 if lvl < 6 else 5.5 + 2.6), m="concrete_dark", verts=16))
        # balcony collision as segments + railing
        for k in range(24):
            a = 2 * PI * (k + 0.5) / 24
            cx, cy = AC[0] + math.cos(a) * (AR - 1.7), AC[1] + math.sin(a) * (AR - 1.7)
            col(f"COL_bal{lvl}_{k}", (cx, cy, lvl - 0.18), (3.4, 2 * PI * (AR - 1.7) / 24 + 0.1, 0.35), a, root)
            rx, ry = AC[0] + math.cos(a) * (AR - 3.4), AC[1] + math.sin(a) * (AR - 3.4)
            col(f"COL_rail{lvl}_{k}", (rx, ry, lvl + 0.55), (0.1, 2 * PI * (AR - 3.4) / 24 + 0.1, 1.1), a, root)
        for k in range(12):
            a = 2 * PI * k / 12
            lights.append(empty(f"light_atrium_{len(lights)}", loc=(AC[0] + math.cos(a) * (AR - 2), AC[1] + math.sin(a) * (AR - 2), lvl - 0.8), parent=root, light="warm", group="atrium", intensity=5, distance=12))
    # spiral-ish stair to the balconies (straight flights along the wall, east-north-east)
    arch.stairs("atr_stair1", (14.0, 70.5, 0.0), PI / 2, 1.6, 5.5, 18, 7.6, parts=P, m="concrete_dark", stringer_m="metal_dark", par=root)
    arch.stairs("atr_stair2", (-14.0, 93.5, 5.5), -PI / 2, 1.6, 5.5, 18, 7.6, parts=P, m="concrete_dark", stringer_m="metal_dark", par=root)
    # centrepiece: suspended scale model of Endurance (ring + modules) in the void
    ring_c = (AC[0], AC[1], 9.5)
    P.append(kit.torus("model_ring", 3.0, 0.08, loc=ring_c, rot=(PI / 2, 0, 0), m="metal_brushed", seg=48, rseg=6))
    for k in range(12):
        a = 2 * PI * k / 12
        P.append(box("model_mod", (0.9, 0.5, 0.6), loc=(ring_c[0] + math.cos(a) * 3.0, ring_c[1], ring_c[2] + math.sin(a) * 3.0), rot=(0, -a, 0), m="paint_white_aero", bevel=0.03))
    P.append(cyl("model_hub", 0.4, 1.2, loc=ring_c, rot=(PI / 2, 0, 0), m="paint_white_aero"))
    P.append(cyl("model_spoke", 0.08, 6.0, loc=ring_c, rot=(0, PI / 2, 0), m="metal_brushed", verts=8))
    for sx in (-1, 1):
        P.append(cyl("model_cable", 0.01, 6.5, loc=(ring_c[0] + sx * 2.5, ring_c[1], ring_c[2] + 3.4), m="metal_dark", verts=4))
    # atrium big display wall (north side above the elevator door)
    screen("screen_atrium", root, (AC[0], AC[1] + AR - 0.55, 9.0), (10, 4.5), rot=(0, 0, 0))
    # ROOM volumes
    rv = box("ROOM_nasa_atrium", (2 * AR, 2 * AR, AH), loc=(AC[0], AC[1], AH / 2), m="frame_black", par=root, room="nasa_atrium")
    rv.hide_render = True
    rv = box("ROOM_nasa_tunnel", (TW, 58, TH + 2), loc=(0, 32, (TH + 2) / 2), m="frame_black", par=root, room="nasa_tunnel")
    rv.hide_render = True

    # ================================================================================== mission control (west)
    MX0, MX1, MY0, MY1 = -70.0, -24.0, 62.0, 102.0
    MH = 9.0
    arch.wall("mc_n", (MX1, MY1), (MX0, MY1), 0, MH, 0.6, "concrete", [], parts=P)
    arch.wall("mc_w", (MX0, MY1), (MX0, MY0), 0, MH, 0.6, "concrete", [], parts=P)
    arch.wall("mc_s", (MX0, MY0), (MX1, MY0), 0, MH, 0.6, "concrete", [], parts=P)
    arch.wall("mc_e", (MX1, MY0), (MX1, MY1), 0, MH, 0.6, "concrete", [(20.0, 4.0, 0, 4.2)], parts=P)
    arch.col_wall("mcn", (MX1, MY1), (MX0, MY1), 0, MH, 0.6, [], root)
    arch.col_wall("mcw", (MX0, MY1), (MX0, MY0), 0, MH, 0.6, [], root)
    arch.col_wall("mcs", (MX0, MY0), (MX1, MY0), 0, MH, 0.6, [], root)
    arch.col_wall("mce", (MX1, MY0), (MX1, MY1), 0, MH, 0.6, [(20.0, 4.0, 0, 4.2)], root)
    # connecting corridor atrium (x=-20) → MC (x=-24)
    for sy in (-1, 1):
        P.append(box("mc_corr_wall", (5, 0.4, 4.4), loc=(-22, 82 + sy * 2.2, 2.2), m="concrete"))
        col(f"COL_mccorr{sy}", (-22, 82 + sy * 2.2, 2.2), (5, 0.4, 4.4), 0, root)
    P.append(box("mc_corr_ceil", (5, 4.8, 0.3), loc=(-22, 82, 4.4), m="concrete"))
    P.append(box("mc_floor", (MX1 - MX0, MY1 - MY0, 0.2), loc=((MX0 + MX1) / 2, (MY0 + MY1) / 2, -0.1), m="int_floor"))
    P.append(box("mc_ceil", (MX1 - MX0, MY1 - MY0, 0.3), loc=((MX0 + MX1) / 2, (MY0 + MY1) / 2, MH + 0.15), m="int_panel_dark"))
    col("COL_mc_floor", ((MX0 + MX1) / 2, (MY0 + MY1) / 2, -0.1), (MX1 - MX0, MY1 - MY0, 0.2), 0, root)
    # tiered floor: 4 tiers rising toward the east (operators face the west screen wall)
    for t in range(4):
        x0 = -62 + t * 7.5
        zt = t * 0.45
        if t > 0:
            P.append(box("tier", (7.5, 34, zt), loc=(x0 + 3.75, 82, zt / 2), m="int_floor", bevel=0.01))
            P.append(box("tier_edge", (0.08, 34, 0.05), loc=(x0, 82, zt), m="emit_cool"))
            col(f"COL_tier{t}", (x0 + 3.75, 82, zt / 2), (7.5, 34, zt), 0, root)
        for row_y in (68.5, 75.5, 88.5, 95.5):
            console_desk(P, x0 + 3.0, row_y, zt, PI / 2, w=4.8)
            col("COL_console", (x0 + 3.0, row_y, zt + 0.4), (0.95, 4.8, 0.8), 0, root)
    # central aisle ramp markers
    # screen wall (west): one huge + 6 side screens
    P.append(box("screenwall_frame", (0.4, 38, 7.6), loc=(MX0 + 0.5, 82, 4.6), m="console_dark"))
    screen("screen_mc_main", root, (MX0 + 0.75, 82, 5.0), (16, 6.0), rot=(0, 0, PI / 2))
    for k, (yy, zz) in enumerate(((67.5, 6.5), (67.5, 2.9), (96.5, 6.5), (96.5, 2.9), (72.8, 1.4), (91.2, 1.4))):
        screen(f"screen_mc_{k}", root, (MX0 + 0.75, yy, zz), (5.6 if k < 4 else 4.0, 3.2 if k < 4 else 1.2), rot=(0, 0, PI / 2))
    # director's glass office at the back (east), raised
    P.append(box("dir_floor", (7, 14, 1.8), loc=(-28, 82, 0.9), m="int_floor"))
    col("COL_dir_floor", (-28, 82, 0.9), (7, 14, 1.8), 0, root)
    P.append(box("dir_glass", (0.05, 14, 3.0), loc=(-31.5, 82, 3.3), m="glass_clear"))
    col("COL_dir_glass", (-31.5, 82, 3.3), (0.1, 14, 3.0), 0, root)
    arch.stairs("dir_stair", (-33.5, 72.5, 1.35), 0, 1.4, 0.45, 3, 1.0, parts=P, m="int_floor", par=root)
    arch.desk("dir_desk", (-27.5, 84, 1.8), -PI / 2, 2.0, parts=P)
    arch.chair("dir_chair", (-26.6, 84, 1.8), -PI / 2, "leather_brown", P)
    for k in range(6):
        for row in range(2):
            light_strip(P, L, lights, root, -66 + k * 7.5, 72 + row * 20, MH - 0.05, 6, "y", "mc", every=6, kind="cool")
    rv = box("ROOM_nasa_mc", (MX1 - MX0, MY1 - MY0, MH), loc=((MX0 + MX1) / 2, (MY0 + MY1) / 2, MH / 2), m="frame_black", par=root, room="nasa_mc")
    rv.hide_render = True
    # stations (interactive terminals) — iid identifies the data shown
    stations = [("mc_telemetry", (-58.5, 68.5)), ("mc_orbits", (-58.5, 75.5)), ("mc_fuel", (-58.5, 88.5)), ("mc_crew", (-58.5, 95.5)),
                ("mc_config", (-51, 68.5)), ("mc_saturn", (-51, 75.5)), ("mc_wormhole", (-51, 88.5)), ("mc_planets", (-51, 95.5)),
                ("mc_countdown", (-43.5, 75.5)), ("mc_environment", (-43.5, 88.5)), ("mc_eng", (-36, 68.5)), ("mc_sci", (-36, 75.5)), ("mc_med", (-36, 88.5)), ("mc_dir", (-36, 95.5))]
    for iid, (x, y) in stations:
        tier = int((x + 62) // 7.5)
        hb = box(f"term_{iid}_hit", (1.2, 4.6, 1.2), loc=(x + 0.2, y, tier * 0.45 + 1.0), m="frame_black", par=root, interact="terminal", iid=iid)
        hb.hide_render = True
        empty(f"station_{iid}", loc=(x - 1.0, y, tier * 0.45), rot=(0, 0, PI / 2), parent=root)

    # ================================================================================== labs wing (east)
    LX0, LX1 = 22.0, 82.0
    CY = 82.0
    # corridor
    for sy in (-1, 1):
        ops = [(10.0, 1.6, 0, 2.6), (25.0, 1.6, 0, 2.6), (40.0, 1.6, 0, 2.6), (52.0, 1.6, 0, 2.6)]
        arch.wall(f"lab_corr{sy}", (LX0, CY + sy * 2.4), (LX1, CY + sy * 2.4), 0, 4.0, 0.3, "concrete", ops, parts=P)
        arch.col_wall(f"labc{sy}", (LX0, CY + sy * 2.4), (LX1, CY + sy * 2.4), 0, 4.0, 0.3, ops, root)
    P.append(box("lab_corr_floor", (LX1 - LX0, 4.8, 0.2), loc=((LX0 + LX1) / 2, CY, -0.1), m="int_floor"))
    P.append(box("lab_corr_ceil", (LX1 - LX0, 4.8, 0.2), loc=((LX0 + LX1) / 2, CY, 4.1), m="int_panel_light"))
    col("COL_labcorr_floor", ((LX0 + LX1) / 2, CY, -0.1), (LX1 - LX0, 4.8, 0.2), 0, root)
    light_strip(P, L, lights, root, (LX0 + LX1) / 2, CY, 3.95, LX1 - LX0 - 1, "x", "labs", every=8, kind="cool")
    # rooms: (name, x0, x1, side) side=+1 north, -1 south
    rooms = [("greenhouse", 22, 37, 1), ("briefing", 22, 37, -1), ("workshop", 37, 47, 1), ("lifesupport", 37, 47, -1), ("computers", 47, 57, 1), ("storage", 47, 57, -1)]
    for nm, x0, x1, side in rooms:
        y0 = CY + side * 2.4
        y1 = CY + side * 16.4
        ya, yb = (y0, y1) if side > 0 else (y1, y0)
        arch.wall(f"{nm}_far", (x0, y1), (x1, y1), 0, 4.0, 0.3, "concrete", [], parts=P)
        arch.wall(f"{nm}_w", (x0, ya), (x0, yb), 0, 4.0, 0.3, "concrete", [], parts=P)
        arch.wall(f"{nm}_e", (x1, ya), (x1, yb), 0, 4.0, 0.3, "concrete", [], parts=P)
        arch.col_wall(f"{nm}f", (x0, y1), (x1, y1), 0, 4.0, 0.3, [], root)
        arch.col_wall(f"{nm}w", (x0, ya), (x0, yb), 0, 4.0, 0.3, [], root)
        arch.col_wall(f"{nm}e", (x1, ya), (x1, yb), 0, 4.0, 0.3, [], root)
        P.append(box(f"{nm}_floor", (x1 - x0, 14, 0.2), loc=((x0 + x1) / 2, (ya + yb) / 2, -0.1), m="int_floor" if nm != "greenhouse" else "tile_white"))
        P.append(box(f"{nm}_ceil", (x1 - x0, 14, 0.2), loc=((x0 + x1) / 2, (ya + yb) / 2, 4.1), m="int_panel_light"))
        col(f"COL_{nm}_floor", ((x0 + x1) / 2, (ya + yb) / 2, -0.1), (x1 - x0, 14, 0.2), 0, root)
        rv = box(f"ROOM_nasa_{nm}", (x1 - x0, 14, 4.0), loc=((x0 + x1) / 2, (ya + yb) / 2, 2.0), m="frame_black", par=root, room=f"nasa_{nm}")
        rv.hide_render = True
        cx, cy = (x0 + x1) / 2, (ya + yb) / 2
        if nm == "greenhouse":
            for r in range(4):
                for k in range(3):
                    yy = cy - 5 + k * 5
                    xx = x0 + 2.5 + r * 3.3
                    P.append(box("gh_rack", (1.2, 4.0, 0.9), loc=(xx, yy, 0.45), m="steel_galv"))
                    P.append(box("gh_tray", (1.1, 3.9, 0.15), loc=(xx, yy, 0.95), m="plastic_white"))
                    for pk in range(10):
                        P.append(cyl("gh_plant", 0.04, R.uniform(0.4, 0.9), loc=(xx + R.uniform(-0.4, 0.4), yy - 1.8 + pk * 0.4, 1.3), m="plant_green", verts=5))
                    L.append(box("lampE|greenhouse|g", (1.0, 3.8, 0.04), loc=(xx, yy, 2.6), m="emit_warm"))
            lights.append(empty(f"light_greenhouse_{len(lights)}", loc=(cx, cy, 3.2), parent=root, light="warm", group="greenhouse", intensity=10, distance=14))
            hb = box("term_greenhouse_hit", (2, 2, 2), loc=(cx, cy, 1.0), m="frame_black", par=root, interact="terminal", iid="lab_greenhouse")
            hb.hide_render = True
        elif nm == "briefing":
            arch.table("brief_table", (cx, cy, 0), 7.0, 2.2, parts=P, m="console_dark")
            for k in range(6):
                for sy in (-1, 1):
                    arch.chair("bchair", (cx - 3 + k * 1.2, cy + sy * 1.5, 0), PI if sy > 0 else 0, "plastic_dark", P)
            screen("screen_briefing", root, (x0 + 0.25, cy, 2.2), (4.0, 2.2), rot=(0, 0, PI / 2))
            hb = box("term_briefing_hit", (1, 4, 2.5), loc=(x0 + 0.6, cy, 2.0), m="frame_black", par=root, interact="terminal", iid="lab_briefing")
            hb.hide_render = True
            col("COL_btable", (cx, cy, 0.38), (7.0, 2.2, 0.76), 0, root)
        elif nm == "workshop":
            P.append(box("ws_bench", (8, 1.0, 0.95), loc=(cx, y1 - side * 1.0, 0.48), m="steel_painted_gray", bevel=0.02))
            col("COL_wsbench", (cx, y1 - side * 1.0, 0.48), (8, 1.0, 0.95), 0, root)
            # a spare Ranger landing leg and RCS pod on stands
            P.append(box("ws_stand", (2.0, 2.0, 0.8), loc=(cx - 2, cy, 0.4), m="steel_painted_yellow"))
            P.append(cyl("ws_leg", 0.1, 2.2, loc=(cx - 2, cy, 1.2), rot=(0, PI / 2 * 0.8, 0), m="metal_gray", verts=12))
            P.append(box("ws_rcs", (0.7, 0.6, 0.5), loc=(cx + 2, cy, 1.05), m="paint_charcoal", bevel=0.03))
            P.append(box("ws_cart", (1.0, 1.4, 0.8), loc=(cx + 2, cy, 0.4), m="farm_red"))
            hb = box("term_workshop_hit", (8, 1.2, 1.5), loc=(cx, y1 - side * 1.0, 1.0), m="frame_black", par=root, interact="terminal", iid="lab_workshop")
            hb.hide_render = True
        elif nm == "lifesupport":
            for k in range(3):
                P.append(cyl("ls_tank", 1.1, 3.4, loc=(x0 + 2 + k * 3.0, cy - 3, 1.7), m="steel_painted_white", verts=24))
                P.append(cyl("ls_fan", 0.8, 0.5, loc=(x0 + 2 + k * 3.0, cy + 3, 2.5), rot=(PI / 2, 0, 0), m="radiator_black", verts=20))
                col(f"COL_lstank{k}", (x0 + 2 + k * 3.0, cy - 3, 1.7), (2.2, 2.2, 3.4), 0, root)
            for k in range(4):
                P.append(kit.tube("ls_pipe", [(x0 + 0.5, cy - 6 + k * 0.6, 3.5), (x1 - 0.5, cy - 6 + k * 0.6, 3.5)], 0.09, m=["pipe_blue", "steel_painted_yellow", "steel_galv", "warning_red"][k], seg=10))
            hb = box("term_ls_hit", (1.5, 1.5, 2), loc=(cx, cy, 1.0), m="frame_black", par=root, interact="terminal", iid="lab_lifesupport")
            hb.hide_render = True
        elif nm == "computers":
            for r in range(3):
                for k in range(5):
                    P.append(box("rack", (0.65, 1.1, 2.2), loc=(x0 + 2.2 + r * 2.8, cy - 5 + k * 2.2, 1.1), m="console_dark", bevel=0.01))
                    for j in range(8):
                        L.append(box("lampE|computers|led", (0.02, 0.6, 0.02), loc=(x0 + 2.2 + r * 2.8 - 0.33, cy - 5 + k * 2.2, 0.4 + j * 0.22), m="emit_green" if (j + k) % 3 else "emit_screen_amber"))
                col(f"COL_racks{r}", (x0 + 2.2 + r * 2.8, cy, 1.1), (0.7, 11, 2.2), 0, root)
            hb = box("term_comp_hit", (1, 1, 2), loc=(x1 - 1.5, cy, 1.0), m="frame_black", par=root, interact="terminal", iid="lab_computers")
            hb.hide_render = True
        elif nm == "storage":
            for r in range(3):
                arch.shelf_unit("st_shelf", (x0 + 2.5 + r * 2.8, cy, 0), PI / 2, w=8.0, h=2.8, d=0.9, parts=P, items="boxes", seed=40 + r)
                col(f"COL_shelf{r}", (x0 + 2.5 + r * 2.8, cy, 1.4), (0.9, 8.0, 2.8), 0, root)
        if nm not in ("greenhouse",):
            light_strip(P, L, lights, root, cx, cy, 3.95, 10, "y", f"labs", every=10, kind="cool")
    rv = box("ROOM_nasa_labs", (LX1 - LX0, 4.8, 4.0), loc=((LX0 + LX1) / 2, CY, 2.0), m="frame_black", par=root, room="nasa_labs")
    rv.hide_render = True
    # connector atrium (x=20) → lab corridor (x=22)
    P.append(box("lab_conn_ceil", (3, 4.8, 0.3), loc=(21, CY, 4.3), m="concrete"))

    # ================================================================================== elevator (atrium north) down to hangar level
    EY = AC[1] + AR + 4.0  # elevator shaft centre y = 106
    for sx in (-1, 1):
        P.append(box("el_shaft", (0.6, 9, 16 - LOW), loc=(sx * 4.6, EY, (16 + LOW) / 2), m="concrete"))
        col(f"COL_elshaft{sx}", (sx * 4.6, EY, (16 + LOW) / 2), (0.6, 9, 16 - LOW), 0, root)
    P.append(box("el_back", (9.8, 0.6, 16 - LOW), loc=(0, EY + 4.6, (16 + LOW) / 2), m="concrete"))
    col("COL_elback_up", (0, EY + 4.6, 8 - 2), (9.8, 0.6, 16 + 4), 0, root)
    P.append(box("el_guide_l", (0.2, 0.3, 16 - LOW), loc=(-4.1, EY + 3.8, (16 + LOW) / 2), m="steel_painted_yellow"))
    P.append(box("el_guide_r", (0.2, 0.3, 16 - LOW), loc=(4.1, EY + 3.8, (16 + LOW) / 2), m="steel_painted_yellow"))
    ev = empty("elevator", loc=(0, EY, 0), parent=root, interact="elevator", iid="nasa_elevator")
    ep = [box("el_deck", (8.4, 8.4, 0.3), loc=(0, 0, -0.15), m="int_grate"), box("el_frame", (8.4, 8.4, 0.25), loc=(0, 0, -0.45), m="steel_painted_yellow")]
    for sx in (-1, 1):
        ep.append(box("el_rail", (0.06, 8.4, 1.1), loc=(sx * 4.15, 0, 0.55), m="steel_painted_yellow"))
    ep.append(box("el_rail_b", (8.4, 0.06, 1.1), loc=(0, 4.15, 0.55), m="steel_painted_yellow"))
    ep.append(box("el_panel", (0.4, 0.15, 1.2), loc=(3.6, -3.9, 0.6), m="console_dark"))
    em = merge(ep, "elevator_mesh", par=ev)
    em.location = (0, 0, 0)
    finish(em, 30)
    col("COL_elevator_deck", (0, 0, -0.2), (8.4, 8.4, 0.4), 0, ev, mover="nasa_elevator")
    box("el_button", (0.25, 0.12, 0.3), loc=(3.6, -4.0, 1.0), m="emit_green", par=ev, interact="elevator", iid="nasa_elevator_btn")
    L.append(box("lampE|elev|e", (8, 0.2, 0.05), loc=(0, EY - 4.0, 15.6), m="emit_cool"))

    # ================================================================================== lower level: corridor to the silo hall (z = LOW)
    CW, CH = 9.0, 7.0
    cy0, cy1 = EY + 4.4, SILO_Y - SILO_R - 1.0
    P.append(box("low_floor", (CW, cy1 - cy0 + 9, 0.3), loc=(0, (cy0 + cy1) / 2 - 4.5, LOW - 0.15), m="concrete_dark"))
    col("COL_low_floor", (0, (cy0 + cy1) / 2 - 4.5, LOW - 0.15), (CW, cy1 - cy0 + 9, 0.3), 0, root)
    P.append(box("low_floor_shaft", (9.8, 9.8, 0.3), loc=(0, EY, LOW - 0.15), m="concrete_dark"))
    for sx in (-1, 1):
        P.append(box("low_wall", (0.6, cy1 - cy0, CH), loc=(sx * (CW / 2 + 0.3), (cy0 + cy1) / 2, LOW + CH / 2), m="concrete"))
        col(f"COL_lowwall{sx}", (sx * (CW / 2 + 0.3), (cy0 + cy1) / 2, LOW + CH / 2), (0.6, cy1 - cy0, CH), 0, root)
        P.append(box("low_tray", (0.4, cy1 - cy0, 0.08), loc=(sx * (CW / 2 - 0.2), (cy0 + cy1) / 2, LOW + 5.5), m="steel_galv"))
        P.append(kit.tube("fuel_line", [(sx * (CW / 2 - 0.3), cy0, LOW + 0.6), (sx * (CW / 2 - 0.3), cy1, LOW + 0.6)], 0.18, m="steel_painted_white" if sx < 0 else "pipe_blue", seg=12))
    P.append(box("low_ceil", (CW + 1.2, cy1 - cy0, 0.5), loc=(0, (cy0 + cy1) / 2, LOW + CH + 0.25), m="concrete"))
    light_strip(P, L, lights, root, 0, (cy0 + cy1) / 2, LOW + CH - 0.05, cy1 - cy0 - 2, "y", "lower", every=12)
    for k in range(int((cy1 - cy0) / 6)):
        P.append(box("hazard", (0.6, 0.6, 0.02), loc=(-CW / 2 + 0.5, cy0 + 3 + k * 6, LOW + 0.02), m="steel_painted_yellow"))
    rv = box("ROOM_nasa_lower", (CW, cy1 - cy0 + 9, CH), loc=(0, (cy0 + cy1) / 2 - 4.5, LOW + CH / 2), m="frame_black", par=root, room="nasa_lower")
    rv.hide_render = True

    # ================================================================================== silo hall at the bottom (z = LOW .. LOW+12) — the shaft above is built at runtime
    P.append(cyl("silo_floor", SILO_R + 6, 0.4, loc=(0, SILO_Y, LOW - 0.2), m="concrete_dark", verts=48))
    col("COL_silo_floor", (0, SILO_Y, LOW - 0.2), (2 * SILO_R + 12, 2 * SILO_R + 12, 0.4), 0, root)
    # flame trench: grated pit under the rocket
    P.append(cyl("flame_pit", 6.5, 0.5, loc=(0, SILO_Y, LOW + 0.05), m="nozzle_inner", verts=32))
    # launch mount pedestal (4 hold-down posts)
    for k in range(4):
        a = PI / 4 + k * PI / 2
        P.append(box("holddown", (1.2, 1.2, 5.6), loc=(math.cos(a) * 4.6, SILO_Y + math.sin(a) * 4.6, LOW + 2.8), rot=(0, 0, a), m="steel_painted_gray", bevel=0.05))
        col(f"COL_holddown{k}", (math.cos(a) * 4.6, SILO_Y + math.sin(a) * 4.6, LOW + 2.8), (1.2, 1.2, 5.6), a, root)
    # hangar ring walkway around the silo bottom with workstations
    for k in range(10):
        a = 2 * PI * k / 10
        if abs(math.degrees(a) - 270) < 20:
            continue
        x, y = math.cos(a) * (SILO_R + 3), SILO_Y + math.sin(a) * (SILO_R + 3)
        console_desk(P, x, y, LOW, a + PI / 2, w=2.4)
        col(f"COL_hconsole{k}", (x, y, LOW + 0.5), (2.4, 1.0, 1.0), a + PI / 2, root)
    # gantry tower (east side) with platforms and the crew access arm
    GX = SILO_R - 3.5
    gantry_top = LOW + 82
    for sx in (-1.5, 1.5):
        for sy in (-1.5, 1.5):
            P.append(box("g_col", (0.35, 0.35, gantry_top - LOW), loc=(GX + sx, SILO_Y + sy, (gantry_top + LOW) / 2), m="steel_painted_gray"))
    for k in range(int((gantry_top - LOW) / 4)):
        z = LOW + 2 + k * 4
        for sx in (-1.5, 1.5):
            P.append(box("g_brace", (0.12, 3.0, 0.12), loc=(GX + sx, SILO_Y, z), rot=(0.9 if k % 2 else -0.9, 0, 0), m="steel_painted_gray"))
    for k in range(8):
        z = LOW + 10 + k * 10
        P.append(box("g_platform", (4.5, 4.5, 0.15), loc=(GX, SILO_Y, z), m="int_grate"))
        P.append(box("g_rail", (4.5, 0.05, 1.0), loc=(GX, SILO_Y - 2.25, z + 0.5), m="steel_painted_yellow"))
        L.append(box(f"lampE|silo|g{k}", (0.6, 0.3, 0.1), loc=(GX + 1.8, SILO_Y + 1.8, z + 2.5), m="emit_warm"))
        lights.append(empty(f"light_silo_{len(lights)}", loc=(GX - 2, SILO_Y, z + 2.0), parent=root, light="warm", group="silo", intensity=14, distance=20))
    col("COL_gantry", (GX, SILO_Y, (gantry_top + LOW) / 2), (3.4, 3.4, gantry_top - LOW), 0, root)
    # crew access arm at payload adapter height (adapter door at LOW + 6 + 40 + 18 + 1.5 = LOW+65.5)
    ARM_Z = LOW + 64.8
    P.append(box("arm", (GX - 4.6, 2.0, 0.2), loc=((GX + 4.6) / 2 - 0.8, SILO_Y, ARM_Z), m="int_grate"))
    P.append(box("arm_roof", (GX - 4.6, 2.2, 0.1), loc=((GX + 4.6) / 2 - 0.8, SILO_Y, ARM_Z + 2.4), m="steel_painted_white"))
    for sy in (-1, 1):
        P.append(box("arm_wall", (GX - 4.6, 0.06, 2.4), loc=((GX + 4.6) / 2 - 0.8, SILO_Y + sy * 1.05, ARM_Z + 1.2), m="steel_painted_white"))
    col("COL_arm", ((GX + 4.6) / 2 - 0.8, SILO_Y, ARM_Z - 0.1), (GX - 4.6, 2.0, 0.2), 0, root)
    # gantry lift cage (moves between hangar and arm)
    lv = empty("gantry_lift", loc=(GX, SILO_Y - 2.9, LOW), parent=root, interact="gantrylift", iid="gantry_lift")
    lp = [box("gl_deck", (2.0, 1.6, 0.15), loc=(0, 0, 0.0), m="int_grate"), box("gl_cage", (2.0, 1.6, 2.4), loc=(0, 0, 1.2), m="net")]
    lm = merge(lp, "gantry_lift_mesh", par=lv)
    lm.location = (0, 0, 0)
    finish(lm, 30)
    col("COL_gl_deck", (0, 0, -0.05), (2.0, 1.6, 0.2), 0, lv, mover="gantry_lift")
    box("gl_button", (0.2, 0.1, 0.25), loc=(0.8, -0.82, 1.1), m="emit_green", par=lv, interact="gantrylift", iid="gantry_lift_btn")
    # silo hall entry & ring wall (lower 12 m; shaft continues at runtime)
    for k in range(48):
        a0 = 2 * PI * k / 48
        a1 = 2 * PI * (k + 1) / 48
        am = (a0 + a1) / 2
        deg = math.degrees(am) % 360
        RR = SILO_R + 7.5
        x0, y0 = math.cos(a0) * RR, SILO_Y + math.sin(a0) * RR
        x1, y1 = math.cos(a1) * RR, SILO_Y + math.sin(a1) * RR
        ops = [(math.hypot(x1 - x0, y1 - y0) / 2, math.hypot(x1 - x0, y1 - y0) + 0.05, LOW, LOW + 6.5)] if abs(deg - 270) < 5 else []
        arch.wall("silo_ring", (x0, y0), (x1, y1), LOW, LOW + 14, 0.9, "concrete", ops, parts=P)
        arch.col_wall(f"siloring{k}", (x0, y0), (x1, y1), LOW, LOW + 14, 1.0, ops, root)
    P.append(lathe("silo_ledge", [(SILO_R + 0.5, LOW + 14), (SILO_R + 8, LOW + 14), (SILO_R + 8, LOW + 14.8), (SILO_R + 0.5, LOW + 14.8), (SILO_R + 0.5, LOW + 14)], m="concrete", seg=48, loc=(0, SILO_Y, 0)))
    for k in range(16):
        a = 2 * PI * k / 16
        lights.append(empty(f"light_silo_{len(lights)}", loc=(math.cos(a) * (SILO_R + 4), SILO_Y + math.sin(a) * (SILO_R + 4), LOW + 12), parent=root, light="cool", group="silo", intensity=18, distance=26))
        L.append(box(f"lampE|silo|r{k}", (1.0, 0.3, 0.1), loc=(math.cos(a) * (SILO_R + 7.0), SILO_Y + math.sin(a) * (SILO_R + 7.0), LOW + 13.6), rot=(0, 0, a + PI / 2), m="emit_cool"))
    rv = box("ROOM_nasa_silo", (2 * SILO_R + 15, 2 * SILO_R + 15, 120), loc=(0, SILO_Y, LOW + 60), m="frame_black", par=root, room="nasa_silo")
    rv.hide_render = True
    # anchors
    empty("spawn_entry", loc=(0, -12, 0), parent=root)
    empty("spawn_mc", loc=(-30, 78, 0), rot=(0, 0, PI / 2), parent=root)
    empty("spawn_silo", loc=(0, SILO_Y - SILO_R - 4, LOW), parent=root)
    empty("spawn_atrium", loc=(0, 66, 0), parent=root)
    empty("rocket_base", loc=(0, SILO_Y, LOW + 5.6), parent=root)
    empty("arm_tip", loc=(4.4, SILO_Y, ARM_Z + 0.1), parent=root)
    empty("director_spot", loc=(-27.5, 82.5, 1.8), rot=(0, 0, PI / 2), parent=root)

    # ---------------- merge by region & export
    def region(o):
        x, y, z = o.location
        if y < 2:
            return "exterior"
        if y < 60:
            return "tunnel"
        if z < -5 or y > 110:
            return "lower"
        if x < -22:
            return "mc"
        if x > 20:
            return "labs"
        return "atrium"
    groups = {}
    for o in P:
        groups.setdefault(region(o), []).append(o)
    for k, objs in groups.items():
        m = merge(objs, f"nasa_{k}", par=root)
        finish(m, 35)
    g = [o for o in G]
    if g:
        gm = merge(g, "nasa_glass", par=root)
        finish(gm, 10)
    bygroup = {}
    for o in L:
        grp = o.name.split("|")[1] if "|" in o.name else "misc"
        bygroup.setdefault(grp, []).append(o)
    for grp, objs in bygroup.items():
        lm = merge(objs, f"lamps_{grp}", par=root, group=grp, lampmesh=1)
        finish(lm, 30)
    for o in kit.all_children(root, True):
        if o.type == "MESH" and not o.data.uv_layers:
            kit.uv_box(o)
    kit.export_glb(os.path.join(kit.out_dir(), "nasa.glb"), root)
    pd = kit.preview_dir()
    kit.preview(os.path.join(pd, "nasa_portal.png"), (-24, -52, 7), (0, -8, 6), lens=30, samples=16, world=(0.7, 0.68, 0.6))


def gate():
    kit.reset()
    root = empty("Gate")
    P = []
    # guard booth, barrier arm, fence segments, warning signs
    for (a, b) in (((-1.4, -1.6), (1.4, -1.6)), ((1.4, -1.6), (1.4, 1.6)), ((1.4, 1.6), (-1.4, 1.6)), ((-1.4, 1.6), (-1.4, -1.6))):
        arch.wall("bw", a, b, 0, 1.0, 0.12, "steel_painted_white", [], parts=P)
    P.append(box("bglass", (2.8, 3.2, 1.3), loc=(0, 0, 1.65), m="glass_dark"))
    P.append(box("broof", (3.4, 3.8, 0.2), loc=(0, 0, 2.45), m="steel_painted_white", bevel=0.03))
    P.append(box("bdesk", (0.6, 2.4, 0.9), loc=(0.8, 0, 0.45), m="console_dark"))
    arch.col_box("COL_booth", (0, 0, 1.3), (2.9, 3.3, 2.6), 0, root)
    P.append(box("barrier_post", (0.5, 0.5, 1.1), loc=(-2.2, 0, 0.55), m="steel_painted_yellow", bevel=0.02))
    arch.col_box("COL_bpost", (-2.2, 0, 0.55), (0.5, 0.5, 1.1), 0, root)
    for sx in (-1, 1):
        for k in range(10):
            P.append(cyl("gfpost", 0.04, 2.5, loc=(sx * (8 + k * 3.0), 0, 1.25), m="steel_galv", verts=8))
        P.append(box("gfence", (27, 0.02, 2.3), loc=(sx * 21.5, 0, 1.2), m="net"))
        arch.col_box(f"COL_gfence{sx}", (sx * 21.5, 0, 1.2), (27, 0.1, 2.4), 0, root)
        P.append(kit.tube("razor", [(sx * 8, 0, 2.55), (sx * 35, 0, 2.55)], 0.12, m="metal_gray", seg=6))
    P.append(box("sign_post", (0.08, 0.08, 2.2), loc=(-9, -2.5, 1.1), m="steel_galv"))
    P.append(box("sign", (1.6, 0.04, 1.0), loc=(-9, -2.55, 2.0), m="paint_white_aero"))
    P.append(box("sign_band", (1.6, 0.05, 0.25), loc=(-9, -2.57, 2.38), m="warning_red"))
    P.append(cyl("gate_lamp", 0.1, 4.5, loc=(2.0, -2.0, 2.25), m="steel_galv", verts=8))
    o = merge(P, "gate_static", par=root)
    finish(o, 35)
    arm = empty("barrier_arm", loc=(-2.2, 0, 1.0), parent=root, interact="barrier", iid="gate_barrier")
    ap = [box("arm_bar", (7.0, 0.12, 0.12), loc=(3.5, 0, 0), m="steel_painted_white")]
    for k in range(6):
        ap.append(box("arm_stripe", (0.5, 0.13, 0.13), loc=(0.8 + k * 1.1, 0, 0), m="warning_red"))
    am = merge(ap, "barrier_arm_mesh", par=arm)
    am.location = (0, 0, 0)
    finish(am, 30)
    arch.col_box("COL_barrier", (3.5, 0, 0), (7.0, 0.3, 0.3), 0, arm, door="gate_barrier")
    box("gate_hit", (1.0, 1.0, 1.4), loc=(1.5, -1.8, 1.2), m="frame_black", par=root, interact="gatebooth", iid="gate_booth").hide_render = True
    kit.export_glb(os.path.join(kit.out_dir(), "gate.glb"), root)


def rocket():
    """Two-stage heavy launcher (original design) — Ranger rides on top, nose up."""
    kit.reset()
    root = empty("Rocket")
    # stage 1: 40 m, r=4.2, 5 engines
    s1 = empty("stage1", parent=root)
    p1 = [cyl("s1_body", 4.2, 40, loc=(0, 0, 20), m="paint_white_worn", verts=48)]
    for k in range(9):
        p1.append(kit.torus("s1_ring", 4.22, 0.05, loc=(0, 0, 2 + k * 4.5), m="metal_gray", seg=48, rseg=4))
    p1.append(cyl("s1_band", 4.25, 3.0, loc=(0, 0, 36.5), m="paint_dark_aero", verts=48))
    p1.append(cyl("s1_skirt", 4.6, 3.0, r2=4.2, loc=(0, 0, 1.5), m="paint_dark_aero", verts=48))
    for k in range(4):
        a = PI / 4 + k * PI / 2
        p1.append(box("s1_fin", (0.3, 2.6, 5.0), loc=(math.cos(a) * 4.9, math.sin(a) * 4.9, 3.0), rot=(0, 0, a + PI / 2), m="paint_dark_aero", bevel=0.05))
        p1.append(box("s1_tunnel", (0.5, 0.6, 34), loc=(math.cos(a + 0.4) * 4.25, math.sin(a + 0.4) * 4.25, 20), rot=(0, 0, a), m="paint_white_worn"))
    for (x, y) in ((0, 0), (2.4, 0), (-2.4, 0), (0, 2.4), (0, -2.4)):
        p1.append(lathe("s1_nozzle", [(0.5, 0.0), (0.55, -0.3), (0.9, -1.4), (1.25, -2.6), (1.3, -2.7)], m="nozzle_inner", seg=24, loc=(x, y, 0)))
    for k in range(6):
        p1.append(box("s1_flag", (0.02, 1.2, 0.8), loc=(4.21, 0, 30), m="paint_dark_aero"))
    m1 = merge(p1, "stage1_mesh", par=s1)
    finish(m1, 35)
    empty("s1_plume", loc=(0, 0, -2.7), parent=s1)
    # stage 2: 18 m, r=3.5, 1 engine (nozzle hidden in interstage)
    s2 = empty("stage2", loc=(0, 0, 40), parent=root)
    p2 = [cyl("interstage", 4.2, 4.0, r2=3.6, loc=(0, 0, 2.0), m="paint_dark_aero", verts=48),
          cyl("s2_body", 3.5, 14, loc=(0, 0, 11), m="paint_white_worn", verts=48)]
    for k in range(4):
        p2.append(kit.torus("s2_ring", 3.52, 0.04, loc=(0, 0, 5 + k * 3.5), m="metal_gray", seg=48, rseg=4))
    p2.append(lathe("s2_nozzle", [(0.4, 0.0), (0.45, -0.3), (1.0, -1.6), (1.5, -3.0)], m="nozzle_inner", seg=24, loc=(0, 0, 3.8)))
    m2 = merge(p2, "stage2_mesh", par=s2)
    finish(m2, 35)
    empty("s2_plume", loc=(0, 0, 0.8), parent=s2)
    # payload adapter with crew access door and the Ranger mount (Ranger rear faces down)
    ad = empty("adapter", loc=(0, 0, 58), parent=root)
    pa = [cyl("adapter_body", 3.4, 3.2, r2=2.9, loc=(0, 0, 1.6), m="paint_dark_aero", verts=48),
          box("adapter_door", (1.1, 0.2, 1.9), loc=(2.95, 0, 1.6), rot=(0, 0, PI / 2), m="hatch_gray", bevel=0.02),
          box("adapter_door_frame", (1.3, 0.15, 2.1), loc=(3.0, 0, 1.6), rot=(0, 0, PI / 2), m="warning_yellow")]
    for k in range(6):
        a = 2 * PI * k / 6
        pa.append(box("mount_strut", (0.25, 0.25, 2.2), loc=(math.cos(a) * 2.6, math.sin(a) * 2.6, 3.8), rot=(math.sin(a) * 0.25, -math.cos(a) * 0.25, 0), m="metal_gray"))
    ma = merge(pa, "adapter_mesh", par=ad)
    finish(ma, 35)
    empty("ranger_mount", loc=(0, 0, 63.2), parent=root)  # Ranger rear hatch centre sits here
    empty("adapter_door", loc=(3.3, 0, 59.6), parent=root, interact="board", iid="ranger_board")
    kit.export_glb(os.path.join(kit.out_dir(), "rocket.glb"), root)


def silo_doors():
    kit.reset()
    root = empty("SiloDoors")
    P = [cyl("collar", SILO_R + 4, 1.4, loc=(0, 0, -0.5), m="concrete", verts=48)]
    o = merge(P, "silo_collar", par=root)
    finish(o, 35)
    for sx, nm in ((-1, "L"), (1, "R")):
        dv = empty(f"silodoor_{nm}", loc=(sx * 0.02, 0, 0.25), parent=root, side=sx)
        dp = [box("sd_leaf", (SILO_R + 1.0, 2 * SILO_R + 2.0, 0.9), loc=(sx * (SILO_R + 1.0) / 2, 0, 0), m="concrete_dark", bevel=0.05)]
        for k in range(6):
            dp.append(box("sd_rib", (SILO_R + 0.9, 0.3, 0.2), loc=(sx * (SILO_R + 1.0) / 2, -SILO_R + 3 + k * 5.4, 0.5), m="metal_gunmetal"))
        dm = merge(dp, f"silodoor_{nm}_mesh", par=dv)
        dm.location = (0, 0, 0)
        finish(dm, 30)
        arch.col_box(f"COL_silodoor_{nm}", (sx * (SILO_R + 1.0) / 2, 0, 0), (SILO_R + 1.0, 2 * SILO_R + 2, 0.9), 0, dv, door="silo_doors")
    kit.export_glb(os.path.join(kit.out_dir(), "silo_doors.glb"), root)


if __name__ == "__main__":
    only = [a for a in sys.argv[1:] if not a.startswith("-")]
    for fn in (nasa, gate, rocket, silo_doors, nasa_portal.hill_structures):
        if not only or fn.__name__ in only:
            fn()
