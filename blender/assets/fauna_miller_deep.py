"""
Miller's Planet open-water and deep species, realism pass (original speculative designs from the player's concept
images; own geometry, no copies). See docs/MILLER_BIOSPHERE.md. Built with blender/lib/organic.py: smooth
parametric bodies, conforming plates, rayed fin membranes, curved fangs, wet corneas; ambient occlusion baked to a
vertex layer. Fine skin (wrinkles, pores, mottling) is procedural at runtime (src/render/CreatureSkin.ts).

  crown      Gargantuan Crown (image 5): 10 m apex predator. Broad flattened skull with paired bony ridges running
             back from the snout and rising into a crown of curved tines, small forward eyes, a gaping U-shaped mouth
             with rows of long recurved fangs on red gums, a beard of fine barbels, huge swept pectorals with
             striations, a vertical crescent tail.
Blender +Y forward, +Z up. Bone names are the contract with src/world/fauna/millerDeep.ts.
"""
import sys, os, math, random
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "lib"))
sys.path.insert(0, HERE)
import bpy, bmesh
import kit
from kit import V, empty
import creature as C
from creature import Skeleton, Part, assemble, finish_creature
from organic import Surf, plate, fin, tube, fang, ringed, cornea, eye, sstep, smooth_lerp

PI = math.pi
TAU = math.tau

kit.PALETTE.update({
    "cornea": dict(color=(0.9, 0.92, 0.95), rough=0.02, alpha=0.18),
    "crown_fin": dict(color=(0.03, 0.035, 0.045), rough=0.3),
    "crown_barbel": dict(color=(0.08, 0.07, 0.07), rough=0.4),
    "crown_throat": dict(color=(0.05, 0.008, 0.01), rough=0.5),
    "crown_eye": dict(color=(0.18, 0.12, 0.05), rough=0.1),
    "crown_tooth": dict(color=(0.85, 0.84, 0.8), rough=0.2),
    "stalker_eye": dict(color=(0.35, 0.3, 0.12), rough=0.1),
    "stalker_ray": dict(color=(0.1, 0.12, 0.14), rough=0.3),
    "stalker_belly": dict(color=(0.1, 0.11, 0.12), rough=0.4),
    "stalker_gum": dict(color=(0.12, 0.05, 0.06), rough=0.3),
    "prey_silver": dict(color=(0.7, 0.74, 0.78), rough=0.2),
    "prey_back": dict(color=(0.12, 0.16, 0.2), rough=0.3),
    "prey_fin": dict(color=(0.7, 0.75, 0.8), rough=0.2, alpha=0.5),
    "prey_shrimp": dict(color=(0.75, 0.35, 0.3), rough=0.3),
    "prey_glow": dict(color=(0.3, 0.9, 1.0), emit=(0.3, 0.9, 1.0), emit_strength=3.0),
    "prey_krill": dict(color=(0.85, 0.45, 0.42), rough=0.3),
    "chorus_fin": dict(color=(0.14, 0.17, 0.2), rough=0.3),
    "chorus_gill": dict(color=(0.5, 0.55, 0.6), rough=0.25),
    "chorus_eye": dict(color=(0.2, 0.16, 0.08), rough=0.1),
    "cath_belly": dict(color=(0.3, 0.36, 0.42), rough=0.4),
    "cath_cavity": dict(color=(0.08, 0.12, 0.18), rough=0.3),
    "cath_ray": dict(color=(0.35, 0.22, 0.15), rough=0.4),
    "siren_head": dict(color=(0.3, 0.26, 0.26), rough=0.15),
    "siren_eye": dict(color=(0.55, 0.6, 0.62), rough=0.05),
    "siren_ray": dict(color=(0.8, 0.88, 0.95), rough=0.1),
})


def pose(arm, rots):
    for nm, r in rots.items():
        pb = arm.pose.bones.get(nm)
        if pb:
            pb.rotation_mode = "XYZ"
            pb.rotation_euler = r


def preview_pose(name, cam, target, lens=40, world=(0.5, 0.55, 0.58), up=None, sun=(0.5, -0.6, 0.7), res=(960, 540)):
    kit.preview(os.path.join(kit.preview_dir(), f"{name}.png"), cam, target, lens=lens, samples=16, world=world, sun=sun,
                sun_strength=3.5, up=up, res=res)


def mouth_curve(y_back, y_front, half_w, z_back, z_front, sharp=0.7):
    """U-shaped jaw margin in plan: s in [-1, 1] (left corner → snout → right corner)"""
    def f(s):
        ph = s * PI / 2
        x = math.sin(ph) * half_w
        c = math.cos(ph)
        y = y_back + (y_front - y_back) * (abs(c) ** sharp)
        z = z_back + (z_front - z_back) * abs(c) ** 1.5
        return V((x, y, z))
    return f


# ================================================================================================ gargantuan crown (image 5)
def crown():
    """10 m; origin at the body centre"""
    kit.reset()
    root = empty("GargantuanCrown")
    rng = random.Random(91)
    sk = Skeleton()
    spine_pts = [(0, 3.2, 0.1), (0, 2.2, 0.05), (0, 0.6, 0.0), (0, -1.2, 0.0), (0, -2.9, 0.0), (0, -4.2, 0.05), (0, -5.1, 0.1)]
    spine = sk.chain("sp", spine_pts, None)
    sk.add("head", spine_pts[0], (0, 5.1, 0.2), spine[0])
    HINGE = V((0, 2.75, -0.25))
    sk.add("jaw", tuple(HINGE), (0, 5.0, -0.55), "head")
    parts = []

    # ---- body + skull: one smooth surface; the skull is flattened on top, its underside is the palate
    body = Surf([
        (-5.25, 0.05, 0.10, 0.10, 0.12, 2.0),
        (-4.7, 0.20, 0.34, 0.30, 0.08, 2.1),
        (-3.7, 0.50, 0.66, 0.60, 0.04, 2.2),
        (-2.3, 0.86, 0.98, 0.92, 0.0, 2.3),
        (-0.7, 1.16, 1.20, 1.14, 0.0, 2.35),
        (0.9, 1.30, 1.26, 1.18, 0.0, 2.4),
        (2.1, 1.36, 1.14, 1.0, 0.02, 2.5),
        (2.9, 1.38, 1.0, 0.44, 0.1, 2.9),
        (3.7, 1.3, 0.9, 0.26, 0.16, 3.1),
        (4.45, 1.12, 0.78, 0.2, 0.18, 3.2),
        (4.95, 0.86, 0.62, 0.16, 0.16, 3.0),
        (5.25, 0.42, 0.36, 0.12, 0.12, 2.4),
    ])
    T_HEAD = 0.66  # parameter where the skull starts (≈ y 2.6)

    def body_t(y):
        lo, hi = 0.0, 1.0
        for _ in range(30):
            mid = (lo + hi) / 2
            if body.sec(mid)[0] < y:
                lo = mid
            else:
                hi = mid
        return (lo + hi) / 2

    def disp(t, a):
        d = 0.0
        sn = math.sin(a)
        # a sagittal keel along the back, fading toward the tail
        d += 0.06 * math.exp(-((a - PI / 2) / 0.07) ** 2) * sstep(0.1, 0.5, t)
        # loose irregular skin folds on the neck (the fine wrinkles are in the shader)
        d += 0.012 * math.sin(t * 140 + 3.0 * math.sin(a * 2.3) + 1.5 * math.sin(t * 37)) * sstep(0.5, 0.6, t) * (1 - sstep(0.64, 0.68, t))
        # a lateral line groove
        d -= 0.03 * math.exp(-((sn - 0.05) / 0.05) ** 2) * (1 - sstep(0.62, 0.68, t)) * sstep(0.1, 0.3, t)
        # gill pleats behind the head: five deep slits on each side
        if 0.56 < t < 0.65 and -0.2 < sn < 0.55:
            ph = (t - 0.56) / 0.09 * 5
            d -= 0.07 * max(0.0, math.cos(ph * TAU)) ** 6 * math.sin(PI * (sn + 0.2) / 0.75)
        # cheek muscles bulge over the jaw hinge
        d += 0.06 * math.exp(-((t - 0.67) / 0.03) ** 2) * math.exp(-((abs(math.cos(a)) - 0.93) / 0.12) ** 2) * (sn < 0.3)
        return d

    def mat_fn(t, a):
        # the palate under the skull: gum-red inside the mouth
        return 1 if (t > T_HEAD + 0.02 and math.sin(a) < -0.55) else 0
    parts.append(Part(body.mesh("body", 150, 56, ("crown_hide", "crown_gum"), disp=disp, mat_fn=mat_fn), bones=spine + ["head"]))

    # ---- lower jaw: a deep U-shaped scoop hinged under the skull, modelled a little open
    jaw = Surf([
        (2.55, 0.95, 0.12, 0.32, -0.45, 2.4),
        (3.2, 1.24, 0.14, 0.46, -0.56, 2.7),
        (3.95, 1.18, 0.14, 0.46, -0.7, 2.8),
        (4.6, 0.96, 0.13, 0.4, -0.82, 2.6),
        (5.05, 0.6, 0.11, 0.3, -0.86, 2.3),
        (5.25, 0.22, 0.07, 0.14, -0.85, 2.0),
    ])

    def jaw_mat(t, a):
        return 1 if (math.sin(a) > 0.8 and t > 0.05) else 0

    def jaw_disp(t, a):
        # the inside of the jaw is hollow (tongue trough): push the top inward
        sn = math.sin(a)
        d = -0.1 * max(0.0, sn - 0.3) * sstep(0.05, 0.25, t) * (1 - sstep(0.85, 1.0, t))
        # chin wrinkles
        d += 0.012 * math.sin(t * 90) * max(0.0, -sn)
        return d
    parts.append(Part(jaw.mesh("jawm", 60, 40, ("crown_hide", "crown_gum"), disp=jaw_disp, mat_fn=jaw_mat), bone="jaw"))
    # throat back wall and tongue: dark, wet
    parts.append(Part(kit.sphere("throat", 1.0, loc=(0, 2.85, -0.2), m="crown_throat", segs=20, rings=12, scale=(0.95, 0.3, 0.38)), bone="head"))
    parts.append(Part(kit.sphere("tongue", 1.0, loc=(0, 3.6, -0.5), m="crown_gum", segs=18, rings=10, scale=(0.62, 1.2, 0.14)), bone="jaw"))

    # ---- gums and fangs. Upper margin: just under the skull's lip; lower margin: the jaw's rim
    up_m = mouth_curve(2.95, 5.2, 1.28, -0.14, -0.02, sharp=0.6)
    lo_m = mouth_curve(2.95, 5.1, 1.15, -0.4, -0.68, sharp=0.6)
    for nm, mf, bone, outward, down in (("u", up_m, "head", 1, V((0, 0, -1))), ("l", lo_m, "jaw", 1, V((0, 0, 1)))):
        gp = [mf(-1 + 2 * i / 30) for i in range(31)]
        # swollen gums, lumpy (each fang socket raised)
        parts.append(Part(tube(f"gum{nm}", gp, [0.05 + 0.018 * math.sin(i * 2.1) ** 2 for i in range(31)], "crown_gum", seg=8), bone=bone))
        teeth = []
        # outer row: big recurved fangs, the front ones longest; irregular spacing and lengths
        n_out = 22 if nm == "u" else 18
        for i in range(n_out):
            s = -0.97 + 1.94 * (i + rng.uniform(-0.3, 0.3)) / (n_out - 1)
            p = mf(s)
            front = math.cos(s * PI / 2)
            L = (0.16 + 0.55 * front ** 3) * rng.uniform(0.65, 1.25)
            if abs(s) > 0.15 and abs(s) < 0.45 and rng.random() < 0.5:
                L *= 1.5  # the great canine-like fangs either side of the front
            if rng.random() < 0.15:
                L *= 0.5  # a broken or growing tooth
            outv = V((math.sin(s * PI / 2) * 0.5 + rng.uniform(-0.15, 0.15), front * 0.45, rng.uniform(-0.1, 0.1)))
            d = down + outv * 0.55
            inward = V((-p.x, 2.6 - p.y, 0)).normalized() * 0.6 + down * 0.2
            teeth.append(fang(f"f{nm}{i}", p + down * 0.02, d, inward, L, 0.035 + 0.05 * L, curve=0.38, m="crown_tooth", seg=6))
        # inner rows: smaller needles angled into the mouth
        for row in (1, 2):
            n_in = 20 if nm == "u" else 16
            for i in range(n_in):
                s = -0.9 + 1.8 * (i + rng.uniform(-0.3, 0.3)) / (n_in - 1)
                p = mf(s)
                p = p + V((-p.x, 3.9 - p.y, 0)).normalized() * (0.13 * row)
                L = rng.uniform(0.08, 0.2) * (1.2 - 0.3 * row)
                d = down + V((-p.x, 3.9 - p.y, 0)).normalized() * 0.35
                teeth.append(fang(f"n{nm}{row}{i}", p, d, V((-p.x, 2.5 - p.y, 0)), L, 0.02 + 0.04 * L, curve=0.4, m="crown_tooth", seg=5, n=5))
        parts.append(Part(kit.merge(teeth, f"teeth{nm}"), bone=bone))

    # ---- beard: fine barbels hanging from the chin and along the jaw line
    bar = []
    for i in range(46):
        s = -0.95 + 1.9 * i / 45 + rng.uniform(-0.02, 0.02)
        p = lo_m(s) + V((0, 0, -0.22 - 0.1 * math.cos(s * PI / 2)))
        p = p + V((math.sin(s * PI / 2) * 0.05, 0.04, 0))
        L = rng.uniform(0.5, 1.5) * (0.6 + 0.4 * math.cos(s * PI / 2))
        sway = V((rng.uniform(-0.15, 0.15), rng.uniform(-0.25, 0.05), 0))
        pts = [p + V((0, 0, -L * k / 6)) + sway * ((k / 6) ** 2) * L for k in range(7)]
        bar.append(tube(f"b{i}", pts, [0.012 * (1 - 0.8 * k / 6) + 0.002 for k in range(7)], "crown_barbel", seg=4))
    parts.append(Part(kit.merge(bar, "beard"), bone="jaw"))

    # ---- the crown: two bony ridges from above the nostrils sweeping back over the eyes, each rising into three
    # recurved tines (the inner pair tallest), with knobbed brows between
    def head_pt(y, x, lift=0.0):
        t = body_t(y)
        sec = body.sec(t)
        w, hu, zc = sec[1], sec[2], sec[4]
        u = max(-0.98, min(0.98, x / w))
        a = math.acos(u)
        p = body.P(t, a)
        return p + body.N(t, a) * lift, body.N(t, a)

    crownp = []
    for sx in (-1, 1):
        rp, rr = [], []
        for k in range(16):
            f = k / 15
            y = 5.0 - 1.75 * f
            x = sx * (0.16 + 1.0 * f ** 0.9)
            p, n = head_pt(y, x, 0.03 + 0.12 * math.sin(PI * min(1, f * 1.1)))
            rp.append(p)
            rr.append(0.012 + 0.13 * math.sin(PI * min(1.0, 0.02 + f * 0.95)) ** 0.8)
        crownp.append(tube(f"ridge{sx}", rp, rr, "crown_horn", seg=10))
        for k in range(1, 15, 2):
            crownp.append(kit.sphere(f"knob{sx}{k}", rr[k] * 0.85, loc=tuple(rp[k] + V((0, 0, rr[k] * 0.45))), m="crown_horn", segs=8, rings=5))
        # tines along the ridge: front pair tall and curling inward, then up-and-out, the outer ones sweeping
        # sideways from the cheeks; each with a barb
        for (f, L, lean, back, curl) in ((0.18, 1.35, 0.1, -0.15, 0.4), (0.36, 1.75, 0.3, -0.3, 0.35), (0.55, 1.5, 0.75, -0.35, 0.32),
                                         (0.74, 1.3, 1.35, -0.25, 0.3), (0.92, 1.0, 2.2, -0.2, 0.28)):
            k = f * 15
            i0 = int(k)
            b = rp[i0].lerp(rp[min(i0 + 1, 15)], k - i0)
            d = V((sx * lean, back, 1.0)).normalized()
            bend = V((-sx * 0.7, -0.4, 0.5 if lean > 1 else 0.1))
            r0 = 0.1 + 0.05 * L
            Lr = L * rng.uniform(0.9, 1.1)
            crownp.append(fang(f"tine{sx}{f}", b - d * 0.06, d, bend, Lr, r0, curve=curl, m="crown_horn", seg=10, n=9, tip_r=0.006))
            for bk, bf in ((0, 0.42), (1, 0.66)):
                if L > 1.2 or bk == 0:
                    bb = b + d * (Lr * bf)
                    bdir = V((sx * 0.7, 0.2, 0.55)) if bk == 0 else V((-sx * 0.5, 0.4, 0.6))
                    crownp.append(fang(f"barb{sx}{f}{bk}", bb, bdir, V((0, 0, 1)), Lr * 0.16, r0 * 0.32, curve=0.35, m="crown_horn", seg=6, n=5))
        # brow ridge over the eyes
        bp = []
        for k in range(9):
            f = k / 8
            p, n = head_pt(4.75 - 0.75 * f, sx * (0.32 + 0.45 * f), 0.04)
            bp.append(p)
        crownp.append(tube(f"brow{sx}", bp, [0.045 + 0.035 * math.sin(PI * k / 8) for k in range(9)], "crown_horn", seg=8))
    # a low median crest of knobs down the skull and the back
    for k in range(18):
        y = 4.6 - 0.45 * k
        t = body_t(y)
        p = body.P(t, PI / 2)
        r = 0.05 + 0.05 * math.sin(PI * min(1.0, k / 10)) if k < 12 else 0.05
        crownp.append(fang(f"crest{k}", p - V((0, 0, 0.03)), V((0, -0.5, 1)), V((0, -1, 0)), 0.12 + 0.12 * math.sin(PI * min(1.0, k / 12)), r, curve=0.3, m="crown_horn", seg=6, n=4))
    parts.append(Part(kit.merge(crownp[:-18], "crown"), bone="head"))
    parts.append(Part(kit.merge(crownp[-18:], "crest"), bones=spine + ["head"]))

    # ---- eyes: a main pair set forward above the mouth corners, a smaller pair behind; nostril pits on the snout
    eyes = []
    for sx in (-1, 1):
        p, n = head_pt(4.62, sx * 0.5, -0.02)
        eyes.append(eye(f"eye{sx}", p, n + V((0, 0.8, 0.1)), 0.075, "crown_eye", cornea_m="cornea", pupil=(0.55, 0.55)))
        p2, n2 = head_pt(4.3, sx * 0.8, -0.02)
        eyes.append(eye(f"eyeb{sx}", p2, n2 + V((0, 0.3, 0)), 0.045, "crown_eye", cornea_m="cornea", pupil=(0.6, 0.6)))
        for k in range(3):
            pn, nn = head_pt(5.05 - 0.12 * k, sx * (0.2 + 0.06 * k), -0.01)
            eyes.append(kit.sphere(f"nos{sx}{k}", 0.035 - 0.008 * k, loc=tuple(pn), m="crown_throat", segs=8, rings=5, scale=(1, 1.3, 0.4)))
    parts.append(Part(kit.merge(eyes, "eyes"), bone="head"))

    # ---- fins. Pectorals: huge, swept, rayed (striations), drooping at the tips
    for sx, s in ((-1, "L"), (1, "R")):
        root_f, root_b = V((sx * 1.12, 2.0, -0.55)), V((sx * 1.05, 0.35, -0.62))
        sk.add(f"fin{s}", tuple(root_f.lerp(root_b, 0.5)), (sx * 4.6, -0.9, -1.0), spine[1])
        base = [root_f.lerp(root_b, k / 8) for k in range(9)]
        edge = []
        for k in range(9):
            u = k / 8
            # leading edge tip out at the far end, trailing edge curving back to the body
            ang = 0.15 + 1.25 * u
            reach = 4.9 * (1 - 0.72 * u ** 1.3)
            edge.append(V((sx * (1.1 + reach * math.cos(ang * 0.55)), 1.6 - 1.9 * u - reach * 0.45 * math.sin(ang * 0.9), -0.65 - 0.55 * (1 - u))))
        parts.append(Part(fin(f"pec{s}", base, edge, "crown_fin", nv=10, rays=30, corr=0.008, scallop=0.0, ruffle=0.04, ruffle_f=2.5, thick=0.08, droop=0.15, up=(0, 0, 1)), bone=f"fin{s}"))
        # pelvics
        pb = [V((sx * 0.75, -1.4, -0.75)), V((sx * 0.7, -2.2, -0.7))]
        pe = [V((sx * 1.9, -2.3, -1.15)), V((sx * 1.1, -2.9, -0.85))]
        parts.append(Part(fin(f"pel{s}", pb, pe, "crown_fin", nv=6, rays=9, corr=0.02, thick=0.05, up=(0, 0, 1)), bone=spine[3]))
    # tail: a tall crescent (vertical, like a shark's), upper lobe longer
    tb = [V((0, -4.6, 0.28)), V((0, -4.9, 0.2)), V((0, -5.15, 0.1)), V((0, -5.2, 0.05)), V((0, -5.0, -0.08)), V((0, -4.7, -0.18))]
    te = [V((0, -5.0, 1.6)), V((0, -6.6, 2.5)), V((0, -5.9, 0.9)), V((0, -5.55, 0.08)), V((0, -6.3, -1.45)), V((0, -5.2, -1.1))]
    parts.append(Part(fin("fluke", tb, te, "crown_fin", nv=8, rays=18, corr=0.008, thick=0.07), bone=spine[-1]))
    # dorsal: a low keel fin far back
    db = [V((0, -1.6, 1.05)), V((0, -2.6, 0.92)), V((0, -3.4, 0.68))]
    de = [V((0, -2.0, 1.6)), V((0, -2.9, 1.3)), V((0, -3.5, 0.75))]
    parts.append(Part(fin("dorsal", db, de, "crown_fin", nv=6, rays=8, corr=0.015, thick=0.05), bones=spine[3:5]))

    body_o = assemble("crown_body", sk, parts)
    arm = finish_creature(root, sk, body_o, os.path.join(kit.out_dir(), "fauna_crown.glb"), props={"creature": "crown", "length": 10.0}, ao=1.2)
    return root, arm


# ================================================================================================ abyssal stalker (image 9)
def stalker(juvenile=False):
    """6.6 m (juvenile model: shorter snout, bigger eyes, finer teeth; scaled in game); swimming, origin at the body centre. A long-skulled ambush predator: flat crocodilian head with brow
    ridges over small eyes and rows of electro-sensory pits on the snout, a long gape of uneven needle teeth, a thick
    neck, two pairs of rayed paddle flippers, a long tail bending down into a crescent fin."""
    kit.reset()
    root = empty("AbyssalStalker")
    rng = random.Random(53)
    J = juvenile
    sk = Skeleton()
    pts = [V((0, 3.2 - 6.6 * t, -0.15 * t * t)) for t in [i / 12 for i in range(13)]]
    spine = sk.chain("sp", [tuple(p) for p in pts[2:]], None)
    sk.add("head", tuple(pts[2]), tuple(pts[0]), spine[0])
    sk.add("jaw", (0, 1.95, -0.12), (0, 3.2, -0.22), "head")
    parts = []

    def bend(t):
        return (0.0, -0.15 * (1 - t) ** 2 - 0.22 * max(0.0, 1 - t / 0.12) ** 2)
    body = Surf([
        (-3.35, 0.02, 0.05, 0.05, -0.02, 2.0),
        (-2.9, 0.06, 0.15, 0.15, 0.0, 2.0),
        (-2.2, 0.14, 0.25, 0.25, 0.0, 2.1),
        (-1.3, 0.24, 0.32, 0.32, 0.0, 2.2),
        (-0.3, 0.35, 0.39, 0.39, 0.0, 2.3),
        (0.6, 0.39, 0.4, 0.4, 0.0, 2.3),
        (1.35, 0.36, 0.33, 0.32, 0.02, 2.4),
        (1.9, 0.4, 0.24, 0.15, 0.04, 3.0),
        (2.45, 0.35, 0.16, 0.08, 0.03, 3.4),
        (2.9, 0.25, 0.12, 0.06, 0.02, 3.3),
        (3.18, 0.14, 0.09, 0.05, 0.0, 2.8),
        (3.33, 0.04, 0.05, 0.03, -0.01, 2.2),
    ], bend=bend)

    def disp(t, a):
        sn, cs = math.sin(a), math.cos(a)
        d = 0.0
        # dorsal ridge along the back and tail
        d += 0.03 * math.exp(-((a - PI / 2) / 0.08) ** 2) * (1 - sstep(0.7, 0.85, t))
        # brow ridges over the eyes and a ridge down each side of the skull
        if t > 0.7:
            d += 0.035 * math.exp(-((abs(cs) - 0.55) / 0.1) ** 2) * (sn > 0) * sstep(0.7, 0.76, t) * (1 - sstep(0.9, 0.98, t))
        # lateral line groove
        d -= 0.012 * math.exp(-((sn - 0.1) / 0.06) ** 2) * sstep(0.2, 0.4, t) * (1 - sstep(0.62, 0.68, t))
        # ventral pleats on the throat
        if 0.6 < t < 0.72 and sn < -0.5:
            d -= 0.01 * max(0.0, math.cos(abs(cs) * 30)) ** 4
        return d

    def mat_fn(t, a):
        if t > 0.74 and math.sin(a) < -0.6:
            return 2  # palate
        return 1 if math.sin(a) < -0.45 else 0
    parts.append(Part(body.mesh("body", 140, 40, ("stalker_hide", "stalker_belly", "stalker_gum"), disp=disp, mat_fn=mat_fn), bones=spine + ["head"]))

    jaw = Surf([
        (1.8, 0.4, 0.06, 0.18, -0.14, 2.5),
        (2.25, 0.36, 0.06, 0.14, -0.18, 2.7),
        (2.75, 0.27, 0.05, 0.1, -0.21, 2.7),
        (3.08, 0.16, 0.04, 0.07, -0.22, 2.4),
        (3.27, 0.05, 0.03, 0.03, -0.21, 2.0),
    ])
    parts.append(Part(jaw.mesh("jawm", 50, 28, ("stalker_hide", "stalker_gum", "stalker_belly"),
                               mat_fn=lambda t, a: 1 if math.sin(a) > 0.7 else (2 if math.sin(a) < -0.5 else 0),
                               disp=lambda t, a: -0.03 * max(0.0, math.sin(a) - 0.4) * sstep(0.05, 0.3, t)), bone="jaw"))
    parts.append(Part(kit.sphere("throat", 1.0, loc=(0, 1.95, -0.08), m="crown_throat", segs=16, rings=8, scale=(0.3, 0.12, 0.13)), bone="head"))
    # uneven interlocking needle teeth on both jaws, the front ones longest
    up_m = mouth_curve(1.98, 3.3, 0.36, -0.05, -0.04, sharp=0.35)
    lo_m = mouth_curve(1.98, 3.26, 0.33, -0.12, -0.19, sharp=0.35)
    up_m0 = up_m
    up_m = lambda sv: up_m0(sv) * 1.0
    for nm, mf, bone, down in (("u", up_m, "head", V((0, 0, -1))), ("l", lo_m, "jaw", V((0, 0, 1)))):
        gp = [mf(-1 + 2 * i / 24) for i in range(25)]
        parts.append(Part(tube(f"gum{nm}", gp, [0.016] * 25, "stalker_gum", seg=6), bone=bone))
        teeth = []
        n = 36 if nm == "u" else 32
        for i in range(n):
            sv = -0.96 + 1.92 * (i + rng.uniform(-0.3, 0.3) + (0.5 if nm == "l" else 0)) / n
            p = mf(sv)
            front = math.cos(sv * PI / 2)
            L = (0.035 + 0.075 * front ** 1.5) * rng.uniform(0.6, 1.4)
            if rng.random() < 0.12:
                L *= 1.6
            if J:
                L *= 0.6
            d = down + V((math.sin(sv * PI / 2) * 0.35 + rng.uniform(-0.15, 0.15), front * 0.3, 0))
            teeth.append(fang(f"t{nm}{i}", p, d, V((-p.x, 1.5 - p.y, 0)), L, 0.006 + 0.07 * L, curve=0.3, m="crown_tooth", seg=5, n=5))
        parts.append(Part(kit.merge(teeth, f"teeth{nm}"), bone=bone))

    def head_pt(y, x, lift=0.0):
        lo, hi = 0.0, 1.0
        for _ in range(30):
            mid = (lo + hi) / 2
            if body.sec(mid)[0] < y:
                lo = mid
            else:
                hi = mid
        t = (lo + hi) / 2
        w = body.sec(t)[1]
        a = math.acos(max(-0.98, min(0.98, x / w)))
        return body.P(t, a) + body.N(t, a) * lift, body.N(t, a)
    det = []
    for sx in (-1, 1):
        p, n = head_pt(2.1, sx * 0.3, -0.012)
        det.append(eye(f"eye{sx}", p, n + V((0, 0.35, 0.15)), 0.034 * (1.7 if J else 1.0), "stalker_eye", cornea_m="cornea", pupil=(0.5, 0.9), slit_axis=(0, 0, 1)))
        # sensory pits in rows on the snout (bioelectric sense), nostrils at the tip
        for row in range(3):
            for k in range(7):
                y = 3.12 - 0.13 * k
                x = sx * (0.04 + 0.05 * row + 0.022 * k)
                pp, pn = head_pt(y, x, -0.004)
                det.append(kit.sphere(f"pit{sx}{row}{k}", 0.009, loc=tuple(pp), m="crown_throat", segs=6, rings=4, scale=(1, 1, 0.35)))
        pn_, nn_ = head_pt(3.2, sx * 0.05, -0.006)
        det.append(kit.sphere(f"nos{sx}", 0.016, loc=tuple(pn_), m="crown_throat", segs=8, rings=5, scale=(1, 1.5, 0.4)))
    parts.append(Part(kit.merge(det, "headdetail"), bone="head"))

    # two pairs of paddle flippers: membranes over radiating rays, translucent between the bones
    for sx, s in ((-1, "L"), (1, "R")):
        rf, rb = V((sx * 0.42, 1.2, -0.22)), V((sx * 0.4, 0.55, -0.26))
        sk.add(f"fin{s}", tuple(rf.lerp(rb, 0.5)), (sx * 1.9, 0.0, -0.6), spine[1])
        base = [rf.lerp(rb, k / 6) for k in range(7)]
        edge = []
        for k in range(7):
            u = k / 6
            ang = 0.25 + 1.6 * u
            reach = 1.65 * (1 - 0.55 * u ** 1.6)
            edge.append(V((sx * (0.45 + reach * math.cos(ang * 0.6)), 1.05 - 0.85 * u - reach * 0.55 * math.sin(ang * 0.7), -0.3 - 0.35 * (1 - u))))
        parts.append(Part(fin(f"pec{s}", base, edge, "stalker_fin", nv=8, rays=12, corr=0.004, scallop=0.015, thick=0.025, droop=0.05,
                              rays_m="stalker_ray", ray_r=0.016, up=(0, 0, 1)), bone=f"fin{s}"))
        rf2, rb2 = V((sx * 0.3, -1.0, -0.2)), V((sx * 0.26, -1.45, -0.2))
        sk.add(f"pel{s}", tuple(rf2.lerp(rb2, 0.5)), (sx * 1.2, -1.7, -0.45), spine[5])
        base2 = [rf2.lerp(rb2, k / 5) for k in range(6)]
        edge2 = []
        for k in range(6):
            u = k / 5
            reach = 1.0 * (1 - 0.6 * u ** 1.5)
            edge2.append(V((sx * (0.3 + reach * 0.85), -1.15 - 0.55 * u - reach * 0.45, -0.3 - 0.2 * (1 - u))))
        parts.append(Part(fin(f"pel{s}", base2, edge2, "stalker_fin", nv=7, rays=9, corr=0.004, scallop=0.015, thick=0.02, droop=0.03,
                              rays_m="stalker_ray", ray_r=0.012, up=(0, 0, 1)), bone=f"pel{s}"))
    # tail: the spine bends down into the larger lower lobe; a smaller upper lobe; low keels on the tail stock
    tb = [V((0, -2.7, 0.12)), V((0, -3.0, 0.02)), V((0, -3.25, -0.12)), V((0, -3.35, -0.2)), V((0, -3.2, -0.3))]
    te = [V((0, -3.0, 0.5)), V((0, -3.75, 0.62)), V((0, -3.55, -0.12)), V((0, -4.05, -0.95)), V((0, -3.3, -0.62))]
    parts.append(Part(fin("fluke", tb, te, "stalker_fin", nv=8, rays=14, corr=0.006, thick=0.03, rays_m="stalker_ray", ray_r=0.008), bones=spine[-2:]))
    body_o = assemble("stalker_body", sk, parts)
    if J:
        # a young one's snout is short: compress everything ahead of the eyes (weights stay with their bones)
        for v in body_o.data.vertices:
            if v.co.y > 2.0:
                v.co.y = 2.0 + (v.co.y - 2.0) * 0.72
        for bn in ("head", "jaw"):
            h, t, par = sk.bones[bn]
            sq = lambda q: V((q.x, 2.0 + (q.y - 2.0) * 0.72, q.z)) if q.y > 2.0 else q
            sk.bones[bn] = (sq(h), sq(t), par)
    name = "fauna_abyssstalker_juv.glb" if J else "fauna_abyssstalker.glb"
    arm = finish_creature(root, sk, body_o, os.path.join(kit.out_dir(), name), props={"creature": "abyssstalker", "length": 6.5}, ao=0.6)
    return root, arm


# ================================================================================================ chorus hunter (image 1)
def chorus(juvenile=False):
    """3 m (juvenile 1.9 m, rebuilt with juvenile proportions); swimming, origin at the body centre. Sleek and long:
    a narrow pointed snout with a long closed gape lined with golden sensory dots, a second dotted line over the eye,
    seven curved gill slits, pale grooves along the flanks, a low serrated crest, long sickle pectorals with rays,
    small pelvics, a tall crescent tail with the upper lobe swept up."""
    kit.reset()
    root = empty("ChorusHunter")
    rng = random.Random(31 if not juvenile else 32)
    sk = Skeleton()
    J = juvenile
    # juveniles: shorter snout, rounder head, bigger eyes, smaller fins, no crest serrations
    sn_k = 0.78 if J else 1.0
    ys = [1.6 * (sn_k if J else 1), 1.3, 0.9, 0.55, 0.1, -0.4, -0.85, -1.2, -1.45]
    spine = sk.chain("sp", [(0, y, 0) for y in ys[2:]], None)
    sk.add("head", (0, ys[2], 0), (0, ys[0], -0.02), spine[0])
    parts = []
    k = 1.15 if J else 1.0   # relative girth
    body = Surf([
        (-1.48, 0.012, 0.025, 0.025, 0.03, 2.0),
        (-1.25, 0.04 * k, 0.07, 0.065, 0.015, 2.0),
        (-0.85, 0.085 * k, 0.13 * k, 0.12 * k, 0.0, 2.1),
        (-0.4, 0.155 * k, 0.2 * k, 0.19 * k, 0.0, 2.2),
        (0.1, 0.205 * k, 0.24 * k, 0.23 * k, 0.0, 2.3),
        (0.5, 0.2 * k, 0.22 * k, 0.21 * k, 0.0, 2.3),
        (0.78, 0.165 * k, 0.18 * k, 0.15 * k, 0.0, 2.4),
        (1.0 * sn_k + (0.18 if J else 0), 0.12 * k, 0.12 * k, 0.085 * k, -0.005, 2.5),
        (1.25 * sn_k + (0.14 if J else 0), 0.075 * k, 0.075 * k, 0.05 * k, -0.015, 2.5),
        (1.45 * sn_k + (0.1 if J else 0), 0.038 * k, 0.042 * k, 0.03 * k, -0.02, 2.3),
        (1.6 * sn_k + (0.06 if J else 0), 0.01, 0.014, 0.012, -0.025, 2.0),
    ])
    y_nose = body.sec(1.0)[0]

    def y_of(t):
        return body.sec(t)[0]

    def gape_z(y):
        return -0.012 - 0.01 * (y_nose - y)

    def disp(t, a):
        y = y_of(t)
        sn, cs = math.sin(a), math.cos(a)
        p = body.P(t, a)
        d = 0.0
        # the gape: a deep groove from the snout tip back to under the eye
        if y > 0.7:
            gz = gape_z(y)
            d -= 0.012 * math.exp(-((p.z - gz) / 0.006) ** 2) * sstep(0.68, 0.78, y)
        # gill slits: seven curved grooves behind the head
        if 0.5 < y < 0.74 and -0.55 < sn < 0.45:
            ph = (y - 0.5) / 0.24 * 7 + 0.35 * sn
            d -= 0.012 * max(0.0, math.cos(ph * TAU)) ** 8
        # pale longitudinal grooves along the flanks
        if -1.0 < y < 0.55:
            for zc in (0.32, 0.05, -0.2):
                d -= 0.004 * math.exp(-((sn - zc) / 0.035) ** 2)
        # dorsal ridge
        d += 0.012 * math.exp(-((a - PI / 2) / 0.06) ** 2) * sstep(-0.9, -0.5, y) * (1 - sstep(0.6, 0.9, y))
        return d

    def mat_fn(t, a):
        y = y_of(t)
        sn = math.sin(a)
        p = body.P(t, a)
        if -1.0 < y < 0.55 and any(abs(sn - zc) < 0.025 for zc in (0.32, 0.05, -0.2)):
            return 2
        return 1 if sn < -0.4 else 0
    parts.append(Part(body.mesh("body", 160, 36, ("chorus_hide", "chorus_belly", "chorus_gill", "crown_throat"), disp=disp, mat_fn=mat_fn), bones=spine + ["head"]))

    def side_pt(y, z_target, sx, lift=0.0):
        lo, hi = 0.0, 1.0
        for _ in range(30):
            mid = (lo + hi) / 2
            if body.sec(mid)[0] < y:
                lo = mid
            else:
                hi = mid
        t = (lo + hi) / 2
        sec = body.sec(t)
        h = sec[2] if z_target >= sec[4] else sec[3]
        u = max(-0.97, min(0.97, (z_target - sec[4]) / h))
        a = math.asin(u)
        if sx < 0:
            a = PI - a
        return body.P(t, a) + body.N(t, a) * lift, body.N(t, a)
    det = []
    for sx in (-1, 1):
        # golden sensory dots along the upper lip and over the eye toward the snout
        for k in range(26):
            y = y_nose - 0.03 - (y_nose - 0.76) * k / 25
            p, n = side_pt(y, gape_z(y) + 0.009, sx, -0.0015)
            det.append(kit.sphere(f"dl{sx}{k}", 0.0042, loc=tuple(p), m="chorus_pore", segs=6, rings=4, scale=(1, 1, 0.5)))
        # gill slits: seven curved pale lamellae sunk in the grooves
        for g in range(7):
            arc = []
            for q in range(9):
                zz = -0.11 + 0.2 * q / 8
                sec_y = 0.5 + (g + 0.5) / 7 * 0.24 - 0.35 * 0.24 / 7 * (zz / 0.2)
                pp, nn = side_pt(sec_y, zz, sx, -0.006)
                arc.append(pp)
            det.append(tube(f"gill{sx}{g}", arc, [0.0035 * math.sin(PI * (0.1 + 0.8 * q / 8)) + 0.001 for q in range(9)], "chorus_gill", seg=4))
        for k in range(12):
            y = y_nose - 0.15 - (y_nose - 0.85) * k / 11
            sec_z = 0.035 + 0.03 * k / 11
            p, n = side_pt(y, sec_z, sx, -0.002)
            det.append(kit.sphere(f"du{sx}{k}", 0.005, loc=tuple(p), m="chorus_pore", segs=6, rings=4, scale=(1, 1, 0.5)))
        gl = []
        for k in range(30):
            y = y_nose - 0.01 - (y_nose - 0.74) * k / 29
            p, n = side_pt(y, gape_z(y), sx, 0.0015)
            gl.append(p)
        det.append(tube(f"gape{sx}", gl, [0.0018 + 0.0012 * k / 29 for k in range(30)], "crown_throat", seg=4))
        pe, ne = side_pt(0.79 if not J else 0.86, 0.03, sx, -0.004)
        det.append(eye(f"eye{sx}", pe, ne + V((0, 0.25, 0.05)), 0.016 * (1.5 if J else 1.0), "chorus_eye", cornea_m="cornea", pupil=(0.5, 0.8)))
    parts.append(Part(kit.merge(det, "headdots"), bone="head"))

    # long sickle pectorals with rays
    fk = 0.8 if J else 1.0
    for sx, s in ((-1, "L"), (1, "R")):
        rf, rb = V((sx * 0.17, 0.45, -0.13)), V((sx * 0.16, 0.24, -0.15))
        sk.add(f"fin{s}", tuple(rf.lerp(rb, 0.5)), (sx * 0.95, -0.3, -0.35), spine[1])
        base = [rf.lerp(rb, i / 6) for i in range(7)]
        edge = []
        for i in range(7):
            u = i / 6
            reach = 1.0 * fk * (1 - 0.85 * u ** 1.2)
            edge.append(V((sx * (0.18 + reach * 0.8), 0.4 - 0.25 * u - reach * 0.62, -0.15 - reach * 0.25)))
        parts.append(Part(fin(f"pec{s}", base, edge, "chorus_fin", nv=8, rays=12, corr=0.003, thick=0.012, droop=-0.02,
                              rays_m="chorus_hide", ray_r=0.004, up=(0, 0, 1)), bone=f"fin{s}"))
        pb = [V((sx * 0.12, -0.45, -0.17)), V((sx * 0.1, -0.62, -0.16))]
        pe = [V((sx * 0.38 * fk, -0.72, -0.27)), V((sx * 0.18, -0.8, -0.2))]
        parts.append(Part(fin(f"pel{s}", pb, pe, "chorus_fin", nv=5, rays=6, corr=0.002, thick=0.01, up=(0, 0, 1)), bone=spine[3]))
    # low serrated crest along the back
    if not J:
        cb = [V((0, 0.3 - 1.25 * i / 10, 0.235 - 0.12 * (i / 10) ** 1.5)) for i in range(11)]
        ce = [p + V((0, -0.03, 0.05 + 0.015 * math.sin(i * 1.7))) for i, p in enumerate(cb)]
        parts.append(Part(fin("crest", cb, ce, "chorus_hide", nv=4, rays=22, scallop=0.55, thick=0.008), bones=spine[1:5]))
    # tail: tall crescent, upper lobe swept up and back
    tb = [V((0, -1.25, 0.04)), V((0, -1.4, 0.03)), V((0, -1.48, 0.02)), V((0, -1.4, -0.01)), V((0, -1.28, -0.03))]
    te = [V((0, -1.5, 0.35)), V((0, -1.95, 0.62)), V((0, -1.62, 0.04)), V((0, -1.78, -0.3)), V((0, -1.45, -0.22))]
    parts.append(Part(fin("fluke", tb, te, "chorus_fin", nv=7, rays=12, corr=0.002, thick=0.012), bones=spine[-2:]))
    body_o = assemble("chorus_body", sk, parts)
    name = "fauna_chorus_juv.glb" if J else "fauna_chorus.glb"
    arm = finish_creature(root, sk, body_o, os.path.join(kit.out_dir(), name), props={"creature": "chorus", "length": 1.9 if J else 3.0}, ao=0.3)
    return root, arm


def stalker_juv():
    return stalker(juvenile=True)


def chorus_juv():
    return chorus(juvenile=True)


# ================================================================================================ abyssal cathedral (image 10)
def cathedral(juvenile=False):
    """15 m long, 24 m span (calf: same build, juvenile proportions, scaled in game); origin at the body centre.
    A filter feeder: a great translucent dome of a head sculpted by bony arches round oval cavities, pale spots;
    a wide gape full of tall lattice filter plates in a fan; a sagging pleated throat pouch with lines of cyan light;
    manta wings with feathery iridescent rays and a frilled trailing edge; a long tapering tail."""
    kit.reset()
    root = empty("AbyssalCathedral")
    rng = random.Random(81)
    J = juvenile
    sk = Skeleton()
    sk.add("body", (0, -3.5, 0), (0, 3.5, 0))
    sk.add("jaw", (0, 2.2, -0.6), (0, 7.0, -1.4), "body")
    tail = sk.chain("tail", [(0, -3.5, 0), (0, -5.3, 0.1), (0, -7.0, 0.2), (0, -8.4, 0.25)], "body")
    for sx, s in ((-1, "L"), (1, "R")):
        sk.add(f"wing{s}1", (sx * 2.4, 0.5, 0), (sx * 7.0, -1.5, -0.3), "body")
        sk.add(f"wing{s}2", (sx * 7.0, -1.5, -0.3), (sx * 12.0, -4.2, -0.9), f"wing{s}1")
    parts = []
    hk = 1.15 if J else 1.0  # calves: relatively bigger head
    body = Surf([
        (-8.7, 0.04, 0.08, 0.08, 0.25, 2.0),
        (-7.3, 0.3, 0.32, 0.28, 0.2, 2.1),
        (-5.0, 0.85, 0.68, 0.58, 0.1, 2.2),
        (-2.5, 1.85, 1.1, 0.92, 0.0, 2.4),
        (0.5, 2.45, 1.45 * hk, 1.2, 0.0, 2.5),
        (3.0, 2.6 * hk, 1.75 * hk, 1.0, 0.1, 2.6),
        (4.8, 2.6 * hk, 1.9 * hk, 0.62, 0.35, 2.7),
        (6.0, 2.35 * hk, 1.65 * hk, 0.38, 0.5, 2.9),
        (6.8, 1.9 * hk, 1.2 * hk, 0.26, 0.6, 2.8),
        (7.25, 1.15 * hk, 0.62 * hk, 0.18, 0.62, 2.5),
        (7.42, 0.3, 0.2, 0.1, 0.62, 2.0),
    ])
    # cranial cavities: (t, a, half-size t, half-size a, depth)
    # big swept side cavities from above the mouth corners back over the cheeks, a pair of deep temporal ovals on
    # top, a smaller pair forward between them
    cav = [(0.84, PI / 2 + 1.05, 0.075, 0.32, 0.32), (0.84, PI / 2 - 1.05, 0.075, 0.32, 0.32),
           (0.8, PI / 2 + 0.38, 0.05, 0.24, 0.26), (0.8, PI / 2 - 0.38, 0.05, 0.24, 0.26),
           (0.91, PI / 2 + 0.42, 0.028, 0.2, 0.14), (0.91, PI / 2 - 0.42, 0.028, 0.2, 0.14)]

    def cav_field(t, a):
        best = 9.0
        dep = 0.0
        for (tc, ac, ht, ha, dp) in cav:
            r = math.hypot((t - tc) / ht, (a - ac) / ha)
            if r < best:
                best, dep = r, dp
        return best, dep

    def disp(t, a):
        sn = math.sin(a)
        d = 0.0
        r, dp = cav_field(t, a)
        # hollow oval cavities with raised bony rims (the arches between them)
        d -= dp * max(0.0, 1 - r * r) ** 1.5
        d += 0.14 * math.exp(-((r - 1.1) / 0.18) ** 2)
        # a median arch over the dome
        d += 0.12 * math.exp(-((a - PI / 2) / 0.06) ** 2) * sstep(0.68, 0.75, t) * (1 - sstep(0.94, 0.99, t))
        # dorsal ridge down the back and tail
        d += 0.05 * math.exp(-((a - PI / 2) / 0.05) ** 2) * (1 - sstep(0.6, 0.7, t))
        return d

    def mat_fn(t, a):
        r, dp = cav_field(t, a)
        if r < 0.85:
            return 2
        if t > 0.8 and math.sin(a) < -0.5:
            return 3  # palate
        return 0
    parts.append(Part(body.mesh("body", 140, 64, ("cath_hide", "cath_belly", "cath_cavity", "maw_gullet"), disp=disp, mat_fn=mat_fn), bones=["body"] + tail))

    # throat pouch / lower jaw: sagging, pleated underneath, lines of cyan light along the pleats
    jaw = Surf([
        (1.4, 2.0, 0.3, 1.05, -0.95, 2.4),
        (3.4, 2.45 * hk, 0.3, 1.45, -1.2, 2.6),
        (5.2, 2.35 * hk, 0.26, 1.3, -1.3, 2.6),
        (6.5, 1.85 * hk, 0.22, 0.95, -1.3, 2.5),
        (7.15, 1.0 * hk, 0.16, 0.5, -1.25, 2.3),
        (7.35, 0.25, 0.08, 0.15, -1.22, 2.0),
    ])
    NP = 9

    def pleat(t, a):
        sn, cs = math.sin(a), math.cos(a)
        if sn > -0.15:
            return 0.0, 0.0
        u = math.atan2(cs, -sn)  # -pi/2..pi/2 across the throat
        ph = (u / (PI / 2) * NP * 0.5 + 0.5 * (1 - t)) % 1.0
        return ph, u

    def jaw_disp(t, a):
        sn = math.sin(a)
        d = -0.35 * max(0.0, sn - 0.35) * sstep(0.1, 0.35, t) * (1 - sstep(0.9, 1.0, t))
        if sn < -0.15:
            ph, u = pleat(t, a)
            d -= 0.06 * math.exp(-((ph - 0.5) / 0.08) ** 2) * min(1.0, -sn * 2)
        return d

    def jaw_mat(t, a):
        sn = math.sin(a)
        if sn > 0.6 and t > 0.08:
            return 1
        return 2 if sn < -0.2 else 0
    parts.append(Part(jaw.mesh("jawm", 70, 56, ("cath_hide", "maw_gullet", "cath_belly"), disp=jaw_disp, mat_fn=jaw_mat), bone="jaw"))
    glow = []
    for k in range(-NP // 2, NP // 2 + 1):
        for q in range(18):
            t = 0.12 + 0.82 * q / 17
            u = (k / (NP * 0.5) - (0.5 * (1 - t)) / (NP * 0.5)) * PI / 2
            if abs(u) > 1.45 or rng.random() < 0.18:
                continue
            a = math.atan2(-math.cos(u), math.sin(u))
            a = -PI / 2 + u
            p = jaw.P(t, a)
            n = jaw.N(t, a)
            g = kit.sphere(f"g{k}{q}", 0.045 * rng.uniform(0.7, 1.3), loc=tuple(p + n * 0.01), m="cath_glow", segs=6, rings=4)
            glow.append(g)
    parts.append(Part(kit.merge(glow, "glowdots"), bone="jaw"))
    parts.append(Part(kit.sphere("throat", 1.0, loc=(0, 4.6, -0.45), m="maw_gullet", segs=24, rings=12, scale=(2.1, 0.7, 1.05)), bones=["body", "jaw"]))

    # filter lamellae: tall lattice plates in a fan inside the gape, from palate to jaw floor
    lam = []
    NL = 19 if not J else 14
    for k in range(NL):
        sv = -0.95 + 1.9 * k / (NL - 1)
        ph = sv * PI / 2
        cx, cy = math.sin(ph) * 2.05 * hk, 4.6 + 2.35 * math.cos(ph) ** 0.65
        rad = V((math.sin(ph), math.cos(ph) * 0.8, 0)).normalized()
        top = 0.55 - 0.25 * abs(sv) ** 2
        bot = -1.05 + 0.15 * abs(sv) ** 2
        w = (0.6 + 0.12 * math.cos(ph)) * rng.uniform(0.85, 1.1)
        c = V((cx, cy, 0))
        f0 = c + rad * (w * 0.5)
        b0 = c - rad * (w * 0.5)
        base = [f0 + V((0, 0, top)), b0 + V((0, 0, top - 0.05))]
        edge = [f0 + V((0, 0, bot)), b0 + V((0, 0, bot + 0.05))]
        lam.append(fin(f"lam{k}", base, edge, "cath_lamella", nu=4, nv=10, rays=0, thick=0.05, ruffle=0.0, droop=-0.06))
    parts.append(Part(kit.merge(lam, "lamellae"), bones=["body", "jaw"]))
    # thick upper lip arch
    lipp = [V((math.sin(a) * 2.42 * hk, 4.0 + 3.0 * math.cos(a) ** 0.6, 0.55 + 0.12 * math.cos(a))) for a in [-PI / 2 + PI * i / 20 for i in range(21)]]
    parts.append(Part(tube("lip", lipp, [0.22 + 0.08 * math.cos(PI * (i / 20 - 0.5)) for i in range(21)], "cath_hide", seg=12), bone="body"))
    # small eyes high at the mouth corners
    for sx in (-1, 1):
        parts.append(Part(eye(f"eye{sx}", V((sx * 2.35 * hk, 5.6, 0.75)), V((sx, 0.5, 0.15)), 0.11 * (1.3 if J else 1.0), "crown_eye", cornea_m="cornea", pupil=(0.6, 0.6)), bone="body"))

    # wings: broad manta pectorals, feathery rays (fine corrugation + ray lines), frilled trailing edge
    for sx, s in ((-1, "L"), (1, "R")):
        base = [V((sx * 2.1, 4.4, 0.05)), V((sx * 2.4, 2.4, 0.0)), V((sx * 2.4, 0.4, -0.05)), V((sx * 2.2, -1.6, -0.05)), V((sx * 1.8, -3.2, 0.0))]
        edge = []
        for i in range(5):
            u = i / 4
            # leading edge sweeps out to the tip, then the trailing edge curves back in
            tip_x = 12.0 * (1 - 0.82 * u ** 1.4)
            edge.append(V((sx * (2.2 + tip_x), 3.2 - 7.6 * u ** 0.9 - 1.6 * math.sin(PI * u), -0.9 * (1 - u) ** 2)))
        w = fin(f"wing{s}", base, edge, "cath_wing", nu=161, nv=18, rays=44, corr=0.006, scallop=0.01, ruffle=0.06, ruffle_f=5.0,
                thick=0.14, droop=0.4, rays_m="cath_ray", ray_r=0.03, ray_taper=0.25, up=(0, 0, 1))
        parts.append(Part(w, bones=["body", f"wing{s}1", f"wing{s}2"]))
    # tail fluke (horizontal: the tail beats up and down)
    for sx in (-1, 1):
        fb = [V((0, -7.6, 0.22)), V((0, -8.6, 0.25))]
        fe = [V((sx * 1.9, -8.7, 0.2)), V((sx * 0.4, -9.4, 0.25))]
        parts.append(Part(fin(f"fluke{sx}", fb, fe, "cath_wing", nv=6, rays=10, corr=0.01, thick=0.08), bone=tail[-1]))
    body_o = assemble("cathedral_body", sk, parts)
    name = "fauna_cathedral_calf.glb" if J else "fauna_cathedral.glb"
    arm = finish_creature(root, sk, body_o, os.path.join(kit.out_dir(), name), props={"creature": "cathedral", "length": 15.0}, ao=1.6)
    return root, arm


def cathedral_calf():
    return cathedral(juvenile=True)


# ================================================================================================ luminous siren (image 2)
def siren():
    """1.1 m; swimming, origin at the body centre. Eel-like and glass-clear: the dark mottled organ mass shows through;
    a long head with an underslung jaw of fine needles and a large eye; a clear filament arching from the crown to a
    teardrop light hanging before the mouth; fan fins with fine rays and ragged edges (a sail behind the head, a
    second dorsal, pectorals, big pelvics, an anal fin) and a broad flowing ruffled tail."""
    kit.reset()
    root = empty("LuminousSiren")
    rng = random.Random(17)
    sk = Skeleton()

    def bend(t):
        return (0.03 * math.sin(TAU * 0.85 * (1 - t)) * (1 - t), 0.0)
    body = Surf([
        (-0.56, 0.003, 0.006, 0.006, 0.0, 2.0),
        (-0.46, 0.011, 0.022, 0.022, 0.0, 2.0),
        (-0.3, 0.021, 0.04, 0.04, 0.0, 2.0),
        (-0.1, 0.033, 0.055, 0.055, 0.0, 2.1),
        (0.15, 0.038, 0.06, 0.058, 0.0, 2.1),
        (0.35, 0.033, 0.048, 0.046, 0.0, 2.2),
        (0.46, 0.03, 0.042, 0.038, 0.0, 2.3),
        (0.54, 0.032, 0.044, 0.03, 0.006, 2.4),
        (0.61, 0.028, 0.036, 0.021, 0.007, 2.5),
        (0.67, 0.017, 0.022, 0.013, 0.005, 2.3),
        (0.705, 0.004, 0.006, 0.004, 0.003, 2.0),
    ], bend=bend)
    spts = []
    for k in range(7):
        t = 0.93 - 0.88 * k / 6
        y = body.sec(t)[0]
        dx, dz = bend(t)
        spts.append((dx, y, dz))
    spine = sk.chain("sp", spts, None)
    parts = []

    def ycoord(t):
        return body.sec(t)[0]
    head_t = 0.8
    parts.append(Part(body.mesh("glass", 120, 22, ("siren_glass", "siren_head"),
                                mat_fn=lambda t, a: 1 if t > 0.82 else 0,
                                disp=lambda t, a: -0.0015 * math.exp(-((math.sin(a) - 0.05) / 0.08) ** 2) * (t < 0.8)), bones=spine))
    # the organ mass, seen through the clear body
    core = Surf([(y, w * 0.6, hu * 0.52, hd * 0.6, zc - 0.006, sq) for (y, w, hu, hd, zc, sq) in body.st[2:8]], bend=lambda t: bend(0.18 + 0.55 * t))
    parts.append(Part(core.mesh("core", 60, 14, ("siren_core",)), bones=spine))
    # lower jaw protruding a little, needle teeth on both jaws
    jaw = Surf([(0.55, 0.022, 0.006, 0.012, -0.016, 2.2), (0.62, 0.019, 0.005, 0.01, -0.016, 2.3), (0.69, 0.011, 0.004, 0.007, -0.014, 2.2), (0.72, 0.003, 0.002, 0.003, -0.012, 2.0)],
               bend=lambda t: bend(0.85 + 0.15 * t))
    parts.append(Part(jaw.mesh("jaw", 30, 14, ("siren_head",)), bone=spine[0]))
    teeth = []
    hx = bend(0.95)[0]
    for sx in (-1, 1):
        for k in range(9):
            y = 0.69 - 0.015 * k
            w = 0.006 + 0.0022 * k
            for (z, d) in ((-0.008, V((0, 0, -1))), (-0.012, V((0, 0, 1)))):
                L = rng.uniform(0.006, 0.013) * (1.4 if k < 2 else 1.0)
                teeth.append(fang(f"t{sx}{k}{z}", V((hx + sx * w, y, z)), d + V((sx * 0.25, 0.3, 0)), V((0, -1, 0)), L, 0.0011, curve=0.25, m="crown_tooth", seg=4, n=4))
    parts.append(Part(kit.merge(teeth, "teeth"), bone=spine[0]))
    for sx in (-1, 1):
        pe = body.P(0.9, PI / 2 - sx * 1.05)
        parts.append(Part(eye(f"eye{sx}", pe, V((sx, 0.25, 0.15)), 0.0115, "siren_eye", cornea_m="cornea", pupil=(0.55, 0.55)), bone=spine[0]))
    # lure: a clear filament arching from the crown, the light hanging before the face (tip at y 0.8, z 0.09)
    h = V((hx, 0.6, 0.035))
    ctrl = [h, h + V((0, -0.035, 0.1)), h + V((0, 0.02, 0.21)), h + V((0, 0.12, 0.23)), h + V((0, 0.195, 0.16)), V((0, 0.8, 0.105))]
    lp = [smooth_lerp(ctrl, (len(ctrl) - 1) * i / 30) for i in range(31)]
    lure = sk.chain("lu", [tuple(c) for c in ctrl[::2]] + [tuple(ctrl[-1])], spine[0])
    parts.append(Part(tube("stalk", lp, [0.0035 - 0.0015 * i / 30 for i in range(31)], "siren_fin", seg=6), bones=lure))
    bulb = tube("bulb", [V((0, 0.8, 0.105)), V((0, 0.8, 0.09)), V((0, 0.8, 0.075)), V((0, 0.8, 0.062))], [0.004, 0.011, 0.012, 0.004], "siren_lure", seg=12)
    parts.append(Part(bulb, bone=lure[-1]))

    def side(t, a, off=0.0):
        return body.P(t, a) + body.N(t, a) * off

    def fanfin(name, t0, t1, a, span_fn, m="siren_fin", rays=10, scallop=0.12, ruffle=0.004, bones=None, bone=None, nv=8, up=None, out=None):
        base = [side(t0 + (t1 - t0) * k / 5, a, -0.002) for k in range(6)]
        edge = [b + span_fn(k / 5) for k, b in enumerate(base)]
        o = fin(name, base, edge, m, nv=nv, rays=rays, corr=0.0015, scallop=scallop, ruffle=ruffle, ruffle_f=rays * 0.4, thick=0.0012,
                rays_m="siren_ray", ray_r=0.0009, ray_taper=0.4, up=up)
        parts.append(Part(o, bones=bones, bone=bone))
    # sail behind the head, a second dorsal mid-body
    fanfin("sail", 0.82, 0.7, PI / 2, lambda u: V((0, -0.06 - 0.05 * u, 0.12 * math.sin(PI * (0.15 + 0.8 * u)) + 0.02)), rays=11, bones=spine[0:3])
    fanfin("dors2", 0.6, 0.45, PI / 2, lambda u: V((0, -0.05 - 0.03 * u, 0.07 * math.sin(PI * (0.1 + 0.85 * u)) + 0.01)), rays=8, bones=spine[2:4])
    fanfin("anal", 0.4, 0.22, -PI / 2, lambda u: V((0, -0.05, -0.08 * math.sin(PI * (0.1 + 0.85 * u)) - 0.01)), rays=9, bones=spine[3:5])
    def arc_fin(name, t, a, radius, ang0, ang1, tilt, sx, rays, bones):
        # a true fan: rays radiate from a short root to an arc (angles from straight back, toward the side)
        root = side(t, a, -0.002)
        base, edge = [], []
        for k in range(9):
            u = k / 8
            ang = ang0 + (ang1 - ang0) * u
            d = V((sx * math.sin(ang), -math.cos(ang), 0))
            d = (d + V((0, 0, -tilt))).normalized()
            base.append(root + d * 0.006 + V((0, 0.004 * (0.5 - u), 0)))
            edge.append(root + d * radius * (0.85 + 0.15 * math.sin(PI * u)))
        o = fin(name, base, edge, "siren_fin", nv=9, rays=rays, corr=0.0015, scallop=0.14, ruffle=0.006, ruffle_f=rays * 0.4, thick=0.0012,
                rays_m="siren_ray", ray_r=0.0009, ray_taper=0.4, up=(0, 0, 1))
        parts.append(Part(o, bones=bones))
    for sx, s in ((-1, "L"), (1, "R")):
        a = (PI / 2 - sx * PI / 2) - sx * 0.35
        arc_fin(f"pec{s}", 0.8, a, 0.15, 0.25, 1.35, 0.35, sx, 12, spine[0:2])
        arc_fin(f"pel{s}", 0.6, a - sx * 0.6, 0.19, 0.2, 1.2, 0.6, sx, 13, spine[2:4])
    # the tail: broad, flowing, ruffled
    tb = [side(0.02 + 0.1 * (1 - k / 6), PI / 2 if k < 3 else -PI / 2, 0.0) for k in range(7)]
    tb = [side(0.12, PI / 2), side(0.08, PI / 2), side(0.04, PI / 2), side(0.0, 0.0), side(0.04, -PI / 2), side(0.08, -PI / 2), side(0.12, -PI / 2)]
    tail_end = body.P(0.0, 0.0)
    te = [tail_end + V((0.0, -0.08, 0.27)), tail_end + V((0.01, -0.3, 0.25)), tail_end + V((0.02, -0.42, 0.12)), tail_end + V((0.02, -0.38, 0.0)),
          tail_end + V((0.02, -0.42, -0.12)), tail_end + V((0.01, -0.3, -0.25)), tail_end + V((0.0, -0.08, -0.27))]
    tl = fin("tail", tb, te, "siren_fin", nv=12, rays=22, corr=0.002, scallop=0.08, ruffle=0.018, ruffle_f=6.0, thick=0.0012,
             rays_m="siren_ray", ray_r=0.001, ray_taper=0.35)
    parts.append(Part(tl, bones=spine[-2:]))
    body_o = assemble("siren_body", sk, parts)
    arm = finish_creature(root, sk, body_o, os.path.join(kit.out_dir(), "fauna_siren.glb"), props={"creature": "siren", "length": 1.1}, ao=0.06)
    return root, arm


# ================================================================================================ prey (instanced)
def _export_static(root, body, path, props):
    body.parent = root
    kit.set_props(root, **props)
    kit.select_tree(root)
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_apply=True, export_extras=True, export_yup=True,
                              export_animations=False, export_cameras=False, export_materials="EXPORT")
    tris = sum(len(p.vertices) - 2 for p in body.data.polygons)
    print(f"[creature] {path} ~{tris} tris, {os.path.getsize(path) / 1e6:.3f} MB")


def prey_dart():
    """0.12 m schooling dart fish (the Chorus Hunters' prey): fusiform, silver flanks, dark back, forked tail"""
    kit.reset()
    root = empty("PreyDart")
    b = Surf([(-0.06, 0.002, 0.003, 0.003, 0.0, 2.0), (-0.045, 0.004, 0.006, 0.006, 0.0, 2.0), (-0.02, 0.008, 0.013, 0.012, 0.0, 2.1),
              (0.01, 0.01, 0.016, 0.014, 0.0, 2.2), (0.035, 0.009, 0.013, 0.011, 0.0, 2.2), (0.052, 0.005, 0.007, 0.006, -0.001, 2.1), (0.06, 0.001, 0.002, 0.002, -0.001, 2.0)])
    parts = [b.mesh("body", 30, 12, ("prey_silver", "prey_back"), mat_fn=lambda t, a: 1 if math.sin(a) > 0.45 else 0)]
    tb = [V((0, -0.055, 0.002)), V((0, -0.058, 0.0)), V((0, -0.055, -0.002))]
    te = [V((0, -0.075, 0.016)), V((0, -0.066, 0.0)), V((0, -0.075, -0.016))]
    parts.append(fin("tail", tb, te, "prey_fin", nv=4, rays=6, thick=0.0006))
    parts.append(fin("dors", [V((0, 0.015, 0.014)), V((0, -0.01, 0.012))], [V((0, 0.0, 0.026)), V((0, -0.016, 0.014))], "prey_fin", nv=3, rays=4, thick=0.0005))
    for sx in (-1, 1):
        parts.append(kit.sphere(f"eye{sx}", 0.0028, loc=(sx * 0.0055, 0.045, 0.003), m="mimic_pupil", segs=8, rings=5))
    body = kit.merge(parts, "dart")
    _export_static(root, body, os.path.join(kit.out_dir(), "fauna_prey_dart.glb"), {"creature": "prey_dart", "length": 0.12})
    return root, None


def prey_shrimp():
    """0.04 m lantern shrimp (drawn to the Siren's light): curled segmented body, a light organ, antennae, legs"""
    kit.reset()
    root = empty("PreyShrimp")

    def bend(t):
        return (0.0, -0.006 * math.sin(PI * t) - 0.004 * (1 - t) ** 2)
    b = Surf([(-0.02, 0.0015, 0.002, 0.002, 0.0, 2.0), (-0.014, 0.003, 0.003, 0.003, 0.0, 2.0), (-0.004, 0.0045, 0.005, 0.004, 0.0, 2.1),
              (0.008, 0.005, 0.006, 0.005, 0.0, 2.2), (0.016, 0.004, 0.005, 0.004, 0.0, 2.1), (0.021, 0.001, 0.0015, 0.0015, 0.0, 2.0)], bend=bend)
    parts = [b.mesh("body", 24, 10, ("prey_shrimp",), disp=lambda t, a: 0.0004 * max(0.0, math.sin(t * 60)))]
    tb = [V((0, -0.019, -0.004)), V((0, -0.02, -0.0045))]
    parts.append(fin("tail", tb, [V((0.004, -0.026, -0.006)), V((-0.004, -0.026, -0.006))], "prey_fin", nv=3, rays=4, thick=0.0004))
    parts.append(kit.sphere("light", 0.0016, loc=(0, 0.004, -0.004), m="prey_glow", segs=8, rings=5))
    for sx in (-1, 1):
        parts.append(kit.sphere(f"eye{sx}", 0.0012, loc=(sx * 0.0025, 0.02, 0.002), m="mimic_pupil", segs=6, rings=4))
        parts.append(tube(f"ant{sx}", [V((sx * 0.001, 0.021, 0.001)), V((sx * 0.006, 0.035, 0.006)), V((sx * 0.012, 0.045, 0.004))], [0.0003, 0.0002, 0.0001], "prey_shrimp", seg=3))
        for k in range(5):
            y = 0.012 - 0.005 * k
            parts.append(tube(f"leg{sx}{k}", [V((sx * 0.002, y, -0.003)), V((sx * 0.004, y - 0.001, -0.007)), V((sx * 0.0045, y - 0.002, -0.01))], [0.0003, 0.00025, 0.0001], "prey_shrimp", seg=3))
    body = kit.merge(parts, "shrimp")
    _export_static(root, body, os.path.join(kit.out_dir(), "fauna_prey_shrimp.glb"), {"creature": "prey_shrimp", "length": 0.04})
    return root, None


def prey_krill():
    """0.02 m krill (the Cathedral's plankton swarms): translucent pink, black eyes"""
    kit.reset()
    root = empty("PreyKrill")
    b = Surf([(-0.01, 0.0008, 0.001, 0.001, 0.0, 2.0), (-0.004, 0.0018, 0.002, 0.0018, 0.0, 2.0), (0.004, 0.0022, 0.0025, 0.002, 0.0, 2.1), (0.01, 0.0008, 0.001, 0.001, 0.0, 2.0)],
             bend=lambda t: (0.0, -0.0015 * math.sin(PI * t)))
    parts = [b.mesh("body", 12, 8, ("prey_krill",))]
    for sx in (-1, 1):
        parts.append(kit.sphere(f"eye{sx}", 0.0008, loc=(sx * 0.0012, 0.008, 0.0005), m="mimic_pupil", segs=6, rings=4))
    body = kit.merge(parts, "krill")
    _export_static(root, body, os.path.join(kit.out_dir(), "fauna_prey_krill.glb"), {"creature": "prey_krill", "length": 0.02})
    return root, None


if __name__ == "__main__":
    which = [a for a in sys.argv[1:] if not a.startswith("--")] or ["crown"]
    prev = "--nopreview" not in sys.argv
    for w in which:
        root, arm = globals()[w]()
        if not prev:
            continue
        if w == "crown":
            pose(arm, {"jaw": (-0.3, 0, 0)})
            preview_pose("fauna_crown", (1.8, 11.5, 2.6), (0, 3.6, 0.1), lens=32, world=(0.15, 0.22, 0.26), sun=(0.3, 0.5, 0.8))
            preview_pose("fauna_crown_side", (11, 4.0, 1.5), (0, 0.4, 0), lens=30, world=(0.15, 0.22, 0.26), sun=(0.3, 0.5, 0.8))
        elif w in ("chorus", "chorus_juv"):
            preview_pose(f"fauna_{w}", (1.3, 2.2, 0.3), (0, 0.4, -0.05), lens=32, world=(0.2, 0.3, 0.35), sun=(0.3, 0.5, 0.8))
            preview_pose(f"fauna_{w}_side", (3.6, 0.0, 0.2), (0, 0.0, 0.0), lens=35, world=(0.2, 0.3, 0.35), sun=(0.3, 0.5, 0.8))
        elif w in ("cathedral", "cathedral_calf"):
            pose(arm, {"jaw": (-0.12, 0, 0)})
            preview_pose(f"fauna_{w}", (7.5, 24, 3.5), (0, 4.0, -0.2), lens=30, world=(0.2, 0.3, 0.38), sun=(0.3, 0.5, 0.8))
            preview_pose(f"fauna_{w}_top", (16, -10, 22), (0, -1.0, 0), lens=30, world=(0.2, 0.3, 0.38), sun=(0.3, 0.5, 0.8))
        elif w == "siren":
            preview_pose("fauna_siren", (1.0, 1.15, 0.35), (0, 0.1, 0.02), lens=38, world=(0.08, 0.12, 0.14), sun=(0.3, 0.5, 0.8))
            preview_pose("fauna_siren_side", (1.9, 0.1, 0.1), (0, 0.1, 0.02), lens=40, world=(0.08, 0.12, 0.14), sun=(0.3, 0.5, 0.8))
        elif w == "stalker":
            pose(arm, {"jaw": (-0.3, 0, 0)})
            preview_pose("fauna_abyssstalker", (3.2, 5.6, 1.1), (0, 1.4, -0.1), lens=35, world=(0.2, 0.3, 0.35), sun=(0.3, 0.5, 0.8))
            preview_pose("fauna_abyssstalker_top", (4.5, -1.0, 6.5), (0, -0.2, 0), lens=30, world=(0.2, 0.3, 0.35), sun=(0.3, 0.5, 0.8))
