# EQORE Site Records

Internal site-record app for EQORE's behind-the-meter C&I battery projects in California and Massachusetts. One record per facility, organized around EQORE's six delivery steps (savings assessment → operate & optimize), with every value traced to its source.

## Run

Static files, no build step. Serve the folder and open it:

```bash
python3 -m http.server 5173
```

Then open http://localhost:5173.

## What's in a site record

- **Design readiness** (0–100) across four sections: electrical service & tie-in, interval data & tariff, equipment location & fire code, permits & interconnection. Each data point shows its source, method, confidence and who confirmed it.
- **Tie-in check**: NEC 705.12 120% rule against existing PV and BESS inverter current, fault duty vs. SCCR, GFPE, and the tie-in method (705.11 / 705.12 / 705.13).
- **Load & sizing**: modeled 15-min shape anchored to the metered peak, priced through the tariff's TOU demand windows, plus value streams (ConnectedSolutions, Clean Peak, SGIP, TOU shifting, capacity tag) and a payback calculator.
- **Mobilization & commissioning** items from step 04.
- **Documents & approvals** register (permit plan set, approvals, NFPA 855 records). Completing a document requires an evidence file and a sign-off; prerequisites are enforced.
- **Stage gates** for each step transition.
- **Facility requests** by SMS/email upload link.
- **Public responder page** (`#/responder/<id>`) behind the site QR placard, published from step 05.

## Data

- `assets/reference.js`: public reference data gathered 2026-11-07, including PG&E B-19/B-20, Eversource G-2/G-3 and National Grid G-3 demand rates and windows; PG&E Rule 21, National Grid SIDG No. 1632 and Eversource SIDG No. 55F; ConnectedSolutions (June 2023 offering), Clean Peak (225 CMR 21.05) and SGIP status; NFPA/ICC/MA/CA code references; NREL ComStock warehouse load shapes; and AHJ permit portals.
- `assets/data.js`: seed facilities. ThermoFusion's system (200 kW / 400 kWh QorePack) and July 2026 performance are from eqore.com; all other facilities, people and numbers are fictional demo data.
- Edits are saved in the browser's localStorage. Use **Reset demo data** in the account menu to return to the seed.

## Known limits

- Load shapes are modeled and calibrated to the recorded peak; uploaded interval files are not parsed yet.
- The ConnectedSolutions rate comes from the June 2023 C&I offering. Confirm 2025–2027 rates before quoting.
- NFPA 855 section numbers follow EQORE's document checklist. Cite the edition each AHJ has adopted.
- The responder page uses EQORE's main line. Replace it with the 24/7 operations number before posting placards.
