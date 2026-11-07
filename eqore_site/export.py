"""Static export for a GitHub Pages site: one JSON file per address, an index, a JS
bundle for pages opened without a server, and the permit prefill as CSV.

    python -m eqore_site.export --facilities site_records/facilities.json --out site_records
    python -m eqore_site.export --address "16 Commerce Way, Woburn, MA" --out site_records

Facility-list values (rate, service, peak, system) are customer-provided and come in as
Entered fields; utility account numbers are deliberately not exported. When the facility
list's utility disagrees with the public territory layer, the record gets a warning.
No API keys: every source is public and keyless.
"""

from __future__ import annotations

import argparse
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from . import __version__
from .context import Ctx
from .edit import enter_values
from .http import HttpClient
from .pipeline import build_site_record
from .prefill import to_csv
from .schema import SiteRecord

UTILITY_KEYS = {"PG&E": ["PG&E", "PACIFIC GAS"], "EVERSOURCE": ["EVERSOURCE", "NSTAR"],
                "NATIONAL GRID": ["NATIONAL GRID", "MASSACHUSETTS ELECTRIC"]}


def slug(address: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", address.lower()).strip("-")[:80]


def _utility_key(text: str) -> Optional[str]:
    t = (text or "").upper()
    return next((k for k, keys in UTILITY_KEYS.items() if any(x in t for x in keys)), None)


def build_one(fac: dict, client: HttpClient, today: Optional[str] = None) -> SiteRecord:
    ps = {k: v for k, v in (("power_kw", fac.get("system_kw")), ("energy_kwh", fac.get("system_kwh"))) if v}
    rec = build_site_record(fac["address"], ps or None, client=client, today=today)
    vals = {"f_rate": f"{fac['utility']} {fac['rate']}" if fac.get("rate") else None, "f_svc": fac.get("service")}
    for fid, v in vals.items():
        if v:
            try:
                rec = enter_values(rec, {fid: v}, entered_by="EQORE facility list", today=today)
            except ValueError:
                pass
    lead_u, pub = _utility_key(fac.get("utility", "")), rec.field("f_util")
    pub_u = _utility_key(pub.display if pub else "")
    if lead_u and pub_u and lead_u != pub_u:
        ctx = Ctx(record=rec, client=None)  # type: ignore[arg-type]
        ctx.flag("warn", "Facility list and public utility territory disagree",
                 f"The EQORE facility list says {fac['utility']} ({fac.get('rate')}); {pub.source_label} says "
                 f"{pub.display}. Check the customer's bill before using that utility's tariff and interconnection rules.",
                 "f_util", "f_rate", origin="lead")
        rec.summary["flags"]["warn"] += 1
    return rec


def _slim(obj, tol: float = 0.00001):
    """Simplify GeoJSON geometries (~1 m) and round coordinates to 6 decimals, recursively."""
    from shapely.geometry import mapping, shape
    if isinstance(obj, dict):
        if obj.get("type") in ("Polygon", "MultiPolygon") and "coordinates" in obj:
            g = mapping(shape(obj).simplify(tol, preserve_topology=True))
            def rnd(c):
                return [rnd(x) for x in c] if isinstance(c, (list, tuple)) and c and isinstance(c[0], (list, tuple)) \
                    else [round(c[0], 6), round(c[1], 6)]
            return {"type": g["type"], "coordinates": rnd(g["coordinates"])}
        return {k: _slim(v, tol) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_slim(v, tol) for v in obj]
    return obj


def _brief(fac: dict, rec: SiteRecord, path: str) -> dict:
    f = {x.id: x for x in rec.fields}
    top = [c for c in rec.candidates[:3]]
    return {
        "slug": Path(path).stem, "file": path, "facility": fac.get("facility"), "address": fac["address"],
        "state": "MA" if (rec.county_fips or "").startswith("25") else "CA" if (rec.county_fips or "").startswith("06") else None,
        "county_fips": rec.county_fips, "status": rec.status, "lead": {k: v for k, v in fac.items() if k != "address"},
        "location": rec.location.value if rec.location else None,
        "utility_public": f["f_util"].display if "f_util" in f else None,
        "seismic": f["e_seis"].display if "e_seis" in f else None,
        "flood_zone": "manual lookup (FEMA)",
        "candidates": [{"apn": c.apn.value, "situs": c.situs.value, "match": c.match_method, "distance_m": c.distance_m}
                       for c in top],
        "warnings": [x.title for x in rec.flags if x.severity == "warn"],
        "summary": rec.summary,
    }


def export(facilities: list[dict], out: Path, client: HttpClient, today: Optional[str] = None) -> dict:
    out.mkdir(parents=True, exist_ok=True)
    (out / "records").mkdir(exist_ok=True)
    idx_path = out / "index.json"
    index = json.loads(idx_path.read_text()) if idx_path.exists() else {"sites": []}
    by_addr = {s["address"]: s for s in index.get("sites", [])}
    bundle_path = out / "records.js"
    for fac in facilities:
        rec = build_one(fac, client, today)
        name = slug(fac["address"])
        rel = f"records/{name}.json"
        doc = {"facility": {k: v for k, v in fac.items()}, "record": _slim(rec.model_dump(mode="json"))}
        (out / rel).write_text(json.dumps(doc, separators=(",", ":")))
        (out / "records" / f"{name}.prefill.csv").write_text(to_csv(rec))
        by_addr[fac["address"]] = _brief(fac, rec, rel)
        print(f"{fac['address']}: {rec.status}, {len(rec.candidates)} candidates, "
              f"{rec.summary['flags']['warn']} warnings, {len(rec.source_errors)} source errors")
    index = {"generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
             "generator": f"eqore_site {__version__}", "schema": "see schema.json",
             "sites": sorted(by_addr.values(), key=lambda s: (s.get("state") or "", s["address"]))}
    idx_path.write_text(json.dumps(index, indent=1))
    (out / "schema.json").write_text(json.dumps(SiteRecord.json_schema(), indent=1))
    records = {s["slug"]: json.loads((out / s["file"]).read_text()) for s in index["sites"]}
    bundle_path.write_text("// Generated by eqore_site.export. Do not edit.\n"
                           f"window.EQORE_SITE_INDEX = {json.dumps(index)};\n"
                           f"window.EQORE_SITE_RECORDS = {json.dumps(records)};\n")
    return index


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="eqore_site.export")
    ap.add_argument("--facilities", help="JSON list of facilities (address + facility-list fields)")
    ap.add_argument("--address", action="append", help="add or refresh one address (repeatable)")
    ap.add_argument("--out", default="site_records")
    ap.add_argument("--cache", default=".cache/http", help="HTTP cache dir ('' to disable)")
    a = ap.parse_args(argv)
    facs = json.loads(Path(a.facilities).read_text()) if a.facilities else []
    known = {f["address"]: f for f in facs}
    for addr in a.address or []:
        facs = [f for f in facs if f["address"] != addr] + [known.get(addr, {"address": addr})]
    if a.address and a.facilities:
        facs = [f for f in facs if f["address"] in a.address]
    client = HttpClient("cache", a.cache) if a.cache else HttpClient("live")
    try:
        export(facs, Path(a.out), client)
    finally:
        client.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
