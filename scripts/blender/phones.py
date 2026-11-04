"""Nine foldable phones, reconstructed from official dimensions + numbered refs.

Units: 1 unit = 100 mm (so a 158 mm phone is 1.58 units tall).
Each panel is modelled centred on its own origin, screen plane at film z=0,
back at z=-t; the three.js PhoneRig places panels along a constrained hinge
spine.  Panel order is the FRONT (inner-display) view, left -> right.
"""
import math
import bmesh
from mathutils import Vector
from common import (F, mat, new_obj, empty, apply_mods, bevel, rounded_rect_pts, slab,
                    disc_pts, poly_pts, translate, lathe)

MM = 0.01

# ---------------------------------------------------------------------------
# Device sheet (mm).  Sources: official spec pages (Samsung Newsroom / Huawei
# consumer specs) + proportions measured on refs 03-19.  See README hinge sheet.
# ---------------------------------------------------------------------------
SAMSUNG = {
    # H, open W, open thickness t, outer corner R, edge bevel, hinge radius r,
    # cover display (w, h, corner), camera style, camera centre from outer/top edge
    'fold1': dict(H=160.9, W=117.9, t=7.6, R=9.5, edge=1.9, r=1.0, cover=(46, 107, 4), cover_glass_full=True,
                  cam='pill_glass', cam_at=(13.5, 30), lens=6.2, pitch=9.6),
    'fold2': dict(H=159.2, W=128.2, t=6.9, R=7.5, edge=0.9, r=1.5, cover=(53, 146, 5), cam='island_metal',
                  cam_at=(15, 27), lens=8.4, pitch=11.0),
    'fold3': dict(H=158.2, W=128.1, t=6.4, R=7.0, edge=0.8, r=1.6, cover=(53, 146, 5), cam='pill_metal',
                  cam_at=(13, 31), lens=8.8, pitch=11.2),
    'fold4': dict(H=155.1, W=130.1, t=6.3, R=6.8, edge=0.8, r=1.6, cover=(56, 144, 5), cam='strip',
                  cam_at=(12.5, 30), lens=9.6, pitch=12.0),
    'fold5': dict(H=154.9, W=129.9, t=6.1, R=6.5, edge=0.7, r=0.6, cover=(56, 144, 5), cam='rings',
                  cam_at=(12.5, 30), lens=9.8, pitch=12.4),
    'fold6': dict(H=153.5, W=132.6, t=5.6, R=4.2, edge=0.45, r=0.45, cover=(60, 146, 3.5), cam='rings_outline',
                  cam_at=(12.5, 31), lens=10.2, pitch=12.8),
    'fold7': dict(H=158.4, W=143.2, t=4.2, R=5.2, edge=0.45, r=0.25, cover=(65, 150, 4), cam='island_outline',
                  cam_at=(14, 32), lens=11.6, pitch=14.2),
}
HUAWEI = {
    # Mate XT: front view [C | B | A]; C = outward-folding cover panel (punch hole),
    # A = camera panel (folds inward onto B).
    'matext': dict(H=156.7, W=219.0, t=3.6, R=6.0, edge=0.5, cam_at=(24, 26), oct_r=19.0),
    # Mate XT2: front view [P1 | P2 | P3]; P2 = centre body (camera), both wings fold
    # inward (P3 first, P1 over it).  P1 carries the 6.5" cover display on its back.
    'matext2': dict(H=157.2, W=219.2, t=3.75, R=6.2, edge=0.5, oct_r=19.5, cover=(66, 148, 6)),
}


def m(v):
    return v * MM


def panel_body(name, w, H, t, radii, edge, parent, mats, back_round=None):
    """Frame body: sides=Frame, front=Bezel, back hidden under back plate."""
    pts = rounded_rect_pts(m(w), m(H), [m(r) for r in radii], seg=12)
    bm = slab(pts, m(-t + 0.45), 0.0)
    ob = new_obj(name, bm, mats, parent)
    bevel(ob, m(edge), segments=4, angle=40)
    apply_mods(ob)
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


def back_plate(name, w, H, t, radii, edge, parent, material, inset=0.35, thick=0.55):
    pts = rounded_rect_pts(m(w - 2 * inset), m(H - 2 * inset), [m(max(0.3, r - inset)) for r in radii], seg=12)
    bm = slab(pts, m(-t), m(-t + thick))
    ob = new_obj(name, bm, [material, material, material], parent)
    bevel(ob, m(min(edge * 0.7, thick * 0.45)), segments=3, angle=40)
    apply_mods(ob)
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


def plane_rr(name, w, h, rad, z, parent, material, x=0, y=0, facing=-1):
    """Rounded-rect display plane at film depth z; facing -1 = back (-z)."""
    pts = rounded_rect_pts(m(w), m(h), [m(rad)] * 4, seg=10)
    bm = bmesh.new()
    vs = [bm.verts.new(F(m(x) + px, m(y) + py, z)) for px, py in pts]
    f = bm.faces.new(vs if facing > 0 else list(reversed(vs)))
    uvl = bm.loops.layers.uv.verify()
    for l in f.loops:
        px, py = l.vert.co.x - m(x), l.vert.co.z - m(y)
        u = px / m(w) + 0.5
        if facing < 0:
            u = 1 - u  # seen from behind: keep the image un-mirrored
        l[uvl].uv = (u, py / m(h) + 0.5)
    return new_obj(name, bm, [material], parent)


def cyl(name, r, h, z0, parent, materials, x=0, y=0, n=48, bev=0.0, seg=3, outline=None, facing=-1):
    """Cylinder/prism protruding from back surface: from z0 going -h (facing=-1)."""
    pts = outline if outline is not None else disc_pts(m(r), n)
    pts = [(px + m(x), py + m(y)) for px, py in pts]
    zA, zB = (z0 - m(h), z0) if facing < 0 else (z0, z0 + m(h))
    bm = slab(pts, zA, zB)
    ob = new_obj(name, bm, materials, parent)
    if bev > 0:
        bevel(ob, m(bev), segments=seg, angle=30)
        apply_mods(ob)
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


def ring(name, r_out, r_in, h, z0, parent, material, x=0, y=0, n=56, bev=0.25, outer=None, inner=None):
    """Annulus prism (lens bezel ring / octagonal camera surround)."""
    po = outer if outer is not None else disc_pts(m(r_out), n)
    pi = inner if inner is not None else disc_pts(m(r_in), n)
    bm = bmesh.new()
    zA, zB = z0 - m(h), z0
    def ringv(pts, z):
        return [bm.verts.new(F(px + m(x), py + m(y), z)) for px, py in pts]
    oA, oB, iA, iB = ringv(po, zA), ringv(po, zB), ringv(pi, zA), ringv(pi, zB)
    N = len(po)
    for i in range(N):
        j = (i + 1) % N
        bm.faces.new((oA[i], oA[j], oB[j], oB[i]))
        bm.faces.new((iB[i], iB[j], iA[j], iA[i]))
        bm.faces.new((oA[j], oA[i], iA[i], iA[j]))  # top (outermost, -z)
        bm.faces.new((oB[i], oB[j], iB[j], iB[i]))
    bm.normal_update()
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = new_obj(name, bm, [material], parent)
    if bev > 0:
        bevel(ob, m(bev), segments=3, angle=30)
        apply_mods(ob)
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


def lens(prefix, x, y, d, z0, parent, ring_mat, glass_mat, elem_mat, ring_h=0.9, ring_w=0.9):
    """Lens stack: metal bezel ring, black barrel, coated element, cover glass dome."""
    r = d / 2
    ring(f'{prefix}_ring', r + ring_w, r, ring_h, z0, parent, ring_mat, x, y)
    cyl(f'{prefix}_barrel', r, ring_h * 0.6, z0, parent, [mat('Phone_LensBarrel', (0.01, 0.01, 0.012), 0.2, 0.35)] * 3, x, y)
    cyl(f'{prefix}_element', r * 0.62, ring_h * 0.66, z0, parent, [elem_mat] * 3, x, y)
    # glass dome (slightly convex cover glass), facing -z
    bm = bmesh.new()
    zc = z0 - m(ring_h) * 0.86
    sag = m(0.3)
    K, N = 6, 40
    center = bm.verts.new(F(m(x), m(y), zc - sag))
    rings = []
    for k in range(1, K + 1):
        a = k / K
        rr = m(r) * 0.985 * a
        rings.append([bm.verts.new(F(m(x) + math.cos(2 * math.pi * i / N) * rr, m(y) + math.sin(2 * math.pi * i / N) * rr,
                                     zc - sag * (1 - a * a))) for i in range(N)])
    for i in range(N):
        j = (i + 1) % N
        bm.faces.new((center, rings[0][j], rings[0][i]))
        for k in range(K - 1):
            bm.faces.new((rings[k][i], rings[k][j], rings[k + 1][j], rings[k + 1][i]))
    bm.normal_update()
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    g = new_obj(f'{prefix}_glass', bm, [glass_mat], parent, smooth=True)
    return g


def flash(prefix, x, y, z0, parent, d=3.6, pill=False):
    out = disc_pts(m(d / 2), 32, sx=(0.6 if pill else 1.0), sy=(1.6 if pill else 1.0))
    cyl(f'{prefix}_flash', 0, 0.25, z0, parent, [mat('Phone_Flash', (0.95, 0.85, 0.55), 0.0, 0.25)] * 3, x, y, outline=out)


def side_buttons(prefix, w, H, t, parent, mtl, edge_x, ys=((0.22, 9), (0.42, 22))):
    for i, (fy, L) in enumerate(ys):
        pts = rounded_rect_pts(m(1.6), m(L), [m(0.7)] * 4, seg=6)
        bm = bmesh.new()
        # button protrudes in +x from the side edge; built as slab in film (z, y) plane
        vs0 = [bm.verts.new(F(m(edge_x) - m(0.2), m(H) * fy + py, -m(t) / 2 + px)) for px, py in pts]
        vs1 = [bm.verts.new(F(m(edge_x) + m(0.55), m(H) * fy + py, -m(t) / 2 + px)) for px, py in pts]
        bm.faces.new(vs1)
        bm.faces.new(list(reversed(vs0)))
        n = len(pts)
        for k in range(n):
            j = (k + 1) % n
            bm.faces.new((vs0[k], vs0[j], vs1[j], vs1[k]))
        bm.normal_update()
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        ob = new_obj(f'{prefix}_btn{i}', bm, [mtl], parent)
        for p in ob.data.polygons:
            p.use_smooth = True


def samsung_camera(dev, d, grp, w, H, t, M):
    """Rear camera cluster on the back of panel R (front-view right half)."""
    zb = m(-t)
    cx = w / 2 - d['cam_at'][0]
    cy = H / 2 - d['cam_at'][1]
    L, P = d['lens'], d['pitch']
    ys = [cy + P, cy, cy - P]
    style = d['cam']
    ringM, glassM, elemM = M['LensRing'], M['LensGlass'], M['LensElement']
    if style == 'pill_glass':  # Fold 1: dark glass pill, flush lenses, flash below
        out = rounded_rect_pts(m(L + 5.6), m(2 * P + L + 6), [m((L + 5.6) / 2)] * 4, 14)
        cyl(f'{dev}_cam_island', 0, 0.9, zb, grp, [M['CamIsland']] * 3, cx, cy, outline=out, bev=0.5)
        z = zb - m(0.9)
        for i, yy in enumerate(ys):
            lens(f'{dev}_cam_l{i}', cx, yy, L, z, grp, ringM, glassM, elemM, ring_h=0.25, ring_w=0.5)
        flash(dev, cx, cy - P - L / 2 - 8.5, zb, grp, 3.4)
    elif style == 'island_metal':  # Fold 2: bronze rounded-rect island
        iw, ih = L + 10.5, 2 * P + L + 5
        out = rounded_rect_pts(m(iw), m(ih), [m(4.2)] * 4, 12)
        cyl(f'{dev}_cam_island', 0, 1.3, zb, grp, [M['CamIsland']] * 3, cx + 2.3, cy, outline=out, bev=0.6)
        z = zb - m(1.3)
        for i, yy in enumerate(ys):
            lens(f'{dev}_cam_l{i}', cx, yy, L, z, grp, ringM, glassM, elemM, ring_h=0.5, ring_w=0.9)
        flash(dev, cx + 7.0, cy + P, z, grp, 2.8)
    elif style == 'pill_metal':  # Fold 3: silver pill frame with glass inside, flash inside bottom
        iw, ih = L + 4.6, 2 * P + L + 13
        out = rounded_rect_pts(m(iw), m(ih), [m(iw / 2)] * 4, 16)
        cyl(f'{dev}_cam_island', 0, 1.1, zb, grp, [M['CamIsland']] * 3, cx, cy - 3.5, outline=out, bev=0.6)
        inner = rounded_rect_pts(m(iw - 2.2), m(ih - 2.2), [m(iw / 2 - 1.1)] * 4, 16)
        cyl(f'{dev}_cam_glass', 0, 0.15, zb - m(1.1), grp, [M['CamGlassBlack']] * 3, cx, cy - 3.5, outline=inner)
        z = zb - m(1.25)
        for i, yy in enumerate(ys):
            lens(f'{dev}_cam_l{i}', cx, yy, L, z, grp, ringM, glassM, elemM, ring_h=0.35, ring_w=0.6)
        flash(dev, cx, cy - P - L / 2 - 4.2, z, grp, 2.6)
    elif style == 'strip':  # Fold 4: slim strip + raised rings
        iw, ih = L + 4.2, 2 * P + L + 12
        out = rounded_rect_pts(m(iw), m(ih), [m(iw / 2)] * 4, 16)
        cyl(f'{dev}_cam_island', 0, 0.55, zb, grp, [M['CamIsland']] * 3, cx, cy - 3.2, outline=out, bev=0.4)
        z = zb - m(0.55)
        for i, yy in enumerate(ys):
            lens(f'{dev}_cam_l{i}', cx, yy, L, z, grp, ringM, glassM, elemM, ring_h=1.3, ring_w=1.0)
        flash(dev, cx, cy - P - L / 2 - 4.0, z, grp, 2.6)
    else:  # Fold 5/6/7: floating rings (+ outline for 6/7), flash beside top lens
        z = zb
        if style == 'rings_outline':
            out = rounded_rect_pts(m(L + 3.2), m(2 * P + L + 3.2), [m((L + 3.2) / 2)] * 4, 16)
            inn = rounded_rect_pts(m(L + 1.8), m(2 * P + L + 1.8), [m((L + 1.8) / 2)] * 4, 16)
            ring(f'{dev}_cam_outline', 0, 0, 0.35, zb, grp, M['CamIsland'], cx, cy, outer=out, inner=inn, bev=0.12)
        if style == 'island_outline':
            out = rounded_rect_pts(m(L + 5.4), m(2 * P + L + 5.4), [m((L + 5.4) / 2)] * 4, 16)
            cyl(f'{dev}_cam_island', 0, 0.6, zb, grp, [M['CamIsland']] * 3, cx, cy, outline=out, bev=0.3)
            z = zb - m(0.6)
        for i, yy in enumerate(ys):
            lens(f'{dev}_cam_l{i}', cx, yy, L, z, grp, ringM, glassM, elemM, ring_h=1.6 if style != 'island_outline' else 1.3, ring_w=1.0)
        flash(dev, cx - (L / 2 + 5.0), cy + P, zb, grp, 3.0)


def octagon_camera(dev, x, y, z, R, grp, M):
    """Huawei 'Star Diamond' octagonal module: faceted ring, black glass, 3 lenses +
    multispectral sensor in a 2x2 grid, central pill flash."""
    rot = math.pi / 8
    outer = poly_pts(m(R), 8, rot)
    inner = poly_pts(m(R * 0.80), 8, rot)
    ring(f'{dev}_cam_ring', 0, 0, 2.6, z, grp, M['CamRing'], x, y, outer=outer, inner=inner, bev=0.9)
    cyl(f'{dev}_cam_base', 0, 1.9, z, grp, [M['CamGlassBlack']] * 3, x, y, outline=poly_pts(m(R * 0.81), 8, rot))
    zt = z - m(1.9)
    off = R * 0.36
    for i, (dx, dy) in enumerate([(-1, 1), (1, 1), (-1, -1), (1, -1)]):
        d = 8.6 if i != 3 else 7.4
        lens(f'{dev}_cam_l{i}', x + dx * off, y + dy * off, d, zt, grp, M['LensRing'], M['LensGlass'], M['LensElement'], ring_h=0.6, ring_w=0.8)
    flash(dev, x, y, zt, grp, 3.0, pill=True)


def build_samsung(dev, d, root):
    H, W, t = d['H'], d['W'], d['t']
    w = W / 2
    M = {k: mat(f'{dev}_{k}') for k in ('Frame', 'Back', 'CamIsland', 'LensRing', 'CoverGlass', 'CoverDisplay', 'Button')}
    M.update(Bezel=mat('Phone_Bezel', (0.005, 0.005, 0.006), 0.0, 0.3), LensGlass=mat('Phone_LensGlass', (0.02, 0.02, 0.03), 0.0, 0.05),
             LensElement=mat('Phone_LensElement', (0.04, 0.05, 0.12), 0.6, 0.15), CamGlassBlack=mat('Phone_CamGlassBlack', (0.01, 0.01, 0.012), 0.0, 0.08))
    dev_root = empty(dev, root)
    R, small = d['R'], 1.0
    # L (cover-screen half): hinge on its right edge
    gL = empty(f'{dev}_P0', dev_root)
    rad_L = (small, R, R, small)
    panel_body(f'{dev}_P0_body', w, H, t, rad_L, d['edge'], gL, [M['Frame'], M['Bezel'], M['Frame']])
    back_plate(f'{dev}_P0_back', w, H, t, rad_L, d['edge'], gL, M['CoverGlass'])
    cw, ch, cr = d['cover']
    plane_rr(f'{dev}_P0_cover', cw, ch, cr, m(-t) - m(0.04), gL, M['CoverDisplay'], x=-(w - cw) / 2 * 0.0 - 0.6 if not d.get('cover_glass_full') else 0, y=0)
    # R (camera half): hinge on its left edge
    gR = empty(f'{dev}_P1', dev_root)
    rad_R = (R, small, small, R)
    panel_body(f'{dev}_P1_body', w, H, t, rad_R, d['edge'], gR, [M['Frame'], M['Bezel'], M['Frame']])
    back_plate(f'{dev}_P1_back', w, H, t, rad_R, d['edge'], gR, M['Back'])
    samsung_camera(dev, d, gR, w, H, t, M)
    side_buttons(dev, w, H, t, gR, M['Button'], w / 2, ys=((0.12, 11 if dev != 'fold1' else 14), (0.30, 24)))
    dev_root['phone_spec'] = str(dict(H=H, W=W, t=t, r=d['r'], panels=2))


def build_matext(d, root):
    dev = 'matext'
    H, W, t, R = d['H'], d['W'], d['t'], d['R']
    w = W / 3
    M = {k: mat(f'{dev}_{k}') for k in ('Frame', 'Back', 'CamRing', 'Emblem', 'Button')}
    M.update(Bezel=mat('Phone_Bezel'), LensRing=mat(f'{dev}_LensRing'), LensGlass=mat('Phone_LensGlass'),
             LensElement=mat('Phone_LensElement'), CamGlassBlack=mat('Phone_CamGlassBlack'))
    dev_root = empty(dev, root)
    small = 0.8
    radii = [(small, R, R, small), (small, small, small, small), (R, small, small, R)]  # C, B, A
    names = ['C', 'B', 'A']
    for i in range(3):
        g = empty(f'{dev}_P{i}', dev_root)
        panel_body(f'{dev}_P{i}_body', w, H, t, radii[i], d['edge'], g, [M['Frame'], M['Bezel'], M['Frame']])
        back_plate(f'{dev}_P{i}_back', w, H, t, radii[i], d['edge'], g, M['Back'], inset=0.55, thick=0.6)
        g['panel'] = names[i]
    gA = [o for o in dev_root.children if o.name == f'{dev}_P2'][0]
    gB = [o for o in dev_root.children if o.name == f'{dev}_P1'][0]
    # camera on A's back, near A's outer (right, front-view) edge, top
    octagon_camera(dev, w / 2 - d['cam_at'][0], H / 2 - d['cam_at'][1], m(-t), d['oct_r'], gA, M)
    # small octagonal emblem plate on B's back (Image 14)
    cyl(f'{dev}_P1_emblem', 0, 0.3, m(-t), gB, [M['Emblem']] * 3, 0, H / 2 - 14, outline=poly_pts(m(5.2), 8, math.pi / 8), bev=0.2)
    side_buttons(dev, w, H, t, gA, M['Button'], w / 2, ys=((0.16, 10), (0.32, 20)))
    dev_root['phone_spec'] = str(dict(H=H, W=W, t=t, panels=3))


def build_matext2(d, root):
    dev = 'matext2'
    H, W, t, R = d['H'], d['W'], d['t'], d['R']
    w = W / 3
    M = {k: mat(f'{dev}_{k}') for k in ('Frame', 'Back', 'CamRing', 'CoverGlass', 'CoverDisplay', 'Button', 'Emblem')}
    M.update(Bezel=mat('Phone_Bezel'), LensRing=mat(f'{dev}_LensRing'), LensGlass=mat('Phone_LensGlass'),
             LensElement=mat('Phone_LensElement'), CamGlassBlack=mat('Phone_CamGlassBlack'))
    dev_root = empty(dev, root)
    small = 0.8
    radii = [(small, R, R, small), (small, small, small, small), (R, small, small, R)]
    for i in range(3):
        g = empty(f'{dev}_P{i}', dev_root)
        panel_body(f'{dev}_P{i}_body', w, H, t, radii[i], d['edge'], g, [M['Frame'], M['Bezel'], M['Frame']])
        back_plate(f'{dev}_P{i}_back', w, H, t, radii[i], d['edge'], g, M['CoverGlass'] if i == 0 else M['Back'], inset=0.55, thick=0.6)
        if i == 0:
            cw, ch, cr = d['cover']
            plane_rr(f'{dev}_P0_cover', cw, ch, cr, m(-t) - m(0.04), g, M['CoverDisplay'])
        if i == 1:
            octagon_camera(dev, 0, H / 2 - 30, m(-t), d['oct_r'], g, M)
            cyl(f'{dev}_P1_emblem', 0, 0.15, m(-t), g, [M['Emblem']] * 3, 0, -H / 2 + 6.5, outline=rounded_rect_pts(m(9), m(2.6), [m(1.2)] * 4, 6))
        if i == 2:
            side_buttons(dev, w, H, t, g, M['Button'], w / 2, ys=((0.18, 10), (0.34, 20)))
    dev_root['phone_spec'] = str(dict(H=H, W=W, t=t, panels=3))


def build_all(root):
    for dev, d in SAMSUNG.items():
        build_samsung(dev, d, root)
    build_matext(HUAWEI['matext'], root)
    build_matext2(HUAWEI['matext2'], root)
