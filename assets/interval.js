/* Interval-data parser shared by the site records app and the lead form.
   Accepts Green Button style CSVs (date, start time, kWh or kW columns); returns peak, load factor, peak day and monthly peaks. */
(function () {
'use strict';
function parseInterval(text, name) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const hi = lines.findIndex((l) => /date|time|start/i.test(l) && /(kwh|kw|usage|value|import)/i.test(l));
  if (hi < 0) return null;
  const split = (l) => { const out = []; let cur = '', q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === ',' && !q) { out.push(cur.trim()); cur = ''; } else cur += ch; } out.push(cur.trim()); return out; };
  const H = split(lines[hi]).map((h) => h.toLowerCase());
  const iDate = H.findIndex((h) => /date/.test(h)), iStart = H.findIndex((h) => /start/.test(h) && !/date/.test(h));
  const iVal = H.findIndex((h) => /(usage|import|kwh|value)/.test(h) && !/cost/.test(h)), iKw = H.findIndex((h) => /\bkw\b(?!h)/.test(h));
  if (iDate < 0 || (iVal < 0 && iKw < 0)) return null;
  const rows = [];
  lines.slice(hi + 1).forEach((l) => { const c = split(l); if (c.length < 2) return; const ts = new Date(`${c[iDate]}${iStart >= 0 ? 'T' + c[iStart] : ''}`); const v = parseFloat(String(iKw >= 0 ? c[iKw] : c[iVal]).replace(/[^0-9.\-]/g, '')); if (!isNaN(ts) && !isNaN(v)) rows.push({ ts, v }); });
  if (rows.length < 96) return null;
  rows.sort((a, b) => a.ts - b.ts);
  const minutes = Math.round((rows[1].ts - rows[0].ts) / 60000) || 15;
  const kw = rows.map((r) => ({ ts: r.ts, kw: iKw >= 0 ? r.v : (r.v * 60) / minutes }));
  let pk = kw[0]; kw.forEach((r) => { if (r.kw > pk.kw) pk = r; });
  const avg = kw.reduce((a, r) => a + r.kw, 0) / kw.length;
  const dk = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const months = {}; kw.forEach((r) => { const k = dk(r.ts).slice(0, 7); months[k] = Math.max(months[k] || 0, r.kw); });
  const top = kw.slice().sort((a, b) => b.kw - a.kw).slice(0, Math.max(10, Math.round(kw.length * 0.01)));
  const hours = {}; top.forEach((r) => { hours[r.ts.getHours()] = (hours[r.ts.getHours()] || 0) + 1; });
  const hs = Object.entries(hours).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([h]) => `${String(h).padStart(2, '0')}:00`).join(', ');
  return { file: name, count: kw.length, minutes, start: dk(kw[0].ts), end: dk(kw[kw.length - 1].ts), peakKw: pk.kw, peakAt: pk.ts.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }), loadFactor: avg / pk.kw,
    peakDay: kw.filter((r) => dk(r.ts) === dk(pk.ts)).map((r) => ({ t: r.ts.toTimeString().slice(0, 5), kw: +r.kw.toFixed(1) })), monthly: Object.entries(months).map(([m, v]) => ({ m, kw: +v.toFixed(1) })), peakHours: `top 1% of intervals mostly at ${hs}` };
}
window.EQ_parseInterval = parseInterval;
})();
