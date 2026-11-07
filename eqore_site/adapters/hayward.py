"""City of Hayward adapter (Alameda County 06001, city = Hayward). City OpenData ArcGIS.

- COH_Addresses: address points with APN (the authoritative "does this address exist?")
- COH_Parcels: APN, owner of record, situs, reported area, polygon
- COH_BuildingFootprints: polygons only; Bldg_AREA / BldgHeight_Mean / BaseElev_Mean read 0.0,
  so areas are computed from geometry and height stays unknown
- COH_Zoning: district + municipal code link; overlapping duplicate polygons are common

Request patterns verified live on 2026-11-07 (docs/DATA_SOURCES.md):
- house numbers are TEXT: `P_HouseNum=2448` -> HTTP 400; use `P_HouseNum='2448'`.
- some parcels have empty P_HouseNum/P_Street_Name but a filled P_ST_ADDRESS (2348 Industrial
  Pkwy W), so situs search checks both.
- the parcel layer also covers Union City, Castro Valley, Cherryland... (P_City).
- string equality is case-insensitive (address layer stores 'Industrial').
"""

from __future__ import annotations

from shapely.geometry import mapping

from .. import geo, resolve
from ..address import compare, parse_street
from ..context import S_ID, S_PARCEL, S_ZONING, Ctx
from ..schema import Candidate, Field
from .base import arcgis_query

PAR, ADDR, FP, ZON = "coh_parcels", "coh_addresses", "coh_footprints", "coh_zoning"
NEAR_M = 40
ENRICH_NEAR_M = 10      # also enrich "nearby" lots this close to the point
ENRICH_MAX = 4
PAR_OUT = "APN_PQ,OWNERCENSORED,P_HouseNum,P_Street_Name,P_Street_Type,P_Suffix_Dir,P_City,P_AREA,P_ST_ADDRESS,M_ST_ADDRESS,M_CITY,M_STATE,M_ZIP_FULL"


def _q(s: str) -> str:
    return s.replace("'", "''")


def _int(s) -> int | None:
    try:
        return int(str(s).strip())
    except (TypeError, ValueError):
        return None


def _county_apn(apn: str) -> str:
    """'463-105-1' or '463010500100' -> '463-0105-001-00' (APN_PQ format)."""
    s = apn.strip()
    if "-" not in s and s.isdigit() and len(s) == 12:
        return f"{s[:3]}-{s[3:7]}-{s[7:10]}-{s[10:]}"
    parts = (s.split("-") + ["0", "0", "0"])[:4]
    try:
        return f"{int(parts[0]):03d}-{int(parts[1]):04d}-{int(parts[2]):03d}-{int(parts[3]):02d}"
    except ValueError:
        return s


def run(ctx: Ctx) -> None:
    house = resolve.entered_house(ctx)
    street, stype, sdir = ctx.addr.name, ctx.addr.suffix, ctx.addr.sufdir
    p = ctx.point
    ctx.shared["coh_footprint_zero_flagged"] = False

    # 1. Address points on the entered street ---------------------------------------------------
    addr_by_apn: dict[str, dict] = {}
    exact_apns: list[str] = []
    partial_apns: list[str] = []
    neighbor_apns: list[tuple[str, dict]] = []
    if street:
        all_rows = [r["attributes"] for r in arcgis_query(ctx, ADDR, where=f"Street_Name='{_q(street)}'",
                    out_fields="FullAddress,HouseNum,Street_Type,Suffix_Dir,APN_PQ,Status,FeatureCode,City")]
        # same street = same suffix and direction where both are stated (Industrial Pkwy W != Industrial Blvd)
        rows = [r for r in all_rows if (not stype or (r.get("Street_Type") or "").upper() in ("", stype))
                and (not sdir or (r.get("Suffix_Dir") or "").upper() in ("", sdir))]
        other_street = [r for r in all_rows if r not in rows]
        for r in rows:
            if r.get("APN_PQ"):
                addr_by_apn.setdefault(r["APN_PQ"], r)
        n = _int(house)
        exact_apns = sorted({r["APN_PQ"] for r in rows if r.get("HouseNum") == house and r.get("APN_PQ")})
        partial_apns = sorted({r["APN_PQ"] for r in other_street if r.get("HouseNum") == house and r.get("APN_PQ")})
        for r in other_street:
            if r.get("APN_PQ"):
                addr_by_apn.setdefault(r["APN_PQ"], r)
        if n is not None and not exact_apns:
            numbered = [(abs(_int(r["HouseNum"]) - n), _int(r["HouseNum"]) < n, r) for r in rows
                        if _int(r.get("HouseNum")) is not None and r.get("APN_PQ")]
            for below in (True, False):
                side = sorted([(d, r["HouseNum"], r) for d, b, r in numbered if b == below], key=lambda t: t[:2])
                if side:
                    neighbor_apns.append((side[0][2]["APN_PQ"], side[0][2]))
            msg = "; ".join(f"{r['FullAddress']} (APN {apn})" for apn, r in neighbor_apns) or "none on this street"
            other = [r["FullAddress"] for r in other_street if r.get("HouseNum") == house]
            ctx.flag("warn", f"No Hayward address point for {house} {street.title()}",
                     f"The City's address layer has {len(rows)} addresses on {street.title()} {stype.title()} "
                     f"{sdir}".rstrip() + f" but not {house}. Closest existing numbers: {msg}."
                     + (f" The same number exists on a different street with this name: {', '.join(other)}."
                        if other else ""), "a_addr", "b_apn")
        ctx.status(ADDR, "retrieved" if rows else "no_result",
                   f"{len(rows)} address point(s) on the street; exact match: {', '.join(exact_apns) or 'none'}")

    # 2. Parcels: situs, then near the point, then by APN for address-point hits ------------------
    parcels: dict[str, dict] = {}
    situs: set[str] = set(exact_apns)
    partial: set[str] = set(partial_apns)
    if house and street:
        where = (f"(P_HouseNum='{_q(house)}' AND P_Street_Name='{_q(street)}') "
                 f"OR P_ST_ADDRESS LIKE '{_q(house)} {_q(street)} %'")
        for f in arcgis_query(ctx, PAR, where=where, out_fields=PAR_OUT, geometry=True):
            a = f["attributes"]
            city = (a.get("P_City") or "HAYWARD").upper()
            level = compare(ctx.addr, parse_street(a.get("P_ST_ADDRESS") or ""))
            if city == "HAYWARD" and level != "none":
                parcels[a["APN_PQ"]] = f
                (situs if level == "exact" else partial).add(a["APN_PQ"])
    partial -= situs
    for f in arcgis_query(ctx, PAR, point=(p.lon, p.lat), distance_m=NEAR_M, out_fields=PAR_OUT, geometry=True):
        parcels.setdefault(f["attributes"]["APN_PQ"], f)
    want = set(exact_apns) | partial | {a for a, _ in neighbor_apns}
    conf = ctx.shared.get("confirmed_apn")
    if conf and resolve.apn_key(conf) not in {resolve.apn_key(x) for x in parcels}:
        want.add(_county_apn(conf))
    want -= set(parcels)
    if want:
        ids = ",".join(f"'{_q(a)}'" for a in sorted(want))
        for f in arcgis_query(ctx, PAR, where=f"APN_PQ IN ({ids})", out_fields=PAR_OUT, geometry=True):
            parcels[f["attributes"]["APN_PQ"]] = f
    neighbor_set = {a for a, _ in neighbor_apns}

    enriched = 0
    for apn, f in sorted(parcels.items()):
        a = f["attributes"]
        g = geo.from_esri_rings((f.get("geometry") or {}).get("rings"))
        if g is None or g.is_empty:
            continue
        dist = geo.distance_m(g, p.lon, p.lat)
        is_conf = bool(conf) and resolve.apn_key(conf) == resolve.apn_key(apn)
        method = ("situs_address" if apn in situs else "situs_partial" if apn in partial
                  else "point_in_polygon" if dist == 0
                  else "nearest_address" if apn in neighbor_set
                  else "nearby" if dist <= NEAR_M + 5 or not is_conf else "apn_lookup")
        area = geo.area_sqft(g)
        fields = _parcel_fields(ctx, a, area, addr_by_apn.get(apn))
        cand = Candidate(
            apn=ctx.value(PAR, apn, confidence="high", note="Alameda County APN as carried by the City layer."),
            situs=ctx.value(PAR, a.get("P_ST_ADDRESS") or "(no situs address)", confidence="high"),
            match_method=method, distance_m=dist, contains_point=dist == 0,
            area_sqft=ctx.value(PAR, round(a["P_AREA"]) if a.get("P_AREA") else area, confidence="high",
                                note=f"Layer P_AREA; polygon computes to {area:,} sq ft in EPSG:3310."),
            geometry=mapping(g), found_in=[PAR], situs_matched_by=[PAR] if method == "situs_address" else [],
            fields=fields, note=resolve.METHOD_NOTE[method].format(m=NEAR_M)
            + (f" Nearest address point: {addr_by_apn[apn]['FullAddress']}." if method == "nearest_address" else ""),
        )
        merged = resolve.add_candidate(ctx, cand, geom=g)
        if is_conf or (enriched < ENRICH_MAX and (method != "nearby" or dist <= ENRICH_NEAR_M)):
            enriched += 1
            _enrich(ctx, merged, g)
    ctx.status(PAR, "retrieved" if parcels else "no_result",
               f"{len(situs)} situs match(es), {len(parcels)} parcel(s) considered, {enriched} expanded")


def _f(ctx, fid, sec, label, src, value, display, status, conf, note, who=None, url=None, vint=None) -> Field:
    v = ctx.value(src, value, confidence=conf, note=note, url=url, vintage=vint)
    return Field(**v.model_dump(), id=fid, section=sec, label=label, display=display, status=status, who=who)


def _parcel_fields(ctx: Ctx, a: dict, area: int, addr: dict | None) -> list[Field]:
    out = []
    rep = round(a["P_AREA"]) if a.get("P_AREA") else None
    if rep:
        diff = (area - rep) / rep
        out.append(_f(ctx, "b_area", S_PARCEL, "Parcel area", PAR, rep, f"{rep:,} sq ft ({rep / 43560:.2f} acres)",
                      "filled", "high", f"Layer P_AREA. Polygon computes to {area:,} sq ft ({diff:+.1%})."))
    if a.get("OWNERCENSORED"):
        mail = ", ".join(x for x in [a.get("M_ST_ADDRESS"), a.get("M_CITY"), a.get("M_STATE"), a.get("M_ZIP_FULL")] if x)
        out.append(_f(ctx, "a_own", S_ID, "Owner of record", PAR, {"owner": a["OWNERCENSORED"], "mailing": mail},
                      a["OWNERCENSORED"], "confirm", "medium",
                      f"Mailing address {mail}. City GIS copy of the assessor roll; date not stated. "
                      "If the customer is a tenant, the owner's consent is needed.", who="Customer"))
    if addr and addr.get("FeatureCode"):
        out.append(_f(ctx, "b_use", S_PARCEL, "Current use", ADDR, addr["FeatureCode"],
                      f"{addr['FeatureCode']} (address-point tag)", "confirm", "low",
                      f"FeatureCode on address point {addr.get('FullAddress')}; age and basis not stated.",
                      who="Customer"))
    return out


def _enrich(ctx: Ctx, cand: Candidate, parcel) -> None:
    for src, fn in ((ZON, _zoning), (FP, _footprints)):
        try:
            fn(ctx, cand, parcel)
        except Exception as e:  # noqa: BLE001
            ctx.error(src, e)


def _zoning(ctx: Ctx, cand: Candidate, parcel) -> None:
    rp = parcel.representative_point()
    feats = arcgis_query(ctx, ZON, point=(rp.x, rp.y),
                         out_fields="OBJECTID,ZONING_,ZONING_DETAIL,ZoningOverlay,PD_Type,SDD,MuniCodeURL,OrdinanceURL")
    if not feats:
        ctx.status(ZON, "no_result", f"No zoning polygon inside {cand.apn.value}")
        return
    zones: dict[tuple, dict] = {}
    for f in feats:
        a = f["attributes"]
        zones.setdefault((a.get("ZONING_"), a.get("ZoningOverlay")), a)
    z = list(zones.values())
    disp = "; ".join(f"{x.get('ZONING_')}, {x.get('ZONING_DETAIL')}" + (f" (overlay {x['ZoningOverlay']})" if x.get("ZoningOverlay") else "")
                     for x in z)
    note = (f"Queried at a point inside the parcel. {len(feats)} polygon(s), {len(z)} distinct. "
            + ("No overlay in the layer. " if not any(x.get("ZoningOverlay") for x in z) else "")
            + "The municipal code link points to the district rules; whether storage is allowed is ordinance text.")
    cand.fields.append(_f(ctx, "z_zone", S_ZONING, "Zoning", ZON,
                          [{k: x.get(k) for k in ("ZONING_", "ZONING_DETAIL", "ZoningOverlay", "MuniCodeURL")} for x in z],
                          disp, "filled" if len(z) == 1 else "confirm", "high" if len(z) == 1 else "medium", note,
                          who=None if len(z) == 1 else "EQORE", url=z[0].get("MuniCodeURL")))
    if len(feats) > len(z):
        ctx.flag("info", f"Overlapping duplicate zoning polygons on APN {cand.apn.value}",
                 f"The zoning layer returned {len(feats)} features; all read {disp}.", "z_zone")
    if len(z) > 1:
        ctx.flag("warn", f"More than one zoning district on APN {cand.apn.value}", disp, "z_zone")
    ctx.status(ZON, "retrieved", f"{disp} (APN {cand.apn.value})")


def _footprints(ctx: Ctx, cand: Candidate, parcel) -> None:
    feats = arcgis_query(ctx, FP, envelope=parcel.bounds, out_fields="OBJECTID,Bldg_AREA,BldgHeight_Mean,BaseElev_Mean",
                         geometry=True)
    bl, zero_attrs = [], True
    for f in feats:
        g = geo.from_esri_rings((f.get("geometry") or {}).get("rings"))
        if g is None or g.is_empty:
            continue
        a = f["attributes"]
        if any(a.get(k) for k in ("Bldg_AREA", "BldgHeight_Mean", "BaseElev_Mean")):
            zero_attrs = False
        pct = geo.overlap_pct(g, parcel)
        if pct < 1:
            continue
        bl.append({"id": a["OBJECTID"], "area_sqft": geo.area_sqft(g), "pct_inside": pct,
                   "_inside": geo.area_sqft(g.intersection(parcel)), "geometry": mapping(g)})
    bl.sort(key=lambda b: -b["area_sqft"])
    lot = cand.area_sqft.value if cand.area_sqft else geo.area_sqft(parcel)
    if feats and zero_attrs and not ctx.shared.get("coh_footprint_zero_flagged"):
        ctx.shared["coh_footprint_zero_flagged"] = True
        ctx.flag("info", "Footprint attributes are zero",
                 "The City footprint layer's area, height and ground-elevation fields read 0.0. Areas here are "
                 "computed from the polygons; height is unknown.", "b_bld", "b_height")
    cand.fields.append(_f(ctx, "b_height", S_PARCEL, "Building height and stories", FP, None,
                          "No usable height in the City footprint layer", "needed", "low",
                          "BldgHeight_Mean and BaseElev_Mean are 0.0 for these footprints, so they carry no data. "
                          "Needed for exposure distances and roof access.", who="Customer"))
    if not bl:
        cand.fields.append(_f(ctx, "b_bld", S_PARCEL, "Buildings on the lot", FP, [], "No footprint on this lot",
                              "confirm", "medium", "The layer may be out of date.", who="Customer"))
        ctx.status(FP, "no_result", f"No footprint on {cand.apn.value}")
        return
    on = [b for b in bl if b["pct_inside"] >= 50]
    covered = sum(b["_inside"] for b in on)
    disp = "; ".join(f"{b['area_sqft']:,} sq ft" + ("" if b["pct_inside"] >= 95 else f" ({b['pct_inside']:.0f}% inside)")
                     for b in on[:6]) or "None mostly inside the lot"
    for b in bl:
        b.pop("_inside")
    cand.fields.append(_f(ctx, "b_bld", S_PARCEL, "Buildings on the lot", FP, bl, disp, "confirm", "medium",
                          "Areas computed from footprint polygons (layer area field is 0.0). "
                          f"{len(bl) - len(on)} more footprint(s) touch the lot but sit mostly on neighbors.",
                          who="Customer"))
    cand.fields.append(_f(ctx, "b_cov", S_PARCEL, "Site coverage", "computed", round(100 * covered / lot),
                          f"About {100 * covered / lot:.0f}% of the lot", "filled", "medium",
                          "Area of footprints mostly inside the lot, divided by lot area."))
    for b in bl:
        if 50 <= b["pct_inside"] < 95 and b["area_sqft"] > 500:
            ctx.flag("warn", f"A building straddles APN {cand.apn.value}'s lot line",
                     f"Footprint {b['id']} ({b['area_sqft']:,} sq ft) is only {b['pct_inside']:.0f}% inside the lot.",
                     "b_bld")
        elif 2 <= b["pct_inside"] < 50 and b["area_sqft"] > 500:
            ctx.flag("info", f"A neighbor's building overlaps APN {cand.apn.value}'s lot line",
                     f"Footprint {b['id']} (about {b['area_sqft']:,} sq ft) lies {100 - b['pct_inside']:.0f}% on an "
                     "adjacent parcel.", "b_bld")
    ctx.status(FP, "retrieved", f"{len(bl)} footprint(s) touch {cand.apn.value}")
