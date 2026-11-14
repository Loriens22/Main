"""
Mars fauna, realism pass (original creatures designed from the reference art the player supplied; own geometry, no
copies). Built with blender/lib/organic.py (smooth parametric bodies, conforming plates, limbs as parametric tubes),
painted colour maps baked per creature (blender/lib/paint.py) and procedural fine relief at runtime.
  strider    (photo 1) a tall running biped: broad salmon carapace with a dark rim and blue light organs in dark rings,
             a ribbed dark underbody, a long S-neck (salmon above, segmented below), a grooved helmet head over a dark
             beak-jaw, a crest stalk ending in a sensory hammer, folded armoured forelimbs with black hooks, long ringed
             legs on three-clawed feet.
  stalker    (photo 3) a gaunt quadruped hunter: ribs, spine knobs, shoulder blades and hips showing under thin skin,
             deep chest and wasp waist, a broad heavy-browed skull, small deep eyes, tusks rising from the lower jaw,
             muscled limbs with long clawed fingers and toes, a long whip tail.
  lancewing  (photo 2) a gliding diver: grey thorax under a black carapace saddle, a long conical head with red line
             markings and a crown of radiating tusks, four long curved blade-wings with raised red loop markings, a
             long tail with side fins and a pronged end.
  tetherkite (photo 2, right) a drifting kite: a long club-shaped body with a keel, a red leading rim, two
             concentric eye rings, the lower end curling into the tail its tether hangs from (made at runtime).
Blender +Y forward, +Z up; ground z = 0. The skeletons (bone names and joints) are the contract with
src/world/fauna/mars.ts and are unchanged.
"""
import sys, os, math, random
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "lib"))
sys.path.insert(0, HERE)
import bpy, bmesh
from mathutils import Matrix, Vector
import kit
from kit import V, empty
import creature as C
from creature import Skeleton, Part, assemble, finish_creature
from organic import Surf, TubeSurf, plate, fin, tube, fang, ringed, eye, sstep, smooth_lerp
import paint_specs  # noqa: F401
from paint import PAINT

PI = math.pi
TAU = math.tau

kit.PALETTE.update({
    "cornea": dict(color=(0.9, 0.92, 0.95), rough=0.02, alpha=0.18),
    "strider_shell": dict(color=(0.82, 0.38, 0.26), rough=0.4),
    "strider_hide": dict(color=(0.15, 0.1, 0.085), rough=0.6),
    "strider_seam": dict(color=(0.08, 0.05, 0.05), rough=0.6),
    "strider_glow": dict(color=(0.1, 0.55, 0.75), emit=(0.15, 0.7, 1.0), emit_strength=3.0),
    "strider_eye": dict(color=(0.02, 0.02, 0.02), rough=0.05),
    "mstalker_skin": dict(color=(0.42, 0.37, 0.32), rough=0.6),
    "mstalker_belly": dict(color=(0.55, 0.49, 0.42), rough=0.6),
    "mstalker_eye": dict(color=(0.25, 0.16, 0.06), rough=0.05),
    "lance_skin": dict(color=(0.56, 0.63, 0.7), rough=0.45),
    "lance_carapace": dict(color=(0.05, 0.055, 0.07), rough=0.25),
    "lance_wing": dict(color=(0.6, 0.67, 0.74), rough=0.4),
    "wing_mark": dict(color=(0.78, 0.2, 0.13), emit=(1.0, 0.25, 0.12), emit_strength=1.0),
    "kite_skin": dict(color=(0.68, 0.73, 0.8), rough=0.4),
})

PAINT.update({
    # ---- strider (photo 1): coral armour outlined in dark brown seams, paler pink sheen on the domes, darker
    # rust underneath the skirt; dark ringed hide with long tendon streaks and pale worn ridges
    "strider_shell": {"base": (0.7, 0.26, 0.16), "layers": [
        ("noise", (0.42, 0.13, 0.07), 0.55, 0.5, 0.46, 0.7), ("noise", (0.88, 0.46, 0.33), 0.5, 0.18, 0.52, 0.7),
        ("retic", (0.16, 0.05, 0.03), 0.7, 0.32, 0.028), ("retic", (0.3, 0.1, 0.06), 0.35, 0.09, 0.05),
        ("speck", (0.95, 0.6, 0.48), 0.35, 0.012, 0.74), ("speck", (0.3, 0.09, 0.05), 0.3, 0.02, 0.72),
        ("belly", (0.36, 0.1, 0.06), 0.55), ("edge", (0.98, 0.66, 0.52), 0.6), ("cavity", (0.12, 0.035, 0.02), 0.8), ("ao", 0.7, 0.4)]},
    "strider_hide": {"base": (0.1, 0.062, 0.05), "layers": [
        ("streak", (0.26, 0.17, 0.13), 0.55, 0.035, "z", 0.55, 0.72), ("retic", (0.035, 0.02, 0.016), 0.55, 0.045, 0.07),
        ("noise", (0.2, 0.13, 0.1), 0.45, 0.2, 0.5, 0.7), ("noise", (0.05, 0.03, 0.025), 0.4, 0.08, 0.52, 0.7),
        ("belly", (0.17, 0.11, 0.09), 0.35), ("edge", (0.38, 0.27, 0.22), 0.6), ("cavity", (0.02, 0.012, 0.01), 0.8), ("ao", 0.7, 0.3)]},
    "strider_seam": {"base": (0.04, 0.026, 0.02), "layers": [("noise", (0.12, 0.07, 0.05), 0.45, 0.05, 0.5, 0.7), ("edge", (0.2, 0.12, 0.09), 0.4)]},
    # ---- Mars stalker (photo 3): grey-tan skin stretched over sinew, blue-grey tinge on the back, dark creases,
    # pale highlights on every raised muscle and bone, fine wrinkle net
    "mstalker_skin": {"base": (0.4, 0.32, 0.24), "layers": [
        ("noise", (0.2, 0.15, 0.11), 0.55, 0.7, 0.5, 0.68), ("noise", (0.56, 0.47, 0.37), 0.5, 0.25, 0.52, 0.7),
        ("noise", (0.3, 0.27, 0.25), 0.35, 0.4, 0.5, 0.7), ("noise", (0.26, 0.19, 0.14), 0.45, 0.12, 0.5, 0.7),
        ("retic", (0.2, 0.15, 0.11), 0.45, 0.03, 0.06), ("streak", (0.55, 0.47, 0.37), 0.45, 0.04, "z", 0.55, 0.72),
        ("speck", (0.62, 0.55, 0.45), 0.3, 0.008, 0.74), ("back", (0.28, 0.22, 0.17), 0.45), ("belly", (0.62, 0.54, 0.43), 0.5),
        ("edge", (0.66, 0.6, 0.52), 0.85), ("cavity", (0.04, 0.03, 0.025), 0.9), ("ao", 0.85, 0.35)]},
    "mstalker_belly": {"base": (0.46, 0.4, 0.33), "layers": [
        ("streak", (0.36, 0.3, 0.25), 0.4, 0.02, "x", 0.55, 0.72), ("noise", (0.38, 0.32, 0.27), 0.4, 0.1, 0.5, 0.7),
        ("cavity", (0.15, 0.12, 0.1), 0.7), ("ao", 0.7, 0.2)]},
    "mouth_red": {"base": (0.26, 0.04, 0.05), "layers": [("noise", (0.12, 0.02, 0.03), 0.6, 0.02, 0.45, 0.7), ("ao", 0.8, 0.1)]},
    # ---- lancewing / tether-kite (photo 2): pale blue-grey, fine pale streaks along the blades, darker leading
    # edges, faint rose flush near the head
    "lance_skin": {"base": (0.32, 0.38, 0.47), "layers": [
        ("noise", (0.3, 0.35, 0.42), 0.5, 0.3, 0.48, 0.7), ("noise", (0.58, 0.62, 0.7), 0.4, 0.08, 0.52, 0.7),
        ("retic", (0.3, 0.34, 0.4), 0.3, 0.05, 0.06), ("speck", (0.65, 0.68, 0.75), 0.35, 0.015, 0.73),
        ("grad", (0.62, 0.42, 0.45), 0.3, "y", 1.0, 1.9), ("belly", (0.62, 0.66, 0.72), 0.45),
        ("edge", (0.75, 0.78, 0.84), 0.55), ("cavity", (0.12, 0.13, 0.17), 0.75), ("ao", 0.65, 0.3)]},
    "lance_carapace": {"base": (0.025, 0.028, 0.04), "layers": [
        ("noise", (0.07, 0.075, 0.09), 0.5, 0.15, 0.5, 0.7), ("retic", (0.08, 0.085, 0.1), 0.35, 0.06, 0.05),
        ("edge", (0.22, 0.23, 0.27), 0.7), ("ao", 0.55, 0.2)]},
    "lance_wing": {"base": (0.4, 0.47, 0.56), "layers": [
        ("streak", (0.62, 0.67, 0.74), 0.5, 0.05, "z", 0.55, 0.72), ("streak", (0.3, 0.35, 0.42), 0.45, 0.12, "z", 0.55, 0.72),
        ("noise", (0.36, 0.42, 0.5), 0.4, 0.5, 0.5, 0.72), ("speck", (0.7, 0.74, 0.8), 0.3, 0.02, 0.74),
        ("edge", (0.25, 0.28, 0.34), 0.6), ("ao", 0.45, 0.2)]},
    "kite_skin": {"base": (0.4, 0.46, 0.55), "layers": [
        ("noise", (0.4, 0.45, 0.53), 0.45, 0.25, 0.5, 0.7), ("retic", (0.42, 0.46, 0.54), 0.3, 0.06, 0.05),
        ("grad", (0.78, 0.4, 0.4), 0.6, "z", 0.5, 1.45), ("speck", (0.7, 0.74, 0.8), 0.3, 0.015, 0.74),
        ("edge", (0.78, 0.8, 0.86), 0.5), ("cavity", (0.2, 0.22, 0.28), 0.6), ("ao", 0.55, 0.2)]},
})


def pose(arm, rots):
    """preview only: rotate pose bones (local XYZ euler, radians)"""
    for nm, r in rots.items():
        pb = arm.pose.bones.get(nm)
        if pb:
            pb.rotation_mode = "XYZ"
            pb.rotation_euler = r


def organ(name, p, n, r):
    """a light organ: a dark raised ring round a glowing dome"""
    from fauna_jupiter import orient
    n = V(n).normalized()
    ring = kit.torus(f"{name}r", r * 0.82, r * 0.24, m="strider_seam", seg=16, rseg=5)
    ring = orient(ring, n, V(p) + n * (r * 0.05))
    core = kit.sphere(f"{name}c", r * 0.7, m="strider_glow", segs=12, rings=6, scale=(1, 1, 0.45))
    core = orient(core, n, V(p) + n * (r * 0.02))
    return kit.merge([ring, core], name)


def placed(o, origin, fwd, up):
    """move an object built along local +Y (length) with +Z as its up so that +Y → fwd and +Z → up, at origin"""
    f = V(fwd).normalized()
    u = V(up)
    u = (u - f * u.dot(f)).normalized()
    x = f.cross(u)
    m = Matrix((x, f, u)).transposed().to_4x4()
    m.translation = V(origin)
    o.matrix_world = m @ o.matrix_world
    kit.bake(o)
    return o


# ================================================================================================ strider (photo 1)
def strider():
    kit.reset()
    root = empty("Strider")
    rng = random.Random(7)
    sk = Skeleton()
    sk.add("pelvis", (0, -0.35, 1.82), (0, 0.15, 1.9))
    sk.add("spine", (0, 0.15, 1.9), (0, 0.72, 2.08), "pelvis")
    tails = sk.chain("tail", [(0, -0.35, 1.82), (0, -1.1, 1.95), (0, -1.92, 2.13)], "pelvis")
    necks = sk.chain("neck", [(0, 0.72, 2.12), (0, 0.88, 2.5), (0, 0.9, 2.88), (0, 0.98, 3.2), (0, 1.15, 3.45), (0, 1.4, 3.6)], "spine")
    sk.add("head", (0, 1.4, 3.6), (0, 2.34, 3.44), necks[-1])
    sk.add("jaw", (0, 1.6, 3.43), (0, 2.26, 3.31), "head")
    crest = sk.chain("crest", [(0, 1.42, 3.84), (0, 1.48, 4.18), (0, 1.74, 4.42), (0, 2.1, 4.5), (0, 2.42, 4.38)], "head")
    for s, sx in (("L", -1), ("R", 1)):
        sk.add(f"arm.{s}", (sx * 0.34, 0.72, 2.02), (sx * 0.42, 0.3, 2.44), "spine")
        sk.add(f"fore.{s}", (sx * 0.42, 0.3, 2.44), (sx * 0.4, 1.24, 2.36), f"arm.{s}")
        sk.add(f"claw.{s}", (sx * 0.4, 1.24, 2.36), (sx * 0.38, 1.32, 1.98), f"fore.{s}")
        sk.add(f"thigh.{s}", (sx * 0.38, -0.35, 1.78), (sx * 0.42, 0.08, 1.24), "pelvis")
        sk.add(f"shin.{s}", (sx * 0.42, 0.08, 1.24), (sx * 0.4, -0.55, 0.56), f"thigh.{s}")
        sk.add(f"meta.{s}", (sx * 0.4, -0.55, 0.56), (sx * 0.4, -0.3, 0.13), f"shin.{s}")
        sk.add(f"toe.{s}", (sx * 0.4, -0.3, 0.13), (sx * 0.4, 0.16, 0.04), f"meta.{s}")
    parts = []
    body_bones = ["pelvis", "spine"] + tails

    # ---- the dark underbody: hips to chest, ringed segments underneath, tapering into a short pointed tail
    under = Surf([
        (-2.12, 0.02, 0.03, 0.03, 2.1, 2.0), (-1.8, 0.1, 0.11, 0.11, 2.02, 2.0), (-1.3, 0.21, 0.19, 0.19, 1.93, 2.2),
        (-0.7, 0.3, 0.25, 0.27, 1.82, 2.3), (-0.15, 0.32, 0.26, 0.29, 1.78, 2.3), (0.35, 0.3, 0.26, 0.27, 1.85, 2.3),
        (0.7, 0.25, 0.24, 0.23, 1.99, 2.2), (0.88, 0.2, 0.2, 0.18, 2.1, 2.0)])

    def udisp(t, a):
        sn = math.sin(a)
        ring = max(0.0, math.cos(t * 26 * TAU / 2)) ** 6
        return -0.022 * ring * sstep(0.3, -0.4, sn) + 0.008 * math.sin(t * 90) * (sn < 0)
    parts.append(Part(under.mesh("under", 90, 32, ("strider_hide",), disp=udisp), bones=body_bones + ["thigh.L", "thigh.R"]))

    # ---- the carapace: a broad lens, domed, its skirt dark-rimmed, transverse seams, a pointed upturned rear
    def zc(t):
        return 2.12 + 0.14 * t + 0.06 * math.sin(PI * t)
    # a thick domed shell whose skirts wrap down the flanks over the underbody (photo 1)
    shell = Surf([
        (-2.22, 0.03, 0.05, 0.03, 2.2, 2.0), (-1.95, 0.24, 0.16, 0.08, 2.12, 2.2), (-1.45, 0.47, 0.3, 0.16, 2.04, 2.4),
        (-0.85, 0.6, 0.4, 0.22, 2.0, 2.6), (-0.25, 0.62, 0.43, 0.24, 2.0, 2.6), (0.25, 0.55, 0.4, 0.22, 2.04, 2.5),
        (0.58, 0.4, 0.3, 0.16, 2.12, 2.3), (0.76, 0.14, 0.12, 0.06, 2.2, 2.0)])

    SEAMS = (0.18, 0.31, 0.44, 0.56, 0.68, 0.8)

    def sdisp(t, a):
        sn = math.sin(a)
        d = 0.0
        # seams across the shell
        for ts in SEAMS:
            d -= 0.016 * math.exp(-((t - ts) / 0.008) ** 2) * (sn > -0.3)
        # longitudinal seams splitting the dome into panels, each panel slightly domed
        for ac in (PI / 2 - 0.62, PI / 2 + 0.62):
            d -= 0.012 * math.exp(-((a - ac) / 0.025) ** 2) * sstep(0.12, 0.2, t) * (1 - sstep(0.8, 0.88, t))
        ph = min(abs(t - q) for q in SEAMS)
        d += 0.02 * min(1.0, ph / 0.06)
        # a low median keel; the skirt's lower edge rolled into a thick dark rim
        d += 0.012 * math.exp(-((a - PI / 2) / 0.12) ** 2)
        d += 0.025 * math.exp(-((sn + 0.55) / 0.12) ** 2)
        return d

    def smat(t, a):
        sn = math.sin(a)
        if -0.75 < sn < -0.4:
            return 1  # dark rim along the skirt's lower edge
        for ts in SEAMS:
            if abs(t - ts) < 0.007 and sn > -0.3:
                return 1
        for ac in (PI / 2 - 0.62, PI / 2 + 0.62):
            if abs(a - ac) < 0.02 and 0.16 < t < 0.84:
                return 1
        return 0
    parts.append(Part(shell.mesh("shell", 110, 48, ("strider_shell", "strider_seam"), disp=sdisp, mat_fn=smat), bones=body_bones))
    # light organs: a cluster over the rear top, a row along each skirt, a few on the collar
    org = []
    for k in range(16):
        t = rng.uniform(0.18, 0.46)
        a = PI / 2 + rng.uniform(-0.9, 0.9)
        org.append(organ(f"ot{k}", shell.P(t, a) + shell.N(t, a) * 0.01, shell.N(t, a), rng.uniform(0.045, 0.075)))
    for k in range(9):
        t = 0.32 + 0.07 * k
        for a in (-0.15, PI + 0.15):
            org.append(organ(f"or{k}{a:.1f}", shell.P(t, a), shell.N(t, a), 0.042))
    parts.append(Part(kit.merge(org, "organs"), bones=body_bones))
    # collar plates over the shoulders rising toward the neck
    collar = []
    for k in range(3):
        y0 = 0.5 + 0.12 * k
        cs = Surf([(y0 - 0.1, 0.4 - 0.08 * k, 0.12, 0.02, 2.26 + 0.12 * k, 2.4), (y0 + 0.05, 0.36 - 0.08 * k, 0.14, 0.02, 2.32 + 0.12 * k, 2.4),
                   (y0 + 0.14, 0.26 - 0.06 * k, 0.1, 0.02, 2.38 + 0.12 * k, 2.2)])
        collar.append(cs.mesh(f"collar{k}", 10, 24, ("strider_shell", "strider_seam"), mat_fn=lambda t, a: 1 if abs(math.sin(a)) < 0.25 else 0))
    parts.append(Part(kit.merge(collar, "collar"), bones=["spine", "neck1"]))

    # ---- the S-neck: salmon dorsal plates, a dark segmented underside
    npts = [V(sk.seg(n)[0]) for n in necks] + [V(sk.seg(necks[-1])[1])]
    nts = TubeSurf(npts, lambda t: 0.25 - 0.07 * t, ref=(0, -1, 0.3), samples=40)

    def nmat(t, a):
        return 0 if math.cos(a) > -0.15 else (2 if max(0.0, math.cos(t * 24 * TAU / 2)) ** 6 > 0.5 else 1)

    def ndisp(t, a):
        ring = max(0.0, math.cos(t * 24 * TAU / 2)) ** 6
        return -0.02 * ring * (math.cos(a) < -0.1) + 0.012 * math.exp(-(a / 0.25) ** 2)
    parts.append(Part(nts.mesh("neck", 72, 28, ("strider_shell", "strider_hide", "strider_seam"), disp=ndisp, mat_fn=nmat), bones=necks + ["spine", "head"]))

    # ---- head: a long helmet, three dark grooves down each side, a ringed organ for an eye, a pointed snout
    h0, h1 = V(sk.seg("head")[0]), V(sk.seg("head")[1])

    def hz(y):
        return h0.z + (y - h0.y) * (h1.z - h0.z) / (h1.y - h0.y)
    head = Surf([
        (1.3, 0.1, 0.12, 0.1, hz(1.3) + 0.02, 2.0), (1.48, 0.2, 0.22, 0.14, hz(1.48), 2.3), (1.75, 0.24, 0.24, 0.13, hz(1.75), 2.6),
        (2.0, 0.21, 0.19, 0.1, hz(2.0), 2.6), (2.2, 0.14, 0.12, 0.07, hz(2.2), 2.4), (2.36, 0.05, 0.05, 0.04, hz(2.36), 2.0),
        (2.43, 0.01, 0.01, 0.01, hz(2.43), 2.0)])
    GROOVES = (0.05, 0.32, 0.58)

    def hdisp(t, a):
        sn, cs = math.sin(a), math.cos(a)
        d = 0.018 * math.exp(-((a - PI / 2) / 0.1) ** 2) * sstep(0.1, 0.3, t)
        if abs(cs) > 0.25 and 0.18 < t < 0.92:
            for g in GROOVES:
                d -= 0.014 * math.exp(-((sn - g) / 0.035) ** 2)
        return d

    def hmat(t, a):
        sn, cs = math.sin(a), math.cos(a)
        if abs(cs) > 0.25 and 0.2 < t < 0.9 and any(abs(sn - g) < 0.03 for g in GROOVES):
            return 1
        return 2 if sn < -0.35 else 0
    parts.append(Part(head.mesh("head", 50, 40, ("strider_shell", "strider_seam", "strider_hide"), disp=hdisp, mat_fn=hmat), bone="head"))
    hdet = []
    for sx in (-1, 1):
        a = PI / 2 - sx * 1.05
        hdet.append(organ(f"heye{sx}", head.P(0.24, a), head.N(0.24, a), 0.07))
        for k in range(6):
            t = 0.4 + 0.07 * k
            a2 = PI / 2 - sx * 1.55
            hdet.append(organ(f"hdot{sx}{k}", head.P(t, a2), head.N(t, a2), 0.022))
    parts.append(Part(kit.merge(hdet, "headdet"), bone="head"))
    # the jaw: a dark narrow beak-plate under the helmet
    j0, j1 = V(sk.seg("jaw")[0]), V(sk.seg("jaw")[1])

    def jz(y):
        return j0.z + (y - j0.y) * (j1.z - j0.z) / (j1.y - j0.y)
    jaw = Surf([(1.55, 0.12, 0.05, 0.06, jz(1.55), 2.2), (1.85, 0.15, 0.05, 0.07, jz(1.85), 2.4), (2.1, 0.1, 0.04, 0.05, jz(2.1), 2.3),
                (2.3, 0.04, 0.02, 0.03, jz(2.3), 2.0)])
    parts.append(Part(jaw.mesh("jaw", 24, 20, ("strider_hide", "mouth_red"), mat_fn=lambda t, a: 1 if math.sin(a) > 0.6 else 0), bone="jaw"))
    # crest: a thin stalk arching forward over the head, a sensory hammer at its tip with a dark eye
    cpts = [V((0, 1.4, 3.62))] + [V(sk.seg(c)[0]) for c in crest] + [V(sk.seg(crest[-1])[1])]
    cpath = [smooth_lerp(cpts, (len(cpts) - 1) * i / 34) for i in range(35)]
    parts.append(Part(ringed("crest", cpath, lambda t: 0.07 - 0.045 * t, "strider_shell", rings=16, groove=0.12, seg=10, samples=100), bones=crest + ["head"]))
    tip = cpts[-1]
    tdir = (cpts[-1] - cpts[-2]).normalized()
    hammer = Surf([(-0.18, 0.02, 0.02, 0.02, 0, 2), (-0.12, 0.045, 0.05, 0.04, 0, 2.4), (0.12, 0.045, 0.05, 0.04, 0, 2.4), (0.18, 0.02, 0.02, 0.02, 0, 2)])
    hm = hammer.mesh("hammer", 16, 16, ("strider_shell",))
    placed(hm, tip, V((1, 0, 0)), tdir.cross(V((1, 0, 0))) * -1)
    parts.append(Part(hm, bone=crest[-1]))
    parts.append(Part(organ("tipeye", tip + tdir * 0.04, tdir, 0.04), bone=crest[-1]))

    # ---- folded forelimbs: thick armoured salmon segments, dark joint bands, black hooks
    for s, sx in (("L", -1), ("R", 1)):
        a0, a1 = V(sk.seg(f"arm.{s}")[0]), V(sk.seg(f"arm.{s}")[1])
        f0, f1 = V(sk.seg(f"fore.{s}")[0]), V(sk.seg(f"fore.{s}")[1])
        c0, c1 = V(sk.seg(f"claw.{s}")[0]), V(sk.seg(f"claw.{s}")[1])
        ua = TubeSurf([a0, a0.lerp(a1, 0.5), a1], lambda t: (0.15 + 0.03 * math.sin(PI * t)) * min(1.0, t * 8 + 0.4), ref=(0, 0, 1))
        parts.append(Part(ua.mesh(f"uarm{s}", 18, 18, ("strider_shell", "strider_seam"), mat_fn=lambda t, a: 1 if 0.45 < t < 0.5 else 0), bone=f"arm.{s}"))
        fa = TubeSurf([f0, f0.lerp(f1, 0.5), f1], lambda t: (0.19 - 0.05 * t + 0.02 * math.sin(PI * t)) * min(1.0, (1 - t) * 8 + 0.35), ref=(0, 0, 1))
        segs = 3

        def fmat(t, a, segs=segs):
            ph = (t * segs) % 1.0
            return 1 if (0.04 < t < 0.97) and (ph < 0.05 or ph > 0.95) else 0

        def fdisp(t, a, segs=segs):
            ph = (t * segs) % 1.0
            return -0.025 * (math.exp(-(ph / 0.05) ** 2) + math.exp(-((1 - ph) / 0.05) ** 2)) + 0.015 * math.exp(-(a / 0.3) ** 2)
        parts.append(Part(fa.mesh(f"farm{s}", 36, 20, ("strider_shell", "strider_seam"), disp=fdisp, mat_fn=fmat), bone=f"fore.{s}"))
        hooks = [fang(f"hook{s}", c0 + V((0, 0.02, -0.02)), (c1 - c0) + V((0, 0.12, 0)), V((0, -1, 0)), 0.42, 0.06, curve=0.35, m="claw_black", seg=8, n=8),
                 fang(f"hook2{s}", c0 + V((sx * 0.05, -0.06, 0.0)), V((sx * 0.2, -0.4, -1)), V((0, 1, 0)), 0.25, 0.04, curve=0.3, m="claw_black", seg=6),
                 fang(f"elb{s}", a1 + V((0, -0.05, 0.05)), V((sx * 0.1, -1, 0.55)), V((0, 0, 1)), 0.24, 0.045, curve=0.25, m="claw_black", seg=6)]
        parts.append(Part(kit.merge(hooks[:2], f"hooks{s}"), bone=f"claw.{s}"))
        parts.append(Part(hooks[2], bone=f"fore.{s}"))
        parts.append(Part(kit.sphere(f"elbj{s}", 0.17, loc=tuple(a1), m="strider_hide", segs=14, rings=8), bones=[f"arm.{s}", f"fore.{s}"]))

    # ---- legs: muscular thigh, bulbous knee, long shin and metatarsus with tendons along them and wrinkle rings at
    # the joints (photo 1), three clawed toes and a spur

    def LEG(t, a):
        tend = 0.012 * max(0.0, math.cos(a * 3 + 0.4)) ** 3 + 0.006 * max(0.0, math.cos(a * 7)) ** 4
        joint = math.exp(-(t / 0.14) ** 2) + math.exp(-((1 - t) / 0.14) ** 2)
        ring = 0.01 * max(0.0, math.cos(t * 70)) ** 4 * joint
        return tend * (1 - 0.6 * joint) + ring - 0.006 * joint
    for s, sx in (("L", -1), ("R", 1)):
        th0, th1 = V(sk.seg(f"thigh.{s}")[0]), V(sk.seg(f"thigh.{s}")[1])
        sh0, sh1 = V(sk.seg(f"shin.{s}")[0]), V(sk.seg(f"shin.{s}")[1])
        mt0, mt1 = V(sk.seg(f"meta.{s}")[0]), V(sk.seg(f"meta.{s}")[1])
        t0, t1 = V(sk.seg(f"toe.{s}")[0]), V(sk.seg(f"toe.{s}")[1])
        thigh = TubeSurf([th0 + V((-sx * 0.05, 0.0, 0.16)), th0.lerp(th1, 0.4) + V((0, 0.03, 0)), th1], lambda t: (0.27 - 0.15 * t ** 0.8) * (1 + 0.12 * math.sin(PI * min(1, t * 1.6))), ref=(sx, 0, 0))
        parts.append(Part(thigh.mesh(f"thigh{s}", 26, 20, ("strider_hide",), disp=lambda t, a: 0.018 * math.cos(a * 2 + 0.6) * math.sin(PI * t) + 0.01 * math.sin(t * 40) * (t > 0.2)),
                          bones=[f"thigh.{s}", "pelvis"]))
        parts.append(Part(kit.sphere(f"hip{s}", 0.26, loc=tuple(th0 + V((-sx * 0.04, 0.02, 0.1))), m="strider_hide", segs=16, rings=10, scale=(0.85, 1.1, 1.0)), bones=["pelvis", f"thigh.{s}"]))
        parts.append(Part(kit.sphere(f"knee{s}", 0.13, loc=tuple(th1), m="strider_hide", segs=14, rings=8), bones=[f"thigh.{s}", f"shin.{s}"]))
        shin = TubeSurf([sh0, sh0.lerp(sh1, 0.5), sh1], lambda t: (0.1 - 0.03 * t) * (1 + 0.15 * math.exp(-(t / 0.12) ** 2)), ref=(sx, 0, 0))
        parts.append(Part(shin.mesh(f"shin{s}m", 40, 20, ("strider_hide",), disp=LEG), bones=[f"shin.{s}", f"thigh.{s}"]))
        parts.append(Part(kit.sphere(f"hock{s}", 0.085, loc=tuple(sh1), m="strider_hide", segs=12, rings=8), bones=[f"shin.{s}", f"meta.{s}"]))
        meta_ = TubeSurf([mt0, mt0.lerp(mt1, 0.5), mt1], lambda t: 0.075 - 0.015 * t, ref=(sx, 0, 0))
        parts.append(Part(meta_.mesh(f"meta{s}m", 32, 18, ("strider_hide",), disp=LEG), bones=[f"meta.{s}", f"shin.{s}"]))
        toes = []
        for k, ang in enumerate((-0.42, 0.0, 0.42)):
            d = V((math.sin(ang) + sx * 0.05, math.cos(ang), -0.15)).normalized()
            tb = t0 + V((0, 0.02, -0.02))
            tp = [tb, tb + d * 0.14, tb + d * 0.26 + V((0, 0, -0.03))]
            toes.append(ringed(f"toe{s}{k}", tp, lambda t: 0.045 - 0.012 * t, "strider_hide", rings=3, groove=0.2, seg=10, samples=18))
            toes.append(fang(f"tclaw{s}{k}", tp[-1], d + V((0, 0, -0.5)), V((0, 0, -1)), 0.16, 0.04, curve=0.35, m="claw_black", seg=6))
        toes.append(fang(f"spur{s}", mt1 + V((0, -0.04, 0.06)), V((0, -1, -0.2)), V((0, 0, -1)), 0.2, 0.04, curve=0.2, m="claw_black", seg=6))
        parts.append(Part(kit.merge(toes, f"foot{s}"), bone=f"toe.{s}"))
    body = assemble("strider_body", sk, parts)
    arm = finish_creature(root, sk, body, os.path.join(kit.out_dir(), "fauna_strider.glb"), props={"creature": "strider", "height": 4.5}, ao=0.5, paint=2048)
    return root, arm


# ================================================================================================ stalker (photo 3)
def stalker():
    kit.reset()
    root = empty("Stalker")
    rng = random.Random(3)
    sk = Skeleton()
    sk.add("pelvis", (0, 0.0, 1.12), (0, 0.38, 1.13))
    sp = sk.chain("spine", [(0, 0.38, 1.13), (0, 0.82, 1.12), (0, 1.25, 1.04)], "pelvis")
    sk.add("neck", (0, 1.25, 1.04), (0, 1.5, 0.95), sp[-1])
    sk.add("head", (0, 1.5, 0.95), (0, 1.98, 0.9), "neck")
    sk.add("jaw", (0, 1.6, 0.84), (0, 1.97, 0.75), "head")
    tail = sk.chain("tail", [(0, -0.05, 1.15), (0, -0.45, 1.3), (0, -0.85, 1.52), (0, -1.3, 1.7), (0, -1.8, 1.79), (0, -2.3, 1.77), (0, -2.75, 1.64), (0, -3.1, 1.45)], "pelvis")
    for s, sx in (("L", -1), ("R", 1)):
        sk.add(f"uarm.{s}", (sx * 0.21, 1.18, 0.98), (sx * 0.27, 1.02, 0.55), sp[-1])
        sk.add(f"farm.{s}", (sx * 0.27, 1.02, 0.55), (sx * 0.25, 1.22, 0.12), f"uarm.{s}")
        sk.add(f"hand.{s}", (sx * 0.25, 1.22, 0.12), (sx * 0.25, 1.46, 0.03), f"farm.{s}")
        sk.add(f"thigh.{s}", (sx * 0.2, 0.05, 1.06), (sx * 0.26, 0.45, 0.63), "pelvis")
        sk.add(f"shin.{s}", (sx * 0.26, 0.45, 0.63), (sx * 0.25, -0.1, 0.32), f"thigh.{s}")
        sk.add(f"foot.{s}", (sx * 0.25, -0.1, 0.32), (sx * 0.25, 0.12, 0.03), f"shin.{s}")
    parts = []

    def END(t):
        # rounded ends: limb tubes taper into the joints instead of stopping in a flat cut
        return (min(1.0, t * 5 + 0.35) * min(1.0, (1 - t) * 5 + 0.35)) ** 0.5
    # ---- torso: high hips, wasp waist, deep ribcage, broad shoulders; bones and sinew under thin skin
    torso = Surf([
        (-0.16, 0.1, 0.1, 0.1, 1.13, 2.0), (-0.02, 0.2, 0.17, 0.17, 1.13, 2.2), (0.2, 0.19, 0.15, 0.15, 1.12, 2.2),
        (0.46, 0.13, 0.12, 0.14, 1.12, 2.1), (0.72, 0.19, 0.16, 0.28, 1.1, 2.2), (0.95, 0.24, 0.19, 0.36, 1.07, 2.3),
        (1.13, 0.25, 0.2, 0.3, 1.05, 2.3), (1.3, 0.17, 0.15, 0.17, 1.02, 2.1), (1.38, 0.13, 0.12, 0.12, 1.0, 2.0)])

    def tdisp(t, a):
        sn, cs = math.sin(a), math.cos(a)
        y = torso.sec(t)[0]
        d = 0.0
        # ribs: diagonal bars down the flanks of the chest
        if 0.6 < y < 1.12 and sn < 0.75:
            ph = y * 11 + 0.35 * sn
            d += 0.03 * max(0.0, math.cos(ph * TAU)) ** 3 * sstep(0.6, 0.72, y) * (1 - sstep(1.02, 1.14, y)) * sstep(-0.85, -0.4, sn)
            d -= 0.008 * max(0.0, -math.cos(ph * TAU)) * sstep(0.6, 0.72, y) * (1 - sstep(1.02, 1.14, y)) * sstep(-0.85, -0.4, sn)
        # spine knobs along the back
        d += 0.032 * max(0.0, math.cos(y * 26)) ** 5 * math.exp(-((a - PI / 2) / 0.13) ** 2)
        # long back muscles either side of the spine, the belly drawn in under the ribs
        d += 0.014 * math.exp(-((abs(a - PI / 2) - 0.3) / 0.12) ** 2) * sstep(0.2, 0.5, y)
        d -= 0.018 * math.exp(-((y - 0.5) / 0.15) ** 2) * (sn < -0.5)
        # shoulder blades, hip bones
        for (yc, ac, h, sy, sa) in ((1.05, PI / 2 + 0.62, 0.05, 0.12, 0.28), (1.05, PI / 2 - 0.62, 0.05, 0.12, 0.28),
                                    (0.02, PI / 2 + 0.75, 0.045, 0.09, 0.25), (0.02, PI / 2 - 0.75, 0.045, 0.09, 0.25)):
            d += h * math.exp(-((y - yc) / sy) ** 2 - ((a - ac) / sa) ** 2)
        # the waist's sunken flank and the belly line
        d -= 0.012 * math.exp(-((y - 0.45) / 0.12) ** 2) * (abs(cs) > 0.4)
        return d
    parts.append(Part(torso.mesh("torso", 90, 44, ("mstalker_skin", "mstalker_belly"), disp=tdisp,
                                 mat_fn=lambda t, a: 1 if math.sin(a) < -0.7 else 0),
                      bones=["pelvis"] + sp + ["neck", "thigh.L", "thigh.R", "uarm.L", "uarm.R", "tail1"]))
    # ---- neck: thick, with skin folds under the throat
    n0, n1 = V(sk.seg("neck")[0]), V(sk.seg("neck")[1])
    nts = TubeSurf([n0 + V((0, -0.06, 0.02)), n0.lerp(n1, 0.5), n1 + V((0, 0.06, 0.0))], lambda t: 0.15 - 0.03 * t, ref=(0, 0, 1))
    parts.append(Part(nts.mesh("neck", 18, 24, ("mstalker_skin",), disp=lambda t, a: -0.012 * max(0.0, math.cos(t * 5 * TAU)) ** 4 * (math.cos(a) < -0.2)),
                      bones=["neck", sp[-1], "head"]))
    # ---- head: broad domed skull, heavy brow ridge over small deep eyes, a short wide muzzle
    skull = Surf([
        (1.44, 0.11, 0.12, 0.1, 0.98, 2.0), (1.55, 0.17, 0.16, 0.12, 0.99, 2.3), (1.7, 0.18, 0.15, 0.1, 0.99, 2.4),
        (1.82, 0.14, 0.11, 0.08, 0.96, 2.5), (1.93, 0.1, 0.08, 0.06, 0.93, 2.4), (2.0, 0.05, 0.05, 0.04, 0.91, 2.0)])

    def skdisp(t, a):
        sn, cs = math.sin(a), math.cos(a)
        d = 0.03 * math.exp(-((t - 0.52) / 0.08) ** 2) * sstep(0.3, 0.7, sn)  # brow ridge
        d -= 0.03 * math.exp(-((t - 0.6) / 0.06) ** 2) * math.exp(-((abs(cs) - 0.55) / 0.15) ** 2) * (sn > -0.2)  # eye sockets
        d += 0.012 * math.sin(t * 60 + a * 4 + 1.5 * math.sin(a * 9)) * sstep(0.3, 0.8, sn)  # wrinkles over the brow and crown
        d += 0.02 * math.exp(-((t - 0.3) / 0.12) ** 2) * math.exp(-((abs(cs) - 0.8) / 0.18) ** 2) * (sn < 0.4)  # jaw muscles
        d += 0.006 * max(0.0, math.cos(t * 70)) ** 4 * sstep(0.7, 0.9, t) * (sn > -0.2)  # snout creases
        return d
    parts.append(Part(skull.mesh("skull", 36, 32, ("mstalker_skin",), disp=skdisp), bone="head"))
    hdet = []
    for sx in (-1, 1):
        a = PI / 2 - sx * 0.98
        hdet.append(eye(f"eye{sx}", skull.P(0.6, a) - skull.N(0.6, a) * 0.012, skull.N(0.6, a) + V((0, 0.4, 0)), 0.022, "mstalker_eye", cornea_m="cornea", pupil=(0.5, 0.75), slit_axis=(0, 0, 1)))
        # upper canines hanging over the lower lip
        hdet.append(fang(f"ucan{sx}", V((sx * 0.06, 1.93, 0.86)), V((0, 0.1, -1)), V((0, -1, 0)), 0.06, 0.012, curve=0.2, m="tooth", seg=5))
    for k in range(2):
        hdet.append(kit.sphere(f"nost{k}", 0.012, loc=((k - 0.5) * 0.04, 2.0, 0.93), m="mouth_red", segs=6, rings=4, scale=(1, 0.7, 0.6)))
    parts.append(Part(kit.merge(hdet, "headdet"), bone="head"))
    # jaw with the two tusks rising from its front and a row of small teeth
    jaw = Surf([(1.6, 0.13, 0.04, 0.06, 0.84, 2.3), (1.75, 0.13, 0.04, 0.07, 0.82, 2.5), (1.88, 0.1, 0.035, 0.06, 0.79, 2.4), (1.98, 0.06, 0.03, 0.04, 0.77, 2.0)])
    parts.append(Part(jaw.mesh("jaw", 20, 20, ("mstalker_skin", "mouth_red"), mat_fn=lambda t, a: 1 if math.sin(a) > 0.6 else 0), bone="jaw"))
    jt = []
    for sx in (-1, 1):
        jt.append(fang(f"tusk{sx}", V((sx * 0.065, 1.93, 0.79)), V((sx * 0.15, 0.25, 1)), V((0, -1, 0)), 0.15, 0.022, curve=0.3, m="tooth", seg=7))
        for k in range(5):
            y = 1.68 + 0.045 * k
            jt.append(fang(f"jt{sx}{k}", V((sx * (0.1 - 0.008 * k), y, 0.8)), V((0, 0, 1)), V((0, -1, 0)), 0.03, 0.008, curve=0.1, m="tooth", seg=4, n=4))
    parts.append(Part(kit.merge(jt, "jawteeth"), bone="jaw"))
    # ---- limbs: one continuous muscled tube from shoulder to wrist / hip to heel (skinned across both bones), muscle
    # bellies, tendons, wrinkle folds at the joints; long-fingered clawed hands and feet (photo 3)
    def prof(table):
        ts = [q[0] for q in table]
        rs = [q[1] for q in table]

        def f(t):
            for k in range(len(ts) - 1):
                if t <= ts[k + 1]:
                    u = (t - ts[k]) / (ts[k + 1] - ts[k])
                    u = u * u * (3 - 2 * u)
                    return rs[k] + (rs[k + 1] - rs[k]) * u
            return rs[-1]
        return f

    def limb_disp(joint_t):
        def d(t, a):
            muscle = 0.016 * max(0.0, math.cos(a * 2 + 0.7)) ** 2 * math.sin(PI * min(1.0, t / joint_t)) * (t < joint_t)
            muscle += 0.01 * max(0.0, math.cos(a * 2 - 0.9)) ** 2 * math.sin(PI * max(0.0, (t - joint_t) / (1 - joint_t))) * (t > joint_t)
            tendon = 0.006 * max(0.0, math.cos(a * 5)) ** 6 * (t > joint_t + 0.08)
            fold = 0.006 * max(0.0, math.cos((t - joint_t) * 90)) ** 4 * math.exp(-((t - joint_t) / 0.06) ** 2)
            return muscle + tendon + fold
        return d
    for s, sx in (("L", -1), ("R", 1)):
        u0, u1 = V(sk.seg(f"uarm.{s}")[0]), V(sk.seg(f"uarm.{s}")[1])
        f0, f1 = V(sk.seg(f"farm.{s}")[0]), V(sk.seg(f"farm.{s}")[1])
        p0, p1 = V(sk.seg(f"hand.{s}")[0]), V(sk.seg(f"hand.{s}")[1])
        arm_ts = TubeSurf([u0 + V((-sx * 0.06, 0.0, 0.12)), u0 + V((sx * 0.01, 0.0, 0.02)), u0.lerp(u1, 0.5) + V((sx * 0.01, 0, 0)), u1 + V((0, -0.015, 0)), f0.lerp(f1, 0.5), f1 + V((0, 0, 0.02))],
                          prof([(0, 0.03), (0.06, 0.12), (0.22, 0.12), (0.4, 0.085), (0.52, 0.06), (0.6, 0.07), (0.8, 0.05), (1.0, 0.034)]), ref=(sx, 0, 0), samples=64)
        parts.append(Part(arm_ts.mesh(f"arm{s}", 58, 22, ("mstalker_skin",), disp=limb_disp(0.52)), bones=[f"uarm.{s}", f"farm.{s}", sp[-1]]))
        hand = []
        hand.append(kit.sphere(f"palm{s}", 1.0, loc=tuple(p0 + V((0, 0.05, -0.03))), m="mstalker_skin", segs=14, rings=8, scale=(0.065, 0.085, 0.032)))
        for k, dx in enumerate((-0.05, -0.017, 0.017, 0.05)):
            fp = [p0 + V((dx * 0.7, 0.04, -0.04)), p0 + V((dx, 0.11, -0.06)), p0 + V((dx * 1.2, 0.18, -0.07)), p1 + V((dx * 1.4, 0.06, -0.025))]
            hand.append(ringed(f"fing{s}{k}", fp, lambda t: 0.018 - 0.006 * t, "mstalker_skin", rings=3, groove=0.16, seg=10, samples=24))
            hand.append(fang(f"claw{s}{k}", fp[-1], (fp[-1] - fp[-2]) + V((0, 0, -0.05)), V((0, 0, -1)), 0.07, 0.013, curve=0.45, m="claw_black", seg=6))
        parts.append(Part(kit.merge(hand, f"hand{s}"), bone=f"hand.{s}"))
        t0, t1 = V(sk.seg(f"thigh.{s}")[0]), V(sk.seg(f"thigh.{s}")[1])
        s0, s1 = V(sk.seg(f"shin.{s}")[0]), V(sk.seg(f"shin.{s}")[1])
        o0, o1 = V(sk.seg(f"foot.{s}")[0]), V(sk.seg(f"foot.{s}")[1])
        leg_ts = TubeSurf([t0 + V((-sx * 0.1, -0.1, 0.1)), t0 + V((0, -0.02, 0.02)), t0.lerp(t1, 0.45), t1 + V((0, 0.02, 0)), s0.lerp(s1, 0.4), s1],
                          prof([(0, 0.04), (0.07, 0.17), (0.25, 0.155), (0.45, 0.1), (0.53, 0.068), (0.62, 0.075), (0.82, 0.055), (1.0, 0.045)]), ref=(sx, 0, 0), samples=64)
        parts.append(Part(leg_ts.mesh(f"leg{s}", 58, 22, ("mstalker_skin",), disp=limb_disp(0.53)), bones=[f"thigh.{s}", f"shin.{s}", "pelvis"]))
        ft = TubeSurf([s1 + V((0, 0.02, 0.02)), o0.lerp(o1, 0.5), o1], prof([(0, 0.048), (0.5, 0.04), (1.0, 0.03)]), ref=(sx, 0, 0))
        foot = [ft.mesh(f"foot{s}", 16, 14, ("mstalker_skin",), disp=lambda t, a: 0.004 * max(0.0, math.cos(a * 5)) ** 6)]
        for k, dx in enumerate((-0.035, 0.0, 0.035)):
            tp = [o1 + V((dx, -0.02, 0.01)), o1 + V((dx * 1.4, 0.06, -0.005)), o1 + V((dx * 1.7, 0.13, -0.015))]
            foot.append(ringed(f"htoe{s}{k}", tp, lambda t: 0.019 - 0.005 * t, "mstalker_skin", rings=2, groove=0.16, seg=10, samples=16))
            foot.append(fang(f"hclaw{s}{k}", tp[-1], (tp[-1] - tp[-2]) + V((0, 0, -0.04)), V((0, 0, -1)), 0.055, 0.012, curve=0.45, m="claw_black", seg=6))
        parts.append(Part(kit.merge(foot, f"foot{s}"), bones=[f"foot.{s}"]))
    # ---- tail: thick at the root, a long whip, faint ring segments
    tpts = [V(sk.seg(t)[0]) for t in tail] + [V(sk.seg(tail[-1])[1])]
    parts.append(Part(ringed("tail", tpts, lambda t: 0.09 * (1 - t) ** 0.9 + 0.01, "mstalker_skin", rings=26, groove=0.06, seg=14, samples=140), bones=tail + ["pelvis"]))
    body = assemble("stalker_body", sk, parts)
    arm = finish_creature(root, sk, body, os.path.join(kit.out_dir(), "fauna_stalker.glb"), props={"creature": "stalker", "height": 1.4}, ao=0.3, paint=2048)
    return root, arm


# ================================================================================================ lancewing (photo 2)
def lancewing():
    kit.reset()
    root = empty("Lancewing")
    rng = random.Random(9)
    sk = Skeleton()
    sk.add("body", (0, -0.5, 0), (0, 0.45, 0))
    sk.add("head", (0, 0.45, 0), (0, 1.95, 0.0), "body")
    tails = sk.chain("tail", [(0, -0.5, 0), (0, -1.3, 0.02), (0, -2.1, 0.04), (0, -2.9, 0.06), (0, -3.6, 0.07)], "body")
    tusks = []
    for k, (ax, az, L) in enumerate(((-0.28, 0.32, 1.5), (0.26, 0.3, 1.35), (-0.12, 0.12, 1.05), (0.14, 0.18, 1.2), (-0.3, 0.02, 0.9), (0.32, 0.06, 0.95))):
        d = V((ax, 1.0, az)).normalized()
        b0 = V((math.copysign(0.05, ax), 1.9, 0.0 + az * 0.1))
        tusks.append((f"tusk{k}", b0, d, L))
        sk.add(f"tusk{k}", tuple(b0), tuple(b0 + d * L), "head")
    for sx in (-1, 1):
        sk.chain(f"whisk{'L' if sx < 0 else 'R'}", [(sx * 0.1, 1.7, -0.08), (sx * 0.2, 1.95, -0.35), (sx * 0.22, 1.85, -0.7)], "head")
    fins = {}
    for nm, d, L in (("finUL", V((-0.55, 0.18, 0.82)), 4.1), ("finUR", V((0.5, 0.1, 0.86)), 3.7), ("finLL", V((-0.6, -0.12, -0.79)), 3.8), ("finLR", V((0.55, -0.05, -0.83)), 3.5)):
        d.normalize()
        base = V((math.copysign(0.2, d.x), 0.0, math.copysign(0.16, d.z)))
        fins[nm] = (base, d, L)
        sk.chain(nm, [tuple(base), tuple(base + d * L * 0.5), tuple(base + d * L)], "body")
    parts = []
    # ---- thorax: a stout grey body, a black lacquered carapace saddle with two bands
    thor = Surf([(-0.95, 0.06, 0.06, 0.06, 0.0, 2.0), (-0.7, 0.2, 0.18, 0.17, 0.0, 2.2), (-0.3, 0.32, 0.29, 0.27, 0.0, 2.3),
                 (0.15, 0.34, 0.3, 0.28, 0.0, 2.3), (0.45, 0.28, 0.25, 0.23, 0.0, 2.2)])
    parts.append(Part(thor.mesh("thorax", 40, 32, ("lance_skin",), disp=lambda t, a: 0.01 * math.sin(t * 40) * (math.sin(a) < 0)), bones=["body", "tail1"]))
    sad = Surf([(-0.6, 0.24, 0.26, 0.05, 0.03, 2.4), (-0.2, 0.37, 0.34, 0.05, 0.04, 2.6), (0.2, 0.37, 0.34, 0.05, 0.04, 2.6), (0.5, 0.26, 0.24, 0.05, 0.03, 2.4)])
    parts.append(Part(sad.mesh("saddle", 30, 36, ("lance_carapace",), disp=lambda t, a: 0.012 * math.exp(-((a - PI / 2) / 0.15) ** 2) - 0.01 * math.exp(-((t - 0.5) / 0.03) ** 2)), bone="body"))
    for y in (-0.32, 0.3):
        band = kit.torus(f"band{y}", 0.36, 0.022, loc=(0, y, 0.02), rot=(PI / 2, 0, 0), m="lance_carapace", seg=28, rseg=6)
        band.scale = (1.0, 1.0, 0.86)
        parts.append(Part(band, bone="body"))
    # ---- head: long and conical, red line markings, a ringed red eye organ each side
    head = Surf([(0.35, 0.28, 0.26, 0.24, 0.0, 2.2), (0.75, 0.26, 0.24, 0.22, 0.02, 2.3), (1.2, 0.18, 0.17, 0.16, 0.02, 2.3),
                 (1.6, 0.11, 0.11, 0.1, 0.01, 2.2), (1.92, 0.05, 0.05, 0.05, 0.0, 2.0)])
    MARKS = (0.25, -0.15)

    def hmat(t, a):
        sn = math.sin(a)
        if 0.12 < t < 0.85 and abs(math.cos(a)) > 0.3 and any(abs(sn - m) < 0.025 for m in MARKS):
            return 1
        return 0
    parts.append(Part(head.mesh("head", 50, 36, ("lance_skin", "wing_mark"), mat_fn=hmat,
                                disp=lambda t, a: 0.006 * any(abs(math.sin(a) - m) < 0.025 for m in MARKS)), bone="head"))
    hd = []
    for sx in (-1, 1):
        a = PI / 2 - sx * 1.2
        p, n = head.P(0.2, a), head.N(0.2, a)
        ring = kit.torus(f"eyer{sx}", 0.055, 0.014, m="wing_mark", seg=16, rseg=5)
        from fauna_jupiter import orient
        hd.append(orient(ring, n, p + n * 0.005))
        hd.append(eye(f"eye{sx}", p - n * 0.01, n, 0.04, "lance_carapace", cornea_m="cornea", pupil=(0.6, 0.6)))
    parts.append(Part(kit.merge(hd, "headdet"), bone="head"))
    for (nm, b0, d, L) in tusks:
        parts.append(Part(fang(nm + "m", b0 - d * 0.1, d, V((0, 0, -1)), L, 0.045, curve=0.06, m="tooth", seg=7, n=8), bone=nm))
    for s in ("L", "R"):
        wb = [f"whisk{s}1", f"whisk{s}2"]
        pts = [V(sk.seg(wb[0])[0]), V(sk.seg(wb[0])[1]), V(sk.seg(wb[1])[1])]
        path = [smooth_lerp(pts, 2 * i / 12) for i in range(13)]
        parts.append(Part(ringed(f"whisker{s}", path, lambda t: 0.02 - 0.014 * t, "lance_carapace", rings=8, groove=0.15, seg=6, samples=40), bones=wb))
    # ---- four long curved blade-wings with raised red loop markings
    for nm, (base, d, L) in fins.items():
        flat = d.cross(V((0, 1, 0))).normalized()
        wsurf = Surf([(0.0, 0.08, 0.05, 0.05, 0.0, 2.0), (0.15 * L, 0.3, 0.05, 0.05, 0.0, 2.4), (0.45 * L, 0.36, 0.035, 0.035, 0.04, 2.6),
                      (0.75 * L, 0.26, 0.025, 0.025, 0.07, 2.6), (0.95 * L, 0.08, 0.015, 0.015, 0.06, 2.2), (L, 0.01, 0.01, 0.01, 0.05, 2.0)])
        w = wsurf.mesh(nm + "_blade", 60, 16, ("lance_wing",), disp=lambda t, a: 0.006 * math.exp(-((math.cos(a)) / 0.15) ** 2))
        placed(w, base, d, flat)
        parts.append(Part(w, bones=[nm + "1", nm + "2", "body"]))
        side = d.cross(flat).normalized()
        loops = []
        for (tc, ra, rb) in ((0.42, 0.11, 0.3 * L), (0.84, 0.05, 0.08 * L)):
            c = base + d * (L * tc)
            for sgn in (-1, 1):
                pts = []
                for k in range(33):
                    ang = TAU * k / 32
                    pts.append(c + side * (math.cos(ang) * ra) + d * (math.sin(ang) * rb) + flat * (sgn * 0.05))
                loops.append(tube(f"{nm}loop{tc}{sgn}", pts, [0.016] * 33, "wing_mark", seg=5))
        parts.append(Part(kit.merge(loops, nm + "_loops"), bones=[nm + "1", nm + "2"]))
    # ---- long tail: side fins near the middle, three prongs at the end
    tpts = [V(sk.seg(t)[0]) for t in tails] + [V(sk.seg(tails[-1])[1])]
    parts.append(Part(ringed("tail", tpts, lambda t: 0.17 * (1 - t) ** 0.8 + 0.02, "lance_skin", rings=22, groove=0.06, seg=12, samples=100), bones=tails + ["body"]))
    c = tpts[2]
    for sx in (-1, 1):
        parts.append(Part(fin(f"sfin{sx}", [c + V((sx * 0.06, 0.15, 0)), c + V((sx * 0.06, -0.2, 0))], [c + V((sx * 0.6, -0.25, 0.04)), c + V((sx * 0.3, -0.45, 0.02))],
                              "lance_wing", nv=5, rays=6, thick=0.02, up=(0, 0, 1)), bone=tails[1]))
    end = tpts[-1]
    for k, dd in enumerate(((-0.35, -0.75, 0.05), (0.0, -0.95, 0.0), (0.35, -0.75, 0.05))):
        parts.append(Part(fang(f"prong{k}", end, V(dd), V((0, 0, 1)), V(dd).length, 0.05, curve=0.1, m="lance_wing", seg=6), bone=tails[-1]))
    body = assemble("lancewing_body", sk, parts)
    arm = finish_creature(root, sk, body, os.path.join(kit.out_dir(), "fauna_lancewing.glb"), props={"creature": "lancewing", "span": 7.5}, ao=0.4, paint=2048)
    return root, arm


# ================================================================================================ tetherkite (photo 2, right)
def tetherkite():
    kit.reset()
    root = empty("Tetherkite")
    sk = Skeleton()
    sk.chain("k", [(0, 0, -1.25), (0, 0, 0.0), (0, 0.05, 1.45)], None)
    sk.chain("curl", [(0, 0, -1.25), (0, 0.25, -1.55), (0, 0.42, -1.6)], "k1")
    parts = []
    # the body: a club-shaped leaf hanging upright (built along +Y, then stood up on +Z), a keel down its back
    leaf = Surf([(-1.25, 0.04, 0.05, 0.05, 0.0, 2.0), (-0.8, 0.2, 0.08, 0.06, 0.0, 2.2), (-0.2, 0.36, 0.1, 0.07, 0.0, 2.4),
                 (0.4, 0.48, 0.11, 0.07, 0.0, 2.6), (0.9, 0.52, 0.1, 0.06, 0.0, 2.6), (1.3, 0.38, 0.08, 0.05, 0.0, 2.3), (1.5, 0.06, 0.03, 0.03, 0.0, 2.0)],
                bend=lambda t: (0.0, 0.06 * math.sin(PI * t)))

    def ldisp(t, a):
        cs = math.cos(a)
        return 0.035 * math.exp(-((a - PI / 2) / 0.12) ** 2) + 0.02 * (abs(cs) ** 6)  # keel, curled margins

    def lmat(t, a):
        return 1 if (t > 0.62 and abs(math.sin(a)) < 0.22) else 0
    body = leaf.mesh("leaf", 60, 36, ("kite_skin", "wing_mark"), disp=ldisp, mat_fn=lmat)
    placed(body, V((0, 0, 0)), V((0, 0, 1)), V((0, -1, 0)))
    parts.append(Part(body, bones=["k1", "k2"]))
    # concentric eye rings low on the face, dark pupils
    from fauna_jupiter import orient
    eyes = []
    for sx in (-1, 1):
        c = V((sx * 0.17, -0.1, -0.5))
        for k, (rr, w) in enumerate(((0.16, 0.022), (0.1, 0.016))):
            ring = kit.torus(f"eyer{sx}{k}", rr, w, m="wing_mark", seg=24, rseg=5)
            ring.scale = (0.75, 1.0, 1.0)
            eyes.append(orient(ring, V((0, -1, 0)), c + V((0, -0.005 * k, 0))))
        eyes.append(kit.sphere(f"pupil{sx}", 0.05, loc=tuple(c + V((0, -0.01, 0))), m="lance_carapace", segs=10, rings=6, scale=(1, 0.4, 1.2)))
    parts.append(Part(kit.merge(eyes, "eyes"), bones=["k1"]))
    cpts = [V(sk.seg("curl1")[0]), V(sk.seg("curl1")[1]), V(sk.seg("curl2")[1])]
    cpath = [smooth_lerp(cpts, 2 * i / 12) for i in range(13)]
    parts.append(Part(ringed("curl", cpath, lambda t: 0.11 - 0.08 * t, "kite_skin", rings=8, groove=0.1, seg=10, samples=40), bones=["curl1", "curl2", "k1"]))
    body_o = assemble("tetherkite_body", sk, parts)
    arm = finish_creature(root, sk, body_o, os.path.join(kit.out_dir(), "fauna_tetherkite.glb"), props={"creature": "tetherkite", "tether": 0}, ao=0.3, paint=1024)
    return root, arm


def preview_pose(name, cam, target, lens=40, world=(0.55, 0.62, 0.72)):
    kit.preview(os.path.join(kit.preview_dir(), f"{name}.png"), cam, target, lens=lens, samples=16, world=world, sun=(0.5, -0.6, 0.7), sun_strength=3.5)


RUN = {
    # preview poses that echo the reference images (the rest pose stays neutral for the game's animation)
    "strider": {"thigh.L": (0.75, 0, 0), "shin.L": (-0.9, 0, 0), "meta.L": (0.8, 0, 0), "toe.L": (0.6, 0, 0),
                "thigh.R": (-0.5, 0, 0), "shin.R": (0.25, 0, 0), "meta.R": (-0.2, 0, 0), "neck1": (-0.15, 0, 0)},
    "stalker": {"uarm.L": (0.8, 0, 0), "farm.L": (-0.5, 0, 0), "uarm.R": (-0.4, 0, 0), "thigh.L": (-0.6, 0, 0), "shin.L": (0.3, 0, 0),
                "thigh.R": (0.5, 0, 0), "tail2": (0.2, 0, 0), "tail4": (0.25, 0, 0)},
}


if __name__ == "__main__":
    which = [a for a in sys.argv[1:] if not a.startswith("--")] or ["strider", "stalker", "lancewing", "tetherkite"]
    prev = "--nopreview" not in sys.argv
    for w in which:
        root, arm = globals()[w]()
        if not prev:
            continue
        if w in RUN:
            pose(arm, RUN[w])
        if w == "strider":
            preview_pose("fauna_strider", (6.4, 0.6, 2.5), (0, 0.1, 2.2), lens=32)
            preview_pose("fauna_strider_34", (4.5, 5.2, 3.2), (0, 0.4, 2.4), lens=32)
        elif w == "stalker":
            preview_pose("fauna_stalker", (-4.2, 1.0, 1.2), (0, 0.2, 0.95), lens=32, world=(0.75, 0.62, 0.45))
            preview_pose("fauna_stalker_head", (-1.2, 3.0, 1.2), (0, 1.7, 0.9), lens=40, world=(0.75, 0.62, 0.45))
        elif w == "lancewing":
            preview_pose("fauna_lancewing", (-3.5, 7.5, -3.5), (0, 0.2, 0.2), lens=30)
        else:
            preview_pose("fauna_tetherkite", (2.8, -4.5, 0.2), (0, 0, 0), lens=35)
