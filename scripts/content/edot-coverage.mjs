#!/usr/bin/env node
/**
 * Round 14.1: a coverage map for nusach Edot HaMizrach, in the same structure as nusach Ashkenaz –
 * before any pack is built. Our 24 prayer ids are mapped to Sefaria "Siddur Edot HaMizrach" nodes;
 * each node is expanded to its text leaves; each leaf is checked in the Hebrew editions whose licence
 * allows bundling. A prayer with no node in this siddur is reported as such – never filled from
 * another nusach. Nothing here is offered in the app: today Edot HaMizrach is an outside link.
 *   NODE_USE_ENV_PROXY=1 node scripts/content/edot-coverage.mjs
 * Writes docs/review-r14.1/siddur/edot-coverage.json
 */
import fs from 'node:fs';

const BOOK = 'Siddur Edot HaMizrach';
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

const index = await getJson(`https://www.sefaria.org/api/v2/raw/index/${BOOK.replace(/ /g, '_')}`);
const nameOf = (n) => (n.titles ?? []).find((t) => t.primary && t.lang === 'en')?.text ?? n.key;
function nodeAt(path) {
  let n = index.schema;
  for (const part of path) {
    n = (n.nodes ?? []).find((c) => nameOf(c) === part);
    if (!n) throw new Error(`no node "${part}" in ${path.join(' > ')}`);
  }
  return n;
}
function leaves(path) {
  const out = [];
  const walk = (node, p) => {
    if (!node.nodes?.length) out.push([BOOK, ...p].join(', '));
    else for (const c of node.nodes) walk(c, [...p, nameOf(c)]);
  };
  walk(nodeAt(path), path);
  return out;
}

/** Same ids and groups as the Sefard and Ashkenaz packs; [] = this siddur has no such node. */
const MAP = [
  ['upon-arising', 'weekday', [['Preparatory Prayers']]],
  ['shacharit', 'weekday', [['Weekday Shacharit']]],
  ['mincha', 'weekday', [['Weekday Mincha']]],
  ['maariv', 'weekday', [['Weekday Arvit']]],
  ['bedtime-shema', 'weekday', [['Bedtime Shema']]],
  ['birkat-hamazon', 'weekday', [['Post Meal Blessing']]],
  ['blessings-after', 'weekday', [['Al Hamihya']]],
  ['tefillat-haderech', 'weekday', [['Assorted Blessings and Prayers', "Traveler's Prayer"]]],
  ['kabbalat-shabbat', 'shabbat', [['Kabbalat Shabbat']]],
  ['shabbat-maariv', 'shabbat', [['Shabbat Arvit']]],
  ['shabbat-night-meal', 'shabbat', [['Shabbat Evening']]],
  ['shabbat-shacharit', 'shabbat', [['Shabbat Shacharit', 'Psalms for Shabbat'], ['Shabbat Shacharit', "Pesukei D'Zimra"], ['Shabbat Shacharit', 'The Shema'], ['Shabbat Shacharit', 'Amidah']]],
  ['shabbat-torah-reading', 'shabbat', [['Shabbat Shacharit', 'Torah Reading'], ['Shabbat Shacharit', 'Haftarah'], ['Shabbat Shacharit', 'Mi Sheberach'], ['Shabbat Shacharit', 'Ashrei']]],
  ['shabbat-musaf', 'shabbat', [['Shabbat Mussaf']]],
  ['shabbat-day-meal', 'shabbat', [['Daytime Meal']]],
  ['shabbat-mincha', 'shabbat', [['Shabbat Mincha']]],
  ['seuda-shlishit', 'shabbat', [['Third Meal']]],
  ['havdalah', 'shabbat', [['Havdalah', 'Before Havdalah'], ['Havdalah', 'Havdala']]],
  ['rosh-chodesh', 'holiday', [['Rosh Hodesh']]],
  ['yom-tov', 'holiday', [['Prayers for Three Festivals']]],
  ['tal-geshem', 'holiday', []],
  ['sukkah-lulav', 'holiday', []],
  ['hoshanot', 'holiday', []],
  ['chanukah', 'holiday', [['Hanukkah', 'Menorah Lighting']]],
];

const versions = (await getJson(`https://www.sefaria.org/api/texts/versions/${BOOK.replace(/ /g, '_')}`)).filter((v) => v.language === 'he');
const allowed = versions.filter((v) => ALLOWED.includes(v.license));
const prayers = [];
for (const [id, group, paths] of MAP) {
  const refs = paths.flatMap(leaves);
  const byEdition = Object.fromEntries(allowed.map((v) => [v.versionTitle.trim(), 0]));
  const missing = [];
  for (const ref of refs) {
    let any = false;
    for (const v of allowed) {
      const data = await getJson(`https://www.sefaria.org/api/v3/texts/${encodeURIComponent(ref)}?version=${encodeURIComponent(`hebrew|${v.versionTitle}`)}`);
      await sleep(300);
      const t = data?.versions?.[0]?.text;
      const n = t ? flat(t).filter((s) => typeof s === 'string' && s.replace(/<[^>]+>/g, '').trim()).length : 0;
      if (n > 0) {
        byEdition[v.versionTitle.trim()] += 1;
        any = true;
      }
    }
    if (!any) missing.push(ref);
    process.stdout.write('.');
  }
  console.log(`\n${id}: ${refs.length} sections`, byEdition, missing.length ? `missing ${missing.length}` : '');
  prayers.push({ id, group, nodes: paths.map((p) => p.join(' > ')), sections: refs.length, byEdition, missing, inThisSiddur: paths.length > 0 });
}
const out = {
  generatedAt: new Date().toISOString(),
  book: BOOK,
  status: 'coverage map only – no pack is built; in the app Edot HaMizrach is an outside link',
  editions: versions.map((v) => ({ versionTitle: v.versionTitle.trim(), license: v.license, versionSource: v.versionSource, allowed: ALLOWED.includes(v.license) })),
  prayers,
};
fs.mkdirSync('docs/review-r14.1/siddur', { recursive: true });
fs.writeFileSync('docs/review-r14.1/siddur/edot-coverage.json', JSON.stringify(out, null, 2));
console.log('done', prayers.filter((p) => p.inThisSiddur).length, 'of', prayers.length, 'prayers have a node');
