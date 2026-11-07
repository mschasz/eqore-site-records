"""San Francisco adapter (county FIPS 06075), DataSF Socrata datasets.

- acdm-wktn parcels: situs ranges, city zoning, polygons
- ynuv-fyni building footprints: polygons + 2010 LiDAR height stats
- 96ck-qcfe energy benchmarking: floor area, year built, use, grid electricity
- i98e-djp9 DBI building permits: occupancy, construction type, stories, recent work

Request patterns verified live on 2026-11-07 (see docs/DATA_SOURCES.md):
- `from_address_num`/`to_address_num` are TEXT and SoQL has no to_number(), so
  numeric range filters fail (HTTP 400) or compare lexically. We fetch the
  street's active parcels and filter ranges in Python.
- `active=true` works (boolean column).
- `within_circle()` returns nothing on polygon columns; `intersects(shape, WKT)`
  works, so "nearby" uses a small square polygon.
- Numbered streets: parcels '04TH', permits '04th' (lower-case, zero-padded),
  benchmarking '4TH' (not padded).
"""

from __future__ import annotations

import re
from datetime import date, timedelta

from shapely.geometry import mapping

from .. import geo, resolve
from ..context import S_PARCEL, S_ZONING, S_ELEC, Ctx
from ..schema import Candidate, Field
from .base import soql, sql_str

P, F, B, D = "sf_parcels", "sf_footprints", "sf_benchmark", "sf_permits"
NEAR_HALF_M = 30
ENRICH_MAX = 3
PARCEL_COLS = ("blklot,from_address_num,to_address_num,street_name,street_type,zoning_code,zoning_district,"
               "in_asr_secured_roll,data_as_of")


def padded(street: str) -> str:
    """Census '4TH' -> SF parcel/permit spelling '04TH'."""
    return "0" + street if re.fullmatch(r"\d(ST|ND|RD|TH)", street or "") else street


def _int(s) -> int | None:
    try:
        return int(str(s).strip())
    except (TypeError, ValueError):
        return None


def _situs(r: dict) -> str:
    a, b = r.get("from_address_num"), r.get("to_address_num")
    num = a if a == b or not b else f"{a}-{b}"
    return f"{num} {r.get('street_name') or ''} {r.get('street_type') or ''}".strip()


def _date(s: str | None) -> str | None:
    return s[:10] if s else None


# ---------------------------------------------------------------------------------------------
def run(ctx: Ctx) -> None:
    house, street, stype = resolve.entered_house(ctx), padded(ctx.addr.name), ctx.addr.suffix
    p = ctx.point

    parcels: dict[str, dict] = {}
    situs_ids: dict[str, str] = {}   # blklot -> 'exact' | 'partial'(street type differs)
    n = _int(house)
    if n is not None and street:
        rows = soql(ctx, P, select="blklot,from_address_num,to_address_num,street_type",
                    where=f"street_name={sql_str(street)} AND active=true", limit=5000)
        for r in rows:
            lo, hi = _int(r.get("from_address_num")), _int(r.get("to_address_num"))
            if lo is not None and hi is not None and lo <= n <= max(lo, hi):
                same = not stype or not r.get("street_type") or r["street_type"] == stype
                situs_ids[r["blklot"]] = "exact" if same else "partial"

    for r in soql(ctx, P, select=PARCEL_COLS + ",shape",
                  where=f"intersects(shape,'{geo.box_wkt(p.lat, p.lon, NEAR_HALF_M)}') AND active=true", limit=500):
        parcels[r["blklot"]] = r

    # situs matches outside the box, and statewide candidates SF should weigh in on
    want = set(situs_ids) | {str(c.apn.value) for c in ctx.record.candidates if re.fullmatch(r"\d{4}[0-9A-Z]{3,4}", str(c.apn.value))}
    if re.fullmatch(r"\d{4}[0-9A-Z]{3,4}", re.sub(r"[^0-9A-Z]", "", str(ctx.shared.get("confirmed_apn") or "").upper())):
        want.add(re.sub(r"[^0-9A-Z]", "", ctx.shared["confirmed_apn"].upper()))
    want -= set(parcels)
    if want:
        ids = ",".join(sql_str(x) for x in sorted(want))
        for r in soql(ctx, P, select=PARCEL_COLS + ",shape", where=f"blklot in({ids}) AND active=true"):
            parcels[r["blklot"]] = r

    conf = re.sub(r"[^0-9A-Z]", "", str(ctx.shared.get("confirmed_apn") or "").upper())
    enriched = 0
    vint_p = None
    for blklot, r in parcels.items():
        g = geo.from_geojson(r.get("shape"))
        if g is None or g.is_empty:
            continue
        vint_p = _date(r.get("data_as_of"))
        dist = geo.distance_m(g, p.lon, p.lat)
        is_conf = blklot == conf
        method = ({"exact": "situs_address", "partial": "situs_partial"}[situs_ids[blklot]] if blklot in situs_ids
                  else "point_in_polygon" if dist == 0
                  else "apn_lookup" if is_conf and dist > NEAR_HALF_M * 1.5 else "nearby")
        area = geo.area_sqft(g)
        fields = _parcel_fields(ctx, r, area, vint_p)
        cand = Candidate(
            apn=ctx.value(P, blklot, confidence="high", vintage=vint_p, note="SF block-lot (Assessor APN)."),
            situs=ctx.value(P, _situs(r), confidence="high", vintage=vint_p),
            match_method=method, distance_m=dist, contains_point=dist == 0,
            area_sqft=ctx.value("computed", area, confidence="high", note="Computed from the SF parcel polygon in EPSG:3310."),
            geometry=mapping(g), found_in=[P], situs_matched_by=[P] if method == "situs_address" else [],
            fields=fields, note=resolve.METHOD_NOTE[method].format(m=NEAR_HALF_M),
        )
        merged = resolve.add_candidate(ctx, cand, geom=g)
        if r.get("street_name") == "UNKNOWN" and resolve.STATEWIDE in merged.situs_matched_by:
            ctx.flag("warn", f"Parcel layers disagree on APN {blklot}'s address",
                     f"The statewide LightBox layer lists APN {blklot} at the entered address; the SF parcel layer "
                     f"has no street address for it (situs '{_situs(r)}'). It may be a small adjoining lot.", "b_apn")
        if is_conf or (method in ("situs_address", "situs_partial", "point_in_polygon") and enriched < ENRICH_MAX):
            enriched += 1
            _enrich(ctx, merged, g)

    ctx.status(P, "retrieved" if parcels else "no_result",
               f"{len(situs_ids)} situs match(es) ({', '.join(sorted(situs_ids)) or 'none'}), "
               f"{len(parcels)} parcel(s) considered", vintage=f"data_as_of {vint_p}" if vint_p else None)


def _parcel_fields(ctx: Ctx, r: dict, area: int, vint: str | None) -> list[Field]:
    out = [_f(ctx, "b_area", S_PARCEL, "Parcel area", P, area,
              f"{area:,} sq ft ({area / 43560:.2f} acres)", "filled", "high", vint,
              "Computed from the SF parcel polygon.")]
    if r.get("zoning_code"):
        out.append(_f(ctx, "z_zone", S_ZONING, "Zoning", P,
                      {"code": r["zoning_code"], "district": r.get("zoning_district")},
                      f"{r['zoning_code']}, {(r.get('zoning_district') or '').title()}", "filled", "high", vint,
                      "City zoning as carried on the parcel record (dataset says it reflects current zoning)."))
    if r.get("in_asr_secured_roll") is False:
        out.append(_f(ctx, "b_roll", S_PARCEL, "On Assessor secured roll", P, False, "Not on the current secured roll",
                      "confirm", "high", vint, "Parcel may be exempt, public, or recently changed.", who="EQORE"))
    return out


def _f(ctx, fid, sec, label, src, value, display, status, conf, vint, note, who=None) -> Field:
    v = ctx.value(src, value, confidence=conf, note=note, vintage=vint)
    return Field(**v.model_dump(), id=fid, section=sec, label=label, display=display, status=status, who=who)


# ---------------------------------------------------------------------------------------------
def _enrich(ctx: Ctx, cand: Candidate, parcel) -> None:
    blklot = str(cand.apn.value)
    blk, lot = blklot[:4], blklot[4:]
    facts: dict = {}
    for src, fn in ((F, _footprints), (B, _benchmark), (D, _permits)):
        try:
            fn(ctx, cand, parcel, blk, lot, facts)
        except Exception as e:  # noqa: BLE001 - one dataset failing must not stop the others
            ctx.error(src, e)
    _cross_checks(ctx, cand, facts)


def _footprints(ctx, cand, parcel, blk, lot, facts) -> None:
    rows = soql(ctx, F, select="sf16_bldgid,mblr,hgt_median_m,gnd_min_m,peak_1st_m,data_as_of,shape",
                where=f"intersects(shape,'{geo.bbox_wkt(parcel)}')", limit=300)
    bl = []
    for r in rows:
        g = geo.from_geojson(r.get("shape"))
        if g is None or g.is_empty:
            continue
        pct = geo.overlap_pct(g, parcel)
        if pct < 1:
            continue
        h = float(r["hgt_median_m"]) if r.get("hgt_median_m") else None
        peak = (float(r["peak_1st_m"]) - float(r["gnd_min_m"])) if r.get("peak_1st_m") and r.get("gnd_min_m") else None
        bl.append({"id": r.get("sf16_bldgid"), "mblr": r.get("mblr"), "area_sqft": geo.area_sqft(g),
                   "pct_inside": pct, "height_median_ft": round(h * geo.FT_PER_M, 1) if h is not None else None,
                   "peak_above_ground_ft": round(peak * geo.FT_PER_M, 1) if peak is not None else None,
                   "_inside_sqft": geo.area_sqft(g.intersection(parcel)), "geometry": mapping(g)})
    bl.sort(key=lambda b: -b["area_sqft"])
    vint = "2010 model; data_as_of " + (_date(rows[0].get("data_as_of")) or "?") if rows else None
    if not bl:
        cand.fields.append(_f(ctx, "b_bld", S_PARCEL, "Buildings on the lot", F, [], "No footprint on this lot",
                              "confirm", "medium", vint, "Footprints are from a 2010 model; newer buildings may be missing.",
                              who="Customer"))
        ctx.status(F, "no_result", f"No footprint on {cand.apn.value}")
        return
    on = [b for b in bl if b["pct_inside"] >= 50]
    covered = sum(b["_inside_sqft"] for b in bl)
    lot_area = cand.area_sqft.value if cand.area_sqft else None
    facts["footprint_main_sqft"] = on[0]["area_sqft"] if on else None
    disp = "; ".join(f"{b['area_sqft']:,} sq ft ({b['pct_inside']:.0f}% inside)" for b in bl[:5])
    for b in bl:
        b.pop("_inside_sqft")
    cand.fields.append(_f(ctx, "b_bld", S_PARCEL, "Buildings on the lot", F, bl, disp, "confirm", "medium", vint,
                          "Areas computed from footprint polygons; % is the share of each footprint inside this lot.",
                          who="Customer"))
    if lot_area:
        cand.fields.append(_f(ctx, "b_cov", S_PARCEL, "Site coverage", "computed", round(100 * covered / lot_area),
                              f"About {100 * covered / lot_area:.0f}% of the lot", "filled", "medium", vint,
                              "Footprint area inside the lot divided by lot area."))
    if on and on[0]["height_median_ft"] is not None:
        m = on[0]
        cand.fields.append(_f(ctx, "b_height", S_PARCEL, "Building height and stories", F,
                              {"height_median_ft": m["height_median_ft"], "peak_above_ground_ft": m["peak_above_ground_ft"]},
                              f"Median roof about {m['height_median_ft']:.0f} ft; highest return about "
                              f"{m['peak_above_ground_ft']:.0f} ft above ground" if m["peak_above_ground_ft"] else
                              f"Median roof about {m['height_median_ft']:.0f} ft",
                              "confirm", "low", vint,
                              "From 2010 aerial LiDAR statistics; the peak can be a parapet, tree or equipment. "
                              "Stories come from permits, not this layer.", who="Customer"))
    for b in bl:
        if 5 < b["pct_inside"] < 95 and b["area_sqft"] > 500:
            ctx.flag("warn" if b["pct_inside"] >= 50 else "info",
                     f"A building straddles APN {cand.apn.value}'s lot line",
                     f"Footprint {b['id']} ({b['area_sqft']:,} sq ft) is {b['pct_inside']:.0f}% inside the lot.", "b_bld")
    ctx.status(F, "retrieved", f"{len(bl)} footprint(s) touch {cand.apn.value}", vintage=vint)


def _benchmark(ctx, cand, parcel, blk, lot, facts) -> None:
    rows = soql(ctx, B, select="parcel_number,building_name,building_address,floor_area,property_type,category,"
                "year_built,benchmark_year,electricity_use_grid_purchase,site_energy_use,benchmark_status",
                where=f"parcel_number={sql_str(blk + '/' + lot)}", order="benchmark_year DESC", limit=20)
    if not rows:
        cand.fields.append(_f(ctx, "f_kwh", S_ELEC, "Annual electricity use", B, None, "No benchmarking record",
                              "needed", "low", None, "Not a covered building (non-residential under 10,000 sq ft "
                              "is exempt) or not reported. 12 months of bills needed.", who="Customer"))
        ctx.status(B, "no_result", f"No benchmarking record for {blk}/{lot}")
        return
    latest = rows[0]
    y = latest.get("benchmark_year")
    vint = f"benchmark year {y}"
    elec = [(r.get("benchmark_year"), float(r["electricity_use_grid_purchase"]))
            for r in rows if r.get("electricity_use_grid_purchase")]
    if latest.get("floor_area"):
        facts["floor_area"] = float(latest["floor_area"])
        cand.fields.append(_f(ctx, "b_floor", S_PARCEL, "Reported floor area", B, facts["floor_area"],
                              f"{facts['floor_area']:,.0f} sq ft", "filled", "medium", vint,
                              "Gross floor area reported to the city's benchmarking program."))
    if latest.get("year_built"):
        cand.fields.append(_f(ctx, "b_year", S_PARCEL, "Year built", B, _int(latest["year_built"]), latest["year_built"],
                              "filled", "medium", vint, "As reported for benchmarking."))
    if latest.get("property_type"):
        cand.fields.append(_f(ctx, "b_use", S_PARCEL, "Current use", B, latest["property_type"],
                              f"{latest['property_type']} ({latest.get('building_name') or ''})".replace(" ()", ""),
                              "filled", "medium", vint, f"Benchmarking property type; status '{latest.get('benchmark_status')}'."))
    if elec:
        facts["elec"] = elec
        cand.fields.append(_f(ctx, "f_kwh", S_ELEC, "Annual electricity use", B,
                              [{"year": yy, "grid_purchase": v} for yy, v in elec],
                              "; ".join(f"{v:,.0f} ({yy})" for yy, v in elec[:3]) + " grid purchase",
                              "confirm", "medium", vint,
                              "Annual grid purchase from city benchmarking. Units are not stated in the dataset "
                              "(Portfolio Manager reports electricity in kWh). Sizing still needs 15-minute interval data.",
                              who="Customer"))
        if len(elec) >= 2 and elec[-1][1] > 0:
            change = (elec[0][1] - elec[-1][1]) / elec[-1][1]
            if abs(change) >= 0.4:
                ctx.flag("info", f"Grid electricity {'fell' if change < 0 else 'rose'} {abs(change):.0%} "
                                 f"from {elec[-1][0]} to {elec[0][0]}",
                         f"APN {cand.apn.value}: {elec[-1][1]:,.0f} -> {elec[0][1]:,.0f}. Could be new solar, a change "
                         "of tenant or vacancy. Ask before sizing from benchmarking data.", "f_kwh")
    ctx.status(B, "retrieved", f"{len(rows)} year(s) for {blk}/{lot}, latest {y}", vintage=vint)


def _permits(ctx, cand, parcel, blk, lot, facts) -> None:
    rows = soql(ctx, D, select="permit_number,permit_type_definition,status,filed_date,issued_date,completed_date,"
                "description,existing_use,proposed_use,existing_occupancy,existing_construction_type,"
                "existing_construction_type_description,number_of_existing_stories,estimated_cost",
                where=f"block={sql_str(blk)} AND lot={sql_str(lot)}", order="filed_date DESC", limit=100)
    # Socrata sorts NULL filed_date first under DESC; put undated permits last.
    rows.sort(key=lambda r: r.get("filed_date") or "", reverse=True)
    if not rows:
        ctx.status(D, "no_result", f"No permits for {blk}/{lot}")
        return
    latest = _date(rows[0].get("filed_date"))
    top = [{k: r.get(k) for k in ("permit_number", "permit_type_definition", "status", "filed_date", "description")}
           for r in rows[:5]]
    cand.fields.append(_f(ctx, "b_permits", S_PARCEL, "Recent building permits", D, top,
                          f"{len(rows)} permits; latest filed {latest}: {(rows[0].get('description') or '')[:90]}",
                          "filled", "high", f"latest filed {latest}", "DBI permits on this block/lot, newest first."))
    occ = next((r for r in rows if r.get("existing_occupancy")), None)
    if occ:
        stories = _int(occ.get("number_of_existing_stories"))
        facts["stories"] = stories
        ct = occ.get("existing_construction_type_description") or occ.get("existing_construction_type") or "?"
        ct = re.sub(r"(?i)^constr(uction)? type\s*", "Type ", ct)
        cand.fields.append(_f(ctx, "b_occ", S_PARCEL, "Occupancy group, construction type, sprinklers", D,
                              {"occupancy": occ["existing_occupancy"], "construction_type": ct, "stories": stories,
                               "existing_use": occ.get("existing_use"), "permit": occ.get("permit_number")},
                              f"Occupancy {occ['existing_occupancy']}; construction {ct}; {stories} stor"
                              f"{'y' if stories == 1 else 'ies'}; use '{occ.get('existing_use')}'",
                              "confirm", "medium", f"permit filed {_date(occ.get('filed_date'))}",
                              "From the most recent permit that lists them. Sprinklers are not in this dataset.",
                              who="Customer"))
    cutoff = (date.fromisoformat(ctx.today) - timedelta(days=5 * 365)).isoformat()
    recent_stories = {(_int(r.get("number_of_existing_stories"))) for r in rows
                      if (_date(r.get("filed_date")) or "") >= cutoff and _int(r.get("number_of_existing_stories"))}
    if len(recent_stories) > 1:
        ctx.flag("warn", "Permits disagree on the number of stories",
                 f"APN {cand.apn.value}: permits filed since {cutoff[:4]} list "
                 + " and ".join(map(str, sorted(recent_stories))) + " existing stories. Confirm with the customer.",
                 "b_occ", "b_height")
    recent = [r for r in rows if (_date(r.get("filed_date")) or "") >=
              (date.fromisoformat(ctx.today) - timedelta(days=180)).isoformat()]
    if recent:
        ctx.flag("info", f"Permit activity in the last 6 months on APN {cand.apn.value}",
                 "; ".join(f"{_date(r.get('filed_date'))} {r.get('status')}: {(r.get('description') or '')[:80]}"
                           for r in recent[:3]) + ". Coordinate siting with ongoing work.", "b_permits")
    kw = re.compile(r"batter|energy storage|\bess\b|solar|photovoltaic|\bpv\b|generator", re.I)
    der = [r for r in rows if kw.search(r.get("description") or "")]
    if der:
        ctx.flag("info", "Permits mention solar, storage or generators",
                 "; ".join(f"{r.get('permit_number')} ({_date(r.get('filed_date'))}): {(r.get('description') or '')[:80]}"
                           for r in der[:3]), "f_der")
    ctx.status(D, "retrieved", f"{len(rows)} permit(s) for {blk}/{lot}, latest filed {latest}")


def _cross_checks(ctx: Ctx, cand: Candidate, facts: dict) -> None:
    fp, st, fa = facts.get("footprint_main_sqft"), facts.get("stories"), facts.get("floor_area")
    if fp and st and fa:
        est = fp * st
        diff = (est - fa) / fa
        if abs(diff) > 0.25:
            ctx.flag("warn", "Footprint × stories disagrees with reported floor area",
                     f"APN {cand.apn.value}: main footprint {fp:,} sq ft × {st} stories = {est:,.0f} sq ft, but "
                     f"benchmarking reports {fa:,.0f} sq ft ({diff:+.0%}). A mezzanine, partial upper floor or "
                     "stale record could explain it.", "b_bld", "b_floor", "b_occ")
