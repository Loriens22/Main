"""Line 84, direction A: end the trip at the Terminal 2 departures curb.

The router (tools/build_route.py) snapped the terminus stop 2454 ("Летище София Терминал 2 - Заминаващи", OSM
n676275899) to the primary road through the forecourt, 18.75 m from its pole: the bus stopped on the main road and
the passengers crossed the forecourt road. The buses stop at the departures curb in front of the terminal: the
one-way service road (world84 pack road #8816) that leaves the primary road at (5229.0, -2093.5), runs north along
the car park and turns west along the terminal, 2.5 m from the stop pole. This tool replaces the end of the path
from that junction with the service road, up to 12 m past the pole, and moves the stop onto it. The terminal link
to direction B (which looped back round onto the same curb road) becomes the rest of the curb road.

usage: python3 tools/route84_t2_curb.py src/data/route84.json src/data/world84.pack.b64
Apply after tools/build_route.py (it is idempotent: a path already ending on the curb road is left alone).
"""
import base64
import gzip
import json
import math
import sys

import numpy as np

JUNCTION = (5229.0, -2093.5)
ROAD = 8816
PAST = 12.0


def main(route_path, pack_path):
    r = json.load(open(route_path, encoding='utf-8'))
    d = r['directions']['A']
    stop = d['stops'][-1]
    assert stop['code'] == '2454', stop['code']
    p = json.loads(gzip.decompress(base64.b64decode(open(pack_path).read())))
    road = np.cumsum(np.asarray(p['roads'][ROAD]['p'], dtype=np.int64).reshape(-1, 2), axis=0) / 10.0
    assert np.allclose(road[0], JUNCTION, atol=0.2), road[0]
    path = d['path']
    i0 = min(range(len(path)), key=lambda i: math.dist(path[i], JUNCTION))
    if math.dist(path[i0], JUNCTION) > 0.5:
        raise SystemExit('junction not on the path')
    if math.dist(path[-1], stop['pole']) < 15:
        print('path already ends at the curb', file=sys.stderr)
        return
    # the road from the junction to its projection of the pole, then PAST metres beyond
    pole = np.array(stop['pole'])
    best = None
    acc = 0.0
    for k in range(len(road) - 1):
        a, b = road[k], road[k + 1]
        L = float(np.linalg.norm(b - a))
        t = float(np.clip(np.dot(pole - a, b - a) / (L * L), 0, 1))
        q = a + (b - a) * t
        dq = float(np.linalg.norm(pole - q))
        if best is None or dq < best[0]:
            best = (dq, k, t, acc + L * t)
        acc += L
    dpole, kp, tp, s_pole = best
    pts, acc = [road[0]], 0.0
    for k in range(len(road) - 1):
        a, b = road[k], road[k + 1]
        L = float(np.linalg.norm(b - a))
        if acc + L >= s_pole + PAST:
            pts.append(a + (b - a) * ((s_pole + PAST - acc) / L))
            break
        pts.append(b)
        acc += L
    head = path[:i0 + 1]
    s0 = sum(math.dist(head[i], head[i + 1]) for i in range(len(head) - 1))
    tail = [[round(float(x), 2), round(float(z), 2)] for x, z in pts[1:]]
    d['path'] = head + tail
    w = p['roads'][ROAD]['w'] / 10
    d['lane'] = d['lane'][:i0 + 1] + [[int(round(w * 5)), 1]] * len(tail)
    d['length'] = round(s0 + sum(math.dist(a, b) for a, b in zip([head[-1]] + tail[:-1], tail)), 1)
    stop['s'] = round(s0 + s_pole, 2)
    stop['road'] = None
    stop['roadClass'] = 'service'
    stop['poleOffset'] = round(dpole, 2)
    d['streets'] = [st for st in d['streets'] if st['fromVertex'] <= i0] + [{'fromVertex': i0, 'name': None, 'cls': 'service'}]
    # terminal link A -> B: from the new end along the rest of the curb road to the start of direction B
    end = np.array(tail[-1])
    link = r['terminalLinks']['AtoB']
    best = None
    for k in range(len(link) - 1):
        a, b = np.array(link[k]), np.array(link[k + 1])
        L = float(np.linalg.norm(b - a)) or 1e-9
        t = float(np.clip(np.dot(end - a, b - a) / (L * L), 0, 1))
        dd = float(np.linalg.norm(end - (a + (b - a) * t)))
        if (best is None or dd < best[0]) and t < 1:
            best = (dd, k)
    r['terminalLinks']['AtoB'] = [tail[-1]] + link[best[1] + 1:]
    json.dump(r, open(route_path, 'w', encoding='utf-8'), ensure_ascii=False)
    print(f"direction A now {d['length']} m; stop 2454 at s {stop['s']}, {dpole:.2f} m from its pole", file=sys.stderr)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
