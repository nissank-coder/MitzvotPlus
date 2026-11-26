import { actionDef, isActionKey } from '../data/actions';
import type { ActivityLog, LogKind } from '../types';
import { createEventPayload, EventReceipt, OutboxItem, privacyFor, syncOnce, SyncGate } from './outbox';

/**
 * Two-way sync (round 12). Offline first: the device is the source of truth for what the user did;
 * the server keeps an append-only copy (backup) and computes the authoritative score.
 *
 * Push: the outbox (already private-filtered) goes through syncOnce – guarded at the send point
 *       (sync enabled + active consent), idempotent by event id (a resend after a lost response
 *       comes back as 'duplicate' and is treated as accepted).
 * Pull: events after a cursor, from every device of the account. A create already on this device
 *       is skipped; a create from another device is added (never re-uploaded); a void removes the
 *       entry here (and is not sent back).
 * Conflicts: entries are immutable events. A correction is a void + a new create; a deletion on any
 *       device wins over the entry; the same once-a-day action from two devices is kept twice in the
 *       journal and scored once by the engine (no lost data, no double points).
 */

export type RemoteEvent = {
  seq: number;
  event_id: string;
  operation: 'create' | 'void';
  target_event_id: string | null;
  action_type: string | null;
  local_date: string | null;
  payload: Record<string, unknown>;
};

export type SyncErrorCode =
  | 'offline'
  | 'not_authenticated'
  | 'consent_required'
  | 'account_deleted'
  | 'rate_limited'
  /** The device could not store its own data: nothing is sent or applied until it can. */
  | 'local_save_failed'
  | 'unknown';

export class SyncError extends Error {
  constructor(public readonly code: SyncErrorCode, message?: string) {
    super(message ?? code);
  }
}

export type SyncRemote = {
  submit: (batch: Array<Pick<OutboxItem, 'eventId' | 'operation' | 'targetEventId' | 'payload'>>) => Promise<EventReceipt[]>;
  pull: (after: number) => Promise<RemoteEvent[]>;
  /** Goal snapshots, so the server scores each day with the goal in force on it. */
  setBlessingGoals?: (goals: Array<{ from: string; blessingGoal: number }>) => Promise<void>;
};

export type SyncStatus =
  | { state: 'off' }
  | { state: 'signed-out' }
  | { state: 'consent-needed' }
  | { state: 'syncing' }
  | { state: 'ok'; at: number; pushed: number; pulled: number; pending: number; rejected: number }
  | { state: 'error'; code: SyncErrorCode; at: number; pending: number }
  /** Stopped because the user signed out, switched account or revoked consent: results dropped. */
  | { state: 'cancelled' }
  | { state: 'account-deleted' };

/** Never-sent items written as schema v1 (with the city) are re-encoded as v2, or dropped if local-only. */
export function upgradePayloads(items: OutboxItem[], logs: ActivityLog[], installationId: string): { items: OutboxItem[]; changed: OutboxItem[] } {
  const byId = new Map(logs.map((l) => [l.id, l]));
  const changed: OutboxItem[] = [];
  const out = items.flatMap((i) => {
    if (i.operation !== 'create' || i.attempts > 0 || i.status !== 'pending') return [i];
    let version = 0;
    try {
      version = (JSON.parse(i.payload) as { schemaVersion?: number }).schemaVersion ?? 0;
    } catch {
      version = 0;
    }
    if (version >= 2) return [i];
    const log = byId.get(i.eventId);
    if (!log || !privacyFor(log.actionKey).cloudBackup) return [];
    const next = { ...i, payload: createEventPayload(log, installationId) };
    changed.push(next);
    return [next];
  });
  return { items: out, changed };
}

const kindOf = (key: string): LogKind => (key === 'blessing' ? 'blessing' : key === 'dailyTorah' ? 'torah' : 'mitzvah');

/** An entry made on another device, rebuilt from its event (points are recomputed by the engine). */
export function logFromRemote(ev: RemoteEvent): ActivityLog | null {
  const p = ev.payload as Record<string, unknown>;
  const key = (ev.action_type ?? (p.actionType as string | undefined)) ?? '';
  if (ev.operation !== 'create' || !isActionKey(key) || !privacyFor(key).cloudBackup) return null;
  const def = actionDef(key);
  const occurred = Date.parse(String(p.occurredAtUtc ?? ''));
  const recorded = Date.parse(String(p.recordedAtUtc ?? ''));
  if (!Number.isFinite(occurred) || typeof p.localDate !== 'string') return null;
  const ctx = p.calendarContext as { policyVersion?: string; tzid?: string; il?: boolean } | undefined;
  return {
    id: ev.event_id,
    title: p.minyan ? `${def.title} במניין` : def.title,
    icon: def.icon,
    points: 0,
    createdAt: occurred,
    dateKey: p.localDate,
    kind: kindOf(key),
    actionKey: key,
    ...(p.category ? { category: p.category as ActivityLog['category'] } : {}),
    ...(p.refId ? { refId: String(p.refId) } : {}),
    ...(p.minyan ? { minyan: true } : {}),
    ...(p.onTime ? { onTime: true } : {}),
    ...(p.backfill ? { backfill: true } : {}),
    recordedAt: Number.isFinite(recorded) ? recorded : occurred,
    ...(ctx?.tzid ? { context: { policyVersion: ctx.policyVersion ?? '', cityId: '', tzid: ctx.tzid, il: Boolean(ctx.il), candleMins: 0 } } : {}),
    ...(p.contentId ? { content: { id: String(p.contentId), version: String(p.contentVersion ?? '') } } : {}),
    ...(p.rulesVersion === 'score-2' || p.rulesVersion === 'score-3' ? { rules: p.rulesVersion } : {}),
    ...(p.bundleOf ? { bundleOf: String(p.bundleOf) } : {}),
    remote: true,
  };
}

export type SyncDeps = {
  listOutbox: () => Promise<OutboxItem[]>;
  saveOutbox: (items: OutboxItem[]) => Promise<void>;
  installationId: () => Promise<string>;
  logs: () => ActivityLog[];
  cursor: () => number;
  /** Applies pulled events to the state (reducer action 'applyRemoteEvents'). */
  applyRemote: (events: RemoteEvent[]) => void;
  /**
   * Writes the state (entries + cursor, one transaction) to the device. Sync is reported as done
   * only after this succeeded; before the first push it proves that local saving works at all.
   */
  persist?: () => Promise<boolean>;
  /** False once the run belongs to an old session (sign-out, other account, consent revoked). */
  isCurrent?: () => boolean;
  /** Goal snapshots and the fingerprint of the last ones the server accepted. */
  goals?: { current: () => Array<{ from: string; blessingGoal: number }>; sent: () => string | null; markSent: (hash: string) => void };
  remote: SyncRemote;
  gate: SyncGate;
  now: () => number;
};

/** Upper bounds per run: a long queue or history is processed in many requests, never skipped. */
export const MAX_PUSH_ROUNDS = 200;
export const MAX_PULL_PAGES = 1000;

class Cancelled extends Error {}

export async function syncNow(d: SyncDeps): Promise<SyncStatus> {
  if (!d.gate.enabled) return { state: 'off' };
  if (!d.gate.consent.cloudBackup) return { state: 'consent-needed' };
  const now = d.now();
  const current = () => d.isCurrent?.() ?? true;
  const guard = () => {
    if (!current()) throw new Cancelled();
  };
  let pending = 0;
  try {
    if (d.persist && !(await d.persist())) return { state: 'error', code: 'local_save_failed', at: now, pending: 0 };
    guard();

    // Goals first: the scores of the events below depend on them.
    if (d.goals && d.remote.setBlessingGoals) {
      const goals = d.goals.current();
      const hash = canonicalJsonOf(goals);
      if (d.goals.sent() !== hash) {
        await d.remote.setBlessingGoals(goals);
        guard();
        d.goals.markSent(hash);
      }
    }

    // Push: every due item, in batches, until nothing is due. Any failure stops the run and is
    // reported as an error – never as "synced".
    const listed = await d.listOutbox();
    const { items: upgraded, changed } = upgradePayloads(listed, d.logs(), await d.installationId());
    if (changed.length) await d.saveOutbox(changed);
    let items = upgraded;
    let pushed = 0;
    let rejected = 0;
    let failure: SyncError | null = null;
    const transport = {
      submit: async (batch: Parameters<SyncRemote['submit']>[0]) => {
        try {
          return await d.remote.submit(batch);
        } catch (e) {
          failure = e instanceof SyncError ? e : new SyncError('offline', e instanceof Error ? e.message : String(e));
          throw e;
        }
      },
    };
    for (let round = 0; round < MAX_PUSH_ROUNDS; round += 1) {
      guard();
      const after = await syncOnce(items, transport, now, d.gate);
      const updated = after.filter((a, i) => a !== items[i]);
      if (updated.length === 0) break;
      // Receipts are written even if the run was cancelled meanwhile: they are facts of this space.
      await d.saveOutbox(updated);
      pushed += updated.filter((u) => u.status === 'accepted').length;
      rejected += updated.filter((u) => u.status === 'rejected').length;
      items = after;
      if (failure) break;
    }
    pending = items.filter((i) => i.status === 'pending' || i.status === 'deferred').length;
    const f = failure as SyncError | null;
    if (f?.code === 'account_deleted') return { state: 'account-deleted' };
    if (f) return { state: 'error', code: f.code, at: now, pending };

    // Pull: page after page until the server has nothing newer.
    let pulled = 0;
    for (let page = 0; page < MAX_PULL_PAGES; page += 1) {
      guard();
      const events = await d.remote.pull(d.cursor());
      guard(); // a response that arrives after a sign-out / account switch is dropped
      if (events.length === 0) break;
      d.applyRemote(events);
      pulled += events.length;
    }
    // Entries and cursor are durable before "synced" is shown.
    if (d.persist && !(await d.persist())) return { state: 'error', code: 'local_save_failed', at: now, pending };
    guard();
    return { state: 'ok', at: now, pushed, pulled, pending, rejected };
  } catch (e) {
    if (e instanceof Cancelled) return { state: 'cancelled' };
    const code = e instanceof SyncError ? e.code : 'offline';
    if (code === 'account_deleted') return { state: 'account-deleted' };
    return { state: 'error', code, at: now, pending };
  }
}

function canonicalJsonOf(v: unknown): string {
  return JSON.stringify(v);
}
