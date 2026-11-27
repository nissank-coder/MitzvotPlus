// Round 14 (review v4 §4) – diagnosis of "the daily learning does not load". For every track item
// of a date range it runs the app's own request (the URL from trackItem, the API call of
// fetchSefariaText) and records: the ref, HTTP status, failure kind, duration, number of Hebrew
// segments, whether the old code cut the text (80 segments), and the source / licence Sefaria
// reports. No personal data: only public references.
//   node scripts/diagnose/learning-fetch.mjs [--from 2026-11-24] [--days 7] [--out file.json]
import { createRequire } from 'node:module';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const ts = require('typescript');
require.extensions['.ts'] = (m, f) =>
  m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), { compilerOptions: { module: 1, target: 9, esModuleInterop: true } }).outputText, f);
const { trackItem, TRACKS } = require('../../src/lib/learning.ts');
const { sefariaRef, apiUrlFor } = require('../../src/lib/sefaria.ts');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => (a.startsWith('--') ? [a.slice(2), all[i + 1]] : [])).filter((x) => x.length));
const from = new Date(`${args.from ?? '2026-11-24'}T12:00:00Z`);
const days = Number(args.days ?? 7);
// A pause between requests, like one reader at a time (Sefaria answers 429 to a burst).
const gap = Number(args.gap ?? 1500);
const rows = [];
for (let d = 0; d < days; d += 1) {
  const dateKey = new Date(from.getTime() + d * 86400000).toISOString().slice(0, 10);
  for (const t of TRACKS) {
    const item = trackItem(t, dateKey, true);
    if (!item?.url) continue;
    // What the reader loads now (the whole portion); oldRef: what the app loaded before round 14.
    const ref = item.refs[0];
    const oldRef = sefariaRef(item.url);
    const api = apiUrlFor(ref);
    await sleep(gap);
    const t0 = Date.now();
    let row = { dateKey, track: t.key, label: item.label, ref, oldRef, refs: item.refs, api };
    try {
      const res = await fetch(api, { signal: AbortSignal.timeout(20000) });
      row.status = res.status;
      const text = await res.text();
      let data = null;
      try {
        data = JSON.parse(text);
      } catch {
        row.kind = 'bad-json';
      }
      if (data) {
        const out = [];
        const flat = (v) => (typeof v === 'string' ? (v.replace(/<[^>]+>/g, '').trim() && out.push(v)) : Array.isArray(v) ? v.forEach(flat) : null);
        flat(data.he);
        row.kind = data.error ? 'api-error' : !res.ok ? 'http' : out.length === 0 ? 'empty-hebrew' : 'ok';
        row.error = data.error ?? undefined;
        row.segments = out.length;
        row.cutByOldCode = out.length > 80;
        row.heRef = data.heRef;
        row.source = { version: data.heVersionTitle, license: data.heLicense, url: data.heVersionSource };
        row.rangeOfLabelCovered = !/[-–]/.test(item.label) || /[-–]/.test(data.ref ?? '') || item.refs.length > 1;
      }
    } catch (e) {
      row.kind = e.name === 'TimeoutError' ? 'timeout' : 'network';
      row.error = e.message;
    }
    row.ms = Date.now() - t0;
    rows.push(row);
  }
}
const summary = rows.reduce((acc, r) => ((acc[r.kind] = (acc[r.kind] ?? 0) + 1), acc), {});
const out = { at: new Date().toISOString(), from: args.from ?? '2026-11-24', days, summary, cutByOldCode: rows.filter((r) => r.cutByOldCode).map((r) => `${r.dateKey} ${r.track} (${r.segments})`), labelRangeNotFetched: rows.filter((r) => r.rangeOfLabelCovered === false).map((r) => `${r.dateKey} ${r.track}: "${r.label}" → ${r.ref}`), rows };
// A burst, as when a reader is opened again and again: what Sefaria answers.
if (args.burst) {
  const burst = [];
  for (let i = 0; i < Number(args.burst); i += 1) {
    const r = await fetch(apiUrlFor('Kitzur_Shulchan_Arukh.10')).catch((e) => ({ status: 'network', text: async () => e.message, headers: new Map() }));
    const body = await r.text();
    let json = true;
    try {
      JSON.parse(body);
    } catch {
      json = false;
    }
    burst.push({ i, status: r.status, json, bodyStart: body.slice(0, 60) });
  }
  out.burst = burst;
}
if (args.out) fs.writeFileSync(args.out, JSON.stringify(out, null, 2));
console.log(JSON.stringify({ summary, cutByOldCode: out.cutByOldCode, labelRangeNotFetched: out.labelRangeNotFetched }, null, 2));
