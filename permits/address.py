"""Address parsing and search-variant generation.

"Pkwy W", "Pkwy West", "PKWY W" and "Parkway West" all normalize to suffix=PKWY, post_dir=W.
Portals match literally, so `variants()` emits the forms worth trying, most likely first.
"""
from __future__ import annotations

import re

from .models import Site

# USPS Publication 28 suffixes (common subset): any spelling -> standard abbreviation.
SUFFIXES: dict[str, str] = {}
_SUF = {
    "ALY": ["ALLEY", "ALLY"], "AVE": ["AVENUE", "AV", "AVEN", "AVN"], "BLVD": ["BOULEVARD", "BOUL"],
    "CIR": ["CIRCLE", "CIRC"], "CT": ["COURT", "CRT"], "CTR": ["CENTER", "CENTRE"], "DR": ["DRIVE", "DRV"],
    "EXPY": ["EXPRESSWAY", "EXPWY", "EXP"], "FWY": ["FREEWAY"], "HWY": ["HIGHWAY", "HIWAY"], "LN": ["LANE"],
    "LOOP": [], "PKWY": ["PARKWAY", "PKY", "PKWAY", "PARKWY"], "PL": ["PLACE"], "PLZ": ["PLAZA"], "RD": ["ROAD"],
    "ROW": [], "SQ": ["SQUARE"], "ST": ["STREET", "STR"], "TER": ["TERRACE"], "TPKE": ["TURNPIKE"], "TRL": ["TRAIL"],
    "WAY": [], "WALK": [], "XING": ["CROSSING"], "PT": ["POINT"], "HBR": ["HARBOR"], "PARK": [], "ESPL": ["ESPLANADE"],
}
for std, alts in _SUF.items():
    SUFFIXES[std] = std
    for a in alts:
        SUFFIXES[a] = std
LONG_SUFFIX = {"ALY": "Alley", "AVE": "Avenue", "BLVD": "Boulevard", "CIR": "Circle", "CT": "Court", "CTR": "Center", "DR": "Drive",
               "EXPY": "Expressway", "FWY": "Freeway", "HWY": "Highway", "LN": "Lane", "PKWY": "Parkway", "PL": "Place", "PLZ": "Plaza",
               "RD": "Road", "SQ": "Square", "ST": "Street", "TER": "Terrace", "TPKE": "Turnpike", "TRL": "Trail", "XING": "Crossing",
               "PT": "Point", "HBR": "Harbor", "ESPL": "Esplanade"}
DIRS = {"N": "N", "NORTH": "N", "S": "S", "SOUTH": "S", "E": "E", "EAST": "E", "W": "W", "WEST": "W",
        "NE": "NE", "NORTHEAST": "NE", "NW": "NW", "NORTHWEST": "NW", "SE": "SE", "SOUTHEAST": "SE", "SW": "SW", "SOUTHWEST": "SW"}
LONG_DIR = {"N": "North", "S": "South", "E": "East", "W": "West", "NE": "Northeast", "NW": "Northwest", "SE": "Southeast", "SW": "Southwest"}
UNIT_RX = re.compile(r"\b(?:UNIT|STE|SUITE|APT|BLDG|#)\s*:?\s*([A-Z0-9-]+)\s*$", re.I)
STATES = {"CA": "CA", "CALIFORNIA": "CA", "MA": "MA", "MASSACHUSETTS": "MA", "NH": "NH", "NEW HAMPSHIRE": "NH"}


def normalize_apn(apn: str | None) -> str | None:
    """Keep digits, dashes and the SF-style block/lot slash; drop spaces and other punctuation."""
    if not apn:
        return None
    s = re.sub(r"[^0-9A-Za-z/\-]", "", str(apn).strip()).upper()
    return s or None


def apn_digits(apn: str | None) -> str:
    return re.sub(r"[^0-9A-Z]", "", (apn or "").upper())


def _title(s: str) -> str:
    return " ".join(w if re.match(r"^\d", w) else w.capitalize() for w in s.split())


def parse_street(street: str) -> dict:
    """Parse the street line only: '2457 Industrial Pkwy W' or '1950-2190 Cesar Chavez St'."""
    s = re.sub(r"\s+", " ", street.replace(",", " ")).strip()
    out: dict = {}
    m = UNIT_RX.search(s)
    if m:
        out["unit"] = m.group(1)
        s = s[: m.start()].strip()
    m = re.match(r"^(\d+[A-Z]?)(?:\s*[-–]\s*(\d+[A-Z]?))?\s+(.*)$", s, re.I)
    if not m:
        out["street_name"] = _title(s) if s else None
        return out
    out["number"], out["number_hi"], rest = m.group(1).upper(), (m.group(2) or None), m.group(3)
    toks = rest.split()
    up = [t.upper().rstrip(".") for t in toks]
    if len(up) > 1 and up[-1] in DIRS:
        out["post_dir"] = DIRS[up[-1]]
        toks, up = toks[:-1], up[:-1]
    if len(up) > 1 and up[-1] in SUFFIXES:
        out["suffix"] = SUFFIXES[up[-1]]
        toks, up = toks[:-1], up[:-1]
    if len(up) > 1 and up[0] in DIRS and up[0] not in ("N", "S", "E", "W") or (len(up) > 1 and up[0] in ("N", "S", "E", "W")):
        out["pre_dir"] = DIRS[up[0]]
        toks = toks[1:]
    out["street_name"] = _title(" ".join(toks)) if toks else None
    return out


def parse(address: str, apn: str | None = None) -> Site:
    """Parse '2457 Industrial Pkwy W, Hayward, CA 94545' into a Site."""
    raw = address.strip()
    parts = [p.strip() for p in raw.split(",") if p.strip()]
    street = parts[0] if parts else raw
    city = state = zipc = None
    tail = " ".join(parts[1:])
    m = re.search(r"\b(\d{5})(?:-\d{4})?\s*$", tail)
    if m:
        zipc = m.group(1)
        tail = tail[: m.start()].strip()
    toks = tail.replace(",", " ").split()
    for n in (2, 1):
        cand = " ".join(toks[-n:]).upper() if len(toks) >= n else ""
        if cand in STATES:
            state = STATES[cand]
            toks = toks[:-n]
            break
    if toks:
        city = _title(" ".join(toks))
    return Site(raw=raw, city=city, state=state, zip=zipc, apn=normalize_apn(apn), **parse_street(street))


def variants(site: Site, include_bare: bool = True) -> list[str]:
    """Search strings to try, most specific first. Abbreviated USPS forms come first because
    portals (e.g. EnerGov) store 'Pkwy W' and do not match 'Parkway West'."""
    if not site.number or not site.street_name:
        return [site.raw]
    n, name, suf, pre, post = site.number, site.street_name, site.suffix, site.pre_dir, site.post_dir
    forms: list[str] = []

    def add(*ps: str | None) -> None:
        v = " ".join(p for p in ps if p)
        if v and v not in forms:
            forms.append(v)

    sab = suf.title() if suf else None
    add(n, pre, name, sab, post)                                   # 2457 Industrial Pkwy W
    add(n, pre, name, sab, LONG_DIR.get(post) if post else None)   # 2457 Industrial Pkwy West
    add(n, LONG_DIR.get(pre) if pre else None, name, LONG_SUFFIX.get(suf or "", sab), LONG_DIR.get(post) if post else None)
    add(n, pre, name, sab)                                          # without post direction
    if include_bare:
        add(n, pre, name)                                           # 2457 Industrial
    return forms


def street_key(name: str | None) -> str:
    """Comparable street name: upper-case alphanumerics, ordinal suffixes unified ('5th' == '05TH')."""
    s = re.sub(r"[^A-Z0-9 ]", "", (name or "").upper())
    s = re.sub(r"\b0+(\d)", r"\1", s)
    return re.sub(r"\s+", " ", s).strip()
