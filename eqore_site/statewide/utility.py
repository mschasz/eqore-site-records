"""Serving utility (CEC load serving entities) and nearby PG&E feeders (GRIP)."""

from __future__ import annotations

from ..context import S_AHJ, S_ELEC, Ctx, epoch_ms_to_date

LSE = "cec_lse"
GRIP = "pge_grip_feeders"
FEEDER_SEARCH_M = 100


def utility(ctx: Ctx) -> None:
    feats = ctx.arcgis_point(LSE, out_fields="Utility,Acronym,Type,URL,Phone")
    vint = "not stated; queried " + ctx.today
    if not feats:
        ctx.status(LSE, "no_result", "No utility territory at the point")
        ctx.add_needed("f_util", S_ELEC, "Serving utility", "No CEC territory polygon at the point.", "Customer")
        ctx.add_needed("d_ic", S_AHJ, "Utility interconnection process", "Depends on the serving utility.", "EQORE")
        return
    utils = [f["attributes"] for f in feats]
    ctx.shared["utilities"] = [u.get("Acronym") for u in utils]
    names = [f"{u.get('Utility')} ({u.get('Type')})" for u in utils]
    note = "The CEC calls its boundaries approximate. Confirm on a utility bill."
    if len(utils) == 1:
        ctx.add_field("f_util", S_ELEC, "Serving utility", LSE, utils[0], display=utils[0].get("Utility"),
                      status="confirm", confidence="medium", who="Customer", vintage=vint, note=note)
    else:
        ctx.add_field("f_util", S_ELEC, "Serving utility", LSE, utils, display=" or ".join(names),
                      status="confirm", confidence="low", who="Customer", vintage=vint,
                      note="Overlapping territories at this point. " + note)
        ctx.flag("warn", "Two utility territories overlap here",
                 "CEC layer returns " + "; ".join(names) + ". Which one serves the meter decides the "
                 "interconnection rules and tariff. Confirm from the customer's bill.", "f_util", "d_ic")
    acr = [u.get("Acronym") for u in utils]
    if acr == ["PG&E"]:
        ctx.add_field("d_ic", S_AHJ, "Utility interconnection process", LSE, "PG&E Electric Rule 21",
                      status="confirm", confidence="medium", who="EQORE", vintage=vint,
                      note="Follows from PG&E being the only utility territory at the point.")
    else:
        ctx.add_needed("d_ic", S_AHJ, "Utility interconnection process",
                       "Depends on which utility serves the meter (" + ", ".join(map(str, acr)) + ").", "EQORE")
    ctx.status(LSE, "retrieved", "; ".join(names))


def feeders(ctx: Ctx) -> None:
    if "PG&E" not in ctx.shared.get("utilities", []):
        ctx.status(GRIP, "not_queried", "Point is not in PG&E territory")
        return
    feats = ctx.arcgis_point(GRIP, distance_m=FEEDER_SEARCH_M,
                             out_fields="FeederID,Feeder_Name,Substation,Nominal_Voltage,Existing_DG,Queued_DG,Last_Update_On_Map")
    if not feats:
        ctx.add_needed("f_feeder", S_ELEC, "Distribution feeder and hosting capacity",
                       f"No PG&E GRIP feeder line within {FEEDER_SEARCH_M} m of the point.", "Utility")
        ctx.status(GRIP, "no_result", f"No feeder within {FEEDER_SEARCH_M} m")
        return
    rows = [f["attributes"] for f in feats]
    upd = max((epoch_ms_to_date(r.get("Last_Update_On_Map")) or "" for r in rows), default="") or None
    disp = "; ".join(f"{r.get('Feeder_Name')} ({r.get('Nominal_Voltage') or '?'} kV)" for r in rows)
    ctx.add_field("f_feeder", S_ELEC, "Nearby PG&E feeders", GRIP, rows, display=disp,
                  status="confirm", confidence="low", who="Utility",
                  vintage=f"map updated {upd}" if upd else None,
                  note=f"Feeder lines within {FEEDER_SEARCH_M} m of the geocoded point. Proximity is not "
                       "service: the utility confirms which feeder serves the meter. Hosting/ICA values are "
                       "in other GRIP layers (not queried yet). No usage terms stated.")
    ctx.status(GRIP, "retrieved", f"{len(rows)} feeder(s) within {FEEDER_SEARCH_M} m", vintage=upd)
