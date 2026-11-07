"""CLI: python -m eqore_site "<address>" [--json] [--record DIR | --replay DIR]"""

from __future__ import annotations

import argparse
import json
import sys
import textwrap

from .http import HttpClient
from .pipeline import build_confirmed_record, build_site_record
from .prefill import to_csv
from .schema import SECTIONS, SiteRecord

ST = {"filled": "FILLED ", "confirm": "CONFIRM", "needed": "NEEDED ", "provided": "ENTERED"}


def render(rec: SiteRecord) -> str:
    out: list[str] = []
    w = out.append
    w(f"Site record  ·  {rec.input.address}")
    w(f"status: {rec.status}" + (f" (APN {rec.confirmed_apn})" if rec.confirmed_apn else "") + f"   county FIPS: {rec.county_fips or '?'}   generated {rec.generated_at}")
    c = {k: sum(1 for f in rec.fields if f.status == k) for k in ST}
    w(f"fields: {len(rec.fields)}  filled {c['filled']} · confirm {c['confirm']} · needed {c['needed']}")
    s = rec.summary
    if s:
        w(f"required inputs: {s['required']}  done {s['required_done_pct']}% · found but to confirm "
          f"{s['required_auto_pct'] - s['required_done_pct']}% · flags {s['flags']['warn']} warn / {s['flags']['info']} info")
    for sec in SECTIONS:
        rows = [f for f in rec.fields if f.section == sec]
        if not rows:
            continue
        w("")
        w(f"== {sec}")
        for f in rows:
            who = f" [{f.who}]" if f.who and f.status in ("confirm", "needed") else ""
            w(f"  {ST[f.status]} {f.label}: {textwrap.shorten(f.display or '-', 110)}{who}")
            if f.status != "needed":
                w(f"           ↳ {f.source_label} · conf {f.confidence}" + (f" · {f.vintage}" if f.vintage else ""))
    if rec.candidates:
        w("")
        w("== Parcel candidates" + (f" (confirmed: {rec.confirmed_apn})" if rec.confirmed_apn
                                     else " (none selected; confirm with the customer)"))
        for cd in rec.candidates:
            d = f"{cd.distance_m:.0f} m" if cd.distance_m is not None else "?"
            a = f"{cd.area_sqft.value:,} sq ft" if cd.area_sqft else "area ?"
            more = f"  (+{len(cd.related_apns)} unit APNs)" if cd.related_apns else ""
            w(f"  APN {cd.apn.value:<16} {cd.situs.value[:40]:<40} {cd.match_method:<16} {d:>6}  {a}{more}")
    if rec.flags:
        w("")
        w("== Flags")
        for fl in rec.flags:
            w(f"  [{fl.severity}] {fl.title}" + ("  (cross-check)" if fl.origin == "crosscheck" else ""))
            w(textwrap.indent(textwrap.fill(fl.detail, 100), "         "))
    if rec.source_errors:
        w("")
        w("== Source errors")
        for e in rec.source_errors:
            w(f"  {e.source_label}: {e.error}")
    w("")
    by: dict[str, list[str]] = {}
    for m in rec.missing:
        by.setdefault(m.who, []).append(m.item)
    w("== To collect: " + "; ".join(f"{k} {len(v)}" for k, v in by.items()))
    return "\n".join(out)


def render_prefill(rec: SiteRecord) -> str:
    mark = {"filled": "FILLED ", "review": "REVIEW ", "missing": "MISSING"}
    out, form = [f"Permit prefill · {rec.input.address} · status {rec.status}"
                 + (f" (APN {rec.confirmed_apn})" if rec.confirmed_apn else "")], None
    s = rec.summary.get("prefill", {})
    out.append(f"filled {s.get('filled')} · review {s.get('review')} · missing {s.get('missing')}")
    for it in rec.form_prefill:
        if it.form != form:
            form = it.form
            out += ["", f"== {form}"]
        v = "" if it.value is None else textwrap.shorten(str(it.value), 80)
        out.append(f"  {mark[it.status]} {it.field}: {v or '-'}" + (f"  [{it.source_label}]" if it.source_label else ""))
    return "\n".join(out)


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="eqore_site", description="Address -> source-tagged site record")
    p.add_argument("address")
    p.add_argument("--json", action="store_true", help="print the full record as JSON")
    g = p.add_mutually_exclusive_group()
    g.add_argument("--record", metavar="DIR", help="live run; save every raw response to DIR")
    g.add_argument("--replay", metavar="DIR", help="offline run from responses saved in DIR")
    p.add_argument("--confirm", metavar="APN", help="build the record with this APN confirmed by a person "
                   "(point lookups re-run inside the parcel)")
    p.add_argument("--prefill", choices=["table", "csv"], help="print the permit/lead-form prefill instead")
    p.add_argument("--kwh", type=float, help="proposed BESS energy (kWh)")
    p.add_argument("--kw", type=float, help="proposed BESS power (kW)")
    p.add_argument("--placement", choices=["indoor", "outdoor", "rooftop"])
    p.add_argument("--schema", action="store_true", help="print the JSON Schema and exit")
    a = p.parse_args(argv)
    if a.schema:
        print(json.dumps(SiteRecord.json_schema(), indent=2))
        return 0
    client = HttpClient("replay", a.replay) if a.replay else HttpClient("live", a.record)
    try:
        ps = {k: v for k, v in (("energy_kwh", a.kwh), ("power_kw", a.kw), ("placement", a.placement)) if v}
        if a.confirm:
            rec = build_confirmed_record(a.address, a.confirm, ps or None, client=client)
        else:
            rec = build_site_record(a.address, ps or None, client=client)
    finally:
        client.close()
    if a.prefill == "csv":
        print(to_csv(rec), end="")
    elif a.prefill:
        print(render_prefill(rec))
    else:
        print(rec.model_dump_json(indent=2) if a.json else render(rec))
    return 0


if __name__ == "__main__":
    sys.exit(main())
