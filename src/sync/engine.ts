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

export type SyncErrorCode = 'offline' | 'not_authenticated' | 'consent_required' | 'account_deleted' | 'rate_limited' | 'unknown';

export class SyncError extends Error {
  constructor(public readonly code: SyncErrorCode, message?: string) {
    super(message ?? code);
  }
}

export type SyncRemote = {
  submit: (batch: Array<Pick<OutboxItem, 'eventId' | 'operation' | 'targetEventId' | 'payload'>>) => Promise<EventReceipt[]>;
  pull: (after: number) => Promise<RemoteEvent[]>;
};

export type SyncStatus =
  | { state: 'off' }
  | { state: 'signed-out' }
  | { state: 'consent-needed' }
  | { state: 'syncing' }
  | { state: 'ok'; at: number; pushed: number; pulled: number; pending: number }
  | { state: 'error'; code: SyncErrorCode; at: number; pending: number }
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
  remote: SyncRemote;
  gate: SyncGate;
  now: () => number;
};

export async function syncNow(d: SyncDeps): Promise<SyncStatus> {
  if (!d.gate.enabled) return { state: 'off' };
  if (!d.gate.consent.cloudBackup) return { state: 'consent-needed' };
  const now = d.now();
  let fatal: SyncError | null = null;

  // Push
  const listed = await d.listOutbox();
  const { items, changed } = upgradePayloads(listed, d.logs(), await d.installationId());
  if (changed.length) await d.saveOutbox(changed);
  const transport = {
    submit: async (batch: Parameters<SyncRemote['submit']>[0]) => {
      try {
        return await d.remote.submit(batch);
      } catch (e) {
        if (e instanceof SyncError && e.code !== 'offline' && e.code !== 'rate_limited') fatal = e;
        throw e;
      }
    },
  };
  const after = await syncOnce(items, transport, now, d.gate);
  const updated = after.filter((a, i) => a !== items[i]);
  const failure = fatal as SyncError | null;
  if (failure?.code === 'account_deleted') return { state: 'account-deleted' };
  if (updated.length) await d.saveOutbox(updated);
  const pending = after.filter((i) => i.status === 'pending' || i.status === 'deferred').length;
  if (failure) return { state: 'error', code: failure.code, at: now, pending };

  // Pull
  let pulled = 0;
  try {
    for (let page = 0; page < 20; page += 1) {
      const events = await d.remote.pull(d.cursor());
      if (events.length === 0) break;
      d.applyRemote(events);
      pulled += events.length;
    }
  } catch (e) {
    const code = e instanceof SyncError ? e.code : 'offline';
    if (code === 'account_deleted') return { state: 'account-deleted' };
    return { state: 'error', code, at: now, pending };
  }
  return { state: 'ok', at: now, pushed: updated.filter((u) => u.status === 'accepted').length, pulled, pending };
}
