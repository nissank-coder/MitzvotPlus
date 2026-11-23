import { ActivityLog } from '../types';
import { runMigrations, SqlExecutor } from './migrations';
import { LEGACY_STORAGE_KEY, StateStorage } from './persistence';

const STATE_KEY = 'app_state';

type Row = { id: string; payload: string };

/**
 * State storage on top of an SQL executor:
 * activities get one row each (ready for the sync outbox), the rest of the state is one kv row.
 * Only changed activity rows are written on each save.
 */
export function createSqlStorage(db: SqlExecutor, legacy?: () => string | null): StateStorage {
  let ready: Promise<void> | null = null;
  const saved = new Map<string, string>();

  const init = () => {
    if (!ready) {
      ready = (async () => {
        await runMigrations(db);
        const rows = await db.query<Row>('SELECT id, payload FROM activities;');
        for (const r of rows) saved.set(r.id, r.payload);
      })();
    }
    return ready;
  };

  return {
    kind: 'sqlite',
    async load() {
      await init();
      const kv = await db.query<{ value: string }>('SELECT value FROM kv WHERE key = ?;', [STATE_KEY]);
      if (!kv[0]) {
        // First run on this backend: carry over data from the browser storage, if any.
        return legacy?.() ?? null;
      }
      const rest = JSON.parse(kv[0].value) as Record<string, unknown>;
      const rows = await db.query<Row>('SELECT id, payload FROM activities ORDER BY created_at DESC;');
      const logs = rows.map((r) => JSON.parse(r.payload) as ActivityLog);
      return JSON.stringify({ ...rest, logs });
    },
    async save(state) {
      await init();
      const { logs, ...rest } = state;
      const now = Date.now();
      const statements: Array<{ sql: string; values?: unknown[] }> = [
        {
          sql: 'INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;',
          values: [STATE_KEY, JSON.stringify(rest), now],
        },
      ];
      const keep = new Set<string>();
      for (const log of logs) {
        keep.add(log.id);
        const payload = JSON.stringify(log);
        if (saved.get(log.id) === payload) continue;
        statements.push({
          sql: 'INSERT INTO activities (id, date_key, created_at, action_key, points_local, payload) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, points_local = excluded.points_local;',
          values: [log.id, log.dateKey, log.createdAt, log.actionKey ?? null, log.points, payload],
        });
      }
      const removed = [...saved.keys()].filter((id) => !keep.has(id));
      for (const id of removed) statements.push({ sql: 'DELETE FROM activities WHERE id = ?;', values: [id] });
      await db.transaction(statements);
      for (const log of logs) saved.set(log.id, JSON.stringify(log));
      for (const id of removed) saved.delete(id);
    },
  };
}

/** Opens the on-device SQLite database through @capacitor-community/sqlite (native only). */
export async function openNativeSqlite(): Promise<StateStorage> {
  const { CapacitorSQLite, SQLiteConnection } = await import('@capacitor-community/sqlite');
  const sqlite = new SQLiteConnection(CapacitorSQLite);
  const name = 'mitzvotplus';
  await sqlite.checkConnectionsConsistency().catch(() => undefined);
  const exists = (await sqlite.isConnection(name, false)).result;
  const conn = exists
    ? await sqlite.retrieveConnection(name, false)
    : await sqlite.createConnection(name, false, 'no-encryption', 1, false);
  await conn.open();

  const executor: SqlExecutor = {
    execute: async (sql) => {
      await conn.execute(sql, false);
    },
    query: async <T,>(sql: string, values: unknown[] = []) => ((await conn.query(sql, values)).values ?? []) as T[],
    transaction: async (statements) => {
      if (statements.length === 0) return;
      await conn.executeSet(
        statements.map((s) => ({ statement: s.sql, values: s.values ?? [] })),
        true,
      );
    },
  };

  const legacy = () => {
    try {
      return window.localStorage.getItem(LEGACY_STORAGE_KEY);
    } catch {
      return null;
    }
  };
  return createSqlStorage(executor, legacy);
}
