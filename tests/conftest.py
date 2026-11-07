import os
from pathlib import Path

import pytest

from permits.http import HttpClient
from permits.jurisdictions import Registry

FIX = Path(__file__).parent / "fixtures"
LIVE = os.environ.get("PERMITS_LIVE") == "1"


@pytest.fixture
def registry() -> Registry:
    return Registry()


@pytest.fixture
def replay() -> HttpClient:
    """HTTP client that only replays recorded responses (tests/fixtures/http); any new request fails."""
    return HttpClient(cache_dir=FIX / "http", offline=True, rate_per_sec=0)
