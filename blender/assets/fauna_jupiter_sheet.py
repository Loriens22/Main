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
    "vd_iris": dict(color=(0.03, 0.11, 0.34), rough=0.03),
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
    "sb_hide": {"base": (0.27, 0.17, 0.115), "layers": [
        ("noise", (0.52, 0.26, 0.12), 0.6, 0.9, 0.5, 0.66, (1, 1, 1), 1.2), ("streak", (0.18, 0.1, 0.07), 0.5, 0.35, "y", 0.55, 0.7),
        ("cavity", (0.1, 0.04, 0.025), 0.8), ("noise", (0.45, 0.4, 0.36), 0.35, 0.4, 0.58, 0.72), ("speck", (0.7, 0.42, 0.25), 0.3, 0.04, 0.76),
        ("belly", (0.56, 0.4, 0.3), 0.6), ("edge", (0.72, 0.52, 0.38), 0.5), ("ao", 0.75, 1.5)],
        "relief": [("wrinkle", 0.012, 0.3, (4, 1, 1)), ("wrinkle", 0.006, 0.12, (1, 3, 1)), ("pores", 0.003, 0.15, 0.3)]},
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
    "gg_comb": {"base": (0.9, 0.85, 0.74), "layers": [("streak", (0.66, 0.56, 0.42), 0.4, 0.05, "z", 0.55, 0.7), ("noise", (0.97, 0.94, 0.86), 0.35, 0.3, 0.5, 0.7), ("ao", 0.2, 0.3)],
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
    """panel 01, a manta-like skyray: the wing root runs the whole length of the body, the leading edge sweeps back in a
    convex arc to a pointed tip, the trailing edge returns to the tail root in a shallow concave curve; a streamlined
    head ending in a short pointed beak, a silver-ringed eye; a ridge from shoulder to tip on each wing; one whip tail"""
    kit.reset()
    root = empty("Stormskimmer")
    rng = random.Random(1611)
    sk = Skeleton()
    sk.add("body", (0, -5.0, 0), (0, 2.2, 0))
    sk.add("head", (0, 2.2, 0.05), (0, 8.4, -0.15), "body")
    tail = sk.chain("tail", [(0, -5.6, 0.0), (0, -10.2, 0.08), (0, -15.0, 0.18), (0, -20.0, 0.3)], "body")
    LE, TE = {}, {}
    for sx, s in ((-1, "L"), (1, "R")):
        LE[s] = [V((sx * 0.8, 3.1, 0.18)), V((sx * 2.6, 2.5, 0.42)), V((sx * 4.8, 1.2, 0.55)), V((sx * 7.2, -1.0, 0.56)),
                 V((sx * 9.6, -3.6, 0.42)), V((sx * 11.6, -6.1, 0.22)), V((sx * 13.0, -8.4, 0.0))]
        TE[s] = []
        for k in range(9):
            w = k / 8
            q = LE[s][-1].lerp(V((sx * 0.7, -6.3, 0.02)), w)
            q.y += 1.05 * math.sin(PI * w) ** 1.1          # the concave trailing edge bows forward
            q.z += 0.12 * math.sin(PI * w)
            TE[s].append(q)
        sk.add(f"wing{s}1", (sx * 0.9, 1.2, 0.2), (sx * 6.0, -0.2, 0.55), "body")
        sk.add(f"wing{s}2", (sx * 6.0, -0.2, 0.55), (sx * 13.0, -8.4, 0.0), f"wing{s}1")
    parts = []
    # a flattened streamlined body (wider than deep), its back raised in a low keel
    body = Surf([(-6.3, 0.1, 0.08, 0.07, 0.0, 2.0), (-5.2, 0.42, 0.26, 0.2, 0.0, 2.2), (-3.4, 0.95, 0.5, 0.36, 0.02, 2.5),
                 (-1.0, 1.25, 0.66, 0.46, 0.04, 2.6), (1.4, 1.2, 0.68, 0.46, 0.06, 2.6), (3.2, 0.86, 0.56, 0.4, 0.06, 2.4),
                 (4.6, 0.56, 0.42, 0.32, 0.04, 2.2), (5.8, 0.34, 0.28, 0.22, 0.0, 2.1), (7.0, 0.15, 0.13, 0.1, -0.06, 2.0),
                 (8.1, 0.05, 0.045, 0.035, -0.12, 2.0), (8.7, 0.01, 0.01, 0.01, -0.16, 2.0)])

    def bdisp(t, a):
        p = body.P(t, a)
        d = 0.08 * math.exp(-((a - PI / 2) / 0.09) ** 2) * sstep(0.1, 0.5, t) * (1 - sstep(0.75, 0.95, t))   # dorsal keel
        d += 0.012 * noise.noise(p * 2.0) + 0.006 * noise.noise(p * 6.0)
        # the mouth line under the head, and the gill slits behind it
        if 4.2 < p.y < 7.6:
            d -= 0.035 * math.exp(-((math.sin(a) + 0.3) / 0.06) ** 2) * sstep(4.2, 5.0, p.y)
        if -0.5 < p.y < 2.0 and math.sin(a) < -0.2:
            d -= 0.02 * max(0.0, math.cos((p.y + 0.5) / 2.5 * PI * 5)) ** 8 * (abs(p.x) < 0.7)
        return d
    parts.append(Part(body.mesh("body", 120, 44, ("js_keel",), disp=bdisp), bones=["body", "head"]))
    hd = []
    for sx in (-1, 1):
        p, n = surf_at(body, 4.75, PI / 2 - sx * 1.05, -0.04)
        n = (n + V((0, 0.35, 0.15))).normalized()
        hd.append(eye(f"eye{sx}", p, n, 0.13, "js_eye", cornea_m="cornea", pupil=(0.5, 0.5)))
        ring = []
        u = n.orthogonal().normalized()
        v = n.cross(u)
        for k in range(25):
            a = TAU * k / 24
            ring.append(p + n * 0.035 + (u * math.cos(a) + v * math.sin(a)) * 0.16)
        hd.append(tube(f"ering{sx}", ring, [0.028] * 25, "js_spar", seg=6))
        hd.append(kit.sphere(f"brow{sx}", 0.2, loc=tuple(p + V((0, -0.05, 0.13))), m="js_keel", segs=12, rings=6, scale=(0.9, 1.7, 0.42)))
        for k in range(5):      # a row of small cobalt pits along the head (electro-sensing pores — speculative)
            p2, _ = surf_at(body, 5.3 + 0.32 * k, PI / 2 - sx * 0.7, -0.01)
            hd.append(kit.sphere(f"nd{sx}{k}", 0.03, loc=tuple(p2), m="js_vein", segs=8, rings=4))
    parts.append(Part(kit.merge(hd, "headdet"), bone="head"))
    for sx, s in ((-1, "L"), (1, "R")):
        le, te = LE[s], TE[s]
        # the membrane, fanned from the body side round the whole perimeter (leading edge, tip, trailing edge)
        n = 37
        per = [smooth_lerp(le, (len(le) - 1) * k / 21) for k in range(22)] + [smooth_lerp(te, (len(te) - 1) * k / 15) for k in range(1, 16)]
        base = []
        for k in range(n):
            y = 3.0 - 9.2 * k / (n - 1)
            w = body.sec(surf_t(body, y))[1]
            base.append(V((sx * w * 0.86, y, 0.06)))
        wmesh = fin(f"wing{s}", base, per, "js_wing", nv=14, rays=26, corr=0.04, ruffle=0.05, ruffle_f=7, thick=0.03,
                    rays_m="js_vein", ray_r=0.022, ray_taper=0.12, up=(0, 0, 1), droop=0.12)
        parts.append(Part(wmesh, bones=["body", f"wing{s}1", f"wing{s}2"]))
        # the leading-edge spar: thick at the shoulder, tapering to the tip
        parts.append(Part(ringed(f"spar{s}", le, lambda t: 0.3 * (1 - t) ** 0.85 + 0.03, "js_spar", rings=26, groove=0.07, seg=12, samples=100),
                          bones=["body", f"wing{s}1", f"wing{s}2"]))
        # the raised ridge from the shoulder to the tip on the upper surface, and three finger ribs to the trailing edge
        sh = V((sx * 1.1, 1.6, 0.42))
        ridge = [sh.lerp(le[-1], q / 10) + V((0, -0.55 * math.sin(PI * q / 10), 0.18 * math.sin(PI * q / 10) + 0.05)) for q in range(11)]
        ribs = [tube(f"ridge{s}", ridge, [0.16 * (1 - q / 10) + 0.02 for q in range(11)], "js_spar", seg=8)]
        for f_ in range(3):
            end = te[2 + 2 * f_]
            st = ridge[3 + f_]
            mid = st.lerp(end, 0.5) + V((0, 0, 0.08))
            ribs.append(tube(f"rib{s}{f_}", [st, mid, end], [0.07, 0.045, 0.012], "js_spar", seg=6))
        parts.append(Part(kit.merge(ribs, f"ribs{s}"), bones=[f"wing{s}1", f"wing{s}2"]))
    tp = [V(sk.seg(t)[0]) for t in tail] + [V(sk.seg(tail[-1])[1])]
    parts.append(Part(ringed("whip", tp, lambda t: 0.16 * (1 - t) ** 1.3 + 0.008, "js_keel", rings=34, groove=0.1, seg=8, samples=90), bones=tail + ["body"]))
    body_o = assemble("stormskimmer_body", sk, parts)
    arm = finish_creature(root, sk, body_o, os.path.join(kit.out_dir(), "jup_stormskimmer.glb"), props={"creature": "stormskimmer", "span": 26.0}, ao=1.2, paint=4096, nsize=2048)
    return root, arm


# ================================================================================================ 02 Skyjelly
def skyjelly():
    kit.reset()
    root = empty("Skyjelly")
    rng = random.Random(1602)
    sk = Skeleton()
    sk.add("bell", (0, 0, 0), (0, 0, 2.4))
    R, H = 3.5, 1.95
    parts = []

    def lathe(name, R_, H_, mat, ribs, rib_h, z0=0.0, flip=False, nr=22, na=96):
        bm = bmesh.new()
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
    parts.append(Part(lathe("inner", R * 0.86, H * 0.68, "sj_inner", 8, 0.02, z0=-0.05, nr=14, na=64), bone="bell"))
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
    parts.append(Part(tube("gonads", gp, gr, "sj_core", seg=8), bone="bell"))
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
    # the thin bright rim (panel 02: a glowing pink margin round the bell)
    rim = [V((math.cos(TAU * k / 128) * R * 1.0, math.sin(TAU * k / 128) * R * 1.0, -0.2 + 0.03 * math.sin(TAU * k / 128 * 16))) for k in range(129)]
    parts.append(Part(tube("rim", rim, [0.075] * 129, "sj_core", seg=8), bone="bell"))
    # seventy-two hair-fine wavy tentacles from the rim in eight bundles, beaded with tiny nematocyst-like knots
    for b in range(8):
        a0 = TAU * b / 8
        ch = sk.chain(f"tent{b}", [(math.cos(a0) * R * 0.95, math.sin(a0) * R * 0.95, -0.2 - 4.5 * k) for k in range(5)], "bell")
        tents = []
        for k in range(9):
            a = a0 + (k - 4) * 0.085
            base = V((math.cos(a) * R * 0.97, math.sin(a) * R * 0.97, -0.25))
            L = rng.uniform(6, 20)
            ph = rng.uniform(0, TAU)
            amp = rng.uniform(0.15, 0.45)
            NQ = 18
            path = [base + V((math.cos(a) * 0.5 * math.sin(PI * q / NQ) + amp * math.sin(q * 0.5 + ph) * q / NQ, math.sin(a) * 0.5 * math.sin(PI * q / NQ) + amp * math.cos(q * 0.42 + ph) * q / NQ, -L * q / NQ)) for q in range(NQ + 1)]
            tents.append(tube(f"t{b}{k}", path, [0.028 * (1 - 0.85 * q / NQ) + 0.003 for q in range(NQ + 1)], "sj_tent", seg=4))
            for q in range(4, NQ, 6):
                tents.append(kit.sphere(f"k{b}{k}{q}", 0.032 * (1 - 0.6 * q / NQ) + 0.008, loc=tuple(path[q]), m="sj_tent", segs=5, rings=3))
        parts.append(Part(kit.merge(tents, f"tents{b}"), bones=ch))
    body = assemble("skyjelly_body", sk, parts)
    arm = finish_creature(root, sk, body, os.path.join(kit.out_dir(), "jup_skyjelly.glb"), props={"creature": "skyjelly", "bell": 7}, ao=0.6, paint=2048, nsize=1024)
    return root, arm


# ================================================================================================ 03 Stormbeast
def stormbeast():
    """panel 03: a colossal serpentine eel. A broad, flattened, wrinkled head with a rounded snout that hooks down a
    little at the tip; the gape thrown open (~65°); long irregular needle teeth along both rims, longest at the front,
    a shorter inner row; a pink-red palate in longitudinal ridges and a dark throat; small eyes high behind the snout;
    the neck ringed by annular folds; a long tapering body with no fins (it rides the storm's winds)"""
    kit.reset()
    root = empty("Stormbeast")
    rng = random.Random(1613)
    sk = Skeleton()
    pts = [(0, 12.0, 1.4), (0, 6.5, 0.9), (0, 0.5, 0.4), (0, -6.0, 0.0), (0, -12.5, -0.3), (0, -19.0, -0.5), (0, -25.5, -0.6), (0, -31.0, -0.6)]
    sp = sk.chain("sp", pts, None)
    sk.add("head", pts[0], (0, 22.0, 3.4), sp[0])
    sk.add("jaw", (0, 13.6, -0.2), (0, 21.6, -5.4), "head")
    parts = []
    # neck + body + the upper head; the snout is raised with the open gape
    body = Surf([(-31.5, 0.08, 0.08, 0.08, -0.6, 2.0), (-27.0, 0.55, 0.55, 0.5, -0.6, 2.0), (-19.0, 1.35, 1.3, 1.25, -0.5, 2.1), (-9.0, 2.0, 1.9, 1.8, -0.1, 2.2),
                 (1.0, 2.4, 2.2, 2.0, 0.5, 2.25), (8.0, 2.7, 2.35, 2.1, 1.0, 2.3), (12.5, 3.1, 2.4, 1.6, 1.4, 2.4), (15.5, 3.15, 2.1, 0.62, 2.0, 2.6),
                 (18.5, 2.7, 1.55, 0.42, 2.7, 2.6), (20.6, 1.9, 1.05, 0.32, 3.2, 2.4), (21.9, 0.95, 0.62, 0.25, 3.3, 2.2), (22.4, 0.25, 0.2, 0.12, 3.15, 2.0)])

    def bdisp(t, a):
        p = body.P(t, a)
        y = p.y
        # annular folds: strong rings along the neck, fading toward the tail and onto the head
        ringk = sstep(-24.0, -14.0, y) * (1 - sstep(10.5, 13.5, y)) * (0.5 + 0.5 * sstep(-2.0, 6.0, y))
        f = (y / 1.15) % 1.0
        d = ringk * (0.16 * math.sin(PI * f) ** 0.6 - 0.22 * math.exp(-((f - 0.02) / 0.05) ** 2))
        # longitudinal wrinkles on the head and neck, leathery noise everywhere
        d += 0.05 * max(0.0, math.sin(a * 23 + 0.8 * noise.noise(p * 0.2))) ** 3 * sstep(6.0, 13.0, y)
        d += 0.05 * noise.noise(p * 0.55) + 0.02 * noise.noise(p * 2.2) + 0.008 * noise.noise(p * 7.0)
        # brow bulges over the eyes, and the hooked snout tip turned down
        d += 0.32 * math.exp(-((y - 18.2) / 0.9) ** 2) * math.exp(-((abs(math.cos(a)) - 0.62) / 0.2) ** 2) * (math.sin(a) > 0)
        d += 0.25 * sstep(21.3, 22.2, y) * (math.sin(a) < -0.3)
        return d
    parts.append(Part(body.mesh("body", 260, 56, ("sb_hide", "sb_belly"), disp=bdisp,
                                mat_fn=lambda t, a: 1 if math.sin(a) < -0.5 and body.sec(t)[0] < 13 else 0), bones=sp + ["head"]))
    # the palate: the underside of the raised upper head, pink-red with longitudinal ridges
    pal = Surf([(13.0, 2.75, 0.3, 0.1, 1.05, 2.5), (16.0, 2.85, 0.3, 0.1, 1.5, 2.6), (19.0, 2.3, 0.25, 0.08, 2.35, 2.5), (21.4, 1.0, 0.2, 0.06, 2.95, 2.2)])
    parts.append(Part(pal.mesh("palate", 40, 36, ("sb_mouth",), disp=lambda t, a: (0.07 * max(0.0, math.cos(pal.P(t, a).x * 4.2)) ** 3 - 0.02) * (math.sin(a) < 0)), bone="head"))
    # the lower jaw, dropped wide: thick rubbery rims, a pink floor of the mouth with ridges
    jaw = Surf([(13.2, 2.9, 0.55, 1.45, -0.4, 2.4), (15.8, 2.85, 0.5, 1.25, -1.75, 2.5), (18.4, 2.35, 0.42, 0.95, -3.4, 2.4), (20.4, 1.5, 0.35, 0.6, -4.7, 2.2), (21.4, 0.55, 0.25, 0.3, -5.25, 2.0)])
    parts.append(Part(jaw.mesh("jaw", 50, 40, ("sb_hide", "sb_mouth"), mat_fn=lambda t, a: 1 if math.sin(a) > 0.2 else 0,
                               disp=lambda t, a: 0.05 * noise.noise(jaw.P(t, a) * 0.8) + (0.06 * max(0.0, math.cos(jaw.P(t, a).x * 3.6)) ** 3 if math.sin(a) > 0.3 else 0.0)), bone="jaw"))
    # the throat: a dark red cavity behind the gape, and a thick tongue
    thr = Surf([(10.5, 1.6, 1.4, 1.2, 0.8, 2.0), (13.5, 2.3, 1.7, 1.5, 0.3, 2.0), (15.8, 2.4, 1.5, 1.8, -0.4, 2.0)])
    parts.append(Part(thr.mesh("throat", 32, 40, ("sb_mouth",), disp=lambda t, a: 0.12 * max(0.0, math.cos(a * 9)) ** 4 - 0.06), bones=["head", "jaw"]))
    parts.append(Part(kit.sphere("tongue", 1.0, loc=(0, 16.8, -2.15), m="sb_mouth", segs=20, rings=12, scale=(1.2, 3.0, 0.5)), bone="jaw"))
    # teeth: one long irregular row along each rim (longest near the front), a shorter row inside it; long needle
    # points curving inward and back
    up = mouth_curve(13.4, 22.0, 2.75, 1.25, 3.05, sharp=0.6)
    lo = mouth_curve(13.4, 21.2, 2.6, -0.2, -4.9, sharp=0.6)
    for nm, mf, bone, dirz in (("u", up, "head", -1), ("l", lo, "jaw", 1)):
        tt = []
        for row in range(2):
            n = 30 - 10 * row
            for i in range(n):
                sv = -0.96 + 1.92 * (i + 0.5 * row + rng.uniform(-0.25, 0.25)) / (n - 1)
                p = mf(sv) + V((-0.3 * row * math.sin(sv * PI / 2), -0.7 * row, -dirz * 0.2 * row))
                front = math.cos(sv * PI / 2) ** 2
                L = (0.9 + 1.7 * front) * rng.uniform(0.55, 1.25) * (1 - 0.4 * row)
                inward = V((-math.sin(sv * PI / 2) * 0.4, -0.3 - 0.25 * row, dirz))
                tt.append(fang(f"t{nm}{row}{i}", p, inward, V((0, -1, 0)), L, 0.11 * (1 - 0.25 * row) * (0.8 + 0.4 * front), curve=0.55, m="tooth", seg=6, n=7))
        parts.append(Part(kit.merge(tt, f"teeth{nm}"), bone=bone))
    hd = []
    for sx in (-1, 1):
        p, n = surf_at(body, 18.0, PI / 2 - sx * 0.82, -0.08)
        hd.append(eye(f"eye{sx}", p, n + V((0, 0.5, 0.1)), 0.2, "sh_eye", cornea_m="cornea", pupil=(0.3, 0.8), slit_axis=(0, 0, 1)))
        for k in range(3):     # skin folds round the small eye
            ring = []
            u = n.orthogonal().normalized()
            v = n.cross(u)
            for q in range(17):
                a = TAU * q / 16
                ring.append(p + n * 0.03 + (u * math.cos(a) + v * math.sin(a)) * (0.3 + 0.13 * k) * (1.0 + 0.3 * math.cos(a)))
            hd.append(tube(f"ef{sx}{k}", ring, [0.06 - 0.012 * k] * 17, "sb_hide", seg=6))
    parts.append(Part(kit.merge(hd, "eyes"), bone="head"))
    body_o = assemble("stormbeast_body", sk, parts)
    arm = finish_creature(root, sk, body_o, os.path.join(kit.out_dir(), "jup_stormbeast.glb"), props={"creature": "stormbeast", "length": 54}, ao=2.0, paint=4096, nsize=2048)
    return root, arm


# ================================================================================================ 04 Floating Colony unit
def colony():
    """panel 04, one unit of the community (instanced by the hundred at runtime): a billowing cumulus-like dome built
    of lumps on lumps (three scales), flatter beneath, dark umber with ember-orange fissures glowing in every fold;
    a beard of thin, wavy, branching rust threads hanging from the underside, a few small pods on threads"""
    kit.reset()
    root = empty("ColonyUnit")
    rng = random.Random(1614)
    els = [("ELLIPSOID", (0, 0, 0.35), 1.7, (1.15, 1.0, 0.62))]
    # big lobes over the crown, medium lobes over those, small knots over everything (a cauliflower / cumulus head)
    for scale_, count, rmin, rmax in ((1.0, 12, 0.6, 0.95), (0.65, 26, 0.32, 0.55), (0.4, 44, 0.16, 0.3)):
        for k in range(count):
            a = rng.uniform(0, TAU)
            e = rng.uniform(-0.05, 1.25)
            d = rng.uniform(1.25, 1.75) * (1.2 - 0.25 * scale_)
            c = (math.cos(a) * d * math.cos(e) * 1.1, math.sin(a) * d * math.cos(e), 0.35 + math.sin(e) * 1.05 + 0.15 * scale_)
            els.append(("BALL", c, rng.uniform(rmin, rmax)))
    lump = meta("lump", els, "co_body", res=0.095)
    for v in lump.data.vertices:
        p = v.co.copy()
        n = v.normal.copy()
        fold = abs(noise.noise(p * 1.6 + Vector((3, 1, 0))))
        d = -0.16 * (1 - sstep(0.0, 0.1, fold)) + 0.06 * noise.noise(p * 1.2) + 0.03 * noise.noise(p * 3.5) + 0.012 * noise.noise(p * 9.0)
        if p.z < -0.05:
            d -= 0.25 * sstep(-0.05, -0.6, p.z)          # flatter beneath
        v.co = p + n * d
    kit.smooth(lump, 60)
    parts = [lump]
    # a beard of thin wavy threads (some branching), denser toward the centre
    for k in range(34):
        a = rng.uniform(0, TAU)
        r0 = 1.5 * math.sqrt(rng.uniform(0.0, 1.0))
        b = V((math.cos(a) * r0 * 1.1, math.sin(a) * r0, -0.35))
        L = rng.uniform(2.5, 8.5)
        ph, ph2 = rng.uniform(0, TAU), rng.uniform(0, TAU)
        amp = rng.uniform(0.15, 0.4)
        pts = [b + V((amp * math.sin(q * 0.9 + ph) * (q / 14) + 0.2 * math.cos(a) * q / 14, amp * math.cos(q * 0.7 + ph2) * (q / 14) + 0.2 * math.sin(a) * q / 14, -L * q / 14)) for q in range(15)]
        r = rng.uniform(0.025, 0.05)
        parts.append(tube(f"th{k}", pts, [r * (1 - 0.85 * q / 14) + 0.004 for q in range(15)], "co_thread", seg=4))
        for br in range(rng.randint(0, 3)):
            j = rng.randint(3, 10)
            d = V((rng.uniform(-1, 1), rng.uniform(-1, 1), -1.4)).normalized()
            bl = rng.uniform(0.8, 2.6)
            bp = [pts[j], pts[j] + d * bl * 0.5 + V((0.1, 0, 0)), pts[j] + d * bl]
            parts.append(tube(f"tb{k}{br}", bp, [r * 0.5, r * 0.3, 0.003], "co_thread", seg=4))
        if rng.random() < 0.25:         # a few beads along the threads
            j = rng.randint(4, 13)
            parts.append(kit.sphere(f"bd{k}", r * 2.2, loc=tuple(pts[j]), m="co_body", segs=8, rings=5))
    for k in range(3):
        a = rng.uniform(0, TAU)
        c = V((math.cos(a) * 2.7, math.sin(a) * 2.7, -0.9 - k * 0.8))
        parts.append(kit.sphere(f"pod{k}", 0.38, loc=tuple(c), m="co_body", segs=14, rings=9, scale=(1, 1, 0.7)))
        parts.append(tube(f"pt{k}", [c + V((0, 0, -0.2)), c + V((0.1, 0.1, -1.4)), c + V((0.2, -0.1, -2.9))], [0.04, 0.025, 0.005], "co_thread", seg=4))
    body = kit.merge(parts, "colony_body")
    export_static(root, body, os.path.join(kit.out_dir(), "jup_colony.glb"), {"creature": "colony"}, size=2048, nsize=1024, ao=0.6)
    return root, None


# ================================================================================================ 04b Colony lobe
def colony_lobe():
    """panel 04's great mass is built at runtime from a dozen of these lobes (each floats on its own and is held to
    the others by soft links — a community, never one rigid body): a cumulus head ~12 m across at scale 1 (shown at
    70–150 m), lumps on lumps in three scales split by ember-lit fissures, a flatter base trailing long tendrils"""
    kit.reset()
    root = empty("ColonyLobe")
    rng = random.Random(1624)
    els = [("ELLIPSOID", (0, 0, 0.6), 4.6, (1.15, 1.0, 0.62))]
    for count, rmin, rmax, d0, d1, e0 in ((12, 1.9, 2.6, 3.2, 4.4, 0.0), (34, 1.0, 1.5, 3.9, 5.0, -0.05), (90, 0.45, 0.75, 4.6, 5.6, -0.1)):
        for k in range(count):
            a = rng.uniform(0, TAU)
            e = rng.uniform(e0, 1.35)
            d = rng.uniform(d0, d1)
            c = (math.cos(a) * d * math.cos(e) * 1.12, math.sin(a) * d * math.cos(e), 0.6 + math.sin(e) * d * 0.72)
            els.append(("BALL", c, rng.uniform(rmin, rmax)))
    lump = meta("lobe", els, "co_body", res=0.24)
    for v in lump.data.vertices:
        p = v.co.copy()
        n = v.normal.copy()
        fold = abs(noise.noise(p * 0.55 + Vector((3, 1, 0))))
        d = -0.45 * (1 - sstep(0.0, 0.1, fold)) + 0.22 * noise.noise(p * 0.45) + 0.1 * noise.noise(p * 1.3) + 0.04 * noise.noise(p * 3.5)
        if p.z < 0.2:
            d -= 0.9 * sstep(0.2, -1.6, p.z)          # a flatter, ragged base
        v.co = p + n * d
    kit.smooth(lump, 60)
    parts = [lump]
    for k in range(44):
        a = rng.uniform(0, TAU)
        r0 = 4.6 * math.sqrt(rng.uniform(0.05, 1.0))
        b = V((math.cos(a) * r0 * 1.1, math.sin(a) * r0, -0.9))
        L = rng.uniform(10, 38)
        ph, ph2 = rng.uniform(0, TAU), rng.uniform(0, TAU)
        amp = rng.uniform(0.6, 1.8)
        NQ = 16
        pts = [b + V((amp * math.sin(q * 0.8 + ph) * q / NQ + 0.6 * math.cos(a) * q / NQ, amp * math.cos(q * 0.6 + ph2) * q / NQ + 0.6 * math.sin(a) * q / NQ, -L * q / NQ)) for q in range(NQ + 1)]
        r = rng.uniform(0.08, 0.2)
        parts.append(tube(f"th{k}", pts, [r * (1 - 0.88 * q / NQ) + 0.012 for q in range(NQ + 1)], "co_thread", seg=5))
        for br in range(rng.randint(0, 2)):
            j = rng.randint(3, 11)
            d = V((rng.uniform(-1, 1), rng.uniform(-1, 1), -1.5)).normalized()
            bl = rng.uniform(3, 9)
            parts.append(tube(f"tb{k}{br}", [pts[j], pts[j] + d * bl * 0.5 + V((0.3, 0, 0)), pts[j] + d * bl], [r * 0.5, r * 0.3, 0.01], "co_thread", seg=4))
        if rng.random() < 0.3:
            parts.append(kit.sphere(f"bd{k}", r * 2.4, loc=tuple(pts[rng.randint(5, 14)]), m="co_body", segs=8, rings=5))
    body = kit.merge(parts, "lobe_body")
    export_static(root, body, os.path.join(kit.out_dir(), "jup_colony_lobe.glb"), {"creature": "colony_lobe"}, size=2048, nsize=1024, ao=2.0)
    return root, None


# ================================================================================================ 05 Voltdrifter
def voltdrifter():
    """panel 05: a squid. A long mantle tapering to a point, with a pair of rhomboid fins along its rear third; a
    rounded head with a large dark eye ringed in blue under a heavy brow; eight thick sinuous arms splayed in every
    direction and two longer clubbed tentacles; dark violet skin with a copper-orange iridescent sheen"""
    kit.reset()
    root = empty("Voltdrifter")
    rng = random.Random(1615)
    sk = Skeleton()
    sk.add("mantle", (0, -7.5, 0), (0, 1.0, 0))
    sk.add("head", (0, 1.0, 0), (0, 2.7, 0), "mantle")
    parts = []
    mant = Surf([(-8.6, 0.02, 0.02, 0.02, 0.05, 2.0), (-7.6, 0.22, 0.2, 0.18, 0.04, 2.0), (-5.6, 0.52, 0.5, 0.44, 0.02, 2.0), (-3.2, 0.8, 0.78, 0.68, 0.0, 2.0),
                 (-1.0, 0.93, 0.9, 0.8, 0.0, 2.0), (0.5, 0.9, 0.87, 0.77, 0.0, 2.0), (1.15, 0.8, 0.76, 0.68, 0.0, 2.0)])

    def mdisp(t, a):
        p = mant.P(t, a)
        d = 0.018 * noise.noise(p * 2.5) + 0.01 * max(0.0, noise.noise(p * 8.0))
        d += 0.04 * math.exp(-((a - PI / 2) / 0.08) ** 2) * sstep(0.1, 0.8, t)          # the gladius ridge
        d += 0.012 * max(0.0, math.sin(p.y * 7 + 2 * math.sin(a * 3))) ** 6               # fine iridescent ridges
        return d
    parts.append(Part(mant.mesh("mantle", 100, 44, ("vd_skin", "vd_belly"), disp=mdisp, mat_fn=lambda t, a: 1 if math.sin(a) < -0.6 else 0), bone="mantle"))
    head = Surf([(0.95, 0.8, 0.76, 0.68, 0.0, 2.0), (1.55, 0.92, 0.86, 0.76, 0.02, 2.0), (2.2, 0.8, 0.74, 0.66, 0.0, 2.0), (2.75, 0.56, 0.5, 0.48, -0.03, 2.0), (3.05, 0.42, 0.38, 0.38, -0.04, 2.0)])
    parts.append(Part(head.mesh("head", 44, 40, ("vd_skin", "vd_belly"), mat_fn=lambda t, a: 1 if math.sin(a) < -0.6 else 0,
                                disp=lambda t, a: 0.015 * noise.noise(head.P(t, a) * 3)), bone="head"))
    # rhomboid fins along the rear third of the mantle, meeting at the tip
    for sx, s in ((-1, "L"), (1, "R")):
        base, edge = [], []
        for k in range(10):
            u = k / 9
            y = -8.5 + 4.6 * u
            w = mant.sec(surf_t(mant, y))[1]
            base.append(V((sx * w * 0.8, y, 0.02)))
            span = 1.9 * math.sin(PI * min(1.0, u * 1.05)) ** 0.8
            edge.append(V((sx * (w * 0.8 + span), y - 0.6 * span, 0.06)))
        parts.append(Part(fin(f"fin{s}", base, edge, "vd_fin", nv=7, rays=14, corr=0.03, thick=0.02, rays_m="vd_skin", ray_r=0.012, up=(0, 0, 1)), bone="mantle"))
    hd = []
    for sx in (-1, 1):
        p, n = surf_at(head, 1.7, PI / 2 - sx * 1.15, -0.05)
        n = (n + V((0, 0.2, 0.1))).normalized()
        hd.append(eye(f"eye{sx}", p, n, 0.24, "vd_iris", cornea_m="cornea", pupil=(0.62, 0.62)))
        u = n.orthogonal().normalized()
        v = n.cross(u)
        lid = [p + n * 0.06 + (u * math.cos(TAU * k / 24) + v * math.sin(TAU * k / 24)) * 0.27 for k in range(25)]
        hd.append(tube(f"lid{sx}", lid, [0.045] * 25, "vd_lid", seg=8))
        # a heavy brow ridge over the eye
        bp = [p + n * 0.05 + (V((0, 0, 1)) * 0.3 + V((0, (q - 3) * 0.12, 0))) + V((sx * 0.02 * abs(q - 3), 0, -0.03 * abs(q - 3))) for q in range(7)]
        hd.append(tube(f"brow{sx}", bp, [0.04, 0.08, 0.11, 0.12, 0.11, 0.08, 0.04], "vd_skin", seg=8))
    hd.append(fang("beakU", V((0, 3.05, 0.08)), V((0, 1, -0.5)), V((0, 0, -1)), 0.32, 0.12, curve=0.45, m="claw_black", seg=6))
    hd.append(fang("beakL", V((0, 3.05, -0.12)), V((0, 1, 0.2)), V((0, 0, 1)), 0.26, 0.1, curve=0.35, m="claw_black", seg=6))
    parts.append(Part(kit.merge(hd, "headdet"), bone="head"))
    # eight sinuous arms splayed in every direction, two longer clubbed tentacles
    for k in range(10):
        a = TAU * k / 10 + 0.15
        long = k in (2, 7)
        L = 11.0 if long else 7.0
        b = V((math.cos(a) * 0.34, 2.9, math.sin(a) * 0.34))
        radial = V((math.cos(a), 0, math.sin(a)))
        spread = rng.uniform(0.35, 0.75) * (0.6 if long else 1.0)
        side = radial.cross(V((0, 1, 0))).normalized()
        ph = rng.uniform(0, TAU)
        bend = rng.uniform(1.0, 2.0)
        droop = rng.uniform(0.3, 1.0)
        pts = []
        for q in range(6):
            u = q / 5
            p = b + V((0, L * u * (1 - 0.18 * u), 0)) + radial * (L * spread * u ** 1.15) + side * (bend * math.sin(PI * u * 1.6 + ph) * u) + radial * (0.6 * bend * math.sin(PI * u * 2.2 + ph * 0.7) * u * u) + V((0, 0, -droop * L * 0.18 * u * u))
            pts.append(p)
        ch = sk.chain(f"arm{k}", [tuple(p) for p in pts], "head")
        r0 = 0.12 if long else 0.24
        rf = (lambda t, r0=r0: r0 * (1 - 0.9 * t ** 0.8) + 0.01)
        armp = [ringed(f"a{k}", pts, rf, "vd_skin", rings=44 if long else 30, groove=0.05, seg=10, samples=100)]
        ts = TubeSurf(pts, rf, ref=(0, 0, 1))
        nq = 18 if long else 26
        for q in range(nq):      # sucker rows on the inner face
            tq = 0.08 + 0.84 * q / nq
            for sd in (-0.38, 0.38):
                hp = ts.P(tq, PI + sd)
                armp.append(kit.sphere(f"s{k}{q}{sd}", rf(tq) * 0.34, loc=tuple(hp), m="vd_belly", segs=6, rings=4, scale=(1, 1, 0.5)))
        if long:
            armp.append(kit.sphere(f"club{k}", 0.2, loc=tuple(pts[-1]), m="vd_skin", segs=12, rings=8, scale=(1, 2.4, 0.6)))
        parts.append(Part(kit.merge(armp, f"arm{k}"), bones=ch))
    body = assemble("voltdrifter_body", sk, parts)
    arm = finish_creature(root, sk, body, os.path.join(kit.out_dir(), "jup_voltdrifter.glb"), props={"creature": "voltdrifter", "length": 19}, ao=0.6, paint=4096, nsize=2048)
    return root, arm


# ================================================================================================ 06 Deepdiver
def deepdiver():
    """panel 06: a heavy, muscular whale-like air-swimmer. A broad blunt head with a long mouth line and small ember eyes
    under brow plates; large swept blade-plates overlapping along the back (armour against the deep pressure); three
    long swept blade-fins stacked on each side behind the head; glossy charcoal with copper seams and edges"""
    kit.reset()
    root = empty("Deepdiver")
    rng = random.Random(1616)
    sk = Skeleton()
    sp = sk.chain("sp", [(0, 8.5, -0.1), (0, 3.0, 0.0), (0, -2.5, 0.05), (0, -8.8, 0.25)], None)
    sk.add("jaw", (0, 4.8, -0.9), (0, 9.0, -0.75), sp[0])
    for sx, s in ((-1, "L"), (1, "R")):
        sk.add(f"fin{s}", (sx * 1.9, 4.0, -0.3), (sx * 6.5, -1.5, -0.6), sp[1])
    parts = []
    body = Surf([(-9.0, 0.08, 0.1, 0.08, 0.3, 2.0), (-7.2, 0.55, 0.7, 0.5, 0.22, 2.1), (-4.0, 1.45, 1.55, 1.15, 0.08, 2.3), (-0.5, 2.05, 1.95, 1.5, 0.0, 2.5),
                 (3.0, 2.2, 1.95, 1.55, -0.05, 2.6), (5.6, 2.05, 1.75, 1.4, -0.1, 2.7), (7.4, 1.7, 1.42, 1.15, -0.15, 2.8), (8.6, 1.2, 1.0, 0.82, -0.2, 2.8),
                 (9.3, 0.55, 0.52, 0.42, -0.22, 2.5), (9.55, 0.12, 0.12, 0.1, -0.22, 2.0)])
    MOUTH = lambda y: -0.15 - 0.55 * sstep(9.4, 5.0, y)

    def bdisp(t, a):
        p = body.P(t, a)
        d = 0.03 * noise.noise(p * 1.1) + 0.012 * noise.noise(p * 4.0)
        # the long mouth line from the snout back along the side, a thick lip above it
        if p.y > 4.6:
            zr = MOUTH(p.y)
            k = sstep(4.6, 5.6, p.y)
            d -= 0.13 * k * math.exp(-((p.z - zr) / 0.07) ** 2)
            d += 0.06 * k * math.exp(-((p.z - zr - 0.2) / 0.12) ** 2)
        # muscle bands along the flanks
        d += 0.04 * max(0.0, math.sin(p.y * 1.7 + math.cos(a) * 2)) ** 4 * (abs(math.cos(a)) > 0.5) * sstep(-6.0, -2.0, p.y) * (1 - sstep(4.0, 6.0, p.y))
        return d
    parts.append(Part(body.mesh("body", 100, 52, ("dd_skin",), disp=bdisp), bones=sp))
    jaw = Surf([(5.0, 1.75, 0.25, 0.85, -0.85, 2.7), (7.0, 1.55, 0.22, 0.75, -0.8, 2.7), (8.6, 1.0, 0.18, 0.5, -0.65, 2.5), (9.35, 0.4, 0.12, 0.25, -0.55, 2.2)])
    parts.append(Part(jaw.mesh("jaw", 30, 30, ("dd_skin",), disp=lambda t, a: 0.02 * noise.noise(jaw.P(t, a) * 2)), bone="jaw"))
    # armour: large swept blade-plates overlapping along the back, smaller scutes down the flanks
    pl = []
    for r in range(9):
        tc = 0.12 + 0.78 * r / 8
        for c in range(5):
            ac = 0.22 * PI + 0.56 * PI * (c + 0.5) / 5
            pl.append(plate(f"p{r}{c}", body.P, body.N, tc, ac + rng.uniform(-0.03, 0.03), 0.075, 0.26, "dd_plate", rng, rear=-1, lift=0.22, thick=0.12,
                            dome=0.2, jag=0.06, keel=0.1, tip=2.0, sides=3, sides_rot=0.2, K=18, rings=3, inset=0.05))
    for r in range(8):
        tc = 0.15 + 0.7 * r / 7
        for sx in (-1, 1):
            ac = PI / 2 - sx * 0.62 * PI
            pl.append(plate(f"f{r}{sx}", body.P, body.N, tc, ac, 0.05, 0.14, "dd_plate", rng, rear=-1, lift=0.1, thick=0.08, dome=0.25, jag=0.08, keel=0.05, tip=1.6, K=14, rings=3, inset=0.03))
    for k in range(9):      # the crest: tall swept blades along the spine, largest over the shoulders
        y = 6.6 - 13.0 * k / 8
        p, n = surf_at(body, y, PI / 2, 0.08)
        L = (2.6 if 1 <= k <= 4 else 1.6) * rng.uniform(0.85, 1.15) * (1 - 0.35 * k / 8)
        pl.append(fang(f"cr{k}", p, V((0, -1.3, 1)), V((0, -1, 0)), L, 0.42 * (1 - 0.3 * k / 8), curve=0.3, m="dd_plate", seg=4, n=5, flat=0.22))
    for sx in (-1, 1):      # brow plates over the eyes
        for k in range(3):
            p, n = surf_at(body, 7.7 - 0.55 * k, PI / 2 - sx * 0.78, 0.03)
            pl.append(fang(f"br{sx}{k}", p, V((sx * 0.35, -0.9, 0.55)), V((0, -1, 0)), 0.7 - 0.12 * k, 0.2, curve=0.2, m="dd_plate", seg=4, n=4, flat=0.4))
    parts.append(Part(kit.merge(pl, "plates"), bones=sp))
    for sx in (-1, 1):
        p, n = surf_at(body, 7.5, PI / 2 - sx * 1.12, -0.05)
        parts.append(Part(eye(f"eye{sx}", p, n + V((0, 0.35, 0)), 0.15, "dd_eye", cornea_m="cornea", pupil=(0.35, 0.8), slit_axis=(0, 0, 1)), bone=sp[0]))
    # three long swept blade-fins stacked on each side behind the head
    for sx, s in ((-1, "L"), (1, "R")):
        for L_ in range(3):
            rootp = V((sx * 1.95, 4.2 - 1.25 * L_, -0.35 - 0.32 * L_))
            span = V((sx * 0.78, -0.6, -0.12 - 0.05 * L_))
            Lb = 7.6 - 1.6 * L_
            parts.append(Part(foil(f"wf{s}{L_}", rootp, span, V((0, -1, 0)), Lb,
                                   lambda u, L_=L_: ((2.0 - 0.3 * L_) * (1 - u) ** 0.9 + 0.08, 0.22 * (1 - u) + 0.02, 2.6 * u ** 1.2), "dd_fin", ns=22, nc=24),
                              bones=[f"fin{s}", sp[1]]))
            # a raised plate-ridge along each blade's leading edge
            ridge = [rootp + span.normalized() * (Lb * q / 8) + V((0, -2.6 * (q / 8) ** 1.2 + 0.05, 0.12)) for q in range(9)]
            parts.append(Part(tube(f"wr{s}{L_}", ridge, [0.14 * (1 - q / 8) + 0.02 for q in range(9)], "dd_plate", seg=6), bones=[f"fin{s}", sp[1]]))
    parts.append(Part(foil("tailf", V((0, -8.6, 0.3)), V((0, -0.55, 0.85)), V((0, -1, 0)), 3.0, lambda u: (1.8 * (1 - u) ** 0.8 + 0.1, 0.22 * (1 - u) + 0.02, 1.3 * u), "dd_fin"), bone=sp[-1]))
    parts.append(Part(foil("tailf2", V((0, -8.6, 0.2)), V((0, -0.55, -0.85)), V((0, -1, 0)), 2.4, lambda u: (1.6 * (1 - u) ** 0.8 + 0.1, 0.2 * (1 - u) + 0.02, 1.1 * u), "dd_fin"), bone=sp[-1]))
    body_o = assemble("deepdiver_body", sk, parts)
    arm = finish_creature(root, sk, body_o, os.path.join(kit.out_dir(), "jup_deepdiver.glb"), props={"creature": "deepdiver", "length": 18.5}, ao=0.8, paint=4096, nsize=2048)
    return root, arm


# ================================================================================================ 07 Gasgrazer
def gasgrazer():
    """panel 07: a whale-like grazer with a bowhead's mouth. The upper jaw is a high arch under a pale silver hood; the
    lower lip rises in a great dark-red curve; between them, set back, a dense comb of fine cream baleen plates follows
    the side and front of the head; heavy lip rolls; a small eye in wrinkled folds above the mouth corner; a curtain of
    long pale tusk-like fringes and fine hairs curving down and back from the chin and belly; red-streaked hide"""
    kit.reset()
    root = empty("Gasgrazer")
    rng = random.Random(1617)
    sk = Skeleton()
    sp = sk.chain("sp", [(0, 8.0, 0), (0, 2.0, 0.2), (0, -4.5, 0.2), (0, -10.5, 0.0), (0, -16.0, -0.4)], None)
    sk.add("head", (0, 8.0, 0), (0, 17.4, 0.2), sp[0])
    sk.add("comb", (0, 12.0, -1.0), (0, 15.0, -3.5), "head")
    parts = []
    body = Surf([(-16.5, 0.2, 0.2, 0.2, -0.4, 2.0), (-12.5, 1.2, 1.1, 1.0, -0.2, 2.1), (-5.5, 3.0, 2.6, 2.6, 0.0, 2.2), (1.5, 3.7, 3.2, 3.3, 0.0, 2.3),
                 (7.0, 3.95, 3.4, 3.8, -0.2, 2.4), (10.5, 3.85, 3.45, 4.2, -0.4, 2.5), (13.2, 3.35, 3.15, 4.1, -0.5, 2.55), (15.2, 2.55, 2.7, 3.4, -0.5, 2.5),
                 (16.6, 1.55, 1.85, 2.25, -0.5, 2.3), (17.35, 0.5, 0.8, 0.9, -0.5, 2.0)])
    Y0, Y1 = 8.6, 17.25

    def zu(y):     # the arched upper jaw line
        u = (y - Y0) / (Y1 - Y0)
        return -0.6 + 2.1 * math.sin(PI * min(1.0, max(0.0, u)) ** 0.85) ** 0.9 + 0.8 * u

    def zl(y):     # the lower lip line
        u = (y - Y0) / (Y1 - Y0)
        return -0.8 - 2.9 * math.sin(PI * min(1.0, max(0.0, u)) ** 0.75) ** 0.8 + 0.4 * u

    def in_mouth(p, m=0.0):
        return Y0 < p.y < Y1 and zl(p.y) + m < p.z < zu(p.y) - m

    def bdisp(t, a):
        p = body.P(t, a)
        d = 0.08 * noise.noise(p * 0.45) + 0.035 * noise.noise(p * 1.8) + 0.01 * noise.noise(p * 6.0)
        d += 0.06 * max(0.0, math.cos(p.x * 1.6)) ** 6 * (math.sin(a) < -0.3) * sstep(-2.0, 8.0, p.y)          # throat grooves
        d += 0.03 * max(0.0, math.sin(p.y * 2.2 + 3 * math.cos(a))) ** 5 * sstep(4.0, 10.0, p.y) * (math.sin(a) > 0)  # hood wrinkles
        if Y0 < p.y < Y1:
            # the mouth recess between the lines (soft edges), lip rolls just outside it
            k = sstep(Y0, Y0 + 0.9, p.y)
            inside = sstep(zl(p.y), zl(p.y) + 0.35, p.z) * sstep(zu(p.y), zu(p.y) - 0.35, p.z)
            d -= 0.62 * k * inside
        return d

    def mat(t, a):
        p = body.P(t, a)
        if in_mouth(p, 0.05):
            return 2
        if math.sin(a) < -0.45 or (Y0 - 1.5 < p.y and p.z < zl(min(max(p.y, Y0), Y1)) + 0.1):
            return 1
        return 0
    parts.append(Part(body.mesh("body", 150, 72, ("gg_hide", "gg_belly", "mouth_red"), disp=bdisp, mat_fn=mat), bones=sp + ["head"]))

    def a_at(t, z, sx, lo, hi):
        """the surface angle on side sx where the section reaches height z (bisection)"""
        for _ in range(28):
            mid = (lo + hi) / 2
            if body.P(t, mid if sx > 0 else PI - mid).z < z:
                lo = mid
            else:
                hi = mid
        m = (lo + hi) / 2
        return m if sx > 0 else PI - m
    mouth = []
    lipU, lipL = {1: [], -1: []}, {1: [], -1: []}
    NL = 96
    for sx in (-1, 1):
        for i in range(NL):
            y = Y0 + 0.35 + (Y1 - Y0 - 0.5) * (i / (NL - 1)) ** 0.9
            t = surf_t(body, y)
            top, bot = zu(y) - 0.12, zl(y) + 0.12
            if top - bot < 0.25:
                continue
            at = a_at(t, top, sx, -PI / 2, PI / 2)
            ab = a_at(t, bot, sx, -PI / 2, PI / 2)
            ctr, out = [], []
            for q in range(9):
                aa = at + (ab - at) * q / 8
                p = body.P(t, aa)
                n = body.N(t, aa)
                c = p - n * 0.52
                ctr.append(c)
                # the plate stands out toward the lip line, deepest at mid-height (a curved comb)
                out.append(c + n * (0.34 + 0.3 * math.sin(PI * q / 8)) + V((0, 0.12, 0)))
            mouth.append(strip(f"c{sx}{i}", ctr, out, "gg_comb"))
            if i % 3 == 0:
                lipU[sx].append(body.P(t, a_at(t, zu(y) + 0.05, sx, -PI / 2, PI / 2)))
                lipL[sx].append(body.P(t, a_at(t, zl(y) - 0.05, sx, -PI / 2, PI / 2)))
    parts.append(Part(kit.merge(mouth, "comb"), bones=["head", "comb"]))
    lips = []
    for sx in (-1, 1):
        lips.append(tube(f"lipU{sx}", lipU[sx], [0.12 + 0.2 * math.sin(PI * k / max(1, len(lipU[sx]) - 1)) for k in range(len(lipU[sx]))], "gg_hide", seg=10))
        lips.append(tube(f"lipL{sx}", lipL[sx], [0.18 + 0.32 * math.sin(PI * k / max(1, len(lipL[sx]) - 1)) for k in range(len(lipL[sx]))], "gg_belly", seg=10))
    parts.append(Part(kit.merge(lips, "lips"), bones=["head", "comb"]))
    for sx in (-1, 1):
        p, n = surf_at(body, 9.7, PI / 2 - sx * 1.0, -0.06)
        hd = [eye(f"eye{sx}", p, n + V((0, 0.2, 0.1)), 0.19, "mo_eye", cornea_m="cornea", pupil=(0.5, 0.5))]
        u = n.orthogonal().normalized()
        v = n.cross(u)
        for k in range(2):
            ring = [p + n * 0.04 + (u * math.cos(TAU * q / 16) + v * math.sin(TAU * q / 16)) * (0.3 + 0.2 * k) * (1 + 0.45 * math.cos(TAU * q / 16) + 0.12 * math.sin(TAU * q / 16 * 3 + k)) for q in range(17)]
            hd.append(tube(f"f{sx}{k}", ring, [0.07 - 0.015 * k] * 17, "gg_hide", seg=6))
        parts.append(Part(kit.merge(hd, f"eye{sx}"), bone="head"))
    # the curtain: long pale tusk-like fringes from the chin, jaw and belly, sweeping down and back; fine hairs between
    fr = []
    for k in range(34):
        y = 16.3 - 15.5 * (k / 33) ** 1.1
        a = -PI / 2 + rng.uniform(-0.8, 0.8)
        if y > Y0:
            t = surf_t(body, y)
            sx = 1 if math.cos(a) > 0 else -1
            p = body.P(t, a_at(t, zl(y) - 0.4, sx, -PI / 2, PI / 2))
        else:
            p, _ = surf_at(body, y, a, -0.15)
        L = rng.uniform(6, 13) * (1.15 if y > 8 else 0.9)
        fr.append(fang(f"fr{k}", p, V((math.cos(a) * 0.25, -0.8, -1)), V((0, -1, 0)), L, rng.uniform(0.18, 0.3), curve=0.4, m="gg_fringe", seg=8, n=10))
    for k in range(60):
        y = 16.0 - 18.0 * rng.random()
        a = -PI / 2 + rng.uniform(-0.9, 0.9)
        p, _ = surf_at(body, y, a, -0.05)
        L = rng.uniform(2.5, 6.5)
        fr.append(fang(f"hr{k}", p, V((math.cos(a) * 0.3, -0.6, -1)), V((0, -1, 0)), L, 0.05, curve=0.45, m="gg_fringe", seg=4, n=6))
    parts.append(Part(kit.merge(fr, "fringes"), bones=sp + ["head"]))
    for sx, s in ((-1, "L"), (1, "R")):
        parts.append(Part(foil(f"pec{s}", V((sx * 3.4, 4.5, -2.0)), V((sx * 0.8, -0.5, -0.4)), V((0, -1, 0)), 5.0,
                               lambda u: (2.6 * (1 - u) ** 0.8 + 0.2, 0.35 * (1 - u) + 0.03, 1.4 * u), "gg_hide"), bone=sp[1]))
    parts.append(Part(foil("flukeL", V((-0.3, -16.0, -0.4)), V((-1.0, -0.5, 0.05)), V((0, -1, 0)), 5.0, lambda u: (2.2 * (1 - u) ** 0.7 + 0.15, 0.3 * (1 - u) + 0.03, 1.7 * u), "gg_hide"), bone=sp[-1]))
    parts.append(Part(foil("flukeR", V((0.3, -16.0, -0.4)), V((1.0, -0.5, 0.05)), V((0, -1, 0)), 5.0, lambda u: (2.2 * (1 - u) ** 0.7 + 0.15, 0.3 * (1 - u) + 0.03, 1.7 * u), "gg_hide"), bone=sp[-1]))
    body_o = assemble("gasgrazer_body", sk, parts)
    arm = finish_creature(root, sk, body_o, os.path.join(kit.out_dir(), "jup_gasgrazer.glb"), props={"creature": "gasgrazer", "length": 34}, ao=1.0, paint=4096, nsize=2048)
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
    """panel 09: a dragon-like serpent. A long narrow head with a pointed snout and open jaws of needle teeth, a glowing
    ember eye under a brow; a crown of long spikes sweeping back from the skull, webbed in crimson; a great crimson
    frill on each side of the neck spread on spiny rays; silver-grey scale armour over a glowing crimson underside;
    smaller spiny frills and streaming filaments down the body"""
    kit.reset()
    root = empty("Stormhunter")
    rng = random.Random(1619)
    sk = Skeleton()
    pts = [(0, 8.5, 1.3), (0, 4.5, 0.6), (0, 0.5, 0.0), (0, -3.5, -0.2), (0, -7.5, 0.0), (0, -11.0, 0.4), (0, -14.5, 0.8)]
    sp = sk.chain("sp", pts, None)
    sk.add("head", pts[0], (0, 15.0, 1.9), sp[0])
    sk.add("jaw", (0, 9.7, 0.6), (0, 14.6, -0.7), "head")
    parts = []
    body = Surf([(-15.0, 0.08, 0.08, 0.08, 0.8, 2.0), (-11.0, 0.55, 0.55, 0.5, 0.4, 2.1), (-5.0, 1.2, 1.15, 1.05, -0.1, 2.2), (1.0, 1.45, 1.35, 1.25, 0.0, 2.3),
                 (5.5, 1.15, 1.05, 0.95, 0.5, 2.3), (8.5, 0.98, 0.98, 0.75, 1.2, 2.4), (10.4, 0.82, 0.7, 0.38, 1.4, 2.6), (12.4, 0.5, 0.45, 0.2, 1.55, 2.5),
                 (14.2, 0.24, 0.24, 0.1, 1.5, 2.2), (15.2, 0.05, 0.08, 0.04, 1.35, 2.0)])

    def bdisp(t, a):
        p = body.P(t, a)
        d = 0.03 * noise.noise(p * 1.2)
        d += 0.17 * math.exp(-((p.y - 10.0) / 0.55) ** 2) * math.exp(-((abs(math.cos(a)) - 0.6) / 0.2) ** 2) * (math.sin(a) > 0)   # brows
        d += 0.05 * math.exp(-((a - PI / 2) / 0.1) ** 2) * sstep(10.5, 14.0, p.y)                                                  # the snout ridge
        return d
    parts.append(Part(body.mesh("body", 160, 44, ("sh_armor", "sh_skin"), mat_fn=lambda t, a: 1 if math.sin(a) < -0.35 else 0, disp=bdisp), bones=sp + ["head"]))
    pl = []
    for r in range(24):
        tc = 0.05 + 0.84 * r / 23
        for c in range(6):
            ac = 0.16 * PI + 0.68 * PI * (c + 0.5) / 6
            pl.append(plate(f"a{r}{c}", body.P, body.N, tc, ac, 0.02, 0.17, "sh_armor", rng, rear=-1, lift=0.08, thick=0.045, dome=0.35, jag=0.12, keel=0.04, tip=1.4, K=16, rings=3, inset=0.02))
    parts.append(Part(kit.merge(pl, "armor"), bones=sp))
    jaw = Surf([(9.7, 0.64, 0.12, 0.3, 0.45, 2.4), (11.8, 0.5, 0.1, 0.24, 0.05, 2.5), (13.6, 0.26, 0.08, 0.14, -0.35, 2.3), (14.5, 0.05, 0.04, 0.05, -0.55, 2.0)])
    parts.append(Part(jaw.mesh("jaw", 36, 22, ("sh_armor", "sb_mouth"), mat_fn=lambda t, a: 1 if math.sin(a) > 0.3 else 0), bone="jaw"))
    teeth = []
    for sx in (-1, 1):
        for i in range(22):
            y = 9.9 + 4.9 * i / 21
            tt = surf_t(body, min(y, 15.0))
            wU, zc = body.sec(tt)[1] * 0.9, body.sec(tt)[4]
            teeth.append(fang(f"tu{sx}{i}", V((sx * wU, y, zc - 0.05)), V((sx * 0.1, 0.3, -1)), V((0, 1, 0)), (0.42 - 0.18 * i / 21) * rng.uniform(0.75, 1.2), 0.06, curve=0.5, m="tooth", seg=5, n=5))
            yj = 10.0 + 4.3 * i / 21
            tj = surf_t(jaw, yj)
            wL, zj = jaw.sec(tj)[1] * 0.9, jaw.sec(tj)[4]
            teeth.append(fang(f"tl{sx}{i}", V((sx * wL, yj, zj + 0.08)), V((sx * 0.1, 0.3, 1)), V((0, 1, 0)), (0.36 - 0.15 * i / 21) * rng.uniform(0.75, 1.2), 0.05, curve=0.5, m="tooth", seg=5, n=5))
    teeth.append(fang("hook", V((0, 14.9, 1.4)), V((0, 1, -0.9)), V((0, 0, -1)), 0.7, 0.11, curve=0.75, m="sh_spine", seg=6))
    for sx in (-1, 1):
        p, n = surf_at(body, 10.25, PI / 2 - sx * 0.95, -0.03)
        teeth.append(eye(f"eye{sx}", p, n + V((0, 0.3, 0)), 0.13, "sh_eye", cornea_m="cornea", pupil=(0.25, 0.9), slit_axis=(0, 0, 1)))
    parts.append(Part(kit.merge(teeth, "headdet"), bone="head"))
    # the crown: long spikes from the back of the skull, sweeping back and splaying, webbed in crimson
    crown_b, crown_e = {-1: [], 1: []}, {-1: [], 1: []}
    sp_ = []
    for sx in (-1, 1):
        for k in range(6):
            y = 10.0 - 0.45 * k
            p, n = surf_at(body, y, PI / 2 - sx * (0.25 + 0.12 * k), 0.02)
            d = V((sx * (0.35 + 0.1 * k), -1.0, 0.55 - 0.05 * k)).normalized()
            L = (3.6 - 0.35 * k) * rng.uniform(0.9, 1.1)
            sp_.append(fang(f"cw{sx}{k}", p, d, V((0, 0, 1)), L, 0.13, curve=0.3, m="sh_spine", seg=5, n=7))
            crown_b[sx].append(p)
            crown_e[sx].append(p + d * L * 0.82 + V((0, 0, 0.3 * L * 0.3)))
    for k in range(30):      # the spine row down the back
        y = 7.6 - 21.5 * k / 29
        p, n = surf_at(body, y, PI / 2, 0.02)
        L = (1.6 if k < 8 else 1.0) * (1 - 0.5 * k / 29) * rng.uniform(0.8, 1.2)
        sp_.append(fang(f"s{k}", p, V((0, -0.9, 0.75)), V((0, -1, 0)), L, 0.1, curve=0.35, m="sh_spine", seg=5, n=6))
    for sx in (-1, 1):
        for k in range(4):
            p, n = surf_at(body, 9.7 - 0.6 * k, PI / 2 - sx * 1.25, 0.0)
            sp_.append(fang(f"ck{sx}{k}", p, V((sx * 0.8, -0.8, 0.1)), V((0, -1, 0)), 0.9 - 0.15 * k, 0.07, curve=0.3, m="sh_spine", seg=4, n=5))
    parts.append(Part(kit.merge(sp_, "spines"), bones=sp + ["head"]))
    for sx, s in ((-1, "L"), (1, "R")):
        parts.append(Part(fin(f"crown{s}", crown_b[sx], crown_e[sx], "sh_web", nv=6, rays=6, scallop=0.35, ruffle=0.12, ruffle_f=4, thick=0.03), bones=["head", sp[0]]))
        # the great neck frill: from behind the jaw hinge down the neck, spread on spiny rays
        bb = [V((sx * 0.85, 9.4 - 4.2 * q / 9, 0.9 - 0.25 * q / 9)) for q in range(10)]
        ee = []
        for q in range(10):
            u = q / 9
            span = 4.6 * math.sin(PI * (0.12 + 0.88 * u)) ** 0.6
            ee.append(V((sx * (0.85 + span * 0.85), 9.4 - 4.2 * u - span * 0.75, 0.9 + span * 0.45 - 0.6 * u)))
        parts.append(Part(fin(f"frill{s}", bb, ee, "sh_web", nv=8, rays=12, corr=0.12, scallop=0.3, ruffle=0.25, ruffle_f=5, thick=0.035,
                              rays_m="sh_spine", ray_r=0.06, ray_taper=0.15, up=(0, 0, 1)), bones=["head", sp[0], sp[1]]))
        # smaller spiny frills down the body, each trailing filaments
        for k, (y0, span) in enumerate(((2.5, 3.0), (-3.5, 2.6))):
            bb = [V((sx * 1.0, y0 - 2.8 * q / 6, 0.1)) for q in range(7)]
            ee = [V((sx * (1.0 + span * math.sin(PI * (0.15 + 0.85 * q / 6)) ** 0.5), y0 - 2.8 * q / 6 - span * 0.85, 0.8 + 0.3 * math.sin(q))) for q in range(7)]
            bones = sp[1:4] if k == 0 else sp[3:6]
            parts.append(Part(fin(f"web{s}{k}", bb, ee, "sh_web", nv=6, rays=11, corr=0.1, scallop=0.32, ruffle=0.2, ruffle_f=6, thick=0.035, rays_m="sh_spine", ray_r=0.045, ray_taper=0.15), bones=bones))
            for q in range(3):
                b = ee[2 + q]
                parts.append(Part(tube(f"fil{s}{k}{q}", [b, b + V((sx * 0.3, -2.5, -0.3)), b + V((sx * 0.6, -5.5, -0.9))], [0.03, 0.015, 0.003], "sh_web", seg=4), bones=bones))
    tb = [V((0, -11.0 - 3.6 * q / 5, 0.5 + 0.06 * q)) for q in range(6)]
    te = [b + V((0, -0.6, 1.6 * math.sin(PI * (0.2 + 0.8 * q / 5)))) for q, b in enumerate(tb)]
    parts.append(Part(fin("tailweb", tb, te, "sh_web", nv=5, rays=10, scallop=0.3, thick=0.04, rays_m="sh_spine", ray_r=0.04), bones=sp[-2:]))
    body_o = assemble("stormhunter_body", sk, parts)
    arm = finish_creature(root, sk, body_o, os.path.join(kit.out_dir(), "jup_stormhunter.glb"), props={"creature": "stormhunter", "length": 30}, ao=1.0, paint=4096, nsize=2048)
    return root, arm


ALL = ["stormskimmer", "skyjelly", "stormbeast", "colony", "colony_lobe", "voltdrifter", "deepdiver", "gasgrazer", "aeromite", "stormhunter"]
VIEWS = {   # panel-like angles
    "stormskimmer": ((17, 13, -5), (0, -2, 0), 30), "skyjelly": ((14, 16, 2), (0, 0, -4), 35), "stormbeast": ((26, 34, 5), (0, 12, 0), 35),
    "colony": ((9, 10, 3), (0, 0, -2), 35), "colony_lobe": ((26, 30, 6), (0, 0, -8), 35), "voltdrifter": ((13, 6, 4), (0, 0, 0), 35), "deepdiver": ((14, 18, 6), (0, 2, 0), 35),
    "gasgrazer": ((-24, 32, -3), (0, 8, -1), 35), "aeromite": ((0.06, 0.07, 0.04), (0, 0, 0), 50), "stormhunter": ((-14, 26, 4), (0, 6, 1), 35),
}

if __name__ == "__main__":
    which = [a for a in sys.argv[1:] if not a.startswith("--")] or ALL
    for w in which:
        globals()[w]()
        if "--nopreview" not in sys.argv:
            cam, tgt, lens = VIEWS[w]
            preview(f"jup_{w}", cam, tgt, lens=lens, world=(0.32, 0.26, 0.24))
