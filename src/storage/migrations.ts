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
