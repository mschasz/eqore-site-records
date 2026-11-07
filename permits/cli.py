"""CLI: python -m permits fetch "<address>" [--apn ...] [--out ...] [--no-files]"""
from __future__ import annotations

import argparse
import sys
from collections import Counter
from pathlib import Path

from .http import HttpClient
from .jurisdictions import Registry


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="python -m permits", description="Permit retrieval for EQORE site records")
    sub = ap.add_subparsers(dest="cmd", required=True)
    f = sub.add_parser("fetch", help="Find permits for an address and write the site's permit outputs")
    f.add_argument("address")
    f.add_argument("--apn", help="Parcel number (also searched directly)")
    f.add_argument("--out", default="out", help="Output root (default: out/)")
    f.add_argument("--no-files", action="store_true", help="Skip attachment listing and downloads")
    f.add_argument("--no-details", action="store_true", help="Skip per-permit detail calls")
    f.add_argument("--refresh", action="store_true", help="Ignore the HTTP cache")
    f.add_argument("--offline", action="store_true", help="Replay from the HTTP cache only")
    f.add_argument("--cache", help="HTTP cache directory (default from jurisdictions.yaml)")
    f.add_argument("--registry", default=None, help="Path to jurisdictions.yaml")
    d = sub.add_parser("discover", help="Open a portal in a browser and log its JSON XHR/fetch calls")
    d.add_argument("url")
    d.add_argument("--search", help="Text to type into the first search box")
    d.add_argument("--out", default="out/discover.json")
    d.add_argument("--headed", action="store_true")
    a = ap.parse_args(argv)

    if a.cmd == "discover":
        from .adapters.browser import discover
        calls = discover(a.url, Path(a.out), a.search, headless=not a.headed)
        json_calls = [c for c in calls if "json" in c.get("content_type", "")]
        print(f"{len(calls)} XHR/fetch calls, {len(json_calls)} returned JSON → {a.out}")
        for c in json_calls[:20]:
            print(f"  {c['method']} {c['status']} {c['url'][:140]}")
        return 0

    from .pipeline import fetch
    reg = Registry(a.registry) if a.registry else Registry()
    c = reg.client
    http = HttpClient(user_agent=c.get("user_agent", HttpClient.user_agent), rate_per_sec=c.get("rate_per_sec", 3),
                      cache_dir=Path(a.cache or c.get("cache_dir", ".cache/permits")), offline=a.offline, refresh=a.refresh)
    res = fetch(a.address, apn=a.apn, out=a.out, files=not a.no_files, registry=reg, http=http, details=not a.no_details)
    kinds = Counter(r.record_type for r in res.records)
    print(f"{res.site.street_line}, {res.site.city or ''} → {res.jurisdiction or 'no jurisdiction'}")
    print(f"  records: {len(res.records)} ({', '.join(f'{v} {k}s' for k, v in kinds.items()) or 'none'})")
    apns = sorted({r.apn for r in res.records if r.apn})
    if apns:
        print(f"  APNs: {', '.join(apns)}")
    got = [x for x in res.attachments if x.local_path]
    print(f"  attachments: {len(res.attachments)} listed, {len(got)} downloaded")
    for x in got:
        print(f"    {x.permit_number}/{x.file_name}  {x.bytes:,} bytes  sha256 {x.sha256[:8]}…{x.sha256[-4:]}")
    print(f"  missing: {len(res.missing)} items → {res.out_dir}/missing.json")
    for m in res.missing:
        if m.field in ("permits", "jurisdiction"):
            print(f"    {m.reason}\n    → {m.next_step}")
    print(f"  output: {res.out_dir}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
