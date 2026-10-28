# Shared helpers for the Blender asset scripts (run with Blender's Python, e.g. the `bpy` module from PyPI):
# modelling in a wall frame, procedural materials, high-to-low baking into a shared atlas, glTF export.
#
# Wall frame: t = along the wall (right), u = up, n = out of the wall. Blender is Z-up, glTF Y-up, so a
# wall-frame point (t, u, n) is Blender (t, -n, u) and arrives in three.js as (t, u, n).
import math
import time
import numpy as np
import bpy
import bmesh
from mathutils import Vector, Matrix


def W(t, u, n):
    return Vector((t, -n, u))


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = 48
    sc.cycles.use_denoising = False
    w = bpy.data.worlds.new('World')
    sc.world = w
    w.light_settings.distance = 0.35  # ambient-occlusion reach for the AO bakes
    return sc


# ------------------------------------------------------------------ materials
def _bsdf(m):
    nt = m.node_tree
    return nt.nodes['Principled BSDF']


def mat(name, col, rough=0.5, metal=0.0, noise=0.0, nscale=40.0, bump=0.0, bscale=None, grime=0.0):
    """Principled material; noise tints the colour (weathering), bump adds fine relief, grime darkens
    downwards-facing and lower areas (streaks under ledges)."""
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = _bsdf(m)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    m['rough'], m['metal'] = rough, metal
    base = nt.nodes.new('ShaderNodeRGB')
    base.outputs[0].default_value = (*col, 1)
    out = base.outputs[0]
    if noise > 0 or grime > 0:
        tc = nt.nodes.new('ShaderNodeTexCoord')
        nz = nt.nodes.new('ShaderNodeTexNoise')
        nz.inputs['Scale'].default_value = nscale
        nz.inputs['Detail'].default_value = 6
        nt.links.new(tc.outputs['Object'], nz.inputs['Vector'])
        mr = nt.nodes.new('ShaderNodeMapRange')
        mr.inputs['From Min'].default_value = 0.3
        mr.inputs['From Max'].default_value = 0.7
        mr.inputs['To Min'].default_value = 1 - noise
        mr.inputs['To Max'].default_value = 1 + noise * 0.5
        nt.links.new(nz.outputs['Fac'], mr.inputs['Value'])
        mul = nt.nodes.new('ShaderNodeMix')
        mul.data_type = 'RGBA'
        mul.blend_type = 'MULTIPLY'
        mul.inputs['Factor'].default_value = 1.0
        nt.links.new(out, mul.inputs['A'])
        cm = nt.nodes.new('ShaderNodeCombineColor')
        for k in ('Red', 'Green', 'Blue'):
            nt.links.new(mr.outputs['Result'], cm.inputs[k])
        nt.links.new(cm.outputs[0], mul.inputs['B'])
        out = mul.outputs['Result']
        if grime > 0:
            # vertical streaks: stretched noise, stronger near the bottom of the object
            nz2 = nt.nodes.new('ShaderNodeTexNoise')
            nz2.inputs['Scale'].default_value = 6
            mp = nt.nodes.new('ShaderNodeMapping')
            mp.inputs['Scale'].default_value = (14, 14, 0.8)
            nt.links.new(tc.outputs['Object'], mp.inputs['Vector'])
            nt.links.new(mp.outputs[0], nz2.inputs['Vector'])
            mr2 = nt.nodes.new('ShaderNodeMapRange')
            mr2.inputs['From Min'].default_value = 0.45
            mr2.inputs['From Max'].default_value = 0.75
            mr2.inputs['To Min'].default_value = 1.0
            mr2.inputs['To Max'].default_value = 1 - grime
            nt.links.new(nz2.outputs['Fac'], mr2.inputs['Value'])
            mul2 = nt.nodes.new('ShaderNodeMix')
            mul2.data_type = 'RGBA'
            mul2.blend_type = 'MULTIPLY'
            mul2.inputs['Factor'].default_value = 1.0
            cm2 = nt.nodes.new('ShaderNodeCombineColor')
            for k in ('Red', 'Green', 'Blue'):
                nt.links.new(mr2.outputs['Result'], cm2.inputs[k])
            nt.links.new(out, mul2.inputs['A'])
            nt.links.new(cm2.outputs[0], mul2.inputs['B'])
            out = mul2.outputs['Result']
    nt.links.new(out, b.inputs['Base Color'])
    if bump > 0:
        tc = nt.nodes.new('ShaderNodeTexCoord')
        nz = nt.nodes.new('ShaderNodeTexNoise')
        nz.inputs['Scale'].default_value = bscale or nscale * 4
        nz.inputs['Detail'].default_value = 4
        nt.links.new(tc.outputs['Object'], nz.inputs['Vector'])
        bp = nt.nodes.new('ShaderNodeBump')
        bp.inputs['Strength'].default_value = bump
        bp.inputs['Distance'].default_value = 0.002
        nt.links.new(nz.outputs['Fac'], bp.inputs['Height'])
        nt.links.new(bp.outputs['Normal'], b.inputs['Normal'])
    return m


def mat_brick(name, col1, col2, mortar, scale=1.0):
    """Brick courses (Brick Texture node: 0.25 x 0.065 m bricks, 1 cm joints) with recessed joints."""
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = _bsdf(m)
    b.inputs['Roughness'].default_value = 0.9
    m['rough'], m['metal'] = 0.9, 0.0
    tc = nt.nodes.new('ShaderNodeTexCoord')
    bt = nt.nodes.new('ShaderNodeTexBrick')
    bt.inputs['Color1'].default_value = (*col1, 1)
    bt.inputs['Color2'].default_value = (*col2, 1)
    bt.inputs['Mortar'].default_value = (*mortar, 1)
    bt.inputs['Scale'].default_value = 1.0 / 0.25 * scale
    bt.inputs['Mortar Size'].default_value = 0.012
    bt.inputs['Brick Width'].default_value = 1.0
    bt.inputs['Row Height'].default_value = 0.3
    bt.offset = 0.5
    # project on the two side axes so every face gets courses
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(tc.outputs['Object'], sep.inputs[0])
    add = nt.nodes.new('ShaderNodeMath')
    add.operation = 'ADD'
    nt.links.new(sep.outputs['X'], add.inputs[0])
    nt.links.new(sep.outputs['Y'], add.inputs[1])
    cmb = nt.nodes.new('ShaderNodeCombineXYZ')
    nt.links.new(add.outputs[0], cmb.inputs['X'])
    nt.links.new(sep.outputs['Z'], cmb.inputs['Y'])
    nt.links.new(cmb.outputs[0], bt.inputs['Vector'])
    nt.links.new(bt.outputs['Color'], b.inputs['Base Color'])
    bp = nt.nodes.new('ShaderNodeBump')
    bp.inputs['Strength'].default_value = 0.6
    bp.inputs['Distance'].default_value = 0.006
    inv = nt.nodes.new('ShaderNodeMath')
    inv.operation = 'SUBTRACT'
    inv.inputs[0].default_value = 1.0
    nt.links.new(bt.outputs['Fac'], inv.inputs[1])
    nt.links.new(inv.outputs[0], bp.inputs['Height'])
    nt.links.new(bp.outputs['Normal'], b.inputs['Normal'])
    return m


# ------------------------------------------------------------------ geometry
def _obj(name, me, m=None):
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    if m is not None:
        me.materials.append(m)
    return o


def apply_mods(o):
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(o.evaluated_get(dg))
    o.modifiers.clear()
    old = o.data
    o.data = me
    bpy.data.meshes.remove(old)
    return o


def bevel(o, w, segs=2, angle=40):
    md = o.modifiers.new('bev', 'BEVEL')
    md.width = w
    md.segments = segs
    md.limit_method = 'ANGLE'
    md.angle_limit = math.radians(angle)
    md.harden_normals = False
    return apply_mods(o)


def box(name, t0, t1, u0, u1, n0, n1, m=None, bev=0.0, segs=2):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = _obj(name, me, m)
    a, b = W(t0, u0, n0), W(t1, u1, n1)
    lo = Vector((min(a.x, b.x), min(a.y, b.y), min(a.z, b.z)))
    hi = Vector((max(a.x, b.x), max(a.y, b.y), max(a.z, b.z)))
    me.transform(Matrix.Diagonal((*(hi - lo), 1.0)))
    me.transform(Matrix.Translation((lo + hi) / 2))
    if bev > 0:
        bevel(o, bev, segs)
    return o


def obox(name, c, x, y, z, hx, hy, hz, m=None, bev=0.0, segs=2):
    """Oriented box: centre c (wall frame), axes x, y, z (wall frame unit vectors), half sizes."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=2.0)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = _obj(name, me, m)
    X, Y, Z = W(*x), W(*y), W(*z)
    M = Matrix(((X.x * hx, Y.x * hy, Z.x * hz, 0), (X.y * hx, Y.y * hy, Z.y * hz, 0), (X.z * hx, Y.z * hy, Z.z * hz, 0), (0, 0, 0, 1)))
    me.transform(M)
    me.transform(Matrix.Translation(W(*c)))
    if bev > 0:
        bevel(o, bev, segs)
    return o


def cyl(name, p0, p1, r, m=None, segs=16, r1=None, caps=True, smooth=True):
    """Cylinder (or cone with r1) between two wall-frame points."""
    a, b = W(*p0), W(*p1)
    d = b - a
    L = d.length
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=caps, cap_tris=False, segments=segs, radius1=r, radius2=r if r1 is None else r1, depth=L)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    if smooth:
        for p in me.polygons:
            p.use_smooth = True
    o = _obj(name, me, m)
    q = Vector((0, 0, 1)).rotation_difference(d.normalized())
    me.transform(Matrix.Translation((a + b) / 2) @ q.to_matrix().to_4x4())
    return o


def torus(name, c, axis, R, r, m=None, segs=32, rsegs=8):
    bm = bmesh.new()
    verts = []
    for i in range(segs):
        a = 2 * math.pi * i / segs
        ring = []
        for j in range(rsegs):
            b = 2 * math.pi * j / rsegs
            x = (R + r * math.cos(b)) * math.cos(a)
            y = (R + r * math.cos(b)) * math.sin(a)
            z = r * math.sin(b)
            ring.append(bm.verts.new((x, y, z)))
        verts.append(ring)
    for i in range(segs):
        for j in range(rsegs):
            a, b_, c_, d = verts[i][j], verts[(i + 1) % segs][j], verts[(i + 1) % segs][(j + 1) % rsegs], verts[i][(j + 1) % rsegs]
            bm.faces.new((a, b_, c_, d))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    o = _obj(name, me, m)
    q = Vector((0, 0, 1)).rotation_difference(W(*axis).normalized())
    me.transform(Matrix.Translation(W(*c)) @ q.to_matrix().to_4x4())
    return o


def tube(name, pts, r, m=None, segs=8, res=4, caps=True, cyclic=False):
    """Swept tube through wall-frame points (smooth Bezier, auto handles); cyclic closes the loop."""
    cu = bpy.data.curves.new(name + '_c', 'CURVE')
    cu.dimensions = '3D'
    cu.bevel_depth = r
    cu.bevel_resolution = max(0, segs // 4 - 1)
    cu.resolution_u = res
    cu.use_fill_caps = caps
    sp = cu.splines.new('BEZIER')
    sp.bezier_points.add(len(pts) - 1)
    for bp, p in zip(sp.bezier_points, pts):
        bp.co = W(*p)
        bp.handle_left_type = bp.handle_right_type = 'AUTO'
    sp.use_cyclic_u = cyclic
    o = bpy.data.objects.new(name + '_tmp', cu)
    bpy.context.scene.collection.objects.link(o)
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(o.evaluated_get(dg))
    bpy.data.objects.remove(o)
    bpy.data.curves.remove(cu)
    for p in me.polygons:
        p.use_smooth = True
    return _obj(name, me, m)


def from_pydata(name, verts, faces, m=None, smooth=False):
    me = bpy.data.meshes.new(name)
    me.from_pydata([W(*v) for v in verts], [], faces)
    me.validate()
    if smooth:
        for p in me.polygons:
            p.use_smooth = True
    return _obj(name, me, m)


def boolean(o, cutter, op='DIFFERENCE'):
    md = o.modifiers.new('bool', 'BOOLEAN')
    md.operation = op
    md.object = cutter
    md.solver = 'EXACT'
    apply_mods(o)
    bpy.data.objects.remove(cutter)
    return o


def join(objs, name):
    objs = [o for o in objs if o is not None]
    for o in bpy.context.selected_objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active
    o.name = name
    o.data.name = name
    return o


def sharpen(o, angle=35):
    """Split the low-poly's normals at hard edges (what the normal bake and the game both see)."""
    md = o.modifiers.new('split', 'EDGE_SPLIT')
    md.split_angle = math.radians(angle)
    for p in o.data.polygons:
        p.use_smooth = True
    return apply_mods(o)


def drop_faces(o, test):
    """Delete faces for which test(centre, normal) (wall frame vectors) is true - e.g. the ones against the wall."""
    bm = bmesh.new()
    bm.from_mesh(o.data)
    kill = []
    for f in bm.faces:
        c, n = f.calc_center_median(), f.normal
        if test((c.x, c.z, -c.y), (n.x, n.z, -n.y)):
            kill.append(f)
    bmesh.ops.delete(bm, geom=kill, context='FACES')
    bm.to_mesh(o.data)
    bm.free()
    return o


def triangulate(o):
    """Triangles before baking, so the bake's tangent frames are the ones glTF exports (MikkTSpace)."""
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.triangulate(bm, faces=bm.faces[:], quad_method='BEAUTY', ngon_method='BEAUTY')
    bm.to_mesh(o.data)
    bm.free()
    return o


def tri_count(o):
    return sum(len(p.vertices) - 2 for p in o.data.polygons)


# ------------------------------------------------------------------ baking
class Atlas:
    """A square atlas of `size` px. Each piece gets a rectangular cell (px, y from the top): it is baked into
    images of the cell's size (bake time scales with the pixels baked) and pasted into the atlas arrays."""

    KEYS = (('albedo', 'sRGB', (0.5, 0.5, 0.5, 1)), ('normal', 'Non-Color', (0.5, 0.5, 1, 1)),
            ('ao', 'Non-Color', (1, 1, 1, 1)), ('rm', 'Non-Color', (0, 0.5, 0, 1)))

    def __init__(self, size, prefix):
        self.size = size
        self.prefix = prefix
        self.arr = {k: np.tile(np.array(fill, dtype=np.float32), (size, size, 1)) for k, _, fill in self.KEYS}
        self.img = {}
        lm = bpy.data.materials.new('lo_bake')
        lm.use_nodes = True
        self.node = lm.node_tree.nodes.new('ShaderNodeTexImage')
        lm.node_tree.nodes.active = self.node
        self.lo_mat = lm

    def unwrap(self, lo, cell, pad=3):
        """Smart-project the low-poly into the cell's own [0, 1] square (uniform scale, pad px border)."""
        for o in bpy.context.selected_objects:
            o.select_set(False)
        lo.select_set(True)
        bpy.context.view_layer.objects.active = lo
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.smart_project(angle_limit=math.radians(50), island_margin=0.02, scale_to_bounds=False)
        bpy.ops.object.mode_set(mode='OBJECT')
        uv = lo.data.uv_layers.active.data
        us = [d.uv.x for d in uv]
        vs = [d.uv.y for d in uv]
        u0, u1, v0, v1 = min(us), max(us), min(vs), max(vs)
        _, _, w, h = cell
        # uniform texel density inside the cell
        k = min((w - 2 * pad) / max(1e-6, u1 - u0), (h - 2 * pad) / max(1e-6, v1 - v0))
        for d in uv:
            d.uv = ((pad + (d.uv.x - u0) * k) / w, (pad + (d.uv.y - v0) * k) / h)

    def bake(self, lo, hi, cell, extrusion=0.02, ray=0.05, ao_samples=96):
        sc = bpy.context.scene
        x, y, w, h = cell
        lo.data.materials.clear()
        lo.data.materials.append(self.lo_mat)
        # the low-poly shell must not shadow the high-poly in the AO bake
        lo.visible_diffuse = lo.visible_glossy = lo.visible_shadow = lo.visible_transmission = False
        for o in bpy.context.selected_objects:
            o.select_set(False)
        for o in hi:
            o.select_set(True)
        lo.select_set(True)
        bpy.context.view_layer.objects.active = lo
        bk = sc.render.bake
        bk.margin_type = 'EXTEND'
        bk.target = 'IMAGE_TEXTURES'
        # roughness / metalness go through emission, restored afterwards
        saved = []
        for o in hi:
            for m in o.data.materials:
                if m is None or any(m is s_[0] for s_ in saved):
                    continue
                b = _bsdf(m)
                saved.append((m, tuple(b.inputs['Emission Color'].default_value), b.inputs['Emission Strength'].default_value))
        jobs = [('albedo', 'DIFFUSE', {'COLOR'}), ('normal', 'NORMAL', set()), ('ao', 'AO', set()), ('rm', 'EMIT', set())]
        S = self.size
        for (key, cs, fill), (_, kind, pf) in zip(self.KEYS, jobs):
            im = bpy.data.images.new(f'tmp_{key}', w, h, alpha=False, float_buffer=True)
            im.colorspace_settings.name = 'Non-Color' if key != 'albedo' else 'Linear Rec.709'
            im.pixels.foreach_set(np.tile(np.array(fill, dtype=np.float32), w * h))
            self.node.image = im
            # Cycles weights the diffuse pass by (1 - metallic): bake the albedo of metals with metallic 0
            # (otherwise polished aluminium and silver paint come out black)
            for m, _, _ in saved:
                b = _bsdf(m)
                b.inputs['Metallic'].default_value = 0.0 if key == 'albedo' else m.get('metal', b.inputs['Metallic'].default_value)
            if key == 'rm':
                for m, _, _ in saved:
                    b = _bsdf(m)
                    b.inputs['Emission Color'].default_value = (0.0, m.get('rough', 0.5), m.get('metal', 0.0), 1)
                    b.inputs['Emission Strength'].default_value = 1.0
            sc.cycles.samples = ao_samples if kind == 'AO' else 4
            t0 = time.time()
            bpy.ops.object.bake(type=kind, pass_filter=pf, use_selected_to_active=True, cage_extrusion=extrusion,
                                max_ray_distance=ray, margin=3, use_clear=False, normal_space='TANGENT')
            px = np.empty(w * h * 4, dtype=np.float32)
            im.pixels.foreach_get(px)
            # Blender rows run bottom-up; the atlas array is stored the same way (row 0 = bottom)
            self.arr[key][S - y - h:S - y, x:x + w] = px.reshape(h, w, 4)
            bpy.data.images.remove(im)
            print(f'  bake {kind}: {time.time() - t0:.1f}s', flush=True)
        for m, c, s_ in saved:
            b = _bsdf(m)
            b.inputs['Emission Color'].default_value = c
            b.inputs['Emission Strength'].default_value = s_
            b.inputs['Metallic'].default_value = m.get('metal', b.inputs['Metallic'].default_value)
        lo.visible_diffuse = lo.visible_glossy = lo.visible_shadow = lo.visible_transmission = True
        # move the islands from the cell square into the atlas
        for d in lo.data.uv_layers.active.data:
            d.uv = ((x + d.uv.x * w) / S, (S - y - h + d.uv.y * h) / S)

    def finish(self, out_dir, ao_in_albedo=0.6):
        """albedo x AO^k (contact shading that also shows in direct light) and ORM = (AO, rough, metal)."""
        S = self.size
        alb, ao, rm, nrm = self.arr['albedo'], self.arr['ao'], self.arr['rm'], self.arr['normal']
        a = np.clip(ao[..., 0:1], 0, 1)
        alb = alb.copy()
        alb[..., :3] *= np.power(a, ao_in_albedo)
        orm = np.concatenate([a, rm[..., 1:2], rm[..., 2:3], np.ones_like(a)], axis=2)
        for key, data, cs in (('albedo', alb, 'sRGB'), ('normal', nrm, 'Non-Color'), ('orm', orm, 'Non-Color')):
            im = bpy.data.images.new(f'{self.prefix}_{key}', S, S, alpha=False, float_buffer=(key != 'albedo'))
            im.colorspace_settings.name = cs if key != 'albedo' else 'sRGB'
            if key == 'albedo':
                # linear bake -> sRGB bytes
                d = data.copy()
                c = np.clip(d[..., :3], 0, 1)
                d[..., :3] = np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(c, 1 / 2.4) - 0.055)
                data = d
            im.pixels.foreach_set(np.ascontiguousarray(data, dtype=np.float32).ravel())
            im.filepath_raw = f'{out_dir}/{im.name}.png'
            im.file_format = 'PNG'
            im.save()
            self.img[key] = im

    def export_material(self, name='kit'):
        """The material the game uses: atlas albedo, tangent-space normal map, ORM (glTF occlusion + metal/rough)."""
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        nt = m.node_tree
        b = _bsdf(m)
        ta = nt.nodes.new('ShaderNodeTexImage'); ta.image = self.img['albedo']
        tn = nt.nodes.new('ShaderNodeTexImage'); tn.image = self.img['normal']
        to = nt.nodes.new('ShaderNodeTexImage'); to.image = self.img['orm']
        nm = nt.nodes.new('ShaderNodeNormalMap')
        sp = nt.nodes.new('ShaderNodeSeparateColor')
        nt.links.new(ta.outputs['Color'], b.inputs['Base Color'])
        nt.links.new(tn.outputs['Color'], nm.inputs['Color'])
        nt.links.new(nm.outputs['Normal'], b.inputs['Normal'])
        nt.links.new(to.outputs['Color'], sp.inputs['Color'])
        nt.links.new(sp.outputs['Green'], b.inputs['Roughness'])
        nt.links.new(sp.outputs['Blue'], b.inputs['Metallic'])
        # glTF occlusion goes through the exporter's "glTF Material Output" group
        grp = bpy.data.node_groups.get('glTF Material Output')
        if grp is None:
            grp = bpy.data.node_groups.new('glTF Material Output', 'ShaderNodeTree')
            grp.interface.new_socket('Occlusion', in_out='INPUT', socket_type='NodeSocketFloat')
            grp.interface.new_socket('Thickness', in_out='INPUT', socket_type='NodeSocketFloat')
        gn = nt.nodes.new('ShaderNodeGroup')
        gn.node_tree = grp
        nt.links.new(sp.outputs['Red'], gn.inputs['Occlusion'])
        return m


def export_glb(objs, path, jpeg_quality=88):
    for o in bpy.context.selected_objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_apply=True,
                              export_tangents=True, export_image_format='JPEG', export_jpeg_quality=jpeg_quality,
                              export_materials='EXPORT', export_yup=True, export_texcoords=True, export_normals=True,
                              export_extras=True)


def lathe(name, prof, segs=48, m=None, a0=0.0, a1=2 * math.pi, axis='x', smooth=True, close=True):
    """Surface of revolution about the piece's x axis (three.js frame) from a profile [(r, x), ...];
    a full turn shares its seam vertices, a partial one (a0..a1) is open."""
    full = close and abs(a1 - a0 - 2 * math.pi) < 1e-6
    n = segs if full else segs + 1
    bm = bmesh.new()
    rings = []
    for i in range(n):
        a = a0 + (a1 - a0) * i / segs
        ring = []
        for r, x in prof:
            # three.js (x, r cos a, r sin a) -> wall frame (t, u, n)
            ring.append(bm.verts.new(W(x, r * math.cos(a), r * math.sin(a))))
        rings.append(ring)
    for i in range(segs):
        A, B = rings[i], rings[(i + 1) % n]
        for j in range(len(prof) - 1):
            try:
                bm.faces.new((A[j], A[j + 1], B[j + 1], B[j]))
            except ValueError:
                pass
    if full:
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    if smooth:
        for p in me.polygons:
            p.use_smooth = True
    return _obj(name, me, m)


def render_preview(objs, path, d=(0.55, -1.0, 0.35), res=512, lens=50, zoom=1.25, target=None):
    """Cycles still of the given objects (modelling check); d = view direction in Blender axes."""
    sc = bpy.context.scene
    mn = Vector((1e9, 1e9, 1e9)); mx = Vector((-1e9, -1e9, -1e9))
    for o in objs:
        for v in o.data.vertices:
            p = o.matrix_world @ v.co
            mn = Vector((min(mn.x, p.x), min(mn.y, p.y), min(mn.z, p.z))); mx = Vector((max(mx.x, p.x), max(mx.y, p.y), max(mx.z, p.z)))
    c = Vector(target) if target else (mn + mx) / 2
    size = max((mx - mn).length, 0.2)
    cam = bpy.data.cameras.new('cam')
    co = bpy.data.objects.new('cam', cam)
    sc.collection.objects.link(co)
    dv = Vector(d).normalized()
    co.location = c + dv * size * zoom
    co.rotation_euler = (-dv).to_track_quat('-Z', 'Y').to_euler()
    cam.lens = lens
    cam.clip_start = 0.01
    sc.camera = co
    sun = bpy.data.lights.new('sun', 'SUN')
    sun.energy = 4
    so = bpy.data.objects.new('sun', sun)
    so.rotation_euler = (0.8, 0.2, 0.6)
    sc.collection.objects.link(so)
    sc.world.use_nodes = True
    sc.world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.55, 0.62, 0.7, 1)
    sc.world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.8
    sc.render.resolution_x = sc.render.resolution_y = res
    sc.cycles.samples = 24
    sc.render.filepath = path
    sc.render.image_settings.file_format = 'JPEG'
    bpy.ops.render.render(write_still=True)
    for o in (co, so):
        bpy.data.objects.remove(o)
