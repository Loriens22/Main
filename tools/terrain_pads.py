"""Levels the terrain of a world pack under large graded sites (airport aprons and forecourts) that the 16 m
elevation grid renders as slopes.

The near DEM grid comes from a 1 arc-second model resampled to 16 m: across the Sofia Airport forecourt it slopes
about 10 m over 200 m, while the terminal, its curbside and the apron are built level (the ground floor and the
departure curb are one level in the photographs). Each pad is a polygon (game x, z) levelled to a height (game y)
with a smooth blend back to the original terrain over `blend` metres.

usage: python3 tools/terrain_pads.py <world.pack.b64> <pads.json>
pads.json: [{"name": ..., "poly": [[x, z], ...], "y": <game y>, "blend": <m>, "source": ...}]
       or ramps along a road: {"name": ..., "line": [[x, z], ...], "y0": <game y at the start>, "width": <m>,
       "blend": <m>} grade the road evenly from y0 to the terrain at the line's end (applied after the pads).
The pack is rewritten in place. Apply it once to a freshly built pack: the blends read the terrain they find.
"""
import base64
import gzip
import json
import sys

import numpy as np
from shapely.geometry import LineString, Point, Polygon

BASE_ELEVATION = 520.0  # src/world/Heightfield.js


def decode(g):
    flat = np.cumsum(np.asarray(g['d'], dtype=np.int64))
    return flat.reshape(g['nz'], g['nx'])


def encode(g, a):
    flat = a.astype(np.int64).ravel()
    g['d'] = np.diff(np.concatenate([[0], flat])).tolist()


def main(pack_path, pads_path):
    raw = open(pack_path).read()
    p = json.loads(gzip.decompress(base64.b64decode(raw)))
    pads = json.load(open(pads_path))
    g = p['dem']['near']
    a = decode(g)
    h = g['base'] + a / g['scale']  # metres above sea level
    x0, z0, dx = g['x0'], g['z0'], g['dx']

    def sample(x, z):
        fx = min(max((x - x0) / dx, 0), g['nx'] - 1.001); fz = min(max((z - z0) / dx, 0), g['nz'] - 1.001)
        i, j = int(fx), int(fz); u, v = fx - i, fz - j
        return (h[j, i] * (1 - u) * (1 - v) + h[j, i + 1] * u * (1 - v) + h[j + 1, i] * (1 - u) * v + h[j + 1, i + 1] * u * v)

    for pad in [q for q in pads if 'poly' in q] + [q for q in pads if 'line' in q]:
        if 'line' in pad:
            ln = LineString(pad['line'])
            y0 = pad['y0'] + BASE_ELEVATION
            y1 = sample(*pad['line'][-1])
            half, blend = pad['width'] / 2, float(pad.get('blend', 30))
            bx0, bz0, bx1, bz1 = ln.buffer(half + blend).bounds
            n = 0
            for j in range(max(0, int((bz0 - z0) // dx)), min(g['nz'] - 1, int((bz1 - z0) // dx) + 1) + 1):
                for i in range(max(0, int((bx0 - x0) // dx)), min(g['nx'] - 1, int((bx1 - x0) // dx) + 1) + 1):
                    q = Point(x0 + i * dx, z0 + j * dx)
                    d = ln.distance(q)
                    if d >= half + blend:
                        continue
                    f = ln.project(q) / ln.length
                    target = y0 + (y1 - y0) * f
                    t = 1.0 if d <= half else 1.0 - (d - half) / blend
                    w = t * t * (3 - 2 * t)
                    h[j, i] = h[j, i] * (1 - w) + target * w
                    n += 1
            print(f"{pad['name']}: {n} grid nodes graded from y {pad['y0']} to {y1 - BASE_ELEVATION:.1f} over {ln.length:.0f} m", file=sys.stderr)
            continue
        poly = Polygon(pad['poly'])
        target = pad['y'] + BASE_ELEVATION
        blend = float(pad.get('blend', 40))
        bx0, bz0, bx1, bz1 = poly.buffer(blend).bounds
        i0, i1 = max(0, int((bx0 - x0) // dx)), min(g['nx'] - 1, int((bx1 - x0) // dx) + 1)
        j0, j1 = max(0, int((bz0 - z0) // dx)), min(g['nz'] - 1, int((bz1 - z0) // dx) + 1)
        n = 0
        for j in range(j0, j1 + 1):
            for i in range(i0, i1 + 1):
                d = poly.distance(Point(x0 + i * dx, z0 + j * dx))
                if d >= blend:
                    continue
                t = 1.0 - d / blend
                w = t * t * (3 - 2 * t)  # smoothstep
                h[j, i] = h[j, i] * (1 - w) + target * w
                n += 1
        print(f"{pad['name']}: {n} grid nodes levelled to y {pad['y']} (blend {blend} m)", file=sys.stderr)
    encode(g, np.round((h - g['base']) * g['scale']))
    out = base64.b64encode(gzip.compress(json.dumps(p, separators=(',', ':')).encode(), 9)).decode()
    open(pack_path, 'w').write(out)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
