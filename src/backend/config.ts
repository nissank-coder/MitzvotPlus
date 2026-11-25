/**
 * Backend configuration (round 12). The app talks to a server ONLY in development / staging builds
 * that set all three variables; production builds have none, so the whole account and sync code is
 * removed from the bundle (check:release fails if Supabase code appears in a production build).
 * The anon key is public by design (it only allows what row-level security allows); the service
 * role key is never used by the app and must never be put in VITE_* variables.
 */
export type BackendEnv = 'development' | 'staging';

// Direct import.meta.env references: Vite replaces them with constants, so a production build
// (no variables) folds BACKEND_ENABLED to false and drops every lazy import that depends on it.
export const BACKEND = {
  url: import.meta.env.VITE_SUPABASE_URL ?? '',
  anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
  env: (import.meta.env.VITE_BACKEND_ENV ?? '') as BackendEnv | '',
};

export const BACKEND_ENABLED: boolean =
  (import.meta.env.VITE_BACKEND_ENV === 'development' || import.meta.env.VITE_BACKEND_ENV === 'staging') &&
  Boolean(import.meta.env.VITE_SUPABASE_URL) &&
  Boolean(import.meta.env.VITE_SUPABASE_ANON_KEY);
