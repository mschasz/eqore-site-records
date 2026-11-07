"""Draft a public-records request when online data is thin or drawings are needed."""
from __future__ import annotations

from datetime import date

from .jurisdictions import Jurisdiction
from .models import PermitRecord, Site

LAW = {
    "CA": ("California Public Records Act (Gov. Code §7920.000 et seq.)",
           "Copies of stamped plans require written consent from both the property owner and the design professional "
           "(Health & Safety Code §19851); some cities use an affidavit process that can take ~30 days."),
    "MA": ("Massachusetts Public Records Law (M.G.L. c. 66, §10)",
           "A response is due within 10 business days. Drawings may be withheld under exemption (n) (building security) "
           "or made available view-only."),
}


def draft(site: Site, jur: Jurisdiction | None, records: list[PermitRecord], since: str = "1980-01-01") -> str:
    state = (jur.state if jur else site.state) or "CA"
    law, note = LAW.get(state, LAW["CA"])
    rr = (jur.config.get("records_request") if jur else None) or {}
    office = rr.get("office", "Building Department, Records")
    apns = sorted({r.apn for r in records if r.apn} | ({site.apn} if site.apn else set()))
    numbers = sorted({r.permit_number for r in records})[:40]
    return f"""# Public records request — {site.street_line}, {site.city or ''} {site.state or ''}

**To:** {office}{f" ({jur.name})" if jur else ""}
**Date:** {date.today().isoformat()}
**Under:** {law}

To the records officer,

Under the {law}, I request copies of, or access to, the following records for:

- **Address:** {site.street_line}, {site.city or ''}, {site.state or ''} {site.zip or ''}
- **Assessor's parcel number(s):** {", ".join(apns) if apns else "unknown — please search by address"}
- **Date range:** {since} to present

Records requested:

1. Permit history: building, electrical, mechanical, fire and planning permits, with status and final dates.
2. Inspection records and final sign-offs.
3. Electrical permits and their attachments, in particular **single-line diagrams**, **panel schedules**, service and switchgear ratings, and load calculations.
4. **Approved plan sets** (electrical and site sheets) for the most recent tenant improvement and any service upgrade.
5. Any records of existing generators, solar PV, energy storage or EV charging equipment at the address.
{f"""
Permits already identified online (to narrow the search): {", ".join(numbers)}{" …" if len(records) > 40 else ""}.
""" if numbers else ""}
Electronic copies are preferred. If any record is withheld, please cite the exemption and release the remainder.

{note}

A signed authorization from the property owner is attached / will follow; we understand this substantially speeds up release of drawings.

Thank you,

[Name], EQORE
[email] · [phone]

{rr.get("notes", "")}
"""
