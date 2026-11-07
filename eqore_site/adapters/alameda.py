"""Alameda County (06001) router. Only the City of Hayward has an adapter so far;
other cities and unincorporated areas fall back to the statewide layers and get
a `missing` item for parcel data."""

from __future__ import annotations

from ..context import S_PARCEL, Ctx
from . import hayward


def run(ctx: Ctx) -> None:
    city = (ctx.shared.get("city") or ctx.shared.get("census_place") or "").strip()
    if city.lower() == "hayward":
        hayward.run(ctx)
        return
    where = city or "unincorporated Alameda County"
    ctx.flag("info", f"No parcel adapter for {where}",
             f"Alameda County has an adapter only for the City of Hayward. Parcel candidates for {where} come from "
             "the statewide LightBox layer only (no owner, footprints or city zoning).", "b_apn")
    ctx.add_missing(f"City parcel, owner and footprint data for {where}",
                    "No adapter for this city yet; statewide layer gives APN and situs only.", "EQORE", "b_parcel_src")
