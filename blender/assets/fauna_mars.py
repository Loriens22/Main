"""
Mars fauna (original creatures designed from the reference art the player supplied; no copies of it):
  strider    — a tall running biped: salmon armour carapace of overlapping plates with rows of blue light-organs, a long
               ringed S-neck, an elongated helmet head whose lower plate drops open (the shriek), a whip crest arching
               back from the skull, folded raptorial scythe-arms, long dark digitigrade legs on two-toed hooked feet.
  stalker    — a lean, eyeless quadruped hunter: deep ribbed chest, wasp waist, heavy clawed forelimbs, long digitigrade
               hind legs, a whip tail, a long skull that splits into a toothed jaw.
  lancewing  — a gliding diver: a pale spindle body with a dark collar, a beaked head with a fan of hooked feelers,
               four long blade fins in an X with glowing red markings, a segmented tail with a crescent fluke.
  tetherkite — a drifting kite-ray: flat diamond wings with eye-ring markings; the long sticky tether that trails
               from its tail is made at runtime.
Blender +Y forward, +Z up; ground z = 0. Each GLB: one skinned mesh + armature; the game animates the bones.
"""
import sys, os, math, random
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "lib"))
sys.path.insert(0, HERE)
import bpy, bmesh
from mathutils import Matrix
import kit
from kit import V, box, cyl, M, empty
import creature as C
from creature import Skeleton, Part, meta, capsule_chain, plate, blade, tube_tapered, spots, assemble, finish_creature, decimate

PI = math.pi
R = random.Random(7)


def mirror(p):
    return (-p[0], p[1], p[2])


def ell(co, size, r=1.0):
    return ("ELLIPSOID", co, r, size)


def ball(co, r):
    return ("BALL", co, r)


def dome_sections(y0, y1, n, width, height, z0, base=0.0, k=0.92):
    """cross-section arcs (left → over the top → right) along y for a carapace plate"""
    secs = []
    for i in range(n + 1):
        t = i / n
        y = y0 + (y1 - y0) * t
        w = width(t)
        hh = height(t)
        zc = z0(t)
        arc = []
        for j in range(13):
            a = PI * j / 12
            arc.append((-math.cos(a) * w, y, zc + base + math.sin(a) ** k * hh))
        secs.append(arc)
    return secs


# ================================================================================================ helpers
def ringed_spots(name, pts, r, bone_parts, bone=None, bones=None):
    """light organs: a dark rim with a glowing core (photo 1's blue spots)"""
    rim = spots(name + "_rim", pts, r, "strider_seam")
    core = spots(name + "_core", [(tuple(V(p) + V(n).normalized() * 0.012), n) for (p, n) in pts], r * 0.62, "strider_glow")
    for o in (rim, core):
        bone_parts.append(Part(o, bone=bone, bones=bones))


def balls_along(pts, radii, step):
    """metaball balls every `step` along a polyline: overlapping beads read as ring segments"""
    out = []
    for i in range(len(pts) - 1):
        a, b = V(pts[i]), V(pts[i + 1])
        L = (b - a).length
        n = max(1, int(L / step))
        for k in range(n):
            t = k / n
            out.append(("BALL", tuple(a.lerp(b, t)), radii[i] + (radii[i + 1] - radii[i]) * t))
    out.append(("BALL", tuple(pts[-1]), radii[-1]))
    return out


def shell_sections(y0, y1, n, half_w, top_z, depth, curl=2.2, m=13):
    """cross sections of a broad, flat-topped shell whose skirts curl down at the edges"""
    secs = []
    for i in range(n + 1):
        t = i / n
        y = y0 + (y1 - y0) * t
        w, zt, d = half_w(t), top_z(t), depth(t)
        sec = []
        for j in range(m):
            a = PI * j / (m - 1)
            c = math.cos(a)
            sec.append((-c * w, y, zt - d * abs(c) ** curl))
        secs.append(sec)
    return secs


def surface_point(secs, t, u):
    """point and outward normal on a section grid: t along the sections, u across (0..1)"""
    n = len(secs) - 1
    i = min(n - 1, int(t * n))
    f = t * n - i
    m = len(secs[0]) - 1
    j = min(m - 1, int(u * m))
    g = u * m - j
    def P(a, b):
        return V(secs[a][b])
    p = (P(i, j).lerp(P(i, j + 1), g)).lerp(P(i + 1, j).lerp(P(i + 1, j + 1), g), f)
    du = (P(i, j + 1) - P(i, j))
    dt = (P(i + 1, j) - P(i, j))
    nrm = dt.cross(du).normalized()
    if nrm.z < 0:
        nrm = -nrm
    return p, nrm


def pose(arm, rots):
    """preview only: rotate pose bones (local XYZ euler, radians)"""
    for nm, r in rots.items():
        pb = arm.pose.bones.get(nm)
        if pb:
            pb.rotation_mode = "XYZ"
            pb.rotation_euler = r


# ================================================================================================ strider (photo 1)
def strider():
    kit.reset()
    root = empty("Strider")
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
    # dark, ringed underbody: hips → belly → chest, flowing up into the neck (beads read as segments)
    under = balls_along([(0, -1.45, 1.95), (0, -1.0, 1.86), (0, -0.55, 1.76), (0, -0.15, 1.74), (0, 0.2, 1.8), (0, 0.5, 1.9), (0, 0.74, 2.04)],
                        [0.1, 0.17, 0.24, 0.26, 0.25, 0.23, 0.21], 0.15)
    under += [ball((0.28, -0.35, 1.72), 0.2), ball((-0.28, -0.35, 1.72), 0.2)]
    um = meta("under", under, "strider_hide", res=0.045)
    parts.append(Part(decimate(um, 0.4), bones=["pelvis", "spine"] + tails + ["neck1", "thigh.L", "thigh.R"]))
    # the broad salmon shell: flat top, curled skirts, a pointed, slightly upturned tail tip
    def hw(t):
        return 0.02 + 0.62 * math.sin(min(1.0, t / 0.55) * PI / 2) ** 0.8 if t <= 0.55 else 0.64 - 0.22 * ((t - 0.55) / 0.45) ** 1.5
    def tz(t):
        return 2.16 + 0.17 * math.sin(PI * min(1.0, t * 1.1)) ** 0.7 + 0.07 * t + 0.07 * (1 - t) ** 8
    def dp(t):
        return 0.08 + 0.52 * math.sin(PI * min(1.0, 0.04 + t * 1.02)) ** 0.8
    secs = shell_sections(-1.98, 0.62, 16, hw, lambda t: tz(t) + 0.06 * math.sin(PI * t), dp, curl=1.45)
    parts.append(Part(plate("shell", secs, "strider_shell", thick=0.085), bones=tails + ["pelvis", "spine"]))
    # dark rim along both lower edges, transverse plate seams, the rear tip's downturned hook
    for j in (0, len(secs[0]) - 1):
        edge = [V(sec[j]) + V((0, 0, -0.02)) for sec in secs[1:]]
        parts.append(Part(tube_tapered(f"rim{j}", edge, 0.032, 0.02, "strider_seam", seg=6), bones=tails + ["pelvis", "spine"]))
    for t in (0.33, 0.58, 0.82):
        i = int(t * 16)
        strip = [[(x * 1.004, y - 0.025, z + 0.012) for (x, y, z) in secs[i]], [(x * 1.004, y + 0.025, z + 0.012) for (x, y, z) in secs[i]]]
        parts.append(Part(plate(f"seam{t}", strip, "strider_seam", thick=0.02), bones=["pelvis", "tail1", "spine"]))
    parts.append(Part(blade("tiphook", (0, -1.96, 2.2), (0, -2.12, 1.92), 0.06, (1, 0, 0), "strider_seam", thick=0.03, curve=0.04, n=5), bone="tail2"))
    # light organs: a scattered cluster on the rear top, a row down each skirt
    pts = []
    rr = random.Random(11)
    for k in range(18):
        t = rr.uniform(0.14, 0.5)
        u = 0.5 + rr.uniform(-0.3, 0.3)
        p, n = surface_point(secs, t, u)
        pts.append((tuple(p + n * 0.035), tuple(n)))
    ringed_spots("glow_top", pts, 0.065, parts, bones=tails + ["pelvis"])
    row = []
    for k in range(8):
        t = 0.34 + k * 0.075
        for u in (0.12, 0.88):
            p, n = surface_point(secs, t, u)
            row.append((tuple(p + n * 0.035), tuple(n)))
    ringed_spots("glow_row", row, 0.048, parts, bones=["pelvis", "spine", "tail1"])
    # collar plate rising over the shoulders toward the neck
    csecs = shell_sections(0.28, 0.98, 6, lambda t: 0.44 - 0.2 * t, lambda t: 2.32 + 0.3 * t ** 1.3, lambda t: 0.26 - 0.1 * t, curl=1.8)
    parts.append(Part(plate("collar", csecs, "strider_shell", thick=0.05), bones=["spine", "neck1"]))
    # thick ringed S-neck
    npts = [sk.seg(n)[0] for n in necks] + [sk.seg(necks[-1])[1]]
    nradii = [0.25, 0.235, 0.22, 0.205, 0.195, 0.19]
    nm_ = meta("neckm", balls_along(npts, nradii, 0.11), "strider_hide", res=0.04)
    parts.append(Part(decimate(nm_, 0.45), bones=necks + ["spine", "head"]))
    # segment ridges around the neck and down the underbody (photo 1: a ringed, insect-like underside)
    rings = []
    path = [V(p) for p in npts]
    for i in range(len(path) - 1):
        a_, b_ = path[i], path[i + 1]
        for k in range(3):
            t = (k + 0.5) / 3
            c = a_.lerp(b_, t)
            r = nradii[i] + (nradii[i + 1] - nradii[i]) * t
            rg = kit.torus(f"nring{i}{k}", r * 1.1 + 0.01, 0.034, loc=tuple(c), m="strider_seam", seg=20, rseg=5)
            rg.rotation_euler = V((0, 0, 1)).rotation_difference((b_ - a_).normalized()).to_euler()
            rings.append(rg)
    parts.append(Part(kit.merge(rings, "neckrings"), bones=necks + ["spine", "head"]))
    urings = []
    for k, (y, z, r) in enumerate(((-1.0, 1.86, 0.17), (-0.7, 1.79, 0.22), (-0.4, 1.75, 0.25), (-0.1, 1.74, 0.26), (0.2, 1.8, 0.25), (0.48, 1.9, 0.23))):
        rg = kit.torus(f"uring{k}", r * 1.08 + 0.01, 0.034, loc=(0, y, z), rot=(PI / 2 + 0.15, 0, 0), m="strider_seam", seg=20, rseg=5)
        urings.append(rg)
    parts.append(Part(kit.merge(urings, "underrings"), bones=["pelvis", "spine", "tail1"]))
    # head: a long ridged helmet, black lateral grooves, a ringed eye, rows of blue dots; dark lower jaw
    hb0, hb1 = sk.seg("head")
    hsecs = []
    for i in range(11):
        t = i / 10
        c = hb0.lerp(hb1, t) + V((0, 0, 0.05 * math.sin(PI * t)))
        w = 0.25 * math.sin(PI * min(1, 0.14 + t * 0.92)) ** 0.65 + 0.03
        hh = 0.21 * math.sin(PI * min(1, 0.1 + t * 0.9)) ** 0.75 + 0.03
        hsecs.append([tuple(c + V((math.cos(TAU * k / 14) * w, 0, math.sin(TAU * k / 14) * hh * (1.15 if math.sin(TAU * k / 14) > 0 else 0.8)))) for k in range(14)])
    helm = kit.loft("helmet", hsecs, m="strider_shell")
    kit.smooth(helm, 45)
    parts.append(Part(helm, bone="head"))
    ridge = [[tuple(V(hsecs[i][3]) + V((0, 0, 0.012))), tuple(V(hsecs[i][4]) + V((0, 0, 0.035))), tuple(V(hsecs[i][5]) + V((0, 0, 0.012)))] for i in range(1, 10)]
    parts.append(Part(plate("ridge", ridge, "strider_shell", thick=0.03), bone="head"))
    for sx in (-1, 1):
        for g, (k0, z0) in enumerate(((1, 0.07), (1, 0.0), (2, -0.07))):
            line = []
            for i in range(2 + g, 10):
                t = i / 10
                c = hb0.lerp(hb1, t) + V((0, 0, 0.05 * math.sin(PI * t)))
                w = 0.25 * math.sin(PI * min(1, 0.14 + t * 0.92)) ** 0.65 + 0.03
                line.append(tuple(c + V((sx * (w + 0.004), 0, z0 * (1 - 0.4 * t)))))
            parts.append(Part(tube_tapered(f"groove{sx}{g}", line, 0.014, 0.008, "strider_seam", seg=5), bone="head"))
        ep = hb0.lerp(hb1, 0.2) + V((sx * 0.25, 0, 0.04))
        ringed_spots(f"eye{sx}", [(tuple(ep), (sx, 0.1, 0.25))], 0.055, parts, bone="head")
        dots = [(tuple(hb0.lerp(hb1, 0.35 + 0.08 * k) + V((sx * (0.24 - 0.015 * k), 0, -0.1))), (sx, 0.0, -0.3)) for k in range(6)]
        ringed_spots(f"hdots{sx}", dots, 0.022, parts, bone="head")
    jb0, jb1 = sk.seg("jaw")
    jsecs = []
    for i in range(8):
        t = i / 7
        c = jb0.lerp(jb1, t)
        w = 0.2 * math.sin(PI * min(1, 0.15 + t * 0.9)) ** 0.7 + 0.01
        jsecs.append([tuple(c + V((-w, 0, 0.07))), tuple(c + V((0, 0, -0.05 * math.sin(PI * min(1, 0.1 + t))))), tuple(c + V((w, 0, 0.07)))])
    parts.append(Part(plate("jaw", jsecs, "strider_hide", thick=0.035), bone="jaw"))
    # crest: a thin stalk from the back of the skull arching forward over the head; a small T-shaped device at its tip
    cpts = [sk.seg(c)[0] for c in crest] + [sk.seg(crest[-1])[1]]
    sm = []
    for i in range(len(cpts) - 1):
        a_, b_ = V(cpts[i]), V(cpts[i + 1])
        c_ = V(cpts[i + 2]) if i + 2 < len(cpts) else b_ + (b_ - a_)
        for k in range(3):
            u = k / 3
            sm.append(a_.lerp(b_, u) + ((a_ + c_) / 2 - b_) * (-0.25 * math.sin(PI * u)))
    sm.append(V(cpts[-1]))
    parts.append(Part(tube_tapered("crest", sm, 0.05, 0.022, "strider_shell", seg=7), bones=crest))
    tip = V(cpts[-1])
    parts.append(Part(blade("tbar", tip + V((-0.16, -0.02, 0.0)), tip + V((0.16, -0.02, 0.0)), 0.07, (0, 0, 1), "strider_shell", thick=0.035, n=5, taper=0.0), bone=crest[-1]))
    parts.append(Part(kit.sphere("tknob", 0.045, loc=tuple(tip + V((0, 0.05, -0.02))), m="strider_seam", segs=8, rings=5), bone=crest[-1]))
    # folded forelimbs: fat tubular salmon segments with dark seams; black hooks at the joints
    for s, sx in (("L", -1), ("R", 1)):
        a0, a1 = sk.seg(f"arm.{s}")
        f0, f1 = sk.seg(f"fore.{s}")
        ua = meta(f"uarm{s}", capsule_chain([a0, a1], [0.17, 0.16]) + [ball(tuple(a1), 0.17)], "strider_shell", res=0.03)
        parts.append(Part(ua, bone=f"arm.{s}"))
        fa = meta(f"farm{s}", capsule_chain([f0, f0.lerp(f1, 0.55), f1], [0.2, 0.19, 0.15]), "strider_shell", res=0.03)
        parts.append(Part(fa, bone=f"fore.{s}"))
        for t in (0.3, 0.62, 0.9):
            c = f0.lerp(f1, t)
            ring = kit.torus(f"fring{s}{t}", 0.2 - 0.045 * t + 0.004, 0.02, loc=tuple(c), m="strider_seam", seg=18, rseg=5)
            ring.rotation_euler = V((0, 0, 1)).rotation_difference((f1 - f0).normalized()).to_euler()
            parts.append(Part(ring, bone=f"fore.{s}"))
        c0, c1 = sk.seg(f"claw.{s}")
        parts.append(Part(blade(f"hook{s}", c0 + V((0, 0.04, 0)), c1 + V((0, 0.1, -0.06)), 0.1, (sx, 0, 0), "claw_black", thick=0.05, curve=0.08, n=7), bone=f"claw.{s}"))
        parts.append(Part(blade(f"etal{s}", a1, a1 + V((sx * 0.02, -0.22, 0.12)), 0.06, (sx, 0, 0), "claw_black", thick=0.035, curve=0.04, n=5), bone=f"fore.{s}"))
    # legs: a thick thigh, bulbous knee, long shin back to a high hock, long metatarsus; two big black hooked toes
    for s, sx in (("L", -1), ("R", 1)):
        th0, th1 = sk.seg(f"thigh.{s}")
        sh0, sh1 = sk.seg(f"shin.{s}")
        mt0, mt1 = sk.seg(f"meta.{s}")
        lm = meta(f"leg{s}", capsule_chain([th0, th1], [0.19, 0.13]) + [ell(tuple(th0.lerp(th1, 0.35)), (0.15, 0.19, 0.2)), ball(tuple(th1), 0.125)] +
                  capsule_chain([sh0, sh1], [0.095, 0.07]) + [ball(tuple(sh1), 0.085)] + capsule_chain([mt0, mt1], [0.072, 0.06]), "strider_hide", res=0.03)
        parts.append(Part(decimate(lm, 0.4), bones=[f"thigh.{s}", f"shin.{s}", f"meta.{s}", "pelvis"]))
        t0, t1 = sk.seg(f"toe.{s}")
        for dx in (-0.07, 0.07):
            parts.append(Part(blade(f"toe{s}{dx}", t0 + V((dx, -0.02, 0.04)), t1 + V((dx * 1.5, 0.06, -0.03)), 0.11, (0, 0, 1), "claw_black", thick=0.09, curve=0.09, n=7), bone=f"toe.{s}"))
        parts.append(Part(blade(f"spur{s}", mt1, mt1 + V((0, -0.24, -0.06)), 0.06, (sx, 0, 0), "claw_black", thick=0.04, n=4), bone=f"meta.{s}"))
    body = assemble("strider_body", sk, parts)
    arm = finish_creature(root, sk, body, os.path.join(kit.out_dir(), "fauna_strider.glb"), props={"creature": "strider", "height": 4.5})
    return root, arm


TAU = math.tau


# ================================================================================================ stalker (photo 3)
def stalker():
    kit.reset()
    root = empty("Stalker")
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
    # gaunt torso: deep ribcage, tucked wasp waist, high hips; jutting shoulder blades, a knobbed spine, ribs
    els = [ell((0, 1.0, 1.0), (0.27, 0.44, 0.33)), ell((0, 0.56, 1.06), (0.15, 0.32, 0.15)), ell((0, 0.08, 1.1), (0.22, 0.28, 0.2)),
           ell((0, 1.28, 1.0), (0.17, 0.2, 0.2)), ell((0.15, 1.1, 1.22), (0.09, 0.17, 0.06)), ell((-0.15, 1.1, 1.22), (0.09, 0.17, 0.06)),
           ball((0.17, 0.08, 1.15), 0.13), ball((-0.17, 0.08, 1.15), 0.13)]
    for k in range(13):
        y = -0.05 + k * 0.1
        els.append(ball((0, y, 1.22 + 0.06 * math.sin(PI * min(1, y / 1.2)) - (0.04 if y > 1.0 else 0)), 0.03))
    for k in range(6):
        y = 0.72 + k * 0.09
        for sx in (-1, 1):
            els += capsule_chain([(sx * 0.1, y, 1.24), (sx * 0.245, y + 0.03, 1.02), (sx * 0.17, y + 0.07, 0.77)], [0.017, 0.02, 0.014])
    torso = meta("torso", els, "stalker_skin", res=0.026)
    parts.append(Part(decimate(torso, 0.45), bones=["pelvis"] + sp + ["neck", "thigh.L", "thigh.R", "uarm.L", "uarm.R", "tail1"]))
    nk = meta("neckm", capsule_chain([sk.seg("neck")[0], sk.seg("neck")[1]], [0.14, 0.12]), "stalker_skin", res=0.028)
    parts.append(Part(nk, bones=["neck", sp[-1], "head"]))
    # head: a domed skull, heavy brow, short muzzle, small deep-set eyes, an underbite with two fangs
    h0, h1 = sk.seg("head")
    skull = meta("skull", [ball((0, 1.62, 1.0), 0.19), ell((0, 1.78, 1.03), (0.17, 0.07, 0.06)), ell((0, 1.86, 0.91), (0.12, 0.15, 0.1)),
                           ell((0.1, 1.72, 0.92), (0.07, 0.1, 0.08)), ell((-0.1, 1.72, 0.92), (0.07, 0.1, 0.08))], "stalker_skin", res=0.022)
    parts.append(Part(decimate(skull, 0.55), bone="head"))
    j0, j1 = sk.seg("jaw")
    jaw = meta("jawm", [ell(tuple(j0.lerp(j1, 0.45)), (0.12, 0.2, 0.065)), ell(tuple(j1 + V((0, -0.02, 0.01))), (0.09, 0.06, 0.06))], "stalker_skin", res=0.02)
    parts.append(Part(decimate(jaw, 0.6), bone="jaw"))
    parts.append(Part(plate("gum", [[tuple(j0.lerp(j1, t) + V((-0.085 * (1 - t * 0.4), 0, 0.045))), tuple(j0.lerp(j1, t) + V((0, 0, 0.02))), tuple(j0.lerp(j1, t) + V((0.085 * (1 - t * 0.4), 0, 0.045)))] for t in (0.1, 0.5, 0.92)], "mouth_red", thick=0.02), bone="jaw"))
    parts.append(Part(spots("eyes", [((sx * 0.085, 1.8, 0.985), (sx, 0.6, 0.2)) for sx in (-1, 1)], 0.02, "wing_dark"), bone="head"))
    for sx in (-1, 1):
        parts.append(Part(kit.cyl(f"fang{sx}", 0.016, 0.14, loc=(sx * 0.055, 1.94, 0.82), rot=(0.15, 0, 0), m="tooth", verts=6, r2=0.002), bone="head"))
        for k in range(5):
            c = j0.lerp(j1, 0.35 + 0.13 * k)
            parts.append(Part(kit.cyl(f"ltooth{sx}{k}", 0.009, 0.045, loc=tuple(c + V((sx * (0.07 - 0.008 * k), 0, 0.06))), rot=(PI, 0, 0), m="tooth", verts=5, r2=0.001), bone="jaw"))
    # long arm-like forelimbs: shoulder, elbow, a long-fingered clawed hand
    for s, sx in (("L", -1), ("R", 1)):
        u0, u1 = sk.seg(f"uarm.{s}")
        f0, f1 = sk.seg(f"farm.{s}")
        fl = meta(f"fore{s}", [ball(tuple(u0 + V((sx * 0.03, 0, 0.02))), 0.13)] + capsule_chain([u0, u1], [0.105, 0.075]) + [ball(tuple(u1), 0.075)] +
                  capsule_chain([f0, f1], [0.075, 0.05]) + [ell(tuple(f1 + V((0, 0.08, -0.05))), (0.07, 0.1, 0.035))], "stalker_skin", res=0.022)
        parts.append(Part(decimate(fl, 0.5), bones=[f"uarm.{s}", f"farm.{s}", f"hand.{s}", sp[-1]]))
        p0, p1 = sk.seg(f"hand.{s}")
        for k, dx in enumerate((-0.06, -0.02, 0.02, 0.06)):
            fp = [p0 + V((dx, 0.06, -0.06)), p0 + V((dx * 1.2, 0.16, -0.08)), p1 + V((dx * 1.4, 0.06, -0.02))]
            parts.append(Part(tube_tapered(f"finger{s}{k}", fp, 0.018, 0.012, "stalker_skin", seg=5), bone=f"hand.{s}"))
            parts.append(Part(blade(f"claw{s}{k}", fp[-1], fp[-1] + V((dx * 0.3, 0.07, -0.04)), 0.022, (0, 0, 1), "claw_black", thick=0.018, curve=0.02, n=4), bone=f"hand.{s}"))
        # long digitigrade hind legs
        t0, t1 = sk.seg(f"thigh.{s}")
        s0, s1 = sk.seg(f"shin.{s}")
        o0, o1 = sk.seg(f"foot.{s}")
        hl = meta(f"hind{s}", capsule_chain([t0, t1], [0.16, 0.09]) + [ell(tuple(t0.lerp(t1, 0.35)), (0.13, 0.17, 0.2))] + capsule_chain([s0, s1], [0.075, 0.055]) +
                  [ball(tuple(s1), 0.06)] + capsule_chain([o0, o1], [0.05, 0.04]), "stalker_skin", res=0.022)
        parts.append(Part(decimate(hl, 0.5), bones=[f"thigh.{s}", f"shin.{s}", f"foot.{s}", "pelvis"]))
        for dx in (-0.04, 0.0, 0.04):
            parts.append(Part(blade(f"hclaw{s}{dx}", o1 + V((dx, -0.02, 0.02)), o1 + V((dx * 1.5, 0.13, -0.02)), 0.025, (0, 0, 1), "claw_black", thick=0.02, curve=0.02, n=4), bone=f"foot.{s}"))
    tpts = [sk.seg(t)[0] for t in tail] + [sk.seg(tail[-1])[1]]
    tl = meta("tailm", capsule_chain(tpts, [0.085, 0.07, 0.058, 0.046, 0.036, 0.027, 0.018, 0.01]), "stalker_skin", res=0.02)
    parts.append(Part(decimate(tl, 0.5), bones=tail + ["pelvis"]))
    body = assemble("stalker_body", sk, parts)
    arm = finish_creature(root, sk, body, os.path.join(kit.out_dir(), "fauna_stalker.glb"), props={"creature": "stalker", "height": 1.4})
    return root, arm


# ================================================================================================ lancewing (photo 2)
def lancewing():
    kit.reset()
    root = empty("Lancewing")
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
    thor = meta("thorax", [ell((0, 0.0, 0), (0.34, 0.62, 0.3)), ell((0, -0.65, 0.01), (0.2, 0.42, 0.18))], "wing_skin", res=0.035)
    parts.append(Part(decimate(thor, 0.6), bones=["body", "tail1"]))
    saddle = meta("saddle", [ell((0, 0.02, 0.14), (0.42, 0.5, 0.33))], "wing_dark", res=0.035)
    parts.append(Part(saddle, bone="body"))
    for y in (-0.3, 0.3):
        band = kit.torus(f"band{y}", 0.4, 0.018, loc=(0, y, 0.06), rot=(PI / 2, 0, 0), m="wing_dark", seg=24, rseg=4)
        band.scale = (1.0, 1.0, 0.8)
        parts.append(Part(band, bone="body"))
    # head: long and tapering forward, red line markings, red eyes; a crown of straight tusks; two drooping whiskers
    hb0, hb1 = sk.seg("head")
    hsecs = []
    for i in range(10):
        t = i / 9
        c = hb0.lerp(hb1, t)
        w = 0.3 * (1 - t) ** 0.6 + 0.08
        hh = 0.26 * (1 - t) ** 0.7 + 0.07
        hsecs.append([tuple(c + V((math.cos(TAU * k / 12) * w, 0, math.sin(TAU * k / 12) * hh))) for k in range(12)])
    hd = kit.loft("head", hsecs, m="wing_skin")
    kit.smooth(hd, 50)
    parts.append(Part(hd, bone="head"))
    for sx in (-1, 1):
        line = [tuple(V(hsecs[i][0 if sx > 0 else 6]) * 1.0 + V((sx * 0.006, 0, 0.04 - 0.01 * i))) for i in range(1, 9)]
        parts.append(Part(tube_tapered(f"mark{sx}", line, 0.012, 0.008, "wing_mark", seg=4), bone="head"))
        line2 = [tuple(V(hsecs[i][2 if sx > 0 else 4]) + V((0, 0, 0.006))) for i in range(2, 7)]
        parts.append(Part(tube_tapered(f"markt{sx}", line2, 0.01, 0.006, "wing_mark", seg=4), bone="head"))
        ringed = [((sx * 0.29, 0.72, 0.1), (sx, 0.2, 0.4))]
        parts.append(Part(spots(f"eye{sx}", ringed, 0.05, "wing_mark"), bone="head"))
    for (nm, b0, d, L) in tusks:
        parts.append(Part(tube_tapered(nm + "m", [b0, b0 + d * (L * 0.5), b0 + d * L], 0.045, 0.008, "tooth", seg=6), bone=nm))
    for s in ("L", "R"):
        wb = [f"whisk{s}1", f"whisk{s}2"]
        pts = [sk.seg(wb[0])[0], sk.seg(wb[0])[1], sk.seg(wb[1])[1]]
        parts.append(Part(tube_tapered(f"whisker{s}", pts, 0.018, 0.005, "wing_dark", seg=5), bones=wb))
    # four long leaf-blade fins from the saddle, red loop markings
    for nm, (base, d, L) in fins.items():
        flat = d.cross(V((0, 1, 0))).normalized()
        fb = blade(nm + "_blade", base, base + d * L, 0.72, flat, "wing_skin", thick=0.06, curve=0.12, n=14, taper=0.1)
        parts.append(Part(fb, bones=[nm + "1", nm + "2", "body"]))
        side = d.cross(flat).normalized()
        for t, sc in ((0.42, (0.09, 0.32)), (0.8, (0.05, 0.12))):
            c = base + d * (L * t)
            for sgn in (-1, 1):
                ring = kit.torus(f"{nm}loop{t}{sgn}", 1.0, 0.12, m="wing_mark", seg=20, rseg=4)
                ring.scale = (sc[0], sc[1], 0.08)
                ring.rotation_euler = Matrix((side, d, flat)).transposed().to_euler()
                ring.location = tuple(c + flat * sgn * 0.03)
                kit.bake(ring)
                parts.append(Part(ring, bones=[nm + "1", nm + "2"]))
    # long thin tail with paired side fins and a three-pronged end
    tpts = [sk.seg(t)[0] for t in tails] + [sk.seg(tails[-1])[1]]
    tm = meta("tailm", capsule_chain(tpts, [0.17, 0.13, 0.1, 0.07, 0.04]), "wing_skin", res=0.028)
    parts.append(Part(decimate(tm, 0.6), bones=tails + ["body"]))
    for sx in (-1, 1):
        c = V(tpts[2])
        parts.append(Part(blade(f"sfin{sx}", c, c + V((sx * 0.55, -0.35, 0.05)), 0.16, (0, 0, 1), "wing_skin", thick=0.025, n=6), bone=tails[1]))
    end = V(tpts[-1])
    for d in ((-0.35, -0.75, 0.05), (0.0, -0.9, 0.0), (0.35, -0.75, 0.05)):
        parts.append(Part(blade(f"prong{d[0]}", end, end + V(d), 0.07, (0, 0, 1), "wing_skin", thick=0.025, n=5, taper=0.6), bone=tails[-1]))
    body = assemble("lancewing_body", sk, parts)
    arm = finish_creature(root, sk, body, os.path.join(kit.out_dir(), "fauna_lancewing.glb"), props={"creature": "lancewing", "span": 7.5})
    return root, arm


# ================================================================================================ tetherkite (photo 2, right)
def tetherkite():
    kit.reset()
    root = empty("Tetherkite")
    sk = Skeleton()
    # hangs upright: a long leaf body, its lower end curling forward into the tail the tether hangs from
    sk.chain("k", [(0, 0, -1.25), (0, 0, 0.0), (0, 0.05, 1.45)], None)
    sk.chain("curl", [(0, 0, -1.25), (0, 0.25, -1.55), (0, 0.42, -1.6)], "k1")
    parts = []
    secs = []
    for i in range(13):
        t = i / 12
        z = -1.25 + 2.75 * t
        w = 0.5 * math.sin(PI * min(1, 0.05 + t * 1.0)) ** 0.55 + 0.02
        th = 0.11 * math.sin(PI * min(1, 0.05 + t)) ** 0.6 + 0.01
        yb = 0.05 * t * t
        secs.append([(math.cos(TAU * k / 14) * w, yb + math.sin(TAU * k / 14) * th, z) for k in range(14)])
    leaf = kit.loft("leaf", secs, m="wing_skin")
    kit.smooth(leaf, 50)
    parts.append(Part(leaf, bones=["k1", "k2"]))
    rim = [(math.cos(TAU * k / 14) * (0.5 * math.sin(PI * min(1, 0.05 + t)) ** 0.55 + 0.03), 0, -1.25 + 2.75 * t) for t in (0.62, 0.72, 0.82, 0.9, 0.96, 1.0) for k in (0,)]
    top = []
    for i in range(7, 13):
        t = i / 12
        w = 0.5 * math.sin(PI * min(1, 0.05 + t)) ** 0.55 + 0.03
        top.append((w * 0.98, 0.01, -1.25 + 2.75 * t))
    top2 = [(-x, y, z) for (x, y, z) in reversed(top)]
    parts.append(Part(tube_tapered("redrim", top + top2[1:], 0.035, 0.035, "wing_mark", seg=6), bones=["k2"]))
    for sx in (-1, 1):
        ring = kit.torus(f"eyeloop{sx}", 1.0, 0.14, m="wing_mark", seg=20, rseg=4)
        ring.scale = (0.12, 0.2, 0.08)
        ring.rotation_euler = (PI / 2, 0, 0)
        ring.location = (sx * 0.17, -0.1, -0.55)
        kit.bake(ring)
        parts.append(Part(ring, bones=["k1"]))
        parts.append(Part(spots(f"pupil{sx}", [((sx * 0.17, -0.12, -0.55), (0, -1, 0))], 0.05, "wing_dark"), bones=["k1"]))
    cpts = [sk.seg("curl1")[0], sk.seg("curl1")[1], sk.seg("curl2")[1]]
    parts.append(Part(tube_tapered("curlm", cpts, 0.12, 0.03, "wing_skin", seg=8), bones=["curl1", "curl2", "k1"]))
    body = assemble("tetherkite_body", sk, parts)
    arm = finish_creature(root, sk, body, os.path.join(kit.out_dir(), "fauna_tetherkite.glb"), props={"creature": "tetherkite", "tether": 0})
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
        elif w == "lancewing":
            preview_pose("fauna_lancewing", (-3.5, 7.5, -3.5), (0, 0.2, 0.2), lens=30)
        else:
            preview_pose("fauna_tetherkite", (2.8, -4.5, 0.2), (0, 0, 0), lens=35)
