import { ActionCategory, actionDef, categoryStyle } from '../data/actions';
import { ActivityLog } from '../types';
import { ProgressContext } from './challenges';
import { addDays, weekKeys } from './dates';

/**
 * Period statistics for the progress screen (round 9, B2). Days before the user started, future
 * days and rest days without entries are not counted; today counts only once its goal is met.
 * A comparison with the previous period is offered only when that whole period is after the start.
 */
export type Period = 'day' | 'week' | 'month';

export type DayCell = { key: string; label: string; state: 'goal' | 'partial' | 'empty' | 'rest' | 'future' | 'before' | 'open'; entries: number };

export type PeriodStats = {
  period: Period;
  start: string;
  /** Exclusive. */
  end: string;
  days: DayCell[];
  goalDays: number;
  eligibleDays: number;
  /** null = nothing to measure yet. */
  percent: number | null;
  /** Previous period of the same length, or null without a full baseline. */
  previous: { goalDays: number; eligibleDays: number; percent: number | null } | null;
  entries: number;
  byCategory: Array<{ category: ActionCategory; title: string; color: string; days: number; entries: number }>;
};

const HEB_DAYS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];

export function periodRange(period: Period, todayKey: string): { start: string; end: string } {
  if (period === 'day') return { start: todayKey, end: addDays(todayKey, 1) };
  if (period === 'week') {
    const w = weekKeys(todayKey);
    return { start: w[0] ?? todayKey, end: addDays(w[6] ?? todayKey, 1) };
  }
  const start = `${todayKey.slice(0, 7)}-01`;
  const [y, m] = todayKey.split('-').map(Number);
  const next = m === 12 ? `${(y ?? 2026) + 1}-01-01` : `${y}-${String((m ?? 1) + 1).padStart(2, '0')}-01`;
  return { start, end: next };
}

function previousRange(period: Period, start: string): { start: string; end: string } {
  if (period === 'day') return { start: addDays(start, -1), end: start };
  if (period === 'week') return { start: addDays(start, -7), end: start };
  const [y, m] = start.split('-').map(Number);
  const prev = m === 1 ? `${(y ?? 2026) - 1}-12-01` : `${y}-${String((m ?? 2) - 1).padStart(2, '0')}-01`;
  return { start: prev, end: start };
}

function count(ctx: ProgressContext, start: string, end: string) {
  let goalDays = 0;
  let eligibleDays = 0;
  for (let k = start; k < end; k = addDays(k, 1)) {
    if (k < ctx.measureFrom || k > ctx.todayKey) continue;
    const has = (ctx.byDay.get(k) ?? []).length > 0;
    const met = ctx.goalMet(k);
    if (k === ctx.todayKey && !met) continue;
    if (!has && ctx.isRestDay(k)) continue;
    if (!met && ctx.neutralDay(k)) continue;
    eligibleDays += 1;
    if (met) goalDays += 1;
  }
  return { goalDays, eligibleDays, percent: eligibleDays === 0 ? null : Math.round((goalDays / eligibleDays) * 100) };
}

export function periodStats(ctx: ProgressContext, period: Period): PeriodStats {
  const { start, end } = periodRange(period, ctx.todayKey);
  const days: DayCell[] = [];
  for (let k = start; k < end; k = addDays(k, 1)) {
    const logs = ctx.byDay.get(k) ?? [];
    const dow = new Date(`${k}T12:00:00Z`).getUTCDay();
    let state: DayCell['state'];
    if (k > ctx.todayKey) state = 'future';
    else if (k < ctx.measureFrom && logs.length === 0) state = 'before';
    else if (ctx.goalMet(k)) state = 'goal';
    else if (k === ctx.todayKey) state = 'open';
    else if (ctx.isRestDay(k) && logs.length === 0) state = 'rest';
    else if (ctx.neutralDay(k)) state = 'rest';
    else if (logs.length > 0) state = 'partial';
    else state = 'empty';
    days.push({ key: k, label: period === 'month' ? String(Number(k.slice(8))) : HEB_DAYS[dow] ?? '', state, entries: logs.length });
  }
  const current = count(ctx, start, end);
  const prev = previousRange(period, start);
  const previous = prev.start >= ctx.measureFrom ? count(ctx, prev.start, prev.end) : null;

  const cats = new Map<ActionCategory, { days: Set<string>; entries: number }>();
  let entries = 0;
  for (let k = start; k < end && k <= ctx.todayKey; k = addDays(k, 1)) {
    for (const l of ctx.byDay.get(k) ?? []) {
      entries += 1;
      const c = l.actionKey ? actionDef(l.actionKey).category : 'other';
      const cur = cats.get(c) ?? { days: new Set<string>(), entries: 0 };
      cur.days.add(k);
      cur.entries += 1;
      cats.set(c, cur);
    }
  }
  const byCategory = [...cats.entries()]
    .map(([category, v]) => ({ category, title: categoryStyle[category].title, color: categoryStyle[category].color, days: v.days.size, entries: v.entries }))
    .sort((a, b) => b.days - a.days || b.entries - a.entries);

  return { period, start, end, days, ...current, previous, entries, byCategory };
}

/** Entries of a period, newest first (the journal). */
export function periodLogs(byDay: Map<string, ActivityLog[]>, start: string, end: string): ActivityLog[] {
  const out: ActivityLog[] = [];
  for (const [k, logs] of byDay) if (k >= start && k < end) out.push(...logs);
  return out.sort((a, b) => b.createdAt - a.createdAt);
}
