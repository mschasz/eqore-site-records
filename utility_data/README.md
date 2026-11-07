# utility_data: site records from public hosting-capacity maps

```bash
./site_record "2448 Industrial Pkwy West, Hayward, CA 94545" --utility pge
./site_record "ADDRESS" --utility sce
./site_record "ADDRESS" --utility nationalgrid_ma --site-id tennessee-888
```

`--utility` comes from the customer's bill. The tool never guesses the utility. If you pass a utility with no adapter, it still geocodes the address and writes a "no adapter yet" record in which every field is a gap.

**Output:**
- `data/site_records/<utility>__<address>.json`: one record per run.
- `data/site_records/index.json`: a list of all records.
- `assets/utility_records.js`: the same records as `window.UTILITY_RECORDS`, for the static mockup. Only runs into the default folder update this file.

**Dependencies:** `requests` plus the standard library. There is no scraping and no browser automation. Requests are spaced at least 1 s apart and use the User-Agent `EQORE-SiteRecords/0.1 (+https://github.com/mschasz/eqore-site-records)`. Network errors and empty results are written into the record's `errors` and `gaps`. They never crash the run.

## Record format (`eqore.site_record/v1`)

Every value is an object of this form:

```json
{"value": 12, "unit": "kV", "source": {"name": "...", "url": "<exact query URL>"},
 "retrieved": "2026-11-07", "confidence": "high|medium|low", "data_date": "Jun 2026", "note": "..."}
```

**Top-level fields:**
- `site` (address, lat, lon)
- `utility`
- `feeder` (id, name, substation, division)
- `feeder_voltage_kv`
- `phases`
- `hosting_capacity` (generation, load, computed, limiting_criteria)
- `match`
- `extra` (utility-specific fields)
- `gaps`
- `site_gaps`
- `notes`
- `errors`
- `queries` (every URL called)
- `cautions`

**Gaps:** a field the source didn't provide is `null` and is listed in `gaps` with:
- `why`: one sentence on why EQORE needs it
- `how_to_collect`: how to collect it remotely
- `reason`: why it's missing for this site

**Site gaps:** `site_gaps` is the same fixed list of 8 items for every site. No public map provides them:
- Service voltage
- Main amps and breaker
- Bus rating
- Single-line diagram
- Transformer
- Fault current
- Spare breaker space
- Service point and meter location

Customer photo requests carry a safety note. Transformer details and fault current are requests to the utility.

### Confidence and matching

**Geocoding:** US Census geocoder. A geocoded location is `high` confidence. If the geocoder finds no match, the record says so and no utility query is made.

**Feeder matching:** feeders are matched by distance. A utility never confirms which feeder serves an address.

1. Query line sections within 150 m. If none are found, retry at 500 m. If still none, record a gap.
2. If all sections found are on one feeder, the confidence is `medium`.
3. If sections from more than one feeder are found, fetch their geometry and measure the distance to each. The nearest is reported with confidence `low`, and every candidate is listed in `match.candidates`.

A capacity value is never recorded without the utility's data date. If the date is missing, the value becomes a gap.

## Sources

### PG&E: Grid Resource Integration Portal (ICA)

**Service:** `https://services2.arcgis.com/mJaJSax0KPHoCNB6/ArcGIS/rest/services/DRPComplianceRelProd/FeatureServer`

**Layer 3 (LineDetail):**
- Feeder fields: FeederId, FeederName, voltage_kv, phase_cnt, Division.
- Capacity: `GenCapacity_kW` (generation) and `LoadCapacity_kW` (load), both in **kW**.
- Limiting criteria and date: `limiting_criteria`, `ICA_Analysis_Date`.
- A second query fetches GenCapacity_no_OpFlex_kW, GenericPVCapacity_kW, limiting_month_hour, ScreenL and Publish, which go into `extra`.

**Values are per line section, not per feeder.** Sections of one feeder carry different capacities, and some carry no ICA data at all. The record uses the nearest section that has an `ICA_Analysis_Date` and notes the distance to it. If nearby sections disagree, the note gives the range.

**Layer 4 ("ICA Not Available"):** the tool counts this feeder's sections within the match radius that are listed in layer 4.

**Substation:** PG&E has no separate substation field. The substation is derived from the feeder name ("MT EDEN 1107" → "MT EDEN") with `low` confidence.

**Login:** none needed (public).

**Terms:** none found on the service. The portal's own terms page applies; check it before redistributing.

**Verified result** for 2448 Industrial Pkwy West, Hayward, on 2026-11-07:

| Field | Value |
|---|---|
| Feeder | MT EDEN 1107 (013761107) |
| Voltage and phases | 12 kV, 3-phase |
| Division | Mission |
| Generation | 0 kW |
| Load | 0 kW |
| Limiting criteria | "Thermal,Voltage" |
| ICA date | "Jun 2026" |
| Match | 27 line sections within 150 m, all on one feeder (medium) |

The feeder also appears in the ICA Not Available layer.

### SCE: DRPEP Integration Capacity Analysis

**Service:** `https://services5.arcgis.com/z6hI6KRjKHvhNO0r/arcgis/rest/services/ICA_Layer/FeatureServer`

**Layers:** 2 (3-phase circuit segments) is queried first; 3 (non-3-phase segments) is the fallback. Layer 1 (ICA Unavailable) is always checked.

**Fields used:**
- `circuit_name`, used as both feeder name and ID because SCE publishes no separate circuit ID.
- `substation_name`, `circuit_voltage`, `phase`.
- Load is `ica_overall_load`. Generation is `uniform_generation`.
- Limiting criteria is `most_limiting_factor`.
- The data date is `changed_date`.

**Units are not stated** anywhere in the service or layer metadata. The magnitudes look like MW (for example 3.04 on a 12 kV circuit), but the record stores no unit and a note says so. Confirm with SCE before quoting a number.

**Dates:**
- `changed_date` is a text field. The newest value found across the layer was 12/08/2024.
- Some sections carry the placeholder `01/01/9999`.
- Dates older than 12 months, and the placeholder, are flagged in the record's notes.

**"Redacted" values** become gaps and are never recorded as zero.

**Login:** none needed (public).

**Terms:** the service description says:

> "While Southern California Edison makes every effort to ensure the accuracy of DRPEP, the data provided is for information purposes only. Southern California Edison makes no guarantee, expressly or implied, for the outcome of an interconnection request."

This quote is also copied into every SCE record's notes.

### National Grid (Massachusetts Electric): System Data Portal

**Service:** `https://systemdataportal.nationalgrid.com/arcgis/rest/services/MASDP/MA_HostingCapacity_with_DGPending/MapServer` (Web Mercator; queries are sent in WGS84 with `inSR=4326`).

**Layer 0 (Feeder Level Data, 3-phase):**
- `Master_CDF` is the feeder ID. It reads as a district prefix plus the circuit designation, for example `05_09_1021W1` on substation `ADAMS21`. It is unique per feeder.
- Also used: `Substation`, `Operating_Voltage_kV`.
- Generation is `HC_Available_MW`, in **MW**, dated by `Updated_Date`. The current value is 2026-02-06.
- Pending, connected and ASO fields go into `extra`.

**Layer 2 (1- and 2-phase):** used as a fallback. It has only Master_CDF and Phases, with no capacity.

**Not published, always gaps:**
- Load hosting capacity
- Limiting criteria
- Feeder name

**No feeder within 500 m:** the record says "No National Grid feeder found nearby; the address may be served by another utility."

**Login:** none needed (public).

**Terms:** none found on the service. The portal's terms of use apply; check them before redistributing.

### US Census Geocoder

**Endpoint:** `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress` (benchmark Public_AR_Current).

**Terms:** public US government service; none found beyond the general Census terms.

### Eversource (Massachusetts): no adapter

Eversource's MA hosting capacity and headroom map is a third-party web app (https://navigator.eversource.envelio.com/, linked from eversource.com). No public REST service was found (checked 2026-11-07), and reading the app would require scraping, which this tool doesn't do. Eversource records are written as "no adapter yet" with the map link, and every field is a gap to look up by hand.

## Reading the numbers

- **Screening only.** Hosting capacity values are screening estimates. They are not interconnection approvals or cost estimates, and they change with each utility release.
- **Zero capacity.** A value of **0** does not mean interconnection is impossible. The utility may require upgrades or conditions; confirm with a pre-application inquiry.
- **Batteries.** A battery is both load (charging) and generation (export). When a utility publishes only one of the two (for example National Grid MA, generation only), the other is listed as a gap.

## Redistribution

**Before EQORE redistributes or displays bulk utility data in a product, check each utility's terms.** This tool stores single-site query results with their source URLs for internal engineering review.

## Adding a utility

1. In `utility_data/adapters.py`, write `fill_<id>(http, rec, lon, lat) -> dict[str, str]`.
   - Use `arcgis.match_feeder(...)` for ArcGIS services so the matching rules stay the same.
   - Fill fields with `record.val(...)`, giving the exact query URL, a confidence, a unit, and the utility's data date.
   - Return `{field_path: reason}` for anything the utility doesn't publish. Use `{"*": reason}` if nothing could be filled.
2. Register it in `ADAPTERS`, and remove it from `KNOWN_WITHOUT_ADAPTER`.
3. Before relying on it:
   - Confirm the service needs no login. `Http` reports token and login errors as "LOGIN/TOKEN REQUIRED" and stops.
   - Verify the units.
   - Record the service's terms in this README.
