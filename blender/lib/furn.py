"""Furniture and household / workshop props. Each function draws into a visible Part `p` and a collision
Part `c` (may be None), placed by matrix `M` (origin on the floor, +Y = the object's back unless noted)."""
from __future__ import annotations

import math
import random

from bl import *  # noqa: F401,F403
from mathutils import Matrix, Vector

T = Matrix.Translation


def R(deg, axis="Z"):
    return Matrix.Rotation(math.radians(deg), 4, axis)


def place(x, y, z=0.0, rot=0.0):
    return T((x, y, z)) @ R(rot)


def _col(c, size, M, z):
    if c is not None:
        c.box(size, M=M @ T((0, 0, z)), mat="concrete", bevel=0)


def table(p, c, M, w=1.8, d=0.95, h=0.76, top="wood_furniture", leg="wood_dark", thick=0.045, legw=0.07):
    p.box((w, d, thick), M=M @ T((0, 0, h - thick / 2)), mat=top, bevel=0.008)
    p.box((w - 0.16, d - 0.16, 0.09), M=M @ T((0, 0, h - thick - 0.045)), mat=leg, bevel=0.004)
    for sx in (-1, 1):
        for sy in (-1, 1):
            p.box((legw, legw, h - thick), M=M @ T((sx * (w / 2 - 0.09), sy * (d / 2 - 0.09), (h - thick) / 2)), mat=leg, bevel=0.006)
    _col(c, (w, d, 0.1), M, h - 0.05)
    for sx in (-1, 1):
        for sy in (-1, 1):
            _col(c, (legw, legw, h), M @ T((sx * (w / 2 - 0.09), sy * (d / 2 - 0.09), 0)), h / 2)


def chair(p, c, M, seat="wood_furniture", frame="wood_dark", h=0.46, w=0.44, back=0.92):
    """Faces -Y (the back rest is on +Y)."""
    p.box((w, w, 0.035), M=M @ T((0, 0, h)), mat=seat, bevel=0.01)
    for sx in (-1, 1):
        p.box((0.04, 0.04, h), M=M @ T((sx * (w / 2 - 0.03), -(w / 2 - 0.03), h / 2)), mat=frame, bevel=0.005)
        p.box((0.04, 0.04, back), M=M @ T((sx * (w / 2 - 0.03), w / 2 - 0.03, back / 2)) @ R(-4, "X"), mat=frame, bevel=0.005)
    for z in (0.62, 0.74, 0.86):
        p.box((w - 0.08, 0.02, 0.06), M=M @ T((0, w / 2 - 0.03 + (z - 0.46) * 0.07, z)), mat=frame, bevel=0.004)
    for z in (0.18,):
        for sx in (-1, 1):
            p.box((0.025, w - 0.08, 0.03), M=M @ T((sx * (w / 2 - 0.03), 0, z)), mat=frame, bevel=0.003)
    _col(c, (w, w, h), M, h / 2)
    _col(c, (w, 0.06, back - h), M @ T((0, w / 2 - 0.02, 0)), (back + h) / 2)


def sofa(p, c, M, w=2.1, d=0.92, fabric="fabric_dark", leg="wood_dark"):
    """Back on +Y."""
    p.box((w, d, 0.22), M=M @ T((0, 0, 0.21)), mat=fabric, bevel=0.03)
    n = 3
    cw = (w - 0.36) / n
    for i in range(n):
        x = -w / 2 + 0.18 + cw * (i + 0.5)
        p.box((cw - 0.015, d - 0.3, 0.17), M=M @ T((x, -0.08, 0.41)), mat=fabric, bevel=0.045)
        p.box((cw - 0.015, 0.2, 0.46), M=M @ T((x, d / 2 - 0.2, 0.66)) @ R(-10, "X"), mat=fabric, bevel=0.06)
    p.box((w, 0.16, 0.6), M=M @ T((0, d / 2 - 0.08, 0.5)), mat=fabric, bevel=0.04)
    for sx in (-1, 1):
        p.box((0.18, d, 0.42), M=M @ T((sx * (w / 2 - 0.09), 0, 0.43)), mat=fabric, bevel=0.05)
        for sy in (-1, 1):
            p.box((0.06, 0.06, 0.1), M=M @ T((sx * (w / 2 - 0.1), sy * (d / 2 - 0.1), 0.05)), mat=leg, bevel=0.005)
    _col(c, (w, d, 0.5), M, 0.25)
    _col(c, (w, 0.2, 0.4), M @ T((0, d / 2 - 0.1, 0)), 0.7)


def armchair(p, c, M, fabric="fabric_red"):
    sofa_w = 0.95
    p.box((sofa_w, 0.9, 0.22), M=M @ T((0, 0, 0.21)), mat=fabric, bevel=0.03)
    p.box((sofa_w - 0.36, 0.6, 0.17), M=M @ T((0, -0.08, 0.41)), mat=fabric, bevel=0.045)
    p.box((sofa_w - 0.36, 0.2, 0.5), M=M @ T((0, 0.26, 0.68)) @ R(-12, "X"), mat=fabric, bevel=0.06)
    p.box((sofa_w, 0.16, 0.62), M=M @ T((0, 0.37, 0.52)), mat=fabric, bevel=0.04)
    for sx in (-1, 1):
        p.box((0.18, 0.9, 0.44), M=M @ T((sx * (sofa_w / 2 - 0.09), 0, 0.44)), mat=fabric, bevel=0.05)
    _col(c, (sofa_w, 0.9, 0.5), M, 0.25)
    _col(c, (sofa_w, 0.2, 0.4), M @ T((0, 0.36, 0)), 0.7)


def rug(p, M, w=2.4, d=1.6, mat="fabric_red", border="fabric_dark"):
    p.box((w, d, 0.012), M=M @ T((0, 0, 0.006)), mat=border, bevel=0.003)
    p.box((w - 0.24, d - 0.24, 0.014), M=M @ T((0, 0, 0.008)), mat=mat, bevel=0.003)


def bed(p, c, M, w=1.4, l=2.0, frame="wood_dark", sheet="cloth_white", blanket="fabric_blue"):
    """Head on +Y."""
    p.box((w + 0.08, l + 0.06, 0.2), M=M @ T((0, 0, 0.28)), mat=frame, bevel=0.01)
    for sx in (-1, 1):
        for sy in (-1, 1):
            p.box((0.07, 0.07, 0.28), M=M @ T((sx * (w / 2), sy * (l / 2), 0.14)), mat=frame, bevel=0.006)
    p.box((w + 0.1, 0.05, 0.95), M=M @ T((0, l / 2 + 0.03, 0.62)), mat=frame, bevel=0.012)
    p.box((w + 0.1, 0.05, 0.5), M=M @ T((0, -l / 2 - 0.03, 0.42)), mat=frame, bevel=0.012)
    p.box((w, l, 0.2), M=M @ T((0, 0, 0.48)), mat=sheet, bevel=0.05)
    p.box((w + 0.04, l * 0.68, 0.06), M=M @ T((0, -l * 0.15, 0.59)), mat=blanket, bevel=0.025)
    p.box((w + 0.06, 0.3, 0.07), M=M @ T((0, l * 0.2, 0.6)), mat=blanket, bevel=0.03)
    for sx in ((-0.3, 0.3) if w > 1.2 else (0,)):
        p.box((0.52, 0.34, 0.11), M=M @ T((sx, l / 2 - 0.24, 0.63)) @ R(4, "X"), mat=sheet, bevel=0.05)
    _col(c, (w + 0.1, l + 0.1, 0.6), M, 0.3)
    _col(c, (w + 0.1, 0.08, 0.5), M @ T((0, l / 2 + 0.03, 0)), 0.85)


def dresser(p, c, M, w=1.1, d=0.48, h=0.9, mat="wood_furniture", rows=3, cols=2, knob="metal_brass"):
    p.box((w, d, h - 0.08), M=M @ T((0, 0, (h - 0.08) / 2 + 0.08)), mat=mat, bevel=0.008)
    p.box((w + 0.03, d + 0.03, 0.03), M=M @ T((0, 0, h + 0.005)), mat=mat, bevel=0.008)
    for sx in (-1, 1):
        for sy in (-1, 1):
            p.box((0.05, 0.05, 0.08), M=M @ T((sx * (w / 2 - 0.04), sy * (d / 2 - 0.04), 0.04)), mat=mat, bevel=0.004)
    dh = (h - 0.14) / rows
    dw = (w - 0.06) / cols
    for r in range(rows):
        for q in range(cols):
            x = -w / 2 + 0.03 + dw * (q + 0.5)
            z = 0.11 + dh * (r + 0.5)
            p.box((dw - 0.02, 0.02, dh - 0.02), M=M @ T((x, -d / 2 - 0.008, z)), mat=mat, bevel=0.006)
            p.sphere(0.016, M=M @ T((x, -d / 2 - 0.03, z)), mat=knob, segs=10, rings=6)
    _col(c, (w, d, h), M, h / 2)


def bookshelf(p, c, M, w=1.0, h=2.0, d=0.3, shelves=5, mat="wood_dark", fill=0.85, seed=1, back=True):
    """Open face on -Y. Books are generated procedurally with varied sizes/colours and occasional leaning."""
    rnd = random.Random(seed)
    t = 0.025
    for sx in (-1, 1):
        p.box((t, d, h), M=M @ T((sx * (w / 2 - t / 2), 0, h / 2)), mat=mat, bevel=0.003)
    if back:
        p.box((w, 0.012, h), M=M @ T((0, d / 2 - 0.006, h / 2)), mat=mat, bevel=0)
    zs = [0.06 + (h - 0.06 - t) * i / shelves for i in range(shelves + 1)]
    for z in zs:
        p.box((w - 2 * t, d, t), M=M @ T((0, 0, z + t / 2)), mat=mat, bevel=0.003)
    p.box((w, d, 0.06), M=M @ T((0, 0, 0.03)), mat=mat, bevel=0.003)
    cols = ["cloth_plaid", "cloth_navy", "fabric_red", "cloth_khaki", "paint_green", "cloth_denim", "fabric_dark", "paint_cream", "paint_tan", "fabric_blue"]
    for i in range(shelves):
        z0 = zs[i] + t
        clear = zs[i + 1] - z0
        x = -w / 2 + t + 0.01
        while x < w / 2 - t - 0.04:
            if rnd.random() > fill:
                x += rnd.uniform(0.04, 0.16)
                continue
            bw = rnd.uniform(0.018, 0.05)
            bh = min(clear - 0.02, rnd.uniform(0.17, 0.27))
            bd = rnd.uniform(0.13, 0.2)
            if x + bw > w / 2 - t:
                break
            lean = rnd.uniform(-9, 9) if rnd.random() < 0.08 else 0
            p.box((bw, bd, bh), M=M @ T((x + bw / 2, -d / 2 + bd / 2 + rnd.uniform(0.005, 0.03), z0 + bh / 2)) @ R(lean, "Y"),
                  mat=rnd.choice(cols), bevel=0.003)
            x += bw + rnd.uniform(0.001, 0.004)
    _col(c, (w, d, h), M, h / 2)


def shelf_unit(p, c, M, w=1.2, h=1.9, d=0.45, shelves=4, mat="metal_steel", seed=3, stock="mixed"):
    """Utility shelving with boxes, jars and cans."""
    rnd = random.Random(seed)
    for sx in (-1, 1):
        for sy in (-1, 1):
            p.box((0.035, 0.035, h), M=M @ T((sx * (w / 2 - 0.02), sy * (d / 2 - 0.02), h / 2)), mat=mat, bevel=0.003)
    for i in range(shelves + 1):
        z = 0.08 + (h - 0.12) * i / shelves
        p.box((w, d, 0.022), M=M @ T((0, 0, z)), mat="wood_old" if mat.startswith("wood") else mat, bevel=0.003)
        if i == shelves:
            break
        clear = (h - 0.12) / shelves - 0.03
        x = -w / 2 + 0.06
        while x < w / 2 - 0.1:
            kind = rnd.random()
            if kind < 0.45:
                bw, bd, bh = rnd.uniform(0.2, 0.38), rnd.uniform(0.22, 0.38), rnd.uniform(0.14, min(0.3, clear))
                if x + bw > w / 2 - 0.03:
                    break
                p.box((bw, bd, bh), M=M @ T((x + bw / 2, rnd.uniform(-0.03, 0.03), z + 0.011 + bh / 2)) @ R(rnd.uniform(-5, 5)),
                      mat=rnd.choice(["canvas", "paint_tan", "plastic_gray", "wood_old", "plastic_blue"]), bevel=0.006)
                x += bw + 0.02
            elif kind < 0.8:
                r = rnd.uniform(0.04, 0.06)
                hh = rnd.uniform(0.11, 0.2)
                for k in range(rnd.randint(1, 3)):
                    if x + 2 * r > w / 2 - 0.03:
                        break
                    p.cyl(r, hh, M=M @ T((x + r, rnd.uniform(-0.1, 0.1), z + 0.011 + hh / 2)), mat=rnd.choice(["glass", "metal_bare", "paint_red_faded", "paint_green"]), segs=14, bevel=0.004)
                    p.cyl(r * 0.92, 0.012, M=M @ T((x + r, 0, z + 0.011 + hh + 0.004)), mat="metal_brass", segs=14, bevel=0.002)
                    x += 2 * r + 0.012
            else:
                x += rnd.uniform(0.08, 0.2)
    _col(c, (w, d, h), M, h / 2)


def counter(p, c, M, w=2.4, d=0.62, h=0.9, body="paint_cream", top="wood_furniture", doors=None, sink_at=None, handle="metal_bare"):
    """Kitchen base cabinets, front on -Y."""
    p.box((w, d - 0.03, h - 0.14), M=M @ T((0, 0.015, 0.1 + (h - 0.14) / 2)), mat=body, bevel=0.004)
    p.box((w, d - 0.08, 0.1), M=M @ T((0, 0.04, 0.05)), mat="paint_gray_dark", bevel=0)
    p.box((w + 0.02, d + 0.02, 0.04), M=M @ T((0, 0, h - 0.02)), mat=top, bevel=0.008)
    n = doors or max(1, round(w / 0.5))
    dw = w / n
    for i in range(n):
        x = -w / 2 + dw * (i + 0.5)
        p.box((dw - 0.012, 0.02, 0.15), M=M @ T((x, -d / 2 + 0.005, h - 0.14)), mat=body, bevel=0.005)
        p.box((dw - 0.012, 0.02, h - 0.37), M=M @ T((x, -d / 2 + 0.005, 0.11 + (h - 0.37) / 2)), mat=body, bevel=0.005)
        p.box((0.1, 0.014, 0.014), M=M @ T((x, -d / 2 - 0.02, h - 0.14)), mat=handle, bevel=0.003)
        p.box((0.014, 0.014, 0.1), M=M @ T((x + dw / 2 - 0.05, -d / 2 - 0.02, h - 0.34)), mat=handle, bevel=0.003)
    if sink_at is not None:
        sx = sink_at
        p.box((0.62, 0.42, 0.012), M=M @ T((sx, -0.02, h + 0.002)), mat="metal_bare", bevel=0.004)
        p.box((0.52, 0.34, 0.01), M=M @ T((sx, -0.02, h - 0.15)), mat="metal_steel", bevel=0)
        for q, (bx, by, bw2, bd2) in enumerate(((sx - 0.26, -0.02, 0.012, 0.34), (sx + 0.26, -0.02, 0.012, 0.34), (sx, -0.19, 0.52, 0.012), (sx, 0.15, 0.52, 0.012))):
            p.box((bw2, bd2, 0.16), M=M @ T((bx, by, h - 0.075)), mat="metal_steel", bevel=0)
        p.pipe([(sx, 0.2, h), (sx, 0.2, h + 0.24), (sx, 0.06, h + 0.27), (sx, 0.02, h + 0.2)], 0.012, M=M, mat="metal_chrome", segs=8)
        for s in (-1, 1):
            p.cyl(0.02, 0.05, M=M @ T((sx + s * 0.09, 0.2, h + 0.03)), mat="metal_chrome", segs=10, bevel=0.003)
    _col(c, (w, d, h), M, h / 2)


def wall_cabinet(p, M, w=2.0, d=0.34, h=0.72, z=1.45, body="paint_cream", handle="metal_bare"):
    p.box((w, d, h), M=M @ T((0, 0, z + h / 2)), mat=body, bevel=0.004)
    n = max(1, round(w / 0.5))
    dw = w / n
    for i in range(n):
        x = -w / 2 + dw * (i + 0.5)
        p.box((dw - 0.012, 0.02, h - 0.02), M=M @ T((x, -d / 2 - 0.005, z + h / 2)), mat=body, bevel=0.005)
        p.box((0.014, 0.014, 0.1), M=M @ T((x + dw / 2 - 0.05, -d / 2 - 0.025, z + 0.12)), mat=handle, bevel=0.003)


def fridge(p, c, M, w=0.78, d=0.72, h=1.72, mat="paint_cream"):
    p.box((w, d, h), M=M @ T((0, 0, h / 2 + 0.02)), mat=mat, bevel=0.03)
    p.box((w - 0.01, 0.03, h * 0.3), M=M @ T((0, -d / 2 - 0.012, h * 0.83 + 0.02)), mat=mat, bevel=0.012)
    p.box((w - 0.01, 0.03, h * 0.64), M=M @ T((0, -d / 2 - 0.012, h * 0.34 + 0.02)), mat=mat, bevel=0.012)
    for z, ln in ((h * 0.74, 0.22), (h * 0.58, 0.32)):
        p.box((0.03, 0.035, ln), M=M @ T((-w / 2 + 0.07, -d / 2 - 0.045, z)), mat="metal_chrome", bevel=0.008)
    _col(c, (w, d, h), M, h / 2)


def stove(p, c, M, w=0.76, d=0.66, h=0.92, mat="paint_white"):
    p.box((w, d, h - 0.02), M=M @ T((0, 0, (h - 0.02) / 2)), mat=mat, bevel=0.01)
    p.box((w, d, 0.02), M=M @ T((0, 0, h - 0.01)), mat="metal_black", bevel=0.004)
    p.box((w, 0.06, 0.2), M=M @ T((0, d / 2 - 0.03, h + 0.1)), mat=mat, bevel=0.01)
    for sx in (-1, 1):
        for sy in (-1, 1):
            p.tube(0.085, 0.07, 0.012, M=M @ T((sx * 0.19, sy * 0.15 - 0.03, h + 0.008)), mat="metal_dark", segs=20, bevel=0.002)
            p.cyl(0.05, 0.008, M=M @ T((sx * 0.19, sy * 0.15 - 0.03, h + 0.005)), mat="metal_black", segs=16, bevel=0)
    p.box((w - 0.12, 0.02, 0.42), M=M @ T((0, -d / 2 - 0.008, 0.42)), mat="metal_black", bevel=0.008)
    p.box((w - 0.3, 0.012, 0.22), M=M @ T((0, -d / 2 - 0.02, 0.44)), mat="glass_dark", bevel=0)
    p.box((w - 0.16, 0.03, 0.025), M=M @ T((0, -d / 2 - 0.05, 0.68)), mat="metal_chrome", bevel=0.008)
    for i in range(5):
        p.cyl(0.022, 0.03, M=M @ T((-0.26 + i * 0.13, d / 2 - 0.07, h + 0.12)) @ R(90, "X"), mat="metal_black", segs=10, bevel=0.003)
    _col(c, (w, d, h), M, h / 2)


def wood_stove(p, c, M, pipe_h=2.2):
    """Cast-iron stove with flue pipe rising to pipe_h."""
    p.box((0.62, 0.5, 0.56), M=M @ T((0, 0, 0.42)), mat="metal_black", bevel=0.03)
    p.box((0.68, 0.56, 0.03), M=M @ T((0, 0, 0.715)), mat="metal_black", bevel=0.01)
    for sx in (-1, 1):
        for sy in (-1, 1):
            p.cyl(0.025, 0.14, M=M @ T((sx * 0.25, sy * 0.19, 0.07)), mat="metal_black", segs=8, r2=0.018, bevel=0)
    p.box((0.36, 0.02, 0.3), M=M @ T((0, -0.255, 0.42)), mat="metal_dark", bevel=0.01)
    p.box((0.24, 0.012, 0.16), M=M @ T((0, -0.268, 0.44)), mat="glass_dark", bevel=0)
    p.cyl(0.075, pipe_h - 0.73, M=M @ T((0, 0.1, 0.73 + (pipe_h - 0.73) / 2)), mat="metal_black", segs=16, bevel=0)
    p.box((1.1, 0.95, 0.03), M=M @ T((0, 0, 0.015)), mat="tile_floor", bevel=0.004)
    _col(c, (0.64, 0.52, 0.74), M, 0.37)
    _col(c, (0.15, 0.15, pipe_h - 0.74), M @ T((0, 0.1, 0)), 0.74 + (pipe_h - 0.74) / 2)


def desk(p, c, M, w=1.5, d=0.72, h=0.75, mat="wood_furniture"):
    p.box((w, d, 0.035), M=M @ T((0, 0, h - 0.0175)), mat=mat, bevel=0.006)
    for sx in (-1, 1):
        p.box((0.42, d - 0.06, h - 0.07), M=M @ T((sx * (w / 2 - 0.22), 0, (h - 0.07) / 2 + 0.035)), mat=mat, bevel=0.005)
        for i in range(3):
            z = 0.12 + i * 0.2
            p.box((0.38, 0.018, 0.17), M=M @ T((sx * (w / 2 - 0.22), -d / 2 + 0.02, z + 0.09)), mat=mat, bevel=0.005)
            p.box((0.1, 0.014, 0.014), M=M @ T((sx * (w / 2 - 0.22), -d / 2 - 0.004, z + 0.09)), mat="metal_brass", bevel=0.003)
    p.box((w - 0.84, 0.02, 0.3), M=M @ T((0, d / 2 - 0.04, h - 0.2)), mat=mat, bevel=0)
    _col(c, (w, d, h), M, h / 2)


def laptop(p, M, screen="screen", open_deg=105):
    p.box((0.34, 0.24, 0.018), M=M @ T((0, 0, 0.009)), mat="plastic_dark", bevel=0.004)
    p.box((0.3, 0.12, 0.002), M=M @ T((0, -0.03, 0.019)), mat="plastic_black", bevel=0)
    L = M @ T((0, 0.12, 0.018)) @ R(open_deg - 90, "X")
    p.box((0.34, 0.012, 0.23), M=L @ T((0, 0.006, 0.115)), mat="plastic_dark", bevel=0.004)
    p.box((0.31, 0.002, 0.2), M=L @ T((0, -0.001, 0.115)), mat=screen, bevel=0)
    return L @ T((0, -0.002, 0.115))


def monitor_crt(p, M, w=0.42, mat="plastic_beige", screen="screen"):
    """Old tube monitor / TV, screen on -Y. Returns the screen centre matrix."""
    h = w * 0.82
    p.box((w, w * 0.9, h), M=M @ T((0, 0.04, h / 2 + 0.03)), mat=mat, bevel=0.02)
    p.box((w * 0.7, w * 0.5, 0.03), M=M @ T((0, 0.04, 0.015)), mat=mat, bevel=0.006)
    p.box((w - 0.07, 0.012, h - 0.09), M=M @ T((0, -w * 0.45 + 0.036, h / 2 + 0.045)), mat=screen, bevel=0.012)
    return M @ T((0, -w * 0.45 + 0.03, h / 2 + 0.045))


def lamp_ceiling(p, M, drop=0.25, shade="glass", r=0.17, bulb="emit_warm"):
    """Pendant with glass shade; origin at the ceiling."""
    p.cyl(0.05, 0.02, M=M @ T((0, 0, -0.01)), mat="metal_brass", segs=14, bevel=0.003)
    p.cyl(0.006, drop, M=M @ T((0, 0, -drop / 2)), mat="metal_dark", segs=6, bevel=0)
    p.lathe([(0.03, 0.0), (r * 0.55, -0.03), (r, -0.1), (r * 0.98, -0.115), (r * 0.5, -0.045), (0.028, -0.012)], M=M @ T((0, 0, -drop)), mat=shade, segs=20, closed=True, bevel=0)
    p.sphere(0.035, M=M @ T((0, 0, -drop - 0.06)), mat=bulb, segs=12, rings=8, scale=(1, 1, 1.25))


def lamp_table(p, M, shade="canvas", base="metal_brass", bulb="emit_warm"):
    p.cyl(0.07, 0.02, M=M @ T((0, 0, 0.01)), mat=base, segs=14, bevel=0.004)
    p.lathe([(0.02, 0.02), (0.05, 0.08), (0.03, 0.2), (0.012, 0.3)], M=M, mat=base, segs=14, bevel=0)
    p.lathe([(0.09, 0.3), (0.15, 0.52), (0.145, 0.52), (0.086, 0.305)], M=M, mat=shade, segs=18, closed=True, bevel=0)
    p.sphere(0.03, M=M @ T((0, 0, 0.36)), mat=bulb, segs=10, rings=6)


def switch_plate(p, M, mat="plastic_white"):
    """Wall light switch; local -Y faces into the room."""
    p.box((0.075, 0.008, 0.12), M=M, mat=mat, bevel=0.003)
    p.box((0.014, 0.014, 0.03), M=M @ T((0, -0.008, 0)) @ R(18, "X"), mat=mat, bevel=0.002)


def picture(p, M, w=0.5, h=0.38, frame="wood_dark", art="paint_tan"):
    """Hangs on a wall; local -Y faces the room."""
    p.box((w, 0.02, h), M=M, mat=frame, bevel=0.004)
    p.box((w - 0.07, 0.006, h - 0.07), M=M @ T((0, -0.012, 0)), mat=art, bevel=0)
    p.box((w - 0.065, 0.003, h - 0.065), M=M @ T((0, -0.016, 0)), mat="glass", bevel=0)


def crate(p, c, M, w=0.6, d=0.45, h=0.4, mat="wood_old"):
    p.box((w, d, h), M=M @ T((0, 0, h / 2)), mat=mat, bevel=0.006)
    for sx in (-1, 1):
        p.box((0.06, d + 0.02, h + 0.004), M=M @ T((sx * (w / 2 - 0.06), 0, h / 2)), mat=mat, bevel=0.004)
    for z in (0.05, h - 0.05):
        p.box((w + 0.02, d + 0.024, 0.06), M=M @ T((0, 0, z)), mat=mat, bevel=0.004)
    _col(c, (w, d, h), M, h / 2)


def barrel(p, c, M, r=0.29, h=0.88, mat="paint_blue"):
    p.lathe([(0.0, 0.0), (r * 0.96, 0.0), (r, 0.02), (r, h * 0.3), (r * 1.03, h * 0.33), (r, h * 0.36), (r, h * 0.64), (r * 1.03, h * 0.67), (r, h * 0.7), (r, h - 0.02), (r * 0.96, h), (r * 0.9, h - 0.02), (0.0, h - 0.02)],
            M=M, mat=mat, segs=24, bevel=0)
    p.cyl(0.03, 0.02, M=M @ T((r * 0.55, 0, h - 0.01)), mat="metal_dark", segs=8, bevel=0)
    if c is not None:
        c.cyl(r, h, M=M @ T((0, 0, h / 2)), mat="concrete", segs=8, bevel=0)


def workbench(p, c, M, w=2.4, d=0.75, h=0.92, seed=5):
    rnd = random.Random(seed)
    p.box((w, d, 0.06), M=M @ T((0, 0, h - 0.03)), mat="wood_old", bevel=0.008)
    for sx in (-1, 1):
        for sy in (-1, 1):
            p.box((0.09, 0.09, h - 0.06), M=M @ T((sx * (w / 2 - 0.08), sy * (d / 2 - 0.08), (h - 0.06) / 2)), mat="wood_old", bevel=0.006)
    p.box((w - 0.1, d - 0.1, 0.03), M=M @ T((0, 0, 0.22)), mat="wood_old", bevel=0.004)
    p.box((w, 0.03, 1.0), M=M @ T((0, d / 2 - 0.015, h + 0.5)), mat="wood_old", bevel=0.004)
    # vise
    p.box((0.16, 0.2, 0.1), M=M @ T((-w / 2 + 0.35, -d / 2 + 0.12, h + 0.05)), mat="paint_blue", bevel=0.01)
    p.box((0.16, 0.04, 0.12), M=M @ T((-w / 2 + 0.35, -d / 2 - 0.03, h + 0.1)), mat="paint_blue", bevel=0.008)
    p.cyl(0.012, 0.22, M=M @ T((-w / 2 + 0.35, -d / 2 - 0.08, h + 0.07)) @ R(90, "Y"), mat="metal_bare", segs=8, bevel=0)
    # tools hanging on the back board
    for i in range(9):
        x = -w / 2 + 0.2 + i * (w - 0.4) / 8
        ln = rnd.uniform(0.18, 0.36)
        p.box((0.03, 0.015, ln), M=M @ T((x, d / 2 - 0.04, h + 0.86 - ln / 2)) @ R(rnd.uniform(-4, 4), "Y"), mat=rnd.choice(["metal_bare", "metal_dark", "wood_dark"]), bevel=0.004)
        p.box((0.08, 0.02, 0.05), M=M @ T((x, d / 2 - 0.045, h + 0.86 - ln)), mat=rnd.choice(["metal_bare", "paint_red", "metal_dark"]), bevel=0.006)
    # clutter on top
    for i in range(7):
        x = rnd.uniform(-w / 2 + 0.7, w / 2 - 0.15)
        y = rnd.uniform(-d / 2 + 0.12, d / 2 - 0.15)
        k = rnd.random()
        if k < 0.4:
            p.box((rnd.uniform(0.1, 0.3), rnd.uniform(0.08, 0.2), rnd.uniform(0.04, 0.14)), M=M @ T((x, y, h + 0.04)) @ R(rnd.uniform(0, 90)),
                  mat=rnd.choice(["paint_red", "metal_dark", "plastic_gray", "paint_yellow", "canvas"]), bevel=0.006)
        else:
            rr = rnd.uniform(0.03, 0.06)
            p.cyl(rr, rnd.uniform(0.08, 0.2), M=M @ T((x, y, h + 0.07)), mat=rnd.choice(["metal_bare", "paint_green", "paint_orange"]), segs=12, bevel=0.004)
    _col(c, (w, d, h), M, h / 2)
