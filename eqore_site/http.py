"""The one HTTP client. Live HTTP happens only through here.

Modes
- live:   real requests (timeout, retries, UA). If `store_dir` is set, every
          response is also written there (recording fixtures / on-disk cache).
- replay: no network. Responses are read from `store_dir` (and any `read_dirs`);
          a request with no recorded response raises `FixtureMissing` (which the
          pipeline turns into a source_errors entry, like any other failure).
- cache:  read a stored response if one exists (store_dir or read_dirs), else
          fetch live and store it in `store_dir`. Used by the API.

Stored files are keyed by a hash of the canonical URL + params, prefixed with
the source key so a human can tell them apart:
    <store_dir>/<source>__<sha1[:12]>.json
"""

from __future__ import annotations

import hashlib
import json
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal, Optional
from urllib.parse import urlencode

import httpx

USER_AGENT = "eqore-site-record/0.1"


class FetchError(Exception):
    """Any failure to get a usable response (HTTP error, timeout, bad JSON, service error)."""

    def __init__(self, message: str, url: Optional[str] = None):
        super().__init__(message)
        self.url = url


class FixtureMissing(FetchError):
    pass


def canonical_url(url: str, params: Optional[dict] = None) -> str:
    if not params:
        return url
    return url + "?" + urlencode(sorted((k, str(v)) for k, v in params.items()))


def _key(url: str, params: Optional[dict]) -> str:
    return hashlib.sha1(canonical_url(url, params).encode()).hexdigest()[:12]


class HttpClient:
    def __init__(
        self,
        mode: Literal["live", "replay", "cache"] = "live",
        store_dir: Optional[Path | str] = None,
        timeout: float = 30.0,
        retries: int = 2,
        read_dirs: Optional[list[Path | str]] = None,
    ):
        self.mode = mode
        self.store_dir = Path(store_dir) if store_dir else None
        self.read_dirs = [Path(d) for d in (read_dirs or [])]
        if mode in ("replay", "cache") and not (self.store_dir or self.read_dirs):
            raise ValueError(f"{mode} mode needs store_dir or read_dirs")
        self.retries = retries
        self._client = (
            httpx.Client(timeout=timeout, follow_redirects=True, headers={"User-Agent": USER_AGENT})
            if mode in ("live", "cache")
            else None
        )

    # -- public -------------------------------------------------------------
    def get_json(self, source: str, url: str, params: Optional[dict] = None) -> Any:
        """GET and parse JSON. Raises FetchError on any failure, including an
        ArcGIS-style `{"error": ...}` body returned with HTTP 200."""
        if self.mode == "replay":
            body = self._load(source, url, params)
        elif self.mode == "cache":
            try:
                body = self._load(source, url, params)
            except FixtureMissing:
                body = self._fetch(source, url, params)
        else:
            body = self._fetch(source, url, params)
        try:
            data = json.loads(body)
        except json.JSONDecodeError as e:
            raise FetchError(f"response is not JSON: {body[:120]!r}", canonical_url(url, params)) from e
        if isinstance(data, dict) and "error" in data and isinstance(data["error"], dict):
            err = data["error"]
            raise FetchError(f"service error {err.get('code')}: {err.get('message')}", canonical_url(url, params))
        return data

    def close(self) -> None:
        if self._client:
            self._client.close()

    # -- internals ----------------------------------------------------------
    def _fetch(self, source: str, url: str, params: Optional[dict]) -> str:
        assert self._client is not None
        full = canonical_url(url, params)
        last: Exception | None = None
        for attempt in range(self.retries + 1):
            try:
                r = self._client.get(url, params=params)
                if r.status_code >= 500 and attempt < self.retries:
                    time.sleep(1.5 * (attempt + 1))
                    continue
                if r.status_code >= 400:
                    raise FetchError(f"HTTP {r.status_code}", full)
                self._save(source, url, params, r.status_code, str(r.url), r.text)
                return r.text
            except httpx.HTTPError as e:
                last = e
                if attempt < self.retries:
                    time.sleep(1.5 * (attempt + 1))
        raise FetchError(f"{type(last).__name__}: {last}", full)

    def _path(self, source: str, url: str, params: Optional[dict]) -> Path:
        assert self.store_dir is not None
        return self.store_dir / f"{source}__{_key(url, params)}.json"

    def _save(self, source, url, params, status, final_url, text) -> None:
        if not self.store_dir:
            return
        self.store_dir.mkdir(parents=True, exist_ok=True)
        try:
            body: Any = json.loads(text)
            kind = "json"
        except json.JSONDecodeError:
            body, kind = text, "text"
        rec = {
            "source": source,
            "url": url,
            "params": params or {},
            "final_url": final_url,
            "status_code": status,
            "fetched_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "body_kind": kind,
            "body": body,
        }
        self._path(source, url, params).write_text(json.dumps(rec, indent=1, sort_keys=False))

    def _load(self, source: str, url: str, params: Optional[dict]) -> str:
        name = f"{source}__{_key(url, params)}.json"
        dirs = ([self.store_dir] if self.store_dir else []) + self.read_dirs
        p = next((d / name for d in dirs if (d / name).exists()), None)
        if p is None:
            raise FixtureMissing(f"no recorded response ({name})", canonical_url(url, params))
        rec = json.loads(p.read_text())
        return rec["body"] if rec["body_kind"] == "text" else json.dumps(rec["body"])
