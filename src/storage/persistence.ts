import { ActivityLog } from '../types';

/**
 * Where the app state lives. The serialized form is the same JSON the store already
 * understands (see loadState), so storage backends can change without touching app logic.
 */
export type StateStorage = {
  readonly kind: 'sqlite' | 'localStorage' | 'memory';
  /** The stored state as JSON, or null when nothing was saved yet. */
  load: () => Promise<string | null>;
  save: (state: { logs: ActivityLog[] } & Record<string, unknown>) => Promise<void>;
};

export const LEGACY_STORAGE_KEY = 'mitzvot_plus_state_v1';

/** Browser storage – used on the web and in development. */
export function localStorageStorage(): StateStorage {
  return {
    kind: 'localStorage',
    load: async () => {
      try {
        return window.localStorage.getItem(LEGACY_STORAGE_KEY);
      } catch {
        return null;
      }
    },
    save: async (state) => {
      try {
        window.localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(state));
      } catch (error) {
        console.warn('Could not save app data', error);
      }
    },
  };
}

export function memoryStorage(initial: string | null = null): StateStorage & { dump: () => string | null } {
  let value = initial;
  return {
    kind: 'memory',
    load: async () => value,
    save: async (state) => {
      value = JSON.stringify(state);
    },
    dump: () => value,
  };
}
