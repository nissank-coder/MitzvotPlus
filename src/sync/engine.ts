import { actionDef, isActionKey } from '../data/actions';
import type { ActivityLog, LogKind } from '../types';
import { createEventPayload, EventReceipt, OutboxItem, privacyFor, syncOnce, SyncGate } from './outbox';
import { goalsFingerprint, GoalWire, planGoals } from './goals';

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
  /** Round 13 (B1): another device deleted the cloud copy meanwhile: the queue is rebuilt first. */
  | 'backup_changed'
  /** Round 13 (B1): after a deletion, nothing is uploaded until the user chose "all" or "from now". */
  | 'backup_decision_required'
  /** Round 13 (B2): another device wrote the goal history meanwhile. */
  | 'goals_conflict'
  | 'unknown';

export class SyncError extends Error {
  constructor(public readonly code: SyncErrorCode, message?: string) {
    super(message ?? code);
  }
}

/** The backup generation as the server enforces it for every device of the account (round 13, B1). */
export type BackupState = {
  /** Grows by one each time the cloud copy is deleted. Uploads of another generation are refused. */
  epoch: number;
  /** "Only from now": entries recorded before this time (ms) are refused. null = all history. */
  floor: number | null;
  /** The cloud copy was deleted and the user has not chosen yet: nothing is accepted. */
  decisionPending: boolean;
};

export type SyncRemote = {
  /** `epoch`: the backup generation this device's queue was built for (round 13). */
  submit: (batch: Array<Pick<OutboxItem, 'eventId' | 'operation' | 'targetEventId' | 'payload'>>, epoch?: number) => Promise<EventReceipt[]>;
  pull: (after: number) => Promise<RemoteEvent[]>;
  backupState?: () => Promise<BackupState>;
  /** The server's blessing-goal history and its version (round 13, B2). */
  getBlessingGoals?: () => Promise<{ version: number; goals: GoalWire[] }>;
  /** Writes the history on top of `baseVersion`; refused with goals_conflict if the server moved on. Returns the new version. */
  setBlessingGoals?: (goals: GoalWire[], baseVersion: number) => Promise<number>;
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
  | { state: 'account-deleted' }
  /** The cloud copy was deleted: the user chooses "all history" or "only from now" before anything is sent. */
  | { state: 'decision-needed' };

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
  /**
   * Blessing goals (round 13, B2): this device's history as sent on the wire, the fingerprint and the
   * server version both sides last agreed on, and how to take the server's history here.
   */
  goals?: {
    wire: () => GoalWire[];
    known: () => { fingerprint: string | null; version: number };
    adopt: (wire: GoalWire[]) => void;
    markSynced: (fingerprint: string, version: number) => void;
  };
  /**
   * The backup generation of this device's queue (round 13, B1) and how to rebuild the queue for
   * another one: from the live entries only (a deleted entry never comes back), including those
   * that came from other devices, and without anything recorded before the floor.
   */
  backup?: {
    local: () => { epoch: number; floor: number | null };
    rebuild: (next: { epoch: number; floor: number | null }) => Promise<void>;
  };
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
  let pushedTotal = 0;
  let rejectedTotal = 0;
  try {
    if (d.persist && !(await d.persist())) return { state: 'error', code: 'local_save_failed', at: now, pending: 0 };
    guard();

    // The backup generation first (round 13, B1): after a deletion – here or on another device –
    // nothing leaves this device before the user chose, and the queue is rebuilt for the new
    // generation. The server refuses an upload of an old generation in any case.
    let backup: BackupState | null = null;
    const refreshBackup = async () => {
      if (!d.remote.backupState) return 'ok' as const;
      backup = await d.remote.backupState();
      guard();
      if (backup.decisionPending) return 'decide' as const;
      const local = d.backup?.local() ?? { epoch: 1, floor: null };
      if (local.epoch !== backup.epoch || local.floor !== backup.floor) {
        if (!d.backup) throw new SyncError('backup_changed');
        await d.backup.rebuild({ epoch: backup.epoch, floor: backup.floor });
        guard();
      }
      return 'ok' as const;
    };
    if ((await refreshBackup()) === 'decide') return { state: 'decision-needed' };

    // Goals next: the scores of the events below depend on them.
    await syncGoals(d, guard);

    for (let attempt = 0; ; attempt += 1) {
      try {
        const result = await push(d, now, guard, (backup as BackupState | null)?.epoch, (backup as BackupState | null)?.floor ?? null);
        if (result.kind === 'status') return result.status;
        pending = result.pending;
        pushedTotal = result.pushed;
        rejectedTotal = result.rejected;
        break;
      } catch (e) {
        // Another device deleted the cloud copy during this run: rebuild once and try again.
        if (e instanceof SyncError && e.code === 'backup_changed' && attempt === 0 && d.remote.backupState) {
          if ((await refreshBackup()) === 'decide') return { state: 'decision-needed' };
          continue;
        }
        if (e instanceof SyncError && e.code === 'backup_decision_required') return { state: 'decision-needed' };
        throw e;
      }
    }

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
    return { state: 'ok', at: now, pushed: pushedTotal, pulled, pending, rejected: rejectedTotal };
  } catch (e) {
    if (e instanceof Cancelled) return { state: 'cancelled' };
    const code = e instanceof SyncError ? e.code : 'offline';
    if (code === 'account_deleted') return { state: 'account-deleted' };
    return { state: 'error', code, at: now, pending };
  }
}

const recordedAtOf = (item: OutboxItem): number => {
  try {
    return Date.parse(String((JSON.parse(item.payload) as { recordedAtUtc?: string }).recordedAtUtc ?? ''));
  } catch {
    return NaN;
  }
};

type PushResult = { kind: 'done'; pushed: number; rejected: number; pending: number } | { kind: 'status'; status: SyncStatus };

/** Push: every due item, in batches, until nothing is due. Any failure stops the run and is reported as an error – never as "synced". */
async function push(d: SyncDeps, now: number, guard: () => void, epoch: number | undefined, floor: number | null): Promise<PushResult> {
  {
    const listed0 = await d.listOutbox();
    // Send-point guard of "only from now" (B1.1): an old entry is never sent, whatever revived it.
    const excluded = floor === null
      ? []
      : listed0
          .filter((i) => i.operation === 'create' && (i.status === 'pending' || i.status === 'deferred'))
          .filter((i) => { const t = recordedAtOf(i); return !Number.isFinite(t) || t < floor; })
          .map((i): OutboxItem => ({ ...i, status: 'rejected', reasonCode: 'before_backup_floor', updatedAt: now }));
    if (excluded.length) await d.saveOutbox(excluded);
    const listed = excluded.length ? await d.listOutbox() : listed0;
    const { items: upgraded, changed } = upgradePayloads(listed, d.logs(), await d.installationId());
    if (changed.length) await d.saveOutbox(changed);
    let items = upgraded;
    let pushed = 0;
    let rejected = 0;
    let failure: SyncError | null = null;
    const transport = {
      submit: async (batch: Parameters<SyncRemote['submit']>[0]) => {
        try {
          return await d.remote.submit(batch, epoch);
        } catch (e) {
          failure = e instanceof SyncError ? e : new SyncError('offline', e instanceof Error ? e.message : String(e));
          throw e;
        }
      },
    };
    for (let round = 0; round < MAX_PUSH_ROUNDS; round += 1) {
      guard();
      const after = await syncOnce(items, transport, now, d.gate);
      const f = failure as SyncError | null;
      // A refusal of the whole generation is not a transport failure of the items: nothing is
      // counted as an attempt, the queue is rebuilt (or the user asked) and the run tries again.
      if (f && (f.code === 'backup_changed' || f.code === 'backup_decision_required')) throw f;
      const updated = after.filter((a, i) => a !== items[i]);
      if (updated.length === 0) break;
      // Receipts are written even if the run was cancelled meanwhile: they are facts of this space.
      await d.saveOutbox(updated);
      pushed += updated.filter((u) => u.status === 'accepted').length;
      rejected += updated.filter((u) => u.status === 'rejected').length;
      items = after;
      if (failure) break;
    }
    const pending = items.filter((i) => i.status === 'pending' || i.status === 'deferred').length;
    const f = failure as SyncError | null;
    if (f?.code === 'account_deleted') return { kind: 'status', status: { state: 'account-deleted' } };
    if (f) return { kind: 'status', status: { state: 'error', code: f.code, at: now, pending } };
    return { kind: 'done', pushed, rejected, pending };
  }
}

/**
 * Blessing goals (round 13, B2): read the server's history and its version, then push, adopt or
 * merge (sync/goals.ts). A write that lost a race with another device is planned again once.
 */
async function syncGoals(d: SyncDeps, guard: () => void): Promise<void> {
  const g = d.goals;
  if (!g || !d.remote.getBlessingGoals || !d.remote.setBlessingGoals) return;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const server = await d.remote.getBlessingGoals();
    guard();
    const known = g.known();
    const plan = planGoals(g.wire(), known.fingerprint, known.version, server);
    try {
      switch (plan.kind) {
        case 'nothing':
          if (goalsFingerprint(server.goals) === goalsFingerprint(g.wire()) && (known.version !== server.version || known.fingerprint !== goalsFingerprint(server.goals))) {
            g.markSynced(goalsFingerprint(server.goals), server.version);
          }
          return;
        case 'adopt':
          g.adopt(plan.wire);
          g.markSynced(goalsFingerprint(plan.wire), server.version);
          return;
        case 'push':
        case 'merge': {
          const version = await d.remote.setBlessingGoals(plan.wire, server.version);
          guard();
          if (plan.kind === 'merge') g.adopt(plan.wire);
          g.markSynced(goalsFingerprint(plan.wire), version);
          return;
        }
      }
    } catch (e) {
      if (e instanceof SyncError && e.code === 'goals_conflict' && attempt === 0) continue;
      throw e;
    }
  }
}
