"""
Jupiter fauna (original creatures designed from the reference art the player supplied; no copies of it):
  floater   — a giant pearly gas-bag: a pumpkin ring of ~28 inflated lobes converging on a navel above and below,
              spiral shell ornaments along the lower bulge, a twisted bundle of tendrils hanging from the lower navel.
  veilray   — a dark manta of the haze: broad swept wings with hooked tips, a small rounded head, a curtain of eight
              long tapering tentacles.
  mawray    — a heavier manta whose underside opens in a round lamprey sucker ringed with hooked teeth; pelvic lobes,
              a long S whip tail.
  sporebulb — a pale bulb of fused cloves ringed at its base by a collar of spore sacs, a skirt of fine tentacles.
  hunter    — a yellow lobed gas-bag with rear fins, a porous orange crest, a blue organ and a crown of black whiskers at
              the nose; a multi-eyed hunter pod with feathered tentacles hangs below it (the cords are drawn at runtime
              between the `anchors` on the bag's belly and the pod).
Blender +Y forward, +Z up. Each GLB: one skinned mesh + armature; the game animates the bones.
"""
import sys, os, math, random
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "lib"))
sys.path.insert(0, HERE)
import bpy, bmesh
from mathutils import Matrix
import kit
from kit import V, M, empty, from_bmesh
import creature as C
import paint_specs  # noqa: F401
from paint import PAINT
from organic import ringed, fang
from creature import Skeleton, Part, meta, blade, tube_tapered, spots, assemble, finish_creature, decimate

PI = math.pi

kit.PALETTE.update({
    "cornea": dict(color=(0.9, 0.92, 0.95), rough=0.02, alpha=0.18),
    "ray_tent": dict(color=(0.13, 0.15, 0.16), rough=0.45),
    "ray_gill": dict(color=(0.04, 0.03, 0.03), rough=0.4),
    "floater_vein": dict(color=(0.8, 0.45, 0.35), rough=0.3),
    "puff_vein": dict(color=(0.8, 0.66, 0.5), rough=0.4),
})

PAINT.update({
    # ---- photo 4: the dark rays — near-black, smooth, faint paler mottling, lighter belly, pale tentacle tips
    "ray_skin": {"base": (0.03, 0.035, 0.038), "layers": [
        ("noise", (0.07, 0.08, 0.085), 0.55, 2.5, 0.48, 0.7), ("noise", (0.015, 0.017, 0.02), 0.5, 0.8, 0.5, 0.7),
        ("speck", (0.1, 0.11, 0.115), 0.35, 0.12, 0.74), ("grad", (0.08, 0.09, 0.1), 0.4, "x", 6.0, 12.0),
        ("edge", (0.12, 0.13, 0.14), 0.35), ("ao", 0.55, 2.5)]},
    "ray_belly": {"base": (0.1, 0.11, 0.115), "layers": [
        ("noise", (0.16, 0.17, 0.18), 0.45, 1.5, 0.48, 0.7), ("spots", (0.2, 0.21, 0.22), 0.3, 0.6, 0.15, 0.3), ("ao", 0.6, 2.0)]},
    "ray_tent": {"base": (0.05, 0.055, 0.06), "layers": [
        ("grad", (0.32, 0.33, 0.34), 0.7, "z", -6.0, -17.0), ("noise", (0.02, 0.022, 0.025), 0.5, 0.6, 0.5, 0.7),
        ("speck", (0.2, 0.21, 0.22), 0.3, 0.1, 0.74), ("ao", 0.5, 1.0)]},
    "ray_lip": {"base": (0.12, 0.12, 0.12), "layers": [("noise", (0.25, 0.22, 0.22), 0.5, 0.3, 0.5, 0.7), ("cavity", (0.04, 0.03, 0.03), 0.6), ("ao", 0.7, 1.0)]},
    "ray_gill": {"base": (0.03, 0.02, 0.02), "layers": [("noise", (0.12, 0.05, 0.05), 0.5, 0.2, 0.5, 0.7)]},
    # ---- photo 4 right: the cream spore bulb, faintly peach, veined
    "puff_bladder": {"base": (0.78, 0.7, 0.55), "layers": [
        ("noise", (0.88, 0.8, 0.66), 0.5, 1.2, 0.48, 0.7), ("retic", (0.62, 0.48, 0.36), 0.35, 0.9, 0.05),
        ("grad", (0.86, 0.72, 0.56), 0.35, "z", 2.0, 6.4), ("cavity", (0.5, 0.4, 0.3), 0.55), ("ao", 0.5, 1.2)]},
    "puff_spore": {"base": (0.84, 0.78, 0.64), "layers": [
        ("retic", (0.65, 0.55, 0.42), 0.35, 0.4, 0.06), ("noise", (0.94, 0.9, 0.8), 0.4, 0.3, 0.5, 0.7), ("ao", 0.55, 0.8)]},
    "puff_tendril": {"base": (0.8, 0.72, 0.58), "layers": [("grad", (0.92, 0.88, 0.8), 0.6, "z", -2.0, -12.0), ("noise", (0.6, 0.52, 0.42), 0.4, 0.3, 0.5, 0.7)]},
    # ---- photo 5: the floater — pearly peach to orange gas bag, darker in the lobe grooves, pale shells
    "floater_bag": {"base": (0.66, 0.26, 0.13), "layers": [
        ("grad", (0.9, 0.66, 0.55), 0.75, "z", -6.0, 14.0), ("noise", (0.55, 0.18, 0.08), 0.55, 8.0, 0.46, 0.68),
        ("streak", (0.82, 0.5, 0.36), 0.45, 1.5, "z", 0.52, 0.72), ("streak", (0.5, 0.2, 0.12), 0.4, 3.0, "z", 0.55, 0.74),
        ("noise", (0.75, 0.82, 0.8), 0.25, 5.0, 0.6, 0.75), ("speck", (0.95, 0.85, 0.78), 0.3, 0.4, 0.74),
        ("cavity", (0.3, 0.1, 0.05), 0.85), ("ao", 0.75, 5.0)]},
    "floater_shell": {"base": (0.8, 0.74, 0.64), "layers": [
        ("streak", (0.62, 0.5, 0.4), 0.45, 0.06, "x", 0.55, 0.72), ("grad", (0.9, 0.62, 0.5), 0.3, "z", -9.0, -6.0),
        ("noise", (0.62, 0.55, 0.45), 0.5, 0.2, 0.5, 0.7), ("cavity", (0.4, 0.33, 0.25), 0.7), ("edge", (0.95, 0.93, 0.88), 0.5), ("ao", 0.6, 1.0)]},
    "floater_tendril": {"base": (0.32, 0.22, 0.17), "layers": [
        ("grad", (0.62, 0.5, 0.42), 0.5, "z", -10.0, -30.0), ("streak", (0.18, 0.12, 0.09), 0.5, 0.3, "z", 0.5, 0.7), ("ao", 0.6, 1.0)]},
    # ---- photo 6: the hunter — ochre ribbed bag, dark olive grooves, orange porous crest; mottled grey-mauve pod
    "hunter_bag": {"base": (0.6, 0.45, 0.1), "layers": [
        ("noise", (0.72, 0.58, 0.18), 0.5, 4.0, 0.48, 0.7), ("noise", (0.42, 0.3, 0.06), 0.45, 1.5, 0.52, 0.7),
        ("speck", (0.78, 0.66, 0.3), 0.3, 0.3, 0.74), ("back", (0.7, 0.55, 0.16), 0.3), ("belly", (0.45, 0.33, 0.08), 0.4),
        ("cavity", (0.25, 0.2, 0.04), 0.6), ("ao", 0.5, 6.0)]},
    "hunter_groove": {"base": (0.22, 0.2, 0.05), "layers": [("noise", (0.12, 0.1, 0.02), 0.5, 2.0, 0.5, 0.7), ("ao", 0.6, 4.0)]},
    "hunter_crest": {"base": (0.66, 0.26, 0.06), "layers": [
        ("noise", (0.85, 0.42, 0.12), 0.5, 1.5, 0.48, 0.7), ("spots", (0.35, 0.12, 0.03), 0.5, 0.8, 0.2, 0.5), ("cavity", (0.3, 0.1, 0.02), 0.6), ("ao", 0.6, 3.0)]},
    "hunter_fin": {"base": (0.78, 0.7, 0.36), "layers": [
        ("noise", (0.88, 0.82, 0.55), 0.5, 3.0, 0.48, 0.7), ("grad", (0.95, 0.9, 0.7), 0.4, "y", -36.0, -44.0), ("edge", (0.95, 0.92, 0.75), 0.4), ("ao", 0.4, 4.0)]},
    "hunter_body": {"base": (0.16, 0.12, 0.13), "layers": [
        ("noise", (0.3, 0.22, 0.25), 0.5, 1.2, 0.48, 0.7), ("spots", (0.62, 0.55, 0.52), 0.35, 0.5, 0.15, 0.3),
        ("retic", (0.08, 0.06, 0.06), 0.4, 0.4, 0.06), ("cavity", (0.05, 0.03, 0.04), 0.6), ("ao", 0.65, 2.0)]},
    "hunter_feather": {"base": (0.62, 0.58, 0.56), "layers": [
        ("grad", (0.82, 0.8, 0.78), 0.5, "z", -40.0, -60.0), ("noise", (0.45, 0.42, 0.42), 0.4, 0.8, 0.5, 0.7), ("ao", 0.5, 2.0)]},
    "hunter_sclera": {"base": (0.85, 0.55, 0.6), "layers": [("retic", (0.6, 0.15, 0.2), 0.35, 0.3, 0.04), ("ao", 0.5, 1.0)]},
    "hunter_whisker": {"base": (0.04, 0.035, 0.035), "layers": [("noise", (0.12, 0.1, 0.1), 0.4, 0.5, 0.5, 0.7)]},
})
TAU = math.tau


# ================================================================================================ helpers
def grid(name, P, nu, nv, mats, mat_fn=None, wrap_u=True, wrap_v=False, poles=(None, None)):
    """parametric surface: P(i, j) -> point, i around (nu), j along (nv); poles close the ends with fans"""
    bm = bmesh.new()
    rows = [[bm.verts.new(P(i, j)) for i in range(nu)] for j in range(nv)]
    mi = (lambda i, j: mat_fn(i, j)) if mat_fn else (lambda i, j: 0)
    iu = nu if wrap_u else nu - 1
    jv = nv if wrap_v else nv - 1
    for j in range(jv):
        for i in range(iu):
            f = bm.faces.new((rows[j][i], rows[j][(i + 1) % nu], rows[(j + 1) % nv][(i + 1) % nu], rows[(j + 1) % nv][i]))
            f.material_index = mi(i, j)
    for k, pole in enumerate(poles):
        if pole is None:
            continue
        pv = bm.verts.new(pole)
        row = rows[0] if k == 0 else rows[-1]
        for i in range(iu):
            f = bm.faces.new((row[i], row[(i + 1) % nu], pv))
            f.material_index = mi(i, 0 if k == 0 else nv - 2)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = from_bmesh(name, bm, tuple(mats))
    kit.smooth(o, 80)
    return o


def tube_r(name, pts, radii, m, seg=6):
    """tube along pts with a radius per point (spiral shells, tentacles that thicken)"""
    bm = bmesh.new()
    pts = [V(p) for p in pts]
    n = len(pts)
    rings = []
    prev_nx = None
    for i, p in enumerate(pts):
        t = (pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]).normalized()
        if prev_nx is None:
            upv = V((0, 0, 1)) if abs(t.z) < 0.9 else V((1, 0, 0))
            nx = t.cross(upv).normalized()
        else:  # parallel transport: no twisting on curling paths
            nx = (prev_nx - t * prev_nx.dot(t)).normalized()
        prev_nx = nx
        ny = nx.cross(t).normalized()
        r = radii[i]
        rings.append([bm.verts.new(p + (nx * math.cos(TAU * k / seg) + ny * math.sin(TAU * k / seg)) * r) for k in range(seg)])
    for i in range(n - 1):
        for k in range(seg):
            bm.faces.new((rings[i][k], rings[i][(k + 1) % seg], rings[i + 1][(k + 1) % seg], rings[i + 1][k]))
    bm.faces.new(list(reversed(rings[0])))
    tip = bm.verts.new(pts[-1] + (pts[-1] - pts[-2]).normalized() * radii[-1])
    for k in range(seg):
        bm.faces.new((rings[-1][k], rings[-1][(k + 1) % seg], tip))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = from_bmesh(name, bm, (m,))
    kit.smooth(o, 70)
    return o


def orient(o, normal, at):
    """place an object built around +Z so that +Z points along `normal`, at `at`"""
    q = V((0, 0, 1)).rotation_difference(V(normal).normalized())
    o.rotation_mode = "QUATERNION"
    o.rotation_quaternion = q
    o.location = tuple(at)
    kit.bake(o)
    return o


def surf_normal(P, a, b, da=1e-3, db=1e-3):
    p = V(P(a, b))
    n = (V(P(a + da, b)) - p).cross(V(P(a, b + db)) - p).normalized()
    return p, n


def chain_along(sk, prefix, path, nb, parent):
    """nb bones following a sampled polyline path"""
    idx = [round(k * (len(path) - 1) / nb) for k in range(nb + 1)]
    return sk.chain(prefix, [tuple(path[i]) for i in idx], parent)


def manta_sections(S, yLE, yTE, th, zc, n_side=26, m=16, tip_k=1.0):
    """closed airfoil loops across the span (x from -S to S) for a ray's body + wings; a = |x| / S"""
    secs = []
    stations = [-(1 - k / n_side) for k in range(n_side)] + [0.0] + [k / n_side for k in range(1, n_side + 1)]
    for s in stations:
        a = abs(s)
        x = s * S
        y0, y1 = yLE(a), yTE(a)
        ym, hc = (y0 + y1) / 2, max(0.03, (y0 - y1) / 2)
        t, z0 = th(a), zc(a)
        loop = []
        for k in range(m):
            ph = TAU * k / m
            c, sn = math.cos(ph), math.sin(ph)
            # thicker toward the leading edge
            loop.append((x, ym + hc * c, z0 + 0.5 * t * sn * (1 + 0.3 * c)))
        secs.append(loop)
    return secs


def belly_mat(m):
    def f(s, e):
        ph = TAU * (e + 0.5) / m
        return 1 if math.sin(ph) < -0.25 else 0
    return f


RELIEF_JUP = {
    "ray_skin": [("wrinkle", 0.012, 0.4, (3, 1, 3)), ("pores", 0.004, 0.08, 0.3), ("scales", 0.003, 0.12), ("noise", 0.01, 1.0)],
    "ray_belly": [("wrinkle", 0.01, 0.3, (4, 1, 1)), ("pores", 0.003, 0.06, 0.3)],
    "ray_tent": [("wrinkle", 0.008, 0.15, (1, 4, 1)), ("pores", 0.002, 0.05, 0.3)],
    "ray_lip": [("wrinkle", 0.01, 0.12), ("pores", 0.003, 0.05, 0.3)],
    "puff_bladder": [("veins", 0.006, 0.6, 0.03), ("wrinkle", 0.006, 0.2, (1, 1, 3)), ("pores", 0.002, 0.05, 0.3)],
    "puff_spore": [("veins", 0.003, 0.3, 0.04), ("pores", 0.002, 0.04, 0.3)],
    "floater_bag": [("wrinkle", 0.015, 0.6, (1, 1, 3)), ("veins", 0.006, 1.5, 0.02), ("pores", 0.004, 0.15, 0.3)],
    "floater_shell": [("grooves", 0.008, 0.08, 0.05), ("wrinkle", 0.006, 0.08, (4, 1, 4))],
    "floater_tendril": [("wrinkle", 0.006, 0.1, (1, 1, 5))],
    "hunter_bag": [("wrinkle", 0.025, 1.2, (3, 1, 3)), ("scales", 0.006, 0.35), ("pores", 0.008, 0.25, 0.3)],
    "hunter_groove": [("wrinkle", 0.02, 0.6)],
    "hunter_crest": [("vesicles", 0.03, 0.5, 0.3), ("wrinkle", 0.015, 0.6)],
    "hunter_fin": [("wrinkle", 0.01, 0.8, (1, 0.3, 1)), ("veins", 0.006, 1.2, 0.03)],
    "hunter_body": [("wrinkle", 0.02, 0.3), ("pores", 0.008, 0.12, 0.3), ("scales", 0.005, 0.2)],
    "hunter_feather": [("wrinkle", 0.004, 0.2, (1, 1, 4))],
}
for _k, _v in RELIEF_JUP.items():
    if _k in PAINT:
        PAINT[_k]["relief"] = _v


# ================================================================================================ floater (photo 5)
def floater():
    kit.reset()
    root = empty("Floater")
    rng = random.Random(5)
    sk = Skeleton()
    sk.add("bag", (0, 0, -6), (0, 0, 10))
    N = 28
    RR, HT, HB, DT, DB = 20.0, 15.0, 13.0, 3.6, 5.0

    def lobe(th):
        return abs(math.sin(N * th / 2)) ** 0.45

    def Pf(th, ph):
        k = 0.86 + 0.14 * lobe(th)
        r = RR * math.sin(ph) ** 0.8 * k
        cz = math.cos(ph)
        z = (HT * cz - DT * math.exp(-(ph / 0.42) ** 2)) if cz > 0 else (HB * cz + DB * math.exp(-((PI - ph) / 0.42) ** 2))
        z *= 0.97 + 0.03 * lobe(th)
        # thin-skin wrinkles running along each lobe, strongest near the groove
        w = 0.035 * math.sin(th * N * 7 + 3 * math.sin(ph * 5)) * (1 - lobe(th)) * math.sin(ph)
        return (r * (1 + w * 0.02) * math.cos(th), r * (1 + w * 0.02) * math.sin(th), z)

    nu, nv = N * 6, 46
    bag = grid("bag", lambda i, j: Pf(TAU * i / nu, PI * (j + 1) / (nv + 1)), nu, nv, ("floater_bag",),
               poles=(Pf(0, 0), Pf(0, PI)))
    parts = [Part(bag, bone="bag")]
    # spiral shells on the lower bulge of every lobe
    for k in range(N):
        th = TAU * (k + 0.5) / N
        ph = PI * 0.62
        p, n = surf_normal(Pf, th, ph)
        if n.dot(V((math.cos(th), math.sin(th), 0))) < 0:
            n = -n
        U = (V(Pf(th + 1e-3, ph)) - p).normalized()
        W = n.cross(U).normalized()
        A = 3.6 * PI
        rho0, rho1 = 0.08, 1.55
        b = math.log(rho1 / rho0) / A
        pts, rad = [], []
        for i in range(28):
            a = A * i / 27
            rho = rho0 * math.exp(b * a)
            tr = 0.44 * rho
            pts.append(p + (U * math.cos(a) + W * math.sin(a)) * rho + n * (tr * 0.55))
            rad.append(tr)
        parts.append(Part(tube_r(f"shell{k}", pts, rad, "floater_shell", seg=6), bone="bag"))
    # the tendril bundle from the lower navel: twisted together, fraying toward the ends
    chains = []
    for c in range(3):
        a = TAU * c / 3
        path = [(math.cos(a + 0.4 * s) * (0.9 + 1.2 * s * s), math.sin(a + 0.4 * s) * (0.9 + 1.2 * s * s), -6.2 - 21 * s) for s in [i / 4 for i in range(5)]]
        chains.append(sk.chain(f"t{'ABC'[c]}", path, "bag"))
    for k in range(20):
        a0 = TAU * k / 20 + rng.uniform(-0.1, 0.1)
        L = 18 + rng.uniform(0, 9)
        z0 = Pf(0, PI - 0.06)[2] + 0.4
        pts = []
        for i in range(16):
            s = i / 15
            rb = 2.0 * (1 - s) ** 2 + 0.7 + 2.2 * s ** 2.2
            a = a0 + 1.7 * s + 0.25 * math.sin(s * 9 + k)
            pts.append((math.cos(a) * rb + 0.2 * math.sin(s * 13 + k * 1.7), math.sin(a) * rb, z0 - L * s))
        ch = chains[k % 3]
        parts.append(Part(ringed(f"tendril{k}", pts, lambda t: 0.26 * (1 - t) + 0.05, "floater_tendril", rings=24, groove=0.12, seg=7, samples=80), bones=ch + ["bag"]))
    body = assemble("floater_body", sk, parts)
    arm = finish_creature(root, sk, body, os.path.join(kit.out_dir(), "fauna_floater.glb"), props={"creature": "floater", "radius": RR}, ao=6.0, paint=4096, nsize=2048)
    return root, arm


def ray_details(rng, ex, ey, ez, belly_z, gill_x0):
    """eyes with corneas set in sockets, spiracles behind them, a dorsal ridge of low knobs, five pairs of gill slits
    on the underside"""
    from organic import eye as oeye, tube as otube
    out = []
    det = []
    for sx in (-1, 1):
        det.append(oeye(f"eye{sx}", V((sx * ex, ey, ez - 0.05)), V((sx * 0.7, 0.6, 0.4)), 0.2, "ray_eye", cornea_m="cornea", pupil=(0.45, 0.9), slit_axis=(0, 0, 1)))
        det.append(kit.sphere(f"spir{sx}", 0.16, loc=(sx * (ex + 0.15), ey - 1.1, ez - 0.02), m="ray_gill", segs=10, rings=6, scale=(1, 1.5, 0.35)))
    out.append(Part(kit.merge(det, "headdet"), bone="head"))
    ridge = [fang(f"rk{k}", V((0, 2.2 - 0.6 * k, ez + 0.35 - 0.03 * k)), V((0, -0.6, 1)), V((0, -1, 0)), 0.22 - 0.015 * k, 0.1 - 0.005 * k, curve=0.3, m="ray_lip", seg=6, n=4) for k in range(9)]
    out.append(Part(kit.merge(ridge, "ridge"), bones=["body", "head"]))
    gills = []
    for sx in (-1, 1):
        for k in range(5):
            y = 1.4 - 0.42 * k
            x0 = sx * (gill_x0 + 0.05 * k)
            pts = [V((x0, y + 0.15, belly_z)), V((x0 + sx * 0.18, y, belly_z - 0.04)), V((x0 + sx * 0.32, y - 0.2, belly_z - 0.02))]
            gills.append(otube(f"gill{sx}{k}", pts, [0.05, 0.06, 0.04], "ray_gill", seg=5))
    out.append(Part(kit.merge(gills, "gills"), bone="body"))
    return out


# ================================================================================================ veil ray (photo 4, left)
def ray_skeleton(sk, S, tipY, midY):
    sk.add("body", (0, -3.2, 0), (0, 1.8, 0))
    sk.add("head", (0, 1.8, 0), (0, 4.2, 0), "body")
    for sx, s in ((-1, "L"), (1, "R")):
        sk.add(f"wing{s}1", (sx * 1.8, 0.0, 0.2), (sx * S * 0.55, midY, 0.5), "body")
        sk.add(f"wing{s}2", (sx * S * 0.55, midY, 0.5), (sx * S, tipY, 0.3), f"wing{s}1")


def veilray():
    kit.reset()
    root = empty("VeilRay")
    rng = random.Random(21)
    S = 12.0
    sk = Skeleton()
    ray_skeleton(sk, S, -5.4, 0.2)

    def yLE(a):
        if a < 0.17:
            return 2.6 + 1.7 * math.sqrt(max(0.0, 1 - (a / 0.17) ** 2))
        w = (a - 0.17) / 0.83
        return 2.6 + 1.6 * math.sin(0.8 * PI * w) * (1 - w) ** 0.3 - 8.0 * w ** 2.2

    def yTE(a):
        if a < 0.17:
            return -3.6 + 0.6 * (a / 0.17) ** 2
        w = (a - 0.17) / 0.83
        return -3.0 + 1.2 * math.sin(PI * w) * (1 - w) ** 0.5 - 2.6 * w ** 2

    th = lambda a: 0.04 + 0.42 * (1 - a) ** 1.3 + 1.5 * max(0.0, 1 - (a / 0.2) ** 2) ** 1.5
    zc = lambda a: 0.8 * a - 2.6 * max(0.0, a - 0.6) ** 2
    m = 16
    secs = manta_sections(S, yLE, yTE, th, zc, m=m)
    wing = kit.loft("veil_wing", secs, mats=("ray_skin", "ray_belly"), face_mats=belly_mat(m))
    kit.smooth(wing, 70)
    parts = [Part(wing, bones=["body", "head", "wingL1", "wingL2", "wingR1", "wingR2"])]
    parts += ray_details(rng, 0.95, 3.45, 0.42, -0.55, 0.78)
    # the curtain: eight tentacles from the underside of the body, trailing back and down
    for k in range(8):
        u = (k - 3.5) / 3.5
        base = V((u * 1.75, -1.4 - 0.9 * (1 - u * u), -0.55))
        d = V((u * 0.42, -1.0, -0.45)).normalized()
        L = 20.5 - 4.0 * abs(u) + rng.uniform(-1, 1)
        side = V((1, 0, 0))
        path = []
        for i in range(16):
            s = i / 15
            # splaying out into a bell, the ends curling
            p = base + d * (L * s) + side * (u * 1.4 * s * s + 0.5 * math.sin(s * 5.5 + k * 1.3) * s + 1.1 * math.sin(s * 9 + k) * s ** 3) + V((0, 0, -1.4 * s * s))
            path.append(p)
        ch = chain_along(sk, f"tent{k}", path, 4, "body")
        r0 = 0.5 - 0.14 * abs(u)
        parts.append(Part(ringed(f"tent{k}m", path, lambda t, r0=r0: r0 * (1 - t) ** 1.1 + 0.03, "ray_tent", rings=30, groove=0.07, seg=10, samples=120), bones=ch + ["body"]))
    body = assemble("veilray_body", sk, parts)
    arm = finish_creature(root, sk, body, os.path.join(kit.out_dir(), "fauna_veilray.glb"), props={"creature": "veilray", "span": 2 * S}, ao=2.5, paint=4096, nsize=2048)
    return root, arm


# ================================================================================================ maw ray (photo 4, middle)
def mawray():
    kit.reset()
    root = empty("MawRay")
    rng = random.Random(22)
    S = 11.0
    sk = Skeleton()
    ray_skeleton(sk, S, -4.6, 0.6)
    sk.add("mouth", (0, 2.2, -1.0), (0, 2.5, -2.2), "body")
    for sx, s in ((-1, "L"), (1, "R")):
        sk.add(f"pelv{s}", (sx * 1.9, -3.4, -0.3), (sx * 3.3, -5.1, -0.5), "body")

    def yLE(a):
        if a < 0.26:
            return 2.9 + 1.8 * math.sqrt(max(0.0, 1 - (a / 0.26) ** 2))
        w = (a - 0.26) / 0.74
        return 2.9 + 1.3 * math.sin(0.8 * PI * w) * (1 - w) ** 0.3 - 7.5 * w ** 2.1

    def yTE(a):
        if a < 0.26:
            return -4.2 + 0.9 * (a / 0.26) ** 2
        w = (a - 0.26) / 0.74
        return -3.3 + 1.4 * math.sin(PI * w) * (1 - w) ** 0.5 - 1.5 * w ** 2

    th = lambda a: 0.05 + 0.5 * (1 - a) ** 1.2 + 2.0 * max(0.0, 1 - (a / 0.28) ** 2) ** 1.4
    zc = lambda a: 0.5 * a - 3.0 * max(0.0, a - 0.55) ** 2
    m = 18
    secs = manta_sections(S, yLE, yTE, th, zc, m=m)
    wing = kit.loft("maw_wing", secs, mats=("ray_skin", "ray_belly"), face_mats=belly_mat(m))
    kit.smooth(wing, 70)
    parts = [Part(wing, bones=["body", "head", "wingL1", "wingL2", "wingR1", "wingR2"])]
    parts += ray_details(rng, 1.05, 3.7, 0.62, -0.7, 0.85)
    # the sucker on the underside: a thick lip, a dark throat funnel, three rings of hooked teeth
    nrm = V((0, 0.3, -0.95)).normalized()
    ctr = V((0, 2.2, -1.12))
    lip = kit.torus("lip", 1.28, 0.26, m="ray_lip", seg=32, rseg=10)
    parts.append(Part(orient(lip, nrm, ctr), bone="mouth"))
    throat = kit.lathe("throat", [(1.2, 0.05), (0.9, -0.35), (0.55, -0.85), (0.2, -1.3), (0.0, -1.4)], m="maw_throat", seg=28)
    parts.append(Part(orient(throat, nrm, ctr), bone="mouth"))
    teeth = []
    for ring, (rr, dz, n, L) in enumerate(((1.08, -0.05, 18, 0.42), (0.8, -0.38, 14, 0.36), (0.52, -0.72, 10, 0.3))):
        for k in range(n):
            a = TAU * (k + 0.5 * ring) / n
            c, s = math.cos(a), math.sin(a)
            p0 = V((c * rr, s * rr, dz))
            inw = V((-c, -s, 0))
            pts = [p0, p0 + inw * (L * 0.5) + V((0, 0, 0.12)), p0 + inw * L + V((0, 0, -0.08))]
            teeth.append(tube_tapered(f"tooth{ring}_{k}", pts, 0.07, 0.01, "tooth", seg=5))
    tobj = kit.merge(teeth, "teeth")
    parts.append(Part(orient(tobj, nrm, ctr), bone="mouth"))
    # pelvic lobes
    for sx, s in ((-1, "L"), (1, "R")):
        b0, b1 = sk.seg(f"pelv{s}")
        parts.append(Part(blade(f"pelv{s}m", b0, b1, 1.15, (0, 0, 1), "ray_skin", thick=0.22, n=8, taper=0.4), bone=f"pelv{s}"))
    # the whip tail: a long gentle S
    path = []
    for i in range(18):
        s = i / 17
        path.append(V((1.1 * math.sin(TAU * 0.85 * s) * s, -3.9 - 18.0 * s, -0.25 * s - 0.4 * s * s)))
    ch = chain_along(sk, "tail", path, 6, "body")
    parts.append(Part(ringed("tailm", path, lambda t: 0.6 * (1 - t) ** 1.2 + 0.035, "ray_skin", rings=40, groove=0.05, seg=12, samples=160), bones=ch + ["body"]))
    # a low row of dermal knobs down the tail's first third
    knobs = [fang(f"tk{i}", path[i] + V((0, 0, 0.45 * (1 - i / 17) ** 1.2)), V((0, -0.4, 1)), V((0, -1, 0)), 0.25 * (1 - i / 8), 0.08 * (1 - i / 9), curve=0.3, m="ray_lip", seg=6, n=4) for i in range(1, 7)]
    parts.append(Part(kit.merge(knobs, "tailknobs"), bones=ch[:3]))
    body = assemble("mawray_body", sk, parts)
    arm = finish_creature(root, sk, body, os.path.join(kit.out_dir(), "fauna_mawray.glb"), props={"creature": "mawray", "span": 2 * S}, ao=2.5, paint=4096, nsize=2048)
    return root, arm


# ================================================================================================ spore bulb (photo 4, right)
def sporebulb():
    kit.reset()
    root = empty("SporeBulb")
    rng = random.Random(33)
    sk = Skeleton()
    sk.add("bulb", (0, 0, 0.3), (0, 0, 6.4))
    N = 9

    def Pb(th, t):
        k = 0.8 + 0.2 * abs(math.sin(N * (th + 0.15 * t) / 2)) ** 0.45
        k += 0.012 * math.sin(th * 41 + t * 30) * math.sin(PI * t)  # fine veins and wrinkles
        r = 3.35 * math.sin(PI * t ** 0.85) ** (0.72 if t < 0.5 else 0.9) * (1 - 0.1 * t) * k
        z = 0.3 + 6.15 * t
        return (r * math.cos(th), r * math.sin(th), z)

    nu, nv = N * 14, 48
    bulb = grid("bulb", lambda i, j: Pb(TAU * i / nu, (j + 1) / (nv + 1)), nu, nv, ("puff_bladder",), poles=(Pb(0, 0), Pb(0, 1)))
    parts = [Part(bulb, bone="bulb")]
    # the collar of spore sacs around the base
    sacs = []
    for k in range(15):
        a = TAU * k / 15 + rng.uniform(-0.1, 0.1)
        rs = rng.uniform(0.55, 1.15)
        rr = 2.55 + rs * 0.6
        z = 0.75 + rng.uniform(-0.35, 0.45) + (0.0 if rs > 0.8 else 0.5)
        sacs.append(kit.sphere(f"sac{k}", rs, loc=(math.cos(a) * rr, math.sin(a) * rr, z), m="puff_spore", segs=18, rings=10))
    for k in range(6):  # a few smaller ones tucked between, under the rim
        a = TAU * (k + 0.5) / 6 + rng.uniform(-0.2, 0.2)
        rs = rng.uniform(0.35, 0.55)
        sacs.append(kit.sphere(f"sacs{k}", rs, loc=(math.cos(a) * 2.2, math.sin(a) * 2.2, 0.0), m="puff_spore", segs=12, rings=8))
    parts.append(Part(kit.merge(sacs, "sacs"), bone="bulb"))
    chains = []
    for c in range(3):
        a = TAU * c / 3
        chains.append(sk.chain(f"s{'ABC'[c]}", [(math.cos(a) * 1.2, math.sin(a) * 1.2, 0.3 - 3.3 * i) for i in range(5)], "bulb"))
    for k in range(28):
        a = rng.uniform(0, TAU)
        rr = 0.4 + 2.2 * math.sqrt(rng.random())
        L = 8.5 + rng.uniform(0, 5.5) * (1.2 - rr / 2.6)
        pts = []
        for i in range(10):
            s = i / 9
            pts.append((math.cos(a) * (rr + 0.6 * s) + 0.18 * math.sin(s * 8 + k), math.sin(a) * (rr + 0.6 * s), 0.35 - L * s))
        best = min(range(3), key=lambda c: (math.cos(TAU * c / 3) - math.cos(a)) ** 2 + (math.sin(TAU * c / 3) - math.sin(a)) ** 2)
        thick = 0.095 if k % 3 else 0.14
        parts.append(Part(tube_tapered(f"st{k}", pts, thick, 0.015, "puff_tendril", seg=5), bones=chains[best] + ["bulb"]))
    # fine hair-like tendrils between the main ones
    fines = []
    for k in range(40):
        a = rng.uniform(0, TAU)
        rr = 0.6 + 2.0 * math.sqrt(rng.random())
        L = 5 + rng.uniform(0, 6)
        pts = [(math.cos(a) * (rr + 0.4 * s) + 0.25 * math.sin(s * 9 + k), math.sin(a) * (rr + 0.4 * s), 0.3 - L * s) for s in [i / 7 for i in range(8)]]
        fines.append((tube_tapered(f"sf{k}", pts, 0.035, 0.008, "puff_tendril", seg=3), a))
    for c in range(3):
        sel = [o for (o, a) in fines if min(range(3), key=lambda q: (math.cos(TAU * q / 3) - math.cos(a)) ** 2 + (math.sin(TAU * q / 3) - math.sin(a)) ** 2) == c]
        if sel:
            parts.append(Part(kit.merge(sel, f"fines{c}"), bones=chains[c] + ["bulb"]))
    body = assemble("sporebulb_body", sk, parts)
    arm = finish_creature(root, sk, body, os.path.join(kit.out_dir(), "fauna_sporebulb.glb"), props={"creature": "sporebulb", "height": 6.4}, ao=1.0, paint=1024)
    return root, arm


# ================================================================================================ balloon hunter (photo 6)
def hunter():
    kit.reset()
    root = empty("Hunter")
    rng = random.Random(44)
    sk = Skeleton()
    LB, RB, N = 32.0, 16.0, 11
    sk.add("bag", (0, -LB, 0), (0, LB, 0))
    sk.add("crown", (0, LB - 4, 0), (0, LB + 2, 0), "bag")

    def lobe(th):
        return abs(math.sin(N * th / 2)) ** 0.5

    def Ph(th, t):
        u = 2 * t - 1
        r = RB * max(0.0, 1 - u * u) ** (0.5 if u > 0 else 0.7) * (0.95 + 0.1 * t) * (0.88 + 0.12 * lobe(th))
        return (r * math.cos(th), -LB + 2 * LB * t, r * math.sin(th) * 0.96)

    nu, nv = N * 8, 64
    TH = lambda i: TAU * i / nu + PI / N
    bag = grid("bag", lambda i, j: Ph(TH(i), (j + 1) / (nv + 1)), nu, nv, ("hunter_bag", "hunter_groove"),
               mat_fn=lambda i, j: 1 if lobe(TH(i) + TAU / nu / 2) < 0.62 else 0, poles=(Ph(0, 0), Ph(0, 1)))
    parts = [Part(bag, bone="bag")]
    # rear fins: two swept horizontal blades and a ventral one, pale and pointed
    for sx, s in ((-1, "L"), (1, "R")):
        sk.add(f"fin{s}", (sx * 3.0, -LB + 7, 1.5), (sx * 13, -LB - 7, 3.0), "bag")
        b0, b1 = sk.seg(f"fin{s}")
        parts.append(Part(blade(f"fin{s}m", b0, b1, 9.5, (0, 0.15, 1), "hunter_fin", thick=1.1, n=12, curve=1.0, taper=0.7), bone=f"fin{s}"))
    parts.append(Part(blade("finV", (0, -LB + 8, -4), (0, -LB - 6, -12), 7.5, (1, 0, 0), "hunter_fin", thick=0.9, n=10, curve=0.7, taper=0.7), bone="bag"))
    # the porous crest over the rear top
    def Pc(i, j, nu_c=26, nv_c=22):
        th = PI * (0.16 + 0.68 * i / (nu_c - 1))
        t = 0.02 + 0.46 * j / (nv_c - 1)
        bump = math.sin(PI * i / (nu_c - 1)) * math.sin(PI * j / (nv_c - 1)) ** 0.5
        p = V(Ph(th, t))
        ax = V((0, p.y, 0))
        return tuple(ax + (p - ax) * (1.0 + 0.07 * bump + 0.004))
    crest = grid("crest", Pc, 26, 22, ("hunter_crest",), wrap_u=False)
    parts.append(Part(crest, bone="bag"))
    pores = []
    for j in range(2, 20, 2):
        for i in range(2, 24, 2):
            ii = i + (1 if (j // 2) % 2 else 0) + rng.uniform(-0.3, 0.3)
            if ii > 24:
                continue
            p = V(Pc(ii, j))
            n = (V(Pc(ii + 0.01, j)) - p).cross(V(Pc(ii, j + 0.01)) - p).normalized()
            if n.dot(p - V((0, p.y, 0))) < 0:
                n = -n
            pores.append((tuple(p + n * 0.05), tuple(n)))
    parts.append(Part(spots("pore", pores, 0.62, "hunter_pore"), bone="bag"))
    # the blue organ at the nose, the whisker crown around it
    org = kit.sphere("organ", 3.1, loc=(0, LB - 1.6, -1.8), m="hunter_organ", segs=24, rings=14, scale=(1.0, 0.7, 0.9))
    parts.append(Part(org, bone="crown"))
    whisk = []
    tw = 0.93
    for k in range(20):
        th = TAU * k / 20 + rng.uniform(-0.08, 0.08)
        p0 = V(Ph(th, tw))
        rad = (p0 - V((0, p0.y, 0))).normalized()
        f = V((0, 1, 0))
        L = rng.uniform(11, 16)
        pts = [p0 - rad * 0.3, p0 + rad * (L * 0.2) + f * (L * 0.12), p0 + rad * (L * 0.5) + f * (L * 0.06),
               p0 + rad * (L * 0.75) - f * (L * 0.12), p0 + rad * (L * 0.9) - f * (L * 0.35)]
        whisk.append(tube_tapered(f"wh{k}", pts, 0.2, 0.03, "hunter_whisker", seg=5))
    parts.append(Part(kit.merge(whisk, "whiskers"), bone="crown"))
    # cord anchors along the belly (runtime cords run from these to the pod)
    anchors = []
    for t in (0.3, 0.38, 0.46, 0.54, 0.62, 0.7):
        for dth in (-0.38, 0.0, 0.38):
            if dth == 0.0 and t in (0.38, 0.62):
                continue
            p = V(Ph(-PI / 2 + dth, t)) * 0.985
            anchors.append(p)
    # ---- the hunter pod, hanging under the rear half
    PS = 2.0
    Cp = V((0, -4, -38))
    sk.add("pod", tuple(Cp + V((0, 0, 1.5 * PS))), tuple(Cp + V((0, 0, -1.5 * PS))))
    P = lambda x, y, z: tuple(Cp + V((x, y, z)) * PS)
    ell = lambda co, size: ("ELLIPSOID", co, PS, size)
    head = meta("pod_head", [ell(P(0, 0, 0), (2.4, 2.6, 2.1)), ell(P(0, 1.5, 0.85), (2.1, 1.2, 0.9)), ell(P(0, 1.1, -1.25), (1.5, 1.4, 1.0)),
                             ell(P(0, -1.6, -0.6), (1.7, 1.6, 1.5))], "hunter_body", res=0.2)
    parts.append(Part(decimate(head, 0.5), bone="pod"))
    # six eyes: two big ones in front, two at the sides, two small on top
    for (x, y, z, r, n) in ((1.05, 2.15, 0.3, 0.98, (0.3, 1, 0.15)), (-1.05, 2.15, 0.3, 0.98, (-0.3, 1, 0.15)),
                            (1.85, 1.55, 0.95, 0.5, (0.8, 0.6, 0.3)), (-1.85, 1.55, 0.95, 0.5, (-0.8, 0.6, 0.3)),
                            (0.75, 1.3, 1.62, 0.33, (0.3, 0.5, 1)), (-0.75, 1.3, 1.62, 0.33, (-0.3, 0.5, 1))):
        c = V(P(x, y, z))
        nn = V(n).normalized()
        parts.append(Part(kit.sphere(f"scl{x}{z}", r * PS, loc=tuple(c), m="hunter_sclera", segs=16, rings=10), bone="pod"))
        ir = kit.torus(f"iris{x}{z}", r * PS * 0.52, r * PS * 0.2, m="hunter_iris", seg=24, rseg=6)
        ir.scale = (1, 1, 0.5)
        parts.append(Part(orient(ir, nn, c + nn * (r * PS * 0.9)), bone="pod"))
        parts.append(Part(kit.sphere(f"pup{x}{z}", r * PS * 0.36, loc=tuple(c + nn * (r * PS * 0.78)), m="claw_black", segs=12, rings=8, scale=(1, 1, 0.7)), bone="pod"))
        # a heavy lid of skin over each eye
        lid = kit.sphere(f"lid{x}{z}", r * PS * 1.08, loc=tuple(c + V((0, 0, r * PS * 0.32)) - nn * (r * PS * 0.12)), m="hunter_body", segs=16, rings=8, scale=(1, 1, 0.55))
        parts.append(Part(lid, bone="pod"))
    # the mouth slit under the eyes, with a row of small teeth
    parts.append(Part(kit.sphere("slit", 1.0, loc=P(0, 2.05, -1.25), m="mouth_red", segs=16, rings=8, scale=(0.95 * PS, 0.35 * PS, 0.22 * PS)), bone="pod"))
    tth = []
    for k in range(9):
        x = (k - 4) * 0.2
        p0 = V(P(x, 2.22, -1.1))
        tth.append(tube_tapered(f"pt{k}", [p0, p0 + V((0, 0.05, -0.35)) * PS], 0.06 * PS, 0.008, "tooth", seg=5))
    parts.append(Part(kit.merge(tth, "podteeth"), bone="pod"))
    # pale speckles over the crown of the pod
    sp = []
    for k in range(34):
        a = rng.uniform(-PI * 0.8, PI * 0.8)
        b = rng.uniform(0.25, 1.0)
        n = V((math.sin(a) * math.cos(b * 0.5), math.cos(a) * 0.5 - 0.3, math.sin(b * 1.3))).normalized()
        p = V(P(0, -0.2, 0.2)) + V((n.x * 2.3, n.y * 2.5, n.z * 2.0)) * (PS * 0.93)
        sp.append((tuple(p), tuple(n)))
    parts.append(Part(spots("speck", sp, 0.13 * PS, "tooth"), bone="pod"))
    # warts and lumps over the mantle
    warts = []
    for k in range(22):
        a = rng.uniform(-PI, PI)
        b = rng.uniform(-0.3, 1.0)
        n = V((math.sin(a) * math.cos(b), math.cos(a) * math.cos(b) - 0.2, math.sin(b))).normalized()
        p = V(P(0, -0.2, 0.1)) + V((n.x * 2.25, n.y * 2.45, n.z * 1.95)) * PS
        warts.append(kit.sphere(f"wart{k}", rng.uniform(0.18, 0.42) * PS, loc=tuple(p), m="hunter_body", segs=10, rings=6))
    parts.append(Part(kit.merge(warts, "warts"), bone="pod"))
    # feathered tentacles: pale shafts with barbs on both sides, fanning down and back
    for k in range(6):
        u = (k - 2.5) / 2.5
        base = V(P(u * 1.3, -0.9 + 0.5 * abs(u), -1.6))
        d = V((u * 0.55, -0.45, -1.0)).normalized()
        L = (14.5 - 2.5 * abs(u) + rng.uniform(-0.8, 0.8)) * PS
        path = []
        for i in range(14):
            s = i / 13
            path.append(base + d * (L * s) + V((0.25 * math.sin(s * 6 + k), -0.9 * s * s, 0)) * PS)
        ch = chain_along(sk, f"feat{k}", path, 3, "pod")
        parts.append(Part(tube_r(f"feat{k}m", path, [0.45 * PS * (1 - i / 13) ** 1.1 + 0.06 for i in range(14)], "hunter_feather", seg=6), bones=ch + ["pod"]))
        bm = bmesh.new()
        for i in range(2, 13):
            for half in (0, 1):
                s = (i + 0.5 * half) / 13
                j = min(12, int(s * 13))
                f = s * 13 - j
                p = path[j].lerp(path[j + 1], f)
                t = (path[j + 1] - path[j]).normalized()
                side = t.cross(V((0, 0, 1))).normalized() if abs(t.z) < 0.95 else V((1, 0, 0))
                Lb = (2.0 - 1.2 * s) * PS
                for sg in (-1, 1):
                    sd = side * sg
                    w = 0.05 * PS
                    q0 = p
                    q1 = p + sd * (Lb * 0.55) + t * (Lb * 0.18)
                    q2 = p + sd * Lb + t * (Lb * 0.5) + V((0, 0, -0.2 * Lb))
                    vs = [bm.verts.new(q0 - t * w), bm.verts.new(q0 + t * w), bm.verts.new(q1 + t * w * 0.7), bm.verts.new(q1 - t * w * 0.7), bm.verts.new(q2)]
                    bm.faces.new((vs[0], vs[1], vs[2], vs[3]))
                    bm.faces.new((vs[3], vs[2], vs[4]))
        parts.append(Part(from_bmesh(f"barbs{k}", bm, ("hunter_feather",)), bones=ch))
    body = assemble("hunter_body", sk, parts)
    arm = finish_creature(root, sk, body, os.path.join(kit.out_dir(), "fauna_hunter.glb"), ao=6.0, paint=4096, nsize=2048, props={
        "creature": "hunter", "length": 2 * LB,
        # Blender (x, y, z) → glTF (x, z, −y): the runtime reads model-space anchors
        "anchors": ";".join(f"{p.x:.2f},{p.z:.2f},{-p.y:.2f}" for p in anchors),
        "pod": f"{Cp.x:.2f},{Cp.z:.2f},{-Cp.y:.2f}", "podTop": f"{(1.9 * PS):.2f}"})
    return root, arm


# ================================================================================================ previews
def preview_pose(name, cam, target, lens=40, world=(0.55, 0.62, 0.72), up=None, sun=(0.5, -0.6, 0.7)):
    kit.preview(os.path.join(kit.preview_dir(), f"{name}.png"), cam, target, lens=lens, samples=16, world=world, sun=sun, sun_strength=3.5, up=up)


if __name__ == "__main__":
    which = [a for a in sys.argv[1:] if not a.startswith("--")] or ["floater", "veilray", "mawray", "sporebulb", "hunter"]
    prev = "--nopreview" not in sys.argv
    for w in which:
        root, arm = globals()[w]()
        if not prev:
            continue
        if w == "floater":
            preview_pose("fauna_floater", (62, -58, 6), (0, 0, -6), lens=30, world=(0.5, 0.7, 0.7))
            preview_pose("fauna_floater_below", (40, -40, -60), (0, 0, -6), lens=30, world=(0.5, 0.7, 0.7))
        elif w in ("veilray", "mawray"):
            # the reference's view: from below, head up
            preview_pose(f"fauna_{w}", (0, -3, -44), (0, -3, 0), lens=35, world=(0.82, 0.84, 0.84), up=(0, 1, 0), sun=(0.2, -0.3, -0.9))
            preview_pose(f"fauna_{w}_34", (-26, 22, 14), (0, -4, -1), lens=35, world=(0.75, 0.68, 0.55))
        elif w == "sporebulb":
            preview_pose("fauna_sporebulb", (0, -30, 1), (0, 0, -0.5), lens=40, world=(0.82, 0.84, 0.84))
        else:
            preview_pose("fauna_hunter", (-125, -55, -25), (0, 0, -16), lens=32, world=(0.8, 0.6, 0.62))
            preview_pose("fauna_hunter_pod", (-14, 14, -36), (0, -4, -39), lens=35, world=(0.8, 0.6, 0.62))
