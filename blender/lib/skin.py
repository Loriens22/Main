"""High-detail creature skin: sculpt, paint and bake.

The runtime mesh of a creature (lofted and subdivided by bio.py) gets a second UV set ('bake'). A copy of it is
subdivided twice more and sculpted procedurally, per tissue (scales that overlap toward the tail, wrinkles round the
body axis, pores, pitted mineral armour, sediment grit, membrane veins), plus the animal's own anatomical marks (gill
slits, lateral lines, scars, eye rings) from a per-species function. The same pass paints the colouration into vertex
colours: countershading (dark back, pale belly), mottling, spots, darker grooves, paler scale rims, scar tissue; and
the wetness into roughness. Cycles then bakes, from the sculpt onto the runtime mesh: a tangent-space normal map, the
colour, and the roughness. The baked material (named 'cr_<creature>') uses the 'bake' UVs (glTF TEXCOORD_1).
"""
import math
import os

import bmesh
import bpy
from mathutils import Vector, noise

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))


def _hex(c):
    c = c.lstrip("#")
    return Vector((int(c[0:2], 16) / 255, int(c[2:4], 16) / 255, int(c[4:6], 16) / 255))


def _lin(v):
    return Vector(tuple(((x + 0.055) / 1.055) ** 2.4 if x > 0.04045 else x / 12.92 for x in v))


def ss(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a))) if b != a else (1.0 if x >= a else 0.0)
    return t * t * (3 - 2 * t)


class Look:
    """How one tissue looks: colouration, wetness, and the sculpted relief.

    disp: 'scales' | 'plates' | 'wrinkles' | 'pores' | 'sediment' | 'smooth' | 'membrane' | 'ribs'
    size: feature size (m) of that relief; amp: its height (m)
    """

    def __init__(self, color, belly=None, counter=0.0, mottle=0.25, mottle_size=0.6, spots=0.0, spot_size=0.25, spot_color=None,
                 rough=0.42, rough_var=0.12, disp="smooth", amp=0.003, size=0.04, groove=0.3, rim=0.08, stretch=(1.0, 1.0, 1.0),
                 sheen_dark=0.0, seed=0, opacity=None):
        self.color = _lin(_hex(color))
        self.belly = _lin(_hex(belly)) if belly else None
        self.counter = counter
        self.mottle, self.mottle_size = mottle, mottle_size
        self.spots, self.spot_size = spots, spot_size
        self.spot_color = _lin(_hex(spot_color)) if spot_color else self.color * 0.45
        self.rough, self.rough_var = rough, rough_var
        self.disp, self.amp, self.size = disp, amp, size
        self.groove, self.rim = groove, rim
        self.stretch = Vector(stretch)
        self.seed = seed
        self.opacity = opacity


def relief(L, p):
    """height (-1..1 times amp) and a groove factor 0..1 at local point p for a tissue"""
    q = Vector((p.x * L.stretch.x, p.y * L.stretch.y, p.z * L.stretch.z)) / L.size
    o = Vector((L.seed * 17.3, L.seed * 7.1, L.seed * 3.9))
    k = L.disp
    if k == "scales":
        d, pts = noise.voronoi(q + o, distance_metric="DISTANCE", exponent=2.5)
        cell = d[1] - d[0]
        # each scale is a low dome tilted up toward its trailing edge (the next scale tucks under it)
        lean = (q + o - pts[0]).y
        h = ss(0.0, 0.5, cell) * (0.65 - 0.35 * max(-1.0, min(1.0, lean * 1.6)))
        return h * 2 - 0.6, 1 - ss(0.0, 0.12, cell)
    if k == "plates":
        d, pts = noise.voronoi(q * 0.35 + o, distance_metric="DISTANCE", exponent=2.0)
        cell = d[1] - d[0]
        pit = 1 - ss(0.0, 0.06, noise.voronoi(q * 3.0 + o, distance_metric="DISTANCE")[0][0])
        growth = 0.5 + 0.5 * math.sin((q.length + noise.noise(q * 0.5 + o) * 2) * 9)
        h = ss(0.0, 0.25, cell) * 0.8 + growth * 0.12 - pit * 0.45 + noise.fractal(q * 1.7 + o, 0.6, 2.0, 4) * 0.18
        return h, max(1 - ss(0.0, 0.08, cell), pit * 0.7)
    if k == "wrinkles":
        w = noise.ridged_multi_fractal(q + o, 0.9, 2.1, 4, 1.0, 2.0)
        fine = noise.noise(q * 6.0 + o)
        return (w - 1.0) * 0.6 + fine * 0.12, max(0.0, min(1.0, (w - 1.2) * 0.8))
    if k == "pores":
        d = noise.voronoi(q + o, distance_metric="DISTANCE")[0][0]
        pore = 1 - ss(0.0, 0.18, d)
        return noise.fractal(q * 0.4 + o, 0.6, 2.0, 3) * 0.5 - pore * 0.5, pore
    if k == "sediment":
        d = noise.voronoi(q + o, distance_metric="DISTANCE")[0][0]
        grain = 1 - ss(0.0, 0.45, d)
        return grain * 0.9 + noise.noise(q * 0.3 + o) * 0.3 - 0.3, 1 - grain
    if k == "membrane":
        r = noise.ridged_multi_fractal(q + o, 0.8, 2.0, 3, 1.0, 2.0)
        return (r - 1.0) * 0.5, 0.0
    if k == "ribs":
        # parallel ridges across the body axis (throat pleats, filter plates, ringed limbs)
        v = 0.5 + 0.5 * math.sin(q.x * math.tau + noise.noise(q * 0.2 + o) * 1.5)
        return v * 0.8 - 0.4, 1 - ss(0.05, 0.3, v)
    return noise.fractal(q + o, 0.7, 2.0, 4) * 0.6, 0.0


def paint(L, p, n, h, groove):
    """colour (linear RGB) and roughness at a point"""
    o = Vector((L.seed * 5.3, L.seed * 2.9, L.seed * 8.7))
    c = L.color.copy()
    if L.belly is not None:
        t = ss(0.1, -0.55, n.z)
        c = c.lerp(L.belly, t)
    if L.counter:
        c = c * (1.0 - L.counter * ss(0.2, 0.9, n.z))
    m = noise.fractal(p / L.mottle_size + o, 0.65, 2.0, 5)
    c = c * max(0.2, 1.0 + L.mottle * m)
    if L.spots:
        d = noise.voronoi(p / L.spot_size + o * 0.3, distance_metric="DISTANCE")[0][0]
        s = 1 - ss(0.18, 0.32, d + noise.noise(p / (L.spot_size * 0.3)) * 0.08)
        c = c.lerp(L.spot_color, s * L.spots)
    c = c * (1.0 - L.groove * groove) * (1.0 + L.rim * max(0.0, h))
    r = L.rough + L.rough_var * (noise.noise(p / (L.mottle_size * 0.5) + o) + groove * 0.8 - max(0.0, h) * 0.5)
    return c, max(0.05, min(1.0, r))


def _image(name, size, data=False, fill=None):
    img = bpy.data.images.new(name, size, size, alpha=False, float_buffer=False)
    if data:
        img.colorspace_settings.name = "Non-Color"
    # texels outside the islands start as a plausible value, not black: thin rims of membranes get tiny islands
    # whose filtered edges would otherwise show black
    if fill is not None:
        img.generated_color = fill
    return img


def _uv_unwrap(ob, faces):
    """smart-project the faces to be baked into the 'bake' UV layer; every other face collapses to a corner"""
    me = ob.data
    first = me.uv_layers[0].name if me.uv_layers else None
    uv = me.uv_layers.get("bake") or me.uv_layers.new(name="bake")
    me.uv_layers.active = uv
    for o in bpy.context.scene.objects:
        o.select_set(False)
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.mode_set(mode="EDIT")
    bm = bmesh.from_edit_mesh(me)
    bm.faces.ensure_lookup_table()
    for f in bm.faces:
        f.select = f.index in faces
    bmesh.update_edit_mesh(me)
    bpy.ops.uv.smart_project(angle_limit=math.radians(58), island_margin=0.004, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
    bpy.ops.uv.select_all(action="SELECT")
    try:
        bpy.ops.uv.pack_islands(rotate=True, margin=0.0035)
    except Exception:
        pass
    bpy.ops.object.mode_set(mode="OBJECT")
    lay = me.uv_layers["bake"]
    for poly in me.polygons:
        if poly.index not in faces:
            for li in poly.loop_indices:
                lay.data[li].uv = (0.0005, 0.0005)
    if first:
        me.uv_layers.active = me.uv_layers[first]
    # glTF exports the render-active layer as TEXCOORD_0: keep the authored UVs there
    for l in me.uv_layers:
        l.active_render = (l.name == first)


def bake(ob, looks, name, tex=2048, levels=2, extra=None, scale=1.0):
    """Sculpt, paint and bake the tissues named in `looks` (material name -> Look) on the runtime mesh `ob`.
    extra(p, n, mat) -> (dh_m, dark 0..1): the species' own anatomical marks (metres of relief, darkening)."""
    me = ob.data
    slots = {i: m.name for i, m in enumerate(me.materials) if m and m.name in looks}
    if not slots:
        return
    faces = {p.index for p in me.polygons if p.material_index in slots}
    _uv_unwrap(ob, faces)
    # ---------------------------------------------------------------- the sculpt
    hi = ob.copy()
    hi.data = me.copy()
    hi.name = ob.name + "_hi"
    bpy.context.scene.collection.objects.link(hi)
    hi.modifiers.clear()
    hi.parent = None
    hi.matrix_world = ob.matrix_world.copy()
    bm = bmesh.new()
    bm.from_mesh(hi.data)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.material_index not in slots], context="FACES")
    bm.to_mesh(hi.data)
    bm.free()
    md = hi.modifiers.new("sub", "SUBSURF")
    md.levels = levels
    md.render_levels = levels
    md.uv_smooth = "PRESERVE_CORNERS"
    dg = bpy.context.evaluated_depsgraph_get()
    newme = bpy.data.meshes.new_from_object(hi.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
    hi.modifiers.clear()
    old = hi.data
    hi.data = newme
    bpy.data.meshes.remove(old)
    hm = hi.data
    hm.calc_loop_triangles()
    # material per vertex (first face that uses it)
    vmat = [None] * len(hm.vertices)
    for poly in hm.polygons:
        mname = hi.material_slots[poly.material_index].material.name if poly.material_index < len(hi.material_slots) else None
        for vi in poly.vertices:
            if vmat[vi] is None:
                vmat[vi] = mname
    cols = hm.color_attributes.new("skin_col", "FLOAT_COLOR", "POINT")
    rghs = hm.color_attributes.new("skin_rgh", "FLOAT_COLOR", "POINT")
    co = [v.co.copy() for v in hm.vertices]
    nr = [v.normal.copy() for v in hm.vertices]
    for i, v in enumerate(hm.vertices):
        L = looks.get(vmat[i])
        if L is None:
            cols.data[i].color = (0.5, 0.5, 0.5, 1)
            rghs.data[i].color = (0.5, 0.5, 0.5, 1)
            continue
        p, n = co[i], nr[i]
        h, g = relief(L, p)
        dh = h * L.amp * scale
        dark = 0.0
        if extra:
            e = extra(p, n, vmat[i])
            if e:
                dh += e[0]
                dark = e[1]
        v.co = p + n * dh
        c, r = paint(L, p, n, h, max(g, dark))
        c = c * (1.0 - 0.6 * dark)
        cols.data[i].color = (c.x, c.y, c.z, 1.0)
        rghs.data[i].color = (r, r, r, 1.0)
    hm.update()
    # shading of the sculpt: the painted attributes
    for slot in hi.material_slots:
        m = bpy.data.materials.new(hi.name + "_" + (slot.material.name if slot.material else "x"))
        m.use_nodes = True
        nt = m.node_tree
        bsdf = nt.nodes.get("Principled BSDF")
        a1 = nt.nodes.new("ShaderNodeAttribute"); a1.attribute_name = "skin_col"
        a2 = nt.nodes.new("ShaderNodeAttribute"); a2.attribute_name = "skin_rgh"
        nt.links.new(a1.outputs["Color"], bsdf.inputs["Base Color"])
        nt.links.new(a2.outputs["Fac"], bsdf.inputs["Roughness"])
        bsdf.inputs["Metallic"].default_value = 0.0
        slot.material = m
    # ---------------------------------------------------------------- the bake
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = 1
    sc.render.bake.use_selected_to_active = True
    size = max(ob.dimensions) / max(1e-6, max(ob.scale))
    # the cage only has to clear the sculpted relief: a deep cage on thin membranes (wings, fins, lamellae) reaches
    # through to the far side and bakes black specks
    depth = max((lk.amp for lk in looks.values() if lk is not None), default=0.004)
    ext = max(0.003, min(size * 0.012, depth * 4 + 0.002))
    sc.render.bake.cage_extrusion = ext
    sc.render.bake.max_ray_distance = max(0.012, min(size * 0.05, ext * 3))
    sc.render.bake.margin = 12
    cs = [lk.color for lk in looks.values() if lk is not None]
    avg = sum(cs, Vector((0, 0, 0))) / max(1, len(cs))
    imgs = {"col": _image(f"{name}_col", tex, fill=(avg.x, avg.y, avg.z, 1)), "nrm": _image(f"{name}_nrm", tex, True, (0.5, 0.5, 1.0, 1)),
            "rgh": _image(f"{name}_rgh", tex, True, (0.4, 0.4, 0.4, 1))}
    # every material of the target gets a temporary image node (bake writes into the active one)
    temp = []
    for slot in ob.material_slots:
        m = slot.material
        if m is None:
            continue
        m.use_nodes = True
        node = m.node_tree.nodes.new("ShaderNodeTexImage")
        uvn = m.node_tree.nodes.new("ShaderNodeUVMap")
        uvn.uv_map = "bake"
        m.node_tree.links.new(uvn.outputs["UV"], node.inputs["Vector"])
        temp.append((m, node, uvn))
    for o in sc.objects:
        o.select_set(False)
    hi.select_set(True)
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    # the bake reads the render-active UV layer of the target: point it at 'bake' for the bake
    me.uv_layers["bake"].active_render = True
    me.uv_layers.active = me.uv_layers["bake"]
    for key, btype, kw in (("nrm", "NORMAL", {"normal_space": "TANGENT"}), ("col", "DIFFUSE", {"pass_filter": {"COLOR"}}), ("rgh", "ROUGHNESS", {})):
        for m, node, uvn in temp:
            node.image = imgs[key]
            m.node_tree.nodes.active = node
        bpy.ops.object.bake(type=btype, use_selected_to_active=True, margin=6, **kw)
    for m, node, uvn in temp:
        m.node_tree.nodes.remove(node)
        m.node_tree.nodes.remove(uvn)
    for l in me.uv_layers:
        l.active_render = l.name != "bake"
    me.uv_layers.active = me.uv_layers[0]
    # ---------------------------------------------------------------- the baked material on the runtime mesh
    out = bpy.data.materials.new("cr_" + name)
    out.use_nodes = True
    nt = out.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    uvn = nt.nodes.new("ShaderNodeUVMap"); uvn.uv_map = "bake"
    tc = nt.nodes.new("ShaderNodeTexImage"); tc.image = imgs["col"]
    tr = nt.nodes.new("ShaderNodeTexImage"); tr.image = imgs["rgh"]
    tn = nt.nodes.new("ShaderNodeTexImage"); tn.image = imgs["nrm"]
    nm = nt.nodes.new("ShaderNodeNormalMap"); nm.uv_map = "bake"
    for t in (tc, tr, tn):
        nt.links.new(uvn.outputs["UV"], t.inputs["Vector"])
    nt.links.new(tc.outputs["Color"], bsdf.inputs["Base Color"])
    nt.links.new(tr.outputs["Color"], bsdf.inputs["Roughness"])
    nt.links.new(tn.outputs["Color"], nm.inputs["Color"])
    nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
    bsdf.inputs["Metallic"].default_value = 0.0
    idx = len(me.materials)
    me.materials.append(out)
    # translucent tissues share the maps through a second material carrying their opacity in its name
    trans = {}
    for i, mname in slots.items():
        op = looks[mname].opacity
        if op is not None:
            key = int(round(op * 100))
            if key not in trans:
                t = out.copy()
                t.name = f"crt{key:02d}_{name}"
                trans[key] = len(me.materials)
                me.materials.append(t)
    for poly in me.polygons:
        if poly.material_index in slots:
            op = looks[slots[poly.material_index]].opacity
            poly.material_index = trans[int(round(op * 100))] if op is not None else idx
    # the sculpt is only a bake source
    hmesh = hi.data
    bpy.data.objects.remove(hi)
    bpy.data.meshes.remove(hmesh)
    for img in imgs.values():
        img.pack()
    return imgs
