"""USGS ASCE 7-22 seismic design parameters at the point.

Site Class D and Risk Category II are ASSUMPTIONS, so confidence is low until a
geotechnical report sets the site class. The handoff URL
(earthquake.usgs.gov/ws/designmaps/asce7-22.json) now 301-redirects here."""

from __future__ import annotations

from ..context import S_HAZ, Ctx
from ..sources import SOURCES

SRC = "usgs_seismic"


def run(ctx: Ctx) -> None:
    p = ctx.point
    params = {"latitude": round(p.lat, 6), "longitude": round(p.lon, 6),
              "riskCategory": "II", "siteClass": "D", "title": "eqore"}
    data = ctx.client.get_json(SRC, SOURCES[SRC].url, params)
    d = data.get("response", {}).get("data", {})
    meta = data.get("response", {}).get("metadata", {})
    keys = ("ss", "s1", "sms", "sm1", "sds", "sd1", "sdc", "pgam")
    vals = {k: d.get(k) for k in keys}
    vals["vs30"] = meta.get("vs30")
    vals["model_version"] = meta.get("modelVersion")
    if vals["sds"] is None:
        raise ValueError("USGS response had no sds value")
    vint = f"model {vals['model_version']}, queried {ctx.today}"
    ctx.add_field("e_seis", S_HAZ, "Seismic design parameters", SRC, vals,
                  display=f"SDS {vals['sds']} g · SD1 {vals['sd1']} g · SDC {vals['sdc']}",
                  status="confirm", confidence="low", who="EQORE", vintage=vint,
                  note=f"Ss {vals['ss']} g, S1 {vals['s1']} g. Risk Category II and Site Class D assumed; "
                       f"the service reports Vs30 {vals['vs30']} m/s. A geotechnical report decides the real "
                       f"site class. Queried at {p.lat:.4f}, {p.lon:.4f}.")
    ctx.status(SRC, "retrieved", f"SDS {vals['sds']} g, SD1 {vals['sd1']} g, SDC {vals['sdc']}", vintage=vint)
