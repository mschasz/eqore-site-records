"""Regional draft zoning (ABAG/MTC Draft Bay Area Zoning 2023).

Draft data with no warranty, so confidence is low and status is always
`confirm`. The layer excludes street right-of-way, and the geocoded point is
usually in the street, so a miss is retried with a small buffer."""

from __future__ import annotations

from ..context import S_ZONING, Ctx

SRC = "abag_zoning_draft"
BUFFER_M = 30
OUT = "zn_jurisdiction,zn_code,zn_description,zn_code_basis_url,last_edited"


def run(ctx: Ctx) -> None:
    feats = ctx.arcgis_point(SRC, out_fields=OUT)
    how = "at the point"
    if not feats:
        feats = ctx.arcgis_point(SRC, out_fields=OUT, distance_m=BUFFER_M)
        how = f"within {BUFFER_M} m of the point (none at the point itself, likely street right-of-way)"
    if not feats:
        ctx.add_needed("z_zone", S_ZONING, "Zoning", "No regional draft zoning polygon near the point.", "EQORE")
        ctx.status(SRC, "no_result", f"No polygon within {BUFFER_M} m")
        return
    seen: dict[tuple, dict] = {}
    for f in feats:
        a = f["attributes"]
        seen.setdefault((a.get("zn_jurisdiction"), a.get("zn_code")), a)
    zones = list(seen.values())
    disp = "; ".join(f"{z.get('zn_code')}, {(z.get('zn_description') or '').title()} ({z.get('zn_jurisdiction')})"
                     for z in zones)
    ctx.add_field("z_zone", S_ZONING, "Zoning", SRC,
                  [{k: z.get(k) for k in ("zn_jurisdiction", "zn_code", "zn_description", "zn_code_basis_url")}
                   for z in zones],
                  display=disp, status="confirm", confidence="low", who="EQORE",
                  note=f"Regional DRAFT layer, found {how}. {len(feats)} polygon(s), {len(zones)} distinct code(s). "
                       "Confirm against the city's adopted zoning map.")
    if len(zones) > 1:
        ctx.flag("warn", "More than one zoning district near the point",
                 disp + ". The lot may sit on a district line, or the buffer reached a neighbor.", "z_zone")
    elif len(feats) > 1:
        ctx.flag("info", "Duplicate zoning polygons", f"{len(feats)} polygons all read {disp}.", "z_zone")
    ctx.status(SRC, "retrieved", f"{disp} ({how})")
