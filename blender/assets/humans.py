"""
Rigged humanoid characters (shared skeleton + procedural keyframed animation clips).
Outfits: suit (astronaut pressure suit + helmet + life-support pack), jumpsuit (crew inside ships),
farmer (jeans, flannel, cap, boots), staff (facility clothing). Male/female builds.
Faces +Y in Blender (→ -Z forward in three.js). Height ≈ 1.80 m (male) / 1.68 m (female), scaled at runtime.

Exports public/assets/models/human_<outfit>_<m|f>.glb, each with animations:
  idle, walk, run, sit, type, climb, float, talk, wave
"""
import sys, os, math
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "lib"))
import kit
from kit import V, M
import bpy, bmesh
from mathutils import Quaternion, Euler, Matrix

PI = math.pi
FPS = 24


def capsule(bm, a, b, r0, r1, seg=10, rings=4):
    """Tapered capsule between points a,b appended to bm; returns verts."""
    a, b = V(a), V(b)
    d = b - a
    L = d.length
    q = d.to_track_quat("Z", "Y")
    verts = []
    res = bmesh.ops.create_cone(bm, cap_ends=False, segments=seg, radius1=r0, radius2=r1, depth=L)
    for v in res["verts"]:
        v.co = q @ (v.co + V((0, 0, L / 2))) + a
        verts.append(v)
    for (c, r) in ((a, r0), (b, r1)):
        s = bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings * 2, radius=r)
        for v in s["verts"]:
            v.co = v.co + c
            verts.append(v)
    return verts


def ellip(bm, c, r, seg=14, rings=8):
    s = bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=1.0)
    out = []
    for v in s["verts"]:
        v.co = V((v.co.x * r[0], v.co.y * r[1], v.co.z * r[2])) + V(c)
        out.append(v)
    return out


def boxv(bm, c, s, bev=0.0):
    res = bmesh.ops.create_cube(bm, size=1.0)
    for v in res["verts"]:
        v.co = V((v.co.x * s[0], v.co.y * s[1], v.co.z * s[2])) + V(c)
    return res["verts"]


# joint positions (male); female scaled
J = {
    "hips": (0, 0, 0.98), "spine": (0, 0, 1.08), "chest": (0, 0, 1.28), "neck": (0, 0.0, 1.52), "head": (0, 0.01, 1.6),
    "upperarm.L": (0.2, 0, 1.45), "forearm.L": (0.24, 0, 1.17), "hand.L": (0.26, 0.02, 0.92),
    "thigh.L": (0.1, 0, 0.95), "shin.L": (0.11, 0.01, 0.52), "foot.L": (0.11, 0.0, 0.09),
}
for k in list(J.keys()):
    if k.endswith(".L"):
        x, y, z = J[k]
        J[k[:-2] + ".R"] = (-x, y, z)

TAILS = {
    "hips": (0, 0, 1.08), "spine": (0, 0, 1.28), "chest": (0, 0, 1.5), "neck": (0, 0.01, 1.6), "head": (0, 0.01, 1.82),
    "upperarm.L": (0.24, 0, 1.17), "forearm.L": (0.26, 0.02, 0.92), "hand.L": (0.27, 0.04, 0.82),
    "thigh.L": (0.11, 0.01, 0.52), "shin.L": (0.11, 0.0, 0.09), "foot.L": (0.11, 0.14, 0.03),
}
for k in list(TAILS.keys()):
    if k.endswith(".L"):
        x, y, z = TAILS[k]
        TAILS[k[:-2] + ".R"] = (-x, y, z)
PARENT = {"spine": "hips", "chest": "spine", "neck": "chest", "head": "neck", "upperarm.L": "chest", "upperarm.R": "chest",
          "forearm.L": "upperarm.L", "forearm.R": "upperarm.R", "hand.L": "forearm.L", "hand.R": "forearm.R",
          "thigh.L": "hips", "thigh.R": "hips", "shin.L": "thigh.L", "shin.R": "thigh.R", "foot.L": "shin.L", "foot.R": "shin.R"}


def build_body(outfit, female):
    """Returns {bone: [(bm_verts_mesh_object)]} as separate objects per bone with materials."""
    s = 0.94 if female else 1.0
    sh = 0.86 if female else 1.0   # shoulder width factor
    hip = 1.06 if female else 1.0
    parts = []  # (bone, object)
    suit = outfit == "suit"
    bulk = 1.22 if suit else 1.0
    top_m = {"suit": "suit_white", "jumpsuit": "cloth_jumpsuit", "farmer": "cloth_flannel", "staff": "cloth_navy"}[outfit]
    bottom_m = {"suit": "suit_white", "jumpsuit": "cloth_jumpsuit", "farmer": "cloth_denim", "staff": "cloth_khaki"}[outfit]
    shoe_m = {"suit": "suit_gray", "jumpsuit": "plastic_dark", "farmer": "leather_brown", "staff": "plastic_dark"}[outfit]

    def P(bone, name, mats, build):
        bm = bmesh.new()
        build(bm)
        o = kit.from_bmesh(name, bm, mats)
        kit.smooth(o, 60)
        parts.append((bone, o))
        return o

    def jp(k):
        x, y, z = J[k]
        if k.endswith(".L") or k.endswith(".R"):
            if "arm" in k or "hand" in k:
                x *= sh
            else:
                x *= hip
        return V((x, y, z)) * s

    def tp(k):
        x, y, z = TAILS[k]
        if k.endswith(".L") or k.endswith(".R"):
            if "arm" in k or "hand" in k:
                x *= sh
            else:
                x *= hip
        return V((x, y, z)) * s

    # torso: lofted elliptical cross-sections (hips → waist → chest → shoulders), split at the waist for skinning
    def ring(bm, z, w, dpt, yoff=0.0, n=16):
        return [bm.verts.new((math.cos(2 * PI * i / n) * w / 2, math.sin(2 * PI * i / n) * dpt / 2 + yoff, z)) for i in range(n)]

    def loft_rings(bm, rings, cap_bottom=False, cap_top=False):
        n = len(rings[0])
        for a, b in zip(rings, rings[1:]):
            for i in range(n):
                j = (i + 1) % n
                bm.faces.new((a[i], a[j], b[j], b[i]))
        if cap_bottom:
            bm.faces.new(list(reversed(rings[0])))
        if cap_top:
            bm.faces.new(rings[-1])
    wb = bulk
    lower = [(0.90, 0.30 * hip, 0.19), (0.97, 0.345 * hip, 0.215), (1.05, 0.33 * hip, 0.205), (1.13, 0.29 * (0.94 if female else 1), 0.19), (1.2, 0.295, 0.195)]
    upper = [(1.18, 0.295, 0.195), (1.27, 0.33 * sh, 0.215), (1.37, 0.37 * sh, 0.23), (1.45, 0.39 * sh, 0.21), (1.5, 0.33 * sh, 0.17), (1.53, 0.2, 0.13)]
    def build_lower(bm):
        rs = [ring(bm, z * s, w * wb, dd * wb) for (z, w, dd) in lower]
        loft_rings(bm, rs, cap_bottom=True)
    def build_upper(bm):
        rs = [ring(bm, z * s, w * wb, dd * wb, 0.005) for (z, w, dd) in upper]
        loft_rings(bm, rs, cap_top=True)
        if female and not suit:
            ellip(bm, jp("chest") + V((0.06, 0.08, 0.1)), (0.062, 0.05, 0.055))
            ellip(bm, jp("chest") + V((-0.06, 0.08, 0.1)), (0.062, 0.05, 0.055))
    P("hips", "pelvis", (bottom_m,), build_lower)
    P("chest", "chest", (top_m,), build_upper)
    for side in (1, -1):
        P("chest", "shoulder", (top_m,), lambda bm, side=side: ellip(bm, jp("upperarm.L" if side > 0 else "upperarm.R") + V((-side * 0.01, 0, 0.0)), (0.058 * bulk, 0.06 * bulk, 0.058 * bulk)))
    # neck & head
    skin = "skin"
    P("neck", "neck", ("skin" if not suit else "suit_gray",), lambda bm: capsule(bm, jp("neck"), tp("neck"), 0.055 * bulk, 0.05 * bulk, 10, 2))
    if suit:
        # helmet: shell + visor + neck ring
        P("head", "helmet", ("suit_white",), lambda bm: ellip(bm, jp("head") + V((0, 0.0, 0.11)), (0.165, 0.175, 0.18), 20, 12))
        P("head", "visor", ("glass_dark",), lambda bm: ellip(bm, jp("head") + V((0, 0.045, 0.11)), (0.145, 0.14, 0.13), 20, 12))
        P("neck", "neckring", ("suit_gray",), lambda bm: capsule(bm, jp("neck") + V((0, 0, -0.02)), jp("neck") + V((0, 0, 0.03)), 0.11, 0.11, 16, 1))
    else:
        P("head", "head", (skin,), lambda bm: ellip(bm, jp("head") + V((0, 0.01, 0.11)), (0.083 if female else 0.09, 0.1, 0.115), 18, 12))
        P("head", "jaw", (skin,), lambda bm: ellip(bm, jp("head") + V((0, 0.035, 0.04)), (0.065 if female else 0.072, 0.07, 0.06)))
        P("head", "nose", (skin,), lambda bm: ellip(bm, jp("head") + V((0, 0.105, 0.1)), (0.014, 0.022, 0.03), 8, 6))
        for side in (1, -1):
            P("head", "ear", (skin,), lambda bm, side=side: ellip(bm, jp("head") + V((side * 0.09, 0.0, 0.1)), (0.012, 0.025, 0.035), 8, 6))
            P("head", "eye", ("plastic_dark",), lambda bm, side=side: ellip(bm, jp("head") + V((side * 0.033, 0.095, 0.125)), (0.012, 0.006, 0.008), 8, 6))
            P("head", "brow", ("hair_dark" if not female else "hair_brown",), lambda bm, side=side: boxv(bm, jp("head") + V((side * 0.034, 0.099, 0.147)), (0.03, 0.008, 0.007)))
        P("head", "mouth", ("fabric_red",), lambda bm: ellip(bm, jp("head") + V((0, 0.093, 0.058)), (0.022, 0.006, 0.005), 8, 4))
        # hair
        if female:
            P("head", "hair", ("hair_brown",), lambda bm: (ellip(bm, jp("head") + V((0, -0.005, 0.135)), (0.095, 0.108, 0.105), 18, 12), ellip(bm, jp("head") + V((0, -0.05, 0.03)), (0.085, 0.06, 0.12))))
        else:
            P("head", "hair", ("hair_dark",), lambda bm: ellip(bm, jp("head") + V((0, -0.01, 0.15)), (0.094, 0.104, 0.085), 18, 10))
        if outfit == "farmer":
            P("head", "cap", ("cloth_khaki",), lambda bm: (ellip(bm, jp("head") + V((0, 0.0, 0.18)), (0.1, 0.11, 0.06), 16, 8), boxv(bm, jp("head") + V((0, 0.12, 0.17)), (0.15, 0.09, 0.012))))
    # arms
    for side, sfx in ((1, "L"), (-1, "R")):
        P(f"upperarm.{sfx}", "uarm", (top_m,), lambda bm, sfx=sfx: capsule(bm, jp(f"upperarm.{sfx}"), tp(f"upperarm.{sfx}"), 0.052 * bulk, 0.045 * bulk))
        P(f"forearm.{sfx}", "farm", (top_m if outfit in ("suit", "jumpsuit", "staff") else "skin",), lambda bm, sfx=sfx: capsule(bm, jp(f"forearm.{sfx}"), tp(f"forearm.{sfx}"), 0.044 * bulk, 0.035 * bulk))
        if outfit == "farmer":
            P(f"forearm.{sfx}", "cuff", (top_m,), lambda bm, sfx=sfx: capsule(bm, jp(f"forearm.{sfx}"), jp(f"forearm.{sfx}").lerp(tp(f"forearm.{sfx}"), 0.35), 0.047, 0.044))
        hand_m = "suit_gray" if suit else "skin"
        P(f"hand.{sfx}", "hand", (hand_m,), lambda bm, sfx=sfx: (ellip(bm, jp(f"hand.{sfx}").lerp(tp(f"hand.{sfx}"), 0.45), (0.025 * bulk, 0.045 * bulk, 0.06 * bulk)), capsule(bm, jp(f"hand.{sfx}") + V((0, 0.035, -0.02)), jp(f"hand.{sfx}") + V((0, 0.05, -0.06)), 0.012 * bulk, 0.01 * bulk, 6, 2)))
        if suit:
            P(f"forearm.{sfx}", "wristring", ("suit_gray",), lambda bm, sfx=sfx: capsule(bm, tp(f"forearm.{sfx}") + V((0, 0, 0.02)), tp(f"forearm.{sfx}") + V((0, 0, 0.05)), 0.05, 0.05, 12, 1))
            P(f"forearm.{sfx}", "elbow", ("suit_gray",), lambda bm, sfx=sfx: ellip(bm, jp(f"forearm.{sfx}"), (0.058, 0.058, 0.05)))
    # legs
    for side, sfx in ((1, "L"), (-1, "R")):
        P(f"thigh.{sfx}", "thigh", (bottom_m,), lambda bm, sfx=sfx: capsule(bm, jp(f"thigh.{sfx}"), tp(f"thigh.{sfx}"), 0.075 * bulk * (1.05 if female else 1), 0.055 * bulk))
        P(f"shin.{sfx}", "shin", (bottom_m,), lambda bm, sfx=sfx: capsule(bm, jp(f"shin.{sfx}"), tp(f"shin.{sfx}"), 0.053 * bulk, 0.042 * bulk))
        P(f"foot.{sfx}", "foot", (shoe_m,), lambda bm, sfx=sfx: (ellip(bm, jp(f"foot.{sfx}") + V((0, 0.05, -0.04)), (0.05 * bulk, 0.12 * bulk, 0.045 * bulk)), boxv(bm, jp(f"foot.{sfx}") + V((0, 0.05, -0.075)), (0.1 * bulk, 0.26 * bulk, 0.025))))
        if suit:
            P(f"shin.{sfx}", "knee", ("suit_gray",), lambda bm, sfx=sfx: ellip(bm, jp(f"shin.{sfx}"), (0.072, 0.07, 0.06)))
    if suit:
        # life-support backpack + chest control unit
        P("chest", "pack", ("suit_white",), lambda bm: boxv(bm, jp("chest") + V((0, -0.2, 0.05)), (0.38, 0.18, 0.5)))
        P("chest", "pack_detail", ("suit_gray",), lambda bm: (boxv(bm, jp("chest") + V((0.1, -0.3, 0.12)), (0.08, 0.04, 0.3)), boxv(bm, jp("chest") + V((-0.1, -0.3, 0.12)), (0.08, 0.04, 0.3))))
        P("chest", "dcm", ("suit_gray",), lambda bm: boxv(bm, jp("chest") + V((0, 0.16, 0.05)), (0.2, 0.06, 0.12)))
        P("chest", "flag", ("warning_red",), lambda bm: boxv(bm, jp("upperarm.L") + V((0.035, 0.0, -0.06)), (0.012, 0.05, 0.035)))
        P("hips", "belt", ("suit_gray",), lambda bm: capsule(bm, jp("hips") + V((0, 0, 0.06)), jp("hips") + V((0, 0, 0.1)), 0.18, 0.18, 16, 1))
    elif outfit == "jumpsuit":
        P("chest", "patch", ("warning_red",), lambda bm: boxv(bm, jp("chest") + V((0.08, 0.115, 0.13)), (0.05, 0.01, 0.035)))
        P("hips", "belt", ("plastic_dark",), lambda bm: capsule(bm, jp("hips") + V((0, 0, 0.06)), jp("hips") + V((0, 0, 0.09)), 0.17, 0.17, 14, 1))
    elif outfit == "staff":
        P("chest", "badge", ("plastic_white",), lambda bm: boxv(bm, jp("chest") + V((0.08, 0.12, 0.12)), (0.04, 0.01, 0.055)))
    return parts


def make_armature(female):
    s = 0.94 if female else 1.0
    sh = 0.86 if female else 1.0
    hip = 1.06 if female else 1.0
    arm = bpy.data.armatures.new("Armature")
    ob = bpy.data.objects.new("Armature", arm)
    kit.link(ob)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.mode_set(mode="EDIT")

    def sc(k, p):
        x, y, z = p
        if k.endswith(".L") or k.endswith(".R"):
            x *= sh if ("arm" in k or "hand" in k) else hip
        return V((x, y, z)) * s
    eb = {}
    for k in J:
        b = arm.edit_bones.new(k)
        b.head = sc(k, J[k])
        b.tail = sc(k, TAILS[k])
        b.roll = 0
        eb[k] = b
    for k, p in PARENT.items():
        eb[k].parent = eb[p]
        if k in ("spine", "chest", "neck", "head", "forearm.L", "forearm.R", "hand.L", "hand.R", "shin.L", "shin.R", "foot.L", "foot.R"):
            eb[k].use_connect = False
    bpy.ops.object.mode_set(mode="OBJECT")
    for pb in ob.pose.bones:
        pb.rotation_mode = "XYZ"
    return ob


# --------------------------------------------------------------------------------------------- animation
def key_pose(ob, frame, pose):
    """pose: {bone: (rx, ry, rz)} in radians (bone local XYZ euler); 'root_z' for vertical offset."""
    for pb in ob.pose.bones:
        r = pose.get(pb.name, (0, 0, 0))
        pb.rotation_euler = r
        pb.keyframe_insert("rotation_euler", frame=frame)
        if pb.name == "hips":
            pb.location = (0, pose.get("_bob", 0.0), 0)  # bone local Y ≈ world up for the vertical hip bone
            pb.keyframe_insert("location", frame=frame)


def cyc(phase, a):
    return math.sin(phase * 2 * PI) * a


def clips():
    """Clip name → (frames, fn(t in [0,1]) → pose)."""
    d = math.radians
    out = {}

    def walk(t, amp=1.0, run=False):
        sw = 28 if not run else 46
        p = {}
        p["thigh.L"] = (d(-cyc(t, sw * amp) - (8 if run else 0)), 0, 0)
        p["thigh.R"] = (d(cyc(t, sw * amp) - (8 if run else 0)), 0, 0)
        kneeL = max(0, math.sin((t + 0.15) * 2 * PI)) * (45 if not run else 95) * amp + 5
        kneeR = max(0, math.sin((t + 0.65) * 2 * PI)) * (45 if not run else 95) * amp + 5
        p["shin.L"] = (d(kneeL), 0, 0)
        p["shin.R"] = (d(kneeR), 0, 0)
        p["foot.L"] = (d(-kneeL * 0.25), 0, 0)
        p["foot.R"] = (d(-kneeR * 0.25), 0, 0)
        arm = 22 if not run else 45
        p["upperarm.L"] = (d(cyc(t, arm * amp)), 0, d(-6))
        p["upperarm.R"] = (d(-cyc(t, arm * amp)), 0, d(6))
        p["forearm.L"] = (d(-(15 if not run else 70) - max(0, cyc(t, 15))), 0, 0)
        p["forearm.R"] = (d(-(15 if not run else 70) - max(0, -cyc(t, 15))), 0, 0)
        p["spine"] = (d(4 if not run else 12), d(cyc(t, 4)), 0)
        p["chest"] = (0, d(-cyc(t, 6)), 0)
        p["hips"] = (0, d(cyc(t, 5)), 0)
        p["_bob"] = abs(math.sin(t * 4 * PI)) * (0.025 if not run else 0.05) - 0.01
        return p
    out["walk"] = (24, lambda t: walk(t))
    out["run"] = (16, lambda t: walk(t, 1.0, True))

    def idle(t):
        b = math.sin(t * 2 * PI)
        return {"chest": (d(1.5 * b), 0, 0), "neck": (d(-1 * b), d(4 * math.sin(t * 2 * PI * 0.5)), 0), "upperarm.L": (d(2 * b), 0, d(-5)), "upperarm.R": (d(2 * b), 0, d(5)),
                "forearm.L": (d(-10), 0, 0), "forearm.R": (d(-10), 0, 0), "hips": (0, d(2 * math.sin(t * 2 * PI * 0.5)), 0), "_bob": 0.004 * b}
    out["idle"] = (72, idle)

    def sit(t, typing=False):
        p = {"thigh.L": (d(-88), 0, d(-4)), "thigh.R": (d(-88), 0, d(4)), "shin.L": (d(88), 0, 0), "shin.R": (d(88), 0, 0), "spine": (d(-4), 0, 0),
             "upperarm.L": (d(-35), 0, d(-8)), "upperarm.R": (d(-35), 0, d(8)), "forearm.L": (d(-55), 0, 0), "forearm.R": (d(-55), 0, 0), "_bob": -0.45}
        if typing:
            p["upperarm.L"] = (d(-30 + 3 * math.sin(t * 2 * PI * 3)), 0, d(-10))
            p["upperarm.R"] = (d(-30 + 3 * math.sin(t * 2 * PI * 3 + 1.5)), 0, d(10))
            p["forearm.L"] = (d(-70 + 4 * math.sin(t * 2 * PI * 4)), 0, 0)
            p["forearm.R"] = (d(-70 + 4 * math.sin(t * 2 * PI * 4 + 2)), 0, 0)
            p["neck"] = (d(8), d(5 * math.sin(t * 2 * PI)), 0)
        return p
    out["sit"] = (48, lambda t: sit(t))
    out["type"] = (48, lambda t: sit(t, True))

    def climb(t):
        a = math.sin(t * 2 * PI)
        return {"upperarm.L": (d(-150 + 25 * a), 0, d(-8)), "upperarm.R": (d(-150 - 25 * a), 0, d(8)), "forearm.L": (d(-30 - 20 * max(0, a)), 0, 0), "forearm.R": (d(-30 - 20 * max(0, -a)), 0, 0),
                "thigh.L": (d(-45 + 35 * a), 0, 0), "thigh.R": (d(-45 - 35 * a), 0, 0), "shin.L": (d(70 - 30 * a), 0, 0), "shin.R": (d(70 + 30 * a), 0, 0)}
    out["climb"] = (24, climb)

    def float_(t):
        a = math.sin(t * 2 * PI)
        return {"upperarm.L": (d(-20 + 6 * a), 0, d(-28)), "upperarm.R": (d(-20 - 6 * a), 0, d(28)), "forearm.L": (d(-25), 0, 0), "forearm.R": (d(-25), 0, 0),
                "thigh.L": (d(-18 + 5 * a), 0, d(-6)), "thigh.R": (d(-14 - 5 * a), 0, d(6)), "shin.L": (d(30), 0, 0), "shin.R": (d(25), 0, 0), "spine": (d(5), 0, 0), "neck": (d(-6), d(10 * a), 0)}
    out["float"] = (96, float_)

    def talk(t):
        a = math.sin(t * 2 * PI)
        b = math.sin(t * 2 * PI * 2 + 1)
        p = idle(t)
        p["upperarm.R"] = (d(-30 + 12 * a), 0, d(18))
        p["forearm.R"] = (d(-70 + 20 * b), d(10 * a), 0)
        p["upperarm.L"] = (d(-10 + 6 * b), 0, d(-10))
        p["forearm.L"] = (d(-30), 0, 0)
        p["neck"] = (d(4 * b), d(8 * a), 0)
        return p
    out["talk"] = (48, talk)

    def wave(t):
        p = idle(t)
        p["upperarm.R"] = (d(-20), 0, d(150))
        p["forearm.R"] = (d(0), 0, d(35 * math.sin(t * 2 * PI * 2)))
        return p
    out["wave"] = (36, wave)
    return out


def build_variant(outfit, female):
    kit.reset()
    root = kit.empty(f"Human_{outfit}_{'f' if female else 'm'}")
    ob = make_armature(female)
    ob.parent = root
    parts = build_body(outfit, female)
    # merge all parts into one mesh with vertex groups per bone
    bm = bmesh.new()
    mats = []
    groups = {}
    for bone, o in parts:
        me = o.data
        before = len(bm.verts)
        fb = len(bm.faces)
        bm.from_mesh(me)
        bm.verts.ensure_lookup_table()
        bm.faces.ensure_lookup_table()
        idx = []
        for sm in me.materials:
            if sm.name not in [m.name for m in mats]:
                mats.append(sm)
            idx.append([m.name for m in mats].index(sm.name))
        for f in bm.faces[fb:]:
            f.material_index = idx[min(f.material_index, len(idx) - 1)] if idx else 0
        groups.setdefault(bone, []).extend(range(before, len(bm.verts)))
        bpy.data.objects.remove(o, do_unlink=True)
    me = bpy.data.meshes.new("body")
    bm.to_mesh(me)
    bm.free()
    body = bpy.data.objects.new("body", me)
    kit.link(body)
    for m in mats:
        me.materials.append(m)
    for bone, vs in groups.items():
        vg = body.vertex_groups.new(name=bone)
        vg.add(vs, 1.0, "REPLACE")
    kit.smooth(body, 60)
    kit.uv_box(body)
    body.parent = ob
    mod = body.modifiers.new("arm", "ARMATURE")
    mod.object = ob
    # animations → NLA tracks
    ob.animation_data_create()
    for name, (frames, fn) in clips().items():
        act = bpy.data.actions.new(name)
        ob.animation_data.action = act
        n = 8 if frames <= 24 else 12
        for i in range(n + 1):
            t = i / n
            key_pose(ob, 1 + t * frames, fn(t % 1.0 if i < n else 0.0))
        tr = ob.animation_data.nla_tracks.new()
        tr.name = name
        strip = tr.strips.new(name, 1, act)
        ob.animation_data.action = None
    for pb in ob.pose.bones:
        pb.rotation_euler = (0, 0, 0)
        pb.location = (0, 0, 0)
    path = os.path.join(kit.out_dir(), f"human_{outfit}_{'f' if female else 'm'}.glb")
    kit.select_tree(root)
    kw = dict(filepath=path, export_format="GLB", use_selection=True, export_apply=False, export_extras=True, export_yup=True,
              export_animations=True, export_cameras=False, export_skins=True, export_materials="EXPORT")
    try:
        bpy.ops.export_scene.gltf(**kw, export_animation_mode="NLA_TRACKS")
    except TypeError:
        bpy.ops.export_scene.gltf(**kw)
    print(f"[humans] {path} {sum(len(p.vertices) - 2 for p in me.polygons)} tris")
    return root


if __name__ == "__main__":
    for outfit in ("suit", "jumpsuit", "farmer", "staff"):
        for female in (False, True):
            build_variant(outfit, female)
    # preview one
    kit.preview(os.path.join(kit.preview_dir(), "human.png"), (1.8, 3.2, 1.5), (0, 0, 1.0), lens=40, samples=12, world=(0.7, 0.7, 0.68))
