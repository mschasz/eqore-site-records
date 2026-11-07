/* Interval data shared by the site records app and the lead form.
   - parseInterval(text, name): Green Button style CSVs (date + start time, or a single timestamp column;
     kW or kWh columns such as "USAGE (kWh)", "demand_kW", "energy_kWh"). Returns a summary.
   - summarizeInterval(rows, name): rows = [{ ts: Date (local clock), kw }].
   - rowsFromSeries(series): rows from a compact series { minutes, segs, kw } (see docs/<site>/interval_*.js).
   - peakShave(rows, opts): monthly peak-shaving model for a battery of a given power and energy. */
(function () {
  'use strict';
  const dk = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const split = (l) => { const out = []; let cur = '', q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === ',' && !q) { out.push(cur.trim()); cur = ''; } else cur += ch; } out.push(cur.trim()); return out; };
  const isKw = (h) => /(^|[^a-z])kw($|[^a-z])/.test(h) || /demand/.test(h);

  function parseInterval(text, name) {
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    const hi = lines.findIndex((l) => /date|time|start/i.test(l) && /(kwh|kw|usage|value|import|demand)/i.test(l));
    if (hi < 0) return null;
    const H = split(lines[hi]).map((h) => h.toLowerCase());
    let iDate = H.findIndex((h) => /date/.test(h) && !/end/.test(h));
    if (iDate < 0) iDate = H.findIndex((h) => /timestamp|datetime|^time$|interval start/.test(h));
    const iStart = H.findIndex((h, i) => i !== iDate && /start/.test(h) && !/date/.test(h));
    const iKw = H.findIndex((h) => isKw(h) && !/kwh/.test(h));
    const iVal = H.findIndex((h) => /(usage|import|kwh|value)/.test(h) && !/cost/.test(h));
    if (iDate < 0 || (iVal < 0 && iKw < 0)) return null;
    const raw = [];
    lines.slice(hi + 1).forEach((l) => {
      const c = split(l); if (c.length < 2) return;
      const ts = new Date(`${c[iDate]}${iStart >= 0 ? 'T' + c[iStart] : ''}`.replace(' ', 'T'));
      const v = parseFloat(String(iKw >= 0 ? c[iKw] : c[iVal]).replace(/[^0-9.\-]/g, ''));
      if (!isNaN(ts) && !isNaN(v)) raw.push({ ts, v });
    });
    if (raw.length < 96) return null;
    raw.sort((a, b) => a.ts - b.ts);
    const minutes = Math.round((raw[1].ts - raw[0].ts) / 60000) || 15;
    return summarizeInterval(raw.map((r) => ({ ts: r.ts, kw: iKw >= 0 ? r.v : (r.v * 60) / minutes })), name, minutes);
  }

  function summarizeInterval(kw, name, minutes) {
    minutes = minutes || Math.round((kw[1].ts - kw[0].ts) / 60000) || 15;
    let pk = kw[0]; kw.forEach((r) => { if (r.kw > pk.kw) pk = r; });
    const avg = kw.reduce((a, r) => a + r.kw, 0) / kw.length;
    const months = {}; kw.forEach((r) => { const k = dk(r.ts).slice(0, 7); months[k] = Math.max(months[k] || 0, r.kw); });
    const top = kw.slice().sort((a, b) => b.kw - a.kw).slice(0, Math.max(10, Math.round(kw.length * 0.01)));
    const hours = {}; top.forEach((r) => { hours[r.ts.getHours()] = (hours[r.ts.getHours()] || 0) + 1; });
    const hs = Object.entries(hours).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([h]) => `${String(h).padStart(2, '0')}:00`).join(', ');
    return {
      file: name, count: kw.length, minutes, start: dk(kw[0].ts), end: dk(kw[kw.length - 1].ts), peakKw: pk.kw,
      peakAt: pk.ts.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }),
      loadFactor: avg / pk.kw, avgKw: avg, kwh: (avg * kw.length * minutes) / 60,
      peakDay: kw.filter((r) => dk(r.ts) === dk(pk.ts)).map((r) => ({ t: r.ts.toTimeString().slice(0, 5), kw: +r.kw.toFixed(1) })),
      monthly: Object.entries(months).map(([m, v]) => ({ m, kw: +v.toFixed(1) })), peakHours: `top 1% of intervals mostly at ${hs}`,
    };
  }

  // Local-clock timestamps from a compact series; segs mark where the clock jumps (daylight saving).
  function rowsFromSeries(sr) {
    const step = sr.minutes * 60000, out = new Array(sr.kw.length);
    sr.segs.forEach(([i0, t0], si) => {
      const end = si + 1 < sr.segs.length ? sr.segs[si + 1][0] : sr.kw.length;
      const [d, hm] = t0.split(' '), [y, mo, da] = d.split('-').map(Number), [h, mi] = hm.split(':').map(Number);
      const base = Date.UTC(y, mo - 1, da, h, mi);
      for (let i = i0; i < end; i++) {
        const w = new Date(base + (i - i0) * step);
        out[i] = { ts: new Date(w.getUTCFullYear(), w.getUTCMonth(), w.getUTCDate(), w.getUTCHours(), w.getUTCMinutes()), kw: sr.kw[i], tF: sr.tF ? sr.tF[i] : null };
      }
    });
    return out;
  }

  /* Monthly peak shaving. For each month, the lowest threshold T such that on every day the battery can
     hold load at or below T: power above T <= kW, and energy above T <= usable kWh (kWh x dod).
     Assumes a full recharge each night below the threshold. Savings = reduction x $/kW-month. */
  function peakShave(rows, o) {
    const P = o.kw, E = o.kwh * (o.dod ?? 0.9), rate = o.ratePerKwMonth || 0, h = (rows[1].ts - rows[0].ts) / 3600000;
    const byMonth = {};
    rows.forEach((r) => { const m = dk(r.ts).slice(0, 7), d = dk(r.ts); ((byMonth[m] = byMonth[m] || {})[d] = byMonth[m][d] || []).push(r.kw); });
    const months = Object.entries(byMonth).map(([m, days]) => {
      const dayArr = Object.values(days), peak = Math.max(...dayArr.map((a) => Math.max(...a)));
      const fits = (T) => dayArr.every((a) => { let e = 0, p = 0; for (const k of a) { if (k > T) { e += (k - T) * h; p = Math.max(p, k - T); } } return p <= P + 1e-9 && e <= E + 1e-9; });
      let lo = Math.max(0, peak - P), hi = peak;
      for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (fits(mid)) hi = mid; else lo = mid; }
      const T = hi, red = peak - T;
      // which limit binds: does more power alone (or more energy alone) let T go lower?
      let maxE = 0; dayArr.forEach((a) => { let e = 0; a.forEach((k) => { if (k > T) e += (k - T) * h; }); maxE = Math.max(maxE, e); });
      const limit = red >= P - 0.5 ? 'power' : 'energy';
      return { m, peak, threshold: T, reduction: red, limit, energyUsed: maxE, savings: red * rate };
    });
    const total = months.reduce((a, x) => a + x.savings, 0);
    return { months, total, avgReduction: months.reduce((a, x) => a + x.reduction, 0) / months.length, minReduction: Math.min(...months.map((x) => x.reduction)), maxReduction: Math.max(...months.map((x) => x.reduction)), opts: Object.assign({ dod: 0.9 }, o), usable: E };
  }

  window.EQ_parseInterval = parseInterval;
  window.EQ_summarizeInterval = summarizeInterval;
  window.EQ_rowsFromSeries = rowsFromSeries;
  window.EQ_peakShave = peakShave;
})();
