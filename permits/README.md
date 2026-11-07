# permits — permit retrieval for EQORE site records

Given a site address (and optionally a parcel number), find every building, electrical, fire and planning permit the AHJ has on file. Download any public attachments, extract the equipment facts a battery design needs, and write it all with provenance: source, exact query, retrieval time, match basis and confidence. Anything that can't be found is listed in `missing.json` with a next step. A public-records request is drafted for drawings, which are rarely online.

## Run

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python -m permits fetch "2457 Industrial Pkwy W, Hayward, CA 94545"
.venv/bin/python -m permits fetch "888 Tennessee St, San Francisco, CA" --apn 4060/001 --no-files
.venv/bin/python -m permits discover "https://<portal>/" --search "123 Main St"   # find a portal's hidden JSON API
```

Options: `--out DIR` (default `out/`), `--no-files`, `--no-details`, `--refresh` (ignore cache), `--offline` (cache only), `--cache DIR`.

Output: `out/<normalized_address>/permits/`

| File | Contents |
|---|---|
| `permits.json`, `permits.csv` | One row per record (schema in `permits/models.py`) |
| `attachments.json`, `attachments.csv` | One row per file: id, group, bytes, sha256, source and portal URLs, errors |
| `files/<permit_number>/<file>` | The original files |
| `missing.json` | What couldn't be found, why, and what to do next (incl. nearby addresses with records) |
| `records_request.md` | CPRA or M.G.L. c.66 §10 request for permit history, SLDs, panel schedules and plan sets |

## Coverage (checked live 2026-11-07)

| Jurisdiction | Adapter | Source | Status |
|---|---|---|---|
| Hayward, CA | `energov` | Tyler EnerGov Self Service public API | Working; search, detail, attachments, downloads |
| San Francisco, CA | `socrata` ×2 | DataSF building `i98e-djp9` + electrical `ftty-kx6y`, merged | Working |
| Los Angeles, CA | `socrata` | LADBS electrical 2020– `9k3p-zrda` (solar/EV flags tagged) | Working |
| San José, CA | `csv_download` | data.sanjoseca.gov active-permits CSV | Working (active permits only; add expired/inspection CSV URLs to the YAML) |
| Boston, MA | `csv_download` | Analyze Boston approved permits CSV (~240 MB, cached daily) | Working |
| Cambridge, MA | `socrata` | Permit Finder `3wsm-e5jx`, following `specific_url` into each permit type's dataset | Working; electrical service amps/volts/meters come back as documented values |
| Palo Alto, CA | `browser` (Accela) | Accela Citizen Access | **Not working yet:** the search postback returned no results headless |
| Holliston, MA; SJPermits.org | `browser` | PeopleGIS MapsOnline; SJPermits | Not implemented; adapter reports it and the records request covers it |

### Differences from the original brief

- **Hayward User-Agent:** Hayward's firewall answered HTTP 403 to `eqore-permits/0.1 (site-record research)`. `EQORE-SiteRecords/0.1 (+repo URL)` is accepted, so the UA is descriptive and contains no personal email.
- **Boston:** `data.boston.gov/robots.txt` disallows `/api/`, which includes CKAN `datastore_search`. Boston therefore uses the dataset's CSV download (allowed) rather than the CKAN API. The `ckan` adapter remains for CKAN portals that permit API reads.
- **LA:** the electrical dataset has `submitted_date` and `status_date`, not `issue_date`.
- **Cambridge:** `specific_url` is an object (`{url: ...}`), and the description field differs by type dataset (`proposed_work_description`, `detailed_description_of_work`, …).
- **Hayward address search:** `Industrial Parkway West` returns nothing; only the stored `Pkwy W` form matches. The normalizer emits USPS abbreviations first.
- **Hayward APN search:** this also returns other units on the parcel (e.g. 2479 Unit K). They are kept only when the APN was supplied (`match_basis: apn`).
- **Hayward plan attachments:** module ids 2 and 1 both return an empty list successfully, so plan attachment availability is still unconfirmed. Module 3 requires login.
- **SF:** three permits for 888 Tennessee are filed under 890 Tennessee St on the same parcel. They are kept with `match_basis: apn`.

## How matching works

Portal keyword search is fuzzy. A record is kept only if the house number and street name match, or the APN matches.

- The direction must agree when both sides have one: `Pkwy W` ≠ `Pkwy E`.
- A number range like `1950-2190 Cesar Chavez` matches any number inside it.
- Units are stripped before comparing.

`match_basis` records which rule matched: `address`, `apn` or `both`.

## Extraction

`extract.py` is regex-only. It pulls PV module counts and wattage, kW DC/AC, kWh, ESS kW, battery model (Enphase, Tesla, LG, Generac, FranklinWH, SolarEdge, sonnen, QorePack), service amps and voltage, phases, generator kW, transformer kVA, switchgear wording and EV charger counts. It also tags `pv`, `ess`, `switchgear`, `service_upgrade`, `generator`, `ev_charger`, `transformer`, `ats` and `ups`.

- The raw description is always kept, and the record's confidence becomes `extracted`.
- Structured columns, like Cambridge's `amps_existing_service`, are marked `documented` and take precedence over text.
- The optional LLM second pass is **not implemented**. `extract()` is where it would plug in.

## Adding a jurisdiction

**Another Tyler EnerGov city:** copy the Hayward block in `jurisdictions.yaml`. Change `cities`, `base_url`, `record_url` and the `tenant` block (`tenantName` / `Tyler-TenantUrl` are visible in the portal's request headers). No code change is needed; `tests/test_units.py::test_new_energov_city_is_yaml_only` covers this.

**Another Socrata dataset:** add a `socrata` source with `domain`, `dataset`, the SoQL templates (`where_address`, optional `where_street` and `where_apn`) and a `fields` map. Placeholders: `{number} {name_upper} {suffix} {post_dir} {apn} {apn_digits} {block} {lot}`.

**A new portal type:**
1. Subclass `permits.adapters.base.Adapter`. Implement `search`, plus `get_detail`, `list_attachments`, `download` and `nearby` if the source supports them.
2. Make every request through `self.http` (one client: rate limit, retries, cache, robots.txt).
3. Register the class in `permits/adapters/__init__.py` and reference it from the YAML.

## Finding a portal's hidden API

Run discovery before writing a DOM scraper:

```bash
.venv/bin/python -m permits discover "https://haywardca-energovpub.tylerhost.net/apps/selfservice#/search" --search "2457 Industrial Pkwy W"
```

It opens the portal headless, types into the first visible search box, and writes every XHR/fetch call to `out/discover.json`, with method, URL, status, request headers (cookies stripped), POST body and a JSON sample. On Hayward it captures `energov/search/criteria` and `energov/search/search`, the endpoints the EnerGov adapter uses.

If the portal calls JSON endpoints, write a plain HTTP adapter against them. Scrape the page only if there's no API. Add `--headed` to watch the browser.

## Politeness and safety

- **Shared client:** every request goes through `permits/http.py`.
  - About 3 requests/second per host.
  - Retries with backoff on 429 and 5xx.
  - robots.txt is honoured.
  - An unreachable host fails immediately with its name, with no retry loop.
  - An on-disk cache is keyed by the full request.
- **Idempotent re-runs:** a file already on disk with a matching sha256 is not re-downloaded or rewritten.
- **Public data only:** only attachments the portal lists publicly are downloaded. Values are never invented: missing fields are null and explained in `missing.json`.

## Tests

```bash
.venv/bin/python -m pytest -q                    # offline, replays tests/fixtures/http
PERMITS_LIVE=1 .venv/bin/python -m pytest -q -k live
```

The recorded fixtures were captured from live calls on 2026-11-07, including the two Hayward PDFs. Boston uses the 81 real Withington St rows taken from the full export.
