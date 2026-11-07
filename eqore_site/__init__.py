"""EQORE site-record tool: address + proposed BESS -> source-tagged site record.

Public interface:
    from eqore_site import build_site_record, SiteRecord, ProposedSystem, HttpClient
    rec = build_site_record("888 Tennessee St, San Francisco, CA")
    rec.model_dump()          # JSON-ready dict
    SiteRecord.json_schema()  # JSON Schema
"""

from .http import HttpClient
from .pipeline import build_confirmed_record, build_site_record
from .edit import clear_bess, enter_values, place_bess
from .resolve import confirm_apn
from .schema import SCHEMA_VERSION, ProposedSystem, SiteRecord

__all__ = ["build_site_record", "build_confirmed_record", "confirm_apn", "place_bess", "clear_bess", "enter_values", "SiteRecord", "ProposedSystem", "HttpClient", "SCHEMA_VERSION"]
__version__ = "0.1.0"
