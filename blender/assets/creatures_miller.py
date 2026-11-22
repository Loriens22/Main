"""Miller's planet: the ten species of the abyssal biosphere (original speculative designs, after the ten concept
images). Each is built at adult size in metres, skinned to a named rig (see blender/lib/bio.py) and exported to
public/assets/creatures/miller/<id>.glb. Animation is procedural in the engine.

  ferracaris        Ferracaris depressa          0.26 m   plated grazer, nine leg pairs, marginal fringe
  stalker           Tenebrovenator milleri       6.5 m    eel-bodied ambush predator, wedge head, four paddle fins
"""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "lib"))
from bl import *  # noqa: E402,F403
from bio import *  # noqa: E402,F403
import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "public", "assets", "creatures", "miller")


def export(name):
    export_glb(name, out_dir=OUT)


# ------------------------------------------------------------------------------------------------ helpers
def jawed_head(R, P, J, snout, hinge, width, top_h, jaw_h, skin, belly, teeth_n=14, tooth=0.04, gum="bio_gum",
               tooth_mat="bio_tooth", head_bone="sp0", lower_teeth=None, jaw_drop=0.0):
    """A lower jaw (part J, bound to 'jaw') under the skull from the hinge to the snout, a palate and tongue, and
    teeth along both jaw edges. snout/hinge: Vector points on the midline at mouth level."""
    s, h = V(snout), V(hinge)
    L = (s - h).length
    fwd = (s - h).normalized()
    R.bone("jaw", h, s - fwd * L * 0.1, head_bone)
    # lower jaw: a lofted wedge, flat on top (the mouth floor), rounded below
    spine = [s - fwd * 0.02 + Vector((0, 0, -jaw_drop)), h + Vector((0, 0, -jaw_drop * 0.5))]
    body(J, spine, [(0, (width * 0.35, jaw_h * 0.15, jaw_h * 0.6, 2.2, -jaw_h * 0.1)), (0.5, (width * 0.85, jaw_h * 0.2, jaw_h, 2.2, -jaw_h * 0.2)),
                    (1, (width, jaw_h * 0.25, jaw_h * 1.1, 2.2, -jaw_h * 0.2))], skin, belly, segs=16, n=10)
    # palate (under the skull) and tongue (top of the jaw): dark flesh visible when the mouth opens
    P.mesh([tuple(s - fwd * 0.05 + Vector((-width * 0.3, 0, -0.005))), tuple(s - fwd * 0.05 + Vector((width * 0.3, 0, -0.005))),
            tuple(h + Vector((width * 0.85, 0, -0.005))), tuple(h + Vector((-width * 0.85, 0, -0.005)))], [(0, 3, 2, 1)], mat=gum, recalc=False, bevel=0)
    J.mesh([tuple(s - fwd * 0.05 + Vector((-width * 0.3, 0, -jaw_drop + 0.0))), tuple(s - fwd * 0.05 + Vector((width * 0.3, 0, -jaw_drop))),
            tuple(h + Vector((width * 0.85, 0, -jaw_drop * 0.5))), tuple(h + Vector((-width * 0.85, 0, -jaw_drop * 0.5)))], [(0, 1, 2, 3)], mat=gum, recalc=False, bevel=0)
    # teeth: hooked backward, longest a third of the way back
    for side in (-1, 1):
        for i in range(teeth_n):
            t = (i + 0.5) / teeth_n
            sz = tooth * (0.55 + 0.9 * math.sin(math.pi * min(1.0, t * 1.4)))
            w = width * (0.3 + 0.62 * t) * 0.92
            base = s.lerp(h, t) + Vector((side * w, 0, 0)) - fwd * 0.0
            cone(P, base + Vector((0, 0, 0.004)), base + Vector((0, 0, -sz)) - fwd * sz * 0.35, sz * 0.22, tooth_mat, bend=-fwd)
            nl = lower_teeth if lower_teeth is not None else teeth_n
            if i < nl:
                lb = s.lerp(h, (i + 0.8) / teeth_n) + Vector((side * w * 0.95, 0, -jaw_drop))
                cone(J, lb + Vector((0, 0, -0.004)), lb + Vector((0, 0, sz * 0.9)) - fwd * sz * 0.3, sz * 0.2, tooth_mat, bend=-fwd)


# ================================================================================================ FERRACARIS
def build_ferracaris():
    reset()
    R = Rig("ferracaris")
    Lb, Wb = 0.26, 0.17
    sp = [Vector((0, Lb * 0.5, 0.035)), Vector((0, Lb * 0.17, 0.035)), Vector((0, -Lb * 0.17, 0.035)), Vector((0, -Lb * 0.5, 0.033))]
    bones = R.chain("sp", sp)
    half_w = lambda y: Wb * 0.5 * math.sqrt(max(0.0, 1 - (y / (Lb * 0.52)) ** 2))  # noqa: E731
    # the soft body beneath the shell
    B = Part("ferr_body")
    body(B, [Vector((0, Lb * 0.46, 0.03)), Vector((0, 0, 0.032)), Vector((0, -Lb * 0.46, 0.028))],
         [(0, (0.02, 0.008, 0.01, 2, 0)), (0.2, (Wb * 0.4, 0.012, 0.014, 2, 0)), (0.6, (Wb * 0.42, 0.012, 0.014, 2, 0)), (1, (0.015, 0.006, 0.008, 2, 0))],
         "ferracaris_leg", "ferracaris_leg", segs=14, n=12)
    R.add(B, bones)
    # overlapping shell bands, front to back; the first is the broad head shield
    S = Part("ferr_shell")
    nb = 8
    for i in range(nb):
        y = Lb * 0.47 - i * Lb * 0.94 / (nb - 1)
        w = max(0.03, half_w(y) * 1.14 + 0.012)
        a = Lb * (0.08 if i else 0.095)
        plate(S, (0, y, 0.042 + 0.006 * math.cos(math.pi * i / nb)), (0, 1, 0), (1, 0, 0), (0, 0, 1), a, w, "ferracaris_shell",
              rise=0.02 if i else 0.024, thick=0.004, nu=14, nv=5, tilt=0.005, lip=0.002, sq=6.0, droop=0.012)
    jitter(S, 0.0015, freq=40, seed=3)
    R.add(S, bones)
    # marginal fringe: fine pale filaments along the shell rim
    Fr = Part("ferr_fringe")
    for side in (-1, 1):
        for k in range(22):
            y = Lb * 0.46 - k * Lb * 0.92 / 21
            x = half_w(y) * 1.08 * side
            base = Vector((x, y, 0.036))
            out = Vector((side, 0, -0.25)).normalized()
            cone(Fr, base, base + out * 0.016 * (0.7 + 0.3 * math.sin(k)), 0.0018, "ferracaris_leg", segs=4)
    R.add(Fr, bones)
    # nine pairs of short jointed legs under the rim, and two small antennae
    Lg = Part("ferr_legs")
    for i in range(9):
        y = Lb * 0.36 - i * Lb * 0.72 / 8
        for side, sname in ((1, "R"), (-1, "L")):
            hip = Vector((side * half_w(y) * 0.55, y, 0.026))
            knee = Vector((side * half_w(y) * 0.95, y + 0.004, 0.022))
            foot = Vector((side * half_w(y) * 1.05, y + 0.008, 0.002))
            names = R.chain(f"leg{sname}{i}_", [hip, knee, foot], parent=bones[1 if y > 0 else 2])
            Lp = Part(f"ferr_leg{sname}{i}")
            tube(Lp, [hip, knee, foot], [(0, 0.0035), (1, 0.0012)], "ferracaris_leg", segs=5, n=6)
            R.add(Lp, names)
    for side in (-1, 1):
        A = Part(f"ferr_ant{side}")
        tube(A, [(side * 0.02, Lb * 0.5, 0.034), (side * 0.04, Lb * 0.58, 0.04), (side * 0.07, Lb * 0.62, 0.036)], [(0, 0.0018), (1, 0.0006)], "ferracaris_leg", segs=4, n=6)
        R.add(A, "sp0")
    E = Part("ferr_eyes")
    for side in (-1, 1):
        eye(E, (side * 0.03, Lb * 0.43, 0.05), 0.004)
    R.add(E, "sp0")
    arm, ob = R.finish(subdiv=1)
    return arm


# ================================================================================================ ABYSSAL STALKER
def build_stalker():
    reset()
    R = Rig("stalker")
    Lt = 6.5
    # spine head to tail, a gentle S in plan
    pts = [Vector((0, 3.3, 0.0)), Vector((0, 2.55, 0.05)), Vector((0, 1.7, 0.08)), Vector((0, 0.85, 0.08)), Vector((0, 0.0, 0.05)),
           Vector((0, -0.85, 0.02)), Vector((0, -1.65, 0.0)), Vector((0, -2.35, 0.0)), Vector((0, -2.85, 0.0)), Vector((0, -3.2, 0.0))]
    sp = R.chain("sp", pts)
    P = Part("stalker_body")
    prof = [(0.0, (0.07, 0.04, 0.015, 2.4, 0.0)),        # snout tip
            (0.05, (0.19, 0.09, 0.02, 2.6, 0.0)),        # long flat wedge head (lower jaw added separately)
            (0.12, (0.29, 0.15, 0.04, 2.6, 0.0)),
            (0.17, (0.33, 0.19, 0.17, 2.4, 0.0)),        # jaw hinge
            (0.24, (0.31, 0.21, 0.21, 2.2, 0.0)),        # neck
            (0.4, (0.41, 0.29, 0.29, 2.2, 0.0)),         # the muscular torso
            (0.56, (0.41, 0.29, 0.27, 2.2, 0.0)),
            (0.75, (0.26, 0.2, 0.17, 2.2, 0.0)),
            (0.9, (0.12, 0.12, 0.1, 2.2, 0.0)),
            (1.0, (0.03, 0.04, 0.03, 2.0, 0.0))]

    def sculpt(t, a, p, T, L, N):
        # a low dorsal keel along the back, the head flattened and wedge-like
        s = math.sin(a)
        if s > 0.6 and 0.25 < t < 0.85:
            p = p + N * 0.035 * (s - 0.6) / 0.4
        return p
    rings, F, S = body(P, pts, prof, "stalker_skin", "stalker_belly", segs=26, n=46, warp=sculpt, tile=0.9)
    jitter(P, 0.012, freq=1.3, seed=7)
    R.add(P, sp, power=3.0)
    # head: lower jaw, teeth; eyes recessed on the upper sides; gill slits
    J = Part("stalker_jaw")
    H = Part("stalker_head")
    jawed_head(R, H, J, (0, 3.26, -0.015), (0, 2.2, -0.03), 0.3, 0.18, 0.15, "stalker_skin", "stalker_belly", teeth_n=19, tooth=0.05)
    for side in (-1, 1):
        eye(H, (side * 0.2, 2.72, 0.1), 0.032)
        for g in range(4):
            y = 1.98 - g * 0.1
            H.box((0.02, 0.04, 0.22), at=(side * 0.315, y, -0.01), rot=(0, side * 12, 0), mat="bio_gum", bevel=0)
    R.add(H, "sp0")
    R.add(J, "jaw")
    # four paddle fins in two pairs (front larger), on muscular bases
    for idx, (y, span, chord, z) in enumerate(((1.45, 1.3, 0.62, -0.16), (-0.6, 0.85, 0.48, -0.12))):
        for side, sname in ((1, "R"), (-1, "L")):
            root = Vector((side * 0.36, y, z))
            mid = Vector((side * (0.36 + span * 0.55), y - span * 0.3, z - 0.1))
            tip = Vector((side * (0.36 + span), y - span * 0.55, z - 0.14))
            names = R.chain(f"fin{sname}{idx}_", [root, mid, tip], parent=sp[3 if idx == 0 else 5])
            Fn = Part(f"stalker_fin{sname}{idx}")
            sheet(Fn, root + Vector((0, chord * 0.5, 0)), root - Vector((0, chord * 0.5, 0)), tip + Vector((0, chord * 0.22, 0)), tip - Vector((0, chord * 0.3, 0)),
                  "stalker_skin", nu=8, nv=7, thick=0.07, camber=0.03, round_tip=0.55, normal=(0, 0, 1))
            tube(Fn, [root, root.lerp(mid, 0.5)], [(0, 0.16), (1, 0.06)], "stalker_skin", segs=10, n=5, cap0=False)
            R.add(Fn, names, power=3.0)
    # the caudal fin: a tall narrow vertical blade at the tail tip
    C = Part("stalker_tail")
    sheet(C, (0, -2.5, 0.05), (0, -3.25, 0.0), (0, -3.1, 0.62), (0, -3.5, 0.55), "stalker_skin", nu=7, nv=6, thick=0.04, round_tip=0.5, normal=(1, 0, 0))
    sheet(C, (0, -2.6, -0.02), (0, -3.25, 0.0), (0, -3.15, -0.42), (0, -3.45, -0.38), "stalker_skin", nu=7, nv=5, thick=0.04, round_tip=0.5, normal=(1, 0, 0))
    R.add(C, sp[-3:], power=3.0)
    arm, ob = R.finish(subdiv=1)
    return arm



def ringed(P, pts, r0, r1, mat, rings=6, segs=10, flat=1.0, n=None):
    """a segmented limb: a tapered tube whose radius swells at each segment"""
    def w(t, a, p, T, L, N):
        return p
    S = catmull(pts, n or 14)
    tube(P, pts, [(0, r0), (1, r1)], mat, segs=segs, n=n or 14, flat=flat,
         warp=lambda t, a, p, T, L, N: p + (L * math.cos(a) + N * math.sin(a) * flat) * (r0 + (r1 - r0) * t) * 0.14 * math.cos(TAU * rings * t))


def claws(P, tip, direction, spread, n, length, r, mat="bio_tooth", down=(0, 0, -1)):
    d = V(direction).normalized()
    side = d.cross(Vector(down)).normalized()
    for i in range(n):
        o = (i - (n - 1) / 2) * spread
        base = V(tip) + side * o
        cone(P, base, base + d * length + Vector(down) * length * 0.6, r, mat, bend=Vector(down))


# ================================================================================================ SEDIMENT MAW
def build_maw():
    reset()
    R = Rig("maw")
    rm, Ro = 0.56, 1.0
    nth = 48
    # static anchor bones round the body (hold the mound still) and eight radial lip chains (open the mouth)
    R.bone("sp0", (0, 0.2, 0.05), (0, -0.2, 0.05))
    anchors = ["sp0"]
    for k in range(8):
        a = TAU * k / 8
        n = R.bone(f"body{k}", (math.cos(a) * 0.75, math.sin(a) * 0.75, 0.05), (math.cos(a) * 1.0, math.sin(a) * 1.0, 0.0), "sp0")
        anchors.append(n)
    lips = []
    for k in range(8):
        a = TAU * k / 8
        c, s_ = math.cos(a), math.sin(a)
        lips += R.chain(f"lip{k}_", [(c * rm * 1.25, s_ * rm * 1.25, 0.24), (c * rm, s_ * rm, 0.27), (c * rm * 0.62, s_ * rm * 0.62, -0.2)], parent="sp0")
    # one surface of revolution: throat (bottom) up the ribbed funnel to the rim, out over the mound, down the skirt
    prof = []
    for j in range(9):                    # funnel: throat to rim
        t = j / 8
        prof.append((0.1 + (rm - 0.1) * t ** 0.8, -0.6 + 0.8 * t ** 1.3, "maw_throat" if j < 2 else "maw_flesh", t))
    prof.append((rm * 1.08, 0.24, "maw_flesh", 1.0))       # rolled lip
    for j in range(1, 9):                 # mound
        t = j / 8
        r = rm * 1.15 + (Ro - rm * 1.15) * t
        prof.append((r, 0.2 * (1 - t ** 2) ** 0.8, "maw_skin", 0.0))
    prof.append((Ro * 1.08, -0.06, "maw_skin", 0.0))
    prof.append((Ro * 1.1, -0.18, "maw_skin", 0.0))
    verts, uvs, mats = [], [], []
    acc = 0.0
    for i, (r, z, m, fold) in enumerate(prof):
        if i:
            acc += math.hypot(r - prof[i - 1][0], z - prof[i - 1][1])
        for k in range(nth + 1):
            a = TAU * k / nth
            rr = r * (1 + 0.16 * fold * (0.5 + 0.5 * math.sin(20 * a)) - 0.08 * fold) * (1 + 0.04 * math.sin(3 * a + 1.3))
            verts.append((math.cos(a) * rr, math.sin(a) * rr, z + (0.03 * math.sin(5 * a) if m == "maw_skin" else 0)))
            uvs.append((a * Ro * 1.2, acc * 1.2))
    W = nth + 1
    by = {}
    for i in range(len(prof) - 1):
        for k in range(nth):
            a0 = i * W + k
            by.setdefault(prof[i + 1][2] if prof[i][2] != prof[i + 1][2] and prof[i][2] == "maw_throat" else prof[i][2], []).append((a0, a0 + W, a0 + W + 1, a0 + 1))
    P = Part("maw_body")
    for m, fs in by.items():
        P.mesh(verts, fs, mat=m, recalc=False, uvs=uvs, bevel=0)
    P.mesh([(0, 0, -0.6)] + [verts[k] for k in range(nth)], [(0, (k + 1) % nth + 1, k + 1) for k in range(nth)], mat="maw_throat", recalc=False, bevel=0)
    jitter(P, 0.02, freq=2.5, seed=4)
    R.add(P, anchors + lips, power=5.0)
    # digging paddles: two pairs of ringed limbs with hooked digits, half buried at the sides
    for idx, ang in enumerate((0.75, 2.4)):
        for side, sname in ((1, "R"), (-1, "L")):
            a = ang if side > 0 else math.pi - ang
            d = Vector((math.cos(a), math.sin(a), 0))
            pts = [d * 0.82 + Vector((0, 0, 0.02)), d * 1.15 + Vector((0, 0, 0.1)), d * 1.45 + Vector((0, 0, 0.0)), d * 1.6 + Vector((0, 0, -0.08))]
            names = R.chain(f"leg{sname}{idx}_", pts, parent="sp0")
            Lp = Part(f"maw_leg{sname}{idx}")
            ringed(Lp, pts, 0.13, 0.06, "maw_skin", rings=5)
            claws(Lp, pts[-1], d, 0.06, 3, 0.12, 0.022)
            R.add(Lp, names)
    arm, ob = R.finish(subdiv=1)
    return arm


# ================================================================================================ LUMINOUS SIREN
def build_siren():
    reset()
    R = Rig("siren")
    pts = [Vector((0, 0.5 - i * 1.0 / 8, 0.0 + 0.012 * math.sin(i))) for i in range(9)]
    sp = R.chain("sp", pts)
    P = Part("siren_body")
    body(P, pts, [(0, (0.012, 0.012, 0.01, 2.2, 0)), (0.08, (0.03, 0.035, 0.03, 2.2, 0)), (0.25, (0.045, 0.06, 0.055, 2.2, 0)),
                  (0.5, (0.04, 0.055, 0.05, 2.2, 0)), (0.8, (0.022, 0.03, 0.028, 2.2, 0)), (1, (0.006, 0.01, 0.01, 2, 0))],
         "siren_body", "siren_body", segs=16, n=36, tile=0.3)
    R.add(P, sp)
    # the dark gut seen through the translucent body
    G = Part("siren_gut")
    body(G, [Vector((0, 0.36, 0.0)), Vector((0, 0.15, -0.005)), Vector((0, -0.12, 0.0))], [(0, (0.008, 0.01, 0.01, 2, 0)), (0.4, (0.022, 0.03, 0.028, 2, 0)), (1, (0.006, 0.008, 0.008, 2, 0))],
         "siren_organs", segs=10, n=14)
    R.add(G, sp[:6])
    E = Part("siren_head")
    for side in (-1, 1):
        eye(E, (side * 0.024, 0.43, 0.012), 0.009)
    E.box((0.02, 0.012, 0.004), at=(0, 0.495, -0.006), mat="siren_organs", bevel=0)
    R.add(E, "sp0")
    # fins: a long dorsal membrane, paired pectorals, a ventral fin, a broad forked caudal membrane
    F = Part("siren_fins")
    sheet(F, (0, 0.28, 0.05), (0, -0.25, 0.04), (0, 0.15, 0.17), (0, -0.33, 0.1), "siren_fin", nu=10, nv=5, thick=0.003, round_tip=0.2, normal=(1, 0, 0), edge=lambda u, v: 0.004 * math.sin(u * 30) * v)
    sheet(F, (0, 0.1, -0.05), (0, -0.2, -0.04), (0, 0.0, -0.13), (0, -0.3, -0.09), "siren_fin", nu=8, nv=4, thick=0.003, round_tip=0.3, normal=(1, 0, 0))
    R.add(F, sp[2:7])
    T_ = Part("siren_tail")
    for sgn in (1, -1):
        sheet(T_, (0, -0.4, 0.0), (0, -0.5, 0.0), (0, -0.62, 0.2 * sgn), (0, -0.78, 0.14 * sgn), "siren_fin", nu=8, nv=6, thick=0.003, round_tip=0.35, normal=(1, 0, 0),
              edge=lambda u, v: 0.006 * math.sin(v * 12 + u * 4) * v)
    R.add(T_, sp[-3:])
    for side, sname in ((1, "R"), (-1, "L")):
        root = Vector((side * 0.035, 0.3, -0.02))
        tip = Vector((side * 0.16, 0.18, -0.06))
        names = R.chain(f"fin{sname}0_", [root, root.lerp(tip, 0.5), tip], parent=sp[1])
        Fp = Part(f"siren_pec{sname}")
        sheet(Fp, root + Vector((0, 0.03, 0)), root - Vector((0, 0.04, 0)), tip + Vector((0, 0.02, 0)), tip - Vector((0, 0.06, 0)), "siren_fin", nu=6, nv=5, thick=0.003, round_tip=0.4, normal=(0, 0, 1))
        R.add(Fp, names)
    # the lure: a flexible stalk from the brow arching forward, a living light at its end
    lp = [Vector((0, 0.42, 0.04)), Vector((0, 0.42, 0.13)), Vector((0, 0.49, 0.2)), Vector((0, 0.58, 0.19)), Vector((0, 0.63, 0.12))]
    names = R.chain("lure", lp, parent="sp0")
    Lu = Part("siren_lure")
    tube(Lu, lp, [(0, 0.005), (1, 0.0018)], "siren_fin", segs=6, n=16)
    Lu.sphere(0.016, at=tuple(lp[-1] + Vector((0, 0.005, -0.012))), mat="siren_lure", segs=12, rings=8)
    R.add(Lu, names)
    arm, ob = R.finish(subdiv=1)
    return arm


# ================================================================================================ CHORUS HUNTER
def build_chorus():
    reset()
    R = Rig("chorus")
    pts = [Vector((0, 1.5 - i * 3.0 / 9, 0.02 * math.sin(i * 0.7))) for i in range(10)]
    sp = R.chain("sp", pts)
    P = Part("chorus_body")
    body(P, pts, [(0, (0.025, 0.02, 0.01, 2.2, 0)), (0.1, (0.05, 0.045, 0.012, 2.2, 0)), (0.2, (0.12, 0.13, 0.08, 2.2, 0.01)),
                  (0.28, (0.2, 0.2, 0.2, 2.2, 0)), (0.45, (0.27, 0.27, 0.3, 2.2, 0)), (0.62, (0.22, 0.24, 0.25, 2.2, 0)),
                  (0.82, (0.1, 0.12, 0.11, 2.2, 0)), (0.93, (0.05, 0.07, 0.05, 2.2, 0)), (1, (0.02, 0.03, 0.02, 2, 0))],
         "chorus_skin", "chorus_belly", segs=22, n=44, tile=0.8)
    jitter(P, 0.006, freq=2.0, seed=11)
    R.add(P, sp, power=3.0)
    J = Part("chorus_jaw")
    H = Part("chorus_head")
    jawed_head(R, H, J, (0, 1.49, -0.005), (0, 0.85, -0.02), 0.08, 0.05, 0.05, "chorus_skin", "chorus_belly", teeth_n=22, tooth=0.016)
    for i in range(13):
        y = 1.38 - i * 0.045
        for side in (-1, 1):
            H.sphere(0.006, at=(side * 0.016 * (1 + i * 0.12), y, 0.035 + i * 0.006), mat="chorus_glow", segs=6, rings=4)
    for side in (-1, 1):
        eye(H, (side * 0.11, 0.86, 0.07), 0.018)
    R.add(H, "sp0")
    R.add(J, "jaw")
    # throat grooves: pale ridges under the head
    G = Part("chorus_pleats")
    for k in range(6):
        x = (k - 2.5) * 0.045
        tube(G, [(x, 0.85, -0.14), (x * 1.3, 0.55, -0.24), (x * 1.4, 0.25, -0.27)], [(0, 0.008), (1, 0.004)], "chorus_belly", segs=5, n=8)
    R.add(G, sp[1:5])
    for side, sname in ((1, "R"), (-1, "L")):
        root = Vector((side * 0.22, 0.4, -0.12))
        mid = Vector((side * 0.55, 0.12, -0.22))
        tip = Vector((side * 0.85, -0.25, -0.28))
        names = R.chain(f"fin{sname}0_", [root, mid, tip], parent=sp[3])
        Fp = Part(f"chorus_pec{sname}")
        sheet(Fp, root + Vector((0, 0.12, 0)), root - Vector((0, 0.16, 0)), tip + Vector((0, 0.03, 0)), tip - Vector((0, 0.04, 0)), "chorus_skin", nu=7, nv=7, thick=0.04, round_tip=0.6, normal=(0, 0, 1), camber=0.02)
        R.add(Fp, names)
        root2 = Vector((side * 0.14, -0.55, -0.15))
        names2 = R.chain(f"fin{sname}1_", [root2, root2 + Vector((side * 0.2, -0.15, -0.06))], parent=sp[6])
        Fq = Part(f"chorus_pel{sname}")
        sheet(Fq, root2 + Vector((0, 0.07, 0)), root2 - Vector((0, 0.08, 0)), root2 + Vector((side * 0.22, -0.16, -0.06)), root2 + Vector((side * 0.2, -0.22, -0.06)), "chorus_skin", nu=5, nv=4, thick=0.025, round_tip=0.5, normal=(0, 0, 1))
        R.add(Fq, names2)
    D = Part("chorus_dorsal")
    sheet(D, (0, -0.05, 0.24), (0, -0.45, 0.2), (0, -0.3, 0.46), (0, -0.48, 0.42), "chorus_skin", nu=6, nv=5, thick=0.03, round_tip=0.55, normal=(1, 0, 0))
    R.add(D, sp[4:7])
    T_ = Part("chorus_tail")
    for sgn in (1, -1):
        sheet(T_, (0, -1.25, 0.0), (0, -1.45, 0.0), (0, -1.55, 0.42 * sgn), (0, -1.68, 0.36 * sgn), "chorus_skin", nu=6, nv=6, thick=0.03, round_tip=0.45, normal=(1, 0, 0))
    R.add(T_, sp[-3:], power=3.0)
    arm, ob = R.finish(subdiv=1)
    return arm


# ================================================================================================ RIFT ARCHITECT
def build_architect():
    reset()
    R = Rig("architect")
    H0 = 0.34
    R.chain("sp", [(0, 0.32, H0), (0, 0.0, H0 + 0.02), (0, -0.3, H0)])
    B = Part("arch_body")
    body(B, [Vector((0, 0.34, H0 - 0.04)), Vector((0, 0.0, H0)), Vector((0, -0.3, H0 - 0.02))], [(0, (0.12, 0.06, 0.08, 2, 0)), (0.4, (0.3, 0.1, 0.12, 2, 0)), (1, (0.15, 0.06, 0.08, 2, 0))],
         "architect_leg", "architect_leg", segs=16, n=12)
    R.add(B, ["sp0", "sp1"])
    # the carapace: a broad dome with a serrated, spiny rim and a few low ridges
    C = Part("arch_shell")
    plate(C, (0, 0.0, H0 + 0.04), (0, 1, 0), (1, 0, 0), (0, 0, 1), 0.42, 0.5, "architect_plate", rise=0.2, thick=0.05, nu=18, nv=14, tilt=0.0, sq=2.4, droop=0.1)
    for k in range(26):
        a = TAU * (k + 0.5) / 26
        ex, ey = 0.5 * math.cos(a), 0.42 * math.sin(a)
        base = Vector((ex * 0.98, ey * 0.98, H0 + 0.04))
        out = Vector((math.cos(a), math.sin(a) * 0.8, 0.15)).normalized()
        cone(C, base, base + out * (0.05 + 0.03 * (k % 2)), 0.018, "architect_plate", segs=5)
    for side in (-1, 1):
        tube(C, [(side * 0.15, 0.3, H0 + 0.12), (side * 0.2, 0.0, H0 + 0.19), (side * 0.15, -0.3, H0 + 0.12)], [(0, 0.015), (1, 0.008)], "architect_plate", segs=6, n=10)
    jitter(C, 0.008, freq=6, seed=21)
    R.add(C, ["sp0", "sp1"])
    # face: four small eyes, mouth tendrils, two long antennae
    F = Part("arch_face")
    for i, x in enumerate((-0.07, -0.025, 0.025, 0.07)):
        eye(F, (x, 0.42, H0 + 0.02 + 0.01 * (i in (1, 2))), 0.016)
    for k in range(10):
        x = (k - 4.5) * 0.018
        tube(F, [(x, 0.43, H0 - 0.04), (x * 1.4, 0.47, H0 - 0.1), (x * 1.8, 0.48, H0 - 0.18)], [(0, 0.004), (1, 0.0012)], "architect_leg", segs=4, n=6)
    R.add(F, "sp0")
    for side in (-1, 1):
        names = R.chain(f"ant{'R' if side > 0 else 'L'}", [(side * 0.05, 0.42, H0 + 0.04), (side * 0.15, 0.6, H0 + 0.25), (side * 0.3, 0.75, H0 + 0.3)], parent="sp0")
        A = Part(f"arch_ant{side}")
        tube(A, [(side * 0.05, 0.42, H0 + 0.04), (side * 0.15, 0.6, H0 + 0.25), (side * 0.3, 0.75, H0 + 0.3)], [(0, 0.006), (1, 0.0015)], "architect_leg", segs=4, n=10)
        R.add(A, names)
    # six walking legs (three pairs), spined, and two fine manipulators in front
    for i, y in enumerate((0.16, -0.02, -0.2)):
        for side, sname in ((1, "R"), (-1, "L")):
            hip = Vector((side * 0.3, y, H0 - 0.02))
            knee = Vector((side * 0.55, y + 0.02 * (1 - i), H0 + 0.14))
            ankle = Vector((side * 0.74, y - 0.04 * (i - 1), H0 * 0.4))
            foot = Vector((side * 0.82, y - 0.06 * (i - 1), 0.0))
            names = R.chain(f"leg{sname}{i}_", [hip, knee, ankle, foot], parent="sp1")
            Lp = Part(f"arch_leg{sname}{i}")
            ringed(Lp, [hip, knee, ankle, foot], 0.065, 0.02, "architect_leg", rings=3, segs=8, flat=0.8)
            for t in (0.3, 0.55, 0.75):
                q = catmull([hip, knee, ankle, foot], 21)[int(t * 20)]
                cone(Lp, q, q + Vector((side * 0.02, 0, 0.05)), 0.008, "architect_plate", segs=4)
            R.add(Lp, names)
    for side, sname in ((1, "R"), (-1, "L")):
        sh = Vector((side * 0.14, 0.36, H0 - 0.04))
        el = Vector((side * 0.32, 0.55, H0 + 0.02))
        wr = Vector((side * 0.28, 0.82, H0 - 0.12))
        hand = Vector((side * 0.22, 0.95, H0 - 0.22))
        names = R.chain(f"arm{sname}", [sh, el, wr, hand], parent="sp0")
        Ap = Part(f"arch_arm{sname}")
        ringed(Ap, [sh, el, wr, hand], 0.03, 0.012, "architect_leg", rings=3, segs=8)
        for k in range(3):
            o = (k - 1) * 0.025
            cone(Ap, hand + Vector((o, 0, 0)), hand + Vector((o * 1.6, 0.07, -0.06)), 0.007, "architect_plate", segs=4, bend=Vector((0, 0, -1)))
        R.add(Ap, names)
    arm, ob = R.finish(subdiv=1)
    return arm


# ================================================================================================ BREAKER SHIELD
def build_breaker():
    reset()
    R = Rig("breaker")
    H0 = 0.55
    sp = R.chain("sp", [(0, 1.3, H0 - 0.1), (0, 0.5, H0), (0, -0.4, H0), (0, -1.3, H0 - 0.15)])
    B = Part("brk_body")
    body(B, [Vector((0, 1.25, H0 - 0.15)), Vector((0, 0.3, H0)), Vector((0, -0.6, H0)), Vector((0, -1.45, H0 - 0.2))],
         [(0, (0.35, 0.2, 0.2, 2, 0)), (0.3, (0.95, 0.35, 0.3, 2.4, 0)), (0.7, (0.95, 0.33, 0.3, 2.4, 0)), (1, (0.2, 0.1, 0.12, 2, 0))],
         "breaker_skin", "breaker_skin", segs=20, n=16)
    R.add(B, sp)
    # armour: rows of angular overlapping plates, each lifted at its trailing edge and toothed
    S = Part("brk_shell")
    rows = [(0.95, 3, 0.5), (0.45, 3, 0.55), (-0.05, 3, 0.55), (-0.55, 3, 0.5), (-1.0, 2, 0.4)]
    for ri, (y, cols, a) in enumerate(rows):
        for ci in range(cols):
            x = (ci - (cols - 1) / 2) * 0.62
            z = H0 + 0.33 - abs(x) * 0.28
            Nn = Vector((x * 0.6, 0, 1)).normalized()
            Lv = Vector((1, 0, -x * 0.6)).normalized()
            plate(S, (x, y, z), (0, 1, 0.12), Lv, Nn, a * 0.62, 0.38, "breaker_plate", rise=0.12, thick=0.05, nu=8, nv=6, tilt=0.12, lip=0.03,
                  spikes=2 if ri < 4 else 1, spike_h=0.1, sq=3.0)
    # the front shield over the head
    plate(S, (0, 1.32, H0 + 0.12), (0, 1, -0.35), (1, 0, 0), (0, 0.35, 1), 0.38, 0.62, "breaker_plate", rise=0.14, thick=0.06, nu=10, nv=6, tilt=0.05, spikes=3, spike_h=0.12, sq=3.0)
    jitter(S, 0.02, freq=2.0, seed=17)
    R.add(S, sp)
    # head beneath the shield: eyes, feelers, crushing plates
    Hh = Part("brk_head")
    body(Hh, [Vector((0, 1.62, H0 - 0.2)), Vector((0, 1.3, H0 - 0.12))], [(0, (0.12, 0.08, 0.1, 2, 0)), (1, (0.25, 0.12, 0.14, 2, 0))], "breaker_skin", segs=12, n=6)
    for side in (-1, 1):
        eye(Hh, (side * 0.15, 1.52, H0 - 0.1), 0.035)
    for k in range(8):
        x = (k - 3.5) * 0.04
        tube(Hh, [(x, 1.62, H0 - 0.25), (x * 1.3, 1.72, H0 - 0.38), (x * 1.6, 1.78, H0 - 0.5)], [(0, 0.012), (1, 0.003)], "breaker_skin", segs=5, n=6)
    R.add(Hh, "sp0")
    # six short thick limbs with clawed feet
    for i, y in enumerate((0.9, 0.0, -0.85)):
        for side, sname in ((1, "R"), (-1, "L")):
            hip = Vector((side * 0.8, y, H0 - 0.1))
            knee = Vector((side * 1.15, y + 0.05, H0 - 0.05))
            foot = Vector((side * 1.3, y + 0.1, 0.04))
            names = R.chain(f"leg{sname}{i}_", [hip, knee, foot], parent=sp[1 if i < 2 else 2])
            Lp = Part(f"brk_leg{sname}{i}")
            ringed(Lp, [hip, knee, foot], 0.17, 0.11, "breaker_skin", rings=3, segs=10)
            for k in range(3):
                plate(Lp, hip.lerp(knee, 0.3 + k * 0.3) + Vector((0, 0, 0.1)), (knee - hip).normalized(), Vector((0, 1, 0)), Vector((0, 0, 1)), 0.12, 0.12, "breaker_plate", rise=0.04, thick=0.03, nu=4, nv=3)
            claws(Lp, foot + Vector((0, 0.05, 0.02)), Vector((side * 0.3, 1, 0)), 0.06, 3, 0.12, 0.025)
            R.add(Lp, names)
    arm, ob = R.finish(subdiv=1)
    return arm


# ================================================================================================ ABYSSAL CATHEDRAL
def build_cathedral():
    reset()
    R = Rig("cathedral")
    pts = [Vector((0, 7.0 - i * 14.5 / 7, 0.1 * math.sin(i * 0.5))) for i in range(8)]
    sp = R.chain("sp", pts)
    P = Part("cath_body")

    def sculpt(t, a, p, T, L, N):
        # cranial ridges: two raised swells over the head
        s = math.sin(a)
        if t < 0.35 and s > 0.3:
            p = p + N * 0.18 * (abs(math.cos(a * 2)) ** 6) * (1 - t / 0.35)
        return p
    body(P, pts, [(0, (2.0, 1.1, 1.4, 2.2, 0)), (0.12, (2.5, 1.55, 1.75, 2.4, 0.05)), (0.35, (2.9, 1.7, 1.6, 2.6, 0.1)), (0.6, (2.2, 1.3, 1.1, 2.4, 0.05)),
                  (0.85, (0.8, 0.6, 0.5, 2.2, 0)), (1, (0.15, 0.15, 0.12, 2, 0))],
         "cathedral_skin", "cathedral_skin", segs=28, n=40, cap0=False, warp=sculpt, tile=2.0)
    jitter(P, 0.06, freq=0.6, seed=5)
    R.add(P, sp, power=3.0)
    # the open mouth: a ring of pale filter lamellae set back in the throat, a dark gullet behind them
    M = Part("cath_mouth")
    for k in range(26):
        a = math.pi * (k + 0.5) / 26
        x = math.cos(a) * 1.75
        zt = 0.95 * math.sin(a) ** 0.7
        M.box((0.09, 0.9, 1.0 + zt * 1.4), at=(x, 6.2, -0.25 + zt * 0.3), rot=(0, -math.degrees(math.cos(a)) * 0.5, 0), mat="cathedral_filter", bevel=0.03)
    for k in range(14):
        x = (k - 6.5) * 0.25
        M.box((0.06, 0.8, 0.7), at=(x, 6.25, -1.0), mat="cathedral_filter", bevel=0.02)
    M.cyl(1.9, 0.2, at=(0, 5.6, -0.1), rot=(90, 0, 0), mat="maw_throat", segs=24, bevel=0)
    R.add(M, ["sp0", "sp1"])
    # winglike fins with flexible rays, slow wide strokes
    for side, sname in ((1, "R"), (-1, "L")):
        root0, root1 = Vector((side * 2.6, 3.2, 0.1)), Vector((side * 2.6, -2.2, 0.0))
        tip = Vector((side * 10.5, -2.6, 0.4))
        span = [Vector((side * 2.6, 0.6, 0.05)), Vector((side * 5.0, -0.2, 0.15)), Vector((side * 7.5, -1.2, 0.3)), tip]
        names = R.chain(f"wing{sname}", span, parent=sp[2])
        Wg = Part(f"cath_wing{sname}")
        sheet(Wg, root0, root1, tip + Vector((0, 0.7, 0)), tip - Vector((0, 0.4, 0)), "cathedral_wing", nu=10, nv=10, thick=0.22, camber=0.15, round_tip=0.7, normal=(0, 0, 1),
              curl=0.0, edge=lambda u, v: 0.12 * math.sin(u * 9 + v * 3) * v * v)
        R.add(Wg, names, power=3.0)
    # bioluminescent lines along the underside (counter-illumination and recognition)
    G = Part("cath_glow")
    for k in range(6):
        x = (k - 2.5) * 0.55
        path = [Vector((x * 0.7, 5.6, -1.55)), Vector((x, 3.0, -1.72)), Vector((x * 1.2, 0.0, -1.62)), Vector((x * 0.9, -3.0, -1.05))]
        tube(G, path, [(0, 0.025), (1, 0.015)], "cathedral_glow", segs=5, n=20)
    for k in range(5):
        tube(G, [(2.4, 2.0 - k * 1.2, -0.9), (5.0, 1.2 - k * 1.1, -0.6), (7.0, 0.2 - k * 0.9, -0.4)], [(0, 0.02), (1, 0.01)], "cathedral_glow", segs=4, n=10)
        tube(G, [(-2.4, 2.0 - k * 1.2, -0.9), (-5.0, 1.2 - k * 1.1, -0.6), (-7.0, 0.2 - k * 0.9, -0.4)], [(0, 0.02), (1, 0.01)], "cathedral_glow", segs=4, n=10)
    R.add(G, sp, power=3.0)
    E = Part("cath_eyes")
    for side in (-1, 1):
        eye(E, (side * 2.15, 5.4, 0.55), 0.14)
    R.add(E, "sp0")
    T_ = Part("cath_tail")
    for sgn in (1, -1):
        sheet(T_, (sgn * 0.1, -6.0, 0.05), (sgn * 0.1, -7.4, 0.0), (sgn * 1.6, -7.6, 0.15), (sgn * 1.4, -8.2, 0.1), "cathedral_wing", nu=5, nv=5, thick=0.1, round_tip=0.5, normal=(0, 0, 1))
    R.add(T_, sp[-2:])
    arm, ob = R.finish(subdiv=1)
    return arm


# ================================================================================================ GARGANTUAN CROWN
def build_crown():
    reset()
    R = Rig("crown")
    pts = [Vector((0, 5.0 - i * 10.0 / 9, 0.06 * math.sin(i * 0.6))) for i in range(10)]
    sp = R.chain("sp", pts)
    P = Part("crown_body")
    body(P, pts, [(0, (0.35, 0.25, 0.05, 2.4, 0)), (0.06, (0.75, 0.5, 0.1, 2.5, 0)), (0.14, (1.05, 0.75, 0.2, 2.5, 0)), (0.22, (1.15, 0.9, 0.85, 2.3, 0)),
                  (0.42, (1.35, 1.25, 1.2, 2.2, 0)), (0.65, (1.0, 0.95, 0.9, 2.2, 0)), (0.85, (0.45, 0.5, 0.45, 2.2, 0)), (1, (0.12, 0.15, 0.12, 2, 0))],
         "crown_skin", "crown_skin", segs=28, n=46, tile=1.4)
    jitter(P, 0.05, freq=0.8, seed=31)
    R.add(P, sp, power=3.0)
    J = Part("crown_jaw")
    H = Part("crown_head")
    jawed_head(R, H, J, (0, 4.95, -0.03), (0, 3.7, -0.06), 0.95, 0.4, 0.55, "crown_skin", "crown_skin", teeth_n=13, tooth=0.3, jaw_drop=0.05)
    # the crown: reinforced mineral ridges swept back over the brow and the sensory pits
    for side in (-1, 1):
        for k in range(5):
            t = k / 4
            base = Vector((side * (0.3 + 0.55 * t), 4.4 - 0.55 * k, 0.62 + 0.25 * t - 0.1 * t * t))
            tip = base + Vector((side * (0.25 + 0.15 * t), -0.65 - 0.1 * k, 0.45 + 0.2 * (1 - abs(t - 0.5) * 2)))
            cone(H, base, tip, 0.11 - 0.012 * k, "crown_bone", segs=7, bend=Vector((side * 0.3, -1, 0.3)))
        tube(H, [(side * 0.25, 4.7, 0.4), (side * 0.6, 4.2, 0.7), (side * 0.85, 3.3, 0.8), (side * 0.95, 2.5, 0.75)], [(0, 0.08), (1, 0.05)], "crown_bone", segs=8, n=12)
        eye(H, (side * 0.78, 4.1, 0.42), 0.075)
        # whisker filaments hanging from the lower jaw
        for w in range(5):
            b = Vector((side * (0.25 + w * 0.14), 4.4 - w * 0.12, -0.6))
            tube(J, [b, b + Vector((side * 0.05, -0.15, -0.35)), b + Vector((side * 0.12, -0.3, -0.7))], [(0, 0.018), (1, 0.004)], "crown_skin", segs=4, n=8)
    R.add(H, "sp0")
    R.add(J, "jaw")
    for side, sname in ((1, "R"), (-1, "L")):
        root = Vector((side * 1.1, 2.4, -0.5))
        tip = Vector((side * 3.6, 0.6, -0.95))
        names = R.chain(f"fin{sname}0_", [root, root.lerp(tip, 0.5), tip], parent=sp[3])
        Fp = Part(f"crown_pec{sname}")
        sheet(Fp, root + Vector((0, 0.6, 0)), root - Vector((0, 0.7, 0)), tip + Vector((0, 0.15, 0)), tip - Vector((0, 0.25, 0)), "crown_skin", nu=8, nv=8, thick=0.14, round_tip=0.6, normal=(0, 0, 1), camber=0.05)
        R.add(Fp, names, power=3.0)
    D = Part("crown_fins")
    sheet(D, (0, 0.4, 1.15), (0, -1.6, 0.9), (0, -0.6, 1.9), (0, -1.9, 1.5), "crown_skin", nu=6, nv=5, thick=0.09, round_tip=0.6, normal=(1, 0, 0))
    R.add(D, sp[4:7])
    T_ = Part("crown_tail")
    sheet(T_, (0, -4.0, 0.1), (0, -4.95, 0.0), (0, -5.6, 1.9), (0, -6.1, 1.6), "crown_skin", nu=6, nv=7, thick=0.08, round_tip=0.4, normal=(1, 0, 0))
    sheet(T_, (0, -4.2, -0.1), (0, -4.95, 0.0), (0, -5.4, -1.2), (0, -5.8, -1.0), "crown_skin", nu=6, nv=6, thick=0.08, round_tip=0.4, normal=(1, 0, 0))
    R.add(T_, sp[-3:], power=3.0)
    arm, ob = R.finish(subdiv=1)
    return arm


# ================================================================================================ MIMIC CRAWLER
def build_mimic():
    reset()
    R = Rig("mimic")
    H0 = 0.28
    sp = R.chain("sp", [(0, 0.2, H0), (0, -0.05, H0 + 0.08), (0, -0.4, H0 + 0.2), (0, -0.62, H0 + 0.24)])
    P = Part("mim_body")
    body(P, [Vector((0, 0.22, H0 - 0.02)), Vector((0, 0.0, H0 + 0.06)), Vector((0, -0.3, H0 + 0.16)), Vector((0, -0.6, H0 + 0.22))],
         [(0, (0.16, 0.12, 0.14, 2, 0)), (0.3, (0.24, 0.22, 0.16, 2.2, 0)), (0.65, (0.22, 0.24, 0.17, 2.2, 0)), (1, (0.06, 0.08, 0.07, 2, 0))],
         "mimic_skin", "mimic_skin", segs=20, n=18)
    jitter(P, 0.012, freq=6, seed=41)
    R.add(P, sp)
    # armour plates over the mantle, the papillae-rough skin between them
    S = Part("mim_plates")
    for k in range(7):
        t = k / 6
        y = 0.05 - t * 0.6
        for x in ((-0.11, 0.11) if k % 2 == 0 else (0.0,)):
            plate(S, (x, y, H0 + 0.25 + 0.12 * t * (1 - t) * 2 + 0.06 * t), (0, 1, 0.3), (1, 0, 0), (x * 1.5, -0.2, 1), 0.1, 0.12, "mimic_plate", rise=0.04, thick=0.012, nu=6, nv=5, tilt=0.03, sq=2.5)
    for side in (-1, 1):
        eye(S, (side * 0.17, 0.16, H0 + 0.12), 0.04, lid="mimic_skin", lid_mat="mimic_plate", toward=(side, 0.3, 0.4))
    jitter(S, 0.004, freq=12, seed=42)
    R.add(S, sp)
    # eight arms: muscular proximal sections with plates, flexible tips, a double row of suckers below, a hook at the end
    for k in range(8):
        a = math.radians(90 - 158 + k * (316 / 7))
        d = Vector((math.cos(a), math.sin(a), 0))
        base = Vector((0, 0.18, H0 - 0.1)) + d * 0.12
        pts = [base, base + d * 0.25 + Vector((0, 0, 0.08)), base + d * 0.55 + Vector((0, 0, 0.02)), base + d * 0.8 + Vector((0, 0, -0.14)),
               base + d * 0.98 + Vector((0, 0, -0.24)), base + d * 1.12 + Vector((0, 0, -0.26))]
        names = R.chain(f"arm{k}_", pts, parent="sp0")
        Ap = Part(f"mim_arm{k}")
        S_, F_ = tube(Ap, pts, [(0, 0.075), (0.4, 0.05), (1, 0.008)], "mimic_skin", segs=10, n=22, mat_under="mimic_sucker")
        for j in range(4, 18, 2):
            T, L, N = F_[j]
            rr = 0.075 * (1 - j / 22) + 0.01
            for sgn in (-1, 1):
                Ap.sphere(rr * 0.28, at=tuple(S_[j] - N * rr * 0.95 + L * sgn * rr * 0.35), mat="mimic_sucker", segs=6, rings=4)
            if j < 10:
                plate(Ap, S_[j] + N * rr * 0.85, T, L, N, rr * 0.9, rr * 0.75, "mimic_plate", rise=rr * 0.25, thick=0.006, nu=4, nv=3, tilt=0.01)
        cone(Ap, pts[-1], pts[-1] + d * 0.06 + Vector((0, 0, -0.03)), 0.008, "bio_tooth", segs=4, bend=Vector((0, 0, -1)))
        R.add(Ap, names)
    arm, ob = R.finish(subdiv=1)
    return arm


BUILD = {"ferracaris": build_ferracaris, "stalker": build_stalker, "maw": build_maw, "siren": build_siren, "chorus": build_chorus,
         "architect": build_architect, "breaker": build_breaker, "cathedral": build_cathedral, "crown": build_crown, "mimic": build_mimic}
VIEW = {"ferracaris": ((0.32, -0.42, 0.26), (0, 0, 0.03), 40), "stalker": ((4.5, 5.0, 1.6), (0, 1.5, 0), 35),
        "maw": ((2.6, -3.0, 2.4), (0, 0, 0), 35), "siren": ((0.8, 0.6, 0.25), (0, 0.05, 0.03), 35), "chorus": ((3.0, 2.4, 0.8), (0, 0.4, 0), 35),
        "architect": ((1.6, 1.9, 1.0), (0, 0.2, 0.3), 35), "breaker": ((3.8, 4.2, 2.2), (0, 0.4, 0.5), 35), "cathedral": ((16, 20, -6), (0, 2, 0), 35),
        "crown": ((9, 10, 2), (0, 2, 0), 35), "mimic": ((1.9, 2.0, 1.3), (0, 0, 0.25), 35)}

if __name__ == "__main__":
    pv = "--preview" in sys.argv
    only = [a for a in sys.argv[1:] if not a.startswith("-")]
    for name, fn in BUILD.items():
        if only and name not in only:
            continue
        fn()
        if pv:
            eye_, tgt, lens = VIEW[name]
            preview("cr_" + name, eye_, tgt, res=(900, 600), lens=lens, samples=32, sky=(0.55, 0.62, 0.68))
        export(name)
