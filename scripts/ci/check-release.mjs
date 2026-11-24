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
  ['להתקשר למישהו שלא דיברת איתו', 'draft practical content text'],
  ['TEST_ONLY', 'TEST_ONLY content item'],
  ['test-placeholder', 'placeholder Dvar Torah id'],
  ['נועם לוי', 'mock community friend'],
  ['הטבת השבוע', 'mock weekly-benefit card'],
  ['רק להציץ', 'demo-data loader on onboarding'],
  ['טעינת נתוני הדגמה', 'demo-data loader in profile'],
  ['fonts.googleapis.com', 'remote font (privacy/offline)'],
];

const problems = [];
for (const [needle, why] of forbidden) {
  for (const [f, t] of text) if (t.includes(needle)) problems.push(`${why}: "${needle}" in ${f}`);
}
const html = readFileSync(join(DIST, 'index.html'), 'utf8');
if (!html.includes('Content-Security-Policy')) problems.push('index.html has no Content-Security-Policy');

if (problems.length) {
  console.error('Release check FAILED:\n- ' + problems.join('\n- '));
  process.exit(1);
}
console.log(`Release check passed (${files.length} files scanned).`);
