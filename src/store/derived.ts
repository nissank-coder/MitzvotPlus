import { addDays } from '../lib/dates';
import { goalsOn, measureDays, metricsFor, scoreLogs } from '../lib/metrics';
import { badges, bestStreak, currentStreak, daysWith, levelInfo, RestRule, shabbatOnly, weekBreakdown } from '../lib/progress';
import { ActivityLog, AppState, BlessingCategory } from '../types';

export type Derived = ReturnType<typeof computeDerived>;

/**
 * Everything the screens show is computed from the stored history — nothing is hard-coded.
 * Three separate measures (docs/mobile-readiness/scoring-rules.md):
 *  - distinct actions per day (what the daily goal counts; 12 blessings = 1 action),
 *  - recorded blessings (the 100-blessings counter),
 *  - participation points (scoreLogs, rules score-2).
 * `isRestDay` is the calendar's Shabbat / Yom Tov rule for the user's city.
 */
export function computeDerived(state: AppState, todayKey: string, isRestDay: RestRule = shabbatOnly) {
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

  // Consistency over the last 30 days, each day against the goal that applied ON that day.
  // A rest day with nothing recorded is not a missed day (D05: no pressure to record on Shabbat).
  let goalDays = 0;
  let eligibleDays = 0;
  for (let i = 0; i < 30; i += 1) {
    const key = addDays(todayKey, -i);
    const m = measures.get(key);
    if (i === 0 && !m) continue; // today is not over
    if (!m && isRestDay(key)) continue;
    eligibleDays += 1;
    if ((m?.distinctActions ?? 0) >= goalsOn(state.goalHistory, key).dailyGoal) goalDays += 1;
  }

  const week = weekBreakdown(logs, todayKey, score.byDay);

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
    consistency: eligibleDays === 0 ? 0 : Math.round((goalDays / eligibleDays) * 100),
    consistencyDays: { goalDays, eligibleDays },
    badges: badges(logs, bestActivityStreak),
    totalCount: logs.length,
  };
}
