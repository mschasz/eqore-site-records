"""Adapter registry: the `adapter:` key in jurisdictions.yaml selects one of these."""
from .base import Adapter
from .browser import BrowserAdapter
from .ckan import CkanAdapter, CsvDownloadAdapter
from .energov import EnerGovAdapter
from .socrata import SocrataAdapter

ADAPTERS: dict[str, type[Adapter]] = {
    "energov": EnerGovAdapter,
    "socrata": SocrataAdapter,
    "ckan": CkanAdapter,
    "csv_download": CsvDownloadAdapter,
    "browser": BrowserAdapter,
}

__all__ = ["ADAPTERS", "Adapter"]
