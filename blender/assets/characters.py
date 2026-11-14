"""Characters: one shared skeleton, skinned bodies built from swept elliptical tubes with proximity-blended
weights (smooth elbows, knees and waist), rigid heads, hands, boots and equipment.

  char_civilian.glb   work clothes: shirt, jeans, boots; separate cap + hair meshes (farmers, neighbours, NASA staff)
  char_astronaut.glb  layered EVA suit with life-support backpack, chest pack, gloves, boots; separate helmet

Characters face +Y in Blender (-Z in the engine). Animation is procedural in the engine and addresses bones by name.
"""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "lib"))
from bl import *  # noqa: E402,F403
from mathutils import Matrix, Vector  # noqa: E402

T = Matrix.Translation


def Rm(deg, axis):
    return Matrix.Rotation(math.radians(deg), 4, axis)


def skeleton():
    b = {}
    b["hips"] = ((0, 0, 0.96), (0, 0, 1.08), None)
    b["spine"] = ((0, 0, 1.08), (0, 0, 1.26), "hips")
    b["chest"] = ((0, 0, 1.26), (0, 0, 1.5), "spine")
    b["neck"] = ((0, 0, 1.5), (0, 0, 1.6), "chest")
    b["head"] = ((0, 0, 1.6), (0, 0, 1.82), "neck")
    for s, n in ((1, "r"), (-1, "l")):
        b[f"upperarm_{n}"] = ((s * 0.2, 0, 1.445), (s * 0.245, 0.005, 1.16), "chest")
        b[f"forearm_{n}"] = ((s * 0.245, 0.005, 1.16), (s * 0.258, 0.025, 0.905), f"upperarm_{n}")
        b[f"hand_{n}"] = ((s * 0.258, 0.025, 0.905), (s * 0.262, 0.032, 0.74), f"forearm_{n}")
        b[f"thigh_{n}"] = ((s * 0.092, 0, 0.94), (s * 0.105, 0.01, 0.52), "hips")
        b[f"shin_{n}"] = ((s * 0.105, 0.01, 0.52), (s * 0.11, -0.008, 0.1), f"thigh_{n}")
        b[f"foot_{n}"] = ((s * 0.11, -0.008, 0.1), (s * 0.11, 0.15, 0.03), f"shin_{n}")
    return b


BONES = skeleton()


def make_armature(name):
    arm = bpy.data.armatures.new(name)
    ob = bpy.data.objects.new(name, arm)
    bpy.context.scene.collection.objects.link(ob)
    for o in bpy.context.scene.objects:
        o.select_set(False)
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.mode_set(mode="EDIT")
    eb = {}
    for n, (h, t, p) in BONES.items():
        e = arm.edit_bones.new(n)
        e.head, e.tail = h, t
        eb[n] = e
    for n, (h, t, p) in BONES.items():
        if p:
            eb[n].parent = eb[p]
            eb[n].use_connect = False
    bpy.ops.object.mode_set(mode="OBJECT")
    return ob


def seg_dist(p, a, b):
    ab = b - a
    t = max(0.0, min(1.0, (p - a).dot(ab) / ab.length_squared))
    return (p - (a + ab * t)).length


def bind(ob, bones, power=7.0):
    """Proximity skin weights restricted to a chain of bones; blends only across joints of that chain."""
    segs = [(n, Vector(BONES[n][0]), Vector(BONES[n][1])) for n in bones]
    groups = {n: ob.vertex_groups.get(n) or ob.vertex_groups.new(name=n) for n in bones}
    for v in ob.data.vertices:
        ws = [(n, 1.0 / (seg_dist(v.co, a, b) + 0.006) ** power) for n, a, b in segs]
        ws.sort(key=lambda q: -q[1])
        ws = ws[:2]
        tot = sum(w for _, w in ws)
        for n, w in ws:
            if w / tot > 0.02:
                groups[n].add([v.index], w / tot, "REPLACE")


def rigid(ob, bone):
    g = ob.vertex_groups.new(name=bone)
    g.add([v.index for v in ob.data.vertices], 1.0, "REPLACE")


def tube(P, rings, mats, segs=14, cap0=True, cap1=True):
    """rings: [(centre(x,y,z), rx, ry)] ellipses in the horizontal plane (limbs are near vertical); mats per interval."""
    verts, faces = [], []
    for (c, rx, ry) in rings:
        for k in range(segs):
            a = math.tau * k / segs
            verts.append((c[0] + math.cos(a) * rx, c[1] + math.sin(a) * ry, c[2]))
    by_mat = {}
    for i in range(len(rings) - 1):
        for k in range(segs):
            a, b = i * segs + k, i * segs + (k + 1) % segs
            # rings ascend or descend: orient outward for either direction
            up = rings[i + 1][0][2] > rings[i][0][2]
            f = (a, b, b + segs, a + segs) if up else (a + segs, b + segs, b, a)
            by_mat.setdefault(mats[i] if isinstance(mats, (list, tuple)) else mats, []).append(f)
    for m, fs in by_mat.items():
        P.mesh(verts, fs, mat=m, recalc=False, bevel=0)
    m0 = mats[0] if isinstance(mats, (list, tuple)) else mats
    m1 = mats[-1] if isinstance(mats, (list, tuple)) else mats
    up = rings[1][0][2] > rings[0][0][2]
    if cap0:
        r = list(range(segs))
        P.mesh(verts, [tuple(reversed(r)) if up else tuple(r)], mat=m0, recalc=False, bevel=0)
    if cap1:
        r = [(len(rings) - 1) * segs + k for k in range(segs)]
        P.mesh(verts, [tuple(r) if up else tuple(reversed(r))], mat=m1, recalc=False, bevel=0)


def head_part(skin="skin", hair="hair_brown", female=False):
    H = Part("head")
    rings = [((0, 0.03, 1.582), 0.026, 0.03), ((0, 0.022, 1.6), 0.05, 0.06), ((0, 0.014, 1.63), 0.065, 0.077), ((0, 0.009, 1.67), 0.072, 0.087),
             ((0, 0.005, 1.71), 0.075, 0.093), ((0, 0.0, 1.75), 0.076, 0.095), ((0, -0.004, 1.79), 0.069, 0.089), ((0, -0.006, 1.82), 0.05, 0.066), ((0, -0.006, 1.836), 0.022, 0.03)]
    tube(H, rings, skin, segs=18)
    # nose, brow ridge, eyes, mouth, ears
    H.loft([[(-0.006, 0.095, 1.722), (0.006, 0.095, 1.722), (0.006, 0.09, 1.728), (-0.006, 0.09, 1.728)],
            [(-0.015, 0.112, 1.676), (0.015, 0.112, 1.676), (0.012, 0.092, 1.682), (-0.012, 0.092, 1.682)],
            [(-0.016, 0.098, 1.664), (0.016, 0.098, 1.664), (0.012, 0.088, 1.666), (-0.012, 0.088, 1.666)]], mat=skin, bevel=0.004)
    for s in (-1, 1):
        H.sphere(0.0125, at=(s * 0.031, 0.083, 1.712), mat="eye_white", segs=12, rings=8)
        H.sphere(0.0072, at=(s * 0.031, 0.0925, 1.712), mat="eye", segs=10, rings=6)
        H.box((0.034, 0.014, 0.009), at=(s * 0.031, 0.09, 1.7215), rot=(18, 0, -s * 6), mat=skin, bevel=0.003)             # upper lid
        H.box((0.034, 0.008, 0.0045), at=(s * 0.032, 0.0925, 1.731), rot=(14, 0, -s * 7), mat=hair, bevel=0.0018)         # brow
        H.sphere(0.022, at=(s * 0.076, 0.0, 1.7), mat=skin, segs=10, rings=8, scale=(0.35, 0.7, 1.0))                     # ear
    H.box((0.044, 0.008, 0.0075), at=(0, 0.088, 1.636), mat="lips", bevel=0.003)
    H.box((0.03, 0.01, 0.006), at=(0, 0.086, 1.628), mat="lips", bevel=0.002)
    return H


def hair_part(hair="hair_brown", female=False):
    P = Part("hair")
    # close-cropped cap of hair over the crown and back of the skull
    P.sphere(1.0, at=(0, -0.012, 1.772), mat=hair, segs=18, rings=12, scale=(0.0805, 0.1, 0.074))
    P.box((0.1, 0.05, 0.05), at=(0, -0.07, 1.7), mat=hair, bevel=0.022)
    if female:
        P.sphere(1.0, at=(0, -0.05, 1.68), mat=hair, segs=16, rings=10, scale=(0.082, 0.07, 0.11))
        P.box((0.07, 0.07, 0.16), at=(0, -0.085, 1.56), rot=(8, 0, 0), mat=hair, bevel=0.03)          # tied back
    return P


def cap_part(mat="cloth_khaki"):
    P = Part("cap")
    P.lathe([(0.0, 0.085), (0.04, 0.08), (0.075, 0.05), (0.086, 0.0), (0.084, -0.004), (0.0, -0.004)], at=(0, -0.004, 1.775), mat=mat, segs=18, bevel=0)
    P.box((0.15, 0.11, 0.01), at=(0, 0.125, 1.778), rot=(-10, 0, 0), mat=mat, bevel=0.004)
    P.cyl(0.009, 0.006, at=(0, -0.004, 1.862), mat=mat, segs=8, bevel=0)
    return P


def hand_part(P, s, mat="skin", scale=1.0):
    c = Vector((s * 0.26, 0.03, 0.905))
    k = scale
    P.box((0.03 * k, 0.08 * k, 0.095 * k), at=(c.x, c.y, c.z - 0.05 * k), mat=mat, bevel=0.012 * k)
    for i, dy in enumerate((-0.028, -0.0095, 0.0095, 0.028)):
        ln = (0.07, 0.08, 0.076, 0.062)[i] * k
        P.box((0.02 * k, 0.0165 * k, ln), at=(c.x - s * 0.006, c.y + dy * k, c.z - 0.095 * k - ln / 2), rot=(0, -s * 10, 0), mat=mat, bevel=0.006 * k)
    P.box((0.02 * k, 0.022 * k, 0.058 * k), at=(c.x - s * 0.008, c.y + 0.05 * k, c.z - 0.055 * k), rot=(-28, 0, 0), mat=mat, bevel=0.007 * k)


def boot_part(P, s, mat="rubber", sole="rubber", bulky=False):
    x = s * 0.11
    w = 1.25 if bulky else 1.0
    P.box((0.1 * w, 0.29 * w, 0.03), at=(x, 0.05, 0.015), mat=sole, bevel=0.008)
    P.box((0.092 * w, 0.12 * w, 0.15), at=(x, -0.02, 0.105), mat=mat, bevel=0.03)
    P.box((0.098 * w, 0.15 * w, 0.09), at=(x, 0.075, 0.073), mat=mat, bevel=0.03)
    P.box((0.094 * w, 0.09 * w, 0.065), at=(x, 0.165 * w, 0.06), mat=mat, bevel=0.026)


def finish_char(name, parts, extras):
    """parts: [(Part, chain or bone)] joined into one skinned body; extras: [(Part, bone, part_id)] kept separate."""
    arm = make_armature(name)
    objs = []
    for P, target in parts:
        ob = P.finish(sharp=50, col=0)
        if isinstance(target, str):
            rigid(ob, target)
        else:
            bind(ob, target)
        objs.append(ob)
    bake_ao(objs, local_dist=0.35, sky_dist=3.0)
    body = objs[0]
    with bpy.context.temp_override(active_object=body, selected_editable_objects=objs, selected_objects=objs, object=body):
        bpy.ops.object.join()
    body.name = name + "_body"
    props(body, part="body", col=0)
    out = [body]
    for P, bone, pid in extras:
        ob = P.finish(sharp=50, col=0)
        rigid(ob, bone)
        bake_ao([ob], local_dist=0.35, sky_dist=3.0)
        ob.name = f"{name}_{pid}"
        props(ob, part=pid, col=0)
        out.append(ob)
    for ob in out:
        ob.parent = arm
        md = ob.modifiers.new("arm", "ARMATURE")
        md.object = arm
    return arm, out


# ======================================================================================= civilian
def civilian():
    reset()
    shirt, pants, belt, skin = "cloth_plaid", "cloth_denim", "wood_dark", "skin"
    To = Part("torso")
    rings = [((0, 0.0, 0.86), 0.105, 0.09), ((0, 0.0, 0.92), 0.168, 0.114), ((0, 0.0, 0.99), 0.176, 0.12), ((0, 0.004, 1.035), 0.166, 0.112),
             ((0, 0.005, 1.065), 0.16, 0.108), ((0, 0.008, 1.16), 0.163, 0.11), ((0, 0.012, 1.26), 0.178, 0.122), ((0, 0.012, 1.36), 0.19, 0.125),
             ((0, 0.006, 1.42), 0.18, 0.116), ((0, 0.002, 1.455), 0.152, 0.104), ((0, 0.0, 1.482), 0.105, 0.085), ((0, -0.004, 1.505), 0.062, 0.062), ((0, 0.0, 1.56), 0.052, 0.056), ((0, 0.004, 1.61), 0.05, 0.055)]
    tube(To, rings, [pants, pants, pants, belt, shirt, shirt, shirt, shirt, shirt, shirt, shirt, skin, skin], segs=16)
    # collar, placket, chest pocket, belt buckle
    To.box((0.15, 0.03, 0.035), at=(0, 0.055, 1.505), rot=(-25, 0, 0), mat=shirt, bevel=0.008)
    To.box((0.03, 0.012, 0.4), at=(0, 0.128, 1.27), rot=(-2, 0, 0), mat=shirt, bevel=0.003)
    for i in range(5):
        To.cyl(0.006, 0.006, at=(0, 0.134, 1.1 + i * 0.085), rot=(90, 0, 0), mat="plastic_white", segs=8, bevel=0)
    To.box((0.085, 0.01, 0.095), at=(0.095, 0.128, 1.335), rot=(-3, 0, 8), mat=shirt, bevel=0.004)
    To.box((0.05, 0.012, 0.04), at=(0, 0.118, 1.05), mat="metal_brass", bevel=0.004)
    parts = [(To, ["hips", "spine", "chest", "neck"])]
    for s, n in ((1, "r"), (-1, "l")):
        A = Part(f"arm_{n}")
        tube(A, [((s * 0.192, 0.0, 1.487), 0.026, 0.03), ((s * 0.197, 0.0, 1.478), 0.048, 0.054), ((s * 0.203, 0.0, 1.455), 0.06, 0.066), ((s * 0.224, 0.0, 1.37), 0.054, 0.056), ((s * 0.236, 0.002, 1.26), 0.048, 0.05), ((s * 0.245, 0.005, 1.16), 0.042, 0.044),
                 ((s * 0.25, 0.012, 1.08), 0.044, 0.045), ((s * 0.255, 0.02, 0.98), 0.037, 0.038), ((s * 0.258, 0.025, 0.915), 0.031, 0.033), ((s * 0.258, 0.026, 0.9), 0.034, 0.036)],
             shirt, segs=12)
        parts.append((A, [f"upperarm_{n}", f"forearm_{n}"]))
        Hn = Part(f"hand_{n}")
        hand_part(Hn, s, skin)
        parts.append((Hn, f"hand_{n}"))
        L = Part(f"leg_{n}")
        tube(L, [((s * 0.09, 0.0, 0.95), 0.09, 0.1), ((s * 0.098, 0.005, 0.8), 0.084, 0.09), ((s * 0.102, 0.008, 0.66), 0.07, 0.076), ((s * 0.105, 0.01, 0.52), 0.059, 0.062),
                 ((s * 0.107, 0.0, 0.42), 0.058, 0.066), ((s * 0.109, -0.004, 0.28), 0.052, 0.056), ((s * 0.11, -0.006, 0.17), 0.055, 0.058), ((s * 0.11, -0.006, 0.13), 0.058, 0.062)],
             pants, segs=12)
        parts.append((L, [f"thigh_{n}", f"shin_{n}"]))
        Bt = Part(f"boot_{n}")
        boot_part(Bt, s, mat="wood_dark", sole="rubber")
        parts.append((Bt, f"foot_{n}"))
    parts.append((head_part(skin, "hair_brown"), "head"))
    arm, out = finish_char("civilian", parts, [(hair_part("hair_brown"), "head", "hair"), (hair_part("hair_brown", female=True), "head", "hair_long"), (cap_part("cloth_khaki"), "head", "cap")])
    marker("char", "civilian", height=1.84)
    return arm


# ======================================================================================= astronaut
def astronaut():
    reset()
    suit, grey, skin = "suit_white", "suit_gray", "skin"
    To = Part("torso")
    g = 0.034
    rings = [((0, 0.0, 0.85), 0.12, 0.1), ((0, 0.0, 0.92), 0.168 + g, 0.114 + g), ((0, 0.0, 0.99), 0.176 + g, 0.12 + g), ((0, 0.004, 1.04), 0.168 + g, 0.114 + g),
             ((0, 0.005, 1.08), 0.172 + g, 0.118 + g), ((0, 0.008, 1.16), 0.166 + g, 0.112 + g), ((0, 0.012, 1.26), 0.18 + g, 0.124 + g), ((0, 0.012, 1.36), 0.192 + g, 0.128 + g),
             ((0, 0.005, 1.44), 0.19 + g, 0.12 + g), ((0, 0.0, 1.49), 0.15, 0.125), ((0, 0.0, 1.515), 0.125, 0.12)]
    tube(To, rings, [suit, suit, suit, grey, suit, suit, suit, suit, suit, grey], segs=18)
    # waist ring, harness straps, neck ring
    To.tube(0.215, 0.19, 0.035, at=(0, 0.004, 1.06), mat="metal_bare", segs=24, bevel=0.006, M=T((0, 0.004, 1.06)) @ Matrix.Diagonal((1, 0.74, 1, 1)))
    To.tube(0.138, 0.118, 0.045, at=(0, 0, 1.53), mat="metal_bare", segs=24, bevel=0.008)
    for s in (-1, 1):
        To.box((0.035, 0.012, 0.42), at=(s * 0.1, 0.168, 1.28), rot=(-3, 0, s * 4), mat=grey, bevel=0.004)
        To.box((0.035, 0.012, 0.4), at=(s * 0.1, -0.165, 1.28), rot=(3, 0, s * 4), mat=grey, bevel=0.004)
    # chest control unit: display, switches, status lamps, hose ports
    To.box((0.25, 0.07, 0.2), at=(0, 0.2, 1.32), mat="plastic_white", bevel=0.014)
    To.box((0.1, 0.008, 0.06), at=(-0.05, 0.238, 1.36), mat="screen", bevel=0.003)
    for i in range(4):
        To.box((0.012, 0.014, 0.022), at=(0.035 + i * 0.026, 0.24, 1.365), rot=(20, 0, 0), mat="metal_bare", bevel=0.003)
    for i, m in enumerate(("emit_green", "emit_green", "emit_amber", "emit_blue")):
        To.cyl(0.006, 0.006, at=(0.035 + i * 0.026, 0.238, 1.33), rot=(90, 0, 0), mat=m, segs=8, bevel=0)
    for s in (-1, 1):
        To.cyl(0.02, 0.03, at=(s * 0.085, 0.24, 1.265), rot=(90, 0, 0), mat="metal_bare", segs=12, bevel=0.004)
        To.pipe([(s * 0.085, 0.25, 1.265), (s * 0.15, 0.24, 1.2), (s * 0.2, 0.1, 1.16), (s * 0.19, -0.12, 1.2)], 0.014, mat="rubber", segs=8, bend=0.06)
    To.box((0.07, 0.006, 0.045), at=(0.08, 0.166, 1.44), rot=(-8, 0, 0), mat="paint_blue", bevel=0.002)      # mission patch
    To.box((0.06, 0.006, 0.036), at=(-0.08, 0.166, 1.44), rot=(-8, 0, 0), mat="paint_red", bevel=0.002)      # flag patch
    # life-support backpack: main pack, oxygen bottles, radiator fins, antenna
    To.box((0.38, 0.17, 0.54), at=(0, -0.235, 1.3), mat="plastic_white", bevel=0.03)
    To.box((0.3, 0.05, 0.2), at=(0, -0.33, 1.42), mat=grey, bevel=0.012)
    for s in (-1, 1):
        To.cyl(0.045, 0.4, at=(s * 0.215, -0.235, 1.26), mat="metal_bare", segs=14, bevel=0.012)
        To.sphere(0.045, at=(s * 0.215, -0.235, 1.46), mat="metal_bare", segs=14, rings=8)
    for i in range(6):
        To.box((0.26, 0.012, 0.012), at=(0, -0.326, 1.12 + i * 0.03), mat="metal_dark", bevel=0.002)
    To.cyl(0.005, 0.22, at=(0.15, -0.24, 1.68), mat="metal_dark", segs=6, bevel=0)
    To.box((0.1, 0.03, 0.05), at=(0, -0.325, 1.52), mat="emit_red", bevel=0.006)                              # beacon housing
    parts = [(To, ["hips", "spine", "chest"])]
    for s, n in ((1, "r"), (-1, "l")):
        A = Part(f"arm_{n}")
        a = 0.022
        tube(A, [((s * 0.215, 0.0, 1.455), 0.07 + a, 0.074 + a), ((s * 0.236, 0.0, 1.37), 0.058 + a, 0.06 + a), ((s * 0.246, 0.002, 1.26), 0.052 + a, 0.054 + a), ((s * 0.254, 0.005, 1.16), 0.047 + a, 0.049 + a),
                 ((s * 0.258, 0.012, 1.08), 0.049 + a, 0.05 + a), ((s * 0.262, 0.02, 0.98), 0.043 + a, 0.044 + a), ((s * 0.264, 0.025, 0.92), 0.04 + a, 0.041 + a)], suit, segs=14)
        # convoluted joints: shoulder, elbow; wrist disconnect ring
        for (c, r) in (((s * 0.218, 0.0, 1.43), 0.098), ((s * 0.254, 0.005, 1.175), 0.074), ((s * 0.254, 0.006, 1.145), 0.074)):
            A.tube(r, r - 0.016, 0.022, at=c, mat=grey, segs=18, bevel=0.005)
        A.tube(0.064, 0.046, 0.03, at=(s * 0.264, 0.025, 0.915), mat="metal_bare", segs=18, bevel=0.006)
        if s < 0:   # wrist checklist / environment display on the left forearm
            A.box((0.012, 0.075, 0.1), at=(s * 0.33, 0.02, 1.03), mat="plastic_black", bevel=0.004)
            A.box((0.004, 0.06, 0.075), at=(s * 0.337, 0.02, 1.03), mat="screen", bevel=0)
        else:       # wrist mirror
            A.box((0.008, 0.05, 0.05), at=(s * 0.33, 0.02, 1.03), mat="metal_chrome", bevel=0.004)
        parts.append((A, [f"upperarm_{n}", f"forearm_{n}"]))
        Hn = Part(f"hand_{n}")
        hand_part(Hn, s, grey, scale=1.28)
        parts.append((Hn, f"hand_{n}"))
        L = Part(f"leg_{n}")
        l = 0.024
        tube(L, [((s * 0.092, 0.0, 0.95), 0.092 + l, 0.102 + l), ((s * 0.1, 0.005, 0.8), 0.086 + l, 0.092 + l), ((s * 0.104, 0.008, 0.66), 0.074 + l, 0.08 + l), ((s * 0.107, 0.01, 0.52), 0.064 + l, 0.067 + l),
                 ((s * 0.109, 0.0, 0.42), 0.063 + l, 0.07 + l), ((s * 0.111, -0.004, 0.28), 0.057 + l, 0.061 + l), ((s * 0.112, -0.006, 0.16), 0.056 + l, 0.06 + l)], suit, segs=14)
        for (c, r) in (((s * 0.107, 0.01, 0.545), 0.1), ((s * 0.107, 0.01, 0.5), 0.1)):
            L.tube(r, r - 0.016, 0.024, at=c, mat=grey, segs=18, bevel=0.005)
        L.box((0.1, 0.03, 0.1), at=(s * 0.107, 0.095, 0.52), mat=grey, bevel=0.014)                       # knee pad
        L.box((0.03, 0.12, 0.16), at=(s * 0.205, 0.005, 0.72), mat=suit, bevel=0.014)                     # thigh pocket
        L.tube(0.094, 0.07, 0.035, at=(s * 0.112, -0.006, 0.165), mat="metal_bare", segs=18, bevel=0.006)
        parts.append((L, [f"thigh_{n}", f"shin_{n}"]))
        Bt = Part(f"boot_{n}")
        boot_part(Bt, s, mat=grey, sole="rubber", bulky=True)
        parts.append((Bt, f"foot_{n}"))
    # head with communications cap (worn under the helmet)
    Hd = head_part(skin, "hair_brown")
    Hd.lathe([(0.0, 0.07), (0.05, 0.062), (0.082, 0.02), (0.084, -0.03), (0.08, -0.06), (0.0, -0.06)], at=(0, -0.012, 1.775), mat="cloth_white", segs=18, bevel=0)
    for s in (-1, 1):
        Hd.cyl(0.03, 0.022, at=(s * 0.082, 0.0, 1.7), rot=(0, 90, 0), mat="plastic_black", segs=12, bevel=0.004)
    Hd.pipe([(0.082, 0.02, 1.69), (0.075, 0.07, 1.65), (0.03, 0.1, 1.63)], 0.004, mat="plastic_black", segs=5)
    Nk = Part("neck")
    tube(Nk, [((0, -0.004, 1.5), 0.066, 0.066), ((0, 0.0, 1.56), 0.054, 0.058), ((0, 0.004, 1.61), 0.05, 0.055)], "cloth_white", segs=14)
    parts.append((Nk, ["chest", "neck"]))
    parts.append((Hd, "head"))
    # helmet: white shell, wide tinted visor, lamps, neck seal
    Hm = Part("helmet")
    R0 = 0.178
    c = (0, 0.012, 1.705)
    shell = []
    for i in range(0, 13):
        th = math.pi * i / 12
        shell.append((math.sin(th) * R0, math.cos(th) * R0))
    Hm.lathe(shell, M=T(c) @ Rm(-90, "X") @ Rm(-18, "X"), mat="plastic_white", segs=28, sweep=360)
    visor = []
    for i in range(0, 8):
        th = math.radians(8 + 62 * i / 7)
        visor.append((math.sin(th) * (R0 + 0.006), math.cos(th) * (R0 + 0.006)))
    Hm.lathe([(0.0, R0 + 0.006)] + visor, M=T(c) @ Rm(-90, "X") @ Rm(8, "X"), mat="glass_visor", segs=28)
    Hm.tube(R0 * 0.985 + 0.012, R0 * 0.93, 0.02, M=T(c) @ Rm(-90, "X") @ Rm(8, "X") @ T((0, 0, 0.065)), mat="metal_bare", segs=28, bevel=0.004)
    Hm.tube(0.148, 0.12, 0.05, at=(0, 0, 1.545), mat="metal_bare", segs=24, bevel=0.008)
    for s in (-1, 1):
        Hm.box((0.03, 0.06, 0.045), at=(s * 0.182, 0.03, 1.74), mat="plastic_white", bevel=0.008)
        Hm.cyl(0.014, 0.012, at=(s * 0.182, 0.064, 1.74), rot=(90, 0, 0), mat="emit_white", segs=10, bevel=0)
    Hm.box((0.08, 0.06, 0.03), at=(0, -0.13, 1.84), mat=grey, bevel=0.01)
    arm, out = finish_char("astronaut", parts, [(Hm, "head", "helmet"), (hair_part("hair_brown"), "head", "hair")])
    marker("char", "astronaut", height=1.9)
    marker("light", "helmet", at=(0, 0.2, 1.74), light="spot", power=420, dist=22, color=[0.95, 0.97, 1.0])
    return arm


def pose_preview(arm, name, eye, target):
    preview(name, eye, target, res=(900, 900), lens=60, samples=40, sun_rot=(52, 0, 150), sky=(0.7, 0.75, 0.8))


if __name__ == "__main__":
    only = [a for a in sys.argv[1:] if not a.startswith("--")]
    pv = "--preview" in sys.argv
    if not only or "civilian" in only:
        a = civilian()
        if pv:
            pose_preview(a, "char_civilian", (1.6, 3.2, 1.5), (0, 0, 1.0))
            pose_preview(a, "char_civilian_face", (0.25, 0.75, 1.72), (0, 0, 1.69))
        export_glb("char_civilian")
        save_blend("char_civilian")
    if not only or "astronaut" in only:
        a = astronaut()
        if pv:
            pose_preview(a, "char_astronaut", (1.7, 3.3, 1.5), (0, 0, 1.0))
            pose_preview(a, "char_astronaut_back", (-1.6, -3.0, 1.6), (0, 0, 1.05))
        export_glb("char_astronaut")
        save_blend("char_astronaut")
