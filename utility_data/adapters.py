"""One small adapter per utility. Each fills the common record from that utility's public hosting-capacity
service. To add a utility: write a function `fill_<id>(http, rec, lon, lat)` and register it in ADAPTERS."""
from __future__ import annotations

import re
from datetime import date, datetime, timezone
from typing import Any, Callable

from .arcgis import match_feeder, query, where_query
from .http import Http
from .record import CAUTION_ZERO, val

# ---------------------------------------------------------------------------------------------- PG&E
PGE_SVC = "https://services2.arcgis.com/mJaJSax0KPHoCNB6/ArcGIS/rest/services/DRPComplianceRelProd/FeatureServer"
PGE_NAME = "PG&E Grid Resource Integration Portal (DRPComplianceRelProd)"
PGE_MAIN = "FeederId,FeederName,voltage_kv,phase_cnt,LoadCapacity_kW,GenCapacity_kW,limiting_criteria,ICA_Analysis_Date,Division"
PGE_EXTRA = "FeederId,GenCapacity_no_OpFlex_kW,GenericPVCapacity_kW,limiting_month_hour,ScreenL,Publish"


def _nearest_with(secs: list, field: str) -> tuple[float | None, dict] | None:
    return next((t for t in secs if (t[1].get(field) not in (None, ""))), None)


def _range_note(secs: list, fields: tuple[str, ...], date_field: str, unit: str) -> str | None:
    dated = [a for _, a in secs if a.get(date_field)]
    if len(dated) < 2:
        return None
    parts = []
    for f in fields:
        vs = [a[f] for a in dated if isinstance(a.get(f), (int, float))]
        if vs and min(vs) != max(vs):
            parts.append(f"{f} {min(vs):g}–{max(vs):g} {unit}")
    return (f"Values vary along this feeder: {len(dated)} dated sections nearby range " + "; ".join(parts) + ".") if parts else None


def fill_pge(http: Http, rec: dict, lon: float, lat: float) -> dict[str, str]:
    reasons: dict[str, str] = {}
    layer = f"{PGE_SVC}/3"
    m = match_feeder(http, rec, layer, "PG&E LineDetail (layer 3)", lon, lat, "OBJECTID," + PGE_MAIN, lambda a: a.get("FeederId"))
    if not m:
        feats, err, url = query(http, f"{PGE_SVC}/4", lon, lat, 500, "feeder_id,division,publish,last_update_on_map")
        rec["queries"].append({"name": "PG&E ICA Not Available (layer 4) within 500 m", "url": url})
        if feats:
            a = feats[0]["attributes"]
            rec["feeder"]["id"] = val(a.get("feeder_id"), PGE_NAME + " — ICA Not Available layer", url, "low", note="Nearest line is listed as ICA not available.")
            rec["notes"].append("ICA not available for the line sections near this site (PG&E layer 4). Missing capacity is not zero.")
            reasons["*"] = "PG&E lists the nearby line sections as ICA not available."
        else:
            rec["notes"].append("No PG&E line section within 500 m of the geocoded point.")
            reasons["*"] = "No PG&E line section within 500 m."
        return reasons
    conf, url, secs = m["confidence"], m["url"], m["feeder_sections"]
    rec["match"] = {k: m[k] for k in ("method", "radius_m", "sections", "candidates")} | {"confidence": conf}
    nearest = secs[0]
    dated = _nearest_with(secs, "ICA_Analysis_Date")
    a = (dated or nearest)[1]
    named = _nearest_with(secs, "FeederName")
    fid = a.get("FeederId")
    rec["feeder"]["id"] = val(fid, PGE_NAME, url, conf)
    if named:
        rec["feeder"]["name"] = val(named[1]["FeederName"], PGE_NAME, url, conf)
        sub = re.sub(r"\s+\d+$", "", named[1]["FeederName"]).strip()
        if sub and sub != named[1]["FeederName"]:
            rec["feeder"]["substation"] = val(sub, PGE_NAME, url, "low", note="Derived from the feeder name (PG&E names feeders '<substation> <circuit>'); not a separate field.")
    for t in secs:
        x = t[1]
        if x.get("Division") and not rec["feeder"]["division"]:
            rec["feeder"]["division"] = val(x["Division"], PGE_NAME, url, conf)
        if x.get("voltage_kv") is not None and not rec["feeder_voltage_kv"]:
            rec["feeder_voltage_kv"] = val(x["voltage_kv"], PGE_NAME, url, conf, unit="kV")
        if x.get("phase_cnt") is not None and not rec["phases"]:
            rec["phases"] = val(x["phase_cnt"], PGE_NAME, url, conf)
    if not dated:
        msg = f"None of the {len(secs)} nearby sections of this feeder has an ICA_Analysis_Date; capacity is not recorded without its date."
        reasons.update({"hosting_capacity.generation": msg, "hosting_capacity.load": msg, "hosting_capacity.computed": msg,
                        "hosting_capacity.limiting_criteria": msg})
    else:
        ica_date = a["ICA_Analysis_Date"].strip()
        dist = f"{dated[0]:.0f} m" if dated[0] is not None else "unknown distance"
        sec_note = f"Nearest dated line section (OBJECTID {a.get('OBJECTID')}, {dist} from the site)."
        if dated is not nearest:
            sec_note += f" The closest section ({nearest[0]:.0f} m) has no ICA data." if nearest[0] is not None else " The closest section has no ICA data."
        rng = _range_note(secs, ("GenCapacity_kW", "LoadCapacity_kW"), "ICA_Analysis_Date", "kW")
        rec["hosting_capacity"]["computed"] = val(ica_date, PGE_NAME, url, conf, note="PG&E ICA_Analysis_Date")
        for key, field in (("generation", "GenCapacity_kW"), ("load", "LoadCapacity_kW")):
            if a.get(field) is not None:
                v = a[field]
                rec["hosting_capacity"][key] = val(v, PGE_NAME, url, conf, unit="kW", data_date=ica_date,
                                                   note=" ".join(x for x in (sec_note, rng, CAUTION_ZERO if v == 0 else None) if x))
        if a.get("limiting_criteria"):
            rec["hosting_capacity"]["limiting_criteria"] = val(a["limiting_criteria"], PGE_NAME, url, conf, data_date=ica_date)
        else:
            reasons["hosting_capacity.limiting_criteria"] = "PG&E left limiting_criteria blank for this section."
        # Second query: extra ICA fields for the same section.
        feats, err, url2 = where_query(http, layer, f"OBJECTID={int(a['OBJECTID'])}", PGE_EXTRA)
        rec["queries"].append({"name": "PG&E LineDetail extra fields (same section)", "url": url2})
        if err:
            rec["errors"].append(f"PG&E extra fields: {err}")
        elif feats:
            x = feats[0]["attributes"]
            for k, unit in (("GenCapacity_no_OpFlex_kW", "kW"), ("GenericPVCapacity_kW", "kW"), ("limiting_month_hour", None), ("ScreenL", None), ("Publish", None)):
                if x.get(k) not in (None, ""):
                    rec["extra"][k] = val(x[k], PGE_NAME, url2, conf, unit=unit, data_date=ica_date if unit else None)
    # Are this feeder's sections near the site in "ICA Not Available" (layer 4)?
    na, err, url3 = query(http, f"{PGE_SVC}/4", lon, lat, m["radius_m"], "feeder_id,last_update_on_map", where=f"feeder_id='{fid}'")
    rec["queries"].append({"name": f"PG&E ICA Not Available (layer 4), this feeder within {m['radius_m']} m", "url": url3})
    if err:
        rec["errors"].append(f"PG&E layer 4 check: {err}")
    else:
        rec["extra"]["ica_not_available_sections_nearby"] = val(len(na), PGE_NAME + " — ICA Not Available layer", url3, "high",
                                                               note=f"Line sections of this feeder within {m['radius_m']} m that PG&E lists as ICA not available.")
        if na:
            rec["notes"].append(f"{len(na)} section(s) of this feeder within {m['radius_m']} m are listed by PG&E as ICA not available.")
    return reasons


# ---------------------------------------------------------------------------------------------- SCE
SCE_SVC = "https://services5.arcgis.com/z6hI6KRjKHvhNO0r/arcgis/rest/services/ICA_Layer/FeatureServer"
SCE_NAME = "SCE DRPEP Integration Capacity Analysis (ICA_Layer)"
SCE_TERMS = ("SCE: \"While Southern California Edison makes every effort to ensure the accuracy of DRPEP, the data provided is for "
             "information purposes only. Southern California Edison makes no guarantee, expressly or implied, for the outcome of an "
             "interconnection request.\"")
SCE_UNITS = "SCE does not state units in the service or layer metadata; magnitudes are consistent with MW. Confirm before quoting."


def _sce_date(s: Any) -> str | None:
    if s in (None, ""):
        return None
    if isinstance(s, (int, float)):
        return datetime.fromtimestamp(s / 1000, timezone.utc).date().isoformat()
    m = re.match(r"(\d{1,2})/(\d{1,2})/(\d{4})", str(s))
    return f"{m.group(3)}-{int(m.group(1)):02d}-{int(m.group(2)):02d}" if m else str(s)


def _num(v: Any) -> Any:
    try:
        return float(v)
    except (TypeError, ValueError):
        return v


def fill_sce(http: Http, rec: dict, lon: float, lat: float) -> dict[str, str]:
    reasons: dict[str, str] = {}
    rec["notes"].append(SCE_TERMS)
    m, lbl = None, ""
    for lid, label in ((2, "SCE ICA Circuit Segments (layer 2, 3-phase)"), (3, "SCE ICA Circuit Segments Non-3 Phase (layer 3)")):
        m = match_feeder(http, rec, f"{SCE_SVC}/{lid}", label, lon, lat, "*", lambda a: a.get("circuit_name"))
        if m:
            lbl = label
            break
    # ICA Unavailable (layer 1) near the site.
    un, err, uurl = query(http, f"{SCE_SVC}/1", lon, lat, (m or {}).get("radius_m", 500), "CIRCUIT_ID,CIRCT_NAM,CIRCUIT_VOLTAGE,SUB_NAME,SYS_NAME")
    rec["queries"].append({"name": "SCE ICA Unavailable Circuit Segments (layer 1)", "url": uurl})
    if err:
        rec["errors"].append(f"SCE layer 1: {err}")
    if not m:
        if un:
            a = un[0]["attributes"]
            rec["feeder"]["id"] = val(a.get("CIRCUIT_ID"), SCE_NAME + " — ICA Unavailable", uurl, "low")
            rec["feeder"]["name"] = val(a.get("CIRCT_NAM"), SCE_NAME + " — ICA Unavailable", uurl, "low")
            if a.get("SUB_NAME"):
                rec["feeder"]["substation"] = val(a["SUB_NAME"], SCE_NAME + " — ICA Unavailable", uurl, "low")
            if a.get("CIRCUIT_VOLTAGE") not in (None, ""):
                rec["feeder_voltage_kv"] = val(_num(a["CIRCUIT_VOLTAGE"]), SCE_NAME + " — ICA Unavailable", uurl, "low", unit="kV")
            rec["notes"].append("ICA not available for this circuit (SCE layer 1). Missing capacity is not zero.")
            reasons["*"] = "SCE lists this circuit as ICA not available."
        else:
            rec["notes"].append("No SCE circuit segment within 500 m of the geocoded point; the address may be served by another utility.")
            reasons["*"] = "No SCE circuit segment within 500 m."
        return reasons
    conf, url, secs = m["confidence"], m["url"], m["feeder_sections"]
    pick = _nearest_with(secs, "ica_overall_load") or secs[0]
    a = pick[1]
    rec["match"] = {k: m[k] for k in ("method", "radius_m", "sections", "candidates")} | {"confidence": conf, "layer": lbl}
    if pick is not secs[0]:
        rec["notes"].append("The closest SCE section has no ICA values; the nearest section with values is used.")
    rng = _range_note(secs, (), "changed_date", "")  # SCE values are text; range shown via extra if needed
    rec["feeder"]["name"] = val(a.get("circuit_name"), SCE_NAME, url, conf)
    rec["feeder"]["id"] = val(a.get("circuit_name"), SCE_NAME, url, conf, note="SCE publishes the circuit name; no separate circuit ID in this layer.")
    if a.get("substation_name"):
        rec["feeder"]["substation"] = val(a["substation_name"], SCE_NAME, url, conf, note=f"{a.get('substation_voltage') or ''} · {a.get('system_name') or ''}".strip(" ·"))
    if a.get("circuit_voltage") not in (None, ""):
        rec["feeder_voltage_kv"] = val(_num(a["circuit_voltage"]), SCE_NAME, url, conf, unit="kV")
    if a.get("phase") not in (None, ""):
        rec["phases"] = val(a["phase"], SCE_NAME, url, conf)
    changed = _sce_date(a.get("changed_date"))
    stale = None
    if changed and re.match(r"\d{4}-\d{2}-\d{2}", changed):
        age = (date.today() - date.fromisoformat(changed)).days
        if age > 365 or changed.startswith("9999"):
            stale = f"changed_date {changed} is {'a placeholder' if changed.startswith('9999') else f'{age // 30} months old'}; check for a newer SCE release."
            rec["notes"].append(f"SCE section data may be stale: {stale}")
    if changed:
        rec["hosting_capacity"]["computed"] = val(changed, SCE_NAME, url, conf, note="SCE changed_date for this section" + (f" — {stale}" if stale else ""))
    note_units = SCE_UNITS + (f" {stale}" if stale else "")
    for key, field in (("load", "ica_overall_load"), ("generation", "uniform_generation")):
        v = a.get(field)
        if v in (None, ""):
            continue
        if str(v).strip().lower() == "redacted":
            reasons[f"hosting_capacity.{key}"] = f"SCE shows '{field}' as Redacted for this section."
            continue
        if not changed:
            reasons[f"hosting_capacity.{key}"] = "SCE returned no changed_date; capacity is not recorded without its date."
            continue
        n = _num(v)
        rec["hosting_capacity"][key] = val(n, SCE_NAME, url, conf, data_date=changed,
                                           note=note_units + (" " + CAUTION_ZERO if n == 0 else ""))
    if a.get("most_limiting_factor"):
        rec["hosting_capacity"]["limiting_criteria"] = val(a["most_limiting_factor"], SCE_NAME, url, conf, data_date=changed)
    for f in ("ica_overall_pv", "ica_overall_pv_op_flex", "uniform_generation_op_flex", "lgp_flag", "note", "section_id", "node_id"):
        if a.get(f) not in (None, ""):
            redacted = str(a[f]).strip().lower() == "redacted"
            rec["extra"][f] = val(None if redacted else _num(a[f]) if f.startswith(("ica_", "uniform_")) else a[f], SCE_NAME, url, conf,
                                  data_date=changed if f.startswith(("ica_", "uniform_")) else None,
                                  note="Redacted by SCE" if redacted else (SCE_UNITS if f.startswith(("ica_", "uniform_")) else None))
    if un:
        names = {x["attributes"].get("CIRCT_NAM") for x in un}
        if (a.get("circuit_name") or "").upper() in {(n or "").upper() for n in names}:
            rec["notes"].append("ICA not available for part of this circuit (it also appears in SCE layer 1).")
    return reasons


# ---------------------------------------------------------------------------------------------- National Grid MA
NG_SVC = "https://systemdataportal.nationalgrid.com/arcgis/rest/services/MASDP/MA_HostingCapacity_with_DGPending/MapServer"
NG_NAME = "National Grid MA System Data Portal (MA_HostingCapacity_with_DGPending)"


def fill_nationalgrid_ma(http: Http, rec: dict, lon: float, lat: float) -> dict[str, str]:
    reasons: dict[str, str] = {
        "feeder.name": "National Grid publishes a feeder ID (Master_CDF) but no feeder name.",
        "hosting_capacity.load": "National Grid's MA hosting-capacity service publishes generation hosting capacity only; no load capacity.",
        "hosting_capacity.limiting_criteria": "National Grid's MA service does not publish limiting criteria.",
    }
    m = match_feeder(http, rec, f"{NG_SVC}/0", "National Grid Feeder Level Data 3 Phase (layer 0)", lon, lat, "*", lambda a: a.get("Master_CDF"))
    if not m:
        m2 = match_feeder(http, rec, f"{NG_SVC}/2", "National Grid 1 and 2 Phase (layer 2)", lon, lat, "*", lambda a: a.get("Master_CDF"))
        if not m2:
            rec["notes"].append("No National Grid feeder found nearby; the address may be served by another utility (Eversource, Unitil or a municipal utility).")
            reasons["*"] = "No National Grid feeder within 500 m."
            return reasons
        a = m2["attrs"]
        rec["match"] = {k: m2[k] for k in ("method", "radius_m", "sections", "candidates")} | {"confidence": m2["confidence"], "layer": "1 and 2 Phase"}
        rec["feeder"]["id"] = val(a.get("Master_CDF"), NG_NAME, m2["url"], m2["confidence"], note="Master_CDF: district prefix + circuit designation (e.g. 05_09_1021W1).")
        if a.get("Phases"):
            rec["phases"] = val(a["Phases"], NG_NAME, m2["url"], m2["confidence"])
        for k in ("hosting_capacity.generation", "hosting_capacity.computed", "feeder.substation", "feeder_voltage_kv"):
            reasons[k] = "Nearest line is 1- or 2-phase; National Grid publishes hosting capacity only for 3-phase feeder data."
        return reasons
    a, conf, url = m["attrs"], m["confidence"], m["url"]
    rec["match"] = {k: m[k] for k in ("method", "radius_m", "sections", "candidates")} | {"confidence": conf, "layer": "Feeder Level Data 3 Phase"}
    upd = a.get("Updated_Date")
    upd_iso = datetime.fromtimestamp(upd / 1000, timezone.utc).date().isoformat() if isinstance(upd, (int, float)) else (str(upd) if upd else None)
    rec["feeder"]["id"] = val(a.get("Master_CDF"), NG_NAME, url, conf, note="Master_CDF: district prefix + circuit designation (e.g. 05_09_1021W1); unique per feeder.")
    if a.get("Substation"):
        rec["feeder"]["substation"] = val(a["Substation"], NG_NAME, url, conf)
    if a.get("Operating_Voltage_kV") is not None:
        rec["feeder_voltage_kv"] = val(a["Operating_Voltage_kV"], NG_NAME, url, conf, unit="kV")
    if upd_iso:
        rec["hosting_capacity"]["computed"] = val(upd_iso, NG_NAME, url, conf, note="National Grid Updated_Date")
        hc = a.get("HC_Available_MW")
        if hc is not None:
            rec["hosting_capacity"]["generation"] = val(hc, NG_NAME, url, conf, unit="MW", data_date=upd_iso, note=CAUTION_ZERO if hc == 0 else None)
    else:
        reasons["hosting_capacity.generation"] = "National Grid returned no Updated_Date; capacity is not recorded without its date."
    for f, unit in (("HC_Available_MW_pending", "MW"), ("Total_Nameplate_Interconnected_DG_excluding_BESS_MW", "MW"),
                    ("Total_Nameplate_Pending_excluding_BESS_MW", "MW"), ("feeder_connected_storage", "MW"), ("feeder_pending_storage", "MW"),
                    ("feeder_connected_solar", "MW"), ("feeder_pending_solar", "MW"), ("Ongoing_ASO", None), ("Potential_ASO", None),
                    ("FERC_FEEDER", None), ("CIP_FEE", None)):
        if a.get(f) not in (None, ""):
            rec["extra"][f] = val(a[f], NG_NAME, url, conf, unit=unit, data_date=upd_iso if unit else None)
    return reasons


# ---------------------------------------------------------------------------------------------- registry
ADAPTERS: dict[str, tuple[str, Callable[[Http, dict, float, float], dict[str, str]]]] = {
    "pge": ("Pacific Gas and Electric (PG&E)", fill_pge),
    "sce": ("Southern California Edison (SCE)", fill_sce),
    "nationalgrid_ma": ("National Grid (Massachusetts Electric)", fill_nationalgrid_ma),
}

# Utilities without an adapter yet: name and public hosting-capacity map, where we have one we have opened.
KNOWN_WITHOUT_ADAPTER: dict[str, tuple[str, str | None]] = {
    "sdge": ("San Diego Gas & Electric (SDG&E)", None),
    "eversource_ma": ("Eversource (NSTAR Electric), Massachusetts", None),
    "unitil_ma": ("Unitil (Fitchburg Gas and Electric), Massachusetts", None),
    "eversource_nh": ("Eversource (PSNH), New Hampshire", None),
    "nationalgrid_ny": ("National Grid New York", None),
}
