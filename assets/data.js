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

/* EQORE's six-step delivery process (eqore.com/how-it-works). */
EQ.STAGE_ORDER = ['assessment', 'proposal', 'design', 'interconnection', 'install', 'operate'];
EQ.STAGES = {
  assessment:      { n: '01', label: 'Savings assessment' },
  proposal:        { n: '02', label: 'Proposal' },
  design:          { n: '03', label: 'Design & permitting' },
  interconnection: { n: '04', label: 'Utility interconnection' },
  install:         { n: '05', label: 'Installation & commissioning' },
  operate:         { n: '06', label: 'Operate & optimize' },
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
EQ.REGIONS = { ca: { label: 'California · PG&E', short: 'California' }, ma: { label: 'Massachusetts', short: 'Massachusetts' }, nh: { label: 'New Hampshire', short: 'New Hampshire' } };

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
  { key: 'transformer', sec: 'elec', pts: 4, label: 'Service transformer', owner: 'fm', ask: 'Photo of the utility transformer nameplate' },
  { key: 'faultCurrent', sec: 'elec', pts: 5, label: 'Available fault current & SCCR', owner: 'eqore', ask: 'Request PG&E fault-current letter' },
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
  { key: 'feeder', sec: 'perm', pts: 4, label: 'Feeder (PG&E ICA)', owner: 'eqore', ask: 'Look up feeder in PG&E ICA map' },
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

EQ.benchLatest = (s) => { const b = (EQ.REC[s.apn] || { benchmark: [] }).benchmark.filter((x) => x.kwh); return b.length ? b[b.length - 1] : null; };
EQ.peakEstimate = (s) => {
  const l = EQ.benchLatest(s); if (!l) return null;
  const avg = l.kwh / 8760, [lo, hi] = EQ.LOAD_FACTOR[s.sector] || [0.35, 0.6];
  return { avg, lo: avg / hi, hi: avg / lo, year: l.year, kwh: l.kwh };
};

EQ.buildDataPoints = function (s) {
  const fmtN = (n) => Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
  const pe = EQ.peakEstimate(s);
  const defaults = {
    peakDemand: pe ? [`${fmtN(pe.lo)}–${fmtN(pe.hi)} kW estimated from ${fmtN(pe.kwh)} kWh (${pe.year}) and typical load factor`, `Benchmarking ${pe.year}`, 'partial'] : null,
    incentive: ['SGIP large-scale storage: PG&E Step 5 closed (Nov 2026)', 'SGIP program metrics', null, 'https://www.selfgenca.com/home/program_metrics/'],
    ventilation: ['Outdoor-rated QorePack enclosure with integrated HVAC', 'QorePack cut sheet'],
    codes: ['2025 SF Building, Electrical and Fire Codes (2025 CBC / CEC / CFC + SF amendments)', 'CA Building Standards Commission', null, 'https://www.dgs.ca.gov/BSC/Codes'],
    interconnect: ['Not filed · PG&E Rule 21, non-export via Screen I (certified PCS or relay)', 'PG&E Rule 21', null, 'https://www.pge.com/tariffs/assets/pdf/tariffbook/ELEC_RULES_21.pdf'],
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
    } else if (t.sec !== 'field') dp.severity = t.critical ? 'critical' : 'minor';
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

EQ.buildActivity = (s) => [
  { t: `${EQ.ASOF}T10:00:00`, who: EQ.TEAM[s.eng].name, text: 'Public-records review: permits, benchmarking and findings recorded' },
  { t: `${EQ.ASOF}T09:00:00`, who: 'DataSF', text: `Pulled ${(EQ.REC[s.apn] || { permits: [] }).permits.length} permits and ${(EQ.REC[s.apn] || { benchmark: [] }).benchmark.length} years of benchmarking for APN ${s.apn}` },
  { t: `${EQ.ASOF}T08:30:00`, who: EQ.TEAM[s.sales].name, text: 'Lead identified from SF energy benchmarking screen' },
];

EQ.buildSites = function () {
  return EQ.SEED_SITES.map((seed) => {
    const s = JSON.parse(JSON.stringify(seed));
    const r = EQ.REC[s.apn] || {};
    Object.assign(s, { city: 'San Francisco', state: 'CA', county: 'San Francisco', countyFips: '06075', region: 'ca', lat: r.lat, lng: r.lng, floorArea: r.floorArea, yearBuilt: r.yearBuilt,
      utility: 'PG&E', tariff: null, account: null, ahj: 'SF Department of Building Inspection', fireDept: 'San Francisco Fire Department',
      stage: 'assessment', sales: 'jkim', eng: 'evasquez', fm: { name: 'Facility contact', title: '', phone: '', email: '' }, inputs: {}, reviewed: {}, overrides: {}, interval: null });
    s.dps = EQ.buildDataPoints(s);
    s.files = EQ.buildFiles(s);
    s.docs = EQ.buildDocs(s);
    s.contacts = EQ.buildContacts(s);
    s.activity = EQ.buildActivity(s);
    return s;
  });
};
