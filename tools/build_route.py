"""Build Route 280 path geometry for both directions.

Inputs: Overture segments (seg.parquet) and infrastructure (infra.parquet)
extracted with overture_extract.py. Stops are matched by their official
Sofia Urban Mobility Center stop codes (OSM `ref` tag). The bus path between
consecutive stops is computed with an edge-based Dijkstra over the drivable
road graph, respecting one-way restrictions and banning U-turns. Each
direction is routed independently (they use different stop poles and, in
places, different streets).

usage: python3 tools/build_route.py <datadir> <out.json>
"""
import sys, json, math, heapq, collections
import pyarrow.parquet as pq
import shapely.wkb as wkb
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from geo import to_xz, ORIGIN_LAT, ORIGIN_LON
from roadspec import road_width

DATADIR, OUT = sys.argv[1], sys.argv[2]

# Official stop sequences (sofiatraffic.bg codes) from the project directive.
DIR_A = [
    ('1697', 'СУ „Св. Климент Охридски“', 'Софийски университет „Свети Климент Охридски“'),
    ('0441', 'Военна академия', 'Военна академия'),
    ('1287', 'пл. Орлов мост', 'Площад Орлов мост'),
    ('2326', 'Хотел Плиска', 'Хотел Плиска'),
    ('1696', 'ж.к. Изток', 'Жилищен комплекс Изток'),
    ('0494', 'Републикански невродиспансер', 'Републикански невродиспансер'),
    ('2352', 'Техническа библиотека', 'Техническа библиотека'),
    ('0764', 'НСБАЛ по онкология', 'Онкологична болница'),
    ('1740', 'Технически университет', 'Технически университет'),
    ('0617', 'Лесотехнически университет', 'Лесотехнически университет'),
    ('0800', 'ж.к. Дървеница', 'Жилищен комплекс Дървеница'),
    ('1691', 'УНСС', 'Университет за национално и световно стопанство'),
    ('0524', 'Детски дом', 'Детски дом'),
    ('1610', 'Спортна зала „Христо Ботев“', 'Спортна зала Христо Ботев'),
    ('0533', 'Детски ясли', 'Детски ясли'),
    ('0741', 'Зимен дворец на спорта', 'Зимен дворец на спорта'),
    ('1606', 'СК на НСА', 'Спортен комплекс на Националната спортна академия'),
    ('1694', 'Студентски град', 'Студентски град'),
]
DIR_B = [
    ('1693', 'Студентски град', 'Студентски град'),
    ('1609', 'СК на НСА', 'Спортен комплекс на Националната спортна академия'),
    ('0742', 'Зимен дворец на спорта', 'Зимен дворец на спорта'),
    ('0534', 'Детски ясли', 'Детски ясли'),
    ('1611', 'Спортна зала „Христо Ботев“', 'Спортна зала Христо Ботев'),
    ('0530', 'Детски дом', 'Детски дом'),
    ('1692', 'УНСС', 'Университет за национално и световно стопанство'),
    ('0801', 'ж.к. Дървеница', 'Жилищен комплекс Дървеница'),
    ('0614', 'Лесотехнически университет', 'Лесотехнически университет'),
    ('1743', 'Технически университет', 'Технически университет'),
    ('0761', 'НСБАЛ по онкология', 'Онкологична болница'),
    ('2351', 'Техническа библиотека', 'Техническа библиотека'),
    ('0492', 'Републикански невродиспансер', 'Републикански невродиспансер'),
    ('1258', 'Площад на авиацията', 'Площад на авиацията'),
    ('1695', 'ж.к. Изток', 'Жилищен комплекс Изток'),
    ('2327', 'Хотел Плиска', 'Хотел Плиска'),
    ('1288', 'пл. Орлов мост', 'Площад Орлов мост'),
    ('1697', 'СУ „Св. Климент Охридски“', 'Софийски университет „Свети Климент Охридски“'),
]

# Stops whose pole sits inside a bus turning loop: pin them to the loop way
# (OSM way id) so the bus enters the terminal loop instead of a side stub.
STOP_WAY_HINT = {'1694': 'w1193785354', '1693': 'w1193785354'}

DRIVABLE = {'trunk': 1.0, 'primary': 1.0, 'secondary': 1.05, 'tertiary': 1.15,
            'unclassified': 1.4, 'residential': 1.7, 'living_street': 3.0,
            'service': 3.5, 'unknown': 2.5}


def load_segments():
    rows = pq.read_table(f'{DATADIR}/seg.parquet').to_pylist()
    segs = []
    for r in rows:
        if r['subtype'] != 'road' or r['class'] not in DRIVABLE:
            continue
        flags = set()
        for f in r['road_flags'] or []:
            if f['between'] is None:
                flags.update(f['values'])
        if flags & {'is_under_construction', 'is_abandoned', 'is_indoor'}:
            continue
        if r['subclass'] in ('driveway', 'parking_aisle'):
            continue
        oneway = False
        motor_denied = False
        for a in r['access_restrictions'] or []:
            w = a['when'] or {}
            if a['between'] is not None:
                continue
            if a['access_type'] == 'denied' and w.get('heading') == 'backward' and not w.get('mode'):
                oneway = True
            if a['access_type'] == 'denied' and w.get('heading') is None and (
                    not w.get('mode') or 'motor_vehicle' in (w.get('mode') or [])):
                # A blanket access=no on a main road is almost always a
                # temporary closure (construction); normal service ignores it.
                if r['class'] not in ('trunk', 'primary', 'secondary', 'tertiary'):
                    motor_denied = True
        bus_ok = any(a['access_type'] in ('allowed', 'designated') and 'bus' in ((a['when'] or {}).get('mode') or [])
                     for a in r['access_restrictions'] or [])
        if motor_denied and not bus_ok:
            continue
        g = wkb.loads(r['geometry'])
        pts = [to_xz(x, y) for x, y in g.coords]
        name = r['names']['primary'] if r['names'] else None
        segs.append(dict(id=r['id'], cls=r['class'], name=name, pts=pts, oneway=oneway,
                         width=road_width(r['class'], oneway, r['width_rules'], r['subclass']),
                         connectors=r['connectors'] or [], flags=sorted(flags),
                         osm=r['sources'][0]['record_id'] if r['sources'] else None))
    return segs


def cum(pts):
    out = [0.0]
    for i in range(1, len(pts)):
        out.append(out[-1] + math.dist(pts[i - 1], pts[i]))
    return out


def sub_polyline(pts, c, s0, s1):
    """Polyline between arc lengths s0<s1."""
    res = [interp(pts, c, s0)]
    for i in range(len(pts)):
        if s0 < c[i] < s1:
            res.append(pts[i])
    res.append(interp(pts, c, s1))
    return res


def interp(pts, c, s):
    if s <= 0:
        return pts[0]
    for i in range(1, len(pts)):
        if c[i] >= s:
            t = (s - c[i - 1]) / max(1e-9, c[i] - c[i - 1])
            return (pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t)
    return pts[-1]


def build_graph(segs):
    """Split segments at connectors into edges. Each edge has two possible directed versions."""
    edges = []  # dict(u, v, pts, len, seg)
    for s in segs:
        c = cum(s['pts'])
        L = c[-1]
        conns = sorted(s['connectors'], key=lambda k: k['at'])
        if not conns or conns[0]['at'] > 1e-6:
            conns = [{'connector_id': s['id'] + ':start', 'at': 0.0}] + conns
        if conns[-1]['at'] < 1 - 1e-6:
            conns = conns + [{'connector_id': s['id'] + ':end', 'at': 1.0}]
        for a, b in zip(conns, conns[1:]):
            s0, s1 = a['at'] * L, b['at'] * L
            if s1 - s0 < 0.01:
                continue
            pts = sub_polyline(s['pts'], c, s0, s1)
            edges.append(dict(u=a['connector_id'], v=b['connector_id'], pts=pts, len=s1 - s0, seg=s))
    out_adj = collections.defaultdict(list)  # node -> list of (edge_idx, forward)
    for i, e in enumerate(edges):
        out_adj[e['u']].append((i, True))
        if not e['seg']['oneway']:
            out_adj[e['v']].append((i, False))
    return edges, out_adj


def dpts(e, fwd):
    return e['pts'] if fwd else e['pts'][::-1]


def heading(p, q):
    return math.atan2(q[0] - p[0], -(q[1] - p[1]))  # 0 = north, clockwise


def angdiff(a, b):
    d = (b - a + math.pi) % (2 * math.pi) - math.pi
    return d


def project_on_polyline(pts, p):
    best = (1e18, 0, 0.0, None)
    acc = 0.0
    for i in range(1, len(pts)):
        a, b = pts[i - 1], pts[i]
        dx, dz = b[0] - a[0], b[1] - a[1]
        L2 = dx * dx + dz * dz
        t = 0 if L2 == 0 else max(0, min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2))
        q = (a[0] + dx * t, a[1] + dz * t)
        d = math.dist(p, q)
        if d < best[0]:
            # side: cross product of direction and (p - q); >0 means p is to the right when x=east,z=south
            cross = dx * (p[1] - a[1]) - dz * (p[0] - a[0])
            best = (d, i, acc + math.sqrt(L2) * t, cross)
        acc += math.sqrt(L2)
    return best


def snap_stop(edges, p, way_hint=None):
    """Candidate directed edges where the stop is on the right-hand side."""
    cands = []
    for i, e in enumerate(edges):
        xs = [q[0] for q in e['pts']]; zs = [q[1] for q in e['pts']]
        if p[0] < min(xs) - 40 or p[0] > max(xs) + 40 or p[1] < min(zs) - 40 or p[1] > max(zs) + 40:
            continue
        d, idx, s, cross = project_on_polyline(e['pts'], p)
        if d > 40:
            continue
        for fwd in (True, False):
            if not fwd and e['seg']['oneway']:
                continue
            # In x=east,z=south coords, a positive cross product of the travel
            # direction and the offset means the point lies to the RIGHT.
            c = cross if fwd else -cross
            right = c > 0
            sd = s if fwd else e['len'] - s
            # Poles mapped almost on the centreline (terminal loops) carry no side information.
            penalty = d + (0 if right or d < 7 else 60) + (DRIVABLE[e['seg']['cls']] - 1) * 8
            if way_hint and (e['seg']['osm'] or '').split('@')[0] == way_hint:
                penalty -= 100
            cands.append((penalty, i, fwd, sd, d, right))
    cands.sort()
    return cands[:6]


def route(edges, adj, start, goal):
    """Edge-based Dijkstra. start/goal = (edge_idx, fwd, s_along)."""
    si, sf, ss = start
    gi, gf, gs = goal
    if si == gi and sf == gf and gs >= ss - 0.5:
        return [(si, sf, ss, gs)], gs - ss
    first_len = edges[si]['len'] - ss
    pq_ = [(first_len, si, sf)]
    dist = {(si, sf): first_len}
    prev = {}
    while pq_:
        d, ei, ef = heapq.heappop(pq_)
        if dist.get((ei, ef), 1e18) < d - 1e-9:
            continue
        if (ei, ef) == (gi, gf) and (ei, ef) != (si, sf):
            break
        e = edges[ei]
        node = e['v'] if ef else e['u']
        p_in = dpts(e, ef)
        h_in = heading(p_in[-2], p_in[-1])
        for nj, nf in adj.get(node, []):
            if nj == ei and nf != ef:
                continue  # no U-turn on the same edge
            ne = edges[nj]
            p_out = dpts(ne, nf)
            h_out = heading(p_out[0], p_out[1])
            turn = abs(angdiff(h_in, h_out))
            if turn > math.radians(150):
                continue
            tp = 0 if turn < math.radians(30) else (15 if turn < math.radians(100) else 45)
            w = DRIVABLE[ne['seg']['cls']]
            add = (gs if (nj, nf) == (gi, gf) else ne['len']) * w + tp
            nd = d + add
            if nd < dist.get((nj, nf), 1e18):
                dist[(nj, nf)] = nd
                prev[(nj, nf)] = (ei, ef)
                heapq.heappush(pq_, (nd, nj, nf))
    if (gi, gf) not in prev:
        return None, 1e18
    chain = [(gi, gf)]
    while chain[-1] != (si, sf):
        chain.append(prev[chain[-1]])
    chain.reverse()
    res = []
    for k, (ei, ef) in enumerate(chain):
        L = edges[ei]['len']
        a = ss if k == 0 else 0.0
        b = gs if k == len(chain) - 1 else L
        res.append((ei, ef, a, b))
    return res, dist[(gi, gf)]


def build_direction(edges, adj, stops_def, stop_idx, label):
    snapped = []
    for code, disp, speech in stops_def:
        r, tags = stop_idx[code]
        g = wkb.loads(r['geometry']).centroid
        p = to_xz(g.x, g.y)
        snapped.append(dict(code=code, name=disp, speech=speech, osm_name=r['names']['primary'], lat=g.y, lon=g.x,
                            pole=p, tags=tags, osm=r['sources'][0]['record_id'], cands=snap_stop(edges, p, STOP_WAY_HINT.get(code))))
    # choose candidate combination greedily with routing feasibility
    chosen = [None] * len(snapped)
    legs = []
    chosen[0] = snapped[0]['cands'][0]
    for i in range(1, len(snapped)):
        best = None
        for c in snapped[i]['cands']:
            st = (chosen[i - 1][1], chosen[i - 1][2], chosen[i - 1][3])
            gl = (c[1], c[2], c[3])
            path, cost = route(edges, adj, st, gl)
            if path is None:
                continue
            score = cost + c[0] * 4
            if best is None or score < best[0]:
                best = (score, c, path)
        if best is None:
            raise SystemExit(f'{label}: no route to stop {snapped[i]["code"]}')
        chosen[i] = best[1]
        legs.append(best[2])
    # assemble polyline
    poly = []
    lane = []  # per vertex: [half carriageway width dm, oneway]
    names = []
    stop_s = [0.0]
    total = 0.0
    for leg in legs:
        for (ei, ef, a, b) in leg:
            e = edges[ei]
            pts = dpts(e, ef)
            c = cum(pts)
            sp = sub_polyline(pts, c, a, b)
            for q in sp:
                if not poly or math.dist(poly[-1], q) > 0.05:
                    if poly:
                        total += math.dist(poly[-1], q)
                    poly.append(q)
                    lane.append([int(round(e['seg']['width'] * 5)), 1 if e['seg']['oneway'] else 0])
            names.append((len(poly) - 1, e['seg']['name'], e['seg']['cls'], e['seg']['osm']))
        stop_s.append(total)
    out_stops = []
    for i, s in enumerate(snapped):
        c = chosen[i]
        e = edges[c[1]]
        out_stops.append(dict(
            id=f'{label}-{i:02d}-{s["code"]}', code=s['code'], name=s['name'], speech=s['speech'],
            osmName=s['osm_name'], lat=round(s['lat'], 7), lon=round(s['lon'], 7),
            pole=[round(s['pole'][0], 2), round(s['pole'][1], 2)],
            s=round(stop_s[i], 2), road=e['seg']['name'], roadClass=e['seg']['cls'],
            poleOffset=round(c[4], 2), rightSide=c[5],
            shelter=s['tags'].get('shelter') == 'yes', bench=s['tags'].get('bench') == 'yes',
            bin=s['tags'].get('bin') == 'yes', lit=s['tags'].get('lit') == 'yes',
            departuresBoard=s['tags'].get('departures_board'), wheelchair=s['tags'].get('wheelchair'),
            source=dict(dataset='OpenStreetMap via Overture Maps 2026-10-21.0', osm=s['osm'], license='ODbL-1.0'),
        ))
    # street list (compressed)
    streets = []
    for idx, nm, cls, osm in names:
        if not streets or streets[-1]['name'] != nm:
            streets.append(dict(fromVertex=idx, name=nm, cls=cls))
    return dict(_start=(chosen[0][1], chosen[0][2], chosen[0][3]), _end=(chosen[-1][1], chosen[-1][2], chosen[-1][3]),
                stops=out_stops, path=[[round(x, 2), round(z, 2)] for x, z in poly], lane=lane, length=round(total, 1),
                streets=streets)


def main():
    infra = pq.read_table(f'{DATADIR}/infra.parquet').to_pylist()
    stop_idx = {}
    for r in infra:
        if r['class'] != 'bus_stop':
            continue
        tags = dict(r['source_tags'] or [])
        if 'ref' in tags:
            stop_idx.setdefault(tags['ref'], (r, tags))
    segs = load_segments()
    edges, adj = build_graph(segs)
    print(f'{len(segs)} segments, {len(edges)} edges', file=sys.stderr)
    A = build_direction(edges, adj, DIR_A, stop_idx, 'A')
    B = build_direction(edges, adj, DIR_B, stop_idx, 'B')
    links = {}
    for key, frm, to in (('AtoB', A, B), ('BtoA', B, A)):
        st = frm['_end']; gl = to['_start']
        path, cost = route(edges, adj, st, gl)
        pts = []
        for (ei, ef, a, b) in path or []:
            pp = dpts(edges[ei], ef); c = cum(pp)
            for q in sub_polyline(pp, c, a, b):
                if not pts or math.dist(pts[-1], q) > 0.05:
                    pts.append(q)
        links[key] = [[round(x, 2), round(z, 2)] for x, z in pts]
        print(key, 'terminal link', len(pts), 'pts', file=sys.stderr)
    for d in (A, B):
        d.pop('_end'); d.pop('_start')
    out = dict(
        line='280', terminalLinks=links, mode='bus', operator='Столичен електротранспорт / Столичен автотранспорт (Sofia)',
        origin=dict(lat=ORIGIN_LAT, lon=ORIGIN_LON),
        directions=dict(
            A=dict(id='A', from_='СУ „Св. Климент Охридски“', headsign='Студентски град', **A),
            B=dict(id='B', from_='Студентски град', headsign='СУ Св. Климент Охридски', **B)),
    )
    json.dump(out, open(OUT, 'w'), ensure_ascii=False)
    for k in ('A', 'B'):
        d = out['directions'][k]
        print(k, d['length'], 'm', [s['s'] for s in d['stops']], file=sys.stderr)
        for st in d['streets']:
            print('   ', st['name'], st['cls'], file=sys.stderr)


main()
