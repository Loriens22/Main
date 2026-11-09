"""
Organic & small props: corn plants (3 variants × 2 LODs), granite boulders (Edmunds), rocks, ice formations.
Exports public/assets/models/corn.glb, rocks.glb
"""
import sys, os, math, random
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "lib"))
import kit
from kit import V, empty, merge, finish
import bmesh


def leaf(bm, base, yaw, length, width, rise, droop, segs, twist=0.0, uvl=None, colv=None, shade=0.0):
    """Arching corn leaf with a V-folded midrib. base: (x,y,z) on the stalk."""
    rows = []
    for i in range(segs + 1):
        t = i / segs
        # arch: rises then droops; width tapers (widest ~35%)
        along = length * t
        z = rise * math.sin(min(1.0, t * 1.6) * math.pi / 2) - droop * t * t
        w = width * (math.sin(math.pi * min(1, t * 1.15)) ** 0.7) * (1 - 0.85 * t ** 3)
        fold = w * 0.35
        tw = twist * t
        # leaf local frame: outwards along yaw
        ox, oy = math.cos(yaw), math.sin(yaw)
        px, py = -oy, ox
        cx = base[0] + ox * along * 0.95
        cy = base[1] + oy * along * 0.95
        cz = base[2] + z
        pts = []
        for s in (-1, 0, 1):
            lat = s * w * 0.5
            lift = (0 if s == 0 else fold) * (1 - t)
            rx = px * lat * math.cos(tw)
            ry = py * lat * math.cos(tw)
            rz = lat * math.sin(tw) + lift
            pts.append(bm.verts.new((cx + rx, cy + ry, cz + rz)))
        rows.append(pts)
    faces = []
    for i in range(segs):
        for k in range(2):
            f = bm.faces.new((rows[i][k], rows[i][k + 1], rows[i + 1][k + 1], rows[i + 1][k]))
            faces.append((f, i / segs, (i + 1) / segs, k))
    return faces


def corn_plant(name, seed, lod=0):
    r = random.Random(seed)
    bm = bmesh.new()
    H = r.uniform(2.05, 2.45)
    # stalk: tapered prism with nodes
    sides = 6 if lod == 0 else 4
    nodes = 9 if lod == 0 else 4
    rings = []
    for i in range(nodes + 1):
        t = i / nodes
        z = H * 0.86 * t
        rad = 0.016 * (1 - t * 0.55) + (0.003 if i % 2 == 0 else 0)
        lean = 0.04 * t * t
        rings.append([bm.verts.new((math.cos(a) * rad + lean, math.sin(a) * rad, z)) for a in [2 * math.pi * k / sides for k in range(sides)]])
    stalk_faces = []
    for i in range(nodes):
        for k in range(sides):
            j = (k + 1) % sides
            stalk_faces.append(bm.faces.new((rings[i][k], rings[i][j], rings[i + 1][j], rings[i + 1][k])))
    # leaves: distichous with jitter
    nleaves = 11 if lod == 0 else 6
    leaf_faces = []
    for i in range(nleaves):
        t = (i + 1) / (nleaves + 1)
        z = H * 0.82 * t ** 0.9 + 0.12
        yaw = (0 if i % 2 == 0 else math.pi) + r.uniform(-0.5, 0.5) + 0.6
        length = 0.55 + 0.45 * math.sin(math.pi * min(1, t * 1.25)) + r.uniform(-0.05, 0.05)
        width = 0.075 + 0.02 * math.sin(math.pi * t)
        rise = 0.12 + 0.3 * (1 - t) * r.uniform(0.6, 1.0)
        droop = 0.25 + 0.55 * t * r.uniform(0.7, 1.2)
        segs = 8 if lod == 0 else 4
        leaf_faces += leaf(bm, (0.04 * t * t, 0, z), yaw, length, width, rise, droop, segs, twist=r.uniform(-0.6, 0.6))
    # ear with husk (one per plant, sometimes two)
    if lod == 0:
        for e in range(1 if r.random() < 0.7 else 2):
            ez = H * (0.42 + e * 0.1)
            yaw = r.uniform(0, 2 * math.pi)
            res = bmesh.ops.create_cone(bm, cap_ends=True, segments=6, radius1=0.028, radius2=0.012, depth=0.22)
            for v in res["verts"]:
                co = V(v.co)
                # tilt outward
                co.rotate(kit.Euler((0.45, 0, yaw)))
                v.co = co + V((math.cos(yaw) * 0.05, math.sin(yaw) * 0.05, ez))
            for f in {f for v in res["verts"] for f in v.link_faces}:
                f.material_index = 2
    # tassel
    tz = H * 0.86
    tassel_faces = []
    branches = 7 if lod == 0 else 3
    for b in range(branches):
        yaw = 2 * math.pi * b / branches + r.uniform(-0.3, 0.3)
        L = r.uniform(0.18, 0.3)
        up = r.uniform(0.25, 0.9)
        base = V((0.04 * 0.74, 0, tz + b * 0.015))
        tip = base + V((math.cos(yaw) * L * (1 - up * 0.5), math.sin(yaw) * L * (1 - up * 0.5), L * up - 0.03))
        n = V((-math.sin(yaw), math.cos(yaw), 0)) * 0.006
        a1 = bm.verts.new(base - n); a2 = bm.verts.new(base + n); b1 = bm.verts.new(tip + n * 0.3); b2 = bm.verts.new(tip - n * 0.3)
        f = bm.faces.new((a1, a2, b1, b2))
        f.material_index = 2
    central = bm.verts.new((0.03, 0, tz + 0.38)), bm.verts.new((0.03 + 0.006, 0, tz)), bm.verts.new((0.03 - 0.006, 0, tz))
    f = bm.faces.new(central)
    f.material_index = 2
    for f in stalk_faces:
        f.material_index = 1
    # UVs: u = across leaf, v = height fraction (used for gradient shading in the shader)
    uvl = bm.loops.layers.uv.new("UVMap")
    for f in bm.faces:
        for loop in f.loops:
            loop[uvl].uv = (0.5, loop.vert.co.z / H)
    o = kit.from_bmesh(name, bm, ("corn_leaf", "corn_stalk", "corn_tassel"))
    kit.smooth(o, 70)
    o["height"] = H
    return o


def boulder(name, seed, size=1.0, flat=0.7, m="rock_granite", sub=3):
    """Rounded weathered granite boulder (Edmunds' planet, image 21): icosphere + layered noise displacement."""
    r = random.Random(seed)
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=1.0)
    off = [V((r.uniform(-100, 100), r.uniform(-100, 100), r.uniform(-100, 100))) for _ in range(3)]
    from mathutils import noise
    for v in bm.verts:
        p = V(v.co)
        n = 0.0
        amp, freq = 0.28, 1.0
        for k in range(4):
            n += noise.noise(p * freq + off[k % 3]) * amp
            amp *= 0.5
            freq *= 2.1
        # granite: rounded blocks with a few planar joints
        jz = max(-1.0, min(1.0, p.z))
        d = 1.0 + n
        v.co = V((p.x * d * size * r.uniform(0.95, 1.05), p.y * d * size * 0.85, max(p.z * d * size * flat, -0.25 * size)))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = kit.from_bmesh(name, bm, (m,))
    kit.smooth(o, 45)
    return o


def build():
    kit.reset()
    root = empty("Corn")
    for lod in (0, 1):
        for i in range(3):
            o = corn_plant(f"corn_{i}_lod{lod}", 100 + i * 7, lod)
            o.parent = root
            o.location = (i * 1.0, lod * 1.0, 0)
            o["variant"] = i
            o["lod"] = lod
            kit.uv_box  # keep custom uv
    kit.export_glb(os.path.join(kit.out_dir(), "corn.glb"), root)
    for o in kit.all_children(root):
        if o.type == "MESH":
            print(o.name, sum(len(p.vertices) - 2 for p in o.data.polygons), "tris")
    kit.preview(os.path.join(kit.preview_dir(), "corn.png"), (1.0, -3.2, 1.5), (1.0, 0, 1.2), lens=30, samples=16, world=(0.7, 0.7, 0.62))

    # boulders & rocks
    kit.reset()
    root = empty("Rocks")
    k = 0
    for i in range(6):
        o = boulder(f"boulder_{i}", 300 + i, 1.0, flat=random.Random(i).uniform(0.55, 0.85))
        o.parent = root
        o.location = (i * 3.0, 0, 0)
        kit.uv_box(o)
    for i in range(4):
        o = boulder(f"rock_dark_{i}", 400 + i, 1.0, flat=0.5, m="rock_dark", sub=2)
        o.parent = root
        o.location = (i * 3.0, 4, 0)
        kit.uv_box(o)
    for i in range(3):
        o = boulder(f"ice_{i}", 500 + i, 1.0, flat=0.9, m="ice", sub=3)
        o.parent = root
        o.location = (i * 3.0, 8, 0)
        kit.uv_box(o)
    kit.export_glb(os.path.join(kit.out_dir(), "rocks.glb"), root)


if __name__ == "__main__":
    build()
