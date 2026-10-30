"""Builds a tram line's route data (src/data/route<line>.json) on the real tram tracks.

Tracks: OpenStreetMap railway=tram ways via Overture Maps (transportation/segment, subtype rail, class
tram), split at their connectors into a track graph. Stops: the OSM tram stop positions
(railway=tram_stop, matched by the Sofia Urban Mobility Center stop code in `ref`), which lie on the
track of their direction.

A tram cannot turn on the spot: between two consecutive stops the path is the shortest one on the
track graph whose heading never changes by more than MAX_TURN at a node (a switch is passed straight
or along its diverging curve, never back through the other branch), and the tram leaves every stop in
the direction it arrived. The terminal links run from the last stop of one direction to the first stop
of the other through the turning loops.

Besides the two directions the output carries the whole tram network round the route (`tracks`: every
track polyline within TRACK_BUFFER m of the line, with switch nodes) for the track and overhead-line
geometry of the world.

usage: python3 tools/build_tram_route.py <datadir with seg.parquet, infra.parquet, roads> <out.json> <line>
"""
import sys, os, json, math, heapq, collections
import pyarrow.parquet as pq
import shapely.wkb as wkb
from shapely.geometry import LineString, Point
from shapely.strtree import STRtree
sys.path.insert(0, os.path.dirname(__file__))
from geo import to_xz, ORIGIN_LAT, ORIGIN_LON
from lines import LINES
from roadspec import road_width

DATADIR, OUT = sys.argv[1], sys.argv[2]
LINE = sys.argv[3] if len(sys.argv) > 3 else '12'
CFG = LINES[LINE]
MAX_TURN = math.radians(40)
TRACK_BUFFER = 700.0


# ------------------------------------------------------------------ track graph
def under_construction(r):
    return any('is_under_construction' in (f['values'] or []) for f in (r['rail_flags'] or []))


def load_tracks():
    seg = pq.read_table(os.path.join(DATADIR, 'seg.parquet')).to_pylist()
    edges = []  # dict(a, b, pts, osm)
    roads = []
    # tram tracks, plus rails under construction that join the tram network (railway=construction: in
    # October-November 2026 the junction at Централна гара is being rebuilt; the regular route uses it)
    tram = [r for r in seg if r['subtype'] == 'rail' and r['class'] == 'tram']
    cons_ids = {c['connector_id'] for r in tram for c in (r['connectors'] or [])}
    pending = [r for r in seg if r['subtype'] == 'rail' and r['class'] == 'unknown' and under_construction(r)]
    grew = True
    while grew:
        grew = False
        for r in list(pending):
            ids = {c['connector_id'] for c in (r['connectors'] or [])}
            if ids & cons_ids:
                tram.append(r)
                cons_ids |= ids
                pending.remove(r)
                grew = True
    keep = {id(r) for r in tram}
    for r in seg:
        if r['subtype'] == 'road':
            roads.append(r)
            continue
        if id(r) not in keep:
            continue
        g = wkb.loads(r['geometry'])
        if g.geom_type != 'LineString':
            continue
        ll = list(g.coords)
        pts = [to_xz(x, y) for x, y in ll]
        L = LineString(pts)
        cons = sorted((c['at'], c['connector_id']) for c in (r['connectors'] or []))
        if not cons:
            continue
        osm = (r['sources'] or [{}])[0].get('record_id', '')
        if r['class'] != 'tram':
            osm += ' (under construction)'
        for (a0, ca), (a1, cb) in zip(cons, cons[1:]):
            if a1 - a0 < 1e-9:
                continue
            piece = sub(L, a0 * L.length, a1 * L.length)
            if len(piece) < 2:
                continue
            edges.append(dict(a=ca, b=cb, pts=piece, osm=osm))
    return edges, roads


def sub(L, s0, s1):
    """Polyline of L between arc lengths s0 < s1."""
    out = [L.interpolate(s0).coords[0]]
    acc = 0.0
    cs = list(L.coords)
    for i in range(1, len(cs)):
        seg = math.dist(cs[i - 1], cs[i])
        acc += seg
        if s0 < acc < s1:
            out.append(cs[i])
    out.append(L.interpolate(s1).coords[0])
    clean = [out[0]]
    for p in out[1:]:
        if math.dist(p, clean[-1]) > 0.02:
            clean.append(p)
    return clean


def heading(p, q):
    return math.atan2(q[1] - p[1], q[0] - p[0])


def angdiff(a, b):
    d = (b - a) % (2 * math.pi)
    return d - 2 * math.pi if d > math.pi else d


def cum(pts):
    c = [0.0]
    for i in range(1, len(pts)):
        c.append(c[-1] + math.dist(pts[i - 1], pts[i]))
    return c


def oriented(e, fwd):
    return e['pts'] if fwd else e['pts'][::-1]


def h_out(e, fwd):
    p = oriented(e, fwd)
    j = 1
    while j < len(p) - 1 and math.dist(p[0], p[j]) < 1.5:
        j += 1
    return heading(p[0], p[j])


def h_in(e, fwd):
    p = oriented(e, fwd)
    j = len(p) - 2
    while j > 0 and math.dist(p[-1], p[j]) < 1.5:
        j -= 1
    return heading(p[j], p[-1])


def build_graph(edges):
    adj = collections.defaultdict(list)  # node -> [(edge index, fwd)] leaving the node
    for i, e in enumerate(edges):
        e['len'] = cum(e['pts'])[-1]
        adj[e['a']].append((i, True))
        adj[e['b']].append((i, False))
    return adj


def project(pts, p):
    best = (1e18, 0.0)
    acc = 0.0
    for i in range(1, len(pts)):
        a, b = pts[i - 1], pts[i]
        dx, dz = b[0] - a[0], b[1] - a[1]
        L2 = dx * dx + dz * dz
        t = 0.0 if L2 < 1e-12 else max(0.0, min(1.0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2))
        q = (a[0] + dx * t, a[1] + dz * t)
        d = math.dist(p, q)
        if d < best[0]:
            best = (d, acc + math.sqrt(L2) * t)
        acc += math.sqrt(L2)
    return best


def snap(edges, tree, geoms, p):
    best = None
    for gi in tree.query(Point(p).buffer(25)):
        e = edges[int(gi)]
        d, s = project(e['pts'], p)
        if best is None or d < best[0]:
            best = (d, int(gi), s)
    return best


# ------------------------------------------------------------------ routing with switch constraints
def route_between(edges, adj, start, goal, fwd0=None):
    """start/goal = (edge, s along the edge in its stored direction). Returns (cost, [(edge, fwd, s_from, s_to)], fwd at goal)."""
    e0, s0 = start
    eg, sg = goal
    pq_ = []
    best = {}
    for fwd in ([fwd0] if fwd0 is not None else [True, False]):
        L = edges[e0]['len']
        # same edge, goal ahead
        if e0 == eg and ((fwd and sg >= s0) or (not fwd and sg <= s0)):
            return abs(sg - s0), [(e0, fwd, s0, sg)], fwd
        rest = (L - s0) if fwd else s0
        heapq.heappush(pq_, (rest, e0, fwd, [(e0, fwd, s0, L if fwd else 0.0)]))
    while pq_:
        c, ei, fwd, trail = heapq.heappop(pq_)
        if best.get((ei, fwd), 1e18) <= c - 1e-9:
            continue
        best[(ei, fwd)] = c
        e = edges[ei]
        node = e['b'] if fwd else e['a']
        hin = h_in(e, fwd)
        for (nj, nf) in adj[node]:
            if nj == ei and nf != fwd:
                continue
            ne = edges[nj]
            if abs(angdiff(hin, h_out(ne, nf))) > MAX_TURN:
                continue
            if nj == eg:
                ds = sg if nf else ne['len'] - sg
                return c + ds, trail + [(nj, nf, 0.0 if nf else ne['len'], sg)], nf
            nc = c + ne['len']
            if nc < best.get((nj, nf), 1e18) and nc < 30000:
                heapq.heappush(pq_, (nc, nj, nf, trail + [(nj, nf, 0.0 if nf else ne['len'], ne['len'] if nf else 0.0)]))
    return None


def trail_points(edges, trail):
    pts = []
    for (ei, fwd, sa, sb) in trail:
        e = edges[ei]
        L = LineString(e['pts'])
        lo, hi = min(sa, sb), max(sa, sb)
        if hi - lo < 1e-6:
            continue
        piece = sub(L, lo, hi)
        if sa > sb:
            piece = piece[::-1]
        for q in piece:
            if not pts or math.dist(pts[-1], q) > 0.05:
                pts.append(q)
    return pts


# ------------------------------------------------------------------ main
def main():
    edges, roads = load_tracks()
    adj = build_graph(edges)
    geoms = [LineString(e['pts']) for e in edges]
    tree = STRtree(geoms)
    print(f'{len(edges)} track edges', file=sys.stderr)
    infra = pq.read_table(os.path.join(DATADIR, 'infra.parquet')).to_pylist()
    pos, plat = {}, {}
    for r in infra:
        tags = dict(r['source_tags'] or [])
        ref = tags.get('ref')
        if not ref:
            continue
        g = wkb.loads(r['geometry']).centroid
        rec = dict(xz=to_xz(g.x, g.y), lat=g.y, lon=g.x, tags=tags,
                   osm=(r['sources'] or [{}])[0].get('record_id', ''), name=(r['names'] or {}).get('primary') if isinstance(r['names'], dict) else None)
        if tags.get('railway') == 'tram_stop' or (r['class'] == 'stop_position' and tags.get('tram') == 'yes'):
            pos.setdefault(ref, rec)
        elif r['class'] in ('platform', 'bus_stop') and tags.get('tram') == 'yes':
            plat.setdefault(ref, rec)

    # road names along the track (nearest named road within 25 m)
    rgeo, rmeta = [], []
    for r in roads:
        g = wkb.loads(r['geometry'])
        if g.geom_type != 'LineString':
            continue
        nm = (r['names'] or {}).get('primary') if isinstance(r['names'], dict) else None
        try:
            w = road_width(r['class'], False, r['width_rules'], r['subclass'])
        except KeyError:
            continue  # paths, bridleways: no carriageway
        rgeo.append(LineString([to_xz(x, y) for x, y in g.coords]))
        rmeta.append(dict(name=nm, cls=r['class'], width=w))
    rtree = STRtree(rgeo)

    def road_at(p):
        best = None
        for gi in rtree.query(Point(p).buffer(25)):
            d = rgeo[int(gi)].distance(Point(p))
            if best is None or d < best[0]:
                best = (d, int(gi))
        return (best[0], rmeta[best[1]]) if best else (1e9, None)

    def build_direction(stops_def, label):
        snapped = []
        for st in stops_def:
            code = st[0]
            if code not in pos:
                raise SystemExit(f'{label}: stop {code} has no tram stop position')
            sn = snap(edges, tree, geoms, pos[code]['xz'])
            if sn is None or sn[0] > 15:
                raise SystemExit(f'{label}: stop {code} is {sn and round(sn[0], 1)} m from the tracks')
            snapped.append((sn[1], sn[2], sn[0]))
        best_total = None
        for fwd0 in (True, False):
            fwd = fwd0
            trails = []
            total = 0.0
            ok = True
            for k in range(len(snapped) - 1):
                r = route_between(edges, adj, snapped[k][:2], snapped[k + 1][:2], fwd)
                if r is None:
                    ok = False
                    break
                c, trail, fwd = r
                total += c
                trails.append(trail)
            if ok and (best_total is None or total < best_total[0]):
                best_total = (total, trails, fwd0, fwd)
        if best_total is None:
            raise SystemExit(f'{label}: no path along the tracks')
        total, trails, fwd_first, fwd_last = best_total
        pts = []
        stop_s = [0.0]
        for trail in trails:
            seg = trail_points(edges, trail)
            for q in seg:
                if not pts or math.dist(pts[-1], q) > 0.05:
                    pts.append(q)
            stop_s.append(cum(pts)[-1])
        c = cum(pts)
        out_stops = []
        for i, (st, (ei, s, d)) in enumerate(zip(stops_def, snapped)):
            code, name, speech = st[:3]
            pr = pos[code]
            pl = plat.get(code)
            rd, rm = road_at(pr['xz'])
            # the platform side: right of travel when the platform lies to the right of the track
            side = None
            if pl:
                sv = min(stop_s[i], c[-1] - 0.1)
                j = max(1, next((k for k in range(len(c)) if c[k] >= sv), len(c) - 1))
                tx, tz = pts[j][0] - pts[j - 1][0], pts[j][1] - pts[j - 1][1]
                px, pz = pl['xz'][0] - pr['xz'][0], pl['xz'][1] - pr['xz'][1]
                side = 'right' if (tx * pz - tz * px) > 0 else 'left'
            out_stops.append(dict(
                id=f'{LINE}-{label}-{i:02d}-{code}', code=code, name=name, speech=speech, request=False,
                lat=pr['lat'], lon=pr['lon'], pole=[round(pr['xz'][0], 2), round(pr['xz'][1], 2)], s=round(stop_s[i], 1),
                platform=[round(pl['xz'][0], 2), round(pl['xz'][1], 2)] if pl else None, platformSide=side,
                road=rm['name'] if rm and rd < 20 else None, snapDist=round(d, 2),
                shelter=(pl or {}).get('tags', {}).get('shelter') == 'yes' if pl else None,
                source=dict(dataset='OpenStreetMap via Overture Maps 2026-10-21.0', osm=pr['osm'], license='ODbL-1.0'),
            ))
        # street names along the path
        streets = []
        for vi in range(0, len(pts), 4):
            rd, rm = road_at(pts[vi])
            nm = rm['name'] if rm and rd < 18 else None
            if not streets or streets[-1]['name'] != nm:
                streets.append(dict(fromVertex=vi, name=nm, cls=rm['cls'] if rm else None))
        # trams have no kerb lane: the drive line is the track itself (lane width code 18 -> offset 0)
        lane = [[18, 1] for _ in pts]
        print(f'{label}: {round(c[-1])} m, stops at {[round(x) for x in stop_s]}', file=sys.stderr)
        return dict(stops=out_stops, path=[[round(x, 2), round(z, 2)] for x, z in pts], lane=lane, length=round(c[-1], 1),
                    streets=streets, _first=(snapped[0][0], snapped[0][1], fwd_first), _last=(snapped[-1][0], snapped[-1][1], fwd_last), _pts=pts)

    A = build_direction(CFG['A'], 'A')
    B = build_direction(CFG['B'], 'B')
    links = {}
    for key, frm, to in (('AtoB', A, B), ('BtoA', B, A)):
        r = route_between(edges, adj, frm['_last'][:2], to['_first'][:2], frm['_last'][2])
        if r is None:
            raise SystemExit(f'{key}: no turning loop between the termini')
        c, trail, fwd = r
        if fwd != to['_first'][2]:
            print(f'warning: {key} arrives against the direction of the first stop', file=sys.stderr)
        pts = trail_points(edges, trail)
        links[key] = [[round(x, 2), round(z, 2)] for x, z in pts]
        print(f'{key}: terminal loop {round(c)} m', file=sys.stderr)

    # the tram network round the line: every track edge within TRACK_BUFFER m, with switch / crossing nodes
    line_geom = LineString(A['_pts']).union(LineString(B['_pts']))
    zone = line_geom.buffer(TRACK_BUFFER)
    used = set()
    for d in (A, B):
        pass
    tracks = []
    node_deg = collections.Counter()
    for e in edges:
        node_deg[e['a']] += 1
        node_deg[e['b']] += 1
    node_xy = {}
    for i, e in enumerate(edges):
        g = geoms[i]
        if not zone.intersects(g):
            continue
        node_xy[e['a']] = e['pts'][0]
        node_xy[e['b']] = e['pts'][-1]
        # street running: the track lies inside a road's carriageway
        mid = g.interpolate(0.5, normalized=True).coords[0]
        rd, rm = road_at(mid)
        embedded = bool(rm and rd < max(2.5, rm['width'] / 2 - 0.5))
        on_line = g.distance(line_geom) < 0.5 and g.length > 0
        tracks.append(dict(a=e['a'], b=e['b'], pts=[[round(x, 2), round(z, 2)] for x, z in e['pts']],
                           street=embedded, line=on_line, osm=e['osm']))
    switches = [[round(node_xy[n][0], 2), round(node_xy[n][1], 2), node_deg[n]] for n in node_xy if node_deg[n] >= 3]
    # compact node ids
    ids = {}
    for t in tracks:
        for k in ('a', 'b'):
            t[k] = ids.setdefault(t[k], len(ids))
    for d in (A, B):
        for k in ('_first', '_last', '_pts'):
            d.pop(k)
    out = dict(
        line=LINE, mode='tram', gauge=CFG.get('gauge', 1.009), terminalLinks=links, operator=CFG['operator'],
        origin=dict(lat=ORIGIN_LAT, lon=ORIGIN_LON),
        directions=dict(
            A=dict(id='A', from_=CFG['fromA'], headsign=CFG['headsignA'], **A),
            B=dict(id='B', from_=CFG['fromB'], headsign=CFG['headsignB'], **B)),
        tracks=tracks, switches=switches,
    )
    if CFG.get('notes'):
        out['notes'] = CFG['notes']
    if CFG.get('variants'):
        out['variants'] = CFG['variants']
    json.dump(out, open(OUT, 'w'), ensure_ascii=False)
    print(f'{len(tracks)} track edges round the line ({sum(t["street"] for t in tracks)} street running), {len(switches)} switches', file=sys.stderr)
    for k in ('A', 'B'):
        d = out['directions'][k]
        print(k, [st['name'] for st in d['streets'] if st['name']], file=sys.stderr)


main()
