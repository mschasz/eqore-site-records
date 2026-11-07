"""Adapter tests replayed from recorded HTTP fixtures (tests/fixtures/http), plus opt-in live smoke tests."""
import json
import shutil
from pathlib import Path

import pytest

from permits import address
from permits.adapters.ckan import CsvDownloadAdapter
from permits.http import HttpClient
from permits.pipeline import fetch

from .conftest import FIX, LIVE

PDFS = {"Permit Building with Insp..pdf": (138174, "65de82e982eedbd49db35df632c8129bda9da3c98a92e9a1d4c1ef8ff881cda9"),
        "Permit Fire Prevention Annual.pdf": (86248, "bf952507b010a8ceb07b2176c2e957d334285228f0373c519d9a9aa5fa5e5a4e")}


def test_hayward_2457_records_and_pdfs(registry, replay, tmp_path):
    """Acceptance 1: 40 records (38 permits + 2 plans) and 2 PDFs with matching sha256."""
    res = fetch("2457 Industrial Pkwy W, Hayward, CA 94545", out=tmp_path, registry=registry, http=replay)
    assert len(res.records) == 40
    assert sum(r.record_type == "permit" for r in res.records) == 38
    assert sum(r.record_type == "plan" for r in res.records) == 2
    assert {r.apn for r in res.records} >= {"463-0025-035-00", "463-0025-036-00"}
    got = {a.file_name: (a.bytes, a.sha256) for a in res.attachments if a.local_path}
    assert got == PDFS
    r = next(x for x in res.records if x.permit_number == "FP-OPER-2024-00046")
    assert r.source.startswith("City of Hayward") and "Keyword='2457 Industrial Pkwy W'" in r.source_query and r.retrieved_at
    out = tmp_path / "2457-industrial-pkwy-w-hayward-ca" / "permits"
    for f in ("permits.json", "permits.csv", "attachments.csv", "missing.json", "records_request.md"):
        assert (out / f).exists()
    assert (out / "files" / "FP-OPER-2024-00046" / "Permit Fire Prevention Annual.pdf").stat().st_size == 86248


def test_hayward_idempotent_rerun(registry, replay, tmp_path):
    fetch("2457 Industrial Pkwy W, Hayward, CA 94545", out=tmp_path, registry=registry, http=replay)
    p = tmp_path / "2457-industrial-pkwy-w-hayward-ca" / "permits" / "files" / "FP-OPER-2024-00046" / "Permit Fire Prevention Annual.pdf"
    mtime = p.stat().st_mtime_ns
    res = fetch("2457 Industrial Parkway West, Hayward, CA 94545", out=tmp_path, registry=registry, http=replay)
    assert len(res.records) == 40 and p.stat().st_mtime_ns == mtime  # file with matching sha256 not rewritten


def test_hayward_2448_not_found_suggests_neighbours(registry, replay, tmp_path):
    """Acceptance 2: 0 records, missing.json with nearby addresses, and a records-request draft."""
    res = fetch("2448 Industrial Pkwy West, Hayward, CA 94545", out=tmp_path, registry=registry, http=replay)
    assert res.records == []
    out = tmp_path / "2448-industrial-pkwy-w-hayward-ca" / "permits"
    missing = json.loads((out / "missing.json").read_text())
    near = next(m for m in missing if m["field"] == "permits")["detail"]["nearby_addresses"]
    numbers = {int(n["address"].split()[0]) for n in near}
    assert {2447, 2452, 2457, 2480} <= numbers
    assert next(n for n in near if n["address"].startswith("2447"))["apns"] == ["463-0025-033-00"]
    req = (out / "records_request.md").read_text()
    assert "California Public Records Act" in req and "19851" in req and "single-line diagrams" in req


def test_sf_building_and_electrical_merged(registry, replay, tmp_path):
    """Acceptance 3: both SF datasets, merged without duplicates."""
    res = fetch("888 Tennessee St, San Francisco, CA 94107", apn="4060/001", out=tmp_path, files=False, registry=registry, http=replay)
    nums = [r.permit_number for r in res.records]
    assert len(nums) == len(set(nums)) == 50
    assert {r.source for r in res.records} == {"DataSF Building Permits (i98e-djp9)", "DataSF Electrical Permits (ftty-kx6y)"}
    # Three permits were filed under 890 Tennessee St on the same parcel: kept on APN alone.
    apn_only = [r for r in res.records if r.match_basis == "apn"]
    assert len(apn_only) == 3 and all(r.address.startswith("890 Tennessee") for r in apn_only)
    assert sum(r.match_basis == "both" for r in res.records) == 47
    ats = next(r for r in res.records if "automatic transfer switch" in (r.description or ""))
    assert "ats" in ats.extracted["tags"] and ats.confidence == "extracted"


def test_sf_extractor_fixture_record(registry, replay, tmp_path):
    """Acceptance 5 on the live record E202610083544."""
    res = fetch("1532 Diamond St, San Francisco, CA 94131", out=tmp_path, files=False, registry=registry, http=replay)
    r = next(x for x in res.records if x.permit_number == "E202610083544")
    assert r.extracted["pv_kw_dc"] == pytest.approx(6.58)
    assert r.extracted["ess_kwh"] == 20
    assert r.extracted["battery_model"] == "Enphase IQ Battery 10C"
    assert r.description and "enphase iq battery 10c" in r.description  # raw text kept


def test_cambridge_follows_type_dataset(registry, replay, tmp_path):
    res = fetch("221 Hamilton St, Cambridge, MA 02139", out=tmp_path, files=False, registry=registry, http=replay)
    e = next(r for r in res.records if r.permit_number == "Electrical-96668")
    assert e.extracted["service_amps"] == 400 and "service_amps" in e.extracted["documented_fields"]
    assert e.description.startswith("New wiring") and e.portal_url.startswith("https://data.cambridgema.gov/resource/hvtc-3ab9")


def test_boston_csv_solar_tagged(registry, tmp_path, monkeypatch):
    """Acceptance 4 (Boston): CSV export rows matched to the address; solar jobs tagged.
    The full export is ~240 MB, so the test uses the 81 real rows for Withington St."""
    sample = tmp_path / "boston.csv"
    shutil.copy(FIX / "boston_withington_sample.csv", sample)
    monkeypatch.setattr(HttpClient, "download_file", lambda self, url, dest_dir=None, max_age_hours=24: sample)
    res = fetch("31-33 Withington St, Boston, MA 02121", out=tmp_path, files=False, registry=registry, http=HttpClient(offline=True))
    r = next(x for x in res.records if x.permit_number == "SF1601624")
    assert "solar" in r.extracted["tags"] and r.extracted["pv_kw_dc"] == pytest.approx(6.48)
    assert all(x.address and "Withington" in x.address for x in res.records)
    assert not any(x.address.startswith("41 ") for x in res.records)


@pytest.mark.skipif(not LIVE, reason="set PERMITS_LIVE=1 to hit live endpoints")
def test_live_smoke_hayward(registry, tmp_path):
    res = fetch("2457 Industrial Pkwy W, Hayward, CA 94545", out=tmp_path, registry=registry,
                http=HttpClient(cache_dir=tmp_path / "cache"))
    assert len(res.records) >= 40
    assert {a.sha256 for a in res.attachments if a.file_name in PDFS} >= {v[1] for v in PDFS.values()}


@pytest.mark.skipif(not LIVE, reason="set PERMITS_LIVE=1 to hit live endpoints")
def test_live_smoke_sf(registry, tmp_path):
    res = fetch("1532 Diamond St, San Francisco, CA 94131", out=tmp_path, files=False, registry=registry,
                http=HttpClient(cache_dir=tmp_path / "cache"))
    assert any(r.permit_number == "E202610083544" for r in res.records)
