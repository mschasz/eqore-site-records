# EQORE Site Evaluation

A tool for EQORE engineers to judge whether a commercial or industrial site is ready for the next step toward a battery installation. Each site page combines what public records establish about the location with what the customer has provided. It shows what is known, what is risky, and what to ask for next.

## Run

Static files, no build step:

```bash
python3 -m http.server 5173
```

Then open http://localhost:5173.

## Leads

Five San Francisco candidates (PG&E territory), found by screening DataSF energy benchmarking for refrigerated-warehouse and manufacturing buildings and then reviewing each parcel's permit history:

| Site | APN | Type |
|---|---|---|
| 888 Tennessee St | 4060/001 | Refrigerated warehouse |
| 1600 Donner Ave (Envision Cold) | 4881/023 | Refrigerated warehouse |
| 2050 Galvez Ave (Growers' Refrigeration) | 5246/052 | Refrigerated warehouse |
| 1401 Yosemite Ave (Molinari Salame) | 4847/024 | Manufacturing |
| 1950–2190 Cesar Chavez St | 4324/002 | Multi-tenant industrial |

Rate schedule, ownership, service size and existing solar or storage are not in public records. They have to come from the customer.

## Projects view

- US map with state and county boundaries (US Census via us-atlas). EQORE's states (CA, MA, NH) are shaded and counties with leads are highlighted. Leads cluster by county until you zoom in.
- Sortable facilities table with a "needs action" column (next action, open counts and intake step) and an overview status per area.
- Each site moves through intake (lead form, sales call, site data collection started and completed), then a gate to Proposal and the delivery steps.

## Site record

- **Overview tiles:** electrical service, load & rate, equipment location, permits & AHJ, utility & interconnection. Each shows a status and a one-line reason. Click a tile for its primary records, findings and data points, and to set an engineer assessment.
- **Findings from records:** risks, supporting facts and notes. Click any finding or citation to open the underlying permit or benchmarking record, with a link to DataSF. Engineers mark findings as reviewed.
- **Open items:** text the facility for missing photos and data (SMS or email, with a preview of their upload page), or upload the file directly. Uploaded photos attach to the data point they answer.
- **Sections:** electrical service & tie-in (with the NEC 705.12 / 705.13 / 705.11 check from engineer inputs), interval data & tariff (benchmarking history plus Green Button CSV parsing), equipment location & fire code, permits & interconnection, and mobilization from step 04. Every value's source opens the primary record.
- **Permit records:** full history, filterable, with live refresh from DataSF.
- **Documents & approvals** register, site placard, AHJ/code links, files and contacts.

## Data

- `assets/sf_records.js`: DataSF snapshot (2026-11-07) of Building Permits (i98e-djp9), Electrical Permits (ftty-kx6y) and the Existing Commercial Buildings Energy Performance report (96ck-qcfe). Permits can be refreshed live from the Permit records tab.
- `assets/data.js`: sites, findings and the customer document checklist. Findings are written from those records.
- `assets/reference.js`: public reference data (PG&E Rule 21, tariffs, codes).
- Reviews, inputs, uploads and measurements are stored in the browser's localStorage. Use the account menu to clear them.

## Limits

- Peak demand is an estimate from annual kWh and typical load factors until interval data is uploaded.
- Uploaded PDFs and photos are stored and previewed, but not read automatically. Engineers enter ratings in the Electrical tab.
- The Green Button parser handles PG&E CSV exports (TYPE, DATE, START TIME, USAGE) and simple timestamp + kW/kWh files. It does not read ESPI XML.

## Permit retrieval module

`permits/` is a Python package that takes a site address and returns every permit the AHJ has on file. It downloads public attachments, extracts equipment facts and writes everything with provenance. It currently covers Hayward (EnerGov), San Francisco, Los Angeles, San José, Boston and Cambridge. See [permits/README.md](permits/README.md).

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python -m permits fetch "2457 Industrial Pkwy W, Hayward, CA 94545"
```

## Site records data (`site_records/`)

Address-level site records built from public, keyless sources (Census, MassGIS, LightBox statewide parcels, DataSF, City of Hayward GIS, CAL FIRE, CGS, USGS, CEC, PG&E GRIP). One JSON per facility plus `index.json` and a `records.js` bundle the site can load directly. Every value carries its source, vintage and confidence; parcels are never auto-selected. Add an address from the Actions tab (*Site records* → Run workflow) or edit `site_records/facilities.json`. See [site_records/README.md](site_records/README.md). Generator: `eqore_site/` (`python -m eqore_site.export`).

### How the site page uses the address records

- Every project has an **Address lookup** panel built from `site_records/` (generated from the address alone). It groups the record's fields by section, with status, source, vintage and confidence, and lists what is still to collect, by whom, and the parcel candidates. Click any row for the field, its source link and related flags.
- Facility-list projects (10 sites in `site_records/facilities.json`) are added as projects. Their customer values (service, rate, peak, system) fill the matching data points as *needs confirmation*. Their overview tiles, summary, AHJ, fire authority, codes and contacts come from the record.
- The record's flags become findings. Hazard flags, lot-line straddles and utility disagreements are marked as risks; the rest are notes.
- `./site_record` (utility hosting capacity) has also been run for these addresses. Eversource has no adapter yet, so those records list every field as a gap.


## Lead form (`lead/`)

A separate, lightweight page in the same design for first outreach: `http://127.0.0.1:5173/lead/` when served from the repo root.

- **Modeled on** EQORE's free savings assessment (monthly bill, state, work email, phone; "Request the full assessment") and Furo's planner (upload a load profile, enter the location, get sizing).
- **Inputs:** facility address, name, type, size, hours, owned or leased, existing DER; state, utility, rate schedule, monthly bill, peak; bills, 15-minute interval CSV (parsed in the browser) and photos; contact.
- **Live checks from the address:** US Census geocoder (JSONP), PG&E ICA or National Grid MA hosting capacity within 150 m, and whether a `site_records/` file exists.
- **Rough range:** peak (measured, entered, or estimated as 35% of the bill over the tariff's demand cost) × 15–25% shave × the tariff's annual $/kW from `assets/reference.js` × 75% realization; MA adds ConnectedSolutions. Screening only.
- **Handoff:** submissions are saved to `localStorage['eqore.leads']`. Site Records turns each one into a project at intake step 01 (step 03 when files came with it), fills rate, peak, interval data, feeder, contact and files, and picks up new submissions live if both pages are open. Demo only: nothing leaves the browser.
- `lead/sample/sample_interval_15min_DEMO.csv` is synthetic data for demos.
