/* =============================================================================
   EQORE Site Records — seed data
   ThermoFusion's system and July 2026 performance are from eqore.com; its site
   details beyond that are illustrative. All other facilities are fictional demo
   records. Public reference data (tariffs, programs, codes) lives in reference.js.
   ============================================================================= */
window.EQ = window.EQ || {};

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

/* Design-readiness sections (weights sum to 100). Field items are tracked separately from step 04. */
EQ.SECTIONS = [
  { key: 'elec', name: 'Electrical service & tie-in',    max: 35 },
  { key: 'load', name: 'Interval data & tariff',         max: 25 },
  { key: 'site', name: 'Equipment location & fire code', max: 20 },
  { key: 'perm', name: 'Permits & interconnection',      max: 20 },
];
EQ.FIELD = { key: 'field', name: 'Mobilization & commissioning', from: 'interconnection' };

EQ.REGIONS = {
  ca: { label: 'California · PG&E', short: 'California' },
  ma: { label: 'Massachusetts · Eversource / National Grid', short: 'Massachusetts' },
};

EQ.TEAM = {
  jkim:       { id: 'jkim',       name: 'Jordan Kim',           title: 'Account Executive, West',       email: 'jordan.kim@eqore.example',       color: '#446c87' },
  amehta:     { id: 'amehta',     name: 'Arjun Mehta',          title: 'Account Executive, West',       email: 'arjun.mehta@eqore.example',      color: '#3c6390' },
  evasquez:   { id: 'evasquez',   name: 'Elena Vásquez, PE',    title: 'Project Engineer, West',        email: 'elena.vasquez@eqore.example',    color: '#06162b' },
  sokafor:    { id: 'sokafor',    name: 'Sam Okafor',           title: 'Account Executive, Northeast',  email: 'sam.okafor@eqore.example',       color: '#51453f' },
  rlindqvist: { id: 'rlindqvist', name: 'Rachel Lindqvist, PE', title: 'Project Engineer, Northeast',   email: 'rachel.lindqvist@eqore.example', color: '#4a515d' },
};
EQ.CURRENT_USER = 'evasquez';
EQ.REF = window.EQ_PUBLIC || {};

/* ---------------------------------------------------------------------------
   Facilities
   gaps:   not yet captured → { key: 'critical' | 'minor' }
   review: captured, pending engineer confirmation
   --------------------------------------------------------------------------- */
EQ.SEED_SITES = [
  {
    id: 'thermofusion', name: 'ThermoFusion Inc.', sector: 'Heat treating', code: 'TF', real: true,
    address: '2448 Industrial Pkwy West', city: 'Hayward', state: 'CA', zip: '94545', county: 'Alameda', lat: 37.6208, lng: -122.0803, region: 'ca',
    utility: 'PG&E', tariff: 'B-19', account: '4417 882 901-6',
    ahj: 'City of Hayward Building Division', fireDept: 'Hayward Fire Department',
    objective: 'Peak shaving', opMode: 'nonexport',
    voltage: '480Y/277V', phase: '3Ø 4W', kva: 1500, xfmrType: 'utility padmount',
    mainA: 2000, busA: 2000, switchgear: 'Square D QED-2 switchboard', sccrKa: 65, spareA: 400,
    solarKw: 150, avgBill: 41000, peakKw: 433.7, peakDate: 'Jul 14, 2026 13:45–14:00', target: 300, loadShape: 'furnace',
    system: { kw: 200, kwh: 400, status: 'installed' },
    perf: { month: 'July 2026', buildingPeak: 433.7, gridPeak: 299.6, shaved: 134.1, savings: 10928, projection: 7952, intervals: 2969, monthMaxGrid: 300.2 },
    feeder: 'HAYWARD 1104', substation: 'Industrial', hostingMw: 2.8, hostingGenMw: 1.1,
    location: 'Building B, west wall, exterior pad', setbackFt: 12, lotLine: 'east lot line', bldgSep: '5 ft to Building B west wall (2-h rated, no openings within 10 ft)',
    fireLaneFt: 40, hydrantFt: 120, vehicle: 'Bollards on two exposed sides', apn: '439-0099-012-04',
    eStop: 'Exterior of Building B, west wall, beside the enclosure', disc: 'AC disconnect at MDP-1, Building B electrical room (west door)', pvDisc: 'PV AC disconnect on roof access ladder, Building B',
    stage: 'operate', sales: 'jkim', eng: 'evasquez', gaps: {}, review: [],
    sponsor: null, fm: { name: 'Dave Miller', title: 'Facility & EHS Manager', phone: '(510) 555-0160' },
    domain: 'thermofusion.example',
  },
  {
    id: 'pacific-coldline', name: 'Pacific Coldline Logistics', sector: 'Refrigerated warehouse', code: 'PC',
    address: '380 Littlefield Ave', city: 'South San Francisco', state: 'CA', zip: '94080', county: 'San Mateo', lat: 37.6563, lng: -122.3963, region: 'ca',
    utility: 'PG&E', tariff: 'B-20', account: '7720 114 563-2',
    ahj: 'City of South San Francisco Building Division', fireDept: 'South San Francisco Fire Department',
    objective: 'Peak shaving + backup (refrigeration)', opMode: 'backup',
    voltage: '480Y/277V', phase: '3Ø 4W', kva: 2500, xfmrType: 'utility padmount',
    mainA: 3000, busA: 3000, switchgear: 'Eaton Pow-R-Line Xpert switchboard', sccrKa: 65, spareA: 600,
    solarKw: 0, avgBill: 112400, peakKw: 1180.6, peakDate: 'Sep 05, 2026 14:30–14:45', target: 900, loadShape: 'coldchain',
    system: { kw: 300, kwh: 1200, status: 'contracted' },
    feeder: 'MARTIN 1108', substation: 'Martin', hostingMw: 4.1, hostingGenMw: 2.4,
    location: 'North dock apron, pad 3', setbackFt: 18, lotLine: 'north lot line', bldgSep: '12 ft to warehouse north wall; dock door 14 at 22 ft',
    fireLaneFt: 25, hydrantFt: 90, vehicle: 'Truck apron — bollards and wheel stops required', apn: '015-081-220',
    eStop: 'Enclosure door, north apron', disc: 'AC disconnect beside MSB, north electrical room', pvDisc: null,
    stage: 'interconnection', sales: 'amehta', eng: 'evasquez', gaps: {}, review: [], allVerified: true,
    sponsor: { name: 'Marisol Chen', title: 'VP Finance' }, fm: { name: 'Tom Gallagher', title: 'Director of Facilities', phone: '(650) 555-0122' },
    domain: 'pacificcoldline.example',
  },
  {
    id: 'sv-precision', name: 'Silicon Valley Precision Machining', sector: 'CNC machining', code: 'SV',
    address: '1940 Lundy Ave', city: 'San Jose', state: 'CA', zip: '95131', county: 'Santa Clara', lat: 37.3946, lng: -121.8930, region: 'ca',
    utility: 'PG&E', tariff: 'B-19', account: '5531 090 772-4',
    ahj: 'City of San José Building Division', fireDept: 'San José Fire Department',
    objective: 'Peak shaving', opMode: 'nonexport',
    voltage: '480Y/277V', phase: '3Ø 4W', kva: 1000, xfmrType: 'utility padmount',
    mainA: 1600, busA: 1600, switchgear: 'Siemens SB1 switchboard', sccrKa: 42, spareA: 225,
    solarKw: 0, avgBill: 41300, peakKw: 610.2, peakDate: 'Aug 2026 (billed max)', target: 480, loadShape: 'manufacturing',
    feeder: 'LOS ESTEROS 2107', substation: 'Los Esteros', hostingMw: 1.9, hostingGenMw: 0.8,
    location: 'South yard, adjacent to MDP room', setbackFt: 11, lotLine: 'south lot line', bldgSep: '6 ft to MDP room wall (rating unconfirmed)',
    fireLaneFt: 60, hydrantFt: 180, vehicle: 'Forklift traffic — protection required', apn: '237-05-031',
    stage: 'assessment', sales: 'jkim', eng: 'evasquez',
    gaps: { interval: 'critical', spareBreaker: 'minor', incentive: 'minor', faultCurrent: 'minor', metering: 'minor', opMode: 'minor', interconnect: 'minor', ahjPreApp: 'minor' }, review: [],
    sponsor: { name: 'Greg Halvorsen', title: 'President' }, fm: { name: 'Luis Navarro', title: 'Maintenance Lead', phone: '(408) 555-0174' },
    domain: 'svprecision.example',
  },
  {
    id: 'bayline-plastics', name: 'Bayline Plastics', sector: 'Injection molding', code: 'BP',
    address: '44800 Fremont Blvd', city: 'Fremont', state: 'CA', zip: '94538', county: 'Alameda', lat: 37.4862, lng: -121.9425, region: 'ca',
    utility: 'PG&E', tariff: 'B-19', account: '6604 551 210-8',
    ahj: 'City of Fremont Building & Safety', fireDept: 'Fremont Fire Department',
    objective: 'Peak shaving', opMode: 'nonexport',
    voltage: '480Y/277V', phase: '3Ø 4W', kva: 1200, xfmrType: 'utility padmount',
    mainA: 1600, busA: 1600, switchgear: 'ABB ReliaGear switchboard', sccrKa: 50, spareA: 400,
    solarKw: 220, avgBill: 56800, peakKw: 655.8, peakDate: 'Jul 22, 2026 13:15–13:30', target: 500, loadShape: 'manufacturing',
    system: { kw: 200, kwh: 400, status: 'contracted' },
    feeder: 'NEWARK 2104', substation: 'Newark', hostingMw: 2.2, hostingGenMw: 0.9,
    location: 'East yard, exterior pad', setbackFt: 14, lotLine: 'east lot line', bldgSep: '10 ft to press hall east wall',
    fireLaneFt: 30, hydrantFt: 140, vehicle: 'Bollards at yard drive aisle', apn: '525-1640-008',
    stage: 'design', sales: 'amehta', eng: 'evasquez',
    gaps: { setback: 'minor', interconnect: 'minor' }, review: ['voltage'],
    sponsor: { name: 'Naomi Feld', title: 'VP Operations' }, fm: { name: 'Ben Okoro', title: 'EHS Manager', phone: '(510) 555-0139' },
    domain: 'baylineplastics.example',
  },
  {
    id: 'estuary-cold', name: 'Estuary Cold Storage', sector: 'Cold storage', code: 'EC',
    address: '2250 Livingston St', city: 'Oakland', state: 'CA', zip: '94606', county: 'Alameda', lat: 37.7790, lng: -122.2390, region: 'ca',
    utility: 'PG&E', tariff: 'B-20', account: '8890 223 417-1',
    ahj: 'City of Oakland Planning & Building', fireDept: 'Oakland Fire Department',
    objective: 'Peak shaving + backup (refrigeration)', opMode: 'backup',
    voltage: '480Y/277V', phase: '3Ø 4W', kva: 3000, xfmrType: 'utility padmount',
    mainA: 4000, busA: 4000, switchgear: 'switchboard (make unconfirmed)', sccrKa: null, spareA: 800,
    solarKw: 0, avgBill: 138900, peakKw: 1420.0, peakDate: 'Sep 08, 2026 16:00–16:15', target: 1150, loadShape: 'coldchain',
    feeder: 'OAKLAND J 1103', substation: 'Oakland J', hostingMw: 3.4, hostingGenMw: 1.6,
    location: 'SW parking lot, exterior pad', setbackFt: 16, lotLine: 'west lot line', bldgSep: '25 ft to cold store; ammonia machine room at 60 ft',
    fireLaneFt: 20, hydrantFt: 75, vehicle: 'Parking lot — bollards required', apn: '018-0465-003',
    stage: 'proposal', sales: 'jkim', eng: 'evasquez',
    gaps: { mainBreaker: 'critical', faultCurrent: 'minor', metering: 'minor', transformer: 'minor', setback: 'minor', permits: 'minor', interconnect: 'minor', ahjPreApp: 'minor' }, review: ['spareBreaker'],
    sponsor: { name: 'Victor Salas', title: 'CFO' }, fm: { name: 'Ray Lindgren', title: 'Chief Engineer, Refrigeration', phone: '(510) 555-0188' },
    domain: 'estuarycold.example',
  },
  {
    id: 'merrimack-polymer', name: 'Merrimack Polymer Works', sector: 'Injection molding', code: 'MP',
    address: '16 Commerce Way', city: 'Woburn', state: 'MA', zip: '01801', county: 'Middlesex', lat: 42.5055, lng: -71.1428, region: 'ma',
    utility: 'Eversource', tariff: 'G-2', account: '5121 408 9917',
    ahj: 'City of Woburn Building Department', fireDept: 'Woburn Fire Department',
    objective: 'Peak shaving + ConnectedSolutions', opMode: 'nonexport',
    voltage: '480Y/277V', phase: '3Ø 4W', kva: 2000, xfmrType: 'utility padmount',
    mainA: 2500, busA: 3000, switchgear: 'GE Spectra switchboard', sccrKa: 65, spareA: 600,
    solarKw: 0, avgBill: 96300, peakKw: 890.4, peakDate: 'Jul 29, 2026 15:00–15:15', target: 690, loadShape: 'manufacturing',
    system: { kw: 250, kwh: 600, status: 'contracted' },
    feeder: '14W2', substation: 'Woburn', hostingMw: 3.1, hostingGenMw: 1.5,
    location: 'Loading dock east, exterior pad', setbackFt: 22, lotLine: 'east lot line', bldgSep: '10 ft to plant east wall; dock door 3 at 18 ft',
    fireLaneFt: 30, hydrantFt: 110, vehicle: 'Loading dock — bollards and curb stop', apn: '18-04-11',
    eStop: 'Enclosure door, east dock pad', disc: 'AC disconnect at MSB-1, east electrical room', pvDisc: null,
    stage: 'install', sales: 'sokafor', eng: 'rlindqvist', gaps: { cxtests: 'minor' }, review: [], allVerified: true,
    sponsor: { name: 'Susan Doyle', title: 'VP Finance' }, fm: { name: 'Mike Carrigan', title: 'Plant Engineer', phone: '(781) 555-0115' },
    domain: 'merrimackpolymer.example',
  },
  {
    id: 'charles-river', name: 'Charles River Provisions', sector: 'Food processing', code: 'CR',
    address: '120 Lowland St', city: 'Holliston', state: 'MA', zip: '01746', county: 'Middlesex', lat: 42.2073, lng: -71.4436, region: 'ma',
    utility: 'Eversource', tariff: 'G-2', account: '5112 774 0039',
    ahj: 'Town of Holliston Building Department', fireDept: 'Holliston Fire Department',
    objective: 'Peak shaving + backup (cold storage)', opMode: 'backup',
    voltage: '480Y/277V', phase: '3Ø 4W', kva: 750, xfmrType: 'utility padmount',
    mainA: 1200, busA: 1200, switchgear: 'Square D I-Line panelboard', sccrKa: 35, spareA: 200,
    solarKw: 0, avgBill: 28600, peakKw: 318.2, peakDate: 'Aug 02, 2026 14:45–15:00', target: 240, loadShape: 'coldchain',
    system: { kw: 100, kwh: 400, status: 'contracted' },
    feeder: '240-12', substation: 'Framingham #240', hostingMw: 1.2, hostingGenMw: 0.5,
    location: 'Rear yard, south of compressor room', setbackFt: 15, lotLine: 'south lot line', bldgSep: '14 ft to ammonia compressor room (hazmat exposure)',
    fireLaneFt: 45, hydrantFt: 200, vehicle: 'Low traffic — none required', apn: '9-2-14',
    stage: 'design', sales: 'sokafor', eng: 'rlindqvist',
    gaps: { voltage: 'minor', spareBreaker: 'minor', ventilation: 'minor', fire: 'minor', interconnect: 'minor' }, review: [],
    sponsor: { name: 'Anthony Russo', title: 'COO' }, fm: { name: 'Jenna Morales', title: 'Facilities Supervisor', phone: '(508) 555-0147' },
    domain: 'charlesriverprovisions.example',
  },
  {
    id: 'old-colony', name: 'Old Colony Distribution', sector: 'Distribution center', code: 'OC',
    address: '60 Manley St', city: 'Brockton', state: 'MA', zip: '02301', county: 'Plymouth', lat: 42.0960, lng: -71.0495, region: 'ma',
    utility: 'Eversource', tariff: 'G-2', account: '5098 331 2217',
    ahj: 'City of Brockton Building Department', fireDept: 'Brockton Fire Department',
    objective: 'Peak shaving + capacity tag', opMode: 'nonexport',
    voltage: '480Y/277V', phase: '3Ø 4W', kva: 1500, xfmrType: 'utility padmount',
    mainA: 2000, busA: 2000, switchgear: 'switchboard (make unconfirmed)', sccrKa: null, spareA: 400,
    solarKw: 400, avgBill: 61200, peakKw: 702.0, peakDate: 'Jul 2026 (billed max)', target: 560, loadShape: 'warehouse',
    feeder: '136-07', substation: 'Montello #136', hostingMw: 0.9, hostingGenMw: 0.3,
    location: 'Candidate: NW truck court', setbackFt: 16, lotLine: 'west lot line', bldgSep: '20 ft to warehouse',
    fireLaneFt: 35, hydrantFt: 150, vehicle: 'Truck court — bollards required', apn: '058-112',
    stage: 'assessment', sales: 'sokafor', eng: 'rlindqvist',
    gaps: { interval: 'critical', mainBreaker: 'critical', faultCurrent: 'minor', metering: 'minor', opMode: 'minor', interconnect: 'minor', ahjPreApp: 'minor' }, review: ['location'],
    sponsor: { name: 'Diane Castellano', title: 'VP Operations' }, fm: { name: 'Kevin Brennan', title: 'Facility Manager', phone: '(508) 555-0193' },
    domain: 'oldcolonydist.example',
  },
  {
    id: 'assabet-finishing', name: 'Assabet Metal Finishing', sector: 'Electroplating & anodizing', code: 'AF',
    address: '275 Cedar Hill St', city: 'Marlborough', state: 'MA', zip: '01752', county: 'Middlesex', lat: 42.3292, lng: -71.5818, region: 'ma',
    utility: 'Eversource', tariff: 'G-2', account: '5130 228 9054',
    ahj: 'City of Marlborough Building Department', fireDept: 'Marlborough Fire Department',
    objective: 'Peak shaving + ConnectedSolutions + Clean Peak', opMode: 'nonexport',
    voltage: '480Y/277V', phase: '3Ø 4W', kva: 2500, xfmrType: 'utility padmount',
    mainA: 3000, busA: 3000, switchgear: 'Siemens SB3 switchboard', sccrKa: 65, spareA: 800,
    solarKw: 500, avgBill: 124000, peakKw: 1340.0, peakDate: 'Aug 13, 2026 15:15–15:30', target: 1040, loadShape: 'manufacturing',
    system: { kw: 350, kwh: 800, status: 'contracted' },
    feeder: '219-04', substation: 'Marlborough #219', hostingMw: 4.6, hostingGenMw: 2.0,
    location: 'Utility yard, west of rectifier room', setbackFt: 30, lotLine: 'west lot line', bldgSep: '15 ft to rectifier room; acid storage at 40 ft',
    fireLaneFt: 30, hydrantFt: 100, vehicle: 'Bollards at yard gate', apn: '71-23',
    eStop: 'Enclosure door, utility yard', disc: 'AC disconnect at MSB, rectifier room', pvDisc: 'PV AC disconnect, south roof access',
    stage: 'interconnection', sales: 'sokafor', eng: 'rlindqvist', gaps: {}, review: ['transformer'],
    sponsor: { name: 'Rajiv Anand', title: 'General Manager' }, fm: { name: 'Carla Pereira', title: 'Utilities & EHS Manager', phone: '(508) 555-0151' },
    domain: 'assabetfinishing.example',
  },
  {
    id: 'mill-city', name: 'Mill City Converting', sector: 'Paper converting', code: 'MC',
    address: '144 Western Ave', city: 'Lowell', state: 'MA', zip: '01851', county: 'Middlesex', lat: 42.6385, lng: -71.3290, region: 'ma',
    utility: 'National Grid', tariff: 'G-3', account: '61740-22813',
    ahj: 'City of Lowell Development Services', fireDept: 'Lowell Fire Department',
    objective: 'Peak shaving + capacity tag', opMode: 'nonexport',
    voltage: '480Y/277V', phase: '3Ø 4W', kva: 2500, xfmrType: 'utility padmount',
    mainA: 3000, busA: 3000, switchgear: 'Square D Power-Style QED-6', sccrKa: 65, spareA: 800,
    solarKw: 0, avgBill: 108700, peakKw: 1240.0, peakDate: 'Aug 13, 2026 14:00–14:15', target: 980, loadShape: 'manufacturing',
    feeder: '23L4', substation: 'Perry Street', hostingMw: 2.0, hostingGenMw: 0.7,
    location: 'North parking, pad A', setbackFt: 20, lotLine: 'north lot line', bldgSep: '18 ft to mill building',
    fireLaneFt: 25, hydrantFt: 85, vehicle: 'Parking — bollards required', apn: '211-1-14',
    stage: 'proposal', sales: 'sokafor', eng: 'rlindqvist',
    gaps: { interconnect: 'minor', ahjPreApp: 'minor', incentive: 'minor', faultCurrent: 'minor' }, review: [],
    sponsor: { name: 'Ethan Brooks', title: 'CFO' }, fm: { name: 'Omar Haddad', title: 'Maintenance Manager', phone: '(978) 555-0126' },
    domain: 'millcityconverting.example',
  },
];

/* ---------------------------------------------------------------------------
   Helpers
   --------------------------------------------------------------------------- */
EQ.utilSlug = (u) => ({ 'PG&E': 'PGE', 'National Grid': 'NationalGrid', 'Eversource': 'Eversource' }[u]);
EQ.tariffKey = (s) => `${s.utility} ${s.tariff}`;
const fmtN = (n, d = 0) => Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
EQ.inverterAmps = (kw) => (kw * 1000) / (Math.sqrt(3) * 480);

/* Parse "Jul 14, 2026 13:45–14:00" → month 7, hour 13.75; billed-only peaks default to 15:00. */
EQ.peakAnchor = function (s) {
  const m = MONTHS.findIndex((x) => s.peakDate.startsWith(x)) + 1;
  const t = s.peakDate.match(/(\d{1,2}):(\d{2})/);
  return { month: m || 8, hour: t ? +t[1] + +t[2] / 60 : 15, billedOnly: /billed/.test(s.peakDate) };
};

/* Service fault duty at the transformer secondary (infinite-bus approximation). */
EQ.faultDuty = function (s) {
  const z = s.kva >= 1000 ? 5.75 : 5.0;
  const ifl = (s.kva * 1000) / (Math.sqrt(3) * 480);
  return { z, ka: ifl / (z / 100) / 1000, xr: s.kva >= 2000 ? 8 : 6 };
};

/* NEC 705.12(B)(3)(2) 120% rule for a load-side connection, opposite-end breaker. */
EQ.busCheck = function (s, bessKw) {
  const pvA = EQ.inverterAmps(s.solarKw || 0), bessA = EQ.inverterAmps(bessKw);
  const required = 1.25 * (pvA + bessA);
  const allowance = 1.2 * s.busA - s.mainA;
  const pass = required <= allowance;
  let method;
  if (pass) method = 'Load-side, NEC 705.12(B)(3)(2) (120% rule, breaker at opposite end of bus)';
  else if (allowance > 1.25 * pvA) method = `PCS current limit per NEC 705.13 to ${fmtN(Math.floor((allowance / 1.25 - pvA)))} A on the BESS, or supply-side per 705.11`;
  else method = 'Supply-side connection per NEC 705.11 (bus has no load-side capacity)';
  return { pvA, bessA, required, allowance, pass, method };
};

EQ.contractSize = function (s) {
  if (s.system) return s.system;
  return { kw: Math.max(50, Math.ceil((s.peakKw - s.target) / 0.96 / 50) * 50), kwh: 0, status: 'indicative' };
};

EQ.iaRecord = function (s) {
  const i = EQ.stageIdx(s.stage);
  const ref = (EQ.REF.interconnection || {})[s.utility] || {};
  const backup = s.opMode === 'backup';
  const scheme = s.region === 'ca' ? 'non-export, certified PCS (Rule 21 Screen I, Option 8)' : 'non-export, reverse-power / minimum-import relay';
  const app = `${s.region === 'ca' ? 'R21' : 'IA'}-${2026}-${(s.code.charCodeAt(0) * 37 + s.code.charCodeAt(1)) % 9000 + 1000}`;
  const finalName = s.region === 'ca' ? 'Permission to Operate' : 'Authorization to Interconnect';
  const rec = { tariff: ref.short || '', track: s.region === 'ca' ? 'Fast Track' : 'Expedited', scheme, backup, app, finalName,
    modifiesExisting: s.solarKw > 0 };
  if (i < EQ.stageIdx('design')) rec.status = 'Not filed';
  else if (i === EQ.stageIdx('design')) rec.status = 'Application in preparation';
  else if (i === EQ.stageIdx('interconnection')) { rec.status = 'In utility review (screens)'; rec.filed = '2026-09-22'; }
  else if (i === EQ.stageIdx('install')) { rec.status = 'Agreement executed; witness test pending'; rec.filed = '2026-06-10'; rec.agreement = '2026-08-28'; }
  else { rec.status = `${finalName} received`; rec.filed = '2026-02-03'; rec.agreement = '2026-04-21'; rec.final = '2026-06-24'; }
  return rec;
};
EQ.iaValue = (s) => { const r = EQ.iaRecord(s); return `${r.tariff} ${r.track} · ${r.scheme}${r.backup ? ' · backup (islanding behind MID)' : ''}${r.modifiesExisting ? ' · modifies existing PV agreement' : ''} — ${r.status}${r.filed ? ` · ${r.app}` : ''}`; };

/* ---------------------------------------------------------------------------
   Data points
   --------------------------------------------------------------------------- */
EQ.buildDataPoints = function (s) {
  const ca = s.region === 'ca';
  const hasInterval = !s.gaps.interval;
  const idx = EQ.stageIdx(s.stage);
  const fd = EQ.faultDuty(s);
  const size = EQ.contractSize(s);
  const bc = EQ.busCheck(s, size.kw);
  const gfpe = s.mainA >= 1000 && /480Y/.test(s.voltage);
  const anchor = EQ.peakAnchor(s);
  const opValue = s.opMode === 'backup'
    ? 'Grid-parallel peak shaving + backup: islanding via microgrid interconnect device, critical-load panel (refrigeration), NEC 702 optional standby'
    : (ca ? 'Grid-parallel, non-export: certified PCS (UL 1741 SB, PCS CRD), Rule 21 Screen I Option 8' : 'Grid-parallel, non-export: reverse-power (32R) / minimum-import relay, UL 1741 SB inverters');
  const defs = [
    // Electrical service & tie-in (35)
    { key: 'voltage', sec: 'elec', pts: 4, label: 'Service voltage',
      value: `${s.voltage} ${s.phase}`, src: 'Switchgear nameplate photo', srcType: 'customer', conf: 'high', file: 'nameplate', owner: 'fm',
      ask: 'Photo of the main switchgear nameplate', method: 'OCR of nameplate photo; checked against utility service record' },
    { key: 'mainBreaker', sec: 'elec', pts: 5, label: 'Main OCPD, trip unit & GFPE',
      value: `${fmtN(s.mainA)}A main · ${s.switchgear} · LSI${gfpe ? 'G — GFPE required (NEC 230.95)' : ''}`, src: 'Existing SLD (customer)', srcType: 'customer', conf: 'high', file: 'sld', owner: 'fm',
      ask: 'Existing single-line diagram and a photo of the main breaker trip unit', method: 'Read from customer SLD; trip settings from trip-unit photo' },
    { key: 'transformer', sec: 'elec', pts: 4, label: 'Service transformer',
      value: `${fmtN(s.kva)} kVA ${s.xfmrType} · ${fd.z}% Z (nameplate)`, src: `${s.city} plan set + nameplate photo`, srcType: 'public', conf: 'medium', file: 'planset', owner: 'eqore',
      ask: 'Photo of the transformer nameplate', method: 'Plan-set sheet E-1.0; impedance from nameplate' },
    { key: 'faultCurrent', sec: 'elec', pts: 5, label: 'Available fault current & SCCR',
      value: `${fmtN(fd.ka, 1)} kA sym, X/R ${fd.xr} at service · switchboard SCCR ${s.sccrKa ? s.sccrKa + ' kA' : 'unconfirmed'}${s.sccrKa ? (s.sccrKa >= fd.ka ? ' — adequate' : ' — INADEQUATE') : ''}`,
      src: `${s.utility} fault-current letter`, srcType: 'utility', conf: 'high', file: null, owner: 'eqore',
      ask: 'Request utility fault-current letter', method: 'Utility letter; checked against equipment SCCR (NEC 110.10)' },
    { key: 'spareBreaker', sec: 'elec', pts: 5, label: 'Point of interconnection',
      value: `${fmtN(s.spareA)}A spare position · bus ${fmtN(s.busA)}A / main ${fmtN(s.mainA)}A · ${bc.pass ? '705.12 120% rule passes' : '705.12 120% rule fails — ' + (bc.allowance > 0 ? '705.13 PCS limit or 705.11 supply-side' : '705.11 supply-side')}`,
      src: 'Panel photo, engineer markup', srcType: 'customer', conf: 'high', file: 'panel', owner: 'fm',
      ask: 'Photo of the main distribution panel with the door open, bus rating label visible', method: 'Photo markup; NEC 705.12 check against all inverter sources' },
    { key: 'metering', sec: 'elec', pts: 3, label: 'Revenue metering',
      value: `Meter ${s.code}-${(s.code.charCodeAt(0) * 911) % 90000 + 10000} · CT-rated ${fmtN(s.mainA)}:5 · in MSB metering section`, src: 'Meter photo', srcType: 'customer', conf: 'high', file: null, owner: 'fm',
      ask: 'Photo of the revenue meter and its CT cabinet', method: 'Meter number matched to bill' },
    { key: 'onsiteGen', sec: 'elec', pts: 3, label: 'Existing generation',
      value: s.solarKw ? `${fmtN(s.solarKw)} kW PV, ${fmtN(EQ.inverterAmps(s.solarKw))} A at 480 V · existing interconnection agreement on file` : 'None on record', src: `${s.utility} interconnection queue`, srcType: 'utility', conf: 'high', file: 'hosting', owner: 'eqore',
      ask: 'Confirm existing generation and agreement number', method: 'Utility DER queue lookup by service address' },
    { key: 'opMode', sec: 'elec', pts: 6, label: 'Operating mode & export control',
      value: opValue, src: 'EQORE design basis', srcType: 'spec', conf: 'high', file: null, owner: 'eqore',
      ask: 'Confirm operating mode with customer (non-export vs. backup)', method: 'Design basis memo' },
    // Interval data & tariff (25)
    { key: 'peakDemand', sec: 'load', pts: 8, label: '12-month peak demand',
      value: `${s.peakKw.toFixed(1)} kW · ${s.peakDate}${s.solarKw ? ' · net of on-site PV (revenue meter)' : ''}`,
      src: hasInterval ? 'Green Button interval data' : 'Utility bill (billed max demand)', srcType: hasInterval ? 'meter' : 'customer',
      conf: hasInterval ? 'high' : 'medium', file: hasInterval ? 'csv' : 'bill', owner: 'fm',
      ask: 'Green Button interval export', method: hasInterval ? 'Max 15-min interval over 12 months' : 'Bill max demand only; no interval shape' },
    { key: 'tariff', sec: 'load', pts: 6, label: 'Rate schedule & account',
      value: `${s.utility} ${s.tariff} · acct ${s.account}${s.utility === 'PG&E' && s.tariff === 'B-19' && s.peakKw < 500 ? ' · peak below B-19 500 kW threshold — confirm eligibility / Option S' : ''}`,
      src: 'Utility bill', srcType: 'customer', conf: 'high', file: 'bill', owner: 'fm',
      ask: 'Most recent full utility bill (all pages)', method: 'Bill OCR; rate matched to tariff book' },
    { key: 'interval', sec: 'load', pts: 7, label: '15-min interval data',
      value: `12 months · 35,040 intervals · peak ${MONTHS[anchor.month - 1]} ${String(Math.floor(anchor.hour)).padStart(2, '0')}:${String(Math.round((anchor.hour % 1) * 60)).padStart(2, '0')}`, src: 'Green Button Connect My Data', srcType: 'meter', conf: 'high', file: 'csv', owner: 'fm',
      ask: 'Green Button Connect authorization, or a 12-month 15-min interval CSV', method: 'Utility ESPI pull; aligned to local prevailing time' },
    { key: 'incentive', sec: 'load', pts: 4, label: ca ? 'SGIP status' : 'ConnectedSolutions / Clean Peak',
      value: ca ? 'Large-scale storage eligible; PG&E Step 5 closed — not in payback'
        : `ConnectedSolutions daily dispatch (${s.utility}) eligible · Clean Peak: ${s.solarKw >= 0.75 * size.kw ? 'qualifies via co-located PV' : 'needs renewable pairing'}`,
      src: ca ? 'SGIP program metrics' : 'Mass Save offering / 225 CMR 21.05', srcType: 'public', conf: 'high', file: null, owner: 'eqore',
      ask: 'Program eligibility check', method: 'Program rules applied to rate class, system size and on-site generation' },
    // Equipment location & fire code (20)
    { key: 'location', sec: 'site', pts: 4, label: 'Equipment location',
      value: s.location, src: 'Aerial imagery + facility markup', srcType: 'gis', conf: 'high', file: 'parcel', owner: 'fm',
      ask: 'Mark the preferred equipment location on the aerial', method: 'Ortho imagery with facility-marked location' },
    { key: 'setback', sec: 'site', pts: 5, label: 'Separation distances',
      value: `${s.setbackFt} ft to ${s.lotLine} · ${s.bldgSep} (outdoor min. 10 ft, or 3 ft with rated barrier per fire code)`, src: 'Assessor parcel map + site markup', srcType: 'public', conf: 'high', file: 'parcel', owner: 'eqore',
      ask: 'Survey or plot plan', method: 'Parcel polygon and building footprint offset from equipment' },
    { key: 'fire', sec: 'site', pts: 5, label: 'Fire access, detection & explosion control',
      value: `Fire lane ${s.fireLaneFt} ft · hydrant ${s.hydrantFt} ft · in-enclosure smoke + gas detection to FACP · explosion control per UL 9540A unit-level data`, src: `${s.fireDept} pre-submittal + QorePack 9540A`, srcType: 'public', conf: 'medium', file: 'fireguide', owner: 'fm',
      ask: 'Photo of fire alarm control panel and nearest hydrant', method: 'Aerial measurement; AHJ requirements; manufacturer test data' },
    { key: 'vehicle', sec: 'site', pts: 3, label: 'Vehicle impact protection',
      value: s.vehicle, src: 'Aerial + facility markup', srcType: 'gis', conf: 'medium', file: null, owner: 'eqore',
      ask: 'Traffic pattern near the equipment location', method: 'Aerial review of drive aisles and docks' },
    { key: 'ventilation', sec: 'site', pts: 3, label: 'Enclosure & thermal management',
      value: 'Outdoor-rated QorePack enclosure with integrated HVAC; no building ventilation required', src: 'QorePack cut sheet', srcType: 'spec', conf: 'high', file: 'cutsheet', owner: 'fm',
      ask: 'Photo of exhaust / HVAC discharge near the proposed location', method: 'Manufacturer data vs. ASHRAE 0.4% design temperature' },
    // Permits & interconnection (20)
    { key: 'feeder', sec: 'perm', pts: 4, label: ca ? 'Feeder (PG&E ICA)' : 'Feeder (hosting capacity map)',
      value: `${s.feeder} · ${s.substation} · load capacity ${s.hostingMw} MW · generation capacity ${s.hostingGenMw} MW`, src: ca ? 'PG&E ICA map' : `${s.utility} hosting capacity map`, srcType: 'utility', conf: 'high', file: 'hosting', owner: 'eqore',
      ask: 'Feeder lookup', method: 'Service point joined to feeder geometry' },
    { key: 'codes', sec: 'perm', pts: 3, label: 'Adopted codes',
      value: ca ? '2025 CFC §1207 (2024 IFC basis) · 2025 CBC · 2025 CEC Art. 706' : '527 CMR 1.00 (NFPA 1-2021, Ch. 52 → NFPA 855) · 780 CMR 10th ed. · 527 CMR 12.00 (2026 NEC Art. 706)',
      src: ca ? 'CA Building Standards Commission' : 'MA BFPR / BBRS', srcType: 'public', conf: 'high', file: null, owner: 'eqore',
      ask: 'Confirm local amendments', method: 'Jurisdiction adoption table' },
    { key: 'permits', sec: 'perm', pts: 4, label: 'Permit history at address',
      value: s.permitsHist || (idx >= EQ.stageIdx('interconnection') ? 'Prior electrical permits closed; no open violations' : 'One open electrical permit (unrelated scope)'), src: `${s.city} permit portal`, srcType: 'public', conf: 'medium', file: 'permits', owner: 'eqore',
      ask: 'Permit history pull', method: 'Address-matched permit records' },
    { key: 'interconnect', sec: 'perm', pts: 5, label: 'Interconnection',
      value: EQ.iaValue(s), src: ca ? 'PG&E interconnection portal' : `${s.utility} interconnection portal`, srcType: 'utility', conf: 'high', file: null, owner: 'eqore',
      ask: 'Start interconnection application', method: 'Portal record' },
    { key: 'ahjPreApp', sec: 'perm', pts: 4, label: 'Fire marshal pre-submittal',
      value: idx >= EQ.stageIdx('design') ? `Held with ${s.fireDept}; comments: ${s.opMode === 'backup' ? 'show islanding and critical-load panel on SLD; ' : ''}${/ammonia|hazmat|acid/i.test(s.bldgSep) ? 'address hazmat exposure in HMA; ' : ''}placard at disconnect` : 'Layout reviewed by fire marshal; no exceptions',
      src: 'Meeting minutes', srcType: 'public', conf: 'high', file: null, owner: 'eqore',
      ask: 'Schedule pre-submittal meeting', method: 'Minutes filed by project engineer' },
    // Mobilization & commissioning (tracked from step 04; not scored)
    { key: 'delivery', sec: 'field', pts: 0, label: 'Delivery & rigging', value: `${size.kw >= 300 ? '60-ton' : '40-ton'} crane from ${s.lotLine.replace(' lot line', '')} drive; no overhead lines within 20 ft`, src: 'Site walk', srcType: 'customer', conf: 'high', owner: 'fm', ask: 'Photos of the delivery path and any overhead lines' },
    { key: 'pad', sec: 'field', pts: 0, label: 'Pad & foundation', value: 'Reinforced pad per stamped calc; geotech not required (shallow fill)', src: 'Structural calc', srcType: 'spec', conf: 'high', owner: 'eqore', ask: 'Pad design' },
    { key: 'conduit', sec: 'field', pts: 0, label: 'Conduit route', value: `${Math.round(s.setbackFt * 4 + 60)} ft underground to MSB; one wall penetration`, src: 'Design drawings', srcType: 'spec', conf: 'high', owner: 'eqore', ask: 'Conduit route' },
    { key: 'shutdown', sec: 'field', pts: 0, label: 'Tie-in shutdown', value: 'Saturday 06:00–10:00 · ~3 h · all plant loads except emergency lighting', src: 'Facility confirmation', srcType: 'customer', conf: 'high', owner: 'fm', ask: 'Approved shutdown window and loads affected' },
    { key: 'access', sec: 'field', pts: 0, label: 'Site access', value: 'Badging at main gate; work 06:00–18:00 weekdays; laydown in adjacent parking', src: 'Facility confirmation', srcType: 'customer', conf: 'high', owner: 'fm', ask: 'Badging, work hours and laydown area' },
    { key: 'workspace', sec: 'field', pts: 0, label: 'Electrical room working space', value: 'NEC 110.26 clearances met at MSB; door opens outward with listed panic hardware (110.26(C)(3))', src: 'Facility photo', srcType: 'customer', conf: 'high', owner: 'fm', ask: 'Photo of the MSB working space and electrical room door hardware' },
    { key: 'inspections', sec: 'field', pts: 0, label: 'Inspections', value: 'Electrical rough + final, building final, fire acceptance test scheduled with inspectors', src: 'Permit portal', srcType: 'public', conf: 'high', owner: 'eqore', ask: 'Schedule inspections' },
    { key: 'cxtests', sec: 'field', pts: 0, label: 'Commissioning tests', value: 'BMS and alarm-to-FACP tests, e-stop, non-export trip, utility witness test', src: 'Commissioning plan', srcType: 'spec', conf: 'high', owner: 'eqore', ask: 'Commissioning test list' },
  ];

  const stageVerified = idx >= EQ.stageIdx('design');
  return defs.map((d, i) => {
    const gap = s.gaps[d.key];
    const inReview = s.review.includes(d.key);
    const dp = Object.assign({}, d, {
      id: `${s.id}:${d.key}`, severity: gap || null, pendingValue: d.value,
      value: gap ? null : d.value, requiresSignoff: inReview || d.conf === 'medium',
      verified: !gap && !inReview && (s.allVerified || (stageVerified && d.sec !== 'field') || (d.sec === 'field' && idx >= EQ.stageIdx('install'))),
      verifiedBy: null, rfi: null, updatedAt: gap ? null : '2026-10-' + String(10 + (i % 18)).padStart(2, '0'),
    });
    if (s.stage === 'operate') dp.verified = !gap;
    if (dp.verified) dp.verifiedBy = EQ.TEAM[s.eng].name;
    if (inReview) { dp.conf = 'medium'; dp.reviewNote = 'Low-confidence read — needs engineer confirmation'; }
    // Field items only exist once the project reaches interconnection; earlier they are blank.
    if (d.sec === 'field' && idx < EQ.stageIdx('interconnection')) { dp.value = null; dp.severity = null; }
    if (d.sec === 'field' && idx === EQ.stageIdx('interconnection') && ['shutdown', 'access', 'inspections', 'cxtests'].includes(d.key)) { dp.value = null; dp.severity = 'minor'; }
    return dp;
  });
};

/* ---------------------------------------------------------------------------
   Documents & approvals register
   NFPA 855 section numbers follow EQORE's document checklist; confirm against
   the edition adopted by each AHJ (codes panel).
   --------------------------------------------------------------------------- */
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
   Files
   --------------------------------------------------------------------------- */
EQ.buildFiles = function (s, dps) {
  const has = (k) => dps.find((d) => d.key === k && d.value != null);
  const ca = s.region === 'ca';
  const idx = EQ.stageIdx(s.stage);
  const auto = { name: 'Public-record ingestion', role: 'Automated', auto: true };
  const fm = { name: s.fm.name, role: s.fm.title };
  const sp = s.sponsor ? { name: s.sponsor.name, role: s.sponsor.title } : fm;
  const engU = { name: EQ.TEAM[s.eng].name, role: 'EQORE engineering' };
  const files = [];
  const push = (f) => files.push(Object.assign({ id: `${s.id}:${f.key}` }, f));
  push({ key: 'bill', name: `${EQ.utilSlug(s.utility)}_bill_2026-10.pdf`, type: 'pdf', cat: 'Utility bill', uploader: sp, date: '2026-10-28', origin: 'Customer email', conf: 'high', confLabel: 'Utility-issued', size: '1.4 MB', preview: 'bill', dps: ['tariff'].concat(s.gaps.interval ? ['peakDemand'] : []) });
  if (has('interval')) push({ key: 'csv', name: 'GreenButton_15min_2025-11_2026-10.csv', type: 'csv', cat: 'Interval data', uploader: { name: 'Green Button Connect', role: `${s.utility} ESPI API`, auto: true }, date: '2026-10-31', origin: `${s.utility} Green Button Connect My Data`, conf: 'high', confLabel: 'Revenue meter', size: '2.1 MB', preview: 'csv', dps: ['peakDemand', 'interval'] });
  if (has('voltage')) push({ key: 'nameplate', name: 'MSB_nameplate.jpg', type: 'img', cat: 'Site photo', uploader: fm, date: '2026-10-21', origin: 'Facility upload link', conf: s.review.includes('voltage') ? 'medium' : 'high', confLabel: s.review.includes('voltage') ? 'OCR 71% (glare)' : 'OCR 98%', size: '3.8 MB', preview: 'nameplate', dps: ['voltage'] });
  if (has('mainBreaker')) push({ key: 'sld', name: 'Existing_SLD_customer.pdf', type: 'pdf', cat: 'Drawing', uploader: fm, date: '2026-10-19', origin: 'Facility upload link', conf: 'high', confLabel: 'Customer drawing (not stamped)', size: '840 KB', preview: 'sld', dps: ['mainBreaker'] });
  if (has('transformer')) push({ key: 'planset', name: `${s.city.replace(/\s/g, '')}_approved_planset_E-1.0.pdf`, type: 'pdf', cat: 'Public record', uploader: auto, date: '2026-10-12', origin: `${s.ahj} records request`, conf: 'medium', confLabel: 'Public record', size: '22.6 MB', preview: 'doc', dps: ['transformer'] });
  if (has('spareBreaker')) push({ key: 'panel', name: 'MDP_open_markup.jpg', type: 'img', cat: 'Site photo', uploader: fm, date: '2026-10-21', origin: 'Facility upload link', conf: 'high', confLabel: 'Engineer markup', size: '4.2 MB', preview: 'panel', dps: ['spareBreaker'] });
  if (has('setback') || has('location')) push({ key: 'parcel', name: `APN_${s.apn.replace(/[^0-9A-Za-z]/g, '')}.geojson`, type: 'gis', cat: 'GIS', uploader: auto, date: '2026-10-11', origin: `${s.county} County assessor`, conf: 'medium', confLabel: 'Public record', size: '96 KB', preview: 'siteplan', dps: ['location', 'setback'] });
  push({ key: 'hosting', name: ca ? `PGE_ICA_${s.feeder.split(' ').pop()}.xlsx` : `${EQ.utilSlug(s.utility)}_HCA_${s.feeder}.csv`, type: ca ? 'xlsx' : 'csv', cat: 'Utility GIS', uploader: auto, date: '2026-10-11', origin: ca ? 'PG&E ICA map' : `${s.utility} hosting capacity map`, conf: 'high', confLabel: 'Utility-published', size: '310 KB', preview: 'doc', dps: ['feeder', 'onsiteGen'] });
  push({ key: 'cutsheet', name: 'QorePack_cut_sheet.pdf', type: 'pdf', cat: 'Spec sheet', uploader: engU, date: '2026-10-14', origin: 'EQORE equipment library', conf: 'high', confLabel: 'Manufacturer data', size: '1.1 MB', preview: 'doc', dps: ['ventilation'] });
  push({ key: 'fireguide', name: `${s.fireDept.replace(/\s/g, '_')}_ESS_requirements.pdf`, type: 'pdf', cat: 'Public record', uploader: auto, date: '2026-10-11', origin: s.fireDept, conf: 'medium', confLabel: 'Public record', size: '640 KB', preview: 'doc', dps: ['fire'] });
  if (has('permits')) push({ key: 'permits', name: 'Permit_history.csv', type: 'csv', cat: 'Public record', uploader: auto, date: '2026-10-11', origin: `${s.city} permit portal`, conf: 'medium', confLabel: 'Public record', size: '18 KB', preview: 'doc', dps: ['permits'] });
  if (idx >= EQ.stageIdx('install')) {
    push({ key: 'delivery', name: 'Delivery_and_setting_photos.zip', type: 'img', cat: 'Install photo', uploader: engU, date: '2026-09-30', origin: 'Field crew', conf: 'high', confLabel: 'Field record', size: '48 MB', preview: 'photo', dps: ['delivery'] });
    push({ key: 'asbuilt', name: 'As-built_SLD_rev0.pdf', type: 'pdf', cat: 'Drawing', uploader: engU, date: '2026-10-20', origin: 'EQORE engineering', conf: 'high', confLabel: s.stage === 'operate' ? 'Stamped as-built' : 'Draft as-built', size: '1.2 MB', preview: 'sld', dps: ['spareBreaker'] });
  }
  if (s.stage === 'operate') push({ key: 'cxreport', name: 'Commissioning_report.pdf', type: 'pdf', cat: 'Commissioning', uploader: engU, date: '2026-06-20', origin: 'EQORE commissioning', conf: 'high', confLabel: 'Signed', size: '6.4 MB', preview: 'doc', dps: ['cxtests'] });
  return files;
};

EQ.rfiFileFor = function (s, dpKey) {
  const map = {
    voltage: { key: 'nameplate', name: 'MSB_nameplate.jpg', type: 'img', cat: 'Site photo', preview: 'nameplate', conf: 'high', confLabel: 'OCR 96%', size: '3.6 MB' },
    mainBreaker: { key: 'sld', name: 'Existing_SLD_customer.pdf', type: 'pdf', cat: 'Drawing', preview: 'sld', conf: 'high', confLabel: 'Customer drawing (not stamped)', size: '910 KB' },
    spareBreaker: { key: 'panel', name: 'MDP_open_markup.jpg', type: 'img', cat: 'Site photo', preview: 'panel', conf: 'high', confLabel: 'Engineer markup', size: '4.0 MB' },
    interval: { key: 'csv', name: 'GreenButton_15min_2025-11_2026-10.csv', type: 'csv', cat: 'Interval data', preview: 'csv', conf: 'high', confLabel: 'Revenue meter', size: '2.0 MB' },
    peakDemand: { key: 'csv', name: 'GreenButton_15min_2025-11_2026-10.csv', type: 'csv', cat: 'Interval data', preview: 'csv', conf: 'high', confLabel: 'Revenue meter', size: '2.0 MB' },
    tariff: { key: 'bill', name: `${EQ.utilSlug(s.utility)}_bill_2026-10.pdf`, type: 'pdf', cat: 'Utility bill', preview: 'bill', conf: 'high', confLabel: 'Utility-issued', size: '1.3 MB' },
  };
  return map[dpKey] || { key: 'upload-' + dpKey, name: `Facility_upload_${dpKey}.jpg`, type: 'img', cat: 'Site photo', preview: 'photo', conf: 'high', confLabel: 'Photo', size: '2.4 MB' };
};

EQ.initials = (n) => n.replace(/,.*$/, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

/* ---------------------------------------------------------------------------
   Contacts — agencies are listed as offices, not invented individuals.
   --------------------------------------------------------------------------- */
EQ.buildContacts = function (s) {
  const mail = (n) => { const p = n.split(' '); return `${p[0][0]}${p[p.length - 1]}`.toLowerCase().replace(/[^a-z]/g, ''); };
  const idx = EQ.stageIdx(s.stage);
  const sales = EQ.TEAM[s.sales], eng = EQ.TEAM[s.eng];
  const ahjRef = ((EQ.REF.ahj || {})[s.city]) || {};
  const ia = (EQ.REF.interconnection || {})[s.utility] || {};
  const lastFor = { assessment: 'Assessment kickoff, Oct 08', proposal: 'Proposal review, Nov 03', design: 'Design review, Oct 29', interconnection: 'Permit issuance, Oct 15', install: 'Shutdown planning, Nov 04', operate: 'Monthly savings report, Nov 05' }[s.stage];
  const out = [];
  if (s.sponsor) out.push({ id: 'sponsor', group: 'Customer', role: 'Executive sponsor', name: s.sponsor.name, title: s.sponsor.title, org: s.name, email: `${mail(s.sponsor.name)}@${s.domain}`, holds: ['Contract', 'Utility account access'], last: lastFor });
  out.push({ id: 'fm', group: 'Customer', role: 'Facility contact', name: s.fm.name, title: s.fm.title, org: s.name, email: `${mail(s.fm.name)}@${s.domain}`, phone: s.fm.phone, holds: ['Electrical room access', 'Existing drawings', 'Shutdown scheduling'], last: lastFor });
  out.push({ id: 'bo', group: 'AHJ', role: 'Building official', name: s.ahj, title: 'Plan review & building inspection', agency: true, portal: ahjRef.portal || null, portalName: ahjRef.portalName || `${s.city} permit portal`, holds: ['Building permit', 'Final inspection'], last: idx >= 2 ? 'Plan review, Oct 22' : '—' });
  out.push({ id: 'fire', group: 'AHJ', role: 'Fire marshal', name: s.fireDept, title: 'Fire prevention', agency: true, portal: ahjRef.portal || null, portalName: ahjRef.portalName || `${s.city} permit portal`, holds: ['Fire permit', 'Acceptance test', 'Responder page review'], last: idx >= 2 ? 'Pre-submittal, Oct 16' : '—' });
  if (s.region === 'ma') out.push({ id: 'wire', group: 'AHJ', role: 'Wiring inspector', name: `${s.city} Wiring Inspector`, title: '527 CMR 12.00 inspections', agency: true, portal: ahjRef.portal || null, portalName: ahjRef.portalName || `${s.city} permit portal`, holds: ['Electrical permit', 'Rough & final inspection'], last: idx >= 3 ? 'Permit issued, Oct 15' : '—' });
  out.push({ id: 'util', group: 'Utility', role: 'Interconnection', name: `${s.utility} distributed generation team`, title: ia.name || 'Interconnection', agency: true, portal: ia.url || null, portalName: ia.short || 'Tariff', holds: ['Application review', 'Witness test', s.region === 'ma' ? 'Authorization to Interconnect' : 'PTO'], last: idx >= 3 ? 'Screen review, Oct 30' : '—' });
  out.push({ id: 'eng', group: 'EQORE', role: 'Project engineer', name: eng.name, title: eng.title, org: 'EQORE', email: eng.email, team: s.eng, holds: ['Design & stamped engineering', 'Permit & interconnection filings'], last: 'Record review, Nov 06' });
  out.push({ id: 'sales', group: 'EQORE', role: 'Account executive', name: sales.name, title: sales.title, org: 'EQORE', email: sales.email, team: s.sales, holds: ['Commercial terms', 'Program enrollment'], last: lastFor });
  if (idx >= EQ.stageIdx('interconnection')) out.push({ id: 'ec', group: 'Contractor', role: 'Electrical contractor', name: s.region === 'ca' ? 'Bayshore Electric (EQORE sub)' : 'Middlesex Power Systems (EQORE sub)', title: 'Tie-in, conduit, terminations', org: 'Contractor', holds: ['Tie-in', 'Conduit', 'Rough inspection'], last: idx >= 4 ? 'Mobilization call, Nov 04' : 'Bid award, Oct 28' });
  if (idx >= EQ.stageIdx('install')) out.push({ id: 'noc', group: 'EQORE', role: 'Operations & monitoring', name: 'EQORE operations', title: 'BMS alarm routing, remote shutdown', org: 'EQORE', phone: '(857) 524-2870', holds: ['Alarm response', 'Remote shutdown', 'Dispatch'], last: s.stage === 'operate' ? 'Live' : 'Alarm routing set up, Nov 02' });
  return out;
};

/* Activity follows the project's actual steps. */
EQ.buildActivity = function (s) {
  const idx = EQ.stageIdx(s.stage);
  const eng = EQ.TEAM[s.eng].name, sales = EQ.TEAM[s.sales].name;
  const op = s.real;
  const steps = [
    [0, op ? '2025-10-06T10:30:00' : '2026-10-08T10:30:00', sales, 'Savings assessment opened'],
    [0, op ? '2025-10-20T08:12:00' : '2026-10-31T08:12:00', 'Green Button Connect', s.gaps.interval ? 'Authorization not yet granted' : '12 months of 15-min data received (35,040 intervals)'],
    [0, op ? '2025-10-21T09:00:00' : '2026-10-11T09:00:00', 'Public-record ingestion', `Parcel, permit history and ${s.region === 'ca' ? 'PG&E ICA' : 'hosting capacity'} feeder data pulled`],
    [1, op ? '2025-11-12T11:05:00' : '2026-11-03T11:05:00', sales, 'Proposal presented'],
    [1, op ? '2025-11-20T14:40:00' : '2026-10-21T14:40:00', s.fm.name, 'Uploaded panel and nameplate photos'],
    [2, op ? '2026-01-15T16:20:00' : '2026-10-29T16:20:00', eng, 'Permit plan set submitted'],
    [2, op ? '2026-02-03T09:00:00' : '2026-10-30T09:00:00', eng, 'Interconnection application filed'],
    [3, op ? '2026-04-21T09:00:00' : '2026-10-15T09:00:00', eng, 'Building, electrical and fire permits issued'],
    [4, op ? '2026-05-18T07:00:00' : '2026-11-04T07:00:00', eng, 'Equipment delivered and set'],
    [5, '2026-06-24T12:00:00', eng, s.region === 'ma' ? 'Authorization to Interconnect received' : 'Permission to operate received'],
  ].filter((x) => x[0] <= idx).map(([, t, who, text]) => ({ t, who, text }));
  if (s.id === 'thermofusion') steps.push({ t: '2026-08-03T09:00:00', who: 'QoreAI', text: 'July 2026: building peak 433.7 kW, grid demand 299.6 kW; $10,928 demand-charge savings' });
  return steps.sort((a, b) => (a.t < b.t ? 1 : -1));
};

EQ.buildSites = function () {
  return EQ.SEED_SITES.map((seed) => {
    const s = JSON.parse(JSON.stringify(seed));
    s.dps = EQ.buildDataPoints(s);
    s.files = EQ.buildFiles(s, s.dps);
    s.docs = EQ.buildDocs(s);
    s.contacts = EQ.buildContacts(s);
    s.activity = EQ.buildActivity(s);
    return s;
  });
};

/* Utility service territories (approximate outlines for display). */
EQ.ZONES = [
  { region: 'ca', name: 'PG&E · Peninsula', color: '#446c87', coords: [[37.700, -122.470], [37.708, -122.380], [37.668, -122.352], [37.628, -122.370], [37.618, -122.440], [37.650, -122.478]] },
  { region: 'ca', name: 'PG&E · Oakland', color: '#446c87', coords: [[37.830, -122.300], [37.818, -122.220], [37.770, -122.170], [37.740, -122.200], [37.752, -122.270], [37.800, -122.312]] },
  { region: 'ca', name: 'PG&E · Hayward / Fremont', color: '#446c87', coords: [[37.680, -122.140], [37.672, -122.050], [37.560, -121.930], [37.460, -121.900], [37.450, -121.980], [37.560, -122.080], [37.640, -122.150]] },
  { region: 'ca', name: 'PG&E · San José', color: '#446c87', coords: [[37.440, -121.960], [37.432, -121.860], [37.380, -121.820], [37.330, -121.850], [37.336, -121.940], [37.392, -121.985]] },
  { region: 'ma', name: 'National Grid · Lowell', color: '#3c6390', coords: [[42.690, -71.420], [42.700, -71.260], [42.620, -71.230], [42.590, -71.300], [42.610, -71.410]] },
  { region: 'ma', name: 'Eversource · Woburn', color: '#51453f', coords: [[42.545, -71.190], [42.540, -71.100], [42.480, -71.090], [42.468, -71.170], [42.500, -71.200]] },
  { region: 'ma', name: 'Eversource · MetroWest', color: '#51453f', coords: [[42.380, -71.640], [42.370, -71.470], [42.240, -71.380], [42.160, -71.400], [42.170, -71.500], [42.300, -71.640]] },
  { region: 'ma', name: 'Eversource · Brockton', color: '#51453f', coords: [[42.140, -71.100], [42.135, -70.990], [42.060, -70.980], [42.040, -71.060], [42.080, -71.115]] },
];
