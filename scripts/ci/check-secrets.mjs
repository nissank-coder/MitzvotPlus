#!/usr/bin/env node
/**
 * Basic secret scan of tracked files. Fails on private keys, common API-key formats, signing
 * material or service-role keys. Not a replacement for GitHub secret scanning – a safety net.
 */
import { execSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';

const files = execSync('git ls-files', { encoding: 'utf8' }).split('\n').filter(Boolean);
const forbiddenFiles = [/\.jks$/, /\.keystore$/, /\.p12$/, /\.p8$/, /\.mobileprovision$/, /(^|\/)google-services\.json$/, /(^|\/)GoogleService-Info\.plist$/, /(^|\/)\.env(?!\.example$)(\..+)?$/];
const patterns = [
  [/-----BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/, 'private key'],
  [/AKIA[0-9A-Z]{16}/, 'AWS access key'],
  [/AIza[0-9A-Za-z_-]{35}/, 'Google API key'],
  [/gh[pousr]_[A-Za-z0-9]{36,}/, 'GitHub token'],
  [/github_pat_[A-Za-z0-9_]{40,}/, 'GitHub fine-grained token'],
  [/xox[abprs]-[A-Za-z0-9-]{10,}/, 'Slack token'],
  [/sk_live_[0-9a-zA-Z]{20,}/, 'Stripe live key'],
  [/service_role/i, 'Supabase service-role reference'],
  // Any JWT-shaped value (Supabase anon / service keys, session tokens) – everywhere, supabase/ included.
  [/eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}/, 'JWT / API key'],
];
/** The database folder names the standard Supabase role in SQL (no key): only the word is allowed there. */
const allowWordIn = (what, file) => what === 'Supabase service-role reference' && /^supabase\/.+\.sql$/.test(file);
const skip = [/^package-lock\.json$/, /^src\/content\/packs\//, /^docs\/mobile-readiness\/evidence\//, /\.(png|jpg|jpeg|pdf|woff2?|jar)$/, /^scripts\/ci\/check-secrets\.mjs$/, /^docs\//];

const problems = [];
for (const f of files) {
  if (forbiddenFiles.some((r) => r.test(f))) problems.push(`forbidden file committed: ${f}`);
  if (skip.some((r) => r.test(f))) continue;
  let text;
  try {
    if (statSync(f).size > 2_000_000) continue;
    text = readFileSync(f, 'utf8');
  } catch {
    continue;
  }
  for (const [re, what] of patterns) if (re.test(text) && !allowWordIn(what, f)) problems.push(`${what} in ${f}`);
}
if (problems.length) {
  console.error('Secret scan FAILED:\n- ' + problems.join('\n- '));
  process.exit(1);
}
console.log(`Secret scan passed (${files.length} tracked files).`);
