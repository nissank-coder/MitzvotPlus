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
    if (res.status === 400 || res.status === 404) {
      console.warn(`  HTTP ${res.status} on ${ref}: not available in this edition`);
      return null;
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

const W = (n) => `Siddur Sefard, Weekday Shacharit, ${n}`;
const SH = (part, n) => (n ? `Siddur Sefard, ${part}, ${n}` : `Siddur Sefard, ${part}`);

/** [id, group, Hebrew title, Sefaria refs (concatenated in order)]. */
const SIDDUR = [
  // Weekdays (pack 1)
  ['upon-arising', 'weekday', 'השכמת הבוקר', ['Modeh Ani', 'Tallit', 'Tefilin'].map((n) => SH('Upon Arising', n))],
  ['shacharit', 'weekday', 'שחרית לימות החול', [
    'Morning Blessings', 'Blessings on Torah', 'Morning Prayer', 'Korbanot', "B'raita d'Rabi Yishmael", 'Hodu', 'Yishtabach',
    'The Shema', 'Amidah', 'Tachanun', 'Avinu Malkeinu', 'For Monday & Thursday', 'Ashrei', 'Beit Yaakov', 'Song of the Day',
    'Barchi Nafshi', "L'David Hashem", 'Kaveh', 'Aleinu',
  ].map(W)],
  ['mincha', 'weekday', 'מנחה לימות החול', ['Korbanot', 'Amidah', 'Tachanun', 'Avinu Malkeinu'].map((n) => SH('Weekday Mincha', n))],
  ['maariv', 'weekday', 'ערבית לימות החול', ['The Shema', 'Amidah', 'Motzaei Shabbat', 'Sefirat HaOmer'].map((n) => SH('Weekday Maariv', n))],
  ['bedtime-shema', 'weekday', 'קריאת שמע שעל המיטה', [SH('Bedtime Shema')]],
  ['birkat-hamazon', 'weekday', 'ברכת המזון', [SH('Birchat HaMazon', 'Birchat HaMazon')]],
  ['meein-shalosh', 'weekday', 'ברכה מעין שלוש', [SH('Blessings', "Me'ein Shalosh")]],
  ['borei-nefashot', 'weekday', 'בורא נפשות', [SH('Blessings', 'Borei Nefashot')]],

  // Shabbat (pack 2)
  ['shabbat-candles', 'shabbat', 'הדלקת נרות שבת', [SH('Shabbat Candle Lighting')]],
  ['erev-shabbat-mincha', 'shabbat', 'מנחה לערב שבת', ['Mincha', 'Amidah'].map((n) => SH('Shabbat Eve Mincha', n))],
  ['kabbalat-shabbat', 'shabbat', 'קבלת שבת', [SH('Kabbalat Shabbat')]],
  ['shabbat-maariv', 'shabbat', 'ערבית של שבת', ['Shabbat Eve Maariv', 'Shema & Blessings', 'Amidah', 'Vayechulu'].map((n) => SH('Shabbat Eve Maariv', n))],
  ['shabbat-night-meal', 'shabbat', 'סעודת ליל שבת וקידוש', ['Shalom Aleichem', 'Eishet Chayil', 'Atkinu Seudata', 'Shabbat Eve Kiddush', 'Blessing the Children', 'Zemirot'].map((n) => SH('Shabbat Evening Meal', n))],
  ['shabbat-shacharit', 'shabbat', 'שחרית של שבת', ["Pesukei D'Zimrah", 'Shema & Blessings', 'Amidah'].map((n) => SH('Shabbat Morning Services', n))],
  ['shabbat-torah-reading', 'shabbat', 'קריאת התורה בשבת', ['Shabbat Torah Reading', 'Blessings on Torah Reading', 'Hagbahah', 'Haftarah Blessings', 'Blessing of New Month', 'Av HaRachamim'].map((n) => SH('Shabbat Morning Services', n))],
  ['shabbat-musaf', 'shabbat', 'מוסף של שבת', [SH('Musaf')]],
  ['shabbat-day-meal', 'shabbat', 'קידוש וסעודת יום שבת', ['Shabbat Day Kiddush', 'Zemirot'].map((n) => SH('Shabbat Day Meal', n))],
  ['shabbat-mincha', 'shabbat', 'מנחה לשבת', ['Korbanot', 'Amidah', 'Pirkei Avot'].map((n) => SH('Shabbat Mincha', n))],
  ['seuda-shlishit', 'shabbat', 'סעודה שלישית', [SH('Third Meal', 'Zemirot')]],
  ['havdalah', 'shabbat', 'הבדלה', ['Havdala', 'Hamavdil'].map((n) => SH('Motzaei Shabbat ', n)) /* Sefaria's node title ends with a space */],

  // Rosh Chodesh and festivals (pack 2)
  ['rosh-chodesh', 'holiday', 'ראש חודש – הלל ומוסף', ['Hallel', 'Barchi Nafshi', 'Mussaf'].map((n) => SH('Rosh Chodesh', n))],
  ['yom-tov', 'holiday', 'שלוש רגלים – עמידה וקידוש', ['Yom Tov Eve Kiddush', 'Maariv, Shacharit & Mincha Amidah', 'Yom Tov Musaf Amidah', 'Yom Tov Daytime Kiddush'].map((n) => SH('Holidays', n))],
  ['yizkor', 'holiday', 'הזכרת נשמות (יזכור)', [SH('Holidays', 'Yizkor')]],
  ['tal-geshem', 'holiday', 'תפילת טל ותפילת גשם', ['Prayer for Dew', 'Prayer for Rain'].map((n) => SH('Holidays', n))],
  ['sukkah-lulav', 'holiday', 'סוכה ונטילת לולב', [SH('Holidays', 'Prayer Upon Entering Sukkah'), SH('Shaking Lulav')]],
  ['hoshanot', 'holiday', 'הושענות', ['Order of Hoshanot', 'First Day & Chol HaMoed', 'Sabbath', 'Hoshana Rabba'].map((n) => SH('Sukkot', n))],
  ['chanukah', 'holiday', 'הדלקת נרות חנוכה', [SH('Chanukah', 'Menorah Lighting')]],
  ['purim', 'holiday', 'פורים – מקרא מגילה', ['Megillah Reading', 'Order of Purim Day'].map((n) => SH('Purim', n))],
  ['chametz', 'holiday', 'בדיקת חמץ וביעורו', ['Search for Hametz', 'Burning Hametz'].map((n) => SH('Nissan', n))],
  ['haggadah', 'holiday', 'הגדה של פסח', ['Kadesh', 'Urchatz', 'Karpas', 'Yachatz', 'Maggid', 'Rochtzoh', 'Motzi, Matzah', 'Maror', 'Korech', 'Shulchan Orech', 'Tzafun', 'Barech', 'Hallel', 'Nirtzah'].map((n) => SH('Pesach Haggadah', n))],
];

async function buildSiddur() {
  const prayers = [];
  for (const [id, group, title, refs] of SIDDUR) {
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
    prayers.push({ id, group, title, sections });
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
const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7);
if (only !== 'siddur') {
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
}

console.log('Siddur Sefard…');
const prayers = await buildSiddur();
// Split by group so each group loads only when opened; a small index lists every prayer.
const meta = {
  version: '2', title: 'סידור – נוסח ספרד', nusach: 'sefard', language: 'he', fetchedAt,
  source: { name: 'Sefaria', ref: 'Siddur Sefard', url: 'https://www.sefaria.org/Siddur_Sefard' },
  approval: 'PENDING_RABBINIC_REVIEW',
};
writeFileSync('src/content/packs/siddur-sefard-index.json', JSON.stringify({ id: 'siddur-sefard-index', ...meta, prayers: prayers.map(({ id, group, title }) => ({ id, group, title })) }));
for (const group of ['weekday', 'shabbat', 'holiday']) {
  writeFileSync(`src/content/packs/siddur-sefard-${group}.json`, JSON.stringify({ id: `siddur-sefard-${group}`, group, ...meta, prayers: prayers.filter((p) => p.group === group) }));
}
console.log('done');
