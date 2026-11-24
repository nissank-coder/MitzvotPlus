#!/usr/bin/env node
/**
 * License check of production dependencies (package-lock.json).
 * - allowed: permissive licenses that may ship inside the app
 * - known exceptions: recorded open decisions (they print a warning, they do not pass silently)
 * - anything else (new or unknown license) fails the build
 */
import { readFileSync } from 'node:fs';

const ALLOWED = new Set(['MIT', 'ISC', 'BSD-2-Clause', 'BSD-3-Clause', '0BSD', 'Apache-2.0', 'OFL-1.1', 'CC0-1.0', 'Unlicense', 'BlueOak-1.0.0', 'Zlib']);

/** Simple SPDX expressions: "A OR B" passes if one option is allowed (we choose it); "A AND B" needs all. */
function allowed(expr) {
  const e = expr.replace(/[()]/g, '').trim();
  if (/ OR /.test(e)) return e.split(/ OR /).some((x) => allowed(x));
  if (/ AND /.test(e)) return e.split(/ AND /).every((x) => allowed(x));
  return ALLOWED.has(e);
}
/** Open decision D07 (docs/mobile-readiness/license-inventory.md): blocks store distribution until resolved. */
const KNOWN_EXCEPTIONS = { '@hebcal/core': 'GPL-2.0', '@hebcal/hdate': 'GPL-2.0', '@hebcal/noaa': 'LGPL-2.1' };

const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
const failures = [];
const warnings = [];
let count = 0;
for (const [path, meta] of Object.entries(lock.packages)) {
  if (!path || meta.dev || meta.devOptional) continue;
  const name = path.split('node_modules/').pop();
  let license = meta.license;
  if (!license) {
    try {
      license = JSON.parse(readFileSync(`${path}/package.json`, 'utf8')).license;
    } catch {
      license = undefined;
    }
  }
  count += 1;
  if (license && allowed(license)) continue;
  if (KNOWN_EXCEPTIONS[name] && KNOWN_EXCEPTIONS[name] === license) {
    warnings.push(`${name}@${meta.version}: ${license} (open decision D07 – blocks store distribution)`);
    continue;
  }
  failures.push(`${name}@${meta.version}: ${license ?? 'UNKNOWN'}`);
}
for (const w of warnings) console.warn(`WARNING ${w}`);
if (failures.length) {
  console.error('License check FAILED – not on the allowlist:\n- ' + failures.join('\n- '));
  process.exit(1);
}
console.log(`License check passed for ${count} production packages (${warnings.length} known exceptions).`);
