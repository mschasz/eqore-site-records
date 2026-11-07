"""Build context shared by pipeline steps: the record being built, the HTTP
client, and helpers that guarantee every field carries full provenance."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from typing import Any, Optional

from .address import ParsedAddress
from .http import HttpClient, canonical_url
from .schema import (
    SECTIONS, Field, Flag, Missing, SiteRecord, SourceError, SourceStatus, Value,
)
from .sources import SOURCES

S_ID, S_PARCEL, S_ZONING, S_AHJ, S_HAZ, S_ELEC, S_BESS = SECTIONS


@dataclass
class Point:
    lat: float
    lon: float

    @property
    def esri(self) -> str:
        return f"{self.lon},{self.lat}"


@dataclass
class Ctx:
    record: SiteRecord
    client: HttpClient
    today: str = field(default_factory=lambda: date.today().isoformat())
    point: Optional[Point] = None
    addr: ParsedAddress = field(default_factory=ParsedAddress)  # entered address, Census-normalized when matched
    geocode: dict = field(default_factory=dict)   # parsed Census match, for later steps
    shared: dict = field(default_factory=dict)    # values one step leaves for another

    # -- provenance helpers ---------------------------------------------------
    def value(self, source: str, value: Any, *, confidence: str, note: str = "",
              vintage: Optional[str] = None, url: Optional[str] = None) -> Value:
        s = SOURCES[source]
        return Value(value=value, source=source, source_label=s.label,
                     source_url=url if url is not None else (s.url or None),
                     vintage=vintage if vintage is not None else s.vintage,
                     confidence=confidence, note=note)

    def add_field(self, fid: str, section: str, label: str, source: str, value: Any, *,
                  display: str = "", status: str, confidence: str, note: str = "",
                  vintage: Optional[str] = None, url: Optional[str] = None,
                  who: Optional[str] = None) -> Field:
        v = self.value(source, value, confidence=confidence, note=note, vintage=vintage, url=url)
        f = Field(**v.model_dump(), id=fid, section=section, label=label,
                  display=display or ("" if value is None else str(value)),
                  status=status, who=who)
        # replace if a later step refines the same field
        self.record.fields = [x for x in self.record.fields if x.id != fid] + [f]
        self.record.missing = [m for m in self.record.missing if m.field_id != fid]
        if status == "needed" and who:
            self.add_missing(label, note or "Not available from public sources", who, fid)
        return f

    def add_needed(self, fid: str, section: str, label: str, why: str, who: str,
                   source: str = "computed", display: str = "Not available") -> Field:
        return self.add_field(fid, section, label, source, None, display=display,
                              status="needed", confidence="low", note=why, who=who)

    def flag(self, severity: str, title: str, detail: str, *field_ids: str, origin: str = "") -> None:
        self.record.flags.append(Flag(severity=severity, title=title, detail=detail,
                                      field_ids=list(field_ids), origin=origin))

    def add_missing(self, item: str, why: str, who: str, field_id: Optional[str] = None) -> None:
        if any(m.field_id == field_id and field_id for m in self.record.missing):
            self.record.missing = [m for m in self.record.missing if m.field_id != field_id]
        self.record.missing.append(Missing(item=item, why=why, who=who, field_id=field_id))

    def error(self, source: str, err: Exception, url: Optional[str] = None) -> None:
        s = SOURCES[source]
        self.record.source_errors.append(SourceError(
            source=source, source_label=s.label, url=getattr(err, "url", None) or url,
            error=str(err), at=datetime.now(timezone.utc).isoformat(timespec="seconds")))
        self.status(source, "failed", str(err))

    def status(self, source: str, status: str, summary: str = "",
               vintage: Optional[str] = None) -> None:
        s = SOURCES[source]
        self.record.sources = [x for x in self.record.sources if x.source != source]
        self.record.sources.append(SourceStatus(
            source=source, source_label=s.label, url=s.url or None,
            vintage=vintage or s.vintage, license=s.license, status=status, summary=summary))

    # -- ArcGIS helper -----------------------------------------------------------
    def arcgis_point(self, source: str, *, out_fields: str = "*", distance_m: Optional[float] = None,
                     return_geometry: bool = False, layer_url: Optional[str] = None) -> list[dict]:
        """Point (or point-buffer) intersect query against an ArcGIS layer.
        Returns the features list. Raises FetchError on failure."""
        assert self.point is not None
        url = (layer_url or SOURCES[source].url) + "/query"
        params: dict[str, Any] = {
            "geometry": self.point.esri, "geometryType": "esriGeometryPoint", "inSR": 4326,
            "spatialRel": "esriSpatialRelIntersects", "outFields": out_fields,
            "returnGeometry": str(return_geometry).lower(), "f": "json",
        }
        if return_geometry:
            params["outSR"] = 4326
        if distance_m:
            params.update(distance=distance_m, units="esriSRUnit_Meter")
        data = self.client.get_json(source, url, params)
        return data.get("features", [])

    def query_url(self, source: str, params: dict) -> str:
        return canonical_url(SOURCES[source].url + "/query", params)


def epoch_ms_to_date(ms: Optional[int]) -> Optional[str]:
    if not ms:
        return None
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).date().isoformat()
