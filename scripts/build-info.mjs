// Build identification (round 9). Used by vite.config.ts and by CI (`node scripts/build-info.mjs`).
// Never invents a commit: it comes from VITE_BUILD_COMMIT / GITHUB_SHA, or from `git` when the
// checkout has a .git folder; otherwise it is null and the app says "not available".
// The source fingerprint is a hash of every file under src/ – identical code gives the same value
// anywhere (CI, a laptop, AI Studio), so it identifies the code a preview runs even without git.
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

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

if (import.meta.url === `file://${process.argv[1]}`) {
  const info = buildInfo();
  console.log(JSON.stringify(info, null, 2));
}
