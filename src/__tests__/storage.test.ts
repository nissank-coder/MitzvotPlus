import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { currentVersion, MIGRATIONS, runMigrations, SqlExecutor } from '../storage/migrations';
import { createSqlStorage } from '../storage/sqliteStorage';
import { computeDerived } from '../store/derived';
import { createFreshState, loadState, reducer } from '../store/state';
import { localDateKey } from '../lib/dates';

/** A real SQLite database (Node's built-in engine) behind the same executor the app uses on devices. */
function sqliteExecutor(db = new DatabaseSync(':memory:')): SqlExecutor & { db: DatabaseSync } {
  return {
    db,
    execute: async (sql) => {
      db.exec(sql);
    },
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

const NOW = new Date(2026, 10, 23, 15, 0).getTime();

describe('migrations', () => {
  it('applies once and records the version', async () => {
    const db = sqliteExecutor();
    expect(await runMigrations(db)).toEqual(MIGRATIONS.map((m) => m.version));
    expect(await runMigrations(db)).toEqual([]);
    expect(await currentVersion(db)).toBe(MIGRATIONS.at(-1)?.version);
  });

  it('rolls back a failing migration completely', async () => {
    const db = sqliteExecutor();
    await runMigrations(db);
    const bad = [...MIGRATIONS, { version: 99, name: 'bad', statements: ['CREATE TABLE t2 (x INTEGER);', 'THIS IS NOT SQL;'] }];
    await expect(runMigrations(db, bad)).rejects.toThrow();
    expect(await currentVersion(db)).toBe(MIGRATIONS.at(-1)?.version);
    expect(await db.query("SELECT name FROM sqlite_master WHERE name = 't2';")).toHaveLength(0);
  });
});

describe('SQLite state storage', () => {
  it('survives a restart: same data after reopening the database', async () => {
    const exec = sqliteExecutor();
    let state = { ...createFreshState(NOW), onboarded: true, userName: 'משה' };
    state = reducer(state, { type: 'addAction', payload: { key: 'shacharit', minyan: true, now: NOW } });
    state = reducer(state, { type: 'addAction', payload: { key: 'blessing', category: 'enjoyment', now: NOW + 1 } });
    await createSqlStorage(exec).save(state);

    // "Close and reopen": a new storage object over the same database file.
    const reopened = createSqlStorage(sqliteExecutor(exec.db));
    const loaded = loadState(await reopened.load(), NOW);
    expect(loaded.userName).toBe('משה');
    expect(loaded.logs.map((l) => l.actionKey).sort()).toEqual(['blessing', 'shacharit']);
    expect(computeDerived(loaded, localDateKey(NOW)).totalPoints).toBe(computeDerived(state, localDateKey(NOW)).totalPoints);
  });

  it('writes one row per activity, marked pending sync, and deletes removed ones', async () => {
    const exec = sqliteExecutor();
    const storage = createSqlStorage(exec);
    let state = createFreshState(NOW);
    state = reducer(state, { type: 'addAction', payload: { key: 'charity', now: NOW } });
    state = reducer(state, { type: 'addAction', payload: { key: 'chesed', now: NOW + 1 } });
    await storage.save(state);
    const rows = await exec.query<{ sync_status: string }>('SELECT sync_status FROM activities;');
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.sync_status === 'pending')).toBe(true);

    state = reducer(state, { type: 'removeLog', payload: { id: state.logs[0]!.id } });
    await storage.save(state);
    expect(await exec.query('SELECT id FROM activities;')).toHaveLength(1);
  });

  it('imports legacy browser data on first run only', async () => {
    const exec = sqliteExecutor();
    const legacy = JSON.stringify({ ...createFreshState(NOW), version: 2, onboarded: true, userName: 'ישן' });
    const storage = createSqlStorage(exec, () => legacy);
    expect(loadState(await storage.load(), NOW).userName).toBe('ישן');
    await storage.save({ ...createFreshState(NOW), userName: 'חדש' });
    expect(loadState(await storage.load(), NOW).userName).toBe('חדש');
  });
});

describe('deep links', async () => {
  const { parseDeepLink } = await import('../native/deepLinks');
  it('opens known screens only', () => {
    expect(parseDeepLink('mitzvotplus://open/blessings')).toEqual({ tab: 'content', feature: 'blessings' });
    expect(parseDeepLink('mitzvotplus://tab/profile')).toEqual({ tab: 'profile', feature: null });
    expect(parseDeepLink('mitzvotplus://open/admin')).toBeNull();
    expect(parseDeepLink('https://evil.example/open/blessings')).toBeNull();
    expect(parseDeepLink('not a url')).toBeNull();
  });
});
