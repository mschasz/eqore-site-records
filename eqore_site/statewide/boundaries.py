"""City / county from the BOE city boundaries (DOC mirror of CDTFA)."""

from __future__ import annotations

from ..context import S_ID, S_ZONING, Ctx

SRC = "boe_cities"


def run(ctx: Ctx) -> None:
    feats = ctx.arcgis_point(SRC, out_fields="CITY,COUNTY,COPRI")
    vint = "not stated; queried " + ctx.today
    note = "Tax-rate-area based; lines are approximate near boundaries."
    if not feats:
        ctx.status(SRC, "no_result", "No city polygon at the point")
        ctx.add_needed("a_city", S_ID, "City", "No BOE city polygon at the geocoded point.", "EQORE")
        return
    a = feats[0]["attributes"]
    city, county = a.get("CITY"), a.get("COUNTY")
    unincorporated = not city or "unincorporated" in city.lower()
    ctx.shared["city"] = None if unincorporated else city
    ctx.add_field("a_city", S_ID, "City", SRC, city, display=city or "Unincorporated",
                  status="filled", confidence="medium", vintage=vint, note=note)
    jur = f"County of {county} (unincorporated)" if unincorporated else f"City of {city}, {county}"
    ctx.add_field("z_jur", S_ZONING, "Jurisdiction", SRC, {"city": city, "county": county},
                  display=jur, status="filled", confidence="medium", vintage=vint, note=note)
    if len(feats) > 1:
        ctx.flag("warn", "Point sits on a city boundary",
                 "BOE returned " + ", ".join(f["attributes"].get("CITY") or "?" for f in feats)
                 + ". Confirm the jurisdiction.", "a_city", "z_jur")
    census_place = ctx.shared.get("census_place")
    if census_place and city and census_place.lower() != city.lower():
        ctx.flag("warn", "Census and BOE disagree on the city",
                 f"Census place is {census_place}; BOE boundary says {city}. Confirm the jurisdiction.",
                 "a_city", "a_place")
    ctx.status(SRC, "retrieved", f"{city}, {county}")
