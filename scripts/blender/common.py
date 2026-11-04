"""Shared bpy helpers for the Happy birthday Matex asset generator (Blender 5.2 bpy).

Geometry helpers take *film coordinates* (three.js convention: +Y up, +Z toward
camera) and convert to Blender's Z-up space so the glTF exporter (export_yup)
returns them unchanged:  blender = (x, -z, y).
"""
import math
import bpy
import bmesh
from mathutils import Vector, Matrix


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def F(x, y, z):
    """film -> blender coordinates"""
    return Vector((x, -z, y))


_mats = {}


def mat(name, color=(0.8, 0.8, 0.8), metal=0.0, rough=0.5, emit=None, alpha=1.0):
    if name in _mats:
        return _mats[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    if bsdf:
        bsdf.inputs['Base Color'].default_value = (*color, 1)
        bsdf.inputs['Metallic'].default_value = metal
        bsdf.inputs['Roughness'].default_value = rough
        if alpha < 1:
            bsdf.inputs['Alpha'].default_value = alpha
        if emit is not None:
            bsdf.inputs['Emission Color'].default_value = (*emit, 1)
            bsdf.inputs['Emission Strength'].default_value = 1.0
    if bsdf and name.endswith('Skin') or name in ('EyeBall',):
        try:
            at = m.node_tree.nodes.new('ShaderNodeVertexColor')
            at.layer_name = 'Col'
            m.node_tree.links.new(at.outputs['Color'], bsdf.inputs['Base Color'])
        except Exception:
            pass
    _mats[name] = m
    return m


def clear_mats():
    _mats.clear()


def new_obj(name, bm, materials=(), parent=None, smooth=False, coll=None):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for m in materials:
        me.materials.append(m)
    if smooth:
        for p in me.polygons:
            p.use_smooth = True
    ob = bpy.data.objects.new(name, me)
    (coll or bpy.context.scene.collection).objects.link(ob)
    if parent is not None:
        ob.parent = parent
    return ob


def empty(name, parent=None, loc=(0, 0, 0), coll=None):
    e = bpy.data.objects.new(name, None)
    e.empty_display_size = 0.05
    (coll or bpy.context.scene.collection).objects.link(e)
    e.parent = parent
    e.location = loc
    return e


def apply_mods(ob):
    """Bake all modifiers into the mesh (depsgraph evaluation, no operator context)."""
    dg = bpy.context.evaluated_depsgraph_get()
    ev = ob.evaluated_get(dg)
    me = bpy.data.meshes.new_from_object(ev, preserve_all_data_layers=True, depsgraph=dg)
    old = ob.data
    ob.modifiers.clear()
    ob.data = me
    bpy.data.meshes.remove(old)
    return ob


def bevel(ob, width, segments=3, limit='ANGLE', angle=30, harden=True, profile=0.5):
    m = ob.modifiers.new('bevel', 'BEVEL')
    m.width = width
    m.segments = segments
    m.limit_method = limit
    if limit == 'ANGLE':
        m.angle_limit = math.radians(angle)
    m.profile = profile
    m.harden_normals = harden
    try:
        ob.data.use_auto_smooth = True  # pre-4.1 API; ignored in 5.x
    except Exception:
        pass
    return m


def subsurf(ob, levels=2):
    m = ob.modifiers.new('subd', 'SUBSURF')
    m.levels = levels
    m.render_levels = levels
    return m


def smooth_by_angle(ob, deg=35):
    for p in ob.data.polygons:
        p.use_smooth = True
    try:
        mod = ob.modifiers.new('sba', 'NODES')
        # Blender >=4.1: shade auto smooth via operator is simpler
        ob.modifiers.remove(mod)
    except Exception:
        pass
    try:
        with bpy.context.temp_override(object=ob, active_object=ob, selected_objects=[ob], selected_editable_objects=[ob]):
            bpy.ops.object.shade_smooth_by_angle(angle=math.radians(deg))
    except Exception:
        pass


def rounded_rect_pts(w, h, radii, seg=10):
    """2D outline (x,y) of a w x h rectangle centred at 0 with per-corner radii
    (tr, tl, bl, br)."""
    pts = []
    corners = [(w / 2, h / 2, 0), (-w / 2, h / 2, 90), (-w / 2, -h / 2, 180), (w / 2, -h / 2, 270)]
    for (cx, cy, a0), r in zip(corners, radii):
        r = max(r, 1e-5)
        ox = cx - math.copysign(r, cx)
        oy = cy - math.copysign(r, cy)
        n = seg if r > 1e-4 else 1
        for i in range(n + 1):
            a = math.radians(a0 + 90 * i / n)
            pts.append((ox + math.cos(a) * r, oy + math.sin(a) * r))
    return pts


def slab(outline, z0, z1, uv=True):
    """Extrude a 2D outline (film x,y) between film z0 (back) and z1 (front).
    Returns bmesh. Face material indices: 0 = sides, 1 = front (+z), 2 = back (-z)."""
    bm = bmesh.new()
    vb = [bm.verts.new(F(x, y, z0)) for x, y in outline]
    vf = [bm.verts.new(F(x, y, z1)) for x, y in outline]
    n = len(outline)
    front = bm.faces.new(vf)
    back = bm.faces.new(list(reversed(vb)))
    front.material_index = 1
    back.material_index = 2
    for i in range(n):
        j = (i + 1) % n
        f = bm.faces.new((vb[i], vb[j], vf[j], vf[i]))
        f.material_index = 0
    bm.normal_update()
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if uv:
        planar_uv(bm, outline)
    return bm


def planar_uv(bm, outline=None):
    """front/back faces get 0..1 UVs over the outline bbox (film x,y)."""
    uvl = bm.loops.layers.uv.verify()
    xs = [v.co.x for v in bm.verts]
    ys = [v.co.z for v in bm.verts]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    for f in bm.faces:
        for l in f.loops:
            l[uvl].uv = ((l.vert.co.x - x0) / (x1 - x0 + 1e-9), (l.vert.co.z - y0) / (y1 - y0 + 1e-9))


def disc_pts(r, n=48, sx=1.0, sy=1.0):
    return [(math.cos(2 * math.pi * i / n) * r * sx, math.sin(2 * math.pi * i / n) * r * sy) for i in range(n)]


def poly_pts(r, n, rot=0.0):
    return [(math.cos(rot + 2 * math.pi * i / n) * r, math.sin(rot + 2 * math.pi * i / n) * r) for i in range(n)]


def translate(bm, dx, dy, dz):
    bmesh.ops.translate(bm, verts=bm.verts, vec=F(dx, dy, dz))
    return bm


def lathe(profile, n=48, name='lathe', mats=(), parent=None, smooth=True, cap=True):
    """Revolve a film (r, y) profile around the film Y axis."""
    bm = bmesh.new()
    rings = []
    for i in range(n):
        a = 2 * math.pi * i / n
        ring = [bm.verts.new(F(math.cos(a) * r, y, math.sin(a) * r)) for r, y in profile]
        rings.append(ring)
    for i in range(n):
        a, b = rings[i], rings[(i + 1) % n]
        for k in range(len(profile) - 1):
            if profile[k][0] < 1e-6 and profile[k + 1][0] < 1e-6:
                continue
            try:
                bm.faces.new((a[k], a[k + 1], b[k + 1], b[k]))
            except ValueError:
                pass
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bm.normal_update()
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    uvl = bm.loops.layers.uv.verify()
    for f in bm.faces:
        for l in f.loops:
            co = l.vert.co
            l[uvl].uv = ((math.atan2(-co.y, co.x) / (2 * math.pi)) % 1.0, co.z)
    return new_obj(name, bm, mats, parent, smooth)


def export_glb(path, objects, morph=True, skins=True):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:
        o.select_set(True)
        for c in o.children_recursive:
            c.select_set(True)
    kw = dict(filepath=path, export_format='GLB', use_selection=True, export_apply=True,
              export_yup=True, export_morph=morph, export_skins=skins, export_animations=False,
              export_texcoords=True, export_normals=True, export_extras=True)
    try:
        bpy.ops.export_scene.gltf(**kw, export_vertex_color='ACTIVE')
    except TypeError:
        bpy.ops.export_scene.gltf(**kw)
    print('exported', path)
