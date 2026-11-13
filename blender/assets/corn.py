"""Corn plants for the fields around the farm (reference images 1 and 2: dense, long arching leaves).

Exports corn.glb with three full-detail variants (corn_a/b/c), reduced versions (corn_a1/b1/c1) for
the mid range, and renders the row impostor card texture used beyond that.
UV convention for the engine's foliage shader: u = across the blade (0..1), v = along the blade /
up the stalk (0..1); the shader derives colour gradients and wind flutter from it.
"""
import math
import os
import random
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "lib"))
from bl import *  # noqa: E402,F403
from mathutils import Matrix, Vector  # noqa: E402


def leaf(P, base, azim, L, wmax, a0, a1, segs, strips, rnd, mat="leaf_corn", twist=0.0):
    """One blade: arches from angle a0 (from vertical) to a1 (drooping), V-shaped section, rippled edge."""
    d = Vector((math.cos(azim), math.sin(azim), 0))
    side = Vector((-d.y, d.x, 0))
    up = Vector((0, 0, 1))
    pts, tans = [], []
    p = Vector(base)
    n = segs
    for i in range(n + 1):
        t = i / n
        th = math.radians(a0 + (a1 - a0) * t ** 1.25)
        tan = d * math.sin(th) + up * math.cos(th)
        pts.append(p.copy())
        tans.append(tan)
        p = p + tan * (L / n)
    verts, uvs, faces = [], [], []
    ripple_ph = rnd.uniform(0, 6.28)
    for i in range(n + 1):
        t = i / n
        w = wmax * (0.28 + 0.72 * math.sin(math.pi * min(1.0, t * 1.55) ** 0.8 * 0.5) ) * (1 - t ** 3.2) if t < 1 else 0.0
        w = max(w, 0.0)
        nrm = tans[i].cross(side).normalized()         # blade normal (upper face)
        tw = twist * t
        s_dir = (side * math.cos(tw) + nrm * math.sin(tw)).normalized()
        n_dir = tans[i].cross(s_dir).normalized()
        fold = 0.22 * w                                # edges rise above the midrib (V section)
        rip = math.sin(t * 17 + ripple_ph) * 0.12 * w * t
        if strips == 2:
            verts += [pts[i] - s_dir * w / 2 + n_dir * (fold + rip), pts[i], pts[i] + s_dir * w / 2 + n_dir * (fold - rip)]
            uvs += [(0.0, t), (0.5, t), (1.0, t)]
        else:
            verts += [pts[i] - s_dir * w / 2 + n_dir * rip, pts[i] + s_dir * w / 2 - n_dir * rip]
            uvs += [(0.0, t), (1.0, t)]
    k = strips + 1
    for i in range(n):
        for j in range(strips):
            a = i * k + j
            faces.append((a, a + 1, a + k + 1, a + k))
    P.mesh(verts, faces, mat=mat, uvs=uvs, recalc=False, bevel=0)


def plant(name, H, seed, detail=0, tassel=True, ear=True):
    rnd = random.Random(seed)
    P = Part(name)
    nodes = 11 if detail == 0 else 6
    sides = 6 if detail == 0 else 4
    # stalk: gentle zig-zag at the nodes
    ring_pts = []
    zs = [H * (i / nodes) ** 0.92 for i in range(nodes + 1)]
    lean = Vector((rnd.uniform(-0.04, 0.04), rnd.uniform(-0.04, 0.04), 0))
    centres = [Vector((lean.x * z + (0.006 if i % 2 else -0.006), lean.y * z, z)) for i, z in enumerate(zs)]
    verts, uvs, faces = [], [], []
    for i, c in enumerate(centres):
        r = 0.016 * (1 - 0.62 * i / nodes)
        for s in range(sides):
            a = math.tau * s / sides
            verts.append(c + Vector((math.cos(a) * r, math.sin(a) * r, 0)))
            uvs.append((s / sides, zs[i] / H))
    for i in range(nodes):
        for s in range(sides):
            a, b = i * sides + s, i * sides + (s + 1) % sides
            faces.append((a, b, b + sides, a + sides))
    P.mesh(verts, faces, mat="stalk_corn", uvs=uvs, recalc=False, bevel=0)
    # leaves in two ranks, alternating sides, with a little spiral
    phase = rnd.uniform(0, math.pi)
    for i in range(1, nodes):
        z = zs[i]
        frac = i / nodes
        az = phase + (math.pi if i % 2 else 0) + rnd.uniform(-0.35, 0.35) + i * 0.12
        L = (0.68 + 0.34 * math.sin(math.pi * frac)) * rnd.uniform(0.85, 1.15) * (H / 2.1)
        wmax = rnd.uniform(0.1, 0.135) * (1.0 if detail == 0 else 1.25)
        a0 = rnd.uniform(18, 38)
        a1 = rnd.uniform(105, 150) if frac < 0.8 else rnd.uniform(70, 110)
        dry = frac < 0.28 and rnd.random() < 0.7
        leaf(P, centres[i], az, L, wmax, a0, a1, 7 if detail == 0 else 4, 2 if detail == 0 else 1, rnd,
             mat="leaf_corn_dry" if dry else "leaf_corn", twist=rnd.uniform(-0.9, 0.9))
    top = centres[-1]
    if tassel and detail == 0:
        for k in range(7):
            az = math.tau * k / 7 + rnd.uniform(-0.3, 0.3)
            tilt = math.radians(rnd.uniform(10, 48)) if k else 0.0
            ln = rnd.uniform(0.14, 0.24)
            d = Vector((math.cos(az) * math.sin(tilt), math.sin(az) * math.sin(tilt), math.cos(tilt)))
            s1 = d.cross(Vector((0, 0, 1)) if abs(d.z) < 0.95 else Vector((1, 0, 0))).normalized() * 0.006
            a, b = top, top + d * ln
            P.mesh([a - s1, a + s1, b + s1 * 0.4, b - s1 * 0.4], [(0, 1, 2, 3)], mat="foliage_dry", uvs=[(0, 0.9), (1, 0.9), (1, 1), (0, 1)], recalc=False, bevel=0)
    elif tassel:
        s1 = Vector((0.012, 0, 0))
        P.mesh([top - s1, top + s1, top + s1 * 0.3 + Vector((0, 0, 0.2)), top - s1 * 0.3 + Vector((0, 0, 0.2))], [(0, 1, 2, 3)], mat="foliage_dry",
               uvs=[(0, 0.9), (1, 0.9), (1, 1), (0, 1)], recalc=False, bevel=0)
    if ear and detail == 0:
        i = nodes // 2
        az = phase + (0 if i % 2 else math.pi) + 0.5
        d = Vector((math.cos(az), math.sin(az), 0))
        c = centres[i] + d * 0.035 + Vector((0, 0, 0.1))
        M = Matrix.Translation(c) @ Vector((0, 0, 1)).rotation_difference((d * 0.42 + Vector((0, 0, 1))).normalized()).to_matrix().to_4x4()
        prof = [(0.0, -0.09), (0.02, -0.07), (0.028, 0.0), (0.022, 0.07), (0.006, 0.1), (0.0, 0.1)]
        vv, uu, ff = [], [], []
        for j, (r, z) in enumerate(prof):
            for s in range(5):
                a = math.tau * s / 5
                vv.append(M @ Vector((math.cos(a) * r, math.sin(a) * r, z)))
                uu.append((s / 5, 0.35 + 0.2 * j / (len(prof) - 1)))
        for j in range(len(prof) - 1):
            for s in range(5):
                a, b = j * 5 + s, j * 5 + (s + 1) % 5
                ff.append((a, b, b + 5, a + 5))
        P.mesh(vv, ff, mat="leaf_corn", uvs=uu, recalc=False, bevel=0)
    ob = P.finish(sharp=60, weighted=False, col=0)
    props(ob, part=name)
    return ob


def build():
    reset()
    out = []
    specs = [("corn_a", 2.15, 11, True, True), ("corn_b", 1.8, 23, False, True), ("corn_c", 2.35, 37, True, False)]
    for i, (name, H, seed, tassel, ear) in enumerate(specs):
        o = plant(name, H, seed, 0, tassel, ear)
        o.location.x = i * 1.2
        out.append(o)
        o1 = plant(name + "1", H, seed, 1, tassel, ear)
        o1.location = (i * 1.2, 1.5, 0)
        out.append(o1)
    for o in out:
        print("   ", o.name, sum(len(p.vertices) - 2 for p in o.data.polygons), "tris")
    return out


def render_card(objs):
    """Orthographic, shadow-free render of a short row of plants -> RGBA impostor card (2.23 m x 2.9 m)."""
    import bpy
    sc = bpy.context.scene
    row = []
    rnd = random.Random(5)
    src = [o for o in objs if not o.name.endswith("1")]
    x = -1.05
    while x < 1.1:
        s = rnd.choice(src)
        c = instance(s, "row", at=(x, rnd.uniform(-0.06, 0.06), 0), rot=(0, 0, rnd.uniform(0, 360)), scale=(1, 1, rnd.uniform(0.9, 1.1)))
        row.append(c)
        x += 0.26
    for o in objs:
        o.hide_render = True
    cam = bpy.data.cameras.new("cc")
    cam.type = "ORTHO"
    cam.ortho_scale = 2.9
    co = bpy.data.objects.new("cc", cam)
    sc.collection.objects.link(co)
    co.location = (0, -10, 1.45)
    co.rotation_euler = (math.radians(90), 0, 0)
    sc.camera = co
    sc.world = bpy.data.worlds.new("w")
    sc.world.use_nodes = True
    bg = sc.world.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (1, 1, 1, 1)
    bg.inputs[1].default_value = 1.6
    sc.render.engine = "CYCLES"
    sc.cycles.samples = 48
    sc.cycles.use_denoising = False
    sc.render.film_transparent = True
    sc.render.resolution_x, sc.render.resolution_y = 394, 512
    sc.view_settings.view_transform = "Standard"
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA"
    tmp = os.path.join(PREVIEW_DIR, "corn_card.png")
    os.makedirs(PREVIEW_DIR, exist_ok=True)
    sc.render.filepath = tmp
    bpy.ops.render.render(write_still=True)
    from PIL import Image
    im = Image.open(tmp).convert("RGBA").resize((512, 512), Image.LANCZOS)
    # bleed colour into transparent texels so mip-mapping does not darken the edges
    import numpy as np
    from scipy import ndimage
    a = np.asarray(im).astype(np.float32) / 255
    rgb, al = a[..., :3].copy(), a[..., 3]
    mask = al > 0.05
    for _ in range(12):
        blur = np.stack([ndimage.uniform_filter(rgb[..., c] * mask, 5) for c in range(3)], -1)
        wsum = ndimage.uniform_filter(mask.astype(np.float32), 5)[..., None]
        fill = blur / np.maximum(wsum, 1e-4)
        rgb = np.where(mask[..., None], rgb, fill)
        mask = mask | (wsum[..., 0] > 0.01)
    outp = np.concatenate([rgb, al[..., None]], -1)
    Image.fromarray((np.clip(outp, 0, 1) * 255).astype(np.uint8), "RGBA").save(os.path.join(ROOT, "public", "assets", "textures", "corn_card.webp"), quality=90)
    for o in row:
        bpy.data.objects.remove(o)
    bpy.data.objects.remove(co)
    for o in objs:
        o.hide_render = False
    print("  rendered corn_card.webp")


if __name__ == "__main__":
    objs = build()
    render_card(objs)
    if "--preview" in sys.argv:
        preview("corn", (2.2, -4.2, 1.5), (1.2, 0.5, 1.1), res=(1100, 700), lens=40, samples=32)
    export_glb("corn")
    save_blend("corn")
