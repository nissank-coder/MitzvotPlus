import { describe, expect, it } from 'vitest';
import { authRedirect, enabledProviders, NATIVE_AUTH_CALLBACK, onAuthCallback, deliverAuthCallback, parseAuthCallback } from '../backend/oauth';

/** Round 13 (review §6) – Google / Apple next to guest use: the pure parts of the flow. */
describe('sign-in return links', () => {
  it('only the app\'s own return link (or the web page marked as a return) is a sign-in return', () => {
    expect(NATIVE_AUTH_CALLBACK).toBe('mitzvotplus://auth/callback');
    expect(parseAuthCallback('mitzvotplus://auth/callback?code=abcdef1234')).toEqual({ kind: 'code', code: 'abcdef1234' });
    expect(parseAuthCallback('mitzvotplus://open/blessings?code=abcdef1234')).toBeNull();
    expect(parseAuthCallback('https://evil.example/auth/callback?code=abcdef1234')).toBeNull();
    expect(parseAuthCallback('http://localhost:3000/?auth=callback&code=abcdef1234', 'http://localhost:3000')).toEqual({ kind: 'code', code: 'abcdef1234' });
    expect(parseAuthCallback('http://localhost:3000/?code=abcdef1234', 'http://localhost:3000')).toBeNull();
    expect(parseAuthCallback('not a url')).toBeNull();
  });
  it('a cancellation at the provider is an error, never a sign-in; a malformed code is ignored', () => {
    expect(parseAuthCallback('mitzvotplus://auth/callback?error=access_denied&error_description=cancelled')).toEqual({ kind: 'error', error: 'access_denied', description: 'cancelled' });
    expect(parseAuthCallback('mitzvotplus://auth/callback#error=server_error')).toMatchObject({ kind: 'error', error: 'server_error' });
    expect(parseAuthCallback('mitzvotplus://auth/callback?code=<script>')).toBeNull();
  });
  it('the return address: the app link on a phone, the page itself on the web', () => {
    expect(authRedirect(true, 'http://localhost:3000')).toBe('mitzvotplus://auth/callback');
    expect(authRedirect(false, 'http://localhost:3000')).toBe('http://localhost:3000/?auth=callback');
  });
  it('providers are shown only when listed (configured in the project first)', () => {
    expect(enabledProviders(undefined)).toEqual([]);
    expect(enabledProviders('apple, Google,facebook')).toEqual(['google', 'apple']);
  });
  it('a return that arrives before the account section is on screen (cold start) waits for it, once', () => {
    deliverAuthCallback({ kind: 'code', code: 'cold-start-1' });
    const got: string[] = [];
    const off = onAuthCallback((cb) => got.push(cb.kind === 'code' ? cb.code : cb.error));
    deliverAuthCallback({ kind: 'code', code: 'while-open-2' });
    off();
    const again: string[] = [];
    onAuthCallback((cb) => again.push(cb.kind))();
    expect(got).toEqual(['cold-start-1', 'while-open-2']);
    expect(again).toEqual([]);
  });
});
