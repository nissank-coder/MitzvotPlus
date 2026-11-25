/**
 * Client side of the event/sync contract (docs/mobile-readiness/MitzvotPlus_Claude_Handoff/02 §7).
 * Pure functions: no network, no storage. The server side does not exist yet (stage G3); a
 * transport implementing SyncTransport is plugged in later. Nothing here is enabled in the app.
 */
import { ActivityLog } from '../types';

/**
 * v2 (round 11): minimal calendar context (no city, no candle-lighting minutes) and the facts
 * needed to rebuild a score (onTime, rulesVersion, bundleOf). Payloads already frozen in the queue
 * keep the version they were written with.
 */
export const EVENT_SCHEMA_VERSION = 2;

export type Operation = 'create' | 'void';

export type OutboxStatus =
  /** Waiting to be sent (or re-sent after a temporary failure). */
  | 'pending'
  /** Server asked to retry after retryAfter (e.g. Shabbat intake policy). Never permanent. */
  | 'deferred'
  /** Terminal: the server accepted it (also when it reports a duplicate of an accepted event). */
  | 'accepted'
  /** Terminal: a business rejection, kept with its reason for the UI and correction flow. */
  | 'rejected';

export type OutboxItem = {
  eventId: string;
  operation: Operation;
  /** For void: the event being reversed. */
  targetEventId?: string;
  /** Canonical payload frozen at first enqueue (spec: never modified afterwards). */
  payload: string;
  status: OutboxStatus;
  attempts: number;
  /** Earliest time (UTC ms) of the next attempt. */
  nextAttemptAt: number;
  reasonCode?: string;
  /** Authoritative score delta from the server; applied once, never on receipt replay. */
  acceptedScoreDelta?: number;
  updatedAt: number;
};

export type EventReceipt = {
  eventId: string;
  outcome: 'accepted' | 'duplicate' | 'rejected' | 'deferred';
  reasonCode?: string;
  retryAfterUtc?: string;
  serverReceivedAtUtc: string;
  scoreRuleVersion?: string;
  authoritativeScoreDelta?: number;
};

export type SyncTransport = {
  /** Submits a bounded batch; returns one receipt per event, or throws on a transport/infrastructure failure. */
  submit: (batch: Array<Pick<OutboxItem, 'eventId' | 'operation' | 'targetEventId' | 'payload'>>) => Promise<EventReceipt[]>;
};

/* ------------------------------ Payloads ------------------------------ */

/** Stable JSON: keys sorted at every level, undefined dropped. The normalization rule for frozen payloads. */
export function canonicalJson(value: unknown): string {
  const norm = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(norm);
    if (v && typeof v === 'object') {
      return Object.fromEntries(
        Object.keys(v as Record<string, unknown>)
          .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
          .sort()
          .map((k) => [k, norm((v as Record<string, unknown>)[k])]),
      );
    }
    return v;
  };
  return JSON.stringify(norm(value));
}

/**
 * Privacy policy per action (round 10 S10-02, round 11 §3; round-8/privacy-sync-plan.md).
 * Default-deny, two separate decisions:
 *  - cloudBackup: may be queued for a future backup to the user's own account – only with active
 *    consent, and sync is off (SYNC_ENABLED=false);
 *  - social: may ever appear (as a participation unit) to friends. Always opt-in per item later.
 * Not listed = local only: speech awareness and the speech-guard day, charity and matanot
 * la-evyonim, visiting the sick, a personal habit (its label is the user's own text), and any
 * action this table does not know. The speech timer, resets and reflections are not activities.
 */
type Privacy = { cloudBackup: boolean; social: boolean };
const SOCIAL = { cloudBackup: true, social: true } as const;
const BACKUP_ONLY = { cloudBackup: true, social: false } as const;
const PRIVACY: Readonly<Record<string, Privacy>> = Object.freeze({
  // prayer
  shacharit: SOCIAL, mincha: SOCIAL, arvit: SOCIAL, musaf: SOCIAL, tefillin: SOCIAL, shema: SOCIAL,
  birkotHashachar: SOCIAL, hallel: SOCIAL, tehillim: SOCIAL, prayer: SOCIAL,
  // blessings
  blessing: SOCIAL, birkatHamazon: SOCIAL,
  // learning
  torahStudy: SOCIAL, dailyTorah: SOCIAL, learningTrack: SOCIAL, mitzvahStudy: SOCIAL,
  // between people – backed up for the user, never shown to others
  chesed: BACKUP_ONLY, parents: BACKUP_ONLY, guests: BACKUP_ONLY, gratitude: BACKUP_ONLY,
  // Shabbat and holidays
  candleLighting: SOCIAL, challah: SOCIAL, shnayimMikra: SOCIAL, kiddush: SOCIAL, shabbatMeal: SOCIAL,
  havdalah: SOCIAL, fullShabbat: SOCIAL, omer: SOCIAL, chanukahCandles: SOCIAL, megillah: SOCIAL,
  mishloachManot: SOCIAL, purimSeuda: SOCIAL, shofar: SOCIAL, sukkah: SOCIAL, lulav: SOCIAL,
  bedikatChametz: SOCIAL, seder: SOCIAL,
  // fasting is health-related: never social
  fastDay: BACKUP_ONLY,
});
const LOCAL: Privacy = { cloudBackup: false, social: false };

export function privacyFor(actionKey: string | undefined): Privacy {
  return (actionKey && PRIVACY[actionKey]) || LOCAL;
}

export type SyncPolicy = 'local-only' | 'sync-with-consent';

export function syncPolicy(log: Pick<ActivityLog, 'actionKey'>): SyncPolicy {
  return privacyFor(log.actionKey).cloudBackup ? 'sync-with-consent' : 'local-only';
}

/**
 * The create event for a log entry. Client points are NOT part of the payload: the server derives
 * the authoritative score; local points stay provisional until accepted.
 */
export function createEventPayload(log: ActivityLog, installationId: string): string {
  return canonicalJson({
    eventId: log.id,
    installationId,
    schemaVersion: EVENT_SCHEMA_VERSION,
    operation: 'create',
    actionType: log.actionKey ?? log.kind,
    quantity: 1,
    category: log.category,
    refId: log.refId,
    minyan: log.minyan,
    occurredAtUtc: new Date(log.createdAt).toISOString(),
    recordedAtUtc: new Date(log.recordedAt ?? log.createdAt).toISOString(),
    localDate: log.dateKey,
    backfill: log.backfill,
    // Minimal context: the policy, the time zone and Israel/diaspora – no city, no coordinates.
    calendarContext: log.context ? { policyVersion: log.context.policyVersion, tzid: log.context.tzid, il: log.context.il } : undefined,
    contentId: log.content?.id,
    contentVersion: log.content?.version,
    // Facts a server needs to recompute the score itself (it never trusts client points).
    onTime: log.onTime,
    rulesVersion: log.rules,
    bundleOf: log.bundleOf,
  });
}

export function voidEventPayload(eventId: string, targetEventId: string, installationId: string, now: number): string {
  return canonicalJson({
    eventId,
    installationId,
    schemaVersion: EVENT_SCHEMA_VERSION,
    operation: 'void',
    targetEventId,
    recordedAtUtc: new Date(now).toISOString(),
  });
}

export function newCreateItem(log: ActivityLog, installationId: string, now: number): OutboxItem {
  return { eventId: log.id, operation: 'create', payload: createEventPayload(log, installationId), status: 'pending', attempts: 0, nextAttemptAt: now, updatedAt: now };
}

/**
 * Undo of a recorded action. If the create was never sent, both can simply be dropped locally;
 * once it may have reached the server, a void operation is queued instead (never edit a sent event).
 */
export function undoPlan(create: OutboxItem | undefined): 'drop-local' | 'enqueue-void' | 'nothing' {
  if (!create) return 'nothing';
  if (create.status === 'rejected') return 'drop-local';
  if (create.status === 'pending' && create.attempts === 0) return 'drop-local';
  return 'enqueue-void';
}

/* ------------------------------ Scheduling ------------------------------ */

export const BACKOFF_BASE_MS = 30_000;
export const BACKOFF_MAX_MS = 6 * 60 * 60 * 1000;
/** A deferral without a usable retryAfter is re-checked after this long – it never parks forever. */
export const DEFAULT_DEFER_MS = 60 * 60 * 1000;
export const MAX_DEFER_MS = 7 * 24 * 60 * 60 * 1000;

/** Exponential backoff with full jitter (random in [0, cap]). `random` is injectable for tests. */
export function backoffDelay(attempts: number, random: () => number = Math.random): number {
  const cap = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** Math.max(0, attempts - 1));
  return Math.floor(random() * cap);
}

const isTerminal = (s: OutboxStatus) => s === 'accepted' || s === 'rejected';

/**
 * Items to send now, oldest first, bounded. A void waits until its target create is terminal
 * (so the server never has to guess a negative score for an unknown event).
 */
export function dueItems(items: OutboxItem[], now: number, limit = 50): OutboxItem[] {
  const byId = new Map(items.map((i) => [i.eventId, i]));
  return items
    .filter((i) => (i.status === 'pending' || i.status === 'deferred') && i.nextAttemptAt <= now)
    .filter((i) => {
      if (i.operation !== 'void' || !i.targetEventId) return true;
      const target = byId.get(i.targetEventId);
      return !target || isTerminal(target.status);
    })
    .sort((a, b) => a.nextAttemptAt - b.nextAttemptAt || a.updatedAt - b.updatedAt)
    .slice(0, limit);
}

/** Applies one receipt. Replaying the same receipt never changes an already terminal item. */
export function applyReceipt(item: OutboxItem, receipt: EventReceipt, now: number): OutboxItem {
  if (isTerminal(item.status)) return item;
  const attempts = item.attempts + 1;
  switch (receipt.outcome) {
    case 'accepted':
    case 'duplicate':
      return { ...item, status: 'accepted', attempts, reasonCode: undefined, acceptedScoreDelta: receipt.authoritativeScoreDelta, updatedAt: now };
    case 'rejected':
      return { ...item, status: 'rejected', attempts, reasonCode: receipt.reasonCode ?? 'rejected', updatedAt: now };
    case 'deferred': {
      const parsed = receipt.retryAfterUtc ? Date.parse(receipt.retryAfterUtc) : NaN;
      const retryAt = Number.isFinite(parsed) && parsed > now ? Math.min(parsed, now + MAX_DEFER_MS) : now + DEFAULT_DEFER_MS;
      return { ...item, status: 'deferred', attempts, reasonCode: receipt.reasonCode, nextAttemptAt: retryAt, updatedAt: now };
    }
    default:
      return item;
  }
}

/** A transport/infrastructure failure is temporary: back off, never mark as rejected. */
export function applyTransportFailure(item: OutboxItem, now: number, random?: () => number): OutboxItem {
  if (isTerminal(item.status)) return item;
  const attempts = item.attempts + 1;
  return { ...item, status: item.status === 'deferred' ? 'deferred' : 'pending', attempts, nextAttemptAt: now + backoffDelay(attempts, random), updatedAt: now };
}

/**
 * One sync pass: send due items, apply receipts. Items without a receipt in a successful
 * response are treated as a temporary failure (retried), never dropped.
 */
/** Conditions checked at the moment of sending (round 11 §3): sync on AND active consent. */
export type SyncGate = { enabled: boolean; consent: { cloudBackup: boolean } };

const payloadAction = (item: OutboxItem): string | undefined => {
  try {
    return (JSON.parse(item.payload) as { actionType?: string }).actionType;
  } catch {
    return undefined;
  }
};

/**
 * Sends due items. The send point itself is guarded: nothing leaves the device unless sync is
 * enabled AND the user's consent is active, and a create event of a local-only action is never
 * sent even if it is in the queue (e.g. written by an older version).
 */
export async function syncOnce(
  items: OutboxItem[],
  transport: SyncTransport,
  now: number,
  gate: SyncGate,
  random?: () => number,
): Promise<OutboxItem[]> {
  if (!gate.enabled || !gate.consent.cloudBackup) return items;
  const due = dueItems(items, now).filter(
    (i) => i.operation !== 'create' || privacyFor(payloadAction(i)).cloudBackup,
  );
  if (due.length === 0) return items;
  const updated = new Map<string, OutboxItem>();
  try {
    const receipts = await transport.submit(due.map(({ eventId, operation, targetEventId, payload }) => ({ eventId, operation, targetEventId, payload })));
    const byId = new Map(receipts.map((r) => [r.eventId, r]));
    for (const item of due) {
      const r = byId.get(item.eventId);
      updated.set(item.eventId, r ? applyReceipt(item, r, now) : applyTransportFailure(item, now, random));
    }
  } catch {
    for (const item of due) updated.set(item.eventId, applyTransportFailure(item, now, random));
  }
  return items.map((i) => updated.get(i.eventId) ?? i);
}

/** Whether a log's points are confirmed by the server (false = provisional, shown as pending). */
export function isConfirmed(item: OutboxItem | undefined): boolean {
  return item?.status === 'accepted';
}
