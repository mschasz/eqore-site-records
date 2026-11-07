/* =============================================================================
   EQORE Site Records — seed data
   Leads: five San Francisco C&I facilities identified from DataSF energy
   benchmarking and permit records (assets/sf_records.js). Values come from
   those records; anything not in a public record is left open for the customer
   or a site visit. Every value and finding cites the record it came from.
   ============================================================================= */
window.EQ = window.EQ || {};
EQ.REF = window.EQ_PUBLIC || {};
EQ.REC = window.SF_RECORDS || {};
EQ.ASOF = window.SF_RECORDS_ASOF || '';

/* Intake: the four steps a lead goes through before delivery. Steps 03 and 04 follow customer data. */
EQ.INTAKE = [
  { n: '01', label: 'Lead form completed' },
  { n: '02', label: 'Sales call and optimization' },
  { n: '03', label: 'Site data collection started', auto: true },
  { n: '04', label: 'Site data collection completed', auto: true },
];
/* Delivery steps after intake (eqore.com/how-it-works). Each move is gated in gateChecks (app.js). */
EQ.STAGE_ORDER = ['intake', 'proposal', 'design', 'interconnection', 'install', 'operate'];
EQ.STAGES = {
  intake:          { label: 'Site intake' },
  proposal:        { label: 'Proposal' },
  design:          { label: 'Design & permitting' },
  interconnection: { label: 'Utility interconnection' },
  install:         { label: 'Installation & commissioning' },
  operate:         { label: 'Operate & optimize' },
};
EQ.stageIdx = (k) => EQ.STAGE_ORDER.indexOf(k);

/* Design-readiness sections (weights sum to 100). */
EQ.SECTIONS = [
  { key: 'elec', name: 'Electrical service & tie-in',    max: 35 },
  { key: 'load', name: 'Interval data & tariff',         max: 25 },
  { key: 'site', name: 'Equipment location & fire code', max: 20 },
  { key: 'perm', name: 'Permits & interconnection',      max: 20 },
];
EQ.FIELD = { key: 'field', name: 'Mobilization & commissioning', from: 'interconnection' };

/* Overview tiles at the top of each site. */
EQ.AREAS = [
  { key: 'electrical', name: 'Electrical service', sec: 'elec' },
  { key: 'load',       name: 'Load & rate', sec: 'load' },
  { key: 'site',       name: 'Equipment location', sec: 'site' },
  { key: 'permits',    name: 'Permits & AHJ', sec: 'perm' },
  { key: 'utility',    name: 'Utility & interconnection', sec: 'perm' },
];
EQ.STATUS = {
  good:    { label: 'Confirmed', cls: 'ok' },
  partial: { label: 'Partial',   cls: 'gap' },
  unknown: { label: 'Unknown',   cls: 'muted' },
  risk:    { label: 'Risk',      cls: 'crit' },
};

/* EQORE operating states (eqore.com: "MA · NH · CA") and their FIPS codes. */
EQ.STATES = { ca: { name: 'California', fips: '06' }, ma: { name: 'Massachusetts', fips: '25' }, nh: { name: 'New Hampshire', fips: '33' } };
EQ.REGIONS = { ca: { label: 'California', short: 'California' }, ma: { label: 'Massachusetts', short: 'Massachusetts' }, nh: { label: 'New Hampshire', short: 'New Hampshire' } };

EQ.TEAM = {
  jkim:     { id: 'jkim',     name: 'Jordan Kim',        title: 'Account Executive, West', email: 'jordan.kim@eqore.example',    color: '#446c87' },
  evasquez: { id: 'evasquez', name: 'Elena Vásquez, PE', title: 'Project Engineer, West',  email: 'elena.vasquez@eqore.example', color: '#06162b' },
};
EQ.CURRENT_USER = 'evasquez';
EQ.LOAD_FACTOR = { 'Refrigerated warehouse': [0.55, 0.75], 'Manufacturing': [0.35, 0.6], 'Multi-tenant industrial': [0.3, 0.5] };

/* ---------------------------------------------------------------------------
   Leads
   areas:    overview tile status + one-line reason (records only)
   findings: cited observations from the records
   known:    data-point values established by a record (src = record citation)
   --------------------------------------------------------------------------- */
EQ.SEED_SITES = [
  {
    id: 'tennessee-888', apn: '4060/001', name: '888 Tennessee St', code: 'TN', sector: 'Refrigerated warehouse',
    tenant: 'Tenant not named in records (warehouse with robotics, 2025 TI)', address: '888 Tennessee St', zip: '94107', neighborhood: 'Potrero Hill / Dogpatch',
    occupancy: 'S-1, B', stories: 2,
    summary: 'Modern switchgear permitted in 2019, but the refrigeration load appears to be leaving the building and a residential project was once filed on the parcel.',
    areas: {
      electrical: ['partial', 'New MSB with integrated ATS permitted 2019; ratings not in records', 'BP 2019-04-10'],
      load: ['risk', 'Grid use down 58% from 2023 to 2025; freezer removed 2025', 'Benchmarking 2023–2025 · BP 2025-10-08'],
      site: ['unknown', '2-story Type II building covering most of the parcel; pad area not reviewed', 'Aerial'],
      permits: ['good', 'Active permitting through 2026; plan sets on file', 'Permit history'],
      utility: ['unknown', 'PG&E; no solar or storage permits on record', 'Permit history'],
    },
    findings: [
      { sev: 'risk', area: 'load', text: 'Grid electricity fell from 1.13 GWh (2023) to 0.48 GWh (2025), a 58% drop.', src: 'Benchmarking 2023–2025' },
      { sev: 'risk', area: 'load', text: 'Walk-in freezer removed in 2025; the refrigeration load that drove past usage may be gone.', src: 'BP 2025-10-08' },
      { sev: 'risk', area: 'permits', text: 'A 4-story, 109-unit mixed-use building was filed for this parcel in 2018 and never issued. Confirm there are no redevelopment plans.', src: 'BP 2018-08-20' },
      { sev: 'risk', area: 'electrical', text: 'Records conflict: a backup generator and 382 sf pad were filed in 2019 but never issued, while the MSB with an ATS was issued.', src: 'BP 2019-06-04 · BP 2019-04-10' },
      { sev: 'good', area: 'electrical', text: 'New main switchboard with integrated ATS and power for new refrigeration permitted 2019. No completion date is recorded.', src: 'BP 2019-04-10' },
      { sev: 'info', area: 'electrical', text: 'The 2019 electrical permit for cooler and freezer power and the transformation room expired.', src: 'EP 2019-08-29' },
      { sev: 'info', area: 'load', text: 'New load added since 2025: $1M robotics TI, IT/UPS cage, and a gantry crane (2026).', src: 'BP 2025-04-21 · EP 2024-10-10 · BP 2026-05-20' },
      { sev: 'info', area: 'site', text: 'Fully sprinklered with a dedicated-function fire alarm, updated 2019–2025.', src: 'BP 2019-11-25 · BP 2025-07-09' },
    ],
    known: {
      mainBreaker: ['New main switchboard with integrated ATS (2019); ampacity and make not in records', 'BP 2019-04-10', 'partial'],
      onsiteGen: ['No PV or storage on record; generator + pad filed 2019, never issued', 'BP 2019-06-04'],
      fire: ['Fully sprinklered; dedicated-function fire alarm updated 2019–2025', 'BP 2019-11-25 · BP 2025-07-09'],
      permits: ['50 records, 1987–2026; plan sets on most; active TI and fire work 2024–2026', 'Permit history'],
    },
  },
  {
    id: 'donner-1600', apn: '4881/023', name: '1600 Donner Ave', code: 'DN', sector: 'Refrigerated warehouse',
    tenant: 'Envision Cold (signage permits, 2025)', address: '1600 Donner Ave', zip: '94124', neighborhood: 'Bayview',
    occupancy: 'S-2', stories: 1,
    summary: 'Largest and most refrigeration-driven load of the five, but the only service on record is far too small for it and current usage is unreported.',
    areas: {
      electrical: ['risk', 'Only service on record: 200 A, 240 V riser — inconsistent with load', 'EP 2020-12-07'],
      load: ['partial', '1.56–1.82 GWh/yr (2021–2023); 2024–2025 not reported', 'Benchmarking 2021–2025'],
      site: ['unknown', '135,328 sf single-story building; yard to review', 'Aerial'],
      permits: ['partial', '19 records; no plan-set history for the main service', 'Permit history'],
      utility: ['unknown', 'PG&E; no solar or storage permits on record', 'Permit history'],
    },
    findings: [
      { sev: 'good', area: 'load', text: 'Largest load of the five: 1.82, 1.70 and 1.56 GWh in 2021–2023, from a cold-storage operation.', src: 'Benchmarking 2021–2023' },
      { sev: 'risk', area: 'load', text: 'Benchmarking was not reported for 2024 or 2025, so current usage is unverified. The tenant changed to Envision Cold (2025 signs).', src: 'Benchmarking 2024–2025 · BP 2025-02-28' },
      { sev: 'risk', area: 'electrical', text: 'The only service in records is a 200 A, 240 V, 3Ø 4W riser (replaced 2020). That cannot carry ~1.6 GWh/yr, so a second or primary service likely exists with no permit trail.', src: 'EP 2020-12-07' },
      { sev: 'info', area: 'load', text: 'Evaporative condenser replaced in 2021 (BAC VCA-420A), consistent with an industrial refrigeration plant.', src: 'BP 2021-07-09' },
      { sev: 'info', area: 'site', text: 'Dry-pipe sprinkler monitoring installed in 2008. A full-building sprinkler permit in 2017 was cancelled.', src: 'BP 2008-05-12 · BP 2017-10-06' },
      { sev: 'info', area: 'site', text: 'Truck scale permitted in 1988: the yard carries heavy truck traffic, so equipment needs vehicle protection.', src: 'BP 1988-07-07' },
    ],
    known: {
      voltage: ['Only service on record: 240 V 3Ø 4W, 200 A riser (2020) — inconsistent with load', 'EP 2020-12-07', 'partial'],
      onsiteGen: ['No PV, storage or generator permits on record', 'Permit history'],
      fire: ['Dry-pipe sprinkler monitoring (2008); full sprinkler permit cancelled 2017', 'BP 2008-05-12 · BP 2017-10-06', 'partial'],
      vehicle: ['Truck scale on site (1988): heavy truck traffic, protection required', 'BP 1988-07-07'],
      permits: ['19 records; tenant signage 2025 (Envision Cold); condenser 2021', 'Permit history'],
    },
  },
  {
    id: 'galvez-2050', apn: '5246/052', name: "Growers' Refrigeration", code: 'GR', sector: 'Refrigerated warehouse',
    tenant: "Growers' Refrigeration", address: '2050 Galvez Ave', zip: '94124', neighborhood: 'Bayview / Islais Creek',
    occupancy: '—', stories: 1,
    summary: 'Steady, reliably reported refrigeration load, but almost no electrical records. Drawings will have to come from the customer.',
    areas: {
      electrical: ['unknown', 'Only record: 600 A 3Ø panel + 4 subpanels (2005)', 'EP 2005-06-05'],
      load: ['partial', '0.70–0.74 GWh every year 2018–2025', 'Benchmarking 2018–2025'],
      site: ['unknown', '29,438 sf; yard not reviewed', 'Aerial'],
      permits: ['partial', '5 records; none since 2005', 'Permit history'],
      utility: ['unknown', 'PG&E; no solar or storage permits on record', 'Permit history'],
    },
    findings: [
      { sev: 'good', area: 'load', text: 'Most consistent load of the five: 0.70–0.74 GWh in every year from 2018 to 2025, all reported.', src: 'Benchmarking 2018–2025' },
      { sev: 'info', area: 'load', text: 'A flat cold-storage load suggests a high load factor, so peak-shave value depends on how compressors cycle. Interval data decides this.', src: 'Benchmarking 2018–2025' },
      { sev: 'risk', area: 'permits', text: 'No building permits since 1986 and no electrical permits since 2005. The city likely has no current drawings.', src: 'Permit history' },
      { sev: 'info', area: 'electrical', text: '600 A 3-phase panel and four subpanels installed in 2005 to power equipment. Service size is not recorded.', src: 'EP 2005-06-05' },
    ],
    known: {
      mainBreaker: ['600 A 3Ø panel + 4 subpanels (2005); main service not recorded', 'EP 2005-06-05', 'partial'],
      onsiteGen: ['No PV, storage or generator permits on record', 'Permit history'],
      permits: ['5 records; none since 2005', 'Permit history'],
    },
  },
  {
    id: 'yosemite-1401', apn: '4847/024', name: 'Molinari Salame', code: 'MS', sector: 'Manufacturing',
    tenant: 'Molinari Salame (benchmarking record name)', address: '1401 Yosemite Ave', zip: '94124', neighborhood: 'Bayview',
    occupancy: '—', stories: 2,
    summary: 'Over 1 GWh/yr of food-manufacturing load with consistent reporting. Electrical records stop in 2006.',
    areas: {
      electrical: ['unknown', 'Panels 600 A + 3×400 A (2004–05); service not recorded', 'EP 2004-02-24 · EP 2005-11-09'],
      load: ['partial', '1.02–1.24 GWh/yr, 2020–2025', 'Benchmarking 2020–2025'],
      site: ['risk', '23,940 sf on a dense block; pad space uncertain', 'Aerial · BP 1984-11-15'],
      permits: ['partial', '10 records; nothing since 2006', 'Permit history'],
      utility: ['unknown', 'PG&E; no solar or storage permits on record', 'Permit history'],
    },
    findings: [
      { sev: 'good', area: 'load', text: 'Reported 1.02–1.24 GWh per year from 2020 to 2025, from food manufacturing; cured-meat production typically runs refrigeration and drying rooms around the clock.', src: 'Benchmarking 2020–2025' },
      { sev: 'info', area: 'load', text: 'Grid use dropped 16% from 2023 to 2024 and held in 2025. Ask about process changes.', src: 'Benchmarking 2023–2025' },
      { sev: 'info', area: 'electrical', text: 'New panels in 2004–05: one 600 A and three 400 A for relocated kitchen equipment, plus a rooftop 25 kVA transformer feeding boilers.', src: 'EP 2004-02-24 · EP 2005-11-09' },
      { sev: 'risk', area: 'electrical', text: 'No electrical permits since 2006 on a 1962 building, so switchgear age and condition are unknown.', src: 'Permit history' },
      { sev: 'risk', area: 'site', text: 'Small 23,940 sf footprint with a 1984 two-story addition. Outdoor pad space and the 10 ft separation may be tight; check the aerial.', src: 'BP 1984-11-15' },
    ],
    known: {
      mainBreaker: ['Panels 600 A + 3×400 A (2004–05); main service not recorded', 'EP 2004-02-24', 'partial'],
      transformer: ['Rooftop 25 kVA for boiler feeds (2005); utility transformer not recorded', 'EP 2005-11-09', 'partial'],
      onsiteGen: ['No PV, storage or generator permits on record', 'Permit history'],
      permits: ['10 records; nothing since 2006', 'Permit history'],
    },
  },
  {
    id: 'cesar-chavez-2150', apn: '4324/002', name: '1950–2190 Cesar Chavez St', code: 'CC', sector: 'Multi-tenant industrial',
    tenant: 'Multi-tenant (incl. McMillan Electric offices)', address: '2150 Cesar Chavez St', zip: '94124', neighborhood: 'Bayview / Potrero',
    occupancy: 'S-2, M, B, F-1', stories: 2,
    summary: 'Large building, but the load is small and split across tenants and meters, and the unreinforced masonry structure limits mounting. Weakest fit.',
    areas: {
      electrical: ['partial', '480 V 200 A meter-main (2017, expired); 400 A + 200 A tenant feeders (2022)', 'EP 2017-05-31 · EP 2022-01-24'],
      load: ['risk', '0.51 GWh in 2025 across all tenants; down 28% since 2022', 'Benchmarking 2022–2025'],
      site: ['risk', 'Unreinforced masonry (retrofit 2001): ground-mount only', 'BP 2001-11-15'],
      permits: ['good', '60 records; active fire and life-safety work 2024–2025', 'Permit history'],
      utility: ['risk', 'Multiple tenants, likely multiple meters', 'EP 2017-05-31'],
    },
    findings: [
      { sev: 'risk', area: 'load', text: 'The whole building used only 0.51 GWh in 2025, split across office, warehouse, retail and F-1 tenants, so each meter is small.', src: 'Benchmarking 2025' },
      { sev: 'risk', area: 'utility', text: 'Multiple tenants and services, including a separate 480 V 200 A meter-main (2017, expired). A battery would serve one meter, not the building.', src: 'EP 2017-05-31' },
      { sev: 'risk', area: 'site', text: 'Unreinforced masonry building, seismically retrofitted in 2001. Avoid wall-mounted equipment and expect structural review.', src: 'BP 2001-11-15' },
      { sev: 'info', area: 'load', text: 'Electricity fell 28% between 2022 and 2025.', src: 'Benchmarking 2022–2025' },
      { sev: 'info', area: 'electrical', text: 'New 400 A and 200 A feeders and panels in 2022 (engineered drawings); car-lift subpanel in 2024.', src: 'EP 2022-01-24 · EP 2024-03-25' },
    ],
    known: {
      voltage: ['480 V 3Ø on one tenant service (200 A meter-main, 2017); other services not recorded', 'EP 2017-05-31', 'partial'],
      mainBreaker: ['Tenant feeders 400 A + 200 A (2022); building main not recorded', 'EP 2022-01-24', 'partial'],
      metering: ['Multiple tenant meters; separate 480 V meter-main (2017)', 'EP 2017-05-31', 'partial'],
      fire: ['Fully sprinklered 2-story; fire alarm modernized 2024', 'BP 2024-01-17'],
      permits: ['60 records; active fire and life-safety work 2024–2025', 'Permit history'],
    },
  },
];

/* ---------------------------------------------------------------------------
   Data points
   --------------------------------------------------------------------------- */
EQ.DP_TEMPLATE = [
  // Electrical service & tie-in (35)
  { key: 'voltage', sec: 'elec', pts: 4, label: 'Service voltage', owner: 'fm', ask: 'Photo of the main switchgear nameplate' },
  { key: 'mainBreaker', sec: 'elec', pts: 5, label: 'Main OCPD, trip unit & GFPE', owner: 'fm', ask: 'Single-line diagram and a photo of the main breaker trip unit' },
  { key: 'transformer', sec: 'elec', pts: 4, label: 'Service transformer', owner: 'utility', ask: 'Request transformer kVA, voltage ratio and impedance from PG&E' },
  { key: 'faultCurrent', sec: 'elec', pts: 5, label: 'Available fault current & SCCR', owner: 'utility', ask: 'Request PG&E fault-current letter' },
  { key: 'spareBreaker', sec: 'elec', pts: 5, label: 'Point of interconnection', owner: 'fm', ask: 'Photo of the main switchboard with the door open, bus rating label visible' },
  { key: 'metering', sec: 'elec', pts: 3, label: 'Revenue metering', owner: 'fm', ask: 'Photo of the PG&E meter(s) and CT cabinet' },
  { key: 'onsiteGen', sec: 'elec', pts: 3, label: 'Existing generation & storage', owner: 'eqore', ask: 'Confirm existing PV, storage or generators' },
  { key: 'opMode', sec: 'elec', pts: 6, label: 'Operating mode & export control', owner: 'eqore', ask: 'Confirm with customer: non-export peak shaving or backup' },
  // Interval data & tariff (25)
  { key: 'peakDemand', sec: 'load', pts: 8, label: '12-month peak demand', owner: 'fm', ask: 'Green Button interval export' },
  { key: 'tariff', sec: 'load', pts: 6, label: 'Rate schedule & account', owner: 'fm', ask: 'PG&E bills, last 12 months (all pages)' },
  { key: 'interval', sec: 'load', pts: 7, label: '15-min interval data', owner: 'fm', ask: 'Green Button 15-min interval data, 12 months' },
  { key: 'incentive', sec: 'load', pts: 4, label: 'SGIP status', owner: 'eqore', ask: 'Program eligibility check' },
  // Equipment location & fire code (20)
  { key: 'location', sec: 'site', pts: 4, label: 'Equipment location', owner: 'fm', ask: 'Photos of the candidate equipment area' },
  { key: 'setback', sec: 'site', pts: 5, label: 'Separation distances', owner: 'eqore', ask: 'Measure pad to lot line and building on aerial' },
  { key: 'fire', sec: 'site', pts: 5, label: 'Fire access, detection & sprinklers', owner: 'fm', ask: 'Photo of fire alarm panel and nearest hydrant' },
  { key: 'vehicle', sec: 'site', pts: 3, label: 'Vehicle impact protection', owner: 'eqore', ask: 'Review traffic near the equipment area' },
  { key: 'ventilation', sec: 'site', pts: 3, label: 'Enclosure & thermal management', owner: 'eqore', ask: 'Equipment spec' },
  // Permits & interconnection (20)
  { key: 'feeder', sec: 'perm', pts: 4, label: 'Feeder & hosting capacity', owner: 'eqore', ask: 'Run site_record with the utility from the bill' },
  { key: 'codes', sec: 'perm', pts: 3, label: 'Adopted codes', owner: 'eqore', ask: 'Confirm local amendments' },
  { key: 'permits', sec: 'perm', pts: 4, label: 'Permit history at address', owner: 'eqore', ask: 'Permit history pull' },
  { key: 'interconnect', sec: 'perm', pts: 5, label: 'Interconnection', owner: 'eqore', ask: 'Start Rule 21 application' },
  { key: 'ahjPreApp', sec: 'perm', pts: 4, label: 'Fire marshal pre-submittal', owner: 'eqore', ask: 'Schedule pre-submittal meeting with SFFD' },
  // Mobilization & commissioning (from step 04)
  { key: 'delivery', sec: 'field', pts: 0, label: 'Delivery & rigging', owner: 'fm', ask: 'Photos of the delivery path and overhead lines' },
  { key: 'pad', sec: 'field', pts: 0, label: 'Pad & foundation', owner: 'eqore', ask: 'Pad design' },
  { key: 'conduit', sec: 'field', pts: 0, label: 'Conduit route', owner: 'eqore', ask: 'Conduit route' },
  { key: 'shutdown', sec: 'field', pts: 0, label: 'Tie-in shutdown', owner: 'fm', ask: 'Approved shutdown window and loads affected' },
  { key: 'access', sec: 'field', pts: 0, label: 'Site access', owner: 'fm', ask: 'Badging, work hours and laydown area' },
  { key: 'workspace', sec: 'field', pts: 0, label: 'Electrical room working space', owner: 'fm', ask: 'Photo of the MSB working space and door hardware' },
  { key: 'inspections', sec: 'field', pts: 0, label: 'Inspections', owner: 'eqore', ask: 'Schedule inspections' },
  { key: 'cxtests', sec: 'field', pts: 0, label: 'Commissioning tests', owner: 'eqore', ask: 'Commissioning test list' },
];

/* Inputs required to move a lead into project development (gate: Site intake -> Proposal).
   Everything else is optional now and is collected at the step named in EQ.LATER. */
EQ.REQUIRED_FOR = 'project development';
EQ.REQUIRED = {
  voltage: 'Sets the inverter and PCS voltage and whether a step-up or step-down transformer is needed.',
  mainBreaker: 'The main breaker and service size cap how much battery power can connect without a service upgrade.',
  spareBreaker: 'Where the battery ties in (spare breaker, bus space or supply side) decides feasibility and cost.',
  onsiteGen: 'Existing PV, storage or generators change the interconnection track and the 120% bus calculation.',
  opMode: 'Non-export peak shaving vs backup sets the system architecture and the interconnection track.',
  peakDemand: 'Peak demand sets how much power the battery must shave and the system size.',
  tariff: 'The rate schedule sets the demand charges the battery offsets and the program eligibility.',
  interval: '15-minute interval data is needed to size power and energy and to model savings.',
  location: 'There has to be a place to put the equipment before a system can be proposed.',
};
EQ.LATER = {
  transformer: 'Design & permitting', faultCurrent: 'Design & permitting', metering: 'Design & permitting', incentive: 'Proposal',
  setback: 'Design & permitting', fire: 'Design & permitting', vehicle: 'Design & permitting', ventilation: 'Design & permitting',
  feeder: 'Utility interconnection', codes: 'Design & permitting', permits: 'Design & permitting', interconnect: 'Utility interconnection', ahjPreApp: 'Design & permitting',
};
EQ.isRequired = (d) => Object.prototype.hasOwnProperty.call(EQ.REQUIRED, d.key);

EQ.benchLatest = (s) => { const b = (EQ.REC[s.apn] || { benchmark: [] }).benchmark.filter((x) => x.kwh); return b.length ? b[b.length - 1] : null; };
EQ.peakEstimate = (s) => {
  const l = EQ.benchLatest(s); if (!l) return null;
  const avg = l.kwh / 8760, [lo, hi] = EQ.LOAD_FACTOR[s.sector] || [0.35, 0.6];
  return { avg, lo: avg / hi, hi: avg / lo, year: l.year, kwh: l.kwh };
};

/* Utility site records (generated by `./site_record`, see utility_data/README.md). */
EQ.utilityRecord = (s) => (window.UTILITY_RECORDS || []).find((r) => r.site_id === s.id) || null;
EQ.UTIL_SRC = 'Utility hosting-capacity record';
// Fixed site items from the record -> the data point that collects each one.
EQ.SITE_GAP_DP = {
  service_voltage_and_configuration: 'voltage', main_service_amps_and_main_breaker: 'mainBreaker', single_line_diagram: 'mainBreaker',
  bus_rating_and_configuration: 'spareBreaker', spare_breaker_positions_or_bus_space: 'spareBreaker', service_point_and_meter_location: 'metering',
  transformer_kva_ratio_impedance_age: 'transformer', available_fault_current: 'faultCurrent',
};
EQ.SITE_GAP_LABEL = {
  service_voltage_and_configuration: 'Service voltage and configuration', main_service_amps_and_main_breaker: 'Main service amps and main breaker',
  single_line_diagram: 'Single-line diagram', bus_rating_and_configuration: 'Bus rating and configuration', spare_breaker_positions_or_bus_space: 'Spare breaker positions or bus space',
  service_point_and_meter_location: 'Service point and meter location', transformer_kva_ratio_impedance_age: 'Transformer kVA, ratio, impedance, age', available_fault_current: 'Available fault current',
};
EQ.utilFmt = (v) => (v == null ? null : `${typeof v.value === 'number' ? v.value.toLocaleString('en-US') : v.value}${v.unit ? ' ' + v.unit : ''}`);
EQ.utilitySummary = function (r) {
  const f = r.feeder, h = r.hosting_capacity, fm = EQ.utilFmt;
  const feeder = fm(f.name) || (f.id ? `Feeder ${fm(f.id)}` : null);
  if (!feeder) return null;
  const cap = h.generation || h.load
    ? `Gen ${fm(h.generation) || 'not published'} / Load ${fm(h.load) || 'not published'}`
    : 'Hosting capacity not published for this section';
  const when = h.computed ? ` · data ${h.computed.value}` : '';
  return [feeder, fm(r.feeder_voltage_kv), cap].filter(Boolean).join(' · ') + when;
};

EQ.buildDataPoints = function (s) {
  const fmtN = (n) => Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
  const pe = EQ.peakEstimate(s);
  const P = (EQ.REF.programs || {}), IA = (EQ.REF.interconnection || {})[s.utility];
  const defaults = {
    peakDemand: pe ? [`${fmtN(pe.lo)}–${fmtN(pe.hi)} kW estimated from ${fmtN(pe.kwh)} kWh (${pe.year}) and typical load factor`, `Benchmarking ${pe.year}`, 'partial'] : null,
    incentive: s.region === 'ma'
      ? [`Mass Save ConnectedSolutions ($${(P.connectedSolutions || {}).dailyPerKw}/kW-summer, daily dispatch) and Clean Peak (225 CMR 21)`, 'Mass Save offering materials', 'partial', (P.connectedSolutions || {}).url]
      : s.utility === 'PG&E' ? ['SGIP large-scale storage: PG&E Step 5 closed (Nov 2026)', 'SGIP program metrics', null, 'https://www.selfgenca.com/home/program_metrics/'] : null,
    ventilation: ['Outdoor-rated QorePack enclosure with integrated HVAC', 'QorePack cut sheet'],
    codes: s.sf ? ['2025 SF Building, Electrical and Fire Codes (2025 CBC / CEC / CFC + SF amendments)', 'CA Building Standards Commission', null, 'https://www.dgs.ca.gov/BSC/Codes']
      : s.region === 'ma' ? ['780 CMR 10th ed. (2021 IBC) · 527 CMR 1.00 (NFPA 1, 2021) · NFPA 855', 'MA State Building Code', 'partial', 'https://www.mass.gov/handbook/tenth-edition-of-the-ma-state-building-code-780'] : null,
    interconnect: IA ? [`Not filed · ${IA.name}${s.utility === 'PG&E' ? ', non-export via Screen I (certified PCS or relay)' : ''}`, IA.name, null, IA.url] : null,
  };
  const known = Object.assign({}, defaults, s.known || {});
  return EQ.DP_TEMPLATE.map((t) => {
    const k = known[t.key];
    const dp = Object.assign({}, t, { id: `${s.id}:${t.key}`, value: null, src: null, srcUrl: null, conf: null, verified: false, requiresSignoff: false, rfi: null, severity: null });
    if (k) {
      dp.value = k[0]; dp.src = k[1]; dp.srcUrl = k[3] || null;
      dp.conf = k[2] === 'partial' ? 'medium' : 'high';
      dp.requiresSignoff = k[2] === 'partial';
      dp.reviewNote = k[2] === 'partial' ? 'Partial — confirm with customer documents' : null;
      dp.srcType = /^(BP|EP|Permit|Benchmark)/.test(k[1]) ? 'public' : 'spec';
    }
    const ur = EQ.utilityRecord(s);
    if (ur && t.key === 'feeder' && EQ.utilitySummary(ur)) {
      dp.value = EQ.utilitySummary(ur); dp.src = EQ.UTIL_SRC; dp.srcType = 'utility';
      dp.conf = (ur.match && ur.match.confidence) || 'low'; dp.requiresSignoff = true;
      dp.reviewNote = 'Matched by proximity; screening values only';
    }
    if (ur) dp.siteGaps = ur.site_gaps.filter((g) => EQ.SITE_GAP_DP[g.field] === t.key);
    if (dp.value == null && t.sec !== 'field') dp.severity = t.critical ? 'critical' : 'minor';
    return dp;
  });
};

/* Documents & approvals register (permit plan set, approvals, NFPA 855 records). */
EQ.DOC_TEMPLATE = [
  { key: 'sld',      group: 'Permit plan set', name: 'Single-line diagram, stamped',                        ref: 'NEC 705 / 706', due: 'design' },
  { key: 'threeline',group: 'Permit plan set', name: 'Three-line diagram & conductor / voltage-drop schedule', ref: 'NEC 310, 705', due: 'design' },
  { key: 'scstudy',  group: 'Permit plan set', name: 'Short-circuit, coordination & arc-flash study',       ref: 'NEC 110.10, 110.16', due: 'design' },
  { key: 'pcs',      group: 'Permit plan set', name: 'PCS / relay settings sheet (export control)',         ref: 'NEC 705.13 · utility tariff', due: 'design' },
  { key: 'siteplan', group: 'Permit plan set', name: 'Site plan with separation distances & fire access',  ref: 'Fire code §1207 (outdoor)', due: 'design' },
  { key: 'hma',      group: 'Permit plan set', name: 'Hazard mitigation analysis',                          ref: 'NFPA 855 · fire code §1207', due: 'design' },
  { key: 'ul9540',   group: 'Permit plan set', name: 'UL 9540 listing & UL 9540A test report — QorePack',  ref: 'Fire code §1207', due: 'design' },
  { key: 'cuts',     group: 'Permit plan set', name: 'Equipment cut sheets & BMS description',              ref: 'Fire code §1207', due: 'design' },
  { key: 'signplan', group: 'Permit plan set', name: 'Signage & labeling plan',                             ref: 'NFPA 855 7.1.3 · NEC 706.15', due: 'design' },
  { key: 'struct',   group: 'Permit plan set', name: 'Pad & anchorage calculations, stamped',               ref: 'Building code Ch. 16', due: 'design' },
  { key: 'cxplan',   group: 'Permit plan set', name: 'Commissioning plan',                                  ref: 'NFPA 855 6.1', due: 'design' },
  { key: 'eopdraft', group: 'Permit plan set', name: 'Emergency operations plan (draft for AHJ)',           ref: 'NFPA 855 4.1.3.2.1', due: 'design' },
  { key: 'bldg',     group: 'Approvals', name: 'Building permit',                                           ref: 'Local', due: 'design', permit: true },
  { key: 'elec',     group: 'Approvals', name: 'Electrical permit',                                         ref: 'Local', due: 'design', permit: true },
  { key: 'firep',    group: 'Approvals', name: 'Fire permit',                                               ref: 'Fire code §105', due: 'design', permit: true },
  { key: 'iaapp',    group: 'Approvals', name: 'Interconnection application',                               ref: 'Utility tariff', due: 'design' },
  { key: 'iaok',     group: 'Approvals', name: 'Interconnection agreement executed',                        ref: 'Utility tariff', due: 'interconnection' },
  { key: 'insp',     group: 'Approvals', name: 'Final inspections & AHJ acceptance',                        ref: 'Local', due: 'install' },
  { key: 'witness',  group: 'Approvals', name: 'Utility witness test',                                      ref: 'Utility tariff', due: 'install' },
  { key: 'pto',      group: 'Approvals', name: 'Permission to operate',                                     ref: 'Utility tariff', due: 'install' },
  { key: 'cxrpt',    group: 'NFPA 855 records', name: 'Commissioning report & as-builts',                   ref: 'NFPA 855 6.1', due: 'install' },
  { key: 'om',       group: 'NFPA 855 records', name: 'O&M manual',                                         ref: 'NFPA 855 4.1.2.3, 6.3', due: 'install' },
  { key: 'eop',      group: 'NFPA 855 records', name: 'Emergency operations plan (final, on site)',         ref: 'NFPA 855 4.1.3.2.1', due: 'install' },
  { key: 'signage',  group: 'NFPA 855 records', name: 'Hazard signage, disconnect labels, SDS at disconnect', ref: 'NFPA 855 7.1.3', due: 'install' },
  { key: 'fdwalk',   group: 'NFPA 855 records', name: 'Fire department walkthrough & responder page review', ref: 'NFPA 855 4.1.3', due: 'install' },
  { key: 'oprec',    group: 'NFPA 855 records', name: 'Operations record (service, test, training log)',     ref: 'NFPA 855 7.1–7.3, 7.1.6.2', due: 'operate' },
  { key: 'decom',    group: 'NFPA 855 records', name: 'Decommissioning plan',                                ref: 'NFPA 855 8.1–8.3', due: 'end' },
];
/* Prerequisites enforced when a document is marked complete. */
EQ.DOC_PREREQ = { cxrpt: ['cxplan', 'insp'], pto: ['insp', 'witness', 'iaok'], witness: ['iaok'], insp: ['bldg', 'elec', 'firep'], iaok: ['iaapp'], eop: ['eopdraft'], fdwalk: ['eop', 'signage'] };

/* Status of documents due at the project's current step (explicit, so combinations are consistent). */
EQ.CURRENT_STEP_STATUS = {
  design: { sld: 'complete', threeline: 'complete', scstudy: 'in_progress', pcs: 'in_progress', siteplan: 'complete', hma: 'in_progress', ul9540: 'complete', cuts: 'complete', signplan: 'in_progress', struct: 'complete', cxplan: 'in_progress', eopdraft: 'in_progress', bldg: 'not_started', elec: 'not_started', firep: 'not_started', iaapp: 'in_progress' },
  interconnection: { iaok: 'in_progress' },
  install: { insp: 'in_progress', witness: 'not_started', pto: 'not_started', cxrpt: 'not_started', om: 'in_progress', eop: 'in_progress', signage: 'not_started', fdwalk: 'not_started' },
  operate: { oprec: 'in_progress' },
};

EQ.buildDocs = function (s) {
  const cur = EQ.stageIdx(s.stage);
  const eng = EQ.TEAM[s.eng].name;
  return EQ.DOC_TEMPLATE.map((t, i) => {
    let status;
    if (t.due === 'end') status = 'na';
    else {
      const d = EQ.stageIdx(t.due);
      if (cur > d) status = 'complete';
      else if (cur === d) status = (EQ.CURRENT_STEP_STATUS[s.stage] || {})[t.key] || 'in_progress';
      else status = 'not_started';
    }
    const doc = Object.assign({}, t, { id: `${s.id}:doc:${t.key}`, status });
    if (t.key === 'pto') doc.name = s.region === 'ma' ? 'Authorization to Interconnect (Certificate of Completion)' : 'Permission to Operate (PTO letter)';
    if (t.key === 'iaok') doc.name = s.region === 'ma' ? 'Interconnection Service Agreement executed' : 'Rule 21 interconnection agreement executed';
    if (status !== 'not_started' && status !== 'na') doc.updated = `2026-${String(Math.min(10, 3 + cur + (i % 4))).padStart(2, '0')}-${String(3 + (i * 3) % 24).padStart(2, '0')}`;
    if (status === 'complete') doc.evidence = { file: `${s.code}_${t.key}.pdf`, by: t.group === 'Approvals' ? `${eng} (record of issuance)` : eng, at: doc.updated };
    if (t.permit && cur >= EQ.stageIdx('design')) {
      const pre = { bldg: 'BLD', elec: 'ELE', firep: 'FIRE' }[t.key];
      doc.permitNo = status === 'not_started' ? null : `${pre}-2026-${(s.code.charCodeAt(0) * 53 + i * 17) % 9000 + 1000}`;
      doc.permitNote = status === 'complete' ? 'Issued' : status === 'submitted' ? 'In review, cycle 1' : null;
    }
    return doc;
  });
};


/* ---------------------------------------------------------------------------
   Files: public-record sources for every lead; customer uploads are added in the app.
   --------------------------------------------------------------------------- */
EQ.buildFiles = function (s) {
  if (!s.sf) {
    const d = EQ.ADDR[s.slug]; if (!d) return [];
    const auto = { name: 'eqore_site', role: 'Address lookup (public, keyless sources)', auto: true };
    return [{ id: `${s.id}:addr`, key: 'addr', name: `site_record_${s.slug}.json`, type: 'json', cat: 'Public record', uploader: auto, date: d.record.generated_at.slice(0, 10),
      origin: `${d.record.sources.length} public sources from the address`, conf: 'high', confLabel: 'Public records', size: `${d.record.fields.length} fields`, preview: 'addr', dps: ['codes', 'interconnect', 'feeder'] }];
  }
  const auto = { name: 'DataSF', role: 'City of San Francisco open data', auto: true };
  const r = EQ.REC[s.apn] || { permits: [], benchmark: [] };
  return [
    { id: `${s.id}:permits`, key: 'permits', name: `DataSF_permits_${s.apn.replace('/', '-')}.json`, type: 'json', cat: 'Public record', uploader: auto, date: EQ.ASOF, origin: 'Building Permits (i98e-djp9) + Electrical Permits (ftty-kx6y)', conf: 'high', confLabel: 'City record', size: `${r.permits.length} records`, preview: 'permits', dps: ['permits', 'mainBreaker', 'onsiteGen', 'fire'] },
    { id: `${s.id}:bench`, key: 'bench', name: `DataSF_benchmarking_${s.apn.replace('/', '-')}.json`, type: 'json', cat: 'Public record', uploader: auto, date: EQ.ASOF, origin: 'Existing Commercial Buildings Energy Performance (96ck-qcfe)', conf: 'high', confLabel: 'Owner-reported to city', size: `${r.benchmark.length} years`, preview: 'bench', dps: ['peakDemand'] },
  ];
};

EQ.initials = (n) => n.replace(/,.*$/, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

EQ.buildContacts = function (s) {
  const eng = EQ.TEAM[s.eng], sales = EQ.TEAM[s.sales];
  if (!s.sf) {
    const F = (id) => EQ.addrField(s, id), has = (id) => EQ.addrHas(F(id)), IA = (EQ.REF.interconnection || {})[s.utility] || {};
    const jur = has('z_jur') ? F('z_jur').display.split(',')[0] : `${s.city}`;
    const fire = has('d_fire') ? F('d_fire').display : 'Fire authority not confirmed';
    return [
      { id: 'fm', group: 'Customer', role: 'Facility contact', name: 'Not yet identified', title: 'Add when known', org: s.tenant, editable: true, holds: ['Bills and interval data', 'Electrical room access', 'Existing drawings'], last: '—', mobile: true },
      { id: 'bo', group: 'AHJ', role: 'Building & electrical', name: `${jur} building department`, title: 'Permits, plan review, inspections', agency: true, holds: ['Building and electrical permits', 'Final inspection'], last: '—' },
      { id: 'fire', group: 'AHJ', role: 'Fire marshal', name: fire.split(/[.(]/)[0].trim(), title: fire.replace(/^[^.]*\.\s*/, ''), agency: true, holds: ['Fire permit', 'ESS review', 'Acceptance test'], last: '—' },
      { id: 'util', group: 'Utility', role: 'Interconnection', name: `${s.utility} interconnection`, title: IA.name || '', agency: true, portal: IA.url, portalName: IA.short || '', holds: ['Application review', 'Permission to operate'], last: '—' },
      { id: 'eng', group: 'EQORE', role: 'Project engineer', name: eng.name, title: eng.title, org: 'EQORE', email: eng.email, team: s.eng, holds: ['Site evaluation', 'Design & engineering'], last: 'Address lookup review, Nov 7' },
      { id: 'sales', group: 'EQORE', role: 'Account executive', name: sales.name, title: sales.title, org: 'EQORE', email: sales.email, team: s.sales, holds: ['Customer outreach', 'Commercial terms'], last: '—' },
    ];
  }
  return [
    { id: 'fm', group: 'Customer', role: 'Facility contact', name: 'Not yet identified', title: 'Add when known', org: s.tenant, editable: true, holds: ['Bills and interval data', 'Electrical room access', 'Existing drawings'], last: '—', mobile: true },
    { id: 'bo', group: 'AHJ', role: 'Building & electrical', name: 'SF Department of Building Inspection', title: 'Permits, plan review, inspections', agency: true, portal: 'https://sf.gov/departments/department-building-inspection', portalName: 'SF DBI', holds: ['Building and electrical permits', 'Final inspection'], last: '—' },
    { id: 'fire', group: 'AHJ', role: 'Fire marshal', name: 'SF Fire Department, Bureau of Fire Prevention', title: 'Fire permit, ESS review (CFC §1207)', agency: true, portal: 'https://sf-fire.org/', portalName: 'SFFD', holds: ['Fire permit', 'Acceptance test'], last: '—' },
    { id: 'plan', group: 'AHJ', role: 'Planning', name: 'SF Planning', title: 'Zoning and parcel information', agency: true, portal: (EQ.REC[s.apn] || {}).pim || 'https://sfplanninggis.org/PIM/', portalName: `PIM · ${s.apn}`, holds: ['Zoning', 'Parcel records'], last: '—' },
    { id: 'util', group: 'Utility', role: 'Interconnection', name: 'PG&E Rule 21 interconnection', title: 'Electric Rule 21', agency: true, portal: 'https://www.pge.com/tariffs/assets/pdf/tariffbook/ELEC_RULES_21.pdf', portalName: 'Rule 21 tariff', holds: ['Application review', 'Permission to operate'], last: '—' },
    { id: 'eng', group: 'EQORE', role: 'Project engineer', name: eng.name, title: eng.title, org: 'EQORE', email: eng.email, team: s.eng, holds: ['Site evaluation', 'Design & engineering'], last: 'Records review, Nov 7' },
    { id: 'sales', group: 'EQORE', role: 'Account executive', name: sales.name, title: sales.title, org: 'EQORE', email: sales.email, team: s.sales, holds: ['Customer outreach', 'Commercial terms'], last: '—' },
  ];
};

EQ.buildActivity = (s) => (!s.sf ? [
  { t: `${EQ.ASOF}T10:00:00`, who: 'eqore_site', text: `Site record built from the address: ${((EQ.ADDR[s.slug] || {}).record || { sources: [] }).sources.length} public sources` },
  { t: `${EQ.ASOF}T08:30:00`, who: EQ.TEAM[s.sales].name, text: 'Added from the EQORE facility list' },
] : [
  { t: `${EQ.ASOF}T10:00:00`, who: EQ.TEAM[s.eng].name, text: 'Public-records review: permits, benchmarking and findings recorded' },
  { t: `${EQ.ASOF}T09:00:00`, who: 'DataSF', text: `Pulled ${(EQ.REC[s.apn] || { permits: [] }).permits.length} permits and ${(EQ.REC[s.apn] || { benchmark: [] }).benchmark.length} years of benchmarking for APN ${s.apn}` },
  { t: `${EQ.ASOF}T08:30:00`, who: EQ.TEAM[s.sales].name, text: 'Lead identified from SF energy benchmarking screen' },
]);

// Findings and the utility snapshot tile from the utility record. Appended, so reviewed-finding indexes stay stable.
EQ.applyUtilityRecord = function (s) {
  const r = EQ.utilityRecord(s); if (!r) return;
  const h = r.hosting_capacity, src = EQ.UTIL_SRC, name = EQ.utilFmt(r.feeder.name) || EQ.utilFmt(r.feeder.id), add = (sev, text) => s.findings.push({ sev, area: 'utility', text, src });
  const sum = EQ.utilitySummary(r);
  if (sum) s.areas.utility = ['partial', sum, src];
  if (r.match && r.match.confidence === 'low') {
    const c = r.match.candidates;
    add('info', `Feeder is a proximity match only: ${c.length} feeders within ${r.match.radius_m} m; nearest is ${name} at ${c[0].distance_m} m. Confirm with ${s.utility}.`);
  }
  ['generation', 'load'].forEach((k) => { if (h[k] && h[k].value === 0) add('risk', `${s.utility} hosting capacity shows 0 ${h[k].unit || 'kW'} ${k} capacity on the nearest section (${h[k].data_date}). Upgrades or conditions may apply; confirm with a pre-application inquiry.`); });
  if (!h.generation && !h.load && sum) add('info', `${s.utility} publishes no hosting capacity near this site for ${name}. Missing is not zero.`);
  const m = h.computed && String(h.computed.value).match(/([A-Za-z]{3})\w* (\d{4})/);
  if (m) {
    const d = new Date(`${m[1]} 1, ${m[2]}`), months = (Date.now() - d) / 2.63e9;
    if (months > 12) add('info', `${s.utility} hosting-capacity values are from ${h.computed.value}, ${Math.round(months)} months old; check the portal for a newer release.`);
  }
  (r.errors || []).forEach((e) => add('info', `Utility lookup error: ${e}`));
};

/* ---------------------------------------------------------------------------
   Address-based site records (site_records/, generated by `python -m eqore_site.export`
   from the address alone: Census, parcels, zoning, hazards, fire authority, utility territory).
   --------------------------------------------------------------------------- */
EQ.ADDR = window.EQORE_SITE_RECORDS || {};
EQ.ADDR_INDEX = (window.EQORE_SITE_INDEX || {}).sites || [];
EQ.addrSlug = (a) => a.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
EQ.addrDoc = (s) => EQ.ADDR[s.slug] || null;
EQ.addrField = (s, id) => { const d = EQ.addrDoc(s); return d ? d.record.fields.find((f) => f.id === id) || null : null; };
EQ.addrHas = (f) => f && f.status !== 'needed' && f.display && f.display !== 'Not available' && f.display !== 'Not retrieved';
EQ.addrSrc = (id) => `Address lookup (${id})`;
EQ.STAGE_FROM_LIST = { '03': 'design', '04': 'interconnection', '05': 'install', '06': 'operate' };
const titleCase = (x) => x.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase());

// A project from the EQORE facility list: only the address and the customer's facility-list values go in;
// everything else comes from the address-based record.
EQ.facilitySeed = function (entry) {
  const doc = EQ.ADDR[entry.slug]; if (!doc) return null;
  const fac = doc.facility, R = doc.record, F = (id) => R.fields.find((f) => f.id === id);
  const [street, city] = fac.address.split(',').map((x) => x.trim());
  const cen = (F('a_cen') || {}).display || '', zip = (cen.match(/(\d{5})\s*$/) || [])[1] || '';
  const cand = R.candidates[0];
  const yr = F('b_year'), fa = F('b_floor'), occ = F('b_occ');
  return {
    id: entry.slug, slug: entry.slug, fromList: true, name: fac.facility, code: EQ.initials(fac.facility), sector: fac.segment,
    tenant: fac.facility, address: street, zip, neighborhood: (F('a_cnty') || {}).display?.replace(/ \(FIPS.*$/, '') || '',
    apn: cand ? String(cand.apn.value) : '', apnCandidate: !R.confirmed_apn, occupancy: EQ.addrHas(occ) ? occ.display : null, stories: null,
    floorArea: EQ.addrHas(fa) ? parseInt(String(fa.display).replace(/[^0-9]/g, ''), 10) || null : null,
    yearBuilt: EQ.addrHas(yr) ? +String(yr.display).slice(0, 4) || null : null,
    city: titleCase(city || ''), state: entry.state, region: (entry.state || '').toLowerCase(), countyFips: R.county_fips,
    county: ((F('a_cnty') || {}).display || '').replace(/ County.*$/, ''), lat: R.location.value.lat, lng: R.location.value.lon,
    utility: fac.utility, tariff: fac.rate ? `${fac.utility} ${fac.rate}` : null,
    stage: EQ.STAGE_FROM_LIST[(fac.stage || '').slice(0, 2)] || 'intake',
    summary: '', areas: {}, findings: [], known: {},
  };
};

// Fill data points, overview tiles, findings and summary from the address record (and the facility list).
EQ.applyAddressRecord = function (s) {
  const doc = EQ.addrDoc(s); if (!doc) return;
  const R = doc.record, fac = doc.facility || {}, F = (id) => R.fields.find((f) => f.id === id), has = (id) => EQ.addrHas(F(id));
  const dp = (k) => s.dps.find((d) => d.key === k);
  const setDp = (k, value, fid, o = {}) => {
    const d = dp(k); if (!d || d.value != null || value == null) return;
    const f = fid ? F(fid) : null;
    Object.assign(d, { value, src: fid ? EQ.addrSrc(fid) : 'EQORE facility list', srcUrl: f ? f.source_url : null, srcType: o.type || 'public',
      conf: o.conf || (f && f.confidence === 'high' ? 'high' : 'medium'), requiresSignoff: o.signoff ?? (f ? f.status !== 'filled' : true),
      reviewNote: o.note || (f && f.status === 'confirm' ? 'Public record; confirm on site or with the customer' : null), severity: null });
  };
  // Customer values from the EQORE facility list (entered, not verified).
  const svc = s.fromLead ? '' : (fac.service || '');
  const cust = { type: 'customer', conf: 'medium', signoff: true, note: 'From the EQORE facility list; confirm on the bill or switchgear nameplate' };
  if (svc) {
    const v = (svc.match(/\d{3}Y?\/\d{3}V/) || [])[0], kva = (svc.match(/[\d,]+\s*kVA/) || [])[0], amps = (svc.match(/[\d,]+\s*A main/) || [])[0];
    if (v) setDp('voltage', `${v} 3-phase (facility list)`, null, cust);
    if (amps) setDp('mainBreaker', `${amps} (facility list); trip unit and GFPE not given`, null, cust);
    if (kva) setDp('transformer', `${kva} service (facility list); impedance and ownership not given`, null, cust);
  }
  if (fac.rate && !s.fromLead) setDp('tariff', `${fac.utility} ${fac.rate} (facility list)`, null, cust);
  if (fac.peak_kw && !s.fromLead) setDp('peakDemand', `${Number(fac.peak_kw).toLocaleString('en-US')} kW (${fac.peak_basis}); peak-shave target ${fac.target_kw} kW`, null, cust);
  if (fac.system_kw && !s.fromLead) s.system = { kw: fac.system_kw, kwh: fac.system_kwh, status: fac.system_status };
  // Public values from the address record.
  if (has('f_der')) setDp('onsiteGen', F('f_der').display, 'f_der');
  if (has('d_code')) setDp('codes', F('d_code').display, 'd_code', { signoff: false });
  if (has('d_ic')) setDp('interconnect', `Not filed · ${F('d_ic').display}`, 'd_ic');
  if (has('b_permits')) setDp('permits', F('b_permits').display, 'b_permits');
  if (has('f_feeder') && !EQ.utilityRecord(s)) setDp('feeder', F('f_feeder').display, 'f_feeder', { conf: 'low' });
  if (has('g_dist')) setDp('setback', F('g_dist').display, 'g_dist');
  if (has('g_access')) setDp('fire', F('g_access').display, 'g_access');
  if (has('f_kwh') && !s.fromList) { /* SF leads already show benchmarking */ }
  else if (has('f_kwh')) setDp('peakDemand', `Annual use ${F('f_kwh').display}`, 'f_kwh');

  if (s.sf && (!s.occupancy || s.occupancy === '—') && has('b_occ')) s.occupancy = F('b_occ').display.split(';')[0].replace(/^Occupancy\s*/, '');
  // Region-specific asks and authorities.
  const fire = has('d_fire') ? F('d_fire').display.split(/[.(]/)[0].replace(/\s+\(FDID.*$/, '').trim() : 'the fire department';
  s.fireDept = fire; s.ahj = has('z_jur') ? F('z_jur').display.split(',')[0] : s.ahj;
  s.dps.forEach((d) => { d.ask = d.ask.replace(/PG&E/g, s.utility).replace(/SFFD/g, fire); });

  // Overview tiles for facility-list projects (SF leads keep their reviewed tiles).
  if (s.fromList || s.fromLead) {
    const hz = [has('e_liq') && /Inside/.test(F('e_liq').display) && 'liquefaction zone', has('e_tsu') && /^Inside/.test(F('e_tsu').display) && 'tsunami hazard area',
      has('e_fhsz') && !/None/.test(F('e_fhsz').display) && `fire hazard: ${F('e_fhsz').display}`].filter(Boolean);
    const seis = has('e_seis') ? F('e_seis').display.split('·').pop().trim() : null;
    const tiles = {
      electrical: svc ? ['partial', `${svc} (facility list); no drawings yet`, 'EQORE facility list'] : ['unknown', 'Service size not known', EQ.addrSrc('f_svc')],
      load: fac.peak_kw ? ['partial', `Peak ${Number(fac.peak_kw).toLocaleString('en-US')} kW (${fac.peak_basis}) · ${fac.utility} ${fac.rate || ''}`, 'EQORE facility list'] : ['unknown', 'No bills or interval data yet', 'EQORE facility list'],
      site: [hz.length ? 'risk' : 'partial', [hz.length ? hz.join(', ') : 'No mapped liquefaction, tsunami or fire hazard', seis, 'flood zone not checked'].filter(Boolean).join(' · '), EQ.addrSrc(hz.length ? 'e_liq' : 'e_seis')],
      permits: [has('z_zone') ? 'partial' : 'unknown', [has('z_zone') ? `Zoning ${F('z_zone').display.split(',')[0]}` : 'Zoning not found', has('d_code') ? F('d_code').display.split(',')[0] : null].filter(Boolean).join(' · '), EQ.addrSrc(has('z_zone') ? 'z_zone' : 'z_jur')],
      utility: [has('f_util') ? 'partial' : 'unknown', has('f_util') ? `${F('f_util').display}${has('d_ic') ? ' · ' + F('d_ic').display : ''}` : 'Utility not confirmed', EQ.addrSrc('f_util')],
    };
    s.areas = s.fromLead ? Object.assign({}, s.areas, { site: tiles.site, permits: tiles.permits, utility: s.areas.utility && s.areas.utility[0] !== 'unknown' ? s.areas.utility : tiles.utility }) : tiles;
    if (s.fromLead) return addFlags();
    const sys = fac.system_kw ? `${fac.system_kw} kW / ${fac.system_kwh} kWh ${fac.system_status} system` : 'System not sized';
    s.summary = `${fac.segment} on ${fac.utility} ${fac.rate || ''}: ${sys} against a ${Number(fac.peak_kw || 0).toLocaleString('en-US')} kW peak${hz.length ? `; site is in a ${hz.join(' and ')}` : ''}. Parcel is not yet confirmed.`;
  }
  addFlags();
  function addFlags() {
  // Findings from the record's flags (appended; reviewed indexes stay stable).
  const AREA = (ids) => { const i = (ids || [])[0] || ''; return /^e_|^g_|^b_/.test(i) ? 'site' : /^z_|^d_/.test(i) ? 'permits' : /^f_(util|feeder)|^d_ic/.test(i) ? 'utility' : /^f_/.test(i) ? 'electrical' : 'site'; };
  const seen = new Set(s.findings.map((f) => f.text));
  R.flags.forEach((x) => {
    const ids = x.field_ids || [], text = `${x.title}. ${x.detail}`;
    if (seen.has(text)) return;
    const hazard = ids.some((i) => /^e_(liq|tsu|fhsz|fault|coast)$/.test(i));
    s.findings.push({ sev: x.severity === 'warn' && (hazard || /straddles|disagree/i.test(x.title)) ? 'risk' : 'info', area: AREA(ids), text, src: ids.length ? EQ.addrSrc(ids[0]) : 'Address lookup' });
  });
  }
};

/* ---------------------------------------------------------------------------
   Leads from the lead form (lead/): read from localStorage 'eqore.leads'.
   Each becomes a project at intake step 01; uploads move it to step 03 automatically.
   --------------------------------------------------------------------------- */
EQ.LEADS_KEY = 'eqore.leads';
EQ.readLeads = () => { try { return JSON.parse(localStorage.getItem(EQ.LEADS_KEY) || '[]'); } catch (e) { return []; } };
EQ.leadSite = function (lead) {
  const g = lead.geo || {}, st = lead.state || g.state || '';
  const street = (g.matched || lead.address).split(',')[0];
  const s = {
    id: lead.id, fromLead: true, lead, slug: lead.record ? lead.record.slug : EQ.addrSlug(lead.address), name: lead.facility, code: EQ.initials(lead.facility || 'Lead'),
    sector: lead.type || 'Commercial / industrial', tenant: lead.facility, address: street.replace(/\b([A-Z])([A-Z]+)\b/g, (m, a, b) => a + b.toLowerCase()), zip: g.zip || '',
    neighborhood: g.county ? `${g.county} County` : '', apn: '', apnCandidate: true, occupancy: null, stories: null, floorArea: lead.sqft || null, yearBuilt: null,
    city: g.city || '', state: st, region: st.toLowerCase(), countyFips: g.countyFips || '', county: g.county || '', lat: g.lat ?? null, lng: g.lng ?? null,
    utility: lead.utility, tariff: lead.rate ? `${lead.utility} ${lead.rate}` : null, stage: 'intake', intake: 0,
    summary: '', areas: {}, findings: [], known: {},
  };
  return s;
};
// Fill a lead project from what the customer gave on the form.
EQ.applyLead = function (s) {
  const lead = s.lead; if (!lead) return;
  const dp = (k) => s.dps.find((d) => d.key === k), fmtN = (n, x = 0) => Number(n).toLocaleString('en-US', { maximumFractionDigits: x });
  const set = (k, value, o = {}) => { const d = dp(k); if (!d || value == null) return; Object.assign(d, { value, src: o.src || 'Lead form', srcUrl: o.url || null, srcType: o.type || 'customer', conf: o.conf || 'medium', requiresSignoff: o.signoff ?? true, reviewNote: o.note || 'Entered by the customer on the lead form; confirm on the bill', severity: null }); };
  const day = lead.createdAt.slice(0, 10);
  if (lead.rate) set('tariff', `${lead.utility} ${lead.rate} · about $${fmtN(lead.bill)}/month`);
  if (lead.interval) {
    const iv = lead.interval; s.interval = iv;
    set('interval', `${fmtN(iv.count)} intervals, ${iv.minutes}-min, ${iv.start} – ${iv.end}`, { src: 'Customer interval file', conf: 'high', signoff: false, note: null });
    set('peakDemand', `${fmtN(iv.peakKw, 1)} kW · ${iv.peakAt} · load factor ${fmtN(iv.loadFactor * 100)}%`, { src: 'Customer interval file', conf: 'high', signoff: false, note: null });
  } else if (lead.peakEntered) set('peakDemand', `${fmtN(lead.peakEntered)} kW (customer, from bill)`);
  if (lead.der && lead.der.length) set('onsiteGen', lead.der.join(', ') + ' (customer)');
  if (lead.feeder) {
    const f = lead.feeder;
    set('feeder', `${f.name} · ${f.cap}${f.date ? ` · data ${f.date}` : ''}`, { src: `${f.utility} hosting-capacity map (lead form check)`, url: f.url, type: 'utility', conf: 'low', note: 'Nearest line within 150 m; screening only' });
  }
  // Files the customer attached (names and photo thumbnails; bills still need values read from them).
  const kindDp = { bill: 'tariff', interval: 'interval', photo: 'voltage' };
  (lead.files || []).forEach((f, i) => {
    s.files.unshift({ id: `${s.id}:lead:${i}`, key: `lead-${i}`, name: f.name, type: /^image\//.test(f.type) ? 'img' : /csv/.test(f.type) || /\.csv$/i.test(f.name) ? 'csv' : 'pdf', cat: 'Customer upload', uploader: { name: lead.contact.name || 'Customer', role: 'Lead form' }, date: day, origin: 'Customer-provided', conf: 'high', confLabel: 'Customer document', size: `${fmtN(f.size / 1024)} KB`, preview: 'upload', thumb: f.thumb || null, dps: [kindDp[f.kind]].filter(Boolean) });
  });
  // Contact.
  const c = lead.contact || {};
  s.fm = { name: c.name, title: c.role, phone: c.phone, email: c.email };
  const fm = s.contacts.find((x) => x.id === 'fm');
  if (fm) Object.assign(fm, { name: c.name || fm.name, title: [c.role, c.email, c.phone].filter(Boolean).join(' · '), email: c.email, phone: c.phone, last: `Lead form, ${day}` });
  // Overview tiles (records-based tiles are added by applyAddressRecord when an address record exists).
  const e = lead.estimate;
  s.areas = {
    electrical: (lead.files || []).some((f) => f.kind === 'photo') ? ['partial', 'Customer photos received; read ratings from them', 'Lead form'] : ['unknown', 'No service details yet', 'Lead form'],
    load: lead.interval ? ['partial', `Interval data received (${lead.interval.minutes}-min)`, 'Customer interval file'] : ['partial', `About $${fmtN(lead.bill)}/month${lead.peakEntered ? ` · peak ${fmtN(lead.peakEntered)} kW` : ''}${lead.rate ? ' · ' + lead.utility + ' ' + lead.rate : ''}`, 'Lead form'],
    site: ['unknown', lead.tenure ? `${lead.tenure} building${lead.tenure === 'Leased' ? '; landlord consent needed' : ''}` : 'Not reviewed', 'Lead form'],
    permits: ['unknown', 'Not reviewed', 'Lead form'],
    utility: lead.feeder ? ['partial', `${lead.feeder.name}`, `${lead.feeder.utility} hosting-capacity map (lead form check)`] : ['unknown', `${lead.utility}; feeder not checked`, 'Lead form'],
  };
  s.summary = `Lead form ${day}: ${lead.type || 'C&I facility'} on ${lead.utility}${lead.rate ? ' ' + lead.rate : ''}, about $${fmtN(lead.bill)}/month.${e ? ` Rough range $${fmtN(Math.round(e.lo / 1000) * 1000)}–$${fmtN(Math.round(e.hi / 1000) * 1000)}/yr with ${fmtN(e.sysKw)} kW / ${fmtN(e.sysKwh)} kWh (peak ${fmtN(e.peak)} kW ${e.basis}).` : ''}${lead.notes ? ` Customer note: “${lead.notes}”` : ''}`;
  s.peakText = lead.interval ? `${fmtN(lead.interval.peakKw)} kW (interval)` : lead.peakEntered ? `${fmtN(lead.peakEntered)} kW (bill)` : e ? `~${fmtN(e.peak)} kW (estimated)` : null;
  if (lead.tenure === 'Leased') s.findings.push({ sev: 'info', area: 'site', text: 'Leased building: the landlord must consent to the installation and sign permit applications.', src: 'Lead form' });
  if (!lead.geo) s.findings.push({ sev: 'risk', area: 'site', text: 'The address did not match in the Census geocoder; confirm the location with the customer.', src: 'Lead form' });
  s.activity.unshift({ t: lead.createdAt, who: c.name || 'Customer', text: `Lead form submitted${(lead.files || []).length ? ` with ${(lead.files || []).length} file(s)` : ''}` });
};
/* ---------------------------------------------------------------------------
   Customer documents received for a project, with the values read from them.
   Bill images are redacted (account number) before they are stored here.
   --------------------------------------------------------------------------- */
EQ.CUSTOMER_DOCS = {
  '120-lowland-st-holliston-ma': {
    bill: {
      key: 'doc-bill-2026-10', name: 'Eversource_bill_2026-10.pdf', type: 'pdf', date: '2026-10-27', size: '159 KB', confLabel: 'Utility bill',
      img: 'docs/120-lowland-st-holliston-ma/eversource_bill_2026-10_redacted.png', pdf: 'docs/120-lowland-st-holliston-ma/Eversource_bill_2026-10_redacted.pdf', imgNote: 'Account number redacted; original kept with the customer file.',
      rate: 'Eversource G-2', period: 'Oct 2026', total: 28600,
      charges: [['Energy', 14872], ['Demand, max', 8580], ['Demand, peak', 3432], ['Taxes & fees', 1716]],
      // 12-month max demand, read from the bill's bar chart (about ±2 kW)
      demand: [['2025-11', 260], ['2025-12', 263], ['2026-01', 273], ['2026-02', 275], ['2026-03', 269], ['2026-04', 262], ['2026-05', 260], ['2026-06', 272], ['2026-07', 279], ['2026-08', 284], ['2026-09', 285], ['2026-10', 276]],
    },
    sld: {
      key: 'doc-sld-e001', name: 'Existing_SLD_customer.pdf', type: 'pdf', date: '2026-10-27', size: '64 KB', confLabel: 'Customer drawing (concept, not for construction)',
      img: 'docs/120-lowland-st-holliston-ma/existing_sld_E-001_revC.png', pdf: 'docs/120-lowland-st-holliston-ma/Existing_SLD_customer.pdf',
      drawing: 'E-001 rev C', service: '480Y/277V, 3-phase 4-wire (Eversource)', xfmrKva: 750, mainA: 1200, busA: 1200, spareA: 200,
      feeders: ['MCC-1 motor control center', 'HVAC mechanical loads', 'LP-1 lighting panel', 'PROC process loads'],
      notes: ['Marked "Demo document - not for construction".', 'Field verify protective devices, feeder sizes, short-circuit duty and spare capacity.'],
    },
  },
};
EQ.applyCustomerDocs = function (s) {
  const docs = EQ.CUSTOMER_DOCS[s.id]; if (!docs) return;
  const fmtN = (n, x = 0) => Number(n).toLocaleString('en-US', { maximumFractionDigits: x });
  const dp = (k) => s.dps.find((d) => d.key === k);
  const set = (k, value, f, o = {}) => { const d = dp(k); if (!d) return; Object.assign(d, { value, src: f.name, file: f.key, srcUrl: null, srcType: 'customer', conf: o.conf || 'high', requiresSignoff: o.signoff ?? true, reviewNote: o.note || null, severity: null, verified: false }); };
  const fileOf = (f, dps, extracted) => ({ id: `${s.id}:${f.key}`, key: f.key, name: f.name, type: f.type, cat: 'Customer upload', uploader: { name: 'Facility contact', role: 'Customer' }, date: f.date, origin: 'Customer-provided', conf: 'high', confLabel: f.confLabel, size: f.size, preview: 'doc', img: f.img, pdf: f.pdf, imgNote: f.imgNote, extracted, dps });
  const b = docs.bill, sl = docs.sld;
  const demandCost = b.charges.filter(([k]) => /Demand/.test(k)).reduce((a, [, v]) => a + v, 0);
  const pk = b.demand.reduce((a, x) => (x[1] > a[1] ? x : a)), lo = Math.min(...b.demand.map((x) => x[1]));
  const oct = b.demand[b.demand.length - 1][1];
  // Engineering checks from the SLD and bill
  const sysKw = (s.system && s.system.kw) || 100;
  const invA = (sysKw * 1000) / (Math.sqrt(3) * 480), ocpdMin = invA * 1.25, std = [100, 110, 125, 150, 175, 200, 225, 250, 300, 350, 400];
  const ocpd = std.find((x) => x >= ocpdMin) || Math.ceil(ocpdMin);
  const allow120 = sl.busA * 1.2 - sl.mainA;
  const fla = (sl.xfmrKva * 1000) / (Math.sqrt(3) * 480), isc = fla / 0.0575 / 1000;
  const loading = (pk[1] / sl.xfmrKva) * 100;
  s.docCalc = { invA, ocpd, allow120, fla, isc, loading, sysKw };
  s.billDemand = { file: b.name, months: b.demand, rate: b.rate };
  s.peakText = `${pk[1]} kW billed max (${new Date(pk[0] + '-15').toLocaleString('en-US', { month: 'short', year: 'numeric' })})`;
  s.summary = `${s.summary} The ${b.period} bill shows ${lo}–${pk[1]} kW billed max and demand at ${fmtN((demandCost / b.total) * 100)}% of the bill; the customer SLD shows a 200 A spare on the 1,200 A MDP-1 for the battery.`;

  // Files
  s.files = s.files.filter((f) => !/^doc-/.test(f.key));
  s.files.unshift(fileOf(sl, ['voltage', 'mainBreaker', 'transformer', 'spareBreaker'], [['Drawing', `${sl.drawing}, issued ${sl.date}`], ['Service', sl.service], ['Transformer T-1', `${fmtN(sl.xfmrKva)} kVA, 480Y/277V`], ['Main breaker', `${fmtN(sl.mainA)} A`], ['MDP-1 bus', `${fmtN(sl.busA)} A`], ['Spare for BESS POI', `${sl.spareA} A (proposed)`], ['Feeders', sl.feeders.join('; ')], ['Notes', sl.notes.join(' ')]]));
  s.files.unshift(fileOf(b, ['tariff', 'peakDemand'], [['Statement', `${b.date} (${b.period})`], ['Rate', b.rate], ['Account', 'Redacted'], ...b.charges.map(([k, v]) => [k, `$${fmtN(v)}`]), ['Total', `$${fmtN(b.total)}`], ['Max demand, 12 months', `${lo}–${pk[1]} kW (peak ${pk[0]})`]]));

  // Data points
  set('tariff', `${b.rate} · ${b.period} bill $${fmtN(b.total)}; demand $${fmtN(demandCost)} (${fmtN((demandCost / b.total) * 100)}% of bill)`, b, { signoff: false });
  set('peakDemand', `Billed max ${pk[1]} kW (${pk[0]}); ${lo}–${pk[1]} kW over 12 months, ${oct} kW in ${b.period}`, b, { conf: 'medium', note: 'Read from the bill chart (about ±2 kW); 15-min interval data still needed for sizing' });
  set('voltage', sl.service, sl, { conf: 'medium', note: 'Customer concept SLD; field verify' });
  set('mainBreaker', `Main CB ${fmtN(sl.mainA)} A on MDP-1 (${fmtN(sl.busA)} A bus); trip unit and GFPE not shown`, sl, { conf: 'medium', note: 'Customer concept SLD; confirm trip settings and GFPE on site' });
  set('transformer', `T-1 ${fmtN(sl.xfmrKva)} kVA, 480Y/277V; impedance and ownership not shown`, sl, { conf: 'medium', note: 'Request impedance from Eversource' });
  set('spareBreaker', `Spare ${sl.spareA} A position on MDP-1 proposed as BESS POI; ${sysKw} kW needs a ${ocpd} A breaker, within the ${fmtN(allow120)} A the 120% rule allows`, sl, { conf: 'medium', note: `Confirm the spare is a physical breaker space that takes a ${ocpd} A breaker` });

  // Overview tiles
  s.areas.electrical = ['partial', `${sl.service.split(',')[0]} · T-1 ${fmtN(sl.xfmrKva)} kVA · ${fmtN(sl.mainA)} A main / ${fmtN(sl.busA)} A bus · ${sl.spareA} A spare POI`, sl.name];
  s.areas.load = ['partial', `Billed max ${lo}–${pk[1]} kW; demand charges ${fmtN((demandCost / b.total) * 100)}% of the ${b.period} bill`, b.name];

  // Findings (appended; reviewed indexes of earlier findings stay stable)
  const F = (sev, area, text, src) => s.findings.push({ sev, area, text, src });
  F('good', 'electrical', `Point of interconnection fits: the ${sysKw} kW system draws about ${fmtN(invA)} A at 480 V, so it needs a ${ocpd} A breaker (125% of output). That fits the ${sl.spareA} A spare and the ${fmtN(allow120)} A the NEC 705.12 120% rule allows on a ${fmtN(sl.busA)} A bus with a ${fmtN(sl.mainA)} A main (breaker at the opposite end from the main).`, sl.name);
  F('good', 'electrical', `Transformer headroom: the ${pk[1]} kW billed peak is about ${fmtN(loading)}% of the ${fmtN(sl.xfmrKva)} kVA T-1, leaving room to charge at ${sysKw} kW.`, `${sl.name} · ${b.name}`);
  F('info', 'electrical', `No fault current on the SLD. If T-1 has a typical 5.75% impedance, available fault current at MDP-1 is at most about ${fmtN(isc, 1)} kA (infinite source). Request Eversource's fault-current letter before specifying equipment ratings.`, sl.name);
  F('risk', 'electrical', 'The customer SLD is a concept drawing marked "not for construction"; feeders, protective devices, short-circuit duty and spare capacity are all "field verify". Verify on site before the plan set is finalized.', sl.name);
  F('good', 'load', `Demand charges are $${fmtN(demandCost)} of the $${fmtN(b.total)} ${b.period} bill (${fmtN((demandCost / b.total) * 100)}%), on ${b.rate}.`, b.name);
  const listPeak = ((EQ.ADDR[s.slug] || {}).facility || {}).peak_kw;
  if (listPeak && Math.abs(listPeak - pk[1]) > 10) F('info', 'load', `The facility list's ${fmtN(listPeak, 1)} kW peak (15-min interval) is higher than the ${pk[1]} kW billed maximum. Billing may use a different demand interval; size from the interval file.`, `${b.name} · EQORE facility list`);

  s.activity.unshift({ t: `${sl.date}T15:00:00`, who: 'Facility contact', text: `Sent existing single-line diagram ${sl.drawing}` }, { t: `${b.date}T14:00:00`, who: 'Facility contact', text: `Sent ${b.period} Eversource bill (${b.rate})` });
};

EQ.buildLeadSites = function (existingIds) {
  return EQ.readLeads().filter((l) => !(existingIds || new Set()).has(l.id) && l.geo && l.geo.lat != null).map((lead) => {
    const s = EQ.leadSite(lead);
    Object.assign(s, { account: null, sales: 'jkim', eng: 'evasquez', fm: { name: 'Facility contact', title: '', phone: '', email: '' }, inputs: {}, reviewed: {}, overrides: {}, interval: null });
    s.dps = EQ.buildDataPoints(s); s.files = EQ.buildFiles(s); s.docs = EQ.buildDocs(s); s.contacts = EQ.buildContacts(s);
    s.activity = [{ t: lead.createdAt, who: 'Lead form', text: 'Project created from the lead form' }];
    EQ.applyLead(s); EQ.applyAddressRecord(s); EQ.applyUtilityRecord(s);
    return s;
  });
};

EQ.buildSites = function () {
  const seeds = EQ.SEED_SITES.map((seed) => {
    const s = JSON.parse(JSON.stringify(seed));
    const r = EQ.REC[s.apn] || {};
    Object.assign(s, { sf: true, slug: EQ.addrSlug(`${seed.address}, San Francisco, CA ${seed.zip}`), city: 'San Francisco', state: 'CA', county: 'San Francisco', countyFips: '06075', region: 'ca', lat: r.lat, lng: r.lng, floorArea: r.floorArea, yearBuilt: r.yearBuilt,
      utility: 'PG&E', tariff: null, ahj: 'SF Department of Building Inspection', fireDept: 'San Francisco Fire Department', stage: 'intake' });
    return s;
  });
  const used = new Set(seeds.map((s) => s.slug));
  const listed = EQ.ADDR_INDEX.filter((e) => !used.has(e.slug) && EQ.ADDR[e.slug] && EQ.ADDR[e.slug].facility.facility).map(EQ.facilitySeed).filter(Boolean);
  return seeds.concat(listed).map((s) => {
    Object.assign(s, { account: null, sales: 'jkim', eng: 'evasquez', fm: { name: 'Facility contact', title: '', phone: '', email: '' }, inputs: {}, reviewed: {}, overrides: {}, interval: null });
    s.dps = EQ.buildDataPoints(s);
    s.files = EQ.buildFiles(s);
    s.docs = EQ.buildDocs(s);
    s.contacts = EQ.buildContacts(s);
    s.activity = EQ.buildActivity(s);
    EQ.applyAddressRecord(s);
    EQ.applyUtilityRecord(s);
    EQ.applyCustomerDocs(s);
    return s;
  });
};
