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

## Site page

- **Readiness snapshot:** five areas (electrical service, load & rate, equipment location, permits & AHJ, utility & interconnection). Each is marked Confirmed / Partial / Unknown / Risk with a one-line reason. Customer evidence or an engineer's assessment upgrades a status, and the tile shows where its status came from.
- **Findings from records:** risks, supporting facts and notes, each citing its permit or benchmarking record. Engineers mark findings as reviewed.
- **Needed from the customer:** bills, Green Button interval data, SLD, switchgear and meter photos, equipment-area photos and a facility questionnaire. Upload in place, or draft the request text.
- **Tabs:**
  - Electrical: permits filtered and tagged by rating and equipment, plus an NEC 705.12 / 705.13 / 705.11 tie-in check and fault duty vs. SCCR from engineer inputs.
  - Load & rate: benchmarking history, a peak estimate, and Green Button CSV parsing in the browser (peak, timing, load factor, monthly peaks).
  - Equipment location: aerial imagery with a distance-measuring tool and siting criteria.
  - Permit records: full history, filterable, with live refresh from DataSF.
  - Customer documents and SF requirements.

## Data

- `assets/sf_records.js`: DataSF snapshot (2026-11-07) of Building Permits (i98e-djp9), Electrical Permits (ftty-kx6y) and the Existing Commercial Buildings Energy Performance report (96ck-qcfe). Permits can be refreshed live from the Permit records tab.
- `assets/data.js`: sites, findings and the customer document checklist. Findings are written from those records.
- `assets/reference.js`: public reference data (PG&E Rule 21, tariffs, codes).
- Reviews, inputs, uploads and measurements are stored in the browser's localStorage. Use the account menu to clear them.

## Limits

- Peak demand is an estimate from annual kWh and typical load factors until interval data is uploaded.
- Uploaded PDFs and photos are stored and previewed, but not read automatically. Engineers enter ratings in the Electrical tab.
- The Green Button parser handles PG&E CSV exports (TYPE, DATE, START TIME, USAGE) and simple timestamp + kW/kWh files. It does not read ESPI XML.
