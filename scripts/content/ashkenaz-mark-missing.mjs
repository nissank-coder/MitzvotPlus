#!/usr/bin/env node
/**
 * Round 14.1: a section that no allowed edition has is never skipped silently. In the nusach
 * Ashkenaz pack it is kept in its place as { missing: true } with its Hebrew name, and the siddur
 * says so there ("חסר במהדורה …"), instead of jumping over it or filling it from another nusach.
 * Reads the pack built by fetch-siddur-ashkenaz.mjs and the live index (for order and names).
 *   NODE_USE_ENV_PROXY=1 node scripts/content/ashkenaz-mark-missing.mjs
 */
import fs from 'node:fs';
import { ashkenazMap } from './siddur-ashkenaz-map.mjs';

const getJson = async (url) => {
  for (let i = 0; i < 6; i += 1) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (r.ok) return r.json();
    } catch {}
    await new Promise((res) => setTimeout(res, 2000 * (i + 1)));
  }
  throw new Error(`failed: ${url}`);
};
const SIDDUR = await ashkenazMap(getJson);
const report = [];
for (const group of ['weekday', 'shabbat', 'holiday']) {
  const file = `src/content/packs/siddur-ashkenaz-${group}.json`;
  const pack = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const prayer of pack.prayers) {
    const refs = SIDDUR.find(([id]) => id === prayer.id)?.[3];
    if (!refs) throw new Error(`no map for ${prayer.id}`);
    // Sections in map order; a ref may repeat in the map (the same text said twice), so each pack
    // section is taken once, in order.
    const queue = new Map();
    for (const s of prayer.sections.filter((x) => !x.missing)) {
      const k = s.ref.replace(/_/g, ' ');
      queue.set(k, [...(queue.get(k) ?? []), s]);
    }
    const kept = prayer.sections.filter((x) => !x.missing).length;
    const sections = refs.map((ref) => queue.get(ref)?.shift() ?? { ref, heTitle: SIDDUR.heTitleOf(ref), missing: true });
    if (sections.filter((s) => !s.missing).length !== kept) throw new Error(`${prayer.id}: a section of the pack is not in the map (ref spelling?)`);
    prayer.sections = sections;
    for (const s of sections.filter((x) => x.missing)) report.push({ group, prayer: prayer.id, ref: s.ref, heTitle: s.heTitle, position: `${sections.indexOf(s) + 1}/${sections.length}` });
  }
  fs.writeFileSync(file, JSON.stringify(pack));
}
console.log(report.map((r) => `${r.group} ${r.prayer} ${r.position} ${r.heTitle} (${r.ref})`).join('\n'));
