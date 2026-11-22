"""Jupiter: the nine species of the speculative atmospheric biosphere, after the user's 3x3 concept sheet (916.png):
ORIGINAL HYPOTHETICAL SPECIES of the game; no life is known on Jupiter. Built at the SIMULATED body scale (the
sheet's heroic scale is kept as data only), skinned and baked, exported to public/assets/creatures/jupiter/<id>.glb.

  skimmer    Stormskimmer      panel 01   14 m span    upper-air skyray: swept violet wings, cobalt vein ridges
  skyjelly   Skyjelly          panel 02   4 m          film-domed drifting colony with a fringe of filaments
  beast      Stormbeast        panel 03   26 m         serpentine storm-edge ambusher: a gaping maw, streamers
  colony     Floating Colony   panel 04   2.5 m        one module of a distributed floating consortium
  volt       Voltdrifter       panel 05   6 m          squidlike field-sensing hunter: eye cluster, tendrils
  diver      Deepdiver         panel 06   12 m         armoured wedge glider of the deeper cloud levels
  grazer     Gasgrazer         panel 07   24 m         comb-mouthed filter-feeding giant with broad vanes
  aeromite   Aeromite          panel 08   3 cm         a single swarm member (drawn instanced)
  hunter     Stormhunter       panel 09   20 m         armoured shark-dragon pursuit predator
"""
import math
import os
import random
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "lib"))
from bl import *  # noqa: E402,F403
from bio import *  # noqa: E402,F403
from skin import Look  # noqa: E402
from mathutils import noise  # noqa: E402
import bpy  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

sys.path.insert(0, os.path.dirname(__file__))
from creatures_mars import jawed_head, sheet_point  # noqa: E402

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "public", "assets", "creatures", "jupiter")


def export(name):
    export_glb(name, out_dir=OUT, images=True)


SKIM_LOOK = {
    "skimmer_body": Look("#140f24", belly="#2a2244", counter=0.3, mottle=0.35, mottle_size=0.3, spots=0.25, spot_size=0.08, spot_color="#3a2a6a",
                         rough=0.28, disp="wrinkles", amp=0.004, size=0.06, stretch=(1.0, 0.4, 1.0), groove=0.35, rim=0.2, seed=201),
    "skimmer_wing": Look("#5a38a0", belly="#7a58c4", mottle=0.3, mottle_size=0.5, spots=0.2, spot_size=0.12, spot_color="#2a1a5a", rough=0.15,
                         disp="membrane", amp=0.004, size=0.12, groove=0.3, rim=0.35, seed=202, opacity=0.62),
}
JELLY_LOOK = {
    "jelly_dome": Look("#7a5ce0", belly="#b49cf4", mottle=0.25, mottle_size=0.2, spots=0.2, spot_size=0.04, spot_color="#4a2cb0", rough=0.12,
                       disp="membrane", amp=0.003, size=0.08, groove=0.3, rim=0.4, seed=211, opacity=0.4),
    "jelly_inner": Look("#4a2c9a", mottle=0.3, mottle_size=0.08, rough=0.2, disp="wrinkles", amp=0.002, size=0.04, seed=212, opacity=0.6),
}
BEAST_LOOK = {
    "beast_skin": Look("#3a2014", belly="#5a3420", counter=0.3, mottle=0.45, mottle_size=0.8, spots=0.3, spot_size=0.3, spot_color="#1a0e08",
                       rough=0.45, rough_var=0.15, disp="ribs", amp=0.04, size=0.35, stretch=(1.0, 0.35, 1.0), groove=0.5, rim=0.25, seed=221),
    "beast_mouth": Look("#4a1410", belly="#2a0806", mottle=0.3, mottle_size=0.2, rough=0.25, disp="wrinkles", amp=0.02, size=0.15, groove=0.4, seed=222),
    "bio_gum": Look("#3a0c0a", rough=0.2, disp="pores", amp=0.01, size=0.08, seed=223),
}
COLONY_LOOK = {
    "colony_mass": Look("#5a2e14", belly="#3a1a0a", mottle=0.6, mottle_size=0.1, spots=0.5, spot_size=0.04, spot_color="#1a0c06", rough=0.85,
                        disp="sediment", amp=0.02, size=0.04, groove=0.6, rim=0.3, seed=231),
    "colony_thread": Look("#8a5a3a", mottle=0.3, mottle_size=0.05, rough=0.7, disp="smooth", amp=0.002, size=0.02, seed=232, opacity=0.8),
}
VOLT_LOOK = {
    "volt_skin": Look("#1c1e5a", belly="#3a3c8a", counter=0.25, mottle=0.35, mottle_size=0.15, spots=0.35, spot_size=0.05, spot_color="#6a4cd0",
                      rough=0.22, disp="pores", amp=0.003, size=0.025, groove=0.4, rim=0.25, seed=241),
    "volt_tendril": Look("#4a3ca0", mottle=0.3, mottle_size=0.05, rough=0.3, disp="ribs", amp=0.0015, size=0.02, stretch=(1.0, 0.3, 1.0), seed=242, opacity=0.85),
    "volt_fin": Look("#6a58d0", belly="#8a78e8", mottle=0.25, mottle_size=0.1, rough=0.15, disp="membrane", amp=0.002, size=0.05, seed=243, opacity=0.6),
}
DIVER_LOOK = {
    "diver_plate": Look("#1e1e22", belly="#2e2e34", mottle=0.4, mottle_size=0.25, spots=0.3, spot_size=0.05, spot_color="#8a8a90", rough=0.5,
                        rough_var=0.2, disp="plates", amp=0.02, size=0.18, groove=0.55, rim=0.45, seed=251),
    "diver_fin": Look("#2c2c34", mottle=0.3, mottle_size=0.3, rough=0.35, disp="ribs", amp=0.006, size=0.12, stretch=(1.0, 0.2, 1.0), seed=252, opacity=0.85),
    "diver_throat": Look("#3a3036", mottle=0.3, mottle_size=0.1, rough=0.4, disp="ribs", amp=0.01, size=0.08, groove=0.5, seed=253),
}
GRAZER_LOOK = {
    "grazer_skin": Look("#4a5866", belly="#7a5a46", counter=0.35, mottle=0.4, mottle_size=1.5, spots=0.3, spot_size=0.5, spot_color="#6a4a34",
                        rough=0.4, disp="wrinkles", amp=0.03, size=0.4, stretch=(1.0, 0.4, 1.0), groove=0.35, rim=0.15, seed=261),
    "grazer_mouth": Look("#2a1a16", mottle=0.3, mottle_size=0.3, rough=0.35, disp="ribs", amp=0.02, size=0.2, seed=262),
}
HUNTER_LOOK = {
    "hunter_plate": Look("#261212", belly="#3a1a14", counter=0.25, mottle=0.4, mottle_size=0.4, spots=0.3, spot_size=0.12, spot_color="#5a1c12",
                         rough=0.42, rough_var=0.15, disp="plates", amp=0.025, size=0.22, groove=0.55, rim=0.35, seed=271),
    "hunter_fin": Look("#4a1612", belly="#6a2418", mottle=0.35, mottle_size=0.4, rough=0.3, disp="membrane", amp=0.006, size=0.18, seed=272, opacity=0.88),
    "bio_gum": Look("#3a0c0a", rough=0.2, disp="pores", amp=0.006, size=0.05, seed=273),
}


# ================================================================================================ STORMSKIMMER
def build_skimmer():
    """a broad skyray: a slim near-black keel with a long pointed beaklike face, immense swept-back violet wing
    films stiffened by cobalt vein ridges, a narrow forked tail, a comb-lined mouth slit under the face"""
    reset()
    rnd = random.Random(3)
    R = Rig("skimmer")
    pts = [Vector((0, 4.4, 0.0)), Vector((0, 3.0, 0.05)), Vector((0, 1.4, 0.08)), Vector((0, -0.4, 0.06)), Vector((0, -2.2, 0.03)), Vector((0, -3.6, 0.0))]
    sp = R.chain("sp", pts)
    P = Part("sk_body")
    prof = [(0, (0.03, 0.02, 0.015, 2.2, 0)), (0.06, (0.18, 0.1, 0.08, 2.6, 0)), (0.18, (0.36, 0.22, 0.16, 2.8, 0)), (0.42, (0.55, 0.34, 0.24, 2.8, 0)),
            (0.7, (0.42, 0.26, 0.2, 2.6, 0)), (1, (0.06, 0.05, 0.04, 2.2, 0))]
    rings, F, S = body(P, pts, prof, "skimmer_body", "skimmer_body", segs=40, n=50)
    R.add(P, sp)
    Fc = Part("sk_face")
    for s in (-1, 1):
        for k in range(4):
            q, nr = surf(rings, 0.1 + k * 0.035, math.pi / 2 - s * 0.9)
            Fc.sphere(0.03, at=tuple(q - nr * 0.01), mat="bio_eye", segs=8, rings=5)
    # the mouth slit and its comb ridges
    q, nr = surf(rings, 0.08, -math.pi / 2)
    for k in range(16):
        x = (k - 7.5) * 0.022
        cone(Fc, q + Vector((x, 0.0, 0.01)), q + Vector((x * 1.2, -0.06, -0.06)), 0.007, "skimmer_vein", segs=4)
    R.add(Fc, "sp0")
    for side, sname in ((1, "R"), (-1, "L")):
        chains = []
        roots = [Vector((side * 0.45, 2.0 - k * 1.6, 0.0)) for k in range(3)]
        outs = [Vector((side * 5.2, -0.6, 0.15)), Vector((side * 7.0, -2.4, 0.1)), Vector((side * 4.8, -3.6, 0.0))]
        for k in range(3):
            chains += R.chain(f"w{sname}{k}_", [roots[k], roots[k].lerp(outs[k], 0.45) + Vector((0, 0, 0.12)), roots[k].lerp(outs[k], 0.8) + Vector((0, 0, 0.1)), outs[k]],
                              parent=sp[1] if k == 0 else sp[2])
        W_ = Part(f"sk_wing{sname}")
        r0, r1 = Vector((side * 0.4, 2.6, 0.0)), Vector((side * 0.3, -2.8, 0.0))
        t0, t1 = Vector((side * 7.2, -1.8, 0.15)), Vector((side * 5.0, -3.9, 0.0))
        sheet(W_, r0, r1, t0, t1, "skimmer_wing", nu=22, nv=16, thick=0.02, camber=0.12, round_tip=0.35, normal=(0, 0, 1), curl=0.1,
              edge=lambda u, v, side=side: 0.04 * math.sin(u * 18 + side) * v ** 3)
        Vn = Part(f"sk_vein{sname}")
        for u in (0.05, 0.2, 0.36, 0.52, 0.68, 0.84):
            path = [sheet_point(r0, r1, t0, t1, u + 0.03 * math.sin(v * 3), v, 0.35, 0.12, 0.1, Vector((0, 0, 1))) + Vector((0, 0, 0.018)) for v in [i / 10 * 0.95 for i in range(11)]]
            tube(Vn, path, [(0, 0.028), (1, 0.008)], "skimmer_vein", segs=6, n=14)
        R.add(W_, chains + sp[1:4], power=3.0)
        R.add(Vn, chains + sp[1:4], power=3.0)
    for s in (-1, 1):
        tp = [Vector((s * 0.05, -3.5, 0)), Vector((s * 0.3, -4.6, 0.0)), Vector((s * 0.55, -5.8, -0.05)), Vector((s * 0.7, -6.8, -0.1))]
        names = R.chain(f"tail{'R' if s > 0 else 'L'}", tp, parent="sp4")
        T = Part(f"sk_tail{s}")
        tube(T, tp, [(0, 0.12), (1, 0.02)], "skimmer_body", segs=8, n=14, flat=0.5)
        R.add(T, names)
    arm, ob = R.finish(subdiv=1, looks=SKIM_LOOK, tex=2048)
    return arm


# ================================================================================================ SKYJELLY
def build_skyjelly():
    """a domed film colony: two nested translucent umbrellas on radial ribs, a bright rim, a central nutrient
    body, and a fringe of dozens of long filaments"""
    reset()
    rnd = random.Random(5)
    R = Rig("skyjelly")
    R.chain("bell", [Vector((0, 0, 1.4)), Vector((0, 0, 0.6)), Vector((0, 0, 0.0))])
    D = Part("sj_dome")
    prof = []
    for j in range(14):
        t = j / 13
        r = 2.0 * math.sin(t * math.pi * 0.52)
        prof.append((r, 1.4 - 1.5 * (1 - math.cos(t * math.pi * 0.5)) ** 1.1))
    D.lathe(prof, at=(0, 0, 0), mat="jelly_dome", segs=48, bevel=0)
    I = Part("sj_inner")
    I.lathe([(p[0] * 0.72, p[1] * 0.82 - 0.05) for p in prof], at=(0, 0, 0), mat="jelly_inner", segs=36, bevel=0)
    I.sphere(0.42, at=(0, 0, 0.55), mat="jelly_inner", segs=20, rings=12, scale=(1, 1, 0.8))
    Rb = Part("sj_ribs")
    for k in range(16):
        a = k / 16 * TAU
        path = [Vector((math.cos(a) * p[0], math.sin(a) * p[0], p[1] + 0.02)) for p in prof[1:]]
        tube(Rb, path, [(0, 0.025), (1, 0.035)], "jelly_rim", segs=5, n=14)
    rim = [Vector((math.cos(k / 64 * TAU) * prof[-1][0], math.sin(k / 64 * TAU) * prof[-1][0], prof[-1][1])) for k in range(65)]
    tube(Rb, rim, [(0, 0.05), (1, 0.05)], "jelly_rim", segs=6, n=64)
    R.add(D, ["bell0", "bell1"])
    R.add(I, ["bell0", "bell1"])
    R.add(Rb, ["bell0", "bell1"])
    rr = prof[-1][0]
    for k in range(28):
        a = k / 28 * TAU + rnd.uniform(-0.05, 0.05)
        r0 = rr * rnd.uniform(0.86, 0.98)
        L = rnd.uniform(3.0, 6.0)
        base = Vector((math.cos(a) * r0, math.sin(a) * r0, prof[-1][1]))
        pts = [base, base + Vector((math.cos(a) * 0.1, math.sin(a) * 0.1, -L * 0.33)), base + Vector((math.cos(a) * 0.05, math.sin(a) * 0.05, -L * 0.66)), base + Vector((0, 0, -L))]
        names = R.chain(f"ten{k}_", pts, parent="bell1")
        T = Part(f"sj_ten{k}")
        tube(T, pts, [(0, 0.025), (1, 0.006)], "jelly_tentacle", segs=5, n=18)
        R.add(T, names)
    arm, ob = R.finish(subdiv=1, looks=JELLY_LOOK, tex=1024)
    return arm


# ================================================================================================ STORMBEAST
def build_beast():
    """a serpentine forebody of layered muscle ribs, an oversized gaping maw with rows of hooked teeth and throat
    folds, recessed amber-black facial pits, the tail dissolving into long streaming membranes"""
    reset()
    rnd = random.Random(7)
    R = Rig("beast")
    pts = [Vector((0, 13 - i * 20.0 / 11, 0.25 * math.sin(i * 0.6))) for i in range(12)]
    sp = R.chain("sp", pts)
    P = Part("be_body")
    prof = [(0, (0.3, 0.2, 0.12, 2.4, 0)), (0.03, (1.1, 0.5, 0.2, 2.8, 0)), (0.1, (1.6, 0.9, 0.3, 2.8, 0)), (0.16, (1.7, 1.1, 1.4, 2.4, 0)),
            (0.3, (1.6, 1.3, 1.3, 2.3, 0)), (0.55, (1.2, 1.1, 1.0, 2.3, 0)), (0.8, (0.6, 0.6, 0.5, 2.3, 0)), (1, (0.15, 0.15, 0.12, 2.2, 0))]

    def ribs(t, a, p, T, L, N):
        s_, c = math.sin(a), math.cos(a)
        return p + (L * c + N * s_) * 0.08 * max(0.0, math.sin(t * 70)) ** 2 * (0.4 + 0.6 * max(0.0, s_)) * (1 if t > 0.14 else 0)
    rings, F, S = body(P, pts, prof, "beast_skin", "beast_skin", segs=48, n=90, warp=ribs)
    J = Part("be_jaw")
    jawed_head(R, P, J, (0, 12.95, -0.05), (0, 9.8, -0.1), 1.6, 0.2, 0.9, "beast_skin", "beast_mouth", teeth_n=22, tooth=0.32,
               head_bone="sp0", jaw_drop=0.9, wfun=lambda t: 0.4 + 1.2 * t)
    R.add(P, sp)
    R.add(J, "jaw")
    Fc = Part("be_pits")
    for s in (-1, 1):
        for k in range(5):
            q, nr = surf(rings, 0.04 + k * 0.022, math.pi / 2 - s * 0.6)
            Fc.sphere(0.09, at=tuple(q - nr * 0.03), mat="beast_pit", segs=10, rings=6, scale=(1, 1, 0.5))
        # throat folds
        for k in range(5):
            q, nr = surf(rings, 0.15 + k * 0.012, -math.pi / 2 - s * 0.4)
            tube(Fc, [q + Vector((-s * 0.5, 0, 0)), q + nr * 0.06, q + Vector((s * 0.5, 0, 0))], [(0, 0.06), (1, 0.06)], "beast_skin", segs=6, n=8)
    R.add(Fc, sp[:3])
    for k in range(6):
        a = k / 6 * TAU
        o = Vector((math.cos(a) * 0.25, 0, math.sin(a) * 0.2))
        tp = [pts[-1] + o, pts[-1] + o * 2 + Vector((0, -3, 0)), pts[-1] + o * 3 + Vector((0, -6.5, -0.2)), pts[-1] + o * 3.5 + Vector((0, -10, -0.4))]
        names = R.chain(f"str{k}_", tp, parent=sp[-1])
        St = Part(f"be_str{k}")
        side = Vector((-math.sin(a), 0, math.cos(a)))
        sheet(St, tp[0] + side * 0.6, tp[0] - side * 0.6, tp[-1] + side * 0.25, tp[-1] - side * 0.25, "beast_skin", nu=5, nv=16, thick=0.04, round_tip=0.6,
              normal=side.cross(Vector((0, 1, 0))).normalized(), edge=lambda u, v, a=a: 0.2 * math.sin(v * 9 + a) * v)
        R.add(St, names)
    arm, ob = R.finish(subdiv=1, looks=BEAST_LOOK, tex=2048)
    return arm


# ================================================================================================ FLOATING COLONY (module)
def build_colony():
    """one floating module of the consortium: a ragged porous mass, ember pits of chemistry, a fuzzy branching
    outer layer, hanging threads; bulbous satellite buds"""
    reset()
    rnd = random.Random(11)
    R = Rig("colony")
    R.bone("core", (0, 0, 0), (0, 0, 0.5))
    M = Part("co_mass")
    M.sphere(1.0, at=(0, 0, 0), mat="colony_mass", segs=36, rings=20, scale=(1.25, 1.0, 0.8))
    jitter(M, 0.35, freq=1.6, seed=3)
    jitter(M, 0.1, freq=5.0, seed=8)
    for k in range(7):
        a, b = rnd.uniform(0, TAU), rnd.uniform(-0.6, 0.6)
        d = Vector((math.cos(a) * math.cos(b), math.sin(a) * math.cos(b), math.sin(b)))
        M.sphere(rnd.uniform(0.2, 0.42), at=tuple(d * 1.15), mat="colony_mass", segs=14, rings=8)
    for k in range(40):
        a, b = rnd.uniform(0, TAU), rnd.uniform(-1.2, 1.2)
        d = Vector((math.cos(a) * math.cos(b) * 1.2, math.sin(a) * math.cos(b), math.sin(b) * 0.78))
        M.sphere(rnd.uniform(0.03, 0.07), at=tuple(d * 1.0), mat="colony_ember", segs=8, rings=5)
    for k in range(60):
        a, b = rnd.uniform(0, TAU), rnd.uniform(-0.4, 1.2)
        d = Vector((math.cos(a) * math.cos(b), math.sin(a) * math.cos(b), math.sin(b))).normalized()
        base = Vector((d.x * 1.2, d.y, d.z * 0.78))
        tube(M, [base, base + d * 0.2 + Vector((rnd.uniform(-0.05, 0.05), 0, 0)), base + d * 0.32], [(0, 0.02), (1, 0.004)], "colony_thread", segs=4, n=4)
    R.add(M, "core")
    for k in range(12):
        a = rnd.uniform(0, TAU)
        r = rnd.uniform(0.2, 0.9)
        base = Vector((math.cos(a) * r, math.sin(a) * r * 0.8, -0.6))
        L = rnd.uniform(2.0, 5.0)
        tp = [base, base + Vector((0, 0, -L * 0.33)), base + Vector((0.05, 0, -L * 0.66)), base + Vector((0, 0.05, -L))]
        names = R.chain(f"th{k}_", tp, parent="core")
        T = Part(f"co_th{k}")
        tube(T, tp, [(0, 0.03), (1, 0.006)], "colony_thread", segs=4, n=12)
        R.add(T, names)
    arm, ob = R.finish(subdiv=1, looks=COLONY_LOOK, tex=1024)
    return arm


# ================================================================================================ VOLTDRIFTER
def build_volt():
    """narrow and metallic blue-purple: a hard forward beak, a cluster of large faceted eyes, electrosensory
    filament arrays round the head, a slim mantle with two pairs of sharp membrane fins, long whip tendrils
    sweeping back"""
    reset()
    R = Rig("volt")
    pts = [Vector((0, 2.6, 0)), Vector((0, 1.8, 0.02)), Vector((0, 0.8, 0.03)), Vector((0, -0.4, 0.02)), Vector((0, -1.6, 0.0))]
    sp = R.chain("sp", pts)
    P = Part("vo_body")
    prof = [(0, (0.04, 0.03, 0.03, 2.2, 0)), (0.08, (0.16, 0.14, 0.12, 2.3, 0)), (0.2, (0.3, 0.28, 0.24, 2.2, 0)), (0.3, (0.26, 0.24, 0.22, 2.2, 0)),
            (0.55, (0.3, 0.28, 0.26, 2.2, 0)), (0.85, (0.2, 0.18, 0.16, 2.2, 0)), (1, (0.04, 0.04, 0.03, 2.0, 0))]
    rings, F, S = body(P, pts, prof, "volt_skin", "volt_skin", segs=36, n=48)
    R.add(P, sp)
    H = Part("vo_head")
    cone(H, (0, 2.55, -0.02), (0, 2.85, -0.08), 0.06, "bio_tooth", segs=8)
    cone(H, (0, 2.52, -0.06), (0, 2.75, -0.16), 0.05, "bio_tooth", segs=8, bend=Vector((0, 0, 1)))
    for s in (-1, 1):
        for k, (t, a, r) in enumerate(((0.17, 0.35, 0.09), (0.21, 0.7, 0.075), (0.14, 0.9, 0.06), (0.24, 0.15, 0.06))):
            q, nr = surf(rings, t, math.pi / 2 - s * (math.pi / 2 - a))
            H.sphere(r, at=tuple(q + nr * r * 0.3), mat="volt_eye", segs=14, rings=9)
        for k in range(8):
            q, nr = surf(rings, 0.1 + k * 0.015, math.pi / 2 - s * 1.1)
            tube(H, [q, q + nr * 0.12 + Vector((0, -0.05, 0)), q + nr * 0.2 + Vector((0, -0.14, 0.02))], [(0, 0.008), (1, 0.002)], "volt_tendril", segs=4, n=5)
    R.add(H, "sp0")
    for k, (t, span, chord) in enumerate(((0.45, 1.1, 0.9), (0.72, 0.8, 0.6))):
        for side, sname in ((1, "R"), (-1, "L")):
            root, _ = surf(rings, t, 0 if side > 0 else math.pi)
            tip = root + Vector((side * span, -chord * 0.9, 0.05))
            names = R.chain(f"fin{sname}{k}_", [root, root.lerp(tip, 0.5), tip], parent=sp[2] if k == 0 else sp[3])
            Fp = Part(f"vo_fin{sname}{k}")
            sheet(Fp, root + Vector((0, chord * 0.5, 0)), root - Vector((0, chord * 0.5, 0)), tip + Vector((0, 0.05, 0)), tip - Vector((0, 0.2, 0)),
                  "volt_fin", nu=8, nv=8, thick=0.012, round_tip=0.15, normal=(0, 0, 1))
            R.add(Fp, names)
    for k in range(10):
        a = k / 10 * TAU
        base, nr = surf(rings, 0.27, a)
        L = 3.6 if k % 3 else 5.0
        tp = [base, base + nr * 0.15 + Vector((0, -L * 0.25, 0)), base + nr * 0.25 + Vector((0, -L * 0.55, 0)), base + nr * 0.3 + Vector((0, -L * 0.8, 0)),
              base + nr * 0.32 + Vector((0, -L, 0))]
        names = R.chain(f"ten{k}_", tp, parent="sp1")
        T = Part(f"vo_ten{k}")
        tube(T, tp, [(0, 0.045), (0.6, 0.02), (1, 0.005)], "volt_tendril", segs=6, n=20)
        R.add(T, names)
    arm, ob = R.finish(subdiv=1, looks=VOLT_LOOK, tex=2048)
    return arm


# ================================================================================================ DEEPDIVER
def build_diver():
    """compact and armoured: a broad wedge snout, overlapping triangular charcoal plates with pale scratched rims,
    a reinforced keel, layered rigid wing fins, segmented throat filters, red sensory pits, rear streamers"""
    reset()
    rnd = random.Random(13)
    R = Rig("diver")
    pts = [Vector((0, 6.0 - i * 12 / 7, 0)) for i in range(8)]
    sp = R.chain("sp", pts)
    P = Part("di_body")
    prof = [(0, (0.15, 0.1, 0.08, 2.6, 0)), (0.06, (0.9, 0.32, 0.2, 3.4, 0)), (0.18, (1.3, 0.62, 0.5, 3.0, 0)), (0.4, (1.25, 0.8, 0.72, 2.6, 0)),
            (0.7, (0.75, 0.55, 0.5, 2.5, 0)), (1, (0.1, 0.1, 0.08, 2.2, 0))]
    rings, F, S = body(P, pts, prof, "diver_plate", "diver_throat", segs=44, n=56)
    R.add(P, sp)
    A = Part("di_armour")
    for k in range(46):
        t = 0.08 + (k // 6) * 0.105
        a = math.pi / 2 + ((k % 6) - 2.5) * 0.32
        q, nr = surf(rings, t + rnd.uniform(-0.01, 0.01), a)
        T_ = Vector((0, -1, 0))
        L_ = nr.cross(T_).normalized()
        plate(A, q + nr * 0.02, T_, L_, nr, 0.42, 0.3, "diver_plate", rise=0.06, thick=0.05, nu=6, nv=5, tilt=0.05, sq=1.3, spikes=1, spike_h=0.12)
    # the keel
    sheet(A, (0, 4.0, -0.55), (0, -3.0, -0.6), (0, 3.0, -0.95), (0, -3.5, -0.75), "diver_plate", nu=12, nv=3, thick=0.12, round_tip=0.1, normal=(1, 0, 0))
    R.add(A, sp)
    Fc = Part("di_face")
    for s in (-1, 1):
        for k in range(4):
            q, nr = surf(rings, 0.05 + k * 0.025, math.pi / 2 - s * 0.9)
            Fc.sphere(0.06, at=tuple(q - nr * 0.02), mat="diver_pit", segs=8, rings=5, scale=(1, 1, 0.5))
    for k in range(7):
        q, nr = surf(rings, 0.12 + k * 0.02, -math.pi / 2)
        tube(Fc, [q + Vector((-0.6, 0, 0.05)), q + nr * 0.05, q + Vector((0.6, 0, 0.05))], [(0, 0.04), (1, 0.04)], "diver_throat", segs=6, n=8)
    R.add(Fc, sp[:3])
    for k, (t, span, chord, z) in enumerate(((0.3, 3.2, 2.0, 0.1), (0.42, 2.4, 1.4, -0.25))):
        for side, sname in ((1, "R"), (-1, "L")):
            root, _ = surf(rings, t, 0.1 if side > 0 else math.pi - 0.1)
            tip = root + Vector((side * span, -chord * 0.8, z))
            names = R.chain(f"fin{sname}{k}_", [root, root.lerp(tip, 0.5), tip], parent=sp[2])
            Fp = Part(f"di_fin{sname}{k}")
            sheet(Fp, root + Vector((0, chord * 0.5, 0)), root - Vector((0, chord * 0.5, 0)), tip + Vector((0, 0.1, 0)), tip - Vector((0, 0.4, 0)),
                  "diver_fin", nu=10, nv=8, thick=0.06, round_tip=0.2, normal=(0, 0, 1), edge=lambda u, v: 0.03 * math.sin(u * 14) * v)
            for r_ in range(4):
                u = (r_ + 0.5) / 4
                path = [sheet_point(root + Vector((0, chord * 0.5, 0)), root - Vector((0, chord * 0.5, 0)), tip + Vector((0, 0.1, 0)), tip - Vector((0, 0.4, 0)), u, v, 0.2, 0, 0,
                                    Vector((0, 0, 1))) + Vector((0, 0, 0.04)) for v in [i / 6 * 0.9 for i in range(7)]]
                tube(Fp, path, [(0, 0.05), (1, 0.015)], "diver_plate", segs=5, n=8)
            R.add(Fp, names)
    for k in range(3):
        o = Vector(((k - 1) * 0.25, 0, 0))
        tp = [pts[-1] + o, pts[-1] + o * 1.5 + Vector((0, -2.0, 0)), pts[-1] + o * 2 + Vector((0, -4.0, -0.1))]
        names = R.chain(f"str{k}_", tp, parent=sp[-1])
        St = Part(f"di_str{k}")
        tube(St, tp, [(0, 0.08), (1, 0.015)], "diver_fin", segs=6, n=10, flat=0.4)
        R.add(St, names)
    arm, ob = R.finish(subdiv=1, looks=DIVER_LOOK, tex=2048)
    return arm


# ================================================================================================ GASGRAZER
def build_grazer():
    """a whale-like front with a huge forward-opening vertical filter mouth: hundreds of tensioned comb strands
    across it, a heavy beaked upper lip; long flow-sensing filaments under the jaw; broad lateral vanes; a light
    tapering hindbody with a horizontal fluke"""
    reset()
    rnd = random.Random(17)
    R = Rig("grazer")
    pts = [Vector((0, 11.0 - i * 22 / 9, 0.1 * math.sin(i * 0.5))) for i in range(10)]
    sp = R.chain("sp", pts)
    P = Part("gr_body")
    prof = [(0, (1.9, 2.3, 2.1, 2.2, 0)), (0.05, (2.3, 2.6, 2.4, 2.3, 0)), (0.2, (2.4, 2.5, 2.3, 2.3, 0)), (0.45, (2.0, 2.0, 1.8, 2.3, 0)),
            (0.7, (1.2, 1.2, 1.1, 2.3, 0)), (0.9, (0.45, 0.5, 0.45, 2.3, 0)), (1, (0.12, 0.15, 0.12, 2.2, 0))]
    rings, F, S = body(P, pts, prof, "grazer_skin", "grazer_skin", segs=48, n=70, cap0=False)
    R.add(P, sp)
    M = Part("gr_mouth")
    # the throat: a dark funnel inside the open front
    fr = rings[0]
    c0 = sum(fr[:-1], Vector()) / (len(fr) - 1)
    inner = [c0 + (p - c0) * 0.94 + Vector((0, -0.4, 0)) for p in fr]
    deep = [c0 + (p - c0) * 0.35 + Vector((0, -4.0, 0)) for p in fr]
    M.loft([fr, inner, deep], mat="grazer_mouth", closed=True, cap_a=False, cap_b=True, bevel=0, flip=True)
    # the comb: vertical strands across the opening, a fibrous curtain
    for k in range(64):
        x = -1.75 + k * 3.5 / 63
        h = 2.1 * math.sqrt(max(0.0, 1 - (x / 1.9) ** 2))
        tube(M, [(x, 10.85, h * 0.95), (x + 0.02, 10.9, 0.0), (x, 10.85, -h * 0.9)], [(0, 0.022), (1, 0.022)], "grazer_comb", segs=4, n=10)
    # the beaked upper lip
    q, nr = surf(rings, 0.0, math.pi / 2)
    body(M, [q + Vector((0, 0.2, 0.15)), q + Vector((0, -1.6, 0.35)), q + Vector((0, -3.4, 0.2))], [(0, (0.9, 0.3, 0.1, 2.6, 0)), (0.5, (1.5, 0.4, 0.12, 2.8, 0)), (1, (0.6, 0.12, 0.05, 2.4, 0))],
         "grazer_skin", segs=24, n=12)
    R.add(M, sp[:2])
    for side, sname in ((1, "R"), (-1, "L")):
        root, _ = surf(rings, 0.3, 0 if side > 0 else math.pi)
        tip = root + Vector((side * 6.0, -3.0, -0.4))
        names = R.chain(f"fin{sname}0_", [root, root.lerp(tip, 0.5), tip], parent=sp[3])
        Fp = Part(f"gr_vane{sname}")
        sheet(Fp, root + Vector((0, 2.0, 0)), root - Vector((0, 2.0, 0)), tip + Vector((0, 0.6, 0)), tip - Vector((0, 1.0, 0)), "grazer_skin", nu=12, nv=10,
              thick=0.14, camber=0.3, round_tip=0.5, normal=(0, 0, 1), edge=lambda u, v: 0.08 * math.sin(u * 10) * v)
        R.add(Fp, names)
    # the fluke
    Fl = Part("gr_fluke")
    sheet(Fl, (0.3, -10.6, 0), (0.15, -11.0, 0), (3.2, -12.6, 0.1), (2.8, -13.0, 0.05), "grazer_skin", nu=8, nv=8, thick=0.1, round_tip=0.6, normal=(0, 0, 1))
    sheet(Fl, (-0.3, -10.6, 0), (-0.15, -11.0, 0), (-3.2, -12.6, 0.1), (-2.8, -13.0, 0.05), "grazer_skin", nu=8, nv=8, thick=0.1, round_tip=0.6, normal=(0, 0, 1))
    R.add(Fl, sp[-3:])
    for k in range(18):
        x = (k - 8.5) * 0.2
        base = Vector((x, 9.8 - abs(x) * 0.3, -2.0))
        L = rnd.uniform(8, 14)
        tp = [base, base + Vector((0, -L * 0.3, -0.6)), base + Vector((x * 0.2, -L * 0.65, -1.0)), base + Vector((x * 0.3, -L, -1.2))]
        names = R.chain(f"fr{k}_", tp, parent="sp1")
        T = Part(f"gr_fr{k}")
        tube(T, tp, [(0, 0.06), (1, 0.012)], "grazer_fringe", segs=5, n=14)
        R.add(T, names)
    Sn = Part("gr_sense")
    for s in (-1, 1):
        for k in range(3):
            q, nr = surf(rings, 0.08 + k * 0.03, math.pi / 2 - s * 0.7)
            Sn.sphere(0.09, at=tuple(q - nr * 0.03), mat="bio_eye", segs=10, rings=6)
    R.add(Sn, "sp1")
    arm, ob = R.finish(subdiv=1, looks=GRAZER_LOOK, tex=2048)
    return arm


# ================================================================================================ AEROMITE
def build_aeromite():
    """one swarm member, 3 cm: a slender segmented seed body, four narrow pale membranes and filaments, a bright
    reflective terminal dot; drawn instanced in its thousands"""
    reset()
    P = Part("aeromite")
    pts = [Vector((0, 0.016 - i * 0.032 / 4, 0)) for i in range(5)]
    body(P, pts, [(0, (0.0008, 0.0008, 0.0008, 2, 0)), (0.3, (0.0022, 0.0022, 0.002, 2, 0)), (0.7, (0.0016, 0.0016, 0.0015, 2, 0)), (1, (0.0005, 0.0005, 0.0005, 2, 0))],
         "aeromite", segs=10, n=12)
    P.sphere(0.0016, at=(0, -0.017, 0), mat="aeromite_glow", segs=8, rings=5)
    W_ = Part("aeromite_wings")
    for k in range(4):
        a = k / 4 * TAU + 0.4
        d = Vector((math.cos(a), 0, math.sin(a)))
        sheet(W_, Vector((0, 0.006, 0)) + d * 0.0015, Vector((0, -0.002, 0)) + d * 0.0015, Vector((0, -0.004, 0)) + d * 0.014, Vector((0, -0.01, 0)) + d * 0.012,
              "aeromite_wing", nu=3, nv=4, thick=0.0002, round_tip=0.6, normal=d.cross(Vector((0, 1, 0))).normalized())
    P.finish(sharp=60, col=0)
    W_.finish(sharp=60, col=0)


# ================================================================================================ STORMHUNTER
def build_hunter():
    """an angular shark-dragon: an armoured forehead over a long serrated hooked beak and jaw lined with backward
    teeth, dark red-black plates with jagged ridges and spines, swept fin-webs with faint copper edges, gripping
    forestructures under the throat"""
    reset()
    rnd = random.Random(23)
    R = Rig("hunter")
    pts = [Vector((0, 10 - i * 20 / 9, 0.05 * math.sin(i * 0.7))) for i in range(10)]
    sp = R.chain("sp", pts)
    P = Part("hu_body")
    prof = [(0, (0.05, 0.05, 0.03, 2.4, 0)), (0.08, (0.32, 0.22, 0.08, 2.8, 0)), (0.16, (0.7, 0.55, 0.15, 3.0, 0)), (0.2, (0.85, 0.75, 0.7, 2.6, 0)),
            (0.35, (1.05, 1.0, 0.9, 2.5, 0)), (0.55, (0.9, 0.85, 0.75, 2.5, 0)), (0.78, (0.45, 0.5, 0.4, 2.4, 0)), (1, (0.08, 0.1, 0.08, 2.2, 0))]

    def ridges(t, a, p, T, L, N):
        s_, c = math.sin(a), math.cos(a)
        out = p
        if s_ > 0.75 and t > 0.17:
            out = out + N * 0.12 * max(0.0, math.sin(t * 60)) ** 4 * (s_ - 0.75) * 4
        return out
    rings, F, S = body(P, pts, prof, "hunter_plate", "hunter_plate", segs=48, n=80, warp=ridges)
    J = Part("hu_jaw")
    jawed_head(R, P, J, (0, 9.95, -0.04), (0, 6.6, -0.05), 0.75, 0.1, 0.4, "hunter_plate", "hunter_plate", teeth_n=26, tooth=0.14,
               head_bone="sp0", wfun=lambda t: 0.06 + 0.7 * t)
    R.add(P, sp)
    R.add(J, "jaw")
    A = Part("hu_armour")
    q, nr = surf(rings, 0.19, math.pi / 2)
    plate(A, q + nr * 0.03, Vector((0, 1, 0)), Vector((1, 0, 0)), nr, 0.7, 0.6, "hunter_plate", rise=0.12, thick=0.08, nu=10, nv=6, lip=0.05, sq=1.7)
    for k in range(12):
        t = 0.22 + k * 0.045
        q, nr = surf(rings, t, math.pi / 2)
        cone(A, q, q + nr * (0.4 - k * 0.02) + Vector((0, -0.25, 0)), 0.09, "hunter_plate", segs=6)
    for s in (-1, 1):
        for k in range(3):
            q, nr = surf(rings, 0.14 + k * 0.02, math.pi / 2 - s * 0.85)
            A.sphere(0.06, at=tuple(q - nr * 0.02), mat="bio_eye", segs=8, rings=5)
        # gripping forestructures under the throat
        base, _ = surf(rings, 0.24, -math.pi / 2 - s * 0.5)
        segmented_limb(A, [base, base + Vector((s * 0.4, 0.5, -0.5)), base + Vector((s * 0.3, 1.1, -0.75))], [0.12, 0.08, 0.03], "hunter_plate", flare=0.2, segs=8)
    R.add(A, sp)
    for k, (t, span, chord, z) in enumerate(((0.33, 4.5, 2.6, 0.1), (0.62, 2.0, 1.4, 0.05))):
        for side, sname in ((1, "R"), (-1, "L")):
            root, _ = surf(rings, t, 0.15 if side > 0 else math.pi - 0.15)
            tip = root + Vector((side * span, -chord * 1.1, z))
            names = R.chain(f"fin{sname}{k}_", [root, root.lerp(tip, 0.5), tip], parent=sp[3] if k == 0 else sp[6])
            Fp = Part(f"hu_fin{sname}{k}")
            r0, r1, t0, t1 = root + Vector((0, chord * 0.5, 0)), root - Vector((0, chord * 0.5, 0)), tip + Vector((0, 0.1, 0)), tip - Vector((0, 0.5, 0))
            sheet(Fp, r0, r1, t0, t1, "hunter_fin", nu=12, nv=8, thick=0.05, round_tip=0.1, normal=(0, 0, 1), edge=lambda u, v: 0.08 * (math.sin(u * 22) ** 2) * v ** 2)
            path = [sheet_point(r0, r1, t0, t1, 0.02, v / 8, 0.1, 0, 0, Vector((0, 0, 1))) for v in range(9)]
            tube(Fp, path, [(0, 0.04), (1, 0.015)], "hunter_edge", segs=5, n=10)
            R.add(Fp, names)
    T = Part("hu_tail")
    sheet(T, (0, -8.5, 0.2), (0, -10.0, 0.1), (0, -10.4, 1.8), (0, -11.4, 1.5), "hunter_fin", nu=8, nv=8, thick=0.06, round_tip=0.3, normal=(1, 0, 0), curl=-0.2)
    sheet(T, (0, -8.5, -0.2), (0, -10.0, -0.1), (0, -10.4, -1.4), (0, -11.2, -1.2), "hunter_fin", nu=8, nv=8, thick=0.06, round_tip=0.3, normal=(1, 0, 0), curl=-0.2)
    R.add(T, sp[-3:])
    arm, ob = R.finish(subdiv=1, looks=HUNTER_LOOK, tex=2048)
    return arm


BUILD = {"skimmer": build_skimmer, "skyjelly": build_skyjelly, "beast": build_beast, "colony": build_colony, "volt": build_volt,
         "diver": build_diver, "grazer": build_grazer, "aeromite": build_aeromite, "hunter": build_hunter}

if __name__ == "__main__":
    pv = "--preview" in sys.argv
    only = [a for a in sys.argv[1:] if not a.startswith("-")]
    for name, fn in BUILD.items():
        if only and name not in only:
            continue
        fn()
        if pv:
            review(name, bg=(0.55, 0.45, 0.32))
        export(name)
