"""
Mars & Jupiter: Speculative Evolution — the nine Mars species (original fictional taxa from the player's directive and
concept images 907-915; own geometry, no copies). Speculative biology, see docs/SPECULATIVE_EVOLUTION.md.
  icebloom   Crimson Icebloom (909)  colonial sub-ice phototroph: layered translucent crimson/violet rosettes of thin
             gel lamellae, a red capillary net between them, pigmented nodules at the attachment face.
  ferric     Ferric Cathedral (912)  anchored chemosynthetic colony: buttress roots over the vent rock, a trunk of
             intertwined strands, forking glossy branches ending in lattice fans, mineral drips.
  ribbon     Glass Ribbon (913)      a transparent flattened brine grazer: rippling fin margins, violet organ tract and
             gut, a comb of cilia at the narrow sensory tip.
  prism      Prism Architect (915)   a broad low arthropod: layered iridescent blade plates, six plated legs, two fine
             manipulators with jointed digits, black eyes under a ridge, long antennae.
  prismnest  its nest: a mound of stacked stone slabs roofed with iridescent shards, eggs on fibrous bedding.
  ghost      Ghost of Valles (911)   a translucent silver-lilac membrane hunter: venated wings with a row of receptor
             pores, a purple core, a head of small eye pits and long needle fangs, a whip tail and trailing filaments.
  bmimic     Basalt Mimic (910)      a squat six-limbed ambush predator: a flat triangular rock head under the dorsal
             shields, granular vesicular black skin mottled rust, recessed amber eyes, long hooked black claws.
  hermit     Red Dune Hermit (914)   a small domed forager: nested rust-red shell plates, six short pointed scaled legs,
             retracted mouthparts.
  serpent    Thermal Rift Serpent (907) a long amphibious channel hunter: wet black hide banded rust-copper, a broad
             flat head with whiskers and small teeth, four short clawed limbs, a flattened swimming tail.
  monarch    Subglacial Monarch (908) a deep-lake superpredator: a massive blunt-snouted black-blue body, rows of
             teeth, ivory chevron scars along the back, broad pectorals, a crescent tail.
Blender +Y forward, +Z up. Bone names are the contract with src/world/fauna/marsDeep.ts.
"""
import sys, os, math, random
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "lib"))
sys.path.insert(0, HERE)
import bpy, bmesh
from mathutils import Matrix, Vector, noise
import kit
from kit import V, empty
import creature as C
from creature import Skeleton, Part, assemble, finish_creature
from organic import Surf, TubeSurf, plate, fin, tube, fang, ringed, eye, sstep, smooth_lerp
import paint_specs  # noqa: F401
from paint import PAINT
import paint as PNT

PI = math.pi
TAU = math.tau

kit.PALETTE.update({
    "cornea": dict(color=(0.9, 0.92, 0.95), rough=0.02, alpha=0.18),
    "ib_petal": dict(color=(0.6, 0.18, 0.55), rough=0.15),
    "ib_petal_in": dict(color=(0.72, 0.06, 0.22), rough=0.15),
    "ib_core": dict(color=(0.55, 0.03, 0.08), rough=0.3),
    "ib_vein": dict(color=(0.7, 0.05, 0.1), rough=0.3),
    "ib_nodule": dict(color=(0.3, 0.02, 0.05), rough=0.4),
    "fc_tissue": dict(color=(0.42, 0.06, 0.03), rough=0.25),
    "fc_mineral": dict(color=(0.3, 0.12, 0.05), rough=0.6),
    "fc_frond": dict(color=(0.75, 0.25, 0.08), rough=0.3),
    "gr_glass": dict(color=(0.85, 0.9, 0.95), rough=0.05),
    "gr_tract": dict(color=(0.42, 0.18, 0.7), rough=0.2),
    "gr_cilia": dict(color=(0.9, 0.92, 0.95), rough=0.2),
    "pa_plate": dict(color=(0.45, 0.32, 0.55), rough=0.2),
    "pa_body": dict(color=(0.3, 0.2, 0.25), rough=0.4),
    "pa_leg": dict(color=(0.4, 0.28, 0.35), rough=0.3),
    "pa_eye": dict(color=(0.01, 0.01, 0.012), rough=0.03),
    "pa_stone": dict(color=(0.32, 0.24, 0.18), rough=0.7),
    "pa_egg": dict(color=(0.9, 0.8, 0.68), rough=0.3),
    "pa_fibre": dict(color=(0.5, 0.42, 0.34), rough=0.7),
    "gv_membrane": dict(color=(0.75, 0.72, 0.85), rough=0.08, alpha=0.4),
    "gv_body": dict(color=(0.62, 0.55, 0.75), rough=0.1),
    "gv_core": dict(color=(0.42, 0.22, 0.55), rough=0.2),
    "gv_vein": dict(color=(0.9, 0.9, 0.95), rough=0.2),
    "gv_eye": dict(color=(0.08, 0.06, 0.1), rough=0.05),
    "bm_skin": dict(color=(0.06, 0.05, 0.045), rough=0.6),
    "bm_shield": dict(color=(0.08, 0.06, 0.05), rough=0.7),
    "bm_eye": dict(color=(0.6, 0.38, 0.08), rough=0.05),
    "bm_belly": dict(color=(0.14, 0.09, 0.07), rough=0.5),
    "dh_shell": dict(color=(0.4, 0.15, 0.08), rough=0.8),
    "dh_leg": dict(color=(0.35, 0.14, 0.08), rough=0.7),
    "dh_soft": dict(color=(0.3, 0.12, 0.08), rough=0.5),
    "rs_hide": dict(color=(0.08, 0.04, 0.03), rough=0.3),
    "rs_belly": dict(color=(0.28, 0.16, 0.1), rough=0.35),
    "rs_eye": dict(color=(0.65, 0.45, 0.1), rough=0.05),
    "rs_whisker": dict(color=(0.75, 0.68, 0.6), rough=0.3),
    "mo_hide": dict(color=(0.03, 0.04, 0.06), rough=0.3),
    "mo_belly": dict(color=(0.32, 0.34, 0.36), rough=0.35),
    "mo_gum": dict(color=(0.3, 0.12, 0.13), rough=0.3),
    "mo_eye": dict(color=(0.35, 0.2, 0.06), rough=0.05),
    "mouth_red": dict(color=(0.32, 0.05, 0.06), rough=0.35),
    "tooth": dict(color=(0.82, 0.78, 0.66), rough=0.35),
    "claw_black": dict(color=(0.05, 0.04, 0.04), rough=0.3),
})

# ------------------------------------------------------------------------------------------------ paint + relief
PAINT.update({
    # 909: ruby centres fading through magenta to violet translucent edges, darker veins, frost speckle
    "ib_petal_in": {"base": (0.72, 0.06, 0.22), "layers": [
        ("noise", (0.9, 0.12, 0.3), 0.5, 0.03, 0.48, 0.7), ("retic", (0.5, 0.02, 0.07), 0.6, 0.015, 0.07), ("speck", (0.98, 0.6, 0.7), 0.25, 0.004, 0.76), ("ao", 0.5, 0.04)],
        "relief": [("veins", 0.0006, 0.018, 0.05), ("wrinkle", 0.0003, 0.012)]},
    "ib_petal": {"base": (0.6, 0.18, 0.55), "layers": [
        ("noise", (0.78, 0.2, 0.45), 0.5, 0.04, 0.48, 0.7), ("noise", (0.45, 0.22, 0.7), 0.45, 0.02, 0.55, 0.72),
        ("retic", (0.62, 0.08, 0.2), 0.5, 0.018, 0.06), ("speck", (0.95, 0.78, 0.9), 0.3, 0.004, 0.75),
        ("edge", (0.88, 0.62, 0.92), 0.5), ("ao", 0.5, 0.05)],
        "relief": [("veins", 0.0006, 0.02, 0.05), ("wrinkle", 0.0004, 0.015)]},
    "ib_core": {"base": (0.5, 0.02, 0.05), "layers": [("noise", (0.8, 0.12, 0.12), 0.5, 0.01, 0.48, 0.7), ("speck", (0.95, 0.4, 0.3), 0.4, 0.003, 0.72), ("ao", 0.6, 0.03)],
                "relief": [("scales", 0.0008, 0.004), ("pores", 0.0005, 0.003, 0.3)]},
    "ib_vein": {"base": (0.66, 0.04, 0.08), "layers": [("noise", (0.9, 0.2, 0.2), 0.4, 0.01, 0.5, 0.7)]},
    "ib_nodule": {"base": (0.25, 0.02, 0.04), "layers": [("noise", (0.5, 0.05, 0.08), 0.5, 0.01, 0.5, 0.7), ("ao", 0.5, 0.02)],
                  "relief": [("pores", 0.0006, 0.004, 0.3)]},
    # 912: dark scarlet / oxidised bronze tissue, wet glossy, orange where thin, iron-black at the base, ochre crust
    "fc_tissue": {"base": (0.36, 0.05, 0.025), "layers": [
        ("noise", (0.62, 0.16, 0.04), 0.55, 0.15, 0.48, 0.7), ("streak", (0.75, 0.32, 0.08), 0.45, 0.05, "z", 0.55, 0.74),
        ("grad", (0.08, 0.03, 0.02), 0.6, "z", 0.6, 0.0), ("noise", (0.18, 0.02, 0.02), 0.4, 0.05, 0.52, 0.7),
        ("edge", (0.95, 0.5, 0.15), 0.55), ("cavity", (0.05, 0.01, 0.01), 0.8), ("ao", 0.75, 0.3)],
        "relief": [("wrinkle", 0.004, 0.05, (1, 1, 4)), ("veins", 0.002, 0.06, 0.04), ("vesicles", 0.002, 0.03, 0.25), ("noise", 0.004, 0.12)]},
    "fc_mineral": {"base": (0.22, 0.08, 0.04), "layers": [
        ("noise", (0.6, 0.38, 0.1), 0.6, 0.08, 0.48, 0.68), ("noise", (0.05, 0.03, 0.02), 0.5, 0.2, 0.5, 0.7),
        ("speck", (0.85, 0.65, 0.3), 0.35, 0.01, 0.72), ("cavity", (0.03, 0.01, 0.01), 0.7), ("ao", 0.75, 0.3)],
        "relief": [("vesicles", 0.006, 0.03, 0.3), ("noise", 0.01, 0.1), ("wrinkle", 0.004, 0.04)]},
    "fc_frond": {"base": (0.7, 0.2, 0.05), "layers": [("noise", (0.95, 0.45, 0.12), 0.5, 0.03, 0.48, 0.7), ("grad", (0.4, 0.06, 0.02), 0.5, "z", 1.0, 3.0), ("ao", 0.5, 0.1)],
                 "relief": [("veins", 0.001, 0.02, 0.06)]},
    # 913
    "gr_glass": {"base": (0.82, 0.86, 0.92), "layers": [("noise", (0.7, 0.72, 0.9), 0.3, 0.02, 0.5, 0.7)], "relief": [("bands", 0.0002, 300, "y"), ("wrinkle", 0.0002, 0.006)]},
    "gr_tract": {"base": (0.38, 0.12, 0.62), "layers": [("noise", (0.6, 0.35, 0.85), 0.5, 0.01, 0.5, 0.7)]},
    # 915: iridescent bronze-violet blades (colour from the shader's thin-film + this base), matte worn seams
    "pa_plate": {"base": (0.4, 0.17, 0.07), "layers": [
        ("noise", (0.36, 0.08, 0.62), 0.85, 0.07, 0.47, 0.6, (1, 1, 1), 1.3), ("noise", (0.04, 0.26, 0.72), 0.75, 0.05, 0.55, 0.66),
        ("noise", (0.88, 0.56, 0.1), 0.65, 0.04, 0.57, 0.68), ("noise", (0.06, 0.55, 0.45), 0.45, 0.03, 0.62, 0.72),
        ("streak", (0.6, 0.42, 0.3), 0.45, 0.006, "y", 0.55, 0.72), ("edge", (0.9, 0.78, 0.6), 0.6),
        ("cavity", (0.1, 0.05, 0.04), 0.75), ("ao", 0.65, 0.15)],
        "relief": [("grooves", 0.0008, 0.02, 0.05), ("wrinkle", 0.0006, 0.015, (1, 4, 1))]},
    "pa_body": {"base": (0.2, 0.12, 0.08), "layers": [("noise", (0.38, 0.22, 0.14), 0.5, 0.05, 0.5, 0.7), ("noise", (0.25, 0.12, 0.3), 0.35, 0.03, 0.56, 0.7), ("ao", 0.7, 0.2)],
                "relief": [("wrinkle", 0.0015, 0.02), ("scales", 0.0008, 0.008)]},
    "pa_leg": {"base": (0.34, 0.2, 0.13), "layers": [("noise", (0.38, 0.18, 0.45), 0.5, 0.04, 0.52, 0.68), ("streak", (0.6, 0.42, 0.3), 0.45, 0.01, "z", 0.55, 0.72), ("edge", (0.85, 0.7, 0.55), 0.55), ("ao", 0.6, 0.1)],
               "relief": [("scales", 0.0008, 0.008), ("grooves", 0.0006, 0.02, 0.05)]},
    "pa_stone": {"base": (0.26, 0.19, 0.14), "layers": [("noise", (0.42, 0.3, 0.2), 0.5, 0.06, 0.48, 0.7), ("noise", (0.35, 0.14, 0.07), 0.45, 0.03, 0.56, 0.7), ("speck", (0.55, 0.5, 0.45), 0.35, 0.01, 0.72), ("edge", (0.5, 0.45, 0.4), 0.5), ("ao", 0.8, 0.2)],
                 "relief": [("noise", 0.004, 0.04), ("pores", 0.002, 0.01, 0.3)]},
    "pa_egg": {"base": (0.88, 0.78, 0.66), "layers": [("retic", (0.65, 0.4, 0.3), 0.55, 0.02, 0.06), ("ao", 0.5, 0.05)], "relief": [("veins", 0.0006, 0.02, 0.05)]},
    "pa_fibre": {"base": (0.45, 0.38, 0.3), "layers": [("streak", (0.65, 0.58, 0.48), 0.5, 0.005, "x", 0.55, 0.72)]},
    # 911: silver-lilac membrane, branching silver veins, a dotted receptor row near the edge
    "gv_membrane": {"base": (0.66, 0.62, 0.78), "layers": [
        ("retic", (0.95, 0.95, 1.0), 0.6, 0.12, 0.025), ("noise", (0.55, 0.42, 0.72), 0.4, 0.15, 0.5, 0.7),
        ("speck", (0.98, 0.98, 1.0), 0.35, 0.01, 0.76)],
        "relief": [("veins", 0.0012, 0.12, 0.03), ("wrinkle", 0.0006, 0.06)]},
    "gv_body": {"base": (0.55, 0.42, 0.68), "layers": [("noise", (0.75, 0.65, 0.85), 0.45, 0.05, 0.5, 0.7), ("retic", (0.92, 0.9, 0.98), 0.4, 0.05, 0.04), ("ao", 0.5, 0.1)],
                "relief": [("veins", 0.0008, 0.05, 0.04), ("pores", 0.0006, 0.01, 0.3)]},
    "gv_core": {"base": (0.38, 0.14, 0.5), "layers": [("noise", (0.6, 0.25, 0.7), 0.5, 0.04, 0.5, 0.7)]},
    # 910: near-black basalt skin, rust mottling, ochre dust in the pits, worn grey edges
    "bm_skin": {"base": (0.03, 0.026, 0.024), "layers": [
        ("noise", (0.4, 0.12, 0.04), 0.62, 0.09, 0.55, 0.66, (1, 1, 1), 1.4), ("noise", (0.55, 0.18, 0.06), 0.5, 0.03, 0.6, 0.72),
        ("speck", (0.45, 0.14, 0.05), 0.5, 0.012, 0.66), ("noise", (0.2, 0.07, 0.03), 0.4, 0.2, 0.5, 0.6),
        ("noise", (0.012, 0.01, 0.01), 0.5, 0.05, 0.5, 0.62), ("speck", (0.62, 0.28, 0.1), 0.45, 0.006, 0.72), ("edge", (0.3, 0.27, 0.25), 0.6),
        ("cavity", (0.008, 0.006, 0.006), 0.7), ("ao", 0.75, 0.2)],
        "relief": [("scales", 0.0025, 0.012), ("vesicles", 0.0025, 0.02, 0.25), ("wrinkle", 0.002, 0.04)]},
    "bm_shield": {"base": (0.035, 0.03, 0.027), "layers": [
        ("noise", (0.48, 0.14, 0.045), 0.75, 0.12, 0.53, 0.65, (1, 1, 1), 1.2), ("noise", (0.02, 0.02, 0.02), 0.4, 0.05, 0.52, 0.7),
        ("speck", (0.55, 0.3, 0.12), 0.35, 0.01, 0.72), ("edge", (0.25, 0.2, 0.17), 0.6), ("cavity", (0.3, 0.1, 0.04), 0.6), ("ao", 0.75, 0.25)],
        "relief": [("vesicles", 0.006, 0.035, 0.3), ("vesicles", 0.003, 0.012, 0.3), ("noise", 0.006, 0.06)]},
    "bm_belly": {"base": (0.12, 0.07, 0.05), "layers": [("noise", (0.25, 0.12, 0.08), 0.5, 0.05, 0.5, 0.7), ("ao", 0.6, 0.2)], "relief": [("scales", 0.0015, 0.01)]},
    # 914: rust-red with a dust coat, darker cracks, impact pits
    "dh_shell": {"base": (0.36, 0.12, 0.06), "layers": [
        ("noise", (0.55, 0.24, 0.12), 0.5, 0.04, 0.48, 0.7), ("noise", (0.2, 0.06, 0.03), 0.45, 0.015, 0.52, 0.7),
        ("retic", (0.14, 0.05, 0.03), 0.45, 0.03, 0.025), ("speck", (0.75, 0.42, 0.25), 0.45, 0.002, 0.7), ("edge", (0.66, 0.4, 0.26), 0.55),
        ("cavity", (0.58, 0.32, 0.18), 0.6), ("noise", (0.62, 0.36, 0.22), 0.35, 0.02, 0.6, 0.72), ("ao", 0.6, 0.05)],
        "relief": [("cells", 0.0012, 0.03, 0.03), ("vesicles", 0.001, 0.008, 0.35), ("pores", 0.0006, 0.003, 0.3), ("wrinkle", 0.0008, 0.012), ("noise", 0.0008, 0.02)]},
    "dh_leg": {"base": (0.32, 0.12, 0.06), "layers": [("noise", (0.5, 0.22, 0.12), 0.5, 0.01, 0.5, 0.7), ("speck", (0.7, 0.42, 0.25), 0.4, 0.002, 0.7), ("ao", 0.7, 0.03)],
               "relief": [("scales", 0.0005, 0.004)]},
    "dh_soft": {"base": (0.28, 0.1, 0.06), "layers": [("noise", (0.42, 0.18, 0.1), 0.4, 0.01, 0.5, 0.7)], "relief": [("wrinkle", 0.0005, 0.005)]},
    # 907: wet black hide with rust-copper bands and mottling, ochre mineral crust on the back, paler belly
    "rs_hide": {"base": (0.045, 0.022, 0.018), "layers": [
        ("chevron", (0.4, 0.13, 0.045), 0.72, 2.4, 0.25, 0.3, -0.35, 0.44), ("chevron", (0.55, 0.24, 0.08), 0.3, 5.0, 0.4, 0.16, -0.1, 0.55), ("noise", (0.42, 0.14, 0.05), 0.5, 0.05, 0.52, 0.7),
        ("noise", (0.75, 0.4, 0.12), 0.3, 0.02, 0.6, 0.74), ("back", (0.03, 0.015, 0.012), 0.35), ("belly", (0.3, 0.17, 0.1), 0.6),
        ("edge", (0.6, 0.35, 0.18), 0.4), ("cavity", (0.01, 0.005, 0.004), 0.7), ("ao", 0.7, 0.2)],
        "relief": [("scales", 0.0018, 0.012), ("wrinkle", 0.0025, 0.04, (1, 3, 1)), ("pores", 0.0008, 0.01, 0.3)]},
    "rs_belly": {"base": (0.25, 0.14, 0.09), "layers": [("noise", (0.38, 0.22, 0.14), 0.4, 0.04, 0.5, 0.7), ("ao", 0.6, 0.15)],
                 "relief": [("wrinkle", 0.0015, 0.025, (4, 1, 1)), ("scales", 0.001, 0.01)]},
    # 908: black-blue, ivory chevron scars along the back, paler belly, pitted old injuries
    "mo_hide": {"base": (0.022, 0.03, 0.048), "layers": [
        ("chevron", (0.7, 0.68, 0.6), 0.85, 1.6, 0.85, 0.2, 0.2, 0.42), ("chevron", (0.5, 0.52, 0.52), 0.5, 3.4, 1.1, 0.12, 0.35, 0.5),
        ("noise", (0.06, 0.08, 0.11), 0.5, 0.3, 0.48, 0.7), ("spots", (0.45, 0.47, 0.48), 0.4, 0.12, 0.18, 0.25),
        ("noise", (0.5, 0.52, 0.5), 0.35, 0.08, 0.66, 0.72), ("speck", (0.5, 0.52, 0.55), 0.35, 0.02, 0.74),
        ("belly", (0.3, 0.32, 0.34), 0.7), ("edge", (0.15, 0.17, 0.2), 0.4), ("cavity", (0.005, 0.008, 0.015), 0.7), ("ao", 0.7, 0.5)],
        "relief": [("wrinkle", 0.0015, 0.06, (3, 1, 3)), ("pores", 0.0014, 0.03, 0.3), ("noise", 0.002, 0.3)]},
    "mo_belly": {"base": (0.3, 0.32, 0.34), "layers": [("streak", (0.22, 0.24, 0.26), 0.4, 0.03, "x", 0.55, 0.7), ("ao", 0.6, 0.3)],
                 "relief": [("wrinkle", 0.004, 0.04, (4, 1, 1))]},
    "mo_gum": {"base": (0.14, 0.05, 0.06), "layers": [("noise", (0.15, 0.04, 0.05), 0.5, 0.02, 0.5, 0.7), ("ao", 0.8, 0.1)], "relief": [("wrinkle", 0.002, 0.02)]},
    "mouth_red": {"base": (0.26, 0.04, 0.05), "layers": [("noise", (0.12, 0.02, 0.03), 0.6, 0.02, 0.45, 0.7), ("ao", 0.8, 0.1)], "relief": [("wrinkle", 0.0015, 0.015)]},
})


def pose(arm, rots):
    for nm, r in rots.items():
        pb = arm.pose.bones.get(nm)
        if pb:
            pb.rotation_mode = "XYZ"
            pb.rotation_euler = r


def preview(name, cam, target, lens=40, world=(0.5, 0.52, 0.56), sun=(0.4, -0.5, 0.8)):
    kit.preview(os.path.join(kit.preview_dir(), f"{name}.png"), cam, target, lens=lens, samples=16, world=world, sun=sun, sun_strength=3.5)


def export_static(root, body, path, props, size=1024, nsize=None, ao=None):
    """a static (unskinned) creature or habitat model, painted + normal-baked"""
    body.parent = root
    PNT.bake_body(body, os.path.splitext(os.path.basename(path))[0], size=size, nsize=nsize)
    if ao:
        C.bake_ao(body, distance=ao)
    kit.set_props(root, **props)
    kit.select_tree(root)
    kw = dict(filepath=path, export_format="GLB", use_selection=True, export_apply=True, export_extras=True, export_yup=True,
              export_animations=False, export_cameras=False, export_materials="EXPORT", export_image_format="JPEG", export_jpeg_quality=88)
    if ao:
        kw.update(export_vertex_color="NAME", export_vertex_color_name="AO", export_all_vertex_colors=False)
    bpy.ops.export_scene.gltf(**kw)
    tris = sum(len(p.vertices) - 2 for p in body.data.polygons)
    print(f"[creature] {path} ~{tris} tris, {os.path.getsize(path) / 1e6:.2f} MB")


def bands(name, ts, t0, t1, n, ac, ah, m, rng, lift=0.01, thick=0.01, keel=0.0, tip=0.6, spines=0, spine_len=0.0, spine_m=None, K=14):
    out = []
    for i in range(n):
        tc = t0 + (t1 - t0) * (i + 0.5) / n
        dt = (t1 - t0) / n * 0.78
        out.append(plate(f"{name}{i}", ts.P, ts.N, tc, ac + rng.uniform(-0.05, 0.05), dt, ah, m, rng, lift=lift, thick=thick, dome=0.4, jag=0.15,
                         keel=keel, tip=tip, spines=spines, spine_len=spine_len, spine_m=spine_m, K=K, rings=3))
    return out


def surf_t(S, y):
    lo, hi = 0.0, 1.0
    for _ in range(30):
        mid = (lo + hi) / 2
        if S.sec(mid)[0] < y:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


def surf_at(S, y, a, lift=0.0):
    t = surf_t(S, y)
    return S.P(t, a) + S.N(t, a) * lift, S.N(t, a)


def mouth_curve(y_back, y_front, half_w, z_back, z_front, sharp=0.7):
    def f(s):
        ph = s * PI / 2
        c = math.cos(ph)
        return V((math.sin(ph) * half_w, y_back + (y_front - y_back) * abs(c) ** sharp, z_back + (z_front - z_back) * abs(c) ** 1.5))
    return f


def cellular(p, scale, w=0.12):
    """Voronoi plate mosaic: ~1 inside a cell, 0 in the seams, with a per-cell height"""
    dd, pts = noise.voronoi(p * scale)
    return sstep(0.0, w, dd[1] - dd[0]) * (0.65 + 0.35 * noise.noise(pts[0] * 3.7))


def scale_grid(t, a, rows, cols):
    """overlapping scale bumps on a (t, a) tube parameterisation"""
    u = t * rows
    v = a / TAU * cols + 0.5 * math.floor(u)
    fu, fv = u - math.floor(u), v - math.floor(v)
    return max(0.0, 1 - ((fu - 0.55) / 0.6) ** 2 - ((fv - 0.5) / 0.6) ** 2)


def foil(name, root, span, chord, L, prof, m, ns=18, nc=24, curl=0.0):
    """a lofted fin with a real section: thick at the root and the leading edge, thinning to a fine trailing edge
    and tip. span / chord: directions (chord points to the trailing edge); prof(s) -> (chord length, max thickness,
    leading-edge setback along chord) for s 0 root .. 1 tip; curl lifts the tip along the section normal."""
    span = V(span).normalized()
    chord = V(chord)
    chord = (chord - span * chord.dot(span)).normalized()
    up = span.cross(chord).normalized()
    bm = bmesh.new()
    rows = []
    for i in range(ns):
        sv = i / (ns - 1)
        cl, th, off = prof(sv)
        c0 = V(root) + span * (L * sv) + chord * off + up * (curl * L * sv * sv)
        row = []
        for j in range(nc):
            a = TAU * j / nc
            x = 0.5 * (1 - math.cos(a))
            t = th * 2.6 * math.sqrt(max(x, 0.0)) * (1 - x) * (1 if math.sin(a) >= 0 else -1)
            row.append(bm.verts.new(c0 + chord * (x * cl) + up * t))
        rows.append(row)
    for i in range(ns - 1):
        for j in range(nc):
            bm.faces.new((rows[i][j], rows[i][(j + 1) % nc], rows[i + 1][(j + 1) % nc], rows[i + 1][j]))
    for k, row in ((0, rows[0]), (1, rows[-1])):
        c = sum((v.co for v in row), V((0, 0, 0))) / len(row)
        pole = bm.verts.new(c)
        for j in range(nc):
            bm.faces.new((row[j], row[(j + 1) % nc], pole))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = kit.from_bmesh(name, bm, (m,))
    kit.smooth(o, 50)
    return o


# ================================================================================================ 909 Crimson Icebloom
def petal(name, c, up, d, L, W, e0, e1, cup, wave, rng, nu=9, nv=7):
    """a broad, rounded, cupped translucent petal (a gel lamella): base at c, heading d (unit, ⟂ up), rising at e0 and
    flaring to e1 (radians above the horizontal); colour bands from the crimson base to the violet rim"""
    bm = bmesh.new()
    rows = []
    side = up.cross(d).normalized()
    ph = rng.uniform(0, TAU)
    p = c.copy()
    prev = None
    for i in range(nu):
        u = i / (nu - 1)
        e = e0 + (e1 - e0) * u ** 1.3
        dirv = d * math.cos(e) + up * math.sin(e)
        if prev is not None:
            p = p + dirv * (L / (nu - 1))
        prev = p
        nl = (up * math.cos(e) - d * math.sin(e)).normalized()
        w = W * (0.28 + 0.72 * u ** 0.5) * math.sqrt(max(0.0, 1 - u ** 4)) + 0.002
        row = []
        for j in range(nv):
            v = -1 + 2 * j / (nv - 1)
            q = p + side * (v * w) + nl * (cup * v * v * w + wave * math.sin(v * PI * 1.5 + ph + u * 3) * abs(v) ** 1.5 * u * W)
            row.append(bm.verts.new(q))
        rows.append(row)
    for i in range(nu - 1):
        m = 0 if i < (nu - 1) * 0.3 else (1 if i < (nu - 1) * 0.62 else 2)
        for j in range(nv - 1):
            f = bm.faces.new((rows[i][j], rows[i][j + 1], rows[i + 1][j + 1], rows[i + 1][j]))
            f.material_index = m
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = kit.from_bmesh(name, bm, ("ib_core", "ib_petal_in", "ib_petal"))
    kit.smooth(o, 80)
    return o


def rosette(name, c, n_up, R, rng, layers=5):
    """one bloom: a dark-red papillate core inside rings of broad cupped lamellae — inner ones upright, outer ones flared"""
    up = V(n_up).normalized()
    ax = up.orthogonal().normalized()
    ay = up.cross(ax).normalized()
    parts = [kit.sphere(f"{name}core", R * 0.14, loc=tuple(c + up * (R * 0.06)), m="ib_core", segs=12, rings=7, scale=(1, 1, 0.75))]
    for k in range(9):
        a = rng.uniform(0, TAU)
        rr = R * 0.1 * math.sqrt(rng.random())
        p = c + up * (R * 0.13) + ax * (math.cos(a) * rr) + ay * (math.sin(a) * rr)
        parts.append(kit.sphere(f"{name}pa{k}", R * 0.025, loc=tuple(p), m="ib_vein", segs=6, rings=4))
    for Lr in range(layers):
        f = (Lr + 1) / layers
        n = 5 + Lr + (1 if Lr > 1 else 0)
        for k in range(n):
            a = TAU * (k + 0.5 * (Lr % 2) + rng.uniform(-0.12, 0.12)) / n
            d = (ax * math.cos(a) + ay * math.sin(a)).normalized()
            base = c + d * (R * 0.06 * f) + up * (R * 0.03 * (1 - f))
            L = R * (0.32 + 0.72 * f) * rng.uniform(0.9, 1.08)
            W = L * (0.42 + 0.12 * f) * PI / max(3.2, n * 0.62)
            e0 = 1.35 - 0.95 * f
            e1 = e0 - 0.25 - 0.55 * f
            parts.append(petal(f"{name}l{Lr}_{k}", base, up, d, L, W, e0, e1, cup=0.55 - 0.25 * f, wave=0.05 + 0.05 * f, rng=rng))
    return kit.merge(parts, name)


def icebloom():
    """a colony patch ~2 m across lying on its attachment surface (+Z out of the ice face)"""
    kit.reset()
    root = empty("CrimsonIcebloom")
    rng = random.Random(909)
    parts = []
    blooms = [(V((0, 0, 0)), 0.42), (V((-0.62, 0.3, 0.0)), 0.24), (V((0.58, -0.22, 0.0)), 0.3), (V((-0.3, -0.55, 0)), 0.18),
              (V((0.32, 0.55, 0)), 0.2), (V((-0.9, -0.2, 0)), 0.12), (V((0.9, 0.3, 0)), 0.14), (V((0.05, -0.85, 0)), 0.1), (V((-0.55, 0.75, 0)), 0.09)]
    for i, (c, r) in enumerate(blooms):
        tilt = V((rng.uniform(-0.2, 0.2), rng.uniform(-0.2, 0.2), 1))
        parts.append(rosette(f"r{i}", c + V((0, 0, 0.02)), tilt, r, rng, layers=5 if r > 0.25 else 3))
    # the capillary net: branching red vessels over the face between and beyond the blooms
    vess = []

    def branch(p, d, L, r, depth):
        pts = [p]
        q = p.copy()
        dd = d.copy()
        for s in range(8):
            dd = (dd + V((rng.uniform(-0.5, 0.5), rng.uniform(-0.5, 0.5), 0)) * 0.4).normalized()
            q = q + dd * (L / 8)
            q.z = 0.01 + 0.006 * math.sin(s)
            pts.append(q.copy())
        vess.append(tube(f"v{len(vess)}", pts, [r * (1 - 0.7 * s / 8) + 0.001 for s in range(9)], "ib_vein", seg=4))
        if depth > 0:
            for _ in range(2):
                k = rng.randint(3, 7)
                branch(pts[k], (dd + V((rng.uniform(-1, 1), rng.uniform(-1, 1), 0))).normalized(), L * 0.6, r * 0.6, depth - 1)
    for i, (c, r) in enumerate(blooms):
        for k in range(3 if r > 0.2 else 2):
            a = rng.uniform(0, TAU)
            branch(c + V((math.cos(a), math.sin(a), 0)) * r * 0.3, V((math.cos(a), math.sin(a), 0)), 0.3 + 0.4 * r, 0.006 + 0.01 * r, 2)
    parts.append(kit.merge(vess, "vessels"))
    # pigmented nodules round the attachment faces
    nod = []
    for k in range(36):
        c, r = blooms[rng.randrange(len(blooms))]
        a = rng.uniform(0, TAU)
        d = r * rng.uniform(0.9, 1.5)
        nod.append(kit.sphere(f"n{k}", rng.uniform(0.006, 0.02), loc=tuple(c + V((math.cos(a) * d, math.sin(a) * d, 0.008))), m="ib_nodule", segs=6, rings=4, scale=(1, 1, 0.6)))
    parts.append(kit.merge(nod, "nodules"))
    body = kit.merge(parts, "icebloom_body")
    kit.smooth(body, 40)
    export_static(root, body, os.path.join(kit.out_dir(), "mars_icebloom.glb"), {"creature": "icebloom", "span": 2.0}, size=2048, nsize=1024, ao=0.12)
    return root, None


# ================================================================================================ 912 Ferric Cathedral
def ferric(variant=0):
    """3.4 m tall (variant 0) / 2.0 m colony on its vent mound; origin at the ground under the trunk (ref 912):
    a massive gnarled trunk of intertwined glossy strands on flaring buttress roots, a wide crown of forked branches
    ending in spiky combed tips, flat frilly shelves on the main limbs, mineral drips, an ochre crust at the base"""
    kit.reset()
    root = empty("FerricCathedral")
    rng = random.Random(912 + variant * 17)
    H = 3.4 if variant == 0 else 2.0
    k = H / 3.4
    tubes, twigs, shelves, drips = [], [], [], []

    def limb(pts, r0, r1, name, mat="fc_tissue", seg=7):
        n = 2 * (len(pts) - 1) + 1
        path = [smooth_lerp(pts, (len(pts) - 1) * i / (n - 1)) for i in range(n)]
        radii = [(r0 + (r1 - r0) * (i / (n - 1)) ** 0.8) * (1 + 0.14 * math.sin(i * 2.3 + rng.random() * 3) ** 2) for i in range(n)]
        tubes.append(tube(name, path, radii, mat, seg=seg))
        return path

    def grow(p, d, L, r, depth, name):
        pts = [p]
        q = p.copy()
        dd = d.copy()
        for s_ in range(3):
            dd = (dd + V((rng.uniform(-0.3, 0.3), rng.uniform(-0.3, 0.3), rng.uniform(0.0, 0.22)))).normalized()
            q = q + dd * (L / 3)
            pts.append(q.copy())
        path = limb(pts, r, r * 0.66, name, seg=7 if r > 0.05 * k else 4)
        if r > 0.035 * k and rng.random() < 0.55:
            b = path[rng.randrange(1, len(path) - 1)] - V((0, 0, r * 0.7))
            dl = rng.uniform(0.05, 0.18) * k
            drips.append(tube(f"dr{name}", [b, b - V((0, 0, dl * 0.5)), b - V((0, 0, dl))], [r * 0.45, r * 0.25, r * 0.08], "fc_tissue", seg=4))
        if depth == 0 or r < 0.012 * k:
            # combed tip: a frilly lattice fan facing the flow, and a few short sharp branchlets
            tip = path[-1]
            side = dd.cross(V((0, 0, 1)))
            side = side.normalized() if side.length > 1e-3 else V((1, 0, 0))
            fr = L * rng.uniform(0.7, 1.0)
            base = [tip + side * (0.012 * (j - 2)) for j in range(5)]
            edge = []
            for j in range(5):
                a = -0.95 + 1.9 * j / 4
                dv = (dd * math.cos(a) + side * math.sin(a)).normalized()
                edge.append(tip + dv * fr + V((0, 0, fr * 0.25 * math.cos(a))))
            shelves.append(fin(f"fan{name}", base, edge, "fc_frond", nv=3, rays=5, corr=0.004 * k, scallop=0.16, ruffle=0.015 * k, ruffle_f=5,
                               thick=0.005 * k, rays_m="fc_tissue", ray_r=0.004 * k, ray_taper=0.3))
            for t_ in range(rng.randint(2, 3)):
                td = (dd + V((rng.uniform(-0.7, 0.7), rng.uniform(-0.7, 0.7), rng.uniform(0.1, 0.6)))).normalized()
                twigs.append(fang(f"tw{name}{t_}", tip, td, V((0, 0, 1)), L * rng.uniform(0.3, 0.5), r * 0.75, curve=0.25, m="fc_frond", seg=3, n=3))
            return
        if depth in (1, 2, 3) and r > 0.02 * k and rng.random() < 0.6:
            # a flat frilly shelf grows out sideways from the limb (table-like)
            c = path[len(path) // 2]
            side = dd.cross(V((0, 0, 1)))
            side = side.normalized() if side.length > 1e-3 else V((1, 0, 0))
            sr = rng.uniform(0.28, 0.45) * k
            base = [c + side * (0.02 * (j - 3)) for j in range(7)]
            edge = []
            for j in range(7):
                a = -1.3 + 2.6 * j / 6
                dirv = (side * math.cos(a) + dd.cross(side).normalized() * math.sin(a)).normalized()
                dirv.z *= 0.15
                edge.append(c + dirv.normalized() * sr * (0.8 + 0.25 * math.cos(a * 1.7)))
            shelves.append(fin(f"sh{name}", base, edge, "fc_frond", nv=4, rays=7, corr=0.006 * k, scallop=0.14, ruffle=0.02 * k, ruffle_f=6,
                               thick=0.008 * k, rays_m="fc_tissue", ray_r=0.006 * k, ray_taper=0.3))
        nk = 2 if depth > 1 else rng.choice((2, 3))
        for j in range(nk):
            a = TAU * j / nk + rng.uniform(-0.5, 0.5)
            spread = 0.55 + 0.3 * rng.random()
            nd = (dd + V((math.cos(a) * spread, math.sin(a) * spread, 0.05))).normalized()
            grow(path[-1] - dd * r * 0.4, nd, L * rng.uniform(0.66, 0.8), r * rng.uniform(0.6, 0.7), depth - 1, f"{name}{j}")

    # the trunk: five strands twisting round each other, swollen and ridged
    trunk_h = H * 0.36
    for j in range(5):
        a0 = TAU * j / 5
        pts = []
        for i in range(7):
            t = i / 6
            a = a0 + 1.9 * t
            rr = (0.17 * (1 - 0.45 * t) + 0.1 * (1 - t) ** 3) * k
            pts.append(V((math.cos(a) * rr, math.sin(a) * rr, -0.05 + trunk_h * t)))
        limb(pts, 0.14 * k, 0.085 * k, f"strand{j}", seg=8)
    top = V((0, 0, trunk_h))
    nprim = 5 if variant == 0 else 4
    for j in range(nprim):
        a = TAU * j / nprim + rng.uniform(-0.3, 0.3)
        d = V((math.cos(a) * 1.35, math.sin(a) * 1.35, 1)).normalized()
        grow(top - V((0, 0, 0.1 * k)), d, H * 0.34, 0.1 * k, 4 if variant == 0 else 3, f"b{j}")
    # buttress roots arching from the trunk foot over the mound
    for j in range(8):
        a = TAU * j / 8 + rng.uniform(-0.2, 0.2)
        d = V((math.cos(a), math.sin(a), 0))
        L = rng.uniform(0.7, 1.3) * k
        pts = [V((0, 0, 0.55 * k)) + d * 0.08 * k, d * (L * 0.3) + V((0, 0, 0.3 * k)), d * (L * 0.7) + V((0, 0, 0.06 * k)), d * L + V((0, 0, -0.08))]
        limb(pts, 0.11 * k, 0.025 * k, f"root{j}", seg=7)
    # the mineral crust: lumpy terraces round the seep
    crust = []
    for j in range(26):
        a = rng.uniform(0, TAU)
        d = rng.uniform(0.2, 1.3) * k
        r = rng.uniform(0.09, 0.24) * k
        crust.append(kit.sphere(f"cr{j}", r, loc=(math.cos(a) * d, math.sin(a) * d, -0.04), m="fc_mineral", segs=8, rings=5, scale=(1.5, 1.3, 0.55)))
    parts = [kit.merge(tubes, "branches"), kit.merge(twigs, "twigs"), kit.merge(crust, "crust")]
    if shelves:
        parts.append(kit.merge(shelves, "shelves"))
    if drips:
        parts.append(kit.merge(drips, "drips"))
    body = kit.merge(parts, "ferric_body")
    kit.smooth(body, 40)
    name = "mars_ferric.glb" if variant == 0 else "mars_ferric_small.glb"
    export_static(root, body, os.path.join(kit.out_dir(), name), {"creature": "ferric", "height": H}, size=2048 if variant == 0 else 1024, nsize=1024, ao=0.3)
    return root, None


def ferric_small():
    return ferric(1)


# ================================================================================================ 913 Glass Ribbon
def ribbon():
    """0.42 m; a static mesh (schools are instanced and swim with a vertex-shader body wave); +Y head"""
    kit.reset()
    root = empty("GlassRibbon")
    rng = random.Random(913)
    L = 0.42
    body = Surf([(-0.21, 0.002, 0.001, 0.001, 0.0, 2.0), (-0.16, 0.009, 0.0025, 0.0025, 0.0, 2.2), (-0.05, 0.015, 0.0035, 0.0035, 0.0, 2.4),
                 (0.08, 0.017, 0.004, 0.004, 0.0, 2.5), (0.17, 0.013, 0.0035, 0.0035, 0.0, 2.4), (0.205, 0.006, 0.0025, 0.0025, 0.0, 2.2), (0.215, 0.001, 0.001, 0.001, 0.0, 2.0)],
                bend=lambda t: (0.0, 0.004 * math.sin(TAU * t)))
    parts = [body.mesh("body", 60, 16, ("gr_glass",))]
    # rippling fin margins along both sides
    for sx in (-1, 1):
        base, edge = [], []
        for k in range(15):
            t = 0.06 + 0.86 * k / 14
            y, w = body.sec(t)[0], body.sec(t)[1]
            base.append(V((sx * w * 0.9, y, 0.0)))
            fw = 0.012 * math.sin(PI * (0.1 + 0.85 * k / 14)) + 0.003
            edge.append(V((sx * (w + fw), y, 0.002 * math.sin(k * 1.3))))
        parts.append(fin(f"fin{sx}", base, edge, "gr_glass", nv=4, rays=28, corr=0.0006, ruffle=0.0025, ruffle_f=7, thick=0.0005, rays_m="gr_cilia", ray_r=0.0003, ray_taper=0.5))
    # the violet organ tract, a gut bulge, fine nerve threads
    tract = [V((0.0005 * math.sin(k), -0.18 + 0.37 * k / 20, 0.0)) for k in range(21)]
    parts.append(tube("tract", tract, [0.0012 + 0.0008 * math.sin(PI * k / 20) for k in range(21)], "gr_tract", seg=6))
    parts.append(kit.sphere("gut", 1.0, loc=(0, 0.03, 0), m="gr_tract", segs=12, rings=8, scale=(0.006, 0.05, 0.003)))
    parts.append(kit.sphere("gut2", 1.0, loc=(0, -0.06, 0), m="gr_tract", segs=10, rings=6, scale=(0.004, 0.03, 0.0025)))
    # a comb of cilia at the head tip
    cil = []
    for k in range(22):
        a = -1.2 + 2.4 * k / 21
        b = V((math.sin(a) * 0.006, 0.2 + math.cos(a) * 0.006, 0.0))
        cil.append(tube(f"c{k}", [b, b + V((math.sin(a) * 0.006, 0.006, rng.uniform(-0.001, 0.001)))], [0.0004, 0.0001], "gr_cilia", seg=3))
    parts.append(kit.merge(cil, "cilia"))
    body_o = kit.merge(parts, "ribbon_body")
    kit.smooth(body_o, 50)
    export_static(root, body_o, os.path.join(kit.out_dir(), "mars_ribbon.glb"), {"creature": "ribbon", "length": L}, size=512)
    return root, None


# ================================================================================================ 915 Prism Architect
def lance_outline(phi, length=2.4, base=0.42):
    """a lanceolate plate outline pointing along local angle phi (π = toward the tail with rear=-1)"""
    def f(th):
        c = math.cos(th - phi)
        return base + length * max(0.0, c) ** 2.6 + 0.12 * max(0.0, -c)
    return f


def prism():
    """1.25 m long, ~1.8 m across the legs; ground z = 0 (ref 915). A high-legged, broad, plated isopod-like builder."""
    kit.reset()
    root = empty("PrismArchitect")
    rng = random.Random(915)
    sk = Skeleton()
    sk.add("body", (0, -0.45, 0.52), (0, 0.32, 0.52))
    sk.add("head", (0, 0.32, 0.48), (0, 0.66, 0.42), "body")
    parts = []
    core = Surf([(-0.6, 0.05, 0.05, 0.04, 0.48, 2.0), (-0.46, 0.25, 0.17, 0.12, 0.49, 2.4), (-0.12, 0.33, 0.22, 0.14, 0.5, 2.5),
                 (0.18, 0.3, 0.2, 0.13, 0.5, 2.4), (0.36, 0.2, 0.14, 0.1, 0.48, 2.2), (0.46, 0.12, 0.09, 0.08, 0.46, 2.0)])

    def cdisp(t, a):
        if math.sin(a) > -0.15:
            return 0.0
        y = core.P(t, a).y
        f = (y * 9.0) % 1.0
        return -0.012 * math.exp(-((f - 0.5) / 0.07) ** 2)   # segmented sternites underneath
    parts.append(Part(core.mesh("core", 50, 36, ("pa_body",), disp=cdisp), bones=["body", "head"]))
    # the cloak: lanceolate iridescent plates in shingled rows, pointing back; the wide skirt flares them outward at the margins
    cloak = Surf([(-0.7, 0.12, 0.08, 0.01, 0.53, 2.0), (-0.52, 0.52, 0.27, 0.012, 0.52, 2.6), (-0.15, 0.64, 0.34, 0.012, 0.52, 2.9),
                  (0.15, 0.6, 0.32, 0.012, 0.52, 2.8), (0.33, 0.44, 0.24, 0.012, 0.51, 2.4), (0.45, 0.22, 0.13, 0.012, 0.49, 2.0)])
    blades = []
    rows = 9
    for r in range(rows):
        tc = 0.08 + 0.84 * r / (rows - 1)
        cols = 10 + (r % 2) - (2 if r == rows - 1 else 0)
        for c in range(cols):
            ac = 0.03 * PI + 0.94 * PI * (c + 0.5) / cols + rng.uniform(-0.03, 0.03)
            side = math.cos(ac)                                   # +1 right margin .. -1 left margin
            phi = PI + 0.75 * side * abs(side) ** 0.5             # tips point back, swinging outward at the margins
            big = 1.0 + 0.35 * math.sin(ac) * math.sin(PI * (r + 0.5) / rows)   # the big plates ride the crown of the back
            blades.append(plate(f"bl{r}_{c}", cloak.P, cloak.N, tc + rng.uniform(-0.012, 0.012), ac, 0.055 * big, 0.1 * big + 0.03 * abs(side), "pa_plate", rng,
                                rear=-1, lift=0.035 + 0.035 * abs(side), thick=0.008, dome=0.22, jag=0.06, keel=0.007, outline=lance_outline(phi, 2.9), K=24, rings=4,
                                inset=0.006 + 0.003 * r))
    parts.append(Part(kit.merge(blades, "blades"), bone="body"))
    # head: a rounded plated face, big glossy black eyes, a fringe of mouth bristles, long antennae
    head = Surf([(0.34, 0.14, 0.11, 0.09, 0.47, 2.2), (0.48, 0.15, 0.1, 0.09, 0.45, 2.3), (0.58, 0.12, 0.08, 0.075, 0.43, 2.2),
                 (0.65, 0.07, 0.05, 0.05, 0.42, 2.0), (0.68, 0.02, 0.02, 0.02, 0.42, 2.0)])
    parts.append(Part(head.mesh("head", 30, 28, ("pa_body",)), bone="head"))
    hd = []
    for r in range(3):
        for c in range(4):
            hd.append(plate(f"hp{r}{c}", head.P, head.N, 0.2 + 0.25 * r, 0.12 * PI + 0.76 * PI * (c + 0.5) / 4, 0.1, 0.32, "pa_plate", rng, rear=-1,
                            lift=0.008, thick=0.004, dome=0.4, jag=0.1, keel=0.003, tip=0.4, K=16, rings=3, inset=0.003))
    for sx in (-1, 1):
        c, n = surf_at(head, 0.55, PI / 2 - sx * 0.95, -0.012)
        hd.append(eye(f"eye{sx}", c, (n + V((0, 0.5, 0.15))).normalized(), 0.042, "pa_eye", cornea_m="cornea", pupil=(0.2, 0.2)))
        ap = [V((sx * 0.05, 0.6, 0.5)), V((sx * 0.1, 0.68, 0.6)), V((sx * 0.2, 0.74, 0.68)), V((sx * 0.34, 0.74, 0.72)), V((sx * 0.46, 0.66, 0.7))]
        hd.append(ringed(f"ant{sx}", ap, lambda t: 0.006 * (1 - 0.8 * t) + 0.0011, "pa_leg", rings=34, groove=0.18, seg=6, samples=110))
        hd.append(kit.sphere(f"antb{sx}", 0.016, loc=tuple(ap[0]), m="pa_leg", segs=10, rings=6))
    for k in range(26):   # the mouth fringe
        x = -0.07 + 0.14 * k / 25
        b = V((x, 0.6 + 0.03 * math.cos(x / 0.07 * PI / 2), 0.37))
        L = rng.uniform(0.04, 0.07)
        hd.append(tube(f"br{k}", [b, b + V((x * 0.2, 0.012, -L * 0.6)), b + V((x * 0.3, 0.02, -L))], [0.0028, 0.0018, 0.0006], "pa_leg", seg=4))
    parts.append(Part(kit.merge(hd, "headdet"), bone="head"))
    # six high-kneed walking legs, every segment sheathed in a pointed iridescent plate, dark pointed tips
    for sx, s in ((-1, "L"), (1, "R")):
        for k, (y, dy) in enumerate(((0.2, 0.16), (-0.08, 0.0), (-0.34, -0.17))):
            pts = [V((sx * 0.24, y, 0.44)), V((sx * 0.52, y + dy * 0.6, 0.58)), V((sx * 0.74, y + dy * 1.3, 0.24)), V((sx * 0.8, y + dy * 1.5, 0.0))]
            ch = sk.chain(f"leg{s}{k}", [tuple(p) for p in pts], "body")
            ts = TubeSurf(pts, lambda t: 0.085 * (1 - 0.6 * t) + 0.014 * math.exp(-((t - 0.33) / 0.05) ** 2), ref=(0, 0, 1), squash=0.85)
            parts.append(Part(ts.mesh(f"lg{s}{k}", 44, 14, ("pa_leg",)), bones=ch))
            pl = bands(f"lb{s}{k}", ts, 0.03, 0.97, 6, 0.0, 1.55, "pa_plate", rng, lift=0.02, thick=0.007, keel=0.007, tip=1.4)
            pl += bands(f"li{s}{k}", ts, 0.05, 0.9, 5, PI, 0.9, "pa_leg", rng, lift=0.006, thick=0.004, keel=0.0, tip=0.6)
            for i, b in enumerate(pl[:6]):
                parts.append(Part(b, bone=ch[min(2, int(3 * (i + 0.5) / 6))]))
            for i, b in enumerate(pl[6:]):
                parts.append(Part(b, bone=ch[min(2, int(3 * (i + 0.5) / 5))]))
            for j in (1, 2):
                parts.append(Part(kit.sphere(f"kn{s}{k}{j}", 0.05 - 0.012 * j, loc=tuple(pts[j]), m="pa_leg", segs=12, rings=8), bones=[ch[j - 1], ch[j]]))
            parts.append(Part(fang(f"tip{s}{k}", pts[-1] + V((0, 0, 0.08)), V((sx * 0.1, 0, -1)), V((sx, 0, 0)), 0.09, 0.024, curve=0.12, m="claw_black", seg=8), bone=ch[-1]))
    # two fine manipulators under the face, jointed, with three long clawed fingers
    for sx, s in ((-1, "L"), (1, "R")):
        pts = [V((sx * 0.08, 0.55, 0.38)), V((sx * 0.2, 0.68, 0.44)), V((sx * 0.27, 0.82, 0.32)), V((sx * 0.25, 0.92, 0.17)), V((sx * 0.21, 0.97, 0.1))]
        ch = sk.chain(f"man{s}", [tuple(p) for p in pts], "head")
        for i in range(4):
            ts = TubeSurf([pts[i], pts[i].lerp(pts[i + 1], 0.5), pts[i + 1]], lambda t, r0=0.03 - 0.005 * i: r0 * (0.82 + 0.25 * math.sin(PI * t)), ref=(0, 0, 1))
            seg = [ts.mesh(f"ms{s}{i}", 16, 12, ("pa_leg",))]
            seg += bands(f"mb{s}{i}", ts, 0.12, 0.88, 2, 0.0, 1.4, "pa_plate", rng, lift=0.006, thick=0.003, tip=1.0, K=14)
            seg.append(kit.sphere(f"mj{s}{i}", 0.02 - 0.003 * i, loc=tuple(pts[i + 1]), m="pa_leg", segs=10, rings=6))
            parts.append(Part(kit.merge(seg, f"mseg{s}{i}"), bone=ch[i]))
        hand = pts[-1]
        dg = []
        for f in range(3):
            a = (f - 1) * 0.55
            d = V((math.sin(a) * 0.8 - sx * 0.15, 0.55, -0.45)).normalized()
            fp = [hand, hand + d * 0.05, hand + d * 0.1 + V((0, 0.02, 0.0)), hand + d * 0.14 + V((0, 0.035, -0.025))]
            dg.append(ringed(f"dg{s}{f}", fp, lambda t: 0.0075 * (1 - 0.55 * t), "pa_leg", rings=3, groove=0.32, seg=8, samples=24))
            dg.append(fang(f"dgc{s}{f}", fp[-1], fp[-1] - fp[-2], V((0, 0, -1)), 0.035, 0.004, curve=0.55, m="claw_black", seg=5, n=5))
        parts.append(Part(kit.merge(dg, f"hand{s}"), bone=ch[-1]))
    body = assemble("prism_body", sk, parts)
    arm = finish_creature(root, sk, body, os.path.join(kit.out_dir(), "mars_prism.glb"), props={"creature": "prism", "span": 1.8}, ao=0.25, paint=2048,
                          juvenile=([("leg", "thin", 0.8), ("man", "thin", 0.8), ("head", "grow", 1.3)], ("pa_eye", "cornea")))
    return root, arm


def prismnest():
    """the nest: a mound of stacked stone slabs, roofed with iridescent shards, an entrance, eggs on fibrous bedding"""
    kit.reset()
    root = empty("PrismNest")
    rng = random.Random(9151)
    parts = []
    slabs = []
    R, Hn = 0.75, 0.75
    for ring in range(6):
        z = ring * 0.11
        rr = R * (1 - 0.035 * ring)
        n = 15 - ring // 2
        for k in range(n):
            a = TAU * (k + 0.5 * (ring % 2)) / n
            if abs(math.atan2(math.sin(a - PI / 2), math.cos(a - PI / 2))) < 0.45 and ring < 3:
                continue  # the doorway
            w = TAU * rr / n * 0.95
            s = kit.box(f"s{ring}_{k}", (w * rng.uniform(0.8, 1.05), rng.uniform(0.18, 0.26), rng.uniform(0.05, 0.09)), loc=(math.cos(a) * rr, math.sin(a) * rr, z + 0.045), m="pa_stone", segs=3)
            s.rotation_euler = (rng.uniform(-0.08, 0.08), rng.uniform(-0.08, 0.08), a + PI / 2 + rng.uniform(-0.1, 0.1))
            kit.bake(s)
            for v in s.data.vertices:
                v.co *= 1 + 0.12 * noise.noise(v.co * 7 + V((ring, k, 0))) + 0.05 * noise.noise(v.co * 23 + V((k, ring, 3)))
            slabs.append(s)
    parts.append(kit.merge(slabs, "slabs"))
    # roof: overlapping iridescent shards laid over the dome
    dome = Surf([(-R * 0.95, 0.08, 0.06, 0.02, 0.6, 2.0), (-R * 0.6, R * 0.78, 0.3, 0.02, 0.56, 2.4), (0.0, R * 0.95, 0.38, 0.02, 0.55, 2.6), (R * 0.6, R * 0.78, 0.3, 0.02, 0.56, 2.4), (R * 0.95, 0.08, 0.06, 0.02, 0.6, 2.0)])
    shards = []
    for r in range(6):
        for c in range(9):
            tc = 0.1 + 0.8 * (r + 0.5) / 6
            ac = 0.08 * PI + 0.84 * PI * (c + 0.5) / 9
            shards.append(plate(f"sh{r}_{c}", dome.P, dome.N, tc, ac + rng.uniform(-0.05, 0.05), 0.09, 0.14, "pa_plate", rng, lift=0.03, thick=0.008, dome=0.2, jag=0.3,
                                sides=rng.choice((4, 5, 6)), sides_rot=rng.random(), K=14, rings=2, inset=0.02))
    parts.append(kit.merge(shards, "roof"))
    # bedding and eggs inside
    bed = []
    for k in range(80):
        a = rng.uniform(0, TAU)
        r = rng.uniform(0, R * 0.7)
        p = V((math.cos(a) * r, math.sin(a) * r, 0.02))
        d = V((rng.uniform(-1, 1), rng.uniform(-1, 1), 0.1)).normalized()
        bed.append(tube(f"f{k}", [p, p + d * 0.08, p + d * 0.16 + V((0, 0, 0.01))], [0.004, 0.003, 0.002], "pa_fibre", seg=3))
    parts.append(kit.merge(bed, "bedding"))
    eggs = []
    for k in range(7):
        a = TAU * k / 7
        r = 0.18 if k else 0.0
        eggs.append(kit.sphere(f"egg{k}", 0.075, loc=(math.cos(a) * r, math.sin(a) * r + 0.05, 0.08), m="pa_egg", segs=16, rings=10, scale=(1, 1, 1.15)))
    parts.append(kit.merge(eggs, "eggs"))
    body = kit.merge(parts, "nest_body")
    export_static(root, body, os.path.join(kit.out_dir(), "mars_prism_nest.glb"), {"creature": "prismnest"}, size=1024, ao=0.3)
    return root, None


# ================================================================================================ 911 Ghost of Valles
def ghost_edge(u, sx):
    """the wing outline, u 0 (leading root) → 0.55 (tip) → 1 (trailing root)"""
    if u <= 0.55:
        s = u / 0.55
        x = 0.1 + 1.32 * s
        y = 0.4 + 0.17 * math.sin(PI * s * 0.85) - 0.82 * s ** 2.3
        z = 0.05 * math.sin(PI * s) + 0.24 * s ** 5
    else:
        s = (u - 0.55) / 0.45
        x = 1.42 - 1.32 * s ** 0.75
        y = -0.42 - 0.24 * math.sin(PI * s ** 0.8) - 0.06 * s
        z = 0.24 * (1 - s) ** 5
    return V((sx * x, y, z))


def ghost():
    """2.3 m span; swimming, origin at the body centre (ref 911)"""
    kit.reset()
    root = empty("GhostOfValles")
    rng = random.Random(911)
    sk = Skeleton()
    sk.add("body", (0, -0.3, 0), (0, 0.3, 0))
    sk.add("head", (0, 0.3, 0), (0, 0.62, -0.02), "body")
    sk.add("jaw", (0, 0.44, -0.06), (0, 0.6, -0.08), "head")
    tail = sk.chain("tail", [(0, -0.3, 0.0), (0, -0.6, 0.01), (0, -0.95, 0.02), (0, -1.3, 0.03), (0, -1.7, 0.04)], "body")
    for sx, s in ((-1, "L"), (1, "R")):
        sk.add(f"wing{s}1", (sx * 0.12, 0.0, 0), (sx * 0.6, 0.05, 0.02), "body")
        sk.add(f"wing{s}2", (sx * 0.6, 0.05, 0.02), (sx * 1.15, -0.3, 0.2), f"wing{s}1")
    parts = []
    # the body: a translucent capsule widening into a rounded head; a purple visceral core inside
    body = Surf([(-0.48, 0.015, 0.015, 0.015, 0.0, 2.0), (-0.38, 0.05, 0.035, 0.032, 0.0, 2.1), (-0.15, 0.085, 0.055, 0.048, 0.0, 2.2),
                 (0.15, 0.1, 0.062, 0.052, 0.0, 2.3), (0.38, 0.11, 0.064, 0.052, -0.005, 2.3), (0.52, 0.1, 0.058, 0.046, -0.01, 2.2),
                 (0.61, 0.07, 0.046, 0.038, -0.015, 2.1), (0.66, 0.025, 0.025, 0.022, -0.02, 2.0)])

    def bdisp(t, a):
        p = body.P(t, a)
        d = 0.003 * noise.noise(p * 25.0)
        d += 0.006 * math.exp(-((a - PI / 2) / 0.12) ** 2) * sstep(0.15, 0.5, t)   # a low dorsal keel
        d -= 0.008 * math.exp(-((p.y - 0.47) / 0.03) ** 2 - ((abs(p.x) - 0.09) / 0.03) ** 2) * (math.sin(a) > 0)   # eye sockets
        return d
    parts.append(Part(body.mesh("body", 70, 36, ("gv_body",), disp=bdisp), bones=["body", "head"] + tail[:1]))
    core = Surf([(-0.32, 0.03, 0.02, 0.02, 0.0, 2.0), (-0.1, 0.07, 0.04, 0.035, 0.0, 2.2), (0.15, 0.08, 0.045, 0.04, 0.0, 2.2),
                 (0.36, 0.06, 0.035, 0.03, -0.005, 2.1), (0.46, 0.025, 0.02, 0.02, -0.01, 2.0)])
    parts.append(Part(core.mesh("core", 30, 18, ("gv_core",)), bones=["body", "head"]))
    gut = [kit.sphere(f"org{k}", 1.0, loc=(rng.uniform(-0.03, 0.03), -0.2 + 0.11 * k, -0.01), m="gv_core", segs=12, rings=8,
                      scale=(0.03 + 0.01 * rng.random(), 0.045, 0.025)) for k in range(5)]
    parts.append(Part(kit.merge(gut, "organs"), bone="body"))
    # head: two large eyes and a cluster of small ones in front, a mouth of long needle fangs hanging down, sensory filaments
    hd = []
    for sx in (-1, 1):
        hd.append(eye(f"eA{sx}", V((sx * 0.062, 0.5, 0.036)), V((sx * 0.5, 0.6, 0.6)), 0.024, "gv_eye", cornea_m="cornea", pupil=(0.6, 0.6)))
        for k, (x, y, r) in enumerate(((0.036, 0.57, 0.01), (0.08, 0.45, 0.009), (0.022, 0.61, 0.008), (0.085, 0.53, 0.007))):
            hd.append(eye(f"eB{sx}{k}", V((sx * x, y, 0.04 - 0.008 * k)), V((sx * 0.4, 0.7, 0.6)), r, "gv_eye", cornea_m="cornea", pupil=(0.6, 0.6)))
        for k in range(2):   # filaments rising from the crown and arcing back
            b = V((sx * (0.03 + 0.03 * k), 0.4 - 0.05 * k, 0.07))
            L = 0.5 + 0.15 * k
            pts = [b + V((sx * 0.06 * u, -L * u, L * 0.45 * math.sin(PI * u * 0.8) + 0.04 * math.sin(u * 9))) for u in [i / 10 for i in range(11)]]
            hd.append(tube(f"fil{sx}{k}", pts, [0.004 * (1 - 0.85 * i / 10) + 0.0005 for i in range(11)], "gv_vein", seg=5))
    parts.append(Part(kit.merge(hd, "headdet"), bone="head"))
    mf = mouth_curve(0.5, 0.645, 0.055, -0.04, -0.032, sharp=0.6)
    teeth = []
    for i in range(12):
        sv = -0.92 + 1.84 * i / 11 + rng.uniform(-0.03, 0.03)
        p = mf(sv)
        L = (0.06 + 0.1 * math.cos(sv * PI / 2) ** 2) * rng.uniform(0.75, 1.15)
        teeth.append(fang(f"t{i}", p, V((math.sin(sv * PI / 2) * 0.3, 0.25, -1)), V((0, 1, 0)), L, 0.0055, curve=0.3, m="tooth", seg=5, n=7))
    teeth.append(tube("lip", [mf(-1 + 2 * k / 16) for k in range(17)], [0.008] * 17, "gv_body", seg=6))
    parts.append(Part(kit.merge(teeth, "teeth"), bone="jaw"))
    # the wings: veins radiate from the body to the outline; scalloped, fluttering trailing edge; a row of receptor pores
    for sx, s in ((-1, "L"), (1, "R")):
        n = 25
        us = [k / (n - 1) for k in range(n)]
        edge = [ghost_edge(u, sx) for u in us]
        base = [V((sx * (0.075 + 0.02 * math.sin(PI * u)), 0.4 - 0.86 * u, 0.0)) for u in us]
        w = fin(f"wing{s}", base, edge, "gv_membrane", nv=14, rays=16, corr=0.006, scallop=0.05, ruffle=0.03, ruffle_f=6, thick=0.003,
                rays_m="gv_vein", ray_r=0.0032, ray_taper=0.2, up=(0, 0, 1))
        parts.append(Part(w, bones=["body", f"wing{s}1", f"wing{s}2"]))
        dots = []
        for k in range(18):
            u = 0.03 + 0.5 * k / 17
            b = V((sx * (0.075 + 0.02 * math.sin(PI * u)), 0.4 - 0.86 * u, 0.0))
            p = b.lerp(ghost_edge(u, sx), 0.84) + V((0, 0, 0.004))
            dots.append(kit.sphere(f"d{s}{k}", 0.0085 - 0.003 * (k / 17), loc=tuple(p), m="gv_eye", segs=8, rings=4, scale=(1, 1, 0.35)))
        parts.append(Part(kit.merge(dots, f"dots{s}"), bones=[f"wing{s}1", f"wing{s}2"]))
    # the whip tail, ringed, with two trailing sensory tips
    tp = [V(sk.seg(t)[0]) for t in tail] + [V(sk.seg(tail[-1])[1])]
    tl = [ringed("tail", tp, lambda t: 0.02 * (1 - t) + 0.002, "gv_body", rings=34, groove=0.1, seg=6, samples=90)]
    for sx in (-1, 1):
        b = tp[1]
        pts = [b + V((sx * 0.05 * u, -0.9 * u, -0.06 * math.sin(PI * u))) for u in [i / 8 for i in range(9)]]
        tl.append(tube(f"tt{sx}", pts, [0.003 * (1 - 0.8 * i / 8) + 0.0005 for i in range(9)], "gv_vein", seg=4))
    parts.append(Part(kit.merge(tl, "tailp"), bones=tail + ["body"]))
    body_o = assemble("ghost_body", sk, parts)
    arm = finish_creature(root, sk, body_o, os.path.join(kit.out_dir(), "mars_ghost.glb"), props={"creature": "ghost", "span": 2.85}, ao=0.15, paint=2048,
                          juvenile=([("head", "grow", 1.25), ("wing", "squash", 0.82)], ("gv_eye", "cornea")))
    return root, arm


# ================================================================================================ 910 Basalt Mimic
def bmimic():
    """2.3 m; ground z = 0; a flat basalt-skinned ambusher lying low between six long-clawed limbs (ref 910)"""
    kit.reset()
    root = empty("BasaltMimic")
    rng = random.Random(910)
    sk = Skeleton()
    sp = sk.chain("sp", [(0, -0.75, 0.27), (0, -0.3, 0.3), (0, 0.15, 0.3), (0, 0.5, 0.27)], None)
    sk.add("head", (0, 0.5, 0.27), (0, 1.1, 0.2), sp[-1])
    sk.add("jaw", (0, 0.6, 0.17), (0, 1.08, 0.15), "head")
    tail = sk.chain("tail", [(0, -0.75, 0.27), (0, -1.05, 0.22), (0, -1.38, 0.15)], sp[0])
    parts = []
    body = Surf([(-1.3, 0.03, 0.03, 0.03, 0.18, 2.0), (-1.0, 0.13, 0.09, 0.08, 0.22, 2.2), (-0.72, 0.36, 0.15, 0.11, 0.27, 2.6),
                 (-0.2, 0.47, 0.18, 0.12, 0.29, 2.9), (0.25, 0.45, 0.17, 0.12, 0.29, 2.9), (0.55, 0.36, 0.14, 0.1, 0.27, 2.7)])

    def bdisp(t, a):
        sn = math.sin(a)
        p = body.P(t, a)
        d = 0.012 * noise.noise(p * 3.0)
        if sn > -0.35:   # the dorsal osteoderm mosaic: raised irregular cells with deep seams, coarse on top, finer on the flanks
            k = sstep(-0.35, 0.25, sn)
            d += k * (0.048 * cellular(p, 4.6, 0.07) + 0.016 * cellular(p, 12.0, 0.1) + 0.006 * cellular(p, 30.0, 0.15))
        else:
            d += 0.006 * cellular(p, 16.0, 0.1)
        return d
    parts.append(Part(body.mesh("body", 136, 88, ("bm_skin", "bm_belly"), mat_fn=lambda t, a: 1 if math.sin(a) < -0.6 else 0, disp=bdisp), bones=sp + tail[:1]))
    # a few big rock-like shields along the spine and shoulders, half sunk in the mosaic
    shields = []
    for r in range(7):
        tc = 0.22 + 0.7 * r / 6
        for c, ac in enumerate((PI / 2 - 0.62, PI / 2 - 0.22, PI / 2 + 0.22, PI / 2 + 0.62)):
            if (c in (0, 3)) and r % 2:
                continue
            shields.append(plate(f"sh{r}_{c}", body.P, body.N, tc + rng.uniform(-0.02, 0.02), ac + rng.uniform(-0.06, 0.06), 0.045, 0.17, "bm_shield", rng, rear=-1,
                                 lift=0.014, thick=0.04, dome=1.0, jag=0.45, sides=rng.choice((5, 6, 7)), sides_rot=rng.random(), K=20, rings=4, inset=0.04))
    parts.append(Part(kit.merge(shields, "shields"), bones=sp))
    # head: a broad flat wedge; two brow shields meet the snout plate along a V seam; heavy brows over low lidded eyes
    head = Surf([(0.42, 0.28, 0.11, 0.07, 0.27, 2.6), (0.6, 0.29, 0.095, 0.05, 0.245, 2.8), (0.8, 0.235, 0.076, 0.04, 0.225, 2.8),
                 (0.95, 0.15, 0.058, 0.032, 0.21, 2.6), (1.04, 0.07, 0.042, 0.026, 0.205, 2.4), (1.08, 0.015, 0.02, 0.018, 0.2, 2.0)])

    def hdisp(t, a):
        sn, cs = math.sin(a), math.cos(a)
        p = head.P(t, a)
        d = 0.006 * noise.noise(p * 6.0)
        top = sstep(0.0, 0.35, sn)
        v = p.y - (0.95 - 1.5 * abs(p.x))
        seam = math.exp(-(v / 0.016) ** 2) + math.exp(-(p.x / 0.012) ** 2) * (1.0 if v < 0 else 0.0) * sstep(0.46, 0.6, p.y)
        d += top * (0.026 * cellular(p, 6.5, 0.07) + 0.008 * cellular(p, 18.0, 0.12) - 0.024 * min(1.0, seam))
        for sx in (-1, 1):
            d += 0.038 * math.exp(-(((p.x - sx * 0.17) / 0.055) ** 2 + ((p.y - 0.7) / 0.08) ** 2)) * sstep(-0.1, 0.4, sn)
        d -= 0.012 * math.exp(-((sn + 0.12) / 0.07) ** 2) * sstep(0.3, 0.6, abs(cs)) * sstep(0.56, 0.66, p.y)   # the lip line
        if sn < -0.3:
            d += 0.004 * cellular(p, 20.0, 0.1)
        return d
    parts.append(Part(head.mesh("head", 70, 64, ("bm_skin", "bm_belly"), disp=hdisp, mat_fn=lambda t, a: 1 if math.sin(a) < -0.5 else 0), bone="head"))
    hdet = []
    for sx in (-1, 1):
        a_eye = 0.35 if sx > 0 else PI - 0.35
        c, n = surf_at(head, 0.72, a_eye, -0.014)
        n = (n + V((0, 0.35, 0.12))).normalized()
        r = 0.026
        hdet.append(eye(f"eye{sx}", c, n, r, "bm_eye", cornea_m="cornea", pupil=(0.42, 0.9), slit_axis=(0, 0, 1)))
        hdet.append(kit.sphere(f"lidu{sx}", r * 1.22, loc=tuple(c + V((0, 0, r * 0.62)) + n * (r * 0.05)), m="bm_skin", segs=16, rings=8, scale=(1.1, 1.15, 0.55)))
        hdet.append(kit.sphere(f"lidl{sx}", r * 1.08, loc=tuple(c - V((0, 0, r * 0.78)) + n * (r * 0.02)), m="bm_skin", segs=14, rings=6, scale=(1.05, 1.1, 0.42)))
        pn, _ = surf_at(head, 1.065, PI / 2 - sx * 0.55, -0.003)
        hdet.append(kit.sphere(f"nos{sx}", 0.009, loc=tuple(pn), m="mouth_red", segs=8, rings=5, scale=(1, 1.5, 0.5)))
        for k in range(9):   # small conical teeth just showing under the lip
            y = 0.66 + 0.045 * k
            pp, nn = surf_at(head, y, -0.14 if sx > 0 else PI + 0.14, -0.006)
            hdet.append(fang(f"tt{sx}{k}", pp - V((sx * 0.006, 0, 0)), V((sx * 0.1, 0.1, -1)), V((0, 1, 0)), 0.011 + 0.003 * math.sin(k * 2.1), 0.0035, curve=0.2, m="tooth", seg=4, n=4))
    parts.append(Part(kit.merge(hdet, "headdet"), bone="head"))
    jaw = Surf([(0.58, 0.27, 0.02, 0.05, 0.2, 2.6), (0.8, 0.22, 0.02, 0.045, 0.19, 2.7), (0.95, 0.14, 0.018, 0.035, 0.18, 2.5), (1.04, 0.06, 0.015, 0.025, 0.18, 2.2)])
    parts.append(Part(jaw.mesh("jaw", 30, 32, ("bm_skin", "bm_belly"), mat_fn=lambda t, a: 1 if math.sin(a) < -0.4 else 0,
                               disp=lambda t, a: 0.004 * cellular(jaw.P(t, a), 20.0, 0.1)), bone="jaw"))
    # six slender limbs with high elbows, ringed with scales, long spread digits and long hooked glossy claws
    for sx, s in ((-1, "L"), (1, "R")):
        for k, y in enumerate((0.32, -0.12, -0.55)):
            fwd = (0.2, 0.05, -0.1)[k]
            pts = [V((sx * 0.3, y, 0.24)), V((sx * 0.57, y + fwd * 0.4, 0.4)), V((sx * 0.77, y + fwd, 0.1)), V((sx * 0.82, y + fwd * 1.3 + 0.06, 0.035))]
            ch = sk.chain(f"limb{s}{k}", [tuple(q) for q in pts], sp[2 - k])
            r0 = 0.1 if k == 0 else 0.09
            ts = TubeSurf(pts, lambda t, r0=r0: r0 * (1 - 0.58 * t) + 0.022 * math.exp(-((t - 0.22) / 0.12) ** 2), ref=(0, 0, 1))
            parts.append(Part(ts.mesh(f"lm{s}{k}", 50, 26, ("bm_skin",), disp=lambda t, a, ts=ts: 0.007 * scale_grid(t, a, 24, 12) + 0.005 * cellular(ts.P(t, a), 18.0, 0.1)),
                              bones=ch + [sp[2 - k]]))
            kn = []
            for q in range(7):   # a few coarse tubercles on the outer arm
                tq = rng.uniform(0.08, 0.7)
                aq = rng.uniform(-0.9, 0.9)
                kn.append(kit.sphere(f"kn{s}{k}{q}", rng.uniform(0.01, 0.018), loc=tuple(ts.P(tq, aq)), m="bm_shield", segs=8, rings=5))
            parts.append(Part(kit.merge(kn, f"knobs{s}{k}"), bones=ch))
            foot = pts[-1]
            out = V((sx * 0.55, 1.0, 0)).normalized()
            ft = [kit.sphere(f"pad{s}{k}", 0.05, loc=tuple(foot + out * 0.02), m="bm_skin", segs=14, rings=8, scale=(1.25, 1.3, 0.55))]
            for c in range(4):
                a = (c - 1.5) * 0.42
                d = (out * math.cos(a) + V((-out.y, out.x, 0)) * math.sin(a)).normalized()
                L = 0.11 * (1 - 0.18 * abs(c - 1.5))
                b0 = foot + d * 0.03 + V((0, 0, 0.006))
                dp = [b0, b0 + d * (L * 0.5) + V((0, 0, 0.022)), b0 + d * L + V((0, 0, 0.012))]
                ft.append(ringed(f"dg{s}{k}{c}", dp, lambda t: 0.021 * (1 - 0.35 * t), "bm_skin", rings=3, groove=0.22, seg=10, samples=24))
                ft.append(fang(f"cl{s}{k}{c}", dp[-1], d + V((0, 0, 0.3)), V((0, 0, -1)), 0.15 + 0.03 * (c in (1, 2)), 0.019, curve=0.65, m="claw_black", seg=8, n=10))
            parts.append(Part(kit.merge(ft, f"foot{s}{k}"), bone=ch[-1]))
    tp = [V(sk.seg(t)[0]) for t in tail] + [V(sk.seg(tail[-1])[1])]
    tts = TubeSurf(tp, lambda t: 0.13 * (1 - t) ** 0.8 + 0.015, ref=(0, 0, 1), squash=0.7)
    parts.append(Part(tts.mesh("tail", 50, 36, ("bm_skin",), disp=lambda t, a: 0.016 * cellular(tts.P(t, a), 7.0, 0.1) * sstep(-0.6, 0.0, math.cos(a))), bones=tail + [sp[0]]))
    body_o = assemble("bmimic_body", sk, parts)
    arm = finish_creature(root, sk, body_o, os.path.join(kit.out_dir(), "mars_bmimic.glb"), props={"creature": "bmimic", "length": 2.4}, ao=0.35, paint=2048,
                          juvenile=([("head", "grow", 1.25), ("limb", "thin", 0.8)], ("bm_eye", "cornea")))
    return root, arm


# ================================================================================================ 914 Red Dune Hermit
def hermit():
    """0.46 m long; ground z = 0 (ref 914). A high-domed shell of a few thick banded plates, dust-caked; six stout cone legs."""
    kit.reset()
    root = empty("RedDuneHermit")
    rng = random.Random(914)
    sk = Skeleton()
    sk.add("body", (0, -0.16, 0.12), (0, 0.16, 0.12))
    sk.add("head", (0, 0.16, 0.09), (0, 0.25, 0.07), "body")
    parts = []
    core = Surf([(-0.2, 0.05, 0.05, 0.04, 0.1, 2.0), (-0.12, 0.13, 0.1, 0.05, 0.11, 2.4), (0.08, 0.13, 0.1, 0.05, 0.11, 2.4), (0.2, 0.05, 0.05, 0.04, 0.1, 2.0)])
    parts.append(Part(core.mesh("core", 24, 20, ("dh_soft",)), bone="body"))
    # the shell dome; thick plates: a front shield over the head, three transverse bands, a rear plate, and flank plates down over the legs
    dome = Surf([(-0.235, 0.03, 0.03, 0.01, 0.07, 2.0), (-0.2, 0.15, 0.13, 0.01, 0.07, 2.4), (-0.1, 0.2, 0.2, 0.01, 0.065, 2.5),
                 (0.03, 0.205, 0.215, 0.01, 0.065, 2.5), (0.14, 0.18, 0.17, 0.01, 0.065, 2.4), (0.21, 0.12, 0.1, 0.01, 0.065, 2.2), (0.24, 0.03, 0.03, 0.01, 0.065, 2.0)])

    def ddisp(t, a):
        p = dome.P(t, a)
        return 0.003 * noise.noise(p * 30.0) + 0.0025 * cellular(p, 40.0, 0.15)
    sh = [dome.mesh("domebase", 40, 40, ("dh_shell",), disp=ddisp)]
    bands_t = [(0.88, 0.1, 0.3), (0.68, 0.11, 0.42), (0.47, 0.11, 0.44), (0.27, 0.1, 0.42), (0.1, 0.09, 0.32)]
    for i, (tc, dt, da) in enumerate(bands_t):
        sh.append(plate(f"band{i}", dome.P, dome.N, tc, PI / 2, dt, da * PI, "dh_shell", rng, rear=-1, lift=0.022, thick=0.018, dome=0.3,
                        jag=0.05, keel=0.0, K=40, rings=6, inset=0.004))
    for sx in (-1, 1):
        for k in range(4):
            tc = 0.18 + 0.64 * (k + 0.5) / 4
            ac = 0.13 * PI if sx > 0 else 0.87 * PI
            sh.append(plate(f"fl{sx}{k}", dome.P, dome.N, tc, ac, 0.085, 0.13 * PI, "dh_shell", rng, rear=-1, lift=0.014, thick=0.016, dome=0.3,
                            jag=0.08, K=28, rings=4, inset=0.003))
    parts.append(Part(kit.merge(sh, "shell"), bone="body"))
    # the wrinkled head peering out under the front shield
    head = Surf([(0.15, 0.05, 0.04, 0.035, 0.085, 2.0), (0.2, 0.055, 0.042, 0.035, 0.08, 2.1), (0.24, 0.04, 0.032, 0.028, 0.075, 2.0), (0.265, 0.012, 0.012, 0.012, 0.073, 2.0)])
    parts.append(Part(head.mesh("head", 28, 24, ("dh_soft",), disp=lambda t, a: 0.0025 * max(0.0, math.sin(head.P(t, a).y * 260)) ** 2 + 0.001 * noise.noise(head.P(t, a) * 120)), bone="head"))
    hd = []
    for sx in (-1, 1):
        c, n = surf_at(head, 0.235, PI / 2 - sx * 0.8, -0.003)
        hd.append(eye(f"eye{sx}", c, n + V((0, 0.4, 0)), 0.0065, "claw_black", cornea_m="cornea", pupil=(0.3, 0.3)))
        hd.append(fang(f"mp{sx}", V((sx * 0.01, 0.255, 0.062)), V((sx * 0.25, 0.6, -1)), V((-sx, 0, 0)), 0.018, 0.004, curve=0.35, m="claw_black", seg=4))
    parts.append(Part(kit.merge(hd, "headdet"), bone="head"))
    # six stout cone legs of stacked scale rings
    for sx, s in ((-1, "L"), (1, "R")):
        for k, (y, dy) in enumerate(((0.1, 0.04), (0.0, 0.0), (-0.1, -0.04))):
            pts = [V((sx * 0.1, y, 0.09)), V((sx * 0.17, y + dy * 0.5, 0.075)), V((sx * 0.215, y + dy, 0.0))]
            ch = sk.chain(f"leg{s}{k}", [tuple(q) for q in pts], "body")
            legp = []
            path = [smooth_lerp(pts, 2 * i / 30) for i in range(31)]
            for ring in range(6):   # overlapping conical scale rings, each flaring at its lower edge
                i0, i1 = ring * 5, ring * 5 + 7
                seg_pts = path[i0:min(i1, 31)]
                r_top = 0.03 * (1 - 0.13 * ring)
                rr = [r_top * (0.78 + 0.32 * (j / max(1, len(seg_pts) - 1)) ** 1.6) for j in range(len(seg_pts))]
                legp.append(tube(f"lr{s}{k}{ring}", seg_pts, rr, "dh_leg", seg=12, cap_tip=False))
            legp.append(fang(f"lt{s}{k}", pts[-1] + V((0, 0, 0.022)), V((sx * 0.15, 0.05, -1)), V((sx, 0, 0)), 0.026, 0.014, curve=0.15, m="dh_leg", seg=10))
            parts.append(Part(kit.merge(legp, f"leg{s}{k}"), bones=ch))
    body = assemble("hermit_body", sk, parts)
    arm = finish_creature(root, sk, body, os.path.join(kit.out_dir(), "mars_hermit.glb"), props={"creature": "hermit", "length": 0.46}, ao=0.06, paint=1024)
    return root, arm


# ================================================================================================ 907 Thermal Rift Serpent
def serpent():
    """3.6 m; ground z = 0 (it lies low in its channel)"""
    kit.reset()
    root = empty("ThermalRiftSerpent")
    rng = random.Random(907)
    sk = Skeleton()
    spine_pts = [(0, 0.9, 0.22), (0, 0.45, 0.23), (0, 0.0, 0.23), (0, -0.45, 0.22), (0, -0.9, 0.2), (0, -1.35, 0.18), (0, -1.8, 0.15), (0, -2.25, 0.12), (0, -2.7, 0.1)]
    sp = sk.chain("sp", spine_pts, None)
    sk.add("head", spine_pts[0], (0, 1.45, 0.2), sp[0])
    sk.add("jaw", (0, 1.0, 0.14), (0, 1.45, 0.13), "head")
    parts = []
    body = Surf([(-2.75, 0.01, 0.02, 0.02, 0.1, 2.0), (-2.3, 0.04, 0.07, 0.05, 0.12, 2.0), (-1.6, 0.1, 0.12, 0.09, 0.15, 2.2),
                 (-0.9, 0.17, 0.14, 0.11, 0.2, 2.3), (-0.2, 0.2, 0.15, 0.12, 0.22, 2.4), (0.45, 0.19, 0.14, 0.11, 0.23, 2.4),
                 (0.85, 0.15, 0.11, 0.09, 0.22, 2.4), (1.0, 0.14, 0.09, 0.07, 0.21, 2.6)])

    def bdisp(t, a):
        sn = math.sin(a)
        y = body.sec(t)[0]
        d = 0.012 * math.exp(-((a - PI / 2) / 0.1) ** 2) * sstep(0.05, 0.3, t)  # dorsal ridge
        d += 0.012 * max(0.0, noise.noise(V((y * 4, math.cos(a) * 2, 7.0)))) * (sn > 0.4)  # mineral-encrusted dorsal patches
        d += 0.004 * max(0.0, math.cos(y * 22)) ** 6 * (sn < -0.3)  # belly folds
        # the tail flattens laterally into a paddle
        return d
    parts.append(Part(body.mesh("body", 140, 36, ("rs_hide", "rs_belly"), disp=bdisp, mat_fn=lambda t, a: 1 if math.sin(a) < -0.55 else 0), bones=sp + ["head"]))
    # a striated swimming crest along the whole top of the tail, and a lower keel under its last third
    crest_b, crest_e = [], []
    for k in range(14):
        y = -0.85 - 1.85 * k / 13
        p, n = surf_at(body, y, PI / 2, -0.012)
        h = 0.025 + 0.06 * math.sin(PI * min(1.0, 0.15 + 0.85 * k / 13)) ** 0.7
        crest_b.append(p)
        crest_e.append(p + V((0, -0.02, h)))
    parts.append(Part(fin("crest", crest_b, crest_e, "rs_hide", nv=5, rays=26, corr=0.003, scallop=0.12, ruffle=0.004, ruffle_f=5, thick=0.007,
                          rays_m="rs_hide", ray_r=0.0035, ray_taper=0.4), bones=sp[3:]))
    keel_b, keel_e = [], []
    for k in range(8):
        y = -1.75 - 0.95 * k / 7
        p, n = surf_at(body, y, -PI / 2, -0.01)
        keel_b.append(p)
        keel_e.append(p + V((0, -0.015, -(0.02 + 0.035 * math.sin(PI * (0.2 + 0.8 * k / 7))))))
    parts.append(Part(fin("keel", keel_b, keel_e, "rs_belly", nv=4, rays=12, scallop=0.1, thick=0.006, rays_m="rs_hide", ray_r=0.003), bones=sp[5:]))
    # head: broad, flat, long snout, small amber eye under a ridge, nostrils at the tip, whiskers by the jaw, small teeth
    head = Surf([(0.9, 0.15, 0.1, 0.07, 0.22, 2.4), (1.1, 0.15, 0.085, 0.05, 0.215, 2.7), (1.3, 0.12, 0.06, 0.04, 0.205, 2.8), (1.43, 0.07, 0.04, 0.03, 0.2, 2.4), (1.48, 0.02, 0.02, 0.015, 0.2, 2.0)])
    parts.append(Part(head.mesh("head", 30, 28, ("rs_hide", "rs_belly"), mat_fn=lambda t, a: 1 if math.sin(a) < -0.4 else 0,
                                disp=lambda t, a: 0.012 * math.exp(-((t - 0.25) / 0.08) ** 2) * math.exp(-((abs(math.cos(a)) - 0.55) / 0.15) ** 2)), bone="head"))
    hd = []
    for sx in (-1, 1):
        p, n = surf_at(head, 1.05, PI / 2 - sx * 0.95, -0.006)
        hd.append(eye(f"eye{sx}", p, n + V((0, 0.3, 0.2)), 0.018, "rs_eye", cornea_m="cornea", pupil=(0.45, 0.9), slit_axis=(0, 0, 1)))
        pn, _ = surf_at(head, 1.45, PI / 2 - sx * 0.55, -0.003)
        hd.append(kit.sphere(f"nos{sx}", 0.008, loc=tuple(pn), m="mouth_red", segs=8, rings=4, scale=(1, 1.5, 0.5)))
        for k in range(4):  # mechanosensory whiskers
            b = V((sx * 0.1, 1.15 + 0.06 * k, 0.17))
            L = rng.uniform(0.16, 0.3)
            wp = [b, b + V((sx * L * 0.4, -L * 0.2, -0.02)), b + V((sx * L * 0.9, -L * 0.45, -0.05))]
            hd.append(tube(f"wh{sx}{k}", [smooth_lerp(wp, 2 * i / 6) for i in range(7)], [0.0016 * (1 - 0.7 * i / 6) + 0.0003 for i in range(7)], "rs_whisker", seg=4))
        for k in range(12):  # small teeth along the upper lip
            y = 1.0 + 0.038 * k
            w = head.sec(surf_t(head, y))[1] if y < 1.46 else 0.02
            hd.append(fang(f"ut{sx}{k}", V((sx * w * 0.92, y, 0.165)), V((0, 0.15, -1)), V((0, 1, 0)), 0.018 + 0.006 * math.sin(k), 0.004, curve=0.2, m="tooth", seg=4, n=4))
    parts.append(Part(kit.merge(hd, "headdet"), bone="head"))
    jaw = Surf([(0.95, 0.13, 0.02, 0.04, 0.15, 2.4), (1.2, 0.12, 0.02, 0.035, 0.145, 2.6), (1.4, 0.06, 0.015, 0.025, 0.14, 2.3)])
    parts.append(Part(jaw.mesh("jaw", 20, 18, ("rs_belly",)), bone="jaw"))
    # four short powerful limbs with long claws
    for sx, s in ((-1, "L"), (1, "R")):
        for k, (y, par) in enumerate(((0.55, sp[0]), (-0.75, sp[3]))):
            pts = [V((sx * 0.16, y, 0.18)), V((sx * 0.38, y + 0.05, 0.2)), V((sx * 0.5, y + 0.12, 0.06)), V((sx * 0.54, y + 0.22, 0.02))]
            ch = sk.chain(f"limb{s}{k}", [tuple(q) for q in pts], par)
            ts = TubeSurf(pts, lambda t: 0.075 * (1 - 0.4 * t) + 0.012 * math.sin(PI * t), ref=(0, 0, 1))
            parts.append(Part(ts.mesh(f"lm{s}{k}", 24, 16, ("rs_hide",), disp=lambda t, a: 0.006 * math.cos(a * 2) * math.sin(PI * t)), bones=ch + [par]))
            ft = [kit.sphere(f"pd{s}{k}", 0.045, loc=tuple(pts[-1] + V((0, 0.02, 0))), m="rs_hide", segs=12, rings=6, scale=(1.3, 1.2, 0.5))]
            for c in range(5):
                a = (c - 2) * 0.32
                d = V((math.sin(a) + sx * 0.15, math.cos(a), 0)).normalized()
                cb = pts[-1] + d * 0.05 + V((0, 0, 0.015))
                ft.append(ringed(f"dg{s}{k}{c}", [cb - d * 0.02, cb + d * 0.05], lambda t: 0.013 * (1 - 0.3 * t), "rs_hide", rings=2, groove=0.2, seg=8, samples=10))
                ft.append(fang(f"cl{s}{k}{c}", cb + d * 0.05, d + V((0, 0, -0.2)), V((0, 0, -1)), 0.075, 0.011, curve=0.45, m="claw_black", seg=5))
            parts.append(Part(kit.merge(ft, f"foot{s}{k}"), bone=ch[-1]))
    body_o = assemble("serpent_body", sk, parts)
    arm = finish_creature(root, sk, body_o, os.path.join(kit.out_dir(), "mars_serpent.glb"), props={"creature": "serpent", "length": 3.6}, ao=0.3, paint=2048,
                          juvenile=([("head", "grow", 1.25), ("jaw", "grow", 1.2), ("limb", "thin", 0.82)], ("rs_eye", "cornea")))
    return root, arm


# ================================================================================================ 908 Subglacial Monarch
def monarch():
    """5.2 m; swimming, origin at the body centre"""
    kit.reset()
    root = empty("SubglacialMonarch")
    rng = random.Random(908)
    sk = Skeleton()
    spine_pts = [(0, 1.4, 0.05), (0, 0.6, 0.0), (0, -0.3, 0.0), (0, -1.2, 0.05), (0, -1.95, 0.1), (0, -2.5, 0.12)]
    sp = sk.chain("sp", spine_pts, None)
    sk.add("head", spine_pts[0], (0, 2.65, -0.05), sp[0])
    sk.add("jaw", (0, 1.65, -0.3), (0, 2.6, -0.42), "head")
    parts = []
    body = Surf([(-2.78, 0.03, 0.06, 0.06, 0.1, 2.0), (-2.45, 0.1, 0.15, 0.14, 0.08, 2.0), (-1.85, 0.25, 0.3, 0.28, 0.05, 2.1),
                 (-1.0, 0.45, 0.47, 0.44, 0.02, 2.2), (-0.1, 0.62, 0.6, 0.56, 0.0, 2.3), (0.8, 0.71, 0.64, 0.58, 0.0, 2.4),
                 (1.5, 0.74, 0.6, 0.46, 0.02, 2.5), (2.0, 0.7, 0.52, 0.28, 0.04, 2.7), (2.4, 0.58, 0.41, 0.2, 0.0, 2.9),
                 (2.66, 0.38, 0.28, 0.16, -0.05, 2.7), (2.78, 0.08, 0.08, 0.06, -0.08, 2.2)])

    def bdisp(t, a):
        sn, cs = math.sin(a), math.cos(a)
        y = body.sec(t)[0]
        d = 0.01 * noise.noise(V((y * 3, cs * 2, sn * 2)))
        # flow/gill channels behind the head
        if 1.3 < y < 1.75 and -0.4 < sn < 0.5:
            d -= 0.03 * max(0.0, math.cos((y - 1.3) / 0.45 * 4 * TAU)) ** 6 * math.sin(PI * (sn + 0.4) / 0.9)
        # old scars: pitted lines across the flank
        d -= 0.012 * max(0.0, noise.noise(V((y * 1.5, cs * 6 + 3, 11.0))) - 0.35) * 3
        # brow over the small eye
        d += 0.04 * math.exp(-((y - 2.2) / 0.12) ** 2) * math.exp(-((abs(cs) - 0.62) / 0.12) ** 2) * (sn > 0)
        return d
    parts.append(Part(body.mesh("body", 120, 56, ("mo_hide", "mo_belly", "mo_gum"), disp=bdisp,
                                mat_fn=lambda t, a: 2 if (t > 0.78 and math.sin(a) < -0.6) else (1 if math.sin(a) < -0.45 else 0)), bones=sp + ["head"]))
    jaw = Surf([(1.6, 0.58, 0.08, 0.26, -0.3, 2.5), (2.1, 0.56, 0.08, 0.26, -0.36, 2.7), (2.45, 0.42, 0.07, 0.2, -0.4, 2.6), (2.62, 0.18, 0.05, 0.1, -0.42, 2.2)])
    parts.append(Part(jaw.mesh("jaw", 36, 28, ("mo_hide", "mo_gum", "mo_belly"), mat_fn=lambda t, a: 1 if math.sin(a) > 0.5 else (2 if math.sin(a) < -0.4 else 0)), bone="jaw"))
    parts.append(Part(kit.sphere("throat", 1.0, loc=(0, 1.75, -0.2), m="mouth_red", segs=16, rings=8, scale=(0.5, 0.15, 0.2)), bone="head"))
    # teeth: a row of sharp triangular teeth in each jaw, uneven
    up_m = mouth_curve(1.75, 2.66, 0.6, -0.18, -0.2, sharp=0.5)
    lo_m = mouth_curve(1.75, 2.6, 0.55, -0.3, -0.34, sharp=0.5)
    for nm, mf, bone, down in (("u", up_m, "head", V((0, 0, -1))), ("l", lo_m, "jaw", V((0, 0, 1)))):
        gp = [mf(-1 + 2 * i / 24) for i in range(25)]
        parts.append(Part(tube(f"gum{nm}", gp, [0.026] * 25, "mo_gum", seg=6), bone=bone))
        tt = []
        n = 30 if nm == "u" else 26
        for i in range(n):
            sv = -0.95 + 1.9 * (i + rng.uniform(-0.25, 0.25)) / (n - 1)
            p = mf(sv)
            L = (0.07 + 0.05 * math.cos(sv * PI / 2)) * rng.uniform(0.75, 1.2)
            tt.append(fang(f"t{nm}{i}", p, down + V((math.sin(sv * PI / 2) * 0.2, 0.15, 0)), V((-p.x, 1.2 - p.y, 0)), L, 0.028, curve=0.18, m="tooth", seg=5, n=5))
        parts.append(Part(kit.merge(tt, f"teeth{nm}"), bone=bone))
    hd = []
    for sx in (-1, 1):
        p, n = surf_at(body, 2.15, PI / 2 - sx * 1.0, -0.01)
        hd.append(eye(f"eye{sx}", p, n + V((0, 0.5, 0)), 0.045, "mo_eye", cornea_m="cornea", pupil=(0.55, 0.55)))
    parts.append(Part(kit.merge(hd, "eyes"), bone="head"))
    # fins: lofted foils (thick roots and leading edges, thin trailing edges): long pectorals, a dorsal, pelvics, a crescent tail
    for sx, s_ in ((-1, "L"), (1, "R")):
        sk.add(f"fin{s_}", (sx * 0.6, 0.95, -0.35), (sx * 2.0, 0.25, -0.85), sp[1])
        parts.append(Part(foil(f"pec{s_}", V((sx * 0.55, 1.15, -0.3)), V((sx * 0.85, -0.4, -0.36)), V((0, -1, 0)), 1.75,
                               lambda u: (1.0 * (1 - u) ** 0.75 + 0.07, 0.11 * (1 - u) + 0.008, 0.62 * u ** 1.2), "mo_hide", curl=0.06), bones=[f"fin{s_}", sp[1]]))
        parts.append(Part(foil(f"pel{s_}", V((sx * 0.3, -1.25, -0.36)), V((sx * 0.6, -0.55, -0.6)), V((0, -1, 0)), 0.6,
                               lambda u: (0.45 * (1 - u) ** 0.8 + 0.04, 0.06 * (1 - u) + 0.006, 0.3 * u), "mo_hide"), bone=sp[3]))
    parts.append(Part(foil("dorsal", V((0, 0.35, 0.5)), V((0, -0.42, 1.0)), V((0, -1, 0)), 0.85,
                           lambda u: (0.95 * (1 - u) ** 0.85 + 0.05, 0.08 * (1 - u) + 0.006, 0.55 * u ** 1.3), "mo_hide", curl=-0.04), bones=sp[1:4]))
    parts.append(Part(foil("dorsal2", V((0, -1.9, 0.26)), V((0, -0.5, 1.0)), V((0, -1, 0)), 0.32,
                           lambda u: (0.35 * (1 - u) + 0.03, 0.04 * (1 - u) + 0.004, 0.2 * u), "mo_hide"), bones=sp[3:5]))
    parts.append(Part(foil("flukeU", V((0, -2.5, 0.06)), V((0, -0.62, 1.0)), V((0, -1, 0)), 1.45,
                           lambda u: (0.62 * (1 - u) ** 0.7 + 0.04, 0.085 * (1 - u) + 0.006, 0.55 * u ** 1.4), "mo_hide", curl=-0.05), bone=sp[-1]))
    parts.append(Part(foil("flukeL", V((0, -2.5, -0.04)), V((0, -0.55, -1.0)), V((0, -1, 0)), 1.05,
                           lambda u: (0.55 * (1 - u) ** 0.7 + 0.04, 0.075 * (1 - u) + 0.006, 0.45 * u ** 1.4), "mo_hide", curl=0.05), bone=sp[-1]))
    body_o = assemble("monarch_body", sk, parts)
    arm = finish_creature(root, sk, body_o, os.path.join(kit.out_dir(), "mars_monarch.glb"), props={"creature": "monarch", "length": 5.4}, ao=0.8, paint=2048)
    return root, arm


ALL = ["icebloom", "ferric", "ferric_small", "ribbon", "prism", "prismnest", "ghost", "bmimic", "hermit", "serpent", "monarch"]

if __name__ == "__main__":
    which = [a for a in sys.argv[1:] if not a.startswith("--")] or ALL
    prev = "--nopreview" not in sys.argv
    for w in which:
        root, arm = globals()[w]()
        if not prev:
            continue
        if w == "icebloom":
            preview("mars_icebloom", (1.2, -2.0, 1.6), (0, 0, 0.1), lens=40, world=(0.6, 0.62, 0.66))
        elif w in ("ferric", "ferric_small"):
            preview(f"mars_{w}", (5.5, -6.5, 2.8), (0, 0, 1.6), lens=35, world=(0.2, 0.32, 0.32))
        elif w == "ribbon":
            preview("mars_ribbon", (0.25, -0.15, 0.25), (0, 0, 0), lens=45, world=(0.15, 0.2, 0.25))
        elif w == "prism":
            pose(arm, {"manL1": (0.3, 0, 0)})
            preview("mars_prism", (1.6, 2.4, 1.1), (0, 0.2, 0.3), lens=35, world=(0.2, 0.22, 0.28))
        elif w == "prismnest":
            preview("mars_prism_nest", (1.4, 2.2, 1.2), (0, 0, 0.3), lens=35, world=(0.3, 0.3, 0.32))
        elif w == "ghost":
            preview("mars_ghost", (1.4, 2.6, -1.0), (0, 0.1, 0), lens=35, world=(0.08, 0.1, 0.14))
        elif w == "bmimic":
            preview("mars_bmimic", (1.6, 2.8, 0.9), (0, 0.4, 0.2), lens=35, world=(0.35, 0.28, 0.25))
        elif w == "hermit":
            preview("mars_hermit", (0.45, 0.55, 0.3), (0, 0, 0.06), lens=40, world=(0.6, 0.45, 0.38))
        elif w == "serpent":
            preview("mars_serpent", (1.6, 3.0, 1.0), (0, 0.6, 0.2), lens=35, world=(0.4, 0.3, 0.25))
        elif w == "monarch":
            pose(arm, {"jaw": (-0.25, 0, 0)})
            preview("mars_monarch", (3.5, 5.2, 0.8), (0, 1.0, 0), lens=35, world=(0.1, 0.16, 0.2))
