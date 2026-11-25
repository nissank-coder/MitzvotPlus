// Distribution gate (round 10 S10-05, hardened in round 11 §5).
//   node scripts/ci/check-distribution.mjs --kind debug|beta|release [--commit <sha>]
// debug   – internal builds: never blocked (reports only).
// beta    – TestFlight / Play testing: needs the decisions and gates a tester build depends on.
// release – store: every required decision APPROVED, gates G0–G6 PASS, device evidence for THIS
//           commit, licences, privacy manifest, versions, app id, device scope.
// It is a mandatory step of .github/workflows/release.yml; regular CI does not run it.
// Passing it is not a legal, halachic or store approval – it only reports what is open.
import { existsSync, readFileSync } from 'node:fs';

const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => (a.startsWith('--') ? [a.slice(2), all[i + 1]] : [])).filter((x) => x.length));
const kind = args.kind ?? 'release';
const commit = (args.commit ?? '').slice(0, 7);
if (!['debug', 'beta', 'release'].includes(kind)) {
  console.error(`unknown --kind ${kind}`);
  process.exit(2);
}

function csv(path) {
  const text = readFileSync(path, 'utf8');
  const rows = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i += 1; } else if (c === '"') q = false; else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [head, ...body] = rows;
  return body.filter((r) => r.length > 1).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}

const blockers = [];

// 1. Decisions: every required id must EXIST and be APPROVED (a missing row is a blocker too).
const NEEDED = {
  beta: ['D01', 'D02', 'D07', 'D11', 'D13'],
  release: ['D01', 'D02', 'D03', 'D04', 'D05', 'D06', 'D07', 'D08', 'D09', 'D10', 'D11', 'D12', 'D13', 'D14'],
};
const decisions = new Map(csv('docs/mobile-readiness/decision_log.csv').map((r) => [r.decision_id, r]));
for (const id of NEEDED[kind] ?? []) {
  const row = decisions.get(id);
  if (!row) blockers.push(`${id}: missing from decision_log.csv`);
  else if (row.status !== 'APPROVED') blockers.push(`${id} (${row.question}): ${row.status}`);
}

// 2. Gates.
const GATES = { beta: ['G0', 'G1'], release: ['G0', 'G1', 'G2', 'G3', 'G4', 'G5', 'G6'] };
const gateLines = readFileSync('docs/mobile-readiness/acceptance-gates.md', 'utf8').split('\n');
for (const g of GATES[kind] ?? []) {
  const line = gateLines.find((l) => l.startsWith(`| ${g}`));
  if (!line) blockers.push(`${g}: missing from acceptance-gates.md`);
  else if (!/\|\s*\*\*PASS\*\*/.test(line) && !/\|\s*PASS\b/.test(line.split('|')[2] ?? '')) blockers.push(`${g}: not PASS`);
}

// 3. Device evidence for this exact commit (Android and iPhone).
if (kind !== 'debug') {
  if (!commit) blockers.push('--commit <sha> is required to tie evidence to the build');
  else {
    const ev = csv('docs/mobile-readiness/test_evidence.csv').filter((r) => r.status === 'PASS' && (r.commit ?? '').includes(commit));
    for (const platform of [/android/i, /iphone|ios/i]) {
      if (!ev.some((r) => platform.test(r.device_model) && !/simulator|emulator|chromium|node|linux/i.test(r.device_model))) {
        blockers.push(`no PASS device evidence on a real ${platform.source.split('|')[0]} for commit ${commit}`);
      }
    }
  }
}

// 4. Licences in production dependencies (dual licences with a permissive option are usable).
if (kind !== 'debug') {
  const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
  for (const [path, meta] of Object.entries(lock.packages ?? {})) {
    if (!path || meta.dev) continue;
    const lic = String(meta.license ?? '');
    const permissiveOption = / OR /.test(lic) && /\b(MIT|Apache-2\.0|BSD|ISC)\b/.test(lic);
    if (/GPL/.test(lic) && !permissiveOption) blockers.push(`licence ${path.replace('node_modules/', '')}@${meta.version}: ${lic} (D07)`);
  }
}

// 5. Store metadata.
if (kind !== 'debug') {
  if (!existsSync('ios/App/App/PrivacyInfo.xcprivacy')) blockers.push('iOS privacy manifest missing');
  else if (!readFileSync('ios/App/App.xcodeproj/project.pbxproj', 'utf8').includes('PrivacyInfo.xcprivacy in Resources')) blockers.push('iOS privacy manifest not in the app target');
  const appId = readFileSync('capacitor.config.ts', 'utf8').match(/appId:\s*'([^']+)'/)?.[1];
  if (appId === 'com.mitzvotplus.app') blockers.push(`app id ${appId} is a development placeholder (D13)`);
  const pbx = readFileSync('ios/App/App.xcodeproj/project.pbxproj', 'utf8');
  if (/TARGETED_DEVICE_FAMILY = "1,2"/.test(pbx) && !decisions.get('D14')?.approved_value?.match(/ipad/i)) {
    blockers.push('iPad is targeted (1,2) without an approved iPad decision (D14)');
  }
}

console.log(`Distribution gate (${kind}${commit ? `, ${commit}` : ''}): ${blockers.length ? `BLOCKED (${blockers.length})` : 'no open blocker found – owner sign-off still required'}`);
for (const b of blockers) console.log(`  - ${b}`);
process.exit(kind === 'debug' || blockers.length === 0 ? 0 : 1);
