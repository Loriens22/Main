"""
Painted texture maps for creatures: each body gets a non-overlapping UV atlas, and an anatomy-aware "paint" shader is
baked (Cycles, EMIT) into one colour map per creature, exported inside the GLB as JPEG. The runtime keeps the map on
the creature's materials (src/render/Materials.ts) and adds only fine relief on top (src/render/CreatureSkin.ts).

The paint is evaluated per material from PAINT[name] = {"base": (r, g, b), "layers": [...]}:
  ("noise",  col, amt, size, lo, hi, stretch, warp)   soft blotches (size m; lo..hi threshold; stretch per axis)
  ("spots",  col, amt, size, radius, density)          discrete round spots, some cells only
  ("retic",  col, amt, size, width)                    a net of lines along cell borders
  ("streak", col, amt, size, axis, lo, hi)             bands stretched along an object axis ('x', 'y', 'z')
  ("speck",  col, amt, size, thresh)                   fine speckle
  ("back",   col, amt)  /  ("belly", col, amt)          by world-normal z (countershading)
  ("grad",   col, amt, axis, a, b)                      a gradient along an object axis from a to b (m)
  ("edge",   col, amt)  /  ("cavity", col, amt)         by convexity (Cycles Pointiness): worn ridges, grimy folds
  ("ao",     strength, distance)                        baked occlusion multiplied in
Blender +Y forward, +Z up.
"""
import os
import bpy
import kit

PAINT = {}


def _n(nt, kind, loc=(0, 0), **props):
    n = nt.nodes.new(kind)
    n.location = loc
    for k, v in props.items():
        setattr(n, k, v)
    return n


def _sock(coll, ident):
    for s in coll:
        if s.identifier == ident:
            return s
    raise KeyError(ident)


def _mix(nt, a_out, col, fac_out, amt, blend="MIX"):
    m = _n(nt, "ShaderNodeMix", data_type="RGBA", blend_type=blend)
    m.clamp_factor = True
    fac = _sock(m.inputs, "Factor_Float")
    if fac_out is None:
        fac.default_value = amt
    else:
        mul = _n(nt, "ShaderNodeMath", operation="MULTIPLY")
        mul.use_clamp = True
        nt.links.new(fac_out, mul.inputs[0])
        mul.inputs[1].default_value = amt
        nt.links.new(mul.outputs[0], fac)
    nt.links.new(a_out, _sock(m.inputs, "A_Color"))
    if isinstance(col, (tuple, list)):
        _sock(m.inputs, "B_Color").default_value = tuple(col[:3]) + (1.0,)
    else:
        nt.links.new(col, _sock(m.inputs, "B_Color"))
    return _sock(m.outputs, "Result_Color")


def _ramp(nt, fac_out, lo, hi):
    r = _n(nt, "ShaderNodeMapRange", clamp=True)
    nt.links.new(fac_out, r.inputs["Value"])
    r.inputs["From Min"].default_value = lo
    r.inputs["From Max"].default_value = hi
    return r.outputs["Result"]


def _coords(nt, stretch=(1, 1, 1), warp=0.0, seed=0.0):
    tc = _n(nt, "ShaderNodeTexCoord")
    mp = _n(nt, "ShaderNodeMapping")
    mp.inputs["Scale"].default_value = stretch
    mp.inputs["Location"].default_value = (seed * 3.17, seed * 1.31, seed * 2.07)
    nt.links.new(tc.outputs["Object"], mp.inputs["Vector"])
    return mp.outputs["Vector"]


def build_paint(mat, spec, image, seed=0):
    """replace the material's nodes with the paint (emission) and an active image node to bake into"""
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = _n(nt, "ShaderNodeOutputMaterial")
    em = _n(nt, "ShaderNodeEmission")
    rgb = _n(nt, "ShaderNodeRGB")
    rgb.outputs[0].default_value = tuple(spec.get("base", (0.5, 0.5, 0.5))[:3]) + (1.0,)
    col = rgb.outputs[0]
    geo = _n(nt, "ShaderNodeNewGeometry")
    sep = _n(nt, "ShaderNodeSeparateXYZ")
    nt.links.new(geo.outputs["Normal"], sep.inputs[0])
    k = 0
    for L in spec.get("layers", []):
        kind = L[0]
        k += 1
        if kind == "noise":
            _, c, amt, size, lo, hi = L[:6]
            stretch = L[6] if len(L) > 6 else (1, 1, 1)
            warp = L[7] if len(L) > 7 else 0.6
            v = _coords(nt, stretch, seed=seed + k)
            nz = _n(nt, "ShaderNodeTexNoise")
            nz.inputs["Scale"].default_value = 1.0 / size
            nz.inputs["Detail"].default_value = 6.0
            nz.inputs["Roughness"].default_value = 0.58
            nz.inputs["Distortion"].default_value = warp
            nt.links.new(v, nz.inputs["Vector"])
            col = _mix(nt, col, c, _ramp(nt, nz.outputs["Fac"], lo, hi), amt)
        elif kind == "spots":
            _, c, amt, size, radius, density = L
            v = _coords(nt, seed=seed + k)
            # warp the cells a little so spots are not on a lattice
            wn = _n(nt, "ShaderNodeTexNoise")
            wn.inputs["Scale"].default_value = 0.6 / size
            nt.links.new(v, wn.inputs["Vector"])
            add = _n(nt, "ShaderNodeVectorMath", operation="MULTIPLY_ADD")
            nt.links.new(wn.outputs["Color"], add.inputs[0])
            add.inputs[1].default_value = (size * 0.6,) * 3
            nt.links.new(v, add.inputs[2])
            vo = _n(nt, "ShaderNodeTexVoronoi", feature="F1")
            vo.inputs["Scale"].default_value = 1.0 / size
            nt.links.new(add.outputs[0], vo.inputs["Vector"])
            d = _ramp(nt, vo.outputs["Distance"], radius, radius * 0.7)
            sel = _n(nt, "ShaderNodeSeparateColor")
            nt.links.new(vo.outputs["Color"], sel.inputs[0])
            gate = _ramp(nt, sel.outputs[0], 1.0 - density, 1.0 - density + 0.001)
            mul = _n(nt, "ShaderNodeMath", operation="MULTIPLY")
            nt.links.new(d, mul.inputs[0])
            nt.links.new(gate, mul.inputs[1])
            col = _mix(nt, col, c, mul.outputs[0], amt)
        elif kind == "retic":
            _, c, amt, size, width = L
            v = _coords(nt, seed=seed + k)
            wn = _n(nt, "ShaderNodeTexNoise")
            wn.inputs["Scale"].default_value = 0.7 / size
            nt.links.new(v, wn.inputs["Vector"])
            add = _n(nt, "ShaderNodeVectorMath", operation="MULTIPLY_ADD")
            nt.links.new(wn.outputs["Color"], add.inputs[0])
            add.inputs[1].default_value = (size * 0.8,) * 3
            nt.links.new(v, add.inputs[2])
            vo = _n(nt, "ShaderNodeTexVoronoi", feature="DISTANCE_TO_EDGE")
            vo.inputs["Scale"].default_value = 1.0 / size
            nt.links.new(add.outputs[0], vo.inputs["Vector"])
            col = _mix(nt, col, c, _ramp(nt, vo.outputs["Distance"], width, width * 0.4), amt)
        elif kind == "streak":
            _, c, amt, size, axis, lo, hi = L
            st = {"x": (0.08, 1, 1), "y": (1, 0.08, 1), "z": (1, 1, 0.08)}[axis]
            v = _coords(nt, st, seed=seed + k)
            nz = _n(nt, "ShaderNodeTexNoise")
            nz.inputs["Scale"].default_value = 1.0 / size
            nz.inputs["Detail"].default_value = 4.0
            nz.inputs["Distortion"].default_value = 0.3
            nt.links.new(v, nz.inputs["Vector"])
            col = _mix(nt, col, c, _ramp(nt, nz.outputs["Fac"], lo, hi), amt)
        elif kind == "speck":
            _, c, amt, size, thresh = L
            v = _coords(nt, seed=seed + k)
            nz = _n(nt, "ShaderNodeTexNoise")
            nz.inputs["Scale"].default_value = 1.0 / size
            nz.inputs["Detail"].default_value = 2.0
            nt.links.new(v, nz.inputs["Vector"])
            col = _mix(nt, col, c, _ramp(nt, nz.outputs["Fac"], thresh, thresh + 0.05), amt)
        elif kind in ("back", "belly"):
            _, c, amt = L
            fac = _ramp(nt, sep.outputs["Z"], 0.2, 0.85) if kind == "back" else _ramp(nt, sep.outputs["Z"], 0.1, -0.65)
            col = _mix(nt, col, c, fac, amt)
        elif kind == "grad":
            _, c, amt, axis, a, b = L
            tc = _n(nt, "ShaderNodeTexCoord")
            sp = _n(nt, "ShaderNodeSeparateXYZ")
            nt.links.new(tc.outputs["Object"], sp.inputs[0])
            col = _mix(nt, col, c, _ramp(nt, sp.outputs[axis.upper()], a, b), amt)
        elif kind in ("edge", "cavity"):
            _, c, amt = L
            # only clearly convex ridges / clearly concave folds (thin plates read convex all along their rims)
            fac = _ramp(nt, geo.outputs["Pointiness"], 0.56, 0.7) if kind == "edge" else _ramp(nt, geo.outputs["Pointiness"], 0.46, 0.36)
            col = _mix(nt, col, c, fac, amt)
        elif kind == "ao":
            _, strength, dist = L
            ao = _n(nt, "ShaderNodeAmbientOcclusion")
            ao.samples = 12
            ao.inputs["Distance"].default_value = dist
            f = _n(nt, "ShaderNodeMapRange", clamp=True)
            nt.links.new(ao.outputs["AO"], f.inputs["Value"])
            f.inputs["To Min"].default_value = 1.0 - strength
            f.inputs["To Max"].default_value = 1.0
            mm = _n(nt, "ShaderNodeMix", data_type="RGBA", blend_type="MULTIPLY")
            _sock(mm.inputs, "Factor_Float").default_value = 1.0
            nt.links.new(col, _sock(mm.inputs, "A_Color"))
            nt.links.new(f.outputs["Result"], _sock(mm.inputs, "B_Color"))
            col = _sock(mm.outputs, "Result_Color")
    nt.links.new(col, em.inputs["Color"])
    nt.links.new(em.outputs[0], out.inputs["Surface"])
    img = _n(nt, "ShaderNodeTexImage")
    img.image = image
    img.select = True
    nt.nodes.active = img
    return mat


def export_nodes(mat, image, baked, base=None):
    """after the bake: a plain Principled material the glTF exporter understands (the runtime takes only the map)"""
    nt = mat.node_tree
    nt.nodes.clear()
    out = _n(nt, "ShaderNodeOutputMaterial")
    bsdf = _n(nt, "ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs[0], out.inputs["Surface"])
    if baked:
        img = _n(nt, "ShaderNodeTexImage")
        img.image = image
        nt.links.new(img.outputs["Color"], bsdf.inputs["Base Color"])
    elif base is not None:
        bsdf.inputs["Base Color"].default_value = tuple(base[:3]) + (1.0,)


def bake_body(o, name, size=1024, samples=6, skip=()):
    """UV atlas + paint bake for every material of `o` that has a PAINT spec; returns the image"""
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = samples
    try:
        sc.cycles.use_denoising = False
    except Exception:
        pass
    # the atlas: the one UV map (glTF TEXCOORD_0)
    me = o.data
    while me.uv_layers:
        me.uv_layers.remove(me.uv_layers[0])
    me.uv_layers.new(name="atlas")
    for ob in list(bpy.data.objects):
        if ob is not None and ob.name in bpy.context.view_layer.objects:
            ob.select_set(False)
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=1.15, island_margin=0.002, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
    # one texel density over the whole body, then a tight pack (rotated islands, concave shapes)
    bpy.ops.uv.select_all(action="SELECT")
    bpy.ops.uv.average_islands_scale()
    try:
        bpy.ops.uv.pack_islands(udim_source="CLOSEST_UDIM", rotate=True, margin_method="FRACTION", margin=0.0015, shape_method="CONCAVE")
    except TypeError:
        bpy.ops.uv.pack_islands(rotate=True, margin=0.0015)
    bpy.ops.object.mode_set(mode="OBJECT")
    img = bpy.data.images.new(f"{name}_paint", size, size, alpha=False)
    img.colorspace_settings.name = "sRGB"
    baked = []
    for i, m in enumerate(me.materials):
        if m is None:
            continue
        spec = PAINT.get(m.name)
        if spec is None or m.name in skip:
            # keep it bakeable (the bake needs an active image in every material) but paint it its flat colour
            spec = {"base": kit.PALETTE.get(m.name, {}).get("color", (0.5, 0.5, 0.5)), "layers": []}
        else:
            baked.append(m.name)
        build_paint(m, spec, img, seed=i)
    sc.render.bake.target = "IMAGE_TEXTURES"
    sc.render.bake.margin = 6
    sc.render.bake.use_clear = True
    bpy.ops.object.bake(type="EMIT")
    for m in me.materials:
        if m is None:
            continue
        export_nodes(m, img, m.name in baked, kit.PALETTE.get(m.name, {}).get("color"))
    img.pack()
    print(f"[paint] {name}: {size}px, baked {len(baked)} of {len(me.materials)} materials")
    return img
