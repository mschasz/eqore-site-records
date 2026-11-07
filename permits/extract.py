"""Pull battery-design facts out of free-text permit descriptions.

First pass is regex only. Every extracted value comes with the raw description kept alongside
it in the record, and the record's confidence is set to "extracted". Nothing is guessed: a value
the text does not state is simply absent.
"""
from __future__ import annotations

import re
from typing import Any

NUM = r"(\d+(?:[.,]\d+)?)"

# Known battery / ESS models: pattern -> canonical display name builder.
BATTERY_MODELS: list[tuple[re.Pattern, Any]] = [
    (re.compile(r"\benphase\s+iq\s*battery\s*(\d+\s*[a-z]?|5p|3t|10t)\b", re.I), lambda m: f"Enphase IQ Battery {m.group(1).replace(' ', '').upper()}"),
    (re.compile(r"\btesla\s+powerwall\s*(\+|3|2|plus)?", re.I), lambda m: f"Tesla Powerwall{(' ' + m.group(1).replace('plus', '+')) if m.group(1) else ''}".rstrip()),
    (re.compile(r"\btesla\s+(megapack|powerpack)\s*(\d)?", re.I), lambda m: f"Tesla {m.group(1).title()}{(' ' + m.group(2)) if m.group(2) else ''}"),
    (re.compile(r"\blg\s+(?:chem\s+)?resu\s*-?\s*(\w+)", re.I), lambda m: f"LG RESU {m.group(1).upper()}"),
    (re.compile(r"\bgenerac\s+pwrcell\s*(\w+)?", re.I), lambda m: f"Generac PWRcell{(' ' + m.group(1).upper()) if m.group(1) else ''}"),
    (re.compile(r"\bfranklin\s+(?:whole\s+home\s+)?a?power\s*(\w+)?", re.I), lambda m: "FranklinWH aPower" + (f" {m.group(1)}" if m.group(1) else "")),
    (re.compile(r"\bsolaredge\s+(energy\s+bank|home\s+battery)", re.I), lambda m: f"SolarEdge {m.group(1).title()}"),
    (re.compile(r"\bsonnen\s*(\w+)?", re.I), lambda m: "sonnen" + (f" {m.group(1)}" if m.group(1) else "")),
    (re.compile(r"\bqorepack\b", re.I), lambda m: "EQORE QorePack"),
]
KEYWORDS = {
    "ess": r"\b(?:ess|bess|energy storage|battery|batteries|powerwall)\b",
    "pv": r"\b(?:pv|photovoltaic|solar)\b",
    "switchgear": r"\b(?:switchgear|switchboard|msb|main switch ?board)\b",
    "service_upgrade": r"\bservice (?:upgrade|change|riser|entrance)|\bnew service\b|\bmeter[- ]main\b",
    "generator": r"\bgenerator\b",
    "ev_charger": r"\b(?:ev charg\w*|electric vehicle charg\w*|evse|ev station)\b",
    "transformer": r"\btransformer\b",
    "ats": r"\b(?:ats|automatic transfer switch|transfer switch)\b",
    "ups": r"\bups\b",
}


def _f(s: str) -> float:
    return float(s.replace(",", ""))


def extract(text: str | None) -> dict[str, Any]:
    """Return a dict of extracted facts; empty when nothing is stated."""
    if not text:
        return {}
    t = " ".join(text.split())
    low = t.lower()
    out: dict[str, Any] = {}

    tags = [k for k, rx in KEYWORDS.items() if re.search(rx, low)]
    if tags:
        out["tags"] = tags

    # Battery model and energy.
    for rx, name in BATTERY_MODELS:
        m = rx.search(t)
        if m:
            out["battery_model"] = name(m)
            break
    m = re.search(rf"(?:total\s*(?:of\s*)?)?{NUM}\s*kwh\b", low)
    if m:
        vals = [_f(x) for x in re.findall(rf"{NUM}\s*kwh\b", low)]
        tot = re.search(rf"total\s*(?:of\s*)?{NUM}\s*kwh", low)
        out["ess_kwh"] = _f(tot.group(1)) if tot else max(vals)

    # PV: module count x wattage, or a stated kW rating near solar/pv.
    mc = re.search(rf"\(?(\d+)\)?\s*(?:x\s*)?(?:roof[- ]mounted\s+|ground[- ]mounted\s+)?(?:solar\s+)?(?:pv\s+)?(?:modules?|panels?)\b", low)
    mw = re.search(rf"{NUM}\s*(?:w|watts?)\b(?:\s*per\s*module|\s*modules?|\s*each)?", low)
    mx = re.search(rf"(\d+)\s*x\s*{NUM}\s*w\b", low)
    if mx:
        out["pv_modules"], out["pv_module_w"] = int(mx.group(1)), _f(mx.group(2))
    elif mc and mw and "pv" in tags:
        out["pv_modules"], out["pv_module_w"] = int(mc.group(1)), _f(mw.group(1))
    if "pv_modules" in out:
        out["pv_kw_dc"] = round(out["pv_modules"] * out["pv_module_w"] / 1000, 3)
    if "pv" in tags and "pv_kw_dc" not in out:
        m = re.search(rf"{NUM}\s*kw(?!h)\s*(?:dc)?", low)
        if m:
            out["pv_kw_dc"] = _f(m.group(1))
    m = re.search(rf"{NUM}\s*kw\s*ac\b", low)
    if m:
        out["pv_kw_ac"] = _f(m.group(1))

    # ESS power, explicitly labelled.
    m = re.search(rf"(?:battery|ess|bess|storage)[^.;]{{0,40}}?{NUM}\s*kw(?!h)\b", low)
    if m and "ess" in tags:
        out["ess_kw"] = _f(m.group(1))

    # Service / switchgear ratings.
    m = re.search(rf"{NUM}\s*-?\s*a(?:mps?)?\b[^.;]{{0,30}}?(?:service|msb|main|switch ?board|switchgear|meter[- ]main|riser)", low) or \
        re.search(rf"(?:service|msb|main|switch ?board|switchgear|meter[- ]main|riser)[^.;]{{0,30}}?{NUM}\s*-?\s*a(?:mps?)?\b", low)
    if m:
        out["service_amps"] = _f(m.group(1))
    m = re.search(r"\b(120/208|208/120|277/480|480/277|480y/277|208y/120|120/240|240/120|480|240|208)\s*-?\s*v(?:olts?)?\b", low)
    if m:
        out["service_voltage"] = m.group(1).upper().replace("Y", "Y")
    m = re.search(r"\b(?:(3|three)\s*-?\s*(?:ph(?:ase)?|ø|Ø)|(1|single)\s*-?\s*(?:ph(?:ase)?|ø))", low)
    if m:
        out["phases"] = 3 if m.group(1) else 1
    m = re.search(rf"{NUM}\s*kw\b[^.;]{{0,30}}?generator|generator[^.;]{{0,30}}?{NUM}\s*kw\b", low)
    if m:
        out["generator_kw"] = _f(m.group(1) or m.group(2))
    m = re.search(rf"{NUM}\s*kva\b", low)
    if m:
        out["transformer_kva"] = _f(m.group(1))
    if "switchgear" in tags:
        m = re.search(r"\b(?:new|replace\w*|install\w*)\s+[^.;]{0,40}?(msb|switchboard|switchgear)", low)
        out["switchgear"] = (m.group(0) if m else "mentioned")
    m = re.search(r"\((\d+)\)\s*(?:ev|level\s*2)\s*charg", low) or re.search(r"(\d+)\s*(?:ev|level\s*2)\s*charg", low)
    if m:
        out["ev_chargers"] = int(m.group(1))
    return out
