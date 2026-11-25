// Release-distribution gate (round 10, S10-05). NOT part of `verify` / CI: internal builds are
// allowed. It FAILS while any blocker for store distribution is open, so a store build cannot be
// called ready by accident. Passing it is not a legal or halachic approval – it only reports.
import { existsSync, readFileSync } from 'node:fs';

const blockers = [];
/** Minimal CSV parser (quoted fields, commas and doubled quotes inside quotes). */
const csv = (path) => {
  const text = readFileSync(path, 'utf8');
  const rows = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [head, ...body] = rows;
  return body.filter((r) => r.length > 1).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
};

// Owner decisions required before any store build.
const REQUIRED = {
  D01: 'developer account / operator',
  D02: 'audience age',
  D03: 'countries and languages',
  D07: 'Hebcal licensing (GPL/LGPL)',
  D08: 'content reviewer and sources',
  D11: 'encryption, retention, backups',
  D13: 'app name and bundle ids',
  D14: 'minimum OS and devices',
};
for (const row of csv('docs/mobile-readiness/decision_log.csv')) {
  if (REQUIRED[row.decision_id] && !/^APPROVED/.test(row.status)) {
    blockers.push(`${row.decision_id} ${REQUIRED[row.decision_id]}: ${row.status}`);
  }
}

// Gate G1 (real devices) must be PASS.
const gates = readFileSync('docs/mobile-readiness/acceptance-gates.md', 'utf8');
const g1 = gates.split('\n').find((l) => l.startsWith('| G1'));
if (!g1 || !/\*\*PASS\*\*/.test(g1)) blockers.push('G1 real-device evidence: not PASS');

// Known license exceptions in production dependencies.
const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
for (const [path, meta] of Object.entries(lock.packages ?? {})) {
  if (!path || meta.dev) continue;
  const lic = String(meta.license ?? '');
  // A dual licence with a permissive option (e.g. "MIT OR GPL-3.0") is usable under that option.
  const permissiveOption = / OR /.test(lic) && /\b(MIT|Apache-2\.0|BSD|ISC)\b/.test(lic);
  if (/GPL/.test(lic) && !permissiveOption) blockers.push(`license ${path.replace('node_modules/', '')}@${meta.version}: ${meta.license}`);
}

// Store metadata.
if (!existsSync('ios/App/App/PrivacyInfo.xcprivacy')) blockers.push('iOS app privacy manifest (PrivacyInfo.xcprivacy) missing');
const appId = readFileSync('capacitor.config.ts', 'utf8').match(/appId:\s*'([^']+)'/)?.[1];
if (appId === 'com.mitzvotplus.app') blockers.push(`app id ${appId} is a development placeholder (D13)`);
const pkgVersion = JSON.parse(readFileSync('package.json', 'utf8')).version;
const androidVersion = readFileSync('android/app/build.gradle', 'utf8').match(/versionName "([^"]+)"/)?.[1];
const iosVersion = readFileSync('ios/App/App.xcodeproj/project.pbxproj', 'utf8').match(/MARKETING_VERSION = ([^;]+);/)?.[1];
if (new Set([pkgVersion, androidVersion, iosVersion]).size > 1) {
  blockers.push(`version source not unified: package.json ${pkgVersion}, Android ${androidVersion}, iOS ${iosVersion}`);
}
if (/TARGETED_DEVICE_FAMILY = "1,2"/.test(readFileSync('ios/App/App.xcodeproj/project.pbxproj', 'utf8'))) {
  blockers.push('iPad is targeted (TARGETED_DEVICE_FAMILY 1,2) – needs iPad evidence or an iPhone-only decision');
}

if (blockers.length) {
  console.log(`Distribution gate: BLOCKED (${blockers.length})`);
  for (const b of blockers) console.log(`  - ${b}`);
  process.exit(1);
}
console.log('Distribution gate: no open blocker found (still requires owner sign-off).');
