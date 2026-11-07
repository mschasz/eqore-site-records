"""Offline edits a person makes to a built record (no network).

- `place_bess(record, lat, lon)`: the BESS location pin (`g_pin`) and screening
  distances from it to the lot line and the nearest building (`g_dist`).
  Distances are SCREENING ONLY: no NFPA 855 / CFC separation rule is applied.
- `clear_bess(record)`: remove the pin.
- `enter_values(record, {field_id: value})`: values typed in by the customer or
  EQORE. The field becomes `provided` and keeps a note of what it replaced.

Each returns a new record with flags, cross-checks and summary recomputed."""

from __future__ import annotations

from typing import Any, Optional

from shapely.geometry import Point, shape
from shapely.ops import nearest_points

from . import crosscheck, geo
from .context import S_BESS, Ctx
from .needed import REQUIRED, add_needed, finish
from .resolve import apn_key
from .schema import Candidate, SiteRecord

PIN_ORIGIN = "pin"
SCREENING = ("Screening only: straight-line distance between public polygons that are not survey-grade. "
             "No fire-code separation rule (NFPA 855 / California Fire Code) is applied.")


def _ctx(rec: SiteRecord, today: Optional[str]) -> Ctx:
    return Ctx(record=rec, client=None, **({"today": today} if today else {}))  # type: ignore[arg-type]


def _finish(ctx: Ctx) -> SiteRecord:
    add_needed(ctx)
    crosscheck.run(ctx)
    finish(ctx.record)
    return ctx.record


def _parcel_for_pin(rec: SiteRecord, pt: Point, apn: Optional[str]) -> Candidate | None:
    want = apn or rec.confirmed_apn or rec.shown_candidate
    if want:
        return next((c for c in rec.candidates if apn_key(c.apn.value) == apn_key(want)), None)
    return next((c for c in rec.candidates if c.geometry and shape(c.geometry).contains(pt)), None)


def place_bess(record: SiteRecord, lat: float, lon: float, apn: Optional[str] = None,
               placed_by: str = "customer", today: Optional[str] = None) -> SiteRecord:
    """Pin the proposed BESS location. Distances are measured against `apn`, else the
    confirmed or shown candidate, else the candidate containing the pin."""
    rec = record.model_copy(deep=True)
    ctx = _ctx(rec, today)
    rec.flags = [f for f in rec.flags if f.origin != PIN_ORIGIN]
    pt = Point(lon, lat)
    ctx.add_field("g_pin", S_BESS, "BESS location on the map", "user_entry", {"lat": lat, "lon": lon},
                  display=f"{lat:.6f}, {lon:.6f}", status="provided", confidence="medium",
                  note=f"Placed on the map by {placed_by} on {ctx.today}.")
    cand = _parcel_for_pin(rec, pt, apn)
    if cand is None or not cand.geometry:
        ctx.add_needed("g_dist", S_BESS, "Distances to lot lines, buildings, public ways",
                       "The pin is not on a candidate parcel, and no parcel is confirmed. Confirm the APN or move the pin.",
                       "EQORE")
        ctx.flag("warn", "BESS pin is not on any candidate parcel",
                 "Distances can't be computed until the pin sits on the confirmed parcel.", "g_pin", origin=PIN_ORIGIN)
        return _finish(ctx)

    lot = shape(cand.geometry)
    inside_lot = lot.contains(pt)
    lot_pt = nearest_points(lot.exterior if lot.geom_type == "Polygon" else lot.boundary, pt)[0]
    d_lot = round(geo.to_ca(lot.boundary).distance(geo.to_ca(pt)), 1)

    bld = next((f for f in cand.fields if f.id == "b_bld"), None)
    near = None
    for b in (bld.value if bld and isinstance(bld.value, list) else []):
        if not b.get("geometry"):
            continue
        g = shape(b["geometry"])
        inside_b = g.contains(pt)
        d = 0.0 if inside_b else round(geo.to_ca(g).distance(geo.to_ca(pt)), 1)
        if near is None or d < near["d"]:
            bp = pt if inside_b else nearest_points(g, pt)[0]
            near = {"d": d, "id": b.get("id"), "inside": inside_b, "pt": bp, "area": b.get("area_sqft"),
                    "on_lot": (b.get("pct_inside") or 0) >= 50}
    ft = geo.FT_PER_M
    value: dict[str, Any] = {
        "apn": str(cand.apn.value), "inside_lot": inside_lot,
        "to_lot_line_ft": round(d_lot * ft, 1), "lot_line_point": {"lat": lot_pt.y, "lon": lot_pt.x},
        "to_nearest_building_ft": round(near["d"] * ft, 1) if near else None,
        "nearest_building_id": near["id"] if near else None,
        "inside_building": near["inside"] if near else None,
        "building_point": {"lat": near["pt"].y, "lon": near["pt"].x} if near else None,
        "public_way": None, "vegetation": None, "combustibles": None,
    }
    parts = [f"{'Inside' if inside_lot else 'OUTSIDE'} APN {cand.apn.value}",
             f"{value['to_lot_line_ft']:.0f} ft to the nearest lot line"]
    if near:
        parts.append("inside building footprint " + str(near["id"]) if near["inside"]
                     else f"{value['to_nearest_building_ft']:.0f} ft to building {near['id']}"
                     + ("" if near["on_lot"] else " (mostly on a neighboring lot)"))
    else:
        parts.append("no building footprints loaded for this parcel")
    ctx.add_field("g_dist", S_BESS, "Distances to lot lines, buildings, public ways", "computed", value,
                  display="; ".join(parts), status="confirm", confidence="low", who="EQORE",
                  note=SCREENING + " Public ways, vegetation and combustibles are not in any layer loaded; "
                                   "check them on the aerial or in photos.")
    if not inside_lot:
        ctx.flag("warn", "BESS pin is outside the parcel",
                 f"The pin is {value['to_lot_line_ft']:.0f} ft outside APN {cand.apn.value}. Equipment on another lot "
                 "needs that owner's agreement.", "g_pin", "g_dist", origin=PIN_ORIGIN)
    if near and near["inside"]:
        ctx.flag("info", "BESS pin is inside a building footprint",
                 "Indoor or rooftop placement? Set the placement type; indoor ESS rules differ.", "g_pin", "g_type",
                 origin=PIN_ORIGIN)
    if cand.apn.value != rec.confirmed_apn:
        ctx.flag("info", "Distances use an unconfirmed parcel",
                 f"Measured against candidate APN {cand.apn.value}; they change if another parcel is confirmed.",
                 "g_dist", origin=PIN_ORIGIN)
    return _finish(ctx)


def clear_bess(record: SiteRecord, today: Optional[str] = None) -> SiteRecord:
    rec = record.model_copy(deep=True)
    ctx = _ctx(rec, today)
    rec.flags = [f for f in rec.flags if f.origin != PIN_ORIGIN]
    rec.fields = [f for f in rec.fields if f.id not in ("g_pin", "g_dist")]
    rec.missing = [m for m in rec.missing if m.field_id not in ("g_pin", "g_dist")]
    return _finish(ctx)


EDITABLE_STATUSES = ("needed", "confirm", "provided")
NOT_ENTERABLE = {"g_pin", "g_dist", "a_apn", "b_apn"}   # use place_bess / confirm instead


def enter_values(record: SiteRecord, values: dict[str, Any], entered_by: str = "customer",
                 today: Optional[str] = None) -> SiteRecord:
    """Record values a person typed in. Unknown or computed-only field ids raise ValueError."""
    rec = record.model_copy(deep=True)
    ctx = _ctx(rec, today)
    labels = {r.id: (r.section, r.label) for r in REQUIRED}
    for fid, v in values.items():
        if fid in NOT_ENTERABLE:
            raise ValueError(f"{fid} is set by place_bess / confirm_apn, not enter_values")
        old = rec.field(fid)
        if old is None and fid not in labels:
            raise ValueError(f"unknown field id {fid!r}")
        if old is not None and old.status not in EDITABLE_STATUSES:
            raise ValueError(f"{fid} is auto-filled ({old.status}); it can't be overwritten here")
        if v is None or v == "":
            continue
        sec, label = (old.section, old.label) if old else labels[fid]
        prev = f" Replaces: {old.display} ({old.source_label})." if old and old.status != "needed" else ""
        ctx.add_field(fid, sec, label, "user_entry", v, display=str(v), status="provided", confidence="medium",
                      note=f"Entered by {entered_by} on {ctx.today}.{prev}")
    return _finish(ctx)
