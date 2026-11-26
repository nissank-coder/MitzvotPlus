import { DailyLearning, HDate } from '@hebcal/core';
import '@hebcal/learning';
import { dateFromKey } from './dates';
import { hebrewNumeral } from './dates';
import { stripNikud } from './jewishCalendar';
import { sefariaRef } from './sefaria';

import { TrackDef, TRACKS } from '../data/tracks';
export { TRACKS, DEFAULT_TRACKS } from '../data/tracks';
export type { TrackDef } from '../data/tracks';

const BOOKS: Record<string, string> = {
  Joshua: 'יהושע', Judges: 'שופטים', 'I Samuel': 'שמואל א', 'II Samuel': 'שמואל ב', 'I Kings': 'מלכים א',
  'II Kings': 'מלכים ב', Isaiah: 'ישעיהו', Jeremiah: 'ירמיהו', Ezekiel: 'יחזקאל', Hosea: 'הושע', Joel: 'יואל',
  Amos: 'עמוס', Obadiah: 'עובדיה', Jonah: 'יונה', Micah: 'מיכה', Nahum: 'נחום', Habakkuk: 'חבקוק',
  Zephaniah: 'צפניה', Haggai: 'חגי', Zechariah: 'זכריה', Malachi: 'מלאכי', Psalms: 'תהילים', Proverbs: 'משלי',
  Job: 'איוב', 'Song of Songs': 'שיר השירים', Ruth: 'רות', Lamentations: 'איכה', Ecclesiastes: 'קהלת',
  Esther: 'אסתר', Daniel: 'דניאל', Ezra: 'עזרא', Nehemiah: 'נחמיה', 'I Chronicles': 'דברי הימים א',
  'II Chronicles': 'דברי הימים ב',
};

function hebrewize(text: string): string {
  let out = text;
  // Longest names first so "II Kings" is not matched as "I Kings".
  for (const en of Object.keys(BOOKS).sort((a, b) => b.length - a.length)) {
    if (out.includes(en)) out = out.replace(en, BOOKS[en] ?? en);
  }
  return stripNikud(out.replace(/^Daf Yomi:\s*/, ''));
}

/**
 * One day's portion of a track. `url` opens it on sefaria.org; `refs` are what the reader loads –
 * the WHOLE portion the label names (round 14: the Chofetz Chaim and Daf Yomi links of hebcal
 * cover only its start; a portion across two sections is two references).
 */
export type TrackItem = { track: TrackDef; label: string; url: string | null; refs: string[]; refId: string };

/** The Sefaria references of a hebcal portion. */
export function portionRefs(trackKey: string, url: string, ev: unknown): string[] {
  const base = sefariaRef(url);
  if (trackKey === 'chofetzchaim') {
    const r = (ev as { reading?: { b?: string | number; e?: string | number } }).reading;
    const b = r?.b !== undefined ? String(r.b) : null;
    const e = r?.e !== undefined ? String(r.e) : null;
    if (b && e && e !== b && base.endsWith(`_${b}`)) {
      const [pb] = b.split('.');
      const [pe, se] = e.split('.');
      if (pb === pe && se) return [`${base}-${se}`];
      // Across two sections (not in the current schedule): both parts, one after the other.
      if (pe && se) return [base, `${base.slice(0, -b.length)}${pe}.1-${se}`];
    }
    return [base];
  }
  // Daf Yomi is the whole daf: both sides.
  if (trackKey === 'dafyomi') return [base.replace(/\.(\d+)a$/, '.$1a-$1b')];
  return [base];
}

const KITZUR_SIMANIM = 221;
const DAY_MS = 24 * 60 * 60 * 1000;

export function trackItem(track: TrackDef, dateKey: string, il: boolean): TrackItem | null {
  const refId = `${track.key}:${dateKey}`;
  if (track.key === 'dailyHalacha') {
    const dayNumber = Math.floor(dateFromKey(dateKey).getTime() / DAY_MS);
    const siman = (dayNumber % KITZUR_SIMANIM) + 1;
    return {
      track,
      label: `קיצור שולחן ערוך, סימן ${hebrewNumeral(siman)}`,
      url: `https://www.sefaria.org/Kitzur_Shulchan_Arukh.${siman}?lang=he`,
      refs: [`Kitzur_Shulchan_Arukh.${siman}`],
      refId,
    };
  }
  if (!track.hebcal) return null;
  try {
    const ev = DailyLearning.lookup(track.hebcal, new HDate(dateFromKey(dateKey)), il);
    if (!ev) return null;
    const brief = (ev as { renderBrief?: (l: string) => string }).renderBrief?.('he-x-NoNikud') ?? ev.render('he-x-NoNikud');
    const url = (ev as { url?: () => string | undefined }).url?.() ?? null;
    const he = url ? url.replace('lang=bi', 'lang=he') : null;
    return { track, label: hebrewize(brief), url: he, refs: he ? portionRefs(track.key, he, ev) : [], refId };
  } catch {
    return null;
  }
}

export function trackByKey(key: string): TrackDef | undefined {
  return TRACKS.find((t) => t.key === key);
}

/* -------------------------- Sefaria text loading -------------------------- */
// Round 14: see src/lib/sefaria.ts (time limit, retry, reasons, the whole text, the device copy).
export { loadSefariaText, deviceTextCache, FAILURE_TEXT, SefariaError } from './sefaria';
