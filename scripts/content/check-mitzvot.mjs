#!/usr/bin/env node
// Round 14 (review v4 §4): the mitzvah collection stays consistent while it grows toward 613.
// Fails on: a duplicate id or title, a missing field, an entry marked APPROVED without a reviewer,
// a count number used twice or outside its range (Rambam: 248 positive, 365 negative) or of the
// wrong kind, and a "doing" link to an unknown entry. Prints how far the collection is.
import { createRequire } from 'node:module';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const ts = require('typescript');
require.extensions['.ts'] = (m, f) =>
  m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), { compilerOptions: { module: 1, target: 9, esModuleInterop: true } }).outputText, f);
const { mitzvot, DOING, MITZVOT_TOTAL } = require('../../src/data/mitzvot.ts');

const problems = [];
const seen = (key) => {
  const s = new Map();
  for (const m of mitzvot) {
    const k = key(m);
    if (k === undefined) continue;
    if (s.has(k)) problems.push(`duplicate ${typeof k === 'string' ? k : JSON.stringify(k)}: ${s.get(k)} and ${m.id}`);
    else s.set(k, m.id);
  }
};
seen((m) => m.id);
seen((m) => m.title.replace(/[״"׳']/g, ''));
seen((m) => (m.count ? `${m.count.system}:${m.type}:${m.count.number}` : undefined));
const RANGE = { aseh: 248, lav: 365 };
for (const m of mitzvot) {
  for (const f of ['id', 'title', 'type', 'source', 'applies', 'summary', 'practice']) if (!String(m[f] ?? '').trim()) problems.push(`${m.id}: missing ${f}`);
  if (!['aseh', 'lav'].includes(m.type)) problems.push(`${m.id}: type ${m.type}`);
  if (m.review === 'APPROVED' && !String(m.reviewedBy ?? '').trim()) problems.push(`${m.id}: APPROVED without a reviewer`);
  if (m.count && (m.count.number < 1 || m.count.number > RANGE[m.type])) problems.push(`${m.id}: count ${m.count.number} outside 1–${RANGE[m.type]} (${m.type})`);
  if ((m.expanded || m.example) && m.review === 'APPROVED' && !(m.sources ?? []).length) problems.push(`${m.id}: an approved explanation needs an exact source`);
}
for (const id of Object.keys(DOING)) if (!mitzvot.some((m) => m.id === id)) problems.push(`DOING: unknown entry ${id}`);

// Round 14.1: the proposed Rambam mapping (docs/review-r14.1/mitzvot) – one method, no number twice,
// the kind of the entry, in range, every entry once; never APPROVED in the proposal file itself.
const PROPOSAL = 'docs/review-r14.1/mitzvot/rambam-mapping-proposal.json';
let proposal = null;
if (fs.existsSync(PROPOSAL)) {
  proposal = JSON.parse(fs.readFileSync(PROPOSAL, 'utf8'));
  const used = new Map();
  for (const r of proposal.rows) {
    const m = mitzvot.find((x) => x.id === r.id);
    if (!m) problems.push(`proposal: unknown entry ${r.id}`);
    if (r.status !== 'PROPOSED') problems.push(`proposal: ${r.id} is ${r.status} – approval belongs to the entry, with a reviewer`);
    if (!r.proposed) continue;
    if (r.proposed.method !== 'rambam-sefer-hamitzvot') problems.push(`proposal: ${r.id} uses ${r.proposed.method} – one method only`);
    if (m && r.proposed.kind !== m.type) problems.push(`proposal: ${r.id} is ${m.type}, mapped as ${r.proposed.kind}`);
    if (r.proposed.number < 1 || r.proposed.number > RANGE[r.proposed.kind]) problems.push(`proposal: ${r.id} number ${r.proposed.number} out of range`);
    const k = `${r.proposed.kind}:${r.proposed.number}`;
    if (used.has(k)) problems.push(`proposal: ${k} used by ${used.get(k)} and ${r.id}`);
    used.set(k, r.id);
  }
  for (const m of mitzvot) if (!proposal.rows.some((r) => r.id === m.id)) problems.push(`proposal: ${m.id} missing`);
}

const approved = mitzvot.filter((m) => m.review === 'APPROVED').length;
const counted = mitzvot.filter((m) => m.count).length;
console.log(`Mitzvot: ${mitzvot.length} entries (${mitzvot.filter((m) => m.type === 'aseh').length} aseh, ${mitzvot.filter((m) => m.type === 'lav').length} lav) · approved ${approved} · numbered (approved) ${counted} of ${MITZVOT_TOTAL} · doing-links ${Object.keys(DOING).length}${proposal ? ` · Rambam proposal ${proposal.summary.mapped} mapped, ${proposal.summary.notCounted} not counted` : ''}`);
if (problems.length) {
  for (const p of problems) console.log(`  FAIL ${p}`);
  process.exit(1);
}
console.log('Mitzvot check passed');
