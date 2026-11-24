import { ActionCategory, ActionKey, actionDef } from '../data/actions';
import { CURRENT_RULES, ruleFor, ruleSet } from './rulesets';
import { ActivityLog, GoalSnapshot } from '../types';

/**
 * Scoring and measurement engine (rules version score-2, docs/mobile-readiness/scoring-rules.md).
 *
 * Points are DERIVED from the log on every read, never summed from stored values, so removing,
 * re-adding, back-filling or changing a goal always gives the same result for the same history.
 * Entries recorded before score-2 (no `rules` field) keep the points they were stored with:
 * old history is not rewritten silently.
 */
export const SCORING_RULES_VERSION = CURRENT_RULES;

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
  /** Entries whose rules version is unknown to this app (scored 0, never guessed). */
  unknownRules: string[];
};

const byTime = (a: ActivityLog, b: ActivityLog) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Identity of an entry for once-a-day rules: prayers are one per day whatever refId they carry. */
export function onceKey(rule: { oncePerDay?: boolean; refScoped?: boolean } | null, refId: string | undefined): string | null {
  if (!rule?.oncePerDay) return null;
  return rule.refScoped ? (refId ?? '') : '';
}

/** A legacy blessing entry that already carries the goal bonus (old rules stored it on the entry). */
const LEGACY_BONUS = 30;
const legacyHasBonus = (log: ActivityLog) => !log.rules && log.kind === 'blessing' && log.points >= LEGACY_BONUS;

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

  const unknownRules: string[] = [];
  for (const list of groups.values()) {
    list.sort(byTime);
    // Legacy entries count toward the cap with the points they were given.
    let scored = list.filter((l) => !l.rules && l.points > 0).length;
    const seen = new Set<string>();
    for (const l of list) if (!l.rules) seen.add(l.refId ?? '');
    for (const log of list) {
      if (!log.rules) {
        byLog.set(log.id, log.points);
        continue;
      }
      // Scored with the frozen table of the entry's own rules version, never the live table.
      const rule = ruleFor(log.rules, log.actionKey);
      if (!rule) {
        if (!ruleSet(log.rules)) unknownRules.push(log.id);
        byLog.set(log.id, 0);
        continue;
      }
      const key = onceKey(rule, log.refId);
      if (key !== null) {
        if (seen.has(key)) {
          byLog.set(log.id, 0);
          continue;
        }
        seen.add(key);
      }
      if (scored < rule.dailyCap) {
        let p = rule.points;
        if (log.minyan && rule.minyanBonus) p += rule.minyanBonus;
        if (log.onTime && rule.onTimeBonus) p += rule.onTimeBonus;
        byLog.set(log.id, p);
        scored += 1;
      } else byLog.set(log.id, 0);
    }
  }

  // Blessing-goal bonus: once per day, decided from the whole day, never stored on an entry.
  const blessingsPerDay = new Map<string, { count: number; legacyBonus: boolean; hasCurrent: boolean; bonus: number }>();
  for (const l of logs) {
    const units = metricsFor(l.actionKey).blessingUnits || (l.kind === 'blessing' ? 1 : 0);
    if (!units) continue;
    const d = blessingsPerDay.get(l.dateKey) ?? { count: 0, legacyBonus: false, hasCurrent: false, bonus: 0 };
    d.count += units;
    d.legacyBonus ||= legacyHasBonus(l);
    const set = ruleSet(l.rules);
    if (set) {
      d.hasCurrent = true;
      d.bonus = Math.max(d.bonus, set.blessingGoalBonus);
    }
    blessingsPerDay.set(l.dateKey, d);
  }
  for (const [day, d] of blessingsPerDay) {
    // A day recorded only under the old rules stays as it was stored.
    if (!d.hasCurrent || d.legacyBonus) continue;
    if (d.count >= goalsOn(goals, day).blessingGoal) dayBonus.set(day, d.bonus);
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
  return { byLog, dayBonus, byDay, total, unknownRules };
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

/** Longest chapter in Tehillim (119) – a bound for verse numbers. */
const MAX_VERSE = 176;

export type TehillimSpan = { chapter: number; from: number; to: number | null };

/**
 * Parses a Tehillim refId. Returns null for anything outside the book (chapters 1–150, verses
 * 1–176, from ≤ to, at most 150 parts) so a bad refId can neither be recorded nor loop.
 * `to: null` means the whole chapter.
 */
export function parseTehillimRef(refId: string): TehillimSpan[] | null {
  if (!refId.startsWith('tehillim:')) return null;
  const parts = refId.slice('tehillim:'.length).split(',');
  if (parts.length === 0 || parts.length > 150) return null;
  const out: TehillimSpan[] = [];
  for (const part of parts) {
    const split = /^(\d{1,3}):(\d{1,3})-(\d{1,3})$/.exec(part);
    const whole = /^(\d{1,3})-(\d{1,3})$/.exec(part);
    if (split) {
      const [c, a, b] = [Number(split[1]), Number(split[2]), Number(split[3])];
      if (c < 1 || c > 150 || a < 1 || b < a || b > MAX_VERSE) return null;
      out.push({ chapter: c, from: a, to: b });
    } else if (whole) {
      const [a, b] = [Number(whole[1]), Number(whole[2])];
      if (a < 1 || b < a || b > 150) return null;
      for (let c = a; c <= b; c += 1) out.push({ chapter: c, from: 1, to: null });
    } else return null;
  }
  return out;
}

/**
 * Verses covered per chapter over the whole history (union, so reading the same chapter twice
 * counts once). Entries without a valid refId (older versions, bad data) are not counted.
 */
export function tehillimCoverage(logs: ActivityLog[]): Map<number, Array<[number, number]>> {
  const cover = new Map<number, Array<[number, number]>>();
  const addSpan = (ch: number, a: number, b: number) => {
    const spans = [...(cover.get(ch) ?? []), [a, b] as [number, number]].sort((x, y) => x[0] - y[0]);
    const merged: Array<[number, number]> = [];
    for (const sp of spans) {
      const last = merged[merged.length - 1];
      if (last && sp[0] <= last[1] + 1) last[1] = Math.max(last[1], sp[1]);
      else merged.push([sp[0], sp[1]]);
    }
    cover.set(ch, merged);
  };
  for (const l of logs) {
    if (l.actionKey !== 'tehillim' || !l.refId) continue;
    for (const sp of parseTehillimRef(l.refId) ?? []) addSpan(sp.chapter, sp.from, sp.to ?? MAX_VERSE);
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
