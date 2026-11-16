"""Endurance interiors (references 11-16), in the same coordinates as endurance.glb.

Frame (as the exterior): Blender +Y is the spin axis, the ring lies in the XZ plane, clock positions as seen from +Y.
Gravity inside is centrifugal, pointing away from the axis, so every room is built in a "room frame" whose +Z points
toward the axis (up) and whose origin sits on the floor:
    room_frame(theta, r_floor) = frame_at(theta, r_floor) @ RX(180)     X tangential, Y aft, Z up

  * Hub (r < 2.35 m, near weightless): tiled walls with rounded inset panels, handholds and ladder rails, strapped
    bags, the axial docking tunnels fore (Ranger 1) and aft (Ranger 2) behind sliding hatches with star ribs, the
    radial Lander ports at 12 and 6 o'clock, the spoke at 3 o'clock and a stores alcove at 9 (reference 12).
  * Spoke: a 2.4 m shaft with guide rails, an emergency ladder, distance stencils and a lift car to module 3.
  * Each of the 12 modules (sized by type, endurance.DIMS) has a corridor deck level with the ring tunnels
    (floor r = 25 m) and a main deck below it (floor r = 29 m) reached by a ship's stair:
      9 command (ref 14), 6 cryo-lab and sick bay (ref 13), 0 crew quarters and 3 mess / life support (refs 11, 15,
      16), 1 EVA suits, 5 and 11 stores, 7 laboratory and seed vault, 2 4 8 10 engine rooms.
  * Knuckle nodes and their tunnels make the ring one continuous walk; four nodes carry the ring airlocks.
Windows are cut exactly where the exterior has them (endurance.R_WIN_*), so the Earth and the stars wheel past them.
"""
import math
import os
import random
import sys

HERE = os.path.dirname(__file__)
sys.path.insert(0, os.path.join(HERE, "..", "lib"))
sys.path.insert(0, HERE)
from bl import *  # noqa: E402,F403
from fac import Fac, T, RX, RY, RZ  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402
from endurance import (clock, frame_at, dims, KINDS, NAMES, R_NODE, HUB_L,  # noqa: E402
                       R_WIN_MAIN, R_WIN_CMD)

R_UF, R_UC = 25.0, 21.9          # corridor deck floor / ceiling radius
R_LF, R_LC = 29.0, 25.35         # main deck floor / ceiling radius
UH, LH = R_UF - R_UC, R_LF - R_LC
RH = 2.35                        # hub inner radius
HUB_END = HUB_L / 2 - 0.05
SPOKE = 3                        # module the spoke lands in
SR = 1.22                        # spoke shaft inner radius
STAIR_W = 0.85
WALL_IN = 0.32                   # interior wall inset from the hull

HX, HY = 3.48, 3.48              # half extents of the current room (set per module)
rnd = random.Random(64)


def set_room(i):
    global HX, HY
    W, D, _ = dims(i)
    HX, HY = W / 2 - WALL_IN, D / 2 - WALL_IN


def room_frame(theta, r_floor):
    return frame_at(theta, r_floor) @ RX(180)


def RF(i, r_floor):
    return room_frame(clock(i), r_floor)


def P3(M, x, y, z):
    return (M @ Vector((x, y, z)))[:]


def rect(x0, y0, x1, y1):
    return [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]


WALL_ROT = {"fwd": RZ(180), "aft": Matrix.Identity(4), "port": RZ(90), "stbd": RZ(-90)}


def wf(M, side, along=0.0, off=0.0, z=0.0):
    """Frame on a room wall: local -Y into the room, +Y into the wall, X along the wall, Z up.
    fwd: wall at room Y = -HY; aft: Y = +HY; port: X = -HX; stbd: X = +HX."""
    pos = {"fwd": (0, -HY, 0), "aft": (0, HY, 0), "port": (-HX, 0, 0), "stbd": (HX, 0, 0)}[side]
    return M @ T(pos) @ WALL_ROT[side] @ T((along, -off, z))


# ===================================================================================================== primitives
def inner_cyl(P, r, z0, z1, M, mat, segs=32, a0=0.0, a1=360.0, skip=None, cells_z=1, flip=False):
    """Cylinder surface around local Z seen from inside (normals inward; flip: seen from outside).
    skip(a_deg, z) -> True leaves a cell out (openings)."""
    verts, faces, idx = [], [], {}
    n = segs
    zs = [z0 + (z1 - z0) * k / cells_z for k in range(cells_z + 1)]
    full = abs(a1 - a0 - 360) < 1e-6

    def v(i, k):
        key = (i % n if full else i, k)
        if key not in idx:
            a = math.radians(a0 + (a1 - a0) * key[0] / n)
            idx[key] = len(verts)
            verts.append((r * math.cos(a), r * math.sin(a), zs[k]))
        return idx[key]
    for i in range(n):
        for k in range(cells_z):
            am = a0 + (a1 - a0) * (i + 0.5) / n
            if skip and skip(am, (zs[k] + zs[k + 1]) / 2):
                continue
            f = (v(i, k), v(i, k + 1), v(i + 1, k + 1), v(i + 1, k))
            faces.append(f[::-1] if flip else f)
    if faces:
        P.mesh(verts, faces, mat=mat, M=M, recalc=False)


def disc_with_hole(P, r_out, r_in, M, mat, t=0.06, segs=40):
    """Flat ring in the local XZ plane, extruded along +Y by t."""
    outer = [(math.cos(a) * r_out, math.sin(a) * r_out) for a in [2 * math.pi * i / segs for i in range(segs)]]
    hole = [(math.cos(a) * r_in, math.sin(a) * r_in) for a in [2 * math.pi * i / 32 for i in range(32)]]
    P.prism(outer, t, plane="XZ", M=M, mat=mat, bevel=0, holes=[hole[::-1]])


def rrect(w, h, r, cx=0.0, cz=0.0, n=4):
    """Rounded rectangle outline (CCW) centred on (cx, cz)."""
    pts = []
    for qx, qz, a0 in ((1, 1, 0), (-1, 1, 90), (-1, -1, 180), (1, -1, 270)):
        ox, oz = cx + qx * (w / 2 - r), cz + qz * (h / 2 - r)
        for k in range(n + 1):
            a = math.radians(a0 + 90 * k / n)
            pts.append((ox + math.cos(a) * r, oz + math.sin(a) * r))
    return pts


def wall(P, C, M, x0, x1, z0, z1, holes=(), mat="padding_light", t=0.06, col=True):
    """Flat wall in the local XZ plane, room face at local y = 0, thickness toward +Y."""
    outline = rect(x0, z0, x1, z1)
    P.prism(outline, t, plane="XZ", M=M, mat=mat, bevel=0, holes=[h[::-1] for h in holes])
    if col:
        C.prism(outline, t + 0.1, plane="XZ", M=M, mat="concrete", bevel=0, holes=[h[::-1] for h in holes])


def slab_poly(P, C, M, outline, z, t, mat, holes=(), col=True):
    """Horizontal slab with its top at z."""
    P.prism(outline, t, plane="XY", M=M @ T((0, 0, z - t)), mat=mat, bevel=0, holes=[h[::-1] for h in holes])
    if col:
        C.prism(outline, t, plane="XY", M=M @ T((0, 0, z - t)), mat="concrete", bevel=0, holes=[h[::-1] for h in holes])


def deck_outline(stair_side):
    """Corridor-deck floor (= main-deck ceiling) outline with the notch the stair rises through."""
    a = HY - STAIR_W - 0.05
    if stair_side > 0:
        return [(-HX, -HY), (HX, -HY), (HX, HY), (1.55, HY), (1.55, a), (-1.55, a), (-1.55, HY), (-HX, HY)]
    return [(-HX, -HY), (-1.55, -HY), (-1.55, -a), (1.55, -a), (1.55, -HY), (HX, -HY), (HX, HY), (-HX, HY)]


# ===================================================================================================== furniture
class Kit:
    """Furniture and fittings of the ship (references 11-16). Pieces take a local frame M with Z up; wall pieces use
    the wall convention of wf() (-Y toward the room)."""

    def __init__(self, F):
        self.F = F

    D = property(lambda self: self.F.D)
    E = property(lambda self: self.F.E)
    C = property(lambda self: self.F.C)
    G = property(lambda self: self.F.G)

    # ------------------------------------------------------------------ lighting and ceiling
    def light_box(self, M, w=1.0, d=0.72, power=12.0, dist=7.0, room=None, warm=True):
        """Recessed light box (ref 14): moulded cream frame with grab handles round a glowing diffuser.
        M lies on the ceiling plane; local -Z points down into the room."""
        D, E = self.D, self.E
        f = 0.13
        D.box((w + 2 * f, d + 2 * f, 0.02), M=M @ T((0, 0, -0.01)), mat="plastic_beige", bevel=0)
        for sx in (1, -1):
            D.box((f, d + 2 * f, 0.11), M=M @ T((sx * (w / 2 + f / 2), 0, -0.055)), mat="plastic_beige", bevel=0.025)
            D.box((0.035, d * 0.8, 0.035), M=M @ T((sx * (w / 2 - 0.02), 0, -0.1)), mat="plastic_beige", bevel=0.01)
        for sy in (1, -1):
            D.box((w, f, 0.11), M=M @ T((0, sy * (d / 2 + f / 2), -0.055)), mat="plastic_beige", bevel=0.025)
            for k in (-1, 1):
                Mh = M @ T((k * w * 0.3, sy * (d / 2 + f * 0.55), -0.13))
                D.box((0.17, 0.035, 0.035), M=Mh, mat="plastic_beige", bevel=0.012)
                for e in (-1, 1):
                    D.box((0.03, 0.03, 0.06), M=Mh @ T((e * 0.07, 0, 0.04)), mat="plastic_beige", bevel=0.006)
        E.box((w, d, 0.02), M=M @ T((0, 0, -0.035)), mat="emit_warm" if warm else "emit_white", bevel=0)
        kw = {"room": room} if room else {}
        light(self.F.uid("end_l"), at=(M @ Vector((0, 0, -0.45)))[:], color=(1.0, 0.95, 0.85) if warm else (0.92, 0.97, 1.0),
              power=power, dist=dist, bake=power * 2.6, group="endurance_int", **kw)

    def cushion(self, M, w=0.85, d=0.55):
        """Blue quilted acoustic cushion under the ceiling (refs 11, 14)."""
        D = self.D
        D.box((w, d, 0.09), M=M @ T((0, 0, -0.17)), mat="padding_blue", bevel=0.035)
        D.box((0.02, d, 0.1), M=M @ T((0, 0, -0.17)), mat="padding_blue", bevel=0.008)
        for sx in (1, -1):
            D.cyl(0.012, 0.13, M=M @ T((sx * w * 0.35, 0, -0.065)), mat="metal_chrome", segs=6, bevel=0)

    def ceiling_device(self, M):
        """Ceiling-mounted instrument box on a short rail (ref 13)."""
        D = self.D
        D.box((0.06, 0.9, 0.05), M=M @ T((0, 0, -0.03)), mat="metal_dark", bevel=0.005)
        D.box((0.42, 0.3, 0.2), M=M @ T((0, 0.15, -0.17)) @ RX(-8), mat="plastic_white", bevel=0.02)
        D.box((0.3, 0.012, 0.12), M=M @ T((0, -0.006, -0.17)) @ RX(-8), mat="metal_dark", bevel=0)
        D.cyl(0.035, 0.08, M=M @ T((0.12, -0.02, -0.2)) @ RX(90), mat="glass_dark", segs=10, bevel=0)

    def conduit(self, M, L, mat="paint_blue", r=0.02):
        """Conduit run along local +X with clamps (refs 11, 14)."""
        self.D.pipe([(0, 0, 0), (L, 0, 0)], r, mat=mat, segs=8, M=M)
        for k in range(int(L / 0.9) + 1):
            self.D.box((0.05, 0.06, 0.05), M=M @ T((min(L, k * 0.9), 0, 0.02)), mat="metal_chrome", bevel=0.005)

    # ------------------------------------------------------------------ walls and structure
    def rail(self, M, L, mat="paint_blue", r=0.022, standoff=0.07):
        """Handrail along local +X from 0..L, standing off along -Y."""
        self.D.pipe([(0, -standoff, 0), (L, -standoff, 0)], r, mat=mat, segs=8, M=M)
        if standoff > 0.01:
            n = max(2, int(L / 0.8) + 1)
            for k in range(n):
                self.D.cyl(0.012, standoff, M=M @ T((L * k / (n - 1), -standoff / 2, 0)) @ RX(90), mat="metal_chrome", segs=6, bevel=0)

    def railing(self, M, L, h=1.0):
        """Free-standing guard rail along local +X (stair wells)."""
        self.D.pipe([(0, 0, h), (L, 0, h)], 0.024, mat="paint_blue", segs=8, M=M)
        self.D.pipe([(0, 0, h * 0.5), (L, 0, h * 0.5)], 0.016, mat="metal_chrome", segs=8, M=M)
        n = max(2, int(L / 1.0) + 1)
        for k in range(n):
            self.D.cyl(0.02, h, M=M @ T((L * k / (n - 1), 0, h / 2)), mat="metal_chrome", segs=6, bevel=0)
        self.D.box((L, 0.02, 0.1), M=M @ T((L / 2, 0, 0.05)), mat="paint_gray_dark", bevel=0)
        self.C.box((L, 0.06, h + 0.05), M=M @ T((L / 2, 0, (h + 0.05) / 2)), mat="concrete", bevel=0)

    def pillar(self, M, h, w=0.22, d=0.16):
        """Dark structural frame member against a wall (ref 11), with bolts."""
        self.D.box((w, d, h), M=M @ T((0, -d / 2, h / 2)), mat="paint_gray_dark", bevel=0.012)
        for z in (0.25, h / 2, h - 0.25):
            for sx in (-1, 1):
                self.D.cyl(0.012, 0.02, M=M @ T((sx * w * 0.3, -d - 0.006, z)) @ RX(90), mat="metal_chrome", segs=6, bevel=0)

    def rr_panel(self, M, w, h, inset="paint_gray_dark", frame="plastic_white"):
        """Rounded rectangular wall panel with a dark inset (ref 12). Local XZ plane, -Y toward the room."""
        outer = rrect(w, h, min(w, h) * 0.22, 0, 0)
        inner = rrect(w - 0.12, h - 0.12, min(w, h) * 0.18, 0, 0)
        self.D.prism(outer, 0.05, plane="XZ", M=M @ T((0, -0.05, 0)), mat=frame, bevel=0.012, holes=[inner[::-1]])
        self.D.prism(inner, 0.02, plane="XZ", M=M @ T((0, -0.015, 0)), mat=inset, bevel=0)

    def door_frame(self, M, w, h, depth=0.36, frame=0.17, r=0.34, ring_mat="padding_light"):
        """Padded rounded door surround (ref 15) with a dark rubber seal, blue grab bars and a hazard-striped sill;
        opening centred on M (local XZ plane, sill at z = 0)."""
        outer = rrect(w + 2 * frame, h + 2 * frame, r + frame, 0, h / 2)
        inner = rrect(w, h, r, 0, h / 2)
        self.D.prism(outer, depth, plane="XZ", M=M @ T((0, -depth * 0.5, 0)), mat=ring_mat, bevel=0.02, holes=[inner[::-1]])
        for s in (-1, 1):
            seal = rrect(w + 0.05, h + 0.05, r + 0.025, 0, h / 2)
            self.D.prism(seal, 0.03, plane="XZ", M=M @ T((0, s * depth * 0.5 - (0.03 if s > 0 else 0), 0)), mat="rubber", bevel=0, holes=[inner[::-1]])
            for sx in (1, -1):
                self.D.cyl(0.022, h * 0.5, M=M @ T((sx * (w / 2 + frame * 0.55), s * (depth * 0.5 + 0.06), h * 0.5)), mat="paint_blue", segs=8, bevel=0)
        for k in range(6):
            self.D.box((w / 6 - 0.02, depth, 0.008), M=M @ T((-w / 2 + (k + 0.5) * w / 6, 0, 0.004)),
                       mat="paint_yellow" if k % 2 == 0 else "paint_black", bevel=0)

    def stair(self, M, run, rise, steps, width=STAIR_W):
        """Steep ship's stair rising along local +X: foot at x = 0, top at x = run, z = rise."""
        D, C = self.D, self.C
        r, t = rise / steps, run / steps
        for i in range(steps):
            D.box((t + 0.05, width, 0.035), M=M @ T((t * (i + 0.5), 0, r * (i + 1) - 0.018)), mat="tread_plate", bevel=0.004)
            D.box((0.02, width, 0.03), M=M @ T((t * i + 0.012, 0, r * (i + 1) - 0.05)), mat="paint_yellow", bevel=0)
        ang = math.degrees(math.atan2(rise, run))
        hyp = math.hypot(run, rise)
        for s in (-1, 1):
            D.box((hyp + 0.12, 0.035, 0.24), M=M @ T((run / 2, s * (width / 2 + 0.018), rise / 2 - 0.06)) @ RY(-ang), mat="paint_gray_dark", bevel=0.004)
            D.box((hyp, 0.045, 0.045), M=M @ T((run / 2, s * (width / 2 + 0.03), rise / 2 + 0.95)) @ RY(-ang), mat="paint_blue", bevel=0.01)
            for k in range(0, steps + 1, 4):
                D.cyl(0.016, 0.95, M=M @ T((t * k, s * (width / 2 + 0.03), r * k + 0.47)), mat="metal_chrome", segs=6, bevel=0)
            C.box((hyp, 0.05, 1.0), M=M @ T((run / 2, s * (width / 2 + 0.03), rise / 2 + 0.5)) @ RY(-ang), mat="concrete", bevel=0)
        C.box((hyp, width, 0.1), M=M @ T((run / 2, 0, rise / 2 - 0.02)) @ RY(-ang), mat="concrete", bevel=0)

    def window_reveal(self, M, hole, depth=WALL_IN):
        """Beige lining of a window opening from the room wall (y = 0) to the hull (y = depth), with a sill."""
        (x0, z0), (x1, _), (_, z1), _ = hole
        D = self.D
        for z in (z0 - 0.015, z1 + 0.015):
            D.box((x1 - x0 + 0.06, depth, 0.03), M=M @ T(((x0 + x1) / 2, depth / 2, z)), mat="plastic_beige", bevel=0)
        for x in (x0 - 0.015, x1 + 0.015):
            D.box((0.03, depth, z1 - z0), M=M @ T((x, depth / 2, (z0 + z1) / 2)), mat="plastic_beige", bevel=0)

    def window_surround(self, M, holes):
        """Rounded beige frame round a cluster of small windows (ref 15)."""
        xs = [p[0] for h in holes for p in h]
        zs = [p[1] for h in holes for p in h]
        x0, x1, z0, z1 = min(xs) - 0.08, max(xs) + 0.08, min(zs) - 0.08, max(zs) + 0.08
        outer = rrect(x1 - x0 + 0.18, z1 - z0 + 0.18, 0.13, (x0 + x1) / 2, (z0 + z1) / 2)
        inner = rrect(x1 - x0, z1 - z0, 0.06, (x0 + x1) / 2, (z0 + z1) / 2)
        self.D.prism(outer, 0.05, plane="XZ", M=M @ T((0, -0.05, 0)), mat="plastic_beige", bevel=0.012, holes=[inner[::-1]])
        self.D.box((x1 - x0 + 0.1, 0.12, 0.04), M=M @ T(((x0 + x1) / 2, -0.06, z0 - 0.06)), mat="plastic_beige", bevel=0.01)

    # ------------------------------------------------------------------ equipment
    def bag(self, M, w=0.55, d=0.38, h=0.32, mat=None):
        """Soft white stowage bag with straps and a label (refs 11, 12, 14)."""
        mat = mat or rnd.choice(["cloth_white", "cloth_white", "canvas"])
        D = self.D
        D.box((w, d, h), M=M @ T((0, 0, h / 2)), mat=mat, bevel=min(w, d, h) * 0.3)
        for k in (-1, 1):
            D.box((0.035, d + 0.012, h + 0.012), M=M @ T((k * w * 0.28, 0, h / 2)), mat="fabric_dark", bevel=0.005)
        D.box((w * 0.36, 0.015, 0.06), M=M @ T((0, -d / 2 - 0.005, h * 0.66)), mat=rnd.choice(["fabric_orange", "paint_white", "fabric_orange"]), bevel=0.005)

    def net(self, M, w, h, cell=0.16):
        """Cargo net in the local XZ plane."""
        D = self.D
        for k in range(int(w / cell) + 1):
            for a in (12, -12):
                D.box((0.008, 0.008, h), M=M @ T((-w / 2 + k * cell, 0, h / 2)) @ RY(a), mat="fabric_dark", bevel=0)
        D.box((w, 0.02, 0.03), M=M @ T((0, 0, h)), mat="fabric_orange", bevel=0)

    def bag_wall(self, M, cols, rows, w=0.55, h=0.33, d=0.36, net=True):
        """Bags stacked against a wall, optionally behind a cargo net."""
        for i in range(cols):
            for j in range(rows):
                if rnd.random() < 0.1:
                    continue
                self.bag(M @ T(((i - (cols - 1) / 2) * (w + 0.03), -d / 2 - 0.02, j * (h + 0.02))) @ RZ(rnd.uniform(-3, 3)), w, d, h)
        if net:
            self.net(M @ T((0, -d - 0.06, 0)), cols * (w + 0.03), rows * (h + 0.02))
        self.C.box((cols * (w + 0.03), d, rows * (h + 0.02)), M=M @ T((0, -d / 2, rows * (h + 0.02) / 2)), mat="concrete", bevel=0)

    def crt(self, M, w=0.42, h=0.32, sid=None, body="plastic_beige"):
        """Boxy CRT display in a beige bezel (refs 11, 14); a live screen when sid is given."""
        self.D.box((w + 0.1, 0.16, h + 0.1), M=M @ T((0, 0.08, 0)), mat=body, bevel=0.015)
        self.D.box((w * 0.7, 0.12, h * 0.7), M=M @ T((0, 0.2, 0)), mat=body, bevel=0.02)
        if sid:
            self.F.screen(sid, M @ T((0, -0.002, 0)), w=w, h=h, bezel=0.01, depth=0.01, body="plastic_black")
        else:
            self.D.box((w, 0.01, h), M=M @ T((0, -0.003, 0)), mat="screen", bevel=0)
            self.E.box((w * 0.5, 0.004, 0.01), M=M @ T((-w * 0.15, -0.01, h * 0.2)), mat="emit_green", bevel=0)

    def switch_panel(self, M, w=0.5, h=0.35, rows=3, cols=6):
        """Grey panel of toggle switches with indicator lamps and a label strip."""
        D, E = self.D, self.E
        D.box((w, 0.03, h), M=M @ T((0, 0.015, 0)), mat="paint_gray", bevel=0.006)
        for i in range(cols):
            for j in range(rows):
                x = -w / 2 + w * (i + 0.5) / cols
                z = -h / 2 + h * (j + 0.5) / rows
                D.cyl(0.008, 0.035, M=M @ T((x, -0.02, z)) @ RX(90 + rnd.uniform(-25, 25)), mat="metal_chrome", segs=6, bevel=0)
                if rnd.random() < 0.25:
                    E.box((0.014, 0.006, 0.014), M=M @ T((x + 0.025, -0.004, z + 0.03)), mat=rnd.choice(["emit_red", "emit_green", "emit_amber"]), bevel=0)
        D.box((w * 0.8, 0.004, 0.025), M=M @ T((0, -0.002, h / 2 - 0.03)), mat="plastic_white", bevel=0)

    def latch_row(self, M, L, n=4):
        """Row of red latch handles along a shelf edge (ref 11)."""
        for k in range(n):
            x = -L / 2 + L * (k + 0.5) / n
            self.D.box((0.05, 0.05, 0.03), M=M @ T((x, -0.02, 0)), mat="metal_dark", bevel=0.006)
            self.D.cyl(0.018, 0.16, M=M @ T((x + 0.06, -0.05, -0.02)) @ RY(70), r2=0.008, mat="paint_red", segs=8, bevel=0)

    def console_bank(self, M, w=2.6, sid=None, n=4, cabinet="paint_blue"):
        """Console bank (ref 14): blue cabinets, beige desk, a tier of CRTs over switch panels. Front at y = 0,
        operator on -Y, backing onto the wall at y = +0.62."""
        D, C = self.D, self.C
        D.box((w, 0.62, 0.72), M=M @ T((0, 0.31, 0.36)), mat=cabinet, bevel=0.01)
        for k in range(int(w / 0.65)):
            x = -w / 2 + 0.33 + k * 0.65
            D.box((0.6, 0.012, 0.62), M=M @ T((x, -0.003, 0.36)), mat=cabinet, bevel=0.004)
            D.box((0.14, 0.02, 0.02), M=M @ T((x, -0.012, 0.6)), mat="metal_chrome", bevel=0.004)
        D.box((w + 0.04, 0.72, 0.035), M=M @ T((0, 0.26, 0.74)), mat="plastic_beige", bevel=0.006)
        D.box((w, 0.3, 1.25), M=M @ T((0, 0.47, 1.38)), mat="plastic_beige", bevel=0.01)
        cw = w / n
        for i in range(n):
            x = -w / 2 + cw * (i + 0.5)
            self.crt(M @ T((x, 0.24, 1.66)), w=cw * 0.6, h=0.3, sid=f"{sid}{i}" if sid else None)
            self.switch_panel(M @ T((x, 0.31, 1.18)), w=cw * 0.8, h=0.3)
            D.box((0.4, 0.15, 0.02), M=M @ T((x, 0.05, 0.77)), mat="plastic_black", bevel=0.004)
            self.E.box((0.18, 0.02, 0.006), M=M @ T((x, 0.18, 0.76)), mat=["emit_amber", "emit_green", "emit_cyan"][i % 3], bevel=0)
        self.latch_row(M @ T((0, -0.01, 0.7)), w, n=n * 2)
        C.box((w, 0.9, 2.0), M=M @ T((0, 0.45, 1.0)), mat="concrete", bevel=0)

    def flight_seat(self, M, mat="seat_leather_dark"):
        """Ribbed high-back crew seat with a four-point harness on a pedestal (refs 14, 16). Faces -Y."""
        D = self.D
        D.box((0.56, 0.5, 0.1), M=M @ T((0, 0, 0.5)), mat=mat, bevel=0.03)
        D.box((0.58, 0.14, 0.98), M=M @ T((0, 0.24, 1.0)) @ RX(-6), mat=mat, bevel=0.03)
        for k in range(7):
            D.box((0.52, 0.03, 0.05), M=M @ T((0, 0.165, 0.6 + k * 0.12)) @ RX(-6), mat="fabric_dark", bevel=0.01)
        for sx in (1, -1):
            D.box((0.05, 0.02, 0.62), M=M @ T((sx * 0.13, 0.16, 0.95)) @ RX(-6), mat="fabric_dark", bevel=0.004)
            D.box((0.06, 0.06, 0.25), M=M @ T((sx * 0.3, 0.0, 0.66)), mat="metal_dark", bevel=0.01)
        D.box((0.07, 0.03, 0.07), M=M @ T((0, -0.02, 0.75)), mat="metal_chrome", bevel=0.01)
        D.cyl(0.05, 0.45, M=M @ T((0, 0.05, 0.22)), mat="metal_dark", segs=12, bevel=0.005)
        D.box((0.5, 0.42, 0.04), M=M @ T((0, 0.05, 0.02)), mat="metal_dark", bevel=0.008)
        self.C.box((0.6, 0.55, 1.4), M=M @ T((0, 0.1, 0.7)), mat="concrete", bevel=0)

    def stool(self, M):
        self.D.cyl(0.18, 0.05, M=M @ T((0, 0, 0.6)), mat="seat_leather_dark", segs=16, bevel=0.015)
        self.D.cyl(0.025, 0.58, M=M @ T((0, 0, 0.3)), mat="metal_chrome", segs=8, bevel=0)
        self.D.cyl(0.16, 0.02, M=M @ T((0, 0, 0.01)), mat="metal_dark", segs=16, bevel=0)
        self.D.tube(0.16, 0.14, 0.015, M=M @ T((0, 0, 0.25)), mat="metal_chrome", segs=12, bevel=0)

    def drawers(self, M, cols=3, rows=4, w=0.3, h=0.2, d=0.45):
        """Stowage drawer bank with soft white pouches (ref 14). Front at y = 0, back toward +Y."""
        D = self.D
        D.box((cols * w + 0.06, d, rows * h + 0.06), M=M @ T((0, d / 2, (rows * h + 0.06) / 2)), mat="paint_gray", bevel=0.01)
        for i in range(cols):
            for j in range(rows):
                x = -cols * w / 2 + w * (i + 0.5)
                z = 0.03 + h * (j + 0.5)
                D.box((w - 0.03, 0.04, h - 0.03), M=M @ T((x, 0.0, z)), mat="cloth_white", bevel=0.02)
                D.box((0.06, 0.012, 0.012), M=M @ T((x, -0.022, z + h * 0.25)), mat="fabric_dark", bevel=0)
        self.C.box((cols * w, d, rows * h), M=M @ T((0, d / 2, rows * h / 2)), mat="concrete", bevel=0)

    def cabinet(self, M, w=1.2, d=0.55, h=1.9, mat="wood_furniture"):
        """Tall stowage cabinet in the warm laminate of reference 15. Front at y = 0."""
        D = self.D
        D.box((w, d, h), M=M @ T((0, d / 2, h / 2)), mat=mat, bevel=0.01)
        n = max(1, round(w / 0.4))
        for k in range(n):
            x = -w / 2 + w * (k + 0.5) / n
            D.box((w / n - 0.03, 0.015, h - 0.08), M=M @ T((x, -0.006, h / 2)), mat=mat, bevel=0.005)
            D.box((0.02, 0.03, 0.14), M=M @ T((x + w / n * 0.35, -0.02, h * 0.55)), mat="metal_chrome", bevel=0.004)
        self.C.box((w, d, h), M=M @ T((0, d / 2, h / 2)), mat="concrete", bevel=0)

    def fold_table(self, M, w=1.2, d=0.7, h=0.76):
        """White fold-down table on brackets (ref 11). Wall at y = 0, table toward -Y."""
        D = self.D
        D.box((w, d, 0.04), M=M @ T((0, -d / 2, h)), mat="plastic_white", bevel=0.012)
        for sx in (-1, 1):
            D.box((0.04, d * 0.8, 0.04), M=M @ T((sx * (w / 2 - 0.12), -d * 0.4, h - 0.3)) @ RX(-40), mat="plastic_white", bevel=0.008)
        D.box((w * 0.9, 0.04, 0.08), M=M @ T((0, -0.02, h - 0.05)), mat="metal_dark", bevel=0.006)
        self.C.box((w, d, 0.1), M=M @ T((0, -d / 2, h - 0.03)), mat="concrete", bevel=0)

    def table(self, M, w=1.6, d=0.9, h=0.76):
        D = self.D
        D.box((w, d, 0.04), M=M @ T((0, 0, h)), mat="plastic_white", bevel=0.012)
        D.box((w - 0.06, d - 0.06, 0.012), M=M @ T((0, 0, h + 0.022)), mat="plastic_beige", bevel=0.004)
        D.cyl(0.05, h, M=M @ T((0, 0, h / 2)), mat="metal_chrome", segs=12, bevel=0)
        D.cyl(0.3, 0.03, M=M @ T((0, 0, 0.015)), mat="metal_dark", segs=20, bevel=0)
        for sx in (1, -1):
            D.box((0.1, d * 0.5, 0.03), M=M @ T((sx * w * 0.3, 0, h + 0.04)), mat="fabric_dark", bevel=0.008)
        self.C.box((w, d, h), M=M @ T((0, 0, h / 2)), mat="concrete", bevel=0)

    def floor_plate(self, M, w=1.0, d=0.6, style=0):
        """Floor access plate (refs 11, 15): white with a blue or grey field, recessed handles and a round fitting."""
        D = self.D
        D.box((w, d, 0.012), M=M @ T((0, 0, 0.006)), mat="plastic_white", bevel=0.004)
        if style == 0:
            D.box((w * 0.38, d * 0.8, 0.004), M=M @ T((w * 0.24, 0, 0.014)), mat="paint_blue", bevel=0)
        elif style == 1:
            D.box((w * 0.5, d * 0.7, 0.004), M=M @ T((-w * 0.18, 0, 0.014)), mat="paint_gray", bevel=0)
        for sx in (1, -1):
            D.box((0.12, 0.05, 0.004), M=M @ T((sx * w * 0.36, -d * 0.32, 0.014)), mat="metal_dark", bevel=0)
        D.cyl(0.05, 0.004, M=M @ T((-w * 0.3, d * 0.18, 0.014)), mat="metal_dark", segs=12, bevel=0)

    def extinguisher(self, M):
        D = self.D
        D.box((0.16, 0.05, 0.5), M=M @ T((0, 0.0, 0.85)), mat="metal_dark", bevel=0.005)
        D.cyl(0.07, 0.42, M=M @ T((0, -0.09, 0.85)), mat="paint_red", segs=14, bevel=0.02)
        D.cyl(0.025, 0.08, M=M @ T((0, -0.09, 1.1)), mat="metal_dark", segs=8, bevel=0)

    def o2_box(self, M):
        """Emergency oxygen mask locker."""
        D = self.D
        D.box((0.42, 0.08, 0.3), M=M @ T((0, -0.04, 1.5)), mat="paint_yellow", bevel=0.01)
        D.box((0.36, 0.01, 0.24), M=M @ T((0, -0.085, 1.5)), mat="plastic_white", bevel=0)
        D.text("O2", size=0.08, M=M @ T((0, -0.092, 1.47)) @ RX(90), mat="paint_black", depth=0.002)

    def intercom(self, M):
        D, E = self.D, self.E
        D.box((0.16, 0.04, 0.24), M=M @ T((0, -0.02, 1.4)), mat="plastic_beige", bevel=0.008)
        for k in range(4):
            D.box((0.1, 0.006, 0.006), M=M @ T((0, -0.042, 1.47 - k * 0.018)), mat="metal_dark", bevel=0)
        for k in range(3):
            D.cyl(0.012, 0.01, M=M @ T((-0.04 + k * 0.04, -0.044, 1.33)) @ RX(90), mat="plastic_dark", segs=8, bevel=0)
        E.box((0.012, 0.004, 0.012), M=M @ T((0.05, -0.043, 1.5)), mat="emit_green", bevel=0)

    def vent(self, M, w=0.5, h=0.3):
        D = self.D
        D.box((w, 0.03, h), M=M @ T((0, -0.015, 0)), mat="paint_gray", bevel=0.006)
        for k in range(int(h / 0.04)):
            D.box((w - 0.05, 0.025, 0.012), M=M @ T((0, -0.03, -h / 2 + 0.03 + k * 0.04)) @ RX(25), mat="metal_dark", bevel=0)

    def stencil(self, M, text, size=0.09, mat="paint_black"):
        self.D.text(text, size=size, M=M @ T((0, -0.004, 0)) @ RX(90), mat=mat, depth=0.002)

    def sign(self, M, text, w=0.9, h=0.18):
        self.D.box((w, 0.02, h), M=M @ T((0, -0.01, 0)), mat="plastic_white", bevel=0.004)
        self.D.text(text, size=h * 0.42, M=M @ T((0, -0.022, -h * 0.17)) @ RX(90), mat="paint_black", depth=0.002)

    def bunk(self, M, L=2.0, w=0.8):
        """Sleep station: two stacked berths with privacy curtains, reading lamps and nets. Along local X, wall
        toward +Y."""
        D, E = self.D, self.E
        for z in (0.45, 1.45):
            D.box((L, w, 0.08), M=M @ T((0, 0, z)), mat="metal_dark", bevel=0.01)
            D.box((L - 0.06, w - 0.06, 0.12), M=M @ T((0, 0, z + 0.1)), mat="fabric_blue", bevel=0.04)
            D.box((0.5, 0.32, 0.1), M=M @ T((-L / 2 + 0.32, 0.12, z + 0.2)), mat="cloth_white", bevel=0.04)
            D.box((L * 0.45, w * 0.8, 0.05), M=M @ T((L * 0.18, 0, z + 0.18)), mat="cloth_navy", bevel=0.02)
            for k in range(6):
                D.box((0.05, 0.03, 0.62), M=M @ T((L * 0.02 + k * 0.17, -w / 2, z + 0.48)), mat="canvas", bevel=0.01)
            E.box((0.12, 0.04, 0.03), M=M @ T((-L / 2 + 0.2, w / 2 - 0.05, z + 0.62)), mat="emit_warm", bevel=0)
            self.net(M @ T((L * 0.25, w / 2 - 0.02, z + 0.25)), 0.8, 0.4)
        for sx in (1, -1):
            D.box((0.06, w, 2.3), M=M @ T((sx * (L / 2 + 0.03), 0, 1.15)), mat="paint_gray", bevel=0.01)
        D.box((L + 0.12, w, 0.06), M=M @ T((0, 0, 2.3)), mat="paint_gray", bevel=0.01)
        for k in range(4):
            D.box((0.3, 0.03, 0.03), M=M @ T((L / 2 - 0.1, -w / 2 - 0.02, 0.6 + k * 0.28)), mat="metal_chrome", bevel=0.005)
        self.C.box((L, w, 2.3), M=M @ T((0, 0.05, 1.15)), mat="concrete", bevel=0)

    def hygiene(self, M, w=1.1, d=1.0, h=2.2):
        """Hygiene cubicle: wipe-down walls, a vacuum hand basin, mirror and a privacy curtain. Front (curtain) at
        y = 0, back wall at y = +d."""
        D = self.D
        for sx in (1, -1):
            D.box((0.05, d, h), M=M @ T((sx * w / 2, d / 2, h / 2)), mat="plastic_white", bevel=0.01)
        D.box((w, 0.05, 0.06), M=M @ T((0, 0.02, h)), mat="metal_chrome", bevel=0)
        D.box((w * 0.5, 0.35, 0.18), M=M @ T((0, d - 0.2, 0.85)), mat="plastic_white", bevel=0.04)
        D.cyl(0.11, 0.04, M=M @ T((0, d - 0.2, 0.95)), mat="metal_chrome", segs=16, bevel=0)
        D.box((0.4, 0.01, 0.5), M=M @ T((0, d - 0.03, 1.45)), mat="metal_chrome", bevel=0)
        for k in range(7):
            D.box((0.13, 0.02, h - 0.2), M=M @ T((-w / 2 + 0.08 + k * 0.16, 0.0, (h - 0.2) / 2 + 0.05)) @ RZ(rnd.uniform(-12, 12)), mat="canvas", bevel=0.01)
        D.box((0.3, 0.12, 0.4), M=M @ T((-w / 2 + 0.25, d - 0.1, 1.5)), mat="plastic_beige", bevel=0.02)
        for sx in (1, -1):
            self.C.box((0.06, d, h), M=M @ T((sx * w / 2, d / 2, h / 2)), mat="concrete", bevel=0)

    def galley(self, M, w=2.4):
        """Galley counter: drawers below, food warmer, rehydration station, water dispenser, lockers above.
        Front at y = 0, wall at y = +0.65."""
        D, E = self.D, self.E
        D.box((w, 0.62, 0.86), M=M @ T((0, 0.31, 0.43)), mat="plastic_beige", bevel=0.01)
        for k in range(int(w / 0.4)):
            x = -w / 2 + 0.2 + k * 0.4
            for j in range(2):
                D.box((0.37, 0.012, 0.38), M=M @ T((x, -0.004, 0.22 + j * 0.42)), mat="plastic_beige", bevel=0.005)
                D.box((0.12, 0.02, 0.018), M=M @ T((x, -0.014, 0.36 + j * 0.42)), mat="metal_chrome", bevel=0.003)
        D.box((w + 0.04, 0.68, 0.04), M=M @ T((0, 0.3, 0.88)), mat="metal_steel", bevel=0.006)
        D.box((0.6, 0.45, 0.42), M=M @ T((-w / 2 + 0.45, 0.35, 1.11)), mat="metal_steel", bevel=0.02)
        D.box((0.5, 0.01, 0.3), M=M @ T((-w / 2 + 0.45, 0.12, 1.11)), mat="glass_dark", bevel=0)
        E.box((0.06, 0.006, 0.02), M=M @ T((-w / 2 + 0.75, 0.12, 1.28)), mat="emit_amber", bevel=0)
        D.box((0.35, 0.3, 0.55), M=M @ T((0.3, 0.45, 1.18)), mat="plastic_white", bevel=0.03)
        D.cyl(0.02, 0.1, M=M @ T((0.3, 0.27, 1.05)), mat="metal_chrome", segs=8, bevel=0)
        E.box((0.08, 0.006, 0.02), M=M @ T((0.3, 0.299, 1.35)), mat="emit_cyan", bevel=0)
        for k in range(int(w / 0.6)):
            D.box((0.58, 0.4, 0.55), M=M @ T((-w / 2 + 0.3 + k * 0.6, 0.45, 1.95)), mat="plastic_beige", bevel=0.01)
            D.box((0.1, 0.02, 0.02), M=M @ T((-w / 2 + 0.3 + k * 0.6, 0.24, 1.75)), mat="metal_chrome", bevel=0.003)
        self.C.box((w, 0.65, 0.9), M=M @ T((0, 0.32, 0.45)), mat="concrete", bevel=0)

    def recycler(self, M, w=1.4, h=2.1):
        """Air / water recycling rack: fan housings, filter cartridges, a water tank with a sight glass, pipework.
        Front at y = 0, wall at y = +0.7."""
        D, E = self.D, self.E
        D.box((w, 0.65, h), M=M @ T((0, 0.34, h / 2)), mat="paint_gray", bevel=0.01)
        for j in range(2):
            for i in range(2):
                Mf_ = M @ T((-w / 4 + i * w / 2, -0.01, 0.45 + j * 0.62))
                D.tube(0.22, 0.2, 0.05, M=Mf_ @ RX(90), mat="metal_dark", segs=20, bevel=0)
                for k in range(5):
                    D.box((0.4, 0.01, 0.02), M=Mf_ @ RY(36 * k), mat="metal_dark", bevel=0)
        for k in range(4):
            D.cyl(0.07, 0.42, M=M @ T((-w / 2 + 0.2 + k * (w - 0.4) / 3, -0.02, h - 0.38)), mat=["plastic_white", "paint_blue"][k % 2], segs=12, bevel=0.01)
        D.box((0.06, 0.01, 0.5), M=M @ T((w / 2 - 0.12, -0.005, 1.0)), mat="glass", bevel=0)
        E.box((0.04, 0.004, 0.3), M=M @ T((w / 2 - 0.12, 0.0, 0.93)), mat="emit_cyan", bevel=0)
        self.D.pipe([(-w / 2 + 0.1, -0.08, h - 0.1), (w / 2 - 0.1, -0.08, h - 0.1)], 0.03, mat="paint_blue", segs=10, M=M)
        self.C.box((w, 0.7, h), M=M @ T((0, 0.35, h / 2)), mat="concrete", bevel=0)

    def treadmill(self, M):
        """Exercise treadmill with harness rails (works in any gravity). Along local Y."""
        D = self.D
        D.box((0.7, 1.7, 0.18), M=M @ T((0, 0, 0.09)), mat="metal_dark", bevel=0.02)
        D.box((0.55, 1.5, 0.02), M=M @ T((0, 0, 0.19)), mat="rubber", bevel=0.005)
        for sx in (1, -1):
            D.cyl(0.025, 1.1, M=M @ T((sx * 0.33, -0.6, 0.72)), mat="metal_chrome", segs=8, bevel=0)
            D.cyl(0.02, 0.9, M=M @ T((sx * 0.33, -0.15, 1.27)) @ RX(90), mat="metal_chrome", segs=8, bevel=0)
        D.box((0.5, 0.06, 0.3), M=M @ T((0, -0.62, 1.3)) @ RX(-30), mat="plastic_dark", bevel=0.01)
        self.C.box((0.7, 1.7, 0.2), M=M @ T((0, 0, 0.1)), mat="concrete", bevel=0)

    def cryo_pod(self, M, band="padding_blue"):
        """Cryo pod (ref 13): white chamfered shell, quilted band, two round ports at the foot. Along local Y."""
        D = self.D
        L, W_ = 2.3, 1.0
        octo = [(-W_ / 2 + 0.12, 0), (W_ / 2 - 0.12, 0), (W_ / 2, 0.12), (W_ / 2, 0.55), (W_ / 2 - 0.18, 0.72), (-W_ / 2 + 0.18, 0.72), (-W_ / 2, 0.55), (-W_ / 2, 0.12)]
        D.prism(octo, L, plane="XZ", M=M @ T((0, -L / 2, 0.0)), mat="plastic_white", bevel=0.02)
        D.box((W_ + 0.04, L - 0.1, 0.16), M=M @ T((0, 0, 0.42)), mat=band, bevel=0.03)
        for z in (0.33, 0.52):
            D.box((W_ + 0.08, L + 0.02, 0.035), M=M @ T((0, 0, z)), mat="metal_dark", bevel=0.01)
        for sx in (-0.22, 0.22):
            D.cyl(0.12, 0.04, M=M @ T((sx, -L / 2 - 0.01, 0.2)) @ RX(90), mat="metal_steel", segs=20, bevel=0.01)
            D.cyl(0.08, 0.05, M=M @ T((sx, -L / 2 - 0.02, 0.2)) @ RX(90), mat="metal_dark", segs=16, bevel=0)
        for k in range(3):
            D.box((0.14, 0.2, 0.01), M=M @ T((0.1, -0.6 + k * 0.5, 0.725)), mat="glass_dark", bevel=0)
        D.cyl(0.08, 0.06, M=M @ T((-0.25, 0.75, 0.74)), mat="metal_steel", segs=14, bevel=0.01)
        D.box((0.12, 0.08, 0.04), M=M @ T((0.28, 0.75, 0.74)), mat="plastic_dark", bevel=0.01)
        self.E.box((0.12, 0.01, 0.05), M=M @ T((0.3, -L / 2 - 0.012, 0.42)), mat="emit_cyan", bevel=0)
        self.C.box((W_, L, 0.75), M=M @ T((0, 0, 0.375)), mat="concrete", bevel=0)

    def heavy_door(self, M, w=1.1, h=2.0):
        """Heavy pressure door with a porthole and a handwheel (ref 13), shut, in a bolted black frame. Wall face at
        y = 0."""
        D = self.D
        outer = rrect(w + 0.3, h + 0.3, 0.28, 0, h / 2)
        inner = rrect(w, h, 0.18, 0, h / 2)
        D.prism(outer, 0.08, plane="XZ", M=M @ T((0, -0.08, 0)), mat="paint_black", bevel=0.01, holes=[inner[::-1]])
        for k in range(14):
            a = 2 * math.pi * k / 14
            D.cyl(0.018, 0.02, M=M @ T((math.cos(a) * (w / 2 + 0.08), -0.09, h / 2 + math.sin(a) * (h / 2 + 0.06))) @ RX(90), mat="metal_chrome", segs=6, bevel=0)
        D.prism(inner, 0.08, plane="XZ", M=M @ T((0, -0.06, 0)), mat="metal_steel", bevel=0.02)
        D.tube(0.17, 0.12, 0.05, M=M @ T((0, -0.08, h * 0.7)) @ RX(90), mat="metal_bare", segs=24, bevel=0.005)
        self.G.cyl(0.12, 0.01, M=M @ T((0, -0.07, h * 0.7)) @ RX(90), mat="glass", segs=20, bevel=0)
        D.lathe([(0.15, -0.01), (0.17, 0.0), (0.15, 0.01)], M=M @ T((0.25, -0.12, h * 0.48)) @ RX(90), mat="metal_bare", segs=18, closed=True)
        D.box((0.4, 0.04, 0.05), M=M @ T((-0.33, -0.11, h * 0.48)), mat="metal_bare", bevel=0.01)

    def medical_unit(self, M):
        """Wall medical unit (ref 13): white cabinet, screen, supply drawers and a red cross."""
        D, E = self.D, self.E
        D.box((0.7, 0.3, 0.9), M=M @ T((0, -0.15, 1.35)), mat="plastic_white", bevel=0.02)
        D.box((0.34, 0.01, 0.24), M=M @ T((-0.12, -0.305, 1.6)), mat="screen", bevel=0)
        E.box((0.2, 0.004, 0.012), M=M @ T((-0.12, -0.31, 1.62)), mat="emit_green", bevel=0)
        for k in range(3):
            D.box((0.6, 0.01, 0.12), M=M @ T((0, -0.305, 1.05 + k * 0.14)), mat="plastic_beige", bevel=0.004)
        D.box((0.12, 0.006, 0.04), M=M @ T((0.22, -0.307, 1.62)), mat="paint_red", bevel=0)
        D.box((0.04, 0.006, 0.12), M=M @ T((0.22, -0.307, 1.62)), mat="paint_red", bevel=0)

    def med_bed(self, M):
        """Sick-bay bed with a monitor arm. Along local Y."""
        D, E = self.D, self.E
        D.box((0.8, 2.0, 0.1), M=M @ T((0, 0, 0.7)), mat="metal_steel", bevel=0.02)
        D.box((0.74, 1.9, 0.1), M=M @ T((0, 0, 0.8)), mat="cloth_white", bevel=0.04)
        D.box((0.6, 0.4, 0.12), M=M @ T((0, -0.75, 0.88)) @ RX(-15), mat="cloth_white", bevel=0.04)
        for sy in (-1, 1):
            D.box((0.7, 0.08, 0.65), M=M @ T((0, sy * 0.9, 0.33)), mat="metal_dark", bevel=0.02)
        D.cyl(0.025, 1.6, M=M @ T((0.5, -0.9, 0.8)), mat="metal_chrome", segs=8, bevel=0)
        D.box((0.6, 0.04, 0.04), M=M @ T((0.3, -0.9, 1.6)), mat="metal_chrome", bevel=0.005)
        D.box((0.36, 0.08, 0.26), M=M @ T((0.05, -0.9, 1.55)), mat="plastic_white", bevel=0.02)
        E.box((0.28, 0.01, 0.18), M=M @ T((0.05, -0.85, 1.55)), mat="emit_green", bevel=0)
        self.C.box((0.8, 2.0, 0.9), M=M @ T((0, 0, 0.45)), mat="concrete", bevel=0)

    def helmet(self, M, r=0.165):
        """EVA helmet: white hard shell, gold sun visor over the clear bubble, neck ring, twin lamps, camera."""
        D, E = self.D, self.E
        D.sphere(r, M=M @ T((0, 0.012, 0)), mat="suit_white", segs=20, rings=12)
        D.sphere(r * 0.96, M=M @ T((0, -0.045, -0.008)) @ Matrix.Diagonal((0.9, 0.72, 0.8, 1)), mat="visor_gold", segs=20, rings=12)
        D.tube(r * 0.98, r * 0.9, 0.03, M=M @ T((0, -0.01, r * 0.62)) @ RX(-18), mat="suit_gray", segs=20, bevel=0.004)
        D.tube(r * 0.82, r * 0.64, 0.05, M=M @ T((0, 0.0, -r * 0.92)), mat="metal_steel", segs=20, bevel=0.006)
        D.tube(r * 0.85, r * 0.78, 0.018, M=M @ T((0, 0.0, -r * 0.82)), mat="paint_blue", segs=20, bevel=0)
        for sx in (1, -1):
            Ml = M @ T((sx * r * 0.9, -0.02, r * 0.35)) @ RY(sx * 20)
            D.box((0.05, 0.09, 0.045), M=Ml, mat="plastic_dark", bevel=0.012)
            E.box((0.032, 0.006, 0.026), M=Ml @ T((0, -0.046, 0)), mat="emit_white", bevel=0)
            D.cyl(0.012, 0.03, M=M @ T((sx * r * 0.98, 0.01, 0.0)) @ RY(90), mat="metal_chrome", segs=8, bevel=0)
        D.box((0.03, 0.05, 0.03), M=M @ T((r * 0.62, -0.03, r * 0.72)), mat="plastic_dark", bevel=0.006)

    def suit(self, M):
        """EVA suit stowed on its rack, front to local -Y: hard upper torso with chest control module, life-support
        backpack and umbilicals, bearing rings and bellows at the joints, gloves with coloured wrist disconnects,
        boots, and the helmet with its gold visor."""
        D, E = self.D, self.E
        # rack: back board, yoke and foot plate
        D.box((0.56, 0.05, 2.0), M=M @ T((0, 0.36, 1.0)), mat="paint_gray_dark", bevel=0.01)
        D.box((0.6, 0.3, 0.04), M=M @ T((0, 0.2, 0.02)), mat="tread_plate", bevel=0.005)
        for sx in (1, -1):
            D.box((0.04, 0.22, 0.04), M=M @ T((sx * 0.16, 0.25, 1.52)), mat="metal_chrome", bevel=0.006)
        # boots
        for sx in (1, -1):
            x = sx * 0.11
            D.box((0.13, 0.3, 0.035), M=M @ T((x, -0.03, 0.018)), mat="rubber", bevel=0.012)
            D.box((0.12, 0.27, 0.1), M=M @ T((x, -0.03, 0.08)), mat="suit_white", bevel=0.04)
            D.box((0.125, 0.04, 0.03), M=M @ T((x, -0.15, 0.06)), mat="suit_gray", bevel=0.01)
            D.cyl(0.074, 0.12, M=M @ T((x, 0.0, 0.18)), mat="suit_white", segs=14, bevel=0.015)
            D.tube(0.08, 0.07, 0.03, M=M @ T((x, 0.0, 0.25)), mat="metal_steel", segs=14, bevel=0.004)
            # lower leg, knee bellows, thigh, hip bearing
            D.cyl(0.08, 0.24, r2=0.086, M=M @ T((x, 0.0, 0.38)), mat="suit_white", segs=14, bevel=0.01)
            for k in range(3):
                D.tube(0.092, 0.07, 0.022, M=M @ T((x, 0.0, 0.515 + k * 0.026)), mat="suit_gray", segs=14, bevel=0.008)
            D.cyl(0.092, 0.28, r2=0.1, M=M @ T((x, 0.0, 0.72)), mat="suit_white", segs=14, bevel=0.01)
            D.box((0.07, 0.012, 0.12), M=M @ T((x + sx * 0.03, -0.095, 0.72)), mat="suit_gray", bevel=0.004)   # thigh pocket
            D.tube(0.108, 0.09, 0.035, M=M @ T((x, 0.0, 0.875)), mat="metal_steel", segs=16, bevel=0.005)
        # pelvis (brief), waist bellows
        D.box((0.38, 0.25, 0.17), M=M @ T((0, 0.0, 0.95)), mat="suit_white", bevel=0.07)
        for k in range(3):
            D.tube(0.165, 0.12, 0.024, M=M @ T((0, 0.0, 1.05 + k * 0.03)) @ Matrix.Diagonal((1.15, 0.85, 1, 1)), mat="suit_gray", segs=20, bevel=0.008)
        # hard upper torso, chest control module, name tape
        D.sphere(0.2, M=M @ T((0, 0.0, 1.33)) @ Matrix.Diagonal((1.27, 0.85, 1.22, 1)), mat="suit_white", segs=22, rings=12)
        Mc = M @ T((0, -0.19, 1.22)) @ RX(12)
        D.box((0.25, 0.09, 0.13), M=Mc, mat="plastic_dark", bevel=0.015)
        D.box((0.09, 0.006, 0.035), M=Mc @ T((-0.06, -0.046, 0.03)), mat="screen", bevel=0)
        E.box((0.07, 0.004, 0.018), M=Mc @ T((-0.06, -0.05, 0.03)), mat="emit_green", bevel=0)
        for k, c in enumerate(("paint_red", "metal_chrome", "metal_chrome", "paint_yellow")):
            D.cyl(0.012, 0.025, M=Mc @ T((0.02 + (k % 2) * 0.05, -0.05, 0.035 - (k // 2) * 0.05)) @ RX(90), mat=c, segs=8, bevel=0.002)
        D.box((0.15, 0.006, 0.035), M=M @ T((0.1, -0.165, 1.44)) @ RZ(-8), mat="plastic_white", bevel=0)
        D.cyl(0.035, 0.006, M=M @ T((-0.12, -0.165, 1.45)) @ RX(90), mat="paint_blue", segs=14, bevel=0)   # mission patch
        # shoulders, arms, gloves; wrist disconnects red (left) and blue (right)
        for sx in (1, -1):
            D.tube(0.1, 0.075, 0.05, M=M @ T((sx * 0.265, 0.0, 1.45)) @ RY(90), mat="metal_steel", segs=16, bevel=0.006)
            Ma = M @ T((sx * 0.3, 0.0, 1.43)) @ RY(sx * 7)
            D.cyl(0.076, 0.26, M=Ma @ T((0, 0, -0.14)), mat="suit_white", segs=14, bevel=0.01)
            for k in range(2):
                D.tube(0.081, 0.06, 0.02, M=Ma @ T((0, 0, -0.29 - k * 0.024)), mat="suit_gray", segs=14, bevel=0.006)
            D.cyl(0.066, 0.22, r2=0.072, M=Ma @ T((0, -0.01, -0.44)), mat="suit_white", segs=14, bevel=0.01)
            D.tube(0.072, 0.055, 0.04, M=Ma @ T((0, -0.01, -0.565)), mat="paint_red" if sx < 0 else "paint_blue", segs=14, bevel=0.005)
            Mg = Ma @ T((0, -0.01, -0.64))
            D.box((0.055, 0.1, 0.11), M=Mg, mat="suit_gray", bevel=0.022)
            for f in range(4):
                D.box((0.022, 0.024, 0.07), M=Mg @ T((0, -0.035 + f * 0.024, -0.08)), mat="suit_gray", bevel=0.008)
            D.box((0.024, 0.026, 0.06), M=Mg @ T((-sx * 0.025, -0.05, -0.02)) @ RY(-sx * 25), mat="suit_gray", bevel=0.008)
            D.box((0.05, 0.08, 0.035), M=Ma @ T((sx * 0.02, -0.06, -0.42)), mat="plastic_dark", bevel=0.008)       # cuff checklist
        # life-support backpack with its top cap and side vents
        D.box((0.46, 0.2, 0.62), M=M @ T((0, 0.2, 1.3)), mat="suit_white", bevel=0.05)
        D.box((0.4, 0.17, 0.08), M=M @ T((0, 0.2, 1.64)), mat="suit_gray", bevel=0.03)
        for sx in (1, -1):
            for k in range(4):
                D.box((0.012, 0.13, 0.025), M=M @ T((sx * 0.232, 0.2, 1.12 + k * 0.05)), mat="plastic_dark", bevel=0.003)
            D.cyl(0.03, 0.05, M=M @ T((sx * 0.24, 0.12, 1.45)) @ RY(90), mat="metal_chrome", segs=10, bevel=0.005)
        # umbilicals from the backpack round to the chest module
        D.pipe([(0.25, 0.12, 1.45), (0.29, -0.02, 1.36), (0.2, -0.16, 1.24), (0.1, -0.2, 1.22)], 0.017, mat="plastic_dark", segs=8, M=M)
        D.pipe([(-0.25, 0.12, 1.45), (-0.29, -0.02, 1.34), (-0.2, -0.16, 1.22), (-0.1, -0.2, 1.2)], 0.017, mat="paint_blue", segs=8, M=M)
        self.helmet(M @ T((0, -0.01, 1.77)))
        self.C.box((0.62, 0.62, 1.88), M=M @ T((0, 0.08, 0.94)), mat="concrete", bevel=0)

    def gauge(self, M, r=0.07, face="plastic_white"):
        """Round dial gauge in a chrome bezel; face toward local -Y."""
        D = self.D
        D.cyl(r, 0.04, M=M @ T((0, -0.02, 0)) @ RX(90), mat="metal_chrome", segs=16, bevel=0.005)
        D.cyl(r * 0.86, 0.006, M=M @ T((0, -0.042, 0)) @ RX(90), mat=face, segs=16, bevel=0)
        D.box((0.006, 0.004, r * 0.72), M=M @ T((0, -0.047, 0)) @ RY(rnd.uniform(-70, 70)) @ T((0, 0, r * 0.3)), mat="paint_red", bevel=0)

    def cable_tray(self, M, L, w=0.3, n=6):
        """Cable tray along local +X hung below the ceiling plane M (local -Z down), with a bundle of cables."""
        D = self.D
        D.box((L, w, 0.012), M=M @ T((L / 2, 0, -0.17)), mat="metal_steel", bevel=0.002)
        for sy in (1, -1):
            D.box((L, 0.012, 0.06), M=M @ T((L / 2, sy * w / 2, -0.14)), mat="metal_steel", bevel=0.002)
        for k in range(int(L / 1.1) + 1):
            for sy in (1, -1):
                D.box((0.02, 0.02, 0.17), M=M @ T((min(L - 0.05, 0.05 + k * 1.1), sy * (w / 2 + 0.015), -0.085)), mat="metal_dark", bevel=0)
        cols = ["plastic_dark", "paint_orange", "paint_blue", "plastic_gray", "plastic_dark", "paint_red", "plastic_dark"]
        for j in range(n):
            y = -w / 2 + 0.04 + j * (w - 0.08) / max(1, n - 1)
            D.pipe([(0.0, y, -0.145), (L, y, -0.145)], 0.012 + 0.004 * (j % 2), mat=cols[j % len(cols)], segs=6, M=M)

    def elec_cabinet(self, M, w=0.8, d=0.5, h=2.0):
        """Electrical cabinet: louvred door, status lamps, handle and a hazard label. Front at y = 0."""
        D, E = self.D, self.E
        D.box((w, d, h), M=M @ T((0, d / 2, h / 2)), mat="paint_gray", bevel=0.01)
        D.box((w - 0.06, 0.015, h - 0.12), M=M @ T((0, -0.006, h / 2)), mat="paint_gray", bevel=0.005)
        for k in range(7):
            D.box((w * 0.5, 0.01, 0.018), M=M @ T((0, -0.016, 0.22 + k * 0.045)), mat="plastic_dark", bevel=0)
            D.box((w * 0.5, 0.01, 0.018), M=M @ T((0, -0.016, h - 0.75 + k * 0.045)), mat="plastic_dark", bevel=0)
        for k, c in enumerate(("emit_green", "emit_green", "emit_amber", "emit_red")):
            E.box((0.028, 0.006, 0.028), M=M @ T((-w * 0.3 + k * 0.07, -0.016, h - 0.2)), mat=c, bevel=0)
        D.box((0.03, 0.035, 0.22), M=M @ T((w * 0.38, -0.03, h * 0.55)), mat="metal_chrome", bevel=0.006)
        D.box((0.2, 0.004, 0.13), M=M @ T((-w * 0.15, -0.016, h * 0.55)), mat="paint_yellow", bevel=0)
        D.text("440 V", size=0.04, M=M @ T((-w * 0.15, -0.02, h * 0.55 - 0.02)) @ RX(90), mat="paint_black", depth=0.001)
        self.C.box((w, d, h), M=M @ T((0, d / 2, h / 2)), mat="concrete", bevel=0)

    def valve_body(self, M, r_pipe=0.11):
        """In-line valve on a vertical pipe (pipe axis local Z): body, bonnet and a handwheel facing local -Y."""
        D = self.D
        D.cyl(r_pipe + 0.06, 0.26, M=M, mat="paint_gray_dark", segs=16, bevel=0.02)
        for sz in (1, -1):
            D.cyl(r_pipe + 0.09, 0.035, M=M @ T((0, 0, sz * 0.15)), mat="metal_steel", segs=16, bevel=0.005)
        D.cyl(0.045, 0.22, M=M @ T((0, -r_pipe - 0.12, 0)) @ RX(90), mat="metal_steel", segs=10, bevel=0.005)
        self.valve_wheel(M @ T((0, -r_pipe - 0.25, 0)), r=0.13)

    def tool_board(self, M, w=1.4, h=0.9):
        """Pegboard with tools (EVA preparation)."""
        D = self.D
        D.box((w, 0.03, h), M=M @ T((0, -0.015, 0)), mat="paint_gray", bevel=0.005)
        for k in range(10):
            x = -w / 2 + 0.12 + k * (w - 0.24) / 9
            D.box((0.03, 0.03, rnd.uniform(0.15, 0.35)), M=M @ T((x, -0.045, rnd.uniform(-0.2, 0.2))) @ RY(rnd.uniform(-15, 15)),
                  mat=rnd.choice(["metal_chrome", "paint_red", "paint_yellow", "plastic_dark"]), bevel=0.005)

    def tank_h(self, M, r=0.55, L=2.6, mat="paint_white", band="paint_blue", label=None):
        """Horizontal propellant tank on saddles along local X."""
        D = self.D
        D.cyl(r, L - 2 * r * 0.6, M=M @ T((0, 0, r + 0.25)) @ RY(90), mat=mat, segs=24, bevel=0.01)
        for sx in (1, -1):
            D.sphere(r, M=M @ T((sx * (L / 2 - r * 0.6), 0, r + 0.25)) @ Matrix.Diagonal((0.6, 1, 1, 1)), mat=mat, segs=24, rings=10)
            D.box((0.16, r * 1.6, 0.4), M=M @ T((sx * L * 0.3, 0, 0.2)), mat="paint_gray_dark", bevel=0.02)
            D.cyl(0.05, 0.25, M=M @ T((sx * (L / 2 - 0.05), 0, r + 0.25)) @ RY(90), mat="metal_steel", segs=10, bevel=0)
        D.cyl(r + 0.01, 0.12, M=M @ T((0, 0, r + 0.25)) @ RY(90), mat=band, segs=24, bevel=0)
        if label:
            D.text(label, size=0.14, M=M @ T((0.4, -r - 0.012, r + 0.25)) @ RX(90), mat="paint_black", depth=0.002)
        self.C.box((L, 2 * r, 2 * r + 0.25), M=M @ T((0, 0, r + 0.12)), mat="concrete", bevel=0)

    def pump(self, M):
        D = self.D
        D.box((0.6, 0.45, 0.12), M=M @ T((0, 0, 0.06)), mat="paint_gray_dark", bevel=0.01)
        D.cyl(0.17, 0.5, M=M @ T((-0.08, 0, 0.32)) @ RY(90), mat="paint_blue", segs=16, bevel=0.01)
        for k in range(6):
            D.box((0.02, 0.36, 0.36), M=M @ T((-0.28 + k * 0.08, 0, 0.32)), mat="paint_blue", bevel=0.004)
        D.cyl(0.2, 0.12, M=M @ T((0.22, 0, 0.32)) @ RY(90), mat="metal_steel", segs=16, bevel=0.01)
        D.cyl(0.06, 0.4, M=M @ T((0.22, 0, 0.6)), mat="metal_steel", segs=10, bevel=0)
        self.C.box((0.6, 0.45, 0.5), M=M @ T((0, 0, 0.25)), mat="concrete", bevel=0)

    def valve_wheel(self, M, r=0.14):
        self.D.lathe([(r - 0.015, -0.012), (r, 0.0), (r - 0.015, 0.012)], M=M @ RX(90), mat="paint_red", segs=20, closed=True)
        for k in range(3):
            self.D.box((2 * r, 0.012, 0.012), M=M @ RY(60 * k), mat="paint_red", bevel=0)
        self.D.cyl(0.03, 0.12, M=M @ T((0, 0.06, 0)) @ RX(90), mat="metal_steel", segs=8, bevel=0)

    def dewar(self, M, r=0.3, h=1.1):
        """Cryogenic dewar (frozen embryo and seed stock) with a neck, lid, handles and a frost band."""
        D = self.D
        D.cyl(r, h, M=M @ T((0, 0, h / 2)), mat="metal_steel", segs=20, bevel=0.03)
        D.cyl(r * 0.45, 0.22, M=M @ T((0, 0, h + 0.1)), mat="metal_bare", segs=16, bevel=0.01)
        D.cyl(r * 0.55, 0.06, M=M @ T((0, 0, h + 0.23)), mat="plastic_blue", segs=16, bevel=0.01)
        D.cyl(r + 0.004, 0.18, M=M @ T((0, 0, h * 0.75)), mat="ice", segs=20, bevel=0)
        for sx in (1, -1):
            D.box((0.04, 0.12, 0.04), M=M @ T((sx * (r + 0.04), 0, h * 0.85)), mat="metal_chrome", bevel=0.005)
        self.C.cyl(r, h, M=M @ T((0, 0, h / 2)), mat="concrete", segs=10, bevel=0)


# ===================================================================================================== windows
def win_holes(i, deck):
    """Window openings of a module's fore and aft walls, in wall-local (x along wf(), height) coordinates. The
    exterior puts both faces' clusters at wall-local x = -0.3 W (the two faces mirror each other)."""
    kind = KINDS[i]
    W = dims(i)[0]
    if kind == "engine":
        return []
    xc = -W * 0.3
    if deck == "up":
        return [rect(xc + dx - 0.17, 1.4 - dz - 0.17, xc + dx + 0.17, 1.4 - dz + 0.17) for dx in (-0.22, 0.22) for dz in (-0.44, 0.0, 0.44)]
    if kind == "command":
        z = R_LF - R_WIN_CMD
        return [rect(x - 0.4, z - 0.27, x + 0.4, z + 0.27) for x in (-1.9, -0.95, 0.0, 0.95, 1.9)]
    z = R_LF - R_WIN_MAIN
    return [rect(xc + dx - 0.17, z + dz - 0.17, xc + dx + 0.17, z + dz + 0.17) for dx in (-0.22, 0.22) for dz in (-0.22, 0.22)]


# ===================================================================================================== rooms
def walls_of(F, K, M, h, holes=None, door=None, mat_lo="tile_white", mat_hi="padding_light", pillars=True):
    """Four walls of a rectangular room. holes: rectangles for the fore and aft walls (wall-local);
    door = (w, h): an opening centred in the port and starboard walls."""
    D, C = F.D, F.C
    holes = holes or []
    for side in ("fwd", "aft"):
        Mw = wf(M, side)
        wall(D, C, Mw, -HX, HX, 0, h, holes=holes, mat=mat_hi)
        if not any(hh[0][1] < 1.05 for hh in holes):
            D.box((2 * HX, 0.02, 1.05), M=Mw @ T((0, -0.012, 0.525)), mat=mat_lo, bevel=0)
        for hh in holes:
            K.window_reveal(Mw, hh)
        if 2 < len(holes) < 7:
            K.window_surround(Mw, holes)
        D.box((2 * HX, 0.05, 0.08), M=Mw @ T((0, -0.03, h - 0.04)), mat="plastic_beige", bevel=0.01)
        D.box((2 * HX, 0.03, 0.1), M=Mw @ T((0, -0.02, 0.05)), mat="rubber", bevel=0)
    for side in ("port", "stbd"):
        Mw = wf(M, side)
        if door:
            dw, dh = door
            wall(D, C, Mw, -HY, -dw / 2, 0, h, mat=mat_hi)
            wall(D, C, Mw, dw / 2, HY, 0, h, mat=mat_hi)
            wall(D, C, Mw, -dw / 2, dw / 2, dh, h, mat=mat_hi)
            for (x0, x1) in ((-HY, -dw / 2 - 0.22), (dw / 2 + 0.22, HY)):
                D.box((x1 - x0, 0.02, 1.05), M=Mw @ T(((x0 + x1) / 2, -0.012, 0.525)), mat=mat_lo, bevel=0)
                D.box((x1 - x0, 0.03, 0.1), M=Mw @ T(((x0 + x1) / 2, -0.02, 0.05)), mat="rubber", bevel=0)
        else:
            wall(D, C, Mw, -HY, HY, 0, h, mat=mat_hi)
            D.box((2 * HY, 0.02, 1.05), M=Mw @ T((0, -0.012, 0.525)), mat=mat_lo, bevel=0)
            D.box((2 * HY, 0.03, 0.1), M=Mw @ T((0, -0.02, 0.05)), mat="rubber", bevel=0)
        D.box((2 * HY, 0.05, 0.08), M=Mw @ T((0, -0.03, h - 0.04)), mat="plastic_beige", bevel=0.01)
    for sx in (1, -1):
        for sy in (1, -1):
            D.box((0.5, 0.06, h), M=M @ T((sx * (HX - 0.12), sy * (HY - 0.12), h / 2)) @ RZ(-45 * sx * sy), mat="plastic_beige", bevel=0.01)
    if pillars:
        for side in ("fwd", "aft"):
            for x in (-HX + 0.55, HX - 0.55):
                K.pillar(wf(M, side, along=x), h)


def ceiling(F, K, M, h, room, outline=None, boxes=((-1.4, 0.0), (1.4, 0.0)), power=12.0, mat="padding_light"):
    outline = outline or rect(-HX, -HY, HX, HY)
    slab_poly(F.D, F.C, M, outline, h + 0.1, 0.1, mat)
    Mc = M @ T((0, 0, h))
    for (x, y) in boxes:
        K.light_box(Mc @ T((x, y, 0)), power=power, room=room)
    xs = sorted(set(round(x, 2) for x, _ in boxes))
    for (x, y) in boxes:
        if x < max(xs):
            K.cushion(Mc @ T((x + (xs[1] - xs[0]) / 2 if len(xs) > 1 else x, y, 0)))
    for sx in (1, -1):
        K.conduit(Mc @ T((sx * (HX - 0.45), -HY + 0.35, -0.06)) @ RZ(90), 2 * HY - 0.7)


def vault(F, K, M, h0, h1, room, ss, power=13.0):
    """Barrel-vaulted ceiling along Y (ref 14): rises from h0 at the side walls to h1 on the centre line, with light
    boxes and cushions following the curve. It stops short of the stair well, which keeps the flat ceiling."""
    D, C = F.D, F.C
    n = 14
    R = (HX ** 2 + (h1 - h0) ** 2) / (2 * (h1 - h0))
    zc = h1 - R
    pts = [(-HX + 2 * HX * k / n, zc + math.sqrt(max(0.0, R * R - (-HX + 2 * HX * k / n) ** 2))) for k in range(n + 1)]
    a = HY - STAIR_W - 0.05
    y0, y1 = (-HY, a) if ss > 0 else (-a, HY)
    verts, faces = [], []
    for (x, z) in pts:
        verts += [(x, y0, z), (x, y1, z)]
    for k in range(n):
        p, q = 2 * k, 2 * k + 2
        faces.append((p, p + 1, q + 1, q))
    D.mesh(verts, faces, mat="tile_white", M=M, recalc=False)
    C.mesh(verts, faces, mat="concrete", M=M, recalc=False)
    # the vault's end above the stair well, up to the flat ceiling
    ye = y1 if ss > 0 else y0
    gable = [(x, ye, z) for (x, z) in pts] + [(HX, ye, LH), (-HX, ye, LH)]
    order = list(range(len(gable)))
    D.mesh(gable, [order], mat="tile_white", M=M, recalc=False)
    D.mesh(gable, [order[::-1]], mat="tile_white", M=M, recalc=False)
    for k, x in enumerate((-HX * 0.62, 0.0, HX * 0.62)):
        z = zc + math.sqrt(R * R - x * x)
        tilt = math.degrees(math.asin(x / R))
        for y in ((y0 + y1) / 2 - (y1 - y0) * 0.27, (y0 + y1) / 2 + (y1 - y0) * 0.27):
            K.light_box(M @ T((x, y, z)) @ RY(tilt), w=1.15 if k == 1 else 0.95, d=1.0, power=power, room=room)
        if k < 2:
            xm = x + HX * 0.31
            zm = zc + math.sqrt(R * R - xm * xm)
            for y in ((y0 + y1) / 2 - (y1 - y0) * 0.27, (y0 + y1) / 2 + (y1 - y0) * 0.27):
                K.cushion(M @ T((xm, y, zm)) @ RY(math.degrees(math.asin(xm / R))), w=0.7, d=0.95)
    for x in (-HX * 0.31, HX * 0.31):
        z = zc + math.sqrt(R * R - x * x)
        K.conduit(M @ T((x, y0 + 0.3, z - 0.06)) @ RZ(90), y1 - y0 - 0.6)
    slab_poly(D, C, M, deck_outline(ss), LH + 0.1, 0.1, "padding_gray")


def stair_side(i):
    return -1 if i == SPOKE else 1


def pod_xs():
    return [-HX + 0.83, -HX * 0.27, HX * 0.27, HX - 0.83]


def floor_holes(kind):
    if kind == "cryo":
        return [rect(x - 0.62, -0.55 - 1.32, x + 0.62, -0.55 + 1.32) for x in pod_xs()]
    return []


def module_rooms(F, K, i):
    kind = KINDS[i]
    room = f"m{i}"
    set_room(i)
    F.section(room)
    D, E, C = F.D, F.E, F.C
    Mu, Ml = RF(i, R_UF), RF(i, R_LF)
    ss = stair_side(i)
    a = HY - STAIR_W - 0.05
    yr = a if ss > 0 else -a                         # edge of the stair well on the corridor deck
    ywall = HY if ss > 0 else -HY
    ys = (yr + ywall) / 2                            # stair centre line
    # ================================================================ corridor deck
    slab_poly(D, C, Mu, deck_outline(ss), 0.0, 0.14, "deck_grid")
    for k, x in enumerate((-HX * 0.55, 0.0, HX * 0.55)):
        K.floor_plate(Mu @ T((x, -0.35 * ss, 0)), w=1.05, d=0.62, style=k % 3)
    walls_of(F, K, Mu, UH, holes=win_holes(i, "up"), door=(1.72, 2.02))
    for side in ("port", "stbd"):
        K.door_frame(wf(Mu, side), 1.72, 2.02)
    ceiling(F, K, Mu, UH, room, boxes=((-1.45, -0.6 * ss), (1.45, -0.6 * ss)), power=10.0)
    K.railing(Mu @ T((-1.55, yr, 0)), 3.1)
    K.railing(Mu @ T((-1.55, min(yr, ywall), 0)) @ RZ(90), abs(ywall - yr) - 0.02)
    K.stair(Ml @ T((-1.5, ys, 0)), 3.0, R_LF - R_UF, 20)
    free = "fwd" if ss > 0 else "aft"                # the wall away from the stair well
    if i == SPOKE:
        spoke_landing(F, K, Mu)
    Mw = wf(Mu, free)
    if not win_holes(i, "up"):
        K.bag_wall(Mw @ T((-HX * 0.45, 0, 0.05)), 2, 3, w=0.5, h=0.3)
        K.bag_wall(Mw @ T((HX * 0.45, 0, 0.05)), 2, 3, w=0.5, h=0.3)
    else:
        K.switch_panel(Mw @ T((HX * 0.25, -0.05, 1.45)), w=0.8, h=0.42, rows=4, cols=10)
        K.crt(Mw @ T((HX * 0.62, -0.08, 1.5)), w=0.36, h=0.27)
        K.bag_wall(Mw @ T((HX * 0.4, 0, 0.05)), 2, 2, w=0.5, h=0.3, net=False)
    Mo = wf(Mu, "aft" if ss > 0 else "fwd")
    K.extinguisher(Mo @ T((HX - 0.9, 0, 0)))
    K.o2_box(Mo @ T((HX - 1.45, 0, 0)))
    for side in ("port", "stbd"):
        K.intercom(wf(Mu, side, along=1.35 * (1 if side == "stbd" else -1)))
    K.sign(wf(Mu, "stbd", along=-1.45, off=0.04, z=2.2), NAMES[i].upper(), w=1.25, h=0.17)
    K.vent(wf(Mu, "port", along=-1.4, z=2.55), w=0.6, h=0.25)
    # ================================================================ main deck
    slab_poly(D, C, Ml, rect(-HX, -HY, HX, HY), 0.0, 0.14, "tile_floor" if kind == "cryo" else "deck_grid", holes=floor_holes(kind))
    walls_of(F, K, Ml, LH, holes=win_holes(i, "main"), mat_hi="tile_white" if kind in ("cryo", "command") else "padding_light",
             mat_lo="padding_gray" if kind == "engine" else "tile_white")
    if kind == "command":
        vault(F, K, Ml, 2.95, 3.55, room, ss)
    else:
        ceiling(F, K, Ml, LH, room, outline=deck_outline(ss), boxes=((-1.5, -0.7 * ss), (0.0, -0.7 * ss), (1.5, -0.7 * ss)), power=12.0)
    {"command": command_deck, "cryo": cryo_lab, "habitat": habitat, "pod": pod_room, "engine": engine_room}[kind](F, K, Ml, i, ss)
    marker("nav", f"m{i}u", at=P3(Mu, 0, -1.2 * ss if i != SPOKE else 2.4, 0.05), links=f"m{i}st")
    marker("nav", f"m{i}st", at=P3(Mu, 2.0, ys, 0.05), links=f"m{i}sb")
    marker("nav", f"m{i}sb", at=P3(Ml, -2.1, ys, 0.05), links=f"m{i}l")
    marker("nav", f"m{i}l", at=P3(Ml, 0, -0.6 * ss, 0.05), links="")
    marker("room", room, at=P3(Ml, 0, 0, 1.5), label=NAMES[i], kind_name=kind, clock=i)


def command_deck(F, K, M, i, ss):
    """Command module (ref 14): flight console beneath the forward windows with two crew seats, the main console bank
    on the starboard wall (ship systems, rotation control, docking assignments), the planetary display and stowage to
    port, and a chart table in the middle of the deck."""
    D, E, C = F.D, F.E, F.C
    Mf = wf(M, "fwd")
    cw = min(4.6, 2 * HX - 1.2)
    D.box((cw, 0.7, 0.74), M=Mf @ T((0, -0.38, 0.37)), mat="paint_blue", bevel=0.01)
    for k in range(int(cw / 0.6)):
        D.box((0.56, 0.012, 0.6), M=Mf @ T((-cw / 2 + 0.3 + k * 0.6, -0.735, 0.38)), mat="paint_blue", bevel=0.004)
    D.box((cw + 0.1, 0.78, 0.04), M=Mf @ T((0, -0.42, 0.76)), mat="plastic_beige", bevel=0.006)
    for k, x in enumerate((-1.55, 0.0, 1.55)):
        F.screen(f"cmd_flt{k}", Mf @ T((x, -0.48, 0.9)) @ RX(40), w=0.48, h=0.3, depth=0.03, body="plastic_beige")
        K.switch_panel(Mf @ T((x + (0.6 if k < 2 else -0.6), -0.58, 0.83)) @ RX(70), w=0.36, h=0.28, rows=3, cols=5)
    C.box((cw + 0.1, 0.8, 0.8), M=Mf @ T((0, -0.4, 0.4)), mat="concrete", bevel=0)
    for x in (-1.425, -0.475, 0.475, 1.425):
        K.switch_panel(Mf @ T((x, -0.03, 2.05)), w=0.36, h=0.3, rows=3, cols=4)
    for x in (-0.8, 0.8):
        Ms = M @ T((x, -HY + 1.55, 0))
        K.flight_seat(Ms)
        # seat frame as the engine expects it (local +Y forward, +Z up): the room frame turned to face the console
        e = (Ms.to_3x3() @ RZ(180).to_3x3()).to_euler("XYZ")
        marker("seat", f"cmd_{'l' if x < 0 else 'r'}", at=P3(Ms, 0, 0, 0.55), rot=tuple(math.degrees(a) for a in e), eye=0.74, label="Command seat")
    marker("terminal", "nav", at=P3(Mf, 0, -0.55, 1.0), label="Navigation computer")
    Mst = wf(M, "stbd", along=0.2, off=0.62)
    K.console_bank(Mst, w=min(3.6, 2 * HY - 1.6), sid="cmd_main", n=5)
    marker("terminal", "rotation", at=P3(Mst, -0.9, -0.4, 1.0), label="Ship systems · rotation control")
    marker("terminal", "docking", at=P3(Mst, 0.9, -0.4, 1.0), label="Docking assignments · vehicles")
    for x in (-0.9, 0.9):
        K.stool(Mst @ T((x, -0.75, 0)))
    Mp = wf(M, "port")
    F.screen("cmd_map", Mp @ T((0.35, -0.06, 1.75)), w=1.3, h=0.75, depth=0.05)
    K.switch_panel(Mp @ T((0.35, -0.04, 1.05)), w=1.25, h=0.42, rows=3, cols=12)
    marker("terminal", "crew", at=P3(Mp, 0.35, -0.45, 1.35), label="Mission planning · crew · cryo")
    K.drawers(Mp @ T((-HY + 0.75, -0.47, 0.0)), cols=3, rows=5)
    K.bag_wall(Mp @ T((HY - 0.75, 0, 0.0)), 2, 4, w=0.45, h=0.3)
    K.table(M @ T((0.0, 0.35, 0)), w=1.4, d=0.9, h=0.9)
    F.screen("cmd_chart", M @ T((0.0, 0.35, 0.93)) @ RX(-90), w=1.1, h=0.7, depth=0.005, body="plastic_black")
    for x in (-HX + 0.9, HX - 0.9):
        K.floor_plate(M @ T((x, 0.35, 0)), w=1.0, d=0.6)


def cryo_lab(F, K, M, i, ss):
    """Cryo-lab and sick bay (ref 13): white tiles, four hibernation pods in floor pits, columns with conduit, the cryo
    control wall, the sick-bay bed with its medical units, ceiling instruments and a heavy pressure door."""
    D, E, C = F.D, F.E, F.C
    for k, x in enumerate(pod_xs()):
        Mp = M @ T((x, -0.55, -0.32))
        for s in (-1, 1):
            D.box((0.06, 2.64, 0.36), M=M @ T((x + s * 0.65, -0.55, -0.18)), mat="tile_white", bevel=0.004)
            D.box((1.3, 0.06, 0.36), M=M @ T((x, -0.55 + s * 1.35, -0.18)), mat="tile_white", bevel=0.004)
            C.box((0.06, 2.64, 0.36), M=M @ T((x + s * 0.65, -0.55, -0.18)), mat="concrete", bevel=0)
            C.box((1.3, 0.06, 0.36), M=M @ T((x, -0.55 + s * 1.35, -0.18)), mat="concrete", bevel=0)
        D.box((1.24, 2.64, 0.04), M=M @ T((x, -0.55, -0.34)), mat="metal_dark", bevel=0)
        C.box((1.24, 2.64, 0.06), M=M @ T((x, -0.55, -0.35)), mat="concrete", bevel=0)
        K.cryo_pod(Mp, band="padding_blue" if k % 2 else "fabric_red")
        marker("cryo", f"pod{k}", at=P3(Mp, 0, 0, 0.75), label="Hibernation pod")
        K.ceiling_device(M @ T((x, -0.55, LH)))
    for x in (-HX + 0.25, HX - 0.25):
        D.box((0.32, 0.32, LH), M=M @ T((x, -2.35, LH / 2)), mat="paint_gray", bevel=0.02)
        D.pipe([(x - math.copysign(0.2, x), -2.35, 0.1), (x - math.copysign(0.2, x), -2.35, LH - 0.1)], 0.025, mat="metal_dark", segs=8, M=M)
        C.box((0.32, 0.32, LH), M=M @ T((x, -2.35, LH / 2)), mat="concrete", bevel=0)
    Mw = wf(M, "port")
    K.switch_panel(Mw @ T((0.4, -0.03, 1.35)), w=0.9, h=0.6, rows=6, cols=8)
    F.screen("cryo_mon", Mw @ T((-0.65, -0.05, 1.45)), w=0.42, h=0.3, depth=0.04, body="plastic_beige")
    marker("terminal", "cryo", at=P3(Mw, 0.0, -0.45, 1.3), label="Cryogenic controls")
    Mw2 = wf(M, "stbd")
    K.medical_unit(Mw2 @ T((-0.9, 0, 0)))
    K.medical_unit(Mw2 @ T((0.0, 0, 0)))
    K.cabinet(Mw2 @ T((1.15, -0.45, 0)), w=0.9, d=0.45, h=2.0, mat="plastic_white")
    K.med_bed(M @ T((HX - 1.05, 1.3, 0)) @ RZ(90))
    marker("bed", "sickbay", at=P3(M, HX - 1.05, 1.3, 0.95), label="Sick bay")
    K.heavy_door(wf(M, "fwd" if ss > 0 else "aft", along=HX * 0.55))
    K.bag(wf(M, "port", along=HY - 0.5, off=0.3), w=0.45, d=0.3, h=0.35, mat="cloth_white")


def habitat(F, K, M, i, ss):
    """Habitat A (crew quarters) and Habitat B (mess, galley, air and water recycling, exercise)."""
    D, E, C = F.D, F.E, F.C
    front = "fwd" if ss > 0 else "aft"            # the wall away from the stair foot; windows at wall-local -0.3 W
    if i == 0:
        Mw = wf(M, front)
        K.bunk(Mw @ T((1.3, -0.42, 0)), L=2.0, w=0.8)
        K.cabinet(Mw @ T((-0.75, -0.5, 0)), w=1.2, d=0.5, h=1.95)
        K.fold_table(Mw @ T((-HX * 0.66, 0, 0)), w=0.9, d=0.55)
        Mp = wf(M, "port")
        K.bunk(Mp @ T((HY - 1.6, -0.42, 0)), L=2.0, w=0.8)
        K.hygiene(Mp @ T((-HY + 0.85, -1.0, 0)), w=1.1, d=1.0)
        K.fold_table(Mp @ T((-0.8, 0, 0)), w=0.9, d=0.55)
        Mst = wf(M, "stbd")
        D.box((1.2, 0.5, 0.04), M=Mst @ T((0.3, -0.25, 0.76)), mat="plastic_beige", bevel=0.006)
        D.box((1.2, 0.04, 0.7), M=Mst @ T((0.3, -0.02, 0.4)), mat="plastic_beige", bevel=0.006)
        K.crt(Mst @ T((0.3, -0.12, 1.2)), w=0.38, h=0.28, sid="hab0_ws")
        D.box((0.42, 0.15, 0.02), M=Mst @ T((0.3, -0.32, 0.79)), mat="plastic_black", bevel=0.004)
        K.switch_panel(Mst @ T((-0.75, -0.03, 1.4)), w=0.55, h=0.45)
        C.box((1.2, 0.5, 0.8), M=Mst @ T((0.3, -0.25, 0.4)), mat="concrete", bevel=0)
        K.flight_seat(Mst @ T((0.3, -0.95, 0)) @ RZ(180), mat="seat_leather")
        K.drawers(Mst @ T((-HY + 0.7, -0.47, 0)), cols=3, rows=4)
        marker("terminal", "hab0", at=P3(Mst, 0.3, -0.6, 1.0), label="Personal workstation")
        marker("bed", "quarters", at=P3(Mw, 1.3, -0.42, 0.6), label="Sleep station")
        for x in (-1.0, 1.0):
            K.floor_plate(M @ T((x, 0.2, 0)), w=1.0, d=0.6, style=0 if x < 0 else 2)
    else:
        K.galley(wf(M, front, along=0.5, off=0.65), w=2.6)
        K.recycler(wf(M, front, along=HX - 0.8, off=0.7), w=1.2)
        K.table(M @ T((-0.4, 0.3, 0)), w=1.8, d=0.9)
        for x in (-1.05, 0.25):
            for s in (-1, 1):
                K.stool(M @ T((x, 0.3 + s * 0.72, 0)))
        K.treadmill(M @ T((HX - 0.75, -0.3, 0)))
        K.recycler(wf(M, "port", along=-0.6, off=0.7), w=1.6)
        K.bag_wall(wf(M, "port", along=HY - 0.9), 2, 4, w=0.45, h=0.3)
        F.screen("hab3_info", wf(M, "stbd", along=0.4, off=0.04, z=1.55), w=0.7, h=0.42, depth=0.04)
        K.switch_panel(wf(M, "stbd", along=1.4, z=1.4), w=0.6, h=0.5, rows=4, cols=6)
        marker("terminal", "lifesupport", at=P3(wf(M, "stbd", along=0.4), 0.0, -0.5, 1.2), label="Air and water recycling")
        marker("galley", "mess", at=P3(wf(M, front, along=0.5), 0, -1.1, 1.0), label="Galley")
    K.bag_wall(wf(M, "stbd", along=-HY + 0.7 if i == 3 else HY - 0.7), 2, 3, w=0.45, h=0.3)


def pod_room(F, K, M, i, ss):
    """Landing pods (surface habitats in transit): 1 EVA suits, 5 and 11 stores, 7 laboratory and seed vault."""
    D, E, C = F.D, F.E, F.C
    front = "fwd" if ss > 0 else "aft"
    if i == 1:
        Mw = wf(M, "port", off=0.32)
        n = 4
        for k in range(n):
            x = -HY + 0.9 + k * (2 * HY - 1.8) / (n - 1)
            K.suit(Mw @ T((x, 0.0, 0.02)))
            marker("suit", f"suit{k}", at=P3(Mw, x, -0.5, 1.0), label="EVA suit")
        Mb = wf(M, "stbd", along=0.3, off=0.45)
        D.box((2.2, 0.6, 0.06), M=Mb @ T((0, 0, 0.9)), mat="metal_steel", bevel=0.01)
        for s in (-1, 1):
            D.box((0.06, 0.55, 0.88), M=Mb @ T((s * 1.05, 0, 0.44)), mat="paint_gray_dark", bevel=0.01)
        D.box((0.5, 0.3, 0.25), M=Mb @ T((-0.5, 0, 1.06)), mat="plastic_gray", bevel=0.03)
        K.helmet(Mb @ T((0.5, 0, 1.13)) @ RZ(160))
        C.box((2.2, 0.6, 0.95), M=Mb @ T((0, 0, 0.47)), mat="concrete", bevel=0)
        K.tool_board(wf(M, "stbd", along=0.3, z=1.65))
        for k in range(3):
            K.helmet(wf(M, front, along=-0.2 + k * 0.6, off=0.25, z=1.6) @ RZ(rnd.uniform(-20, 20)))
        D.box((2.0, 0.35, 0.04), M=wf(M, front, along=0.4, off=0.2, z=1.44), mat="metal_steel", bevel=0.005)
        marker("terminal", "eva", at=P3(Mb, 0, -0.6, 1.0), label="EVA preparation")
    elif i == 7:
        for s in (-1, 1):
            Mb = wf(M, "stbd" if s > 0 else "port", along=0.2 * s, off=0.45)
            D.box((3.0, 0.7, 0.05), M=Mb @ T((0, 0, 0.9)), mat="plastic_white", bevel=0.01)
            D.box((3.0, 0.66, 0.85), M=Mb @ T((0, 0.0, 0.43)), mat="paint_gray", bevel=0.01)
            for k in range(3):
                D.box((0.28, 0.3, 0.38), M=Mb @ T((-1.0 + k * 1.0, 0.05, 1.12)), mat=rnd.choice(["plastic_beige", "plastic_white", "paint_gray"]), bevel=0.02)
                D.cyl(0.04, 0.22, M=Mb @ T((-1.0 + k * 1.0, -0.12, 1.3)), mat="metal_dark", segs=10, bevel=0)
            C.box((3.0, 0.7, 0.95), M=Mb @ T((0, 0, 0.47)), mat="concrete", bevel=0)
        Mg = wf(M, front, along=1.65, off=0.45)
        D.box((1.4, 0.7, 1.9), M=Mg @ T((0, 0.0, 0.95)), mat="plastic_white", bevel=0.02)
        F.G.box((1.25, 0.02, 1.4), M=Mg @ T((0, -0.36, 1.05)), mat="glass", bevel=0)
        for z in (0.6, 1.05, 1.5):
            E.box((1.2, 0.5, 0.02), M=Mg @ T((0, 0.0, z + 0.3)), mat="emit_grow", bevel=0)
            D.box((1.2, 0.5, 0.12), M=Mg @ T((0, 0.0, z)), mat="foliage_dry", bevel=0.02)
        C.box((1.4, 0.7, 1.9), M=Mg @ T((0, 0, 0.95)), mat="concrete", bevel=0)
        for k in range(3):
            K.dewar(wf(M, front, along=-1.2 + k * 0.7, off=0.45))
        K.sign(wf(M, front, along=-0.5, off=0.02, z=2.1), "SEED VAULT", w=1.4, h=0.17)
        marker("terminal", "lab", at=P3(Mg, 0, -0.8, 1.2), label="Laboratory · samples and seed stock")
    else:
        for s in (-1, 1):
            Mw = wf(M, "stbd" if s > 0 else "port", along=0.25 * s, off=0.32)
            for k in range(2):
                Mk = Mw @ T((-0.88 + k * 1.76, 0, 0))
                for z in (0.05, 0.75, 1.45, 2.15):
                    D.box((1.6, 0.55, 0.04), M=Mk @ T((0, 0, z)), mat="metal_steel", bevel=0.005)
                    for j in range(2):
                        if rnd.random() < 0.85:
                            K.bag(Mk @ T((-0.4 + j * 0.8, 0, z + 0.02)), w=0.66, d=0.45, h=0.5 if z < 2 else 0.4)
                for sx in (-1, 1):
                    D.box((0.04, 0.55, 2.4), M=Mk @ T((sx * 0.8, 0, 1.2)), mat="paint_gray_dark", bevel=0.005)
                C.box((1.6, 0.55, 2.4), M=Mk @ T((0, 0, 1.2)), mat="concrete", bevel=0)
        if i == 11:
            for x in (-0.9, 0.9):
                F.tank(wf(M, front, along=x, off=0.75), r=0.55, h=2.2, mat="paint_white", band="paint_blue", label="H2O")
        else:
            for k in range(3):
                F.crate(wf(M, front, along=-1.0 + k * 1.0, off=0.6) @ RZ(rnd.uniform(-8, 8)), w=0.8, d=0.6, h=0.55)
                F.crate(wf(M, front, along=-1.0 + k * 1.0, off=0.6, z=0.55) @ RZ(rnd.uniform(-8, 8)), w=0.7, d=0.55, h=0.45)
        marker("stores", f"pod{i}", at=P3(M, 0, 0, 1.0), label="Pod stores")


def engine_room(F, K, M, i, ss):
    """Engine module: LH2 and LOX run tanks on saddles, turbopumps, the two feedlines rising to the ceiling and
    running aft into the thrust-structure bulkhead (the engine bells are on the other side), valves and gauges,
    electrical cabinets, ceiling cable trays and the engine control station."""
    D, E, C = F.D, F.E, F.C
    front = "fwd" if ss > 0 else "aft"
    n_eng = [2, 4, 8, 10].index(i) + 1
    ys = (-HY + 1.0, -HY + 2.3)
    for k, y in enumerate(ys):
        K.tank_h(M @ T((0.35, y, 0)), r=0.5, L=min(3.8, 2 * HX - 2.2), band="paint_orange" if k else "paint_blue", label="LOX" if k else "LH2")
        K.pump(M @ T((-HX + 0.65, y, 0)) @ RZ(180 * k))
        F.pipe([P3(M, -HX + 2.0, y, 0.75), P3(M, -HX + 1.0, y, 0.75), P3(M, -HX + 1.0, y, 0.35)], r=0.06, mat="paint_gray")
        # feedline: up from the pump discharge, along the ceiling, aft through the bulkhead
        x = -HX + (0.87 if k == 0 else 0.43)
        zf = LH - (0.75 if k == 0 else 0.98)
        col = "paint_blue" if k == 0 else "paint_orange"
        F.pipe([P3(M, x, y, 0.62), P3(M, x, y, zf), P3(M, x, HY + 0.12, zf)], r=0.11, mat="paint_white", flanges=False)
        for t in (0.25, 0.75):                         # colour bands identify the propellant
            D.cyl(0.115, 0.06, M=M @ T((x, y, 0.62 + (zf - 0.62) * t)), mat=col, segs=16, bevel=0)
            D.cyl(0.115, 0.06, M=M @ T((x, y + (HY - y) * t, zf)) @ RX(90), mat=col, segs=16, bevel=0)
        K.valve_body(M @ T((x, y, 1.45)) @ RZ(-90 if k == 0 else 90))
        K.gauge(M @ T((x, y, 1.95)) @ RZ(-90 if k == 0 else 90) @ T((0, -0.13, 0)), r=0.08)
        Mw = wf(M, "aft", along=x, z=zf)
        D.tube(0.26, 0.1, 0.08, M=Mw @ T((0, -0.04, 0)) @ RX(90), mat="metal_steel", segs=20, bevel=0.01)
        for b in range(8):
            D.cyl(0.015, 0.03, M=Mw @ T((0, -0.09, 0)) @ RY(45 * b) @ T((0, 0, 0.21)) @ RX(90), mat="metal_chrome", segs=6, bevel=0)
        K.stencil(Mw @ T((0, 0, -0.38)), "LH2 FEED" if k == 0 else "LOX FEED", size=0.06)
    F.pipe([P3(M, -HX + 0.3, -HY + 0.45, LH - 0.35), P3(M, HX - 0.3, -HY + 0.45, LH - 0.35)], r=0.09, mat="paint_orange")
    F.pipe([P3(M, -HX + 0.3, -HY + 0.75, LH - 0.35), P3(M, HX - 0.3, -HY + 0.75, LH - 0.35)], r=0.09, mat="paint_blue")
    # engine control station on the starboard wall
    Mst = wf(M, "stbd", along=0.6)
    K.console_bank(Mst @ T((0, -0.63, 0)), w=2.4, sid=f"eng{i}_", n=3, cabinet="paint_gray_dark")   # back against the wall
    F.screen(f"eng{i}", Mst @ T((0, -0.01, 2.4)), w=0.62, h=0.36, depth=0.04)
    K.stool(Mst @ T((0.4, -1.15, 0)))
    K.sign(Mst @ T((0, 0.0, 2.85)), f"ENGINE {n_eng} CONTROL", w=1.5, h=0.16)
    marker("terminal", f"eng{i}", at=P3(Mst, 0, -1.0, 1.2), label="Engine control")
    # port wall: electrical cabinets, gauge board, valves, extinguisher
    for k, a in enumerate((1.45, 2.3)):
        K.elec_cabinet(wf(M, "port", along=a, off=0.01), w=0.8, d=0.48, h=2.0)
    Mg = wf(M, "port", along=0.15, z=1.55)
    D.box((0.9, 0.03, 0.5), M=Mg @ T((0, -0.015, 0)), mat="paint_gray", bevel=0.006)
    for k in range(4):
        K.gauge(Mg @ T((-0.33 + k * 0.22, -0.03, 0.06)), r=0.075)
    for k in range(4):
        E.box((0.05, 0.006, 0.02), M=Mg @ T((-0.33 + k * 0.22, -0.035, -0.15)), mat="emit_green" if k != 2 else "emit_amber", bevel=0)
    K.stencil(Mg @ T((0, -0.03, 0.31)), "TANK PRESSURE", size=0.05)
    for z in (0.9, 1.3):
        K.valve_wheel(wf(M, "port", along=0.8, z=z))
    K.extinguisher(wf(M, "port", along=-0.6))
    # ceiling cable trays clear of the light boxes, and floor access plates
    for sx in (1, -1):
        K.cable_tray(M @ T((sx * 2.6, -HY + 0.9, LH)) @ RZ(90), 2 * HY - 1.4, w=0.3, n=6)
    for k, (x, y) in enumerate(((0.9, 0.4), (-0.9, 0.4), (0.0, 1.5))):
        K.floor_plate(M @ T((x, y, 0)), w=0.95, d=0.6, style=k % 3)
    K.stencil(wf(M, front, along=0.0, z=2.6), f"ENGINE {n_eng}", size=0.2)
    K.sign(wf(M, front, along=1.4, off=0.02, z=2.25), "CRYOGENIC PROPELLANT · NO NAKED FLAME", w=2.0, h=0.15)


def spoke_landing(F, K, Mu):
    """Lift landing in module 3's corridor deck: the shaft enclosure in the middle of the room, door aft."""
    D, C = F.D, F.C
    door = lambda a, z: 55 < a < 125 and z < 2.15  # noqa: E731
    inner_cyl(D, SR + 0.1, 0.0, UH, Mu, "padding_light", segs=28, skip=door, cells_z=3)
    inner_cyl(D, SR + 0.16, 0.0, UH, Mu, "plastic_beige", segs=28, skip=door, cells_z=3, flip=True)
    inner_cyl(C, SR + 0.13, 0.0, UH, Mu, "concrete", segs=20, skip=door, cells_z=3)
    K.door_frame(Mu @ T((0, SR + 0.13, 0)) @ RZ(180), 1.25, 2.1, depth=0.24, frame=0.12, r=0.25)
    marker("liftcall", "spoke_ring", at=P3(Mu, 0.95, SR + 0.35, 1.3), level="bottom", label="Call the spoke lift")
    K.sign(Mu @ T((0, SR + 0.2, 2.42)) @ RZ(180), "SPOKE TO HUB", w=1.0, h=0.15)
    marker("nav", "spoke_bot", at=P3(Mu, 0, 0, 0.05), links=f"m{SPOKE}u")


# ===================================================================================================== nodes and tunnels
def node_rooms(F, K, i):
    th = clock(i) + math.radians(15)
    F.section(f"n{i}")
    D, E, C = F.D, F.E, F.C
    M = room_frame(th, R_UF)
    zc = R_UF - R_NODE                                   # node axis height above its floor (1.0)
    rn = 1.55
    Minv = M.inverted().to_3x3()
    tunnels = []
    for d in (-1, 1):
        j = i if d < 0 else (i + 1) % 12
        F2 = frame_at(clock(i) + (0 if d < 0 else math.radians(30)), R_NODE)
        side = F2 @ Vector((d * dims(j)[0] / 2, 0, 0))     # frame +x points to decreasing clock angle: the near face
        a = frame_at(th, R_NODE) @ Vector((0, 0, 0))
        dv = (side - a).normalized()
        loc = Minv @ dv
        tunnels.append((side, a, dv, math.degrees(math.atan2(loc.z, loc.x))))
    Ma = M @ T((0, 0, zc)) @ RX(90)                      # cylinder along the node axis; angle 0 = room +X

    def skip(ang, z):
        return any(abs(((ang - at_) + 180) % 360 - 180) < 44 and abs(z) < 1.08 for (_, _, _, at_) in tunnels)
    inner_cyl(D, rn, -1.75, 1.75, Ma, "padding_light", segs=32, skip=skip, cells_z=7)
    inner_cyl(C, rn, -1.75, 1.75, Ma, "concrete", segs=24, skip=skip, cells_z=7)
    for s in (-1, 1):
        disc_with_hole(D, rn + 0.05, 0.74, M @ T((0, s * 1.75 - (0.06 if s < 0 else 0), zc)), "padding_gray", t=0.06)
        Mh = M @ T((0, s * 1.8, zc))
        D.cyl(0.76, 0.05, M=Mh @ RX(90), mat="metal_steel", segs=28, bevel=0.005)
        for k in range(10):
            D.box((0.025, 0.03, 0.64), M=Mh @ T((0, -s * 0.03, 0)) @ RY(18 + 36 * k) @ T((0, 0, 0.34)), mat="metal_bare", bevel=0.003)
        D.cyl(0.08, 0.06, M=Mh @ T((0, -s * 0.04, 0)) @ RX(90), mat="metal_chrome", segs=12, bevel=0.01)
        C.cyl(rn, 0.1, M=Mh @ RX(90), mat="concrete", segs=16, bevel=0)
        for k in range(8):
            D.box((0.06, 0.04, 0.06), M=Mh @ RY(22.5 + 45 * k) @ T((0, -s * 0.04, 0.8)), mat="paint_yellow", bevel=0.005)
    slab_poly(D, C, M, rect(-1.18, -1.75, 1.18, 1.75), 0.02, 0.06, "deck_grid")
    K.light_box(M @ T((0, 0, zc + rn - 0.03)), w=0.62, d=1.1, power=11.0, room=f"n{i}")
    if i in (1, 4, 7, 10):
        D.cyl(0.62, 0.03, M=M @ T((0, 0, 0.035)), mat="metal_steel", segs=24, bevel=0.005)
        D.tube(0.7, 0.62, 0.05, M=M @ T((0, 0, 0.04)), mat="paint_yellow", segs=24, bevel=0.005)
        for k in range(6):
            D.box((0.05, 0.25, 0.03), M=M @ T((0, 0, 0.06)) @ RZ(30 * k), mat="metal_bare", bevel=0.004)
        D.text("RING AIRLOCK", size=0.08, M=M @ T((0, 0.85, 0.05)), mat="paint_black", depth=0.002)
        marker("airlock_in", f"ring{i}", at=P3(M, 0, 0, 0.3), label="Ring airlock")
    marker("nav", f"n{i}", at=P3(M, 0, 0, 0.08), links=f"m{i}u,m{(i + 1) % 12}u")
    for (side, a, dv, _) in tunnels:
        A = a + dv * 1.35
        B = side + dv * (WALL_IN + 0.02)
        L = (B - A).length
        mid = (A + B) / 2
        up = -Vector((mid.x, 0, mid.z)).normalized()
        y = up.cross(dv).normalized()
        up = dv.cross(y).normalized()
        Mt = Matrix(((dv.x, y.x, up.x, A.x), (dv.y, y.y, up.y, A.y), (dv.z, y.z, up.z, A.z), (0, 0, 0, 1)))
        Mz = Mt @ RY(90)
        inner_cyl(D, 1.04, 0.0, L, Mz, "padding_light", segs=24, cells_z=max(1, int(L / 0.8)))
        inner_cyl(C, 1.04, 0.0, L, Mz, "concrete", segs=16)
        for k in range(max(1, int(L / 0.9))):
            D.tube(1.05, 0.98, 0.07, M=Mz @ T((0, 0, 0.25 + k * 0.9)), mat="padding_blue" if k == 0 else "plastic_beige", segs=24, bevel=0)
        D.box((L, 0.72, 0.06), M=Mt @ T((L / 2, 0, -0.95)), mat="rubber", bevel=0.005)
        C.box((L + 0.2, 0.9, 0.1), M=Mt @ T((L / 2, 0, -0.97)), mat="concrete", bevel=0)
        for s in (-1, 1):
            K.rail(Mt @ T((0.1, s * 0.86, 0.1)), max(0.2, L - 0.2), standoff=0.0)
        light(F.uid("end_l"), at=(Mt @ Vector((L / 2, 0, 0.7)))[:], color=(0.92, 0.97, 1.0), power=8.0, dist=5.5, bake=16.0, group="endurance_int", room=f"n{i}")
        F.E.box((min(0.6, L * 0.7), 0.12, 0.02), M=Mt @ T((L / 2, 0, 0.97)), mat="emit_white", bevel=0)


# ===================================================================================================== hub and spoke
HOLES = {0: 0.95, 180: 0.95, 90: SR, 270: SR}      # clock angle (deg) -> radial opening radius


def hub_rooms(F, K):
    F.section("hub")
    D, E, C = F.D, F.E, F.C
    Mh = RX(-90)                                    # local Z along +Y; angle a <-> clock direction a = 270 - theta

    def skip(a, z):
        for th, rr in HOLES.items():
            da = abs(((a - (270 - th)) + 180) % 360 - 180)
            if math.hypot(math.radians(da) * RH, z) < rr + 0.18:
                return True
        return False
    inner_cyl(D, RH, -HUB_END, HUB_END, Mh, "tile_white", segs=48, skip=skip, cells_z=18)
    inner_cyl(C, RH, -HUB_END, HUB_END, Mh, "concrete", segs=32, skip=skip, cells_z=12)
    for th, rr in HOLES.items():
        Fo = frame_at(math.radians(th), 0.0)
        D.tube(rr + 0.3, rr, 0.4, M=Fo @ T((0, 0, RH - 0.05)), mat="padding_blue" if rr < 1 else "padding_light", segs=32, bevel=0.02)
        D.tube(rr + 0.36, rr + 0.28, 0.08, M=Fo @ T((0, 0, RH - 0.25)), mat="plastic_beige", segs=32, bevel=0.01)
        for k in range(8):
            D.box((0.06, 0.06, 0.12), M=Fo @ RZ(22.5 + 45 * k) @ T((rr + 0.33, 0, RH - 0.3)), mat="paint_yellow", bevel=0.005)
    for k in range(8):
        th = 45 * k + 22.5
        Fo = frame_at(math.radians(th), RH - 0.03)
        for y in (-3.3, -1.9, 1.9, 3.3):
            K.rr_panel(Fo @ T((0, y, 0)) @ RX(90), 0.75, 1.05)
        if k % 2 == 0:
            K.rail(Fo @ T((0.42, -4.0, 0)) @ RZ(90) @ RX(90), 8.0, standoff=0.1)
    for th in (300, 120):
        Fo = frame_at(math.radians(th), RH - 0.05)
        for s in (-1, 1):
            D.box((0.04, 8.4, 0.05), M=Fo @ T((s * 0.22, 0, 0)), mat="metal_steel", bevel=0.004)
        for k in range(24):
            D.cyl(0.015, 0.44, M=Fo @ T((0, -4.1 + k * 0.36, -0.06)) @ RY(90), mat="metal_chrome", segs=6, bevel=0)
    for th in (45, 135, 225, 315):
        Fo = frame_at(math.radians(th), RH - 0.06)
        E.box((0.12, 7.6, 0.03), M=Fo, mat="emit_white", bevel=0)
        D.box((0.26, 7.8, 0.05), M=Fo @ T((0, 0, 0.03)), mat="plastic_beige", bevel=0.01)
        for y in (-3.0, 0.0, 3.0):
            light(F.uid("end_l"), at=(Fo @ Vector((0, y, -0.5)))[:], color=(0.92, 0.97, 1.0), power=7.0, dist=5.5, bake=16.0, group="endurance_int", room="hub")
    for th, y in ((30, -2.6), (35, 2.4), (210, -2.3), (330, 2.8), (150, 0.9), (200, 3.1)):
        Fo = frame_at(math.radians(th), RH - 0.05)
        K.bag(Fo @ T((0, y, 0)) @ RX(180), w=0.6, d=0.4, h=0.34)
    for s, pid, label in ((1, "axial_fwd", "RANGER 1"), (-1, "axial_aft", "RANGER 2")):
        disc_with_hole(D, RH + 0.02, 0.98, T((0, s * HUB_END - (0.06 if s < 0 else 0), 0)), "padding_gray", t=0.06)
        disc_with_hole(C, RH + 0.02, 0.98, T((0, s * HUB_END - (0.06 if s < 0 else 0), 0)), "concrete", t=0.1)
        for k in range(10):
            D.box((0.035, 0.03, 1.15), M=T((0, s * (HUB_END - 0.03), 0)) @ RY(18 + 36 * k) @ T((0, 0, 1.62)), mat="metal_bare", bevel=0.004)
        y0, y1 = s * HUB_END, s * (HUB_L / 2 + 1.5)
        Mt = T((0, min(y0, y1), 0)) @ RX(-90)
        inner_cyl(D, 0.95, 0.0, abs(y1 - y0), Mt, "padding_light", segs=28, cells_z=2)
        inner_cyl(C, 0.95, 0.0, abs(y1 - y0), Mt, "concrete", segs=20)
        for k in range(3):
            D.tube(0.97, 0.9, 0.07, M=T((0, s * (HUB_END + 0.25 + k * 0.42), 0)) @ RX(90), mat="padding_blue" if k == 1 else "plastic_beige", segs=28, bevel=0)
        D.tube(1.15, 0.95, 0.12, M=T((0, s * (HUB_END + 0.02), 0)) @ RX(90), mat="metal_steel", segs=32, bevel=0.01)
        # lettering reads from inside the hub: the forward wall faces -Y (text as laid by RX(90)); the aft wall faces +Y
        flip = RZ(180) if s < 0 else Matrix.Identity(4)
        D.text(label, size=0.14, M=T((0, s * (HUB_END - 0.025), 1.35)) @ flip @ RX(90), mat="paint_black", depth=0.002)
        for k in (-1, 1):
            D.text("RESCUE", size=0.07, M=T((k * 1.45, s * (HUB_END - 0.025), -1.25)) @ flip @ RX(90), mat="paint_yellow", depth=0.002)
        marker("hatch_ctl", pid, at=(0.78 * s, s * (HUB_END - 0.15), -0.75), label="Docking hatch")
        marker("nav", f"hub_{pid}", at=(0, s * (HUB_END - 0.6), -RH + 0.1), links="hub")
    for th, label in ((0, "LANDER 1"), (180, "LANDER 2")):
        Fo = frame_at(math.radians(th), 0.0)
        D.cyl(0.92, 0.05, M=Fo @ T((0, 0, RH + 1.2)), mat="metal_steel", segs=28, bevel=0.005)
        C.cyl(1.0, 0.12, M=Fo @ T((0, 0, RH + 1.24)), mat="concrete", segs=16, bevel=0)     # the port's closed hatch
        for k in range(10):
            D.box((0.03, 0.62, 0.03), M=Fo @ T((0, 0, RH + 1.16)) @ RZ(18 + 36 * k) @ T((0, 0.33, 0)), mat="metal_bare", bevel=0.003)
        inner_cyl(D, 0.95, RH - 0.1, RH + 1.25, Fo, "padding_light", segs=24)
        inner_cyl(C, 0.95, RH - 0.1, RH + 1.25, Fo, "concrete", segs=16)
        K.sign(Fo @ T((0.0, -1.42, RH - 0.06)) @ RX(90), label, w=0.9, h=0.15)
        marker("lander_port", "radial_up" if th == 0 else "radial_down", at=(Fo @ Vector((0, 0, RH + 0.6)))[:], label=f"{label} port")
    Fo = frame_at(math.radians(270), 0.0)
    inner_cyl(D, SR, RH - 0.1, RH + 4.0, Fo, "padding_gray", segs=24, cells_z=3)
    inner_cyl(C, SR, RH - 0.1, RH + 4.0, Fo, "concrete", segs=16)
    D.cyl(SR + 0.02, 0.06, M=Fo @ T((0, 0, RH + 4.0)), mat="padding_gray", segs=24, bevel=0)
    C.cyl(SR + 0.1, 0.14, M=Fo @ T((0, 0, RH + 4.05)), mat="concrete", segs=16, bevel=0)      # alcove end wall
    for k in range(6):
        K.bag(Fo @ T((((k % 2) - 0.5) * 0.9, 0.0, RH + 0.8 + (k // 2) * 1.0)) @ RY(90), w=0.6, d=0.42, h=0.36)
    marker("nav", "hub", at=(0, 0, 0), links="hub_axial_fwd,hub_axial_aft,spoke_top")
    marker("spawn", "hub", at=(0, -1.5, 0))


def spoke_rooms(F, K):
    F.section("spoke")
    D, E, C = F.D, F.E, F.C
    th = clock(SPOKE)
    Fo = frame_at(th, 0.0)
    r0, r1 = RH - 0.05, R_UC + 0.02
    inner_cyl(D, SR, r0, r1, Fo, "padding_light", segs=28, cells_z=24)
    inner_cyl(C, SR, r0, r1, Fo, "concrete", segs=20, cells_z=8)
    for a in (60, 120):
        x, y = math.cos(math.radians(a)) * (SR - 0.06), math.sin(math.radians(a)) * (SR - 0.06)
        D.box((0.06, 0.08, r1 - r0), M=Fo @ T((x, y, (r0 + r1) / 2)), mat="metal_steel", bevel=0.005)
    for s in (-1, 1):
        D.box((0.04, 0.05, r1 - r0), M=Fo @ T((-SR + 0.12, s * 0.2, (r0 + r1) / 2)), mat="paint_yellow", bevel=0.004)
    for k in range(int((r1 - r0) / 0.35)):
        D.cyl(0.015, 0.4, M=Fo @ T((-SR + 0.12, 0, r0 + 0.3 + k * 0.35)) @ RX(90), mat="paint_yellow", segs=6, bevel=0)
    for k in range(5):
        r = r0 + 2.5 + k * 4.0
        D.tube(SR + 0.01, SR - 0.06, 0.12, M=Fo @ T((0, 0, r)), mat="plastic_beige", segs=28, bevel=0)
        E.tube(SR - 0.04, SR - 0.08, 0.05, M=Fo @ T((0, 0, r)), mat="emit_white", segs=28, bevel=0)
        light(F.uid("end_l"), at=(Fo @ Vector((0, 0, r)))[:], color=(0.92, 0.97, 1.0), power=6.0, dist=5.0, bake=14.0, group="endurance_int", room="spoke")
        K.stencil(Fo @ T((SR - 0.02, 0, r + 1.0)) @ RZ(-90), f"R {r + 1.0:.0f} M", size=0.12)
    car = Part("endurance_lift_car")
    rc = SR - 0.14
    car.cyl(rc, 0.08, at=(0, 0, -0.04), mat="tread_plate", segs=28, bevel=0.01)
    car.tube(rc, rc - 0.06, 0.08, at=(0, 0, 2.3), mat="paint_blue", segs=28, bevel=0.01)
    arc = [(math.cos(math.radians(a)) * (rc - 0.025), math.sin(math.radians(a)) * (rc - 0.025), 1.05) for a in range(130, 411, 10)]
    car.pipe(arc, 0.025, mat="paint_blue", segs=8)
    for k in range(6):
        a = math.radians(30 + 60 * k)
        if 50 < math.degrees(a) < 130:
            continue
        car.cyl(0.025, 2.3, at=(math.cos(a) * (rc - 0.03), math.sin(a) * (rc - 0.03), 1.15), mat="metal_chrome", segs=8, bevel=0)
    car.box((0.3, 0.06, 0.4), at=(-(rc - 0.08), 0.0, 1.25), rot=(0, 0, 90), mat="paint_gray", bevel=0.01)
    car.box((0.06, 0.02, 0.06), at=(-(rc - 0.12), -0.07, 1.33), mat="paint_green", bevel=0)
    car.box((0.06, 0.02, 0.06), at=(-(rc - 0.12), 0.07, 1.33), mat="paint_red", bevel=0)
    co = car.finish(sharp=40, col=0)
    co.matrix_world = room_frame(th, R_UF)
    props(co, kind="rlift", id="spoke", part="lift_car", dynamic=1, r_top=RH + 2.45, r_bottom=R_UF, theta=math.degrees(th), speed=2.4, label="Spoke lift")
    F.dyn.append(co)
    marker("liftcall", "spoke_hub", at=(Fo @ Vector((0.0, 0.9, RH - 0.25)))[:], level="top", label="Call the spoke lift")
    marker("nav", "spoke_top", at=(Fo @ Vector((0, 0, RH - 0.4)))[:], links="spoke_bot")


# ===================================================================================================== build
def build():
    reset()
    F = Fac("end", cell=2.0)
    K = Kit(F)
    hub_rooms(F, K)
    spoke_rooms(F, K)
    for i in range(12):
        module_rooms(F, K, i)
        node_rooms(F, K, i)
    return F.finish(tess=None, bake=True, rays=8, lights=True, light_gain=1.0, fill=0.02, sky_dist=6.0)


def preview_lights():
    for o in list(bpy.context.scene.objects):
        if o.get("kind") == "light":
            ld = bpy.data.lights.new(o.name + "_pl", "POINT")
            ld.energy = float(o.get("power", 10)) * 9.0
            ld.color = tuple(o.get("color", (1, 1, 1)))[:3]
            ld.shadow_soft_size = 0.3
            lo = bpy.data.objects.new(o.name + "_pl", ld)
            bpy.context.scene.collection.objects.link(lo)
            lo.location = o.matrix_world.translation


def previews(which=None):
    preview_lights()
    dark = dict(sky=(0.01, 0.01, 0.012), sky_strength=0.2, sun=0.0)
    shots = []
    set_room(9)
    Ml = RF(9, R_LF)
    shots.append(("endint_cmd", P3(Ml, 0.2, HY - 1.2, 1.65), P3(Ml, -0.2, -HY, 1.2)))
    shots.append(("endint_cmd2", P3(Ml, -HX + 0.7, -HY + 0.8, 1.6), P3(Ml, HX, 0.3, 1.2)))
    set_room(6)
    Mc = RF(6, R_LF)
    shots.append(("endint_cryo", P3(Mc, HX - 0.5, HY - 0.5, 1.7), P3(Mc, -0.8, -1.2, 0.3)))
    set_room(0)
    Mh = RF(0, R_LF)
    shots.append(("endint_hab", P3(Mh, HX - 0.6, HY - 0.4, 1.6), P3(Mh, -1.0, -1.0, 1.0)))
    set_room(3)
    Mb = RF(3, R_LF)
    shots.append(("endint_mess", P3(Mb, -HX + 0.6, -HY + 1.2, 1.6), P3(Mb, 1.0, 1.0, 1.0)))
    Mu = RF(3, R_UF)
    shots.append(("endint_corr", P3(Mu, -HX + 0.4, 2.6, 1.6), P3(Mu, HX, -1.0, 1.2)))
    set_room(1)
    Mp = RF(1, R_LF)
    shots.append(("endint_eva", P3(Mp, HX - 0.5, HY - 0.6, 1.6), P3(Mp, -HX, -0.5, 1.0)))
    set_room(2)
    Me = RF(2, R_LF)
    shots.append(("endint_eng", P3(Me, HX - 0.5, HY - 0.6, 1.7), P3(Me, -1.0, -1.0, 0.6)))
    Mn = room_frame(clock(2) + math.radians(15), R_UF)
    shots.append(("endint_node", P3(Mn, -0.3, 1.2, 1.5), P3(Mn, 2.0, -0.6, 1.0)))
    shots.append(("endint_hub", (0.8, -3.9, -1.5), (0, 3.0, 0.3)))
    for name, eye, tgt in shots:
        if which and name not in which:
            continue
        # camera up = toward the spin axis at the eye (the local "up" of the spinning ship)
        e = Vector(eye)
        up = Vector((-e.x, 0.0, -e.z))
        up = up.normalized() if up.length > 0.5 else Vector((0, 0, 1))
        preview(name, eye=eye, target=tgt, lens=16, res=(1440, 900), samples=20, up=up[:], **dark)


if __name__ == "__main__":
    build()
    if "preview" in sys.argv[1:]:
        previews()
    export_glb("endurance_int")
    save_blend("endurance_int")
