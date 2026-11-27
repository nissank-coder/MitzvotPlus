// Content-Security-Policy of a build (round 12.5). Production: only the app itself and the Sefaria
// text API. Development / staging builds that talk to a backend add EXACTLY that backend's origin –
// no wildcard. A staging backend must be https; plain http is accepted only for a local machine.
export const PRODUCTION_CONNECT = ["'self'", 'https://www.sefaria.org'];

export function backendOrigin(env) {
  const kind = env.VITE_BACKEND_ENV;
  const url = env.VITE_SUPABASE_URL;
  // The public key: VITE_SUPABASE_PUBLISHABLE_KEY (newer projects) or VITE_SUPABASE_ANON_KEY.
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY;
  if ((kind !== 'development' && kind !== 'staging') || !url || !key) return null;
  if (/^sb_secret_/.test(key)) throw new Error('a secret key must never be in a VITE_ variable – use the publishable key');
  let u;
  try {
    u = new URL(url);
  } catch {
    throw new Error(`VITE_SUPABASE_URL is not a URL: ${url}`);
  }
  const local = u.hostname === '127.0.0.1' || u.hostname === 'localhost';
  // http only for a backend on this machine: development, or a local staging rehearsal (tests).
  const localHttpOk = u.protocol === 'http:' && local && (kind === 'development' || process.env.MITZVOT_LOCAL_STAGING === '1');
  if (u.protocol !== 'https:' && !localHttpOk) {
    throw new Error(`backend for ${kind} must use https (got ${u.origin})`);
  }
  if (u.hostname.includes('*')) throw new Error('wildcards are not allowed');
  return u.origin;
}

export function cspFor(env) {
  const origin = backendOrigin(env);
  const connect = origin ? [...PRODUCTION_CONNECT, origin] : PRODUCTION_CONNECT;
  // Web staging builds with the browser SQLite (sql.js) need WebAssembly; nothing else ever does.
  const wasm = origin && env.VITE_WEB_SQLITE === 'true' ? " 'wasm-unsafe-eval'" : '';
  return [
    "default-src 'self'",
    `script-src 'self'${wasm}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self' data:",
    `connect-src ${connect.join(' ')}`,
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
}
