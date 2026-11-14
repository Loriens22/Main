"""
Mars & Jupiter: Speculative Evolution — the nine Jupiter species of the player's 3×3 reference sheet (916), in its
panel order (jupiter_panel_01 … 09). Own geometry built from the concept art (no copies), at the SIMULATION size of
data/speciesExpansion.ts (Creative's heroic option scales them up at runtime):
  stormskimmer  01  24 m span: a near-black indigo keel with a long needle snout, immense swept violet membrane wings
                    ribbed with bright cobalt veins, a narrow forked trailing section
  skyjelly      02  6 m bell: a translucent violet-blue umbrella with radial ribs, a warm pink core, a fringe of long
                    filament tentacles and frilled oral arms
  stormbeast    03  38 m: a rust-brown ribbed serpent with a gaping maw of hooked teeth and trailing membrane sheets
  colony        04  one 3 m unit of the Floating Colony: a porous dark-orange module with ember pits, hanging threads
                    and satellite blobs (the colony is thousands of these, instanced — never one rigid body)
  voltdrifter   05  8 m: a blue-purple squid — long mantle, slender sharp fins, large eyes, arms and two long tendrils
  deepdiver     06  14 m: a charcoal armoured wedge with a sharp snout, triangular plates and layered fin-wings
  gasgrazer     07  30 m: a pale whale-like grazer whose head is a huge vertical comb mouth; long trailing fringes
  aeromite      08  3 cm: a golden seed with a star of membranes (instanced by thousands)
  stormhunter   09  26 m: a red-black armoured hunter — serrated hooked beak, spines, copper-edged fin webs
Blender +Y forward, +Z up. Bone names are the contract with src/world/fauna/jupiterSheet.ts.
"""
import sys, os, math, random
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "lib"))
sys.path.insert(0, HERE)
import bpy, bmesh
from mathutils import Vector, noise
import kit
from kit import V, empty
import creature as C
from creature import Skeleton, Part, assemble, finish_creature
from organic import Surf, TubeSurf, plate, fin, tube, fang, ringed, eye, sstep, smooth_lerp
import paint_specs  # noqa: F401
from paint import PAINT
from fauna_mars_deep import foil, cellular, surf_at, surf_t, mouth_curve, export_static, bands, preview

PI, TAU = math.pi, math.tau

kit.PALETTE.update({
    "js_keel": dict(color=(0.04, 0.03, 0.07), rough=0.2),
    "js_wing": dict(color=(0.32, 0.12, 0.5), rough=0.15, alpha=0.6),
    "js_vein": dict(color=(0.2, 0.4, 0.95), rough=0.15),
    "js_eye": dict(color=(0.5, 0.75, 0.9), rough=0.03),
    "sj_bell": dict(color=(0.42, 0.32, 0.85), rough=0.08, alpha=0.4),
    "sj_core": dict(color=(0.95, 0.45, 0.55), rough=0.2),
    "sj_tent": dict(color=(0.6, 0.5, 0.95), rough=0.2),
    "sb_hide": dict(color=(0.32, 0.14, 0.07), rough=0.5),
    "sb_belly": dict(color=(0.52, 0.32, 0.2), rough=0.45),
    "sb_sheet": dict(color=(0.4, 0.2, 0.1), rough=0.4, alpha=0.75),
    "sb_mouth": dict(color=(0.35, 0.06, 0.06), rough=0.35),
    "co_body": dict(color=(0.3, 0.12, 0.05), rough=0.7),
    "co_ember": dict(color=(1.0, 0.45, 0.1), rough=0.6),
    "co_thread": dict(color=(0.35, 0.16, 0.08), rough=0.6),
    "vd_skin": dict(color=(0.16, 0.12, 0.42), rough=0.2),
    "vd_fin": dict(color=(0.3, 0.2, 0.6), rough=0.15, alpha=0.75),
    "vd_eye": dict(color=(0.05, 0.05, 0.08), rough=0.03),
    "dd_plate": dict(color=(0.07, 0.07, 0.08), rough=0.3),
    "dd_skin": dict(color=(0.12, 0.1, 0.1), rough=0.4),
    "dd_fin": dict(color=(0.1, 0.09, 0.1), rough=0.3),
    "gg_hide": dict(color=(0.75, 0.68, 0.7), rough=0.35),
    "gg_comb": dict(color=(0.82, 0.76, 0.66), rough=0.4),
    "gg_fringe": dict(color=(0.6, 0.4, 0.42), rough=0.4),
    "am_body": dict(color=(0.95, 0.7, 0.25), rough=0.3),
    "am_wing": dict(color=(1.0, 0.85, 0.45), rough=0.2, alpha=0.6),
    "sh_armor": dict(color=(0.12, 0.04, 0.04), rough=0.25),
    "sh_skin": dict(color=(0.35, 0.06, 0.05), rough=0.35),
    "sh_web": dict(color=(0.4, 0.12, 0.06), rough=0.3, alpha=0.8),
    "sh_spine": dict(color=(0.75, 0.68, 0.62), rough=0.3),
    "sh_eye": dict(color=(0.9, 0.5, 0.1), rough=0.05),
})

PAINT.update({
    # 01 near-black indigo keel with a violet sheen; translucent violet wings, cobalt veins
    "js_keel": {"base": (0.035, 0.025, 0.07), "layers": [("noise", (0.18, 0.1, 0.35), 0.5, 0.6, 0.5, 0.7), ("streak", (0.25, 0.3, 0.6), 0.35, 0.15, "y", 0.58, 0.72), ("edge", (0.35, 0.3, 0.55), 0.45), ("ao", 0.6, 1.0)],
                "relief": [("grooves", 0.003, 0.4, 0.04), ("wrinkle", 0.002, 0.3, (1, 4, 1))]},
    "js_wing": {"base": (0.3, 0.1, 0.48), "layers": [("noise", (0.45, 0.2, 0.7), 0.5, 1.2, 0.48, 0.7), ("retic", (0.15, 0.3, 0.85), 0.45, 0.9, 0.03), ("noise", (0.1, 0.05, 0.2), 0.35, 3.0, 0.55, 0.7)],
                "relief": [("veins", 0.002, 0.9, 0.03), ("wrinkle", 0.0015, 0.6)]},
    "js_vein": {"base": (0.2, 0.42, 0.95), "layers": [("noise", (0.5, 0.75, 1.0), 0.5, 0.3, 0.5, 0.7)]},
    # 02 violet-blue translucent bell, radial ribs, pink core
    "sj_bell": {"base": (0.38, 0.3, 0.82), "layers": [("noise", (0.6, 0.45, 0.95), 0.5, 0.4, 0.48, 0.7), ("retic", (0.85, 0.75, 1.0), 0.35, 0.25, 0.03), ("grad", (0.95, 0.55, 0.75), 0.5, "z", 0.5, 2.5)],
                "relief": [("veins", 0.001, 0.3, 0.04), ("wrinkle", 0.0008, 0.2)]},
    "sj_core": {"base": (0.95, 0.45, 0.55), "layers": [("noise", (1.0, 0.7, 0.5), 0.5, 0.15, 0.5, 0.7)]},
    "sj_tent": {"base": (0.55, 0.45, 0.95), "layers": [("noise", (0.9, 0.6, 0.85), 0.4, 0.2, 0.5, 0.7)]},
    # 03 rust-brown ribbed hide, paler belly, dark bands; dark red maw
    "sb_hide": {"base": (0.3, 0.12, 0.06), "layers": [("streak", (0.12, 0.05, 0.03), 0.6, 1.4, "x", 0.55, 0.7), ("noise", (0.55, 0.28, 0.12), 0.5, 0.8, 0.5, 0.68),
                ("belly", (0.55, 0.36, 0.22), 0.6), ("edge", (0.65, 0.42, 0.25), 0.45), ("cavity", (0.08, 0.03, 0.02), 0.7), ("ao", 0.7, 1.5)],
                "relief": [("grooves", 0.008, 0.9, 0.08), ("wrinkle", 0.006, 0.5, (4, 1, 1)), ("pores", 0.003, 0.2, 0.3)]},
    "sb_belly": {"base": (0.5, 0.32, 0.2), "layers": [("streak", (0.3, 0.18, 0.1), 0.4, 0.5, "x", 0.55, 0.7), ("ao", 0.6, 1.0)], "relief": [("grooves", 0.006, 0.6, 0.1)]},
    "sb_sheet": {"base": (0.38, 0.18, 0.09), "layers": [("noise", (0.6, 0.35, 0.18), 0.45, 0.8, 0.5, 0.7), ("retic", (0.2, 0.08, 0.04), 0.4, 0.5, 0.04)], "relief": [("veins", 0.002, 0.8, 0.03)]},
    "sb_mouth": {"base": (0.32, 0.05, 0.05), "layers": [("noise", (0.12, 0.02, 0.02), 0.6, 0.3, 0.45, 0.7), ("ao", 0.8, 1.0)], "relief": [("wrinkle", 0.004, 0.2)]},
    # 04 porous dark orange-brown, ember-orange in the pits
    "co_body": {"base": (0.22, 0.08, 0.035), "layers": [("noise", (0.55, 0.22, 0.06), 0.6, 0.4, 0.5, 0.68), ("cavity", (1.0, 0.42, 0.08), 0.85), ("noise", (0.05, 0.03, 0.02), 0.45, 0.15, 0.55, 0.7), ("ao", 0.6, 0.4)],
                "relief": [("vesicles", 0.01, 0.15, 0.35), ("noise", 0.01, 0.3)]},
    "co_ember": {"base": (1.0, 0.45, 0.1), "layers": [("noise", (1.0, 0.75, 0.3), 0.5, 0.1, 0.5, 0.7)]},
    "co_thread": {"base": (0.3, 0.13, 0.06), "layers": [("noise", (0.6, 0.3, 0.1), 0.4, 0.3, 0.5, 0.7)]},
    # 05 blue-purple squid, darker dorsal spots
    "vd_skin": {"base": (0.14, 0.1, 0.4), "layers": [("spots", (0.05, 0.03, 0.18), 0.6, 0.18, 0.3, 0.35), ("noise", (0.35, 0.25, 0.7), 0.45, 0.3, 0.5, 0.7), ("belly", (0.45, 0.4, 0.75), 0.5), ("edge", (0.6, 0.55, 0.9), 0.4), ("ao", 0.6, 0.5)],
                "relief": [("pores", 0.0015, 0.06, 0.3), ("wrinkle", 0.002, 0.15)]},
    "vd_fin": {"base": (0.28, 0.18, 0.58), "layers": [("noise", (0.5, 0.35, 0.85), 0.45, 0.3, 0.5, 0.7)], "relief": [("veins", 0.001, 0.3, 0.04)]},
    # 06 charcoal armour, red seams
    "dd_plate": {"base": (0.06, 0.06, 0.07), "layers": [("noise", (0.18, 0.18, 0.2), 0.5, 0.5, 0.5, 0.7), ("edge", (0.45, 0.42, 0.45), 0.55), ("cavity", (0.35, 0.06, 0.04), 0.6), ("ao", 0.7, 0.8)],
                 "relief": [("grooves", 0.003, 0.3, 0.05), ("pores", 0.002, 0.1, 0.3)]},
    "dd_skin": {"base": (0.1, 0.08, 0.08), "layers": [("noise", (0.3, 0.08, 0.06), 0.45, 0.4, 0.55, 0.7), ("ao", 0.7, 0.8)], "relief": [("wrinkle", 0.003, 0.3)]},
    "dd_fin": {"base": (0.09, 0.08, 0.09), "layers": [("retic", (0.3, 0.1, 0.08), 0.4, 0.5, 0.04), ("edge", (0.4, 0.38, 0.4), 0.5)], "relief": [("veins", 0.002, 0.6, 0.03)]},
    # 07 pale grey-pink hide with red markings; cream comb; rosy fringes
    "gg_hide": {"base": (0.7, 0.64, 0.66), "layers": [("streak", (0.55, 0.15, 0.15), 0.5, 1.5, "y", 0.6, 0.72), ("noise", (0.5, 0.45, 0.5), 0.45, 1.5, 0.5, 0.7), ("back", (0.42, 0.38, 0.42), 0.4), ("edge", (0.85, 0.8, 0.82), 0.4), ("ao", 0.7, 2.0)],
                "relief": [("wrinkle", 0.008, 1.0, (3, 1, 3)), ("pores", 0.004, 0.3, 0.3), ("grooves", 0.004, 1.2, 0.05)]},
    "gg_comb": {"base": (0.8, 0.74, 0.62), "layers": [("streak", (0.55, 0.48, 0.38), 0.5, 0.05, "z", 0.55, 0.7), ("ao", 0.7, 1.0)], "relief": [("grooves", 0.003, 0.1, 0.1)]},
    "gg_fringe": {"base": (0.6, 0.38, 0.4), "layers": [("noise", (0.8, 0.55, 0.55), 0.45, 0.5, 0.5, 0.7)]},
    # 08 gold
    "am_body": {"base": (0.95, 0.65, 0.2), "layers": [("noise", (1.0, 0.85, 0.45), 0.5, 0.005, 0.5, 0.7)]},
    "am_wing": {"base": (1.0, 0.82, 0.4), "layers": []},
    # 09 red-black armour, crimson skin, pale spines, copper web edges
    "sh_armor": {"base": (0.1, 0.03, 0.03), "layers": [("noise", (0.4, 0.06, 0.04), 0.55, 0.5, 0.52, 0.68), ("edge", (0.7, 0.35, 0.2), 0.55), ("cavity", (0.02, 0.01, 0.01), 0.7), ("ao", 0.7, 0.8)],
                 "relief": [("grooves", 0.004, 0.3, 0.05), ("scales", 0.003, 0.15)]},
    "sh_skin": {"base": (0.32, 0.05, 0.04), "layers": [("noise", (0.6, 0.12, 0.06), 0.5, 0.4, 0.5, 0.7), ("noise", (0.08, 0.02, 0.02), 0.4, 0.2, 0.55, 0.7), ("ao", 0.7, 0.8)],
                "relief": [("scales", 0.003, 0.12), ("wrinkle", 0.003, 0.3)]},
    "sh_web": {"base": (0.38, 0.1, 0.05), "layers": [("retic", (0.15, 0.03, 0.02), 0.5, 0.6, 0.03), ("edge", (0.85, 0.5, 0.25), 0.7)], "relief": [("veins", 0.002, 0.6, 0.03)]},
    "sh_spine": {"base": (0.72, 0.65, 0.58), "layers": [("grad", (0.15, 0.05, 0.04), 0.6, "z", 0.0, -2.0)]},
})


def swept_edge(u, sx, span, chord, sweep, tip_up):
    """a swept wing outline: u 0 leading root → 0.55 tip → 1 trailing root"""
    if u <= 0.55:
        s = u / 0.55
        x = span * (0.04 + 0.96 * s)
        y = chord * 0.5 + chord * 0.15 * math.sin(PI * s * 0.7) - sweep * s ** 1.6
        z = tip_up * s ** 3
    else:
        s = (u - 0.55) / 0.45
        x = span * (1 - 0.96 * s ** 0.8)
        y = chord * 0.5 - sweep - (chord * 0.4) * math.sin(PI * s) * 0.5 - chord * s
        z = tip_up * (1 - s) ** 3
    return V((sx * x, y, z))


# ================================================================================================ 01 Stormskimmer
def stormskimmer():
    kit.reset()
    root = empty("Stormskimmer")
    rng = random.Random(1601)
    sk = Skeleton()
    sk.add("body", (0, -3.5, 0), (0, 2.5, 0))
    sk.add("head", (0, 2.5, 0), (0, 5.5, 0.1), "body")
    for sx, s in ((-1, "L"), (1, "R")):
        sk.add(f"wing{s}1", (sx * 0.8, 0.5, 0), (sx * 6.0, -1.0, 0.3), "body")
        sk.add(f"wing{s}2", (sx * 6.0, -1.0, 0.3), (sx * 12.0, -5.0, 1.4), f"wing{s}1")
        sk.chain(f"tail{s}", [(sx * 0.25, -3.6, 0), (sx * 0.7, -6.0, 0.05), (sx * 1.2, -8.6, 0.1), (sx * 1.6, -11.0, 0.15)], "body")
    parts = []
    body = Surf([(-3.8, 0.15, 0.12, 0.1, 0.0, 2.0), (-2.5, 0.65, 0.42, 0.32, 0.0, 2.2), (0.0, 0.95, 0.6, 0.42, 0.0, 2.4), (2.0, 0.75, 0.5, 0.36, 0.0, 2.4),
                 (3.2, 0.42, 0.34, 0.26, 0.02, 2.3), (4.4, 0.18, 0.16, 0.13, 0.05, 2.1), (5.7, 0.04, 0.05, 0.04, 0.08, 2.0)])

    def bdisp(t, a):
        return 0.04 * math.exp(-((a - PI / 2) / 0.12) ** 2) * sstep(0.1, 0.6, t) + 0.01 * noise.noise(body.P(t, a) * 1.5)
    parts.append(Part(body.mesh("body", 70, 32, ("js_keel",), disp=bdisp), bones=["body", "head"]))
    hd = []
    for sx in (-1, 1):
        p, n = surf_at(body, 3.0, PI / 2 - sx * 1.1, -0.03)
        hd.append(eye(f"eye{sx}", p, n + V((0, 0.4, 0)), 0.14, "js_eye", cornea_m="cornea", pupil=(0.35, 0.35)))
        for k in range(3):   # small recessed sensory nodes along the snout
            p, n = surf_at(body, 3.6 + 0.35 * k, PI / 2 - sx * 0.8, -0.01)
            hd.append(kit.sphere(f"nd{sx}{k}", 0.05, loc=tuple(p), m="js_vein", segs=8, rings=4))
    parts.append(Part(kit.merge(hd, "headdet"), bone="head"))
    for sx, s in ((-1, "L"), (1, "R")):
        n = 25
        us = [k / (n - 1) for k in range(n)]
        edge = [swept_edge(u, sx, 12.0, 5.0, 6.5, 1.5) for u in us]
        base = [V((sx * (0.7 + 0.2 * math.sin(PI * u)), 2.4 - 5.6 * u, 0.0)) for u in us]
        w = fin(f"wing{s}", base, edge, "js_wing", nv=10, rays=18, corr=0.06, scallop=0.02, ruffle=0.12, ruffle_f=5, thick=0.03,
                rays_m="js_vein", ray_r=0.05, ray_taper=0.2, up=(0, 0, 1))
        parts.append(Part(w, bones=["body", f"wing{s}1", f"wing{s}2"]))
        # the forked trailing section: two narrow finned streamers
        tp = [V(sk.seg(f"tail{s}{i}")[0]) for i in (1, 2, 3)] + [V(sk.seg(f"tail{s}3")[1])]
        tl = [ringed(f"tl{s}", tp, lambda t: 0.16 * (1 - t) + 0.02, "js_keel", rings=14, groove=0.1, seg=8, samples=50)]
        tb = [smooth_lerp(tp, 3 * k / 8) for k in range(9)]
        te = [b + V((sx * 0.25 * math.sin(PI * k / 8), 0, 0)) for k, b in enumerate(tb)]
        tl.append(fin(f"tf{s}", tb, te, "js_wing", nv=3, rays=8, thick=0.02, rays_m="js_vein", ray_r=0.02))
        parts.append(Part(kit.merge(tl, f"tail{s}"), bones=[f"tail{s}1", f"tail{s}2", f"tail{s}3"]))
    body_o = assemble("stormskimmer_body", sk, parts)
    arm = finish_creature(root, sk, body_o, os.path.join(kit.out_dir(), "jup_stormskimmer.glb"), props={"creature": "stormskimmer", "span": 24}, ao=1.2, paint=2048)
    return root, arm


# ================================================================================================ 02 Skyjelly
def skyjelly():
    kit.reset()
    root = empty("Skyjelly")
    rng = random.Random(1602)
    sk = Skeleton()
    sk.add("bell", (0, 0, 0), (0, 0, 2.6))
    R = 3.0
    parts = []
    # the bell: a lathe with radial ribs and a scalloped rim
    bm = bmesh.new()
    nr, na = 28, 72
    rows = []
    for i in range(nr + 1):
        t = i / nr
        th = t * PI * 0.56
        row = []
        for j in range(na):
            a = TAU * j / na
            rib = 1 + 0.035 * max(0.0, math.cos(a * 12)) ** 6 * math.sin(PI * min(1.0, t * 1.4))
            scal = 1 - 0.06 * max(0.0, math.cos(a * 24 + PI)) ** 2 * t ** 8
            rr = R * math.sin(th) * rib * scal
            z = 2.4 * math.cos(th) - 0.15 * t ** 6
            row.append(bm.verts.new((math.cos(a) * rr, math.sin(a) * rr, z)))
        rows.append(row)
    for i in range(nr):
        for j in range(na):
            bm.faces.new((rows[i][j], rows[i + 1][j], rows[i + 1][(j + 1) % na], rows[i][(j + 1) % na]))
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bell = kit.from_bmesh("bell", bm, ("sj_bell",))
    kit.add_solidify(bell, 0.04, -1.0)
    kit.bake(bell)
    kit.smooth(bell, 60)
    parts.append(Part(bell, bone="bell"))
    parts.append(Part(kit.sphere("core", 1.0, loc=(0, 0, 1.1), m="sj_core", segs=20, rings=12, scale=(1.3, 1.3, 0.7)), bone="bell"))
    # tentacles: 8 bundles off the rim, each a 4-bone chain; oral arms from the centre
    for b in range(8):
        a0 = TAU * b / 8
        pts = [(math.cos(a0) * R * 0.95, math.sin(a0) * R * 0.95, -0.2 - 4.0 * k) for k in range(5)]
        ch = sk.chain(f"tent{b}", pts, "bell")
        tents = []
        for k in range(5):
            a = a0 + (k - 2) * 0.12
            base = V((math.cos(a) * R * 0.97, math.sin(a) * R * 0.97, -0.1))
            L = rng.uniform(12, 18)
            path = [base + V((math.cos(a) * 0.5 * math.sin(PI * q / 10), math.sin(a) * 0.5 * math.sin(PI * q / 10), -L * q / 10)) for q in range(11)]
            tents.append(tube(f"t{b}{k}", path, [0.045 * (1 - 0.85 * q / 10) + 0.005 for q in range(11)], "sj_tent", seg=5))
        parts.append(Part(kit.merge(tents, f"tents{b}"), bones=ch))
    for k in range(4):
        a = TAU * k / 4 + 0.4
        base = [V((math.cos(a) * 0.3, math.sin(a) * 0.3, 0.6 - 0.8 * q)) for q in range(8)]
        edge = [b + V((math.cos(a + 0.8) * 0.7, math.sin(a + 0.8) * 0.7, 0)) for b in base]
        parts.append(Part(fin(f"arm{k}", base, edge, "sj_core", nv=4, rays=12, ruffle=0.18, ruffle_f=6, thick=0.02), bones=["bell"] + sk.chain(f"oral{k}", [(0, 0, 0.6), (0, 0, -2.0), (0, 0, -5.0)], "bell")))
    body = assemble("skyjelly_body", sk, parts)
    arm = finish_creature(root, sk, body, os.path.join(kit.out_dir(), "jup_skyjelly.glb"), props={"creature": "skyjelly", "bell": 6}, ao=0.6, paint=2048, nsize=1024)
    return root, arm


# ================================================================================================ 03 Stormbeast
def stormbeast():
    kit.reset()
    root = empty("Stormbeast")
    rng = random.Random(1603)
    sk = Skeleton()
    pts = [(0, 14.0, 0.0), (0, 8.0, 0.4), (0, 2.0, 0.8), (0, -4.0, 0.6), (0, -10.0, 0.0), (0, -16.0, -0.6), (0, -21.0, -1.0), (0, -24.0, -1.2)]
    sp = sk.chain("sp", pts, None)
    sk.add("head", pts[0], (0, 19.0, 0.2), sp[0])
    sk.add("jaw", (0, 14.5, -1.2), (0, 19.5, -2.6), "head")
    parts = []
    body = Surf([(-24.5, 0.1, 0.1, 0.1, -1.2, 2.0), (-20.0, 0.6, 0.6, 0.5, -0.9, 2.1), (-12.0, 1.4, 1.3, 1.2, -0.2, 2.2), (-2.0, 2.0, 1.8, 1.7, 0.7, 2.3),
                 (8.0, 2.2, 2.0, 1.8, 0.4, 2.3), (14.0, 2.4, 2.1, 1.6, 0.0, 2.4), (17.0, 2.6, 2.0, 0.6, 0.6, 2.6), (19.2, 2.4, 1.5, 0.3, 1.0, 2.4)])

    def bdisp(t, a):
        y = body.sec(t)[0]
        d = 0.09 * max(0.0, math.cos(y * 2.2)) ** 6        # ribbing rings
        d += 0.05 * noise.noise(body.P(t, a) * 0.6)
        d += 0.12 * math.exp(-((a - PI / 2) / 0.1) ** 2) * sstep(0.1, 0.7, t)   # a dorsal ridge
        return d
    parts.append(Part(body.mesh("body", 160, 40, ("sb_hide", "sb_belly"), disp=bdisp, mat_fn=lambda t, a: 1 if math.sin(a) < -0.5 else 0), bones=sp + ["head"]))
    # the gaping maw: an open lower jaw, a red throat, rows of hooked teeth curving inward
    jaw = Surf([(14.5, 2.2, 0.3, 0.9, -1.2, 2.4), (17.0, 2.3, 0.3, 0.8, -1.9, 2.5), (19.0, 1.9, 0.25, 0.6, -2.6, 2.4), (19.8, 0.9, 0.2, 0.3, -2.9, 2.2)])
    parts.append(Part(jaw.mesh("jaw", 30, 28, ("sb_hide", "sb_mouth"), mat_fn=lambda t, a: 1 if math.sin(a) > 0.2 else 0), bone="jaw"))
    parts.append(Part(kit.sphere("throat", 1.0, loc=(0, 15.5, -0.3), m="sb_mouth", segs=20, rings=12, scale=(1.9, 2.5, 1.5)), bone="head"))
    up = mouth_curve(14.8, 19.6, 2.25, 0.2, 0.9, sharp=0.5)
    lo = mouth_curve(14.8, 19.6, 2.0, -1.5, -2.6, sharp=0.5)
    for nm, mf, bone, dirz in (("u", up, "head", -1), ("l", lo, "jaw", 1)):
        tt = []
        for row in range(2):
            n = 22 - 6 * row
            for i in range(n):
                sv = -0.95 + 1.9 * (i + 0.5 * row) / (n - 1)
                p = mf(sv) + V((0, -0.5 * row, 0.25 * row * -dirz))
                L = (0.9 + 0.7 * math.cos(sv * PI / 2) ** 2) * rng.uniform(0.75, 1.15) * (1 - 0.3 * row)
                inward = V((-p.x * 0.25, -0.35, dirz))
                tt.append(fang(f"t{nm}{row}{i}", p, inward, V((0, -1, 0)), L, 0.16, curve=0.55, m="tooth", seg=6, n=6))
        parts.append(Part(kit.merge(tt, f"teeth{nm}"), bone=bone))
    hd = []
    for sx in (-1, 1):
        p, n = surf_at(body, 16.2, PI / 2 - sx * 0.7, -0.05)
        hd.append(eye(f"eye{sx}", p, n + V((0, 0.4, 0)), 0.22, "sh_eye", cornea_m="cornea", pupil=(0.4, 0.85), slit_axis=(0, 0, 1)))
    parts.append(Part(kit.merge(hd, "eyes"), bone="head"))
    # trailing membrane sheets: a dorsal and a ventral sheet along the back half, and long streamers off the tail
    for zs, nm in ((1, "dorsal"), (-1, "ventral")):
        bb, ee = [], []
        for k in range(12):
            y = 2.0 - 25.0 * k / 11
            p, n = surf_at(body, y, PI / 2 if zs > 0 else -PI / 2, -0.1)
            bb.append(p)
            ee.append(p + V((0, -1.5, zs * (1.0 + 1.6 * math.sin(PI * (0.15 + 0.85 * k / 11))))))
        parts.append(Part(fin(nm, bb, ee, "sb_sheet", nv=6, rays=22, corr=0.15, scallop=0.12, ruffle=0.4, ruffle_f=6, thick=0.05, rays_m="sb_hide", ray_r=0.06), bones=sp[2:]))
    for k in range(4):
        sx = (-1, -0.4, 0.4, 1)[k]
        b = V((sx * 0.3, -23.5, -1.2))
        st = [b + V((sx * 1.2 * q / 8, -9.0 * q / 8, 0.8 * math.sin(PI * q / 8) * (1 if k % 2 else -1))) for q in range(9)]
        parts.append(Part(tube(f"str{k}", st, [0.12 * (1 - q / 8) + 0.02 for q in range(9)], "sb_sheet", seg=5), bones=sp[-2:]))
    body_o = assemble("stormbeast_body", sk, parts)
    arm = finish_creature(root, sk, body_o, os.path.join(kit.out_dir(), "jup_stormbeast.glb"), props={"creature": "stormbeast", "length": 44}, ao=2.0, paint=2048)
    return root, arm


# ================================================================================================ 04 Floating Colony unit
def colony():
    kit.reset()
    root = empty("ColonyUnit")
    rng = random.Random(1604)
    parts = []
    # a porous lump: a sphere displaced by cells, pocked with pits
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=5, radius=1.5)
    for v in bm.verts:
        p = v.co.copy()
        n = p.normalized()
        c = cellular(p, 1.6, 0.12)
        d = 0.35 * noise.noise(p * 0.8) + 0.25 * c - 0.3 * (1 - c) + 0.12 * noise.noise(p * 3)
        v.co = p + n * d
        v.co.z *= 0.75
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    lump = kit.from_bmesh("lump", bm, ("co_body",))
    kit.smooth(lump, 50)
    parts.append(lump)
    # ember pits
    for k in range(30):
        d = V((rng.uniform(-1, 1), rng.uniform(-1, 1), rng.uniform(-0.6, 1))).normalized()
        parts.append(kit.sphere(f"e{k}", rng.uniform(0.06, 0.16), loc=tuple(d * 1.45 * V((1, 1, 0.75))), m="co_ember", segs=8, rings=5))
    # hanging threads and satellite blobs
    for k in range(10):
        a = rng.uniform(0, TAU)
        b = V((math.cos(a) * rng.uniform(0.2, 1.1), math.sin(a) * rng.uniform(0.2, 1.1), -0.9))
        L = rng.uniform(3, 8)
        pts = [b + V((0.3 * math.sin(q * 0.9 + k), 0.3 * math.cos(q * 0.7 + k), -L * q / 8)) for q in range(9)]
        parts.append(tube(f"th{k}", pts, [0.05 * (1 - q / 8) + 0.008 for q in range(9)], "co_thread", seg=4))
        if k % 3 == 0:
            parts.append(kit.sphere(f"sat{k}", rng.uniform(0.18, 0.35), loc=tuple(pts[-1]), m="co_body", segs=10, rings=6))
    body = kit.merge(parts, "colony_body")
    export_static(root, body, os.path.join(kit.out_dir(), "jup_colony.glb"), {"creature": "colony"}, size=1024, ao=0.5)
    return root, None


# ================================================================================================ 05 Voltdrifter
def voltdrifter():
    kit.reset()
    root = empty("Voltdrifter")
    rng = random.Random(1605)
    sk = Skeleton()
    sk.add("mantle", (0, -3.2, 0), (0, 0.6, 0))
    sk.add("head", (0, 0.6, 0), (0, 1.6, 0), "mantle")
    parts = []
    mant = Surf([(-3.6, 0.05, 0.05, 0.05, 0.0, 2.0), (-3.0, 0.45, 0.45, 0.42, 0.0, 2.0), (-1.5, 0.75, 0.72, 0.68, 0.0, 2.0), (0.0, 0.8, 0.75, 0.7, 0.0, 2.0),
                 (0.7, 0.72, 0.68, 0.62, 0.0, 2.0), (1.3, 0.62, 0.6, 0.55, 0.0, 2.0), (1.8, 0.45, 0.42, 0.4, 0.0, 2.0), (2.1, 0.32, 0.3, 0.3, 0.0, 2.0)])
    parts.append(Part(mant.mesh("mantle", 60, 32, ("vd_skin",), disp=lambda t, a: 0.02 * noise.noise(mant.P(t, a) * 2)), bones=["mantle", "head"]))
    # slender sharp fins at the mantle's tip
    for sx, s in ((-1, "L"), (1, "R")):
        base = [V((sx * 0.3, -3.4 + 1.8 * k / 5, 0)) for k in range(6)]
        edge = [V((sx * (0.3 + 1.7 * math.sin(PI * (k / 5) ** 0.7) ** 1.5), -3.9 + 1.6 * k / 5 - 0.8 * math.sin(PI * k / 5), 0.0)) for k in range(6)]
        parts.append(Part(fin(f"fin{s}", base, edge, "vd_fin", nv=5, rays=10, thick=0.02, rays_m="vd_skin", ray_r=0.02), bone="mantle"))
    hd = []
    for sx in (-1, 1):
        p, n = surf_at(mant, 1.2, PI / 2 - sx * 1.25, -0.02)
        hd.append(eye(f"eye{sx}", p, n, 0.28, "vd_eye", cornea_m="cornea", pupil=(0.6, 0.6)))
    hd.append(fang("beakU", V((0, 2.05, 0.05)), V((0, 1, -0.4)), V((0, 0, -1)), 0.35, 0.12, curve=0.4, m="claw_black", seg=6))
    hd.append(fang("beakL", V((0, 2.05, -0.12)), V((0, 1, 0.2)), V((0, 0, 1)), 0.28, 0.1, curve=0.3, m="claw_black", seg=6))
    parts.append(Part(kit.merge(hd, "headdet"), bone="head"))
    # eight arms and two long tendrils, each a 4-bone chain
    for k in range(10):
        a = TAU * k / 10
        long = k in (2, 7)
        L = 8.0 if long else 3.6
        b = V((math.cos(a) * 0.42, 2.0, math.sin(a) * 0.42))
        pts = [b + V((math.cos(a) * 0.25 * q, L * q / 4, math.sin(a) * 0.25 * q)) for q in range(5)]
        ch = sk.chain(f"arm{k}", [tuple(p) for p in pts], "head")
        armp = [ringed(f"a{k}", pts, (lambda t, long=long: (0.11 if long else 0.14) * (1 - 0.85 * t) + 0.012), "vd_skin", rings=24 if long else 14, groove=0.1, seg=8, samples=60)]
        if long:
            armp.append(kit.sphere(f"club{k}", 0.16, loc=tuple(pts[-1]), m="vd_skin", segs=10, rings=6, scale=(1, 2, 1)))
        parts.append(Part(kit.merge(armp, f"arm{k}"), bones=ch))
    body = assemble("voltdrifter_body", sk, parts)
    arm = finish_creature(root, sk, body, os.path.join(kit.out_dir(), "jup_voltdrifter.glb"), props={"creature": "voltdrifter", "length": 12}, ao=0.6, paint=2048)
    return root, arm


# ================================================================================================ 06 Deepdiver
def deepdiver():
    kit.reset()
    root = empty("Deepdiver")
    rng = random.Random(1606)
    sk = Skeleton()
    sp = sk.chain("sp", [(0, 6.5, 0), (0, 2.0, 0), (0, -2.5, 0.1), (0, -6.5, 0.2)], None)
    for sx, s in ((-1, "L"), (1, "R")):
        sk.add(f"fin{s}", (sx * 1.2, 1.5, 0), (sx * 5.0, -2.0, 0.2), sp[1])
    parts = []
    body = Surf([(-7.0, 0.1, 0.1, 0.1, 0.2, 2.0), (-5.5, 0.6, 0.5, 0.45, 0.15, 2.2), (-2.0, 1.4, 1.1, 0.9, 0.05, 2.4), (1.5, 1.6, 1.2, 0.9, 0.0, 2.6),
                 (4.5, 1.2, 0.9, 0.6, -0.05, 2.8), (6.5, 0.55, 0.45, 0.32, -0.1, 2.6), (7.6, 0.05, 0.06, 0.05, -0.12, 2.0)])
    parts.append(Part(body.mesh("body", 70, 36, ("dd_skin",)), bones=sp))
    pl = []
    for r in range(9):
        tc = 0.12 + 0.8 * r / 8
        for c in range(6):
            ac = 0.08 * PI + 0.84 * PI * (c + 0.5) / 6
            pl.append(plate(f"p{r}{c}", body.P, body.N, tc, ac + rng.uniform(-0.04, 0.04), 0.055, 0.2, "dd_plate", rng, rear=-1, lift=0.12, thick=0.08,
                            dome=0.3, jag=0.05, keel=0.05, tip=1.2, sides=3, sides_rot=0.25, K=18, rings=3, inset=0.03))
    parts.append(Part(kit.merge(pl, "plates"), bones=sp))
    for sx in (-1, 1):
        p, n = surf_at(body, 5.6, PI / 2 - sx * 1.2, -0.03)
        parts.append(Part(eye(f"eye{sx}", p, n + V((0, 0.3, 0)), 0.16, "sh_eye", cornea_m="cornea", pupil=(0.4, 0.8), slit_axis=(0, 0, 1)), bone=sp[0]))
    # layered fin-wings: three stacked swept fins each side
    for sx, s in ((-1, "L"), (1, "R")):
        for L_ in range(3):
            y0 = 2.5 - 1.6 * L_
            base = [V((sx * 1.2, y0 - 2.2 * k / 5, 0.3 - 0.25 * L_)) for k in range(6)]
            span = 4.2 - 0.9 * L_
            edge = [V((sx * (1.2 + span * math.sin(PI * (0.15 + 0.85 * k / 5)) ** 0.6), y0 - 2.2 * k / 5 - span * 0.7, 0.4 - 0.3 * L_)) for k in range(6)]
            parts.append(Part(fin(f"wf{s}{L_}", base, edge, "dd_fin", nv=6, rays=10, corr=0.05, scallop=0.06, thick=0.05, rays_m="dd_plate", ray_r=0.05), bones=[f"fin{s}", sp[1]]))
    parts.append(Part(foil("tailf", V((0, -6.5, 0.2)), V((0, -0.6, 0.8)), V((0, -1, 0)), 2.6, lambda u: (1.6 * (1 - u) ** 0.8 + 0.1, 0.18 * (1 - u) + 0.02, 1.0 * u), "dd_fin"), bone=sp[-1]))
    parts.append(Part(foil("tailf2", V((0, -6.5, 0.1)), V((0, -0.6, -0.8)), V((0, -1, 0)), 2.0, lambda u: (1.4 * (1 - u) ** 0.8 + 0.1, 0.16 * (1 - u) + 0.02, 0.9 * u), "dd_fin"), bone=sp[-1]))
    body_o = assemble("deepdiver_body", sk, parts)
    arm = finish_creature(root, sk, body_o, os.path.join(kit.out_dir(), "jup_deepdiver.glb"), props={"creature": "deepdiver", "length": 14}, ao=0.8, paint=2048)
    return root, arm


# ================================================================================================ 07 Gasgrazer
def gasgrazer():
    kit.reset()
    root = empty("Gasgrazer")
    rng = random.Random(1607)
    sk = Skeleton()
    sp = sk.chain("sp", [(0, 10.0, 0), (0, 3.0, 0.3), (0, -4.0, 0.3), (0, -10.0, 0.0), (0, -15.0, -0.4)], None)
    sk.add("head", (0, 10.0, 0), (0, 15.0, 0.5), sp[0])
    sk.add("comb", (0, 12.0, -2.0), (0, 15.0, -3.5), "head")
    parts = []
    body = Surf([(-15.5, 0.2, 0.2, 0.2, -0.4, 2.0), (-12.0, 1.2, 1.1, 1.0, -0.2, 2.1), (-5.0, 3.0, 2.6, 2.4, 0.2, 2.2), (2.0, 3.8, 3.3, 3.0, 0.4, 2.3),
                 (8.0, 3.8, 3.4, 3.4, 0.4, 2.4), (11.5, 3.5, 3.4, 3.6, 0.2, 2.6), (13.8, 3.0, 3.0, 3.5, -0.2, 2.8), (15.0, 2.2, 2.2, 3.0, -0.4, 2.6)])

    def bdisp(t, a):
        p = body.P(t, a)
        d = 0.06 * noise.noise(p * 0.5)
        # the mouth: the front face of the head is cut back (the comb sits in the opening)
        if p.y > 12.0 and math.sin(a) < 0.45:
            d -= 0.9 * sstep(12.0, 14.8, p.y) * sstep(0.45, -0.2, math.sin(a))
        d += 0.05 * max(0.0, math.cos(p.y * 1.4)) ** 8 * (math.sin(a) < -0.3)   # throat grooves
        return d
    parts.append(Part(body.mesh("body", 110, 48, ("gg_hide",), disp=bdisp), bones=sp + ["head"]))
    # the vertical comb: many slender cream plates spanning the mouth opening, a red gum line above and below
    comb = []
    for i in range(46):
        sv = -0.94 + 1.88 * i / 45
        x = 2.75 * math.sin(sv * PI / 2)
        y = 14.6 - 2.2 * (1 - math.cos(sv * PI / 2))
        top, bot = V((x, y, 0.9)), V((x * 0.92, y - 0.4, -3.2))
        comb.append(tube(f"c{i}", [top, top.lerp(bot, 0.5) + V((0, 0.12, 0)), bot], [0.06, 0.05, 0.03], "gg_comb", seg=4))
    comb.append(tube("gumU", [V((2.75 * math.sin(sv * PI / 2), 14.6 - 2.2 * (1 - math.cos(sv * PI / 2)), 0.95)) for sv in [-0.95 + 1.9 * k / 30 for k in range(31)]], [0.18] * 31, "mouth_red", seg=6))
    parts.append(Part(kit.merge(comb, "comb"), bones=["head", "comb"]))
    for sx in (-1, 1):
        p, n = surf_at(body, 11.0, PI / 2 - sx * 1.0, -0.05)
        parts.append(Part(eye(f"eye{sx}", p, n, 0.22, "mo_eye", cornea_m="cornea", pupil=(0.5, 0.5)), bone="head"))
    # long trailing fringes from the belly and flanks
    fr = []
    for k in range(40):
        y = 9.0 - 17.0 * k / 39
        a = -PI / 2 + rng.uniform(-0.9, 0.9)
        p, n = surf_at(body, y, a, -0.1)
        L = rng.uniform(6, 14)
        pts = [p + V((math.cos(a) * 0.4 * q / 8, -L * 0.7 * q / 8, -L * 0.55 * q / 8 + 0.4 * math.sin(q * 0.8 + k))) for q in range(9)]
        fr.append(tube(f"fr{k}", pts, [0.1 * (1 - q / 8) + 0.015 for q in range(9)], "gg_fringe", seg=4))
    parts.append(Part(kit.merge(fr, "fringes"), bones=sp))
    for sx, s in ((-1, "L"), (1, "R")):
        parts.append(Part(foil(f"pec{s}", V((sx * 3.2, 6.0, -1.2)), V((sx * 0.8, -0.5, -0.4)), V((0, -1, 0)), 4.5,
                               lambda u: (2.6 * (1 - u) ** 0.8 + 0.2, 0.35 * (1 - u) + 0.03, 1.4 * u), "gg_hide"), bone=sp[1]))
    parts.append(Part(foil("flukeL", V((-0.3, -15.0, -0.4)), V((-1.0, -0.5, 0.05)), V((0, -1, 0)), 4.5, lambda u: (2.2 * (1 - u) ** 0.7 + 0.15, 0.3 * (1 - u) + 0.03, 1.6 * u), "gg_hide"), bone=sp[-1]))
    parts.append(Part(foil("flukeR", V((0.3, -15.0, -0.4)), V((1.0, -0.5, 0.05)), V((0, -1, 0)), 4.5, lambda u: (2.2 * (1 - u) ** 0.7 + 0.15, 0.3 * (1 - u) + 0.03, 1.6 * u), "gg_hide"), bone=sp[-1]))
    body_o = assemble("gasgrazer_body", sk, parts)
    arm = finish_creature(root, sk, body_o, os.path.join(kit.out_dir(), "jup_gasgrazer.glb"), props={"creature": "gasgrazer", "length": 31}, ao=2.0, paint=2048)
    return root, arm


# ================================================================================================ 08 Aeromite
def aeromite():
    kit.reset()
    root = empty("Aeromite")
    parts = [kit.sphere("seed", 1.0, loc=(0, 0, 0), m="am_body", segs=8, rings=5, scale=(0.003, 0.009, 0.003))]
    for k in range(6):
        a = TAU * k / 6
        d = V((math.cos(a), 0.15, math.sin(a))).normalized()
        b = V((0, -0.002, 0))
        parts.append(fin(f"m{k}", [b, b + V((0, 0.002, 0))], [b + d * 0.016, b + d * 0.014 + V((0, 0.004, 0))], "am_wing", nv=2, rays=1, thick=0.0004))
    body = kit.merge(parts, "aeromite_body")
    export_static(root, body, os.path.join(kit.out_dir(), "jup_aeromite.glb"), {"creature": "aeromite"}, size=128)
    return root, None


# ================================================================================================ 09 Stormhunter
def stormhunter():
    kit.reset()
    root = empty("Stormhunter")
    rng = random.Random(1609)
    sk = Skeleton()
    pts = [(0, 8.0, 1.0), (0, 4.5, 0.4), (0, 0.5, 0.0), (0, -3.5, -0.2), (0, -7.5, 0.0), (0, -11.0, 0.4), (0, -14.0, 0.8)]
    sp = sk.chain("sp", pts, None)
    sk.add("head", pts[0], (0, 13.0, 1.6), sp[0])
    sk.add("jaw", (0, 9.0, 0.4), (0, 13.0, 0.6), "head")
    parts = []
    body = Surf([(-14.5, 0.08, 0.08, 0.08, 0.8, 2.0), (-11.0, 0.5, 0.5, 0.45, 0.4, 2.1), (-5.0, 1.15, 1.1, 1.0, -0.1, 2.2), (1.0, 1.4, 1.3, 1.2, 0.0, 2.3),
                 (5.5, 1.1, 1.0, 0.9, 0.4, 2.3), (8.5, 0.9, 0.9, 0.7, 1.0, 2.4), (10.5, 0.75, 0.6, 0.35, 1.2, 2.6), (12.5, 0.4, 0.35, 0.15, 1.4, 2.4), (13.6, 0.06, 0.08, 0.05, 1.5, 2.0)])
    parts.append(Part(body.mesh("body", 130, 36, ("sh_skin",), disp=lambda t, a: 0.03 * noise.noise(body.P(t, a) * 1.2)), bones=sp + ["head"]))
    # armour: overlapping dorsal and flank plates
    pl = []
    for r in range(16):
        tc = 0.08 + 0.78 * r / 15
        for c in range(5):
            ac = 0.15 * PI + 0.7 * PI * (c + 0.5) / 5
            pl.append(plate(f"a{r}{c}", body.P, body.N, tc, ac, 0.028, 0.22, "sh_armor", rng, rear=-1, lift=0.08, thick=0.05, dome=0.3, jag=0.08, keel=0.04, tip=1.2, K=16, rings=3, inset=0.02))
    parts.append(Part(kit.merge(pl, "armor"), bones=sp))
    # the dagger beak: upper and lower jaws serrated with hooked teeth
    jaw = Surf([(9.0, 0.6, 0.12, 0.3, 0.45, 2.4), (11.0, 0.5, 0.1, 0.25, 0.55, 2.5), (12.6, 0.25, 0.08, 0.15, 0.62, 2.3), (13.4, 0.05, 0.04, 0.05, 0.65, 2.0)])
    parts.append(Part(jaw.mesh("jaw", 30, 20, ("sh_armor",)), bone="jaw"))
    teeth = []
    for sx in (-1, 1):
        for i in range(14):
            y = 9.4 + 3.8 * i / 13
            wU = body.sec(surf_t(body, y))[1] * 0.92
            teeth.append(fang(f"tu{sx}{i}", V((sx * wU, y, 1.0 - 0.12 * i / 13)), V((sx * 0.1, 0.4, -1)), V((0, 1, 0)), 0.32 - 0.12 * i / 13, 0.07, curve=0.5, m="tooth", seg=5, n=5))
            wL = jaw.sec(surf_t(jaw, min(y, 13.2)))[1] * 0.92
            teeth.append(fang(f"tl{sx}{i}", V((sx * wL, y, 0.62)), V((sx * 0.1, 0.4, 1)), V((0, 1, 0)), 0.26 - 0.1 * i / 13, 0.06, curve=0.5, m="tooth", seg=5, n=5))
    teeth.append(fang("hook", V((0, 13.4, 1.42)), V((0, 1, -0.9)), V((0, 0, -1)), 0.8, 0.14, curve=0.7, m="sh_spine", seg=6))
    for sx in (-1, 1):
        p, n = surf_at(body, 9.6, PI / 2 - sx * 0.9, -0.03)
        teeth.append(eye(f"eye{sx}", p, n + V((0, 0.3, 0)), 0.13, "sh_eye", cornea_m="cornea", pupil=(0.35, 0.85), slit_axis=(0, 0, 1)))
    parts.append(Part(kit.merge(teeth, "headdet"), bone="head"))
    # spines along the crest and the back
    sp_ = []
    for k in range(22):
        y = 9.0 - 21.0 * k / 21
        p, n = surf_at(body, y, PI / 2, 0.02)
        L = (1.3 if k < 4 else 0.8) * (1 - 0.5 * k / 21) * rng.uniform(0.8, 1.2)
        sp_.append(fang(f"s{k}", p, V((0, -0.7, 1)), V((0, -1, 0)), L, 0.12, curve=0.3, m="sh_spine", seg=5, n=5))
    parts.append(Part(kit.merge(sp_, "spines"), bones=sp + ["head"]))
    # copper-edged fin webs along the flanks and a tail web
    for sx, s in ((-1, "L"), (1, "R")):
        for k, (y0, span) in enumerate(((4.0, 4.5), (-3.0, 3.5))):
            bb = [V((sx * 1.1, y0 - 3.0 * q / 5, 0.0)) for q in range(6)]
            ee = [V((sx * (1.1 + span * math.sin(PI * (0.2 + 0.8 * q / 5)) ** 0.6), y0 - 3.0 * q / 5 - span * 0.8, 0.6)) for q in range(6)]
            parts.append(Part(fin(f"web{s}{k}", bb, ee, "sh_web", nv=6, rays=9, corr=0.08, scallop=0.25, ruffle=0.15, ruffle_f=5, thick=0.04, rays_m="sh_spine", ray_r=0.05, ray_taper=0.2), bones=sp[1:4] if k == 0 else sp[3:6]))
    tb = [V((0, -11.0 - 3.4 * q / 5, 0.5 + 0.06 * q)) for q in range(6)]
    te = [b + V((0, -0.6, 1.4 * math.sin(PI * (0.2 + 0.8 * q / 5)))) for q, b in enumerate(tb)]
    parts.append(Part(fin("tailweb", tb, te, "sh_web", nv=5, rays=8, scallop=0.25, thick=0.04, rays_m="sh_spine", ray_r=0.04), bones=sp[-2:]))
    body_o = assemble("stormhunter_body", sk, parts)
    arm = finish_creature(root, sk, body_o, os.path.join(kit.out_dir(), "jup_stormhunter.glb"), props={"creature": "stormhunter", "length": 28}, ao=1.0, paint=2048)
    return root, arm


ALL = ["stormskimmer", "skyjelly", "stormbeast", "colony", "voltdrifter", "deepdiver", "gasgrazer", "aeromite", "stormhunter"]
VIEWS = {
    "stormskimmer": ((22, 26, 12), (0, -1, 0), 35), "skyjelly": ((14, 16, 2), (0, 0, -4), 35), "stormbeast": ((34, 42, 12), (0, 2, 0), 35),
    "colony": ((7, 8, 2), (0, 0, -1.5), 35), "voltdrifter": ((9, 10, 4), (0, 1, 0), 35), "deepdiver": ((14, 15, 6), (0, 0, 0), 35),
    "gasgrazer": ((30, 34, 8), (0, 2, -1), 35), "aeromite": ((0.05, 0.05, 0.04), (0, 0, 0), 50), "stormhunter": ((24, 28, 10), (0, 0, 0.5), 35),
}

if __name__ == "__main__":
    which = [a for a in sys.argv[1:] if not a.startswith("--")] or ALL
    for w in which:
        globals()[w]()
        if "--nopreview" not in sys.argv:
            cam, tgt, lens = VIEWS[w]
            preview(f"jup_{w}", cam, tgt, lens=lens, world=(0.32, 0.26, 0.24))
