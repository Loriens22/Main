"""Core helpers: scene, materials, bmesh primitives, curves, assemblies, export."""

from __future__ import annotations

import math
import os
from pathlib import Path

import bpy  # noqa: I001  (bpy must be imported before bmesh)
import bmesh
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[2]
OUT_MODELS = ROOT / "web" / "public" / "models"
OUT_RENDERS = ROOT / "web" / "public" / "renders"
TEX_DIR = ROOT / "blender" / "textures"
FONT_BOLD = "/usr/share/fonts/opentype/inter/Inter-SemiBold.otf"
FONT_MONO = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"


# ---------------------------------------------------------------------- scene
def reset_scene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.unit_settings.system = "METRIC"
    sc.unit_settings.scale_length = 1.0


def link(obj, parent=None):
    bpy.context.scene.collection.objects.link(obj)
    if parent is not None:
        obj.parent = parent
    return obj


def empty(name: str, parent=None, location=(0, 0, 0), component: str | None = None,
          explode=(0, 0, 0), label: str | None = None):
    """Component node. ``explode`` is given in Blender Z-up coordinates and stored as glTF Y-up extras."""
    e = bpy.data.objects.new(name, None)
    e.location = location
    if component:
        e["component"] = component
        x, y, z = explode
        e["explode"] = [x, z, -y]  # glTF/three.js coordinates (Y-up)
        if label:
            e["label"] = label
    return link(e, parent)


# ------------------------------------------------------------------ materials
_MATS: dict[str, bpy.types.Material] = {}


def _image(path: Path, non_color=False):
    img = bpy.data.images.load(str(path), check_existing=True)
    if non_color:
        img.colorspace_settings.name = "Non-Color"
    return img


def material(name: str, color=(0.8, 0.8, 0.8), metallic=0.0, roughness=0.5, emission=None,
             emission_strength=0.0, base_tex: Path | None = None, mr_tex: Path | None = None,
             normal_tex: Path | None = None, normal_strength=1.0, alpha=1.0, transmission=0.0,
             clearcoat=0.0, specular=0.5):
    if name in _MATS:
        return _MATS[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = specular
    if clearcoat and "Coat Weight" in bsdf.inputs:
        bsdf.inputs["Coat Weight"].default_value = clearcoat
        bsdf.inputs["Coat Roughness"].default_value = 0.08
    if transmission and "Transmission Weight" in bsdf.inputs:
        bsdf.inputs["Transmission Weight"].default_value = transmission
    if emission is not None:
        bsdf.inputs["Emission Color"].default_value = (*emission, 1.0)
        bsdf.inputs["Emission Strength"].default_value = emission_strength
    if alpha < 1.0:
        bsdf.inputs["Alpha"].default_value = alpha
        try:
            m.surface_render_method = "BLENDED"
        except Exception:  # noqa: BLE001
            pass
    if base_tex:
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image = _image(base_tex)
        nt.links.new(t.outputs["Color"], bsdf.inputs["Base Color"])
    if mr_tex:
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image = _image(mr_tex, non_color=True)
        sep = nt.nodes.new("ShaderNodeSeparateColor")
        nt.links.new(t.outputs["Color"], sep.inputs["Color"])
        nt.links.new(sep.outputs["Green"], bsdf.inputs["Roughness"])
        nt.links.new(sep.outputs["Blue"], bsdf.inputs["Metallic"])
    if normal_tex:
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image = _image(normal_tex, non_color=True)
        nm = nt.nodes.new("ShaderNodeNormalMap")
        nm.inputs["Strength"].default_value = normal_strength
        nt.links.new(t.outputs["Color"], nm.inputs["Color"])
        nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
    _MATS[name] = m
    return m


def materials() -> dict[str, bpy.types.Material]:
    """PBR library. Values are physically motivated (measured-albedo style)."""
    from .textures import brushed_normal, knurl_normal

    bn = brushed_normal()
    kn = knurl_normal()
    M = {
        "gold": material("Gold plating (polished)", (1.0, 0.766, 0.336), 1.0, 0.18),
        "gold_satin": material("Gold plating (satin)", (1.0, 0.75, 0.34), 1.0, 0.34, normal_tex=bn, normal_strength=0.25),
        "copper": material("OFHC copper", (0.955, 0.638, 0.538), 1.0, 0.28, normal_tex=bn, normal_strength=0.3),
        "copper_dark": material("Copper (oxidised, 50 K)", (0.62, 0.38, 0.30), 1.0, 0.42),
        "stainless": material("Stainless steel 304", (0.78, 0.77, 0.76), 1.0, 0.30, normal_tex=bn, normal_strength=0.45),
        "aluminum": material("Aluminium 6061", (0.91, 0.92, 0.92), 1.0, 0.36, normal_tex=bn, normal_strength=0.5),
        "alu_shield": material("Aluminium radiation shield", (0.88, 0.89, 0.90), 1.0, 0.24, normal_tex=bn, normal_strength=0.35),
        "anodized": material("Black anodised aluminium", (0.025, 0.026, 0.03), 0.7, 0.42),
        "rack": material("Powder-coated steel", (0.06, 0.065, 0.075), 0.2, 0.55),
        "g10": material("G-10 fibreglass", (0.60, 0.64, 0.40), 0.0, 0.52, specular=0.4),
        "ptfe": material("PTFE dielectric", (0.93, 0.93, 0.90), 0.0, 0.55),
        "ceramic": material("Alumina ceramic", (0.94, 0.93, 0.89), 0.0, 0.45),
        "eccosorb": material("Eccosorb absorber", (0.03, 0.03, 0.03), 0.0, 0.7),
        "coax": material("CuNi semi-rigid coax", (0.74, 0.70, 0.66), 1.0, 0.33),
        "nbti": material("NbTi superconducting coax", (0.66, 0.67, 0.70), 1.0, 0.30),
        "kapton": material("Polyimide flex", (0.78, 0.42, 0.06), 0.0, 0.32, clearcoat=0.6, specular=0.6),
        "black": material("Black polymer", (0.02, 0.02, 0.022), 0.0, 0.5),
        "rubber": material("Rubber hose", (0.015, 0.015, 0.018), 0.0, 0.75),
        "braided": material("Braided steel hose", (0.7, 0.7, 0.7), 1.0, 0.45, normal_tex=kn, normal_strength=0.8),
        "cryoperm": material("Cryoperm magnetic shield", (0.55, 0.57, 0.60), 1.0, 0.48),
        "indium": material("Indium", (0.78, 0.78, 0.80), 1.0, 0.5),
        "film": material("Tantalum film", (0.82, 0.82, 0.85), 1.0, 0.28),
        "silicon": material("Silicon die", (0.05, 0.055, 0.07), 0.35, 0.12),
        "pcb": material("Microwave PCB (Rogers / soldermask)", (0.03, 0.17, 0.42), 0.0, 0.32, clearcoat=0.4),
        "led_green": material("LED green", (0.1, 0.9, 0.4), 0.0, 0.3, emission=(0.2, 1.0, 0.5), emission_strength=8.0),
        "led_blue": material("LED blue", (0.2, 0.5, 1.0), 0.0, 0.3, emission=(0.25, 0.55, 1.0), emission_strength=8.0),
        "led_amber": material("LED amber", (1.0, 0.6, 0.1), 0.0, 0.3, emission=(1.0, 0.55, 0.1), emission_strength=6.0),
        "screen": material("Display glass", (0.01, 0.015, 0.03), 0.0, 0.08, emission=(0.12, 0.35, 0.9), emission_strength=1.2),
        "glass": material("Viewport glass", (0.9, 0.95, 1.0), 0.0, 0.05, alpha=0.25),
        "floor": material("Epoxy lab floor", (0.18, 0.19, 0.21), 0.0, 0.42),
        "label_dark": material("Engraved fill", (0.04, 0.04, 0.045), 0.3, 0.5),
        "brass": material("Brass", (0.91, 0.78, 0.42), 1.0, 0.3),
    }
    return M


# ------------------------------------------------------------- mesh builders
def _finish(bm: bmesh.types.BMesh, smooth_angle: float | None = 35.0, uv_scale: float | None = None):
    if uv_scale:
        box_uv(bm, uv_scale)
    bm.normal_update()
    if smooth_angle is not None:
        lim = math.radians(smooth_angle)
        for f in bm.faces:
            f.smooth = True
        for e in bm.edges:
            if len(e.link_faces) == 2 and e.calc_face_angle(0) > lim:
                e.smooth = False
            elif len(e.link_faces) != 2:
                e.smooth = False


def box_uv(bm, scale=10.0):
    uv = bm.loops.layers.uv.verify()
    for f in bm.faces:
        n = f.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        for l in f.loops:
            co = l.vert.co
            if ax == 0:
                l[uv].uv = (co.y * scale, co.z * scale)
            elif ax == 1:
                l[uv].uv = (co.x * scale, co.z * scale)
            else:
                l[uv].uv = (co.x * scale, co.y * scale)


def cylinder(r=0.01, depth=0.02, segments=32, r2=None, matrix=None, smooth=35.0, uv=8.0):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segments, radius1=r,
                          radius2=r if r2 is None else r2, depth=depth, calc_uvs=False)
    if matrix is not None:
        bmesh.ops.transform(bm, matrix=matrix, verts=bm.verts)
    _finish(bm, smooth, uv)
    return bm


def tube(r_out, r_in, depth, segments=48, matrix=None, uv=6.0):
    """Hollow cylinder (ring) built analytically."""
    bm = bmesh.new()
    vs = []
    for z in (-depth / 2, depth / 2):
        for r in (r_out, r_in):
            ring = [bm.verts.new((r * math.cos(2 * math.pi * i / segments), r * math.sin(2 * math.pi * i / segments), z))
                    for i in range(segments)]
            vs.append(ring)
    ob, ib, ot, it = vs
    for i in range(segments):
        j = (i + 1) % segments
        bm.faces.new((ob[i], ob[j], ot[j], ot[i]))
        bm.faces.new((ib[j], ib[i], it[i], it[j]))
        bm.faces.new((ot[i], ot[j], it[j], it[i]))
        bm.faces.new((ob[j], ob[i], ib[i], ib[j]))
    if matrix is not None:
        bmesh.ops.transform(bm, matrix=matrix, verts=bm.verts)
    _finish(bm, 35.0, uv)
    return bm


def box(sx, sy, sz, matrix=None, bevel=0.0, uv=10.0, segments=2):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=(sx, sy, sz), verts=bm.verts)
    if bevel > 0:
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=min(bevel, 0.49 * min(sx, sy, sz)), segments=segments,
                        affect="EDGES", profile=0.5)
    if matrix is not None:
        bmesh.ops.transform(bm, matrix=matrix, verts=bm.verts)
    _finish(bm, 40.0, uv)
    return bm


def sphere(r, segments=16, rings=8, matrix=None):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segments, v_segments=rings, radius=r)
    if matrix is not None:
        bmesh.ops.transform(bm, matrix=matrix, verts=bm.verts)
    _finish(bm, 80.0, None)
    return bm


def hex_prism(r, depth, matrix=None):
    return cylinder(r, depth, segments=6, matrix=matrix, smooth=20.0)


def T(x=0.0, y=0.0, z=0.0, rx=0.0, ry=0.0, rz=0.0, s=1.0) -> Matrix:
    m = Matrix.Translation((x, y, z))
    if rz:
        m = m @ Matrix.Rotation(rz, 4, "Z")
    if ry:
        m = m @ Matrix.Rotation(ry, 4, "Y")
    if rx:
        m = m @ Matrix.Rotation(rx, 4, "X")
    if s != 1.0:
        m = m @ Matrix.Scale(s, 4)
    return m


# --------------------------------------------------------- 2D profile solids
def rounded_rect_pts(w, h, r, cx=0.0, cy=0.0, seg=8):
    r = min(r, w / 2 - 1e-6, h / 2 - 1e-6)
    pts = []
    for (ox, oy, a0) in ((w / 2 - r, h / 2 - r, 0), (-w / 2 + r, h / 2 - r, 90), (-w / 2 + r, -h / 2 + r, 180), (w / 2 - r, -h / 2 + r, 270)):
        for i in range(seg + 1):
            a = math.radians(a0 + 90 * i / seg)
            pts.append((cx + ox + r * math.cos(a), cy + oy + r * math.sin(a)))
    return pts


def circle_pts(r, cx=0.0, cy=0.0, seg=32):
    return [(cx + r * math.cos(2 * math.pi * i / seg), cy + r * math.sin(2 * math.pi * i / seg)) for i in range(seg)]


def profile_solid(loops: list[list[tuple[float, float]]], thickness: float, bevel=0.0, z=0.0, uv=None,
                  bevel_res=1) -> bmesh.types.BMesh:
    """Extrude a set of closed 2D loops (outer + holes, even-odd fill) into a solid with chamfered edges."""
    cu = bpy.data.curves.new("prof", "CURVE")
    cu.dimensions = "2D"
    cu.fill_mode = "BOTH"
    cu.extrude = max(thickness / 2 - bevel, 1e-6)
    cu.bevel_depth = bevel
    cu.bevel_resolution = bevel_res
    for loop in loops:
        s = cu.splines.new("POLY")
        s.points.add(len(loop) - 1)
        for p, (x, y) in zip(s.points, loop):
            p.co = (x, y, 0, 1)
        s.use_cyclic_u = True
    ob = bpy.data.objects.new("prof", cu)
    bpy.context.scene.collection.objects.link(ob)
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    bpy.data.objects.remove(ob)
    bpy.data.curves.remove(cu)
    bm = bmesh.new()
    bm.from_mesh(me)
    bpy.data.meshes.remove(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-7)
    bmesh.ops.translate(bm, vec=(0, 0, z), verts=bm.verts)
    _finish(bm, 30.0, uv)
    return bm


def curve_tube(points, radius, closed=False, res_u=4, bevel_res=2, ribbon_width=0.0, tilt=0.0):
    """Polyline path -> swept tube (or flat ribbon if ribbon_width > 0)."""
    cu = bpy.data.curves.new("path", "CURVE")
    cu.dimensions = "3D"
    cu.resolution_u = res_u
    if ribbon_width > 0:
        cu.extrude = ribbon_width / 2
        cu.bevel_depth = radius
        cu.bevel_resolution = 0
    else:
        cu.bevel_depth = radius
        cu.bevel_resolution = bevel_res
    cu.use_fill_caps = True
    s = cu.splines.new("BEZIER")
    s.bezier_points.add(len(points) - 1)
    for bp, p in zip(s.bezier_points, points):
        bp.co = p
        bp.handle_left_type = bp.handle_right_type = "AUTO"
        bp.tilt = tilt
    s.use_cyclic_u = closed
    ob = bpy.data.objects.new("path", cu)
    bpy.context.scene.collection.objects.link(ob)
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    bpy.data.objects.remove(ob)
    bpy.data.curves.remove(cu)
    bm = bmesh.new()
    bm.from_mesh(me)
    bpy.data.meshes.remove(me)
    _finish(bm, 50.0, 20.0)
    return bm


def text_mesh(body: str, size: float, depth: float, font=FONT_BOLD, align="CENTER", matrix=None):
    cu = bpy.data.curves.new("txt", "FONT")
    cu.body = body
    cu.font = bpy.data.fonts.load(font, check_existing=True)
    cu.size = size
    cu.extrude = depth / 2
    cu.align_x = align
    cu.align_y = "CENTER"
    cu.resolution_u = 3
    ob = bpy.data.objects.new("txt", cu)
    bpy.context.scene.collection.objects.link(ob)
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    bpy.data.objects.remove(ob)
    bpy.data.curves.remove(cu)
    bm = bmesh.new()
    bm.from_mesh(me)
    bpy.data.meshes.remove(me)
    if matrix is not None:
        bmesh.ops.transform(bm, matrix=matrix, verts=bm.verts)
    _finish(bm, 30.0, None)
    return bm


# ----------------------------------------------------------------- assemblies
class Assembly:
    """Accumulates geometry per material and emits one mesh object per material under a component node."""

    uv_scale = 5.0  # texture repeats per unit length; packages built in mm set 0.05

    def __init__(self, name: str, parent=None, location=(0, 0, 0), component: str | None = None,
                 explode=(0, 0, 0), label: str | None = None):
        self.name = name
        self.node = empty(name, parent, location, component, explode, label)
        self.parts: dict[str, bmesh.types.BMesh] = {}
        self.mats: dict[str, bpy.types.Material] = {}

    def add(self, bm: bmesh.types.BMesh, mat: bpy.types.Material, matrix: Matrix | None = None):
        if matrix is not None:
            bmesh.ops.transform(bm, matrix=matrix, verts=bm.verts)
        key = mat.name
        textured = mat.node_tree and any(n.type == "TEX_IMAGE" for n in mat.node_tree.nodes)
        if textured and not bm.loops.layers.uv:
            box_uv(bm, Assembly.uv_scale)
        if key not in self.parts:
            self.parts[key] = bmesh.new()
            self.mats[key] = mat
        tmp = bpy.data.meshes.new("tmp")
        bm.to_mesh(tmp)
        self.parts[key].from_mesh(tmp)
        bpy.data.meshes.remove(tmp)
        bm.free()
        return self

    def build(self):
        out = []
        for key, bm in self.parts.items():
            me = bpy.data.meshes.new(f"{self.name}_{key}")
            bm.to_mesh(me)
            bm.free()
            textured = any(n.type == "TEX_IMAGE" for n in self.mats[key].node_tree.nodes)
            if not textured:
                while me.uv_layers:
                    me.uv_layers.remove(me.uv_layers[0])
            me.materials.append(self.mats[key])
            ob = bpy.data.objects.new(f"{self.name}:{key}", me)
            link(ob, self.node)
            out.append(ob)
        self.parts.clear()
        return self.node


def instances(name: str, bm: bmesh.types.BMesh, mat, matrices: list[Matrix], parent):
    """Linked duplicates sharing one mesh under one parent -> exported as EXT_mesh_gpu_instancing."""
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat)
    grp = empty(f"{name}_instances", parent)
    for i, m in enumerate(matrices):
        ob = bpy.data.objects.new(f"{name}.{i:04d}", me)
        ob.matrix_basis = m
        link(ob, grp)
    return grp


# --------------------------------------------------------------------- export
def export_glb(path: Path, image_format="WEBP", selection=None):
    path.parent.mkdir(parents=True, exist_ok=True)
    kwargs = dict(filepath=str(path), export_format="GLB", export_extras=True, export_gpu_instances=True,
                  export_apply=True, export_yup=True, export_image_format=image_format,
                  export_cameras=False, export_lights=False)
    try:
        bpy.ops.export_scene.gltf(**kwargs, export_image_quality=88)
    except TypeError:
        bpy.ops.export_scene.gltf(**kwargs)
    return os.path.getsize(path)


def stats() -> dict:
    tris = 0
    seen = set()
    inst = 0
    for ob in bpy.data.objects:
        if ob.type == "MESH":
            inst += 1
            if ob.data.name in seen:
                continue
            seen.add(ob.data.name)
            ob.data.calc_loop_triangles()
            tris += len(ob.data.loop_triangles)
    return {"unique_triangles": tris, "mesh_objects": inst, "unique_meshes": len(seen)}
