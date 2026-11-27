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
