"""Decide whether a returned record belongs to the site.

Portal keyword searches are fuzzy and return neighbouring addresses. A record is kept only if
the house number AND street name match (direction must agree when both sides give one), or the
APN matches. Ranges ('1950-2190 Cesar Chavez') match any number inside them.
"""
from __future__ import annotations

import re

from .address import apn_digits, parse_street, street_key
from .models import Site


def _num(s: str | None) -> int | None:
    m = re.match(r"(\d+)", s or "")
    return int(m.group(1)) if m else None


def numbers_match(site: Site, number: str | None, number_hi: str | None = None) -> bool:
    a, b = _num(site.number), _num(number)
    if a is None or b is None:
        return False
    a_hi, b_hi = _num(site.number_hi) or a, _num(number_hi) or b
    return not (a_hi < b or b_hi < a)   # ranges overlap


def street_matches(site: Site, rec: dict) -> bool:
    if street_key(site.street_name) != street_key(rec.get("street_name")):
        return False
    for k in ("post_dir", "pre_dir"):
        if getattr(site, k) and rec.get(k) and getattr(site, k) != rec.get(k):
            return False
    return True


def address_matches(site: Site, address_text: str | None = None, *, number: str | None = None,
                    street_name: str | None = None) -> bool:
    """Match against a free-text address ('2457 Industrial PKWY W Unit: K HAYWARD CA 94545') or parts."""
    if number is not None or street_name is not None:
        rec = {"number": number, **parse_street(f"{number or ''} {street_name or ''}")}
        rec["number"] = number
    else:
        text = re.sub(r"\s+", " ", (address_text or "")).strip()
        text = re.split(r",| (?:HAYWARD|SAN FRANCISCO|SAN JOSE|LOS ANGELES|BOSTON|CAMBRIDGE)\b", text, maxsplit=1, flags=re.I)[0]
        text = re.sub(r"\b(?:UNIT|STE|SUITE|APT)\s*:?\s*\S+.*$", "", text, flags=re.I).strip()
        text = re.sub(r"\s+\d{5}(?:-\d{4})?$", "", text)
        text = re.sub(r"\s+(?:CA|MA|NH)$", "", text, flags=re.I)
        rec = parse_street(text)
    return numbers_match(site, rec.get("number"), rec.get("number_hi")) and street_matches(site, rec)


def apn_matches(site: Site, apn: str | None) -> bool:
    return bool(site.apn and apn and apn_digits(site.apn) == apn_digits(apn))


def basis(site: Site, address_text: str | None = None, apn: str | None = None, **parts) -> str | None:
    a = address_matches(site, address_text, **parts) if (address_text or parts) else False
    p = apn_matches(site, apn)
    return "both" if a and p else "address" if a else "apn" if p else None
