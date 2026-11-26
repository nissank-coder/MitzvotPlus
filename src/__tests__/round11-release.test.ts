import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

/** Round 11 §5 – the distribution gate distinguishes build kinds and blocks while anything is open. */
const run = (...args: string[]) => {
  try {
    return { code: 0, out: execFileSync('node', ['scripts/ci/check-distribution.mjs', ...args], { encoding: 'utf8' }) };
  } catch (e) {
    const err = e as { status: number; stdout: string };
    return { code: err.status, out: err.stdout };
  }
};

describe('distribution gate', () => {
  it('debug builds are never blocked', () => {
    expect(run('--kind', 'debug').code).toBe(0);
  });
  it('release is blocked now, lists every required decision, gate and device evidence', () => {
    const r = run('--kind', 'release', '--commit', 'abcdef1');
    expect(r.code).toBe(1);
    for (const id of ['D01', 'D04', 'D06', 'D07', 'D11', 'D14']) expect(r.out).toContain(id);
    for (const g of ['G1', 'G3', 'G6']) expect(r.out).toContain(`${g}:`);
    expect(r.out).toMatch(/no PASS device evidence on a real android for build fp=[0-9a-f]{16};cfg=release\+backend=none\+dbenc=off/);
  });
  it('a store build is identified by its release fingerprint and configuration (round 12.5)', () => {
    expect(run('--kind', 'beta').out).toMatch(/Distribution gate \(beta, fp=[0-9a-f]{16};cfg=beta\+backend=none\+dbenc=off\)/);
  });
  it('versions come from one source', () => {
    expect(execFileSync('node', ['scripts/ci/check-versions.mjs'], { encoding: 'utf8' })).toContain('Version check passed');
  });
});
