"""Manor props + cake (metres, film coordinates: +Y up, front faces +Z)."""
import math
import os
import random
import bmesh
import bpy
from mathutils import Vector
from common import (F, mat, new_obj, empty, apply_mods, bevel, subsurf, rounded_rect_pts, slab,
                    disc_pts, poly_pts, lathe, export_glb)

R = random.Random(7)


def box_uv(bm, scale=1.0):
    uvl = bm.loops.layers.uv.verify()
    for f in bm.faces:
        n = f.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        for l in f.loops:
            c = l.vert.co
            if ax == 0:
                uv = (c.y, c.z)
            elif ax == 1:
                uv = (c.x, c.z)
            else:
                uv = (c.x, c.y)
            l[uvl].uv = (uv[0] * scale, uv[1] * scale)


def box(name, sx, sy, sz, cx, cy, cz, materials, parent=None, bev=0.0, seg=2, uvscale=1.0):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        x, y, z = v.co.x * sx + cx, v.co.y * sy + cy, v.co.z * sz + cz
        v.co = F(x, y, z)
    bm.normal_update()
    box_uv(bm, uvscale)
    ob = new_obj(name, bm, materials, parent)
    if bev > 0:
        bevel(ob, bev, segments=seg, angle=50)
        apply_mods(ob)
    return ob


def join(objs, name):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    with bpy.context.temp_override(active_object=objs[0], selected_editable_objects=objs, selected_objects=objs, object=objs[0]):
        bpy.ops.object.join()
    objs[0].name = name
    return objs[0]


def profile_extrude(name, prof, x0, x1, materials, parent=None, smooth=False):
    """Extrude a (z, y) molding profile along film X from x0 to x1."""
    bm = bmesh.new()
    a = [bm.verts.new(F(x0, y, z)) for z, y in prof]
    b = [bm.verts.new(F(x1, y, z)) for z, y in prof]
    for i in range(len(prof) - 1):
        bm.faces.new((a[i], a[i + 1], b[i + 1], b[i]))
    bm.faces.new(a)
    bm.faces.new(list(reversed(b)))
    bm.normal_update()
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    box_uv(bm, 2.0)
    return new_obj(name, bm, materials, parent, smooth)


# ---------------------------------------------------------------------------
# CRT television (c. 1970s Italian wooden-cabinet set, physical push buttons)
# ---------------------------------------------------------------------------

def crt_tv():
    root = empty('CRT_TV')
    wood = mat('TV_Wood', (0.25, 0.13, 0.06), 0, 0.45)
    dark = mat('TV_Bezel', (0.05, 0.035, 0.03), 0, 0.5)
    alu = mat('TV_Alu', (0.75, 0.73, 0.7), 1.0, 0.32)
    cream = mat('TV_Button', (0.86, 0.82, 0.72), 0, 0.35)
    grille = mat('TV_Grille', (0.12, 0.09, 0.07), 0, 0.8)
    chrome = mat('TV_Chrome', (0.9, 0.9, 0.9), 1.0, 0.15)
    glass = mat('TV_Glass', (0.05, 0.06, 0.06), 0, 0.05)
    W, H, D = 0.68, 0.52, 0.46
    # cabinet shell (open front) — 4 walls with rounded vertical edges
    shell = []
    th = 0.03
    shell.append(box('TV_top', W, th, D, 0, H - th / 2, -D / 2, [wood], root, 0.012, 3))
    shell.append(box('TV_bot', W, th, D, 0, th / 2, -D / 2, [wood], root, 0.012, 3))
    shell.append(box('TV_left', th, H, D, -W / 2 + th / 2, H / 2, -D / 2, [wood], root, 0.012, 3))
    shell.append(box('TV_right', th, H, D, W / 2 - th / 2, H / 2, -D / 2, [wood], root, 0.012, 3))
    shell.append(box('TV_back', W, H, th, 0, H / 2, -D + th / 2, [wood], root, 0.01, 2))
    join(shell, 'TV_cabinet')
    # front mask (bezel) with CRT-shaped opening
    sw, sh = 0.44, 0.34
    scx, scy = -0.085, H / 2 + 0.01
    outer = [(-W / 2 + th, th), (W / 2 - th - 0.17, th), (W / 2 - th - 0.17, H - th), (-W / 2 + th, H - th)]
    hole = []
    n = 72
    for i in range(n):
        a = 2 * math.pi * i / n
        c, s = math.cos(a), math.sin(a)
        # superellipse opening (classic rounded-rectangle tube face)
        px = scx + (sw / 2) * math.copysign(abs(c) ** (2 / 4.5), c)
        py = scy + (sh / 2) * math.copysign(abs(s) ** (2 / 4.5), s)
        hole.append((px, py))
    bm = bmesh.new()
    zf = -0.012
    vo = [bm.verts.new(F(x, y, zf)) for x, y in outer]
    vh = [bm.verts.new(F(x, y, zf)) for x, y in hole]
    # bridge outer rectangle to hole via triangle fan through nearest
    edges_o = [bm.edges.new((vo[i], vo[(i + 1) % 4])) for i in range(4)]
    edges_h = [bm.edges.new((vh[i], vh[(i + 1) % n])) for i in range(n)]
    bmesh.ops.triangle_fill(bm, use_beauty=True, use_dissolve=False, edges=edges_o + edges_h)
    # remove faces inside hole
    for f in list(bm.faces):
        c = f.calc_center_median()
        x, y = c.x, c.z
        if ((abs(x - scx) / (sw / 2)) ** 4.5 + (abs(y - scy) / (sh / 2)) ** 4.5) < 1.0:
            bm.faces.remove(f)
    ext = bmesh.ops.extrude_face_region(bm, geom=bm.faces[:])
    for v in [e for e in ext['geom'] if isinstance(e, bmesh.types.BMVert)]:
        v.co.y -= 0.03  # blender -y == film +z (toward viewer)
    bm.normal_update()
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    box_uv(bm, 3)
    mask = new_obj('TV_mask', bm, [dark], root)
    bevel(mask, 0.004, 2, angle=40)
    apply_mods(mask)
    # bulging CRT glass (UV 0..1 over the opening for the screen shader)
    bm = bmesh.new()
    G = 40
    verts = []
    for j in range(G + 1):
        row = []
        for i in range(G + 1):
            u, v = i / G, j / G
            x = scx + (u - 0.5) * sw * 1.02
            y = scy + (v - 0.5) * sh * 1.02
            bul = 0.034 * (1 - (2 * u - 1) ** 2 * 0.85) * (1 - (2 * v - 1) ** 2 * 0.85)
            row.append(bm.verts.new(F(x, y, -0.006 + bul)))
        verts.append(row)
    uvl = bm.loops.layers.uv.verify()
    for j in range(G):
        for i in range(G):
            f = bm.faces.new((verts[j][i], verts[j][i + 1], verts[j + 1][i + 1], verts[j + 1][i]))
            for l, (uu, vv) in zip(f.loops, [(i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1)]):
                l[uvl].uv = (uu / G, vv / G)
    new_obj('TV_screen', bm, [glass], root, smooth=True)
    # control panel (brushed aluminium) on the right
    px0 = W / 2 - th - 0.17
    box('TV_panel', 0.17, H - 2 * th, 0.02, px0 + 0.085, H / 2, 0.0, [alu], root, 0.003, 2, uvscale=4)
    # four physical push buttons (separate objects for travel animation)
    for i in range(4):
        y = H - 0.085 - i * 0.052
        b = box(f'TV_btn{i}', 0.11, 0.036, 0.034, px0 + 0.085, y, 0.022, [cream], root, 0.006, 3)
        b['press_axis'] = 'z'
    # channel dial + volume knob with knurling
    for k, (ky, kr) in enumerate([(0.17, 0.034), (0.085, 0.026)]):
        prof = [(0, 0.0), (kr, 0.0), (kr, 0.022), (kr * 0.92, 0.03), (kr * 0.5, 0.034), (0, 0.035)]
        kn = lathe(prof, 40, f'TV_knob{k}', [mat('TV_Knob', (0.08, 0.06, 0.05), 0.1, 0.35)], root)
        for v in kn.data.vertices:
            fx, fy, fz = v.co.x, v.co.z, -v.co.y
            ang = math.atan2(fz, fx)
            rr = math.hypot(fx, fz) * (1 + (0.04 if (int(ang / (2 * math.pi) * 40) % 2 and fy > 0.002 and fy < 0.021) else 0))
            # lathe axis (film y) -> knob axis (film z)
            nx, ny, nz = math.cos(ang) * rr, math.sin(ang) * rr, fy
            v.co = F(px0 + 0.085 + nx, ky + ny, nz + 0.012)
        kn.data.update()
    # power lamp
    lamp = box('TV_lamp', 0.012, 0.012, 0.01, px0 + 0.14, H - 0.04, 0.012, [mat('TV_Lamp', (0.5, 0.05, 0.03), 0, 0.3)], root, 0.003)
    # speaker grille: slats
    sl = []
    for i in range(9):
        sl.append(box(f'TV_slat{i}', 0.13, 0.006, 0.012, px0 + 0.085, 0.045 + i * 0.011, 0.012, [grille], root))
    join(sl, 'TV_grille')
    # badge
    box('TV_badge', 0.06, 0.012, 0.004, scx, th + 0.02, 0.02, [chrome], root, 0.002)
    # rabbit-ear antenna
    base = lathe([(0, 0), (0.05, 0), (0.048, 0.012), (0.03, 0.03), (0.0, 0.034)], 32, 'TV_ant_base', [mat('TV_Knob')], root)
    for v in base.data.vertices:
        v.co.z += H
        v.co.y += 0.2  # film z -= 0.2
    for s in (-1, 1):
        rod = lathe([(0.003, 0), (0.003, 0.5), (0.0045, 0.5), (0.0, 0.508)], 10, f'TV_ant_rod{s}', [chrome], root)
        ang = math.radians(28) * s
        for v in rod.data.vertices:
            fx, fy, fz = v.co.x, v.co.z, -v.co.y
            nx = fx * math.cos(ang) - fy * math.sin(ang)
            ny = fx * math.sin(ang) + fy * math.cos(ang)
            v.co = F(nx, ny + H + 0.03, fz - 0.2)
    return root


# ---------------------------------------------------------------------------
# Chesterfield sofa
# ---------------------------------------------------------------------------

def tufted_panel(name, w, h, depth, cols, rows, material, parent, dent=0.022, curve=0.0):
    """Subdivided slab whose front face is pulled in at diamond button points."""
    bm = bmesh.new()
    nx, ny = cols * 6, rows * 6
    pts_front, pts_back = [], []
    for j in range(ny + 1):
        rf, rb = [], []
        for i in range(nx + 1):
            x = (i / nx - 0.5) * w
            y = (j / ny) * h
            z_curve = -curve * (2 * i / nx - 1) ** 2
            rf.append(bm.verts.new(F(x, y, depth / 2 + z_curve)))
            rb.append(bm.verts.new(F(x, y, -depth / 2 + z_curve)))
        pts_front.append(rf)
        pts_back.append(rb)
    buttons = []
    for j in range(rows + 1):
        for i in range(cols + 1):
            if (i + j) % 2:
                continue
            bx = (i / cols - 0.5) * w
            by = (j / rows) * h
            if 0.05 < by < h - 0.05 and abs(bx) < w / 2 - 0.05:
                buttons.append((bx, by))
    for j in range(ny + 1):
        for i in range(nx + 1):
            v = pts_front[j][i]
            x, y = v.co.x, v.co.z
            d = 0.0
            for bx, by in buttons:
                r2 = ((x - bx) / (w / cols * 0.55)) ** 2 + ((y - by) / (h / rows * 0.55)) ** 2
                d += math.exp(-r2 * 3.0)
            # pleats between buttons
            v.co.y += min(d, 1.2) * dent
            # rounded pillowing at edges
            ex = 1 - (2 * i / nx - 1) ** 8
            ey = 1 - (2 * j / ny - 1) ** 8
            v.co.y += (1 - ex * ey) * depth * 0.25
    uvl = bm.loops.layers.uv.verify()
    for grid, flip in ((pts_front, False), (pts_back, True)):
        for j in range(ny):
            for i in range(nx):
                q = (grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i])
                f = bm.faces.new(q if not flip else tuple(reversed(q)))
                for l in f.loops:
                    l[uvl].uv = (l.vert.co.x * 1.5, l.vert.co.z * 1.5)
    # side walls
    def wall(a, b):
        for k in range(len(a) - 1):
            bm.faces.new((a[k], a[k + 1], b[k + 1], b[k]))
    wall([pts_front[0][i] for i in range(nx + 1)], [pts_back[0][i] for i in range(nx + 1)])
    wall([pts_back[ny][i] for i in range(nx + 1)], [pts_front[ny][i] for i in range(nx + 1)])
    wall([pts_back[j][0] for j in range(ny + 1)], [pts_front[j][0] for j in range(ny + 1)])
    wall([pts_front[j][nx] for j in range(ny + 1)], [pts_back[j][nx] for j in range(ny + 1)])
    bm.normal_update()
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = new_obj(name, bm, [material], parent, smooth=True)
    return ob, buttons


def sofa():
    root = empty('Sofa')
    lea = mat('Sofa_Leather', (0.35, 0.14, 0.07), 0, 0.42)
    wood = mat('Sofa_Wood', (0.18, 0.09, 0.04), 0, 0.35)
    brass = mat('Sofa_Brass', (0.8, 0.6, 0.3), 1.0, 0.3)
    btn = mat('Sofa_Button', (0.22, 0.08, 0.04), 0, 0.4)
    L, Dp = 2.1, 0.92
    seat_h = 0.43
    # plinth / base
    base = box('Sofa_base', L - 0.02, 0.24, Dp - 0.06, 0, 0.1 + 0.12, -0.01, [lea], root, 0.035, 4)
    # back (tufted), slightly curved, leaning back
    back, bts = tufted_panel('Sofa_back', L - 0.3, 0.46, 0.2, 9, 3, lea, root, dent=-0.024, curve=0.02)
    for v in back.data.vertices:
        fx, fy, fz = v.co.x, v.co.z, -v.co.y
        lean = math.radians(8)
        nz = fz * math.cos(lean) - fy * math.sin(lean)
        ny = fz * math.sin(lean) + fy * math.cos(lean)
        v.co = F(fx, ny + seat_h - 0.05, nz - Dp / 2 + 0.13)
    back.data.update()
    # back top roll
    roll = lathe([(0, 0), (0.07, 0), (0.07, L - 0.32), (0, L - 0.32)], 28, 'Sofa_backroll', [lea], root)
    for v in roll.data.vertices:
        fx, fy, fz = v.co.x, v.co.z, -v.co.y
        v.co = F(fy - (L - 0.32) / 2, fx + seat_h + 0.38, fz - Dp / 2 + 0.075)
    roll.data.update()
    # arms: tufted panel + scroll roll on top
    for s in (-1, 1):
        arm, _ = tufted_panel(f'Sofa_arm{s}', Dp - 0.06, 0.48, 0.17, 4, 3, lea, root, dent=-0.018)
        for v in arm.data.vertices:
            fx, fy, fz = v.co.x, v.co.z, -v.co.y
            v.co = F(s * (L / 2 - 0.085) + fz * s, fy + 0.2, fx - 0.01)
        arm.data.update()
        ar = lathe([(0, 0), (0.095, 0), (0.095, Dp - 0.04), (0, Dp - 0.04)], 28, f'Sofa_armroll{s}', [lea], root)
        for v in ar.data.vertices:
            fx, fy, fz = v.co.x, v.co.z, -v.co.y
            v.co = F(s * (L / 2 - 0.07) + fx * 1.0, fz * 1.0 + 0.66, fy - (Dp - 0.04) / 2 - 0.01)
        ar.data.update()
        # nailhead trim along the arm front
        studs = []
        for k in range(14):
            a = math.pi * 0.15 + k / 13 * math.pi * 1.3
            sx = s * (L / 2 - 0.07) + math.cos(a) * 0.1 * s
            sy = 0.66 + math.sin(a) * 0.1
            st = lathe([(0, 0), (0.007, 0), (0.006, 0.003), (0, 0.0045)], 10, 'stud', [brass], root)
            for v in st.data.vertices:
                fx, fy, fz = v.co.x, v.co.z, -v.co.y
                v.co = F(sx + fx, sy + fz, Dp / 2 - 0.045 + fy)
            studs.append(st)
        join(studs, f'Sofa_studs{s}')
    # seat cushions with a 'Sit' shape key
    cush = []
    for k in range(2):
        cw = (L - 0.36) / 2
        cx = (k - 0.5) * cw
        c = box(f'Sofa_cushion{k}', cw - 0.01, 0.15, Dp - 0.28, cx, seat_h - 0.03, 0.06, [lea], root, 0.05, 5)
        subsurf(c, 1)
        apply_mods(c)
        for p in c.data.polygons:
            p.use_smooth = True
        c.shape_key_add(name='Basis')
        sk = c.shape_key_add(name='Sit')
        sk.value = 0.0
        for i, v in enumerate(c.data.vertices):
            fx, fy, fz = v.co.x - cx, v.co.z, -v.co.y - 0.06
            r2 = (fx / (cw * 0.42)) ** 2 + (fz / 0.36) ** 2
            top = max(0.0, (fy - (seat_h - 0.1)) / 0.1)
            dz = -0.065 * math.exp(-r2 * 1.6) * top
            bulge = 0.012 * math.exp(-r2 * 0.6) * (1 - top)
            sk.data[i].co = Vector((v.co.x + (fx * bulge * 2), v.co.y, v.co.z + dz))
        cush.append(c)
    # turned bun feet
    for sx in (-1, 1):
        for sz in (-1, 1):
            ft = lathe([(0, 0), (0.035, 0), (0.05, 0.03), (0.045, 0.07), (0.05, 0.1), (0, 0.1)], 24, 'Sofa_foot', [wood], root)
            for v in ft.data.vertices:
                v.co.x += sx * (L / 2 - 0.12)
                v.co.y += -sz * (Dp / 2 - 0.12)
    return root


# ---------------------------------------------------------------------------
# Birthday cake with 'Squash' / 'Lean' morph targets
# ---------------------------------------------------------------------------

def cake():
    root = empty('Cake')
    sponge = mat('Cake_Sponge', (0.85, 0.62, 0.32), 0, 0.85)
    cream = mat('Cake_Cream', (0.98, 0.95, 0.9), 0, 0.28)
    cherry = mat('Cake_Cherry', (0.55, 0.02, 0.05), 0, 0.12)
    berry = mat('Cake_Berry', (0.12, 0.1, 0.35), 0, 0.3)
    stem = mat('Cake_Stem', (0.25, 0.3, 0.08), 0, 0.6)
    candle = mat('Cake_Candle', (0.95, 0.75, 0.85), 0, 0.4)
    plate_m = mat('Cake_Plate', (0.96, 0.96, 0.95), 0, 0.15)
    gold = mat('Cake_Gold', (0.9, 0.7, 0.35), 1, 0.25)
    Rk = 0.12
    parts = []
    y = 0.012
    layers = [('s', 0.034), ('c', 0.012), ('s', 0.034), ('c', 0.012), ('s', 0.03)]
    for i, (kind, h) in enumerate(layers):
        rr = Rk if kind == 's' else Rk + 0.003
        prof = [(0, y), (rr, y), (rr + (0.002 if kind == 'c' else 0), y + h * 0.5), (rr, y + h), (0, y + h)]
        ob = lathe(prof, 64, f'cake_l{i}', [sponge if kind == 's' else cream], root)
        parts.append(ob)
        y += h
    # thick top cream dome
    top_y = y
    prof = [(0, top_y + 0.026), (Rk * 0.5, top_y + 0.024), (Rk * 0.9, top_y + 0.018), (Rk + 0.004, top_y + 0.006), (Rk + 0.004, top_y - 0.004), (0, top_y - 0.004)]
    parts.append(lathe(prof, 64, 'cake_top', [cream], root))
    # drips down the side
    for k in range(22):
        a = 2 * math.pi * k / 22 + R.random() * 0.1
        L = 0.015 + R.random() * 0.04
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=10, v_segments=8, radius=1.0)
        for v in bm.verts:
            x, yy, z = v.co.x * 0.008, v.co.z * L * 0.5, v.co.y * 0.004
            px, pz = math.cos(a) * (Rk + 0.003), math.sin(a) * (Rk + 0.003)
            # orient tangent to cylinder
            tx, tz = -math.sin(a), math.cos(a)
            v.co = F(px + tx * x + math.cos(a) * z, top_y - L * 0.45 + yy, pz + tz * x + math.sin(a) * z)
        parts.append(new_obj(f'drip{k}', bm, [cream], root, smooth=True))
    # piped rosettes around the edge
    for k in range(14):
        a = 2 * math.pi * k / 14
        cx, cz = math.cos(a) * Rk * 0.84, math.sin(a) * Rk * 0.84
        bm = bmesh.new()
        for i in range(160):
            pass
        prof = []
        for i in range(12):
            t = i / 11
            prof.append((0.016 * (1 - t) ** 0.8 * (1 + 0.18 * math.sin(t * 30)), top_y + 0.018 + t * 0.026))
        prof = [(0, top_y + 0.018)] + prof + [(0, top_y + 0.045)]
        ro = lathe(prof, 18, f'rosette{k}', [cream], root)
        for v in ro.data.vertices:
            # twist for piped-star ridges
            fx, fy, fz = v.co.x, v.co.z, -v.co.y
            ang = math.atan2(fz, fx)
            rr = math.hypot(fx, fz) * (1 + 0.18 * math.cos(ang * 6 + fy * 400))
            v.co = F(cx + math.cos(ang) * rr, fy, cz + math.sin(ang) * rr)
        ro.data.update()
        parts.append(ro)
        # cherry on every other rosette
        if k % 2 == 0:
            bm = bmesh.new()
            bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=12, radius=0.0105)
            for v in bm.verts:
                v.co = F(cx + v.co.x, top_y + 0.054 + v.co.z * 0.92, cz - v.co.y)
            parts.append(new_obj(f'cherry{k}', bm, [cherry], root, smooth=True))
            st = lathe([(0.0012, 0), (0.0012, 0.022), (0, 0.022)], 6, 'stem', [stem], root)
            for v in st.data.vertices:
                fx, fy, fz = v.co.x, v.co.z, -v.co.y
                v.co = F(cx + fx + fy * 0.35, top_y + 0.062 + fy, cz + fz)
            parts.append(st)
    # blueberries scattered on top
    for k in range(9):
        a = R.random() * math.tau
        rr = R.random() * Rk * 0.55
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=10, v_segments=8, radius=0.0065)
        for v in bm.verts:
            v.co = F(math.cos(a) * rr + v.co.x, top_y + 0.031 + v.co.z, math.sin(a) * rr - v.co.y)
        parts.append(new_obj(f'berry{k}', bm, [berry], root, smooth=True))
    # three striped candles
    for k in range(3):
        a = math.radians(90 + k * 120)
        cx, cz = math.cos(a) * 0.035, math.sin(a) * 0.035
        cd = lathe([(0, 0), (0.0045, 0), (0.0045, 0.075), (0.0, 0.077)], 14, f'candle{k}', [candle], root)
        for v in cd.data.vertices:
            v.co.x += cx
            v.co.y += -cz
            v.co.z += top_y + 0.022
        parts.append(cd)
    body = join(parts, 'Cake_body')
    for p in body.data.polygons:
        p.use_smooth = True
    # morph targets (exported as glTF morph targets)
    body.shape_key_add(name='Basis')
    sq = body.shape_key_add(name='Squash')
    ln = body.shape_key_add(name='Lean')
    sq.value = 0.0
    ln.value = 0.0
    H = top_y + 0.1
    for i, v in enumerate(body.data.vertices):
        fx, fy, fz = v.co.x, v.co.z, -v.co.y
        h = max(0.0, fy - 0.012) / (top_y - 0.012)
        r = math.hypot(fx, fz)
        squash_y = 0.012 + (fy - 0.012) * 0.72
        if fy > top_y:  # top decorations sink and spread
            squash_y = fy - (top_y - 0.012) * 0.28 - 0.004
        bulge = 1 + 0.16 * math.sin(min(h, 1.0) * math.pi) ** 0.9 + (0.06 if fy > top_y - 0.004 and r > Rk * 0.7 else 0)
        sq.data[i].co = F(fx * bulge, squash_y, fz * bulge)
        lean = 0.06 * h * h
        ln.data[i].co = F(fx + lean * 0.4, fy - lean * 0.08, fz + lean * 0.15)
    # flames (separate, follow candle tops in code)
    for k in range(3):
        a = math.radians(90 + k * 120)
        cx, cz = math.cos(a) * 0.035, math.sin(a) * 0.035
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=12, v_segments=10, radius=1.0)
        for v in bm.verts:
            yy = v.co.z
            sc = 0.0042 * (1 - max(0, yy) * 0.75)
            v.co = F(cx + v.co.x * sc, top_y + 0.022 + 0.087 + yy * 0.009, cz - v.co.y * sc)
        new_obj(f'Cake_flame{k}', bm, [mat('Cake_Flame', (1, 0.7, 0.3), 0, 0.5, emit=(1, 0.6, 0.2))], root, smooth=True)
    # plate (ceramic + gold rim)
    lathe([(0, 0), (0.17, 0.0), (0.175, 0.006), (0.18, 0.012), (0.172, 0.013), (0.13, 0.008), (0, 0.009)], 64, 'Cake_plate', [plate_m], root)
    ring = lathe([(0.172, 0.0125), (0.181, 0.0122), (0.181, 0.0135), (0.172, 0.014)], 64, 'Cake_rim', [gold], root)
    # cream splat blob (appears on impact)
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=20, v_segments=12, radius=1.0)
    for v in bm.verts:
        a = math.atan2(v.co.y, v.co.x)
        rr = 0.03 * (1 + 0.25 * math.sin(a * 5) + 0.12 * math.sin(a * 11))
        v.co = F(v.co.x * rr, max(0, v.co.z) * 0.008, -v.co.y * rr)
    new_obj('Cake_splat', bm, [cream], root, smooth=True)
    root['top_y'] = top_y
    return root


# ---------------------------------------------------------------------------
# Architecture: bookcase module (+niche variant) and arched window
# ---------------------------------------------------------------------------
SHELVES = [0.32, 0.78, 1.22, 1.66, 2.1, 2.54, 2.98]


def bookcase(name, niche=False):
    root = empty(name)
    wood = mat('Arch_Walnut', (0.2, 0.1, 0.05), 0, 0.4)
    carve = mat('Arch_WalnutDark', (0.1, 0.05, 0.025), 0, 0.45)
    gilt = mat('Arch_Gilt', (0.75, 0.55, 0.25), 1, 0.35)
    W, H, D = 1.0, 3.6, 0.44
    parts = []
    parts.append(box(f'{name}_back', W, H, 0.02, 0, H / 2, -D + 0.01, [carve], root))
    for s in (-1, 1):
        parts.append(box(f'{name}_side', 0.035, H, D, s * (W / 2 - 0.0175), H / 2, -D / 2, [wood], root, 0.004))
        # fluted pilaster on the stile
        parts.append(box(f'{name}_pil', 0.075, H - 0.5, 0.03, s * (W / 2 - 0.0375), H / 2 + 0.05, 0.015, [wood], root, 0.006))
        for k in range(3):
            parts.append(box(f'{name}_flute', 0.008, H - 0.9, 0.006, s * (W / 2 - 0.0375) + (k - 1) * 0.02, H / 2 + 0.05, 0.031, [carve], root, 0.002))
        # capital & base blocks (gilded rosette)
        parts.append(box(f'{name}_cap', 0.09, 0.08, 0.05, s * (W / 2 - 0.0375), H - 0.36, 0.02, [wood], root, 0.008))
        ros = lathe([(0, 0), (0.022, 0), (0.018, 0.008), (0.008, 0.014), (0, 0.016)], 16, f'{name}_ros', [gilt], root)
        for v in ros.data.vertices:
            fx, fy, fz = v.co.x, v.co.z, -v.co.y
            v.co = F(s * (W / 2 - 0.0375) + fx, H - 0.36 + fz, 0.045 + fy)
        parts.append(ros)
    shelves = SHELVES if not niche else [0.32, 0.78, 2.54, 2.98]
    for y in shelves:
        parts.append(box(f'{name}_shelf', W - 0.07, 0.03, D - 0.03, 0, y, -D / 2 + 0.005, [wood], root, 0.004))
        parts.append(box(f'{name}_lip', W - 0.07, 0.04, 0.02, 0, y - 0.005, -0.01, [wood], root, 0.004))
    parts.append(box(f'{name}_plinth', W, 0.22, 0.05, 0, 0.11, 0.0, [wood], root, 0.006))
    parts.append(profile_extrude(f'{name}_base', [(0.0, 0.22), (0.03, 0.22), (0.045, 0.2), (0.05, 0.16), (0.05, 0.0), (0.0, 0.0)], -W / 2, W / 2, [carve], root))
    # cornice (ogee crown)
    prof = [(0.0, H - 0.3)]
    for i in range(13):
        t = i / 12
        prof.append((0.02 + 0.12 * t, H - 0.3 + 0.22 * t + 0.03 * math.sin(t * math.pi * 2)))
    prof += [(0.14, H - 0.04), (0.16, H - 0.04), (0.16, H), (0.0, H)]
    parts.append(profile_extrude(f'{name}_cornice', prof, -W / 2 - 0.01, W / 2 + 0.01, [wood], root))
    parts.append(box(f'{name}_frieze', W - 0.15, 0.12, 0.02, 0, H - 0.36, 0.0, [carve], root, 0.004))
    # gilt egg-and-dart bead along frieze
    beads = []
    for k in range(16):
        bx = -W / 2 + 0.1 + k * (W - 0.2) / 15
        b = lathe([(0, 0), (0.008, 0), (0.007, 0.006), (0, 0.008)], 10, 'bead', [gilt], root)
        for v in b.data.vertices:
            fx, fy, fz = v.co.x, v.co.z, -v.co.y
            v.co = F(bx + fx, H - 0.36 + fz * 1.6, 0.012 + fy)
        beads.append(b)
    parts += beads
    if niche:
        # arched niche top + recessed velvet back
        n = 24
        prof = []
        for i in range(n + 1):
            a = math.pi * i / n
            prof.append((math.cos(a) * 0.43, 2.05 + math.sin(a) * 0.35))
        bm = bmesh.new()
        outer = [bm.verts.new(F(x, y, 0.0)) for x, y in [(-0.465, 2.05)] + prof[::-1] + [(0.465, 2.05)]]
        top = [bm.verts.new(F(x, 2.5, 0.0)) for x in (0.465, -0.465)]
        bm.faces.new(outer + top)
        ext = bmesh.ops.extrude_face_region(bm, geom=bm.faces[:])
        for v in [e for e in ext['geom'] if isinstance(e, bmesh.types.BMVert)]:
            v.co.y += 0.35
        bm.normal_update()
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        box_uv(bm, 1)
        parts.append(new_obj(f'{name}_arch', bm, [wood], root))
        parts.append(box(f'{name}_velvet', W - 0.08, 1.5, 0.01, 0, 1.55, -D + 0.03, [mat('Arch_Velvet', (0.18, 0.03, 0.04), 0, 0.9)], root))
    join(parts, f'{name}_carcass')
    root['shelves'] = str(shelves)
    return root


def window():
    root = empty('Window')
    frame = mat('Win_Frame', (0.82, 0.78, 0.68), 0, 0.5)
    stone = mat('Win_Stone', (0.75, 0.68, 0.58), 0, 0.8)
    glass = mat('Win_Glass', (0.9, 0.95, 0.95), 0, 0.05, alpha=0.15)
    W, Hr, Ra = 1.3, 2.35, 0.65
    parts = []
    t = 0.07
    # rectangular frame + arch frame
    parts.append(box('w_l', t, Hr, 0.1, -W / 2 + t / 2, Hr / 2, 0, [frame], root, 0.008))
    parts.append(box('w_r', t, Hr, 0.1, W / 2 - t / 2, Hr / 2, 0, [frame], root, 0.008))
    parts.append(box('w_b', W, t, 0.12, 0, t / 2, 0.01, [frame], root, 0.008))
    parts.append(box('w_tr', W, 0.06, 0.1, 0, Hr, 0, [frame], root, 0.008))
    parts.append(box('w_mid', 0.06, Hr, 0.09, 0, Hr / 2, 0, [frame], root, 0.008))
    for k in range(1, 4):
        parts.append(box('w_bar', W - 0.1, 0.025, 0.05, 0, Hr * k / 4, 0, [frame], root, 0.004))
    for s in (-1, 1):
        parts.append(box('w_vbar', 0.025, Hr, 0.05, s * W / 4, Hr / 2, 0, [frame], root, 0.004))
    # arch ring + radial muntins
    n = 32
    bm = bmesh.new()
    vo, vi = [], []
    for i in range(n + 1):
        a = math.pi * i / n
        vo.append((math.cos(a) * Ra, Hr + math.sin(a) * Ra))
        vi.append((math.cos(a) * (Ra - t), Hr + math.sin(a) * (Ra - t)))
    A = [bm.verts.new(F(x, y, -0.05)) for x, y in vo]
    B = [bm.verts.new(F(x, y, -0.05)) for x, y in vi]
    A2 = [bm.verts.new(F(x, y, 0.05)) for x, y in vo]
    B2 = [bm.verts.new(F(x, y, 0.05)) for x, y in vi]
    for i in range(n):
        bm.faces.new((A[i], A[i + 1], B[i + 1], B[i]))
        bm.faces.new((A2[i], B2[i], B2[i + 1], A2[i + 1]))
        bm.faces.new((A[i], A2[i], A2[i + 1], A[i + 1]))
        bm.faces.new((B[i], B[i + 1], B2[i + 1], B2[i]))
    bm.normal_update()
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    box_uv(bm, 2)
    parts.append(new_obj('w_arch', bm, [frame], root))
    for k in range(1, 4):
        a = math.pi * k / 4
        L = Ra - t
        bx = box('w_ray', 0.025, L, 0.05, 0, 0, 0, [frame], root, 0.004)
        for v in bx.data.vertices:
            fx, fy, fz = v.co.x, v.co.z + L / 2, -v.co.y
            ang = a - math.pi / 2
            nx = fx * math.cos(ang) - fy * math.sin(ang)
            ny = fx * math.sin(ang) + fy * math.cos(ang)
            v.co = F(nx, Hr + ny, fz)
        parts.append(bx)
    join(parts, 'Window_frame')
    # glass (rect + arch)
    gpts = [(-W / 2 + 0.02, 0.02), (W / 2 - 0.02, 0.02)] + [(math.cos(math.pi * i / n) * (Ra - 0.02), Hr + math.sin(math.pi * i / n) * (Ra - 0.02)) for i in range(n + 1)]
    bm = slab(gpts, -0.006, 0.0)
    new_obj('Window_glass', bm, [glass, glass, glass], root)
    # stone surround / architrave with keystone
    sur = []
    sw = 0.16
    sur.append(box('s_l', sw, Hr, 0.06, -W / 2 - sw / 2, Hr / 2, 0.04, [stone], root, 0.01))
    sur.append(box('s_r', sw, Hr, 0.06, W / 2 + sw / 2, Hr / 2, 0.04, [stone], root, 0.01))
    bm = bmesh.new()
    vo = [(math.cos(math.pi * i / n) * (Ra + sw), Hr + math.sin(math.pi * i / n) * (Ra + sw)) for i in range(n + 1)]
    vi = [(math.cos(math.pi * i / n) * Ra, Hr + math.sin(math.pi * i / n) * Ra) for i in range(n + 1)]
    A = [bm.verts.new(F(x, y, 0.07)) for x, y in vo]
    B = [bm.verts.new(F(x, y, 0.07)) for x, y in vi]
    A2 = [bm.verts.new(F(x, y, 0.01)) for x, y in vo]
    for i in range(n):
        bm.faces.new((A[i], B[i], B[i + 1], A[i + 1]))
        bm.faces.new((A2[i], A[i], A[i + 1], A2[i + 1]))
    bm.normal_update()
    box_uv(bm, 2)
    sur.append(new_obj('s_arch', bm, [stone], root))
    sur.append(box('s_key', 0.14, 0.24, 0.1, 0, Hr + Ra + sw - 0.04, 0.06, [stone], root, 0.01))
    sur.append(box('s_sill', W + 0.5, 0.06, 0.3, 0, -0.03, 0.12, [stone], root, 0.012))
    join(sur, 'Window_surround')
    return root


def build_and_export(out, preview):
    tv = crt_tv()
    export_glb(os.path.join(out, 'crt_tv.glb'), [tv])
    so = sofa()
    export_glb(os.path.join(out, 'sofa.glb'), [so])
    ck = cake()
    export_glb(os.path.join(out, 'cake.glb'), [ck])
    bc = bookcase('Bookcase')
    bn = bookcase('BookcaseNiche', niche=True)
    wi = window()
    export_glb(os.path.join(out, 'architecture.glb'), [bc, bn, wi])
    if preview:
        tv.location = F(-2.2, 0.5, 0)
        so.location = F(0, 0, 0)
        ck.location = F(2.0, 0.5, 0)
        ck.scale = (4, 4, 4)
        bc.location = F(-4.2, 0, -1)
        bn.location = F(-3.1, 0, -1)
        wi.location = F(4, 0.5, -1)
        preview('props', [], (0, -9.5, 2.4), (0, 0, 1.1), lens=35, res=(1600, 800))
