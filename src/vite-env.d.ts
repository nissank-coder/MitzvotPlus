/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "true" to show demo / mock content in a build (never in a store build). */
  readonly VITE_DEMO_CONTENT?: string;
  /** "true" turns on the encrypted database (D11; off by default). */
  readonly VITE_DB_ENCRYPTION?: string;
  /** Backend (round 12) – development / staging only; never in a production build. */
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /** Round 13: the project's publishable key (sb_publishable_…), the newer name of the public key. */
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  readonly VITE_BACKEND_ENV?: string;
  /** Round 13: social sign-in shown in the account section, e.g. "google,apple" (dev/staging only). */
  readonly VITE_AUTH_PROVIDERS?: string;
  /** "לומדים יחד": the real social challenge (staging builds only, with a backend). */
  readonly VITE_SOCIAL?: string;
  /** Staging test accounts: sign in with an e-mail and a password (never in production). */
  readonly VITE_AUTH_PASSWORD?: string;
  /** Web staging builds: the app's SQLite storage in the browser (sql.js), so sync works there too. */
  readonly VITE_WEB_SQLITE?: string;
}

/** Injected by vite.config.ts (scripts/build-info.mjs). */
declare const __BUILD_INFO__: {
  version: string;
  commit: string | null;
  commitSource: 'ci' | 'git' | null;
  /** Built from a working tree with changes not in the commit. */
  dirty: boolean;
  builtAt: string;
  fingerprint: string;
  kind: 'dev-server' | 'build';
};

// sql.js has no bundled types; only the few calls of src/storage/webSqlite.ts are used.
declare module 'sql.js' {
  type Statement = { bind(v: unknown): void; step(): boolean; getAsObject(): Record<string, unknown>; free(): void };
  type Database = { exec(sql: string): unknown; run(sql: string, values?: unknown): void; prepare(sql: string): Statement; export(): Uint8Array };
  const initSqlJs: (o: { locateFile: (f: string) => string }) => Promise<{ Database: new (data?: Uint8Array) => Database }>;
  export default initSqlJs;
}
