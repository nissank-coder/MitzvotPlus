import type { SupabaseClient } from '@supabase/supabase-js';
import { openSecureStore } from '../native/secureStore';
import { BACKEND } from './config';

/**
 * Supabase client with the session (access + refresh token) kept in the secure store
 * (Keychain / Keystore partition "auth"), never in localStorage. Tokens refresh automatically.
 */
let client: Promise<SupabaseClient> | null = null;

export function supabaseClient(): Promise<SupabaseClient> {
  if (!client) {
    client = (async () => {
      const [{ createClient }, secure] = await Promise.all([import('@supabase/supabase-js'), openSecureStore()]);
      return createClient(BACKEND.url, BACKEND.anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          // Round 13: Google / Apple with PKCE – the app exchanges the returned code itself (the
          // verifier is kept in the secure store); a session is never read from a URL.
          detectSessionInUrl: false,
          flowType: 'pkce',
          storageKey: 'session',
          storage: {
            getItem: (k) => secure.get('auth', k),
            setItem: (k, v) => secure.set('auth', k, v),
            removeItem: (k) => secure.remove('auth', k),
          },
        },
      });
    })();
  }
  return client;
}
