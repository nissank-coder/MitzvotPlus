import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { createSqlSpaces, createSqlStorage, GUEST_SPACE, SqlStateStorage, userSpace } from '../storage/sqliteStorage';
import { MIGRATIONS, runMigrations, SqlExecutor } from '../storage/migrations';
import { localStorageSpaces, LEGACY_STORAGE_KEY } from '../storage/persistence';
import { createFreshState, loadState, reducer } from '../store/state';
import { RemoteEvent, SyncError, syncNow, SyncDeps, SyncRemote } from '../sync/engine';
import { createSyncCoordinator } from '../sync/coordinator';
import { EventReceipt } from '../sync/outbox';
import type { AppState } from '../types';

/**
 * Round 12.5 – P0 findings of the independent review:
 *  - one database, history, queue and cursor for everybody → a data space per account;
 *  - remote entries queued again after a restart; a failed push shown as "synced"; a run applying
 *    a response after sign-out; only 50 items per run; sync starting while local saving fails.
 */
const NOW = Date.UTC(2026, 10, 24, 10);
const DAY = '2026-11-24';
const A = userSpace('aaaaaaaa-0000-4000-8000-000000000001');
const B = userSpace('bbbbbbbb-0000-4000-8000-000000000002');

function sqlite(db = new DatabaseSync(':memory:'), failOn?: RegExp): SqlExecutor & { raw: DatabaseSync; fail: { on: RegExp | undefined } } {
  const fail = { on: failOn };
  return {
    raw: db,
    fail,
    execute: async (sql) => void db.exec(sql),
    query: async <T,>(sql: string, values: unknown[] = []) => db.prepare(sql).all(...(values as never[])) as T[],
    transaction: async (statements) => {
      db.exec('BEGIN');
      try {
        for (const s of statements) {
          if (fail.on && fail.on.test(s.sql)) throw new Error('disk I/O error (simulated)');
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

const add = (s: AppState, key: string, i = 0, extra: Record<string, unknown> = {}) =>
  reducer(s, { type: 'addAction', payload: { key, now: NOW + i * 1000, dateKey: DAY, ...extra } as never });

const loaded = async (st: SqlStateStorage | { load: () => Promise<string | null> }) => {
  const raw = await st.load();
  return raw ? loadState(raw) : null;
};

describe('data spaces: migration of the existing database', () => {
  it('existing data (schema v2) becomes the guest\'s – nothing is guessed, nothing lost, same installation id', async () => {
    const ex = sqlite();
    await runMigrations(ex, MIGRATIONS.filter((m) => m.version <= 2));
    let s = add(add(createFreshState(NOW), 'chesed', 0), 'shacharit', 1);
    s = { ...s, userName: 'דני', sync: { cursor: 42, remoteRemoved: [], lastSyncAt: NOW } };
    const { logs, ...rest } = s;
    ex.raw.prepare('INSERT INTO kv (key, value, updated_at) VALUES (?, ?, 0)').run('app_state', JSON.stringify(rest));
    ex.raw.prepare('INSERT INTO kv (key, value, updated_at) VALUES (?, ?, 0)').run('installation_id', 'inst-legacy-0001');
    for (const l of logs) ex.raw.prepare('INSERT INTO activities (id, date_key, created_at, action_key, points_local, payload) VALUES (?, ?, ?, ?, ?, ?)').run(l.id, l.dateKey, l.createdAt, l.actionKey ?? null, l.points, JSON.stringify(l));
    ex.raw.prepare("INSERT INTO outbox (event_id, operation, payload, status, attempts, next_attempt_at, updated_at) VALUES (?, 'create', '{}', 'accepted', 1, 0, 0)").run(logs[0]!.id);

    const spaces = createSqlSpaces(ex);
    expect(await spaces.active()).toBe(GUEST_SPACE);
    const guest = await loaded(await spaces.open(GUEST_SPACE));
    expect(guest?.userName).toBe('דני');
    expect(guest?.logs.map((l) => l.id).sort()).toEqual(logs.map((l) => l.id).sort());
    expect(await (await spaces.open(GUEST_SPACE) as SqlStateStorage).installationId()).toBe('inst-legacy-0001');
    expect((await (await spaces.open(GUEST_SPACE) as SqlStateStorage).listOutbox()).find((o) => o.eventId === logs[0]!.id)?.status).toBe('accepted');
    expect(await loaded(await spaces.open(A))).toBeNull(); // no account inherits anything
    expect(ex.raw.prepare("SELECT COUNT(*) AS n FROM activities WHERE space <> 'guest'").get()).toEqual({ n: 0 });
  });
});

describe('data spaces: isolation', () => {
  it('guest, account A and account B each have their own history, settings and queue', async () => {
    const spaces = createSqlSpaces(sqlite());
    const guest = await spaces.open(GUEST_SPACE) as SqlStateStorage;
    const a = await spaces.open(A) as SqlStateStorage;
    const b = await spaces.open(B) as SqlStateStorage;
    await guest.save(add(add({ ...createFreshState(NOW), userName: 'אורח' }, 'chesed', 0), 'chesed', 1));
    await a.save(add({ ...createFreshState(NOW), userName: 'A' }, 'shacharit', 2));
    expect((await loaded(guest))?.logs).toHaveLength(2);
    expect((await loaded(a))?.userName).toBe('A');
    expect((await loaded(a))?.logs).toHaveLength(1);
    expect(await loaded(b)).toBeNull();
    expect(await guest.listOutbox()).toHaveLength(2);
    expect(await a.listOutbox()).toHaveLength(1);
    expect(await b.listOutbox()).toHaveLength(0);
    // Deleting in one space never touches another (same ids are impossible, but rows are scoped).
    await a.save({ ...(await loaded(a))!, logs: [] });
    expect((await loaded(guest))?.logs).toHaveLength(2);
  });

  it('signing out (back to the guest) does not turn the account\'s data into guest history; signing in again restores it', async () => {
    const spaces = createSqlSpaces(sqlite());
    const a = await spaces.open(A);
    await a.save(add(createFreshState(NOW), 'shacharit'));
    await spaces.setActive(GUEST_SPACE);
    expect(await spaces.active()).toBe(GUEST_SPACE);
    expect(await loaded(await spaces.open(GUEST_SPACE))).toBeNull();
    expect(await spaces.count(GUEST_SPACE)).toBe(0);
    await spaces.setActive(A);
    expect((await loaded(await spaces.open(A)))?.logs).toHaveLength(1);
  });

  it('sign-out with "delete from this device" removes only that account\'s space', async () => {
    const spaces = createSqlSpaces(sqlite());
    await (await spaces.open(GUEST_SPACE)).save(add(createFreshState(NOW), 'chesed'));
    await (await spaces.open(A)).save(add(createFreshState(NOW), 'shacharit'));
    await (await spaces.open(B)).save(add(createFreshState(NOW), 'mincha'));
    await spaces.deleteSpace(A);
    expect(await spaces.count(A)).toBe(0);
    expect(await loaded(await spaces.open(A))).toBeNull();
    expect(await spaces.count(GUEST_SPACE)).toBe(1);
    expect(await spaces.count(B)).toBe(1);
  });

  it('guest → account (confirmed) when the account is new: everything moves, the queue starts over for the account', async () => {
    const ex = sqlite();
    const spaces = createSqlSpaces(ex);
    let g = add(add({ ...createFreshState(NOW), userName: 'אורח', dailyGoal: 9 }, 'chesed', 0), 'speechPractice', 1);
    // An entry that a round-12 build had pulled from an unknown account: it moves, but as a local entry.
    g = { ...g, logs: [{ ...g.logs.find((l) => l.actionKey === 'chesed')!, id: 'log-remote-legacy-1', remote: true }, ...g.logs], sync: { cursor: 99, remoteRemoved: ['x'], lastSyncAt: NOW } };
    const guest = await spaces.open(GUEST_SPACE);
    await guest.save(g);
    expect(await spaces.transfer(GUEST_SPACE, A)).toEqual({ moved: 3, whole: true });
    const a = await spaces.open(A) as SqlStateStorage;
    const state = (await loaded(a))!;
    expect(state.userName).toBe('אורח');
    expect(state.dailyGoal).toBe(9);
    expect(state.logs).toHaveLength(3);
    expect(state.logs.every((l) => !l.remote)).toBe(true);
    expect(state.sync).toMatchObject({ cursor: 0, remoteRemoved: [] });
    const ob = await a.listOutbox();
    expect(ob.map((o) => o.status)).toEqual(['pending', 'pending']); // the private one is not queued
    expect(ob.every((o) => o.attempts === 0)).toBe(true);
    expect(await spaces.count(GUEST_SPACE)).toBe(0);
    expect(await loaded(await createSqlSpaces(ex).open(GUEST_SPACE))).toBeNull();
  });

  it('guest → an account that already has data: only the entries are added, the account keeps its settings', async () => {
    const spaces = createSqlSpaces(sqlite());
    await (await spaces.open(A)).save(add({ ...createFreshState(NOW), userName: 'A', dailyGoal: 20 }, 'shacharit', 0));
    await (await spaces.open(GUEST_SPACE)).save(add({ ...createFreshState(NOW), userName: 'אורח', dailyGoal: 3 }, 'chesed', 1));
    expect(await spaces.transfer(GUEST_SPACE, A)).toEqual({ moved: 1, whole: false });
    const a = (await loaded(await spaces.open(A)))!;
    expect(a.userName).toBe('A');
    expect(a.dailyGoal).toBe(20);
    expect(a.logs.map((l) => l.actionKey).sort()).toEqual(['chesed', 'shacharit']);
  });

  it('nothing moves from account A to account B: switching gives B its own (empty) space', async () => {
    const spaces = createSqlSpaces(sqlite());
    await (await spaces.open(A)).save(add(createFreshState(NOW), 'shacharit'));
    await spaces.setActive(B);
    expect(await loaded(await spaces.open(B))).toBeNull();
    expect(await spaces.count(A)).toBe(1);
  });

  it('browser storage follows the same rules (web / development builds)', async () => {
    const mem = new Map<string, string>();
    const store = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) };
    mem.set(LEGACY_STORAGE_KEY, JSON.stringify(add({ ...createFreshState(NOW), userName: 'אורח' }, 'chesed')));
    const spaces = localStorageSpaces(store);
    expect(await spaces.count('guest')).toBe(1); // existing data = the guest's
    expect(await (await spaces.open(A)).load()).toBeNull();
    expect(await spaces.transfer('guest', A)).toEqual({ moved: 1, whole: true });
    expect(await (await spaces.open('guest')).load()).toBeNull();
    expect(loadState(await (await spaces.open(A)).load()).userName).toBe('אורח');
    await spaces.deleteSpace(A);
    expect(await (await spaces.open(A)).load()).toBeNull();
  });
});

/* --------------------------- sync, races and failures --------------------------- */

class Server {
  events: RemoteEvent[] = [];
  seq = 0;
  offline = false;
  deleted = false;
  submits = 0;
  pulls = 0;
  onPull?: () => void;
  remote(): SyncRemote {
    return {
      submit: async (batch) => {
        if (this.offline) throw new SyncError('offline');
        if (this.deleted) throw new SyncError('account_deleted');
        if (batch.length > 100) throw new SyncError('unknown', 'bad_batch');
        this.submits += 1;
        return batch.map((b): EventReceipt => {
          const p = JSON.parse(b.payload) as Record<string, unknown>;
          if (this.events.some((e) => e.event_id === b.eventId)) return { eventId: b.eventId, outcome: 'duplicate', serverReceivedAtUtc: '' };
          this.seq += 1;
          this.events.push({ seq: this.seq, event_id: b.eventId, operation: b.operation, target_event_id: b.targetEventId ?? null, action_type: (p.actionType as string) ?? null, local_date: (p.localDate as string) ?? null, payload: p });
          return { eventId: b.eventId, outcome: 'accepted', serverReceivedAtUtc: '' };
        });
      },
      pull: async (after) => {
        this.pulls += 1;
        this.onPull?.();
        if (this.offline) throw new SyncError('offline');
        if (this.deleted) throw new SyncError('account_deleted');
        return this.events.filter((e) => e.seq > after).slice(0, 200);
      },
    };
  }
}

class Device {
  state: AppState = createFreshState(NOW);
  constructor(public storage: SqlStateStorage, public server: Server) {}
  deps(over: Partial<SyncDeps> = {}): SyncDeps {
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
        try {
          await this.storage.save(this.state);
          return true;
        } catch {
          return false;
        }
      },
      remote: this.server.remote(),
      gate: { enabled: true, consent: { cloudBackup: true } },
      now: () => Date.now() + 60_000,
      ...over,
    };
  }
}

describe('sync: races, failures and durability', () => {
  it('a long queue (250 entries) is sent completely in one run, in batches of at most 100', async () => {
    const server = new Server();
    const d = new Device(createSqlStorage(sqlite(), undefined, A), server);
    let s = createFreshState(NOW);
    for (let i = 0; i < 250; i += 1) s = reducer(s, { type: 'addAction', payload: { key: 'blessing', category: 'other', now: NOW + i, dateKey: DAY } });
    d.state = s;
    await d.storage.save(s);
    expect(await syncNow(d.deps())).toMatchObject({ state: 'ok', pushed: 250, pending: 0 });
    expect(server.events).toHaveLength(250);
    expect(server.submits).toBe(3);
  });

  it('a second device pulls many pages (more than one page of 200) in one run, and the cursor is durable', async () => {
    const server = new Server();
    const ex = sqlite();
    const one = new Device(createSqlStorage(sqlite(), undefined, A), server);
    let s = createFreshState(NOW);
    for (let i = 0; i < 450; i += 1) s = reducer(s, { type: 'addAction', payload: { key: 'blessing', category: 'other', now: NOW + i, dateKey: DAY } });
    one.state = s;
    await one.storage.save(s);
    await syncNow(one.deps());
    const two = new Device(createSqlStorage(ex, undefined, A), server);
    server.pulls = 0;
    expect(await syncNow(two.deps())).toMatchObject({ state: 'ok', pulled: 450 });
    expect(server.pulls).toBe(4); // 200 + 200 + 50 + empty
    // Restart: entries and cursor come back from the database; nothing is pulled twice.
    const restarted = loadState(await createSqlStorage(ex, undefined, A).load());
    expect(restarted.logs).toHaveLength(450);
    expect(restarted.sync?.cursor).toBe(450);
  });

  it('entries that came from the server are NOT queued again after a restart (regression)', async () => {
    const server = new Server();
    const one = new Device(createSqlStorage(sqlite(), undefined, A), server);
    one.state = add(createFreshState(NOW), 'shacharit');
    await one.storage.save(one.state);
    await syncNow(one.deps());
    const ex = sqlite();
    const two = new Device(createSqlStorage(ex, undefined, A), server);
    await syncNow(two.deps());
    expect(two.state.logs).toHaveLength(1);
    const afterRestart = createSqlStorage(ex, undefined, A);
    await afterRestart.load();
    expect(await afterRestart.listOutbox()).toHaveLength(0);
  });

  it('a failed push is an error, not "synced"; the entry stays queued', async () => {
    const server = new Server();
    const d = new Device(createSqlStorage(sqlite(), undefined, A), server);
    d.state = add(createFreshState(NOW), 'chesed');
    await d.storage.save(d.state);
    server.offline = true;
    expect(await syncNow(d.deps())).toMatchObject({ state: 'error', code: 'offline', pending: 1 });
    expect((await d.storage.listOutbox())[0]?.status).toBe('pending');
  });

  it('if the device cannot save its own data, sync does not start (nothing sent)', async () => {
    const server = new Server();
    const ex = sqlite();
    const d = new Device(createSqlStorage(ex, undefined, A), server);
    d.state = add(createFreshState(NOW), 'chesed');
    await d.storage.save(d.state);
    ex.fail.on = /INSERT INTO kv/;
    expect(await syncNow(d.deps())).toMatchObject({ state: 'error', code: 'local_save_failed' });
    expect(server.submits).toBe(0);
  });

  it('pulled entries and the cursor are written together: if that write fails, neither is kept, and a later run applies them once', async () => {
    const server = new Server();
    const one = new Device(createSqlStorage(sqlite(), undefined, A), server);
    one.state = add(add(createFreshState(NOW), 'shacharit', 0), 'chesed', 1);
    await one.storage.save(one.state);
    await syncNow(one.deps());
    const ex = sqlite();
    const two = new Device(createSqlStorage(ex, undefined, A), server);
    await two.storage.save(two.state);
    ex.fail.on = /INSERT INTO activities/;
    expect(await syncNow(two.deps())).toMatchObject({ state: 'error', code: 'local_save_failed' });
    const disk = loadState(await createSqlStorage(ex, undefined, A).load());
    expect(disk.logs).toHaveLength(0);
    expect(disk.sync?.cursor ?? 0).toBe(0);
    ex.fail.on = undefined;
    const again = new Device(createSqlStorage(ex, undefined, A), server);
    again.state = disk;
    expect(await syncNow(again.deps())).toMatchObject({ state: 'ok', pulled: 2 });
    expect(again.state.logs).toHaveLength(2);
  });

  it('sign-out / account switch during a sync: the late server response is not applied to the new account', async () => {
    const server = new Server();
    const one = new Device(createSqlStorage(sqlite(), undefined, A), server);
    one.state = add(createFreshState(NOW), 'shacharit');
    await one.storage.save(one.state);
    await syncNow(one.deps());
    const coordinator = createSyncCoordinator();
    let current = A;
    const two = new Device(createSqlStorage(sqlite(), undefined, A), server);
    let applied = 0;
    // The user signs out (switches to B) while the pull request is on the way.
    server.onPull = () => {
      coordinator.cancel();
      current = B;
    };
    const status = await coordinator.run(A, () => current, (isCurrent) =>
      syncNow(two.deps({ isCurrent, applyRemote: () => void (applied += 1) })),
    );
    expect(status).toEqual({ state: 'cancelled' });
    expect(applied).toBe(0);
  });

  it('consent revoked during a sync: the run stops before sending anything more', async () => {
    const server = new Server();
    const d = new Device(createSqlStorage(sqlite(), undefined, A), server);
    let s = createFreshState(NOW);
    for (let i = 0; i < 150; i += 1) s = reducer(s, { type: 'addAction', payload: { key: 'blessing', category: 'other', now: NOW + i, dateKey: DAY } });
    d.state = s;
    await d.storage.save(s);
    const coordinator = createSyncCoordinator();
    const remote = server.remote();
    const status = await coordinator.run(A, () => A, (isCurrent) =>
      syncNow(d.deps({ isCurrent, remote: { ...remote, submit: async (b) => { const r = await remote.submit(b); coordinator.cancel(); return r; } } })),
    );
    expect(status).toEqual({ state: 'cancelled' });
    expect(server.submits).toBe(1); // the first batch was already on the way; no second one
    expect((await d.storage.listOutbox()).filter((o) => o.status === 'accepted')).toHaveLength(100); // its receipts are kept
  });

  it('one run at a time: a second request for the same account joins the running one', async () => {
    const coordinator = createSyncCoordinator();
    let started = 0;
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const job = async () => {
      started += 1;
      await gate;
      return { state: 'off' } as const;
    };
    const p1 = coordinator.run(A, () => A, job);
    const p2 = coordinator.run(A, () => A, job);
    expect(p1).toBe(p2);
    release();
    await Promise.all([p1, p2]);
    expect(started).toBe(1);
    // After sign-out (new generation) a new run starts.
    coordinator.cancel();
    await coordinator.run(A, () => A, job);
    expect(started).toBe(2);
  });

  it('the account was deleted on another device: sync reports it, nothing is sent, the local data stays', async () => {
    const server = new Server();
    const d = new Device(createSqlStorage(sqlite(), undefined, A), server);
    d.state = add(createFreshState(NOW), 'chesed');
    await d.storage.save(d.state);
    server.deleted = true;
    expect(await syncNow(d.deps())).toEqual({ state: 'account-deleted' });
    expect(server.events).toHaveLength(0);
    expect(loadState(await d.storage.load()).logs).toHaveLength(1);
  });

  it('goal changes are sent before the events (once per change), so the server scores each day by its own goal', async () => {
    const server = new Server();
    const sent: unknown[] = [];
    const d = new Device(createSqlStorage(sqlite(), undefined, A), server);
    d.state = reducer(add(createFreshState(NOW), 'blessing', 0, { category: 'other' }), { type: 'updateGoals', payload: { blessingGoal: 50 }, dateKey: DAY });
    await d.storage.save(d.state);
    let hash: string | null = null;
    const goals = { current: () => d.state.goalHistory.map((g) => ({ from: g.from, blessingGoal: g.blessingGoal })), sent: () => hash, markSent: (h: string) => void (hash = h) };
    const remote = { ...server.remote(), setBlessingGoals: async (g: unknown) => void sent.push(g) };
    await syncNow(d.deps({ remote, goals }));
    await syncNow(d.deps({ remote, goals }));
    expect(sent).toEqual([[{ from: '0000-00-00', blessingGoal: 100 }, { from: DAY, blessingGoal: 50 }]]);
  });

  it('after the cloud copy was deleted, re-uploading the history happens only when the user agrees', async () => {
    const server = new Server();
    const d = new Device(createSqlStorage(sqlite(), undefined, A), server);
    d.state = add(add(createFreshState(NOW), 'chesed', 0), 'shacharit', 1);
    await d.storage.save(d.state);
    await syncNow(d.deps());
    server.events = []; // set_consent(false, delete) on the server
    // Backup turned on again without agreeing to re-upload: nothing old is sent.
    expect(await syncNow(d.deps())).toMatchObject({ state: 'ok', pushed: 0 });
    expect(server.events).toHaveLength(0);
    // The user agrees: everything is queued again and sent once.
    expect(await d.storage.requeueAccepted()).toBe(2);
    expect(await syncNow(d.deps())).toMatchObject({ state: 'ok', pushed: 2 });
    expect(server.events).toHaveLength(2);
  });
});
