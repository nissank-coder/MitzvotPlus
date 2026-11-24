/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "true" to show demo / mock content in a build (never in a store build). */
  readonly VITE_DEMO_CONTENT?: string;
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
