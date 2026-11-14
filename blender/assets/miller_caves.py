"""
Miller's Planet overhangs and caves (the heightfield terrain cannot overhang): rock shells placed by
src/world/surface/millerCaves.ts with trimesh colliders, so the diver can swim under their roofs.
  miller_cave_shelter  a rock shelter on the rift walls where the Luminous Sirens hang (5 m wide, 4 m high)
  miller_cave_ledge    a long overhanging ledge on the basin rim over the Abyssal Stalkers' posts (13 m)
  miller_cave_den      a low arched den by the reef pool for the Mimic Crawler (4.5 m)
Each is a domed shell opening toward +Y (Blender), its walls carried 2.5 m below z = 0 so it seats into a slope;
rock relief from layered displacement. Blender +Y = the open side, +Z up.
"""
import sys, os, math, random
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "lib"))
import bpy, bmesh
import kit
from kit import V, empty
import creature as C

PI = math.pi

kit.PALETTE.update({"miller_cave_rock": dict(color=(0.06, 0.062, 0.066), rough=0.85)})


def shell(name, W, D, H, T, door_w, door_h, seed, sink=2.5, segs=72, rings=30):
    """domed rock shell (ellipsoid W×D×H, carried `sink` m below ground) with an arched doorway facing +Y:
    door_w = half-angle of the opening (rad), door_h = its height (m). Each column of the grid starts at the doorway's
    arch (or below ground), so the opening has a smooth rounded rim instead of a stepped one. Rock relief is radial
    fractal noise."""
    from mathutils import noise, Vector
    bm = bmesh.new()
    el0 = -math.asin(min(0.95, sink / H))
    cols = []
    for i in range(segs):
        az = 2 * PI * i / segs
        off = abs(math.atan2(math.sin(az - PI / 2), math.cos(az - PI / 2)))
        if off < door_w:
            zd = door_h * max(0.0, 1 - (off / door_w) ** 4) ** 0.25
            el_min = math.asin(min(0.97, zd / H))
        elif off < door_w * 1.18:
            el_min = el0 * (off - door_w) / (door_w * 0.18)
        else:
            el_min = el0
        col = []
        for j in range(rings + 1):
            el = el_min + (PI / 2 - el_min) * (j / rings) ** 1.15
            d = Vector((math.cos(az) * math.cos(el), math.sin(az) * math.cos(el), math.sin(el)))
            p = Vector((d.x * W / 2, d.y * D / 2, d.z * H))
            q = p * (1.0 / 1.7) + Vector((seed * 3.1, seed * 1.7, 0))
            n = 0.7 * noise.fractal(q, 1.0, 2.0, 4) + 0.3 * noise.noise(p * 1.4) + 0.1 * noise.noise(p * 4.5)
            n += 0.25 * max(0.0, noise.voronoi(p * 0.9)[0][0] - 0.4)
            r = 1.0 + 0.3 * n
            lean = 0.12 * d.z * (1 + noise.noise(Vector((seed, 0.3, 0.7))))
            col.append(bm.verts.new((p.x * r + lean * W * 0.3, p.y * r, p.z * (1.0 + 0.22 * n) * (0.85 + 0.15 * abs(d.x)))))
        cols.append(col)
    top = bm.verts.new(sum((c[-1].co for c in cols), Vector()) / segs)
    for i in range(segs):
        a, b = cols[i], cols[(i + 1) % segs]
        for j in range(rings - 1):
            bm.faces.new((a[j], b[j], b[j + 1], a[j + 1]))
        bm.faces.new((a[rings - 1], b[rings - 1], top))
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = kit.from_bmesh(name, bm, ("miller_cave_rock",))
    kit.add_solidify(o, T, 1.0, even=False)
    kit.bake(o)
    kit.smooth(o, 50)
    return o


def boulders(name, n, area, rng):
    parts = []
    for k in range(n):
        r = rng.uniform(0.25, 0.7)
        b = kit.sphere(f"{name}{k}", r, loc=(rng.uniform(-area[0], area[0]), rng.uniform(area[1], area[2]), r * 0.3), m="miller_cave_rock", segs=10, rings=6,
                       scale=(1, rng.uniform(0.7, 1.2), rng.uniform(0.5, 0.8)))
        kit.bake(b)
        from mathutils import noise
        for v in b.data.vertices:
            v.co *= 1 + 0.25 * noise.noise(v.co * (2.5 / r) + noise.random_unit_vector())
        parts.append(b)
    return kit.merge(parts, name)


def export(root, objs, path, props):
    o = kit.merge(objs, root.name + "_mesh") if len(objs) > 1 else objs[0]
    o.parent = root
    import paint as PNT
    import paint_specs  # noqa: F401
    PNT.bake_body(o, root.name, size=1024)
    C.bake_ao(o, distance=1.5)
    kit.set_props(root, **props)
    kit.select_tree(root)
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_apply=True, export_extras=True, export_yup=True,
                              export_animations=False, export_cameras=False, export_materials="EXPORT",
                              export_vertex_color="NAME", export_vertex_color_name="AO", export_all_vertex_colors=False,
                              export_image_format="JPEG", export_jpeg_quality=88)
    tris = sum(len(p.vertices) - 2 for p in o.data.polygons)
    print(f"[cave] {path} ~{tris} tris, {os.path.getsize(path) / 1e6:.2f} MB")


def build(kind):
    kit.reset()
    rng = random.Random(hash(kind) % 1000)
    root = empty(kind)
    if kind == "miller_cave_shelter":
        objs = [shell("shelter", 6.0, 6.0, 4.2, 0.9, 0.95, 3.1, 11), boulders("bo", 5, (3.0, 3.2, 5.0), rng)]
    elif kind == "miller_cave_ledge":
        objs = [shell("ledge", 15.0, 8.0, 3.8, 1.1, 1.25, 3.0, 23, segs=80), boulders("bo", 7, (6.0, 4.2, 6.0), rng)]
    else:
        objs = [shell("den", 4.8, 4.4, 2.0, 0.6, 0.9, 1.35, 37), boulders("bo", 4, (2.0, 2.4, 3.2), rng)]
    export(root, objs, os.path.join(kit.out_dir(), kind + ".glb"), {"cave": kind})
    return root


if __name__ == "__main__":
    which = [a for a in sys.argv[1:] if not a.startswith("--")] or ["miller_cave_shelter", "miller_cave_ledge", "miller_cave_den"]
    for w in which:
        build(w)
        if "--nopreview" not in sys.argv:
            kit.preview(os.path.join(kit.preview_dir(), f"{w}.png"), (9, 14, 5), (0, 0, 1.2), lens=30, samples=16, world=(0.5, 0.55, 0.58), sun=(0.4, -0.5, 0.8), sun_strength=3.5)
