"""
Creature kit: skeletons, organic metaball bodies, hard plates and blades, smooth distance-based skin weights, export of
skinned GLBs. The game animates the bones procedurally (src/world/fauna/Rig.ts): no baked clips.

Blender space: +Y forward (the creature's nose), +Z up, +X its right. Bone local Y runs head → tail.
A part is either `auto` (organic: weights from the distance to the listed bones, blended across joints) or rigid to
one bone (armour plates, claws, teeth).
"""
import math, random
import bpy, bmesh
from mathutils import Vector, Matrix, noise
import kit
from kit import V, M, from_bmesh, set_props

PI = math.pi

kit.PALETTE.update({
    # Mars
    "strider_shell": dict(color=(0.82, 0.38, 0.26), rough=0.4),
    "strider_hide": dict(color=(0.15, 0.1, 0.085), rough=0.6),
    "strider_seam": dict(color=(0.08, 0.05, 0.05), rough=0.6),
    "strider_glow": dict(color=(0.1, 0.55, 0.75), emit=(0.15, 0.7, 1.0), emit_strength=3.0),
    "claw_black": dict(color=(0.05, 0.04, 0.04), rough=0.3),
    "stalker_skin": dict(color=(0.46, 0.42, 0.38), rough=0.62),
    "stalker_belly": dict(color=(0.58, 0.5, 0.42), rough=0.7),
    "mouth_red": dict(color=(0.32, 0.05, 0.06), rough=0.35),
    "tooth": dict(color=(0.82, 0.78, 0.66), rough=0.35),
    "wing_skin": dict(color=(0.55, 0.62, 0.7), rough=0.45),
    "wing_dark": dict(color=(0.14, 0.15, 0.2), rough=0.4),
    "wing_mark": dict(color=(0.75, 0.2, 0.12), emit=(1.0, 0.25, 0.12), emit_strength=1.0),
    # Jupiter
    "floater_bag": dict(color=(0.86, 0.64, 0.46), rough=0.35, alpha=0.9),
    "floater_rib": dict(color=(0.94, 0.88, 0.8), rough=0.4),
    "floater_glow": dict(color=(0.9, 0.95, 1.0), emit=(0.7, 0.9, 1.0), emit_strength=2.0),
    "ray_skin": dict(color=(0.08, 0.09, 0.12), rough=0.38),
    "ray_belly": dict(color=(0.2, 0.18, 0.2), rough=0.5),
    "ray_glow": dict(color=(0.9, 0.3, 0.2), emit=(1.0, 0.25, 0.15), emit_strength=2.0),
    "puff_bladder": dict(color=(0.94, 0.88, 0.76), rough=0.3, alpha=0.85),
    "puff_core": dict(color=(0.7, 0.55, 0.42), rough=0.6),
    "hunter_bag": dict(color=(0.86, 0.72, 0.22), rough=0.45),
    "hunter_stripe": dict(color=(0.52, 0.38, 0.1), rough=0.5),
    "hunter_body": dict(color=(0.38, 0.3, 0.36), rough=0.5),
    "hunter_eye": dict(color=(0.2, 0.5, 1.0), emit=(0.4, 0.7, 1.0), emit_strength=3.0),
    "tendril": dict(color=(0.55, 0.4, 0.32), rough=0.6),
})


# ------------------------------------------------------------------------------------------------ skeleton
class Skeleton:
    def __init__(self):
        self.bones = {}   # name -> (head, tail, parent)
        self.order = []

    def add(self, name, head, tail, parent=None):
        self.bones[name] = (V(head), V(tail), parent)
        self.order.append(name)
        return name

    def chain(self, prefix, pts, parent=None):
        """bones along a polyline: prefix1..n; returns names"""
        names = []
        par = parent
        for i in range(len(pts) - 1):
            nm = f"{prefix}{i + 1}"
            self.add(nm, pts[i], pts[i + 1], par)
            names.append(nm)
            par = nm
        return names

    def seg(self, name):
        h, t, _ = self.bones[name]
        return h, t


def make_armature(sk, name="Armature"):
    arm = bpy.data.armatures.new(name)
    ob = bpy.data.objects.new(name, arm)
    kit.link(ob)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.mode_set(mode="EDIT")
    eb = {}
    for nm in sk.order:
        h, t, _ = sk.bones[nm]
        b = arm.edit_bones.new(nm)
        b.head = h
        b.tail = t
        b.roll = 0.0
        eb[nm] = b
    for nm in sk.order:
        p = sk.bones[nm][2]
        if p:
            eb[nm].parent = eb[p]
            eb[nm].use_connect = False
    bpy.ops.object.mode_set(mode="OBJECT")
    return ob


# ------------------------------------------------------------------------------------------------ parts
class Part:
    """mesh object + how it is skinned: bones=[...] (auto, distance-blended) or bone='x' (rigid)"""
    def __init__(self, obj, bones=None, bone=None):
        self.obj = obj
        self.bones = bones
        self.bone = bone


META_K = 1.0 / 0.575


def meta(name, elements, m, res=0.05, threshold=0.6):
    """Organic blob from metaball elements: [(type, co, radius, size(xyz) or None, rot_euler or None), ...]."""
    mb = bpy.data.metaballs.new(name)
    mb.resolution = res
    mb.render_resolution = res
    mb.threshold = threshold
    ob = bpy.data.objects.new(name + "_mb", mb)
    kit.link(ob)
    for el in elements:
        t, co, r = el[0], el[1], el[2]
        size = el[3] if len(el) > 3 else None
        rot = el[4] if len(el) > 4 else None
        e = mb.elements.new(type=t)
        e.co = co
        # the visible surface of a metaball element sits at ~0.575 × its radius (field (1 − d²/r²)³ × 2 = 0.6):
        # scale so that `r` (and an ellipsoid's size) is the size you see
        e.radius = r * META_K
        if size is not None:
            if t == "CAPSULE":
                e.size_x = size[0]
            else:
                e.size_x, e.size_y, e.size_z = size
        if rot is not None:
            e.rotation = Matrix.Rotation(rot[2], 4, "Z").to_quaternion() @ Matrix.Rotation(rot[1], 4, "Y").to_quaternion() @ Matrix.Rotation(rot[0], 4, "X").to_quaternion()
    dg = bpy.context.evaluated_depsgraph_get()
    dg.update()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg), depsgraph=dg)
    bpy.data.objects.remove(ob, do_unlink=True)
    bpy.data.metaballs.remove(mb)
    me.name = name
    o = bpy.data.objects.new(name, me)
    kit.link(o)
    me.materials.clear()
    me.materials.append(M(m))
    kit.smooth(o, 80)
    return o


def capsule_chain(pts, radii):
    """metaball capsule elements along a polyline (pts with matching radii)"""
    out = []
    for i in range(len(pts) - 1):
        a, b = V(pts[i]), V(pts[i + 1])
        d = b - a
        L = d.length
        mid = (a + b) / 2
        r = (radii[i] + radii[i + 1]) / 2
        # a capsule lies along its local X: rotate X onto d
        q = V((1, 0, 0)).rotation_difference(d.normalized())
        e = q.to_euler()
        out.append(("CAPSULE", tuple(mid), r, (L / 2, 0, 0), (e.x, e.y, e.z)))
    return out


def plate(name, sections, m, thick=0.03):
    """Curved armour plate: loft of open polylines, given thickness (solidify)."""
    o = kit.loft(name, sections, m=m, closed=False, caps=False)
    kit.add_solidify(o, thick, 0.0)
    kit.bake(o)
    kit.smooth(o, 50)
    return o


def blade(name, root, tip, width, up, m, thick=0.04, n=10, curve=0.0, taper=0.15):
    """A long flattened fin / scythe: width profile along root→tip, its flat side facing `up`."""
    root, tip, up = V(root), V(tip), V(up).normalized()
    ax = (tip - root)
    L = ax.length
    ax.normalize()
    side = ax.cross(up).normalized()
    secs = []
    for i in range(n + 1):
        t = i / n
        w = width * (math.sin(PI * min(1.0, t * 1.05)) ** 0.6 * (1 - taper * t) + 0.08 * (1 - t))
        c = root + ax * (L * t) + up * (curve * math.sin(PI * t))
        secs.append([tuple(c + side * (w / 2)), tuple(c + up * (thick / 2)), tuple(c - side * (w / 2)), tuple(c - up * (thick / 2))])
    o = kit.loft(name, secs, m=m, closed=True, caps=True)
    kit.smooth(o, 60)
    return o


def tube_tapered(name, pts, r0, r1, m, seg=8):
    """tentacle / feeler: tube along pts tapering r0 → r1"""
    bm = bmesh.new()
    pts = [V(p) for p in pts]
    rings = []
    n = len(pts)
    for i, p in enumerate(pts):
        if i == 0:
            t = (pts[1] - pts[0]).normalized()
        elif i == n - 1:
            t = (pts[-1] - pts[-2]).normalized()
        else:
            t = ((pts[i + 1] - pts[i]).normalized() + (pts[i] - pts[i - 1]).normalized()).normalized()
        upv = V((0, 0, 1)) if abs(t.z) < 0.9 else V((1, 0, 0))
        nx = t.cross(upv).normalized()
        ny = nx.cross(t).normalized()
        r = r0 + (r1 - r0) * (i / (n - 1))
        rings.append([bm.verts.new(p + (nx * math.cos(TAU * k / seg) + ny * math.sin(TAU * k / seg)) * r) for k in range(seg)])
    for i in range(n - 1):
        for k in range(seg):
            a, b = rings[i][k], rings[i][(k + 1) % seg]
            c, d = rings[i + 1][(k + 1) % seg], rings[i + 1][k]
            bm.faces.new((a, b, c, d))
    bm.faces.new(list(reversed(rings[0])))
    tipv = bm.verts.new(pts[-1] + (pts[-1] - pts[-2]).normalized() * r1 * 2)
    for k in range(seg):
        bm.faces.new((rings[-1][k], rings[-1][(k + 1) % seg], tipv))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = from_bmesh(name, bm, (m,))
    kit.smooth(o, 70)
    return o


TAU = math.tau


def spots(name, pts, r, m):
    """small glowing / marking discs (spheres flattened) at points"""
    parts = []
    for i, (p, nrm) in enumerate(pts):
        s = kit.sphere(f"{name}{i}", r, loc=p, m=m, segs=8, rings=5, scale=(1, 1, 0.35))
        s.rotation_euler = V((0, 0, 1)).rotation_difference(V(nrm).normalized()).to_euler()
        parts.append(s)
    return kit.merge(parts, name)


def decimate(o, ratio):
    mod = o.modifiers.new("dec", "DECIMATE")
    mod.ratio = ratio
    kit.bake(o)
    return o


# ------------------------------------------------------------------------------------------------ skinning
def _seg_dist(p, a, b):
    ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / max(ab.length_squared, 1e-9)))
    return (p - (a + ab * t)).length, t


def assemble(name, sk, parts, falloff=4.0, keep=3, shrink=None):
    """Merge parts into one skinned mesh object with vertex groups (weights per the parts' skinning rule)."""
    bm = bmesh.new()
    mats = []
    rules = []  # per-vertex rule
    for pt in parts:
        o = pt.obj
        kit.bake(o)
        me = o.data.copy()
        me.transform(kit.world_matrix(o))
        before = len(bm.verts)
        fb = len(bm.faces)
        bm.from_mesh(me)
        bm.faces.ensure_lookup_table()
        idx = []
        for sm in o.data.materials:
            if sm is None:
                sm = M("paint_white_aero")
            if sm.name not in [x.name for x in mats]:
                mats.append(sm)
            idx.append([x.name for x in mats].index(sm.name))
        for f in bm.faces[fb:]:
            f.material_index = idx[min(f.material_index, len(idx) - 1)] if idx else 0
        rules.extend([pt] * (len(bm.verts) - before))
        bpy.data.meshes.remove(me)
        bpy.data.objects.remove(o, do_unlink=True)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    kit.link(ob)
    for m in mats:
        me.materials.append(m)
    groups = {nm: ob.vertex_groups.new(name=nm) for nm in sk.order}
    segs = {nm: sk.seg(nm) for nm in sk.order}
    for v in me.vertices:
        rule = rules[v.index]
        if rule.bone:
            groups[rule.bone].add([v.index], 1.0, "REPLACE")
            continue
        cands = rule.bones or sk.order
        ws = []
        for nm in cands:
            a, b = segs[nm]
            d, _ = _seg_dist(v.co, a, b)
            ws.append((1.0 / (d ** falloff + 1e-6), nm))
        ws.sort(reverse=True)
        ws = ws[:keep]
        tot = sum(w for w, _ in ws)
        for w, nm in ws:
            if w / tot > 0.02:
                groups[nm].add([v.index], w / tot, "REPLACE")
    kit.smooth(ob, 75)
    return ob


def finish_creature(root, sk, body, path, props=None):
    arm = make_armature(sk)
    arm.parent = root
    body.parent = arm
    mod = body.modifiers.new("arm", "ARMATURE")
    mod.object = arm
    kit.uv_box(body)
    if props:
        set_props(root, **props)
    kit.select_tree(root)
    kw = dict(filepath=path, export_format="GLB", use_selection=True, export_apply=False, export_extras=True, export_yup=True,
              export_animations=False, export_cameras=False, export_skins=True, export_materials="EXPORT")
    bpy.ops.export_scene.gltf(**kw)
    tris = sum(len(p.vertices) - 2 for p in body.data.polygons)
    import os
    print(f"[creature] {path} ~{tris} tris, {len(sk.order)} bones, {os.path.getsize(path) / 1e6:.2f} MB")
    return arm
