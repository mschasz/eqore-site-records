/* EQORE lead form: address -> live site check, bill/peak -> rough savings range, uploads, submit.
   Submissions go to localStorage ('eqore.leads'), which EQORE Site Records reads to open the project. */
(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n, d = 0) => Number(n).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
  const num = (v) => { const n = parseFloat(String(v || '').replace(/[^0-9.]/g, '')); return isNaN(n) ? null : n; };
  const REF = window.EQ_PUBLIC || {};
  const LEADS_KEY = 'eqore.leads';
  const UA_NOTE = 'EQORE lead form';

  /* ------------------------------------------------------------ reference lists */
  const STATES = [['CA', 'California'], ['CT', 'Connecticut'], ['MA', 'Massachusetts'], ['NH', 'New Hampshire'], ['RI', 'Rhode Island'],
    ['AL', 'Alabama'], ['AK', 'Alaska'], ['AZ', 'Arizona'], ['AR', 'Arkansas'], ['CO', 'Colorado'], ['DE', 'Delaware'], ['DC', 'District of Columbia'], ['FL', 'Florida'], ['GA', 'Georgia'],
    ['HI', 'Hawaii'], ['ID', 'Idaho'], ['IL', 'Illinois'], ['IN', 'Indiana'], ['IA', 'Iowa'], ['KS', 'Kansas'], ['KY', 'Kentucky'], ['LA', 'Louisiana'], ['ME', 'Maine'], ['MD', 'Maryland'],
    ['MI', 'Michigan'], ['MN', 'Minnesota'], ['MS', 'Mississippi'], ['MO', 'Missouri'], ['MT', 'Montana'], ['NE', 'Nebraska'], ['NV', 'Nevada'], ['NJ', 'New Jersey'], ['NM', 'New Mexico'],
    ['NY', 'New York'], ['NC', 'North Carolina'], ['ND', 'North Dakota'], ['OH', 'Ohio'], ['OK', 'Oklahoma'], ['OR', 'Oregon'], ['PA', 'Pennsylvania'], ['SC', 'South Carolina'],
    ['SD', 'South Dakota'], ['TN', 'Tennessee'], ['TX', 'Texas'], ['UT', 'Utah'], ['VT', 'Vermont'], ['VA', 'Virginia'], ['WA', 'Washington'], ['WV', 'West Virginia'], ['WI', 'Wisconsin'], ['WY', 'Wyoming']];
  const UTILITIES = {
    CA: ['PG&E', 'SCE', 'SDG&E', 'Municipal or other'],
    MA: ['National Grid', 'Eversource', 'Unitil', 'Municipal light plant'],
    NH: ['Eversource', 'Unitil', 'Liberty Utilities', 'NH Electric Co-op'],
    CT: ['Eversource', 'United Illuminating'],
    RI: ['Rhode Island Energy'],
  };
  // Typical all-in demand cost when we have no tariff on file ($/kW-year); labelled as typical in the estimate.
  const TYPICAL_PER_KW_YR = { CA: 450, MA: 250, NH: 180, CT: 200, RI: 200 };
  const DEMAND_SHARE = 0.35;   // share of a C&I bill that is demand charges, used only to estimate peak from the bill
  const SHAVE = [0.15, 0.25];  // share of peak a right-sized battery typically shaves
  const REALIZE = 0.75;        // not every month's peak is fully shaved

  /* ------------------------------------------------------------ state */
  const L = { geo: null, feeder: null, record: null, files: { bill: [], interval: [], photo: [] }, interval: null, map: null };

  /* ------------------------------------------------------------ selects */
  function fillStates() {
    $('#f-state').innerHTML = '<option value="">Select a state</option>' + STATES.map(([k, n]) => `<option value="${k}">${n}</option>`).join('');
  }
  function fillUtilities() {
    const st = $('#f-state').value, list = UTILITIES[st] || ['Other'], cur = $('#f-utility').value;
    $('#f-utility').innerHTML = '<option value="">Select</option>' + list.map((u) => `<option ${u === cur ? 'selected' : ''}>${esc(u)}</option>`).join('') + (list.includes('Other') ? '' : '<option>Other</option>');
    fillRates();
  }
  function fillRates() {
    const u = $('#f-utility').value;
    const rates = Object.keys(REF.tariffs || {}).filter((k) => u && k.startsWith(u + ' ')).map((k) => k.slice(u.length + 1));
    $('#f-rate').innerHTML = '<option value="">Not sure</option>' + rates.map((r) => `<option>${esc(r)}</option>`).join('') + '<option value="other">Other</option>';
  }

  /* ------------------------------------------------------------ tariff math */
  function perKwYear(tkey) {
    const t = (REF.tariffs || {})[tkey]; if (!t) return null;
    const summer = (t.summerMonths || [6, 7, 8, 9]).length, winter = 12 - summer;
    return t.components.reduce((a, c) => a + (c.rate.summer || 0) * summer + (c.rate.winter || 0) * winter, 0);
  }
  function estimate() {
    const st = $('#f-state').value, u = $('#f-utility').value, rate = $('#f-rate').value;
    const tkey = rate && rate !== 'other' ? `${u} ${rate}` : null;
    const tariff = tkey ? (REF.tariffs || {})[tkey] : null;
    const rateYr = (tkey && perKwYear(tkey)) || TYPICAL_PER_KW_YR[st] || 200;
    const bill = num($('#f-bill').value), entered = num($('#f-peak').value);
    let peak = null, basis = null;
    if (L.interval) { peak = L.interval.peakKw; basis = `measured from ${L.interval.file}`; }
    else if (entered) { peak = entered; basis = 'entered from bill'; }
    else if (bill) { peak = (bill * 12 * DEMAND_SHARE) / rateYr; basis = `estimated from a $${fmt(bill)}/mo bill`; }
    if (!peak) return null;
    const sysKw = Math.max(50, Math.round((peak * 0.25) / 25) * 25), sysKwh = sysKw * 2;
    const lo = peak * SHAVE[0] * rateYr * REALIZE, hi = Math.min(peak * SHAVE[1], sysKw) * rateYr * REALIZE;
    const programs = [];
    const P = REF.programs || {};
    if (st === 'MA' && P.connectedSolutions) programs.push({ name: 'Mass Save ConnectedSolutions (daily dispatch)', value: P.connectedSolutions.dailyPerKw * sysKw, note: `$${P.connectedSolutions.dailyPerKw}/kW-summer; ${P.connectedSolutions.caveat}`, url: P.connectedSolutions.url });
    if (st === 'MA' && P.cleanPeak) programs.push({ name: 'Clean Peak Energy Standard', value: null, note: 'Certificates for discharging in peak windows; eligibility depends on pairing with renewables.', url: P.cleanPeak.url });
    if (st === 'CA' && P.sgip) programs.push({ name: 'SGIP large-scale storage', value: null, note: `Status: ${P.sgip.status} (step ${P.sgip.step}). Check for reopened budget.`, url: P.sgip.url });
    return { peak, basis, rateYr, tariff, tkey, typical: !tariff, sysKw, sysKwh, lo, hi, programs, bill };
  }

  function renderEstimate() {
    const e = estimate(), el = $('#estimate');
    if (!e) {
      $('#est-basis').textContent = '';
      el.innerHTML = `<div class="text-[14px] text-ink2">Enter your address, utility and monthly bill to see a range.</div>
        <ul class="mt-4 text-[12.5px] text-ink2 space-y-1.5">${['Peak demand and demand charges from your tariff', 'A right-sized battery for peak shaving', 'Utility programs that pay for dispatch', 'Feeder and hosting-capacity check from the address'].map((x) => `<li class="flex gap-2"><span class="text-mute">—</span>${x}</li>`).join('')}</ul>`;
      return;
    }
    $('#est-basis').textContent = L.interval ? 'from your interval data' : 'from your bill';
    const prog = e.programs.filter((p) => p.value).reduce((a, p) => a + p.value, 0);
    const iv = L.interval;
    const bars = iv && iv.monthly.length ? (() => { const m = Math.max(...iv.monthly.map((x) => x.kw)); return `<div class="mt-5"><div class="text-[12px] text-ink2 mb-2">Monthly peak demand (kW)</div>
      <div class="flex items-end gap-[3px] h-20" role="img" aria-label="Monthly peak demand">${iv.monthly.map((x) => `<div class="flex-1 bg-blue" style="height:${(x.kw / m) * 100}%" title="${esc(x.m)}: ${fmt(x.kw)} kW"></div>`).join('')}</div>
      <div class="flex justify-between text-[10.5px] text-mute mt-1 num"><span>${esc(iv.monthly[0].m)}</span><span>${esc(iv.monthly[iv.monthly.length - 1].m)}</span></div></div>`; })() : '';
    el.innerHTML = `<div class="est-big num">$${fmt(Math.round(e.lo / 1000) * 1000)} – $${fmt(Math.round(e.hi / 1000) * 1000)}</div>
      <div class="text-[13px] text-ink2 mt-1">per year in demand-charge savings${prog ? `, plus about $${fmt(Math.round(prog / 1000) * 1000)}/yr from programs` : ''}</div>
      <dl class="mt-5 border-t border-line2 text-[12.5px]">
        ${[['Peak demand', `${fmt(e.peak)} kW`, e.basis],
          ['Demand charges', `$${fmt(e.rateYr)} per kW-year`, e.tariff ? `${e.tariff.name}` : `typical for ${$('#f-state').value || 'your state'}; pick your rate schedule for a tariff-based number`],
          ['Suggested system', `${fmt(e.sysKw)} kW / ${fmt(e.sysKwh)} kWh`, 'sized to shave the top 15–25% of peak'],
        ].map(([k, v, s]) => `<div class="py-2.5 border-b border-line2 grid grid-cols-[120px_1fr] gap-3"><dt class="text-mute">${k}</dt><dd><div class="text-ink num">${esc(v)}</div><div class="text-[11.5px] text-mute">${esc(s)}</div></dd></div>`).join('')}
        ${e.programs.map((p) => `<div class="py-2.5 border-b border-line2 grid grid-cols-[120px_1fr] gap-3"><dt class="text-mute">Program</dt><dd><div class="text-ink">${p.url ? `<a class="link" href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.name)}</a>` : esc(p.name)}${p.value ? ` · <span class="num">$${fmt(Math.round(p.value / 1000) * 1000)}/yr</span>` : ''}</div><div class="text-[11.5px] text-mute">${esc(p.note)}</div></dd></div>`).join('')}
        ${siteRows()}
      </dl>${bars}`;
  }
  function siteRows() {
    const rows = [];
    if (L.feeder) {
      const f = L.feeder;
      rows.push(['Nearby feeder', f.name, `${f.cap}${f.date ? ` · utility data ${f.date}` : ''} · screening only, matched by distance`, f.url]);
    } else if (L.feederNote) rows.push(['Nearby feeder', '—', L.feederNote, null]);
    if (L.record) rows.push(['Site file', 'Public-record site file on record', `${L.record.summary.required_done_pct}% of required items already filled from the address`, null]);
    return rows.map(([k, v, s, u]) => `<div class="py-2.5 border-b border-line2 grid grid-cols-[120px_1fr] gap-3"><dt class="text-mute">${k}</dt><dd><div class="text-ink">${u ? `<a class="link" href="${esc(u)}" target="_blank" rel="noopener">${esc(v)}</a>` : esc(v)}</div><div class="text-[11.5px] text-mute">${esc(s)}</div></dd></div>`).join('');
  }

  /* ------------------------------------------------------------ address -> Census geocoder (JSONP; the API sends no CORS headers) */
  function jsonp(url) {
    return new Promise((res, rej) => {
      const cb = `eqcb_${Date.now()}_${Math.round(Math.random() * 1e6)}`, sc = document.createElement('script');
      const t = setTimeout(() => { cleanup(); rej(new Error('timeout')); }, 15000);
      const cleanup = () => { clearTimeout(t); delete window[cb]; sc.remove(); };
      window[cb] = (d) => { cleanup(); res(d); };
      sc.onerror = () => { cleanup(); rej(new Error('network')); };
      sc.src = `${url}&format=jsonp&callback=${cb}`; document.head.appendChild(sc);
    });
  }
  async function locate() {
    const a = $('#f-address').value.trim(); if (!a) { $('#f-address').focus(); return; }
    $('#geo-status').textContent = 'Looking up the address…';
    try {
      const d = await jsonp(`https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress?address=${encodeURIComponent(a)}&benchmark=Public_AR_Current&vintage=Current_Current&layers=Counties,Census%20Tracts,Incorporated%20Places`);
      const m = ((d.result || {}).addressMatches || [])[0];
      if (!m) { L.geo = null; $('#geo-card').hidden = true; $('#geo-status').innerHTML = '<span class="text-alert">No match from the Census geocoder.</span> Check the street and city; you can still submit and we\'ll confirm the location.'; renderSteps(); return; }
      const g = m.geographies || {}, c = (g.Counties || [])[0] || {}, tr = (g['Census Tracts'] || [])[0] || {}, pl = (g['Incorporated Places'] || [])[0] || {}, ac = m.addressComponents || {};
      L.geo = { matched: m.matchedAddress, lat: m.coordinates.y, lng: m.coordinates.x, state: ac.state, city: pl.BASENAME || titleCase(ac.city || ''), zip: ac.zip,
        county: c.BASENAME || '', countyFips: c.GEOID || '', tract: tr.GEOID || '', source: 'US Census Geocoder (Public_AR_Current)', at: new Date().toISOString() };
      $('#geo-status').innerHTML = `Matched <span class="text-ink">${esc(m.matchedAddress)}</span> · US Census geocoder`;
      if (ac.state && STATES.some(([k]) => k === ac.state) && $('#f-state').value !== ac.state) { $('#f-state').value = ac.state; fillUtilities(); }
      showGeo(); checkRecord(); checkFeeder();
    } catch (e) {
      L.geo = null; $('#geo-status').innerHTML = '<span class="text-alert">The address service did not respond.</span> You can still submit; we\'ll confirm the location.';
    }
    renderSteps(); renderEstimate();
  }
  const titleCase = (x) => x.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase());
  function showGeo() {
    const g = L.geo; $('#geo-card').hidden = false;
    $('#geo-facts').innerHTML = [['County', `${g.county}${g.state ? ', ' + g.state : ''}`], ['City', g.city || '—'], ['Coordinates', `${g.lat.toFixed(5)}, ${g.lng.toFixed(5)}`], ['Census tract', g.tract || '—']]
      .map(([k, v]) => `<div><dt class="text-mute">${k}</dt><dd class="text-ink num">${esc(v)}</dd></div>`).join('') + '<div class="col-span-2 text-[11px] text-mute">Point is street-interpolated; we confirm the parcel with you.</div>';
    if (!L.map) {
      L.map = window.L.map('geo-map', { zoomControl: false, attributionControl: false, scrollWheelZoom: false });
      window.L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19 }).addTo(L.map);
    }
    L.map.setView([g.lat, g.lng], 18);
    if (L.pin) L.pin.remove();
    L.pin = window.L.circleMarker([g.lat, g.lng], { radius: 6, color: '#fff', weight: 2, fillColor: '#06162b', fillOpacity: 1 }).addTo(L.map);
    setTimeout(() => L.map.invalidateSize(), 60);
  }
  async function checkRecord() {
    L.record = null;
    try {
      const idx = await fetch('../site_records/index.json').then((r) => (r.ok ? r.json() : null));
      const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const want = slug($('#f-address').value).replace(/-\d{5}$/, '');
      const hit = idx && idx.sites.find((x) => slug(x.address).replace(/-\d{5}$/, '') === want);
      if (hit) { L.record = { slug: hit.slug, summary: hit.summary }; renderEstimate(); }
    } catch (e) { /* optional */ }
  }

  /* ------------------------------------------------------------ live feeder check (public ArcGIS services that allow browser queries) */
  const FEEDER_SVC = {
    'PG&E': { url: 'https://services2.arcgis.com/mJaJSax0KPHoCNB6/ArcGIS/rest/services/DRPComplianceRelProd/FeatureServer/3/query', fields: 'FeederName,FeederId,voltage_kv,GenCapacity_kW,LoadCapacity_kW,ICA_Analysis_Date',
      read: (a) => ({ name: `${a.FeederName || a.FeederId} · ${a.voltage_kv} kV`, cap: a.ICA_Analysis_Date ? `${fmt(a.GenCapacity_kW)} kW generation / ${fmt(a.LoadCapacity_kW)} kW load hosting capacity` : 'Hosting capacity not published for this section', date: a.ICA_Analysis_Date, id: a.FeederId }), dated: (a) => !!a.ICA_Analysis_Date },
    'National Grid': { url: 'https://systemdataportal.nationalgrid.com/arcgis/rest/services/MASDP/MA_HostingCapacity_with_DGPending/MapServer/0/query', fields: 'Master_CDF,Substation,Operating_Voltage_kV,HC_Available_MW,Updated_Date',
      read: (a) => ({ name: `${a.Master_CDF} · ${a.Substation} · ${a.Operating_Voltage_kV} kV`, cap: `${fmt(a.HC_Available_MW, 2)} MW generation hosting capacity (load not published)`, date: a.Updated_Date ? new Date(a.Updated_Date).toISOString().slice(0, 10) : null, id: a.Master_CDF }), dated: (a) => !!a.Updated_Date },
  };
  async function checkFeeder() {
    L.feeder = null; L.feederNote = null;
    const u = $('#f-utility').value, svc = FEEDER_SVC[u];
    if (!L.geo || !u) { renderEstimate(); return; }
    if (!svc) { L.feederNote = `No public hosting-capacity check for ${u} in this form yet; we look it up during the assessment.`; renderEstimate(); return; }
    const p = new URLSearchParams({ where: '1=1', geometry: `${L.geo.lng},${L.geo.lat}`, geometryType: 'esriGeometryPoint', inSR: 4326, spatialRel: 'esriSpatialRelIntersects', distance: 150, units: 'esriSRUnit_Meter', outFields: svc.fields, returnGeometry: 'false', f: 'json' });
    const url = `${svc.url}?${p}`;
    try {
      const d = await fetch(url).then((r) => r.json());
      const fs = (d.features || []).map((x) => x.attributes);
      if (!fs.length) L.feederNote = `No ${u} line within 150 m of the address; the site may be served by another utility.`;
      else { const a = fs.find(svc.dated) || fs[0]; const ids = new Set(fs.map((x) => svc.read(x).id)); L.feeder = Object.assign(svc.read(a), { url, utility: u, feeders: ids.size, at: new Date().toISOString() }); }
    } catch (e) { L.feederNote = `${u} map service did not respond.`; }
    renderEstimate();
  }

  /* ------------------------------------------------------------ uploads */
  function readFile(file, asText) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; asText ? r.readAsText(file) : r.readAsDataURL(file); }); }
  async function thumbOf(file) {
    if (!/^image\//.test(file.type)) return null;
    const url = await readFile(file);
    return new Promise((res) => { const img = new Image(); img.onload = () => { const c = document.createElement('canvas'); const k = 360 / Math.max(img.width, img.height); c.width = img.width * k; c.height = img.height * k; c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); res(c.toDataURL('image/jpeg', 0.7)); }; img.onerror = () => res(null); img.src = url; });
  }
  async function addFiles(kind, files) {
    for (const file of Array.from(files || [])) {
      const f = { name: file.name, size: file.size, type: file.type || '', kind, thumb: await thumbOf(file) };
      if (kind === 'interval') {
        const iv = window.EQ_parseInterval(await readFile(file, true), file.name);
        if (!iv) { flash(kind, `Couldn't find timestamp and kWh or kW columns in ${file.name}. Try the utility's 15-minute CSV export.`); continue; }
        L.interval = iv; L.files.interval = [f];
        flash(kind, `${fmt(iv.count)} intervals, ${iv.minutes}-min, ${iv.start} to ${iv.end} · peak ${fmt(iv.peakKw, 1)} kW (${iv.peakAt}) · load factor ${fmt(iv.loadFactor * 100)}%`, true);
      } else L.files[kind].push(f);
    }
    renderFiles(); renderSteps(); renderEstimate();
  }
  function flash(kind, msg, ok) { const el = $(`[data-list="${kind}"]`); el.dataset.msg = msg; el.dataset.ok = ok ? '1' : ''; }
  function renderFiles() {
    ['bill', 'interval', 'photo'].forEach((k) => {
      const el = $(`[data-list="${k}"]`);
      el.innerHTML = L.files[k].map((f, i) => `<span class="chip">${f.thumb ? `<img src="${f.thumb}" alt="" class="w-6 h-6 object-cover" />` : ''}<span class="font-mono text-[11.5px] max-w-[200px] truncate">${esc(f.name)}</span><span class="text-mute num">${fmt(f.size / 1024)} KB</span><button type="button" class="text-mute hover:text-alert" data-action="remove-file" data-kind="${k}" data-i="${i}" aria-label="Remove ${esc(f.name)}">×</button></span>`).join('')
        + (el.dataset.msg ? `<div class="w-full text-[12px] ${el.dataset.ok ? 'text-steel' : 'text-alert'}">${esc(el.dataset.msg)}</div>` : '');
    });
  }

  /* ------------------------------------------------------------ steps */
  function renderSteps() {
    const done = {
      1: !!$('#f-address').value.trim() && !!$('#f-facility').value.trim(),
      2: !!$('#f-state').value && !!$('#f-utility').value && !!num($('#f-bill').value),
      3: L.files.bill.length + L.files.interval.length + L.files.photo.length > 0,
      4: !!$('#f-name').value.trim() && /.+@.+\..+/.test($('#f-email').value),
    };
    const cur = [1, 2, 3, 4].find((k) => !done[k]) || 4;
    $$('.lf-step').forEach((el) => { const k = +el.dataset.step; el.classList.toggle('done', !!done[k]); el.classList.toggle('cur', k === cur && !done[k]); });
  }

  /* ------------------------------------------------------------ submit -> localStorage -> Site Records */
  function submit(ev) {
    ev.preventDefault();
    const form = $('#lead-form'), err = $('#form-error');
    if (form.website.value) return; // bot trap
    const missing = [['#f-address', 'facility address'], ['#f-facility', 'facility name'], ['#f-state', 'state'], ['#f-utility', 'utility'], ['#f-bill', 'monthly bill'], ['#f-name', 'name'], ['#f-email', 'work email']]
      .filter(([sel]) => !String($(sel).value).trim() || (sel === '#f-email' && !/.+@.+\..+/.test($(sel).value)));
    if (missing.length) { err.hidden = false; err.textContent = `Please add: ${missing.map((m) => m[1]).join(', ')}.`; $(missing[0][0]).focus(); return; }
    err.hidden = true;
    const e = estimate();
    const lead = {
      id: `lead-${Date.now().toString(36)}`, createdAt: new Date().toISOString(), source: UA_NOTE,
      facility: $('#f-facility').value.trim(), type: $('#f-type').value, sqft: num($('#f-sqft').value), hours: $('#f-hours').value, tenure: $('#f-tenure').value,
      der: $$('input[name="der"]:checked').map((x) => x.value),
      address: $('#f-address').value.trim(), geo: L.geo, state: $('#f-state').value, utility: $('#f-utility').value, rate: $('#f-rate').value && $('#f-rate').value !== 'other' ? $('#f-rate').value : null,
      bill: num($('#f-bill').value), peakEntered: num($('#f-peak').value), interval: L.interval,
      files: [...L.files.bill, ...L.files.interval, ...L.files.photo],
      contact: { name: $('#f-name').value.trim(), role: $('#f-role').value, email: $('#f-email').value.trim(), phone: $('#f-phone').value.trim() }, notes: $('#f-notes').value.trim(),
      estimate: e ? { peak: e.peak, basis: e.basis, rateYr: e.rateYr, tariff: e.tkey, typical: e.typical, sysKw: e.sysKw, sysKwh: e.sysKwh, lo: e.lo, hi: e.hi, programs: e.programs } : null,
      feeder: L.feeder, record: L.record,
    };
    const save = (l) => { const all = JSON.parse(localStorage.getItem(LEADS_KEY) || '[]'); all.push(l); localStorage.setItem(LEADS_KEY, JSON.stringify(all)); };
    try { save(lead); }
    catch (x) { try { lead.files.forEach((f) => { f.thumb = null; }); save(lead); } catch (y) { err.hidden = false; err.textContent = 'This browser blocked saving the request. Call or email us instead.'; return; } }
    done(lead);
  }
  function done(lead) {
    $('#lead-form-view').hidden = true;
    const v = $('#lead-done-view'); v.hidden = false; window.scrollTo({ top: 0 });
    const e = lead.estimate, got = [lead.files.some((f) => f.kind === 'bill') && 'bills', lead.interval && 'interval data', lead.files.some((f) => f.kind === 'photo') && 'photos'].filter(Boolean);
    const steps = [['01', 'Lead form completed'], ['02', 'Sales call and optimization'], ['03', 'Site data collection started'], ['04', 'Site data collection completed']];
    const cur = 2; // the form itself is project data, so 01 and 02 count as done
    v.innerHTML = `<div class="eyebrow">Request received</div>
      <h1 class="display text-[40px] leading-tight mt-3">Thanks, ${esc(lead.contact.name.split(' ')[0])}. We'll be in touch within one business day.</h1>
      <p class="text-[15px] text-ink2 mt-3">${esc(lead.facility)} · ${esc(lead.geo ? lead.geo.matched : lead.address)}</p>
      <div class="tracker mt-10">${steps.map(([n, l], i) => `<div class="${i < cur ? 'done' : i === cur ? 'cur' : ''}"><div class="n num">${n}${i < cur ? ' ✓' : ''}</div><div class="l">${l}</div></div>`).join('')}</div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mt-10">
        <div class="panel p-6"><div class="eyebrow">Your rough range</div>
          ${e ? `<div class="est-big num mt-3">$${fmt(Math.round(e.lo / 1000) * 1000)} – $${fmt(Math.round(e.hi / 1000) * 1000)}</div><div class="text-[13px] text-ink2 mt-1">per year · ${fmt(e.sysKw)} kW / ${fmt(e.sysKwh)} kWh · peak ${fmt(e.peak)} kW ${esc(e.basis)}</div>` : '<div class="text-[13px] text-ink2 mt-3">We\'ll model it from your bill.</div>'}
        </div>
        <div class="panel p-6"><div class="eyebrow">What happens next</div>
          <ol class="mt-3 text-[13.5px] text-ink2 space-y-2 list-decimal pl-5">
            <li>A call to understand operations and how you'd use the battery (peak shaving, backup or both).</li>
            <li>${got.length ? `We've got your ${got.join(', ')}. We'll ask only for what's missing.` : 'We\'ll ask for 12 months of bills and 15-minute interval data.'}</li>
            <li>System options, projected savings and payback, modeled on your data.</li>
          </ol></div>
      </div>
      <div class="flex flex-wrap gap-3 mt-10">
        <a class="btn btn-primary h-11 px-5 text-[14px] justify-between gap-6" href="../index.html${lead.geo ? `#/site/${encodeURIComponent(lead.id)}` : ''}">${lead.geo ? 'Open the project in EQORE Site Records' : 'Open EQORE Site Records (location to confirm)'}<span>→</span></a>
        <a class="btn btn-secondary h-11 px-5 text-[14px]" href="./">Submit another facility</a>
      </div>
      <p class="text-[11.5px] text-mute mt-3">The project link is for this demo: it opens the internal tool with this request as a new project at step 01.</p>`;
  }

  /* ------------------------------------------------------------ events */
  document.addEventListener('click', (ev) => {
    const a = ev.target.closest('[data-action]'); if (!a) return;
    if (a.dataset.action === 'locate') locate();
    if (a.dataset.action === 'remove-file') { const k = a.dataset.kind; L.files[k].splice(+a.dataset.i, 1); if (k === 'interval') { L.interval = null; $(`[data-list="interval"]`).dataset.msg = ''; } renderFiles(); renderSteps(); renderEstimate(); }
  });
  document.addEventListener('change', (ev) => {
    const t = ev.target;
    if (t.matches('[data-upload]')) { addFiles(t.dataset.upload, t.files); t.value = ''; return; }
    if (t.id === 'f-state') { fillUtilities(); checkFeeder(); }
    if (t.id === 'f-utility') { fillRates(); checkFeeder(); }
    renderSteps(); renderEstimate();
  });
  document.addEventListener('input', () => { renderSteps(); renderEstimate(); });
  $('#f-address').addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); locate(); } });
  $('#f-address').addEventListener('blur', () => { if ($('#f-address').value.trim() && (!L.geo || L.lastAddr !== $('#f-address').value.trim())) { L.lastAddr = $('#f-address').value.trim(); locate(); } });
  ['dragover', 'dragleave', 'drop'].forEach((evn) => document.addEventListener(evn, (ev) => {
    const z = ev.target.closest('[data-drop]'); if (!z) return; ev.preventDefault();
    z.classList.toggle('over', evn === 'dragover');
    if (evn === 'drop') addFiles(z.dataset.drop, ev.dataTransfer.files);
  }));
  $('#lead-form').addEventListener('submit', submit);

  fillStates(); fillUtilities(); renderFiles(); renderSteps(); renderEstimate();
})();
