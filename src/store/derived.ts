import { addDays } from '../lib/dates';
import { badges, bestStreak, currentStreak, daysWith, levelInfo, weekBreakdown } from '../lib/progress';
import { ActivityLog, AppState, BlessingCategory } from '../types';

export type Derived = ReturnType<typeof computeDerived>;

/** Everything the screens show is computed from the stored history — nothing is hard-coded. */
export function computeDerived(state: AppState, todayKey: string) {
  const logs = state.logs;
  const todayLogs: ActivityLog[] = logs.filter((l) => l.dateKey === todayKey).sort((a, b) => b.createdAt - a.createdAt);
  const todayBlessings = todayLogs.filter((l) => l.kind === 'blessing');

  const blessingCounts: Record<BlessingCategory, number> = { enjoyment: 0, prayer: 0, mitzvah: 0, other: 0 };
  for (const b of todayBlessings) if (b.category) blessingCounts[b.category] += 1;

  const totalPoints = state.legacyPoints + logs.reduce((sum, l) => sum + l.points, 0);
  const todayPoints = todayLogs.reduce((sum, l) => sum + l.points, 0);

  const activeDays = daysWith(logs);
  const torahDays = daysWith(logs, (l) => l.kind === 'torah');
  const activityStreak = currentStreak(activeDays, todayKey);
  const bestActivityStreak = bestStreak(activeDays);

  // Days the daily goal was reached in the last 30 days → consistency score (0–100).
  const perDay = new Map<string, number>();
  for (const l of logs) perDay.set(l.dateKey, (perDay.get(l.dateKey) ?? 0) + 1);
  let goalDays = 0;
  for (let i = 0; i < 30; i += 1) if ((perDay.get(addDays(todayKey, -i)) ?? 0) >= state.dailyGoal) goalDays += 1;

  const week = weekBreakdown(logs, todayKey);

  return {
    todayKey,
    todayLogs,
    todayCount: todayLogs.length,
    todayPoints,
    todayBlessings,
    blessingCounts,
    blessingTotal: todayBlessings.length,
    torahCompletedToday: todayLogs.some((l) => l.kind === 'torah'),
    reflection: state.reflections[todayKey] ?? '',
    totalPoints,
    level: levelInfo(totalPoints),
    activityStreak,
    bestActivityStreak,
    torahStreak: currentStreak(torahDays, todayKey),
    week,
    consistency: Math.round((goalDays / 30) * 100),
    badges: badges(logs, bestActivityStreak),
    totalCount: logs.length,
  };
}
