import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error – plain .mjs shared with CI
import { buildConfig, buildIdentity, evidenceMatches, releaseFingerprint } from '../../scripts/build-info.mjs';

/** Round 12.5 §8 – device evidence is tied to the exact build, not to a commit id. */
function project() {
  const root = mkdtempSync(join(tmpdir(), 'mp-fp-'));
  for (const [f, c] of Object.entries({ 'src/app.ts': 'export {}', 'android/app/build.gradle': 'android {}', 'ios/App/App/Info.plist': '<plist/>', 'package.json': '{"version":"0.1.0"}', 'docs/report.md': '# report', 'docs/mobile-readiness/test_evidence.csv': 'test_id\n' })) {
    mkdirSync(join(root, f, '..'), { recursive: true });
    writeFileSync(join(root, f), c);
  }
  return root;
}

describe('build identity', () => {
  it('recording evidence (docs) does not change the fingerprint; app code and native projects do', () => {
    const root = project();
    const fp = releaseFingerprint(root);
    writeFileSync(join(root, 'docs/mobile-readiness/test_evidence.csv'), 'test_id\nT1\n');
    writeFileSync(join(root, 'docs/report.md'), '# changed');
    expect(releaseFingerprint(root)).toBe(fp);
    writeFileSync(join(root, 'android/app/build.gradle'), 'android { versionCode 2 }');
    const fp2 = releaseFingerprint(root);
    expect(fp2).not.toBe(fp);
    writeFileSync(join(root, 'src/app.ts'), 'export const x = 1');
    expect(releaseFingerprint(root)).not.toBe(fp2);
  });
  it('build outputs and generated copies are not part of the fingerprint', () => {
    const root = project();
    const fp = releaseFingerprint(root);
    mkdirSync(join(root, 'android/app/build/outputs'), { recursive: true });
    writeFileSync(join(root, 'android/app/build/outputs/app.apk'), 'binary');
    mkdirSync(join(root, 'android/app/src/main/assets/public'), { recursive: true });
    writeFileSync(join(root, 'android/app/src/main/assets/public/index.html'), 'copy');
    expect(releaseFingerprint(root)).toBe(fp);
  });
  it('a debug build never counts as evidence for a release; the artifact hash must match when given', () => {
    const root = project();
    const rel = buildIdentity('release', { root, env: {} });
    const dbg = buildIdentity('debug', { root, env: {} });
    expect(buildConfig('release', { VITE_BACKEND_ENV: 'staging' })).toBe('release+backend=staging+dbenc=off');
    const row = (id: string, status = 'PASS') => ({ build_id: id, status });
    expect(evidenceMatches(row(dbg.buildId), rel)).toBe(false);
    expect(evidenceMatches(row(rel.buildId), rel)).toBe(true);
    expect(evidenceMatches(row(rel.buildId, 'FAIL'), rel)).toBe(false);
    writeFileSync(join(root, 'app.apk'), 'apk-bytes');
    const withApk = buildIdentity('release', { root, env: {}, artifact: join(root, 'app.apk') });
    expect(evidenceMatches(row(rel.buildId), withApk)).toBe(false);
    expect(evidenceMatches(row(withApk.buildId), withApk)).toBe(true);
  });
});
