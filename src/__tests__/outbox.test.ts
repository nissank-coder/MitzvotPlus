import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import {
  applyReceipt, applyTransportFailure, BACKOFF_MAX_MS, canonicalJson, DEFAULT_DEFER_MS, dueItems, EventReceipt,
  newCreateItem, OutboxItem, syncOnce, SyncTransport, undoPlan,
} from '../sync/outbox';
import { SqlExecutor } from '../storage/migrations';
import { createSqlStorage } from '../storage/sqliteStorage';
import { createFreshState, reducer } from '../store/state';
import { AppState } from '../types';

const NOW = Date.UTC(2026, 10, 24, 10);
const rcpt = (eventId: string, outcome: EventReceipt['outcome'], extra: Partial<EventReceipt> = {}): EventReceipt => ({
  eventId, outcome, serverReceivedAtUtc: new Date(NOW).toISOString(), ...extra,
});
const item = (id: string, extra: Partial<OutboxItem> = {}): OutboxItem => ({
  eventId: id, operation: 'create', payload: '{}', status: 'pending', attempts: 0, nextAttemptAt: NOW, updatedAt: NOW, ...extra,
});

function sqlite(db = new DatabaseSync(':memory:'), failOn?: RegExp): SqlExecutor & { db: DatabaseSync } {
  return {
    db,
    execute: async (sql) => void db.exec(sql),
    query: async <T,>(sql: string, values: unknown[] = []) => db.prepare(sql).all(...(values as never[])) as T[],
    transaction: async (statements) => {
      db.exec('BEGIN');
      try {
        for (const s of statements) {
          if (failOn && failOn.test(s.sql)) throw new Error('simulated crash mid-transaction');
          db.prepare(s.sql).run(...((s.values ?? []) as never[]));
        }
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
  };
}

describe('frozen payloads', () => {
  it('canonical JSON is independent of key order and drops undefined', () => {
    expect(canonicalJson({ b: 1, a: { d: undefined, c: [2, { z: 1, y: 2 }] } })).toBe('{"a":{"c":[2,{"y":2,"z":1}]},"b":1}');
  });

  it('the create payload carries no client points', () => {
    const s = reducer(createFreshState(NOW), { type: 'addAction', payload: { key: 'shacharit', minyan: true, now: NOW } });
    const payload = JSON.parse(newCreateItem(s.logs[0]!, 'inst-1', NOW).payload);
    expect(payload).toMatchObject({ eventId: s.logs[0]!.id, installationId: 'inst-1', operation: 'create', actionType: 'shacharit', minyan: true });
    expect(payload.points).toBeUndefined();
  });
});

describe('receipts', () => {
  it('accepted and duplicate are terminal; replay does not change them', () => {
    const a = applyReceipt(item('e1'), rcpt('e1', 'accepted', { authoritativeScoreDelta: 40 }), NOW);
    expect(a).toMatchObject({ status: 'accepted', acceptedScoreDelta: 40, attempts: 1 });
    expect(applyReceipt(a, rcpt('e1', 'accepted', { authoritativeScoreDelta: 40 }), NOW + 1)).toBe(a);
    expect(applyReceipt(item('e2'), rcpt('e2', 'duplicate'), NOW).status).toBe('accepted');
  });

  it('rejected is terminal with its reason kept', () => {
    expect(applyReceipt(item('e1'), rcpt('e1', 'rejected', { reasonCode: 'cap_reached' }), NOW)).toMatchObject({ status: 'rejected', reasonCode: 'cap_reached' });
  });

  it('deferred is retried after retryAfter – never parked forever', () => {
    const until = NOW + 30 * 3_600_000;
    const d = applyReceipt(item('e1'), rcpt('e1', 'deferred', { retryAfterUtc: new Date(until).toISOString(), reasonCode: 'sabbath_intake' }), NOW);
    expect(d).toMatchObject({ status: 'deferred', nextAttemptAt: until });
    expect(dueItems([d], until - 1)).toHaveLength(0);
    expect(dueItems([d], until)).toHaveLength(1);
    // Missing or past retryAfter: re-check after the default delay.
    expect(applyReceipt(item('e2'), rcpt('e2', 'deferred'), NOW).nextAttemptAt).toBe(NOW + DEFAULT_DEFER_MS);
    // A deferred item can still become accepted later.
    expect(applyReceipt(d, rcpt('e1', 'accepted'), until).status).toBe('accepted');
  });

  it('transport failure backs off with bounded jitter and never rejects', () => {
    let i = item('e1');
    for (let n = 0; n < 30; n += 1) i = applyTransportFailure(i, NOW, () => 0.999);
    expect(i.status).toBe('pending');
    expect(i.nextAttemptAt - NOW).toBeLessThanOrEqual(BACKOFF_MAX_MS);
    expect(applyTransportFailure(item('e2'), NOW, () => 0).nextAttemptAt).toBe(NOW);
  });
});

describe('ordering and voids', () => {
  it('a void waits until its target is terminal', () => {
    const create = item('e1', { attempts: 1, nextAttemptAt: NOW + 60_000 });
    const v = item('void:e1', { operation: 'void', targetEventId: 'e1' });
    expect(dueItems([create, v], NOW).map((i) => i.eventId)).toEqual([]);
    expect(dueItems([{ ...create, status: 'accepted' }, v], NOW).map((i) => i.eventId)).toEqual(['void:e1']);
  });

  it('undo before sending drops locally; after sending it becomes a void', () => {
    expect(undoPlan(item('e1'))).toBe('drop-local');
    expect(undoPlan(item('e1', { attempts: 1 }))).toBe('enqueue-void');
    expect(undoPlan(item('e1', { status: 'accepted', attempts: 1 }))).toBe('enqueue-void');
    expect(undoPlan(item('e1', { status: 'rejected', attempts: 1 }))).toBe('drop-local');
  });

  it('syncOnce: missing receipts and thrown errors are retried, not dropped', async () => {
    const items = [item('a'), item('b')];
    const partial: SyncTransport = { submit: async () => [rcpt('a', 'accepted')] };
    const after = await syncOnce(items, partial, NOW, () => 0.5);
    expect(after.map((i) => i.status)).toEqual(['accepted', 'pending']);
    const failing: SyncTransport = { submit: async () => { throw new Error('offline'); } };
    const after2 = await syncOnce(after, failing, NOW + BACKOFF_MAX_MS, () => 0.5);
    expect(after2.map((i) => i.status)).toEqual(['accepted', 'pending']);
    expect(after2[1]!.attempts).toBe(2);
  });
});

describe('SQLite outbox', () => {
  const add = (s: AppState, key: 'chesed' | 'parents', now: number) => reducer(s, { type: 'addAction', payload: { key, now } });

  it('writes the outbox row in the same transaction as the activity', async () => {
    const exec = sqlite();
    const storage = createSqlStorage(exec);
    const s = add(createFreshState(NOW), 'chesed', NOW);
    await storage.save(s);
    const ob = await storage.listOutbox();
    expect(ob).toHaveLength(1);
    expect(ob[0]).toMatchObject({ eventId: s.logs[0]!.id, operation: 'create', status: 'pending' });
    expect(JSON.parse(ob[0]!.payload).installationId).toBe(await storage.installationId());
  });

  it('a crash mid-transaction leaves neither the activity nor its outbox row (M10)', async () => {
    const db = new DatabaseSync(':memory:');
    await createSqlStorage(sqlite(db)).save(createFreshState(NOW)); // migrate
    const crashing = createSqlStorage(sqlite(db, /INSERT INTO activities/));
    const s = add(createFreshState(NOW), 'chesed', NOW);
    await expect(crashing.save(s)).rejects.toThrow('simulated crash');
    expect(db.prepare('SELECT COUNT(*) AS n FROM outbox').get()).toEqual({ n: 0 });
    expect(db.prepare('SELECT COUNT(*) AS n FROM activities').get()).toEqual({ n: 0 });
    // The next save (after restart) writes both.
    const healthy = createSqlStorage(sqlite(db));
    await healthy.save(s);
    expect(db.prepare('SELECT COUNT(*) AS n FROM outbox').get()).toEqual({ n: 1 });
    expect(db.prepare('SELECT COUNT(*) AS n FROM activities').get()).toEqual({ n: 1 });
  });

  it('undo: unsent → dropped; sent → void queued; receipts persist', async () => {
    const exec = sqlite();
    const storage = createSqlStorage(exec);
    let s = add(add(createFreshState(NOW), 'chesed', NOW), 'chesed', NOW + 1);
    await storage.save(s);
    const [first, second] = await storage.listOutbox();
    // The first one was attempted (e.g. deferred by the server).
    await storage.saveOutbox([applyReceipt(first!, rcpt(first!.eventId, 'deferred'), NOW + 2)]);
    s = reducer(s, { type: 'removeLog', payload: { id: first!.eventId } });
    s = reducer(s, { type: 'removeLog', payload: { id: second!.eventId } });
    await storage.save(s);
    const ob = await storage.listOutbox();
    expect(ob.map((i) => i.eventId).sort()).toEqual([first!.eventId, `void:${first!.eventId}`].sort());
    expect(ob.find((i) => i.operation === 'void')).toMatchObject({ targetEventId: first!.eventId, status: 'pending' });
  });

  it('activities saved before migration 2 get their create event once', async () => {
    const db = new DatabaseSync(':memory:');
    const exec = sqlite(db);
    await createSqlStorage(exec).save(add(createFreshState(NOW), 'chesed', NOW));
    db.exec('DELETE FROM outbox');
    expect((await createSqlStorage(sqlite(db)).listOutbox())).toHaveLength(1);
    expect((await createSqlStorage(sqlite(db)).listOutbox())).toHaveLength(1);
  });

  it('the speech timer never reaches the outbox', async () => {
    const exec = sqlite();
    const storage = createSqlStorage(exec);
    let s = reducer(createFreshState(NOW), { type: 'startSpeech', now: NOW });
    s = reducer(s, { type: 'resetSpeech', now: NOW + 86_400_000 });
    await storage.save(s);
    expect(await storage.listOutbox()).toHaveLength(0);
  });
});

describe('secure store partitions', async () => {
  const { memorySecureStore, fullKey } = await import('../native/secureStore');
  it('keeps accounts apart and clears one partition only', async () => {
    const s = memorySecureStore();
    await s.set('guest', 'token', 'g');
    await s.set('acct-a', 'token', 'a');
    await s.set('acct-b', 'token', 'b');
    await s.clearPartition('acct-a');
    expect(await s.get('acct-a', 'token')).toBeNull();
    expect(await s.get('acct-b', 'token')).toBe('b');
    expect(await s.get('guest', 'token')).toBe('g');
  });
  it('rejects partition names that could collide', () => {
    expect(() => fullKey('a::b', 'x')).toThrow();
    expect(() => fullKey('', 'x')).toThrow();
  });
});

describe('S10-02 privacy: the queue is default-deny', () => {
  const addKey = (s: AppState, key: AddKey, now: number) => reducer(s, { type: 'addAction', payload: { key, now } });
  type AddKey = Parameters<typeof reducer>[1] extends infer A ? (A extends { type: 'addAction'; payload: { key: infer K } } ? K : never) : never;

  it.each(['speechPractice', 'cleanSpeech', 'charity', 'visitSick'] as const)('%s never enters the outbox (new entry)', async (key) => {
    const exec = sqlite();
    const storage = createSqlStorage(exec);
    await storage.save(addKey(createFreshState(NOW), key, NOW));
    expect(await storage.listOutbox()).toHaveLength(0);
    // The activity itself is kept locally.
    expect((await exec.query<{ id: string }>('SELECT id FROM activities;')).length).toBe(1);
  });

  it('private rows already queued (never sent) are removed from the queue on upgrade and not recreated; activities stay', async () => {
    const db = new DatabaseSync(':memory:');
    let s = addKey(createFreshState(NOW), 'speechPractice', NOW);
    s = addKey(s, 'chesed', NOW + 1);
    await createSqlStorage(sqlite(db)).save(s);
    // Simulate a queue written by an older version (before the policy existed).
    const priv = s.logs.find((l) => l.actionKey === 'speechPractice')!;
    db.prepare("INSERT INTO outbox (event_id, operation, payload, status, attempts, next_attempt_at, updated_at) VALUES (?, 'create', '{}', 'pending', 0, 0, 0)").run(priv.id);
    const upgraded = createSqlStorage(sqlite(db));
    const ob = await upgraded.listOutbox();
    expect(ob.map((o) => o.eventId)).toEqual([s.logs.find((l) => l.actionKey === 'chesed')!.id]);
    expect((await createSqlStorage(sqlite(db)).listOutbox()).map((o) => o.eventId)).not.toContain(priv.id);
    expect(db.prepare('SELECT COUNT(*) AS n FROM activities').get()).toEqual({ n: 2 });
  });

  it('deleting a private entry leaves nothing behind in the queue', async () => {
    const exec = sqlite();
    const storage = createSqlStorage(exec);
    let s = addKey(createFreshState(NOW), 'speechPractice', NOW);
    await storage.save(s);
    s = reducer(s, { type: 'removeLog', payload: { id: s.logs[0]!.id } });
    await storage.save(s);
    expect(await storage.listOutbox()).toHaveLength(0);
    expect((await exec.query('SELECT id FROM activities;')).length).toBe(0);
  });

  it('the policy is an explicit allowlist: unknown actions stay local', async () => {
    const { syncPolicy } = await import('../sync/outbox');
    expect(syncPolicy({ actionKey: 'shacharit' } as never)).toBe('sync-with-consent');
    expect(syncPolicy({ actionKey: 'speechPractice' } as never)).toBe('local-only');
    expect(syncPolicy({ actionKey: 'somethingNew' } as never)).toBe('local-only');
  });
});
