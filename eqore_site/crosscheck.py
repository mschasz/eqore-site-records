"""Record-level cross-checks (handoff §5). Run last; rerun after confirmation.

Each check reads fields already in the record and adds `origin="crosscheck"`
flags; `run` first clears its previous flags so it is safe to call repeatedly.
Per-candidate checks that need raw layer data (footprint straddles, footprint x
stories vs floor area, permits disagreeing) live in the adapters.

Nothing here encodes code rules (NFPA 855 / CFC): flags are prompts for a person."""

from __future__ import annotations

import re
from datetime import date

from .context import Ctx

ORIGIN = "crosscheck"
STALE_YEARS = 5

# Background knowledge (handoff §4: "Bay Area municipal utilities are not PG&E"); used only to raise a flag.
BAY_AREA_POU_CITIES = {
    "PALO ALTO": "City of Palo Alto Utilities",
    "SANTA CLARA": "Silicon Valley Power",
    "ALAMEDA": "Alameda Municipal Power",
    "HEALDSBURG": "City of Healdsburg Electric",
}
# Loose map from benchmarking property types to the occupancy group letters you would expect on permits.
USE_TO_OCC = [
    (r"office|lab|bank|medical office", "B"), (r"warehouse|storage|distribution|self-storage", "S"),
    (r"retail|store|supermarket|grocery|restaurant", "M"), (r"manufactur|industrial", "F"),
    (r"multifamily|residential|hotel|dormitor|senior living", "R"), (r"school|k-12", "E"),
    (r"hospital", "I"),
]


def _flag(ctx: Ctx, sev: str, title: str, detail: str, *ids: str) -> None:
    ctx.flag(sev, title, detail, *ids, origin=ORIGIN)


def run(ctx: Ctx) -> None:
    ctx.record.flags = [f for f in ctx.record.flags if f.origin != ORIGIN]
    for check in (stale_sources, assumed_utility, zoning_city_vs_regional, coverage, owner, use_vs_permits,
                  proposed_vs_site):
        check(ctx)


def stale_sources(ctx: Ctx) -> None:
    this_year = date.fromisoformat(ctx.today).year
    old = []
    for f in ctx.record.fields:
        if f.status == "needed" or not f.vintage or f.id == "d_fire":   # fire district has its own flag
            continue
        m = re.search(r"\b(19|20)\d{2}\b", f.vintage)
        if m and this_year - int(m.group(0)) > STALE_YEARS:
            old.append(f"{f.label} ({m.group(0)}, {f.source_label})")
    if old:
        _flag(ctx, "info", "Some values come from old data",
              f"More than {STALE_YEARS} years old: " + "; ".join(old) + ". Check them against the site today.",
              *[f.id for f in ctx.record.fields if f"{f.label} (" in "; ".join(old)])


def assumed_utility(ctx: Ctx) -> None:
    util, city = ctx.record.field("f_util"), (ctx.shared.get("city") or "").upper()
    if util is None or util.status == "needed":
        return
    names = " ".join(str(u.get("Acronym", "")) if isinstance(u, dict) else "" for u in
                     (util.value if isinstance(util.value, list) else [util.value]))
    if city in BAY_AREA_POU_CITIES and BAY_AREA_POU_CITIES[city].split()[0].upper() not in util.display.upper():
        _flag(ctx, "warn", f"{city.title()} has a municipal utility",
              f"{city.title()} is served by {BAY_AREA_POU_CITIES[city]} (background knowledge), but the CEC layer "
              f"returned {util.display}. Confirm the utility from a bill before using PG&E rules.", "f_util", "d_ic")
    elif names.strip() == "PG&E" and util.status == "confirm":
        pass  # single IOU territory; the field note already says to confirm on a bill


def zoning_city_vs_regional(ctx: Ctx) -> None:
    city, reg = ctx.record.field("z_zone"), ctx.record.field("z_zone_regional")
    if city is None or reg is None or city.source == "abag_zoning_draft":
        return
    def codes(v):
        items = v if isinstance(v, list) else [v]
        out = set()
        for x in items:
            if isinstance(x, dict):
                out.add(str(x.get("code") or x.get("ZONING_") or x.get("zn_code") or "").upper())
        return out - {""}
    c, r = codes(city.value), codes(reg.value)
    if c and r and not (c & r):
        _flag(ctx, "info", "City zoning differs from the regional draft",
              f"City layer: {', '.join(sorted(c))}; ABAG/MTC draft: {', '.join(sorted(r))}. The city layer governs.",
              "z_zone", "z_zone_regional")


def coverage(ctx: Ctx) -> None:
    cov = ctx.record.field("b_cov")
    if cov is None or not isinstance(cov.value, (int, float)):
        return
    if cov.value >= 60:
        _flag(ctx, "info", "Small open area: high site coverage",
              f"Buildings cover about {cov.value}% of the lot, so there may be little ground space for a pad. "
              "Rooftop, indoor or an adjacent lot may be the real options.", "b_cov", "g_type")
    elif cov.value <= 20:
        _flag(ctx, "info", "Low site coverage",
              f"Buildings cover about {cov.value}% of the lot. The rest is yard or parking, which gives room to "
              "site equipment, but how the open area is used is unknown.", "b_cov", "g_type")


def owner(ctx: Ctx) -> None:
    own, rel = ctx.record.field("a_own"), ctx.record.field("a_rel")
    if own is None or not isinstance(own.value, dict):
        return
    name, mail = own.value.get("owner") or "", own.value.get("mailing") or ""
    entity = re.search(r"\b(LLC|L\.?P\.?|INC|CORP|TRUST|TRS|TR|ESTATE|PARTNERSHIP|CO)\b", name.upper())
    st = re.search(r",\s*([A-Z]{2}),?\s*\d{5}", mail.upper())
    parts = []
    if st and st.group(1) != "CA":
        parts.append(f"the owner's mailing address is in {st.group(1)}")
    if entity:
        parts.append(f"the owner of record is an entity or trust ({entity.group(1)})")
    if parts and (rel is None or rel.status == "needed"):
        _flag(ctx, "warn" if st and st.group(1) != "CA" else "info", "Customer is probably not the owner",
              "From the parcel record, " + " and ".join(parts) + ". If the customer is a tenant, landlord consent is "
              "needed. This is an inference, not a record.", "a_own", "a_rel")


def use_vs_permits(ctx: Ctx) -> None:
    use, occ = ctx.record.field("b_use"), ctx.record.field("b_occ")
    if use is None or occ is None or use.source != "sf_benchmark" or not isinstance(occ.value, dict):
        return
    expected = next((g for pat, g in USE_TO_OCC if re.search(pat, str(use.value), re.I)), None)
    groups = set(re.findall(r"[A-Z]", str(occ.value.get("occupancy") or "")))
    if expected and groups and expected not in groups:
        _flag(ctx, "info", "Benchmarking use and permit occupancy disagree",
              f"Benchmarking says '{use.value}' (expect group {expected}); permits list occupancy "
              f"{occ.value.get('occupancy')}. The use may have changed.", "b_use", "b_occ")


def proposed_vs_site(ctx: Ctx) -> None:
    ps, cov = ctx.record.input.proposed_system, ctx.record.field("b_cov")
    if ps and ps.placement == "outdoor" and cov is not None and isinstance(cov.value, (int, float)) and cov.value >= 85:
        _flag(ctx, "warn", "Little open ground for an outdoor system",
              f"The proposed system is outdoor, but buildings cover about {cov.value}% of the lot.", "g_type", "b_cov")
