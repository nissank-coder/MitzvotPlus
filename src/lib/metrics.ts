import { ACTIONS, ActionCategory, ActionKey, actionDef, BLESSING_GOAL_BONUS } from '../data/actions';
import { ActivityLog, GoalSnapshot } from '../types';

/**
 * Scoring and measurement engine (rules version score-2, docs/mobile-readiness/scoring-rules.md).
 *
 * Points are DERIVED from the log on every read, never summed from stored values, so removing,
 * re-adding, back-filling or changing a goal always gives the same result for the same history.
 * Entries recorded before score-2 (no `rules` field) keep the points they were stored with:
 * old history is not rewritten silently.
 */
export const SCORING_RULES_VERSION = 'score-2' as const;

/* --------------------------- What each action measures --------------------------- */

export type ActionMetrics = {
  category: ActionCategory;
  /** Counts toward the daily "100 blessings" counter (one recorded blessing = 1). */
  blessingUnits: 0 | 1;
  /** A day with this entry is a learning day (Torah streak, learning days). */
  learning: boolean;
};

/**
 * Explicit mapping, one place. Birkat Hamazon and prayers have blessingUnits 0: how many blessings
 * a prayer "contains" needs an approved table (rabbinic decision); until then the user confirms
 * a bundle with the number they actually said (see setBlessingBundle).
 */
export function metricsFor(key: ActionKey | undefined): ActionMetrics {
  const def = key ? actionDef(key) : null;
  const category = def?.category ?? 'other';
  return {
    category,
    blessingUnits: key === 'blessing' ? 1 : 0,
    learning: category === 'torah',
  };
}

/** Status of blessing bundles per action: there is no approved count table yet. */
export const BLESSING_BUNDLE_TABLE = { status: 'NO_APPROVED_TABLE' as const, counts: {} as Partial<Record<ActionKey, number>> };

/* ---------------------------------- Goals ---------------------------------- */

/** Goals in force on a day: the last snapshot that started on or before it (or the first one). */
export function goalsOn(history: GoalSnapshot[], dateKey: string): GoalSnapshot {
  let found = history[0];
  for (const g of history) if (g.from <= dateKey) found = g;
  return found ?? { from: '0000-00-00', dailyGoal: 12, weeklyGoal: 60, blessingGoal: 100 };
}

/** Records a goal change from `dateKey` on; earlier days keep the goals they had. */
export function withGoals(history: GoalSnapshot[], dateKey: string, goals: Omit<GoalSnapshot, 'from'>): GoalSnapshot[] {
  const kept = history.filter((g) => g.from < dateKey);
  return [...kept, { from: dateKey, ...goals }];
}

/* --------------------------------- Scoring --------------------------------- */

export type ScoreSheet = {
  /** Points of each entry under the current rules (frozen value for legacy entries). */
  byLog: Map<string, number>;
  /** Blessing-goal bonus per day (at most one per day). */
  dayBonus: Map<string, number>;
  byDay: Map<string, number>;
  total: number;
};

const byTime = (a: ActivityLog, b: ActivityLog) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

function basePoints(log: ActivityLog): number {
  const def = actionDef(log.actionKey ?? 'prayer');
  let p = def.points;
  if (log.minyan && def.minyanBonus) p += def.minyanBonus;
  if (log.onTime && def.onTimeBonus) p += def.onTimeBonus;
  return p;
}

/** A legacy blessing entry that already carries the goal bonus (old rules stored it on the entry). */
const legacyHasBonus = (log: ActivityLog) => !log.rules && log.kind === 'blessing' && log.points >= BLESSING_GOAL_BONUS;

export function scoreLogs(logs: ActivityLog[], goals: GoalSnapshot[]): ScoreSheet {
  const byLog = new Map<string, number>();
  const dayBonus = new Map<string, number>();
  const byDay = new Map<string, number>();
  const groups = new Map<string, ActivityLog[]>();
  for (const l of logs) {
    const g = `${l.dateKey}|${l.actionKey ?? `title:${l.title}`}`;
    const list = groups.get(g);
    if (list) list.push(l);
    else groups.set(g, [l]);
  }

  for (const list of groups.values()) {
    list.sort(byTime);
    const sample = list[0]!;
    const known = sample.actionKey && sample.actionKey in ACTIONS;
    const def = known ? actionDef(sample.actionKey!) : null;
    // Legacy entries count toward the cap with the points they were given.
    let scored = list.filter((l) => !l.rules && l.points > 0).length;
    const seenRefs = new Set(list.filter((l) => !l.rules).map((l) => l.refId ?? ''));
    for (const log of list) {
      if (!log.rules) {
        byLog.set(log.id, log.points);
        continue;
      }
      if (!def) {
        byLog.set(log.id, 0);
        continue;
      }
      const ref = log.refId ?? '';
      if (def.oncePerDay && seenRefs.has(ref)) {
        byLog.set(log.id, 0);
        continue;
      }
      seenRefs.add(ref);
      if (scored < def.dailyCap) {
        byLog.set(log.id, basePoints(log));
        scored += 1;
      } else byLog.set(log.id, 0);
    }
  }

  // Blessing-goal bonus: once per day, decided from the whole day, never stored on an entry.
  const blessingsPerDay = new Map<string, { count: number; legacyBonus: boolean; hasCurrent: boolean }>();
  for (const l of logs) {
    const units = metricsFor(l.actionKey).blessingUnits || (l.kind === 'blessing' ? 1 : 0);
    if (!units) continue;
    const d = blessingsPerDay.get(l.dateKey) ?? { count: 0, legacyBonus: false, hasCurrent: false };
    d.count += units;
    d.legacyBonus ||= legacyHasBonus(l);
    d.hasCurrent ||= Boolean(l.rules);
    blessingsPerDay.set(l.dateKey, d);
  }
  for (const [day, d] of blessingsPerDay) {
    // A day recorded only under the old rules stays as it was stored.
    if (!d.hasCurrent || d.legacyBonus) continue;
    if (d.count >= goalsOn(goals, day).blessingGoal) dayBonus.set(day, BLESSING_GOAL_BONUS);
  }

  let total = 0;
  for (const l of logs) {
    const p = byLog.get(l.id) ?? 0;
    byDay.set(l.dateKey, (byDay.get(l.dateKey) ?? 0) + p);
    total += p;
  }
  for (const [day, b] of dayBonus) {
    byDay.set(day, (byDay.get(day) ?? 0) + b);
    total += b;
  }
  return { byLog, dayBonus, byDay, total };
}

/* ------------------------------ Day measurements ------------------------------ */

/** Identity of a distinct action: all blessings are ONE action ("ברכות"), not one per blessing. */
export const actionIdentity = (l: ActivityLog) => l.actionKey ?? `title:${l.title}`;

export type DayMeasure = {
  /** Distinct actions done (12 blessings = 1). This is what the daily goal counts. */
  distinctActions: number;
  /** Recorded blessings (the 100-blessings counter). */
  blessings: number;
  /** Any learning entry (Torah study, daily track, mitzvah study, Dvar Torah). */
  learned: boolean;
  /** All entries, including repeats and capped ones. */
  entries: number;
};

export function measureDays(logs: ActivityLog[]): Map<string, DayMeasure> {
  const ids = new Map<string, Set<string>>();
  const out = new Map<string, DayMeasure>();
  for (const l of logs) {
    const m = out.get(l.dateKey) ?? { distinctActions: 0, blessings: 0, learned: false, entries: 0 };
    const set = ids.get(l.dateKey) ?? new Set<string>();
    set.add(actionIdentity(l));
    ids.set(l.dateKey, set);
    const metrics = metricsFor(l.actionKey);
    m.entries += 1;
    m.blessings += metrics.blessingUnits || (l.kind === 'blessing' ? 1 : 0);
    m.learned ||= metrics.learning || l.kind === 'torah';
    m.distinctActions = set.size;
    out.set(l.dateKey, m);
  }
  return out;
}

/* ------------------------------ Tehillim coverage ------------------------------ */

/** refId for a Tehillim reading: chapters, or chapter:verses for a split chapter (e.g. 119). */
export function tehillimRefId(ranges: Array<{ from: number; to: number; verses?: [number, number] }>): string {
  return `tehillim:${ranges.map((r) => (r.verses ? `${r.from}:${r.verses[0]}-${r.verses[1]}` : `${r.from}-${r.to}`)).join(',')}`;
}

/**
 * Verses covered per chapter over the whole history (union, so reading the same chapter twice
 * counts once). Entries without a refId (older versions) are not counted: their chapter is unknown.
 */
export function tehillimCoverage(logs: ActivityLog[]): Map<number, Array<[number, number]>> {
  const cover = new Map<number, Array<[number, number]>>();
  const addSpan = (ch: number, a: number, b: number) => {
    const spans = [...(cover.get(ch) ?? []), [a, b] as [number, number]].sort((x, y) => x[0] - y[0]);
    const merged: Array<[number, number]> = [];
    for (const s of spans) {
      const last = merged[merged.length - 1];
      if (last && s[0] <= last[1] + 1) last[1] = Math.max(last[1], s[1]);
      else merged.push([s[0], s[1]]);
    }
    cover.set(ch, merged);
  };
  for (const l of logs) {
    if (l.actionKey !== 'tehillim' || !l.refId?.startsWith('tehillim:')) continue;
    for (const part of l.refId.slice('tehillim:'.length).split(',')) {
      const split = /^(\d+):(\d+)-(\d+)$/.exec(part);
      const whole = /^(\d+)-(\d+)$/.exec(part);
      if (split) addSpan(Number(split[1]), Number(split[2]), Number(split[3]));
      else if (whole) for (let c = Number(whole[1]); c <= Number(whole[2]); c += 1) addSpan(c, 1, Number.MAX_SAFE_INTEGER);
    }
  }
  return cover;
}

/** Chapters read in full, given each chapter's verse count. */
export function tehillimChaptersRead(logs: ActivityLog[], verseCount: (chapter: number) => number): number[] {
  const out: number[] = [];
  for (const [ch, spans] of tehillimCoverage(logs)) {
    const n = verseCount(ch);
    if (n > 0 && spans.some(([a, b]) => a <= 1 && b >= n)) out.push(ch);
  }
  return out.sort((a, b) => a - b);
}
