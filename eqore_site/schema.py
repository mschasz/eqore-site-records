"""Site-record schema (handoff §3).

Every value in the record is a `Value` (or a `Field`, which is a `Value` plus
display metadata). No bare values: each carries value, source, source_label,
source_url, vintage, confidence and note.

`SiteRecord.json_schema()` exports the JSON Schema teammates can code against.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field as PField

SCHEMA_VERSION = "0.1.0"

Confidence = Literal["high", "medium", "low"]
FieldStatus = Literal["filled", "confirm", "needed", "provided"]
Who = Literal["Customer", "EQORE", "Utility"]
Severity = Literal["warn", "info"]
RecordStatus = Literal["needs_confirmation", "confirmed"]

# Section names, in display order (same as the Hayward reference page).
SECTIONS = [
    "Site identity and ownership",
    "Parcel and buildings",
    "Zoning and jurisdiction",
    "Permitting authorities and codes",
    "Hazards and environment",
    "Electrical service and utility",
    "BESS placement",
]


class Value(BaseModel):
    """One sourced value. `value` is None when the lookup produced nothing."""

    value: Any = None
    source: str = PField(description="Machine key of the source, e.g. 'census_geocoder'")
    source_label: str = PField(description="Human-readable source name")
    source_url: Optional[str] = PField(default=None, description="URL queried or documenting the source")
    vintage: Optional[str] = PField(default=None, description="Data date / edition as stated by the source, or 'queried YYYY-MM-DD'")
    confidence: Confidence = "low"
    note: str = ""


class Field(Value):
    """A record field: a sourced value plus what the UI needs to show it."""

    id: str = PField(description="Stable field id, e.g. 'a_ll', 'e_liq' (matches the Hayward reference page)")
    section: str
    label: str
    display: str = PField(default="", description="Short human-readable rendering of `value`")
    status: FieldStatus = PField(description="filled = auto, trust it; confirm = auto, a person must confirm; needed = not available; provided = entered by a person")
    who: Optional[Who] = PField(default=None, description="Who provides or confirms it when status is confirm/needed")


class Flag(BaseModel):
    severity: Severity
    title: str
    detail: str
    field_ids: list[str] = []
    origin: str = PField(default="", description="'crosscheck' for flags recomputed by crosscheck.run")


class Missing(BaseModel):
    item: str
    why: str
    who: Who
    field_id: Optional[str] = None


class SourceError(BaseModel):
    source: str
    source_label: str
    url: Optional[str] = None
    error: str
    at: str


class SourceStatus(BaseModel):
    """One row of the Sources tab: what was consulted and what came back."""

    source: str
    source_label: str
    url: Optional[str] = None
    vintage: Optional[str] = None
    license: str = "not stated"
    status: Literal["retrieved", "no_result", "failed", "not_queried"]
    summary: str = ""


class Candidate(BaseModel):
    """A parcel that might be the site. Never auto-selected.

    `fields` holds parcel-level facts for this candidate (buildings, use,
    energy, permits...) so a UI can switch between candidates."""

    apn: Value
    situs: Value
    match_method: Literal["situs_address", "situs_partial", "point_in_polygon", "nearest_address", "nearby",
                          "apn_lookup"] = PField(
        description="situs_address: address matches; situs_partial: number and street name match but suffix or "
                    "direction differs; point_in_polygon: contains the geocoded point; "
                    "nearest_address: closest house number on the same street; nearby: within a few metres; "
                    "apn_lookup: fetched because a person supplied this APN")
    distance_m: Optional[float] = PField(default=None, description="Geocoded point to parcel boundary, 0 if inside")
    contains_point: bool = False
    area_sqft: Optional[Value] = None
    geometry: Optional[dict] = PField(default=None, description="GeoJSON polygon, EPSG:4326")
    related_apns: list[str] = PField(default=[], description="Other APNs with the identical polygon (e.g. condo units)")
    found_in: list[str] = PField(default=[], description="Source keys whose layers list this parcel")
    situs_matched_by: list[str] = PField(default=[], description="Source keys whose situs address matches the entered address")
    fields: list[Field] = []
    note: str = ""


class ProposedSystem(BaseModel):
    """The BESS EQORE proposed. All optional; echoed into the record."""

    manufacturer: Optional[str] = None
    model: Optional[str] = None
    energy_kwh: Optional[float] = None
    power_kw: Optional[float] = None
    chemistry: Optional[str] = None
    placement: Optional[Literal["indoor", "outdoor", "rooftop"]] = None
    notes: Optional[str] = None


class RecordInput(BaseModel):
    address: str
    proposed_system: Optional[ProposedSystem] = None


class FormPrefillItem(BaseModel):
    """One line of the permit/lead-form prefill (prefill.py)."""

    form: str = PField(default="", description="Submittal section, e.g. '2. Site plan'")
    field: str
    value: Any = None
    status: Literal["filled", "review", "missing"] = PField(
        description="filled: from a source or a person; review: found, needs a person; missing")
    from_field: Optional[str] = PField(default=None, description="Record field id it comes from")
    source_label: Optional[str] = None
    confidence: Optional[Confidence] = None
    note: str = ""


class SiteRecord(BaseModel):
    schema_version: str = SCHEMA_VERSION
    record_id: Optional[str] = PField(default=None, description="Set by the API store")
    generated_at: str = PField(default_factory=lambda: datetime.now(timezone.utc).isoformat(timespec="seconds"))
    status: RecordStatus = "needs_confirmation"
    input: RecordInput
    location: Optional[Value] = PField(default=None, description="Geocoded point {lat, lon}. Not guaranteed to be inside the lot.")
    county_fips: Optional[str] = None
    fields: list[Field] = []
    candidates: list[Candidate] = []
    confirmed_apn: Optional[str] = None
    shown_candidate: Optional[str] = PField(default=None, description="APN whose parcel-level fields are shown at record level")
    flags: list[Flag] = []
    missing: list[Missing] = []
    source_errors: list[SourceError] = []
    sources: list[SourceStatus] = []
    form_prefill: list[FormPrefillItem] = []
    summary: dict = PField(default={}, description="Completeness against the required-input list, who owes what, flag counts")

    def field(self, field_id: str) -> Optional[Field]:
        return next((f for f in self.fields if f.id == field_id), None)

    @classmethod
    def json_schema(cls) -> dict:
        return cls.model_json_schema()
