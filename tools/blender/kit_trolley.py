# Trolleybus parts modelled in Blender and baked into one texture atlas (src/data/kit_trolley.glb): the trolley
# pole equipment (common base frame on its insulators, the rotating turret with its lifting springs, the pole's
# hinge clamp, the pole tube, the swivelling trolley head with its carbon slider, the rest hooks, the rope
# retriever), roof equipment (louvred converter grilles, cooling fan, the Ikarus braking resistor), the seats
# of the three line-9 vehicles, their mirrors and headlamp clusters. High-poly models are baked onto game-
# resolution meshes (albedo with contact shading, tangent-space normals, ORM) exactly like kit_bus.py.
#
# Shapes follow the reference photographs supplied with Expansion 5.0 (images 1-18) and the usual Kiepe /
# Lekov pole equipment of Škoda trolleybuses; dimensions are estimates (data/research/line9/README.md).
#
# Frame: three.js piece frame in metres (x right, y up, z backwards).
#   trolleyBase    common frame of both poles: origin at the midpoint between the two pivots (x = 0), pivot height
#   trolleyTurret  one pole's turret: origin at the pivot, turns about y
#   poleRoot       hinge clamp, origin at the pivot, pole along +z (pitches with the pole)
#   poleTube       unit length along +z from the origin (the game scales z to the pole length)
#   poleHead       origin at the pole tip, slider on top (kept level by the game)
#   poleHook       rest hook, origin on the roof under the hook
#   retriever      rope reel, origin at its mounting face (drum axis x)
#   roofLouvre     1.0 x 0.34 grille facing +z; roofFan facing +y; resistorGrid standing on y = 0
#   seat_*         stand on y = 0, pan centre over the origin, facing -z (like kit_bus seats)
#   mirrors*       bus frame: origin on the ground under the centre of the front face (front face at z = 0)
#   head*          both headlamp clusters of a front, origin on the ground at the front face centre
#
#   blenv/bin/python tools/blender/kit_trolley.py [--preview DIR] [--only a,b] [--render DIR]
import math
import os
import sys

import bpy
import bmesh  # noqa: E402
from mathutils import Vector, Matrix

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kitlib import (W, reset, mat, box, obox, cyl, torus, tube, join, sharpen, triangulate,  # noqa: E402
                    tri_count, apply_mods, lathe, render_preview, Atlas, export_glb)
from kit_bus import (seat_loft, resample, bevel_mod, decimate_copy, sweep_var, shell_head, place,  # noqa: E402
                     head_with_glass, dup, rrect_prism, mat_split, W_)

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'src', 'data', 'kit_trolley.glb')


def M():
    return {
        'poleBlack': mat('poleBlack', (0.022, 0.023, 0.025), 0.42, 0.25, noise=0.1, nscale=30, grime=0.15),
        'galv': mat('galv', (0.46, 0.47, 0.46), 0.45, 0.9, noise=0.18, nscale=60, grime=0.2),
        'cast': mat('cast', (0.07, 0.075, 0.08), 0.62, 0.45, noise=0.2, nscale=90, bump=0.2, bscale=1400),
        'spring': mat('spring', (0.1, 0.1, 0.11), 0.33, 0.85, noise=0.1, nscale=80),
        'redOxide': mat('redOxide', (0.25, 0.05, 0.03), 0.6, 0.0, noise=0.15, nscale=40, grime=0.2),
        'porcelain': mat('porcelain', (0.18, 0.07, 0.035), 0.12, 0.0, noise=0.05, nscale=20),
        'insWrap': mat('insWrap', (0.09, 0.025, 0.018), 0.4, 0.0, noise=0.1, nscale=60),
        'epoxy': mat('epoxy', (0.32, 0.33, 0.35), 0.38, 0.0, noise=0.05, nscale=40),
        'bronze': mat('bronze', (0.5, 0.31, 0.17), 0.36, 0.9, noise=0.15, nscale=60, grime=0.25),
        'carbon': mat('carbon', (0.018, 0.018, 0.02), 0.72, 0.0, noise=0.2, nscale=300, bump=0.3, bscale=2000),
        'rubber': mat('rubber', (0.028, 0.028, 0.03), 0.86, noise=0.12, nscale=60, bump=0.15, bscale=900),
        'rope': mat('rope', (0.06, 0.06, 0.055), 0.9, noise=0.2, nscale=500, bump=0.4, bscale=2500),
        'louvre': mat('louvre', (0.36, 0.38, 0.4), 0.5, 0.45, noise=0.08, nscale=40, grime=0.3),
        'mesh': mat('mesh', (0.03, 0.032, 0.034), 0.6, 0.4, noise=0.1, nscale=200),
        'alu': mat('alu', (0.7, 0.71, 0.72), 0.35, 0.85, noise=0.08, nscale=50, grime=0.2),
        'resistor': mat('resistor', (0.3, 0.3, 0.29), 0.55, 0.7, noise=0.25, nscale=50, grime=0.45),
        'heatRust': mat('heatRust', (0.24, 0.14, 0.08), 0.75, 0.3, noise=0.3, nscale=80, grime=0.3),
        # seats (linear albedo); Solaris IV: dark shells, blue fabric (images 4-6); Solaris III: grey shells,
        # dark violet-blue fabric (images 9-10); Ikarus refurbished: grey plastic shells (images 16-17)
        # ref06 / ref16: mid-grey shells, royal-blue moquette with a darker block pattern
        'shellS4': mat('shellS4', (0.1, 0.105, 0.115), 0.42, bump=0.05, bscale=1500),
        'fabricS4': moquette_blocks('fabricS4', (0.025, 0.085, 0.46), (0.012, 0.035, 0.22)),
        'shellS3': mat('shellS3', (0.15, 0.16, 0.17), 0.42, noise=0.03, nscale=80, bump=0.05, bscale=1500),
        'fabricS3': mat('fabricS3', (0.03, 0.03, 0.17), 0.95, noise=0.3, nscale=650, bump=0.35, bscale=1500),
        # ref14: charcoal vinyl seats
        'shellIk': mat('shellIk', (0.045, 0.05, 0.055), 0.5, noise=0.08, nscale=60, bump=0.12, bscale=1600),
        'seatFrame': mat('seatFrame', (0.5, 0.51, 0.52), 0.35, 0.85, noise=0.06, nscale=40),
        'handleDark': mat('handleDark', (0.04, 0.042, 0.045), 0.5),
        # ref14: the Ikarus seats' grab handles are yellow
        'handleOrange': mat('handleOrange', (0.78, 0.55, 0.02), 0.4, noise=0.05, nscale=60),
        'mirrorBody': mat('mirrorBody', (0.022, 0.023, 0.025), 0.42, bump=0.03, bscale=2500),
        'mirrorGlass': mat('mirrorGlass', (0.75, 0.77, 0.78), 0.04, 1.0),
        'lampBlack': mat('lampBlack', (0.012, 0.013, 0.015), 0.3, 0.1),
        'reflector': mat('reflector', (0.8, 0.81, 0.82), 0.12, 1.0, noise=0.03, nscale=200),
        'lensAmber': mat('lensAmber', (0.75, 0.32, 0.02), 0.2),
        'lensClear': mat('lensClear', (0.55, 0.57, 0.6), 0.06, 0.3),
        'ledDrl': mat('ledDrl', (0.85, 0.86, 0.88), 0.25),
        # line 84 (Expansion 6.0). SOR EBN 11 (images 5-6): mid-grey shells, royal-blue moquette with lime-green
        # rounded squares and rows of white dots; Yutong E12 (image 10): light-grey one-piece shells with a charcoal
        # insert on the back and an orange grab handle at the aisle-side top corner
        'shellSor': mat('shellSor', (0.25, 0.265, 0.28), 0.42, noise=0.03, nscale=80, bump=0.05, bscale=1500),
        'fabricSor': moquette_sor('fabricSor'),
        'shellE12': mat('shellE12', (0.52, 0.54, 0.57), 0.4, noise=0.025, nscale=80, bump=0.04, bscale=1500),
        'insertE12': mat('insertE12', (0.035, 0.037, 0.04), 0.55, bump=0.06, bscale=1600),
        'handleE12': mat('handleE12', (0.85, 0.3, 0.02), 0.38, noise=0.04, nscale=60),
    }


def moquette_blocks(name, col, dark):
    """Bus moquette with a coarse block pattern (Solaris IV seats, ref06): base colour with darker squares."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes['Principled BSDF']
    b.inputs['Roughness'].default_value = 0.95
    m['rough'], m['metal'] = 0.95, 0.0
    tc = nt.nodes.new('ShaderNodeTexCoord')
    vor = nt.nodes.new('ShaderNodeTexVoronoi')
    vor.feature = 'F1'
    vor.distance = 'CHEBYCHEV'
    vor.inputs['Scale'].default_value = 22
    nt.links.new(tc.outputs['Object'], vor.inputs['Vector'])
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = 0.45
    ramp.color_ramp.elements[0].color = (*col, 1)
    ramp.color_ramp.elements[1].position = 0.5
    ramp.color_ramp.elements[1].color = (*dark, 1)
    nt.links.new(vor.outputs['Color'], ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], b.inputs['Base Color'])
    nz = nt.nodes.new('ShaderNodeTexNoise')
    nz.inputs['Scale'].default_value = 1400
    nt.links.new(tc.outputs['Object'], nz.inputs['Vector'])
    bp = nt.nodes.new('ShaderNodeBump')
    bp.inputs['Strength'].default_value = 0.35
    bp.inputs['Distance'].default_value = 0.001
    nt.links.new(nz.outputs['Fac'], bp.inputs['Height'])
    nt.links.new(bp.outputs['Normal'], b.inputs['Normal'])
    return m


def moquette_sor(name, tile=0.15, N=256):
    """SOR moquette (images 5-6): royal blue with a fine darker dot grid, lime-green rounded squares (outlines) and
    rows of white dots, drawn into an image tile and box-projected in object space (tile = metres per repeat)."""
    import numpy as np
    img = bpy.data.images.new(name + 'Tile', N, N, alpha=False)
    c = np.zeros((N, N, 3), dtype=np.float32)
    srgb = lambda h: [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    c[:] = srgb('#1f5cbc')
    yy, xx = np.mgrid[0:N, 0:N]
    c[((xx % 8) < 3) & ((yy % 8) < 3)] = srgb('#174a9b')  # fine dark dot grid
    lime, white = srgb('#a7d23a'), srgb('#e9eef4')

    def rsq(cx, cy, w, h, r, t):
        dx = np.maximum(np.abs(xx - cx) - (w / 2 - r), 0)
        dy = np.maximum(np.abs(yy - cy) - (h / 2 - r), 0)
        d = np.sqrt(dx * dx + dy * dy) - r
        c[(d < 0) & (d > -t)] = lime
    # two rows of rounded squares of mixed sizes, and white dot trios between them
    for row, y in enumerate((48, 176)):
        x = 16 if row == 0 else 80
        for k, w in enumerate((40, 30, 40, 26)):
            rsq((x + w / 2) % N, y, w, w * 0.82, 7, 4)
            x += w + 26
        for k in range(4):
            cx = (x + k * 13) % N
            c[((xx - cx) ** 2 + (yy - (y + 64) % N) ** 2) < 16] = white
    for k in range(5):
        cx = 30 + k * 11
        c[((xx - cx) ** 2 + (yy - 112) ** 2) < 12] = white
    px = np.concatenate([c[::-1], np.ones((N, N, 1), dtype=np.float32)], axis=2)
    img.pixels.foreach_set(px.ravel())
    img.pack()
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes['Principled BSDF']
    b.inputs['Roughness'].default_value = 0.95
    m['rough'], m['metal'] = 0.95, 0.0
    tc = nt.nodes.new('ShaderNodeTexCoord')
    mp = nt.nodes.new('ShaderNodeMapping')
    mp.inputs['Scale'].default_value = (1 / tile, 1 / tile, 1 / tile)
    nt.links.new(tc.outputs['Object'], mp.inputs['Vector'])
    it = nt.nodes.new('ShaderNodeTexImage')
    it.image = img
    it.projection = 'BOX'
    it.projection_blend = 0.25
    nt.links.new(mp.outputs['Vector'], it.inputs['Vector'])
    nt.links.new(it.outputs['Color'], b.inputs['Base Color'])
    nz = nt.nodes.new('ShaderNodeTexNoise')
    nz.inputs['Scale'].default_value = 1400
    nt.links.new(tc.outputs['Object'], nz.inputs['Vector'])
    bp = nt.nodes.new('ShaderNodeBump')
    bp.inputs['Strength'].default_value = 0.3
    bp.inputs['Distance'].default_value = 0.001
    nt.links.new(nz.outputs['Fac'], bp.inputs['Height'])
    nt.links.new(bp.outputs['Normal'], b.inputs['Normal'])
    return m


# ------------------------------------------------------------------ helpers
def lathe_y(name, prof, segs, m, y0=0.0, x=0.0, z=0.0):
    """Surface of revolution about a vertical axis through (x, z): prof = [(r, y), ...] (y relative to y0)."""
    o = lathe(name, prof, segs, m)
    o.data.transform(Matrix.Rotation(math.radians(-90), 4, 'Y'))  # lathe axis three x -> three +y (Blender +Z)
    o.data.transform(Matrix.Translation(W(x, y0, z)))
    return o


def lathe_z(name, prof, segs, m, at=(0, 0, 0)):
    """Surface of revolution about the three.js z axis: prof = [(r, z), ...]."""
    o = lathe(name, prof, segs, m)
    o.data.transform(Matrix.Rotation(math.radians(90), 4, 'Z'))  # three x -> Blender y = three -z
    o.data.transform(Matrix.Diagonal((1, -1, 1, 1)))  # profile z grows towards three +z
    for p in o.data.polygons:
        p.flip()
    o.data.transform(Matrix.Translation(W(*at)))
    return o


def helix(name, p0, p1, R, wire, turns, m, ring=8, per_turn=14):
    """Coil spring from p0 to p1 (three frame), coil radius R, wire radius `wire`."""
    a, b = Vector(p0), Vector(p1)
    ax = b - a
    L = ax.length
    t = ax.normalized()
    ref = Vector((0, 1, 0)) if abs(t.y) < 0.9 else Vector((1, 0, 0))
    u = t.cross(ref).normalized()
    v = t.cross(u).normalized()
    n = int(turns * per_turn)
    pts = []
    for i in range(n + 1):
        f = i / n
        ang = 2 * math.pi * turns * f
        pts.append(a + t * (L * f) + u * (R * math.cos(ang)) + v * (R * math.sin(ang)))
    bm = bmesh.new()
    rings = []
    for i, p in enumerate(pts):
        tg = (pts[min(i + 1, n)] - pts[max(i - 1, 0)]).normalized()
        s = tg.cross(t)
        if s.length < 1e-5:
            s = tg.cross(u)
        s.normalize()
        nn = s.cross(tg).normalized()
        rg = []
        for j in range(ring):
            q = p + s * (wire * math.cos(2 * math.pi * j / ring)) + nn * (wire * math.sin(2 * math.pi * j / ring))
            rg.append(bm.verts.new(W(q.x, q.y, q.z)))
        rings.append(rg)
    for i in range(n):
        for j in range(ring):
            bm.faces.new((rings[i][j], rings[i][(j + 1) % ring], rings[i + 1][(j + 1) % ring], rings[i + 1][j]))
    bm.faces.new(rings[0][::-1])
    bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    me.materials.append(m)
    return o


def insulator(name, x, y, z, h, r, m, sheds=3):
    """Ribbed post insulator standing on (x, y, z): core plus `sheds` rain sheds and metal end caps."""
    prof = [(r * 0.75, 0.0)]
    for k in range(sheds):
        y0 = h * (0.15 + 0.7 * k / max(1, sheds - 1))
        prof += [(r * 0.75, y0 - 0.012), (r * 1.55, y0 - 0.004), (r * 1.5, y0 + 0.004), (r * 0.75, y0 + 0.01)]
    prof += [(r * 0.75, h), (0.0, h)]
    core = lathe_y(name, prof, 28, m, y0=y, x=x, z=z)
    cap0 = lathe_y(name + 'c0', [(r * 0.0, 0), (r * 1.05, 0), (r * 1.05, 0.016), (r * 0.8, 0.02)], 20, M_['galv'], y0=y - 0.004, x=x, z=z)
    cap1 = lathe_y(name + 'c1', [(r * 0.8, -0.02), (r * 1.05, -0.016), (r * 1.05, 0.0), (0.0, 0.0)], 20, M_['galv'], y0=y + h + 0.004, x=x, z=z)
    return [core, cap0, cap1]


def bolt(name, at, axis, m, r=0.009, h=0.012):
    """Hex bolt head on a washer; axis = three-frame unit vector the head points along."""
    a = Vector(at)
    d = Vector(axis).normalized()
    hd = cyl(name, tuple(a), tuple(a + d * h), r, m, segs=6, smooth=False)
    ws = cyl(name + 'w', tuple(a - d * 0.002), tuple(a + d * 0.002), r * 1.35, m, segs=16)
    return [hd, ws]


def lowpoly(parts, name, ratio):
    lo = join([dup(o) for o in parts], name)
    md = lo.modifiers.new('dec', 'DECIMATE')
    md.ratio = ratio
    apply_mods(lo)
    return lo


# ------------------------------------------------------------------ pole equipment
def trolley_base(m):
    """Common base frame of the two poles: two transverse channels on four ribbed insulators, longitudinal
    stringers, a bearing plate under each turret (pivots at x = +-0.3, y = 0), the cable entry and a lightning
    arrester. Height: the roof surface 0.26 below the pivots (Solaris; the Ikarus base is a little lower)."""
    parts = []
    yr = -0.27  # roof surface under the frame
    # four insulators
    for x in (-0.46, 0.46):
        for z in (-0.38, 0.38):
            parts += insulator('ins', x, yr, z, 0.07, 0.03, m['porcelain'], sheds=2)
    # transverse channels (C profile: web + two flanges) and stringers
    for z in (-0.38, 0.38):
        parts.append(box('chW', -0.56, 0.56, yr + 0.075, yr + 0.135, z - 0.004, z + 0.004, m['galv'], bev=0.002))
        for zz in (z - 0.04, z + 0.04):
            parts.append(box('chF', -0.56, 0.56, yr + 0.071, yr + 0.079, zz - 0.004 if zz < z else z, zz + 0.004 if zz > z else z, m['galv'], bev=0.001))
            parts.append(box('chF2', -0.56, 0.56, yr + 0.131, yr + 0.139, min(z, zz), max(z, zz), m['galv'], bev=0.001))
    for x in (-0.3, 0.3):
        parts.append(box('str', x - 0.035, x + 0.035, yr + 0.139, yr + 0.16, -0.44, 0.44, m['galv'], bev=0.003))
        # bearing plate and the fixed lower race of the turret
        parts.append(lathe_y('plate', [(0.0, 0.0), (0.15, 0.0), (0.15, 0.016), (0.13, 0.024), (0.0, 0.024)], 40, m['cast'], y0=yr + 0.16, x=x))
        for k in range(8):
            a = 2 * math.pi * k / 8
            parts += bolt('pb', (x + 0.125 * math.cos(a), yr + 0.184, 0.125 * math.sin(a)), (0, 1, 0), m['galv'], r=0.008, h=0.009)
    # cable entry box with its gland and the cable dropping into the roof
    parts.append(box('jb', -0.1, 0.1, yr + 0.0, yr + 0.11, 0.5, 0.64, m['epoxy'], bev=0.01))
    for x in (-0.05, 0.05):
        parts.append(cyl('gland', (x, yr + 0.055, 0.46), (x, yr + 0.055, 0.5), 0.016, m['galv'], segs=6, smooth=False))
        parts.append(tube('cab', [(x, yr + 0.055, 0.46), (x * 3, yr + 0.07, 0.3), (0.3 * (1 if x > 0 else -1), yr + 0.15, 0.12), (0.3 * (1 if x > 0 else -1), yr + 0.17, 0.0)], 0.011, m['rubber'], segs=8))
    # lightning arrester on the frame
    parts += insulator('arr', 0.0, yr + 0.139, -0.38, 0.12, 0.026, m['epoxy'], sheds=4)
    hi = parts
    lo = lowpoly(parts, 'trolleyBase', 0.25)
    return hi, lo


def trolley_turret(m):
    """One pole's turret (Kiepe / Lekov type): the slewing bearing housing, a forked hinge yoke carrying the
    pole hinge pin (along x through the origin), and the lifting springs in a cage trailing behind (two coil
    springs, adjusting screws, the end yoke). Turns about y with the pole."""
    parts = []
    y0 = -0.246  # top of the base plate
    # slewing housing
    parts.append(lathe_y('hous', [(0.0, 0.0), (0.12, 0.0), (0.122, 0.012), (0.11, 0.03), (0.095, 0.05), (0.095, 0.12), (0.075, 0.15), (0.0, 0.15)], 40, m['cast'], y0=y0))
    for k in range(6):
        a = 2 * math.pi * k / 6 + 0.3
        parts += bolt('hb', (0.105 * math.cos(a), y0 + 0.032, 0.105 * math.sin(a)), (math.cos(a) * 0.3, 1, math.sin(a) * 0.3), m['galv'], r=0.0075, h=0.008)
    # forked yoke: two cheeks rising to the hinge pin
    for sx in (-1, 1):
        x = sx * 0.07
        ch = box('cheek', x - 0.012, x + 0.012, y0 + 0.12, 0.05, -0.07, 0.08, m['cast'], bev=0.008, segs=2)
        parts.append(ch)
        parts.append(cyl('pinH', (x - sx * 0.0, 0, 0), (x + sx * 0.03, 0, 0), 0.026, m['cast'], segs=24))
        parts.append(cyl('nut', (x + sx * 0.03, 0, 0), (x + sx * 0.045, 0, 0), 0.02, m['galv'], segs=6, smooth=False))
    parts.append(cyl('pin', (-0.115, 0, 0), (0.115, 0, 0), 0.013, m['galv'], segs=16))
    # spring cage: a frame trailing back from the yoke base, two springs, the spring yoke and adjusting rods
    yc = y0 + 0.085
    for sx in (-1, 1):
        x = sx * 0.055
        parts.append(box('rail', x - 0.01, x + 0.01, yc - 0.035, yc - 0.015, 0.06, 0.74, m['cast'], bev=0.004))
        parts.append(helix('spr', (x, yc + 0.02, 0.12), (x, yc + 0.02, 0.6), 0.034, 0.0065, 13, m['spring']))
        parts.append(cyl('rod', (x, yc + 0.02, 0.6), (x, yc + 0.02, 0.76), 0.008, m['galv'], segs=12))
        parts.append(cyl('adj', (x, yc + 0.02, 0.7), (x, yc + 0.02, 0.73), 0.015, m['galv'], segs=6, smooth=False))
        parts.append(cyl('eye', (x, yc + 0.02, 0.09), (x, yc + 0.02, 0.12), 0.02, m['cast'], segs=16))
    parts.append(box('sy', -0.085, 0.085, yc - 0.01, yc + 0.05, 0.74, 0.78, m['cast'], bev=0.006))
    parts.append(box('sy0', -0.085, 0.085, yc - 0.01, yc + 0.05, 0.06, 0.1, m['cast'], bev=0.006))
    # pull rod from the spring yoke forward to the pole's lever (under the hinge)
    parts.append(cyl('pull', (0, yc + 0.02, 0.76), (0, -0.1, 0.0), 0.009, m['galv'], segs=12))
    # rope guide / bump stop on top of the yoke
    parts.append(box('stop', -0.04, 0.04, 0.03, 0.06, -0.09, -0.05, m['rubber'], bev=0.008))
    hi = parts
    lo = lowpoly(parts, 'trolleyTurret', 0.2)
    return hi, lo


def pole_root(m):
    """Hinge clamp of the pole: hinge boss on the pin, a clamp sleeve round the pole foot with four bolts, the
    spring lever below the hinge and the insulating sleeve where the pole leaves the clamp."""
    parts = []
    parts.append(cyl('boss', (-0.055, 0, 0), (0.055, 0, 0), 0.04, m['cast'], segs=28))
    parts.append(lathe_z('sleeve', [(0.0, -0.02), (0.05, -0.02), (0.052, 0.0), (0.05, 0.3), (0.042, 0.36), (0.0, 0.36)], 32, m['cast']))
    for z in (0.08, 0.22):
        for sx in (-1, 1):
            parts += bolt('cb', (sx * 0.05, 0.0, z), (sx, 0, 0), m['galv'], r=0.009, h=0.014)
        parts.append(box('lug', -0.06, 0.06, -0.012, 0.012, z - 0.02, z + 0.02, m['cast'], bev=0.004))
    parts.append(box('lever', -0.02, 0.02, -0.12, -0.02, -0.03, 0.03, m['cast'], bev=0.006))
    parts.append(cyl('lpin', (-0.03, -0.1, 0), (0.03, -0.1, 0), 0.012, m['galv'], segs=12))
    # insulating sleeve (the pole is insulated from its base: red-brown epoxy wrap)
    parts.append(lathe_z('ins', [(0.0, 0.34), (0.037, 0.34), (0.04, 0.36), (0.04, 0.62), (0.036, 0.64), (0.0, 0.64)], 24, m['insWrap']))
    hi = parts
    lo = lowpoly(parts, 'poleRoot', 0.3)
    return hi, lo


def pole_tube(m):
    """Pole tube of unit length (scaled along z in the game): tapering steel tube, black, with two clamp
    collars (rope / retriever attachment) towards the head and the insulated end. Radius 0.034 -> 0.024."""
    parts = []
    parts.append(lathe_z('tube', [(0.0, 0.0), (0.034, 0.0), (0.031, 0.5), (0.025, 0.97), (0.024, 1.0), (0.0, 1.0)], 24, m['poleBlack']))
    for z in (0.62, 0.86):
        parts.append(lathe_z('col', [(0.026, z - 0.012), (0.033, z - 0.01), (0.033, z + 0.01), (0.026, z + 0.012)], 20, m['galv']))
    hi = parts
    lo = join([dup(o) for o in parts], 'poleTube')
    return hi, lo


def pole_head(m):
    """Trolley head at the pole tip: socket and swivel pin, a bronze shoe holder ~0.32 long with the carbon
    slider in its groove on top (wire contact at y ~ +0.075), guide horns at both ends and the flexible shunt."""
    parts = []
    # socket over the pole end (pole along -z from the origin)
    parts.append(lathe_z('sock', [(0.0, -0.16), (0.029, -0.16), (0.032, -0.14), (0.032, -0.01), (0.026, 0.0), (0.0, 0.0)], 24, m['bronze']))
    # swivel: vertical pin and the yoke
    parts.append(cyl('sw', (0, -0.005, -0.03), (0, 0.035, -0.03), 0.022, m['bronze'], segs=20))
    parts.append(cyl('swp', (0, 0.035, -0.03), (0, 0.045, -0.03), 0.014, m['galv'], segs=6, smooth=False))
    # shoe holder (runs along the wire = along z when level), U-section with the slider inside
    zc = -0.03
    parts.append(box('hold', -0.026, 0.026, 0.035, 0.06, zc - 0.17, zc + 0.17, m['bronze'], bev=0.006, segs=2))
    for sx in (-1, 1):
        parts.append(box('cheek', sx * 0.026 - 0.006, sx * 0.026 + 0.006, 0.05, 0.078, zc - 0.17, zc + 0.17, m['bronze'], bev=0.003))
    # carbon slider, grooved on top
    parts.append(box('carbon', -0.018, 0.018, 0.058, 0.08, zc - 0.15, zc + 0.15, m['carbon'], bev=0.004))
    parts.append(box('groove', -0.004, 0.004, 0.079, 0.083, zc - 0.15, zc + 0.15, m['mesh']))
    # guide horns rising at both ends
    for s in (-1, 1):
        parts.append(sweep_var('horn', [(0, 0.06, zc + s * 0.16), (0, 0.075, zc + s * 0.2), (0, 0.11, zc + s * 0.225)], lambda t: (0.02 - 0.008 * t, 0.006), m['bronze'], n=12, ring=10))
    # flexible shunt (copper braid) from the holder down to the pole
    parts.append(tube('shunt', [(0.03, 0.04, zc + 0.08), (0.045, 0.0, zc + 0.02), (0.036, -0.02, -0.08)], 0.0055, m['bronze'], segs=8))
    hi = parts
    lo = lowpoly(parts, 'poleHead', 0.3)
    return hi, lo


def pole_hook(m):
    """Rest hook (pole catcher) at the tail of the roof: a tubular post on a foot plate, the hook open towards
    the front with a rubber-lined throat and a spring-loaded latch tongue."""
    parts = []
    parts.append(box('foot', -0.06, 0.06, 0.0, 0.012, -0.08, 0.08, m['galv'], bev=0.003))
    for x in (-0.04, 0.04):
        for z in (-0.06, 0.06):
            parts += bolt('fb', (x, 0.012, z), (0, 1, 0), m['galv'], r=0.006, h=0.006)
    parts.append(cyl('post', (0, 0.012, 0), (0, 0.2, 0), 0.022, m['poleBlack'], segs=16))
    # hook: U opening upwards and slightly forwards, rubber lined
    hk = [(0.0, 0.2, 0.0), (-0.07, 0.235, 0.0), (-0.075, 0.3, 0.0)]
    parts.append(sweep_var('hkL', hk, lambda t: (0.012, 0.016), m['poleBlack'], n=16, ring=12, up=(0, 0, 1)))
    hk2 = [(0.0, 0.2, 0.0), (0.07, 0.235, 0.0), (0.075, 0.3, 0.0)]
    parts.append(sweep_var('hkR', hk2, lambda t: (0.012, 0.016), m['poleBlack'], n=16, ring=12, up=(0, 0, 1)))
    parts.append(sweep_var('lin', [(-0.058, 0.232, 0.0), (0.0, 0.212, 0.0), (0.058, 0.232, 0.0)], lambda t: (0.008, 0.024), m['rubber'], n=16, ring=10, up=(0, 0, 1)))
    parts.append(box('latch', -0.006, 0.006, 0.24, 0.31, -0.02, 0.02, m['galv'], bev=0.003))
    hi = parts
    lo = lowpoly(parts, 'poleHook', 0.35)
    return hi, lo


def retriever(m):
    """Rope retriever (Solaris III): a drum housing with ribbed covers on a bracket, the rope outlet on top and
    the reset handle. Drum axis along x, mounting face at z = 0 (on the rear wall), housing towards -z."""
    parts = []
    parts.append(box('br', -0.12, 0.12, -0.12, 0.12, -0.02, 0.0, m['galv'], bev=0.004))
    drum = lathe('drum', [(0.0, -0.08), (0.13, -0.08), (0.135, -0.07), (0.135, 0.07), (0.13, 0.08), (0.0, 0.08)], 40, m['cast'])
    drum.data.transform(Matrix.Translation(W(0, 0, -0.16)))
    parts.append(drum)
    for x in (-0.085, 0.085):
        r_ = lathe('rib', [(0.0, x - 0.006), (0.14, x - 0.006), (0.14, x + 0.006), (0.0, x + 0.006)], 40, m['cast'])
        r_.data.transform(Matrix.Translation(W(0, 0, -0.16)))
        parts.append(r_)
    hub = lathe('hub', [(0.0, 0.08), (0.05, 0.08), (0.05, 0.1), (0.0, 0.1)], 24, m['galv'])
    hub.data.transform(Matrix.Translation(W(0, 0, -0.16)))
    parts.append(hub)
    parts.append(box('neck', -0.04, 0.04, 0.1, 0.18, -0.2, -0.12, m['cast'], bev=0.01))
    parts.append(cyl('out', (0, 0.18, -0.16), (0, 0.21, -0.16), 0.025, m['rubber'], segs=16))
    parts.append(cyl('hdl', (0.1, -0.05, -0.16), (0.16, -0.05, -0.16), 0.01, m['galv'], segs=10))
    hi = parts
    lo = lowpoly(parts, 'retriever', 0.3)
    return hi, lo


# ------------------------------------------------------------------ roof equipment
def roof_louvre(m):
    """Louvred intake grille of the roof equipment fairing, 1.0 x 0.34, facing +z: frame, 9 inclined slats and
    the mesh behind them."""
    parts = []
    w, h = 0.5, 0.17
    parts.append(box('back', -w, w, -h, h, -0.03, -0.024, m['mesh']))
    for sx in (-1, 1):
        parts.append(box('fv', sx * w - 0.015, sx * w + 0.015, -h, h, -0.03, 0.006, m['louvre'], bev=0.004))
    for sy in (-1, 1):
        parts.append(box('fh', -w, w, sy * h - 0.015, sy * h + 0.015, -0.03, 0.006, m['louvre'], bev=0.004))
    n = 9
    for k in range(n):
        y = -h + 0.03 + (2 * h - 0.06) * k / (n - 1)
        parts.append(obox('slat', (0, y, -0.012), (1, 0, 0), (0, math.cos(0.7), math.sin(0.7)), (0, -math.sin(0.7), math.cos(0.7)), w - 0.015, 0.014, 0.0025, m['louvre'], bev=0.0012))
    hi = parts
    lo = join([box('lv', -w, w, -h, h, -0.03, 0.006, m['louvre'])], 'roofLouvre')
    return hi, lo


def roof_fan(m):
    """Round cooling-fan outlet on the roof (converter / resistor cooling), D 0.56: raised collar, radial
    blades under a guard of concentric rings and spokes. Facing +y."""
    parts = []
    parts.append(lathe_y('coll', [(0.24, 0.0), (0.3, 0.0), (0.3, 0.05), (0.285, 0.07), (0.27, 0.07), (0.27, 0.02), (0.24, 0.02)], 48, m['louvre']))
    parts.append(lathe_y('well', [(0.0, -0.06), (0.27, -0.06), (0.27, 0.02)], 48, m['mesh']))
    parts.append(lathe_y('hub', [(0.0, 0.0), (0.06, 0.0), (0.05, 0.03), (0.0, 0.035)], 24, m['louvre'], y0=-0.04))
    for k in range(7):
        a = 2 * math.pi * k / 7
        c = (math.cos(a) * 0.16, -0.025, math.sin(a) * 0.16)
        parts.append(obox('bl', c, (math.cos(a), 0, math.sin(a)), (0, 1, 0), (-math.sin(a), 0, math.cos(a)), 0.1, 0.004, 0.045, m['alu'], bev=0.002))
        parts[-1].data.transform(Matrix.Translation((0, 0, 0)))
    for r in (0.08, 0.14, 0.2, 0.26):
        parts.append(torus('ring', (0, 0.068, 0), (0, 1, 0), r, 0.004, m['galv'], segs=48, rsegs=6))
    for k in range(6):
        a = 2 * math.pi * k / 6
        parts.append(cyl('sp', (0, 0.068, 0), (0.27 * math.cos(a), 0.068, 0.27 * math.sin(a)), 0.004, m['galv'], segs=6))
    hi = parts
    lo = lowpoly(parts, 'roofFan', 0.3)
    return hi, lo


def resistor_grid(m):
    """Ikarus 280.92 braking resistor on the roof: a long box of resistor grids (z 1.4, x 0.5, y 0.32) with
    perforated sides, ventilated cover, heat-stained grids visible through the slots, on insulated feet."""
    parts = []
    L, Wd, H = 0.7, 0.25, 0.32
    for x in (-0.18, 0.18):
        for z in (-0.6, 0.6):
            parts += insulator('ft', x, 0.0, z, 0.06, 0.025, m['porcelain'], sheds=2)
    y0 = 0.07
    # side panels: top and bottom rails with vertical bars, the grids showing through the openings
    for sx in (-1, 1):
        x0, x1 = sx * Wd - 0.008, sx * Wd + 0.008
        parts.append(box('rT', x0, x1, y0 + H - 0.05, y0 + H, -L, L, m['resistor'], bev=0.003))
        parts.append(box('rB', x0, x1, y0, y0 + 0.05, -L, L, m['resistor'], bev=0.003))
        for k in range(15):
            z = -L + (2 * L) * k / 14
            parts.append(box('bar', x0, x1, y0 + 0.05, y0 + H - 0.05, z - 0.03, z + 0.03, m['resistor'], bev=0.002))
    for sz in (-1, 1):
        parts.append(box('end', -Wd, Wd, y0, y0 + H, sz * L - 0.008, sz * L + 0.008, m['resistor'], bev=0.003))
    # cover: a shallow roof with raised vent strips
    parts.append(box('cov', -Wd - 0.02, Wd + 0.02, y0 + H, y0 + H + 0.014, -L - 0.02, L + 0.02, m['resistor'], bev=0.004))
    for k in range(5):
        z = -L + 0.15 + (2 * L - 0.3) * k / 4
        parts.append(box('vent', -Wd + 0.04, Wd - 0.04, y0 + H + 0.014, y0 + H + 0.05, z - 0.06, z + 0.06, m['resistor'], bev=0.006))
    # grids inside (seen through the slots): zig-zag ribbons, rust-stained
    for x in (-0.12, 0.0, 0.12):
        pts = []
        for k in range(29):
            z = -L + 0.04 + (2 * L - 0.08) * k / 28
            pts.append((x, y0 + 0.06 + (0.2 if k % 2 else 0.0), z))
        parts.append(sweep_var('grid', pts, lambda t: (0.003, 0.02), m['heatRust'], n=120, ring=6, up=(1, 0, 0)))
    parts.append(box('floor', -Wd, Wd, y0, y0 + 0.01, -L, L, m['resistor']))
    hi = parts
    lo = join([box('rgL', -Wd - 0.02, Wd + 0.02, y0, y0 + H + 0.05, -L - 0.02, L + 0.02, m['resistor'])] + [dup(o) for o in parts if o.name.startswith(('ins', 'ft'))], 'resistorGrid')
    md = lo.modifiers.new('dec', 'DECIMATE'); md.ratio = 0.5
    apply_mods(lo)
    return hi, lo


# ------------------------------------------------------------------ seats
def seat_padded(m, shell, fabric, name, handle='dark', W=0.44):
    """Low-floor bus seat: lofted shell with a fabric back pad and cushion pad, a grab handle moulded across the
    top of the backrest (Solaris interiors, images 4-6 and 9-10)."""
    face = [(-0.23, 0.425), (-0.224, 0.455), (-0.1, 0.447), (0.05, 0.436), (0.165, 0.44), (0.205, 0.5), (0.228, 0.64), (0.25, 0.82), (0.274, 0.99), (0.29, 1.05), (0.306, 1.072)]
    rear = [(0.306, 1.072), (0.33, 1.066), (0.338, 1.04), (0.33, 0.93), (0.296, 0.7), (0.246, 0.48), (0.2, 0.405), (0.2, 0.386), (-0.2, 0.386), (-0.227, 0.405), (-0.23, 0.425)]
    o = seat_loft('seatHi', face, rear, W, shell, corner=0.12, dish=(0.009, 0.011))
    # grab hole through the top of the backrest (moulded handle)
    from kit_bus import stadium_prism
    sl = stadium_prism('slot', -0.11, 0.11, 0.985, 1.03, 1.038, 0.1, 0.5, 0.022)
    md = o.modifiers.new('b', 'BOOLEAN'); md.operation = 'DIFFERENCE'; md.object = sl; md.solver = 'EXACT'
    apply_mods(o)
    bpy.data.objects.remove(sl)
    o = bevel_mod(o, 0.0045, 3, 35)
    parts = [o]
    if fabric is not None:
        pad_pts = [p for p in resample(face, 60) if 0.5 <= p[1] <= 0.97]
        bm = bmesh.new()
        nxp = 13
        rows = []
        for j in range(nxp):
            x = -0.185 + 0.37 * j / (nxp - 1)
            rows.append([bm.verts.new(W_(x, y, z - 0.004)) for (z, y) in pad_pts])
        for j in range(nxp - 1):
            for i in range(len(pad_pts) - 1):
                bm.faces.new((rows[j][i], rows[j + 1][i], rows[j + 1][i + 1], rows[j][i + 1]))
        me = bpy.data.meshes.new('pad')
        bm.to_mesh(me)
        bm.free()
        pad = bpy.data.objects.new('pad', me)
        bpy.context.scene.collection.objects.link(pad)
        me.materials.append(fabric)
        sol = pad.modifiers.new('s', 'SOLIDIFY'); sol.thickness = 0.016; sol.offset = 1
        apply_mods(pad)
        pad = bevel_mod(pad, 0.005, 3, 40)
        for p in pad.data.polygons:
            p.use_smooth = True
        cu = box('cush', -0.185, 0.185, 0.43, 0.466, -0.21, 0.165, fabric, bev=0.013, segs=3)
        parts += [pad, cu]
    hi = join(parts, 'seatHi')
    lo = decimate_copy(hi, 0.1, name)
    return [hi], lo


def seat_ikarus(m):
    """Ikarus 280.92F after the refurbishment (images 16-17): grey one-piece plastic shell with a hand hole at the
    top, on a tubular pedestal (the high floor has no podiums); orange grab handle on the aisle side."""
    face = [(-0.225, 0.43), (-0.22, 0.458), (-0.1, 0.452), (0.05, 0.44), (0.16, 0.444), (0.2, 0.505), (0.222, 0.64), (0.24, 0.81), (0.262, 0.96), (0.278, 1.02), (0.292, 1.04)]
    rear = [(0.292, 1.04), (0.316, 1.035), (0.324, 1.01), (0.318, 0.92), (0.286, 0.7), (0.24, 0.48), (0.198, 0.41), (0.198, 0.392), (-0.198, 0.392), (-0.222, 0.41), (-0.225, 0.43)]
    o = seat_loft('seatHi', face, rear, 0.43, m['shellIk'], corner=0.1, dish=(0.01, 0.012))
    from kit_bus import stadium_prism
    sl = stadium_prism('slot', -0.1, 0.1, 0.955, 0.995, 1.002, 0.1, 0.5, 0.02)
    md = o.modifiers.new('b', 'BOOLEAN'); md.operation = 'DIFFERENCE'; md.object = sl; md.solver = 'EXACT'
    apply_mods(o)
    bpy.data.objects.remove(sl)
    o = bevel_mod(o, 0.0045, 3, 35)
    parts = [o]
    # pedestal: two tubes from the floor to a cross bar under the pan
    for x in (-0.13, 0.13):
        parts.append(cyl('leg', (x, 0.0, 0.0), (x, 0.39, 0.02), 0.014, m['seatFrame'], segs=12))
        parts.append(cyl('ft', (x, 0.0, 0.0), (x, 0.008, 0.0), 0.03, m['seatFrame'], segs=16))
    parts.append(cyl('bar', (-0.16, 0.37, 0.02), (0.16, 0.37, 0.02), 0.012, m['seatFrame'], segs=12))
    parts.append(tube('grab', [(0.21, 0.98, 0.3), (0.235, 1.07, 0.305), (0.235, 1.12, 0.31)], 0.0125, m['handleOrange'], segs=12))
    hi = join(parts, 'seatHi')
    lo = decimate_copy(hi, 0.1, 'seat_ikarus')
    return [hi], lo


def seat_e12(m, hand=1):
    """Yutong E12 (image 10): light-grey one-piece plastic shell with a moulded hand hole, a charcoal insert panel
    on the back of the backrest and an orange grab handle at the top corner on the aisle side (hand = +1: +x)."""
    face = [(-0.23, 0.425), (-0.224, 0.455), (-0.1, 0.447), (0.05, 0.436), (0.165, 0.44), (0.205, 0.5), (0.228, 0.64), (0.25, 0.82), (0.272, 0.98), (0.288, 1.04), (0.302, 1.06)]
    rear = [(0.302, 1.06), (0.326, 1.054), (0.334, 1.03), (0.326, 0.92), (0.292, 0.7), (0.244, 0.48), (0.2, 0.405), (0.2, 0.386), (-0.2, 0.386), (-0.227, 0.405), (-0.23, 0.425)]
    o = seat_loft('seatHi', face, rear, 0.44, m['shellE12'], corner=0.12, dish=(0.01, 0.012))
    from kit_bus import stadium_prism
    sl = stadium_prism('slot', -0.1, 0.1, 0.975, 1.018, 1.026, 0.1, 0.5, 0.02)
    md = o.modifiers.new('b', 'BOOLEAN'); md.operation = 'DIFFERENCE'; md.object = sl; md.solver = 'EXACT'
    apply_mods(o)
    bpy.data.objects.remove(sl)
    o = bevel_mod(o, 0.0045, 3, 35)
    parts = [o]
    # charcoal insert on the back: a pad following the rear face of the backrest
    pts = [(z + 0.004, y) for (z, y) in resample(rear, 60) if 0.52 <= y <= 0.93]
    bm = bmesh.new()
    nxp = 11
    rows = []
    for j in range(nxp):
        x = -0.17 + 0.34 * j / (nxp - 1)
        rows.append([bm.verts.new(W_(x, y, z)) for (z, y) in pts])
    for j in range(nxp - 1):
        for i in range(len(pts) - 1):
            bm.faces.new((rows[j][i + 1], rows[j + 1][i + 1], rows[j + 1][i], rows[j][i]))
    me = bpy.data.meshes.new('ins')
    bm.to_mesh(me)
    bm.free()
    ins = bpy.data.objects.new('ins', me)
    bpy.context.scene.collection.objects.link(ins)
    me.materials.append(m['insertE12'])
    sol = ins.modifiers.new('s', 'SOLIDIFY'); sol.thickness = 0.006; sol.offset = 1
    apply_mods(ins)
    parts.append(bevel_mod(ins, 0.002, 2, 40))
    # orange grab handle over the aisle-side top corner
    x = hand * 0.2
    parts.append(tube('grab', [(x, 0.985, 0.3), (x + hand * 0.015, 1.07, 0.305), (x + hand * 0.012, 1.11, 0.312)], 0.0135, m['handleE12'], segs=12))
    parts.append(box('grabFoot', x - 0.025, x + 0.025, 0.97, 1.0, 0.29, 0.33, m['handleE12'], bev=0.006, segs=2))
    hi = join(parts, 'seatHi')
    lo = decimate_copy(hi, 0.1, 'seat_e12' if hand > 0 else 'seat_e12m')
    return [hi], lo


# ------------------------------------------------------------------ mirrors
def mirrors_solaris(m):
    """Solaris Urbino 18 mirrors (both generations in Sofia): on the right a long arm from the roof corner
    curving forwards and down to a tall two-glass head ahead of door 1; on the left a shorter arm from the
    A-pillar top to a single head. Bus frame, front face at z = 0, half width 1.275."""
    blk = m['mirrorBody']
    parts = []
    arm = [(1.12, 2.92, 0.25), (1.27, 2.95, 0.12), (1.45, 2.88, -0.08), (1.58, 2.7, -0.28), (1.62, 2.5, -0.38)]
    parts.append(sweep_var('armR', arm, lambda t: (0.045 + 0.02 * t, 0.035 + 0.015 * t), blk, n=40, ring=16))
    parts.append(shell_head('rootR', 0.14, 0.09, 0.16, blk))
    place(parts[-1], at=(1.13, 2.92, 0.26))
    hd = head_with_glass(m, 0.26, 0.6, 0.14, [(0.21, 0.31, 0.1), (0.2, 0.15, -0.16)], 'headR')
    for o in hd:
        place(o, rot_y=-0.15, rot_z=-0.05, at=(1.6, 2.15, -0.4))
    parts += hd
    armL = [(-1.2, 2.55, 0.18), (-1.36, 2.55, 0.02), (-1.48, 2.45, -0.15)]
    parts.append(sweep_var('armL', armL, lambda t: (0.04, 0.032), blk, n=24, ring=14))
    hd = head_with_glass(m, 0.25, 0.42, 0.13, [(0.2, 0.26, 0.04)], 'headL')
    for o in hd:
        place(o, rot_y=0.15, at=(-1.5, 2.2, -0.2))
    parts += hd
    hi = parts
    lo = lowpoly(parts, 'mirrorsSolaris', 0.3)
    return hi, lo


def mirrors_ikarus(m):
    """Ikarus 280: rectangular heads on bent steel rods clamped to the front corners (refurbished front keeps the
    rod mirrors, images 11-14). Bus frame, front face at z = 0, half width 1.25."""
    blk = m['mirrorBody']
    parts = []
    for sx in (-1, 1):
        rod = [(sx * 1.2, 2.25, 0.12), (sx * 1.42, 2.3, 0.0), (sx * 1.5, 2.25, -0.12), (sx * 1.52, 2.05, -0.2)]
        parts.append(sweep_var('rod', rod, lambda t: (0.013, 0.013), m['galv'], n=24, ring=10))
        parts.append(box('clamp', sx * 1.2 - 0.03, sx * 1.2 + 0.03, 2.2, 2.3, 0.08, 0.16, blk, bev=0.01))
        hd = head_with_glass(m, 0.22, 0.36, 0.08, [(0.19, 0.31, 0.0)], 'head')
        for o in hd:
            place(o, rot_y=sx * 0.12, at=(sx * 1.53, 1.85, -0.22))
        parts += hd
        parts.append(box('hb', sx * 1.53 - 0.02, sx * 1.53 + 0.02, 2.0, 2.05, -0.24, -0.18, blk, bev=0.006))
    hi = parts
    lo = lowpoly(parts, 'mirrorsIkarus', 0.35)
    return hi, lo


# ------------------------------------------------------------------ headlamp clusters
def lamp_unit(m, cx, cy, w, h, depth, reflectors, name, drl=None, amber=None, tilt=0.0):
    """A lamp cluster set into the front face (outward = -z): a black tray recessed behind the face with chrome
    reflector cups and bulbs, an LED strip and the amber indicator. reflectors = [(dx, dy, r)], drl = (dx0, dx1,
    dy, h), amber = (dx, dy, w, h)."""
    parts = []
    tray = rrect_prism(name, cx, cy, w, h, min(w, h) * 0.3, -0.006, depth, m['lampBlack'], n=8)
    pocket = rrect_prism('pk', cx, cy, w - 0.024, h - 0.024, min(w, h) * 0.25, -0.02, depth - 0.006, n=8)
    md = tray.modifiers.new('b', 'BOOLEAN'); md.operation = 'DIFFERENCE'; md.object = pocket; md.solver = 'EXACT'
    apply_mods(tray)
    bpy.data.objects.remove(pocket)
    parts.append(tray)
    zb = depth - 0.006  # back of the tray
    for (dx, dy, r) in reflectors:
        d = min(0.045, zb - 0.004)
        cup = lathe('cup', [(r * 0.35, -d), (r * 0.6, -d * 0.8), (r * 0.88, -d * 0.4), (r, 0.0)], 32, m['reflector'], close=False)
        cup.data.transform(Matrix.Rotation(math.radians(90), 4, 'Z'))  # lathe axis three x -> three z (deep end back)
        cup.data.transform(Matrix.Translation(W(cx + dx, cy + dy, 0.004)))
        parts.append(cup)
        b = lathe('bulb', [(0.0, -0.03), (0.011, -0.028), (0.013, -0.015), (0.008, -0.004), (0.0, -0.002)], 16, m['lensClear'])
        b.data.transform(Matrix.Rotation(math.radians(90), 4, 'Z'))
        b.data.transform(Matrix.Translation(W(cx + dx, cy + dy, 0.004)))
        parts.append(b)
    if drl:
        x0, x1, dy, hh = drl
        parts.append(box('drl', cx + x0, cx + x1, cy + dy - hh / 2, cy + dy + hh / 2, 0.002, 0.012, m['ledDrl'], bev=0.002))
    if amber:
        dx, dy, aw, ah = amber
        parts.append(box('amb', cx + dx - aw / 2, cx + dx + aw / 2, cy + dy - ah / 2, cy + dy + ah / 2, 0.002, 0.014, m['lensAmber'], bev=0.003))
    if tilt:
        for o in parts:
            o.data.transform(Matrix.Translation(W(-cx, -cy, 0)))
            o.data.transform(Matrix.Rotation(tilt, 4, 'Y'))
            o.data.transform(Matrix.Translation(W(cx, cy, 0)))
    return parts


def heads_s4(m):
    """Urbino IV: slim angular LED headlamps at the lower corners (two LED projectors each), the daytime
    running light as a strip along the top edge, indicator at the outer end. Front face at z = 0, x +-1.275."""
    parts = []
    for sx in (-1, 1):
        cx = sx * 0.88
        parts += lamp_unit(m, cx, 0.82, 0.48, 0.13, 0.05, [(sx * -0.12, -0.01, 0.042), (sx * 0.0, -0.01, 0.042)], 'hS4', drl=(-0.22, 0.22, 0.05, 0.016), amber=(sx * 0.17, -0.012, 0.09, 0.05), tilt=sx * 0.05)
    hi = parts
    lo = lowpoly(parts, 'headS4', 0.4)
    return hi, lo


def heads_s3(m):
    """Urbino III: rounded 'eye' clusters at the lower corners, two round lamps under one lens with the
    indicator above the outer lamp."""
    parts = []
    for sx in (-1, 1):
        cx = sx * 0.9
        parts += lamp_unit(m, cx, 0.86, 0.34, 0.2, 0.06, [(sx * -0.075, -0.02, 0.06), (sx * 0.08, -0.02, 0.055)], 'hS3', amber=(sx * 0.08, 0.065, 0.12, 0.04))
    hi = parts
    lo = lowpoly(parts, 'headS3', 0.4)
    return hi, lo


def heads_ikarus(m):
    """Ikarus 280.92F refurbished front: rectangular twin headlamps in black panels low on the new front mask
    with the indicators outboard."""
    parts = []
    for sx in (-1, 1):
        cx = sx * 0.83
        parts += lamp_unit(m, cx, 0.78, 0.42, 0.15, 0.06, [(sx * -0.1, 0.0, 0.055), (sx * 0.04, 0.0, 0.05)], 'hIk', amber=(sx * 0.165, 0.0, 0.07, 0.11))
    hi = parts
    lo = lowpoly(parts, 'headIkarus', 0.4)
    return hi, lo


# ------------------------------------------------------------------ table
# name: (builder, cell (x, y, w, h) in the 2048 atlas, smoothing angle, ray)
PIECES = {
    'trolleyBase': (trolley_base, (0, 0, 512, 512), 40, 0.03),
    'trolleyTurret': (trolley_turret, (512, 0, 512, 512), 40, 0.03),
    'poleRoot': (pole_root, (1024, 0, 256, 256), 40, 0.02),
    'poleHead': (pole_head, (1280, 0, 256, 256), 40, 0.02),
    'poleHook': (pole_hook, (1536, 0, 256, 256), 40, 0.02),
    'retriever': (retriever, (1792, 0, 256, 256), 40, 0.02),
    'poleTube': (pole_tube, (1024, 256, 1024, 128), 50, 0.01),
    'roofLouvre': (roof_louvre, (1024, 384, 512, 256), 40, 0.04),
    'roofFan': (roof_fan, (1536, 384, 256, 256), 40, 0.03),
    'resistorGrid': (resistor_grid, (0, 512, 512, 512), 40, 0.05),
    'seat_solaris4': (lambda m: seat_padded(m, m['shellS4'], m['fabricS4'], 'seat_solaris4'), (512, 640, 512, 512), 40, 0.02),
    'seat_solaris3': (lambda m: seat_padded(m, m['shellS3'], m['fabricS3'], 'seat_solaris3'), (1024, 640, 512, 512), 40, 0.02),
    'seat_ikarus': (seat_ikarus, (1536, 640, 512, 512), 40, 0.02),
    'mirrorsSolaris': (mirrors_solaris, (0, 1152, 512, 512), 40, 0.02),
    'mirrorsIkarus': (mirrors_ikarus, (512, 1152, 512, 512), 40, 0.02),
    'headS4': (heads_s4, (1024, 1152, 512, 256), 40, 0.02),
    'headS3': (heads_s3, (1024, 1408, 512, 256), 40, 0.02),
    'headIkarus': (heads_ikarus, (1536, 1152, 512, 256), 40, 0.02),
    # line 84 (Expansion 6.0)
    'seat_sor': (lambda m: seat_padded(m, m['shellSor'], m['fabricSor'], 'seat_sor'), (0, 1664, 384, 384), 40, 0.02),
    'seat_e12': (lambda m: seat_e12(m, 1), (384, 1664, 384, 384), 40, 0.02),
    'seat_e12m': (lambda m: seat_e12(m, -1), (768, 1664, 384, 384), 40, 0.02),
}

VIEWS = {'seat': ((0.8, 1.0, 0.5), (0.5, -1.0, 0.25)), 'mirrors': ((0.6, 1.0, 0.25), (0.4, -1.0, 0.3)), 'head': ((0.2, 1.0, 0.15), (0.6, 1.0, 0.5))}
M_ = {}


def main():
    preview = sys.argv[sys.argv.index('--preview') + 1] if '--preview' in sys.argv else None
    render = sys.argv[sys.argv.index('--render') + 1] if '--render' in sys.argv else None
    only = sys.argv[sys.argv.index('--only') + 1].split(',') if '--only' in sys.argv else None
    reset()
    bpy.context.scene.world.light_settings.distance = 0.12
    mats = M()
    M_.update(mats)
    atlas = Atlas(2048, 'trolley')
    los = []
    for name, (fn, cell, ang, ray) in PIECES.items():
        if only and name not in only:
            continue
        hi, lo = fn(mats)
        if render:
            os.makedirs(render, exist_ok=True)
            for o in los:
                o.hide_render = True
            lo.hide_render = True  # preview the high-poly model only
            key = 'seat' if name.startswith('seat') else 'mirrors' if name.startswith('mirrors') else 'head' if name.startswith('head') else None
            views = VIEWS.get(key, ((1.0, -0.45, 0.3), (0.25, -1.0, 0.4)))
            if key in ('mirrors', 'head'):
                # close views of the right-hand unit (the pieces span the whole front)
                tgt = W(1.55, 2.3, -0.2) if key == 'mirrors' else W(0.88, 0.82, 0.0)
                render_preview(hi, os.path.join(render, f'{name}.jpg'), d=views[0], zoom=0.25, target=tgt)
                render_preview(hi, os.path.join(render, f'{name}_b.jpg'), d=views[1], zoom=0.25, target=tgt)
            else:
                render_preview(hi, os.path.join(render, f'{name}.jpg'), d=views[0])
                render_preview(hi, os.path.join(render, f'{name}_b.jpg'), d=views[1], zoom=0.9)
            if not preview:
                for o in hi + [lo]:
                    bpy.data.objects.remove(o)
                continue
        sharpen(lo, ang)
        triangulate(lo)
        atlas.unwrap(lo, cell)
        for o in hi:
            o.hide_render = False
        atlas.bake(lo, hi, cell, extrusion=0.012, ray=ray)
        lo.name = lo.data.name = name
        print(f'{name}: high {sum(tri_count(o) for o in hi)} tris -> low {tri_count(lo)} tris', flush=True)
        for o in hi:
            bpy.data.objects.remove(o)
        lo.hide_render = True
        los.append(lo)
    if render and not preview:
        return
    out_dir = preview or os.path.join(ROOT, 'tools', 'blender', 'out')
    os.makedirs(out_dir, exist_ok=True)
    atlas.finish(out_dir, ao_in_albedo=0.7)
    km = atlas.export_material('trolleykit')
    for lo in los:
        lo.hide_render = False
        lo.data.materials.clear()
        lo.data.materials.append(km)
        lo.location = (0, 0, 0)
    export_glb(los, OUT if not preview else os.path.join(preview, 'kit_trolley.glb'))
    print('wrote', OUT if not preview else preview)


if __name__ == '__main__':
    main()
