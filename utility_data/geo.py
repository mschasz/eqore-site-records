"""Geocoding (US Census) and point-to-line distances for feeder matching."""
from __future__ import annotations

import math
from typing import Any

from .http import Http
from .record import val

CENSUS = "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress"


def geocode(http: Http, address: str, rec: dict) -> tuple[float, float] | None:
    params = {"address": address, "benchmark": "Public_AR_Current", "format": "json"}
    data, err, url = http.get_json(CENSUS, params)
    rec["queries"].append({"name": "US Census geocoder", "url": url})
    if err:
        rec["errors"].append(f"Geocoding failed: {err}")
        return None
    matches = ((data or {}).get("result") or {}).get("addressMatches") or []
    if not matches:
        rec["errors"].append("Geocoding returned no match for this address; stopped before querying the utility.")
        return None
    m = matches[0]
    lon, lat = m["coordinates"]["x"], m["coordinates"]["y"]
    note = None if len(matches) == 1 else f"{len(matches)} candidate matches; used the first."
    src = "US Census Geocoder (Public_AR_Current)"
    rec["site"] = {"address": val(m["matchedAddress"], src, url, "high", note=note),
                   "lat": val(lat, src, url, "high"), "lon": val(lon, src, url, "high")}
    return lon, lat


def _xy(lon: float, lat: float, lat0: float) -> tuple[float, float]:
    """Local equirectangular projection in metres (fine at feeder-matching distances)."""
    r = 6371008.8
    return math.radians(lon) * r * math.cos(math.radians(lat0)), math.radians(lat) * r


def _seg_dist(p, a, b) -> float:
    (px, py), (ax, ay), (bx, by) = p, a, b
    dx, dy = bx - ax, by - ay
    t = 0.0 if dx == dy == 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def distance_to_geometry(lon: float, lat: float, geom: dict[str, Any] | None) -> float | None:
    """Metres from the site to an Esri polyline/point geometry in WGS84 (outSR=4326)."""
    if not geom:
        return None
    p = _xy(lon, lat, lat)
    if "paths" in geom:
        best = None
        for path in geom["paths"]:
            pts = [_xy(x, y, lat) for x, y, *_ in path]
            for a, b in zip(pts, pts[1:] or pts):
                d = _seg_dist(p, a, b)
                best = d if best is None or d < best else best
        return best
    if "x" in geom:
        q = _xy(geom["x"], geom["y"], lat)
        return math.hypot(p[0] - q[0], p[1] - q[1])
    return None
