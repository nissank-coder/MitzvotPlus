#!/usr/bin/env node
/**
 * Round 14.1: a PROPOSED mapping of the app's mitzvah entries to one counting method – the Rambam's
 * Sefer HaMitzvot (248 positive, 365 negative). It is a proposal for the owner and a content
 * reviewer, not an approved count: nothing here is shown in the app as a number.
 *
 * Each number below was chosen by hand and is checked against the text itself: the script fetches
 * Sefer HaMitzvot from Sefaria (Hebrew, "Sefer HaMitzvot, Warsaw 1883", Public Domain, National
 * Library of Israel) and stores, for every entry, the exact ref and the opening words of the Rambam's
 * own definition, so the reviewer sees what the number points to.
 *
 *   NODE_USE_ENV_PROXY=1 node scripts/content/propose-rambam-mapping.mjs
 * Writes docs/review-r14.1/mitzvot/rambam-mapping-proposal.json
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const ts = require('typescript');
require.extensions['.ts'] = (m, f) =>
  m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), { compilerOptions: { module: 1, target: 9, esModuleInterop: true } }).outputText, f);
const { mitzvot } = require('../../src/data/mitzvot.ts');

/** id → [kind, number] in Sefer HaMitzvot; null = not counted in this method (said, for review). */
const PROPOSAL = {
  emunah: ['aseh', 1],
  achdut: ['aseh', 2],
  'ahavat-hashem': ['aseh', 3],
  'yirat-hashem': ['aseh', 4],
  'lo-elohim-acherim': ['lav', 1],
  'lo-tatur': ['lav', 47],
  'talmud-torah': ['aseh', 11],
  'kriat-shema': ['aseh', 10],
  tefilla: ['aseh', 5],
  'tefillin-yad': ['aseh', 13],
  'tefillin-rosh': ['aseh', 12],
  mezuzah: ['aseh', 15],
  tzitzit: ['aseh', 14],
  'birkat-hamazon': ['aseh', 19],
  'kibud-av-vaem': ['aseh', 210],
  'mora-av-vaem': ['aseh', 211],
  'ahavat-israel': ['aseh', 206],
  'ahavat-ger': ['aseh', 207],
  tzedakah: ['aseh', 195],
  halvaah: ['aseh', 197],
  'hashavat-aveda': ['aseh', 204],
  vehalachta: ['aseh', 8],
  'dvekut-chachamim': ['aseh', 6],
  'kibud-zaken': ['aseh', 209],
  tochacha: ['aseh', 205],
  teshuva: ['aseh', 73],
  'kiddush-hashem': ['aseh', 9],
  'lo-tisna': ['lav', 302],
  'lo-tikom': ['lav', 304],
  'lo-titor': ['lav', 305],
  'lo-telech-rachil': ['lav', 301],
  'onaat-devarim': ['lav', 251],
  'onaat-mamon': ['lav', 250],
  'lo-tignov': ['lav', 244],
  'lifnei-iver': ['lav', 299],
  'lo-tekalel-cheresh': ['lav', 317],
  'zachor-shabbat': ['aseh', 155],
  'shvitat-shabbat': ['aseh', 154],
  'lo-melacha-shabbat': ['lav', 320],
  'zechirat-yetziat-mitzrayim': null,
  'sippur-yetziat-mitzrayim': ['aseh', 157],
  matzah: ['aseh', 158],
  'hashbatat-chametz': ['aseh', 156],
  'sefirat-haomer': ['aseh', 161],
  shofar: ['aseh', 170],
  sukkah: ['aseh', 168],
  lulav: ['aseh', 169],
  'inui-yom-kippur': ['aseh', 164],
  'simchat-yom-tov': ['aseh', 54],
  chalah: ['aseh', 133],
  'basar-bechalav': ['lav', 186],
  'shiluach-haken': ['aseh', 148],
  maake: ['aseh', 184],
  'pru-urvu': ['aseh', 212],
  milah: ['aseh', 215],
};
const NOTES = {
  'zechirat-yetziat-mitzrayim': 'לא נמנית כמצווה נפרדת ברשימת ספר המצוות לרמב״ם (חיפוש "למען תזכור" בטקסט לא מצא אותה). לבדיקה: להציג בלי מספר, או לקשר לקריאת שמע (עשה י).',
  'basar-bechalav': 'הפסוק מתייחס לבישול (ל״ת קפו). איסור האכילה נמנה בנפרד (ל״ת קפז). לבדיקה: איזה מהם הפריט מתאר.',
  'kibud-zaken': 'עשה רט כולל כבוד חכמים וזקנים יחד, כמו כותרת הפריט.',
};

const get = async (u) => {
  for (let i = 0; i < 5; i += 1) {
    try {
      const r = await fetch(u, { signal: AbortSignal.timeout(30000) });
      if (r.ok) return r.json();
    } catch {}
    await new Promise((res) => setTimeout(res, 2000 * (i + 1)));
  }
  throw new Error(`failed: ${u}`);
};
const part = { aseh: 'Positive_Commandments', lav: 'Negative_Commandments' };
const books = {};
for (const k of ['aseh', 'lav']) books[k] = await get(`https://www.sefaria.org/api/texts/Sefer_HaMitzvot,_${part[k]}?context=0&commentary=0&pad=0`);
const flat = (x) => (Array.isArray(x) ? x.flat(9).join(' ') : String(x ?? ''));
const strip = (s) => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

const rows = [];
const seen = new Map();
for (const m of mitzvot) {
  const p = PROPOSAL[m.id];
  if (p === undefined) throw new Error(`no proposal for ${m.id}`);
  if (p === null) {
    rows.push({ id: m.id, title: m.title, type: m.type, proposed: null, status: 'PROPOSED', note: NOTES[m.id] });
    continue;
  }
  const [kind, number] = p;
  if (kind !== m.type) throw new Error(`${m.id}: kind ${kind} ≠ entry type ${m.type}`);
  const key = `${kind}:${number}`;
  if (seen.has(key)) throw new Error(`${m.id}: ${key} already used by ${seen.get(key)}`);
  seen.set(key, m.id);
  const b = books[kind];
  const text = strip(flat(b.he[number - 1]));
  rows.push({
    id: m.id,
    title: m.title,
    type: m.type,
    proposed: { method: 'rambam-sefer-hamitzvot', kind, number, canonicalId: `rambam:${kind}:${number}` },
    ref: `Sefer HaMitzvot, ${part[kind].replace('_', ' ')} ${number}`,
    url: `https://www.sefaria.org/Sefer_HaMitzvot%2C_${part[kind]}.${number}?lang=he`,
    rambamOpening: text.slice(0, 220),
    status: 'PROPOSED',
    ...(NOTES[m.id] ? { note: NOTES[m.id] } : {}),
  });
}
const out = {
  title: 'הצעת מיפוי: מאגר המצוות לספר המצוות לרמב״ם',
  status: 'PROPOSED – not approved; not shown in the app as a number',
  method: 'rambam-sefer-hamitzvot (248 עשה, 365 לא תעשה)',
  source: {
    name: 'Sefaria',
    edition: books.aseh.heVersionTitle,
    license: books.aseh.heLicense,
    versionSource: books.aseh.heVersionSource,
  },
  generatedAt: new Date().toISOString(),
  summary: { entries: rows.length, mapped: rows.filter((r) => r.proposed).length, notCounted: rows.filter((r) => !r.proposed).length },
  rows,
};
fs.mkdirSync('docs/review-r14.1/mitzvot', { recursive: true });
fs.writeFileSync('docs/review-r14.1/mitzvot/rambam-mapping-proposal.json', JSON.stringify(out, null, 2));
console.log(`Rambam mapping proposal: ${out.summary.mapped} mapped, ${out.summary.notCounted} not counted, edition ${out.source.edition} (${out.source.license})`);
