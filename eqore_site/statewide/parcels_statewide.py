"""Statewide parcel candidates from the DWR LightBox assessor layer.

`run`: situs-address match first (house number + street name + city, then
suffix/direction compared in Python: exact -> situs_address, differs ->
situs_partial), then lots containing or near the geocoded point.

`locate_by_situs`: when the Census geocoder finds nothing, a single exact
situs match here supplies the point (parcel interior) and county, so the rest
of the pipeline can still run. Never used when Census matched.

LightBox APNs are not in county display format (Alameda '463-105-1' vs county
'463-0105-001-00'); `resolve.apn_key` compares them."""

from __future__ import annotations

from shapely.geometry import mapping

from .. import geo, resolve
from ..address import compare, parse_street
from ..ca_counties import fips_for
from ..context import S_ID, Ctx, Point
from ..schema import Candidate
from ..sources import SOURCES

SRC = "dwr_lightbox_parcels"
NEARBY_M = 40
OUT = "PARCEL_APN,TAXAPN,COUNTYNAME,SITE_ADDR,SITE_CITY,SITE_ZIP,SITE_HOUSE_NUMBER,SITE_STREET_NAME,SITE_MODE,SITE_DIRECTION"


def _sql(s: str) -> str:
    return s.replace("'", "''")


def _situs_features(ctx: Ctx) -> list[tuple[dict, str]]:
    """[(feature, 'exact'|'partial')] for parcels whose situs matches the entered address."""
    a = ctx.addr
    if not (a.house and a.name):
        return []
    where = f"SITE_HOUSE_NUMBER='{_sql(a.house)}' AND SITE_STREET_NAME='{_sql(a.name)}'"
    if a.city:
        where += f" AND SITE_CITY='{_sql(a.city)}'"
    data = ctx.client.get_json(SRC, SOURCES[SRC].url + "/query",
                               {"where": where, "outFields": OUT, "returnGeometry": "true", "outSR": 4326, "f": "json"})
    out = []
    for f in data.get("features", []):
        level = compare(a, parse_street(f["attributes"].get("SITE_ADDR") or ""))
        if level != "none":
            out.append((f, level))
    return out


def locate_by_situs(ctx: Ctx) -> bool:
    """Fallback locator. Returns True and sets ctx.point / county if exactly one exact match."""
    if not ctx.addr.city:
        return False
    hits = [(f, lvl) for f, lvl in _situs_features(ctx) if lvl == "exact"]
    ctx.shared["situs_fallback_hits"] = len(hits)
    if not hits:
        ctx.flag("warn", "Address not found by situs either",
                 f"No statewide parcel has situs {ctx.addr.line1} in {ctx.addr.city}. Point-based lookups were "
                 "skipped. Ask the customer for the APN or a map pin.", "a_ll", "b_apn")
        return False
    f = hits[0][0]
    g = geo.from_esri_rings((f.get("geometry") or {}).get("rings"))
    if g is None or g.is_empty:
        return False
    rp = g.representative_point()
    ctx.point = Point(lat=rp.y, lon=rp.x)
    a = f["attributes"]
    fips = fips_for(a.get("COUNTYNAME"))
    ctx.record.county_fips = fips
    note = (f"Point inside parcel {a.get('PARCEL_APN')} ({a.get('SITE_ADDR')}), found by situs because the Census "
            "geocoder did not match the address.")
    ctx.record.location = ctx.value(SRC, {"lat": rp.y, "lon": rp.x}, confidence="medium", note=note)
    ctx.add_field("a_ll", S_ID, "Coordinates", SRC, {"lat": rp.y, "lon": rp.x}, display=f"{rp.y:.6f}, {rp.x:.6f}",
                  status="confirm", confidence="medium", who="Customer", note=note)
    if fips:
        ctx.add_field("a_cnty", S_ID, "County", SRC, {"name": a.get("COUNTYNAME"), "fips": fips},
                      display=f"{(a.get('COUNTYNAME') or '').title()} County (FIPS {fips})", status="filled",
                      confidence="medium", note="County name from the statewide parcel record.")
    ctx.flag("info", "Located by situs match instead of geocoding",
             note + (f" {len(hits)} parcels matched; the first is used for point lookups." if len(hits) > 1 else ""),
             "a_ll")
    return True


def run(ctx: Ctx) -> None:
    found: dict[str, dict] = {}
    for f, level in _situs_features(ctx):
        found.setdefault(f["attributes"]["PARCEL_APN"],
                         {"f": f, "method": "situs_address" if level == "exact" else "situs_partial"})
    situs_n = len(found)
    for f in ctx.arcgis_point(SRC, out_fields=OUT, distance_m=NEARBY_M, return_geometry=True):
        found.setdefault(f["attributes"]["PARCEL_APN"], {"f": f, "method": "nearby"})

    vint = SOURCES[SRC].vintage
    p = ctx.point
    for apn, item in found.items():
        a = item["f"]["attributes"]
        g = geo.from_esri_rings((item["f"].get("geometry") or {}).get("rings"))
        ok = g is not None and not g.is_empty
        dist = geo.distance_m(g, p.lon, p.lat) if ok else None
        method = item["method"]
        if method == "nearby" and dist == 0:
            method = "point_in_polygon"
        area = geo.area_sqft(g) if ok else None
        resolve.add_candidate(ctx, Candidate(
            apn=ctx.value(SRC, apn, confidence="medium", vintage=vint,
                          note="LightBox APN format; county display format may differ."),
            situs=ctx.value(SRC, f"{a.get('SITE_ADDR') or ''}, {a.get('SITE_CITY') or ''}".strip(", "),
                            confidence="medium", vintage=vint),
            match_method=method, distance_m=dist, contains_point=dist == 0,
            area_sqft=ctx.value("computed", area, confidence="medium",
                                note="Computed from the LightBox polygon in EPSG:3310.") if area else None,
            geometry=mapping(g) if ok else None, found_in=[SRC],
            situs_matched_by=[SRC] if method == "situs_address" else [],
            note=resolve.METHOD_NOTE[method].format(m=NEARBY_M),
        ), geom=g if ok else None)

    if found:
        ctx.status(SRC, "retrieved", f"{situs_n} situs match(es), {len(found)} parcel(s) total")
    else:
        ctx.status(SRC, "no_result", f"No parcel by situs or within {NEARBY_M} m")
