"""Adapter interface. Every permit source implements search / get_detail / list_attachments / download."""
from __future__ import annotations

import hashlib
import re
from abc import ABC, abstractmethod
from datetime import datetime
from pathlib import Path
from typing import Any

from ..address import apn_digits, normalize_apn
from ..http import HttpClient
from ..jurisdictions import Jurisdiction
from ..models import Attachment, PermitRecord, Site


class Adapter(ABC):
    kind = "base"

    def __init__(self, jurisdiction: Jurisdiction, cfg: dict[str, Any], http: HttpClient):
        self.j = jurisdiction
        self.cfg = cfg
        self.http = http
        self.notes: list[str] = []   # adapter-level observations surfaced in missing.json

    @property
    def label(self) -> str:
        return self.cfg.get("label", self.kind)

    @abstractmethod
    def search(self, site: Site) -> list[PermitRecord]:
        ...

    def get_detail(self, record: PermitRecord) -> PermitRecord:
        return record

    def list_attachments(self, record: PermitRecord) -> list[Attachment]:
        return []

    def download(self, attachment: Attachment, dest: Path) -> Attachment:
        raise NotImplementedError(f"{self.kind} does not download files")

    def nearby(self, site: Site, limit: int = 6) -> list[dict[str, Any]]:
        """House numbers on the same street that do have records (for not-found addresses)."""
        return []

    # ---------------------------------------------------------------- helpers
    @staticmethod
    def iso_date(v: Any, fmt: str | None = None) -> str | None:
        if v in (None, "", "null"):
            return None
        s = str(v).strip()
        if fmt:
            try:
                return datetime.strptime(s, fmt).date().isoformat()
            except ValueError:
                pass
        m = re.match(r"(\d{4}-\d{2}-\d{2})", s)
        if m:
            return m.group(1)
        m = re.match(r"(\d{1,2})/(\d{1,2})/(\d{4})", s)
        if m:
            return f"{m.group(3)}-{int(m.group(1)):02d}-{int(m.group(2)):02d}"
        return None

    @staticmethod
    def money(v: Any) -> float | None:
        if v in (None, ""):
            return None
        try:
            x = float(re.sub(r"[^0-9.\-]", "", str(v)))
        except ValueError:
            return None
        return x if x else None

    @staticmethod
    def apn(v: Any) -> str | None:
        return normalize_apn(v)

    @staticmethod
    def sha256_file(p: Path) -> str:
        h = hashlib.sha256()
        with p.open("rb") as f:
            for chunk in iter(lambda: f.read(1 << 20), b""):
                h.update(chunk)
        return h.hexdigest()

    @staticmethod
    def site_vars(site: Site) -> dict[str, str]:
        blk = lot = ""
        if site.apn and "/" in site.apn:
            blk, lot = site.apn.split("/", 1)
        return {"number": site.number or "", "number_hi": site.number_hi or "", "name": site.street_name or "",
                "name_upper": (site.street_name or "").upper().replace("'", "''"), "suffix": site.suffix or "",
                "post_dir": site.post_dir or "", "pre_dir": site.pre_dir or "", "street_line": site.street_line,
                "apn": site.apn or "", "apn_digits": apn_digits(site.apn), "block": blk, "lot": lot}
