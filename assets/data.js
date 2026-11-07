/* =============================================================================
   EQORE Site Evaluation — leads
   Five San Francisco C&I candidates identified from DataSF energy benchmarking
   and permit records (assets/sf_records.js). Facts below are drawn from those
   records; anything not in a public record is left unknown for the customer or
   a site visit to confirm. Findings cite the record they come from.
   ============================================================================= */
window.EQ = window.EQ || {};
EQ.REF = window.EQ_PUBLIC || {};
EQ.REC = window.SF_RECORDS || {};

/* Evaluation areas shown in the readiness snapshot. */
EQ.AREAS = [
  { key: 'electrical', name: 'Electrical service' },
  { key: 'load',       name: 'Load & rate' },
  { key: 'site',       name: 'Equipment location' },
  { key: 'permits',    name: 'Permits & AHJ' },
  { key: 'utility',    name: 'Utility & interconnection' },
];
EQ.STATUS = {
  good:    { label: 'Confirmed',  cls: 'ok' },
  partial: { label: 'Partial',    cls: 'gap' },
  unknown: { label: 'Unknown',    cls: 'muted' },
  risk:    { label: 'Risk',       cls: 'crit' },
};

/* What EQORE needs from the customer before a proposal (eqore.com/how-it-works, steps 01–02). */
EQ.CUSTOMER_DOCS = [
  { key: 'bills',    name: 'PG&E bills, last 12 months (all pages)', why: 'Rate schedule, account, billed max demand, CCA (CleanPowerSF) status', area: 'load', accept: '.pdf,image/*' },
  { key: 'interval', name: 'Green Button 15-min interval data, 12 months', why: 'Peak kW, timing and load factor; drives sizing', area: 'load', accept: '.csv,.xml', parses: true },
  { key: 'sld',      name: 'Single-line diagram (any revision)', why: 'Service size, main OCPD, bus rating, existing sources', area: 'electrical', accept: '.pdf,image/*' },
  { key: 'msb',      name: 'Photo: main switchboard nameplate', why: 'Voltage, ampacity, SCCR, manufacturer', area: 'electrical', accept: 'image/*' },
  { key: 'main',     name: 'Photo: main breaker and trip unit', why: 'Main OCPD rating, trip settings, GFPE', area: 'electrical', accept: 'image/*' },
  { key: 'meter',    name: 'Photo: utility meter(s) and transformer', why: 'Meter count, service type, transformer size', area: 'utility', accept: 'image/*' },
  { key: 'area',     name: 'Photos: candidate equipment location', why: 'Pad area, access, clearances to building and lot line', area: 'site', accept: 'image/*' },
  { key: 'form',     name: 'Facility questionnaire', why: 'Operating hours, planned load changes, backup needs, lease / ownership', area: 'load', accept: '.pdf,.docx,image/*' },
];

/* Typical C&I load factors used only to bound a peak estimate until interval data arrives. */
EQ.LOAD_FACTOR = { 'Refrigerated warehouse': [0.55, 0.75], 'Manufacturing': [0.35, 0.6], 'Warehouse': [0.3, 0.5], 'Multi-tenant industrial': [0.3, 0.5] };

EQ.SITES = [
  {
    id: 'tennessee-888', apn: '4060/001', name: '888 Tennessee St', tenant: 'Tenant not named in records (warehouse with robotics, 2025 TI)',
    address: '888 Tennessee St', city: 'San Francisco', zip: '94107', neighborhood: 'Potrero Hill / Dogpatch',
    type: 'Refrigerated warehouse', occupancy: 'S-1, B', construction: 'Type II', stories: 2,
    summary: 'Modern switchgear permitted in 2019, but the refrigeration load appears to be leaving the building and a residential project was once filed on the parcel.',
    areas: {
      electrical: ['partial', 'New MSB with integrated ATS permitted 2019; ratings not in records'],
      load: ['risk', 'Grid use down 58% from 2023 to 2025; freezer removed 2025'],
      site: ['unknown', '2-story Type II building; yard and pad area not yet reviewed'],
      permits: ['good', 'Active permitting through 2026; plan sets on file'],
      utility: ['unknown', 'PG&E; no solar or storage permits on record'],
    },
    findings: [
      { sev: 'risk', area: 'load', text: 'Grid electricity fell from 1.13 GWh (2023) to 0.48 GWh (2025), a 58% drop.', src: 'Benchmarking 2023–2025' },
      { sev: 'risk', area: 'load', text: 'Walk-in freezer removed in 2025; the refrigeration load that drove past usage may be gone.', src: 'BP filed 2025-10-08' },
      { sev: 'risk', area: 'permits', text: 'A 4-story, 109-unit mixed-use building was filed for this parcel in 2018 and never issued. Confirm there are no redevelopment plans.', src: 'BP filed 2018-08-20' },
      { sev: 'risk', area: 'electrical', text: 'Records conflict: a backup generator and 382 sf pad were filed in 2019 but never issued, while the MSB with an ATS was issued.', src: 'BP filed 2019-06-04 / 2019-04-10' },
      { sev: 'good', area: 'electrical', text: 'New main switchboard with integrated ATS and power for new refrigeration permitted 2019. No completion date is recorded.', src: 'BP filed 2019-04-10' },
      { sev: 'info', area: 'electrical', text: 'The 2019 electrical permit for cooler and freezer power and the transformation room expired.', src: 'EP filed 2019-08-29' },
      { sev: 'info', area: 'load', text: 'New load added since 2025: $1M robotics TI, IT/UPS cage, and a gantry crane (2026).', src: 'BP 2025-04-21, EP 2024-10-10, BP 2026-05-20' },
      { sev: 'info', area: 'site', text: 'Fully sprinklered with a dedicated-function fire alarm, updated 2019–2025.', src: 'BP 2019-11-25, 2025-07-09' },
    ],
  },
  {
    id: 'donner-1600', apn: '4881/023', name: '1600 Donner Ave', tenant: 'Envision Cold (signage permits, 2025)',
    address: '1600 Donner Ave', city: 'San Francisco', zip: '94124', neighborhood: 'Bayview',
    type: 'Refrigerated warehouse', occupancy: 'S-2', construction: '—', stories: 1,
    summary: 'Largest and most refrigeration-driven load of the five, but the only service on record is far too small for it and current usage is unreported.',
    areas: {
      electrical: ['risk', 'Only service on record: 200 A, 240 V riser — inconsistent with load'],
      load: ['partial', '1.56–1.82 GWh/yr (2021–2023); 2024–2025 not reported'],
      site: ['unknown', '135,328 sf single-story building; large lot to review'],
      permits: ['partial', '19 records; no plan-set history for the main service'],
      utility: ['unknown', 'PG&E; no solar or storage permits on record'],
    },
    findings: [
      { sev: 'good', area: 'load', text: 'Largest load of the five: 1.82, 1.70 and 1.56 GWh in 2021–2023, from a cold-storage operation.', src: 'Benchmarking 2021–2023' },
      { sev: 'risk', area: 'load', text: 'Benchmarking was not reported for 2024 or 2025, so current usage is unverified. The tenant changed to Envision Cold (2025 signs).', src: 'Benchmarking 2024–2025; BP 2025-02-28' },
      { sev: 'risk', area: 'electrical', text: 'The only service in records is a 200 A, 240 V, 3Ø 4W riser (replaced 2020). That cannot carry ~1.6 GWh/yr, so a second or primary service likely exists with no permit trail.', src: 'EP filed 2020-12-07' },
      { sev: 'info', area: 'load', text: 'Evaporative condenser replaced in 2021 (BAC VCA-420A), consistent with an industrial refrigeration plant.', src: 'BP filed 2021-07-09' },
      { sev: 'info', area: 'site', text: 'Dry-pipe sprinkler monitoring installed in 2008. A full-building sprinkler permit in 2017 was cancelled.', src: 'BP 2008-05-12, 2017-10-06' },
      { sev: 'info', area: 'site', text: 'Cool roof installed in 2021. A truck scale permit dates from 1988, so the yard carries heavy truck traffic and needs vehicle protection.', src: 'BP 2021-09-01, 1988-07-07' },
    ],
  },
  {
    id: 'galvez-2050', apn: '5246/052', name: "Growers' Refrigeration", tenant: "Growers' Refrigeration",
    address: '2050 Galvez Ave', city: 'San Francisco', zip: '94124', neighborhood: 'Bayview / Islais Creek',
    type: 'Refrigerated warehouse', occupancy: '—', construction: '—', stories: 1,
    summary: 'Steady, reliably reported refrigeration load, but almost no electrical records. Drawings will have to come from the customer.',
    areas: {
      electrical: ['unknown', 'Only record: 600 A 3Ø panel + 4 subpanels (2005)'],
      load: ['partial', '0.70–0.74 GWh every year 2018–2025'],
      site: ['unknown', '29,438 sf; yard not yet reviewed'],
      permits: ['partial', '5 records; none since 2005'],
      utility: ['unknown', 'PG&E; no solar or storage permits on record'],
    },
    findings: [
      { sev: 'good', area: 'load', text: 'Most consistent load of the five: 0.70–0.74 GWh in every year from 2018 to 2025, all reported.', src: 'Benchmarking 2018–2025' },
      { sev: 'info', area: 'load', text: 'A flat cold-storage load suggests a high load factor, so peak-shave value depends on how compressors cycle. Interval data decides this.', src: 'Benchmarking pattern' },
      { sev: 'risk', area: 'permits', text: 'No building permits since 1986 and no electrical permits since 2005. The city likely has no current drawings.', src: 'Permit history' },
      { sev: 'info', area: 'electrical', text: '600 A 3-phase panel and four subpanels installed in 2005 to power equipment. Service size is not recorded.', src: 'EP filed 2005-06-05' },
    ],
  },
  {
    id: 'yosemite-1401', apn: '4847/024', name: 'Molinari Salame', tenant: 'Molinari Salame (benchmarking record name)',
    address: '1401 Yosemite Ave', city: 'San Francisco', zip: '94124', neighborhood: 'Bayview',
    type: 'Manufacturing', occupancy: '—', construction: '—', stories: 2,
    summary: 'Over 1 GWh/yr of food-manufacturing load with consistent reporting. Electrical records stop in 2006.',
    areas: {
      electrical: ['unknown', 'Panels 600 A + 3×400 A (2004–05); service not recorded'],
      load: ['partial', '1.02–1.24 GWh/yr, 2020–2025'],
      site: ['unknown', '23,940 sf on a dense block; pad space uncertain'],
      permits: ['partial', '10 records; nothing since 2006'],
      utility: ['unknown', 'PG&E; no solar or storage permits on record'],
    },
    findings: [
      { sev: 'good', area: 'load', text: 'Reported 1.02–1.24 GWh per year from 2020 to 2025, from food manufacturing; cured-meat production typically runs refrigeration and drying rooms around the clock.', src: 'Benchmarking 2020–2025' },
      { sev: 'info', area: 'load', text: 'Grid use dropped 16% from 2023 to 2024 and held in 2025. Ask about process changes.', src: 'Benchmarking 2023–2025' },
      { sev: 'info', area: 'electrical', text: 'New panels in 2004–05: one 600 A and three 400 A for relocated kitchen equipment, plus a rooftop 25 kVA transformer feeding boilers.', src: 'EP 2004-02-24, 2005-11-09' },
      { sev: 'risk', area: 'electrical', text: 'No electrical permits since 2006 on a 1962 building, so switchgear age and condition are unknown.', src: 'Permit history' },
      { sev: 'risk', area: 'site', text: 'Small 23,940 sf footprint with a 1984 two-story addition. Outdoor pad space and the 10 ft separation may be tight; check the aerial.', src: 'BP 1984-11-15' },
    ],
  },
  {
    id: 'cesar-chavez-2150', apn: '4324/002', name: '1950–2190 Cesar Chavez St', tenant: 'Multi-tenant (incl. McMillan Electric offices)',
    address: '2150 Cesar Chavez St', city: 'San Francisco', zip: '94124', neighborhood: 'Bayview / Potrero',
    type: 'Multi-tenant industrial', occupancy: 'S-2, M, B, F-1', construction: 'URM, retrofit 2001', stories: 2,
    summary: 'Large building, but the load is small and split across tenants and meters, and the unreinforced masonry structure limits mounting. Weakest fit.',
    areas: {
      electrical: ['partial', '480 V 200 A meter-main (2017, expired); 400 A + 200 A tenant feeders (2022)'],
      load: ['risk', '0.51 GWh in 2025 across all tenants; down 28% since 2022'],
      site: ['risk', 'Unreinforced masonry (retrofit 2001): ground-mount only'],
      permits: ['good', '60 records; active fire and life-safety work 2024–2025'],
      utility: ['risk', 'Multiple tenants, likely multiple meters'],
    },
    findings: [
      { sev: 'risk', area: 'load', text: 'The whole building used only 0.51 GWh in 2025, split across office, warehouse, retail and F-1 tenants, so each meter is small.', src: 'Benchmarking 2025; occupancy S-2, M, B, F-1' },
      { sev: 'risk', area: 'utility', text: 'Multiple tenants and services, including a separate 480 V 200 A meter-main (2017, expired). A battery would serve one meter, not the building.', src: 'EP filed 2017-05-31' },
      { sev: 'risk', area: 'site', text: 'Unreinforced masonry building, seismically retrofitted in 2001. Avoid wall-mounted equipment and expect structural review.', src: 'BP filed 2001-11-15' },
      { sev: 'info', area: 'load', text: 'Electricity fell 28% between 2022 and 2025, while gas use stays well above electricity.', src: 'Benchmarking 2022–2025' },
      { sev: 'info', area: 'electrical', text: 'New 400 A and 200 A feeders and panels in 2022 (engineered drawings); car-lift subpanel in 2024.', src: 'EP 2022-01-24, 2024-03-25' },
    ],
  },
];

/* San Francisco jurisdiction facts used by every site (location-derived). */
EQ.SF = {
  utility: 'PG&E (distribution)',
  supply: 'PG&E bundled or CleanPowerSF (CCA) — confirm on bill',
  ahj: [
    { name: 'SF Department of Building Inspection', role: 'Building & electrical permits, inspections', url: 'https://sf.gov/departments/department-building-inspection' },
    { name: 'SF Fire Department, Bureau of Fire Prevention', role: 'Fire permit and ESS review (CFC §1207)', url: 'https://sf-fire.org/' },
    { name: 'SF Planning', role: 'Zoning and parcel information (PIM)', url: 'https://sfplanninggis.org/PIM/' },
  ],
  codes: '2025 San Francisco Building, Electrical and Fire Codes (2025 CBC / CEC / CFC with SF amendments, eff. Jan 1, 2026)',
  interconnection: 'PG&E Electric Rule 21: non-export storage via Screen I (certified PCS or relay)',
};

EQ.initials = (n) => n.replace(/,.*$/, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
