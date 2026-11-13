"""Procedural hard-surface modelling toolkit for headless Blender (bpy as a module).

Conventions
-----------
* Units are metres. Blender axes: +X right, +Y forward, +Z up. The glTF exporter converts to
  Y-up, so in the engine forward is -Z and up is +Y.
* A `Part` accumulates geometry (one mesh, many material slots). Primitives are bevelled and
  box-UV-mapped in their own local space (1 UV unit = 1 metre) before being transformed, so
  tiling textures follow each piece and keep a constant texel density.
* Material names come from shared/materials.json; the engine swaps them for shared PBR materials.
* Semantics for the engine travel as custom properties (glTF extras -> Object3D.userData).
"""
from __future__ import annotations

import json
import math
import os
import time

import bpy  # must be imported before bmesh / mathutils when running as a module
import bmesh
from mathutils import Euler, Matrix, Quaternion, Vector
from mathutils.geometry import tessellate_polygon

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
MODELS = os.path.join(ROOT, "public", "assets", "models")
BLEND_DIR = os.path.join(ROOT, "blender", "scenes")
PREVIEW_DIR = os.path.join(ROOT, "blender", "previews")
with open(os.path.join(ROOT, "shared", "materials.json")) as _f:
    MATERIAL_DB = {k: v for k, v in json.load(_f).items() if not k.startswith("_")}

D = math.radians
_SCRATCH = None
_TEX_AVG = {}


# ----------------------------------------------------------------------------- scene
def reset():
    global _SCRATCH
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.unit_settings.system = "METRIC"
    _SCRATCH = None
    return sc


def scratch_mesh():
    global _SCRATCH
    if _SCRATCH is None or _SCRATCH.name not in bpy.data.meshes:
        _SCRATCH = bpy.data.meshes.new("_scratch")
    return _SCRATCH


def link(obj, parent=None):
    if obj.name not in bpy.context.scene.collection.objects:
        bpy.context.scene.collection.objects.link(obj)
    if parent is not None:
        obj.parent = parent
    return obj


def xf(at=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1)):
    """Matrix from location, XYZ euler in degrees, scale."""
    if isinstance(scale, (int, float)):
        scale = (scale, scale, scale)
    return Matrix.LocRotScale(Vector(at), Euler((D(rot[0]), D(rot[1]), D(rot[2])), "XYZ"), Vector(scale))


# ----------------------------------------------------------------------------- materials
def _hex(c):
    c = c.lstrip("#")
    return tuple(int(c[i:i + 2], 16) / 255 for i in (0, 2, 4))


def _srgb_to_lin(c):
    return tuple((v / 12.92) if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in c)


def _tex_avg(tex):
    if tex in _TEX_AVG:
        return _TEX_AVG[tex]
    avg = (0.75, 0.75, 0.75)
    p = os.path.join(ROOT, "public", "assets", "textures", f"{tex}_albedo.webp")
    try:
        from PIL import Image
        im = Image.open(p).convert("RGB").resize((8, 8))
        px = list(im.getdata())
        avg = tuple(sum(q[i] for q in px) / len(px) / 255 for i in range(3))
    except Exception:
        pass
    _TEX_AVG[tex] = avg
    return avg


def mat(name):
    """Get/create a Blender material for a name in shared/materials.json (preview shading only)."""
    m = bpy.data.materials.get(name)
    if m:
        return m
    spec = MATERIAL_DB.get(name)
    if spec is None:
        raise KeyError(f"material '{name}' is not defined in shared/materials.json")
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    col = _hex(spec.get("color", "#ffffff"))
    if spec.get("tex"):
        a = _tex_avg(spec["tex"])
        col = tuple(col[i] * a[i] for i in range(3))
    lin = _srgb_to_lin(col)
    bsdf.inputs["Base Color"].default_value = (*lin, 1)
    rough = spec.get("rough", 0.6)
    bsdf.inputs["Roughness"].default_value = min(1.0, rough if not spec.get("tex") else 0.6 * rough)
    metal = spec.get("metal", 0.0)
    if spec.get("tex") in ("metal_bare", "metal_dark", "tread_plate", "thruster_metal"):
        metal = 0.9
    bsdf.inputs["Metallic"].default_value = min(1.0, metal)
    if spec.get("emissive"):
        e = _srgb_to_lin(_hex(spec["emissive"]))
        bsdf.inputs["Emission Color"].default_value = (*e, 1)
        bsdf.inputs["Emission Strength"].default_value = spec.get("emissiveIntensity", 1.0)
    if spec.get("kind") == "glass":
        bsdf.inputs["Alpha"].default_value = spec.get("opacity", 0.3)
        bsdf.inputs["Roughness"].default_value = spec.get("rough", 0.05)
        try:
            m.surface_render_method = "BLENDED"
        except Exception:
            pass
    return m


# ----------------------------------------------------------------------------- Part
class Part:
    """Accumulates primitives into a single mesh with multiple material slots."""

    def __init__(self, name, **props):
        self.name = name
        self.bm = bmesh.new()
        self.uv = self.bm.loops.layers.uv.new("UVMap")
        self.slots = []
        self.props = props
        self.default_bevel = 0.0

    # -- internals
    def _slot(self, name):
        if name not in self.slots:
            mat(name)
            self.slots.append(name)
        return self.slots.index(name)

    def _emit(self, tb, mat_name, M=None, uv_scale=1.0, uv_swap=False, smooth=True, uv_mode="box", uv_off=(0, 0)):
        """Box-UV the temp bmesh in local space, transform, and append into the part."""
        # the layer name must match the part's layer, otherwise from_mesh() appends a second UV set
        uvl = tb.loops.layers.uv.get("UVMap") or tb.loops.layers.uv.new("UVMap")
        idx = self._slot(mat_name) if mat_name is not None else None
        if uv_mode == "box":
            for f in tb.faces:
                n = f.normal
                ax, ay, az = abs(n.x), abs(n.y), abs(n.z)
                for l in f.loops:
                    c = l.vert.co
                    if az >= ax and az >= ay:
                        u, v = c.x, c.y
                    elif ax >= ay:
                        u, v = c.y, c.z
                    else:
                        u, v = c.x, c.z
                    if uv_swap:
                        u, v = v, u
                    l[uvl].uv = (u * uv_scale + uv_off[0], v * uv_scale + uv_off[1])
        for f in tb.faces:
            if idx is not None:
                f.material_index = idx
            f.smooth = smooth
        if M is not None:
            tb.transform(M)
            if M.determinant() < 0:
                bmesh.ops.reverse_faces(tb, faces=tb.faces[:])
        sm = scratch_mesh()
        tb.to_mesh(sm)
        tb.free()
        self.bm.from_mesh(sm)

    @staticmethod
    def _bevel(tb, width, segs=2, angle=25.0):
        if width <= 0:
            return
        tb.normal_update()
        lim = D(angle)
        edges = [e for e in tb.edges if len(e.link_faces) == 2 and e.calc_face_angle(0.0) > lim]
        if edges:
            bmesh.ops.bevel(tb, geom=edges, offset=width, offset_type="OFFSET", segments=segs,
                            profile=0.5, affect="EDGES", clamp_overlap=True)

    # -- primitives
    def box(self, size, at=(0, 0, 0), rot=(0, 0, 0), mat="paint_white", bevel=None, origin="center", M=None, **kw):
        """Axis-aligned box of `size` (x, y, z). origin: 'center' or 'bottom' (z=0 at base)."""
        tb = bmesh.new()
        bmesh.ops.create_cube(tb, size=1.0)
        sx, sy, sz = size
        for v in tb.verts:
            v.co.x *= sx
            v.co.y *= sy
            v.co.z *= sz
            if origin == "bottom":
                v.co.z += sz / 2
        b = self.default_bevel if bevel is None else bevel
        self._bevel(tb, min(b, min(sx, sy, sz) * 0.45), kw.pop("segs", 2))
        self._emit(tb, mat, M if M is not None else xf(at, rot), **kw)
        return self

    def cyl(self, r, h, at=(0, 0, 0), rot=(0, 0, 0), mat="metal_bare", segs=24, r2=None, bevel=None, caps=True,
            origin="center", M=None, arc=None, **kw):
        """Cylinder / cone along local Z. r2 = top radius."""
        tb = bmesh.new()
        r2 = r if r2 is None else r2
        bmesh.ops.create_cone(tb, cap_ends=caps, cap_tris=False, segments=segs, radius1=r, radius2=r2, depth=h)
        if origin == "bottom":
            for v in tb.verts:
                v.co.z += h / 2
        b = self.default_bevel if bevel is None else bevel
        if caps:
            self._bevel(tb, min(b, min(r, r2 if r2 > 0 else r, h) * 0.45), kw.pop("segs_b", 2), angle=40)
        self._emit(tb, mat, M if M is not None else xf(at, rot), **kw)
        return self

    def tube(self, r_out, r_in, h, at=(0, 0, 0), rot=(0, 0, 0), mat="metal_bare", segs=32, bevel=None, M=None, **kw):
        """Hollow cylinder (ring) along local Z."""
        prof = [(r_in, -h / 2), (r_out, -h / 2), (r_out, h / 2), (r_in, h / 2)]
        return self.lathe(prof, at=at, rot=rot, mat=mat, segs=segs, bevel=bevel, closed=True, M=M, **kw)

    def lathe(self, profile, at=(0, 0, 0), rot=(0, 0, 0), mat="metal_bare", segs=32, bevel=None, closed=False,
              M=None, sweep=360.0, **kw):
        """Revolve (r, z) profile around local Z. closed=True joins the last point to the first."""
        tb = bmesh.new()
        n = len(profile)
        full = abs(sweep - 360.0) < 1e-6
        steps = segs if full else segs + 1
        rings = []
        for i in range(steps):
            a = D(sweep) * i / segs
            ca, sa = math.cos(a), math.sin(a)
            rings.append([tb.verts.new((r * ca, r * sa, z)) for r, z in profile])
        m = n if closed else n - 1
        for i in range(segs):
            a, b = rings[i], rings[(i + 1) % steps]
            for j in range(m):
                j2 = (j + 1) % n
                try:
                    tb.faces.new((a[j], b[j], b[j2], a[j2]))
                except ValueError:
                    pass
        bmesh.ops.remove_doubles(tb, verts=tb.verts[:], dist=1e-6)
        bmesh.ops.recalc_face_normals(tb, faces=tb.faces[:])
        b = self.default_bevel if bevel is None else bevel
        self._bevel(tb, b, 2, angle=35)
        self._emit(tb, mat, M if M is not None else xf(at, rot), **kw)
        return self

    def sphere(self, r, at=(0, 0, 0), rot=(0, 0, 0), mat="metal_bare", segs=24, rings=14, scale=(1, 1, 1), M=None, **kw):
        tb = bmesh.new()
        bmesh.ops.create_uvsphere(tb, u_segments=segs, v_segments=rings, radius=r)
        self._emit(tb, mat, M if M is not None else xf(at, rot, scale), **kw)
        return self

    def prism(self, pts, h, at=(0, 0, 0), rot=(0, 0, 0), mat="paint_white", bevel=None, plane="XY", M=None,
              holes=None, **kw):
        """Extrude a 2D polygon (list of (x, y)) by h along the plane normal.
        plane 'XY' extrudes +Z, 'XZ' extrudes +Y (pts are (x, z)), 'YZ' extrudes +X (pts are (y, z))."""
        tb = bmesh.new()

        def lift(p, d):
            if plane == "XY":
                return (p[0], p[1], d)
            if plane == "XZ":
                return (p[0], d, p[1])
            return (d, p[0], p[1])

        def ring(poly, d):
            return [tb.verts.new(lift(p, d)) for p in poly]

        loops = [pts] + list(holes or [])
        bot = [ring(l, 0.0) for l in loops]
        top = [ring(l, h) for l in loops]
        for a, b in zip(bot, top):
            k = len(a)
            for i in range(k):
                tb.faces.new((a[i], a[(i + 1) % k], b[(i + 1) % k], b[i]))
        # caps (triangulated so concave outlines and holes are handled)
        polys3 = [[Vector((p[0], p[1], 0.0)) for p in l] for l in loops]
        tris = tessellate_polygon(polys3)
        flat_b = [v for l in bot for v in l]
        flat_t = [v for l in top for v in l]
        for t in tris:
            try:
                tb.faces.new((flat_b[t[0]], flat_b[t[1]], flat_b[t[2]]))
                tb.faces.new((flat_t[t[2]], flat_t[t[1]], flat_t[t[0]]))
            except ValueError:
                pass
        bmesh.ops.recalc_face_normals(tb, faces=tb.faces[:])
        # dissolve the cap triangulation back into n-gons where possible
        bmesh.ops.dissolve_limit(tb, angle_limit=D(0.5), verts=tb.verts[:], edges=tb.edges[:])
        b = self.default_bevel if bevel is None else bevel
        self._bevel(tb, b, kw.pop("segs", 2))
        self._emit(tb, mat, M if M is not None else xf(at, rot), **kw)
        return self

    def loft(self, rings, at=(0, 0, 0), rot=(0, 0, 0), mat="paint_white", closed=True, cap_a=True, cap_b=True,
             bevel=None, M=None, flip=False, **kw):
        """Skin a list of rings (each a list of 3D points, equal counts). closed -> rings are loops."""
        tb = bmesh.new()
        vr = [[tb.verts.new(p) for p in ring] for ring in rings]
        k = len(vr[0])
        m = k if closed else k - 1
        for a, b in zip(vr[:-1], vr[1:]):
            for i in range(m):
                i2 = (i + 1) % k
                try:
                    tb.faces.new((a[i], a[i2], b[i2], b[i]))
                except ValueError:
                    pass
        if closed and cap_a:
            try:
                tb.faces.new(list(reversed(vr[0])))
            except ValueError:
                pass
        if closed and cap_b:
            try:
                tb.faces.new(vr[-1])
            except ValueError:
                pass
        bmesh.ops.remove_doubles(tb, verts=tb.verts[:], dist=1e-6)
        bmesh.ops.recalc_face_normals(tb, faces=tb.faces[:])
        if flip:
            bmesh.ops.reverse_faces(tb, faces=tb.faces[:])
        b = self.default_bevel if bevel is None else bevel
        self._bevel(tb, b, kw.pop("segs", 2), angle=kw.pop("bevel_angle", 25.0))
        self._emit(tb, mat, M if M is not None else xf(at, rot), **kw)
        return self

    def poly(self, pts, mat="paint_white", thickness=0.0, M=None, at=(0, 0, 0), rot=(0, 0, 0), bevel=None, **kw):
        """Single planar polygon from 3D points (CCW seen from the front). Optional solidify."""
        tb = bmesh.new()
        vs = [tb.verts.new(p) for p in pts]
        f = tb.faces.new(vs)
        tb.normal_update()
        if thickness:
            r = bmesh.ops.extrude_face_region(tb, geom=[f])
            n = f.normal.copy()
            for v in [g for g in r["geom"] if isinstance(g, bmesh.types.BMVert)]:
                v.co -= n * thickness
            bmesh.ops.recalc_face_normals(tb, faces=tb.faces[:])
            b = self.default_bevel if bevel is None else bevel
            self._bevel(tb, min(b, abs(thickness) * 0.45))
        self._emit(tb, mat, M if M is not None else xf(at, rot), **kw)
        return self

    def pipe(self, path, r, mat="metal_bare", segs=10, bend=None, at=(0, 0, 0), rot=(0, 0, 0), M=None, cap=True,
             res=6, **kw):
        """Round pipe through 3D points, with filleted corners (bend radius defaults to 2.5 r)."""
        pts = fillet_path([Vector(p) for p in path], bend if bend is not None else r * 2.5, res)
        tb = bmesh.new()
        rings = []
        prev_n = None
        for i, p in enumerate(pts):
            if i == 0:
                t = (pts[1] - pts[0]).normalized()
            elif i == len(pts) - 1:
                t = (pts[-1] - pts[-2]).normalized()
            else:
                t = ((pts[i + 1] - p).normalized() + (p - pts[i - 1]).normalized()).normalized()
            if prev_n is None:
                ref = Vector((0, 0, 1)) if abs(t.z) < 0.9 else Vector((1, 0, 0))
                nrm = t.cross(ref).normalized()
            else:
                nrm = (prev_n - t * prev_n.dot(t)).normalized()
            prev_n = nrm
            bn = t.cross(nrm)
            rings.append([tb.verts.new(p + (nrm * math.cos(TAU * j / segs) + bn * math.sin(TAU * j / segs)) * r)
                          for j in range(segs)])
        for a, b in zip(rings[:-1], rings[1:]):
            for j in range(segs):
                j2 = (j + 1) % segs
                tb.faces.new((a[j], a[j2], b[j2], b[j]))
        if cap:
            tb.faces.new(list(reversed(rings[0])))
            tb.faces.new(rings[-1])
        bmesh.ops.recalc_face_normals(tb, faces=tb.faces[:])
        self._emit(tb, mat, M if M is not None else xf(at, rot), **kw)
        return self

    def sweep(self, profile, path, mat="metal_bare", closed_profile=True, at=(0, 0, 0), rot=(0, 0, 0), M=None,
              up=(0, 0, 1), cap=True, bevel=None, **kw):
        """Sweep a 2D profile [(a, b)] along a 3D polyline. Profile a -> side axis, b -> up axis."""
        pts = [Vector(p) for p in path]
        upv = Vector(up)
        tb = bmesh.new()
        rings = []
        for i, p in enumerate(pts):
            if i == 0:
                t = (pts[1] - pts[0]).normalized()
            elif i == len(pts) - 1:
                t = (pts[-1] - pts[-2]).normalized()
            else:
                t = ((pts[i + 1] - p).normalized() + (p - pts[i - 1]).normalized()).normalized()
            side = t.cross(upv)
            if side.length < 1e-5:
                side = t.cross(Vector((1, 0, 0)))
            side.normalize()
            u2 = side.cross(t).normalized()
            # mitre scale so the profile keeps its width through corners
            s = 1.0
            if 0 < i < len(pts) - 1:
                c = (pts[i + 1] - p).normalized().dot((p - pts[i - 1]).normalized())
                s = 1.0 / max(0.3, math.sqrt((1 + c) / 2))
            rings.append([tb.verts.new(p + side * a * s + u2 * b) for a, b in profile])
        k = len(profile)
        m = k if closed_profile else k - 1
        for a, b in zip(rings[:-1], rings[1:]):
            for j in range(m):
                j2 = (j + 1) % k
                tb.faces.new((a[j], a[j2], b[j2], b[j]))
        if cap and closed_profile:
            try:
                tb.faces.new(list(reversed(rings[0])))
                tb.faces.new(rings[-1])
            except ValueError:
                pass
        bmesh.ops.recalc_face_normals(tb, faces=tb.faces[:])
        b = self.default_bevel if bevel is None else bevel
        self._bevel(tb, b)
        self._emit(tb, mat, M if M is not None else xf(at, rot), **kw)
        return self

    def grid(self, sx, sy, nx, ny, at=(0, 0, 0), rot=(0, 0, 0), mat="paint_white", M=None, hfn=None, **kw):
        """Subdivided XY plane (for surfaces that need vertex density). hfn(x, y) -> z."""
        tb = bmesh.new()
        vs = [[tb.verts.new((-sx / 2 + sx * i / nx, -sy / 2 + sy * j / ny, 0.0)) for i in range(nx + 1)]
              for j in range(ny + 1)]
        if hfn:
            for row in vs:
                for v in row:
                    v.co.z = hfn(v.co.x, v.co.y)
        for j in range(ny):
            for i in range(nx):
                tb.faces.new((vs[j][i], vs[j][i + 1], vs[j + 1][i + 1], vs[j + 1][i]))
        self._emit(tb, mat, M if M is not None else xf(at, rot), **kw)
        return self

    def mesh(self, verts, faces, mat="paint_white", at=(0, 0, 0), rot=(0, 0, 0), M=None, bevel=None, recalc=True, uvs=None, **kw):
        """Raw indexed mesh. With recalc=False the given winding is trusted (counter-clockwise = outward).
        uvs: optional per-vertex (u, v); implies uv_mode='given'."""
        tb = bmesh.new()
        vs = [tb.verts.new(v) for v in verts]
        for f in faces:
            try:
                tb.faces.new([vs[i] for i in f])
            except ValueError:
                pass
        if uvs is not None:
            tb.verts.index_update()
            uvl = tb.loops.layers.uv.new("UVMap")
            for f in tb.faces:
                for l in f.loops:
                    l[uvl].uv = uvs[l.vert.index]
            kw["uv_mode"] = "given"
        if recalc:
            bmesh.ops.recalc_face_normals(tb, faces=tb.faces[:])
        else:
            tb.normal_update()
        b = self.default_bevel if bevel is None else bevel
        self._bevel(tb, b, kw.pop("segs", 2), angle=kw.pop("bevel_angle", 25.0))
        self._emit(tb, mat, M if M is not None else xf(at, rot), **kw)
        return self

    def text(self, body, size=0.1, at=(0, 0, 0), rot=(0, 0, 0), mat="paint_black", depth=0.002, align="CENTER", M=None):
        """Extruded lettering (lies in the local XY plane, reading along +X)."""
        cu = bpy.data.curves.new("_txt", "FONT")
        cu.body = body
        cu.size = size
        cu.extrude = depth
        cu.align_x = align
        cu.align_y = "CENTER"
        cu.resolution_u = 2
        ob = bpy.data.objects.new("_txt", cu)
        bpy.context.scene.collection.objects.link(ob)
        dg = bpy.context.evaluated_depsgraph_get()
        me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
        tb = bmesh.new()
        tb.from_mesh(me)
        bpy.data.objects.remove(ob)
        bpy.data.curves.remove(cu)
        bpy.data.meshes.remove(me)
        self._emit(tb, mat, M if M is not None else xf(at, rot), smooth=False)
        return self

    def add_part(self, other, M=None):
        """Merge another Part's geometry (keeps its material slots)."""
        tb = other.bm.copy()
        remap = [self._slot(s) for s in other.slots]
        for f in tb.faces:
            f.material_index = remap[f.material_index] if remap else 0
        if M is not None:
            tb.transform(M)
            if M.determinant() < 0:
                bmesh.ops.reverse_faces(tb, faces=tb.faces[:])
        sm = scratch_mesh()
        tb.to_mesh(sm)
        tb.free()
        self.bm.from_mesh(sm)
        return self

    def mirror_x(self, weld=False):
        """Mirror everything built so far across the YZ plane."""
        tb = self.bm.copy()
        tb.transform(Matrix.Scale(-1, 4, Vector((1, 0, 0))))
        bmesh.ops.reverse_faces(tb, faces=tb.faces[:])
        sm = scratch_mesh()
        tb.to_mesh(sm)
        tb.free()
        self.bm.from_mesh(sm)
        if weld:
            bmesh.ops.remove_doubles(self.bm, verts=self.bm.verts[:], dist=1e-5)
        return self

    def stats(self):
        return len(self.bm.verts), sum(max(1, len(f.verts) - 2) for f in self.bm.faces)

    # -- finish
    def finish(self, sharp=32.0, weighted=True, parent=None, at=(0, 0, 0), rot=(0, 0, 0), **props):
        me = bpy.data.meshes.new(self.name)
        self.bm.normal_update()
        self.bm.to_mesh(me)
        self.bm.free()
        for s in self.slots:
            me.materials.append(mat(s))
        me.set_sharp_from_angle(angle=D(sharp))
        ob = bpy.data.objects.new(self.name, me)
        link(ob, parent)
        ob.location = at
        ob.rotation_euler = Euler((D(rot[0]), D(rot[1]), D(rot[2])), "XYZ")
        if weighted and len(me.polygons) > 0:
            md = ob.modifiers.new("wn", "WEIGHTED_NORMAL")
            md.keep_sharp = True
            md.weight = 60
            apply_modifiers(ob)
        for k, v in {**self.props, **props}.items():
            ob[k] = v
        if ob.get("colonly"):
            # collision hulls must not occlude or shadow the visible model in previews and AO bakes
            ob.hide_render = True
            ob.display_type = "WIRE"
        return ob


TAU = math.tau


def fillet_path(pts, radius, res=6):
    """Round the corners of a polyline with circular-ish arcs."""
    if len(pts) < 3 or radius <= 0:
        return pts
    out = [pts[0]]
    for i in range(1, len(pts) - 1):
        p0, p1, p2 = pts[i - 1], pts[i], pts[i + 1]
        a, b = (p0 - p1), (p2 - p1)
        la, lb = a.length, b.length
        if la < 1e-6 or lb < 1e-6:
            continue
        a.normalize()
        b.normalize()
        ang = a.angle(b)
        if ang > math.pi - 1e-3:
            out.append(p1)
            continue
        d = min(radius / math.tan(ang / 2), la * 0.49, lb * 0.49)
        s, e = p1 + a * d, p1 + b * d
        for k in range(res + 1):
            t = k / res
            out.append((s * (1 - t) ** 2) + (p1 * 2 * t * (1 - t)) + (e * t * t))
    out.append(pts[-1])
    return out


# ----------------------------------------------------------------------------- object helpers
def apply_modifiers(ob):
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
    old = ob.data
    name = old.name
    ob.modifiers.clear()
    ob.data = me
    bpy.data.meshes.remove(old)
    me.name = name
    return ob


def boolean(ob, cutter, op="DIFFERENCE", solver="EXACT", remove=True):
    md = ob.modifiers.new("bool", "BOOLEAN")
    md.operation = op
    md.object = cutter
    try:
        md.solver = solver
    except Exception:
        pass
    apply_modifiers(ob)
    if remove:
        me = cutter.data
        bpy.data.objects.remove(cutter)
        bpy.data.meshes.remove(me)
    return ob


def empty(name, at=(0, 0, 0), rot=(0, 0, 0), parent=None, **props):
    """Marker / pivot node. Custom props become userData in the engine."""
    ob = bpy.data.objects.new(name, None)
    ob.empty_display_size = 0.2
    link(ob, parent)
    ob.location = at
    ob.rotation_euler = Euler((D(rot[0]), D(rot[1]), D(rot[2])), "XYZ")
    for k, v in props.items():
        ob[k] = v
    return ob


def marker(kind, id, at=(0, 0, 0), rot=(0, 0, 0), parent=None, **props):
    return empty(f"mk_{kind}_{id}", at, rot, parent, kind=kind, id=id, **props)


def light(id, at, color=(1.0, 0.95, 0.85), power=60.0, dist=8.0, kind="point", parent=None, rot=(0, 0, 0), **props):
    """Light fixture marker (engine instantiates pooled lights). power is in candela-ish engine units."""
    return empty(f"light_{id}", at, rot, parent, kind="light", id=id, light=kind,
                 color=list(color), power=power, dist=dist, **props)


def instance(src, name, at=(0, 0, 0), rot=(0, 0, 0), parent=None, scale=(1, 1, 1), **props):
    """Linked duplicate (shares mesh data -> shared geometry in glTF)."""
    ob = bpy.data.objects.new(name, src.data)
    link(ob, parent)
    ob.location = at
    ob.rotation_euler = Euler((D(rot[0]), D(rot[1]), D(rot[2])), "XYZ")
    ob.scale = scale
    for k in src.keys():
        ob[k] = src[k]
    for k, v in props.items():
        ob[k] = v
    return ob


def props(ob, **kw):
    for k, v in kw.items():
        ob[k] = v
    return ob


def collider(name, verts_or_part, parent=None, at=(0, 0, 0), rot=(0, 0, 0), **p):
    """Invisible collision mesh. Pass a Part (finished here) for a simplified collision hull."""
    ob = verts_or_part.finish(weighted=False, parent=parent, at=at, rot=rot, colonly=1)
    ob.name = name
    for k, v in p.items():
        ob[k] = v
    return ob


# ----------------------------------------------------------------------------- vertex data bake
_HEMI = None


def _hemi_dirs(k):
    """k cosine-weighted directions on the +Z hemisphere (stratified, deterministic)."""
    global _HEMI
    if _HEMI is None or len(_HEMI) != k:
        out = []
        golden = math.pi * (3 - math.sqrt(5))
        for i in range(k):
            u = (i + 0.5) / k
            r = math.sqrt(u)
            th = golden * i
            out.append((r * math.cos(th), r * math.sin(th), math.sqrt(max(0.0, 1 - u))))
        _HEMI = out
    return _HEMI


def _is_see_through(mat_name):
    spec = MATERIAL_DB.get(mat_name, {})
    return spec.get("kind") == "glass" or bool(spec.get("alphaTest"))


def bake_ao(objs, rays=20, local_dist=1.6, sky_dist=45.0, ground_z=None, occluders=None, convexity=True):
    """Ray-cast bake into a per-corner 'Color' attribute (exported as COLOR_0):
         R = local ambient occlusion (distance-weighted within local_dist)
         G = edge convexity (0.5 flat, >0.5 convex, <0.5 concave)
         B = environment visibility (fraction of sky/ground light that can reach the point)
    Sample points are pulled slightly toward the face centre and off the surface, and hits on back
    faces are ignored, so vertices buried in neighbouring geometry do not bake to black.
    Glass, alpha-tested and movable (`dynamic`) parts do not occlude. ground_z adds an implicit ground."""
    from mathutils.bvhtree import BVHTree
    t0 = time.time()
    objs = [o for o in objs if o.type == "MESH" and len(o.data.polygons) > 0]
    occ = occluders if occluders is not None else [o for o in bpy.context.scene.objects if o.type == "MESH"]
    verts, tris, tri_n = [], [], []
    for o in occ:
        if o.get("colonly") or o.get("dynamic") or o.hide_render:
            continue
        me = o.data
        me.calc_loop_triangles()
        mw = o.matrix_world
        base = len(verts)
        verts.extend(mw @ v.co for v in me.vertices)
        see = [_is_see_through(m.name) if m else False for m in me.materials] or [False]
        for lt in me.loop_triangles:
            if see[min(lt.material_index, len(see) - 1)]:
                continue
            tris.append((base + lt.vertices[0], base + lt.vertices[1], base + lt.vertices[2]))
    bvh = BVHTree.FromPolygons(verts, tris, all_triangles=True, epsilon=0.0) if tris else None
    hemi = _hemi_dirs(rays)
    total = 0
    for o in objs:
        me = o.data
        if "Color" in me.color_attributes:
            me.color_attributes.remove(me.color_attributes["Color"])
        ca = me.color_attributes.new("Color", "BYTE_COLOR", "CORNER")
        me.color_attributes.active_color = ca
        me.color_attributes.render_color_index = me.color_attributes.find("Color")
        mw = o.matrix_world
        n3 = mw.to_3x3().inverted_safe().transposed()
        conv = _convexity(me) if convexity else None
        wverts = [mw @ v.co for v in me.vertices]
        colors = [0.0] * (len(me.loops) * 4)
        for poly in me.polygons:
            n = (n3 @ poly.normal).normalized()
            c = mw @ poly.center
            # tangent frame from the normal only -> identical ray sets on coplanar neighbours (no seams)
            ref = Vector((0, 0, 1)) if abs(n.z) < 0.9 else Vector((1, 0, 0))
            tx = n.cross(ref).normalized()
            ty = n.cross(tx)
            dirs = [tx * h[0] + ty * h[1] + n * h[2] for h in hemi]
            for li in poly.loop_indices:
                vi = me.loops[li].vertex_index
                p = wverts[vi].lerp(c, 0.12) + n * 0.012
                occl, vis = 0.0, 0.0
                if bvh is not None:
                    for d in dirs:
                        origin, travelled, blocked = p, 0.0, False
                        for _ in range(3):
                            loc, hn, _idx, dist = bvh.ray_cast(origin, d, sky_dist - travelled)
                            if loc is None:
                                break
                            if hn.dot(d) > 0.0:
                                # back face: we started inside or behind a solid; step through it
                                travelled += dist + 0.002
                                origin = loc + d * 0.002
                                continue
                            travelled += dist
                            blocked = True
                            break
                        if blocked:
                            if travelled < local_dist:
                                occl += (1.0 - travelled / local_dist)
                        else:
                            if ground_z is not None and d.z < -1e-3 and p.z > ground_z:
                                vis += 0.45
                            else:
                                vis += 1.0
                else:
                    vis = rays
                ao = 1.0 - min(1.0, occl / rays * 1.25)
                g = conv[vi] if conv else 0.5
                k = li * 4
                colors[k] = ao
                colors[k + 1] = g
                colors[k + 2] = vis / rays
                colors[k + 3] = 1.0
            total += len(poly.loop_indices)
        ca.data.foreach_set("color", colors)
    print(f"  baked AO/visibility: {len(objs)} objects, {total} corners, {len(tris)} occluder tris, {time.time() - t0:.1f}s")


def _convexity(me):
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.normal_update()
    conv = [0.5] * len(bm.verts)
    for v in bm.verts:
        s, c = 0.0, 0
        for e in v.link_edges:
            if len(e.link_faces) == 2:
                try:
                    s += e.calc_face_angle_signed()
                except ValueError:
                    pass
                c += 1
        if c:
            conv[v.index] = max(0.0, min(1.0, 0.5 + (s / c) / math.pi * 1.6))
    bm.free()
    return conv


# ----------------------------------------------------------------------------- export / preview
def export_glb(name, objects=None):
    os.makedirs(MODELS, exist_ok=True)
    path = os.path.join(MODELS, name + ".glb")
    for o in bpy.context.scene.objects:
        o.select_set(objects is None or o in objects)
    t0 = time.time()
    bpy.ops.export_scene.gltf(
        filepath=path, export_format="GLB", use_selection=objects is not None, export_apply=False,
        export_extras=True, export_yup=True, export_texcoords=True, export_normals=True,
        export_tangents=False, export_materials="EXPORT", export_cameras=False, export_lights=False,
        export_animations=False, export_skins=True, export_morph=False,
        export_vertex_color="ACTIVE", export_all_vertex_colors=False,
        export_active_vertex_color_when_no_material=True, export_image_format="NONE",
    )
    tris = sum(len(o.data.loop_triangles) or sum(len(p.vertices) - 2 for p in o.data.polygons)
               for o in bpy.context.scene.objects if o.type == "MESH")
    print(f"  exported {path}  ({os.path.getsize(path) / 1e6:.2f} MB, {tris} tris, {time.time() - t0:.1f}s)")
    return path


def save_blend(name):
    os.makedirs(BLEND_DIR, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(BLEND_DIR, name + ".blend"), compress=True)


def preview(name, eye, target=(0, 0, 0), res=(1280, 720), samples=32, lens=35, ortho=None,
            sun_rot=(50, 0, 35), sun=3.5, sky=(0.75, 0.82, 0.9), sky_strength=0.9, exposure=0.0, film_transparent=False):
    """Cycles preview render to blender/previews/<name>.png (for checking models against references)."""
    os.makedirs(PREVIEW_DIR, exist_ok=True)
    sc = bpy.context.scene
    cam = bpy.data.cameras.new("pcam")
    co = bpy.data.objects.new("pcam", cam)
    sc.collection.objects.link(co)
    co.location = eye
    d = Vector(target) - Vector(eye)
    co.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    cam.lens = lens
    cam.clip_start, cam.clip_end = 0.05, 5000
    if ortho:
        cam.type = "ORTHO"
        cam.ortho_scale = ortho
    sc.camera = co
    su = bpy.data.lights.new("psun", "SUN")
    su.energy = sun
    su.angle = D(3)
    so = bpy.data.objects.new("psun", su)
    sc.collection.objects.link(so)
    so.rotation_euler = Euler((D(sun_rot[0]), D(sun_rot[1]), D(sun_rot[2])))
    if sc.world is None:
        sc.world = bpy.data.worlds.new("w")
    sc.world.use_nodes = True
    bg = sc.world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs[0].default_value = (*sky, 1)
        bg.inputs[1].default_value = sky_strength
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = samples
    sc.cycles.use_denoising = True
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.film_transparent = film_transparent
    sc.view_settings.exposure = exposure
    try:
        sc.view_settings.view_transform = "AgX"
    except Exception:
        pass
    sc.render.filepath = os.path.join(PREVIEW_DIR, name + ".png")
    t0 = time.time()
    bpy.ops.render.render(write_still=True)
    print(f"  preview {name}.png in {time.time() - t0:.1f}s")
    bpy.data.objects.remove(co)
    bpy.data.objects.remove(so)
    return sc.render.filepath
