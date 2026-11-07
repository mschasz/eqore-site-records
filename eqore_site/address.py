"""Address parsing and normalization for situs matching (no network).

parse("2448 Industrial Parkway West, Hayward, CA 94545")
  -> ParsedAddress(house='2448', predir='', name='INDUSTRIAL', suffix='PKWY', sufdir='W',
                   unit='', city='HAYWARD', state='CA', zip='94545')

Normalization: upper case, USPS suffix and directional abbreviations, spelled
ordinals to numerals ('Fourth' -> '4TH'), units split off. Dataset-specific
spellings (SF '04TH') are handled by the adapters."""

from __future__ import annotations

import re
from dataclasses import dataclass, replace
from typing import Literal

SUFFIX = {
    "STREET": "ST", "STR": "ST", "ST": "ST", "AVENUE": "AVE", "AV": "AVE", "AVE": "AVE",
    "BOULEVARD": "BLVD", "BLVD": "BLVD", "BL": "BLVD", "PARKWAY": "PKWY", "PKY": "PKWY", "PKWY": "PKWY",
    "DRIVE": "DR", "DR": "DR", "ROAD": "RD", "RD": "RD", "LANE": "LN", "LN": "LN", "COURT": "CT", "CT": "CT",
    "PLACE": "PL", "PL": "PL", "WAY": "WAY", "PLAZA": "PLZ", "PLZ": "PLZ", "TERRACE": "TER", "TER": "TER",
    "CIRCLE": "CIR", "CIR": "CIR", "HIGHWAY": "HWY", "HWY": "HWY", "EXPRESSWAY": "EXPY", "EXPY": "EXPY",
    "SQUARE": "SQ", "SQ": "SQ", "ALLEY": "ALY", "ALY": "ALY", "LOOP": "LOOP", "TRAIL": "TRL", "TRL": "TRL",
    "CENTER": "CTR", "CTR": "CTR", "CRESCENT": "CRES", "WALK": "WALK", "ROW": "ROW", "PIER": "PIER",
}
DIRS = {"NORTH": "N", "SOUTH": "S", "EAST": "E", "WEST": "W", "NORTHEAST": "NE", "NORTHWEST": "NW",
        "SOUTHEAST": "SE", "SOUTHWEST": "SW", "N": "N", "S": "S", "E": "E", "W": "W",
        "NE": "NE", "NW": "NW", "SE": "SE", "SW": "SW"}
ORDINALS = {"FIRST": "1ST", "SECOND": "2ND", "THIRD": "3RD", "FOURTH": "4TH", "FIFTH": "5TH", "SIXTH": "6TH",
            "SEVENTH": "7TH", "EIGHTH": "8TH", "NINTH": "9TH", "TENTH": "10TH", "ELEVENTH": "11TH",
            "TWELFTH": "12TH"}
UNIT_WORDS = {"STE", "SUITE", "UNIT", "APT", "APARTMENT", "BLDG", "BUILDING", "FL", "FLOOR", "RM", "ROOM", "#"}
STATES = {"CA", "CALIFORNIA"}


@dataclass(frozen=True)
class ParsedAddress:
    house: str = ""
    predir: str = ""
    name: str = ""
    suffix: str = ""
    sufdir: str = ""
    unit: str = ""
    city: str = ""
    state: str = ""
    zip: str = ""

    @property
    def street(self) -> str:
        return " ".join(x for x in (self.predir, self.name, self.suffix, self.sufdir) if x)

    @property
    def line1(self) -> str:
        return " ".join(x for x in (self.house, self.street) if x)

    def with_census(self, comp: dict) -> "ParsedAddress":
        """Fill blanks from the Census match; keep what the customer stated.

        Census can snap to a different street (entered 'Industrial Blvd', matched
        'Industrial Pkwy W'); stated suffix/direction win so situs matching tests
        what was entered. The street NAME comes from Census (it fixes typos)."""
        return replace(self, predir=self.predir or comp.get("preDirection") or "",
                       name=(comp.get("streetName") or self.name).upper(),
                       suffix=self.suffix or comp.get("suffixType") or "",
                       sufdir=self.sufdir or (comp.get("suffixDirection") or "" if not self.suffix else ""),
                       city=(self.city or comp.get("city") or "").upper(), zip=self.zip or comp.get("zip") or "")

    def census_differences(self, comp: dict) -> list[str]:
        """Stated parts that the Census match changed."""
        diffs = []
        for label, mine, theirs in (("street name", self.name, (comp.get("streetName") or "").upper()),
                                    ("suffix", self.suffix, comp.get("suffixType") or ""),
                                    ("direction", self.sufdir or self.predir,
                                     comp.get("suffixDirection") or comp.get("preDirection") or "")):
            if mine and theirs != mine:
                diffs.append(f"{label} {mine} -> {theirs or '(none)'}")
        return diffs


def _tokens(s: str) -> list[str]:
    s = s.upper().replace(".", " ").replace("#", " # ")
    return [t for t in re.split(r"[\s]+", s) if t]


def parse_street(line: str) -> ParsedAddress:
    """Parse '2448 Industrial Pkwy W Ste 3' (no city)."""
    t = _tokens(line)
    unit = ""
    for i, tok in enumerate(t):
        if tok in UNIT_WORDS and i > 1:
            unit = " ".join(t[i + 1:]) or tok
            t = t[:i]
            break
    house = ""
    if t and re.fullmatch(r"\d+[A-Z]?(-\d+[A-Z]?)?", t[0]):
        house = t.pop(0)
        if t and re.fullmatch(r"1/2|[A-Z]", t[0]) and t[0] not in DIRS and len(t) > 2:   # '123 A Main St' / '123 1/2 Main St'
            house += " " + t.pop(0)
    predir = DIRS[t.pop(0)] if len(t) > 2 and t[0] in DIRS else ""
    sufdir = DIRS[t.pop()] if len(t) > 1 and t[-1] in DIRS else ""
    suffix = SUFFIX[t.pop()] if len(t) > 1 and t[-1] in SUFFIX else ""
    name = " ".join(ORDINALS.get(x, x) for x in t)
    name = re.sub(r"\b0+(\d+(ST|ND|RD|TH))\b", r"\1", name)       # '04TH' -> '4TH'
    return ParsedAddress(house=house, predir=predir, name=name, suffix=suffix, sufdir=sufdir, unit=unit)


def parse(address: str) -> ParsedAddress:
    """Parse 'line1, city, CA zip' (city/state/zip optional)."""
    parts = [p.strip() for p in address.split(",") if p.strip()]
    if not parts:
        return ParsedAddress()
    a = parse_street(parts[0])
    city = state = zip_ = ""
    rest = parts[1:]
    if rest:
        last = _tokens(rest[-1])
        if last and re.fullmatch(r"\d{5}(-\d{4})?", last[-1]):
            zip_ = last.pop()[:5]
        if last and last[-1] in STATES:
            state = "CA"
            last.pop()
        if last:
            rest[-1] = " ".join(last)
        else:
            rest = rest[:-1]
        city = rest[-1].upper() if rest else ""
    return replace(a, city=city, state=state, zip=zip_)


def compare(entered: ParsedAddress, other: ParsedAddress) -> Literal["exact", "partial", "none"]:
    """exact: house, name, and any suffix/direction both sides state agree.
    partial: house and street name agree but a stated suffix or direction differs.
    none: house number or street name differs."""
    if not entered.house or not house_in(entered.house, other.house) or entered.name != other.name:
        return "none"
    for a, b in ((entered.suffix, other.suffix), (entered.sufdir, other.sufdir), (entered.predir, other.predir)):
        if a and b and a != b:
            return "partial"
    return "exact"


def house_in(house: str, other: str) -> bool:
    """'548' matches '548' and the range '534-548' (same parity not enforced)."""
    h, o = re.sub(r"\s+", "", house or ""), re.sub(r"\s+", "", other or "")
    if h == o:
        return True
    m = re.fullmatch(r"(\d+)-(\d+)", o)
    if m and h.isdigit():
        lo, hi = sorted((int(m.group(1)), int(m.group(2))))
        return lo <= int(h) <= hi
    return False


def trim_after_suffix(line: str) -> str:
    """'122-150 WESTERN AVE MILL B' -> '122-150 WESTERN AVE' (drops building/unit words after the suffix)."""
    t = _tokens(line)
    for i, tok in enumerate(t[2:], start=2):
        if tok in SUFFIX:
            end = i + 1 + (1 if i + 1 < len(t) and t[i + 1] in DIRS else 0)
            return " ".join(t[:end])
    return line
