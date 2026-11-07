"""Point hazard screens: CAL FIRE FHSZ, CGS tsunami, CGS liquefaction.

FEMA flood is deliberately NOT fetched (robots.txt refusal, handoff §4); it is
always a `missing` item with a manual FIRM lookup link."""

from __future__ import annotations

from ..context import S_HAZ, Ctx


def fhsz(ctx: Ctx) -> None:
    src = "calfire_fhsz"
    feats = ctx.arcgis_point(src, out_fields="HAZ_CLASS,HAZ_CODE,SRA,FHSZ_7Class")
    vint = "state zones 2024-04-01; local zones 2007-2011 (interim); layer edited 2024-10-14"
    if not feats:
        ctx.add_field("e_fhsz", S_HAZ, "Fire hazard severity zone", src, None,
                      display="None mapped at this point", status="filled", confidence="medium",
                      vintage=vint, note="No polygon means no mapped zone, not no risk.")
        ctx.status(src, "no_result", "No FHSZ polygon at the point (no mapped zone)", vintage=vint)
        return
    zones = [f["attributes"] for f in feats]
    disp = "; ".join(f"{z.get('HAZ_CLASS')} ({z.get('SRA')})" for z in zones)
    ctx.add_field("e_fhsz", S_HAZ, "Fire hazard severity zone", src, zones, display=disp,
                  status="filled", confidence="medium", vintage=vint,
                  note="SRA = State Responsibility Area, LRA = Local. Local zones may be interim.")
    if any((z.get("HAZ_CLASS") or "").lower().startswith(("high", "very")) for z in zones):
        ctx.flag("warn", "In a High or Very High fire hazard severity zone", disp, "e_fhsz")
    ctx.status(src, "retrieved", disp, vintage=vint)


def tsunami(ctx: Ctx) -> None:
    src = "cgs_tsunami"
    feats = ctx.arcgis_point(src, out_fields="Evacuate,County,Label,Map_Link")
    if not feats:
        ctx.add_field("e_tsu", S_HAZ, "Tsunami hazard area", src, None, display="No polygon at this point",
                      status="confirm", confidence="low", who="EQORE",
                      note="The layer returned no polygon (inside or outside). The county map may not cover this area.")
        ctx.status(src, "no_result", "No polygon at the point")
        return
    a = feats[0]["attributes"]
    evac = a.get("Evacuate") or a.get("Label")
    inside = evac and not evac.lower().startswith("no")
    ctx.add_field("e_tsu", S_HAZ, "Tsunami hazard area", src, evac,
                  display="Inside the hazard area" if inside else "Outside the hazard area",
                  status="filled", confidence="medium", url=a.get("Map_Link") or None,
                  note=f"Evacuate = '{evac}' ({a.get('County')} County). Vintage not stated by the service.")
    if inside:
        ctx.flag("warn", "Inside a tsunami hazard area", f"CGS layer reads '{evac}'.", "e_tsu")
    ctx.status(src, "retrieved", evac or "")


def liquefaction(ctx: Ctx) -> None:
    src = "cgs_liquefaction"
    feats = ctx.arcgis_point(src, out_fields="OBJECTID")
    note = "The service says zones are coarse and may omit liquefaction-prone areas."
    if feats:
        ctx.add_field("e_liq", S_HAZ, "Liquefaction", src, True,
                      display="Inside a Liquefaction Zone of Required Investigation",
                      status="confirm", confidence="medium", who="EQORE", note=note)
        ctx.flag("warn", "Inside a liquefaction zone of required investigation",
                 "CGS maps this point inside a liquefaction zone. That triggers site-specific evaluation for "
                 "permits on human-occupied buildings; whether it applies to an outdoor battery pad is a "
                 "question for the building department.", "e_liq")
        ctx.status(src, "retrieved", "Inside a zone")
    else:
        ctx.add_field("e_liq", S_HAZ, "Liquefaction", src, False,
                      display="Not inside a mapped zone at this point", status="filled",
                      confidence="medium",
                      note=note + " No polygon means not in a mapped zone; CGS has not zoned every area.")
        ctx.status(src, "no_result", "No zone polygon at the point")


def flood_not_fetched(ctx: Ctx) -> None:
    src = "fema_nfhl"
    p = ctx.point
    firm = ("https://msc.fema.gov/portal/search#searchresultsanchor" if p is None else
            f"https://msc.fema.gov/portal/search?AddressQuery={p.lat:.6f}%2C{p.lon:.6f}")
    ctx.add_field("e_flood", S_HAZ, "FEMA flood zone", src, None, display="Not retrieved",
                  status="needed", confidence="low", who="EQORE", url=firm,
                  note="Not fetched automatically: FEMA's host refused our automated fetch under robots.txt. "
                       "Look up the FIRM manually at the link, or choose a permitted query path.")
    ctx.flag("warn", "Flood zone not retrieved", "Treat flood status as unknown until checked on the FEMA map.",
             "e_flood")
    ctx.status(src, "not_queried", "Deliberately not fetched (robots.txt); manual FIRM link provided")
