import { Event, flags, HDate, HebrewCalendar, Location, OmerEvent, Sedra, Zmanim } from '@hebcal/core';
import { CityOption } from '../data/locations';
import { addDays, dateFromKey } from './dates';

/** Removes Hebrew vowel points and cantillation marks (keeps geresh/gershayim). */
export function stripNikud(text: string): string {
  return text.replace(/[֑-ׇ]/g, '');
}

const locationCache = new Map<string, Location>();
export function toLocation(city: CityOption): Location {
  let loc = locationCache.get(city.id);
  if (!loc) {
    loc = new Location(city.latitude, city.longitude, city.il, city.tzid, city.name, city.il ? 'IL' : undefined, undefined, city.elevation);
    locationCache.set(city.id, loc);
  }
  return loc;
}

export function formatClock(date: Date | null | undefined, city: CityOption): string {
  if (!date || Number.isNaN(date.getTime())) return '--:--';
  return new Intl.DateTimeFormat('he-IL', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: city.tzid }).format(date);
}

/* --------------------------------- Zmanim --------------------------------- */

export type Zman = { key: string; label: string; time: Date };

function safe(fn: () => Date): Date | null {
  try {
    const d = fn();
    return Number.isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

export function getZmanim(dateKey: string, city: CityOption) {
  const z = new Zmanim(toLocation(city), dateFromKey(dateKey), true);
  const sunset = safe(() => z.sunset());
  return {
    alot: safe(() => z.alotHaShachar()),
    sunrise: safe(() => z.sunrise()),
    sofZmanShma: safe(() => z.sofZmanShma()),
    sofZmanTfilla: safe(() => z.sofZmanTfilla()),
    chatzot: safe(() => z.chatzot()),
    minchaGedola: safe(() => z.minchaGedola()),
    plagHaMincha: safe(() => z.plagHaMincha()),
    sunset,
    tzeit: safe(() => z.tzeit(8.5)),
    candleLighting: sunset ? new Date(sunset.getTime() - city.candleMins * 60_000) : null,
  };
}

export type ZmanimForDay = ReturnType<typeof getZmanim>;

export function zmanimList(z: ZmanimForDay): Zman[] {
  const items: Array<[string, string, Date | null]> = [
    ['alot', 'עלות השחר', z.alot],
    ['sunrise', 'הנץ החמה', z.sunrise],
    ['sofZmanShma', 'סוף זמן ק״ש (גר״א)', z.sofZmanShma],
    ['sofZmanTfilla', 'סוף זמן תפילה (גר״א)', z.sofZmanTfilla],
    ['chatzot', 'חצות היום', z.chatzot],
    ['minchaGedola', 'מנחה גדולה', z.minchaGedola],
    ['plagHaMincha', 'פלג המנחה', z.plagHaMincha],
    ['sunset', 'שקיעה', z.sunset],
    ['tzeit', 'צאת הכוכבים', z.tzeit],
  ];
  return items.filter((i): i is [string, string, Date] => i[2] !== null).map(([key, label, time]) => ({ key, label, time }));
}

/* ------------------------------- Day info -------------------------------- */

export type HolidayTag = {
  desc: string;
  title: string;
  flags: number;
};

export type DayInfo = {
  dateKey: string;
  hebrewDate: string;
  weekday: number;
  isShabbat: boolean;
  isYomTov: boolean;
  /** Shabbat or Yom Tov – no app use, no weekday mitzvot. */
  isRestDay: boolean;
  isErevRest: boolean;
  isRoshChodesh: boolean;
  isFast: boolean;
  isCholHamoed: boolean;
  holidays: HolidayTag[];
  parsha: string | null;
  omerDay: number | null;
  omerText: string | null;
  chanukahCandles: number | null;
  /** Day of the Hebrew month (1–30) and the month's length. */
  hebrewDay: number;
  hebrewMonthLength: 29 | 30;
};

function holidaysOn(hd: HDate, il: boolean): Event[] {
  return (HebrewCalendar.getHolidaysOnDate(hd, il) ?? []).filter((e) => {
    const f = e.getFlags();
    if (il && f & flags.CHUL_ONLY) return false;
    if (!il && f & flags.IL_ONLY) return false;
    return true;
  });
}

export function isRestDayKey(dateKey: string, il: boolean): boolean {
  const hd = new HDate(dateFromKey(dateKey));
  return hd.getDay() === 6 || holidaysOn(hd, il).some((e) => e.getFlags() & flags.CHAG);
}

const parshaCache = new Map<string, Sedra>();
function parshaFor(hd: HDate, il: boolean): string | null {
  const key = `${hd.getFullYear()}-${il}`;
  let sedra = parshaCache.get(key);
  if (!sedra) {
    sedra = new Sedra(hd.getFullYear(), il);
    parshaCache.set(key, sedra);
  }
  try {
    // Parsha of the coming Shabbat.
    const shabbat = hd.onOrAfter(6);
    const result = sedra.lookup(shabbat);
    if (result.chag) return null;
    return stripNikud(sedra.getString(shabbat, 'he'));
  } catch {
    return null;
  }
}

export function getDayInfo(dateKey: string, il: boolean): DayInfo {
  const hd = new HDate(dateFromKey(dateKey));
  const events = holidaysOn(hd, il);
  const tags = events.map((e) => ({ desc: e.getDesc(), title: stripNikud(e.render('he')), flags: e.getFlags() }));
  const isShabbat = hd.getDay() === 6;
  const isYomTov = events.some((e) => e.getFlags() & flags.CHAG);
  const isRestDay = isShabbat || isYomTov;
  const isErevRest = !isRestDay && isRestDayKey(addDays(dateKey, 1), il);

  // Omer: counted at night, so the day's number is the count said the previous evening.
  let omerDay: number | null = null;
  let omerText: string | null = null;
  const omerNum = new HDate(hd).deltaDays(new HDate(16, 'Nisan', hd.getFullYear()));
  if (omerNum >= 0 && omerNum < 49) {
    // Tonight's count (evening of this civil date) is omerNum + 2 for days 1..48.
    const tonight = omerNum + 2;
    if (tonight <= 49) {
      omerDay = tonight;
      omerText = stripNikud(new OmerEvent(hd.next(), tonight).render('he'));
    }
  } else if (omerNum === -1) {
    omerDay = 1;
    omerText = stripNikud(new OmerEvent(hd.next(), 1).render('he'));
  }

  const chanukah = events.find((e) => e.getFlags() & flags.CHANUKAH_CANDLES);
  let chanukahCandles: number | null = null;
  if (chanukah) {
    const m = /(\d)/.exec(chanukah.getDesc());
    chanukahCandles = m ? Number(m[1]) : null;
  }

  return {
    dateKey,
    hebrewDate: stripNikud(hd.renderGematriya()),
    weekday: hd.getDay(),
    isShabbat,
    isYomTov,
    isRestDay,
    isErevRest,
    isRoshChodesh: events.some((e) => e.getFlags() & flags.ROSH_CHODESH),
    isFast: events.some((e) => e.getFlags() & (flags.MINOR_FAST | flags.MAJOR_FAST)),
    isCholHamoed: events.some((e) => e.getFlags() & flags.CHOL_HAMOED),
    holidays: tags.filter((t) => !(t.flags & (flags.HEBREW_DATE | flags.PARSHA_HASHAVUA))),
    parsha: parshaFor(hd, il),
    omerDay,
    omerText,
    chanukahCandles,
    hebrewDay: hd.getDate(),
    hebrewMonthLength: hd.daysInMonth() === 29 ? 29 : 30,
  };
}

/* ----------------------------- Shabbat mode ------------------------------ */

/**
 * Versioned calendar policy. DRAFT: the conventions below are engineering defaults and have NOT been
 * approved by a rabbinic authority (decisions D05/D06). Every recorded event carries this version so
 * historical classification can be reproduced after the policy changes.
 */
export const CALENDAR_POLICY = {
  version: 'draft-2026.11.1',
  status: 'DRAFT_NOT_RABBINICALLY_APPROVED',
  dayBoundary: 'civil midnight in the selected city time zone',
  candleLighting: 'sunset minus the city candle-lighting minutes',
  restEnd: 'tzeit at 8.5 degrees below the horizon, on the last consecutive rest day',
  israelDiaspora: 'taken from the selected city',
  unknownTimes:
    'if a boundary cannot be computed (e.g. extreme latitude), the whole civil rest day is locked and the state is marked uncertain',
} as const;

/** YYYY-MM-DD of an instant in an IANA time zone (not the device zone). */
export function cityDateKey(at: Date, tzid: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tzid, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export type CalendarContext = {
  policyVersion: string;
  cityId: string;
  tzid: string;
  il: boolean;
  candleMins: number;
};

/** Immutable snapshot of the settings an event was classified with (spec §4). */
export function calendarContextOf(city: CityOption): CalendarContext {
  return { policyVersion: CALENDAR_POLICY.version, cityId: city.id, tzid: city.tzid, il: city.il, candleMins: city.candleMins };
}

export type RestWindow = {
  active: boolean;
  /** Name of the rest day, e.g. "שבת". */
  title: string;
  /** When recording opens again; null when it cannot be computed (see uncertain). */
  endsAt: Date | null;
  dateKeys: string[];
  /** True when a boundary time could not be computed and the conservative rule applied. */
  uncertain: boolean;
  policyVersion: string;
};

function restTitle(dateKey: string, il: boolean): string {
  const info = getDayInfo(dateKey, il);
  const chag = info.holidays.find((h) => h.flags & flags.CHAG);
  return chag ? chag.title : 'שבת';
}

/** Collects consecutive rest days starting at `first`. */
function restRun(first: string, il: boolean): string[] {
  const keys: string[] = [];
  let key = first;
  while (isRestDayKey(key, il) && keys.length < 4) {
    keys.push(key);
    key = addDays(key, 1);
  }
  return keys;
}

/**
 * Is it now Shabbat / Yom Tov at the selected city?
 * Active from candle lighting on the eve until tzeit of the last rest day, evaluated on the
 * city's own calendar date (a traveller's device zone does not matter).
 */
export function getRestWindow(now: Date, city: CityOption): RestWindow {
  const il = city.il;
  const todayKey = cityDateKey(now, city.tzid);
  const base = { policyVersion: CALENDAR_POLICY.version };
  const inactive: RestWindow = { ...base, active: false, title: '', endsAt: null, dateKeys: [], uncertain: false };
  const tomorrow = addDays(todayKey, 1);

  // Started on a previous day and still running (Shabbat day, or a multi-day Yom Tov).
  if (isRestDayKey(todayKey, il)) {
    let first = todayKey;
    while (isRestDayKey(addDays(first, -1), il)) first = addDays(first, -1);
    const run = restRun(first, il);
    const last = run[run.length - 1]!;
    const end = getZmanim(last, city).tzeit;
    if (!end) {
      // Unknown end: lock for the rest of the civil rest day(s).
      return { ...base, active: true, title: restTitle(todayKey, il), endsAt: null, dateKeys: run, uncertain: true };
    }
    if (now < end) return { ...base, active: true, title: restTitle(todayKey, il), endsAt: end, dateKeys: run, uncertain: false };
    return inactive;
  }

  // Eve of Shabbat / Yom Tov after candle lighting.
  if (isRestDayKey(tomorrow, il)) {
    const start = getZmanim(todayKey, city).candleLighting;
    // Unknown start: the lock begins with the rest day itself (handled above on that date).
    if (start && now >= start) {
      const run = restRun(tomorrow, il);
      const end = getZmanim(run[run.length - 1]!, city).tzeit;
      return { ...base, active: true, title: restTitle(tomorrow, il), endsAt: end, dateKeys: run, uncertain: !end };
    }
  }
  return inactive;
}

/**
 * Rest days whose whole run (e.g. Yom Tov + Shabbat) ended within the last ~36 hours –
 * candidates for "Shabbat backfill".
 */
export function recentRestDays(now: Date, city: CityOption): string[] {
  const il = city.il;
  const todayKey = cityDateKey(now, city.tzid);
  const running = getRestWindow(now, city).dateKeys;
  const result: string[] = [];
  for (let i = 0; i <= 4; i += 1) {
    const key = addDays(todayKey, -i);
    if (!isRestDayKey(key, il) || running.includes(key)) continue;
    let last = key;
    while (isRestDayKey(addDays(last, 1), il)) last = addDays(last, 1);
    const end = getZmanim(last, city).tzeit;
    // Unknown end time: offer backfill once the civil date has moved past the run.
    const ended = end
      ? now >= end && now.getTime() - end.getTime() < 36 * 60 * 60 * 1000
      : last < todayKey && addDays(last, 2) > todayKey;
    if (ended) result.push(key);
  }
  return result.sort();
}

/* --------------------------- Upcoming holidays --------------------------- */

export type UpcomingHoliday = { dateKey: string; title: string; desc: string; flags: number; hebrewDate: string };

const MAJOR =
  flags.CHAG | flags.MINOR_HOLIDAY | flags.MAJOR_FAST | flags.MINOR_FAST | flags.CHOL_HAMOED | flags.ROSH_CHODESH | flags.EREV;

export function upcomingHolidays(fromKey: string, il: boolean, days = 120): UpcomingHoliday[] {
  const start = dateFromKey(fromKey);
  const end = dateFromKey(addDays(fromKey, days));
  const events = HebrewCalendar.calendar({ start, end, il, noModern: true, noSpecialShabbat: true, noMinorFast: false });
  const seen = new Set<string>();
  const out: UpcomingHoliday[] = [];
  for (const e of events) {
    if (!(e.getFlags() & MAJOR)) continue;
    const base = e.getDesc().replace(/\s*(I|II|III|IV|V|VI|VII|VIII|\d+)\s*(Candles?|\(CH''M\))?$/i, '').replace(/^Chanukah:.*$/, 'Chanukah');
    if (seen.has(base)) continue;
    seen.add(base);
    const hd = e.getDate();
    const g = hd.greg();
    const y = g.getFullYear();
    const m = String(g.getMonth() + 1).padStart(2, '0');
    const d = String(g.getDate()).padStart(2, '0');
    out.push({
      dateKey: `${y}-${m}-${d}`,
      title: stripNikud(e.render('he')).replace(/:.*$/, ''),
      desc: e.getDesc(),
      flags: e.getFlags(),
      hebrewDate: stripNikud(hd.renderGematriya()),
    });
  }
  return out;
}
