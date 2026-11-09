"""
Architecture & furniture kit (walls with openings, windows, hinged doors, stairs, roofs, furniture).
Blender space: X east, Y north, Z up. Fronts of buildings face -Y (south) unless rotated.
"""
import math
import kit
from kit import V, box, cyl, prism, M, empty, merge, finish, set_props


def _dir(a, b):
    d = V((b[0] - a[0], b[1] - a[1], 0))
    L = d.length
    return d / L, L


def wall(name, a, b, z0, z1, thick, m, openings=(), offset=0.0, parts=None):
    """Straight wall from plan point a to b, height z0..z1, centred on the line (+offset along the left normal).
    openings: (along_center, width, sill_z, head_z). Returns list of boxes (also appended to `parts`)."""
    d, L = _dir(a, b)
    n = V((-d.y, d.x, 0))
    ang = math.atan2(d.y, d.x)
    out = []
    ops = sorted(openings, key=lambda o: o[0])

    def piece(s0, s1, zz0, zz1):
        if s1 - s0 < 0.005 or zz1 - zz0 < 0.005:
            return
        c = V((a[0], a[1], 0)) + d * ((s0 + s1) / 2) + n * offset
        o = box(name, (s1 - s0, thick, zz1 - zz0), loc=(c.x, c.y, (zz0 + zz1) / 2), rot=(0, 0, ang), m=m)
        out.append(o)

    cur = 0.0
    for (c, w, sill, head) in ops:
        s0, s1 = c - w / 2, c + w / 2
        piece(cur, s0, z0, z1)
        piece(s0, s1, z0, sill)
        piece(s0, s1, head, z1)
        cur = s1
    piece(cur, L, z0, z1)
    if parts is not None:
        parts.extend(out)
    return out


def col_wall(name, a, b, z0, z1, thick, openings=(), par=None, door_gaps_only=True):
    """Invisible collision boxes for a wall: full-height segments between door openings (windows stay solid)."""
    d, L = _dir(a, b)
    n = V((-d.y, d.x, 0))
    ang = math.atan2(d.y, d.x)
    gaps = [(c - w / 2, c + w / 2) for (c, w, sill, head) in openings if sill < z0 + 0.3] if door_gaps_only else []
    gaps.sort()
    cur = 0.0
    out = []
    segs = []
    for s0, s1 in gaps:
        segs.append((cur, s0))
        cur = s1
    segs.append((cur, L))
    for i, (s0, s1) in enumerate(segs):
        if s1 - s0 < 0.02:
            continue
        c = V((a[0], a[1], 0)) + d * ((s0 + s1) / 2)
        o = col_box(f"COL_{name}_{i}", (c.x, c.y, (z0 + z1) / 2), (s1 - s0, thick, z1 - z0), ang, par)
        out.append(o)
    # lintels above doors
    for (c0, w, sill, head) in openings:
        if sill < z0 + 0.3 and head < z1:
            c = V((a[0], a[1], 0)) + d * c0
            out.append(col_box(f"COL_{name}_l", (c.x, c.y, (head + z1) / 2), (w, thick, z1 - head), ang, par))
    return out


def col_box(name, center, size, rot_z=0.0, par=None, **props):
    o = box(name, size, loc=center, rot=(0, 0, rot_z), m="frame_black", par=par, col="box", **props)
    o.hide_render = True
    return o


def window(name, center, w, hgt, rot_z=0.0, parts=None, glass_parts=None, frame_m="wood_trim", trim_m="wood_trim", sash=(2, 2), depth=0.2, trim=0.09):
    """Window at center (x,y,z_mid) in a wall rotated rot_z (wall runs along local X)."""
    cx, cy, cz = center
    c, s = math.cos(rot_z), math.sin(rot_z)

    def P(lx, ly, lz):
        return (cx + lx * c - ly * s, cy + lx * s + ly * c, cz + lz)
    objs = []
    # outer trim (casing) on the exterior face (-ly side)
    for (lx, lz, sw, sh) in ((0, hgt / 2 + trim / 2, w + trim * 2, trim * 1.3), (0, -hgt / 2 - trim / 2, w + trim * 2.6, trim * 1.2),
                             (-w / 2 - trim / 2, 0, trim, hgt), (w / 2 + trim / 2, 0, trim, hgt)):
        objs.append(box(name + "_trim", (sw, 0.04, sh), loc=P(lx, -depth / 2 - 0.02, lz), rot=(0, 0, rot_z), m=trim_m))
    # sill
    objs.append(box(name + "_sill", (w + 0.16, 0.12, 0.04), loc=P(0, -depth / 2 - 0.04, -hgt / 2 - 0.02), rot=(0, 0, rot_z), m=trim_m))
    # jamb lining
    for (lx, lz, sw, sh) in ((0, hgt / 2, w, 0.03), (0, -hgt / 2, w, 0.03), (-w / 2, 0, 0.03, hgt), (w / 2, 0, 0.03, hgt)):
        objs.append(box(name + "_jamb", (sw, depth, sh), loc=P(lx, 0, lz), rot=(0, 0, rot_z), m=frame_m))
    # sashes (two vertical halves for double hung) and muntins
    nx, nz = sash
    objs.append(box(name + "_meet", (w, 0.05, 0.04), loc=P(0, -0.02, 0), rot=(0, 0, rot_z), m=frame_m))
    for i in range(1, nx):
        objs.append(box(name + "_mv", (0.025, 0.035, hgt), loc=P(-w / 2 + w * i / nx, -0.02, 0), rot=(0, 0, rot_z), m=frame_m))
    for k in range(1, nz * 2):
        if k == nz:
            continue
        objs.append(box(name + "_mh", (w, 0.035, 0.02), loc=P(0, -0.02, -hgt / 2 + hgt * k / (nz * 2)), rot=(0, 0, rot_z), m=frame_m))
    g = box(name + "_glass", (w - 0.02, 0.008, hgt - 0.02), loc=P(0, 0.0, 0), rot=(0, 0, rot_z), m="glass_clear")
    if parts is not None:
        parts.extend(objs)
    if glass_parts is not None:
        glass_parts.append(g)
    return objs, g


def door(name, hinge, w, hgt, rot_z, iid, par, leaf_m="wood_trim", open_angle=1.65, z0=0.0, panels=True, glass=False, knob_side=1):
    """Hinged door. Pivot empty at the hinge (plan point, floor z0); leaf extends along local +X."""
    pv = empty(name, loc=(hinge[0], hinge[1], z0), rot=(0, 0, rot_z), parent=par, interact="door", iid=iid, hinge="z", openAngle=open_angle)
    parts = [box(name + "_leaf", (w - 0.01, 0.045, hgt - 0.01), loc=(w / 2, 0, hgt / 2), m=leaf_m, bevel=0.006)]
    if panels:
        for (px, pz, pw, ph) in ((w * 0.27, hgt * 0.28, w * 0.36, hgt * 0.36), (w * 0.73, hgt * 0.28, w * 0.36, hgt * 0.36),
                                 (w * 0.27, hgt * 0.73, w * 0.36, hgt * 0.38), (w * 0.73, hgt * 0.73, w * 0.36, hgt * 0.38)):
            if glass and pz > hgt * 0.5:
                continue
            for sy in (-1, 1):
                parts.append(box(name + "_pn", (pw, 0.012, ph), loc=(px, sy * 0.026, pz), m=leaf_m, bevel=0.004))
    knob_x = w - 0.07
    for sy in (-1, 1):
        parts.append(kit.sphere(name + "_knob", 0.028, loc=(knob_x, sy * 0.05, 1.0), m="metal_brushed", segs=12, rings=8))
    leaf = merge(parts, name + "_mesh", par=pv)
    leaf.location = (0, 0, 0)
    finish(leaf, 30)
    if glass:
        g = box(name + "_glass", (w * 0.8, 0.01, hgt * 0.36), loc=(w / 2, 0, hgt * 0.73), m="glass_clear", par=pv)
    c = col_box("COL_" + name, (w / 2, 0, hgt / 2), (w, 0.06, hgt), 0, pv, door=iid)
    return pv


def stairs(name, start, direction, width, rise, steps, run, parts=None, m="wood_floor", stringer_m="wood_trim", par=None):
    """Straight stair. start=(x,y,z) bottom front edge centre; direction angle (rad) in plan."""
    sx, sy, sz = start
    c, s = math.cos(direction), math.sin(direction)
    tread = run / steps
    rr = rise / steps
    objs = []
    for i in range(steps):
        along = tread * (i + 0.5)
        cx = sx + c * along
        cy = sy + s * along
        top = sz + rr * (i + 1)
        objs.append(box(name + "_step", (tread + 0.02, width, 0.035), loc=(cx, cy, top - 0.0175), rot=(0, 0, direction), m=m))
        objs.append(box(name + "_riser", (0.02, width, rr), loc=(sx + c * (tread * i), sy + s * (tread * i), sz + rr * (i + 0.5)), rot=(0, 0, direction), m=stringer_m))
    # stringers
    L = math.hypot(run, rise)
    ang = math.atan2(rise, run)
    for side in (-1, 1):
        ox, oy = -s * side * (width / 2 + 0.03), c * side * (width / 2 + 0.03)
        objs.append(box(name + "_str", (L, 0.05, 0.28), loc=(sx + c * run / 2 + ox, sy + s * run / 2 + oy, sz + rise / 2), rot=(0, -ang, direction), m=stringer_m))
    if parts is not None:
        parts.extend(objs)
    # collision ramp
    col = col_box("COL_" + name + "_ramp", (sx + c * run / 2, sy + s * run / 2, sz + rise / 2 - 0.12), (L, width, 0.1), 0, par)
    col.rotation_euler = (0, -ang, direction)
    return objs


def gable_roof(name, x0, x1, y0, y1, eave_z, ridge_z, over=0.45, t=0.12, ridge_axis="y", m="roof_shingle", fascia_m="wood_trim", parts=None):
    """Two sloped planes + fascia. ridge_axis 'y': ridge runs along Y at x mid."""
    objs = []
    if ridge_axis == "y":
        xm = (x0 + x1) / 2
        half = (x1 - x0) / 2 + over
        rise = ridge_z - eave_z
        drop = rise * over / ((x1 - x0) / 2)
        slope = math.atan2(rise, (x1 - x0) / 2)
        L = half / math.cos(slope)
        for side in (-1, 1):
            cx = xm + side * half / 2
            cz = (ridge_z + eave_z - drop) / 2 + t / 2
            objs.append(box(name + "_plane", (L + 0.05, (y1 - y0) + over * 2, t), loc=(cx, (y0 + y1) / 2, cz), rot=(0, side * slope, 0), m=m))
            # fascia along the eave
            objs.append(box(name + "_fascia", (0.04, (y1 - y0) + over * 2, 0.22), loc=(xm + side * (half + 0.02), (y0 + y1) / 2, eave_z - drop + 0.05), m=fascia_m))
        objs.append(box(name + "_ridge", (0.22, (y1 - y0) + over * 2, 0.06), loc=(xm, (y0 + y1) / 2, ridge_z + t + 0.02), m=m))
        # rake boards on the gable ends
        for yy in (y0 - over - 0.02, y1 + over + 0.02):
            for side in (-1, 1):
                objs.append(box(name + "_rake", (L + 0.05, 0.04, 0.2), loc=(xm + side * half / 2, yy, (ridge_z + eave_z - drop) / 2 + 0.02), rot=(0, side * slope, 0), m=fascia_m))
    if parts is not None:
        parts.extend(objs)
    return objs


def gable_wall(name, xa, xb, y, z_eave, z_ridge, thick, m, parts=None, inner=False):
    """Triangular gable infill between eave and ridge (wall along X at y)."""
    xm = (xa + xb) / 2
    poly = [(xa, z_eave), (xb, z_eave), (xm, z_ridge)]
    o = kit.prism_xz(name, kit.ccw(poly), y - thick / 2, y + thick / 2, m=m)
    if parts is not None:
        parts.append(o)
    return o


# ------------------------------------------------------------------------------------------- furniture
def table(name, loc, w=1.6, d=0.9, h=0.76, m="wood_dark", rot=0.0, parts=None):
    x, y, z = loc
    c, s = math.cos(rot), math.sin(rot)
    objs = [box(name + "_top", (w, d, 0.04), loc=(x, y, z + h - 0.02), rot=(0, 0, rot), m=m, bevel=0.008)]
    for sx in (-1, 1):
        for sy in (-1, 1):
            lx, ly = sx * (w / 2 - 0.06), sy * (d / 2 - 0.06)
            objs.append(box(name + "_leg", (0.06, 0.06, h - 0.04), loc=(x + lx * c - ly * s, y + lx * s + ly * c, z + (h - 0.04) / 2), rot=(0, 0, rot), m=m))
    objs.append(box(name + "_apron", (w - 0.14, d - 0.14, 0.08), loc=(x, y, z + h - 0.08), rot=(0, 0, rot), m=m))
    if parts is not None:
        parts.extend(objs)
    return objs


def chair(name, loc, rot=0.0, m="wood_dark", parts=None):
    x, y, z = loc
    c, s = math.cos(rot), math.sin(rot)

    def P(lx, ly, lz):
        return (x + lx * c - ly * s, y + lx * s + ly * c, z + lz)
    objs = [box(name + "_seat", (0.44, 0.42, 0.04), loc=P(0, 0, 0.45), rot=(0, 0, rot), m=m, bevel=0.006)]
    for sx in (-1, 1):
        for sy in (-1, 1):
            objs.append(box(name + "_leg", (0.035, 0.035, 0.45), loc=P(sx * 0.19, sy * 0.18, 0.225), rot=(0, 0, rot), m=m))
        objs.append(box(name + "_post", (0.035, 0.035, 0.5), loc=P(sx * 0.19, 0.19, 0.7), rot=(0, 0, rot), m=m))
    for k in range(3):
        objs.append(box(name + "_slat", (0.38, 0.02, 0.05), loc=P(0, 0.19, 0.6 + k * 0.13), rot=(0, 0, rot), m=m))
    if parts is not None:
        parts.extend(objs)
    return objs


def sofa(name, loc, rot=0.0, w=2.0, m="fabric_sofa", parts=None):
    x, y, z = loc
    c, s = math.cos(rot), math.sin(rot)

    def P(lx, ly, lz):
        return (x + lx * c - ly * s, y + lx * s + ly * c, z + lz)
    objs = [box(name + "_base", (w, 0.85, 0.42), loc=P(0, 0, 0.21), rot=(0, 0, rot), m=m, bevel=0.05, segs=3),
            box(name + "_back", (w, 0.22, 0.5), loc=P(0, 0.33, 0.62), rot=(0, 0, rot), m=m, bevel=0.07, segs=3)]
    for sx in (-1, 1):
        objs.append(box(name + "_arm", (0.2, 0.85, 0.32), loc=P(sx * (w / 2 - 0.1), 0, 0.55), rot=(0, 0, rot), m=m, bevel=0.07, segs=3))
    n = max(1, int(w // 0.7))
    for i in range(n):
        objs.append(box(name + "_cush", ((w - 0.4) / n - 0.02, 0.62, 0.14), loc=P(-w / 2 + 0.2 + (w - 0.4) / n * (i + 0.5), -0.06, 0.48), rot=(0, 0, rot), m=m, bevel=0.05, segs=3))
    if parts is not None:
        parts.extend(objs)
    return objs


def bed(name, loc, rot=0.0, w=1.5, L=2.05, frame_m="wood_dark", parts=None):
    x, y, z = loc
    c, s = math.cos(rot), math.sin(rot)

    def P(lx, ly, lz):
        return (x + lx * c - ly * s, y + lx * s + ly * c, z + lz)
    objs = [box(name + "_frame", (w + 0.08, L + 0.08, 0.3), loc=P(0, 0, 0.2), rot=(0, 0, rot), m=frame_m, bevel=0.01),
            box(name + "_matt", (w, L, 0.22), loc=P(0, 0, 0.45), rot=(0, 0, rot), m="fabric_bed", bevel=0.06, segs=3),
            box(name + "_head", (w + 0.1, 0.06, 1.0), loc=P(0, L / 2 + 0.03, 0.5), rot=(0, 0, rot), m=frame_m, bevel=0.01),
            box(name + "_blanket", (w + 0.04, L * 0.62, 0.05), loc=P(0, -L * 0.17, 0.57), rot=(0, 0, rot), m="fabric_curtain", bevel=0.02),
            box(name + "_pillow", (w * 0.8, 0.4, 0.12), loc=P(0, L / 2 - 0.3, 0.62), rot=(0, 0, rot), m="fabric_bed", bevel=0.05, segs=3)]
    if parts is not None:
        parts.extend(objs)
    return objs


def bookshelf(name, loc, rot=0.0, w=1.0, h=1.9, d=0.32, m="wood_dark", parts=None, seed=1):
    import random
    r = random.Random(seed)
    x, y, z = loc
    c, s = math.cos(rot), math.sin(rot)

    def P(lx, ly, lz):
        return (x + lx * c - ly * s, y + lx * s + ly * c, z + lz)
    objs = []
    for sx in (-1, 1):
        objs.append(box(name + "_side", (0.025, d, h), loc=P(sx * w / 2, 0, h / 2), rot=(0, 0, rot), m=m))
    objs.append(box(name + "_back", (w, 0.012, h), loc=P(0, d / 2, h / 2), rot=(0, 0, rot), m=m))
    shelves = 5
    for k in range(shelves + 1):
        zz = 0.04 + k * (h - 0.06) / shelves
        objs.append(box(name + "_shelf", (w, d, 0.022), loc=P(0, 0, zz), rot=(0, 0, rot), m=m))
        if k == shelves:
            break
        cur = -w / 2 + 0.03
        while cur < w / 2 - 0.06:
            bw = r.uniform(0.022, 0.05)
            bh = r.uniform(0.17, 0.3)
            if r.random() < 0.08:
                cur += r.uniform(0.04, 0.12)
                continue
            mat = r.choice(["book_mix", "fabric_red", "cloth_navy", "leather_brown", "cloth_khaki", "fabric_sofa"])
            lean = r.uniform(-0.05, 0.05) if r.random() < 0.15 else 0
            objs.append(box(name + "_book", (bw, d * r.uniform(0.6, 0.85), bh), loc=P(cur + bw / 2, -0.01, zz + 0.012 + bh / 2), rot=(0, lean, rot), m=mat))
            cur += bw + 0.002
    if parts is not None:
        parts.extend(objs)
    return objs


def cabinet_run(name, a, length, rot=0.0, h=0.9, d=0.62, top_m="console_beige", body_m="wood_trim", parts=None, sink_at=None, upper=True, ceiling=2.6):
    x, y, z = a
    c, s = math.cos(rot), math.sin(rot)

    def P(lx, ly, lz):
        return (x + lx * c - ly * s, y + lx * s + ly * c, z + lz)
    objs = [box(name + "_body", (length, d - 0.05, h - 0.05), loc=P(length / 2, 0, (h - 0.05) / 2), rot=(0, 0, rot), m=body_m, bevel=0.005),
            box(name + "_top", (length + 0.02, d, 0.04), loc=P(length / 2, -0.01, h - 0.02), rot=(0, 0, rot), m=top_m, bevel=0.005)]
    n = max(1, int(length / 0.5))
    for i in range(n):
        lx = length / n * (i + 0.5)
        objs.append(box(name + "_door", (length / n - 0.02, 0.02, h - 0.2), loc=P(lx, -d / 2 + 0.01, (h - 0.1) / 2), rot=(0, 0, rot), m=body_m, bevel=0.004))
        objs.append(box(name + "_pull", (0.1, 0.02, 0.015), loc=P(lx, -d / 2 - 0.005, h - 0.2), rot=(0, 0, rot), m="metal_brushed"))
        if upper:
            objs.append(box(name + "_upper", (length / n - 0.02, 0.34, 0.7), loc=P(lx, 0.12, ceiling - 0.45), rot=(0, 0, rot), m=body_m, bevel=0.005))
    if sink_at is not None:
        objs.append(box(name + "_sink", (0.6, 0.45, 0.02), loc=P(sink_at, -0.03, h + 0.0), rot=(0, 0, rot), m="metal_brushed"))
        objs.append(cyl(name + "_tap", 0.015, 0.3, loc=P(sink_at, 0.18, h + 0.15), m="chrome"))
    if parts is not None:
        parts.extend(objs)
    return objs


def fridge(name, loc, rot=0.0, parts=None):
    x, y, z = loc
    objs = [box(name, (0.75, 0.7, 1.75), loc=(x, y, z + 0.875), rot=(0, 0, rot), m="plastic_white", bevel=0.06, segs=3),
            box(name + "_h", (0.03, 0.04, 0.4), loc=(x + 0.3 * math.cos(rot) - (-0.37) * math.sin(rot), y + 0.3 * math.sin(rot) + (-0.37) * math.cos(rot), z + 1.15), rot=(0, 0, rot), m="chrome")]
    if parts is not None:
        parts.extend(objs)
    return objs


def stove(name, loc, rot=0.0, parts=None):
    x, y, z = loc
    c, s = math.cos(rot), math.sin(rot)

    def P(lx, ly, lz):
        return (x + lx * c - ly * s, y + lx * s + ly * c, z + lz)
    objs = [box(name, (0.76, 0.66, 0.9), loc=P(0, 0, 0.45), rot=(0, 0, rot), m="plastic_white", bevel=0.01),
            box(name + "_glass", (0.5, 0.01, 0.35), loc=P(0, -0.335, 0.4), rot=(0, 0, rot), m="glass_dark"),
            box(name + "_back", (0.76, 0.06, 0.2), loc=P(0, 0.31, 1.0), rot=(0, 0, rot), m="plastic_white")]
    for (bx, by) in ((-0.18, -0.12), (0.18, -0.12), (-0.18, 0.15), (0.18, 0.15)):
        objs.append(cyl(name + "_burner", 0.09, 0.015, loc=P(bx, by, 0.905), m="metal_dark", verts=16))
    if parts is not None:
        parts.extend(objs)
    return objs


def desk(name, loc, rot=0.0, w=1.4, parts=None, m="wood_dark"):
    x, y, z = loc
    c, s = math.cos(rot), math.sin(rot)

    def P(lx, ly, lz):
        return (x + lx * c - ly * s, y + lx * s + ly * c, z + lz)
    objs = [box(name + "_top", (w, 0.7, 0.04), loc=P(0, 0, 0.74), rot=(0, 0, rot), m=m, bevel=0.006),
            box(name + "_ped", (0.42, 0.66, 0.72), loc=P(w / 2 - 0.22, 0, 0.36), rot=(0, 0, rot), m=m, bevel=0.005),
            box(name + "_leg", (0.04, 0.66, 0.72), loc=P(-w / 2 + 0.03, 0, 0.36), rot=(0, 0, rot), m=m)]
    for k in range(3):
        objs.append(box(name + "_drw", (0.38, 0.015, 0.2), loc=P(w / 2 - 0.22, -0.335, 0.6 - k * 0.23), rot=(0, 0, rot), m=m))
    if parts is not None:
        parts.extend(objs)
    return objs


def crt(name, loc, rot=0.0, parts=None):
    x, y, z = loc
    c, s = math.cos(rot), math.sin(rot)

    def P(lx, ly, lz):
        return (x + lx * c - ly * s, y + lx * s + ly * c, z + lz)
    objs = [box(name + "_body", (0.5, 0.45, 0.42), loc=P(0, 0.05, 0.21), rot=(0, 0, rot), m="plastic_dark", bevel=0.03),
            box(name + "_scr", (0.38, 0.01, 0.3), loc=P(0, -0.18, 0.23), rot=(0, 0, rot), m="glass_dark")]
    if parts is not None:
        parts.extend(objs)
    return objs


def shelf_unit(name, loc, rot=0.0, w=1.2, h=1.8, d=0.45, m="steel_painted_gray", parts=None, items="jars", seed=3):
    import random
    r = random.Random(seed)
    x, y, z = loc
    c, s = math.cos(rot), math.sin(rot)

    def P(lx, ly, lz):
        return (x + lx * c - ly * s, y + lx * s + ly * c, z + lz)
    objs = []
    for sx in (-1, 1):
        for sy in (-1, 1):
            objs.append(box(name + "_post", (0.035, 0.035, h), loc=P(sx * (w / 2 - 0.02), sy * (d / 2 - 0.02), h / 2), rot=(0, 0, rot), m=m))
    for k in range(4):
        zz = 0.1 + k * (h - 0.15) / 3
        objs.append(box(name + "_sh", (w, d, 0.02), loc=P(0, 0, zz), rot=(0, 0, rot), m=m))
        cur = -w / 2 + 0.06
        while cur < w / 2 - 0.08:
            if items == "jars":
                rr = r.uniform(0.04, 0.06)
                hh = r.uniform(0.12, 0.22)
                objs.append(cyl(name + "_jar", rr, hh, loc=P(cur + rr, r.uniform(-0.1, 0.1), zz + 0.01 + hh / 2), m=r.choice(["glass_clear", "plastic_white", "metal_gray", "warning_red"]), verts=10))
                cur += rr * 2 + 0.02
            else:
                bw = r.uniform(0.2, 0.4)
                bh = r.uniform(0.15, 0.32)
                objs.append(box(name + "_box", (bw, d * 0.8, bh), loc=P(cur + bw / 2, 0, zz + 0.01 + bh / 2), rot=(0, 0, rot), m=r.choice(["fabric_bag", "wood_raw", "console_beige", "plastic_dark"]), bevel=0.01))
                cur += bw + 0.03
    if parts is not None:
        parts.extend(objs)
    return objs


def ceiling_lamp(name, loc, parts, lamp_parts, lights, group, par, kind="bowl"):
    x, y, z = loc
    if kind == "bowl":
        parts.append(cyl(name + "_mount", 0.08, 0.03, loc=(x, y, z - 0.015), m="metal_brushed", verts=16))
        lamp_parts.append(kit.sphere(f"lampE|{group}|{name}", 0.17, loc=(x, y, z - 0.13), m="emit_warm", segs=16, rings=8, scale=(1, 1, 0.55)))
    else:
        parts.append(cyl(name + "_cord", 0.008, 0.5, loc=(x, y, z - 0.25), m="plastic_dark", verts=6))
        parts.append(cyl(name + "_shade", 0.2, 0.18, r2=0.06, loc=(x, y, z - 0.58), m="steel_painted_white", verts=20))
        lamp_parts.append(kit.sphere(f"lampE|{group}|{name}", 0.05, loc=(x, y, z - 0.64), m="emit_warm", segs=10, rings=6))
    lights.append(empty(f"light_{group}_{len(lights)}", loc=(x, y, z - 0.3), parent=par, light="warm", group=group, intensity=4.0, distance=9))


def rug(name, loc, w, d, rot=0.0, m="fabric_red", parts=None):
    o = box(name, (w, d, 0.012), loc=(loc[0], loc[1], loc[2] + 0.006), rot=(0, 0, rot), m=m, bevel=0.004)
    if parts is not None:
        parts.append(o)
    return o


def picture(name, loc, rot, w=0.5, h=0.4, parts=None):
    x, y, z = loc
    objs = [box(name + "_f", (w, 0.03, h), loc=(x, y, z), rot=(0, 0, rot), m="wood_dark", bevel=0.004),
            box(name + "_p", (w - 0.08, 0.035, h - 0.08), loc=(x, y, z), rot=(0, 0, rot), m="console_beige")]
    if parts is not None:
        parts.extend(objs)
    return objs
