# Sculpture and architectural ornament for the hand-built landmarks, modelled in Blender:
#   bronze eagle with raised wings (Eagles' Bridge), recumbent stone lion (Rectorate stair), standing robed
#   figure holding a book (the saints, St Kliment, the philosophers), seated figure in an armchair (the
#   donors), Corinthian capital, fluted column shaft, Attic column base, baluster.
# Figures are sculpted from skeletons with the Skin modifier, subdivided, with drapery folds displaced on
# the robes; the high-poly is decimated to a game low-poly and everything is baked into one 1024 px atlas
# (albedo, normals, AO, roughness / metalness). Output: src/data/kit_landmark.glb
#
#   python tools/blender/kit_landmark.py [--preview DIR] [--only a,b]      (Blender 5.x Python: `bpy`)
# Local frame of every piece (three.js): +x right, +y up, +z forward (the way the figure faces).
import math
import os
import sys

import bpy
import bmesh
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kitlib import (W, reset, mat, box, cyl, torus, tube, from_pydata, join, sharpen, tri_count, Atlas,
                    export_glb, apply_mods, triangulate)

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'src', 'data', 'kit_landmark.glb')


def M():
    return dict(
        bronze=mat('bronze', (0.16, 0.2, 0.15), 0.42, 0.75, noise=0.35, nscale=14, bump=0.15, bscale=120, grime=0.2),
        bronzeDark=mat('bronzeDark', (0.1, 0.11, 0.09), 0.5, 0.7, noise=0.25, nscale=20),
        stone=mat('stoneLion', (0.66, 0.64, 0.6), 0.85, 0.0, noise=0.18, nscale=8, bump=0.3, bscale=160, grime=0.25),
        marble=mat('marble', (0.86, 0.84, 0.8), 0.6, 0.0, noise=0.08, nscale=6, bump=0.1, bscale=150, grime=0.15),
    )


def ground_plane():
    return from_pydata('occ_ground', [(-4, 0, -4), (4, 0, -4), (4, 0, 4), (-4, 0, 4)], [(0, 3, 2, 1)])


def skin(name, verts, edges, radii, m, subdiv=2, smooth=True):
    """Skin-modifier body from a skeleton: verts (wall-frame points), edges, radii per vertex (r or (rx, ry))."""
    me = bpy.data.meshes.new(name)
    me.from_pydata([W(*v) for v in verts], edges, [])
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    md = o.modifiers.new('skin', 'SKIN')
    md.use_smooth_shade = smooth
    sv = me.skin_vertices[0].data
    for i, r in enumerate(radii):
        sv[i].radius = (r, r) if not isinstance(r, tuple) else r
    sv[0].use_root = True
    sd = o.modifiers.new('sub', 'SUBSURF')
    sd.levels = subdiv
    sd.render_levels = subdiv
    apply_mods(o)
    me = o.data
    me.materials.append(m)
    for p in me.polygons:
        p.use_smooth = True
    return o


def displace(o, fn):
    """Move every vertex along its normal by fn(local wall-frame position, normal)."""
    me = o.data
    me.calc_normals_split() if hasattr(me, 'calc_normals_split') else None
    for v in me.vertices:
        c, n = v.co, v.normal
        t, u, nn = c.x, c.z, -c.y
        d = fn((t, u, nn), (n.x, n.z, -n.y))
        v.co = c + n * d
    me.update()
    return o


def lathe(name, prof, m, segs=32, fold=None):
    """Surface of revolution about the vertical axis from [(r, u)]; fold(angle, u) adds to the radius."""
    verts, faces = [], []
    for j, (r, u) in enumerate(prof):
        for k in range(segs):
            a = 2 * math.pi * k / segs
            rr = r + (fold(a, u) if fold else 0)
            verts.append((rr * math.cos(a), u, rr * math.sin(a)))
    for j in range(len(prof) - 1):
        for k in range(segs):
            a, b = j * segs + k, j * segs + (k + 1) % segs
            faces.append((a, b, b + segs, a + segs))
    return from_pydata(name, verts, faces, m, smooth=True)


def decimated(hi, name, ratio):
    """Low-poly from a copy of the high-poly parts: joined, decimated, triangulated."""
    copies = []
    for o in hi:
        c = o.copy()
        c.data = o.data.copy()
        bpy.context.scene.collection.objects.link(c)
        copies.append(c)
    lo = join(copies, name)
    md = lo.modifiers.new('dec', 'DECIMATE')
    md.ratio = ratio
    md.use_collapse_triangulate = True
    apply_mods(lo)
    lo.data.materials.clear()
    return lo


# ------------------------------------------------------------------ eagle
def eagle(m):
    """Bronze eagle on a globe, wings raised and half spread; about 1.2 m tall, 1.6 m span."""
    br = m['bronze']
    hi = []
    hi.append(cyl('e_globe', (0, -0.02, 0), (0, 0.0, 0), 0.2, br, segs=24))
    globe = lathe('e_globeS', [(0.001, -0.16), (0.12, -0.13), (0.18, -0.06), (0.2, 0.0), (0.18, 0.07), (0.1, 0.13), (0.001, 0.15)], br, segs=32)
    hi.append(globe)
    # body: tail - hips - chest - neck - head (leaning forward, head turned a little)
    V = [(0, 0.34, -0.42), (0, 0.38, -0.16), (0, 0.5, 0.05), (0, 0.66, 0.14), (0.03, 0.78, 0.2), (0.05, 0.84, 0.26)]
    R = [(0.05, 0.03), (0.15, 0.14), (0.17, 0.17), (0.09, 0.09), (0.075, 0.075), (0.065, 0.06)]
    body = skin('e_body', V, [(i, i + 1) for i in range(len(V) - 1)], R, br, subdiv=2)
    # ruffled feathers on breast and neck
    displace(body, lambda p, n: 0.006 * math.sin(p[1] * 90 + p[0] * 40) * math.sin(p[0] * 70 + p[2] * 30))
    hi.append(body)
    # hooked beak
    hi.append(cyl('e_beak', (0.05, 0.835, 0.3), (0.06, 0.82, 0.39), 0.028, br, segs=10, r1=0.008))
    hi.append(cyl('e_beakH', (0.06, 0.825, 0.385), (0.062, 0.795, 0.4), 0.01, br, segs=8, r1=0.003))
    for sx in (-1, 1):
        hi.append(cyl(f'e_eye{sx}', (0.05 + sx * 0.045, 0.85, 0.3), (0.05 + sx * 0.05, 0.85, 0.3), 0.012, m['bronzeDark'], segs=8))
    # legs (feathered thighs) gripping the globe, talons
    for sx in (-1, 1):
        leg = skin(f'e_leg{sx}', [(sx * 0.07, 0.36, -0.08), (sx * 0.09, 0.22, -0.02), (sx * 0.09, 0.15, 0.02)], [(0, 1), (1, 2)], [0.07, 0.05, 0.025], br, subdiv=1)
        hi.append(leg)
        for k in range(3):
            a = (k - 1) * 0.45
            hi.append(cyl(f'e_tal{sx}{k}', (sx * 0.09, 0.15, 0.02), (sx * 0.09 + math.sin(a) * 0.07, 0.14, 0.02 + math.cos(a) * 0.07), 0.012, br, segs=6, r1=0.004))
    # wings: a lofted feathered surface from the arm (leading edge) back and down to scalloped feather tips,
    # five fingered primaries at the tip, grooves between the feathers, two rows of coverts
    def crom(P, t):
        n = len(P) - 1
        i = min(n - 1, int(t * n))
        f = t * n - i
        p0, p1, p2, p3 = P[max(0, i - 1)], P[i], P[i + 1], P[min(n, i + 2)]
        return 0.5 * ((2 * p1) + (-p0 + p2) * f + (2 * p0 - 5 * p1 + 4 * p2 - p3) * f * f + (-p0 + 3 * p1 - 3 * p2 + p3) * f * f * f)
    for sx in (-1, 1):
        P = [Vector((sx * 0.1, 0.56, 0.0)), Vector((sx * 0.38, 0.82, -0.05)), Vector((sx * 0.64, 1.02, -0.1)), Vector((sx * 0.86, 1.14, -0.16))]
        hi.append(skin(f'e_arm{sx}', [tuple(p) for p in P], [(0, 1), (1, 2), (2, 3)], [(0.075, 0.045), (0.055, 0.032), (0.035, 0.022), (0.016, 0.012)], br, subdiv=1))
        NU, NV, nf = 48, 10, 14
        verts, faces = [], []
        for i in range(NU + 1):
            t = i / NU
            L = crom(P, t)
            d = Vector((sx * (0.06 + 0.22 * t), -0.9 + 0.25 * t, -0.28 - 0.08 * t)).normalized()  # wings displayed: their faces towards the front
            chord = (0.24 + 0.46 * math.sin(math.pi * min(1, t * 1.15) * 0.92)) * (1 + 0.07 * abs(math.sin(t * nf * math.pi)))
            for j in range(NV + 1):
                v = j / NV
                # gentle camber, feather grooves along the chord, the tips of the feathers fanning a little
                q = L + d * chord * v + Vector((0, 0, 0.03 * math.sin(math.pi * v))) + Vector((sx * 0.004 * math.cos(2 * math.pi * t * nf) * v, 0, 0))
                verts.append(tuple(q))
        for i in range(NU):
            for j in range(NV):
                k = i * (NV + 1) + j
                faces.append((k, k + 1, k + NV + 2, k + NV + 1) if sx > 0 else (k, k + NV + 1, k + NV + 2, k + 1))
        wing = from_pydata(f'e_wing{sx}', verts, faces, br, smooth=True)
        md = wing.modifiers.new('sol', 'SOLIDIFY')
        md.thickness = 0.018
        md.offset = 0
        apply_mods(wing)
        hi.append(wing)
        # fingered primaries beyond the tip
        for k in range(5):
            root = crom(P, 0.82 + 0.04 * k)
            d = Vector((sx * (0.4 - 0.05 * k), 0.12 - 0.25 * k, -0.12 - 0.03 * k)).normalized()
            fe = cyl(f'e_p{sx}{k}', tuple(root), tuple(root + d * (0.34 - 0.03 * k)), 0.04, br, segs=8, r1=0.012)
            for v in fe.data.vertices:  # flatten into a vane
                v.co.y = v.co.y * 0.35 + (-root.z) * 0.65 if False else v.co.y
            hi.append(fe)
        # coverts over the leading edge
        for row in range(2):
            for k in range(9):
                t = (k + 0.5) / 9 * 0.8
                root = crom(P, t) + Vector((0, -0.03 - row * 0.07, -0.03 - row * 0.05))
                d = Vector((sx * 0.05, -0.85, -0.3)).normalized()
                c = cyl(f'e_cv{sx}{row}{k}', tuple(root), tuple(root + d * 0.12), 0.045, br, segs=8, r1=0.025)
                hi.append(c)
    # tail fan
    for k in range(7):
        a = (k - 3) * 0.12
        root = Vector((0, 0.34, -0.42))
        end = root + Vector((math.sin(a) * 0.3, -0.18, -0.34))
        hi.append(cyl(f'e_t{k}', tuple(root), tuple(end), 0.04, br, segs=6, r1=0.025))
    lo = decimated(hi, 'eagle', 0.06)
    return hi, lo, None


# ------------------------------------------------------------------ lion
def lion(m):
    """Recumbent lion on a slab, head up, forepaws forward; ~0.9 m tall, 1.8 m long. Origin: front-centre of the slab."""
    st = m['stone']
    hi = [box('l_slab', -0.48, 0.48, 0.0, 0.12, -1.85, 0.0, st, bev=0.02)]
    z0 = -0.95
    body = skin('l_body', [(0, 0.48, z0 - 0.6), (0, 0.52, z0 - 0.15), (0, 0.6, z0 + 0.3), (0, 0.84, z0 + 0.52), (0, 0.92, z0 + 0.66)], [(0, 1), (1, 2), (2, 3), (3, 4)],
                [(0.3, 0.27), (0.29, 0.29), (0.3, 0.33), (0.17, 0.17), (0.15, 0.15)], st, subdiv=2)
    hi.append(body)
    # mane: one heavy volume over the neck, shoulders and chest, worked into curls
    mane = skin('l_mane', [(0, 0.6, z0 + 0.3), (0, 0.76, z0 + 0.42), (0, 0.9, z0 + 0.52), (0, 0.97, z0 + 0.6)], [(0, 1), (1, 2), (2, 3)],
                [(0.2, 0.18), (0.24, 0.22), (0.25, 0.25), (0.18, 0.2)], st, subdiv=3)
    displace(mane, lambda p, n: 0.022 * math.sin(p[0] * 55 + p[1] * 20) * math.sin(p[1] * 60 + p[2] * 25) + 0.01 * math.sin(p[0] * 130 + p[2] * 90))
    hi.append(mane)
    # head: skull, muzzle, nose pad, chin, brows, eyes, ears half hidden in the mane
    hi.append(skin('l_head', [(0, 0.93, z0 + 0.62), (0, 0.91, z0 + 0.76)], [(0, 1)], [(0.14, 0.13), (0.11, 0.1)], st, subdiv=2))
    hi.append(skin('l_muz', [(0, 0.86, z0 + 0.77), (0, 0.85, z0 + 0.9)], [(0, 1)], [(0.085, 0.07), (0.068, 0.058)], st, subdiv=2))
    hi.append(skin('l_nose', [(0, 0.905, z0 + 0.88), (0, 0.9, z0 + 0.93)], [(0, 1)], [(0.04, 0.025), (0.038, 0.025)], st, subdiv=2))
    hi.append(skin('l_chin', [(0, 0.79, z0 + 0.8), (0, 0.79, z0 + 0.88)], [(0, 1)], [(0.055, 0.035), (0.04, 0.03)], st, subdiv=1))
    for sx in (-1, 1):
        hi.append(cyl(f'l_ear{sx}', (sx * 0.1, 1.03, z0 + 0.6), (sx * 0.12, 1.08, z0 + 0.58), 0.045, st, segs=8, r1=0.02))
        hi.append(skin(f'l_brow{sx}', [(sx * 0.02, 0.98, z0 + 0.78), (sx * 0.08, 0.97, z0 + 0.76)], [(0, 1)], [0.025, 0.02], st, subdiv=1))
        hi.append(cyl(f'l_eye{sx}', (sx * 0.055, 0.95, z0 + 0.79), (sx * 0.057, 0.95, z0 + 0.8), 0.017, st, segs=8))
    # forelegs stretched forward, paws with toes
    for sx in (-1, 1):
        hi.append(skin(f'l_fl{sx}', [(sx * 0.17, 0.5, z0 + 0.28), (sx * 0.19, 0.24, z0 + 0.45), (sx * 0.19, 0.16, z0 + 0.75), (sx * 0.19, 0.17, z0 + 0.86)],
                       [(0, 1), (1, 2), (2, 3)], [0.12, 0.08, 0.065, 0.075], st, subdiv=2))
        for k in range(4):
            hi.append(cyl(f'l_toe{sx}{k}', (sx * 0.19 + (k - 1.5) * 0.035, 0.155, z0 + 0.88), (sx * 0.19 + (k - 1.5) * 0.035, 0.15, z0 + 0.93), 0.022, st, segs=8))
        # hind legs folded under the haunch
        hi.append(skin(f'l_hl{sx}', [(sx * 0.2, 0.48, z0 - 0.5), (sx * 0.3, 0.3, z0 - 0.3), (sx * 0.27, 0.17, z0 - 0.62), (sx * 0.24, 0.17, z0 - 0.3)],
                       [(0, 1), (1, 2), (2, 3)], [0.2, 0.12, 0.07, 0.07], st, subdiv=2))
    # tail along the slab, tuft at the end
    hi.append(tube('l_tail', [(0, 0.45, z0 - 0.82), (0.22, 0.2, z0 - 0.85), (0.34, 0.15, z0 - 0.5), (0.36, 0.15, z0 - 0.15)], 0.03, st, segs=8, res=8))
    hi.append(skin('l_tuft', [(0.36, 0.15, z0 - 0.18), (0.36, 0.16, z0 - 0.06)], [(0, 1)], [0.045, 0.02], st, subdiv=1))
    lo = decimated(hi, 'lion', 0.05)
    return hi, lo, ground_plane()


# ------------------------------------------------------------------ standing robed figure
def figure_standing(m):
    """Robed figure holding an open book, 1.0 m tall (scaled to the statue's height); faces +z.
    Body from a branched skeleton (Skin modifier), a long gown with folds from the waist down, wide sleeves,
    a cloak hanging from the shoulders, bearded head with hair falling to the nape."""
    br = m['bronze']
    hi = []
    V = [(0, 0.5, 0.0), (0, 0.6, 0.005), (0, 0.71, 0.012), (0, 0.79, 0.0), (0, 0.84, 0.0), (0, 0.875, 0.008), (0, 0.925, 0.015), (0, 0.968, 0.005),
         (-0.125, 0.81, -0.005), (-0.155, 0.67, 0.025), (-0.085, 0.625, 0.11), (-0.035, 0.635, 0.13),
         (0.125, 0.81, -0.005), (0.175, 0.69, 0.07), (0.16, 0.79, 0.15), (0.15, 0.855, 0.165)]
    E = [(0, 1), (1, 2), (2, 3), (3, 4), (4, 5), (5, 6), (6, 7), (3, 8), (8, 9), (9, 10), (10, 11), (3, 12), (12, 13), (13, 14), (14, 15)]
    R = [(0.12, 0.09), (0.11, 0.08), (0.13, 0.085), (0.145, 0.085), (0.05, 0.05), (0.042, 0.042), (0.056, 0.064), (0.045, 0.05),
         (0.055, 0.05), (0.045, 0.045), (0.035, 0.035), (0.026, 0.022), (0.055, 0.05), (0.045, 0.045), (0.034, 0.034), (0.024, 0.02)]
    body = skin('f_body', V, E, R, br, subdiv=2)
    # drapery creases over chest and arms
    displace(body, lambda p, n: 0.004 * math.sin(p[1] * 140 + p[0] * 30) if p[1] < 0.85 else 0.0)
    hi.append(body)
    # gown from the waist to the ground: wider to the hem, deep vertical folds, a little flatter front-back
    prof = [(0.115, 0.62), (0.125, 0.52), (0.14, 0.4), (0.16, 0.25), (0.18, 0.1), (0.19, 0.02), (0.17, 0.0), (0.001, 0.0)]
    gown = lathe('f_gown', prof, br, segs=56, fold=lambda a, u: (0.006 + 0.022 * max(0, 0.6 - u)) * math.sin(a * 9 + 0.9 * math.sin(a * 4)) if u > 0.001 else 0)
    for v in gown.data.vertices:
        v.co.y *= 0.8
    hi.append(gown)
    # wide sleeves over the forearms
    for (e, w_) in (((-0.155, 0.67, 0.025), (-0.085, 0.625, 0.11)), ((0.175, 0.69, 0.07), (0.16, 0.79, 0.15))):
        hi.append(cyl('f_sleeve', e, w_, 0.05, br, segs=16, r1=0.068, caps=False))
    # cloak from the shoulders down the back to the calves
    verts, faces = [], []
    NU, NV = 24, 12
    for i in range(NU + 1):
        a = math.pi * (0.05 + 0.9 * i / NU)  # around the back, open at the front
        for j in range(NV + 1):
            u = 0.83 - 0.62 * j / NV
            r = 0.15 + 0.07 * (1 - u / 0.83) + 0.01 * math.sin(a * 8 + j)
            verts.append((r * math.cos(a), u, -r * math.sin(a) * 0.85 - 0.01))
    for i in range(NU):
        for j in range(NV):
            k = i * (NV + 1) + j
            faces.append((k, k + 1, k + NV + 2, k + NV + 1))
    cloak = from_pydata('f_cloak', verts, faces, br, smooth=True)
    md = cloak.modifiers.new('sol', 'SOLIDIFY')
    md.thickness = 0.01
    apply_mods(cloak)
    hi.append(cloak)
    # beard, hair, nose, brows
    beard = skin('f_beard', [(0, 0.905, 0.045), (0, 0.87, 0.055), (0, 0.835, 0.045)], [(0, 1), (1, 2)], [(0.042, 0.03), (0.04, 0.028), (0.018, 0.014)], br, subdiv=2)
    displace(beard, lambda p, n: 0.003 * math.sin(p[0] * 320))
    hi.append(beard)
    hair = skin('f_hair', [(0, 0.965, -0.01), (0, 0.91, -0.045), (0, 0.86, -0.04)], [(0, 1), (1, 2)], [(0.06, 0.052), (0.055, 0.035), (0.04, 0.02)], br, subdiv=2)
    hi.append(hair)
    hi.append(cyl('f_nose', (0, 0.93, 0.065), (0, 0.912, 0.08), 0.01, br, segs=6, r1=0.004))
    hi.append(box('f_brow', -0.03, 0.03, 0.94, 0.95, 0.06, 0.07, br, bev=0.004))
    # the open book in the left hand
    hi.append(box('f_book', -0.13, 0.03, 0.6, 0.72, 0.125, 0.145, br, bev=0.004))
    for k in range(5):
        hi.append(box(f'f_line{k}', -0.12, 0.02, 0.62 + k * 0.02, 0.625 + k * 0.02, 0.145, 0.147, m['bronzeDark']))
    lo = decimated(hi, 'figureStanding', 0.1)
    return hi, lo, ground_plane()


# ------------------------------------------------------------------ seated figure
def figure_seated(m):
    """Gentleman in a frock coat seated in an armchair (the donors), 1.0 m to the top of the head; faces +z.
    One branched skeleton: hips on the seat, torso, neck, head; thighs forward and shins down; arms on the
    armrests. Coat skirts fall over the seat front, the armchair has turned legs and a padded back."""
    br = m['bronze']
    hi = []
    hi.append(box('s_seat', -0.25, 0.25, 0.36, 0.45, -0.22, 0.22, br, bev=0.025))
    hi.append(box('s_back', -0.24, 0.24, 0.45, 0.95, -0.25, -0.17, br, bev=0.03))
    hi.append(box('s_crest', -0.26, 0.26, 0.93, 0.98, -0.26, -0.16, br, bev=0.015))
    for sx in (-1, 1):
        hi.append(box(f's_arm{sx}', sx * 0.25 - 0.035, sx * 0.25 + 0.035, 0.6, 0.64, -0.2, 0.2, br, bev=0.015))
        hi.append(cyl(f's_armpost{sx}', (sx * 0.25, 0.45, 0.17), (sx * 0.25, 0.6, 0.17), 0.025, br, segs=10))
        for sz in (-0.19, 0.19):
            hi.append(lathe(f's_leg{sx}{sz}', [(0.03, 0.0), (0.022, 0.06), (0.032, 0.14), (0.02, 0.26), (0.03, 0.36), (0.001, 0.36)], br, segs=12))
            for v in hi[-1].data.vertices:
                v.co.x += sx * 0.21
                v.co.y -= sz
    V = [(0, 0.5, -0.05), (0, 0.62, -0.06), (0, 0.74, -0.06), (0, 0.82, -0.065), (0, 0.86, -0.06), (0, 0.885, -0.05), (0, 0.935, -0.04), (0, 0.98, -0.045),
         (-0.08, 0.5, -0.02), (-0.09, 0.49, 0.22), (-0.09, 0.08, 0.27), (-0.09, 0.03, 0.34),
         (0.08, 0.5, -0.02), (0.09, 0.49, 0.22), (0.09, 0.08, 0.27), (0.09, 0.03, 0.34),
         (-0.15, 0.83, -0.06), (-0.2, 0.67, -0.03), (-0.22, 0.655, 0.1), (-0.22, 0.655, 0.17),
         (0.15, 0.83, -0.06), (0.2, 0.67, -0.03), (0.22, 0.655, 0.1), (0.22, 0.655, 0.17)]
    E = [(0, 1), (1, 2), (2, 3), (3, 4), (4, 5), (5, 6), (6, 7), (0, 8), (8, 9), (9, 10), (10, 11), (0, 12), (12, 13), (13, 14), (14, 15),
         (3, 16), (16, 17), (17, 18), (18, 19), (3, 20), (20, 21), (21, 22), (22, 23)]
    R = [(0.15, 0.11), (0.14, 0.1), (0.15, 0.11), (0.155, 0.1), (0.05, 0.05), (0.045, 0.045), (0.056, 0.064), (0.046, 0.05),
         0.075, 0.065, 0.045, (0.035, 0.05), 0.075, 0.065, 0.045, (0.035, 0.05),
         0.055, 0.046, 0.038, 0.028, 0.055, 0.046, 0.038, 0.028]
    body = skin('s_body', V, E, R, br, subdiv=2)
    displace(body, lambda p, n: 0.003 * math.sin(p[1] * 150 + p[0] * 40))
    hi.append(body)
    # coat skirts, lapels, beard and moustache
    hi.append(lathe('s_skirt', [(0.16, 0.62), (0.175, 0.54), (0.185, 0.46), (0.17, 0.42)], br, segs=32, fold=lambda a, u: 0.006 * math.sin(a * 9)))
    for sx in (-1, 1):
        hi.append(box(f's_lapel{sx}', sx * 0.03 - 0.025, sx * 0.03 + 0.025, 0.66, 0.81, 0.04, 0.06, br, bev=0.008))
    hi.append(skin('s_beard', [(0, 0.915, 0.0), (0, 0.875, 0.005)], [(0, 1)], [(0.04, 0.026), (0.03, 0.02)], br, subdiv=1))
    hi.append(cyl('s_nose', (0, 0.94, 0.012), (0, 0.925, 0.028), 0.009, br, segs=6, r1=0.004))
    lo = decimated(hi, 'figureSeated', 0.1)
    return hi, lo, ground_plane()


# ------------------------------------------------------------------ architectural pieces
def capital(m):
    """Corinthian capital over a shaft of radius 0.5 (top), 1.15 tall, abacus 1.42 wide."""
    st = m['marble']
    hi = [lathe('c_bell', [(0.5, 0.0), (0.5, 0.05), (0.49, 0.3), (0.53, 0.7), (0.6, 0.92), (0.001, 0.92)], st, segs=48)]
    hi.append(torus('c_astragal', (0, 0.02, 0), (0, 1, 0), 0.51, 0.03, st, segs=48, rsegs=8))
    # two rows of eight acanthus leaves curling outwards at the tips
    for row, (h0, h1, out) in enumerate(((0.02, 0.44, 0.05), (0.2, 0.72, 0.06))):
        for k in range(8):
            a = 2 * math.pi * (k + 0.5 * row) / 8
            c, s = math.cos(a), math.sin(a)
            verts, faces = [], []
            NU, NV = 8, 5
            for i in range(NU + 1):
                f = i / NU
                u = h0 + (h1 - h0) * f
                bell = 0.5 + 0.1 * max(0, (u - 0.3) / 0.62)  # follow the bell's flare
                rr = bell + 0.02 + out * f * f + (0.04 if f > 0.88 else 0)
                for j in range(NV + 1):
                    w = (j / NV - 0.5) * (0.44 - 0.22 * f)
                    lobe = 0.02 * math.sin(j * 2.5 + f * 9)
                    x, z = c * rr - s * w, s * rr + c * w
                    verts.append((x + c * lobe, u - (0.04 * f * f if f > 0.85 else 0), z + s * lobe))
            for i in range(NU):
                for j in range(NV):
                    q = i * (NV + 1) + j
                    faces.append((q, q + 1, q + NV + 2, q + NV + 1))
            lf = from_pydata(f'c_leaf{row}{k}', verts, faces, st, smooth=True)
            md = lf.modifiers.new('sol', 'SOLIDIFY')
            md.thickness = 0.02
            apply_mods(lf)
            hi.append(lf)
    # corner volutes and the small central rosettes, abacus with concave sides
    for k in range(4):
        a = math.pi / 4 + k * math.pi / 2
        p = (math.cos(a) * 0.66, 0.84, math.sin(a) * 0.66)
        ax = (math.cos(a + math.pi / 2) * 0.05, 0, math.sin(a + math.pi / 2) * 0.05)
        hi.append(cyl(f'c_vol{k}', (p[0] - ax[0], p[1], p[2] - ax[2]), (p[0] + ax[0], p[1], p[2] + ax[2]), 0.08, st, segs=16))
        hi.append(torus(f'c_volr{k}', (p[0], p[1], p[2]), (ax[0], 0, ax[2]), 0.05, 0.018, st, segs=16, rsegs=6))
        hi.append(cyl(f'c_stalk{k}', (math.cos(a) * 0.55, 0.62, math.sin(a) * 0.55), (math.cos(a) * 0.64, 0.82, math.sin(a) * 0.64), 0.03, st, segs=8))
        b = a + math.pi / 4
        hi.append(cyl(f'c_ros{k}', (math.cos(b) * 0.6, 0.98, math.sin(b) * 0.6), (math.cos(b) * 0.64, 0.98, math.sin(b) * 0.64), 0.05, st, segs=12))
    ab = box('c_abacus', -0.71, 0.71, 0.92, 1.15, -0.71, 0.71, st, bev=0.02)
    hi.append(ab)
    lo = lathe('l_cap', [(0.5, 0.0), (0.66, 0.4), (0.76, 0.8), (0.001, 0.92)], None, segs=16)
    lo2 = box('l_ab', -0.72, 0.72, 0.92, 1.151, -0.72, 0.72)
    return hi, join([lo, lo2], 'capital'), None


def shaft(m):
    """Fluted shaft, radius 0.5, 1 m long (scaled to the column), 24 flutes."""
    st = m['marble']
    hi = [lathe('sh', [(0.5, 0.0), (0.5, 1.0)], st, segs=192, fold=lambda a, u: -0.022 * max(0, math.cos(a * 24)) ** 0.6)]
    lo = lathe('shaft', [(0.5, 0.0), (0.5, 1.0)], None, segs=16)
    return hi, lo, None


def column_base(m):
    """Attic base for a shaft of radius 0.5: square plinth, lower torus, scotia, upper torus; 0.5 tall."""
    st = m['marble']
    hi = [box('b_plinth', -0.72, 0.72, 0.0, 0.16, -0.72, 0.72, st, bev=0.01),
          lathe('b_mould', [(0.68, 0.16), (0.7, 0.2), (0.68, 0.27), (0.6, 0.29), (0.55, 0.34), (0.56, 0.38), (0.6, 0.41), (0.58, 0.45), (0.52, 0.47), (0.5, 0.5), (0.001, 0.5)], st, segs=48)]
    lo = join([box('l_bp', -0.721, 0.721, 0.0, 0.161, -0.721, 0.721), lathe('l_bm', [(0.7, 0.16), (0.7, 0.28), (0.58, 0.36), (0.6, 0.42), (0.5, 0.5), (0.001, 0.5)], None, segs=16)], 'columnBase')
    return hi, lo, ground_plane()


def baluster(m):
    """Vase baluster 0.8 m with square base and cap blocks."""
    st = m['marble']
    hi = [box('ba_b', -0.08, 0.08, 0.0, 0.08, -0.08, 0.08, st, bev=0.008), box('ba_t', -0.075, 0.075, 0.72, 0.8, -0.075, 0.075, st, bev=0.008),
          lathe('ba_v', [(0.05, 0.08), (0.065, 0.12), (0.05, 0.16), (0.075, 0.3), (0.085, 0.38), (0.06, 0.48), (0.035, 0.58), (0.045, 0.64), (0.06, 0.68), (0.05, 0.72)], st, segs=24)]
    lo = join([box('l_bab', -0.081, 0.081, 0.0, 0.081, -0.081, 0.081), box('l_bat', -0.076, 0.076, 0.72, 0.8, -0.076, 0.076),
               lathe('l_bav', [(0.05, 0.08), (0.07, 0.14), (0.085, 0.36), (0.035, 0.58), (0.06, 0.68), (0.05, 0.72)], None, segs=8)], 'baluster')
    return hi, lo, ground_plane()


PIECES = {
    'eagle': (eagle, (0, 0, 512, 512), 70, 0.05),
    'lion': (lion, (512, 0, 512, 512), 60, 0.05),
    'figureStanding': (figure_standing, (0, 512, 256, 512), 70, 0.04),
    'figureSeated': (figure_seated, (256, 512, 256, 512), 70, 0.04),
    'capital': (capital, (512, 512, 256, 256), 50, 0.08),
    'shaft': (shaft, (768, 512, 128, 256), 60, 0.04),
    'columnBase': (column_base, (896, 512, 128, 128), 50, 0.04),
    'baluster': (baluster, (896, 640, 128, 128), 60, 0.03),
}


def render_preview(objs, path):
    """Cycles still of the high-poly from the front three-quarter (modelling check)."""
    sc = bpy.context.scene
    mn = Vector((1e9, 1e9, 1e9)); mx = Vector((-1e9, -1e9, -1e9))
    for o in objs:
        for v in o.data.vertices:
            p = o.matrix_world @ v.co
            mn = Vector((min(mn.x, p.x), min(mn.y, p.y), min(mn.z, p.z))); mx = Vector((max(mx.x, p.x), max(mx.y, p.y), max(mx.z, p.z)))
    c = (mn + mx) / 2
    size = max((mx - mn).length, 0.5)
    cam = bpy.data.cameras.new('cam')
    co = bpy.data.objects.new('cam', cam)
    sc.collection.objects.link(co)
    d = Vector((0.55, -1.0, 0.35)).normalized()
    co.location = c + d * size * 1.25
    co.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
    cam.lens = 50
    sc.camera = co
    sun = bpy.data.lights.new('sun', 'SUN')
    sun.energy = 4
    so = bpy.data.objects.new('sun', sun)
    so.rotation_euler = (0.8, 0.2, 0.6)
    sc.collection.objects.link(so)
    sc.world.use_nodes = True
    sc.world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.55, 0.62, 0.7, 1)
    sc.world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.8
    sc.render.resolution_x = sc.render.resolution_y = 512
    sc.cycles.samples = 24
    sc.render.filepath = path
    sc.render.image_settings.file_format = 'JPEG'
    bpy.ops.render.render(write_still=True)
    for o in (co, so):
        bpy.data.objects.remove(o)


def main():
    preview = sys.argv[sys.argv.index('--preview') + 1] if '--preview' in sys.argv else None
    only = sys.argv[sys.argv.index('--only') + 1].split(',') if '--only' in sys.argv else None
    reset()
    bpy.context.scene.world.light_settings.distance = 0.25
    mats = M()
    atlas = Atlas(1024, 'lmkit')
    los = []
    for name, (fn, cell, ang, ray) in PIECES.items():
        if only and name not in only:
            continue
        hi, lo, occ = fn(mats)
        if '--render' in sys.argv:
            lo.hide_render = True
            render_preview(hi, os.path.join(sys.argv[sys.argv.index('--render') + 1], f'{name}.jpg'))
            lo.hide_render = False
        sharpen(lo, ang)
        triangulate(lo)
        atlas.unwrap(lo, cell)
        atlas.bake(lo, hi, cell, extrusion=0.02, ray=ray + 0.02)
        print(f'{name}: high {sum(tri_count(o) for o in hi)} tris -> low {tri_count(lo)} tris', flush=True)
        for o in hi + ([occ] if occ else []):
            bpy.data.objects.remove(o)
        lo.hide_render = True
        los.append(lo)
    out_dir = preview or os.path.join(ROOT, 'tools', 'blender', 'out')
    os.makedirs(out_dir, exist_ok=True)
    atlas.finish(out_dir)
    km = atlas.export_material('lmkit')
    for lo in los:
        lo.hide_render = False
        lo.data.materials.clear()
        lo.data.materials.append(km)
    export_glb(los, os.path.join(preview, 'kit_landmark.glb') if preview else OUT)
    print('wrote', preview or OUT)


if __name__ == '__main__':
    main()
