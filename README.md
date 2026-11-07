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
- Step rail for EQORE's six steps, a "needs action" queue, and a sortable facilities table with an overview status per area.

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
