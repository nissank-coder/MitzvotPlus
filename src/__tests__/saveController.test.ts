import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it, vi } from 'vitest';
import { SqlExecutor } from '../storage/migrations';
import { localStorageStorage, memoryStorage, StateStorage } from '../storage/persistence';
import { classifySaveError, SaveController, SaveStatus } from '../storage/saveController';
import { createSqlStorage } from '../storage/sqliteStorage';
import { computeDerived } from '../store/derived';
import { createFreshState, loadState, reducer } from '../store/state';
import { localDateKey } from '../lib/dates';
import { elapsed } from '../lib/speechTimer';

const NOW = new Date(2026, 10, 24, 12, 0).getTime();

/** Manual timers: run() fires the pending callback. */
function timers() {
  let pending: (() => void) | null = null;
  return {
    setTimer: (fn: () => void) => ((pending = fn), 1),
    clearTimer: () => void (pending = null),
    hasPending: () => pending !== null,
    run: async () => {
      const fn = pending;
      pending = null;
      fn?.();
      await new Promise((r) => setTimeout(r, 0));
    },
  };
}

/** Real SQLite (Node's built-in engine) whose next N transactions fail like a full disk. */
function flakySqlite(db = new DatabaseSync(':memory:')) {
  let failNext = 0;
  const exec: SqlExecutor = {
    execute: async (sql) => void db.exec(sql),
    query: async <T,>(sql: string, values: unknown[] = []) => db.prepare(sql).all(...(values as never[])) as T[],
    transaction: async (statements) => {
      db.exec('BEGIN');
      try {
        if (failNext > 0 && statements.some((s) => s.sql.startsWith('INSERT INTO activities'))) {
          failNext -= 1;
          throw new Error('SQLITE_FULL: database or disk is full');
        }
        for (const s of statements) db.prepare(s.sql).run(...((s.values ?? []) as never[]));
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
  };
  return { db, exec, failTimes: (n: number) => void (failNext = n) };
}

const blessing = (s: ReturnType<typeof createFreshState>, now: number) =>
  reducer(s, { type: 'addAction', payload: { key: 'blessing', category: 'enjoyment', now } });

describe('save controller', () => {
  it('a failed save is reported, never shown as saved, and retried without duplicates', async () => {
    const { db, exec, failTimes } = flakySqlite();
    const storage = createSqlStorage(exec);
    const statuses: SaveStatus[] = [];
    const t = timers();
    const saver = new SaveController(storage, (s) => statuses.push(s), { ...t, retryDelaysMs: [10] });

    let s = blessing(createFreshState(NOW), NOW);
    failTimes(1);
    saver.request(s);
    expect(await saver.flush()).toBe(false);
    expect(saver.getStatus()).toMatchObject({ state: 'error', error: 'quota', failures: 1 });
    expect(saver.isSaved(s.logs[0]!.id)).toBe(false);
    expect(db.prepare('SELECT COUNT(*) AS n FROM activities').get()).toEqual({ n: 0 });
    expect(t.hasPending()).toBe(true); // automatic retry scheduled

    await t.run(); // retry
    expect(saver.getStatus()).toMatchObject({ state: 'saved', error: null, failures: 0 });
    expect(saver.isSaved(s.logs[0]!.id)).toBe(true);
    expect(db.prepare('SELECT COUNT(*) AS n FROM activities').get()).toEqual({ n: 1 });
    expect(db.prepare('SELECT COUNT(*) AS n FROM outbox').get()).toEqual({ n: 1 });

    // Retrying again changes nothing.
    s = { ...s };
    saver.request(s);
    await saver.retry();
    expect(db.prepare('SELECT COUNT(*) AS n FROM activities').get()).toEqual({ n: 1 });
    expect(statuses.map((x) => x.state)).toEqual(['saving', 'error', 'saving', 'saved', 'saving', 'saved']);
  });

  it('stops automatic retries after the last delay but keeps the error visible; a new change tries again', async () => {
    const failing: StateStorage = { kind: 'memory', load: async () => null, save: vi.fn().mockRejectedValue(new Error('io')) };
    const t = timers();
    const saver = new SaveController(failing, () => {}, { ...t, retryDelaysMs: [1] });
    saver.request(createFreshState(NOW));
    await saver.flush();
    await t.run();
    expect(saver.getStatus()).toMatchObject({ state: 'error', error: 'storage', failures: 2 });
    expect(t.hasPending()).toBe(false);
    saver.request(createFreshState(NOW));
    expect(t.hasPending()).toBe(true);
  });

  it('a change that arrives during a save is saved right after it', async () => {
    let release!: () => void;
    const calls: number[] = [];
    const slow: StateStorage = {
      kind: 'memory',
      load: async () => null,
      save: (st) => {
        calls.push((st as { logs: unknown[] }).logs.length);
        return calls.length === 1 ? new Promise<void>((r) => (release = r)) : Promise.resolve();
      },
    };
    const saver = new SaveController(slow, () => {}, timers());
    const s1 = blessing(createFreshState(NOW), NOW);
    saver.request(s1);
    const first = saver.flush();
    const s2 = blessing(s1, NOW + 1);
    saver.request(s2);
    release();
    expect(await first).toBe(true);
    expect(calls).toEqual([1, 2]);
    expect(saver.isSaved(s2.logs[0]!.id)).toBe(true);
  });

  it('browser storage: quota errors are thrown, classified, and nothing is reported as saved', async () => {
    const store = {
      getItem: () => null,
      setItem: () => {
        throw Object.assign(new Error('The quota has been exceeded.'), { name: 'QuotaExceededError' });
      },
    };
    const storage = localStorageStorage(store);
    await expect(storage.save(createFreshState(NOW))).rejects.toThrow('quota');
    const saver = new SaveController(storage, () => {}, timers());
    saver.request(blessing(createFreshState(NOW), NOW));
    expect(await saver.flush()).toBe(false);
    expect(saver.getStatus().error).toBe('quota');
  });

  it('classifies errors', () => {
    expect(classifySaveError({ name: 'QuotaExceededError' })).toBe('quota');
    expect(classifySaveError(new Error('database or disk is full'))).toBe('quota');
    expect(classifySaveError(new Error('SQLITE_IOERR'))).toBe('storage');
  });
});

describe('SQLite storage recovers from a failed initialisation', () => {
  it('a migration that failed once is retried on the next save', async () => {
    const db = new DatabaseSync(':memory:');
    let failMigration = true;
    const base = flakySqlite(db).exec;
    const exec: SqlExecutor = {
      ...base,
      transaction: async (st) => {
        if (failMigration && st.some((x) => x.sql.includes('CREATE TABLE IF NOT EXISTS kv'))) {
          failMigration = false;
          throw new Error('SQLITE_IOERR');
        }
        return base.transaction(st);
      },
    };
    const storage = createSqlStorage(exec);
    await expect(storage.save(createFreshState(NOW))).rejects.toThrow('SQLITE_IOERR');
    await storage.save(blessing(createFreshState(NOW), NOW));
    expect(db.prepare('SELECT COUNT(*) AS n FROM activities').get()).toEqual({ n: 1 });
  });
});

describe('data survives a restart (SQLite)', () => {
  it('points, blessings and the speech timer are intact after reopening', async () => {
    const { db, exec } = flakySqlite();
    let s = { ...createFreshState(NOW), onboarded: true, userName: 'בודק' };
    s = reducer(s, { type: 'addAction', payload: { key: 'shacharit', minyan: true, onTime: true, now: NOW } });
    s = blessing(s, NOW + 1);
    s = blessing(s, NOW + 2);
    s = reducer(s, { type: 'startSpeech', now: NOW - 3 * 86_400_000 });
    const saver = new SaveController(createSqlStorage(exec), () => {}, timers());
    saver.request(s);
    expect(await saver.flush()).toBe(true);

    // "Force close": a new storage object over the same database.
    const reopened = loadState(await createSqlStorage(flakySqlite(db).exec).load(), NOW + 10);
    const before = computeDerived(s, localDateKey(NOW));
    const after = computeDerived(reopened, localDateKey(NOW));
    expect(after.totalPoints).toBe(before.totalPoints);
    expect(after.blessingTotal).toBe(2);
    expect(reopened.speech.since).toBe(NOW - 3 * 86_400_000);
    expect(elapsed(reopened.speech, NOW).ms).toBe(3 * 86_400_000);
  });

  it('memory storage round-trip keeps the timer', async () => {
    const mem = memoryStorage();
    const s = reducer(createFreshState(NOW), { type: 'startSpeech', now: NOW });
    await mem.save(s);
    expect(loadState(await mem.load(), NOW).speech.since).toBe(NOW);
  });
});
