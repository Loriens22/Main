"""
Mars & Jupiter: Speculative Evolution — the nine Jupiter species of the player's 3×3 reference sheet (916), in its
panel order (jupiter_panel_01 … 09). Own geometry built from close study of each panel (no copies), at the SIMULATION
size of data/speciesExpansion.ts (Creative's heroic option scales them up at runtime). Second pass, panel by panel:
  stormskimmer  01  a near-black indigo keel drawn out into a long needle beak, a bright small eye, hooked palps;
                    each wing hung from a thick curved leading-edge spar with dark finger ribs, the membrane deep indigo
                    clouded violet-magenta and threaded with glowing cobalt veins; a whip tail and two trailing tendrils
  skyjelly      02  a broad flattened bell with dense meridional ribs and a scalloped velum, an orange-pink frilled
                    gonad ring and inner bell glowing through it, four long twisted frilled oral arms, a fringe of
                    seventy fine wavy tentacles
  stormbeast    03  a gaping maw (≈70°) ringed by rows of long hooked needle teeth, a red ridged throat, a heavy brow
                    over a small eye, the long body creased by annular folds, rust in the creases, a pale ringed belly
  colony        04  a Floating Colony unit: a cauliflower mass of fused lobes, brain-like folds split by glowing ember
                    fissures, a beard of branching root-like threads, small pods (instanced by the hundred at runtime)
  voltdrifter   05  a long cone mantle with two narrow blade fins at its tip, a bulbous head with large blue-irised eyes
                    in dark lids, orange chromatophore speckling on iridescent violet, eight long curling arms with
                    sucker rows and two longer clubbed tentacles, a beak
  deepdiver     06  a blunt armoured head with a long mouth line, small ember eyes under brow plates, the body sheathed
                    in sharp triangular plates with glowing seams, a dorsal row of spikes, stacked swept fin-wings
  gasgrazer     07  a whale-like head whose lower front is one great arched mouth hung with a curtain of fine cream
                    baleen lamellae under a thick upper lip, a deep grooved throat, tusk-like fringes curving down and
                    back from the chin and belly, pale grey skin streaked rust-red, a dark red underside
  aeromite      08  a glowing golden seed with long radiating hairs (instanced by the thousand)
  stormhunter   09  a long narrow head with a hooked tip and open jaws of needle teeth, a crest of long backward spikes,
                    silver-grey scale armour over a glowing crimson underside, lionfish-like frill fins and streaming
                    filaments along the neck and body
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
from creature import Skeleton, Part, assemble, finish_creature, meta
from organic import Surf, TubeSurf, plate, fin, tube, fang, ringed, eye, sstep, smooth_lerp
import paint_specs  # noqa: F401
from paint import PAINT
from fauna_mars_deep import foil, cellular, surf_at, surf_t, mouth_curve, export_static, bands, preview

PI, TAU = math.pi, math.tau

kit.PALETTE.update({
    "js_keel": dict(color=(0.03, 0.025, 0.06), rough=0.2),
    "js_wing": dict(color=(0.08, 0.04, 0.14), rough=0.15, alpha=0.6),
    "js_spar": dict(color=(0.04, 0.03, 0.07), rough=0.25),
    "js_vein": dict(color=(0.2, 0.42, 0.95), rough=0.15),
    "js_eye": dict(color=(0.6, 0.9, 1.0), rough=0.03),
    "sj_bell": dict(color=(0.42, 0.32, 0.85), rough=0.08, alpha=0.4),
    "sj_inner": dict(color=(0.6, 0.35, 0.7), rough=0.1, alpha=0.6),
    "sj_core": dict(color=(0.95, 0.45, 0.4), rough=0.2),
    "sj_arm": dict(color=(0.7, 0.6, 0.9), rough=0.15, alpha=0.7),
    "sj_tent": dict(color=(0.6, 0.5, 0.95), rough=0.2),
    "sb_hide": dict(color=(0.2, 0.13, 0.1), rough=0.5),
    "sb_belly": dict(color=(0.52, 0.36, 0.28), rough=0.45),
    "sb_sheet": dict(color=(0.35, 0.16, 0.09), rough=0.4, alpha=0.75),
    "sb_mouth": dict(color=(0.45, 0.08, 0.07), rough=0.35),
    "co_body": dict(color=(0.16, 0.1, 0.08), rough=0.7),
    "co_thread": dict(color=(0.45, 0.16, 0.06), rough=0.6),
    "vd_skin": dict(color=(0.12, 0.07, 0.16), rough=0.2),
    "vd_belly": dict(color=(0.42, 0.32, 0.55), rough=0.25),
    "vd_fin": dict(color=(0.22, 0.12, 0.35), rough=0.15, alpha=0.75),
    "vd_iris": dict(color=(0.1, 0.45, 0.95), rough=0.03),
    "vd_lid": dict(color=(0.05, 0.03, 0.05), rough=0.3),
    "dd_plate": dict(color=(0.08, 0.08, 0.09), rough=0.3),
    "dd_skin": dict(color=(0.1, 0.08, 0.08), rough=0.4),
    "dd_fin": dict(color=(0.09, 0.08, 0.09), rough=0.3),
    "dd_eye": dict(color=(1.0, 0.5, 0.12), rough=0.05),
    "gg_hide": dict(color=(0.72, 0.68, 0.7), rough=0.35),
    "gg_belly": dict(color=(0.42, 0.16, 0.13), rough=0.4),
    "gg_comb": dict(color=(0.86, 0.8, 0.68), rough=0.4),
    "gg_fringe": dict(color=(0.6, 0.4, 0.38), rough=0.4),
    "am_body": dict(color=(1.0, 0.75, 0.3), rough=0.3),
    "am_hair": dict(color=(1.0, 0.82, 0.45), rough=0.2),
    "sh_armor": dict(color=(0.42, 0.42, 0.45), rough=0.25),
    "sh_skin": dict(color=(0.5, 0.1, 0.05), rough=0.35),
    "sh_web": dict(color=(0.55, 0.14, 0.06), rough=0.3, alpha=0.8),
    "sh_spine": dict(color=(0.75, 0.68, 0.62), rough=0.3),
    "sh_eye": dict(color=(1.0, 0.55, 0.1), rough=0.05),
})

PAINT.update({
    # 01 — keel: near-black indigo, iridescent violet streaks, cobalt speckle; wing: deep indigo clouded violet-magenta,
    #      a fine bright cobalt vein net, paler translucent trailing margins; spar: black with violet sheen
    "js_keel": {"base": (0.025, 0.02, 0.055), "layers": [
        ("streak", (0.22, 0.1, 0.42), 0.55, 0.25, "y", 0.56, 0.72), ("streak", (0.1, 0.22, 0.55), 0.4, 0.12, "y", 0.6, 0.74),
        ("speck", (0.35, 0.55, 1.0), 0.45, 0.02, 0.74), ("back", (0.06, 0.04, 0.12), 0.3), ("edge", (0.4, 0.35, 0.65), 0.5), ("ao", 0.6, 1.0)],
        "relief": [("scales", 0.0025, 0.08), ("grooves", 0.004, 0.35, 0.04), ("wrinkle", 0.002, 0.25, (1, 4, 1))]},
    "js_wing": {"base": (0.05, 0.025, 0.1), "layers": [
        ("noise", (0.32, 0.08, 0.45), 0.65, 1.6, 0.48, 0.66, (1, 1, 1), 1.4), ("noise", (0.5, 0.1, 0.45), 0.4, 0.8, 0.56, 0.7),
        ("retic", (0.15, 0.4, 1.0), 0.75, 0.55, 0.018), ("retic", (0.1, 0.25, 0.75), 0.45, 0.2, 0.02), ("speck", (0.6, 0.8, 1.0), 0.35, 0.06, 0.78),
        ("grad", (0.2, 0.12, 0.3), 0.35, "x", 5.0, 12.0)],
        "relief": [("veins", 0.003, 0.55, 0.025), ("wrinkle", 0.0015, 0.5)]},
    "js_spar": {"base": (0.03, 0.02, 0.05), "layers": [("streak", (0.3, 0.15, 0.5), 0.5, 0.2, "x", 0.56, 0.72), ("edge", (0.45, 0.4, 0.7), 0.55), ("ao", 0.6, 0.6)],
                "relief": [("wrinkle", 0.003, 0.15, (4, 1, 1)), ("scales", 0.002, 0.06)]},
    "js_vein": {"base": (0.2, 0.45, 1.0), "layers": [("noise", (0.6, 0.85, 1.0), 0.5, 0.3, 0.5, 0.7)]},
    # 02 — bell: violet-blue with paler meridional ribs, pink glow toward the rim; inner bell lilac-pink; gonads coral
    "sj_bell": {"base": (0.34, 0.28, 0.8), "layers": [
        ("noise", (0.55, 0.42, 0.95), 0.45, 0.6, 0.48, 0.7), ("edge", (0.8, 0.75, 1.0), 0.6), ("grad", (0.9, 0.45, 0.7), 0.55, "z", 1.0, -0.1),
        ("speck", (0.95, 0.9, 1.0), 0.3, 0.03, 0.78)], "relief": [("wrinkle", 0.001, 0.2), ("veins", 0.0008, 0.3, 0.03)]},
    "sj_inner": {"base": (0.62, 0.32, 0.72), "layers": [("noise", (0.9, 0.5, 0.6), 0.5, 0.4, 0.5, 0.7), ("retic", (0.95, 0.6, 0.55), 0.4, 0.3, 0.03)]},
    "sj_core": {"base": (0.95, 0.42, 0.35), "layers": [("noise", (1.0, 0.72, 0.45), 0.55, 0.15, 0.5, 0.7), ("speck", (1.0, 0.95, 0.8), 0.4, 0.03, 0.74)]},
    "sj_arm": {"base": (0.66, 0.56, 0.9), "layers": [("speck", (1.0, 1.0, 1.0), 0.55, 0.06, 0.7), ("noise", (0.9, 0.55, 0.75), 0.4, 0.3, 0.55, 0.7)]},
    "sj_tent": {"base": (0.55, 0.45, 0.95), "layers": [("noise", (0.9, 0.6, 0.85), 0.4, 0.2, 0.5, 0.7)]},
    # 03 — dark grey-brown creased hide, rust-red in the creases, a pale ringed belly, a deep red throat
    "sb_hide": {"base": (0.17, 0.11, 0.09), "layers": [
        ("noise", (0.42, 0.16, 0.08), 0.6, 0.9, 0.5, 0.66, (1, 1, 1), 1.2), ("cavity", (0.55, 0.14, 0.06), 0.75), ("noise", (0.3, 0.28, 0.27), 0.4, 0.4, 0.58, 0.72),
        ("belly", (0.5, 0.36, 0.28), 0.6), ("edge", (0.55, 0.45, 0.4), 0.45), ("ao", 0.75, 1.5)],
        "relief": [("wrinkle", 0.01, 0.35, (4, 1, 1)), ("scales", 0.004, 0.12), ("pores", 0.003, 0.15, 0.3)]},
    "sb_belly": {"base": (0.5, 0.35, 0.27), "layers": [("streak", (0.3, 0.18, 0.14), 0.45, 0.5, "x", 0.55, 0.7), ("cavity", (0.35, 0.12, 0.08), 0.6), ("ao", 0.6, 1.0)],
                 "relief": [("grooves", 0.008, 0.6, 0.1)]},
    "sb_sheet": {"base": (0.32, 0.14, 0.08), "layers": [("noise", (0.6, 0.3, 0.14), 0.45, 0.8, 0.5, 0.7), ("retic", (0.15, 0.06, 0.04), 0.4, 0.5, 0.04)], "relief": [("veins", 0.002, 0.8, 0.03)]},
    "sb_mouth": {"base": (0.42, 0.07, 0.06), "layers": [("streak", (0.2, 0.02, 0.02), 0.55, 0.15, "z", 0.5, 0.7), ("noise", (0.7, 0.2, 0.15), 0.35, 0.3, 0.55, 0.7), ("cavity", (0.1, 0.01, 0.01), 0.8), ("ao", 0.8, 1.2)],
                 "relief": [("wrinkle", 0.006, 0.18, (1, 1, 4)), ("pores", 0.002, 0.08, 0.3)]},
    # 04 — near-black brown lobes, ember fissures glowing orange-red in every fold, rust threads
    "co_body": {"base": (0.12, 0.08, 0.065), "layers": [
        ("noise", (0.3, 0.2, 0.16), 0.5, 0.6, 0.5, 0.68), ("cavity", (1.0, 0.38, 0.06), 0.95), ("speck", (1.0, 0.55, 0.15), 0.45, 0.08, 0.74),
        ("noise", (0.03, 0.02, 0.02), 0.4, 0.2, 0.55, 0.7), ("ao", 0.5, 0.6)],
        "relief": [("wrinkle", 0.02, 0.25), ("vesicles", 0.012, 0.15, 0.35), ("noise", 0.012, 0.4)]},
    "co_thread": {"base": (0.42, 0.13, 0.05), "layers": [("noise", (0.85, 0.35, 0.08), 0.5, 0.3, 0.5, 0.7)]},
    # 05 — dark purple-brown, iridescent violet-blue patches, dense orange chromatophore speckle, lilac underside
    "vd_skin": {"base": (0.1, 0.06, 0.13), "layers": [
        ("noise", (0.3, 0.2, 0.62), 0.6, 0.6, 0.5, 0.66), ("noise", (0.12, 0.28, 0.6), 0.4, 0.3, 0.58, 0.72),
        ("spots", (0.9, 0.48, 0.15), 0.75, 0.07, 0.28, 0.5), ("speck", (1.0, 0.6, 0.25), 0.5, 0.025, 0.72),
        ("belly", (0.45, 0.35, 0.6), 0.5), ("edge", (0.6, 0.55, 0.85), 0.45), ("ao", 0.6, 0.5)],
        "relief": [("pores", 0.002, 0.05, 0.35), ("wrinkle", 0.002, 0.12, (1, 3, 1))]},
    "vd_belly": {"base": (0.4, 0.3, 0.55), "layers": [("speck", (0.9, 0.6, 0.4), 0.4, 0.03, 0.74), ("ao", 0.6, 0.5)], "relief": [("pores", 0.0015, 0.04, 0.3)]},
    "vd_fin": {"base": (0.2, 0.11, 0.33), "layers": [("noise", (0.45, 0.3, 0.8), 0.5, 0.3, 0.5, 0.7), ("retic", (0.9, 0.5, 0.2), 0.35, 0.15, 0.03)], "relief": [("veins", 0.001, 0.3, 0.04)]},
    "vd_lid": {"base": (0.05, 0.03, 0.05), "layers": [("speck", (0.8, 0.45, 0.2), 0.4, 0.02, 0.74)]},
    # 06 — charcoal armour, ember-orange seams and edges, rough rock-like plate faces
    "dd_plate": {"base": (0.06, 0.06, 0.065), "layers": [
        ("noise", (0.2, 0.2, 0.22), 0.5, 0.5, 0.5, 0.7), ("edge", (0.95, 0.42, 0.1), 0.55), ("cavity", (1.0, 0.35, 0.06), 0.8), ("speck", (0.9, 0.5, 0.2), 0.3, 0.05, 0.76), ("ao", 0.7, 0.8)],
        "relief": [("grooves", 0.004, 0.3, 0.05), ("pores", 0.003, 0.1, 0.3), ("noise", 0.003, 0.2)]},
    "dd_skin": {"base": (0.09, 0.075, 0.075), "layers": [("noise", (0.4, 0.12, 0.05), 0.5, 0.4, 0.55, 0.7), ("cavity", (0.9, 0.3, 0.05), 0.7), ("ao", 0.7, 0.8)], "relief": [("wrinkle", 0.004, 0.25)]},
    "dd_fin": {"base": (0.08, 0.075, 0.08), "layers": [("retic", (0.6, 0.2, 0.05), 0.45, 0.5, 0.035), ("edge", (0.95, 0.45, 0.15), 0.6)], "relief": [("veins", 0.002, 0.6, 0.03)]},
    # 07 — pale grey-silver hide with long rust-red streaks and wrinkles, a dark red belly; cream lamellae
    "gg_hide": {"base": (0.66, 0.63, 0.65), "layers": [
        ("streak", (0.52, 0.14, 0.12), 0.65, 0.9, "y", 0.58, 0.7), ("streak", (0.35, 0.3, 0.32), 0.45, 0.4, "y", 0.55, 0.7),
        ("noise", (0.8, 0.78, 0.8), 0.4, 1.0, 0.55, 0.7), ("belly", (0.42, 0.16, 0.13), 0.75), ("edge", (0.88, 0.86, 0.88), 0.45), ("cavity", (0.3, 0.08, 0.07), 0.6), ("ao", 0.7, 2.0)],
        "relief": [("wrinkle", 0.012, 0.6, (1, 5, 1)), ("pores", 0.004, 0.3, 0.3), ("grooves", 0.004, 1.2, 0.05)]},
    "gg_belly": {"base": (0.4, 0.15, 0.12), "layers": [("streak", (0.6, 0.35, 0.3), 0.45, 0.4, "x", 0.55, 0.7), ("ao", 0.7, 1.5)], "relief": [("grooves", 0.01, 0.7, 0.12)]},
    "gg_comb": {"base": (0.84, 0.78, 0.66), "layers": [("streak", (0.55, 0.45, 0.32), 0.55, 0.05, "z", 0.55, 0.7), ("grad", (0.5, 0.32, 0.22), 0.5, "z", 0.0, -3.5), ("ao", 0.7, 1.0)],
                "relief": [("grooves", 0.002, 0.08, 0.15)]},
    "gg_fringe": {"base": (0.7, 0.55, 0.52), "layers": [("grad", (0.45, 0.14, 0.12), 0.7, "z", -4.0, -1.0), ("noise", (0.85, 0.75, 0.72), 0.35, 0.5, 0.55, 0.7)]},
    # 08 — gold
    "am_body": {"base": (1.0, 0.72, 0.28), "layers": [("noise", (1.0, 0.9, 0.55), 0.5, 0.004, 0.5, 0.7)]},
    "am_hair": {"base": (1.0, 0.82, 0.45), "layers": []},
    # 09 — silver-grey scale armour, dark cracks glowing red; crimson-orange skin; red webs with copper edges; bone spines
    "sh_armor": {"base": (0.38, 0.38, 0.41), "layers": [
        ("noise", (0.6, 0.6, 0.64), 0.5, 0.4, 0.5, 0.7), ("noise", (0.12, 0.1, 0.11), 0.45, 0.15, 0.55, 0.7),
        ("cavity", (0.75, 0.12, 0.04), 0.75), ("edge", (0.85, 0.85, 0.88), 0.5), ("ao", 0.7, 0.8)],
        "relief": [("scales", 0.004, 0.12), ("grooves", 0.003, 0.25, 0.05)]},
    "sh_skin": {"base": (0.5, 0.08, 0.04), "layers": [("noise", (0.85, 0.3, 0.08), 0.55, 0.4, 0.5, 0.7), ("noise", (0.15, 0.03, 0.02), 0.4, 0.2, 0.56, 0.7), ("ao", 0.7, 0.8)],
                "relief": [("scales", 0.003, 0.1), ("wrinkle", 0.003, 0.3)]},
    "sh_web": {"base": (0.5, 0.12, 0.05), "layers": [("retic", (0.18, 0.03, 0.02), 0.5, 0.5, 0.03), ("edge", (0.95, 0.55, 0.25), 0.7), ("grad", (0.9, 0.35, 0.1), 0.4, "z", 0.0, 2.5)],
               "relief": [("veins", 0.002, 0.6, 0.03)]},
    "sh_spine": {"base": (0.75, 0.68, 0.6), "layers": [("grad", (0.2, 0.08, 0.06), 0.6, "z", 0.0, -1.5)]},
})


def strip(name, pts_a, pts_b, m, mats=None):
    """a thin double-sided ribbon between two polylines (lamellae, frills)"""
    bm = bmesh.new()
    ra = [bm.verts.new(p) for p in pts_a]
    rb = [bm.verts.new(p) for p in pts_b]
    for i in range(len(ra) - 1):
        bm.faces.new((ra[i], ra[i + 1], rb[i + 1], rb[i]))
    o = kit.from_bmesh(name, bm, (m,))
    kit.add_solidify(o, 0.01, 0.0)
    kit.bake(o)
    return o


# ================================================================================================ 01 Stormskimmer
def stormskimmer():
    kit.reset()
    root = empty("Stormskimmer")
    rng = random.Random(1601)
    sk = Skeleton()
    sk.add("body", (0, -3.5, 0), (0, 2.5, 0))
    sk.add("head", (0, 2.5, 0.05), (0, 8.8, -0.18), "body")
    tail = sk.chain("tail", [(0, -3.6, 0), (0, -6.8, 0.05), (0, -10.0, 0.1), (0, -13.6, 0.2)], "body")
    spar = {}
    for sx, s in ((-1, "L"), (1, "R")):
        sk.add(f"wing{s}1", (sx * 0.8, 0.9, 0.25), (sx * 6.5, 2.4, 0.7), "body")
        sk.add(f"wing{s}2", (sx * 6.5, 2.4, 0.7), (sx * 12.8, -5.2, -0.7), f"wing{s}1")
        sk.chain(f"tend{s}", [(sx * 0.4, -3.0, -0.1), (sx * 0.8, -6.5, -0.9), (sx * 1.2, -9.5, -1.8), (sx * 1.5, -12.5, -2.6)], "body")
        spar[s] = [V((sx * 0.8, 0.9, 0.25)), V((sx * 3.5, 2.2, 0.6)), V((sx * 6.5, 2.4, 0.7)), V((sx * 9.0, 0.8, 0.45)), V((sx * 11.2, -2.2, 0.0)), V((sx * 12.8, -5.2, -0.7))]
    parts = []
    body = Surf([(-3.9, 0.12, 0.1, 0.08, 0.0, 2.0), (-2.8, 0.55, 0.35, 0.28, 0.0, 2.3), (-0.5, 0.95, 0.62, 0.42, 0.05, 2.5), (1.6, 0.85, 0.58, 0.4, 0.08, 2.5),
                 (3.0, 0.55, 0.42, 0.32, 0.1, 2.4), (4.2, 0.3, 0.26, 0.2, 0.08, 2.2), (5.5, 0.14, 0.12, 0.1, 0.02, 2.0), (7.5, 0.05, 0.05, 0.04, -0.08, 2.0), (8.8, 0.012, 0.012, 0.012, -0.18, 2.0)])

    def bdisp(t, a):
        p = body.P(t, a)
        d = 0.06 * math.exp(-((a - PI / 2) / 0.1) ** 2) * sstep(0.08, 0.55, t)                 # dorsal ridge
        for sx in (-1, 1):
            d += 0.18 * math.exp(-(((p.x - sx * 0.75) / 0.35) ** 2 + ((p.y - 1.0) / 0.9) ** 2)) * (math.sin(a) > 0)   # shoulders
        d += 0.012 * noise.noise(p * 2.0) + 0.006 * max(0.0, math.cos(p.y * 9)) ** 4
        return d
    parts.append(Part(body.mesh("body", 110, 40, ("js_keel",), disp=bdisp), bones=["body", "head"]))
    hd = []
    for sx in (-1, 1):
        p, n = surf_at(body, 3.55, PI / 2 - sx * 1.15, -0.05)
        hd.append(eye(f"eye{sx}", p, n + V((0, 0.4, 0.1)), 0.14, "js_eye", cornea_m="cornea", pupil=(0.35, 0.35)))
        hd.append(kit.sphere(f"brow{sx}", 0.2, loc=tuple(p + V((0, 0.05, 0.12))), m="js_keel", segs=12, rings=6, scale=(1.0, 1.6, 0.45)))
        hd.append(fang(f"palp{sx}", V((sx * 0.18, 3.6, -0.2)), V((sx * 0.25, 1, -0.6)), V((0, 0, -1)), 0.9, 0.07, curve=0.55, m="js_spar", seg=6))
        for k in range(4):
            p2, _ = surf_at(body, 4.0 + 0.4 * k, PI / 2 - sx * 0.8, -0.01)
            hd.append(kit.sphere(f"nd{sx}{k}", 0.035, loc=tuple(p2), m="js_vein", segs=8, rings=4))
    parts.append(Part(kit.merge(hd, "headdet"), bone="head"))
    for sx, s in ((-1, "L"), (1, "R")):
        sp = spar[s]
        spath = [smooth_lerp(sp, (len(sp) - 1) * i / 40) for i in range(41)]
        # the leading-edge spar: thick at the shoulder, an elbow knuckle, tapering to the wingtip
        parts.append(Part(ringed(f"spar{s}", sp, lambda t: 0.32 * (1 - t) ** 0.9 + 0.035, "js_spar", rings=22, groove=0.08, seg=12, samples=90), bones=["body", f"wing{s}1", f"wing{s}2"]))
        parts.append(Part(kit.sphere(f"elbow{s}", 0.3, loc=tuple(sp[2]), m="js_spar", segs=14, rings=8), bones=[f"wing{s}1", f"wing{s}2"]))
        # the membrane: from the body side to the spar and round the scalloped trailing edge back to the tail
        n = 31
        trail_end = V((sx * 1.0, -3.6, 0.0))
        tip = sp[-1]
        edge = []
        for k in range(n):
            u = k / (n - 1)
            if u <= 0.55:
                edge.append(smooth_lerp(sp, (len(sp) - 1) * (u / 0.55)) + V((0, 0, -0.05)))
            else:
                w = (u - 0.55) / 0.45
                q = tip.lerp(trail_end, w ** 0.85)
                q.y += -2.4 * math.sin(PI * w) * (1 - 0.3 * w)                    # the trailing edge bows back
                q.y += 0.55 * abs(math.sin(w * PI * 4.5)) * math.sin(PI * w)       # scallops between finger ribs
                q.z += -0.35 * math.sin(PI * w)
                edge.append(q)
        base = [V((sx * (0.75 + 0.15 * math.sin(PI * k / (n - 1))), 1.5 - 5.0 * k / (n - 1), 0.05)) for k in range(n)]
        w_ = fin(f"wing{s}", base, edge, "js_wing", nv=12, rays=22, corr=0.05, scallop=0.0, ruffle=0.08, ruffle_f=5, thick=0.025,
                 rays_m="js_vein", ray_r=0.03, ray_taper=0.15, up=(0, 0, 1))
        parts.append(Part(w_, bones=["body", f"wing{s}1", f"wing{s}2"]))
        # dark finger ribs from the elbow to the trailing edge
        ribs = []
        for f_ in range(4):
            u = 0.6 + 0.09 * f_
            end = edge[int(u * (n - 1))]
            st = sp[2]
            mid = st.lerp(end, 0.5) + V((0, 0, 0.12))
            ribs.append(tube(f"rib{s}{f_}", [st, mid, end], [0.12, 0.07, 0.02], "js_spar", seg=7))
        parts.append(Part(kit.merge(ribs, f"ribs{s}"), bones=[f"wing{s}1", f"wing{s}2"]))
        # the trailing tendril
        tp = [V(sk.seg(f"tend{s}{i}")[0]) for i in (1, 2, 3)] + [V(sk.seg(f"tend{s}3")[1])]
        parts.append(Part(ringed(f"tnd{s}", tp, lambda t: 0.07 * (1 - t) + 0.006, "js_keel", rings=26, groove=0.12, seg=6, samples=70), bones=[f"tend{s}1", f"tend{s}2", f"tend{s}3"]))
    tp = [V(sk.seg(t)[0]) for t in tail] + [V(sk.seg(tail[-1])[1])]
    parts.append(Part(ringed("whip", tp, lambda t: 0.13 * (1 - t) ** 1.2 + 0.006, "js_keel", rings=30, groove=0.1, seg=8, samples=80), bones=tail + ["body"]))
    body_o = assemble("stormskimmer_body", sk, parts)
    arm = finish_creature(root, sk, body_o, os.path.join(kit.out_dir(), "jup_stormskimmer.glb"), props={"creature": "stormskimmer", "span": 25.6}, ao=1.2, paint=4096, nsize=2048)
    return root, arm


# ================================================================================================ 02 Skyjelly
def skyjelly():
    kit.reset()
    root = empty("Skyjelly")
    rng = random.Random(1602)
    sk = Skeleton()
    sk.add("bell", (0, 0, 0), (0, 0, 2.4))
    R, H = 3.5, 2.3
    parts = []

    def lathe(name, R_, H_, mat, ribs, rib_h, z0=0.0, flip=False):
        bm = bmesh.new()
        nr, na = 30, 128
        rows = []
        for i in range(nr + 1):
            t = i / nr
            th = t * PI * 0.5
            row = []
            for j in range(na):
                a = TAU * j / na
                rib = 1 + rib_h * max(0.0, math.cos(a * ribs)) ** 8 * math.sin(PI * min(1.0, t * 1.15))
                lap = 1 - 0.08 * max(0.0, math.cos(a * 16)) ** 2 * t ** 10           # scalloped lappets at the margin
                rr = R_ * math.sin(th) ** 0.85 * rib * lap
                z = z0 + H_ * max(0.0, math.cos(th)) ** 1.4 - 0.25 * t ** 8
                row.append(bm.verts.new((math.cos(a) * rr, math.sin(a) * rr, z)))
            rows.append(row)
        for i in range(nr):
            for j in range(na):
                bm.faces.new((rows[i][j], rows[i + 1][j], rows[i + 1][(j + 1) % na], rows[i][(j + 1) % na]))
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        o = kit.from_bmesh(name, bm, (mat,))
        kit.add_solidify(o, 0.04, -1.0)
        kit.bake(o)
        kit.smooth(o, 60)
        return o
    parts.append(Part(lathe("bell", R, H, "sj_bell", 32, 0.05), bone="bell"))
    parts.append(Part(lathe("inner", R * 0.86, H * 0.68, "sj_inner", 8, 0.02, z0=-0.05), bone="bell"))
    # the velum: an inturned skirt at the margin
    vel = []
    for j in range(64):
        a0, a1 = TAU * j / 64, TAU * (j + 1) / 64
        pa = [V((math.cos(a0) * R * 0.98, math.sin(a0) * R * 0.98, -0.22)), V((math.cos(a1) * R * 0.98, math.sin(a1) * R * 0.98, -0.22))]
        pb = [V((math.cos(a0) * R * 0.86, math.sin(a0) * R * 0.86, -0.45)), V((math.cos(a1) * R * 0.86, math.sin(a1) * R * 0.86, -0.45))]
        vel.append(strip(f"vl{j}", pa, pb, "sj_inner"))
    parts.append(Part(kit.merge(vel, "velum"), bone="bell"))
    # the gonad ring: a ruffled coral torus glowing through the bell
    gp, gr = [], []
    for k in range(97):
        a = TAU * k / 96
        rr = R * 0.56 + 0.12 * math.sin(a * 24)
        gp.append(V((math.cos(a) * rr, math.sin(a) * rr, 0.75 + 0.1 * math.sin(a * 12))))
        gr.append(0.22 + 0.08 * math.sin(a * 18) ** 2)
    parts.append(Part(tube("gonads", gp, gr, "sj_core", seg=10), bone="bell"))
    parts.append(Part(kit.sphere("core", 1.0, loc=(0, 0, 1.05), m="sj_core", segs=20, rings=12, scale=(1.1, 1.1, 0.55)), bone="bell"))
    # four long twisted frilled oral arms
    for k in range(4):
        a0 = TAU * k / 4 + 0.4
        ch = sk.chain(f"oral{k}", [(math.cos(a0) * 0.35, math.sin(a0) * 0.35, 0.4), (math.cos(a0) * 0.6, math.sin(a0) * 0.6, -3.0), (math.cos(a0) * 0.8, math.sin(a0) * 0.8, -6.5), (math.cos(a0) * 1.0, math.sin(a0) * 1.0, -10.0)], "bell")
        base, edge = [], []
        for q in range(26):
            u = q / 25
            c = V((math.cos(a0) * (0.35 + 0.65 * u), math.sin(a0) * (0.35 + 0.65 * u), 0.4 - 10.4 * u))
            tw = a0 + u * 5.0
            wdt = 0.55 * (1 - 0.6 * u) + 0.1
            base.append(c)
            edge.append(c + V((math.cos(tw) * wdt, math.sin(tw) * wdt, 0.0)))
        parts.append(Part(fin(f"arm{k}", base, edge, "sj_arm", nv=4, rays=16, ruffle=0.22, ruffle_f=9, thick=0.02), bones=ch))
    # seventy fine wavy tentacles from the rim, eight bundles
    for b in range(8):
        a0 = TAU * b / 8
        ch = sk.chain(f"tent{b}", [(math.cos(a0) * R * 0.95, math.sin(a0) * R * 0.95, -0.2 - 4.5 * k) for k in range(5)], "bell")
        tents = []
        for k in range(9):
            a = a0 + (k - 4) * 0.087
            base = V((math.cos(a) * R * 0.97, math.sin(a) * R * 0.97, -0.25))
            L = rng.uniform(5, 19)
            ph = rng.uniform(0, TAU)
            amp = rng.uniform(0.2, 0.5)
            path = [base + V((math.cos(a) * 0.4 * math.sin(PI * q / 18) + amp * math.sin(q * 0.55 + ph), math.sin(a) * 0.4 * math.sin(PI * q / 18) + amp * math.cos(q * 0.45 + ph), -L * q / 18)) for q in range(19)]
            tents.append(tube(f"t{b}{k}", path, [0.022 * (1 - 0.85 * q / 18) + 0.003 for q in range(19)], "sj_tent", seg=4))
        parts.append(Part(kit.merge(tents, f"tents{b}"), bones=ch))
    body = assemble("skyjelly_body", sk, parts)
    arm = finish_creature(root, sk, body, os.path.join(kit.out_dir(), "jup_skyjelly.glb"), props={"creature": "skyjelly", "bell": 7}, ao=0.6, paint=2048, nsize=1024)
    return root, arm


# ================================================================================================ 03 Stormbeast
def stormbeast():
    kit.reset()
    root = empty("Stormbeast")
    rng = random.Random(1603)
    sk = Skeleton()
    pts = [(0, 13.0, 1.0), (0, 7.0, 0.8), (0, 1.0, 0.6), (0, -5.0, 0.3), (0, -11.0, 0.0), (0, -17.0, -0.5), (0, -22.0, -1.0), (0, -25.0, -1.2)]
    sp = sk.chain("sp", pts, None)
    sk.add("head", pts[0], (0, 21.0, 2.6), sp[0])
    sk.add("jaw", (0, 14.5, -0.6), (0, 20.5, -4.8), "head")
    parts = []
    # neck, body and the upper head (raised: the gape opens about 70°)
    body = Surf([(-25.5, 0.1, 0.1, 0.1, -1.2, 2.0), (-21.0, 0.6, 0.6, 0.5, -0.9, 2.1), (-13.0, 1.5, 1.4, 1.3, -0.2, 2.2), (-3.0, 2.1, 1.9, 1.8, 0.5, 2.3),
                 (7.0, 2.4, 2.1, 1.9, 0.8, 2.3), (13.0, 2.7, 2.3, 1.4, 1.0, 2.4), (16.5, 2.8, 2.0, 0.55, 1.8, 2.6), (19.5, 2.2, 1.3, 0.35, 2.6, 2.4), (21.2, 0.8, 0.6, 0.2, 3.0, 2.2)])

    def bdisp(t, a):
        p = body.P(t, a)
        y = p.y
        f = (y / 1.25) % 1.0
        d = -0.2 * math.exp(-((f - 0.5) / 0.06) ** 2) * sstep(-24.0, -20.0, y) + 0.06 * math.sin(PI * f)   # annular creases
        d += 0.04 * noise.noise(p * 0.7) + 0.02 * noise.noise(p * 2.5)
        d += 0.16 * math.exp(-((a - PI / 2) / 0.12) ** 2) * sstep(0.1, 0.7, t)                                  # a low dorsal ridge
        d += 0.35 * math.exp(-((y - 16.8) / 1.0) ** 2) * math.exp(-((abs(math.cos(a)) - 0.55) / 0.25) ** 2) * (math.sin(a) > 0)  # heavy brows
        return d
    parts.append(Part(body.mesh("body", 220, 48, ("sb_hide", "sb_belly"), disp=bdisp, mat_fn=lambda t, a: 1 if math.sin(a) < -0.45 and body.sec(t)[0] < 14 else 0),
                      bones=sp + ["head"]))
    # the lower jaw, dropped wide
    jaw = Surf([(14.0, 2.4, 0.4, 1.3, -0.7, 2.4), (16.5, 2.4, 0.4, 1.1, -2.0, 2.5), (18.8, 1.9, 0.35, 0.8, -3.6, 2.4), (20.2, 0.9, 0.25, 0.4, -4.6, 2.2)])
    parts.append(Part(jaw.mesh("jaw", 40, 32, ("sb_hide", "sb_mouth"), mat_fn=lambda t, a: 1 if math.sin(a) > 0.15 else 0,
                               disp=lambda t, a: 0.05 * noise.noise(jaw.P(t, a) * 0.8)), bone="jaw"))
    # the throat: a red cavity with longitudinal folds, a tongue-like bulge
    thr = Surf([(12.5, 1.6, 1.5, 1.4, 0.2, 2.0), (15.5, 2.1, 1.9, 1.7, -0.2, 2.0), (18.0, 2.0, 1.6, 1.8, -0.6, 2.0)])
    parts.append(Part(thr.mesh("throat", 30, 40, ("sb_mouth",), disp=lambda t, a: 0.1 * max(0.0, math.cos(a * 11)) ** 4 - 0.05), bones=["head", "jaw"]))
    parts.append(Part(kit.sphere("tongue", 1.0, loc=(0, 16.5, -1.7), m="sb_mouth", segs=18, rings=10, scale=(1.3, 2.6, 0.55)), bone="jaw"))
    # rows of long hooked needle teeth round both rims, curving inward; shorter inner rows angled back
    up = mouth_curve(14.2, 21.0, 2.3, 0.9, 2.6, sharp=0.55)
    lo = mouth_curve(14.2, 20.2, 2.1, -1.1, -4.4, sharp=0.55)
    for nm, mf, bone, dirz in (("u", up, "head", -1), ("l", lo, "jaw", 1)):
        tt = []
        for row in range(3):
            n = 34 - 9 * row
            for i in range(n):
                sv = -0.97 + 1.94 * (i + 0.5 * row) / (n - 1)
                p = mf(sv) + V((-0.22 * row * math.sin(sv * PI / 2), -0.55 * row, -dirz * 0.18 * row))
                L = (1.2 + 0.9 * math.cos(sv * PI / 2) ** 2) * rng.uniform(0.7, 1.2) * (1 - 0.28 * row)
                inward = V((-math.sin(sv * PI / 2) * 0.35, -0.25 - 0.3 * row, dirz))
                tt.append(fang(f"t{nm}{row}{i}", p, inward, V((0, -1, 0)), L, 0.13 * (1 - 0.2 * row), curve=0.6, m="tooth", seg=6, n=7))
        parts.append(Part(kit.merge(tt, f"teeth{nm}"), bone=bone))
    hd = []
    for sx in (-1, 1):
        p, n = surf_at(body, 16.4, PI / 2 - sx * 0.95, -0.12)
        hd.append(eye(f"eye{sx}", p, n + V((0, 0.4, 0)), 0.22, "sh_eye", cornea_m="cornea", pupil=(0.35, 0.85), slit_axis=(0, 0, 1)))
    parts.append(Part(kit.merge(hd, "eyes"), bone="head"))
    # trailing membrane sheets (dorsal, ventral) and streamers off the tail
    for zs, nm in ((1, "dorsal"), (-1, "ventral")):
        bb, ee = [], []
        for k in range(14):
            y = 0.0 - 25.0 * k / 13
            p, n = surf_at(body, y, PI / 2 if zs > 0 else -PI / 2, -0.12)
            bb.append(p)
            ee.append(p + V((0, -1.6, zs * (0.8 + 1.8 * math.sin(PI * (0.15 + 0.85 * k / 13))))))
        parts.append(Part(fin(nm, bb, ee, "sb_sheet", nv=6, rays=24, corr=0.15, scallop=0.14, ruffle=0.45, ruffle_f=6, thick=0.05, rays_m="sb_hide", ray_r=0.05), bones=sp[2:]))
    for k in range(5):
        sx = (-1, -0.5, 0, 0.5, 1)[k]
        b = V((sx * 0.3, -24.5, -1.2))
        st = [b + V((sx * 1.4 * q / 10, -11.0 * q / 10, 0.9 * math.sin(PI * q / 10 + k))) for q in range(11)]
        parts.append(Part(tube(f"str{k}", st, [0.12 * (1 - q / 10) + 0.015 for q in range(11)], "sb_sheet", seg=5), bones=sp[-2:]))
    body_o = assemble("stormbeast_body", sk, parts)
    arm = finish_creature(root, sk, body_o, os.path.join(kit.out_dir(), "jup_stormbeast.glb"), props={"creature": "stormbeast", "length": 47}, ao=2.0, paint=4096, nsize=2048)
    return root, arm


# ================================================================================================ 04 Floating Colony unit
def colony():
    kit.reset()
    root = empty("ColonyUnit")
    rng = random.Random(1604)
    # a cauliflower mass of fused lobes (metaballs), brain-like folds cut into it
    els = [("ELLIPSOID", (0, 0, 0.2), 1.6, (1.0, 1.0, 0.7))]
    for k in range(14):
        a = rng.uniform(0, TAU)
        e = rng.uniform(-0.2, 1.0)
        d = rng.uniform(0.8, 1.6)
        els.append(("BALL", (math.cos(a) * d * math.cos(e), math.sin(a) * d * math.cos(e), 0.3 + math.sin(e) * 0.9), rng.uniform(0.55, 0.95)))
    lump = meta("lump", els, "co_body", res=0.1)
    for v in lump.data.vertices:
        p = v.co.copy()
        n = v.normal.copy()
        fold = abs(noise.noise(p * 1.4 + Vector((3, 1, 0))))
        d = -0.22 * (1 - sstep(0.0, 0.12, fold)) + 0.1 * noise.noise(p * 0.9) + 0.05 * noise.noise(p * 3.0)
        v.co = p + n * d
    kit.smooth(lump, 60)
    parts = [lump]
    # a beard of branching root-like threads below; a few small pods
    for k in range(22):
        a = rng.uniform(0, TAU)
        r0 = rng.uniform(0.0, 1.3)
        b = V((math.cos(a) * r0, math.sin(a) * r0, -0.55))
        L = rng.uniform(3, 9)
        ph = rng.uniform(0, TAU)
        pts = [b + V((0.35 * math.sin(q * 0.8 + ph) * q / 10, 0.35 * math.cos(q * 0.6 + ph) * q / 10, -L * q / 10)) for q in range(11)]
        parts.append(tube(f"th{k}", pts, [0.07 * (1 - q / 10) + 0.008 for q in range(11)], "co_thread", seg=5))
        for br in range(rng.randint(0, 2)):
            j = rng.randint(3, 7)
            d = V((rng.uniform(-1, 1), rng.uniform(-1, 1), -1.2)).normalized()
            bl = rng.uniform(1.0, 2.5)
            parts.append(tube(f"tb{k}{br}", [pts[j], pts[j] + d * bl * 0.5, pts[j] + d * bl], [0.035, 0.02, 0.006], "co_thread", seg=4))
    for k in range(3):
        a = rng.uniform(0, TAU)
        c = V((math.cos(a) * 2.6, math.sin(a) * 2.6, -0.8 - k))
        parts.append(kit.sphere(f"pod{k}", 0.35, loc=tuple(c), m="co_body", segs=12, rings=8, scale=(1, 1, 0.75)))
        parts.append(tube(f"pt{k}", [c, c + V((0.1, 0.1, -1.5)), c + V((0.2, -0.1, -3.0))], [0.04, 0.025, 0.006], "co_thread", seg=4))
    body = kit.merge(parts, "colony_body")
    export_static(root, body, os.path.join(kit.out_dir(), "jup_colony.glb"), {"creature": "colony"}, size=2048, nsize=1024, ao=0.6)
    return root, None


# ================================================================================================ 05 Voltdrifter
def voltdrifter():
    kit.reset()
    root = empty("Voltdrifter")
    rng = random.Random(1605)
    sk = Skeleton()
    sk.add("mantle", (0, -5.5, 0), (0, 1.0, 0))
    sk.add("head", (0, 1.0, 0), (0, 2.6, 0), "mantle")
    parts = []
    mant = Surf([(-6.3, 0.02, 0.02, 0.02, 0.0, 2.0), (-5.2, 0.32, 0.3, 0.27, 0.0, 2.0), (-3.2, 0.72, 0.68, 0.6, 0.0, 2.0), (-1.0, 0.95, 0.9, 0.8, 0.0, 2.0),
                 (0.4, 0.92, 0.88, 0.78, 0.0, 2.0), (1.1, 0.78, 0.74, 0.66, 0.0, 2.0)])

    def mdisp(t, a):
        p = mant.P(t, a)
        return 0.02 * noise.noise(p * 2.5) + 0.012 * max(0.0, noise.noise(p * 7.0)) + 0.05 * math.exp(-((a - PI / 2) / 0.1) ** 2) * sstep(0.1, 0.8, t)
    parts.append(Part(mant.mesh("mantle", 80, 40, ("vd_skin", "vd_belly"), disp=mdisp, mat_fn=lambda t, a: 1 if math.sin(a) < -0.55 else 0), bone="mantle"))
    head = Surf([(0.9, 0.8, 0.76, 0.68, 0.0, 2.0), (1.5, 0.9, 0.85, 0.75, 0.0, 2.0), (2.2, 0.72, 0.68, 0.62, -0.02, 2.0), (2.7, 0.5, 0.46, 0.44, -0.04, 2.0), (3.0, 0.38, 0.35, 0.35, -0.05, 2.0)])
    parts.append(Part(head.mesh("head", 40, 36, ("vd_skin", "vd_belly"), mat_fn=lambda t, a: 1 if math.sin(a) < -0.6 else 0,
                                disp=lambda t, a: 0.015 * noise.noise(head.P(t, a) * 3)), bone="head"))
    # two narrow blade fins near the mantle tip
    for sx, s in ((-1, "L"), (1, "R")):
        base = [V((sx * 0.25, -6.0 + 2.6 * k / 7, 0)) for k in range(8)]
        edge = [V((sx * (0.25 + 2.3 * math.sin(PI * (k / 7) ** 0.75) ** 1.4), -6.9 + 2.9 * k / 7 - 0.6 * math.sin(PI * k / 7), 0.05)) for k in range(8)]
        parts.append(Part(fin(f"fin{s}", base, edge, "vd_fin", nv=6, rays=12, corr=0.02, thick=0.02, rays_m="vd_skin", ray_r=0.015), bone="mantle"))
    hd = []
    for sx in (-1, 1):
        p, n = surf_at(head, 1.75, PI / 2 - sx * 1.2, -0.05)
        n = (n + V((0, 0.25, 0.1))).normalized()
        hd.append(eye(f"eye{sx}", p, n, 0.34, "vd_iris", cornea_m="cornea", pupil=(0.45, 0.45)))
        lid = []
        for k in range(25):     # a dark lid ring round the eye
            a = TAU * k / 24
            u = n.orthogonal().normalized()
            v = n.cross(u)
            lid.append(p + n * 0.12 + (u * math.cos(a) + v * math.sin(a)) * 0.39)
        hd.append(tube(f"lid{sx}", lid, [0.07] * 25, "vd_lid", seg=8))
    hd.append(fang("beakU", V((0, 3.0, 0.08)), V((0, 1, -0.5)), V((0, 0, -1)), 0.32, 0.12, curve=0.45, m="claw_black", seg=6))
    hd.append(fang("beakL", V((0, 3.0, -0.12)), V((0, 1, 0.2)), V((0, 0, 1)), 0.26, 0.1, curve=0.35, m="claw_black", seg=6))
    parts.append(Part(kit.merge(hd, "headdet"), bone="head"))
    # eight long curling arms with sucker rows, two longer clubbed tentacles
    for k in range(10):
        a = TAU * k / 10 + 0.15
        long = k in (2, 7)
        L = 10.0 if long else 6.5
        b = V((math.cos(a) * 0.32, 2.85, math.sin(a) * 0.32))
        curl = rng.uniform(0.3, 0.8) * (1 if k % 2 else -1)
        pts = []
        for q in range(6):
            u = q / 5
            pts.append(b + V((math.cos(a) * (0.6 * u) + curl * 0.6 * u * u, L * u * (1 - 0.15 * u), math.sin(a) * (0.6 * u) - 1.6 * u * u)))
        ch = sk.chain(f"arm{k}", [tuple(p) for p in pts], "head")
        r0 = 0.11 if long else 0.2
        armp = [ringed(f"a{k}", pts, (lambda t, r0=r0: r0 * (1 - 0.92 * t ** 0.85) + 0.008), "vd_skin", rings=40 if long else 26, groove=0.06, seg=10, samples=90)]
        ts = TubeSurf(pts, lambda t, r0=r0: r0 * (1 - 0.92 * t ** 0.85) + 0.008, ref=(0, 0, 1))
        for q in range(16 if long else 22):      # sucker rows on the inner face
            tq = 0.1 + 0.8 * q / (16 if long else 22)
            for side in (-0.35, 0.35):
                hp = ts.P(tq, PI + side)
                hd_r = (r0 * (1 - 0.92 * tq ** 0.85) + 0.008) * 0.35
                armp.append(kit.sphere(f"s{k}{q}{side}", hd_r, loc=tuple(hp), m="vd_belly", segs=6, rings=4, scale=(1, 1, 0.5)))
        if long:
            armp.append(kit.sphere(f"club{k}", 0.18, loc=tuple(pts[-1]), m="vd_skin", segs=12, rings=8, scale=(1, 2.2, 0.6)))
        parts.append(Part(kit.merge(armp, f"arm{k}"), bones=ch))
    body = assemble("voltdrifter_body", sk, parts)
    arm = finish_creature(root, sk, body, os.path.join(kit.out_dir(), "jup_voltdrifter.glb"), props={"creature": "voltdrifter", "length": 16}, ao=0.6, paint=4096, nsize=2048)
    return root, arm


# ================================================================================================ 06 Deepdiver
def deepdiver():
    kit.reset()
    root = empty("Deepdiver")
    rng = random.Random(1606)
    sk = Skeleton()
    sp = sk.chain("sp", [(0, 7.5, 0), (0, 2.5, 0), (0, -2.5, 0.1), (0, -7.0, 0.2)], None)
    sk.add("jaw", (0, 4.5, -0.9), (0, 8.2, -0.8), sp[0])
    for sx, s in ((-1, "L"), (1, "R")):
        sk.add(f"fin{s}", (sx * 1.4, 2.0, 0), (sx * 6.0, -2.0, 0.2), sp[1])
    parts = []
    body = Surf([(-7.5, 0.1, 0.1, 0.1, 0.2, 2.0), (-6.0, 0.7, 0.6, 0.5, 0.15, 2.2), (-2.5, 1.6, 1.3, 1.1, 0.05, 2.4), (1.0, 1.9, 1.5, 1.2, 0.0, 2.6),
                 (4.5, 1.7, 1.35, 1.1, -0.05, 2.7), (7.0, 1.2, 1.0, 0.8, -0.1, 2.6), (8.3, 0.6, 0.55, 0.5, -0.12, 2.3), (8.8, 0.1, 0.12, 0.1, -0.12, 2.0)])

    def bdisp(t, a):
        p = body.P(t, a)
        d = 0.03 * noise.noise(p * 1.2)
        # the long mouth line from the blunt snout back along the side
        if p.y > 3.5:
            d -= 0.1 * math.exp(-((math.sin(a) + 0.15) / 0.05) ** 2) * sstep(3.5, 5.0, p.y)
        return d
    parts.append(Part(body.mesh("body", 90, 44, ("dd_skin",), disp=bdisp), bones=sp))
    pl = []
    for r in range(11):
        tc = 0.1 + 0.8 * r / 10
        for c in range(7):
            ac = 0.07 * PI + 0.86 * PI * (c + 0.5) / 7
            pl.append(plate(f"p{r}{c}", body.P, body.N, tc, ac + rng.uniform(-0.04, 0.04), 0.05, 0.17, "dd_plate", rng, rear=-1, lift=0.16, thick=0.09,
                            dome=0.25, jag=0.08, keel=0.07, tip=1.6, sides=3, sides_rot=0.25, K=18, rings=3, inset=0.04))
    for k in range(14):       # the dorsal spike row
        y = 6.0 - 12.5 * k / 13
        p, n = surf_at(body, y, PI / 2, 0.05)
        pl.append(fang(f"sp{k}", p, V((0, -0.8, 1)), V((0, -1, 0)), 0.9 * (1 - 0.4 * k / 13) * rng.uniform(0.8, 1.2), 0.18, curve=0.25, m="dd_plate", seg=4, n=4, flat=0.4))
    for sx in (-1, 1):        # brow plates over the eyes
        for k in range(3):
            p, n = surf_at(body, 6.4 - 0.5 * k, PI / 2 - sx * 0.85, 0.03)
            pl.append(fang(f"br{sx}{k}", p, V((sx * 0.4, -0.6, 0.7)), V((0, -1, 0)), 0.5, 0.14, curve=0.2, m="dd_plate", seg=4, n=4, flat=0.5))
    parts.append(Part(kit.merge(pl, "plates"), bones=sp))
    jaw = Surf([(4.5, 1.15, 0.2, 0.6, -0.7, 2.6), (6.5, 0.95, 0.18, 0.5, -0.7, 2.6), (8.0, 0.5, 0.12, 0.3, -0.62, 2.3)])
    parts.append(Part(jaw.mesh("jaw", 26, 22, ("dd_skin",)), bone="jaw"))
    for sx in (-1, 1):
        p, n = surf_at(body, 6.2, PI / 2 - sx * 1.25, -0.04)
        parts.append(Part(eye(f"eye{sx}", p, n + V((0, 0.3, 0)), 0.14, "dd_eye", cornea_m="cornea", pupil=(0.35, 0.8), slit_axis=(0, 0, 1)), bone=sp[0]))
    # stacked swept fin-wings, plate-edged
    for sx, s in ((-1, "L"), (1, "R")):
        for L_ in range(3):
            y0 = 3.2 - 1.7 * L_
            base = [V((sx * 1.45, y0 - 2.4 * k / 6, 0.35 - 0.3 * L_)) for k in range(7)]
            span = 5.0 - 1.1 * L_
            edge = [V((sx * (1.45 + span * math.sin(PI * (0.15 + 0.85 * k / 6)) ** 0.55), y0 - 2.4 * k / 6 - span * 0.75, 0.45 - 0.35 * L_)) for k in range(7)]
            parts.append(Part(fin(f"wf{s}{L_}", base, edge, "dd_fin", nv=7, rays=12, corr=0.06, scallop=0.12, thick=0.06, rays_m="dd_plate", ray_r=0.06, ray_taper=0.3), bones=[f"fin{s}", sp[1]]))
    parts.append(Part(foil("tailf", V((0, -7.0, 0.2)), V((0, -0.6, 0.8)), V((0, -1, 0)), 2.8, lambda u: (1.7 * (1 - u) ** 0.8 + 0.1, 0.2 * (1 - u) + 0.02, 1.1 * u), "dd_fin"), bone=sp[-1]))
    parts.append(Part(foil("tailf2", V((0, -7.0, 0.1)), V((0, -0.6, -0.8)), V((0, -1, 0)), 2.2, lambda u: (1.5 * (1 - u) ** 0.8 + 0.1, 0.18 * (1 - u) + 0.02, 1.0 * u), "dd_fin"), bone=sp[-1]))
    body_o = assemble("deepdiver_body", sk, parts)
    arm = finish_creature(root, sk, body_o, os.path.join(kit.out_dir(), "jup_deepdiver.glb"), props={"creature": "deepdiver", "length": 16}, ao=0.8, paint=4096, nsize=2048)
    return root, arm


# ================================================================================================ 07 Gasgrazer
def gasgrazer():
    kit.reset()
    root = empty("Gasgrazer")
    rng = random.Random(1607)
    sk = Skeleton()
    sp = sk.chain("sp", [(0, 10.0, 0), (0, 3.0, 0.3), (0, -4.0, 0.3), (0, -10.0, 0.0), (0, -15.0, -0.4)], None)
    sk.add("head", (0, 10.0, 0), (0, 15.5, 0.8), sp[0])
    sk.add("comb", (0, 12.5, -0.8), (0, 15.0, -3.8), "head")
    parts = []
    body = Surf([(-15.5, 0.2, 0.2, 0.2, -0.4, 2.0), (-12.0, 1.2, 1.1, 1.0, -0.2, 2.1), (-5.0, 3.0, 2.6, 2.6, 0.0, 2.2), (2.0, 3.8, 3.3, 3.4, 0.0, 2.3),
                 (8.0, 4.0, 3.4, 3.9, -0.2, 2.4), (11.5, 3.9, 3.3, 4.3, -0.5, 2.5), (13.8, 3.5, 2.9, 4.4, -0.8, 2.6), (15.0, 2.8, 2.2, 4.0, -1.0, 2.5), (15.7, 1.5, 1.4, 2.4, -0.6, 2.2)])
    MOUTH_Y = 13.0

    def in_mouth(p):
        return p.y > MOUTH_Y and p.z < 0.8 and p.z > -4.6

    def bdisp(t, a):
        p = body.P(t, a)
        d = 0.08 * noise.noise(p * 0.45) + 0.04 * noise.noise(p * 1.8)
        d += 0.05 * max(0.0, math.cos(p.x * 1.6)) ** 6 * (math.sin(a) < -0.3) * sstep(0.0, 10.0, p.y)           # throat grooves
        # the arched mouth: the front-lower face is opened (cut back) behind a thick upper lip
        if in_mouth(p):
            d -= 1.4 * sstep(MOUTH_Y, MOUTH_Y + 1.6, p.y) * sstep(0.8, 0.2, p.z) * sstep(-4.6, -3.8, p.z)
        return d
    parts.append(Part(body.mesh("body", 130, 56, ("gg_hide", "gg_belly"), disp=bdisp, mat_fn=lambda t, a: 1 if math.sin(a) < -0.5 else 0), bones=sp + ["head"]))
    # the mouth: a dark cavity, an arched upper lip, the lower jaw rim, and the baleen curtain between them
    arc = lambda sv, z: V((3.55 * math.sin(sv * PI / 2), 15.3 - 2.8 * (1 - math.cos(sv * PI / 2)), z))
    mouth = [kit.sphere("cavity", 1.0, loc=(0, 12.8, -1.9), m="mouth_red", segs=24, rings=14, scale=(3.0, 2.0, 2.6))]
    mouth.append(tube("lipU", [arc(-1 + 2 * k / 40, 0.85) for k in range(41)], [0.38] * 41, "gg_hide", seg=10))
    mouth.append(tube("lipL", [arc(-1 + 2 * k / 40, -4.55) + V((0, -0.2, 0)) for k in range(41)], [0.3] * 41, "gg_belly", seg=10))
    for i in range(150):
        sv = -0.97 + 1.94 * i / 149
        top, bot = arc(sv, 0.65), arc(sv, -4.4) + V((0, -0.25, 0))
        n_ = V((math.sin(sv * PI / 2), math.cos(sv * PI / 2), 0)).normalized()
        side = V((0, 0, 1)).cross(n_).normalized() * 0.06
        a_ = [top.lerp(bot, q / 6) + n_ * (0.18 * math.sin(PI * q / 6)) for q in range(7)]
        mouth.append(strip(f"c{i}", [p - side for p in a_], [p + side + n_ * 0.02 for p in a_], "gg_comb"))
    parts.append(Part(kit.merge(mouth, "mouth"), bones=["head", "comb"]))
    for sx in (-1, 1):
        p, n = surf_at(body, 12.2, PI / 2 - sx * 0.85, -0.06)
        parts.append(Part(eye(f"eye{sx}", p, n, 0.2, "mo_eye", cornea_m="cornea", pupil=(0.5, 0.5)), bone="head"))
        folds = []
        for k in range(3):
            ring = []
            for q in range(17):
                a = TAU * q / 16
                u = n.orthogonal().normalized()
                v = n.cross(u)
                ring.append(p + n * 0.05 + (u * math.cos(a) + v * math.sin(a)) * (0.32 + 0.14 * k))
            folds.append(tube(f"f{sx}{k}", ring, [0.05] * 17, "gg_hide", seg=6))
        parts.append(Part(kit.merge(folds, f"folds{sx}"), bone="head"))
    # tusk-like fringes curving down and back from the chin and belly
    fr = []
    for k in range(30):
        y = 13.0 - 15.0 * k / 29
        a = -PI / 2 + rng.uniform(-0.75, 0.75)
        p, n = surf_at(body, y, a, -0.15)
        L = rng.uniform(5, 11) * (1.2 if k < 10 else 1.0)
        fr.append(fang(f"fr{k}", p, V((math.cos(a) * 0.3, -0.75, -1)), V((0, -1, 0)), L, 0.26, curve=0.35, m="gg_fringe", seg=8, n=9))
    parts.append(Part(kit.merge(fr, "fringes"), bones=sp + ["head"]))
    for sx, s in ((-1, "L"), (1, "R")):
        parts.append(Part(foil(f"pec{s}", V((sx * 3.4, 5.0, -2.0)), V((sx * 0.8, -0.5, -0.4)), V((0, -1, 0)), 4.8,
                               lambda u: (2.6 * (1 - u) ** 0.8 + 0.2, 0.35 * (1 - u) + 0.03, 1.4 * u), "gg_hide"), bone=sp[1]))
    parts.append(Part(foil("flukeL", V((-0.3, -15.0, -0.4)), V((-1.0, -0.5, 0.05)), V((0, -1, 0)), 4.8, lambda u: (2.2 * (1 - u) ** 0.7 + 0.15, 0.3 * (1 - u) + 0.03, 1.7 * u), "gg_hide"), bone=sp[-1]))
    parts.append(Part(foil("flukeR", V((0.3, -15.0, -0.4)), V((1.0, -0.5, 0.05)), V((0, -1, 0)), 4.8, lambda u: (2.2 * (1 - u) ** 0.7 + 0.15, 0.3 * (1 - u) + 0.03, 1.7 * u), "gg_hide"), bone=sp[-1]))
    body_o = assemble("gasgrazer_body", sk, parts)
    arm = finish_creature(root, sk, body_o, os.path.join(kit.out_dir(), "jup_gasgrazer.glb"), props={"creature": "gasgrazer", "length": 31}, ao=2.0, paint=4096, nsize=2048)
    return root, arm


# ================================================================================================ 08 Aeromite
def aeromite():
    kit.reset()
    root = empty("Aeromite")
    rng = random.Random(1608)
    parts = [kit.sphere("seed", 1.0, loc=(0, 0, 0), m="am_body", segs=10, rings=6, scale=(0.0035, 0.008, 0.0035))]
    for k in range(9):
        d = V((rng.uniform(-1, 1), rng.uniform(-0.6, 0.4), rng.uniform(-1, 1))).normalized()
        L = rng.uniform(0.018, 0.045)
        b = V((0, -0.003, 0))
        parts.append(tube(f"h{k}", [b, b + d * L * 0.5 + V((0, -0.002, 0)), b + d * L], [0.0006, 0.0004, 0.0001], "am_hair", seg=3))
    body = kit.merge(parts, "aeromite_body")
    export_static(root, body, os.path.join(kit.out_dir(), "jup_aeromite.glb"), {"creature": "aeromite"}, size=128, lods=None)
    return root, None


# ================================================================================================ 09 Stormhunter
def stormhunter():
    kit.reset()
    root = empty("Stormhunter")
    rng = random.Random(1609)
    sk = Skeleton()
    pts = [(0, 8.5, 1.2), (0, 4.5, 0.5), (0, 0.5, 0.0), (0, -3.5, -0.2), (0, -7.5, 0.0), (0, -11.0, 0.4), (0, -14.5, 0.8)]
    sp = sk.chain("sp", pts, None)
    sk.add("head", pts[0], (0, 14.0, 1.8), sp[0])
    sk.add("jaw", (0, 9.6, 0.6), (0, 13.6, -0.5), "head")
    parts = []
    body = Surf([(-15.0, 0.08, 0.08, 0.08, 0.8, 2.0), (-11.0, 0.55, 0.55, 0.5, 0.4, 2.1), (-5.0, 1.2, 1.15, 1.05, -0.1, 2.2), (1.0, 1.45, 1.35, 1.25, 0.0, 2.3),
                 (5.5, 1.15, 1.05, 0.95, 0.4, 2.3), (8.5, 0.95, 0.95, 0.75, 1.1, 2.4), (10.5, 0.8, 0.65, 0.38, 1.3, 2.6), (12.5, 0.45, 0.4, 0.18, 1.5, 2.4), (14.2, 0.06, 0.1, 0.05, 1.3, 2.0)])
    parts.append(Part(body.mesh("body", 150, 40, ("sh_armor", "sh_skin"), mat_fn=lambda t, a: 1 if math.sin(a) < -0.35 else 0,
                                disp=lambda t, a: 0.03 * noise.noise(body.P(t, a) * 1.2) + 0.15 * math.exp(-((body.sec(t)[0] - 9.6) / 0.6) ** 2) * math.exp(-((abs(math.cos(a)) - 0.6) / 0.2) ** 2) * (math.sin(a) > 0)),
                      bones=sp + ["head"]))
    # silver scale armour along the back and flanks
    pl = []
    for r in range(22):
        tc = 0.06 + 0.82 * r / 21
        for c in range(6):
            ac = 0.16 * PI + 0.68 * PI * (c + 0.5) / 6
            pl.append(plate(f"a{r}{c}", body.P, body.N, tc, ac, 0.022, 0.18, "sh_armor", rng, rear=-1, lift=0.07, thick=0.045, dome=0.35, jag=0.1, keel=0.035, tip=1.3, K=16, rings=3, inset=0.02))
    parts.append(Part(kit.merge(pl, "armor"), bones=sp))
    # the open jaw and the needle teeth; the hooked tip
    jaw = Surf([(9.6, 0.62, 0.12, 0.3, 0.45, 2.4), (11.5, 0.5, 0.1, 0.25, 0.1, 2.5), (13.0, 0.28, 0.08, 0.16, -0.25, 2.3), (13.7, 0.05, 0.04, 0.05, -0.4, 2.0)])
    parts.append(Part(jaw.mesh("jaw", 34, 22, ("sh_armor", "sb_mouth"), mat_fn=lambda t, a: 1 if math.sin(a) > 0.3 else 0), bone="jaw"))
    teeth = []
    for sx in (-1, 1):
        for i in range(18):
            y = 9.8 + 4.0 * i / 17
            wU = body.sec(surf_t(body, min(y, 14.0)))[1] * 0.9
            zc = body.sec(surf_t(body, min(y, 14.0)))[4]
            teeth.append(fang(f"tu{sx}{i}", V((sx * wU, y, zc - 0.05)), V((sx * 0.1, 0.35, -1)), V((0, 1, 0)), 0.38 - 0.14 * i / 17, 0.065, curve=0.5, m="tooth", seg=5, n=5))
            yj = 9.9 + 3.6 * i / 17
            wL = jaw.sec(surf_t(jaw, yj))[1] * 0.9
            zj = jaw.sec(surf_t(jaw, yj))[4]
            teeth.append(fang(f"tl{sx}{i}", V((sx * wL, yj, zj + 0.08)), V((sx * 0.1, 0.35, 1)), V((0, 1, 0)), 0.32 - 0.12 * i / 17, 0.055, curve=0.5, m="tooth", seg=5, n=5))
    teeth.append(fang("hook", V((0, 13.9, 1.35)), V((0, 1, -0.9)), V((0, 0, -1)), 0.8, 0.13, curve=0.75, m="sh_spine", seg=6))
    for sx in (-1, 1):
        p, n = surf_at(body, 10.1, PI / 2 - sx * 0.95, -0.03)
        teeth.append(eye(f"eye{sx}", p, n + V((0, 0.3, 0)), 0.12, "sh_eye", cornea_m="cornea", pupil=(0.3, 0.9), slit_axis=(0, 0, 1)))
    parts.append(Part(kit.merge(teeth, "headdet"), bone="head"))
    # the crest: long backward spikes on the skull and neck, cheek spikes, a spine row down the back
    sp_ = []
    for k in range(30):
        y = 10.4 - 24.0 * k / 29
        p, n = surf_at(body, y, PI / 2 + (0.25 if k % 2 else -0.25) * (k < 8), 0.02)
        L = (2.6 if k < 6 else 1.4 if k < 12 else 0.8) * (1 - 0.45 * k / 29) * rng.uniform(0.8, 1.2)
        sp_.append(fang(f"s{k}", p, V((0, -0.9, 0.75)), V((0, -1, 0)), L, 0.13 if k < 6 else 0.1, curve=0.35, m="sh_spine", seg=5, n=6))
    for sx in (-1, 1):
        for k in range(4):
            p, n = surf_at(body, 9.6 - 0.6 * k, PI / 2 - sx * 1.25, 0.0)
            sp_.append(fang(f"ck{sx}{k}", p, V((sx * 0.8, -0.8, 0.1)), V((0, -1, 0)), 0.9 - 0.15 * k, 0.07, curve=0.3, m="sh_spine", seg=4, n=5))
    parts.append(Part(kit.merge(sp_, "spines"), bones=sp + ["head"]))
    # lionfish-like frill fins: spiny rays with red webbing, copper edges; streaming filaments
    for sx, s in ((-1, "L"), (1, "R")):
        for k, (y0, span) in enumerate(((7.0, 3.6), (2.5, 4.2), (-3.5, 3.4))):
            bb = [V((sx * 1.0, y0 - 2.8 * q / 6, 0.1)) for q in range(7)]
            ee = [V((sx * (1.0 + span * math.sin(PI * (0.15 + 0.85 * q / 6)) ** 0.5), y0 - 2.8 * q / 6 - span * 0.85, 0.9 + 0.3 * math.sin(q))) for q in range(7)]
            parts.append(Part(fin(f"web{s}{k}", bb, ee, "sh_web", nv=6, rays=13, corr=0.1, scallop=0.32, ruffle=0.2, ruffle_f=6, thick=0.035, rays_m="sh_spine", ray_r=0.05, ray_taper=0.15),
                              bones=sp[0:2] if k == 0 else (sp[1:4] if k == 1 else sp[3:6])))
            for q in range(3):
                b = ee[2 + q]
                parts.append(Part(tube(f"fil{s}{k}{q}", [b, b + V((sx * 0.3, -2.5, -0.3)), b + V((sx * 0.6, -5.5, -0.9))], [0.03, 0.015, 0.003], "sh_web", seg=4),
                                  bones=sp[0:2] if k == 0 else (sp[1:4] if k == 1 else sp[3:6])))
    tb = [V((0, -11.0 - 3.6 * q / 5, 0.5 + 0.06 * q)) for q in range(6)]
    te = [b + V((0, -0.6, 1.6 * math.sin(PI * (0.2 + 0.8 * q / 5)))) for q, b in enumerate(tb)]
    parts.append(Part(fin("tailweb", tb, te, "sh_web", nv=5, rays=10, scallop=0.3, thick=0.04, rays_m="sh_spine", ray_r=0.04), bones=sp[-2:]))
    body_o = assemble("stormhunter_body", sk, parts)
    arm = finish_creature(root, sk, body_o, os.path.join(kit.out_dir(), "jup_stormhunter.glb"), props={"creature": "stormhunter", "length": 29}, ao=1.0, paint=4096, nsize=2048)
    return root, arm


ALL = ["stormskimmer", "skyjelly", "stormbeast", "colony", "voltdrifter", "deepdiver", "gasgrazer", "aeromite", "stormhunter"]
VIEWS = {
    "stormskimmer": ((18, 24, 10), (0, 0, 0), 35), "skyjelly": ((14, 16, 2), (0, 0, -4), 35), "stormbeast": ((24, 40, 6), (0, 10, 0), 35),
    "colony": ((9, 10, 3), (0, 0, -2), 35), "voltdrifter": ((10, 14, 5), (0, 1, 0), 35), "deepdiver": ((12, 18, 5), (0, 2, 0), 35),
    "gasgrazer": ((22, 40, 2), (0, 8, -1.5), 35), "aeromite": ((0.06, 0.07, 0.04), (0, 0, 0), 50), "stormhunter": ((14, 26, 6), (0, 5, 0.8), 35),
}

if __name__ == "__main__":
    which = [a for a in sys.argv[1:] if not a.startswith("--")] or ALL
    for w in which:
        globals()[w]()
        if "--nopreview" not in sys.argv:
            cam, tgt, lens = VIEWS[w]
            preview(f"jup_{w}", cam, tgt, lens=lens, world=(0.32, 0.26, 0.24))
