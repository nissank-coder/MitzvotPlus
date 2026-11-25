import type { SqlExecutor } from './migrations';
import { runMigrations } from './migrations';
import type { SecureStore } from '../native/secureStore';

/**
 * Encrypted database with a SAFE migration from the existing plain database (round 11 §2).
 *
 * Disabled until the owner decides D11 (DB_ENCRYPTION build flag). When enabled:
 *  1. A 256-bit key is generated once and kept in the secure store (Keychain "this device only" /
 *     Android Keystore) – never in code, Preferences or localStorage.
 *  2. If a plain database exists, a NEW encrypted database is created under another name and every
 *     row is copied. The plain database is NOT touched: no in-place conversion.
 *  3. The copy is verified (row counts + a checksum of every row, table by table). Only then the
 *     active database is switched (marker in the secure store).
 *  4. The plain database is deleted only on a LATER launch, after the encrypted one opened and
 *     verified again. Until then it is the fallback.
 *  5. Any failure before the switch leaves the plain database active and intact. A missing key with
 *     an existing encrypted database is "recovery": nothing is deleted or overwritten, the user is
 *     told – never a silent fallback to an empty database.
 */

export const PLAIN_DB = 'mitzvotplus';
export const ENCRYPTED_DB = 'mitzvotplus_enc';
const PARTITION = 'device';
const KEY = 'db-key';
const ACTIVE = 'db-active';
const PENDING_CLEANUP = 'db-plain-cleanup';

export type DbHandle = SqlExecutor & { close: () => Promise<void> };

/** What the platform must provide (native: @capacitor-community/sqlite; tests: node:sqlite). */
export type DbAdapter = {
  exists: (name: string) => Promise<boolean>;
  open: (name: string, key: string | null) => Promise<DbHandle>;
  remove: (name: string) => Promise<void>;
  /** Hands the key to the SQLCipher layer (setEncryptionSecret on native). */
  registerKey: (key: string) => Promise<void>;
};

export type EncryptedOpenResult =
  | { status: 'fresh' | 'migrated' | 'encrypted'; db: DbHandle }
  | { status: 'recovery'; reason: string; db: DbHandle | null }
  | { status: 'migration-failed'; reason: string; db: DbHandle };

const TABLES = ['kv', 'activities', 'outbox'] as const;

function randomKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

/** Row count and an order-independent checksum of one table (FNV-1a over sorted rows). */
async function fingerprint(db: SqlExecutor, table: string): Promise<{ rows: number; sum: string }> {
  const rows = await db.query<Record<string, unknown>>(`SELECT * FROM ${table};`);
  const lines = rows.map((r) => JSON.stringify(Object.keys(r).sort().map((k) => [k, r[k]]))).sort();
  let h = 0x811c9dc5;
  for (const line of lines) {
    for (let i = 0; i < line.length; i += 1) {
      h ^= line.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
  }
  return { rows: rows.length, sum: h.toString(16) };
}

async function copyAll(from: SqlExecutor, to: SqlExecutor): Promise<void> {
  const statements: Array<{ sql: string; values: unknown[] }> = [];
  for (const table of TABLES) {
    const rows = await from.query<Record<string, unknown>>(`SELECT * FROM ${table};`);
    statements.push({ sql: `DELETE FROM ${table};`, values: [] });
    for (const r of rows) {
      const cols = Object.keys(r);
      statements.push({
        sql: `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')});`,
        values: cols.map((c) => r[c]),
      });
    }
  }
  // One transaction: either every row is copied or none.
  await to.transaction(statements);
}

async function verify(a: SqlExecutor, b: SqlExecutor): Promise<string | null> {
  for (const table of TABLES) {
    const [x, y] = await Promise.all([fingerprint(a, table), fingerprint(b, table)]);
    if (x.rows !== y.rows || x.sum !== y.sum) return `${table}: ${x.rows}/${x.sum} vs ${y.rows}/${y.sum}`;
  }
  return null;
}

/**
 * Hardening for the encrypted database (round 12): temporary tables and sorts stay in memory (no
 * unencrypted temp files), deleted content is overwritten. SQLCipher encrypts every page, including
 * the WAL / journal, with the same key.
 */
export async function hardenEncrypted(db: SqlExecutor): Promise<void> {
  await db.execute('PRAGMA temp_store = MEMORY;');
  await db.execute('PRAGMA secure_delete = ON;');
}

export async function openEncryptedDatabase(adapter: DbAdapter, secure: SecureStore): Promise<EncryptedOpenResult> {
  const active = await secure.get(PARTITION, ACTIVE);
  let key = await secure.get(PARTITION, KEY);
  const encExists = await adapter.exists(ENCRYPTED_DB);
  const plainExists = await adapter.exists(PLAIN_DB);

  // Key lost but encrypted data exists: never overwrite it, never fall back to an empty database.
  if (!key && encExists) {
    if (plainExists && active !== ENCRYPTED_DB) {
      const db = await adapter.open(PLAIN_DB, null);
      return { status: 'recovery', reason: 'encryption key missing; plain database kept active', db };
    }
    return { status: 'recovery', reason: 'encryption key missing for the encrypted database', db: null };
  }
  if (!key) {
    key = randomKey();
    await secure.set(PARTITION, KEY, key);
  }
  await adapter.registerKey(key);

  // Already migrated: open, and remove the old plain database only once this open succeeded.
  if (active === ENCRYPTED_DB && encExists) {
    const db = await adapter.open(ENCRYPTED_DB, key);
    await hardenEncrypted(db);
    await runMigrations(db);
    // The encrypted copy was verified row by row at migration time. It may have new entries since,
    // so the old copy is not compared again: it is removed once the encrypted database opened on a
    // later launch and passes SQLite's integrity check.
    if (plainExists && (await secure.get(PARTITION, PENDING_CLEANUP)) === '1') {
      const check = await db.query<{ integrity_check: string }>('PRAGMA integrity_check;');
      if (check[0]?.integrity_check === 'ok') {
        await adapter.remove(PLAIN_DB);
        await secure.remove(PARTITION, PENDING_CLEANUP);
      }
    }
    return { status: 'encrypted', db };
  }

  if (!plainExists) {
    const db = await adapter.open(ENCRYPTED_DB, key);
    await hardenEncrypted(db);
    await runMigrations(db);
    await secure.set(PARTITION, ACTIVE, ENCRYPTED_DB);
    return { status: 'fresh', db };
  }

  // Migrate: plain → new encrypted copy → verify → switch. The plain database stays untouched.
  const plain = await adapter.open(PLAIN_DB, null);
  await runMigrations(plain);
  let enc: DbHandle | null = null;
  try {
    if (encExists) await adapter.remove(ENCRYPTED_DB); // a half-finished earlier attempt, never active
    enc = await adapter.open(ENCRYPTED_DB, key);
    await hardenEncrypted(enc);
    await runMigrations(enc);
    await copyAll(plain, enc);
    const diff = await verify(plain, enc);
    if (diff) throw new Error(`verification failed: ${diff}`);
    await secure.set(PARTITION, ACTIVE, ENCRYPTED_DB);
    await secure.set(PARTITION, PENDING_CLEANUP, '1');
    await plain.close();
    return { status: 'migrated', db: enc };
  } catch (error) {
    if (enc) await enc.close().catch(() => undefined);
    await adapter.remove(ENCRYPTED_DB).catch(() => undefined);
    return { status: 'migration-failed', reason: error instanceof Error ? error.message : String(error), db: plain };
  }
}
