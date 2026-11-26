import type { ActivityLog, AppState } from '../types';
import type { Derived } from './derived';

/**
 * Feedback after saved entries (design round 1.1) – a pure function, so the rules are testable.
 *
 * Round 1 named "the newest entry of today" and offered to undo it. When the entries just recorded
 * were not today's newest – Shabbat entries recorded after the fact, a blessing bundle – the toast
 * named, and "ביטול" removed, an unrelated entry (reproduced: R1). Now the subject is exactly the
 * set of entries that were added; undo removes exactly those.
 *
 * What the toast says, in this order: the blessing goal reached (from any screen – R3), the daily
 * goal met, a habit completed, partial progress of a habit ("שלוש תפילות: 2 מתוך 3"), the blessing
 * count, or the day's habits.
 */
export type FeedbackKind = 'saved' | 'habit' | 'goal';
export type Feedback = {
  kind: FeedbackKind;
  title: string;
  detail?: string;
  /** Exactly the entries this feedback is about: "ביטול" removes these and nothing else. */
  logIds: string[];
  logTitle: string;
};

export type FeedbackSnapshot = {
  day: string;
  ids: ReadonlySet<string>;
  habits: Readonly<Record<string, number>>;
  habitsDone: number;
  goalMet: boolean;
  blessings: number;
};

export function snapshotOf(state: Pick<AppState, 'logs'>, derived: Derived): FeedbackSnapshot {
  return {
    day: derived.todayKey,
    ids: new Set(state.logs.map((l) => l.id)),
    habits: Object.fromEntries(derived.habitsToday.map((h) => [h.sel.id, h.value])),
    habitsDone: derived.habitsDoneToday,
    goalMet: derived.todayGoalMet,
    blessings: derived.blessingTotal,
  };
}

/**
 * The entries recorded on this device since the snapshot (newest first). Entries that arrived from
 * another device of the account (sync, `remote`) are not something the user just did: no toast, and
 * "ביטול" must never offer to remove them.
 */
export function addedSince(prev: FeedbackSnapshot, logs: ActivityLog[]): ActivityLog[] {
  return logs.filter((l) => !prev.ids.has(l.id) && !l.remote).sort((a, b) => b.createdAt - a.createdAt);
}

export function feedbackFor(prev: FeedbackSnapshot, added: ActivityLog[], state: Pick<AppState, 'blessingGoal'>, derived: Derived): Feedback | null {
  if (added.length === 0) return null;
  const today = added.filter((l) => l.dateKey === derived.todayKey);
  const blessingsOnly = added.every((l) => l.kind === 'blessing');
  const subject = added[0]!;
  const logIds = added.map((l) => l.id);
  const late = today.length === 0; // everything was recorded for an earlier day (Shabbat, Yom Tov)
  const logTitle = added.length === 1 ? subject.title : blessingsOnly ? `${added.length} ברכות` : `${added.length} רישומים`;
  const title = late ? `נרשם בדיעבד: ${logTitle}` : added.length === 1 ? `נרשם: ${logTitle}` : `נרשמו ${logTitle}`;
  const base = { logIds, logTitle };

  if (!late) {
    const goal = state.blessingGoal;
    if (prev.blessings < goal && derived.blessingTotal >= goal) {
      return { ...base, kind: 'goal', title: `הושלם יעד הברכות: ${goal}`, detail: 'השלמת את היעד היומי. יישר כוח!' };
    }
    if (derived.todayGoalMet && !prev.goalMet) return { ...base, kind: 'goal', title: 'היעד היומי הושלם', detail: 'יישר כוח' };
    const completed = derived.habitsToday.find((h) => h.done && (prev.habits[h.sel.id] ?? 0) < h.needed && h.value > (prev.habits[h.sel.id] ?? 0));
    if (completed && derived.habitsDoneToday > prev.habitsDone) {
      return { ...base, kind: 'habit', title: `הרגל הושלם: ${completed.title}`, detail: `${derived.habitsDoneToday}/${derived.habitTarget} הרגלים היום` };
    }
    const partial = derived.habitsToday.find((h) => !h.done && h.needed > 1 && h.value > (prev.habits[h.sel.id] ?? 0));
    if (partial) {
      const left = partial.needed - partial.value;
      return { ...base, kind: 'saved', title, detail: `${partial.title}: ${Math.min(partial.value, partial.needed)} מתוך ${partial.needed} · עוד ${left}` };
    }
    if (blessingsOnly) return { ...base, kind: 'saved', title, detail: `${derived.blessingTotal} מתוך ${goal} ברכות היום` };
  }
  return { ...base, kind: 'saved', title, detail: derived.hasHabits && !late ? `${derived.habitsDoneToday}/${derived.habitTarget} הרגלים היום` : undefined };
}
