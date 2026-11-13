"""
Miller's Planet fauna (original speculative species from the player's concept images and design directive; own
geometry, no copies). See docs/MILLER_BIOSPHERE.md.
  ferracaris — small flat armoured grazer: head shield, seven overlapping segments with scalloped rear margins, tail
               plate, side flanges with a fringe of clear filaments, eleven pairs of short jointed legs beneath.
               A static mesh: colonies are instanced and the legs/fringe animate in the vertex shader.
  sedimentmaw — a buried, flattened suction predator: sand- and pebble-crusted back, a big round pleated funnel mouth
               with a fleshy rim, ringed digging limbs at the sides.
  mimic      — the Mimic Crawler: octopoid, shingled rock-mottled plates over mantle and limb tops, heavy brow plates over
               large gold eyes with slit pupils, eight armoured limbs with pink undersides, suckers, hooks, tip claws.
Blender +Y forward, +Z up.
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
from creature import Skeleton, Part, meta, blade, tube_tapered, spots, assemble, finish_creature, decimate
from fauna_jupiter import grid, tube_r, orient, chain_along, surf_normal

PI = math.pi
TAU = math.tau


def THREE_smooth(e0, e1, x):
    t = max(0.0, min(1.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


def export_static(root, path, props=None):
    if props:
        kit.set_props(root, **props)
    kit.select_tree(root)
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_apply=True, export_extras=True,
                              export_yup=True, export_animations=False, export_cameras=False, export_materials="EXPORT")
    print(f"[static] {path} {os.path.getsize(path) / 1e6:.2f} MB")


# ================================================================================================ ferracaris (image 10)
def ferracaris():
    """0.25 m adult, origin on the rock surface under the body centre, +Y forward"""
    kit.reset()
    root = empty("Ferracaris")
    rng = random.Random(12)
    L, W, Hh = 0.25, 0.165, 0.05
    parts = []

    def outline(t):
        """half-width of the body along its length (t 0 = tail, 1 = head): a broad oval"""
        tt = min(0.985, max(0.015, t))
        return W / 2 * math.sin(PI * tt) ** 0.5 * (0.96 + 0.06 * t)

    # segments from the tail plate (0) to the head shield (8): each plate domed, its margins bending down into a
    # skirt, its sides ending in rounded lobes, its rear edge scalloped and standing proud of the plate behind
    n = 9
    edges = [i / n for i in range(n + 1)]
    for k in range(n):
        t0, t1 = edges[k], edges[k + 1]
        y0, y1 = -L / 2 + L * t0, -L / 2 + L * t1
        head = k == n - 1
        tail = k == 0
        nu, nv = 30, 7
        lobes = 4 if not (head or tail) else 6

        def P(i, j, t0=t0, t1=t1, y0=y0, y1=y1, head=head, tail=tail, lobes=lobes, k=k):
            u = -1 + 2 * i / (nu - 1)
            v = j / (nv - 1)
            tt = t0 + (t1 - t0) * (0.5 + (v - 0.5) * (1 - 0.38 * abs(u) ** 3))
            hw = outline(tt) * 1.1
            x = u * hw
            scal = 0.011 * abs(math.sin((u + 1) * PI * lobes / 2)) ** 0.55 * (1 - v) ** 3
            span = (y1 - y0 + 0.006) * (1 - 0.38 * abs(u) ** 3)
            yc = (y0 + y1) / 2 - 0.003
            y = yc + (v - 0.5) * span - scal
            if head:
                y += 0.02 * (1 - u * u) * v ** 2
            if tail:
                y -= 0.018 * (1 - u * u) * (1 - v) ** 2
            au = abs(u)
            z = Hh * (1 - au * au) ** 0.6 * (0.78 + 0.22 * math.sin(PI * tt))
            z -= 0.012 * THREE_smooth(0.62, 1.0, au)
            z += 0.007 * (1 - v) ** 2  # the rear edge stands proud
            z += 0.002 * math.sin(u * 11 + k * 1.7) * (1 - au)
            return (x, y, z + 0.016)
        plate = grid(f"seg{k}", P, nu, nv, ("ferra_plate",), wrap_u=False)
        kit.add_solidify(plate, 0.0038, 0.0)
        kit.bake(plate)
        parts.append(plate)
        # pink rim along the rear margin and round the lobes
        rim = [tuple(V(P(i, 0)) + V((0, 0, 0.0015))) for i in range(nu)]
        parts.append(tube_tapered(f"rim{k}", rim, 0.0019, 0.0019, "ferra_rim", seg=4))
        # the fringe: a curtain of clear pink filaments under the skirt
        for side in (-1, 1):
            nf = 5 if not head else 9
            for f in range(nf):
                if head:
                    a = PI / 2 * (f + 0.5) / nf * side
                    hw = outline(0.97) * 1.1
                    base = V((math.sin(a) * hw * 1.05, y1 + 0.016 * math.cos(a), 0.006))
                    d = V((math.sin(a) * 0.8, math.cos(a) * 0.8, -0.6)).normalized()
                else:
                    tt = t0 + (t1 - t0) * (f + 0.5) / nf
                    hw = outline(tt) * 1.1
                    base = V((side * hw * 0.98, -L / 2 + L * tt, 0.004))
                    d = V((side * 0.75, -0.12, -0.65)).normalized()
                ln = 0.014 + 0.012 * rng.random()
                parts.append(tube_tapered(f"fr{k}{side}{f}", [base, base + d * (ln * 0.5), base + d * ln + V((0, 0, -0.002))], 0.0016, 0.0003, "ferra_fringe", seg=3))
    # tiny eye spots on the head shield
    for side in (-1, 1):
        parts.append(kit.sphere(f"eye{side}", 0.0035, loc=(side * 0.028, L / 2 - 0.006, 0.016 + Hh * 0.62), m="mimic_pupil", segs=8, rings=5))
    # legs: 11 pairs, two segments each, bent down to the rock; vertex colour marks the leg tips for the shader
    for k in range(11):
        tt = 0.12 + 0.76 * k / 10
        y = -L / 2 + L * tt
        hw = outline(tt)
        for side in (-1, 1):
            base = V((side * hw * 0.45, y, 0.012))
            knee = V((side * hw * 1.06, y + 0.004, 0.016))
            foot = V((side * hw * 1.22, y + 0.008, 0.0))
            parts.append(tube_tapered(f"leg{k}{side}", [base, knee, foot], 0.0028, 0.0012, "ferra_leg", seg=4))
    # the underside: a soft pale sole hiding the leg bases
    sole = kit.sphere("sole", 1.0, loc=(0, 0, 0.012), m="ferra_leg", segs=20, rings=8, scale=(W * 0.42, L * 0.45, 0.006))
    parts.append(sole)
    body = kit.merge(parts, "ferracaris_body")
    kit.smooth(body, 45)
    body.parent = root
    tris = sum(len(p.vertices) - 2 for p in body.data.polygons)
    print(f"[ferracaris] ~{tris} tris")
    export_static(root, os.path.join(kit.out_dir(), "fauna_ferracaris.glb"), {"creature": "ferracaris", "length": L})
    return root, None


# ================================================================================================ sediment maw (image 3)
def sedimentmaw():
    """2.4 m across; the sediment surface at z = 0 (the body mostly below it); mouth modelled open"""
    kit.reset()
    root = empty("SedimentMaw")
    rng = random.Random(23)
    sk = Skeleton()
    sk.add("body", (0, -0.6, -0.2), (0, 0.6, -0.2))
    MX, MY = 0.0, 0.12          # mouth centre
    RIM = 0.62                  # open rim radius
    sk.add("throat", (MX, MY, -0.1), (MX, MY, -0.75), "body")
    NL = 16
    for i in range(NL):
        a = TAU * i / NL
        c, sn = math.cos(a), math.sin(a)
        sk.add(f"lip{i}", (MX + c * RIM, MY + sn * RIM, 0.12), (MX + c * RIM, MY + sn * RIM, 0.32))
    lips = [f"lip{i}" for i in range(NL)]

    def back_z(x, y):
        """the crusted mound: low at the buried edge, rising into the crater lip round the mouth"""
        r = math.hypot(x / 1.25, (y - 0.02) / 1.08)
        dm = math.hypot(x - MX, y - MY)
        lip = 0.17 * math.exp(-((dm - (RIM + 0.06)) / 0.32) ** 2) if dm > RIM else 0.17
        return 0.2 * max(0.0, 1 - r * r) ** 0.8 - 0.06 + lip * min(1.0, max(0.0, 1 - r) * 4)

    parts = []
    # the back and the outer slope of the crater: radial muscle folds near the lip, a gravel crust beyond
    nu, nv = 120, 26
    def Pb(i, j):
        a = TAU * i / nu
        t = j / (nv - 1)            # 0 at the outer edge, 1 at the lip crest
        ox, oy = math.cos(a) * 1.25 * (1 + 0.06 * math.sin(a * 3 + 0.5)), math.sin(a) * 1.08 * (1 + 0.05 * math.sin(a * 5))
        ix, iy = MX + math.cos(a) * (RIM + 0.06), MY + math.sin(a) * (RIM + 0.06)
        x = ox + (ix - ox) * t
        y = oy + (iy - oy) * t
        z = back_z(x, y) - 0.22 * (1 - t) ** 3
        z += 0.035 * (abs(math.sin(a * 21)) ** 0.7 - 0.5) * t ** 2.5   # drawstring folds
        return (x, y, z)
    back = grid("back", Pb, nu, nv, ("maw_hide", "maw_lip"), mat_fn=lambda i, j: 1 if j > nv * 0.8 else 0)
    parts.append(Part(back, bones=["body"] + lips))
    # the funnel: fluted walls ringed with fine corrugations, running down into the dark gullet
    nf, nd = 144, 30
    def Pf(i, j):
        a = TAU * i / nf
        t = j / (nd - 1)            # 0 at the lip crest, 1 deep in the gullet
        flute = 0.04 * (1 - t * 0.5) * (abs(math.sin(a * 22)) ** 0.5 - 0.45)
        rings = 0.014 * math.sin(t * 70) * (1 - t)
        r = (RIM + 0.06) * (1 - t) ** 1.25 + 0.07 + flute + rings
        z = back_z(MX + math.cos(a) * (RIM + 0.06), MY + math.sin(a) * (RIM + 0.06)) + 0.02 - 1.1 * t ** 0.85
        return (MX + math.cos(a) * r, MY + math.sin(a) * r, z)
    fun = grid("funnel", Pf, nf, nd, ("maw_lip", "maw_gullet"), mat_fn=lambda i, j: 1 if j > nd * 0.5 else 0, poles=(None, (MX, MY, -0.95)))
    parts.append(Part(fun, bones=lips + ["throat"]))
    # gravel and sand grains cemented to the back, dense
    peb = []
    for k in range(700):
        a = rng.uniform(0, TAU)
        t = rng.random() ** 0.8
        rr = (RIM + 0.28) + t * 0.6
        x = MX + math.cos(a) * rr
        y = MY + math.sin(a) * rr * 0.86 - 0.04
        if math.hypot(x / 1.25, y / 1.08) > 0.98:
            continue
        r = rng.uniform(0.01, 0.04) * (1.6 if rng.random() < 0.1 else 1)
        z = back_z(x, y) - 0.22 * max(0.0, (rr - RIM - 0.06) / 0.7) ** 3 + r * 0.25
        peb.append(kit.sphere(f"p{k}", r, loc=(x, y, z), m="maw_pebble" if rng.random() < 0.55 else "maw_hide", segs=6, rings=4, scale=(1, 0.8 + 0.4 * rng.random(), 0.5)))
    parts.append(Part(kit.merge(peb, "pebbles"), bones=["body"] + lips))
    # two breathing valves at the back (water exchange while buried)
    for sx in (-1, 1):
        x, y = sx * 0.34, -0.82
        v = kit.torus(f"valve{sx}", 0.06, 0.025, loc=(x, y, back_z(x, y) - 0.03), m="maw_lip", seg=16, rseg=6)
        v.scale = (1.0, 0.55, 0.6)
        parts.append(Part(v, bone="body"))
    # ringed digging limbs, like stubby fingers: out from under the edge and gripping down into the sediment
    for sx, s in ((-1, "L"), (1, "R")):
        for k in range(3):
            a_side = (-0.55 + 0.5 * k) + rng.uniform(-0.08, 0.08)
            ang = a_side if sx > 0 else PI - a_side
            out = V((math.cos(ang), math.sin(ang) * 0.9, 0)).normalized()
            base = V((math.cos(ang) * 1.05, math.sin(ang) * 0.9, -0.08))
            L = 0.7 + 0.25 * rng.random()
            path = []
            for i in range(40):
                t = i / 39
                p = base + out * (L * (0.7 * t + 0.2 * t * t)) + V((0, 0, 0.14 * math.sin(PI * min(1, t * 1.3)) - 0.42 * t ** 2.2))
                path.append(p)
            ch = chain_along(sk, f"limb{s}{k}", path, 3, "body")
            nrng = 26
            radii = [(0.15 * (1 - 0.5 * i / 39)) * (0.9 + 0.14 * abs(math.cos(PI * i * nrng / 39))) for i in range(40)]
            parts.append(Part(tube_r(f"limb{s}{k}m", path, radii, "maw_limb", seg=12), bones=ch + ["body"]))
    body = assemble("sedimentmaw_body", sk, parts)
    arm = finish_creature(root, sk, body, os.path.join(kit.out_dir(), "fauna_sedimentmaw.glb"), props={"creature": "sedimentmaw", "rim": RIM, "mouth": f"{MX:.2f},{MY:.2f}"})
    return root, arm


# ================================================================================================ mimic crawler (image 4)
def tube2(name, pts, radii, mats, seg=10, under=V((0, 0, -1)), cut=0.25):
    """tube with a second material on its underside (faces whose outward direction points along `under`)"""
    bm = bmesh.new()
    pts = [V(p) for p in pts]
    n = len(pts)
    rings, outs = [], []
    prev = None
    for i, p in enumerate(pts):
        t = (pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]).normalized()
        if prev is None:
            upv = V((0, 0, 1)) if abs(t.z) < 0.9 else V((1, 0, 0))
            nx = t.cross(upv).normalized()
        else:
            nx = (prev - t * prev.dot(t)).normalized()
        prev = nx
        ny = nx.cross(t).normalized()
        ring, out = [], []
        for k in range(seg):
            d = nx * math.cos(TAU * k / seg) + ny * math.sin(TAU * k / seg)
            ring.append(bm.verts.new(p + d * radii[i]))
            out.append(d)
        rings.append(ring)
        outs.append(out)
    for i in range(n - 1):
        for k in range(seg):
            f = bm.faces.new((rings[i][k], rings[i][(k + 1) % seg], rings[i + 1][(k + 1) % seg], rings[i + 1][k]))
            d = (outs[i][k] + outs[i][(k + 1) % seg]).normalized()
            f.material_index = 1 if d.dot(under) > cut else 0
    bm.faces.new(list(reversed(rings[0])))
    tip = bm.verts.new(pts[-1] + (pts[-1] - pts[-2]).normalized() * radii[-1])
    for k in range(seg):
        bm.faces.new((rings[-1][k], rings[-1][(k + 1) % seg], tip))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = from_bmesh(name, bm, tuple(mats))
    kit.smooth(o, 70)
    return o, outs


def shard(name, center, normal, fwd, size, m, rng, thick=0.012, lift=0.25, jag=0.22):
    """a rough armour shingle: an irregular domed plate lying on a surface, its rear edge lifted"""
    nrm = V(normal).normalized()
    f = (V(fwd) - nrm * V(fwd).dot(nrm)).normalized()
    sd = nrm.cross(f).normalized()
    bm = bmesh.new()
    cv = bm.verts.new(V(center) + nrm * (size * 0.12))
    ring = []
    K = 12
    for k in range(K):
        a = TAU * k / K
        r = size * (1 + jag * (rng.random() - 0.5) * 2) * (0.75 + 0.25 * abs(math.cos(a)))
        back = max(0.0, -math.cos(a))
        p = V(center) + f * (math.cos(a) * r * 0.85) + sd * (math.sin(a) * r * 0.7) + nrm * (size * lift * back)
        ring.append(bm.verts.new(p))
    for k in range(K):
        bm.faces.new((cv, ring[k], ring[(k + 1) % K]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = from_bmesh(name, bm, (m,))
    kit.add_solidify(o, thick, 0.0)
    kit.bake(o)
    kit.smooth(o, 35)
    return o


def mimic():
    """span ~2.4 m; ground z = 0; the body low between arched limbs"""
    kit.reset()
    root = empty("MimicCrawler")
    rng = random.Random(31)
    sk = Skeleton()
    sk.add("body", (0, -0.6, 0.42), (0, 0.05, 0.42))
    sk.add("head", (0, 0.05, 0.36), (0, 0.42, 0.36), "body")
    for sx, s in ((-1, "L"), (1, "R")):
        sk.add(f"eye{s}", (sx * 0.2, 0.26, 0.45), (sx * 0.29, 0.31, 0.45), "head")
    parts = []
    # mantle and head
    ell = lambda co, size, r=1.0: ("ELLIPSOID", co, r, size)
    bodym = meta("mantle", [ell((0, -0.3, 0.44), (0.3, 0.42, 0.22)), ell((0, -0.62, 0.5), (0.22, 0.22, 0.17)), ell((0, 0.14, 0.36), (0.27, 0.22, 0.18)),
                            ell((0, 0.12, 0.22), (0.24, 0.2, 0.12))], "mimic_skin", res=0.03)
    parts.append(Part(decimate(bodym, 0.5), bones=["body", "head"]))

    def mantle_pt(u, v):
        """a point on the mantle/head top (u across −1..1, v along 0 = rear .. 1 = brow) and its normal"""
        y = -0.82 + 1.08 * v
        ry = 0.22 if v < 0.7 else 0.17
        hw = 0.3 * math.sin(PI * min(0.98, 0.1 + v * 0.9)) ** 0.6 + 0.05
        x = u * hw
        z = 0.44 + (0.24 if v < 0.75 else 0.16) * (1 - u * u) ** 0.55 + 0.04 * math.sin(PI * v)
        n = V((u * 0.9, (0.5 - v) * 0.3, 1.0)).normalized()
        return V((x, y, z)), n
    # shingles over mantle and head, rear rows first so the front ones overlap them
    for row in range(12):
        v = 0.04 + row * 0.08
        cols = 5 + (row % 2)
        for c in range(cols):
            u = -0.85 + 1.7 * (c + 0.5 * (row % 2) + 0.25) / (cols + 0.5)
            p, nrm = mantle_pt(u, v)
            size = rng.uniform(0.1, 0.14) * (0.85 if v > 0.75 else 1)
            sh = shard(f"sh{row}_{c}", p + nrm * 0.004, nrm, (0, -1, 0), size, "mimic_plate", rng, lift=0.16, jag=0.28)
            parts.append(Part(sh, bones=["body", "head"]))
    # heavy brow plates over the eyes, the eyes beneath them (gold, slit pupils)
    for sx, s in ((-1, "L"), (1, "R")):
        ec = V((sx * 0.2, 0.26, 0.45))
        en = V((sx * 0.85, 0.5, 0.15)).normalized()
        brow = shard(f"brow{s}", ec + V((sx * 0.02, 0.0, 0.08)), V((sx * 0.35, 0.25, 1)), (0, 1, 0), 0.13, "mimic_plate", rng, thick=0.02, lift=0.1, jag=0.12)
        parts.append(Part(brow, bone="head"))
        ball = kit.sphere(f"eyeball{s}", 0.068, loc=tuple(ec), m="mimic_eye", segs=20, rings=12)
        parts.append(Part(ball, bone=f"eye{s}"))
        pup = kit.sphere(f"pupil{s}", 1.0, m="mimic_pupil", segs=14, rings=6, scale=(0.034, 0.012, 0.012))
        q = V((1, 0, 0)).rotation_difference(en.cross(V((0, 0, 1))).normalized())
        pup.rotation_mode = "QUATERNION"
        pup.rotation_quaternion = q
        pup.location = tuple(ec + en * 0.062)
        parts.append(Part(pup, bone=f"eye{s}"))
        # lower lid ridge
        lid = kit.torus(f"lid{s}", 0.07, 0.014, m="mimic_skin", seg=20, rseg=6)
        parts.append(Part(orient(lid, en, ec + en * 0.018), bone=f"eye{s}" if False else "head"))
    # the beak, hidden under the head
    for zz, ln in ((0.17, 0.07), (0.15, 0.06)):
        parts.append(Part(tube_tapered(f"beak{zz}", [(0, 0.16, zz), (0, 0.22, zz - 0.03), (0, 0.24, zz - 0.07)], 0.025, 0.004, "claw_black", seg=6), bone="head"))
    # eight limbs: arched like a crab's stance, then lying on the ground and curling at the tips
    angs = [38, 72, 110, 148]
    for sx, s in ((-1, "L"), (1, "R")):
        for k, adeg in enumerate(angs):
            a = math.radians(adeg) * sx
            out = V((math.sin(a), math.cos(a), 0))
            base = V((out.x * 0.17, 0.1 + out.y * 0.14, 0.19))
            L = 1.25 - 0.08 * k + rng.uniform(-0.05, 0.05)
            knee_h = (0.14, 0.26, 0.36, 0.36)[k]
            path = []
            N = 44
            curl = rng.uniform(0.8, 1.3)
            for i in range(N):
                t = i / (N - 1)
                d = L * (0.25 + 0.75 * t) * (0.85 if t > 0.7 else 1)
                h = knee_h * math.sin(PI * min(1.0, t * 1.65)) if t < 0.6 else 0.06 * (1 - t)
                p = base + out * (d * min(1.0, t * 1.6)) + V((0, 0, h))
                if t > 0.62:  # the distal third lies on the ground and curls
                    ct = (t - 0.62) / 0.38
                    side = out.cross(V((0, 0, 1))) * (sx if k % 2 == 0 else -sx)
                    p = p + side * (0.22 * curl * ct ** 2) - out * (0.12 * ct ** 3)
                path.append(p)
            radii = [0.1 * (1 - i / (N - 1)) ** 0.85 + 0.013 for i in range(N)]
            ch = chain_along(sk, f"arm{s}{k}", path, 5, "body")
            limb, outs = tube2(f"arm{s}{k}m", path, radii, ("mimic_skin", "mimic_under"), seg=12, cut=0.55)
            parts.append(Part(limb, bones=ch + ["body"]))
            # armour: saddle plates along the top of the proximal two thirds
            for i in range(2, int(N * 0.66), 3):
                p = path[i]
                tdir = (path[i + 1] - path[i - 1]).normalized()
                topn = (V((0, 0, 1)) - tdir * tdir.z).normalized()
                sh = shard(f"ap{s}{k}_{i}", p + topn * radii[i] * 0.85, topn, -tdir, radii[i] * 1.45, "mimic_plate", rng, thick=0.008, lift=0.3, jag=0.18)
                parts.append(Part(sh, bones=ch))
            # suckers in two rows on the underside of the distal part, hooks along its inner edge, the tip claw
            for i in range(int(N * 0.45), N - 3, 2):
                p = path[i]
                tdir = (path[i + 1] - path[i - 1]).normalized()
                dn = (V((0, 0, -1)) - tdir * (-tdir.z)).normalized()
                sdv = tdir.cross(dn).normalized()
                for rrow in (-1, 1):
                    c = p + dn * radii[i] * 0.8 + sdv * (rrow * radii[i] * 0.45)
                    su = kit.torus(f"su{s}{k}_{i}{rrow}", radii[i] * 0.32, radii[i] * 0.12, m="mimic_sucker", seg=8, rseg=4)
                    parts.append(Part(orient(su, dn, c), bones=ch))
            inner = None
            for i in range(int(N * 0.6), N - 4, 4):
                p = path[i]
                tdir = (path[i + 1] - path[i - 1]).normalized()
                sdv = tdir.cross(V((0, 0, 1))).normalized() * (sx if k % 2 == 0 else -sx)
                h0 = p + sdv * radii[i] * 0.9
                hk = [h0, h0 + sdv * 0.035 + V((0, 0, 0.012)), h0 + sdv * 0.05 - tdir * 0.025]
                parts.append(Part(tube_tapered(f"hk{s}{k}_{i}", hk, radii[i] * 0.35, 0.002, "mimic_hook", seg=5), bones=ch))
            tdir = (path[-1] - path[-3]).normalized()
            tipc = [path[-1], path[-1] + tdir * 0.04 + V((0, 0, 0.01)), path[-1] + tdir * 0.07 - V((0, 0, 0.012))]
            parts.append(Part(tube_tapered(f"claw{s}{k}", tipc, 0.012, 0.002, "mimic_hook", seg=6), bone=ch[-1]))
    body = assemble("mimic_body", sk, parts)
    arm = finish_creature(root, sk, body, os.path.join(kit.out_dir(), "fauna_mimic.glb"), props={"creature": "mimic", "span": 2.4})
    return root, arm


def preview_pose(name, cam, target, lens=40, world=(0.5, 0.55, 0.58), up=None, sun=(0.5, -0.6, 0.7)):
    kit.preview(os.path.join(kit.preview_dir(), f"{name}.png"), cam, target, lens=lens, samples=16, world=world, sun=sun, sun_strength=3.5, up=up)


if __name__ == "__main__":
    which = [a for a in sys.argv[1:] if not a.startswith("--")] or ["ferracaris", "sedimentmaw", "mimic"]
    prev = "--nopreview" not in sys.argv
    for w in which:
        root, arm = globals()[w]()
        if not prev:
            continue
        if w == "ferracaris":
            preview_pose("fauna_ferracaris", (0.32, -0.26, 0.2), (0, 0, 0.02), lens=50)
            preview_pose("fauna_ferracaris_top", (0.0, -0.05, 0.5), (0, 0, 0.0), lens=40, up=(0, 1, 0))
        elif w == "mimic":
            preview_pose("fauna_mimic", (-1.5, 2.1, 0.85), (0, 0.1, 0.3), lens=35, world=(0.45, 0.5, 0.55))
            preview_pose("fauna_mimic_eye", (0.75, 0.95, 0.6), (0.15, 0.25, 0.4), lens=40, world=(0.45, 0.5, 0.55))
        elif w == "sedimentmaw":
            preview_pose("fauna_sedimentmaw", (0.6, -3.0, 1.5), (0, 0.15, -0.05), lens=38, world=(0.6, 0.62, 0.62))
