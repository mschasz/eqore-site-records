"""Socrata (SODA / SoQL) adapter: San Francisco, Los Angeles, Cambridge.

All dataset ids, SoQL templates and field maps come from jurisdictions.yaml. Records are filtered
locally with the matcher, because a street-wide query (used for number ranges like '1950-2190')
returns every house number on the street.
"""
from __future__ import annotations

from typing import Any

from ..matcher import address_matches, basis
from ..models import PermitRecord, Site
from .base import Adapter

PAGE = 1000


def pick(row: dict, spec: Any, joiner: str = " ") -> Any:
    """Field spec is a column name, or a list (first non-empty for scalars; joined for address/apn)."""
    if spec is None:
        return None
    if isinstance(spec, list):
        vals = [row.get(k) for k in spec]
        return vals
    return row.get(spec)


class SocrataAdapter(Adapter):
    kind = "socrata"

    @property
    def endpoint(self) -> str:
        return f"https://{self.cfg['domain']}/resource/{self.cfg['dataset']}.json"

    def _query(self, where: str) -> tuple[list[dict], str]:
        rows: list[dict] = []
        offset = 0
        while True:
            params = {"$where": where, "$limit": PAGE, "$offset": offset}
            if self.cfg.get("order"):
                params["$order"] = self.cfg["order"]
            r = self.http.get(self.endpoint, params=params)
            r.raise_for_status()
            batch = r.json()
            rows += batch
            if len(batch) < PAGE:
                break
            offset += PAGE
        return rows, f"GET {self.endpoint} $where={where}" + (f" $order={self.cfg['order']}" if self.cfg.get("order") else "")

    def search(self, site: Site) -> list[PermitRecord]:
        v = self.site_vars(site)
        queries: list[str] = []
        if site.number and site.street_name:
            if site.number_hi and self.cfg.get("where_street"):
                queries.append(self.cfg["where_street"].format(**v))
            elif self.cfg.get("where_address"):
                queries.append(self.cfg["where_address"].format(**v))
        if site.apn and self.cfg.get("where_apn") and (("/" in site.apn) or "{block}" not in self.cfg["where_apn"]):
            queries.append(self.cfg["where_apn"].format(**v))
        out: dict[str, PermitRecord] = {}
        for where in queries:
            rows, q = self._query(where)
            for row in rows:
                rec = self._to_record(row, site, q)
                if rec is None:
                    continue
                prev = out.get(rec.permit_number)
                if prev and prev.match_basis != rec.match_basis:
                    prev.match_basis = "both"
                out.setdefault(rec.permit_number, rec)
        records = list(out.values())
        if self.cfg.get("follow_url_field"):
            records = [self._follow(r) for r in records]
        return records

    def _addr_text(self, row: dict) -> str:
        spec = self.cfg["fields"].get("address")
        val = pick(row, spec)
        if isinstance(val, list):
            return " ".join(str(x) for x in val if x)
        return str(val or "")

    def _apn(self, row: dict) -> str | None:
        val = pick(row, self.cfg["fields"].get("apn"))
        if isinstance(val, list):
            parts = [str(x) for x in val if x]
            return "/".join(parts) if len(parts) == 2 else None
        return self.apn(val)

    def _first(self, row: dict, key: str) -> Any:
        val = pick(row, self.cfg["fields"].get(key))
        if isinstance(val, list):
            return next((x for x in val if x not in (None, "")), None)
        return val

    def _to_record(self, row: dict, site: Site, q: str) -> PermitRecord | None:
        f = self.cfg["fields"]
        addr = self._addr_text(row)
        apn = self._apn(row)
        if f.get("number") and f.get("street_name"):
            ok_addr = address_matches(site, number=row.get(f["number"]), street_name=row.get(f["street_name"]))
            b = ("both" if ok_addr and site.apn and apn and apn.replace("/", "") == site.apn.replace("/", "") else
                 "address" if ok_addr else "apn" if site.apn and apn and apn.replace("/", "") == site.apn.replace("/", "") else None)
        else:
            b = basis(site, addr, apn)
        if not b:
            return None
        num = str(self._first(row, "permit_number") or "").strip()
        if self.cfg.get("id_prefix_field"):
            num = f"{row.get(self.cfg['id_prefix_field'], '')}-{num}".strip("-")
        if not num:
            return None
        desc = pick(row, f.get("description"))
        if isinstance(desc, list):
            desc = " | ".join(str(x) for x in desc if x) or None
        extracted: dict[str, Any] = {}
        for tag, col in (self.cfg.get("flag_fields") or {}).items():
            if str(row.get(col, "")).strip().upper() in ("Y", "YES", "TRUE", "1"):
                extracted.setdefault("tags", []).append(tag)
        return PermitRecord(
            jurisdiction=self.j.name, record_type=self.cfg.get("record_type", "permit"), permit_number=num,
            permit_type=self._first(row, "permit_type") or self.cfg.get("permit_type_default"), work_class=self._first(row, "work_class"),
            status=self._first(row, "status"), apply_date=self.iso_date(self._first(row, "apply_date")),
            issue_date=self.iso_date(self._first(row, "issue_date")), expire_date=self.iso_date(self._first(row, "expire_date")),
            final_date=self.iso_date(self._first(row, "final_date")), description=desc, address=" ".join(addr.split()) or None, apn=apn,
            valuation_usd=self.money(self._first(row, "valuation_usd")), square_feet=self.money(self._first(row, "square_feet")),
            occupancy=self._first(row, "occupancy"), contractor=self._first(row, "contractor"), applicant=self._first(row, "applicant"),
            portal_url=(self.cfg.get("portal_url") or self.cfg.get("record_api_url") or "").format(permit_number=num) or None,
            source=self.label, source_query=q, match_basis=b, extracted=extracted, source_id=num,
            source_key=(row.get(self.cfg["follow_url_field"]) or {}).get("url") if self.cfg.get("follow_url_field") and isinstance(row.get(self.cfg["follow_url_field"]), dict) else None,
        )

    def _follow(self, rec: PermitRecord) -> PermitRecord:
        """Cambridge: the index row links to the full record in the permit type's own dataset."""
        if not rec.source_key:
            return rec
        r = self.http.get(rec.source_key)
        if r.status >= 400:
            self.notes.append(f"Could not follow {rec.source_key}: HTTP {r.status}")
            return rec
        rows = r.json()
        if not rows:
            return rec
        row = rows[0]
        desc = next((row[k] for k in self.cfg.get("follow_description_fields", []) if row.get(k)), None)
        val = next((self.money(row[k]) for k in self.cfg.get("follow_valuation_fields", []) if self.money(row.get(k))), None)
        documented = {}
        for key, col in (self.cfg.get("follow_documented_fields") or {}).items():
            v = row.get(col)
            if v not in (None, "", "0"):
                documented[key] = float(v) if str(v).replace(".", "", 1).isdigit() else v
        ex = dict(rec.extracted)
        if documented:
            ex.update(documented)
            ex["documented_fields"] = sorted(documented)
        return rec.model_copy(update={"description": desc or rec.description, "portal_url": rec.source_key, "extracted": ex,
                                      "valuation_usd": val or rec.valuation_usd,
                                      "source_query": rec.source_query + f" | GET {rec.source_key}"})

    def nearby(self, site: Site, limit: int = 6) -> list[dict[str, Any]]:
        f = self.cfg["fields"]
        if not (self.cfg.get("where_street") and f.get("number") and site.number):
            return []
        rows, _ = self._query(self.cfg["where_street"].format(**self.site_vars(site)))
        import re
        target = int(re.match(r"\d+", site.number).group(0))
        found: dict[int, set[str]] = {}
        for row in rows:
            m = re.match(r"\d+", str(row.get(f["number"]) or ""))
            if m:
                found.setdefault(int(m.group(0)), set()).add(self._apn(row) or "")
        near = sorted(found, key=lambda n: (abs(n - target), n))[:limit]
        return [{"address": f"{n} {site.street_name} {(site.suffix or '').title()}".strip(), "apns": sorted(a for a in found[n] if a),
                 "distance_in_house_numbers": abs(n - target)} for n in near]
