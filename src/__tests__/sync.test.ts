import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { createSqlStorage, SqlStateStorage } from '../storage/sqliteStorage';
import { SqlExecutor } from '../storage/migrations';
import { createFreshState, reducer } from '../store/state';
import { computeDerived } from '../store/derived';
import { RemoteEvent, SyncError, syncNow, SyncRemote } from '../sync/engine';
import { canonicalJson, EventReceipt, privacyFor } from '../sync/outbox';
import type { AppState } from '../types';

/**
 * Round 12 – two-way sync. Two devices, each with its own real SQLite database (node:sqlite),
 * against an in-memory server that follows the contract of supabase/migrations (submit_events /
 * pull_events): idempotent by event id, private actions refused, consent required, deleted account.
 * The SQL implementation itself is tested on PostgreSQL in scripts/db/test-db.mjs.
 */
const NOW = Date.UTC(2026, 10, 24, 10);
const DAY = '2026-11-24';

function sqlite(): SqlExecutor {
  const db = new DatabaseSync(':memory:');
  return {
    execute: async (sql) => void db.exec(sql),
    query: async <T,>(sql: string, values: unknown[] = []) => db.prepare(sql).all(...(values as never[])) as T[],
    transaction: async (statements) => {
      db.exec('BEGIN');
      try {
        for (const s of statements) db.prepare(s.sql).run(...((s.values ?? []) as never[]));
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
  };
}

class FakeServer {
  events: RemoteEvent[] = [];
  seq = 0;
  consent = true;
  deleted = false;
  offline = false;
  loseNextResponse = false;
  submits = 0;
  remote(): SyncRemote {
    return {
      submit: async (batch) => {
        if (this.offline) throw new SyncError('offline');
        if (this.deleted) throw new SyncError('account_deleted');
        if (!this.consent) throw new SyncError('consent_required');
        this.submits += 1;
        const receipts: EventReceipt[] = batch.map((b) => {
          const p = JSON.parse(b.payload) as Record<string, unknown>;
          const at = new Date(NOW).toISOString();
          if (this.events.some((e) => e.event_id === b.eventId)) return { eventId: b.eventId, outcome: 'duplicate', serverReceivedAtUtc: at };
          if (b.operation === 'create' && !privacyFor(String(p.actionType)).cloudBackup) return { eventId: b.eventId, outcome: 'rejected', reasonCode: 'private_action', serverReceivedAtUtc: at };
          this.seq += 1;
          this.events.push({ seq: this.seq, event_id: b.eventId, operation: b.operation, target_event_id: b.targetEventId ?? null, action_type: (p.actionType as string) ?? null, local_date: (p.localDate as string) ?? null, payload: p });
          return { eventId: b.eventId, outcome: 'accepted', serverReceivedAtUtc: at };
        });
        if (this.loseNextResponse) {
          this.loseNextResponse = false;
          throw new SyncError('offline', 'response lost');
        }
        return receipts;
      },
      pull: async (after) => {
        if (this.offline) throw new SyncError('offline');
        if (this.deleted) throw new SyncError('account_deleted');
        return this.events.filter((e) => e.seq > after).slice(0, 200);
      },
    };
  }
}

class Device {
  state: AppState = createFreshState(NOW);
  storage: SqlStateStorage = createSqlStorage(sqlite());
  constructor(public server: FakeServer) {}
  async act(key: Parameters<typeof reducer>[1] extends infer A ? (A extends { type: 'addAction'; payload: { key: infer K } } ? K : never) : never, extra: Record<string, unknown> = {}) {
    this.state = reducer(this.state, { type: 'addAction', payload: { key, now: NOW + Math.floor(Math.random() * 1000), dateKey: DAY, ...extra } });
    await this.storage.save(this.state);
    return this.state.logs[0]!;
  }
  async remove(id: string) {
    this.state = reducer(this.state, { type: 'removeLog', payload: { id } });
    await this.storage.save(this.state);
  }
  async sync(consent = true) {
    const status = await syncNow({
      listOutbox: () => this.storage.listOutbox(),
      saveOutbox: (i) => this.storage.saveOutbox(i),
      installationId: () => this.storage.installationId(),
      logs: () => this.state.logs,
      cursor: () => this.state.sync?.cursor ?? 0,
      applyRemote: (events) => {
        this.state = reducer(this.state, { type: 'applyRemoteEvents', payload: events });
      },
      remote: this.server.remote(),
      gate: { enabled: true, consent: { cloudBackup: consent } },
      now: () => Date.now() + 60_000,
    });
    await this.storage.save(this.state);
    return status;
  }
  points() {
    return computeDerived(this.state, DAY).todayPoints;
  }
}

describe('round 12 sync', () => {
  it('guest → account: everything recorded before signing in is uploaded once', async () => {
    const server = new FakeServer();
    const a = new Device(server);
    await a.act('shacharit', { minyan: true });
    await a.act('blessing', { category: 'other' });
    expect(await a.sync()).toMatchObject({ state: 'ok', pushed: 2 });
    expect(server.events).toHaveLength(2);
    expect(await a.sync()).toMatchObject({ state: 'ok', pushed: 0 });
    expect(server.events).toHaveLength(2);
  });

  it('a lost server response: resending gives "duplicate", no second copy, no double points', async () => {
    const server = new FakeServer();
    const a = new Device(server);
    await a.act('chesed');
    server.loseNextResponse = true;
    expect((await a.sync()).state).toBe('ok'); // push failed silently (backoff), pull ok
    expect(server.events).toHaveLength(1);
    const outbox = await a.storage.listOutbox();
    expect(outbox[0]!.status).toBe('pending');
    await a.storage.saveOutbox(outbox.map((o) => ({ ...o, nextAttemptAt: 0 })));
    await a.sync();
    expect(server.events).toHaveLength(1);
    expect((await a.storage.listOutbox())[0]!.status).toBe('accepted');
    expect(a.points()).toBe(15);
  });

  it('two devices: entries flow both ways; a deletion on one device removes it on the other, without echo', async () => {
    const server = new FakeServer();
    const a = new Device(server);
    const b = new Device(server);
    const shacharit = await a.act('shacharit');
    await a.sync();
    await b.act('torahStudy');
    await b.sync();
    expect(b.state.logs.map((l) => l.actionKey).sort()).toEqual(['shacharit', 'torahStudy']);
    await a.sync();
    expect(a.state.logs.map((l) => l.actionKey).sort()).toEqual(['shacharit', 'torahStudy']);
    // b deletes a's prayer
    await b.remove(shacharit.id);
    await b.sync();
    const voids = server.events.filter((e) => e.operation === 'void');
    expect(voids).toHaveLength(1);
    await a.sync();
    expect(a.state.logs.map((l) => l.actionKey)).toEqual(['torahStudy']);
    expect(server.events.filter((e) => e.operation === 'void')).toHaveLength(1); // a did not send it back
    expect(await a.storage.listOutbox()).not.toContainEqual(expect.objectContaining({ operation: 'void', status: 'pending' }));
  });

  it('the same once-a-day prayer on two devices: kept in both journals, scored once', async () => {
    const server = new FakeServer();
    const a = new Device(server);
    const b = new Device(server);
    await a.act('shacharit');
    await b.act('shacharit');
    await a.sync();
    await b.sync();
    await a.sync();
    expect(a.state.logs.filter((l) => l.actionKey === 'shacharit')).toHaveLength(2);
    expect(a.points()).toBe(25);
    expect(b.points()).toBe(25);
  });

  it('private actions never reach the server, even through an old queue row', async () => {
    const server = new FakeServer();
    const a = new Device(server);
    await a.act('speechPractice');
    await a.act('charity');
    await a.sync();
    expect(server.events).toHaveLength(0);
  });

  it('without consent nothing is sent; revoking consent stops sync', async () => {
    const server = new FakeServer();
    const a = new Device(server);
    await a.act('chesed');
    expect((await a.sync(false)).state).toBe('consent-needed');
    expect(server.events).toHaveLength(0);
    server.consent = false; // revoked on the server from another device
    expect(await a.sync(true)).toMatchObject({ state: 'error', code: 'consent_required' });
    expect(server.events).toHaveLength(0);
  });

  it('offline: nothing is lost; everything goes up when the network returns', async () => {
    const server = new FakeServer();
    const a = new Device(server);
    server.offline = true;
    await a.act('chesed');
    await a.act('parents');
    expect((await a.sync()).state).toBe('error');
    server.offline = false;
    const ob = await a.storage.listOutbox();
    await a.storage.saveOutbox(ob.map((o) => ({ ...o, nextAttemptAt: 0 })));
    await a.sync();
    expect(server.events).toHaveLength(2);
  });

  it('a deleted account is not recreated by an old offline device; local data stays on the device', async () => {
    const server = new FakeServer();
    const old = new Device(server);
    await old.act('chesed');
    server.deleted = true;
    expect((await old.sync()).state).toBe('account-deleted');
    expect(server.events).toHaveLength(0);
    expect(old.state.logs).toHaveLength(1);
  });

  it('schema v1 items that never left the device are re-encoded without the city', async () => {
    const server = new FakeServer();
    const a = new Device(server);
    const log = await a.act('shacharit');
    const [item] = await a.storage.listOutbox();
    const v1 = { ...JSON.parse(item!.payload), schemaVersion: 1, calendarContext: { cityId: 'jerusalem', tzid: 'Asia/Jerusalem' } };
    await a.storage.saveOutbox([{ ...item!, payload: canonicalJson(v1) }]);
    await a.sync();
    const sent = server.events.find((e) => e.event_id === log.id)!;
    expect(sent.payload.schemaVersion).toBe(2);
    expect(JSON.stringify(sent.payload)).not.toContain('jerusalem');
  });
});
