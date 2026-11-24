import { ActionKey, ACTIONS, actionDef } from '../data/actions';
import { ActivityLog, BlessingCategory, IconName, LogKind } from '../types';
import type { CalendarContext } from './jewishCalendar';
import { localDateKey } from './dates';
import { scoreLogs, SCORING_RULES_VERSION } from './metrics';

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
  /** Content the action refers to (e.g. the Dvar Torah that was learned). */
  content?: { id: string; version: string };
  /** Blessings confirmed as part of a bundle for this entry id. */
  bundleOf?: string;
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
 * Builds the log entry for an action. Returns null when the entry must be ignored:
 * a duplicate once-a-day action, the same refId twice on a uniqueRef action, or a
 * content-bound action (Dvar Torah) without the content it refers to.
 *
 * The stored `points` is only the provisional value at the time of recording. Totals are always
 * recomputed by scoreLogs (src/lib/metrics.ts); the blessing-goal bonus is a per-day bonus there.
 */
export function buildLog(logs: ActivityLog[], input: ActionInput, _blessingGoal?: number): ActivityLog | null {
  const def = actionDef(input.key);
  const dateKey = input.dateKey ?? localDateKey(input.now);
  const sameDay = logs.filter((l) => l.dateKey === dateKey && l.actionKey === input.key);

  if (def.requiresContent && !input.content) return null;
  const refId = input.refId ?? (def.requiresContent && input.content ? `${input.content.id}@${input.content.version}` : undefined);
  if (def.oncePerDay && sameDay.some((l) => (l.refId ?? '') === (refId ?? ''))) return null;
  if (def.uniqueRef && refId && sameDay.some((l) => l.refId === refId)) return null;

  const title = input.title ?? (input.minyan ? `${def.title} במניין` : def.title);
  const onTime = Boolean(input.onTime && def.onTimeBonus);

  const log: ActivityLog = {
    id: makeId(),
    title,
    icon: input.icon ?? def.icon,
    points: 0,
    createdAt: input.now,
    dateKey,
    kind: kindFor(input.key),
    actionKey: input.key,
    ...(input.category ? { category: input.category } : {}),
    ...(refId ? { refId } : {}),
    ...(input.minyan ? { minyan: true } : {}),
    ...(onTime ? { onTime: true } : {}),
    ...(input.backfill ? { backfill: true } : {}),
    // When the user recorded it; createdAt is the claimed time of the deed (same unless backfilled).
    recordedAt: input.now,
    ...(input.context ? { context: input.context } : {}),
    ...(input.content ? { content: input.content } : {}),
    ...(input.bundleOf ? { bundleOf: input.bundleOf } : {}),
    rules: SCORING_RULES_VERSION,
  };
  const provisional = scoreLogs([...sameDay, log], []).byLog.get(log.id) ?? 0;
  return { ...log, points: provisional, ...(provisional === 0 ? { capped: true } : {}) };
}

export function countToday(logs: ActivityLog[], dateKey: string, key: ActionKey, refId?: string): number {
  return logs.filter((l) => l.dateKey === dateKey && l.actionKey === key && (refId === undefined || l.refId === refId))
    .length;
}

export const quickActions = (Object.keys(ACTIONS) as ActionKey[]).filter((k) => actionDef(k).quick);
