"""
Mars subsurface refuge — a game alternate-history extension (no such cavern is known on Mars): a sealed lava-tube
cavern under a rocky massif beside each Mars landing site, with a brine lake, a warm channel, an ice shelf under an
ice skylight and mineral columns. Layout: src/world/surface/marsRefuge.json (shared with the runtime, which carves the
floor into the terrain heightfield and adds the water). This builds:
  mars_refuge.glb      the rock shell (outer massif + inner cavern dome + the lava-tube entrance cut through it),
                       mineral columns and stalactites — one trimesh collider at runtime
  mars_refuge_ice.glb  the ice shelf over the deep end of the lake and the ice plug in the skylight
Blender: +X east, +Y north (= −z in the refuge frame), +Z up; the origin is the refuge centre at the levelled ground.
"""
import sys, os, math, json, random
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "lib"))
import bpy, bmesh
from mathutils import Vector, noise
import kit
from kit import V, empty
import creature as C

L = json.load(open(os.path.join(HERE, "..", "..", "src", "world", "surface", "marsRefuge.json")))
PI, TAU = math.pi, math.tau

kit.PALETTE.update({
    "refuge_crust": dict(color=(0.36, 0.2, 0.13), rough=0.9),
    "refuge_basalt": dict(color=(0.07, 0.055, 0.05), rough=0.6),
    "refuge_mineral": dict(color=(0.32, 0.14, 0.06), rough=0.45),
    "refuge_ice": dict(color=(0.75, 0.85, 0.92), rough=0.08, alpha=0.5),
    "refuge_floor": dict(color=(0.1, 0.07, 0.055), rough=0.55),
})


def bxy(x, z):
    """refuge (x east, z south) → Blender (x, y)"""
    return x, -z


def _cells(p, scale, w=0.12):
    dd, pts = noise.voronoi(p * scale)
    k = min(1.0, (dd[1] - dd[0]) / w)
    return k * k * (3 - 2 * k) * (0.6 + 0.4 * noise.noise(pts[0] * 3.1))


def mound_h(r, th):
    """a small mesa: a flat-ish cap, steep ledged scarps all round, blocky jointed rock, talus at the foot"""
    M = L["mound"]
    R = M["r"]
    p = Vector((math.cos(th) * r, math.sin(th) * r, 0))
    edge = R * (0.8 + 0.06 * noise.noise(p * 0.03 + Vector((0, 0, 4))))
    x = max(0.0, min(1.0, (edge - r) / (edge - R * 0.62)))
    cap = x * x * (3 - 2 * x)
    h = (M["h"] + 2.5) * cap
    h += (1.8 * noise.noise(p * 0.03) + 0.9 * abs(noise.noise(p * 0.08 + Vector((3, 1, 0))))) * cap
    # jointed blocks on the cap and down the scarps
    h += 2.4 * _cells(p, 0.05, 0.3) * min(1.0, cap * 3) + 0.7 * noise.noise(p * 0.25) * min(1.0, cap * 4)
    # ledges in the scarp
    h = h - 0.6 * math.sin(h * 1.4) * (1 - cap) * cap * 4
    # talus apron: rubble at the foot
    foot = max(0.0, 1 - abs(r - edge) / 9) * (1 - cap)
    h += foot * (1.6 + 0.9 * noise.noise(p * 0.3))
    # beyond the talus the brim sinks just under the levelled ground (no z-fighting with the terrain)
    h -= 0.9 * (1 - cap) * (1 - min(1.0, foot * 2))
    # fade to the ground at the rim
    h *= min(1.0, max(0.0, (R - r) / 4))
    return h


def cavern_z(r, th):
    Cv = L["cavern"]
    x = min(1.0, r / Cv["r"])
    top = Cv["ceil"] - Cv["wallBase"]
    p = Vector((math.cos(th) * r, math.sin(th) * r, 0))
    z = Cv["wallBase"] + top * max(0.0, 1 - x ** 4) ** 0.25
    return z + (1.4 * noise.noise(p * 0.06 + Vector((7, 0, 0))) + 0.5 * noise.noise(p * 0.22)) * (1 - x ** 6)


def shell():
    M, Cv = L["mound"], L["cavern"]
    bm = bmesh.new()
    na = 256
    # outer massif: rings r 0..R, then a skirt down into the ground
    rings_o = []
    nr = 64
    for i in range(nr + 1):
        r = M["r"] * (i / nr)
        row = []
        if i == 0:
            rings_o.append([bm.verts.new((0, 0, mound_h(0.0, 0.0)))] * na)
            continue
        for j in range(na):
            th = TAU * j / na
            row.append(bm.verts.new((math.cos(th) * r, math.sin(th) * r, mound_h(r, th))))
        rings_o.append(row)
    skirt = [bm.verts.new((math.cos(TAU * j / na) * (M["r"] + 1.5), math.sin(TAU * j / na) * (M["r"] + 1.5), M["skirt"])) for j in range(na)]
    rings_o.append(skirt)
    # inner cavern dome: rings r 0..Rc (normals inward)
    rings_i = []
    ni = 56
    for i in range(ni + 1):
        r = Cv["r"] * (i / ni) ** 0.8
        row = []
        if i == 0:
            rings_i.append([bm.verts.new((0, 0, cavern_z(0.0, 0.0)))] * na)
            continue
        for j in range(na):
            th = TAU * j / na
            row.append(bm.verts.new((math.cos(th) * r, math.sin(th) * r, cavern_z(r, th))))
        rings_i.append(row)
    outer_faces, inner_faces = [], []
    for rows, acc in ((rings_o, outer_faces), (rings_i, inner_faces)):
        for i in range(len(rows) - 1):
            a, b = rows[i], rows[i + 1]
            for j in range(na):
                if i == 0:
                    acc.append(bm.faces.new((a[0], b[j], b[(j + 1) % na])))
                else:
                    acc.append(bm.faces.new((a[j], b[j], b[(j + 1) % na], a[(j + 1) % na])))
    # base annulus: the cavern wall foot to the skirt foot
    for j in range(na):
        inner_faces.append(bm.faces.new((rings_i[-1][j], rings_i[-1][(j + 1) % na], skirt[(j + 1) % na], skirt[j])))
    for f in outer_faces:
        f.material_index = 0
    for f in inner_faces:
        f.material_index = 1
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = kit.from_bmesh("refuge_shell", bm, ("refuge_crust", "refuge_basalt"))
    return o


def tube_cutter(pts, w, h, ext=6.0):
    """an oval tube along the tunnel's floor polyline (pts: refuge x, z, floor y); the floor sits 0.25·h above its bottom"""
    P = [Vector((*bxy(p[0], p[1]), p[2])) for p in pts]
    d0 = (P[1] - P[0]).normalized()
    d1 = (P[-1] - P[-2]).normalized()
    P = [P[0] - d0 * ext] + P + [P[-1] + d1 * ext]
    path = []
    for i in range(len(P) - 1):
        for k in range(12):
            path.append(P[i].lerp(P[i + 1], k / 12))
    path.append(P[-1])
    bm = bmesh.new()
    rows = []
    n = 28
    for i, c in enumerate(path):
        t = (path[min(i + 1, len(path) - 1)] - path[max(i - 1, 0)])
        t.z = 0
        t.normalize()
        side = Vector((-t.y, t.x, 0))
        row = []
        for j in range(n):
            a = TAU * j / n
            wob = 1 + 0.08 * noise.noise(c * 0.15 + Vector((j * 0.3, 0, 0)))
            row.append(bm.verts.new(c + side * (math.cos(a) * w * 0.5 * wob) + Vector((0, 0, h * 0.25 + math.sin(a) * h * 0.75 * wob))))
        rows.append(row)
    for i in range(len(rows) - 1):
        for j in range(n):
            bm.faces.new((rows[i][j], rows[i][(j + 1) % n], rows[i + 1][(j + 1) % n], rows[i + 1][j]))
    for row in (rows[0], rows[-1]):
        bm.faces.new(row)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return kit.from_bmesh("tunnel_cut", bm, ("refuge_basalt",))


def cylinder_cutter(c, r, z0, z1):
    bm = bmesh.new()
    n = 40
    lo = [bm.verts.new((c[0] + math.cos(TAU * j / n) * r * (1 + 0.1 * math.sin(j * 1.7)), c[1] + math.sin(TAU * j / n) * r, z0)) for j in range(n)]
    hi = [bm.verts.new((v.co.x, v.co.y, z1)) for v in lo]
    for j in range(n):
        bm.faces.new((lo[j], lo[(j + 1) % n], hi[(j + 1) % n], hi[j]))
    bm.faces.new(lo)
    bm.faces.new(hi)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return kit.from_bmesh("sky_cut", bm, ("refuge_basalt",))


def cut(target, cutter):
    mod = target.modifiers.new("cut", "BOOLEAN")
    mod.operation = "DIFFERENCE"
    mod.solver = "EXACT"
    mod.object = cutter
    kit.bake(target)
    bpy.data.objects.remove(cutter, do_unlink=True)


def _ss(e0, e1, x):
    t = min(1.0, max(0.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


def ledge_level(x, z):
    """the entry ledge: from the tunnel's inner end it descends along the cavern wall to the floor (None off it)"""
    lg = L["ledge"]
    r = math.hypot(x, z)
    phi = math.atan2(z, x)
    u = (lg["from"] - phi) / lg["span"]
    if u < -0.05 or u > 1.0 or r < lg["edge"] - 12:
        return None
    top = lg["top"] + (L["cavern"]["floor"] - lg["top"]) * _ss(0.0, 1.0, max(0.0, u))
    # the shelf is flat out to its edge, then a steep talus down to the floor
    return top - 1.1 * max(0.0, lg["edge"] - r)


def tunnel_floor(x, z):
    """the tunnel's floor (None outside its corridor)"""
    T = L["tunnel"]
    best = None
    for i in range(len(T["pts"]) - 1):
        ax, az, ay = T["pts"][i]
        bx, bz, by = T["pts"][i + 1]
        dx, dz = bx - ax, bz - az
        ll = dx * dx + dz * dz
        t = max(0.0, min(1.0, ((x - ax) * dx + (z - az) * dz) / ll))
        d = math.hypot(x - (ax + dx * t), z - (az + dz * t))
        if d < T["w"] * 0.5 + 1.5 and (best is None or d < best[0]):
            best = (d, ay + (by - ay) * t)
    if best is None:
        return None
    d, y = best
    # a shallow trough: the floor rises a little toward the walls
    return y + 0.5 * _ss(T["w"] * 0.2, T["w"] * 0.55, d)


def floor_y(x, z):
    """the refuge floor (refuge frame, relative to y0): dry cave floor, entry ledge, lake shelf and deep basin,
    vent mounds, the warm channel. The runtime samples the exported floor mesh rather than re-implementing this."""
    Cv, lk, ch = L["cavern"], L["lake"], L["channel"]
    r = math.hypot(x, z)
    p = Vector((x, z, 0))
    h = Cv["floor"] + 0.45 * noise.noise(p * 0.12) + 0.18 * noise.noise(p * 0.55 + Vector((0, 0, 3)))
    h += 4.5 * _ss(48, Cv["r"] + 1, r)          # talus banked against the wall
    # the lake: a shelf in the west, a deep basin under the ice in the east
    dl = math.hypot(x - lk["c"][0], z - lk["c"][1])
    if dl < lk["r"]:
        k = _ss(lk["deepFrom"], lk["deepTo"], x)
        bottom = lk["shelf"] + (lk["deep"] - lk["shelf"]) * k + 0.6 * noise.noise(p * 0.2 + Vector((0, 0, 9)))
        e = _ss(lk["r"] - 7, lk["r"], dl)
        h = bottom + (h - bottom) * e
        for vx, vz in L["vents"]:
            h = max(h, lk["shelf"] + 2.4 * math.exp(-((x - vx) ** 2 + (z - vz) ** 2) / 8.0) + 0.3 * noise.noise(p * 0.8))
    # the warm channel from the west vents into the lake
    ax, az = ch["a"]
    bx, bz = ch["b"]
    dx, dz = bx - ax, bz - az
    t = max(0.0, min(1.0, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)))
    d = math.hypot(x - (ax + dx * t), z - (az + dz * t))
    if d < ch["w"]:
        cb = ch["bottom"] + 0.3 * noise.noise(p * 0.5)
        h = min(h, cb + (h - cb) * _ss(ch["w"] * 0.32, ch["w"] * 0.62, d))
    lv = ledge_level(x, z)
    if lv is not None:
        h = max(h, lv)
    tf = tunnel_floor(x, z)
    if tf is not None and r > Cv["r"] - 6:
        h = tf if r > Cv["r"] else max(h, tf)
    return h


def floor_mesh():
    """the walkable floor at 0.7 m: the cavern, the entry ledge, the tunnel out to its mouth"""
    step = 0.7
    T = L["tunnel"]
    x0, x1, z0, z1 = -L["cavern"]["r"] - 2, L["cavern"]["r"] + 2, T["pts"][0][1] + 4, L["cavern"]["r"] + 2
    nx, nz = int((x1 - x0) / step) + 1, int((z1 - z0) / step) + 1
    Rm = L["mound"]["r"] * 0.79

    def keep(x, z):
        r = math.hypot(x, z)
        if r < L["cavern"]["r"] + 1.5:
            return True
        tf = tunnel_floor(x, z)
        return tf is not None and r < Rm

    bm = bmesh.new()
    vid = {}
    for j in range(nz):
        for i in range(nx):
            x, z = x0 + i * step, z0 + j * step
            if keep(x, z):
                bx, by = bxy(x, z)
                vid[(i, j)] = bm.verts.new((bx, by, floor_y(x, z)))
    for j in range(nz - 1):
        for i in range(nx - 1):
            q = [vid.get(k) for k in ((i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1))]
            if all(q):
                bm.faces.new(q)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for f in bm.faces:
        if f.normal.z < 0:
            f.normal_flip()
    o = kit.from_bmesh("refuge_floor", bm, ("refuge_floor",))
    kit.smooth(o, 60)
    return o


def column(name, x, z, r, rng):
    """a dripstone column from the floor to the cavern roof: fluted, waisted, flared at both ends"""
    bx, by = bxy(x, z)
    rr = math.hypot(bx, by)
    th = math.atan2(by, bx)
    z0 = floor_y(x, z) - 1.0
    z1 = cavern_z(rr, th) + 1.0
    bm = bmesh.new()
    n, m = 22, 30
    rows = []
    for i in range(m + 1):
        t = i / m
        zz = z0 + (z1 - z0) * t
        flare = 1 + 1.6 * math.exp(-t / 0.08) + 1.3 * math.exp(-(1 - t) / 0.1)
        waist = 1 - 0.25 * math.sin(PI * t) ** 2
        row = []
        for j in range(n):
            a = TAU * j / n
            flute = 1 + 0.12 * math.cos(a * 7 + 3 * t) + 0.06 * noise.noise(Vector((a * 2, t * 9, rr)))
            rad = r * flare * waist * flute
            row.append(bm.verts.new((bx + math.cos(a) * rad, by + math.sin(a) * rad, zz)))
        rows.append(row)
    for i in range(m):
        for j in range(n):
            bm.faces.new((rows[i][j], rows[i][(j + 1) % n], rows[i + 1][(j + 1) % n], rows[i + 1][j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = kit.from_bmesh(name, bm, ("refuge_mineral",))
    kit.smooth(o, 50)
    return o


def stalactite(name, x, y, L_, r, base_z):
    bm = bmesh.new()
    n = 8
    rows = []
    for i in range(6):
        t = i / 5
        rad = r * (1 - t) ** 1.3 + 0.01
        rows.append([bm.verts.new((x + math.cos(TAU * j / n) * rad, y + math.sin(TAU * j / n) * rad, base_z + 0.5 - (L_ + 0.5) * t)) for j in range(n)])
    for i in range(5):
        for j in range(n):
            bm.faces.new((rows[i][j], rows[i][(j + 1) % n], rows[i + 1][(j + 1) % n], rows[i + 1][j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return kit.from_bmesh(name, bm, ("refuge_mineral",))


def ice_shelf():
    """the ice over the deep end of the lake: its west front a wavy ice cliff, its top just above the water"""
    lk, ic = L["lake"], L["ice"]
    bm = bmesh.new()
    # outline: the lake circle east of x0 (wavy front); build as a fan of radial strips
    cx, cz = lk["c"]
    R = lk["r"] + 1.5
    pts = []
    n = 64
    for k in range(n + 1):
        # sweep the front (west edge) from north to south, then the shore arc back
        u = k / n
        z = cz - R + 2 * R * u
        dz = z - cz
        xs = cx + math.sqrt(max(R * R - dz * dz, 0.0))
        xf = ic["x0"] + 1.8 * math.sin(z * 0.37) + 1.1 * math.sin(z * 0.9 + 1)
        if xf < xs - 0.5:
            pts.append((xf, z, xs))
    top, bot = [], []
    for (xf, z, xs) in pts:
        rt, rb = [], []
        for i in range(9):
            x = xf + (xs - xf) * i / 8
            bx, by = bxy(x, z)
            bump = 0.15 * noise.noise(Vector((x * 0.3, z * 0.3, 0)))
            rt.append(bm.verts.new((bx, by, ic["top"] + bump + 0.25 * (i / 8) ** 2)))
            rb.append(bm.verts.new((bx, by, ic["bottom"] - 0.3 * noise.noise(Vector((x * 0.2, z * 0.2, 5))) - 0.4 * (1 - i / 8))))
        top.append(rt)
        bot.append(rb)
    for k in range(len(top) - 1):
        for i in range(8):
            bm.faces.new((top[k][i], top[k][i + 1], top[k + 1][i + 1], top[k + 1][i]))
            bm.faces.new((bot[k][i], bot[k + 1][i], bot[k + 1][i + 1], bot[k][i + 1]))
        # the front cliff and the shore edge
        bm.faces.new((top[k][0], top[k + 1][0], bot[k + 1][0], bot[k][0]))
        bm.faces.new((top[k][8], bot[k][8], bot[k + 1][8], top[k + 1][8]))
    for row_t, row_b in ((top[0], bot[0]), (top[-1], bot[-1])):
        for i in range(8):
            bm.faces.new((row_t[i], row_b[i], row_b[i + 1], row_t[i + 1]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    o = kit.from_bmesh("ice_shelf", bm, ("refuge_ice",))
    kit.smooth(o, 40)
    # icicles under the front edge
    parts = [o]
    rng = random.Random(77)
    for k, (xf, z, xs) in enumerate(pts[::2]):
        bx, by = bxy(xf + 0.3, z)
        parts.append(stalactite(f"icl{k}", bx, by, rng.uniform(0.3, 1.1), rng.uniform(0.08, 0.2), ic["bottom"] + 0.2))
        parts[-1].data.materials[0] = kit.M("refuge_ice")
    return kit.merge(parts, "ice")


def skylight_plug():
    s = L["skylight"]
    bx, by = bxy(*s["c"])
    r = s["r"] + 0.6
    th = math.atan2(by, bx)
    rr = math.hypot(bx, by)
    z1 = mound_h(rr, th) + 0.3
    z0 = z1 - 2.2
    o = cylinder_cutter((bx, by), r, z0, z1)
    o.name = "skylight_ice"
    o.data.materials[0] = kit.M("refuge_ice")
    return o


def build():
    kit.reset()
    root = empty("MarsRefuge")
    sh = shell()
    T = L["tunnel"]
    cut(sh, tube_cutter(T["pts"], T["w"], T["h"]))
    s = L["skylight"]
    bx, by = bxy(*s["c"])
    cut(sh, cylinder_cutter((bx, by), s["r"], -5, 40))
    rng = random.Random(912)
    parts = [sh]
    for k, (x, z, r) in enumerate(L["columns"]):
        parts.append(column(f"col{k}", x, z, r, rng))
    # stalactites over the dry floor and the open water (not over the skylight)
    st = []
    for k in range(140):
        a = rng.uniform(0, TAU)
        r = L["cavern"]["r"] * math.sqrt(rng.uniform(0.02, 0.8))
        x, y = math.cos(a) * r, math.sin(a) * r
        if math.hypot(x - bx, y - by) < s["r"] + 2:
            continue
        st.append(stalactite(f"st{k}", x, y, rng.uniform(0.4, 3.2), rng.uniform(0.12, 0.5), cavern_z(r, a)))
    parts.append(kit.merge(st, "stalactites"))
    body = kit.merge(parts, "refuge")
    kit.smooth(body, 35)
    body.parent = root
    fl = floor_mesh()
    fl.parent = root
    C.bake_ao(body, distance=5.0, samples=16, floor=0.28)
    C.bake_ao(fl, distance=4.0, samples=16, floor=0.3)
    kit.select_tree(root)
    path = os.path.join(kit.out_dir(), "mars_refuge.glb")
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_apply=True, export_extras=True, export_yup=True,
                              export_animations=False, export_cameras=False, export_materials="EXPORT",
                              export_vertex_color="NAME", export_vertex_color_name="AO", export_all_vertex_colors=False)
    tris = sum(len(p.vertices) - 2 for p in body.data.polygons) + sum(len(p.vertices) - 2 for p in fl.data.polygons)
    print(f"[refuge] {path} ~{tris} tris, {os.path.getsize(path) / 1e6:.2f} MB")
    # the ice
    kit.reset()
    root = empty("MarsRefugeIce")
    ice = kit.merge([ice_shelf(), skylight_plug()], "refuge_ice")
    ice.parent = root
    kit.select_tree(root)
    path = os.path.join(kit.out_dir(), "mars_refuge_ice.glb")
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_apply=True, export_extras=True, export_yup=True,
                              export_animations=False, export_cameras=False, export_materials="EXPORT")
    print(f"[refuge] {path} {os.path.getsize(path) / 1e6:.2f} MB")
    return body


if __name__ == "__main__":
    build()
    if "--nopreview" not in sys.argv:
        bpy.ops.import_scene.gltf(filepath=os.path.join(kit.out_dir(), "mars_refuge.glb"))
        kit.preview(os.path.join(kit.preview_dir(), "mars_refuge.png"), (150, -170, 90), (0, 0, 0), lens=30, samples=12, world=(0.55, 0.42, 0.35))
