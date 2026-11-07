"""Required inputs (handoff §3), one registry entry per record field.

Every entry says which §3 item it covers, its fill type (A auto, C confirm,
U customer, E EQORE, Utility), and who provides it when it can't be filled.
`add_needed` makes every required field that no lookup filled into a `needed`
field plus a `missing` entry. `summary` reports completeness against this list.
"""

from __future__ import annotations

from dataclasses import dataclass

from .context import S_AHJ, S_BESS, S_ELEC, S_HAZ, S_ID, S_PARCEL, S_ZONING, Ctx


@dataclass(frozen=True)
class Req:
    id: str
    section: str
    label: str
    fill: str          # handoff fill type
    who: str           # who provides it when not auto-filled
    why: str           # shown when missing
    covers: str        # handoff §3 wording


REQUIRED: list[Req] = [
    # 1. Identity and ownership
    Req("a_cen", S_ID, "Census match (normalized address)", "A", "Customer", "Address did not geocode.", "normalized address"),
    Req("a_ll", S_ID, "Coordinates", "A+C", "Customer", "No geocode or situs location.", "coordinates"),
    Req("a_cnty", S_ID, "County", "A", "EQORE", "County lookup failed.", "county/city/FIPS"),
    Req("a_city", S_ID, "City", "A", "EQORE", "City lookup failed.", "county/city/FIPS"),
    Req("a_apn", S_ID, "APN confirmed by customer", "A+C", "Customer",
        "Candidate parcels are listed; the customer confirms which lot the equipment goes on.", "APN"),
    Req("a_own", S_ID, "Owner of record", "C/U", "Customer",
        "Shown once one parcel is the address match or is confirmed (county layers carry owners; "
        "the statewide layer does not).", "owner of record"),
    Req("a_rel", S_ID, "Applicant's relationship and landlord consent", "U", "Customer",
        "Owner, tenant or agent; tenants need the owner's consent.", "applicant's relationship and landlord consent"),
    # 2. Parcel and buildings
    Req("b_apn", S_PARCEL, "APN", "A+C", "Customer", "No parcel found by situs or near the point.", "APN"),
    Req("b_geom", S_PARCEL, "Parcel boundary", "A+C", "EQORE",
        "Shown once one parcel is the situs match or is confirmed.", "parcel polygon, area, lot lines"),
    Req("b_area", S_PARCEL, "Parcel area", "A+C", "EQORE",
        "Shown once one parcel is the situs match or is confirmed.", "parcel polygon, area, lot lines"),
    Req("b_ease", S_PARCEL, "Easements and utility corridors", "U/E", "EQORE",
        "Needs a title report or recorded survey.", "easements"),
    Req("b_bld", S_PARCEL, "Building footprints on the lot", "A+C", "EQORE",
        "Footprints come with a county adapter and a single situs match or a confirmed APN.", "building footprints"),
    Req("b_height", S_PARCEL, "Building height and stories", "U", "Customer", "No reliable public height data.", "height and stories"),
    Req("b_occ", S_PARCEL, "Occupancy group, construction type, sprinklers", "U", "Customer",
        "Not in any public layer here; see the certificate of occupancy or old plan sets.",
        "occupancy group, construction type, sprinklers"),
    Req("b_img", S_PARCEL, "Aerial imagery", "A", "EQORE", "Imagery link not built.", "aerial image"),
    Req("b_street", S_PARCEL, "Street-level imagery", "A", "EQORE",
        "No street-imagery source verified yet (Mapillary coverage unresolved in the handoff). "
        "Check Street View manually or ask for photos.", "street imagery"),
    # 3. BESS placement
    Req("g_type", S_BESS, "Indoor, outdoor or rooftop; mounting", "U", "Customer", "Customer and EQORE decide.",
        "indoor/outdoor/rooftop and mounting"),
    Req("g_pin", S_BESS, "BESS location on the map", "U", "Customer", "Customer marks the location on the aerial.",
        "location marked on aerial"),
    Req("g_photos", S_BESS, "Site photos (shot list)", "U", "Customer",
        "Main panel, proposed location, path to it, nearby openings.", "photos with a shot list"),
    Req("g_dist", S_BESS, "Distances to lot lines, buildings, public ways", "computed+C", "EQORE",
        "Computed once the pin and parcel are confirmed; screening only, no code rule applied.",
        "distances to lot lines, buildings, public ways, vegetation, combustibles"),
    Req("g_access", S_BESS, "Fire apparatus access and nearest hydrant", "U", "Customer", "Not public in bulk.",
        "fire apparatus access and hydrant"),
    Req("g_conduit", S_BESS, "Conduit route", "E", "EQORE", "EQORE designs.", "conduit route"),
    Req("g_clear", S_BESS, "Clearances and ventilation", "E", "EQORE",
        "EQORE designs against the adopted fire code (not encoded).", "clearances and ventilation"),
    Req("g_struct", S_BESS, "Structural loads", "E", "EQORE", "EQORE designs.", "structural loads"),
    # 4. Electrical
    Req("f_util", S_ELEC, "Serving utility", "A+C", "Customer", "Utility territory lookup failed.", "serving utility"),
    Req("f_acct", S_ELEC, "Service account and meter number", "U", "Customer", "Not public.", "account/meter number"),
    Req("f_svc", S_ELEC, "Service voltage, phase, main breaker, switchgear", "U", "Customer",
        "Not public; photo of the main panel nameplate.", "service voltage/phase/main breaker/switchgear"),
    Req("f_sld", S_ELEC, "Single-line diagram", "U", "Customer", "From facilities records or an electrician.",
        "single-line diagram"),
    Req("f_der", S_ELEC, "Existing PV, generator, ATS", "U", "Customer", "Not reliably public.",
        "existing PV/generator/ATS"),
    Req("f_fault", S_ELEC, "Available fault current", "Utility", "Utility", "Utility provides on request.",
        "available fault current"),
    Req("f_feeder", S_ELEC, "Distribution feeder and hosting capacity", "A", "Utility",
        "PG&E GRIP covers PG&E territory only; other utilities provide it on request.", "feeder capacity (PG&E GRIP)"),
    Req("f_rate", S_ELEC, "Rate schedule", "U", "Customer", "Not public.", "rate schedule"),
    Req("f_int", S_ELEC, "15-minute interval data, 12+ months", "U", "Customer",
        "Customer authorizes a utility data share or uploads Green Button.", "15-minute interval data"),
    Req("f_kwh", S_ELEC, "Annual electricity use", "U", "Customer",
        "No public consumption data at this site; 12 months of bills.", "rate schedule and 15-minute interval data"),
    Req("f_cca", S_ELEC, "Retail generation provider", "U", "Customer",
        "Bundled utility or community choice; shown on the bill.", "rate schedule"),
    # 5. Hazards
    Req("e_fhsz", S_HAZ, "Fire hazard severity zone", "A", "EQORE", "Lookup failed.", "fire hazard zone"),
    Req("e_flood", S_HAZ, "FEMA flood zone", "A", "EQORE", "Not fetched automatically (FEMA robots.txt).", "flood zone"),
    Req("e_tsu", S_HAZ, "Tsunami hazard area", "A", "EQORE", "Lookup failed.", "tsunami"),
    Req("e_liq", S_HAZ, "Liquefaction", "A", "EQORE", "Lookup failed.", "liquefaction/landslide/fault"),
    Req("e_fault", S_HAZ, "Fault rupture and landslide zones", "A", "EQORE",
        "CGS Alquist-Priolo and landslide layers not queried yet.", "liquefaction/landslide/fault"),
    Req("e_seis", S_HAZ, "Seismic design parameters", "A", "EQORE", "Lookup failed.", "seismic design parameters"),
    Req("e_coast", S_HAZ, "Coastal zone", "A", "EQORE", "Coastal Commission layer not queried yet.", "coastal zone"),
    # 6. Zoning
    Req("z_jur", S_ZONING, "Jurisdiction", "A", "EQORE", "City lookup failed.", "zoning district"),
    Req("z_zone", S_ZONING, "Zoning", "A+C", "EQORE", "No zoning layer answered.", "zoning district"),
    Req("z_use", S_ZONING, "Energy storage allowed in this zone?", "E", "EQORE",
        "The rule is ordinance text; read the local zoning code.", "whether storage is allowed"),
    Req("z_set", S_ZONING, "Setbacks, height limit, screening", "E", "EQORE",
        "From the local municipal code for the district.", "setbacks"),
    Req("z_overlay", S_ZONING, "Zoning overlays", "E", "EQORE",
        "No city zoning layer with overlay data for this site.", "overlays"),
    Req("z_air", S_ZONING, "Airport influence or height restrictions", "E", "EQORE",
        "Airport land-use compatibility maps not queried.", "overlays"),
    # 7. AHJ and process
    Req("d_bldg", S_AHJ, "Building permit authority and portal", "E", "EQORE",
        "No confirmed row in the EQORE AHJ table for this jurisdiction.", "building department"),
    Req("d_fire", S_AHJ, "Fire authority", "E", "EQORE", "Fire district lookup failed.", "fire AHJ"),
    Req("d_plan", S_AHJ, "Planning contact", "E", "EQORE",
        "No confirmed row in the EQORE AHJ table for this jurisdiction.", "planning contact"),
    Req("d_code", S_AHJ, "State code edition", "E", "EQORE", "Static value missing.", "adopted code editions"),
    Req("d_amend", S_AHJ, "Local code amendments", "E", "EQORE",
        "No statewide dataset lists them; read the adopting ordinance.", "local amendments"),
    Req("d_check", S_AHJ, "Energy storage submittal checklist", "E", "EQORE",
        "Ask the permit center which permits and plans apply.", "ESS submittal checklist"),
    Req("d_ic", S_AHJ, "Utility interconnection process", "E", "EQORE",
        "Depends on which utility serves the meter.", "interconnection path"),
]

REQUIRED_IDS = {r.id for r in REQUIRED}


def add_needed(ctx: Ctx) -> None:
    have = {f.id for f in ctx.record.fields}
    for r in REQUIRED:
        if r.id not in have:
            ctx.add_needed(r.id, r.section, r.label, r.why, r.who)


def finish(record) -> None:
    """Recompute the derived outputs: form prefill, then the summary."""
    from .prefill import fill
    fill(record)
    record.summary = summary(record)


def summary(record) -> dict:
    """Completeness against the required list (for a completeness bar) plus who owes what."""
    by_id = {f.id: f for f in record.fields}
    req = [by_id.get(r.id) for r in REQUIRED]
    status = {k: sum(1 for f in req if f is not None and f.status == k) for k in ("filled", "provided", "confirm", "needed")}
    status["needed"] += sum(1 for f in req if f is None)
    who: dict[str, dict[str, int]] = {}
    for f in record.fields:
        if f.status in ("confirm", "needed"):
            w = who.setdefault(f.who or "EQORE", {"confirm": 0, "needed": 0})
            w[f.status] += 1
    n = len(REQUIRED)
    return {
        "required": n,
        "required_by_status": status,
        "required_done_pct": round(100 * (status["filled"] + status["provided"]) / n),
        "required_auto_pct": round(100 * (status["filled"] + status["provided"] + status["confirm"]) / n),
        "to_collect_by_who": who,
        "flags": {"warn": sum(1 for f in record.flags if f.severity == "warn"),
                  "info": sum(1 for f in record.flags if f.severity == "info")},
        "source_errors": len(record.source_errors),
        "prefill": {k: sum(1 for i in record.form_prefill if i.status == k) for k in ("filled", "review", "missing")},
    }
