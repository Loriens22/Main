# BILLA, бул. „България“ 55 (кв. Мотописта), across бул. „Тодор Каблешков“ from Bulgaria Mall: the two-storey
# retail box of OSM way 203333240 (the world builder used to drop it because only its pylon and canopies are
# mapped as parts; tools/build_world.py now keeps the rest of the outline), with the parts as mapped: the round
# pylon at the corner of the two boulevards, the raised canopy strip from the pylon to the store and the canopy
# over the service yard behind it.
# Appearance from the user's street-level photographs (August 2024): silver-grey metal cladding, the BILLA НА
# БЪЛГАРИЯ lettering on the corner, a large poster and the long red "Спестявайте с BILLA Card" banner over the
# glazed entrance, white umbrellas by the doors; the grey cylinder pylon with BILLA letters at the top and the
# tenants' signs below; a yellow sculpture on the lamp post beside it. Heights (store 8.6 m, pylon 11 m) and the
# entrance position are estimated.
import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import herolib as H
import herokit as K

NAME = 'billa'
pk = H.Pack('7')
H.reset()

STORE = H.orient(H.simplify(pk.building(-5124.6, 431.3, 3)['pts'], 0.3))
PYLON = pk.building(-5200.3, 394.2, 3)['pts']
WALK = H.orient(pk.building(-5176.4, 410.8, 3)['pts'])
YARD = H.orient(H.simplify(pk.building(-5096.0, 391.8, 3)['pts'], 0.3))
DATUM = 73.0
TOP = 8.6
cx, cz = H.centroid(STORE)
hb = H.HB(NAME, (cx, cz), DATUM)

hb.mat('pn:billaClad', (0.72, 0.74, 0.76), 0.45, 0.5)
hb.mat('std:white', (0.88, 0.88, 0.87), 0.5)
hb.mat('std:grey', (0.55, 0.57, 0.59), 0.45, 0.4)
hb.mat('std:alu', (0.65, 0.67, 0.70), 0.35, 0.8)
hb.mat('std:steel', (0.6, 0.62, 0.64), 0.35, 0.8)
hb.mat('std:steelDark', (0.12, 0.13, 0.14), 0.45, 0.6)
hb.mat('std:plinth', (0.38, 0.38, 0.39), 0.85)
hb.mat('std:roof', (0.5, 0.5, 0.49), 0.95)
hb.mat('std:plant', (0.62, 0.64, 0.66), 0.5, 0.4)
hb.mat('std:plantDark', (0.2, 0.21, 0.22), 0.6, 0.3)
hb.mat('std:billaYellow', (1.0, 0.80, 0.05), 0.45)
hb.mat('std:billaRed', (0.80, 0.06, 0.08), 0.45)
hb.mat('std:umbrella', (0.95, 0.95, 0.93), 0.8)
hb.mat('std:cafeTable', (0.85, 0.85, 0.85), 0.5)
hb.mat('std:cafeChair', (0.3, 0.3, 0.3), 0.6)
hb.mat('std:cart', (0.7, 0.72, 0.74), 0.35, 0.8)
hb.mat('std:cartRed', (0.75, 0.08, 0.08), 0.5)
hb.mat('std:pylon', (0.66, 0.68, 0.70), 0.4, 0.5)
hb.mat('glass:door', (0.5, 0.6, 0.62), 0.05)
hb.mat('glass:shop', (0.55, 0.65, 0.68), 0.05)
hb.mat('glow:yellow', (1.0, 0.78, 0.0), 0.4, emit=(1, 0.8, 0.1))
hb.mat('glow:red', (0.85, 0.05, 0.04), 0.4, emit=(1, 0.1, 0.05))
hb.mat('glow:white', (0.95, 0.95, 0.95), 0.4, emit=(1, 1, 1))
hb.mat('glow:shopLight', (0.95, 0.95, 0.9), 0.4, emit=(1, 0.95, 0.85))
hb.mat('sign:billaCard', (0.8, 0.1, 0.1), 0.4)
hb.mat('sign:billaAd', (0.95, 0.8, 0.2), 0.4)
hb.mat('sign:pylonTenants', (0.7, 0.7, 0.7), 0.4)
for k, c in (('floor', (0.82, 0.80, 0.76)), ('wall', (0.92, 0.91, 0.88)), ('ceiling', (0.92, 0.92, 0.92)), ('shelf', (0.75, 0.76, 0.78)),
             ('prod1', (0.85, 0.15, 0.1)), ('prod2', (0.95, 0.8, 0.2)), ('prod3', (0.2, 0.55, 0.25)), ('prod4', (0.2, 0.35, 0.7)), ('prod5', (0.95, 0.95, 0.9)),
             ('checkout', (0.3, 0.32, 0.35)), ('wood', (0.6, 0.45, 0.3))):
    hb.mat('int:' + k, c, 0.6)


def gy(x, z):
    return pk.y(x, z) - DATUM


E = H.edges(STORE)
front = min(E, key=lambda e: math.hypot(e['a'][0] + e['t'][0] * e['L'] / 2 + 5148, e['a'][1] + e['t'][1] * e['L'] / 2 - 415.6))  # towards the parking and бул. България
sw = min(E, key=lambda e: math.hypot(e['a'][0] + e['t'][0] * e['L'] / 2 + 5143, e['a'][1] + e['t'][1] * e['L'] / 2 - 457.3))    # towards Каблешков
# distances along the front from its north end
nA = math.hypot(front['a'][0] + 5129.6, front['a'][1] - 389.3) < 5
sF = (lambda d: d) if nA else (lambda d: front['L'] - d)

# ------------------------------------------------------------------ the box
lo = min(gy(*p) for p in STORE) - 0.6
for e in E:
    hb.wall('std:plinth', e['a'], e['b'], lo, 0.5)
    hb.wall('pn:billaClad', e['a'], e['b'], 0.5, TOP)
    K.frame(hb, e)
    hb.box('std:grey', e['L'] / 2, TOP - 0.05, 0.12, e['L'] + 0.24, 0.65, 0.24, bottom=True)  # coping
    hb.box('std:grey', e['L'] / 2, 0.45, 0.04, e['L'], 0.1, 0.08)  # base flashing
    hb.pop()
hb.cap('std:roof', STORE, TOP + 0.55)
K.parapet(hb, STORE, TOP + 0.4, 0.2, 'std:grey', w=0.3)
K.roof_plant(hb, STORE, TOP + 0.55, 9, 5, inset=6.0)
# skylights in rows
for k in range(4):
    for j in range(3):
        x = cx - 14 + k * 9.5; z = cz - 9 + j * 9
        if H.inside(H.offset(STORE, -5), x, z):
            hb.push(x, TOP + 0.55, z, math.atan2(*front['n']))
            hb.box('std:alu', 0, 0, 0, 3.0, 0.5, 3.0)
            hb.box('std:steelDark', 0, 0.5, 0, 2.8, 0.35, 2.8)
            hb.pop()

# ------------------------------------------------------------------ the front: entrance, poster, banner, lettering
K.frame(hb, front)
ex0, ex1 = sorted((sF(30.0), sF(46.0)))  # the glazed entrance under the banner
hb.face('glass:shop', [(ex0, 0.5, 0.06), (ex1, 0.5, 0.06), (ex1, 4.6, 0.06), (ex0, 4.6, 0.06)])
K.shop_interior(hb, ex0 + 0.2, ex1 - 0.2, 4.4, 12.0, 'market', 71)
nm = int((ex1 - ex0) / 2.0)
for k in range(nm + 1):
    hb.box('std:alu', ex0 + k * (ex1 - ex0) / nm, 0.5, 0.08, 0.1, 4.1, 0.14)
hb.box('std:alu', (ex0 + ex1) / 2, 4.6, 0.08, ex1 - ex0, 0.15, 0.16)
for dx in (-3.0, 3.0):
    K.door_set(hb, (ex0 + ex1) / 2 + dx, 2.4, 2.4, z=0.14, frame_mat='std:alu')
K.canopy(hb, (ex0 + ex1) / 2, 0.0, 5.3, ex1 - ex0 + 1.0, 2.6, 0.35, 'std:grey', soffit='std:white', lights='glow:shopLight')
# the red BILLA Card banner over the entrance and the poster beside it
b0, b1 = sorted((sF(18.0), sF(52.0)))
hb.box('std:steelDark', (b0 + b1) / 2, 5.6, 0.05, b1 - b0 + 0.2, 2.9, 0.1)
hb.sign('sign:billaCard', b0, 5.65, b1, 8.4, 0.11)
p0, p1 = sorted((sF(5.5), sF(17.0)))
hb.box('std:steelDark', (p0 + p1) / 2, 2.6, 0.05, p1 - p0 + 0.2, 5.0, 0.1)
hb.sign('sign:billaAd', p0, 2.65, p1, 7.5, 0.11)
# BILLA НА БЪЛГАРИЯ at the north corner, standing on the coping
cxl = (sF(0.6) + sF(13.0)) / 2
hb.box('std:white', cxl, TOP - 0.3, -0.2, 13.2, 4.1, 0.3)  # sign board rising over the parapet
K.text3d(hb, 'glow:yellow', 'BILLA', cxl, TOP + 1.85, -0.03, 1.55, 0.3, side='glow:red', width=10.5)
K.text3d(hb, 'glow:red', 'НА БЪЛГАРИЯ', cxl, TOP + 0.8, -0.03, 0.72, 0.12, width=11.0)
hb.pop()
# lettering towards Каблешков as well
K.frame(hb, sw)
K.text3d(hb, 'glow:yellow', 'BILLA', sw['L'] / 2, TOP - 2.5, 0.02, 1.7, 0.3, side='glow:red')
hb.pop()

# white umbrellas with tables by the doors, the trolley shelter, bicycle stands
K.frame(hb, front)
for k in range(4):
    x = min(ex0, ex1) - 9.0 + k * 2.9 if not nA else max(ex0, ex1) + 1.5 + k * 2.9
    gx = front['a'][0] + front['t'][0] * x + front['n'][0] * 6
    gz = front['a'][1] + front['t'][1] * x + front['n'][1] * 6
    hb.push(x, gy(gx, gz), 6.0, 0)
    K.umbrella(hb, 0, 0, 2.6, 2.45)
    K.cafe_set(hb, 0, 0, 80 + k, n=2)
    hb.pop()
sx = ex0 - 4.0
gx = front['a'][0] + front['t'][0] * sx + front['n'][0] * 4
gz = front['a'][1] + front['t'][1] * sx + front['n'][1] * 4
hb.push(sx, gy(gx, gz), 4.0, 0)
for px in (-3.0, 3.0):
    for pz in (-1.0, 1.0):
        hb.cyl('std:steel', px, 0, pz, 0.05, 2.3, segs=6)
hb.box('std:steel', 0, 2.3, 0, 6.4, 0.08, 2.4)
hb.box('std:billaRed', 0, 2.38, 1.15, 6.4, 0.3, 0.06)
for k in range(9):  # trolleys nested in a row
    x = -2.6 + k * 0.62
    hb.box('std:cart', x, 0.25, 0, 0.55, 0.55, 0.9, top=False)
    hb.box('std:cartRed', x, 0.95, -0.47, 0.5, 0.06, 0.05)
    for wx in (-0.2, 0.2):
        hb.box('std:steelDark', x + wx, 0, 0.35, 0.05, 0.25, 0.05)
hb.pop()
hb.pop()

# ------------------------------------------------------------------ the pylon at the corner of the boulevards
pxc, pzc = H.centroid(PYLON)
r = max(math.hypot(p[0] - pxc, p[1] - pzc) for p in PYLON) * 0.95
py = gy(pxc, pzc)
PH = 11.0
hb.push(pxc, py, pzc, math.atan2(-5262 - pxc, 405 - pzc))  # +z towards the boulevard
hb.cyl('std:plinth', 0, -0.5, 0, r + 0.15, 0.8, segs=28)
hb.cyl('std:pylon', 0, 0.3, 0, r, PH - 0.3, segs=28, top='std:grey')
hb.cyl('std:grey', 0, PH, 0, r + 0.08, 0.35, segs=28)
# the BILLA letters round the top, both ways
for base_ang in (0.0, math.pi):
    for i, ch in enumerate('BILLA'):
        a = base_ang + (i - 2) * 1.12 / r
        hb.push(math.sin(a) * (r - 0.12), 0, math.cos(a) * (r - 0.12), a)
        K.text3d(hb, 'glow:yellow', ch, 0, PH - 2.75, 0.0, 1.9, 0.2, side='glow:red')
        hb.pop()
# the tenants' signs: a band wrapped on the boulevard side
n = 10
for k in range(n):
    a0 = -0.9 + 1.8 * k / n
    a1 = -0.9 + 1.8 * (k + 1) / n
    pa = (math.sin(a0) * (r + 0.02), math.cos(a0) * (r + 0.02))
    pb = (math.sin(a1) * (r + 0.02), math.cos(a1) * (r + 0.02))
    hb.face('sign:pylonTenants', [(pa[0], 2.2, pa[1]), (pb[0], 2.2, pb[1]), (pb[0], 7.4, pb[1]), (pa[0], 7.4, pa[1])],
            uv=[(k / n, 0), ((k + 1) / n, 0), ((k + 1) / n, 1), (k / n, 1)])
hb.pop()
# the lamp post beside it with the yellow sculpture
lpx, lpz = pxc + 9.5, pzc + 4.0
hb.push(lpx, gy(lpx, lpz), lpz, 0.6)
hb.cyl('std:steel', 0, 0, 0, 0.16, 14.0, segs=10, r1=0.1)
hb.beam('std:steel', (0, 13.6, 0), (2.2, 14.1, 0), 0.12)
hb.box('std:steelDark', 2.3, 13.85, 0, 0.7, 0.18, 0.3)
for k, (y0, y1, ox) in enumerate(((8.5, 11.0, 0.35), (10.6, 12.8, -0.3))):
    hb.face('std:billaYellow', [(0.1, y0, -0.6), (ox + 0.9, y0 + 0.3, 0.1), (ox + 0.9, y1, 0.2), (0.1, y1 - 0.4, -0.5)])
    hb.face('std:billaYellow', [(0.1, y1 - 0.4, -0.5), (ox + 0.9, y1, 0.2), (ox + 0.9, y0 + 0.3, 0.1), (0.1, y0, -0.6)])
    hb.face('std:billaYellow', [(0.1, y0, 0.6), (ox + 0.9, y0 + 0.3, 0.1), (ox + 0.9, y1, 0.2), (0.1, y1 - 0.4, 0.5)][::-1])
    hb.face('std:billaYellow', [(0.1, y1 - 0.4, 0.5), (ox + 0.9, y1, 0.2), (ox + 0.9, y0 + 0.3, 0.1), (0.1, y0, 0.6)][::-1])
hb.pop()

# ------------------------------------------------------------------ the raised canopy strip and the yard canopy
def canopy_over(P, y0, y1, seed, posts=6.0):
    """Flat roof slab over an outline (y0 = soffit, y1 = top) on steel columns along its long edges."""
    Q = H.orient(P)
    gl = min(gy(*p) for p in Q)
    hb.ring('std:grey', Q, y0, y1)
    hb.cap('std:grey', Q, y1)
    hb.cap('std:white', Q, y0, down=True)
    for e in H.edges(Q):
        if e['L'] < 8:
            continue
        nposts = max(1, int(e['L'] / posts))
        for k in range(nposts + 1):
            s = e['L'] * k / nposts
            x = e['a'][0] + e['t'][0] * s - e['n'][0] * 0.5
            z = e['a'][1] + e['t'][1] * s - e['n'][1] * 0.5
            hb.cyl('std:steel', x, gy(x, z) - 0.2, z, 0.14, y0 - gy(x, z) + 0.2, segs=10, top=False)


canopy_over(WALK, 4.0 + gy(*H.centroid(WALK)), 4.6 + gy(*H.centroid(WALK)), 1)
canopy_over(YARD, 6.6, 7.4, 2, posts=7.0)

# ------------------------------------------------------------------ build, bake, export
ob = hb.build()
if '--nobake' not in sys.argv:
    H.add_ground(pk, hb, margin=25, step=3.0)
    H.lightmap_uv(ob)
    ao = H.bake_ao(ob, H.arg('--size', 1024, int), 3.5, H.arg('--samples', 48, int))
    H.save_ao(ao, NAME)
    H.export(ob, NAME, {'anchor': [round(cx, 2), round(cz, 2)], 'base': DATUM, 'source': 'tools/blender/hero/billa.py'})
if '--preview' in sys.argv:
    SP = os.environ.get('PREVIEW_DIR', '/tmp')
    if '--nobake' in sys.argv:
        H.add_ground(pk, hb, margin=60, step=4.0)
    rel = lambda x, y, z: (x - cx, y, z - cz)
    at = lambda x, h, z: rel(x, gy(x, z) + h, z)
    H.preview(f'{SP}/billa_blvd.jpg', at(-5235, 2.5, 425), at(-5150, 5, 425), lens=20)
    H.preview(f'{SP}/billa_corner.jpg', at(-5218, 3.0, 382), at(-5150, 5, 430), lens=20)
