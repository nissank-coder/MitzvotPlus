import { ActionCategory, ActionKey, actionDef } from '../data/actions';
import { ActivityLog, Award, ChallengeEnrollment, GoalSnapshot } from '../types';
import { addDays, weekKeys } from './dates';
import { goalsOn, metricsFor, tehillimCoverage } from './metrics';

/**
 * Challenges and achievements (round 9, C1; docs/mobile-readiness/round-8/catalog-proposal.md).
 * Data-driven: every definition is a metric + filter + target, evaluated over the log. Nothing
 * here adds points – progress is derived, so undo, back-fill and restart give the same result.
 */

/* ------------------------------ Context ------------------------------ */

export type ProgressContext = {
  todayKey: string;
  /** Entries per day. */
  byDay: Map<string, ActivityLog[]>;
  /** Personal daily goal met on a day (habits, or distinct actions for users without habits). */
  goalMet: (dateKey: string) => boolean;
  /** At least one chosen habit done on a day. */
  habitDay: (dateKey: string) => boolean;
  isRestDay: (dateKey: string) => boolean;
  /** Not judged: rest day without entries, or no habit was due that day (weekly habits only). */
  neutralDay: (dateKey: string) => boolean;
  goalHistory: GoalSnapshot[];
  /** First day measured (the user's start). */
  measureFrom: string;
};

/* ------------------------------ Metrics ------------------------------ */

export type Metric =
  | { kind: 'goalDays' }
  | { kind: 'habitDays' }
  | { kind: 'learningDays' }
  | { kind: 'blessingDays'; atLeast: number | 'goal' }
  | { kind: 'recordedBlessings' }
  | { kind: 'actionDays'; actions: ActionKey[] }
  | { kind: 'categoryDays'; categories: ActionCategory[] }
  | { kind: 'tehillimChapters' }
  | { kind: 'weekImprovement' };

const daysIn = (start: string, endExclusive: string) => {
  const out: string[] = [];
  for (let k = start; k < endExclusive && out.length < 400; k = addDays(k, 1)) out.push(k);
  return out;
};

const learning = (l: ActivityLog) => metricsFor(l.actionKey).learning || l.kind === 'torah';
const blessingsOf = (logs: ActivityLog[]) =>
  logs.reduce((n, l) => n + (metricsFor(l.actionKey).blessingUnits || (l.kind === 'blessing' ? 1 : 0)), 0);

/** Value of a metric over [start, end) – end exclusive, capped at today + 1. */
export function measure(metric: Metric, ctx: ProgressContext, start: string, end: string): number {
  const last = addDays(ctx.todayKey, 1);
  const days = daysIn(start, end < last ? end : last);
  const logsOn = (k: string) => ctx.byDay.get(k) ?? [];
  switch (metric.kind) {
    case 'goalDays':
      return days.filter((k) => ctx.goalMet(k)).length;
    case 'habitDays':
      return days.filter((k) => ctx.habitDay(k)).length;
    case 'learningDays':
      return days.filter((k) => logsOn(k).some(learning)).length;
    case 'blessingDays':
      return days.filter((k) => {
        const need = metric.atLeast === 'goal' ? goalsOn(ctx.goalHistory, k).blessingGoal : metric.atLeast;
        return blessingsOf(logsOn(k)) >= need;
      }).length;
    case 'recordedBlessings':
      return days.reduce((n, k) => n + blessingsOf(logsOn(k)), 0);
    case 'actionDays':
      return days.filter((k) => logsOn(k).some((l) => l.actionKey && metric.actions.includes(l.actionKey))).length;
    case 'categoryDays': {
      // Different categories on different days: a small greedy matching (days with fewer options first).
      const options = days
        .map((k) => new Set(logsOn(k).map((l) => (l.actionKey ? actionDef(l.actionKey).category : 'other')).filter((c) => metric.categories.includes(c))))
        .filter((s) => s.size > 0)
        .sort((a, b) => a.size - b.size);
      const used = new Set<string>();
      for (const opts of options) {
        const pick = [...opts].find((c) => !used.has(c));
        if (pick) used.add(pick);
      }
      return used.size;
    }
    case 'tehillimChapters': {
      const logs = days.flatMap(logsOn);
      let n = 0;
      // Whole chapters only (a split chapter such as 119 counts once it is covered to its end).
      for (const spans of tehillimCoverage(logs).values()) if (spans.some(([a, b]) => a <= 1 && b >= 150)) n += 1;
      return n;
    }
    case 'weekImprovement': {
      // Goal days in this window minus the full week before it (only offered with a baseline).
      const prevStart = addDays(start, -7);
      return measure({ kind: 'goalDays' }, ctx, start, end) - measure({ kind: 'goalDays' }, ctx, prevStart, start);
    }
  }
}

/* ----------------------------- Challenges ----------------------------- */

export type ChallengeDefinition = {
  id: string;
  version: number;
  title: string;
  description: string;
  metric: Metric;
  target: number;
  /** Window length in days from the joining day, or the current calendar week. */
  window: { days: number } | { calendar: 'week' };
  unit: string;
  scope: 'personal' | 'group';
  private?: boolean;
  /** Offered only when this returns true (e.g. needs a previous week as baseline). */
  available?: (ctx: ProgressContext) => boolean;
};

const CHESED_ACTIONS: ActionKey[] = ['chesed', 'charity', 'parents', 'guests', 'visitSick'];

export const CHALLENGES: readonly ChallengeDefinition[] = Object.freeze([
  { id: 'C01', version: 1, title: 'מתחילים בקצב שלי', description: '3 ימים עם הרגל שבחרת', metric: { kind: 'habitDays' }, target: 3, window: { days: 7 }, unit: 'ימים', scope: 'personal' },
  { id: 'C02', version: 1, title: 'שבוע של התמדה', description: '4 ימים שבהם השלמת את היעד האישי', metric: { kind: 'goalDays' }, target: 4, window: { days: 7 }, unit: 'ימי יעד', scope: 'personal' },
  {
    id: 'C03', version: 1, title: 'עוד צעד קטן', description: 'יום יעד אחד יותר מהשבוע הקודם', metric: { kind: 'weekImprovement' }, target: 1, window: { days: 7 }, unit: 'יום', scope: 'personal',
    available: (ctx) => addDays(ctx.todayKey, -7) >= ctx.measureFrom,
  },
  { id: 'C04', version: 1, title: 'זמן לתורה', description: '3 ימי לימוד – כל לימוד נחשב', metric: { kind: 'learningDays' }, target: 3, window: { days: 7 }, unit: 'ימי לימוד', scope: 'personal' },
  { id: 'C05', version: 1, title: 'לימוד לאורך הדרך', description: '10 ימי לימוד בחודש', metric: { kind: 'learningDays' }, target: 10, window: { days: 30 }, unit: 'ימי לימוד', scope: 'personal' },
  { id: 'C06', version: 1, title: 'מאה ברכות', description: 'יום אחד עם 100 ברכות שנרשמו', metric: { kind: 'blessingDays', atLeast: 100 }, target: 1, window: { days: 7 }, unit: 'יום', scope: 'personal' },
  { id: 'C07', version: 1, title: 'עקביות בברכות', description: '3 ימים עם 30 ברכות לפחות', metric: { kind: 'blessingDays', atLeast: 30 }, target: 3, window: { days: 7 }, unit: 'ימים', scope: 'personal' },
  { id: 'C08', version: 1, title: 'שבוע של חסד', description: '3 ימים עם מעשה חסד – בלי סכומים', metric: { kind: 'actionDays', actions: CHESED_ACTIONS }, target: 3, window: { days: 7 }, unit: 'ימים', scope: 'personal' },
  { id: 'C09', version: 1, title: 'מעגל של עשייה', description: '3 תחומים שונים בשלושה ימים שונים', metric: { kind: 'categoryDays', categories: ['prayer', 'torah', 'blessing', 'chesed'] }, target: 3, window: { days: 7 }, unit: 'תחומים', scope: 'personal' },
  { id: 'C10', version: 1, title: 'פרקי תהילים', description: '10 פרקים שונים בחודש', metric: { kind: 'tehillimChapters' }, target: 10, window: { days: 30 }, unit: 'פרקים', scope: 'personal' },
  { id: 'C11', version: 1, title: 'מילה טובה', description: '3 ימי תרגול מודעות לדיבור. פרטי', metric: { kind: 'actionDays', actions: ['speechPractice'] }, target: 3, window: { days: 7 }, unit: 'ימים', scope: 'personal', private: true },
  { id: 'C12', version: 1, title: 'יחד מתקדמים', description: 'אתגר עם חברים – בגרסה הציבורית, בהזמנה ובהסכמה', metric: { kind: 'goalDays' }, target: 5, window: { calendar: 'week' }, unit: 'ימים', scope: 'group' },
] satisfies ChallengeDefinition[]);

export const challengeById = (id: string) => CHALLENGES.find((c) => c.id === id);

/** Window of a challenge joined on `start`. */
export function challengeWindow(def: ChallengeDefinition, start: string): { start: string; end: string } {
  if ('days' in def.window) return { start, end: addDays(start, def.window.days) };
  const week = weekKeys(start);
  return { start, end: addDays(week[6] ?? start, 1) };
}

export type ChallengeState = 'active' | 'completed' | 'expired' | 'left';

export type ChallengeView = {
  enrollment: ChallengeEnrollment;
  def: ChallengeDefinition;
  value: number;
  target: number;
  state: ChallengeState;
  daysLeft: number;
  /** Reached the target in the log, but not yet confirmed as saved. */
  reached: boolean;
};

export function viewChallenge(e: ChallengeEnrollment, ctx: ProgressContext): ChallengeView | null {
  const def = CHALLENGES.find((c) => c.id === e.definitionId && c.version === e.definitionVersion);
  if (!def) return null;
  const value = Math.max(0, measure(def.metric, ctx, e.start, e.end));
  const reached = value >= e.target;
  const state: ChallengeState = e.completedAt
    ? 'completed'
    : e.leftAt
      ? 'left'
      : ctx.todayKey >= e.end
        ? 'expired'
        : 'active';
  let daysLeft = 0;
  for (let k = ctx.todayKey; k < e.end && daysLeft < 400; k = addDays(k, 1)) daysLeft += 1;
  return { enrollment: e, def, value: Math.min(value, e.target), target: e.target, state, daysLeft, reached };
}

/** Challenges the user can join now (personal, available, not already active). */
export function joinable(enrollments: ChallengeEnrollment[], ctx: ProgressContext): ChallengeDefinition[] {
  const active = new Set(enrollments.filter((e) => !e.completedAt && !e.leftAt && ctx.todayKey < e.end).map((e) => e.definitionId));
  return CHALLENGES.filter((c) => c.scope === 'personal' && !active.has(c.id) && (c.available?.(ctx) ?? true));
}

/* ---------------------------- Achievements ---------------------------- */

export type AchievementDefinition = {
  id: string;
  version: number;
  title: string;
  explanation: string;
  /** Value over the whole history (or a custom rule). */
  value: (ctx: ProgressContext, extra: { challengesCompleted: string[] }) => number;
  threshold: number;
  unit: string;
  private?: boolean;
  /** Future achievements are listed as "coming", never earned locally. */
  future?: boolean;
};

const allTime = (m: Metric) => (ctx: ProgressContext) => {
  let first = ctx.todayKey;
  for (const k of ctx.byDay.keys()) if (k < first) first = k;
  return measure(m, ctx, first, addDays(ctx.todayKey, 1));
};

/** A goal day that follows at least 3 eligible (non-rest) days without the goal: coming back. */
function comebacks(ctx: ProgressContext): number {
  const days = [...ctx.byDay.keys()].sort();
  if (days.length === 0) return 0;
  let gap = 0;
  let seenGoal = false;
  for (let k = days[0]!; k <= ctx.todayKey; k = addDays(k, 1)) {
    if (ctx.goalMet(k)) {
      if (seenGoal && gap >= 3) return 1;
      seenGoal = true;
      gap = 0;
    } else if (!ctx.neutralDay(k) && k !== ctx.todayKey) gap += 1;
  }
  return 0;
}

/** A week with more goal days than every earlier week (needs two earlier weeks with entries). */
function personalBest(ctx: ProgressContext): number {
  const weeks = new Map<string, number>();
  for (const k of ctx.byDay.keys()) {
    const w = weekKeys(k)[0] ?? k;
    if (!weeks.has(w)) weeks.set(w, measure({ kind: 'goalDays' }, ctx, w, addDays(w, 7)));
  }
  const ordered = [...weeks.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map((e) => e[1]);
  for (let i = 2; i < ordered.length; i += 1) {
    const best = Math.max(...ordered.slice(0, i));
    if ((ordered[i] ?? 0) > best && best > 0) return 1;
  }
  return 0;
}

export const ACHIEVEMENTS: readonly AchievementDefinition[] = Object.freeze([
  { id: 'A01', version: 1, title: 'הצעד הראשון', explanation: 'הרגל ראשון שנשמר', value: allTime({ kind: 'habitDays' }), threshold: 1, unit: 'יום' },
  { id: 'A02', version: 1, title: 'התחלה טובה', explanation: '3 ימים שבהם השלמת את היעד האישי', value: allTime({ kind: 'goalDays' }), threshold: 3, unit: 'ימי יעד' },
  { id: 'A03', version: 1, title: 'שבעה צעדים', explanation: '7 ימי יעד מצטברים', value: allTime({ kind: 'goalDays' }), threshold: 7, unit: 'ימי יעד' },
  { id: 'A04', version: 1, title: 'דרך של חודש', explanation: '30 ימי יעד מצטברים', value: allTime({ kind: 'goalDays' }), threshold: 30, unit: 'ימי יעד' },
  { id: 'A05', version: 1, title: 'חוזרים למסלול', explanation: 'יום יעד אחרי הפסקה – בלי עונש', value: comebacks, threshold: 1, unit: '', private: true },
  { id: 'A06', version: 1, title: 'שיא אישי', explanation: 'שבוע עם יותר ימי יעד מכל שבוע קודם', value: personalBest, threshold: 1, unit: '', private: true },
  { id: 'A07', version: 1, title: 'מאה ברכות', explanation: 'יום אחד עם 100 ברכות שנרשמו', value: allTime({ kind: 'blessingDays', atLeast: 100 }), threshold: 1, unit: 'יום' },
  { id: 'A08', version: 1, title: 'אלף ברכות', explanation: '1,000 ברכות מצטברות', value: allTime({ kind: 'recordedBlessings' }), threshold: 1000, unit: 'ברכות' },
  { id: 'A09', version: 1, title: 'עקביות בברכות', explanation: '10 ימים עם יעד הברכות היומי שלך', value: allTime({ kind: 'blessingDays', atLeast: 'goal' }), threshold: 10, unit: 'ימים', private: true },
  { id: 'A10', version: 1, title: 'זמן לתורה', explanation: '7 ימי לימוד', value: allTime({ kind: 'learningDays' }), threshold: 7, unit: 'ימי לימוד' },
  { id: 'A11', version: 1, title: 'מסע לימוד', explanation: '30 ימי לימוד', value: allTime({ kind: 'learningDays' }), threshold: 30, unit: 'ימי לימוד' },
  { id: 'A12', version: 1, title: 'מעשי חסד', explanation: '10 ימים עם מעשה חסד', value: allTime({ kind: 'actionDays', actions: CHESED_ACTIONS }), threshold: 10, unit: 'ימים', private: true },
  { id: 'A13', version: 1, title: 'פרקי תהילים', explanation: '25 פרקים שונים', value: allTime({ kind: 'tehillimChapters' }), threshold: 25, unit: 'פרקים' },
  { id: 'A14', version: 1, title: 'מסלול הושלם', explanation: 'אתגר אישי אחד שהושלם', value: (_c, x) => x.challengesCompleted.length, threshold: 1, unit: 'אתגרים' },
  { id: 'A15', version: 1, title: 'שלושה מסלולים', explanation: '3 אתגרים שונים שהושלמו', value: (_c, x) => new Set(x.challengesCompleted).size, threshold: 3, unit: 'אתגרים' },
  { id: 'A16', version: 1, title: 'יחד בדרך', explanation: 'אתגר קבוצתי ראשון – בגרסה הציבורית', value: () => 0, threshold: 1, unit: '', future: true },
] satisfies AchievementDefinition[]);

export type AchievementView = { def: AchievementDefinition; value: number; earned: Award | null; ready: boolean };

export function viewAchievements(ctx: ProgressContext, awards: Award[], challengesCompleted: string[]): AchievementView[] {
  return ACHIEVEMENTS.map((def) => {
    const earned = awards.find((a) => a.achievementId === def.id && a.version === def.version) ?? null;
    const value = def.future ? 0 : def.value(ctx, { challengesCompleted });
    return { def, value: Math.min(value, def.threshold), earned, ready: !def.future && !earned && value >= def.threshold };
  });
}

/* ---------------------------- Journey stages ---------------------------- */

/** Neutral stages of the journey by cumulative goal days (A08: no spiritual ranking). */
export const STAGES = [
  { min: 0, name: 'יוצאים לדרך' },
  { min: 7, name: 'שבוע ראשון' },
  { min: 21, name: 'צועדים' },
  { min: 50, name: 'בקצב' },
  { min: 100, name: 'מתמידים' },
  { min: 200, name: 'דרך ארוכה' },
  { min: 365, name: 'שנה של התמדה' },
] as const;

export function journeyStage(goalDays: number) {
  let i = 0;
  STAGES.forEach((s, idx) => {
    if (goalDays >= s.min) i = idx;
  });
  const cur = STAGES[i]!;
  const next = STAGES[i + 1];
  return {
    index: i + 1,
    name: cur.name,
    next: next ? { name: next.name, toGo: next.min - goalDays } : null,
    progress: next ? (goalDays - cur.min) / (next.min - cur.min) : 1,
  };
}
