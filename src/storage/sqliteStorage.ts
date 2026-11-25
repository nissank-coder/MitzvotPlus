import { ActivityLog } from '../types';
import { runMigrations, SqlExecutor } from './migrations';
import { DB_ENCRYPTION } from '../config/features';
import { newCreateItem, OutboxItem, syncPolicy, undoPlan, voidEventPayload } from '../sync/outbox';
import { LEGACY_STORAGE_KEY, StateStorage } from './persistence';

const STATE_KEY = 'app_state';
const INSTALLATION_KEY = 'installation_id';

type OutboxRow = {
  event_id: string;
  operation: 'create' | 'void';
  target_event_id: string | null;
  payload: string;
  status: OutboxItem['status'];
  attempts: number;
  next_attempt_at: number;
  reason_code: string | null;
  accepted_score_delta: number | null;
  updated_at: number;
};

const fromRow = (r: OutboxRow): OutboxItem => ({
  eventId: r.event_id,
  operation: r.operation,
  ...(r.target_event_id ? { targetEventId: r.target_event_id } : {}),
  payload: r.payload,
  status: r.status,
  attempts: r.attempts,
  nextAttemptAt: r.next_attempt_at,
  ...(r.reason_code ? { reasonCode: r.reason_code } : {}),
  ...(r.accepted_score_delta !== null ? { acceptedScoreDelta: r.accepted_score_delta } : {}),
  updatedAt: r.updated_at,
});

const OUTBOX_INSERT =
  'INSERT INTO outbox (event_id, operation, target_event_id, payload, status, attempts, next_attempt_at, reason_code, accepted_score_delta, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(event_id) DO NOTHING;';
const outboxValues = (i: OutboxItem) => [i.eventId, i.operation, i.targetEventId ?? null, i.payload, i.status, i.attempts, i.nextAttemptAt, i.reasonCode ?? null, i.acceptedScoreDelta ?? null, i.updatedAt];

export type SqlStateStorage = StateStorage & {
  installationId: () => Promise<string>;
  listOutbox: () => Promise<OutboxItem[]>;
  /** Persists sync results (receipts) for existing outbox items in one transaction. */
  saveOutbox: (items: OutboxItem[]) => Promise<void>;
};

function newInstallationId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  return `inst-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

type Row = { id: string; payload: string };

/**
 * State storage on top of an SQL executor:
 * activities get one row each (ready for the sync outbox), the rest of the state is one kv row.
 * Only changed activity rows are written on each save.
 */
export function createSqlStorage(db: SqlExecutor, legacy?: () => string | null): SqlStateStorage {
  let ready: Promise<void> | null = null;
  const saved = new Map<string, string>();
  const outboxState = new Map<string, Pick<OutboxItem, 'status' | 'attempts'>>();
  let installation = '';

  const init = () => {
    if (!ready) {
      // A failed initialisation is not cached: the next save/load tries again (transient I/O errors).
      ready = (async () => {
        await runMigrations(db);
        const rows = await db.query<Row>('SELECT id, payload FROM activities;');
        for (const r of rows) saved.set(r.id, r.payload);
        // S10-02: create events of local-only actions that were queued by an older version and never
        // left the device are removed from the queue (the activities themselves are kept).
        const localOnly = [...saved.entries()]
          .filter(([, payload]) => syncPolicy(JSON.parse(payload) as ActivityLog) === 'local-only')
          .map(([id]) => id);
        if (localOnly.length > 0) {
          await db.transaction(
            localOnly.map((id) => ({
              sql: "DELETE FROM outbox WHERE event_id = ? AND operation = 'create' AND status = 'pending' AND attempts = 0;",
              values: [id],
            })),
          );
        }
        const ob = await db.query<{ event_id: string; status: OutboxItem['status']; attempts: number }>('SELECT event_id, status, attempts FROM outbox;');
        for (const r of ob) outboxState.set(r.event_id, { status: r.status, attempts: r.attempts });
        const inst = await db.query<{ value: string }>('SELECT value FROM kv WHERE key = ?;', [INSTALLATION_KEY]);
        installation = inst[0]?.value ?? newInstallationId();
        if (!inst[0]) await db.transaction([{ sql: 'INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?);', values: [INSTALLATION_KEY, installation, Date.now()] }]);
        // Activities saved before the outbox existed get their create event once.
        const orphanRows = await db.query<Row>('SELECT a.id, a.payload FROM activities a LEFT JOIN outbox o ON o.event_id = a.id WHERE o.event_id IS NULL;');
        // Local-only actions are never (re)queued.
        const orphans = orphanRows.filter((r) => syncPolicy(JSON.parse(r.payload) as ActivityLog) !== 'local-only');
        if (orphans.length > 0) {
          const now = Date.now();
          const items = orphans.map((r) => newCreateItem(JSON.parse(r.payload) as ActivityLog, installation, now));
          await db.transaction(items.map((i) => ({ sql: OUTBOX_INSERT, values: outboxValues(i) })));
          for (const i of items) outboxState.set(i.eventId, { status: i.status, attempts: 0 });
        }
      })().catch((error: unknown) => {
        ready = null;
        throw error;
      });
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
      const outboxPending: Array<[string, Pick<OutboxItem, 'status' | 'attempts'>]> = [];
      const outboxDropped: string[] = [];
      for (const log of logs) {
        keep.add(log.id);
        const payload = JSON.stringify(log);
        if (saved.get(log.id) === payload) continue;
        if (!saved.has(log.id) && !outboxState.has(log.id) && syncPolicy(log) !== 'local-only' && !log.remote) {
          // New action: its outbox record is written in the same transaction (spec §7 step 1).
          const item = newCreateItem(log, installation, now);
          statements.push({ sql: OUTBOX_INSERT, values: outboxValues(item) });
          outboxPending.push([item.eventId, { status: item.status, attempts: 0 }]);
        }
        statements.push({
          sql: 'INSERT INTO activities (id, date_key, created_at, action_key, points_local, payload) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, points_local = excluded.points_local;',
          values: [log.id, log.dateKey, log.createdAt, log.actionKey ?? null, log.points, payload],
        });
      }
      const removed = [...saved.keys()].filter((id) => !keep.has(id));
      // Entries removed because another device deleted them: the deletion is already on the server.
      const remoteRemoved = new Set((state.sync as { remoteRemoved?: string[] } | undefined)?.remoteRemoved ?? []);
      for (const id of removed) {
        statements.push({ sql: 'DELETE FROM activities WHERE id = ?;', values: [id] });
        if (remoteRemoved.has(id)) {
          statements.push({ sql: "DELETE FROM outbox WHERE event_id = ? AND operation = 'create';", values: [id] });
          outboxState.delete(id);
          continue;
        }
        const current = outboxState.get(id);
        // An entry that came from another device exists on the server: deleting it here sends a void.
        const fromRemote = !current && Boolean((JSON.parse(saved.get(id) ?? '{}') as { remote?: boolean }).remote);
        const plan = fromRemote ? 'enqueue-void' : undoPlan(current ? ({ ...current } as OutboxItem) : undefined);
        if (plan === 'drop-local') {
          statements.push({ sql: 'DELETE FROM outbox WHERE event_id = ?;', values: [id] });
          outboxDropped.push(id);
        } else if (plan === 'enqueue-void') {
          const voidId = `void:${id}`;
          const item: OutboxItem = { eventId: voidId, operation: 'void', targetEventId: id, payload: voidEventPayload(voidId, id, installation, now), status: 'pending', attempts: 0, nextAttemptAt: now, updatedAt: now };
          statements.push({ sql: OUTBOX_INSERT, values: outboxValues(item) });
          outboxPending.push([voidId, { status: 'pending', attempts: 0 }]);
        }
      }
      await db.transaction(statements);
      // Caches change only after the transaction committed.
      for (const [id, st] of outboxPending) outboxState.set(id, st);
      for (const id of outboxDropped) outboxState.delete(id);
      for (const log of logs) saved.set(log.id, JSON.stringify(log));
      for (const id of removed) saved.delete(id);
    },
    async installationId() {
      await init();
      return installation;
    },
    async listOutbox() {
      await init();
      return (await db.query<OutboxRow>('SELECT * FROM outbox ORDER BY updated_at;')).map(fromRow);
    },
    async saveOutbox(items) {
      await init();
      await db.transaction(
        items.map((i) => ({
          // The payload changes only for an item that never left the device (re-encoded as schema v2).
          sql: 'UPDATE outbox SET status = ?, attempts = ?, next_attempt_at = ?, reason_code = ?, accepted_score_delta = ?, updated_at = ?, payload = CASE WHEN attempts = 0 THEN ? ELSE payload END WHERE event_id = ?;',
          values: [i.status, i.attempts, i.nextAttemptAt, i.reasonCode ?? null, i.acceptedScoreDelta ?? null, i.updatedAt, i.payload, i.eventId],
        })),
      );
      for (const i of items) outboxState.set(i.eventId, { status: i.status, attempts: i.attempts });
    },
  };
}

/** Opens the on-device SQLite database through @capacitor-community/sqlite (native only). */
export async function openNativeSqlite(): Promise<StateStorage> {
  const { CapacitorSQLite, SQLiteConnection } = await import('@capacitor-community/sqlite');
  const sqlite = new SQLiteConnection(CapacitorSQLite);
  await sqlite.checkConnectionsConsistency().catch(() => undefined);

  /** Opens (or reuses) a connection: plain, or SQLCipher with the key registered by registerKey. */
  const connect = async (name: string, encrypted: boolean) => {
    const exists = (await sqlite.isConnection(name, false)).result;
    const conn = exists
      ? await sqlite.retrieveConnection(name, false)
      : await sqlite.createConnection(name, encrypted, encrypted ? 'secret' : 'no-encryption', 1, false);
    await conn.open();
    return conn;
  };

  let conn: Awaited<ReturnType<typeof connect>>;
  if (DB_ENCRYPTION) {
    const { openEncryptedDatabase } = await import('./encryptedDb');
    const { openSecureStore } = await import('../native/secureStore');
    const conns = new Map<string, Awaited<ReturnType<typeof connect>>>();
    const result = await openEncryptedDatabase(
      {
        exists: async (n) => (await sqlite.isDatabase(n)).result ?? false,
        open: async (n, key) => {
          const c = await connect(n, key !== null);
          conns.set(n, c);
          return { ...executorFor(c), close: async () => { await sqlite.closeConnection(n, false); conns.delete(n); } };
        },
        remove: async (n) => {
          if (conns.has(n)) await sqlite.closeConnection(n, false).catch(() => undefined);
          await CapacitorSQLite.deleteDatabase({ database: n });
        },
        registerKey: async (key) => {
          // The plugin keeps its own copy of the passphrase (Keychain / EncryptedSharedPreferences).
          if (!(await sqlite.isSecretStored()).result) await sqlite.setEncryptionSecret(key);
          else if (!(await sqlite.checkEncryptionSecret(key)).result) throw new Error('stored database secret does not match the key');
        },
      },
      await openSecureStore(),
    );
    if (!result.db) throw new Error(`encrypted database unavailable: ${result.status === 'recovery' ? result.reason : result.status}`);
    if (result.status !== 'fresh' && result.status !== 'migrated' && result.status !== 'encrypted') {
      console.warn('Encrypted database:', result.status, 'reason' in result ? result.reason : '');
    }
    const active = [...conns.values()].at(-1);
    if (!active) throw new Error('no database connection');
    conn = active;
  } else {
    conn = await connect('mitzvotplus', false);
  }

  const executor: SqlExecutor = executorFor(conn);
  const legacy = () => {
    try {
      return window.localStorage.getItem(LEGACY_STORAGE_KEY);
    } catch {
      return null;
    }
  };
  return createSqlStorage(executor, legacy);
}

function executorFor(conn: { execute: (sql: string, tx?: boolean) => Promise<unknown>; query: (sql: string, values?: unknown[]) => Promise<{ values?: unknown[] }>; executeSet: (set: Array<{ statement: string; values: unknown[] }>, tx?: boolean) => Promise<unknown> }): SqlExecutor {
  return {
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
}
