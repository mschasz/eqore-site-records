"""Statewide values that need no per-site query: imagery link, code edition.

NAIP: the pipeline builds the exportImage URL but does not download the image
(the f=image export was verified live on 2026-11-07; see DATA_SOURCES.md)."""

from __future__ import annotations

import math
from urllib.parse import urlencode

from ..context import S_AHJ, S_PARCEL, Ctx
from ..sources import SOURCES

NAIP_HALF_M = 120


def naip(ctx: Ctx) -> None:
    p = ctx.point
    dlat = NAIP_HALF_M / 111_320
    dlon = NAIP_HALF_M / (111_320 * math.cos(math.radians(p.lat)))
    params = {"bbox": f"{p.lon - dlon:.6f},{p.lat - dlat:.6f},{p.lon + dlon:.6f},{p.lat + dlat:.6f}",
              "bboxSR": 4326, "imageSR": 3857, "size": "800,800", "format": "jpg", "f": "image"}
    url = SOURCES["naip_2022"].url + "/exportImage?" + urlencode(params)
    ctx.add_field("b_img", S_PARCEL, "Aerial imagery", "naip_2022", url,
                  display=f"NAIP 2022, 60 cm, {2 * NAIP_HALF_M} m square around the point", url=url,
                  status="filled", confidence="high", vintage="2022",
                  note="Roof equipment added since 2022 will not show.")
    ctx.status("naip_2022", "retrieved", "exportImage URL built (image not downloaded by the pipeline)")


def code_edition(ctx: Ctx) -> None:
    ctx.add_field("d_code", S_AHJ, "State code edition", "bsc_bulletin_25_01",
                  "2025 California Building Standards Code (Title 24)",
                  display="2025 California Building Standards Code (Title 24), statewide effective 2026-01-01",
                  status="filled", confidence="high",
                  note="Applies to permit applications submitted on or after 2026-01-01. Local amendments are separate.")
    ctx.status("bsc_bulletin_25_01", "retrieved", "Static: 2025 Title 24 effective 2026-01-01 (from handoff, not re-fetched)")
