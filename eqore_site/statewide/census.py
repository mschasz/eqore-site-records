"""US Census Geocoder: address -> point, county FIPS, place, tract.

The point is interpolated along the street segment. It is NOT a parcel match
and often lands in the street (handoff §5)."""

from __future__ import annotations

from dataclasses import replace

from ..context import S_ID, Ctx, Point
from ..sources import SOURCES

SRC = "census_geocoder"


def run(ctx: Ctx) -> bool:
    """Returns True if a point was found (later point queries can run)."""
    addr = ctx.record.input.address
    params = {"address": addr, "benchmark": "Public_AR_Current",
              "vintage": "Current_Current", "format": "json"}
    data = ctx.client.get_json(SRC, SOURCES[SRC].url, params)
    matches = data.get("result", {}).get("addressMatches", [])
    ctx.add_field("a_addr", S_ID, "Address as entered", "lead_form", addr,
                  status="filled", confidence="high")
    if not matches:
        ctx.status(SRC, "no_result", "No address match")
        ctx.flag("warn", "Address did not geocode",
                 "The Census geocoder found no match for the address as entered.", "a_ll")
        ctx.add_needed("a_ll", S_ID, "Coordinates", "Census geocoder found no match for the address.",
                       "Customer")
        return False

    m = matches[0]
    if len(matches) > 1:
        ctx.flag("warn", "Address matched more than one location",
                 "The Census geocoder returned " + "; ".join(x["matchedAddress"] for x in matches)
                 + ". The first is used for point lookups; confirm with the customer.", "a_cen", "a_ll")
    lon, lat = m["coordinates"]["x"], m["coordinates"]["y"]
    ctx.point = Point(lat=lat, lon=lon)
    geo = m.get("geographies", {})

    def first(layer):
        v = geo.get(layer) or []
        return v[0] if v else {}

    county, place, tract = first("Counties"), first("Incorporated Places"), first("Census Tracts")
    tl = m.get("tigerLine", {})
    comp = m.get("addressComponents", {})
    ctx.geocode = {"matched": m["matchedAddress"], "components": comp, "county": county,
                   "place": place, "tract": tract}
    entered_house = ctx.addr.house
    matched_house = m["matchedAddress"].split(" ", 1)[0]
    diffs = ctx.addr.census_differences(comp)
    if diffs:
        ctx.flag("warn", "Census matched a different street",
                 f"Entered {ctx.addr.line1}; Census matched {m['matchedAddress']} ({'; '.join(diffs)}). "
                 "Point lookups use the Census point; parcel matching tests the street as entered.", "a_cen", "a_ll")
    ctx.addr = ctx.addr.with_census(comp)
    if entered_house and matched_house != entered_house:
        ctx.flag("warn", "Census matched a different house number",
                 f"Entered {entered_house}, Census matched {m['matchedAddress']}. Parcel matching uses the "
                 f"entered number {entered_house}.", "a_cen")
    elif not entered_house and matched_house[:1].isdigit():
        ctx.addr = replace(ctx.addr, house=matched_house)
    vint = "Public_AR_Current / Current_Current, queried " + ctx.today

    ctx.add_field("a_cen", S_ID, "Census match", SRC, m["matchedAddress"], status="filled",
                  confidence="medium", vintage=vint,
                  note=f"Interpolated along TIGER segment {tl.get('tigerLineId')} "
                       f"(side {tl.get('side')}, range {comp.get('fromAddress')}-{comp.get('toAddress')}). "
                       "Not a parcel match.")
    ctx.record.location = ctx.value(SRC, {"lat": lat, "lon": lon}, confidence="medium", vintage=vint,
                                    note="Street-interpolated point; may fall outside the lot.")
    ctx.add_field("a_ll", S_ID, "Coordinates", SRC, {"lat": lat, "lon": lon},
                  display=f"{lat:.6f}, {lon:.6f}", status="confirm", confidence="medium",
                  vintage=vint, who="Customer",
                  note="Interpolated along the street; often lands in the roadway, not on the lot. "
                       "Use a placed pin for the equipment location.")
    if county:
        ctx.record.county_fips = county.get("GEOID")
        ctx.add_field("a_cnty", S_ID, "County", SRC,
                      {"name": county.get("NAME"), "fips": county.get("GEOID")},
                      display=f"{county.get('NAME')} (FIPS {county.get('GEOID')})",
                      status="filled", confidence="high", vintage=vint)
    if place:
        ctx.shared["census_place"] = place.get("BASENAME")
    sub = first("County Subdivisions")
    if sub:
        ctx.shared["county_subdivision"] = sub.get("BASENAME")   # MA/New England towns
    ctx.add_field("a_place", S_ID, "Census place", SRC,
                  {"name": place.get("NAME"), "geoid": place.get("GEOID")} if place else None,
                  display=f"{place.get('NAME')} ({place.get('GEOID')})" if place else "Unincorporated (no Census place)",
                  status="filled", confidence="medium", vintage=vint,
                  note="Census incorporated place containing the geocoded point.")
    if tract:
        ctx.add_field("a_tract", S_ID, "Census tract", SRC, tract.get("GEOID"), status="filled",
                      confidence="high", vintage=vint)
    ctx.status(SRC, "retrieved", f"Matched {m['matchedAddress']} at {lat:.6f}, {lon:.6f}")
    return True
