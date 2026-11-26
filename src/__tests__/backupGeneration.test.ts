import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { createSqlStorage, SqlStateStorage } from '../storage/sqliteStorage';
import { SqlExecutor } from '../storage/migrations';
import { createFreshState, loadState, reducer } from '../store/state';
import { RemoteEvent, SyncDeps, SyncError, syncNow, SyncRemote } from '../sync/engine';
import { EventReceipt, privacyFor } from '../sync/outbox';
import type { AppState } from '../types';

/**
 * Round 13 (review B1) – deleting the cloud backup and turning it on again.
 *
 * Reproduced on main b0c7e22 (docs/review-r13/evidence/appendix-b-probes-main-b0c7e22.json):
 *  B1.1 "רק מעכשיו" still sent old pending/deferred entries;
 *  B1.2 "כל ההיסטוריה" re-sent an entry the user had deleted (its void was dropped);
 *  B1.3 live entries that came from another device were not backed up again;
 *  B1.4 the decision lived on one device only: a second phone, offline during the deletion,
 *       uploaded its old queue afterwards.
 *
 * The contract now (supabase/migrations/20261128000001_backup_generation.sql): the server keeps a
 * backup generation (epoch), a pending decision after a deletion, and the floor of "only from now".
 * Every device asks for it before sending; uploads of an old generation, uploads while the
 * decision is open and entries recorded before the floor are refused by the server itself.
 * This file runs the app's real storage and engine on real SQLite against an in-memory server
 * that follows that contract; the SQL itself is tested on PostgreSQL (scripts/db/test-db.mjs) and
 * end to end through supabase-js (src/__integration__/staging.integration.ts).
 */
const NOW = Date.UTC(2026, 10, 24, 10);
const DAY = '2026-11-24';
const HOUR = 3_600_000;

type Exec = SqlExecutor & { raw: DatabaseSync };
function sqlite(): Exec {
  const db = new DatabaseSync(':memory:');
  return {
    raw: db,
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

/** The server contract of round 13, in memory. */
class Server {
  events: RemoteEvent[] = [];
  seq = 0;
  consent = true;
  epoch = 1;
  floor: number | null = null;
  pending = false;
  offline = false;
  /** Every create the server was asked to store (accepted or not): what left the phones. */
  submittedCreates: string[] = [];
  submittedVoids: string[] = [];
  /** set_consent(false, delete=true) */
  deleteCloud() {
    this.events = [];
    this.epoch += 1;
    this.pending = true;
    this.floor = null;
    this.consent = false;
  }
  /** set_backup_scope: the first answer for a generation decides; a late second answer changes nothing. */
  decide(epoch: number, all: boolean, at: number) {
    if (epoch !== this.epoch) throw new SyncError('backup_changed');
    if (this.pending) {
      this.floor = all ? null : at;
      this.pending = false;
    }
  }
  remote(): SyncRemote {
    return {
      backupState: async () => {
        if (this.offline) throw new SyncError('offline');
        return { epoch: this.epoch, floor: this.floor, decisionPending: this.pending };
      },
      submit: async (batch, epoch) => {
        if (this.offline) throw new SyncError('offline');
        if (!this.consent) throw new SyncError('consent_required');
        if (this.pending) throw new SyncError('backup_decision_required');
        if ((epoch ?? 1) !== this.epoch) throw new SyncError('backup_changed');
        const at = new Date(NOW).toISOString();
        return batch.map((b): EventReceipt => {
          const p = JSON.parse(b.payload) as Record<string, unknown>;
          if (b.operation === 'create') this.submittedCreates.push(b.eventId);
          else this.submittedVoids.push(b.targetEventId ?? '');
          if (this.events.some((e) => e.event_id === b.eventId)) return { eventId: b.eventId, outcome: 'duplicate', serverReceivedAtUtc: at };
          if (b.operation === 'create' && !privacyFor(String(p.actionType)).cloudBackup) return { eventId: b.eventId, outcome: 'rejected', reasonCode: 'private_action', serverReceivedAtUtc: at };
          if (b.operation === 'create' && this.floor !== null && Date.parse(String(p.recordedAtUtc)) < this.floor) {
            return { eventId: b.eventId, outcome: 'rejected', reasonCode: 'before_backup_floor', serverReceivedAtUtc: at };
          }
          if (b.operation === 'void' && !this.events.some((e) => e.event_id === b.targetEventId && e.operation === 'create')) {
            return { eventId: b.eventId, outcome: 'rejected', reasonCode: 'unknown_target', serverReceivedAtUtc: at };
          }
          this.seq += 1;
          this.events.push({ seq: this.seq, event_id: b.eventId, operation: b.operation, target_event_id: b.targetEventId ?? null, action_type: (p.actionType as string) ?? null, local_date: (p.localDate as string) ?? null, payload: p });
          return { eventId: b.eventId, outcome: 'accepted', serverReceivedAtUtc: at };
        });
      },
      pull: async (after) => {
        if (this.offline) throw new SyncError('offline');
        return this.events.filter((e) => e.seq > after).slice(0, 200);
      },
    };
  }
  /** Live entries in the cloud copy: creates without a void. */
  live(): string[] {
    const voided = new Set(this.events.filter((e) => e.operation === 'void').map((e) => e.target_event_id));
    return this.events.filter((e) => e.operation === 'create' && !voided.has(e.event_id)).map((e) => e.event_id).sort();
  }
}

/** A phone: its own SQLite, the app's storage, reducer and engine. */
class Phone {
  state: AppState = createFreshState(NOW);
  storage: SqlStateStorage;
  constructor(public server: Server, public db: Exec = sqlite()) {
    this.storage = createSqlStorage(db, undefined, 'user:synthetic');
  }
  async act(key: string, at: number, extra: Record<string, unknown> = {}) {
    this.state = reducer(this.state, { type: 'addAction', payload: { key, now: at, dateKey: DAY, ...extra } as never });
    await this.storage.save(this.state);
    return this.state.logs[0]!;
  }
  async remove(id: string) {
    this.state = reducer(this.state, { type: 'removeLog', payload: { id } });
    await this.storage.save(this.state);
  }
  /** Closes the app and opens it again: a new storage on the same database, the state from disk. */
  async restart() {
    this.storage = createSqlStorage(this.db, undefined, 'user:synthetic');
    this.state = loadState(await this.storage.load());
  }
  deps(at = NOW): SyncDeps {
    return {
      listOutbox: () => this.storage.listOutbox(),
      saveOutbox: (i) => this.storage.saveOutbox(i),
      installationId: () => this.storage.installationId(),
      logs: () => this.state.logs,
      cursor: () => this.state.sync?.cursor ?? 0,
      applyRemote: (events) => {
        this.state = reducer(this.state, { type: 'applyRemoteEvents', payload: events });
      },
      persist: async () => {
        await this.storage.save(this.state);
        return true;
      },
      backup: {
        local: () => ({ epoch: this.state.sync?.backupEpoch ?? 1, floor: this.state.sync?.backupFloor ?? null }),
        rebuild: async (next) => {
          await this.storage.rebuildOutbox(next.floor);
          this.state = reducer(this.state, { type: 'backupGenerationApplied', payload: next });
          await this.storage.save(this.state);
        },
      },
      remote: this.server.remote(),
      gate: { enabled: true, consent: { cloudBackup: this.server.consent } },
      // Entries are queued with the real clock: the run happens after them (the floor is compared
      // with the time each entry was recorded, `at` of act()).
      now: () => Math.max(at, Date.now() + 1000),
    };
  }
  sync(at = NOW) {
    return syncNow(this.deps(at));
  }
}

describe('B1 – deleting the cloud backup and turning it on again', () => {
  it('B1.2 + B1.3: "all history" uploads exactly the live entries – also those from another phone – and never a deleted one', async () => {
    const server = new Server();
    const a = new Phone(server);
    const b = new Phone(server);
    const kept = await a.act('shacharit', NOW);
    const deleted = await a.act('mincha', NOW + 1000);
    const privateEntry = await a.act('visitSick', NOW + 2000);
    expect((await a.sync()).state).toBe('ok');
    await a.remove(deleted.id);
    expect((await a.sync()).state).toBe('ok'); // the void is accepted
    const fromB = await b.act('arvit', NOW + 3000);
    await b.sync();
    await a.sync(); // A now holds B's entry (remote)
    expect(a.state.logs.map((l) => l.id)).toContain(fromB.id);

    server.deleteCloud();
    server.consent = true;
    server.decide(server.epoch, true, NOW + HOUR);
    server.submittedCreates = [];
    server.submittedVoids = [];
    await b.restart(); // B is closed meanwhile: it will not upload anything for A
    b.server.offline = false;

    expect(await a.sync(NOW + HOUR)).toMatchObject({ state: 'ok' });
    expect(server.live()).toEqual([kept.id, fromB.id].sort());
    expect(server.submittedCreates).not.toContain(deleted.id);
    expect(server.submittedCreates).not.toContain(privateEntry.id);
    expect(server.submittedVoids).toEqual([]);

    // Closed and opened again: nothing old comes back, nothing is sent twice.
    await a.restart();
    server.submittedCreates = [];
    expect(await a.sync(NOW + HOUR)).toMatchObject({ state: 'ok', pushed: 0 });
    expect(server.submittedCreates).toEqual([]);
    expect(server.live()).toEqual([kept.id, fromB.id].sort());
  });

  it('B1.1: "only from now" sends no old entry – accepted, pending or deferred – also after a restart; new entries are backed up', async () => {
    const server = new Server();
    const a = new Phone(server);
    const accepted = await a.act('shacharit', NOW);
    await a.sync();
    server.offline = true;
    const pendingOld = await a.act('mincha', NOW + 1000);
    expect((await a.sync()).state).toBe('error'); // offline: stays pending
    server.offline = false;
    const deferredOld = await a.act('arvit', NOW + 2000);
    const outbox = await a.storage.listOutbox();
    await a.storage.saveOutbox(outbox.filter((o) => o.eventId === deferredOld.id).map((o) => ({ ...o, status: 'deferred', attempts: 1, nextAttemptAt: NOW })));

    server.deleteCloud();
    server.consent = true;
    const floor = NOW + HOUR;
    server.decide(server.epoch, false, floor);
    const fresh = await a.act('torahStudy', floor + 60_000);

    expect(await a.sync(floor + 120_000)).toMatchObject({ state: 'ok' });
    expect(server.submittedCreates.filter((id) => id !== accepted.id)).toEqual([fresh.id]);
    expect(server.live()).toEqual([fresh.id]);

    // The choice lasts: after closing and opening the app, nothing old is queued or sent again.
    await a.restart();
    server.submittedCreates = [];
    expect(await a.sync(floor + 180_000)).toMatchObject({ state: 'ok', pushed: 0 });
    expect(server.submittedCreates).toEqual([]);
    const after = await a.storage.listOutbox();
    for (const id of [accepted.id, pendingOld.id, deferredOld.id]) {
      expect(after.find((o) => o.eventId === id)).toMatchObject({ status: 'rejected', reasonCode: 'before_backup_floor' });
    }
    // The entries themselves stay on the phone.
    expect(a.state.logs.map((l) => l.id).sort()).toEqual([accepted.id, pendingOld.id, deferredOld.id, fresh.id].sort());
  });

  it('B1.4: a second phone, offline during the deletion, cannot upload its old queue after "only from now"', async () => {
    const server = new Server();
    const a = new Phone(server);
    const b = new Phone(server);
    await a.act('shacharit', NOW);
    await a.sync();
    const oldOnB = await b.act('mincha', NOW + 1000); // B never got online with it

    server.deleteCloud();
    server.consent = true;
    const floor = NOW + HOUR;
    server.decide(server.epoch, false, floor);
    await a.sync(floor + 1000);

    // B comes online later; its local data does not know about the deletion.
    const newOnB = await b.act('arvit', floor + 5000);
    expect(await b.sync(floor + 10_000)).toMatchObject({ state: 'ok' });
    expect(server.submittedCreates).not.toContain(oldOnB.id);
    expect(server.live()).toEqual([newOnB.id]);
    // B keeps its own entry on the phone.
    expect(b.state.logs.map((l) => l.id)).toContain(oldOnB.id);
  });

  it('"all history" chosen on one phone: the second phone re-uploads its live entries once, deleted ones never', async () => {
    const server = new Server();
    const a = new Phone(server);
    const b = new Phone(server);
    const shared = await a.act('shacharit', NOW);
    await a.sync();
    await b.sync(); // B has A's entry
    const onlyB = await b.act('mincha', NOW + 1000);
    const removedOnB = await b.act('arvit', NOW + 2000);
    await b.sync();
    await b.remove(removedOnB.id);
    // B goes offline before its void is sent; the cloud copy is deleted meanwhile.
    server.deleteCloud();
    server.consent = true;
    server.decide(server.epoch, true, NOW + HOUR);
    await a.sync(NOW + HOUR);
    expect(await b.sync(NOW + HOUR + 1000)).toMatchObject({ state: 'ok' });
    expect(server.live()).toEqual([shared.id, onlyB.id].sort());
    expect(server.submittedCreates.filter((id) => id === removedOnB.id)).toHaveLength(1); // only the first, original upload
  });

  it('while the decision is open, nothing is sent from any phone, and the app says a choice is needed', async () => {
    const server = new Server();
    const a = new Phone(server);
    await a.act('shacharit', NOW);
    server.deleteCloud();
    server.consent = true;
    server.submittedCreates = [];
    expect(await a.sync()).toEqual({ state: 'decision-needed' });
    expect(server.submittedCreates).toEqual([]);
  });

  it('private actions stay on the phone on every path (rebuild for "all", for "only from now", and after a restart)', async () => {
    for (const all of [true, false]) {
      const server = new Server();
      const a = new Phone(server);
      await a.act('visitSick', NOW);
      await a.act('shacharit', NOW + 1);
      await a.sync();
      server.deleteCloud();
      server.consent = true;
      server.decide(server.epoch, all, NOW);
      await a.act('visitSick', NOW + HOUR);
      await a.sync(NOW + HOUR + 1);
      await a.restart();
      await a.sync(NOW + HOUR + 2);
      const sentActions = server.events.filter((e) => e.operation === 'create').map((e) => e.action_type);
      expect(sentActions).not.toContain('visitSick');
      expect((await a.storage.listOutbox()).some((o) => o.operation === 'create' && JSON.parse(o.payload).actionType === 'visitSick')).toBe(false);
    }
  });

  it('a phone that uploads with the old generation is refused by the server (not only by the app)', async () => {
    const server = new Server();
    const remote = server.remote();
    server.deleteCloud();
    server.consent = true;
    server.decide(server.epoch, true, NOW);
    await expect(remote.submit([], 1)).rejects.toMatchObject({ code: 'backup_changed' });
  });
});
