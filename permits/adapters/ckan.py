"""CKAN datastore adapter (Boston) and full-CSV download adapter (San José).

Boston: datastore_search with a full-text `q`, paged, then filtered locally with the matcher.
San José: the CKAN API/datastore paths are disallowed by robots.txt, so the daily CSV exports are
downloaded whole (cached) and filtered locally.
"""
from __future__ import annotations

import csv
from typing import Any

from ..address import apn_digits
from ..matcher import basis
from ..models import PermitRecord, Site
from .base import Adapter
from .socrata import pick

PAGE = 100


class _FieldMapMixin:
    cfg: dict

    def _val(self, row: dict, key: str) -> Any:
        v = pick(row, self.cfg["fields"].get(key))
        if isinstance(v, list):
            if key == "description":
                return " | ".join(str(x).strip() for x in v if x and str(x).strip()) or None
            return next((x for x in v if x not in (None, "")), None)
        return v.strip() if isinstance(v, str) else v


class CkanAdapter(_FieldMapMixin, Adapter):
    kind = "ckan"

    def search(self, site: Site) -> list[PermitRecord]:
        v = self.site_vars(site)
        url = f"{self.cfg['base_url'].rstrip('/')}/datastore_search"
        queries = [self.cfg.get("q_template", "{number} {name}").format(**v)]
        if site.number_hi:
            queries.append(f"{site.number}-{site.number_hi} {site.street_name}")
        if site.apn:
            queries.append(site.apn)
        out: dict[str, PermitRecord] = {}
        for qtext in queries:
            offset = 0
            while True:
                params = {"resource_id": self.cfg["resource_id"], "q": qtext, "limit": PAGE, "offset": offset}
                r = self.http.get(url, params=params)
                r.raise_for_status()
                res = r.json()["result"]
                recs = res.get("records") or []
                q = f"GET {url} resource_id={self.cfg['resource_id']} q='{qtext}'"
                for row in recs:
                    rec = self._to_record(row, site, q)
                    if rec and rec.permit_number not in out:
                        out[rec.permit_number] = rec
                offset += PAGE
                if len(recs) < PAGE or offset >= (res.get("total") or 0):
                    break
        return list(out.values())

    def _to_record(self, row: dict, site: Site, q: str) -> PermitRecord | None:
        addr = str(self._val(row, "address") or "")
        apn = self.apn(self._val(row, "apn"))
        b = basis(site, addr, apn)
        num = str(self._val(row, "permit_number") or "").strip()
        if not b or not num:
            return None
        tags = [t for t, rule in (self.cfg.get("tag_rules") or {}).items() if str(row.get(rule["field"], "")).upper() == str(rule["equals"]).upper()]
        return PermitRecord(
            jurisdiction=self.j.name, record_type=self.cfg.get("record_type", "permit"), permit_number=num,
            permit_type=self._val(row, "permit_type"), work_class=self._val(row, "work_class"), status=self._val(row, "status"),
            apply_date=self.iso_date(self._val(row, "apply_date")), issue_date=self.iso_date(self._val(row, "issue_date")),
            expire_date=self.iso_date(self._val(row, "expire_date")), final_date=self.iso_date(self._val(row, "final_date")),
            description=self._val(row, "description"), address=" ".join(addr.split()) or None, apn=apn,
            valuation_usd=self.money(self._val(row, "valuation_usd")), square_feet=self.money(self._val(row, "square_feet")),
            occupancy=self._val(row, "occupancy"), applicant=self._val(row, "applicant"), contractor=self._val(row, "contractor"),
            portal_url=f"https://data.boston.gov/dataset/approved-building-permits (permit {num})" if "boston" in self.cfg.get("base_url", "") else None,
            source=self.label, source_query=q, match_basis=b, extracted={"tags": tags} if tags else {}, source_id=num,
        )


class CsvDownloadAdapter(_FieldMapMixin, Adapter):
    """Full CSV exports (San José, Boston): streamed to a file cache once a day, filtered locally."""
    kind = "csv_download"

    def search(self, site: Site) -> list[PermitRecord]:
        out: dict[str, PermitRecord] = {}
        name_key = (site.street_name or "").upper()
        apn_key = apn_digits(site.apn)
        for url in self.cfg["urls"]:
            path = self.http.download_file(url, max_age_hours=self.cfg.get("max_age_hours", 24))
            q = f"GET {url} (full CSV export, filtered locally on address/APN; cached as {path.name})"
            with path.open(encoding="utf-8-sig", errors="replace", newline="") as fh:
                for row in csv.DictReader(fh):
                    raw_addr = str(self._val(row, "address") or "")
                    row_apn = str(self._val(row, "apn") or "")
                    if name_key not in raw_addr.upper() and not (apn_key and apn_key == apn_digits(row_apn)):
                        continue  # cheap prefilter before parsing the address
                    rec = self._to_record(row, site, q)
                    if rec and rec.permit_number not in out:
                        out[rec.permit_number] = rec
        return list(out.values())

    def _to_record(self, row: dict, site: Site, q: str) -> PermitRecord | None:
        addr = " ".join(str(self._val(row, "address") or "").replace(",", " ").split())
        apn = self.apn(self._val(row, "apn"))
        b = basis(site, addr, apn)
        num = str(self._val(row, "permit_number") or "").strip()
        if not b or not num:
            return None
        fmt = self.cfg.get("date_format")
        tags = [t for t, rule in (self.cfg.get("tag_rules") or {}).items()
                if str(row.get(rule["field"], "")).strip().upper() == str(rule["equals"]).upper()]
        return PermitRecord(
            jurisdiction=self.j.name, record_type=self.cfg.get("record_type", "permit"), permit_number=num,
            permit_type=self._val(row, "permit_type"), work_class=self._val(row, "work_class"), status=self._val(row, "status"),
            apply_date=self.iso_date(self._val(row, "apply_date"), fmt), issue_date=self.iso_date(self._val(row, "issue_date"), fmt),
            expire_date=self.iso_date(self._val(row, "expire_date"), fmt), final_date=self.iso_date(self._val(row, "final_date"), fmt),
            description=self._val(row, "description"), address=addr or None, apn=apn,
            valuation_usd=self.money(self._val(row, "valuation_usd")), square_feet=self.money(self._val(row, "square_feet")),
            occupancy=self._val(row, "occupancy") or None, contractor=self._val(row, "contractor") or None,
            applicant=self._val(row, "applicant") or None, portal_url=self.cfg.get("portal_url"),
            source=self.label, source_query=q, match_basis=b, extracted={"tags": tags} if tags else {}, source_id=num)
