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

/* ------------------------------ Data spaces in browser storage (round 12.5) ------------------------------ */

const ACTIVE_SPACE_KEY = 'mitzvot_plus_active_space';
/** The guest keeps the original key (existing data is the guest's); each account has its own key. */
export const spaceKey = (space: string) => (space === 'guest' ? LEGACY_STORAGE_KEY : `${LEGACY_STORAGE_KEY}@${space}`);

type LocalSpaces = {
  readonly kind: 'localStorage';
  active: () => Promise<string>;
  setActive: (space: string) => Promise<void>;
  open: (space: string) => Promise<StateStorage>;
  count: (space: string) => Promise<number>;
  transfer: (from: string, to: string) => Promise<{ moved: number; whole: boolean }>;
  deleteSpace: (space: string) => Promise<void>;
};

/** Same contract as createSqlSpaces (web and development builds; no outbox in the browser). */
export function localStorageSpaces(store: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> = window.localStorage): LocalSpaces {
  const read = (space: string) => {
    const raw = store.getItem(spaceKey(space));
    return raw ? (JSON.parse(raw) as { logs?: ActivityLog[] } & Record<string, unknown>) : null;
  };
  return {
    kind: 'localStorage',
    active: async () => store.getItem(ACTIVE_SPACE_KEY) ?? 'guest',
    setActive: async (space) => store.setItem(ACTIVE_SPACE_KEY, space),
    open: async (space) => ({
      kind: 'localStorage',
      load: async () => store.getItem(spaceKey(space)),
      save: async (state) => {
        store.setItem(spaceKey(space), JSON.stringify(state));
      },
    }),
    count: async (space) => read(space)?.logs?.length ?? 0,
    transfer: async (from, to) => {
      if (from === to) throw new Error('invalid transfer');
      const source = read(from);
      if (!source) return { moved: 0, whole: false };
      const logs = (source.logs ?? []).map(({ remote: _remote, ...l }) => l as ActivityLog);
      const target = read(to);
      const fresh = { cursor: 0, remoteRemoved: [], lastSyncAt: null };
      const next = target
        ? { ...target, logs: [...(target.logs ?? []), ...logs.filter((l) => !(target.logs ?? []).some((t) => t.id === l.id))] }
        : { ...source, logs, sync: fresh };
      store.setItem(spaceKey(to), JSON.stringify(next));
      store.removeItem(spaceKey(from));
      return { moved: logs.length, whole: !target };
    },
    deleteSpace: async (space) => store.removeItem(spaceKey(space)),
  };
}
