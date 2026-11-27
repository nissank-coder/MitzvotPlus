import type { SqlExecutor } from './migrations';
import { LEGACY_STORAGE_KEY } from './persistence';
import { createSqlSpaces } from './sqliteStorage';

/**
 * "לומדים יחד" – web STAGING builds only (VITE_WEB_SQLITE=true): the app's own SQLite storage
 * (createSqlSpaces – the same tables, outbox and sync as on a phone) running in the browser with
 * sql.js (SQLite compiled to WebAssembly). The database is written back to this browser's storage
 * after every change. A production build never contains it (check:release), and the phone apps
 * keep their native SQLite – a browser is a demonstration, not a phone.
 */
const KEY = 'mitzvot_web_sqlite_v1';
const toBase64 = (bytes: Uint8Array) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const fromBase64 = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

export async function openWebSqlSpaces() {
  const [{ default: initSqlJs }, { default: wasmUrl }] = await Promise.all([import('sql.js'), import('sql.js/dist/sql-wasm.wasm?url')]);
  const SQL = await initSqlJs({ locateFile: () => wasmUrl });
  const saved = localStorage.getItem(KEY);
  const db = saved ? new SQL.Database(fromBase64(saved)) : new SQL.Database();
  const persist = () => localStorage.setItem(KEY, toBase64(db.export()));
  const exec: SqlExecutor = {
    execute: async (sql) => {
      db.exec(sql);
      persist();
    },
    query: async <T,>(sql: string, values: unknown[] = []) => {
      const st = db.prepare(sql);
      st.bind(values as never);
      const rows: T[] = [];
      while (st.step()) rows.push(st.getAsObject() as T);
      st.free();
      return rows;
    },
    transaction: async (statements) => {
      db.exec('BEGIN');
      try {
        for (const s of statements) db.run(s.sql, (s.values ?? []) as never);
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
      persist();
    },
  };
  return createSqlSpaces(exec, () => localStorage.getItem(LEGACY_STORAGE_KEY));
}
