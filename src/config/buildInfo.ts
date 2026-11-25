import { DEMO_CONTENT } from './features';

export type AppMode = 'Development' | 'Demo' | 'Production';

/** Which code is running (round 9 §2). See docs/mobile-readiness/build-identification.md. */
export const BUILD_INFO = {
  ...__BUILD_INFO__,
  mode: (import.meta.env.DEV ? 'Development' : DEMO_CONTENT ? 'Demo' : 'Production') as AppMode,
};
