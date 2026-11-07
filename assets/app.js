/* =============================================================================
   EQORE Site Records — application
   Vanilla JS SPA: hash routing, delegated events, Leaflet, Chart.js.
   ============================================================================= */
(function () {
  'use strict';

  const STORE_KEY = 'eqore.records.v9';
  const S = {
    sites: loadSites(),
    route: { view: 'pipeline', id: null },
    filters: { q: '', region: 'all', stage: 'all' },
    sort: { key: 'intake', dir: 'asc' },
    mapBase: 'streets',
    vaultFilter: 'all',
    chart: { day: 'peak', tab: 'interval', threshold: {} },
  };
  const R = { map: null, pinLayer: null, clusterLayer: null, zoneLayer: null, baseLayers: {}, satThumb: null, loadChart: null, hoverTimer: null };

  function loadSites() {
    let sites = null;
    try { const raw = localStorage.getItem(STORE_KEY); if (raw) { const v = JSON.parse(raw); if (Array.isArray(v) && v.length) sites = v; } } catch (e) { /* storage unavailable */ }
    sites = sites || EQ.buildSites();
    return sites.concat(EQ.buildLeadSites(new Set(sites.map((x) => x.id)))); // new lead-form submissions
  }
  function persist() { try { localStorage.setItem(STORE_KEY, JSON.stringify(S.sites)); } catch (e) { /* ignore */ } }
  const site = (id) => S.sites.find((s) => s.id === id);
  const REF = () => EQ.REF || {};

  /* ---------------------------------------------------------------- utils */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n, d = 0) => Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  const money = (n) => '$' + fmt(Math.round(n));
  const icons = () => { if (window.lucide) lucide.createIcons({ attrs: { 'stroke-width': 1.75 } }); };
  const ico = (name, cls = 'w-3.5 h-3.5') => `<i data-lucide="${name}" class="${cls}"></i>`;
  const nowISO = () => new Date().toISOString();
  const fmtDate = (iso) => new Date(iso.length === 10 ? iso + 'T12:00:00' : iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const fmtDT = (iso) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  function relTime(iso) {
    const diff = (Date.now() - new Date(iso).getTime()) / 1000;
    if (diff < 0 || diff > 86400 * 3) return fmtDT(iso);
    if (diff < 60) return 'just now';
    if (diff < 3600) return Math.floor(diff / 60) + ' min ago';
    if (diff < 86400) return Math.floor(diff / 3600) + ' h ago';
    return Math.floor(diff / 86400) + ' d ago';
  }
  function hashStr(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) { let a = seed; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const extLink = (url, label) => url ? `<a class="link" href="${esc(url)}" target="_blank" rel="noopener">${esc(label)}</a>` : esc(label);

  /* ------------------------------------------------------- scoring */
  function dpStatus(dp) {
    if (dp.value == null) return dp.rfi ? 'requested' : 'missing';
    if (dp.requiresSignoff && !dp.verified) return 'review';
    return 'ok';
  }
  function sectionScores(s) {
    return EQ.SECTIONS.map((p) => {
      const dps = s.dps.filter((d) => d.sec === p.key);
      const earned = dps.filter((d) => dpStatus(d) === 'ok').reduce((a, d) => a + d.pts, 0);
      return Object.assign({}, p, { earned, dps, done: dps.filter((d) => dpStatus(d) === 'ok').length });
    });
  }
  const secName = (k) => (EQ.SECTIONS.find((x) => x.key === k) || EQ.FIELD).name;
  const score = (s) => sectionScores(s).reduce((a, p) => a + p.earned, 0);
  const fieldActive = (s) => EQ.stageIdx(s.stage) >= EQ.stageIdx(EQ.FIELD.from);
  const relevant = (s) => s.dps.filter((d) => d.sec !== 'field' || fieldActive(s));
  const openItems = (s) => relevant(s).filter((d) => dpStatus(d) !== 'ok');
  const criticalOpen = (s) => relevant(s).filter((d) => d.severity === 'critical' && ['missing', 'requested'].includes(dpStatus(d)));
  /* Intake steps (lead form -> site data collection). Steps 3 and 4 follow the data; 1 and 2 are set by the team. */
  const openBy = (s, owner) => relevant(s).filter((d) => d.owner === owner && ['missing', 'requested'].includes(dpStatus(d)));
  // Any data from the customer: an upload, an interval file, or a facility item entered from the customer (call, email).
  const hasCustomerData = (s) => !!s.interval || s.files.some((f) => f.origin === 'Customer-provided')
    || s.dps.some((d) => d.srcType === 'customer' || (d.owner === 'fm' && d.srcType === 'manual' && d.value != null));
  function intakeIdx(s) {
    if (s.stage && s.stage !== 'intake') return EQ.INTAKE.length; // past intake: all four steps done
    const fromData = hasCustomerData(s) ? (openBy(s, 'fm').length ? 2 : 3) : -1;
    return Math.max(s.intake ?? 0, fromData);
  }
  function nextAction(s) {
    const i = intakeIdx(s), fm = openBy(s, 'fm').length, ut = openBy(s, 'utility').length;
    const rv = relevant(s).filter((d) => dpStatus(d) === 'review').length, pl = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
    const others = [rv && `${rv} to confirm`, ut && `${ut} from ${s.utility}`].filter(Boolean);
    if (s.stage !== 'intake') {
      const g = gateChecks(s);
      if (!g.next) return { text: 'Operating', more: [], done: true };
      const open = g.checks.filter((c) => !c.pass).length;
      return g.pass ? { text: `Ready to advance to ${EQ.STAGES[g.next].label}`, more: others, done: true }
        : { text: `${pl(open, 'gate check')} open for ${EQ.STAGES[g.next].label}`, more: others };
    }
    if (i === 0) return { text: 'Schedule sales call', more: others };
    if (i === 1) return { text: `Send data request · ${pl(fm, 'item')}`, more: others };
    if (fm) return { text: `Waiting on facility · ${pl(fm, 'item')}`, more: others };
    if (rv) return { text: `Confirm ${pl(rv, 'value')}`, more: others.slice(1) };
    if (ut) return { text: `Request ${pl(ut, 'item')} from ${s.utility}`, more: [] };
    return { text: 'Ready for design review', more: [], done: true };
  }
  const stageIdx = (s) => EQ.stageIdx(s.stage);
  function health(s) {
    if (s.stage === 'operate') return 'live';
    if (criticalOpen(s).length) return 'crit';
    return score(s) >= 85 ? 'ok' : 'gap';
  }
  const HEALTH = {
    live: { label: 'Operating', cls: 'ink' },
    ok:   { label: 'Ready for next step', cls: 'ok' },
    gap:  { label: 'Open items', cls: 'gap' },
    crit: { label: 'Blocked', cls: 'crit' },
  };
  const verifiedCount = (s) => relevant(s).filter((d) => d.value != null && d.verified).length;
  const sysOf = (s) => s.system || null;
  const rec = (s) => EQ.REC[s.apn] || { permits: [], benchmark: [] };
  const latestKwh = (s) => EQ.benchLatest(s);

  /* Stage gates: what must be true to advance to the next EQORE step. */
  function gateChecks(s) {
    const ok = (k) => dpStatus(s.dps.find((d) => d.key === k)) === 'ok';
    const doc = (k) => s.docs.find((x) => x.key === k) || {};
    const done = (k) => doc(k).status === 'complete' && !!doc(k).evidence;
    const sub = (k) => doc(k).status === 'submitted' || done(k);
    const secOk = (sec) => s.dps.filter((d) => d.sec === sec).every((d) => dpStatus(d) === 'ok');
    const nxt = EQ.STAGE_ORDER[stageIdx(s) + 1];
    let checks = [];
    switch (s.stage) {
      case 'intake':
        checks = [
          { label: 'Site data collection completed (step 04)', pass: intakeIdx(s) === 3 },
          { label: '12 months of 15-min interval data', pass: ok('interval') },
          { label: 'Rate schedule confirmed from bill', pass: ok('tariff') },
          { label: '12-month peak demand established', pass: ok('peakDemand') },
          { label: 'Operating mode agreed (non-export / backup)', pass: ok('opMode') },
        ]; break;
      case 'proposal':
        checks = [
          { label: 'Equipment location confirmed', pass: ok('location') },
          { label: 'Tie-in: main OCPD, POI and fault duty confirmed', pass: ok('mainBreaker') && ok('spareBreaker') && ok('faultCurrent') },
          { label: 'Separation distances confirmed', pass: ok('setback') },
          { label: 'Fire department access reviewed', pass: ok('fire') },
          { label: 'Electrical, load and siting data confirmed', pass: secOk('elec') && secOk('load') && secOk('site') },
          { label: 'Design readiness ≥ 85 with no blockers', pass: score(s) >= 85 && !criticalOpen(s).length },
        ]; break;
      case 'design':
        checks = [
          { label: 'Permit plan set complete (incl. HMA, commissioning plan, draft EOP)', pass: s.docs.filter((d) => d.group === 'Permit plan set').every((d) => done(d.key)) },
          { label: 'Building, electrical, fire permits submitted', pass: ['bldg', 'elec', 'firep'].every(sub) },
          { label: 'Interconnection application filed', pass: sub('iaapp') },
        ]; break;
      case 'interconnection':
        checks = [
          { label: 'Building, electrical, fire permits issued', pass: ['bldg', 'elec', 'firep'].every(done) },
          { label: 'Interconnection agreement executed', pass: done('iaok') },
          { label: 'Electrical data confirmed for the field', pass: secOk('elec') },
          { label: 'Mobilization items captured (delivery, pad, conduit, shutdown, access)', pass: ['delivery', 'pad', 'conduit', 'shutdown', 'access'].every(ok) },
        ]; break;
      case 'install':
        checks = [
          { label: 'Final inspections & AHJ acceptance', pass: done('insp') },
          { label: 'Utility witness test', pass: done('witness') },
          { label: 'Commissioning tests recorded; report & as-builts', pass: ok('cxtests') && done('cxrpt') },
          { label: 'O&M manual and final emergency operations plan', pass: done('om') && done('eop') },
          { label: 'Signage, labels, SDS posted; fire department walkthrough', pass: done('signage') && done('fdwalk') },
          { label: s.region === 'ma' ? 'Authorization to Interconnect' : 'Permission to operate', pass: done('pto') },
        ]; break;
      default: checks = [];
    }
    return { next: nxt, checks, pass: checks.length > 0 && checks.every((c) => c.pass) };
  }
  /* ------------------------------------------------------- economics */


  /* Billing demand for one tariff component over a 96-point day: max inside its TOU window,
     or for Eversource-style rates the greater of peak-window max and a fraction of the all-hours max. */






  /* ------------------------------------------------------- UI atoms */
  const tag = (cls, text) => `<span class="tag ${cls}">${esc(text)}</span>`;
  function statusTag(d) {
    const st = dpStatus(d);
    if (st === 'ok') return tag(d.verified ? 'ok' : 'muted', d.verified ? 'Confirmed' : 'Unconfirmed');
    if (st === 'review') return tag('ok', 'Needs confirmation');
    if (st === 'requested') return tag('gap', `Requested ${relTime(d.rfi.at)}`);
    return tag(d.severity === 'critical' ? 'crit' : 'gap', d.severity === 'critical' ? 'Missing — blocks next step' : 'Missing');
  }
  function segbar(s) {
    return `<div class="segbar">${sectionScores(s).map((p) => {
      const r = p.earned / p.max; const col = r === 1 ? 'var(--steel)' : r >= 0.7 ? '#b07a20' : 'var(--alert)';
      return `<div style="flex:${p.max}" title="${p.name}: ${p.done}/${p.dps.length}"><i style="width:${r * 100}%;background:${col}"></i></div>`;
    }).join('')}</div>`;
  }
  const avatar = (name, color = '#06162b', size = 26) => `<span class="inline-grid place-items-center rounded-full text-white shrink-0" style="width:${size}px;height:${size}px;background:${color};font-size:${Math.round(size * 0.38)}px;font-weight:500">${esc(EQ.initials(name))}</span>`;
  const confLabel = { verified: 'Verified source', high: 'High confidence', medium: 'Medium confidence', low: 'Low confidence', manual: 'Manual entry' };
  const srcIcon = { customer: 'user', meter: 'gauge', public: 'landmark', utility: 'radio-tower', gis: 'map', spec: 'file-text', manual: 'pencil' };
  const ftype = { pdf: 'PDF', csv: 'CSV', xlsx: 'XLSX', img: 'JPG', gis: 'GEO' };
  const ficon = (t) => `<span class="ficon">${ftype[t] || 'FILE'}</span>`;
  const stageLabel = (k) => EQ.STAGES[k].label;
  // Where a site is now: its intake step while in intake, otherwise its delivery step.
  const stepLabel = (s) => (s.stage === 'intake' ? EQ.INTAKE[intakeIdx(s)].label : EQ.STAGES[s.stage].label);

  /* ---------------------------------------------------------------- toast & modal */
  function toast(msg) {
    const el = document.createElement('div');
    el.className = 'toast'; el.innerHTML = `<div>${msg}</div>`;
    $('#toast-root').appendChild(el);
    setTimeout(() => { el.style.transition = 'opacity .3s'; el.style.opacity = '0'; }, 3400);
    setTimeout(() => el.remove(), 3800);
  }
  function openModal({ title, subtitle = '', body, footer = '', size = 'max-w-2xl', onMount }) {
    closeModal();
    const wrap = document.createElement('div');
    wrap.className = 'modal-backdrop'; wrap.id = 'modal';
    wrap.innerHTML = `
      <div class="modal-panel ${size}" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div class="flex items-start gap-4 px-6 pt-5 pb-4 border-b border-line2">
          <div class="min-w-0 flex-1">
            <h2 id="modal-title" class="text-[19px] display">${title}</h2>
            ${subtitle ? `<p class="text-[13px] text-ink2 mt-1">${subtitle}</p>` : ''}
          </div>
          <button class="btn btn-ghost btn-sm !px-2" data-action="close-modal" aria-label="Close">${ico('x', 'w-4 h-4')}</button>
        </div>
        <div class="px-6 py-5">${body}</div>
        ${footer ? `<div class="px-6 py-4 border-t border-line2 bg-paper flex flex-wrap items-center justify-end gap-2">${footer}</div>` : ''}
      </div>`;
    wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) closeModal(); });
    $('#modal-root').appendChild(wrap);
    document.body.style.overflow = 'hidden';
    icons();
    if (onMount) onMount(wrap);
  }
  function closeModal() { const m = $('#modal'); if (m) { m.remove(); document.body.style.overflow = ''; } }

  /* =================================================================
     ROUTING
     ================================================================= */
  function parseHash() {
    const h = location.hash.replace(/^#\/?/, '');
    let m = h.match(/^site\/([\w-]+)/); if (m && site(m[1])) return { view: 'site', id: m[1] };
    m = h.match(/^responder\/([\w-]+)/); if (m && site(m[1])) return { view: 'responder', id: m[1] };
    return { view: 'pipeline', id: null };
  }
  function go(id) { location.hash = id ? `#/site/${id}` : '#/'; }
  function onRoute() {
    S.route = parseHash();
    hideMapHover(); closeModal();
    const v = S.route.view;
    $('#app-header').classList.toggle('hidden', v === 'responder');
    ['pipeline', 'site', 'responder'].forEach((x) => $(`#view-${x}`).classList.toggle('hidden', x !== v));
    renderCrumbs(); renderStageRail();
    if (v === 'site') { renderSite(site(S.route.id)); window.scrollTo({ top: 0 }); }
    else if (v === 'responder') { destroySiteWidgets(); renderResponder(site(S.route.id)); window.scrollTo({ top: 0 }); }
    else { destroySiteWidgets(); renderPipeline(); setTimeout(() => { if (R.map) { R.map.invalidateSize(); fitRegion(S.mapRegion || S.filters.region, false); } }, 60); }
    icons();
  }
  function renderCrumbs() {
    const c = $('#crumbs');
    if (S.route.view === 'site') {
      const s = site(S.route.id);
      c.innerHTML = `<span class="w-px h-5 bg-line mr-1"></span><a href="#/" class="hover:text-ink">Projects</a><span class="text-line">/</span><span class="text-ink truncate">${esc(s.name)}</span>`;
    } else c.innerHTML = `<span class="w-px h-5 bg-line mr-1"></span><span class="text-ink">Projects</span>`;
  }
  function renderStageRail() {
    const base = S.sites.filter((s) => S.filters.region === 'all' || s.region === S.filters.region);
    const cnt = (k) => (k === 'all' ? base.length : base.filter((s) => s.stage === k).length);
    $('#stage-rail').innerHTML = `<button class="step-tab active" data-action="stage-filter" data-stage="all">All projects <span class="c">${cnt('all')}</span></button>`;
  }

  /* ---------------------------------------------------------- filtering */
  function matchesQuery(s, q) {
    if (!q) return true;
    return [s.name, s.address, s.city, s.apn, s.tenant, s.sector, s.neighborhood].join(' ').toLowerCase().includes(q.toLowerCase());
  }
  const filteredSites = () => S.sites.filter((s) => (S.filters.region === 'all' || s.region === S.filters.region) && (S.filters.stage === 'all' || s.stage === S.filters.stage) && matchesQuery(s, S.filters.q));
  function sortedSites(list) {
    const k = S.sort.key, dir = S.sort.dir === 'asc' ? 1 : -1;
    const val = (s) => ({ name: s.name, sector: s.sector, kwh: (latestKwh(s) || {}).kwh || 0, score: score(s), intake: intakeIdx(s) * 1000 - score(s), risks: s.findings.filter((f) => f.sev === 'risk').length }[k] ?? s.name);
    return list.slice().sort((a, b) => { const x = val(a), y = val(b); return (x > y ? 1 : x < y ? -1 : 0) * dir; });
  }
  /* =================================================================
     PROJECTS (pipeline)
     ================================================================= */
  function renderPipeline() {
    const root = $('#view-pipeline');
    if (!root.dataset.built) {
      root.innerHTML = `
        <section class="flex flex-wrap items-end gap-6">
          <div class="min-w-0 flex-1"><h1 class="display text-[34px] leading-tight">Projects</h1></div>
          <p class="text-[12.5px] text-ink2 max-w-md">San Francisco leads come from DataSF benchmarking and permits; the rest from the EQORE facility list. Every site has a record built from its address alone (parcel, zoning, hazards, fire authority, utility). Click any value to see its source.</p>
        </section>
        <section class="grid grid-cols-1 xl:grid-cols-12 gap-6">
          <div class="xl:col-span-12 panel">
            <div class="panel-head flex-wrap">
              <div class="min-w-0 flex-1"><div class="eyebrow">Map · states and counties</div></div>
              <div class="flex text-[12px] border border-line" role="group" aria-label="Region">
                ${[['all', 'United States'], ['ca', 'California'], ['ma', 'Massachusetts'], ['nh', 'New Hampshire']].map(([k, l]) => `<button class="px-3 h-7" data-action="map-jump" data-region="${k}">${l}</button>`).join('')}
              </div>
              <div class="flex text-[12px] border border-line" role="group" aria-label="Base map">
                <button class="px-3 h-7" data-action="map-base" data-base="streets">Map</button><button class="px-3 h-7" data-action="map-base" data-base="satellite">Aerial</button>
              </div>
            </div>
            <div class="relative">
              <div id="pipeline-map" class="h-[440px] lg:h-[520px] w-full"></div>
              <div id="map-hover" class="hidden-card"></div>
              <div class="absolute left-3 bottom-3 z-[500] bg-white border border-line px-3 py-2 text-[11px] text-ink2 flex flex-wrap gap-x-4 gap-y-1">
                <span class="flex items-center gap-1.5"><span class="inline-block w-3 h-3" style="background:rgba(179,200,228,.6);border:1px solid #9aa0a9"></span>EQORE state</span>
                <span class="flex items-center gap-1.5"><span class="inline-block w-3 h-3" style="background:rgba(60,99,144,.45);border:1px solid #446c87"></span>County with leads</span>
                ${[['ok', 'Ready for next step'], ['gap', 'Open items'], ['crit', 'Blocked']].map(([c, l]) => `<span class="flex items-center gap-1.5"><span class="eq-pin ${c} !w-2.5 !h-2.5 !border-0 !shadow-none"></span>${l}</span>`).join('')}
              </div>
            </div>
          </div>
        </section>
        <section class="panel" id="directory"></section>`;
      root.dataset.built = '1';
      initMap();
    }
    renderDirectory(); refreshMap(); syncMapButtons();
  }
  function renderDirectory() {
    const list = sortedSites(filteredSites());
    const th = (k, label) => `<th class="sortable" data-action="sort" data-key="${k}">${label}${S.sort.key === k ? (S.sort.dir === 'asc' ? ' ↑' : ' ↓') : ''}</th>`;
    const f = S.filters, chips = [];
    if (f.q) chips.push(`<button class="stamp" data-action="clear-filter" data-f="q">“${esc(f.q)}” ×</button>`);
    if (f.region !== 'all') chips.push(`<button class="stamp" data-action="clear-filter" data-f="region">${esc(EQ.REGIONS[f.region].short)} ×</button>`);
    if (f.stage !== 'all') chips.push(`<button class="stamp" data-action="clear-filter" data-f="stage">${esc(stageLabel(f.stage))} ×</button>`);
    $('#directory').innerHTML = `
      <div class="panel-head flex-wrap"><div class="eyebrow">Facilities</div><span class="text-[12px] text-mute">${list.length} of ${S.sites.length}</span>
        <div class="flex flex-wrap gap-1.5">${chips.join('')}</div><div class="flex-1"></div>
        <input data-role="mobile-search" type="search" value="${esc(f.q)}" placeholder="Search" class="field h-8 px-2.5 text-[13px] sm:hidden w-full" />
        <button class="btn btn-secondary btn-sm" data-action="export-directory">Export CSV</button></div>
      <div class="overflow-x-auto"><table class="tbl w-full min-w-[1100px]">
        <thead><tr>${th('name', 'Facility')}${th('intake', 'Needs action')}${th('sector', 'Type · size')}${th('kwh', 'Grid use')}<th>Overview</th>${th('risks', 'Risks')}${th('score', 'Design readiness')}</tr></thead>
        <tbody>${list.length ? list.map(rowHTML).join('') : `<tr><td colspan="7" class="!py-12 text-center text-mute">No facilities match. <button class="link" data-action="clear-all-filters">Clear filters</button></td></tr>`}</tbody>
      </table></div>`;
  }
  function overviewDots(s) {
    return `<div class="flex flex-wrap gap-x-3 gap-y-1">${EQ.AREAS.map((a) => { const x = areaStatus(s, a.key); return `<span class="tag ${EQ.STATUS[x.status].cls}" title="${esc(a.name)}: ${esc(x.status)} — ${esc(x.note)}">${esc(a.name.split(' ')[0])}</span>`; }).join('')}</div>`;
  }
  function intakeHTML(s) {
    const cur = intakeIdx(s), a = nextAction(s);
    return `<div class="tracker">${EQ.INTAKE.map((t, i) => `<button class="text-left ${i < cur ? 'done' : i === cur ? 'cur' : ''}" data-action="set-intake" data-i="${i}" title="${t.auto ? 'Moves automatically when the facility sends data' : i < 2 && hasCustomerData(s) ? 'Completed: the facility has sent data' : 'Click to set'}"><div class="n num">${t.n}${i < cur ? '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-label="completed"><path d="M20 6 9 17l-5-5"/></svg>' : ''}</div><div class="l">${esc(t.label)}</div></button>`).join('')}</div>
      <div class="text-[12px] text-ink2 mt-3">${s.stage !== 'intake' ? `Intake complete · now in <span class="text-ink">${esc(EQ.STAGES[s.stage].label)}</span> · ` : ''}Next: <span class="text-ink">${esc(a.text)}</span>${a.more.length ? ` · ${esc(a.more.join(' · '))}` : ''}</div>`;
  }
  function actionCell(s) {
    const a = nextAction(s), st = EQ.INTAKE[intakeIdx(s)];
    return `<div class="text-[13px] ${a.done ? 'text-steel' : 'text-ink'}">${esc(a.text)}</div>
      ${a.more.length ? `<div class="text-[11.5px] text-ink2">${esc(a.more.join(' · '))}</div>` : ''}
      <div class="text-[11.5px] text-mute mt-0.5">${st ? `<span class="num">${st.n}</span> ${esc(st.label)}` : `Delivery · ${esc(EQ.STAGES[s.stage].label)}`}</div>`;
  }
  function rowHTML(s) {
    const sc = score(s), h = health(s), l = latestKwh(s), risks = s.findings.filter((f) => f.sev === 'risk').length;
    return `<tr data-action="open-site" data-id="${s.id}" data-row="${s.id}">
      <td><div class="text-ink font-medium">${esc(s.name)}</div><div class="text-[12px] text-ink2">${esc(s.address)}, ${esc(s.city)} · APN ${esc(s.apn)}${s.apnCandidate ? ' (candidate)' : ''}</div><div class="text-[11.5px] text-mute">${esc(s.tenant)}</div></td>
      <td class="min-w-[210px]">${actionCell(s)}</td>
      <td><div>${esc(s.sector)}</div><div class="text-[11.5px] text-mute num">${fmt(s.floorArea)} sf · built ${s.yearBuilt || '—'}</div></td>
      <td><div class="num">${l ? fmt(l.kwh / 1e6, 2) + ' GWh' : '—'}<div class="text-[11.5px] text-mute">${l ? l.year : ''}</div></div></td>
      <td class="min-w-[220px]">${overviewDots(s)}</td>
      <td class="num ${risks ? 'text-alert' : 'text-mute'}">${risks}</td>
      <td class="min-w-[180px]"><div class="flex items-baseline justify-between mb-1.5"><span class="num text-[15px] text-ink">${sc}</span>${tag(HEALTH[h].cls, HEALTH[h].label)}</div>${segbar(s)}</td>
    </tr>`;
  }
  /* ---------------------------------------------------------------- map */
  const US_BOUNDS = [[24.4, -125.0], [49.5, -66.9]];
  const TOPO_URL = 'https://cdn.jsdelivr.net/npm/us-atlas@3.0.1/counties-10m.json';
  function initMap() {
    const map = L.map('pipeline-map', { zoomControl: false, attributionControl: true, minZoom: 3 });
    L.control.zoom({ position: 'topright' }).addTo(map);
    R.baseLayers.streets = L.layerGroup([
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, maxNativeZoom: 16, attribution: 'Tiles &copy; Esri · Boundaries: US Census via us-atlas' }),
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, maxNativeZoom: 16 }),
    ]);
    R.baseLayers.satellite = L.layerGroup([
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Imagery &copy; Esri, Maxar' }),
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, opacity: 0.85 }),
    ]);
    R.baseLayers.streets.addTo(map);
    map.createPane('bounds'); map.getPane('bounds').style.zIndex = 350;
    R.stateLayer = L.layerGroup().addTo(map);
    R.countyLayer = L.layerGroup();
    R.pinLayer = L.layerGroup().addTo(map);
    R.clusterLayer = L.layerGroup().addTo(map);
    R.stateBounds = {};
    R.map = map;
    map.on('zoomend', updateZoomMode);
    map.on('movestart', hideMapHover);
    const hov = $('#map-hover');
    hov.addEventListener('mouseenter', () => clearTimeout(R.hoverTimer));
    hov.addEventListener('mouseleave', scheduleHideHover);
    map.fitBounds(US_BOUNDS);
    loadBoundaries();
  }
  async function loadBoundaries() {
    if (!window.topojson) return;
    try {
      const topo = R.topo || (R.topo = await fetch(TOPO_URL).then((r) => r.json()));
      const opFips = Object.values(EQ.STATES).map((x) => x.fips);
      const leadsByCounty = {}; S.sites.forEach((s) => { leadsByCounty[s.countyFips] = (leadsByCounty[s.countyFips] || 0) + 1; });
      L.geoJSON(topojson.feature(topo, topo.objects.states), {
        pane: 'bounds', interactive: true,
        style: (f) => ({ color: '#9aa0a9', weight: 0.8, fillColor: '#b3c8e4', fillOpacity: opFips.includes(f.id) ? 0.35 : 0 }),
        onEachFeature: (f, layer) => {
          if (opFips.includes(f.id)) R.stateBounds[f.id] = layer.getBounds();
          const n = S.sites.filter((s) => s.countyFips.startsWith(f.id)).length;
          layer.bindTooltip(`${esc(f.properties.name)}${opFips.includes(f.id) ? ` · EQORE state · ${n} lead${n === 1 ? '' : 's'}` : ''}`, { sticky: true, className: 'eq-zone-label' });
        },
      }).addTo(R.stateLayer);
      const counties = topojson.feature(topo, topo.objects.counties);
      counties.features = counties.features.filter((f) => opFips.includes(String(f.id).slice(0, 2)));
      L.geoJSON(counties, {
        pane: 'bounds',
        style: (f) => ({ color: '#446c87', weight: leadsByCounty[f.id] ? 1.4 : 0.5, fillColor: '#3c6390', fillOpacity: leadsByCounty[f.id] ? 0.35 : 0 }),
        onEachFeature: (f, layer) => layer.bindTooltip(`${esc(f.properties.name)} County${leadsByCounty[f.id] ? ` · ${leadsByCounty[f.id]} lead${leadsByCounty[f.id] > 1 ? 's' : ''}` : ''}`, { sticky: true, className: 'eq-zone-label' }),
      }).addTo(R.countyLayer);
      R.countyCentroids = {};
      counties.features.filter((f) => leadsByCounty[f.id]).forEach((f) => { R.countyCentroids[f.id] = L.geoJSON(f).getBounds().getCenter(); });
      refreshMap(); updateZoomMode();
    } catch (e) { /* boundaries are optional */ }
  }
  function updateZoomMode() {
    const z = R.map.getZoom();
    if (z >= 5) R.countyLayer.addTo(R.map); else R.map.removeLayer(R.countyLayer);
    if (z < 10) { R.map.removeLayer(R.pinLayer); R.clusterLayer.addTo(R.map); } else { R.map.removeLayer(R.clusterLayer); R.pinLayer.addTo(R.map); }
  }
  function refreshMap() {
    if (!R.map) return;
    R.pinLayer.clearLayers(); R.clusterLayer.clearLayers();
    const list = filteredSites();
    list.forEach((s) => {
      const m = L.marker([s.lat, s.lng], { icon: L.divIcon({ className: '', html: `<div class="eq-pin ${health(s)}" data-pin="${s.id}"></div>`, iconSize: [16, 16], iconAnchor: [8, 8] }), title: s.name, alt: s.name, riseOnHover: true });
      m.on('mouseover', () => showMapHover(s)); m.on('mouseout', scheduleHideHover); m.on('click', () => go(s.id));
      m.addTo(R.pinLayer);
    });
    const byCounty = {};
    list.forEach((s) => { (byCounty[s.countyFips] = byCounty[s.countyFips] || []).push(s); });
    Object.entries(byCounty).forEach(([fips, ss]) => {
      const c = (R.countyCentroids || {})[fips] || L.latLngBounds(ss.map((s) => [s.lat, s.lng])).getCenter();
      L.marker(c, { icon: L.divIcon({ className: '', html: `<div class="eq-cluster">${ss.length}</div>`, iconSize: [52, 52], iconAnchor: [26, 26] }) })
        .bindTooltip(`${esc(ss[0].county)} County, ${ss[0].state} · ${ss.length} lead${ss.length > 1 ? 's' : ''}`, { direction: 'top', offset: [0, -26] })
        .on('click', () => { R.map.fitBounds(L.latLngBounds(ss.map((s) => [s.lat, s.lng])), { padding: [80, 80], maxZoom: 13 }); }).addTo(R.clusterLayer);
    });
    updateZoomMode();
  }
  function fitRegion(region, animate = true) {
    if (!R.map) return;
    if (region === 'all') R.map.fitBounds(US_BOUNDS, { animate });
    else {
      const b = (R.stateBounds || {})[EQ.STATES[region].fips];
      if (b) R.map.fitBounds(b, { padding: [20, 20], animate });
      else { const pts = S.sites.filter((s) => s.region === region).map((s) => [s.lat, s.lng]); if (pts.length) R.map.fitBounds(pts, { padding: [60, 60], maxZoom: 11, animate }); }
    }
    S.mapRegion = region; syncMapButtons();
  }
  function syncMapButtons() {
    $$('[data-action="map-jump"]').forEach((b) => { const on = b.dataset.region === (S.mapRegion || 'all'); b.classList.toggle('bg-ink', on); b.classList.toggle('text-white', on); });
    $$('[data-action="map-base"]').forEach((b) => { const on = b.dataset.base === S.mapBase; b.classList.toggle('bg-ink', on); b.classList.toggle('text-white', on); });
  }
  function showMapHover(s) {
    clearTimeout(R.hoverTimer);
    const el = $('#map-hover'), l = latestKwh(s), pe = EQ.peakEstimate(s), top = s.findings.find((f) => f.sev === 'risk');
    el.innerHTML = `<div class="bg-white border border-line shadow-pop">
      <div class="px-4 pt-3.5 pb-3 border-b border-line2"><div class="text-[11px] text-mute num">${esc(stepLabel(s))} · APN ${esc(s.apn)}</div>
        <div class="text-[15px] text-ink mt-0.5">${esc(s.name)}</div><div class="text-[12px] text-ink2">${esc(s.address)}, ${esc(s.city)}</div></div>
      <dl class="grid grid-cols-2 gap-x-4 gap-y-2.5 px-4 py-3 text-[12px]">
        <div><dt class="text-mute">Type</dt><dd class="text-ink">${esc(s.sector)}</dd></div>
        <div><dt class="text-mute">Floor area</dt><dd class="text-ink num">${fmt(s.floorArea)} sf</dd></div>
        <div><dt class="text-mute">Grid use</dt><dd class="text-ink num">${l ? `${fmt(l.kwh / 1e6, 2)} GWh (${l.year})` : '—'}</dd></div>
        <div><dt class="text-mute">Est. peak</dt><dd class="text-ink num">${pe ? `${fmt(pe.lo)}–${fmt(pe.hi)} kW` : '—'}</dd></div>
      </dl>
      <div class="px-4 pb-3">${overviewDots(s)}${top ? `<div class="text-[12px] text-alert mt-2">${esc(top.text)}</div>` : ''}</div>
      <button class="w-full flex items-center justify-between px-4 h-10 bg-ink text-white text-[13px]" data-action="open-site" data-id="${s.id}">Open site record <span>→</span></button>
    </div>`;
    const pt = R.map.latLngToContainerPoint([s.lat, s.lng]), mapEl = $('#pipeline-map');
    const W = 300, Hc = el.offsetHeight || 300;
    let left = pt.x - W / 2, top2 = pt.y - Hc - 16;
    if (top2 < 8) top2 = pt.y + 16;
    left = Math.max(8, Math.min(left, mapEl.clientWidth - W - 8)); top2 = Math.max(8, Math.min(top2, mapEl.clientHeight - Hc - 8));
    el.style.left = left + 'px'; el.style.top = top2 + 'px'; el.classList.remove('hidden-card');
    $$('.eq-pin').forEach((p) => p.classList.toggle('is-active', p.dataset.pin === s.id));
    $$('[data-row]').forEach((r) => r.classList.toggle('is-hot', r.dataset.row === s.id));
  }
  function scheduleHideHover() { clearTimeout(R.hoverTimer); R.hoverTimer = setTimeout(hideMapHover, 250); }
  function hideMapHover() {
    const el = $('#map-hover'); if (el) el.classList.add('hidden-card');
    $$('.eq-pin.is-active').forEach((p) => p.classList.remove('is-active'));
    $$('[data-row].is-hot').forEach((r) => r.classList.remove('is-hot'));
  }

  /* =================================================================
     SITE RECORD
     ================================================================= */
  function destroySiteWidgets() {
    Object.values(R.charts || {}).forEach((c) => c.destroy()); R.charts = {};
    if (R.satThumb) { R.satThumb.remove(); R.satThumb = null; }
  }
  /* Header facts: SF leads from DataSF; other sites from the facility list and the address lookup. */
  function headerFacts(s, l, r) {
    if (s.sf) return [['Floor area', `${fmt(s.floorArea)} sf`, 'Benchmarking'], ['Built · stories', `${s.yearBuilt || '—'} · ${s.stories}`, 'Benchmarking'], ['Occupancy', s.occupancy, 'Permit history'], ['Grid use', l ? `${fmt(l.kwh / 1e6, 2)} GWh (${l.year})` : '—', l ? `Benchmarking ${l.year}` : null],
      ['Utility', 'PG&E · rate unknown', EQ.addrSrc('f_util')], ['County', 'San Francisco, CA', null], ['AHJ', 'SF DBI · SFFD', EQ.addrSrc('d_fire')], ['Records', `${r.permits.length} permits · ${r.benchmark.length} yrs benchmarking`, 'Permit history']];
    const F = (id) => EQ.addrField(s, id), sh = (id, n = 48) => { const f = F(id); return EQ.addrHas(f) ? String(f.display).split(/[;(]/)[0].slice(0, n).trim() : '—'; };
    const doc = EQ.addrDoc(s), sum = doc ? doc.record.summary : null;
    return [['Floor area', s.floorArea ? `${fmt(s.floorArea)} sf` : sh('b_bld'), EQ.addrSrc(s.floorArea ? 'b_floor' : 'b_bld')], ['Zoning', sh('z_zone', 40), EQ.addrSrc('z_zone')],
      ['Seismic', sh('e_seis'), EQ.addrSrc('e_seis')], ['Peak demand', s.peakText || (s.system ? `${fmt((doc.facility || {}).peak_kw)} kW (${(doc.facility || {}).peak_basis})` : '—'), null],
      ['Utility', `${s.utility}${s.tariff ? ' · ' + s.tariff.replace(s.utility + ' ', '') : ' · rate unknown'}`, EQ.addrSrc('f_util')], ['County', `${s.county}, ${s.state}`, EQ.addrSrc('a_cnty')],
      ['Fire authority', sh('d_fire', 36), EQ.addrSrc('d_fire')], ['Address lookup', sum ? `${sum.required_done_pct}% of required items filled` : 'Not built yet', 'Address lookup']];
  }
  function renderSite(s) {
    destroySiteWidgets();
    const cur = stageIdx(s), l = latestKwh(s), r = rec(s);
    $('#view-site').innerHTML = `
      <a href="#/" class="arrow-link text-ink2 text-[13px]">← Projects</a>
      <section class="panel">
        <div class="grid grid-cols-1 lg:grid-cols-12">
          <div class="lg:col-span-8 p-6 flex flex-col sm:flex-row gap-6 border-b lg:border-b-0 lg:border-r border-line2">
            <button class="sat-thumb relative w-full sm:w-52 h-44 sm:h-auto sm:min-h-[200px] overflow-hidden border border-line shrink-0" data-action="open-satellite" aria-label="Open aerial view">
              <div id="sat-thumb" class="absolute inset-0"></div>
              <span class="absolute left-0 bottom-0 z-[500] bg-white/95 px-2 py-1 text-[10.5px] text-ink2 num">${s.lat.toFixed(4)}, ${s.lng.toFixed(4)}</span>
            </button>
            <div class="min-w-0 flex-1">
              <div class="eyebrow">${esc(s.sector)} · ${esc(s.neighborhood)}</div>
              <h1 class="display text-[32px] leading-tight mt-1.5">${esc(s.name)}</h1>
              <p class="text-[13.5px] text-ink2 mt-1">${esc(s.address)}, ${esc(s.city)}, ${s.state} ${s.zip}${s.apn ? ` · APN ${esc(s.apn)}${s.apnCandidate ? ' <button class="link text-[12px]" data-action="source" data-src="Address lookup (b_apn)" data-title="APN candidates">(candidate, unconfirmed)</button>' : ''}` : ''}${r.pim ? ` · ${extLink(r.pim, 'SF Planning PIM')}` : ''}</p>
              <p class="text-[12.5px] text-mute">${esc(s.tenant)}</p>
              <dl class="grid grid-cols-2 xl:grid-cols-4 gap-x-6 gap-y-3 mt-4 text-[13px]">
                ${headerFacts(s, l, r)
                  .map(([k, v, src]) => `<div><dt class="text-[11.5px] text-mute">${k}</dt><dd class="text-ink mt-0.5">${src ? `<button class="text-left hover:text-blue underline decoration-line underline-offset-2" data-action="source" data-src="${esc(src)}" data-title="${esc(k)}">${esc(v)}</button>` : esc(v)}</dd></div>`).join('')}
              </dl>
              <p class="text-[14px] text-ink mt-4">${esc(s.summary)}</p>
            </div>
          </div>
          <div class="lg:col-span-4 p-6" id="site-score"></div>
        </div>
        <div class="px-6 pb-6 pt-1" id="site-intake">${intakeHTML(s)}</div>
      </section>

      <section class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 border-l border-t border-line bg-white" id="snapshot"></section>

      <section class="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        <div class="xl:col-span-8 panel" id="findings"></div>
        <aside class="xl:col-span-4 space-y-6"><div class="panel" id="site-requests"></div><div class="panel" id="site-activity"></div></aside>
      </section>

      <section class="panel" id="site-addr"></section>

      <section class="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        <div class="xl:col-span-8 space-y-6" id="site-matrix"></div>
        <aside class="xl:col-span-4 space-y-6 xl:sticky xl:top-[124px]"><div class="panel" id="site-codes"></div></aside>
      </section>

      <section class="panel" id="site-permits"></section>
      <section class="panel" id="site-docs"></section>
      <section class="panel" id="site-vault"></section>
      <section id="site-pocs"></section>`;
    renderScore(s); renderSnapshot(s); renderFindings(s); renderMatrix(s); renderRequests(s); renderActivity(s); renderPermits(s); renderDocs(s); renderCodes(s); renderVault(s); renderPocs(s); renderAddr(s);
    icons(); initSatThumb(s); renderLoad(s);
  }
  function refreshSite(s, flashKey) {
    const it = $('#site-intake'); if (it) it.innerHTML = intakeHTML(s);
    renderScore(s); renderSnapshot(s); renderFindings(s);
    EQ.SECTIONS.forEach((p) => renderSectionBody(s, p.key));
    renderFieldBody(s); renderTieIn(s);
    renderRequests(s); renderActivity(s); renderDocs(s); renderVault(s); renderStageRail();
    icons();
    if (flashKey) { const row = $(`[data-dp-row="${flashKey}"]`); if (row) { row.classList.remove('flash'); void row.offsetWidth; row.classList.add('flash'); } }
    persist();
  }
  function initSatThumb(s) {
    const el = $('#sat-thumb'); if (!el) return;
    const m = L.map(el, { zoomControl: false, attributionControl: false, dragging: false, scrollWheelZoom: false, doubleClickZoom: false, boxZoom: false, keyboard: false, touchZoom: false }).setView([s.lat, s.lng], 18);
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19 }).addTo(m);
    L.circleMarker([s.lat, s.lng], { radius: 5, color: '#fff', weight: 2, fillColor: '#06162b', fillOpacity: 1 }).addTo(m);
    R.satThumb = m; setTimeout(() => m.invalidateSize(), 60);
  }
  /* ---------------------------------------------------------------- overview tiles & findings */
  function areaStatus(s, key) {
    const o = (s.overrides || {})[key]; const [base, note, src] = s.areas[key];
    if (o) return { status: o.status, note: o.note || note, src, by: o.by };
    if (key === 'load' && s.interval) return { status: base === 'risk' ? 'risk' : 'good', note: `Measured peak ${fmt(s.interval.peakKw, 1)} kW (${s.interval.peakAt}); load factor ${fmt(s.interval.loadFactor * 100)}%`, src, evidence: 'Customer interval file' };
    const i = s.inputs || {};
    if (key === 'electrical' && i.voltage && i.mainA && i.busA) return { status: 'good', note: `${i.voltage} · ${fmt(i.mainA)} A main / ${fmt(i.busA)} A bus (engineer input)`, src, evidence: 'Engineer input' };
    return { status: base, note, src };
  }
  function renderSnapshot(s) {
    $('#snapshot').innerHTML = EQ.AREAS.map((a) => {
      const x = areaStatus(s, a.key), m = EQ.STATUS[x.status];
      return `<button class="text-left p-4 border-r border-b border-line hover:bg-paper flex flex-col gap-1.5 snap-${x.status}" data-action="area" data-area="${a.key}">
        <span class="flex items-center justify-between gap-2"><span class="text-[12px] text-ink2">${esc(a.name)}</span>${tag(m.cls, m.label)}</span>
        <span class="text-[13px] text-ink leading-snug">${esc(x.note)}</span>
        <span class="text-[11px] text-mute">${x.by ? `Set by ${esc(x.by)}` : x.evidence ? esc(x.evidence) : `Source: ${esc(x.src)}`}</span></button>`;
    }).join('');
  }
  function renderFindings(s) {
    const order = { risk: 0, good: 1, info: 2 }, mark = { risk: ['crit', 'Risk'], good: ['ok', 'Supports'], info: ['muted', 'Note'] };
    const items = s.findings.map((f, i) => ({ f, i })).sort((a, b) => order[a.f.sev] - order[b.f.sev]);
    const open = s.findings.filter((f, i) => f.sev === 'risk' && !(s.reviewed || {})[i]).length;
    $('#findings').innerHTML = `<div class="panel-head"><div class="eyebrow flex-1">Findings from records</div><span class="text-[12px] ${open ? 'text-alert' : 'text-mute'}">${open} open risk${open === 1 ? '' : 's'}</span></div>
      <ul>${items.map(({ f, i }) => { const rv = (s.reviewed || {})[i]; return `<li class="grid grid-cols-[76px_1fr_auto] gap-3 px-5 py-3 border-t border-line2 first:border-t-0 ${rv ? 'opacity-55' : ''}">
        <span class="pt-0.5">${tag(mark[f.sev][0], mark[f.sev][1])}</span>
        <div class="min-w-0"><button class="text-left text-[13.5px] text-ink leading-snug hover:text-blue" data-action="source" data-src="${esc(f.src)}" data-title="${esc(f.text)}">${esc(f.text)}</button>
          <div class="text-[11.5px] text-mute mt-1"><button class="underline decoration-line underline-offset-2 hover:text-ink" data-action="source" data-src="${esc(f.src)}" data-title="${esc(f.text)}">${esc(f.src)}</button> · ${esc(EQ.AREAS.find((a) => a.key === f.area).name)}</div></div>
        <label class="flex items-center gap-1.5 text-[11.5px] text-ink2 cursor-pointer pt-0.5"><input type="checkbox" class="w-3.5 h-3.5 accent-[#06162b]" data-review="${i}" ${rv ? 'checked' : ''} />Reviewed</label></li>`; }).join('')}</ul>`;
  }
  function openArea(s, key) {
    const a = EQ.AREAS.find((x) => x.key === key), x = areaStatus(s, key), o = (s.overrides || {})[key] || {};
    const fs = s.findings.filter((f) => f.area === key);
    const dps = s.dps.filter((d) => d.sec === a.sec);
    openModal({ title: a.name, subtitle: `${esc(s.name)} · ${EQ.STATUS[x.status].label}`, size: 'max-w-3xl',
      body: `<div class="text-[14px] text-ink">${esc(x.note)}</div>
        <div class="eyebrow mt-5 mb-2">Primary sources</div>${sourceHTML(s, x.src)}
        ${fs.length ? `<div class="eyebrow mt-5 mb-2">Findings</div><ul class="border border-line">${fs.map((f) => `<li class="px-4 py-2.5 border-t border-line2 first:border-t-0 text-[13px]"><button class="text-left hover:text-blue" data-action="source" data-src="${esc(f.src)}" data-title="${esc(f.text)}">${esc(f.text)}</button> <span class="text-[11.5px] text-mute">· ${esc(f.src)}</span></li>`).join('')}</ul>` : ''}
        <div class="eyebrow mt-5 mb-2">Data points</div><ul class="border border-line">${dps.map((d) => `<li class="flex justify-between gap-3 px-4 py-2 border-t border-line2 first:border-t-0 text-[12.5px]"><span class="text-ink2">${esc(d.label)}</span><span class="text-right">${d.value ? esc(d.value) : '<span class="text-mute">—</span>'}</span></li>`).join('')}</ul>
        <div class="mt-5 grid grid-cols-[150px_1fr] gap-3 items-center text-[13px]"><label for="ov-status" class="text-mute">Engineer assessment</label>
          <select id="ov-status" class="field h-9 px-2">${['', 'good', 'partial', 'unknown', 'risk'].map((k) => `<option value="${k}" ${o.status === k ? 'selected' : ''}>${k ? EQ.STATUS[k].label : 'Use records and evidence'}</option>`).join('')}</select>
          <label for="ov-note" class="text-mute">Note</label><input id="ov-note" class="field h-9 px-2" value="${esc(o.note || '')}" placeholder="${esc(s.areas[key][1])}" /></div>`,
      footer: `<button class="btn btn-ghost" data-action="close-modal">Cancel</button><button class="btn btn-primary" data-action="save-area" data-area="${key}">Save assessment</button>` });
  }

  /* ---------------------------------------------------------------- primary-source viewer */
  const DS = { Building: 'i98e-djp9', Electrical: 'ftty-kx6y' };
  function resolveSources(s, src) {
    const out = { permits: [], years: null, all: false, aerial: false, utility: false, addr: [], addrAll: false, other: [] };
    String(src || '').split('·').map((t) => t.trim()).filter(Boolean).forEach((t) => {
      const m = t.match(/^(BP|EP)\s+(?:filed\s+)?(\d{4}-\d{2}-\d{2})/);
      if (m) { rec(s).permits.filter((p) => p.date === m[2] && p.kind === (m[1] === 'BP' ? 'Building' : 'Electrical')).forEach((p) => out.permits.push(p)); return; }
      const b = t.match(/Benchmarking\s+(\d{4})(?:\s*[–-]\s*(\d{4}))?/);
      if (b) { out.years = [+b[1], +(b[2] || b[1])]; return; }
      if (/Permit history/i.test(t)) { out.all = true; return; }
      if (/Aerial/i.test(t)) { out.aerial = true; return; }
      if (t === EQ.UTIL_SRC) { out.utility = true; return; }
      const am = t.match(/^Address lookup \((\w+)\)$/);
      if (am) { out.addr.push(am[1]); return; }
      if (t === 'Address lookup') { out.addrAll = true; return; }
      if (t === 'Lead form') { out.lead = true; return; }
      out.other.push(t);
    });
    return out;
  }
  function permitCard(s, p) {
    const url = `https://data.sfgov.org/resource/${DS[p.kind]}.json?permit_number=${encodeURIComponent(p.no)}`;
    return `<div class="border border-line p-3 mb-2"><div class="flex flex-wrap items-baseline gap-x-3 text-[12px]"><span class="font-mono text-ink">${esc(p.no)}</span><span class="text-mute">${esc(p.kind)} permit</span>${tag(/complete/.test(p.status) ? 'ok' : /issued/.test(p.status) ? 'ink' : /expired|cancel|withdrawn/.test(p.status) ? 'crit' : 'gap', p.status)}<span class="ml-auto">${extLink(url, 'DataSF record')}</span></div>
      <dl class="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 mt-2 text-[12px]">${[['Filed', fmtDate(p.date)], ['Issued', p.issued ? fmtDate(p.issued) : '—'], ['Completed', p.completed ? fmtDate(p.completed) : '—'], ['Est. cost', p.cost ? '$' + fmt(p.cost) : '—'], ['Occupancy', p.occ || '—'], ['Plan sets', p.plansets || '—']].map(([k, v]) => `<div><dt class="text-mute">${k}</dt><dd class="text-ink num">${esc(v)}</dd></div>`).join('')}</dl>
      <p class="text-[12.5px] text-ink2 mt-2">${esc(p.desc)}</p></div>`;
  }
  function benchTable(s, years) {
    const rows = rec(s).benchmark.filter((b) => !years || (b.year >= years[0] && b.year <= years[1]));
    return `<table class="w-full text-[12.5px] border border-line"><thead class="text-mute"><tr><th class="text-left px-3 py-1.5 font-normal">Year</th><th class="text-right px-3 font-normal">Grid electricity (kWh)</th><th class="text-left px-3 font-normal">Status</th></tr></thead>
      <tbody>${rows.map((b) => `<tr class="border-t border-line2"><td class="px-3 py-1.5 num">${b.year}</td><td class="px-3 text-right num">${b.kwh ? fmt(b.kwh) : '—'}</td><td class="px-3 text-ink2">${esc(b.status)}</td></tr>`).join('')}</tbody></table>
      <div class="text-[11.5px] mt-1.5">${extLink(`https://data.sfgov.org/resource/96ck-qcfe.json?parcel_number=${encodeURIComponent(s.apn)}`, 'DataSF benchmarking records for this parcel')} · SF Existing Commercial Buildings Energy Performance Ordinance</div>`;
  }
  function sourceHTML(s, src, url) {
    const r = resolveSources(s, src); let h = '';
    if (r.permits.length) h += r.permits.map((p) => permitCard(s, p)).join('');
    if (r.years) h += benchTable(s, r.years);
    if (r.all) h += `<div class="text-[12.5px] text-ink2">${rec(s).permits.length} permits on record for APN ${esc(s.apn)} (${esc(rec(s).permits.at(-1)?.date?.slice(0, 4) || '')}–${esc(rec(s).permits[0]?.date?.slice(0, 4) || '')}). <button class="link" data-action="goto-permits">Open permit records</button> · ${extLink(`https://data.sfgov.org/resource/i98e-djp9.json?$where=${encodeURIComponent(`block='${s.apn.split('/')[0]}' AND lot='${s.apn.split('/')[1]}'`)}`, 'DataSF query')}</div>`;
    if (r.utility) h += utilityHTML(s);
    r.addr.forEach((id) => { h += addrFieldHTML(s, id); });
    if (r.addrAll) h += addrSummaryHTML(s);
    if (r.lead) h += leadHTML(s);
    if (r.aerial) h += `<div class="text-[12.5px] text-ink2 mt-2">Esri World Imagery at the address point. <button class="link" data-action="open-satellite">Open aerial</button></div>`;
    if (r.other.length || url) h += `<div class="text-[12.5px] text-ink2 mt-2">${esc(r.other.join(' · '))}${url ? ` · ${extLink(url, 'source')}` : ''}</div>`;
    return h || '<div class="text-[12.5px] text-mute">No linked record.</div>';
  }
  /* Utility hosting-capacity record: every value with its exact query, data date and confidence. */
  function utilityHTML(s) {
    const r = EQ.utilityRecord(s);
    if (!r) return '<div class="text-[12.5px] text-mute">No utility record for this site. Run <span class="font-mono">./site_record "ADDRESS" --utility pge --site-id ' + esc(s.id) + '</span>.</div>';
    const f = r.feeder, h = r.hosting_capacity;
    const gapBy = Object.fromEntries((r.gaps || []).map((g) => [g.field, g]));
    const row = (label, v, path) => {
      if (v) return `<tr class="border-t border-line2"><td class="px-3 py-2 text-mute align-top w-[30%]">${label}</td><td class="px-3 py-2 align-top"><div class="text-ink num">${esc(EQ.utilFmt(v))}</div>
        <div class="text-[11.5px] text-mute mt-0.5">${[v.data_date ? `Utility data ${esc(v.data_date)}` : '', confLabel[v.confidence] || '', `Retrieved ${esc(v.retrieved)}`, extLink(v.source.url, 'query')].filter(Boolean).join(' · ')}</div>
        ${v.note ? `<div class="text-[11.5px] text-ink2 mt-1">${esc(v.note)}</div>` : ''}</td></tr>`;
      const g = gapBy[path];
      return `<tr class="border-t border-line2"><td class="px-3 py-2 text-mute align-top w-[30%]">${label}</td><td class="px-3 py-2 align-top"><div class="text-alert">Gap${g && g.reason ? ` · ${esc(g.reason)}` : ''}</div>
        ${g ? `<div class="text-[11.5px] text-ink2 mt-0.5">Why: ${esc(g.why)}</div><div class="text-[11.5px] text-ink2">Collect: ${esc(g.how_to_collect)}</div>` : ''}</td></tr>`;
    };
    const m = r.match;
    const extra = Object.entries(r.extra || {});
    return `<div class="border border-line">
      <div class="px-3 py-2 flex flex-wrap items-baseline gap-x-3 text-[12px] border-b border-line"><span class="text-ink">${esc(r.utility ? r.utility.value : r.input.utility)}</span><span class="text-mute">utility from the customer's bill</span><span class="ml-auto text-mute">Record ${esc(r.generated_at.slice(0, 10))}</span></div>
      <table class="w-full text-[12.5px]"><tbody>
        ${row('Geocoded address', r.site.address, 'site.address')}
        ${row('Feeder', f.name, 'feeder.name')}${row('Feeder ID', f.id, 'feeder.id')}${row('Substation', f.substation, 'feeder.substation')}${f.division ? row('Division', f.division, 'feeder.division') : ''}
        ${row('Feeder voltage', r.feeder_voltage_kv, 'feeder_voltage_kv')}${r.phases ? row('Phases', r.phases, 'phases') : ''}
        ${row('Generation hosting capacity', h.generation, 'hosting_capacity.generation')}${row('Load hosting capacity', h.load, 'hosting_capacity.load')}
        ${row('Computed', h.computed, 'hosting_capacity.computed')}${row('Limiting criteria', h.limiting_criteria, 'hosting_capacity.limiting_criteria')}
      </tbody></table></div>
      ${m ? `<div class="eyebrow mt-4 mb-1.5">Feeder match</div><div class="text-[12.5px] text-ink2">${esc(m.method)}</div>
        ${m.candidates && m.candidates.length > 1 ? `<table class="w-full text-[12px] border border-line mt-2"><thead class="text-mute"><tr><th class="text-left px-3 py-1 font-normal">Candidate feeder</th><th class="text-right px-3 font-normal">Nearest section</th><th class="text-right px-3 font-normal">Sections</th></tr></thead><tbody>${m.candidates.map((c, i) => `<tr class="border-t border-line2 ${i ? 'text-ink2' : 'text-ink'}"><td class="px-3 py-1 font-mono">${esc(c.feeder)}</td><td class="px-3 text-right num">${c.distance_m != null ? c.distance_m + ' m' : c.within_m ? 'within ' + c.within_m + ' m' : '—'}</td><td class="px-3 text-right num">${c.sections ?? ''}</td></tr>`).join('')}</tbody></table>` : ''}` : ''}
      ${extra.length ? `<details class="mt-4"><summary class="text-[12px] text-ink2 cursor-pointer">Other utility fields (${extra.length})</summary><dl class="grid grid-cols-2 gap-x-4 gap-y-1 mt-2 text-[12px]">${extra.map(([k, v]) => `<div><dt class="text-mute font-mono">${esc(k)}</dt><dd class="text-ink num">${v.value == null ? '—' : esc(EQ.utilFmt(v))} ${extLink(v.source.url, '↗')}${v.note ? `<span class="block text-[11px] text-mute">${esc(v.note)}</span>` : ''}</dd></div>`).join('')}</dl></details>` : ''}
      ${(r.notes || []).length ? `<div class="eyebrow mt-4 mb-1.5">Notes</div><ul class="text-[12.5px] text-ink2 list-disc pl-5 space-y-1">${r.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
      ${(r.errors || []).length ? `<div class="eyebrow mt-4 mb-1.5 text-alert">Errors</div><ul class="text-[12.5px] text-alert list-disc pl-5">${r.errors.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
      <div class="mt-4 border-l-2 border-ochre pl-3 text-[12px] text-ink2 space-y-1">${r.cautions.map((c) => `<p>${esc(c)}</p>`).join('')}</div>
      <details class="mt-4"><summary class="text-[12px] text-ink2 cursor-pointer">All queries (${r.queries.length})</summary><ol class="mt-2 text-[11.5px] space-y-1 list-decimal pl-5">${r.queries.map((q) => `<li>${extLink(q.url, q.name)}</li>`).join('')}</ol></details>`;
  }
  /* ---------------------------------------------------------------- address lookup (site_records/) */
  const ADDR_STATUS = { filled: ['ok', 'Filled'], provided: ['ink', 'Provided'], confirm: ['gap', 'Confirm'], needed: ['crit', 'Needed'] };
  const addrMeta = (f) => [f.source_label, f.vintage ? `vintage ${f.vintage}` : null, confLabel[f.confidence]].filter(Boolean).map(esc).join(' · ');
  function addrFieldHTML(s, id) {
    const f = EQ.addrField(s, id);
    if (!f) return `<div class="text-[12.5px] text-mute">No address record field ${esc(id)} for this site.</div>`;
    const st = ADDR_STATUS[f.status] || ['muted', f.status];
    const flags = (EQ.addrDoc(s).record.flags || []).filter((x) => (x.field_ids || []).includes(id));
    const miss = (EQ.addrDoc(s).record.missing || []).find((x) => x.field_id === id);
    return `<div class="border border-line p-3 mb-2"><div class="flex flex-wrap items-baseline gap-x-3 text-[12px]"><span class="text-ink">${esc(f.label)}</span><span class="text-mute">${esc(f.section)}</span>${tag(st[0], st[1])}${f.source_url ? `<span class="ml-auto">${extLink(f.source_url, 'source')}</span>` : ''}</div>
      <div class="text-[14px] text-ink mt-1.5 break-words">${esc(f.display)}</div>
      <div class="text-[11.5px] text-mute mt-1">${addrMeta(f)}</div>
      ${f.note ? `<div class="text-[12px] text-ink2 mt-1.5">${esc(f.note)}</div>` : ''}
      ${miss ? `<div class="text-[12px] text-ink2 mt-1.5"><span class="text-mute">Collect (${esc(miss.who)}):</span> ${esc(miss.why)}</div>` : ''}
      ${flags.map((x) => `<div class="text-[12px] mt-1.5 ${x.severity === 'warn' ? 'text-alert' : 'text-ink2'}">${esc(x.title)}. ${esc(x.detail)}</div>`).join('')}</div>`;
  }
  function leadHTML(s) {
    const l = s.lead; if (!l) return '<div class="text-[12.5px] text-mute">No lead form on file.</div>';
    const rows = [['Submitted', fmtDT(l.createdAt)], ['Contact', [l.contact.name, l.contact.role, l.contact.email, l.contact.phone].filter(Boolean).join(' · ')], ['Address as entered', l.address],
      ['Geocoded', l.geo ? `${l.geo.matched} (${l.geo.source})` : 'No match'], ['Facility', [l.facility, l.type, l.sqft ? fmt(l.sqft) + ' sf' : null, l.tenure].filter(Boolean).join(' · ')],
      ['Operating hours', { 1: 'One shift', 2: 'Two shifts', 3: '24/7' }[l.hours] || '—'], ['Utility and rate', `${l.utility}${l.rate ? ' ' + l.rate : ' (rate not given)'}`], ['Monthly bill', l.bill ? `$${fmt(l.bill)}` : '—'],
      ['Peak (customer)', l.peakEntered ? `${fmt(l.peakEntered)} kW` : '—'], ['On site', (l.der || []).join(', ') || '—'], ['Files', (l.files || []).map((f) => f.name).join(', ') || '—'], ['Notes', l.notes || '—'],
      ['Estimate shown', l.estimate ? `$${fmt(l.estimate.lo)}–$${fmt(l.estimate.hi)}/yr · ${fmt(l.estimate.sysKw)} kW / ${fmt(l.estimate.sysKwh)} kWh · $${fmt(l.estimate.rateYr)}/kW-yr ${l.estimate.typical ? '(typical rate)' : '(' + l.estimate.tariff + ')'}` : '—']];
    return `<dl class="border border-line text-[12.5px]">${rows.map(([k, v]) => `<div class="grid grid-cols-[150px_1fr] gap-3 px-3 py-2 border-t border-line2 first:border-t-0"><dt class="text-mute">${esc(k)}</dt><dd class="text-ink break-words">${esc(v)}</dd></div>`).join('')}</dl>`;
  }
  function addrSummaryHTML(s) {
    const d = EQ.addrDoc(s); if (!d) return '<div class="text-[12.5px] text-mute">No address record for this site yet. Build one with <span class="font-mono">python -m eqore_site.export --address "${esc(s.address)}, ${esc(s.city)}, ${esc(s.state)}" --out site_records</span>, or from GitHub: Actions → <i>Site records</i> → Run workflow with the address.</div>';
    const m = d.record.summary;
    return `<div class="text-[12.5px] text-ink2">${m.required_done_pct}% of ${m.required} required items filled from public data (${m.required_auto_pct}% can be filled automatically). Record built ${esc(d.record.generated_at.slice(0, 10))} from ${d.record.sources.length} sources; status ${esc(d.record.status.replace(/_/g, ' '))}.</div>`;
  }
  function renderAddr(s) {
    const el = $('#site-addr'); if (!el) return;
    const d = EQ.addrDoc(s);
    if (!d) { el.innerHTML = `<div class="panel-head"><h3 class="h-section !text-[19px] flex-1">Address lookup</h3></div><div class="px-5 py-5">${addrSummaryHTML(s)}</div>`; return; }
    const R = d.record, m = R.summary, open = S.addrSection || null;
    const sections = [...new Set(R.fields.map((f) => f.section))];
    const who = Object.entries(m.to_collect_by_who || {});
    const cands = R.candidates.slice(0, 6);
    el.innerHTML = `<div class="panel-head flex-wrap"><h3 class="h-section !text-[19px] flex-1">Address lookup</h3>
        <span class="text-[12px] text-ink2">${m.required_done_pct}% of ${m.required} required items · built ${esc(R.generated_at.slice(0, 10))} · ${R.sources.length} public sources</span></div>
      <div class="grid grid-cols-1 lg:grid-cols-12">
        <div class="lg:col-span-8 border-b lg:border-b-0 lg:border-r border-line2">
          ${sections.map((sec) => { const fs = R.fields.filter((f) => f.section === sec), got = fs.filter((f) => f.status !== 'needed');
            const isOpen = open === sec || (open == null && sec === sections[0]);
            return `<div class="border-t border-line2 first:border-t-0">
              <button class="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-paper" data-action="addr-section" data-sec="${esc(sec)}" aria-expanded="${isOpen}">
                <span class="text-[13.5px] text-ink flex-1">${esc(sec)}</span><span class="text-[12px] text-ink2 num">${got.length}/${fs.length}</span>
                <span class="w-24 h-[3px] bg-line2"><span class="block h-full bg-steel" style="width:${(got.length / fs.length) * 100}%"></span></span><span class="text-mute">${isOpen ? '−' : '+'}</span></button>
              ${isOpen ? `<table class="w-full text-[12.5px]"><tbody>${fs.map((f) => { const st = ADDR_STATUS[f.status] || ['muted', f.status];
                return `<tr class="border-t border-line2 cursor-pointer hover:bg-paper" data-action="source" data-src="${EQ.addrSrc(f.id)}" data-title="${esc(f.label)}">
                  <td class="px-5 py-2 align-top text-mute w-[32%]">${esc(f.label)}</td>
                  <td class="py-2 align-top ${f.status === 'needed' ? 'text-mute' : 'text-ink'} break-words">${esc(String(f.display).length > 160 ? String(f.display).slice(0, 160) + '…' : f.display)}${f.status !== 'needed' ? `<div class="text-[11px] text-mute mt-0.5">${esc(f.source_label)}${f.vintage ? ' · ' + esc(String(f.vintage).slice(0, 40)) : ''}</div>` : ''}</td>
                  <td class="px-5 py-2 align-top text-right whitespace-nowrap">${tag(st[0], st[1])}</td></tr>`; }).join('')}</tbody></table>` : ''}</div>`; }).join('')}
        </div>
        <div class="lg:col-span-4">
          <div class="px-5 pt-4 pb-1 eyebrow">Still to collect</div>
          <dl class="px-5 pb-3 text-[12.5px]">${who.map(([k, v]) => `<div class="flex justify-between py-1.5 border-b border-line2"><dt class="text-ink2">${esc(k)}</dt><dd class="num text-ink">${v.needed || 0} needed${v.confirm ? ` · ${v.confirm} to confirm` : ''}</dd></div>`).join('')}</dl>
          <div class="px-5 pt-3 pb-1 eyebrow">Parcel candidates</div>
          <div class="px-5 pb-1 text-[11.5px] text-mute">The tool never picks a parcel; the customer confirms the lot.</div>
          <table class="w-full text-[12px]"><tbody>${cands.map((c) => `<tr class="border-t border-line2"><td class="px-5 py-1.5 font-mono text-ink">${esc(c.apn.value)}</td><td class="py-1.5 text-ink2">${esc(c.situs && c.situs.value ? c.situs.value : '')}</td><td class="px-5 py-1.5 text-right num text-mute">${c.distance_m != null ? Math.round(c.distance_m) + ' m' : ''}</td></tr>`).join('') || '<tr><td class="px-5 py-2 text-mute">None found</td></tr>'}</tbody></table>
          <div class="px-5 py-4 text-[11.5px] text-ink2">Distances and hazard layers are screening only; no fire-code rule is applied. Flood zone needs a manual FEMA lookup.</div>
        </div></div>`;
  }
  const siteGapHTML = (d) => (d.siteGaps || []).length ? `<div class="eyebrow mt-6 mb-2">What EQORE needs</div><ul class="border border-line">${d.siteGaps.map((g) => `<li class="px-4 py-2.5 border-t border-line2 first:border-t-0 text-[12.5px]">
      <div class="flex flex-wrap items-baseline gap-x-2"><span class="text-ink">${esc(EQ.SITE_GAP_LABEL[g.field] || g.field)}</span><span class="text-[11.5px] text-mute">${g.who === 'utility' ? 'request from the utility' : 'from the customer'}</span></div>
      <div class="text-ink2 mt-0.5">${esc(g.why)}</div><div class="text-ink2">Collect: ${esc(g.how_to_collect)}</div>${g.safety ? `<div class="text-[11.5px] text-ochre mt-1">${esc(g.safety)}</div>` : ''}</li>`).join('')}</ul>` : '';
  function openSource(s, src, title, url) {
    openModal({ title: 'Primary source', subtitle: esc(title || src), size: 'max-w-3xl', body: `<div class="text-[11.5px] text-mute mb-3">Cited as: ${esc(src)}</div>${sourceHTML(s, src, url)}` });
  }

  /* ---------------------------------------------------------------- permit records panel */
  const RX = {
    electrical: /(switchboard|\bmsb\b|service|meter|transformer|generator|transfer switch|\bats\b|\bamp|volt|panel|feeder|solar|photovoltaic|battery|\bups\b|riser|kva|disconnect)/i,
    fire: /(sprinkler|fire alarm|\bfacu\b|smoke|fire door|witness test)/i,
    structural: /(seismic|structural|roof|masonry|\bpad\b|foundation|mezzanine|retaining)/i,
    refrigeration: /(cooler|freezer|refrigerat|condenser|chiller|cold)/i,
  };
  const permitClasses = (p) => Object.keys(RX).filter((k) => RX[k].test(p.desc));
  function ratingChips(t) {
    const out = new Set();
    (t.match(/\b\d{2,4}\s*-?\s*(?:amps?|a)\b/gi) || []).forEach((m) => out.add(m.replace(/\s*-?\s*amps?$/i, ' A').replace(/\s*a$/i, ' A')));
    (t.match(/\b\d{3}\s*-?\s*(?:volt|v)\b/gi) || []).forEach((m) => out.add(m.replace(/\s*-?\s*volt$/i, ' V').replace(/v$/i, ' V')));
    (t.match(/\b\d{2,4}\s*kva\b/gi) || []).forEach((m) => out.add(m.replace(/kva/i, 'kVA')));
    if (/\bats\b|transfer switch/i.test(t)) out.add('ATS'); if (/generator/i.test(t)) out.add('Generator'); if (/\bups\b/i.test(t)) out.add('UPS');
    return [...out];
  }
  function renderPermits(s) {
    if (!s.sf) {
      const f = EQ.addrField(s, 'b_permits');
      $('#site-permits').innerHTML = `<div class="panel-head"><h3 class="h-section !text-[19px] flex-1">Permit records</h3></div>
        <div class="px-5 py-4 text-[13px] text-ink2">${EQ.addrHas(f) ? `${esc(f.display)} <button class="link" data-action="source" data-src="${EQ.addrSrc('b_permits')}" data-title="Permits">source</button>` : `No permit adapter for ${esc(s.city)} yet. Search the city's permit portal for the confirmed parcel, or run <span class="font-mono">python -m permits fetch "${esc(s.address)}, ${esc(s.city)}, ${esc(s.state)}"</span> where a jurisdiction adapter exists.`}</div>`;
      return;
    }
    const ps = rec(s).permits, f = S.permitFilter || 'relevant';
    const pass = (p, k) => (k === 'all' ? true : k === 'relevant' ? permitClasses(p).length > 0 : permitClasses(p).includes(k));
    const shown = ps.filter((p) => pass(p, f));
    $('#site-permits').innerHTML = `<div class="panel-head flex-wrap"><h3 class="h-section !text-[19px] flex-1">Permit records</h3>
        <div class="flex text-[12px] border border-line">${[['relevant', 'Relevant'], ['electrical', 'Electrical'], ['fire', 'Fire'], ['structural', 'Structural'], ['refrigeration', 'Refrigeration'], ['all', 'All']].map(([k, l]) => `<button class="px-3 h-7 ${f === k ? 'bg-ink text-white' : ''}" data-action="pfilter" data-f="${k}">${l} <span class="opacity-60 num">${ps.filter((p) => pass(p, k)).length}</span></button>`).join('')}</div>
        <button class="btn btn-secondary btn-sm" data-action="refresh-permits">Refresh from DataSF</button></div>
      <div class="px-5 py-2 text-[11.5px] text-mute border-b border-line2">DataSF building and electrical permits for APN ${esc(s.apn)} · snapshot ${esc(EQ.ASOF)} · click a row for the full record</div>
      <div class="overflow-x-auto max-h-[460px] overflow-y-auto"><table class="tbl w-full min-w-[820px]"><thead><tr><th>Filed</th><th>Type</th><th>Status</th><th>Description</th><th>Tags</th></tr></thead><tbody>
      ${shown.map((p) => `<tr data-action="source" data-src="${p.kind === 'Building' ? 'BP' : 'EP'} ${esc(p.date)}" data-title="${esc(p.kind)} permit ${esc(p.no)}">
        <td class="num whitespace-nowrap text-[12.5px]">${fmtDate(p.date)}</td><td class="text-[12.5px]">${esc(p.kind)}</td>
        <td class="text-[12.5px] whitespace-nowrap">${tag(/complete/.test(p.status) ? 'ok' : /issued/.test(p.status) ? 'ink' : /expired|cancel|withdrawn/.test(p.status) ? 'crit' : 'gap', p.status)}</td>
        <td class="text-[12.5px] text-ink2 max-w-[620px]">${esc(p.desc.length > 200 ? p.desc.slice(0, 200) + '…' : p.desc)}</td>
        <td class="text-[11px]">${[...permitClasses(p), ...ratingChips(p.desc)].map((c) => `<span class="stamp mr-1 mb-1">${esc(c)}</span>`).join('')}</td></tr>`).join('') || '<tr><td colspan="5" class="text-center text-mute !py-8">None in this filter.</td></tr>'}</tbody></table></div>`;
  }
  async function refreshPermits(s) {
    const [bl, lt] = s.apn.split('/');
    const q = (ds) => `https://data.sf.gov/resource/${ds}.json?$where=${encodeURIComponent(`block='${bl}' AND lot='${lt}'`)}&$limit=500&$order=filed_date DESC`;
    try {
      toast('Fetching from DataSF…');
      const [bp, ep] = await Promise.all([fetch(q(DS.Building)).then((x) => x.json()), fetch(q(DS.Electrical)).then((x) => x.json())]);
      const map = (r, kind) => ({ no: r.permit_number, kind, date: (r.filed_date || r.application_creation_date || '').slice(0, 10), status: r.status, issued: (r.issued_date || '').slice(0, 10) || null, completed: (r.completed_date || '').slice(0, 10) || null, cost: r.estimated_cost ? +r.estimated_cost : null, occ: r.existing_occupancy, plansets: r.plansets, desc: (r.description || '').trim() });
      const before = rec(s).permits.length;
      EQ.REC[s.apn].permits = [...bp.map((r) => map(r, 'Building')), ...ep.map((r) => map(r, 'Electrical'))].sort((a, b) => (a.date < b.date ? 1 : -1));
      const added = EQ.REC[s.apn].permits.length - before;
      toast(`DataSF: ${EQ.REC[s.apn].permits.length} permits${added > 0 ? `, ${added} new since snapshot` : ', no changes'}`);
      renderPermits(s);
    } catch (e) { toast('DataSF request failed; showing the saved snapshot.'); }
  }

  /* ---------------------------------------------------------------- load & interval data */
  function renderLoad(s) {
    const el = $('#load-panel'); if (!el) return;
    Object.keys(R.charts).forEach((k) => { R.charts[k].destroy(); delete R.charts[k]; });
    const b = rec(s).benchmark.filter((x) => x.year >= 2018), pe = EQ.peakEstimate(s), iv = s.interval;
    const stat = (k, v, sub, src) => `<div><dt class="text-[11.5px] text-mute">${k}</dt><dd class="display text-[20px] num leading-tight mt-0.5">${src ? `<button class="hover:text-blue" data-action="source" data-src="${esc(src)}" data-title="${esc(k)}">${v}</button>` : v}</dd><dd class="text-[11.5px] text-ink2">${sub}</dd></div>`;
    el.innerHTML = `<div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <div class="lg:col-span-8">
        ${s.billDemand ? `<div class="text-[14px] text-ink">Billed max demand by month</div><div class="text-[12px] text-mute mb-2">Read from the chart on ${esc(s.billDemand.file)} (${esc(s.billDemand.rate)}), about ±2 kW. Click a bar for the bill.</div>
        <div class="relative h-[200px]"><canvas id="billdemand-chart" role="img" aria-label="Billed max demand by month"></canvas></div>` : ''}
        ${b.length ? `<div class="text-[14px] text-ink">Grid electricity by year</div><div class="text-[12px] text-mute mb-2">SF benchmarking, grid purchase. Gray = not reported. Click a bar for the record.</div>
        <div class="relative h-[200px]"><canvas id="bench-chart" role="img" aria-label="Annual grid electricity"></canvas></div>` : `<div class="text-[14px] text-ink">No public energy benchmarking for this address</div><div class="text-[12.5px] text-ink2 mt-1">${s.system ? `Facility list: peak ${fmt((EQ.addrDoc(s).facility || {}).peak_kw)} kW (${esc((EQ.addrDoc(s).facility || {}).peak_basis)}), peak-shave target ${fmt((EQ.addrDoc(s).facility || {}).target_kw)} kW, ${esc(s.system.status)} system ${fmt(s.system.kw)} kW / ${fmt(s.system.kwh)} kWh.` : ''}${iv ? '' : ' Upload 12 months of 15-min interval data to size against measured load.'}</div>`}
        ${iv ? `<div class="text-[14px] text-ink mt-5">Peak day from interval data</div><div class="text-[12px] text-mute mb-2">${esc(iv.file)} · ${fmt(iv.count)} intervals · ${iv.minutes}-min · ${esc(iv.start)} – ${esc(iv.end)}</div>
          <div class="relative h-[200px]"><canvas id="peak-chart" role="img" aria-label="Peak day demand"></canvas></div>
          <div class="text-[14px] text-ink mt-5 mb-2">Monthly peak demand</div><div class="relative h-[180px]"><canvas id="month-chart" role="img" aria-label="Monthly peak demand"></canvas></div>` : ''}
      </div>
      <dl class="lg:col-span-4 grid grid-cols-2 lg:grid-cols-1 gap-x-6 gap-y-4 content-start">
        ${stat('Latest annual use', latestKwh(s) ? `${fmt(latestKwh(s).kwh)} kWh` : '—', latestKwh(s) ? `${latestKwh(s).year}` : 'Not reported', latestKwh(s) ? `Benchmarking ${latestKwh(s).year}` : null)}
        ${iv ? stat('Measured peak', `${fmt(iv.peakKw, 1)} kW`, esc(iv.peakAt)) + stat('Load factor', `${fmt(iv.loadFactor * 100)}%`, esc(iv.peakHours))
          : pe ? stat('Peak estimate', `${fmt(pe.lo)}–${fmt(pe.hi)} kW`, `avg ${fmt(pe.avg)} kW ÷ typical ${esc(s.sector.toLowerCase())} load factor`, `Benchmarking ${pe.year}`) : ''}
        ${s.tariff ? stat('Rate schedule', esc(s.tariff), 'Facility list; confirm on bill') : stat('Rate class', iv ? (iv.peakKw >= 1000 ? 'B-20 range' : iv.peakKw >= 500 ? 'B-19 range' : 'B-10 range') : pe && pe.hi < 500 ? 'Likely B-10' : 'B-10 or B-19', 'Confirm on bill (PG&E bundled or CleanPowerSF)')}
        <div class="col-span-2 lg:col-span-1"><label class="block border border-dashed border-line px-4 py-5 text-center text-[12.5px] text-ink2 cursor-pointer hover:border-ink" data-drop="interval">${iv ? `Replace ${esc(iv.file)}` : `Drop a ${esc(s.utility)} Green Button CSV (15-min)`}<input type="file" class="hidden" accept=".csv,text/csv" data-upload="interval" /></label><div class="text-[11px] text-mute mt-1">Parsed in the browser; nothing leaves this machine.</div></div>
      </dl></div>`;
    const opts = (tick, label) => ({ responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { display: false }, tooltip: { backgroundColor: '#06162b', cornerRadius: 0, padding: 8, callbacks: { label } } },
      scales: { x: { grid: { display: false }, ticks: { color: '#7d828b', font: { family: 'Inter', size: 10 }, maxTicksLimit: 12, maxRotation: 0 }, border: { color: '#d3cecd' } }, y: { beginAtZero: true, grid: { color: '#efece9' }, border: { display: false }, ticks: { color: '#7d828b', font: { family: 'Inter', size: 10 }, callback: tick } } } });
    if (s.billDemand) {
      const m = s.billDemand.months, pk = Math.max(...m.map((x) => x[1]));
      R.charts.billdemand = new Chart($('#billdemand-chart'), { type: 'bar', data: { labels: m.map((x) => new Date(x[0] + '-15').toLocaleString('en-US', { month: 'short', year: '2-digit' })), datasets: [{ data: m.map((x) => x[1]), backgroundColor: m.map((x) => (x[1] === pk ? '#3c6390' : '#b3c8e4')), maxBarThickness: 30 }] },
        options: Object.assign(opts((v) => fmt(v) + ' kW', (c) => `${fmt(c.parsed.y)} kW billed max`), { onClick: () => { const f = s.files.find((x) => x.name === s.billDemand.file); if (f) openFileModal(s, f.id); } }) });
    }
    if (b.length) R.charts.bench = new Chart($('#bench-chart'), { type: 'bar', data: { labels: b.map((x) => x.year), datasets: [{ data: b.map((x) => x.kwh || 0), backgroundColor: b.map((x) => (x.kwh ? '#3c6390' : '#d3cecd')), maxBarThickness: 30 }] },
      options: Object.assign(opts((v) => fmt(v / 1e6, 1) + ' GWh', (c) => (b[c.dataIndex].kwh ? `${fmt(c.parsed.y)} kWh` : `Not reported: ${b[c.dataIndex].status}`)), { onClick: (e, els) => { if (els.length) openSource(s, `Benchmarking ${b[els[0].index].year}`, `Benchmarking ${b[els[0].index].year}`); } }) });
    if (iv) {
      R.charts.peak = new Chart($('#peak-chart'), { type: 'line', data: { labels: iv.peakDay.map((p) => p.t), datasets: [{ data: iv.peakDay.map((p) => p.kw), borderColor: '#3c6390', borderWidth: 1.75, pointRadius: 0, tension: 0.2 }] }, options: opts((v) => fmt(v) + ' kW', (c) => `${fmt(c.parsed.y, 1)} kW`) });
      R.charts.month = new Chart($('#month-chart'), { type: 'bar', data: { labels: iv.monthly.map((m) => m.m), datasets: [{ data: iv.monthly.map((m) => m.kw), backgroundColor: '#3c6390', maxBarThickness: 24 }] }, options: opts((v) => fmt(v) + ' kW', (c) => `${fmt(c.parsed.y, 1)} kW`) });
    }
  }
  const parseInterval = (text, name) => window.EQ_parseInterval(text, name);
  function readFile(file, asText) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; asText ? r.readAsText(file) : r.readAsDataURL(file); }); }
  async function thumbOf(file) {
    if (!/^image\//.test(file.type)) return null;
    const url = await readFile(file);
    return new Promise((res) => { const img = new Image(); img.onload = () => { const c = document.createElement('canvas'); const k = 480 / Math.max(img.width, img.height); c.width = img.width * k; c.height = img.height * k; c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); res(c.toDataURL('image/jpeg', 0.75)); }; img.onerror = () => res(null); img.src = url; });
  }
  async function handleUpload(s, key, file) {
    if (!file) return;
    const me = EQ.TEAM[EQ.CURRENT_USER].name;
    const f = { id: `${s.id}:up:${key}:${Date.now()}`, key: `up-${key}`, name: file.name, type: /^image\//.test(file.type) ? 'img' : /csv/.test(file.type) || /\.csv$/i.test(file.name) ? 'csv' : 'pdf', cat: 'Customer upload', uploader: { name: me, role: 'Uploaded for customer' }, date: new Date().toISOString().slice(0, 10), origin: 'Customer-provided', conf: 'high', confLabel: 'Customer document', size: `${fmt(file.size / 1024)} KB`, preview: 'upload', thumb: await thumbOf(file), dps: [key], isNew: true };
    if (key === 'interval' || key === 'peakDemand') {
      const iv = parseInterval(await readFile(file, true), file.name);
      if (!iv) { toast('Could not find timestamp and kWh/kW columns in that file.'); return; }
      s.interval = iv; f.dps = ['interval', 'peakDemand'];
      Object.assign(s.dps.find((d) => d.key === 'interval'), { value: `${fmt(iv.count)} intervals, ${iv.minutes}-min, ${iv.start} – ${iv.end}`, src: 'Customer interval file', srcType: 'customer', conf: 'high', requiresSignoff: false, verified: false, rfi: null, file: f.key, reviewNote: null });
      Object.assign(s.dps.find((d) => d.key === 'peakDemand'), { value: `${fmt(iv.peakKw, 1)} kW · ${iv.peakAt} · load factor ${fmt(iv.loadFactor * 100)}%`, src: 'Customer interval file', srcType: 'customer', conf: 'high', requiresSignoff: false, verified: false, rfi: null, file: f.key, reviewNote: null });
      log(s, `Parsed interval data ${file.name}: peak ${fmt(iv.peakKw, 1)} kW`);
      toast(`Parsed ${fmt(iv.count)} intervals · peak ${fmt(iv.peakKw, 1)} kW`);
    } else {
      const d = s.dps.find((x) => x.key === key);
      if (d) Object.assign(d, { value: `Customer file received: ${file.name} — enter ratings from it`, src: 'Customer upload', srcType: 'customer', conf: 'medium', requiresSignoff: true, verified: false, rfi: null, file: f.key, reviewNote: 'Enter values from the document' });
      log(s, `Received ${file.name} for ${d ? d.label : key}`);
      toast(`Received ${esc(file.name)}`);
    }
    s.files.unshift(f);
    refreshSite(s, key); renderLoad(s);
  }
  function renderScore(s) {
    const sc = score(s), h = health(s), g = gateChecks(s);
    $('#site-score').innerHTML = `
      <div class="flex items-baseline justify-between"><div class="eyebrow">Design readiness</div>${tag(HEALTH[h].cls, HEALTH[h].label)}</div>
      <div class="flex items-baseline gap-2 mt-2"><span class="display text-[54px] leading-none num">${sc}</span><span class="text-ink2 text-[13px]">/ 100</span>
        <button class="link text-[12px] ml-auto" data-action="score-breakdown">Method</button></div>
      <div class="mt-4 space-y-2.5">${sectionScores(s).map((p) => { const r = p.earned / p.max; const col = r === 1 ? 'var(--steel)' : r >= 0.7 ? '#b07a20' : 'var(--alert)';
        return `<button class="w-full text-left group" data-action="scroll-section" data-p="${p.key}">
          <div class="flex items-baseline justify-between text-[12.5px]"><span class="text-ink2 group-hover:text-ink">${p.name}</span><span class="num text-ink">${p.done}/${p.dps.length}</span></div>
          <div class="h-[3px] bg-line2 mt-1"><div class="h-full" style="width:${r * 100}%;background:${col}"></div></div></button>`; }).join('')}</div>
      <div class="mt-5 pt-4 border-t border-line2">
        ${g.next ? `<div class="text-[12px] text-mute">Next: ${esc(stageLabel(g.next))}</div>
          <div class="text-[12.5px] text-ink mt-0.5">${g.checks.filter((c) => c.pass).length} of ${g.checks.length} gate checks met</div>
          <button class="btn ${g.pass ? 'btn-primary' : 'btn-secondary'} w-full justify-between mt-3" data-action="open-gate">${g.pass ? 'Advance to ' + EQ.STAGES[g.next].label : 'Review gate checks'}<span>→</span></button>`
        : `<div class="text-[12.5px] text-ink">Operating. ${verifiedCount(s)}/${relevant(s).length} site data points confirmed.</div>`}
      </div>`;
  }

  /* ----------------------------------------------------- sections */
  function renderMatrix(s) {
    $('#site-matrix').innerHTML = EQ.SECTIONS.map((p) => `
      <article class="panel scroll-mt-32" id="section-${p.key}">
        <header class="panel-head" id="section-head-${p.key}"></header>
        <div id="section-body-${p.key}"></div>
        ${p.key === 'elec' ? '<div class="border-t border-line2" id="tiein"></div>' : ''}
        ${p.key === 'load' ? '<div class="border-t border-line2 p-5" id="load-panel"></div>' : ''}
      </article>`).join('') + `
      <article class="panel scroll-mt-32" id="section-field"><header class="panel-head" id="section-head-field"></header><div id="section-body-field"></div></article>`;
    EQ.SECTIONS.forEach((p) => renderSectionBody(s, p.key));
    renderFieldBody(s); renderTieIn(s);
  }
  function renderFieldBody(s) {
    const dps = s.dps.filter((d) => d.sec === 'field');
    const active = fieldActive(s);
    const done = dps.filter((d) => dpStatus(d) === 'ok').length;
    $('#section-head-field').innerHTML = `<h3 class="h-section flex-1 !text-[19px]">${EQ.FIELD.name}</h3><span class="text-[12px] text-mute">${active ? `${done}/${dps.length}` : `From ${stageLabel(EQ.FIELD.from)}`}</span>`;
    $('#section-body-field').innerHTML = active ? dps.map((d) => dpRow(s, d)).join('') : `<div class="px-5 py-4 text-[12.5px] text-mute">Delivery and rigging, pad, conduit route, tie-in shutdown, site access, working space, inspections and commissioning tests are captured once the project reaches utility interconnection.</div>`;
  }
  function renderTieIn(s) {
    const el = $('#tiein'); if (!el) return;
    const i = s.inputs || (s.inputs = {});
    const fields = [['voltage', 'Service voltage', '480Y/277V'], ['mainA', 'Main OCPD (A)', ''], ['busA', 'Bus rating (A)', ''], ['kva', 'Transformer (kVA)', ''], ['sccr', 'Switchboard SCCR (kA)', ''], ['pvKw', 'Existing PV (kW AC)', '0'], ['bessKw', 'Proposed BESS (kW)', '']];
    const focused = document.activeElement && document.activeElement.dataset && document.activeElement.dataset.input;
    if (!el.querySelector('[data-input]')) {
      el.innerHTML = `<div class="px-5 pt-4 pb-1 flex items-baseline justify-between"><span class="text-[14px] text-ink">Tie-in check</span><span class="text-[11.5px] text-mute">Enter ratings from the SLD, nameplate photos or site visit</span></div>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-3 px-5 py-3">${fields.map(([k, l, ph]) => `<label class="block text-[12px]"><span class="text-mute">${l}</span><input class="field w-full h-8 px-2 mt-1 num text-[13px]" data-input="${k}" inputmode="${k === 'voltage' ? 'text' : 'decimal'}" placeholder="${ph}" value="${esc(i[k] ?? '')}" /></label>`).join('')}</div>
        <div id="tiein-result"></div>`;
    }
    void focused;
    const n = (v) => (v === '' || v == null ? null : Number(v));
    const main = n(i.mainA), bus = n(i.busA), pv = n(i.pvKw) || 0, bess = n(i.bessKw), kva = n(i.kva), sccr = n(i.sccr);
    const v = /480/.test(i.voltage || '') ? 480 : /208/.test(i.voltage || '') ? 208 : /240/.test(i.voltage || '') ? 240 : null;
    const out = $('#tiein-result');
    if (!main || !bus || !bess || !v) { out.innerHTML = `<div class="px-5 pb-4 text-[12.5px] text-mute">Needs service voltage, main OCPD, bus rating and proposed BESS kW.</div>`; return; }
    const amps = (kw) => (kw * 1000) / (Math.sqrt(3) * v);
    const allow = 1.2 * bus - main, req = 1.25 * (amps(pv) + amps(bess)), pass = req <= allow;
    const method = pass ? 'Load-side, NEC 705.12(B)(3)(2), breaker at opposite end of bus' : allow > 1.25 * amps(pv) ? `PCS current limit (NEC 705.13) to ${fmt(allow / 1.25 - amps(pv))} A on the BESS (${fmt(((allow / 1.25 - amps(pv)) * Math.sqrt(3) * v) / 1000)} kW), or supply-side per 705.11` : 'Supply-side connection, NEC 705.11';
    const z = kva ? (kva >= 1000 ? 5.75 : 5) : null, isc = kva ? (kva * 1000) / (Math.sqrt(3) * v) / (z / 100) / 1000 : null;
    const row = (k, val, cls = '') => `<div class="flex justify-between gap-4 px-5 py-2 border-t border-line2 text-[12.5px]"><span class="text-ink2">${k}</span><span class="num ${cls}">${val}</span></div>`;
    out.innerHTML = `${row('120% allowance (1.2 × bus − main)', `${fmt(allow)} A`)}${row('Inverter current at 125% (PV + BESS)', `${fmt(req)} A`, pass ? 'text-steel' : 'text-alert')}
      ${isc ? row(`Fault duty, ${fmt(kva)} kVA at ${z}% Z (infinite bus)`, `${fmt(isc, 1)} kA`) : ''}${isc && sccr ? row('SCCR adequacy', sccr >= isc ? `${sccr} kA ≥ ${fmt(isc, 1)} kA` : `${sccr} kA < ${fmt(isc, 1)} kA`, sccr >= isc ? 'text-steel' : 'text-alert') : ''}
      ${main >= 1000 && v === 480 ? row('GFPE', 'Required (NEC 230.95)') : ''}<div class="px-5 py-3 border-t border-line2 text-[12.5px] text-ink">Method: ${esc(method)}.</div>`;
  }
  function renderSectionBody(s, key) {
    const p = sectionScores(s).find((x) => x.key === key);
    const open = p.dps.length - p.done;
    $(`#section-head-${key}`).innerHTML = `
      <h3 class="h-section flex-1 !text-[19px]">${p.name}</h3>
      <span class="text-[12px] ${open ? 'text-ochre' : 'text-mute'}">${open ? `${open} open` : 'Complete'}</span>
      <span class="text-[12px] text-mute num">${p.done}/${p.dps.length}</span>`;
    $(`#section-body-${key}`).innerHTML = p.dps.map((d) => dpRow(s, d)).join('');
  }
  function dpRow(s, d) {
    const st = dpStatus(d);
    const crit = d.severity === 'critical' && (st === 'missing' || st === 'requested');
    const cls = st === 'ok' ? '' : crit ? 'is-critical' : st === 'review' ? 'is-review' : 'is-gap';
    const file = d.file && s.files.find((f) => f.key === d.file);
    const src = file ? `<button class="src" data-action="open-file" data-file="${file.id}">${ico(srcIcon[d.srcType] || 'file')}<span class="truncate">${esc(d.src)}</span></button>`
      : d.src ? `<button class="src" data-action="source" data-src="${esc(d.src)}" data-title="${esc(d.label)}" ${d.srcUrl ? `data-url="${esc(d.srcUrl)}"` : ''}>${ico(srcIcon[d.srcType] || 'file')}<span class="truncate">${esc(d.src)}</span></button>` : '';
    let main, right;
    if (st === 'missing' || st === 'requested') {
      main = `<div class="text-[13.5px] text-ink2">Needed: ${esc(d.ask)}</div>`;
      right = d.owner === 'fm'
        ? `<div class="flex gap-1.5">${st === 'missing' ? `<button class="btn btn-secondary btn-xs" data-action="open-rfi" data-dp="${d.key}">Text request</button>` : ''}<label class="btn btn-ghost btn-xs cursor-pointer">Upload<input type="file" class="hidden" data-upload="${d.key}" /></label></div>`
        : `<button class="btn btn-secondary btn-xs" data-action="resolve-dp" data-dp="${d.key}">Enter</button>`;
    } else {
      main = `<div class="text-[14px] text-ink num leading-snug break-words">${esc(d.value)}</div><div class="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">${src}<span class="text-[11.5px] text-mute">${confLabel[d.conf] || ''}</span></div>`;
      right = `<button class="toggle" role="switch" aria-checked="${!!d.verified}" aria-label="Confirm ${esc(d.label)}" data-action="toggle-verify" data-dp="${d.key}"></button>`;
    }
    return `<div class="dp-row ${cls}" data-action="open-dp" data-dp="${d.key}" data-dp-row="${d.key}">
      <div class="min-w-0"><div class="flex flex-wrap items-baseline gap-x-3 gap-y-0.5"><span class="text-[12px] text-mute">${esc(d.label)}</span>${statusTag(d)}</div><div class="mt-1">${main}</div></div>
      <div class="flex items-start pt-1" data-stop>${right}</div></div>`;
  }
  function openDpModal(s, key) {
    const d = s.dps.find((x) => x.key === key), st = dpStatus(d);
    const file = d.file && s.files.find((f) => f.key === d.file);
    openModal({
      title: esc(d.label), subtitle: `${secName(d.sec) || EQ.FIELD.name} · weight ${d.pts}${d.severity ? ` · ${d.severity === 'critical' ? 'blocks next step' : 'open'}` : ''}`, size: 'max-w-3xl',
      body: `<div class="text-[11.5px] text-mute">Value</div><div class="text-[16px] text-ink num mt-0.5">${d.value != null ? esc(d.value) : '—'}</div>
        <div class="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[12px] text-ink2">${statusTag(d)}${d.value != null ? `<span>${confLabel[d.conf] || ''}</span>` : ''}<span>Owner: ${{ fm: 'facility', utility: 'utility (EQORE requests)' }[d.owner] || 'EQORE'}</span>${d.verified && d.verifiedBy ? `<span>Confirmed by ${esc(d.verifiedBy)}</span>` : ''}</div>
        <div class="eyebrow mt-6 mb-2">Primary source</div>
        ${file ? `<button class="w-full flex items-center gap-3 p-3 border border-line hover:border-ink text-left mb-2" data-action="open-file" data-file="${file.id}">${ficon(file.type)}<span class="min-w-0 flex-1"><span class="block text-[13px] text-ink font-mono truncate">${esc(file.name)}</span><span class="block text-[11.5px] text-mute">${esc(file.origin)}</span></span><span>→</span></button>` : ''}
        ${d.src ? sourceHTML(s, d.src, d.srcUrl) : '<div class="text-[12.5px] text-mute">Not in public records. Needed: ' + esc(d.ask) + '</div>'}
        ${siteGapHTML(d)}
        ${d.rfi ? `<div class="text-[12px] text-ink2 mt-3">Requested from ${esc(d.rfi.to)} by ${esc(d.rfi.channel)} · ${fmtDT(d.rfi.at)}</div>` : ''}`,
      footer: (st === 'missing' || st === 'requested')
        ? `${d.owner === 'fm' && st === 'missing' ? `<button class="btn btn-secondary" data-action="open-rfi" data-dp="${d.key}">Text request</button>` : ''}<button class="btn btn-primary" data-action="resolve-dp" data-dp="${d.key}">Enter value</button>`
        : `<button class="btn btn-secondary" data-action="resolve-dp" data-dp="${d.key}">Override</button><button class="btn btn-primary" data-action="toggle-verify" data-dp="${d.key}" data-close="1">${d.verified ? 'Remove confirmation' : 'Confirm'}</button>`,
    });
  }
  function toggleVerify(s, key) {
    const d = s.dps.find((x) => x.key === key); if (d.value == null) return;
    const before = score(s);
    d.verified = !d.verified;
    d.verifiedBy = d.verified ? EQ.TEAM[EQ.CURRENT_USER].name : null;
    d.verifiedAt = d.verified ? nowISO() : null;
    const delta = score(s) - before;
    log(s, `${d.verified ? 'Confirmed' : 'Removed confirmation on'} ${d.label}${delta ? ` (readiness ${delta > 0 ? '+' : ''}${delta})` : ''}`);
    refreshSite(s, key);
    toast(`${d.verified ? 'Confirmed' : 'Unconfirmed'}: ${esc(d.label)}${delta ? ` · readiness ${score(s)}` : ''}`);
  }

  function openResolveModal(s, key) {
    const d = s.dps.find((x) => x.key === key);
    openModal({
      title: `${d.value == null ? 'Enter' : 'Override'}: ${esc(d.label)}`, subtitle: 'Logged to the activity record.',
      body: `
        <label class="block text-[12px] text-mute mb-1" for="resolve-val">Value</label>
        <input id="resolve-val" class="field w-full h-10 px-3 text-[14px]" value="${esc(d.value ?? d.pendingValue)}" />
        <label class="block text-[12px] text-mute mb-1 mt-4" for="resolve-src">Source</label>
        <input id="resolve-src" class="field w-full h-10 px-3 text-[14px]" value="${d.owner === 'utility' ? 'Utility response' : d.owner === 'eqore' ? (d.key === 'ahjPreApp' ? 'Meeting minutes' : 'Portal confirmation') : 'Call with facility contact'}" />
        <label class="flex items-center gap-2 mt-4 text-[13px] text-ink2"><input type="checkbox" id="resolve-verify" class="w-4 h-4 accent-[#06162b]" checked /> Confirm as ${esc(EQ.TEAM[EQ.CURRENT_USER].name)}</label>`,
      footer: `<button class="btn btn-ghost" data-action="close-modal">Cancel</button><button class="btn btn-primary" data-action="confirm-resolve" data-dp="${d.key}">Save</button>`,
      onMount: (r) => setTimeout(() => $('#resolve-val', r).focus(), 30),
    });
  }
  function confirmResolve(s, key) {
    const d = s.dps.find((x) => x.key === key);
    const v = $('#resolve-val').value.trim(); if (!v) { $('#resolve-val').focus(); return; }
    const ver = $('#resolve-verify').checked, before = score(s);
    Object.assign(d, { value: v, src: $('#resolve-src').value.trim() || 'Manual entry', srcType: 'manual', conf: 'manual', requiresSignoff: true, verified: ver,
      verifiedBy: ver ? EQ.TEAM[EQ.CURRENT_USER].name : null, verifiedAt: ver ? nowISO() : null, rfi: null, updatedAt: new Date().toISOString().slice(0, 10), method: `Entered by ${EQ.TEAM[EQ.CURRENT_USER].name}`, file: null });
    const delta = score(s) - before;
    log(s, `Entered ${d.label}${delta ? ` (readiness +${delta})` : ''}`);
    closeModal(); refreshSite(s, key); toast(`Saved: ${esc(d.label)}`);
  }

  /* ------------------------------------------ load, sizing, value streams */



  function renderValueStreams(s) {
    const el = $('#value-streams'); if (!el) return;
    const vs = valueStreams(s);
    el.innerHTML = `<div class="px-5 pt-4 pb-1 text-[14px] text-ink">Value streams</div>
      <table class="w-full text-[13px]"><tbody>${vs.map((v) => `<tr class="border-t border-line2"><td class="px-5 py-2.5 align-top w-[26%] text-ink">${esc(v.name)}</td><td class="py-2.5 align-top text-ink2 text-[12.5px]">${esc(v.basis)}${v.src ? ` · ${extLink(v.src, v.srcLabel || 'source')}` : ''}</td><td class="px-5 py-2.5 align-top text-right num whitespace-nowrap ${v.counted ? 'text-ink' : 'text-mute'}">${esc(v.value)}</td></tr>`).join('')}</tbody></table>`;
    renderProposal(s, vs);
  }

  /* ----------------------------------------------------- facility requests */
  function renderRequests(s) {
    const rel = relevant(s);
    const fmItems = rel.filter((d) => d.owner === 'fm' && ['missing', 'requested'].includes(dpStatus(d)));
    const eqItems = rel.filter((d) => d.owner === 'eqore' && ['missing', 'requested'].includes(dpStatus(d)));
    const utItems = rel.filter((d) => d.owner === 'utility' && ['missing', 'requested'].includes(dpStatus(d)));
    const review = rel.filter((d) => dpStatus(d) === 'review');
    const row = (d, ctl) => `<li class="px-5 py-2.5 border-t border-line2 flex items-start gap-3 cursor-pointer hover:bg-paper" data-action="open-dp" data-dp="${d.key}">
        <div class="min-w-0 flex-1"><div class="text-[13px] text-ink leading-snug">${esc(['fm', 'utility'].includes(d.owner) && dpStatus(d) !== 'review' ? d.ask : d.label)}</div><div class="mt-0.5">${statusTag(d)}</div></div>
        <div data-stop class="shrink-0 pt-0.5 flex items-center gap-1.5">${ctl}</div></li>`;
    const group = (title, items, ctl) => items.length ? `<div class="px-5 pt-4 pb-2 text-[11.5px] text-mute">${title}</div><ul>${items.map((d) => row(d, ctl(d))).join('')}</ul>` : '';
    $('#site-requests').innerHTML = `
      <div class="panel-head"><div class="eyebrow flex-1">Open items</div><span class="text-[11px] text-mute num">${fmItems.length + eqItems.length + utItems.length + review.length}</span></div>
      ${group('From the facility', fmItems, (d) => `<label class="btn btn-ghost btn-xs cursor-pointer">Upload<input type="file" class="hidden" data-upload="${d.key}" /></label>${dpStatus(d) === 'missing' ? `<input type="checkbox" class="w-4 h-4 accent-[#06162b]" data-rfi-pick="${d.key}" checked aria-label="Include in text request" />` : ''}`)}
      ${fmItems.some((d) => dpStatus(d) === 'missing') ? `<div class="px-5 py-3"><button class="btn btn-primary w-full justify-between" data-action="open-rfi">Text the facility for checked items<span>→</span></button></div>` : ''}
      ${group('From the utility (EQORE requests)', utItems, (d) => `<button class="btn btn-ghost btn-xs" data-action="resolve-dp" data-dp="${d.key}">Enter</button>`)}
      ${group('EQORE', eqItems, (d) => `<button class="btn btn-ghost btn-xs" data-action="resolve-dp" data-dp="${d.key}">Enter</button>`)}
      ${group('Needs engineer confirmation', review, (d) => `<button class="toggle" role="switch" aria-checked="false" aria-label="Confirm ${esc(d.label)}" data-action="toggle-verify" data-dp="${d.key}"></button>`)}
      ${!fmItems.length && !eqItems.length && !utItems.length && !review.length ? `<div class="px-5 py-6 text-[13px] text-mute">No open items.</div>` : ''}`;
  }
  function openRfiModal(s, onlyKey) {
    const gaps = relevant(s).filter((d) => d.owner === 'fm' && dpStatus(d) === 'missing');
    if (!gaps.length) { toast('No facility items are open.'); return; }
    const picked = new Set(onlyKey ? [onlyKey] : gaps.filter((d) => { const cb = $(`[data-rfi-pick="${d.key}"]`); return !cb || cb.checked; }).map((d) => d.key));
    if (!picked.size) gaps.forEach((d) => picked.add(d.key));
    const fm = s.fm || {};
    const link = `upload.eqore.com/${s.code.toLowerCase()}-${(hashStr(s.id + Date.now()) % 46656).toString(36)}`;
    const msg = (keys, name) => `${name ? name.split(' ')[0] + ', t' : 'T'}his is ${EQ.TEAM[s.eng].name.split(',')[0]} with EQORE about battery storage at ${s.address}. To evaluate the site without a visit, could you send:\n${keys.map((k, i) => `${i + 1}. ${s.dps.find((d) => d.key === k).ask}`).join('\n')}\nPhone photos are fine. Please don't open equipment, remove covers or climb to photograph a transformer; labels you can see from the floor are enough. Upload here: https://${link}`;
    openModal({
      title: 'Text the facility', subtitle: `${esc(s.name)} · missing photos and data`, size: 'max-w-4xl',
      body: `<div class="grid grid-cols-1 md:grid-cols-12 gap-6">
        <div class="md:col-span-7 space-y-4">
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[12px]">
            <label class="block"><span class="text-mute">Recipient</span><input id="rfi-name" class="field w-full h-9 px-2 mt-1 text-[13px]" value="${esc(fm.name && fm.name !== 'Facility contact' ? fm.name : '')}" placeholder="Name" /></label>
            <label class="block"><span class="text-mute">Mobile</span><input id="rfi-phone" class="field w-full h-9 px-2 mt-1 text-[13px] num" value="${esc(fm.phone || '')}" placeholder="(415) 555-0100" inputmode="tel" /></label>
            <label class="block"><span class="text-mute">Email</span><input id="rfi-email" class="field w-full h-9 px-2 mt-1 text-[13px]" value="${esc(fm.email || '')}" placeholder="optional" inputmode="email" /></label>
          </div>
          <div><div class="text-[12px] text-mute mb-2">Items</div><div class="border border-line" id="rfi-items">${gaps.map((d) => `
            <label class="flex items-start gap-3 px-3 py-2.5 border-t border-line2 first:border-t-0 cursor-pointer hover:bg-paper">
              <input type="checkbox" class="w-4 h-4 mt-0.5 accent-[#06162b]" value="${d.key}" ${picked.has(d.key) ? 'checked' : ''} />
              <span class="min-w-0 flex-1"><span class="block text-[13px] text-ink">${esc(d.ask)}</span><span class="block text-[11.5px] text-mute">${esc(d.label)} · ${esc(secName(d.sec))}</span></span>
              ${d.severity === 'critical' ? tag('crit', 'Blocks next step') : ''}</label>`).join('')}</div></div>
          <div><div class="flex items-center justify-between mb-2"><span class="text-[12px] text-mute">Message</span>
            <div class="flex text-[12px] border border-line" id="rfi-channel">${['SMS', 'Email'].map((c, i) => `<button class="px-3 h-7 ${i === 0 ? 'bg-ink text-white' : ''}" data-ch="${c}">${c}</button>`).join('')}</div></div>
            <textarea id="rfi-msg" rows="8" class="field w-full p-3 text-[13px] leading-relaxed"></textarea>
            <div class="text-[11.5px] text-mute mt-1.5">Opens your phone or mail app with this message; uploads land on this record linked to each item.</div></div>
        </div>
        <div class="md:col-span-5 flex flex-col items-center"><div class="text-[12px] text-mute mb-3 self-start md:self-center">What the facility sees</div>
          <div class="phone"><div class="px-4 pt-5 pb-5"><div class="wordmark !text-[15px]">EQORE</div>
            <div class="mt-3 text-[12.5px] text-ink">${esc(s.address)}</div><div class="text-[10.5px] text-mute">${esc(s.city)} · APN ${esc(s.apn)}</div>
            <div class="mt-3 space-y-1.5" id="phone-items"></div>
            <div class="mt-3 h-8 bg-ink text-white text-[11px] grid place-items-center">Take photo / upload</div></div></div></div>
      </div>`,
      footer: `<button class="btn btn-ghost" data-action="close-modal">Cancel</button><button class="btn btn-secondary" data-action="copy-rfi">Copy message</button><button class="btn btn-primary" data-action="send-rfi" data-link="${link}">Open in ${'Messages'} &amp; mark requested</button>`,
      onMount: (root) => {
        let edited = false;
        const sync = () => {
          const keys = $$('#rfi-items input:checked', root).map((i) => i.value);
          if (!edited) $('#rfi-msg', root).value = msg(keys, $('#rfi-name', root).value.trim());
          $('#phone-items', root).innerHTML = keys.map((k, i) => `<div class="border border-line px-2 py-1.5 text-[10.5px] leading-tight text-ink2">${i + 1}. ${esc(s.dps.find((d) => d.key === k).ask)}</div>`).join('');
          $('[data-action="send-rfi"]', root).disabled = !keys.length;
        };
        $('#rfi-msg', root).addEventListener('input', () => { edited = true; });
        $('#rfi-name', root).addEventListener('input', sync);
        $('#rfi-items', root).addEventListener('change', sync);
        root.dataset.channel = 'SMS';
        $$('#rfi-channel button', root).forEach((b) => b.addEventListener('click', () => { $$('#rfi-channel button', root).forEach((x) => x.classList.remove('bg-ink', 'text-white')); b.classList.add('bg-ink', 'text-white'); root.dataset.channel = b.dataset.ch; $('[data-action="send-rfi"]', root).innerHTML = `Open in ${b.dataset.ch === 'SMS' ? 'Messages' : 'Mail'} &amp; mark requested`; }));
        sync();
      },
    });
  }
  function sendRfi(s, link) {
    const root = $('#modal'), keys = $$('#rfi-items input:checked', root).map((i) => i.value), channel = root.dataset.channel || 'SMS';
    const name = $('#rfi-name').value.trim(), phone = $('#rfi-phone').value.trim(), email = $('#rfi-email').value.trim(), body = $('#rfi-msg').value;
    if (channel === 'SMS' && !phone) { toast('Add a mobile number'); $('#rfi-phone').focus(); return; }
    if (channel === 'Email' && !email) { toast('Add an email address'); $('#rfi-email').focus(); return; }
    s.fm = { name: name || 'Facility contact', title: '', phone, email };
    const c = s.contacts.find((x) => x.id === 'fm'); if (c && name) Object.assign(c, { name, title: 'Facility contact', phone, email, last: `Text request, ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` });
    keys.forEach((k) => { s.dps.find((x) => x.key === k).rfi = { to: name || phone || email, at: nowISO(), channel, link }; });
    log(s, `Requested ${keys.length} item${keys.length > 1 ? 's' : ''} from ${name || 'facility'} by ${channel}`);
    const href = channel === 'SMS' ? `sms:${phone.replace(/[^0-9+]/g, '')}?&body=${encodeURIComponent(body)}` : `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(`${s.address}: battery storage evaluation`)}&body=${encodeURIComponent(body)}`;
    closeModal(); refreshSite(s); renderPocs(s);
    window.location.href = href;
    toast(`Marked ${keys.length} item${keys.length > 1 ? 's' : ''} as requested`);
  }
  /* ----------------------------------------------------- activity */
  function log(s, text) { s.activity.unshift({ t: nowISO(), who: EQ.TEAM[EQ.CURRENT_USER].name, text }); }
  const actItem = (a) => `<li><div class="text-[13px] text-ink leading-snug">${esc(a.text)}</div><div class="text-[11.5px] text-mute mt-0.5">${esc(a.who)} · ${relTime(a.t)}</div></li>`;
  function renderActivity(s) {
    $('#site-activity').innerHTML = `<div class="panel-head"><div class="eyebrow flex-1">Activity</div><button class="link text-[12px]" data-action="activity-all">All</button></div>
      <ol class="px-5 py-4 tl space-y-3.5">${s.activity.slice(0, 5).map(actItem).join('')}</ol>`;
  }

  /* ----------------------------------------------------- gate / stage */
  function openGateModal(s) {
    const g = gateChecks(s);
    openModal({
      title: `Gate: ${esc(stageLabel(g.next))}`, subtitle: `${esc(s.name)} · currently ${esc(stageLabel(s.stage))}`,
      body: `<ul class="border border-line">${g.checks.map((c) => `<li class="flex items-center justify-between gap-4 px-4 py-3 border-t border-line2 first:border-t-0"><span class="text-[13px] text-ink">${esc(c.label)}</span>${tag(c.pass ? 'ok' : 'gap', c.pass ? 'Met' : 'Not met')}</li>`).join('')}</ul>
        ${g.pass ? '' : '<p class="text-[12.5px] text-ink2 mt-3">Resolve the open checks in the site record or the documents register.</p>'}`,
      footer: `<button class="btn btn-ghost" data-action="close-modal">Close</button><button class="btn btn-primary" data-action="advance-stage" ${g.pass ? '' : 'disabled'}>Advance to ${esc(EQ.STAGES[g.next].label)}</button>`,
    });
  }
  function advanceStage(s) {
    const g = gateChecks(s); if (!g.pass) return;
    const from = s.stage; s.stage = g.next;
    log(s, `Advanced from ${stageLabel(from)} to ${stageLabel(g.next)}`);

    persist(); closeModal(); renderSite(s); renderStageRail(); toast(`${esc(s.name)} → ${esc(stageLabel(g.next))}`);
  }
  function openScoreBreakdown(s) {
    openModal({
      title: 'Design readiness', subtitle: 'Weighted score of the site data needed for the permit plan set and interconnection application.', size: 'max-w-3xl',
      body: `<p class="text-[13px] text-ink2 mb-4">A data point counts when captured from a qualifying source. Low-confidence reads and manual entries count once an engineer confirms them. The gate from ${stageLabel('proposal')} to ${stageLabel('design')} requires ≥ 85 and no blocking items.</p>
        <table class="tbl w-full"><thead><tr><th>Data point</th><th>Section</th><th>Status</th><th class="text-right">Weight</th></tr></thead><tbody>
        ${sectionScores(s).map((p) => p.dps.map((d) => `<tr data-action="open-dp" data-dp="${d.key}"><td>${esc(d.label)}</td><td class="text-ink2 text-[12px]">${esc(p.name)}</td><td>${statusTag(d)}</td><td class="text-right num">${dpStatus(d) === 'ok' ? d.pts : 0} / ${d.pts}</td></tr>`).join('')).join('')}
        <tr class="!cursor-default"><td colspan="3">Total</td><td class="text-right num">${score(s)} / 100</td></tr></tbody></table>`,
    });
  }

  /* ----------------------------------------------------- documents register */
  const DOC_STATUS = { not_started: ['Not started', 'muted'], in_progress: ['In progress', 'gap'], submitted: ['Submitted', 'ok'], complete: ['Complete', 'ink'], na: ['At decommissioning', 'muted'] };
  function renderDocs(s) {
    const groups = ['Permit plan set', 'Approvals', 'NFPA 855 records'];
    const done = s.docs.filter((d) => d.status === 'complete').length, req = s.docs.filter((d) => d.status !== 'na').length;
    $('#site-docs').innerHTML = `
      <div class="panel-head"><h3 class="h-section !text-[19px] flex-1">Documents &amp; approvals</h3><span class="text-[12px] text-mute num">${done}/${req} complete</span></div>
      <div class="overflow-x-auto"><table class="tbl w-full min-w-[720px]"><thead><tr><th>Document</th><th>Reference</th><th>Step</th><th>Status</th><th>Evidence</th></tr></thead><tbody>
      ${groups.map((g) => `<tr class="!cursor-default"><td colspan="5" class="!py-2 !bg-paper text-[11px] uppercase tracking-[.08em] text-brown">${g}</td></tr>` + s.docs.filter((d) => d.group === g).map((d) => `
        <tr class="!cursor-default">
          <td><div class="text-ink">${esc(d.name)}</div><div class="text-[11px] text-mute">${d.permitNo ? `${esc(d.permitNo)}${d.permitNote ? ' · ' + esc(d.permitNote) : ''} · ` : ''}${d.updated ? `Updated ${fmtDate(d.updated)}` : ''}</div></td>
          <td class="text-[12px] text-ink2 whitespace-nowrap">${esc(d.ref)}</td>
          <td class="text-[12px] text-ink2 whitespace-nowrap num">${d.due === 'end' ? '—' : esc(EQ.STAGES[d.due].label)}</td>
          <td>${d.status === 'na' ? tag('muted', DOC_STATUS.na[0]) : `<select class="field h-7 pl-2 text-[12px]" data-doc="${d.key}" aria-label="Status of ${esc(d.name)}">${['not_started', 'in_progress', 'submitted', 'complete'].map((k) => `<option value="${k}" ${d.status === k ? 'selected' : ''}>${DOC_STATUS[k][0]}</option>`).join('')}</select>`}</td>
          <td class="text-[11.5px] text-ink2">${d.evidence ? `<span class="font-mono">${esc(d.evidence.file)}</span><div class="text-mute">${esc(d.evidence.by)}</div>` : d.status === 'complete' ? '<span class="text-alert">No evidence</span>' : '—'}</td>
        </tr>`).join('')).join('')}</tbody></table></div>
      <div class="px-5 py-3 border-t border-line2 text-[11.5px] text-mute">NFPA 855 section numbers follow EQORE's document checklist; cite the edition the AHJ has adopted (see codes panel). Access: AHJ and facility read the full record; first responders see the public page.</div>`;
  }
  function openEvidenceModal(s, key) {
    const d = s.docs.find((x) => x.key === key);
    const missing = (EQ.DOC_PREREQ[key] || []).filter((k) => (s.docs.find((x) => x.key === k) || {}).status !== 'complete');
    if (missing.length) { toast(`Complete first: ${missing.map((k) => s.docs.find((x) => x.key === k).name).join(', ')}`); renderDocs(s); return; }
    openModal({
      title: `Complete: ${esc(d.name)}`, subtitle: 'A completed document needs its evidence file and a sign-off.', size: 'max-w-lg',
      body: `<label class="block text-[12px] text-mute mb-1" for="ev-file">Evidence file</label><input id="ev-file" class="field w-full h-10 px-3 font-mono text-[13px]" value="${esc(`${s.code}_${key}.pdf`)}" />
        ${d.permit ? `<label class="block text-[12px] text-mute mb-1 mt-4" for="ev-no">Permit number</label><input id="ev-no" class="field w-full h-10 px-3 font-mono text-[13px]" value="${esc(d.permitNo || '')}" />` : ''}
        <label class="block text-[12px] text-mute mb-1 mt-4" for="ev-by">Signed off by</label><input id="ev-by" class="field w-full h-10 px-3 text-[13px]" value="${esc(EQ.TEAM[EQ.CURRENT_USER].name)}" />`,
      footer: `<button class="btn btn-ghost" data-action="cancel-evidence">Cancel</button><button class="btn btn-primary" data-action="save-evidence" data-doc="${key}">Mark complete</button>`,
    });
  }
  function renderCodes(s) {
    const ia = (REF().interconnection || {})[s.utility];
    if (!s.sf) {
      const F = (id) => EQ.addrField(s, id), row = (id, n) => { const f = F(id); return EQ.addrHas(f) ? [n || f.label, f.source_url, String(f.display).slice(0, 140), id] : null; };
      const codes = (REF().codes || []).filter((c) => !c.region || c.region === s.region).map((c) => [c.code, c.url, c.scope]);
      const items = [row('z_jur', 'Jurisdiction'), row('d_fire', 'Fire authority'), row('z_zone', 'Zoning'), row('d_code'), ...codes, ia ? [ia.name, ia.url, ia.summary] : null].filter(Boolean);
      $('#site-codes').innerHTML = `<div class="panel-head"><div class="eyebrow flex-1">AHJ, codes &amp; utility</div></div>
        <ul class="text-[12.5px]">${items.map(([n, u, d, id]) => `<li class="px-5 py-2.5 border-t border-line2 first:border-t-0"><div>${id ? `<button class="link" data-action="source" data-src="${EQ.addrSrc(id)}" data-title="${esc(n)}">${esc(n)}</button>` : extLink(u, n)}</div><div class="text-[11.5px] text-ink2">${esc(d)}</div></li>`).join('')}</ul>`;
      return;
    }
    const items = [
      ['SF Department of Building Inspection', 'https://sf.gov/departments/department-building-inspection', 'Building and electrical permits, inspections'],
      ['SF Fire Department', 'https://sf-fire.org/', 'Fire permit and ESS review (CFC §1207)'],
      ['SF Planning · PIM', rec(s).pim || 'https://sfplanninggis.org/PIM/', `Zoning and parcel ${s.apn}`],
      ['2025 California Building Standards Code', 'https://www.dgs.ca.gov/BSC/Codes', 'CBC / CFC / CEC, eff. Jan 1, 2026, with SF amendments'],
      ['NFPA 855 (2026)', 'https://link.nfpa.org/free-access/publications/855/2026', 'Stationary ESS installation; free read-only'],
      ia ? [ia.name, ia.url, ia.summary] : null,
      ['DataSF permits & benchmarking', 'https://data.sfgov.org/', 'Source of this record'],
    ].filter(Boolean);
    $('#site-codes').innerHTML = `<div class="panel-head"><div class="eyebrow flex-1">AHJ, codes &amp; utility</div></div>
      <ul class="text-[12.5px]">${items.map(([n, u, d]) => `<li class="px-5 py-2.5 border-t border-line2 first:border-t-0"><div>${extLink(u, n)}</div><div class="text-[11.5px] text-ink2">${esc(d)}</div></li>`).join('')}</ul>`;
  }
  /* ----------------------------------------------------- responder page */
  function renderResponder(s) {
    const published = stageIdx(s) >= EQ.stageIdx('install');
    if (!published) {
      $('#view-responder').innerHTML = `<span class="wordmark">EQORE</span><p class="mt-10 text-ink2">No public emergency information is published for this address.</p>`;
      return;
    }
    const sys = s.system, fm = s.contacts.find((c) => c.id === 'fm');
    const pto = (s.docs.find((d) => d.key === 'pto') || {}).status === 'complete';
    const fdw = s.docs.find((d) => d.key === 'fdwalk') || {};
    const rows = [['System', `QorePack battery energy storage · ${fmt(sys.kw)} kW / ${fmt(sys.kwh)} kWh · ${pto ? 'energized' : 'installed, not yet energized'}`], ['Technology', 'Lithium-ion, UL 9540 listed; chemistry and response data in the SDS at the disconnect'],
      ['Location', s.location], ['BESS AC disconnect', s.disc || '—'], ['Emergency stop', s.eStop || '—'],
      ['Other energy sources', [s.solarKw ? `${fmt(s.solarKw)} kW PV — disconnect: ${s.pvDisc || 'see placard'}` : null, s.opMode === 'backup' ? 'Backup mode: critical-load panel can stay energized from the battery during a grid outage' : null].filter(Boolean).join('. ') || 'None']];
    $('#view-responder').innerHTML = `
      <div class="flex items-baseline justify-between"><span class="wordmark">EQORE</span><a href="#/site/${s.id}" class="link text-[12px] no-print">Full record (sign-in)</a></div>
      <div class="eyebrow mt-8">Energy storage system · emergency information</div>
      <h1 class="display text-[30px] mt-1">${esc(s.name)}</h1>
      <p class="text-ink2">${esc(s.address)}, ${esc(s.city)}, ${s.state} ${s.zip}</p>
      <div class="mt-5 border border-alert bg-white px-4 py-3 text-[13.5px] text-ink"><b class="text-alert">Hazards.</b> A battery in thermal runaway can release flammable and toxic gases, can deflagrate, and can re-ignite hours after it appears out. Modules stay energized after the system is isolated. Do not open the enclosure doors.</div>
      <section class="panel mt-5"><dl>${rows.map(([k, v]) => `<div class="px-5 py-3 border-t border-line2 first:border-t-0 grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-1"><dt class="text-[12px] text-mute">${k}</dt><dd class="text-[14px] text-ink">${esc(v)}</dd></div>`).join('')}</dl></section>
      <section class="panel mt-5"><div class="panel-head"><div class="eyebrow">Isolation</div></div>
        <ol class="py-4 pr-5 pl-10 space-y-2 text-[13.5px] text-ink list-decimal">
          <li>Call EQORE for remote shutdown and live battery data: <a class="link num" href="tel:+18575242870">(857) 524-2870</a>.</li>
          <li>Isolate at the BESS AC disconnect: ${esc(s.disc || 'see placard')}.</li>
          ${s.solarKw ? `<li>Isolate PV separately: ${esc(s.pvDisc || 'see placard')}.</li>` : ''}
          ${s.opMode === 'backup' ? '<li>Backup systems: building circuits on the critical-load panel may remain energized from the battery.</li>' : ''}
          <li>Use the emergency stop only where it can be reached without approaching an affected enclosure.</li>
          <li>Follow the site emergency operations plan; SDS is posted at the disconnect.</li></ol></section>
      <section class="panel mt-5"><div class="panel-head"><div class="eyebrow">Contacts</div></div>
        <ul class="text-[13.5px]"><li class="px-5 py-3 flex justify-between gap-4"><span>EQORE</span><a class="link num" href="tel:+18575242870">(857) 524-2870</a></li>
        <li class="px-5 py-3 border-t border-line2 flex justify-between gap-4"><span>${esc(fm.name)}, ${esc(fm.title)}</span>${fm.phone ? `<a class="link num" href="tel:${esc(fm.phone.replace(/[^0-9]/g, ''))}">${esc(fm.phone)}</a>` : ''}</li></ul></section>
      <p class="text-[12px] text-mute mt-5">${fdw.status === 'complete' ? `Reviewed with ${esc(s.fireDept)} ${fdw.updated ? fmtDate(fdw.updated) : ''}.` : `Pending review with ${esc(s.fireDept)}.`} Commissioning records, O&amp;M logs and drawings require sign-in.</p>`;
  }
  /* ----------------------------------------------------- files */
  function renderVault(s) {
    const cats = [['all', 'All'], ['pdf', 'Documents'], ['data', 'Data'], ['img', 'Photos'], ['gis', 'GIS']];
    const match = (f, k) => k === 'all' || (k === 'data' ? ['csv', 'xlsx'].includes(f.type) : f.type === k);
    const files = s.files.filter((f) => match(f, S.vaultFilter));
    $('#site-vault').innerHTML = `
      <div class="panel-head flex-wrap"><h3 class="h-section !text-[19px] flex-1">Files</h3>
        <div class="flex text-[12px] border border-line">${cats.map(([k, l]) => `<button class="px-3 h-7 ${S.vaultFilter === k ? 'bg-ink text-white' : ''}" data-action="vault-filter" data-f="${k}">${l} <span class="opacity-60 num">${s.files.filter((f) => match(f, k)).length}</span></button>`).join('')}</div></div>
      <div class="overflow-x-auto"><table class="tbl w-full min-w-[820px]"><thead><tr><th>File</th><th>From</th><th>Origin</th><th>Date</th><th>Reliability</th><th>Supports</th></tr></thead><tbody>
      ${files.map((f) => `<tr data-action="open-file" data-file="${f.id}">
        <td><div class="flex items-center gap-3">${ficon(f.type)}<div class="min-w-0"><div class="font-mono text-[12px] text-ink truncate max-w-[300px]">${esc(f.name)}${f.isNew ? ' <span class="stamp ml-1">new</span>' : ''}</div><div class="text-[11.5px] text-mute">${esc(f.cat)} · ${esc(f.size)}</div></div></div></td>
        <td><div class="text-[12.5px]">${esc(f.uploader.name)}</div><div class="text-[11.5px] text-mute">${esc(f.uploader.role)}</div></td>
        <td class="text-[12px] text-ink2">${esc(f.origin)}</td>
        <td class="text-[12px] text-ink2 num whitespace-nowrap">${fmtDate(f.date)}</td>
        <td class="text-[12px]">${tag(f.conf === 'medium' ? 'gap' : 'ok', f.confLabel)}</td>
        <td class="text-[12px] text-ink2">${f.dps.map((k) => (s.dps.find((d) => d.key === k) || {}).label).filter(Boolean).join(', ')}</td></tr>`).join('') || '<tr><td colspan="6" class="text-center text-mute !py-8">No files.</td></tr>'}</tbody></table></div>`;
  }
  function fileParams(s, f) {
    if (f.preview === 'permits') return [['Records', `${rec(s).permits.length}`], ['Building', `${rec(s).permits.filter((p) => p.kind === 'Building').length}`], ['Electrical', `${rec(s).permits.filter((p) => p.kind === 'Electrical').length}`], ['Snapshot', EQ.ASOF]];
    if (f.preview === 'doc') return f.extracted || [['File', f.name]];
    if (f.preview === 'addr') { const m = EQ.addrDoc(s).record.summary; return [['Fields', `${EQ.addrDoc(s).record.fields.length}`], ['Required filled', `${m.required_done_pct}%`], ['Sources', `${EQ.addrDoc(s).record.sources.length}`], ['Built', f.date]]; }
    if (f.preview === 'bench') { const l = latestKwh(s); return [['Years', `${rec(s).benchmark.length}`], ['Latest reported', l ? `${l.year}: ${fmt(l.kwh)} kWh` : '—'], ['Floor area', `${fmt(s.floorArea)} sf`], ['Built', `${s.yearBuilt}`]]; }
    return [['File', f.name], ['Size', f.size], ['Received', f.date]];
  }
  function filePreview(s, f) {
    if (f.preview === 'permits') return `<div class="max-h-[420px] overflow-y-auto">${rec(s).permits.slice(0, 40).map((p) => permitCard(s, p)).join('')}</div>`;
    if (f.preview === 'bench') return benchTable(s, null);
    if (f.preview === 'doc') return `<a href="${esc(f.pdf || f.img)}" target="_blank" rel="noopener" class="block border border-line bg-white"><img src="${esc(f.img)}" alt="${esc(f.name)}" class="w-full" /></a>
      <div class="flex flex-wrap gap-x-4 text-[11.5px] text-mute mt-2">${f.pdf ? `<a class="link" href="${esc(f.pdf)}" target="_blank" rel="noopener">Open PDF</a>` : ''}<a class="link" href="${esc(f.img)}" target="_blank" rel="noopener">Open full size</a>${f.imgNote ? `<span>${esc(f.imgNote)}</span>` : ''}</div>`;
    if (f.preview === 'addr') return addrSummaryHTML(s) + `<div class="mt-3 max-h-[420px] overflow-y-auto">${EQ.addrDoc(s).record.sources.map((x) => `<div class="border-t border-line2 py-2 text-[12px]"><div class="text-ink">${extLink(x.url, x.source_label)}</div><div class="text-mute">${esc(x.vintage || '')} · ${esc(x.license || '')} · ${esc(x.status)}</div><div class="text-ink2">${esc(x.summary || '')}</div></div>`).join('')}</div>`;
    if (f.thumb) return `<img src="${f.thumb}" alt="${esc(f.name)}" class="w-full border border-line" />`;
    return `<div class="paper-doc p-6 text-[13px] text-ink2">${esc(f.name)} · ${esc(f.size)}. Preview not available for this file type; values are entered from it by the engineer.</div>`;
  }
  function openFileModal(s, fileId) {
    const f = s.files.find((x) => x.id === fileId); if (!f) return;
    const linked = f.dps.map((k) => s.dps.find((d) => d.key === k)).filter(Boolean);
    openModal({
      title: `<span class="font-mono text-[15px]">${esc(f.name)}</span>`, subtitle: `${esc(f.cat)} · ${esc(f.size)} · ${esc(f.origin)} · ${fmtDate(f.date)}`, size: 'max-w-5xl',
      body: `<div class="grid grid-cols-1 lg:grid-cols-12 gap-6"><div class="lg:col-span-7">${filePreview(s, f)}</div>
        <div class="lg:col-span-5 space-y-5">
          <div><div class="text-[11.5px] text-mute">From</div><div class="text-[14px] text-ink">${esc(f.uploader.name)}</div><div class="text-[12px] text-ink2">${esc(f.uploader.role)}</div><div class="mt-1">${tag(f.conf === 'medium' ? 'gap' : 'ok', f.confLabel)}</div></div>
          <div><div class="eyebrow mb-2">Extracted</div><dl class="border border-line">${fileParams(s, f).map(([k, val]) => `<div class="flex justify-between gap-4 px-3 py-2 border-t border-line2 first:border-t-0 text-[12.5px]"><dt class="text-mute">${esc(k)}</dt><dd class="text-ink text-right num">${esc(val)}</dd></div>`).join('')}</dl></div>
          <div><div class="eyebrow mb-2">Supports</div>${linked.map((d) => `<button class="w-full flex items-center justify-between gap-2 px-3 py-2.5 border border-line mb-1.5 hover:border-ink text-left" data-action="open-dp" data-dp="${d.key}"><span class="text-[12.5px] text-ink">${esc(d.label)}</span>${statusTag(d)}</button>`).join('')}</div>
        </div></div>`,
      footer: `<button class="btn btn-secondary" data-action="copy-citation" data-file="${f.id}">Copy citation</button>${f.key === 'csv' ? '<button class="btn btn-secondary" data-action="download-csv">Export peak-day CSV</button>' : ''}<button class="btn btn-primary" data-action="close-modal">Close</button>`,
    });
  }

  /* ----------------------------------------------------- contacts */
  function renderPocs(s) {
    $('#site-pocs').innerHTML = `<div class="flex items-baseline justify-between mb-3"><h3 class="h-section !text-[19px]">Contacts</h3></div>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 border-l border-t border-line bg-white">${s.contacts.map((c) => `
        <button class="text-left p-5 border-r border-b border-line hover:bg-paper flex flex-col gap-2" data-action="open-poc" data-poc="${c.id}">
          <span class="eyebrow !text-[10px]">${esc(c.group)} · ${esc(c.role)}</span>
          <span class="text-[14px] text-ink leading-snug">${esc(c.name)}</span>
          <span class="text-[12px] text-ink2">${esc(c.title)}${c.agency || !c.org ? '' : ` · ${esc(c.org)}`}</span>
          <span class="text-[11.5px] text-mute mt-auto pt-2">${esc(c.last)}</span></button>`).join('')}</div>`;
  }
  function openPocModal(s, id) {
    const c = s.contacts.find((x) => x.id === id);
    const related = id === 'fm' ? relevant(s).filter((d) => d.owner === 'fm' && d.value == null) : { bo: ['bldg', 'insp'], fire: ['firep', 'fdwalk'], wire: ['elec'], util: ['iaapp', 'iaok', 'witness', 'pto'] }[id] ? s.docs.filter((d) => ({ bo: ['bldg', 'insp'], fire: ['firep', 'fdwalk'], wire: ['elec'], util: ['iaapp', 'iaok', 'witness', 'pto'] }[id]).includes(d.key)) : [];
    openModal({
      title: esc(c.name), subtitle: `${esc(c.role)} · ${esc(c.title)}${c.org ? ' · ' + esc(c.org) : ''}`, size: 'max-w-lg',
      body: `<dl class="border border-line text-[13px]">
        ${c.email ? `<div class="flex justify-between gap-4 px-4 py-2.5"><dt class="text-mute">Email</dt><dd><a class="link" href="mailto:${esc(c.email)}">${esc(c.email)}</a></dd></div>` : ''}
        ${c.phone ? `<div class="flex justify-between gap-4 px-4 py-2.5 border-t border-line2"><dt class="text-mute">Phone</dt><dd><a class="link num" href="tel:${esc(c.phone.replace(/[^0-9]/g, ''))}">${esc(c.phone)}</a></dd></div>` : ''}
        ${c.agency ? `<div class="flex justify-between gap-4 px-4 py-2.5"><dt class="text-mute">Portal</dt><dd>${c.portal ? extLink(c.portal, c.portalName) : `<span class="text-ink2">${esc(c.portalName)}</span>`}</dd></div>` : ''}
        <div class="flex justify-between gap-4 px-4 py-2.5 border-t border-line2"><dt class="text-mute">Responsible for</dt><dd class="text-right">${c.holds.map(esc).join('<br>')}</dd></div>
        <div class="flex justify-between gap-4 px-4 py-2.5 border-t border-line2"><dt class="text-mute">Last contact</dt><dd>${esc(c.last)}</dd></div></dl>
        ${related.length ? `<div class="eyebrow mt-5 mb-2">${id === 'fm' ? 'Open items' : 'Permits'}</div><ul class="border border-line">${related.map((d) => `<li class="flex justify-between gap-3 px-4 py-2.5 border-t border-line2 first:border-t-0 text-[13px]"><span>${esc(d.label || d.name)}</span>${d.status ? tag(DOC_STATUS[d.status][1], DOC_STATUS[d.status][0]) : statusTag(d)}</li>`).join('')}</ul>` : ''}`,
      footer: `<button class="btn btn-secondary" data-action="log-touch" data-poc="${c.id}">Log contact</button>${id === 'fm' && related.some((d) => dpStatus(d) === 'missing') ? '<button class="btn btn-primary" data-action="open-rfi">Send request</button>' : '<button class="btn btn-primary" data-action="close-modal">Close</button>'}`,
    });
  }
  function openSatelliteModal(s) {
    openModal({ title: 'Aerial', subtitle: `${esc(s.address)} · APN ${esc(s.apn)} · Esri World Imagery`, size: 'max-w-4xl',
      body: `<div id="sat-big" class="h-[480px] border border-line"></div><div class="text-[12px] text-ink2 mt-2">Click two points to measure distance in feet (e.g. pad to lot line). Outdoor ESS needs 10 ft to lot lines and buildings, or 3 ft with a rated barrier (CFC §1207).</div>`,
      onMount: () => {
        const m = L.map('sat-big', { maxZoom: 21 }).setView([s.lat, s.lng], 19);
        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 21, maxNativeZoom: 19, attribution: 'Imagery © Esri' }).addTo(m);
        L.circleMarker([s.lat, s.lng], { radius: 6, color: '#fff', weight: 2, fillColor: '#06162b', fillOpacity: 1 }).bindTooltip('Address point').addTo(m);
        let first = null, dot = null;
        m.on('click', (e) => {
          if (!first) { first = e.latlng; dot = L.circleMarker(first, { radius: 4, color: '#fff', fillColor: '#ac312c', fillOpacity: 1 }).addTo(m); return; }
          const ft = first.distanceTo(e.latlng) * 3.28084;
          L.polyline([first, e.latlng], { color: '#fff', weight: 2, dashArray: '4 3' }).bindTooltip(`${fmt(ft)} ft`, { permanent: true, className: 'eq-zone-label' }).addTo(m);
          if (dot) m.removeLayer(dot); first = null;
        });
        setTimeout(() => m.invalidateSize(), 80);
      } });
  }
  /* =================================================================
     SEARCH & EVENTS
     ================================================================= */
  function renderSearchResults(q) {
    const box = $('#search-results');
    if (!q) { box.classList.add('hidden'); return; }
    const res = S.sites.filter((s) => matchesQuery(s, q)).slice(0, 6);
    box.innerHTML = res.length ? res.map((s) => `<button class="w-full flex items-baseline justify-between gap-3 px-3 py-2.5 hover:bg-paper text-left border-t border-line2 first:border-t-0" data-action="open-site" data-id="${s.id}">
        <span class="min-w-0"><span class="block text-[13px] text-ink truncate">${esc(s.name)}</span><span class="block text-[11.5px] text-mute truncate">${esc(s.address)}, ${esc(s.city)} · APN <span class="font-mono">${esc(s.apn)}</span></span></span>
        <span class="text-[11px] text-mute shrink-0">${esc(stepLabel(s))}</span></button>`).join('') : `<div class="px-3 py-4 text-[13px] text-mute">No match for “${esc(q)}”</div>`;
    box.classList.remove('hidden');
  }
  const currentSite = () => (S.route.view === 'site' ? site(S.route.id) : null);

  document.addEventListener('click', (e) => {
    if (!e.target.closest('#user-menu-btn') && !e.target.closest('#user-menu')) $('#user-menu').classList.add('hidden');
    if (!e.target.closest('#search-results') && !e.target.closest('#global-search')) $('#search-results').classList.add('hidden');
    const el = e.target.closest('[data-action]'); if (!el) return;
    const stopper = e.target.closest('[data-stop]');
    const a = el.dataset.action;
    if (stopper && !stopper.contains(el) && a === 'open-dp') return;
    if (e.target.closest('select')) return;
    const s = currentSite();
    switch (a) {
      case 'close-modal': closeModal(); break;
      case 'open-site': {
        e.preventDefault(); $('#search-results').classList.add('hidden');
        const dp = el.dataset.dp; go(el.dataset.id);
        if (dp) setTimeout(() => { const row = $(`[data-dp-row="${dp}"]`); if (row) { row.scrollIntoView({ behavior: 'smooth', block: 'center' }); row.classList.add('flash'); } }, 250);
        break;
      }
      case 'addr-section': if (s) { S.addrSection = S.addrSection === el.dataset.sec || (S.addrSection == null && el.dataset.sec === [...new Set(EQ.addrDoc(s).record.fields.map((f) => f.section))][0]) ? '' : el.dataset.sec; renderAddr(s); } break;
      case 'set-intake': if (s) {
        const i = +el.dataset.i; s.intake = i; log(s, `Step set to ${EQ.INTAKE[i].n} ${EQ.INTAKE[i].label}`); persist();
        $('#site-intake').innerHTML = intakeHTML(s); toast(`${esc(s.name)} · ${esc(EQ.INTAKE[intakeIdx(s)].label)}`);
      } break;
      case 'stage-filter':
        S.filters.stage = S.filters.stage === el.dataset.stage && el.dataset.stage !== 'all' ? 'all' : el.dataset.stage;
        if (S.route.view !== 'pipeline') go(null); else { renderStageRail(); renderPipeline(); }
        break;
      case 'clear-filter':
        e.stopPropagation(); S.filters[el.dataset.f] = el.dataset.f === 'q' ? '' : 'all';
        if (el.dataset.f === 'q') $('#global-search').value = '';
        if (el.dataset.f === 'region') $('#region-filter').value = 'all';
        renderStageRail(); renderPipeline(); break;
      case 'clear-all-filters':
        S.filters = { q: '', region: 'all', stage: 'all' }; $('#global-search').value = ''; $('#region-filter').value = 'all';
        renderStageRail(); renderPipeline(); fitRegion('all'); break;
      case 'sort': { const k = el.dataset.key; S.sort = S.sort.key === k ? { key: k, dir: S.sort.dir === 'asc' ? 'desc' : 'asc' } : { key: k, dir: ['name', 'utility', 'owner', 'intake'].includes(k) ? 'asc' : 'desc' }; renderDirectory(); break; }
      case 'map-jump': fitRegion(el.dataset.region); break;
      case 'map-base': S.mapBase = el.dataset.base; Object.values(R.baseLayers).forEach((l) => R.map.removeLayer(l)); R.baseLayers[S.mapBase].addTo(R.map); syncMapButtons(); break;
      case 'export-directory': exportDirectory(); break;
      case 'reset-demo':
        try { localStorage.removeItem(STORE_KEY); } catch (err) { /* ignore */ }
        S.sites = EQ.buildSites(); S.sites = S.sites.concat(EQ.buildLeadSites(new Set(S.sites.map((x) => x.id)))); S.chart.threshold = {}; $('#user-menu').classList.add('hidden'); onRoute(); toast('Demo data reset'); break;
      case 'shortcuts':
        $('#user-menu').classList.add('hidden');
        openModal({ title: 'Keyboard shortcuts', size: 'max-w-md', body: `<dl class="text-[13px] border border-line">${[['/', 'Search'], ['Esc', 'Close dialog'], ['g p', 'Projects'], ['1–4', 'Jump to section']].map(([k, v]) => `<div class="flex justify-between px-4 py-2.5 border-t border-line2 first:border-t-0"><dt>${v}</dt><dd><kbd class="font-mono text-[11px] border border-line px-1.5">${k}</kbd></dd></div>`).join('')}</dl>` });
        break;
      case 'open-dp': if (s) { e.stopPropagation(); openDpModal(s, el.dataset.dp); } break;
      case 'toggle-verify': e.stopPropagation(); if (s) { toggleVerify(s, el.dataset.dp); if (el.dataset.close) closeModal(); } break;
      case 'resolve-dp': e.stopPropagation(); if (s) openResolveModal(s, el.dataset.dp); break;
      case 'confirm-resolve': if (s) confirmResolve(s, el.dataset.dp); break;
      case 'open-rfi': e.stopPropagation(); if (s) openRfiModal(s, el.dataset.dp); break;
      case 'send-rfi': if (s) sendRfi(s, el.dataset.link); break;
      case 'simulate-upload': e.stopPropagation(); if (s) simulateUpload(s, el.dataset.dp); break;
      case 'open-file': e.stopPropagation(); if (s) openFileModal(s, el.dataset.file); break;
      case 'vault-filter': S.vaultFilter = el.dataset.f; if (s) renderVault(s); break;
      case 'open-poc': if (s) openPocModal(s, el.dataset.poc); break;
      case 'copy-text': copy(el.dataset.text, 'Copied'); break;
      case 'log-touch': if (s) { const c = s.contacts.find((x) => x.id === el.dataset.poc); c.last = `Contact logged, ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`; log(s, `Logged contact with ${c.name}`); closeModal(); renderPocs(s); refreshSite(s); toast(`Logged contact with ${esc(c.name)}`); } break;
      case 'copy-citation': if (s) { const f = s.files.find((x) => x.id === el.dataset.file); copy(`${f.name} — ${f.uploader.name} (${f.uploader.role}), ${f.origin}, ${fmtDate(f.date)}. ${f.confLabel}. ${s.name}, ${s.address}, ${s.city}.`, 'Citation copied'); } break;
      case 'download-csv': if (s) downloadCsv(s); break;
      case 'open-gate': if (s) openGateModal(s); break;
      case 'source': if (s) { e.stopPropagation(); openSource(s, el.dataset.src, el.dataset.title, el.dataset.url); } break;
      case 'goto-permits': closeModal(); { const t = $('#site-permits'); if (t) t.scrollIntoView({ behavior: 'smooth' }); } break;
      case 'area': if (s) openArea(s, el.dataset.area); break;
      case 'save-area': if (s) { const k = el.dataset.area, v = $('#ov-status').value; s.overrides = s.overrides || {}; if (v) s.overrides[k] = { status: v, note: $('#ov-note').value.trim(), by: EQ.TEAM[EQ.CURRENT_USER].name }; else delete s.overrides[k]; log(s, `Assessment set for ${EQ.AREAS.find((a) => a.key === k).name}: ${v ? EQ.STATUS[v].label : 'records'}`); closeModal(); refreshSite(s); } break;
      case 'pfilter': S.permitFilter = el.dataset.f; if (s) renderPermits(s); break;
      case 'refresh-permits': if (s) refreshPermits(s); break;
      case 'copy-rfi': copy($('#rfi-msg').value, 'Message copied'); break;
      case 'cancel-evidence': closeModal(); if (s) renderDocs(s); break;
      case 'save-evidence': if (s) {
        const d = s.docs.find((x) => x.key === el.dataset.doc);
        const file = $('#ev-file').value.trim(), by = $('#ev-by').value.trim();
        if (!file || !by) { toast('Evidence file and sign-off are required'); break; }
        d.status = 'complete'; d.updated = new Date().toISOString().slice(0, 10); d.evidence = { file, by, at: d.updated };
        if ($('#ev-no')) { d.permitNo = $('#ev-no').value.trim() || d.permitNo; d.permitNote = 'Issued'; }
        log(s, `${d.name}: complete (${file}, ${by})`); closeModal(); renderScore(s); renderDocs(s); renderActivity(s); persist(); toast(`${esc(d.name)} complete`);
      } break;
      case 'advance-stage': if (s) advanceStage(s); break;
      case 'score-breakdown': if (s) openScoreBreakdown(s); break;
      case 'scroll-section': { const t = $(`#section-${el.dataset.p}`); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); break; }
      case 'chart-tab': S.chart.tab = el.dataset.tab; if (s) updateLoadChart(s); break;
      case 'chart-day': S.chart.day = el.dataset.day; if (s) updateLoadChart(s); break;
      case 'open-satellite': if (s) openSatelliteModal(s); break;
      case 'print-placard': if (s) { location.hash = `#/responder/${s.id}`; setTimeout(() => window.print(), 400); } break;
      case 'activity-all': if (s) openModal({ title: 'Activity', subtitle: esc(s.name), size: 'max-w-xl', body: `<ol class="tl space-y-3.5">${s.activity.map(actItem).join('')}</ol>` }); break;
      default: break;
    }
    icons();
  });

  document.addEventListener('change', (e) => {
    const s0 = currentSite();
    if (s0 && e.target.matches('[data-review]')) { s0.reviewed = s0.reviewed || {}; s0.reviewed[e.target.dataset.review] = e.target.checked; renderFindings(s0); persist(); return; }
    if (s0 && e.target.matches('[data-upload]')) { handleUpload(s0, e.target.dataset.upload, e.target.files[0]); return; }
    const sel = e.target.closest('select[data-doc]'); const s = currentSite();
    if (sel && s) {
      const d = s.docs.find((x) => x.key === sel.dataset.doc);
      if (sel.value === 'complete') { openEvidenceModal(s, d.key); return; }
      d.status = sel.value; d.updated = new Date().toISOString().slice(0, 10); if (d.status !== 'complete') delete d.evidence;
      log(s, `${d.name}: ${DOC_STATUS[d.status][0].toLowerCase()}`); renderScore(s); renderDocs(s); renderActivity(s); persist();
    }
  });

  function copy(text, msg) {
    const done = () => toast(msg);
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done)); else fallbackCopy(text, done);
  }
  function fallbackCopy(text, done) { const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); done(); } catch (e) { toast('Copy failed'); } ta.remove(); }
  function downloadBlob(name, text) { const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' })); const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
  function peakDay(s) {
    const m = s.peakDate.match(/^(\w{3}) (\d{1,2}), (\d{4})/);
    if (!m) return '2026-08-15';
    const mo = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].indexOf(m[1]) + 1;
    return `${m[3]}-${String(mo).padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  }
  function downloadCsv(s) {
    const prof = loadProfile(s, 'peak');
    downloadBlob(`${s.id}_peakday_15min_modeled.csv`, ['interval_start,kw_modeled,kwh_modeled'].concat(prof.map((v, i) => `${peakDay(s)}T${String(Math.floor(i / 4)).padStart(2, '0')}:${String((i % 4) * 15).padStart(2, '0')}:00,${v},${(v * 0.25).toFixed(2)}`)).join('\n'));
    toast('Exported');
  }
  function exportDirectory() {
    const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = [['Facility', 'Address', 'APN', 'Type', 'Floor area sf', 'Latest grid kWh', 'Year', 'Risks', 'Design readiness', 'Step', 'Needs action'].join(',')]
      .concat(sortedSites(filteredSites()).map((s) => { const l = latestKwh(s) || {}; return [s.name, `${s.address}, ${s.city}`, s.apn, s.sector, s.floorArea, l.kwh, l.year, s.findings.filter((f) => f.sev === 'risk').length, score(s), EQ.INTAKE[intakeIdx(s)].label, nextAction(s).text].map(q).join(','); }));
    downloadBlob('eqore_leads.csv', rows.join('\n')); toast('Exported');
  }
  const search = $('#global-search');
  search.addEventListener('input', () => { S.filters.q = search.value.trim(); renderSearchResults(S.filters.q); if (S.route.view === 'pipeline') { renderDirectory(); refreshMap(); } });
  search.addEventListener('focus', () => S.filters.q && renderSearchResults(S.filters.q));
  search.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { const first = $('#search-results [data-id]'); if (first) { go(first.dataset.id); $('#search-results').classList.add('hidden'); search.blur(); } }
    if (e.key === 'Escape') { search.value = ''; S.filters.q = ''; $('#search-results').classList.add('hidden'); if (S.route.view === 'pipeline') renderPipeline(); search.blur(); }
  });
  ['dragover', 'drop'].forEach((ev) => document.addEventListener(ev, (e) => { const z = e.target.closest('[data-drop]'); if (!z) return; e.preventDefault(); if (ev === 'drop' && currentSite()) handleUpload(currentSite(), z.dataset.drop, e.dataTransfer.files[0]); }));
  document.addEventListener('input', (e) => {
    if (e.target.matches('[data-input]')) { const s = currentSite(); if (s) { s.inputs = s.inputs || {}; s.inputs[e.target.dataset.input] = e.target.value.trim(); renderTieIn(s); renderSnapshot(s); persist(); } return; }
    if (e.target.matches('[data-econ]')) { const s = currentSite(); if (s) { S.econ[s.id][e.target.dataset.econ] = e.target.value.replace(/[^0-9.]/g, ''); const pos = e.target.selectionStart; const key = e.target.dataset.econ; renderProposal(s, valueStreams(s)); const f = $(`[data-econ="${key}"]`); f.focus(); try { f.setSelectionRange(pos, pos); } catch (err) { /* ignore */ } } return; }
    if (e.target.matches('[data-role="mobile-search"]')) { S.filters.q = e.target.value.trim(); search.value = S.filters.q; renderDirectory(); refreshMap(); const m = $('[data-role="mobile-search"]'); m.focus(); m.setSelectionRange(m.value.length, m.value.length); }
  });
  $('#region-filter').addEventListener('change', (e) => { S.filters.region = e.target.value; if (S.route.view !== 'pipeline') go(null); renderStageRail(); renderPipeline(); fitRegion(S.filters.region); });
  $('#user-menu-btn').addEventListener('click', () => $('#user-menu').classList.toggle('hidden'));
  let gPressed = false;
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeModal(); return; }
    if (/input|textarea|select/i.test(document.activeElement.tagName)) return;
    if (e.key === '/') { e.preventDefault(); search.focus(); }
    if (e.key === 'g') { gPressed = true; setTimeout(() => (gPressed = false), 800); return; }
    if (gPressed && e.key === 'p') go(null);
    if (S.route.view === 'site' && /^[1-4]$/.test(e.key) && !$('#modal')) { const t = $(`#section-${EQ.SECTIONS[+e.key - 1].key}`); if (t) t.scrollIntoView({ behavior: 'smooth' }); }
  });
  window.addEventListener('hashchange', onRoute);
  window.addEventListener('storage', (e) => {
    if (e.key !== EQ.LEADS_KEY) return;
    const fresh = EQ.buildLeadSites(new Set(S.sites.map((x) => x.id)));
    if (!fresh.length) return;
    S.sites = S.sites.concat(fresh); persist(); onRoute();
    toast(`New lead: ${esc(fresh.map((x) => x.name).join(', '))}`);
  });
  window.addEventListener('resize', () => R.map && R.map.invalidateSize());
  onRoute();
})();
