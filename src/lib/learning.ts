import { DailyLearning, HDate } from '@hebcal/core';
import '@hebcal/learning';
import { dateFromKey } from './dates';
import { hebrewNumeral } from './dates';
import { stripNikud } from './jewishCalendar';

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

export type TrackItem = { track: TrackDef; label: string; url: string | null; refId: string };

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
      refId,
    };
  }
  if (!track.hebcal) return null;
  try {
    const ev = DailyLearning.lookup(track.hebcal, new HDate(dateFromKey(dateKey)), il);
    if (!ev) return null;
    const brief = (ev as { renderBrief?: (l: string) => string }).renderBrief?.('he-x-NoNikud') ?? ev.render('he-x-NoNikud');
    const url = (ev as { url?: () => string | undefined }).url?.() ?? null;
    return { track, label: hebrewize(brief), url: url ? url.replace('lang=bi', 'lang=he') : null, refId };
  } catch {
    return null;
  }
}

export function trackByKey(key: string): TrackDef | undefined {
  return TRACKS.find((t) => t.key === key);
}

/* -------------------------- Sefaria text loading -------------------------- */

function flatten(value: unknown, out: string[]): void {
  if (typeof value === 'string') {
    const clean = value.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
    if (clean) out.push(clean);
  } else if (Array.isArray(value)) {
    for (const v of value) flatten(v, out);
  }
}

/**
 * Loads the Hebrew text of a Sefaria link through the public Sefaria API.
 * Needs network access; callers must handle failure by offering the link instead.
 */
export async function fetchSefariaText(url: string, signal?: AbortSignal): Promise<string[]> {
  const { pathname } = new URL(url);
  const ref = decodeURIComponent(pathname.replace(/^\//, ''));
  const res = await fetch(
    `https://www.sefaria.org/api/texts/${encodeURIComponent(ref)}?context=0&commentary=0&pad=0`,
    { signal },
  );
  if (!res.ok) throw new Error(`Sefaria ${res.status}`);
  const data = (await res.json()) as { he?: unknown; error?: string };
  if (data.error) throw new Error(data.error);
  const out: string[] = [];
  flatten(data.he, out);
  if (out.length === 0) throw new Error('empty');
  return out.slice(0, 80);
}
