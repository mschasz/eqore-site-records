"""Orchestrates the lookup order from handoff §4.

geocode -> (route by county FIPS: county adapters, build steps 2-3) -> parcels
-> imagery -> city/county -> fire district -> hazards -> utility -> zoning ->
needed inputs. A single source failing never raises: it becomes a
`source_errors` entry plus a `missing` item, and the build continues."""

from __future__ import annotations

from typing import Callable, Optional

from . import ahj, crosscheck, resolve
from .needed import finish
from .adapters import ADAPTERS
from .address import parse
from .context import S_AHJ, S_BESS, S_ELEC, S_HAZ, S_ID, S_PARCEL, S_ZONING, Ctx
from .http import HttpClient
from .needed import add_needed
from .schema import SECTIONS, ProposedSystem, RecordInput, SiteRecord
from .statewide import boundaries, census, fire, hazards, parcels_statewide, seismic, static, utility, zoning_abag

# (source key, step, field ids it would fill, section/label/who for the missing item)
STEPS: list[tuple[str, Callable[[Ctx], None], list[tuple[str, str, str, str]]]] = [
    ("dwr_lightbox_parcels", parcels_statewide.run, [("b_apn", S_PARCEL, "APN", "Customer")]),
    ("naip_2022", static.naip, [("b_img", S_PARCEL, "Aerial imagery", "EQORE")]),
    ("boe_cities", boundaries.run, [("a_city", S_ID, "City", "EQORE"), ("z_jur", S_ZONING, "Jurisdiction", "EQORE")]),
    ("calfire_fire_districts", fire.run, [("d_fire", S_AHJ, "Fire authority", "EQORE")]),
    ("bsc_bulletin_25_01", static.code_edition, [("d_code", S_AHJ, "State code edition", "EQORE")]),
    ("calfire_fhsz", hazards.fhsz, [("e_fhsz", S_HAZ, "Fire hazard severity zone", "EQORE")]),
    ("cgs_tsunami", hazards.tsunami, [("e_tsu", S_HAZ, "Tsunami hazard area", "EQORE")]),
    ("cgs_liquefaction", hazards.liquefaction, [("e_liq", S_HAZ, "Liquefaction", "EQORE")]),
    ("usgs_seismic", seismic.run, [("e_seis", S_HAZ, "Seismic design parameters", "EQORE")]),
    ("fema_nfhl", hazards.flood_not_fetched, []),
    ("cec_lse", utility.utility, [("f_util", S_ELEC, "Serving utility", "Customer"),
                                  ("d_ic", S_AHJ, "Utility interconnection process", "EQORE")]),
    ("pge_grip_feeders", utility.feeders, []),
    ("abag_zoning_draft", zoning_abag.run, [("z_zone", S_ZONING, "Zoning", "EQORE")]),
]


def _guard(ctx: Ctx, source: str, fn: Callable[[Ctx], None], fills) -> None:
    try:
        fn(ctx)
    except Exception as e:  # noqa: BLE001 - partial failure is normal
        ctx.error(source, e)
        for fid, sec, label, who in fills:
            if ctx.record.field(fid) is None:
                ctx.add_needed(fid, sec, label, f"Lookup failed ({type(e).__name__}); see source_errors.",
                               who, source=source, display="Lookup failed")


def _county_adapter(ctx: Ctx) -> None:
    fips = ctx.record.county_fips
    entry = ADAPTERS.get(fips or "")
    if entry is None:
        ctx.flag("info", "No county adapter for this location",
                 f"County FIPS {fips} has no adapter yet. Parcel candidates come only from the statewide LightBox "
                 "layer; buildings, use and permits are not looked up.", "b_apn")
        return
    source, fn = entry
    _guard(ctx, source, fn, [])


def build_site_record(address: str, proposed_system: Optional[ProposedSystem | dict] = None,
                      client: Optional[HttpClient] = None, today: Optional[str] = None,
                      confirmed_apn: Optional[str] = None, confirmed_by: str = "customer",
                      point_override: Optional[tuple[float, float]] = None) -> SiteRecord:
    """Public entry point: address (+ optional proposed BESS) -> SiteRecord.

    `client` defaults to a live HttpClient. Pass `HttpClient("replay", dir)` to
    run offline from recorded responses. Pass `confirmed_apn` once a person has
    confirmed the parcel: county adapters look that APN up even if it was not a
    candidate, and the record comes back `confirmed` (or flagged if not found).
    To confirm an already-built record without refetching, use `confirm_apn`.
    `point_override=(lat, lon)` runs every point lookup there instead of at the
    geocoded point (used by `build_confirmed_record`)."""
    if isinstance(proposed_system, dict):
        proposed_system = ProposedSystem(**proposed_system)
    record = SiteRecord(input=RecordInput(address=address, proposed_system=proposed_system))
    own = client is None
    client = client or HttpClient("live")
    ctx = Ctx(record=record, client=client, addr=parse(address), **({"today": today} if today else {}))
    if confirmed_apn:
        ctx.shared.update(confirmed_apn=confirmed_apn.strip(), confirmed_by=confirmed_by)
    try:
        located = False
        try:
            located = census.run(ctx)
        except Exception as e:  # noqa: BLE001
            ctx.error("census_geocoder", e)
            ctx.add_needed("a_ll", S_ID, "Coordinates", f"Geocoder failed ({type(e).__name__}).", "Customer",
                           source="census_geocoder", display="Lookup failed")

        if proposed_system:
            ps = proposed_system
            disp = ", ".join(x for x in [
                " ".join(filter(None, [ps.manufacturer, ps.model])) or None,
                f"{ps.energy_kwh:g} kWh" if ps.energy_kwh else None,
                f"{ps.power_kw:g} kW" if ps.power_kw else None, ps.chemistry, ps.placement] if x)
            ctx.add_field("g_sys", S_BESS, "Proposed system", "lead_form", ps.model_dump(exclude_none=True),
                          display=disp or "Provided", status="filled", confidence="high",
                          note="As selected by EQORE / entered on the lead form.")
            if ps.placement:
                ctx.add_field("g_type", S_BESS, "Indoor, outdoor or rooftop; mounting", "lead_form", ps.placement,
                              status="confirm", confidence="medium", who="Customer")

        if point_override:
            lat, lon = point_override
            from .context import Point
            ctx.point = Point(lat=lat, lon=lon)
            note = (f"Point inside the confirmed parcel APN {confirmed_apn}; hazard, utility, fire and zoning "
                    "lookups ran here, not at the street-interpolated geocode." if confirmed_apn
                    else "Point supplied by the caller.")
            record.location = ctx.value("computed", {"lat": lat, "lon": lon}, confidence="high", note=note)
            ctx.add_field("a_ll", S_ID, "Coordinates", "computed", {"lat": lat, "lon": lon},
                          display=f"{lat:.6f}, {lon:.6f}", status="filled", confidence="high", note=note)
            ctx.flag("info", "Point lookups ran inside the confirmed parcel", note, "a_ll")
            located = True
        if not located:
            try:
                located = parcels_statewide.locate_by_situs(ctx)
            except Exception as e:  # noqa: BLE001
                ctx.error("dwr_lightbox_parcels", e)
        state = (record.county_fips or "")[:2]
        if located and state == "25":
            from . import massachusetts
            for source, fn, fills in massachusetts.STEPS:
                _guard(ctx, source, fn, fills)
            _guard(ctx, "computed", resolve.finalize, [("b_apn", S_PARCEL, "APN", "Customer")])
        elif located and state not in ("", "06"):
            ctx.flag("warn", "State not covered", f"State FIPS {state} has no data pack yet (California and "
                     "Massachusetts only). Only the geocode is filled.", "a_ll")
        elif located:
            for source, fn, fills in STEPS:
                _guard(ctx, source, fn, fills)
            _county_adapter(ctx)
            _guard(ctx, "eqore_ahj_table", ahj.run, [])
            _guard(ctx, "computed", resolve.finalize, [("b_apn", S_PARCEL, "APN", "Customer")])
        else:
            for source, _, fills in STEPS:
                ctx.status(source, "not_queried", "Skipped: no geocoded point")
                for fid, sec, label, who in fills:
                    ctx.add_needed(fid, sec, label, "Skipped because the address did not geocode.", who,
                                   source=source, display="Not queried")
        add_needed(ctx)
        _guard(ctx, "computed", crosscheck.run, [])
    finally:
        if own:
            client.close()

    order = {s: i for i, s in enumerate(SECTIONS)}
    record.fields.sort(key=lambda f: order.get(f.section, 99))
    record.status = "confirmed" if record.confirmed_apn else "needs_confirmation"
    finish(record)
    return record


RELOCATE_M = 25


def build_confirmed_record(address: str, apn: str, proposed_system=None, client: Optional[HttpClient] = None,
                           confirmed_by: str = "customer", today: Optional[str] = None) -> SiteRecord:
    """Confirm `apn` and make the point lookups describe that parcel.

    Pass 1 builds the record with the APN confirmed. If the confirmed parcel is
    more than RELOCATE_M from the geocoded point, pass 2 rebuilds with every
    point lookup (hazards, utility, fire district, regional zoning, imagery)
    run at a point inside the parcel."""
    rec = build_site_record(address, proposed_system, client=client, today=today,
                            confirmed_apn=apn, confirmed_by=confirmed_by)
    cand = next((c for c in rec.candidates if c.apn.value == rec.confirmed_apn), None)
    if rec.status != "confirmed" or cand is None or not cand.geometry or (cand.distance_m or 0) <= RELOCATE_M:
        return rec
    from shapely.geometry import shape
    rp = shape(cand.geometry).representative_point()
    return build_site_record(address, proposed_system, client=client, today=today, confirmed_apn=apn,
                             confirmed_by=confirmed_by, point_override=(round(rp.y, 7), round(rp.x, 7)))
