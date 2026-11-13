"""Vehicle building blocks: wheels and tyres, seats, steering wheels, lamps, ladders, exhaust stacks.
Vehicle frame: +Y forward, +X right, +Z up, origin on the ground under the vehicle centre."""
from __future__ import annotations

import math

from bl import *  # noqa: F401,F403
from mathutils import Matrix, Vector

T = Matrix.Translation


def R(deg, axis="Z"):
    return Matrix.Rotation(math.radians(deg), 4, axis)


AX = R(90, "Y")  # maps a lathe's local Z (spin axis) onto the vehicle's X (axle)


def tyre(P, r, w, rim_r, tread="ag", mat="tire", lugs=22, M=Matrix.Identity(4), sidewall=0.12):
    """Tyre around the X axis centred on the origin. tread: 'ag' (chevron lugs), 'road' (grooves), 'smooth'."""
    hw = w / 2
    sr = r - (0.045 if tread == "ag" else 0.012)
    prof = [(rim_r, -hw * 0.82), (rim_r + 0.02, -hw * 0.94), (rim_r + (sr - rim_r) * 0.45, -hw), (sr - 0.05, -hw * 0.97), (sr, -hw * 0.8),
            (sr, hw * 0.8), (sr - 0.05, hw * 0.97), (rim_r + (sr - rim_r) * 0.45, hw), (rim_r + 0.02, hw * 0.94), (rim_r, hw * 0.82)]
    P.lathe(prof, M=M @ AX, mat="rubber", segs=40, bevel=0, uv_mode="box")
    if tread == "ag":
        # chevron lugs: two bars per pitch, angled toward the centre line
        for i in range(lugs):
            a = math.tau * i / lugs
            for s in (-1, 1):
                Ml = M @ Matrix.Rotation(a + (0.5 * math.tau / lugs if s > 0 else 0), 4, "X") @ T((s * hw * 0.44, 0, sr + 0.012)) @ R(s * 32, "Z")
                P.box((hw * 1.0, 0.07, 0.065), M=Ml, mat="rubber", bevel=0.012)
    elif tread == "road":
        for k in (-0.5, 0.0, 0.5):
            P.tube(r + 0.001, sr - 0.004, hw * 0.34, M=M @ T((k * hw * 1.1, 0, 0)) @ AX, mat="rubber", segs=40, bevel=0.004)
    return P


def rim(P, rim_r, w, mat="paint_white", hub_mat="metal_steel", bolts=8, dish=0.06, M=Matrix.Identity(4), outer=1):
    """Steel rim + hub. `outer` = +1 if the visible face is on +X, -1 for -X."""
    hw = w / 2
    o = outer
    prof = [(rim_r, -hw * 0.8), (rim_r - 0.02, -hw * 0.82), (rim_r - 0.035, -hw * 0.5), (rim_r - 0.05, 0), (rim_r - 0.035, hw * 0.5), (rim_r - 0.02, hw * 0.82), (rim_r, hw * 0.8),
            (rim_r + 0.012, hw * 0.86), (rim_r + 0.012, -hw * 0.86)]
    P.lathe(prof, M=M @ AX, mat=mat, segs=32, closed=True, bevel=0)
    # dished centre disc with hand holes suggested by bolts and a hub cap
    disc = [(0.0, 0.0), (rim_r * 0.3, 0.0), (rim_r * 0.42, dish * 0.4), (rim_r - 0.06, dish), (rim_r - 0.05, dish - 0.02), (rim_r * 0.42, dish * 0.4 - 0.02), (rim_r * 0.3, -0.02), (0.0, -0.02)]
    P.lathe(disc, M=M @ T((o * (hw * 0.25), 0, 0)) @ AX @ (R(180, "X") if o < 0 else Matrix.Identity(4)), mat=mat, segs=32, bevel=0)
    P.cyl(rim_r * 0.26, 0.09, M=M @ T((o * (hw * 0.25 + 0.03), 0, 0)) @ AX, mat=hub_mat, segs=20, bevel=0.01)
    P.cyl(rim_r * 0.12, 0.06, M=M @ T((o * (hw * 0.25 + 0.09), 0, 0)) @ AX, mat=hub_mat, segs=14, bevel=0.01)
    for i in range(bolts):
        a = math.tau * i / bolts
        P.cyl(0.016, 0.03, M=M @ Matrix.Rotation(a, 4, "X") @ T((o * (hw * 0.25 + 0.085), 0, rim_r * 0.19)) @ AX, mat="metal_dark", segs=6, bevel=0)
    return P


def wheel_part(name, r, w, rim_r, tread="ag", rim_mat="paint_white", dual=False, gap=0.08, lugs=22, outer=1):
    """A wheel (or dual pair) as its own part with the origin at the axle centre."""
    P = Part(name)
    if not dual:
        tyre(P, r, w, rim_r, tread, lugs=lugs)
        rim(P, rim_r, w, rim_mat, outer=outer)
    else:
        off = (w + gap) / 2
        for s in (-1, 1):
            M = T((s * off, 0, 0))
            tyre(P, r, w, rim_r, tread, lugs=lugs, M=M)
            rim(P, rim_r, w, rim_mat, M=M, outer=outer)
        P.cyl(rim_r * 0.3, gap + w * 0.5, M=AX, mat="metal_dark", segs=16, bevel=0)
    return P


def seat(P, M, w=0.5, mat="seat_leather_dark", frame="metal_dark", back_h=0.62, base_h=0.32):
    """Bucket seat; origin on the floor under the seat, facing +Y."""
    P.box((w * 0.8, 0.4, base_h - 0.08), M=M @ T((0, 0, (base_h - 0.08) / 2)), mat=frame, bevel=0.01)
    P.box((w, 0.5, 0.12), M=M @ T((0, 0.02, base_h + 0.02)), mat=mat, bevel=0.04)
    P.box((w, 0.12, back_h), M=M @ T((0, -0.24, base_h + 0.06 + back_h / 2)) @ R(10, "X"), mat=mat, bevel=0.045)
    P.box((w * 0.5, 0.1, 0.2), M=M @ T((0, -0.31, base_h + back_h + 0.14)) @ R(10, "X"), mat=mat, bevel=0.04)
    for s in (-1, 1):
        P.box((0.06, 0.34, 0.1), M=M @ T((s * (w / 2 - 0.02), 0.0, base_h + 0.08)), mat=mat, bevel=0.03)


def steering_wheel(P, M, r=0.19, mat="plastic_black", col_len=0.35):
    """Wheel in the local XY plane facing -Y along the column axis (local Z points toward the driver)."""
    P.lathe([(r - 0.016, -0.016), (r + 0.016, -0.016), (r + 0.016, 0.016), (r - 0.016, 0.016)], M=M, mat=mat, segs=28, closed=True, bevel=0.008)
    for a in (90, 210, 330):
        P.box((0.035, r - 0.03, 0.02), M=M @ R(a, "Z") @ T((0, (r - 0.03) / 2 + 0.02, -0.01)), mat=mat, bevel=0.006)
    P.cyl(0.045, 0.05, M=M @ T((0, 0, -0.015)), mat=mat, segs=14, bevel=0.008)
    P.cyl(0.028, col_len, M=M @ T((0, 0, -col_len / 2 - 0.03)), mat=mat, segs=10, bevel=0)


def lamp(P, M, r=0.08, mat="glass", housing="metal_dark", lit=None, depth=0.07):
    """Round lamp facing +Y."""
    P.cyl(r, depth, M=M @ R(90, "X") @ T((0, 0, -depth / 2)), mat=housing, segs=16, bevel=0.006)
    P.cyl(r * 0.86, 0.012, M=M @ R(90, "X") @ T((0, 0, -0.001)), mat=lit or mat, segs=16, bevel=0)


def ladder(P, M, h, w=0.4, rungs=4, mat="metal_dark", lean=0.0):
    """Access ladder rising along local Z from the origin, facing -X (rungs along Y)."""
    for s in (-1, 1):
        P.box((0.03, 0.03, h), M=M @ T((0, s * w / 2, h / 2)) @ R(lean, "Y"), mat=mat, bevel=0.004)
    for i in range(rungs):
        z = h * (i + 0.5) / rungs
        P.box((0.1, w, 0.02), M=M @ T((0, 0, z)), mat="tread_plate", bevel=0.003)


def stack(P, M, h=1.2, r=0.06, mat="metal_dark", cap=True):
    """Exhaust / intake stack rising along local Z."""
    P.cyl(r * 1.5, h * 0.35, M=M @ T((0, 0, h * 0.175)), mat="metal_bare", segs=14, bevel=0.01)
    P.cyl(r, h, M=M @ T((0, 0, h / 2)), mat=mat, segs=12, bevel=0)
    if cap:
        P.cyl(r, 0.14, M=M @ T((0, r * 0.4, h + 0.04)) @ R(-50, "X"), mat=mat, segs=12, bevel=0)


def side_panel(P, pts, y_out, thick, mat, side=1, bevel=0.012, **kw):
    """Body panel from a 2D outline in the vehicle's side plane. pts are (y, z); extruded inward from x = side * y_out."""
    x0 = side * y_out if side < 0 else side * y_out - thick
    P.prism(pts, thick, plane="YZ", at=(x0, 0, 0), mat=mat, bevel=bevel, **kw)
