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
from skin import Look  # noqa: E402
from mathutils import noise  # noqa: E402
import bpy  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "public", "assets", "creatures", "miller")


def export(name):
    export_glb(name, out_dir=OUT, images=True)


# ------------------------------------------------------------------------------------------------ helpers
def prof_at(prof, t):
    """the (w, h_top, h_bot) of a body profile at length fraction t"""
    return interp([(k, v) for k, v in prof] + ([(1.0, prof[-1][1])] if prof[-1][0] < 1 else []), 201)[int(round(max(0.0, min(1.0, t)) * 200))][:3]


def jawed_head(R, P, J, snout, hinge, width, top_h, jaw_h, skin, belly, teeth_n=14, tooth=0.04, gum="bio_gum",
               tooth_mat="bio_tooth", head_bone="sp0", lower_teeth=None, jaw_drop=0.0, wfun=None, n=14):
    """A lower jaw (part J, bound to 'jaw') under the skull from the hinge to the snout, following the head's own
    width (wfun(t), t = 0 at the snout .. 1 at the hinge) so the closed mouth reads as one head; a palate and tongue;
    teeth along both jaw edges, hooked backward, longest a third of the way back."""
    s, h = V(snout), V(hinge)
    L = (s - h).length
    fwd = (s - h).normalized()
    wf = wfun or (lambda t: width * (0.35 + 0.65 * t))
    R.bone("jaw", h, s - fwd * L * 0.1, head_bone)
    spine = [s - fwd * 0.01 + Vector((0, 0, -jaw_drop)), s.lerp(h, 0.5) + Vector((0, 0, -jaw_drop * 0.7)), h + Vector((0, 0, -jaw_drop * 0.4))]
    stations = []
    for i in range(6):
        t = i / 5
        w = wf(t) * 0.97
        stations.append((t, (w, jaw_h * (0.08 + 0.12 * t), jaw_h * (0.45 + 0.6 * t ** 0.7), 2.3, -jaw_h * 0.05)))
    body(J, spine, stations, skin, belly, segs=28, n=n * 2, cap0=True, cap1=True)
    # palate (under the skull) and tongue (top of the jaw): dark flesh, seen when the mouth opens
    pal, tng = [], []
    for i in range(n + 1):
        t = i / n
        c = s.lerp(h, t)
        w = wf(t) * 0.82
        pal += [tuple(c + Vector((-w, 0, -0.004))), tuple(c + Vector((w, 0, -0.004)))]
        tng += [tuple(c + Vector((-w, 0, -jaw_drop * (1 - 0.6 * t) - 0.002))), tuple(c + Vector((w, 0, -jaw_drop * (1 - 0.6 * t) - 0.002)))]
    fp = [(2 * i, 2 * i + 2, 2 * i + 3, 2 * i + 1) for i in range(n)]
    P.mesh(pal, [tuple(reversed(f)) for f in fp], mat=gum, recalc=False, bevel=0)
    J.mesh(tng, fp, mat=gum, recalc=False, bevel=0)
    for side in (-1, 1):
        for i in range(teeth_n):
            t = (i + 0.5) / teeth_n
            sz = tooth * (0.5 + 0.9 * math.sin(math.pi * min(1.0, t * 1.4))) * (0.85 + 0.3 * ((i * 7) % 5) / 4)
            w = wf(t) * 0.86
            base = s.lerp(h, t) + Vector((side * w, 0, 0))
            cone(P, base + Vector((0, 0, 0.004)), base + Vector((0, 0, -sz)) - fwd * sz * 0.35, sz * 0.2, tooth_mat, bend=-fwd, segs=7)
            nl = lower_teeth if lower_teeth is not None else teeth_n
            if i < nl:
                t2 = (i + 0.8) / teeth_n
                lb = s.lerp(h, t2) + Vector((side * wf(t2) * 0.82, 0, -jaw_drop * (1 - 0.6 * t2)))
                cone(J, lb + Vector((0, 0, -0.004)), lb + Vector((0, 0, sz * 0.85)) - fwd * sz * 0.3, sz * 0.18, tooth_mat, bend=-fwd, segs=7)



# ================================================================================================ skins
FERR_LOOK = {
    "ferracaris_shell": Look("#86675f", belly="#a98a80", counter=0.15, mottle=0.35, mottle_size=0.03, spots=0.3, spot_size=0.02, spot_color="#5e4256",
                             rough=0.42, disp="plates", amp=0.0012, size=0.01, groove=0.45, rim=0.2, seed=11),
    "ferracaris_leg": Look("#d1b9a8", mottle=0.2, mottle_size=0.01, rough=0.35, disp="pores", amp=0.0003, size=0.003, seed=12, opacity=0.85),
    "bio_eye": None,
}
MAW_LOOK = {
    "maw_skin": Look("#a59a83", mottle=0.45, mottle_size=0.18, spots=0.55, spot_size=0.035, spot_color="#2b2826", rough=0.75, rough_var=0.15,
                     disp="sediment", amp=0.01, size=0.022, groove=0.35, rim=0.15, seed=21),
    "maw_flesh": Look("#a07c63", belly="#7a5544", mottle=0.25, mottle_size=0.1, rough=0.3, disp="ribs", amp=0.006, size=0.045, stretch=(1.0, 1.0, 0.5), groove=0.5, rim=0.18, seed=22),
    "maw_throat": Look("#1d1410", mottle=0.2, mottle_size=0.1, rough=0.25, disp="wrinkles", amp=0.004, size=0.05, seed=23),
}
SIREN_LOOK = {
    "siren_body": Look("#8fa6b8", belly="#b6c8d4", mottle=0.2, mottle_size=0.04, spots=0.25, spot_size=0.012, spot_color="#3c4a58", rough=0.18,
                       disp="scales", amp=0.0004, size=0.004, groove=0.25, rim=0.2, seed=31, opacity=0.6),
    "siren_fin": Look("#b9d1e4", mottle=0.15, mottle_size=0.03, rough=0.15, disp="ribs", amp=0.0004, size=0.006, stretch=(1.0, 0.15, 1.0), groove=0.35, rim=0.3, seed=32, opacity=0.38),
    "siren_organs": Look("#2a2328", mottle=0.3, mottle_size=0.02, rough=0.4, disp="wrinkles", amp=0.0006, size=0.008, seed=33),
}
CHORUS_LOOK = {
    "chorus_skin": Look("#394654", belly="#8d98a3", counter=0.3, mottle=0.35, mottle_size=0.12, spots=0.3, spot_size=0.08, spot_color="#25303b",
                        rough=0.32, disp="wrinkles", amp=0.0016, size=0.035, stretch=(1.0, 0.35, 1.0), groove=0.25, rim=0.1, seed=41),
    "chorus_belly": Look("#848f9a", mottle=0.15, mottle_size=0.1, rough=0.4, disp="ribs", amp=0.0025, size=0.03, groove=0.35, seed=42),
    "bio_gum": Look("#5c2826", rough=0.22, disp="pores", amp=0.0008, size=0.008, seed=43),
}
ARCH_LOOK = {
    "architect_plate": Look("#6a5974", belly="#8b7a8a", counter=0.2, mottle=0.4, mottle_size=0.08, spots=0.35, spot_size=0.04, spot_color="#b5a98c",
                            rough=0.55, disp="plates", amp=0.006, size=0.05, groove=0.45, rim=0.25, seed=51),
    "architect_leg": Look("#7b6c79", mottle=0.3, mottle_size=0.05, spots=0.2, spot_size=0.02, spot_color="#4c3f4e", rough=0.5, disp="plates", amp=0.003, size=0.025, groove=0.4, rim=0.2, seed=52),
}
BREAKER_LOOK = {
    "breaker_plate": Look("#5d5b4c", belly="#4c4a3e", mottle=0.45, mottle_size=0.25, spots=0.35, spot_size=0.12, spot_color="#4e5a3c",
                          rough=0.5, rough_var=0.2, disp="plates", amp=0.02, size=0.16, groove=0.5, rim=0.3, seed=61),
    "breaker_skin": Look("#4a493d", mottle=0.3, mottle_size=0.1, rough=0.45, disp="wrinkles", amp=0.009, size=0.07, groove=0.45, rim=0.12, seed=62),
}
CATH_LOOK = {
    "cathedral_skin": Look("#3b4759", belly="#8f9aaa", counter=0.3, mottle=0.35, mottle_size=1.2, spots=0.3, spot_size=0.5, spot_color="#a7b3c2",
                           rough=0.38, disp="wrinkles", amp=0.012, size=0.22, stretch=(1.0, 0.5, 1.0), groove=0.3, rim=0.1, seed=71),
    "cathedral_wing": Look("#465469", belly="#7c879a", counter=0.2, mottle=0.4, mottle_size=0.8, spots=0.25, spot_size=0.35, spot_color="#6f5f7a",
                           rough=0.35, disp="membrane", amp=0.01, size=0.35, groove=0.2, rim=0.15, seed=72),
    "cathedral_filter": Look("#d8d0bb", mottle=0.2, mottle_size=0.1, rough=0.5, disp="pores", amp=0.006, size=0.025, groove=0.4, seed=73),
}
CROWN_LOOK = {
    "crown_skin": Look("#1b1f26", belly="#353b44", counter=0.25, mottle=0.3, mottle_size=0.6, spots=0.2, spot_size=0.25, spot_color="#0e1115",
                       rough=0.42, disp="scales", amp=0.012, size=0.06, stretch=(1.0, 0.8, 1.0), groove=0.45, rim=0.15, seed=81),
    "crown_bone": Look("#8a8476", mottle=0.35, mottle_size=0.08, spots=0.25, spot_size=0.05, spot_color="#5a554b", rough=0.55, disp="plates", amp=0.012, size=0.07, groove=0.5, rim=0.25, seed=82),
    "bio_gum": Look("#4a1e1c", rough=0.22, disp="pores", amp=0.003, size=0.03, seed=83),
}
MIMIC_LOOK = {
    "mimic_skin": Look("#6c6255", belly="#8f8070", counter=0.15, mottle=0.65, mottle_size=0.06, spots=0.5, spot_size=0.035, spot_color="#3a3128",
                       rough=0.45, disp="pores", amp=0.004, size=0.014, groove=0.5, rim=0.25, seed=91),
    "mimic_plate": Look("#5b534a", mottle=0.45, mottle_size=0.05, spots=0.35, spot_size=0.02, spot_color="#7a5a3e", rough=0.6, disp="plates", amp=0.004, size=0.03, groove=0.5, rim=0.3, seed=92),
    "mimic_sucker": Look("#c9a395", mottle=0.2, mottle_size=0.02, rough=0.3, disp="smooth", amp=0.0005, size=0.01, seed=93),
}


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
            cone(Fr, base, base + out * 0.016 * (0.7 + 0.3 * math.sin(k)), 0.0018, "ferr_fringe", segs=4)
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
    arm, ob = R.finish(subdiv=1, looks={k: v for k, v in FERR_LOOK.items() if v}, tex=1024, levels=2)
    return arm


# ================================================================================================ ABYSSAL STALKER
def stalker_marks(p, n, mat):
    """gill slits, lateral-line pores, snout pits, healed scars (metres of relief, darkening)"""
    if mat not in ("stalker_skin", "stalker_belly"):
        return None
    dh, dark = 0.0, 0.0
    side = abs(p.x)
    # four curved gill slits behind the jaw hinge, low on the flank
    if 1.78 < p.y < 2.12 and side > 0.18 and -0.2 < p.z < 0.12:
        for k in range(4):
            yk = 2.04 - k * 0.085 + 0.05 * p.z
            g = math.exp(-((p.y - yk) / 0.011) ** 2)
            dh -= 0.014 * g
            dark = max(dark, g * 0.7)
    # the lateral line: a row of pores along the flank
    if -2.6 < p.y < 2.0 and side > 0.12:
        zl = 0.04 + 0.04 * math.sin(p.y * 0.7)
        if abs(p.z - zl) < 0.012:
            q = (p.y * 25.0) % 1.0
            if 0.4 < q < 0.6:
                dh -= 0.003
                dark = max(dark, 0.45)
    # electroreceptive pits round the snout
    if p.y > 2.55:
        c = noise.voronoi(p * 38.0, distance_metric="DISTANCE")[0][0]
        if c < 0.12:
            dh -= 0.0025
            dark = max(dark, 0.5)
    # healed scars: pale raised lines across the flank
    for cy, cz, R in ((0.4, 0.15, 0.32), (-0.7, 0.0, 0.5), (1.2, 0.25, 0.22), (-1.6, 0.1, 0.4)):
        d = abs(math.hypot(p.y - cy, p.z - cz) - R)
        if d < 0.008 and p.x > 0.1:
            dh += 0.0015
            dark = min(dark, -0.6)
    return dh, dark


STALKER_LOOK = {
    "stalker_skin": Look("#27303b", belly="#4b535d", counter=0.35, mottle=0.28, mottle_size=0.45, spots=0.18, spot_size=0.35, spot_color="#161b22",
                         rough=0.5, rough_var=0.12, disp="scales", amp=0.004, size=0.028, stretch=(1.0, 0.75, 1.0), groove=0.4, rim=0.12, seed=3),
    "stalker_fin": Look("#232b35", belly="#3a424c", counter=0.2, mottle=0.3, mottle_size=0.25, rough=0.5, rough_var=0.1, disp="ribs", amp=0.003, size=0.06,
                        stretch=(1.0, 0.2, 1.0), groove=0.35, rim=0.1, seed=8),
    "stalker_belly": Look("#4f5762", mottle=0.15, mottle_size=0.3, rough=0.55, disp="wrinkles", amp=0.0025, size=0.05, stretch=(1.0, 0.3, 1.0), groove=0.3, seed=4),
    "bio_gum": Look("#5c2826", mottle=0.2, mottle_size=0.05, rough=0.22, disp="pores", amp=0.0012, size=0.012, groove=0.3, seed=5),
}


def build_stalker():
    reset()
    R = Rig("stalker")
    pts = [Vector((0, 3.3, 0.0)), Vector((0, 2.55, 0.05)), Vector((0, 1.7, 0.08)), Vector((0, 0.85, 0.08)), Vector((0, 0.0, 0.05)),
           Vector((0, -0.85, 0.02)), Vector((0, -1.65, 0.0)), Vector((0, -2.35, 0.0)), Vector((0, -2.85, 0.0)), Vector((0, -3.2, 0.0))]
    sp = R.chain("sp", pts)
    P = Part("stalker_body")
    prof = [(0.0, (0.018, 0.014, 0.008, 2.2, 0.0)),      # snout tip
            (0.015, (0.09, 0.05, 0.014, 2.4, 0.0)),
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
        s, c = math.sin(a), math.cos(a)
        out = p
        # epaxial muscle: two long swells either side of a shallow dorsal groove
        if 0.22 < t < 0.9 and s > 0.2:
            m = math.sin(math.pi * (t - 0.22) / 0.68)
            out = out + N * 0.03 * m * (math.exp(-((abs(c) - 0.45) / 0.22) ** 2) - 0.35 * math.exp(-(c / 0.12) ** 2))
        # jaw muscles bulging behind the eyes, brow ridges over them
        if 0.1 < t < 0.24:
            k = math.sin(math.pi * (t - 0.1) / 0.14)
            out = out + L * math.copysign(1, c) * 0.035 * k * math.exp(-((s - 0.1) / 0.45) ** 2)
        if 0.07 < t < 0.13 and s > 0.4:
            out = out + N * 0.02 * math.exp(-((abs(c) - 0.55) / 0.15) ** 2) * math.sin(math.pi * (t - 0.07) / 0.06)
        # a low ventral keel behind the vent
        if 0.55 < t < 0.92 and s < -0.85:
            out = out - N * 0.03 * (-s - 0.85) / 0.15 * math.sin(math.pi * (t - 0.55) / 0.37)
        return out
    rings, F, S = body(P, pts, prof, "stalker_skin", "stalker_belly", segs=40, n=86, warp=sculpt, tile=0.9)
    jitter(P, 0.006, freq=1.6, seed=7)
    R.add(P, sp, power=3.0)
    J = Part("stalker_jaw")
    H = Part("stalker_head")
    Lb = 6.5
    jawed_head(R, H, J, (0, 3.27, -0.012), (0, 2.2, -0.025), 0.3, 0.18, 0.16, "stalker_skin", "stalker_belly", teeth_n=22, tooth=0.05,
               wfun=lambda t: prof_at(prof, t * 1.07 / Lb * 1.0 + 0.003)[0])
    for side in (-1, 1):
        # recessed eyes in sockets, nostrils near the snout tip
        eye(H, (side * 0.205, 2.72, 0.1), 0.03)
        tube(H, [(side * 0.17, 2.79, 0.135), (side * 0.215, 2.72, 0.14), (side * 0.2, 2.64, 0.125)], [(0, 0.012), (1, 0.008)], "stalker_skin", segs=6, n=8)
        H.sphere(0.012, at=(side * 0.05, 3.18, 0.04), mat="bio_gum", segs=8, rings=6, scale=(1, 1.6, 0.6))
    R.add(H, "sp0")
    R.add(J, "jaw")
    for idx, (y, span, chord, z) in enumerate(((1.45, 1.3, 0.62, -0.16), (-0.6, 0.85, 0.48, -0.12))):
        for side, sname in ((1, "R"), (-1, "L")):
            root = Vector((side * 0.36, y, z))
            mid = Vector((side * (0.36 + span * 0.55), y - span * 0.3, z - 0.1))
            tip = Vector((side * (0.36 + span), y - span * 0.55, z - 0.14))
            names = R.chain(f"fin{sname}{idx}_", [root, mid, tip], parent=sp[3 if idx == 0 else 5])
            Fn = Part(f"stalker_fin{sname}{idx}")
            # a thick muscular paddle with ray ridges along its trailing part
            sheet(Fn, root + Vector((0, chord * 0.5, 0)), root - Vector((0, chord * 0.5, 0)), tip + Vector((0, chord * 0.22, 0)), tip - Vector((0, chord * 0.3, 0)),
                  "stalker_fin", nu=14, nv=12, thick=0.08, camber=0.03, round_tip=0.55, normal=(0, 0, 1),
                  edge=lambda u, v: 0.006 * math.sin(u * 40) * u * v)
            tube(Fn, [root - Vector((side * 0.06, 0, 0)), root.lerp(mid, 0.45)], [(0, 0.17), (1, 0.06)], "stalker_skin", segs=14, n=8, cap0=False)
            R.add(Fn, names, power=3.0)
    C = Part("stalker_tail")
    sheet(C, (0, -2.5, 0.05), (0, -3.25, 0.0), (0, -3.1, 0.62), (0, -3.5, 0.55), "stalker_fin", nu=12, nv=10, thick=0.045, round_tip=0.5, normal=(1, 0, 0),
          edge=lambda u, v: 0.004 * math.sin(v * 50) * v)
    sheet(C, (0, -2.6, -0.02), (0, -3.25, 0.0), (0, -3.15, -0.42), (0, -3.45, -0.38), "stalker_fin", nu=12, nv=8, thick=0.045, round_tip=0.5, normal=(1, 0, 0),
          edge=lambda u, v: 0.004 * math.sin(v * 50) * v)
    R.add(C, sp[-3:], power=3.0)
    arm, ob = R.finish(subdiv=1, looks=STALKER_LOOK, tex=2048, extra=stalker_marks)
    return arm


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
            ringed(Lp, pts, 0.17, 0.09, "maw_skin", rings=6, segs=14)
            claws(Lp, pts[-1], d, 0.07, 3, 0.16, 0.03)
            R.add(Lp, names)
    arm, ob = R.finish(subdiv=1, looks=MAW_LOOK, tex=1024)
    return arm


# ================================================================================================ LUMINOUS SIREN
def build_siren():
    reset()
    R = Rig("siren")
    pts = [Vector((0, 0.5 - i * 1.0 / 8, 0.012 * math.sin(i * 0.9))) for i in range(9)]
    sp = R.chain("sp", pts)
    P = Part("siren_body")
    prof = [(0, (0.006, 0.006, 0.005, 2.2, 0)), (0.05, (0.02, 0.026, 0.02, 2.2, 0)), (0.15, (0.032, 0.044, 0.038, 2.2, 0)), (0.35, (0.031, 0.05, 0.044, 2.2, 0)),
            (0.6, (0.023, 0.036, 0.031, 2.2, 0)), (0.85, (0.011, 0.017, 0.015, 2.1, 0)), (1, (0.004, 0.006, 0.005, 2, 0))]
    rings, F, S = body(P, pts, prof, "siren_body", "siren_body", segs=28, n=60, tile=0.3)
    R.add(P, sp)
    G = Part("siren_gut")
    body(G, [Vector((0, 0.38, 0.0)), Vector((0, 0.2, -0.004)), Vector((0, -0.08, 0.0))], [(0, (0.006, 0.008, 0.008, 2, 0)), (0.4, (0.016, 0.024, 0.022, 2, 0)), (1, (0.004, 0.006, 0.006, 2, 0))],
         "siren_organs", segs=12, n=16)
    tube(G, [(0, 0.42, 0.012), (0, 0.0, 0.016), (0, -0.42, 0.008)], [(0, 0.003), (1, 0.0015)], "siren_organs", segs=6, n=20)
    R.add(G, sp[:8])
    E = Part("siren_head")
    for side in (-1, 1):
        eye(E, (side * 0.02, 0.44, 0.012), 0.011)
    for k in range(8):
        x = (k - 3.5) * 0.004
        cone(E, (x, 0.497, -0.004), (x, 0.5, -0.012), 0.0012, "bio_tooth", segs=4)
    R.add(E, "sp0")
    F_ = Part("siren_fins")
    sheet(F_, (0, 0.33, 0.046), (0, -0.28, 0.034), (0, 0.18, 0.15), (0, -0.36, 0.1), "siren_fin", nu=16, nv=7, thick=0.002, round_tip=0.15, normal=(1, 0, 0),
          edge=lambda u, v: 0.006 * math.sin(u * 34) * v)
    sheet(F_, (0, 0.08, -0.042), (0, -0.28, -0.03), (0, -0.04, -0.13), (0, -0.37, -0.09), "siren_fin", nu=12, nv=5, thick=0.002, round_tip=0.25, normal=(1, 0, 0),
          edge=lambda u, v: 0.005 * math.sin(u * 28) * v)
    R.add(F_, sp[2:8])
    T_ = Part("siren_tail")
    for sgn in (1, -1):
        sheet(T_, (0, -0.4, 0.0), (0, -0.5, 0.0), (0, -0.66, 0.22 * sgn), (0, -0.84, 0.15 * sgn), "siren_fin", nu=10, nv=8, thick=0.002, round_tip=0.35, normal=(1, 0, 0),
              edge=lambda u, v: 0.008 * math.sin(v * 14 + u * 5) * v)
    R.add(T_, sp[-3:])
    for side, sname in ((1, "R"), (-1, "L")):
        root = Vector((side * 0.03, 0.3, -0.018))
        tip = Vector((side * 0.19, 0.14, -0.07))
        names = R.chain(f"fin{sname}0_", [root, root.lerp(tip, 0.5), tip], parent=sp[1])
        Fp = Part(f"siren_pec{sname}")
        sheet(Fp, root + Vector((0, 0.03, 0)), root - Vector((0, 0.04, 0)), tip + Vector((0, 0.02, 0)), tip - Vector((0, 0.08, 0)), "siren_fin", nu=8, nv=8, thick=0.002, round_tip=0.35,
              normal=(0, 0, 1), edge=lambda u, v: 0.004 * math.sin(u * 20) * v)
        R.add(Fp, names)
    lp = [Vector((0, 0.42, 0.04)), Vector((0, 0.41, 0.13)), Vector((0, 0.48, 0.2)), Vector((0, 0.58, 0.2)), Vector((0, 0.63, 0.13))]
    names = R.chain("lure", lp, parent="sp0")
    Lu = Part("siren_lure")
    tube(Lu, lp, [(0, 0.006), (1, 0.0022)], "siren_body", segs=8, n=18)
    Lu.sphere(0.016, at=tuple(lp[-1] + Vector((0, 0.004, -0.014))), mat="siren_lure", segs=14, rings=10)
    Lu.sphere(0.021, at=tuple(lp[-1] + Vector((0, 0.004, -0.013))), mat="siren_fin", segs=14, rings=10)
    R.add(Lu, names)
    arm, ob = R.finish(subdiv=1, looks=SIREN_LOOK, tex=1024)
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
    arm, ob = R.finish(subdiv=1, looks=CHORUS_LOOK, tex=2048)
    return arm


# ================================================================================================ RIFT ARCHITECT
def build_architect():
    reset()
    R = Rig("architect")
    H0 = 0.36
    spine_pts = [Vector((0, 0.44, H0 + 0.02)), Vector((0, 0.0, H0 + 0.05)), Vector((0, -0.36, H0 + 0.02))]
    sp = R.chain("sp", spine_pts)
    C = Part("arch_carapace")
    prof = [(0, (0.05, 0.035, 0.03, 2.4, 0)), (0.06, (0.25, 0.11, 0.07, 3.2, 0.02)), (0.25, (0.45, 0.17, 0.1, 3.4, 0.03)),
            (0.55, (0.49, 0.19, 0.11, 3.4, 0.02)), (0.85, (0.35, 0.14, 0.09, 3.0, 0)), (1, (0.05, 0.05, 0.04, 2.4, 0))]

    def sculpt(t, a, p, T, L, N):
        s_, c = math.sin(a), math.cos(a)
        out = p + N * 0.045 * math.exp(-(c / 0.38) ** 2) * max(0.0, s_) * math.sin(math.pi * t)
        out = out + N * 0.02 * math.exp(-((abs(c) - 0.55) / 0.15) ** 2) * max(0.0, s_) * math.sin(math.pi * min(1, t * 1.3))
        if abs(s_) < 0.3 and 0.08 < t < 0.9:
            out = out + L * math.copysign(1, c) * 0.03 * max(0.0, math.sin(t * math.pi * 11)) ** 3 * (1 - abs(s_) / 0.3)
        return out
    rings, F, S = body(C, spine_pts, prof, "architect_plate", "architect_leg", segs=56, n=44, warp=sculpt)
    for k in range(10):
        t = 0.1 + k * 0.085
        for a in (0.12, math.pi - 0.12):
            q, nr = surf(rings, t, a)
            cone(C, q - nr * 0.01, q + nr * 0.06 + Vector((0, 0.015, 0.025)), 0.018, "arch_spine", segs=6)
    for k in range(7):
        q, nr = surf(rings, 0.2 + k * 0.09, math.pi / 2 + (0.35 if k % 2 else -0.35))
        C.sphere(0.018, at=tuple(q), mat="architect_plate", segs=8, rings=5, scale=(1, 1, 0.6))
    R.add(C, sp)
    Fc = Part("arch_face")
    for i, x in enumerate((-0.085, -0.03, 0.03, 0.085)):
        base = Vector((x, 0.43, H0 + 0.05 + (0.012 if i in (1, 2) else 0)))
        tip = base + Vector((x * 0.25, 0.035, 0.03))
        tube(Fc, [base, tip], [(0, 0.012), (1, 0.009)], "architect_leg", segs=8, n=4)
        eye(Fc, tip + Vector((0, 0.006, 0.004)), 0.013)
    for side in (-1, 1):
        pts = [Vector((side * 0.05, 0.44, H0 - 0.04)), Vector((side * 0.08, 0.52, H0 - 0.08)), Vector((side * 0.06, 0.58, H0 - 0.13))]
        segmented_limb(Fc, pts, [0.012, 0.01, 0.006], "architect_leg", flare=0.2, segs=8)
    for k in range(14):
        x = (k - 6.5) * 0.011
        tube(Fc, [(x, 0.39, H0 - 0.03), (x * 1.2, 0.43, H0 - 0.07), (x * 1.4, 0.45, H0 - 0.11)], [(0, 0.004), (1, 0.0012)], "arch_spine", segs=4, n=6)
    R.add(Fc, "sp0")
    for side in (-1, 1):
        pts = [(side * 0.06, 0.46, H0 + 0.06), (side * 0.15, 0.62, H0 + 0.25), (side * 0.3, 0.76, H0 + 0.3)]
        names = R.chain(f"ant{'R' if side > 0 else 'L'}", pts, parent="sp0")
        A = Part(f"arch_ant{side}")
        tube(A, pts, [(0, 0.006), (1, 0.0015)], "architect_leg", segs=5, n=12)
        R.add(A, names)
    for i, (t, y) in enumerate(((0.3, 0.17), (0.5, -0.02), (0.7, -0.2))):
        for side, sname in ((1, "R"), (-1, "L")):
            hip, _ = surf(rings, t, -0.35 if side > 0 else math.pi + 0.35)
            knee = Vector((side * 0.62, y + 0.02 * (1 - i), H0 + 0.2))
            ankle = Vector((side * 0.8, y - 0.04 * (i - 1), H0 * 0.42))
            foot = Vector((side * 0.88, y - 0.06 * (i - 1), 0.0))
            names = R.chain(f"leg{sname}{i}_", [hip, knee, ankle, foot], parent="sp1")
            Lp = Part(f"arch_leg{sname}{i}")
            segmented_limb(Lp, [hip, knee, ankle, foot], [0.075, 0.062, 0.042, 0.018], "architect_leg", flare=0.28, spines=3, spine_mat="arch_spine", spine_len=0.35)
            cone(Lp, foot + Vector((0, 0, 0.03)), foot + Vector((side * 0.02, 0.01, -0.005)), 0.016, "arch_spine", segs=6)
            R.add(Lp, names)
    for side, sname in ((1, "R"), (-1, "L")):
        sh, _ = surf(rings, 0.1, -0.4 if side > 0 else math.pi + 0.4)
        el = Vector((side * 0.3, 0.58, H0 + 0.04))
        wr = Vector((side * 0.27, 0.84, H0 - 0.1))
        hand = Vector((side * 0.21, 0.96, H0 - 0.2))
        names = R.chain(f"arm{sname}", [sh, el, wr, hand], parent="sp0")
        Ap = Part(f"arch_arm{sname}")
        segmented_limb(Ap, [sh, el, wr, hand], [0.042, 0.034, 0.026, 0.017], "architect_leg", flare=0.25, spines=1, spine_mat="arch_spine")
        for k in range(3):
            o = Vector(((k - 1) * 0.022, 0, 0))
            f1 = hand + o + Vector((o.x * 0.6, 0.04, -0.03))
            f2 = f1 + Vector((o.x * 0.4, 0.035, -0.035))
            segmented_limb(Ap, [hand + o * 0.5, f1, f2], [0.009, 0.007, 0.003], "architect_leg", flare=0.15, segs=6)
        R.add(Ap, names)
    arm, ob = R.finish(subdiv=1, looks=ARCH_LOOK, tex=2048)
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
                  spikes=2 if ri < 4 else 1, spike_h=0.1, sq=3.0, spike_mat="brk_spike")
    # the front shield over the head
    plate(S, (0, 1.32, H0 + 0.12), (0, 1, -0.35), (1, 0, 0), (0, 0.35, 1), 0.38, 0.62, "breaker_plate", rise=0.14, thick=0.06, nu=10, nv=6, tilt=0.05, spikes=3, spike_h=0.12, sq=3.0, spike_mat="brk_spike")
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
    arm, ob = R.finish(subdiv=1, looks=BREAKER_LOOK, tex=2048)
    return arm


# ================================================================================================ ABYSSAL CATHEDRAL
def build_cathedral():
    reset()
    R = Rig("cathedral")
    pts = [Vector((0, 7.4 - i * 14.8 / 7, 0.12 * math.sin(i * 0.5))) for i in range(8)]
    sp = R.chain("sp", pts)
    P = Part("cath_body")
    prof = [(0, (2.15, 1.05, 1.35, 2.5, 0)), (0.04, (2.45, 1.45, 1.6, 2.5, 0.02)), (0.15, (2.8, 1.75, 1.7, 2.6, 0.05)), (0.35, (3.0, 1.85, 1.6, 2.7, 0.08)),
            (0.6, (2.3, 1.4, 1.1, 2.5, 0.05)), (0.85, (0.9, 0.6, 0.5, 2.2, 0)), (1, (0.2, 0.15, 0.12, 2, 0))]

    def sculpt(t, a, p, T, L, N):
        s_, c = math.sin(a), math.cos(a)
        out = p
        # thick lips round the mouth
        if t < 0.05:
            out = out + N * 0.18 * (1 - t / 0.05) ** 2
        # cranial ridges: two arcs and a low keel over the head
        if t < 0.4 and s_ > 0.2:
            k = math.sin(math.pi * min(1.0, t / 0.4))
            out = out + N * k * (0.22 * math.exp(-((abs(c) - 0.42) / 0.09) ** 2) + 0.1 * math.exp(-(c / 0.06) ** 2))
        # gill slits behind the head, five each side, low on the flank
        if 0.32 < t < 0.42 and -0.6 < s_ < 0.2:
            out = out - N * 0.06 * max(0.0, math.sin((t - 0.32) / 0.1 * math.pi * 5)) ** 6
        return out
    rings, F, S = body(P, pts, prof, "cathedral_skin", "cathedral_skin", segs=56, n=64, cap0=False, warp=sculpt, tile=2.0)
    jitter(P, 0.04, freq=0.5, seed=5)
    R.add(P, sp, power=3.0)
    # the mouth: a dark throat lining and an arc of tall filter lamellae set back inside it
    M = Part("cath_mouth")
    inner = []
    for j in range(4):
        y = 7.25 - j * 0.6
        sc = 0.93 - j * 0.12
        inner.append([(math.cos(TAU * k / 40) * 2.1 * sc, y, (math.sin(TAU * k / 40) * (1.0 if math.sin(TAU * k / 40) > 0 else 1.3)) * 1.25 * sc) for k in range(40)])
    M.loft(inner, mat="maw_throat", cap_a=False, cap_b=True, bevel=0, flip=True)
    for k in range(44):
        a = math.pi * (k + 0.5) / 44
        x = math.cos(a) * 1.85
        zt = math.sin(a)
        h = 0.9 + zt * 1.6
        M.box((0.05, 0.55, h), at=(x, 6.55, -0.2 + zt * 0.25), rot=(0, -math.degrees(math.cos(a)) * 0.4, 0), mat="cathedral_filter", bevel=0.02)
    for k in range(20):
        x = (k - 9.5) * 0.18
        M.box((0.05, 0.5, 0.75), at=(x, 6.6, -1.05), mat="cathedral_filter", bevel=0.02)
    R.add(M, ["sp0", "sp1"])
    # wings: a thick muscular leading edge, the membrane behind it, ray ridges
    for side, sname in ((1, "R"), (-1, "L")):
        r0, _ = surf(rings, 0.22, 0.05 if side > 0 else math.pi - 0.05)
        r1, _ = surf(rings, 0.58, 0.05 if side > 0 else math.pi - 0.05)
        tip = Vector((side * 11.0, -2.8, 0.5))
        span = [r0.lerp(r1, 0.2), Vector((side * 5.2, 0.4, 0.2)), Vector((side * 8.0, -1.2, 0.35)), tip]
        names = R.chain(f"wing{sname}", span, parent=sp[2])
        Wg = Part(f"cath_wing{sname}")
        sheet(Wg, r0, r1, tip + Vector((0, 0.4, 0)), tip - Vector((0, 0.5, 0)), "cathedral_wing", nu=16, nv=16, thick=0.35, camber=0.18, round_tip=0.75,
              normal=(0, 0, 1), edge=lambda u, v: 0.05 * math.sin(u * 22) * v * u + 0.15 * math.sin(u * 5 + v * 3) * v * v)
        tube(Wg, [r0 + Vector((0, -0.2, 0)), Vector((side * 4.5, 1.2, 0.2)), Vector((side * 8.0, -0.7, 0.38)), tip + Vector((0, 0.3, 0))],
             [(0, 0.5), (0.5, 0.26), (1, 0.06)], "cathedral_wing", segs=14, n=24)
        R.add(Wg, names, power=3.0)
    # bioluminescent lines lying on the underside (counter-illumination, recognition)
    G = Part("cath_glow")
    for k in range(7):
        a = -math.pi / 2 + (k - 3) * 0.17
        surface_line(G, rings, [(0.05, a), (0.3, a * 0.98), (0.55, a), (0.72, a * 1.03)], 0.022, "cathedral_glow", lift=0.01, n=30)
    for k in range(4):
        for side in (1, -1):
            a0 = -0.35 if side > 0 else math.pi + 0.35
            surface_line(G, rings, [(0.18 + k * 0.08, a0), (0.24 + k * 0.08, a0 + side * 0.25 * -1)], 0.018, "cathedral_glow", lift=0.01, n=10)
    R.add(G, sp, power=3.0)
    E = Part("cath_eyes")
    for side in (-1, 1):
        q, nr = surf(rings, 0.1, 0.25 if side > 0 else math.pi - 0.25)
        eye(E, q - nr * 0.04, 0.15)
        tube(E, [q + nr * 0.05 + Vector((0, 0.25, 0.1)), q + nr * 0.14 + Vector((0, 0, 0.18)), q + nr * 0.05 + Vector((0, -0.25, 0.1))], [(0, 0.05), (0.5, 0.08), (1, 0.05)], "cathedral_skin", segs=8, n=10)
    R.add(E, "sp0")
    T_ = Part("cath_tail")
    for sgn in (1, -1):
        sheet(T_, (sgn * 0.12, -6.0, 0.05), (sgn * 0.12, -7.4, 0.0), (sgn * 1.8, -7.8, 0.15), (sgn * 1.5, -8.4, 0.1), "cathedral_wing", nu=8, nv=8, thick=0.12, round_tip=0.5, normal=(0, 0, 1))
    R.add(T_, sp[-2:])
    arm, ob = R.finish(subdiv=1, looks=CATH_LOOK, tex=2048)
    return arm


# ================================================================================================ GARGANTUAN CROWN
def build_crown():
    reset()
    R = Rig("crown")
    pts = [Vector((0, 5.2 - i * 10.4 / 10, 0.05 * math.sin(i * 0.6))) for i in range(11)]
    sp = R.chain("sp", pts)
    P = Part("crown_body")
    prof = [(0, (0.08, 0.06, 0.03, 2.2, 0)), (0.025, (0.55, 0.32, 0.08, 2.4, 0)), (0.08, (0.95, 0.55, 0.14, 2.6, 0)), (0.15, (1.2, 0.8, 0.24, 2.6, 0)),
            (0.21, (1.3, 0.95, 0.9, 2.4, 0)), (0.4, (1.4, 1.25, 1.2, 2.2, 0)), (0.62, (1.05, 0.95, 0.9, 2.2, 0)), (0.82, (0.5, 0.5, 0.45, 2.2, 0)),
            (0.93, (0.22, 0.25, 0.2, 2.1, 0)), (1, (0.06, 0.08, 0.06, 2, 0))]

    def sculpt(t, a, p, T, L, N):
        s_, c = math.sin(a), math.cos(a)
        out = p
        # the bony crown: two ridges swept back over the eyes, a low central keel between them
        if t < 0.26 and s_ > 0.1:
            k = math.sin(math.pi * min(1.0, t / 0.26))
            out = out + N * (0.14 * math.exp(-((abs(c) - 0.5) / 0.1) ** 2) + 0.06 * math.exp(-(c / 0.08) ** 2)) * k
        # jaw muscles bulging behind the eyes
        if 0.12 < t < 0.27:
            out = out + L * math.copysign(1, c) * 0.1 * math.sin(math.pi * (t - 0.12) / 0.15) * math.exp(-((s_ + 0.1) / 0.5) ** 2)
        # gill bars: a ridged region low on the flank behind the head
        if 0.22 < t < 0.3 and abs(s_) < 0.5:
            out = out + N * 0.025 * max(0.0, math.sin((t - 0.22) / 0.08 * math.pi * 5)) ** 2
        return out
    rings, F, S = body(P, pts, prof, "crown_skin", "crown_skin", segs=52, n=96, warp=sculpt, tile=1.4)
    jitter(P, 0.025, freq=0.9, seed=31)
    R.add(P, sp, power=3.0)
    J = Part("crown_jaw")
    H = Part("crown_head")
    Lb = 10.4
    jawed_head(R, H, J, (0, 5.17, -0.02), (0, 3.05, -0.05), 1.0, 0.4, 0.62, "crown_skin", "crown_skin", teeth_n=12, tooth=0.34, jaw_drop=0.14,
               wfun=lambda t: prof_at(prof, 0.004 + t * 2.12 / Lb)[0], n=18)
    # crown spikes growing from the ridges, curving back; the largest over the eyes
    for side in (-1, 1):
        for k in range(7):
            t = 0.04 + k * 0.03
            q, nr = surf(rings, t, 0.95 if side > 0 else math.pi - 0.95)
            big = 1.0 + 0.8 * math.exp(-((k - 4.0) / 1.5) ** 2)
            tip = q + nr * 0.42 * big + Vector((side * 0.12, -0.5 * big, 0.12))
            cone(H, q - nr * 0.05, tip, 0.11 * big, "crown_bone", segs=9, bend=Vector((side * 0.2, -1, 0.4)))
        q, nr = surf(rings, 0.13, 0.55 if side > 0 else math.pi - 0.55)
        eye(H, q - nr * 0.02, 0.07)
        # barbels hanging from the chin
        for w in range(6):
            b = Vector((side * (0.15 + w * 0.13), 4.75 - w * 0.12, -0.72))
            tube(J, [b, b + Vector((side * 0.04, -0.12, -0.35)), b + Vector((side * 0.1, -0.25, -0.75))], [(0, 0.022), (1, 0.004)], "crown_skin", segs=6, n=10)
    for k in range(5):
        q, nr = surf(rings, 0.06 + k * 0.035, math.pi / 2)
        cone(H, q - nr * 0.04, q + nr * 0.22 + Vector((0, -0.25, 0)), 0.07, "crown_bone", segs=8, bend=Vector((0, -1, 0.3)))
    R.add(H, "sp0")
    R.add(J, "jaw")
    for side, sname in ((1, "R"), (-1, "L")):
        root, _ = surf(rings, 0.3, -0.4 if side > 0 else math.pi + 0.4)
        tip = root + Vector((side * 2.6, -1.9, -0.5))
        names = R.chain(f"fin{sname}0_", [root, root.lerp(tip, 0.5), tip], parent=sp[3])
        Fp = Part(f"crown_pec{sname}")
        sheet(Fp, root + Vector((0, 0.65, 0)), root - Vector((0, 0.75, 0)), tip + Vector((0, 0.2, 0)), tip - Vector((0, 0.3, 0)), "crown_skin", nu=14, nv=12, thick=0.16,
              round_tip=0.6, normal=(0, 0, 1), camber=0.06, edge=lambda u, v: 0.02 * math.sin(u * 30) * v * u)
        R.add(Fp, names, power=3.0)
    D = Part("crown_fins")
    sheet(D, (0, 0.6, 1.25), (0, -1.6, 0.95), (0, -0.5, 2.1), (0, -1.9, 1.6), "crown_skin", nu=10, nv=8, thick=0.12, round_tip=0.6, normal=(1, 0, 0))
    R.add(D, sp[4:7])
    T_ = Part("crown_tail")
    sheet(T_, (0, -4.0, 0.1), (0, -5.1, 0.0), (0, -5.7, 2.0), (0, -6.2, 1.7), "crown_skin", nu=10, nv=10, thick=0.1, round_tip=0.4, normal=(1, 0, 0))
    sheet(T_, (0, -4.2, -0.1), (0, -5.1, 0.0), (0, -5.5, -1.3), (0, -5.9, -1.1), "crown_skin", nu=10, nv=8, thick=0.1, round_tip=0.4, normal=(1, 0, 0))
    R.add(T_, sp[-3:], power=3.0)
    arm, ob = R.finish(subdiv=1, looks=CROWN_LOOK, tex=2048)
    return arm


# ================================================================================================ MIMIC CRAWLER
def build_mimic():
    reset()
    R = Rig("mimic")
    H0 = 0.3
    spine_pts = [Vector((0, 0.2, H0 - 0.02)), Vector((0, -0.05, H0 + 0.06)), Vector((0, -0.38, H0 + 0.2)), Vector((0, -0.62, H0 + 0.26))]
    sp = R.chain("sp", spine_pts)
    P = Part("mim_body")
    prof = [(0, (0.13, 0.1, 0.12, 2.2, 0)), (0.16, (0.19, 0.15, 0.14, 2.2, 0)), (0.3, (0.17, 0.15, 0.13, 2.2, 0)),
            (0.55, (0.24, 0.25, 0.17, 2.2, 0)), (0.82, (0.2, 0.22, 0.14, 2.2, 0)), (1, (0.03, 0.04, 0.03, 2.0, 0))]

    def sculpt(t, a, p, T, L, N):
        s_, c = math.sin(a), math.cos(a)
        out = p
        if s_ > -0.2:
            b = noise.noise(p * 22.0) * 0.5 + 0.5
            out = out + N * 0.012 * max(0.0, b - 0.55) * 2.2 * (0.5 + 0.5 * t)
        if 0.08 < t < 0.26 and s_ > 0.2:
            out = out + N * 0.025 * math.exp(-((abs(c) - 0.62) / 0.16) ** 2) * math.sin(math.pi * (t - 0.08) / 0.18)
        return out
    rings, F, S = body(P, spine_pts, prof, "mimic_plate", "mimic_skin", segs=48, n=48, warp=sculpt)
    R.add(P, sp)
    E = Part("mim_eyes")
    for side in (-1, 1):
        q, nr = surf(rings, 0.17, 0.55 if side > 0 else math.pi - 0.55)
        eye(E, q + nr * 0.005, 0.042)
        tube(E, [q + nr * 0.02 + Vector((0, 0.05, 0.02)), q + nr * 0.045 + Vector((0, 0, 0.035)), q + nr * 0.02 + Vector((0, -0.05, 0.02))], [(0, 0.012), (0.5, 0.018), (1, 0.012)], "mimic_skin", segs=8, n=10)
    R.add(E, "sp0")
    W = Part("mim_web")
    web = []
    for j in range(3):
        rr = 0.14 + j * 0.12
        zz = H0 - 0.12 - j * 0.04
        ring = []
        for k in range(32):
            a = TAU * k / 32 + math.pi / 2
            ring.append((math.cos(a) * rr, 0.16 + math.sin(a) * rr * 0.9, zz + 0.04 * j * math.cos(8 * a)))
        web.append(ring)
    W.loft(web, mat="mimic_skin", cap_a=True, cap_b=False, bevel=0)
    R.add(W, ["sp0"])
    for k in range(8):
        a = math.radians(90 - 158 + k * (316 / 7))
        d = Vector((math.cos(a), math.sin(a), 0))
        base = Vector((0, 0.16, H0 - 0.12)) + d * 0.1
        pts = [base, base + d * 0.25 + Vector((0, 0, 0.07)), base + d * 0.55 + Vector((0, 0, 0.02)), base + d * 0.8 + Vector((0, 0, -0.13)),
               base + d * 0.98 + Vector((0, 0, -0.22)), base + d * 1.12 + Vector((0, 0, -0.25))]
        names = R.chain(f"arm{k}_", pts, parent="sp0")
        Ap = Part(f"mim_arm{k}")
        S_, F_ = tube(Ap, pts, [(0, 0.08), (0.35, 0.055), (1, 0.008)], "mimic_plate", segs=16, n=30, mat_under="mimic_sucker",
                      warp=lambda t, a, p, T, L, N: p + (L * math.cos(a) + N * math.sin(a)) * 0.006 * (1 - t) * (0.5 + 0.5 * math.sin(t * 60)) * (1 if math.sin(a) > 0 else 0))
        for j in range(3, 27):
            T, L, N = F_[j]
            rr = 0.08 * (1 - j / 30) + 0.01
            for sgn in (-1, 1):
                c = S_[j] - N * rr * 0.86 + L * sgn * rr * 0.38
                Ap.cyl(rr * 0.24, rr * 0.18, M=Matrix.Translation(c) @ Vector((0, 0, 1)).rotation_difference(-N).to_matrix().to_4x4(), mat="mimic_sucker", segs=10, bevel=0)
        cone(Ap, pts[-1], pts[-1] + d * 0.06 + Vector((0, 0, -0.03)), 0.008, "bio_tooth", segs=5, bend=Vector((0, 0, -1)))
        R.add(Ap, names)
    arm, ob = R.finish(subdiv=1, looks=MIMIC_LOOK, tex=2048)
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
            review(name)
        export(name)
