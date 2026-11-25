/**
 * SQLite schema migrations. Append only: never edit a migration that has shipped.
 * Each migration runs inside one transaction together with its version bump.
 */
export type Migration = { version: number; name: string; statements: string[] };

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'initial',
    statements: [
      `CREATE TABLE IF NOT EXISTS kv (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );`,
      // One row per recorded action. points_local is the client's provisional score;
      // the server-confirmed score arrives with sync (stage C) and is never assumed final here.
      `CREATE TABLE IF NOT EXISTS activities (
        id TEXT PRIMARY KEY NOT NULL,
        date_key TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        action_key TEXT,
        points_local INTEGER NOT NULL,
        payload TEXT NOT NULL,
        sync_status TEXT NOT NULL DEFAULT 'pending'
      );`,
      `CREATE INDEX IF NOT EXISTS idx_activities_date ON activities (date_key);`,
      `CREATE INDEX IF NOT EXISTS idx_activities_sync ON activities (sync_status);`,
    ],
  },
  {
    version: 2,
    name: 'outbox',
    statements: [
      // Sync outbox (spec §7). Written in the same transaction as the activity it describes.
      // The speech timer never appears here: it is local-only.
      `CREATE TABLE IF NOT EXISTS outbox (
        event_id TEXT PRIMARY KEY NOT NULL,
        operation TEXT NOT NULL CHECK (operation IN ('create', 'void')),
        target_event_id TEXT,
        payload TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'deferred', 'accepted', 'rejected')),
        attempts INTEGER NOT NULL DEFAULT 0,
        next_attempt_at INTEGER NOT NULL,
        reason_code TEXT,
        accepted_score_delta INTEGER,
        updated_at INTEGER NOT NULL
      );`,
      `CREATE INDEX IF NOT EXISTS idx_outbox_due ON outbox (status, next_attempt_at);`,
    ],
  },
  {
    version: 3,
    name: 'account-spaces',
    // Round 12.5: every row belongs to a data space – 'guest' or 'user:<account id>' – so one
    // account's history, settings, queue and sync cursor can never mix with another's. Existing
    // data is the guest's: who it belongs to is not guessed. The installation id is per device ('*').
    statements: [
      `CREATE TABLE activities_v3 (
        space TEXT NOT NULL,
        id TEXT NOT NULL,
        date_key TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        action_key TEXT,
        points_local INTEGER NOT NULL,
        payload TEXT NOT NULL,
        sync_status TEXT NOT NULL DEFAULT 'pending',
        PRIMARY KEY (space, id)
      );`,
      `INSERT INTO activities_v3 (space, id, date_key, created_at, action_key, points_local, payload, sync_status)
        SELECT 'guest', id, date_key, created_at, action_key, points_local, payload, sync_status FROM activities;`,
      `DROP TABLE activities;`,
      `ALTER TABLE activities_v3 RENAME TO activities;`,
      `CREATE INDEX idx_activities_date ON activities (space, date_key);`,
      `CREATE TABLE outbox_v3 (
        space TEXT NOT NULL,
        event_id TEXT NOT NULL,
        operation TEXT NOT NULL CHECK (operation IN ('create', 'void')),
        target_event_id TEXT,
        payload TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'deferred', 'accepted', 'rejected')),
        attempts INTEGER NOT NULL DEFAULT 0,
        next_attempt_at INTEGER NOT NULL,
        reason_code TEXT,
        accepted_score_delta INTEGER,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (space, event_id)
      );`,
      `INSERT INTO outbox_v3 (space, event_id, operation, target_event_id, payload, status, attempts, next_attempt_at, reason_code, accepted_score_delta, updated_at)
        SELECT 'guest', event_id, operation, target_event_id, payload, status, attempts, next_attempt_at, reason_code, accepted_score_delta, updated_at FROM outbox;`,
      `DROP TABLE outbox;`,
      `ALTER TABLE outbox_v3 RENAME TO outbox;`,
      `CREATE INDEX idx_outbox_due ON outbox (space, status, next_attempt_at);`,
      `CREATE TABLE kv_v3 (
        space TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (space, key)
      );`,
      `INSERT INTO kv_v3 (space, key, value, updated_at)
        SELECT CASE WHEN key = 'installation_id' THEN '*' ELSE 'guest' END, key, value, updated_at FROM kv;`,
      `DROP TABLE kv;`,
      `ALTER TABLE kv_v3 RENAME TO kv;`,
    ],
  },
];

/** Minimal database surface the migration runner needs – implemented by SQLite and by tests. */
export type SqlExecutor = {
  execute: (sql: string) => Promise<void>;
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<T[]>;
  /** Runs statements atomically: all apply or none. */
  transaction: (statements: Array<{ sql: string; values?: unknown[] }>) => Promise<void>;
};

export async function currentVersion(db: SqlExecutor): Promise<number> {
  await db.execute(
    'CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY NOT NULL, name TEXT NOT NULL, applied_at INTEGER NOT NULL);',
  );
  const rows = await db.query<{ v: number | null }>('SELECT MAX(version) AS v FROM schema_migrations;');
  return Number(rows[0]?.v ?? 0);
}

/** Applies pending migrations in order. Returns the versions applied. */
export async function runMigrations(db: SqlExecutor, migrations: Migration[] = MIGRATIONS, now = Date.now()): Promise<number[]> {
  const from = await currentVersion(db);
  const pending = [...migrations].sort((a, b) => a.version - b.version).filter((m) => m.version > from);
  const applied: number[] = [];
  for (const m of pending) {
    await db.transaction([
      ...m.statements.map((sql) => ({ sql })),
      { sql: 'INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?);', values: [m.version, m.name, now] },
    ]);
    applied.push(m.version);
  }
  return applied;
}
