import { ActionKey, ACTIONS, actionDef, BLESSING_GOAL_BONUS } from '../data/actions';
import { ActivityLog, BlessingCategory, IconName, LogKind } from '../types';
import type { CalendarContext } from './jewishCalendar';
import { localDateKey } from './dates';

export type ActionInput = {
  key: ActionKey;
  title?: string;
  icon?: IconName;
  /** Distinguishes several entries of the same action on one day (learning track, mitzvah id...). */
  refId?: string;
  category?: BlessingCategory;
  minyan?: boolean;
  onTime?: boolean;
  /** Recorded after Shabbat / Yom Tov for that day. */
  backfill?: boolean;
  /** Override the day (used by Shabbat backfill). */
  dateKey?: string;
  /** Settings the event was classified with (immutable snapshot). */
  context?: CalendarContext;
  now: number;
};

function kindFor(key: ActionKey): LogKind {
  if (key === 'blessing') return 'blessing';
  if (key === 'dailyTorah') return 'torah';
  return 'mitzvah';
}

let counter = 0;
function makeId(): string {
  counter = (counter + 1) % 1_000_000;
  return `log-${Date.now().toString(36)}-${counter.toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Builds the log entry for an action, applying the scoring rules:
 * base points, minyan / on-time bonuses, daily caps, once-a-day actions and the blessing-goal bonus.
 * Returns null when the entry should be ignored (a duplicate once-a-day action).
 */
export function buildLog(logs: ActivityLog[], input: ActionInput, blessingGoal: number): ActivityLog | null {
  const def = actionDef(input.key);
  const dateKey = input.dateKey ?? localDateKey(input.now);
  const sameDay = logs.filter((l) => l.dateKey === dateKey && l.actionKey === input.key);

  if (def.oncePerDay && sameDay.some((l) => (l.refId ?? '') === (input.refId ?? ''))) return null;

  const scored = sameDay.filter((l) => l.points > 0).length;
  const capped = scored >= def.dailyCap;
  let points = 0;
  if (!capped) {
    points = def.points;
    if (input.minyan && def.minyanBonus) points += def.minyanBonus;
    if (input.onTime && def.onTimeBonus) points += def.onTimeBonus;
  }
  if (input.key === 'blessing' && sameDay.length + 1 === blessingGoal) points += BLESSING_GOAL_BONUS;

  const title = input.title ?? (input.minyan ? `${def.title} במניין` : def.title);

  return {
    id: makeId(),
    title,
    icon: input.icon ?? def.icon,
    points,
    createdAt: input.now,
    dateKey,
    kind: kindFor(input.key),
    actionKey: input.key,
    ...(input.category ? { category: input.category } : {}),
    ...(input.refId ? { refId: input.refId } : {}),
    ...(input.minyan ? { minyan: true } : {}),
    ...(input.backfill ? { backfill: true } : {}),
    ...(capped ? { capped: true } : {}),
    // When the user recorded it; createdAt is the claimed time of the deed (same unless backfilled).
    recordedAt: input.now,
    ...(input.context ? { context: input.context } : {}),
  };
}

export function countToday(logs: ActivityLog[], dateKey: string, key: ActionKey, refId?: string): number {
  return logs.filter((l) => l.dateKey === dateKey && l.actionKey === key && (refId === undefined || l.refId === refId))
    .length;
}

export const quickActions = (Object.keys(ACTIONS) as ActionKey[]).filter((k) => actionDef(k).quick);
