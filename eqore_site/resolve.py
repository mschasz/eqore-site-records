"""Candidate-parcel bookkeeping and resolution flags (handoff §5).

- `add_candidate` merges a parcel from any layer into the record's list
  (same APN from two layers -> one candidate, `found_in` lists both; condo
  units with identical polygons collapse into `related_apns`).
- `finalize` sorts, raises conflict flags, and, when exactly one county-layer
  situs match exists, shows that candidate's parcel-level facts at record
  level with status `confirm`. It never sets `confirmed_apn`.

Full resolution (nearest-lot search, straddle checks against county layers for
every candidate) is build step 4."""

from __future__ import annotations

import re

from .context import S_ID, S_PARCEL, Ctx
from .schema import Candidate, Field
from .sources import SOURCES

METHOD_NOTE = {
    "situs_address": "Situs address matches the entered house number and street.",
    "point_in_polygon": "Contains the geocoded point (not an address match).",
    "situs_partial": "House number and street name match, but the street suffix or direction differs.",
    "nearest_address": "Closest existing house number on the same street.",
    "nearby": "Within {m} m of the geocoded point.",
    "apn_lookup": "Looked up by the APN a person supplied; not found by address or location.",
}
ORDER = {"situs_address": 0, "situs_partial": 1, "point_in_polygon": 2, "nearest_address": 3, "nearby": 4,
         "apn_lookup": 5}
STATEWIDE = "dwr_lightbox_parcels"


def apn_key(apn: str) -> tuple:
    """Compare APNs across formats: '463-105-1' == '463-0105-001-00'; '4060/001' == '4060001'."""
    s = str(apn).strip().upper()
    if "-" in s:
        parts = [int(x) if x.isdigit() else x for x in s.split("-")]
        while parts and parts[-1] == 0:
            parts.pop()
        return tuple(parts)
    return (re.sub(r"[^0-9A-Z]", "", s),)


def entered_house(ctx: Ctx) -> str | None:
    return ctx.addr.house or None


def add_candidate(ctx: Ctx, cand: Candidate, geom=None) -> Candidate:
    cands = ctx.record.candidates
    key = apn_key(cand.apn.value)
    for c in cands:
        if apn_key(c.apn.value) == key:
            _merge(c, cand)
            return c
        if key in map(apn_key, c.related_apns):   # a unit APN already folded into this polygon
            for s in cand.found_in:
                if s not in c.found_in:
                    c.found_in.append(s)
            return c
    if geom is not None and cand.match_method == "nearby":
        wkb = geom.normalize().wkb
        shapes = ctx.shared.setdefault("_cand_shapes", {})
        if wkb in shapes:
            shapes[wkb].related_apns.append(cand.apn.value)
            return shapes[wkb]
        shapes[wkb] = cand
    cands.append(cand)
    return cand


def _merge(existing: Candidate, new: Candidate) -> None:
    """Keep the better match method; prefer county-layer values over statewide."""
    for s in new.found_in:
        if s not in existing.found_in:
            existing.found_in.append(s)
    for s in new.situs_matched_by:
        if s not in existing.situs_matched_by:
            existing.situs_matched_by.append(s)
    county_new = STATEWIDE not in new.found_in
    if ORDER[new.match_method] < ORDER[existing.match_method]:
        existing.match_method = new.match_method
    if county_new:
        existing.apn, existing.situs = new.apn, new.situs
        existing.area_sqft = new.area_sqft or existing.area_sqft
        existing.geometry = new.geometry or existing.geometry
        existing.distance_m = new.distance_m if new.distance_m is not None else existing.distance_m
        existing.contains_point = new.contains_point or existing.contains_point
        existing.note = new.note
    existing.fields = existing.fields + [f for f in new.fields if f.id not in {x.id for x in existing.fields}]


def finalize(ctx: Ctx) -> None:
    rec = ctx.record
    cands = rec.candidates
    for c in cands:
        if c.related_apns:
            c.note += (f" {len(c.related_apns)} more APN(s) share this exact polygon (condo or unit parcels): "
                       + ", ".join(c.related_apns[:5]) + (" ..." if len(c.related_apns) > 5 else "") + ".")
    # address matches first, then partial matches, then the lot under the point, then the rest by distance
    cands.sort(key=lambda c: (min(ORDER[c.match_method], 3), c.distance_m if c.distance_m is not None else 1e9))

    a = ctx.addr
    house, street, city = a.house, a.street.title(), a.city.title()
    located_by_situs = ctx.record.location is not None and ctx.record.location.source == STATEWIDE

    if not cands:
        ctx.add_needed("b_apn", S_PARCEL, "APN", "No parcel found by situs or near the point.", "Customer")
    else:
        disp = "; ".join(f"{c.apn.value} ({c.situs.value}, {c.match_method.replace('_', ' ')}"
                         + (f", {c.distance_m:.0f} m" if c.distance_m else "") + ")" for c in cands[:6])
        ctx.add_field("b_apn", S_PARCEL, "APN candidates", cands[0].apn.source, [c.apn.value for c in cands],
                      display=disp, status="confirm", confidence="low", who="Customer",
                      note="Candidates only. None is selected until a person confirms the APN.")
    ctx.add_needed("a_apn", S_ID, "APN confirmed by customer",
                   "Candidate parcels are listed; the customer confirms which lot the equipment goes on.", "Customer")

    situs = [c for c in cands if c.match_method == "situs_address"]
    partial = [c for c in cands if c.match_method == "situs_partial"]
    if house and not situs:
        nearest = min((c for c in cands if c.distance_m is not None), key=lambda c: c.distance_m, default=None)
        extra = (f" The geocoded point is {nearest.distance_m:.0f} m from {nearest.situs.value} "
                 f"(APN {nearest.apn.value})." if nearest and nearest.distance_m else "")
        part = (" Partial matches (same number and street name, different suffix or direction): "
                + ", ".join(f"{c.situs.value} (APN {c.apn.value})" for c in partial) + "." if partial else "")
        ctx.flag("warn", f"No parcel carries house number {house}",
                 f"No parcel layer queried has a lot with situs {house} {street} in {city}.{extra}{part} "
                 "A typo is possible; ask the customer to confirm the address or APN.", "b_apn", "a_apn")
    elif partial:
        ctx.flag("info", "Same number on a similarly named street",
                 ", ".join(f"{c.situs.value} (APN {c.apn.value})" for c in partial)
                 + f" also carries number {house}. Make sure the customer meant {street}.", "b_apn")
    if len(situs) > 1:
        detail = "; ".join(f"{c.apn.value} (situs match in {', '.join(c.situs_matched_by)})" for c in situs)
        ctx.flag("warn", f"{len(situs)} parcels match the situs address",
                 f"{house} {street}: {detail}. Layers may disagree, or one building spans several tax parcels.",
                 "b_apn")
    far = [c for c in situs if c.distance_m is not None and c.distance_m > FAR_M]
    if far and not located_by_situs:
        ctx.flag("warn", "Address match is far from the geocoded point",
                 "; ".join(f"APN {c.apn.value} is {c.distance_m:.0f} m away" for c in far)
                 + ". Hazard and utility lookups used the geocoded point; check they still apply.", "a_ll", "b_apn")
    if cands and not any(c.contains_point for c in cands):
        ctx.flag("info", "Geocoded point is not inside any parcel",
                 "The point likely sits in the street right-of-way. Use the candidate list, not the point.", "a_ll")
    elif situs and any(c.contains_point and c.match_method != "situs_address" for c in cands):
        ctx.flag("warn", "Point and situs address point to different parcels",
                 "The parcel containing the geocoded point is not the one whose situs matches the address.", "b_apn")

    # Show parcel-level facts for a single county-layer situs match (not a selection).
    county = [c for c in situs if any(s != STATEWIDE for s in c.situs_matched_by)]
    if len(county) == 1 and county[0].fields:
        show_candidate(ctx, county[0], confirmed=False)
        ctx.flag("info", f"Parcel-level values shown for APN {county[0].apn.value}",
                 "It is the only county-layer parcel whose situs matches the address. Values are marked "
                 "Confirm until the customer confirms the APN.", "b_apn")

    want = ctx.shared.get("confirmed_apn")
    if want:
        try:
            confirm_in_place(ctx, want, ctx.shared.get("confirmed_by") or "customer")
        except ValueError as e:
            ctx.flag("warn", f"Confirmed APN {want} not found", str(e), "a_apn", "b_apn")


FAR_M = 150
HOW = {"situs_address": "an address match", "situs_partial": "a partial address match",
       "point_in_polygon": "containing the geocoded point", "nearest_address": "the nearest existing house number",
       "nearby": "proximity to the geocoded point", "apn_lookup": "the APN a person supplied"}


def show_candidate(ctx: Ctx, cand: Candidate, confirmed: bool) -> None:
    """Copy a candidate's parcel-level fields to record level. Unconfirmed: status Confirm."""
    rec = ctx.record
    if rec.shown_candidate and apn_key(rec.shown_candidate) != apn_key(cand.apn.value):
        _unshow(ctx)
    fields = list(cand.fields)
    if cand.geometry and not any(f.id == "b_geom" for f in fields):
        n = sum(len(r) - 1 for poly in ([cand.geometry["coordinates"]] if cand.geometry["type"] == "Polygon"
                                        else cand.geometry["coordinates"]) for r in poly)
        v = cand.apn
        fields.append(Field(value=cand.geometry, source=v.source, source_label=v.source_label,
                            source_url=v.source_url, vintage=v.vintage, confidence=v.confidence,
                            note="Parcel polygon (GeoJSON, EPSG:4326). Assessor lines are not a survey.",
                            id="b_geom", section=S_PARCEL, label="Parcel boundary",
                            display=f"{n}-vertex polygon", status="filled"))
    for f in fields:
        g = f.model_copy()
        if confirmed:
            g.note = f"Confirmed parcel APN {cand.apn.value}. " + g.note
        else:
            if g.status == "filled":
                g.status = "confirm"
                g.who = g.who or "Customer"
            g.note = f"For candidate APN {cand.apn.value} (situs match, not confirmed). " + g.note
        old = rec.field(g.id)
        if g.id == "z_zone" and old is not None and old.source == "abag_zoning_draft":
            rec.fields.append(old.model_copy(update={"id": "z_zone_regional",
                                                     "label": "Zoning (regional draft, cross-check)"}))
        rec.fields = [x for x in rec.fields if x.id != g.id] + [g]
        rec.missing = [m for m in rec.missing if m.field_id != g.id]
        if g.status == "needed" and g.who:
            ctx.add_missing(g.label, g.note, g.who, g.id)
    rec.shown_candidate = str(cand.apn.value)


def _unshow(ctx: Ctx) -> None:
    """Remove the previously shown candidate's fields and restore the generic ones."""
    from .needed import add_needed
    rec = ctx.record
    prev = next((c for c in rec.candidates if apn_key(c.apn.value) == apn_key(rec.shown_candidate)), None)
    ids = ({f.id for f in prev.fields} | {"b_geom"}) if prev else {"b_geom"}
    rec.fields = [f for f in rec.fields if f.id not in ids]
    rec.missing = [m for m in rec.missing if m.field_id not in ids]
    reg = rec.field("z_zone_regional")
    if "z_zone" in ids and reg is not None:
        rec.fields = [f for f in rec.fields if f.id != "z_zone_regional"] + [
            reg.model_copy(update={"id": "z_zone", "label": "Zoning"})]
    rec.flags = [f for f in rec.flags if not f.title.startswith("Parcel-level values shown for")]
    rec.shown_candidate = None
    add_needed(ctx)


def confirm_in_place(ctx: Ctx, apn: str, confirmed_by: str = "customer") -> Candidate:
    rec = ctx.record
    cand = next((c for c in rec.candidates if apn_key(c.apn.value) == apn_key(apn)
                 or apn_key(apn) in map(apn_key, c.related_apns)), None)
    if cand is None:
        raise ValueError(f"APN {apn} is not among the candidates ("
                         + ", ".join(str(c.apn.value) for c in rec.candidates) + "). Check the number, or run "
                         "build_site_record(..., confirmed_apn=...) so county layers look it up.")
    show_candidate(ctx, cand, confirmed=True)
    ctx.add_field("a_apn", S_ID, "APN confirmed by customer", "confirmation", str(cand.apn.value),
                  status="provided", confidence="high",
                  note=f"Confirmed by {confirmed_by} on {ctx.today}. The parcel was found by "
                       f"{HOW[cand.match_method]} in {'; '.join(SOURCES[s].label for s in cand.found_in)}.")
    others = [str(c.apn.value) for c in rec.candidates if c is not cand]
    b = rec.field("b_apn")
    if b is not None:
        ctx.add_field("b_apn", S_PARCEL, "APN", cand.apn.source, str(cand.apn.value),
                      display=f"{cand.apn.value} (confirmed; {len(others)} other candidate(s) set aside)",
                      status="provided", confidence="high", vintage=cand.apn.vintage, note=cand.note)
    rec.flags = [f for f in rec.flags if not f.title.startswith("Parcel-level values shown for")]
    if cand.distance_m:
        ctx.flag("warn" if cand.distance_m > FAR_M else "info",
                 "Point lookups used the geocoded point, not the confirmed parcel",
                 f"The geocoded point is {cand.distance_m:.0f} m from APN {cand.apn.value}. Hazard, fire, utility "
                 "and regional zoning values were queried at that point; re-check them for the parcel.", "a_apn")
    rec.confirmed_apn = str(cand.apn.value)
    rec.status = "confirmed"
    return cand


def confirm_apn(record, apn: str, confirmed_by: str = "customer", today: str | None = None):
    """Offline: return a copy of `record` with `apn` confirmed (must be one of its candidates).

    The confirmed candidate's parcel-level fields move to record level with their own
    statuses, `a_apn` becomes `provided`, and `status` becomes `confirmed`. Raises
    ValueError if the APN is not a candidate."""
    rec = record.model_copy(deep=True)
    from . import crosscheck
    from .needed import finish
    ctx = Ctx(record=rec, client=None, **({"today": today} if today else {}))  # type: ignore[arg-type]
    confirm_in_place(ctx, apn, confirmed_by)
    crosscheck.run(ctx)
    finish(rec)
    return rec
