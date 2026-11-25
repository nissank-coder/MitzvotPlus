import { ActionKey } from '../data/actions';
import { ActivityLog, FeatureKey, GoalSnapshot, HabitSelection, IconName } from '../types';
import { metricsFor } from './metrics';

/**
 * Habit catalog (round 9, B1). A habit is a rule over the log: "done on a day" when the day's
 * entries match its filter at least `perDay` times. No separate counter – progress always comes
 * from what was recorded, so undo and back-fill stay consistent.
 */
export type HabitDomain = 'blessings' | 'learning' | 'prayer' | 'chesed' | 'gratitude' | 'speech' | 'personal';

export type HabitDefinition = {
  id: string;
  version: number;
  title: string;
  description: string;
  domain: HabitDomain;
  icon: IconName;
  /** Action that the "I did it" button records. */
  logAction: ActionKey;
  /** Entries that count for the habit. */
  matches: ActionKey[];
  /** For blessings: recorded blessings needed that day; otherwise matching entries. */
  perDay: number;
  /** Private habits never leave the device and are never shared (speech awareness). */
  private?: boolean;
  menOnly?: boolean;
  /** Not expected on Shabbat / Yom Tov (e.g. tefillin): left out of the goal on rest days. */
  weekdaysOnly?: boolean;
};

/**
 * What "I did it" does for a habit (round 10, S10-01). A habit whose entry is ambiguous never
 * records on the user's behalf: the user chooses which prayer was said, or goes to the screen
 * where the exact item is recorded (a learning track needs the track and the day).
 */
export type RecordPlan =
  | { kind: 'log'; action: ActionKey }
  | { kind: 'choose'; actions: ActionKey[] }
  | { kind: 'open'; feature: Exclude<FeatureKey, null> };

const PLANS: Record<string, RecordPlan> = {
  'learn-track': { kind: 'open', feature: 'learning' },
  'mitzvah-study': { kind: 'open', feature: 'mitzvot' },
  tehillim: { kind: 'open', feature: 'tehillim' },
  'prayer-any': { kind: 'choose', actions: ['shacharit', 'mincha', 'arvit', 'musaf'] },
  'three-prayers': { kind: 'choose', actions: ['shacharit', 'mincha', 'arvit'] },
};

export function recordPlan(id: string): RecordPlan | null {
  const h = habitById(id);
  if (!h) return null;
  return PLANS[id] ?? { kind: 'log', action: h.logAction };
}

export const HABIT_DOMAINS: Record<HabitDomain, { title: string; color: string; background: string }> = {
  blessings: { title: 'ברכות', color: '#946300', background: '#FFF5DB' },
  learning: { title: 'לימוד תורה', color: '#6B4FB8', background: '#EFEAFB' },
  prayer: { title: 'תפילה', color: '#1B6F8F', background: '#E3F0F6' },
  chesed: { title: 'חסד', color: '#B4532A', background: '#FFF0EA' },
  gratitude: { title: 'הכרת הטוב', color: '#2E7D5B', background: '#E6F5EC' },
  speech: { title: 'מודעות לדיבור', color: '#1B6F8F', background: '#E3F0F6' },
  personal: { title: 'התמדה אישית', color: '#17324D', background: '#EEF3F6' },
};

const PRAYERS: ActionKey[] = ['shacharit', 'mincha', 'arvit', 'musaf', 'prayer'];
const LEARNING: ActionKey[] = ['torahStudy', 'learningTrack', 'mitzvahStudy', 'dailyTorah'];
const CHESED: ActionKey[] = ['chesed', 'guests', 'visitSick', 'parents'];

export const HABITS: readonly HabitDefinition[] = Object.freeze([
  { id: 'blessings-20', version: 1, title: '20 ברכות ביום', description: 'לרשום לפחות 20 ברכות שנאמרו', domain: 'blessings', icon: 'cup', logAction: 'blessing', matches: ['blessing'], perDay: 20 },
  { id: 'blessings-50', version: 1, title: '50 ברכות ביום', description: 'צעד בדרך ל-100 ברכות', domain: 'blessings', icon: 'cup', logAction: 'blessing', matches: ['blessing'], perDay: 50 },
  { id: 'birkat-hamazon', version: 1, title: 'ברכת המזון', description: 'לברך ברכת המזון אחרי הסעודה', domain: 'blessings', icon: 'food', logAction: 'birkatHamazon', matches: ['birkatHamazon'], perDay: 1 },
  { id: 'learn-daily', version: 1, title: 'לימוד יומי', description: 'כל לימוד נחשב – משנה, דף, ספר או שיעור', domain: 'learning', icon: 'book', logAction: 'torahStudy', matches: LEARNING, perDay: 1 },
  { id: 'learn-track', version: 1, title: 'מסלול לימוד קבוע', description: 'המנה היומית במסלול שבחרתי', domain: 'learning', icon: 'bookmark', logAction: 'torahStudy', matches: ['learningTrack'], perDay: 1 },
  { id: 'mitzvah-study', version: 1, title: 'מצווה ביום', description: 'ללמוד מצווה אחת מתרי״ג', domain: 'learning', icon: 'scroll', logAction: 'mitzvahStudy', matches: ['mitzvahStudy'], perDay: 1 },
  { id: 'tehillim', version: 1, title: 'תהילים', description: 'לומר פרק או מנה יומית', domain: 'learning', icon: 'book', logAction: 'tehillim', matches: ['tehillim'], perDay: 1 },
  { id: 'prayer-any', version: 1, title: 'תפילה אחת ביום', description: 'שחרית, מנחה או ערבית', domain: 'prayer', icon: 'prayer', logAction: 'prayer', matches: PRAYERS, perDay: 1 },
  { id: 'shacharit', version: 1, title: 'שחרית', description: 'תפילת שחרית', domain: 'prayer', icon: 'sun', logAction: 'shacharit', matches: ['shacharit'], perDay: 1 },
  { id: 'mincha', version: 1, title: 'מנחה', description: 'תפילת מנחה', domain: 'prayer', icon: 'prayer', logAction: 'mincha', matches: ['mincha'], perDay: 1 },
  { id: 'three-prayers', version: 1, title: 'שלוש תפילות', description: 'שחרית, מנחה וערבית', domain: 'prayer', icon: 'moon', logAction: 'arvit', matches: ['shacharit', 'mincha', 'arvit'], perDay: 3 },
  { id: 'tefillin', version: 1, title: 'הנחת תפילין', description: 'בכל יום חול', domain: 'prayer', icon: 'scroll', logAction: 'tefillin', matches: ['tefillin'], perDay: 1, menOnly: true, weekdaysOnly: true },
  { id: 'chesed', version: 1, title: 'מעשה חסד', description: 'עזרה, ביקור, אירוח או כיבוד הורים', domain: 'chesed', icon: 'heart', logAction: 'chesed', matches: CHESED, perDay: 1 },
  { id: 'charity', version: 1, title: 'צדקה', description: 'נתינה בכל סכום – הסכום לא נרשם', domain: 'chesed', icon: 'charity', logAction: 'charity', matches: ['charity'], perDay: 1 },
  { id: 'parents', version: 1, title: 'כיבוד הורים', description: 'שיחה, עזרה או מחווה', domain: 'chesed', icon: 'user', logAction: 'parents', matches: ['parents'], perDay: 1 },
  { id: 'gratitude', version: 1, title: 'הכרת הטוב', description: 'להודות למישהו, או לרשום לעצמך דבר טוב', domain: 'gratitude', icon: 'star', logAction: 'gratitude', matches: ['gratitude'], perDay: 1 },
  { id: 'speech-awareness', version: 1, title: 'מודעות לדיבור', description: 'תרגול חיובי קטן. פרטי, נשמר רק במכשיר', domain: 'speech', icon: 'shield', logAction: 'speechPractice', matches: ['speechPractice'], perDay: 1, private: true },
  { id: 'personal', version: 1, title: 'הרגל אישי', description: 'משהו שתגדיר בעצמך', domain: 'personal', icon: 'target', logAction: 'personalHabit', matches: ['personalHabit'], perDay: 1 },
] satisfies HabitDefinition[]);

export const habitById = (id: string): HabitDefinition | undefined => HABITS.find((h) => h.id === id);

/** Default suggestion for a new user (can be changed in onboarding). */
export const SUGGESTED_HABITS = ['prayer-any', 'learn-daily', 'chesed'];

/** How far a habit is on a given day (value / needed). */
export function habitProgress(habit: HabitDefinition, dayLogs: ActivityLog[]): { value: number; needed: number; done: boolean } {
  let value = 0;
  if (habit.domain === 'blessings' && habit.logAction === 'blessing') {
    for (const l of dayLogs) value += metricsFor(l.actionKey).blessingUnits || (l.kind === 'blessing' ? 1 : 0);
  } else {
    // Distinct matching actions (two shacharit entries are impossible anyway; prayer-any counts one).
    const keys = new Set<string>();
    for (const l of dayLogs) if (l.actionKey && habit.matches.includes(l.actionKey)) keys.add(habit.perDay > 1 ? l.actionKey : 'x');
    value = keys.size;
  }
  return { value, needed: habit.perDay, done: value >= habit.perDay };
}

/** Daily habits are those chosen for every day; fewer days a week = a weekly habit (S10-01). */
export const isDaily = (s: HabitSelection) => s.perWeek >= 7;

/** Habits of a day's goal: daily ones, without weekday-only habits on a rest day. */
export function dueHabits(goal: GoalSnapshot, restDay: boolean): HabitSelection[] {
  return (goal.habits ?? []).filter((s) => isDaily(s) && !(restDay && habitById(s.id)?.weekdaysOnly));
}

/** Habits done on a day (all chosen habits, daily and weekly). */
export function habitsDoneOn(goal: GoalSnapshot, dayLogs: ActivityLog[]): { done: string[]; total: number } {
  const selected = goal.habits ?? [];
  const done = selected.filter((s) => {
    const h = habitById(s.id);
    return h ? habitProgress(h, dayLogs).done : false;
  });
  return { done: done.map((s) => s.id), total: selected.length };
}

export type DayGoalStatus = 'met' | 'missed' | 'neutral';

/**
 * Personal goal of a day.
 * - With habits: the daily habits due that day (habitTarget of them). A day with no daily habit
 *   due (only weekly habits, or weekday-only habits on Shabbat) is neutral – met if any chosen
 *   habit was done, otherwise not counted at all.
 * - Without habits (older users): the "N distinct actions" goal.
 */
export function dayGoalStatus(goal: GoalSnapshot, dayLogs: ActivityLog[], distinctActions: number, restDay = false): DayGoalStatus {
  if (goal.habits && goal.habits.length > 0) {
    const due = dueHabits(goal, restDay);
    const done = new Set(habitsDoneOn(goal, dayLogs).done);
    if (due.length === 0) return done.size > 0 ? 'met' : 'neutral';
    const target = Math.min(goal.habitTarget ?? due.length, due.length);
    return due.filter((s) => done.has(s.id)).length >= target ? 'met' : 'missed';
  }
  return distinctActions >= goal.dailyGoal ? 'met' : 'missed';
}

/** Whether the personal daily goal was met on a day. */
export function dayGoalMet(goal: GoalSnapshot, dayLogs: ActivityLog[], distinctActions: number, restDay = false): boolean {
  return dayGoalStatus(goal, dayLogs, distinctActions, restDay) === 'met';
}

/** Normalises a habit choice: known ids only, no duplicates, 1–5 habits, 1–7 days a week. */
export function cleanHabits(input: HabitSelection[]): HabitSelection[] {
  const seen = new Set<string>();
  const out: HabitSelection[] = [];
  for (const h of input) {
    if (!habitById(h.id) || seen.has(h.id)) continue;
    seen.add(h.id);
    const perWeek = Number.isInteger(h.perWeek) ? Math.min(7, Math.max(1, h.perWeek)) : 7;
    out.push({ id: h.id, perWeek, ...(h.label?.trim() ? { label: h.label.trim().slice(0, 40) } : {}) });
    if (out.length === 5) break;
  }
  return out;
}

export const habitTitle = (s: HabitSelection) => s.label || habitById(s.id)?.title || s.id;
