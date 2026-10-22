"""Shared local tangent-plane projection (must match src/core/geo.js)."""
import math

ORIGIN_LAT = 42.6690
ORIGIN_LON = 23.3520
_phi = math.radians(ORIGIN_LAT)
M_PER_DEG_LAT = 111132.954 - 559.822 * math.cos(2 * _phi) + 1.175 * math.cos(4 * _phi)
M_PER_DEG_LON = 111412.84 * math.cos(_phi) - 93.5 * math.cos(3 * _phi)


def to_xz(lon, lat):
    """Three.js world coords: x = east, z = south (north is -z)."""
    return ((lon - ORIGIN_LON) * M_PER_DEG_LON, -(lat - ORIGIN_LAT) * M_PER_DEG_LAT)


def to_lonlat(x, z):
    return (ORIGIN_LON + x / M_PER_DEG_LON, ORIGIN_LAT - z / M_PER_DEG_LAT)
