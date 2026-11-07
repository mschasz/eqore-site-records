"""EQORE-owned AHJ table (handoff §6.2): one row per jurisdiction, seeded from
lookups and confirmed by a person. No dataset replaces it.

Columns: county_fips, city, jurisdiction, building_dept, permit_portal, fire_ahj,
fire_plan_check, planning_contact, ess_checklist, adopted_code, local_amendments,
extra_requirement, extra_who, sources, seeded_on, confirmed_by, confirmed_on, notes.

A row with no `confirmed_by` is a seed: its values come through as `confirm`
with low confidence. Blank cells stay `needed`."""

from __future__ import annotations

import csv
from functools import lru_cache
from pathlib import Path

from ..context import S_AHJ, Ctx

TABLE = Path(__file__).with_name("ahj_table.csv")
SRC = "eqore_ahj_table"


@lru_cache(maxsize=1)
def load() -> dict[tuple[str, str], dict]:
    with TABLE.open(newline="") as f:
        return {(r["county_fips"], r["city"].upper()): r for r in csv.DictReader(f)}


def lookup(county_fips: str | None, city: str | None) -> dict | None:
    return load().get((county_fips or "", (city or "UNINCORPORATED").upper()))


def run(ctx: Ctx) -> None:
    city = ctx.shared.get("city")
    row = lookup(ctx.record.county_fips, city)
    where = city or "this unincorporated area"
    if row is None:
        ctx.status(SRC, "no_result", f"No row for {where}")
        for fid, label in (("d_bldg", "Building permit authority and portal"), ("d_plan", "Planning contact"),
                           ("d_check", "Energy storage submittal checklist")):
            ctx.add_needed(fid, S_AHJ, label, f"No row for {where} in the EQORE AHJ table yet; add one and have "
                                              "a person confirm it.", "EQORE")
        return
    confirmed = bool(row.get("confirmed_by"))
    conf = "medium" if confirmed else "low"
    vint = f"confirmed {row['confirmed_on']} by {row['confirmed_by']}" if confirmed else f"unconfirmed seed {row['seeded_on']}"
    base = f"EQORE AHJ table row for {row['jurisdiction']}. Sources: {row['sources']}."
    status = "filled" if confirmed else "confirm"

    def put(fid, label, value, extra=""):
        if value:
            ctx.add_field(fid, S_AHJ, label, SRC, value, status=status, confidence=conf, vintage=vint,
                          who=None if confirmed else "EQORE", note=(extra + " " + base).strip())
        else:
            ctx.add_needed(fid, S_AHJ, label, f"Blank in the EQORE AHJ table row for {row['jurisdiction']}. "
                                              + (extra or ""), "EQORE")

    portal = row["permit_portal"]
    put("d_bldg", "Building permit authority and portal",
        f"{row['building_dept']}. Portal: {portal}" if portal else row["building_dept"],
        "Confirm the department and permit types for battery storage.")
    put("d_plan", "Planning contact", row["planning_contact"])
    put("d_check", "Energy storage submittal checklist", row["ess_checklist"],
        row["notes"] if not row["ess_checklist"] else "")
    if row["local_amendments"]:
        put("d_amend", "Local code amendments", row["local_amendments"])
    if row["extra_requirement"]:
        ctx.add_field("d_extra", S_AHJ, "Local submittal requirement", SRC, row["extra_requirement"],
                      status="needed", confidence=conf, vintage=vint, who=row.get("extra_who") or "Customer",
                      note=base)
    fire = ctx.record.field("d_fire")
    if fire is not None and row["fire_plan_check"]:
        fire.display += f" Fire plan check {row['fire_plan_check']} (AHJ table)."
        fire.note += f" Plan-check phone from the EQORE AHJ table ({vint})."
    ctx.status(SRC, "retrieved", f"Row for {row['jurisdiction']} ({vint})", vintage=vint)
