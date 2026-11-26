#!/usr/bin/env node
/**
 * Release check on the production build (dist/). Fails if anything that must never ship is present:
 * TEST_ONLY content, mock community data, demo loaders, a missing CSP, or remote fonts.
 * Run after `npm run build`.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'dist';
const files = [];
const walk = (d) => readdirSync(d).forEach((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : files.push(join(d, f))));
walk(DIST);
const text = files.filter((f) => /\.(js|html|css|json)$/.test(f)).map((f) => [f, readFileSync(f, 'utf8')]);

const forbidden = [
  ['TEST-ONLY-NOT-FOR-DISTRIBUTION', 'TEST_ONLY content license marker'],
  ['DRAFT-NOT-APPROVED', 'draft practical content (not approved, D08)'],
  ['supabase-js', 'backend client in a production build (sync must stay off in production)'],
  ['submit_events', 'sync code in a production build'],
  ['local-gateway', 'the test stand-in for Supabase in a build'],
  ['__test/mailbox', 'the test stand-in for Supabase in a build'],
  ['להתקשר למישהו שלא דיברת איתו', 'draft practical content text'],
  ['TEST_ONLY', 'TEST_ONLY content item'],
  ['test-placeholder', 'placeholder Dvar Torah id'],
  ['נועם לוי', 'mock community friend'],
  ['הטבת השבוע', 'mock weekly-benefit card'],
  ['רק להציץ', 'demo-data loader on onboarding'],
  ['טעינת נתוני הדגמה', 'demo-data loader in profile'],
  ['fonts.googleapis.com', 'remote font (privacy/offline)'],
  // Round 14: content packs not approved for distribution (the nusach Ashkenaz siddur, pending the
  // owner's approval of the edition and a rabbinic check) – internal builds only.
  ['NOT_APPROVED', 'content pack not approved for distribution'],
  ['siddur-ashkenaz', 'nusach Ashkenaz pack (internal review only)'],
  ['Daat Siddur Ashkenaz', 'nusach Ashkenaz pack text (internal review only)'],
];

const problems = [];
for (const [needle, why] of forbidden) {
  for (const [f, t] of text) if (t.includes(needle)) problems.push(`${why}: "${needle}" in ${f}`);
}
const html = readFileSync(join(DIST, 'index.html'), 'utf8');
if (!html.includes('Content-Security-Policy')) problems.push('index.html has no Content-Security-Policy');
// Round 12.5: a production build may connect only to itself and the Sefaria API – never a backend.
const connect = /connect-src ([^;"]*)/.exec(html)?.[1]?.trim();
if (connect !== "'self' https://www.sefaria.org") problems.push(`production connect-src must be "'self' https://www.sefaria.org" (got: ${connect ?? 'none'})`);

if (problems.length) {
  console.error('Release check FAILED:\n- ' + problems.join('\n- '));
  process.exit(1);
}
console.log(`Release check passed (${files.length} files scanned).`);
