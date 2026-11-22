"""Mars: the nine species of the subsurface biosphere (ORIGINAL HYPOTHETICAL SPECIES for a fictional alternate
history of the game; no life is known on Mars). Built at adult size in metres, skinned to named rigs (blender/lib/
bio.py), skins sculpted and baked (blender/lib/skin.py), exported to public/assets/creatures/mars/<id>.glb.

  icebloom   Cryoflora sanguinea          1.6 m patch   colonial sub-ice phototroph: layered translucent lamellae
  ferric     Ferricorallium profundum     2.4 m         chemosynthetic mineral colony: branching buttressed skeleton
  ribbon     Vitreoserpens halophilus     0.45 m        transparent brine grazer: ribbon body, rippling fin edges
  prism      Crystallofaber martianus     1.0 m         benthic manipulator: six legs, two fine arms, iridescent plates
  ghost      Umbrovelum lucens            2.0 m span    membrane-winged ambush hunter of the brine reservoirs
  bmimic     Cryptolithus tenebris        2.0 m         six-limbed camouflaged cave ambusher
  hermit     Noctovagans hermeticus       0.32 m        domed surface traveller between refuges
  serpent    Fissurovenator thermalis     3.2 m         four-limbed geothermal-channel predator
  monarch    Cryopelagor rex              5.0 m         subglacial superpredator
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

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "public", "assets", "creatures", "mars")


def export(name):
    export_glb(name, out_dir=OUT, images=True)


def jawed_head(R, P, J, snout, hinge, width, top_h, jaw_h, skin, belly, teeth_n=14, tooth=0.04, gum="bio_gum",
               tooth_mat="bio_tooth", head_bone="sp0", jaw_drop=0.0, wfun=None, n=14):
    """a lower jaw (part J, bound to 'jaw') from the hinge to the snout following the head's width wfun(t) (t = 0 at
    the snout .. 1 at the hinge); palate and tongue; teeth along both jaws, hooked backward"""
    s, h = V(snout), V(hinge)
    L = (s - h).length
    fwd = (s - h).normalized()
    wf = wfun or (lambda t: width * (0.35 + 0.65 * t))
    R.bone("jaw", h, s - fwd * L * 0.1, head_bone)
    spine = [s - fwd * 0.01 + Vector((0, 0, -jaw_drop)), s.lerp(h, 0.5) + Vector((0, 0, -jaw_drop * 0.7)), h + Vector((0, 0, -jaw_drop * 0.4))]
    stations = []
    for i in range(6):
        t = i / 5
        stations.append((t, (wf(t) * 0.97, jaw_h * (0.08 + 0.12 * t), jaw_h * (0.45 + 0.6 * t ** 0.7), 2.3, -jaw_h * 0.05)))
    body(J, spine, stations, skin, belly, segs=28, n=n * 2, cap0=True, cap1=True)
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
            base = s.lerp(h, t) + Vector((side * wf(t) * 0.86, 0, 0))
            cone(P, base + Vector((0, 0, 0.004)), base + Vector((0, 0, -sz)) - fwd * sz * 0.35, sz * 0.2, tooth_mat, bend=-fwd, segs=7)
            t2 = (i + 0.8) / teeth_n
            lb = s.lerp(h, t2) + Vector((side * wf(t2) * 0.82, 0, -jaw_drop * (1 - 0.6 * t2)))
            cone(J, lb + Vector((0, 0, -0.004)), lb + Vector((0, 0, sz * 0.85)) - fwd * sz * 0.3, sz * 0.18, tooth_mat, bend=-fwd, segs=7)


def sheet_point(r0, r1, t0, t1, u, v, round_tip=0.6, camber=0.0, curl=0.0, nrm=None):
    """the point (u along the root chord, v toward the tip) of a bio.sheet patch, on its mid-surface"""
    r0, r1, t0, t1 = V(r0), V(r1), V(t0), V(t1)
    n = V(nrm).normalized() if nrm is not None else (r1 - r0).cross(t0 - r0).normalized()
    a = r0.lerp(t0, v)
    b = r1.lerp(t1, v)
    shrink = 1.0 - round_tip * (v ** 3)
    mid = a.lerp(b, 0.5)
    p = mid + (a.lerp(b, u) - mid) * shrink
    return p + n * (camber * math.sin(math.pi * u) * (1 - v * 0.5) + curl * v * v)


# ================================================================================================ skins
ICE_LOOK = {
    "icebloom_leaf": Look("#a8102c", belly="#e2476b", mottle=0.35, mottle_size=0.05, spots=0.0, spot_size=0.006, spot_color="#6e0a26", rough=0.12,
                          rough_var=0.08, disp="membrane", amp=0.0007, size=0.01, groove=0.4, rim=0.4, seed=101, opacity=0.8),
    "icebloom_base": Look("#3a0710", belly="#5a0d1c", mottle=0.4, mottle_size=0.03, spots=0.35, spot_size=0.01, spot_color="#160306", rough=0.28,
                          disp="pores", amp=0.0014, size=0.008, groove=0.45, seed=102),
    "icebloom_node": Look("#4e1026", mottle=0.3, mottle_size=0.015, rough=0.22, disp="plates", amp=0.0008, size=0.006, groove=0.4, rim=0.3, seed=103),
}
FERRIC_LOOK = {
    "ferric_coral": Look("#4a1a10", belly="#2a1410", mottle=0.55, mottle_size=0.06, spots=0.45, spot_size=0.025, spot_color="#7a4a26", rough=0.62,
                         rough_var=0.25, disp="sediment", amp=0.004, size=0.012, groove=0.55, rim=0.3, seed=111),
    "ferric_tissue": Look("#8a2418", belly="#b9442a", mottle=0.3, mottle_size=0.02, spots=0.2, spot_size=0.006, spot_color="#4a0e0a", rough=0.2,
                          disp="pores", amp=0.0012, size=0.005, groove=0.4, rim=0.25, seed=112),
    "ferric_vesicle": Look("#c26a3a", mottle=0.2, mottle_size=0.01, rough=0.15, disp="smooth", amp=0.0003, size=0.004, seed=113),
}
RIBBON_LOOK = {
    "ribbon_body": Look("#d4d0ee", belly="#ece8ff", mottle=0.15, mottle_size=0.02, spots=0.15, spot_size=0.004, spot_color="#9a90c8", rough=0.08,
                        disp="ribs", amp=0.00025, size=0.004, stretch=(1.0, 0.25, 1.0), groove=0.3, rim=0.35, seed=121, opacity=0.34),
    "ribbon_tract": Look("#6c2cc0", belly="#8c4ce0", mottle=0.3, mottle_size=0.008, rough=0.25, disp="wrinkles", amp=0.0003, size=0.004, seed=122),
    "ribbon_strand": Look("#b7aee6", mottle=0.1, rough=0.2, disp="smooth", amp=0.0001, size=0.003, seed=123, opacity=0.55),
}
PRISM_LOOK = {
    "prism_plate": Look("#3c4c7a", belly="#6a3c7c", counter=0.0, mottle=0.5, mottle_size=0.04, spots=0.35, spot_size=0.015, spot_color="#b4764a",
                        rough=0.24, rough_var=0.18, disp="plates", amp=0.0035, size=0.022, groove=0.6, rim=0.45, seed=131),
    "prism_leg": Look("#3a304e", mottle=0.35, mottle_size=0.03, spots=0.25, spot_size=0.012, spot_color="#7a5a3a", rough=0.35, disp="plates", amp=0.002,
                      size=0.014, groove=0.5, rim=0.35, seed=132),
    "prism_skin": Look("#4c3a46", mottle=0.3, mottle_size=0.02, rough=0.4, disp="wrinkles", amp=0.0015, size=0.012, groove=0.4, seed=133),
    "bio_gum": Look("#4a1c24", rough=0.25, disp="pores", amp=0.0005, size=0.004, seed=134),
}
GHOST_LOOK = {
    "ghost_wing": Look("#bfb2de", belly="#d8ccef", mottle=0.25, mottle_size=0.08, spots=0.2, spot_size=0.012, spot_color="#8a76b8", rough=0.1,
                       disp="membrane", amp=0.0012, size=0.03, groove=0.3, rim=0.4, seed=141, opacity=0.42),
    "ghost_body": Look("#5c3c7a", belly="#9a84b6", counter=0.25, mottle=0.35, mottle_size=0.04, spots=0.3, spot_size=0.01, spot_color="#2a1840", rough=0.2,
                       disp="pores", amp=0.0012, size=0.008, groove=0.35, rim=0.2, seed=142, opacity=0.86),
    "ghost_vein": Look("#e4dcf4", mottle=0.15, rough=0.18, disp="smooth", amp=0.0002, size=0.004, seed=143, opacity=0.7),
}
BMIMIC_LOOK = {
    "basalt_skin": Look("#2a2422", belly="#4a3a32", counter=0.2, mottle=0.6, mottle_size=0.05, spots=0.55, spot_size=0.03, spot_color="#8a4428",
                        rough=0.78, rough_var=0.12, disp="sediment", amp=0.0045, size=0.011, groove=0.55, rim=0.3, seed=151),
    "basalt_rust": Look("#6a3420", belly="#4a2818", mottle=0.6, mottle_size=0.04, spots=0.4, spot_size=0.02, spot_color="#2a201c", rough=0.7,
                        disp="plates", amp=0.006, size=0.03, groove=0.6, rim=0.35, seed=152),
    "bio_gum": Look("#3a1a18", rough=0.25, disp="pores", amp=0.001, size=0.008, seed=153),
}
HERMIT_LOOK = {
    "hermit_shell": Look("#8a3a22", belly="#6a2c1c", mottle=0.5, mottle_size=0.012, spots=0.5, spot_size=0.004, spot_color="#4a1e12", rough=0.88,
                         rough_var=0.08, disp="sediment", amp=0.0012, size=0.0035, groove=0.6, rim=0.4, seed=161),
    "hermit_leg": Look("#6a3424", mottle=0.35, mottle_size=0.006, rough=0.8, disp="plates", amp=0.0005, size=0.004, groove=0.5, rim=0.3, seed=162),
    "hermit_soft": Look("#4a2a26", mottle=0.3, mottle_size=0.004, rough=0.5, disp="wrinkles", amp=0.0003, size=0.003, seed=163),
}
SERPENT_LOOK = {
    "serpent_skin": Look("#1e1612", belly="#4a2a1c", counter=0.3, mottle=0.45, mottle_size=0.12, spots=0.35, spot_size=0.05, spot_color="#6a3a22",
                         rough=0.22, rough_var=0.12, disp="scales", amp=0.0025, size=0.016, stretch=(1.0, 0.7, 1.0), groove=0.45, rim=0.2, seed=171),
    "serpent_belly": Look("#7a4a30", mottle=0.25, mottle_size=0.06, rough=0.3, disp="ribs", amp=0.002, size=0.025, stretch=(1.0, 0.3, 1.0), groove=0.4, seed=172),
    "serpent_crust": Look("#8a5a30", belly="#5a3a22", mottle=0.6, mottle_size=0.02, spots=0.5, spot_size=0.012, spot_color="#3a6a5a", rough=0.75,
                          disp="sediment", amp=0.004, size=0.01, groove=0.6, rim=0.3, seed=173),
    "bio_gum": Look("#4a1814", rough=0.2, disp="pores", amp=0.001, size=0.008, seed=174),
}
MONARCH_LOOK = {
    "monarch_skin": Look("#151b24", belly="#3a4250", counter=0.4, mottle=0.35, mottle_size=0.4, spots=0.2, spot_size=0.12, spot_color="#0a0e14",
                         rough=0.3, rough_var=0.1, disp="wrinkles", amp=0.006, size=0.08, stretch=(1.0, 0.45, 1.0), groove=0.35, rim=0.12, seed=181),
    "monarch_belly": Look("#8a909a", mottle=0.2, mottle_size=0.2, rough=0.38, disp="ribs", amp=0.004, size=0.06, stretch=(1.0, 0.3, 1.0), groove=0.3, seed=182),
    "monarch_scar": Look("#bdb8a6", mottle=0.3, mottle_size=0.03, rough=0.5, disp="wrinkles", amp=0.002, size=0.015, groove=0.5, seed=183),
    "bio_gum": Look("#3a1418", rough=0.2, disp="pores", amp=0.002, size=0.02, seed=184),
}


# ================================================================================================ CRIMSON ICEBLOOM
def build_icebloom():
    """a colony of rosettes on a dark basal mat, each rosette four whorls of thin gel-supported lamellae, the outer
    ones spreading, the inner upright; protective pigmented nodules round each attachment face; capillary veins in
    the lamellae (baked membrane relief)"""
    reset()
    rnd = random.Random(7)
    R = Rig("icebloom")
    R.bone("base", (0, 0, 0), (0, 0, 0.05))
    Mat = Part("ice_mat")
    # the basal mat: an irregular flat crust the rosettes grow from
    ring = []
    for i in range(48):
        a = i / 48 * TAU
        r = 0.78 * (1 + 0.18 * math.sin(a * 3 + 1) + 0.1 * math.sin(a * 7))
        ring.append((math.cos(a) * r, math.sin(a) * r * 0.75, 0.0))
    Mat.loft([ring, [(x * 0.92, y * 0.92, 0.018) for x, y, _ in ring], [(x * 0.5, y * 0.5, 0.026) for x, y, _ in ring], [(0, 0, 0.03)] * 48],
             mat="icebloom_base", cap_a=False, cap_b=False, bevel=0)
    R.add(Mat, "base")
    centres = [((0, 0), 0.34), ((0.42, 0.18), 0.24), ((-0.38, 0.22), 0.26), ((0.18, -0.36), 0.22), ((-0.3, -0.3), 0.2), ((0.56, -0.22), 0.15), ((-0.6, -0.02), 0.14)]
    for k, ((cx, cy), r) in enumerate(centres):
        c = Vector((cx, cy, 0.02))
        names = R.chain(f"ros{k}_", [c, c + Vector((0, 0, r * 0.5)), c + Vector((0, 0, r))], parent="base")
        B = Part(f"ice_base{k}")
        B.sphere(r * 0.3, at=tuple(c + Vector((0, 0, r * 0.03))), mat="icebloom_base", segs=20, rings=10, scale=(1, 1, 0.42))
        for j in range(9):
            a = j / 9 * TAU + k
            B.sphere(r * rnd.uniform(0.035, 0.06), at=tuple(c + Vector((math.cos(a) * r * 0.36, math.sin(a) * r * 0.36, 0.006))), mat="icebloom_node", segs=10, rings=6, scale=(1, 1, 0.6))
        R.add(B, "base")
        Lf = Part(f"ice_leaf{k}")
        for w in range(3):
            n = max(4, int(round((9 - w * 1.5) * (0.62 + r))))
            L = r * (1.0 - w * 0.24)
            up = 0.16 + w * 0.36
            for i in range(n):
                a = i / n * TAU + w * 0.5 + rnd.uniform(-0.1, 0.1)
                d = Vector((math.cos(a), math.sin(a), 0))
                side = Vector((-math.sin(a), math.cos(a), 0))
                base = c + d * r * 0.08 * (1 - w * 0.25) + Vector((0, 0, r * (0.04 + w * 0.035)))
                el = up + rnd.uniform(-0.08, 0.08)
                tip = base + d * L * math.cos(el) + Vector((0, 0, L * math.sin(el)))
                wid = L * rnd.uniform(0.5, 0.64)
                nrm = side.cross(tip - base).normalized()
                if nrm.z < 0:
                    nrm = -nrm
                ph = rnd.uniform(0, TAU)
                # a broad, thin lamella: cupped, its rim ruffled in fine waves, the tip turned out
                sheet(Lf, base - side * wid * 0.16, base + side * wid * 0.16, tip - side * wid * 0.5, tip + side * wid * 0.5, "icebloom_leaf", nu=8, nv=10,
                      thick=0.002, camber=-L * 0.1, round_tip=0.92, normal=nrm, curl=L * 0.1,
                      edge=lambda u, v, L=L, ph=ph: L * 0.028 * math.sin(u * 22 + ph) * v ** 1.5 * (0.4 + 0.6 * abs(u - 0.5) * 2))
        R.add(Lf, names, power=3.0)
    arm, ob = R.finish(subdiv=0, looks=ICE_LOOK, tex=2048)
    return arm


# ================================================================================================ FERRIC CATHEDRAL
def build_ferric():
    """a mineral colony skeleton: buttressed trunks rising from a precipitate mound, branching two or three ways with
    true joints, fluted and pitted, living velvet tissue on the inner faces and combed tips, vesicles along the
    branches; the tips bound to their own bones so the colony can draw them in"""
    reset()
    rnd = random.Random(23)
    R = Rig("ferric")
    R.bone("base", (0, 0, 0), (0, 0, 0.1))
    M = Part("fer_mound")
    M.sphere(0.66, at=(0, 0, -0.2), mat="ferric_coral", segs=32, rings=14, scale=(1.25, 1.0, 0.5))
    jitter(M, 0.05, freq=3.5, seed=3)
    R.add(M, "base")
    B = Part("fer_branches")
    T = Part("fer_tips")
    tips = []

    def along(pts, f):
        """a point and direction along a polyline at fraction f"""
        L = [0.0]
        for i in range(1, len(pts)):
            L.append(L[-1] + (pts[i] - pts[i - 1]).length)
        x = f * L[-1]
        for i in range(1, len(pts)):
            if L[i] >= x:
                u = (x - L[i - 1]) / max(1e-9, L[i] - L[i - 1])
                return pts[i - 1].lerp(pts[i], u), (pts[i] - pts[i - 1]).normalized()
        return pts[-1], (pts[-1] - pts[-2]).normalized()

    def branch(p0, d, length, r0, depth):
        d = d.normalized()
        pts = [p0]
        p = p0.copy()
        for i in range(3):
            d = (d + Vector((rnd.uniform(-0.2, 0.2), rnd.uniform(-0.2, 0.2), 0.12))).normalized()
            p = p + d * length / 3
            pts.append(p.copy())
        r1 = r0 * 0.7
        # fluted, slightly flattened mineral branch
        tube(B, pts, [(0, r0), (0.85, r1 * 1.08), (1, r1)], "ferric_coral", segs=14, n=10, flat=0.8,
             warp=lambda t, a, q, T_, L_, N_: q + (L_ * math.cos(a) + N_ * math.sin(a)) * (r0 + (r1 - r0) * t) * 0.14 * math.cos(a * 5 + t * 4))
        B.sphere(r0 * 1.08, at=tuple(p0), mat="ferric_coral", segs=10, rings=6)
        # vesicles: small blisters sitting on the branch surface
        for v in range(int(length * 4)):
            q, dd = along(pts, rnd.uniform(0.15, 0.85))
            o = dd.cross(Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-1, 1)))).normalized()
            rr = r0 * 0.85
            B.sphere(r0 * rnd.uniform(0.14, 0.24), at=tuple(q + o * rr), mat="ferric_vesicle", segs=8, rings=5)
        if depth > 0:
            n = 2 if rnd.random() < 0.55 else 3
            kids = []
            for k in range(n):
                a = k / n * TAU + rnd.uniform(0, 1)
                nd = (d * 0.75 + Vector((math.cos(a), math.sin(a), 0.2)) * 0.55).normalized()
                kids.append(nd)
                branch(pts[-1], nd, length * rnd.uniform(0.66, 0.8), r1, depth - 1)
            # a thin mineral web between the first two daughter branches (the colony's fans)
            e0 = pts[-1] + kids[0] * length * 0.45
            e1 = pts[-1] + kids[1] * length * 0.45
            sheet(B, pts[-1] + kids[0] * r1, pts[-1] + kids[1] * r1, e0, e1, "ferric_coral", nu=5, nv=4, thick=r1 * 0.35, round_tip=0.5,
                  normal=(kids[0].cross(kids[1])).normalized() if kids[0].cross(kids[1]).length > 1e-3 else Vector((1, 0, 0)))
        else:
            # the living tip: velvet tissue over the growing end, combed into fine filaments
            k = len(tips)
            names = R.chain(f"tip{k}_", [pts[-1] - d * 0.02, pts[-1] + d * 0.09], parent="base")
            tips.append(names)
            Tp = Part(f"fer_tip{k}")
            Tp.sphere(r1 * 1.4, at=tuple(pts[-1] + d * 0.02), mat="ferric_tissue", segs=12, rings=7, scale=(1, 1, 1.35))
            side = d.cross(Vector((0, 0, 1)))
            if side.length < 1e-3:
                side = Vector((1, 0, 0))
            side.normalize()
            up = side.cross(d).normalized()
            for f in range(7):
                a = f / 7 * TAU
                o = (side * math.cos(a) + up * math.sin(a)) * r1 * 1.1
                tube(Tp, [pts[-1] + o + d * 0.03, pts[-1] + o * 1.6 + d * 0.07, pts[-1] + o * 1.9 + d * 0.1], [(0, r1 * 0.18), (1, r1 * 0.05)], "ferric_tissue", segs=4, n=4)
            R.add(Tp, names)
    for k in range(6):
        a = k / 6 * TAU + 0.4
        base = Vector((math.cos(a) * 0.36, math.sin(a) * 0.28, 0.06))
        d = Vector((math.cos(a) * 0.55, math.sin(a) * 0.55, 1.0))
        branch(base, d, rnd.uniform(0.42, 0.55), 0.11, 2)
        # a buttress from the trunk foot down to the mound
        sheet(B, base + Vector((0, 0, 0.3)), base + Vector((0, 0, 0.0)), base + Vector((math.cos(a) * 0.3, math.sin(a) * 0.3, 0.02)),
              base + Vector((math.cos(a) * 0.36, math.sin(a) * 0.36, -0.1)), "ferric_coral", nu=4, nv=4, thick=0.06, round_tip=0.4,
              normal=Vector((-math.sin(a), math.cos(a), 0)))
    # a central column, the oldest growth
    branch(Vector((0, 0, 0.1)), Vector((0.05, 0.02, 1)), 0.6, 0.13, 2)
    # the inner faces of the trunks carry living tissue: a velvet film round the mound's crown
    V_ = Part("fer_velvet")
    V_.sphere(0.36, at=(0, 0, 0.06), mat="ferric_tissue", segs=28, rings=12, scale=(1.2, 1.0, 0.34))
    R.add(V_, "base")
    R.add(B, "base")
    R.add(T, "base")
    arm, ob = R.finish(subdiv=0, looks=FERRIC_LOOK, tex=2048)
    return arm


# ================================================================================================ GLASS RIBBON
def build_ribbon():
    """a flat transparent ribbon: two continuous fin edges, a violet central organ tract seen through the body,
    fine transverse support strands, a narrow sensory tip and a small ventral scraping mouth"""
    reset()
    R = Rig("ribbon")
    pts = [Vector((0, 0.225 - i * 0.45 / 9, 0.0)) for i in range(10)]
    sp = R.chain("sp", pts)
    P = Part("rib_body")
    prof = [(0, (0.003, 0.002, 0.002, 2, 0)), (0.06, (0.012, 0.0035, 0.003, 2.4, 0)), (0.2, (0.024, 0.0045, 0.0042, 2.8, 0)),
            (0.55, (0.027, 0.0045, 0.0042, 2.8, 0)), (0.85, (0.018, 0.0035, 0.003, 2.6, 0)), (1, (0.004, 0.0015, 0.0015, 2, 0))]
    rings, F, S = body(P, pts, prof, "ribbon_body", "ribbon_body", segs=20, n=50, tile=0.05)
    for side in (-1, 1):
        sheet(P, (side * 0.012, 0.2, 0), (side * 0.006, -0.215, 0), (side * 0.032, 0.17, 0), (side * 0.03, -0.2, 0), "ribbon_body", nu=40, nv=5,
              thick=0.0008, round_tip=0.0, normal=(0, 0, 1), edge=lambda u, v, side=side: 0.0035 * math.sin(u * 38) * v * v)
    R.add(P, sp)
    G = Part("rib_tract")
    tube(G, [Vector((0, 0.19, 0.0005)), Vector((0, 0.0, 0.0008)), Vector((0, -0.2, 0.0004))], [(0, 0.0012), (0.3, 0.0028), (0.7, 0.0024), (1, 0.0008)],
         "ribbon_tract", segs=8, n=36, warp=lambda t, a, p, T, L, N: p + L * 0.0018 * math.sin(t * 40))
    for k in range(5):
        G.sphere(0.0026, at=(0.0015 * (-1) ** k, 0.12 - k * 0.055, 0.0009), mat="ribbon_tract", segs=8, rings=5)
    R.add(G, sp)
    St = Part("rib_strands")
    for k in range(34):
        y = 0.19 - k * 0.0115
        w = prof_w(prof, (0.225 - y) / 0.45)
        tube(St, [(-w * 0.95, y, 0.0), (0, y - 0.002, 0.0012), (w * 0.95, y, 0.0)], [(0, 0.00035), (1, 0.00035)], "ribbon_strand", segs=4, n=6)
    R.add(St, sp)
    H = Part("rib_head")
    tube(H, [(0, 0.222, 0), (0, 0.236, 0.0005), (0, 0.246, 0.0)], [(0, 0.0016), (1, 0.0005)], "ribbon_strand", segs=6, n=6)
    for s in (-1, 1):
        tube(H, [(0, 0.24, 0), (s * 0.005, 0.25, 0.001), (s * 0.009, 0.256, 0.0)], [(0, 0.0004), (1, 0.0002)], "ribbon_strand", segs=4, n=5)
    H.cyl(0.0022, 0.001, at=(0, 0.205, -0.0035), mat="ribbon_tract", segs=10, bevel=0)
    R.add(H, "sp0")
    arm, ob = R.finish(subdiv=1, looks=RIBBON_LOOK, tex=1024)
    return arm


def prof_w(prof, t):
    for i in range(len(prof) - 1):
        if prof[i][0] <= t <= prof[i + 1][0]:
            f = (t - prof[i][0]) / max(1e-6, prof[i + 1][0] - prof[i][0])
            return prof[i][1][0] * (1 - f) + prof[i + 1][1][0] * f
    return prof[-1][1][0]


# ================================================================================================ PRISM ARCHITECT
def build_prism():
    """a broad, low armoured manipulator: overlapping iridescent tergites over a soft body, a cephalic shield with a
    row of simple eyes under its rim, short tactile filaments, a narrow feeding aperture with scrapers, six stout
    sprawling legs and two fine folded arms with opposable three-digit grips"""
    reset()
    R = Rig("prism")
    H0 = 0.15
    spine_pts = [Vector((0, 0.46, H0)), Vector((0, 0.0, H0 + 0.02)), Vector((0, -0.44, H0))]
    sp = R.chain("sp", spine_pts)
    P = Part("pr_body")
    prof = [(0, (0.08, 0.03, 0.04, 2.4, 0)), (0.08, (0.26, 0.07, 0.06, 3.4, 0)), (0.3, (0.34, 0.1, 0.07, 3.6, 0)), (0.6, (0.34, 0.1, 0.07, 3.6, 0)),
            (0.88, (0.24, 0.07, 0.05, 3.2, 0)), (1, (0.06, 0.03, 0.03, 2.4, 0))]
    rings, F, S = body(P, spine_pts, prof, "prism_skin", "prism_skin", segs=48, n=40)
    R.add(P, sp)
    Pl = Part("pr_plates")
    # the tergites: eight overlapping transverse plates, each trailing edge lifted over the next
    for k in range(8):
        t = 0.2 + k * 0.088
        q, nr = surf(rings, t, math.pi / 2)
        w = prof_w(prof, t)
        plate(Pl, q + nr * 0.002, Vector((0, 1, 0.12)), Vector((1, 0, 0)), nr, 0.054, w * 1.1, "prism_plate", rise=0.028, thick=0.009, nu=16, nv=6,
              lip=0.006, tilt=0.01, sq=2.6, droop=0.085)
    # the cephalic shield, with a ridge along its rim
    q, nr = surf(rings, 0.08, math.pi / 2)
    plate(Pl, q + nr * 0.012 + Vector((0, 0.02, 0)), Vector((0, 1, 0.25)), Vector((1, 0, 0)), nr, 0.11, 0.33, "prism_plate", rise=0.05, thick=0.012,
          nu=16, nv=8, lip=0.012, sq=2.2, droop=0.05)
    # the pygidium (tail shield)
    q, nr = surf(rings, 0.93, math.pi / 2)
    plate(Pl, q + nr * 0.006, Vector((0, -1, 0.1)), Vector((1, 0, 0)), nr, 0.07, 0.22, "prism_plate", rise=0.03, thick=0.01, nu=12, nv=6, sq=2.0, droop=0.02)
    R.add(Pl, sp)
    Fc = Part("pr_face")
    for i in range(6):
        x = (i - 2.5) * 0.034
        Fc.sphere(0.011 - abs(i - 2.5) * 0.0012, at=(x, 0.5 - abs(x) * 0.25, H0 + 0.012), mat="bio_eye", segs=10, rings=6)
    # the feeding aperture: a narrow slit with scraper plates either side
    Fc.box((0.06, 0.012, 0.006), at=(0, 0.47, H0 - 0.05), mat="bio_gum", bevel=0.002)
    for s in (-1, 1):
        for k in range(3):
            cone(Fc, (s * (0.014 + k * 0.008), 0.476, H0 - 0.048), (s * (0.006 + k * 0.006), 0.492, H0 - 0.058), 0.004, "prism_leg", segs=5)
    R.add(Fc, "sp0")
    for side, sname in ((1, "R"), (-1, "L")):
        pts = [Vector((side * 0.06, 0.5, H0 - 0.01)), Vector((side * 0.12, 0.6, H0 + 0.02)), Vector((side * 0.17, 0.66, H0 + 0.0))]
        names = R.chain(f"ant{sname}", pts, parent="sp0")
        A = Part(f"pr_ant{sname}")
        tube(A, pts, [(0, 0.005), (1, 0.0012)], "prism_leg", segs=5, n=10)
        R.add(A, names)
    for i, y in enumerate((0.22, 0.0, -0.22)):
        for side, sname in ((1, "R"), (-1, "L")):
            hip = Vector((side * 0.26, y, H0 - 0.04))
            knee = Vector((side * 0.4, y + 0.04 * (1 - i), H0 + 0.05))
            ankle = Vector((side * 0.5, y + 0.06 * (1 - i), H0 * 0.45))
            foot = Vector((side * 0.55, y + 0.08 * (1 - i), 0.0))
            names = R.chain(f"leg{sname}{i}_", [hip, knee, ankle, foot], parent="sp1")
            Lp = Part(f"pr_leg{sname}{i}")
            segmented_limb(Lp, [hip, knee, ankle, foot], [0.032, 0.027, 0.02, 0.009], "prism_leg", flare=0.3, spines=2, spine_mat="prism_leg", spine_len=0.2)
            R.add(Lp, names)
    for side, sname in ((1, "R"), (-1, "L")):
        sh = Vector((side * 0.13, 0.4, H0 - 0.05))
        el = Vector((side * 0.25, 0.52, H0 + 0.0))
        wr = Vector((side * 0.17, 0.64, H0 - 0.03))
        hand = Vector((side * 0.11, 0.71, H0 - 0.06))
        names = R.chain(f"arm{sname}", [sh, el, wr, hand], parent="sp0")
        Ap = Part(f"pr_arm{sname}")
        segmented_limb(Ap, [sh, el, wr, hand], [0.022, 0.018, 0.014, 0.01], "prism_leg", flare=0.25)
        # two fingers and an opposable thumb
        for k, o in enumerate((Vector((0.012, 0.02, -0.006)), Vector((-0.008, 0.024, -0.004)), Vector((-side * 0.016, 0.004, 0.008)))):
            f1 = hand + o * 1.4
            f2 = f1 + o.normalized() * 0.022 + Vector((0, 0.008, -0.01))
            segmented_limb(Ap, [hand, f1, f2], [0.006, 0.0045, 0.002], "prism_leg", flare=0.15, segs=6)
        R.add(Ap, names)
    arm, ob = R.finish(subdiv=1, looks=PRISM_LOOK, tex=2048)
    return arm


# ================================================================================================ GHOST OF VALLES
def build_ghost():
    """a flattened visceral body inside broad translucent wings with asymmetric branching venation; recessed eyes,
    a field of pressure-receptor pits, a small underside clasping mouth, trailing sensory filaments"""
    reset()
    rnd = random.Random(41)
    R = Rig("ghost")
    pts = [Vector((0, 0.56, 0.0)), Vector((0, 0.3, 0.01)), Vector((0, 0.02, 0.012)), Vector((0, -0.26, 0.008)), Vector((0, -0.52, 0.0))]
    sp = R.chain("sp", pts)
    P = Part("gh_body")
    prof = [(0, (0.04, 0.02, 0.016, 2.2, 0)), (0.12, (0.11, 0.045, 0.035, 2.6, 0)), (0.4, (0.15, 0.06, 0.045, 2.8, 0)), (0.75, (0.1, 0.045, 0.035, 2.6, 0)),
            (1, (0.02, 0.012, 0.01, 2.2, 0))]
    rings, F, S = body(P, pts, prof, "ghost_body", "ghost_body", segs=36, n=40)
    R.add(P, sp)
    # receptor pits and recessed eyes
    E = Part("gh_sense")
    for k in range(26):
        t, a = rnd.uniform(0.15, 0.8), rnd.uniform(0.6, math.pi - 0.6)
        q, nr = surf(rings, t, a)
        E.sphere(0.006, at=tuple(q - nr * 0.002), mat="bio_eye", segs=6, rings=4, scale=(1, 1, 0.4))
    for s in (-1, 1):
        q, nr = surf(rings, 0.1, math.pi / 2 - s * 0.5)
        eye(E, q - nr * 0.004, 0.012)
    # the clasping mouth underneath, with two small hooks
    q, nr = surf(rings, 0.18, -math.pi / 2)
    E.cyl(0.018, 0.006, M=Matrix.Translation(q) @ Vector((0, 0, 1)).rotation_difference(nr).to_matrix().to_4x4(), mat="bio_eye", segs=14, bevel=0)
    for s in (-1, 1):
        cone(E, q + Vector((s * 0.02, 0.01, 0.004)), q + Vector((s * 0.012, 0.045, -0.02)), 0.005, "ghost_vein", bend=Vector((0, 0, 1)))
    R.add(E, sp)
    # the wings: one membrane each side on four vein bones (front to back) so a wave can run along it
    for side, sname in ((1, "R"), (-1, "L")):
        chains = []
        roots = [Vector((side * 0.13, 0.36 - k * 0.24, 0.0)) for k in range(4)]
        outs = [Vector((side * 0.92, 0.2, 0.02)), Vector((side * 1.0, -0.02, 0.02)), Vector((side * 0.94, -0.26, 0.01)), Vector((side * 0.72, -0.46, 0.0))]
        for k in range(4):
            a, b = roots[k], outs[k]
            chains += R.chain(f"w{sname}{k}_", [a, a.lerp(b, 0.4) + Vector((0, 0, 0.02)), a.lerp(b, 0.75) + Vector((0, 0, 0.015)), b], parent="sp1" if k < 2 else "sp2")
        W_ = Part(f"gh_wing{sname}")
        r0, r1 = Vector((side * 0.11, 0.5, 0.0)), Vector((side * 0.09, -0.48, 0.0))
        t0, t1 = Vector((side * 1.0, 0.16, 0.02)), Vector((side * 0.84, -0.4, 0.0))
        nrm = Vector((0, 0, 1))
        sheet(W_, r0, r1, t0, t1, "ghost_wing", nu=28, nv=16, thick=0.004, camber=0.03, round_tip=0.55, normal=nrm, curl=-0.03,
              edge=lambda u, v: 0.02 * math.sin(u * 22 + 1.3 * side) * v ** 3)
        # branching veins: radial main veins that fork two or three times toward the margin (never symmetric)
        Vn = Part(f"gh_vein{sname}")

        def vein(u, v0, v1, du, r, depth):
            path = []
            for i in range(9):
                v = v0 + (v1 - v0) * i / 8
                uu = min(0.98, max(0.02, u + du * (v - v0) + 0.01 * math.sin(v * 9 + u * 7)))
                path.append(sheet_point(r0, r1, t0, t1, uu, v, 0.55, 0.03, -0.03, nrm) + nrm * 0.004)
            tube(Vn, path, [(0, r), (1, r * 0.55)], "ghost_vein", segs=5, n=12)
            if depth > 0:
                um = u + du * (v1 - v0)
                for f in (-1, 1):
                    vein(um, v1, min(0.98, v1 + rnd.uniform(0.18, 0.3)), du + f * rnd.uniform(0.04, 0.12), r * 0.6, depth - 1)
        for k, u in enumerate((0.06, 0.24, 0.42, 0.6, 0.8, 0.94)):
            vein(u, 0.0, rnd.uniform(0.3, 0.45), rnd.uniform(-0.05, 0.05), 0.006, 2 if k % 2 == 0 else 1)
        R.add(W_, chains + sp[1:3], power=3.0)
        R.add(Vn, chains + sp[1:3], power=3.0)
        # sensory tips trailing from the wing margin
        for k in range(2):
            b = outs[1 + k * 2]
            tp = [b, b + Vector((side * 0.08, -0.14, 0)), b + Vector((side * 0.1, -0.32, -0.01))]
            names = R.chain(f"tp{sname}{k}_", tp, parent=f"w{sname}{1 + k * 2}_2")
            Tp = Part(f"gh_tip{sname}{k}")
            tube(Tp, tp, [(0, 0.004), (1, 0.001)], "ghost_vein", segs=5, n=10)
            R.add(Tp, names)
    tail = [Vector((0, -0.52, 0)), Vector((0, -0.8, 0.0)), Vector((0, -1.1, -0.01)), Vector((0, -1.4, -0.02))]
    for s in (-1, 1):
        tp = [p + Vector((s * 0.012 * (i + 1), 0, 0)) for i, p in enumerate(tail)]
        names = R.chain(f"tail{'R' if s > 0 else 'L'}", tp, parent="sp3")
        Tl = Part(f"gh_tail{s}")
        tube(Tl, tp, [(0, 0.006), (1, 0.0012)], "ghost_vein", segs=5, n=16)
        R.add(Tl, names)
    arm, ob = R.finish(subdiv=1, looks=GHOST_LOOK, tex=2048)
    return arm


# ================================================================================================ BASALT MIMIC
def build_bmimic():
    """squat and six-limbed, a triangular rock-flat head set into the dorsal armour, irregular mineralised shields
    over granular near-black skin with rust mottling, small amber eyes recessed under the brow, sensing lines along
    the flanks, short hooking digits and a stiff tail base"""
    reset()
    rnd = random.Random(53)
    R = Rig("bmimic")
    H0 = 0.24
    pts = [Vector((0, 1.0, H0 - 0.02)), Vector((0, 0.72, H0)), Vector((0, 0.42, H0 + 0.02)), Vector((0, 0.1, H0 + 0.03)), Vector((0, -0.22, H0 + 0.02)),
           Vector((0, -0.5, H0 - 0.01)), Vector((0, -0.75, H0 - 0.05)), Vector((0, -1.0, H0 - 0.09))]
    sp = R.chain("sp", pts)
    P = Part("bm_body")
    prof = [(0, (0.05, 0.02, 0.015, 2.6, 0)), (0.05, (0.16, 0.045, 0.02, 3.0, 0)), (0.14, (0.27, 0.07, 0.03, 3.2, 0)),
            (0.2, (0.3, 0.09, 0.12, 2.8, 0)), (0.27, (0.29, 0.11, 0.13, 2.6, 0)),          # neck
            (0.45, (0.42, 0.17, 0.15, 2.8, 0)), (0.6, (0.4, 0.16, 0.14, 2.8, 0)), (0.74, (0.24, 0.11, 0.09, 2.6, 0)), (1, (0.03, 0.03, 0.025, 2.2, 0))]

    def sculpt(t, a, p, T, L, N):
        s_, c = math.sin(a), math.cos(a)
        out = p
        # granular skin and the sensing lines (grooves) along each flank
        g = noise.noise(p * 30.0) * 0.5 + 0.5
        out = out + N * 0.006 * max(0.0, g - 0.45)
        if 0.25 < t < 0.8:
            out = out - (L * c + N * s_) * 0.006 * math.exp(-((s_ - 0.1) / 0.06) ** 2)
        # the brow ridge over the eyes
        if 0.1 < t < 0.2 and s_ > 0.3:
            out = out + N * 0.02 * math.exp(-((abs(c) - 0.5) / 0.15) ** 2)
        return out
    rings, F, S = body(P, pts, prof, "basalt_skin", "basalt_skin", segs=56, n=60, warp=sculpt)
    J = Part("bm_jaw")
    head_w = lambda t: 0.05 + 0.24 * t
    jawed_head(R, P, J, (0, 0.99, H0 - 0.03), (0, 0.78, H0 - 0.02), 0.27, 0.05, 0.06, "basalt_skin", "basalt_skin", teeth_n=10, tooth=0.022,
               head_bone="sp0", wfun=head_w)
    R.add(P, sp)
    R.add(J, "jaw")
    Sh = Part("bm_shields")
    # the head's triangular dorsal plate (behind the snout, over the brow), then irregular shields down the back
    q, nr = surf(rings, 0.15, math.pi / 2)
    plate(Sh, q + nr * 0.004, Vector((0, 1, 0)), Vector((1, 0, 0)), nr, 0.075, 0.13, "basalt_skin", rise=0.018, thick=0.012, nu=10, nv=6, sq=1.5, droop=0.03)
    for k in range(56):
        t = rnd.uniform(0.24, 0.88)
        a = math.pi / 2 + rnd.uniform(-1.15, 1.15)
        q, nr = surf(rings, t, a)
        sz = rnd.uniform(0.05, 0.1) * (1 - abs(a - math.pi / 2) * 0.35) * (1 - max(0.0, t - 0.7) * 1.5)
        T_ = Vector((rnd.uniform(-0.3, 0.3), 1, 0)).normalized()
        L_ = nr.cross(T_).normalized()
        T_ = L_.cross(nr).normalized()
        plate(Sh, q + nr * 0.002, T_, L_, nr, sz, sz * rnd.uniform(0.7, 1.15), "basalt_rust" if k % 3 == 0 else "basalt_skin", rise=sz * 0.22, thick=0.012,
              nu=6, nv=5, tilt=0.008, sq=rnd.uniform(1.5, 2.4), droop=sz * 0.25)
    R.add(Sh, sp)
    E = Part("bm_eyes")
    for s in (-1, 1):
        q, nr = surf(rings, 0.13, math.pi / 2 - s * 0.62)
        E.sphere(0.016, at=tuple(q - nr * 0.006), mat="basalt_eye", segs=12, rings=8)
    R.add(E, "sp0")
    for i, (t, spread) in enumerate(((0.3, 0.1), (0.46, 0.0), (0.62, -0.1))):
        for side, sname in ((1, "R"), (-1, "L")):
            hip, _ = surf(rings, t, -0.2 if side > 0 else math.pi + 0.2)
            y = hip.y
            knee = Vector((side * 0.55, y + spread * 0.5, H0 + 0.08))
            ankle = Vector((side * 0.66, y + spread, H0 * 0.35))
            foot = Vector((side * 0.72, y + spread * 1.4, 0.0))
            names = R.chain(f"leg{sname}{i}_", [hip, knee, ankle, foot], parent="sp3" if i < 2 else "sp4")
            Lp = Part(f"bm_leg{sname}{i}")
            tube(Lp, [hip, hip.lerp(knee, 0.5) + Vector((0, 0, 0.03)), knee], [(0, 0.09), (1, 0.055)], "basalt_skin", segs=14, n=10)
            tube(Lp, [knee, knee.lerp(ankle, 0.5), ankle], [(0, 0.055), (1, 0.04)], "basalt_skin", segs=12, n=10)
            tube(Lp, [ankle, foot + Vector((0, 0, 0.03))], [(0, 0.04), (1, 0.035)], "basalt_skin", segs=12, n=6)
            Lp.sphere(0.06, at=tuple(knee), mat="basalt_skin", segs=12, rings=8)
            plate(Lp, knee + Vector((0, 0, 0.04)), Vector((0, 1, 0)), Vector((1, 0, 0)), Vector((side * 0.3, 0, 1)), 0.05, 0.05, "basalt_rust", rise=0.012, thick=0.008, nu=5, nv=4)
            claws(Lp, foot + Vector((0, 0.02, 0.025)), Vector((side * 0.3, 1, -0.2)), 0.025, 4, 0.045, 0.008, mat="bio_tooth")
            R.add(Lp, names)
    arm, ob = R.finish(subdiv=1, looks=BMIMIC_LOOK, tex=2048)
    return arm


# ================================================================================================ RED DUNE HERMIT
def build_hermit():
    """a low domed shell of nested pitted plates over a sealed body, six squat pointed legs under its rim,
    retractable mouthparts and palps, recessed receptor pits"""
    reset()
    R = Rig("hermit")
    H0 = 0.05
    pts = [Vector((0, 0.15, H0)), Vector((0, 0.0, H0 + 0.004)), Vector((0, -0.15, H0))]
    sp = R.chain("sp", pts)
    P = Part("he_body")
    prof = [(0, (0.05, 0.03, 0.02, 2.2, 0)), (0.15, (0.12, 0.08, 0.035, 2.4, 0)), (0.5, (0.15, 0.1, 0.04, 2.4, 0)), (0.85, (0.12, 0.08, 0.03, 2.4, 0)),
            (1, (0.04, 0.03, 0.015, 2.2, 0))]
    rings, F, S = body(P, pts, prof, "hermit_shell", "hermit_soft", segs=40, n=32)
    R.add(P, sp)
    Pl = Part("he_plates")
    for k in range(7):
        t = 0.12 + k * 0.12
        q, nr = surf(rings, t, math.pi / 2)
        w = prof_w(prof, t)
        plate(Pl, q + nr * 0.002, Vector((0, 1, 0)), Vector((1, 0, 0)), nr, 0.026, w * 1.08, "hermit_shell", rise=0.022, thick=0.005, nu=14, nv=5,
              lip=0.003, tilt=0.004, sq=2.4, droop=w * 0.55)
    R.add(Pl, sp)
    Fc = Part("he_face")
    for s in (-1, 1):
        for k in range(2):
            Fc.sphere(0.005, at=(s * (0.018 + k * 0.018), 0.15 - k * 0.006, H0 + 0.012), mat="bio_eye", segs=8, rings=5, scale=(1, 1, 0.5))
    R.add(Fc, "sp0")
    mp = [Vector((0, 0.15, H0 - 0.015)), Vector((0, 0.18, H0 - 0.02)), Vector((0, 0.2, H0 - 0.03))]
    names = R.chain("mouth", mp, parent="sp0")
    M = Part("he_mouth")
    tube(M, mp, [(0, 0.012), (1, 0.005)], "hermit_soft", segs=8, n=6)
    for s in (-1, 1):
        tube(M, [mp[1] + Vector((s * 0.008, 0, 0)), mp[2] + Vector((s * 0.02, 0.008, -0.004))], [(0, 0.0035), (1, 0.0012)], "hermit_leg", segs=5, n=5)
    R.add(M, names)
    for i, y in enumerate((0.07, 0.0, -0.07)):
        for side, sname in ((1, "R"), (-1, "L")):
            hip = Vector((side * 0.1, y, H0 - 0.01))
            knee = Vector((side * 0.16, y + 0.01 * (1 - i), H0 + 0.025))
            foot = Vector((side * 0.2, y + 0.02 * (1 - i), 0.0))
            names = R.chain(f"leg{sname}{i}_", [hip, knee, foot], parent="sp1")
            Lp = Part(f"he_leg{sname}{i}")
            segmented_limb(Lp, [hip, knee, foot], [0.016, 0.012, 0.004], "hermit_leg", flare=0.25, segs=8)
            R.add(Lp, names)
    arm, ob = R.finish(subdiv=1, looks=HERMIT_LOOK, tex=1024)
    return arm


# ================================================================================================ THERMAL RIFT SERPENT
def build_serpent():
    """long and wet, a broad low head with whiskers and thermosensory pores, four short powerful clawed limbs, a
    laterally flattened swimming tail with fin crests, mineral-encrusted patches along the back"""
    reset()
    rnd = random.Random(67)
    R = Rig("serpent")
    pts = [Vector((0, 1.6 - i * 3.2 / 11, 0.0)) for i in range(12)]
    sp = R.chain("sp", pts)
    P = Part("se_body")
    prof = [(0, (0.03, 0.02, 0.012, 2.4, 0)), (0.025, (0.11, 0.045, 0.02, 2.8, 0)), (0.07, (0.19, 0.07, 0.03, 3.0, 0)),
            (0.1, (0.2, 0.09, 0.1, 2.6, 0)), (0.14, (0.16, 0.1, 0.1, 2.4, 0)),       # jaw hinge, neck
            (0.3, (0.21, 0.16, 0.15, 2.4, 0)), (0.5, (0.2, 0.16, 0.15, 2.4, 0)), (0.62, (0.14, 0.15, 0.13, 2.4, 0)),
            (0.8, (0.06, 0.13, 0.11, 2.6, 0)), (1, (0.012, 0.03, 0.025, 2.4, 0))]

    def sculpt(t, a, p, T, L, N):
        s_, c = math.sin(a), math.cos(a)
        out = p
        # muscle bands down the flanks of the trunk and tail
        if 0.15 < t < 0.95:
            out = out + (L * c + N * s_) * 0.006 * max(0.0, math.sin(t * 90)) ** 2 * (1 - abs(s_))
        return out
    rings, F, S = body(P, pts, prof, "serpent_skin", "serpent_belly", segs=48, n=80, warp=sculpt)
    J = Part("se_jaw")
    jawed_head(R, P, J, (0, 1.595, -0.012), (0, 1.29, -0.01), 0.2, 0.04, 0.07, "serpent_skin", "serpent_belly", teeth_n=16, tooth=0.022,
               head_bone="sp0", wfun=lambda t: 0.05 + 0.15 * t)
    R.add(P, sp)
    R.add(J, "jaw")
    # tail fin crests (dorsal and ventral) along the flattened tail
    Fn = Part("se_fins")
    sheet(Fn, (0, -0.4, 0.15), (0, -1.58, 0.03), (0, -0.55, 0.24), (0, -1.6, 0.07), "serpent_skin", nu=24, nv=4, thick=0.012, round_tip=0.0,
          normal=(1, 0, 0), edge=lambda u, v: 0.004 * math.sin(u * 30) * v)
    sheet(Fn, (0, -0.7, -0.12), (0, -1.58, -0.025), (0, -0.8, -0.19), (0, -1.6, -0.055), "serpent_skin", nu=18, nv=4, thick=0.01, round_tip=0.0,
          normal=(1, 0, 0))
    R.add(Fn, sp[5:])
    Cr = Part("se_crust")
    for k in range(22):
        t = rnd.uniform(0.2, 0.7)
        q, nr = surf(rings, t, math.pi / 2 + rnd.uniform(-0.6, 0.6))
        sz = rnd.uniform(0.02, 0.045)
        L_ = nr.cross(Vector((0, 1, 0))).normalized()
        plate(Cr, q + nr * 0.002, Vector((0, 1, 0)), L_, nr, sz, sz * 0.8, "serpent_crust", rise=sz * 0.35, thick=0.006, nu=5, nv=4, sq=1.7)
    R.add(Cr, sp)
    Hd = Part("se_head")
    for s in (-1, 1):
        q, nr = surf(rings, 0.06, math.pi / 2 - s * 0.7)
        eye(Hd, q - nr * 0.003, 0.012)
        for k in range(7):
            q, nr = surf(rings, 0.015 + k * 0.008, math.pi / 2 - s * 0.35)
            Hd.sphere(0.005, at=tuple(q - nr * 0.002), mat="bio_eye", segs=6, rings=4, scale=(1, 1, 0.5))
        for k in range(6):
            base = Vector((s * (0.07 + k * 0.012), 1.5 - k * 0.025, -0.03))
            tube(Hd, [base, base + Vector((s * 0.05, -0.02, -0.02)), base + Vector((s * 0.1, -0.06, -0.03))], [(0, 0.004), (1, 0.0008)], "serpent_belly", segs=4, n=6)
    R.add(Hd, "sp0")
    for i, t in enumerate((0.28, 0.58)):
        for side, sname in ((1, "R"), (-1, "L")):
            hip, _ = surf(rings, t, -0.5 if side > 0 else math.pi + 0.5)
            y = hip.y
            elbow = Vector((side * 0.34, y - 0.08, -0.06))
            wrist = Vector((side * 0.4, y - 0.02, -0.17))
            foot = Vector((side * 0.44, y + 0.06, -0.2))
            names = R.chain(f"leg{sname}{i}_", [hip, elbow, wrist, foot], parent=sp[3] if i == 0 else sp[6])
            Lp = Part(f"se_leg{sname}{i}")
            tube(Lp, [hip, hip.lerp(elbow, 0.5), elbow], [(0, 0.075), (1, 0.05)], "serpent_skin", segs=12, n=8)
            tube(Lp, [elbow, wrist], [(0, 0.05), (1, 0.035)], "serpent_skin", segs=12, n=6, mat_under="serpent_belly")
            Lp.sphere(0.05, at=tuple(elbow), mat="serpent_skin", segs=12, rings=8)
            Lp.sphere(0.04, at=tuple(wrist), mat="serpent_skin", segs=10, rings=6, scale=(1.3, 1.4, 0.6))
            claws(Lp, wrist + Vector((0, 0.03, -0.01)), Vector((side * 0.2, 1, -0.3)), 0.022, 4, 0.05, 0.007)
            R.add(Lp, names)
    arm, ob = R.finish(subdiv=1, looks=SERPENT_LOOK, tex=2048)
    return arm


# ================================================================================================ SUBGLACIAL MONARCH
def monarch_marks(p, n, mat):
    """gill channels behind the head and pitted old injuries"""
    dh, dark = 0.0, 0.0
    if mat == "monarch_skin" or mat == "monarch_belly":
        if 1.05 < p.y < 1.55 and abs(p.x) > 0.25:
            ph = (p.y - 1.05) / 0.5 * 4
            g = math.exp(-((ph - round(ph)) / 0.08) ** 2) * (1 if -0.25 < p.z < 0.25 else 0)
            dh -= 0.012 * g
            dark += 0.5 * g
        pit = noise.noise(p * 6.0 + Vector((3, 1, 2)))
        if pit > 0.62 and p.z > 0:
            dh -= 0.01 * (pit - 0.62) * 6
            dark += 0.3
    return dh, min(1.0, dark)


def build_monarch():
    """a massive streamlined body, broad low skull with small dark eyes and large grasping jaws, big lateral
    stabiliser fins, a heavy lunate tail; pale underside, ivory scars on the back, gill channels, pitted injuries"""
    reset()
    rnd = random.Random(79)
    R = Rig("monarch")
    pts = [Vector((0, 2.5 - i * 5.0 / 11, 0.03 * math.sin(i * 0.5))) for i in range(12)]
    sp = R.chain("sp", pts)
    P = Part("mo_body")
    prof = [(0, (0.08, 0.05, 0.03, 2.4, 0)), (0.03, (0.3, 0.12, 0.05, 3.0, 0)), (0.09, (0.5, 0.22, 0.08, 3.2, 0)),
            (0.15, (0.56, 0.3, 0.32, 2.6, 0)), (0.22, (0.58, 0.38, 0.4, 2.4, 0)),     # jaw hinge, throat
            (0.4, (0.62, 0.56, 0.5, 2.3, 0)), (0.58, (0.52, 0.5, 0.44, 2.3, 0)), (0.76, (0.3, 0.32, 0.28, 2.3, 0)),
            (0.9, (0.14, 0.2, 0.17, 2.4, 0)), (1, (0.06, 0.12, 0.1, 2.4, 0))]
    rings, F, S = body(P, pts, prof, "monarch_skin", "monarch_belly", segs=56, n=80)
    J = Part("mo_jaw")
    jawed_head(R, P, J, (0, 2.49, -0.02), (0, 1.75, -0.03), 0.55, 0.06, 0.2, "monarch_skin", "monarch_belly", teeth_n=18, tooth=0.08,
               head_bone="sp0", wfun=lambda t: 0.18 + 0.38 * t)
    R.add(P, sp)
    R.add(J, "jaw")
    Sc = Part("mo_scars")
    for k in range(9):
        t0 = rnd.uniform(0.25, 0.7)
        a0 = math.pi / 2 + rnd.uniform(-0.7, 0.7)
        path = [(t0 + i * rnd.uniform(0.01, 0.025), a0 + rnd.uniform(-0.15, 0.15)) for i in range(4)]
        surface_line(Sc, rings, path, rnd.uniform(0.006, 0.012), "monarch_scar", lift=0.002, segs=5, n=12)
    R.add(Sc, sp)
    E = Part("mo_eyes")
    for s in (-1, 1):
        q, nr = surf(rings, 0.09, math.pi / 2 - s * 0.55)
        eye(E, q - nr * 0.01, 0.035)
    R.add(E, "sp0")
    Fn = Part("mo_fins")
    sheet(Fn, (0, 0.6, 0.55), (0, -0.2, 0.5), (0, 0.3, 0.85), (0, -0.25, 0.62), "monarch_skin", nu=14, nv=6, thick=0.04, round_tip=0.5, normal=(1, 0, 0))
    # the heavy lunate tail fin
    sheet(Fn, (0, -2.2, 0.1), (0, -2.5, 0.05), (0, -2.75, 0.95), (0, -2.9, 0.8), "monarch_skin", nu=10, nv=8, thick=0.05, round_tip=0.3, normal=(1, 0, 0), curl=-0.15)
    sheet(Fn, (0, -2.2, -0.1), (0, -2.5, -0.05), (0, -2.75, -0.85), (0, -2.9, -0.7), "monarch_skin", nu=10, nv=8, thick=0.05, round_tip=0.3, normal=(1, 0, 0), curl=-0.15)
    R.add(Fn, sp[3:])
    for k, (t, span, chord, z) in enumerate(((0.3, 1.35, 0.6, -0.2), (0.62, 0.6, 0.35, -0.25))):
        for side, sname in ((1, "R"), (-1, "L")):
            root, _ = surf(rings, t, -0.3 if side > 0 else math.pi + 0.3)
            tip = root + Vector((side * span, -chord * 0.7, z))
            names = R.chain(f"fin{sname}{k}_", [root, root.lerp(tip, 0.5), tip], parent=sp[3] if k == 0 else sp[7])
            Fp = Part(f"mo_fin{sname}{k}")
            sheet(Fp, root + Vector((0, chord * 0.5, 0)), root - Vector((0, chord * 0.5, 0)), tip + Vector((0, chord * 0.15, 0)), tip - Vector((0, chord * 0.2, 0)),
                  "monarch_skin", nu=10, nv=8, thick=0.035, camber=0.03, round_tip=0.6, normal=(0, 0, 1),
                  edge=lambda u, v: 0.01 * math.sin(u * 9) * v)
            R.add(Fp, names)
    arm, ob = R.finish(subdiv=1, looks=MONARCH_LOOK, tex=2048, extra=monarch_marks)
    return arm


BUILD = {"icebloom": build_icebloom, "ferric": build_ferric, "ribbon": build_ribbon, "prism": build_prism, "ghost": build_ghost,
         "bmimic": build_bmimic, "hermit": build_hermit, "serpent": build_serpent, "monarch": build_monarch}

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
