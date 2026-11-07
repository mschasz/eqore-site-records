"""Common site-record format shared by every utility adapter.

Every value is a dict:
    {"value": ..., "unit": "...", "source": {"name": ..., "url": <exact query URL>},
     "retrieved": "YYYY-MM-DD", "confidence": "high"|"medium"|"low",
     "data_date": "<the utility's own date for this value>", "note": "..."}
Fields that could not be filled are null and appear in `gaps` with why EQORE needs them and how to
collect them remotely. Network errors and empty results go in `errors` / `notes`; nothing raises.
"""
from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Any

SCHEMA = "eqore.site_record/v1"

CAUTION_CAPACITY = ("Hosting capacity values are utility screening estimates, not an approval or a cost estimate, "
                    "and they change over time.")
CAUTION_ZERO = ("A value of 0 can mean the feeder is already constrained, there is an upstream limit, or it was not analyzed. "
                "It does not mean the project cannot happen: the utility may require upgrades or conditions; confirm with a "
                "pre-application inquiry.")
CAUTION_BATTERY = ("A battery both charges (acts like load) and discharges (acts like generation); both capacities matter.")

# Why each record field matters, and how to fill it remotely when public data does not.
FIELD_GAPS: dict[str, tuple[str, str]] = {
    "site.lat": ("Coordinates locate the site on the utility's feeder map.",
                 "Confirm the service address on the customer's utility bill, or ask for the address of the meter."),
    "feeder.id": ("The feeder determines interconnection screens, hosting limits and which utility engineer reviews the project.",
                  "Ask the utility for the circuit ID in a pre-application report, or ask the customer for a recent interconnection or service letter."),
    "feeder.name": ("A feeder name is how utility engineers refer to the circuit in correspondence.",
                    "Request it in the utility pre-application report."),
    "feeder.substation": ("The substation sets upstream limits (bank capacity, protection) that can constrain the project.",
                          "Request it in the utility pre-application report."),
    "feeder_voltage_kv": ("Feeder voltage affects interconnection equipment and screening thresholds.",
                          "Request it in the utility pre-application report."),
    "hosting_capacity.generation": ("Discharging the battery to the grid side behaves like generation; this limit can cap export or require upgrades.",
                                    "Ask the utility in a pre-application inquiry; until then, design for non-export."),
    "hosting_capacity.load": ("Charging the battery adds load; this limit can cap charging power or require upgrades.",
                              "Ask the utility in a pre-application inquiry for load capacity at the service point."),
    "hosting_capacity.computed": ("Capacity values are only meaningful with the date the utility computed them.",
                                  "Note the analysis date from the utility map when reviewing, or request it with the pre-application report."),
    "hosting_capacity.limiting_criteria": ("The limiting criterion (thermal, voltage, protection) tells the engineer what kind of mitigation may be needed.",
                                           "Request it in the utility pre-application report."),
}

SAFETY = "Do not open equipment, remove covers, or climb to photograph a transformer; photograph only labels you can see from the floor."

# Items public utility data usually cannot provide, phrased as requests the customer can act on.
SITE_GAPS: list[dict[str, str]] = [
    {"field": "service_voltage_and_configuration", "why": "Sets the battery inverter voltage and the transformer, if any, between battery and switchgear.",
     "how_to_collect": "Customer photo of the nameplate label on the main switchboard or panel (voltage, e.g. 480Y/277V, and phase/wire).",
     "who": "customer"},
    {"field": "main_service_amps_and_main_breaker", "why": "The main breaker and service size limit how much battery power can connect without a service upgrade.",
     "how_to_collect": "Customer photo of the main breaker handle and its rating label (e.g. 2000 A), plus the switchboard nameplate.",
     "who": "customer"},
    {"field": "bus_rating_and_configuration", "why": "The bus rating decides whether a load-side connection passes the NEC 705.12 120% rule.",
     "how_to_collect": "Customer photo of the switchboard or panel nameplate showing the bus rating.",
     "who": "customer"},
    {"field": "single_line_diagram", "why": "The SLD shows the service, existing generation and where the battery can tie in.",
     "how_to_collect": "Ask the customer for any existing single-line diagram (often framed in the electrical room or in past permit sets).",
     "who": "customer"},
    {"field": "transformer_kva_ratio_impedance_age", "why": "Transformer size and impedance set available fault current and can limit export and charging.",
     "how_to_collect": "Request transformer kVA, voltage ratio and impedance from the utility (pre-application or service request).",
     "who": "utility"},
    {"field": "available_fault_current", "why": "Equipment must be rated for the available fault current at the point of connection.",
     "how_to_collect": "Request an available-fault-current letter from the utility for the service address.",
     "who": "utility"},
    {"field": "spare_breaker_positions_or_bus_space", "why": "An open breaker position or bus space is the cheapest place to connect the battery.",
     "how_to_collect": "Customer photo of the main switchboard front showing breaker positions and any blank spaces (doors closed is fine).",
     "who": "customer"},
    {"field": "service_point_and_meter_location", "why": "The meter and service point locate the interconnection and the equipment pad.",
     "how_to_collect": "Customer photo of the utility meter(s) and a marked-up site photo or map showing where they are.",
     "who": "customer"},
]
for g in SITE_GAPS:
    if g["who"] == "customer":
        g["safety"] = SAFETY


def today() -> str:
    return date.today().isoformat()


def utcnow() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def val(value: Any, source_name: str, url: str, confidence: str, *, unit: str | None = None,
        data_date: str | None = None, note: str | None = None) -> dict[str, Any]:
    v: dict[str, Any] = {"value": value, "source": {"name": source_name, "url": url}, "retrieved": today(), "confidence": confidence}
    if unit:
        v["unit"] = unit
    if data_date:
        v["data_date"] = data_date
    if note:
        v["note"] = note
    return v


def new_record(address: str, utility: str) -> dict[str, Any]:
    return {
        "schema": SCHEMA, "generated_at": utcnow(), "input": {"address": address, "utility": utility},
        "site": {"address": None, "lat": None, "lon": None},
        "utility": None,
        "feeder": {"id": None, "name": None, "substation": None, "division": None},
        "feeder_voltage_kv": None, "phases": None,
        "hosting_capacity": {"generation": None, "load": None, "computed": None, "limiting_criteria": None},
        "match": None, "extra": {}, "gaps": [], "site_gaps": [dict(g) for g in SITE_GAPS],
        "notes": [], "errors": [], "queries": [],
        "cautions": [CAUTION_CAPACITY, CAUTION_ZERO, CAUTION_BATTERY],
    }


def get_path(rec: dict, path: str) -> Any:
    cur: Any = rec
    for p in path.split("."):
        if not isinstance(cur, dict):
            return None
        cur = cur.get(p)
    return cur


def finalize_gaps(rec: dict, reasons: dict[str, str] | None = None) -> dict:
    """Every empty field becomes an explicit gap with why it matters and how to collect it remotely."""
    reasons = reasons or {}
    rec["gaps"] = []
    for path, (why, how) in FIELD_GAPS.items():
        if get_path(rec, path) is None:
            rec["gaps"].append({"field": path, "why": why, "how_to_collect": how,
                                "reason": reasons.get(path) or reasons.get("*") or "Not provided by the public data source."})
    if rec["site"]["lon"] is None and not any(g["field"] == "site.lat" for g in rec["gaps"]):
        rec["gaps"].insert(0, {"field": "site.lat", "why": FIELD_GAPS["site.lat"][0], "how_to_collect": FIELD_GAPS["site.lat"][1],
                               "reason": reasons.get("site.lat", "Geocoding failed.")})
    return rec
