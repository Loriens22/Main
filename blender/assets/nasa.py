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


def light_strip(P, L, lights, par, x, y, z, length, along="y", group="tunnel", every=8, kind="cool", lamp_m="emit_cool", intensity=6, distance=14):
    if along == "y":
        P.append(box("strip_housing", (0.35, length, 0.12), loc=(x, y, z + 0.06), m="metal_dark"))
        L.append(box(f"lampE|{group}|s", (0.22, length - 0.1, 0.03), loc=(x, y, z - 0.01), m=lamp_m))
        n = max(1, int(length / every))
        for k in range(n):
            lights.append(empty(f"light_{group}_{len(lights)}", loc=(x, y - length / 2 + (k + 0.5) * length / n, z - 0.6), parent=par, light=kind, group=group, intensity=intensity, distance=distance))
    else:
        P.append(box("strip_housing", (length, 0.35, 0.12), loc=(x, y, z + 0.06), m="metal_dark"))
        L.append(box(f"lampE|{group}|s", (length - 0.1, 0.22, 0.03), loc=(x, y, z - 0.01), m=lamp_m))
        n = max(1, int(length / every))
        for k in range(n):
            lights.append(empty(f"light_{group}_{len(lights)}", loc=(x - length / 2 + (k + 0.5) * length / n, y, z - 0.6), parent=par, light=kind, group=group, intensity=intensity, distance=distance))


import itertools
_IDS = itertools.count()


def wall2(name, a, b, z0, z1, thick, m, ops, P, root, cols=True, offset=0.0):
    """Straight wall a→b (plan points), z0..z1, centred on the line (+offset along the left normal).
    ops: (along_centre, width, [(sill, head), ...]) — several openings may be stacked in one span (elevator landings).
    Every visual piece gets an identical collision box, so what you see is exactly what you bump into."""
    dx, dy = b[0] - a[0], b[1] - a[1]
    L = math.hypot(dx, dy)
    ux, uy = dx / L, dy / L
    nx, ny = -uy, ux
    ang = math.atan2(dy, dx)
    out = []

    def piece(s0, s1, zz0, zz1):
        if s1 - s0 < 0.005 or zz1 - zz0 < 0.005:
            return
        cx = a[0] + ux * (s0 + s1) / 2 + nx * offset
        cy = a[1] + uy * (s0 + s1) / 2 + ny * offset
        o = box(name, (s1 - s0, thick, zz1 - zz0), loc=(cx, cy, (zz0 + zz1) / 2), rot=(0, 0, ang), m=m)
        P.append(o)
        out.append(o)
        if cols:
            col(f"COL_{name}_{next(_IDS)}", (cx, cy, (zz0 + zz1) / 2), (s1 - s0, thick, zz1 - zz0), ang, root)
    cur = 0.0
    for (c, w, vs) in sorted(ops, key=lambda o: o[0]):
        s0, s1 = max(0.0, c - w / 2), min(L, c + w / 2)
        piece(cur, s0, z0, z1)
        zc = z0
        for (sill, head) in sorted(vs):
            piece(s0, s1, zc, sill)
            zc = head
        piece(s0, s1, zc, z1)
        cur = s1
    piece(cur, L, z0, z1)
    return out


def ring_wall(name, c, R, z0, z1, thick, m, nseg, doors, P, root, cols=True):
    """Circular wall of nseg straight segments with doorways (axis_deg, width, [(sill, head), ...]) cut exactly to
    their width (measured across the doorway). Returns the angles of the segments without any opening."""
    plain = []
    for k in range(nseg):
        a0 = 2 * PI * k / nseg
        a1 = 2 * PI * (k + 1) / nseg
        p0 = (c[0] + math.cos(a0) * R, c[1] + math.sin(a0) * R)
        p1 = (c[0] + math.cos(a1) * R, c[1] + math.sin(a1) * R)
        L = math.hypot(p1[0] - p0[0], p1[1] - p0[1])
        ux, uy = (p1[0] - p0[0]) / L, (p1[1] - p0[1]) / L

        def proj(t):
            return (c[0] + math.cos(t) * R - p0[0]) * ux + (c[1] + math.sin(t) * R - p0[1]) * uy
        ops = []
        for (ax, w, vs) in doors:
            al = math.radians(ax)
            dl = math.asin(min(1.0, (w / 2) / R))
            rel = lambda t: (t - al + PI) % (2 * PI) - PI
            r0, r1 = rel(a0), rel(a1)
            if r1 < r0:
                continue
            lo, hi = max(r0, -dl), min(r1, dl)
            if hi <= lo:
                continue
            s0 = 0.0 if lo <= r0 + 1e-9 else proj(al + lo)
            s1 = L if hi >= r1 - 1e-9 else proj(al + hi)
            ops.append(((s0 + s1) / 2, s1 - s0, vs))
        wall2(name, p0, p1, z0, z1, thick, m, ops, P, root, cols=cols)
        if not ops:
            plain.append((a0 + a1) / 2)
    return plain


def text_mesh(name, txt, size, loc, rot, m="emit_white", align="CENTER"):
    """Flat 3-D lettering (Blender's built-in font) as a mesh; rot=(PI/2, 0, g) stands it up facing (sin g, -cos g)."""
    cu = bpy.data.curves.new(name + "_crv", type="FONT")
    cu.body = txt
    cu.size = size
    cu.align_x = align
    cu.align_y = "CENTER"
    cu.resolution_u = 2
    ob = bpy.data.objects.new(name + "_tmp", cu)
    bpy.context.scene.collection.objects.link(ob)
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    bpy.data.objects.remove(ob, do_unlink=True)
    bpy.data.curves.remove(cu)
    me.name = name
    o = kit._obj(name, me, (m,))
    o.location = loc
    o.rotation_euler = rot
    return o


def facing(fx, fy):
    """z-rotation that turns a sign's face (built facing −y) toward the plan direction (fx, fy)."""
    return math.atan2(fx, -fy)


def sign(P, L, txt, loc, face, size=0.28, board=None, lamp="signs", text_m="emit_white", board_m="console_dark"):
    """An illuminated sign: dark board with glowing lettering, facing plan direction `face`."""
    g = facing(*face)
    fx, fy = face
    n = len(txt)
    bw, bh = board or (n * size * 0.72 + 0.5, size * 1.9)
    P.append(box("sign_board", (bw, 0.06, bh), loc=loc, rot=(0, 0, g), m=board_m, bevel=0.01))
    t = text_mesh("sign_txt", txt, size, (loc[0] + fx * 0.035, loc[1] + fy * 0.035, loc[2]), (PI / 2, 0, g), m=text_m)
    L.append(t)
    t.name = f"lampE|{lamp}|{n}"
    return t


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
        mx = -w / 2 + 0.4 + k * 0.8
        P.append(box("cmon", (0.62, 0.05, 0.42), loc=Q(mx, 0.13, 1.13), rot=(-0.12, 0, rot), m="plastic_dark", bevel=0.01))
        P.append(box("cscr", (0.57, 0.01, 0.37), loc=Q(mx, 0.102, 1.13), rot=(-0.12, 0, rot), m="emit_screen" if R.random() < 0.7 else "emit_screen_amber"))
        P.append(box("cmon_stand", (0.06, 0.05, 0.2), loc=Q(mx, 0.16, 0.88), rot=(0, 0, rot), m="metal_dark"))
        P.append(box("cmon_foot", (0.25, 0.18, 0.015), loc=Q(mx, 0.16, 0.795), rot=(0, 0, rot), m="metal_dark"))
        P.append(box("ckey", (0.45, 0.16, 0.03), loc=Q(-w / 2 + 0.4 + k * 0.8, -0.15, 0.8), rot=(0, 0, rot), m="plastic_dark"))
    for k in range(int(w / 0.8)):
        arch.chair("cchair", Q(-w / 2 + 0.4 + k * 0.8, -0.85, 0), rot + PI, "plastic_dark", P)


def console_props(P, x, y, z, rot, w):
    """Per-console clutter: gooseneck lamps, headsets, phones, binders, mugs, status LEDs, PCs under the desk."""
    c, s = math.cos(rot), math.sin(rot)

    def Q(lx, ly, lz):
        return (x + lx * c - ly * s, y + lx * s + ly * c, z + lz)
    n = int(w / 0.8)
    for k in range(n):
        lx = -w / 2 + 0.4 + k * 0.8
        P.append(box("pc_tower", (0.2, 0.45, 0.42), loc=Q(lx, 0.15, 0.21), rot=(0, 0, rot), m="plastic_dark", bevel=0.01))
        P.append(box("mouse", (0.06, 0.1, 0.03), loc=Q(lx + 0.3, -0.18, 0.805), rot=(0, 0, rot), m="plastic_dark", bevel=0.01))
        if R.random() < 0.55:
            P.append(cyl("mug", 0.04, 0.1, loc=Q(lx - 0.32, -0.25, 0.84), m=R.choice(["ceramic_white", "warning_red", "pipe_blue"]), verts=12))
        if R.random() < 0.5:
            P.append(box("binder", (0.06, 0.3, 0.25), loc=Q(lx + 0.25, 0.22, 0.915), rot=(0.1, 0, rot), m=R.choice(["pipe_blue", "warning_red", "console_beige", "plastic_dark"])))
        if R.random() < 0.6:
            P.append(kit.torus("headset", 0.07, 0.008, loc=Q(lx - 0.15, -0.3, 0.81), rot=(PI / 2, 0, rot), m="plastic_dark", seg=12, rseg=4))
        for j in range(4):
            P.append(box("status_led", (0.02, 0.01, 0.01), loc=Q(lx - 0.2 + j * 0.06, 0.28, 0.79), rot=(0, 0, rot), m=R.choice(["emit_green", "emit_green", "emit_red"])))
    for k in range(2):
        lx = -w / 2 + 0.2 + k * (w - 0.4)
        P.append(cyl("lamp_base", 0.06, 0.02, loc=Q(lx, 0.25, 0.79), m="metal_dark", verts=12))
        P.append(kit.tube("lamp_neck", [Q(lx, 0.25, 0.8), Q(lx, 0.2, 1.05), Q(lx, 0.05, 1.15)], 0.006, m="metal_dark", seg=5))
        P.append(cyl("lamp_head", 0.04, 0.05, loc=Q(lx, 0.03, 1.13), m="metal_dark", verts=10))
    P.append(box("phone", (0.2, 0.18, 0.06), loc=Q(w / 2 - 0.3, 0.15, 0.82), rot=(0, 0, rot), m="plastic_dark", bevel=0.01))


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

    # ================================================================================== entry tunnel y 3..63 (into the atrium wall)
    TW, TH = 10.0, 7.5
    TY0, TY1 = 3.0, 63.0
    TL, TC = TY1 - TY0, (TY0 + TY1) / 2
    for sx in (-1, 1):
        P.append(box("tun_wall", (0.8, TL, TH), loc=(sx * (TW / 2 + 0.4), TC, TH / 2), m="concrete", bevel=0.02))
        col(f"COL_tunwall{sx}", (sx * (TW / 2 + 0.4), TC, TH / 2), (0.8, TL, TH), 0, root)
        # cable trays and pipes along the walls
        P.append(box("tray", (0.5, TL, 0.08), loc=(sx * (TW / 2 - 0.25), TC, 5.9), m="steel_galv"))
        for k in range(3):
            P.append(kit.tube("pipe", [(sx * (TW / 2 - 0.15), TY0, 6.4 + k * 0.25), (sx * (TW / 2 - 0.15), TY1, 6.4 + k * 0.25)], 0.07 + k * 0.02, m=["pipe_blue", "steel_painted_yellow", "steel_galv"][k], seg=10))
        P.append(box("curb", (0.6, TL, 0.18), loc=(sx * (TW / 2 - 0.3), TC, 0.09), m="concrete_dark"))
        # wall bumper rail and reflector studs
        P.append(box("tun_bumper", (0.12, TL, 0.3), loc=(sx * (TW / 2 - 0.06), TC, 0.75), m="steel_painted_yellow"))
        for k in range(4):   # fire-equipment cabinets
            P.append(box("tun_fire", (0.2, 0.5, 0.7), loc=(sx * (TW / 2 - 0.1), 13 + k * 15, 1.5), m="warning_red", bevel=0.02))
    # vaulted ceiling (segmented arch)
    for k in range(12):
        a0 = PI * k / 12
        a1 = PI * (k + 1) / 12
        rr = TW / 2 + 0.4
        x0, z0 = math.cos(a0) * rr, math.sin(a0) * 1.8 + TH
        x1, z1 = math.cos(a1) * rr, math.sin(a1) * 1.8 + TH
        cx, cz = (x0 + x1) / 2, (z0 + z1) / 2
        ang = math.atan2(z1 - z0, x1 - x0)
        P.append(box("vault", (math.hypot(x1 - x0, z1 - z0) + 0.05, TL, 0.6), loc=(cx, TC, cz + 0.3), rot=(0, -ang, 0), m="concrete"))
    col("COL_tunceil", (0, TC, TH + 1.6), (TW + 1.6, TL, 0.5), 0, root)
    P.append(box("tun_floor", (TW, TL, 0.2), loc=(0, TC, -0.1), m="concrete_dark"))
    col("COL_tun_floor", (0, TC, -0.1), (TW + 0.4, TL, 0.2), 0, root)
    for k in range(10):
        P.append(box("lane", (0.15, 3.0, 0.01), loc=(0.6, 6 + k * 5.5, 0.01), m="steel_painted_yellow"))
    # pedestrian walkway stripe (white) on the west side
    P.append(box("walk_line", (0.12, TL - 4, 0.008), loc=(-1.0, TC + 2, 0.006), m="steel_painted_white"))
    for k in range(6):
        P.append(box("rib_arch", (TW + 1.7, 0.6, 0.3), loc=(0, 6 + k * 10, TH + 0.2), m="concrete_dark"))
    light_strip(P, L, lights, root, 0, TC, TH + 1.55, TL - 2, "y", "tunnel", every=10)
    sign(P, L, "NASA  ·  OPERATIONS LEVEL 0", (-TW / 2 + 0.03, 9.0, 4.2), (1, 0), size=0.34)
    sign(P, L, "AUTHORIZED PERSONNEL ONLY", (TW / 2 - 0.03, 9.0, 4.2), (-1, 0), size=0.3, text_m="emit_red")
    # checkpoint at y = 40: booth + turnstiles (pedestrian lanes on the west side, the vehicle lane east of them)
    P.append(box("chk_booth", (2.4, 3.0, 2.8), loc=(-3.6, 40, 1.4), m="concrete_dark", bevel=0.03))
    P.append(box("chk_glass", (0.05, 2.6, 1.0), loc=(-2.38, 40, 2.0), m="glass_clear"))
    P.append(box("chk_desk", (0.6, 2.4, 0.9), loc=(-2.1, 40, 0.45), m="console_dark"))
    P.append(box("chk_roof", (2.8, 3.4, 0.15), loc=(-3.6, 40, 2.88), m="metal_gunmetal"))
    screen("screen_checkpoint", root, (-2.0, 40.2, 1.2), (0.5, 0.32), rot=(0, 0, PI / 2))
    col("COL_booth", (-3.6, 40, 1.4), (2.4, 3.0, 2.8), 0, root)
    sign(P, L, "SECURITY CHECKPOINT", (-3.6, 38.48, 2.45), (0, -1), size=0.2)
    for tx in (-1.55, -0.62):
        P.append(box("turnstile", (0.28, 1.3, 1.0), loc=(tx, 40, 0.5), m="metal_brushed", bevel=0.02))
        P.append(box("turnstile_top", (0.3, 1.32, 0.04), loc=(tx, 40, 1.02), m="console_dark"))
        L.append(box("lampE|checkpoint|t", (0.06, 0.2, 0.02), loc=(tx, 39.4, 1.045), m="emit_green"))
        P.append(box("turnstile_arm", (0.42, 0.04, 0.04), loc=(tx + 0.35, 40, 0.9), m="metal_brushed"))
        col(f"COL_turnstile{tx}", (tx, 40, 0.5), (0.28, 1.3, 1.0), 0, root)

    # ---- the security (inner) door at y = 46: a vertical-lift door that rises into its header; control panels on both
    # faces of the east jamb. The jambs and header are solid (they used to be walk-through).
    for sx in (-1, 1):
        P.append(box("inner_jamb", (2.0, 1.5, TH), loc=(sx * 4.0, 46, TH / 2), m="metal_gunmetal", bevel=0.02))
        col(f"COL_innerjamb{sx}", (sx * 4.0, 46, TH / 2), (2.0, 1.5, TH), 0, root)
        P.append(box("inner_jamb_stripe", (0.08, 1.52, TH - 0.2), loc=(sx * 3.0, 46, TH / 2), m="steel_painted_yellow"))
        L.append(box("lampE|innerdoor|b", (0.18, 0.18, 0.18), loc=(sx * 3.3, 45.2, 6.25), m="emit_red"))
    P.append(box("inner_header", (10, 1.6, 3.9), loc=(0, 46, 7.95), m="metal_gunmetal"))
    col("COL_innerheader", (0, 46, 7.95), (10, 1.6, 3.9), 0, root)
    for k in range(5):
        P.append(box("inner_header_rib", (10.02, 1.62, 0.08), loc=(0, 46, 6.2 + k * 0.5), m="metal_dark"))
    dv = empty("inner_door", loc=(0, 46, 0), parent=root, interact="liftdoor", iid="nasa_inner")
    dp = [box("id_leaf", (6.0, 0.4, 6.0), loc=(0, 0, 3.0), m="metal_gunmetal", bevel=0.03)]
    for k in range(4):
        dp.append(box("id_rib", (5.9, 0.46, 0.12), loc=(0, 0, 0.9 + k * 1.45), m="metal_dark"))
    for k in range(8):
        dp.append(box("id_chevron", (0.5, 0.47, 0.22), loc=(-2.6 + k * 0.75, 0, 0.3), rot=(0, 0.55 if k % 2 else -0.55, 0), m="steel_painted_yellow"))
    dp.append(box("id_window", (1.2, 0.42, 0.5), loc=(0, 0, 4.4), m="glass_dark"))
    dm = merge(dp, "inner_door_mesh", par=dv)
    dm.location = (0, 0, 0)
    finish(dm, 30)
    col("COL_inner", (0, 0, 3.0), (6.0, 0.6, 6.0), 0, dv, door="nasa_inner")
    for side, (px, py, face) in (("s", (3.6, 45.2, (0, -1))), ("n", (-3.6, 46.8, (0, 1)))):
        g = facing(*face)
        P.append(box("door_panel", (0.45, 0.08, 0.7), loc=(px, py, 1.35), rot=(0, 0, g), m="console_dark", bevel=0.01))
        P.append(box("door_panel_label", (0.3, 0.085, 0.06), loc=(px, py, 1.62), rot=(0, 0, g), m="plastic_white"))
        bt = box(f"innerdoor_btn_{side}", (0.2, 0.06, 0.2), loc=(px + face[0] * 0.04, py + face[1] * 0.04, 1.3), rot=(0, 0, g), m="emit_green", par=root, interact="liftdoor_btn", iid="nasa_inner")
        bt["door"] = "nasa_inner"
        L.append(box("lampE|innerdoor|p", (0.06, 0.03, 0.06), loc=(px + face[0] * 0.05 + 0.13, py + face[1] * 0.05, 1.55), rot=(0, 0, g), m="emit_red"))
    sign(P, L, "OPERATIONS", (0, 45.15, 6.75), (0, -1), size=0.42)
    sign(P, L, "ATRIUM", (0, 46.85, 6.75), (0, 1), size=0.42)
    sign(P, L, "EXIT  ·  PORTAL", (0, 61.4, 4.3), (0, 1), size=0.3)

    # ================================================================================== atrium (circular, 3 levels)
    AC = (0, 82)
    AR = 20.0
    AH = 16.0
    EY = AC[1] + AR + 5.0          # elevator shaft centre (y = 107), a metre clear of the atrium wall
    # doorways cut to their corridor widths: south tunnel (5 m tall: the 5.5 m balcony passes above it), west mission
    # control, east labs, north elevator with landings at 0, 5.5 and 11
    ADOORS = [(270, TW, [(0, 5.0)]), (180, 4.0, [(0, 4.0)]), (0, 4.5, [(0, 4.0)]), (90, 8.6, [(0, 3.2), (5.5, 8.0), (11.0, 13.5)])]
    plain = ring_wall("atr_wall", AC, AR, 0, AH, 0.8, "concrete", 36, ADOORS, P, root)
    for am in plain:
        L.append(box(f"lampE|atrium|w", (2 * AR * math.sin(PI / 36) * 0.7, 0.05, 0.12), loc=(AC[0] + math.cos(am) * (AR - 0.45), AC[1] + math.sin(am) * (AR - 0.45), 4.6), rot=(0, 0, am + PI / 2), m="emit_warm"))
    P.append(cyl("atr_floor", AR + 0.4, 0.2, loc=(AC[0], AC[1], -0.1), m="concrete_dark", verts=48))
    P.append(cyl("atr_floor_inlay", 6, 0.02, loc=(AC[0], AC[1], 0.01), m="metal_brushed", verts=48))
    P.append(kit.torus("atr_inlay_ring", 9, 0.06, loc=(AC[0], AC[1], 0.02), m="metal_brushed", seg=64, rseg=4))
    P.append(cyl("atr_ceil", AR + 0.4, 0.6, loc=(AC[0], AC[1], AH + 0.3), m="concrete", verts=48))
    col("COL_atr_floor", (AC[0], (62.0 + 101.6) / 2, -0.1), (2 * AR, 101.6 - 62.0, 0.2), 0, root)
    # wayfinding stripes from the inlay ring to each doorway: west blue (mission control), east green (labs),
    # north yellow (elevator / launch complex), south white (exit)
    for ang, m in ((180, "pipe_blue"), (0, "plant_green"), (90, "steel_painted_yellow"), (270, "steel_painted_white")):
        a = math.radians(ang)
        r0, r1 = 9.5, AR - 0.5
        for off in (-0.35, 0.35):
            cx, cy = AC[0] + math.cos(a) * (r0 + r1) / 2 - math.sin(a) * off, AC[1] + math.sin(a) * (r0 + r1) / 2 + math.cos(a) * off
            P.append(box("guide_stripe", (r1 - r0, 0.14, 0.008), loc=(cx, cy, 0.006), rot=(0, 0, a), m=m))
    # balconies at 5.5 and 11 (ring walkways 3.4 m wide): floor colliders overlap all the way to the wall (no wedge
    # gaps), glass railings with colliders, a gap where the stair arrives
    STAIR_A = 45.0
    for lvl in (5.5, 11.0):
        P.append(lathe("balcony", [(AR - 3.4, lvl - 0.35), (AR, lvl - 0.35), (AR, lvl), (AR - 3.4, lvl), (AR - 3.4, lvl - 0.35)], m="concrete", seg=48, loc=(AC[0], AC[1], 0)))
        P.append(lathe("balcony_fascia", [(AR - 3.42, lvl - 0.36), (AR - 3.42, lvl + 0.02)], m="metal_brushed", seg=48, loc=(AC[0], AC[1], 0)))
        L.append(kit.torus(f"lampE|atrium|b{lvl}", AR - 3.5, 0.05, loc=(AC[0], AC[1], lvl - 0.4), m="emit_warm", seg=64, rseg=4))
        for k in range(48):
            a = 2 * PI * (k + 0.5) / 48
            rm = (AR - 3.4 + AR - 0.3) / 2
            col(f"COL_bal{lvl}_{k}", (AC[0] + math.cos(a) * rm, AC[1] + math.sin(a) * rm, lvl - 0.18), (3.1, 2 * PI * (AR - 0.3) / 48 + 0.2, 0.36), a, root)
        nr = 72
        for k in range(nr):
            a0, a1 = 2 * PI * k / nr, 2 * PI * (k + 1) / nr
            am = (a0 + a1) / 2
            if lvl == 5.5 and abs(math.degrees(am) - STAIR_A) < 5.1:
                continue
            rr = AR - 3.38
            ch = 2 * rr * math.sin(PI / nr)
            cx, cy = AC[0] + math.cos(am) * rr, AC[1] + math.sin(am) * rr
            P.append(box("rail_glass", (ch + 0.01, 0.025, 0.95), loc=(cx, cy, lvl + 0.52), rot=(0, 0, am + PI / 2), m="glass_clear"))
            P.append(box("rail_top", (ch + 0.02, 0.07, 0.05), loc=(cx, cy, lvl + 1.05), rot=(0, 0, am + PI / 2), m="metal_brushed"))
            if k % 3 == 0:
                P.append(box("rail_post", (0.05, 0.05, 1.05), loc=(AC[0] + math.cos(a0) * rr, AC[1] + math.sin(a0) * rr, lvl + 0.52), m="metal_brushed"))
            col(f"COL_rail{lvl}_{k}", (cx, cy, lvl + 0.55), (ch + 0.06, 0.12, 1.1), am + PI / 2, root)
        # columns under each balcony (offset from the doorway axes and the stair), now solid
        for k in range(16):
            a = 2 * PI * k / 16 + PI / 16
            cx, cy = AC[0] + math.cos(a) * (AR - 3.0), AC[1] + math.sin(a) * (AR - 3.0)
            z0, z1 = (0.0, lvl - 0.35) if lvl < 6 else (5.5, lvl - 0.35)
            P.append(cyl("bal_col", 0.25, z1 - z0, loc=(cx, cy, (z0 + z1) / 2), m="concrete_dark", verts=16))
            col(f"COL_balcol{lvl}_{k}", (cx, cy, (z0 + z1) / 2), (0.5, 0.5, z1 - z0), a, root)
        for k in range(12):
            a = 2 * PI * k / 12
            lights.append(empty(f"light_atrium_{len(lights)}", loc=(AC[0] + math.cos(a) * (AR - 2), AC[1] + math.sin(a) * (AR - 2), lvl - 0.8), parent=root, light="warm", group="atrium", intensity=5, distance=12))
    # radial stair from the floor to the 5.5 m balcony (north-east), handrails on both sides
    sa = math.radians(STAIR_A)
    r_top = AR - 3.4
    run = 8.6
    r_bot = r_top - run
    arch.stairs("atr_stair", (AC[0] + math.cos(sa) * r_bot, AC[1] + math.sin(sa) * r_bot, 0.0), sa, 2.0, 5.5, 32, run, parts=P, m="concrete_dark", stringer_m="metal_dark", par=root)
    slope = math.atan2(5.5, run)
    hyp = math.hypot(5.5, run)
    for side in (-1, 1):
        ox, oy = -math.sin(sa) * side * 1.05, math.cos(sa) * side * 1.05
        mx, my = AC[0] + math.cos(sa) * (r_bot + run / 2) + ox, AC[1] + math.sin(sa) * (r_bot + run / 2) + oy
        P.append(box("stair_glass", (hyp, 0.025, 0.9), loc=(mx, my, 2.75 + 0.5), rot=(0, -slope, sa), m="glass_clear"))
        P.append(box("stair_rail", (hyp, 0.07, 0.05), loc=(mx, my, 2.75 + 1.0), rot=(0, -slope, sa), m="metal_brushed"))
        c = col(f"COL_stairrail{side}", (mx, my, 2.75 + 0.55), (hyp, 0.12, 1.1), 0, root)
        c.rotation_euler = (0, -slope, sa)
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
    # atrium display wall (north-west, between the balconies)
    da = math.radians(135)
    screen("screen_atrium", root, (AC[0] + math.cos(da) * (AR - 0.45), AC[1] + math.sin(da) * (AR - 0.45), 8.3), (8, 3.6), rot=(0, 0, facing(-math.cos(da), -math.sin(da))))
    # signs on the 5.5 m balcony fascia over each doorway, facing the atrium centre
    for ang, txt in ((180, "MISSION CONTROL"), (0, "LABORATORIES"), (90, "ELEVATOR  ·  LAUNCH COMPLEX"), (270, "EXIT  ·  PORTAL")):
        a = math.radians(ang)
        sign(P, L, txt, (AC[0] + math.cos(a) * (AR - 3.47), AC[1] + math.sin(a) * (AR - 3.47), 4.72), (-math.cos(a), -math.sin(a)), size=0.24, board=(len(txt) * 0.19 + 0.6, 0.44))
    # benches, planters and a directory kiosk on the floor
    for k in range(4):
        a = PI / 4 + k * PI / 2 + 0.25
        bx, by = AC[0] + math.cos(a) * 12.5, AC[1] + math.sin(a) * 12.5
        P.append(box("bench_seat", (2.2, 0.55, 0.08), loc=(bx, by, 0.45), rot=(0, 0, a + PI / 2), m="wood_board", bevel=0.01))
        for e in (-0.9, 0.9):
            P.append(box("bench_leg", (0.08, 0.5, 0.42), loc=(bx + math.cos(a + PI / 2) * e, by + math.sin(a + PI / 2) * e, 0.21), rot=(0, 0, a + PI / 2), m="metal_dark"))
        col(f"COL_bench{k}", (bx, by, 0.25), (2.2, 0.55, 0.5), a + PI / 2, root)
    for k, a in enumerate((PI * 0.62, PI * 0.38 + PI, PI * 1.62, PI * 0.38)):
        px, py = AC[0] + math.cos(a) * 14.6, AC[1] + math.sin(a) * 14.6
        P.append(cyl("planter", 0.75, 0.6, loc=(px, py, 0.3), m="concrete", verts=20))
        P.append(cyl("planter_soil", 0.7, 0.02, loc=(px, py, 0.6), m="sand_dust", verts=20))
        P.append(cyl("tree_trunk", 0.07, 1.6, loc=(px, py, 1.4), m="bark", verts=8))
        for j in range(5):
            P.append(kit.sphere("tree_leaf", 0.45 + 0.08 * (j % 2), loc=(px + 0.3 * math.cos(j * 1.3), py + 0.3 * math.sin(j * 1.3), 2.1 + 0.25 * (j % 3)), m="plant_green", segs=10, rings=6))
        col(f"COL_planter{k}", (px, py, 0.5), (1.5, 1.5, 1.0), 0, root)
    P.append(box("kiosk_base", (0.9, 0.6, 1.0), loc=(AC[0] + 3.2, AC[1] - 11.0, 0.5), m="console_dark", bevel=0.02))
    P.append(box("kiosk_head", (1.0, 0.12, 0.7), loc=(AC[0] + 3.2, AC[1] - 11.25, 1.35), rot=(-0.35, 0, 0), m="console_dark", bevel=0.02))
    screen("screen_directory", root, (AC[0] + 3.2, AC[1] - 11.32, 1.36), (0.86, 0.56), rot=(-0.35, 0, 0))
    hb = box("term_atrium_hit", (1.1, 0.9, 1.6), loc=(AC[0] + 3.2, AC[1] - 11.0, 0.9), m="frame_black", par=root, interact="terminal", iid="atrium_info")
    hb.hide_render = True
    col("COL_kiosk", (AC[0] + 3.2, AC[1] - 11.0, 0.6), (0.9, 0.6, 1.2), 0, root)
    # ROOM volumes
    rv = box("ROOM_nasa_atrium", (2 * AR, 2 * AR, AH), loc=(AC[0], AC[1], AH / 2), m="frame_black", par=root, room="nasa_atrium")
    rv.hide_render = True
    rv = box("ROOM_nasa_tunnel", (TW, TL + 1, TH + 2), loc=(0, TC, (TH + 2) / 2), m="frame_black", par=root, room="nasa_tunnel")
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
    # connecting corridor atrium → MC: walls run from the MC wall into the atrium wall, with its own floor (there was
    # none: a 4 m hole between the two floors)
    for sy in (-1, 1):
        P.append(box("mc_corr_wall", (4.3, 0.4, 4.4), loc=(-22.05, 82 + sy * 2.2, 2.2), m="concrete"))
        col(f"COL_mccorr{sy}", (-22.05, 82 + sy * 2.2, 2.2), (4.3, 0.4, 4.4), 0, root)
        P.append(box("mc_corr_bumper", (4.3, 0.06, 0.25), loc=(-22.05, 82 + sy * 1.97, 0.9), m="steel_painted_blue"))
    P.append(box("mc_corr_ceil", (4.6, 4.8, 0.3), loc=(-22.05, 82, 4.4), m="concrete"))
    P.append(box("mc_corr_floor", (5.0, 4.0, 0.2), loc=(-21.8, 82, -0.1), m="int_floor"))
    col("COL_mccorr_floor", (-21.8, 82, -0.1), (5.4, 4.4, 0.2), 0, root)
    P.append(box("guide_stripe", (4.6, 0.14, 0.008), loc=(-21.9, 81.65, 0.006), m="pipe_blue"))
    P.append(box("guide_stripe", (4.6, 0.14, 0.008), loc=(-21.9, 82.35, 0.006), m="pipe_blue"))
    L.append(box("lampE|mc|corr", (3.6, 0.3, 0.03), loc=(-22.0, 82, 4.24), m="emit_cool"))
    lights.append(empty(f"light_mccorr_{len(lights)}", loc=(-22.0, 82, 3.6), parent=root, light="cool", group="mc", intensity=6, distance=10))
    sign(P, L, "MISSION CONTROL", (-22.0, 83.97, 3.25), (0, -1), size=0.26)
    sign(P, L, "ATRIUM", (-22.0, 80.03, 3.25), (0, 1), size=0.26)
    P.append(box("mc_floor", (MX1 - MX0, MY1 - MY0, 0.2), loc=((MX0 + MX1) / 2, (MY0 + MY1) / 2, -0.1), m="int_floor"))
    P.append(box("mc_ceil", (MX1 - MX0, MY1 - MY0, 0.3), loc=((MX0 + MX1) / 2, (MY0 + MY1) / 2, MH + 0.15), m="int_panel_dark"))
    col("COL_mc_floor", ((MX0 + MX1) / 2, (MY0 + MY1) / 2, -0.1), (MX1 - MX0, MY1 - MY0, 0.2), 0, root)
    # tiered floor: 4 tiers rising toward the east (operators face the west screen wall)
    for t in range(4):
        x0 = -62 + t * 7.5
        zt = t * 0.45
        if t > 0:
            P.append(box("tier", (7.5, 34, zt), loc=(x0 + 3.75, 82, zt / 2), m="int_floor", bevel=0.01))
            P.append(box("tier_edge", (0.1, 34, 0.05), loc=(x0, 82, zt), m="metal_brushed"))
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
    # the director's glass office stands in the north-east corner (it used to sit right across the entrance: a 1.8 m
    # wall where the corridor came in), reached from tier 3 by a short stair
    DY0, DY1 = 88.0, 101.6
    P.append(box("dir_floor", (7.7, DY1 - DY0, 1.8), loc=(-28.15, (DY0 + DY1) / 2, 0.9), m="int_floor"))
    col("COL_dir_floor", (-28.15, (DY0 + DY1) / 2, 0.9), (7.7, DY1 - DY0, 1.8), 0, root)
    for (g0, g1) in ((DY0, 90.2), (91.8, DY1)):
        P.append(box("dir_glass", (0.05, g1 - g0, 3.0), loc=(-32.0, (g0 + g1) / 2, 3.3), m="glass_clear"))
        col("COL_dir_glass", (-32.0, (g0 + g1) / 2, 3.3), (0.1, g1 - g0, 3.0), 0, root)
    P.append(box("dir_glass_s", (7.7, 0.05, 3.0), loc=(-28.15, DY0, 3.3), m="glass_clear"))
    col("COL_dir_glass_s", (-28.15, DY0, 3.3), (7.7, 0.1, 3.0), 0, root)
    arch.stairs("dir_stair", (-34.0, 91.0, 1.35), 0, 1.4, 0.45, 2, 2.0, parts=P, m="int_floor", par=root)
    arch.desk("dir_desk", (-27.5, 96.0, 1.8), -PI / 2, 2.0, parts=P)
    arch.chair("dir_chair", (-26.6, 96.0, 1.8), -PI / 2, "leather_brown", P)
    # the centre aisle (y 79.4 … 84.6, on the corridor's axis): steps of 0.225 m from the entrance floor up to tier 3,
    # then down tier by tier toward the screen wall, so every console row can be reached on foot
    AY0, AY1 = 79.4, 84.6
    for k in range(6):
        sx0 = -24.0 - k * 1.33
        P.append(box("aisle_step", (1.33, AY1 - AY0, 0.225 * (k + 1)), loc=(sx0 - 0.665, 82, 0.1125 * (k + 1)), m="int_floor"))
        P.append(box("aisle_nosing", (0.05, AY1 - AY0, 0.03), loc=(sx0 - 0.03, 82, 0.225 * (k + 1) - 0.015), m="steel_painted_yellow"))
        col(f"COL_aisle_up{k}", (sx0 - 0.665, 82, 0.1125 * (k + 1)), (1.33, AY1 - AY0, 0.225 * (k + 1)), 0, root)
    for t in (3, 2, 1):
        xe = -62 + t * 7.5          # the tier's west edge: half-step blocks on the lower tier below it
        zt = t * 0.45
        P.append(box("aisle_half", (0.8, AY1 - AY0, zt - 0.225), loc=(xe - 0.4, 82, (zt - 0.225) / 2), m="int_floor"))
        P.append(box("aisle_nosing", (0.05, AY1 - AY0, 0.03), loc=(xe - 0.8, 82, zt - 0.225 - 0.015), m="steel_painted_yellow"))
        col(f"COL_aisle_half{t}", (xe - 0.4, 82, (zt - 0.225) / 2), (0.8, AY1 - AY0, zt - 0.225), 0, root)
    for k in range(6):
        for row in range(2):
            light_strip(P, L, lights, root, -66 + k * 7.5, 72 + row * 20, MH - 0.05, 6, "y", "mc", every=6, kind="cool", intensity=11, distance=20)
    rv = box("ROOM_nasa_mc", (MX1 - MX0, MY1 - MY0, MH), loc=((MX0 + MX1) / 2, (MY0 + MY1) / 2, MH / 2), m="frame_black", par=root, room="nasa_mc")
    rv.hide_render = True
    # ---- mission control finish: carpet tiers, tier rails, acoustic wall panels, ceiling grid, clocks, console clutter
    for t in range(4):
        x0 = -62 + t * 7.5
        zt = t * 0.45
        P.append(box("mc_carpet", (7.4, 33.8, 0.012), loc=(x0 + 3.75, 82, zt + 0.006), m="carpet_gray"))
        if t > 0:
            for k in range(9):
                yy = 66 + k * 4.0
                if 79 < yy < 85:
                    continue
                P.append(cyl("tier_rail_post", 0.025, 0.9, loc=(x0 - 0.25, yy, zt - 0.45 + 0.45 + 0.45), m="metal_brushed", verts=8))
            for (y0_, y1_) in ((65.5, 79.2), (84.8, 98.5)):
                P.append(cyl("tier_rail", 0.025, y1_ - y0_, loc=(x0 - 0.25, (y0_ + y1_) / 2, zt + 0.9), rot=(PI / 2, 0, 0), m="metal_brushed", verts=8))
        for row_y in (68.5, 75.5, 88.5, 95.5):
            console_props(P, x0 + 3.0, row_y, zt, PI / 2, 4.8)
    for (wall, a0, a1, fixed, axis) in (("n", MX0 + 1, MX1 - 1, MY1 - 0.32, "x"), ("s", MX0 + 1, MX1 - 1, MY0 + 0.32, "x"), ("e", MY0 + 1, MY1 - 1, MX1 - 0.32, "y")):
        nseg = int((a1 - a0) / 2.4)
        for k in range(nseg):
            u = a0 + 1.2 + k * 2.4
            if axis == "y" and 79 < u < 85:
                continue
            for j in range(3):
                zc = 1.4 + j * 1.75
                m = "int_panel_mid" if (k + j) % 3 else "int_panel_dark"
                if axis == "x":
                    P.append(box("acoustic", (2.3, 0.06, 1.65), loc=(u, fixed, zc), m=m, bevel=0.01))
                else:
                    P.append(box("acoustic", (0.06, 2.3, 1.65), loc=(fixed, u, zc), m=m, bevel=0.01))
    for k in range(int((MX1 - MX0) / 1.2)):
        P.append(box("ceil_tbar", (0.04, MY1 - MY0, 0.04), loc=(MX0 + 0.6 + k * 1.2, 82, MH - 0.02), m="metal_brushed"))
    for k in range(int((MY1 - MY0) / 1.2)):
        P.append(box("ceil_tbar", (MX1 - MX0, 0.04, 0.04), loc=((MX0 + MX1) / 2, MY0 + 0.6 + k * 1.2, MH - 0.02), m="metal_brushed"))
    for (x, y) in ((-62, 66), (-54, 98), (-46, 66), (-38, 98), (-30, 66)):
        P.append(box("diffuser", (0.6, 0.6, 0.05), loc=(x, y, MH - 0.05), m="steel_painted_white"))
        for j in range(4):
            P.append(box("diffuser_slot", (0.5, 0.02, 0.055), loc=(x, y - 0.18 + j * 0.12, MH - 0.05), m="frame_black"))
    P.append(box("ceil_tray", (MX1 - MX0 - 2, 0.4, 0.08), loc=((MX0 + MX1) / 2, 82, MH - 0.6), m="steel_galv"))
    for k in range(6):
        P.append(cyl("tray_hanger", 0.01, 0.55, loc=(MX0 + 4 + k * 8, 82, MH - 0.3), m="metal_gray", verts=6))
    for k in range(5):   # world clocks above the screen wall
        yy = 74 + k * 4
        P.append(box("clock", (0.15, 1.8, 0.5), loc=(MX0 + 0.75, yy, 8.4), m="console_dark", bevel=0.01))
        P.append(box("clock_digits", (0.02, 1.5, 0.3), loc=(MX0 + 0.84, yy, 8.4), m="emit_red"))
        P.append(box("clock_label", (0.02, 1.2, 0.08), loc=(MX0 + 0.84, yy, 8.05), m="plastic_white"))

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
    # ten rooms along a 60 m corridor (it starts inside the atrium wall and ends in a solid wall); one doorway per room
    # at its centre, with a frame, a glass door that slides open as you approach (NasaSite: autodoor) and a nameplate
    LX0, LX1 = 22.0, 82.0
    CX0 = 19.8
    CY = 82.0
    rooms = [("greenhouse", 22, 37, 1, "GREENHOUSE"), ("briefing", 22, 37, -1, "BRIEFING"), ("workshop", 37, 47, 1, "WORKSHOP"),
             ("lifesupport", 37, 47, -1, "LIFE SUPPORT"), ("computers", 47, 57, 1, "COMPUTERS"), ("storage", 47, 57, -1, "STORES"),
             ("medical", 57, 69.5, 1, "MEDICAL BAY"), ("suits", 57, 69.5, -1, "SUIT ROOM"), ("cryo", 69.5, 82, 1, "CRYOGENICS"), ("archive", 69.5, 82, -1, "ARCHIVE")]
    DW, DH = 1.8, 2.5
    for sy in (-1, 1):
        ops = [((x0 + x1) / 2 - CX0, DW, [(0, DH)]) for (nm, x0, x1, side, lab) in rooms if side == sy]
        wall2(f"lab_corr{sy}", (CX0, CY + sy * 2.4), (LX1, CY + sy * 2.4), 0, 4.0, 0.3, "concrete", ops, P, root)
        P.append(box("lab_bumper", (LX1 - CX0, 0.05, 0.22), loc=((CX0 + LX1) / 2, CY + sy * 2.22, 0.9), m="steel_painted_white"))
    wall2("lab_end", (LX1, CY - 2.55), (LX1, CY + 2.55), 0, 4.0, 0.3, "concrete", [], P, root)
    P.append(box("lab_corr_floor", (LX1 - CX0, 4.8, 0.2), loc=((CX0 + LX1) / 2, CY, -0.1), m="int_floor"))
    P.append(box("lab_corr_ceil", (LX1 - CX0, 4.8, 0.2), loc=((CX0 + LX1) / 2, CY, 4.1), m="int_panel_light"))
    col("COL_labcorr_floor", ((CX0 - 0.6 + LX1) / 2, CY, -0.1), (LX1 - CX0 + 0.6, 5.0, 0.2), 0, root)
    for off in (-0.35, 0.35):
        P.append(box("guide_stripe", (LX1 - CX0 - 1.0, 0.14, 0.008), loc=((CX0 + LX1) / 2 - 0.5, CY + off, 0.006), m="plant_green"))
    light_strip(P, L, lights, root, (CX0 + LX1) / 2, CY, 3.95, LX1 - CX0 - 1, "x", "labs", every=8, kind="cool")
    sign(P, L, "LABORATORIES", (LX1 - 0.17, CY, 2.6), (-1, 0), size=0.3)
    sign(P, L, "ATRIUM", (23.0, CY + 2.23, 3.2), (0, -1), size=0.22)
    for k, (nm, x0, x1, side, lab) in enumerate(rooms):
        y0 = CY + side * 2.4
        y1 = CY + side * 16.4
        ya, yb = (y0, y1) if side > 0 else (y1, y0)
        cx, cy = (x0 + x1) / 2, (ya + yb) / 2
        # walls: the far wall, the east wall of every room, the west wall only for the first room (no doubled partitions)
        wall2(f"{nm}_far", (x0, y1), (x1, y1), 0, 4.0, 0.3, "concrete", [], P, root)
        wall2(f"{nm}_e", (x1, ya), (x1, yb), 0, 4.0, 0.3, "concrete", [], P, root)
        if x0 == LX0:
            wall2(f"{nm}_w", (x0, ya), (x0, yb), 0, 4.0, 0.3, "concrete", [], P, root)
        P.append(box(f"{nm}_floor", (x1 - x0, 14, 0.2), loc=(cx, cy, -0.1), m="int_floor" if nm not in ("greenhouse", "medical") else "tile_white"))
        P.append(box(f"{nm}_ceil", (x1 - x0, 14, 0.2), loc=(cx, cy, 4.1), m="int_panel_light"))
        col(f"COL_{nm}_floor", (cx, cy, -0.1), (x1 - x0, 14, 0.2), 0, root)
        rv = box(f"ROOM_nasa_{nm}", (x1 - x0, 14, 4.0), loc=(cx, cy, 2.0), m="frame_black", par=root, room=f"nasa_{nm}")
        rv.hide_render = True
        # doorway frame, the sliding glass door (on the corridor face, slides east over the wall) and the nameplate
        wy = CY + side * 2.4
        for e in (-1, 1):
            P.append(box("door_jamb", (0.08, 0.36, DH), loc=(cx + e * (DW / 2 + 0.04), wy, DH / 2), m="metal_gunmetal"))
        P.append(box("door_head", (DW + 0.16, 0.36, 0.1), loc=(cx, wy, DH + 0.05), m="metal_gunmetal"))
        dvn = empty(f"adoor_{nm}", loc=(cx, wy - side * 0.21, 0), parent=root, interact="autodoor", iid=f"adoor_{nm}")
        dpp = [box("ad_glass", (DW + 0.08, 0.03, DH - 0.06), loc=(0, 0, (DH - 0.06) / 2), m="glass_clear"),
               box("ad_rail_b", (DW + 0.1, 0.05, 0.1), loc=(0, 0, 0.05), m="metal_brushed"),
               box("ad_rail_t", (DW + 0.1, 0.05, 0.08), loc=(0, 0, DH - 0.1), m="metal_brushed"),
               box("ad_stile_l", (0.05, 0.05, DH - 0.06), loc=(-(DW + 0.05) / 2, 0, (DH - 0.06) / 2), m="metal_brushed"),
               box("ad_stile_r", (0.05, 0.05, DH - 0.06), loc=((DW + 0.05) / 2, 0, (DH - 0.06) / 2), m="metal_brushed"),
               box("ad_band", (DW + 0.06, 0.035, 0.08), loc=(0, 0, 1.2), m="steel_painted_white")]
        dmm = merge(dpp, f"adoor_{nm}_mesh", par=dvn)
        dmm.location = (0, 0, 0)
        finish(dmm, 30)
        col(f"COL_adoor_{nm}", (0, side * 0.21, DH / 2), (DW, 0.3, DH), 0, dvn, door=f"adoor_{nm}")
        sign(P, L, lab, (cx - DW / 2 - 0.95, wy - side * 0.17, 2.0), (0, -side), size=0.15, board=(1.6, 0.32))
        lights.append(empty(f"light_{nm}_{len(lights)}", loc=(cx, cy, 3.3), parent=root, light="cool" if nm not in ("greenhouse",) else "warm", group="labs", intensity=8, distance=14))
        if nm == "greenhouse":
            for r in range(4):
                for k2 in range(3):
                    yy = cy - 5 + k2 * 5
                    xx = x0 + 2.5 + r * 3.3
                    P.append(box("gh_rack", (1.2, 4.0, 0.9), loc=(xx, yy, 0.45), m="steel_galv"))
                    P.append(box("gh_tray", (1.1, 3.9, 0.15), loc=(xx, yy, 0.95), m="plastic_white"))
                    for pk in range(10):
                        P.append(cyl("gh_plant", 0.04, R.uniform(0.4, 0.9), loc=(xx + R.uniform(-0.4, 0.4), yy - 1.8 + pk * 0.4, 1.3), m="plant_green", verts=5))
                    L.append(box("lampE|greenhouse|g", (1.0, 3.8, 0.04), loc=(xx, yy, 2.6), m="emit_warm"))
                col(f"COL_ghrack{r}", (x0 + 2.5 + r * 3.3, cy, 0.5), (1.2, 14.0, 1.0), 0, root)
            hb = box("term_greenhouse_hit", (1.4, 1.4, 2), loc=(x1 - 1.2, cy + side * 5.5, 1.0), m="frame_black", par=root, interact="terminal", iid="lab_greenhouse")
            hb.hide_render = True
            P.append(box("gh_desk", (1.2, 0.7, 0.9), loc=(x1 - 1.2, cy + side * 5.5, 0.45), m="console_dark"))
        elif nm == "briefing":
            arch.table("brief_table", (cx, cy, 0), 7.0, 2.2, parts=P, m="console_dark")
            for k2 in range(6):
                for sy2 in (-1, 1):
                    arch.chair("bchair", (cx - 3 + k2 * 1.2, cy + sy2 * 1.5, 0), PI if sy2 > 0 else 0, "plastic_dark", P)
            screen("screen_briefing", root, (x0 + 0.25, cy, 2.2), (4.0, 2.2), rot=(0, 0, PI / 2))
            hb = box("term_briefing_hit", (1, 4, 2.5), loc=(x0 + 0.6, cy, 2.0), m="frame_black", par=root, interact="terminal", iid="lab_briefing")
            hb.hide_render = True
            col("COL_btable", (cx, cy, 0.38), (7.0, 2.2, 0.76), 0, root)
        elif nm == "workshop":
            P.append(box("ws_bench", (8, 1.0, 0.95), loc=(cx, y1 - side * 1.0, 0.48), m="steel_painted_gray", bevel=0.02))
            col("COL_wsbench", (cx, y1 - side * 1.0, 0.48), (8, 1.0, 0.95), 0, root)
            P.append(box("ws_stand", (2.0, 2.0, 0.8), loc=(cx - 2, cy, 0.4), m="steel_painted_yellow"))
            P.append(cyl("ws_leg", 0.1, 2.2, loc=(cx - 2, cy, 1.2), rot=(0, PI / 2 * 0.8, 0), m="metal_gray", verts=12))
            P.append(box("ws_rcs", (0.7, 0.6, 0.5), loc=(cx + 2, cy, 1.05), m="paint_charcoal", bevel=0.03))
            P.append(box("ws_cart", (1.0, 1.4, 0.8), loc=(cx + 2, cy, 0.4), m="farm_red"))
            col("COL_wsstand", (cx - 2, cy, 0.5), (2.0, 2.0, 1.0), 0, root)
            col("COL_wscart", (cx + 2, cy, 0.5), (1.0, 1.4, 1.0), 0, root)
            hb = box("term_workshop_hit", (8, 1.2, 1.5), loc=(cx, y1 - side * 1.0, 1.0), m="frame_black", par=root, interact="terminal", iid="lab_workshop")
            hb.hide_render = True
        elif nm == "lifesupport":
            for k2 in range(3):
                P.append(cyl("ls_tank", 1.1, 3.4, loc=(x0 + 2 + k2 * 3.0, cy - 3, 1.7), m="steel_painted_white", verts=24))
                P.append(cyl("ls_fan", 0.8, 0.5, loc=(x0 + 2 + k2 * 3.0, cy + 3, 2.5), rot=(PI / 2, 0, 0), m="radiator_black", verts=20))
                col(f"COL_lstank{k2}", (x0 + 2 + k2 * 3.0, cy - 3, 1.7), (2.2, 2.2, 3.4), 0, root)
            for k2 in range(4):
                P.append(kit.tube("ls_pipe", [(x0 + 0.5, cy - 6 + k2 * 0.6, 3.5), (x1 - 0.5, cy - 6 + k2 * 0.6, 3.5)], 0.09, m=["pipe_blue", "steel_painted_yellow", "steel_galv", "warning_red"][k2], seg=10))
            hb = box("term_ls_hit", (1.5, 1.5, 2), loc=(cx, cy + 1.2, 1.0), m="frame_black", par=root, interact="terminal", iid="lab_lifesupport")
            hb.hide_render = True
            P.append(box("ls_console", (1.2, 0.6, 1.1), loc=(cx, cy + 1.2, 0.55), m="console_dark"))
        elif nm == "computers":
            for r in range(3):
                for k2 in range(5):
                    P.append(box("rack", (0.65, 1.1, 2.2), loc=(x0 + 2.2 + r * 2.8, cy - 5 + k2 * 2.2, 1.1), m="console_dark", bevel=0.01))
                    for j2 in range(8):
                        L.append(box("lampE|computers|led", (0.02, 0.6, 0.02), loc=(x0 + 2.2 + r * 2.8 - 0.33, cy - 5 + k2 * 2.2, 0.4 + j2 * 0.22), m="emit_green" if (j2 + k2) % 3 else "emit_screen_amber"))
                col(f"COL_racks{r}", (x0 + 2.2 + r * 2.8, cy, 1.1), (0.7, 11, 2.2), 0, root)
            hb = box("term_comp_hit", (1, 1, 2), loc=(x1 - 1.5, cy, 1.0), m="frame_black", par=root, interact="terminal", iid="lab_computers")
            hb.hide_render = True
        elif nm == "storage":
            for r in range(3):
                arch.shelf_unit("st_shelf", (x0 + 2.5 + r * 2.8, cy - 1.0, 0), PI / 2, w=8.0, h=2.8, d=0.9, parts=P, items="boxes", seed=40 + r)
                col(f"COL_shelf{r}", (x0 + 2.5 + r * 2.8, cy - 1.0, 1.4), (0.9, 8.0, 2.8), 0, root)
        elif nm == "medical":
            for b in range(2):
                bx = x0 + 3.0 + b * 4.5
                by = y1 - side * 1.6
                P.append(box("med_bed_frame", (1.0, 2.1, 0.5), loc=(bx, by, 0.35), m="steel_painted_white", bevel=0.02))
                P.append(box("med_mattress", (0.92, 2.0, 0.14), loc=(bx, by, 0.67), m="pad_white", bevel=0.03))
                P.append(box("med_pillow", (0.6, 0.35, 0.1), loc=(bx, by + side * 0.75, 0.78), m="pad_white", bevel=0.04))
                for e in (-1, 1):
                    P.append(box("med_rail", (0.04, 1.2, 0.3), loc=(bx + e * 0.5, by, 0.85), m="metal_brushed"))
                P.append(cyl("med_pole", 0.025, 1.8, loc=(bx + 0.8, by + side * 0.7, 0.9), m="metal_brushed", verts=8))
                P.append(box("med_monitor", (0.45, 0.06, 0.32), loc=(bx + 0.8, by + side * 0.7, 1.75), m="plastic_dark"))
                L.append(box("lampE|labs|med", (0.4, 0.02, 0.27), loc=(bx + 0.8, by + side * 0.66, 1.75), m="emit_screen"))
                P.append(box("med_curtain", (0.03, 2.3, 2.2), loc=(bx + 1.35, by, 1.35), m="fabric_curtain"))
                col(f"COL_medbed{b}", (bx, by, 0.4), (1.0, 2.1, 0.8), 0, root)
            P.append(box("med_cabinets", (0.6, 6.0, 0.9), loc=(x1 - 0.5, cy, 0.45), m="steel_painted_white", bevel=0.01))
            P.append(box("med_counter", (0.65, 6.0, 0.04), loc=(x1 - 0.5, cy, 0.92), m="ceramic_white"))
            P.append(box("med_cab_upper", (0.4, 6.0, 0.8), loc=(x1 - 0.35, cy, 2.2), m="steel_painted_white"))
            col("COL_medcab", (x1 - 0.5, cy, 0.5), (0.6, 6.0, 1.0), 0, root)
            P.append(box("med_scanner", (1.2, 2.2, 1.0), loc=(x0 + 3.0, cy - side * 1.0, 0.5), m="paint_white_aero", bevel=0.05))
            P.append(cyl("med_scanner_ring", 0.75, 0.5, loc=(x0 + 3.0, cy - side * 1.0, 1.1), rot=(PI / 2, 0, 0), m="paint_white_aero", verts=32))
            col("COL_medscan", (x0 + 3.0, cy - side * 1.0, 0.75), (1.4, 2.2, 1.5), 0, root)
            hb = box("term_med_hit", (1.0, 1.4, 2.0), loc=(x1 - 0.6, cy + 2.0, 1.0), m="frame_black", par=root, interact="terminal", iid="lab_medical")
            hb.hide_render = True
        elif nm == "cryo":
            for b in range(4):
                bx = x0 + 2.2 + b * 2.7
                by = cy + side * 1.5
                P.append(box("cryo_base", (1.1, 2.6, 0.55), loc=(bx, by, 0.28), m="steel_painted_white", bevel=0.03))
                P.append(cyl("cryo_shell", 0.55, 2.4, loc=(bx, by, 0.95), rot=(PI / 2, 0, 0), m="glass_clear", verts=24))
                P.append(cyl("cryo_cap", 0.58, 0.18, loc=(bx, by - 1.25, 0.95), rot=(PI / 2, 0, 0), m="paint_white_aero", verts=24))
                P.append(cyl("cryo_cap", 0.58, 0.18, loc=(bx, by + 1.25, 0.95), rot=(PI / 2, 0, 0), m="paint_white_aero", verts=24))
                L.append(box("lampE|cryo|p", (0.6, 2.2, 0.03), loc=(bx, by, 0.6), m="emit_cool"))
                P.append(box("cryo_panel", (0.5, 0.08, 0.35), loc=(bx, by - side * 1.45, 1.25), m="console_dark"))
                L.append(box("lampE|cryo|s", (0.42, 0.02, 0.27), loc=(bx, by - side * 1.5, 1.25), m="emit_screen"))
                col(f"COL_cryo{b}", (bx, by, 0.75), (1.2, 2.7, 1.5), 0, root)
            lights.append(empty(f"light_cryo_{len(lights)}", loc=(cx, cy + side * 1.5, 2.6), parent=root, light="cool", group="labs", intensity=6, distance=10))
            hb = box("term_cryo_hit", (1.0, 1.0, 2.0), loc=(x1 - 0.9, cy - side * 4.5, 1.0), m="frame_black", par=root, interact="terminal", iid="lab_cryo")
            hb.hide_render = True
            P.append(box("cryo_console", (1.2, 0.6, 1.1), loc=(x1 - 0.9, cy - side * 4.5, 0.55), m="console_dark"))
        elif nm == "suits":
            for b in range(4):
                bx = x0 + 2.2 + b * 2.6
                by = y1 - side * 1.4
                P.append(cyl("suit_base", 0.35, 0.05, loc=(bx, by, 0.03), m="metal_dark", verts=16))
                P.append(cyl("suit_leg", 0.1, 0.85, loc=(bx - 0.12, by, 0.5), m="suit_white", verts=10))
                P.append(cyl("suit_leg", 0.1, 0.85, loc=(bx + 0.12, by, 0.5), m="suit_white", verts=10))
                P.append(cyl("suit_torso", 0.26, 0.7, loc=(bx, by, 1.25), m="suit_white", verts=16))
                P.append(box("suit_pack", (0.5, 0.25, 0.6), loc=(bx, by + side * 0.3, 1.3), m="suit_gray", bevel=0.04))
                for e in (-1, 1):
                    P.append(cyl("suit_arm", 0.08, 0.65, loc=(bx + e * 0.36, by, 1.2), rot=(0, e * 0.12, 0), m="suit_white", verts=10))
                P.append(kit.sphere("suit_helmet", 0.18, loc=(bx, by, 1.8), m="suit_white", segs=16, rings=10))
                P.append(kit.sphere("suit_visor", 0.13, loc=(bx, by - side * 0.08, 1.8), m="glass_dark", segs=14, rings=8, scale=(1, 0.6, 0.9)))
                col(f"COL_suit{b}", (bx, by, 1.0), (0.8, 0.7, 2.0), 0, root)
            for b in range(8):
                P.append(box("locker", (0.55, 0.5, 2.0), loc=(x0 + 0.5, cy - 3.5 + b * 0.58, 1.0), m="steel_painted_gray", bevel=0.01))
                P.append(box("locker_vent", (0.02, 0.3, 0.12), loc=(x0 + 0.78, cy - 3.5 + b * 0.58, 1.7), m="metal_dark"))
            col("COL_lockers", (x0 + 0.5, cy - 1.5, 1.0), (0.55, 4.7, 2.0), 0, root)
            P.append(box("suit_bench", (3.0, 0.45, 0.45), loc=(cx, cy, 0.23), m="wood_board", bevel=0.01))
            col("COL_suitbench", (cx, cy, 0.23), (3.0, 0.45, 0.45), 0, root)
            hb = box("term_suits_hit", (1.0, 1.0, 2.0), loc=(x1 - 0.9, cy, 1.0), m="frame_black", par=root, interact="terminal", iid="lab_suits")
            hb.hide_render = True
            P.append(box("suit_console", (0.6, 1.0, 1.1), loc=(x1 - 0.6, cy, 0.55), m="console_dark"))
        elif nm == "archive":
            for r in range(3):
                arch.shelf_unit("ar_shelf", (x0 + 2.0 + r * 2.6, cy - 1.5, 0), PI / 2, w=7.0, h=2.6, d=0.8, parts=P, items="boxes", seed=60 + r)
                col(f"COL_arshelf{r}", (x0 + 2.0 + r * 2.6, cy - 1.5, 1.3), (0.8, 7.0, 2.6), 0, root)
            arch.table("plan_table", (x1 - 2.5, cy + 2.5, 0), 2.4, 1.4, parts=P, m="metal_gray")
            P.append(box("plan_sheet", (2.0, 1.1, 0.005), loc=(x1 - 2.5, cy + 2.5, 0.77), m="plastic_white"))
            col("COL_plantable", (x1 - 2.5, cy + 2.5, 0.38), (2.4, 1.4, 0.76), 0, root)
            for b in range(3):
                P.append(box("tape_cab", (0.8, 0.6, 1.8), loc=(x1 - 0.5, cy - 4.5 + b * 1.0, 0.9), m="console_dark", bevel=0.01))
                for e in (-1, 1):
                    P.append(cyl("tape_reel", 0.17, 0.03, loc=(x1 - 0.9, cy - 4.5 + b * 1.0 + e * 0.0, 1.25 + e * 0.0 + (0.22 if e > 0 else -0.2)), rot=(0, PI / 2, 0), m="metal_brushed", verts=16))
            col("COL_tapecab", (x1 - 0.5, cy - 3.5, 0.9), (0.8, 3.0, 1.8), 0, root)
            hb = box("term_archive_hit", (1.6, 1.0, 1.4), loc=(x1 - 2.5, cy + 2.5, 1.0), m="frame_black", par=root, interact="terminal", iid="lab_archive")
            hb.hide_render = True
        if nm not in ("greenhouse",):
            light_strip(P, L, lights, root, cx, cy, 3.95, 10, "y", "labs", every=10, kind="cool")
    rv = box("ROOM_nasa_labs", (LX1 - CX0, 4.8, 4.0), loc=((CX0 + LX1) / 2, CY, 2.0), m="frame_black", par=root, room="nasa_labs")
    rv.hide_render = True

    # ================================================================================== elevator: four stops (−35, 0, 5.5, 11)
    # shaft north of the atrium (centre EY): closed on every side; landings on the south face (atrium floor and both
    # balconies) and on the north face at the bottom (the lower corridor); a rising steel gate at each landing opens
    # only while the car stands there (NasaSite), and a call button beside it
    SX = 4.3                     # inner half-width
    SS, SN = EY - 4.45, EY + 4.6  # south / north wall lines
    ZB, ZT = LOW - 0.3, 16.3
    LANDS = [(0.0, 3.2), (5.5, 8.0), (11.0, 13.5)]
    for sx in (-1, 1):
        wall2(f"el_side{sx}", (sx * (SX + 0.3), SS - 0.15), (sx * (SX + 0.3), SN + 0.15), ZB, ZT, 0.6, "concrete", [], P, root)
    wall2("el_south", (-SX - 0.6, SS), (SX + 0.6, SS), ZB, ZT, 0.3, "concrete", [(SX + 0.6, 2 * SX, LANDS)], P, root)
    wall2("el_north", (-SX - 0.6, SN), (SX + 0.6, SN), ZB, ZT, 0.3, "concrete", [(SX + 0.6, 2 * SX, [(LOW, LOW + 3.2)])], P, root)
    P.append(box("el_roof", (2 * SX + 1.2, SN - SS + 0.3, 0.4), loc=(0, EY, ZT + 0.2), m="concrete"))
    P.append(box("el_pit", (2 * SX, SN - SS, 0.3), loc=(0, (SS + SN) / 2, LOW - 0.6), m="concrete_dark"))
    col("COL_el_pit", (0, (SS + SN) / 2, LOW - 0.6), (2 * SX, SN - SS, 0.3), 0, root)
    for sx in (-1, 1):
        P.append(box("el_guide", (0.2, 0.3, ZT - ZB), loc=(sx * (SX - 0.1), EY, (ZB + ZT) / 2), m="steel_painted_yellow"))
    # landing thresholds: atrium floor and the two balconies run through the wall opening to the shaft
    for i_l, (lz, _) in enumerate(LANDS):
        P.append(box("el_threshold", (2 * SX, SS + 0.32 - 101.2, 0.2 if lz == 0 else 0.35), loc=(0, (101.2 + SS + 0.32) / 2, lz - (0.1 if lz == 0 else 0.175)), m="int_grate" if lz else "steel_galv"))
        col(f"COL_el_threshold{i_l}", (0, (101.2 + SS + 0.32) / 2, lz - (0.1 if lz == 0 else 0.175)), (2 * SX, SS + 0.32 - 101.2, 0.2 if lz == 0 else 0.35), 0, root)
    # car: grated deck, side rails (east/west), control post with the level button
    ev = empty("elevator", loc=(0, EY, 0), parent=root, interact="elevator", iid="nasa_elevator")
    ep = [box("el_deck", (8.4, 8.4, 0.3), loc=(0, 0, -0.15), m="int_grate"), box("el_frame", (8.4, 8.4, 0.25), loc=(0, 0, -0.45), m="steel_painted_yellow")]
    for sx in (-1, 1):
        ep.append(box("el_rail", (0.06, 8.4, 1.1), loc=(sx * 4.15, 0, 0.55), m="steel_painted_yellow"))
        ep.append(box("el_rail_mid", (0.04, 8.4, 0.05), loc=(sx * 4.15, 0, 0.55), m="steel_painted_yellow"))
    ep.append(box("el_post", (0.15, 0.15, 1.1), loc=(3.9, -3.7, 0.55), m="console_dark"))
    ep.append(box("el_panel", (0.35, 0.15, 0.45), loc=(3.9, -3.78, 1.15), m="console_dark"))
    em = merge(ep, "elevator_mesh", par=ev)
    em.location = (0, 0, 0)
    finish(em, 30)
    col("COL_elevator_deck", (0, 0, -0.2), (8.4, 8.4, 0.4), 0, ev, mover="nasa_elevator")
    for sx in (-1, 1):
        col(f"COL_el_rail{sx}", (sx * 4.15, 0, 0.55), (0.1, 8.4, 1.1), 0, ev, mover="nasa_elevator")
    box("el_button", (0.22, 0.08, 0.22), loc=(3.9, -3.87, 1.15), m="emit_green", par=ev, interact="elevator", iid="nasa_elevator_btn")
    # landing gates (they rise into the solid wall above each opening) and call buttons
    for i_l, (lz, top) in enumerate(LANDS + [(LOW, LOW + 3.2)]):
        gy = SS if i_l < 3 else SN
        gv = empty(f"elgate_{i_l}", loc=(0, gy, lz), parent=root, interact="elgate", iid=f"elgate_{i_l}")
        gv["level"] = i_l
        gp = [box("eg_rail", (2 * SX, 0.08, 0.08), loc=(0, 0, 0.06), m="steel_painted_yellow"), box("eg_rail", (2 * SX, 0.08, 0.08), loc=(0, 0, 2.36), m="steel_painted_yellow"),
              box("eg_rail", (2 * SX, 0.06, 0.06), loc=(0, 0, 1.2), m="steel_painted_yellow")]
        for b in range(int(2 * SX / 0.22)):
            gp.append(box("eg_bar", (0.03, 0.03, 2.3), loc=(-SX + 0.11 + b * 0.22, 0, 1.2), m="metal_dark"))
        gm = merge(gp, f"elgate_{i_l}_mesh", par=gv)
        gm.location = (0, 0, 0)
        finish(gm, 30)
        col(f"COL_elgate_{i_l}", (0, 0, 1.2), (2 * SX, 0.2, 2.4), 0, gv, door=f"elgate_{i_l}")
        if i_l < 3:
            # on the atrium wall right of the landing, facing the atrium centre
            px, pz = SX + 0.85, lz + 1.25
            py = AC[1] + math.sqrt((AR - 0.4) ** 2 - px * px) - 0.06
            g = facing(-px, AC[1] - py)
            P.append(box("elcall_panel", (0.32, 0.06, 0.5), loc=(px, py, pz), rot=(0, 0, g), m="console_dark", bevel=0.01))
            cb = box(f"elcall_{i_l}", (0.13, 0.05, 0.13), loc=(px - math.sin(g) * 0.0, py - 0.035, pz), rot=(0, 0, g), m="emit_green", par=root, interact="elcall", iid=str(i_l))
            sign(P, L, ["ELEVATOR  ·  LEVEL 0", "ELEVATOR  ·  LEVEL +5.5", "ELEVATOR  ·  LEVEL +11"][i_l], (0, AC[1] + AR - 0.42, top + 0.45), (0, -1), size=0.2)
        else:
            px, pz = 4.45, LOW + 1.25
            P.append(box("elcall_panel", (0.06, 0.32, 0.5), loc=(px, SN + 1.6, pz), m="console_dark", bevel=0.01))
            box(f"elcall_{i_l}", (0.05, 0.13, 0.13), loc=(px - 0.04, SN + 1.6, pz), m="emit_green", par=root, interact="elcall", iid=str(i_l))
            sign(P, L, "ELEVATOR  ·  LEVEL −35", (0, SN + 0.17, top + 0.45), (0, 1), size=0.2)
    L.append(box("lampE|elev|e", (8, 0.2, 0.05), loc=(0, EY, ZT - 0.05), m="emit_cool"))
    lights.append(empty(f"light_elev_{len(lights)}", loc=(0, EY, 13.0), parent=root, light="cool", group="elev", intensity=7, distance=16))
    lights.append(empty(f"light_elev_{len(lights)}", loc=(0, EY, LOW + 3.0), parent=root, light="cool", group="elev", intensity=7, distance=12))

    # ================================================================================== lower level: corridor to the silo hall (z = LOW)
    CW, CH = 9.0, 7.0
    RR = SILO_R + 7.5            # silo hall ring wall (0.9 thick)
    cy0 = SN + 0.15
    cy1 = SILO_Y - math.sqrt((RR + 0.45) ** 2 - (CW / 2 + 0.9) ** 2)   # the corridor walls meet the ring's outer face
    P.append(box("low_floor", (CW, SILO_Y - RR + 1.5 - (SN - 0.35), 0.3), loc=(0, (SN - 0.35 + SILO_Y - RR + 1.5) / 2, LOW - 0.15), m="concrete_dark"))
    col("COL_low_floor", (0, (SN - 0.35 + SILO_Y - RR + 1.5) / 2, LOW - 0.15), (CW, SILO_Y - RR + 1.5 - (SN - 0.35), 0.3), 0, root)
    for sx in (-1, 1):
        P.append(box("low_wall", (0.6, cy1 - cy0, CH), loc=(sx * (CW / 2 + 0.3), (cy0 + cy1) / 2, LOW + CH / 2), m="concrete"))
        col(f"COL_lowwall{sx}", (sx * (CW / 2 + 0.3), (cy0 + cy1) / 2, LOW + CH / 2), (0.6, cy1 - cy0, CH), 0, root)
        P.append(box("low_tray", (0.4, cy1 - cy0, 0.08), loc=(sx * (CW / 2 - 0.2), (cy0 + cy1) / 2, LOW + 5.5), m="steel_galv"))
        P.append(kit.tube("fuel_line", [(sx * (CW / 2 - 0.3), cy0, LOW + 0.6), (sx * (CW / 2 - 0.3), cy1, LOW + 0.6)], 0.18, m="steel_painted_white" if sx < 0 else "pipe_blue", seg=12))
    P.append(box("low_ceil", (CW + 1.2, cy1 - cy0, 0.5), loc=(0, (cy0 + cy1) / 2, LOW + CH + 0.25), m="concrete"))
    light_strip(P, L, lights, root, 0, (cy0 + cy1) / 2, LOW + CH - 0.05, cy1 - cy0 - 2, "y", "lower", every=12)
    for k in range(int((cy1 - cy0) / 6)):
        P.append(box("hazard", (0.6, 0.6, 0.02), loc=(-CW / 2 + 0.5, cy0 + 3 + k * 6, LOW + 0.02), m="steel_painted_yellow"))
    for off in (-0.35, 0.35):
        P.append(box("guide_stripe", (cy1 - cy0 - 1, 0.14, 0.008), loc=(off, (cy0 + cy1) / 2, LOW + 0.006), rot=(0, 0, PI / 2), m="steel_painted_yellow"))
    sign(P, L, "LAUNCH COMPLEX  ·  SILO 1", (0, cy1 - 0.4, LOW + 5.6), (0, -1), size=0.32)
    rv = box("ROOM_nasa_lower", (CW, cy1 - cy0 + 9, CH), loc=(0, (cy0 + cy1) / 2 - 4.5, LOW + CH / 2), m="frame_black", par=root, room="nasa_lower")
    rv.hide_render = True

    # ================================================================================== silo hall at the bottom (z = LOW .. LOW+12) — the shaft above is built at runtime
    # the floor reaches the ring wall all round (it stopped 1.5 m short of it: a ring-shaped drop)
    P.append(cyl("silo_floor", RR + 0.1, 0.4, loc=(0, SILO_Y, LOW - 0.2), m="concrete_dark", verts=64))
    col("COL_silo_floor", (0, SILO_Y, LOW - 0.2), (2 * RR + 1.0, 2 * RR + 1.0, 0.4), 0, root)
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
    # silo hall ring wall (lower 14 m; the shaft continues at runtime) with the corridor doorway cut to its width
    ring_wall("silo_ring", (0, SILO_Y), RR, LOW, LOW + 14, 0.9, "concrete", 48, [(270, CW, [(LOW, LOW + 6.5)])], P, root)
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
    empty("director_spot", loc=(-27.5, 95.5, 1.8), rot=(0, 0, PI / 2), parent=root)

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
