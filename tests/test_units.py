"""Unit tests: address normalizer, matcher, extractor, registry, HTTP client behaviour."""
from pathlib import Path

import pytest

from permits import address, matcher
from permits.adapters import ADAPTERS
from permits.adapters.energov import EnerGovAdapter
from permits.extract import extract
from permits.http import CacheMiss, HostUnreachable, HttpClient
from permits.jurisdictions import Registry


@pytest.mark.parametrize("raw", ["2457 Industrial Pkwy W, Hayward, CA 94545", "2457 Industrial Pkwy West, Hayward, CA 94545",
                                 "2457 Industrial Parkway West, Hayward CA 94545", "2457 INDUSTRIAL PKWY W, HAYWARD, CA 94545"])
def test_address_forms_normalize_identically(raw):
    s = address.parse(raw)
    assert (s.number, s.street_name, s.suffix, s.post_dir, s.city, s.state, s.zip) == ("2457", "Industrial", "PKWY", "W", "Hayward", "CA", "94545")
    assert address.variants(s)[0] == "2457 Industrial Pkwy W"


def test_ranges_and_units():
    s = address.parse("1950-2190 Cesar Chavez St, San Francisco, CA 94124")
    assert (s.number, s.number_hi, s.street_name, s.suffix) == ("1950", "2190", "Cesar Chavez", "ST")
    assert matcher.address_matches(s, "2150 CESAR CHAVEZ ST")
    assert not matcher.address_matches(s, "2300 CESAR CHAVEZ ST")
    u = address.parse("100 Main St Unit 4B, Boston, MA")
    assert u.unit == "4B" and u.street_name == "Main"


def test_matcher_rejects_neighbours_and_wrong_direction():
    s = address.parse("2457 Industrial Pkwy W, Hayward, CA 94545")
    assert matcher.address_matches(s, "2457   Industrial           PKWY W  HAYWARD CA 94545")
    assert not matcher.address_matches(s, "2479   Industrial           PKWY W  Unit: K HAYWARD CA")
    assert not matcher.address_matches(s, "2457 Industrial Pkwy E Hayward CA")
    assert not matcher.address_matches(s, "2457 Industry Way Hayward CA")


def test_matcher_apn_basis():
    s = address.parse("2457 Industrial Pkwy W, Hayward, CA", apn="463-0025-036-00")
    assert matcher.basis(s, "2479 Industrial PKWY W Unit: K", "463-0025-036-00") == "apn"
    assert matcher.basis(s, "2457 Industrial Pkwy W", "463 0025 036 00") == "both"


SF_FIXTURE = ("solarapp+ approval: sa20261006-2454-309-2392-a - installing 14 roof-mounted solar pv modules, 470 watts per module, "
              "total no. of rating 6.58 kw. install 6.58kw (14) pv; (14) microinverters; (2) ess system - enphase iq battery 10c - total 20kwh.")


def test_extractor_on_sf_fixture():
    ex = extract(SF_FIXTURE)
    assert ex["pv_kw_dc"] == pytest.approx(6.58)
    assert ex["ess_kwh"] == 20
    assert ex["battery_model"] == "Enphase IQ Battery 10C"
    assert {"pv", "ess"} <= set(ex["tags"])


def test_extractor_on_prompt_examples():
    ex = extract("Roof-mounted PV 14 x 470 W (6.58 kW), 2 x Enphase IQ Battery 10C (20 kWh)")
    assert ex["pv_kw_dc"] == pytest.approx(6.58) and ex["ess_kwh"] == 20
    ex = extract("new 1600A 480V MSB")
    assert ex["service_amps"] == 1600 and ex["service_voltage"] == "480" and "switchgear" in ex["tags"]
    assert extract("replace 200-amp, 240-volt, 3ø, 4-wire, service riser")["phases"] == 3
    assert extract(None) == {} and extract("re-roof") == {}


def test_new_energov_city_is_yaml_only(tmp_path):
    """Acceptance 6: a new EnerGov city needs only a registry entry."""
    yml = tmp_path / "j.yaml"
    yml.write_text("""
client: {}
jurisdictions:
  - id: example-ca
    name: Example City, CA
    state: CA
    cities: [Example City]
    sources:
      - adapter: energov
        label: Example City EnerGov
        base_url: https://examplecityca-energovpub.tylerhost.net/apps/selfservice/api
        record_url: "https://examplecityca-energovpub.tylerhost.net/apps/selfservice#/{kind}/{case_id}"
        tenant: { id: "1", name: ExampleCityCAProd, url: ExampleCityCAProd }
        modules:
          - { filter: 2, record_type: permit, detail: permitdetail, detail_module: 1, attachment_modules: [1] }
""")
    reg = Registry(yml)
    j = reg.resolve(address.parse("1 Main St, Example City, CA"))
    assert j and j.id == "example-ca"
    ad = ADAPTERS[j.sources[0]["adapter"]](j, j.sources[0], HttpClient(offline=True))
    assert isinstance(ad, EnerGovAdapter) and ad.headers["tenantName"] == "ExampleCityCAProd"


def test_registry_resolves_targets():
    reg = Registry()
    for a, jid in [("2457 Industrial Pkwy W, Hayward, CA 94545", "hayward-ca"), ("888 Tennessee St, San Francisco, CA", "san-francisco-ca"),
                   ("31 Withington St, Boston, MA 02121", "boston-ma"), ("221 Hamilton St, Cambridge, MA", "cambridge-ma"),
                   ("1940 Lundy Ave, San Jose, CA 95131", "san-jose-ca"), ("1 Nowhere Rd, 94545", "hayward-ca")]:
        assert reg.resolve(address.parse(a)).id == jid
    assert reg.resolve(address.parse("1 Main St, Springfield, IL")) is None


def test_http_offline_miss_and_unreachable_host(tmp_path):
    with pytest.raises(CacheMiss):
        HttpClient(cache_dir=tmp_path, offline=True).get("https://example.invalid/x")
    c = HttpClient(cache_dir=tmp_path, respect_robots=False, timeout=3, max_retries=5)
    with pytest.raises(HostUnreachable) as e:
        c.get("http://127.0.0.1:9/nothing")
    assert "127.0.0.1:9" in str(e.value)
