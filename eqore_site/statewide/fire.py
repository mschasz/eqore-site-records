"""Fire authority from CAL FIRE local fire districts."""

from __future__ import annotations

from ..context import S_AHJ, Ctx, epoch_ms_to_date

SRC = "calfire_fire_districts"


def run(ctx: Ctx) -> None:
    feats = ctx.arcgis_point(SRC, out_fields="Name,FDID,NERISID,Address,City,Zip,Phone,Website,LastUpdated,County")
    if not feats:
        ctx.status(SRC, "no_result", "No fire district polygon at the point")
        ctx.add_needed("d_fire", S_AHJ, "Fire authority",
                       "No CAL FIRE local fire district at the point; may be CAL FIRE or county fire.", "EQORE")
        return
    a = feats[0]["attributes"]
    upd = epoch_ms_to_date(a.get("LastUpdated"))
    name = (a.get('Name') or '').title().replace(' Fd', ' FD').replace(' Fpd', ' FPD')
    disp = (f"{name} (FDID {a.get('FDID')}), {a.get('Address')}, "
            f"{(a.get('City') or '').title()} {a.get('Zip') or ''}. {a.get('Phone') or ''}").strip()
    ctx.add_field("d_fire", S_AHJ, "Fire authority", SRC,
                  {k: a.get(k) for k in ("Name", "FDID", "NERISID", "Address", "City", "Zip", "Phone", "Website")},
                  display=disp, status="confirm", confidence="medium", who="EQORE",
                  vintage=f"record LastUpdated {upd}" if upd else None,
                  note=f"District record last updated {upd}; CAL FIRE gives no accuracy guarantee. "
                       "Confirm who reviews energy storage plans.")
    if upd and upd < "2022-01-01":
        ctx.flag("info", f"Fire district record is from {upd[:4]}",
                 f"CAL FIRE's record for {a.get('Name')} was last updated {upd}. Confirm the fire AHJ.", "d_fire")
    if len(feats) > 1:
        ctx.flag("warn", "More than one fire district at the point",
                 ", ".join(f["attributes"].get("Name") or "?" for f in feats), "d_fire")
    ctx.status(SRC, "retrieved", f"{a.get('Name')}, FDID {a.get('FDID')}", vintage=f"record {upd}")
