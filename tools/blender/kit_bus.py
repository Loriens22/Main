# Bus parts modelled in Blender and baked into one texture atlas (src/data/kit_bus.glb): tyres, steel and
# aluminium wheels, the seat shells of the four buses, hand straps, stop buttons, the Sofia ticket validator,
# pole fittings, mirrors and the steering wheel. High-poly models (lettering, tread, hand holes, nuts, fabric
# relief) are baked onto game-resolution meshes: albedo with contact shading, tangent-space normals, ORM.
#
# Frame: three.js piece frame in metres (x right, y up, z backwards); the kitlib wall frame (t, u, n) is used
# with t = x, u = y, n = z. Wheels turn about x with the outer face towards +x. Seats stand on their local
# floor (y = 0) with the pan centre over the origin, facing -z.
#
#   blenv/bin/python tools/blender/kit_bus.py [--preview DIR] [--only a,b] [--render DIR]
import math
import os
import sys

import bpy
import bmesh  # noqa: E402 (only importable after bpy)
from mathutils import Vector, Matrix

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from kitlib import (W, reset, mat, box, obox, cyl, torus, tube, from_pydata, boolean, join, sharpen, triangulate,  # noqa: E402
                    tri_count, apply_mods, lathe, render_preview, Atlas, export_glb)

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'src', 'data', 'kit_bus.glb')


def moquette():
    """Blue-grey seat fabric with light scribbled strokes (Conecto backrests, ref04/ref05)."""
    m = bpy.data.materials.new('moquette')
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes['Principled BSDF']
    b.inputs['Roughness'].default_value = 0.95
    m['rough'], m['metal'] = 0.95, 0.0
    tc = nt.nodes.new('ShaderNodeTexCoord')
    wv = nt.nodes.new('ShaderNodeTexWave')
    wv.inputs['Scale'].default_value = 26
    wv.inputs['Distortion'].default_value = 9
    wv.inputs['Detail'].default_value = 4
    nt.links.new(tc.outputs['Object'], wv.inputs['Vector'])
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = 0.0
    ramp.color_ramp.elements[0].color = (0.09, 0.13, 0.22, 1)
    ramp.color_ramp.elements[1].position = 0.85
    ramp.color_ramp.elements[1].color = (0.11, 0.15, 0.25, 1)
    e = ramp.color_ramp.elements.new(0.95)
    e.color = (0.3, 0.34, 0.42, 1)
    nt.links.new(wv.outputs['Fac'], ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], b.inputs['Base Color'])
    nz = nt.nodes.new('ShaderNodeTexNoise')
    nz.inputs['Scale'].default_value = 1500
    nt.links.new(tc.outputs['Object'], nz.inputs['Vector'])
    bp = nt.nodes.new('ShaderNodeBump')
    bp.inputs['Strength'].default_value = 0.4
    bp.inputs['Distance'].default_value = 0.001
    nt.links.new(nz.outputs['Fac'], bp.inputs['Height'])
    nt.links.new(bp.outputs['Normal'], b.inputs['Normal'])
    return m


def mat_split(name, col_lo, col_hi, rough, c0, c2, w=0.44, soft=0.0012):
    """Plastic whose colour changes from col_lo to col_hi above the curve y = c0 + c2 * (2x / w)^2 (piece
    frame), e.g. the charcoal cap on a light-grey seat shell."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes['Principled BSDF']
    b.inputs['Roughness'].default_value = rough
    m['rough'], m['metal'] = rough, 0.0
    tc = nt.nodes.new('ShaderNodeTexCoord')
    sp = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(tc.outputs['Object'], sp.inputs['Vector'])
    # Blender (x, y, z) = three (x, -z, y): height is Blender z
    sq = nt.nodes.new('ShaderNodeMath'); sq.operation = 'MULTIPLY'
    nt.links.new(sp.outputs['X'], sq.inputs[0]); nt.links.new(sp.outputs['X'], sq.inputs[1])
    k = nt.nodes.new('ShaderNodeMath'); k.operation = 'MULTIPLY_ADD'
    nt.links.new(sq.outputs[0], k.inputs[0]); k.inputs[1].default_value = c2 * 4 / (w * w); k.inputs[2].default_value = c0
    d = nt.nodes.new('ShaderNodeMath'); d.operation = 'SUBTRACT'
    nt.links.new(sp.outputs['Z'], d.inputs[0]); nt.links.new(k.outputs[0], d.inputs[1])
    mr = nt.nodes.new('ShaderNodeMapRange')
    mr.inputs['From Min'].default_value = -soft
    mr.inputs['From Max'].default_value = soft
    nt.links.new(d.outputs[0], mr.inputs['Value'])
    mx = nt.nodes.new('ShaderNodeMix'); mx.data_type = 'RGBA'
    mx.inputs['A'].default_value = (*col_lo, 1)
    mx.inputs['B'].default_value = (*col_hi, 1)
    nt.links.new(mr.outputs['Result'], mx.inputs['Factor'])
    nt.links.new(mx.outputs['Result'], b.inputs['Base Color'])
    nz = nt.nodes.new('ShaderNodeTexNoise')
    nz.inputs['Scale'].default_value = 1500
    nt.links.new(tc.outputs['Object'], nz.inputs['Vector'])
    bp = nt.nodes.new('ShaderNodeBump')
    bp.inputs['Strength'].default_value = 0.05
    bp.inputs['Distance'].default_value = 0.001
    nt.links.new(nz.outputs['Fac'], bp.inputs['Height'])
    nt.links.new(bp.outputs['Normal'], b.inputs['Normal'])
    return m


def M():
    return {
        'rubber': mat('rubber', (0.028, 0.028, 0.03), 0.86, noise=0.12, nscale=60, bump=0.15, bscale=900),
        'rubberSide': mat('rubberSide', (0.034, 0.034, 0.036), 0.7, noise=0.1, nscale=40),
        'silver': mat('silver', (0.66, 0.67, 0.68), 0.4, 0.3, noise=0.04, nscale=30),
        'silverDirt': mat('silverDirt', (0.5, 0.5, 0.49), 0.5, 0.45, noise=0.12, nscale=25, grime=0.25),
        'zinc': mat('zinc', (0.56, 0.56, 0.54), 0.4, 1.0, noise=0.08, nscale=200),
        # polished aluminium, but not a mirror: road film and brushing spread the reflections (ref12 reads bright)
        'alu': mat('alu', (0.84, 0.85, 0.86), 0.3, 0.85, noise=0.05, nscale=50),
        'drum': mat('drum', (0.05, 0.046, 0.042), 0.8, 0.3, noise=0.3, nscale=30),
        'hubBlack': mat('hubBlack', (0.03, 0.03, 0.03), 0.55),
        'indicator': mat('indicator', (0.8, 0.22, 0.03), 0.45),
        # seats (linear albedo)
        'seatGrey': mat_split('seatGrey', (0.33, 0.35, 0.37), (0.043, 0.047, 0.055), 0.42, 0.915, 0.015),
        'seatProcity': mat_split('seatProcity', (0.045, 0.05, 0.056), (0.2, 0.215, 0.23), 0.42, 0.95, 0.0, w=0.43),
        'seatCap': mat('seatCap', (0.043, 0.047, 0.055), 0.45, bump=0.05, bscale=1500),
        'seatPanel': mat('seatPanel', (0.38, 0.4, 0.42), 0.5, bump=0.05, bscale=1500),
        'seatCharcoal': mat('seatCharcoal', (0.045, 0.05, 0.056), 0.42, bump=0.05, bscale=1500),
        'seatRim': mat('seatRim', (0.2, 0.215, 0.23), 0.4, bump=0.05, bscale=1500),
        'seatLight': mat('seatLight', (0.36, 0.385, 0.405), 0.42, noise=0.02, nscale=80, bump=0.05, bscale=1500),
        'seatGreyC': mat('seatGreyC', (0.4, 0.42, 0.43), 0.45, noise=0.05, nscale=60, bump=0.05, bscale=1500),
        'moquette': moquette(),
        'cushion': mat('cushion', (0.03, 0.06, 0.25), 0.95, noise=0.15, nscale=400, bump=0.3, bscale=1200),
        'handleDark': mat('handleDark', (0.04, 0.042, 0.045), 0.5),
        'strapPlastic': mat('strapPlastic', (0.42, 0.43, 0.44), 0.45, bump=0.03, bscale=2000),
        'webbing': mat('webbing', (0.4, 0.41, 0.42), 0.9, noise=0.08, nscale=900, bump=0.4, bscale=1400),
        'valBlue': mat('valBlue', (0.012, 0.09, 0.42), 0.35, bump=0.02, bscale=2000),
        'valGlass': mat('valGlass', (0.006, 0.007, 0.009), 0.06),
        'valScreen': mat('valScreen', (0.02, 0.05, 0.12), 0.1),
        'valText': mat('valText', (0.75, 0.78, 0.8), 0.3),
        'valLed': mat('valLed', (0.05, 0.6, 0.1), 0.3),
        'mirrorBody': mat('mirrorBody', (0.022, 0.023, 0.025), 0.42, bump=0.03, bscale=2500),
        'mirrorGlass': mat('mirrorGlass', (0.75, 0.77, 0.78), 0.04, 1.0),
    }


# ------------------------------------------------------------------ helpers
def interp(prof, r):
    """x of a (r, x) profile at radius r (profile sorted by r)."""
    for (r0, x0), (r1, x1) in zip(prof, prof[1:]):
        if r0 <= r <= r1 or r1 <= r <= r0:
            t = 0 if r1 == r0 else (r - r0) / (r1 - r0)
            return x0 + (x1 - x0) * t
    return prof[-1][1]


def text_mesh(name, body, size, m, depth=0.0012):
    cu = bpy.data.curves.new(name + '_c', 'FONT')
    cu.body = body
    cu.size = size
    cu.extrude = depth / 2
    cu.align_x = 'CENTER'
    cu.align_y = 'CENTER'
    o = bpy.data.objects.new(name + '_t', cu)
    bpy.context.scene.collection.objects.link(o)
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(o.evaluated_get(dg))
    bpy.data.objects.remove(o)
    bpy.data.curves.remove(cu)
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    me.materials.append(m)
    return ob


def wrap_text(o, R, a0, surf_x, lift=0.0006):
    """Bends a flat text mesh (x along the text, y up, z depth) round the wheel axis on the sidewall:
    baseline radius R, centred at angle a0, reading left to right when seen from outside (+x)."""
    for v in o.data.vertices:
        tx, ty, tz = v.co
        r = R + ty
        a = a0 - tx / R
        x = surf_x(r) + lift + (tz + 0.0006)
        v.co = W(x, r * math.cos(a), r * math.sin(a))
    o.data.update()
    return o


def mirror_x(o):
    """Mirror a piece-frame object across x = 0 (t -> -t) and fix the winding."""
    me = o.data
    me.transform(Matrix.Diagonal((-1, 1, 1, 1)))
    me.flip_normals()
    return o


def lathe_uv(o, n_seg, n_prof, rect):
    """Cylindrical UVs for an open-seam lathe built by lathe(close=False): u = angle, v = profile index
    (spaced by arc length), mapped into rect = (u0, v0, u1, v1) of the cell square."""
    me = o.data
    uv = me.uv_layers.new(name='UVMap') if not me.uv_layers else me.uv_layers.active
    co = [v.co.copy() for v in me.vertices]
    # vertex index = ring * n_prof + j in lathe(); arc-length parameter along the profile
    ring0 = [co[j] for j in range(n_prof)]
    s = [0.0]
    for j in range(1, n_prof):
        s.append(s[-1] + (ring0[j] - ring0[j - 1]).length)
    L = s[-1] or 1
    u0, v0, u1, v1 = rect
    for p in me.polygons:
        for li in p.loop_indices:
            vi = me.loops[li].vertex_index
            ring, j = divmod(vi, n_prof)
            uv.data[li].uv = (u0 + (u1 - u0) * ring / n_seg, v0 + (v1 - v0) * s[j] / L)


# ------------------------------------------------------------------ tyre 275/70 R22.5
# outer half of the section (r, x): bead on the rim flange, sidewall bulge, shoulder, half the crown
TYRE_SIDE = [(0.2858, 0.104), (0.297, 0.107), (0.307, 0.115), (0.322, 0.125), (0.345, 0.133), (0.372, 0.1375), (0.398, 0.138),
             (0.422, 0.1345), (0.441, 0.128), (0.455, 0.12), (0.466, 0.111), (0.473, 0.1015)]
TYRE_LO = TYRE_SIDE + [(0.4772, 0.091), (0.478, 0.078), (0.478, 0.04), (0.478, 0.0)]


def tyre(m):
    r = m['rubber']
    # crown with four circumferential grooves (two per half), 12 mm deep
    crown = [(0.4772, 0.091), (0.478, 0.08), (0.478, 0.0745), (0.4675, 0.0725), (0.4665, 0.0635), (0.478, 0.0615),
             (0.478, 0.0345), (0.4675, 0.0325), (0.4665, 0.0235), (0.478, 0.0215), (0.478, 0.0)]
    hi_half = lathe('tyreHi', TYRE_SIDE + crown, 360, r)
    # shoulder blocks: lateral grooves every 5 degrees across the outer rib and the shoulder
    cut = []
    for i in range(72):
        a = 2 * math.pi * i / 72
        for x0, x1, off in ((0.077, 0.115, 0.0), (0.038, 0.06, 0.5)):
            aa = a + off * 2 * math.pi / 72
            cc = Vector((0.0, math.cos(aa), math.sin(aa)))
            tt = Vector((0.0, -math.sin(aa), math.cos(aa)))
            cut.append(obox('cut', ((x0 + x1) / 2, cc.y * 0.4795, cc.z * 0.4795), (1, 0, 0), (0, cc.y, cc.z), (0, tt.y, tt.z),
                            (x1 - x0) / 2 + 0.002, 0.009, 0.0035 if off == 0 else 0.0022))
    cutter = join(cut, 'cutter')
    outward(cutter)
    md = hi_half.modifiers.new('b', 'BOOLEAN')
    md.operation = 'DIFFERENCE'
    md.object = cutter
    md.solver = 'EXACT'
    apply_mods(hi_half)
    bpy.data.objects.remove(cutter)
    # sidewall lettering (size, load index, construction) and a raised rim-protector rib
    side = lambda rr: interp(TYRE_SIDE, rr)
    texts = []
    for body, size, R, a0 in (('275/70 R22.5', 0.026, 0.405, 0.6), ('TUBELESS', 0.014, 0.41, 2.1), ('152/148 J  M+S', 0.013, 0.41, 3.5),
                              ('REGROOVABLE', 0.012, 0.412, 4.6), ('275/70 R22.5', 0.026, 0.405, 0.6 + math.pi), ('3PMSF  CITY', 0.012, 0.412, 5.6)):
        t = text_mesh('txt', body, size, m['rubberSide'])
        texts.append(wrap_text(t, R, a0, side))
    rib = lathe('rib', [(0.326, side(0.326) + 0.0005), (0.33, side(0.33) + 0.0035), (0.336, side(0.336) + 0.0035), (0.34, side(0.34) + 0.0005)], 360, m['rubberSide'])
    hi = join([hi_half] + texts + [rib], 'tyreHiHalf')
    # low-poly half: open-seam lathe, cylindrical UVs over the whole cell
    lo = lathe('tyre', TYRE_LO, 64, r, close=False)
    lathe_uv(lo, 64, len(TYRE_LO), (0.0, 0.0, 1.0, 1.0))
    return [hi], lo


def finish_tyre(lo):
    """Second half of the tyre: the baked half mirrored across the centre plane (same UVs)."""
    lo2 = lo.copy()
    lo2.data = lo.data.copy()
    bpy.context.scene.collection.objects.link(lo2)
    mirror_x(lo2)
    t = join([lo, lo2], 'tyre')
    bm = bmesh.new()
    bm.from_mesh(t.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bm.to_mesh(t.data)
    bm.free()
    return t


# ------------------------------------------------------------------ wheels 22.5 x 8.25, 10 studs on 335 mm
PCD = 0.1675


def nut(name, m, x0, r=0.0185, h=0.022, washer=True, segs=6):
    """Wheel nut on the outer face at x0, axis +x (piece origin at the wheel centre)."""
    parts = [cyl(name, (x0, 0, 0), (x0 + h, 0, 0), r, m, segs=segs, smooth=False)]
    if washer:
        parts.append(cyl(name + 'w', (x0 - 0.001, 0, 0), (x0 + 0.004, 0, 0), r * 1.32, m, segs=24))
    parts.append(cyl(name + 's', (x0 + h, 0, 0), (x0 + h + 0.01, 0, 0), 0.0105, m, segs=12, r1=0.009))
    return join(parts, name)


def ring_copies(o, n, r, phase=0.0):
    """n copies of o (built on the axis) at radius r round the x axis."""
    out = []
    for i in range(n):
        a = phase + 2 * math.pi * i / n
        c = o.copy()
        c.data = o.data.copy()
        bpy.context.scene.collection.objects.link(c)
        # three.js (0, r cos a, r sin a) as Blender translation
        c.data.transform(Matrix.Translation(W(0, r * math.cos(a), r * math.sin(a))))
        out.append(c)
    bpy.data.objects.remove(o)
    return out


def slot_cutters(n, r, rlen, w, x0, x1, phase=0.0, round_holes=False):
    cs = []
    for i in range(n):
        a = phase + 2 * math.pi * i / n
        u = Vector((0, math.cos(a), math.sin(a)))
        t = Vector((0, -math.sin(a), math.cos(a)))
        if round_holes:
            c = cyl('h', ((x0 + x1) / 2 - 0.05, u.y * r, u.z * r), ((x0 + x1) / 2 + 0.05, u.y * r, u.z * r), w, None, segs=24)
        else:
            # stadium slot: box + two end cylinders
            parts = [obox('h', ((x0 + x1) / 2, u.y * r, u.z * r), (1, 0, 0), (0, u.y, u.z), (0, t.y, t.z), 0.05, rlen / 2 - w, w)]
            for e in (-1, 1):
                rr = r + e * (rlen / 2 - w)
                parts.append(cyl('h', ((x0 + x1) / 2 - 0.05, u.y * rr, u.z * rr), ((x0 + x1) / 2 + 0.05, u.y * rr, u.z * rr), w, None, segs=16))
            c = join(parts, 'h')
        cs.append(c)
    return join(cs, 'cutter')


def outward(o):
    """Consistent outward normals on a closed shell (the bake casts along them)."""
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(o.data)
    bm.free()
    return o


def cut(o, cutter):
    # obox() with a left-handed axis set builds an inside-out box: as a cutter it removed the whole disc
    outward(cutter)
    md = o.modifiers.new('b', 'BOOLEAN')
    md.operation = 'DIFFERENCE'
    md.object = cutter
    md.solver = 'EXACT'
    md.use_self = True  # the slot cutters are overlapping box + end cylinders
    apply_mods(o)
    bpy.data.objects.remove(cutter)
    return o


def wheel_disc(m, kind):
    """kind: 'steel' (front / single), 'steelRear' (outer twin, disc deep inside), 'alu', 'aluRear'."""
    rear = kind.endswith('Rear')
    alu = kind.startswith('alu')
    face = m['alu'] if alu else m['silver']
    # rim: outer flange curl, bead seat, well, inner flange (x from +0.118 outer to -0.118 inner)
    rim_prof = [(0.2858, -0.104), (0.296, -0.11), (0.3015, -0.118), (0.297, -0.122), (0.284, -0.118), (0.279, -0.108),
                (0.279, -0.05), (0.262, -0.03), (0.262, 0.04), (0.279, 0.06), (0.279, 0.108), (0.284, 0.118), (0.297, 0.122),
                (0.3015, 0.118), (0.296, 0.11), (0.2858, 0.104)]
    if rear:
        # reversed disc: welded at the inner end of the well; the hub sits deep in the barrel
        dx = -0.155
        disc_prof = [(0.262, -0.02), (0.25, dx + 0.01), (0.235, dx), (0.19, dx - 0.004), (0.15, dx - 0.004), (0.138, dx + 0.008), (0.112, dx + 0.008), (0.108, dx)]
    else:
        dx = 0.072
        # the disc flange is welded to the bead-seat edge of the rim: no cavity between rim and disc
        disc_prof = [(0.279, 0.058), (0.266, 0.064), (0.24, dx), (0.19, dx + 0.004), (0.15, dx + 0.004), (0.138, dx + 0.016), (0.112, dx + 0.016), (0.108, dx + 0.008)]
    if alu:
        disc_prof = [(r_, x + 0.006) for r_, x in disc_prof]
    rim_hi = lathe('rim', rim_prof, 192, face)
    # the disc as a closed section (front face, inner edge, back face) turned into a closed shell, so the
    # boolean hand holes cut a proper solid (a solidified open surface came out of the boolean in pieces)
    th = 0.008 if not alu else 0.016
    closed = [(r_, x + th / 2) for r_, x in disc_prof] + [(r_, x - th / 2) for r_, x in reversed(disc_prof)]
    closed.append(closed[0])
    disc_hi = lathe('disc', closed, 192, face)
    outward(disc_hi)
    hx = (disc_prof[2][1] + disc_prof[3][1]) / 2
    if alu:
        cutter = slot_cutters(10, 0.215, 0.0, 0.026, hx - 0.03, hx + 0.03, phase=math.pi / 10, round_holes=True)
    else:
        cutter = slot_cutters(10, 0.214, 0.07, 0.016, hx - 0.03, hx + 0.03, phase=math.pi / 10)
    cut(disc_hi, cutter)
    outward(disc_hi)
    # hub: drum / hub body behind the disc, hub cap in front
    hub_x = disc_prof[5][1]
    parts = [rim_hi, disc_hi]
    drum = lathe('drum', [(0.25, hub_x - 0.09), (0.25, hub_x - 0.03), (0.2, hub_x - 0.03), (0.11, hub_x - 0.025)], 96, m['drum'])
    parts.append(drum)
    if rear:
        cap = lathe('cap', [(0.108, hub_x), (0.1, hub_x + 0.02), (0.09, hub_x + 0.03), (0.075, hub_x + 0.045), (0.072, hub_x + 0.075), (0.06, hub_x + 0.085), (0.0, hub_x + 0.088)], 96, m['hubBlack'])
    elif alu:
        cap = lathe('cap', [(0.108, hub_x), (0.1, hub_x + 0.01), (0.085, hub_x + 0.025), (0.08, hub_x + 0.055), (0.06, hub_x + 0.065), (0.0, hub_x + 0.068)], 96, m['zinc'])
    else:
        cap = lathe('cap', [(0.108, hub_x), (0.098, hub_x + 0.012), (0.088, hub_x + 0.03), (0.082, hub_x + 0.06), (0.07, hub_x + 0.07), (0.0, hub_x + 0.073)], 96, m['zinc'])
    parts.append(cap)
    nx = disc_prof[3][1] + th / 2  # nuts seat on the flat ring at the bolt circle (front face of the disc)
    nuts = ring_copies(nut('nut', m['zinc'], nx, washer=not alu), 10, PCD)
    parts += nuts
    if alu:
        # loose-nut indicators: orange plastic arrows on every nut
        for i in range(10):
            a = 2 * math.pi * i / 10
            u = Vector((0, math.cos(a), math.sin(a)))
            t = Vector((0, -math.sin(a), math.cos(a)))
            parts.append(obox('ind', (nx + 0.012, u.y * (PCD + 0.026), u.z * (PCD + 0.026)), (1, 0, 0), (0, u.y, u.z), (0, t.y, t.z), 0.009, 0.014, 0.006, m['indicator'], bev=0.002))
            parts.append(cyl('indr', (nx + 0.004, u.y * PCD, u.z * PCD), (nx + 0.02, u.y * PCD, u.z * PCD), 0.022, m['indicator'], segs=16))
    hi = parts
    # ---- low-poly: lathe of the visible surfaces, real hand holes, hex nuts
    lo_parts = [lathe('rimLo', rim_prof[6:], 40, face)]
    dlo = lathe('discLo', closed, 40, face)
    outward(dlo)
    if alu:
        cutter = slot_cutters(10, 0.215, 0.0, 0.026, hx - 0.03, hx + 0.03, phase=math.pi / 10, round_holes=True)
    else:
        cutter = slot_cutters(10, 0.214, 0.07, 0.016, hx - 0.03, hx + 0.03, phase=math.pi / 10)
    for o in cutter.data.polygons:
        o.use_smooth = False
    cut(dlo, cutter)
    outward(dlo)
    lo_parts.append(dlo)
    lo_parts.append(lathe('drumLo', [(0.25, hub_x - 0.03), (0.2, hub_x - 0.03), (0.11, hub_x - 0.025)], 24, m['drum']))
    if rear:
        lo_parts.append(lathe('capLo', [(0.108, hub_x), (0.09, hub_x + 0.03), (0.075, hub_x + 0.045), (0.072, hub_x + 0.075), (0.0, hub_x + 0.088)], 24, m['hubBlack']))
    else:
        lo_parts.append(lathe('capLo', [(0.108, hub_x), (0.088, hub_x + 0.03 if not alu else hub_x + 0.025), (0.08, hub_x + 0.058), (0.0, hub_x + 0.072)], 24, m['zinc']))
    lo_parts += ring_copies(cyl('nutLo', (nx, 0, 0), (nx + 0.032, 0, 0), 0.0185, m['zinc'], segs=6, smooth=False, r1=0.012), 10, PCD)
    lo = join(lo_parts, kind)
    return hi, lo


# ------------------------------------------------------------------ seats
def resample(poly, n):
    """n+1 points at uniform arc length along an open polyline [(z, y), ...]."""
    L = [0.0]
    for a, b in zip(poly, poly[1:]):
        L.append(L[-1] + math.hypot(b[0] - a[0], b[1] - a[1]))
    out, k = [], 0
    for i in range(n + 1):
        d = L[-1] * i / n
        while k < len(poly) - 2 and L[k + 1] < d:
            k += 1
        t = (d - L[k]) / ((L[k + 1] - L[k]) or 1)
        t = min(1, max(0, t))
        out.append((poly[k][0] + (poly[k + 1][0] - poly[k][0]) * t, poly[k][1] + (poly[k + 1][1] - poly[k][1]) * t))
    return out


def seat_loft(name, face, rear, W, m, n_face=40, n_rear=24, nx=23, dish=(0.011, 0.013), pan_split=0.47, top=None, corner=0.1):
    """Hard shell lofted across its width. face = sitting surface (z, y) from the pan's front edge to the top
    of the backrest; rear = back/underside from the top back down to under the pan front. Sitting face dished
    (pan and backrest separately), top corners rounded with radius `corner` in the front view."""
    F = resample(face, n_face)
    R = resample(rear, n_rear)
    prof = F + R[1:-1]
    nf = len(F)
    ytop = max(y for _, y in prof)
    # outward normals of the sitting face (z, y)
    nrm = []
    for i in range(nf):
        a, b = F[max(0, i - 1)], F[min(nf - 1, i + 1)]
        tz, ty = b[0] - a[0], b[1] - a[1]
        l = math.hypot(tz, ty) or 1
        nrm.append((-ty / l, tz / l))
    bm = bmesh.new()
    rings = []
    for j in range(nx):
        x = -W / 2 + W * j / (nx - 1)
        u = 2 * x / W
        d = max(0.0, 1 - u * u)
        # rounded top corners: squash the top of the profile at the sides
        ax = abs(x)
        c0 = W / 2 - corner
        drop = 0.0 if ax <= c0 else corner - math.sqrt(max(0.0, corner * corner - (ax - c0) ** 2))
        ring = []
        for i, (z, y) in enumerate(prof):
            if i < nf:
                yy = F[i][1]
                w = math.sin(math.pi * min(1, max(0, (yy - F[0][1]) / max(1e-6, pan_split - F[0][1])))) * dish[0] if yy < pan_split else \
                    math.sin(math.pi * min(1, max(0, (yy - pan_split) / max(1e-6, (ytop - 0.1) - pan_split)))) * dish[1]
                z -= nrm[i][0] * w * d
                y -= nrm[i][1] * w * d
            y0 = ytop - 0.25
            if drop > 0 and y > y0:
                y = y0 + (y - y0) * (ytop - drop - y0) / (ytop - y0)
            ring.append(bm.verts.new(W_(x, y, z)))
        rings.append(ring)
    n = len(prof)
    for j in range(nx - 1):
        for i in range(n):
            a, b = rings[j][i], rings[j][(i + 1) % n]
            c, e = rings[j + 1][(i + 1) % n], rings[j + 1][i]
            bm.faces.new((a, b, c, e))
    bm.faces.new(rings[0][::-1])
    bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    me.materials.append(m)
    return o


W_ = lambda x, y, z: W(x, y, z)


def stadium_prism(name, x0, x1, yb, yt, ytc, z0, z1, r, m=None, n=24):
    """Through-slot cutter along z: flat bottom yb, top yt at the ends rising to ytc at the centre, end radius r."""
    pts = []
    for k in range(n + 1):  # bottom edge, left to right, with rounded ends
        pts.append((x0 + r + (x1 - x0 - 2 * r) * k / n, yb))
    for k in range(1, 8):  # right end
        a = -math.pi / 2 + math.pi * k / 8
        pts.append((x1 - r + r * math.cos(a), (yb + yt) / 2 + (yt - yb) / 2 * math.sin(a)))
    for k in range(n + 1):  # arched top, right to left
        x = x1 - r - (x1 - x0 - 2 * r) * k / n
        u = 2 * (x - (x0 + x1) / 2) / (x1 - x0 - 2 * r)
        pts.append((x, yt + (ytc - yt) * (1 - u * u)))
    for k in range(1, 8):
        a = math.pi / 2 + math.pi * k / 8
        pts.append((x0 + r + r * math.cos(a), (yb + yt) / 2 + (yt - yb) / 2 * math.sin(a)))
    verts = [(x, y, z0) for x, y in pts] + [(x, y, z1) for x, y in pts]
    N = len(pts)
    faces = [list(range(N))[::-1], list(range(N, 2 * N))] + [(i, (i + 1) % N, N + (i + 1) % N, N + i) for i in range(N)]
    o = from_pydata(name, verts, faces, m)
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(o.data)
    bm.free()
    return o


def rrect_prism(name, cx, cy, w, h, r, z0, z1, m=None, n=6):
    """Rounded rectangle (front view) extruded along z."""
    pts = []
    for (qx, qy, a0) in ((cx + w / 2 - r, cy + h / 2 - r, 0), (cx - w / 2 + r, cy + h / 2 - r, 90), (cx - w / 2 + r, cy - h / 2 + r, 180), (cx + w / 2 - r, cy - h / 2 + r, 270)):
        for k in range(n + 1):
            a = math.radians(a0 + 90 * k / n)
            pts.append((qx + r * math.cos(a), qy + r * math.sin(a)))
    verts = [(x, y, z0) for x, y in pts] + [(x, y, z1) for x, y in pts]
    N = len(pts)
    faces = [list(range(N))[::-1], list(range(N, 2 * N))] + [(i, (i + 1) % N, N + (i + 1) % N, N + i) for i in range(N)]
    o = from_pydata(name, verts, faces, m)
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(o.data)
    bm.free()
    return o


def bevel_mod(o, w, segs=3, angle=30):
    md = o.modifiers.new('bev', 'BEVEL')
    md.width = w
    md.segments = segs
    md.limit_method = 'ANGLE'
    md.angle_limit = math.radians(angle)
    return apply_mods(o)


def paint_faces(o, test, m):
    """Assigns material m to the faces whose centre (three.js frame) passes test(x, y, z)."""
    if m.name not in [s.name for s in o.data.materials if s]:
        o.data.materials.append(m)
    idx = [s.name if s else None for s in o.data.materials].index(m.name)
    for p in o.data.polygons:
        c = p.center
        if test(c.x, c.z, -c.y):
            p.material_index = idx


def decimate_copy(o, ratio, name):
    c = o.copy()
    c.data = o.data.copy()
    c.name = name
    bpy.context.scene.collection.objects.link(c)
    md = c.modifiers.new('dec', 'DECIMATE')
    md.ratio = ratio
    md.use_collapse_triangulate = True
    apply_mods(c)
    return c


# MAN: one-piece light-grey shell, charcoal cap with a through grab slot (interior_spec.md section 1)
MAN_FACE = [(-0.226, 0.43), (-0.222, 0.458), (-0.12, 0.452), (-0.02, 0.44), (0.1, 0.428), (0.18, 0.436), (0.215, 0.5), (0.238, 0.62), (0.258, 0.8), (0.285, 0.99), (0.302, 1.07), (0.318, 1.088)]
MAN_REAR = [(0.318, 1.088), (0.338, 1.084), (0.345, 1.06), (0.34, 0.95), (0.305, 0.7), (0.25, 0.47), (0.205, 0.405), (0.205, 0.386), (-0.2, 0.386), (-0.225, 0.405), (-0.226, 0.43)]


def seat_hard(m, kind):
    """kind: 'man', 'procity', 'yutong' - one-piece shells with a grab slot through the top of the backrest."""
    if kind == 'man':
        shell, top = m['seatGrey'], None
        face, rear, W, corner = MAN_FACE, MAN_REAR, 0.44, 0.11
        slot = (-0.135, 0.135, 1.008, 1.056, 1.066)
    elif kind == 'procity':
        shell, top = m['seatProcity'], None
        face = [(-0.228, 0.425), (-0.222, 0.455), (-0.1, 0.448), (0.05, 0.436), (0.16, 0.44), (0.2, 0.5), (0.225, 0.64), (0.245, 0.82), (0.27, 0.98), (0.288, 1.05), (0.305, 1.07)]
        rear = [(0.305, 1.07), (0.33, 1.066), (0.338, 1.04), (0.33, 0.93), (0.295, 0.7), (0.245, 0.48), (0.2, 0.405), (0.2, 0.388), (-0.2, 0.388), (-0.226, 0.405), (-0.228, 0.425)]
        W, corner = 0.43, 0.13
        slot = (-0.12, 0.12, 0.965, 1.012, 1.02)
    else:
        shell, top = m['seatLight'], None
        face = [(-0.23, 0.425), (-0.224, 0.456), (-0.1, 0.45), (0.05, 0.438), (0.165, 0.442), (0.205, 0.5), (0.228, 0.64), (0.248, 0.82), (0.272, 0.99), (0.29, 1.055), (0.306, 1.075)]
        rear = [(0.306, 1.075), (0.33, 1.07), (0.338, 1.045), (0.332, 0.94), (0.298, 0.7), (0.248, 0.48), (0.202, 0.405), (0.202, 0.388), (-0.2, 0.388), (-0.227, 0.405), (-0.23, 0.425)]
        W, corner = 0.44, 0.12
        slot = (-0.125, 0.125, 0.975, 1.02, 1.03)
    o = seat_loft('seatHi', face, rear, W, shell, corner=corner)
    x0, x1, yb, yt, ytc = slot
    sl = stadium_prism('slot', x0, x1, yb, yt, ytc, 0.1, 0.5, 0.024)
    md = o.modifiers.new('b', 'BOOLEAN')
    md.operation = 'DIFFERENCE'
    md.object = sl
    md.solver = 'EXACT'
    apply_mods(o)
    bpy.data.objects.remove(sl)
    if kind == 'man':
        # recess panel on the back of the backrest (0.30 x 0.30, R 0.06, 2 mm deep)
        rp = rrect_prism('rp', 0.0, 0.72, 0.3, 0.3, 0.06, 0.31, 0.5)
        rp.data.transform(Matrix.Translation((0, 0, 0)))
        # follow the rake of the back face: shear the cutter so its front plane lies 2 mm inside the back
        for v in rp.data.vertices:
            y = v.co.z
            zf = 0.305 + (0.34 - 0.305) * (y - 0.7) / 0.25 - 0.002
            if -v.co.y < 0.4:
                v.co.y = -zf
        md = o.modifiers.new('b', 'BOOLEAN')
        md.operation = 'DIFFERENCE'
        md.object = rp
        md.solver = 'EXACT'
        apply_mods(o)
        bpy.data.objects.remove(rp)
    o = bevel_mod(o, 0.0045, 3, 35)
    if kind == 'man':
        paint_faces(o, lambda x, y, z: abs(x) < 0.148 and 0.568 < y < 0.872 and z > 0.31, m['seatPanel'])
    parts = [o]
    hi = join(parts, 'seatHi')
    lo = decimate_copy(hi, 0.12 if kind == 'man' else 0.1, 'seat_' + kind)
    return [hi], lo


def seat_conecto(m):
    """Mercedes O 345 G: light-grey shell with a blue-grey patterned moquette back pad, a blue cushion and a
    charcoal tubular grab handle across the top of the backrest (ref04, ref05)."""
    face = [(-0.228, 0.42), (-0.222, 0.45), (-0.1, 0.443), (0.05, 0.432), (0.16, 0.436), (0.2, 0.5), (0.222, 0.64), (0.242, 0.82), (0.265, 0.98), (0.282, 1.04), (0.298, 1.058)]
    rear = [(0.298, 1.058), (0.322, 1.054), (0.33, 1.03), (0.322, 0.93), (0.29, 0.7), (0.24, 0.48), (0.198, 0.4), (0.198, 0.382), (-0.2, 0.382), (-0.226, 0.4), (-0.228, 0.42)]
    W = 0.43
    o = seat_loft('seatHi', face, rear, W, m['seatGreyC'], corner=0.12, dish=(0.008, 0.01))
    o = bevel_mod(o, 0.0045, 3, 35)
    # moquette back pad following the backrest (lofted thin plate over the sitting face between y 0.55 and 0.99)
    pad_pts = [p for p in resample(face, 60) if 0.53 <= p[1] <= 0.99]
    bm = bmesh.new()
    nxp = 13
    rows = []
    for j in range(nxp):
        x = -0.165 + 0.33 * j / (nxp - 1)
        ring = []
        for (z, y) in pad_pts:
            ring.append(bm.verts.new(W_(x, y, z - 0.004)))
        rows.append(ring)
    for j in range(nxp - 1):
        for i in range(len(pad_pts) - 1):
            bm.faces.new((rows[j][i], rows[j + 1][i], rows[j + 1][i + 1], rows[j][i + 1]))
    me = bpy.data.meshes.new('pad')
    bm.to_mesh(me)
    bm.free()
    pad = bpy.data.objects.new('pad', me)
    bpy.context.scene.collection.objects.link(pad)
    me.materials.append(m['moquette'])
    sol = pad.modifiers.new('s', 'SOLIDIFY')
    sol.thickness = 0.014
    sol.offset = 1
    apply_mods(pad)
    pad = bevel_mod(pad, 0.005, 3, 40)
    for p in pad.data.polygons:
        p.use_smooth = True
    # cushion on the pan
    cu = box('cush', -0.18, 0.18, 0.43, 0.462, -0.205, 0.17, m['cushion'], bev=0.012, segs=3)
    for p in cu.data.polygons:
        p.use_smooth = True
    # grab handle: tube on two short posts over the top of the backrest
    hd = tube('handle', [(-0.17, 1.03, 0.31), (-0.165, 1.075, 0.31), (-0.1, 1.09, 0.31), (0.1, 1.09, 0.31), (0.165, 1.075, 0.31), (0.17, 1.03, 0.31)], 0.0125, m['handleDark'], segs=12, res=6)
    hi = join([o, pad, cu, hd], 'seatHi')
    lo = decimate_copy(hi, 0.1, 'seat_conecto')
    return [hi], lo


# ------------------------------------------------------------------ hand strap, validator, mirror head
def closed_sweep(name, ctrl, r, m, n=48, ring=10, scale_n=1.0):
    """Tube swept round a closed Catmull-Rom curve through ctrl points (piece frame, curve in the x-y plane);
    scale_n stretches the section along z (front to back)."""
    N = len(ctrl)
    P = [Vector(c) for c in ctrl]
    pts = []
    for i in range(n):
        t = i / n * N
        k = int(t)
        f = t - k
        p0, p1, p2, p3 = P[(k - 1) % N], P[k % N], P[(k + 1) % N], P[(k + 2) % N]
        pts.append(0.5 * ((2 * p1) + (-p0 + p2) * f + (2 * p0 - 5 * p1 + 4 * p2 - p3) * f * f + (-p0 + 3 * p1 - 3 * p2 + p3) * f * f * f))
    bm = bmesh.new()
    rings = []
    for i in range(n):
        tg = (pts[(i + 1) % n] - pts[i - 1]).normalized()
        nz = Vector((0, 0, 1))
        nx = tg.cross(nz).normalized()
        rg = []
        for j in range(ring):
            a = 2 * math.pi * j / ring
            q = pts[i] + nx * (r * math.cos(a)) + nz * (r * scale_n * math.sin(a))
            rg.append(bm.verts.new(W(q.x, q.y, q.z)))
        rings.append(rg)
    for i in range(n):
        A, B = rings[i], rings[(i + 1) % n]
        for j in range(ring):
            bm.faces.new((A[j], A[(j + 1) % ring], B[(j + 1) % ring], B[j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for p_ in me.polygons:
        p_.use_smooth = True
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    me.materials.append(m)
    return o


def strap(m):
    """Hand strap on a longitudinal rail (rail axis along z through the origin, D 0.032): split collar, a
    doubled webbing strap and a rounded-triangle grip in the x-y plane (seen square-on along the aisle).
    Baked light grey; the game tints it per bus (MAN grey, Procity black)."""
    pl, wb = m['strapPlastic'], m['webbing']
    parts = []
    # collar round the rail with a tab below
    col = lathe('col', [(0.0175, -0.016), (0.021, -0.016), (0.022, -0.012), (0.022, 0.012), (0.021, 0.016), (0.0175, 0.016)], 32, pl)
    col.data.transform(Matrix.Rotation(math.radians(90), 4, 'Z'))  # lathe axis x -> z (Blender)... see below
    parts.append(col)
    parts.append(box('tab', -0.012, 0.012, -0.045, -0.018, -0.006, 0.006, pl, bev=0.003))
    # strap: two layers of webbing 0.025 wide down to the grip
    parts.append(box('web', -0.0125, 0.0125, -0.215, -0.04, -0.0035, 0.0035, wb, bev=0.0012))
    parts.append(box('stitch', -0.0115, 0.0115, -0.07, -0.05, -0.0042, 0.0042, wb, bev=0.001))
    # grip: smooth rounded triangle through six points (apex where the strap enters, flat-ish bottom bar)
    loop = [(0.0, -0.209, 0.0), (0.033, -0.247, 0.0), (0.058, -0.297, 0.0), (0.03, -0.318, 0.0), (-0.03, -0.318, 0.0), (-0.058, -0.297, 0.0), (-0.033, -0.247, 0.0)]
    grip = closed_sweep('grip', loop, 0.0095, pl, scale_n=1.3)
    parts.append(grip)
    # strap loop through the apex
    parts.append(torus('wl', (0, -0.212, 0), (0, 0, 1), 0.012, 0.003, wb, segs=16, rsegs=6))
    hi = parts
    lo_parts = []
    for o in parts:
        c = o.copy()
        c.data = o.data.copy()
        bpy.context.scene.collection.objects.link(c)
        lo_parts.append(c)
    lo = join(lo_parts, 'strap')
    md = lo.modifiers.new('dec', 'DECIMATE')
    md.ratio = 0.35
    apply_mods(lo)
    return hi, lo


def validator(m):
    """Sofia's ticket validator (2023 contactless type, ref04 / ref09): slim blue-framed column with a black
    glass front, colour screen at the top and the card target below, clamped to a stanchion. Origin on the
    stanchion axis; the device stands on the -z side of the pole, front facing -z."""
    blue, glass = m['valBlue'], m['valGlass']
    parts = []
    zb = -0.045  # back face of the body
    body = box('vb', -0.068, 0.068, -0.18, 0.18, zb - 0.085, zb, blue, bev=0.012, segs=3)
    parts.append(body)
    # recessed glass front
    front = box('vg', -0.056, 0.056, -0.168, 0.168, zb - 0.0905, zb - 0.083, glass, bev=0.004, segs=2)
    parts.append(front)
    # screen and card target printed under the glass
    parts.append(box('scr', -0.045, 0.045, 0.035, 0.145, zb - 0.0912, zb - 0.0905, m['valScreen']))
    t = text_mesh('vt', 'СОФИЯ', 0.012, m['valText'], depth=0.0004)
    t.data.transform(Matrix.Rotation(math.radians(180), 4, 'Z') @ Matrix.Rotation(math.radians(90), 4, 'X'))
    t.data.transform(Matrix.Translation(W(0, 0.115, zb - 0.0915)))
    parts.append(t)
    t2 = text_mesh('vt2', 'Валидирай', 0.009, m['valText'], depth=0.0004)
    t2.data.transform(Matrix.Rotation(math.radians(180), 4, 'Z') @ Matrix.Rotation(math.radians(90), 4, 'X'))
    t2.data.transform(Matrix.Translation(W(0, 0.075, zb - 0.0915)))
    parts.append(t2)
    # contactless mark: three arcs
    for k, r_ in enumerate((0.012, 0.02, 0.028)):
        a = torus('arc', (0.0, -0.075, zb - 0.0912), (0, 0, 1), r_, 0.0016, m['valText'], segs=24, rsegs=4)
        parts.append(a)
    parts.append(box('led', -0.03, 0.03, -0.155, -0.15, zb - 0.0915, zb - 0.0905, m['valLed']))
    # pole clamps
    for y in (-0.12, 0.12):
        parts.append(lathe('clamp', [(0.0175, -0.018), (0.024, -0.018), (0.024, 0.018), (0.0175, 0.018)], 24, m['strapPlastic']))
        c = parts[-1]
        c.data.transform(Matrix.Rotation(math.radians(90), 4, 'Y'))  # axis x -> Blender z (three y)
        c.data.transform(Matrix.Translation(W(0, y, 0)))
        parts.append(box('arm', -0.012, 0.012, y - 0.015, y + 0.015, zb, -0.02, m['strapPlastic'], bev=0.004))
    hi = parts
    lo_parts = [box('vbL', -0.068, 0.068, -0.18, 0.18, zb - 0.0905, zb, blue, bev=0.006, segs=1)]
    for y in (-0.12, 0.12):
        c = lathe('clampL', [(0.024, -0.018), (0.024, 0.018)], 12, m['strapPlastic'])
        c.data.transform(Matrix.Rotation(math.radians(90), 4, 'Y'))
        c.data.transform(Matrix.Translation(W(0, y, 0)))
        lo_parts.append(c)
        lo_parts.append(box('armL', -0.012, 0.012, y - 0.015, y + 0.015, zb, -0.02, m['strapPlastic']))
    lo = join(lo_parts, 'validator')
    return hi, lo


# ------------------------------------------------------------------ mirrors (bus frame: origin on the ground under
# the centre of the front face, so the game places them at (0, 0, frontZ) without rotation)
def catmull(P, n):
    """n+1 points along an open Catmull-Rom spline through P (Vectors)."""
    out = []
    N = len(P)
    for i in range(n + 1):
        t = i / n * (N - 1)
        k = min(int(t), N - 2)
        f = t - k
        p0, p1, p2, p3 = P[max(0, k - 1)], P[k], P[k + 1], P[min(N - 1, k + 2)]
        out.append(0.5 * ((2 * p1) + (-p0 + p2) * f + (2 * p0 - 5 * p1 + 4 * p2 - p3) * f * f + (-p0 + 3 * p1 - 3 * p2 + p3) * f * f * f))
    return out


def sweep_var(name, ctrl, radii, m, n=40, ring=16, up=(0, 1, 0), caps=True):
    """Tube along a Catmull-Rom spline through ctrl (piece frame) with an elliptical section whose half axes
    radii(t) = (a, b) vary along it (a across, b along the frame normal derived from `up`)."""
    P = catmull([Vector(c) for c in ctrl], n)
    upv = Vector(up)
    bm = bmesh.new()
    rings = []
    for i, p in enumerate(P):
        tg = (P[min(i + 1, n)] - P[max(i - 1, 0)]).normalized()
        side = tg.cross(upv)
        if side.length < 1e-4:
            side = tg.cross(Vector((1, 0, 0)))
        side.normalize()
        nrm = side.cross(tg).normalized()
        a, b = radii(i / n)
        rg = []
        for j in range(ring):
            ang = 2 * math.pi * j / ring
            q = p + side * (a * math.cos(ang)) + nrm * (b * math.sin(ang))
            rg.append(bm.verts.new(W(q.x, q.y, q.z)))
        rings.append(rg)
    for i in range(n):
        A, B = rings[i], rings[i + 1]
        for j in range(ring):
            bm.faces.new((A[j], A[(j + 1) % ring], B[(j + 1) % ring], B[j]))
    if caps:
        bm.faces.new(rings[0][::-1])
        bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for p_ in me.polygons:
        p_.use_smooth = True
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    me.materials.append(m)
    return o


def shell_head(name, w, h, d, m, ex=0.42, ey=0.6, n=40):
    """Rounded mirror housing: superellipsoid w x h x d (piece frame axes), centred on the origin."""
    bm = bmesh.new()
    rows = []
    for i in range(n // 2 + 1):
        phi = -math.pi / 2 + math.pi * i / (n // 2)
        row = []
        for j in range(n):
            th = 2 * math.pi * j / n
            cp, sp_ = math.cos(phi), math.sin(phi)
            ct, st = math.cos(th), math.sin(th)
            sgn = lambda v: (v > 0) - (v < 0)
            x = w / 2 * sgn(cp) * abs(cp) ** ey * sgn(ct) * abs(ct) ** ex
            z = d / 2 * sgn(cp) * abs(cp) ** ey * sgn(st) * abs(st) ** ex
            y = h / 2 * sgn(sp_) * abs(sp_) ** ey
            row.append(bm.verts.new(W(x, y, z)))
        rows.append(row)
    for i in range(len(rows) - 1):
        for j in range(n):
            try:
                bm.faces.new((rows[i][j], rows[i][(j + 1) % n], rows[i + 1][(j + 1) % n], rows[i + 1][j]))
            except ValueError:
                pass
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for p_ in me.polygons:
        p_.use_smooth = True
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    me.materials.append(m)
    return o


def place(o, rot_y=0.0, rot_z=0.0, rot_x=0.0, at=(0, 0, 0)):
    """Rotates a piece-frame object (three.js axes: y up, z back) and moves it to `at`."""
    # three.js axes in Blender: x -> X, y -> Z, z -> -Y
    R = Matrix.Rotation(rot_y, 4, 'Z') @ Matrix.Rotation(-rot_z, 4, 'Y') @ Matrix.Rotation(rot_x, 4, 'X')
    o.data.transform(R)
    o.data.transform(Matrix.Translation(W(*at)))
    return o


def mirror_glass(name, w, h, cz, m, r=0.02):
    """Mirror glass: thin rounded plate (front face towards +z) centred at (0, cz) of the head frame."""
    g = rrect_prism(name, 0.0, cz, w, h, r, -0.003, 0.003, m, n=5)
    return g


def head_with_glass(m, w, h, d, glasses, name='head'):
    """Housing with the mirror glasses set into its back face (+z, towards the bus side / driver)."""
    sh = shell_head(name, w, h, d, m['mirrorBody'])
    parts = [sh]
    for (gw, gh, gy) in glasses:
        # recess the glass: cut a shallow pocket, then the glass plate in it
        cutter = rrect_prism('pk', 0.0, gy, gw + 0.012, gh + 0.012, 0.024, d / 2 - 0.012, d / 2 + 0.1)
        md = sh.modifiers.new('b', 'BOOLEAN')
        md.operation = 'DIFFERENCE'
        md.object = cutter
        md.solver = 'EXACT'
        apply_mods(sh)
        bpy.data.objects.remove(cutter)
        gl = rrect_prism('gl', 0.0, gy, gw, gh, 0.02, d / 2 - 0.012, d / 2 - 0.006, m['mirrorGlass'])
        parts.append(gl)
    return parts


def mirrors_man(m):
    """MAN Lion's City: ram's horn on the right (door side) - a thick arm from the header corner sweeping out
    and forwards, then down into a tall head; compact two-part box on the left A-pillar (exterior_spec 3.10)."""
    blk = m['mirrorBody']
    parts = []
    # right: arm from the root boss on the header corner (frame: z = 0 at the front face)
    arm = [(1.15, 2.6, 0.36), (1.28, 2.645, 0.24), (1.44, 2.64, 0.04), (1.58, 2.58, -0.17), (1.66, 2.47, -0.33), (1.67, 2.36, -0.43)]
    parts.append(sweep_var('armR', arm, lambda t: (0.05 + 0.065 * t ** 2.0, 0.044 + 0.05 * t ** 2.0), blk, n=48, ring=18, up=(0, 1, 0)))
    parts.append(shell_head('rootR', 0.13, 0.11, 0.16, blk))
    place(parts[-1], at=(1.18, 2.6, 0.34))
    head = head_with_glass(m, 0.24, 0.58, 0.14, [(0.2, 0.29, 0.1), (0.18, 0.15, -0.15)], 'headR')
    for o in head:
        place(o, rot_y=-0.12, rot_z=-0.08, at=(1.645, 2.11, -0.44))
    parts += head
    # left: two stacked rounded boxes on a bracket bolted to the A-pillar corner
    for (cy, hh, ww) in ((2.25, 0.42, 0.25), (1.91, 0.26, 0.23)):
        hd = head_with_glass(m, ww, hh, 0.14, [(ww - 0.05, hh - 0.06, 0.0)], 'headL')
        for o in hd:
            place(o, rot_y=0.12, at=(-1.34, cy, 0.1))
        parts += hd
    br = box('brL', -1.32, -1.2, 1.9, 2.36, 0.22, 0.34, blk, bev=0.02, segs=2)
    parts.append(br)
    hi = parts
    lo = join([dup(o) for o in parts], 'mirrorsMan')
    md = lo.modifiers.new('dec', 'DECIMATE')
    md.ratio = 0.3
    apply_mods(lo)
    return hi, lo


def dup(o):
    c = o.copy()
    c.data = o.data.copy()
    bpy.context.scene.collection.objects.link(c)
    return c


# ------------------------------------------------------------------ table
def P_tyre(m):
    return tyre(m)


def P_wheel(kind):
    return lambda m: wheel_disc(m, kind)


# name: (builder, cell (x, y, w, h) in the 2048 atlas, smoothing angle, custom_uv, ray)
PIECES = {
    'tyre': (P_tyre, (0, 0, 2048, 256), 60, True, 0.03),
    'wheelSteel': (P_wheel('steel'), (0, 256, 512, 512), 40, False, 0.04),
    'wheelSteelRear': (P_wheel('steelRear'), (512, 256, 512, 512), 40, False, 0.05),
    'wheelAlu': (P_wheel('alu'), (1024, 256, 512, 512), 40, False, 0.04),
    'wheelAluRear': (P_wheel('aluRear'), (1536, 256, 512, 512), 40, False, 0.05),
    'seat_man': (lambda m: seat_hard(m, 'man'), (0, 768, 512, 512), 40, False, 0.02),
    'seat_conecto': (seat_conecto, (512, 768, 512, 512), 40, False, 0.02),
    'seat_procity': (lambda m: seat_hard(m, 'procity'), (1024, 768, 512, 512), 40, False, 0.02),
    'seat_yutong': (lambda m: seat_hard(m, 'yutong'), (1536, 768, 512, 512), 40, False, 0.02),
    'strap': (strap, (0, 1280, 256, 256), 50, False, 0.01),
    'validator': (validator, (256, 1280, 256, 512), 40, False, 0.015),
    'mirrorsMan': (mirrors_man, (512, 1280, 512, 512), 40, False, 0.02),
}


AO_DIST = {'wheelSteel': 0.05, 'wheelSteelRear': 0.06, 'wheelAlu': 0.05, 'wheelAluRear': 0.06, 'tyre': 0.08}

# preview directions (Blender axes: -y is three.js +z, i.e. behind a seat)
VIEWS = {'mirrorsMan': ((0.4, 1.0, 0.25), (0.6, -1.0, 0.3)), 'seat': ((0.8, 1.0, 0.5), (0.5, -1.0, 0.25)), 'strap': ((0.2, 1.0, 0.1), (1.0, 0.3, 0.1)), 'validator': ((0.5, 1.0, 0.2), (1.0, -0.4, 0.2))}


def main():
    preview = sys.argv[sys.argv.index('--preview') + 1] if '--preview' in sys.argv else None
    render = sys.argv[sys.argv.index('--render') + 1] if '--render' in sys.argv else None
    only = sys.argv[sys.argv.index('--only') + 1].split(',') if '--only' in sys.argv else None
    reset()
    bpy.context.scene.world.light_settings.distance = 0.12
    mats = M()
    atlas = Atlas(2048, 'bus')
    los = []
    for name, (fn, cell, ang, custom_uv, ray) in PIECES.items():
        if only and name not in only:
            continue
        hi, lo = fn(mats)
        if render:
            os.makedirs(render, exist_ok=True)
            for o in los:
                o.hide_render = True
            views = VIEWS.get(name.split('_')[0], ((1.0, -0.45, 0.3), (0.25, -1.0, 0.1)))
            if name.startswith('mirrors'):
                # one close view per side (three.js frame targets)
                for k, (tx, d) in enumerate(((1.45, (0.5, 1.0, 0.2)), (1.45, (0.2, -1.0, 0.25)), (-1.3, (-0.6, 1.0, 0.2)))):
                    render_preview(hi, os.path.join(render, f'{name}_{k}.jpg'), d=d, zoom=0.32, target=W(tx, 2.25, -0.1))
            else:
                render_preview(hi, os.path.join(render, f'{name}.jpg'), d=views[0])
                render_preview(hi, os.path.join(render, f'{name}_b.jpg'), d=views[1], zoom=0.9)
            if not preview:
                for o in hi + [lo]:
                    bpy.data.objects.remove(o)
                continue
        sharpen(lo, ang)
        triangulate(lo)
        if not custom_uv:
            atlas.unwrap(lo, cell)
        for o in hi:
            o.hide_render = False
        # wheels sit deep in the tyre: a short AO reach keeps the discs silver as in the photos
        bpy.context.scene.world.light_settings.distance = AO_DIST.get(name, 0.12)
        atlas.bake(lo, hi, cell, extrusion=0.012, ray=ray)
        if name == 'tyre':
            lo = finish_tyre(lo)
        lo.name = lo.data.name = name  # the game looks pieces up by node name
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
    km = atlas.export_material('buskit')
    for lo in los:
        lo.hide_render = False
        lo.data.materials.clear()
        lo.data.materials.append(km)
        lo.location = (0, 0, 0)
    export_glb(los, OUT if not preview else os.path.join(preview, 'kit_bus.glb'))
    print('wrote', OUT if not preview else preview)


if __name__ == '__main__':
    main()
