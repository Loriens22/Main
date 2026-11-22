"""Rock pieces shared by the habitat and cave builders."""
import math

import bmesh
from mathutils import Vector, noise
from bl import xf


def fbm3(p, octaves=4, lac=2.1, gain=0.5):
    """fractal noise: the weathered surface of the rock at several scales"""
    a, f, t = 1.0, 1.0, 0.0
    for _ in range(octaves):
        t += a * noise.noise(p * f)
        a *= gain
        f *= lac
    return t


def basalt_block(P, at, size, rot, seed, mat="basalt_wet", round_=0.25, cuts=9, rough=1.0):
    """an angular basalt block: a box rounded toward a superellipsoid, its faces worn by multi-scale noise, with
    shallow joint cracks across them and slightly sunken, flattened tops (the look of jointed lava rock)"""
    tb = bmesh.new()
    bmesh.ops.create_cube(tb, size=1.0)
    bmesh.ops.subdivide_edges(tb, edges=tb.edges[:], cuts=cuts, use_grid_fill=True)
    off = Vector((seed * 3.1, seed * 1.7, seed * 2.3))
    sx, sy, sz = size
    for v in tb.verts:
        c = v.co
        n = Vector((c.x * 2, c.y * 2, c.z * 2))
        m = max(abs(n.x), abs(n.y), abs(n.z))
        sph = n.normalized() * m
        p = n.lerp(sph, round_)
        w = p * Vector((sx, sy, sz)) * 0.5
        # broad lumps, then pitting; the joints: narrow grooves where a ridged noise peaks
        d = fbm3(w * 0.55 + off, 4) * 0.09 * rough + fbm3(w * 3.2 + off, 3) * 0.022 * rough
        j = 1.0 - abs(noise.noise(w * Vector((0.9, 0.9, 0.25)) + off * 1.3))
        d -= max(0.0, j - 0.93) * 0.55 * rough
        top = max(0.0, n.z) ** 3
        p = p * (1 + d * (1 - 0.6 * top))
        v.co = Vector((p.x * sx * 0.5, p.y * sy * 0.5, p.z * sz * 0.5))
    P._emit(tb, mat, xf(at, rot))


