import { ActivityLog } from '../types';
import { addDays, weekday, weekKeys } from './dates';
import { measureDays, metricsFor } from './metrics';

/* ----------------------------- Streaks ----------------------------- */

/**
 * Days that never break a streak and never count as missed: Shabbat and Yom Tov.
 * The default only knows Shabbat; callers pass the calendar's rule (Shabbat + Yom Tov for the
 * user's city, CALENDAR_POLICY) – see derived.ts. One rule for every streak in the app.
 */
export type RestRule = (dateKey: string) => boolean;
export const shabbatOnly: RestRule = (key) => weekday(key) === 6;

/**
 * Current streak of consecutive days that have an entry.
 * Today without an entry does not break the streak yet (the day is not over),
 * and an empty Shabbat is skipped rather than counted as a miss.
 */
export function currentStreak(days: Set<string>, todayKey: string, isRestDay: RestRule = shabbatOnly): number {
  let streak = 0;
  // Today, or a rest day just now, does not break the streak before it is over.
  let key = days.has(todayKey) ? todayKey : addDays(todayKey, -1);
  // Safety bound: ten years.
  for (let i = 0; i < 3650; i += 1) {
    if (days.has(key)) {
      streak += 1;
    } else if (!isRestDay(key)) {
      break;
    }
    key = addDays(key, -1);
  }
  return streak;
}

/** Longest run of consecutive active days in the whole history (rest-day gaps are bridged). */
export function bestStreak(days: Set<string>, isRestDay: RestRule = shabbatOnly): number {
  const sorted = [...days].sort();
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const key of sorted) {
    if (prev === null) {
      run = 1;
    } else {
      let expected = addDays(prev, 1);
      while (expected !== key && isRestDay(expected)) expected = addDays(expected, 1);
      run = expected === key ? run + 1 : 1;
    }
    best = Math.max(best, run);
    prev = key;
  }
  return best;
}

export function daysWith(logs: ActivityLog[], predicate: (log: ActivityLog) => boolean = () => true): Set<string> {
  const set = new Set<string>();
  for (const log of logs) if (predicate(log)) set.add(log.dateKey);
  return set;
}

/* ----------------------------- Levels ------------------------------ */

export const LEVELS: Array<{ level: number; name: string; min: number }> = [
  { level: 1, name: 'מתחיל', min: 0 },
  { level: 2, name: 'מתעורר', min: 500 },
  { level: 3, name: 'משתדל', min: 1500 },
  { level: 4, name: 'מתמיד', min: 3500 },
  { level: 5, name: 'זריז', min: 7000 },
  { level: 6, name: 'נאמן', min: 12000 },
  { level: 7, name: 'שקדן', min: 20000 },
  { level: 8, name: 'מסור', min: 32000 },
  { level: 9, name: 'עובד ה׳', min: 50000 },
  { level: 10, name: 'נר תמיד', min: 75000 },
];

export type LevelInfo = {
  level: number;
  name: string;
  /** Points needed to reach the next level, 0 at the top level. */
  toNext: number;
  /** 0–1 progress inside the current level. */
  progress: number;
  isMax: boolean;
};

export function levelInfo(points: number): LevelInfo {
  const safe = Math.max(0, points);
  let index = 0;
  LEVELS.forEach((l, i) => {
    if (safe >= l.min) index = i;
  });
  const current = LEVELS[index] ?? LEVELS[0]!;
  const next = LEVELS[index + 1];
  if (!next) return { level: current.level, name: current.name, toNext: 0, progress: 1, isMax: true };
  return {
    level: current.level,
    name: current.name,
    toNext: next.min - safe,
    progress: (safe - current.min) / (next.min - current.min),
    isMax: false,
  };
}

/* ----------------------------- Week -------------------------------- */

const DAY_LABELS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];

export function weekBreakdown(logs: ActivityLog[], todayKey: string, points?: Map<string, number>) {
  const keys = weekKeys(todayKey);
  const measures = measureDays(logs.filter((l) => keys.includes(l.dateKey)));
  const days = keys.map((key, i) => ({
    key,
    label: DAY_LABELS[i] ?? '',
    /** Distinct actions that day (all blessings together count as one). */
    count: measures.get(key)?.distinctActions ?? 0,
    blessings: measures.get(key)?.blessings ?? 0,
    isToday: key === todayKey,
    isFuture: key > todayKey,
  }));
  const weekPoints = keys.reduce((sum, k) => sum + (points?.get(k) ?? 0), 0);
  return { days, total: days.reduce((sum, d) => sum + d.count, 0), points: weekPoints };
}

/* ----------------------------- Badges ------------------------------ */

export type BadgeKey = 'steady' | 'kindness' | 'blesser' | 'torah';

export type BadgeProgress = {
  key: BadgeKey;
  title: string;
  target: number;
  value: number;
  unit: string;
  earned: boolean;
};

export function badges(logs: ActivityLog[], bestActivityStreak: number): BadgeProgress[] {
  const count = (predicate: (log: ActivityLog) => boolean) => logs.filter(predicate).length;
  const defs: Array<Omit<BadgeProgress, 'earned'>> = [
    { key: 'steady', title: 'מתמיד', target: 14, value: bestActivityStreak, unit: 'ימים ברצף' },
    { key: 'kindness', title: 'לב פתוח', target: 20, value: count((l) => l.actionKey === 'chesed'), unit: 'מעשי חסד' },
    { key: 'blesser', title: 'מברך', target: 500, value: count((l) => l.kind === 'blessing'), unit: 'ברכות שנרשמו' },
    { key: 'torah', title: 'בן תורה', target: 30, value: daysWith(logs, (l) => metricsFor(l.actionKey).learning || l.kind === 'torah').size, unit: 'ימי לימוד' },
  ];
  return defs.map((d) => ({ ...d, value: Math.min(d.value, d.target), earned: d.value >= d.target }));
}
