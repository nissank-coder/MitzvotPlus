import { describe, expect, it } from 'vitest';
// @ts-expect-error – plain .mjs shared with vite.config.ts
import { backendOrigin, cspFor } from '../../scripts/csp.mjs';

const connect = (env: Record<string, string>) => /connect-src ([^;]*)/.exec(cspFor(env) as string)![1];

describe('round 12.5 – CSP per environment', () => {
  it('production (no backend variables): only the app and Sefaria', () => {
    expect(connect({})).toBe("'self' https://www.sefaria.org");
    // Variables without a dev/staging environment are ignored (a production build stays closed).
    expect(connect({ VITE_BACKEND_ENV: 'production', VITE_SUPABASE_URL: 'https://x.supabase.co', VITE_SUPABASE_ANON_KEY: 'k' })).toBe("'self' https://www.sefaria.org");
  });
  it('staging: exactly the configured backend origin, no wildcard, no path', () => {
    expect(connect({ VITE_BACKEND_ENV: 'staging', VITE_SUPABASE_URL: 'https://abcd.supabase.co/rest/v1', VITE_SUPABASE_ANON_KEY: 'k' })).toBe("'self' https://www.sefaria.org https://abcd.supabase.co");
    expect(cspFor({ VITE_BACKEND_ENV: 'staging', VITE_SUPABASE_URL: 'https://abcd.supabase.co', VITE_SUPABASE_ANON_KEY: 'k' })).not.toContain('*');
  });
  it('staging over plain http is refused; local http only for development', () => {
    expect(() => backendOrigin({ VITE_BACKEND_ENV: 'staging', VITE_SUPABASE_URL: 'http://abcd.example.com', VITE_SUPABASE_ANON_KEY: 'k' })).toThrow(/https/);
    expect(backendOrigin({ VITE_BACKEND_ENV: 'development', VITE_SUPABASE_URL: 'http://127.0.0.1:54321', VITE_SUPABASE_ANON_KEY: 'k' })).toBe('http://127.0.0.1:54321');
    expect(() => backendOrigin({ VITE_BACKEND_ENV: 'development', VITE_SUPABASE_URL: 'http://evil.example.com', VITE_SUPABASE_ANON_KEY: 'k' })).toThrow();
  });
});
