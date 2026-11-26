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
  'INSERT INTO outbox (space, event_id, operation, target_event_id, payload, status, attempts, next_attempt_at, reason_code, accepted_score_delta, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(space, event_id) DO NOTHING;';
const outboxValues = (space: string, i: OutboxItem) => [space, i.eventId, i.operation, i.targetEventId ?? null, i.payload, i.status, i.attempts, i.nextAttemptAt, i.reasonCode ?? null, i.acceptedScoreDelta ?? null, i.updatedAt];
const ACTIVITY_UPSERT =
  'INSERT INTO activities (space, id, date_key, created_at, action_key, points_local, payload) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(space, id) DO UPDATE SET payload = excluded.payload, points_local = excluded.points_local;';
const activityValues = (space: string, log: ActivityLog, payload: string) => [space, log.id, log.dateKey, log.createdAt, log.actionKey ?? null, log.points, payload];

/** The device-wide part of the database (not part of any account). */
const DEVICE = '*';
export const GUEST_SPACE = 'guest';
export const userSpace = (userId: string) => `user:${userId}`;

export type SqlStateStorage = StateStorage & {
  /** The data space this storage reads and writes: 'guest' or 'user:<account id>'. */
  readonly space: string;
  installationId: () => Promise<string>;
  listOutbox: () => Promise<OutboxItem[]>;
  /** Persists sync results (receipts) for existing outbox items in one transaction. */
  saveOutbox: (items: OutboxItem[]) => Promise<void>;
  /** After the cloud copy was deleted and the user agreed to upload again: every create is due again. */
  requeueAccepted: () => Promise<number>;
};

function newInstallationId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  return `inst-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

type Row = { id: string; payload: string };

async function deviceInstallationId(db: SqlExecutor): Promise<string> {
  const inst = await db.query<{ value: string }>('SELECT value FROM kv WHERE space = ? AND key = ?;', [DEVICE, INSTALLATION_KEY]);
  if (inst[0]) return inst[0].value;
  const id = newInstallationId();
  await db.transaction([{ sql: 'INSERT INTO kv (space, key, value, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(space, key) DO NOTHING;', values: [DEVICE, INSTALLATION_KEY, id, Date.now()] }]);
  return (await db.query<{ value: string }>('SELECT value FROM kv WHERE space = ? AND key = ?;', [DEVICE, INSTALLATION_KEY]))[0]?.value ?? id;
}

const isRemote = (payload: string) => Boolean((JSON.parse(payload) as { remote?: boolean }).remote);

/**
 * State storage of ONE data space on top of an SQL executor:
 * activities get one row each (ready for the sync outbox), the rest of the state is one kv row.
 * Only changed activity rows are written on each save. Every statement is scoped to the space.
 */
export function createSqlStorage(db: SqlExecutor, legacy?: () => string | null, space: string = GUEST_SPACE): SqlStateStorage {
  let ready: Promise<void> | null = null;
  const saved = new Map<string, string>();
  const outboxState = new Map<string, Pick<OutboxItem, 'status' | 'attempts'>>();
  let installation = '';

  const init = () => {
    if (!ready) {
      // A failed initialisation is not cached: the next save/load tries again (transient I/O errors).
      ready = (async () => {
        await runMigrations(db);
        const rows = await db.query<Row>('SELECT id, payload FROM activities WHERE space = ?;', [space]);
        for (const r of rows) saved.set(r.id, r.payload);
        // S10-02: create events of local-only actions that were queued by an older version and never
        // left the device are removed from the queue (the activities themselves are kept).
        const localOnly = [...saved.entries()]
          .filter(([, payload]) => syncPolicy(JSON.parse(payload) as ActivityLog) === 'local-only')
          .map(([id]) => id);
        if (localOnly.length > 0) {
          await db.transaction(
            localOnly.map((id) => ({
              sql: "DELETE FROM outbox WHERE space = ? AND event_id = ? AND operation = 'create' AND status = 'pending' AND attempts = 0;",
              values: [space, id],
            })),
          );
        }
        const ob = await db.query<{ event_id: string; status: OutboxItem['status']; attempts: number }>('SELECT event_id, status, attempts FROM outbox WHERE space = ?;', [space]);
        for (const r of ob) outboxState.set(r.event_id, { status: r.status, attempts: r.attempts });
        installation = await deviceInstallationId(db);
        // Activities saved before the outbox existed get their create event once. Entries that came
        // from the server (another device) are already there: never queued again (round 12.5).
        const orphanRows = await db.query<Row>(
          'SELECT a.id, a.payload FROM activities a LEFT JOIN outbox o ON o.space = a.space AND o.event_id = a.id WHERE a.space = ? AND o.event_id IS NULL;',
          [space],
        );
        const orphans = orphanRows.filter((r) => syncPolicy(JSON.parse(r.payload) as ActivityLog) !== 'local-only' && !isRemote(r.payload));
        if (orphans.length > 0) {
          const now = Date.now();
          const items = orphans.map((r) => newCreateItem(JSON.parse(r.payload) as ActivityLog, installation, now));
          await db.transaction(items.map((i) => ({ sql: OUTBOX_INSERT, values: outboxValues(space, i) })));
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
    space,
    async load() {
      await init();
      const kv = await db.query<{ value: string }>('SELECT value FROM kv WHERE space = ? AND key = ?;', [space, STATE_KEY]);
      if (!kv[0]) {
        // First run on this backend: carry over data from the browser storage, if any (guest only).
        return space === GUEST_SPACE ? (legacy?.() ?? null) : null;
      }
      const rest = JSON.parse(kv[0].value) as Record<string, unknown>;
      const rows = await db.query<Row>('SELECT id, payload FROM activities WHERE space = ? ORDER BY created_at DESC;', [space]);
      const logs = rows.map((r) => JSON.parse(r.payload) as ActivityLog);
      return JSON.stringify({ ...rest, logs });
    },
    async save(state) {
      await init();
      const { logs, ...rest } = state;
      const now = Date.now();
      const statements: Array<{ sql: string; values?: unknown[] }> = [
        {
          sql: 'INSERT INTO kv (space, key, value, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(space, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;',
          values: [space, STATE_KEY, JSON.stringify(rest), now],
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
          statements.push({ sql: OUTBOX_INSERT, values: outboxValues(space, item) });
          outboxPending.push([item.eventId, { status: item.status, attempts: 0 }]);
        }
        statements.push({ sql: ACTIVITY_UPSERT, values: activityValues(space, log, payload) });
      }
      const removed = [...saved.keys()].filter((id) => !keep.has(id));
      // Entries removed because another device deleted them: the deletion is already on the server.
      const remoteRemoved = new Set((state.sync as { remoteRemoved?: string[] } | undefined)?.remoteRemoved ?? []);
      for (const id of removed) {
        statements.push({ sql: 'DELETE FROM activities WHERE space = ? AND id = ?;', values: [space, id] });
        if (remoteRemoved.has(id)) {
          statements.push({ sql: "DELETE FROM outbox WHERE space = ? AND event_id = ? AND operation = 'create';", values: [space, id] });
          outboxState.delete(id);
          continue;
        }
        const current = outboxState.get(id);
        // An entry that came from another device exists on the server: deleting it here sends a void.
        const fromRemote = !current && isRemote(saved.get(id) ?? '{}');
        const plan = fromRemote ? 'enqueue-void' : undoPlan(current ? ({ ...current } as OutboxItem) : undefined);
        if (plan === 'drop-local') {
          statements.push({ sql: 'DELETE FROM outbox WHERE space = ? AND event_id = ?;', values: [space, id] });
          outboxDropped.push(id);
        } else if (plan === 'enqueue-void') {
          const voidId = `void:${id}`;
          const item: OutboxItem = { eventId: voidId, operation: 'void', targetEventId: id, payload: voidEventPayload(voidId, id, installation, now), status: 'pending', attempts: 0, nextAttemptAt: now, updatedAt: now };
          statements.push({ sql: OUTBOX_INSERT, values: outboxValues(space, item) });
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
      return (await db.query<OutboxRow>('SELECT * FROM outbox WHERE space = ? ORDER BY updated_at;', [space])).map(fromRow);
    },
    async saveOutbox(items) {
      await init();
      await db.transaction(
        items.map((i) => ({
          // The payload changes only for an item that never left the device (re-encoded as schema v2).
          sql: 'UPDATE outbox SET status = ?, attempts = ?, next_attempt_at = ?, reason_code = ?, accepted_score_delta = ?, updated_at = ?, payload = CASE WHEN attempts = 0 THEN ? ELSE payload END WHERE space = ? AND event_id = ?;',
          values: [i.status, i.attempts, i.nextAttemptAt, i.reasonCode ?? null, i.acceptedScoreDelta ?? null, i.updatedAt, i.payload, space, i.eventId],
        })),
      );
      for (const i of items) outboxState.set(i.eventId, { status: i.status, attempts: i.attempts });
    },
    async requeueAccepted() {
      await init();
      const rows = await db.query<{ event_id: string }>("SELECT event_id FROM outbox WHERE space = ? AND operation = 'create' AND status = 'accepted';", [space]);
      const now = Date.now();
      await db.transaction([
        { sql: "UPDATE outbox SET status = 'pending', next_attempt_at = ?, updated_at = ? WHERE space = ? AND operation = 'create' AND status = 'accepted';", values: [now, now, space] },
        // Deletions of entries that no longer exist in the cloud have nothing to delete.
        { sql: "DELETE FROM outbox WHERE space = ? AND operation = 'void';", values: [space] },
      ]);
      for (const r of rows) outboxState.set(r.event_id, { status: 'pending', attempts: outboxState.get(r.event_id)?.attempts ?? 1 });
      return rows.length;
    },
  };
}

/* ------------------------------ Data spaces (round 12.5) ------------------------------ */

/**
 * The data spaces on this device: the guest and each account that signed in here. Switching
 * accounts switches spaces; nothing moves between spaces except an explicit, user-confirmed
 * transfer (guest → account, or a deleted account → guest).
 */
export type SpaceManager = {
  readonly kind: StateStorage['kind'];
  active: () => Promise<string>;
  setActive: (space: string) => Promise<void>;
  open: (space: string) => Promise<StateStorage>;
  /** Number of recorded entries in a space (to offer a transfer only when there is something). */
  count: (space: string) => Promise<number>;
  /**
   * Moves the entries of `from` into `to` in one transaction. If `to` has no state yet, the whole
   * state (settings, habits, goals) moves with them; otherwise only the entries are added. The
   * sync state starts over and every movable entry is queued again for `to` (the server refuses
   * an entry that belongs to another account). `from` is empty afterwards.
   */
  transfer: (from: string, to: string) => Promise<{ moved: number; whole: boolean }>;
  /** Removes everything of a space from this device. */
  deleteSpace: (space: string) => Promise<void>;
};

const ACTIVE_KEY = 'active_space';
const FRESH_SYNC = { cursor: 0, remoteRemoved: [], lastSyncAt: null };
const asLocalEntry = (payload: string): ActivityLog => {
  const { remote: _remote, ...log } = JSON.parse(payload) as ActivityLog & { remote?: boolean };
  return log;
};

export function createSqlSpaces(db: SqlExecutor, legacy?: () => string | null): SpaceManager {
  const opened = new Map<string, SqlStateStorage>();
  const forget = (...spaces: string[]) => spaces.forEach((s) => opened.delete(s));
  return {
    kind: 'sqlite',
    async active() {
      await runMigrations(db);
      return (await db.query<{ value: string }>('SELECT value FROM kv WHERE space = ? AND key = ?;', [DEVICE, ACTIVE_KEY]))[0]?.value ?? GUEST_SPACE;
    },
    async setActive(space) {
      await runMigrations(db);
      await db.transaction([{ sql: 'INSERT INTO kv (space, key, value, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(space, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;', values: [DEVICE, ACTIVE_KEY, space, Date.now()] }]);
    },
    async open(space) {
      let s = opened.get(space);
      if (!s) {
        s = createSqlStorage(db, space === GUEST_SPACE ? legacy : undefined, space);
        opened.set(space, s);
      }
      return s;
    },
    async count(space) {
      await runMigrations(db);
      return Number((await db.query<{ n: number }>('SELECT COUNT(*) AS n FROM activities WHERE space = ?;', [space]))[0]?.n ?? 0);
    },
    async transfer(from, to) {
      if (from === to || from === DEVICE || to === DEVICE) throw new Error('invalid transfer');
      await runMigrations(db);
      const installation = await deviceInstallationId(db);
      const rows = await db.query<Row>('SELECT id, payload FROM activities WHERE space = ?;', [from]);
      const fromState = (await db.query<{ value: string }>('SELECT value FROM kv WHERE space = ? AND key = ?;', [from, STATE_KEY]))[0]?.value;
      const toHasState = (await db.query<{ n: number }>('SELECT COUNT(*) AS n FROM kv WHERE space = ? AND key = ?;', [to, STATE_KEY]))[0]?.n;
      const now = Date.now();
      const statements: Array<{ sql: string; values?: unknown[] }> = [];
      for (const r of rows) {
        const log = asLocalEntry(r.payload);
        const payload = JSON.stringify(log);
        statements.push({ sql: 'INSERT INTO activities (space, id, date_key, created_at, action_key, points_local, payload) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(space, id) DO NOTHING;', values: activityValues(to, log, payload) });
        if (syncPolicy(log) !== 'local-only') statements.push({ sql: OUTBOX_INSERT, values: outboxValues(to, newCreateItem(log, installation, now)) });
      }
      const whole = !toHasState && Boolean(fromState);
      if (whole && fromState) {
        const rest = { ...(JSON.parse(fromState) as Record<string, unknown>), sync: FRESH_SYNC };
        statements.push({ sql: 'INSERT INTO kv (space, key, value, updated_at) VALUES (?, ?, ?, ?);', values: [to, STATE_KEY, JSON.stringify(rest), now] });
      }
      statements.push(
        { sql: 'DELETE FROM activities WHERE space = ?;', values: [from] },
        { sql: 'DELETE FROM outbox WHERE space = ?;', values: [from] },
        { sql: 'DELETE FROM kv WHERE space = ?;', values: [from] },
      );
      await db.transaction(statements);
      forget(from, to);
      return { moved: rows.length, whole };
    },
    async deleteSpace(space) {
      if (space === DEVICE) throw new Error('invalid space');
      await runMigrations(db);
      await db.transaction([
        { sql: 'DELETE FROM activities WHERE space = ?;', values: [space] },
        { sql: 'DELETE FROM outbox WHERE space = ?;', values: [space] },
        { sql: 'DELETE FROM kv WHERE space = ?;', values: [space] },
      ]);
      forget(space);
    },
  };
}

/** Opens the on-device SQLite database through @capacitor-community/sqlite (native only). */
export async function openNativeSpaces(): Promise<SpaceManager> {
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
  return createSqlSpaces(executor, legacy);
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
