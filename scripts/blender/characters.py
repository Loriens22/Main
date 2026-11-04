"""Characters: the man (red knit sweater, shirt, jeans), six prehistoric people
and a running Gallimimus-like theropod.

Bodies use Blender's Skin modifier (+ Subdivision) over a joint graph, then a
named armature with distance-normalised skin weights.  Heads are sculpted
procedurally from a UV sphere and joined into the skinned mesh (100 % 'head'
weight) so morph targets (MouthOpen, Brow, Blink) travel with the skeleton.
Blender coords: Z up, characters face -Y, character-left = +X.
"""
import math
import os
import random
import bmesh
import bpy
from mathutils import Vector, Matrix
from common import mat, new_obj, apply_mods, subsurf, export_glb


def sstep(a, b, x):
    t = min(1.0, max(0.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def skin_body(name, joints, edges, radii, root_joint, levels=2):
    me = bpy.data.meshes.new(name)
    keys = list(joints.keys())
    idx = {k: i for i, k in enumerate(keys)}
    me.from_pydata([joints[k] for k in keys], [(idx[a], idx[b]) for a, b in edges], [])
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    sk = ob.modifiers.new('skin', 'SKIN')
    sk.use_smooth_shade = True
    sk.branch_smoothing = 0.6
    sv = me.skin_vertices[0].data
    for k in keys:
        r = radii[k]
        sv[idx[k]].radius = (r, r) if isinstance(r, (int, float)) else r
        sv[idx[k]].use_root = (k == root_joint)
    subsurf(ob, levels)
    apply_mods(ob)
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


def seg_dist(p, a, b):
    ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / max(ab.length_squared, 1e-12)))
    return (p - (a + ab * t)).length


def build_armature(name, bones):
    """bones: list of (bone, head, tail, parent)."""
    arm = bpy.data.armatures.new(name + '_arm')
    ob = bpy.data.objects.new(name + '_rig', arm)
    bpy.context.scene.collection.objects.link(ob)
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    eb = arm.edit_bones
    for bn, h, t, par in bones:
        b = eb.new(bn)
        b.head = Vector(h)
        b.tail = Vector(t)
        b.roll = 0.0
        if par:
            b.parent = eb[par]
            b.use_connect = False
    bpy.ops.object.mode_set(mode='OBJECT')
    return ob


def skin_weights(mesh_ob, bones, bone_radius, overrides=None):
    """Weight = (r_b / d)^8 over the nearest bones (radius-normalised distance)."""
    me = mesh_ob.data
    groups = {bn: mesh_ob.vertex_groups.new(name=bn) for bn, *_ in bones}
    segs = [(bn, Vector(h), Vector(t)) for bn, h, t, _ in bones]
    for v in me.vertices:
        if overrides:
            o = overrides(v)
            if o:
                for bn, w in o.items():
                    groups[bn].add([v.index], w, 'REPLACE')
                continue
        ws = []
        for bn, a, b in segs:
            d = seg_dist(v.co, a, b) / bone_radius.get(bn, 0.05)
            ws.append((1.0 / (d ** 8 + 1e-6), bn))
        ws.sort(reverse=True)
        ws = ws[:3]
        tot = sum(w for w, _ in ws)
        for w, bn in ws:
            if w / tot > 0.02:
                groups[bn].add([v.index], w / tot, 'REPLACE')


def bind(mesh_ob, rig):
    mod = mesh_ob.modifiers.new('arm', 'ARMATURE')
    mod.object = rig
    mesh_ob.parent = rig


def set_vcol(ob, fn):
    me = ob.data
    if 'Col' not in me.color_attributes:
        me.color_attributes.new('Col', 'BYTE_COLOR', 'CORNER')
    ca = me.color_attributes['Col']
    for poly in me.polygons:
        for li in poly.loop_indices:
            vi = me.loops[li].vertex_index
            c = fn(me.vertices[vi].co, poly)
            ca.data[li].color = (c[0], c[1], c[2], 1.0)


def join_into(target, others):
    objs = [target] + others
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = target
    with bpy.context.temp_override(active_object=target, object=target, selected_objects=objs, selected_editable_objects=objs):
        bpy.ops.object.join()
    return target


# ---------------------------------------------------------------------------
# Head sculpt
# ---------------------------------------------------------------------------

def sculpt_head(name, c, dims, P, materials):
    """Procedural head around centre c=(x,y,z) with half-dims (wx, fy, hz).
    Returns list of objects (face, eyes, brows, hair, ears)."""
    wx, fdep, hz = dims
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=56, v_segments=40, radius=1.0)
    for v in bm.verts:
        X, Fw, U = v.co.x, -v.co.y, v.co.z
        # jaw taper & chin
        if U < -0.15:
            k = (-U - 0.15) / 0.85
            X *= 1 - 0.2 * k * P.get('jaw', 1.0)
            Fw = Fw * (1 - 0.12 * k) + 0.06 * k
            U = -0.15 + (U + 0.15) * 0.88
        # flatten face plane, occiput
        if Fw > 0.45:
            Fw = 0.45 + (Fw - 0.45) * 0.62
        if Fw < -0.2:
            Fw *= 1.06
        g = lambda x, s: math.exp(-(x / s) ** 2)
        # brow ridge
        Fw += 0.07 * g(U - 0.2, 0.08) * g(X, 0.7) * (Fw > 0) * P.get('brow', 1.0)
        # eye sockets
        for s in (-1, 1):
            Fw -= 0.085 * g(X - s * 0.4, 0.17) * g(U - 0.07, 0.11) * (Fw > 0)
            X += s * 0.035 * g(X - s * 0.62, 0.15) * g(U + 0.02, 0.15)  # cheekbones
        # nose: bridge -> tip
        if Fw > 0:
            prof = sstep(-0.24, -0.12, U) * (1 - sstep(0.06, 0.16, U))
            tip = g(U + 0.14, 0.07)
            Fw += (0.17 * prof + 0.13 * tip) * g(X, 0.11 + 0.08 * tip) * P.get('nose', 1.0)
            # nostril wings
            for s in (-1, 1):
                Fw += 0.035 * g(X - s * 0.12, 0.06) * g(U + 0.2, 0.05)
            # mouth: lips + groove
            Fw += 0.035 * g(U + 0.33, 0.035) * g(X, 0.3) + 0.03 * g(U + 0.41, 0.035) * g(X, 0.26)
            Fw -= 0.03 * g(U + 0.37, 0.018) * g(X, 0.3)
            # chin
            Fw += 0.05 * g(U + 0.63, 0.1) * g(X, 0.3)
        v.co = Vector((c[0] + X * wx, c[1] - Fw * fdep, c[2] + U * hz))
    bm.normal_update()
    face = new_obj(name + '_face', bm, [materials['Skin']], smooth=True)
    objs = [face]
    # eyes
    for s in (-1, 1):
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=20, v_segments=14, radius=0.0118)
        ex, ey, ez = c[0] + s * wx * 0.4, c[1] - fdep * 0.585, c[2] + hz * 0.065
        for v in bm.verts:
            v.co = Vector((v.co.x + ex, v.co.y + ey, v.co.z + ez))
        eye = new_obj(f'{name}_eye{s}', bm, [materials['Eye']], smooth=True)
        set_vcol(eye, lambda co, p, ex=ex, ey=ey, ez=ez: (
            (0.02, 0.015, 0.01) if (-(co.y - ey) / 0.0118) > 0.93 else
            (P.get('iris', (0.22, 0.13, 0.06))) if (-(co.y - ey) / 0.0118) > 0.78 else (0.92, 0.9, 0.86)))
        objs.append(eye)
        # brow
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=12, v_segments=8, radius=1.0)
        for v in bm.verts:
            x, y, z = v.co.x * 0.022, v.co.y * 0.004, v.co.z * 0.0034
            z += -0.005 * (x * s / 0.026)  # slight arch
            v.co = Vector((ex + x + s * 0.003, c[1] - fdep * 0.775 + y, c[2] + hz * 0.205 + z))
        objs.append(new_obj(f'{name}_brow{s}', bm, [materials['Hair']], smooth=True))
        # ear
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=14, v_segments=10, radius=1.0)
        for v in bm.verts:
            v.co = Vector((c[0] + s * (wx * 0.98 + v.co.x * 0.008), c[1] + 0.006 + v.co.y * 0.018, c[2] - hz * 0.02 + v.co.z * 0.03))
        objs.append(new_obj(f'{name}_ear{s}', bm, [materials['Skin']], smooth=True))
    # hair cap
    style = P.get('hair', 'short')
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=48, v_segments=32, radius=1.0)
    kill = []
    for v in bm.verts:
        X, Fw, U = v.co.x, -v.co.y, v.co.z
        if style == 'short':
            line = 0.44 if Fw > 0.55 else (0.2 if Fw > 0.25 else (0.02 if Fw > -0.2 else -0.38))
        elif style == 'bald':
            line = 0.55 if Fw > -0.2 else 0.0
        else:  # long / wild
            line = 0.3 if Fw > 0.55 else (0.0 if Fw > 0.25 else -1.2)
        if U < line:
            kill.append(v)
        else:
            bulk = (1.035 + 0.04 * max(0, U)) if style == 'short' else 1.2
            wild = 1 + (0.11 * math.sin(X * 23 + U * 7) * math.sin(U * 19) + 0.05 * math.sin(X * 61) if style != 'short' else 0.012 * math.sin(X * 40) * math.sin(U * 37))
            r = bulk * wild
            Fw2 = Fw if Fw < 0.45 else 0.45 + (Fw - 0.45) * 0.62
            if style != 'short' and U < -0.1:
                X *= 1.25  # mane widens over shoulders
                Fw2 = min(Fw2, 0.1) - 0.15
            v.co = Vector((c[0] + X * wx * r, c[1] - Fw2 * fdep * r, c[2] + U * hz * r + 0.006))
    bmesh.ops.delete(bm, geom=kill, context='VERTS')
    bm.normal_update()
    if bm.verts:
        hair = new_obj(name + '_hair', bm, [materials['Hair']], smooth=True)
        sol = hair.modifiers.new('sol', 'SOLIDIFY')
        sol.thickness = 0.006
        apply_mods(hair)
        objs.append(hair)
    # beard
    if P.get('beard'):
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=40, v_segments=28, radius=1.0)
        kill = []
        for v in bm.verts:
            X, Fw, U = v.co.x, -v.co.y, v.co.z
            if U > -0.18 or Fw < -0.1 or (abs(X) < 0.25 and U > -0.3 and Fw > 0.6):
                kill.append(v)
            else:
                if U < -0.15:
                    X *= 1 - 0.3 * (-U - 0.15) / 0.85
                Fw = Fw if Fw < 0.45 else 0.45 + (Fw - 0.45) * 0.62
                r = 1.07 + 0.05 * math.sin(X * 31) * math.sin(U * 27) + max(0, -U - 0.6) * 0.5
                v.co = Vector((c[0] + X * wx * r, c[1] - Fw * fdep * r - 0.004, c[2] + U * hz * r - max(0, -U - 0.5) * 0.06))
        bmesh.ops.delete(bm, geom=kill, context='VERTS')
        if bm.verts:
            bd = new_obj(name + '_beard', bm, [materials['Hair']], smooth=True)
            sol = bd.modifiers.new('sol', 'SOLIDIFY')
            sol.thickness = 0.005
            apply_mods(bd)
            objs.append(bd)
    return objs


# ---------------------------------------------------------------------------
# Humans
# ---------------------------------------------------------------------------

def human(name, P, materials):
    s = P.get('h', 1.0)
    girth = P.get('girth', 1.0)
    belly = P.get('belly', 1.0)
    J = {
        'pelvis': (0, 0, 0.98), 'spine': (0, 0.005, 1.12), 'chest': (0, 0.0, 1.31), 'neck': (0, 0.012, 1.49), 'headb': (0, 0.006, 1.6),
    }
    for sd, sx in (('L', 1), ('R', -1)):
        J.update({
            f'hip{sd}': (sx * 0.095, 0.0, 0.93), f'thigh{sd}': (sx * 0.1, -0.01, 0.72), f'knee{sd}': (sx * 0.102, -0.012, 0.51),
            f'calf{sd}': (sx * 0.104, 0.008, 0.33), f'ankle{sd}': (sx * 0.106, 0.02, 0.09), f'ball{sd}': (sx * 0.11, -0.085, 0.035),
            f'toe{sd}': (sx * 0.112, -0.135, 0.03),
            f'clav{sd}': (sx * 0.06, 0.012, 1.44), f'shoulder{sd}': (sx * 0.185, 0.015, 1.425), f'uarm{sd}': (sx * 0.205, 0.02, 1.29),
            f'elbow{sd}': (sx * 0.222, 0.03, 1.15), f'farm{sd}': (sx * 0.232, 0.018, 1.04), f'wrist{sd}': (sx * 0.24, 0.0, 0.915),
            f'palm{sd}': (sx * 0.246, -0.006, 0.86), f'fing{sd}': (sx * 0.248, -0.014, 0.775),
            f'thumbb{sd}': (sx * 0.232, -0.022, 0.895), f'thumb{sd}': (sx * 0.226, -0.042, 0.85),
        })
    J = {k: (v[0] * (girth ** 0.3 if abs(v[0]) > 0.05 and k[:3] in ('sho', 'uar', 'elb', 'far', 'wri', 'pal', 'fin', 'thu') else 1), v[1], v[2] * s) for k, v in J.items()}
    E = [('pelvis', 'spine'), ('spine', 'chest'), ('chest', 'neck'), ('neck', 'headb')]
    for sd in 'LR':
        E += [('pelvis', f'hip{sd}'), (f'hip{sd}', f'thigh{sd}'), (f'thigh{sd}', f'knee{sd}'), (f'knee{sd}', f'calf{sd}'),
              (f'calf{sd}', f'ankle{sd}'), (f'ankle{sd}', f'ball{sd}'), (f'ball{sd}', f'toe{sd}'),
              ('chest', f'clav{sd}'), (f'clav{sd}', f'shoulder{sd}'), (f'shoulder{sd}', f'uarm{sd}'), (f'uarm{sd}', f'elbow{sd}'),
              (f'elbow{sd}', f'farm{sd}'), (f'farm{sd}', f'wrist{sd}'), (f'wrist{sd}', f'palm{sd}'), (f'palm{sd}', f'fing{sd}'),
              (f'wrist{sd}', f'thumbb{sd}'), (f'thumbb{sd}', f'thumb{sd}')]
    g, b = girth, belly
    Rr = {'pelvis': (0.155 * g, 0.105 * g), 'spine': (0.145 * g * b, 0.105 * g * b), 'chest': (0.165 * g, 0.108 * g), 'neck': 0.058 * g ** 0.5, 'headb': 0.054}
    for sd in 'LR':
        Rr.update({
            f'hip{sd}': 0.085 * g, f'thigh{sd}': 0.074 * g, f'knee{sd}': 0.05 * g ** 0.5, f'calf{sd}': 0.054 * g ** 0.6, f'ankle{sd}': 0.034,
            f'ball{sd}': (0.042, 0.026), f'toe{sd}': (0.036, 0.022),
            f'clav{sd}': 0.06 * g, f'shoulder{sd}': 0.056 * g, f'uarm{sd}': 0.047 * g, f'elbow{sd}': 0.037 * g ** 0.5, f'farm{sd}': 0.04 * g ** 0.6,
            f'wrist{sd}': 0.027, f'palm{sd}': (0.018, 0.04), f'fing{sd}': (0.012, 0.03), f'thumbb{sd}': 0.013, f'thumb{sd}': 0.0105,
        })
    body = skin_body(name + '_body', J, E, Rr, 'pelvis', levels=2)
    # head
    hc = (0, -0.014, J['headb'][2] + 0.075 * s)
    head_objs = sculpt_head(name, hc, (0.08 * P.get('headw', 1.0), 0.1, 0.112), P, materials)
    # shirt collar (modern)
    extra = []
    if P.get('modern'):
        bm = bmesh.new()
        n = 40
        rings = []
        for k, (rr, zz) in enumerate([(0.07, 1.47 * s), (0.064, 1.5 * s), (0.071, 1.518 * s)]):
            rings.append([bm.verts.new(Vector((math.cos(2 * math.pi * i / n) * rr * 1.05, 0.006 + math.sin(2 * math.pi * i / n) * rr * 0.95, zz + (0.012 * max(0, -math.sin(2 * math.pi * i / n)) if k == 2 else 0)))) for i in range(n)])
        for k in range(2):
            for i in range(n):
                j = (i + 1) % n
                # open collar at the front (skip a V at the throat)
                ang = 2 * math.pi * (i + 0.5) / n
                if math.sin(ang) < -0.93:
                    continue
                bm.faces.new((rings[k][i], rings[k][j], rings[k + 1][j], rings[k + 1][i]))
        bm.normal_update()
        col = new_obj(name + '_collar', bm, [materials['Shirt']], smooth=True)
        sol = col.modifiers.new('sol', 'SOLIDIFY')
        sol.thickness = 0.004
        apply_mods(col)
        extra.append(col)
    # bones
    def jt(k):
        return J[k]
    bones = [('hips', jt('pelvis'), jt('spine'), None), ('spine', jt('spine'), jt('chest'), 'hips'), ('chest', jt('chest'), jt('neck'), 'spine'),
             ('neck', jt('neck'), jt('headb'), 'chest'), ('head', jt('headb'), (0, 0, jt('headb')[2] + 0.22 * s), 'neck')]
    for sd in 'LR':
        bones += [(f'thigh.{sd}', jt(f'hip{sd}'), jt(f'knee{sd}'), 'hips'), (f'shin.{sd}', jt(f'knee{sd}'), jt(f'ankle{sd}'), f'thigh.{sd}'),
                  (f'foot.{sd}', jt(f'ankle{sd}'), jt(f'ball{sd}'), f'shin.{sd}'), (f'toe.{sd}', jt(f'ball{sd}'), jt(f'toe{sd}'), f'foot.{sd}'),
                  (f'clav.{sd}', jt(f'clav{sd}'), jt(f'shoulder{sd}'), 'chest'), (f'uparm.{sd}', jt(f'shoulder{sd}'), jt(f'elbow{sd}'), f'clav.{sd}'),
                  (f'farm.{sd}', jt(f'elbow{sd}'), jt(f'wrist{sd}'), f'uparm.{sd}'), (f'hand.{sd}', jt(f'wrist{sd}'), jt(f'palm{sd}'), f'farm.{sd}'),
                  (f'finger.{sd}', jt(f'palm{sd}'), jt(f'fing{sd}'), f'hand.{sd}'), (f'thumb.{sd}', jt(f'thumbb{sd}'), jt(f'thumb{sd}'), f'hand.{sd}')]
    rad = {'hips': 0.15, 'spine': 0.14, 'chest': 0.15, 'neck': 0.06, 'head': 0.12}
    for sd in 'LR':
        rad.update({f'thigh.{sd}': 0.085, f'shin.{sd}': 0.055, f'foot.{sd}': 0.04, f'toe.{sd}': 0.03, f'clav.{sd}': 0.06,
                    f'uparm.{sd}': 0.05, f'farm.{sd}': 0.04, f'hand.{sd}': 0.03, f'finger.{sd}': 0.015, f'thumb.{sd}': 0.013})
    rig = build_armature(name, bones)
    # materials on body faces by region
    me = body.data
    for k in ('Skin', 'Top', 'Bottom', 'Shoes', 'Shirt'):
        me.materials.append(materials[k])
    zs = lambda z: z / s
    for poly in me.polygons:
        cpos = poly.center
        z, x = zs(cpos.z), abs(cpos.x)
        mi = 0
        if P.get('modern'):
            if z < 0.115 and x > 0.04:
                mi = 3  # shoes
            elif z < 0.925 and x < 0.2:
                mi = 2  # jeans
            elif z < 0.965 and x < 0.2:
                mi = 4  # shirt hem peeking under sweater
            elif x > 0.22 and z < 0.935:
                mi = 0  # hands
            elif x > 0.215 and z < 0.955:
                mi = 4  # shirt cuff
            elif z < 1.5:
                mi = 1  # sweater
            else:
                mi = 0
        else:
            wrap = P.get('wrap', 'loin')
            if 0.8 < z < 1.0 and x < 0.2:
                mi = 1  # fur loin cloth
            elif wrap in ('cape', 'dress') and 1.2 < z < 1.47 and x < 0.21 and (cpos.y > -0.02 or wrap == 'dress'):
                mi = 1
            elif wrap == 'dress' and 1.0 <= z <= 1.2 and x < 0.2:
                mi = 1
            elif wrap == 'strap' and abs((cpos.x * (1 if True else -1)) - (z - 1.25) * 0.9) < 0.045 and 1.0 < z < 1.47 and x < 0.2:
                mi = 1
            else:
                mi = 0
        poly.material_index = mi
    # join head parts / collar
    parts = head_objs + extra
    for o in parts:
        for m_ in o.data.materials:
            if m_.name not in [mm.name for mm in me.materials]:
                me.materials.append(m_)
    head_vcount_before = len(me.vertices)
    join_into(body, parts)
    me = body.data
    # vertex colours: skin tone, stubble, lips, cheeks; white elsewhere (fabric)
    tone = P.get('skin', (0.78, 0.56, 0.44))
    stub = P.get('stubble', 0.0)
    eye_mat_idx = [i for i, m_ in enumerate(me.materials) if m_.name.startswith('Eye')]
    keep_existing = 'Col' in me.color_attributes
    cz = hc[2]
    hz_ = 0.112
    def vc(co, poly):
        if poly.material_index in eye_mat_idx:
            return None
        mname = me.materials[poly.material_index].name
        if 'Skin' not in mname:
            return (1, 1, 1)
        r, g_, b_ = tone
        U = (co.z - cz) / hz_
        Fw = -(co.y - hc[1]) / 0.1
        if co.z > 1.3 * s:
            if -0.48 < U < -0.28 and abs(co.x) < 0.024 and Fw > 0.75:
                return (r * 0.82, g_ * 0.5, b_ * 0.5)  # lips
            if U < -0.2 and Fw > 0.0 and stub > 0:
                k = stub * sstep(-0.2, -0.32, U)
                r, g_, b_ = r * (1 - 0.45 * k), g_ * (1 - 0.48 * k), b_ * (1 - 0.45 * k)
            ch = math.exp(-((abs(co.x) - 0.045) / 0.02) ** 2 - ((U + 0.1) / 0.12) ** 2) * (Fw > 0.4)
            r, g_ = r * (1 + 0.08 * ch), g_ * (1 - 0.06 * ch)
        return (r, g_, b_)
    if 'Col' not in me.color_attributes:
        me.color_attributes.new('Col', 'BYTE_COLOR', 'CORNER')
    ca = me.color_attributes['Col']
    for poly in me.polygons:
        for li in poly.loop_indices:
            c = vc(me.vertices[me.loops[li].vertex_index].co, poly)
            if c is not None:
                ca.data[li].color = (c[0], c[1], c[2], 1.0)
    # weights: head parts rigid to 'head'
    head_z = J['headb'][2] - 0.01
    def ov(v):
        if v.co.z > head_z + 0.012 or (v.co.z > head_z - 0.02 and abs(v.co.y + 0.02) < 0.15 and abs(v.co.x) < 0.09 and v.co.z > J['neck'][2] + 0.05):
            return {'head': 1.0}
        return None
    skin_weights(body, bones, rad, ov)
    # shape keys for face
    body.shape_key_add(name='Basis')
    mo = body.shape_key_add(name='MouthOpen')
    br = body.shape_key_add(name='Brow')
    mo.value = br.value = 0.0
    piv = Vector((0, hc[1] + 0.035, cz - 0.01))
    for i, v in enumerate(me.vertices):
        U = (v.co.z - cz) / 0.112
        Fw = -(v.co.y - hc[1]) / 0.1
        if v.co.z > J['neck'][2] and abs(v.co.x) < 0.085:
            w = sstep(-0.36, -0.42, U) * sstep(-0.3, 0.3, Fw)
            if w > 0:
                ang = math.radians(14) * w
                d = v.co - piv
                ny = d.y * math.cos(ang) - d.z * math.sin(ang)
                nz = d.y * math.sin(ang) + d.z * math.cos(ang)
                mo.data[i].co = Vector((v.co.x * (1 - 0.06 * w), piv.y + ny, piv.z + nz))
            # brow furrow: brows/forehead down & inward
            wb = math.exp(-((U - 0.21) / 0.07) ** 2) * (Fw > 0.5)
            if wb > 0.01:
                br.data[i].co = Vector((v.co.x * (1 - 0.08 * wb), v.co.y - 0.002 * wb, v.co.z - 0.006 * wb * (1.2 - abs(v.co.x) / 0.05)))
    bind(body, rig)
    body.name = name + '_mesh'
    return rig


def human_materials(prefix, modern):
    M = {
        'Skin': mat(f'{prefix}Skin', (1, 1, 1), 0, 0.5),
        'Eye': mat(f'EyeBall', (1, 1, 1), 0, 0.08),
        'Hair': mat(f'{prefix}Hair', (0.05, 0.035, 0.025), 0, 0.6),
    }
    if modern:
        M.update(Top=mat('Man_Sweater', (0.6, 0.06, 0.07), 0, 0.9), Bottom=mat('Man_Jeans', (0.12, 0.2, 0.36), 0, 0.85),
                 Shoes=mat('Man_Shoes', (0.18, 0.1, 0.05), 0, 0.4), Shirt=mat('Man_Shirt', (0.82, 0.86, 0.92), 0, 0.7))
    else:
        M.update(Top=mat(f'{prefix}Fur', (0.4, 0.28, 0.16), 0, 0.95), Bottom=mat(f'{prefix}Fur'), Shoes=mat(f'{prefix}Skin'), Shirt=mat(f'{prefix}Skin'))
    return M


# ---------------------------------------------------------------------------
# Dinosaur (Gallimimus-like ornithomimid)
# ---------------------------------------------------------------------------

def dinosaur(name='Dino'):
    J = {'pelvis': (0, 0.0, 1.55), 't1': (0, 0.55, 1.6), 't2': (0, 1.15, 1.56), 't3': (0, 1.75, 1.47), 't4': (0, 2.3, 1.38), 'tip': (0, 2.85, 1.3),
         'belly': (0, -0.35, 1.45), 'chest': (0, -0.7, 1.52), 'n1': (0, -0.98, 1.74), 'n2': (0, -1.2, 1.98), 'n3': (0, -1.38, 2.14), 'hb': (0, -1.5, 2.2),
         'skull': (0, -1.63, 2.2), 'beak': (0, -1.82, 2.12)}
    for sd, sx in (('L', 1), ('R', -1)):
        J.update({f'hip{sd}': (sx * 0.2, 0.02, 1.45), f'knee{sd}': (sx * 0.23, -0.28, 1.02), f'ankle{sd}': (sx * 0.21, 0.16, 0.48),
                  f'mtp{sd}': (sx * 0.2, 0.02, 0.08), f'toe{sd}': (sx * 0.2, -0.2, 0.03),
                  f'sh{sd}': (sx * 0.15, -0.78, 1.35), f'el{sd}': (sx * 0.18, -0.86, 1.12), f'ha{sd}': (sx * 0.18, -1.0, 1.02)})
    E = [('pelvis', 't1'), ('t1', 't2'), ('t2', 't3'), ('t3', 't4'), ('t4', 'tip'), ('pelvis', 'belly'), ('belly', 'chest'), ('chest', 'n1'),
         ('n1', 'n2'), ('n2', 'n3'), ('n3', 'hb'), ('hb', 'skull'), ('skull', 'beak')]
    for sd in 'LR':
        E += [('pelvis', f'hip{sd}'), (f'hip{sd}', f'knee{sd}'), (f'knee{sd}', f'ankle{sd}'), (f'ankle{sd}', f'mtp{sd}'), (f'mtp{sd}', f'toe{sd}'),
              ('chest', f'sh{sd}'), (f'sh{sd}', f'el{sd}'), (f'el{sd}', f'ha{sd}')]
    Rr = {'pelvis': (0.24, 0.3), 't1': 0.2, 't2': 0.14, 't3': 0.09, 't4': 0.05, 'tip': 0.014, 'belly': (0.27, 0.34), 'chest': (0.24, 0.3),
          'n1': 0.12, 'n2': 0.085, 'n3': 0.07, 'hb': 0.065, 'skull': (0.06, 0.07), 'beak': (0.022, 0.03)}
    for sd in 'LR':
        Rr.update({f'hip{sd}': 0.2, f'knee{sd}': 0.11, f'ankle{sd}': 0.06, f'mtp{sd}': 0.04, f'toe{sd}': (0.05, 0.02),
                   f'sh{sd}': 0.05, f'el{sd}': 0.035, f'ha{sd}': 0.025})
    body = skin_body(name + '_body', J, E, Rr, 'pelvis', levels=2)
    skinm = mat('Dino_Skin', (1, 1, 1), 0, 0.7)
    eyem = mat('EyeBall', (1, 1, 1), 0, 0.08)
    body.data.materials.append(skinm)
    eyes = []
    for s in (-1, 1):
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=14, v_segments=10, radius=0.022)
        for v in bm.verts:
            v.co = Vector((v.co.x + s * 0.052, v.co.y - 1.64, v.co.z + 2.245))
        e = new_obj(f'{name}_eye{s}', bm, [eyem], smooth=True)
        set_vcol(e, lambda co, p: (0.05, 0.03, 0.01) if abs(co.x) > 0.06 else (0.85, 0.62, 0.15))
        eyes.append(e)
    join_into(body, eyes)
    me = body.data
    if 'Col' not in me.color_attributes:
        me.color_attributes.new('Col', 'BYTE_COLOR', 'CORNER')
    ca = me.color_attributes['Col']
    rnd = random.Random(3)
    spots = [(rnd.uniform(-1.0, 2.6), rnd.uniform(1.3, 2.6), rnd.uniform(0.04, 0.12)) for _ in range(70)]
    for poly in me.polygons:
        if me.materials[poly.material_index].name.startswith('Eye'):
            continue
        for li in poly.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            # countershading: dark olive/umber back, ochre flanks, cream belly + spots
            top = sstep(-0.05, 0.15, co.z - 1.45 - (0.0 if co.y > -0.9 else (co.z - 1.45) * 0.4)) if co.z > 0.6 else 0.0
            side = abs(co.x)
            dorsal = sstep(0.12, 0.0, side) * sstep(1.4, 1.7, co.z)
            r, g_, b_ = 0.78, 0.62, 0.38  # ochre
            r, g_, b_ = r * (1 - 0.45 * dorsal), g_ * (1 - 0.42 * dorsal), b_ * (1 - 0.5 * dorsal)
            if co.z < 1.35 and co.z > 0.9 and side < 0.2:
                r, g_, b_ = 0.92, 0.84, 0.66  # belly
            for sy, sz, sr in spots:
                if (co.y - sy) ** 2 + (co.z - sz) ** 2 < sr * sr and side > 0.08:
                    r, g_, b_ = r * 0.6, g_ * 0.55, b_ * 0.5
            ca.data[li].color = (r, g_, b_, 1)
    bones = [('pelvis', J['pelvis'], J['belly'], None), ('chest', J['belly'], J['chest'], 'pelvis'),
             ('tail1', J['pelvis'], J['t1'], 'pelvis'), ('tail2', J['t1'], J['t2'], 'tail1'), ('tail3', J['t2'], J['t3'], 'tail2'),
             ('tail4', J['t3'], J['t4'], 'tail3'), ('tail5', J['t4'], J['tip'], 'tail4'),
             ('neck1', J['chest'], J['n1'], 'chest'), ('neck2', J['n1'], J['n2'], 'neck1'), ('neck3', J['n2'], J['n3'], 'neck2'),
             ('neck4', J['n3'], J['hb'], 'neck3'), ('head', J['hb'], J['beak'], 'neck4')]
    for sd in 'LR':
        bones += [(f'thigh.{sd}', J[f'hip{sd}'], J[f'knee{sd}'], 'pelvis'), (f'shin.{sd}', J[f'knee{sd}'], J[f'ankle{sd}'], f'thigh.{sd}'),
                  (f'meta.{sd}', J[f'ankle{sd}'], J[f'mtp{sd}'], f'shin.{sd}'), (f'toe.{sd}', J[f'mtp{sd}'], J[f'toe{sd}'], f'meta.{sd}'),
                  (f'arm.{sd}', J[f'sh{sd}'], J[f'el{sd}'], 'chest'), (f'farm.{sd}', J[f'el{sd}'], J[f'ha{sd}'], f'arm.{sd}')]
    rad = {'pelvis': 0.3, 'chest': 0.28, 'tail1': 0.2, 'tail2': 0.15, 'tail3': 0.1, 'tail4': 0.06, 'tail5': 0.03,
           'neck1': 0.13, 'neck2': 0.09, 'neck3': 0.075, 'neck4': 0.07, 'head': 0.07}
    for sd in 'LR':
        rad.update({f'thigh.{sd}': 0.15, f'shin.{sd}': 0.07, f'meta.{sd}': 0.045, f'toe.{sd}': 0.035, f'arm.{sd}': 0.04, f'farm.{sd}': 0.03})
    rig = build_armature(name, bones)
    skin_weights(body, bones, rad)
    bind(body, rig)
    body.name = name + '_mesh'
    return rig


PEOPLE = [
    dict(name='Cave1', h=0.97, girth=1.15, belly=1.1, skin=(0.62, 0.42, 0.3), hair='wild', beard=True, wrap='strap', iris=(0.15, 0.09, 0.04)),
    dict(name='Cave2', h=0.92, girth=0.95, skin=(0.7, 0.5, 0.36), hair='long', wrap='dress', jaw=0.8, iris=(0.2, 0.12, 0.05)),
    dict(name='Cave3', h=1.02, girth=1.05, skin=(0.55, 0.37, 0.26), hair='wild', beard=True, wrap='loin', brow=1.5, nose=1.3),
    dict(name='Cave4', h=0.88, girth=1.25, belly=1.25, skin=(0.66, 0.46, 0.33), hair='long', beard=True, wrap='cape'),
    dict(name='Cave5', h=0.95, girth=0.9, skin=(0.74, 0.54, 0.4), hair='long', wrap='dress', jaw=0.85),
    dict(name='Cave6', h=0.99, girth=1.0, skin=(0.5, 0.33, 0.23), hair='bald', beard=True, wrap='strap', brow=1.4),
]


def build_and_export(out, preview):
    # the man
    M = human_materials('Man_', True)
    man = human('Man', dict(modern=True, h=1.0, girth=1.04, belly=1.06, skin=(0.8, 0.58, 0.46), hair='short', stubble=0.85,
                            iris=(0.25, 0.15, 0.07), nose=1.1), M)
    export_glb(os.path.join(out, 'man.glb'), [man])
    rigs = []
    for i, Pp in enumerate(PEOPLE):
        Mm = human_materials(f'{Pp["name"]}_', False)
        r = human(Pp['name'], Pp, Mm)
        r.location = (i * 0.7 - 1.75, 0, 0)
        rigs.append(r)
    export_glb(os.path.join(out, 'cave_people.glb'), rigs)
    for r in rigs:
        r.location = (0, 0, 0)
    dino = dinosaur()
    export_glb(os.path.join(out, 'dinosaur.glb'), [dino])
    if preview:
        man.location = (-3.0, 0, 0)
        for i, r in enumerate(rigs):
            r.location = (-2.0 + i * 0.6, 0, 0)
        dino.location = (3.0, 0, 0)
        dino.rotation_euler = (0, 0, math.radians(-70))
        preview('characters', [], (0.3, -8.5, 1.6), (0.3, 0, 1.15), lens=40, res=(1600, 700))
        # face close-up of the man
        for o in [o for o in bpy.data.objects if o.type == 'CAMERA' or o.type == 'LIGHT']:
            bpy.data.objects.remove(o)
        preview('man_face', [], (-2.85, -0.75, 1.72), (-3.0, 0, 1.66), lens=60, res=(700, 700))
