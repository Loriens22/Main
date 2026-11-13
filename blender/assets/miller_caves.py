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


def shell(name, W, D, H, T, door_w, door_h, seed, sink=2.5, segs=64, rings=28):
    """domed rock shell (ellipsoid W×D×H, carried `sink` m below ground) with an arched doorway facing +Y:
    door_w = half-angle of the opening (rad), door_h = its height (m). Rock relief is radial fractal noise."""
    from mathutils import noise, Vector
    bm = bmesh.new()
    el0 = -math.asin(min(0.95, sink / H))
    grid = []
    for j in range(rings + 1):
        el = el0 + (PI / 2 - el0) * j / rings
        row = []
        for i in range(segs):
            az = 2 * PI * i / segs
            d = Vector((math.cos(az) * math.cos(el), math.sin(az) * math.cos(el), math.sin(el)))
            p = Vector((d.x * W / 2, d.y * D / 2, d.z * H))
            q = p * (1.0 / 1.7) + Vector((seed * 3.1, seed * 1.7, 0))
            n = 0.7 * noise.fractal(q, 1.0, 2.0, 4) + 0.3 * noise.noise(p * 1.4) + 0.1 * noise.noise(p * 4.5)
            n += 0.25 * max(0.0, noise.voronoi(p * 0.9)[0][0] - 0.4)
            r = 1.0 + 0.3 * n
            # lumpy, slumped: not a dome — bulges, a sagging crown, a leaning top
            lean = 0.12 * d.z * (1 + noise.noise(Vector((seed, 0.3, 0.7))))
            row.append(bm.verts.new((p.x * r + lean * W * 0.3, p.y * r, p.z * (1.0 + 0.22 * n) * (0.85 + 0.15 * abs(d.x)))))
        grid.append(row)
    for j in range(rings):
        for i in range(segs):
            a, b = grid[j][i], grid[j][(i + 1) % segs]
            c, dd = grid[j + 1][(i + 1) % segs], grid[j + 1][i]
            cen = (a.co + b.co + c.co + dd.co) / 4
            az = math.atan2(cen.y / (D / 2), cen.x / (W / 2))
            off = abs(math.atan2(math.sin(az - PI / 2), math.cos(az - PI / 2)))
            if off < door_w and cen.z < door_h * (1 - (off / door_w) ** 2) ** 0.5:
                continue  # the doorway
            bm.faces.new((a, b, c, dd))
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = kit.from_bmesh(name, bm, ("miller_cave_rock",))
    kit.add_solidify(o, T, 1.0)
    kit.bake(o)
    kit.smooth(o, 40)
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
    C.bake_ao(o, distance=1.5)
    kit.set_props(root, **props)
    kit.select_tree(root)
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_apply=True, export_extras=True, export_yup=True,
                              export_animations=False, export_cameras=False, export_materials="EXPORT",
                              export_vertex_color="NAME", export_vertex_color_name="AO", export_all_vertex_colors=False)
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
