"""Shared helpers for county/city adapters."""

from __future__ import annotations

from typing import Any

from ..context import Ctx
from ..sources import SOURCES


def soql(ctx: Ctx, source: str, **clauses: Any) -> list[dict]:
    """Socrata SoQL GET. Keyword args become $-params: where=, select=, order=, limit=...
    Raises FetchError on HTTP/service errors (Socrata returns {"message": ...} on 400)."""
    params = {f"${k}": str(v) for k, v in clauses.items()}
    data = ctx.client.get_json(source, SOURCES[source].url, params)
    if isinstance(data, dict):
        from ..http import FetchError
        raise FetchError(f"Socrata error: {data.get('message') or data}", SOURCES[source].url)
    return data


def sql_str(s: str) -> str:
    return "'" + str(s).replace("'", "''") + "'"


def arcgis_query(ctx: Ctx, source: str, *, where: str | None = None, envelope: tuple | None = None,
                 point: tuple | None = None, distance_m: float | None = None, out_fields: str = "*",
                 geometry: bool = False, distinct: bool = False) -> list[dict]:
    """ArcGIS FeatureServer query by SQL `where`, lon/lat `envelope` (x0,y0,x1,y1) or `point` (lon,lat)."""
    params: dict[str, Any] = {"f": "json", "outFields": out_fields, "returnGeometry": str(geometry).lower()}
    if geometry:
        params["outSR"] = 4326
    if where:
        params["where"] = where
    if envelope:
        params.update(geometry=",".join(f"{v:.7f}" for v in envelope), geometryType="esriGeometryEnvelope",
                      inSR=4326, spatialRel="esriSpatialRelIntersects")
    if point:
        params.update(geometry=f"{point[0]:.7f},{point[1]:.7f}", geometryType="esriGeometryPoint",
                      inSR=4326, spatialRel="esriSpatialRelIntersects")
    if distance_m:
        params.update(distance=distance_m, units="esriSRUnit_Meter")
    if distinct:
        params["returnDistinctValues"] = "true"
    if not (where or envelope or point):
        params["where"] = "1=1"
    # Page past the server's maxRecordCount (Hayward: 1000) instead of silently truncating.
    out: list[dict] = []
    for page in range(MAX_PAGES):
        if page:
            params.update(resultOffset=len(out), orderByFields="OBJECTID")
        data = ctx.client.get_json(source, SOURCES[source].url + "/query", params)
        out += data.get("features", [])
        if not data.get("exceededTransferLimit"):
            return out
    from ..http import FetchError
    raise FetchError(f"more than {len(out)} features; narrow the query", SOURCES[source].url)


MAX_PAGES = 5
