"""Polite HTTP: one client, a descriptive User-Agent, at least 1 s between requests, and no exceptions
escaping to callers — failures come back as (None, error_text) so they can be written into the record."""
from __future__ import annotations

import time
from typing import Any
from urllib.parse import urlencode

import requests

USER_AGENT = "EQORE-SiteRecords/0.1 (+https://github.com/mschasz/eqore-site-records)"
MIN_INTERVAL_S = 1.0


class Http:
    def __init__(self, min_interval: float = MIN_INTERVAL_S, timeout: float = 60):
        self.min_interval = min_interval
        self.timeout = timeout
        self._last = 0.0
        self.session = requests.Session()
        self.session.headers["User-Agent"] = USER_AGENT

    @staticmethod
    def url(base: str, params: dict[str, Any]) -> str:
        """The exact query URL recorded as each value's source."""
        return f"{base}?{urlencode(params)}"

    def get_json(self, base: str, params: dict[str, Any]) -> tuple[Any, str | None, str]:
        url = self.url(base, params)
        wait = self._last + self.min_interval - time.monotonic()
        if wait > 0:
            time.sleep(wait)
        self._last = time.monotonic()
        try:
            r = self.session.get(base, params=params, timeout=self.timeout)
        except requests.RequestException as e:
            return None, f"{type(e).__name__}: {e}", url
        if r.status_code >= 400:
            return None, f"HTTP {r.status_code} from {base}", url
        try:
            data = r.json()
        except ValueError:
            return None, f"Non-JSON response from {base} (HTTP {r.status_code})", url
        if isinstance(data, dict) and data.get("error"):
            err = data["error"]
            code = err.get("code") if isinstance(err, dict) else None
            msg = err.get("message") if isinstance(err, dict) else str(err)
            if code in (401, 403, 498, 499):
                return None, f"LOGIN/TOKEN REQUIRED ({code}): {msg} — stopped, not worked around", url
            return None, f"Service error {code}: {msg}", url
        return data, None, url
