"""Pack OSM/Overture extracts + DEM into the compact world file embedded in
the game (src/data/world.pack.json.gz.b64).

Coordinates are local metres (see geo.py) quantised to decimetres and
delta-encoded per polyline. Everything is deterministic.

usage: python3 tools/build_world.py <datadir> <route.json> <dem.npz> <outdir>
"""
import sys, os, json, math, gzip, base64, hashlib, collections
import numpy as np
import pyarrow.parquet as pq
import shapely.wkb as wkb
from shapely.geometry import LineString, Point, Polygon, MultiPolygon
from shapely.ops import transform
sys.path.insert(0, os.path.dirname(__file__))
from geo import to_xz, ORIGIN_LAT, ORIGIN_LON
from roadspec import road_width

DATADIR, ROUTE, DEM, OUTDIR = sys.argv[1:5]
route = json.load(open(ROUTE))
route_lines = [LineString(route['directions'][k]['path']) for k in 'AB']
route_union = route_lines[0].union(route_lines[1])
corridor_near = route_union.buffer(450)
corridor_mid = route_union.buffer(900)


def h01(s):
    return int(hashlib.md5(s.encode()).hexdigest()[:8], 16) / 0xffffffff


def proj(g):
    return transform(lambda x, y, z=None: to_xz(x, y), g)


def q(v):
    return int(round(v * 10))


def enc_line(pts):
    out = []
    px = pz = 0
    for x, z in pts:
        X, Z = q(x), q(z)
        out += [X - px, Z - pz]
        px, pz = X, Z
    return out


names = []
name_idx = {}


def nid(n):
    if not n:
        return -1
    if n not in name_idx:
        name_idx[n] = len(names)
        names.append(n)
    return name_idx[n]


# ---------------------------------------------------------------- roads
ROAD_CLASSES = ['trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential',
                'living_street', 'service', 'unknown', 'pedestrian', 'footway', 'path', 'cycleway',
                'steps', 'track']
SURF = ['paved', 'asphalt', 'paving_stones', 'sett', 'gravel', 'unpaved', 'dirt', 'concrete', 'unknown', 'metal']
# Streets known to be paved with Sofia's yellow paving blocks ("жълтите павета").
YELLOW_BRICK = {'бул. Цар Освободител', 'Цар Освободител', 'пл. Александър Невски', 'Московска'}

segs = pq.read_table(f'{DATADIR}/seg.parquet').to_pylist()
roads = []
rails = []
for r in segs:
    g = proj(wkb.loads(r['geometry']))
    if r['subtype'] == 'rail':
        if r['class'] in ('tram',) and g.distance(route_union) < 900:
            rails.append(enc_line(list(g.coords)))
        continue
    cls = r['class']
    if cls not in ROAD_CLASSES:
        continue
    sub = r['subclass']
    if sub in ('sidewalk',):
        continue
    dist = g.distance(route_union)
    small = cls in ('footway', 'path', 'cycleway', 'steps', 'track', 'service', 'living_street', 'unknown')
    if small and dist > 420:
        continue
    if sub in ('driveway', 'parking_aisle') and dist > 160:
        continue
    flags = set()
    for f in r['road_flags'] or []:
        if f['between'] is None:
            flags.update(f['values'])
    if flags & {'is_tunnel', 'is_indoor', 'is_abandoned'}:
        continue
    lvl = 0
    for lr in r['level_rules'] or []:
        if lr['between'] is None:
            lvl = lr['value']
    if lvl < 0:
        continue
    oneway = any(a['access_type'] == 'denied' and (a['when'] or {}).get('heading') == 'backward'
                 and not (a['when'] or {}).get('mode') and a['between'] is None
                 for a in r['access_restrictions'] or [])
    width = road_width(cls, oneway, r['width_rules'], sub)
    surface = 'paved'
    for sr in r['road_surface'] or []:
        if sr['between'] is None:
            surface = sr['value']
    name = r['names']['primary'] if r['names'] else None
    if name in YELLOW_BRICK:
        surface = 'yellow_brick'
    speed = None
    for sl in r['speed_limits'] or []:
        if sl['max_speed'] and sl['between'] is None:
            speed = sl['max_speed']['value']
    f = (1 if oneway else 0) | (2 if 'is_bridge' in flags else 0) | (8 if 'is_link' in flags else 0) | \
        (16 if sub == 'crosswalk' else 0) | (32 if sub in ('driveway', 'parking_aisle') else 0) | \
        (64 if 'is_covered' in flags else 0)
    roads.append(dict(c=ROAD_CLASSES.index(cls), w=int(round(width * 10)), n=nid(name), f=f,
                      s=(SURF + ['yellow_brick']).index(surface) if surface in SURF + ['yellow_brick'] else 0,
                      l=lvl, v=speed or 0, p=enc_line(list(g.coords)),
                      cn=[[c['connector_id'][:12], round(c['at'], 4)] for c in (r['connectors'] or [])]))
# compress connector ids to ints
cid = {}
for rd in roads:
    rd['cn'] = [[cid.setdefault(c, len(cid)), a] for c, a in rd['cn']]
print('roads', len(roads), 'rails', len(rails), file=sys.stderr)

# ---------------------------------------------------------------- buildings
BCLASS = ['apartments', 'detached', 'house', 'retail', 'office', 'residential', 'service', 'industrial',
          'semidetached_house', 'roof', 'garages', 'warehouse', 'commercial', 'university', 'kindergarten',
          'government', 'school', 'garage', 'dormitory', 'hotel', 'hospital', 'shelter', 'shed', 'church',
          'sports_centre', 'guardhouse', 'civic', 'greenhouse', 'public', 'other']
CENTER = Point(-1200, -2600)  # rough centre of the historic core near the route start


def est_height(b, area, cls, p):
    if b.get('height'):
        return float(b['height'])
    nf = b.get('num_floors')
    hs = h01(b['id'])
    central = p.distance(CENTER) < 1300
    if nf:
        return nf * 3.0 + (0.6 if nf > 2 else 0.3)
    if cls in ('house', 'detached', 'semidetached_house'):
        return 6.0 + hs * 2
    if cls in ('garages', 'garage', 'shed', 'guardhouse', 'shelter', 'greenhouse'):
        return 2.8 + hs * 0.6
    if cls == 'roof':
        return 4.0
    if cls in ('industrial', 'warehouse', 'service'):
        return 5 + hs * 4
    if cls in ('retail', 'commercial'):
        return 4.5 + hs * 5 if area > 300 else 3.5 + hs
    if cls == 'kindergarten':
        return 7.0
    if cls in ('school', 'university', 'hospital', 'government', 'office', 'civic', 'public'):
        return 3.3 * (3 + int(hs * 3))
    if cls in ('apartments', 'residential', 'dormitory', 'hotel'):
        if central:
            return 3.1 * (4 + int(hs * 3)) + 0.8
        if area > 900:
            return 2.8 * [8, 8, 9, 12, 14, 16][int(hs * 5.99)] + 1
        if area > 300:
            return 2.8 * [6, 8, 8, 9, 10][int(hs * 4.99)] + 1
        return 2.9 * (3 + int(hs * 3)) + 0.8
    if area < 60:
        return 3 + hs * 1.5
    if area > 800:
        return 3.2 * (3 + int(hs * 4))
    return 3.1 * (2 + int(hs * 3))


def facade_style(cls, height, p, hs, b):
    """0 panel,1 renovated panel,2 classic plaster,3 glass office,4 house,
    5 industrial,6 institutional,7 commercial,8 church/stone"""
    central = p.distance(CENTER) < 1300
    mat = b.get('facade_material')
    if mat == 'glass':
        return 3
    if cls == 'church':
        return 8
    if cls in ('house', 'detached', 'semidetached_house'):
        return 4
    if cls in ('industrial', 'warehouse', 'garages', 'garage', 'shed', 'service', 'greenhouse'):
        return 5
    if cls in ('retail', 'commercial') and height < 12:
        return 7
    if cls in ('office', 'hotel') and height > 18:
        return 3 if hs < 0.6 else 6
    if cls in ('university', 'school', 'hospital', 'government', 'civic', 'public', 'kindergarten'):
        return 2 if central else 6
    if central:
        return 2
    if cls in ('apartments', 'residential', 'dormitory') and height > 14:
        return 0 if hs < 0.55 else 1
    if cls in ('office',):
        return 3 if hs < 0.4 else 6
    return 2 if hs < 0.35 else (1 if hs < 0.6 else 0)


bl = pq.read_table(f'{DATADIR}/bld.parquet').to_pylist()
parts = pq.read_table(f'{DATADIR}/bpart.parquet').to_pylist()
parts_by_bid = collections.defaultdict(list)
for pt in parts:
    parts_by_bid[pt['building_id']].append(pt)

ROOF = ['flat', 'hipped', 'gabled', 'dome', 'onion', 'pyramidal', 'mansard', 'round', 'skillion']


def ring_enc(ring):
    pts = list(ring.coords)[:-1]
    return enc_line(pts)


def make_bentry(g, height, minh, cls, roof, name, style, color, bid, levels, prt=False):
    polys = [g] if g.geom_type == 'Polygon' else (list(g.geoms) if g.geom_type == 'MultiPolygon' else [])
    out = []
    for pg in polys:
        pg = pg.simplify(0.25, preserve_topology=True)
        if pg.is_empty or pg.area < 6:
            continue
        pg = Polygon(pg.exterior.coords[::-1] if not pg.exterior.is_ccw else pg.exterior.coords,
                     [r.coords for r in pg.interiors])
        e = dict(p=ring_enc(pg.exterior), h=int(round(height * 10)), c=BCLASS.index(cls) if cls in BCLASS else BCLASS.index('other'),
                 k=style, n=nid(name))
        if minh:
            e['m'] = int(round(minh * 10))
        if pg.interiors:
            e['o'] = [ring_enc(r) for r in pg.interiors]
        if levels:
            e['lv'] = levels
        if roof and roof != 'flat':
            e['r'] = ROOF.index(roof) if roof in ROOF else 1
            if roof in ('hipped', 'gabled', 'pyramidal', 'mansard', 'skillion') and not pg.interiors:
                mrr = pg.minimum_rotated_rectangle
                cs = list(mrr.exterior.coords)
                a = math.dist(cs[0], cs[1]); bb = math.dist(cs[1], cs[2])
                minor = min(a, bb)
                inset = min(minor * 0.42, 6.0)
                inner = pg.buffer(-inset, join_style=2)
                if inner.geom_type == 'Polygon' and not inner.is_empty and inner.area > 1:
                    inner = inner.simplify(0.3)
                    e['i'] = ring_enc(Polygon(inner.exterior.coords if inner.exterior.is_ccw else inner.exterior.coords[::-1]).exterior)
                    e['rh'] = int(round(min(inset * 0.75, 5.0) * 10))
                else:
                    e.pop('r')
        if color:
            e['col'] = color
        if prt:
            e['pt'] = 1
        out.append(e)
    return out


# ---------------------------------------------------------------- researched per-building data
# data/research/world/*/buildings_overrides.json, keyed by OSM id ("w123", "r45"): what each building
# really looks like (type, floors, colours, windows, ground floor, shop signs). See data/research/BRIEF.md.
KINDS = ['panel_1960s', 'panel_1970s', 'panel_insulated_patchwork', 'epk_tower', 'brick_socialist', 'stalinist',
         'neoclassical_prewar', 'modernist_institutional', 'glass_office', 'modern_residential', 'house',
         'sports_hall', 'industrial', 'church', 'kiosk', 'hotel_modernist', 'other']
KIND_STYLE = {'panel_1960s': 0, 'panel_1970s': 0, 'panel_insulated_patchwork': 1, 'epk_tower': 0,
              'brick_socialist': 2, 'stalinist': 2, 'neoclassical_prewar': 2, 'modernist_institutional': 6,
              'glass_office': 3, 'modern_residential': 1, 'house': 4, 'sports_hall': 7, 'industrial': 5,
              'church': 8, 'kiosk': 7, 'hotel_modernist': 6}
KIND_FLOOR_H = {'panel_1960s': 2.8, 'panel_1970s': 2.8, 'panel_insulated_patchwork': 2.8, 'epk_tower': 2.9,
                'brick_socialist': 3.0, 'stalinist': 3.6, 'neoclassical_prewar': 3.8, 'modernist_institutional': 3.6,
                'glass_office': 3.7, 'modern_residential': 3.0, 'house': 3.0, 'hotel_modernist': 3.2}
WINDOWS = ['punched_grid', 'ribbon', 'curtain_wall', 'loggia_bands', 'balcony_bands', 'shopfront_only']
GROUND = ['shops', 'lobby', 'blank', 'columns', 'garages', 'entrances']
ROOF_ALIAS = {'shed': 'skillion'}
CONF_RANK = {'high': 3, 'medium': 2, 'low': 1}
OVR = {}
_ovr_dir = os.path.join(os.path.dirname(__file__), '..', 'data', 'research', 'world')
for sub in sorted(os.listdir(_ovr_dir)) if os.path.isdir(_ovr_dir) else []:
    fn = os.path.join(_ovr_dir, sub, 'buildings_overrides.json')
    if not os.path.exists(fn):
        continue
    for k, v in json.load(open(fn, encoding='utf-8')).items():
        if not isinstance(v, dict):
            continue
        k = k.split('@')[0].strip()
        old = OVR.get(k)
        # two researchers may describe the same building: keep the more confident one
        if old is None or CONF_RANK.get(v.get('confidence'), 0) >= CONF_RANK.get(old.get('confidence'), 0):
            OVR[k] = v
print('research overrides', len(OVR), file=sys.stderr)


def hexint(h):
    try:
        return int(str(h).lstrip('#')[:6], 16)
    except (TypeError, ValueError):
        return None


def osm_key(b):
    rec = ((b.get('sources') or [{}])[0] or {}).get('record_id') or ''
    return rec.split('@')[0]


def apply_override(b, height, roof, style, levels, color):
    """Returns (height, roof, style, levels, roof colour, compact override record or None)."""
    o = OVR.get(osm_key(b))
    if not o:
        return height, roof, style, levels, color, None
    kind = o.get('kind') if o.get('kind') in KINDS else None
    lv = o.get('levels')
    if isinstance(lv, (int, float)) and lv > 0:
        levels = int(lv)
    hm = o.get('height_m')
    if isinstance(hm, (int, float)) and hm > 1:
        height = float(hm)
    elif levels:
        height = levels * KIND_FLOOR_H.get(kind, 3.0) + 0.8
    r = o.get('roof')
    if r:
        roof = ROOF_ALIAS.get(r, r) if r != 'flat' else None
    if kind in KIND_STYLE:
        style = KIND_STYLE[kind]
    if o.get('roof_hex'):
        color = o['roof_hex']
    rec = {'kd': KINDS.index(kind) if kind else -1}
    if hexint(o.get('wall_hex')) is not None:
        rec['wc'] = hexint(o['wall_hex'])
    if hexint(o.get('accent_hex')) is not None:
        rec['ac'] = hexint(o['accent_hex'])
    if o.get('window') in WINDOWS:
        rec['wn'] = WINDOWS.index(o['window'])
    if o.get('ground_floor') in GROUND:
        rec['gf'] = GROUND.index(o['ground_floor'])
    signs = [[str(x.get('text', ''))[:28], hexint(x.get('bg_hex')) or 0x1d4f91, hexint(x.get('fg_hex')) or 0xffffff]
             for x in (o.get('shop_signs') or []) if isinstance(x, dict) and x.get('text')]
    if signs:
        rec['sg'] = signs[:6]
    if o.get('label'):
        rec['lb'] = str(o['label'])[:60]
    return height, roof, style, levels, color, rec


stop_pole = {}
for dname in 'AB':
    for st in route['directions'][dname]['stops']:
        stop_pole[st['code']] = Point(st['pole'])
LANDMARK_NAMES = [('Александър Невски', 'alexander_nevsky'), ('Зимен дворец', 'winter_palace'),
                  ('Христо Ботев', 'botev_hall'), ('Арена 8888', 'arena'), ('Плиска', 'hotel_pliska'),
                  ('Българска национална телевизия', 'bnt'), ('Национална библиотека', 'national_library'),
                  ('Народно събрание', 'parliament'), ('1-ви блок', 'tu_block1'),
                  ('Университетска библиотека', 'su_library'), ('Synergy Tower', 'synergy'),
                  ('Софарма', 'sopharma'), ('Hyatt', 'hyatt'), ('Sofia Tech', 'tech_one')]
# Landmarks identified by proximity to a stop pole (unnamed in OSM).
LANDMARK_NEAR = [('1697', 140, 'su_rectorate'), ('0441', 170, 'military_academy')]
lm_by_id = {}
for code, rad, lm in LANDMARK_NEAR:
    best = None
    for b in bl:
        g = proj(wkb.loads(b['geometry']))
        if g.distance(stop_pole[code]) < rad and (best is None or g.area > best[0]):
            best = (g.area, b['id'])
    if best:
        lm_by_id[best[1]] = lm
for b in bl:
    n = (b['names'] or {}).get('primary') or ''
    for key, lm in LANDMARK_NAMES:
        if key in n:
            lm_by_id[b['id']] = lm
print('landmarks', {v: k[:8] for k, v in lm_by_id.items()}, file=sys.stderr)

buildings = []
blocks = []
sign_bld = []  # (footprint, height, override) near the route, for shop signs
stats = collections.Counter()
for b in bl:
    if b.get('is_underground'):
        continue
    g = proj(wkb.loads(b['geometry']))
    if not g.is_valid:
        g = g.buffer(0)
    c = g.centroid
    if not corridor_mid.contains(c) and g.distance(route_union) > 900:
        stats['far'] += 1
        mrr = g.minimum_rotated_rectangle
        if mrr.geom_type == 'Polygon' and g.area > 40:
            cs = list(mrr.exterior.coords)
            w = math.dist(cs[0], cs[1]); d = math.dist(cs[1], cs[2])
            ang = math.atan2(cs[1][1] - cs[0][1], cs[1][0] - cs[0][0]) % math.pi
            hgt = est_height(b, g.area, b['class'] or 'other', c)
            blocks += [q(c.x), q(c.y), int(round(w * 2)), int(round(d * 2)), int(round(ang / math.pi * 255)), int(round(hgt * 2))]
        continue
    area = g.area
    cls = b['class'] or 'other'
    name = b['names']['primary'] if b['names'] else None
    height = est_height(b, area, cls, c)
    hs = h01(b['id'])
    style = facade_style(cls, height, c, hs, b)
    roof = b.get('roof_shape')
    if roof is None and cls in ('house', 'detached', 'semidetached_house') and area < 400:
        roof = 'hipped'
    if roof is None and style == 2 and height < 22 and area < 1600 and hs < 0.55:
        roof = 'hipped'
    color = b.get('roof_color') if b.get('roof_color') else None
    levels = b.get('num_floors')
    height, roof, style, levels, color, ovr = apply_override(b, height, roof, style, levels, color)
    if ovr:
        stats['researched'] += 1
    bparts = parts_by_bid.get(b['id']) if b.get('has_parts') else None
    if bparts:
        # Base outline is still emitted (low), parts carry the real massing.
        for pt in bparts:
            pg = proj(wkb.loads(pt['geometry']))
            ph = pt.get('height') or ((pt.get('num_floors') or 0) * 3.2 + 1 if pt.get('num_floors') else height)
            pmin = pt.get('min_height') or ((pt.get('min_floor') or 0) * 3.2 if pt.get('min_floor') else 0)
            if ph <= pmin:
                continue
            proof = pt.get('roof_shape') or 'flat'
            col = pt.get('roof_color')
            if proof in ('dome', 'onion') and not col:
                col = '#4f8a72' if pt.get('roof_material') == 'copper' else None
            ents = make_bentry(pg, ph, pmin, cls, proof, None, style, col, pt['id'], pt.get('num_floors'), True)
            for e in ents:
                if b['id'] in lm_by_id:
                    e['lm'] = lm_by_id[b['id']]
                if ovr:
                    e['ov'] = ovr
            buildings += ents
        stats['parts'] += len(bparts)
        if any((pt.get('min_height') or 0) == 0 and not pt.get('min_floor') for pt in bparts):
            continue
    ents = make_bentry(g, height, None, cls, roof, name, style, color, b['id'], levels)
    if g.distance(route_union) < 75:
        sign_bld.append((g, height, ovr, len(buildings), ents))
    for e in ents:
        if b['id'] in lm_by_id:
            e['lm'] = lm_by_id[b['id']]
        if ovr:
            e['ov'] = ovr
    buildings += ents
    stats['bld'] += 1
print('buildings', len(buildings), dict(stats), file=sys.stderr)

# ---------------------------------------------------------------- areas (land use / cover / water)
AREA_T = ['park', 'grass', 'pitch', 'playground', 'plaza', 'forest', 'scrub', 'water', 'parking', 'garden',
          'track', 'construction', 'stadium', 'flowerbed', 'cemetery', 'school', 'hospital', 'university',
          'kindergarten', 'residential', 'commercial', 'industrial', 'railway', 'brownfield', 'meadow', 'military',
          'religious', 'zoo', 'dog_park', 'farmland', 'heath', 'bare_rock', 'sand', 'allotments']
areas = []


def add_area(t, g, layer=0):
    polys = [g] if g.geom_type == 'Polygon' else (list(g.geoms) if g.geom_type == 'MultiPolygon' else [])
    for pg in polys:
        if pg.area < 15:
            continue
        pg = pg.intersection(corridor_mid) if pg.distance(route_union) < 900 else None
        if pg is None or pg.is_empty:
            continue
        for p2 in ([pg] if pg.geom_type == 'Polygon' else [x for x in getattr(pg, 'geoms', []) if x.geom_type == 'Polygon']):
            p2 = p2.simplify(0.4, preserve_topology=True)
            if p2.area < 15:
                continue
            e = dict(t=AREA_T.index(t), p=ring_enc(p2.exterior), y=layer)
            if p2.interiors:
                e['o'] = [ring_enc(r) for r in p2.interiors if Polygon(r).area > 10]
            areas.append(e)


lu = pq.read_table(f'{DATADIR}/landuse.parquet').to_pylist()
LU_MAP = {'park': 'park', 'grass': 'grass', 'pitch': 'pitch', 'playground': 'playground', 'plaza': 'plaza',
          'pedestrian': 'plaza', 'garden': 'garden', 'track': 'track', 'construction': 'construction',
          'stadium': 'stadium', 'flowerbed': 'flowerbed', 'cemetery': 'cemetery', 'school': 'school',
          'university': 'university', 'kindergarten': 'kindergarten', 'hospital': 'hospital',
          'residential': 'residential', 'commercial': 'commercial', 'industrial': 'industrial',
          'railway': 'railway', 'brownfield': 'brownfield', 'meadow': 'meadow', 'military': 'military',
          'religious': 'religious', 'zoo': 'zoo', 'dog_park': 'dog_park', 'farmland': 'farmland',
          'recreation_ground': 'park', 'schoolyard': 'school', 'allotments': 'allotments', 'retail': 'commercial',
          'institutional': 'university', 'education': 'school', 'greenfield': 'meadow'}
for x in lu:
    t = LU_MAP.get(x['class'])
    if not t:
        continue
    layer = 0 if t in ('residential', 'commercial', 'industrial', 'railway', 'military', 'religious', 'school',
                       'university', 'kindergarten', 'hospital', 'cemetery', 'zoo', 'brownfield', 'construction', 'farmland', 'allotments') else 1
    if t in ('park', 'garden', 'meadow', 'dog_park'):
        layer = 1
    if t in ('grass', 'flowerbed'):
        layer = 2
    if t in ('pitch', 'playground', 'plaza', 'track', 'stadium'):
        layer = 3
    add_area(t, proj(wkb.loads(x['geometry'])), layer)
land = pq.read_table(f'{DATADIR}/land.parquet').to_pylist()
trees = []
tree_rows = []
for x in land:
    g = proj(wkb.loads(x['geometry']))
    if x['class'] == 'tree':
        if g.distance(route_union) < 700:
            trees += [q(g.x), q(g.y)]
    elif x['class'] == 'tree_row':
        if g.distance(route_union) < 700:
            tree_rows.append(enc_line(list(g.coords)))
    elif x['class'] in ('wood', 'forest'):
        add_area('forest', g, 1)
    elif x['class'] in ('scrub', 'shrub', 'shrubbery', 'heath'):
        add_area('scrub', g, 1)
    elif x['class'] in ('grassland', 'grass'):
        add_area('grass', g, 2)
water_lines = []
for x in pq.read_table(f'{DATADIR}/water.parquet').to_pylist():
    g = proj(wkb.loads(x['geometry']))
    if g.geom_type in ('Polygon', 'MultiPolygon'):
        add_area('water', g, 4)
    elif g.geom_type == 'LineString' and g.distance(route_union) < 900:
        water_lines.append(dict(c=x['class'], p=enc_line(list(g.coords)), n=nid(x['names']['primary'] if x['names'] else None)))
print('areas', len(areas), 'trees', len(trees) // 2, 'rows', len(tree_rows), 'waterlines', len(water_lines), file=sys.stderr)

# ---------------------------------------------------------------- point infrastructure
infra = pq.read_table(f'{DATADIR}/infra.parquet').to_pylist()
PROPS = {'street_lamp': 'lamp', 'traffic_signals': 'signal', 'bench': 'bench', 'waste_basket': 'bin',
         'bollard': 'bollard', 'fire_hydrant': 'hydrant', 'crossing': 'crossing', 'recycling': 'recycling',
         'waste_disposal': 'container', 'bus_stop': 'busstop', 'vending_machine': 'vending', 'atm': 'atm',
         'information': 'info', 'artwork': 'artwork', 'fountain': 'fountain', 'post_box': 'postbox',
         'subway_station': 'metro', 'catenary_mast': 'mast', 'power_pole': 'pole', 'stop': 'stopsign',
         'give_way': 'giveway', 'bicycle_parking': 'bikepark'}
props = collections.defaultdict(list)
lines_infra = collections.defaultdict(list)
for x in infra:
    k = PROPS.get(x['class'])
    g = proj(wkb.loads(x['geometry']))
    if g.distance(route_union) > 450:
        continue
    tags = dict(x['source_tags'] or [])
    if x['class'] in ('fence', 'wall', 'hedge', 'guard_rail', 'retaining_wall', 'kerb') and g.geom_type == 'LineString':
        lines_infra[x['class']].append(enc_line(list(g.coords)))
        continue
    if x['class'] == 'bridge' and g.geom_type in ('Polygon', 'MultiPolygon'):
        add_area('plaza', g, 3)
        continue
    if not k or g.geom_type != 'Point':
        continue
    extra = 0
    if k == 'crossing':
        cr = tags.get('crossing', '')
        extra = {'marked': 1, 'zebra': 1, 'uncontrolled': 1, 'traffic_signals': 2, 'unmarked': 0}.get(cr, 1)
        if tags.get('crossing:markings') in ('zebra', 'yes'):
            extra = max(extra, 1)
    if k == 'busstop':
        ref = tags.get('ref', '')
        extra = int(ref) if ref.isdigit() else 0
        props['busstop_meta'].append([extra, 1 if tags.get('shelter') == 'yes' else 0, 1 if tags.get('bench') == 'yes' else 0, nid(x['names']['primary'] if x['names'] else None)])
    props[k] += [q(g.x), q(g.y), extra]
print({k: len(v) // 3 for k, v in props.items() if k != 'busstop_meta'}, {k: len(v) for k, v in lines_infra.items()}, file=sys.stderr)

# ---------------------------------------------------------------- DEM
dem = np.load(DEM)


def enc_grid(g, meta, base, scale):
    a = np.round((g - base) * scale).astype(np.int64)
    flat = a.flatten()
    d = np.diff(np.concatenate([[0], flat]))
    x0, z0, dx, nx, nz = meta
    return dict(x0=float(x0), z0=float(z0), dx=float(dx), nx=int(nx), nz=int(nz), base=base, scale=scale,
                d=d.tolist())


# ---------------------------------------------------------------- shop signs
# Real businesses near the route (Overture places: Meta, Foursquare, AllThePlaces...) and the signs
# the researchers listed per building, mounted on the facade nearest to the business.
SIGN_CATS = {
    'restaurant', 'bar', 'cafe', 'coffee_shop', 'fast_food_restaurant', 'casual_eatery', 'food_and_beverage_store',
    'convenience_store', 'fashion_and_apparel_store', 'pharmacy_and_drug_store', 'bank_or_credit_union',
    'electronics_store', 'flowers_and_gifts_store', 'personal_care_and_beauty_store', 'books_music_and_video_store',
    'sporting_goods_store', 'shopping', 'hardware_home_and_garden_store', 'personal_or_beauty_service', 'bakery',
    'grocery_store', 'supermarket', 'pizzeria', 'pub', 'dance_club', 'gym', 'optician', 'jewelry_store', 'pet_store',
    'mobile_phone_store', 'betting_shop', 'casino', 'hotel', 'dental_clinic', 'shipping_or_delivery_service',
    'travel_service', 'arts_crafts_and_hobby_store', 'toy_store', 'shoe_store', 'liquor_store', 'tobacco_shop',
    'butcher_shop', 'pastry_shop', 'ice_cream_shop', 'tea_room', 'department_store', 'furniture_store',
}
# brand colours (background, text); everything else gets a category colour
BRANDS = [
    ('lidl', 0x0050aa, 0xfff000), ('billa', 0xffe500, 0xd6001c), ('kaufland', 0xe10915, 0xffffff),
    ('фантастико', 0x00813d, 0xffffff), ('fantastico', 0x00813d, 0xffffff), ('т-маркет', 0xe30613, 0xffffff),
    ('t-market', 0xe30613, 0xffffff), ('cba', 0xe2001a, 0xffffff), ('minimart', 0x1b8f3a, 0xffffff),
    ('дск', 0x006a4d, 0xffffff), ('dsk', 0x006a4d, 0xffffff), ('unicredit', 0xe2001a, 0xffffff),
    ('пощенска банка', 0xc8102e, 0xffffff), ('postbank', 0xc8102e, 0xffffff), ('fibank', 0x003d7c, 0xffffff),
    ('първа инвестиционна', 0x003d7c, 0xffffff), ('обб', 0x0a3a7a, 0xffffff), ('ubb', 0x0a3a7a, 0xffffff),
    ('централна кооперативна', 0x00843d, 0xffffff), ('raiffeisen', 0xfff200, 0x111111), ('procredit', 0xd52b1e, 0xffffff),
    ('sopharmacy', 0x00a651, 0xffffff), ('субра', 0xd71920, 0xffffff), ('марешки', 0xe30613, 0xffffff),
    ('profarma', 0x0097d7, 0xffffff), ('профарма', 0x0097d7, 0xffffff), ('аптек', 0x009a44, 0xffffff),
    ("mcdonald", 0xda291c, 0xffc72c), ('kfc', 0xe4002b, 0xffffff), ('hesburger', 0xc8102e, 0xffffff),
    ("domino", 0x006491, 0xffffff), ('starbucks', 0x00704a, 0xffffff), ('costa', 0x6d1f37, 0xffffff),
    ('happy', 0xffd200, 0x7a1416), ('a1', 0xe30613, 0xffffff), ('yettel', 0xb4ff00, 0x111111),
    ('vivacom', 0x5a2d82, 0xffffff), ('speedy', 0xd71920, 0xffffff), ('еконт', 0x1b4b9b, 0xffffff),
    ('econt', 0x1b4b9b, 0xffffff), ('български пощи', 0xffcc00, 0x1d3b7a), ('efbet', 0x0a8a3c, 0xffffff),
    ('eurofootball', 0x0b4ea2, 0xffffff), ('palms bet', 0x7a1a8c, 0xffffff), ('winbet', 0xf5a800, 0x111111),
    ('dm ', 0xffffff, 0x1b3a8a), ('lilly', 0xe4007c, 0xffffff), ('пеликан', 0x004b93, 0xffffff),
    ('технополис', 0xf28c00, 0xffffff), ('technopolis', 0xf28c00, 0xffffff), ('zora', 0x003f8a, 0xffffff),
    ('shell', 0xffd500, 0xdd1d21), ('omv', 0x002f6c, 0xffffff), ('лукойл', 0xd52b1e, 0xffffff), ('lukoil', 0xd52b1e, 0xffffff),
    ('eko', 0x003b7d, 0xffffff), ('petrol', 0x0068b4, 0xffffff), ('пицария', 0x9e1b1b, 0xffffff),
    ('100 грама', 0xd4006f, 0xffffff), ('неделя', 0x7a2a7f, 0xffffff), ('березка', 0x2a6b2a, 0xffffff),
]
CAT_COL = {
    'pharmacy_and_drug_store': (0x009a44, 0xffffff), 'bank_or_credit_union': (0x123c6e, 0xffffff),
    'restaurant': (0x3a2418, 0xf2d38a), 'bar': (0x161616, 0xf5c242), 'cafe': (0x4a2f22, 0xffffff),
    'coffee_shop': (0x4a2f22, 0xffffff), 'fast_food_restaurant': (0xc8102e, 0xffffff),
    'casual_eatery': (0x8a1c1c, 0xffffff), 'food_and_beverage_store': (0x1b6f3a, 0xffffff),
    'convenience_store': (0x1b6f3a, 0xffffff), 'fashion_and_apparel_store': (0x111111, 0xffffff),
    'personal_or_beauty_service': (0xf2f2f2, 0x7a1f5c), 'personal_care_and_beauty_store': (0xf2f2f2, 0x7a1f5c),
    'electronics_store': (0x0d3b66, 0xffffff), 'flowers_and_gifts_store': (0xffffff, 0x2e7d32),
    'dental_clinic': (0xffffff, 0x0b6aa2), 'hotel': (0x1f1f2e, 0xe8c66a), 'gym': (0x111111, 0xff5a1f),
    'shipping_or_delivery_service': (0xd71920, 0xffffff), 'betting_shop': (0x0a8a3c, 0xffffff),
}
KIOSK_KD = KINDS.index('kiosk')


def sign_style(text, cat):
    t = text.lower()
    for key, bg, fg in BRANDS:
        if key in t:
            return bg, fg
    return CAT_COL.get(cat, (0xf4f1ea, 0x1d2b4f))


def clean_text(n):
    n = ' '.join(str(n).replace('„', '').replace('“', '').replace('"', '').replace('«', '').replace('»', '').split())
    n = n.split(' - ')[0].split(' | ')[0].split(', ')[0].strip()
    if n.endswith('…') or len(n) > 24:  # cut at a word boundary
        words, out = n.rstrip('…').split(), ''
        for w in words:
            if len(out) + len(w) + 1 > 24:
                break
            out = (out + ' ' + w).strip()
        n = out
    low = n.lower()
    if low.startswith(('ul.', 'ул.', 'бул.', 'bul.')) or '@' in n or 'http' in low or 'www.' in low:
        return ''
    return n


def sign_text(p):
    br = ((p.get('brand') or {}).get('names') or {}).get('primary')
    n = br if br and len(br) < 26 and not br.lower().startswith(('easybox', 'box now')) else (p['names'] or {}).get('primary') or ''
    return clean_text(n)


def facade_slot(poly, pt):
    """Nearest point on the footprint ring, its outward normal and the ring position (m)."""
    ring = poly.exterior
    d = ring.project(pt)
    q0 = ring.interpolate(d)
    a = ring.interpolate(max(0.0, d - 0.3)); b2 = ring.interpolate(min(ring.length, d + 0.3))
    tx, tz = b2.x - a.x, b2.y - a.y
    L = math.hypot(tx, tz) or 1.0
    nx, nz = tz / L, -tx / L
    if poly.contains(Point(q0.x + nx * 0.4, q0.y + nz * 0.4)):
        nx, nz = -nx, -nz
    # usable straight run around the slot (for the sign width)
    return q0.x, q0.y, nx, nz, d


from shapely import STRtree
signs = []
if sign_bld:
    tree = STRtree([sb[0] for sb in sign_bld])
    used = collections.defaultdict(list)  # building index -> [(ring pos, half width, text)]

    def place_sign(bi, pt, text, bg, fg, prio):
        poly, height, ovr, pidx, ents = sign_bld[bi]
        if not text or len(used[bi]) >= 7 or any(t.lower() == text.lower() for _, _, t in used[bi]):
            return False
        x, z, nx, nz, d = facade_slot(poly, pt)
        w = max(1.6, min(7.5, 0.9 + 0.3 * len(text)))
        L = poly.exterior.length
        for _ in range(6):  # slide along the facade away from neighbouring signs
            clash = [(p0, hw) for p0, hw, _ in used[bi] if abs(p0 - d) < hw + w / 2 + 0.4]
            if not clash:
                break
            p0, hw = clash[0]
            d = (p0 + (hw + w / 2 + 0.5) * (1 if d >= p0 else -1)) % L
            x, z, nx, nz, d = facade_slot(poly, poly.exterior.interpolate(d))
        else:
            return False
        used[bi].append((d, w / 2, text))
        kiosk = 1 if ovr and ovr.get('kd') == KIOSK_KD else 0
        if not ovr:  # a business with a sign: the ground floor is a shopfront
            for e in ents:
                e.setdefault('ov', {'kd': -1, 'gf': 0})
        signs.append([q(x), q(z), int(round(nx * 100)), int(round(nz * 100)), int(round(w * 10)), nid(text), bg, fg,
                      pidx, kiosk, prio])
        return True

    # 1) the researchers' signs, on the wall nearest the bus route
    for bi, (poly, height, ovr, pidx, ents) in enumerate(sign_bld):
        for text, bg, fg in (ovr or {}).get('sg', []):
            near = route_union.interpolate(route_union.project(poly.centroid))
            place_sign(bi, near, clean_text(text), bg, fg, 2)
    # 2) businesses from Overture places, at their own position
    pl = pq.read_table(f'{DATADIR}/places.parquet', columns=['geometry', 'names', 'brand', 'confidence', 'operating_status',
                                                              'basic_category']).to_pylist()
    pl.sort(key=lambda p: -(p['confidence'] or 0))
    for p in pl:
        if p['operating_status'] not in (None, 'open') or (p['confidence'] or 0) < 0.55:
            continue
        brand = bool(p.get('brand'))
        if p['basic_category'] not in SIGN_CATS and not brand:
            continue
        pt = proj(wkb.loads(p['geometry']))
        if pt.distance(route_union) > 75:
            continue
        cand = tree.query(pt, predicate='dwithin', distance=9)
        if len(cand) == 0:
            continue
        bi = min(cand, key=lambda i: sign_bld[i][0].distance(pt))
        text = sign_text(p)
        if len(text) < 2:
            continue
        bg, fg = sign_style(text, p['basic_category'])
        place_sign(int(bi), pt, text, bg, fg, 1 if brand else 0)
print('shop signs', len(signs), file=sys.stderr)

pack = dict(
    v=1, origin=dict(lat=ORIGIN_LAT, lon=ORIGIN_LON),
    attribution='© OpenStreetMap contributors (ODbL) via Overture Maps Foundation release 2026-10-21.0; '
                'elevation: Mapzen/AWS Terrain Tiles (SRTM, EU-DEM, public domain/open).',
    names=names, roadClasses=ROAD_CLASSES, surfaces=SURF + ['yellow_brick'], buildingClasses=BCLASS,
    areaTypes=AREA_T, roofs=ROOF,
    roads=roads, rails=rails, buildings=buildings, blocks=blocks, areas=areas, trees=trees, treeRows=tree_rows,
    waterLines=water_lines, signs=signs, props={k: v for k, v in props.items()}, lines={k: v for k, v in lines_infra.items()},
    dem=dict(near=enc_grid(dem['near'], dem['near_meta'], 500.0, 10.0),
             far=enc_grid(dem['far'], dem['far_meta'], 400.0, 1.0)),
)
raw = json.dumps(pack, ensure_ascii=False, separators=(',', ':')).encode()
gz = gzip.compress(raw, 9, mtime=0)  # deterministic output
os.makedirs(OUTDIR, exist_ok=True)
open(f'{OUTDIR}/world.pack.b64', 'w').write(base64.b64encode(gz).decode())
print('world pack: raw', len(raw), 'gz', len(gz), 'b64', len(base64.b64encode(gz)), file=sys.stderr)
