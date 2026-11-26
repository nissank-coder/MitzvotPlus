// Build identification (round 9). Used by vite.config.ts and by CI (`node scripts/build-info.mjs`).
// Never invents a commit: it comes from VITE_BUILD_COMMIT / GITHUB_SHA, or from `git` when the
// checkout has a .git folder; otherwise it is null and the app says "not available".
// The source fingerprint is a hash of every file under src/ – identical code gives the same value
// anywhere (CI, a laptop, AI Studio), so it identifies the code a preview runs even without git.
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { existsSync } from 'node:fs';

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

export function sourceFingerprint(root = process.cwd()) {
  const src = join(root, 'src');
  const hash = createHash('sha256');
  for (const file of walk(src).filter((f) => !f.includes('__tests__')).sort()) {
    hash.update(relative(root, file).split('\\').join('/'));
    hash.update('\0');
    hash.update(readFileSync(file).toString('utf8').replace(/\r\n/g, '\n'));
    hash.update('\0');
  }
  return hash.digest('hex').slice(0, 12);
}

function gitCommit() {
  try {
    return execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || null;
  } catch {
    return null;
  }
}

/** True when the working tree differs from the commit (the commit alone would not describe the code). */
function gitDirty() {
  try {
    return execSync('git status --porcelain --untracked-files=no -- src', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim().length > 0;
  } catch {
    return false;
  }
}

export function buildInfo(root = process.cwd()) {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const envCommit = process.env.VITE_BUILD_COMMIT || process.env.GITHUB_SHA || null;
  const commit = envCommit || gitCommit();
  return {
    version: pkg.version,
    commit: commit ? commit.slice(0, 40) : null,
    commitSource: envCommit ? 'ci' : commit ? 'git' : null,
    dirty: !envCommit && commit ? gitDirty() : false,
    builtAt: new Date().toISOString(),
    fingerprint: sourceFingerprint(root),
  };
}

/* ------------------------------ Build identity (round 12.5) ------------------------------ */
// Device evidence must belong to the exact build that ships. A commit id cannot do that: adding the
// evidence to the repository makes a new commit. The release fingerprint hashes everything that
// goes INTO the app – web source, native projects, build configuration, dependencies – and nothing
// else (docs, evidence, tests, server migrations), so recording evidence does not change it.
const RELEASE_INPUTS = ['src', 'index.html', 'public', 'assets', 'package.json', 'package-lock.json', 'vite.config.ts', 'tsconfig.json', 'capacitor.config.ts', 'scripts/csp.mjs', 'scripts/build-info.mjs', 'android', 'ios'];
const EXCLUDED = /(^|\/)(__tests__|__integration__|build|\.gradle|Pods|DerivedData|xcuserdata|node_modules)(\/|$)|^android\/app\/src\/main\/assets\/public\/|^ios\/App\/App\/public\/|^android\/capacitor-cordova-android-plugins\/|local\.properties$/;

function trackedFiles(root) {
  try {
    const out = execSync(`git ls-files -z -- ${RELEASE_INPUTS.join(' ')}`, { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
    const files = out.split('\0').filter(Boolean);
    if (files.length) return files;
  } catch {
    // no git: walk the folders
  }
  return RELEASE_INPUTS.flatMap((p) => {
    const abs = join(root, p);
    if (!existsSync(abs)) return [];
    return statSync(abs).isDirectory() ? walk(abs).map((f) => relative(root, f).split('\\').join('/')) : [p];
  });
}

export function releaseFingerprint(root = process.cwd()) {
  const hash = createHash('sha256');
  for (const file of trackedFiles(root).filter((f) => !EXCLUDED.test(f)).sort()) {
    const abs = join(root, file);
    if (!existsSync(abs)) continue; // deleted in the working tree
    hash.update(file);
    hash.update('\0');
    hash.update(readFileSync(abs).toString('utf8').replace(/\r\n/g, '\n'));
    hash.update('\0');
  }
  return hash.digest('hex').slice(0, 16);
}

/** The distribution configuration a build was made with: debug and release builds differ. */
export function buildConfig(kind, env = process.env) {
  const backend = env.VITE_BACKEND_ENV === 'development' || env.VITE_BACKEND_ENV === 'staging' ? env.VITE_BACKEND_ENV : 'none';
  return `${kind}+backend=${backend}+dbenc=${env.VITE_DB_ENCRYPTION === 'true' ? 'on' : 'off'}`;
}

export function artifactHash(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

/** What a tester writes into test_evidence.csv (build_id) for a device test of this build. */
export function buildIdentity(kind, { artifact, env = process.env, root = process.cwd() } = {}) {
  const fp = releaseFingerprint(root);
  const cfg = buildConfig(kind, env);
  const sha = artifact ? artifactHash(artifact) : null;
  return { fingerprint: fp, config: cfg, artifactSha256: sha, buildId: `fp=${fp};cfg=${cfg}${sha ? `;sha256=${sha.slice(0, 16)}` : ''}` };
}

/** Whether an evidence row (test_evidence.csv) belongs to exactly this build. */
export function evidenceMatches(row, identity) {
  const p = Object.fromEntries(String(row.build_id ?? '').split(';').map((x) => x.split('=')).filter((x) => x.length >= 2).map(([k, ...v]) => [k, v.join('=')]));
  return row.status === 'PASS' && p.fp === identity.fingerprint && p.cfg === identity.config && (!identity.artifactSha256 || p.sha256 === identity.artifactSha256.slice(0, 16));
}

// CLI: node scripts/build-info.mjs --identity debug [--artifact app-debug.apk]
if (import.meta.url === `file://${process.argv[1]}`) {
  const a = process.argv.slice(2);
  if (a[0] === '--identity') {
    const at = a.indexOf('--artifact');
    console.log(JSON.stringify(buildIdentity(a[1] ?? 'debug', { artifact: at >= 0 ? a[at + 1] : undefined }), null, 2));
  } else console.log(JSON.stringify(buildInfo(), null, 2));
}
