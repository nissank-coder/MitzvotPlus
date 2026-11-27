/**
 * Feature switches. Documented, visible to every user, and never tied to who is using the app
 * (no reviewer detection – see docs/mobile-readiness).
 *
 * Top-level constants on purpose: Vite replaces import.meta.env at build time, so in a production
 * build the demo-only code is removed entirely (verified by scripts/check-release.mjs).
 */

/** Mock community data, the "weekly benefit" card, the demo-history loader and TEST_ONLY content.
 *  ON in `npm run dev`; OFF in production builds unless built with VITE_DEMO_CONTENT=true for an internal demo. */
export const DEMO_CONTENT: boolean = import.meta.env.DEV || import.meta.env.VITE_DEMO_CONTENT === 'true';

/** Kept for existing imports. */
export const FEATURES = { demoContent: DEMO_CONTENT } as const;

/** The community module is mock-only until decision D09 and backend stage G3/G4. */
export const COMMUNITY_ENABLED: boolean = DEMO_CONTENT;

/**
 * "לומדים יחד" – the REAL social challenge (main decision doc §3): its own switch, separate from the
 * demo content, and only in a build with a backend (staging). Production builds have neither.
 */
export const SOCIAL_ENABLED: boolean =
  import.meta.env.VITE_SOCIAL === 'true' &&
  (import.meta.env.VITE_BACKEND_ENV === 'staging' || import.meta.env.VITE_BACKEND_ENV === 'development') &&
  Boolean(import.meta.env.VITE_SUPABASE_URL);

/**
 * Server sync (stage G3). Off until the backend exists and D04 is decided. While off, every point is
 * local and provisional; the UI says so instead of presenting it as confirmed.
 */
export const SYNC_ENABLED = false;

/** Reminders / notifications (D12). Off: there is no delivery mechanism, so no toggle is shown. */
export const NOTIFICATIONS_ENABLED = false;

/**
 * Encrypted database (round 11 §2): off until the owner decides D11. Turning it on also needs
 * `iosIsEncryption: true` / `androidIsEncryption: true` in capacitor.config.ts and device evidence.
 * See src/storage/encryptedDb.ts for the safe migration.
 */
export const DB_ENCRYPTION: boolean = import.meta.env.VITE_DB_ENCRYPTION === 'true';
