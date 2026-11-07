"""Browser-automation adapters (Playwright) for portals without a public API.

Before writing a DOM scraper for a new portal, run the discovery tool:

    python -m permits discover "https://aca-prod.accela.com/PALOALTO/" --search "250 Hamilton"

It opens the portal, lets you (or the --search helper) run one search, and logs every XHR/fetch
request that returned JSON. Most portals call a JSON API under the hood (EnerGov did); if one exists,
write a plain HTTP adapter against it instead of scraping.

The Accela flow below follows Accela Citizen Access's standard "Search Applications" page. It has not
been run against a live portal in this repository (marked verify); portals customise field ids.
"""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from ..models import PermitRecord, Site, utcnow
from .base import Adapter


class BrowserUnavailable(RuntimeError):
    pass


def _playwright():
    try:
        from playwright.sync_api import sync_playwright  # type: ignore
    except ImportError as e:  # pragma: no cover
        raise BrowserUnavailable("Playwright is not installed: pip install playwright && playwright install chromium") from e
    return sync_playwright


def discover(url: str, out: Path, search_text: str | None = None, wait_ms: int = 8000, headless: bool = True) -> list[dict[str, Any]]:
    """Open a portal, optionally type a search, and record JSON XHR/fetch traffic to `out`."""
    sync_playwright = _playwright()
    calls: list[dict[str, Any]] = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=headless)
        page = browser.new_page(user_agent="EQORE-SiteRecords/0.1 (+https://github.com/mschasz/eqore-site-records)")

        seen: list = []
        # Only record the response objects in the event callback; bodies are read after the page settles
        # (calling back into Playwright from inside an event handler is not allowed in the sync API).
        page.on("response", lambda resp: seen.append(resp) if resp.request.resource_type in ("xhr", "fetch") else None)
        page.goto(url, wait_until="domcontentloaded", timeout=60000)
        page.wait_for_timeout(4000)   # single-page apps keep polling, so "networkidle" may never arrive
        if search_text:
            box = page.locator("input[type=search]:visible, input[type=text]:visible, input:not([type]):visible").first
            try:
                box.press_sequentially(search_text, delay=30, timeout=15000)
                box.press("Enter")
            except Exception as e:  # no visible search box: still return whatever loaded
                calls.append({"note": f"could not type into a search box: {type(e).__name__}"})
        page.wait_for_timeout(wait_ms)
        for resp in seen:
            req = resp.request
            ctype = resp.headers.get("content-type", "")
            try:
                post = req.post_data
            except Exception:  # binary / compressed bodies
                post = "(binary)"
            entry = {"method": req.method, "url": req.url, "status": resp.status, "content_type": ctype,
                     "request_headers": {k: v for k, v in req.headers.items() if k.lower() not in ("cookie", "authorization")},
                     "post_data": post}
            if "json" in ctype:
                try:
                    entry["sample"] = resp.text()[:2000]
                except Exception:
                    pass
            calls.append(entry)
        browser.close()
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({"url": url, "search": search_text, "captured_at": utcnow(), "calls": calls}, indent=2))
    return calls


class BrowserAdapter(Adapter):
    kind = "browser"

    def search(self, site: Site) -> list[PermitRecord]:
        flow = self.cfg.get("flow")
        if flow == "accela":
            return self._accela(site)
        self.notes.append(f"{self.label}: no automated flow yet ({self.cfg.get('portal_url')}). "
                          "Run `python -m permits discover <url>` to find its JSON API, or use the records request.")
        return []

    def _accela(self, site: Site) -> list[PermitRecord]:  # verify against a live Accela portal
        sync_playwright = _playwright()
        base = self.cfg["portal_url"].rstrip("/") + "/"
        url = base + "Cap/CapHome.aspx?module=Building&TabName=Building"
        out: list[PermitRecord] = []
        street_partial = (site.street_name or "").split()[0] if site.street_name else ""
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            page = browser.new_page(user_agent=self.http.user_agent)
            page.goto(url, wait_until="networkidle")
            page.fill("input[id$='txtGSNumber_ChildControl0']", site.number or "")
            page.fill("input[id$='txtGSStreetName']", street_partial)
            page.click("a[id$='btnNewSearch']")
            page.wait_for_load_state("networkidle")
            rows = page.locator("table[id$='gdvPermitList'] tr.ACA_TabRow_Odd, table[id$='gdvPermitList'] tr.ACA_TabRow_Even")
            for i in range(rows.count()):
                cells = [c.strip() for c in rows.nth(i).locator("td").all_inner_texts()]
                link = rows.nth(i).locator("a[href*='CapDetail']").first
                href = link.get_attribute("href") if link.count() else None
                num = next((c for c in cells if re.match(r"^[A-Z]{1,6}[-\d]{4,}", c)), None)
                if not num:
                    continue
                addr = next((c for c in cells if re.match(r"^\d+\s", c)), "")
                from ..matcher import basis
                b = basis(site, addr, None)
                if not b:
                    continue
                out.append(PermitRecord(jurisdiction=self.j.name, permit_number=num, description=" | ".join(cells), address=addr or None,
                                        portal_url=(base + href.lstrip("/")) if href and not href.startswith("http") else href,
                                        source=self.label, source_query=f"Browser search {url} number={site.number} street~{street_partial}",
                                        match_basis=b, confidence="documented"))
            browser.close()
        return out
