#!/usr/bin/env node
/**
 * Builds the offline content packs from Sefaria (owner-approved source, 2026-11-23).
 * Reproducible: `node scripts/content/fetch-sefaria.mjs` rewrites src/content/packs/*.json.
 * Every section records the exact Sefaria version, its license and source, and a sha256 of the text.
 * Preference: Public Domain edition; CC-BY only where the PD edition lacks the section (attribution shown).
 */
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const API = 'https://www.sefaria.org/api/v3/texts/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (s) => createHash('sha256').update(s).digest('hex');
const flat = (x) => (Array.isArray(x) ? x.flatMap(flat) : [x]);

/** Converts a Sefaria segment (HTML) into { text, note }: <small> = instruction, other tags removed. */
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

async function fetchVersion(ref, versionTitle) {
  const url = `${API}${encodeURIComponent(ref)}?version=${encodeURIComponent(`hebrew|${versionTitle}`)}`;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    let res;
    try {
      res = await fetch(url);
    } catch (e) {
      console.warn(`  network error on ${ref}: ${e.cause?.code ?? e.message}; retrying`);
      await sleep(2000 * (attempt + 1));
      continue;
    }
    if (res.ok) {
      const data = await res.json();
      const v = (data.versions || [])[0];
      const segs = v && v.text ? flat(v.text).map(clean).filter(Boolean) : [];
      if (segs.length === 0) return null;
      return { ref: data.ref, heRef: data.heRef, versionTitle: v.versionTitle, license: v.license, versionSource: v.versionSource, segments: segs };
    }
    console.warn(`  HTTP ${res.status} on ${ref}; retrying`);
    await sleep((res.status === 429 ? 5000 : 2000) * (attempt + 1));
  }
  throw new Error(`failed: ${ref}`);
}

async function fetchWithFallback(ref, editions) {
  for (const ed of editions) {
    const r = await fetchVersion(ref, ed);
    await sleep(250);
    if (r) return r;
  }
  return null;
}

const SIDDUR_EDITIONS = ['Torat Emet 357', 'The Metsudah siddur, 1981'];

/** id, Hebrew title, Sefaria refs (concatenated in order). Weekday prayers + blessings for v1. */
const SIDDUR = [
  ['upon-arising', 'השכמת הבוקר', ['Siddur Sefard, Upon Arising, Modeh Ani', 'Siddur Sefard, Upon Arising, Tallit', 'Siddur Sefard, Upon Arising, Tefilin']],
  ['shacharit', 'שחרית לימות החול', [
    'Morning Blessings', 'Blessings on Torah', 'Morning Prayer', 'Korbanot', "B'raita d'Rabi Yishmael", 'Hodu', 'Yishtabach',
    'The Shema', 'Amidah', 'Tachanun', 'Avinu Malkeinu', 'For Monday & Thursday', 'Ashrei', 'Beit Yaakov', 'Song of the Day',
    'Barchi Nafshi', "L'David Hashem", 'Kaveh', 'Aleinu',
  ].map((n) => `Siddur Sefard, Weekday Shacharit, ${n}`)],
  ['mincha', 'מנחה לימות החול', ['Korbanot', 'Amidah', 'Tachanun', 'Avinu Malkeinu'].map((n) => `Siddur Sefard, Weekday Mincha, ${n}`)],
  ['maariv', 'ערבית לימות החול', ['The Shema', 'Amidah', 'Motzaei Shabbat', 'Sefirat HaOmer'].map((n) => `Siddur Sefard, Weekday Maariv, ${n}`)],
  ['bedtime-shema', 'קריאת שמע שעל המיטה', ['Siddur Sefard, Bedtime Shema']],
  ['birkat-hamazon', 'ברכת המזון', ['Siddur Sefard, Birchat HaMazon, Birchat HaMazon']],
  ['meein-shalosh', 'ברכה מעין שלוש', ['Siddur Sefard, Blessings, Me\'ein Shalosh']],
  ['borei-nefashot', 'בורא נפשות', ['Siddur Sefard, Blessings, Borei Nefashot']],
];

async function buildSiddur() {
  const prayers = [];
  for (const [id, title, refs] of SIDDUR) {
    const sections = [];
    for (const ref of refs) {
      const r = await fetchWithFallback(ref, SIDDUR_EDITIONS);
      if (!r) {
        console.warn(`  missing: ${ref}`);
        continue;
      }
      const body = r.segments.map((s) => s.text).join('\n');
      sections.push({ ref: r.ref, heTitle: r.heRef.split(',').pop().trim(), versionTitle: r.versionTitle, license: r.license, versionSource: r.versionSource, sha256: sha(body), segments: r.segments });
      console.log(`  ${r.ref} – ${r.versionTitle} (${r.license}), ${r.segments.length} segments`);
    }
    prayers.push({ id, title, sections });
  }
  return prayers;
}

async function buildTehillim() {
  const chapters = [];
  for (let c = 1; c <= 150; c += 1) {
    const r = await fetchVersion(`Psalms ${c}`, 'Tanach with Nikkud');
    if (!r) throw new Error(`Psalms ${c} missing`);
    chapters.push({ chapter: c, verses: r.segments.map((s) => s.text) });
    if (c % 25 === 0) console.log(`  Psalms ${c}/150`);
    await sleep(400);
  }
  return chapters;
}

const fetchedAt = new Date().toISOString();
console.log('Tehillim…');
const tehillim = await buildTehillim();
const tehillimBody = tehillim.map((c) => c.verses.join('\n')).join('\n');
writeFileSync('src/content/packs/tehillim.json', JSON.stringify({
  id: 'tehillim', version: '1', title: 'תהילים', language: 'he', fetchedAt,
  source: { name: 'Sefaria', ref: 'Psalms', versionTitle: 'Tanach with Nikkud', license: 'Public Domain', versionSource: 'http://www.tanach.us/Tanach.xml', url: 'https://www.sefaria.org/Psalms' },
  sha256: sha(tehillimBody),
  approval: 'PENDING_RABBINIC_REVIEW',
  chapters: tehillim,
}));

console.log('Siddur Sefard…');
const prayers = await buildSiddur();
writeFileSync('src/content/packs/siddur-sefard.json', JSON.stringify({
  id: 'siddur-sefard', version: '1', title: 'סידור – נוסח ספרד', nusach: 'sefard', language: 'he', fetchedAt,
  source: { name: 'Sefaria', ref: 'Siddur Sefard', url: 'https://www.sefaria.org/Siddur_Sefard' },
  approval: 'PENDING_RABBINIC_REVIEW',
  prayers,
}));
console.log('done');
