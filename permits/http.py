"""The single HTTP client every adapter uses.

- per-host rate limiting (default ~3 requests/second)
- retries with backoff on 429 / 5xx (honours Retry-After)
- a descriptive User-Agent (no personal contact details)
- robots.txt checks per host
- an on-disk cache keyed by the full request, which doubles as recorded test fixtures
  (offline=True replays only from the cache and fails on a miss)
- an unreachable host fails once with a clear message naming the host; no retry loop
"""
from __future__ import annotations

import base64
import hashlib
import json
import time
import urllib.robotparser
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
from urllib.parse import urlencode, urlsplit

import requests

DEFAULT_UA = "EQORE-SiteRecords/0.1 (+https://github.com/mschasz/eqore-site-records)"
# Request headers that change the response and therefore belong in the cache key.
KEY_HEADERS = ("range", "fileid", "filetoken", "tenantname", "x-app-token")


class HttpError(Exception):
    pass


class HostUnreachable(HttpError):
    def __init__(self, host: str, cause: Exception):
        super().__init__(f"Host unreachable: {host} ({type(cause).__name__}: {cause}). "
                         "Check the network or proxy; not retrying.")
        self.host = host


class RobotsDisallowed(HttpError):
    pass


class CacheMiss(HttpError):
    pass


@dataclass
class Response:
    status: int
    headers: dict[str, str]
    content: bytes
    url: str
    from_cache: bool = False

    def json(self) -> Any:
        return json.loads(self.content.decode("utf-8"))

    @property
    def text(self) -> str:
        return self.content.decode("utf-8", errors="replace")

    def raise_for_status(self) -> None:
        if self.status >= 400:
            raise HttpError(f"HTTP {self.status} for {self.url}: {self.text[:200]}")


@dataclass
class HttpClient:
    user_agent: str = DEFAULT_UA
    rate_per_sec: float = 3.0
    cache_dir: Path | None = None
    offline: bool = False
    refresh: bool = False
    max_retries: int = 4
    timeout: float = 90.0
    respect_robots: bool = True
    _last: dict[str, float] = field(default_factory=dict)
    _robots: dict[str, urllib.robotparser.RobotFileParser | None] = field(default_factory=dict)
    _session: requests.Session = field(default_factory=requests.Session)

    # ------------------------------------------------------------------ cache
    def _key(self, method: str, url: str, params: dict | None, body: Any, headers: dict) -> str:
        h = {k.lower(): v for k, v in headers.items() if k.lower() in KEY_HEADERS}
        raw = json.dumps([method.upper(), url, sorted((params or {}).items()), body, sorted(h.items())], sort_keys=True, default=str)
        return hashlib.sha256(raw.encode()).hexdigest()

    def _cache_path(self, key: str) -> Path | None:
        return self.cache_dir / key[:2] / f"{key}.json" if self.cache_dir else None

    def _cache_get(self, key: str) -> Response | None:
        p = self._cache_path(key)
        if not p or not p.exists() or self.refresh:
            return None
        d = json.loads(p.read_text())
        return Response(d["status"], d["headers"], base64.b64decode(d["body_b64"]), d["url"], from_cache=True)

    def _cache_put(self, key: str, r: Response, method: str, params: Any) -> None:
        p = self._cache_path(key)
        if not p:
            return
        p.parent.mkdir(parents=True, exist_ok=True)
        keep = {k: v for k, v in r.headers.items() if k.lower() in ("content-type", "content-range", "content-length")}
        p.write_text(json.dumps({"method": method, "url": r.url, "params": params, "status": r.status, "headers": keep,
                                 "body_b64": base64.b64encode(r.content).decode()}))

    # ------------------------------------------------------------------ politeness
    def _throttle(self, host: str) -> None:
        gap = 1.0 / self.rate_per_sec if self.rate_per_sec > 0 else 0
        wait = self._last.get(host, 0) + gap - time.monotonic()
        if wait > 0:
            time.sleep(wait)
        self._last[host] = time.monotonic()

    def _allowed(self, url: str) -> bool:
        if not self.respect_robots or self.offline:
            return True
        parts = urlsplit(url)
        base = f"{parts.scheme}://{parts.netloc}"
        if base not in self._robots:
            rp = urllib.robotparser.RobotFileParser()
            try:
                r = self._session.get(base + "/robots.txt", headers={"User-Agent": self.user_agent}, timeout=20)
                rp.parse(r.text.splitlines() if r.status_code == 200 else [])
                self._robots[base] = rp
            except requests.RequestException:
                self._robots[base] = None  # unreadable robots.txt: proceed, as browsers do
        rp = self._robots[base]
        return True if rp is None else rp.can_fetch(self.user_agent, url)

    # ------------------------------------------------------------------ request
    def request(self, method: str, url: str, *, params: dict | None = None, json_body: Any = None,
                headers: dict | None = None, use_cache: bool = True) -> Response:
        headers = dict(headers or {})
        headers.setdefault("User-Agent", self.user_agent)
        key = self._key(method, url, params, json_body, headers)
        if use_cache:
            hit = self._cache_get(key)
            if hit:
                return hit
        if self.offline:
            raise CacheMiss(f"Offline and not cached: {method} {url} {params or ''}")
        if not self._allowed(url):
            raise RobotsDisallowed(f"robots.txt disallows {url} for this user agent")
        host = urlsplit(url).netloc
        for attempt in range(self.max_retries + 1):
            self._throttle(host)
            try:
                r = self._session.request(method, url, params=params, json=json_body, headers=headers, timeout=self.timeout)
            except (requests.ConnectionError, requests.Timeout) as e:
                raise HostUnreachable(host, e) from None
            if r.status_code == 429 or r.status_code >= 500:
                if attempt < self.max_retries:
                    ra = r.headers.get("Retry-After")
                    time.sleep(float(ra) if ra and ra.isdigit() else min(30, 1.5 * 2 ** attempt))
                    continue
            resp = Response(r.status_code, dict(r.headers), r.content, r.url)
            if use_cache and resp.status < 400:
                self._cache_put(key, resp, method, params if params else json_body)
            return resp
        raise HttpError(f"Gave up after {self.max_retries} retries: {url}")

    def download_file(self, url: str, dest_dir: Path | None = None, max_age_hours: float = 24.0) -> Path:
        """Stream a large export (e.g. a 240 MB permits CSV) to a file cache instead of the JSON cache.
        Re-downloads when the cached copy is older than `max_age_hours` (or with refresh=True)."""
        base = dest_dir or (self.cache_dir / "files" if self.cache_dir else Path(".cache/permits/files"))
        path = base / (hashlib.sha256(url.encode()).hexdigest()[:24] + "_" + Path(urlsplit(url).path).name)
        fresh = path.exists() and (time.time() - path.stat().st_mtime) < max_age_hours * 3600
        if fresh and not self.refresh:
            return path
        if self.offline:
            if path.exists():
                return path
            raise CacheMiss(f"Offline and not cached: {url}")
        if not self._allowed(url):
            raise RobotsDisallowed(f"robots.txt disallows {url} for this user agent")
        host = urlsplit(url).netloc
        self._throttle(host)
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(path.suffix + ".part")
        try:
            with self._session.get(url, headers={"User-Agent": self.user_agent}, stream=True, timeout=self.timeout) as r:
                if r.status_code >= 400:
                    raise HttpError(f"HTTP {r.status_code} for {url}")
                with tmp.open("wb") as f:
                    for chunk in r.iter_content(1 << 20):
                        f.write(chunk)
        except (requests.ConnectionError, requests.Timeout) as e:
            raise HostUnreachable(host, e) from None
        tmp.replace(path)
        return path

    def get(self, url: str, **kw) -> Response:
        return self.request("GET", url, **kw)

    def post(self, url: str, **kw) -> Response:
        return self.request("POST", url, **kw)

    @staticmethod
    def describe(method: str, url: str, params: dict | None = None, body: Any = None) -> str:
        """Human-readable form of a request for `source_query`."""
        q = f"?{urlencode(params)}" if params else ""
        b = f" body={json.dumps(body, sort_keys=True)}" if body is not None else ""
        return f"{method} {url}{q}{b}"
