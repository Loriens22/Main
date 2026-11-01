# Building elements shared by the hero scripts (see herolib.py): facade frames on footprint edges, curtain walls
# with real mullions, balcony stacks, pixel-checker cladding, colonnades, parapets and roof plant, extruded 3D
# letters (Blender text objects converted to mesh), canopies, cafe furniture and shop interiors behind glass.
import math
import random

import bpy
import herolib as H

FONTS = {
    'sans': '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
    'sansR': '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
    'dejavu': '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
    'serif': '/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf',
}
_fonts = {}


def frame(hb, e, y=0.0, s=0.0, out=0.0):
    """Frame on a footprint edge: local x along the edge from a (s metres in), y up, z out of the wall."""
    nx, nz = e['n']
    tx, tz = e['t']
    hb.push(e['a'][0] + tx * s + nx * out, y, e['a'][1] + tz * s + nz * out, math.atan2(nx, nz))


def text3d(hb, mat, text, x, y, z, cap, depth, font='sans', align='CENTER', side=None, spacing=1.0, res=2, width=None, back=False):
    """Extruded letters in the frame's x-y plane, front face at z + depth facing +z, baseline at y, capitals
    `cap` metres tall (width = squeeze the line to that width). Returns the width."""
    fp = FONTS[font]
    if fp not in _fonts:
        _fonts[fp] = bpy.data.fonts.load(fp)
    cu = bpy.data.curves.new('txt', 'FONT')
    cu.body = text
    cu.font = _fonts[fp]
    cu.size = cap / 0.72
    cu.extrude = depth / 2
    cu.align_x = align
    cu.space_character = spacing
    cu.resolution_u = res
    cu.fill_mode = 'BOTH' if back else 'FRONT'  # letters on a wall need no back
    ob = bpy.data.objects.new('txt', cu)
    bpy.context.scene.collection.objects.link(ob)
    dg = bpy.context.evaluated_depsgraph_get()
    ev = ob.evaluated_get(dg)
    me = ev.to_mesh()
    vs = [(v.co.x, v.co.y, v.co.z) for v in me.vertices]
    xs = [v[0] for v in vs] or [0]
    w = max(xs) - min(xs)
    k = (width / w) if (width and w > width) else 1.0
    base = len(hb.V)
    for vx, vy, vz in vs:
        hb.V.append(hb.P((x + vx * k, y + vy, z + vz + depth / 2)))
    for p in me.polygons:
        front = abs(p.normal.z) > 0.9
        hb.F.append(([base + i for i in p.vertices], mat if (front or side is None) else side, False, None))
    ev.to_mesh_clear()
    bpy.data.objects.remove(ob)
    bpy.data.curves.remove(cu)
    return w * k


def mullions(hb, e, y0, y1, bay, mat, depth=0.18, w=0.07, rows=(), tw=0.06, s0=0.0, s1=None, ends=True):
    """Vertical fins every `bay` metres along edge e between y0 and y1 and horizontal transoms at `rows`."""
    s1 = e['L'] if s1 is None else s1
    L = s1 - s0
    if L <= 0.2:
        return
    n = max(1, round(L / bay))
    step = L / n
    frame(hb, e)
    for i in range(0 if ends else 1, n + 1 if ends else n):
        hb.box(mat, s0 + i * step, y0, depth / 2, w, y1 - y0, depth)
    for y in rows:
        if y0 <= y <= y1:
            hb.box(mat, s0 + L / 2, y - tw / 2, depth / 2, L, tw, depth)
    hb.pop()


def curtain(hb, pts, y0, y1, glass, mull, bay=1.5, floor=3.6, depth=0.16, only=None, rows=True):
    """Curtain wall round an oriented footprint: glazing (tiling material) plus mullions and floor transoms."""
    for e in H.edges(pts):
        if only and not only(e):
            continue
        hb.wall(glass, e['a'], e['b'], y0, y1)
        r = [y0 + k * floor for k in range(1, int((y1 - y0) / floor) + 1)] if rows else []
        mullions(hb, e, y0, y1, bay, mull, depth=depth, rows=r)


def parapet(hb, pts, y, h, mat, inset=0.0, w=0.35, cap=None):
    """Parapet wall on the roof edge: outer face flush with the facade (inset 0), coping on top."""
    P = H.offset(pts, -inset) if inset else pts
    Q = H.offset(P, -w)
    hb.ring(mat, P, y, y + h)
    for e in H.edges(Q):
        hb.wall(mat, e['b'], e['a'], y, y + h)  # inner face (reversed)
    # coping: the strip between P and Q
    for i in range(len(P)):
        j = (i + 1) % len(P)
        hb.face(cap or mat, [(P[i][0], y + h, P[i][1]), (P[j][0], y + h, P[j][1]), (Q[j][0], y + h, Q[j][1]), (Q[i][0], y + h, Q[i][1])])


def roof_plant(hb, pts, y, n, seed, mat='std:plant', mat2='std:plantDark', inset=4.0, maxw=8.0):
    """Air handlers, condensers and ducts on a flat roof, inside the footprint."""
    rnd = random.Random(seed)
    P = H.offset(pts, -inset)
    xs = [p[0] for p in P]; zs = [p[1] for p in P]
    placed = 0
    for _ in range(n * 30):
        if placed >= n:
            break
        x = rnd.uniform(min(xs), max(xs)); z = rnd.uniform(min(zs), max(zs))
        if not H.inside(P, x, z):
            continue
        w = rnd.uniform(2.0, maxw); d = rnd.uniform(1.5, 3.5); h = rnd.uniform(1.2, 2.6)
        yaw = math.atan2(*H.edges(P)[0]['n'])
        hb.push(x, y, z, yaw)
        hb.box(mat, 0, 0, 0, w, h, d)
        # fans on top / louvres
        for k in range(max(1, int(w / 2.2))):
            hb.cyl(mat2, -w / 2 + 1.1 + k * 2.2, h, 0, 0.55, 0.12, segs=12)
        hb.pop()
        placed += 1


def balcony_stack(hb, e, s0, w, y0, n, fh, depth, slab='std:white', rail='glass:rail', cap='std:alu', back=None):
    """Cantilevered balconies on n floors, s0..s0+w along edge e: slab, glass balustrade, handrail."""
    frame(hb, e)
    for k in range(n):
        y = y0 + k * fh
        hb.box(slab, s0 + w / 2, y - 0.28, depth / 2, w, 0.28, depth, bottom=True)
        hb.face(rail, [(s0, y, depth - 0.02), (s0 + w, y, depth - 0.02), (s0 + w, y + 1.05, depth - 0.02), (s0, y + 1.05, depth - 0.02)])
        for sx in (s0, s0 + w):
            hb.face(rail, [(sx, y, 0.0), (sx, y, depth - 0.02), (sx, y + 1.05, depth - 0.02), (sx, y + 1.05, 0.0)])
        hb.box(cap, s0 + w / 2, y + 1.05, depth - 0.02, w, 0.05, 0.07)
        if back:
            hb.face(back, [(s0, y, 0.02), (s0 + w, y, 0.02), (s0 + w, y + fh - 0.28, 0.02), (s0, y + fh - 0.28, 0.02)])
    hb.pop()


def checker(hb, e, s0, s1, y0, y1, pw, ph, mats, weights, seed, out=0.04, join=0.25):
    """Pixel cladding: panels in several greys, some two cells wide, slightly proud of the wall."""
    rnd = random.Random(seed)
    nc = max(1, round((s1 - s0) / pw)); nr = max(1, round((y1 - y0) / ph))
    w = (s1 - s0) / nc; h = (y1 - y0) / nr
    frame(hb, e)
    g = 0.025
    for j in range(nr):
        i = 0
        while i < nc:
            span = 2 if (rnd.random() < join and i + 1 < nc) else 1
            m = rnd.choices(mats, weights)[0]
            x0 = s0 + i * w + g; x1 = s0 + (i + span) * w - g
            ya = y0 + j * h + g; yb = y0 + (j + 1) * h - g
            hb.face(m, [(x0, ya, out), (x1, ya, out), (x1, yb, out), (x0, yb, out)])
            hb.face(m, [(x0, yb, out), (x1, yb, out), (x1, yb, 0), (x0, yb, 0)])
            i += span
    hb.pop()


def colonnade(hb, e, s0, s1, y0, y1, spacing, size, mat, out=1.2):
    """Free-standing square columns in front of a recessed wall (their back faces at the wall line)."""
    n = max(1, round((s1 - s0) / spacing))
    step = (s1 - s0) / n
    frame(hb, e)
    for i in range(n + 1):
        hb.box(mat, s0 + i * step, y0, out - size / 2, size, y1 - y0, size, top=False)
    hb.pop()


def canopy(hb, x, z, y, w, d, th, mat, soffit=None, lights=None, posts=None, post_mat='std:steel'):
    """Flat canopy in the current frame: centred on x, from the wall (z) outward d, top at y."""
    hb.box(mat, x, y - th, z + d / 2, w, th, d, bottom=False)
    hb.face(soffit or mat, [(x - w / 2, y - th, z), (x + w / 2, y - th, z), (x + w / 2, y - th, z + d), (x - w / 2, y - th, z + d)])
    if lights:
        for k in range(max(1, int(w / 2.5))):
            lx = x - w / 2 + 1.25 + k * 2.5
            hb.face(lights, [(lx - 0.3, y - th - 0.01, z + d * 0.55 - 0.3), (lx + 0.3, y - th - 0.01, z + d * 0.55 - 0.3), (lx + 0.3, y - th - 0.01, z + d * 0.55 + 0.3), (lx - 0.3, y - th - 0.01, z + d * 0.55 + 0.3)])
    if posts:
        for px in posts:
            hb.cyl(post_mat, px, 0, z + d - 0.4, 0.12, y - th, segs=10)


def door_set(hb, x, w, h, frame_mat='std:steelDark', glass='glass:door', z=0.05, leaves=2):
    """Glazed doors in the frame's wall plane at x (centre)."""
    hb.face(glass, [(x - w / 2, 0, z), (x + w / 2, 0, z), (x + w / 2, h, z), (x - w / 2, h, z)])
    for k in range(leaves + 1):
        hb.box(frame_mat, x - w / 2 + k * w / leaves, 0, z, 0.08, h, 0.1)
    hb.box(frame_mat, x, h, z, w + 0.08, 0.12, 0.12)
    for k in range(leaves):
        cx = x - w / 2 + (k + 0.5) * w / leaves
        hb.box('std:steel', cx + (0.25 if k == 0 else -0.25), 0.9, z + 0.08, 0.04, 0.9, 0.04)


# ------------------------------------------------------------------ street furniture
def umbrella(hb, x, z, size=2.6, h=2.5, mat='std:umbrella', pole='std:steelDark', square=True):
    hb.cyl(pole, x, 0, z, 0.04, h + 0.3, segs=8)
    r = size / 2
    n = 4 if square else 8
    rim = [(x + r * math.cos(2 * math.pi * k / n + math.pi / 4), h, z - r * math.sin(2 * math.pi * k / n + math.pi / 4)) for k in range(n)]
    top = (x, h + 0.45, z)
    for k in range(n):
        a, b = rim[k], rim[(k + 1) % n]
        hb.face(mat, [a, b, top])
        hb.face(mat, [b, a, (x, h + 0.25, z)])
    for k in range(n):  # valance
        a, b = rim[k], rim[(k + 1) % n]
        hb.face(mat, [a, (a[0], a[1] - 0.18, a[2]), (b[0], b[1] - 0.18, b[2]), b])


def cafe_set(hb, x, z, seed, table='std:cafeTable', chair='std:cafeChair', n=4, r=0.42):
    rnd = random.Random(seed)
    hb.cyl(table, x, 0.72, z, r, 0.04, segs=10)
    hb.cyl('std:steelDark', x, 0, z, 0.04, 0.72, segs=4, top=False)
    hb.cyl('std:steelDark', x, 0, z, 0.25, 0.03, segs=6)
    for k in range(n):
        a = 2 * math.pi * k / n + rnd.uniform(-0.3, 0.3)
        cx, cz = x + math.cos(a) * 0.72, z - math.sin(a) * 0.72
        hb.push(cx, 0, cz, math.atan2(x - cx, z - cz) + math.pi)
        hb.box(chair, 0, 0.44, 0, 0.44, 0.05, 0.44)
        hb.box(chair, 0, 0.49, 0.2, 0.44, 0.42, 0.05)
        for lx in (-0.19, 0.19):  # side frames
            hb.face('std:steelDark', [(lx, 0, -0.19), (lx, 0, 0.19), (lx, 0.44, 0.19), (lx, 0.44, -0.19)])
            hb.face('std:steelDark', [(lx, 0, 0.19), (lx, 0, -0.19), (lx, 0.44, -0.19), (lx, 0.44, 0.19)])
        hb.pop()


def planter(hb, x, z, w, d, h=0.6, mat='std:planter', soil='std:hedge', shrub=0.6):
    hb.box(mat, x, 0, z, w, h, d)
    hb.box(soil, x, h, z, w - 0.2, shrub, d - 0.2)


def flagpole(hb, x, z, h, flag=None, pole='std:steel'):
    hb.cyl(pole, x, 0, z, 0.07, h, segs=8, r1=0.045)
    hb.sphere(pole, (x, h + 0.06, z), 0.09, segs=8, rings=4)
    if flag:
        fw, fh = h * 0.18, h * 0.12
        hb.face(flag, [(x, h - 0.2 - fh, z), (x + fw, h - 0.25 - fh, z), (x + fw, h - 0.25, z), (x, h - 0.2, z)], uv=[(0, 0), (1, 0), (1, 1), (0, 1)])
        hb.face(flag, [(x + fw, h - 0.25 - fh, z), (x, h - 0.2 - fh, z), (x, h - 0.2, z), (x + fw, h - 0.25, z)], uv=[(1, 0), (0, 0), (0, 1), (1, 1)])


# ------------------------------------------------------------------ interiors behind shop glass
def shop_interior(hb, x0, x1, h, depth, kind, seed, floor='int:floor', wall='int:wall', light='glow:shopLight'):
    """A shop's front room in the current frame: glass line at z = 0, room from z = 0 back to z = -depth,
    x0..x1 wide, h tall. Kind: fashion | cafe | market | tech | lobby."""
    rnd = random.Random(seed)
    w = x1 - x0
    zb = -depth
    hb.face(floor, [(x0, 0.02, 0), (x1, 0.02, 0), (x1, 0.02, zb), (x0, 0.02, zb)])
    hb.face(wall, [(x0, 0, zb), (x0, h, zb), (x1, h, zb), (x1, 0, zb)][::-1])
    hb.face(wall, [(x0, 0, 0), (x0, h, 0), (x0, h, zb), (x0, 0, zb)][::-1])
    hb.face(wall, [(x1, 0, zb), (x1, h, zb), (x1, h, 0), (x1, 0, 0)][::-1])
    hb.face('int:ceiling', [(x0, h, 0), (x1, h, 0), (x1, h, zb), (x0, h, zb)][::-1])
    for k in range(max(1, int(w / 2.4))):
        for j in range(max(1, int(depth / 2.4))):
            lx = x0 + 1.2 + k * 2.4; lz = -1.2 - j * 2.4
            hb.face(light, [(lx - 0.5, h - 0.02, lz - 0.25), (lx + 0.5, h - 0.02, lz - 0.25), (lx + 0.5, h - 0.02, lz + 0.25), (lx - 0.5, h - 0.02, lz + 0.25)])
    if kind == 'fashion':
        cloth = ['int:cloth1', 'int:cloth2', 'int:cloth3', 'int:cloth4']
        # wall rail with hanging clothes, mannequins near the glass
        hb.box('std:steelDark', (x0 + x1) / 2, 1.75, zb + 0.35, w - 0.6, 0.03, 0.03)
        x = x0 + 0.5
        while x < x1 - 0.5:
            cw = rnd.uniform(0.18, 0.4)
            hb.box(rnd.choice(cloth), x + cw / 2, 0.8 + rnd.uniform(0, 0.15), zb + 0.35, cw - 0.03, 0.9, 0.45, top=False)
            x += cw
        for k in range(max(1, int(w / 3.5))):
            mx = x0 + 1.5 + k * 3.5 + rnd.uniform(-0.3, 0.3)
            mannequin(hb, mx, -1.1, rnd.choice(cloth), rnd.uniform(-0.6, 0.6))
        for k in range(max(1, int(w / 4.5))):
            tx = x0 + 2.2 + k * 4.5
            hb.box('int:wood', tx, 0, -2.6, 1.6, 0.85, 0.8)
            for f in range(4):
                hb.box(rnd.choice(cloth), tx - 0.55 + f * 0.37, 0.85, -2.6, 0.3, 0.08 + rnd.uniform(0, 0.06), 0.36)
    elif kind == 'cafe':
        hb.box('int:wood', (x0 + x1) / 2, 0, zb + 0.6, min(w - 1.0, 6.0), 1.05, 0.7)
        hb.box('std:steel', (x0 + x1) / 2, 1.05, zb + 0.6, min(w - 1.0, 6.0), 0.04, 0.72)
        hb.face('int:menu', [(x0 + 1, 1.9, zb + 0.02), (x1 - 1, 1.9, zb + 0.02), (x1 - 1, 2.7, zb + 0.02), (x0 + 1, 2.7, zb + 0.02)])
        for k in range(max(1, int(w / 2.6))):
            cafe_set(hb, x0 + 1.3 + k * 2.6, -1.4 - (k % 2) * 1.2, seed + k, table='int:wood', chair='int:chair', n=2)
        for k in range(max(1, int(w / 2.0))):
            px = x0 + 1 + k * 2
            hb.tube('std:steelDark', (px, h, -1.8), (px, h - 1.2, -1.8), 0.01, segs=4, caps=False)
            hb.sphere('glow:pendant', (px, h - 1.3, -1.8), 0.16, segs=8, rings=4)
    elif kind == 'market':
        prods = ['int:prod1', 'int:prod2', 'int:prod3', 'int:prod4', 'int:prod5']
        for k in range(max(1, int((depth - 1.5) / 2.2))):
            z = -1.8 - k * 2.2
            hb.box('int:shelf', (x0 + x1) / 2, 0, z, w - 1.6, 1.9, 0.9)
            for lvl in range(4):
                x = x0 + 0.9
                while x < x1 - 0.9:
                    pw = rnd.uniform(0.3, 0.8)
                    for side in (-1, 1):
                        hb.box(rnd.choice(prods), x + pw / 2, 0.2 + lvl * 0.45, z + side * 0.47, pw - 0.03, 0.3, 0.06, top=False)
                    x += pw
        for k in range(max(1, int(w / 3.2))):
            cx = x0 + 1.6 + k * 3.2
            hb.box('int:checkout', cx, 0, -0.9, 0.7, 0.9, 1.9)
            hb.box('std:steelDark', cx + 0.2, 0.9, -1.4, 0.3, 0.3, 0.06)
    elif kind == 'tech':
        for k in range(max(1, int(w / 3.0))):
            tx = x0 + 1.5 + k * 3.0
            hb.box('int:white', tx, 0, -2.0, 1.8, 0.9, 0.9)
            for f in range(3):
                hb.box('glow:screen', tx - 0.6 + f * 0.6, 0.9, -2.0, 0.42, 0.28, 0.02)
        hb.face('glow:screen', [(x0 + 1, 1.2, zb + 0.03), (x1 - 1, 1.2, zb + 0.03), (x1 - 1, 2.6, zb + 0.03), (x0 + 1, 2.6, zb + 0.03)])
    elif kind == 'lobby':
        hb.box('int:wood', (x0 + x1) / 2, 0, zb + 1.0, min(w - 2.0, 5.0), 1.1, 0.8)
        for k in range(max(1, int(w / 4.0))):
            planter(hb, x0 + 1.5 + k * 4.0, -1.0, 0.8, 0.8, 0.7, 'int:white', 'std:hedge', 0.9)


def mannequin(hb, x, z, cloth, yaw=0.0):
    hb.push(x, 0, z, yaw)
    hb.cyl('std:steelDark', 0, 0, 0, 0.18, 0.03, segs=10)
    hb.cyl('std:steelDark', 0, 0.03, 0, 0.015, 0.75, segs=4, top=False)
    hb.cyl(cloth, 0, 0.78, 0, 0.17, 0.62, segs=8, r1=0.2, top=False)  # skirt / trousers
    hb.cyl(cloth, 0, 1.40, 0, 0.19, 0.42, segs=8, r1=0.14)  # torso
    hb.cyl('int:skin', 0, 1.82, 0, 0.04, 0.08, segs=5, top=False)
    hb.sphere('int:skin', (0, 1.99, 0), 0.105, segs=7, rings=4)
    hb.pop()
