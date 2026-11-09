"""
Conifers for the dense mountain forest around the NASA facility: Colorado-style spruce, Douglas fir, ponderosa pine
and dead snags. Each species is built procedurally from a tapered trunk and whorls of drooping branch cards (two
crossed, bent cards per branch, textured with an alpha needle sprig). Exports two LODs per species and renders an
orthographic impostor (RGBA) per species for the far forest rings.

Outputs:
  public/assets/models/trees.glb                       nodes <species>_lod0 / <species>_lod1 (+ extras)
  public/assets/textures/imp_<species>_rgba.png         side-view impostor, covers x ∈ [-H/4, H/4]·k, z ∈ [z0, z0 + Hq]
"""
import sys, os, math, random
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "lib"))
import bpy, bmesh
import kit
from kit import V, empty, merge

PI = math.pi
TEX = os.path.normpath(os.path.join(HERE, "..", "..", "public", "assets", "textures"))

SPECIES = {
    #        height, crown base, crown radius, whorl spacing, branches/whorl, droop bottom→top, trunk r, needles, bark, crown shape
    "spruce": dict(H=18.0, zc=1.1, R=3.0, dz=0.40, nb=(6, 8), e=(-0.42, 0.10), r0=0.26, nm="needles_spruce", bm="bark_spruce", shape="cone", skip=0.04),
    "fir": dict(H=21.0, zc=2.4, R=3.5, dz=0.50, nb=(5, 7), e=(-0.25, 0.22), r0=0.30, nm="needles_fir", bm="bark_spruce", shape="cone", skip=0.12),
    "pine": dict(H=18.0, zc=7.2, R=3.2, dz=0.5, nb=(4, 7), e=(0.2, 0.7), r0=0.34, nm="needles_pine", bm="bark_pine", shape="round", skip=0.25),
    "snag": dict(H=13.0, zc=2.0, R=1.6, dz=0.55, nb=(3, 5), e=(-0.1, 0.25), r0=0.22, nm=None, bm="snag_wood", shape="cone", skip=0.4),
}


def crown_radius(sp, z):
    H, zc, R = sp["H"], sp["zc"], sp["R"]
    t = (z - zc) / (H - zc)
    if t < 0 or t > 1:
        return 0.0
    if sp["shape"] == "round":
        return R * (math.sin(PI * min(1.0, t * 1.05)) ** 0.75) * (1 - 0.35 * t)
    return R * (1 - t) ** 0.95 * (1 + 0.12 * math.sin(PI * t))


def trunk(name, sp, sides, mat, rng):
    """Tapered trunk with a root flare and explicit cylindrical UVs (tile 1 m around × 2 m up)."""
    H, r0 = sp["H"], sp["r0"]
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new("UVMap")
    zs = [0.0, 0.25, 0.6, 1.2] + [1.2 + (H - 1.2) * k / 10 for k in range(1, 11)]
    rings = []
    for z in zs:
        t = z / H
        r = r0 * (1 - t) ** 1.05 + 0.015
        r += r0 * 0.55 * math.exp(-z * 3.2)          # root flare
        ring = []
        for k in range(sides):
            a = 2 * PI * k / sides
            wob = 1 + 0.06 * math.sin(3 * a + z) if z < 1 else 1.0
            ring.append(bm.verts.new((math.cos(a) * r * wob, math.sin(a) * r * wob, z)))
        rings.append((ring, r, z))
    circ = 2 * PI * r0
    for i in range(len(rings) - 1):
        A, ra, za = rings[i]
        B, rb, zb = rings[i + 1]
        for k in range(sides):
            k2 = (k + 1) % sides
            f = bm.faces.new((A[k], A[k2], B[k2], B[k]))
            u0, u1 = k / sides * circ, (k + 1) / sides * circ
            for lp, (u, v) in zip(f.loops, ((u0, za / 2), (u1, za / 2), (u1, zb / 2), (u0, zb / 2))):
                lp[uvl].uv = (u, v)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = kit.from_bmesh(name, bm, (mat,))
    kit.smooth(o, 80)
    return o


def branch_cards(name, sp, rng, lod):
    """Whorls of bent, crossed needle cards following the crown envelope."""
    H, zc = sp["H"], sp["zc"]
    bm = bmesh.new()
    uvl = bm.loops.layers.uv.new("UVMap")
    dz = sp["dz"] * (1.75 if lod else 1.0)
    z = zc
    whorl = 0
    while z < H - 0.25:
        R = crown_radius(sp, z)
        t = (z - zc) / (H - zc)
        nb = rng.randint(*sp["nb"]) - (1 if lod else 0)
        nb = max(3, nb)
        a0 = rng.uniform(0, 2 * PI)
        for b in range(nb):
            if rng.random() < sp["skip"]:
                continue
            th = a0 + 2 * PI * b / nb + rng.uniform(-0.25, 0.25)
            L = max(0.35, R * rng.uniform(0.82, 1.12) * (1.15 if lod else 1.0))
            e = sp["e"][0] + (sp["e"][1] - sp["e"][0]) * t + rng.uniform(-0.08, 0.08)
            d = V((math.cos(th) * math.cos(e), math.sin(th) * math.cos(e), math.sin(e)))
            side = V((-math.sin(th), math.cos(th), 0))
            up = d.cross(side).normalized()
            base = V((0, 0, z)) + d * 0.04
            sag = L * (0.10 + 0.12 * (1 - t))
            pts = [base, base + d * L * 0.55 - V((0, 0, sag * 0.6)), base + d * L - V((0, 0, sag)) + V((0, 0, 0.08 * L))]
            w = min(1.5, 0.35 + 0.55 * L) * (1.25 if lod else 1.0)
            if sp["shape"] == "round":   # pine: shorter, tufted, upswept sprays in three directions
                L *= rng.uniform(0.75, 1.05)
                w *= 0.75
                cards = [(rng.uniform(-0.4, 0.4), 1.0), (1.1 + rng.uniform(-0.2, 0.2), 0.8)] + ([] if lod else [(-1.0 + rng.uniform(-0.2, 0.2), 0.7)])
            else:
                cards = [(rng.uniform(-0.3, 0.3), 1.0), (1.25 + rng.uniform(-0.2, 0.2), 0.7 if not lod else 0.85)]
            for (roll, ws) in cards:
                ax = side * math.cos(roll) + up * math.sin(roll)
                widths = (w * 0.45 * ws, w * ws, w * 0.7 * ws)
                us = (0.0, 0.55, 1.0)
                left = [bm.verts.new(p + ax * (wd / 2)) for p, wd in zip(pts, widths)]
                right = [bm.verts.new(p - ax * (wd / 2)) for p, wd in zip(pts, widths)]
                for i in range(2):
                    f = bm.faces.new((left[i], right[i], right[i + 1], left[i + 1]))
                    for lp, uv in zip(f.loops, ((us[i], 1.0), (us[i], 0.0), (us[i + 1], 0.0), (us[i + 1], 1.0))):
                        lp[uvl].uv = uv
        whorl += 1
        z += dz * (0.6 + 0.4 * (1 - t)) * rng.uniform(0.85, 1.15)
    # leader at the top: a few small vertical cards
    for k in range(3 if not lod else 2):
        th = k * PI / 3
        ax = V((math.cos(th), math.sin(th), 0))
        b0, b1 = V((0, 0, H - 1.4)), V((0, 0, H + 0.1))
        vs = [bm.verts.new(b0 + ax * 0.25), bm.verts.new(b0 - ax * 0.25), bm.verts.new(b1 - ax * 0.05), bm.verts.new(b1 + ax * 0.05)]
        f = bm.faces.new(vs)
        for lp, uv in zip(f.loops, ((0.1, 1.0), (0.1, 0.0), (1.0, 0.4), (1.0, 0.6))):
            lp[uvl].uv = uv
    o = kit.from_bmesh(name, bm, (sp["nm"],))
    return o


def snag_limbs(name, sp, rng):
    parts = []
    z = sp["zc"]
    while z < sp["H"] - 1.0:
        for b in range(rng.randint(1, 3)):
            th = rng.uniform(0, 2 * PI)
            L = rng.uniform(0.3, 1.6) * (1 - z / sp["H"]) + 0.2
            e = rng.uniform(-0.4, 0.2)
            d = V((math.cos(th) * math.cos(e), math.sin(th) * math.cos(e), math.sin(e)))
            p0 = V((0, 0, z))
            parts.append(kit.tube(name, [p0, p0 + d * L * 0.6, p0 + d * L + V((0, 0, -0.1 * L))], 0.035 * (1 - z / sp["H"]) + 0.01, m="snag_wood", seg=5))
        z += sp["dz"] * rng.uniform(0.8, 1.6)
    return merge(parts, name)


def build_species(key, root, rng):
    sp = SPECIES[key]
    out = {}
    for lod in (0, 1):
        parts = [trunk(f"{key}_trunk{lod}", sp, 12 if lod == 0 else 6, sp["bm"], rng)]
        if sp["nm"]:
            parts.append(branch_cards(f"{key}_cards{lod}", sp, random.Random(rng.random()), lod))
        else:
            parts.append(snag_limbs(f"{key}_limbs{lod}", sp, random.Random(rng.random())))
        o = merge(parts, f"{key}_lod{lod}", par=root, tree=key, lod=lod, H=sp["H"], R=sp["R"])
        kit.smooth(o, 80)
        out[lod] = o
    return out


def setup_preview_material(name, tex, alpha=False):
    m = bpy.data.materials.get(name)
    if m is None:
        return
    nt = m.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    img = bpy.data.images.load(os.path.join(TEX, tex), check_existing=True)
    t = nt.nodes.new("ShaderNodeTexImage")
    t.image = img
    nt.links.new(t.outputs["Color"], bsdf.inputs["Base Color"])
    if alpha:
        nt.links.new(t.outputs["Alpha"], bsdf.inputs["Alpha"])
        try:
            m.surface_render_method = "DITHERED"
        except Exception:
            pass
    bsdf.inputs["Roughness"].default_value = 0.85


def render_impostor(key, objs, all_objs, H):
    """Orthographic side render with transparent film → imp_<key>_rgba.png (aspect 1:2)."""
    sc = bpy.context.scene
    for o in all_objs:
        o.hide_render = o not in objs
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = 48
    try:
        sc.cycles.use_denoising = True
    except Exception:
        pass
    sc.render.film_transparent = True
    sc.render.resolution_x, sc.render.resolution_y = 256, 512
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA"
    if sc.world is None:
        sc.world = bpy.data.worlds.new("w")
    sc.world.use_nodes = True
    bg = sc.world.node_tree.nodes.get("Background")
    bg.inputs[0].default_value = (0.55, 0.62, 0.72, 1)
    bg.inputs[1].default_value = 0.9
    cam = bpy.data.objects.get("_imp_cam") or bpy.data.objects.new("_imp_cam", bpy.data.cameras.new("_imp_cam"))
    if cam.name not in sc.collection.objects:
        sc.collection.objects.link(cam)
    Hq = H * 1.04
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = Hq
    z0 = -0.02 * H
    cam.location = (0, -60, z0 + Hq / 2)
    cam.rotation_euler = (PI / 2, 0, 0)
    sc.camera = cam
    sun = bpy.data.objects.get("_imp_sun") or bpy.data.objects.new("_imp_sun", bpy.data.lights.new("_imp_sun", "SUN"))
    if sun.name not in sc.collection.objects:
        sc.collection.objects.link(sun)
    sun.data.energy = 3.2
    sun.rotation_euler = (math.radians(50), 0, math.radians(-30))
    path = os.path.join(TEX, f"imp_{key}_rgba.png")
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print(f"[trees] impostor -> {path}")
    return dict(imp_h=Hq, imp_w=Hq / 2, imp_z0=z0)


def build(preview=True):
    kit.reset()
    rng = random.Random(1977)
    root = empty("Trees")
    built = {}
    for key in SPECIES:
        built[key] = build_species(key, root, rng)
    # impostor framing metadata on the LOD nodes
    for key, d in built.items():
        H = SPECIES[key]["H"]
        for o in d.values():
            o["imp_h"] = H * 1.04
            o["imp_w"] = H * 0.52
            o["imp_z0"] = -0.02 * H
    kit.export_glb(os.path.join(kit.out_dir(), "trees.glb"), root)
    # previews / impostors with real textures (after export so the GLB stays texture-free)
    setup_preview_material("needles_spruce", "conifer_branch_rgba.png", alpha=True)
    setup_preview_material("needles_fir", "conifer_branch_rgba.png", alpha=True)
    setup_preview_material("needles_pine", "pine_branch_rgba.png", alpha=True)
    setup_preview_material("bark_spruce", "bark_a.jpg")
    setup_preview_material("bark_pine", "bark_pine_a.jpg")
    setup_preview_material("snag_wood", "bark_a.jpg")
    allo = [o for d in built.values() for o in d.values()]
    for key, d in built.items():
        for o in d.values():
            o.location = (0, 0, 0)
        render_impostor(key, [d[0]], allo, SPECIES[key]["H"])
    if preview:
        sc = bpy.context.scene
        sc.render.film_transparent = False
        xs = {"spruce": -12, "fir": -4, "pine": 4, "snag": 11}
        for key, d in built.items():
            d[0].location = (xs[key], 0, 0)
            d[1].location = (xs[key], 9, 0)
            d[0].hide_render = d[1].hide_render = False
        kit.preview(os.path.join(kit.preview_dir(), "trees.png"), (0, -42, 9), (0, 3, 9.5), lens=40, samples=32, world=(0.55, 0.62, 0.72), sun=(-0.4, -0.7, 0.6), res=(1280, 720))


if __name__ == "__main__":
    build(preview="--nopreview" not in sys.argv)
