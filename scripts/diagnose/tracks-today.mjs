#!/usr/bin/env node
/**
 * Round 14.1 (review §4 H, §5): the real units of every learning track, loaded from Sefaria by the
 * app's own loader (src/lib/sefaria.ts – time limit, retries, budget) – the screenshot's day
 * (26.11.2026) and the next seven days. For each unit: the refs, whether it loaded, how many
 * segments, edition, licence, and whether the licence allows a device copy (offline reading).
 * One unit at a time, with a pause, as a reader would.
 *   NODE_USE_ENV_PROXY=1 node scripts/diagnose/tracks-today.mjs [--from 2026-11-26 --days 8]
 * Writes docs/review-r14.1/evidence/tracks-units.json
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const ts = require('typescript');
require.extensions['.ts'] = (m, f) =>
  m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), { compilerOptions: { module: 1, target: 9, esModuleInterop: true } }).outputText, f);
const { trackItem, TRACKS } = require('../../src/lib/learning.ts');
const { loadSefariaText, cacheable, SefariaError } = require('../../src/lib/sefaria.ts');

const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => (a.startsWith('--') ? [a.slice(2), all[i + 1]] : [])).filter((x) => x.length));
const from = new Date(`${args.from ?? '2026-11-26'}T12:00:00Z`);
const days = Number(args.days ?? 8);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const rows = [];
for (let d = 0; d < days; d += 1) {
  const dateKey = new Date(from.getTime() + d * 86400000).toISOString().slice(0, 10);
  for (const track of TRACKS) {
    const item = trackItem(track, dateKey, true);
    if (!item) {
      rows.push({ dateKey, track: track.key, status: 'no-unit' });
      continue;
    }
    if (track.key === 'psalms') {
      // The app opens the local Tehillim pack for this track (no request).
      rows.push({ dateKey, track: track.key, label: item.label, refs: item.refs, status: 'local-pack' });
      continue;
    }
    const started = Date.now();
    try {
      const t = await loadSefariaText(item.refs, {});
      rows.push({ dateKey, track: track.key, label: item.label, refs: item.refs, status: 'ok', segments: t.segments.length, version: t.version, license: t.license, offlineCopy: cacheable(t.license), ms: Date.now() - started });
    } catch (e) {
      rows.push({ dateKey, track: track.key, label: item.label, refs: item.refs, status: e instanceof SefariaError ? e.kind : 'error', detail: e instanceof SefariaError ? e.detail : String(e), ms: Date.now() - started });
    }
    const r = rows.at(-1);
    console.log(`${dateKey} ${track.key.padEnd(13)} ${r.status.padEnd(12)} ${String(r.segments ?? '').padStart(4)} ${r.refs.join(' + ')} ${r.license ?? ''}`);
    await sleep(1200);
  }
}
const summary = {};
for (const r of rows) {
  const s = (summary[r.track] ??= { units: 0, ok: 0, failed: 0, local: 0, offlineCopy: 0, licenses: {} });
  s.units += 1;
  if (r.status === 'ok') {
    s.ok += 1;
    if (r.offlineCopy) s.offlineCopy += 1;
    s.licenses[`${r.version} (${r.license})`] = (s.licenses[`${r.version} (${r.license})`] ?? 0) + 1;
  } else if (r.status === 'local-pack') s.local += 1;
  else s.failed += 1;
}
fs.mkdirSync('docs/review-r14.1/evidence', { recursive: true });
fs.writeFileSync('docs/review-r14.1/evidence/tracks-units.json', JSON.stringify({ generatedAt: new Date().toISOString(), from: args.from ?? '2026-11-26', days, loader: 'src/lib/sefaria.ts (the app\'s own)', summary, rows }, null, 2));
console.log(JSON.stringify(summary, null, 1));
