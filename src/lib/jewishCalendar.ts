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
  };
}

/* ----------------------------- Shabbat mode ------------------------------ */

export type RestWindow = {
  active: boolean;
  /** Names of the rest days in the current/most recent period, e.g. ["שבת"]. */
  title: string;
  endsAt: Date | null;
  dateKeys: string[];
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
 * Is it now Shabbat / Yom Tov at the user's location?
 * Active from candle lighting on the eve until tzeit (8.5°) of the last rest day.
 */
export function getRestWindow(now: Date, todayKey: string, city: CityOption): RestWindow {
  const il = city.il;
  const inactive: RestWindow = { active: false, title: '', endsAt: null, dateKeys: [] };
  const yesterday = addDays(todayKey, -1);
  const tomorrow = addDays(todayKey, 1);

  // Started on a previous day and still running (e.g. two-day Yom Tov, or Shabbat day itself).
  if (isRestDayKey(todayKey, il)) {
    let first = todayKey;
    while (isRestDayKey(addDays(first, -1), il)) first = addDays(first, -1);
    const run = restRun(first, il);
    const last = run[run.length - 1]!;
    const end = getZmanim(last, city).tzeit;
    if (end && now < end) {
      return { active: true, title: restTitle(todayKey, il), endsAt: end, dateKeys: run };
    }
    // Today's rest day is over; tomorrow is not a rest day (otherwise run would include it).
    return inactive;
  }

  // Eve of Shabbat / Yom Tov after candle lighting.
  if (isRestDayKey(tomorrow, il)) {
    const start = getZmanim(todayKey, city).candleLighting;
    if (start && now >= start) {
      const run = restRun(tomorrow, il);
      const end = getZmanim(run[run.length - 1]!, city).tzeit;
      return { active: true, title: restTitle(tomorrow, il), endsAt: end, dateKeys: run };
    }
  }
  void yesterday;
  return inactive;
}

/** Rest days that ended within the last ~36 hours – candidates for "Shabbat backfill". */
export function recentRestDays(now: Date, todayKey: string, city: CityOption): string[] {
  const result: string[] = [];
  for (let i = 0; i <= 2; i += 1) {
    const key = addDays(todayKey, -i);
    if (!isRestDayKey(key, city.il)) continue;
    const end = getZmanim(key, city).tzeit;
    if (end && now >= end && now.getTime() - end.getTime() < 36 * 60 * 60 * 1000) result.push(key);
  }
  // A rest day "ends" only when the whole run ends; drop days whose run is still active.
  return result.filter((key) => !getRestWindow(now, todayKey, city).dateKeys.includes(key)).sort();
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
