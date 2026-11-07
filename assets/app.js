/* =============================================================================
   EQORE Site Evaluation — application
   One page per site: what public records and customer documents establish,
   what is still unknown, and what to ask for next.
   ============================================================================= */
(function () {
  'use strict';

  const STORE_KEY = 'eqore.eval.v1';
  const S = { route: { view: 'list', id: null }, tab: 'electrical', permitFilter: 'relevant', st: loadState() };
  const R = { map: null, sat: null, aerial: null, charts: {} };

  function loadState() { try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch (e) { return {}; } }
  function persist() { try { localStorage.setItem(STORE_KEY, JSON.stringify(S.st)); } catch (e) { toast('Could not save locally (storage full?)'); } }
  const st = (id) => (S.st[id] = S.st[id] || { reviewed: {}, docs: {}, inputs: {}, interval: null, overrides: {}, measures: [] });
  const site = (id) => EQ.SITES.find((s) => s.id === id);
  const rec = (s) => EQ.REC[s.apn] || { benchmark: [], permits: [] };

  /* ---------------------------------------------------------------- utils */
  const $ = (q, r = document) => r.querySelector(q);
  const $$ = (q, r = document) => Array.from(r.querySelectorAll(q));
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n, d = 0) => Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  const fmtDate = (iso) => (iso ? new Date(iso.length === 10 ? iso + 'T12:00:00' : iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—');
  const tag = (cls, text) => `<span class="tag ${cls}">${esc(text)}</span>`;
  const link = (url, label) => `<a class="link" href="${esc(url)}" target="_blank" rel="noopener">${esc(label)}</a>`;
  function toast(msg) {
    const el = document.createElement('div'); el.className = 'toast'; el.innerHTML = `<div>${msg}</div>`;
    $('#toast-root').appendChild(el); setTimeout(() => { el.style.transition = 'opacity .3s'; el.style.opacity = '0'; }, 3200); setTimeout(() => el.remove(), 3600);
  }
  function openModal({ title, subtitle = '', body, footer = '', size = 'max-w-2xl', onMount }) {
    closeModal();
    const w = document.createElement('div'); w.className = 'modal-backdrop'; w.id = 'modal';
    w.innerHTML = `<div class="modal-panel ${size}" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div class="flex items-start gap-4 px-6 pt-5 pb-4 border-b border-line2"><div class="min-w-0 flex-1"><h2 id="modal-title" class="text-[19px] display">${title}</h2>${subtitle ? `<p class="text-[13px] text-ink2 mt-1">${subtitle}</p>` : ''}</div>
      <button class="btn btn-ghost btn-sm" data-action="close-modal" aria-label="Close">✕</button></div>
      <div class="px-6 py-5">${body}</div>${footer ? `<div class="px-6 py-4 border-t border-line2 bg-paper flex flex-wrap justify-end gap-2">${footer}</div>` : ''}</div>`;
    w.addEventListener('mousedown', (e) => { if (e.target === w) closeModal(); });
    $('#modal-root').appendChild(w); document.body.style.overflow = 'hidden'; if (onMount) onMount(w);
  }
  function closeModal() { const m = $('#modal'); if (m) { m.remove(); document.body.style.overflow = ''; } if (R.aerial) { R.aerial.remove(); R.aerial = null; } }

  /* ---------------------------------------------------------------- derived facts */
  function bench(s) { return rec(s).benchmark.filter((b) => b.kwh); }
  function latestKwh(s) { const b = bench(s); return b.length ? b[b.length - 1] : null; }
  function peakEstimate(s) {
    const iv = st(s.id).interval;
    if (iv) return { measured: true, kw: iv.peakKw, when: iv.peakAt, lf: iv.loadFactor };
    const l = latestKwh(s); if (!l) return null;
    const avg = l.kwh / 8760, [lo, hi] = EQ.LOAD_FACTOR[s.type] || [0.35, 0.6];
    return { measured: false, avg, lo: avg / hi, hi: avg / lo, year: l.year };
  }
  function rateHint(s) {
    const p = peakEstimate(s); if (!p) return 'Unknown — need bill';
    const k = p.measured ? p.kw : p.hi;
    if (p.measured) return k >= 1000 ? 'B-20 range (≥1,000 kW)' : k >= 500 ? 'B-19 range (500–999 kW)' : 'Below B-19 (<500 kW): B-10 range';
    return p.hi < 500 ? 'Likely below B-19 (<500 kW) — confirm on bill' : p.lo >= 500 ? 'Likely B-19 or above — confirm on bill' : 'B-10 or B-19 — confirm on bill';
  }
  const docsReceived = (s) => EQ.CUSTOMER_DOCS.filter((d) => st(s.id).docs[d.key]).length;

  /* Area status: engineer override > evidence-driven upgrade > records baseline. */
  function areaStatus(s, key) {
    const o = st(s.id).overrides[key]; if (o) return { status: o.status, note: o.note || s.areas[key][1], by: o.by };
    const [base, note] = s.areas[key];
    const d = st(s.id).docs, inp = st(s.id).inputs;
    if (key === 'load' && st(s.id).interval) { const iv = st(s.id).interval; return { status: base === 'risk' ? 'risk' : 'good', note: `Measured peak ${fmt(iv.peakKw, 1)} kW (${iv.peakAt}); LF ${fmt(iv.loadFactor * 100)}%`, evidence: true }; }
    if (key === 'electrical' && inp.mainA && inp.busA && inp.voltage && (d.sld || d.msb)) return { status: 'good', note: `${inp.voltage} · ${fmt(inp.mainA)} A main / ${fmt(inp.busA)} A bus from customer documents`, evidence: true };
    const related = EQ.CUSTOMER_DOCS.filter((x) => x.area === key && d[x.key]).length;
    return { status: base, note: related ? `${note} · ${related} customer doc${related > 1 ? 's' : ''} to review` : note };
  }
  function nextStep(s) {
    const missing = EQ.CUSTOMER_DOCS.filter((d) => !st(s.id).docs[d.key]);
    const risks = s.findings.filter((f, i) => f.sev === 'risk' && !st(s.id).reviewed[i]).length;
    if (missing.find((d) => d.key === 'bills' || d.key === 'interval')) return `Request bills and interval data${risks ? `; resolve ${risks} open risk${risks > 1 ? 's' : ''}` : ''}`;
    if (missing.find((d) => ['sld', 'msb', 'main'].includes(d.key))) return 'Request SLD and switchgear photos';
    if (risks) return `Resolve ${risks} open risk${risks > 1 ? 's' : ''} before proposal`;
    return 'Ready to size and propose';
  }

  /* Permit classification for engineers. */
  const RX = {
    electrical: /(switchboard|\bmsb\b|service|meter|transformer|generator|transfer switch|\bats\b|\bamp|volt|panel|feeder|solar|photovoltaic|battery|\bups\b|riser|kva|disconnect)/i,
    fire: /(sprinkler|fire alarm|\bfacu\b|smoke|fire door|witness test)/i,
    structural: /(seismic|structural|roof|masonry|\bpad\b|foundation|mezzanine|retaining)/i,
    refrigeration: /(cooler|freezer|refrigerat|condenser|chiller|cold)/i,
  };
  const ratingChips = (t) => {
    const out = new Set();
    (t.match(/\b\d{2,4}\s*-?\s*(?:amp|amps|a)\b/gi) || []).forEach((m) => out.add(m.replace(/\s*-?\s*amps?/i, ' A').replace(/\s*a$/i, ' A')));
    (t.match(/\b\d{3}\s*-?\s*(?:volt|v)\b/gi) || []).forEach((m) => out.add(m.replace(/\s*-?\s*volt/i, ' V').replace(/v$/i, ' V')));
    (t.match(/\b\d{2,4}\s*kva\b/gi) || []).forEach((m) => out.add(m.replace(/kva/i, 'kVA')));
    if (/\bats\b|transfer switch/i.test(t)) out.add('ATS');
    if (/generator/i.test(t)) out.add('Generator');
    if (/\bups\b/i.test(t)) out.add('UPS');
    return [...out];
  };
  const permitClasses = (p) => Object.keys(RX).filter((k) => RX[k].test(p.desc));

  /* ---------------------------------------------------------------- routing */
  function onRoute() {
    const m = location.hash.match(/^#\/site\/([\w-]+)(?:\/(\w+))?/);
    S.route = m && site(m[1]) ? { view: 'site', id: m[1] } : { view: 'list', id: null };
    if (m && m[2]) S.tab = m[2];
    closeModal(); destroyCharts();
    $('#view-list').classList.toggle('hidden', S.route.view !== 'list');
    $('#view-site').classList.toggle('hidden', S.route.view !== 'site');
    $('#crumbs').innerHTML = S.route.view === 'site' ? `<span class="w-px h-5 bg-line mr-1"></span><a href="#/" class="hover:text-ink">Leads</a><span class="text-line">/</span><span class="text-ink truncate">${esc(site(S.route.id).name)}</span>` : '';
    if (S.route.view === 'site') { renderSite(site(S.route.id)); window.scrollTo({ top: 0 }); } else renderList();
  }
  const go = (id, tab) => { location.hash = id ? `#/site/${id}${tab ? '/' + tab : ''}` : '#/'; };
  function destroyCharts() { Object.values(R.charts).forEach((c) => c.destroy()); R.charts = {}; if (R.sat) { R.sat.remove(); R.sat = null; } }

  /* =================================================================
     LEADS LIST
     ================================================================= */
  function statusDots(s) {
    return `<div class="flex gap-3 flex-wrap">${EQ.AREAS.map((a) => { const x = areaStatus(s, a.key); return `<span class="tag ${EQ.STATUS[x.status].cls}" title="${esc(a.name)}: ${esc(x.note)}">${esc(a.name.split(' ')[0])}</span>`; }).join('')}</div>`;
  }
  function sparkline(s, w = 120, h = 28) {
    const b = rec(s).benchmark.filter((x) => x.year >= 2018);
    const max = Math.max(...b.map((x) => x.kwh || 0), 1);
    const bw = w / b.length;
    return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true">${b.map((x, i) => x.kwh
      ? `<rect x="${i * bw + 1}" y="${h - (x.kwh / max) * h}" width="${bw - 2}" height="${(x.kwh / max) * h}" fill="${i === b.length - 1 ? '#3c6390' : '#b3c8e4'}"/>`
      : `<rect x="${i * bw + 1}" y="${h - 2}" width="${bw - 2}" height="2" fill="#d3cecd"/>`).join('')}</svg>`;
  }
  function renderList() {
    const q = ($('#global-search').value || '').toLowerCase();
    const list = EQ.SITES.filter((s) => !q || [s.name, s.address, s.apn, s.tenant, s.neighborhood].join(' ').toLowerCase().includes(q));
    const root = $('#view-list');
    if (!root.dataset.built) {
      root.innerHTML = `
        <div class="flex flex-wrap items-end gap-4 mb-6"><div class="flex-1 min-w-0"><div class="eyebrow mb-2">San Francisco · PG&amp;E · leads from public records</div><h1 class="display text-[34px] leading-tight">Site evaluations</h1></div>
          <p class="text-[13px] text-ink2 max-w-xl">Each site is assembled from DataSF energy benchmarking and permit records (as of ${esc(window.SF_RECORDS_ASOF || '')}). Status shows what is established, what is unknown, and what to request from the customer.</p></div>
        <div class="grid grid-cols-1 xl:grid-cols-12 gap-6">
          <div class="xl:col-span-5 panel"><div id="list-map" class="h-[420px] xl:h-[640px]"></div></div>
          <div class="xl:col-span-7 space-y-3" id="site-cards"></div>
        </div>`;
      root.dataset.built = '1';
      initListMap();
    }
    $('#site-cards').innerHTML = list.map((s) => {
      const l = latestKwh(s), pe = peakEstimate(s);
      const risks = s.findings.filter((f) => f.sev === 'risk').length;
      return `<button class="panel w-full text-left p-5 hover:border-ink transition-colors block" data-action="open-site" data-id="${s.id}" data-card="${s.id}">
        <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1"><span class="text-[17px] text-ink">${esc(s.name)}</span><span class="text-[12px] text-mute">${esc(s.address)} · APN ${esc(s.apn)}</span><span class="ml-auto text-[12px] text-mute">${docsReceived(s)}/${EQ.CUSTOMER_DOCS.length} customer docs</span></div>
        <div class="text-[12.5px] text-ink2 mt-0.5">${esc(s.type)} · ${fmt(rec(s).floorArea)} sf · built ${rec(s).yearBuilt || '—'} · ${esc(s.tenant)}</div>
        <div class="grid grid-cols-[auto_1fr] gap-x-5 gap-y-1 items-center mt-3">
          <div>${sparkline(s)}</div>
          <div class="text-[12.5px]"><span class="text-ink num">${l ? fmt(l.kwh / 1e6, 2) + ' GWh' : '—'}</span> <span class="text-mute">grid, ${l ? l.year : ''}</span> · <span class="text-ink num">${pe ? (pe.measured ? fmt(pe.kw) + ' kW peak' : `${fmt(pe.lo)}–${fmt(pe.hi)} kW est. peak`) : '—'}</span></div>
        </div>
        <div class="mt-3">${statusDots(s)}</div>
        <div class="text-[13px] text-ink mt-3">${esc(s.summary)}</div>
        <div class="text-[12px] mt-2 ${risks ? 'text-alert' : 'text-mute'}">${risks} risk${risks === 1 ? '' : 's'} flagged · Next: ${esc(nextStep(s))}</div>
      </button>`;
    }).join('') || '<div class="text-mute text-[13px]">No sites match.</div>';
    if (R.map) setTimeout(() => { R.map.invalidateSize(); R.map.fitBounds(EQ.SITES.map((x) => [rec(x).lat, rec(x).lng]), { padding: [40, 40] }); }, 80);
  }
  function initListMap() {
    const m = L.map('list-map', { zoomControl: true, scrollWheelZoom: false });
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, maxNativeZoom: 16, attribution: 'Tiles © Esri' }).addTo(m);
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, maxNativeZoom: 16 }).addTo(m);
    const pts = EQ.SITES.map((s) => [rec(s).lat, rec(s).lng]);
    EQ.SITES.forEach((s) => {
      const risk = s.findings.some((f) => f.sev === 'risk');
      L.marker([rec(s).lat, rec(s).lng], { icon: L.divIcon({ className: '', html: `<div class="eq-pin ${risk ? 'gap' : 'ok'}"></div>`, iconSize: [16, 16], iconAnchor: [8, 8] }), title: s.name })
        .bindTooltip(`<b>${esc(s.name)}</b><br>${esc(s.address)}`, { direction: 'top', offset: [0, -8] })
        .on('click', () => go(s.id))
        .on('mouseover', () => { const c = $(`[data-card="${s.id}"]`); if (c) c.classList.add('!border-ink'); })
        .on('mouseout', () => { const c = $(`[data-card="${s.id}"]`); if (c) c.classList.remove('!border-ink'); })
        .addTo(m);
    });
    m.fitBounds(pts, { padding: [40, 40] });
    R.map = m;
  }

  /* =================================================================
     SITE PAGE
     ================================================================= */
  const TABS = [['electrical', 'Electrical'], ['load', 'Load & rate'], ['site', 'Equipment location'], ['permits', 'Permit records'], ['docs', 'Customer documents'], ['reqs', 'SF requirements']];

  function renderSite(s) {
    const r = rec(s);
    $('#view-site').innerHTML = `
      <a href="#/" class="arrow-link text-ink2 text-[13px]">← Leads</a>
      <section class="panel mt-4">
        <div class="grid grid-cols-1 lg:grid-cols-[220px_1fr]">
          <button class="relative h-44 lg:h-auto border-b lg:border-b-0 lg:border-r border-line2 overflow-hidden sat-thumb" data-action="tab" data-tab="site" aria-label="Open equipment location tab"><div id="sat" class="absolute inset-0"></div></button>
          <div class="p-6">
            <div class="flex flex-wrap items-baseline gap-x-3"><h1 class="display text-[30px] leading-tight">${esc(s.name)}</h1><span class="text-[13px] text-ink2">${esc(s.address)}, San Francisco ${s.zip} · APN ${esc(s.apn)}</span>${r.pim ? `<span class="text-[12px]">${link(r.pim, 'SF Planning PIM')}</span>` : ''}</div>
            <div class="text-[13px] text-ink2 mt-1">${esc(s.tenant)}</div>
            <dl class="flex flex-wrap gap-x-8 gap-y-2 mt-4 text-[13px]">
              ${[['Type', s.type], ['Floor area', `${fmt(r.floorArea)} sf`], ['Built', r.yearBuilt || '—'], ['Occupancy', s.occupancy], ['Stories', s.stories], ['Utility', 'PG&E'], ['AHJ', 'SF DBI · SFFD']].map(([k, v]) => `<div><dt class="text-[11px] text-mute">${k}</dt><dd class="text-ink">${esc(v)}</dd></div>`).join('')}
            </dl>
            <p class="text-[14px] text-ink mt-4 max-w-4xl">${esc(s.summary)}</p>
          </div>
        </div>
      </section>

      <section class="mt-5 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 border-l border-t border-line bg-white" id="snapshot"></section>

      <section class="mt-5 grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        <div class="xl:col-span-7 panel" id="findings"></div>
        <div class="xl:col-span-5 panel" id="needs"></div>
      </section>

      <section class="mt-5 panel">
        <div class="flex overflow-x-auto no-scrollbar border-b border-line2" role="tablist">${TABS.map(([k, l]) => `<button class="step-tab ${S.tab === k ? 'active' : ''}" role="tab" aria-selected="${S.tab === k}" data-action="tab" data-tab="${k}">${l}</button>`).join('')}</div>
        <div id="tab-body"></div>
      </section>`;
    renderSnapshot(s); renderFindings(s); renderNeeds(s); renderTab(s);
    const sat = L.map('sat', { zoomControl: false, attributionControl: false, dragging: false, scrollWheelZoom: false, doubleClickZoom: false, boxZoom: false, keyboard: false, touchZoom: false }).setView([r.lat, r.lng], 18);
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19 }).addTo(sat);
    L.circleMarker([r.lat, r.lng], { radius: 5, color: '#fff', weight: 2, fillColor: '#06162b', fillOpacity: 1 }).addTo(sat);
    R.sat = sat; setTimeout(() => sat.invalidateSize(), 60);
  }

  function renderSnapshot(s) {
    $('#snapshot').innerHTML = EQ.AREAS.map((a) => {
      const x = areaStatus(s, a.key), m = EQ.STATUS[x.status];
      return `<button class="text-left p-4 border-r border-b border-line hover:bg-paper flex flex-col gap-1.5 snap-${x.status}" data-action="area" data-area="${a.key}">
        <span class="flex items-center justify-between gap-2"><span class="text-[12px] text-ink2">${esc(a.name)}</span>${tag(m.cls, m.label)}</span>
        <span class="text-[13px] text-ink leading-snug">${esc(x.note)}</span>
        ${x.by ? `<span class="text-[11px] text-mute">Set by ${esc(x.by)}</span>` : x.evidence ? '<span class="text-[11px] text-mute">From customer data</span>' : '<span class="text-[11px] text-mute">From public records</span>'}
      </button>`;
    }).join('');
  }

  function renderFindings(s) {
    const order = { risk: 0, good: 1, info: 2 };
    const items = s.findings.map((f, i) => ({ f, i })).sort((a, b) => order[a.f.sev] - order[b.f.sev]);
    const open = s.findings.filter((f, i) => f.sev === 'risk' && !st(s.id).reviewed[i]).length;
    const mark = { risk: ['crit', 'Risk'], good: ['ok', 'Supports'], info: ['muted', 'Note'] };
    $('#findings').innerHTML = `<div class="panel-head"><div class="eyebrow flex-1">Findings from records</div><span class="text-[12px] ${open ? 'text-alert' : 'text-mute'}">${open} open risk${open === 1 ? '' : 's'}</span></div>
      <ul>${items.map(({ f, i }) => { const rv = st(s.id).reviewed[i]; return `<li class="grid grid-cols-[82px_1fr_auto] gap-3 px-5 py-3 border-t border-line2 first:border-t-0 ${rv ? 'opacity-55' : ''}">
        <span class="pt-0.5">${tag(mark[f.sev][0], mark[f.sev][1])}</span>
        <div class="min-w-0"><div class="text-[13.5px] text-ink leading-snug">${esc(f.text)}</div>
          <div class="text-[11.5px] text-mute mt-1"><button class="hover:text-ink underline decoration-line underline-offset-2" data-action="tab" data-tab="${f.area === 'load' ? 'load' : f.area === 'site' ? 'site' : 'permits'}">${esc(f.src)}</button> · ${esc(EQ.AREAS.find((a) => a.key === f.area).name)}</div></div>
        <label class="flex items-center gap-1.5 text-[11.5px] text-ink2 cursor-pointer pt-0.5"><input type="checkbox" class="w-3.5 h-3.5 accent-[#06162b]" data-review="${i}" ${rv ? 'checked' : ''} />Reviewed</label></li>`; }).join('')}</ul>`;
  }

  function renderNeeds(s) {
    const d = st(s.id).docs, got = docsReceived(s);
    $('#needs').innerHTML = `<div class="panel-head"><div class="eyebrow flex-1">Needed from the customer</div><span class="text-[12px] text-mute num">${got}/${EQ.CUSTOMER_DOCS.length} received</span></div>
      <ul>${EQ.CUSTOMER_DOCS.map((c) => `<li class="flex items-start gap-3 px-5 py-2.5 border-t border-line2 first:border-t-0">
        <span class="mt-1.5 w-2 h-2 rounded-full shrink-0 ${d[c.key] ? 'bg-steel' : 'bg-line'}"></span>
        <div class="min-w-0 flex-1"><div class="text-[13px] ${d[c.key] ? 'text-ink2' : 'text-ink'}">${esc(c.name)}</div><div class="text-[11.5px] text-mute">${d[c.key] ? `Received ${esc(d[c.key].name)}` : esc(c.why)}</div></div>
        <label class="btn btn-secondary btn-xs cursor-pointer shrink-0">${d[c.key] ? 'Replace' : 'Upload'}<input type="file" class="hidden" accept="${c.accept}" data-upload="${c.key}" /></label></li>`).join('')}</ul>
      <div class="px-5 py-4 border-t border-line2 flex items-center gap-3"><span class="text-[12.5px] text-ink2 flex-1">Next: ${esc(nextStep(s))}</span>${got < EQ.CUSTOMER_DOCS.length ? '<button class="btn btn-primary btn-sm" data-action="request">Draft request</button>' : ''}</div>`;
  }

  function refresh(s) { renderSnapshot(s); renderFindings(s); renderNeeds(s); destroyTabCharts(); renderTab(s); persist(); }
  function destroyTabCharts() { Object.keys(R.charts).forEach((k) => { R.charts[k].destroy(); delete R.charts[k]; }); if (R.aerial) { R.aerial.remove(); R.aerial = null; } }

  /* ---------------------------------------------------------------- tabs */
  function renderTab(s) {
    $$('[data-action="tab"][role="tab"]').forEach((b) => { const on = b.dataset.tab === S.tab; b.classList.toggle('active', on); b.setAttribute('aria-selected', on); });
    const el = $('#tab-body');
    ({ electrical: tabElectrical, load: tabLoad, site: tabSite, permits: tabPermits, docs: tabDocs, reqs: tabReqs }[S.tab] || tabElectrical)(s, el);
  }

  function factRow(k, v, src) { return `<div class="grid grid-cols-[180px_1fr_auto] gap-4 px-5 py-2.5 border-t border-line2 first:border-t-0 text-[13px]"><dt class="text-ink2">${k}</dt><dd class="text-ink">${v}</dd><dd class="text-[11.5px] text-mute text-right">${src || ''}</dd></div>`; }

  function tabElectrical(s, el) {
    const inp = st(s.id).inputs;
    const elec = rec(s).permits.filter((p) => RX.electrical.test(p.desc));
    const fields = [['voltage', 'Service voltage', 'e.g. 480Y/277V', 'text'], ['mainA', 'Main OCPD (A)', '', 'number'], ['busA', 'Bus rating (A)', '', 'number'], ['kva', 'Service transformer (kVA)', '', 'number'], ['sccr', 'Switchboard SCCR (kA)', '', 'number'], ['pvKw', 'Existing PV (kW AC)', '0', 'number'], ['bessKw', 'Proposed BESS (kW)', '', 'number']];
    el.innerHTML = `<div class="grid grid-cols-1 xl:grid-cols-2 xl:divide-x divide-line2">
      <div>
        <div class="px-5 pt-4 pb-2 text-[14px] text-ink">From permit records <span class="text-[12px] text-mute">· ${elec.length} electrical-relevant</span></div>
        <ul>${elec.map((p) => { const chips = ratingChips(p.desc); return `<li class="px-5 py-2.5 border-t border-line2"><div class="flex items-baseline gap-3 text-[12px]"><span class="num text-ink">${fmtDate(p.date)}</span><span class="text-mute">${esc(p.kind)} · ${esc(p.status)}</span>${chips.map((c) => `<span class="stamp">${esc(c)}</span>`).join('')}</div><div class="text-[12.5px] text-ink2 mt-1">${esc(p.desc.slice(0, 220))}${p.desc.length > 220 ? '…' : ''}</div></li>`; }).join('') || '<li class="px-5 py-4 text-mute text-[13px]">No electrical-relevant permits on record.</li>'}</ul>
      </div>
      <div>
        <div class="px-5 pt-4 pb-1 text-[14px] text-ink">Engineer inputs</div>
        <div class="px-5 pb-3 text-[12px] text-mute">Enter values from the SLD, nameplate photos or site visit. The tie-in check updates as you type.</div>
        <div class="grid grid-cols-2 gap-x-4 gap-y-3 px-5 pb-4">${fields.map(([k, l, ph, t]) => `<label class="block text-[12px]"><span class="text-mute">${l}</span><input class="field w-full h-9 px-2.5 mt-1 num text-[13px]" data-input="${k}" type="${t === 'number' ? 'text' : 'text'}" inputmode="${t === 'number' ? 'decimal' : 'text'}" placeholder="${ph}" value="${esc(inp[k] ?? '')}" /></label>`).join('')}</div>
        <div id="tiein" class="border-t border-line2"></div>
      </div></div>`;
    renderTieIn(s);
  }
  function renderTieIn(s) {
    const i = st(s.id).inputs, el = $('#tiein'); if (!el) return;
    const n = (v) => (v === '' || v == null ? null : Number(v));
    const main = n(i.mainA), bus = n(i.busA), pv = n(i.pvKw) || 0, bess = n(i.bessKw), kva = n(i.kva), sccr = n(i.sccr);
    const v = /480/.test(i.voltage || '') ? 480 : /208/.test(i.voltage || '') ? 208 : /240/.test(i.voltage || '') ? 240 : null;
    if (!main || !bus || !bess || !v) { el.innerHTML = `<div class="px-5 py-4 text-[12.5px] text-mute">Tie-in check needs service voltage, main OCPD, bus rating and proposed BESS kW.</div>`; return; }
    const amps = (kw) => (kw * 1000) / (Math.sqrt(3) * v);
    const allow = 1.2 * bus - main, req = 1.25 * (amps(pv) + amps(bess)), pass = req <= allow;
    const method = pass ? 'Load-side, NEC 705.12(B)(3)(2), breaker at opposite end of bus' : allow > 1.25 * amps(pv) ? `PCS current limit (NEC 705.13) to ${fmt(allow / 1.25 - amps(pv))} A on the BESS (${fmt((allow / 1.25 - amps(pv)) * Math.sqrt(3) * v / 1000)} kW), or supply-side per 705.11` : 'Supply-side connection, NEC 705.11';
    const z = kva ? (kva >= 1000 ? 5.75 : 5) : null, isc = kva ? (kva * 1000) / (Math.sqrt(3) * v) / (z / 100) / 1000 : null;
    const row = (k, val, cls = '') => `<div class="flex justify-between gap-4 px-5 py-2 border-t border-line2 text-[12.5px]"><span class="text-ink2">${k}</span><span class="num ${cls}">${val}</span></div>`;
    el.innerHTML = `<div class="px-5 pt-3 pb-1 text-[13px] text-ink">Tie-in check</div>
      ${row('120% allowance (1.2 × bus − main)', `${fmt(allow)} A`)}${row('Inverter current at 125% (PV + BESS)', `${fmt(req)} A`, pass ? 'text-steel' : 'text-alert')}
      ${isc ? row(`Fault duty, ${fmt(kva)} kVA at ${z}% Z (infinite bus)`, `${fmt(isc, 1)} kA`) : ''}
      ${isc && sccr ? row('SCCR adequacy', sccr >= isc ? `${sccr} kA ≥ ${fmt(isc, 1)} kA` : `${sccr} kA < ${fmt(isc, 1)} kA`, sccr >= isc ? 'text-steel' : 'text-alert') : ''}
      ${main >= 1000 && v === 480 ? row('GFPE', 'Required (NEC 230.95)') : ''}
      <div class="px-5 py-3 border-t border-line2 text-[12.5px] text-ink">Method: ${esc(method)}.</div>`;
  }

  function tabLoad(s, el) {
    const b = rec(s).benchmark.filter((x) => x.year >= 2018), pe = peakEstimate(s), iv = st(s.id).interval;
    el.innerHTML = `<div class="grid grid-cols-1 xl:grid-cols-12 xl:divide-x divide-line2">
      <div class="xl:col-span-7 p-5">
        <div class="text-[14px] text-ink">Grid electricity by year</div>
        <div class="text-[12px] text-mute mb-3">SF Existing Commercial Buildings benchmarking (grid purchase, kWh). Gray = not reported.</div>
        <div class="relative h-[220px]"><canvas id="bench-chart" role="img" aria-label="Annual grid electricity by year"></canvas></div>
        ${iv ? `<div class="text-[14px] text-ink mt-6">Interval data: peak day</div><div class="text-[12px] text-mute mb-3">${esc(iv.file)} · ${fmt(iv.count)} intervals · ${iv.minutes}-min · ${esc(iv.start)} – ${esc(iv.end)}</div>
          <div class="relative h-[220px]"><canvas id="peak-chart" role="img" aria-label="Peak day 15-minute demand"></canvas></div>
          <div class="text-[14px] text-ink mt-6 mb-3">Monthly peak demand</div><div class="relative h-[200px]"><canvas id="month-chart" role="img" aria-label="Monthly peak demand"></canvas></div>` : ''}
      </div>
      <div class="xl:col-span-5">
        <dl>
          ${factRow('Latest annual use', latestKwh(s) ? `${fmt(latestKwh(s).kwh)} kWh (${latestKwh(s).year})` : '—', 'Benchmarking')}
          ${pe ? (pe.measured
            ? factRow('Peak demand', `${fmt(pe.kw, 1)} kW · ${esc(pe.when)}`, 'Interval data') + factRow('Load factor', `${fmt(pe.lf * 100)}%`, 'Interval data') + factRow('Peak timing', esc(iv.peakHours), 'Interval data')
            : factRow('Average demand', `${fmt(pe.avg)} kW`, `${pe.year} kWh ÷ 8,760`) + factRow('Peak estimate', `${fmt(pe.lo)}–${fmt(pe.hi)} kW`, `Typical ${esc(s.type.toLowerCase())} load factor`)) : ''}
          ${factRow('Rate class', esc(rateHint(s)), pe && pe.measured ? 'Interval data' : 'Estimate')}
          ${factRow('Supply', esc(EQ.SF.supply), 'Location')}
          ${factRow('Customer bill', st(s.id).docs.bills ? `Received: ${esc(st(s.id).docs.bills.name)}` : 'Not received', '')}
        </dl>
        <div class="p-5 border-t border-line2">
          <div class="text-[13px] text-ink">Interval data</div>
          <div class="text-[12px] text-mute mt-0.5 mb-3">Drop a PG&amp;E Green Button CSV (Download My Data, 15-min). It is parsed in the browser; nothing is uploaded.</div>
          <label class="block border border-dashed border-line px-4 py-6 text-center text-[13px] text-ink2 cursor-pointer hover:border-ink" data-drop="interval">${iv ? `Replace ${esc(iv.file)}` : 'Choose or drop CSV'}<input type="file" class="hidden" accept=".csv,text/csv" data-upload="interval" /></label>
        </div>
      </div></div>`;
    R.charts.bench = new Chart($('#bench-chart'), { type: 'bar', data: { labels: b.map((x) => x.year), datasets: [{ label: 'Grid kWh', data: b.map((x) => x.kwh || 0), backgroundColor: b.map((x) => (x.kwh ? '#3c6390' : '#d3cecd')), maxBarThickness: 34 }] },
      options: chartOpts((v) => fmt(v / 1e6, 2) + ' GWh', (c) => (b[c.dataIndex].kwh ? `${fmt(c.parsed.y)} kWh` : `Not reported (${b[c.dataIndex].status})`)) });
    if (iv) {
      R.charts.peak = new Chart($('#peak-chart'), { type: 'line', data: { labels: iv.peakDay.map((p) => p.t), datasets: [{ label: 'kW', data: iv.peakDay.map((p) => p.kw), borderColor: '#3c6390', borderWidth: 1.75, pointRadius: 0, tension: 0.2 }] }, options: chartOpts((v) => fmt(v) + ' kW', (c) => `${fmt(c.parsed.y, 1)} kW`) });
      R.charts.month = new Chart($('#month-chart'), { type: 'bar', data: { labels: iv.monthly.map((m) => m.m), datasets: [{ label: 'Peak kW', data: iv.monthly.map((m) => m.kw), backgroundColor: '#3c6390', maxBarThickness: 26 }] }, options: chartOpts((v) => fmt(v) + ' kW', (c) => `${fmt(c.parsed.y, 1)} kW`) });
    }
  }
  function chartOpts(tick, label) {
    return { responsive: true, maintainAspectRatio: false, animation: false, plugins: { legend: { display: false }, tooltip: { backgroundColor: '#06162b', cornerRadius: 0, padding: 8, callbacks: { label } } },
      scales: { x: { grid: { display: false }, ticks: { color: '#7d828b', font: { family: 'Inter', size: 10 }, maxTicksLimit: 12, maxRotation: 0 }, border: { color: '#d3cecd' } },
        y: { beginAtZero: true, grid: { color: '#efece9' }, border: { display: false }, ticks: { color: '#7d828b', font: { family: 'Inter', size: 10 }, callback: tick } } } };
  }

  function tabSite(s, el) {
    const ms = st(s.id).measures;
    el.innerHTML = `<div class="grid grid-cols-1 xl:grid-cols-12 xl:divide-x divide-line2">
      <div class="xl:col-span-8"><div id="aerial" class="h-[480px]"></div></div>
      <div class="xl:col-span-4">
        <div class="px-5 pt-4 text-[14px] text-ink">Measure</div>
        <div class="px-5 pb-3 text-[12px] text-mute">Click two points on the aerial to measure. Name each measurement (e.g. pad to lot line).</div>
        <ul id="measures">${ms.map((m, i) => `<li class="flex items-center gap-3 px-5 py-2 border-t border-line2 text-[13px]"><span class="flex-1">${esc(m.label)}</span><span class="num ${m.ft < 10 ? 'text-alert' : 'text-ink'}">${fmt(m.ft)} ft</span><button class="text-mute hover:text-ink" data-action="del-measure" data-i="${i}" aria-label="Delete">✕</button></li>`).join('') || '<li class="px-5 py-2 border-t border-line2 text-[12.5px] text-mute">No measurements yet.</li>'}</ul>
        <div class="px-5 pt-5 text-[14px] text-ink">Siting criteria</div>
        <ul class="text-[12.5px] text-ink2 px-5 py-2 space-y-2 list-disc pl-9">
          <li>Outdoor ESS: 10 ft to lot lines, public ways, buildings and other exposures; may reduce to 3 ft with a rated barrier or tested enclosure (CFC / 2024 IFC §1207).</li>
          <li>Fire department access to the enclosure; confirm with SFFD.</li>
          <li>Vehicle impact protection near drive aisles, docks and parking.</li>
          <li>Conduit route to the main switchboard; shorter is cheaper.</li>
          <li>Crane or forklift access for delivery.</li>
        </ul>
      </div></div>`;
    const r = rec(s);
    const m = L.map('aerial', { maxZoom: 21 }).setView([r.lat, r.lng], 19);
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 21, maxNativeZoom: 19, attribution: 'Imagery © Esri' }).addTo(m);
    L.circleMarker([r.lat, r.lng], { radius: 5, color: '#fff', weight: 2, fillColor: '#06162b', fillOpacity: 1 }).bindTooltip('Address point').addTo(m);
    ms.forEach((x) => L.polyline(x.pts, { color: '#fff', weight: 2, dashArray: '4 3' }).bindTooltip(`${x.label}: ${fmt(x.ft)} ft`, { permanent: true, className: 'eq-zone-label' }).addTo(m));
    let first = null, temp = null;
    m.on('click', (e) => {
      if (!first) { first = e.latlng; temp = L.circleMarker(first, { radius: 4, color: '#fff', fillColor: '#ac312c', fillOpacity: 1 }).addTo(m); return; }
      const ft = first.distanceTo(e.latlng) * 3.28084;
      const label = prompt(`Distance ${fmt(ft)} ft. Label:`, 'Pad to lot line');
      if (temp) m.removeLayer(temp);
      if (label) { st(s.id).measures.push({ label, ft, pts: [[first.lat, first.lng], [e.latlng.lat, e.latlng.lng]] }); persist(); destroyTabCharts(); renderTab(s); }
      first = null;
    });
    R.aerial = m; setTimeout(() => m.invalidateSize(), 60);
  }

  function tabPermits(s, el) {
    const ps = rec(s).permits;
    const f = S.permitFilter;
    const shown = ps.filter((p) => f === 'all' || (f === 'relevant' ? permitClasses(p).length : permitClasses(p).includes(f)));
    const cnt = (k) => ps.filter((p) => (k === 'all' ? true : k === 'relevant' ? permitClasses(p).length : permitClasses(p).includes(k))).length;
    el.innerHTML = `<div class="flex flex-wrap items-center gap-3 px-5 py-3 border-b border-line2">
        <div class="flex text-[12px] border border-line">${[['relevant', 'Relevant'], ['electrical', 'Electrical'], ['fire', 'Fire'], ['structural', 'Structural'], ['refrigeration', 'Refrigeration'], ['all', 'All']].map(([k, l]) => `<button class="px-3 h-7 ${f === k ? 'bg-ink text-white' : ''}" data-action="pfilter" data-f="${k}">${l} <span class="opacity-60 num">${cnt(k)}</span></button>`).join('')}</div>
        <span class="text-[12px] text-mute flex-1">DataSF building and electrical permits for APN ${esc(s.apn)} · snapshot ${esc(window.SF_RECORDS_ASOF || '')}</span>
        <button class="btn btn-secondary btn-sm" data-action="refresh-permits">Refresh from DataSF</button></div>
      <div class="overflow-x-auto"><table class="tbl w-full min-w-[760px]"><thead><tr><th>Filed</th><th>Type</th><th>Status</th><th>Description</th><th>Tags</th></tr></thead><tbody>
      ${shown.map((p) => `<tr class="!cursor-default"><td class="num whitespace-nowrap text-[12.5px]">${fmtDate(p.date)}</td><td class="text-[12.5px]">${esc(p.kind)}</td>
        <td class="text-[12.5px] whitespace-nowrap">${tag(/complete/.test(p.status) ? 'ok' : /issued/.test(p.status) ? 'ink' : /expired|cancel|withdrawn/.test(p.status) ? 'crit' : 'gap', p.status)}</td>
        <td class="text-[12.5px] text-ink2 max-w-[640px]">${esc(p.desc)}${p.cost ? ` <span class="text-mute">· $${fmt(p.cost)}</span>` : ''}</td>
        <td class="text-[11.5px]">${[...permitClasses(p), ...ratingChips(p.desc)].map((c) => `<span class="stamp mr-1 mb-1">${esc(c)}</span>`).join('')}</td></tr>`).join('') || '<tr><td colspan="5" class="text-center text-mute !py-8">None in this filter.</td></tr>'}</tbody></table></div>`;
  }
  async function refreshPermits(s) {
    const [bl, lt] = s.apn.split('/');
    const q = (ds) => `https://data.sf.gov/resource/${ds}.json?$where=${encodeURIComponent(`block='${bl}' AND lot='${lt}'`)}&$limit=500&$order=filed_date DESC`;
    try {
      toast('Fetching from DataSF…');
      const [bp, ep] = await Promise.all([fetch(q('i98e-djp9')).then((r) => r.json()), fetch(q('ftty-kx6y')).then((r) => r.json())]);
      const map = (r, kind) => ({ no: r.permit_number, kind, date: (r.filed_date || r.application_creation_date || '').slice(0, 10), status: r.status, cost: r.estimated_cost ? +r.estimated_cost : null, desc: (r.description || '').trim() });
      const before = rec(s).permits.length;
      EQ.REC[s.apn].permits = [...bp.map((r) => map(r, 'Building')), ...ep.map((r) => map(r, 'Electrical'))].sort((a, b) => (a.date < b.date ? 1 : -1));
      const added = EQ.REC[s.apn].permits.length - before;
      toast(`DataSF: ${EQ.REC[s.apn].permits.length} permits${added > 0 ? `, ${added} new since snapshot` : ', no changes'}`);
      renderTab(s);
    } catch (e) { toast('DataSF request failed; showing the saved snapshot.'); }
  }

  function tabDocs(s, el) {
    const d = st(s.id).docs;
    const got = EQ.CUSTOMER_DOCS.filter((c) => d[c.key]);
    el.innerHTML = got.length ? `<div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-px bg-line2">${got.map((c) => { const x = d[c.key]; return `<div class="bg-white p-4">
        <div class="text-[11px] text-mute">${esc(c.name)}</div><div class="text-[13px] text-ink font-mono truncate mt-0.5">${esc(x.name)}</div>
        <div class="text-[11.5px] text-mute">${fmt(x.size / 1024)} KB · ${esc(x.by)} · ${fmtDate(x.at)}</div>
        ${x.thumb ? `<img src="${x.thumb}" alt="${esc(c.name)}" class="mt-3 w-full h-40 object-cover border border-line" />` : ''}
        <div class="text-[12px] text-ink2 mt-2">Supports: ${esc(EQ.AREAS.find((a) => a.key === c.area).name)}${c.key === 'sld' || c.key === 'msb' || c.key === 'main' ? ' — enter ratings in the Electrical tab' : ''}</div>
        <button class="text-[11.5px] text-mute hover:text-alert mt-2" data-action="remove-doc" data-doc="${c.key}">Remove</button></div>`; }).join('')}</div>`
      : `<div class="px-5 py-8 text-[13px] text-mute">No customer documents yet. Upload from the checklist above, or draft a request.</div>`;
  }

  function tabReqs(s, el) {
    const ref = EQ.REF || {};
    const ia = (ref.interconnection || {})['PG&E'];
    const plan = ['Single-line and three-line diagrams, stamped', 'Site plan with separation distances and fire access', 'UL 9540 listing and UL 9540A test report (QorePack)', 'Hazard mitigation analysis', 'Short-circuit, coordination and arc-flash study (NEC 110.16)', 'PCS / relay settings for export control (NEC 705.13)', 'Pad and anchorage calculations', 'Signage and labeling plan (NFPA 855 7.1.3, NEC 706.15)', 'Commissioning plan and draft emergency operations plan (NFPA 855 6.1, 4.1.3.2.1)'];
    el.innerHTML = `<div class="grid grid-cols-1 xl:grid-cols-2 xl:divide-x divide-line2">
      <div><div class="px-5 pt-4 pb-2 text-[14px] text-ink">Authorities &amp; codes</div><dl>
        ${EQ.SF.ahj.map((a) => factRow(link(a.url, a.name), esc(a.role), '')).join('')}
        ${factRow('Codes', esc(EQ.SF.codes), 'Confirm SF amendments')}
        ${factRow('Interconnection', ia ? `${link(ia.url, ia.name)} · ${esc(EQ.SF.interconnection)}` : esc(EQ.SF.interconnection), '')}
        ${factRow('Hosting capacity', 'Look up feeder in PG&E ICA map (account login)', '')}</dl></div>
      <div><div class="px-5 pt-4 pb-2 text-[14px] text-ink">Permit plan set for SF DBI / SFFD</div>
        <ul class="text-[13px]">${plan.map((p) => `<li class="px-5 py-2 border-t border-line2">${esc(p)}</li>`).join('')}</ul></div></div>`;
  }

  /* ---------------------------------------------------------------- customer uploads & interval parsing */
  function readFile(file, asText) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; asText ? r.readAsText(file) : r.readAsDataURL(file); }); }
  async function thumbOf(file) {
    if (!/^image\//.test(file.type)) return null;
    const url = await readFile(file);
    return new Promise((res) => { const img = new Image(); img.onload = () => { const c = document.createElement('canvas'); const k = 360 / Math.max(img.width, img.height); c.width = img.width * k; c.height = img.height * k; c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); res(c.toDataURL('image/jpeg', 0.7)); }; img.onerror = () => res(null); img.src = url; });
  }
  async function handleUpload(s, key, file) {
    if (!file) return;
    const meta = { name: file.name, size: file.size, type: file.type, at: new Date().toISOString(), by: 'Elena Vásquez, PE', thumb: await thumbOf(file) };
    if (key === 'interval') {
      const txt = await readFile(file, true);
      const iv = parseInterval(txt, file.name);
      if (!iv) { toast('Could not find timestamp and kWh/kW columns in that file.'); return; }
      st(s.id).interval = iv; st(s.id).docs.interval = meta;
      toast(`Parsed ${fmt(iv.count)} intervals · peak ${fmt(iv.peakKw, 1)} kW`);
      S.tab = 'load';
    } else {
      st(s.id).docs[key] = meta;
      toast(`Received ${esc(file.name)}`);
    }
    refresh(s);
  }
  /* Parses PG&E Green Button CSV (TYPE,DATE,START TIME,END TIME,USAGE (kWh),…) and generic timestamp,kW/kWh files. */
  function parseInterval(text, name) {
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    const hi = lines.findIndex((l) => /date|time|start/i.test(l) && /(kwh|kw|usage|value|import)/i.test(l));
    if (hi < 0) return null;
    const split = (l) => l.match(/("([^"]|"")*"|[^,]+|(?<=,)(?=,)|^(?=,))/g)?.map((x) => x.replace(/^"|"$/g, '').trim()) || [];
    const H = split(lines[hi]).map((h) => h.toLowerCase());
    const iDate = H.findIndex((h) => h === 'date' || /date/.test(h));
    const iStart = H.findIndex((h) => /start/.test(h) && !/date/.test(h));
    const iVal = H.findIndex((h) => /(usage|import|kwh|value)/.test(h) && !/cost/.test(h));
    const iKw = H.findIndex((h) => /\bkw\b(?!h)/.test(h));
    if (iDate < 0 || (iVal < 0 && iKw < 0)) return null;
    const rows = [];
    for (const l of lines.slice(hi + 1)) {
      const c = split(l); if (c.length < 2) continue;
      const ts = new Date(`${c[iDate]}${iStart >= 0 ? ' ' + c[iStart] : ''}`.replace(/(\d{4}-\d{2}-\d{2}) /, '$1T'));
      const v = parseFloat((iKw >= 0 ? c[iKw] : c[iVal]).replace(/[^0-9.\-]/g, ''));
      if (!isNaN(ts) && !isNaN(v)) rows.push({ ts, v });
    }
    if (rows.length < 96) return null;
    rows.sort((a, b) => a.ts - b.ts);
    const minutes = Math.round((rows[1].ts - rows[0].ts) / 60000) || 15;
    const kw = rows.map((r) => ({ ts: r.ts, kw: iKw >= 0 ? r.v : (r.v * 60) / minutes }));
    let pk = kw[0]; kw.forEach((r) => { if (r.kw > pk.kw) pk = r; });
    const avg = kw.reduce((a, r) => a + r.kw, 0) / kw.length;
    const dayKey = (d) => d.toISOString().slice(0, 10);
    const pd = dayKey(pk.ts);
    const peakDay = kw.filter((r) => dayKey(r.ts) === pd).map((r) => ({ t: r.ts.toTimeString().slice(0, 5), kw: +r.kw.toFixed(1) }));
    const months = {}; kw.forEach((r) => { const k = r.ts.toISOString().slice(0, 7); months[k] = Math.max(months[k] || 0, r.kw); });
    const top = kw.slice().sort((a, b) => b.kw - a.kw).slice(0, Math.max(10, Math.round(kw.length * 0.01)));
    const hours = {}; top.forEach((r) => { const h = r.ts.getHours(); hours[h] = (hours[h] || 0) + 1; });
    const hs = Object.entries(hours).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([h]) => `${String(h).padStart(2, '0')}:00`).join(', ');
    return { file: name, count: kw.length, minutes, start: dayKey(kw[0].ts), end: dayKey(kw[kw.length - 1].ts), peakKw: pk.kw, peakAt: pk.ts.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }), loadFactor: avg / pk.kw, peakDay, monthly: Object.entries(months).map(([m, v]) => ({ m, kw: +v.toFixed(1) })), peakHours: `Top 1% of intervals mostly at ${hs}` };
  }

  function openRequest(s) {
    const missing = EQ.CUSTOMER_DOCS.filter((d) => !st(s.id).docs[d.key]);
    const text = `Subject: ${s.address} — information for battery storage evaluation\n\nHello,\n\nTo evaluate ${s.address} for a battery storage system, could you send the following:\n\n${missing.map((d, i) => `${i + 1}. ${d.name}`).join('\n')}\n\nGreen Button data can be downloaded from your PG&E account (Download My Data, 15-minute intervals, last 12 months). Photos from a phone are fine.\n\nThank you,\nElena Vásquez, PE\nEQORE`;
    openModal({ title: 'Request to customer', subtitle: `${missing.length} items for ${esc(s.address)}`, body: `<textarea id="req-text" rows="16" class="field w-full p-3 text-[13px] leading-relaxed">${esc(text)}</textarea>`,
      footer: '<button class="btn btn-ghost" data-action="close-modal">Close</button><button class="btn btn-primary" data-action="copy-req">Copy</button>' });
  }

  function openArea(s, key) {
    const a = EQ.AREAS.find((x) => x.key === key), x = areaStatus(s, key);
    const fs = s.findings.filter((f) => f.area === key);
    openModal({ title: a.name, subtitle: esc(s.name),
      body: `<div class="text-[13px] text-ink">${esc(x.note)}</div>
        ${fs.length ? `<ul class="mt-4 border border-line">${fs.map((f) => `<li class="px-4 py-2.5 border-t border-line2 first:border-t-0 text-[13px]">${tag(f.sev === 'risk' ? 'crit' : f.sev === 'good' ? 'ok' : 'muted', f.sev === 'risk' ? 'Risk' : f.sev === 'good' ? 'Supports' : 'Note')} <span class="ml-2">${esc(f.text)}</span></li>`).join('')}</ul>` : ''}
        <div class="mt-5 grid grid-cols-[160px_1fr] gap-3 items-center text-[13px]"><label for="ov-status" class="text-mute">Engineer assessment</label>
          <select id="ov-status" class="field h-9 px-2">${['', 'good', 'partial', 'unknown', 'risk'].map((k) => `<option value="${k}" ${(st(s.id).overrides[key] || {}).status === k ? 'selected' : ''}>${k ? EQ.STATUS[k].label : 'Use records / evidence'}</option>`).join('')}</select>
          <label for="ov-note" class="text-mute">Note</label><input id="ov-note" class="field h-9 px-2" value="${esc((st(s.id).overrides[key] || {}).note || '')}" placeholder="${esc(s.areas[key][1])}" /></div>`,
      footer: `<button class="btn btn-ghost" data-action="close-modal">Cancel</button><button class="btn btn-secondary" data-action="tab" data-tab="${{ electrical: 'electrical', load: 'load', site: 'site', permits: 'permits', utility: 'reqs' }[key]}">Open details</button><button class="btn btn-primary" data-action="save-area" data-area="${key}">Save</button>` });
  }

  /* ---------------------------------------------------------------- events */
  const cur = () => (S.route.view === 'site' ? site(S.route.id) : null);
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#user-menu-btn') && !e.target.closest('#user-menu')) $('#user-menu').classList.add('hidden');
    if (!e.target.closest('#search-results') && !e.target.closest('#global-search')) $('#search-results').classList.add('hidden');
    const el = e.target.closest('[data-action]'); if (!el) return;
    const s = cur();
    switch (el.dataset.action) {
      case 'close-modal': closeModal(); break;
      case 'open-site': e.preventDefault(); $('#search-results').classList.add('hidden'); go(el.dataset.id); break;
      case 'tab': if (s) { closeModal(); S.tab = el.dataset.tab; destroyTabCharts(); renderTab(s); $('#tab-body').parentElement.scrollIntoView({ behavior: 'smooth', block: 'start' }); history.replaceState(null, '', `#/site/${s.id}/${S.tab}`); } break;
      case 'pfilter': S.permitFilter = el.dataset.f; if (s) renderTab(s); break;
      case 'refresh-permits': if (s) refreshPermits(s); break;
      case 'request': if (s) openRequest(s); break;
      case 'copy-req': { const t = $('#req-text'); t.select(); try { navigator.clipboard.writeText(t.value).then(() => toast('Copied'), () => { document.execCommand('copy'); toast('Copied'); }); } catch (err) { document.execCommand('copy'); toast('Copied'); } break; }
      case 'area': if (s) openArea(s, el.dataset.area); break;
      case 'save-area': if (s) { const k = el.dataset.area, v = $('#ov-status').value; if (v) st(s.id).overrides[k] = { status: v, note: $('#ov-note').value.trim(), by: 'Elena Vásquez, PE' }; else delete st(s.id).overrides[k]; closeModal(); refresh(s); } break;
      case 'remove-doc': if (s) { delete st(s.id).docs[el.dataset.doc]; if (el.dataset.doc === 'interval') st(s.id).interval = null; refresh(s); } break;
      case 'del-measure': if (s) { st(s.id).measures.splice(+el.dataset.i, 1); persist(); destroyTabCharts(); renderTab(s); } break;
      case 'reset-demo': S.st = {}; persist(); $('#user-menu').classList.add('hidden'); onRoute(); toast('Reviews and uploads cleared'); break;
      default: break;
    }
  });
  document.addEventListener('change', (e) => {
    const s = cur(); if (!s) return;
    if (e.target.matches('[data-review]')) { st(s.id).reviewed[e.target.dataset.review] = e.target.checked; renderFindings(s); renderNeeds(s); persist(); }
    if (e.target.matches('[data-upload]')) handleUpload(s, e.target.dataset.upload, e.target.files[0]);
  });
  document.addEventListener('input', (e) => {
    const s = cur();
    if (s && e.target.matches('[data-input]')) { st(s.id).inputs[e.target.dataset.input] = e.target.value.trim(); renderTieIn(s); renderSnapshot(s); persist(); }
  });
  ['dragover', 'drop'].forEach((ev) => document.addEventListener(ev, (e) => {
    const z = e.target.closest('[data-drop]'); if (!z) return; e.preventDefault();
    if (ev === 'drop' && cur()) handleUpload(cur(), z.dataset.drop, e.dataTransfer.files[0]);
  }));
  const search = $('#global-search');
  search.addEventListener('input', () => {
    const q = search.value.trim().toLowerCase(); const box = $('#search-results');
    if (S.route.view === 'list') { renderList(); box.classList.add('hidden'); return; }
    if (!q) { box.classList.add('hidden'); return; }
    const res = EQ.SITES.filter((s) => [s.name, s.address, s.apn, s.tenant].join(' ').toLowerCase().includes(q));
    box.innerHTML = res.map((s) => `<button class="w-full text-left px-3 py-2.5 hover:bg-paper border-t border-line2 first:border-t-0" data-action="open-site" data-id="${s.id}"><div class="text-[13px] text-ink">${esc(s.name)}</div><div class="text-[11.5px] text-mute">${esc(s.address)} · APN ${esc(s.apn)}</div></button>`).join('') || '<div class="px-3 py-3 text-[13px] text-mute">No match</div>';
    box.classList.remove('hidden');
  });
  $('#user-menu-btn').addEventListener('click', () => $('#user-menu').classList.toggle('hidden'));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
  window.EQ_parseInterval = parseInterval; // exposed for testing
  window.addEventListener('hashchange', onRoute);
  onRoute();
})();
