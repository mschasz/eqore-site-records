"""Geometry helpers. Areas and distances in EPSG:3310 (California Albers, m)."""

from __future__ import annotations

import math

import numpy as np
import shapely
from pyproj import Transformer
from shapely.geometry import LinearRing, Polygon, shape
from shapely.ops import unary_union

SQFT_PER_M2 = 10.7639
FT_PER_M = 3.28084
_tr = Transformer.from_crs(4326, 3310, always_xy=True)


def to_ca(g):
    """lon/lat geometry -> EPSG:3310 metres."""
    return shapely.transform(g, lambda c: np.column_stack(_tr.transform(c[:, 0], c[:, 1])))


def from_esri_rings(rings: list):
    """ArcGIS rings (clockwise shells, counter-clockwise holes) -> shapely geometry."""
    if not rings:
        return None
    ok = [r for r in rings if len(r) >= 4]
    shells = [Polygon(r) for r in ok if not LinearRing(r).is_ccw]
    holes = [Polygon(r) for r in ok if LinearRing(r).is_ccw]
    g = unary_union(shells or [Polygon(r) for r in ok])
    if holes and shells:
        g = g.difference(unary_union(holes))
    return g


def from_geojson(d: dict | None):
    return shape(d) if d else None


def box_wkt(lat: float, lon: float, half_m: float) -> str:
    dlat = half_m / 111_320
    dlon = half_m / (111_320 * math.cos(math.radians(lat)))
    x0, x1, y0, y1 = lon - dlon, lon + dlon, lat - dlat, lat + dlat
    return f"POLYGON(({x0:.6f} {y0:.6f},{x1:.6f} {y0:.6f},{x1:.6f} {y1:.6f},{x0:.6f} {y1:.6f},{x0:.6f} {y0:.6f}))"


def bbox_wkt(g, pad_deg: float = 0.00005) -> str:
    x0, y0, x1, y1 = g.bounds
    x0, y0, x1, y1 = x0 - pad_deg, y0 - pad_deg, x1 + pad_deg, y1 + pad_deg
    return f"POLYGON(({x0:.6f} {y0:.6f},{x1:.6f} {y0:.6f},{x1:.6f} {y1:.6f},{x0:.6f} {y1:.6f},{x0:.6f} {y0:.6f}))"


def area_sqft(g) -> int:
    return round(to_ca(g).area * SQFT_PER_M2)


def distance_m(g, lon: float, lat: float) -> float:
    """0 if the point is inside g, else distance to g's boundary in metres."""
    from shapely.geometry import Point
    gc, pc = to_ca(g), to_ca(Point(lon, lat))
    return 0.0 if gc.contains(pc) else round(gc.distance(pc), 1)


def overlap_pct(part, whole) -> float:
    """Percent of `part`'s area that lies inside `whole`."""
    pc, wc = to_ca(part), to_ca(whole)
    return 0.0 if pc.area == 0 else round(100 * pc.intersection(wc).area / pc.area, 1)
