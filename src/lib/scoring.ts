import { ActionKey, ACTIONS, actionDef } from '../data/actions';
import { ActivityLog, BlessingCategory, IconName, LogKind } from '../types';
import type { CalendarContext } from './jewishCalendar';
import { localDateKey } from './dates';
import { onceKey, parseTehillimRef, scoreLogs, SCORING_RULES_VERSION } from './metrics';
import { CURRENT_RULES, ruleFor } from './rulesets';

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

const CONTENT_ID = /^[a-z0-9]+(?:[-/][a-z0-9]+)*$/;

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

  const rule = ruleFor(CURRENT_RULES, input.key);
  if (def.requiresContent) {
    // Completing a content item needs a well-formed id + version (an unknown id is never recorded).
    const c = input.content;
    if (!c || !CONTENT_ID.test(c.id) || !/^[0-9A-Za-z.-]{1,20}$/.test(c.version)) return null;
  }
  const refId = def.requiresContent && input.content ? `${input.content.id}@${input.content.version}` : input.refId;
  if (input.key === 'tehillim' && refId !== undefined && parseTehillimRef(refId) === null) return null;
  // Once a day: a prayer is ONE per day whatever refId it carries; per-item actions are per refId.
  const once = onceKey(rule, refId);
  if (once !== null && sameDay.some((l) => onceKey(rule, l.refId) === once)) return null;
  if (def.uniqueRef && refId && sameDay.some((l) => l.refId === refId)) return null;

  const title = input.title ?? (input.minyan ? `${def.title} במניין` : def.title);
  // "On time" only for actions that have such a bonus, and only for the day being recorded live
  // (a back-filled entry has no evidence of the time it was done).
  const onTime = Boolean(input.onTime && rule?.onTimeBonus && !input.backfill);

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
    ...(refId && (rule?.refScoped || def.uniqueRef || !rule?.oncePerDay) ? { refId } : {}),
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
