"""Schemas for the permitting module. Every value carries its source and retrieval time."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal

from pydantic import BaseModel, Field


def utcnow() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


class Site(BaseModel):
    """A parsed site address. `raw` is exactly what the user typed."""

    raw: str
    number: str | None = None          # "2457" (or low end of a range)
    number_hi: str | None = None       # "2190" for "1950-2190"
    pre_dir: str | None = None         # "N"
    street_name: str | None = None     # "Industrial"
    suffix: str | None = None          # "PKWY" (USPS abbreviation)
    post_dir: str | None = None        # "W"
    unit: str | None = None
    city: str | None = None
    state: str | None = None
    zip: str | None = None
    apn: str | None = None             # normalized: digits and dashes (or block/lot)

    @property
    def street_line(self) -> str:
        parts = [self.number, self.pre_dir, self.street_name, self.suffix, self.post_dir]
        return " ".join(p for p in parts if p)

    @property
    def slug(self) -> str:
        import re
        s = f"{self.street_line} {self.city or ''} {self.state or ''}".lower()
        return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


class PermitRecord(BaseModel):
    jurisdiction: str
    record_type: Literal["permit", "plan", "inspection", "code_case"] = "permit"
    permit_number: str
    permit_type: str | None = None
    work_class: str | None = None
    status: str | None = None
    apply_date: str | None = None
    issue_date: str | None = None
    expire_date: str | None = None
    final_date: str | None = None
    description: str | None = None      # raw text, never rewritten
    address: str | None = None          # as the source gives it
    apn: str | None = None
    valuation_usd: float | None = None
    square_feet: float | None = None
    occupancy: str | None = None
    contractor: str | None = None
    applicant: str | None = None
    portal_url: str | None = None
    source: str
    source_query: str
    retrieved_at: str = Field(default_factory=utcnow)
    match_basis: Literal["address", "apn", "both"] = "address"
    extracted: dict[str, Any] = Field(default_factory=dict)
    confidence: Literal["documented", "extracted", "inferred"] = "documented"
    # Adapter-private handle for follow-up calls (e.g. EnerGov CaseId); not part of the published schema.
    source_id: str | None = Field(default=None, exclude=True)
    source_key: str | None = Field(default=None, exclude=True)


class Attachment(BaseModel):
    permit_number: str
    file_name: str
    attachment_group: str | None = None
    notes: str | None = None
    added_on: str | None = None
    attachment_id: str | None = None
    local_path: str | None = None
    bytes: int | None = None
    sha256: str | None = None
    source_url: str | None = None
    portal_url: str | None = None
    retrieved_at: str | None = None
    error: str | None = None


class MissingItem(BaseModel):
    field: str
    reason: str
    next_step: str
    detail: dict[str, Any] = Field(default_factory=dict)
