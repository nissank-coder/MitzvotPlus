import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ACTIONS } from '../data/actions';
import { isRestDayKey } from '../lib/jewishCalendar';
import { scoreLogs, tehillimChaptersRead } from '../lib/metrics';
import { computeDerived } from '../store/derived';
import { createFreshState, reducer } from '../store/state';
import type { ActivityLog, AppState } from '../types';

/**
 * Round 8 (docs/mobile-readiness/round-8/03_ACCEPTANCE_HE.md) – regressions for findings
 * A01–A07, A12 and A16. Each one failed on main c5b1d61 (see evidence/round-8/before.txt).
 */
const NOW = Date.UTC(2026, 10, 23, 12); // Monday 23.11.2026
const DAY = 86_400_000;
const TODAY = '2026-11-23';
type AddPayload = Extract<Parameters<typeof reducer>[1], { type: 'addAction' }>['payload'];
const add = (s: AppState, p: Partial<AddPayload> & { key: AddPayload['key'] }) =>
  reducer(s, { type: 'addAction', payload: { now: NOW, dateKey: TODAY, ...p } });
const d = (s: AppState, today = TODAY) => computeDerived(s, today);
const bundle = (s: AppState, sourceLogId: string, count: number) =>
  reducer(s, { type: 'setBlessingBundle', payload: { sourceLogId, count, now: NOW } });
const blessings = (s: AppState) => s.logs.filter((l) => l.kind === 'blessing').length;

describe('A01 – consistency starts when the user starts; today is neutral', () => {
  it('a new user with one action today has no failed days', () => {
    const s = add(createFreshState(NOW), { key: 'chesed' });
    expect(d(s).consistencyDays).toEqual({ goalDays: 0, eligibleDays: 0 });
    expect(d(s).consistency).toBeNull(); // "no baseline yet", not 0%
  });

  it('today counts once its goal is met', () => {
    let s = reducer(createFreshState(NOW), { type: 'updateGoals', payload: { dailyGoal: 1 }, dateKey: TODAY });
    s = add(s, { key: 'chesed' });
    expect(d(s).consistencyDays).toEqual({ goalDays: 1, eligibleDays: 1 });
    expect(d(s).consistency).toBe(100);
  });

  it('goal streak and logging streak are separate measures', () => {
    let s = createFreshState(NOW - 3 * DAY);
    s = reducer(s, { type: 'updateGoals', payload: { dailyGoal: 2 }, dateKey: '0000-00-00' });
    for (const k of ['2026-11-20', '2026-11-22', TODAY]) s = add(s, { key: 'chesed', dateKey: k });
    s = add(s, { key: 'charity', dateKey: '2026-11-22' });
    s = add(s, { key: 'charity', dateKey: TODAY });
    const r = d(s);
    expect(r.activityStreak).toBe(3); // 20, (Shabbat 21), 22, 23
    expect(r.goalStreak).toBe(2); // 22 and 23 met the goal of 2; 20 did not
  });
});

describe('A02 – score-2 is frozen; the live action table cannot rewrite history', () => {
  it('changing a value in ACTIONS does not change recorded points', () => {
    const s = add(createFreshState(NOW), { key: 'chesed' });
    const before = d(s).todayPoints;
    (ACTIONS.chesed as { points: number }).points += 100;
    try {
      expect(d(s).todayPoints).toBe(before);
    } finally {
      (ACTIONS.chesed as { points: number }).points -= 100;
    }
  });

  it('an unknown rules version scores 0 and is flagged, never guessed', () => {
    const log = add(createFreshState(NOW), { key: 'chesed' }).logs[0]!;
    const sheet = scoreLogs([{ ...log, rules: 'score-99' as never }], []);
    expect(sheet.total).toBe(0);
    expect(sheet.unknownRules).toEqual([log.id]);
  });

  it('12 blessings = 1 action, 12 blessings, 24 points; 100 = 230 (score-2 unchanged)', () => {
    let s = createFreshState(NOW);
    for (let i = 0; i < 12; i += 1) s = add(s, { key: 'blessing', category: 'other', now: NOW + i });
    expect([d(s).todayCount, d(s).blessingTotal, d(s).todayPoints]).toEqual([1, 12, 24]);
    for (let i = 12; i < 100; i += 1) s = add(s, { key: 'blessing', category: 'other', now: NOW + i });
    expect(d(s).todayPoints).toBe(230);
  });
});

describe('A03 / A12 / A13 – blessing bundles', () => {
  it('only for a prayer or Birkat Hamazon, never for other actions or another bundle', () => {
    let s = add(createFreshState(NOW), { key: 'chesed' });
    expect(bundle(s, s.logs[0]!.id, 30)).toBe(s);
    s = add(createFreshState(NOW), { key: 'mincha' });
    s = bundle(s, s.logs[0]!.id, 2);
    const child = s.logs.find((l) => l.bundleOf)!;
    expect(bundle(s, child.id, 5)).toBe(s);
    expect(bundle(s, 'missing', 5)).toBe(s);
  });

  it.each([NaN, Infinity, 1.5, -1, 31])('rejects %s', (n) => {
    const s = add(createFreshState(NOW), { key: 'shacharit' });
    expect(bundle(s, s.logs[0]!.id, n)).toBe(s);
  });

  it('0 → 18 → 18 (no change) → 19 → source removed → 0, stable ids, no orphans', () => {
    let s = add(createFreshState(NOW), { key: 'shacharit' });
    const src = s.logs[0]!.id;
    expect(blessings(s)).toBe(0);
    s = bundle(s, src, 18);
    expect(blessings(s)).toBe(18);
    const ids = s.logs.filter((l) => l.bundleOf).map((l) => l.id).sort();
    const same = bundle(s, src, 18);
    expect(same).toBe(s); // idempotent: nothing rewritten
    s = bundle(s, src, 19);
    expect(blessings(s)).toBe(19);
    expect(ids.every((id) => s.logs.some((l) => l.id === id))).toBe(true); // kept rows keep their ids
    s = reducer(s, { type: 'removeLog', payload: { id: src } });
    expect(s.logs).toHaveLength(0);
  });
});

describe('A04 / A10 / A11 – one identity per action', () => {
  it('the same prayer with an arbitrary refId is still one entry', () => {
    let s = add(createFreshState(NOW), { key: 'shacharit' });
    s = add(s, { key: 'shacharit', refId: 'from-siddur' });
    expect(s.logs).toHaveLength(1);
  });

  it('the same Dvar Torah item twice a day = once; two items = two entries, points once; bad id rejected', () => {
    let s = add(createFreshState(NOW), { key: 'dailyTorah', content: { id: 'dvar-torah/a', version: '1' } });
    s = add(s, { key: 'dailyTorah', content: { id: 'dvar-torah/a', version: '1' } });
    expect(s.logs).toHaveLength(1);
    s = add(s, { key: 'dailyTorah', content: { id: 'dvar-torah/b', version: '1' } });
    expect(s.logs).toHaveLength(2);
    expect(d(s).todayPoints).toBe(10);
    expect(add(createFreshState(NOW), { key: 'dailyTorah', content: { id: 'Bad Id!', version: '1' } }).logs).toHaveLength(0);
  });

  it('learning tracks stay per item (refId kept)', () => {
    let s = add(createFreshState(NOW), { key: 'learningTrack', refId: 'mishna:2026-11-23' });
    s = add(s, { key: 'learningTrack', refId: 'daf:2026-11-23' });
    expect(s.logs).toHaveLength(2);
  });
});

describe('A07 / A15 – on time only with evidence', () => {
  it('a back-filled prayer is never on time, even if asked', () => {
    const s = add(createFreshState(NOW), { key: 'shacharit', onTime: true, backfill: true, dateKey: '2026-11-21' });
    expect(s.logs[0]!.onTime).toBeUndefined();
    expect(d(s, TODAY).todayPoints).toBe(0);
    expect(scoreLogs(s.logs, s.goalHistory).total).toBe(25);
  });

  it('the plan does not let "קריאת שמע בזמנה" be recorded after its time, and shows engine points', () => {
    const src = readFileSync('src/components/TodayPlanCard.tsx', 'utf8');
    expect(src).toContain("TIME_BOUND = new Set(['shema'])");
    expect(src).toContain('previewPoints(item.key');
    expect(src).not.toMatch(/def\.points \+/);
  });
});

describe('A06 / A08 / A09 – periods keep their settings', () => {
  it('a weekly goal changed mid-week applies from next week', () => {
    let s = createFreshState(NOW);
    s = reducer(s, { type: 'updateGoals', payload: { weeklyGoal: 10 }, dateKey: TODAY });
    expect(d(s).weeklyGoal).toBe(60); // week of 22.11 started with 60
    expect(d(s, '2026-11-29').weeklyGoal).toBe(10);
  });

  it('a city change does not rewrite past rest days', async () => {
    const { restRuleFor } = await import('../lib/restRule');
    // Sukkot 5787: 26.9.2026 (Shabbat). 27.9 is Yom Tov only outside Israel.
    expect(isRestDayKey('2026-09-27', false)).toBe(true);
    expect(isRestDayKey('2026-09-27', true)).toBe(false);
    let s = reducer(createFreshState(NOW), { type: 'updateProfile', payload: { cityId: 'jerusalem' }, dateKey: '0000-00-00' });
    s = reducer(s, { type: 'updateProfile', payload: { cityId: 'new-york' }, dateKey: '2026-10-01' });
    const rest = restRuleFor(s.locationHistory, s.profile.cityId);
    expect(rest('2026-09-27')).toBe(false); // was in Jerusalem then
    expect(restRuleFor([{ from: '0000-00-00', cityId: 'new-york' }], 'new-york')('2026-09-27')).toBe(true);
  });
});

describe('A05 / A17 – learning progress without a Dvar Torah', () => {
  it('the learning streak counts any learning and is always shown', () => {
    let s = add(createFreshState(NOW), { key: 'torahStudy', dateKey: '2026-11-22' });
    s = add(s, { key: 'learningTrack', refId: 'mishna:x' });
    expect(d(s).torahStreak).toBe(2);
    const src = readFileSync('src/screens/GoalsScreen.tsx', 'utf8');
    expect(src).not.toContain("b.key !== 'torah' || DVAR_TORAH_AVAILABLE");
    expect(src).not.toMatch(/\{DVAR_TORAH_AVAILABLE \? \(\s*<SummaryCard/);
  });
});

describe('A16 – Tehillim ranges are bounded', () => {
  it.each(['tehillim:0-5', 'tehillim:149-151', 'tehillim:1-99999999', 'tehillim:119:1-500', 'tehillim:5-3', 'tehillim:x'])(
    'rejects %s',
    (refId) => {
      expect(add(createFreshState(NOW), { key: 'tehillim', refId }).logs).toHaveLength(0);
    },
  );

  it('overlapping ranges count each chapter once', () => {
    let s = add(createFreshState(NOW), { key: 'tehillim', refId: 'tehillim:1-10' });
    s = add(s, { key: 'tehillim', refId: 'tehillim:5-15', dateKey: '2026-11-24' });
    const logs: ActivityLog[] = s.logs;
    expect(tehillimChaptersRead(logs, () => 10)).toHaveLength(15);
  });
});

describe('A18 – iOS CI does not swallow failures', () => {
  it('no "|| true" after xcodebuild, explicit alive assertion', () => {
    const yml = readFileSync('.github/workflows/ios.yml', 'utf8');
    const script = readFileSync('scripts/ci/ios-sim-smoke.sh', 'utf8');
    expect(yml).toContain('scripts/ci/ios-sim-smoke.sh');
    expect(script).not.toMatch(/xcodebuild[^\n]*\|\|\s*true/);
    expect(script).toMatch(/set -euo pipefail/);
    expect(script).toMatch(/exit 1/);
  });
});
