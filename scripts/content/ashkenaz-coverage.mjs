#!/usr/bin/env node
/**
 * Round 14.1: what nusach Ashkenaz really covers, edition by edition – before anything is offered.
 *  - Every WEEKDAY section of the map (scripts/content/siddur-ashkenaz-map.mjs) is checked in each
 *    Hebrew edition whose licence allows bundling (Public Domain, CC0, CC-BY), one request each.
 *  - Every section that no allowed edition has is checked in ALL Hebrew editions on Sefaria, to say
 *    where the text exists and under which licence (an unknown licence is reported, never used).
 *  - The edition that covers the most weekday sections is proposed as the base edition: one edition
 *    for a whole prayer, so the text reads as one nusach (mixing editions needs a continuity check).
 *   NODE_USE_ENV_PROXY=1 node scripts/content/ashkenaz-coverage.mjs
 * Writes docs/review-r14.1/siddur/ashkenaz-coverage.json
 */
import fs from 'node:fs';
import { ashkenazMap, BOOK } from './siddur-ashkenaz-map.mjs';

const ALLOWED = ['Public Domain', 'CC0', 'CC-BY'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function getJson(url) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    let res;
    try {
      res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    } catch {
      await sleep(2000 * (attempt + 1));
      continue;
    }
    if (res.ok) return res.json();
    if (res.status === 400 || res.status === 404) return null;
    await sleep((res.status === 429 ? 6000 : 2000) * (attempt + 1));
  }
  throw new Error(`failed: ${url}`);
}
const flat = (x) => (Array.isArray(x) ? x.flatMap(flat) : [x]);
async function segmentsIn(ref, versionTitle) {
  const data = await getJson(`https://www.sefaria.org/api/v3/texts/${encodeURIComponent(ref)}?version=${encodeURIComponent(`hebrew|${versionTitle}`)}`);
  await sleep(300);
  const v = data?.versions?.[0];
  if (!v?.text) return 0;
  return flat(v.text).filter((s) => typeof s === 'string' && s.replace(/<[^>]+>/g, '').trim()).length;
}

const versions = (await getJson(`https://www.sefaria.org/api/texts/versions/${BOOK.replace(/ /g, '_')}`)).filter((v) => v.language === 'he');
const allowed = versions.filter((v) => ALLOWED.includes(v.license));
const SIDDUR = await ashkenazMap(getJson);

const weekday = SIDDUR.filter(([, group]) => group === 'weekday');
const perPrayer = [];
const missingEverywhere = [];
for (const [id, , title, refs] of weekday) {
  const counts = Object.fromEntries(allowed.map((v) => [v.versionTitle, 0]));
  const sections = [];
  for (const ref of refs) {
    const has = {};
    for (const v of allowed) {
      has[v.versionTitle] = await segmentsIn(ref, v.versionTitle);
      if (has[v.versionTitle] > 0) counts[v.versionTitle] += 1;
    }
    sections.push({ ref, has });
    if (Object.values(has).every((n) => n === 0)) missingEverywhere.push({ prayer: id, ref });
    process.stdout.write('.');
  }
  console.log(`\n${id}: ${refs.length} sections`, counts);
  perPrayer.push({ id, title, sections: refs.length, byEdition: counts, detail: sections });
}

// The seven sections the round-14 build could not fill (shabbat and holiday too), plus any new one.
const built = JSON.parse(fs.readFileSync('docs/review-r14/evidence/siddur-ashkenaz-build.json', 'utf8'));
const toLocate = [...new Set([...built.missing, ...missingEverywhere.map((m) => m.ref)])];
const located = [];
for (const ref of toLocate) {
  const found = [];
  for (const v of versions) {
    const n = await segmentsIn(ref, v.versionTitle);
    if (n > 0) found.push({ versionTitle: v.versionTitle, license: v.license, versionSource: v.versionSource, segments: n });
  }
  const prayer = SIDDUR.find(([, , , refs]) => refs.includes(ref));
  located.push({ ref, prayer: prayer?.[0] ?? null, group: prayer?.[1] ?? null, foundIn: found });
  console.log(`located ${ref}: ${found.map((f) => `${f.versionTitle} (${f.license})`).join('; ') || 'nowhere'}`);
}

const totals = Object.fromEntries(allowed.map((v) => [v.versionTitle, perPrayer.reduce((a, p) => a + p.byEdition[v.versionTitle], 0)]));
const weekdaySections = perPrayer.reduce((a, p) => a + p.sections, 0);
const base = Object.entries(totals).sort((a, b) => b[1] - a[1])[0];
const out = {
  generatedAt: new Date().toISOString(),
  book: BOOK,
  editions: versions.map((v) => ({ versionTitle: v.versionTitle, license: v.license, versionSource: v.versionSource, allowed: ALLOWED.includes(v.license) })),
  weekday: { sections: weekdaySections, coveredByEdition: totals, proposedBase: { versionTitle: base[0], covers: base[1] }, prayers: perPrayer },
  missing: located,
};
fs.mkdirSync('docs/review-r14.1/siddur', { recursive: true });
fs.writeFileSync('docs/review-r14.1/siddur/ashkenaz-coverage.json', JSON.stringify(out, null, 2));
console.log('weekday sections', weekdaySections, 'by edition', totals, 'proposed base', base);
