"""Shared ArcGIS REST proximity query with the matching rules used by every adapter.

1. Query within 150 m; if nothing, retry at 500 m; if still nothing, the caller records a gap.
2. All returned sections on one feeder -> match, confidence "medium" (proximity, not utility-confirmed).
3. Sections on more than one feeder -> re-query with geometry, measure the distance to each, report the
   nearest as the match with confidence "low", and list every candidate.
"""
from __future__ import annotations

from typing import Any, Callable

from .geo import distance_to_geometry
from .http import Http

RADII_M = (150, 500)
BANDS_M = (10, 25, 50, 100, 150, 300)


def query(http: Http, layer_url: str, lon: float, lat: float, distance: int, out_fields: str, *,
          geometry: bool = False, where: str = "1=1") -> tuple[list[dict], str | None, str]:
    params = {"where": where, "geometry": f"{lon},{lat}", "geometryType": "esriGeometryPoint", "inSR": 4326,
              "spatialRel": "esriSpatialRelIntersects", "distance": distance, "units": "esriSRUnit_Meter",
              "outFields": out_fields, "returnGeometry": "true" if geometry else "false", "f": "json"}
    if geometry:
        params["outSR"] = 4326
    data, err, url = http.get_json(f"{layer_url}/query", params)
    if err:
        return [], err, url
    return (data or {}).get("features") or [], None, url


def where_query(http: Http, layer_url: str, where: str, out_fields: str) -> tuple[list[dict], str | None, str]:
    data, err, url = http.get_json(f"{layer_url}/query", {"where": where, "outFields": out_fields, "returnGeometry": "false", "f": "json"})
    if err:
        return [], err, url
    return (data or {}).get("features") or [], None, url


def match_feeder(http: Http, rec: dict, layer_url: str, layer_label: str, lon: float, lat: float, out_fields: str,
                 feeder_key: Callable[[dict], Any]) -> dict | None:
    """Return the match or None (nothing within 500 m).

    Geometry is always requested so every section's distance to the site is known: utilities publish
    hosting capacity per line section, and sections of one feeder carry different values.
    Result keys: attrs (nearest section of the matched feeder), confidence, url, radius_m, sections,
    candidates, method, feeder_sections (that feeder's sections nearest first, as (distance_m, attrs)).
    """
    for radius in RADII_M:
        feats, err, url = query(http, layer_url, lon, lat, radius, out_fields, geometry=True)
        rec["queries"].append({"name": f"{layer_label} within {radius} m", "url": url})
        if err:
            rec["errors"].append(f"{layer_label}: {err}")
            return None
        if not feats:
            continue
        by_feeder: dict[Any, list[tuple[float | None, dict]]] = {}
        for f in feats:
            by_feeder.setdefault(feeder_key(f["attributes"]), []).append(
                (distance_to_geometry(lon, lat, f.get("geometry")), f["attributes"]))
        for secs in by_feeder.values():
            secs.sort(key=lambda t: (t[0] is None, t[0] or 0))
        no_geom = all(t[0] is None for v in by_feeder.values() for t in v)
        band: dict[Any, int] = {}
        if no_geom and len(by_feeder) > 1:
            # Some services (e.g. National Grid MA) withhold geometry. Narrow the radius instead:
            # each feeder's distance is reported as the smallest band it appears in.
            for r in [x for x in BANDS_M if x < radius] + [radius]:
                fs, e, u = query(http, layer_url, lon, lat, r, out_fields)
                rec["queries"].append({"name": f"{layer_label} within {r} m (no geometry published; distance band)", "url": u})
                if e:
                    break
                for f in fs:
                    band.setdefault(feeder_key(f["attributes"]), r)
                if len(band) == len(by_feeder):
                    break
        ranked = sorted(by_feeder.items(), key=lambda kv: (band.get(kv[0], radius), kv[1][0][0] is None, kv[1][0][0] or 0))
        key, secs = ranked[0]
        cands = [{"feeder": str(k), "distance_m": round(v[0][0], 1) if v[0][0] is not None else None, "sections": len(v),
                  **({"within_m": band[k]} if k in band else {})} for k, v in ranked]
        d0 = (f"{secs[0][0]:.0f} m" if secs[0][0] is not None else f"within {band[key]} m" if key in band else "unknown distance")
        if len(by_feeder) == 1:
            conf, method = "medium", (f"All {len(feats)} line sections within {radius} m are on one feeder; nearest section {d0} "
                                      "(matched by proximity, not confirmed by the utility).")
        else:
            conf, method = "low", (f"{len(by_feeder)} feeders have line sections within {radius} m; the nearest ({d0}) is reported "
                                   "(low confidence; see candidates).")
        return {"attrs": secs[0][1], "confidence": conf, "url": url, "radius_m": radius, "sections": len(feats),
                "candidates": cands, "method": method, "feeder_sections": secs}
    return None
