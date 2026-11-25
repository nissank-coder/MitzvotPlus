import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { memorySecureStore } from '../native/secureStore';
import { DbAdapter, DbHandle, ENCRYPTED_DB, openEncryptedDatabase, PLAIN_DB } from '../storage/encryptedDb';
import { createSqlStorage } from '../storage/sqliteStorage';
import { createFreshState, reducer } from '../store/state';

/**
 * Round 11 §2 – safe migration to an encrypted database. node:sqlite stands in for SQLCipher
 * (no real encryption here: the native path is the plugin's, verified on devices). What is tested is
 * the orchestration: copy, verify, switch, cleanup, failures, key loss.
 */
const NOW = Date.UTC(2026, 10, 24, 10);

function fakePlatform(opts: { failInsertAfter?: number; corruptCopy?: boolean } = {}) {
  const files = new Map<string, DatabaseSync>();
  const keys = new Map<string, string | null>();
  const registered: string[] = [];
  let inserts = 0;
  const handle = (name: string, db: DatabaseSync): DbHandle => ({
    execute: async (sql) => void db.exec(sql),
    query: async <T,>(sql: string, values: unknown[] = []) => db.prepare(sql).all(...(values as never[])) as T[],
    transaction: async (statements) => {
      db.exec('BEGIN');
      try {
        for (const s of statements) {
          if (name === ENCRYPTED_DB && /^INSERT/.test(s.sql)) {
            inserts += 1;
            if (opts.failInsertAfter !== undefined && inserts > opts.failInsertAfter) throw new Error('disk full (simulated)');
          }
          const values = [...((s.values ?? []) as never[])];
          if (opts.corruptCopy && name === ENCRYPTED_DB && /^INSERT INTO activities/.test(s.sql)) values[values.length - 1] = '{}' as never;
          db.prepare(s.sql).run(...values);
        }
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
    close: async () => undefined,
  });
  const adapter: DbAdapter = {
    exists: async (n) => files.has(n),
    open: async (n, key) => {
      if (files.has(n) && (keys.get(n) ?? null) !== key) throw new Error(`wrong key for ${n}`);
      if (!files.has(n)) {
        files.set(n, new DatabaseSync(':memory:'));
        keys.set(n, key);
      }
      return handle(n, files.get(n)!);
    },
    remove: async (n) => void files.delete(n),
    registerKey: async (k) => void registered.push(k),
  };
  return { adapter, files, registered };
}

async function seedPlain(adapter: DbAdapter, entries = 3) {
  const db = await adapter.open(PLAIN_DB, null);
  let s = createFreshState(NOW);
  for (let i = 0; i < entries; i += 1) s = reducer(s, { type: 'addAction', payload: { key: 'chesed', now: NOW + i * 86_400_000 } });
  await createSqlStorage(db).save(s);
  return s;
}

const count = async (db: DbHandle, table: string) => (await db.query<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table};`))[0]!.n;

describe('encrypted database – safe migration', () => {
  it('fresh install: creates only the encrypted database and a key in the secure store', async () => {
    const { adapter, files, registered } = fakePlatform();
    const secure = memorySecureStore();
    const r = await openEncryptedDatabase(adapter, secure);
    expect(r.status).toBe('fresh');
    expect([...files.keys()]).toEqual([ENCRYPTED_DB]);
    const key = await secure.get('device', 'db-key');
    expect(key).toMatch(/^[A-Za-z0-9+/]{43}=$/); // 32 random bytes
    expect(registered).toEqual([key]);
  });

  it('existing user: copies every row, verifies, switches – and keeps the plain database until a later launch', async () => {
    const { adapter, files } = fakePlatform();
    const secure = memorySecureStore();
    await seedPlain(adapter, 3);
    const r = await openEncryptedDatabase(adapter, secure);
    expect(r.status).toBe('migrated');
    expect(await count(r.db!, 'activities')).toBe(3);
    expect(await count(r.db!, 'outbox')).toBe(3);
    expect(files.has(PLAIN_DB)).toBe(true); // not deleted yet
    // Next launch: encrypted opens, passes the integrity check → the plain copy is removed.
    const again = await openEncryptedDatabase(adapter, secure);
    expect(again.status).toBe('encrypted');
    expect(files.has(PLAIN_DB)).toBe(false);
    expect(await count(again.db!, 'activities')).toBe(3);
  });

  it('a failure during the copy (e.g. disk full) leaves the plain database active and complete', async () => {
    const { adapter, files } = fakePlatform({ failInsertAfter: 2 });
    const secure = memorySecureStore();
    await seedPlain(adapter, 3);
    const r = await openEncryptedDatabase(adapter, secure);
    expect(r.status).toBe('migration-failed');
    expect(files.has(ENCRYPTED_DB)).toBe(false); // half copy removed
    expect(await count(r.db!, 'activities')).toBe(3); // plain intact and in use
    expect(await secure.get('device', 'db-active')).toBeNull();
  });

  it('a copy that does not verify is never switched to', async () => {
    const { adapter, files } = fakePlatform({ corruptCopy: true });
    const secure = memorySecureStore();
    await seedPlain(adapter, 2);
    const r = await openEncryptedDatabase(adapter, secure);
    expect(r).toMatchObject({ status: 'migration-failed', reason: expect.stringContaining('verification failed') });
    expect(files.has(ENCRYPTED_DB)).toBe(false);
    expect(files.has(PLAIN_DB)).toBe(true);
  });

  it('key lost after migration: recovery – nothing deleted, no empty database opened', async () => {
    const { adapter, files } = fakePlatform();
    const secure = memorySecureStore();
    await seedPlain(adapter, 2);
    await openEncryptedDatabase(adapter, secure);
    await openEncryptedDatabase(adapter, secure); // plain removed
    await secure.remove('device', 'db-key'); // e.g. restored on a new device without the Keychain item
    const r = await openEncryptedDatabase(adapter, secure);
    expect(r.status).toBe('recovery');
    expect(r.db).toBeNull();
    expect(files.has(ENCRYPTED_DB)).toBe(true);
  });

  it('key lost before the switch completed: keeps using the plain database', async () => {
    const { adapter, files } = fakePlatform({ failInsertAfter: 0 });
    const secure = memorySecureStore();
    await seedPlain(adapter, 2);
    await openEncryptedDatabase(adapter, secure); // fails, encrypted removed
    files.set(ENCRYPTED_DB, new DatabaseSync(':memory:')); // a stray file
    await secure.remove('device', 'db-key');
    const r = await openEncryptedDatabase(adapter, secure);
    expect(r.status).toBe('recovery');
    expect(await count(r.db!, 'activities')).toBe(2);
  });
});

describe('encrypted database – hardening (round 12)', () => {
  it('temporary data stays in memory and deleted content is overwritten', async () => {
    const { adapter } = fakePlatform();
    const r = await openEncryptedDatabase(adapter, memorySecureStore());
    const temp = await r.db!.query<{ temp_store: number }>('PRAGMA temp_store;');
    const sd = await r.db!.query<{ secure_delete: number }>('PRAGMA secure_delete;');
    expect(temp[0]?.temp_store).toBe(2); // MEMORY
    expect(sd[0]?.secure_delete).toBe(1);
  });
  it('an interrupted migration (crash before the switch) is retried from scratch; the plain DB stays intact', async () => {
    const { adapter, files } = fakePlatform({ failInsertAfter: 1 });
    const secure = memorySecureStore();
    await seedPlain(adapter, 3);
    expect((await openEncryptedDatabase(adapter, secure)).status).toBe('migration-failed');
    // next launch (no failure this time): a clean migration
    const ok = fakePlatform();
    for (const [n, d] of files) ok.files.set(n, d);
    const r = await openEncryptedDatabase(ok.adapter, secure);
    expect(r.status).toBe('migrated');
    expect(await count(r.db!, 'activities')).toBe(3);
  });
});
