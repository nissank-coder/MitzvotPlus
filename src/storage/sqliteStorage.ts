import { ActivityLog } from '../types';
import { runMigrations, SqlExecutor } from './migrations';
import { newCreateItem, OutboxItem, undoPlan, voidEventPayload } from '../sync/outbox';
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
      ready = (async () => {
        await runMigrations(db);
        const rows = await db.query<Row>('SELECT id, payload FROM activities;');
        for (const r of rows) saved.set(r.id, r.payload);
        const ob = await db.query<{ event_id: string; status: OutboxItem['status']; attempts: number }>('SELECT event_id, status, attempts FROM outbox;');
        for (const r of ob) outboxState.set(r.event_id, { status: r.status, attempts: r.attempts });
        const inst = await db.query<{ value: string }>('SELECT value FROM kv WHERE key = ?;', [INSTALLATION_KEY]);
        installation = inst[0]?.value ?? newInstallationId();
        if (!inst[0]) await db.transaction([{ sql: 'INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?);', values: [INSTALLATION_KEY, installation, Date.now()] }]);
        // Activities saved before the outbox existed get their create event once.
        const orphans = await db.query<Row>('SELECT a.id, a.payload FROM activities a LEFT JOIN outbox o ON o.event_id = a.id WHERE o.event_id IS NULL;');
        if (orphans.length > 0) {
          const now = Date.now();
          const items = orphans.map((r) => newCreateItem(JSON.parse(r.payload) as ActivityLog, installation, now));
          await db.transaction(items.map((i) => ({ sql: OUTBOX_INSERT, values: outboxValues(i) })));
          for (const i of items) outboxState.set(i.eventId, { status: i.status, attempts: 0 });
        }
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
      const outboxPending: Array<[string, Pick<OutboxItem, 'status' | 'attempts'>]> = [];
      const outboxDropped: string[] = [];
      for (const log of logs) {
        keep.add(log.id);
        const payload = JSON.stringify(log);
        if (saved.get(log.id) === payload) continue;
        if (!saved.has(log.id) && !outboxState.has(log.id)) {
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
      for (const id of removed) {
        statements.push({ sql: 'DELETE FROM activities WHERE id = ?;', values: [id] });
        const current = outboxState.get(id);
        const plan = undoPlan(current ? ({ ...current } as OutboxItem) : undefined);
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
          sql: 'UPDATE outbox SET status = ?, attempts = ?, next_attempt_at = ?, reason_code = ?, accepted_score_delta = ?, updated_at = ? WHERE event_id = ?;',
          values: [i.status, i.attempts, i.nextAttemptAt, i.reasonCode ?? null, i.acceptedScoreDelta ?? null, i.updatedAt, i.eventId],
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
