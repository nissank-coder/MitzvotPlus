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

/**
 * Browser storage – used on the web and in development.
 * A failed write (e.g. QuotaExceededError) is thrown to the caller, never swallowed:
 * the save controller reports it to the user and retries.
 */
export function localStorageStorage(store: Pick<Storage, 'getItem' | 'setItem'> = window.localStorage): StateStorage {
  return {
    kind: 'localStorage',
    // A read failure is also thrown, so the app refuses to start over existing data (see AppStore).
    load: async () => store.getItem(LEGACY_STORAGE_KEY),
    save: async (state) => {
      store.setItem(LEGACY_STORAGE_KEY, JSON.stringify(state));
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
