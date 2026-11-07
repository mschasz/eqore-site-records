/* =============================================================================
   EQORE Site Records — application
   Vanilla JS SPA: hash routing, delegated events, Leaflet, Chart.js.
   ============================================================================= */
(function () {
  'use strict';

  const STORE_KEY = 'eqore.records.v3';
  const S = {
    sites: loadSites(),
    route: { view: 'pipeline', id: null },
    filters: { q: '', region: 'all', stage: 'all' },
    sort: { key: 'stage', dir: 'asc' },
    mapBase: 'streets',
    vaultFilter: 'all',
    chart: { day: 'peak', tab: 'interval', threshold: {} },
  };
  const R = { map: null, pinLayer: null, clusterLayer: null, zoneLayer: null, baseLayers: {}, satThumb: null, loadChart: null, hoverTimer: null };

  function loadSites() {
    try { const raw = localStorage.getItem(STORE_KEY); if (raw) { const v = JSON.parse(raw); if (Array.isArray(v) && v.length) return v; } } catch (e) { /* storage unavailable */ }
    return EQ.buildSites();
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
  const secName = (k) => EQ.SECTIONS.find((x) => x.key === k).name;
  const score = (s) => sectionScores(s).reduce((a, p) => a + p.earned, 0);
  const fieldActive = (s) => EQ.stageIdx(s.stage) >= EQ.stageIdx(EQ.FIELD.from);
  const relevant = (s) => s.dps.filter((d) => d.sec !== 'field' || fieldActive(s));
  const openItems = (s) => relevant(s).filter((d) => dpStatus(d) !== 'ok');
  const criticalOpen = (s) => relevant(s).filter((d) => d.severity === 'critical' && ['missing', 'requested'].includes(dpStatus(d)));
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
  const sysOf = (s) => s.system || Object.assign(sizeFor(s, s.target), { status: 'indicative' });
  const sysStatus = (s) => (s.system ? s.system.status : 'indicative');
  const CAPTURE = 0.9;

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
      case 'assessment':
        checks = [
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
  function tariffOf(s) { return (REF().tariffs || {})[EQ.tariffKey(s)] || null; }
  function seasonOf(t, month) { return (t.summerMonths || [6, 7, 8, 9]).includes(month) ? 'summer' : 'winter'; }
  /* Billing demand for one tariff component over a 96-point day: max inside its TOU window,
     or for Eversource-style rates the greater of peak-window max and a fraction of the all-hours max. */
  function billedDemand(comp, prof, season) {
    const win = comp.windows ? (Array.isArray(comp.windows) ? comp.windows : comp.windows[season]) : null;
    let wmax = 0, all = 0;
    prof.forEach((v, i) => { const h = i / 4; all = Math.max(all, v); if (!win || win.some(([a, b]) => h >= a && h < b)) wmax = Math.max(wmax, v); });
    return comp.offPeakFactor != null ? Math.max(wmax, comp.offPeakFactor * all) : wmax;
  }
  function loadProfile(s, day) {
    const r = rng(hashStr(s.id + day));
    const a = EQ.peakAnchor(s);
    const shape = s.loadShape;
    const cs = REF().comstock || {};
    const ref = shape === 'warehouse' && s.region === 'ma' ? cs.warehouse_ma : null;
    const sig = (x) => 1 / (1 + Math.exp(-x));
    let pts = [];
    if (ref) {
      pts = (day === 'peak' ? ref.peak : ref.weekday).slice();
      if (day === 'weekend') { const mn = Math.min(...pts); pts = pts.map((v) => mn + (v - mn) * 0.3); }
    } else {
      for (let i = 0; i < 96; i++) {
        const h = i / 4; let v;
        if (shape === 'coldchain') v = 0.62 + 0.3 * Math.exp(-((h - a.hour) ** 2) / 10) + 0.05 * sig((h - 6) * 2) * (1 - sig((h - 20) * 1.5));
        else if (shape === 'furnace') {
          // Continuous furnaces with ~90-minute charge/quench cycles: short spikes over a flat base.
          v = 0.45 + 0.2 * sig((h - 6) * 2) * (1 - sig((h - 22) * 1.5));
          if (h >= 6 && h < 22 && i % 6 === 0) v += 0.2 + 0.08 * r();
          if (h >= 6 && h < 22 && i % 6 === 1) v += 0.06;
        } else v = 0.36 + 0.36 * sig((h - 6.2) * 2.4) * (1 - sig((h - 18.6) * 1.6)) + 0.26 * Math.exp(-((h - a.hour) ** 2) / 0.8);
        if (day === 'weekend') v = 0.4 + (v - 0.4) * 0.3;
        pts.push(v);
      }
    }
    pts = pts.map((v) => v * (1 + (r() - 0.5) * 0.03));
    if (day !== 'weekend') { const pi = Math.round(a.hour * 4) % 96; pts[pi] = Math.max(...pts) * 1.03; }
    const max = Math.max(...pts);
    const scale = { peak: 1, weekday: 0.88, weekend: 0.56 }[day];
    return pts.map((v) => +(v / max * s.peakKw * scale).toFixed(1));
  }
  function monthlyPeaks(s) {
    const r = rng(hashStr(s.id + 'mo'));
    const a = EQ.peakAnchor(s);
    const seasonal = s.region === 'ca' ? [0.8, 0.78, 0.76, 0.78, 0.82, 0.88, 0.95, 0.97, 0.96, 0.9, 0.84, 0.81] : [0.82, 0.83, 0.79, 0.75, 0.8, 0.9, 0.96, 0.97, 0.92, 0.82, 0.79, 0.82];
    const order = [11, 12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const names = ['Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'];
    return order.map((m, i) => {
      const v = m === a.month ? 1 : Math.min(0.97, seasonal[m - 1] * (1 + (r() - 0.5) * 0.04));
      return { month: m, m: `${names[i]} ${i < 2 ? '25' : '26'}`, kw: +(v * s.peakKw).toFixed(1) };
    });
  }
  function sizeFor(s, threshold) {
    const prof = loadProfile(s, 'peak');
    const shaveKw = Math.max(0, s.peakKw - threshold);
    const kwhNeeded = prof.reduce((a, v) => a + Math.max(0, v - threshold) * 0.25, 0);
    const kw = Math.max(50, Math.ceil(shaveKw / 0.96 / 50) * 50);
    const kwhReq = kwhNeeded / (0.9 * 0.96); // usable depth of discharge × one-way discharge efficiency
    const kwh = Math.max(kw * 2, Math.ceil(kwhReq / 50) * 50);
    return { shaveKw, kwhNeeded, kw, kwh, product: 'QorePack', modeled: true };
  }
  function demandSavings(s, threshold) {
    const t = tariffOf(s); if (!t) return { annual: null, byComp: [] };
    const shape = loadProfile(s, 'peak').map((v) => v / s.peakKw);
    const byComp = t.components.map((c) => ({ label: c.label, v: 0 }));
    monthlyPeaks(s).forEach((m) => {
      const season = seasonOf(t, m.month);
      const before = shape.map((v) => v * m.kw), after = before.map((v) => Math.min(v, threshold));
      t.components.forEach((c, i) => { byComp[i].v += (billedDemand(c, before, season) - billedDemand(c, after, season)) * (c.rate[season] || 0) * CAPTURE; });
    });
    return { annual: byComp.reduce((a, c) => a + c.v, 0), byComp };
  }
  function valueStreams(s) {
    const P = REF().programs || {};
    const sys = sysOf(s);
    const thr = S.chart.threshold[s.id] ?? s.target;
    const ds = demandSavings(s, thr);
    const t = tariffOf(s);
    const out = [];
    const rateNote = s.utility === 'PG&E' && s.tariff === 'B-19' && s.peakKw < 500 ? ' Peak is below the B-19 500 kW threshold; confirm rate eligibility and Option S.' : '';
    out.push({ name: 'Demand-charge reduction', basis: t ? `${t.name}: ${ds.byComp.filter((c) => c.v > 0.5).map((c) => `${c.label} ${money(c.v)}`).join(' · ') || 'no reduction at this target'}. Target ${fmt(thr)} kW by month, ${CAPTURE * 100}% capture of perfect dispatch.${t.caveat ? ' ' + t.caveat : ''}${rateNote}` : 'Tariff not loaded',
      value: ds.annual != null ? `${money(ds.annual)}/yr` : '—', annual: ds.annual || 0, counted: ds.annual != null, src: t ? t.url : null, srcLabel: t ? t.sourceLabel : '' });
    if (s.region === 'ma') {
      const cs = P.connectedSolutions || {};
      const csKw = Math.min(sys.kw, (0.9 * sys.kwh) / 3) * 0.85;
      out.push({ name: 'ConnectedSolutions daily dispatch', basis: cs.dailyPerKw ? `$${cs.dailyPerKw}/kW-summer × ${fmt(csKw)} kW (3-h sustainable output × 85% event performance). ${cs.season}; ${cs.lock}. Event days take priority over shaving. ${cs.caveat}` : 'Rate not loaded',
        value: cs.dailyPerKw ? `${money(cs.dailyPerKw * csKw)}/yr` : '—', annual: cs.dailyPerKw ? cs.dailyPerKw * csKw : 0, counted: !!cs.dailyPerKw, src: cs.url, srcLabel: cs.sourceLabel });
      const cp = P.cleanPeak || {};
      if (cp.businessDays) {
        const mwhDay = (sys.kwh * 0.9 * 0.96) / 1000, bd = cp.businessDays, m = cp.multipliers;
        const certs = mwhDay * (bd.spring * m.spring + bd.summer * m.summer + bd.fall * m.fall + bd.winter * m.winter);
        const qualifies = s.solarKw >= 0.75 * sys.kw;
        out.push({ name: 'Clean Peak Standard', basis: `${fmt(mwhDay, 2)} MWh/day in seasonal peak periods (4–8 pm; spring 5–9 pm, business days), ×4 summer and winter. ${qualifies ? `Co-located PV (${fmt(s.solarKw)} kW) ≥ 75% of storage nameplate — qualifies.` : 'No co-located RPS generation ≥ 75% of nameplate; needs contractual pairing or renewable-window charging.'} Certificate price not modeled.`,
          value: `${fmt(certs)} CPECs/yr${qualifies ? '' : ' if qualified'}`, annual: 0, counted: false, src: cp.url, srcLabel: cp.sourceLabel });
      }
      if (/capacity/i.test(s.objective)) out.push({ name: 'Capacity tag (ISO-NE)', basis: `Up to ${fmt(Math.min(sys.kw, sys.kwh / 2))} kW off the load in the annual system peak hour; value depends on the customer's supply contract passing capacity costs through.`, value: 'Per supply contract', annual: 0, counted: false });
    } else {
      const sg = P.sgip || {};
      out.push({ name: 'SGIP large-scale storage', basis: sg.ratePerWh ? `$${sg.ratePerWh}/Wh ($${sg.ratePerWhITC}/Wh with ITC) × ${fmt(sys.kwh)} kWh. PG&E Step ${sg.step} ${sg.status.toLowerCase()}.` : 'Not loaded',
        value: sg.ratePerWhITC ? `${money(sg.ratePerWhITC * sys.kwh * 1000)} if reopened` : '—', annual: 0, counted: false, src: sg.url, srcLabel: sg.sourceLabel });
      if (t && t.energy && t.energy.summer) {
        const e = t.energy.summer;
        const wk = loadProfile(s, 'weekday').reduce((a, v) => a + Math.max(0, v - thr) * 0.25, 0);
        const avail = Math.max(0, sys.kwh * 0.9 * 0.96 - wk);
        out.push({ name: 'TOU energy shifting', basis: `${fmt(avail)} kWh/day left after shaving on a typical weekday, discharged 4–9 pm at $${e.peak.toFixed(4)}, recharged off-peak at $${e.offPeak.toFixed(4)} with 92% round trip, ~85 summer weekdays`,
          value: `${money(avail * (e.peak - e.offPeak / 0.92) * 85)}/yr`, annual: avail * (e.peak - e.offPeak / 0.92) * 85, counted: true, src: t.url, srcLabel: t.sourceLabel });
      }
    }
    return out;
  }
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
  const stageLabel = (k) => `${EQ.STAGES[k].n} ${EQ.STAGES[k].label}`;

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
    $('#stage-rail').innerHTML = `<button class="step-tab ${S.filters.stage === 'all' ? 'active' : ''}" data-action="stage-filter" data-stage="all">All projects <span class="c">${cnt('all')}</span></button>` +
      EQ.STAGE_ORDER.map((k) => `<button class="step-tab ${S.filters.stage === k ? 'active' : ''}" data-action="stage-filter" data-stage="${k}"><span class="n">${EQ.STAGES[k].n}</span>${EQ.STAGES[k].label}<span class="c">${cnt(k)}</span></button>`).join('');
  }

  /* ---------------------------------------------------------- filtering */
  function matchesQuery(s, q) {
    if (!q) return true;
    const hay = [s.name, s.address, s.city, s.state, s.zip, s.account, s.utility, s.tariff, s.sector, s.feeder].join(' ').toLowerCase();
    return hay.includes(q.toLowerCase()) || s.account.replace(/[\s-]/g, '').includes(q.replace(/[\s-]/g, ''));
  }
  const filteredSites = () => S.sites.filter((s) => (S.filters.region === 'all' || s.region === S.filters.region) && (S.filters.stage === 'all' || s.stage === S.filters.stage) && matchesQuery(s, S.filters.q));
  function sortedSites(list) {
    const k = S.sort.key, dir = S.sort.dir === 'asc' ? 1 : -1;
    const val = (s) => ({ name: s.name, utility: `${s.utility} ${s.tariff}`, kva: s.kva, peak: s.peakKw, score: score(s), stage: stageIdx(s) * 1000 - score(s), owner: EQ.TEAM[s.eng].name, sys: sysOf(s).kwh }[k]);
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
          <div class="min-w-0 flex-1">
            <div class="eyebrow mb-2">C&amp;I battery storage · California and Massachusetts</div>
            <h1 class="display text-[34px] leading-tight">Projects</h1>
          </div>
          <div id="kpis" class="grid grid-cols-2 sm:grid-cols-4 gap-x-10 gap-y-4"></div>
        </section>
        <section class="grid grid-cols-1 xl:grid-cols-12 gap-6">
          <div class="xl:col-span-8 panel">
            <div class="panel-head flex-wrap">
              <div class="min-w-0 flex-1"><div class="eyebrow">Map</div></div>
              <div class="flex text-[12px] border border-line" role="group" aria-label="Region">
                ${[['all', 'All'], ['ca', 'California'], ['ma', 'Massachusetts']].map(([k, l]) => `<button class="px-3 h-7" data-action="map-jump" data-region="${k}">${l}</button>`).join('')}
              </div>
              <div class="flex text-[12px] border border-line" role="group" aria-label="Base map">
                <button class="px-3 h-7" data-action="map-base" data-base="streets">Map</button><button class="px-3 h-7" data-action="map-base" data-base="satellite">Aerial</button>
              </div>
            </div>
            <div class="relative">
              <div id="pipeline-map" class="h-[440px] lg:h-[520px] w-full"></div>
              <div id="map-hover" class="hidden-card"></div>
              <div class="absolute left-3 bottom-3 z-[500] bg-white border border-line px-3 py-2 text-[11px] text-ink2 flex flex-wrap gap-x-4 gap-y-1">
                ${[['live', 'Operating'], ['ok', 'Ready for next step'], ['gap', 'Open items'], ['crit', 'Blocked']].map(([c, l]) => `<span class="flex items-center gap-1.5"><span class="eq-pin ${c} !w-2.5 !h-2.5 !border-0 !shadow-none"></span>${l}</span>`).join('')}
              </div>
            </div>
          </div>
          <aside class="xl:col-span-4 flex flex-col gap-6">
            <div class="panel" id="by-step"></div>
            <div class="panel flex-1 flex flex-col min-h-0" id="queue"></div>
          </aside>
        </section>
        <section class="panel" id="directory"></section>`;
      root.dataset.built = '1';
      initMap();
    }
    renderKpis(); renderByStep(); renderQueue(); renderDirectory(); refreshMap(); syncMapButtons(); icons();
  }

  function renderKpis() {
    const list = S.sites.filter((s) => S.filters.region === 'all' || s.region === S.filters.region);
    const withSys = list.filter((s) => s.system);
    const kw = withSys.reduce((a, s) => a + s.system.kw, 0), kwh = withSys.reduce((a, s) => a + s.system.kwh, 0);
    const pre = list.filter((s) => stageIdx(s) <= EQ.stageIdx('proposal'));
    const fmOpen = list.reduce((a, s) => a + relevant(s).filter((d) => d.owner === 'fm' && ['missing', 'requested'].includes(dpStatus(d))).length, 0);
    const blocked = list.filter((s) => health(s) === 'crit').length;
    const k = [
      ['Projects', list.length, `${list.filter((s) => s.stage === 'operate').length} operating`],
      ['Contracted & installed', `${fmt(kw / 1000, 2)} MW`, `${fmt(kwh / 1000, 2)} MWh · ${withSys.length} projects`],
      ['Pre-design readiness', pre.length ? `${Math.round(pre.reduce((a, s) => a + score(s), 0) / pre.length)}` : '—', `avg. of ${pre.length} in assessment / proposal`],
      ['Facility items open', fmOpen, `${blocked} project${blocked === 1 ? '' : 's'} blocked`],
    ];
    $('#kpis').innerHTML = k.map(([l, v, sub]) => `<div><div class="eyebrow !text-[10px]">${l}</div><div class="display text-[28px] leading-none mt-1.5 num">${v}</div><div class="text-[11.5px] text-mute mt-1">${sub}</div></div>`).join('');
  }
  function renderByStep() {
    const list = S.sites.filter((s) => S.filters.region === 'all' || s.region === S.filters.region);
    $('#by-step').innerHTML = `
      <div class="panel-head"><div class="eyebrow flex-1">By step</div><span class="text-[11px] text-mute">projects · peak kW</span></div>
      <div class="py-1">${EQ.STAGE_ORDER.map((k) => {
        const ss = list.filter((s) => s.stage === k);
        return `<button class="w-full grid grid-cols-[28px_1fr_auto] items-baseline gap-2 px-5 py-2.5 text-left hover:bg-paper ${S.filters.stage === k ? 'bg-paper' : ''}" data-action="stage-filter" data-stage="${k}">
          <span class="text-[11px] text-mute num">${EQ.STAGES[k].n}</span><span class="text-[13px] ${S.filters.stage === k ? 'text-ink font-medium' : 'text-ink2'}">${EQ.STAGES[k].label}</span>
          <span class="text-[12px] num text-ink2">${ss.length} <span class="text-mute">· ${fmt(ss.reduce((a, s) => a + s.peakKw, 0))}</span></span></button>`;
      }).join('')}</div>`;
  }

  function renderQueue() {
    const list = S.sites.filter((s) => (S.filters.region === 'all' || s.region === S.filters.region) && s.stage !== 'operate');
    const items = [];
    list.forEach((s) => {
      criticalOpen(s).forEach((d) => items.push({ s, d, kind: 'crit', text: d.label, sub: 'Missing — blocks next step' }));
      s.dps.filter((d) => dpStatus(d) === 'review').forEach((d) => items.push({ s, d, kind: 'ok', text: d.label, sub: 'Needs engineer confirmation' }));
      const g = gateChecks(s);
      if (g.pass && g.next) items.push({ s, kind: 'ink', text: `Gate met for ${stageLabel(g.next)}`, sub: 'Ready to advance' });
    });
    const rank = { crit: 0, ok: 1, ink: 2 };
    items.sort((a, b) => rank[a.kind] - rank[b.kind]);
    $('#queue').innerHTML = `
      <div class="panel-head"><div class="eyebrow flex-1">Needs action</div><span class="text-[11px] text-mute num">${items.length}</span></div>
      <div class="overflow-y-auto max-h-[300px]">${items.length ? items.map((it) => `
        <button class="w-full text-left px-5 py-3 border-b border-line2 hover:bg-paper block" data-action="open-site" data-id="${it.s.id}" ${it.d ? `data-dp="${it.d.key}"` : ''}>
          <div class="flex items-baseline justify-between gap-3"><span class="text-[13px] text-ink truncate">${esc(it.s.name)}</span><span class="text-[11px] text-mute shrink-0">${EQ.STAGES[it.s.stage].n}</span></div>
          <div class="text-[12px] text-ink2 truncate">${esc(it.text)}</div>
          <div class="mt-1">${tag(it.kind, it.sub)}</div>
        </button>`).join('') : `<div class="px-5 py-6 text-[13px] text-mute">No items.</div>`}</div>`;
  }

  function renderDirectory() {
    const list = sortedSites(filteredSites());
    const th = (k, label, cls = '') => `<th class="sortable ${cls}" data-action="sort" data-key="${k}">${label}${S.sort.key === k ? (S.sort.dir === 'asc' ? ' ↑' : ' ↓') : ''}</th>`;
    const f = S.filters, chips = [];
    if (f.q) chips.push(`<button class="stamp" data-action="clear-filter" data-f="q">“${esc(f.q)}” ×</button>`);
    if (f.region !== 'all') chips.push(`<button class="stamp" data-action="clear-filter" data-f="region">${esc(EQ.REGIONS[f.region].short)} ×</button>`);
    if (f.stage !== 'all') chips.push(`<button class="stamp" data-action="clear-filter" data-f="stage">${esc(stageLabel(f.stage))} ×</button>`);
    $('#directory').innerHTML = `
      <div class="panel-head flex-wrap">
        <div class="eyebrow">Facilities</div><span class="text-[12px] text-mute">${list.length} of ${S.sites.length}</span>
        <div class="flex flex-wrap gap-1.5">${chips.join('')}</div>
        <div class="flex-1"></div>
        <input data-role="mobile-search" type="search" value="${esc(f.q)}" placeholder="Search" class="field h-8 px-2.5 text-[13px] sm:hidden w-full" />
        <button class="btn btn-secondary btn-sm" data-action="export-directory">Export CSV</button>
      </div>
      <div class="overflow-x-auto">
        <table class="tbl w-full min-w-[1120px]">
          <thead><tr>${th('name', 'Facility')}${th('utility', 'Utility · rate')}${th('kva', 'Service')}${th('peak', 'Peak → target')}${th('sys', 'System')}${th('score', 'Design readiness')}${th('stage', 'Step')}${th('owner', 'Engineer')}</tr></thead>
          <tbody>${list.length ? list.map(rowHTML).join('') : `<tr><td colspan="8" class="!py-12 text-center text-mute">No facilities match. <button class="link" data-action="clear-all-filters">Clear filters</button></td></tr>`}</tbody>
        </table>
      </div>`;
  }
  function rowHTML(s) {
    const sc = score(s), h = health(s), sys = sysOf(s), eng = EQ.TEAM[s.eng];
    return `<tr data-action="open-site" data-id="${s.id}" data-row="${s.id}">
      <td><div class="text-ink font-medium">${esc(s.name)}</div><div class="text-[12px] text-ink2">${esc(s.address)}, ${esc(s.city)}, ${s.state}</div><div class="text-[11.5px] text-mute">${esc(s.sector)}</div></td>
      <td><div>${esc(s.utility)} ${esc(s.tariff)}</div><div class="text-[11.5px] text-mute font-mono">${esc(s.account)}</div></td>
      <td><div class="num">${esc(s.voltage)}</div><div class="text-[11.5px] text-mute num">${fmt(s.kva)} kVA · ${fmt(s.mainA)}A main</div></td>
      <td class="num"><div>${fmt(s.peakKw, 1)} → ${fmt(s.target)} kW</div><div class="text-[11.5px] text-mute">${s.gaps.interval ? 'billed max' : '15-min interval'}</div></td>
      <td class="num"><div>${fmt(sys.kw)} kW / ${fmt(sys.kwh)} kWh</div><div class="text-[11.5px] text-mute">${sysStatus(s)}</div></td>
      <td class="min-w-[210px]"><div class="flex items-baseline justify-between mb-1.5"><span class="num text-[15px] text-ink">${sc}</span>${tag(HEALTH[h].cls, HEALTH[h].label)}</div>${segbar(s)}</td>
      <td><div class="text-[11px] text-mute num">${EQ.STAGES[s.stage].n}</div><div class="text-[12.5px] whitespace-nowrap">${EQ.STAGES[s.stage].label}</div></td>
      <td><div class="flex items-center gap-2">${avatar(eng.name, eng.color, 24)}<span class="text-[12.5px] whitespace-nowrap">${esc(eng.name.split(',')[0])}</span></div></td>
    </tr>`;
  }

  /* ---------------------------------------------------------------- map */
  function initMap() {
    const map = L.map('pipeline-map', { zoomControl: false, attributionControl: true });
    L.control.zoom({ position: 'topright' }).addTo(map);
    R.baseLayers.streets = L.layerGroup([
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, maxNativeZoom: 16, attribution: 'Tiles &copy; Esri, HERE, Garmin, &copy; OpenStreetMap contributors' }),
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, maxNativeZoom: 16 }),
    ]);
    R.baseLayers.satellite = L.layerGroup([
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Imagery &copy; Esri, Maxar' }),
      L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, opacity: 0.85 }),
    ]);
    R.baseLayers.streets.addTo(map);
    R.zoneLayer = L.layerGroup();
    EQ.ZONES.forEach((z) => {
      L.polygon(z.coords, { color: z.color, weight: 1, dashArray: '4 4', fillColor: z.color, fillOpacity: 0.05 }).addTo(R.zoneLayer);
      const top = z.coords.reduce((a, c) => (c[0] > a[0] ? c : a));
      const lng = z.coords.reduce((a, c) => a + c[1], 0) / z.coords.length;
      L.tooltip({ permanent: true, direction: 'top', className: 'eq-zone-label', offset: [0, -2] }).setLatLng([top[0], (top[1] + lng) / 2]).setContent(z.name).addTo(R.zoneLayer);
    });
    R.zoneLayer.addTo(map);
    R.pinLayer = L.layerGroup().addTo(map);
    R.clusterLayer = L.layerGroup().addTo(map);
    R.map = map;
    map.on('zoomend', updateZoomMode);
    map.on('movestart', hideMapHover);
    const hov = $('#map-hover');
    hov.addEventListener('mouseenter', () => clearTimeout(R.hoverTimer));
    hov.addEventListener('mouseleave', scheduleHideHover);
    fitRegion(S.filters.region, false);
  }
  function updateZoomMode() {
    const z = R.map.getZoom();
    $('#pipeline-map').classList.toggle('map-zoomed-out', z < 9);
    if (z < 7) { R.map.removeLayer(R.pinLayer); R.clusterLayer.addTo(R.map); } else { R.map.removeLayer(R.clusterLayer); R.pinLayer.addTo(R.map); }
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
    ['ca', 'ma'].forEach((r) => {
      const rs = list.filter((s) => s.region === r); if (!rs.length) return;
      const lat = rs.reduce((a, s) => a + s.lat, 0) / rs.length, lng = rs.reduce((a, s) => a + s.lng, 0) / rs.length;
      L.marker([lat, lng], { icon: L.divIcon({ className: '', html: `<div class="eq-cluster">${rs.length}</div>`, iconSize: [52, 52], iconAnchor: [26, 26] }) })
        .bindTooltip(`${EQ.REGIONS[r].label} · ${rs.length} projects`, { direction: 'top', offset: [0, -26] }).on('click', () => fitRegion(r)).addTo(R.clusterLayer);
    });
    updateZoomMode();
  }
  function fitRegion(region, animate = true) {
    if (!R.map) return;
    const list = S.sites.filter((s) => region === 'all' || s.region === region);
    R.map.fitBounds(L.latLngBounds(list.map((s) => [s.lat, s.lng])), { padding: region === 'all' ? [60, 60] : [70, 70], maxZoom: 11, animate });
    S.mapRegion = region; syncMapButtons();
  }
  function syncMapButtons() {
    $$('[data-action="map-jump"]').forEach((b) => { const on = b.dataset.region === (S.mapRegion || 'all'); b.classList.toggle('bg-ink', on); b.classList.toggle('text-white', on); });
    $$('[data-action="map-base"]').forEach((b) => { const on = b.dataset.base === S.mapBase; b.classList.toggle('bg-ink', on); b.classList.toggle('text-white', on); });
  }
  function showMapHover(s) {
    clearTimeout(R.hoverTimer);
    const el = $('#map-hover'), sc = score(s), h = health(s), sys = sysOf(s);
    el.innerHTML = `<div class="bg-white border border-line shadow-pop">
      <div class="px-4 pt-3.5 pb-3 border-b border-line2">
        <div class="text-[11px] text-mute num">${esc(stageLabel(s.stage))}</div>
        <div class="text-[15px] text-ink mt-0.5">${esc(s.name)}</div>
        <div class="text-[12px] text-ink2">${esc(s.address)}, ${esc(s.city)}, ${s.state}</div>
      </div>
      <dl class="grid grid-cols-2 gap-x-4 gap-y-2.5 px-4 py-3 text-[12px]">
        <div><dt class="text-mute">Objective</dt><dd class="text-ink">${esc(s.objective)}</dd></div>
        <div><dt class="text-mute">Service</dt><dd class="text-ink num">${esc(s.voltage)} · ${fmt(s.kva)} kVA</dd></div>
        <div><dt class="text-mute">Peak → target</dt><dd class="text-ink num">${fmt(s.peakKw, 1)} → ${fmt(s.target)} kW</dd></div>
        <div><dt class="text-mute">System</dt><dd class="text-ink num">${fmt(sys.kw)} kW / ${fmt(sys.kwh)} kWh</dd></div>
      </dl>
      <div class="px-4 pb-3"><div class="flex items-baseline justify-between mb-1.5"><span class="text-[12px] text-mute">Design readiness <span class="text-ink num">${sc}</span></span>${tag(HEALTH[h].cls, HEALTH[h].label)}</div>${segbar(s)}</div>
      <button class="w-full flex items-center justify-between px-4 h-10 bg-ink text-white text-[13px]" data-action="open-site" data-id="${s.id}">Open site record <span>→</span></button>
    </div>`;
    const pt = R.map.latLngToContainerPoint([s.lat, s.lng]), mapEl = $('#pipeline-map');
    const W = 300, Hc = el.offsetHeight || 280;
    let left = pt.x - W / 2, top = pt.y - Hc - 16;
    if (top < 8) top = pt.y + 16;
    left = Math.max(8, Math.min(left, mapEl.clientWidth - W - 8));
    top = Math.max(8, Math.min(top, mapEl.clientHeight - Hc - 8));
    el.style.left = left + 'px'; el.style.top = top + 'px';
    el.classList.remove('hidden-card');
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
    if (R.loadChart) { R.loadChart.destroy(); R.loadChart = null; }
    if (R.satThumb) { R.satThumb.remove(); R.satThumb = null; }
  }

  function renderSite(s) {
    destroySiteWidgets();
    const root = $('#view-site');
    const cur = stageIdx(s);
    root.innerHTML = `
      <a href="#/" class="arrow-link text-ink2 text-[13px]">← Projects</a>
      <section class="panel">
        <div class="grid grid-cols-1 lg:grid-cols-12">
          <div class="lg:col-span-8 p-6 flex flex-col sm:flex-row gap-6 border-b lg:border-b-0 lg:border-r border-line2">
            <button class="sat-thumb relative w-full sm:w-52 h-44 sm:h-auto sm:min-h-[200px] overflow-hidden border border-line shrink-0" data-action="open-satellite" aria-label="Open aerial view">
              <div id="sat-thumb" class="absolute inset-0"></div>
              <span class="absolute left-0 bottom-0 z-[500] bg-white/95 px-2 py-1 text-[10.5px] text-ink2 num">${s.lat.toFixed(4)}, ${s.lng.toFixed(4)}</span>
            </button>
            <div class="min-w-0 flex-1">
              <div class="eyebrow">${esc(s.sector)} · ${esc(s.objective)}</div>
              <h1 class="display text-[32px] leading-tight mt-1.5">${esc(s.name)}</h1>
              <p class="text-[13.5px] text-ink2 mt-1">${esc(s.address)}, ${esc(s.city)}, ${s.state} ${s.zip}</p>
              <dl class="grid grid-cols-2 xl:grid-cols-4 gap-x-6 gap-y-4 mt-5 text-[13px]">
                <div><dt class="text-[11.5px] text-mute">Utility · rate</dt><dd class="text-ink mt-0.5">${esc(s.utility)} ${esc(s.tariff)}</dd><dd class="text-[11.5px] text-mute font-mono">${esc(s.account)}</dd></div>
                <div><dt class="text-[11.5px] text-mute">Service</dt><dd class="text-ink mt-0.5 num">${esc(s.voltage)}</dd><dd class="text-[11.5px] text-mute num">${fmt(s.kva)} kVA · ${fmt(s.mainA)}A main</dd></div>
                <div><dt class="text-[11.5px] text-mute">System</dt><dd class="text-ink mt-0.5 num">${fmt(sysOf(s).kw)} kW / ${fmt(sysOf(s).kwh)} kWh</dd><dd class="text-[11.5px] text-mute">QorePack · ${sysStatus(s)}</dd></div>
                <div><dt class="text-[11.5px] text-mute">AHJ</dt><dd class="text-ink mt-0.5">${esc(s.ahj.replace(/^(City|Town) of /, ''))}</dd><dd class="text-[11.5px] text-mute">${esc(s.fireDept)}</dd></div>
              </dl>
            </div>
          </div>
          <div class="lg:col-span-4 p-6" id="site-score"></div>
        </div>
        <div class="px-6 pb-6 pt-1">
          <div class="tracker">${EQ.STAGE_ORDER.map((k, i) => `<div class="${i < cur ? 'done' : i === cur ? 'cur' : ''}"><div class="n num">${EQ.STAGES[k].n}</div><div class="l">${EQ.STAGES[k].label}</div></div>`).join('')}</div>
        </div>
      </section>

      ${s.perf ? perfBlock(s) : ''}

      <section class="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        <div class="xl:col-span-8 space-y-6" id="site-matrix"></div>
        <aside class="xl:col-span-4 space-y-6 xl:sticky xl:top-[124px]">
          <div class="panel" id="site-requests"></div>
          <div class="panel" id="site-activity"></div>
        </aside>
      </section>

      <section class="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        <div class="xl:col-span-8 panel" id="site-docs"></div>
        <div class="xl:col-span-4 space-y-6">
          <div class="panel" id="site-responder"></div>
          <div class="panel" id="site-codes"></div>
        </div>
      </section>

      <section class="panel" id="site-vault"></section>
      <section id="site-pocs"></section>`;
    renderScore(s); renderMatrix(s); renderRequests(s); renderActivity(s); renderDocs(s); renderResponderCard(s); renderCodes(s); renderVault(s); renderPocs(s);
    icons(); initSatThumb(s); initLoadChart(s);
  }

  function perfBlock(s) {
    const p = s.perf;
    return `<section class="panel">
      <div class="panel-head"><div class="eyebrow flex-1">Operating performance · ${esc(p.month)}</div><a class="link text-[12px]" href="https://www.eqore.com/how-it-works" target="_blank" rel="noopener">Published on eqore.com</a></div>
      <div class="grid grid-cols-2 lg:grid-cols-5 divide-x divide-line2">
        ${[['Building peak', `${fmt(p.buildingPeak, 1)} kW`, s.peakDate], ['Grid demand at building peak', `${fmt(p.gridPeak, 1)} kW`, `target ${fmt(s.target)} kW`], ['Supplied by battery at peak', `${fmt(p.shaved, 1)} kW`, `${fmt(s.system.kw)} kW / ${fmt(s.system.kwh)} kWh QorePack`],
          ['Demand-charge savings', money(p.savings), `vs. ${money(p.projection)} projected (+${Math.round((p.savings / p.projection - 1) * 100)}%)`], ['Max grid demand, month', `${fmt(p.monthMaxGrid, 1)} kW`, `${fmt(p.monthMaxGrid - s.target, 1)} kW over target at worst, ${fmt(p.intervals)} intervals`]]
          .map(([l, v, sub]) => `<div class="px-5 py-4"><div class="text-[11.5px] text-mute">${l}</div><div class="display text-[24px] num mt-1">${v}</div><div class="text-[11.5px] text-ink2 mt-0.5">${esc(sub)}</div></div>`).join('')}
      </div></section>`;
  }
  function refreshSite(s, flashKey) {
    renderScore(s);
    EQ.SECTIONS.forEach((p) => renderSectionBody(s, p.key));
    renderFieldBody(s); renderTieIn(s);
    renderRequests(s); renderActivity(s); renderDocs(s); renderVault(s); renderStageRail();
    if (R.loadChart) updateLoadChart(s, true);
    icons();
    if (flashKey) { const row = $(`[data-dp-row="${flashKey}"]`); if (row) { row.classList.remove('flash'); void row.offsetWidth; row.classList.add('flash'); } }
    persist();
  }
  function initSatThumb(s) {
    const el = $('#sat-thumb'); if (!el) return;
    const m = L.map(el, { zoomControl: false, attributionControl: false, dragging: false, scrollWheelZoom: false, doubleClickZoom: false, boxZoom: false, keyboard: false, touchZoom: false }).setView([s.lat, s.lng], 18);
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19 }).addTo(m);
    L.circleMarker([s.lat, s.lng], { radius: 5, color: '#fff', weight: 2, fillColor: '#06162b', fillOpacity: 1 }).addTo(m);
    L.rectangle([[s.lat - 0.00006, s.lng + 0.00012], [s.lat + 0.00004, s.lng + 0.0003]], { color: '#fff', weight: 1.5, dashArray: '3 3', fillOpacity: 0.12 }).addTo(m);
    R.satThumb = m; setTimeout(() => m.invalidateSize(), 60);
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
        ${p.key === 'load' ? '<div class="border-t border-line2 p-5" id="load-panel"></div><div class="border-t border-line2" id="value-streams"></div><div class="border-t border-line2" id="proposal"></div>' : ''}
      </article>`).join('') + `
      <article class="panel scroll-mt-32" id="section-field"><header class="panel-head" id="section-head-field"></header><div id="section-body-field"></div></article>`;
    EQ.SECTIONS.forEach((p) => renderSectionBody(s, p.key));
    renderFieldBody(s); renderTieIn(s);
    renderLoadPanelShell(s);
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
    const sys = sysOf(s), bc = EQ.busCheck(s, sys.kw), fd = EQ.faultDuty(s);
    const row = (k, v, cls = '') => `<div class="flex justify-between gap-4 px-5 py-2 border-t border-line2 first:border-t-0 text-[12.5px]"><dt class="text-ink2">${k}</dt><dd class="num text-right ${cls}">${v}</dd></div>`;
    el.innerHTML = `<div class="px-5 pt-4 pb-2 flex items-baseline justify-between"><span class="text-[14px] text-ink">Tie-in check</span><span class="text-[11.5px] text-mute">${fmt(sys.kw)} kW ${sysStatus(s)} · 480 V</span></div>
      <div class="grid grid-cols-1 md:grid-cols-2 md:divide-x divide-line2 border-t border-line2">
        <dl>${row('Bus rating / main OCPD', `${fmt(s.busA)} A / ${fmt(s.mainA)} A`)}${row('120% allowance (1.2 × bus − main)', `${fmt(bc.allowance)} A`)}
          ${row('Existing PV inverter current', `${fmt(bc.pvA)} A`)}${row('BESS inverter current', `${fmt(bc.bessA)} A`)}
          ${row('Required (125% × sum)', `${fmt(bc.required)} A`, bc.pass ? 'text-steel' : 'text-alert')}</dl>
        <dl>${row('Transformer', `${fmt(s.kva)} kVA · ${fd.z}% Z`)}${row('Fault duty at service (infinite bus)', `${fmt(fd.ka, 1)} kA`)}
          ${row('Switchboard SCCR', s.sccrKa ? `${s.sccrKa} kA` : 'unconfirmed', s.sccrKa && s.sccrKa < fd.ka ? 'text-alert' : '')}
          ${row('GFPE (NEC 230.95)', s.mainA >= 1000 ? 'Required' : 'Not required')}</dl>
      </div>
      <div class="px-5 py-3 border-t border-line2 text-[12.5px] text-ink">Load-side 120% rule ${bc.pass ? 'met' : 'not met'}. Tie-in method: ${esc(bc.method)}.</div>`;
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
      : `<span class="src">${ico(srcIcon[d.srcType] || 'file')}<span class="truncate">${esc(d.src)}</span></span>`;
    let main, right;
    if (st === 'missing' || st === 'requested') {
      main = `<div class="text-[13.5px] text-ink2">Needed: ${esc(d.ask)}</div>`;
      right = st === 'requested'
        ? `<button class="btn btn-ghost btn-xs" data-action="simulate-upload" data-dp="${d.key}" title="Demo: record the facility's upload">Record upload</button>`
        : d.owner === 'fm' ? `<button class="btn btn-secondary btn-xs" data-action="open-rfi" data-dp="${d.key}">Request</button>`
        : `<button class="btn btn-secondary btn-xs" data-action="resolve-dp" data-dp="${d.key}">Enter</button>`;
    } else {
      main = `<div class="text-[14px] text-ink num leading-snug break-words">${esc(d.value)}</div>
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">${src}<span class="text-[11.5px] text-mute">${confLabel[d.conf] || ''}</span></div>`;
      right = `<button class="toggle" role="switch" aria-checked="${!!d.verified}" aria-label="Confirm ${esc(d.label)}" data-action="toggle-verify" data-dp="${d.key}"></button>`;
    }
    return `<div class="dp-row ${cls}" data-action="open-dp" data-dp="${d.key}" data-dp-row="${d.key}">
      <div class="min-w-0">
        <div class="flex flex-wrap items-baseline gap-x-3 gap-y-0.5"><span class="text-[12px] text-mute">${esc(d.label)}</span>${statusTag(d)}</div>
        <div class="mt-1">${main}</div>
      </div>
      <div class="flex items-start pt-1" data-stop>${right}</div>
    </div>`;
  }

  function openDpModal(s, key) {
    const d = s.dps.find((x) => x.key === key), st = dpStatus(d);
    const file = d.file && s.files.find((f) => f.key === d.file);
    const steps = [];
    if (st === 'missing' || st === 'requested') {
      steps.push(['Public-record search', 'No public record or prior upload covers this item', 'Oct 11, 2026']);
      if (d.rfi) steps.push([`Requested from ${d.rfi.to}`, `${d.rfi.channel} · ${d.rfi.link}`, fmtDT(d.rfi.at)]);
    } else {
      steps.push([`Source: ${d.src}`, file ? file.name : 'Direct record', d.updatedAt ? fmtDate(d.updatedAt) : '']);
      steps.push(['Method', d.method, '']);
      if (d.verified) steps.push([`Confirmed by ${d.verifiedBy || EQ.TEAM[s.eng].name}`, '', d.verifiedAt ? fmtDT(d.verifiedAt) : 'Nov 6, 2026']);
      else steps.push(['Not yet confirmed', d.requiresSignoff ? 'Counts toward readiness once confirmed' : 'Counts toward readiness on source confidence', '']);
    }
    openModal({
      title: esc(d.label), subtitle: `${secName(d.sec)} · weight ${d.pts}${d.severity ? ` · ${d.severity === 'critical' ? 'blocks next step' : 'open'}` : ''}`,
      body: `
        <div class="text-[11.5px] text-mute">Value</div>
        <div class="text-[16px] text-ink num mt-0.5">${d.value != null ? esc(d.value) : '—'}</div>
        <div class="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[12px] text-ink2">${statusTag(d)}${d.value != null ? `<span>${confLabel[d.conf] || ''}</span>` : ''}<span>Owner: ${d.owner === 'fm' ? 'facility' : 'EQORE'}</span></div>
        <div class="eyebrow mt-6 mb-3">Provenance</div>
        <ol class="tl space-y-3.5">${steps.map(([t, sub, when]) => `<li><div class="flex items-baseline justify-between gap-3"><span class="text-[13px] text-ink">${esc(t)}</span><span class="text-[11px] text-mute num shrink-0">${esc(when)}</span></div>${sub ? `<div class="text-[12px] text-ink2 mt-0.5">${esc(sub)}</div>` : ''}</li>`).join('')}</ol>
        ${file ? `<button class="mt-5 w-full flex items-center gap-3 p-3 border border-line hover:border-ink text-left" data-action="open-file" data-file="${file.id}">${ficon(file.type)}<span class="min-w-0 flex-1"><span class="block text-[13px] text-ink font-mono truncate">${esc(file.name)}</span><span class="block text-[11.5px] text-mute">${esc(file.origin)}</span></span><span>→</span></button>` : ''}`,
      footer: (st === 'missing' || st === 'requested')
        ? `${d.owner === 'fm' && st === 'missing' ? `<button class="btn btn-secondary" data-action="open-rfi" data-dp="${d.key}">Request from facility</button>` : ''}<button class="btn btn-primary" data-action="resolve-dp" data-dp="${d.key}">Enter value</button>`
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
        <input id="resolve-src" class="field w-full h-10 px-3 text-[14px]" value="${d.owner === 'eqore' ? (d.key === 'ahjPreApp' ? 'Meeting minutes' : 'Portal confirmation') : 'Call with facility contact'}" />
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
  function renderLoadPanelShell(s) {
    const noInterval = !!s.dps.find((d) => d.key === 'interval' && d.value == null);
    if (S.chart.threshold[s.id] == null) S.chart.threshold[s.id] = s.target;
    const cs = REF().comstock || {};
    const usesComstock = s.loadShape === 'warehouse' && s.region === 'ma' && cs.warehouse_ma;
    $('#load-panel').innerHTML = `
      <div class="flex flex-wrap items-center gap-3 mb-4">
        <div class="min-w-0 flex-1"><div class="text-[14px] text-ink">Load and peak-shave sizing</div>
          <div class="text-[12px] text-mute">${noInterval ? 'No interval data. ' : ''}Modeled 15-min shape${usesComstock ? ` (${extLink(cs.url, 'NREL ComStock warehouse, Middlesex Co.')})` : ` for ${esc(s.sector.toLowerCase())}`}, calibrated to the ${noInterval ? 'billed' : 'metered'} 12-month peak (${esc(s.peakDate)})${s.solarKw ? ', net of on-site PV' : ''}. Indicative until the interval file drives the model.</div></div>
        <div class="flex text-[12px] border border-line">${[['interval', '24 h'], ['monthly', '12 months']].map(([k, l]) => `<button class="px-3 h-7" data-action="chart-tab" data-tab="${k}">${l}</button>`).join('')}</div>
        <div class="flex text-[12px] border border-line" id="day-switch">${[['peak', 'Peak day'], ['weekday', 'Weekday'], ['weekend', 'Weekend']].map(([k, l]) => `<button class="px-3 h-7" data-action="chart-day" data-day="${k}">${l}</button>`).join('')}</div>
      </div>
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div class="lg:col-span-8">
          <div class="relative h-[260px]"><canvas id="load-chart" role="img" aria-label="Building load, grid demand and battery supply"></canvas></div>
          <div class="mt-4 ${s.system && s.system.status === 'installed' ? 'hidden' : ''}">
            <div class="flex items-center justify-between text-[12px] mb-2"><label for="threshold" class="text-ink2">Grid demand target</label><span class="num text-ink" id="threshold-val"></span></div>
            <input type="range" id="threshold" class="eq-range" min="${Math.round(s.peakKw * 0.5)}" max="${Math.round(s.peakKw)}" step="5" value="${S.chart.threshold[s.id]}" />
          </div>
        </div>
        <dl class="lg:col-span-4 grid grid-cols-2 lg:grid-cols-1 gap-x-6 gap-y-4 content-start" id="load-stats"></dl>
      </div>`;
  }
  function initLoadChart(s) {
    const cv = $('#load-chart'); if (!cv) return;
    R.loadChart = new Chart(cv.getContext('2d'), {
      type: 'line', data: { labels: [], datasets: [] },
      options: {
        responsive: true, maintainAspectRatio: false, animation: { duration: 250 },
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'top', align: 'start', labels: { boxWidth: 12, boxHeight: 2, font: { family: 'Inter', size: 11 }, color: '#4a515d' } },
          tooltip: { backgroundColor: '#06162b', titleFont: { family: 'Inter', size: 11, weight: '500' }, bodyFont: { family: 'Inter', size: 11 }, padding: 10, cornerRadius: 0, boxPadding: 4,
            callbacks: { label: (c) => ` ${c.dataset.label}: ${fmt(c.parsed.y, 1)} kW` } },
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: '#7d828b', font: { family: 'Inter', size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 9 }, border: { color: '#d3cecd' } },
          y: { beginAtZero: true, grid: { color: '#efece9' }, border: { display: false }, ticks: { color: '#7d828b', font: { family: 'Inter', size: 10 }, callback: (v) => fmt(v) + ' kW' } },
        },
      },
    });
    updateLoadChart(s);
    const sl = $('#threshold');
    sl.addEventListener('input', () => { S.chart.threshold[s.id] = +sl.value; updateLoadChart(s, true); });
  }
  function updateLoadChart(s, fast) {
    const ch = R.loadChart; if (!ch) return;
    const thr = S.chart.threshold[s.id];
    const sl = $('#threshold'); if (sl) sl.style.setProperty('--p', ((thr - sl.min) / (sl.max - sl.min)) * 100 + '%');
    $('#threshold-val').textContent = `${fmt(thr)} kW`;
    $$('[data-action="chart-tab"]').forEach((b) => { const on = b.dataset.tab === S.chart.tab; b.classList.toggle('bg-ink', on); b.classList.toggle('text-white', on); });
    $$('[data-action="chart-day"]').forEach((b) => { const on = b.dataset.day === S.chart.day; b.classList.toggle('bg-ink', on); b.classList.toggle('text-white', on); });
    $('#day-switch').style.visibility = S.chart.tab === 'interval' ? 'visible' : 'hidden';
    if (S.chart.tab === 'interval') {
      const prof = loadProfile(s, S.chart.day), grid = prof.map((v) => Math.min(v, thr));
      Object.assign(ch.options.scales.x, { offset: false, stacked: false }); ch.options.scales.y.stacked = false;
      ch.data.labels = prof.map((_, i) => `${String(Math.floor(i / 4)).padStart(2, '0')}:${String((i % 4) * 15).padStart(2, '0')}`);
      ch.data.datasets = [
        { label: 'Building load', data: prof, borderColor: '#9aa0a9', borderWidth: 1.5, pointRadius: 0, pointHoverRadius: 3, tension: 0.25, fill: false, order: 3 },
        { label: 'Grid demand (billed)', data: grid, borderColor: '#3c6390', borderWidth: 2, pointRadius: 0, pointHoverRadius: 3, tension: 0.25, fill: { target: 0, above: 'transparent', below: 'rgba(179,200,228,.55)' }, order: 2 },
        { label: 'Target', data: prof.map(() => thr), borderColor: '#51453f', borderDash: [4, 4], borderWidth: 1, pointRadius: 0, pointHoverRadius: 0, fill: false, order: 1 },
      ];
    } else {
      const mp = monthlyPeaks(s);
      Object.assign(ch.options.scales.x, { offset: true, stacked: true }); ch.options.scales.y.stacked = true;
      ch.data.labels = mp.map((x) => x.m);
      ch.data.datasets = [
        { type: 'bar', label: 'Grid demand (billed)', data: mp.map((x) => Math.min(x.kw, thr)), backgroundColor: '#3c6390', maxBarThickness: 22, stack: 'kw', order: 1 },
        { type: 'bar', label: 'Supplied by battery', data: mp.map((x) => Math.max(0, +(x.kw - thr).toFixed(1))), backgroundColor: '#b3c8e4', borderColor: '#fff', borderWidth: { bottom: 2 }, borderSkipped: false, maxBarThickness: 22, stack: 'kw', order: 2 },
        { type: 'line', label: 'Target', data: mp.map(() => thr), borderColor: '#51453f', borderDash: [4, 4], borderWidth: 1, pointRadius: 0, fill: false, stack: 'target', order: 0 },
      ];
    }
    ch.update(fast ? 'none' : undefined);
    const z = sizeFor(s, thr), sys = s.system || z;
    const ds = demandSavings(s, thr);
    const stat = (l, v, sub) => `<div><dt class="text-[11.5px] text-mute">${l}</dt><dd class="display text-[22px] num leading-tight mt-0.5">${v}</dd><dd class="text-[11.5px] text-ink2">${sub}</dd></div>`;
    $('#load-stats').innerHTML =
      stat('12-month peak', `${fmt(s.peakKw, 1)} kW`, s.peakDate) +
      stat('Peak reduction', `${fmt(z.shaveKw)} kW`, `${fmt(z.kwhNeeded)} kWh above target on the peak day`) +
      stat('Demand-charge savings', ds.annual != null ? `${money(ds.annual)}/yr` : '—', tariffOf(s) ? `${EQ.tariffKey(s)}, TOU windows by month` : 'Tariff not loaded') +
      stat(s.system ? `QorePack, ${s.system.status}` : 'Indicative size', `${fmt(sys.kw)} kW / ${fmt(sys.kwh)} kWh`, s.system ? `model at this target: ${fmt(z.kw)} kW / ${fmt(z.kwh)} kWh` : '2-hr minimum, 50 kW / 50 kWh steps');
    renderValueStreams(s);
  }
  function renderValueStreams(s) {
    const el = $('#value-streams'); if (!el) return;
    const vs = valueStreams(s);
    el.innerHTML = `<div class="px-5 pt-4 pb-1 text-[14px] text-ink">Value streams</div>
      <table class="w-full text-[13px]"><tbody>${vs.map((v) => `<tr class="border-t border-line2"><td class="px-5 py-2.5 align-top w-[26%] text-ink">${esc(v.name)}</td><td class="py-2.5 align-top text-ink2 text-[12.5px]">${esc(v.basis)}${v.src ? ` · ${extLink(v.src, v.srcLabel || 'source')}` : ''}</td><td class="px-5 py-2.5 align-top text-right num whitespace-nowrap ${v.counted ? 'text-ink' : 'text-mute'}">${esc(v.value)}</td></tr>`).join('')}</tbody></table>`;
    renderProposal(s, vs);
  }
  function renderProposal(s, vs) {
    const el = $('#proposal'); if (!el) return;
    S.econ = S.econ || {};
    const e = S.econ[s.id] || (S.econ[s.id] = { cost: '', itc: 30, om: '' });
    const sys = sysOf(s);
    const annual = vs.filter((v) => v.counted).reduce((a, v) => a + v.annual, 0);
    const capex = e.cost ? +e.cost * sys.kwh : null;
    const net = capex != null ? capex * (1 - (+e.itc || 0) / 100) : null;
    const netAnnual = annual - (+e.om || 0);
    const payback = net != null && netAnnual > 0 ? net / netAnnual : null;
    el.innerHTML = `<div class="px-5 py-4 grid grid-cols-2 lg:grid-cols-6 gap-x-5 gap-y-3 items-end text-[12px]">
      <div class="col-span-2 lg:col-span-1"><div class="text-mute">Counted value</div><div class="display text-[20px] num">${money(annual)}/yr</div></div>
      <label class="block"><span class="text-mute">Installed cost, $/kWh</span><input class="field w-full h-8 px-2 num mt-1" data-econ="cost" value="${esc(e.cost)}" placeholder="enter" inputmode="decimal" /></label>
      <label class="block"><span class="text-mute">ITC, %</span><input class="field w-full h-8 px-2 num mt-1" data-econ="itc" value="${esc(e.itc)}" inputmode="decimal" /></label>
      <label class="block"><span class="text-mute">O&amp;M, $/yr</span><input class="field w-full h-8 px-2 num mt-1" data-econ="om" value="${esc(e.om)}" placeholder="0" inputmode="decimal" /></label>
      <div><div class="text-mute">Net capex</div><div class="num text-[15px] text-ink">${net != null ? money(net) : '—'}</div></div>
      <div><div class="text-mute">Simple payback</div><div class="num text-[15px] text-ink">${payback != null ? `${payback.toFixed(1)} yr` : '—'}</div></div>
    </div><div class="px-5 pb-3 text-[11.5px] text-mute">Counted: streams in dark text. SGIP (closed), Clean Peak certificates and capacity tags are excluded until priced. Excludes depreciation.</div>`;
  }
  /* ----------------------------------------------------- facility requests */
  function renderRequests(s) {
    const rel = relevant(s);
    const fmItems = rel.filter((d) => d.owner === 'fm' && ['missing', 'requested'].includes(dpStatus(d)));
    const eqItems = rel.filter((d) => d.owner === 'eqore' && ['missing', 'requested'].includes(dpStatus(d)));
    const review = rel.filter((d) => dpStatus(d) === 'review');
    const fm = s.contacts.find((c) => c.id === 'fm');
    const row = (d, ctl) => `<li class="px-5 py-2.5 border-t border-line2 flex items-start gap-3 cursor-pointer hover:bg-paper" data-action="open-dp" data-dp="${d.key}">
        <div class="min-w-0 flex-1"><div class="text-[13px] text-ink leading-snug">${esc(d.owner === 'fm' && dpStatus(d) !== 'review' ? d.ask : d.label)}</div><div class="mt-0.5">${statusTag(d)}</div></div>
        <div data-stop class="shrink-0 pt-0.5">${ctl}</div></li>`;
    const group = (title, items, ctl) => items.length ? `<div class="px-5 pt-4 pb-2 text-[11.5px] text-mute">${title}</div><ul>${items.map((d) => row(d, ctl(d))).join('')}</ul>` : '';
    $('#site-requests').innerHTML = `
      <div class="panel-head"><div class="eyebrow flex-1">Open items</div><span class="text-[11px] text-mute num">${fmItems.length + eqItems.length + review.length}</span></div>
      ${group(`From facility · ${esc(fm.name)}`, fmItems, (d) => dpStatus(d) === 'requested'
        ? `<button class="btn btn-ghost btn-xs" data-action="simulate-upload" data-dp="${d.key}" title="Demo: record the facility's upload">Record upload</button>`
        : `<input type="checkbox" class="w-4 h-4 accent-[#06162b]" data-rfi-pick="${d.key}" checked aria-label="Include in request" />`)}
      ${group('EQORE', eqItems, (d) => `<button class="btn btn-ghost btn-xs" data-action="resolve-dp" data-dp="${d.key}">Enter</button>`)}
      ${group('Needs engineer confirmation', review, (d) => `<button class="toggle" role="switch" aria-checked="false" aria-label="Confirm ${esc(d.label)}" data-action="toggle-verify" data-dp="${d.key}"></button>`)}
      ${!fmItems.length && !eqItems.length && !review.length ? `<div class="px-5 py-6 text-[13px] text-mute">No open items.</div>` : ''}
      ${fmItems.some((d) => dpStatus(d) === 'missing') ? `<div class="p-5 border-t border-line2"><button class="btn btn-primary w-full justify-between" data-action="open-rfi">Send request to ${esc(fm.name.split(' ')[0])}<span>→</span></button></div>` : ''}`;
  }
  function openRfiModal(s, onlyKey) {
    const fm = s.contacts.find((c) => c.id === 'fm');
    const gaps = relevant(s).filter((d) => d.owner === 'fm' && dpStatus(d) === 'missing');
    if (!gaps.length) { toast('No facility items are open.'); return; }
    const picked = new Set(onlyKey ? [onlyKey] : gaps.filter((d) => { const cb = $(`[data-rfi-pick="${d.key}"]`); return !cb || cb.checked; }).map((d) => d.key));
    if (!picked.size) gaps.forEach((d) => picked.add(d.key));
    const link = `upload.eqore.com/${s.code.toLowerCase()}-${(hashStr(s.id + Date.now()) % 46656).toString(36)}`;
    const nextLabel = EQ.STAGES[EQ.STAGE_ORDER[Math.min(stageIdx(s) + 1, 5)]].label.toLowerCase();
    const msg = (keys) => `${fm.name.split(' ')[0]}, for the ${s.name.replace(/\.$/, '')} battery project we need the following before ${nextLabel}:\n${keys.map((k, i) => `${i + 1}. ${s.dps.find((d) => d.key === k).ask}`).join('\n')}\nUpload from your phone: https://${link}\n— ${EQ.TEAM[s.eng].name.split(',')[0]}, EQORE`;
    openModal({
      title: 'Request from facility', subtitle: `${esc(fm.name)}, ${esc(fm.title)} · ${esc(s.name)}`, size: 'max-w-4xl',
      body: `<div class="grid grid-cols-1 md:grid-cols-12 gap-6">
        <div class="md:col-span-7 space-y-5">
          <div><div class="text-[12px] text-mute mb-2">Items</div><div class="border border-line" id="rfi-items">${gaps.map((d) => `
            <label class="flex items-start gap-3 px-3 py-2.5 border-t border-line2 first:border-t-0 cursor-pointer hover:bg-paper">
              <input type="checkbox" class="w-4 h-4 mt-0.5 accent-[#06162b]" value="${d.key}" ${picked.has(d.key) ? 'checked' : ''} />
              <span class="min-w-0 flex-1"><span class="block text-[13px] text-ink">${esc(d.ask)}</span><span class="block text-[11.5px] text-mute">${esc(d.label)} · ${esc(secName(d.sec))}</span></span>
              ${d.severity === 'critical' ? tag('crit', 'Blocks next step') : ''}</label>`).join('')}</div></div>
          <div><div class="flex items-center justify-between mb-2"><span class="text-[12px] text-mute">Message</span>
            <div class="flex text-[12px] border border-line" id="rfi-channel">${['SMS', 'Email'].map((c, i) => `<button class="px-3 h-7 ${i === 0 ? 'bg-ink text-white' : ''}" data-ch="${c}">${c}</button>`).join('')}</div></div>
            <textarea id="rfi-msg" rows="7" class="field w-full p-3 text-[13px] leading-relaxed"></textarea>
            <div class="text-[11.5px] text-mute mt-1.5">Link expires in 7 days. Uploads are stored with timestamp and GPS and linked to the item.</div></div>
        </div>
        <div class="md:col-span-5 flex flex-col items-center"><div class="text-[12px] text-mute mb-3 self-start md:self-center">Upload page</div>
          <div class="phone"><div class="px-4 pt-5 pb-5"><div class="wordmark !text-[15px]">EQORE</div>
            <div class="mt-3 text-[12.5px] text-ink">${esc(s.name)}</div><div class="text-[10.5px] text-mute">${esc(s.address)}, ${esc(s.city)}</div>
            <div class="mt-3 space-y-1.5" id="phone-items"></div>
            <div class="mt-3 h-8 bg-ink text-white text-[11px] grid place-items-center">Submit</div></div></div></div>
      </div>`,
      footer: `<button class="btn btn-ghost" data-action="close-modal">Cancel</button><button class="btn btn-secondary" data-action="copy-text" data-text="https://${link}">Copy link</button><button class="btn btn-primary" data-action="send-rfi" data-link="${link}">Send</button>`,
      onMount: (root) => {
        let edited = false;
        const sync = () => {
          const keys = $$('#rfi-items input:checked', root).map((i) => i.value);
          if (!edited) $('#rfi-msg', root).value = msg(keys);
          $('#phone-items', root).innerHTML = keys.map((k, i) => `<div class="border border-line px-2 py-1.5 text-[10.5px] leading-tight text-ink2">${i + 1}. ${esc(s.dps.find((d) => d.key === k).ask)}</div>`).join('');
          $('[data-action="send-rfi"]', root).disabled = !keys.length;
        };
        $('#rfi-msg', root).addEventListener('input', () => { edited = true; });
        $('#rfi-items', root).addEventListener('change', sync);
        root.dataset.channel = 'SMS';
        $$('#rfi-channel button', root).forEach((b) => b.addEventListener('click', () => { $$('#rfi-channel button', root).forEach((x) => x.classList.remove('bg-ink', 'text-white')); b.classList.add('bg-ink', 'text-white'); root.dataset.channel = b.dataset.ch; }));
        sync();
      },
    });
  }
  function sendRfi(s, link) {
    const root = $('#modal'), keys = $$('#rfi-items input:checked', root).map((i) => i.value), channel = root.dataset.channel || 'SMS';
    const fm = s.contacts.find((c) => c.id === 'fm');
    keys.forEach((k) => { s.dps.find((x) => x.key === k).rfi = { to: fm.name, at: nowISO(), channel, link }; });
    log(s, `Requested ${keys.length} item${keys.length > 1 ? 's' : ''} from ${fm.name} by ${channel}`);
    closeModal(); refreshSite(s); toast(`Request sent to ${esc(fm.name)} · ${keys.length} item${keys.length > 1 ? 's' : ''}`);
  }
  function simulateUpload(s, key) {
    const d = s.dps.find((x) => x.key === key), fm = s.contacts.find((c) => c.id === 'fm'), tpl = EQ.rfiFileFor(s, key);
    s.files.unshift(Object.assign({}, tpl, { id: `${s.id}:${tpl.key}:${Date.now()}`, uploader: { name: fm.name, role: fm.title }, date: new Date().toISOString().slice(0, 10), origin: 'Facility upload link', dps: [key], isNew: true }));
    Object.assign(d, { value: d.pendingValue, rfi: null, requiresSignoff: true, verified: false, src: 'Facility upload', srcType: 'customer', conf: tpl.conf === 'verified' ? 'high' : tpl.conf, file: tpl.key, reviewNote: 'New upload', updatedAt: new Date().toISOString().slice(0, 10) });
    if (key === 'interval') { Object.assign(s.dps.find((x) => x.key === 'peakDemand'), { src: 'Green Button interval data', srcType: 'meter', conf: 'verified', file: 'csv', method: 'Max 15-min interval over 12 months' }); delete s.gaps.interval; }
    log(s, `${fm.name} uploaded ${tpl.name}`);
    refreshSite(s, key);
    if (key === 'interval') { renderLoadPanelShell(s); if (R.loadChart) { R.loadChart.destroy(); R.loadChart = null; } initLoadChart(s); }
    toast(`${esc(fm.name)} uploaded ${esc(tpl.name)}. Confirm to count it.`);
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
    const ia = s.dps.find((d) => d.key === 'interconnect'); if (ia.value) ia.value = EQ.iaValue(s);
    s.contacts = EQ.buildContacts(s).map((c) => Object.assign(c, (s.contacts.find((x) => x.id === c.id) || {}).last ? { last: s.contacts.find((x) => x.id === c.id).last } : {}));
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
          <td class="text-[12px] text-ink2 whitespace-nowrap num">${d.due === 'end' ? '—' : esc(EQ.STAGES[d.due].n)}</td>
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
  function renderResponderCard(s) {
    const live = stageIdx(s) >= EQ.stageIdx('install');
    $('#site-responder').innerHTML = `
      <div class="panel-head"><div class="eyebrow flex-1">Site placard</div></div>
      <div class="p-5 flex gap-4 items-start">
        <div id="qr" class="shrink-0 border border-line p-1.5 bg-white" style="width:108px;height:108px"></div>
        <div class="min-w-0 text-[12.5px] text-ink2 leading-relaxed">
          QR posted at the disconnect. Opens the public emergency page: system, location, shutdown, contacts. AHJ, facility and EQORE sign in for the full record.
          <div class="flex flex-wrap gap-2 mt-3"><a class="btn btn-secondary btn-xs" href="#/responder/${s.id}">Open public page</a><button class="btn btn-ghost btn-xs" data-action="print-placard">Print</button></div>
          ${live ? '' : '<div class="text-[11.5px] text-mute mt-2">Posted at installation (NFPA 855 7.1.3).</div>'}
        </div>
      </div>`;
    const el = $('#qr');
    if (window.QRCode) { try { new QRCode(el, { text: `${location.origin}${location.pathname}#/responder/${s.id}`, width: 94, height: 94, colorDark: '#06162b', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.M }); } catch (e) { el.textContent = 'QR unavailable'; } }
  }
  function renderCodes(s) {
    const codes = (REF().codes || []).filter((c) => !c.region || c.region === s.region);
    const ia = (REF().interconnection || {})[s.utility];
    const ahj = (REF().ahj || {})[s.city];
    $('#site-codes').innerHTML = `
      <div class="panel-head"><div class="eyebrow flex-1">Codes, tariff &amp; portals</div></div>
      <ul class="text-[12.5px]">
        ${codes.map((c) => `<li class="px-5 py-2.5 border-t border-line2 first:border-t-0"><div>${extLink(c.url, c.code)}</div><div class="text-[11.5px] text-ink2">${esc(c.scope)}</div></li>`).join('')}
        ${ia ? `<li class="px-5 py-2.5 border-t border-line2"><div>${extLink(ia.url, ia.name)}</div><div class="text-[11.5px] text-ink2">${esc(ia.summary || '')}</div></li>` : ''}
        ${ahj && ahj.portal ? `<li class="px-5 py-2.5 border-t border-line2"><div>${extLink(ahj.portal, ahj.portalName)}</div><div class="text-[11.5px] text-ink2">${esc(ahj.note || 'Permit records and status')}</div></li>` : ''}
        ${!codes.length && !ia ? '<li class="px-5 py-4 text-mute">Reference data not loaded.</li>' : ''}
      </ul>`;
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
    const t = tariffOf(s);
    if (f.key === 'hosting') return [['Feeder', s.feeder], ['Substation', s.substation], ['Load capacity', `${s.hostingMw} MW`], ['Existing DER', s.solarKw ? `${s.solarKw} kW PV` : 'None']];
    if (f.key === 'cutsheet') return [['Product', 'QorePack'], ['Enclosure', 'Outdoor-rated, integrated HVAC'], ['Listing', 'UL 9540; UL 9540A data on file'], ['This site', `${fmt(sysOf(s).kw)} kW / ${fmt(sysOf(s).kwh)} kWh`]];
    if (f.key === 'fireguide') return [['Issuer', s.fireDept], ['Basis', s.region === 'ma' ? '527 CMR 1.00 · NFPA 855' : 'CFC 1207 · NFPA 855'], ['Outdoor separation', '10 ft to lot lines and exposures'], ['Signage', 'NFPA 704 + ESS hazard marking']];
    if (f.key === 'permits') return [['Address', `${s.address}, ${s.city}`], ['Records', s.permits]];
    if (f.key === 'planset') return [['Sheet', 'E-1.0 electrical site plan'], ['Transformer', `${fmt(s.kva)} kVA`], ['Issued by', s.ahj]];
    return {
      bill: [['Account', s.account], ['Rate', `${s.utility} ${s.tariff}`], ['Period', 'Sep 26 – Oct 25, 2026'], ['Max demand', `${fmt(s.peakKw * 0.93, 1)} kW`], ['Total', money(s.avgBill)], ['Tariff on file', t ? (t.name || EQ.tariffKey(s)) : '—']],
      csv: [['Interval', '15 min'], ['Intervals', '35,040'], ['Range', 'Nov 1, 2025 – Oct 31, 2026'], ['Max', `${fmt(s.peakKw, 1)} kW`], ['Format', 'Green Button (ESPI) → CSV']],
      nameplate: [['Voltage', s.voltage], ['Phase', s.phase], ['Ampacity', `${fmt(s.mainA)} A`], ['Make', s.switchgear.split(' ')[0]], ['OCR', f.conf === 'medium' ? '71%' : '98%']],
      sld: [['Drawing', 'E-001 rev C'], ['Main OCPD', `${fmt(s.mainA)} A`], ['Service', s.voltage], ['Transformer', `${fmt(s.kva)} kVA`]],
      panel: [['Panel', 'MDP-1'], ['Spare OCPD', `${fmt(s.spareA)} A`], ['Bus', `${fmt(s.busA)} A`]],
      siteplan: [['APN', s.apn], ['Location', s.location], ['Nearest lot line', s.lotLine], ['Separation', `${s.setbackFt} ft`], ['NFPA 855 outdoor min.', '10 ft']],
      photo: [['Captured', 'Phone, GPS-tagged'], ['Distance from service point', '≤ 8 m']],
    }[f.preview] || [];
  }
  function filePreview(s, f) {
    const v = f.preview;
    if (v === 'bill') return `<div class="paper-doc p-5 text-[11px] text-ink2"><div class="flex justify-between"><div class="text-[14px] text-ink">${esc(s.utility)}</div><div class="text-right">Statement 10/27/2026</div></div>
      <div class="grid grid-cols-2 gap-3 mt-3"><div>${esc(s.name)}<br>${esc(s.address)}<br>${esc(s.city)}, ${s.state} ${s.zip}</div><div class="bg-paper p-2">Account <span class="font-mono text-ink">${esc(s.account)}</span><br>Rate <span class="text-ink">${esc(s.tariff)}</span></div></div>
      <div class="mt-3 border-t border-line2 pt-2 space-y-1 num">${[['Energy', s.avgBill * 0.52], ['Demand — max', s.avgBill * 0.3], ['Demand — peak', s.avgBill * 0.12], ['Taxes & fees', s.avgBill * 0.06]].map(([k, val]) => `<div class="flex justify-between"><span>${k}</span><span>${money(val)}</span></div>`).join('')}
      <div class="flex justify-between border-t border-line2 pt-1 text-ink"><span>Total</span><span>${money(s.avgBill)}</span></div></div>
      <div class="mt-3 h-12 flex items-end gap-0.5">${monthlyPeaks(s).map((m) => `<div class="flex-1 bg-bluesoft" style="height:${(m.kw / s.peakKw) * 100}%"></div>`).join('')}</div><div class="text-[10px] text-mute mt-1">12-month max demand</div></div>`;
    if (v === 'csv') {
      const prof = loadProfile(s, 'peak');
      const path = prof.map((y, i) => `${i ? 'L' : 'M'}${(i / 95) * 300},${80 - (y / s.peakKw) * 72}`).join(' ');
      return `<div class="paper-doc"><svg viewBox="0 0 300 84" class="w-full h-24 bg-paper border-b border-line2"><path d="${path}" fill="none" stroke="#3c6390" stroke-width="1.4"/></svg>
        <table class="w-full text-[11px] font-mono"><thead class="text-mute"><tr><th class="text-left px-3 py-1.5 font-normal">interval_start</th><th class="text-right px-3 font-normal">kW</th><th class="text-right px-3 font-normal">kWh</th></tr></thead>
        <tbody>${(() => { const pi = Math.round(EQ.peakAnchor(s).hour * 4); return [pi - 3, pi - 2, pi - 1, pi, pi + 1, pi + 2].filter((i) => i >= 0 && i < 96); })().map((i) => `<tr class="border-t border-line2"><td class="px-3 py-1">${peakDay(s)}T${String(Math.floor(i / 4)).padStart(2, '0')}:${String((i % 4) * 15).padStart(2, '0')}</td><td class="text-right px-3">${prof[i]}</td><td class="text-right px-3">${(prof[i] * 0.25).toFixed(2)}</td></tr>`).join('')}</tbody></table></div>`;
    }
    if (v === 'nameplate') return `<div class="bg-[#3a3f47] p-6"><svg viewBox="0 0 320 190" class="w-full" font-family="JetBrains Mono"><rect x="10" y="10" width="300" height="170" fill="#d9dadc" stroke="#9aa0a9"/>
      <text x="160" y="38" text-anchor="middle" font-size="12" fill="#06162b">${esc(s.switchgear.split(' ').slice(0, 2).join(' ').toUpperCase())}</text><text x="160" y="53" text-anchor="middle" font-size="8.5" fill="#4a515d">SWITCHBOARD · UL 891</text>
      ${[['VOLTS', s.voltage, 80], ['PHASE/WIRE', s.phase, 102], ['AMPERES', `${s.mainA} A`, 124], ['SCCR', s.sccrKa ? `${fmt(s.sccrKa * 1000)} A RMS SYM` : 'NOT LEGIBLE', 146]].map(([k, val, y]) => `<text x="36" y="${y}" font-size="8.5" fill="#4a515d">${k}</text><rect x="132" y="${y - 12}" width="156" height="16" fill="rgba(60,99,144,.12)" stroke="#3c6390"/><text x="138" y="${y}" font-size="10" fill="#06162b">${esc(val)}</text>`).join('')}</svg>
      <div class="text-center text-[11px] text-[#cfd3d9] mt-2">Extracted fields outlined · OCR ${f.conf === 'medium' ? '71% (glare)' : '98%'}</div></div>`;
    if (v === 'sld') return `<div class="paper-doc p-4"><svg viewBox="0 0 320 230" class="w-full" font-family="Inter" font-size="8.5" fill="#06162b">
      <text x="8" y="14" font-size="10">E-001 · SINGLE-LINE DIAGRAM</text><text x="312" y="14" text-anchor="end" fill="#7d828b">REV C</text>
      <line x1="160" y1="24" x2="160" y2="44" stroke="#06162b"/><text x="168" y="36">${esc(s.utility)} SERVICE</text>
      <circle cx="160" cy="56" r="11" fill="none" stroke="#06162b"/><circle cx="160" cy="70" r="11" fill="none" stroke="#06162b"/><text x="178" y="62">${fmt(s.kva)} kVA</text><text x="178" y="72" fill="#7d828b">${esc(s.voltage)}</text>
      <line x1="160" y1="81" x2="160" y2="100" stroke="#06162b"/><rect x="148" y="100" width="24" height="16" fill="rgba(60,99,144,.12)" stroke="#3c6390"/><text x="180" y="112" fill="#3c6390">MAIN ${fmt(s.mainA)}A</text>
      <line x1="160" y1="116" x2="160" y2="136" stroke="#06162b"/><line x1="40" y1="136" x2="280" y2="136" stroke="#06162b" stroke-width="2.5"/><text x="40" y="130" fill="#7d828b">MDP ${fmt(s.mainA)}A</text>
      ${[60, 110, 160, 210].map((x, i) => `<line x1="${x}" y1="136" x2="${x}" y2="160" stroke="#06162b"/><rect x="${x - 8}" y="160" width="16" height="11" fill="none" stroke="#06162b"/><text x="${x}" y="185" text-anchor="middle" fill="#4a515d">${['MCC-1', 'HVAC', s.solarKw ? 'PV' : 'LP-1', 'PROC'][i]}</text>`).join('')}
      <line x1="260" y1="136" x2="260" y2="160" stroke="#8f5f17" stroke-dasharray="3 2"/><rect x="250" y="160" width="20" height="13" fill="none" stroke="#8f5f17" stroke-dasharray="3 2"/><text x="260" y="185" text-anchor="middle" fill="#8f5f17">SPARE ${s.spareA}A</text><text x="260" y="195" text-anchor="middle" fill="#8f5f17">BESS POI</text></svg></div>`;
    if (v === 'siteplan') return `<div class="paper-doc p-3"><svg viewBox="0 0 320 210" class="w-full" font-family="Inter" font-size="8.5"><rect width="320" height="210" fill="#f8f6f4"/>
      <polygon points="20,20 300,26 296,190 24,186" fill="#fff" stroke="#3c6390" stroke-dasharray="5 4"/><text x="28" y="34" fill="#3c6390">APN ${esc(s.apn)}</text>
      <rect x="60" y="60" width="150" height="95" fill="#efebe4" stroke="#7d828b"/><text x="135" y="110" text-anchor="middle" fill="#4a515d">BUILDING</text>
      <rect x="225" y="96" width="34" height="22" fill="rgba(60,99,144,.15)" stroke="#06162b"/><text x="242" y="90" text-anchor="middle" fill="#06162b">ESS</text>
      <line x1="259" y1="107" x2="296" y2="107" stroke="#ac312c"/><text x="278" y="128" text-anchor="middle" fill="#ac312c">${s.setbackFt} ft</text>
      <text x="160" y="204" text-anchor="middle" fill="#7d828b">NFPA 855 outdoor: 10 ft min. to lot line (${esc(s.lotLine)})</text></svg></div>`;
    if (v === 'panel' || v === 'photo') return `<div class="bg-[#57534e] p-5"><svg viewBox="0 0 320 200" class="w-full">${v === 'panel'
      ? `<rect x="70" y="10" width="180" height="180" fill="#9ca3af"/><rect x="82" y="22" width="156" height="156" fill="#1f2937"/>${Array.from({ length: 8 }, (_, i) => `<rect x="92" y="${30 + i * 18}" width="62" height="12" fill="${i === 6 ? 'none' : '#4b5563'}" ${i === 6 ? 'stroke="#b3c8e4" stroke-dasharray="3 2"' : ''}/><rect x="166" y="${30 + i * 18}" width="62" height="12" fill="${i > 5 ? 'none' : '#4b5563'}" ${i > 5 ? 'stroke="#b3c8e4" stroke-dasharray="3 2"' : ''}/>`).join('')}<text x="285" y="148" text-anchor="middle" font-family="Inter" font-size="10" fill="#fff">${s.spareA}A spare</text>`
      : `<rect x="105" y="15" width="110" height="180" fill="#78716c"/><rect x="113" y="23" width="94" height="172" fill="#a8a29e"/><text x="160" y="70" text-anchor="middle" font-family="Inter" font-size="9" fill="#7f1d1d">ELECTRICAL ROOM</text><line x1="113" y1="150" x2="207" y2="150" stroke="#f5d08a" stroke-width="3"/><text x="160" y="168" text-anchor="middle" font-family="Inter" font-size="11" fill="#fff">44 in.</text>`}</svg>
      <div class="text-center text-[11px] text-[#e7e5e4] mt-1">${v === 'panel' ? 'Engineer markup: open positions' : 'Facility photo, reference scale'}</div></div>`;
    return `<div class="paper-doc p-5"><div class="flex items-center gap-3 mb-3">${ficon(f.type)}<div><div class="font-mono text-[12px] text-ink">${esc(f.name)}</div><div class="text-[11px] text-mute">${esc(f.origin)}</div></div></div>
      <div class="space-y-2">${[92, 78, 85, 60, 88].map((w) => `<div class="paper-line" style="width:${w}%"></div>`).join('')}</div>
      <div class="mt-4 border border-line bg-paper p-3 text-[11.5px] space-y-0.5">${fileParams(s, f).slice(0, 3).map(([k, val]) => `<div><span class="text-mute">${esc(k)}:</span> ${esc(val)}</div>`).join('')}</div>
      <div class="space-y-2 mt-4">${[80, 66, 90].map((w) => `<div class="paper-line" style="width:${w}%"></div>`).join('')}</div></div>`;
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
    openModal({
      title: 'Aerial', subtitle: `${esc(s.address)}, ${esc(s.city)} · ${esc(s.location)}`, size: 'max-w-4xl',
      body: `<div id="sat-big" class="h-[460px] border border-line"></div><div class="flex flex-wrap gap-4 mt-3 text-[12px] text-ink2"><span>● Service point</span><span>▭ Equipment location</span><span>${s.setbackFt} ft to ${esc(s.lotLine)}</span></div>`,
      onMount: () => {
        const m = L.map('sat-big').setView([s.lat, s.lng], 19);
        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 20, maxNativeZoom: 19, attribution: 'Imagery © Esri' }).addTo(m);
        L.circleMarker([s.lat, s.lng], { radius: 6, color: '#fff', weight: 2, fillColor: '#06162b', fillOpacity: 1 }).bindTooltip('Service point').addTo(m);
        L.rectangle([[s.lat - 0.00006, s.lng + 0.00012], [s.lat + 0.00004, s.lng + 0.0003]], { color: '#fff', weight: 2, dashArray: '4 3', fillOpacity: 0.15 }).bindTooltip('Equipment location', { permanent: true, direction: 'top', className: 'eq-zone-label' }).addTo(m);
        setTimeout(() => m.invalidateSize(), 80);
      },
    });
  }

  /* =================================================================
     SEARCH & EVENTS
     ================================================================= */
  function renderSearchResults(q) {
    const box = $('#search-results');
    if (!q) { box.classList.add('hidden'); return; }
    const res = S.sites.filter((s) => matchesQuery(s, q)).slice(0, 6);
    box.innerHTML = res.length ? res.map((s) => `<button class="w-full flex items-baseline justify-between gap-3 px-3 py-2.5 hover:bg-paper text-left border-t border-line2 first:border-t-0" data-action="open-site" data-id="${s.id}">
        <span class="min-w-0"><span class="block text-[13px] text-ink truncate">${esc(s.name)}</span><span class="block text-[11.5px] text-mute truncate">${esc(s.address)}, ${esc(s.city)} · <span class="font-mono">${esc(s.account)}</span></span></span>
        <span class="text-[11px] text-mute shrink-0">${EQ.STAGES[s.stage].n}</span></button>`).join('') : `<div class="px-3 py-4 text-[13px] text-mute">No match for “${esc(q)}”</div>`;
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
      case 'sort': { const k = el.dataset.key; S.sort = S.sort.key === k ? { key: k, dir: S.sort.dir === 'asc' ? 'desc' : 'asc' } : { key: k, dir: ['name', 'utility', 'owner', 'stage'].includes(k) ? 'asc' : 'desc' }; renderDirectory(); break; }
      case 'map-jump': fitRegion(el.dataset.region); break;
      case 'map-base': S.mapBase = el.dataset.base; Object.values(R.baseLayers).forEach((l) => R.map.removeLayer(l)); R.baseLayers[S.mapBase].addTo(R.map); syncMapButtons(); break;
      case 'export-directory': exportDirectory(); break;
      case 'reset-demo':
        try { localStorage.removeItem(STORE_KEY); } catch (err) { /* ignore */ }
        S.sites = EQ.buildSites(); S.chart.threshold = {}; $('#user-menu').classList.add('hidden'); onRoute(); toast('Demo data reset'); break;
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
    const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
    const rows = [['Facility', 'Address', 'Sector', 'Utility', 'Rate', 'Account', 'Voltage', 'kVA', 'Main A', 'Peak kW', 'Target kW', 'System kW', 'System kWh', 'Design readiness', 'Step', 'Engineer'].join(',')]
      .concat(sortedSites(filteredSites()).map((s) => [s.name, `${s.address}, ${s.city}, ${s.state} ${s.zip}`, s.sector, s.utility, s.tariff, s.account, s.voltage, s.kva, s.mainA, s.peakKw, s.target, sysOf(s).kw, sysOf(s).kwh, score(s), stageLabel(s.stage), EQ.TEAM[s.eng].name].map(q).join(',')));
    downloadBlob('eqore_projects.csv', rows.join('\n')); toast('Exported');
  }

  const search = $('#global-search');
  search.addEventListener('input', () => { S.filters.q = search.value.trim(); renderSearchResults(S.filters.q); if (S.route.view === 'pipeline') { renderDirectory(); refreshMap(); } });
  search.addEventListener('focus', () => S.filters.q && renderSearchResults(S.filters.q));
  search.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { const first = $('#search-results [data-id]'); if (first) { go(first.dataset.id); $('#search-results').classList.add('hidden'); search.blur(); } }
    if (e.key === 'Escape') { search.value = ''; S.filters.q = ''; $('#search-results').classList.add('hidden'); if (S.route.view === 'pipeline') renderPipeline(); search.blur(); }
  });
  document.addEventListener('input', (e) => {
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
  window.addEventListener('resize', () => R.map && R.map.invalidateSize());
  onRoute();
})();
