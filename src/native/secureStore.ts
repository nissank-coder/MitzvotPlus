import { Capacitor } from '@capacitor/core';

/**
 * Storage for secrets (session tokens, DB encryption key) – Keychain on iOS, Keystore-backed on Android
 * (spec §5: not Preferences, not localStorage). Not used by any feature yet: no secrets exist until
 * authentication (D04) or database encryption (D11) is decided.
 *
 * Each identity gets its own partition so logout can remove exactly that account's secrets.
 * In a regular browser there is no secure store: values live in memory only and are lost on reload.
 */
export type SecureStore = {
  readonly kind: 'native' | 'memory';
  get: (partition: string, key: string) => Promise<string | null>;
  set: (partition: string, key: string, value: string) => Promise<void>;
  remove: (partition: string, key: string) => Promise<void>;
  /** Removes every secret of one partition (e.g. on logout or account deletion). */
  clearPartition: (partition: string) => Promise<void>;
};

const SEP = '::';
export const fullKey = (partition: string, key: string): string => {
  if (!/^[a-z0-9_-]+$/i.test(partition) || partition.includes(SEP)) throw new Error('invalid partition');
  return `${partition}${SEP}${key}`;
};

export function memorySecureStore(): SecureStore {
  const data = new Map<string, string>();
  return {
    kind: 'memory',
    get: async (p, k) => data.get(fullKey(p, k)) ?? null,
    set: async (p, k, v) => void data.set(fullKey(p, k), v),
    remove: async (p, k) => void data.delete(fullKey(p, k)),
    clearPartition: async (p) => {
      const prefix = fullKey(p, '');
      for (const key of [...data.keys()]) if (key.startsWith(prefix)) data.delete(key);
    },
  };
}

/** Keychain / Keystore through @aparajita/capacitor-secure-storage (MIT, pinned 8.0.1). */
async function nativeSecureStore(): Promise<SecureStore> {
  const { SecureStorage, KeychainAccess } = await import('@aparajita/capacitor-secure-storage');
  await SecureStorage.setKeyPrefix('mitzvotplus_');
  // Never sync secrets to iCloud Keychain, and do not migrate them to another device (pending D11).
  await SecureStorage.setSynchronize(false);
  await SecureStorage.setDefaultKeychainAccess(KeychainAccess.whenUnlockedThisDeviceOnly);
  return {
    kind: 'native',
    get: async (p, k) => {
      const v = await SecureStorage.get(fullKey(p, k), false);
      return typeof v === 'string' ? v : v === null ? null : JSON.stringify(v);
    },
    set: async (p, k, v) => SecureStorage.set(fullKey(p, k), v, false),
    remove: async (p, k) => void (await SecureStorage.remove(fullKey(p, k))),
    clearPartition: async (p) => {
      const prefix = fullKey(p, '');
      const keys = await SecureStorage.keys();
      await Promise.all(keys.filter((k) => k.startsWith(prefix)).map((k) => SecureStorage.remove(k)));
    },
  };
}

export async function openSecureStore(): Promise<SecureStore> {
  return Capacitor.isNativePlatform() ? nativeSecureStore() : memorySecureStore();
}
