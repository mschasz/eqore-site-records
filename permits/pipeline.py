"""Orchestration: address -> jurisdiction -> adapters -> matched, enriched records -> files -> outputs."""
from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from . import address as addr
from .adapters import ADAPTERS
from .extract import extract
from .http import HostUnreachable, HttpClient, HttpError
from .jurisdictions import Registry
from .models import Attachment, MissingItem, PermitRecord, Site
from .output import write_outputs
from .records_request import draft

log = logging.getLogger("permits")

DESIGN_FIELDS = ["service_amps", "service_voltage", "phases", "switchgear", "pv_kw_dc", "ess_kwh", "generator_kw", "transformer_kva"]


@dataclass
class Result:
    site: Site
    jurisdiction: str | None
    records: list[PermitRecord] = field(default_factory=list)
    attachments: list[Attachment] = field(default_factory=list)
    missing: list[MissingItem] = field(default_factory=list)
    out_dir: Path | None = None


def _safe(name: str) -> str:
    return re.sub(r"[^\w.\- ]+", "_", name).strip() or "file"


def fetch(address: str, apn: str | None = None, out: Path | str = "out", files: bool = True, registry: Registry | None = None,
          http: HttpClient | None = None, details: bool = True) -> Result:
    reg = registry or Registry()
    site = addr.parse(address, apn)
    c = reg.client
    http = http or HttpClient(user_agent=c.get("user_agent", HttpClient.user_agent), rate_per_sec=c.get("rate_per_sec", 3),
                              cache_dir=Path(c.get("cache_dir", ".cache/permits")))
    jur = reg.resolve(site)
    res = Result(site=site, jurisdiction=jur.name if jur else None)
    out_dir = Path(out) / site.slug / "permits"
    res.out_dir = out_dir

    if not jur:
        res.missing.append(MissingItem(field="jurisdiction", reason=f"No registry entry for city '{site.city}', state '{site.state}'.",
                                       next_step="Add the city to jurisdictions.yaml, or send the records request."))
        write_outputs(out_dir, res, draft(site, None, []))
        return res

    adapters = [ADAPTERS[s["adapter"]](jur, s, http) for s in jur.sources]
    owner: dict[str, Any] = {}
    for ad in adapters:
        try:
            recs = ad.search(site)
        except HostUnreachable as e:
            res.missing.append(MissingItem(field="permits", reason=str(e), next_step=f"Retry when {e.host} is reachable, or use the records request.",
                                           detail={"source": ad.label}))
            continue
        except HttpError as e:
            res.missing.append(MissingItem(field="permits", reason=f"{ad.label}: {e}", next_step="Check the adapter configuration.",
                                           detail={"source": ad.label}))
            continue
        except Exception as e:  # browser adapters etc.
            res.missing.append(MissingItem(field="permits", reason=f"{ad.label}: {type(e).__name__}: {e}", next_step="See adapter notes.",
                                           detail={"source": ad.label}))
            continue
        for r in recs:
            key = r.permit_number.upper()
            if key in owner:          # same permit from two datasets: keep the first, note the merge
                continue
            owner[key] = ad
            res.records.append(r)
        for n in ad.notes:
            res.missing.append(MissingItem(field="source", reason=n, next_step="See README: adding an adapter / finding a portal's API.",
                                           detail={"source": ad.label}))

    # Detail calls, extraction, attachments.
    enriched: list[PermitRecord] = []
    prev = _previous_manifest(out_dir)
    for r in res.records:
        ad = owner[r.permit_number.upper()]
        if details:
            try:
                r = ad.get_detail(r)
            except HttpError as e:
                ad.notes.append(f"detail failed for {r.permit_number}: {e}")
        ex = extract(r.description)
        if ex:
            merged = {**r.extracted, **ex}
            if r.extracted.get("tags") or ex.get("tags"):
                merged["tags"] = sorted(set(r.extracted.get("tags", [])) | set(ex.get("tags", [])))
            documented = set(r.extracted.get("documented_fields", []))
            for k in documented:            # a structured (documented) value wins over text extraction
                merged[k] = r.extracted[k]
            text_only = [k for k in ex if k != "tags" and k not in documented]
            r = r.model_copy(update={"extracted": merged, "confidence": "extracted" if text_only else r.confidence})
        enriched.append(r)
        if files:
            try:
                atts = ad.list_attachments(r)
            except HttpError as e:
                atts = [Attachment(permit_number=r.permit_number, file_name="(listing failed)", error=str(e))]
            for a in atts:
                if not a.attachment_id:
                    res.attachments.append(a)
                    continue
                dest = out_dir / "files" / _safe(r.permit_number) / _safe(a.file_name)
                a = a.model_copy(update={"sha256": prev.get(str(dest))})
                try:
                    res.attachments.append(ad.download(a, dest))
                except (HttpError, NotImplementedError) as e:
                    res.attachments.append(a.model_copy(update={"error": str(e)}))
    res.records = sorted(enriched, key=lambda r: (r.apply_date or r.issue_date or ""), reverse=True)

    _missing(res, adapters, site)
    write_outputs(out_dir, res, draft(site, jur, res.records))
    return res


def _previous_manifest(out_dir: Path) -> dict[str, str]:
    p = out_dir / "attachments.json"
    if not p.exists():
        return {}
    try:
        return {a["local_path"]: a["sha256"] for a in json.loads(p.read_text()) if a.get("local_path") and a.get("sha256")}
    except (ValueError, KeyError):
        return {}


def _missing(res: Result, adapters: list, site: Site) -> None:
    if not res.records:
        near: list[dict] = []
        for ad in adapters:
            try:
                near = ad.nearby(site)
            except HttpError:
                near = []
            if near:
                break
        res.missing.append(MissingItem(
            field="permits",
            reason=(f"No permit records match {site.street_line}. The address may not be an official address "
                    "(a typo, or a suite inside another building's address)."),
            next_step=("Confirm the address with the customer or county assessor. Nearby house numbers on the same street with records: "
                       + (", ".join(n["address"] + (f" ({', '.join(n['apns'])})" if n["apns"] else "") for n in near) if near else "none found")
                       + ". A records request draft is in records_request.md."),
            detail={"nearby_addresses": near}))
    if site.apn is None and not any(r.apn for r in res.records):
        res.missing.append(MissingItem(field="apn", reason="No parcel number supplied or found in records.",
                                       next_step="Look up the APN at the county assessor and re-run with --apn."))
    if res.records:
        found = {k for r in res.records for k in r.extracted}
        for f in DESIGN_FIELDS:
            if f not in found:
                res.missing.append(MissingItem(field=f, reason="Not stated in any permit description.",
                                               next_step="Request the single-line diagram / panel schedule (records_request.md) or ask the customer."))
        legacy = [r for r in res.records if not (r.description or "").strip() or re.search(r"legacy", r.permit_type or "", re.I)]
        if legacy:
            res.missing.append(MissingItem(field="descriptions", reason=f"{len(legacy)} records have little or no description (often migrated legacy records).",
                                           next_step="Request the paper file for these permit numbers.", detail={"permits": [r.permit_number for r in legacy][:50]}))
    if not any(a.local_path for a in res.attachments):
        res.missing.append(MissingItem(field="drawings", reason="No public attachments with drawings; plan sets are usually not public online.",
                                       next_step="Send records_request.md (owner authorization speeds release of drawings)."))
