#!/usr/bin/env node
/**
 * Round 14 (review v4 §4, "נוסח אשכנז"): builds the nusach Ashkenaz siddur pack from Sefaria, the
 * same way as the Sefard pack (scripts/content/fetch-sefaria.mjs), without touching it.
 *
 *  - Source: Sefaria, "Siddur Ashkenaz" (https://www.sefaria.org/Siddur_Ashkenaz).
 *  - Edition: "Daat Siddur Ashkenaz" (Public Domain, daat.ac.il) first; "The Metsudah siddur, 1981"
 *    (CC-BY, National Library of Israel) only where the PD edition lacks a section – attribution
 *    is kept per section. Editions with an unknown licence are never used.
 *  - Every section records its exact ref, edition, licence, source and the sha256 of its text.
 *  - Status: PENDING_RABBINIC_REVIEW and NOT approved for distribution – the owner approved
 *    Sefaria + nusach Sefard for v1 (2026-11-23); this pack is shown in internal builds only
 *    (src/content/nusach.ts) until the owner approves the edition and the content check is done.
 *
 * The prayers are mapped by node path; each path is expanded to every text leaf under it from the
 * live index schema (so a renamed sub-node fails loudly instead of silently missing text).
 *   NODE_USE_ENV_PROXY=1 node scripts/content/fetch-siddur-ashkenaz.mjs
 */
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { ashkenazMap, BOOK } from './siddur-ashkenaz-map.mjs';

const API = 'https://www.sefaria.org/api/v3/texts/';
const EDITIONS = ['Daat Siddur Ashkenaz', 'The Metsudah siddur, 1981'];
const ALLOWED_LICENSES = ['Public Domain', 'CC0', 'CC-BY'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (s) => createHash('sha256').update(s).digest('hex');
const flat = (x) => (Array.isArray(x) ? x.flatMap(flat) : [x]);

function clean(seg) {
  if (typeof seg !== 'string') return null;
  const isNote = /^\s*<small>[\s\S]*<\/small>\s*$/.test(seg);
  const text = seg
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .trim();
  if (!text) return null;
  return isNote ? { text, note: true } : { text };
}

async function getJson(url) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    let res;
    try {
      res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    } catch (e) {
      console.warn(`  ${e.name === 'TimeoutError' ? 'timeout' : 'network error'} on ${url.slice(0, 110)}; retrying`);
      await sleep(2000 * (attempt + 1));
      continue;
    }
    if (res.ok) return res.json();
    if (res.status === 400 || res.status === 404) return null;
    console.warn(`  HTTP ${res.status}; retrying`);
    await sleep((res.status === 429 ? 6000 : 2000) * (attempt + 1));
  }
  throw new Error(`failed: ${url}`);
}

async function fetchVersion(ref, versionTitle) {
  const data = await getJson(`${API}${encodeURIComponent(ref)}?version=${encodeURIComponent(`hebrew|${versionTitle}`)}`);
  const v = data?.versions?.[0];
  if (!v || !ALLOWED_LICENSES.includes(v.license)) return null;
  const segs = v.text ? flat(v.text).map(clean).filter(Boolean) : [];
  if (segs.length === 0) return null;
  return { ref: data.ref, heRef: data.heRef, versionTitle: v.versionTitle, license: v.license, versionSource: v.versionSource, segments: segs };
}

const SIDDUR = await ashkenazMap(getJson);

const fetchedAt = new Date().toISOString();
const prayers = [];
const missing = [];
const editions = {};
for (const [id, group, title, refs] of SIDDUR) {
  const sections = [];
  for (const ref of refs) {
    let r = null;
    for (const ed of EDITIONS) {
      r = await fetchVersion(ref, ed);
      await sleep(350);
      if (r) break;
    }
    if (!r) {
      missing.push(ref);
      console.warn(`  missing: ${ref}`);
      continue;
    }
    process.stdout.write('.');
    editions[`${r.versionTitle} (${r.license})`] = (editions[`${r.versionTitle} (${r.license})`] ?? 0) + 1;
    const body = r.segments.map((s) => s.text).join('\n');
    sections.push({ ref: r.ref, heTitle: r.heRef.split(',').pop().trim(), versionTitle: r.versionTitle, license: r.license, versionSource: r.versionSource, sha256: sha(body), segments: r.segments });
  }
  console.log(`${id}: ${sections.length}/${refs.length} sections`);
  prayers.push({ id, group, title, sections });
}

const meta = {
  version: '1', title: 'סידור – נוסח אשכנז', nusach: 'ashkenaz', language: 'he', fetchedAt,
  source: { name: 'Sefaria', ref: BOOK, url: 'https://www.sefaria.org/Siddur_Ashkenaz' },
  approval: 'PENDING_RABBINIC_REVIEW',
  distribution: 'NOT_APPROVED',
};
writeFileSync('src/content/packs/siddur-ashkenaz-index.json', JSON.stringify({ id: 'siddur-ashkenaz-index', ...meta, prayers: prayers.map(({ id, group, title }) => ({ id, group, title })) }));
for (const group of ['weekday', 'shabbat', 'holiday']) {
  writeFileSync(`src/content/packs/siddur-ashkenaz-${group}.json`, JSON.stringify({ id: `siddur-ashkenaz-${group}`, group, ...meta, prayers: prayers.filter((p) => p.group === group) }));
}
writeFileSync('docs/review-r14/evidence/siddur-ashkenaz-build.json', JSON.stringify({ fetchedAt, editions, missing, prayers: prayers.map((p) => ({ id: p.id, sections: p.sections.length, segments: p.sections.reduce((a, s) => a + s.segments.length, 0) })) }, null, 2));
console.log('editions', editions);
console.log('missing', missing.length, missing.slice(0, 20));
