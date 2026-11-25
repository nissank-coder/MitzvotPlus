import { addDays, localDateKey, weekKeys } from '../lib/dates';
import { goalsOn, measureDays, metricsFor, scoreLogs } from '../lib/metrics';
import { badges, bestStreak, currentStreak, daysWith, levelInfo, RestRule, shabbatOnly, weekBreakdown } from '../lib/progress';
import { ActivityLog, AppState, BlessingCategory } from '../types';
import { DayGoalStatus, dayGoalStatus, dueHabits, habitById, habitProgress, habitsDoneOn, habitTitle, isDaily } from '../lib/habits';
import { joinable, journeyStage, measure, ProgressContext, viewAchievements, viewChallenge } from '../lib/challenges';

export type Derived = ReturnType<typeof computeDerived>;

/**
 * Everything the screens show is computed from the stored history — nothing is hard-coded.
 * Three separate measures (docs/mobile-readiness/scoring-rules.md):
 *  - distinct actions per day (what the daily goal counts; 12 blessings = 1 action),
 *  - recorded blessings (the 100-blessings counter),
 *  - participation points (scoreLogs, rules score-2).
 * `isRestDay` is the calendar's Shabbat / Yom Tov rule for the user's city.
 */
export function computeDerived(
  state: AppState,
  todayKey: string,
  isRestDay: RestRule = shabbatOnly,
  /** The day the user started (memberSince in the city's time zone). */
  startKey: string = localDateKey(state.memberSince),
) {
  const logs = state.logs;
  const todayLogs: ActivityLog[] = logs.filter((l) => l.dateKey === todayKey).sort((a, b) => b.createdAt - a.createdAt);
  const todayBlessings = todayLogs.filter((l) => l.kind === 'blessing');

  const blessingCounts: Record<BlessingCategory, number> = { enjoyment: 0, prayer: 0, mitzvah: 0, other: 0 };
  for (const b of todayBlessings) if (b.category) blessingCounts[b.category] += 1;

  const score = scoreLogs(logs, state.goalHistory);
  const totalPoints = state.legacyPoints + score.total;
  const todayPoints = score.byDay.get(todayKey) ?? 0;

  const measures = measureDays(logs);
  const today = measures.get(todayKey);
  const activeDays = daysWith(logs);
  const learningDays = daysWith(logs, (l) => metricsFor(l.actionKey).learning || l.kind === 'torah');
  const activityStreak = currentStreak(activeDays, todayKey, isRestDay);
  const bestActivityStreak = bestStreak(activeDays, isRestDay);

  // Measuring starts on the day the user started (or the first recorded day, if earlier):
  // days before that are not "missed" (round 8, A01).
  let firstLog = todayKey;
  for (const l of logs) if (l.dateKey < firstLog) firstLog = l.dateKey;
  const measureFrom = firstLog < startKey ? firstLog : startKey;
  const byDay = new Map<string, ActivityLog[]>();
  for (const l of logs) {
    const list = byDay.get(l.dateKey);
    if (list) list.push(l);
    else byDay.set(l.dateKey, [l]);
  }
  // The personal goal of each day: the habits in force that day (or, before habits were chosen,
  // the older "N distinct actions" goal). Cached per day.
  // Weekly habits and weekday-only habits on rest days are not part of a day's goal (S10-01).
  const goalCache = new Map<string, DayGoalStatus>();
  const goalStatus = (key: string) => {
    let v = goalCache.get(key);
    if (v === undefined) {
      v = dayGoalStatus(goalsOn(state.goalHistory, key), byDay.get(key) ?? [], measures.get(key)?.distinctActions ?? 0, isRestDay(key));
      goalCache.set(key, v);
    }
    return v;
  };
  const goalMet = (key: string) => goalStatus(key) === 'met';
  /** A day that is not judged: rest day without entries, or nothing was due (weekly habits only). */
  const neutralDay = (key: string) => goalStatus(key) === 'neutral' || (!measures.get(key) && isRestDay(key));
  const habitDay = (key: string) => habitsDoneOn(goalsOn(state.goalHistory, key), byDay.get(key) ?? []).done.length > 0;

  // Consistency over the last 30 days, each day against the goal that applied ON that day.
  // Today counts only once its goal is met (an open day is neutral, not a failure).
  // A rest day with nothing recorded is not a missed day (D05: no pressure to record on Shabbat).
  let goalDays = 0;
  let eligibleDays = 0;
  for (let i = 0; i < 30; i += 1) {
    const key = addDays(todayKey, -i);
    if (key < measureFrom) break;
    const m = measures.get(key);
    if (i === 0 && !goalMet(key)) continue;
    if (!m && isRestDay(key)) continue;
    if (goalStatus(key) === 'neutral') continue;
    eligibleDays += 1;
    if (goalMet(key)) goalDays += 1;
  }
  // Goal streak (days the personal goal was met) is separate from the logging streak (any entry).
  const goalDaySet = new Set<string>();
  for (const key of measures.keys()) if (goalMet(key)) goalDaySet.add(key);

  // The weekly target is the one in force when the week started: a change applies from next week.
  const weekStart = weekKeys(todayKey)[0] ?? todayKey;
  const weeklyGoal = goalsOn(state.goalHistory, weekStart).weeklyGoal;

  const week = weekBreakdown(logs, todayKey, score.byDay);

  // Habits of today, each with its progress from today's entries.
  // Today's goal = the daily habits due today; weekly habits are measured over the week.
  const goalToday = goalsOn(state.goalHistory, todayKey);
  const todayLogsList = byDay.get(todayKey) ?? [];
  const habitsToday = dueHabits(goalToday, isRestDay(todayKey)).flatMap((sel) => {
    const def = habitById(sel.id);
    return def ? [{ sel, def, title: habitTitle(sel), ...habitProgress(def, todayLogsList) }] : [];
  });
  const habitTarget = Math.min(goalToday.habitTarget ?? habitsToday.length, habitsToday.length);
  const weekDays = weekKeys(todayKey);
  const weeklyHabits = (goalToday.habits ?? [])
    .filter((sel) => !isDaily(sel))
    .flatMap((sel) => {
      const def = habitById(sel.id);
      if (!def) return [];
      const daysThisWeek = weekDays.filter((k) => k <= todayKey && habitProgress(def, byDay.get(k) ?? []).done).length;
      return [{ sel, def, title: habitTitle(sel), perWeek: sel.perWeek, daysThisWeek, doneToday: habitProgress(def, todayLogsList).done }];
    });
  // Habits not due today (weekday-only on a rest day) are shown separately, never as missed.
  const notDueToday = (goalToday.habits ?? []).filter((sel) => isDaily(sel) && !habitsToday.some((h) => h.sel.id === sel.id));

  // Challenges and achievements (C1): derived from the same log.
  const ctx: ProgressContext = { todayKey, byDay, goalMet, habitDay, isRestDay, neutralDay, goalHistory: state.goalHistory, measureFrom };
  const challengeViews = state.challenges.flatMap((e) => {
    const v = viewChallenge(e, ctx);
    return v ? [v] : [];
  });
  const challengesCompleted = challengeViews.filter((c) => c.state === 'completed').map((c) => c.def.id);
  const achievements = viewAchievements(ctx, state.awards, challengesCompleted);
  let firstDay = todayKey;
  for (const k of byDay.keys()) if (k < firstDay) firstDay = k;
  const goalDaysTotal = measure({ kind: 'goalDays' }, ctx, firstDay, addDays(todayKey, 1));

  return {
    todayKey,
    todayLogs,
    /** Distinct actions today (blessings together = 1). Compared with the daily goal. */
    todayCount: today?.distinctActions ?? 0,
    /** All entries today, repeats included. */
    todayEntries: today?.entries ?? 0,
    todayPoints,
    todayBlessings,
    blessingCounts,
    blessingTotal: todayBlessings.length,
    blessingGoalBonusToday: score.dayBonus.get(todayKey) ?? 0,
    pointsByLog: score.byLog,
    torahCompletedToday: todayLogs.some((l) => l.actionKey === 'dailyTorah'),
    learnedToday: today?.learned ?? false,
    reflection: state.reflections[todayKey] ?? '',
    totalPoints,
    level: levelInfo(totalPoints),
    activityStreak,
    bestActivityStreak,
    /** Consecutive learning days (any learning entry; rest days bridged). */
    torahStreak: currentStreak(learningDays, todayKey, isRestDay),
    week,
    /** null = no closed day to measure yet (shown as "no baseline yet", not 0%). */
    consistency: eligibleDays === 0 ? null : Math.round((goalDays / eligibleDays) * 100),
    consistencyDays: { goalDays, eligibleDays },
    goalStreak: currentStreak(goalDaySet, todayKey, neutralDay),
    todayGoalMet: goalMet(todayKey),
    /** Weekly target for this week (snapshot at the start of the week). */
    weeklyGoal,
    unknownRules: score.unknownRules.length,
    badges: badges(logs, bestActivityStreak),
    /** True once the user chose habits (round 9); older users keep the distinct-actions goal. */
    hasHabits: (goalToday.habits ?? []).length > 0,
    weeklyHabits,
    notDueToday,
    habitsToday,
    habitTarget,
    habitsDoneToday: habitsToday.filter((h) => h.done).length,
    bestGoalStreak: bestStreak(goalDaySet, neutralDay),
    goalDaysTotal,
    stage: journeyStage(goalDaysTotal),
    progressContext: ctx,
    challenges: challengeViews,
    joinableChallenges: joinable(state.challenges, ctx),
    achievements,
    challengesCompleted,
    measureFrom,
    totalCount: logs.length,
  };
}
