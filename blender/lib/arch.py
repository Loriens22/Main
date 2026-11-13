"""Architectural building blocks on top of bl.Part: framed walls with openings, windows, doors,
floors, stairs and pitched roofs. Each visible piece also emits a simplified collision solid."""
from __future__ import annotations

import math

from bl import *  # noqa: F401,F403
from mathutils import Matrix, Vector


def frame_matrix(origin, xdir, ydir, zdir=None):
    x = Vector(xdir).normalized()
    y = Vector(ydir).normalized()
    z = Vector(zdir).normalized() if zdir is not None else x.cross(y).normalized()
    m = Matrix(((x.x, y.x, z.x, origin[0]), (x.y, y.y, z.y, origin[1]), (x.z, y.z, z.z, origin[2]), (0, 0, 0, 1)))
    return m


class Bldg:
    """Collects a building into parts: exterior shell, interior, glass, collision + movable leaves."""

    def __init__(self, name):
        self.name = name
        self.ext = Part(name + "_ext")
        self.int = Part(name + "_int")
        self.glass = Part(name + "_glass")
        self.col = Part(name + "_col")
        self.dyn = []  # (object) movable parts created so far
        self.T_OUT, self.T_IN = 0.09, 0.07
        self.inside = False  # when True, 'exterior' trim of an opening goes to the interior part (partitions)

    # ------------------------------------------------------------------ frames
    @staticmethod
    def wall_frame(a, b, z=0.0):
        """Local frame of a wall: x along a->b, y pointing to the interior (left of travel), z up."""
        a, b = Vector((a[0], a[1], z)), Vector((b[0], b[1], z))
        d = (b - a)
        L = d.length
        d.normalize()
        n = Vector((-d.y, d.x, 0))
        return frame_matrix(a, d, n, (0, 0, 1)), L

    @staticmethod
    def _outline(L, z0, z1, openings, gable=None):
        """Wall elevation polygon (u, z) with door notches cut from the bottom edge, plus window holes."""
        notches = sorted([o for o in openings if o[2] <= z0 + 1e-4], key=lambda o: o[0])
        holes = [o for o in openings if o[2] > z0 + 1e-4]
        pts = [(0.0, z0)]
        for (u0, u1, _, zt) in notches:
            pts += [(u0, z0), (u0, zt), (u1, zt), (u1, z0)]
        pts.append((L, z0))
        if gable is None:
            pts += [(L, z1), (0.0, z1)]
        else:
            # gable = list of extra (u, z) points along the top from right to left
            pts.append((L, z1))
            pts += [(u, z) for (u, z) in gable]
            pts.append((0.0, z1))
        hole_polys = [[(u0, zb), (u0, zt), (u1, zt), (u1, zb)] for (u0, u1, zb, zt) in holes]
        return pts, hole_polys

    @staticmethod
    def _wall_mesh(L, z0, z1, T, openings, gable=None, cell=1.0, u_inset=0.0):
        """Watertight quad-grid wall slab in the wall frame (x = u, y = 0..T, z). Cells covered by an
        opening are left out and their reveals are closed. Returns (verts, faces) with outward winding."""
        def breaks(lo, hi, extra):
            pts = sorted(set([lo, hi] + [v for v in extra if lo < v < hi]))
            out = [pts[0]]
            for a2, b2 in zip(pts[:-1], pts[1:]):
                n = max(1, int(math.ceil((b2 - a2) / cell - 1e-6)))
                for k in range(1, n + 1):
                    out.append(a2 + (b2 - a2) * k / n)
            return out
        us = breaks(u_inset, L - u_inset, [o[0] for o in openings] + [o[1] for o in openings])
        zs = breaks(z0, z1, [o[2] for o in openings] + [o[3] for o in openings])
        nu, nz = len(us) - 1, len(zs) - 1

        def is_open(i, j):
            if i < 0 or j < 0 or i >= nu or j >= nz:
                return True
            cu, cz = (us[i] + us[i + 1]) / 2, (zs[j] + zs[j + 1]) / 2
            return any(o[0] < cu < o[1] and o[2] < cz < o[3] for o in openings)

        verts, index, faces = [], {}, []

        def v(u, y, z):
            key = (round(u, 5), round(y, 5), round(z, 5))
            if key not in index:
                index[key] = len(verts)
                verts.append((u, y, z))
            return index[key]

        for i in range(nu):
            for j in range(nz):
                if is_open(i, j):
                    continue
                u0, u1, a0, a1 = us[i], us[i + 1], zs[j], zs[j + 1]
                faces.append((v(u0, 0, a0), v(u1, 0, a0), v(u1, 0, a1), v(u0, 0, a1)))            # front (-y)
                faces.append((v(u0, T, a1), v(u1, T, a1), v(u1, T, a0), v(u0, T, a0)))            # back (+y)
                if is_open(i - 1, j):
                    faces.append((v(u0, 0, a0), v(u0, 0, a1), v(u0, T, a1), v(u0, T, a0)))        # -u side
                if is_open(i + 1, j):
                    faces.append((v(u1, 0, a0), v(u1, T, a0), v(u1, T, a1), v(u1, 0, a1)))        # +u side
                if is_open(i, j - 1):
                    faces.append((v(u0, 0, a0), v(u0, T, a0), v(u1, T, a0), v(u1, 0, a0)))        # bottom
                if is_open(i, j + 1) and not (gable and j == nz - 1):
                    faces.append((v(u0, 0, a1), v(u1, 0, a1), v(u1, T, a1), v(u0, T, a1)))        # top
        if gable:
            top = [(us[0], z1)] + [(u, z) for (u, z) in reversed(gable)] + [(us[-1], z1)]         # left -> right over the peak
            eave = [(u, z1) for u in us]
            # front and back fans from the eave row to the gable outline (single peak supported per fan)
            pk = max(top, key=lambda q: q[1])
            for a2, b2 in zip(eave[:-1], eave[1:]):
                faces.append((v(a2[0], 0, a2[1]), v(b2[0], 0, b2[1]), v(pk[0], 0, pk[1])))
                faces.append((v(b2[0], T, b2[1]), v(a2[0], T, a2[1]), v(pk[0], T, pk[1])))
            for a2, b2 in zip(top[:-1], top[1:]):
                faces.append((v(a2[0], 0, a2[1]), v(b2[0], 0, b2[1]), v(b2[0], T, b2[1]), v(a2[0], T, a2[1])))
        return verts, faces

    # ------------------------------------------------------------------ walls
    def wall(self, a, b, z0, z1, openings=(), out="siding_white", inn="plaster", gable=None, col=True):
        """Exterior wall from a to b (interior on the left). openings: (u0, u1, z_bottom, z_top) absolute z."""
        M, L = self.wall_frame(a, b)
        # Pull the wall ends 3 mm inside the perpendicular walls so that end faces are never coplanar
        # with a neighbouring wall's outer face (which would z-fight in the engine and shadow in Cycles).
        e = 0.003
        vo, fo = self._wall_mesh(L, z0, z1, self.T_OUT, openings, gable, u_inset=e)
        self.ext.mesh(vo, fo, mat=out, M=M, bevel=0, recalc=False, smooth=False)
        vi, fi = self._wall_mesh(L, z0, z1, self.T_IN, openings, gable, u_inset=e)
        self.int.mesh(vi, fi, mat=inn, M=M @ Matrix.Translation((0, self.T_OUT, 0)), bevel=0, recalc=False, smooth=False)
        if col:
            vc, fc = self._wall_mesh(L, z0, z1, self.T_OUT + self.T_IN, openings, gable, cell=50.0)
            self.col.mesh(vc, fc, mat="concrete", M=M, bevel=0, recalc=False)
        return M, L

    def partition(self, a, b, z0, z1, openings=(), mat="plaster", mat_b=None, t=0.11, gable=None, col=True):
        """Interior wall centred on the line a-b."""
        M, L = self.wall_frame(a, b)
        M = M @ Matrix.Translation((0, -t / 2, 0))
        if mat_b is None or mat_b == mat:
            vv, ff = self._wall_mesh(L, z0, z1, t, openings, gable)
            self.int.mesh(vv, ff, mat=mat, M=M, bevel=0, recalc=False, smooth=False)
        else:
            vv, ff = self._wall_mesh(L, z0, z1, t / 2, openings, gable)
            self.int.mesh(vv, ff, mat=mat_b, M=M, bevel=0, recalc=False, smooth=False)
            self.int.mesh(vv, ff, mat=mat, M=M @ Matrix.Translation((0, t / 2, 0)), bevel=0, recalc=False, smooth=False)
        if col:
            vc, fc = self._wall_mesh(L, z0, z1, t, openings, gable, cell=50.0)
            self.col.mesh(vc, fc, mat="concrete", M=M, bevel=0, recalc=False)
        return M, L

    # ------------------------------------------------------------------ openings
    def casing(self, M, u0, u1, zb, zt, T, ext_mat="wood_trim", int_mat="wood_trim", sill=True, w=0.11, interior=True, exterior=True):
        """Trim boards around an opening on both faces plus jamb liners through the wall thickness T."""
        I = self.int
        E = self.int if self.inside else self.ext
        cw = u1 - u0
        ch = zt - zb
        if exterior:
            # side casings, head casing with drip cap, sill
            for u in (u0 - w / 2, u1 + w / 2):
                E.box((w, 0.026, ch + w), M=M @ Matrix.Translation((u, -0.013, zb + (ch + w) / 2)), mat=ext_mat, bevel=0.004)
            E.box((cw + 2 * w + 0.04, 0.03, w), M=M @ Matrix.Translation(((u0 + u1) / 2, -0.015, zt + w / 2)), mat=ext_mat, bevel=0.004)
            E.box((cw + 2 * w + 0.1, 0.06, 0.022), M=M @ Matrix.Translation(((u0 + u1) / 2, -0.03, zt + w + 0.011)), mat=ext_mat, bevel=0.004)
            if sill:
                E.box((cw + 2 * w + 0.06, 0.12, 0.05), M=M @ Matrix.Translation(((u0 + u1) / 2, -0.03, zb - 0.025)) @ Matrix.Rotation(math.radians(-6), 4, "X"), mat=ext_mat, bevel=0.006)
        # jamb liners
        jt = 0.022
        for u in (u0 + jt / 2, u1 - jt / 2):
            I.box((jt, T + 0.01, ch), M=M @ Matrix.Translation((u, T / 2, zb + ch / 2)), mat=int_mat, bevel=0.002)
        I.box((cw, T + 0.01, jt), M=M @ Matrix.Translation(((u0 + u1) / 2, T / 2, zt - jt / 2)), mat=int_mat, bevel=0.002)
        if sill:
            I.box((cw, T + 0.01, jt), M=M @ Matrix.Translation(((u0 + u1) / 2, T / 2, zb + jt / 2)), mat=int_mat, bevel=0.002)
        if interior:
            iw = 0.085
            for u in (u0 - iw / 2, u1 + iw / 2):
                I.box((iw, 0.02, ch + iw), M=M @ Matrix.Translation((u, T + 0.01, zb + (ch + iw) / 2)), mat=int_mat, bevel=0.004)
            I.box((cw + 2 * iw, 0.02, iw), M=M @ Matrix.Translation(((u0 + u1) / 2, T + 0.01, zt + iw / 2)), mat=int_mat, bevel=0.004)
            if sill:
                I.box((cw + 2 * iw + 0.04, 0.07, 0.028), M=M @ Matrix.Translation(((u0 + u1) / 2, T + 0.035, zb - 0.014)), mat=int_mat, bevel=0.005)
                I.box((cw + 2 * iw, 0.016, 0.07), M=M @ Matrix.Translation(((u0 + u1) / 2, T + 0.008, zb - 0.063)), mat=int_mat, bevel=0.003)

    def _sash(self, part, M, u0, u1, zb, zt, y, mat="wood_trim", glass="glass_dirty", muntins=1, rail=0.048, t=0.036, glass_part=None):
        """One glazed sash occupying (u0..u1, zb..zt) at depth y (centre of the sash thickness)."""
        cw, ch = u1 - u0, zt - zb
        for u in (u0 + rail / 2, u1 - rail / 2):
            part.box((rail, t, ch), M=M @ Matrix.Translation((u, y, zb + ch / 2)), mat=mat, bevel=0.003)
        for z in (zb + rail / 2, zt - rail / 2):
            part.box((cw - 2 * rail, t, rail), M=M @ Matrix.Translation(((u0 + u1) / 2, y, z)), mat=mat, bevel=0.003)
        for i in range(muntins):
            u = u0 + cw * (i + 1) / (muntins + 1)
            part.box((0.02, t * 0.7, ch - 2 * rail), M=M @ Matrix.Translation((u, y, zb + ch / 2)), mat=mat, bevel=0.002)
        gp = glass_part if glass_part is not None else self.glass
        gp.box((cw - 2 * rail + 0.01, 0.005, ch - 2 * rail + 0.01), M=M @ Matrix.Translation(((u0 + u1) / 2, y, zb + ch / 2)), mat=glass, bevel=0)

    def window(self, M, u0, u1, zb, zt, style="hung", wid=None, T=None, ext_mat="wood_trim", glass="glass_dirty", interior=True):
        """Double-hung window in a wall frame. style: hung | boarded | shutter | fixed.
        With wid set, the lower sash becomes a separate operable part."""
        T = T if T is not None else self.T_OUT + self.T_IN
        self.casing(M, u0, u1, zb, zt, T, ext_mat=ext_mat, interior=interior)
        j = 0.022
        a0, a1, b0, b1 = u0 + j, u1 - j, zb + j, zt - j
        mid = (b0 + b1) / 2
        if style == "fixed":
            self._sash(self.ext, M, a0, a1, b0, b1, 0.05, glass=glass, muntins=1)
        else:
            self._sash(self.ext, M, a0, a1, mid - 0.02, b1, 0.045, glass=glass)
            if wid is None:
                self._sash(self.ext, M, a0, a1, b0, mid + 0.02, 0.085, glass=glass)
            else:
                sp = Part(f"{self.name}_win_{wid}")
                gl = Part("_g")
                L = Matrix.Identity(4)
                self._sash(sp, L, a0 - (a0 + a1) / 2, a1 - (a0 + a1) / 2, 0, mid + 0.02 - b0, 0.0, glass=glass, glass_part=sp)
                ob = sp.finish(sharp=40)
                ob.matrix_world = M @ Matrix.Translation(((a0 + a1) / 2, 0.085, b0))
                props(ob, kind="window", id=wid, part=f"window_{wid}", travel=(mid - b0) * 0.82, dynamic=1, col=0)
                self.dyn.append(ob)
        if style == "boarded":
            cw, ch = u1 - u0, zt - zb
            self.ext.box((cw + 0.1, 0.014, ch + 0.08), M=M @ Matrix.Translation(((u0 + u1) / 2, -0.036, (zb + zt) / 2)), mat="wood_old", bevel=0.002)
            for z in (zb + ch * 0.22, zb + ch * 0.78):
                self.ext.box((cw + 0.16, 0.02, 0.09), M=M @ Matrix.Translation(((u0 + u1) / 2, -0.053, z)), mat="wood_old", bevel=0.003)
        elif style == "shutter":
            cw, ch = u1 - u0, zt - zb
            self.ext.box((cw * 0.98, 0.022, ch), M=M @ Matrix.Translation(((u0 + u1) / 2, -0.04, (zb + zt) / 2)), mat="wood_trim_dark", bevel=0.003)
            for i in range(9):
                z = zb + ch * (i + 0.5) / 9
                self.ext.box((cw * 0.86, 0.012, ch / 9 * 0.7), M=M @ Matrix.Translation(((u0 + u1) / 2, -0.055, z)) @ Matrix.Rotation(math.radians(25), 4, "X"), mat="wood_trim_dark", bevel=0.002)
        # collision pane so the player cannot walk through closed windows
        self.col.box((u1 - u0, 0.03, zt - zb), M=M @ Matrix.Translation(((u0 + u1) / 2, 0.06, (zb + zt) / 2)), mat="concrete", bevel=0)

    def door(self, did, M, u0, zb, w=0.9, h=2.05, T=None, hinge="left", swing="in", style="panel", mat="wood_trim",
             ext_mat="wood_trim", exterior=True, label="Door", angle=100, locked=False, sill=False):
        """Door frame + a separate hinged leaf. hinge: which jamb (left = u0) seen from the wall's outer face.
        swing 'in' opens toward +y (interior side of the wall frame)."""
        T = T if T is not None else self.T_OUT + self.T_IN
        u1, zt = u0 + w, zb + h
        self.casing(M, u0, u1, zb, zt, T, ext_mat=ext_mat, sill=False, exterior=exterior)
        if sill:
            (self.int if self.inside else self.ext).box((w + 0.1, T + 0.12, 0.03), M=M @ Matrix.Translation(((u0 + u1) / 2, T / 2 - 0.03, zb + 0.005)), mat="wood_old", bevel=0.006)
        lt = 0.044
        j = 0.024
        lw, lh = w - 2 * j - 0.006, h - j - 0.012
        lp = Part(f"{self.name}_door_{did}")
        # leaf modelled with the hinge edge at local x = 0, spanning +x, thickness centred on y = 0
        if style == "panel":
            st, r = 0.11, 0.2
            for x in (st / 2, lw - st / 2):
                lp.box((st, lt, lh), at=(x, 0, lh / 2), mat=mat, bevel=0.004)
            for z, hh in ((r / 2, r), (lh - st / 2, st), (lh * 0.47, 0.14), (lh * 0.74, 0.1)):
                lp.box((lw - 2 * st, lt, hh), at=(lw / 2, 0, z), mat=mat, bevel=0.004)
            for z0, z1 in ((r, lh * 0.47 - 0.07), (lh * 0.47 + 0.07, lh * 0.74 - 0.05), (lh * 0.74 + 0.05, lh - st)):
                for x0, x1 in ((st, lw / 2 - 0.035), (lw / 2 + 0.035, lw - st)):
                    lp.box((x1 - x0 + 0.01, lt * 0.45, z1 - z0 + 0.01), at=((x0 + x1) / 2, 0, (z0 + z1) / 2), mat=mat, bevel=0.012)
            lp.box((0.07, lt, lh - r - st), at=(lw / 2, 0, (r + lh - st) / 2), mat=mat, bevel=0.004)
        elif style == "glazed":
            st = 0.12
            for x in (st / 2, lw - st / 2):
                lp.box((st, lt, lh), at=(x, 0, lh / 2), mat=mat, bevel=0.004)
            for z, hh in ((0.12, 0.24), (lh - st / 2, st), (lh * 0.45, 0.13)):
                lp.box((lw - 2 * st, lt, hh), at=(lw / 2, 0, z), mat=mat, bevel=0.004)
            lp.box((lw - 2 * st + 0.01, lt * 0.45, lh * 0.45 - 0.065 - 0.24 + 0.01), at=(lw / 2, 0, (0.24 + lh * 0.45 - 0.065) / 2), mat=mat, bevel=0.012)
            lp.box((0.022, lt * 0.6, lh - st - lh * 0.45 - 0.065), at=(lw / 2, 0, (lh * 0.45 + 0.065 + lh - st) / 2), mat=mat, bevel=0.002)
            lp.box((lw - 2 * st + 0.01, 0.005, lh - st - lh * 0.45 - 0.065 + 0.01), at=(lw / 2, 0, (lh * 0.45 + 0.065 + lh - st) / 2), mat="glass_dirty", bevel=0)
        elif style == "flush":
            lp.box((lw, lt, lh), at=(lw / 2, 0, lh / 2), mat=mat, bevel=0.004)
        elif style == "steel":
            lp.box((lw, 0.06, lh), at=(lw / 2, 0, lh / 2), mat=mat, bevel=0.006)
            lp.box((lw - 0.16, 0.07, lh - 0.16), at=(lw / 2, 0, lh / 2), mat=mat, bevel=0.01)
            lp.box((0.3, 0.012, 0.42), at=(lw / 2, 0.036, lh * 0.72), mat="glass_dark", bevel=0)
            lp.box((0.3, 0.012, 0.42), at=(lw / 2, -0.036, lh * 0.72), mat="glass_dark", bevel=0)
        # knob + rosette on both faces, hinges
        for s in (1, -1):
            lp.cyl(0.032, 0.006, at=(lw - 0.07, s * (lt / 2 + 0.003), lh * 0.46), rot=(90, 0, 0), mat="metal_brass", segs=16, bevel=0.001)
            lp.cyl(0.011, 0.05, at=(lw - 0.07, s * (lt / 2 + 0.028), lh * 0.46), rot=(90, 0, 0), mat="metal_brass", segs=10, bevel=0)
            lp.sphere(0.027, at=(lw - 0.07, s * (lt / 2 + 0.06), lh * 0.46), mat="metal_brass", segs=14, rings=8, scale=(1, 0.75, 1))
        for z in (0.2, lh / 2, lh - 0.2):
            lp.cyl(0.008, 0.09, at=(-0.004, (lt / 2 + 0.004) * (1 if swing == "in" else -1), z), mat="metal_dark", segs=8, bevel=0)
        ob = lp.finish(sharp=40)
        # Place: hinge edge at the chosen jamb. For a right hinge the leaf is mirrored by a 180 deg turn about z.
        y = T - lt / 2 - 0.012 if swing == "in" else lt / 2 + 0.012
        if hinge == "left":
            L = Matrix.Translation((u0 + j + 0.003, y, zb + 0.008))
            sign = 1 if swing == "in" else -1
        else:
            L = Matrix.Translation((u1 - j - 0.003, y, zb + 0.008)) @ Matrix.Rotation(math.pi, 4, "Z")
            sign = -1 if swing == "in" else 1
        ob.matrix_world = M @ L
        props(ob, kind="door", id=did, part=f"door_{did}", angle=angle * sign, dynamic=1, col=0, label=label,
              w=lw, h=lh, t=lt, locked=1 if locked else 0)
        self.dyn.append(ob)
        return ob

    # ------------------------------------------------------------------ floors, stairs, roofs
    def floor(self, pts, z_top, t=0.22, top="floor_wood", bottom="ceiling", holes=None, part=None, top_part=None, col=True, joists=False):
        """Floor slab: finish layer on top, ceiling material below."""
        p = part or self.int
        tp = top_part or p
        tp.prism(pts, 0.03, at=(0, 0, z_top - 0.03), mat=top, holes=holes, bevel=0)
        p.prism(pts, t - 0.03, at=(0, 0, z_top - t), mat=bottom, holes=holes, bevel=0)
        if col:
            self.col.prism(pts, t, at=(0, 0, z_top - t), mat="concrete", holes=holes, bevel=0)

    def stairs(self, base, direction, width, rise_total, steps, run=0.26, mat="floor_wood", riser="wood_trim", stringer="wood_trim", part=None, rail=None):
        """Straight flight starting at `base` (x, y, z of the bottom front edge centre), climbing along `direction` (unit xy)."""
        p = part or self.int
        d = Vector((direction[0], direction[1], 0)).normalized()
        n = Vector((-d.y, d.x, 0))
        M = frame_matrix(base, d, n, (0, 0, 1))
        rise = rise_total / steps
        for i in range(steps):
            p.box((run + 0.03, width, 0.035), M=M @ Matrix.Translation((run * (i + 0.5) + 0.0, 0, rise * (i + 1) - 0.0175)), mat=mat, bevel=0.006)
            p.box((0.02, width, rise - 0.03), M=M @ Matrix.Translation((run * i + 0.01 + 0.018, 0, rise * i + (rise - 0.035) / 2)), mat=riser, bevel=0)
        length = run * steps
        ang = math.atan2(rise_total, length)
        hyp = math.hypot(rise_total, length)
        for s in (-1, 1):
            p.box((hyp + 0.1, 0.035, 0.28), M=M @ Matrix.Translation((length / 2, s * (width / 2 + 0.0), rise_total / 2 - 0.02)) @ Matrix.Rotation(-ang, 4, "Y"), mat=stringer, bevel=0.004)
        # smooth collision ramp instead of individual steps
        self.col.box((hyp, width, 0.1), M=M @ Matrix.Translation((length / 2, 0, rise_total / 2 - 0.02)) @ Matrix.Rotation(-ang, 4, "Y"), mat="concrete", bevel=0)
        if rail:
            side = 1 if rail == "left" else -1
            ry = side * (width / 2 - 0.04)
            p.box((hyp, 0.05, 0.06), M=M @ Matrix.Translation((length / 2, ry, rise_total / 2 + 0.92)) @ Matrix.Rotation(-ang, 4, "Y"), mat="wood_dark", bevel=0.012)
            for i in range(0, steps, 1):
                p.box((0.03, 0.03, 0.9), M=M @ Matrix.Translation((run * (i + 0.5), ry, rise * (i + 1) + 0.45)), mat=riser, bevel=0.003)
            self.col.box((hyp, 0.06, 1.0), M=M @ Matrix.Translation((length / 2, ry, rise_total / 2 + 0.5)) @ Matrix.Rotation(-ang, 4, "Y"), mat="concrete", bevel=0)
        return M

    def roof_slab(self, eave_a, eave_b, eave_z, inward, run, pitch_deg, t=0.11, overhang=0.35, rake=0.25, mat="shingles",
                  under="wood_old", fascia="wood_trim", part=None, col=True, soffit=True):
        """One rectangular roof plane. eave_a -> eave_b is the wall line under the eave (xy), `inward` the horizontal unit
        direction toward the ridge, `run` the horizontal distance from wall line to ridge."""
        p = part or self.ext
        a, b = Vector((eave_a[0], eave_a[1], 0)), Vector((eave_b[0], eave_b[1], 0))
        xd = (b - a).normalized()
        L = (b - a).length + 2 * rake
        pr = math.radians(pitch_deg)
        hin = Vector((inward[0], inward[1], 0)).normalized()
        yd = hin * math.cos(pr) + Vector((0, 0, 1)) * math.sin(pr)
        slope = (run + overhang) / math.cos(pr)
        mid = (a + b) / 2 - hin * overhang + Vector((0, 0, eave_z - overhang * math.tan(pr)))
        centre = mid + yd * (slope / 2)
        zd = xd.cross(yd)
        if zd.z < 0:
            xd = -xd
            zd = xd.cross(yd)
        M = frame_matrix(centre, xd, yd, zd)
        p.box((L, slope + 0.04, 0.035), M=M @ Matrix.Translation((0, 0, t - 0.0175)), mat=mat, bevel=0.004)
        p.box((L - 0.02, slope, t - 0.035), M=M @ Matrix.Translation((0, 0, (t - 0.035) / 2)), mat=under, bevel=0)
        # fascia along the eave and barge boards on the rakes
        p.box((L + 0.04, 0.03, 0.17), M=M @ Matrix.Translation((0, -slope / 2 - 0.015, t / 2 - 0.03)), mat=fascia, bevel=0.004)
        for s in (-1, 1):
            p.box((0.03, slope + 0.05, 0.16), M=M @ Matrix.Translation((s * (L / 2 + 0.015), 0, t / 2 - 0.025)), mat=fascia, bevel=0.004)
        if col:
            self.col.box((L, slope, t), M=M @ Matrix.Translation((0, 0, t / 2)), mat="concrete", bevel=0)
        return M, L, slope


def gable_points(L, z_eave, z_ridge):
    """Top outline points (right to left) for a symmetric gable end of width L."""
    return [(L / 2, z_ridge)]
