/**
 * Feature switches. Documented, visible to every user, and never tied to who is using the app
 * (no reviewer detection – see docs/mobile-readiness).
 *
 * demoContent: mock community data, the "weekly benefit" card and the demo-history loader.
 * It is ON in `npm run dev` and OFF in production builds (the native app) unless the build
 * is made with VITE_DEMO_CONTENT=true for an internal demo.
 */
export const FEATURES = {
  demoContent: import.meta.env.DEV || import.meta.env.VITE_DEMO_CONTENT === 'true',
} as const;

/** The community module is mock-only until decision D09 and backend stage G3/G4. */
export const COMMUNITY_ENABLED = FEATURES.demoContent;
