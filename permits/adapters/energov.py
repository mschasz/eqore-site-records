"""Tyler EnerGov Civic Access (Self Service) public API adapter.

Checked live against Hayward, CA on 2026-11-07:
- GET  /energov/search/criteria          -> search template in .Result (always start from it; minimal bodies 500)
- POST /energov/search/search            -> Keyword + ExactMatch + SearchModule=1 + FilterModule (2 permits, 3 plans)
- POST /energov/permits/permitdetail     -> {"EntityId": CaseId, "ModuleId": 1}
- GET  /energov/entity/attachments/search/entityattachments/<CaseId>/<ModuleId>/true
- GET  /energov/attachments/metadata/ then /energov/attachments/rangedownload/ (HTTP 206, Range loop)
No login and no cookies are needed; tenant headers are required on every call.
"""
from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from .. import address as addr
from ..matcher import basis
from ..models import Attachment, PermitRecord, Site, utcnow
from .base import Adapter

CHUNK = 20_000_000


class EnerGovAdapter(Adapter):
    kind = "energov"

    def __init__(self, *a, **kw):
        super().__init__(*a, **kw)
        t = self.cfg["tenant"]
        self.base = self.cfg["base_url"].rstrip("/")
        self.headers = {"tenantId": str(t["id"]), "tenantName": t["name"], "Tyler-TenantUrl": t["url"],
                        "Tyler-Tenant-Culture": t.get("culture", "en-US"), "Accept": "application/json, text/plain, */*"}
        self._template: dict | None = None

    # ---------------------------------------------------------------- search
    def _criteria(self) -> dict:
        if self._template is None:
            r = self.http.get(f"{self.base}/energov/search/criteria", headers=self.headers)
            r.raise_for_status()
            self._template = r.json()["Result"]
        return dict(self._template)

    def _search_page(self, keyword: str, filter_module: int, page: int) -> tuple[dict, str]:
        body = self._criteria()
        body.update(Keyword=keyword, ExactMatch=True, SearchModule=1, FilterModule=filter_module, PageNumber=page, PageSize=100)
        url = f"{self.base}/energov/search/search"
        r = self.http.post(url, json_body=body, headers=dict(self.headers, **{"Content-Type": "application/json;charset=UTF-8"}))
        r.raise_for_status()
        q = f"POST {url} Keyword='{keyword}' ExactMatch=true SearchModule=1 FilterModule={filter_module} PageSize=100"
        return r.json()["Result"] or {}, q

    def _search_all(self, keyword: str, filter_module: int, max_pages: int = 50) -> list[tuple[dict, str]]:
        out, page = [], 1
        while True:
            res, q = self._search_page(keyword, filter_module, page)
            out += [(e, q) for e in (res.get("EntityResults") or [])]
            if page >= min(res.get("TotalPages") or 1, max_pages):
                return out
            page += 1

    def search(self, site: Site) -> list[PermitRecord]:
        seen: dict[str, PermitRecord] = {}

        def take(kw: str, mod: dict) -> int:
            n = 0
            for e, q in self._search_all(kw, mod["filter"]):
                text = re.sub(r"\s+", " ", e.get("AddressDisplay") or "").strip()
                b = basis(site, text, e.get("MainParcel"))
                if not b:
                    continue
                if e["CaseId"] in seen:
                    if seen[e["CaseId"]].match_basis != b and b == "both":
                        seen[e["CaseId"]].match_basis = "both"
                    continue
                seen[e["CaseId"]] = self._to_record(e, mod, b, q)
                n += 1
            return n

        for mod in self.cfg["modules"]:
            # Address forms in order; stop at the first that matches (portals match literally, so
            # "Pkwy W" hits where "Parkway West" returns nothing).
            for kw in addr.variants(site, include_bare=False)[:3]:
                if take(kw, mod):
                    break
            if site.apn:
                take(site.apn, mod)
        return list(seen.values())

    def _to_record(self, e: dict, mod: dict, match_basis: str, q: str) -> PermitRecord:
        kind = "permit" if e.get("ModuleName") == 2 else "plan" if e.get("ModuleName") == 3 else mod["record_type"]
        rec = PermitRecord(
            jurisdiction=self.j.name, record_type=kind, permit_number=(e.get("CaseNumber") or "").strip(),
            permit_type=e.get("CaseType"), work_class=e.get("CaseWorkclass"), status=e.get("CaseStatus"),
            apply_date=self.iso_date(e.get("ApplyDate")), issue_date=self.iso_date(e.get("IssueDate")),
            expire_date=self.iso_date(e.get("ExpireDate")), final_date=self.iso_date(e.get("FinalDate") or e.get("CompleteDate")),
            description=e.get("Description"), address=re.sub(r"\s+", " ", e.get("AddressDisplay") or "").strip() or None,
            apn=self.apn(e.get("MainParcel")),
            portal_url=self.cfg.get("record_url", "").format(kind=kind, case_id=e["CaseId"]) or self.cfg.get("portal_url"),
            source=self.label, source_query=q, match_basis=match_basis, source_id=e["CaseId"], source_key=str(mod["filter"]),
        )
        return rec

    # ---------------------------------------------------------------- detail
    def _mod(self, record: PermitRecord) -> dict:
        return next(m for m in self.cfg["modules"] if str(m["filter"]) == record.source_key)

    def get_detail(self, record: PermitRecord) -> PermitRecord:
        mod = self._mod(record)
        if not mod.get("detail"):
            return record
        url = f"{self.base}/energov/permits/{mod['detail']}"
        body = {"EntityId": record.source_id, "ModuleId": mod["detail_module"]}
        r = self.http.post(url, json_body=body, headers=dict(self.headers, **{"Content-Type": "application/json;charset=UTF-8"}))
        if r.status >= 400:
            self.notes.append(f"Detail call failed for {record.permit_number}: HTTP {r.status}")
            return record
        d = r.json().get("Result") or {}
        upd: dict[str, Any] = {
            "permit_type": d.get("PermitType") or record.permit_type,
            "work_class": d.get("WorkClassName") or record.work_class,
            "status": d.get("PermitStatus") or record.status,
            "description": d.get("Description") if d.get("Description") is not None else record.description,
            "valuation_usd": self.money(d.get("Value")),
            "square_feet": self.money(d.get("SquareFeet")),
            "apply_date": self.iso_date(d.get("ApplyDate")) or record.apply_date,
            "issue_date": self.iso_date(d.get("IssueDate")) or record.issue_date,
            "expire_date": self.iso_date(d.get("ExpireDate")) or record.expire_date,
            "final_date": self.iso_date(d.get("FinalizeDate")) or record.final_date,
            "apn": self.apn(d.get("MainParcelNumber")) or record.apn,
            "source_query": record.source_query + f" | POST {url} {body}",
        }
        return record.model_copy(update=upd)

    # ---------------------------------------------------------------- attachments
    def list_attachments(self, record: PermitRecord) -> list[Attachment]:
        mod = self._mod(record)
        for mid in mod.get("attachment_modules", [1]):
            url = f"{self.base}/energov/entity/attachments/search/entityattachments/{record.source_id}/{mid}/true"
            r = self.http.get(url, headers=self.headers)
            if r.status >= 400:
                continue
            body = r.json()
            if not body.get("Success", True) or not body.get("Result"):
                continue
            atts = body["Result"].get("Attachments") or []
            if atts:
                return [Attachment(permit_number=record.permit_number, file_name=a.get("FileName") or a["AttachmentID"],
                                   attachment_group=a.get("AttachmentGroupName"), notes=a.get("Notes"),
                                   added_on=self.iso_date(a.get("AddedOn")), attachment_id=a["AttachmentID"],
                                   source_url=url, portal_url=record.portal_url) for a in atts]
        return []

    def download(self, att: Attachment, dest: Path) -> Attachment:
        fh = dict(self.headers, FileID=att.attachment_id, DownloadProvider="attachment", FileType="attachment")
        meta_url = f"{self.base}/energov/attachments/metadata/"
        m = self.http.get(meta_url, headers=dict(fh, FileToken=""))
        if m.status >= 400:
            return att.model_copy(update={"error": f"metadata HTTP {m.status}", "retrieved_at": utcnow()})
        meta = m.json().get("Result") or {}
        size, token = int(meta.get("FileSize") or 0), meta.get("FileToken") or att.attachment_id
        dest.parent.mkdir(parents=True, exist_ok=True)
        if dest.exists() and size and dest.stat().st_size == size and att.sha256 and self.sha256_file(dest) == att.sha256:
            return att.model_copy(update={"local_path": str(dest), "bytes": size})   # idempotent skip
        dl_url = f"{self.base}/energov/attachments/rangedownload/"
        buf = bytearray()
        while not size or len(buf) < size:
            end = (min(len(buf) + CHUNK, size) - 1) if size else len(buf) + CHUNK - 1
            r = self.http.get(dl_url, headers=dict(fh, FileToken=token, Range=f"bytes={len(buf)}-{end}"))
            if r.status not in (200, 206) or not r.content:
                return att.model_copy(update={"error": f"download HTTP {r.status} at byte {len(buf)}", "retrieved_at": utcnow()})
            buf += r.content
            if r.status == 200 or not size:
                break
        dest.write_bytes(bytes(buf))
        return att.model_copy(update={"local_path": str(dest), "bytes": len(buf), "sha256": self.sha256_file(dest),
                                      "source_url": f"GET {dl_url} FileID={att.attachment_id}", "retrieved_at": utcnow()})

    # ---------------------------------------------------------------- nearby
    def nearby(self, site: Site, limit: int = 6) -> list[dict[str, Any]]:
        if not site.number or not site.street_name:
            return []
        street = " ".join(p for p in [site.pre_dir, site.street_name, (site.suffix or "").title() or None, site.post_dir] if p)
        target = int(re.match(r"\d+", site.number).group(0))
        found: dict[int, set[str]] = {}
        for e, _ in self._search_all(street, 2, max_pages=self.cfg.get("nearby_pages_max", 20)):
            text = re.sub(r"\s+", " ", e.get("AddressDisplay") or "").strip()
            m = re.match(r"(\d+)\s", text)
            if not m:
                continue
            probe = site.model_copy(update={"number": m.group(1), "number_hi": None})
            if basis(probe, text, None):
                found.setdefault(int(m.group(1)), set()).add(self.apn(e.get("MainParcel")) or "")
        near = sorted(found, key=lambda n: (abs(n - target), n))[:limit]
        return [{"address": f"{n} {street}", "apns": sorted(a for a in found[n] if a), "distance_in_house_numbers": abs(n - target)} for n in near]
