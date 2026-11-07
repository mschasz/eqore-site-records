"""Massachusetts (state FIPS 25). Statewide, keyless sources verified live 2026-11-07:

- MassGIS Property Tax Parcels: polygon + assessor fields (owner, mailing address, use code,
  local zoning, year built, building area, stories, lot size, fiscal year)
- MassGIS Building Structures (2-D): footprints (roofprints, mostly 2011 imagery)
- MassGIS Electric Utility Providers: utility by town
- Census geocoder, USGS ASCE 7-22 and the FEMA FIRM link are nationwide (shared with CA)

California-only layers (CAL FIRE, CGS, CEC, NAIP, ABAG, LightBox) are not used here; the
hazards MA has no statewide layer for are `needed` with an MA-specific note.
Query patterns: ADDR_NUM / FULL_STR / CITY are text; CITY is the town; condo units share LOC_ID.
"""

from __future__ import annotations

from shapely.geometry import mapping

from . import geo, resolve
from .address import compare, parse_street, trim_after_suffix
from .adapters.base import arcgis_query
from .context import S_AHJ, S_HAZ, S_ID, S_PARCEL, S_ZONING, S_ELEC, Ctx
from .schema import Candidate, Field
from .statewide import hazards, seismic

PAR, BLD, ELEC = "massgis_parcels", "massgis_structures", "massgis_electric"
NEAR_M = 40
MAX_ENRICH_SQFT = 3_000_000   # skip footprint lookups on rights-of-way and huge campuses
OUT = ("LOC_ID,MAP_PAR_ID,SITE_ADDR,ADDR_NUM,FULL_STR,CITY,ZIP,OWNER1,OWN_ADDR,OWN_CITY,OWN_STATE,OWN_ZIP,"
       "USE_CODE,ZONING,YEAR_BUILT,BLD_AREA,STORIES,LOT_SIZE,LOT_UNITS,FY,TOTAL_VAL")
USE = {"1": "Residential", "2": "Open space", "3": "Commercial", "4": "Industrial", "5": "Personal property",
       "6": "Forest (Ch. 61)", "7": "Agricultural (Ch. 61A)", "8": "Recreational (Ch. 61B)", "9": "Exempt"}


def _q(s: str) -> str:
    return s.replace("'", "''")


def town(ctx: Ctx) -> str:
    return (ctx.shared.get("county_subdivision") or ctx.addr.city or "").upper()


def parcels(ctx: Ctx) -> None:
    a, p, t = ctx.addr, ctx.point, town(ctx)
    found: dict[str, dict] = {}
    situs: set[str] = set()
    if a.house and a.name:
        street = f"FULL_STR LIKE '{_q(a.name)}%'" + (f" AND CITY='{_q(t)}'" if t else "")
        hits = arcgis_query(ctx, PAR, where=f"ADDR_NUM='{_q(a.house)}' AND {street}", out_fields=OUT, geometry=True)
        if not hits:
            # ranges like '122-150 WESTERN AVE': scan the street without geometry, then fetch the matches
            rows = [f["attributes"] for f in arcgis_query(ctx, PAR, where=street, out_fields="LOC_ID,SITE_ADDR")]
            locs = sorted({r["LOC_ID"] for r in rows if "-" in (r.get("SITE_ADDR") or "") and
                           compare(a, parse_street(trim_after_suffix(r["SITE_ADDR"]))) == "exact"})
            if locs:
                ids = ",".join(f"'{_q(x)}'" for x in locs)
                hits = arcgis_query(ctx, PAR, where=f"LOC_ID IN ({ids})", out_fields=OUT, geometry=True)
        for f in hits:
            r = f["attributes"]
            found.setdefault(r["LOC_ID"], {"rows": [], "f": f})["rows"].append(r)
            situs.add(r["LOC_ID"])
    for f in arcgis_query(ctx, PAR, point=(p.lon, p.lat), distance_m=NEAR_M, out_fields=OUT, geometry=True):
        found.setdefault(f["attributes"]["LOC_ID"], {"rows": [], "f": f})["rows"].append(f["attributes"])
    enriched = 0
    for loc, item in found.items():
        rows = list({r.get("MAP_PAR_ID") or r.get("SITE_ADDR"): r for r in item["rows"]}.values())
        main = next((r for r in rows if r.get("OWNER1")), rows[0])
        g = geo.from_esri_rings((item["f"].get("geometry") or {}).get("rings"))
        if g is None or g.is_empty:
            continue
        dist = geo.distance_m(g, p.lon, p.lat)
        method = "situs_address" if loc in situs else "point_in_polygon" if dist == 0 else "nearby"
        area = geo.area_sqft(g)
        apn = main.get("MAP_PAR_ID") or loc
        cand = Candidate(
            apn=ctx.value(PAR, apn, confidence="high", vintage=f"FY{main.get('FY')}" if main.get("FY") else None,
                          note=f"Town assessor map-parcel ID; MassGIS LOC_ID {loc}."),
            situs=ctx.value(PAR, f"{main.get('SITE_ADDR') or '(no situs)'}, {(main.get('CITY') or '').title()}", confidence="high"),
            match_method=method, distance_m=dist, contains_point=dist == 0,
            area_sqft=ctx.value("computed", area, confidence="high", note="Computed from the MassGIS polygon (EPSG:3310 is fine for areas)."),
            geometry=mapping(g), found_in=[PAR], situs_matched_by=[PAR] if method == "situs_address" else [],
            related_apns=[r.get("MAP_PAR_ID") for r in rows if r is not main and r.get("MAP_PAR_ID")],
            fields=_fields(ctx, main, rows, area), note=resolve.METHOD_NOTE[method].format(m=NEAR_M),
        )
        merged = resolve.add_candidate(ctx, cand, geom=g)
        if area <= MAX_ENRICH_SQFT and (method != "nearby" or (dist <= 10 and enriched < 3)):
            enriched += 1
            try:
                _footprints(ctx, merged, g)
            except Exception as e:  # noqa: BLE001
                ctx.error(BLD, e)
    ctx.status(PAR, "retrieved" if found else "no_result", f"{len(situs)} situs match(es), {len(found)} parcel(s) in {t.title()}")


def _f(ctx, fid, sec, label, src, value, display, status, conf, note, who=None, vint=None) -> Field:
    v = ctx.value(src, value, confidence=conf, note=note, vintage=vint)
    return Field(**v.model_dump(), id=fid, section=sec, label=label, display=display, status=status, who=who)


def _fields(ctx: Ctx, r: dict, rows: list[dict], area: int) -> list[Field]:
    vint = f"assessor FY{r.get('FY')}" if r.get("FY") else None
    out = []
    lot = r.get("LOT_SIZE")
    if lot:
        sq = lot * 43560 if (r.get("LOT_UNITS") or "A") == "A" else lot
        out.append(_f(ctx, "b_area", S_PARCEL, "Parcel area", PAR, round(sq), f"{sq:,.0f} sq ft ({sq / 43560:.2f} acres)",
                      "filled", "high", f"Assessor LOT_SIZE {lot} {r.get('LOT_UNITS') or ''}; polygon computes to {area:,} sq ft.", vint=vint))
    if r.get("OWNER1"):
        mail = ", ".join(x for x in [r.get("OWN_ADDR"), r.get("OWN_CITY"), r.get("OWN_STATE"), r.get("OWN_ZIP")] if x)
        out.append(_f(ctx, "a_own", S_ID, "Owner of record", PAR, {"owner": r["OWNER1"], "mailing": mail}, r["OWNER1"],
                      "confirm", "medium", f"Mailing address {mail}. If the customer is a tenant, the owner's consent is needed.",
                      who="Customer", vint=vint))
    uc = (r.get("USE_CODE") or "").strip()
    if uc:
        out.append(_f(ctx, "b_use", S_PARCEL, "Current use", PAR, uc, f"MA use code {uc} ({USE.get(uc[:1], 'unknown class')})",
                      "confirm", "medium", "Massachusetts DOR property use code from the assessor.", who="Customer", vint=vint))
    if r.get("ZONING"):
        out.append(_f(ctx, "z_zone", S_ZONING, "Zoning", PAR, {"code": r["ZONING"]}, f"{r['ZONING']} (assessor's zoning field)",
                      "confirm", "medium", "Town zoning code as recorded by the assessor; confirm on the town's zoning map.",
                      who="EQORE", vint=vint))
    if r.get("YEAR_BUILT"):
        out.append(_f(ctx, "b_year", S_PARCEL, "Year built", PAR, r["YEAR_BUILT"], str(r["YEAR_BUILT"]), "filled", "medium",
                      "Assessor year built.", vint=vint))
    if r.get("BLD_AREA"):
        out.append(_f(ctx, "b_floor", S_PARCEL, "Reported floor area", PAR, r["BLD_AREA"], f"{r['BLD_AREA']:,} sq ft", "filled",
                      "medium", "Assessor building area.", vint=vint))
    try:
        stories = float(r.get("STORIES") or 0)
    except ValueError:
        stories = 0
    if stories > 0:
        out.append(_f(ctx, "b_height", S_PARCEL, "Building height and stories", PAR, {"stories": r["STORIES"]},
                      f"{r['STORIES']} stories (assessor); height not recorded", "confirm", "medium",
                      "Stories from the assessor; height in feet still needed for exposure distances.", who="Customer", vint=vint))
    if len(rows) > 1:
        out.append(_f(ctx, "b_units", S_PARCEL, "Assessor records on this polygon", PAR, [x.get("SITE_ADDR") for x in rows],
                      f"{len(rows)} records (condos or units)", "filled", "high", "Several assessor records share this parcel polygon."))
    return out


def _footprints(ctx: Ctx, cand: Candidate, parcel) -> None:
    feats = arcgis_query(ctx, BLD, envelope=parcel.bounds, out_fields="STRUCT_ID,AREA_SQ_FT,SOURCEDATE,SOURCETYPE",
                         geometry=True)
    bl = []
    for f in feats:
        g = geo.from_esri_rings((f.get("geometry") or {}).get("rings"))
        if g is None or g.is_empty:
            continue
        pct = geo.overlap_pct(g, parcel)
        if pct >= 1:
            a = f["attributes"]
            bl.append({"id": a["STRUCT_ID"], "area_sqft": geo.area_sqft(g), "pct_inside": pct,
                       "source_date": str(a.get("SOURCEDATE") or "")[:4], "source_type": a.get("SOURCETYPE"),
                       "_in": geo.area_sqft(g.intersection(parcel)), "geometry": mapping(g)})
    bl.sort(key=lambda b: -b["area_sqft"])
    on = [b for b in bl if b["pct_inside"] >= 50]
    years = sorted({b["source_date"] for b in bl if b["source_date"]})
    vint = "imagery " + ", ".join(years) if years else None
    lot = cand.area_sqft.value if cand.area_sqft else geo.area_sqft(parcel)
    covered = sum(b.pop("_in") for b in bl if b["pct_inside"] >= 50)
    for b in bl:
        b.pop("_in", None)
    cand.fields.append(_f(ctx, "b_bld", S_PARCEL, "Buildings on the lot", BLD, bl,
                          "; ".join(f"{b['area_sqft']:,} sq ft" + ("" if b["pct_inside"] >= 95 else f" ({b['pct_inside']:.0f}% inside)")
                                    for b in on[:6]) or "No footprint mostly inside the lot",
                          "confirm", "medium", "MassGIS roofprints; areas computed from polygons.", who="Customer", vint=vint))
    cand.fields.append(_f(ctx, "b_cov", S_PARCEL, "Site coverage", "computed", round(100 * covered / lot),
                          f"About {100 * covered / lot:.0f}% of the lot", "filled", "medium",
                          "Footprints mostly inside the lot, divided by lot area.", vint=vint))
    for b in bl:
        if 50 <= b["pct_inside"] < 95 and b["area_sqft"] > 500:
            ctx.flag("warn", f"A building straddles parcel {cand.apn.value}'s lot line",
                     f"Footprint {b['id']} ({b['area_sqft']:,} sq ft) is only {b['pct_inside']:.0f}% inside the lot.", "b_bld")
    ctx.status(BLD, "retrieved", f"{len(bl)} footprint(s) touch {cand.apn.value}", vintage=vint)


def place(ctx: Ctx) -> None:
    t = town(ctx).title()
    county = (ctx.geocode.get("county") or {}).get("NAME")
    ctx.shared["city"] = t
    ctx.add_field("a_city", S_ID, "City / town", "census_geocoder", t, status="filled", confidence="high",
                  note="Census county subdivision (the MA town or city).")
    ctx.add_field("z_jur", S_ZONING, "Jurisdiction", "census_geocoder", {"town": t, "county": county},
                  display=f"{t}, {county}, MA", status="filled", confidence="high", note="Census county subdivision.")
    ctx.add_field("d_bldg", S_AHJ, "Building permit authority and portal", "census_geocoder", f"{t} building department",
                  status="confirm", confidence="low", who="EQORE",
                  note="Inferred: Massachusetts towns issue building permits through the local building commissioner "
                       "under 780 CMR. Portal and ESS requirements not looked up.")
    ctx.add_field("d_fire", S_AHJ, "Fire authority", "census_geocoder", f"{t} Fire Department", status="confirm",
                  confidence="low", who="EQORE",
                  note="Inferred: the local fire department is the usual fire AHJ in Massachusetts (527 CMR). No statewide "
                       "fire-district layer was used; confirm the contact and ESS review process.")
    ctx.add_needed("d_code", S_AHJ, "State code edition",
                   "Massachusetts State Building Code (780 CMR) and Fire Code (527 CMR); confirm the edition in effect "
                   "for the filing date. Not encoded here.", "EQORE")
    ctx.status("census_geocoder", "retrieved", f"Town {t}, {county}")


def utility(ctx: Ctx) -> None:
    feats = arcgis_query(ctx, ELEC, point=(ctx.point.lon, ctx.point.lat), out_fields="TOWN,ELEC,ELEC_LABEL")
    if not feats:
        ctx.add_needed("f_util", S_ELEC, "Serving utility", "No MassGIS provider polygon at the point.", "Customer")
        ctx.status(ELEC, "no_result", "No town polygon")
        return
    a = feats[0]["attributes"]
    ctx.shared["utilities"] = [a.get("ELEC")]
    ctx.add_field("f_util", S_ELEC, "Serving utility", ELEC, a, display=a.get("ELEC_LABEL") or a.get("ELEC"),
                  status="confirm", confidence="medium", who="Customer",
                  note=f"MassGIS assigns one provider per town ({(a.get('TOWN') or '').title()}). Towns can be split between "
                       "utilities or served by a municipal light plant; confirm on a bill.")
    ctx.add_field("d_ic", S_AHJ, "Utility interconnection process", ELEC,
                  f"{a.get('ELEC')}: Massachusetts DPU interconnection tariff for distributed generation",
                  status="confirm", confidence="low", who="EQORE",
                  note="Follows from the town's provider; each MA distribution company files its own DG interconnection tariff.")
    ctx.status(ELEC, "retrieved", f"{a.get('TOWN')}: {a.get('ELEC')}")


def not_mapped(ctx: Ctx) -> None:
    for fid, label, why in (
        ("e_fhsz", "Fire hazard severity zone", "California FHSZ does not apply. Massachusetts has no statewide wildfire hazard zone map."),
        ("e_tsu", "Tsunami hazard area", "No statewide tsunami hazard layer used for Massachusetts."),
        ("e_liq", "Liquefaction", "No statewide liquefaction zone map in Massachusetts; a geotechnical report decides."),
        ("e_coast", "Coastal zone", "MA Office of Coastal Zone Management boundary not queried."),
        ("b_img", "Aerial imagery", "CDFW NAIP service is California-only; use MassGIS orthoimagery or the map basemap."),
        ("z_zone", "Zoning", "No statewide zoning layer; the assessor zoning field is used when a parcel is matched."),
    ):
        if ctx.record.field(fid) is None:
            ctx.add_needed(fid, S_HAZ if fid.startswith("e_") else (S_PARCEL if fid == "b_img" else S_ZONING), label, why, "EQORE")


STEPS = [
    ("census_geocoder", place, []),
    ("massgis_parcels", parcels, [("b_apn", S_PARCEL, "APN", "Customer")]),
    ("usgs_seismic", seismic.run, [("e_seis", S_HAZ, "Seismic design parameters", "EQORE")]),
    ("fema_nfhl", hazards.flood_not_fetched, []),
    ("massgis_electric", utility, [("f_util", S_ELEC, "Serving utility", "Customer")]),
    ("computed", not_mapped, []),
]
