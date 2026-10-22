"""Fetch Mapzen/AWS Terrarium elevation tiles (open data on AWS, SRTM/EU-DEM
derived) and resample them onto local grids.

near grid: 16 m spacing over the detailed corridor, Gaussian-smoothed to
           remove DSM noise (the source is ~30 m resolution).
far grid : 250 m spacing, +-24 km, used for the distant backdrop (Vitosha,
           Lyulin, Stara Planina foothills).

usage: python3 tools/build_dem.py <cachedir> <out.npz>
"""
import sys, os, math, io, urllib.request
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(__file__))
from geo import to_lonlat

CACHE, OUT = sys.argv[1], sys.argv[2]
os.makedirs(CACHE, exist_ok=True)
URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'


def tile_xy(lon, lat, z):
    n = 2 ** z
    x = (lon + 180) / 360 * n
    y = (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n
    return x, y


_tiles = {}


def get_tile(z, x, y):
    key = (z, x, y)
    if key in _tiles:
        return _tiles[key]
    fn = f'{CACHE}/{z}_{x}_{y}.png'
    if not os.path.exists(fn):
        data = urllib.request.urlopen(URL.format(z=z, x=x, y=y), timeout=60).read()
        open(fn, 'wb').write(data)
    a = np.asarray(Image.open(fn).convert('RGB'), dtype=np.float64)
    h = a[..., 0] * 256 + a[..., 1] + a[..., 2] / 256 - 32768
    _tiles[key] = h
    return h


def sample(lon, lat, z):
    """Bilinear sample of terrarium elevation at zoom z."""
    tx, ty = tile_xy(lon, lat, z)
    px, py = tx * 256 - 0.5, ty * 256 - 0.5
    x0, y0 = int(math.floor(px)), int(math.floor(py))
    fx, fy = px - x0, py - y0

    def at(X, Y):
        t = get_tile(z, X // 256, Y // 256)
        return t[Y % 256, X % 256]
    return (at(x0, y0) * (1 - fx) * (1 - fy) + at(x0 + 1, y0) * fx * (1 - fy) +
            at(x0, y0 + 1) * (1 - fx) * fy + at(x0 + 1, y0 + 1) * fx * fy)


def grid(x0, z0, dx, nx, nz, zoom):
    g = np.zeros((nz, nx))
    for j in range(nz):
        for i in range(nx):
            lon, lat = to_lonlat(x0 + i * dx, z0 + j * dx)
            g[j, i] = sample(lon, lat, zoom)
    return g


def gauss(g, sigma_cells):
    r = int(math.ceil(sigma_cells * 3))
    k = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma_cells) ** 2)
    k /= k.sum()
    p = np.pad(g, r, mode='edge')
    p = np.apply_along_axis(lambda v: np.convolve(v, k, mode='valid'), 1, p)
    p = np.apply_along_axis(lambda v: np.convolve(v, k, mode='valid'), 0, p)
    return p


near_x0, near_z0, near_dx = -2800.0, -3800.0, 16.0
near_nx, near_nz = int(5600 / near_dx) + 1, int(7700 / near_dx) + 1
near = gauss(grid(near_x0, near_z0, near_dx, near_nx, near_nz, 14), 1.6)
far_x0 = far_z0 = -24000.0
far_dx = 250.0
far_n = int(48000 / far_dx) + 1
far = grid(far_x0, far_z0, far_dx, far_n, far_n, 11)
np.savez_compressed(OUT, near=near, far=far,
                    near_meta=np.array([near_x0, near_z0, near_dx, near_nx, near_nz]),
                    far_meta=np.array([far_x0, far_z0, far_dx, far_n, far_n]))
print('near', near.shape, near.min(), near.max(), 'far', far.shape, far.min(), far.max())
