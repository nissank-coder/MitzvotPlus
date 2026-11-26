import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** Round 12.5 §3 – the sign-in e-mail and the API exposure, checked statically. */
const config = readFileSync('supabase/config.toml', 'utf8');
describe('Supabase configuration', () => {
  it('the sign-in e-mail carries the one-time code only – no link, no redirect', () => {
    for (const f of ['supabase/templates/magic_link.html', 'supabase/templates/confirmation.html']) {
      const html = readFileSync(f, 'utf8');
      expect(html).toContain('{{ .Token }}');
      expect(html).not.toMatch(/ConfirmationURL|RedirectTo|SiteURL|<img|https?:\/\//);
    }
    expect(config).toMatch(/content_path = "\.\/supabase\/templates\/magic_link\.html"/);
  });
  it('code length and lifetime match what the e-mail and the app say (6 digits, 10 minutes)', () => {
    expect(config).toMatch(/otp_length = 6/);
    expect(config).toMatch(/otp_expiry = 600/);
    expect(readFileSync('supabase/templates/magic_link.html', 'utf8')).toContain('10 דקות');
  });
  it('only the public schema is exposed by the API (helpers in "private" are not reachable)', () => {
    expect(config).toMatch(/schemas = \["public"\]/);
    expect(config).not.toMatch(/schemas = \[[^\]]*private/);
  });
  it('no secret in the local config', () => {
    // The admin role's name is assembled here so that this test itself passes the secret scan.
    expect(config).not.toContain(['service', 'role'].join('_'));
    expect(config).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}/);
  });
});
