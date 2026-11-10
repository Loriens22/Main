"""
Endurance interior — walkable under spin gravity, modelled from the interior reference images:
  #15 hub (iris docking door with radial petals and offset window, padded walls, ladders),
  #6  flight deck (seat rows with tall headrests, overhead consoles, centre aisle floor plates),
  #11 command / navigation room (floor hatches in white, grey and blue, cubby wall with windows, side consoles),
  #19 module ceiling (big square light bays with brackets, blue acoustic pads, blue lower cabinets, CRT consoles),
  #7  galley (fold-out table, netted cargo racks, puffy storage bags, round portholes, wall terminal),
  #1  crew quarters (red chair, bag rack, white drawer unit, small blue console),
  #20 cryo-lab (white tile, cryo beds raised out of floor pits, columns, ceiling camera arms, rounded alcoves).

Shares coordinates with endurance.glb (same origin; spin axis +Y; ring in XZ). Module frame (t, a, r): r points away
from the hub, so under spin gravity "down" is +r. Levels:
  vestibule  r 19.75 → 23.0 (floor), tunnels and node junctions at the same floor level, ring walkway all round;
  deck       floor r 31.63, suspended ceiling r 28.85 (walkable modules 0, 3, 6, 9), reached by a ladder shaft;
  hub        microgravity drum on the axis; spokes with ladders to the vestibules of modules 3 and 9.
Exports endurance_int.glb: render meshes, COL_ boxes, ROOM_ volumes, light empties, lamp meshes,
ladder empties (lad_<id>_a bottom / _b top / _ea, _eb exits) with a 'ladder' interactable, iris door, spawn points.
"""
import sys, os, math, random
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "lib"))
sys.path.insert(0, HERE)
import bpy, bmesh
from mathutils import Matrix
import kit
from kit import V, box, cyl, prism, empty, merge, finish, set_props, lathe
from farm_house import obox, seg_box
import endurance as E
from endurance import Fr, frame_at, RI, RV, RO, HT, YF, YB, YV, RN, YN, TH, RC, WALL, TYPES, WALKABLE, HATCH, PI

R = random.Random(2067)
FLOOR = 31.63           # deck floor surface (radius)
CEIL = 28.85            # deck suspended ceiling
VFLOOR = RV             # vestibule floor surface = 23.0
VCEIL = RI + WALL       # 19.75
IT0, IT1 = -HT + WALL + 0.05, HT - WALL - 0.05   # interior t extent
IY0, IY1 = YB + WALL + 0.05, YF - WALL - 0.05    # deck interior y extent
VY1 = YV - WALL - 0.05                            # vestibule front wall
NODE_T = RN * math.sin(math.radians(15))          # node centre, tangential offset in a module frame
LAD_T, LAD_Y = (HATCH[0] + HATCH[1]) / 2, HATCH[2] + 0.18   # ladder line in the shaft (against the rear shaft wall)

P, G, L = [], [], []        # render parts, glass, lamp meshes
LIGHTS = []
ROOT = None


# ======================================================================================== helpers
def basis(F):
    return F.t, F.a, F.r


def col(F, name, t0, t1, y0, y1, r0, r1, **props):
    """Oriented collision box in a module frame (x = t, y = axial, z = −r: right-handed)."""
    t, a, r = basis(F)
    c = F.p((t0 + t1) / 2, (y0 + y1) / 2, (r0 + r1) / 2)
    o = box("COL_" + name, (abs(t1 - t0), abs(y1 - y0), abs(r1 - r0)), m="frame_black")
    o.matrix_basis = Matrix(((t.x, a.x, -r.x, c.x), (t.y, a.y, -r.y, c.y), (t.z, a.z, -r.z, c.z), (0, 0, 0, 1)))
    o.parent = ROOT
    o["col"] = "box"
    for k, v in props.items():
        o[k] = v
    o.hide_render = True
    return o


def room(F, name, t0, t1, y0, y1, r0, r1):
    t, a, r = basis(F)
    c = F.p((t0 + t1) / 2, (y0 + y1) / 2, (r0 + r1) / 2)
    o = box("ROOM_" + name, (abs(t1 - t0), abs(y1 - y0), abs(r1 - r0)), m="frame_black")
    o.matrix_basis = Matrix(((t.x, a.x, -r.x, c.x), (t.y, a.y, -r.y, c.y), (t.z, a.z, -r.z, c.z), (0, 0, 0, 1)))
    o.parent = ROOT
    o["room"] = name
    o.hide_render = True


def light(F, group, tc, yc, rc, kind="cool", intensity=4.0, distance=7.0):
    LIGHTS.append(empty(f"light_{group}_{len(LIGHTS)}", loc=F.p(tc, yc, rc), parent=ROOT, light=kind, group=group, intensity=intensity, distance=distance))


def B(F, name, t0, t1, y0, y1, r0, r1, m):
    return F.box(P, name, min(t0, t1), max(t0, t1), min(y0, y1), max(y0, y1), min(r0, r1), max(r0, r1), m)


def oriented(o, F, tc, yc, rc, yaw=0.0):
    """Place an object built in local (x = t, y = axial, z = up = −r) into the module frame, rotated about 'up'."""
    t, a, r = basis(F)
    rot = Matrix.Rotation(yaw, 4, "Z")
    M = Matrix(((t.x, a.x, -r.x, 0), (t.y, a.y, -r.y, 0), (t.z, a.z, -r.z, 0), (0, 0, 0, 1)))
    c = F.p(tc, yc, rc)
    o.matrix_basis = Matrix.Translation(c) @ M @ rot @ o.matrix_basis
    return o


def light_bay(F, tc, yc, w, d, group, rc=None, lights=True):
    """Ref #19: recessed square light bay — beige moulded frame, inner step, four hook brackets, lit diffuser with grid."""
    rc = CEIL if rc is None else rc
    hw, hd = w / 2, d / 2
    fr = 0.14
    for (a0, a1, b0, b1) in ((-hw, hw, hd - fr, hd), (-hw, hw, -hd, -hd + fr), (-hw, -hw + fr, -hd, hd), (hw - fr, hw, -hd, hd)):
        B(F, "bay_frame", tc + a0, tc + a1, yc + b0, yc + b1, rc - 0.02, rc + 0.06, "console_beige")
    for (a0, a1, b0, b1) in ((-hw + fr, hw - fr, hd - fr - 0.06, hd - fr), (-hw + fr, hw - fr, -hd + fr, -hd + fr + 0.06),
                             (-hw + fr, -hw + fr + 0.06, -hd + fr, hd - fr), (hw - fr - 0.06, hw - fr, -hd + fr, hd - fr)):
        B(F, "bay_step", tc + a0, tc + a1, yc + b0, yc + b1, rc - 0.16, rc - 0.02, "console_beige")
    L.append(obox(f"lampE|{group}|bay", F.p(tc, yc, rc - 0.17), F.t, F.a, F.r, -hw + fr + 0.06, hw - fr - 0.06, -hd + fr + 0.06, hd - fr - 0.06, -0.01, 0.0, "emit_cool"))
    n = 4
    for i in range(1, n):
        x = -hw + fr + 0.06 + (w - 2 * fr - 0.12) * i / n
        B(F, "bay_grid", tc + x - 0.006, tc + x + 0.006, yc - hd + fr, yc + hd - fr, rc - 0.175, rc - 0.168, "metal_gray")
        y = -hd + fr + 0.06 + (d - 2 * fr - 0.12) * i / n
        B(F, "bay_grid", tc - hw + fr, tc + hw - fr, yc + y - 0.006, yc + y + 0.006, rc - 0.175, rc - 0.168, "metal_gray")
    for (sx, sy) in ((-1, -1), (-1, 1), (1, -1), (1, 1)):   # hook brackets
        hx, hy = tc + sx * (hw - 0.3), yc + sy * (hd - 0.05)
        B(F, "bay_hook", hx - 0.05, hx + 0.05, hy - 0.04, hy + 0.04, rc + 0.06, rc + 0.18, "console_beige")
        B(F, "bay_hook", hx - 0.05, hx + 0.05, hy - sy * 0.16, hy + 0.04 * sy, rc + 0.16, rc + 0.2, "console_beige")
    if lights:
        light(F, group, tc, yc, rc + 0.5, "cool", 5.0, 7.5)


def blue_pad(F, tc, yc, w, d, rc=None):
    """Ref #19: blue acoustic pillow panels hung below the ceiling on two bars."""
    rc = CEIL if rc is None else rc
    for s in (-1, 1):
        B(F, "pad_blue", tc + s * (w / 4) - w / 4 + 0.01, tc + s * (w / 4) + w / 4 - 0.01, yc - d / 2, yc + d / 2, rc + 0.08, rc + 0.22, "pad_blue")
    for s in (-1, 1):
        B(F, "pad_bar", tc - w / 2 - 0.1, tc + w / 2 + 0.1, yc + s * (d / 2 + 0.05) - 0.025, yc + s * (d / 2 + 0.05) + 0.025, rc + 0.04, rc + 0.08, "steel_painted_white")
        B(F, "pad_hanger", tc + s * (w / 2 + 0.06) - 0.02, tc + s * (w / 2 + 0.06) + 0.02, yc - 0.02, yc + 0.02, rc, rc + 0.06, "steel_painted_white")


def puffy_bag(name, F, tc, yc, rc, w, d, h, m="pad_white", strap=True):
    """Ref #7/#1: soft stowage bag — rounded pillow with a strap cross."""
    o = kit.sphere(name, 0.5, m=m, segs=16, rings=10, scale=(w, d, h))
    # flatten the bottom half a little (sits on a shelf)
    for v in o.data.vertices:
        if v.co.z < 0:
            v.co.z *= 0.55
        v.co.x = max(-w * 0.48, min(w * 0.48, v.co.x * 1.15))
        v.co.y = max(-d * 0.48, min(d * 0.48, v.co.y * 1.15))
    oriented(o, F, tc, yc, rc - h * 0.3)
    P.append(o)
    if strap:
        B(F, "bag_strap", tc - 0.025, tc + 0.025, yc - d * 0.47, yc + d * 0.47, rc - h * 0.62, rc - h * 0.58, "pad_gray")
        B(F, "bag_strap", tc - w * 0.47, tc + w * 0.47, yc - 0.025, yc + 0.025, rc - h * 0.62, rc - h * 0.58, "pad_gray")


def quilt_wall(F, axis, fixed, a0, a1, r0, r1, m="pad_white", inward=1, cells=(4, 3), depth=0.08):
    """Padded wall of quilted cushions (refs #1, #7, #15). axis 'y' = wall at constant y spanning t; 't' = constant t spanning y."""
    nu, nv = cells
    for i in range(nu):
        u0 = a0 + (a1 - a0) * i / nu + 0.02
        u1 = a0 + (a1 - a0) * (i + 1) / nu - 0.02
        for j in range(nv):
            v0 = r0 + (r1 - r0) * j / nv + 0.02
            v1 = r0 + (r1 - r0) * (j + 1) / nv - 0.02
            if axis == "y":
                B(F, "quilt", u0, u1, fixed, fixed - inward * depth, v0, v1, m)
            else:
                B(F, "quilt", fixed, fixed - inward * depth, u0, u1, v0, v1, m)


def screen(F, tc, yc, rc, w, h, facing="y-", m="emit_screen"):
    """Flat lit screen + bezel on a wall facing −y (wall at +y) or +y, −t or +t."""
    d = {"y-": (0, -1), "y+": (0, 1), "t-": (-1, 0), "t+": (1, 0)}[facing]
    if d[1] != 0:
        B(F, "screen_bezel", tc - w / 2 - 0.04, tc + w / 2 + 0.04, yc, yc + d[1] * 0.05, rc - h / 2 - 0.04, rc + h / 2 + 0.04, "console_dark")
        B(F, "screen", tc - w / 2, tc + w / 2, yc + d[1] * 0.05, yc + d[1] * 0.06, rc - h / 2, rc + h / 2, m)
    else:
        B(F, "screen_bezel", tc, tc + d[0] * 0.05, yc - w / 2 - 0.04, yc + w / 2 + 0.04, rc - h / 2 - 0.04, rc + h / 2 + 0.04, "console_dark")
        B(F, "screen", tc + d[0] * 0.05, tc + d[0] * 0.06, yc - w / 2, yc + w / 2, rc - h / 2, rc + h / 2, m)


def switch_panel(F, t0, t1, yw, r0, r1, facing=-1, rows=3, cols=8):
    """Toggle switches, push buttons and indicator lamps on a panel (refs #6, #19)."""
    B(F, "sw_panel", t0, t1, yw, yw + facing * 0.03, r0, r1, "console_beige")
    for i in range(cols):
        for j in range(rows):
            x = t0 + (t1 - t0) * (i + 0.5) / cols
            z = r0 + (r1 - r0) * (j + 0.5) / rows
            kind = (i * 7 + j * 3) % 5
            if kind == 0:
                L.append(obox("lampE|panel|led", F.p(x, yw + facing * 0.035, z), F.t, F.a, F.r, -0.02, 0.02, -0.004, 0.004, -0.02, 0.02, "emit_green" if (i + j) % 3 else "emit_red"))
            elif kind in (1, 2):
                B(F, "toggle", x - 0.012, x + 0.012, yw + facing * 0.03, yw + facing * 0.09, z - 0.012, z + 0.012, "metal_brushed")
            else:
                B(F, "button", x - 0.03, x + 0.03, yw + facing * 0.03, yw + facing * 0.05, z - 0.025, z + 0.025, "plastic_gray" if kind == 3 else "console_dark")


def tall_seat(F, tc, yc, facing_y=1):
    """Ref #6 flight-deck seat: pedestal on floor rails, deep cushion, tall winged backrest with headrest, armrests."""
    f = facing_y
    fl = FLOOR
    B(F, "seat_rail", tc - 0.32, tc - 0.26, yc - 0.45, yc + 0.45, fl - 0.03, fl, "metal_dark")
    B(F, "seat_rail", tc + 0.26, tc + 0.32, yc - 0.45, yc + 0.45, fl - 0.03, fl, "metal_dark")
    B(F, "seat_pedestal", tc - 0.16, tc + 0.16, yc - 0.16, yc + 0.16, fl - 0.42, fl - 0.03, "metal_gunmetal")
    B(F, "seat_frame", tc - 0.3, tc + 0.3, yc - 0.32, yc + 0.32, fl - 0.5, fl - 0.42, "metal_dark")
    B(F, "seat_cushion", tc - 0.27, tc + 0.27, yc - 0.3, yc + 0.28, fl - 0.6, fl - 0.5, "fabric_red")
    yb = yc - f * 0.32
    B(F, "seat_back", tc - 0.28, tc + 0.28, yb - 0.06, yb + 0.06, fl - 1.32, fl - 0.55, "fabric_red")
    for s in (-1, 1):
        B(F, "seat_wing", tc + s * 0.28, tc + s * 0.33, yb - 0.06, yb + f * 0.14, fl - 1.25, fl - 0.62, "fabric_red")
        B(F, "seat_arm", tc + s * 0.3, tc + s * 0.36, yb, yb + f * 0.48, fl - 0.78, fl - 0.72, "metal_dark")
        B(F, "seat_arm_post", tc + s * 0.31, tc + s * 0.35, yb + f * 0.38, yb + f * 0.42, fl - 0.72, fl - 0.5, "metal_dark")
    B(F, "seat_head", tc - 0.16, tc + 0.16, yb - 0.07, yb + 0.07, fl - 1.52, fl - 1.32, "fabric_red")
    B(F, "seat_backshell", tc - 0.3, tc + 0.3, yb - f * 0.09, yb - f * 0.06, fl - 1.4, fl - 0.5, "metal_dark")
    for k in range(4):   # stitched channels on the backrest (ref #6 stripes)
        x = tc - 0.15 + k * 0.1
        B(F, "seat_channel", x - 0.008, x + 0.008, yb + f * 0.06, yb + f * 0.065, fl - 1.28, fl - 0.6, "pad_gray")
    col(F, "seat", tc - 0.3, tc + 0.3, yc - 0.35, yc + 0.35, fl - 1.0, fl)


def floor_hatch_plate(F, tc, yc, w, d, style=0):
    """Ref #11 floor plates: white frame, grey/blue inset fields, recessed handles and ring pulls."""
    r0 = FLOOR - 0.012
    B(F, "fplate_frame", tc - w / 2, tc + w / 2, yc - d / 2, yc + d / 2, r0, FLOOR + 0.002, "plate_white")
    if style == 0:
        B(F, "fplate_field", tc - w / 2 + 0.08, tc - 0.02, yc - d / 2 + 0.08, yc + d / 2 - 0.08, r0 - 0.004, r0, "pad_blue")
        B(F, "fplate_field", tc + 0.02, tc + w / 2 - 0.08, yc - d / 2 + 0.08, yc + d / 2 - 0.08, r0 - 0.004, r0, "plastic_gray")
    else:
        B(F, "fplate_field", tc - w / 2 + 0.1, tc + w / 2 - 0.1, yc - d / 2 + 0.1, yc + d / 2 - 0.1, r0 - 0.004, r0, "steel_painted_gray")
    for s in (-1, 1):
        B(F, "fplate_handle", tc - 0.1, tc + 0.1, yc + s * (d / 2 - 0.16) - 0.03, yc + s * (d / 2 - 0.16) + 0.03, r0 - 0.008, r0 - 0.004, "metal_dark")


def console_bank(F, t0, t1, yw, facing=-1, style="beige", screens=2, height=1.05):
    """Ref #19/#6: lower cabinet with drawers, sloped desk, upper instrument rack with CRT screens and switch panels."""
    fl = FLOOR
    body = "console_blue" if style == "blue" else "console_beige"
    B(F, "con_base", t0, t1, yw, yw + facing * 0.65, fl - height + 0.1, fl, body)
    B(F, "con_kick", t0 + 0.02, t1 - 0.02, yw + facing * 0.62, yw + facing * 0.66, fl - 0.1, fl, "metal_dark")
    n = max(1, int((t1 - t0) / 0.6))
    for i in range(n):   # drawer fronts
        x0 = t0 + (t1 - t0) * i / n + 0.03
        x1 = t0 + (t1 - t0) * (i + 1) / n - 0.03
        B(F, "con_drawer", x0, x1, yw + facing * 0.65, yw + facing * 0.67, fl - height + 0.4, fl - 0.15, body)
        B(F, "con_pull", (x0 + x1) / 2 - 0.08, (x0 + x1) / 2 + 0.08, yw + facing * 0.67, yw + facing * 0.69, fl - height + 0.5, fl - height + 0.53, "metal_brushed")
    B(F, "con_desk", t0 - 0.02, t1 + 0.02, yw, yw + facing * 0.72, fl - height + 0.06, fl - height + 0.1, "console_dark")
    # sloped upper rack
    rk0 = fl - height
    B(F, "con_rack", t0, t1, yw, yw + facing * 0.3, rk0 - 1.0, rk0, "console_beige")
    ns = screens
    for i in range(ns):
        x = t0 + (t1 - t0) * (i + 0.5) / ns
        screen(F, x, yw + facing * 0.3, rk0 - 0.55, min(0.5, (t1 - t0) / ns - 0.25), 0.36, "y-" if facing < 0 else "y+")
    switch_panel(F, t0 + 0.05, t1 - 0.05, yw + facing * 0.3, rk0 - 0.24, rk0 - 0.06, facing, rows=2, cols=max(4, int((t1 - t0) * 6)))
    switch_panel(F, t0 + 0.05, t1 - 0.05, yw + facing * 0.3, rk0 - 0.98, rk0 - 0.82, facing, rows=2, cols=max(4, int((t1 - t0) * 6)))
    col(F, "console", t0, t1, min(yw, yw + facing * 0.72), max(yw, yw + facing * 0.72), fl - height, fl)


def ladder(F, gid, t, y, r_top, r_bot, side="y+", exit_top=None, exit_bot=None):
    """Steel ladder: two stiles and rungs every 0.3 m from r_top (higher, toward the hub) to r_bot (floor)."""
    off = 0.22
    d = 1 if side == "y+" else -1
    for s in (-1, 1):
        B(F, "lad_stile", t + s * off - 0.025, t + s * off + 0.025, y - 0.025, y + 0.025, r_top - 0.3, r_bot, "metal_brushed")
        B(F, "lad_bracket", t + s * off - 0.02, t + s * off + 0.02, y, y - d * 0.12, r_top + 0.4, r_top + 0.45, "metal_dark")
    n = int((r_bot - r_top) / 0.3)
    for i in range(n + 1):
        rr = r_top + i * (r_bot - r_top) / max(1, n)
        B(F, "lad_rung", t - off, t + off, y - 0.018, y + 0.018, rr - 0.018, rr + 0.018, "metal_brushed")
    # ladder empties (frame-local positions, player climbs from a (bottom) to b (top))
    empty(f"lad_{gid}_a", loc=F.p(t, y + d * 0.42, r_bot), parent=ROOT)
    empty(f"lad_{gid}_b", loc=F.p(t, y + d * 0.42, r_top), parent=ROOT)
    eb = exit_bot or (t, y + d * 0.9, r_bot)
    et = exit_top or (t, y + d * 0.9, r_top)
    empty(f"lad_{gid}_ea", loc=F.p(*eb), parent=ROOT)
    empty(f"lad_{gid}_eb", loc=F.p(*et), parent=ROOT)
    hit = box(f"lad_{gid}_hit", (0.6, 0.3, abs(r_bot - r_top)), m="frame_black")
    oriented(hit, F, t, y + d * 0.15, (r_top + r_bot) / 2)
    hit.parent = ROOT
    hit["interact"] = "ladder"
    hit["iid"] = f"lad_{gid}"
    hit.hide_render = True


# ======================================================================================== ring: vestibules + tunnels
def vestibule(k):
    F = Fr(k)
    kind = TYPES[k]
    grp = f"ring{k}"
    t0, t1 = IT0, IT1
    y0, y1 = IY0, VY1
    # floor: dark dimpled mat on plates, with a ladder hatch in walkable modules
    hx0, hx1, hy0, hy1 = HATCH
    walk = k in WALKABLE
    if walk:
        for (a0, a1, b0, b1) in ((t0, hx0, y0, y1), (hx1, t1, y0, y1), (hx0, hx1, y0, hy0), (hx0, hx1, hy1, y1)):
            B(F, "v_floor", a0, a1, b0, b1, VFLOOR - 0.03, VFLOOR, "endu_floor")
            col(F, f"v_floor{k}", a0, a1, b0, b1, VFLOOR, VFLOOR + 0.3)
        # hatch coaming, open lid, safety rail (yellow)
        for (a0, a1, b0, b1) in ((hx0 - 0.08, hx1 + 0.08, hy0 - 0.08, hy0), (hx0 - 0.08, hx1 + 0.08, hy1, hy1 + 0.08),
                                 (hx0 - 0.08, hx0, hy0, hy1), (hx1, hx1 + 0.08, hy0, hy1)):
            B(F, "hatch_coaming", a0, a1, b0, b1, VFLOOR - 0.08, VFLOOR, "warning_yellow")
        B(F, "hatch_lid", hx0, hx1, hy1 + 0.08, hy1 + 0.12, VFLOOR - 1.4, VFLOOR - 0.08, "hatch_gray")
        B(F, "hatch_wheel", (hx0 + hx1) / 2 - 0.2, (hx0 + hx1) / 2 + 0.2, hy1 + 0.04, hy1 + 0.08, VFLOOR - 0.95, VFLOOR - 0.55, "metal_brushed")
        for (a, b) in (((hx0 - 0.1, hy0 - 0.1), (hx0 - 0.1, hy1 + 0.1)), ((hx0 - 0.1, hy0 - 0.1), (hx1 + 0.1, hy0 - 0.1))):
            pa, pb = F.p(a[0], a[1], VFLOOR - 1.0), F.p(b[0], b[1], VFLOOR - 1.0)
            P.append(seg_box("hatch_rail", pa, pb, 0.05, 0.05, "warning_yellow", up=tuple(-F.r)))
            for q in (a, b):
                P.append(seg_box("hatch_post", F.p(q[0], q[1], VFLOOR), F.p(q[0], q[1], VFLOOR - 1.0), 0.05, 0.05, "warning_yellow", up=tuple(F.t)))
        col(F, f"hatch_rail{k}", hx0 - 0.15, hx0 - 0.05, hy0 - 0.15, hy1 + 0.15, VFLOOR - 1.05, VFLOOR)
        col(F, f"hatch_rail{k}b", hx0 - 0.15, hx1 + 0.15, hy0 - 0.15, hy0 - 0.05, VFLOOR - 1.05, VFLOOR)
        ladder(F, f"m{k}", LAD_T, LAD_Y, VFLOOR, FLOOR, "y+",
               exit_top=(hx1 + 0.55, (hy0 + hy1) / 2, VFLOOR), exit_bot=(LAD_T - 0.9, LAD_Y + 0.9, FLOOR))
    else:
        B(F, "v_floor", t0, t1, y0, y1, VFLOOR - 0.03, VFLOOR, "endu_floor")
        col(F, f"v_floor{k}", t0, t1, y0, y1, VFLOOR, VFLOOR + 0.3)
        # sealed floor hatch with stencil
        B(F, "hatch_sealed", hx0, hx1, hy0, hy1, VFLOOR - 0.035, VFLOOR - 0.03, "hatch_gray")
        B(F, "hatch_stripe", hx0 - 0.1, hx1 + 0.1, hy0 - 0.12, hy0 - 0.06, VFLOOR - 0.036, VFLOOR - 0.03, "warning_yellow")
    # floor plate seams
    for i in range(1, 6):
        x = t0 + (t1 - t0) * i / 6
        B(F, "v_floor_seam", x - 0.012, x + 0.012, y0, y1, VFLOOR - 0.033, VFLOOR - 0.03, "metal_dark")
    # ceiling: panels, a light bay pair, pipes (blue/white conduits)
    B(F, "v_ceiling", t0, t1, y0, y1, VCEIL, VCEIL + 0.04, "steel_painted_white") if k not in (3, 9) else None
    if k in (3, 9):
        for (a0, a1, b0, b1) in ((t0, -1.35, y0, y1), (1.35, t1, y0, y1), (-1.35, 1.35, y0, -1.35), (-1.35, 1.35, 1.35, y1)):
            B(F, "v_ceiling", a0, a1, b0, b1, VCEIL, VCEIL + 0.04, "steel_painted_white")
    for tc in (-2.4, 2.4):
        light_bay(F, tc, -0.8, 1.2, 1.2, grp, rc=VCEIL + 0.04)
    for j, yy in enumerate((y0 + 0.25, y0 + 0.45, y1 - 0.3)):
        P.append(seg_box("v_pipe", F.p(t0, yy, VCEIL + 0.18), F.p(t1, yy, VCEIL + 0.18), 0.07, 0.07, "pipe_blue" if j == 1 else "steel_painted_white", up=tuple(-F.r)))
    # front / back walls: quilted padding (refs #1/#7), stowage bags and a wall terminal on the front
    quilt_wall(F, "y", y1, t0, t1, VFLOOR - 2.9, VFLOOR - 0.15, "pad_white", inward=1, cells=(6, 3))
    quilt_wall(F, "y", y0, t0, t1, VFLOOR - 2.9, VFLOOR - 0.15, "pad_beige", inward=-1, cells=(6, 3))
    B(F, "v_wall_front", t0, t1, y1, y1 + 0.02, VCEIL, VFLOOR, "steel_painted_gray")
    B(F, "v_wall_back", t0, t1, y0 - 0.02, y0, VCEIL, VFLOOR, "steel_painted_gray")
    col(F, f"v_front{k}", t0 - 0.3, t1 + 0.3, y1 - 0.1, y1 + 0.3, VCEIL, VFLOOR)
    col(F, f"v_back{k}", t0 - 0.3, t1 + 0.3, y0 - 0.3, y0 + 0.1, VCEIL, VFLOOR)
    # stowage rack against the back wall (ref #7 bag rack)
    for i in range(3):
        for j in range(2):
            puffy_bag("bag", F, -1.2 + i * 0.62, y0 + 0.36, VFLOOR - 0.55 - j * 0.62, 0.56, 0.5, 0.42)
    B(F, "rack_shelf", -1.55, 0.35, y0 + 0.05, y0 + 0.62, VFLOOR - 0.55, VFLOOR - 0.52, "metal_dark")
    B(F, "rack_shelf", -1.55, 0.35, y0 + 0.05, y0 + 0.62, VFLOOR - 1.17, VFLOOR - 1.14, "metal_dark")
    col(F, f"v_rack{k}", -1.55, 0.35, y0, y0 + 0.62, VFLOOR - 1.6, VFLOOR)
    # wall terminal and module sign
    screen(F, 0.0, y1 - 0.08, VFLOOR - 1.5, 0.5, 0.34, "y-")
    switch_panel(F, -0.4, 0.4, y1 - 0.08, VFLOOR - 1.18, VFLOOR - 1.02, -1, rows=2, cols=6)
    B(F, "sign_plate", 0.6, 1.5, y1 - 0.09, y1 - 0.1, VFLOOR - 2.2, VFLOOR - 1.95, "plate_white")
    B(F, "sign_band", 0.6, 1.5, y1 - 0.1, y1 - 0.105, VFLOOR - 2.18, VFLOOR - 2.13,
      {"habitat": "pad_blue", "pod": "warning_yellow", "engine": "emit_red", "cryo": "emit_cool", "command": "fabric_red"}[kind])
    # fire extinguisher + handrails
    P.append(cyl("extinguisher", 0.08, 0.45, loc=F.p(-3.3, y1 - 0.15, VFLOOR - 0.6), rot=E.to_quat(-F.r).to_euler(), m="emit_red", verts=12))
    for yy in (y0 + 0.12, y1 - 0.12):
        P.append(seg_box("v_handrail", F.p(t0 + 0.2, yy, VFLOOR - 1.05), F.p(t1 - 0.2, yy, VFLOOR - 1.05), 0.04, 0.04, "metal_brushed", up=tuple(-F.r)))
    # end walls: frame around the tunnel openings + padding
    for s in (-1, 1):
        tw = s * (HT - WALL - 0.02)
        for (a0, a1, b0, b1) in ((y0, YN - TH, VCEIL, VFLOOR), (YN + TH, y1, VCEIL, VFLOOR), (YN - TH, YN + TH, VCEIL, RC - TH)):
            B(F, "v_endwall", tw, tw - s * 0.03, a0, a1, b0, b1, "steel_painted_gray")
            col(F, f"v_end{k}{s}", tw - s * 0.02, tw + s * 0.3, a0, a1, b0, b1)
        for (a0, a1, b0, b1) in ((YN - TH - 0.12, YN - TH, RC - TH - 0.12, VFLOOR), (YN + TH, YN + TH + 0.12, RC - TH - 0.12, VFLOOR),
                                 (YN - TH, YN + TH, RC - TH - 0.12, RC - TH)):
            B(F, "tunnel_portal", tw - s * 0.03, tw - s * 0.09, a0, a1, b0, b1, "metal_gunmetal")
        quilt_wall(F, "t", tw - s * 0.03, y0 + 0.1, YN - TH - 0.2, VCEIL + 0.3, VFLOOR - 0.2, "pad_white", inward=s, cells=(2, 3))
    room(F, f"ring_{k}", t0, t1, y0, y1, VCEIL, VFLOOR)
    # half-tunnels from both end faces to the node centres (floor flush with the vestibule floor)
    for s in (-1, 1):
        half_tunnel(F, s, k)


def half_tunnel(F, s, k):
    """Tunnel arm + half of the node junction, built in this module's frame from the end face (|t| = HT) to the node
    centre (|t| = NODE_T). Floor/ceiling planes belong to this module; the two halves meet on the node's bisector."""
    ta, tb = s * HT, s * (NODE_T + 0.02)
    lo, hi = min(ta, tb), max(ta, tb)
    fl, ce = RC + TH, RC - TH
    grp = f"ring{k}"
    B(F, "t_floor", lo, hi, YN - TH, YN + TH, fl - 0.03, fl, "endu_floor")
    col(F, f"t_floor{k}{s}", lo, hi, YN - TH - 0.4, YN + TH + 0.4, fl, fl + 0.3)
    B(F, "t_ceiling", lo, hi, YN - TH, YN + TH, ce, ce + 0.03, "steel_painted_white")
    drum_t = s * (NODE_T - 1.4)
    dlo, dhi = min(ta, drum_t), max(ta, drum_t)
    # arm side walls (padded) up to the drum, then the drum alcove walls with the portholes
    for sy in (-1, 1):
        yw = YN + sy * TH
        B(F, "t_wall", dlo, dhi, yw, yw + sy * 0.03, ce, fl, "steel_painted_gray")
        quilt_wall(F, "y", yw, dlo, dhi, ce + 0.1, fl - 0.1, "pad_white", inward=sy, cells=(1, 3), depth=0.06)
        col(F, f"t_wall{k}{s}{sy}", dlo, dhi, yw, yw + sy * 0.3, ce, fl)
        # drum alcove: walls at the drum caps (|y − YN| = 1.38), steps from the arm walls
        yc = YN + sy * 1.38
        a0, a1 = min(drum_t, tb), max(drum_t, tb)
        if s > 0:
            # porthole wall split around the porthole (centred on the node centre line t = NODE_T)
            ph = 0.42
            for (u0, u1, v0, v1) in ((a0, a1 - ph, ce, fl), (a1 - ph, a1, ce, 21.55), (a1 - ph, a1, 22.3, fl)):
                B(F, "drum_wall", u0, u1, yc, yc + sy * 0.03, v0, v1, "steel_painted_white")
        else:
            ph = 0.42
            for (u0, u1, v0, v1) in ((a0 + ph, a1, ce, fl), (a0, a0 + ph, ce, 21.55), (a0, a0 + ph, 22.3, fl)):
                B(F, "drum_wall", u0, u1, yc, yc + sy * 0.03, v0, v1, "steel_painted_white")
        col(F, f"drum_wall{k}{s}{sy}", a0, a1, yc, yc + sy * 0.3, ce, fl)
        B(F, "drum_step", drum_t - 0.02, drum_t + 0.02, min(yw, yc), max(yw, yc), ce, fl, "steel_painted_gray")
        # porthole surround (ring) on the alcove wall
        pc = F.p(s * NODE_T, yc - sy * 0.01, 21.93)
        P.append(kit.torus("porthole_in", 0.45, 0.06, loc=pc, rot=(PI / 2, 0, 0), m="metal_gunmetal", seg=24, rseg=6))
    B(F, "drum_floor", a0 if False else min(drum_t, tb), max(drum_t, tb), YN - 1.38, YN + 1.38, fl - 0.03, fl, "endu_floor")
    col(F, f"drum_floor{k}{s}", min(drum_t, tb), max(drum_t, tb), YN - 1.6, YN + 1.6, fl, fl + 0.3)
    B(F, "drum_ceiling", min(drum_t, tb), max(drum_t, tb), YN - 1.38, YN + 1.38, ce, ce + 0.03, "steel_painted_white")
    # lights: a strip in the arm ceiling
    L.append(obox(f"lampE|{grp}|tstrip", F.p((lo + hi) / 2, YN, ce + 0.035), F.t, F.a, F.r, -(hi - lo) / 2 + 0.2, (hi - lo) / 2 - 0.2, -0.12, 0.12, 0.0, 0.01, "emit_cool"))
    if s > 0:
        light(F, grp, (lo + hi) / 2, YN, ce + 0.5, "cool", 3.0, 5.0)


# ======================================================================================== hub + spokes (microgravity)
def hub_interior():
    """Ref #15: padded drum along the spoke axis (Blender X) with iris docking doors and spoke wells at both ends."""
    RH, XH = 2.3, 3.35
    grp = "hub"
    # lining: 12 padded staves around X with dark frames (ref #15 rounded-rect recessed panels)
    n = 12
    for i in range(n):
        a0 = 2 * PI * i / n
        am = a0 + PI / n
        nrm = V((0, math.cos(am), math.sin(am)))
        tan = V((0, -math.sin(am), math.cos(am)))
        c = nrm * RH
        w = 2 * RH * math.sin(PI / n)
        P.append(obox("hub_stave", c, V((1, 0, 0)), tan, nrm, -XH, XH, -w / 2, w / 2, 0.0, 0.05, "pad_gray"))
        for xx in (-2.2, 0.0, 2.2):
            P.append(obox("hub_cushion", c - nrm * 0.04, V((1, 0, 0)), tan, nrm, xx - 0.95, xx + 0.95, -w / 2 + 0.08, w / 2 - 0.08, -0.12, 0.0, "pad_white" if i % 3 else "pad_beige"))
        P.append(obox("hub_rib", c - nrm * 0.02, V((1, 0, 0)), tan, nrm, -XH, XH, w / 2 - 0.03, w / 2 + 0.03, -0.16, 0.0, "metal_dark"))
        # collision staves (cylinder approximated by boxes)
        o = box(f"COL_hub_{i}", (2 * XH, w + 0.2, 0.4), m="frame_black")
        o.matrix_basis = Matrix(((1, 0, 0, 0), (0, tan.y, nrm.y, (RH + 0.2) * nrm.y), (0, tan.z, nrm.z, (RH + 0.2) * nrm.z), (0, 0, 0, 1)))
        o.parent = ROOT
        o["col"] = "box"
        o.hide_render = True
    # end walls with the spoke wells (ring plates) and handholds
    for s in (-1, 1):
        x = s * XH
        outer = kit.circle_pts(RH + 0.05, 24)
        inner = kit.circle_pts(1.3, 24)
        ring = kit.poly_ring("hub_endwall", outer, inner, -0.04, 0.04, m="steel_painted_white")
        ring.rotation_euler = (0, PI / 2, 0)
        ring.location = (x, 0, 0)
        P.append(ring)
        P.append(kit.torus("hub_well_rim", 1.32, 0.06, loc=(x - s * 0.05, 0, 0), rot=(0, PI / 2, 0), m="warning_yellow", seg=32, rseg=6))
        for j in range(6):
            a = j * PI / 3
            P.append(seg_box("hub_handhold", (x - s * 0.08, math.cos(a) * 1.7, math.sin(a) * 1.7), (x - s * 0.08, math.cos(a + 0.25) * 1.7, math.sin(a + 0.25) * 1.7), 0.04, 0.04, "warning_yellow"))
        for j in range(4):   # end-wall collision (four plates around the well)
            a = j * PI / 2 + PI / 4
            o = box(f"COL_hubend_{s}_{j}", (0.3, 1.6, 1.6), loc=(x + s * 0.15, math.cos(a) * 1.85, math.sin(a) * 1.85), m="frame_black")
            o.parent = ROOT
            o["col"] = "box"
            o.hide_render = True
        light_x = x - s * 0.4
        for j in range(4):
            a = j * PI / 2
            L.append(kit.sphere(f"lampE|{grp}|ring", 0.07, loc=(light_x, math.cos(a) * 2.15, math.sin(a) * 2.15), m="emit_cool", segs=8, rings=6))
        LIGHTS.append(empty(f"light_{grp}_{len(LIGHTS)}", loc=(light_x, 0, 0), parent=ROOT, light="cool", group=grp, intensity=4.0, distance=6.0))
    # iris doors at the four docking ports (ref #15: radial blade petals, offset round window, RESCUE arrows)
    for (nm, d) in (("fwd", V((0, 1, 0))), ("aft", V((0, -1, 0))), ("top", V((0, 0, 1))), ("bottom", V((0, 0, -1)))):
        iris(nm, d, RH - 0.06)
    LIGHTS.append(empty(f"light_{grp}_{len(LIGHTS)}", loc=(0, 0, 0), parent=ROOT, light="cool", group=grp, intensity=3.0, distance=6.0))
    empty("spawn_hub", loc=(0.0, 1.2, 0.0), parent=ROOT)
    o = box("ROOM_hub", (2 * XH, 2 * RH, 2 * RH), m="frame_black", par=ROOT, room="hub")
    o.hide_render = True


def iris(nm, d, rad):
    u = d.orthogonal().normalized()
    w = d.cross(u)
    c = d * rad
    q = E.to_quat(-d)
    disc = cyl(f"iris_{nm}_disc", 1.05, 0.08, loc=c, rot=q.to_euler(), m="metal_brushed", verts=40)
    P.append(disc)
    P.append(kit.torus(f"iris_{nm}_frame", 1.08, 0.07, loc=c - d * 0.02, rot=q.to_euler(), m="metal_dark", seg=40, rseg=8))
    # 14 radial blade creases (raised thin spikes from the hub)
    nb = 14
    for j in range(nb):
        a = 2 * PI * j / nb
        rv = u * math.cos(a) + w * math.sin(a)
        tv = u * math.cos(a + 0.18) + w * math.sin(a + 0.18)
        tri = [c - d * 0.045, c - d * 0.045 + rv * 1.0, c - d * 0.045 + tv * 0.22]
        bm = bmesh.new()
        vs = [bm.verts.new(p) for p in tri] + [bm.verts.new(p - d * 0.025) for p in tri]
        bm.faces.new((vs[0], vs[1], vs[2]))
        bm.faces.new((vs[5], vs[4], vs[3]))
        for (i0, i1) in ((0, 1), (1, 2), (2, 0)):
            bm.faces.new((vs[i0], vs[i1], vs[i1 + 3], vs[i0 + 3]))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        P.append(kit.from_bmesh("iris_blade", bm, ("steel_painted_gray",)))
    P.append(cyl("iris_hub", 0.08, 0.06, loc=c - d * 0.07, rot=q.to_euler(), m="metal_dark", verts=16))
    # offset round window with a thick dark rim (ref #15)
    wc = c - d * 0.05 + (u * 0.58 + w * 0.32)
    P.append(kit.torus(f"iris_{nm}_winrim", 0.24, 0.07, loc=wc, rot=q.to_euler(), m="metal_dark", seg=28, rseg=8))
    G.append(cyl(f"iris_{nm}_win", 0.2, 0.02, loc=wc, rot=q.to_euler(), m="glass_clear", verts=24))
    for (sgn, off) in ((1, 0.55), (-1, -0.45)):
        ac = c - d * 0.05 + w * (-0.62) + u * off * 0.6
        P.append(obox("iris_arrow", ac, u, w, -d, -0.03, 0.03, -0.12, 0.12, 0.0, 0.01, "warning_yellow"))
    empty(f"iris_{nm}", loc=c, rot=q.to_euler(), parent=ROOT, port=nm)


def spoke_interior(s):
    """Tube lining (r 1.3) with ring lights, the ladder on one wall from the hub well to the vestibule floor."""
    x0, x1 = 3.4, RI + WALL
    k = 9 if s > 0 else 3
    F = Fr(k)
    grp = f"spoke{k}"
    n = 16
    for i in range(n):
        am = 2 * PI * (i + 0.5) / n
        nrm = V((0, math.cos(am), math.sin(am)))
        tan = V((0, -math.sin(am), math.cos(am)))
        w = 2 * 1.3 * math.sin(PI / n)
        P.append(obox("spoke_lining", nrm * 1.3, V((s, 0, 0)), tan, nrm, x0, x1, -w / 2, w / 2, 0.0, 0.04, "steel_painted_white" if i % 4 else "pad_gray"))
    for j in range(5):
        xx = x0 + 1.5 + j * (x1 - x0 - 3.0) / 4
        P.append(kit.torus("spoke_frame_in", 1.28, 0.05, loc=(s * xx, 0, 0), rot=(0, PI / 2, 0), m="metal_dark", seg=32, rseg=6))
        L.append(kit.torus(f"lampE|{grp}|ring", 1.24, 0.02, loc=(s * (xx + 0.12), 0, 0), rot=(0, PI / 2, 0), m="emit_cool", seg=32, rseg=4))
        LIGHTS.append(empty(f"light_{grp}_{len(LIGHTS)}", loc=(s * xx, 0, 0), parent=ROOT, light="cool", group=grp, intensity=2.5, distance=5.0))
    # ladder along the tube wall, continuing down into the vestibule to its floor (one straight line, radial)
    lt = -1.0     # module-frame tangential offset of the ladder line
    lad_y = 0.0
    for sgn in (-1, 1):
        B(F, "sp_stile", lt + sgn * 0.22 - 0.025, lt + sgn * 0.22 + 0.025, lad_y - 0.62, lad_y - 0.57, x0, VFLOOR, "metal_brushed")
    nr = int((VFLOOR - x0) / 0.3)
    for i in range(nr + 1):
        rr = x0 + i * (VFLOOR - x0) / nr
        B(F, "sp_rung", lt - 0.22, lt + 0.22, lad_y - 0.62, lad_y - 0.57, rr - 0.018, rr + 0.018, "metal_brushed")
    gid = f"s{k}"
    empty(f"lad_{gid}_a", loc=F.p(lt, lad_y - 0.2, VFLOOR), parent=ROOT)
    empty(f"lad_{gid}_b", loc=F.p(lt, lad_y - 0.2, x0 - 0.2), parent=ROOT)
    empty(f"lad_{gid}_ea", loc=F.p(lt - 0.8, lad_y + 0.8, VFLOOR), parent=ROOT)
    empty(f"lad_{gid}_eb", loc=(s * 1.8, 0.0, 0.0), parent=ROOT)
    hit = box(f"lad_{gid}_hit", (0.7, 0.4, VFLOOR - x0), m="frame_black")
    oriented(hit, F, lt, lad_y - 0.4, (x0 + VFLOOR) / 2)
    hit.parent = ROOT
    hit["interact"] = "ladder"
    hit["iid"] = f"lad_{gid}"
    hit.hide_render = True
    o = box(f"ROOM_spoke{k}", (x1 - x0, 2.6, 2.6), loc=(s * (x0 + x1) / 2, 0, 0), m="frame_black", par=ROOT, room=f"spoke{k}")
    o.hide_render = True


# ======================================================================================== decks
def deck_shell(k, wall_m="steel_painted_white", floor_m="endu_floor"):
    """Common deck structure: floor plating, suspended ceiling with the ladder shaft, wall linings, shaft walls."""
    F = Fr(k)
    t0, t1, y0, y1 = IT0, IT1, IY0, IY1
    hx0, hx1, hy0, hy1 = HATCH
    B(F, "d_floor", t0, t1, y0, y1, FLOOR - 0.03, FLOOR, floor_m)
    col(F, f"d_floor{k}", t0, t1, y0, y1, FLOOR, FLOOR + 0.3)
    # ceiling with the shaft opening
    for (a0, a1, b0, b1) in ((t0, hx0 - 0.1, y0, y1), (hx1 + 0.1, t1, y0, y1), (hx0 - 0.1, hx1 + 0.1, y0, hy0 - 0.1), (hx0 - 0.1, hx1 + 0.1, hy1 + 0.1, y1)):
        B(F, "d_ceiling", a0, a1, b0, b1, CEIL - 0.03, CEIL, "steel_painted_white")
    # walls (lining) + collision
    if k == 9:
        # front lining cut for the five bridge windows (r 28.99 → 29.49)
        B(F, "d_wall_front", t0, t1, y1, y1 + 0.03, 29.49, FLOOR, wall_m)
        B(F, "d_wall_front", t0, t1, y1, y1 + 0.03, CEIL, 28.99, wall_m)
        xs = [t0] + sum([[-3.0 + i * 1.5 - 0.5, -3.0 + i * 1.5 + 0.5] for i in range(5)], []) + [t1]
        for i in range(0, len(xs), 2):
            B(F, "d_wall_front", xs[i], xs[i + 1], y1, y1 + 0.03, 28.99, 29.49, wall_m)
    elif k in (0, 3, 6):
        # cut for the porthole pair at t = −3.3
        B(F, "d_wall_front", -2.95, t1, y1, y1 + 0.03, CEIL, FLOOR, wall_m)
        B(F, "d_wall_front", t0, -3.65, y1, y1 + 0.03, CEIL, FLOOR, wall_m)
        for (b0, b1) in ((CEIL, 29.45), (30.05, 30.25), (30.85, FLOOR)):
            B(F, "d_wall_front", -3.65, -2.95, y1, y1 + 0.03, b0, b1, wall_m)
    else:
        B(F, "d_wall_front", t0, t1, y1, y1 + 0.03, CEIL, FLOOR, wall_m)
    B(F, "d_wall_back", t0, t1, y0 - 0.03, y0, CEIL, FLOOR, wall_m)
    for s in (-1, 1):
        tw = t1 if s > 0 else t0
        B(F, "d_wall_end", tw, tw + s * 0.03, y0, y1, CEIL, FLOOR, wall_m)
        col(F, f"d_end{k}{s}", tw, tw + s * 0.4, y0 - 0.4, y1 + 0.4, CEIL - 0.5, FLOOR)
    col(F, f"d_front{k}", t0 - 0.4, t1 + 0.4, y1, y1 + 0.4, CEIL - 0.5, FLOOR)
    col(F, f"d_back{k}", t0 - 0.4, t1 + 0.4, y0 - 0.4, y0, CEIL - 0.5, FLOOR)
    # skirting and a mid-height rail line
    for (yy, dd) in ((y1, -1), (y0, 1)):
        B(F, "skirting", t0, t1, yy, yy + dd * 0.04, FLOOR - 0.15, FLOOR, "metal_dark")
    # ladder shaft through the equipment void (walls visible from the hatch above and the ceiling opening below)
    for (a0, a1, b0, b1) in ((hx0 - 0.1, hx0 - 0.07, hy0 - 0.1, hy1 + 0.1), (hx1 + 0.07, hx1 + 0.1, hy0 - 0.1, hy1 + 0.1),
                             (hx0 - 0.1, hx1 + 0.1, hy0 - 0.1, hy0 - 0.07), (hx0 - 0.1, hx1 + 0.1, hy1 + 0.07, hy1 + 0.1)):
        B(F, "shaft_wall", a0, a1, b0, b1, RV + WALL, CEIL, "steel_painted_gray")
    L.append(obox(f"lampE|deck{k}|shaft", F.p(hx0 - 0.065, (hy0 + hy1) / 2, (RV + CEIL) / 2), F.t, F.a, F.r, 0.0, 0.01, -0.3, 0.3, -2.0, 2.0, "emit_cool"))
    # equipment void floor (top of the suspended ceiling) so nothing is see-through from the hatch
    col(F, f"shaft_guard{k}", hx0 - 0.4, hx0 - 0.1, hy0 - 0.4, hy1 + 0.4, RV + WALL, CEIL - 0.6)
    room(F, f"deck_{k}", t0, t1, y0, y1, CEIL, FLOOR)
    return F


def command_deck():
    """Module 9: refs #6 (flight deck), #11 (navigation room), #19 (ceiling and consoles)."""
    k = 9
    F = deck_shell(k, wall_m="steel_painted_white")
    grp = "deck9"
    y0, y1 = IY0, IY1
    # bridge windows in the front wall (match the exterior band: t = −3..3 step 1.5, r = 30.0)
    for i in range(5):
        tc = -3.0 + i * 1.5
        for (a0, a1, b0, b1) in ((tc - 0.62, tc + 0.62, 28.9, 29.0), (tc - 0.62, tc + 0.62, 29.48, 29.58), (tc - 0.62, tc - 0.52, 28.9, 29.58), (tc + 0.52, tc + 0.62, 28.9, 29.58)):
            B(F, "win_surround", a0, a1, y1 - 0.06, y1, b0, b1, "console_dark")
        for (b0, b1) in ((28.98, 29.0), (29.48, 29.5)):
            B(F, "win_well", tc - 0.52, tc + 0.52, y1, y1 + 0.3, b0, b1, "console_dark")
    # main flight console under the windows (ref #6), sloped instrument panels left/right
    console_bank(F, -3.6, 3.6, y1 - 0.02, -1, "beige", screens=6, height=1.0)
    # overhead console hanging from the ceiling along the window line (ref #6 overhead switch panels)
    B(F, "overhead", -3.4, 3.4, y1 - 1.4, y1 - 0.75, CEIL, CEIL + 0.32, "console_beige")
    switch_panel(F, -3.3, 3.3, y1 - 1.4, CEIL + 0.06, CEIL + 0.28, -1, rows=2, cols=34)
    for i in range(4):
        L.append(obox(f"lampE|{grp}|ovh", F.p(-2.7 + i * 1.8, y1 - 1.1, CEIL + 0.33), F.t, F.a, F.r, -0.35, 0.35, -0.12, 0.12, 0.0, 0.01, "emit_warm"))
    # two rows of seats facing the windows, centre aisle between (ref #6)
    for tc in (-1.6, 1.6):
        tall_seat(F, tc, 1.25, 1)
        tall_seat(F, tc, -0.55, 1)
    # side consoles along the end walls (ref #6 left/right banks with screens)
    for s in (-1, 1):
        tw = IT1 if s > 0 else IT0
        B(F, "side_con", tw, tw - s * 0.55, -2.4, 0.6, FLOOR - 0.95, FLOOR, "console_blue")
        B(F, "side_con_top", tw, tw - s * 0.6, -2.45, 0.65, FLOOR - 0.99, FLOOR - 0.95, "console_dark")
        for j in range(3):
            screen(F, tw - s * 0.03, -1.9 + j * 1.0, FLOOR - 1.5, 0.55, 0.38, "t-" if s > 0 else "t+")
        col(F, f"side_con{s}", min(tw, tw - s * 0.6), max(tw, tw - s * 0.6), -2.45, 0.65, FLOOR - 1.0, FLOOR)
    # navigation table (ref #11 floor plates as a lit chart table) and floor hatch plates in the aisle
    B(F, "nav_table", -0.7, 0.7, -2.65, -1.75, FLOOR - 0.92, FLOOR - 0.86, "console_dark")
    L.append(obox(f"lampE|{grp}|chart", F.p(0, -2.2, FLOOR - 0.925), F.t, F.a, F.r, -0.6, 0.6, -0.38, 0.38, -0.006, 0.0, "emit_screen"))
    B(F, "nav_pedestal", -0.3, 0.3, -2.4, -2.0, FLOOR - 0.86, FLOOR, "metal_gunmetal")
    col(F, "nav_table", -0.72, 0.72, -2.67, -1.73, FLOOR - 0.95, FLOOR)
    for (tc, yc, st) in ((0.0, 0.4, 0), (0.0, -0.7, 1), (-2.6, -2.5, 0), (2.6, -2.6, 1)):
        floor_hatch_plate(F, tc, yc, 0.9, 1.0, st)
    # rear wall: stowage bag racks (ref #1/#7) and lockers
    for i in range(4):
        for j in range(3):
            puffy_bag("bag", F, -3.2 + i * 0.6, y0 + 0.32, FLOOR - 0.25 - j * 0.55, 0.54, 0.46, 0.4)
    col(F, "bags9", -3.6, -0.9, y0, y0 + 0.6, FLOOR - 1.7, FLOOR)
    for i in range(3):
        B(F, "locker", 0.4 + i * 0.75, 1.1 + i * 0.75, y0, y0 + 0.5, FLOOR - 2.1, FLOOR, "steel_painted_gray")
        B(F, "locker_vent", 0.55 + i * 0.75, 0.95 + i * 0.75, y0 + 0.5, y0 + 0.51, FLOOR - 1.9, FLOOR - 1.75, "metal_dark")
        B(F, "locker_handle", 0.95 + i * 0.75, 1.0 + i * 0.75, y0 + 0.5, y0 + 0.53, FLOOR - 1.2, FLOOR - 0.95, "metal_brushed")
    col(F, "lockers9", 0.4, 2.65, y0, y0 + 0.5, FLOOR - 2.1, FLOOR)
    # ceiling: light bays and blue pads (ref #19)
    for tc in (-2.3, 0.0, 2.3):
        light_bay(F, tc, -1.6, 1.5, 1.2, grp)
    for tc in (-2.3, 2.3):
        blue_pad(F, tc, 0.4, 1.4, 0.7)
    empty("spawn_command", loc=F.p(0.0, 0.3, FLOOR - 0.02), parent=ROOT)


def habitat_deck(k):
    """Module 3: galley (ref #7) + crew corner (ref #1). Module 0: crew quarters."""
    F = deck_shell(k, wall_m="steel_painted_white")
    grp = f"deck{k}"
    y0, y1 = IY0, IY1
    # portholes in the front wall (exterior at t = −3.3, r 29.75 / 30.55)
    for rr in (29.75, 30.55):
        P.append(kit.torus("porthole_in", 0.27, 0.05, loc=F.p(-3.3, y1 - 0.02, rr), rot=E.to_quat(F.a).to_euler(), m="console_beige", seg=24, rseg=6))
        B(F, "porthole_panel", -3.7, -2.9, y1 - 0.04, y1, rr - 0.38, rr + 0.38, "console_beige") if False else None
    if k == 3:
        # galley: wall console with three screens and lit keypad (ref #7 right wall), fold-out table, net racks
        tw = IT1
        B(F, "gal_rack", tw, tw - 0.45, -2.6, 1.2, FLOOR - 2.6, FLOOR, "steel_painted_gray")
        for j in range(3):
            screen(F, tw - 0.45, -1.8 + j * 1.1, FLOOR - 2.0, 0.62, 0.48, "t-")
        switch_panel_t(F, tw - 0.45, -2.4, 1.0, FLOOR - 1.42, FLOOR - 1.18)
        B(F, "gal_table", tw - 0.45, tw - 1.65, -2.2, -0.4, FLOOR - 0.78, FLOOR - 0.74, "plate_white")
        B(F, "gal_table_brace", tw - 0.5, tw - 1.3, -1.32, -1.28, FLOOR - 0.74, FLOOR - 0.2, "plate_white")
        col(F, "gal_table", tw - 1.7, tw, -2.25, -0.35, FLOOR - 0.8, FLOOR)
        for j in range(2):   # cargo nets below the counter (ref #7)
            yy0, yy1 = -2.5 + j * 1.8, -0.9 + j * 1.8
            B(F, "net_frame", tw - 0.45, tw - 0.5, yy0, yy1, FLOOR - 0.7, FLOOR - 0.05, "metal_dark")
            B(F, "cargo_net", tw - 0.47, tw - 0.48, yy0 + 0.05, yy1 - 0.05, FLOOR - 0.65, FLOOR - 0.1, "net")
            for q in range(3):
                puffy_bag("netbag", F, tw - 0.25, yy0 + 0.3 + q * 0.45, FLOOR - 0.05, 0.36, 0.4, 0.36, "pad_white", strap=False)
        col(F, "gal_rack", tw - 0.5, tw, -2.6, 1.2, FLOOR - 2.6, FLOOR)
        # food / water dispenser column on the front wall (ref #7 centre)
        B(F, "dispenser", -1.6, -0.6, y1 - 0.55, y1, FLOOR - 2.3, FLOOR, "steel_painted_gray")
        B(F, "disp_recess", -1.4, -0.8, y1 - 0.56, y1 - 0.5, FLOOR - 1.5, FLOOR - 1.05, "console_dark")
        screen(F, -1.1, y1 - 0.55, FLOOR - 1.85, 0.36, 0.26, "y-")
        col(F, "dispenser", -1.6, -0.6, y1 - 0.55, y1, FLOOR - 2.3, FLOOR)
        # keyboard terminal on a swing arm (ref #7)
        B(F, "term_arm", 0.2, 0.25, y1 - 0.8, y1, FLOOR - 1.05, FLOOR - 1.0, "metal_dark")
        B(F, "term_kbd", -0.1, 0.55, y1 - 1.05, y1 - 0.8, FLOOR - 1.06, FLOOR - 1.02, "console_dark")
        screen(F, 0.22, y1 - 0.06, FLOOR - 1.55, 0.5, 0.36, "y-")
    else:
        # crew quarters: four bunk alcoves along the rear wall with curtains and sleeping bags
        for i in range(4):
            tc = -3.0 + i * 1.65
            B(F, "bunk_frame", tc - 0.75, tc + 0.75, y0, y0 + 0.95, FLOOR - 0.5, FLOOR - 0.44, "steel_painted_gray")
            B(F, "bunk_frame", tc - 0.75, tc + 0.75, y0, y0 + 0.95, FLOOR - 1.6, FLOOR - 1.54, "steel_painted_gray")
            for rr in (FLOOR - 0.5, FLOOR - 1.6):
                puffy_bag("sleeping_bag", F, tc, y0 + 0.48, rr, 1.3, 0.8, 0.22, "pad_blue" if i % 2 else "pad_beige", strap=False)
            B(F, "bunk_divider", tc + 0.76, tc + 0.8, y0, y0 + 0.95, FLOOR - 2.3, FLOOR, "steel_painted_white")
            B(F, "curtain", tc - 0.74, tc - 0.2, y0 + 0.93, y0 + 0.97, FLOOR - 2.2, FLOOR - 0.05, "fabric_red" if i == 1 else "pad_gray")
        col(F, "bunks0", IT0, IT1, y0, y0 + 0.97, FLOOR - 2.3, FLOOR)
        for i in range(2):
            screen(F, -1.2 + i * 2.4, y1 - 0.03, FLOOR - 1.6, 0.6, 0.4, "y-")
    # crew chair (ref #1 red chair with buckles) and white drawer unit with a small blue console
    tc, yc = -2.4, 0.4
    B(F, "chair_base", tc - 0.25, tc + 0.25, yc - 0.25, yc + 0.25, FLOOR - 0.45, FLOOR, "metal_dark")
    B(F, "chair_seat", tc - 0.28, tc + 0.28, yc - 0.28, yc + 0.28, FLOOR - 0.55, FLOOR - 0.45, "fabric_red")
    B(F, "chair_back", tc - 0.28, tc + 0.28, yc - 0.32, yc - 0.2, FLOOR - 1.45, FLOOR - 0.5, "fabric_red")
    for s in (-1, 1):
        B(F, "chair_buckle", tc + s * 0.1 - 0.03, tc + s * 0.1 + 0.03, yc - 0.19, yc - 0.17, FLOOR - 1.1, FLOOR - 1.0, "metal_brushed")
    col(F, "chair", tc - 0.3, tc + 0.3, yc - 0.35, yc + 0.3, FLOOR - 1.0, FLOOR)
    B(F, "drawers", -0.6, 0.6, y0, y0 + 0.5, FLOOR - 1.3, FLOOR - 0.0, "plate_white")
    for i in range(3):
        for j in range(4):
            B(F, "drawer", -0.56 + i * 0.38, -0.22 + i * 0.38, y0 + 0.5, y0 + 0.52, FLOOR - 1.26 + j * 0.31, FLOOR - 0.99 + j * 0.31, "plate_white")
            B(F, "drawer_pull", -0.44 + i * 0.38, -0.34 + i * 0.38, y0 + 0.52, y0 + 0.54, FLOOR - 1.14 + j * 0.31, FLOOR - 1.11 + j * 0.31, "metal_dark")
    col(F, "drawers", -0.6, 0.6, y0, y0 + 0.5, FLOOR - 1.3, FLOOR)
    B(F, "blue_console", 1.0, 2.6, y0, y0 + 0.6, FLOOR - 0.95, FLOOR, "console_blue")
    screen(F, 1.8, y0 + 0.03, FLOOR - 1.5, 0.8, 0.45, "y+")
    col(F, "blue_console", 1.0, 2.6, y0, y0 + 0.6, FLOOR - 0.95, FLOOR)
    # ceiling bays, pads, floor plates, a stool
    for tc in (-2.2, 0.0, 2.2):
        light_bay(F, tc, 0.9, 1.3, 1.1, grp)
    blue_pad(F, 0.0, -1.5, 1.6, 0.7)
    for (tc, yc, st) in ((-0.9, -0.6, 1), (0.6, -0.6, 0), (-0.9, 1.6, 0)):
        floor_hatch_plate(F, tc, yc, 0.8, 1.1, st)
    P.append(cyl("stool", 0.2, 0.06, loc=F.p(-1.6, -1.4, FLOOR - 0.62), rot=E.to_quat(F.r).to_euler(), m="fabric_red", verts=20))
    P.append(cyl("stool_post", 0.04, 0.6, loc=F.p(-1.6, -1.4, FLOOR - 0.3), rot=E.to_quat(F.r).to_euler(), m="metal_brushed", verts=10))
    empty(f"spawn_hab{k}", loc=F.p(-0.5, 0.4, FLOOR - 0.02), parent=ROOT)


def switch_panel_t(F, tw, y0, y1, r0, r1):
    """Switch strip on a wall facing −t (galley console)."""
    B(F, "sw_panel_t", tw, tw - 0.03, y0, y1, r0, r1, "console_beige")
    for i in range(14):
        y = y0 + (y1 - y0) * (i + 0.5) / 14
        for j in range(2):
            z = r0 + (r1 - r0) * (j + 0.5) / 2
            if (i + j) % 4 == 0:
                L.append(obox("lampE|panel|led", F.p(tw - 0.035, y, z), F.t, F.a, F.r, -0.004, 0.004, -0.02, 0.02, -0.02, 0.02, "emit_red" if i % 3 == 0 else "emit_green"))
            else:
                B(F, "toggle", tw - 0.03, tw - 0.09, y - 0.012, y + 0.012, z - 0.012, z + 0.012, "metal_brushed")


def cryo_deck():
    """Module 6, ref #20: white tile, cryo beds lifted out of floor pits, columns, ceiling camera arms, rounded alcoves."""
    k = 6
    F = deck_shell(k, wall_m="tile_white", floor_m="tile_white")
    grp = "deck6"
    y0, y1 = IY0, IY1
    # two cryo beds in floor pits (pit = dark recess ringed by tiles)
    for (tc, band) in ((-1.9, "fabric_red"), (1.4, "pad_blue")):
        cryo_bed(F, tc, -0.4, band)
    # columns (ref #20 tall grey pillars with lattice brackets)
    for (tc, yc) in ((-3.3, -2.9), (3.3, -2.9)):
        B(F, "column", tc - 0.18, tc + 0.18, yc - 0.18, yc + 0.18, CEIL, FLOOR, "steel_painted_gray")
        B(F, "column_base", tc - 0.26, tc + 0.26, yc - 0.26, yc + 0.26, FLOOR - 0.25, FLOOR, "metal_dark")
        col(F, f"column{tc}", tc - 0.26, tc + 0.26, yc - 0.26, yc + 0.26, CEIL, FLOOR)
    # rounded alcoves with dark frames along the front wall (ref #20 doorways), one with a round-window hatch
    for (tc, kind) in ((-2.6, "shelves"), (-0.4, "hatch"), (1.8, "equipment")):
        alcove(F, tc, y1, kind)
    # ceiling: recessed light squares + two camera arms (ref #20)
    for tc in (-2.6, 0.0, 2.6):
        for yc in (-1.9, 1.0):
            light_bay(F, tc, yc, 0.9, 0.9, grp, lights=(yc < 0))
    for tc in (-1.9, 1.4):
        P.append(seg_box("cam_arm", F.p(tc, 1.6, CEIL + 0.02), F.p(tc, 0.6, CEIL + 0.45), 0.06, 0.06, "metal_dark", up=tuple(F.t)))
        B(F, "cam_body", tc - 0.22, tc + 0.22, 0.35, 0.75, CEIL + 0.42, CEIL + 0.62, "steel_painted_white")
        B(F, "cam_lens", tc - 0.07, tc + 0.07, 0.3, 0.36, CEIL + 0.47, CEIL + 0.57, "glass_dark")
    # wall indicator panels with red LEDs (ref #20 left wall)
    for i in range(2):
        B(F, "ind_panel", IT0, IT0 + 0.04, -1.0 + i * 1.2, -0.4 + i * 1.2, FLOOR - 2.0, FLOOR - 1.2, "plate_white")
        for j in range(6):
            L.append(obox("lampE|panel|led", F.p(IT0 + 0.045, -0.9 + i * 1.2 + (j % 3) * 0.18, FLOOR - 1.85 + (j // 3) * 0.3), F.t, F.a, F.r, -0.004, 0.004, -0.02, 0.02, -0.02, 0.02, "emit_red"))
    # med kit
    B(F, "medkit", IT1, IT1 - 0.15, 1.2, 1.6, FLOOR - 1.6, FLOOR - 1.2, "plate_white")
    B(F, "medkit_cross", IT1 - 0.15, IT1 - 0.16, 1.35, 1.45, FLOOR - 1.5, FLOOR - 1.3, "emit_red")
    empty("spawn_cryo", loc=F.p(0.0, 1.8, FLOOR - 0.02), parent=ROOT)


def cryo_bed(F, tc, yc, band):
    """Ref #20 cryo bed: chamfered white upper shell, coloured quilted band, dark rails, lower body with two round ports."""
    L_, W_ = 2.3, 1.15
    t0, t1, y0, y1 = tc - W_ / 2, tc + W_ / 2, yc - L_ / 2, yc + L_ / 2
    fl = FLOOR
    # pit in the floor (dark recess with a tile kerb)
    B(F, "pit", t0 - 0.3, t1 + 0.3, y0 - 0.3, y1 + 0.3, fl - 0.005, fl + 0.002, "console_dark")
    for (a0, a1, b0, b1) in ((t0 - 0.42, t1 + 0.42, y0 - 0.42, y0 - 0.3), (t0 - 0.42, t1 + 0.42, y1 + 0.3, y1 + 0.42),
                             (t0 - 0.42, t0 - 0.3, y0 - 0.3, y1 + 0.3), (t1 + 0.3, t1 + 0.42, y0 - 0.3, y1 + 0.3)):
        B(F, "pit_kerb", a0, a1, b0, b1, fl - 0.12, fl, "tile_white")
    B(F, "bed_lower", t0 + 0.05, t1 - 0.05, y0 + 0.05, y1 - 0.05, fl - 0.55, fl - 0.12, "steel_painted_white")
    for s in (-1, 1):   # two round ports in the end of the lower body
        P.append(cyl("bed_port", 0.11, 0.05, loc=F.p(tc + s * 0.24, y1 - 0.03, fl - 0.33), rot=E.to_quat(F.a).to_euler(), m="metal_gunmetal", verts=18))
        P.append(kit.torus("bed_port_rim", 0.12, 0.02, loc=F.p(tc + s * 0.24, y1 - 0.02, fl - 0.33), rot=E.to_quat(F.a).to_euler(), m="metal_dark", seg=18, rseg=4))
    for rr in (fl - 0.58, fl - 0.82):
        B(F, "bed_rail", t0 - 0.02, t1 + 0.02, y0 - 0.02, y1 + 0.02, rr - 0.04, rr, "console_dark")
    B(F, "bed_band", t0, t1, y0, y1, fl - 0.78, fl - 0.62, band)
    # chamfered upper shell
    pts = [(-W_ / 2, 0.0), (W_ / 2, 0.0), (W_ / 2, 0.22), (W_ / 2 - 0.18, 0.38), (-W_ / 2 + 0.18, 0.38), (-W_ / 2, 0.22)]
    sh = prism("bed_shell", kit.ccw(pts), -L_ / 2, L_ / 2, m="steel_painted_white")
    # local: x = t, y = up, z = axial → orient: build a matrix x→t, y→−r, z→a
    c = F.p(tc, yc, fl - 0.86)
    t, a, r = F.t, F.a, F.r
    sh.matrix_basis = Matrix(((t.x, -r.x, a.x, c.x), (t.y, -r.y, a.y, c.y), (t.z, -r.z, a.z, c.z), (0, 0, 0, 1)))
    P.append(sh)
    for (dy, w) in ((-0.55, 0.2), (0.2, 0.14), (0.7, 0.14)):   # lid details: viewing slots and a hinge block
        B(F, "bed_slot", tc - w, tc + w, yc + dy - 0.12, yc + dy + 0.12, fl - 1.245, fl - 1.235, "glass_dark")
    B(F, "bed_valve", tc - 0.12, tc + 0.12, y1 - 0.45, y1 - 0.25, fl - 1.33, fl - 1.24, "metal_gunmetal")
    col(F, f"cryobed{tc}", t0 - 0.05, t1 + 0.05, y0 - 0.05, y1 + 0.05, fl - 1.25, fl)


def alcove(F, tc, yw, kind):
    """Ref #20 rounded doorway alcove: dark frame (rounded top corners), dark interior, contents by kind."""
    w, h = 1.5, 2.25
    fl = FLOOR
    depth = 0.45
    B(F, "alc_back", tc - w / 2, tc + w / 2, yw - 0.02, yw, fl - h, fl, "console_dark")
    for s in (-1, 1):
        B(F, "alc_side", tc + s * (w / 2) - 0.08, tc + s * (w / 2) + 0.08, yw - depth, yw, fl - h + 0.18, fl, "metal_dark")
    B(F, "alc_top", tc - w / 2 + 0.18, tc + w / 2 - 0.18, yw - depth, yw, fl - h - 0.08, fl - h + 0.06, "metal_dark")
    for s in (-1, 1):   # rounded corner pieces (stepped)
        for j in range(3):
            B(F, "alc_corner", tc + s * (w / 2 - 0.18 + j * 0.06) - 0.06, tc + s * (w / 2 - 0.18 + j * 0.06) + 0.06, yw - depth, yw,
              fl - h - 0.08 + j * 0.07, fl - h + 0.06 + j * 0.07, "metal_dark")
    if kind == "hatch":
        B(F, "alc_door", tc - 0.55, tc + 0.55, yw - 0.12, yw - 0.06, fl - h + 0.15, fl - 0.05, "steel_painted_gray")
        P.append(kit.torus("alc_win_rim", 0.18, 0.04, loc=F.p(tc, yw - 0.13, fl - 1.45), rot=E.to_quat(F.a).to_euler(), m="metal_brushed", seg=24, rseg=6))
        G.append(cyl("alc_win", 0.16, 0.02, loc=F.p(tc, yw - 0.13, fl - 1.45), rot=E.to_quat(F.a).to_euler(), m="glass_clear", verts=20))
        B(F, "alc_handle", tc + 0.3, tc + 0.34, yw - 0.18, yw - 0.12, fl - 1.2, fl - 0.85, "metal_brushed")
    elif kind == "shelves":
        for j in range(4):
            B(F, "alc_shelf", tc - w / 2 + 0.1, tc + w / 2 - 0.1, yw - depth + 0.05, yw, fl - 0.4 - j * 0.45, fl - 0.37 - j * 0.45, "plate_white")
        screen(F, tc, yw - 0.03, fl - 1.7, 0.4, 0.3, "y-")
    else:
        B(F, "alc_box", tc - 0.5, tc - 0.1, yw - 0.3, yw, fl - 1.9, fl - 1.4, "plate_white")
        B(F, "alc_box", tc + 0.1, tc + 0.5, yw - 0.3, yw, fl - 1.6, fl - 1.25, "plate_white")
        L.append(obox("lampE|panel|led", F.p(tc - 0.3, yw - 0.31, fl - 1.65), F.t, F.a, F.r, -0.03, 0.03, -0.004, 0.004, -0.02, 0.02, "emit_green"))
    col(F, f"alcove{tc}", tc - w / 2 - 0.1, tc + w / 2 + 0.1, yw - 0.15, yw, fl - h, fl)


# ======================================================================================== build
def build(preview=True):
    global ROOT
    kit.reset()
    ROOT = empty("EnduranceInterior")
    set_props(ROOT, site="endurance")
    for k in range(12):
        vestibule(k)
    hub_interior()
    for s in (-1, 1):
        spoke_interior(s)
    command_deck()
    habitat_deck(3)
    habitat_deck(0)
    cryo_deck()
    # merge by region (hub/spokes, each module) to keep draw calls low and culling useful
    groups = {}
    for o in P:
        c = o.matrix_basis.translation.copy()
        if c.length < 1e-6:
            vs = o.data.vertices
            c = sum((v.co for v in vs), V()) / max(1, len(vs))
        rho = math.hypot(c.x, c.z)
        if rho < 4.2:
            key = "hub"
        elif rho < RI - 0.1:
            key = "spokes"
        else:
            ang = math.atan2(-c.x, c.z) % (2 * PI)
            key = f"mod_{int(ang / (PI / 6) + 0.5) % 12:02d}"
        groups.setdefault(key, []).append(o)
    for key in sorted(groups):
        m = merge(groups[key], f"int_{key}", par=ROOT)
        finish(m, 30)
    if G:
        gm = merge(G, "int_glass", par=ROOT)
        finish(gm, 10)
    bygroup = {}
    for o in L:
        grp = o.name.split("|")[1] if "|" in o.name else "misc"
        bygroup.setdefault(grp, []).append(o)
    for grp, objs in bygroup.items():
        lm = merge(objs, f"lamps_{grp}", par=ROOT, group=grp, lampmesh=1)
        finish(lm, 30)
    kit.export_glb(os.path.join(kit.out_dir(), "endurance_int.glb"), ROOT)
    if preview:
        pd = kit.preview_dir()
        hide = [o for o in kit.all_children(ROOT, True) if o.name.startswith(("COL_", "ROOM_", "lad_"))]
        for o in hide:
            o.hide_render = True
        w = (0.02, 0.02, 0.025)
        # command deck from the rear wall looking at the windows (like ref #6)
        F = Fr(9)
        def cam(F, tc, yc, rc, tt, ty, tr, name, lens=18):
            p, q = F.p(tc, yc, rc), F.p(tt, ty, tr)
            kit.preview(os.path.join(pd, name), tuple(p), tuple(q), lens=lens, samples=16, world=w, sun=(0.0, 0.0, 1.0), sun_strength=0.0, res=(1200, 700), up=tuple(-F.r))
        add_preview_lights()
        cam(Fr(9), 0.0, -3.0, 30.0, 0.0, 3.3, 30.2, "endu_int_command.png")
        cam(Fr(3), -3.0, -2.6, 30.0, 3.0, 2.0, 30.3, "endu_int_galley.png")
        cam(Fr(6), 3.2, 3.0, 30.0, -1.5, -1.5, 31.0, "endu_int_cryo.png")
        cam(Fr(9), -3.2, -3.0, 21.5, 3.6, 1.2, 22.0, "endu_int_vestibule.png")


def add_preview_lights():
    """Cycles preview only: turn light empties into point lights and the up vector toward the hub."""
    for o in list(bpy.data.objects):
        if o.name.startswith("light_") and o.type == "EMPTY":
            ld = bpy.data.lights.new(o.name + "_pl", "POINT")
            ld.energy = 180
            ld.shadow_soft_size = 0.4
            lo = bpy.data.objects.new(o.name + "_pl", ld)
            kit.link(lo)
            lo.location = o.matrix_world.translation


if __name__ == "__main__":
    build(preview="--nopreview" not in sys.argv)
