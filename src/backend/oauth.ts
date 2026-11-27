import { URL_SCHEME } from '../native/deepLinks';

/**
 * Sign-in with Google or Apple next to guest use (round 13, review §6). Development / staging builds
 * only (the account code is not in a production bundle). OAuth with PKCE (RFC 7636) in the system
 * browser (RFC 8252 – never an embedded web view): the app asks Supabase for the provider's page,
 * the browser returns to the app at `mitzvotplus://auth/callback?code=…`, and the app exchanges
 * the code for a session with the verifier it kept – a code that this app did not ask for (a
 * crafted link) cannot be exchanged. The e-mail code stays as it was.
 *
 * Nothing is enabled until the providers are configured in the Supabase project and listed in
 * VITE_AUTH_PROVIDERS (see docs/mobile-readiness/round-12.5/SUPABASE_SETUP_HE.md).
 */
export type OAuthProvider = 'google' | 'apple';
const KNOWN: OAuthProvider[] = ['google', 'apple'];

export const NATIVE_AUTH_CALLBACK = `${URL_SCHEME}://auth/callback`;
/** On the web (development in a browser): back to the app's own page, marked as a sign-in return. */
export const WEB_AUTH_MARK = 'auth=callback';

export function enabledProviders(raw: string | undefined = import.meta.env.VITE_AUTH_PROVIDERS): OAuthProvider[] {
  const wanted = String(raw ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase());
  return KNOWN.filter((p) => wanted.includes(p));
}

export function authRedirect(native: boolean, origin: string): string {
  return native ? NATIVE_AUTH_CALLBACK : `${origin}/?${WEB_AUTH_MARK}`;
}

export type AuthCallback = { kind: 'code'; code: string } | { kind: 'error'; error: string; description: string };

/**
 * A sign-in return: `mitzvotplus://auth/callback?code=…` (or `?error=…` when the user cancelled at
 * the provider), or the web page with `?auth=callback&code=…`. Anything else is not one (null).
 */
export function parseAuthCallback(url: string, webOrigin?: string): AuthCallback | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const native = u.protocol === `${URL_SCHEME}:` && u.hostname === 'auth' && u.pathname === '/callback';
  const web = webOrigin !== undefined && u.origin === webOrigin && u.searchParams.get('auth') === 'callback';
  if (!native && !web) return null;
  // Supabase puts an error in the query (PKCE) or, for some providers, in the fragment.
  const params = new URLSearchParams(u.search);
  const hash = new URLSearchParams(u.hash.replace(/^#/, ''));
  const error = params.get('error') ?? hash.get('error');
  if (error) return { kind: 'error', error, description: params.get('error_description') ?? hash.get('error_description') ?? '' };
  const code = params.get('code');
  if (!code || !/^[A-Za-z0-9._~-]{8,512}$/.test(code)) return null;
  return { kind: 'code', code };
}

/**
 * Sign-in returns arrive in the native shell (a deep link), possibly before the account section is
 * on screen (cold start). They wait here for it; only the newest one is kept.
 */
let pending: AuthCallback | null = null;
const listeners = new Set<(cb: AuthCallback) => void>();
/**
 * "לומדים יחד" (review §5ב.2): the app is notified of every return, also on a cold start that opens
 * on Home, so it can bring the account screen up at once – the return no longer waits until the
 * user happens to open the profile. Observers do not consume it; the account section still does.
 */
const observers = new Set<(cb: AuthCallback) => void>();
export function deliverAuthCallback(cb: AuthCallback) {
  if (listeners.size === 0) pending = cb;
  for (const o of observers) o(cb);
  for (const l of listeners) l(cb);
}
export function onAuthReturn(observer: (cb: AuthCallback) => void): () => void {
  observers.add(observer);
  if (pending) observer(pending); // arrived before the app was listening (cold start)
  return () => void observers.delete(observer);
}
export const hasPendingAuthCallback = () => pending !== null;
export function onAuthCallback(listener: (cb: AuthCallback) => void): () => void {
  listeners.add(listener);
  if (pending) {
    const cb = pending;
    pending = null;
    listener(cb);
  }
  return () => void listeners.delete(listener);
}
