import { goalsOn } from '../lib/metrics';
import type { GoalSnapshot } from '../types';

/**
 * Blessing-goal history between devices (round 13, review B2). Pure functions – no network.
 *
 * Round 12.5 sent the device's whole goal history and the server replaced its own with it, so a
 * phone that still held an old history silently undid a change made on another phone. Now:
 *  - the server keeps a version of the history; a write must name the version it is based on
 *    (set_blessing_goals(p_goals, p_base_version)) and is refused if another device wrote meanwhile;
 *  - a device that did not change its goals since it last synced adopts the server's history;
 *  - a device that did, while the server changed too (a conflict), merges and writes the result.
 *
 * Conflict rule (documented in docs/review-r13/REPORT_HE.md): the histories are united by start
 * day. If both name the same start day with different goals, the goal set later wins (blessingSetAt,
 * the device clock); a tie keeps the server's. Days before any change keep the goal they had.
 * Known limit: a change made and taken back on the same day on one phone, while another phone
 * changed the goal too, can come back after the merge (a deleted start day is not recorded).
 */
export type GoalWire = { from: string; blessingGoal: number; setAt: number };

const FIRST_DAY = '0000-00-00';

/** The blessing-goal part of a local history, without repeats (a habits-only change is not a goal change). */
export function goalWireOf(history: GoalSnapshot[]): GoalWire[] {
  const out: GoalWire[] = [];
  for (const g of [...history].sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0))) {
    const last = out[out.length - 1];
    if (last && last.blessingGoal === g.blessingGoal) continue;
    out.push({ from: out.length === 0 ? FIRST_DAY : g.from, blessingGoal: g.blessingGoal, setAt: g.blessingSetAt ?? 0 });
  }
  return out;
}

const sortWire = (w: GoalWire[]) => [...w].sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));

/** Collapses repeats and makes the first entry start "since always". */
function normalize(w: GoalWire[]): GoalWire[] {
  const out: GoalWire[] = [];
  for (const g of sortWire(w)) {
    const last = out[out.length - 1];
    if (last && last.blessingGoal === g.blessingGoal) continue;
    out.push(out.length === 0 ? { ...g, from: FIRST_DAY } : g);
  }
  return out;
}

/** The merge of a conflict: union by start day; same start day → later setAt; tie → the server's. */
export function mergeGoalWires(local: GoalWire[], server: GoalWire[]): GoalWire[] {
  const byDay = new Map<string, GoalWire>();
  for (const g of server) byDay.set(g.from, g);
  for (const g of local) {
    const other = byDay.get(g.from);
    if (!other || g.setAt > other.setAt) byDay.set(g.from, g);
  }
  return normalize([...byDay.values()]);
}

function wireOn(wire: GoalWire[], dateKey: string): GoalWire | undefined {
  let found = wire[0];
  for (const g of sortWire(wire)) if (g.from <= dateKey) found = g;
  return found;
}

/**
 * The local history with the blessing goals of `wire`. Daily goals, habits and their history stay
 * the device's own (the server stores only the blessing goal, which it needs for scoring).
 */
export function withBlessingGoals(history: GoalSnapshot[], wire: GoalWire[]): GoalSnapshot[] {
  if (wire.length === 0) return history;
  const days = [...new Set([...history.map((g) => g.from), ...wire.map((g) => g.from)])].sort();
  const out: GoalSnapshot[] = [];
  for (const d of days) {
    const base = goalsOn(history, d);
    const w = wireOn(wire, d)!;
    const next: GoalSnapshot = { ...base, from: d, blessingGoal: w.blessingGoal, blessingSetAt: w.setAt };
    const last = out[out.length - 1];
    if (last && sameGoals(last, next)) continue;
    out.push(next);
  }
  return out;
}

function sameGoals(a: GoalSnapshot, b: GoalSnapshot): boolean {
  const { from: _a, ...x } = a;
  const { from: _b, ...y } = b;
  return JSON.stringify(x) === JSON.stringify(y);
}

export const goalsFingerprint = (wire: GoalWire[]) => JSON.stringify(normalize(wire));

export type GoalPlan =
  | { kind: 'nothing' }
  /** Only this device changed: write its history on top of the server's version. */
  | { kind: 'push'; wire: GoalWire[] }
  /** Only the server changed (another device): take its history. */
  | { kind: 'adopt'; wire: GoalWire[] }
  /** Both changed: write the merge, and take it here too. */
  | { kind: 'merge'; wire: GoalWire[] };

/**
 * What to do with the goals on a sync. `sentFingerprint`/`knownVersion` describe the last history
 * this device and the server agreed on. An empty server history (never written, or deleted with the
 * cloud copy) is never adopted: the device's own history is written instead.
 */
export function planGoals(localWire: GoalWire[], sentFingerprint: string | null, knownVersion: number, server: { version: number; goals: GoalWire[] }): GoalPlan {
  const localChanged = goalsFingerprint(localWire) !== sentFingerprint;
  const serverChanged = server.version !== knownVersion;
  const serverFingerprint = goalsFingerprint(server.goals);
  if (server.goals.length === 0) return localWire.length > 0 ? { kind: 'push', wire: normalize(localWire) } : { kind: 'nothing' };
  if (serverFingerprint === goalsFingerprint(localWire)) return { kind: 'nothing' };
  if (!serverChanged && !localChanged) return { kind: 'nothing' };
  if (!serverChanged) return { kind: 'push', wire: normalize(localWire) };
  if (!localChanged) return { kind: 'adopt', wire: normalize(server.goals) };
  return { kind: 'merge', wire: mergeGoalWires(localWire, server.goals) };
}
