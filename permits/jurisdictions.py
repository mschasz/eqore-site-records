"""Jurisdiction resolver: address -> city/town -> registry entry -> adapters."""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

from .models import Site

DEFAULT_REGISTRY = Path(__file__).resolve().parent.parent / "jurisdictions.yaml"


@dataclass
class Jurisdiction:
    id: str
    name: str
    state: str
    config: dict[str, Any]

    @property
    def sources(self) -> list[dict[str, Any]]:
        return self.config.get("sources", [])


class Registry:
    def __init__(self, path: Path | str = DEFAULT_REGISTRY):
        self.path = Path(path)
        data = yaml.safe_load(self.path.read_text())
        self.client: dict[str, Any] = data.get("client", {})
        self.jurisdictions = [Jurisdiction(j["id"], j["name"], j["state"], j) for j in data["jurisdictions"]]

    def resolve(self, site: Site) -> Jurisdiction | None:
        city = (site.city or "").strip().lower()
        for j in self.jurisdictions:
            if site.state and j.state != site.state:
                continue
            if city and city in [c.lower() for c in j.config.get("cities", [])]:
                return j
        if site.zip:
            for j in self.jurisdictions:
                if site.zip in j.config.get("zips", []):
                    return j
        return None

    def get(self, jid: str) -> Jurisdiction:
        return next(j for j in self.jurisdictions if j.id == jid)
