"""Industrial / underground facility kit on top of bl.Part and arch.Bldg: tessellated concrete shells
(for baked lighting), blast and sliding doors, light fixtures, pipes, ducts, cable trays, consoles,
racks, tanks, railings, steel stairs, signage and wall screens."""
from __future__ import annotations

import math
import random

from bl import *  # noqa: F401,F403
from arch import Bldg, frame_matrix
from mathutils import Matrix, Vector

T = Matrix.Translation


def RZ(deg):
    return Matrix.Rotation(math.radians(deg), 4, "Z")


def RX(deg):
    return Matrix.Rotation(math.radians(deg), 4, "X")


def RY(deg):
    return Matrix.Rotation(math.radians(deg), 4, "Y")


def at(x, y, z=0.0, yaw=0.0):
    return T((x, y, z)) @ RZ(yaw)


class Fac:
    def __init__(self, name, cell=2.0):
        self.name = name
        self.S = Part(name + "_shell")
        self.C = Part(name + "_col")
        self.cell = cell
        self.dyn = []
        self.n = 0
        self.rnd = random.Random(hash(name) & 0xffff)
        b = Bldg(name)
        b.col = self.C
        b.inside = True
        b.dyn = self.dyn
        self.b = b
        self.sections = []
        self.section("main")

    def section(self, name):
        """Start a new group of detail / emissive / glass geometry (one set of meshes per room, so the
        engine can cull whole rooms). Returns (D, E, G) for convenience."""
        self.D = Part(f"{self.name}_{name}_detail")
        self.E = Part(f"{self.name}_{name}_emit")
        self.G = Part(f"{self.name}_{name}_glass")
        self.D.bevel_segs = 1
        self.E.bevel_segs = 1
        self.b.ext = self.b.int = self.D
        self.b.glass = self.G
        self.sections.append((name, self.D, self.E, self.G))
        return self.D, self.E, self.G

    def uid(self, prefix):
        self.n += 1
        return f"{prefix}{self.n}"

    # ------------------------------------------------------------------ shell
    def floor(self, x0, y0, x1, y1, z, mat="concrete_floor", col=True, part=None, t=0.5):
        nx = max(1, int(math.ceil((x1 - x0) / self.cell)))
        ny = max(1, int(math.ceil((y1 - y0) / self.cell)))
        (part or self.S).grid(x1 - x0, y1 - y0, nx, ny, at=((x0 + x1) / 2, (y0 + y1) / 2, z), mat=mat)
        if col:
            self.C.box((x1 - x0, y1 - y0, t), at=((x0 + x1) / 2, (y0 + y1) / 2, z - t / 2), mat="concrete", bevel=0)

    def ceil(self, x0, y0, x1, y1, z, mat="concrete", col=False, part=None):
        nx = max(1, int(math.ceil((x1 - x0) / self.cell)))
        ny = max(1, int(math.ceil((y1 - y0) / self.cell)))
        (part or self.S).grid(x1 - x0, y1 - y0, nx, ny, at=((x0 + x1) / 2, (y0 + y1) / 2, z), rot=(180, 0, 0), mat=mat)
        if col:
            self.C.box((x1 - x0, y1 - y0, 0.4), at=((x0 + x1) / 2, (y0 + y1) / 2, z + 0.2), mat="concrete", bevel=0)

    def wall(self, a, b, z0, z1, openings=(), mat="concrete_panels", t=0.4, col=True, part=None):
        """Wall slab centred on a->b. openings: (u0, u1, z_bottom, z_top). Returns the wall frame
        (x along the wall, y through the thickness from 0 to t, z up) and its length."""
        M, L = Bldg.wall_frame(a, b)
        M = M @ T((0, -t / 2, 0))
        v, f = Bldg._wall_mesh(L, z0, z1, t, openings, cell=self.cell)
        (part or self.S).mesh(v, f, mat=mat, M=M, bevel=0, recalc=False, smooth=False)
        if col:
            vc, fc = Bldg._wall_mesh(L, z0, z1, t, openings, cell=60.0)
            self.C.mesh(vc, fc, mat="concrete", M=M, bevel=0, recalc=False)
        return M, L

    def room(self, x0, y0, x1, y1, z0, z1, wall="concrete_panels", floor="concrete_floor", ceil="concrete", t=0.4,
             doors=None, skip=""):
        """Rectangular room: slab, ceiling and the four walls (s, n = low / high y; w, e = low / high x).
        doors: {side: [(offset along the wall from its low end, width, height), ...]}. Returns wall frames."""
        doors = doors or {}
        h = t / 2
        self.floor(x0 - h, y0 - h, x1 + h, y1 + h, z0, floor)
        self.ceil(x0 - h, y0 - h, x1 + h, y1 + h, z1, ceil)
        frames = {}
        # walls are wound so that the frame's +y points into the room
        spec = {"s": ((x0, y0), (x1, y0), False), "n": ((x1, y1), (x0, y1), True),
                "e": ((x1, y0), (x1, y1), False), "w": ((x0, y1), (x0, y0), True)}
        for side, (a, b, rev) in spec.items():
            if side in skip:
                continue
            L = math.hypot(b[0] - a[0], b[1] - a[1])
            ops = []
            for (o, w, h) in doors.get(side, []):
                u0 = (L - o - w) if rev else o
                ops.append((u0, u0 + w, z0, z0 + h))
            frames[side] = (self.wall(a, b, z0, z1, ops, wall, t)[0], ops)
        return frames

    # ------------------------------------------------------------------ doors
    def door(self, did, M, u0, zb, w=1.0, h=2.15, t=0.4, label="Door", hinge="left", swing="in", locked=False, mat="paint_gray_dark"):
        """Hinged steel personnel door in a wall frame returned by wall()/room()."""
        return self.b.door(did, M, u0, zb, w=w, h=h, T=t, hinge=hinge, swing=swing, style="steel", mat=mat,
                           ext_mat="metal_dark", label=label, locked=locked, angle=96)

    def slide(self, did, M, u0, zb, w, h, t=0.4, thick=0.1, travel=None, label="Door", mat="paint_gray", auto=4.0, time=1.4,
              stripe=True, sound="hatch"):
        """Sliding door / blast door leaf that travels along the wall (+u) into a pocket. Opens by proximity (auto > 0)."""
        P = Part(f"{self.name}_slide_{did}")
        P.box((w, thick, h), at=(0, 0, h / 2), mat=mat, bevel=min(0.03, thick * 0.2))
        # stiffening ribs and a hazard band
        n = max(2, int(w / 1.2))
        for i in range(n + 1):
            x = -w / 2 + 0.12 + (w - 0.24) * i / n
            for s in (-1, 1):
                P.box((0.1, 0.05, h - 0.3), at=(x, s * (thick / 2 + 0.02), h / 2), mat=mat, bevel=0.012)
        for z in (0.35, h - 0.35):
            for s in (-1, 1):
                P.box((w - 0.1, 0.05, 0.14), at=(0, s * (thick / 2 + 0.022), z), mat=mat, bevel=0.012)
        if stripe:
            for s in (-1, 1):
                P.box((w - 0.3, 0.012, 0.22), at=(0, s * (thick / 2 + 0.05), min(1.2, h * 0.4)), mat="paint_yellow", bevel=0.003)
        ob = P.finish(sharp=40)
        ob.matrix_world = M @ T((u0 + w / 2, t / 2, zb + 0.01))
        props(ob, kind="slide", id=did, part=f"slide_{did}", travel=travel if travel is not None else w + 0.05, dynamic=1, col=0,
              label=label, w=w, h=h, t=thick, auto=auto, time=time, sound=sound)
        self.dyn.append(ob)
        # steel frame around the opening
        for u in (u0 - 0.06, u0 + w + 0.06):
            self.D.box((0.12, t + 0.06, h + 0.1), M=M @ T((u, t / 2, zb + (h + 0.1) / 2)), mat="metal_dark", bevel=0.01)
        self.D.box((w + 0.24, t + 0.06, 0.14), M=M @ T((u0 + w / 2, t / 2, zb + h + 0.07)), mat="metal_dark", bevel=0.01)
        return ob

    # ------------------------------------------------------------------ lights
    def strip(self, x, y, z, yaw=0.0, L=1.3, power=14.0, dist=8.0, bake=None, room=None, color=(0.93, 0.97, 1.0), emit="emit_white"):
        """Ceiling fluorescent batten; z is the ceiling height."""
        M = at(x, y, z, yaw)
        self.D.box((L, 0.17, 0.07), M=M @ T((0, 0, -0.035)), mat="paint_gray", bevel=0.01)
        self.E.box((L - 0.1, 0.1, 0.03), M=M @ T((0, 0, -0.082)), mat=emit, bevel=0.008)
        kw = {"room": room} if room else {}
        light(self.uid(self.name + "_l"), at=(x, y, z - 0.32), color=color, power=power, dist=dist,
              bake=bake if bake is not None else power * 3.0, group=self.name, **kw)

    def highbay(self, x, y, z, drop=1.2, power=38.0, dist=24.0, bake=None, color=(1.0, 0.96, 0.88), room=None):
        """Industrial pendant flood light hanging `drop` below the ceiling at z."""
        self.D.cyl(0.015, drop, at=(x, y, z - drop / 2), mat="metal_dark", segs=6, bevel=0)
        self.D.cyl(0.26, 0.24, at=(x, y, z - drop - 0.1), r2=0.12, mat="paint_gray_dark", segs=16, bevel=0.01)
        self.E.cyl(0.2, 0.02, at=(x, y, z - drop - 0.225), mat="emit_warm", segs=16, bevel=0)
        kw = {"room": room} if room else {}
        light(self.uid(self.name + "_l"), at=(x, y, z - drop - 0.5), color=color, power=power, dist=dist,
              bake=bake if bake is not None else power * 4.0, group=self.name, **kw)

    def wall_lamp(self, M, power=9.0, dist=7.0, bake=None, color=(1.0, 0.9, 0.75), emit="emit_warm", room=None):
        """Bulkhead lamp on a wall; local -Y points into the room."""
        self.D.box((0.3, 0.07, 0.16), M=M @ T((0, -0.035, 0)), mat="metal_dark", bevel=0.012)
        self.E.box((0.24, 0.05, 0.1), M=M @ T((0, -0.085, 0)), mat=emit, bevel=0.02)
        p = M @ Vector((0, -0.35, -0.05))
        kw = {"room": room} if room else {}
        light(self.uid(self.name + "_l"), at=p[:], color=color, power=power, dist=dist, bake=bake if bake is not None else power * 3.0, group=self.name, **kw)

    # ------------------------------------------------------------------ services
    def pipe(self, pts, r=0.08, mat="paint_gray", flanges=True, part=None, bend=None):
        p = part or self.D
        p.pipe(pts, r, mat=mat, segs=10 if r < 0.2 else 14, bend=bend)
        if flanges:
            for a, b in zip(pts[:-1], pts[1:]):
                a, b = Vector(a), Vector(b)
                L = (b - a).length
                if L < 3.0:
                    continue
                d = (b - a).normalized()
                q = Vector((0, 0, 1)).rotation_difference(d).to_matrix().to_4x4()
                for k in range(1, int(L / 3.0) + 1):
                    c = a + d * (k * L / (int(L / 3.0) + 1))
                    p.cyl(r * 1.45, 0.05, M=T(c) @ q, mat="metal_dark", segs=12, bevel=0.006)

    def duct(self, a, b, w=0.6, h=0.45, mat="metal_steel"):
        a, b = Vector(a), Vector(b)
        L = (b - a).length
        d = (b - a).normalized()
        up = Vector((0, 0, 1)) if abs(d.z) < 0.9 else Vector((1, 0, 0))
        y = up.cross(d).normalized()
        z = d.cross(y)
        M = frame_matrix((a + b) / 2, d, y, z)
        self.D.box((L, w, h), M=M, mat=mat, bevel=0.012)
        for k in range(int(L / 1.6) + 1):
            self.D.box((0.05, w + 0.05, h + 0.05), M=M @ T((-L / 2 + 0.1 + k * (L - 0.2) / max(1, int(L / 1.6)), 0, 0)), mat=mat, bevel=0.006)

    def tray(self, a, b, w=0.4, cables=5):
        """Ladder cable tray with a bundle of cables."""
        a, b = Vector(a), Vector(b)
        L = (b - a).length
        d = (b - a).normalized()
        y = Vector((0, 0, 1)).cross(d).normalized()
        M = frame_matrix((a + b) / 2, d, y, d.cross(y))
        for s in (-1, 1):
            self.D.box((L, 0.02, 0.07), M=M @ T((0, s * w / 2, 0)), mat="metal_steel", bevel=0.003)
        for k in range(int(L / 0.6) + 1):
            self.D.box((0.03, w, 0.015), M=M @ T((-L / 2 + k * L / max(1, int(L / 0.6)), 0, -0.025)), mat="metal_steel", bevel=0)
        mats = ["plastic_black", "plastic_dark", "plastic_gray", "plastic_blue", "plastic_orange", "plastic_black"]
        for i in range(cables):
            yy = -w / 2 + 0.05 + (w - 0.1) * i / max(1, cables - 1)
            self.D.cyl(0.014 + 0.006 * (i % 3), L, M=M @ T((0, yy, 0.0)) @ RY(90), mat=mats[i % len(mats)], segs=6, bevel=0, caps=False)

    def rail(self, pts, h=1.05, mat="paint_yellow", col=True, mid=True):
        """Handrail along a polyline of (x, y, z) floor points."""
        P = self.D
        pts = [Vector(p) for p in pts]
        for a, b in zip(pts[:-1], pts[1:]):
            L = (b - a).length
            d = (b - a).normalized()
            n = max(1, int(round(L / 1.5)))
            for k in range(n + 1):
                c = a + d * (L * k / n)
                P.cyl(0.022, h, at=(c.x, c.y, c.z + h / 2), mat=mat, segs=8, bevel=0)
            for hh in ((h, h * 0.52) if mid else (h,)):
                P.pipe([(a.x, a.y, a.z + hh), (b.x, b.y, b.z + hh)], 0.022 if hh == h else 0.016, mat=mat, segs=8)
            if col:
                y = Vector((0, 0, 1)).cross(d).normalized()
                M = frame_matrix((a + b) / 2 + Vector((0, 0, h / 2)), d, y, d.cross(y))
                self.C.box((L, 0.06, h), M=M, mat="concrete", bevel=0)

    def stairs(self, base, direction, width, rise, steps, run=0.27, rails="both"):
        """Open steel stair with tread-plate steps."""
        d = Vector((direction[0], direction[1], 0)).normalized()
        n = Vector((-d.y, d.x, 0))
        M = frame_matrix(base, d, n, (0, 0, 1))
        r = rise / steps
        for i in range(steps):
            self.D.box((run + 0.02, width, 0.03), M=M @ T((run * (i + 0.5), 0, r * (i + 1) - 0.015)), mat="tread_plate", bevel=0.004)
        length = run * steps
        ang = math.atan2(rise, length)
        hyp = math.hypot(rise, length)
        for s in (-1, 1):
            self.D.box((hyp + 0.1, 0.03, 0.24), M=M @ T((length / 2, s * (width / 2 + 0.015), rise / 2 - 0.04)) @ RY(-math.degrees(ang)), mat="paint_gray_dark", bevel=0.004)
        self.C.box((hyp, width, 0.1), M=M @ T((length / 2, 0, rise / 2 - 0.03)) @ RY(-math.degrees(ang)), mat="concrete", bevel=0)
        for s in ((-1, 1) if rails == "both" else ((1,) if rails == "left" else (-1,) if rails == "right" else ())):
            ry = s * (width / 2 - 0.03)
            self.D.box((hyp, 0.045, 0.045), M=M @ T((length / 2, ry, rise / 2 + 1.0)) @ RY(-math.degrees(ang)), mat="paint_yellow", bevel=0.01)
            for i in range(0, steps + 1, 3):
                self.D.cyl(0.02, 1.0, M=M @ T((run * i, ry, r * i + 0.5)), mat="paint_yellow", segs=8, bevel=0)
            self.C.box((hyp, 0.05, 1.05), M=M @ T((length / 2, ry, rise / 2 + 0.52)) @ RY(-math.degrees(ang)), mat="concrete", bevel=0)
        return M

    # ------------------------------------------------------------------ equipment
    def screen(self, sid, M, w=0.5, h=0.3, bezel=0.025, depth=0.04, body="plastic_dark"):
        """Flat display. Local frame: +X right, +Z up, -Y out of the glass (toward the viewer)."""
        self.D.box((w + 2 * bezel, depth, h + 2 * bezel), M=M @ T((0, depth / 2, 0)), mat=body, bevel=0.006)
        self.D.box((w, 0.004, h), M=M @ T((0, -0.002, 0)), mat="screen", bevel=0)
        loc, rot, _ = (M @ T((0, -0.006, 0))).decompose()
        e = rot.to_euler("XYZ")
        marker("screen", sid, at=loc[:], rot=(math.degrees(e.x), math.degrees(e.y), math.degrees(e.z)), w=w, h=h)

    def console(self, M, w=1.8, sid=None, screens=2, chair=True, mat="paint_gray", top="plastic_dark"):
        """Operator console (operator sits on -Y, facing +Y). Returns nothing; screens get ids sid0, sid1..."""
        D, C = self.D, self.C
        D.box((w, 0.8, 0.04), M=M @ T((0, 0, 0.74)), mat=top, bevel=0.008)
        for s in (-1, 1):
            D.box((0.05, 0.74, 0.72), M=M @ T((s * (w / 2 - 0.03), 0, 0.36)), mat=mat, bevel=0.006)
        D.box((w - 0.1, 0.04, 0.6), M=M @ T((0, 0.36, 0.42)), mat=mat, bevel=0.004)
        # raised instrument turret at the back
        D.box((w, 0.24, 0.5), M=M @ T((0, 0.3, 1.0)) @ RX(-12), mat=mat, bevel=0.01)
        sw = (w - 0.16) / screens
        for i in range(screens):
            x = -w / 2 + 0.08 + sw * (i + 0.5)
            Ms = M @ T((x, 0.165, 1.0)) @ RX(-12)
            if sid:
                self.screen(f"{sid}{i}", Ms, w=sw - 0.07, h=0.36, depth=0.02)
            else:
                D.box((sw - 0.07, 0.006, 0.36), M=Ms @ T((0, -0.003, 0)), mat="screen", bevel=0)
            # keyboard and a row of illuminated keys
            D.box((0.42, 0.15, 0.02), M=M @ T((x, -0.16, 0.77)) @ RX(4), mat="plastic_black", bevel=0.004)
            self.E.box((0.2, 0.022, 0.008), M=M @ T((x, 0.03, 0.765)), mat=["emit_amber", "emit_green", "emit_blue"][i % 3], bevel=0)
        C.box((w, 0.8, 1.25), M=M @ T((0, 0.05, 0.62)), mat="concrete", bevel=0)
        if chair:
            self.chair(M @ T((0, -0.75, 0)) @ RZ(self.rnd.uniform(-25, 25) + 180))

    def chair(self, M, mat="fabric_dark"):
        """Swivel office chair facing -Y."""
        D = self.D
        D.cyl(0.028, 0.34, M=M @ T((0, 0, 0.26)), mat="metal_chrome", segs=10, bevel=0)
        for k in range(5):
            D.box((0.3, 0.045, 0.03), M=M @ RZ(72 * k) @ T((0.15, 0, 0.05)), mat="plastic_black", bevel=0)
        D.box((0.48, 0.46, 0.08), M=M @ T((0, 0, 0.47)), mat=mat, bevel=0.03)
        D.box((0.44, 0.07, 0.5), M=M @ T((0, 0.22, 0.82)) @ RX(-8), mat=mat, bevel=0.03)
        self.C.box((0.5, 0.5, 0.95), M=M @ T((0, 0, 0.48)), mat="concrete", bevel=0)

    def rack(self, M, w=0.62, d=0.95, h=2.1, leds=True):
        """Server / equipment rack, front on -Y."""
        D = self.D
        D.box((w, d, h), M=M @ T((0, 0, h / 2)), mat="paint_black", bevel=0.01)
        D.box((w - 0.08, 0.012, h - 0.12), M=M @ T((0, -d / 2 - 0.004, h / 2)), mat="metal_black", bevel=0.003)
        n = int((h - 0.2) / 0.133)
        for i in range(n):
            z = 0.14 + i * 0.133
            D.box((w - 0.12, 0.012, 0.11), M=M @ T((0, -d / 2 - 0.012, z + 0.055)), mat="plastic_dark" if i % 4 else "metal_gunmetal", bevel=0.003)
            if leds and self.rnd.random() < 0.7:
                n_led = self.rnd.randint(2, 6)
                self.E.box((0.03 * n_led, 0.006, 0.012), M=M @ T((-w / 2 + 0.1 + 0.015 * n_led, -d / 2 - 0.02, z + 0.085)), mat=self.rnd.choice(["emit_green", "emit_green", "emit_amber", "emit_blue"]), bevel=0)
        self.C.box((w, d, h), M=M @ T((0, 0, h / 2)), mat="concrete", bevel=0)

    def locker(self, M, n=3, w=0.42, d=0.5, h=1.95, mat="paint_gray"):
        for i in range(n):
            x = (i - (n - 1) / 2) * w
            self.D.box((w - 0.006, d, h), M=M @ T((x, 0, h / 2)), mat=mat, bevel=0.006)
            self.D.box((w - 0.05, 0.012, h - 0.1), M=M @ T((x, -d / 2 - 0.004, h / 2)), mat=mat, bevel=0.006)
            for k in range(3):
                self.D.box((w * 0.5, 0.006, 0.012), M=M @ T((x, -d / 2 - 0.012, h - 0.22 - k * 0.035)), mat="metal_dark", bevel=0)
            self.D.box((0.02, 0.03, 0.12), M=M @ T((x + w * 0.32, -d / 2 - 0.02, h * 0.52)), mat="metal_chrome", bevel=0.004)
        self.C.box((n * w, d, h), M=M @ T((0, 0, h / 2)), mat="concrete", bevel=0)

    def tank(self, M, r=0.9, h=3.0, mat="paint_white", legs=True, horizontal=False, band="paint_blue", label=None):
        """Pressure vessel with domed heads. Vertical (base at z=0) or horizontal on saddles (axis along X)."""
        D = self.D
        k = r * 0.55
        prof = [(0.0, 0.0), (r * 0.6, k * 0.28), (r * 0.92, k * 0.72), (r, k), (r, h - k), (r * 0.92, h - k * 0.72), (r * 0.6, h - k * 0.28), (0.0, h)]
        if horizontal:
            Mt = M @ T((-h / 2, 0, r + 0.35)) @ RY(90)
            D.lathe(prof, M=Mt, mat=mat, segs=28)
            D.cyl(r + 0.012, 0.3, M=M @ T((0, 0, r + 0.35)) @ RY(90), mat=band, segs=28, bevel=0, caps=False)
            for x in (-h * 0.3, h * 0.3):
                D.box((0.25, r * 1.5, r * 0.75), M=M @ T((x, 0, r * 0.375)), mat="paint_gray_dark", bevel=0.02)
            self.C.box((h, 2 * r, 2 * r + 0.35), M=M @ T((0, 0, r + 0.17)), mat="concrete", bevel=0)
        else:
            z0 = 0.5 if legs else 0.0
            D.lathe(prof, M=M @ T((0, 0, z0)), mat=mat, segs=28)
            D.cyl(r + 0.012, 0.3, M=M @ T((0, 0, z0 + h * 0.62)), mat=band, segs=28, bevel=0, caps=False)
            if legs:
                for i in range(4):
                    a = math.radians(45 + 90 * i)
                    D.box((0.1, 0.1, z0 + k), M=M @ T((math.cos(a) * r * 0.8, math.sin(a) * r * 0.8, (z0 + k) / 2)), mat="paint_gray_dark", bevel=0.01)
            D.cyl(0.07, 0.25, M=M @ T((0, 0, z0 + h + 0.1)), mat="metal_steel", segs=10, bevel=0.006)
            D.cyl(0.12, 0.03, M=M @ T((0, 0, z0 + h + 0.22)), mat="metal_dark", segs=12, bevel=0.004)
            self.C.cyl(r, h + z0, M=M @ T((0, 0, (h + z0) / 2)), mat="concrete", segs=10, bevel=0)

    def sign(self, M, text, w=1.2, h=0.3, bg="paint_white", fg="paint_black", size=None):
        """Wall plate with lettering; local -Y faces the reader."""
        self.D.box((w, 0.012, h), M=M @ T((0, -0.006, 0)), mat=bg, bevel=0.003)
        self.D.text(text, size=size or h * 0.42, M=M @ T((0, -0.0125, 0)) @ RX(90), mat=fg, depth=0.0015)

    def camera(self, M):
        """Security camera on a wall bracket; local -Y is the viewing direction."""
        D = self.D
        D.box((0.08, 0.2, 0.05), M=M @ T((0, -0.1, 0)), mat="metal_dark", bevel=0.006)
        D.box((0.11, 0.3, 0.1), M=M @ T((0, -0.3, -0.07)) @ RX(-14), mat="paint_white", bevel=0.012)
        D.cyl(0.04, 0.03, M=M @ T((0, -0.455, -0.108)) @ RX(76), mat="glass_dark", segs=12, bevel=0)
        self.E.box((0.012, 0.006, 0.012), M=M @ T((0.035, -0.452, -0.075)), mat="emit_red", bevel=0)

    def crate(self, M, w=1.0, d=0.7, h=0.6, mat="plastic_gray", lid="plastic_dark"):
        self.D.box((w, d, h), M=M @ T((0, 0, h / 2)), mat=mat, bevel=0.02)
        self.D.box((w + 0.02, d + 0.02, 0.06), M=M @ T((0, 0, h - 0.03)), mat=lid, bevel=0.01)
        for s in (-1, 1):
            self.D.box((0.05, 0.02, 0.12), M=M @ T((s * w * 0.3, -d / 2 - 0.01, h - 0.1)), mat="metal_steel", bevel=0.004)
        self.C.box((w, d, h), M=M @ T((0, 0, h / 2)), mat="concrete", bevel=0)

    def drum(self, M, r=0.29, h=0.88, mat="paint_blue"):
        self.D.cyl(r, h, M=M @ T((0, 0, h / 2)), mat=mat, segs=18, bevel=0.012)
        for z in (h * 0.33, h * 0.66):
            self.D.cyl(r + 0.008, 0.03, M=M @ T((0, 0, z)), mat=mat, segs=18, bevel=0.006, caps=False)
        self.C.cyl(r, h, M=M @ T((0, 0, h / 2)), mat="concrete", segs=8, bevel=0)

    def bench(self, M, w=2.2, d=0.8, h=0.92, top="metal_steel", clutter=True):
        """Steel workbench with shelf, vice and scattered tools; front on -Y."""
        D = self.D
        D.box((w, d, 0.05), M=M @ T((0, 0, h - 0.025)), mat=top, bevel=0.006)
        for sx in (-1, 1):
            for sy in (-1, 1):
                D.box((0.06, 0.06, h - 0.05), M=M @ T((sx * (w / 2 - 0.05), sy * (d / 2 - 0.05), (h - 0.05) / 2)), mat="paint_gray_dark", bevel=0.004)
        D.box((w - 0.1, d - 0.1, 0.03), M=M @ T((0, 0, 0.22)), mat="paint_gray_dark", bevel=0.004)
        D.box((w, 0.03, 0.5), M=M @ T((0, d / 2 - 0.015, h + 0.25)), mat="paint_gray", bevel=0.004)
        if clutter:
            r = self.rnd
            for _ in range(6):
                x, y = r.uniform(-w / 2 + 0.15, w / 2 - 0.15), r.uniform(-d / 2 + 0.1, d / 2 - 0.15)
                kind = r.choice(["box", "cyl", "tool"])
                Mi = M @ T((x, y, h)) @ RZ(r.uniform(0, 180))
                if kind == "box":
                    D.box((r.uniform(0.1, 0.28), r.uniform(0.08, 0.2), r.uniform(0.05, 0.16)), M=Mi, mat=r.choice(["plastic_red", "plastic_dark", "paint_yellow", "plastic_gray"]), bevel=0.008, origin="bottom")
                elif kind == "cyl":
                    D.cyl(r.uniform(0.03, 0.06), r.uniform(0.1, 0.22), M=Mi @ T((0, 0, 0.08)), mat=r.choice(["metal_steel", "paint_blue", "metal_brass"]), segs=10, bevel=0.004)
                else:
                    D.box((0.26, 0.03, 0.015), M=Mi @ T((0, 0, 0.008)), mat="metal_chrome", bevel=0.003)
                    D.box((0.1, 0.035, 0.03), M=Mi @ T((-0.16, 0, 0.015)), mat="plastic_red", bevel=0.008)
            for k in range(5):
                D.box((0.03, 0.012, r.uniform(0.14, 0.3)), M=M @ T((-w / 2 + 0.25 + k * 0.16, d / 2 - 0.036, h + 0.3)), mat="metal_chrome", bevel=0.003)
        self.C.box((w, d, h), M=M @ T((0, 0, h / 2)), mat="concrete", bevel=0)

    def shelving(self, M, w=2.2, d=0.6, h=2.6, levels=5, fill=0.8):
        """Steel pallet shelving stocked with cases and bins; front on -Y."""
        D, r = self.D, self.rnd
        for sx in (-1, 1):
            for sy in (-1, 1):
                D.box((0.05, 0.05, h), M=M @ T((sx * (w / 2 - 0.025), sy * (d / 2 - 0.025), h / 2)), mat="paint_blue", bevel=0)
        for k in range(levels):
            z = 0.12 + k * (h - 0.2) / levels
            D.box((w, d, 0.035), M=M @ T((0, 0, z)), mat="paint_orange", bevel=0)
            x = -w / 2 + 0.1
            while x < w / 2 - 0.3:
                bw = r.uniform(0.3, 0.7)
                if r.random() < fill and x + bw < w / 2 - 0.05:
                    bh = r.uniform(0.18, (h - 0.2) / levels - 0.08)
                    D.box((bw - 0.03, d * r.uniform(0.6, 0.9), bh), M=M @ T((x + bw / 2, r.uniform(-0.03, 0.03), z + 0.018 + bh / 2)),
                          mat=r.choice(["plastic_gray", "plastic_dark", "canvas", "paint_olive", "plastic_white", "paint_tan", "plastic_green"]), bevel=0.01)
                x += bw
        self.C.box((w, d, h), M=M @ T((0, 0, h / 2)), mat="concrete", bevel=0)

    def table(self, M, w=3.0, d=1.2, h=0.75, top="plastic_dark", leg="metal_steel"):
        self.D.box((w, d, 0.05), M=M @ T((0, 0, h - 0.025)), mat=top, bevel=0.01)
        for sx in (-1, 1):
            self.D.box((0.08, d * 0.7, h - 0.05), M=M @ T((sx * (w / 2 - 0.3), 0, (h - 0.05) / 2)), mat=leg, bevel=0.006)
            self.D.box((0.1, d * 0.85, 0.04), M=M @ T((sx * (w / 2 - 0.3), 0, 0.02)), mat=leg, bevel=0.006)
        self.C.box((w, d, h), M=M @ T((0, 0, h / 2)), mat="concrete", bevel=0)

    # ------------------------------------------------------------------ finish
    def finish(self, tess=None, bake=True, rays=10, lights=True, light_gain=1.0, fill=0.012, ground_z=None, sky_dist=30.0):
        """Create the objects, bake AO + artificial lighting, and return them."""
        shell = self.S.finish(sharp=40, tess=tess, col=0)
        props(shell, part="shell")
        out, baked = [shell], [shell]
        for (name, Dp, Ep, Gp) in self.sections:
            if len(Dp.bm.faces):
                d = Dp.finish(sharp=38, col=0)
                props(d, part=f"detail_{name}", section=name)
                out.append(d)
                baked.append(d)
            if len(Ep.bm.faces):
                e = Ep.finish(sharp=40, col=0, shadow=0)
                props(e, part=f"emit_{name}", section=name)
                out.append(e)
            if len(Gp.bm.faces):
                g = Gp.finish(sharp=40, col=0, shadow=0)
                props(g, part=f"glass_{name}", section=name)
                out.append(g)
        col = self.C.finish(sharp=40, weighted=False, colonly=1)
        if bake:
            L = scene_lights() if lights else None
            bake_ao(baked + self.dyn, rays=rays, local_dist=1.4, sky_dist=sky_dist, lights=L, light_gain=light_gain, fill=fill, ground_z=ground_z)
        return out + [col] + self.dyn
