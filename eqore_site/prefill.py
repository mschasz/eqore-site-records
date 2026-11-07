"""Form prefill (handoff §6.6): the record mapped onto a Woodside-style ESS permit
submittal plus the site section of EQORE's lead form.

Woodside items (handoff §3): scope on the cover sheet; site plan with existing/new
equipment and conduit routes; floor plan with clearances and first-responder
disconnect; single-line; calculations; manufacturer docs; labels; separate fire
district fee. The lead-form section is an ASSUMPTION about which site fields
EQORE's lead form asks for (the form itself is not in this repo).

Each item: form, field, value, status (filled = from a source or a person;
review = found, needs a person; missing), from_field, source_label, note.
"""

from __future__ import annotations

from typing import Any, Callable, Optional

from .schema import FormPrefillItem, SiteRecord

COVER = "1. Cover sheet and project data"
SITE = "2. Site plan"
FLOOR = "3. Floor plan and clearances"
SLD = "4. Single-line diagram and service"
CALC = "5. Calculations"
MFR = "6. Manufacturer documents and labels"
FIRE = "7. Fire district"
AHJ = "8. Permit process"
LEAD = "9. EQORE lead form, site section (assumed fields)"

STATUS = {"filled": "filled", "provided": "filled", "confirm": "review", "needed": "missing"}


def _f(rec: SiteRecord, fid: str):
    return rec.field(fid)


def _item(form, label, rec, fid, value=None, status=None, note="") -> FormPrefillItem:
    f = _f(rec, fid) if fid else None
    if f is None and status is None:
        return FormPrefillItem(form=form, field=label, value=None, status="missing", from_field=fid,
                               note=note or "No value in the record.")
    return FormPrefillItem(
        form=form, field=label,
        value=value if value is not None else (None if f is None or f.status == "needed" else f.display),
        status=status or STATUS[f.status], from_field=fid,
        source_label=f.source_label if f is not None and f.status != "needed" else None,
        confidence=f.confidence if f is not None and f.status != "needed" else None,
        note=note or (f.note if f is not None and f.status == "needed" else ""),
    )


def _apn(rec):
    if rec.confirmed_apn:
        return _item(COVER, "Assessor parcel number (APN)", rec, "a_apn", value=rec.confirmed_apn, status="filled")
    b = _f(rec, "b_apn")
    return _item(COVER, "Assessor parcel number (APN)", rec, "b_apn",
                 value=(", ".join(map(str, b.value[:3])) if b and isinstance(b.value, list) else None),
                 status="review" if b and b.status != "needed" else "missing",
                 note="Not confirmed: candidates only. Confirm the APN before filing.")


def _owner_mailing(rec):
    o = _f(rec, "a_own")
    mail = o.value.get("mailing") if o and isinstance(o.value, dict) else None
    return _item(COVER, "Owner mailing address", rec, "a_own", value=mail,
                 status=(STATUS[o.status] if o and mail else "missing"))


def _scope(rec):
    ps, apn = rec.input.proposed_system, rec.confirmed_apn or "APN to be confirmed"
    if not ps or not (ps.energy_kwh or ps.power_kw or ps.model):
        return FormPrefillItem(form=COVER, field="Scope of work", value=None, status="missing",
                               note="Needs the proposed system (energy, power, make/model, placement).")
    sys = ", ".join(x for x in [" ".join(filter(None, [ps.manufacturer, ps.model])) or None,
                                f"{ps.energy_kwh:g} kWh" if ps.energy_kwh else None,
                                f"{ps.power_kw:g} kW" if ps.power_kw else None, ps.chemistry] if x)
    where = {"outdoor": "outdoor, ground-mounted", "indoor": "indoor", "rooftop": "rooftop"}.get(ps.placement or "", "location TBD")
    return FormPrefillItem(form=COVER, field="Scope of work", status="review", from_field="g_sys",
                           value=f"Install a behind-the-meter battery energy storage system ({sys}), {where}, "
                                 f"at {rec.input.address} ({apn}), with associated electrical work and utility "
                                 "interconnection.",
                           source_label="Lead form (as entered)", note="Drafted from the proposed system; EQORE edits.")


def _seis(part: str) -> Callable[[SiteRecord], FormPrefillItem]:
    def go(rec):
        f = _f(rec, "e_seis")
        v = f.value.get(part) if f and isinstance(f.value, dict) else None
        unit = "" if part == "sdc" else " g"
        return _item(CALC if part != "sdc" else COVER, {"sds": "Seismic design: SDS", "sd1": "Seismic design: SD1",
                                                        "sdc": "Seismic design category"}[part], rec, "e_seis",
                     value=f"{v}{unit}" if v is not None else None, status=STATUS[f.status] if f and v is not None else "missing",
                     note="Risk Category II and Site Class D assumed; a geotechnical report sets the site class.")
    return go


def _system(attr: str, label: str, form: str) -> Callable[[SiteRecord], FormPrefillItem]:
    def go(rec):
        ps = rec.input.proposed_system
        v = getattr(ps, attr, None) if ps else None
        if attr == "make_model" and ps:
            v = " ".join(filter(None, [ps.manufacturer, ps.model])) or None
        return FormPrefillItem(form=form, field=label, value=None if v is None else str(v),
                               status="filled" if v is not None else "missing", from_field="g_sys",
                               source_label="Lead form (as entered)" if v is not None else None,
                               note="" if v is not None else "From EQORE's system selection.")
    return go


def _todo(form: str, label: str, note: str) -> Callable[[SiteRecord], FormPrefillItem]:
    return lambda rec: FormPrefillItem(form=form, field=label, value=None, status="missing", note=note)


def _field(form: str, label: str, fid: str, note: str = "") -> Callable[[SiteRecord], FormPrefillItem]:
    return lambda rec: _item(form, label, rec, fid, note=note)


PACKET: list[Callable[[SiteRecord], Optional[FormPrefillItem]]] = [
    _field(COVER, "Project address", "a_cen"),
    _apn,
    _field(COVER, "Owner of record", "a_own"),
    _owner_mailing,
    _field(COVER, "Applicant's relationship to the property / owner consent", "a_rel"),
    _field(COVER, "Jurisdiction", "z_jur"),
    _field(COVER, "Zoning district", "z_zone"),
    _field(COVER, "Lot area", "b_area"),
    _field(COVER, "Occupancy group, construction type, sprinklers", "b_occ"),
    _field(COVER, "Building height and stories", "b_height"),
    _field(COVER, "Year built", "b_year"),
    _field(COVER, "Code edition", "d_code"),
    _scope,
    _field(COVER, "Fire hazard severity zone", "e_fhsz"),
    _field(COVER, "Flood zone", "e_flood"),
    _field(COVER, "Liquefaction / seismic hazard zone", "e_liq"),
    _field(COVER, "Tsunami hazard area", "e_tsu"),
    _seis("sdc"),
    _field(SITE, "Property lines (parcel boundary)", "b_geom"),
    _field(SITE, "Existing buildings", "b_bld"),
    _field(SITE, "New equipment location", "g_pin"),
    _field(SITE, "Distances to property lines and buildings (screening)", "g_dist",
           note="Screening distances from public GIS layers; the drawn site plan governs."),
    _field(SITE, "Conduit routes", "g_conduit"),
    _field(SITE, "Easements", "b_ease"),
    _field(SITE, "Fire apparatus access and nearest hydrant", "g_access"),
    _field(SITE, "Aerial base image", "b_img"),
    _field(FLOOR, "Installation type (indoor / outdoor / rooftop) and mounting", "g_type"),
    _field(FLOOR, "Working clearances and ventilation", "g_clear"),
    _todo(FLOOR, "First-responder disconnect location", "EQORE marks it on the floor/site plan."),
    _field(SLD, "Serving utility", "f_util"),
    _field(SLD, "Service voltage, phase, main breaker, switchgear", "f_svc"),
    _field(SLD, "Meter / service account number", "f_acct"),
    _field(SLD, "Existing PV, generator, ATS", "f_der"),
    _field(SLD, "Available fault current", "f_fault"),
    _field(SLD, "Single-line diagram", "f_sld"),
    _field(SLD, "Interconnection path", "d_ic"),
    _field(SLD, "Distribution feeder", "f_feeder"),
    _system("energy_kwh", "BESS energy rating (kWh)", CALC),
    _system("power_kw", "BESS power rating (kW)", CALC),
    _seis("sds"),
    _seis("sd1"),
    _field(CALC, "Structural loads / anchorage", "g_struct"),
    _system("make_model", "Manufacturer and model", MFR),
    _system("chemistry", "Battery chemistry", MFR),
    _todo(MFR, "Manufacturer spec sheets, installation manual, listing documents", "EQORE attaches."),
    _todo(MFR, "Equipment labels and placards", "EQORE prepares per the adopted code (not encoded here)."),
    _field(FIRE, "Fire authority", "d_fire"),
    _todo(FIRE, "Separate fire district plan-check fee", "Woodside charges one; confirm whether this fire AHJ does."),
    lambda rec: _item(FIRE, "Local fire submittal requirement", rec, "d_extra") if _f(rec, "d_extra") else None,
    _field(AHJ, "Building department and permit portal", "d_bldg"),
    _field(AHJ, "Energy storage submittal checklist", "d_check"),
    _field(AHJ, "Local code amendments", "d_amend"),
    _field(AHJ, "Planning contact", "d_plan"),
    _field(AHJ, "Energy storage allowed in this zone?", "z_use"),
    _field(LEAD, "Site address", "a_cen"),
    _field(LEAD, "Building use", "b_use"),
    _field(LEAD, "Own or lease", "a_rel"),
    _field(LEAD, "Electric utility", "f_util"),
    _field(LEAD, "Retail generation provider", "f_cca"),
    _field(LEAD, "Rate schedule", "f_rate"),
    _field(LEAD, "Annual electricity use", "f_kwh"),
    _field(LEAD, "15-minute interval data", "f_int"),
]


def fill(record: SiteRecord) -> SiteRecord:
    """Set record.form_prefill in place and return the record."""
    record.form_prefill = [it for it in (fn(record) for fn in PACKET) if it is not None]
    return record


def to_csv(record: SiteRecord) -> str:
    import csv
    import io
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["form", "field", "value", "status", "from_field", "source", "confidence", "note"])
    for it in record.form_prefill:
        w.writerow([it.form, it.field, "" if it.value is None else it.value, it.status, it.from_field or "",
                    it.source_label or "", it.confidence or "", it.note])
    return buf.getvalue()


def counts(record: SiteRecord) -> dict[str, Any]:
    c = {"filled": 0, "review": 0, "missing": 0}
    for it in record.form_prefill:
        c[it.status] += 1
    return c
